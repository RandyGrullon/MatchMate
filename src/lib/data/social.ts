import { uuidv7 } from '../db/ids';
import type { Entry, GameComment, Reaction, ReactionType } from '../types';
import { invalidate, rpc, select, updateCached, useLive, type Live } from './client';
import { keys, sortedKey, tags } from './keys';
import { chunks, toComment, toReaction, type CommentRow, type ReactionRow } from './rows';
import { nowIso, type Wire } from './stamp';

// ---------- Me gusta, felicitar y comentarios en los juegos ----------

async function ofEvents<R, T>(table: string, lid: string, eventIds: string[], map: (r: R) => T): Promise<T[]> {
  const parts = await Promise.all(
    chunks([...new Set(eventIds)]).map((ids) =>
      select<R>({
        table,
        filters: [
          { col: 'league_id', op: 'eq', value: lid },
          { col: 'event_id', op: 'in', value: ids },
        ],
        order: [{ col: 'created_at' }],
      }),
    ),
  );
  return parts.flat().map(map);
}

export const fetchReactionsOfEvents = (lid: string, eventIds: string[]) => ofEvents<ReactionRow, Wire<Reaction>>('reactions', lid, eventIds, toReaction);
export const fetchCommentsOfEvents = (lid: string, eventIds: string[]) => ofEvents<CommentRow, Wire<GameComment>>('comments', lid, eventIds, toComment);

/** Me gusta y felicitaciones de los juegos de esos eventos. */
export function useReactionsOfEvents(lid: string | undefined, eventIds: string[]): Live<Reaction[]> {
  const ids = sortedKey(eventIds);
  return useLive<Reaction[]>(
    lid && ids ? keys.reactionsOfEvents(lid, eventIds) : null,
    lid ? { kind: 'reactions', lid, eventIds } : null,
    () => fetchReactionsOfEvents(lid!, ids.split(',')),
    { initial: [], tags: lid ? [tags.league(lid), tags.social(lid)] : [] },
  );
}

/** Comentarios de los juegos de esos eventos. */
export function useCommentsOfEvents(lid: string | undefined, eventIds: string[]): Live<GameComment[]> {
  const ids = sortedKey(eventIds);
  return useLive<GameComment[]>(
    lid && ids ? keys.commentsOfEvents(lid, eventIds) : null,
    lid ? { kind: 'comments', lid, eventIds } : null,
    () => fetchCommentsOfEvents(lid!, ids.split(',')),
    { initial: [], tags: lid ? [tags.league(lid), tags.social(lid)] : [] },
  );
}

type SocialTarget = Pick<Entry, 'id' | 'eventId' | 'playerId'>;

/** Cambio optimista en las listas de ese evento (como se veía con Firestore); si falla, se vuelve a leer. */
function patchLists<T extends { entryId: string }>(kind: 'reactions' | 'comments', lid: string, eventId: string, fn: (list: Wire<T>[]) => Wire<T>[]) {
  updateCached<Wire<T>[]>(kind, (list, d) => (d.lid === lid && d.eventIds?.includes(eventId) ? fn(list) : list));
}

async function social<T>(lid: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } finally {
    invalidate(tags.social(lid), tags.feeds);
  }
}

/** Me gusta o felicitar el juego de alguien (una reacción por persona; null la quita). */
export async function setReaction(lid: string, entry: SocialTarget, user: { uid: string; name: string }, type: ReactionType | null) {
  patchLists<Reaction>('reactions', lid, entry.eventId, (list) => {
    const rest = list.filter((r) => !(r.entryId === entry.id && r.uid === user.uid));
    if (!type) return rest;
    const r: Wire<Reaction> = { id: `local:${entry.id}:${user.uid}`, entryId: entry.id, eventId: entry.eventId, playerId: entry.playerId, uid: user.uid, name: user.name, type, createdAt: nowIso() };
    return [...rest, r];
  });
  await social(lid, () => rpc('set_reaction', { p_entry: entry.id, p_type: type }));
}

export const MAX_COMMENT = 500;
/** Segundos entre dos comentarios de la misma persona (la base lo exige). */
export const COMMENT_PACE_S = 3;

/** Comenta el juego de alguien (la base pone el ritmo: nada de spam). */
export async function addComment(lid: string, entry: SocialTarget, user: { uid: string; name: string }, text: string): Promise<string> {
  const id = uuidv7();
  const clean = text.trim().slice(0, MAX_COMMENT);
  patchLists<GameComment>('comments', lid, entry.eventId, (list) => [
    ...list,
    { id, entryId: entry.id, eventId: entry.eventId, playerId: entry.playerId, uid: user.uid, name: user.name, text: clean, createdAt: nowIso() },
  ]);
  return social(lid, () => rpc<string>('add_comment', { p_entry: entry.id, p_text: clean, p_id: id }));
}

export async function deleteComment(lid: string, id: string) {
  updateCached<Wire<GameComment>[]>('comments', (list, d) => (d.lid === lid && list.some((c) => c.id === id) ? list.filter((c) => c.id !== id) : list));
  await social(lid, () => rpc<boolean>('delete_comment', { p_comment: id }));
}
