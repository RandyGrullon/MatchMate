import { describe, expect, it, vi } from 'vitest';
import {
  classifyGemini,
  corsHeaders,
  dbFailure,
  DEFAULT_MODELS,
  geminiRequest,
  geminiSchema,
  handleScanRequest,
  MAX_IMAGE_BYTES,
  modelsAfter,
  parseModels,
  parseOrigins,
  parseScanRequest,
  sanitizeScan,
  SCAN_PROMPT,
  SCAN_RESPONSE_SCHEMA,
  scanCacheKey,
  scanConfig,
  sha256Hex,
  type DbError,
  type ScanDeps,
} from '../../supabase/functions/_shared/scan-core';

// Pruebas de la Edge Function scan-bowling (su lógica vive en supabase/functions/_shared/scan-core.ts).

const APP = 'https://matchmate.app';
const USER = '11111111-1111-4111-8111-111111111111';
const LEAGUE = '22222222-2222-4222-8222-222222222222';
const EVENT = '33333333-3333-4333-8333-333333333333';
const [M1, M2] = DEFAULT_MODELS;

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
const JPEG_B64 = b64([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 200 }, (_, i) => i % 256)]);
const WEBP_B64 = b64([...'RIFF'].map((c) => c.charCodeAt(0)).concat([1, 2, 3, 4], [...'WEBPVP8 '].map((c) => c.charCodeAt(0)), Array(200).fill(7)));
const JPEG = `data:image/jpeg;base64,${JPEG_B64}`;

const SCREEN = {
  esPantallaDeBoliche: true,
  soloTotales: false,
  jugadores: [{ nombre: 'LUIS G', handicap: null, juegos: [180, 0, 200], total: 380 }],
};

describe('prompt y schema de BowlingX', () => {
  it('no cambian sin querer (SHA-256 del prompt y del schema que mandaba Firebase AI Logic)', async () => {
    // Si esto falla: el prompt o el schema ya no son los de BowlingX. Si fue a propósito, vuelve a pasar las 32
    // fotos de prueba, actualiza los hashes y sube SCAN_CACHE_VERSION.
    expect(await sha256Hex(SCAN_PROMPT)).toBe('715f0b9ea41f9cace49d5ea549eebe2c163997dcb085dda5b92b404e0b5237be');
    expect(await sha256Hex(JSON.stringify(SCAN_RESPONSE_SCHEMA))).toBe('f2d9f9555e17e81484b01fbce909016743c731b59e8c48da0a06803622b016e5');
  });

  it('para la API REST los tipos van en mayúscula y lo demás igual', () => {
    const s = geminiSchema(SCAN_RESPONSE_SCHEMA) as typeof SCAN_RESPONSE_SCHEMA & Record<string, never>;
    expect(s.type).toBe('OBJECT');
    expect(s.properties.jugadores.type).toBe('ARRAY');
    expect(s.properties.jugadores.items.properties.juegos.items).toEqual({ type: 'INTEGER', nullable: false });
    expect(s.properties.jugadores.items.properties.handicap).toEqual({ type: 'INTEGER', nullable: true, description: 'Handicap mostrado, o null' });
    expect(s.required).toEqual(['esPantallaDeBoliche', 'soloTotales', 'jugadores']);
    // El original no se toca.
    expect(SCAN_RESPONSE_SCHEMA.type).toBe('object');
  });

  it('el pedido: prompt, foto y schema con temperatura 0 y respuesta JSON', () => {
    const body = geminiRequest({ mimeType: 'image/webp', base64: 'QUJD' });
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: SCAN_PROMPT }, { inlineData: { mimeType: 'image/webp', data: 'QUJD' } }] }]);
    expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json', temperature: 0 });
    expect(body.generationConfig.responseSchema).toEqual(geminiSchema(SCAN_RESPONSE_SCHEMA));
  });
});

