/**
 * Pruebas de las Edge Functions de esports (docs/esports.md §8.4), con `fetch` de mentira y la base simulada:
 * - esports-verify (supabase/functions/esports-verify/core.ts): qué está encendido, buscar un Riot ID (solo LoL y
 *   VALORANT), sesión y origen;
 * - esports-auth (supabase/functions/esports-auth/core.ts): start → go → vuelta de Steam, Epic y Riot, con el
 *   state de un uso atado al navegador por la cookie;
 * - los adaptadores (supabase/functions/_shared/esports-providers.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  appRedirect,
  appUrlFrom,
  APP_URL,
  callbackUrl,
  goUrl,
  handleAuthRequest,
  readCookie,
  routeOf,
  STATE_COOKIE,
  type AuthDeps,
} from '../../supabase/functions/esports-auth/core';
import {
  basicAuth,
  createEsportsProviders,
  lolRank,
  PROVIDER_SECRETS,
  providerEnv,
  providerFetch,
  ProviderError,
  providersStatus,
  riotAccountHost,
  riotLookup,
  riotRegional,
  splitRiotId,
  steamPersonaName,
  type FetchLike,
  type ProviderEnv,
} from '../../supabase/functions/_shared/esports-providers';
import { handleVerifyRequest, parseVerifyBody, type DbError, type VerifyDeps } from '../../supabase/functions/esports-verify/core';

const APP = 'https://matchmate-oficial.vercel.app';
const SUPA = 'https://jbismsdjgjxutfvwnlmf.supabase.co';
const USER = '11111111-1111-4111-8111-111111111111';
const LOOKUP = '22222222-2222-4222-8222-222222222222';
const STATE = '44444444-4444-4444-8444-444444444444';
const TOKEN = 'aaa.bbb.ccc';
const PUUID = 'puuid-de-prueba-0123456789';

const ALL_SECRETS: ProviderEnv = {
  riotApiKey: 'RGAPI-secreta',
  riotClientId: 'riot-cliente',
  riotClientSecret: 'riot-secreto',
  epicClientId: 'epic-cliente',
  epicClientSecret: 'epic-secreto',
  steamWebApiKey: 'STEAM-secreta',
};

// ---------- fetch y base de mentira ----------

type Route = [RegExp, (url: string, init: RequestInit) => Response | Promise<Response>];
interface Call {
  url: string;
  init: RequestInit;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Un fetch que contesta según la URL (y anota cada llamada). Lo que no está en las rutas falla la prueba. */
function fakeFetch(routes: Route[]): FetchLike & { calls: Call[] } {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) throw new Error(`fetch sin ruta: ${url}`);
    return hit[1](url, init);
  }) as FetchLike & { calls: Call[] };
  fn.calls = calls;
  return fn;
}

type RpcFn = (args: Record<string, unknown>) => { data: unknown; error: DbError | null };
function fakeRpc(handlers: Record<string, RpcFn>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    const h = handlers[fn];
    if (!h) throw new Error(`rpc sin simular: ${fn}`);
    return h(args);
  };
  return { rpc, calls };
}

const okClaims: VerifyDeps['getClaims'] = async () => ({ data: { claims: { sub: USER, role: 'authenticated' } }, error: null });

const beginOk = (display: string, normalized: string): RpcFn => () => ({ data: { ok: true, display, normalized }, error: null });

function verifyDeps(env: ProviderEnv, fetchFn: FetchLike, handlers: Record<string, RpcFn>) {
  const r = fakeRpc(handlers);
  const deps: VerifyDeps = {
    allowedOrigins: [APP],
    configError: null,
    getClaims: okClaims,
    rpc: r.rpc,
    providers: createEsportsProviders(env, fetchFn),
  };
  return { deps, calls: r.calls };
}

function vreq(body: unknown, opts: { origin?: string | null; auth?: string | null; method?: string } = {}): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.origin !== null) headers.set('origin', opts.origin ?? APP);
  if (opts.auth !== null) headers.set('authorization', opts.auth ?? `Bearer ${TOKEN}`);
  const method = opts.method ?? 'POST';
  return new Request(`${SUPA}/functions/v1/esports-verify`, { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined });
}

const body = async (r: Response) => (await r.json()) as Record<string, unknown>;

// Riot: la cuenta y el rango de LoL.
const riotAccountRoute = (status = 200): Route => [
  /api\.riotgames\.com\/riot\/account\/v1\/accounts\/by-riot-id\//,
  () => (status === 200 ? json({ puuid: PUUID, gameName: 'Ñandú', tagLine: 'LAN' }) : json({ status: { status_code: status } }, status)),
];
const lolLeagueRoute = (entries: unknown, status = 200): Route => [
  /\.api\.riotgames\.com\/lol\/league\/v4\/entries\/by-puuid\//,
  () => (status === 200 ? json(entries) : json({}, status)),
];
const storeOk: RpcFn = () => ({ data: LOOKUP, error: null });

