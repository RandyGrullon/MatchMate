import { BackendError, getBackend } from './backend';
import type { ScanFailure, ScanResponse } from '../../supabase/functions/_shared/scan-core';
import { blobToDataUrl } from './image';
import { ScanError, type ScanRow } from './scan-result';

export { ScanError, type ScanRow };

/**
 * Lee los pinos de una foto con la Edge Function `scan-bowling` (Gemini API gratis, con cupos en Postgres).
 * La foto va como data URL (la copia nítida para la IA); una URL firmada (la foto ya guardada, en aprobaciones)
 * se baja primero y se manda igual. De qué liga y evento es la decide el servidor: permisos y cupos.
 */
export interface ScanContext {
  leagueId: string;
  /** null = envío por fecha (todavía sin evento). */
  eventId?: string | null;
}

export const SCAN_FUNCTION = 'scan-bowling';

export async function scanScoreboard(image: string, ctx: ScanContext | null | undefined): Promise<ScanRow[]> {
  if (!ctx?.leagueId) throw new ScanError('Falta la liga para leer la foto.', 'config');
  let dataUrl: string;
  try {
    dataUrl = await toDataUrl(image);
  } catch {
    throw new ScanError('No se pudo abrir la foto para leerla.', 'red');
  }
  let res: unknown;
  try {
    res = await getBackend().invoke<ScanResponse>(SCAN_FUNCTION, { image: dataUrl, leagueId: ctx.leagueId, eventId: ctx.eventId ?? null });
  } catch (e) {
    throw scanErrorFrom(e);
  }
  return rowsFromResponse(res);
}

/** La foto como data URL: si ya lo es, igual; si es una URL (firmada, blob:), se baja. */
async function toDataUrl(image: string): Promise<string> {
  if (image.startsWith('data:')) return image;
  const res = await fetch(image);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return blobToDataUrl(await res.blob());
}

const isRow = (r: unknown): r is ScanRow => {
  const x = r as ScanRow | null;
  return (
    !!x &&
    typeof x.name === 'string' &&
    Array.isArray(x.games) &&
    x.games.every((g) => g === null || typeof g === 'number') &&
    (x.handicap === null || typeof x.handicap === 'number') &&
    (x.total === null || typeof x.total === 'number')
  );
};

/** Lo que respondió la función → filas, o ScanError con el tipo que entiende scanJobs. */
export function rowsFromResponse(res: unknown): ScanRow[] {
  const r = (res ?? {}) as Partial<ScanResponse> & Record<string, unknown>;
  if (Array.isArray(r.rows)) {
    const rows = r.rows.filter(isRow).map((x) => ({ ...x, matchesTotal: typeof x.matchesTotal === 'boolean' ? x.matchesTotal : null }));
    if (rows.length) return rows;
    throw new ScanError('No se pudieron leer puntuaciones en la foto.');
  }
  if (r.retry === true) {
    const after = typeof r.retryAfter === 'number' && r.retryAfter > 0 ? Math.round(r.retryAfter * 1000) : null;
    const message = typeof r.message === 'string' && r.message ? r.message : 'No se pudo escanear la foto.';
    // Sin cupo o hay que esperar unos segundos: `cupo` (se reintenta cuando dice el servidor). La IA tardó o falló: `red`.
    const kind = r.reason === 'cupo' || r.reason === 'espera' ? 'cupo' : 'red';
    throw new ScanError(message, kind, after);
  }
  throw new ScanError('No se pudo escanear la foto.', 'red');
}

/** Error al invocar la función → ScanError. El `code` del cuerpo ({code, message}) manda sobre el estado HTTP. */
export function scanErrorFrom(e: unknown): ScanError {
  if (e instanceof ScanError) return e;
  if (!(e instanceof BackendError)) return new ScanError('No se pudo escanear la foto.', 'red');
  const code = e.code as ScanFailure['code'] | string | null;
  const message = e.message && !/^Error \d+$/.test(e.message) ? e.message : null;
  switch (code) {
    case 'foto':
      return new ScanError(message ?? 'La IA no pudo leer esta foto. Prueba con otra foto.', 'foto');
    case 'invalido':
      return new ScanError(message ?? 'La foto no se pudo mandar a leer.', 'foto');
    case 'limite':
    case 'config':
    case 'no_permitido':
    case 'no_existe':
    case 'cerrado':
      return new ScanError(message ?? 'La lectura con IA no está disponible ahora.', 'config');
    case 'sesion':
      return new ScanError('Tu sesión venció. Entra de nuevo para leer fotos con IA.', 'config');
    case 'servidor':
      return new ScanError(message ?? 'No se pudo escanear la foto.', 'red');
  }
  if (e.kind === 'network') return new ScanError('Sin conexión para escanear la foto.', 'red');
  if (e.kind === 'rate_limited') return new ScanError('Se alcanzó el límite gratuito del escaneo por ahora. Intenta en un minuto.', 'cupo');
  if (e.kind === 'auth') return new ScanError('Tu sesión venció. Entra de nuevo para leer fotos con IA.', 'config');
  // La función no está (404), el modo local no la tiene, o algo de configuración: reintentar no sirve.
  if (e.kind === 'not_found' || e.kind === 'validation' || e.kind === 'permission') {
    return new ScanError(e.kind === 'validation' && message ? message : 'La lectura con IA no está disponible.', 'config');
  }
  return new ScanError('No se pudo escanear la foto.', 'red');
}
