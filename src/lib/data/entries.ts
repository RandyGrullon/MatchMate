import type { Filter } from '../backend/types';
import type { CompressedImage } from '../image';
import { uploadScoreboardPhoto } from '../photos';
import type { BowlingEvent, Entry, GameFrames } from '../types';
import { enqueue, invalidate, rpc, select, sentOrQueued, useLive, type Live } from './client';
import { keys, sortedKey, tags } from './keys';
import { collapse, overlayEntries, pendingOps, rememberRequirePhoto } from './pending';
import { chunks, toEntry, type EntryRow } from './rows';
import { useTopic } from './topics';
import { photoArg } from './uploads';

// ---------- Lecturas ----------

/** Participaciones (con los juegos anotados en este teléfono que todavía no llegan al servidor). */
export async function fetchEntries(lid: string, filters: Filter[]): Promise<Entry[]> {
  const rows = await select<EntryRow>({ table: 'entries', filters: [{ col: 'league_id', op: 'eq', value: lid }, ...filters] });
  return overlayEntries(rows.map(toEntry), pendingOps(lid));
}

export const useAllEntries = (lid: string | undefined): Live<Entry[]> =>
  useLive<Entry[]>(lid ? keys.allEntries(lid) : null, lid ? { kind: 'entries', lid } : null, () => fetchEntries(lid!, []), {
    initial: [],
    tags: lid ? [tags.league(lid), tags.entries(lid)] : [],
  });

/** Participaciones del evento, en vivo mientras está en pantalla. */
export function useEventEntries(lid: string | undefined, eventId: string | undefined): Live<Entry[]> {
  useTopic(lid && eventId ? `event:${eventId}` : null, lid ?? null);
  return useLive<Entry[]>(
    lid && eventId ? keys.eventEntries(eventId) : null,
    lid ? { kind: 'entries', lid, eventId } : null,
    () => fetchEntries(lid!, [{ col: 'event_id', op: 'eq', value: eventId }]),
    { initial: [], tags: lid && eventId ? [tags.league(lid), tags.entries(lid), tags.eventEntries(eventId)] : [] },
  );
}

export const usePlayerEntries = (lid: string | undefined, playerId: string | undefined): Live<Entry[]> =>
  useLive<Entry[]>(
    lid && playerId ? keys.playerEntries(lid, playerId) : null,
    lid ? { kind: 'entries', lid, playerId } : null,
    () => fetchEntries(lid!, [{ col: 'player_id', op: 'eq', value: playerId }]),
    { initial: [], tags: lid ? [tags.league(lid), tags.entries(lid)] : [] },
  );

/** Las participaciones de esos eventos (de a pedazos: las listas largas no caben en una consulta). */
export async function fetchEntriesOfEvents(lid: string, eventIds: string[]): Promise<Entry[]> {
  const parts = await Promise.all(chunks([...new Set(eventIds)]).map((ids) => fetchEntries(lid, [{ col: 'event_id', op: 'in', value: ids }])));
  return parts.flat();
}

/** Participaciones de varios eventos a la vez (posición en cada torneo, ranking de la temporada). */
export function useEntriesOfEvents(lid: string | undefined, eventIds: string[]): Live<Entry[]> {
  const ids = sortedKey(eventIds);
  return useLive<Entry[]>(
    lid && ids ? keys.entriesOfEvents(lid, eventIds) : null,
    lid ? { kind: 'entries', lid, eventIds } : null,
    () => fetchEntriesOfEvents(lid!, ids.split(',')),
    { initial: [], tags: lid ? [tags.league(lid), tags.entries(lid)] : [] },
  );
}

// ---------- Escrituras ----------

const afterEntries = (lid: string, eventId?: string) =>
  invalidate(tags.entries(lid), ...(eventId ? [tags.eventEntries(eventId), tags.event(eventId)] : []), tags.events(lid));

