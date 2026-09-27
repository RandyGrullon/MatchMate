/**
 * Lectura de la pantalla de la bolera con la Gemini API gratis: toda la lógica de la Edge Function `scan-bowling`.
 *
 * TypeScript puro y SIN imports: Deno exige la extensión `.ts` en las rutas y el tsc de la app no la acepta, así
 * que todo va en este archivo. Lo usan la función (Deno, `../scan-bowling/index.ts` solo arma las dependencias),
 * la app (`src/lib/scan-result.ts` reexporta ScanRow, ScanError y parseScanResult) y las pruebas (Vitest en Node,
 * `src/lib/scanFunction.test.ts`).
 *
 * Una lectura (una invocación):
 * 1. CORS solo para los orígenes de la app (SCAN_ALLOWED_ORIGINS) y el JWT del usuario validado aquí mismo
 *    (verify_jwt = false: con las claves nuevas sb_publishable/sb_secret el gateway no lo valida).
 * 2. La foto: data URL JPEG o WebP en base64, hasta 1 MB.
 * 3. `scan_begin` (service_role): permisos (su liga, de boliche, sin menores, evento abierto), caché por SHA-256
 *    de 24 h, cupos (40 por cuenta al día, 8 s entre fotos, 900 al día en total) y el primer modelo con cupo en
 *    este minuto. Ver supabase/migrations/20260926001000_scan.sql.
 * 4. Hasta 2 modelos, 20 s cada uno. 429, 5xx o tiempo agotado: el siguiente (`scan_next_model`). Si ninguno
 *    responde: `{retry: true}` y scanJobs vuelve a intentar más tarde.
 * 5. `scan_finish` guarda la respuesta en la caché (o le devuelve la lectura a la cuenta si nadie respondió).
 *
 * Respuestas (JSON):
 * - 200 `{rows, model, cached}` — las filas leídas (ScanRow[]).
 * - 200 `{retry: true, reason, retryAfter, message}` — no se pudo ahora; reintentar en `retryAfter` segundos.
 * - 4xx/5xx `{code, message}` — `code` en FAILURE_STATUS; `message` en español para mostrar.
 */

// =====================================================================
// Prompt y schema (los mismos de BowlingX: una prueba con su SHA-256 evita que cambien sin querer)
// =====================================================================

/** El prompt de BowlingX (src/lib/scan.ts en 29334d1), sin cambiar ni una letra. */
export const SCAN_PROMPT = `Esta foto es de la pantalla de una bolera (boliche / bowling). Puede estar en español o en inglés,
tomada en ángulo, con reflejos o con varios jugadores.

Extrae, para cada jugador que aparezca:
- nombre: exactamente como se ve en pantalla.
- handicap: el handicap que muestre la pantalla (columna "Handicap"/"Hdcp"), o null si no aparece.
- juegos: la puntuación SCRATCH (sin handicap) de cada juego, uno por columna y en su posición: Game 1, Game 2,
  Game 3... En pantallas en español es la fila "Puntuación real". Si un juego aparece en 0 o vacío, pon 0 en esa
  posición (no lo saltes). NO incluyas totales, series, promedios ni la suma con handicap.
  Si es un marcador cuadro por cuadro (frames) de un juego terminado, devuelve solo el total final de ese juego.
- total: el total scratch del jugador que muestre la pantalla ("Scratch", "Total", "Puntuación real"), o null.

Si la pantalla muestra un solo jugador a la vez (por ejemplo una pestaña de "Estadísticas"), devuelve solo ese jugador.
Si la pantalla solo tiene totales o promedios (por ejemplo "Statistics": Games, Total score, Average) sin los juegos
uno por uno, pon soloTotales=true, juegos vacío y el total de cada jugador.
Solo incluye números que se lean con claridad. Cada juego vale entre 0 y 300.
Si la foto no es de una pantalla de resultados de boliche, devuelve esPantallaDeBoliche=false y jugadores vacío.`;

/**
 * El responseSchema de BowlingX tal como lo mandaba Firebase AI Logic (`Schema.object({...})` en JSON, con el
 * mismo orden de claves). Para la API REST de Gemini se pasa por `geminiSchema` (tipos en mayúscula).
 */
