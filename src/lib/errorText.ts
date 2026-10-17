/**
 * Los errores al guardar en palabras sencillas (los códigos de la base). Sin React ni pantallas: lo usan la web
 * (src/components/feedback.tsx lo reexporta) y la app del teléfono (movil/).
 */
import { BLOCKED_MESSAGE, isBlockedError } from './backend/errors';
import { asBackendError } from './db/errors';

/**
 * Errores de la base que dicen qué pasó ('invalido: temporada'…) y que se pueden explicar tal cual, venga de donde
 * venga la escritura (datos de la liga, corregir un resultado, anular un partido).
 */
const RAISED_MESSAGES: Record<string, string> = {
  'invalido: temporada':
    'Esa fecha de inicio deja fuera juegos de la temporada o se pisa con la anterior. Para empezar otra, usa Admin › Temporada.',
  'cerrado: serie': 'La serie siguiente del playoff ya empezó con ese equipo. Anula primero sus juegos y vuelve a corregir.',
  'invalido: playoff': 'Esta temporada ya tiene otro playoff en curso: bórralo antes de volver a abrir esta final.',
};

/** Mensaje para un error al guardar (los códigos de la base, en palabras sencillas). */
export function saveErrorMessage(e: unknown): string {
  const be = asBackendError(e);
  const msg = e instanceof Error ? e.message : String(e);
  if (isBlockedError(be ?? e)) return BLOCKED_MESSAGE;
  const raised = RAISED_MESSAGES[(be?.message ?? msg).trim()];
  if (raised) return raised;
  if (be?.kind === 'permission' || /permission/i.test(msg)) return 'Sin permiso para guardar. ¿Sesión de admin activa?';
  if (be?.kind === 'network') return 'Sin conexión. Intenta de nuevo cuando vuelva la señal.';
  if (be?.kind === 'auth') return 'Tu sesión venció. Entra de nuevo.';
  // El tope de ligas y torneos nuevos por cuenta ya viene en palabras (src/lib/data/leagues.ts).
  if (be?.code === 'league_quota') return be.message;
  if (be?.kind === 'rate_limited') return 'Muy seguido: espera un momento e intenta de nuevo.';
  if (be?.kind === 'not_found') return 'Ya no existe: alguien lo borró.';
  // Los errores propios de la capa de datos ya vienen en español (p. ej. un código de invitación que no sirve).
  if (be?.code === 'invalid_code') return be.message;
  return 'No se pudo guardar. Intenta de nuevo.';
}
