/**
 * Me gusta, felicitar y comentarios de un juego (gameSocial.ts, lo comparten la web y la app): quiénes reaccionaron en
 * una línea, el orden de los comentarios, los textos, el ritmo y el envío (llegó, en cola o con error). Datos de mentira.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameComment, Reaction, ReactionType } from '../../lib/types';

const addComment = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<string>>());
vi.mock('../../lib/data/social', async (orig) => ({ ...(await orig<typeof import('../../lib/data/social')>()), addComment }));

const {
  commentPaceText,
  commentPlaceholder,
  commentsLabel,
  deleteCommentConfirm,
  myReaction,
  noCommentsText,
  reactionCount,
  reactionLabel,
  reactionSummary,
  sendGameComment,
  socialGateText,
  sortedComments,
} = await import('./gameSocial');

const r = (uid: string, name: string, type: ReactionType): Reaction => ({ id: `${uid}-${type}`, entryId: 'g1', eventId: 'e1', playerId: 'p1', uid, name, type });
const at = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms), toISOString: () => new Date(ms).toISOString() });
const c = (id: string, ms: number | null): GameComment => ({ id, entryId: 'g1', eventId: 'e1', playerId: 'p1', uid: 'u2', name: 'Jugadora Dos', text: 'Hola', createdAt: ms == null ? null : at(ms) });
const ENTRY = { id: 'g1', eventId: 'e1', playerId: 'p1' };
const ME = { uid: 'u1', name: 'Jugador Uno' };

afterEach(() => {
  vi.useRealTimers();
  addComment.mockReset();
});

describe('me gusta y felicitar', () => {
  it('quiénes reaccionaron, en una línea', () => {
    const list = [r('u1', 'Jugador Uno', 'felicitar'), r('u2', 'Jugadora Dos Pérez', 'felicitar'), r('u3', 'Jugador Tres', 'like')];
    expect(reactionSummary(list, 'felicitar', 'u1')).toBe('Tú y Jugadora felicitaron');
    expect(reactionSummary(list, 'felicitar', 'u9')).toBe('Jugador y Jugadora felicitaron');
    expect(reactionSummary([r('u2', 'Ana', 'felicitar')], 'felicitar', 'u1')).toBe('Ana felicitó');
    expect(reactionSummary([r('u1', 'Jugador Uno', 'felicitar')], 'felicitar', 'u1')).toBe('Felicitaste');
    expect(reactionSummary(list, 'like', 'u1')).toBe('A Jugador le gustó');
    expect(reactionSummary([r('u1', 'Yo', 'like'), r('u2', 'Ana', 'like'), r('u3', 'Luis', 'like')], 'like', 'u1')).toBe('A ti y a Ana y Luis les gustó');
    expect(reactionSummary([r('u2', 'Ana', 'like'), r('u3', 'Luis', 'like')], 'like', null)).toBe('A Ana y Luis les gustó');
    expect(reactionSummary([r('u1', 'Yo', 'like')], 'like', 'u1')).toBe('Te gustó');
    expect(reactionSummary(list, 'like', undefined)).toBe('A Jugador le gustó');
    expect(reactionSummary([], 'like', 'u1')).toBeNull();
  });

  it('la de la cuenta, cuántas hay y los nombres de los botones', () => {
    const list = [r('u1', 'Jugador Uno', 'like'), r('u2', 'Jugadora Dos', 'like')];
    expect(myReaction(list, 'u1')).toBe('like');
    expect(myReaction(list, null)).toBeUndefined();
    expect(reactionCount(list, 'like')).toBe(2);
    expect(reactionLabel('Me gusta', 2)).toBe('Me gusta (2)');
    expect(reactionLabel('Felicitar', 0)).toBe('Felicitar');
    expect(commentsLabel(3)).toBe('Comentarios (3)');
    expect(commentsLabel(0)).toBe('Comentarios');
  });
});

describe('comentarios', () => {
  it('del más viejo al más nuevo (sin hora, al final) y los textos', () => {
    expect(sortedComments([c('b', 20), c('sin', null), c('a', 10)]).map((x) => x.id)).toEqual(['a', 'b', 'sin']);
    expect(noCommentsText(true)).toBe('Todavía nadie comenta tu juego.');
    expect(noCommentsText(false)).toBe('Sé el primero en comentar.');
    expect(commentPlaceholder(true)).toBe('Responde a los que te comentaron…');
    expect(commentPlaceholder(false)).toBe('Escribe un comentario…');
    expect(socialGateText(false)).toBe('Entra para felicitar y comentar.');
    expect(socialGateText(true)).toBe('Únete para felicitar y comentar.');
    expect(deleteCommentConfirm('Hola')).toEqual({ title: '¿Borrar el comentario?', message: '“Hola”', confirmText: 'Borrar', danger: true });
  });

  it('llega: ok, y el siguiente espera su turno', async () => {
    addComment.mockResolvedValue('c1');
    expect(commentPaceText('L-ok')).toBeNull();
    expect(await sendGameComment('L-ok', ENTRY, ME, 'Hola')).toEqual({ kind: 'ok' });
    expect(addComment).toHaveBeenCalledWith('L-ok', ENTRY, ME, 'Hola');
    expect(commentPaceText('L-ok')).toMatch(/^Espera \d s para comentar otra vez\.$/);
  });

  it('sin señal: queda en cola y no deja mandar otro mientras sale', async () => {
    vi.useFakeTimers();
    let done: (id: string) => void = () => undefined;
    addComment.mockReturnValue(new Promise<string>((res) => (done = res)));
    const sending = sendGameComment('L-cola', ENTRY, ME, 'Hola');
    await vi.advanceTimersByTimeAsync(1500);
    const result = await sending;
    expect(result.kind).toBe('queued');
    expect(commentPaceText('L-cola')).toBe('Tu comentario anterior todavía se está enviando.');
    done('c2');
    if (result.kind === 'queued') expect(await result.later).toBe('c2');
  });

  it('con error: el texto del aviso (el ritmo de la base dice que espere)', async () => {
    addComment.mockRejectedValueOnce(new Error('permission denied'));
    expect(await sendGameComment('L-err1', ENTRY, ME, 'Hola')).toMatchObject({ kind: 'error', text: 'Espera unos segundos para comentar otra vez.' });
    addComment.mockRejectedValueOnce(new Error('caído'));
    expect(await sendGameComment('L-err2', ENTRY, ME, 'Hola')).toMatchObject({ kind: 'error', text: 'No se pudo enviar tu comentario. Inténtalo de nuevo.' });
  });
});