export const SCAN_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    esPantallaDeBoliche: { type: 'boolean', description: 'true si la foto muestra resultados o marcador de boliche', nullable: false },
    soloTotales: {
      type: 'boolean',
      description: 'true si la pantalla solo muestra totales o promedios por jugador, sin los juegos uno por uno',
      nullable: false,
    },
    jugadores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre del jugador tal como aparece', nullable: false },
          handicap: { type: 'integer', nullable: true, description: 'Handicap mostrado, o null' },
          juegos: {
            type: 'array',
            items: { type: 'integer', nullable: false },
            description: 'Pinos scratch de cada juego en su posición (Game 1, Game 2...); 0 si no lo jugó',
            nullable: false,
          },
          total: { type: 'integer', nullable: true, description: 'Total scratch que muestra la pantalla, o null' },
        },
        nullable: false,
        required: ['nombre', 'handicap', 'juegos', 'total'],
      },
      nullable: false,
    },
  },
  nullable: false,
  required: ['esPantallaDeBoliche', 'soloTotales', 'jugadores'],
} as const;

/** El mismo schema con los tipos como los escribe la documentación REST de Gemini ('OBJECT', 'INTEGER'…). */
export function geminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (schema && typeof schema === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema)) out[k] = k === 'type' && typeof v === 'string' ? v.toUpperCase() : geminiSchema(v);
    return out;
  }
  return schema;
}

// =====================================================================
// Resultado: de la respuesta de la IA a filas limpias
// =====================================================================

const MAX_SCORE = 300;
/** Topes de lo que se guarda y se devuelve (una pantalla trae 1–8 jugadores y hasta 10 juegos). */
const MAX_PLAYERS = 24;
const MAX_GAMES = 12;
const MAX_NAME = 60;

export interface ScanRow {
  /** Nombre tal como aparece en la pantalla. */
  name: string;
  handicap: number | null;
  /**
   * Pinos scratch por juego, respetando la posición de la pantalla (Game 1, Game 2, ...).
   * null = ese juego no se jugó (la pantalla lo muestra en 0 o vacío).
   */
  games: (number | null)[];
  /** Total scratch que muestra la pantalla para el jugador, si aparece. */
  total: number | null;
  /** true si la suma de los juegos cuadra con el total de la pantalla; null si no hay total. */
  matchesTotal: boolean | null;
}

/**
 * Por qué no se pudo leer la foto: `foto` (la foto no sirve), `red` (sin señal, la IA tardó o el servidor falló:
 * se reintenta sola), `cupo` (sin cupo gratis por ahora o hay que esperar unos segundos: se reintenta sola) o
 * `config` (reintentar no sirve: la configuración, los permisos o el límite del día).
 */
export type ScanErrorKind = 'foto' | 'red' | 'cupo' | 'config';

export class ScanError extends Error {
  constructor(
    message: string,
    readonly kind: ScanErrorKind = 'foto',
    /** Cuándo vale la pena volver a intentar (lo dice el servidor), en ms. */
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'ScanError';
  }
}

const isScore = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_SCORE;

/** Lo que devuelve la IA según el schema. */
export interface RawScan {
  esPantallaDeBoliche?: boolean;
  soloTotales?: boolean;
  jugadores?: RawPlayer[];
}

export interface RawPlayer {
  nombre?: string;
  handicap?: number | null;
  juegos?: number[];
  total?: number | null;
}

/** Convierte la respuesta JSON de la IA en filas limpias, o explica por qué la foto no sirve. */
export function parseScanResult(text: string): ScanRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ScanError('La IA no devolvió un resultado legible. Prueba con otra foto.');
  }
  return rowsFromScan(parsed);
}