describe('la petición de la app', () => {
  it('JPEG o WebP en data URL, con la liga y el evento (o sin evento)', () => {
    const r = parseScanRequest({ image: JPEG, leagueId: LEAGUE.toUpperCase(), eventId: EVENT });
    expect(r).toEqual({
      ok: true,
      request: { mimeType: 'image/jpeg', base64: JPEG_B64, bytes: 204, leagueId: LEAGUE, eventId: EVENT },
    });
    const w = parseScanRequest({ image: `data:image/webp;base64,${WEBP_B64}`, leagueId: LEAGUE });
    expect(w.ok && w.request).toMatchObject({ mimeType: 'image/webp', eventId: null });
  });

  it('rechaza lo que no sirve', () => {
    const bad = (body: unknown) => {
      const r = parseScanRequest(body);
      expect(r.ok).toBe(false);
      return r.ok ? '' : r.message;
    };
    expect(bad(null)).toMatch(/liga/);
    expect(bad({ image: JPEG, leagueId: 'liga-1' })).toMatch(/liga/);
    expect(bad({ image: JPEG, leagueId: LEAGUE, eventId: 'x' })).toMatch(/evento/);
    expect(bad({ leagueId: LEAGUE })).toMatch(/Falta la foto/);
    expect(bad({ image: `data:image/png;base64,${JPEG_B64}`, leagueId: LEAGUE })).toMatch(/JPEG o WebP/);
    expect(bad({ image: 'data:image/jpeg;base64,no es base64!', leagueId: LEAGUE })).toMatch(/JPEG o WebP/);
    // Dice JPEG pero es WebP (o basura).
    expect(bad({ image: `data:image/jpeg;base64,${WEBP_B64}`, leagueId: LEAGUE })).toMatch(/dañada/);
    expect(bad({ image: `data:image/jpeg;base64,${b64([0xff, 0xd8, 0xff])}`, leagueId: LEAGUE })).toMatch(/dañada/);
    // Más de 1 MB.
    const big = 'A'.repeat(4 * Math.ceil((MAX_IMAGE_BYTES + 3) / 3));
    expect(bad({ image: `data:image/jpeg;base64,/9j/${big}`, leagueId: LEAGUE })).toMatch(/muy grande/);
  });

  it('la clave de la caché: SHA-256 de la foto (la misma foto, la misma clave)', async () => {
    const k = await scanCacheKey(JPEG_B64);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(await scanCacheKey(JPEG_B64)).toBe(k);
    expect(await scanCacheKey(WEBP_B64)).not.toBe(k);
  });
});

