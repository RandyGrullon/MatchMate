/**
 * Esports: los adaptadores de la API de Riot y de los proveedores de login (docs/esports.md §8). Los usan las Edge
 * Functions `esports-verify` (buscar un Riot ID en LoL y VALORANT, decir qué está encendido) y `esports-auth`
 * (conectar la cuenta con Steam, Epic o Riot).
 *
 * La verificación solo existe donde es automática: Rocket League y Fortnite con «Conectar con Epic», CS2 con
 * «Conectar con Steam», LoL y VALORANT con la búsqueda de Riot (y «Conectar con Riot» si Riot aprueba RSO). Los otros
 * juegos no tienen búsqueda: su ID queda declarado.
 *
 * TypeScript puro y SIN imports (como scan-core.ts): Deno exige la extensión `.ts` en las rutas y el tsc de la app no
 * la acepta. Cada adaptador recibe `fetch` (en las pruebas, uno de mentira: src/lib/esportsFunctions.test.ts).
 *
 * Reglas:
 * - Cada proveedor se enciende SOLO si están sus secretos (Supabase › Edge Functions › Secrets, nombres exactos de
 *   `providerEnv`). Steam OpenID no necesita ninguno: está siempre encendido.
 * - Solo APIs oficiales. Nunca se leen páginas web.
 * - Nunca se devuelve la respuesta cruda de un proveedor ni una clave: solo nombre, id externo y rango.
 * - Errores: 429 → `rate_limited`; 5xx, sin respuesta o más de 6 s → `error` (`ProviderError`).
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Como `RankValue`/`RankMap` de src/sports/esports/ranks.ts (aquí no se importa nada de src/). */
export type RankValue = { tier: string; div?: number; mmr?: number } | { value: number } | { text: string };
export type RankMap = Partial<Record<'main' | '1v1' | '2v2' | '3v3', RankValue>>;

/** Lo que devuelve un adaptador de búsqueda (§8.2). */
export interface LookupFound {
  found: boolean;
  displayName?: string;
  externalId?: string;
  ranks?: RankMap;
}

export type ProviderErrorKind = 'rate_limited' | 'error';

/** El proveedor no contestó bien (429 → rate_limited; 5xx, red o tiempo → error). */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  constructor(kind: ProviderErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'ProviderError';
    this.kind = kind;
  }
}

export const PROVIDER_TIMEOUT_MS = 6_000;

/**
 * `fetch` con tope de tiempo. 429 → ProviderError('rate_limited'); 5xx, sin red o pasado el tope →
 * ProviderError('error'). Lo demás (200, 400, 401, 404…) se devuelve para que el adaptador decida.
 */
