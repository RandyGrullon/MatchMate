/**
 * Edge Function `esports-verify` (docs/esports.md §8.2): buscar un Riot ID con la API de Riot (solo LoL y VALORANT) y
 * decir qué está encendido. Toda la lógica está aquí; index.ts solo arma las dependencias (el cliente con la clave
 * secreta y los adaptadores de ../_shared/esports-providers.ts).
 *
 * TypeScript puro y SIN imports (Deno exige la extensión `.ts` en las rutas y el tsc de la app no la acepta). Los
 * adaptadores llegan en `deps.providers`. Pruebas: src/lib/esportsFunctions.test.ts (con `fetch` de mentira).
 *
 * Cada llamada es un POST con `Authorization: Bearer <jwt>` (verify_jwt = false: el JWT se valida aquí con
 * auth.getClaims) desde un origen de la app (SCAN_ALLOWED_ORIGINS, el mismo de scan-bowling y delete-account):
 *
 * - `{action: 'providers'}` → `{lookup, link}`: lo que está encendido según los secretos (`lookup`: `['valorant',
 *   'lol']` con RIOT_API_KEY, si no `[]`; `link`: `{steam, epic, riot}`, Steam siempre).
 * - `{action: 'lookup', game, id, platform?, region?}` → `{status: 'found', lookupId, displayName, ranks}` o
 *   `{status: 'not_found' | 'no_disponible' | 'rate_limited' | 'error'}`. Solo LoL y VALORANT (otro juego, o sin
 *   RIOT_API_KEY → `no_disponible`). La base normaliza y cuenta la búsqueda (`esports_begin_lookup`, 20 por hora y 60
 *   por día); lo encontrado lo guarda la base (`esports_store_lookup`, vale 15 min) y el teléfono confirma con
 *   `esports_confirm_game_id(p_lookup)`: el teléfono nunca escribe un rango verificado. LoL trae el rango de
 *   Solo/Dúo; VALORANT solo dice si existe (`ranks: {}`).
 *
 * Nunca se devuelve la respuesta cruda de un proveedor ni una clave.
 */

/** Error de una RPC tal como lo devuelve supabase-js. */
export interface DbError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

export type RankMapLike = Record<string, unknown>;

/** Lo que dice qué está encendido (ProvidersStatus de src/lib/data/esportsIds.ts). */
export interface ProvidersStatusLike {
  lookup: string[];
  link: { steam: boolean; epic: boolean; riot: boolean };
}

/** Los adaptadores (createEsportsProviders de ../_shared/esports-providers.ts). Errores: `{kind: 'rate_limited' | 'error'}`. */
export interface VerifyProviders {
  status(): ProvidersStatusLike;
  lookup(q: { game: string; display: string; normalized: string; platform: string; region: string }): Promise<{
    found: boolean;
    displayName?: string;
    externalId?: string;
    ranks?: RankMapLike;
    provider: string;
  } | null>;
}

export interface VerifyDeps {
  allowedOrigins: string[];
  /** Falta la URL o la clave secreta de Supabase. */
  configError?: string | null;
  /** `supabase.auth.getClaims(token)`: valida el JWT y devuelve sus claims. */
  getClaims(token: string): Promise<{ data: { claims?: Record<string, unknown> | null } | null; error: unknown }>;
  /** `supabase.rpc(fn, args)` con la clave secreta (service_role). */
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: DbError | null }>;
  providers: VerifyProviders;
  log?(message: string, extra?: unknown): void;
}

export type LookupResponse =
  | { status: 'found'; lookupId: string; displayName: string; ranks: RankMapLike }
  | { status: 'not_found' | 'no_disponible' | 'rate_limited' | 'error' };

export interface VerifyFailure {
  code: 'invalido' | 'sesion' | 'config' | 'servidor';
  message: string;
}

export const FAILURE_STATUS: Record<VerifyFailure['code'], number> = {
  invalido: 400,
  sesion: 401,
  config: 500,
  servidor: 500,
};