/** Lo mismo con la respuesta ya leída (objeto). */
export function rowsFromScan(raw: unknown): ScanRow[] {
  const parsed = (raw && typeof raw === 'object' ? raw : {}) as RawScan;
  if (parsed.esPantallaDeBoliche === false) {
    throw new ScanError('La foto no parece una pantalla de resultados de boliche.');
  }

  const players = (Array.isArray(parsed.jugadores) ? parsed.jugadores : []).map((j) => {
    // 0 = no jugó (puestos vacíos de la máquina, o entró tarde). Se conserva la posición de cada juego.
    const games = (Array.isArray(j?.juegos) ? j.juegos : []).map((g) => (isScore(g) && g > 0 ? g : null));
    while (games.length && games[games.length - 1] == null) games.pop();
    const total = typeof j?.total === 'number' && j.total > 0 ? j.total : null;
    const sum = games.reduce<number>((a, g) => a + (g ?? 0), 0);
    return {
      name: (typeof j?.nombre === 'string' ? j.nombre : '').trim(),
      handicap: typeof j?.handicap === 'number' ? j.handicap : null,
      games,
      total,
      matchesTotal: total == null || !games.length ? null : sum === total,
    };
  });

  const rows = players.filter((r) => r.name && r.games.some((g) => g != null));
  if (rows.length) return rows;

  const totals = players.filter((r) => r.name && r.total);
  if (parsed.soloTotales || totals.length) {
    const sample = totals
      .slice(0, 3)
      .map((r) => `${r.name} ${r.total}`)
      .join(', ');
    throw new ScanError(
      `Esta pantalla solo muestra totales${sample ? ` (${sample})` : ''}, no los juegos uno por uno. ` +
        'Toma la foto de la pantalla de resultados con Game 1, Game 2, Game 3.',
    );
  }
  throw new ScanError('No se pudieron leer puntuaciones en la foto.');
}

const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null);

/**
 * Deja solo lo que dice el schema, con topes (lo que se guarda en la caché y se lee después). null si no es un
 * objeto. Los nombres se cortan a 60 letras (el largo que acepta set_submission_scan).
 */
export function sanitizeScan(raw: unknown): RawScan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: RawScan = {};
  if (typeof r.esPantallaDeBoliche === 'boolean') out.esPantallaDeBoliche = r.esPantallaDeBoliche;
  if (typeof r.soloTotales === 'boolean') out.soloTotales = r.soloTotales;
  out.jugadores = (Array.isArray(r.jugadores) ? r.jugadores : []).slice(0, MAX_PLAYERS).map((p): RawPlayer => {
    const j = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    return {
      nombre: typeof j.nombre === 'string' ? j.nombre.trim().slice(0, MAX_NAME) : '',
      handicap: int(j.handicap),
      juegos: (Array.isArray(j.juegos) ? j.juegos : []).slice(0, MAX_GAMES).map((g) => int(g) ?? 0),
      total: int(j.total),
    };
  });
  return out;
}

// =====================================================================
// Petición
// =====================================================================

/** La foto que llega (la copia nítida para la IA pesa ~500 kB; la guardada ~110 kB). */
export const MAX_IMAGE_BYTES = 1_048_576;
/** El cuerpo JSON completo: la foto en base64 (4/3 del tamaño) y los ids. */
export const MAX_BODY_CHARS = 1_500_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_URL = /^data:(image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/;

export type ScanImageType = 'image/jpeg' | 'image/webp';

export interface ScanRequest {
  mimeType: ScanImageType;
  /** La foto en base64 (sin el `data:...;base64,`). */
  base64: string;
  bytes: number;
  leagueId: string;
  /** null = envío por fecha (todavía sin evento). */
  eventId: string | null;
}

/** Lo que manda la app: `{ image: 'data:image/jpeg;base64,...', leagueId, eventId? }`. */
export function parseScanRequest(body: unknown): { ok: true; request: ScanRequest } | { ok: false; message: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof b.leagueId !== 'string' || !UUID.test(b.leagueId)) return { ok: false, message: 'Falta la liga de la foto.' };
  if (b.eventId != null && (typeof b.eventId !== 'string' || !UUID.test(b.eventId))) return { ok: false, message: 'El evento no es válido.' };
  if (typeof b.image !== 'string') return { ok: false, message: 'Falta la foto.' };
  if (b.image.length > MAX_BODY_CHARS) return { ok: false, message: 'La foto es muy grande (máximo 1 MB).' };
  const m = DATA_URL.exec(b.image);
  if (!m || m[2].length % 4 !== 0) return { ok: false, message: 'La foto tiene que ser JPEG o WebP.' };
  const [, mimeType, base64] = m;
  const bytes = (base64.length / 4) * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (bytes > MAX_IMAGE_BYTES) return { ok: false, message: 'La foto es muy grande (máximo 1 MB).' };
  if (bytes < 100 || !magicOk(mimeType as ScanImageType, base64)) return { ok: false, message: 'La foto está dañada o no es JPEG ni WebP.' };
  return {
    ok: true,
    request: {
      mimeType: mimeType as ScanImageType,
      base64,
      bytes,
      leagueId: b.leagueId.toLowerCase(),
      eventId: typeof b.eventId === 'string' ? b.eventId.toLowerCase() : null,
    },
  };
}

