import { describe, expect, it } from 'vitest';
import {
  BUCKET,
  LOGOS_BUCKET,
  REMOVE_CHUNK,
  StorageError,
  TAKE_LIMIT,
  chunk,
  createStorageClient,
  handlePurgeRequest,
  isSafePath,
  pathsOf,
  removeInChunks,
  type PurgeDeps,
  type StorageClient,
} from '../../supabase/functions/purge-photos/core';
import { createRestClient, sameSecret, secretKey } from '../../supabase/functions/send-push/core';

// Pruebas de la Edge Function purge-photos (su lógica vive en supabase/functions/purge-photos/core.ts; lo que comparte
// con send-push, en send-push/core.ts). Las RPC de la cola se prueban con la base en tests/sql/avisos-telefono.test.ts.

const SECRET = 'secreto-del-cron-0123456789abcdef';
const URL_ = 'https://abc.supabase.co';
const LEAGUE = '22222222-2222-4222-8222-222222222222';
const photo = (i: number) => `${LEAGUE}/${String(i).padStart(8, '0')}-3333-4333-8333-333333333333.webp`;
const logo = (i: number) => `${LEAGUE}/${String(i).padStart(8, '0')}-4444-4444-8444-444444444444.webp`;

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Supabase de mentira: RPC por /rest/v1/rpc/<fn> y Storage por /storage/v1/object/<bucket>. `queue` es la cola de las
 * fotos (purge_queue_take sin p_bucket) y `logoQueue` la de los logos (p_bucket 'logos'). `rpcStatus` decide la
 * respuesta de cada RPC (`<fn>`, o `<fn>:logos` solo la de los logos) y `storageStatus` la de cada DELETE (por número
 * de llamada, desde 0).
 */
function fakeSupabase(opts: {
  queue?: unknown[];
  logoQueue?: unknown[];
  orphans?: unknown[];
  rpcStatus?: Record<string, number>;
  storageStatus?: (n: number, paths: string[]) => number | 'network';
} = {}) {
  const calls: Call[] = [];
  let deletes = 0;
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method: init?.method ?? 'GET', url, headers: { ...(init?.headers as Record<string, string>) }, body });
    if (url.includes('/rest/v1/rpc/')) {
      const fn = url.split('/rest/v1/rpc/')[1];
      const logos = body?.p_bucket === 'logos';
      const status = (logos ? opts.rpcStatus?.[`${fn}:logos`] : undefined) ?? opts.rpcStatus?.[fn] ?? 200;
      if (status !== 200) return new Response('{"message":"x"}', { status });
      const take = logos ? opts.logoQueue : opts.queue;
      const data = fn === 'purge_queue_take' ? (take ?? []) : fn === 'storage_orphans' ? (opts.orphans ?? []) : fn === 'purge_queue_done' ? body.p_paths.length : null;
      return new Response(JSON.stringify(data), { status: 200 });
    }
    if (url.includes('/storage/v1/object/')) {
      const status = opts.storageStatus?.(deletes++, body.prefixes) ?? 200;
      if (status === 'network') throw new TypeError('fetch failed');
      return new Response(JSON.stringify(status === 200 ? body.prefixes.map((name: string) => ({ name })) : { error: 'x' }), { status });
    }
    return new Response('no', { status: 404 });
  }) as typeof fetch;
  return { fetchFn, calls };
}

function deps(fetchFn: typeof fetch, env: Record<string, string> = {}): PurgeDeps & { lines: string[] } {
  const lines: string[] = [];
  const vars: Record<string, string> = { CRON_SECRET: SECRET, SUPABASE_URL: URL_, SUPABASE_SECRET_KEYS: '{"default":"sb_secret_abc"}', ...env };
  return {
    lines,
    env: (name) => vars[name] || undefined,
    fetch: fetchFn,
    shared: { sameSecret, secretKey, createRestClient },
    log: (line) => lines.push(line),
  };
}

const post = (body: unknown = {}, secret: string | null = SECRET, method = 'POST') =>
  new Request('https://abc.supabase.co/functions/v1/purge-photos', {
    method,
    headers: secret == null ? {} : { 'x-cron-secret': secret },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });

const rpcCalls = (calls: Call[], fn: string) => calls.filter((c) => c.url.endsWith(`/rest/v1/rpc/${fn}`));
const storageCalls = (calls: Call[]) => calls.filter((c) => c.url.includes('/storage/v1/object/'));