// ---------------------------------------------------------------------------------------------------------
describe('esports-verify: qué está encendido', () => {
  it('sin secretos: sin búsquedas, Steam siempre, Epic y Riot apagados', async () => {
    const { deps } = verifyDeps({}, fakeFetch([]), {});
    const r = await handleVerifyRequest(vreq({ action: 'providers' }), deps);
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe(APP);
    expect(await body(r)).toEqual({ lookup: [], link: { steam: true, epic: false, riot: false } });
  });

  it('con todos los secretos: solo VALORANT y LoL tienen búsqueda (en el orden del catálogo) y los tres logins', async () => {
    expect(providersStatus(ALL_SECRETS)).toEqual({ lookup: ['valorant', 'lol'], link: { steam: true, epic: true, riot: true } });
    const { deps } = verifyDeps(ALL_SECRETS, fakeFetch([]), {});
    // La respuesta trae solo `lookup` y `link` (ya no hay `autoCode`).
    expect(await body(await handleVerifyRequest(vreq({ action: 'providers' }), deps))).toEqual({
      lookup: ['valorant', 'lol'],
      link: { steam: true, epic: true, riot: true },
    });
  });

  it('cada búsqueda o login con lo suyo: STEAM_WEB_API_KEY no enciende búsqueda; Epic o Riot con un solo secreto del par: apagado', () => {
    expect(providersStatus({ steamWebApiKey: 's' })).toEqual({ lookup: [], link: { steam: true, epic: false, riot: false } });
    expect(providersStatus({ riotApiKey: 'k' })).toEqual({ lookup: ['valorant', 'lol'], link: { steam: true, epic: false, riot: false } });
    expect(providersStatus({ epicClientId: 'x', riotClientSecret: 'y' })).toEqual({ lookup: [], link: { steam: true, epic: false, riot: false } });
    // RSO sin RIOT_API_KEY: «Conectar con Riot» sí, «Buscar» no.
    expect(providersStatus({ riotClientId: 'a', riotClientSecret: 'b' })).toEqual({ lookup: [], link: { steam: true, epic: false, riot: true } });
  });

  it('lee los secretos con sus nombres exactos (vacío o espacios = no está; TRN y Clash Royale ya no existen)', () => {
    expect(Object.values(PROVIDER_SECRETS).sort()).toEqual(
      ['EPIC_CLIENT_ID', 'EPIC_CLIENT_SECRET', 'RIOT_API_KEY', 'RIOT_CLIENT_ID', 'RIOT_CLIENT_SECRET', 'STEAM_WEB_API_KEY'].sort(),
    );
    const vars: Record<string, string> = {
      RIOT_API_KEY: ' k1 ',
      RIOT_CLIENT_ID: '',
      EPIC_CLIENT_ID: 'e1',
      EPIC_CLIENT_SECRET: 'e2',
      STEAM_WEB_API_KEY: '   ',
      CLASH_ROYALE_API_KEY: 'c1',
      TRN_API_KEY: 't1',
    };
    expect(providerEnv((n) => vars[n])).toEqual({ riotApiKey: 'k1', epicClientId: 'e1', epicClientSecret: 'e2' });
    expect(providerEnv((n) => (n === 'STEAM_WEB_API_KEY' ? 'S' : null))).toEqual({ steamWebApiKey: 'S' });
  });
});

