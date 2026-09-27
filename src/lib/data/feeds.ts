import type { Filter } from '../backend/types';
import type { BowlingEvent, Entry, GameComment, Member, Reaction, Submission, Suggestion } from '../types';
import { getUserId, select, useLive, type Live } from './client';
import { fetchEntries } from './entries';
import { fetchEvents } from './events';
import { sortedKey, tags } from './keys';
import {
  chunks,
  toComment,
  toEvent,
  toReaction,
  toSubmission,
  toSuggestion,
  type CommentRow,
  type EventRow,
  type ReactionRow,
  type RsvpRow,
  type SubmissionRow,
  type SuggestionRow,
  type TeamRow,
} from './rows';
import type { Wire } from './stamp';
import { overlayEvents, pendingOps } from './pending';
import { useTopic } from './topics';

// ---------- Perfil global: el jugador de la cuenta en cada liga ----------

export interface PlayerInLeague {
  lid: string;
  playerId: string;
  entries: Entry[];
  events: BowlingEvent[];
}

/** Una liga que no se puede leer (p. ej. lo acaban de sacar) se deja sin juegos: las demás se ven igual. */
async function orEmpty<T>(lid: string, p: Promise<T[]>): Promise<T[]> {
  try {
    return await p;
  } catch (e) {
    console.warn('[perfil global]', lid, e);
    return [];
  }
}

export async function fetchPlayerAcrossLeagues(links: { lid: string; playerId: string }[]): Promise<Wire<PlayerInLeague>[]> {
  return Promise.all(
    links.map(async ({ lid, playerId }) => {
      const [entries, events] = await Promise.all([
        orEmpty(lid, fetchEntries(lid, [{ col: 'player_id', op: 'eq', value: playerId }])),
        orEmpty(lid, fetchEvents(lid)),
      ]);
      return { lid, playerId, entries, events };
    }),
  );
}

/**
 * Las participaciones y los eventos del jugador de la cuenta en cada liga donde está vinculado
 * (para el perfil global). Solo se leen ligas de las que es miembro.
 */
export function usePlayerAcrossLeagues(links: { lid: string; playerId: string }[]): Live<PlayerInLeague[]> {
  const key = sortedKey(links.map((l) => `${l.lid}:${l.playerId}`));
  return useLive<PlayerInLeague[]>(
    key ? `across:${key}` : null,
    { kind: 'across' },
    () => fetchPlayerAcrossLeagues(key.split(',').map((k) => ({ lid: k.split(':')[0], playerId: k.split(':')[1] }))),
    { initial: [], tags: links.flatMap((l) => [tags.league(l.lid), tags.entries(l.lid), tags.events(l.lid)]) },
  );
}

// ---------- La campana: lo que pasa en cada liga de la cuenta ----------

export interface LeagueFeed {
  lid: string;
  /** Cuenta dueña de los avisos (para no avisarle de lo que hizo ella misma). */
  uid: string;
  playerId: string | null;
  isAdmin: boolean;
  /** Anotador del torneo (torneos sin liga). */
  isScorer: boolean;
  /** Eventos de ayer en adelante (lo que viene). */
  events: BowlingEvent[];
  /** Envíos del jugador de la cuenta. */
  mySubs: Submission[];
  /** Envíos por aprobar (solo si es admin de la liga). */
  pending: Submission[];
  /** Me gusta y felicitaciones a los juegos del jugador de la cuenta. */
  reactions: Reaction[];
  /** Comentarios en los juegos del jugador de la cuenta. */
  comments: GameComment[];
  /** Organizadores: notas del buzón sin leer. */
  suggestions: Suggestion[];
}

interface FeedItem {
  lid: string;
  uid: string;
  playerId: string | null;
  isAdmin: boolean;
  isScorer: boolean;
}

const MONTH_MS = 30 * 86400_000;

async function eventsWithExtras(filters: Filter[], eventIds?: string[]): Promise<Wire<BowlingEvent>[]> {
  const events = await select<EventRow>({ table: 'events', filters });
  if (!events.length) return [];
  const ids = eventIds ?? events.map((e) => e.id);
  const [teams, rsvps] = await Promise.all([
    select<TeamRow>({ table: 'teams', columns: 'id,event_id,name,sort_order,color', filters: [{ col: 'event_id', op: 'in', value: ids }] }),
    select<RsvpRow>({ table: 'event_rsvps', columns: 'event_id,player_id,going', filters: [{ col: 'event_id', op: 'in', value: ids }] }),
  ]);
  return events.map((e) => toEvent(e, teams, rsvps));
}