describe('rutas', () => {
  it('solo rutas del bucket: nada vacío, absoluto, con .. , barras dobles o letras de control', () => {
    expect(isSafePath(photo(1))).toBe(true);
    expect(isSafePath('liga/foto.jpg')).toBe(true);
    for (const bad of ['', '/liga/foto.webp', 'liga//foto.webp', 'liga/../otra/foto.webp', './foto.webp', 'liga/', 'liga\\foto.webp', 'liga/fo\nto.webp', 'x'.repeat(513), null, 7, { path: 'a' }]) {
      expect(isSafePath(bad)).toBe(false);
    }
  });

  it('de las filas de la base: únicas, en orden, y las raras se cuentan aparte', () => {
    expect(pathsOf([{ path: 'a/1.webp' }, { path: 'b/2.webp' }, { path: 'a/1.webp' }, { path: '../x' }, null, { nada: 1 }, 'c/3.webp'])).toEqual({
      paths: ['a/1.webp', 'b/2.webp', 'c/3.webp'],
      skipped: 3,
    });
    expect(pathsOf(null)).toEqual({ paths: [], skipped: 0 });
    expect(pathsOf({ path: 'a/1.webp' })).toEqual({ paths: [], skipped: 0 });
  });

  it('grupos de 100 (o el tamaño que se pida)', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
    expect(chunk(Array.from({ length: 250 }, (_, i) => i)).map((g) => g.length)).toEqual([REMOVE_CHUNK, REMOVE_CHUNK, 50]);
    expect(chunk([1, 2], 0)).toEqual([[1], [2]]);
  });
});

describe('Storage', () => {
  it('DELETE al bucket con {prefixes}; la clave nueva solo en apikey y la vieja también en Authorization', async () => {
    const { fetchFn, calls } = fakeSupabase();
    await createStorageClient(`${URL_}/`, 'sb_secret_abc', fetchFn).remove(BUCKET, ['a/1.webp', 'b/2.webp']);
    expect(calls).toEqual([
      {
        method: 'DELETE',
        url: `${URL_}/storage/v1/object/scoreboards`,
        headers: { apikey: 'sb_secret_abc', 'Content-Type': 'application/json', Accept: 'application/json' },
        body: { prefixes: ['a/1.webp', 'b/2.webp'] },
      },
    ]);
    await createStorageClient(URL_, 'eyJ.a.b', fetchFn).remove(BUCKET, ['a/1.webp']);
    expect(calls[1].headers).toMatchObject({ apikey: 'eyJ.a.b', Authorization: 'Bearer eyJ.a.b' });
  });

  it('lo que Storage no acepta (o sin respuesta) es StorageError con su estado', async () => {
    const { fetchFn } = fakeSupabase({ storageStatus: (n) => (n === 0 ? 403 : 'network') });
    const s = createStorageClient(URL_, 'sb_secret_abc', fetchFn);
    await expect(s.remove(BUCKET, ['a/1.webp'])).rejects.toMatchObject({ name: 'StorageError', status: 403 });
    await expect(s.remove(BUCKET, ['a/1.webp'])).rejects.toMatchObject({ name: 'StorageError', status: null });
  });

  it('un grupo que falla no frena a los demás; solo los buenos cuentan como borrados', async () => {
    const seen: string[][] = [];
    const storage: StorageClient = {
      async remove(bucket, paths) {
        expect(bucket).toBe(BUCKET);
        seen.push(paths);
        if (seen.length === 2) throw new StorageError(500);
        if (seen.length === 3) throw new Error('otra cosa');
      },
    };
    const paths = Array.from({ length: 7 }, (_, i) => `l/${i}.webp`);
    const r = await removeInChunks(storage, paths, 2);
    expect(seen.map((g) => g.length)).toEqual([2, 2, 2, 1]);
    expect(r).toEqual({ removed: ['l/0.webp', 'l/1.webp', 'l/6.webp'], failed: 4, statuses: [500, null] });
  });

  it('los logos se borran de su bucket', async () => {
    const buckets: string[] = [];
    const storage: StorageClient = {
      async remove(bucket) {
        buckets.push(bucket);
      },
    };
    expect(await removeInChunks(storage, ['l/1.webp', 'l/2.webp', 'l/3.webp'], 2, LOGOS_BUCKET)).toEqual({
      removed: ['l/1.webp', 'l/2.webp', 'l/3.webp'],
      failed: 0,
      statuses: [],
    });
    expect(buckets).toEqual([LOGOS_BUCKET, LOGOS_BUCKET]);
  });
});

