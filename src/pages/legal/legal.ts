/**
 * Datos de las páginas legales (privacidad y términos). BORRADOR: el texto lo tiene que revisar un abogado de
 * República Dominicana antes de abrir la app a otros clubes (Fase 0C). Al aprobarlo: poner `LEGAL_DRAFT = false`,
 * llenar el responsable y el correo, y cambiar la fecha.
 */

/** Mientras sea true, las páginas dicen arriba que es un borrador. */
export const LEGAL_DRAFT = true;

/** Fecha de la última versión ('YYYY-MM-DD'). */
export const LEGAL_UPDATED = '2026-09-29';

/**
 * Quién responde por los datos y cómo escribirle. Lo que va entre corchetes falta llenarlo (las páginas lo
 * marcan en amarillo mientras sea borrador).
 */
export const LEGAL_CONTACT = {
  responsible: '[nombre de la persona o empresa responsable]',
  email: '[correo de contacto de MatchMate]',
  place: 'Santo Domingo, República Dominicana',
} as const;

/** ¿Es un dato que falta llenar? (entre corchetes) */
export const isPlaceholder = (text: string) => /^\[.*\]$/.test(text.trim());

/** '2026-09-28' → '28 de septiembre de 2026'. */
export function legalDate(day: string = LEGAL_UPDATED): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d, 12).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Rutas de las páginas (también las usan Login, Configuración, la pantalla de 18 años y el aviso de las fotos). */
export const PRIVACY_PATH = '/privacidad';
export const TERMS_PATH = '/terminos';
/** Rutas que se pueden leer aunque falte decir «tengo 18 años o más». */
export const LEGAL_PATHS: readonly string[] = [PRIVACY_PATH, TERMS_PATH];