/** Los primeros bytes dicen si de verdad es JPEG (FF D8 FF) o WebP ('RIFF' .... 'WEBP'). */
function magicOk(type: ScanImageType, base64: string): boolean {
  let head: string;
  try {
    head = atob(base64.slice(0, 16));
  } catch {
    return false;
  }
  if (type === 'image/jpeg') return head.charCodeAt(0) === 0xff && head.charCodeAt(1) === 0xd8 && head.charCodeAt(2) === 0xff;
  return head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP';
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Sube si cambia el prompt o el schema: así la caché no devuelve lecturas hechas con otro prompt. */
export const SCAN_CACHE_VERSION = 1;

/** Clave de la caché: SHA-256 de la foto en base64 (la misma foto, la misma clave). */
export const scanCacheKey = (base64: string) => sha256Hex(`v${SCAN_CACHE_VERSION}:${base64}`);

// =====================================================================
// Modelos (Gemini API gratis)
// =====================================================================

/** En orden: cada uno tiene su propio cupo gratis (unas 500 al día). */
export const DEFAULT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
/** Espera máxima por modelo y modelos por invocación: 2 × 20 s cabe de sobra en los 150 s de la función. */
export const MODEL_TIMEOUT_MS = 20_000;
export const MAX_MODELS_PER_CALL = 2;
/** Tope propio por minuto y modelo (por debajo del de Google). */
export const DEFAULT_MODEL_RPM = 12;
export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const MODEL_NAME = /^[a-z0-9][a-z0-9.-]{0,79}$/;

/** `SCAN_MODELS` = nombres separados por coma; sin nada, la cadena de siempre. */
export function parseModels(value: string | undefined | null): string[] {
  const list = (value ?? '')
    .split(/[\s,]+/)
    .map((m) => m.trim().toLowerCase())
    .filter((m, i, all) => MODEL_NAME.test(m) && all.indexOf(m) === i);
  return list.length ? list : [...DEFAULT_MODELS];
}

/** Los que siguen a `current` en la lista (para pedir el siguiente con cupo). */
export const modelsAfter = (models: readonly string[], current: string) => models.slice(models.indexOf(current) + 1);

/** El pedido a Gemini: el mismo prompt, la foto y el mismo schema que BowlingX (temperatura 0, JSON). */
export function geminiRequest(req: Pick<ScanRequest, 'mimeType' | 'base64'>) {
  return {
    contents: [{ role: 'user', parts: [{ text: SCAN_PROMPT }, { inlineData: { mimeType: req.mimeType, data: req.base64 } }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: geminiSchema(SCAN_RESPONSE_SCHEMA), temperature: 0 },
  };
}

export type NextReason = 'cupo' | 'servidor' | 'tiempo' | 'modelo';

export type ModelOutcome =
  | { kind: 'ok'; text: string }
  /** Probar con el siguiente modelo (y si no hay, reintentar más tarde). */
  | { kind: 'next'; reason: NextReason; retryAfter?: number }
  /** La clave, los permisos o la región de Google: reintentar no sirve. `detail` va al log, no al usuario. */
  | { kind: 'config'; detail: string }
  /** Google recibió la foto pero no la quiso o no pudo leerla. */
  | { kind: 'foto'; message: string };

const FOTO_BLOCKED = 'La IA no pudo leer esta foto. Prueba con otra foto.';
/** Motivos de parada que significan «no la leyó» (bloqueo, contenido, respuesta cortada). */
const BAD_FINISH = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'MAX_TOKENS', 'MALFORMED_FUNCTION_CALL', 'OTHER']);

/** El texto de la respuesta (sin las partes de «pensamiento» de los modelos que razonan). */
export function geminiText(body: unknown): { text: string | null; blocked: boolean } {
  const b = (body ?? {}) as {
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: { text?: unknown; thought?: unknown }[] } }[];
  };
  if (b.promptFeedback?.blockReason) return { text: null, blocked: true };
  const c = b.candidates?.[0];
  if (!c) return { text: null, blocked: false };
  const text = (c.content?.parts ?? [])
    .filter((p) => p && typeof p.text === 'string' && p.thought !== true)
    .map((p) => p.text as string)
    .join('');
  if (c.finishReason && BAD_FINISH.has(c.finishReason)) return { text: null, blocked: true };
  return { text: text.trim() ? text : null, blocked: false };
}