export const CORS_ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type, x-region, x-retry-count, traceparent, tracestate, baggage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;
const GAME = /^[a-z0-9_]{2,20}$/;
const SHORT = /^[a-z0-9]{0,8}$/;
const MAX_BODY_CHARS = 4096;

const SESSION: VerifyFailure = { code: 'sesion', message: 'Entra a tu cuenta para comprobar tu ID.' };
const SERVER: VerifyFailure = { code: 'servidor', message: 'No se pudo comprobar ahora. Intenta de nuevo.' };
const INVALID: VerifyFailure = { code: 'invalido', message: 'Datos inválidos.' };

/** Orígenes exactos separados por coma o espacios (sin la barra final). */
export function parseOrigins(value: string | undefined | null): string[] {
  return (value ?? '')
    .split(/[\s,]+/)
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o, i, all) => /^https?:\/\/[^/\s]+$/i.test(o) && all.indexOf(o) === i);
}

/** Cabeceras CORS para ese origen, o null si no es de la app. */
export function corsHeaders(origin: string | null, allowed: readonly string[]): Record<string, string> | null {
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': CORS_ALLOWED_HEADERS,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

/** El código corto de una RPC: 'rate_limited: …' → 'rate_limited'. */
export const raisedCode = (e: DbError | null | undefined) => (e?.message ?? '').trim().split(/[\s:]/)[0];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null);

/** El JWT de la cuenta → su id. */
export async function verifyUser(
  deps: Pick<VerifyDeps, 'getClaims' | 'log'>,
  authorization: string | null,
  tag = '[esports-verify]',
): Promise<{ id: string } | VerifyFailure> {
  const token = JWT.exec(authorization ?? '')?.[1];
  if (!token) return SESSION;
  let res: Awaited<ReturnType<VerifyDeps['getClaims']>>;
  try {
    res = await deps.getClaims(token);
  } catch (e) {
    deps.log?.(`${tag} getClaims falló`, e);
    return SERVER;
  }
  if (res.error) {
    const err = res.error as { name?: string; status?: number };
    return err.name === 'AuthRetryableFetchError' || (err.status ?? 0) >= 500 ? SERVER : SESSION;
  }
  const claims = res.data?.claims ?? null;
  const sub = claims?.sub;
  if (typeof sub !== 'string' || !UUID.test(sub) || claims?.role !== 'authenticated' || claims?.is_anonymous === true) return SESSION;
  return { id: sub.toLowerCase() };
}

export type VerifyAction = { action: 'providers' } | { action: 'lookup'; game: string; id: string; platform: string; region: string };

/** El cuerpo (JSON) → la acción, o null si no sirve (cualquier otra acción tampoco sirve). */
export function parseVerifyBody(raw: string): VerifyAction | null {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(body)) return null;
  if (body.action === 'providers') return { action: 'providers' };
  if (body.action === 'lookup') {
    const game = text(body.game, 20);
    const id = text(body.id, 80);
    const platform = body.platform == null ? '' : text(body.platform, 8);
    const region = body.region == null ? '' : text(body.region, 8);
    if (!game || !GAME.test(game) || !id || !id.trim() || platform === null || region === null) return null;
    if (!SHORT.test(platform) || !SHORT.test(region)) return null;
    return { action: 'lookup', game, id, platform, region };
  }
  return null;
}

/** Un error del adaptador → estado de la búsqueda (429 → rate_limited; lo demás → error). */
const providerStatus = (e: unknown): 'rate_limited' | 'error' => (isObj(e) && (e as { kind?: unknown }).kind === 'rate_limited' ? 'rate_limited' : 'error');

type Begin = { ok: true; display: string; normalized: string } | { ok: false; reason: string };

function parseBegin(data: unknown): Begin | null {
  if (!isObj(data)) return null;
  if (data.ok === true && typeof data.display === 'string' && typeof data.normalized === 'string') return { ok: true, display: data.display, normalized: data.normalized };
  if (data.ok === false) return { ok: false, reason: typeof data.reason === 'string' ? data.reason : 'invalido' };
  return null;
}