/** Inscribe jugadores en el evento con el promedio que tienen hoy (quien ya estaba no se toca). */
export async function addEntries(lid: string, event: Pick<BowlingEvent, 'id'>, players: { id: string; average: number }[]): Promise<number> {
  if (!players.length) return 0;
  const n = await rpc<number>('add_entries', { p_event: event.id, p_players: players.map((p) => ({ player_id: p.id, average: p.average })) });
  afterEntries(lid, event.id);
  return n;
}

type EntryPatch = Partial<Omit<Entry, 'id' | 'eventId' | 'playerId'>>;

/** Patch de la app → claves de la base para `update_entry`. */
export function entryPatch(patch: EntryPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.teamId !== undefined) out.team_id = patch.teamId;
  if (patch.average !== undefined) out.average = patch.average;
  if (patch.handicapOverride !== undefined) out.handicap_override = patch.handicapOverride;
  if (patch.scores !== undefined) out.scores = patch.scores;
  if (patch.photos !== undefined) out.photos = patch.photos;
  if (patch.frames !== undefined) out.frames = patch.frames ?? null;
  return out;
}

export async function updateEntry(lid: string, id: string, patch: EntryPatch) {
  await rpc('update_entry', { p_entry: id, p_patch: entryPatch(patch) });
  afterEntries(lid);
}

/** Varias a la vez, todo o nada. */
export async function updateEntries(lid: string, patches: { id: string; patch: EntryPatch }[]) {
  if (!patches.length) return;
  await rpc('update_entries', { p_patches: patches.map(({ id, patch }) => ({ id, patch: entryPatch(patch) })) });
  afterEntries(lid);
}

/**
 * Guarda un juego: pinos, cuadros (si se anotó tiro por tiro) y si cuenta sin foto (lo decide la base con la
 * regla de la liga). Va por la cola: se ve de una en la tabla y, sin señal, sale solo al volver.
 */
export async function saveGame(
  lid: string,
  _event: Pick<BowlingEvent, 'id' | 'games'>,
  entry: Pick<Entry, 'id'>,
  game: number,
  value: { score: number | null; frames: GameFrames | null },
  requirePhoto: boolean,
): Promise<void> {
  rememberRequirePhoto(lid, requirePhoto);
  const { done } = enqueue(
    'save_game',
    { p_entry: entry.id, p_game: game, p_score: value.score, p_frames: value.frames ?? null },
    { group: lid, collapseKey: collapse.game(entry.id, game), label: `Juego ${game + 1}` },
  );
  await sentOrQueued(done);
}

/** Saca al jugador del evento, con sus me gusta, comentarios y lo que anotaba en vivo. */
export async function removeEntry(lid: string, entry: Pick<Entry, 'id' | 'eventId'>) {
  await rpc('remove_entry', { p_entry: entry.id });
  afterEntries(lid, entry.eventId);
  invalidate(tags.social(lid), tags.live(entry.eventId));
}

// ---------- Fotos que verifican juegos (admin o anotador) ----------

export interface VerifiedWrite {
  /** Participación existente o null si hay que inscribir al jugador. */
  entry: Entry | null;
  playerId: string;
  average: number;
  /** juego (índice) -> pinos */
  values: Record<number, number>;
}

/**
 * Sube la foto y marca como verificados los juegos que se leyeron de ella (inscribe a quien falte).
 * Necesita señal (es del admin, con la foto en la mano). Devuelve el id de la foto.
 */
export async function saveVerifiedGames(lid: string, event: Pick<BowlingEvent, 'id'>, photo: CompressedImage, writes: VerifiedWrite[]): Promise<string> {
  const up = await uploadScoreboardPhoto(lid, photo);
  const id = await rpc<string>('save_verified_games', {
    p_event: event.id,
    p_photo: photoArg(up),
    p_writes: writes.map((w) => ({ player_id: w.playerId, average: w.average, values: w.values })),
  });
  afterEntries(lid, event.id);
  return id;
}