/** Segundos de `RetryInfo.retryDelay` ('37s') en un 429 de Google, si viene. */
function retryDelay(body: unknown): number | undefined {
  const details = ((body as { error?: { details?: unknown } } | null)?.error?.details ?? []) as { retryDelay?: unknown }[];
  for (const d of Array.isArray(details) ? details : []) {
    const m = typeof d?.retryDelay === 'string' ? /^(\d+(?:\.\d+)?)s$/.exec(d.retryDelay) : null;
    if (m) return Math.ceil(Number(m[1]));
  }
  return undefined;
}

/** Qué hacer con la respuesta HTTP de Gemini. */
export function classifyGemini(status: number, body: unknown): ModelOutcome {
  if (status >= 200 && status < 300) {
    const { text, blocked } = geminiText(body);
    if (text) return { kind: 'ok', text };
    return { kind: 'foto', message: blocked ? FOTO_BLOCKED : 'La IA no devolvió ninguna lectura. Prueba con otra foto.' };
  }
  const err = ((body as { error?: { message?: unknown; status?: unknown } } | null)?.error ?? {}) as { message?: unknown; status?: unknown };
  const message = typeof err.message === 'string' ? err.message : '';
  const detail = `${status} ${typeof err.status === 'string' ? err.status : ''} ${message}`.trim();
  if (status === 429) return { kind: 'next', reason: 'cupo', retryAfter: retryDelay(body) };
  if (status === 404) return { kind: 'next', reason: 'modelo' };
  if (status === 401 || status === 403) return { kind: 'config', detail };
  if (status === 400) {
    // Clave mala, API apagada o región sin capa gratis (la función tiene que correr en us-east-1).
    if (/api.?key|location|region|billing|FAILED_PRECONDITION|SERVICE_DISABLED|has not been used/i.test(detail)) return { kind: 'config', detail };
    return { kind: 'foto', message: FOTO_BLOCKED };
  }
  return { kind: 'next', reason: 'servidor' };
}

// =====================================================================
// CORS y configuración
// =====================================================================

/** Todo lo que manda supabase-js al invocar (ver @supabase/supabase-js/cors) más la región. */
export const CORS_ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type, x-region, x-retry-count, traceparent, tracestate, baggage';

/** `SCAN_ALLOWED_ORIGINS` = orígenes exactos separados por coma (p. ej. `https://matchmate.app,http://localhost:5173`). */
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

export interface ScanConfig {
  /** GEMINI_API_KEY (auth key de Google AI Studio, de un proyecto de Google solo para MatchMate). */
  apiKey: string | null;
  allowedOrigins: string[];
  models: string[];
  /** Tope por minuto y modelo que aplica la base. */
  perMinute: number;
  timeoutMs: number;
}

const clampInt = (value: string | undefined, min: number, max: number, fallback: number) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Configuración desde las variables de la función (`Deno.env.get`). */
export function scanConfig(env: (name: string) => string | undefined): ScanConfig {
  return {
    apiKey: env('GEMINI_API_KEY')?.trim() || null,
    allowedOrigins: parseOrigins(env('SCAN_ALLOWED_ORIGINS')),
    models: parseModels(env('SCAN_MODELS')),
    perMinute: clampInt(env('SCAN_MODEL_RPM'), 1, 1000, DEFAULT_MODEL_RPM),
    timeoutMs: clampInt(env('SCAN_TIMEOUT_MS'), 1000, MODEL_TIMEOUT_MS, MODEL_TIMEOUT_MS),
  };
}

// =====================================================================
// Respuestas
// =====================================================================

export type ScanRetryReason = 'cupo' | 'espera' | 'tiempo' | 'servidor';

