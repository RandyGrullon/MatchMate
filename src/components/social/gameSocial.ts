/**
 * La lógica de «Me gusta», «Felicitar» y los comentarios de un juego de boliche (Social.tsx: ReactionBar y PostSocial),
 * sin React ni pantallas: la comparten la web y la app del teléfono (movil/src/components/bowling/GameSocial.tsx). Las
 * reacciones con sus nombres, quiénes reaccionaron en una línea, las respuestas rápidas, el ritmo y el envío de un
 * comentario (sin señal queda en cola) y los textos.
 */
import { COMMENT_PACE_S, addComment } from '../../lib/data/social';
import { paceCheck, paceStart } from '../../lib/pace';
import type { Entry, GameComment, Reaction, ReactionType } from '../../lib/types';

/** Las reacciones, en este orden (el ícono lo pone cada pantalla). */
export const REACTION_TYPES: readonly { type: ReactionType; label: string }[] = [
  { type: 'like', label: 'Me gusta' },
  { type: 'felicitar', label: 'Felicitar' },
];

/** Respuestas rápidas para felicitar sin escribir. */
export const QUICK_REPLIES = ['¡Felicidades! 🎉', '¡Qué juegazo! 🔥', '¡Buena serie! 💪', '¡Así se hace! 👏'] as const;

/** Comentario a medio escribir por juego (sobrevive a abrir la foto y volver). */
export const unsentComments = new Map<string, string>();

/** Sin señal, el comentario queda en cola y sale solo; no se espera la respuesta del servidor. */
export const QUEUED_MS = 1500;

/** Los textos (los mismos en la web y en el teléfono). */
export const SOCIAL_TEXT = {
  joinToast: 'Únete a la liga para felicitar y comentar.',
  queued: 'Sin señal: tu comentario se envía solo cuando vuelva la conexión.',
  failed: 'No se pudo enviar tu comentario. Inténtalo de nuevo.',
  denied: 'Espera unos segundos para comentar otra vez.',
  pending: 'Tu comentario anterior todavía se está enviando.',
  section: 'Me gusta y comentarios',
  comment: 'Comentar',
  commentLabel: 'Comentario',
  send: 'Enviar comentario',
  deleteLabel: 'Borrar comentario',
  deleteTitle: 'Borrar',
  you: 'Tú',
  now: 'ahora',
  join: 'Unirme',
  signIn: 'Entrar',
} as const;

/** «Me gusta (2)», «Felicitar»: el nombre del botón con cuántos hay. */
export const reactionLabel = (label: string, n: number): string => `${label}${n ? ` (${n})` : ''}`;

/** «Comentarios (3)». */
export const commentsLabel = (n: number): string => `Comentarios${n ? ` (${n})` : ''}`;

/** La reacción de la cuenta en ese juego (una por persona), si tiene. */
export const myReaction = (reactions: readonly Reaction[], uid: string | null | undefined): ReactionType | undefined =>
  uid ? reactions.find((r) => r.uid === uid)?.type : undefined;

/** Cuántas reacciones de ese tipo. */
export const reactionCount = (reactions: readonly Reaction[], type: ReactionType): number => reactions.filter((r) => r.type === type).length;

/** Quiénes reaccionaron: «Felicitaste», «Tú y Ana felicitaron», «A Pedro le gustó», «Te gustó»…; null si nadie. */
export function reactionSummary(reactions: readonly Reaction[], type: ReactionType, myUid: string | null | undefined): string | null {
  const list = reactions.filter((r) => r.type === type);
  const me = list.some((r) => r.uid === myUid);
  const others = list.filter((r) => r.uid !== myUid).map((r) => r.name.split(' ')[0]);
  if (!list.length) return null;
  const join = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs[0]);
  if (type === 'felicitar') {
    if (!others.length) return 'Felicitaste';
    return me ? `Tú y ${join(others)} felicitaron` : `${join(others)} ${others.length > 1 ? 'felicitaron' : 'felicitó'}`;
  }
  if (!others.length) return 'Te gustó';
  return me ? `A ti y a ${join(others)} les gustó` : `A ${join(others)} le${others.length > 1 ? 's' : ''} gustó`;
}

/** Los comentarios del más viejo al más nuevo (los que todavía no tienen hora, al final). */
export const sortedComments = (comments: readonly GameComment[]): GameComment[] =>
  [...comments].sort((a, b) => (a.createdAt?.toMillis() ?? Infinity) - (b.createdAt?.toMillis() ?? Infinity));

/** Sin comentarios todavía. */
export const noCommentsText = (isMine: boolean): string => (isMine ? 'Todavía nadie comenta tu juego.' : 'Sé el primero en comentar.');

/** Lo que dice la caja para comentar. */
export const commentPlaceholder = (isMine: boolean): string => (isMine ? 'Responde a los que te comentaron…' : 'Escribe un comentario…');

/** Sin cuenta o sin ser miembro: qué falta para felicitar y comentar. */
export const socialGateText = (signedIn: boolean): string => (signedIn ? 'Únete para felicitar y comentar.' : 'Entra para felicitar y comentar.');

/** ¿Borrar el comentario? (con su texto). */
export const deleteCommentConfirm = (text: string) => ({ title: '¿Borrar el comentario?', message: `“${text}”`, confirmText: 'Borrar', danger: true });

/** El ritmo de los comentarios cuenta por cuenta y por liga. */
const paceKey = (lid: string) => `${lid}:comentario`;

/** Si todavía no se puede comentar (el anterior sigue saliendo, o no ha pasado el tiempo), lo que se dice; si se puede, null. */
export function commentPaceText(lid: string): string | null {
  const check = paceCheck(paceKey(lid), COMMENT_PACE_S);
  if (check.ok) return null;
  return check.reason === 'pendiente' ? SOCIAL_TEXT.pending : `Espera ${check.wait} s para comentar otra vez.`;
}

/**
 * Cómo salió un comentario: `ok` (llegó), `queued` (sin señal: sale solo; `later` dice al final si se pudo) o `error`
 * (con el texto para el aviso).
 */
export type CommentResult = { kind: 'ok' } | { kind: 'queued'; later: Promise<string> } | { kind: 'error'; error: unknown; text: string };

/** Manda el comentario (con el ritmo de la liga) y espera un momento: si no llega en ese rato, quedó en cola. */
export async function sendGameComment(lid: string, entry: Pick<Entry, 'id' | 'eventId' | 'playerId'>, me: { uid: string; name: string }, body: string): Promise<CommentResult> {
  const sent = addComment(lid, entry, me, body);
  paceStart(paceKey(lid), sent);
  const result = await Promise.race([sent.then(() => 'ok' as const), new Promise<'en-cola'>((r) => setTimeout(() => r('en-cola'), QUEUED_MS))]).catch(
    (err: unknown) => err,
  );
  if (result === 'ok') return { kind: 'ok' };
  if (result === 'en-cola') return { kind: 'queued', later: sent };
  const denied = /permission/i.test(String((result as Error)?.message ?? ''));
  return { kind: 'error', error: result, text: denied ? SOCIAL_TEXT.denied : SOCIAL_TEXT.failed };
}
