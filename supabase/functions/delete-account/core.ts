/**
 * Borrar la cuenta (Ley 172-13, derecho de supresión): toda la lógica de la Edge Function `delete-account`.
 *
 * TypeScript puro y SIN imports (como _shared/scan-core.ts): Deno exige la extensión `.ts` en las rutas y el tsc
 * de la app no la acepta. Lo usan la función (`index.ts` solo arma las dependencias) y las pruebas (Vitest en
 * Node, `src/pages/legal/deleteAccountFunction.test.ts`).
 *
 * Un borrado (una invocación, POST con `{confirm: 'BORRAR'}`):
 * 1. CORS solo para los orígenes de la app (SCAN_ALLOWED_ORIGINS, los mismos de la lectura de fotos) y el JWT de
 *    la cuenta validado aquí (verify_jwt = false: con las claves nuevas el gateway no lo valida).
 * 2. `prepare_delete_account()` COMO LA CUENTA (con su JWT): la misma revisión que ve la app. Si tiene ligas a su
 *    nombre o es el último superadmin, no se borra (409) y la respuesta trae el plan para guiarla. Una cuenta
 *    bloqueada no pasa de aquí (403 'bloqueada').
 * 3. `auth.admin.deleteUser` con la clave secreta: borra auth.users y la base borra lo suyo en cascada
 *    (20260927001500_cuenta.sql). Si justo ahora quedó dueña de una liga, la base no deja: se revisa el plan otra
 *    vez para decírselo (409); si no es eso, 500.
 *
 * Respuestas (JSON): 200 `{deleted: true}` · 4xx/5xx `{code, message}` (`message` en español para mostrar; para
 * la cuenta bloqueada, 'bloqueada', que la app traduce).
 */

export const CONFIRM_WORD = 'BORRAR';

export type DeleteFailureCode = 'invalido' | 'sesion' | 'bloqueada' | 'tiene_ligas' | 'ultimo_superadmin' | 'config' | 'servidor';

export interface DeleteFailure {
  code: DeleteFailureCode;
  message: string;
  /** El plan de prepare_delete_account cuando no se puede borrar todavía. */
  plan?: unknown;
}

export const FAILURE_STATUS: Record<DeleteFailureCode, number> = {
  invalido: 400,
  sesion: 401,
  bloqueada: 403,
  tiene_ligas: 409,
  ultimo_superadmin: 409,
  config: 500,
  servidor: 500,
};

