/**
 * Lógica de la Edge Function `insignias` (docs/insignias.md §3.1), en TypeScript puro y SIN imports (Deno exige la
 * extensión `.ts` en las rutas y el tsc de la app no la acepta). index.ts solo la conecta con Deno.serve y con el
 * motor empaquetado (_shared/badges-engine.gen.js, `pnpm badges:bundle`). Pruebas: src/badges/edgeFunction.test.ts
 * (Vitest, con una base falsa) y, de punta a punta con la base de verdad y el motor empaquetado,
 * tests/sql/insignias-funcion.test.ts.
 *
 * Cada llamada (la hace pg_net: la tarea `mm-insignias` cada 10 minutos, la diaria, o encadenada tras una corrida):
 * 1. exige la cabecera `x-cron-secret` igual al secreto CRON_SECRET (el mismo que está en Vault como 'cron_secret',
 *    el de send-push); la función va con verify_jwt = false;
 * 2. toma trabajos de la cola (`badge_claim`, con la clave secreta = service_role), de a 5 y hasta 25 por llamada;
 * 3. por cada uno pide la foto de datos (`badge_snapshot`, que cuenta el intento), corre el motor
 *    (`evaluate(job, foto, hora de la foto)`) y aplica las decisiones (`badge_apply`, todo o nada). Si la foto, el
 *    motor o aplicar fallan, el trabajo vuelve a la cola con espera (`badge_fail`; si falló la foto, ahí se cuenta el
 *    intento; a los 5 intentos queda para el superadmin);
 * 4. corta a los 100 s o cuando el motor lleva ~1,2 s de CPU (el plan gratis de Supabase corta la función a los 2 s
 *    de CPU y a los 150 s): lo que ya tomó y no alcanzó vuelve a la cola ya, sin gastar un intento (`badge_release`);
 * 5. al final `badge_finish`: manda los avisos agrupados y, si queda cola vencida, la base vuelve a llamar a esta
 *    función con pg_net (`private.kick_badges`).
 *
 * En el registro solo van números, ids de trabajos y el tipo (nunca nombres ni datos de la foto).
 */

/** Un trabajo de `badge_claim` (BadgeJob de src/badges/types.ts). */
export interface ClaimedJob {
  id: number;
  kind: string;
  league_id: string | null;
  user_id: string | null;
  ref: string;
  payload: Record<string, unknown>;
  run_after: string;
  attempts: number;
  created_at: string;
}

/** La foto de `badge_snapshot` (BadgeSnapshot de src/badges/snapshot.ts). null = el trabajo ya no existe. */
export interface Snapshot {
  v?: number;
  now?: string;
  [key: string]: unknown;
}

/** Lo que devuelve `badge_apply`. */
export interface ApplyResult {
  ok: boolean;
  error?: string;
  awarded?: number;
  reactivated?: number;
  upgraded?: number;
  updated?: number;
  revoked?: number;
  reviews?: number;
  adopted?: number;
  progress?: number;
  skipped?: number;
  notices?: number;
}

export interface FinishResult {
  remaining: number;
  chained: boolean;
  notices: number;
}

export interface BadgesDeps {
  env(name: string): string | undefined;
  fetch: typeof fetch;
  /** `evaluateJob` del motor empaquetado. Sin E/S; puede lanzar (el trabajo vuelve a la cola). */
  evaluate(job: ClaimedJob, snapshot: Snapshot, now: string): readonly unknown[];
  /** `SOURCE_HASH` del motor, para saber qué versión corre. */
  engine?: string;
  /** Reloj en milisegundos (por defecto performance.now); las pruebas lo mueven a mano. */
  clock?(): number;
  log?(line: string): void;
}

/** Trabajos por llamada (se puede pedir de 1 a 50 con `{"limit": n}`). */
export const BATCH_SIZE = 25;
export const MAX_BATCH = 50;
/** Se toman de a pocos: así casi nunca queda algo tomado que no alcanza a correr. */
export const CLAIM_CHUNK = 5;
/** Tiempo de pared: la base espera 120 s (kick_badges) y Supabase corta a los 150 s. */
export const TIME_BUDGET_MS = 100_000;
/** CPU del motor y del JSON (Supabase corta a los 2 s de CPU por llamada): se para antes. */
export const CPU_BUDGET_MS = 1_200;

export type Stop = 'tiempo' | 'cpu' | null;

export interface RunCounts {
  claimed: number;
  applied: number;
  failed: number;
  gone: number;
  released: number;
  decisions: number;
  awarded: number;
  revoked: number;
  reviews: number;
  progress: number;
  notices: number;
}