describe('respuestas de Gemini', () => {
  const ok = (text: string, extra: Record<string, unknown> = {}) => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP', ...extra }] });

  it('200 con texto: ok (sin las partes de pensamiento)', () => {
    expect(classifyGemini(200, ok('{"a":1}'))).toEqual({ kind: 'ok', text: '{"a":1}' });
    const thinking = { candidates: [{ content: { parts: [{ text: 'pienso…', thought: true }, { text: '{"b":2}' }] } }] };
    expect(classifyGemini(200, thinking)).toEqual({ kind: 'ok', text: '{"b":2}' });
  });

  it('bloqueada, cortada o vacía: la foto no sirve', () => {
    expect(classifyGemini(200, { promptFeedback: { blockReason: 'SAFETY' } })).toMatchObject({ kind: 'foto' });
    expect(classifyGemini(200, ok('{"a":', { finishReason: 'MAX_TOKENS' }))).toMatchObject({ kind: 'foto' });
    expect(classifyGemini(200, { candidates: [] })).toMatchObject({ kind: 'foto' });
    expect(classifyGemini(400, { error: { status: 'INVALID_ARGUMENT', message: 'Unable to process input image.' } })).toMatchObject({ kind: 'foto' });
  });

  it('429, 5xx y modelo que no existe: probar el siguiente', () => {
    const quota = { error: { status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' }] } };
    expect(classifyGemini(429, quota)).toEqual({ kind: 'next', reason: 'cupo', retryAfter: 37 });
    expect(classifyGemini(429, null)).toEqual({ kind: 'next', reason: 'cupo', retryAfter: undefined });
    expect(classifyGemini(503, null)).toEqual({ kind: 'next', reason: 'servidor' });
    expect(classifyGemini(500, { error: { message: 'Internal' } })).toEqual({ kind: 'next', reason: 'servidor' });
    expect(classifyGemini(404, { error: { status: 'NOT_FOUND' } })).toEqual({ kind: 'next', reason: 'modelo' });
  });

  it('clave, permisos o región: configuración (reintentar no sirve)', () => {
    expect(classifyGemini(403, { error: { status: 'PERMISSION_DENIED', message: 'SERVICE_DISABLED' } }).kind).toBe('config');
    expect(classifyGemini(401, null).kind).toBe('config');
    expect(classifyGemini(400, { error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' } }).kind).toBe('config');
    const region = { error: { status: 'FAILED_PRECONDITION', message: 'User location is not supported for the API use without a billing account linked.' } };
    expect(classifyGemini(400, region).kind).toBe('config');
  });

  it('lo que se guarda: solo lo del schema, con topes', () => {
    const raw = {
      esPantallaDeBoliche: true,
      extra: 'no',
      jugadores: [{ nombre: `  ${'X'.repeat(80)} `, handicap: 12.7, juegos: [190, '150', 170.9, null], total: 'mucho', otro: 1 }, 'raro'],
    };
    expect(sanitizeScan(raw)).toEqual({
      esPantallaDeBoliche: true,
      jugadores: [
        { nombre: 'X'.repeat(60), handicap: 12, juegos: [190, 0, 170, 0], total: null },
        { nombre: '', handicap: null, juegos: [], total: null },
      ],
    });
    expect(sanitizeScan([1])).toBeNull();
    expect(sanitizeScan('x')).toBeNull();
  });
});

describe('configuración', () => {
  it('modelos, orígenes y límites desde las variables', () => {
    expect(parseModels(undefined)).toEqual(DEFAULT_MODELS);
    expect(parseModels(' Gemini-X, gemini-y ,gemini-x, mal nombre!')).toEqual(['gemini-x', 'gemini-y', 'mal']);
    expect(modelsAfter(['a', 'b', 'c'], 'a')).toEqual(['b', 'c']);
    expect(modelsAfter(['a', 'b'], 'b')).toEqual([]);
    expect(parseOrigins('https://matchmate.app/, http://localhost:5173 javascript:alert(1),https://a.b/c')).toEqual([APP, 'http://localhost:5173']);
    const env: Record<string, string> = { GEMINI_API_KEY: ' k ', SCAN_ALLOWED_ORIGINS: APP, SCAN_MODEL_RPM: '5000', SCAN_TIMEOUT_MS: '90000' };
    expect(scanConfig((n) => env[n])).toEqual({ apiKey: 'k', allowedOrigins: [APP], models: DEFAULT_MODELS, perMinute: 1000, timeoutMs: 20_000 });
    expect(scanConfig(() => undefined)).toMatchObject({ apiKey: null, allowedOrigins: [], perMinute: 12, timeoutMs: 20_000 });
  });

  it('CORS solo para los orígenes de la app', () => {
    expect(corsHeaders(APP, [APP])).toMatchObject({ 'access-control-allow-origin': APP, vary: 'Origin' });
    expect(corsHeaders(APP, [APP])!['access-control-allow-headers']).toContain('x-client-info');
    expect(corsHeaders('https://otra.com', [APP])).toBeNull();
    expect(corsHeaders(null, [APP])).toBeNull();
  });

  it('errores de la base → respuesta', () => {
    expect(dbFailure({ code: '42501', message: 'no_permitido' }).code).toBe('no_permitido');
    expect(dbFailure({ code: 'P0001', message: 'no_existe' }).code).toBe('no_existe');
    expect(dbFailure({ code: 'P0001', message: 'cerrado' }).code).toBe('cerrado');
    expect(dbFailure({ code: 'P0001', message: 'invalido' }).code).toBe('invalido');
    expect(dbFailure({ code: 'PGRST000', message: 'Could not connect' }).code).toBe('servidor');
  });
});

// ---------- La función completa, con dependencias falsas ----------

type Reply = Response | ((signal: AbortSignal) => Promise<Response>);

function geminiOk(json: unknown) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] }, finishReason: 'STOP' }] }), { status: 200 });
}
const geminiError = (status: number, body: unknown = { error: { status: 'X' } }) => new Response(JSON.stringify(body), { status });

