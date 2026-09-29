/**
 * La Edge Function `insignias` (supabase/functions/insignias/core.ts) con una base falsa: el secreto, tomar de a 5,
 * foto → motor → aplicar, devolver a la cola lo que falla, cortar por tiempo o CPU y cerrar la corrida. De punta a
 * punta con la base de verdad y el motor empaquetado: tests/sql/insignias-funcion.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  CLAIM_CHUNK,
  createRestClient,
  handleRequest,
  sameSecret,
  secretKey,
  type ApplyResult,
  type BadgesDeps,
  type ClaimedJob,
  type Snapshot,
} from '../../supabase/functions/insignias/core';

const SECRET = 'secreto-del-cron-0123456789abcdef';
const NOW = '2026-10-05T16:00:00.000Z';

const jobOf = (id: number, kind = 'resultado'): ClaimedJob => ({
  id,
  kind,
  league_id: 'L',
  user_id: null,
  ref: `entry:${id}`,
  payload: {},
  run_after: NOW,
  attempts: 1,
  created_at: NOW,
});

interface WorldOptions {
  jobs?: number;
  /** Foto por trabajo (null = ya no existe); por defecto {v: 1, now: NOW, job}. */
  snapshot?: (id: number) => Snapshot | null;
  /** Estado HTTP de la foto o de aplicar para un trabajo. */
  snapshotStatus?: (id: number) => number | undefined;
  applyStatus?: (id: number) => number | undefined;
  apply?: (id: number, decisions: unknown[]) => ApplyResult;
  claimStatus?: number;
  finishStatus?: number;
  /** Lo que tarda la red en cada RPC (mueve el reloj). */
  latency?: (fn: string) => number;
}