export interface ScanOk {
  rows: ScanRow[];
  model: string | null;
  cached: boolean;
}

export interface ScanRetry {
  retry: true;
  reason: ScanRetryReason;
  /** Segundos. */
  retryAfter: number;
  message: string;
}

export type ScanResponse = ScanOk | ScanRetry;

export type ScanFailureCode = 'invalido' | 'sesion' | 'no_permitido' | 'no_existe' | 'cerrado' | 'foto' | 'limite' | 'config' | 'servidor';

export interface ScanFailure {
  code: ScanFailureCode;
  message: string;
}

export const FAILURE_STATUS: Record<ScanFailureCode, number> = {
  invalido: 400,
  sesion: 401,
  no_permitido: 403,
  no_existe: 404,
  cerrado: 409,
  foto: 422,
  limite: 429,
  config: 500,
  servidor: 503,
};

const CONFIG_MESSAGE = 'La lectura con IA no está disponible ahora (configuración del servidor). Anota los juegos a mano; la foto queda como comprobante.';
const RETRY_MESSAGE: Record<ScanRetryReason, string> = {
  cupo: 'Se alcanzó el límite gratuito de la IA por ahora. Se vuelve a intentar en un momento.',
  espera: 'Espera unos segundos entre una foto y otra.',
  tiempo: 'La IA tardó demasiado en responder.',
  servidor: 'La IA no respondió.',
};

// =====================================================================
// Manejador
// =====================================================================

export interface DbError {
  code?: string | null;
  message?: string | null;
}

export interface ScanDeps extends ScanConfig {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** `supabase.auth.getClaims(token)`: valida el JWT (JWKS) y devuelve sus claims. */
  getClaims: (token: string) => Promise<{ data: { claims?: Record<string, unknown> | null } | null; error: unknown }>;
  /** `supabase.rpc(fn, args)` con la clave secreta (service_role). */
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: DbError | null }>;
  log?: (message: string, extra?: unknown) => void;
}

type Begin =
  | { status: 'cached'; result: unknown; model: string | null }
  | { status: 'ok'; model: string }
  | { status: 'limit'; reason: 'espera' | 'usuario' | 'global' | 'ocupado'; retryAfter: number; limit: number | null };

/** Lo que devuelve scan_begin (se revisa por si acaso). */
function parseBegin(data: unknown): Begin | null {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  if (d.status === 'cached') return { status: 'cached', result: d.result, model: typeof d.model === 'string' ? d.model : null };
  if (d.status === 'ok' && typeof d.model === 'string') return { status: 'ok', model: d.model };
  if (d.status === 'limit' && (d.reason === 'espera' || d.reason === 'usuario' || d.reason === 'global' || d.reason === 'ocupado')) {
    const retryAfter = typeof d.retry_after === 'number' && d.retry_after > 0 ? Math.ceil(d.retry_after) : 60;
    return { status: 'limit', reason: d.reason, retryAfter, limit: typeof d.limit === 'number' ? d.limit : null };
  }
  return null;
}

/** Error de una RPC (la RPC lanza su código corto: 'no_permitido', 'no_existe', 'cerrado', 'invalido'). */
export function dbFailure(e: DbError): ScanFailure {
  const code = (e.message ?? '').trim().split(/[\s:]/)[0];
  if (code === 'no_permitido' || e.code === '42501') return { code: 'no_permitido', message: 'La lectura con IA no está disponible para ti en esta liga.' };
  if (code === 'no_existe') return { code: 'no_existe', message: 'La liga o el evento de la foto ya no existe.' };
  if (code === 'cerrado') {
    return { code: 'cerrado', message: 'Ese evento ya cerró: la lectura con IA es para los eventos de las últimas 2 semanas. Revisa la foto tú.' };
  }
  if (code === 'invalido') return { code: 'invalido', message: 'Datos inválidos para leer la foto.' };
  return { code: 'servidor', message: 'No se pudo revisar el cupo de lecturas. Intenta de nuevo.' };
}

const JWT = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;
const SESSION: ScanFailure = { code: 'sesion', message: 'Entra a tu cuenta para leer fotos con IA.' };
const SERVER: ScanFailure = { code: 'servidor', message: 'No se pudo leer la foto ahora. Intenta de nuevo.' };

