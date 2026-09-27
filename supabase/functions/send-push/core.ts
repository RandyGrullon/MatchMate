/**
 * Lógica de la Edge Function send-push, en TypeScript puro y SIN imports (Deno exige la extensión `.ts` en las
 * rutas y el tsc de la app no la acepta). index.ts solo la conecta con Deno.serve y con webpush.ts. Pruebas:
 * src/lib/pushSend.test.ts (Vitest) y, de punta a punta con la base de verdad, tests/sql/push.test.ts.
 *
 * Cada llamada (la hace pg_net desde el cron cada 15 minutos, o encadenada después de un lote):
 * 1. exige la cabecera `x-cron-secret` igual al secreto CRON_SECRET (el mismo que está en Vault como
 *    'cron_secret'); la función va con verify_jwt = false;
 * 2. toma hasta 50 mensajes de push_outbox (`claim_push_batch`, con la clave secreta = service_role);
 * 3. los manda con Web Push, 10 a la vez; el que ya venció no se manda;
 * 4. avisa cómo le fue a cada uno (`finish_push_batch`): la base borra los teléfonos que ya no existen (404/410),
 *    deja para después los 429/5xx/sin respuesta y, si queda cola, pide el siguiente lote con pg_net.
 * Con `{"ping": true}` además llama a `ping()` por la API REST (ayuda a mantener despierto el proyecto).
 *
 * En el registro solo van números: nunca direcciones de teléfonos, nombres ni textos de los avisos.
 */

export type Outcome = 'sent' | 'gone' | 'expired' | 'retry' | 'failed';
export type Urgency = 'very-low' | 'low' | 'normal' | 'high';

/** Una fila de `claim_push_batch`. `ttl` = segundos que le quedan (0 o menos: ya no sirve). */
export interface OutboxMessage {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  title: string;
  body: string | null;
  url: string | null;
  tag: string | null;
  urgency: string | null;
  ttl: number | null;
}

export interface SendResult {
  status: number | null;
  error?: string;
}

export type SendFn = (message: OutboxMessage, payload: string, options: { ttl: number; urgency: Urgency }) => Promise<SendResult>;

export interface MessageResult {
  id: number;
  outcome: Outcome;
  status: number | null;
}

export type Counts = Record<Outcome, number>;

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface SendPushDeps {
  env(name: string): string | undefined;
  fetch: typeof fetch;
  /** createPushSender de webpush.ts (se inyecta para no importar nada aquí). */
  createSender(keys: VapidConfig, fetchFn: typeof fetch): Promise<{ send: (target: OutboxMessage, payload: string, options: { ttl: number; urgency: Urgency }) => Promise<SendResult> }>;
  log?(line: string): void;
}

/** Mensajes por llamada (crítica 28: lotes de 50 que se encadenan por pg_net). */
export const BATCH_SIZE = 50;
/** Envíos a la vez. */
export const PARALLEL = 10;
/** Con menos de esto el aviso llegaría tarde (el evento ya empezó): no se manda. */
export const MIN_TTL = 30;
/** Bytes del JSON que va cifrado (muy por debajo de los 4 KB de Web Push). */
export const MAX_PAYLOAD = 3000;

const URGENCIES: readonly string[] = ['very-low', 'low', 'normal', 'high'];

/** Qué hacer según la respuesta del servicio de push. */
export function classify(result: SendResult): Outcome {
  if (result.error === 'invalid-subscription') return 'gone';
  if (result.error === 'too-large') return 'failed';
  const s = result.status;
  if (s === null) return 'retry';
  if (s >= 200 && s < 300) return 'sent';
  // El teléfono ya no existe o quitó el permiso.
  if (s === 404 || s === 410) return 'gone';
  // Servicio ocupado o caído: más tarde.
  if (s === 408 || s === 429 || s >= 500) return 'retry';
  // 400, 401, 403 (clave VAPID que no es la del teléfono), 413…: reintentar no lo arregla.
  return 'failed';
}

