import type { OutboxItem } from '../db/outbox';
import type { BowlingEvent, Entry, GameFrames, League, LiveScore, Submission } from '../types';
import { NO_PHOTO } from '../types';
import { currentOutbox, invalidate, onOutbox, queryClient, updateCached, type QueryDesc } from './client';
import { keys, tags } from './keys';
import { liveId } from './rows';
import type { Wire } from './stamp';

/**
 * Lo de cancha que está en la cola y todavía no llega al servidor se muestra igual (como la caché de Firestore):
 * - al encolar, se cambia la caché de una vez (cambio optimista);
 * - cada lectura que llega del servidor se muestra con lo pendiente encima;
 * - al confirmarse (o rechazarse) se vuelve a leer lo que tocó.
 *
 * Todo sale de la operación guardada (sirve también después de recargar): la RPC y sus argumentos, el grupo
 * (= la liga) y la clave de colapso, que lleva los ids que la RPC no recibe (p. ej. el jugador del en vivo).
 */

export const collapse = {
  game: (entryId: string, game: number) => `game:${entryId}:${game}`,
  live: (eventId: string, playerId: string) => `live:${eventId}:${playerId}`,
  rsvp: (eventId: string, playerId: string) => `rsvp:${eventId}:${playerId}`,
};

/** Si la liga exige foto (para la marca optimista de un juego anotado). Lo dice quien anota; si no, la caché. */
const requirePhotoOf = new Map<string, boolean>();
export const rememberRequirePhoto = (lid: string, value: boolean) => void requirePhotoOf.set(lid, value);

function requirePhoto(lid: string): boolean | null {
  const known = requirePhotoOf.get(lid);
  if (known != null) return known;
  const league = queryClient.getQueryData<Wire<League> | null>(keys.league(lid));
  return league ? league.requirePhoto : null;
}

/** Lo pendiente de la cuenta en esa liga (en orden). */
export function pendingOps(lid?: string): OutboxItem[] {
  return currentOutbox()?.listPending(lid) ?? [];
}

const str = (v: unknown) => (typeof v === 'string' ? v : null);

// ---------- Participaciones: save_game ----------

export function overlayEntries(list: Entry[], ops: readonly OutboxItem[]): Entry[] {
  const games = ops.filter((o) => o.fn === 'save_game');
  if (!games.length) return list;
  let changed = false;
  const out = list.map((entry) => {
    const mine = games.filter((o) => o.args.p_entry === entry.id);
    if (!mine.length) return entry;
    changed = true;
    const scores = [...entry.scores];
    const photos = [...entry.photos];
    const frames = { ...(entry.frames ?? {}) };
    for (const o of mine) {
      const game = Number(o.args.p_game);
      const score = (o.args.p_score ?? null) as number | null;
      while (scores.length <= game) scores.push(null);
      while (photos.length <= game) photos.push(null);
      scores[game] = score;
      // Como la base: sin foto obligatoria cuenta de una; con foto queda en borrador.
      photos[game] = score != null && requirePhoto(o.group) === false ? NO_PHOTO : null;
      const f = (o.args.p_frames ?? null) as GameFrames | null;
      if (f) frames[String(game)] = f;
      else delete frames[String(game)];
    }
    const next: Entry = { ...entry, scores, photos };
    if (Object.keys(frames).length) next.frames = frames;
    else delete next.frames;
    return next;
  });
  return changed ? out : list;
}

// ---------- En vivo: publish_live ----------

export function overlayLive(list: Wire<LiveScore>[], eventId: string, ops: readonly OutboxItem[]): Wire<LiveScore>[] {
  let out = list;
  for (const o of ops) {
    if (o.fn === 'submit_games' && o.args.p_event === eventId) {
      // Lo enviado sale del en vivo (la base lo quita en el mismo envío).
      const id = liveId(eventId, String(o.args.p_player));
      if (out.some((l) => l.id === id)) out = out.filter((l) => l.id !== id);
      continue;
    }
    if (o.fn !== 'publish_live' || o.args.p_event !== eventId) continue;
    const playerId = o.collapseKey?.split(':')[2];
    if (!playerId) continue;
    const id = liveId(eventId, playerId);
    const scores = [...((o.args.p_scores as (number | null)[] | null) ?? [])];
    while (scores.length && scores[scores.length - 1] == null) scores.pop();
    const rest = out.filter((l) => l.id !== id);
    out = scores.length ? [...rest, { id, eventId, playerId, scores, updatedAt: new Date(o.createdAt).toISOString() }] : rest;
  }
  return out;
}

// ---------- Eventos: set_rsvp y add_practice_game ----------

export function overlayEvent<E extends Wire<BowlingEvent> | null>(event: E, ops: readonly OutboxItem[]): E {
  if (!event) return event;
  let out = event as Wire<BowlingEvent>;
  for (const o of ops) {
    if (o.args.p_event !== out.id) continue;
    if (o.fn === 'set_rsvp') {
      const playerId = str(o.args.p_player) ?? o.collapseKey?.split(':')[2];
      if (!playerId) continue;
      const going = o.args.p_going === true;
      if (!!out.rsvp?.[playerId] === going) continue;
      const rsvp = { ...(out.rsvp ?? {}) };
      if (going) rsvp[playerId] = true;
      else delete rsvp[playerId];
      out = { ...out, rsvp };
    } else if (o.fn === 'add_practice_game') {
      const expected = typeof o.args.p_expected === 'number' ? o.args.p_expected : out.games;
      // Como la base: si otro ya lo sumó (hay más de los que veía el teléfono), no suma otra vez.
      if (out.games <= expected && out.games < 10) out = { ...out, games: expected + 1 };
    }
  }
  return out as E;
}