/** Error de PostgREST o de Auth tal como lo devuelve supabase-js. */
export interface DepError {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

export interface DeleteDeps {
  allowedOrigins: string[];
  /** Falta configurar la clave secreta o la publicable (la función no puede trabajar). */
  configError?: string | null;
  getClaims(token: string): Promise<{ data: { claims: Record<string, unknown> } | null; error: unknown }>;
  /** `prepare_delete_account()` con el JWT de la cuenta. */
  prepare(token: string): Promise<{ data: unknown; error: DepError | null }>;
  /** `auth.admin.deleteUser(id)` con la clave secreta. */
  deleteUser(userId: string): Promise<{ error: DepError | null }>;
  log?(message: string, extra?: unknown): void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;
const MAX_BODY_CHARS = 2048;

export const CORS_ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type, x-region, x-retry-count, traceparent, tracestate, baggage';

/** Mensajes para la persona (los usa también el borrado del modo local, src/lib/backend/local.ts). */
export const SESSION: DeleteFailure = { code: 'sesion', message: 'Tu sesión venció. Entra de nuevo para borrar tu cuenta.' };
export const SERVER: DeleteFailure = { code: 'servidor', message: 'No se pudo borrar la cuenta ahora. Intenta de nuevo en un rato.' };
export const OWNED: DeleteFailure = { code: 'tiene_ligas', message: 'Primero pasa a otro miembro (o borra) las ligas que están a tu nombre.' };
export const LAST_SUPER: DeleteFailure = { code: 'ultimo_superadmin', message: 'Eres el único superadmin: nombra a otro antes de borrar tu cuenta.' };
export const NOT_CONFIRMED: DeleteFailure = { code: 'invalido', message: `Para borrar la cuenta hay que confirmar con la palabra ${CONFIRM_WORD}.` };

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

/** El cuerpo tiene que ser `{confirm: 'BORRAR'}` (que nadie borre una cuenta por accidente). */
export function isDeleteConfirmation(body: unknown): boolean {
  return !!body && typeof body === 'object' && !Array.isArray(body) && (body as { confirm?: unknown }).confirm === CONFIRM_WORD;
}

/** El cuerpo en texto (JSON) → ¿confirmó? */
export function parseDeleteBody(text: string): boolean {
  try {
    return isDeleteConfirmation(JSON.parse(text));
  } catch {
    return false;
  }
}

/** Lo que importa del plan de prepare_delete_account (lo demás se devuelve tal cual a la app). */
export function planBlocker(plan: unknown): DeleteFailure | null {
  const p = plan && typeof plan === 'object' ? (plan as { canDelete?: unknown; blockers?: unknown }) : null;
  if (!p) return SERVER;
  if (p.canDelete === true) return null;
  const blockers = Array.isArray(p.blockers) ? p.blockers : [];
  if (blockers.includes('last_superadmin') && !blockers.includes('owned_leagues')) return { ...LAST_SUPER, plan };
  return { ...OWNED, plan };
}

/** Error de la base al preparar → respuesta. */
export function prepareFailure(e: DepError): DeleteFailure {
  const msg = (e.message ?? '').trim();
  if (msg === 'bloqueada' || msg.startsWith('bloqueada')) return { code: 'bloqueada', message: 'bloqueada' };
  if (e.code === '42501' || e.status === 401 || /jwt|token/i.test(msg)) return SESSION;
  return SERVER;
}

export const GONE: DeleteFailure = { code: 'sesion', message: 'Esta cuenta ya no existe.' };

/**
 * Error de Auth al borrar → respuesta. GoTrue casi nunca dice por qué («Database error deleting user»): si no es
 * «no existe», quien llama vuelve a revisar el plan (¿justo quedó dueña de una liga?) con `explainDeleteError`.
 */
export function deleteFailure(e: DepError): DeleteFailure {
  const text = `${e.code ?? ''} ${e.message ?? ''}`;
  // Ya no existe (otro teléfono la borró): para la persona es lo mismo.
  if (e.status === 404 || /user not found|user_not_found/i.test(text)) return GONE;
  if (/foreign key|23503|23001|leagues_owner/i.test(text)) return OWNED;
  return SERVER;
}

/** Después de un borrado que falló: el plan de ahora dice si fue por una liga o un superadmin; si no, SERVER. */
export async function explainDeleteError(deps: Pick<DeleteDeps, 'prepare'>, token: string, e: DepError): Promise<DeleteFailure> {
  const direct = deleteFailure(e);
  if (direct.code !== 'servidor') return direct;
  try {
    const again = await deps.prepare(token);
    if (again.error) return SERVER;
    const blocked = planBlocker(again.data);
    return blocked && blocked.code !== 'servidor' ? blocked : SERVER;
  } catch {
    return SERVER;
  }
}

async function verifyUser(deps: DeleteDeps, authorization: string | null): Promise<{ id: string; token: string } | DeleteFailure> {
  const token = JWT.exec(authorization ?? '')?.[1];
  if (!token) return SESSION;
  let res: Awaited<ReturnType<DeleteDeps['getClaims']>>;
  try {
    res = await deps.getClaims(token);
  } catch (e) {
    deps.log?.('[delete-account] getClaims falló', e);
    return SERVER;
  }
  if (res.error) {
    const err = res.error as { name?: string; status?: number };
    return err.name === 'AuthRetryableFetchError' || (err.status ?? 0) >= 500 ? SERVER : SESSION;
  }
  const claims = res.data?.claims ?? null;
  const sub = claims?.sub;
  if (typeof sub !== 'string' || !UUID.test(sub) || claims?.role !== 'authenticated' || claims?.is_anonymous === true) return SESSION;
  return { id: sub.toLowerCase(), token };
}

export async function handleDeleteRequest(req: Request, deps: DeleteDeps): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, deps.allowedOrigins);
  // Otra página web: ni CORS ni borrado (sin Origin es una herramienta; igual necesita el JWT).
  if (origin && !cors) return new Response('Origen no permitido', { status: 403, headers: { vary: 'Origin' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors ?? {} });

  const send = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...(cors ?? {}), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  const fail = (f: DeleteFailure) => send(FAILURE_STATUS[f.code], f);
  if (req.method !== 'POST') return send(405, { code: 'invalido', message: 'Usa POST.' });
  if (deps.configError) {
    deps.log?.('[delete-account] configuración', deps.configError);
    return fail({ code: 'config', message: 'El borrado de cuentas no está configurado todavía. Escríbele al equipo de MatchMate.' });
  }

  try {
    const user = await verifyUser(deps, req.headers.get('authorization'));
    if ('code' in user) return fail(user);

    if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_CHARS) return fail({ code: 'invalido', message: 'Petición muy grande.' });
    const text = await req.text();
    if (text.length > MAX_BODY_CHARS || !parseDeleteBody(text)) return fail(NOT_CONFIRMED);

    const prepared = await deps.prepare(user.token);
    if (prepared.error) {
      const f = prepareFailure(prepared.error);
      if (f.code === 'servidor') deps.log?.('[delete-account] prepare_delete_account falló', prepared.error);
      return fail(f);
    }
    const blocked = planBlocker(prepared.data);
    if (blocked) return fail(blocked);

    const removed = await deps.deleteUser(user.id);
    if (removed.error) {
      deps.log?.('[delete-account] deleteUser falló', removed.error);
      return fail(await explainDeleteError(deps, user.token, removed.error));
    }
    deps.log?.('[delete-account] cuenta borrada', user.id);
    return send(200, { deleted: true });
  } catch (e) {
    deps.log?.('[delete-account] error inesperado', e);
    return fail(SERVER);
  }
}