export async function providerFetch(fetchFn: FetchLike, url: string, init: RequestInit = {}, timeoutMs = PROVIDER_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new ProviderError('error', 'tiempo agotado'));
    }, timeoutMs);
  });
  let res: Response;
  try {
    res = await Promise.race([fetchFn(url, { ...init, signal: ctrl.signal }), timeout]);
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError('error', 'sin respuesta');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new ProviderError('rate_limited', 'rate_limited');
  if (res.status >= 500) throw new ProviderError('error', `HTTP ${res.status}`);
  return res;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new ProviderError('error', 'respuesta que no es JSON');
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
/** Corta a `max` letras (los nombres que guarda la base: ≤ 60; ids externos ≤ 100). */
const cut = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

// ---------- Secretos ----------

/** Los secretos de esports (todos opcionales). Vacío o solo espacios = no está. */
export interface ProviderEnv {
  riotApiKey?: string;
  riotClientId?: string;
  riotClientSecret?: string;
  epicClientId?: string;
  epicClientSecret?: string;
  /** Opcional: solo el nombre del perfil de Steam al conectar (Steam OpenID no la necesita). */
  steamWebApiKey?: string;
}

/** Nombres exactos de los secretos (docs/CONFIGURAR-SUPABASE.md). */
export const PROVIDER_SECRETS = {
  riotApiKey: 'RIOT_API_KEY',
  riotClientId: 'RIOT_CLIENT_ID',
  riotClientSecret: 'RIOT_CLIENT_SECRET',
  epicClientId: 'EPIC_CLIENT_ID',
  epicClientSecret: 'EPIC_CLIENT_SECRET',
  steamWebApiKey: 'STEAM_WEB_API_KEY',
} as const satisfies Record<keyof ProviderEnv, string>;

export function providerEnv(get: (name: string) => string | undefined | null): ProviderEnv {
  const out: ProviderEnv = {};
  for (const [k, name] of Object.entries(PROVIDER_SECRETS) as [keyof ProviderEnv, string][]) {
    const v = get(name)?.trim();
    if (v) out[k] = v;
  }
  return out;
}

// ---------- Qué está encendido ----------

export type LinkProvider = 'steam' | 'epic' | 'riot';
export const LINK_PROVIDERS: readonly LinkProvider[] = ['steam', 'epic', 'riot'];
/** El proveedor de login de cada juego (`GAMES[g].link`, §8.3). */
export const LINK_GAMES: Readonly<Record<LinkProvider, readonly string[]>> = {
  steam: ['cs2'],
  epic: ['rocket_league', 'fortnite'],
  riot: ['lol', 'valorant'],
};

export const isLinkProvider = (v: unknown): v is LinkProvider => typeof v === 'string' && (LINK_PROVIDERS as readonly string[]).includes(v);

/**
 * Los juegos con búsqueda (`verify.kind = 'lookup'` del catálogo), en el orden del catálogo: los dos de Riot. Ningún
 * otro juego tiene búsqueda.
 */
export const LOOKUP_GAMES = ['valorant', 'lol'] as const;

/** Juegos con búsqueda encendida (§8.1): LoL y VALORANT con RIOT_API_KEY. */
export function lookupGames(env: ProviderEnv): string[] {
  return env.riotApiKey ? [...LOOKUP_GAMES] : [];
}

/** «Conectar con…»: Steam siempre; Epic y Riot con su par de secretos. */
export function linkStatus(env: ProviderEnv): Record<LinkProvider, boolean> {
  return { steam: true, epic: !!(env.epicClientId && env.epicClientSecret), riot: !!(env.riotClientId && env.riotClientSecret) };
}

export interface ProvidersStatus {
  lookup: string[];
  link: Record<LinkProvider, boolean>;
}

export function providersStatus(env: ProviderEnv): ProvidersStatus {
  return { lookup: lookupGames(env), link: linkStatus(env) };
}

// ---------- Riot (LoL y VALORANT) ----------

export type RiotRegional = 'americas' | 'europe' | 'asia' | 'sea';

/** Región del juego → ruta regional de Riot (§8.2). */
export const RIOT_REGIONAL: Readonly<Record<string, RiotRegional>> = {
  la1: 'americas',
  la2: 'americas',
  na1: 'americas',
  br1: 'americas',
  latam: 'americas',
  na: 'americas',
  br: 'americas',
  euw1: 'europe',
  eun1: 'europe',
  eu: 'europe',
  kr: 'asia',
  jp1: 'asia',
  ap: 'asia',
  oc1: 'sea',
};

/** La región por defecto de cada juego (la del catálogo). */
export const RIOT_DEFAULT_REGION: Readonly<Record<string, string>> = { lol: 'la1', valorant: 'latam' };
/** Plataformas de LoL (servidor del rango, league-v4). */
const LOL_PLATFORMS = new Set(['la1', 'la2', 'na1', 'br1', 'euw1', 'eun1', 'kr', 'jp1', 'oc1']);

export const riotRegional = (region: string): RiotRegional | null => RIOT_REGIONAL[region] ?? null;

/**
 * account-v1 solo atiende en americas, asia y europe (la cuenta es global: cualquiera sirve); `sea` (Oceanía) va por
 * asia.
 */
export const riotAccountHost = (regional: RiotRegional): Exclude<RiotRegional, 'sea'> => (regional === 'sea' ? 'asia' : regional);

/** `Nombre#TAG` → nombre y tag (se parte en el ÚLTIMO `#`, como normalizeGameId). */
export function splitRiotId(display: string): { name: string; tag: string } | null {
  const i = display.lastIndexOf('#');
  if (i <= 0 || i === display.length - 1) return null;
  return { name: display.slice(0, i), tag: display.slice(i + 1) };
}

const ROMAN: Readonly<Record<string, number>> = { I: 1, II: 2, III: 3, IV: 4 };
const LOL_APEX = new Set(['master', 'grandmaster', 'challenger']);
const LOL_TIERS = new Set(['iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond', ...LOL_APEX]);

/** Las entradas de league-v4 → el rango de Solo/Dúo (`RANKED_SOLO_5x5`); sin esa entrada, sin rango. */
export function lolRank(entries: unknown): RankMap {
  if (!Array.isArray(entries)) return {};
  const solo = entries.find((e) => isObj(e) && e.queueType === 'RANKED_SOLO_5x5') as Record<string, unknown> | undefined;
  const tier = str(solo?.tier)?.toLowerCase();
  if (!tier || !LOL_TIERS.has(tier)) return {};
  if (LOL_APEX.has(tier)) return { main: { tier } };
  const div = ROMAN[str(solo?.rank) ?? ''];
  return div ? { main: { tier, div } } : { main: { tier } };
}

/**
 * Riot ID (account-v1) y, en LoL, el rango de Solo/Dúo (league-v4). VALORANT: solo «existe / no existe», sin rango
 * (`ranks: {}`; su rango por cuenta no está en la API pública).
 */
export async function riotLookup(fetchFn: FetchLike, apiKey: string, q: { game: string; display: string; region: string }): Promise<LookupFound> {
  const id = splitRiotId(q.display);
  if (!id) return { found: false };
  const region = q.region || RIOT_DEFAULT_REGION[q.game] || 'la1';
  const regional = riotRegional(region) ?? 'americas';
  const headers = { 'X-Riot-Token': apiKey, accept: 'application/json' };
  const url = `https://${riotAccountHost(regional)}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(id.name)}/${encodeURIComponent(id.tag)}`;
  const res = await providerFetch(fetchFn, url, { headers });
  if (res.status === 404 || res.status === 400) return { found: false };
  if (!res.ok) throw new ProviderError('error', `HTTP ${res.status}`);
  const acc = await readJson(res);
  const puuid = isObj(acc) ? str(acc.puuid) : null;
  if (!puuid) return { found: false };
  const name = isObj(acc) ? str(acc.gameName) : null;
  const tag = isObj(acc) ? str(acc.tagLine) : null;
  const out: LookupFound = { found: true, displayName: cut(name && tag ? `${name}#${tag}` : q.display, 60), externalId: cut(puuid, 100), ranks: {} };
  if (q.game === 'lol') {
    const platform = LOL_PLATFORMS.has(region) ? region : 'la1';
    const lr = await providerFetch(fetchFn, `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`, { headers });
    if (lr.ok) out.ranks = lolRank(await readJson(lr));
    else if (lr.status !== 404) throw new ProviderError('error', `HTTP ${lr.status}`);
  }
  return out;
}

// ---------- Búsqueda, por juego ----------

export interface LookupQuery {
  game: string;
  /** El ID como lo devuelve esports_begin_lookup (`display`: `Nombre#TAG`). */
  display: string;
  normalized: string;
  platform: string;
  region: string;
}

export type ProviderLookup = LookupFound & { provider: string };

// ---------- Login: Steam OpenID 2.0 ----------

export const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const OPENID_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const STEAM_CLAIMED = /^https:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/;

/** A dónde va la persona para entrar con Steam (`openid.return_to` lleva el `state`). */
export function steamLoginUrl(returnTo: string, realm: string): string {
  const p = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': OPENID_SELECT,
    'openid.claimed_id': OPENID_SELECT,
  });
  return `${STEAM_OPENID}?${p.toString()}`;
}