function setup(opts: { begin?: unknown; beginError?: DbError; next?: (string | null)[]; replies?: Record<string, Reply[]>; deps?: Partial<ScanDeps> } = {}) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const fetchCalls: { url: string; init: RequestInit }[] = [];
  const next = [...(opts.next ?? [])];
  const replies = opts.replies ?? { [M1]: [geminiOk(SCREEN)] };
  const deps: ScanDeps = {
    apiKey: 'CLAVE',
    allowedOrigins: [APP],
    models: [...DEFAULT_MODELS],
    perMinute: 12,
    timeoutMs: 1_000,
    fetch: vi.fn(async (url: string, init: RequestInit) => {
      fetchCalls.push({ url, init });
      const model = /models\/([^:]+):/.exec(url)![1];
      const r = replies[model]?.shift();
      if (!r) throw new Error(`sin respuesta para ${model}`);
      return typeof r === 'function' ? r(init.signal!) : r;
    }),
    getClaims: vi.fn(async (token: string) =>
      token === 'aaa.bbb.ccc' ? { data: { claims: { sub: USER, role: 'authenticated', is_anonymous: false } }, error: null } : { data: null, error: { name: 'AuthInvalidJwtError', status: 401 } },
    ),
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === 'scan_begin') return opts.beginError ? { data: null, error: opts.beginError } : { data: opts.begin ?? { status: 'ok', model: M1, left: 39 }, error: null };
      if (fn === 'scan_next_model') return { data: next.length ? next.shift()! : null, error: null };
      return { data: null, error: null };
    }),
    log: () => {},
    ...opts.deps,
  };
  return { deps, rpcCalls, fetchCalls };
}

