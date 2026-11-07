/**
 * Lo que no es pantalla del buzón de sugerencias (SuggestionsPanel y SuggestionBox): el día de cada nota, lo que se
 * pregunta antes de borrar una, quién ve la caja, la nota a medio escribir, el ritmo (una por minuto) y cómo se manda
 * (si no hay señal queda en cola y sale sola). La usan la web y la app del teléfono (movil/src/components/suggestions).
 * Pruebas en suggestions.test.ts.
 */
import { MAX_SUGGESTION, SUGGESTION_PACE_S, sendSuggestion } from '../lib/data/suggestions';
import { formatDate, toIsoDate } from '../lib/format';
import { paceCheck, paceStart } from '../lib/pace';
import type { LeagueKind, Suggestion } from '../lib/types';

// ---------- Organizadores (SuggestionsPanel) ----------

/** Día de la nota: "hoy", "ayer" o la fecha (sin la hora: no ayuda a adivinar quién la escribió). */
export function noteDay(ms: number | undefined, now: Date = new Date()): string {
  if (ms == null) return 'hoy';
  const day = toIsoDate(new Date(ms));
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  return day === toIsoDate(now) ? 'hoy' : day === toIsoDate(yesterday) ? 'ayer' : formatDate(day);
}

/** Las notas sin leer (para «Marcar todas como leídas»). */
export const unreadIds = (list: readonly Pick<Suggestion, 'id' | 'read'>[]) => list.filter((s) => !s.read).map((s) => s.id);

/** El botón de cada nota: marcarla como leída o como no leída. */
export const markLabel = (read: boolean) => (read ? 'Marcar como no leída' : 'Marcar como leída');

/** ¿Borrar la sugerencia? Con la nota entre comillas (cortada a 140 letras). */
export const deleteSuggestionConfirm = (text: string) =>
  ({
    title: '¿Borrar la sugerencia?',
    message: `“${text.length > 140 ? `${text.slice(0, 140)}…` : text}”`,
    confirmText: 'Borrar',
    danger: true,
  }) as const;

export const SUGGESTION_DELETED_TEXT = 'Sugerencia borrada';

// ---------- Jugadores (SuggestionBox) ----------

/** La caja sale a quien tiene cuenta y es de la liga, pero no a quien la organiza (las notas son para ellos). */
export const showSuggestionBox = (opts: { signedIn: boolean; member: boolean; isAdmin: boolean }) => opts.signedIn && opts.member && !opts.isAdmin;

/** A quién le llega: «los organizadores de la liga» o «los organizadores del torneo». */
export const suggestionOrganizers = (kind: LeagueKind | null | undefined) => (kind === 'torneo' ? 'los organizadores del torneo' : 'los organizadores de la liga');

/** Lo escrito, cortado al máximo. */
export const clampSuggestion = (text: string) => text.slice(0, MAX_SUGGESTION);

/** El contador de abajo: «12/1000» o, lleno, el aviso de que no entra más. */
export function suggestionCounter(length: number): { full: boolean; text: string } {
  const full = length >= MAX_SUGGESTION;
  return { full, text: full ? `Llegaste al máximo (${MAX_SUGGESTION} letras): lo que sigue no entra.` : `${length}/${MAX_SUGGESTION}` };
}

/** Nota a medio escribir por liga (la misma en el inicio de la liga y en "Mis juegos"). */
const drafts = new Map<string, string>();
export const suggestionDraft = (lid: string) => drafts.get(lid) ?? '';
export function setSuggestionDraft(lid: string, text: string) {
  if (text) drafts.set(lid, text);
  else drafts.delete(lid);
}

const paceKey = (lid: string) => `${lid}:sugerencia`;

/** Si ya mandó una hace poco (o la anterior sigue en cola), el aviso; null = puede mandar. */
export function suggestionPaceProblem(lid: string, now?: number): string | null {
  const check = paceCheck(paceKey(lid), SUGGESTION_PACE_S, now);
  if (check.ok) return null;
  return check.reason === 'pendiente'
    ? 'Tu sugerencia anterior todavía se está enviando. Espera a tener señal.'
    : `Ya enviaste una hace poco. Podrás mandar otra en ${check.wait} s.`;
}

/** Sin señal la nota queda en cola y sale sola; no se espera al servidor. */
export const QUEUED_MS = 1500;

export type SuggestionOutcome = { kind: 'ok' } | { kind: 'en-cola'; sent: Promise<string> } | { kind: 'error'; error: unknown };

/**
 * Manda la nota y empieza a contar el ritmo. 'ok': llegó; 'en-cola': no contestó en `QUEUED_MS` (sin señal: sale sola
 * cuando vuelva; `sent` dice al final si se pudo); 'error': no se pudo.
 */
export async function deliverSuggestion(lid: string, uid: string, body: string, queuedMs = QUEUED_MS): Promise<SuggestionOutcome> {
  const sent = sendSuggestion(lid, uid, body);
  paceStart(paceKey(lid), sent);
  const result = await Promise.race([sent.then(() => 'ok' as const), new Promise<'en-cola'>((r) => setTimeout(() => r('en-cola'), queuedMs))]).catch(
    (e: unknown) => ({ error: e }),
  );
  if (result === 'ok') return { kind: 'ok' };
  if (result === 'en-cola') return { kind: 'en-cola', sent };
  return { kind: 'error', error: result.error };
}

export const SUGGESTION_SENT_TEXT = '¡Gracias! Tu sugerencia llegó al buzón, sin tu nombre.';
export const SUGGESTION_QUEUED_TEXT = 'Sin señal: tu sugerencia se envía sola cuando vuelva la conexión.';
export const SUGGESTION_LATE_FAIL_TEXT = 'No se pudo enviar tu sugerencia. Sigue en el buzón para que la reintentes.';

/** El error al mandar: la base la frenó por el ritmo (permiso) o no se pudo. */
export const suggestionErrorText = (e: unknown) =>
  /permission/i.test(String((e as Error | null)?.message ?? ''))
    ? 'Ya enviaste una hace poco. Espera un minuto para mandar otra.'
    : 'No se pudo enviar tu sugerencia. Inténtalo de nuevo.';