const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** El JSON que lee public/push-sw.js: {title, body, url, tag}. Si no cabe, se recorta el texto, nunca el enlace. */
export function payloadFor(message: Pick<OutboxMessage, 'title' | 'body' | 'url' | 'tag'>): string {
  const data: { title: string; body: string; url: string; tag?: string } = {
    title: message.title,
    body: message.body ?? '',
    url: message.url || '/',
  };
  if (message.tag) data.tag = message.tag;
  let json = JSON.stringify(data);
  while (byteLength(json) > MAX_PAYLOAD && (data.body.length > 0 || data.title.length > 40)) {
    if (data.body.length > 0) data.body = data.body.slice(0, Math.floor(data.body.length * 0.8));
    else data.title = data.title.slice(0, Math.max(40, Math.floor(data.title.length * 0.8)));
    json = JSON.stringify(data);
  }
  return json;
}

export const urgencyOf = (value: string | null | undefined): Urgency => (value && URGENCIES.includes(value) ? (value as Urgency) : 'normal');

export function emptyCounts(): Counts {
  return { sent: 0, gone: 0, expired: 0, retry: 0, failed: 0 };
}

/** Manda el lote, `parallel` a la vez. Nunca lanza: cada mensaje termina con su resultado. */
export async function processBatch(messages: OutboxMessage[], send: SendFn, parallel = PARALLEL): Promise<{ results: MessageResult[]; counts: Counts }> {
  const results: MessageResult[] = new Array(messages.length);
  let next = 0;
  async function worker() {
    while (next < messages.length) {
      const i = next++;
      const message = messages[i];
      const ttl = Math.floor(message.ttl ?? 0);
      if (ttl < MIN_TTL) {
        results[i] = { id: message.id, outcome: 'expired', status: null };
        continue;
      }
      let result: SendResult;
      try {
        result = await send(message, payloadFor(message), { ttl, urgency: urgencyOf(message.urgency) });
      } catch {
        result = { status: null, error: 'network' };
      }
      results[i] = { id: message.id, outcome: classify(result), status: result.status };
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, parallel), messages.length) }, worker));
  const counts = emptyCounts();
  for (const r of results) counts[r.outcome]++;
  return { results, counts };
}