function request(body: unknown, headers: Record<string, string> = {}, method = 'POST') {
  return new Request('https://proyecto.supabase.co/functions/v1/scan-bowling', {
    method,
    headers: { authorization: 'Bearer aaa.bbb.ccc', origin: APP, 'content-type': 'application/json', ...headers },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

const BODY = { image: JPEG, leagueId: LEAGUE, eventId: EVENT };
const ROW = { name: 'LUIS G', handicap: null, games: [180, null, 200], total: 380, matchesTotal: true };

describe('la Edge Function', () => {
  it('OPTIONS de la app: 204 con CORS; otra página web: 403', async () => {
    const { deps } = setup();
    const pre = await handleScanRequest(request(null, {}, 'OPTIONS'), deps);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe(APP);
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST');
    const other = await handleScanRequest(request(BODY, { origin: 'https://otra.com' }), deps);
    expect(other.status).toBe(403);
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    expect((await handleScanRequest(request(null, {}, 'GET'), deps)).status).toBe(405);
  });

  it('sin sesión o con un token que no vale: 401', async () => {
    const { deps, rpcCalls } = setup();
    for (const authorization of ['', 'Bearer sb_publishable_abc', 'Bearer xxx.yyy.zzz']) {
      const res = await handleScanRequest(request(BODY, { authorization }), deps);
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ code: 'sesion' });
    }
    // Anónima o de otro rol: tampoco.
    deps.getClaims = async () => ({ data: { claims: { sub: USER, role: 'authenticated', is_anonymous: true } }, error: null });
    expect((await handleScanRequest(request(BODY), deps)).status).toBe(401);
    deps.getClaims = async () => ({ data: { claims: { sub: USER, role: 'service_role' } }, error: null });
    expect((await handleScanRequest(request(BODY), deps)).status).toBe(401);
    // Auth no responde: 503 (se reintenta).
    deps.getClaims = async () => ({ data: null, error: { name: 'AuthRetryableFetchError', status: 0 } });
    expect((await handleScanRequest(request(BODY), deps)).status).toBe(503);
    expect(rpcCalls).toEqual([]);
  });

  it('lee con el primer modelo: filas, se guarda en la caché y el pedido es el de BowlingX', async () => {
    const { deps, rpcCalls, fetchCalls } = setup();
    const res = await handleScanRequest(request(BODY), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(APP);
    expect(await res.json()).toEqual({ rows: [ROW], model: M1, cached: false });

    const key = await scanCacheKey(JPEG_B64);
    expect(rpcCalls[0]).toEqual({
      fn: 'scan_begin',
      args: { p_user: USER, p_league: LEAGUE, p_event: EVENT, p_key: key, p_models: DEFAULT_MODELS, p_per_minute: 12 },
    });
    expect(rpcCalls[1]).toEqual({
      fn: 'scan_finish',
      args: { p_user: USER, p_key: key, p_model: M1, p_result: sanitizeScan(SCREEN), p_refund: false },
    });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${M1}:generateContent`);
    expect(fetchCalls[0].init.headers).toMatchObject({ 'x-goog-api-key': 'CLAVE' });
    expect(JSON.parse(String(fetchCalls[0].init.body))).toEqual(geminiRequest({ mimeType: 'image/jpeg', base64: JPEG_B64 }));
  });

  it('de la caché: no llama a Gemini ni gasta', async () => {
    const { deps, rpcCalls, fetchCalls } = setup({ begin: { status: 'cached', result: SCREEN, model: M2 } });
    const res = await handleScanRequest(request({ image: JPEG, leagueId: LEAGUE }), deps);
    expect(await res.json()).toEqual({ rows: [ROW], model: M2, cached: true });
    expect(rpcCalls.map((c) => c.fn)).toEqual(['scan_begin']);
    expect(rpcCalls[0].args.p_event).toBeNull();
    expect(fetchCalls).toHaveLength(0);
  });

  it('sin cupo en el primero (429): pasa al siguiente con cupo y lee', async () => {
    const { deps, rpcCalls, fetchCalls } = setup({ next: [M2], replies: { [M1]: [geminiError(429)], [M2]: [geminiOk(SCREEN)] } });
    const res = await handleScanRequest(request(BODY), deps);
    expect(await res.json()).toEqual({ rows: [ROW], model: M2, cached: false });
    expect(fetchCalls.map((c) => c.url.includes(M2))).toEqual([false, true]);
    expect(rpcCalls.map((c) => c.fn)).toEqual(['scan_begin', 'scan_next_model', 'scan_finish']);
    expect(rpcCalls[1].args).toEqual({ p_models: [M2], p_per_minute: 12 });
    expect(rpcCalls[2].args).toMatchObject({ p_model: M2, p_refund: false });
  });

  it('20 s como máximo por modelo; si ninguno responde: {retry} y la lectura se devuelve', async () => {
    const hang = (signal: AbortSignal) => new Promise<Response>((_, reject) => signal.addEventListener('abort', () => reject(new Error('abortado'))));
    const { deps, rpcCalls } = setup({ next: [M2], replies: { [M1]: [hang], [M2]: [geminiError(503)] }, deps: { timeoutMs: 20 } });
    const res = await handleScanRequest(request(BODY), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ retry: true, reason: 'servidor', retryAfter: 10 });
    expect(rpcCalls.at(-1)).toEqual({ fn: 'scan_finish', args: expect.objectContaining({ p_result: null, p_refund: true }) });

    const slow = setup({ replies: { [M1]: [hang] }, deps: { timeoutMs: 20 } });
    expect(await (await handleScanRequest(request(BODY), slow.deps)).json()).toMatchObject({ retry: true, reason: 'tiempo' });
  });

  it('los dos sin cupo: {retry, cupo} con la espera que diga Google; nunca más de 2 modelos', async () => {
    const quota = { error: { status: 'RESOURCE_EXHAUSTED', details: [{ retryDelay: '42s' }] } };
    const { deps, rpcCalls, fetchCalls } = setup({
      next: [M2, 'gemini-3'],
      replies: { [M1]: [geminiError(429, quota)], [M2]: [geminiError(429, quota)], 'gemini-3': [geminiOk(SCREEN)] },
      deps: { models: [M1, M2, 'gemini-3'] },
    });
    const res = await handleScanRequest(request(BODY), deps);
    expect(await res.json()).toMatchObject({ retry: true, reason: 'cupo', retryAfter: 42 });
    expect(fetchCalls).toHaveLength(2);
    expect(rpcCalls.filter((c) => c.fn === 'scan_next_model')).toHaveLength(1);
  });

  it('sin otro modelo con cupo en este minuto: reintentar más tarde', async () => {
    const { deps, fetchCalls } = setup({ next: [null], replies: { [M1]: [geminiError(429)] } });
    expect(await (await handleScanRequest(request(BODY), deps)).json()).toMatchObject({ retry: true, reason: 'cupo', retryAfter: 60 });
    expect(fetchCalls).toHaveLength(1);
  });

  it('los cupos de la base', async () => {
    const run = async (begin: unknown) => {
      const { deps, fetchCalls } = setup({ begin });
      const res = await handleScanRequest(request(BODY), deps);
      expect(fetchCalls).toHaveLength(0);
      return { status: res.status, body: await res.json() };
    };
    expect(await run({ status: 'limit', reason: 'espera', retry_after: 5, limit: 8 })).toEqual({
      status: 200,
      body: expect.objectContaining({ retry: true, reason: 'espera', retryAfter: 5 }),
    });
    expect(await run({ status: 'limit', reason: 'ocupado', retry_after: 33, limit: 12 })).toEqual({
      status: 200,
      body: expect.objectContaining({ retry: true, reason: 'cupo', retryAfter: 33 }),
    });
    const user = await run({ status: 'limit', reason: 'usuario', retry_after: 9000, limit: 40 });
    expect(user.status).toBe(429);
    expect(user.body).toMatchObject({ code: 'limite', message: expect.stringContaining('40 fotos') });
    expect((await run({ status: 'limit', reason: 'global', retry_after: 9000, limit: 900 })).body).toMatchObject({ code: 'limite' });
    expect((await run({ status: 'raro' })).status).toBe(503);
  });

  it('permisos de la base: 403, 404, 409', async () => {
    const statusFor = async (message: string, code = 'P0001') => {
      const { deps } = setup({ beginError: { code, message } });
      return (await handleScanRequest(request(BODY), deps)).status;
    };
    expect(await statusFor('no_permitido', '42501')).toBe(403);
    expect(await statusFor('no_existe')).toBe(404);
    expect(await statusFor('cerrado')).toBe(409);
    expect(await statusFor('invalido')).toBe(400);
    expect(await statusFor('timeout', '57014')).toBe(503);
  });

  it('foto que no es de boliche: 422 y queda en la caché (la misma foto no gasta otra vez)', async () => {
    const { deps, rpcCalls } = setup({ replies: { [M1]: [geminiOk({ esPantallaDeBoliche: false, jugadores: [] })] } });
    const res = await handleScanRequest(request(BODY), deps);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ code: 'foto', message: 'La foto no parece una pantalla de resultados de boliche.' });
    expect(rpcCalls.at(-1)?.args).toMatchObject({ p_result: { esPantallaDeBoliche: false, jugadores: [] }, p_refund: false });
  });

  it('respuesta bloqueada o que no es JSON: 422 sin guardar', async () => {
    const blocked = new Response(JSON.stringify({ promptFeedback: { blockReason: 'OTHER' } }), { status: 200 });
    const broken = new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"jugadores": [' }] } }] }), { status: 200 });
    for (const reply of [blocked, broken]) {
      const { deps, rpcCalls } = setup({ replies: { [M1]: [reply] } });
      const res = await handleScanRequest(request(BODY), deps);
      expect(res.status).toBe(422);
      expect(rpcCalls.at(-1)?.args).toMatchObject({ p_result: null, p_refund: false });
    }
  });

  it('clave de Gemini mala o sin GEMINI_API_KEY: 500 config (la lectura se devuelve)', async () => {
    const { deps, rpcCalls } = setup({ replies: { [M1]: [geminiError(403, { error: { status: 'PERMISSION_DENIED' } })] } });
    const res = await handleScanRequest(request(BODY), deps);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: 'config' });
    expect(rpcCalls.at(-1)?.args).toMatchObject({ p_refund: true });

    const none = setup({ deps: { apiKey: null } });
    expect((await handleScanRequest(request(BODY), none.deps)).status).toBe(500);
    expect(none.rpcCalls).toEqual([]);
  });

  it('modelos que no existen (404 en todos): config', async () => {
    const { deps } = setup({ next: [M2], replies: { [M1]: [geminiError(404)], [M2]: [geminiError(404)] } });
    expect(await (await handleScanRequest(request(BODY), deps)).json()).toMatchObject({ code: 'config' });
  });

  it('foto inválida, cuerpo roto o muy grande: 400 sin gastar', async () => {
    const { deps, rpcCalls } = setup();
    expect((await handleScanRequest(request({ image: 'x', leagueId: LEAGUE }), deps)).status).toBe(400);
    const broken = new Request('https://x/f', { method: 'POST', headers: { authorization: 'Bearer aaa.bbb.ccc' }, body: '{' });
    expect((await handleScanRequest(broken, deps)).status).toBe(400);
    expect((await handleScanRequest(request(BODY, { 'content-length': String(5_000_000) }), deps)).status).toBe(400);
    expect(rpcCalls).toEqual([]);
  });

  it('un error inesperado nunca se escapa: 503', async () => {
    const { deps } = setup();
    deps.rpc = async () => {
      throw new Error('se cayó');
    };
    const res = await handleScanRequest(request(BODY), deps);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'servidor' });
  });
});