/**
 * Comprueba la aserción que trae la vuelta de Steam: que sea para nuestra `return_to` (con el mismo state), firmada
 * con los campos que importan, y que Steam la confirme (`openid.mode=check_authentication` → `is_valid:true`).
 * Devuelve el SteamID64, o null si no es válida.
 */
export async function steamVerifyAssertion(fetchFn: FetchLike, params: URLSearchParams, expectedReturnTo: string): Promise<string | null> {
  if (params.get('openid.mode') !== 'id_res') return null;
  if (params.get('openid.op_endpoint') !== STEAM_OPENID) return null;
  if (params.get('openid.return_to') !== expectedReturnTo) return null;
  const claimed = params.get('openid.claimed_id') ?? '';
  const m = STEAM_CLAIMED.exec(claimed);
  if (!m || params.get('openid.identity') !== claimed) return null;
  const signed = new Set((params.get('openid.signed') ?? '').split(','));
  for (const f of ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce']) if (!signed.has(f)) return null;
  if (!params.get('openid.sig') || !params.get('openid.assoc_handle')) return null;

  const check = new URLSearchParams();
  for (const [k, v] of params) if (k.startsWith('openid.')) check.set(k, v);
  check.set('openid.mode', 'check_authentication');
  const res = await providerFetch(fetchFn, STEAM_OPENID, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/plain' },
    body: check.toString(),
  });
  if (!res.ok) return null;
  const text = await res.text();
  return /^is_valid\s*:\s*true\s*$/m.test(text) ? m[1] : null;
}