/** `esports_begin_lookup`: normaliza y cuenta la búsqueda. */
async function beginLookup(deps: VerifyDeps, user: string, game: string, id: string, platform: string): Promise<Begin | 'error'> {
  const { data, error } = await deps.rpc('esports_begin_lookup', { p_user: user, p_game: game, p_id: id, p_platform: platform });
  if (error) {
    if (raisedCode(error) === 'rate_limited') return { ok: false, reason: 'rate_limited' };
    if (raisedCode(error) === 'invalido') return { ok: false, reason: 'invalido' };
    deps.log?.('[esports-verify] esports_begin_lookup falló', error);
    return 'error';
  }
  return parseBegin(data) ?? 'error';
}

export async function handleLookup(deps: VerifyDeps, user: string, a: Extract<VerifyAction, { action: 'lookup' }>): Promise<LookupResponse> {
  if (!deps.providers.status().lookup.includes(a.game)) return { status: 'no_disponible' };
  const begin = await beginLookup(deps, user, a.game, a.id, a.platform);
  if (begin === 'error') return { status: 'error' };
  if (!begin.ok) return { status: begin.reason === 'rate_limited' ? 'rate_limited' : 'not_found' };

  let found: Awaited<ReturnType<VerifyProviders['lookup']>>;
  try {
    found = await deps.providers.lookup({ game: a.game, display: begin.display, normalized: begin.normalized, platform: a.platform, region: a.region });
  } catch (e) {
    const status = providerStatus(e);
    deps.log?.('[esports-verify] el proveedor no contestó', { game: a.game, status });
    return { status };
  }
  if (!found) return { status: 'no_disponible' };

  const ranks = isObj(found.ranks) ? found.ranks : {};
  const stored = await deps.rpc('esports_store_lookup', {
    p_user: user,
    p_game: a.game,
    p_platform: a.platform,
    p_id: a.id,
    p_found: found.found,
    p_display: found.found ? (found.displayName ?? null) : null,
    p_external: found.found ? (found.externalId ?? null) : null,
    p_ranks: found.found ? ranks : {},
    p_provider: found.provider,
  });
  if (stored.error || typeof stored.data !== 'string' || !UUID.test(stored.data)) {
    deps.log?.('[esports-verify] esports_store_lookup falló', stored.error ?? stored.data);
    return { status: 'error' };
  }
  if (!found.found) return { status: 'not_found' };
  return { status: 'found', lookupId: stored.data, displayName: found.displayName ?? begin.display, ranks };
}

export async function handleVerifyRequest(req: Request, deps: VerifyDeps): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, deps.allowedOrigins);
  // Otra página web: ni CORS ni respuesta (sin Origin es una herramienta; igual necesita el JWT).
  if (origin && !cors) return new Response('Origen no permitido', { status: 403, headers: { vary: 'Origin' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors ?? {} });

  const send = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...(cors ?? {}), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  const fail = (f: VerifyFailure) => send(FAILURE_STATUS[f.code], f);
  if (req.method !== 'POST') return send(405, { code: 'invalido', message: 'Usa POST.' });
  if (deps.configError) {
    deps.log?.('[esports-verify] configuración', deps.configError);
    return fail({ code: 'config', message: 'La comprobación de IDs no está configurada todavía.' });
  }

  try {
    const user = await verifyUser(deps, req.headers.get('authorization'));
    if ('code' in user) return fail(user);

    if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_CHARS) return fail(INVALID);
    const raw = await req.text();
    const action = raw.length <= MAX_BODY_CHARS ? parseVerifyBody(raw) : null;
    if (!action) return fail(INVALID);

    if (action.action === 'providers') {
      const { lookup, link } = deps.providers.status();
      return send(200, { lookup, link });
    }
    return send(200, await handleLookup(deps, user.id, action));
  } catch (e) {
    deps.log?.('[esports-verify] error inesperado', e);
    return fail(SERVER);
  }
}