/** El id de la cuenta si el JWT es válido (cuenta normal, no anónima). */
async function verifyUser(deps: ScanDeps, authorization: string | null): Promise<string | ScanFailure> {
  const token = JWT.exec(authorization ?? '')?.[1];
  if (!token) return SESSION;
  let res: Awaited<ReturnType<ScanDeps['getClaims']>>;
  try {
    res = await deps.getClaims(token);
  } catch (e) {
    deps.log?.('[scan-bowling] getClaims falló', e);
    return SERVER;
  }
  if (res.error) {
    const err = res.error as { name?: string; status?: number };
    return err.name === 'AuthRetryableFetchError' || (err.status ?? 0) >= 500 ? SERVER : SESSION;
  }
  const claims = res.data?.claims ?? null;
  const sub = claims?.sub;
  if (typeof sub !== 'string' || !UUID.test(sub) || claims?.role !== 'authenticated' || claims?.is_anonymous === true) return SESSION;
  return sub.toLowerCase();
}

/** Llama un modelo con su tiempo máximo. Nunca lanza: devuelve qué pasó. */
async function callModel(deps: ScanDeps, model: string, payload: string): Promise<ModelOutcome> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ModelOutcome>((resolve) => {
    timer = setTimeout(() => {
      ctrl.abort();
      resolve({ kind: 'next', reason: 'tiempo' });
    }, deps.timeoutMs);
  });
  const call = (async (): Promise<ModelOutcome> => {
    try {
      const res = await deps.fetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': deps.apiKey ?? '' },
        body: payload,
        signal: ctrl.signal,
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return classifyGemini(res.status, json);
    } catch {
      // Se cortó por tiempo, o no hubo red con Google.
      return { kind: 'next', reason: ctrl.signal.aborted ? 'tiempo' : 'servidor' };
    }
  })();
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Atiende una petición a la Edge Function. Nunca lanza. */
export async function handleScanRequest(req: Request, deps: ScanDeps): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, deps.allowedOrigins);
  // Otra página web: ni CORS ni lectura (sin Origin es una herramienta o un servidor; igual necesita el JWT).
  if (origin && !cors) return new Response('Origen no permitido', { status: 403, headers: { vary: 'Origin' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors ?? {} });

  const send = (status: number, body: ScanResponse | ScanFailure) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...(cors ?? {}), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  const fail = (f: ScanFailure) => send(FAILURE_STATUS[f.code], f);
  if (req.method !== 'POST') return send(405, { code: 'invalido', message: 'Usa POST.' });

  try {
    return await scan(req, deps, send, fail);
  } catch (e) {
    deps.log?.('[scan-bowling] error inesperado', e);
    return fail(SERVER);
  }
}