/**
 * El nombre del perfil de Steam (ISteamUser/GetPlayerSummaries/v2, con STEAM_WEB_API_KEY): solo para mostrarlo al
 * conectar CS2. null si no existe.
 */
export async function steamPersonaName(fetchFn: FetchLike, apiKey: string, id64: string): Promise<string | null> {
  const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(apiKey)}&steamids=${encodeURIComponent(id64)}`;
  const res = await providerFetch(fetchFn, url, { headers: { accept: 'application/json' } });
  if (res.status === 403 || res.status === 401) throw new ProviderError('error', `HTTP ${res.status}`);
  if (!res.ok) return null;
  const body = await readJson(res);
  const players = isObj(body) && isObj(body.response) && Array.isArray(body.response.players) ? body.response.players : [];
  const p = players.find((x) => isObj(x) && x.steamid === id64) as Record<string, unknown> | undefined;
  return p ? (str(p.personaname) ?? '') : null;
}

// ---------- Login: OAuth (Epic Account Services y Riot Sign On) ----------

export const EPIC_AUTHORIZE = 'https://www.epicgames.com/id/authorize';
export const EPIC_TOKEN = 'https://api.epicgames.dev/epic/oauth/v2/token';
export const EPIC_ACCOUNTS = 'https://api.epicgames.dev/epic/id/v2/accounts';
export const RIOT_AUTHORIZE = 'https://auth.riotgames.com/authorize';
export const RIOT_TOKEN = 'https://auth.riotgames.com/token';
export const RIOT_ME = 'https://americas.api.riotgames.com/riot/account/v1/accounts/me';

/** `Basic base64(id:secret)` (los dos son ASCII). */
export const basicAuth = (id: string, secret: string) => `Basic ${btoa(`${id}:${secret}`)}`;

export function epicAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const p = new URLSearchParams({ client_id: clientId, response_type: 'code', scope: 'basic_profile', redirect_uri: redirectUri, state });
  return `${EPIC_AUTHORIZE}?${p.toString()}`;
}

export function riotAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const p = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid', state });
  return `${RIOT_AUTHORIZE}?${p.toString()}`;
}

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

/** La cuenta conectada: el id del proveedor y el nombre que se guarda como ID. */
export interface LinkedAccount {
  externalId: string;
  displayName: string;
}

/** Cambia el `code` por el token (grant authorization_code, Basic). null si el proveedor dijo que no. */
async function exchangeCode(fetchFn: FetchLike, tokenUrl: string, client: OAuthClient, code: string, redirectUri: string): Promise<Record<string, unknown> | null> {
  const res = await providerFetch(fetchFn, tokenUrl, {
    method: 'POST',
    headers: {
      authorization: basicAuth(client.clientId, client.clientSecret),
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }).toString(),
  });
  if (!res.ok) return null;
  const body = await readJson(res);
  return isObj(body) && str(body.access_token) ? body : null;
}

/** Epic: token → `account_id` y el nombre de la cuenta (Epic ID). */
export async function epicAccount(fetchFn: FetchLike, client: OAuthClient, code: string, redirectUri: string): Promise<LinkedAccount | null> {
  const token = await exchangeCode(fetchFn, EPIC_TOKEN, client, code, redirectUri);
  const accountId = token ? str(token.account_id) : null;
  if (!token || !accountId) return null;
  const res = await providerFetch(fetchFn, `${EPIC_ACCOUNTS}?accountId=${encodeURIComponent(accountId)}`, {
    headers: { authorization: `Bearer ${String(token.access_token)}`, accept: 'application/json' },
  });
  if (!res.ok) return null;
  const list = await readJson(res);
  const acc = Array.isArray(list) ? (list.find((a) => isObj(a) && a.accountId === accountId) as Record<string, unknown> | undefined) : undefined;
  const name = acc ? str(acc.displayName) : null;
  return name ? { externalId: cut(accountId, 100), displayName: cut(name, 60) } : null;
}

/** Riot: token → la cuenta (`puuid`, `gameName#tagLine`). */
export async function riotAccount(fetchFn: FetchLike, client: OAuthClient, code: string, redirectUri: string): Promise<LinkedAccount | null> {
  const token = await exchangeCode(fetchFn, RIOT_TOKEN, client, code, redirectUri);
  if (!token) return null;
  const res = await providerFetch(fetchFn, RIOT_ME, { headers: { authorization: `Bearer ${String(token.access_token)}`, accept: 'application/json' } });
  if (!res.ok) return null;
  const acc = await readJson(res);
  const puuid = isObj(acc) ? str(acc.puuid) : null;
  const name = isObj(acc) ? str(acc.gameName) : null;
  const tag = isObj(acc) ? str(acc.tagLine) : null;
  return puuid && name && tag ? { externalId: cut(puuid, 100), displayName: cut(`${name}#${tag}`, 60) } : null;
}

