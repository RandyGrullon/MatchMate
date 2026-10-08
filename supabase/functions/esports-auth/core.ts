/**
 * Edge Function `esports-auth` (docs/esports.md §8.3): «Conectar con Steam / Epic / Riot». Toda la lógica está aquí;
 * index.ts solo arma las dependencias (cliente con la clave secreta y los adaptadores de
 * ../_shared/esports-providers.ts). TypeScript puro y SIN imports. Pruebas: src/lib/esportsFunctions.test.ts.
 *
 * El flujo (verify_jwt = false: la vuelta del proveedor llega sin JWT):
 *
 * 1. `POST /esports-auth/start` con el JWT de la cuenta y `{provider, game}` (desde un origen de la app, CORS con
 *    SCAN_ALLOWED_ORIGINS). Revisa que el proveedor esté encendido y sea el del juego, y pide a la base un `state`
 *    (`esports_link_begin`: uuid atado a la cuenta, al proveedor y al juego; 10 minutos y un solo uso). Devuelve
 *    `{status: 'ok', url}` (url = el paso 2) o `{status: 'no_disponible'}`.
 * 2. `POST /esports-auth/go?provider&game&state`: el teléfono llega aquí con un formulario (navegación de verdad,
 *    no fetch). Solo se acepta si la cabecera `Origin` es de la app (una página ajena no puede mandar al navegador
 *    de otra persona por este paso). Guarda el `state` en una cookie de este dominio (`__Host-`, HttpOnly, Secure,
 *    SameSite=Lax, 10 min) y manda al proveedor.
 * 3. `GET /esports-auth/<proveedor>/callback`: la vuelta. Exige que la cookie sea el mismo `state` (CSRF: el
 *    navegador que vuelve es el que empezó en la app; quien manda a otro el link del proveedor con su propio state no
 *    logra conectar la cuenta de la víctima a la suya), toma el state (`esports_link_take`: existe, no venció y no
 *    se usó; lo marca usado), comprueba con el proveedor (Steam: la aserción OpenID con check_authentication; Epic y
 *    Riot: cambia el `code` por el token y lee la cuenta) y llama `esports_link_account`, que siempre devuelve
 *    `'ok'`: si otra cuenta tenía ese ID conectado con su login, la base se lo pasa a esta (el login prueba de quién
 *    es) y le avisa a la otra. Termina con un 302 a `{APP_URL}/esports/mi-id?conectado=<proveedor>&juego=<juego>` o
 *    `…?error=<codigo>&juego=<juego>`, con `codigo` ∈ `estado_vencido`, `proveedor`, `no_disponible`.
 *
 * URLs de vuelta (se registran en Epic y Riot; Steam no se registra):
 * `{SUPABASE_URL}/functions/v1/esports-auth/{steam|epic|riot}/callback`.
 */

export type LinkProvider = 'steam' | 'epic' | 'riot';

/** Error de una RPC tal como lo devuelve supabase-js. */
export interface DbError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

/** Los adaptadores (createEsportsProviders de ../_shared/esports-providers.ts). Errores: `{kind: 'rate_limited' | 'error'}`. */
export interface AuthProviders {
  linkEnabled(provider: LinkProvider): boolean;
  authorizeUrl(provider: LinkProvider, o: { redirectUri: string; state: string; realm: string }): string | null;
  steamVerify(params: URLSearchParams, expectedReturnTo: string): Promise<string | null>;
  steamName(id64: string): Promise<string | null>;
  exchange(provider: 'epic' | 'riot', code: string, redirectUri: string): Promise<{ externalId: string; displayName: string } | null>;
}

export interface AuthDeps {
  allowedOrigins: string[];
  configError?: string | null;
  /** `https://<ref>.supabase.co` (SUPABASE_URL): de aquí salen las URLs de vuelta. */
  supabaseUrl: string;
  /** La app (`APP_URL`, o `APP_ORIGIN` si está: staging). */
  appUrl: string;
  getClaims(token: string): Promise<{ data: { claims?: Record<string, unknown> | null } | null; error: unknown }>;
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: DbError | null }>;
  providers: AuthProviders;
  log?(message: string, extra?: unknown): void;
}

/** Producción. Si existe la variable APP_ORIGIN (staging), gana ella. */
export const APP_URL = 'https://matchmate-oficial.vercel.app';

/** El proveedor de login de cada juego (`GAMES[g].link`). */
export const LINK_GAMES: Readonly<Record<LinkProvider, readonly string[]>> = {
  steam: ['cs2'],
  epic: ['rocket_league', 'fortnite'],
  riot: ['lol', 'valorant'],
};

