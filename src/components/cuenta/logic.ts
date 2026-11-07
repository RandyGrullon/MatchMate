import { MIN_PASSWORD, type AccountMode } from '../../lib/auth';
import { saveErrorMessage } from '../../lib/errorText';
import { organizedLeagueIds } from '../../lib/organize';
import type { Member } from '../../lib/types';
import { plural } from '../social/socialFormat';

/**
 * Lo que no es pantalla en Configuración (/cuenta): las líneas de las filas, los errores en palabras simples, las
 * reglas de la contraseña y de la biografía. Lo usan la web (src/pages/AccountPage.tsx y PublicProfile.tsx) y la app
 * del teléfono (movil/src/app/cuenta), así las dos dicen lo mismo.
 */

// ---------- Quién eres y tu cuenta ----------

/** Debajo de tu nombre: «@usuario · correo» (lo que haya). */
export const accountLine = (handle: string | null | undefined, email: string | null | undefined): string => [handle, email].filter(Boolean).join(' · ');

/** Debajo de «Tu usuario»: el tuyo o para qué sirve. */
export const usernameSubtitle = (handle: string | null | undefined): string => handle || 'Para que te encuentren';

/** Espera después de la última tecla antes de preguntar si el @usuario está libre. */
export const USERNAME_CHECK_MS = 350;

// ---------- Contraseña ----------

/** Cómo va la contraseña nueva: muy corta, no coinciden y si «Guardar» se puede tocar. */
export interface PasswordCheck {
  short: boolean;
  mismatch: boolean;
  canSave: boolean;
}

export function passwordCheck(password: string, password2: string): PasswordCheck {
  const short = password !== '' && password.length < MIN_PASSWORD;
  const mismatch = password2 !== '' && password !== password2;
  return { short, mismatch, canSave: !short && !mismatch && !!password2 };
}

export const PASSWORD_SHORT_HINT = `Mínimo ${MIN_PASSWORD} caracteres.`;
export const PASSWORD_MISMATCH_HINT = 'Las contraseñas no coinciden.';

/** El título de la hoja: al volver del link de «Olvidé mi contraseña», ponerla; si no, cambiarla. */
export const passwordSheetTitle = (recovering: boolean): string => (recovering ? 'Pon tu contraseña nueva' : 'Cambiar contraseña');

// ---------- Perfil público ----------

/** El error de guardar la biografía en palabras simples. */
export function bioErrorText(e: unknown): string {
  const code = e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined;
  const message = e instanceof Error ? e.message.trim() : '';
  if (code === 'palabras' || /^palabras\b/.test(message)) return 'Tu texto tiene palabras que no se permiten';
  return saveErrorMessage(e);
}

/** El error de preparar, subir o quitar la foto de perfil en palabras simples. */
export function avatarErrorText(e: unknown): string {
  const code = e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined;
  const kind = e && typeof e === 'object' ? (e as { kind?: unknown }).kind : undefined;
  if (code === 'imagen') return 'No se pudo usar esa imagen. Prueba con otra (JPG, PNG o WebP).';
  if (kind === 'rate_limited' || code === 'rate_limited') return 'Cambiaste tu foto muchas veces hoy. Prueba mañana.';
  return saveErrorMessage(e);
}

/** Debajo de «Personas bloqueadas»: cuántas, o que no hay. */
export const blockedLine = (n: number): string => (n > 0 ? plural(n, 'persona', 'personas') : 'No has bloqueado a nadie');

/** La fila «Personas bloqueadas»: mientras llega la lista (y no hay nada guardado), qué son; después, cuántas. */
export const blockedSubtitle = (loading: boolean, n: number): string => (loading && !n ? 'Las que no ven tu perfil' : blockedLine(n));

/** La biografía sin espacios de más (como la guarda la base). */
export const cleanBio = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** ¿Lo escrito es la biografía de ahora? Entonces «Guardar» solo cierra. */
export const sameBio = (value: string, current: string | null | undefined): boolean => cleanBio(value) === cleanBio(current ?? '');

// ---------- MatchMate ----------

/** «Organizar» sale a quien organiza alguna liga (dueño o admin) y al superadmin. */
export const showsOrganize = (isSuper: boolean, members: readonly Pick<Member, 'leagueId' | 'role'>[] | null | undefined): boolean =>
  isSuper || organizedLeagueIds(members).length > 0;

/** Lo que dice el lector de pantalla en «Organizar» cuando algo espera (sin nada, el título). */
export const organizeAriaLabel = (pending: number): string | undefined =>
  pending > 0 ? `Organizar: ${pending} ${pending === 1 ? 'pendiente' : 'pendientes'}` : undefined;

/** Debajo de «Mi empresa»: si estás usando la app como empresa o la invitación a registrarla. */
export const businessSubtitle = (mode: AccountMode | null | undefined): string =>
  mode === 'business' ? 'Estás usando la app como empresa' : '¿Tienes canchas? Regístralas o cambia a modo empresa';