async function fetchFeed(it: FeedItem, fromDate: string): Promise<Wire<LeagueFeed>> {
  const byLeague = { col: 'league_id', op: 'eq' as const, value: it.lid };
  const since = new Date(Date.now() - MONTH_MS).toISOString();
  const none = Promise.resolve([] as never[]);
  const [events, mySubs, pending, reactions, comments, suggestions] = await Promise.all([
    orEmpty(it.lid, eventsWithExtras([byLeague, { col: 'date', op: 'gte', value: fromDate }])),
    it.playerId
      ? orEmpty(it.lid, select<SubmissionRow>({ table: 'submissions', filters: [byLeague, { col: 'player_id', op: 'eq', value: it.playerId }] }))
      : none,
    it.isAdmin ? orEmpty(it.lid, select<SubmissionRow>({ table: 'submissions', filters: [byLeague, { col: 'status', op: 'eq', value: 'pendiente' }] })) : none,
    // Me gusta y comentarios a tus juegos: solo del último mes (los avisos no muestran más).
    it.playerId
      ? orEmpty(
          it.lid,
          select<ReactionRow>({ table: 'reactions', filters: [byLeague, { col: 'player_id', op: 'eq', value: it.playerId }, { col: 'created_at', op: 'gte', value: since }] }),
        )
      : none,
    it.playerId
      ? orEmpty(
          it.lid,
          select<CommentRow>({ table: 'comments', filters: [byLeague, { col: 'player_id', op: 'eq', value: it.playerId }, { col: 'created_at', op: 'gte', value: since }] }),
        )
      : none,
    it.isAdmin
      ? orEmpty(it.lid, select<SuggestionRow>({ table: 'suggestions', filters: [byLeague, { col: 'read', op: 'eq', value: false }] }))
      : none,
  ]);
  const feed: Wire<LeagueFeed> = {
    ...it,
    // Con el «voy» y los juegos de más que están en la cola de este teléfono.
    events: overlayEvents(events, pendingOps(it.lid)),
    mySubs: (mySubs as SubmissionRow[]).map(toSubmission),
    pending: (pending as SubmissionRow[]).map(toSubmission),
    reactions: (reactions as ReactionRow[]).map(toReaction),
    comments: (comments as CommentRow[]).map(toComment),
    suggestions: (suggestions as SuggestionRow[]).map(toSuggestion),
  };
  // Eventos pasados que nombran los avisos: envíos revisados y reacciones o comentarios del último mes.
  const have = new Set(events.map((e) => e.id));
  const cutoff = Date.now() - MONTH_MS;
  const recent = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Date.now()) >= cutoff;
  const older = [
    ...feed.mySubs.filter((s) => s.status !== 'pendiente' && recent(s.reviewedAt ?? new Date(0).toISOString())).map((s) => s.eventId),
    ...feed.reactions.filter((r) => recent(r.createdAt)).map((r) => r.eventId),
    ...feed.comments.filter((c) => recent(c.createdAt)).map((c) => c.eventId),
  ].filter((id): id is string => !!id && !have.has(id));
  const missing = [...new Set(older)];
  if (missing.length) {
    const extra = (
      await Promise.all(chunks(missing).map((ids) => orEmpty(it.lid, eventsWithExtras([byLeague, { col: 'id', op: 'in', value: ids }], ids))))
    ).flat();
    feed.events = [...feed.events, ...extra];
  }
  return feed;
}

const itemKey = (m: Member) => `${m.leagueId}:${m.playerId ?? '-'}:${m.role === 'member' ? 'm' : 'a'}:${m.scorer ? 's' : '-'}:${m.uid}`;

const itemOf = (k: string): FeedItem => {
  const [lid, pid, role, scorer, uid] = k.split(':');
  return { lid, uid, playerId: pid === '-' ? null : pid, isAdmin: role === 'a', isScorer: scorer === 's' };
};

/** Lo de la campana de esas membresías (una lectura por liga; una liga que falla queda vacía). */
export const fetchLeagueFeeds = (memberships: Member[], fromDate: string): Promise<Wire<LeagueFeed>[]> =>
  Promise.all(memberships.map((m) => fetchFeed(itemOf(itemKey(m)), fromDate)));

/**
 * Lo que alimenta los avisos (campana): por cada liga de la cuenta, los eventos que vienen, sus envíos y, si es
 * admin, lo que falta por aprobar. Se vuelve a leer al volver a la app, cada minuto y cuando el servidor avisa
 * que revisaron un envío de la cuenta.
 */
export function useLeagueFeeds(memberships: Member[], fromDate: string): Live<LeagueFeed[]> {
  const key = sortedKey(memberships.map(itemKey));
  const uid = getUserId();
  useTopic(key && uid ? `user:${uid}` : null);
  return useLive<LeagueFeed[]>(
    key ? `feeds:${fromDate}:${key}` : null,
    { kind: 'feeds' },
    () => Promise.all(key.split(',').map((k) => fetchFeed(itemOf(k), fromDate))),
    { initial: [], tags: [tags.feeds, ...memberships.map((m) => tags.league(m.leagueId))], pollMs: 60_000, staleMs: 20_000 },
  );
}