export const isLinkProvider = (v: unknown): v is LinkProvider => v === 'steam' || v === 'epic' || v === 'riot';
const isLinkGame = (p: LinkProvider, g: unknown): g is string => typeof g === 'string' && LINK_GAMES[p].includes(g);

export type LinkErrorCode = 'estado_vencido' | 'proveedor' | 'no_disponible';

/** La cookie que ata el `state` al navegador que empezó (solo este host: `__Host-`). */
export const STATE_COOKIE = '__Host-mm_esports_state';
export const STATE_TTL_SECONDS = 600;

export const CORS_ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type, x-region, x-retry-count, traceparent, tracestate, baggage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;
const ORIGIN = /^https?:\/\/[^/\s?#]+$/i;
const MAX_BODY_CHARS = 1024;

/** Orígenes exactos separados por coma o espacios (sin la barra final). */
export function parseOrigins(value: string | undefined | null): string[] {
  return (value ?? '')
    .split(/[\s,]+/)
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o, i, all) => ORIGIN.test(o) && all.indexOf(o) === i);
}

/** La URL de la app: APP_ORIGIN si es un origen válido; si no, producción. */
export function appUrlFrom(appOrigin: string | undefined | null): string {
  const o = (appOrigin ?? '').trim().replace(/\/+$/, '');
  return ORIGIN.test(o) ? o : APP_URL;
}

const base = (supabaseUrl: string) => supabaseUrl.trim().replace(/\/+$/, '');

/** La URL de vuelta de cada proveedor (la que se registra en Epic y Riot). */
export const callbackUrl = (supabaseUrl: string, provider: LinkProvider) => `${base(supabaseUrl)}/functions/v1/esports-auth/${provider}/callback`;

/** Steam: la vuelta lleva el state (Steam la devuelve tal cual en `openid.return_to`). */
export const steamReturnTo = (supabaseUrl: string, state: string) => `${callbackUrl(supabaseUrl, 'steam')}?state=${encodeURIComponent(state)}`;

/** El paso 2 (el formulario del teléfono va aquí). */
export function goUrl(supabaseUrl: string, o: { provider: LinkProvider; game: string; state: string }): string {
  const p = new URLSearchParams({ provider: o.provider, game: o.game, state: o.state });
  return `${base(supabaseUrl)}/functions/v1/esports-auth/go?${p.toString()}`;
}

/** A dónde vuelve la persona: `/esports/mi-id?conectado=<p>&juego=<g>` o `?error=<codigo>&juego=<g>`. */
export function appRedirect(appUrl: string, r: { provider: LinkProvider; game: string } | { error: LinkErrorCode; game?: string | null }): string {
  const p = new URLSearchParams();
  if ('error' in r) {
    p.set('error', r.error);
    if (r.game) p.set('juego', r.game);
  } else {
    p.set('conectado', r.provider);
    p.set('juego', r.game);
  }
  return `${appUrl}/esports/mi-id?${p.toString()}`;
}

/** La ruta dentro de la función: '/functions/v1/esports-auth/steam/callback' o '/esports-auth/steam/callback' → 'steam/callback'. */
export function routeOf(url: URL): string {
  const parts = url.pathname.split('/').filter(Boolean);
  const i = parts.lastIndexOf('esports-auth');
  return (i >= 0 ? parts.slice(i + 1) : parts).join('/');
}

/** Una cookie de la cabecera `Cookie`. */
export function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

export const stateCookie = (state: string) => `${STATE_COOKIE}=${state}; Max-Age=${STATE_TTL_SECONDS}; Path=/; Secure; HttpOnly; SameSite=Lax`;
export const clearStateCookie = () => `${STATE_COOKIE}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`;