export const emptyRunCounts = (): RunCounts => ({
  claimed: 0,
  applied: 0,
  failed: 0,
  gone: 0,
  released: 0,
  decisions: 0,
  awarded: 0,
  revoked: 0,
  reviews: 0,
  progress: 0,
  notices: 0,
});

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
    /** SQLSTATE que devuelve PostgREST (sin el mensaje: puede traer datos). */
    readonly code: string | null = null,
  ) {
    super(`${fn}: HTTP ${status}${code ? ` (${code})` : ''}`);
    this.name = 'RestError';
  }
}

const codeOf = (text: string): string | null => {
  try {
    const code = (JSON.parse(text) as { code?: unknown }).code;
    return typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : null;
  } catch {
    return null;
  }
};

/**
 * RPC por la API REST (PostgREST) con la clave secreta, sin supabase-js (como send-push). Las claves nuevas
 * (`sb_secret_…`) van solo en `apikey`; la vieja (un JWT) también en Authorization. `cpu` suma lo que tarda el JSON.
 */
export function createRestClient(url: string, key: string, fetchFn: typeof fetch, cpu: <T>(work: () => T) => T = (work) => work()) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1/rpc/`;
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) headers.Authorization = `Bearer ${key}`;
  return {
    async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
      const body = cpu(() => JSON.stringify(args));
      const res = await fetchFn(base + fn, { method: 'POST', headers, body });
      const text = await res.text();
      if (!res.ok) throw new RestError(fn, res.status, codeOf(text));
      return cpu(() => (text ? JSON.parse(text) : null)) as T;
    },
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const statusOf = (e: unknown) => (e instanceof RestError ? `HTTP ${e.status}${e.code ? ` (${e.code})` : ''}` : 'sin respuesta');

/** El error del motor, corto y en una línea (va a badge_queue.last_error y al registro). */
const reasonOf = (e: unknown) =>
  (e instanceof Error ? `${e.name}: ${e.message}` : String(e))
    .replace(/\s+/g, ' ')
    .slice(0, 300);

async function readLimit(req: Request): Promise<number> {
  let input: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text) input = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Cuerpo vacío o que no es JSON: lo normal.
  }
  return typeof input.limit === 'number' && Number.isFinite(input.limit) ? Math.min(MAX_BATCH, Math.max(1, Math.floor(input.limit))) : BATCH_SIZE;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Atiende una llamada (ver arriba). Responde JSON con los números de la corrida. */
export async function handleRequest(req: Request, deps: BadgesDeps): Promise<Response> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const clock = deps.clock ?? (() => performance.now());
  const started = clock();
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const expected = (deps.env('CRON_SECRET') ?? '').trim();
  if (expected.length < 16) {
    log('insignias: falta CRON_SECRET (o tiene menos de 16 letras): no se atiende a nadie');
    return json({ error: 'config' }, 503);
  }
  if (!sameSecret((req.headers.get('x-cron-secret') ?? '').trim(), expected)) return json({ error: 'no_permitido' }, 401);

  const limit = await readLimit(req);
  const url = deps.env('SUPABASE_URL');
  const key = secretKey(deps.env);
  if (!url || !key) {
    log('insignias: faltan SUPABASE_URL o la clave secreta');
    return json({ error: 'config' }, 503);
  }

  // CPU aproximada: lo que tarda lo que no es esperar la red (el motor y el JSON).
  let cpuMs = 0;
  const cpu = <T>(work: () => T): T => {
    const t0 = clock();
    try {
      return work();
    } finally {
      cpuMs += clock() - t0;
    }
  };
  const db = createRestClient(url, key, deps.fetch, cpu);
  const outOfBudget = (): Stop => (clock() - started >= TIME_BUDGET_MS ? 'tiempo' : cpuMs >= CPU_BUDGET_MS ? 'cpu' : null);

  const counts = emptyRunCounts();
  /** Falló: vuelve con espera. `charge`: el intento no se contó (falló la foto, que es la que lo cuenta). */
  const fail = async (job: ClaimedJob, reason: string, charge = false) => {
    try {
      await db.rpc('badge_fail', charge ? { p_job: job.id, p_error: reason, p_charge: true } : { p_job: job.id, p_error: reason });
    } catch (e) {
      // Queda tomado: a los 10 minutos se puede volver a tomar.
      log(`insignias: no se pudo devolver el trabajo ${job.id} (${statusOf(e)})`);
    }
  };
  /** No alcanzó a correr: vuelve ya, sin espera ni intento gastado. */
  const release = async (job: ClaimedJob) => {
    try {
      await db.rpc('badge_release', { p_job: job.id });
    } catch (e) {
      log(`insignias: no se pudo devolver el trabajo ${job.id} (${statusOf(e)})`);
    }
  };

  /** Un trabajo: foto → motor → aplicar. */
  const run = async (job: ClaimedJob) => {
    let snapshot: Snapshot | null;
    try {
      snapshot = await db.rpc<Snapshot | null>('badge_snapshot', { p_job: job.id });
    } catch (e) {
      counts.failed++;
      log(`insignias: trabajo ${job.id} (${job.kind}): la foto falló (${statusOf(e)})`);
      await fail(job, `foto: ${statusOf(e)}`, true);
      return;
    }
    if (!snapshot) {
      counts.gone++;
      return;
    }
    const snap = snapshot;
    let decisions: readonly unknown[];
    try {
      const now = typeof snap.now === 'string' ? snap.now : new Date().toISOString();
      decisions = cpu(() => deps.evaluate(job, snap, now));
      if (!Array.isArray(decisions)) throw new TypeError('el motor no devolvió una lista');
    } catch (e) {
      counts.failed++;
      const reason = reasonOf(e);
      log(`insignias: trabajo ${job.id} (${job.kind}): el motor falló: ${reason}`);
      await fail(job, `motor: ${reason}`);
      return;
    }
    let result: ApplyResult | null;
    try {
      result = await db.rpc<ApplyResult | null>('badge_apply', { p_job: job.id, p_decisions: decisions });
    } catch (e) {
      // Si la base alcanzó a aplicar, el trabajo ya no existe y badge_fail no hace nada.
      counts.failed++;
      log(`insignias: trabajo ${job.id} (${job.kind}): aplicar falló (${statusOf(e)})`);
      await fail(job, `aplicar: ${statusOf(e)}`);
      return;
    }
    if (!result?.ok) {
      // badge_apply ya lo devolvió a la cola (badge_fail) con su error.
      if (result?.error === 'no_existe') counts.gone++;
      else {
        counts.failed++;
        log(`insignias: trabajo ${job.id} (${job.kind}): la base no aplicó las decisiones`);
      }
      return;
    }
    counts.applied++;
    counts.decisions += decisions.length;
    counts.awarded += num(result.awarded) + num(result.reactivated) + num(result.adopted);
    counts.revoked += num(result.revoked);
    counts.reviews += num(result.reviews);
    counts.progress += num(result.progress);
  };

  let stopped: Stop = null;
  let claimError: unknown = null;
  while (counts.claimed < limit) {
    stopped = outOfBudget();
    if (stopped) break;
    const want = Math.min(CLAIM_CHUNK, limit - counts.claimed);
    let jobs: ClaimedJob[];
    try {
      jobs = (await db.rpc<ClaimedJob[] | null>('badge_claim', { p_limit: want })) ?? [];
    } catch (e) {
      claimError = e;
      log(`insignias: no se pudo leer la cola (${statusOf(e)})`);
      break;
    }
    counts.claimed += jobs.length;
    for (let i = 0; i < jobs.length; i++) {
      stopped = outOfBudget();
      if (stopped) {
        // Lo tomado que no alcanzó: vuelve a la cola ya, sin gastar un intento (sigue en la próxima corrida).
        for (const job of jobs.slice(i)) {
          counts.released++;
          await release(job);
        }
        break;
      }
      await run(jobs[i]);
    }
    if (stopped || jobs.length < want) break;
  }

  if (!counts.claimed) {
    if (claimError) return json({ error: 'cola', ...counts }, 502);
    return json({ ...counts, remaining: 0, chained: false, stopped, engine: deps.engine ?? null });
  }

  // Avisos agrupados y, si queda cola, otra llamada (la hace la base con pg_net).
  let finish: FinishResult | null = null;
  for (let attempt = 0; attempt < 2 && !finish; attempt++) {
    try {
      finish = await db.rpc<FinishResult>('badge_finish');
    } catch (e) {
      log(`insignias: no se pudo cerrar la corrida (${statusOf(e)})`);
    }
  }
  counts.notices = num(finish?.notices);

  const seconds = ((clock() - started) / 1000).toFixed(1);
  log(
    `insignias: ${counts.claimed} tomados · ${counts.applied} aplicados · ${counts.failed} con error · ${counts.gone} ya no estaban · ` +
      `${counts.released} devueltos · ${counts.awarded} dadas · ${counts.revoked} retiradas · ${counts.reviews} por confirmar · ` +
      `${counts.progress} de progreso · ${counts.notices} avisos · ${seconds} s, ${Math.round(cpuMs)} ms de CPU` +
      `${stopped ? ` (cortó por ${stopped})` : ''} · quedan ${finish?.remaining ?? '?'}${finish?.chained ? ' (sigue otra corrida)' : ''}`,
  );
  return json(
    { ...counts, remaining: finish?.remaining ?? null, chained: finish?.chained ?? false, stopped, engine: deps.engine ?? null },
    finish && !claimError ? 200 : 502,
  );
}
