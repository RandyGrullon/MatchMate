/**
 * Filtro de texto de las insignias de la liga en el teléfono (docs/insignias.md §5.7): la respuesta al instante
 * mientras se escribe. Repite las reglas de `private.badge_text_ok` (20260929000820_insignias_creador.sql) menos las
 * palabras bloqueadas, que solo sabe el servidor: él decide al guardar ('texto_bloqueado').
 *
 * Un texto no se puede usar si:
 * - tiene algo fuera de letras (con áéíóúüñ), números, espacio y . , : ; ! ¡ ? ¿ ' " & # / ( ) + - (sin emoji: así el
 *   canvas y el SVG pintan igual);
 * - parece un enlace o un correo ('http', 'www.', o '.com', '.net', '.org', '.do' al final de una palabra; la @ ya no
 *   pasa por los caracteres);
 * - parece un teléfono: 7 o más dígitos seguidos, o 3 y 4 dígitos con un espacio, punto o guion en medio;
 * - repite el mismo carácter 4 o más veces seguidas.
 * Vacío sí se puede (los campos opcionales).
 */

/** Lo que hace la base antes de revisar y guardar (`private.badge_clean`): sin espacios a los lados y uno entre palabras. */
export const cleanBadgeText = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** Largo como lo cuenta la base (`char_length`: por carácter, no por unidad de UTF-16). */
export const textLength = (s: string): number => [...s].length;

const ALLOWED = /^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ .,:;!¡?¿'"&#/()+-]+$/;
const ACCENTS: Readonly<Record<string, string>> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' };

/** Minúsculas y sin tildes (ñ → n), como `translate` en la base. */
const plain = (s: string) => s.toLowerCase().replace(/[áéíóúüñ]/g, (c) => ACCENTS[c] ?? c);

/** Por qué no se puede usar un texto: 'caracteres' (emoji, @, símbolos raros) o 'bloqueado' (enlace, teléfono o letras repetidas). */
export type BadgeTextProblem = 'caracteres' | 'bloqueado';

/** null si el texto (ya limpio o no) se puede usar en una insignia. */
export function badgeTextProblem(text: string | null | undefined): BadgeTextProblem | null {
  const v = cleanBadgeText(text);
  if (!v) return null;
  if (!ALLOWED.test(v)) return 'caracteres';
  const p = plain(v);
  if (/(http|www\.)/.test(p) || /\.(com|net|org|do)([^a-z0-9]|$)/.test(p)) return 'bloqueado';
  if (/[0-9]{7,}/.test(v) || /(^|[^0-9])[0-9]{3}[ .-]?[0-9]{4}([^0-9]|$)/.test(v)) return 'bloqueado';
  if (/(.)\1\1\1/.test(p)) return 'bloqueado';
  return null;
}

/** El aviso en palabras (nunca repite lo que se escribió). */
export const BADGE_TEXT_MESSAGE: Readonly<Record<BadgeTextProblem, string>> = {
  caracteres: 'Usa letras, números y signos simples. Sin emoji.',
  bloqueado: 'Ese texto no se puede usar.',
};

/** El aviso de un texto, o null si está bien. */
export function badgeTextError(text: string | null | undefined): string | null {
  const p = badgeTextProblem(text);
  return p ? BADGE_TEXT_MESSAGE[p] : null;
}

/** Largos de §5.7 (los mismos checks de las tablas y de las RPC). */
export const BADGE_TEXT_MAX = {
  name: 28,
  nameMin: 3,
  top: 14,
  period: 10,
  description: 140,
  note: 140,
  division: 16,
  reason: 140,
} as const;
