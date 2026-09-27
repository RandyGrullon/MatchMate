import { describe, expect, it } from 'vitest';
import {
  MAX_PAYLOAD,
  classify,
  createRestClient,
  handleRequest,
  payloadFor,
  processBatch,
  sameSecret,
  secretKey,
  type OutboxMessage,
  type SendPushDeps,
  type SendResult,
} from '../../supabase/functions/send-push/core';
import { createPushSender, decryptPayload, generateVapidKeys, b64urlEncode } from '../../supabase/functions/send-push/webpush';

const SECRET = 'secreto-del-cron-0123456789abcdef';

const msg = (id: number, over: Partial<OutboxMessage> = {}): OutboxMessage => ({
  id,
  endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
  p256dh: 'p',
  auth: 'a',
  title: 'Hoy es la práctica',
  body: 'Liga Norte a las 7:00 pm. ¡Nos vemos en la bolera!',
  url: '/l/liga/e/evento',
  tag: 'recordatorio:evento',
  urgency: 'high',
  ttl: 3600,
  ...over,
});

describe('qué hacer con cada respuesta', () => {
  it('2xx enviado; 404/410 teléfono borrado; 429/5xx/sin respuesta reintento; otro 4xx rechazado', () => {
    expect([200, 201, 202].map((status) => classify({ status }))).toEqual(['sent', 'sent', 'sent']);
    expect([404, 410].map((status) => classify({ status }))).toEqual(['gone', 'gone']);
    expect([408, 429, 500, 502, 503].map((status) => classify({ status }))).toEqual(['retry', 'retry', 'retry', 'retry', 'retry']);
    expect(classify({ status: null, error: 'network' })).toBe('retry');
    expect([400, 401, 403, 413].map((status) => classify({ status }))).toEqual(['failed', 'failed', 'failed', 'failed']);
    expect(classify({ status: null, error: 'invalid-subscription' })).toBe('gone');
    expect(classify({ status: null, error: 'too-large' })).toBe('failed');
  });

  it('el mensaje que lee push-sw.js, recortando el texto si no cabe', () => {
    expect(JSON.parse(payloadFor(msg(1)))).toEqual({
      title: 'Hoy es la práctica',
      body: 'Liga Norte a las 7:00 pm. ¡Nos vemos en la bolera!',
      url: '/l/liga/e/evento',
      tag: 'recordatorio:evento',
    });
    expect(JSON.parse(payloadFor(msg(1, { body: null, url: null, tag: null })))).toEqual({ title: 'Hoy es la práctica', body: '', url: '/' });
    const long = payloadFor(msg(1, { body: 'ñ'.repeat(4000) }));
    expect(new TextEncoder().encode(long).length).toBeLessThanOrEqual(MAX_PAYLOAD);
    expect(JSON.parse(long).url).toBe('/l/liga/e/evento');
  });

  it('el secreto se compara completo', () => {
    expect(sameSecret(SECRET, SECRET)).toBe(true);
    expect(sameSecret(SECRET.slice(0, -1), SECRET)).toBe(false);
    expect(sameSecret(SECRET + 'x', SECRET)).toBe(false);
    expect(sameSecret('', SECRET)).toBe(false);
  });

  it('la clave secreta: la nueva (SUPABASE_SECRET_KEYS) o la vieja', () => {
    const env = (vars: Record<string, string>) => (name: string) => vars[name];
    expect(secretKey(env({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.a.b' }))).toBe('sb_secret_x');
    expect(secretKey(env({ SUPABASE_SECRET_KEYS: '{"otra":"sb_secret_y"}' }))).toBe('sb_secret_y');
    expect(secretKey(env({ SUPABASE_SECRET_KEYS: 'no es json', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.a.b' }))).toBe('eyJ.a.b');
    expect(secretKey(env({}))).toBeNull();
  });
});

describe('processBatch', () => {
  it('manda 10 a la vez, no manda los vencidos y cuenta', async () => {
    let active = 0;
    let peak = 0;
    const statuses: Record<number, SendResult> = { 3: { status: 410 }, 4: { status: 503 }, 5: { status: 403 } };
    const send = async (m: OutboxMessage, payload: string, options: { ttl: number; urgency: string }) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      expect(JSON.parse(payload).title).toBe('Hoy es la práctica');
      expect(options.urgency).toBe(m.id === 7 ? 'normal' : 'high');
      if (m.id === 6) throw new Error('se cayó');
      return statuses[m.id] ?? { status: 201 };
    };
    const messages = Array.from({ length: 25 }, (_, i) => msg(i + 1, { ttl: i === 1 ? 29 : i === 7 ? -100 : 3600, urgency: i === 6 ? 'rara' : 'high' }));
    const { results, counts } = await processBatch(messages, send);
    expect(peak).toBe(10);
    expect(results.slice(0, 7)).toEqual([
      { id: 1, outcome: 'sent', status: 201 },
      { id: 2, outcome: 'expired', status: null },
      { id: 3, outcome: 'gone', status: 410 },
      { id: 4, outcome: 'retry', status: 503 },
      { id: 5, outcome: 'failed', status: 403 },
      { id: 6, outcome: 'retry', status: null },
      { id: 7, outcome: 'sent', status: 201 },
    ]);
    expect(counts).toEqual({ sent: 19, expired: 2, gone: 1, retry: 2, failed: 1 });
  });
});

describe('API REST', () => {
  it('claves nuevas solo en apikey; la vieja (JWT) también en Authorization', async () => {
    const seen: Record<string, string>[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      expect(url).toBe('https://p.supabase.co/rest/v1/rpc/ping');
      seen.push(init.headers as Record<string, string>);
      return new Response('"2026-09-26T00:00:00Z"', { status: 200 });
    }) as unknown as typeof fetch;
    await createRestClient('https://p.supabase.co/', 'sb_secret_abc', fetchFn).rpc('ping');
    await createRestClient('https://p.supabase.co', 'eyJhbGc.eyJyb2xl.c2ln', fetchFn).rpc('ping');
    expect(seen[0]).toMatchObject({ apikey: 'sb_secret_abc' });
    expect(seen[0].Authorization).toBeUndefined();
    expect(seen[1]).toMatchObject({ apikey: 'eyJhbGc.eyJyb2xl.c2ln', Authorization: 'Bearer eyJhbGc.eyJyb2xl.c2ln' });
  });
});

/** Base y servicio de push de mentira (tests/sql/push.test.ts lo hace contra la base de verdad). */
function world(options: { claim?: OutboxMessage[]; claimStatus?: number; pushStatus?: number } = {}) {
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const pushes: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://p.supabase.co/rest/v1/rpc/')) {
      const fn = url.slice('https://p.supabase.co/rest/v1/rpc/'.length);
      rpcs.push({ fn, args: JSON.parse(String(init?.body ?? '{}')) });
      if (fn === 'claim_push_batch') {
        if (options.claimStatus) return new Response('{"message":"x"}', { status: options.claimStatus });
        return Response.json(options.claim ?? []);
      }
      if (fn === 'finish_push_batch') return Response.json({ remaining: 3, chained: true });
      return Response.json(null);
    }
    pushes.push({ url, init: init! });
    return new Response(null, { status: options.pushStatus ?? 201 });
  }) as typeof fetch;
  return { rpcs, pushes, fetchFn };
}

async function depsFor(fetchFn: typeof fetch, vars: Record<string, string | undefined> = {}) {
  const keys = await generateVapidKeys();
  const lines: string[] = [];
  const env: Record<string, string | undefined> = {
    CRON_SECRET: SECRET,
    SUPABASE_URL: 'https://p.supabase.co',
    SUPABASE_SECRET_KEYS: '{"default":"sb_secret_abc"}',
    VAPID_PUBLIC_KEY: keys.publicKey,
    VAPID_PRIVATE_KEY: keys.privateKey,
    VAPID_SUBJECT: 'mailto:dueno@matchmate.app',
    ...vars,
  };
  const deps: SendPushDeps = { env: (name) => env[name], fetch: fetchFn, createSender: (k, f) => createPushSender(k, f), log: (l) => lines.push(l) };
  return { deps, lines, keys };
}

const post = (body: unknown = {}, secret: string | null = SECRET) =>
  new Request('https://p.supabase.co/functions/v1/send-push', {
    method: 'POST',
    headers: secret === null ? {} : { 'x-cron-secret': secret },
    body: JSON.stringify(body),
  });

async function phone() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return {
    privateKey: pair.privateKey,
    p256dh: b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
    auth: b64urlEncode(crypto.getRandomValues(new Uint8Array(16))),
  };
}

describe('handleRequest', () => {
  it('sin el secreto no hace nada; sin CRON_SECRET no atiende a nadie; solo POST', async () => {
    const w = world();
    const { deps } = await depsFor(w.fetchFn);
    expect((await handleRequest(post({}, null), deps)).status).toBe(401);
    expect((await handleRequest(post({}, 'otro-secreto-cualquiera-de-32-letras'), deps)).status).toBe(401);
    expect((await handleRequest(new Request('https://p.supabase.co/functions/v1/send-push'), deps)).status).toBe(405);
    const noSecret = await depsFor(w.fetchFn, { CRON_SECRET: undefined });
    expect((await handleRequest(post(), noSecret.deps)).status).toBe(503);
    const shortSecret = await depsFor(w.fetchFn, { CRON_SECRET: 'corto' });
    expect((await handleRequest(post({}, 'corto'), shortSecret.deps)).status).toBe(503);
    expect(w.rpcs).toEqual([]);
  });

  it('toma el lote, manda cifrado, avisa el resultado y solo registra números', async () => {
    const a = await phone();
    const b = await phone();
    const claim = [
      msg(11, { endpoint: 'https://fcm.googleapis.com/fcm/send/a', p256dh: a.p256dh, auth: a.auth }),
      msg(12, { endpoint: 'https://web.push.apple.com/b', p256dh: b.p256dh, auth: b.auth, ttl: 5 }),
    ];
    const w = world({ claim });
    const { deps, lines, keys } = await depsFor(w.fetchFn);
    const res = await handleRequest(post({ limit: 500 }), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ claimed: 2, sent: 1, gone: 0, retry: 0, failed: 0, expired: 1, remaining: 3, chained: true, pinged: false });
    expect(w.rpcs.map((r) => r.fn)).toEqual(['claim_push_batch', 'finish_push_batch']);
    expect(w.rpcs[0].args).toEqual({ p_limit: 100 });
    expect(w.rpcs[1].args).toEqual({
      p_results: [
        { id: 11, outcome: 'sent', status: 201 },
        { id: 12, outcome: 'expired', status: null },
      ],
    });
    // El vencido no se mandó; el otro llega cifrado para ese teléfono.
    expect(w.pushes).toHaveLength(1);
    const headers = w.pushes[0].init.headers as Record<string, string>;
    expect(headers.Urgency).toBe('high');
    expect(headers.TTL).toBe('3600');
    expect(headers.Authorization).toContain(`k=${keys.publicKey}`);
    const data = JSON.parse(await decryptPayload(w.pushes[0].init.body as Uint8Array, a.privateKey, a.p256dh, a.auth));
    expect(data).toEqual({ title: 'Hoy es la práctica', body: 'Liga Norte a las 7:00 pm. ¡Nos vemos en la bolera!', url: '/l/liga/e/evento', tag: 'recordatorio:evento' });
    expect(lines).toEqual(['send-push: 2 tomados · 1 enviados · 0 teléfonos borrados · 0 para reintentar · 0 rechazados · 1 vencidos · quedan 3 (sigue otro lote)']);
    expect(lines.join(' ')).not.toContain('fcm');
  });

  it('cola vacía: no manda nada; con ping llama a ping()', async () => {
    const w = world();
    const { deps } = await depsFor(w.fetchFn);
    const res = await handleRequest(post({ ping: true }), deps);
    expect(await res.json()).toMatchObject({ claimed: 0, pinged: true });
    expect(w.rpcs.map((r) => r.fn)).toEqual(['ping', 'claim_push_batch']);
    expect(w.rpcs[1].args).toEqual({ p_limit: 50 });
  });

  it('sin claves VAPID o con claves malas: 503 (el ping igual se hace); cola que no responde: 502', async () => {
    const w = world();
    const noVapid = await depsFor(w.fetchFn, { VAPID_PRIVATE_KEY: undefined });
    const res = await handleRequest(post({ ping: true }), noVapid.deps);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'config', pinged: true });
    const badVapid = await depsFor(w.fetchFn, { VAPID_PRIVATE_KEY: 'AAAA' });
    expect((await handleRequest(post(), badVapid.deps)).status).toBe(503);
    expect(badVapid.lines[0]).toContain('VAPID');
    const down = world({ claimStatus: 500 });
    const { deps, lines } = await depsFor(down.fetchFn);
    expect((await handleRequest(post(), deps)).status).toBe(502);
    expect(lines).toEqual(['send-push: no se pudo leer la cola (HTTP 500)']);
  });
});
