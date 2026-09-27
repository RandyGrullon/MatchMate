/**
 * Traducción de errores de Postgres, PostgREST, Auth, Storage y Edge Functions a `BackendError`.
 * La usan los dos backends (Supabase y local) para que la app vea exactamente los mismos errores.
 */
import { BackendError, type BackendErrorKind } from './types';

/** Lo que traen un error de Postgres (PGlite) o de PostgREST: código SQLSTATE o PGRSTxxx, mensaje y, a veces, estado HTTP. */
export interface DbErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  /** Estado HTTP (solo PostgREST). 0 = no hubo respuesta (sin señal). */
  status?: number | null;
}

/**
 * Códigos cortos que lanzan las RPC con `raise exception '<codigo>' using errcode = 'P0001'`
 * (ver docs/arquitectura.md). Los que no están aquí (`invalido`, `cerrado`, …) son de validación.
 */
const P0001_KINDS: Record<string, BackendErrorKind> = {
  rate_limited: 'rate_limited',
  no_permitido: 'permission',
  no_existe: 'not_found',
  duplicado: 'conflict',
};

/** Primera palabra del mensaje de una RPC: 'invalido: nombre' → 'invalido'. */
const raisedCode = (message: string) => message.trim().split(/[\s:]/)[0];

/**
 * Cuenta bloqueada por el superadmin (consola): toda RPC que escribe falla con 'bloqueada' (42501). Sale como
 * `permission` con código 'bloqueada' y este mensaje, para que la pantalla lo muestre tal cual.
 */
export const BLOCKED_CODE = 'bloqueada';
export const BLOCKED_MESSAGE = 'Tu cuenta está bloqueada. Escríbele al equipo de MatchMate.';

/** ¿El error es de una cuenta bloqueada? */
export const isBlockedError = (e: unknown): boolean =>
  !!e && typeof e === 'object' && ((e as { code?: unknown }).code === BLOCKED_CODE || (e as { message?: unknown }).message === BLOCKED_MESSAGE);

/** Por estado HTTP, cuando no hay un código que diga más. */
function kindFromStatus(status: number): BackendErrorKind | null {
  if (status === 0 || status >= 500) return 'network';
  if (status === 401) return 'auth';
  if (status === 403) return 'permission';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status === 400 || status === 413 || status === 422) return 'validation';
  return null;
}

/**
 * Error de fetch: sin señal, DNS, CORS o servidor que no responde. El TypeError de fetch se reconoce por su
 * mensaje (Chrome, Firefox, Safari y Node lo dicen distinto): un TypeError de un error de código NO es de red.
 */
export function isFetchFailure(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const { name, message } = e as { name?: unknown; message?: unknown };
  const text = `${String(name ?? '')} ${String(message ?? '')}`;
  return name === 'AbortError' || /Failed to fetch|fetch failed|NetworkError|Load failed|network request failed|FetchError/i.test(text);
}

/** Error de Postgres o PostgREST → BackendError. */
export function mapDbError(e: DbErrorLike): BackendError {
  const code = e.code || null;
  const message = (e.message || '').trim() || 'Error de la base de datos';
  const status = typeof e.status === 'number' ? e.status : null;

  if (raisedCode(message) === BLOCKED_CODE && (code === '42501' || code === 'P0001' || code === BLOCKED_CODE || (!code && status === 403))) {
    return new BackendError(BLOCKED_MESSAGE, 'permission', BLOCKED_CODE);
  }
  if (code) {
    if (code === 'P0001') {
      const kind = P0001_KINDS[raisedCode(message)] ?? 'validation';
      return new BackendError(message, kind, code);
    }
    if (code === '42501') return new BackendError(message, 'permission', code);
    if (code === '23505') return new BackendError(message, 'conflict', code);
    // 23514 check, 23502 not null, 23503 llave foránea, 22xxx datos inválidos (uuid, número, fecha…).
    if (code.startsWith('23') || code.startsWith('22')) return new BackendError(message, 'validation', code);
    // PGRST116: se pidió una fila y no hubo; P0002: no_data_found; PGRST202/205 y 42883/42P01: no existe la función o tabla.
    if (['PGRST116', 'P0002', 'PGRST202', 'PGRST205', '42883', '42P01'].includes(code)) return new BackendError(message, 'not_found', code);
    // JWT vencido o inválido, o credenciales de la base.
    if (code.startsWith('PGRST30') || code === '28000' || code === '28P01') return new BackendError(message, 'auth', code);
    // PostgREST no llega a la base (PGRST000–003) o conexión caída (08xxx): se reintenta.
    if (/^PGRST00\d$/.test(code) || code.startsWith('08')) return new BackendError(message, 'network', code);
    // Choques pasajeros: serialización, deadlock, lock, tiempo agotado, falta de recursos. Se reintenta.
    if (['40001', '40P01', '55P03', '57014'].includes(code) || code.startsWith('53')) {
      return new BackendError(message, 'unknown', code, true);
    }
  }
  if (status !== null) {
    const kind = kindFromStatus(status);
    if (kind) return new BackendError(message, kind, code);
  }
  if (!code && isFetchFailure({ name: '', message })) return new BackendError(message, 'network', null);
  return new BackendError(message, 'unknown', code);
}