// ---------- Todo junto (lo que usan las dos funciones) ----------

export interface EsportsProviders {
  /** Lo que está encendido (acción `providers`). */
  status(): ProvidersStatus;
  /** Busca el Riot ID (LoL y VALORANT). null = no disponible (sin RIOT_API_KEY o juego sin búsqueda). */
  lookup(q: LookupQuery): Promise<ProviderLookup | null>;
  /** «Conectar con…» encendido. */
  linkEnabled(provider: LinkProvider): boolean;
  /** La URL del proveedor para entrar (null si no está encendido). */
  authorizeUrl(provider: LinkProvider, o: { redirectUri: string; state: string; realm: string }): string | null;
  steamVerify(params: URLSearchParams, expectedReturnTo: string): Promise<string | null>;
  /** El nombre del perfil de Steam (con STEAM_WEB_API_KEY; si no, o si falla, null). */
  steamName(id64: string): Promise<string | null>;
  /** Epic o Riot: el `code` → la cuenta. null si el proveedor dijo que no. */
  exchange(provider: 'epic' | 'riot', code: string, redirectUri: string): Promise<LinkedAccount | null>;
}

export function createEsportsProviders(env: ProviderEnv, fetchFn: FetchLike): EsportsProviders {
  return {
    status: () => providersStatus(env),
    async lookup(q) {
      if (!env.riotApiKey || !lookupGames(env).includes(q.game)) return null;
      return { ...(await riotLookup(fetchFn, env.riotApiKey, { game: q.game, display: q.display, region: q.region })), provider: 'riot' };
    },
    linkEnabled: (provider) => linkStatus(env)[provider],
    authorizeUrl(provider, o) {
      if (!linkStatus(env)[provider]) return null;
      if (provider === 'steam') return steamLoginUrl(o.redirectUri, o.realm);
      if (provider === 'epic') return epicAuthorizeUrl(env.epicClientId!, o.redirectUri, o.state);
      return riotAuthorizeUrl(env.riotClientId!, o.redirectUri, o.state);
    },
    steamVerify: (params, expectedReturnTo) => steamVerifyAssertion(fetchFn, params, expectedReturnTo),
    async steamName(id64) {
      if (!env.steamWebApiKey) return null;
      try {
        return (await steamPersonaName(fetchFn, env.steamWebApiKey, id64)) || null;
      } catch {
        return null;
      }
    },
    async exchange(provider, code, redirectUri) {
      if (provider === 'epic') {
        if (!env.epicClientId || !env.epicClientSecret) return null;
        return epicAccount(fetchFn, { clientId: env.epicClientId, clientSecret: env.epicClientSecret }, code, redirectUri);
      }
      if (!env.riotClientId || !env.riotClientSecret) return null;
      return riotAccount(fetchFn, { clientId: env.riotClientId, clientSecret: env.riotClientSecret }, code, redirectUri);
    },
  };
}