export const overlayEvents = (list: Wire<BowlingEvent>[], ops: readonly OutboxItem[]) => {
  if (!ops.some((o) => o.fn === 'set_rsvp' || o.fn === 'add_practice_game')) return list;
  let changed = false;
  const out = list.map((e) => {
    const next = overlayEvent(e, ops);
    if (next !== e) changed = true;
    return next;
  });
  return changed ? out : list;
};

// ---------- Envíos: submit_games ----------

/** El envío tal como se verá cuando llegue (pendiente). */
function pendingSubmission(o: OutboxItem): Wire<Submission> {
  const a = o.args;
  return {
    id: String(a.p_id),
    playerId: String(a.p_player),
    eventId: str(a.p_event),
    date: str(a.p_date),
    scores: (a.p_scores as (number | null)[]) ?? [],
    scanned: (a.p_scanned as (number | null)[] | null) ?? null,
    scannedName: null,
    frames: (a.p_frames as Submission['frames']) ?? null,
    // La foto todavía no se ha subido.
    photoId: null,
    status: 'pendiente',
    note: null,
    createdAt: new Date(o.createdAt).toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    createdBy: o.userId,
  };
}

const subMatches = (o: OutboxItem, desc: QueryDesc) =>
  o.fn === 'submit_games' &&
  (desc.lid == null || desc.lid === o.args.p_league) &&
  (desc.eventId == null || desc.eventId === o.args.p_event) &&
  (desc.playerId == null || desc.playerId === o.args.p_player) &&
  (desc.status == null || desc.status === 'pendiente');

export function overlaySubs(list: Wire<Submission>[], desc: QueryDesc, ops: readonly OutboxItem[]): Wire<Submission>[] {
  const add = ops.filter((o) => subMatches(o, desc) && !list.some((s) => s.id === o.args.p_id));
  return add.length ? [...list, ...add.map(pendingSubmission)] : list;
}

// ---------- Al encolar y al confirmar ----------

function applyOptimistic(item: OutboxItem) {
  const ops = [item];
  switch (item.fn) {
    case 'save_game':
      updateCached<Entry[]>('entries', (list, d) => (d.lid === item.group || d.lid == null ? overlayEntries(list, ops) : list));
      break;
    case 'publish_live':
      updateCached<Wire<LiveScore>[]>('live', (list, d) => (d.eventId === item.args.p_event ? overlayLive(list, String(item.args.p_event), ops) : list));
      break;
    case 'set_rsvp':
    case 'add_practice_game':
      updateCached<Wire<BowlingEvent>[]>('events', (list, d) => (d.lid === item.group ? overlayEvents(list, ops) : list));
      updateCached<Wire<BowlingEvent> | null>('event', (e, d) => (d.id === item.args.p_event ? overlayEvent(e, ops) : e));
      // La campana y el calendario de la semana también muestran el «voy».
      updateCached<{ lid: string; events: Wire<BowlingEvent>[] }[]>('feeds', (feeds) => {
        let changed = false;
        const out = feeds.map((f) => {
          if (f.lid !== item.group) return f;
          const events = overlayEvents(f.events, ops);
          if (events === f.events) return f;
          changed = true;
          return { ...f, events };
        });
        return changed ? out : feeds;
      });
      break;
    case 'submit_games':
      updateCached<Wire<Submission>[]>('subs', (list, d) => overlaySubs(list, d, ops));
      if (item.args.p_event) {
        updateCached<Wire<LiveScore>[]>('live', (list, d) => (d.eventId === item.args.p_event ? overlayLive(list, String(item.args.p_event), ops) : list));
      }
      break;
  }
}

/** Lo que se vuelve a leer cuando el servidor confirma (o rechaza) una operación de la cola. */
export function tagsForOp(item: OutboxItem): string[] {
  const lid = item.group;
  const eventId = str(item.args.p_event);
  switch (item.fn) {
    case 'save_game':
      return [tags.entries(lid)];
    case 'publish_live':
      return eventId ? [tags.live(eventId)] : [];
    case 'set_rsvp':
    case 'add_practice_game':
      return [tags.events(lid), ...(eventId ? [tags.event(eventId)] : []), tags.feeds];
    case 'submit_games':
      return [tags.subs(lid), tags.feeds, ...(eventId ? [tags.live(eventId), tags.eventSubs(eventId)] : [])];
    // Partidos: matches.ts invalida el partido y sus listas al terminar; recargar la liga entera en cada
    // publicación de la cancha sería bajar todo en cada hito.
    case 'publish_match':
    case 'finish_match':
    case 'confirm_result':
    case 'dispute_result':
    case 'suspend_match':
    case 'set_match_players':
      return [];
    // Juegos sueltos: no son de ninguna liga (el grupo es 'solo'); solo.ts vuelve a leer lo suyo.
    case 'save_solo_session':
      return [];
    default:
      return [tags.league(lid)];
  }
}

onOutbox({
  enqueue: applyOptimistic,
  settled: (item) => invalidate(...tagsForOp(item)),
});