/** Cualquier cosa lanzada → BackendError (si ya lo es, se devuelve igual). */
export function toBackendError(e: unknown): BackendError {
  if (e instanceof BackendError) return e;
  if (isFetchFailure(e)) return new BackendError((e as Error).message || 'Sin conexión', 'network');
  if (e && typeof e === 'object' && ('code' in e || 'status' in e)) {
    const x = e as { code?: unknown; message?: unknown; details?: unknown; detail?: unknown; hint?: unknown; status?: unknown };
    return mapDbError({
      code: typeof x.code === 'string' ? x.code : null,
      message: typeof x.message === 'string' ? x.message : String(x.message ?? ''),
      details: typeof x.details === 'string' ? x.details : typeof x.detail === 'string' ? x.detail : null,
      status: typeof x.status === 'number' ? x.status : null,
    });
  }
  const message = e instanceof Error ? e.message : String(e);
  return new BackendError(message || 'Error desconocido', 'unknown');
}

/** Error de Auth (auth-js o local): código de Supabase → tipo y mensaje en español. */
export interface AuthErrorLike {
  name?: string;
  message?: string;
  code?: string | null;
  status?: number | null;
}

const AUTH_CODES: Record<string, { kind: BackendErrorKind; message: string }> = {
  invalid_credentials: { kind: 'auth', message: 'Correo o contraseña incorrectos.' },
  email_not_confirmed: { kind: 'auth', message: 'Confirma tu correo antes de entrar (revisa tu bandeja de entrada).' },
  user_banned: { kind: 'auth', message: 'Esta cuenta está desactivada.' },
  session_not_found: { kind: 'auth', message: 'Tu sesión venció. Entra de nuevo.' },
  session_expired: { kind: 'auth', message: 'Tu sesión venció. Entra de nuevo.' },
  refresh_token_not_found: { kind: 'auth', message: 'Tu sesión venció. Entra de nuevo.' },
  refresh_token_already_used: { kind: 'auth', message: 'Tu sesión venció. Entra de nuevo.' },
  bad_jwt: { kind: 'auth', message: 'Tu sesión venció. Entra de nuevo.' },
  reauthentication_needed: { kind: 'auth', message: 'Entra de nuevo para cambiar la contraseña.' },
  signup_disabled: { kind: 'auth', message: 'El registro está cerrado por ahora.' },
  email_provider_disabled: { kind: 'auth', message: 'Esa forma de entrar no está activada.' },
  provider_disabled: { kind: 'auth', message: 'Esa forma de entrar no está activada.' },
  email_exists: { kind: 'conflict', message: 'Ya existe una cuenta con ese correo. Entra con tu contraseña o con Google.' },
  user_already_exists: { kind: 'conflict', message: 'Ya existe una cuenta con ese correo. Entra con tu contraseña o con Google.' },
  identity_already_exists: { kind: 'conflict', message: 'Esa cuenta de Google ya está unida a otro usuario.' },
  weak_password: { kind: 'validation', message: 'La contraseña es muy débil: usa al menos 6 caracteres.' },
  same_password: { kind: 'validation', message: 'La contraseña nueva tiene que ser distinta a la anterior.' },
  email_address_invalid: { kind: 'validation', message: 'Ese correo no es válido.' },
  validation_failed: { kind: 'validation', message: 'Revisa el correo y la contraseña.' },
  captcha_failed: { kind: 'validation', message: 'No se pudo verificar que no eres un robot. Intenta de nuevo.' },
  over_request_rate_limit: { kind: 'rate_limited', message: 'Demasiados intentos. Espera unos minutos.' },
  over_email_send_rate_limit: { kind: 'rate_limited', message: 'Se enviaron muchos correos. Espera unos minutos.' },
};

export function mapAuthError(e: AuthErrorLike): BackendError {
  const code = e.code || null;
  const status = typeof e.status === 'number' ? e.status : null;
  if (e.name === 'AuthRetryableFetchError' || isFetchFailure(e) || status === 0 || (status !== null && status >= 500)) {
    return new BackendError('Sin conexión. Revisa tu internet.', 'network', code);
  }
  if (e.name === 'AuthSessionMissingError') return new BackendError(AUTH_CODES.session_not_found.message, 'auth', code ?? 'session_not_found');
  if (e.name === 'AuthWeakPasswordError') return new BackendError(AUTH_CODES.weak_password.message, 'validation', code ?? 'weak_password');
  const known = code ? AUTH_CODES[code] : undefined;
  if (known) return new BackendError(known.message, known.kind, code);
  if (status === 429) return new BackendError(AUTH_CODES.over_request_rate_limit.message, 'rate_limited', code);
  if (status === 400 || status === 422) return new BackendError(e.message || 'Datos inválidos.', 'validation', code);
  return new BackendError(e.message || 'No se pudo completar. Intenta de nuevo.', 'auth', code);
}

/** Error de Storage (storage-js) → BackendError. */
export function mapStorageError(e: { name?: string; message?: string; status?: number; statusCode?: string; code?: string }): BackendError {
  const message = e.message || 'Error guardando el archivo';
  if (isFetchFailure(e) || e.name === 'StorageUnknownError') return new BackendError(message, 'network', e.code ?? null);
  // Storage a veces responde 400 con statusCode '403' o '404' dentro del cuerpo.
  const status = Number(e.statusCode) || e.status || 0;
  // Las políticas RLS de storage.objects rechazan con 'new row violates row-level security policy'.
  if (/row-level security|unauthorized|access denied/i.test(message)) return new BackendError(message, 'permission', e.code ?? e.statusCode ?? null);
  const kind = kindFromStatus(status) ?? 'unknown';
  return new BackendError(message, kind, e.code ?? e.statusCode ?? null);
}