/** Compara el secreto sin cortar en la primera diferencia (no dice cuántas letras acertó). */
export function sameSecret(given: string, expected: string): boolean {
  let diff = given.length === expected.length ? 0 : 1;
  for (let i = 0; i < expected.length; i++) diff |= (given.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** La clave secreta del proyecto: la nueva (`SUPABASE_SECRET_KEYS`, JSON por nombre) o la vieja service_role. */
export function secretKey(env: (name: string) => string | undefined): string | null {
  const keys = env('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, unknown>;
      const key = parsed.default ?? Object.values(parsed)[0];
      if (typeof key === 'string' && key) return key;
    } catch {
      // Sigue con la vieja.
    }
  }
  return env('SUPABASE_SERVICE_ROLE_KEY') || null;
}

export class RestError extends Error {
  constructor(
    readonly fn: string,
    readonly status: number,
  ) {
    super(`${fn}: HTTP ${status}`);
    this.name = 'RestError';
  }
}

/**
 * RPC por la API REST (PostgREST) con la clave secreta, sin supabase-js (menos CPU al arrancar). Las claves nuevas
 * (`sb_secret_…`) van solo en `apikey`; la vieja (un JWT) también en Authorization, como hace supabase-js.
 */
export function createRestClient(url: string, key: string, fetchFn: typeof fetch) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1/rpc/`;
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) headers.Authorization = `Bearer ${key}`;
  return {
    async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
      const res = await fetchFn(base + fn, { method: 'POST', headers, body: JSON.stringify(args) });
      const text = await res.text();
      if (!res.ok) throw new RestError(fn, res.status);
      return (text ? JSON.parse(text) : null) as T;
    },
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const statusOf = (e: unknown) => (e instanceof RestError ? `HTTP ${e.status}` : 'sin respuesta');

async function readInput(req: Request): Promise<{ ping: boolean; limit: number }> {
  let input: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text) input = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Cuerpo vacío o que no es JSON: lo normal.
  }
  const limit = typeof input.limit === 'number' && Number.isFinite(input.limit) ? Math.min(100, Math.max(1, Math.floor(input.limit))) : BATCH_SIZE;
  return { ping: input.ping === true, limit };
}

/** Atiende una llamada (ver arriba). Responde JSON con los números del lote. */
export async function handleRequest(req: Request, deps: SendPushDeps): Promise<Response> {
  const log = deps.log ?? ((line: string) => console.log(line));
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const expected = (deps.env('CRON_SECRET') ?? '').trim();
  if (expected.length < 16) {
    log('send-push: falta CRON_SECRET (o tiene menos de 16 letras): no se atiende a nadie');
    return json({ error: 'config' }, 503);
  }
  if (!sameSecret((req.headers.get('x-cron-secret') ?? '').trim(), expected)) return json({ error: 'no_permitido' }, 401);

  const input = await readInput(req);
  const url = deps.env('SUPABASE_URL');
  const key = secretKey(deps.env);
  if (!url || !key) {
    log('send-push: faltan SUPABASE_URL o la clave secreta');
    return json({ error: 'config' }, 503);
  }
  const db = createRestClient(url, key, deps.fetch);

  let pinged = false;
  if (input.ping) {
    try {
      await db.rpc('ping');
      pinged = true;
    } catch (e) {
      log(`send-push: ping falló (${statusOf(e)})`);
    }
  }

  const vapid: VapidConfig = {
    publicKey: deps.env('VAPID_PUBLIC_KEY') ?? '',
    privateKey: deps.env('VAPID_PRIVATE_KEY') ?? '',
    subject: deps.env('VAPID_SUBJECT') ?? '',
  };
  if (!vapid.publicKey || !vapid.privateKey || !vapid.subject) {
    log('send-push: faltan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT: no se manda nada');
    return json({ error: 'config', pinged }, 503);
  }
  let sender: Awaited<ReturnType<SendPushDeps['createSender']>>;
  try {
    sender = await deps.createSender(vapid, deps.fetch);
  } catch (e) {
    log(`send-push: ${(e as Error).message}`);
    return json({ error: 'config', pinged }, 503);
  }

  let messages: OutboxMessage[];
  try {
    messages = (await db.rpc<OutboxMessage[] | null>('claim_push_batch', { p_limit: input.limit })) ?? [];
  } catch (e) {
    log(`send-push: no se pudo leer la cola (${statusOf(e)})`);
    return json({ error: 'cola', pinged }, 502);
  }
  if (!messages.length) return json({ claimed: 0, ...emptyCounts(), remaining: 0, chained: false, pinged });

  const { results, counts } = await processBatch(messages, (m, payload, options) => sender.send(m, payload, options));

  // Si no se puede avisar, los mensajes quedan apartados 3 minutos y se vuelven a tomar (podrían llegar dos veces).
  let finish: { remaining: number; chained: boolean } | null = null;
  for (let attempt = 0; attempt < 2 && !finish; attempt++) {
    try {
      finish = await db.rpc<{ remaining: number; chained: boolean }>('finish_push_batch', { p_results: results });
    } catch (e) {
      log(`send-push: no se pudo guardar el resultado (${statusOf(e)})`);
    }
  }

  log(
    `send-push: ${messages.length} tomados · ${counts.sent} enviados · ${counts.gone} teléfonos borrados · ${counts.retry} para reintentar · ` +
      `${counts.failed} rechazados · ${counts.expired} vencidos · quedan ${finish?.remaining ?? '?'}${finish?.chained ? ' (sigue otro lote)' : ''}`,
  );
  return json(
    { claimed: messages.length, ...counts, remaining: finish?.remaining ?? null, chained: finish?.chained ?? false, pinged },
    finish ? 200 : 502,
  );
}
