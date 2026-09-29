import type { BackendError } from '../backend/types';

/**
 * Qué hacer con un error del backend:
 * - `retry`: sin señal, servidor caído o se tardó mucho. Se reintenta solo (la lectura guarda lo último que tenía).
 * - `auth`: la sesión venció. No es culpa de la operación: se espera a que la sesión se renueve.
 * - `final`: el servidor dijo que no (permiso, evento cerrado, datos malos, rate_limited). No sirve reintentar.
 */
export type ErrorClass = 'retry' | 'auth' | 'final';

/** El error como BackendError (por su forma, así funciona aunque venga de otra copia del módulo). */
export function asBackendError(e: unknown): BackendError | null {
  if (e instanceof Error && 'kind' in e && 'retryable' in e && typeof (e as BackendError).kind === 'string') return e as BackendError;
  return null;
}

export function classifyError(e: unknown): ErrorClass {
  const be = asBackendError(e);
  if (be) {
    if (be.kind === 'auth') return 'auth';
    return be.retryable ? 'retry' : 'final';
  }
  if (e instanceof Error) {
    // fetch sin señal ('Failed to fetch', 'Load failed' en Safari) o cortado por tiempo.
    if (e.name === 'AbortError' || e.name === 'TimeoutError') return 'retry';
    if (e.name === 'TypeError' && /fetch|network|load failed|connection/i.test(e.message)) return 'retry';
  }
  return 'final';
}

/**
 * El servidor no tiene esa función o columna (todavía o ya no): PostgREST PGRST202 / PGRST204, Postgres 42883 / 42703.
 * Pasa cuando la app del teléfono y la base no van a la par (p. ej. una versión vieja guardada por el service
 * worker). Los `no_existe` de nuestras RPC (P0001) no cuentan: esos son del negocio.
 */
const OUTDATED_CODES = new Set(['PGRST202', 'PGRST204', '42883', '42703']);

export const isOutdatedCode = (code: string | null | undefined): boolean => !!code && OUTDATED_CODES.has(code);

/** ¿La app y la base no van a la par? Se mira el código, venga como BackendError (de cualquier tipo) o crudo. */
export function isOutdatedAppError(e: unknown): boolean {
  const be = asBackendError(e);
  if (be) return isOutdatedCode(be.code);
  const code = e && typeof e === 'object' ? (e as { code?: unknown }).code : null;
  return typeof code === 'string' && isOutdatedCode(code);
}

/** Perder el acceso (sacado de la liga, liga borrada o privada): no se debe quedar la copia en el teléfono. */
export function isAccessLoss(e: unknown): boolean {
  const kind = asBackendError(e)?.kind;
  return kind === 'permission' || kind === 'not_found';
}

export function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  return new Error(typeof e === 'string' ? e : 'Error desconocido');
}