async function scan(
  req: Request,
  deps: ScanDeps,
  send: (status: number, body: ScanResponse | ScanFailure) => Response,
  fail: (f: ScanFailure) => Response,
): Promise<Response> {
  if (!deps.apiKey) {
    deps.log?.('[scan-bowling] falta GEMINI_API_KEY');
    return fail({ code: 'config', message: CONFIG_MESSAGE });
  }
  const user = await verifyUser(deps, req.headers.get('authorization'));
  if (typeof user !== 'string') return fail(user);

  const tooBig: ScanFailure = { code: 'invalido', message: 'La foto es muy grande (máximo 1 MB).' };
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_CHARS) return fail(tooBig);
  const text = await req.text();
  if (text.length > MAX_BODY_CHARS) return fail(tooBig);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail({ code: 'invalido', message: 'La petición no es JSON.' });
  }
  const parsed = parseScanRequest(body);
  if (!parsed.ok) return fail({ code: 'invalido', message: parsed.message });
  const r = parsed.request;
  const key = await scanCacheKey(r.base64);

  const rowsReply = (raw: unknown, model: string | null, cached: boolean) => {
    try {
      return send(200, { rows: rowsFromScan(raw), model, cached });
    } catch (e) {
      if (e instanceof ScanError) return fail({ code: 'foto', message: e.message });
      throw e;
    }
  };
  const finish = async (model: string | null, result: RawScan | null, refund: boolean) => {
    const res = await deps.rpc('scan_finish', { p_user: user, p_key: key, p_model: model, p_result: result, p_refund: refund }).catch((e: unknown) => ({
      data: null,
      error: { message: String(e) },
    }));
    // Si no se pudo guardar, la lectura igual sirve.
    if (res.error) deps.log?.('[scan-bowling] scan_finish falló', res.error);
  };

  // Permisos, caché, cupos y el primer modelo.
  const started = await deps.rpc('scan_begin', {
    p_user: user,
    p_league: r.leagueId,
    p_event: r.eventId,
    p_key: key,
    p_models: deps.models,
    p_per_minute: deps.perMinute,
  });
  if (started.error) {
    const f = dbFailure(started.error);
    if (f.code === 'servidor') deps.log?.('[scan-bowling] scan_begin falló', started.error);
    return fail(f);
  }
  const b = parseBegin(started.data);
  if (!b) {
    deps.log?.('[scan-bowling] scan_begin respondió raro', started.data);
    return fail(SERVER);
  }
  if (b.status === 'cached') return rowsReply(b.result, b.model, true);
  if (b.status === 'limit') {
    if (b.reason === 'espera') return send(200, { retry: true, reason: 'espera', retryAfter: b.retryAfter, message: RETRY_MESSAGE.espera });
    if (b.reason === 'ocupado') return send(200, { retry: true, reason: 'cupo', retryAfter: b.retryAfter, message: RETRY_MESSAGE.cupo });
    return fail({
      code: 'limite',
      message:
        b.reason === 'usuario'
          ? `Llegaste al límite de ${b.limit ?? 40} fotos leídas con IA por hoy. Anota los juegos a mano; la foto queda como comprobante.`
          : 'Hoy se acabaron las lecturas gratis con IA. Anota los juegos a mano (la foto queda como comprobante); mañana vuelve a funcionar.',
    });
  }

  // Hasta 2 modelos.
  const payload = JSON.stringify(geminiRequest(r));
  const reasons: NextReason[] = [];
  let retryAfter: number | undefined;
  let model: string | null = b.model;
  for (let i = 0; model && i < MAX_MODELS_PER_CALL; i++) {
    const out = await callModel(deps, model, payload);
    if (out.kind === 'ok') {
      let raw: RawScan | null = null;
      try {
        raw = sanitizeScan(JSON.parse(out.text));
      } catch {
        raw = null;
      }
      if (!raw) {
        await finish(model, null, false);
        return fail({ code: 'foto', message: 'La IA no devolvió un resultado legible. Prueba con otra foto.' });
      }
      await finish(model, raw, false);
      return rowsReply(raw, model, false);
    }
    if (out.kind === 'foto') {
      await finish(model, null, false);
      return fail({ code: 'foto', message: out.message });
    }
    if (out.kind === 'config') {
      deps.log?.(`[scan-bowling] ${model}: configuración de Gemini`, out.detail);
      await finish(model, null, true);
      return fail({ code: 'config', message: CONFIG_MESSAGE });
    }
    deps.log?.(`[scan-bowling] ${model}: ${out.reason}`);
    reasons.push(out.reason);
    if (out.retryAfter) retryAfter = out.retryAfter;
    if (i + 1 >= MAX_MODELS_PER_CALL) break;
    const next = await deps.rpc('scan_next_model', { p_models: modelsAfter(deps.models, model), p_per_minute: deps.perMinute });
    model = !next.error && typeof next.data === 'string' ? next.data : null;
  }

  // Ningún modelo respondió: la lectura se le devuelve a la cuenta.
  await finish(null, null, true);
  if (reasons.length && reasons.every((x) => x === 'modelo')) {
    deps.log?.('[scan-bowling] ningún modelo de SCAN_MODELS existe', deps.models);
    return fail({ code: 'config', message: CONFIG_MESSAGE });
  }
  const last = [...reasons].reverse().find((x) => x !== 'modelo') ?? 'servidor';
  const reason: ScanRetryReason = last === 'cupo' ? 'cupo' : last === 'tiempo' ? 'tiempo' : 'servidor';
  const wait = reason === 'cupo' ? Math.min(300, Math.max(10, retryAfter ?? 60)) : 10;
  return send(200, { retry: true, reason, retryAfter: wait, message: RETRY_MESSAGE[reason] });
}