describe('esports-verify: sesión, origen y cuerpo', () => {
  const { deps } = verifyDeps({}, fakeFetch([]), {});

  it('sin JWT → 401; JWT que no vale → 401; anónimo → 401; getClaims caído → 500', async () => {
    expect((await handleVerifyRequest(vreq({ action: 'providers' }, { auth: null }), deps)).status).toBe(401);
    const bad: VerifyDeps = { ...deps, getClaims: async () => ({ data: null, error: { name: 'AuthInvalidJwtError', status: 401 } }) };
    expect((await handleVerifyRequest(vreq({ action: 'providers' }), bad)).status).toBe(401);
    const anon: VerifyDeps = { ...deps, getClaims: async () => ({ data: { claims: { sub: USER, role: 'authenticated', is_anonymous: true } }, error: null }) };
    expect((await handleVerifyRequest(vreq({ action: 'providers' }), anon)).status).toBe(401);
    const down: VerifyDeps = { ...deps, getClaims: async () => ({ data: null, error: { name: 'AuthRetryableFetchError', status: 0 } }) };
    expect((await handleVerifyRequest(vreq({ action: 'providers' }), down)).status).toBe(500);
  });

  it('un origen fuera de SCAN_ALLOWED_ORIGINS → 403; preflight de la app → 204 con CORS', async () => {
    const r = await handleVerifyRequest(vreq({ action: 'providers' }, { origin: 'https://otra.com' }), deps);
    expect(r.status).toBe(403);
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
    const pre = await handleVerifyRequest(vreq(null, { method: 'OPTIONS', auth: null }), deps);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('GET → 405; acción desconocida (también la vieja `challenge`) o datos malos → 400; falta configurar → 500', async () => {
    const { deps: d, calls } = verifyDeps(ALL_SECRETS, fakeFetch([]), {});
    expect((await handleVerifyRequest(vreq(null, { method: 'GET' }), d)).status).toBe(405);
    expect((await handleVerifyRequest(vreq({ action: 'borrar' }), d)).status).toBe(400);
    expect((await handleVerifyRequest(vreq({ action: 'lookup', game: 'LoL', id: 'x#y' }), d)).status).toBe(400);
    const challenge = await handleVerifyRequest(vreq({ action: 'challenge', appealId: '33333333-3333-4333-8333-333333333333', side: 'claimant' }), d);
    expect(challenge.status).toBe(400);
    expect(await body(challenge)).toMatchObject({ code: 'invalido' });
    expect(calls).toEqual([]);
    expect((await handleVerifyRequest(vreq({ action: 'providers' }), { ...d, configError: 'falta SUPABASE_URL' })).status).toBe(500);
  });

  it('parseVerifyBody', () => {
    expect(parseVerifyBody('{"action":"lookup","game":"lol","id":"Ñandú#LAN","region":"la1"}')).toEqual({ action: 'lookup', game: 'lol', id: 'Ñandú#LAN', platform: '', region: 'la1' });
    expect(parseVerifyBody('{"action":"lookup","game":"nba_2k","id":"Yo","platform":"psn"}')).toMatchObject({ platform: 'psn' });
    expect(parseVerifyBody('{"action":"lookup","game":"lol","id":"   "}')).toBeNull();
    expect(parseVerifyBody('{"action":"lookup","game":"lol","id":"x","region":"LA-1"}')).toBeNull();
    expect(parseVerifyBody('{"action":"providers"}')).toEqual({ action: 'providers' });
    expect(parseVerifyBody('{"action":"challenge","appealId":"33333333-3333-4333-8333-333333333333","side":"holder"}')).toBeNull();
    expect(parseVerifyBody('no es json')).toBeNull();
    expect(parseVerifyBody('[1]')).toBeNull();
  });
});

describe('esports-verify: buscar un Riot ID', () => {
  it('sin RIOT_API_KEY, LoL → no_disponible (sin contar la búsqueda ni llamar a nadie)', async () => {
    const f = fakeFetch([]);
    const { deps, calls } = verifyDeps({}, f, {});
    const r = await handleVerifyRequest(vreq({ action: 'lookup', game: 'lol', id: 'Ñandú#LAN' }), deps);
    expect(await body(r)).toEqual({ status: 'no_disponible' });
    expect(calls).toEqual([]);
    expect(f.calls).toEqual([]);
  });

  it('con RIOT_API_KEY: LoL encuentra la cuenta y mapea GOLD II → {tier: gold, div: 2}; la base guarda la búsqueda', async () => {
    const f = fakeFetch([riotAccountRoute(), lolLeagueRoute([{ queueType: 'RANKED_FLEX_SR', tier: 'DIAMOND', rank: 'I' }, { queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II' }])]);
    const { deps, calls } = verifyDeps({ riotApiKey: 'RGAPI-secreta' }, f, {
      esports_begin_lookup: beginOk('Ñandú#LAN', 'Ñandú#lan'),
      esports_store_lookup: storeOk,
    });
    const r = await handleVerifyRequest(vreq({ action: 'lookup', game: 'lol', id: ' Ñandú#LAN ', region: 'la1' }), deps);
    const out = await body(r);
    expect(out).toEqual({ status: 'found', lookupId: LOOKUP, displayName: 'Ñandú#LAN', ranks: { main: { tier: 'gold', div: 2 } } });

    // La cuenta por la ruta regional (la1 → americas) con el nombre y el tag codificados; el rango en la plataforma la1.
    expect(f.calls[0].url).toBe(`https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent('Ñandú')}/LAN`);
    expect(new Headers(f.calls[0].init.headers).get('x-riot-token')).toBe('RGAPI-secreta');
    expect(f.calls[1].url).toBe(`https://la1.api.riotgames.com/lol/league/v4/entries/by-puuid/${PUUID}`);

    expect(calls.map((c) => c.fn)).toEqual(['esports_begin_lookup', 'esports_store_lookup']);
    expect(calls[0].args).toEqual({ p_user: USER, p_game: 'lol', p_id: ' Ñandú#LAN ', p_platform: '' });
    expect(calls[1].args).toEqual({
      p_user: USER,
      p_game: 'lol',
      p_platform: '',
      p_id: ' Ñandú#LAN ',
      p_found: true,
      p_display: 'Ñandú#LAN',
      p_external: PUUID,
      p_ranks: { main: { tier: 'gold', div: 2 } },
      p_provider: 'riot',
    });
    // Nunca sale la clave ni la respuesta cruda.
    expect(JSON.stringify(out)).not.toContain('RGAPI');
    expect(JSON.stringify(out)).not.toContain(PUUID);
  });

  it('LoL en otro servidor: la cuenta por su ruta regional y el rango en su plataforma (EUW, OCE); sin Solo/Dúo (404) → sin rango', async () => {
    for (const [region, host, platform] of [
      ['euw1', 'europe', 'euw1'],
      ['oc1', 'asia', 'oc1'],
      ['', 'americas', 'la1'],
    ] as const) {
      const f = fakeFetch([riotAccountRoute(), lolLeagueRoute(null, 404)]);
      const { deps } = verifyDeps({ riotApiKey: 'k' }, f, { esports_begin_lookup: beginOk('Ñandú#LAN', 'Ñandú#lan'), esports_store_lookup: storeOk });
      const out = await body(await handleVerifyRequest(vreq({ action: 'lookup', game: 'lol', id: 'Ñandú#LAN', region }), deps));
      expect(out).toEqual({ status: 'found', lookupId: LOOKUP, displayName: 'Ñandú#LAN', ranks: {} });
      expect(new URL(f.calls[0].url).host).toBe(`${host}.api.riotgames.com`);
      expect(new URL(f.calls[1].url).host).toBe(`${platform}.api.riotgames.com`);
    }
  });

  it('lolRank: sin entrada de Solo/Dúo, sin rango; de Maestro para arriba sin división', () => {
    expect(lolRank([])).toEqual({});
    expect(lolRank([{ queueType: 'RANKED_SOLO_5x5', tier: 'MASTER', rank: 'I' }])).toEqual({ main: { tier: 'master' } });
    expect(lolRank([{ queueType: 'RANKED_SOLO_5x5', tier: 'IRON', rank: 'IV' }])).toEqual({ main: { tier: 'iron', div: 4 } });
    expect(lolRank([{ queueType: 'RANKED_SOLO_5x5', tier: 'WOOD', rank: 'I' }])).toEqual({});
    expect(lolRank('nada')).toEqual({});
  });

  it('VALORANT: solo «existe», sin rango y sin preguntar el rango; EUW va por europe y sin región por americas (latam)', async () => {
    const f = fakeFetch([riotAccountRoute()]);
    const { deps, calls } = verifyDeps({ riotApiKey: 'k' }, f, {
      esports_begin_lookup: beginOk('Ñandú#LAN', 'Ñandú#lan'),
      esports_store_lookup: storeOk,
    });
    const out = await body(await handleVerifyRequest(vreq({ action: 'lookup', game: 'valorant', id: 'Ñandú#LAN', region: 'eu' }), deps));
    expect(out).toEqual({ status: 'found', lookupId: LOOKUP, displayName: 'Ñandú#LAN', ranks: {} });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toMatch(/^https:\/\/europe\.api\.riotgames\.com\/riot\/account\/v1\//);
    // La base recibe la búsqueda sin rangos (VALORANT no tiene rango verificado).
    expect(calls[1].args).toMatchObject({ p_game: 'valorant', p_found: true, p_external: PUUID, p_ranks: {}, p_provider: 'riot' });

    const g = fakeFetch([riotAccountRoute()]);
    const latam = verifyDeps({ riotApiKey: 'k' }, g, { esports_begin_lookup: beginOk('Ñandú#LAN', 'Ñandú#lan'), esports_store_lookup: storeOk });
    await handleVerifyRequest(vreq({ action: 'lookup', game: 'valorant', id: 'Ñandú#LAN' }), latam.deps);
    expect(g.calls[0].url).toMatch(/^https:\/\/americas\.api\.riotgames\.com\//);
  });

  it('404 → not_found (la búsqueda queda guardada como no encontrada)', async () => {
    const { deps, calls } = verifyDeps({ riotApiKey: 'k' }, fakeFetch([riotAccountRoute(404)]), {
      esports_begin_lookup: beginOk('Nadie#000', 'nadie#000'),
      esports_store_lookup: storeOk,
    });
    expect(await body(await handleVerifyRequest(vreq({ action: 'lookup', game: 'lol', id: 'Nadie#000' }), deps))).toEqual({ status: 'not_found' });
    expect(calls[1].args).toMatchObject({ p_found: false, p_display: null, p_external: null, p_ranks: {}, p_provider: 'riot' });
  });

  it('429 → rate_limited; 500 → error; el rango que falla con 503 → error', async () => {
    for (const [status, expected] of [
      [429, 'rate_limited'],
      [500, 'error'],
      [503, 'error'],
    ] as const) {
      const { deps, calls } = verifyDeps({ riotApiKey: 'k' }, fakeFetch([riotAccountRoute(status)]), { esports_begin_lookup: beginOk('A#B12', 'a#b12') });
      expect(await body(await handleVerifyRequest(vreq({ action: 'lookup', game: 'lol', id: 'A#B12' }), deps))).toEqual({ status: expected });
      // Nada se guarda cuando el proveedor no contestó.
      expect(calls.map((c) => c.fn)).toEqual(['esports_begin_lookup']);
    }
    const { deps } = verifyDeps({ riotApiKey: 'k' }, fakeFetch([riotAccountRoute(), lolLeagueRoute(null, 503)]), { esports_begin_lookup: beginOk('A#B12', 'a#b12') });
    expect(await body(await handleVerifyRequest(vreq({ action: 'lookup', game: 'lol', id: 'A#B12' }), deps))).toEqual({ status: 'error' });
  });

  it('más de 6 s o sin red → error', async () => {
    const slow: FetchLike = (_url, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    await expect(providerFetch(slow, 'https://x', {}, 20)).rejects.toMatchObject({ kind: 'error' });
    await expect(providerFetch(async () => Promise.reject(new TypeError('fetch failed')), 'https://x')).rejects.toBeInstanceOf(ProviderError);
    await expect(providerFetch(async () => json({}, 429), 'https://x')).rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('la base dice rate_limited (20 por hora) → rate_limited; ID que no sirve → not_found, sin llamar al proveedor', async () => {
    const f = fakeFetch([]);
    const limited = verifyDeps({ riotApiKey: 'k' }, f, { esports_begin_lookup: () => ({ data: { ok: false, reason: 'rate_limited' }, error: null }) });
    expect(await body(await handleVerifyRequest(vreq({ action: 'lookup', game: 'lol', id: 'A#B12' }), limited.deps))).toEqual({ status: 'rate_limited' });
    const bad = verifyDeps({ riotApiKey: 'k' }, f, { esports_begin_lookup: () => ({ data: { ok: false, reason: 'invalido' }, error: null }) });
    expect(await body(await handleVerifyRequest(vreq({ action: 'lookup', game: 'lol', id: 'sin-tag' }), bad.deps))).toEqual({ status: 'not_found' });
    const raised = verifyDeps({ riotApiKey: 'k' }, f, { esports_begin_lookup: () => ({ data: null, error: { message: 'rate_limited', code: 'P0001' } }) });
    expect(await body(await handleVerifyRequest(vreq({ action: 'lookup', game: 'lol', id: 'A#B12' }), raised.deps))).toEqual({ status: 'rate_limited' });
    expect(f.calls).toEqual([]);
    // Si la base falla, error (y no se llama al proveedor).
    const broken = verifyDeps({ riotApiKey: 'k' }, f, { esports_begin_lookup: () => ({ data: null, error: { message: 'boom', code: 'XX000' } }) });
    expect(await body(await handleVerifyRequest(vreq({ action: 'lookup', game: 'lol', id: 'A#B12' }), broken.deps))).toEqual({ status: 'error' });
    expect(f.calls).toEqual([]);
  });

  it('si la base no guarda la búsqueda → error (sin lookupId)', async () => {
    const { deps } = verifyDeps({ riotApiKey: 'k' }, fakeFetch([riotAccountRoute(), lolLeagueRoute([])]), {
      esports_begin_lookup: beginOk('Ñandú#LAN', 'Ñandú#lan'),
      esports_store_lookup: () => ({ data: null, error: { message: 'invalido', code: 'P0001' } }),
    });
    expect(await body(await handleVerifyRequest(vreq({ action: 'lookup', game: 'lol', id: 'Ñandú#LAN' }), deps))).toEqual({ status: 'error' });
  });

  it('los juegos sin búsqueda (CS2, Clash Royale, Fortnite, FC…) → no_disponible aunque estén todas las claves, sin contar ni llamar a nadie', async () => {
    for (const game of ['cs2', 'clash_royale', 'fortnite', 'rocket_league', 'ea_fc']) {
      const f = fakeFetch([]);
      const { deps, calls } = verifyDeps(ALL_SECRETS, f, {});
      expect(await body(await handleVerifyRequest(vreq({ action: 'lookup', game, id: '22202' }), deps))).toEqual({ status: 'no_disponible' });
      expect(calls).toEqual([]);
      expect(f.calls).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('los adaptadores', () => {
  it('Riot ID: se parte en el último #; rutas regionales', () => {
    expect(splitRiotId('Ana#B#LAN')).toEqual({ name: 'Ana#B', tag: 'LAN' });
    expect(splitRiotId('Ana')).toBeNull();
    expect(splitRiotId('#LAN')).toBeNull();
    expect(splitRiotId('Ana#')).toBeNull();
    expect(['la1', 'la2', 'na1', 'br1', 'latam', 'na', 'br'].map(riotRegional)).toEqual(Array(7).fill('americas'));
    expect(['euw1', 'eun1', 'eu'].map(riotRegional)).toEqual(['europe', 'europe', 'europe']);
    expect(['kr', 'jp1', 'ap'].map(riotRegional)).toEqual(['asia', 'asia', 'asia']);
    expect(riotRegional('oc1')).toBe('sea');
    // account-v1 no atiende en sea: va por asia.
    expect(riotAccountHost('sea')).toBe('asia');
    expect(riotRegional('marte')).toBeNull();
  });

  it('riotLookup: un ID sin #TAG → no existe, sin llamar a Riot; una cuenta sin puuid → no existe', async () => {
    const none = fakeFetch([]);
    expect(await riotLookup(none, 'k', { game: 'lol', display: 'SinTag', region: '' })).toEqual({ found: false });
    expect(none.calls).toEqual([]);
    const empty = fakeFetch([[/by-riot-id/, () => json({ gameName: 'Ana', tagLine: 'LAN' })]]);
    expect(await riotLookup(empty, 'k', { game: 'valorant', display: 'Ana#LAN', region: '' })).toEqual({ found: false });
  });

  it('steamPersonaName (solo para el nombre al conectar): el nombre, null si no está; clave mala → error', async () => {
    const f = fakeFetch([[/^https:\/\/api\.steampowered\.com\/ISteamUser\/GetPlayerSummaries\/v2\//, () => json({ response: { players: [{ steamid: '76561197960287930', personaname: 'Rafa' }] } })]]);
    expect(await steamPersonaName(f, 'S', '76561197960287930')).toBe('Rafa');
    const url = new URL(f.calls[0].url);
    expect(url.searchParams.get('steamids')).toBe('76561197960287930');
    expect(url.searchParams.get('key')).toBe('S');
    expect(await steamPersonaName(fakeFetch([[/steampowered/, () => json({ response: { players: [] } })]]), 'S', '76561197960287930')).toBeNull();
    await expect(steamPersonaName(fakeFetch([[/steampowered/, () => json({}, 403)]]), 'S', '76561197960287930')).rejects.toBeInstanceOf(ProviderError);
  });

  it('Basic con id:secreto en base64', () => {
    expect(basicAuth('a', 'b')).toBe(`Basic ${btoa('a:b')}`);
  });
});

// ---------------------------------------------------------------------------------------------------------
// esports-auth

type Store = { states: Map<string, { userId: string; provider: string; game: string; used: boolean }> };

function authDeps(env: ProviderEnv, fetchFn: FetchLike, extra: Partial<Record<string, RpcFn>> = {}) {
  const store: Store = { states: new Map() };
  const r = fakeRpc({
    esports_link_begin: (a) => {
      store.states.set(STATE, { userId: String(a.p_user), provider: String(a.p_provider), game: String(a.p_game), used: false });
      return { data: STATE, error: null };
    },
    esports_link_take: (a) => {
      const s = store.states.get(String(a.p_state));
      if (!s || s.used) return { data: null, error: null };
      s.used = true;
      return { data: { userId: s.userId, provider: s.provider, game: s.game }, error: null };
    },
    esports_link_account: () => ({ data: 'ok', error: null }),
    ...(extra as Record<string, RpcFn>),
  });
  const deps: AuthDeps = {
    allowedOrigins: [APP],
    configError: null,
    supabaseUrl: SUPA,
    appUrl: APP_URL,
    getClaims: okClaims,
    rpc: r.rpc,
    providers: createEsportsProviders(env, fetchFn),
  };
  return { deps, calls: r.calls, store };
}

const fnUrl = (path: string) => `${SUPA}/functions/v1/esports-auth/${path}`;

function startReq(body: unknown, opts: { auth?: string | null; origin?: string | null } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.origin !== null) headers.set('origin', opts.origin ?? APP);
  if (opts.auth !== null) headers.set('authorization', opts.auth ?? `Bearer ${TOKEN}`);
  return new Request(fnUrl('start'), { method: 'POST', headers, body: JSON.stringify(body) });
}

function goReq(url: string, opts: { origin?: string | null; method?: string } = {}) {
  const headers = new Headers({ 'content-type': 'application/x-www-form-urlencoded' });
  if (opts.origin !== null) headers.set('origin', opts.origin ?? APP);
  const method = opts.method ?? 'POST';
  return new Request(url, { method, headers, body: method === 'POST' ? '' : undefined });
}

function callbackReq(provider: string, params: Record<string, string>, cookieState: string | null = STATE) {
  const headers = new Headers();
  if (cookieState) headers.set('cookie', `otra=1; ${STATE_COOKIE}=${cookieState}`);
  return new Request(`${fnUrl(`${provider}/callback`)}?${new URLSearchParams(params).toString()}`, { method: 'GET', headers });
}

/** Una aserción de Steam como la que devuelve steamcommunity.com (lo que firma y para qué return_to). */
function steamAssertion(returnTo: string, id64 = '76561197960287930'): Record<string, string> {
  const claimed = `https://steamcommunity.com/openid/id/${id64}`;
  return {
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': claimed,
    'openid.identity': claimed,
    'openid.return_to': returnTo,
    'openid.response_nonce': '2026-10-08T12:00:00ZaBcD',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'firma=',
  };
}

const location = (r: Response) => new URL(r.headers.get('location') ?? '');

describe('esports-auth: las URLs', () => {
  it('las vueltas exactas que se registran y a dónde vuelve la persona', () => {
    expect(callbackUrl(SUPA, 'epic')).toBe('https://jbismsdjgjxutfvwnlmf.supabase.co/functions/v1/esports-auth/epic/callback');
    expect(callbackUrl(SUPA, 'riot')).toBe('https://jbismsdjgjxutfvwnlmf.supabase.co/functions/v1/esports-auth/riot/callback');
    expect(callbackUrl(`${SUPA}/`, 'steam')).toBe('https://jbismsdjgjxutfvwnlmf.supabase.co/functions/v1/esports-auth/steam/callback');
    expect(appRedirect(APP_URL, { provider: 'epic', game: 'fortnite' })).toBe('https://matchmate-oficial.vercel.app/esports/mi-id?conectado=epic&juego=fortnite');
    expect(appRedirect(APP_URL, { error: 'proveedor', game: 'cs2' })).toBe('https://matchmate-oficial.vercel.app/esports/mi-id?error=proveedor&juego=cs2');
    expect(appRedirect(APP_URL, { error: 'estado_vencido' })).toBe('https://matchmate-oficial.vercel.app/esports/mi-id?error=estado_vencido');
    // APP_ORIGIN gana (staging); si no es un origen, producción.
    expect(appUrlFrom('https://staging.matchmate.do/')).toBe('https://staging.matchmate.do');
    expect(appUrlFrom('javascript:alert(1)')).toBe(APP_URL);
    expect(appUrlFrom(undefined)).toBe(APP_URL);
  });

  it('la ruta dentro de la función (con o sin /functions/v1) y las cookies', () => {
    expect(routeOf(new URL(fnUrl('steam/callback')))).toBe('steam/callback');
    expect(routeOf(new URL('http://localhost/esports-auth/start'))).toBe('start');
    expect(readCookie(`a=1; ${STATE_COOKIE}=${STATE}; b=2`, STATE_COOKIE)).toBe(STATE);
    expect(readCookie('a=1', STATE_COOKIE)).toBeNull();
  });
});

describe('esports-auth: start', () => {
  it('sin JWT → 401; origen ajeno → 403; juego de otro proveedor → 400', async () => {
    const { deps, calls } = authDeps({}, fakeFetch([]));
    expect((await handleAuthRequest(startReq({ provider: 'steam', game: 'cs2' }, { auth: null }), deps)).status).toBe(401);
    expect((await handleAuthRequest(startReq({ provider: 'steam', game: 'cs2' }, { origin: 'https://otra.com' }), deps)).status).toBe(403);
    expect((await handleAuthRequest(startReq({ provider: 'steam', game: 'lol' }), deps)).status).toBe(400);
    expect((await handleAuthRequest(startReq({ provider: 'google', game: 'cs2' }), deps)).status).toBe(400);
    // Los juegos sin login (Clash Royale, FC…) no se conectan con nadie.
    expect((await handleAuthRequest(startReq({ provider: 'steam', game: 'clash_royale' }), deps)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('Epic o Riot sin sus secretos → no_disponible (sin pedir state)', async () => {
    const { deps, calls } = authDeps({}, fakeFetch([]));
    expect(await body(await handleAuthRequest(startReq({ provider: 'epic', game: 'fortnite' }), deps))).toEqual({ status: 'no_disponible' });
    expect(await body(await handleAuthRequest(startReq({ provider: 'riot', game: 'valorant' }), deps))).toEqual({ status: 'no_disponible' });
    // RIOT_API_KEY (la búsqueda) no enciende «Conectar con Riot»: eso es RSO.
    const onlyKey = authDeps({ riotApiKey: 'k' }, fakeFetch([]));
    expect(await body(await handleAuthRequest(startReq({ provider: 'riot', game: 'lol' }), onlyKey.deps))).toEqual({ status: 'no_disponible' });
    expect(calls).toEqual([]);
    expect(onlyKey.calls).toEqual([]);
  });

  it('Steam (siempre encendido): pide el state a la base y devuelve la URL del paso «go»', async () => {
    const { deps, calls } = authDeps({}, fakeFetch([]));
    const r = await handleAuthRequest(startReq({ provider: 'steam', game: 'cs2' }), deps);
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe(APP);
    expect(await body(r)).toEqual({ status: 'ok', url: goUrl(SUPA, { provider: 'steam', game: 'cs2', state: STATE }) });
    expect(calls).toEqual([{ fn: 'esports_link_begin', args: { p_user: USER, p_provider: 'steam', p_game: 'cs2' } }]);
  });

  it('la base pone el límite (10 por hora) → 429', async () => {
    const { deps } = authDeps({}, fakeFetch([]), { esports_link_begin: () => ({ data: null, error: { message: 'rate_limited', code: 'P0001' } }) });
    const r = await handleAuthRequest(startReq({ provider: 'steam', game: 'cs2' }), deps);
    expect(r.status).toBe(429);
    expect(await body(r)).toMatchObject({ code: 'rate_limited' });
  });
});

describe('esports-auth: go (el navegador que empieza)', () => {
  const go = goUrl(SUPA, { provider: 'steam', game: 'cs2', state: STATE });

  it('Steam: arma openid.return_to con el state y ata el state al navegador con la cookie', async () => {
    const { deps } = authDeps({}, fakeFetch([]));
    const r = await handleAuthRequest(goReq(go), deps);
    expect(r.status).toBe(303);
    const to = location(r);
    expect(`${to.origin}${to.pathname}`).toBe('https://steamcommunity.com/openid/login');
    expect(to.searchParams.get('openid.mode')).toBe('checkid_setup');
    expect(to.searchParams.get('openid.return_to')).toBe(`${callbackUrl(SUPA, 'steam')}?state=${STATE}`);
    expect(to.searchParams.get('openid.realm')).toBe(SUPA);
    expect(to.searchParams.get('openid.claimed_id')).toBe('http://specs.openid.net/auth/2.0/identifier_select');
    const cookie = r.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`${STATE_COOKIE}=${STATE}`);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=600/);
  });

  it('Epic y Riot: la URL de autorizar con client_id, scope, la vuelta registrada y el state', async () => {
    const { deps } = authDeps(ALL_SECRETS, fakeFetch([]));
    const epic = location(await handleAuthRequest(goReq(goUrl(SUPA, { provider: 'epic', game: 'rocket_league', state: STATE })), deps));
    expect(`${epic.origin}${epic.pathname}`).toBe('https://www.epicgames.com/id/authorize');
    expect(Object.fromEntries(epic.searchParams)).toEqual({
      client_id: 'epic-cliente',
      response_type: 'code',
      scope: 'basic_profile',
      redirect_uri: 'https://jbismsdjgjxutfvwnlmf.supabase.co/functions/v1/esports-auth/epic/callback',
      state: STATE,
    });
    const riot = location(await handleAuthRequest(goReq(goUrl(SUPA, { provider: 'riot', game: 'lol', state: STATE })), deps));
    expect(`${riot.origin}${riot.pathname}`).toBe('https://auth.riotgames.com/authorize');
    expect(Object.fromEntries(riot.searchParams)).toEqual({
      client_id: 'riot-cliente',
      redirect_uri: 'https://jbismsdjgjxutfvwnlmf.supabase.co/functions/v1/esports-auth/riot/callback',
      response_type: 'code',
      scope: 'openid',
      state: STATE,
    });
  });

  it('desde otra página (otro Origin, o sin él) o con GET: vuelve a la app con error y sin cookie', async () => {
    const { deps } = authDeps({}, fakeFetch([]));
    for (const r of [
      await handleAuthRequest(goReq(go, { origin: 'https://atacante.com' }), deps),
      await handleAuthRequest(goReq(go, { origin: null }), deps),
      await handleAuthRequest(goReq(go, { method: 'GET' }), deps),
    ]) {
      expect(r.status).toBe(303);
      expect(r.headers.get('location')).toBe(`${APP}/esports/mi-id?error=estado_vencido&juego=cs2`);
      expect(r.headers.get('set-cookie')).toBeNull();
    }
    // Epic sin secretos: no disponible.
    const epic = await handleAuthRequest(goReq(goUrl(SUPA, { provider: 'epic', game: 'fortnite', state: STATE })), deps);
    expect(epic.headers.get('location')).toBe(`${APP}/esports/mi-id?error=no_disponible&juego=fortnite`);
  });
});

describe('esports-auth: vuelta de Steam', () => {
  const returnTo = `${callbackUrl(SUPA, 'steam')}?state=${STATE}`;
  const steamCheck = (valid: boolean): Route => [/^https:\/\/steamcommunity\.com\/openid\/login$/, () => new Response(`ns:http://specs.openid.net/auth/2.0\nis_valid:${valid}\n`)];
  const persona: Route = [/steampowered/, () => json({ response: { players: [{ steamid: '76561197960287930', personaname: 'Rafa' }] } })];

  async function begin(deps: AuthDeps) {
    await handleAuthRequest(startReq({ provider: 'steam', game: 'cs2' }), deps);
  }

  it('is_valid:true → esports_link_account con el SteamID64 (y el nombre con STEAM_WEB_API_KEY) → conectado', async () => {
    const f = fakeFetch([steamCheck(true), persona]);
    const { deps, calls } = authDeps({ steamWebApiKey: 'S' }, f);
    await begin(deps);
    const r = await handleAuthRequest(callbackReq('steam', { state: STATE, ...steamAssertion(returnTo) }), deps);
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe(`${APP}/esports/mi-id?conectado=steam&juego=cs2`);
    expect(r.headers.get('set-cookie')).toMatch(new RegExp(`${STATE_COOKIE}=; Max-Age=0`));
    // La comprobación con Steam: POST con todo lo openid.* y mode=check_authentication.
    const check = f.calls[0];
    expect(check.init.method).toBe('POST');
    const sent = new URLSearchParams(String(check.init.body));
    expect(sent.get('openid.mode')).toBe('check_authentication');
    expect(sent.get('openid.sig')).toBe('firma=');
    expect(sent.get('openid.return_to')).toBe(returnTo);
    expect(sent.has('state')).toBe(false);
    expect(calls.map((c) => c.fn)).toEqual(['esports_link_begin', 'esports_link_take', 'esports_link_account']);
    expect(calls[2].args).toEqual({ p_user: USER, p_game: 'cs2', p_provider: 'steam', p_external_id: '76561197960287930', p_display: 'Rafa' });
  });

  it('sin STEAM_WEB_API_KEY, o si Steam no da el nombre: se conecta igual, sin nombre', async () => {
    const { deps, calls } = authDeps({}, fakeFetch([steamCheck(true)]));
    await begin(deps);
    const r = await handleAuthRequest(callbackReq('steam', { state: STATE, ...steamAssertion(returnTo) }), deps);
    expect(r.headers.get('location')).toBe(`${APP}/esports/mi-id?conectado=steam&juego=cs2`);
    expect(calls[2].args).toMatchObject({ p_external_id: '76561197960287930', p_display: null });

    const badKey = authDeps({ steamWebApiKey: 'mala' }, fakeFetch([steamCheck(true), [/steampowered/, () => json({}, 403)]]));
    await begin(badKey.deps);
    const r2 = await handleAuthRequest(callbackReq('steam', { state: STATE, ...steamAssertion(returnTo) }), badKey.deps);
    expect(r2.headers.get('location')).toBe(`${APP}/esports/mi-id?conectado=steam&juego=cs2`);
    expect(badKey.calls[2].args).toMatchObject({ p_external_id: '76561197960287930', p_display: null });
  });

  it('is_valid:false → error=proveedor (sin conectar)', async () => {
    const { deps, calls } = authDeps({}, fakeFetch([steamCheck(false)]));
    await begin(deps);
    const r = await handleAuthRequest(callbackReq('steam', { state: STATE, ...steamAssertion(returnTo) }), deps);
    expect(r.headers.get('location')).toBe(`${APP}/esports/mi-id?error=proveedor&juego=cs2`);
    expect(calls.map((c) => c.fn)).not.toContain('esports_link_account');
  });

  it('una aserción para otra vuelta, sin firmar lo que importa o cancelada → proveedor (sin preguntar a Steam)', async () => {
    for (const params of [
      steamAssertion(`${callbackUrl(SUPA, 'steam')}?state=55555555-5555-4555-8555-555555555555`),
      { ...steamAssertion(returnTo), 'openid.signed': 'signed,op_endpoint,identity,return_to,response_nonce' },
      { ...steamAssertion(returnTo), 'openid.claimed_id': 'https://evil.example/openid/id/76561197960287930' },
      { 'openid.mode': 'cancel' },
    ]) {
      const f = fakeFetch([]);
      const { deps } = authDeps({}, f);
      await begin(deps);
      const r = await handleAuthRequest(callbackReq('steam', { state: STATE, ...params }), deps);
      expect(r.headers.get('location')).toBe(`${APP}/esports/mi-id?error=proveedor&juego=cs2`);
      expect(f.calls).toEqual([]);
    }
  });

  it('sin la cookie del navegador que empezó (o con otra) → estado_vencido, y el state no se gasta', async () => {
    const { deps, calls, store } = authDeps({}, fakeFetch([steamCheck(true)]));
    await begin(deps);
    for (const cookie of [null, '55555555-5555-4555-8555-555555555555']) {
      const r = await handleAuthRequest(callbackReq('steam', { state: STATE, ...steamAssertion(returnTo) }, cookie), deps);
      expect(r.headers.get('location')).toBe(`${APP}/esports/mi-id?error=estado_vencido`);
    }
    expect(calls.map((c) => c.fn)).toEqual(['esports_link_begin']);
    expect(store.states.get(STATE)?.used).toBe(false);
  });

  it('un state usado, vencido o de otro proveedor → estado_vencido', async () => {
    const { deps } = authDeps({}, fakeFetch([steamCheck(true), steamCheck(true)]));
    await begin(deps);
    expect((await handleAuthRequest(callbackReq('steam', { state: STATE, ...steamAssertion(returnTo) }), deps)).headers.get('location')).toContain('conectado=steam');
    // El mismo otra vez: ya se usó.
    expect((await handleAuthRequest(callbackReq('steam', { state: STATE, ...steamAssertion(returnTo) }), deps)).headers.get('location')).toBe(
      `${APP}/esports/mi-id?error=estado_vencido`,
    );
    // Un state de Steam en la vuelta de Epic.
    const epic = authDeps(ALL_SECRETS, fakeFetch([]));
    await handleAuthRequest(startReq({ provider: 'steam', game: 'cs2' }), epic.deps);
    expect((await handleAuthRequest(callbackReq('epic', { state: STATE, code: 'c' }), epic.deps)).headers.get('location')).toBe(
      `${APP}/esports/mi-id?error=estado_vencido&juego=cs2`,
    );
  });

  it('si otra cuenta lo tenía conectado, la base lo pasa a esta y devuelve ok → conectado (ya no hay id_tomado)', async () => {
    // La base mueve el ID ella sola (y le avisa a la otra cuenta): la función solo ve 'ok'.
    const { deps, calls } = authDeps({}, fakeFetch([steamCheck(true)]), { esports_link_account: () => ({ data: 'ok', error: null }) });
    await begin(deps);
    const r = await handleAuthRequest(callbackReq('steam', { state: STATE, ...steamAssertion(returnTo) }), deps);
    expect(r.headers.get('location')).toBe(`${APP}/esports/mi-id?conectado=steam&juego=cs2`);
    expect(calls.map((c) => c.fn)).toEqual(['esports_link_begin', 'esports_link_take', 'esports_link_account']);
  });

  it('la base dice invalido → proveedor; otra respuesta o un error → no_disponible', async () => {
    for (const [answer, expected] of [
      [{ data: null, error: { message: 'invalido', code: 'P0001' } }, 'proveedor'],
      [{ data: 'id_tomado', error: null }, 'no_disponible'],
      [{ data: null, error: { message: 'boom', code: 'XX000' } }, 'no_disponible'],
    ] as const) {
      const { deps } = authDeps({}, fakeFetch([steamCheck(true)]), { esports_link_account: () => answer });
      await begin(deps);
      const r = await handleAuthRequest(callbackReq('steam', { state: STATE, ...steamAssertion(returnTo) }), deps);
      expect(r.headers.get('location')).toBe(`${APP}/esports/mi-id?error=${expected}&juego=cs2`);
    }
  });

  it('Steam no contesta → no_disponible', async () => {
    const { deps } = authDeps({}, fakeFetch([[/steamcommunity/, () => new Response('', { status: 502 })]]));
    await begin(deps);
    const r = await handleAuthRequest(callbackReq('steam', { state: STATE, ...steamAssertion(returnTo) }), deps);
    expect(r.headers.get('location')).toBe(`${APP}/esports/mi-id?error=no_disponible&juego=cs2`);
  });
});

describe('esports-auth: vuelta de Epic y Riot', () => {
  const epicRoutes = (tokenStatus = 200): Route[] => [
    [/^https:\/\/api\.epicgames\.dev\/epic\/oauth\/v2\/token$/, () => (tokenStatus === 200 ? json({ access_token: 'epic-token', token_type: 'bearer', account_id: 'epic-acc-1' }) : json({ errorCode: 'x' }, tokenStatus))],
    [/^https:\/\/api\.epicgames\.dev\/epic\/id\/v2\/accounts\?/, () => json([{ accountId: 'epic-acc-1', displayName: 'AnaRL', preferredLanguage: 'es' }])],
  ];
  const riotRoutes: Route[] = [
    [/^https:\/\/auth\.riotgames\.com\/token$/, () => json({ access_token: 'riot-token', id_token: 'x', token_type: 'Bearer' })],
    [/^https:\/\/americas\.api\.riotgames\.com\/riot\/account\/v1\/accounts\/me$/, () => json({ puuid: PUUID, gameName: 'Ana', tagLine: 'LAN' })],
  ];

  it('Epic: cambia el code por el token (cuerpo, cabeceras y Basic correctos) y conecta con el Epic ID', async () => {
    const f = fakeFetch(epicRoutes());
    const { deps, calls } = authDeps(ALL_SECRETS, f);
    await handleAuthRequest(startReq({ provider: 'epic', game: 'fortnite' }), deps);
    const r = await handleAuthRequest(callbackReq('epic', { code: 'el-code', state: STATE }), deps);
    expect(r.headers.get('location')).toBe(`${APP}/esports/mi-id?conectado=epic&juego=fortnite`);

    const token = f.calls[0];
    expect(token.url).toBe('https://api.epicgames.dev/epic/oauth/v2/token');
    expect(token.init.method).toBe('POST');
    const h = new Headers(token.init.headers);
    expect(h.get('authorization')).toBe(`Basic ${btoa('epic-cliente:epic-secreto')}`);
    expect(h.get('content-type')).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(new URLSearchParams(String(token.init.body)))).toEqual({
      grant_type: 'authorization_code',
      code: 'el-code',
      redirect_uri: 'https://jbismsdjgjxutfvwnlmf.supabase.co/functions/v1/esports-auth/epic/callback',
    });
    expect(f.calls[1].url).toBe('https://api.epicgames.dev/epic/id/v2/accounts?accountId=epic-acc-1');
    expect(new Headers(f.calls[1].init.headers).get('authorization')).toBe('Bearer epic-token');
    expect(calls.at(-1)).toEqual({ fn: 'esports_link_account', args: { p_user: USER, p_game: 'fortnite', p_provider: 'epic', p_external_id: 'epic-acc-1', p_display: 'AnaRL' } });
  });

  it('Epic dice que no (token 400, o error=access_denied) → proveedor', async () => {
    const { deps } = authDeps(ALL_SECRETS, fakeFetch(epicRoutes(400)));
    await handleAuthRequest(startReq({ provider: 'epic', game: 'rocket_league' }), deps);
    expect((await handleAuthRequest(callbackReq('epic', { code: 'c', state: STATE }), deps)).headers.get('location')).toBe(
      `${APP}/esports/mi-id?error=proveedor&juego=rocket_league`,
    );
    const denied = authDeps(ALL_SECRETS, fakeFetch([]));
    await handleAuthRequest(startReq({ provider: 'epic', game: 'rocket_league' }), denied.deps);
    expect((await handleAuthRequest(callbackReq('epic', { error: 'access_denied', state: STATE }), denied.deps)).headers.get('location')).toBe(
      `${APP}/esports/mi-id?error=proveedor&juego=rocket_league`,
    );
  });

  it('Riot: token con Basic en auth.riotgames.com y la cuenta en accounts/me → gameName#tagLine', async () => {
    const f = fakeFetch(riotRoutes);
    const { deps, calls } = authDeps(ALL_SECRETS, f);
    await handleAuthRequest(startReq({ provider: 'riot', game: 'valorant' }), deps);
    const r = await handleAuthRequest(callbackReq('riot', { code: 'riot-code', state: STATE }), deps);
    expect(r.headers.get('location')).toBe(`${APP}/esports/mi-id?conectado=riot&juego=valorant`);
    const token = f.calls[0];
    expect(new Headers(token.init.headers).get('authorization')).toBe(`Basic ${btoa('riot-cliente:riot-secreto')}`);
    expect(Object.fromEntries(new URLSearchParams(String(token.init.body)))).toEqual({
      grant_type: 'authorization_code',
      code: 'riot-code',
      redirect_uri: 'https://jbismsdjgjxutfvwnlmf.supabase.co/functions/v1/esports-auth/riot/callback',
    });
    expect(new Headers(f.calls[1].init.headers).get('authorization')).toBe('Bearer riot-token');
    expect(calls.at(-1)?.args).toEqual({ p_user: USER, p_game: 'valorant', p_provider: 'riot', p_external_id: PUUID, p_display: 'Ana#LAN' });
  });

  it('un state usado → error=estado_vencido (sin cambiar el code)', async () => {
    const f = fakeFetch(riotRoutes);
    const { deps, store } = authDeps(ALL_SECRETS, f);
    await handleAuthRequest(startReq({ provider: 'riot', game: 'lol' }), deps);
    store.states.get(STATE)!.used = true;
    const r = await handleAuthRequest(callbackReq('riot', { code: 'riot-code', state: STATE }), deps);
    expect(r.headers.get('location')).toBe(`${APP}/esports/mi-id?error=estado_vencido`);
    expect(f.calls).toEqual([]);
  });

  it('una ruta que no existe → 404', async () => {
    const { deps } = authDeps({}, fakeFetch([]));
    expect((await handleAuthRequest(new Request(fnUrl('google/callback')), deps)).status).toBe(404);
  });
});