/** La API REST de una base falsa con su cola, y el reloj. */
function world(o: WorldOptions = {}) {
  const queue = Array.from({ length: o.jobs ?? 0 }, (_, i) => jobOf(i + 1));
  const rpcs: { fn: string; args: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const clock = { t: 1000 };
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const fn = url.slice('https://p.supabase.co/rest/v1/rpc/'.length);
    const args = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    rpcs.push({ fn, args, headers: init?.headers as Record<string, string> });
    clock.t += o.latency?.(fn) ?? 0;
    const id = Number(args.p_job);
    if (fn === 'badge_claim') {
      if (o.claimStatus) return new Response('{"code":"XX000","message":"x"}', { status: o.claimStatus });
      return Response.json(queue.splice(0, Number(args.p_limit)));
    }
    if (fn === 'badge_snapshot') {
      const status = o.snapshotStatus?.(id);
      if (status) return new Response('{"code":"57014","message":"canceling statement due to statement timeout"}', { status });
      const s = o.snapshot ? o.snapshot(id) : { v: 1, now: NOW, job: jobOf(id) };
      return new Response(JSON.stringify(s));
    }
    if (fn === 'badge_apply') {
      const status = o.applyStatus?.(id);
      if (status) return new Response('{}', { status });
      return Response.json(o.apply ? o.apply(id, args.p_decisions as unknown[]) : { ok: true, awarded: (args.p_decisions as unknown[]).length, revoked: 0, progress: 1 });
    }
    if (fn === 'badge_fail' || fn === 'badge_release') return new Response(null, { status: 204 });
    if (fn === 'badge_finish') {
      if (o.finishStatus) return new Response('{}', { status: o.finishStatus });
      return Response.json({ remaining: queue.length, chained: queue.length > 0, notices: 2 });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  return { queue, rpcs, clock, fetchFn, calls: (fn: string) => rpcs.filter((r) => r.fn === fn) };
}

type EvaluateFn = BadgesDeps['evaluate'];

function depsFor(w: ReturnType<typeof world>, evaluate: EvaluateFn, vars: Record<string, string | undefined> = {}) {
  const lines: string[] = [];
  const env: Record<string, string | undefined> = {
    CRON_SECRET: SECRET,
    SUPABASE_URL: 'https://p.supabase.co',
    SUPABASE_SECRET_KEYS: '{"default":"sb_secret_abc"}',
    ...vars,
  };
  const deps: BadgesDeps = { env: (name) => env[name], fetch: w.fetchFn, evaluate, engine: 'sha256-prueba', clock: () => w.clock.t, log: (l) => lines.push(l) };
  return { deps, lines };
}

/** Un motor que da una insignia por trabajo. */
const oneAward: EvaluateFn = (job) => [{ kind: 'award', badge_key: 'debut', sport: 'bowling', job: job.id }];

const post = (body: unknown = {}, secret: string | null = SECRET) =>
  new Request('https://p.supabase.co/functions/v1/insignias', {
    method: 'POST',
    headers: secret === null ? {} : { 'x-cron-secret': secret },
    body: JSON.stringify(body),
  });

describe('ayudas', () => {
  it('el secreto se compara completo; la clave secreta nueva o la vieja', () => {
    expect(sameSecret(SECRET, SECRET)).toBe(true);
    expect(sameSecret(SECRET.slice(0, -1), SECRET)).toBe(false);
    expect(sameSecret('', SECRET)).toBe(false);
    const env = (vars: Record<string, string>) => (name: string) => vars[name];
    expect(secretKey(env({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.a.b' }))).toBe('sb_secret_x');
    expect(secretKey(env({ SUPABASE_SECRET_KEYS: 'no es json', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.a.b' }))).toBe('eyJ.a.b');
    expect(secretKey(env({}))).toBeNull();
  });

  it('la API REST: la clave nueva solo en apikey, la vieja también en Authorization; el error trae el SQLSTATE', async () => {
    const w = world({ claimStatus: 500 });
    await expect(createRestClient('https://p.supabase.co/', 'sb_secret_abc', w.fetchFn).rpc('badge_claim', { p_limit: 1 })).rejects.toThrow(
      'badge_claim: HTTP 500 (XX000)',
    );
    await createRestClient('https://p.supabase.co', 'eyJ.a.b', w.fetchFn)
      .rpc('badge_finish')
      .catch(() => null);
    expect(w.rpcs[0].headers).toEqual({ apikey: 'sb_secret_abc', 'Content-Type': 'application/json', Accept: 'application/json' });
    expect(w.rpcs[1].headers.Authorization).toBe('Bearer eyJ.a.b');
  });
});

describe('handleRequest', () => {
  it('sin el secreto no hace nada; sin CRON_SECRET, sin URL o sin clave no atiende; solo POST', async () => {
    const w = world({ jobs: 3 });
    const { deps } = depsFor(w, oneAward);
    expect((await handleRequest(post({}, null), deps)).status).toBe(401);
    expect((await handleRequest(post({}, 'otro-secreto-cualquiera-de-32-letras'), deps)).status).toBe(401);
    expect((await handleRequest(new Request('https://p.supabase.co/functions/v1/insignias'), deps)).status).toBe(405);
    expect((await handleRequest(post(), depsFor(w, oneAward, { CRON_SECRET: undefined }).deps)).status).toBe(503);
    expect((await handleRequest(post({}, 'corto'), depsFor(w, oneAward, { CRON_SECRET: 'corto' }).deps)).status).toBe(503);
    expect((await handleRequest(post(), depsFor(w, oneAward, { SUPABASE_URL: undefined }).deps)).status).toBe(503);
    expect((await handleRequest(post(), depsFor(w, oneAward, { SUPABASE_SECRET_KEYS: undefined }).deps)).status).toBe(503);
    expect(w.rpcs).toEqual([]);
  });

  it('toma de a 5, corre foto → motor → aplicar por trabajo y cierra la corrida; en el registro solo números', async () => {
    const w = world({ jobs: 7 });
    const seen: [number, unknown, string][] = [];
    const { deps, lines } = depsFor(w, (job, snapshot, now) => {
      seen.push([job.id, (snapshot.job as ClaimedJob).id, now]);
      return oneAward(job, snapshot, now);
    });
    const res = await handleRequest(post(), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      claimed: 7,
      applied: 7,
      failed: 0,
      gone: 0,
      released: 0,
      decisions: 7,
      awarded: 7,
      revoked: 0,
      reviews: 0,
      progress: 7,
      notices: 2,
      remaining: 0,
      chained: false,
      stopped: null,
      engine: 'sha256-prueba',
    });
    // La hora del motor es la de la foto (la del servidor), no la del reloj de la función.
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7].map((id) => [id, id, NOW]));
    expect(w.calls('badge_claim').map((r) => r.args)).toEqual([{ p_limit: CLAIM_CHUNK }, { p_limit: CLAIM_CHUNK }]);
    expect(w.rpcs.slice(1, 3).map((r) => [r.fn, r.args])).toEqual([
      ['badge_snapshot', { p_job: 1 }],
      ['badge_apply', { p_job: 1, p_decisions: [{ kind: 'award', badge_key: 'debut', sport: 'bowling', job: 1 }] }],
    ]);
    expect(w.rpcs.at(-1)?.fn).toBe('badge_finish');
    expect(w.calls('badge_fail')).toEqual([]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^insignias: 7 tomados · 7 aplicados · 0 con error · 0 ya no estaban · 0 devueltos · 7 dadas · .* · quedan 0$/);
  });

  it('hasta 25 por llamada (o lo pedido, de 1 a 50); si queda cola, la base encadena otra', async () => {
    const w = world({ jobs: 60 });
    const { deps } = depsFor(w, oneAward);
    expect(await (await handleRequest(post(), deps)).json()).toMatchObject({ claimed: 25, applied: 25, remaining: 35, chained: true });
    expect(w.calls('badge_claim').map((r) => r.args.p_limit)).toEqual([5, 5, 5, 5, 5]);
    w.rpcs.length = 0;
    expect(await (await handleRequest(post({ limit: 7 }), deps)).json()).toMatchObject({ claimed: 7, remaining: 28 });
    expect(w.calls('badge_claim').map((r) => r.args.p_limit)).toEqual([5, 2]);
    expect(await (await handleRequest(post({ limit: 500 }), deps)).json()).toMatchObject({ claimed: 28, remaining: 0, chained: false });
  });

  it('cola vacía: no cierra la corrida (no hay nada que avisar)', async () => {
    const w = world();
    const { deps, lines } = depsFor(w, oneAward);
    expect(await (await handleRequest(post(), deps)).json()).toMatchObject({ claimed: 0, remaining: 0, chained: false });
    expect(w.rpcs.map((r) => r.fn)).toEqual(['badge_claim']);
    expect(lines).toEqual([]);
  });

  it('lo que falla vuelve a la cola con su motivo; el trabajo que ya no existe se salta; los demás siguen', async () => {
    const w = world({
      jobs: 6,
      snapshot: (id) => (id === 2 ? null : { v: 1, now: NOW, job: jobOf(id) }),
      snapshotStatus: (id) => (id === 3 ? 500 : undefined),
      applyStatus: (id) => (id === 5 ? 503 : undefined),
      apply: (id, d) => (id === 6 ? { ok: false, error: 'insert or update violates check constraint' } : { ok: true, awarded: d.length }),
    });
    const { deps, lines } = depsFor(w, (job, snapshot, now) => {
      if (job.id === 4) throw new TypeError("Cannot read properties of undefined (reading 'scores')\n    at bowling.ts:10");
      return oneAward(job, snapshot, now);
    });
    const res = await handleRequest(post(), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ claimed: 6, applied: 1, failed: 4, gone: 1, awarded: 1 });
    // badge_apply con ok = false ya lo devolvió él (no se llama badge_fail otra vez).
    expect(w.calls('badge_fail').map((r) => r.args)).toEqual([
      // La foto es la que cuenta el intento: si falló, lo cuenta badge_fail.
      { p_job: 3, p_error: 'foto: HTTP 500 (57014)', p_charge: true },
      { p_job: 4, p_error: "motor: TypeError: Cannot read properties of undefined (reading 'scores') at bowling.ts:10" },
      { p_job: 5, p_error: 'aplicar: HTTP 503' },
    ]);
    expect(w.calls('badge_apply').map((r) => r.args.p_job)).toEqual([1, 5, 6]);
    expect(lines.slice(0, 4)).toEqual([
      'insignias: trabajo 3 (resultado): la foto falló (HTTP 500 (57014))',
      "insignias: trabajo 4 (resultado): el motor falló: TypeError: Cannot read properties of undefined (reading 'scores') at bowling.ts:10",
      'insignias: trabajo 5 (resultado): aplicar falló (HTTP 503)',
      'insignias: trabajo 6 (resultado): la base no aplicó las decisiones',
    ]);
  });

  it('un motor que no devuelve una lista es un error del motor', async () => {
    const w = world({ jobs: 1 });
    const { deps } = depsFor(w, () => ({ nope: true }) as unknown as unknown[]);
    expect(await (await handleRequest(post(), deps)).json()).toMatchObject({ applied: 0, failed: 1 });
    expect(w.calls('badge_fail')[0].args.p_error).toBe('motor: TypeError: el motor no devolvió una lista');
  });

  it('corta a los 100 s: no toma más y lo que ya tomó y no alcanzó vuelve a la cola', async () => {
    // Cada foto tarda 30 s en llegar: a los 4 trabajos ya pasaron 120 s.
    const w = world({ jobs: 12, latency: (fn) => (fn === 'badge_snapshot' ? 30_000 : 0) });
    const { deps, lines } = depsFor(w, oneAward);
    const res = await handleRequest(post(), deps);
    expect(await res.json()).toMatchObject({ claimed: 5, applied: 4, released: 1, stopped: 'tiempo', remaining: 7, chained: true });
    // Vuelve ya y sin gastar un intento (badge_release), no con espera como un error.
    expect(w.calls('badge_release').map((r) => r.args)).toEqual([{ p_job: 5 }]);
    expect(w.calls('badge_fail')).toEqual([]);
    expect(w.calls('badge_claim')).toHaveLength(1);
    expect(lines.at(-1)).toContain('(cortó por tiempo)');
  });

  it('corta por CPU (el motor cuenta; esperar la red no)', async () => {
    const w = world({ jobs: 12, latency: () => 5_000 });
    const { deps } = depsFor(w, (job, snapshot, now) => {
      w.clock.t += 500;
      return oneAward(job, snapshot, now);
    });
    // 500 ms por trabajo: tras el 3.º ya son 1,5 s de CPU (el límite es 1,2 s).
    expect(await (await handleRequest(post(), deps)).json()).toMatchObject({ claimed: 5, applied: 3, released: 2, stopped: 'cpu' });
    expect(w.calls('badge_release').map((r) => r.args.p_job)).toEqual([4, 5]);
    expect(w.calls('badge_fail')).toEqual([]);
  });

  it('cola que no responde: 502 sin tocar nada; cerrar que falla dos veces: 502 con los números', async () => {
    const down = world({ jobs: 3, claimStatus: 500 });
    const a = depsFor(down, oneAward);
    const res = await handleRequest(post(), a.deps);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'cola', claimed: 0 });
    expect(a.lines).toEqual(['insignias: no se pudo leer la cola (HTTP 500 (XX000))']);

    const w = world({ jobs: 2, finishStatus: 500 });
    const b = depsFor(w, oneAward);
    const res2 = await handleRequest(post(), b.deps);
    expect(res2.status).toBe(502);
    expect(await res2.json()).toMatchObject({ claimed: 2, applied: 2, remaining: null, chained: false });
    expect(w.calls('badge_finish')).toHaveLength(2);
  });
});