describe('handlePurgeRequest', () => {
  it('solo POST, con CRON_SECRET configurado y la cabecera x-cron-secret igual', async () => {
    const { fetchFn, calls } = fakeSupabase();
    expect((await handlePurgeRequest(post({}, SECRET, 'GET'), deps(fetchFn))).status).toBe(405);
    const noSecret = deps(fetchFn, { CRON_SECRET: '' });
    expect((await handlePurgeRequest(post(), noSecret)).status).toBe(503);
    expect(JSON.parse(noSecret.lines[0])).toMatchObject({ fn: 'purge-photos', level: 'error', event: 'config' });
    expect((await handlePurgeRequest(post(), deps(fetchFn, { CRON_SECRET: 'corto' }))).status).toBe(503);
    expect((await handlePurgeRequest(post({}, null), deps(fetchFn))).status).toBe(401);
    expect((await handlePurgeRequest(post({}, SECRET.slice(0, -1)), deps(fetchFn))).status).toBe(401);
    expect((await handlePurgeRequest(post(), deps(fetchFn, { SUPABASE_URL: '' }))).status).toBe(503);
    expect((await handlePurgeRequest(post(), deps(fetchFn, { SUPABASE_SECRET_KEYS: '' }))).status).toBe(503);
    expect(calls).toEqual([]);
  });

  it('vacía la cola en grupos de 100, la marca hecha y borra los huérfanos; el registro solo lleva números', async () => {
    const queue = Array.from({ length: 250 }, (_, i) => ({ path: photo(i) }));
    const orphans = [{ path: photo(900) }, { path: photo(901) }];
    const { fetchFn, calls } = fakeSupabase({ queue, orphans });
    const d = deps(fetchFn);
    const res = await handlePurgeRequest(post(), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ queued: 250, purged: 250, logos: 0, orphans: 2, orphansRemoved: 2, failed: 0 });

    // Las fotos sin p_bucket (sirve también con una base de antes de los logos) y después los logos.
    expect(rpcCalls(calls, 'purge_queue_take').map((c) => c.body)).toEqual([{ p_limit: TAKE_LIMIT }, { p_limit: TAKE_LIMIT, p_bucket: 'logos' }]);
    expect(rpcCalls(calls, 'storage_orphans').map((c) => c.body)).toEqual([{ p_limit: TAKE_LIMIT }]);
    expect(storageCalls(calls).map((c) => (c.body as { prefixes: string[] }).prefixes.length)).toEqual([100, 100, 50, 2]);
    expect(storageCalls(calls).every((c) => c.method === 'DELETE' && c.url.endsWith('/storage/v1/object/scoreboards'))).toBe(true);
    expect(rpcCalls(calls, 'purge_queue_done').map((c) => (c.body as { p_paths: string[] }).p_paths)).toEqual([queue.map((q) => q.path)]);
    // Los huérfanos no están en la cola: no se marcan.
    expect((rpcCalls(calls, 'purge_queue_done')[0].body as { p_paths: string[] }).p_paths).not.toContain(photo(900));
    // La clave secreta va en apikey, a la API REST y a Storage.
    expect(calls.every((c) => c.headers.apikey === 'sb_secret_abc')).toBe(true);

    expect(d.lines.map((l) => JSON.parse(l))).toEqual([
      { fn: 'purge-photos', level: 'info', event: 'summary', queued: 250, purged: 250, logos: 0, orphans: 2, orphansRemoved: 2, failed: 0 },
    ]);
    expect(d.lines.join('\n')).not.toContain(LEAGUE);
  });

  it('lo que Storage no aceptó se queda en la cola (no se marca) y se cuenta; lo demás sigue', async () => {
    const queue = Array.from({ length: 150 }, (_, i) => ({ path: photo(i) }));
    const { fetchFn, calls } = fakeSupabase({ queue, orphans: [{ path: photo(900) }], storageStatus: (n) => (n === 0 ? 503 : n === 2 ? 'network' : 200) });
    const d = deps(fetchFn);
    const res = await handlePurgeRequest(post(), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ queued: 150, purged: 50, logos: 0, orphans: 1, orphansRemoved: 0, failed: 101 });
    expect(rpcCalls(calls, 'purge_queue_done').map((c) => (c.body as { p_paths: string[] }).p_paths)).toEqual([queue.slice(100).map((q) => q.path)]);
    const lines = d.lines.map((l) => JSON.parse(l));
    expect(lines).toContainEqual({ fn: 'purge-photos', level: 'warn', event: 'storage', bucket: 'scoreboards', failed: 100, statuses: [503] });
    expect(lines).toContainEqual({ fn: 'purge-photos', level: 'warn', event: 'storage', failed: 1, statuses: [null], orphans: true });
    expect(lines.at(-1)).toMatchObject({ level: 'warn', event: 'summary', failed: 101 });
  });

  it('si Storage no borró nada, no se llama a purge_queue_done; las rutas raras nunca llegan a Storage', async () => {
    const { fetchFn, calls } = fakeSupabase({ queue: [{ path: '../../otra/cosa' }, { path: '' }], orphans: [{ path: '/raiz.webp' }] });
    const res = await handlePurgeRequest(post(), deps(fetchFn));
    expect(await res.json()).toEqual({ queued: 2, purged: 0, logos: 0, orphans: 1, orphansRemoved: 0, failed: 3 });
    expect(storageCalls(calls)).toEqual([]);
    expect(rpcCalls(calls, 'purge_queue_done')).toEqual([]);
  });

  it('si no puede leer la cola o marcarla, responde 502, pero igual busca los huérfanos', async () => {
    const take = fakeSupabase({ orphans: [{ path: photo(1) }], rpcStatus: { purge_queue_take: 500 } });
    const d = deps(take.fetchFn);
    const res = await handlePurgeRequest(post(), d);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ queued: 0, orphans: 1, orphansRemoved: 1 });
    expect(JSON.parse(d.lines[0])).toEqual({ fn: 'purge-photos', level: 'error', event: 'take', bucket: 'scoreboards', status: 500 });

    const done = fakeSupabase({ queue: [{ path: photo(1) }], rpcStatus: { purge_queue_done: 403 } });
    const d2 = deps(done.fetchFn);
    const res2 = await handlePurgeRequest(post(), d2);
    expect(res2.status).toBe(502);
    expect(await res2.json()).toMatchObject({ queued: 1, purged: 0 });
    expect(JSON.parse(d2.lines[0])).toEqual({ fn: 'purge-photos', level: 'error', event: 'queue_done', bucket: 'scoreboards', removed: 1, status: 403 });

    const orphans = fakeSupabase({ rpcStatus: { storage_orphans: 404 } });
    expect((await handlePurgeRequest(post(), deps(orphans.fetchFn))).status).toBe(502);
  });

  it('{limit} cambia cuántas pide (1–1000) y {orphans: false} no busca huérfanos', async () => {
    const { fetchFn, calls } = fakeSupabase();
    await handlePurgeRequest(post({ limit: 5000, orphans: false }), deps(fetchFn));
    await handlePurgeRequest(post({ limit: 0.5 }), deps(fetchFn));
    await handlePurgeRequest(new Request('https://x/purge-photos', { method: 'POST', headers: { 'x-cron-secret': SECRET }, body: 'no es json' }), deps(fetchFn));
    expect(rpcCalls(calls, 'purge_queue_take').map((c) => c.body)).toEqual([
      { p_limit: 1000 },
      { p_limit: 1000, p_bucket: 'logos' },
      { p_limit: 1 },
      { p_limit: 1, p_bucket: 'logos' },
      { p_limit: TAKE_LIMIT },
      { p_limit: TAKE_LIMIT, p_bucket: 'logos' },
    ]);
    expect(rpcCalls(calls, 'storage_orphans').map((c) => c.body)).toEqual([{ p_limit: 1 }, { p_limit: TAKE_LIMIT }]);
  });

  it('los logos de la cola se borran del bucket logos y se marcan hechos con p_bucket; las fotos, de scoreboards', async () => {
    const queue = [{ path: photo(1) }, { path: photo(2) }];
    const logoQueue = [{ path: logo(1) }, { path: logo(2) }, { path: logo(3) }];
    const { fetchFn, calls } = fakeSupabase({ queue, logoQueue, orphans: [{ path: photo(900) }] });
    const d = deps(fetchFn);
    const res = await handlePurgeRequest(post(), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ queued: 5, purged: 5, logos: 3, orphans: 1, orphansRemoved: 1, failed: 0 });
    expect(storageCalls(calls).map((c) => [c.url.split('/storage/v1/object/')[1], (c.body as { prefixes: string[] }).prefixes])).toEqual([
      ['scoreboards', queue.map((q) => q.path)],
      ['logos', logoQueue.map((q) => q.path)],
      ['scoreboards', [photo(900)]],
    ]);
    expect(rpcCalls(calls, 'purge_queue_done').map((c) => c.body)).toEqual([
      { p_paths: queue.map((q) => q.path) },
      { p_paths: logoQueue.map((q) => q.path), p_bucket: 'logos' },
    ]);
    expect(d.lines.join('\n')).not.toContain(LEAGUE);
  });

  it('con una base sin logos (antes de 20260929001000) falla solo la llamada de los logos (se registra); las fotos se borran igual', async () => {
    const queue = [{ path: photo(1) }];
    const { fetchFn, calls } = fakeSupabase({ queue, rpcStatus: { 'purge_queue_take:logos': 404 } });
    const d = deps(fetchFn);
    const res = await handlePurgeRequest(post(), d);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ queued: 1, purged: 1, logos: 0 });
    expect(rpcCalls(calls, 'purge_queue_done').map((c) => c.body)).toEqual([{ p_paths: [photo(1)] }]);
    expect(d.lines.map((l) => JSON.parse(l))).toContainEqual({ fn: 'purge-photos', level: 'error', event: 'take', bucket: 'logos', status: 404 });
  });
});