/** Comparación sin atajos (los dos en minúsculas). */
function sameState(a: string | null, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const raisedCode = (e: DbError | null | undefined) => (e?.message ?? '').trim().split(/[\s:]/)[0];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function corsHeaders(origin: string | null, allowed: readonly string[]): Record<string, string> | null {
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': CORS_ALLOWED_HEADERS,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function redirect(location: string, status: 302 | 303, cookie?: string): Response {
  const headers = new Headers({ location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  if (cookie) headers.append('set-cookie', cookie);
  return new Response(null, { status, headers });
}

async function verifyUser(deps: AuthDeps, authorization: string | null): Promise<string | 'sesion' | 'servidor'> {
  const token = JWT.exec(authorization ?? '')?.[1];
  if (!token) return 'sesion';
  let res: Awaited<ReturnType<AuthDeps['getClaims']>>;
  try {
    res = await deps.getClaims(token);
  } catch (e) {
    deps.log?.('[esports-auth] getClaims falló', e);
    return 'servidor';
  }
  if (res.error) {
    const err = res.error as { name?: string; status?: number };
    return err.name === 'AuthRetryableFetchError' || (err.status ?? 0) >= 500 ? 'servidor' : 'sesion';
  }
  const claims = res.data?.claims ?? null;
  const sub = claims?.sub;
  if (typeof sub !== 'string' || !UUID.test(sub) || claims?.role !== 'authenticated' || claims?.is_anonymous === true) return 'sesion';
  return sub.toLowerCase();
}

// ---------- 1. start ----------

async function handleStart(req: Request, deps: AuthDeps): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, deps.allowedOrigins);
  if (origin && !cors) return new Response('Origen no permitido', { status: 403, headers: { vary: 'Origin' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors ?? {} });
  const send = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...(cors ?? {}), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  if (req.method !== 'POST') return send(405, { code: 'invalido', message: 'Usa POST.' });
  if (deps.configError) {
    deps.log?.('[esports-auth] configuración', deps.configError);
    return send(500, { code: 'config', message: 'Conectar la cuenta no está configurado todavía.' });
  }

  const user = await verifyUser(deps, req.headers.get('authorization'));
  if (user === 'sesion') return send(401, { code: 'sesion', message: 'Entra a tu cuenta para conectarla.' });
  if (user === 'servidor') return send(500, { code: 'servidor', message: 'No se pudo empezar ahora. Intenta de nuevo.' });

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_CHARS) return send(400, { code: 'invalido', message: 'Datos inválidos.' });
  const raw = await req.text();
  let body: unknown = null;
  try {
    body = raw.length <= MAX_BODY_CHARS ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  const provider = isObj(body) ? body.provider : null;
  const game = isObj(body) ? body.game : null;
  if (!isLinkProvider(provider) || !isLinkGame(provider, game)) return send(400, { code: 'invalido', message: 'Ese juego no se conecta con ese proveedor.' });
  if (!deps.providers.linkEnabled(provider)) return send(200, { status: 'no_disponible' });

  const { data, error } = await deps.rpc('esports_link_begin', { p_user: user, p_provider: provider, p_game: game });
  if (error) {
    const code = raisedCode(error);
    if (code === 'rate_limited') return send(429, { code: 'rate_limited', message: 'rate_limited' });
    if (code === 'invalido') return send(400, { code: 'invalido', message: 'Ese juego no se conecta con ese proveedor.' });
    if (code === 'bloqueada') return send(403, { code: 'bloqueada', message: 'bloqueada' });
    deps.log?.('[esports-auth] esports_link_begin falló', error);
    return send(500, { code: 'servidor', message: 'No se pudo empezar ahora. Intenta de nuevo.' });
  }
  if (typeof data !== 'string' || !UUID.test(data)) {
    deps.log?.('[esports-auth] esports_link_begin devolvió otra cosa', data);
    return send(500, { code: 'servidor', message: 'No se pudo empezar ahora. Intenta de nuevo.' });
  }
  return send(200, { status: 'ok', url: goUrl(deps.supabaseUrl, { provider, game, state: data.toLowerCase() }) });
}

// ---------- 2. go ----------

function handleGo(req: Request, url: URL, deps: AuthDeps): Response {
  const provider = url.searchParams.get('provider');
  const game = url.searchParams.get('game');
  const state = (url.searchParams.get('state') ?? '').toLowerCase();
  const knownGame = isLinkProvider(provider) && isLinkGame(provider, game) ? game : null;
  const back = (error: LinkErrorCode) => redirect(appRedirect(deps.appUrl, { error, game: knownGame }), 303);
  if (req.method !== 'POST') return back('estado_vencido');
  // Solo desde la app: el formulario de startLink (una página ajena tiene otro Origin, o ninguno).
  const origin = req.headers.get('origin');
  if (!origin || !deps.allowedOrigins.includes(origin)) return back('estado_vencido');
  if (!isLinkProvider(provider) || !knownGame || !UUID.test(state)) return back('estado_vencido');
  if (deps.configError || !deps.providers.linkEnabled(provider)) return back('no_disponible');
  const redirectUri = provider === 'steam' ? steamReturnTo(deps.supabaseUrl, state) : callbackUrl(deps.supabaseUrl, provider);
  const to = deps.providers.authorizeUrl(provider, { redirectUri, state, realm: new URL(base(deps.supabaseUrl)).origin });
  if (!to) return back('no_disponible');
  return redirect(to, 303, stateCookie(state));
}

// ---------- 3. callback ----------

interface TakenState {
  userId: string;
  provider: LinkProvider;
  game: string;
}

function parseTaken(data: unknown): TakenState | null {
  if (!isObj(data)) return null;
  const userId = typeof data.userId === 'string' ? data.userId : typeof data.user_id === 'string' ? data.user_id : null;
  const provider = data.provider;
  const game = data.game;
  if (!userId || !UUID.test(userId) || !isLinkProvider(provider) || !isLinkGame(provider, game)) return null;
  return { userId: userId.toLowerCase(), provider, game };
}

async function handleCallback(req: Request, url: URL, provider: LinkProvider, deps: AuthDeps): Promise<Response> {
  const back = (r: { error: LinkErrorCode; game?: string | null } | { provider: LinkProvider; game: string }) =>
    redirect(appRedirect(deps.appUrl, r), 302, clearStateCookie());
  if (req.method !== 'GET') return back({ error: 'estado_vencido' });
  if (deps.configError) {
    deps.log?.('[esports-auth] configuración', deps.configError);
    return back({ error: 'no_disponible' });
  }
  const params = url.searchParams;
  const state = (params.get('state') ?? '').toLowerCase();
  if (!UUID.test(state)) return back({ error: 'estado_vencido' });
  // CSRF: el navegador que vuelve tiene que ser el que pasó por /go desde la app con este mismo state.
  if (!sameState(readCookie(req.headers.get('cookie'), STATE_COOKIE)?.toLowerCase() ?? null, state)) return back({ error: 'estado_vencido' });

  const taken = await deps.rpc('esports_link_take', { p_state: state });
  if (taken.error) {
    deps.log?.('[esports-auth] esports_link_take falló', taken.error);
    return back({ error: 'no_disponible' });
  }
  const link = parseTaken(taken.data);
  if (!link || link.provider !== provider) return back({ error: 'estado_vencido', game: link?.game });
  const game = link.game;
  if (!deps.providers.linkEnabled(provider)) return back({ error: 'no_disponible', game });

  let account: { externalId: string; display: string | null } | null;
  try {
    if (provider === 'steam') {
      if (params.get('openid.mode') === 'cancel') return back({ error: 'proveedor', game });
      const id64 = await deps.providers.steamVerify(params, steamReturnTo(deps.supabaseUrl, state));
      account = id64 ? { externalId: id64, display: await deps.providers.steamName(id64) } : null;
    } else {
      const code = params.get('code');
      if (params.get('error') || !code || code.length > 2048) return back({ error: 'proveedor', game });
      const acc = await deps.providers.exchange(provider, code, callbackUrl(deps.supabaseUrl, provider));
      account = acc ? { externalId: acc.externalId, display: acc.displayName } : null;
    }
  } catch (e) {
    deps.log?.('[esports-auth] el proveedor no contestó', { provider, kind: isObj(e) ? (e as { kind?: unknown }).kind : null });
    return back({ error: 'no_disponible', game });
  }
  if (!account) return back({ error: 'proveedor', game });

  const linked = await deps.rpc('esports_link_account', {
    p_user: link.userId,
    p_game: game,
    p_provider: provider,
    p_external_id: account.externalId,
    p_display: account.display,
  });
  if (linked.error) {
    if (raisedCode(linked.error) === 'invalido') return back({ error: 'proveedor', game });
    deps.log?.('[esports-auth] esports_link_account falló', linked.error);
    return back({ error: 'no_disponible', game });
  }
  // Siempre 'ok' (si otra cuenta lo tenía conectado, la base ya lo movió a esta y le avisó).
  if (linked.data !== 'ok') {
    deps.log?.('[esports-auth] esports_link_account devolvió otra cosa', linked.data);
    return back({ error: 'no_disponible', game });
  }
  deps.log?.('[esports-auth] cuenta conectada', { provider, game });
  return back({ provider, game });
}

export async function handleAuthRequest(req: Request, deps: AuthDeps): Promise<Response> {
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return new Response('No existe', { status: 404 });
  }
  const route = routeOf(url);
  try {
    if (route === 'start') return await handleStart(req, deps);
    if (route === 'go') return handleGo(req, url, deps);
    const m = /^(steam|epic|riot)\/callback$/.exec(route);
    if (m) return await handleCallback(req, url, m[1] as LinkProvider, deps);
  } catch (e) {
    deps.log?.('[esports-auth] error inesperado', e);
    if (route === 'start') return new Response(JSON.stringify({ code: 'servidor', message: 'No se pudo empezar ahora.' }), { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } });
    return redirect(appRedirect(deps.appUrl, { error: 'no_disponible' }), 302, clearStateCookie());
  }
  return new Response('No existe', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
