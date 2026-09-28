import { SPORT_FAMILY, type Side, type SportFamily } from '../../sports/types';
import type { Filter, SelectQuery } from '../backend/types';
import { toIsoDate } from '../format';
import type { League, Member } from '../types';
import { rpc, select, useLive, type Live } from './client';
import { sortedKey, tags } from './keys';
import {
  MATCH_LIST_COLUMNS,
  matchTags,
  overlayMatches,
  toMatch,
  type Match,
  type MatchHistoryItem,
  type MatchRow,
  type MatchSideRow,
  type MatchStatus,
} from './matches';
import { pendingOps } from './pending';
import { chunks } from './rows';
import type { Wire } from './stamp';

/**
 * Lo que la campana necesita de los partidos (raqueta y equipos) de la cuenta, en todas sus ligas. Todo sale de
 * lecturas que ya existen (la RLS decide qué filas), sin RPC nuevas:
 *
 * - mis partidos que pueden dar un aviso (de `my_matches`: los que cambiaron en los últimos 14 días y los
 *   programados de hoy y mañana) con mi lado, si puedo confirmar por mi lado (raqueta: cualquiera del lado;
 *   equipos: el capitán o el delegado, como en la base) y el último cambio de hora, de cancha o aplazamiento que
 *   hizo otra cuenta (del historial de los programados o aplazados: el historial no se baja con las listas);
 * - los reclamos por resolver de las ligas donde es organizador;
 * - los retos de la escalera de mis partidos «Reto»;
 * - las noches de puntos de hoy y ayer (americano, mexicano, round robin): la última ronda publicada y quién
 *   descansa.
 *
 * Los textos los arma `buildMatchNotices` (src/lib/notifications.ts). Una cuenta que solo juega boliche, golf o
 * natación no lee nada de esto.
 */

// ---------- Tipos ----------

export type ScheduleChangeKind = 'schedule' | 'reschedule' | 'postpone';

/** Último cambio de hora, de cancha o aplazamiento de un partido (del historial). Horas en ISO. */
export interface ScheduleChange {
  a: ScheduleChangeKind;
  /** Cuándo se hizo el cambio. */
  at: string;
  fromAt: string | null;
  toAt: string | null;
  fromCourt: string | null;
  toCourt: string | null;
  note: string | null;
}

/** Un partido mío para la campana (lados sin jugadores). */
export interface NoticeMatch extends Match {
  /** Puede confirmar o reclamar por su lado: raqueta, cualquiera del lado; equipos, el capitán o el delegado. */
  canAnswer: boolean;
  /** Último cambio de hora, de cancha o aplazamiento que hizo otra cuenta; null si no hay o lo hizo la cuenta. */
  change: ScheduleChange | null;
}

/** Reto de la escalera de uno de mis partidos (lado 1 = retador, lado 2 = retado). Horas en ISO. */
export interface ChallengeNotice {
  id: string;
  leagueId: string;
  eventId: string;
  matchId: string;
  status: 'pending' | 'accepted' | 'played' | 'walkover' | 'cancelled';
  acceptBy: string;
  playBy: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  /** Cuándo se creó el reto. */
  sentAt: string;
  challengerPos: number | null;
  challengedPos: number | null;
}

/** Noche de puntos (americano, mexicano, round robin) de hoy o de ayer en una de mis ligas. */
export interface NightNotice {
  eventId: string;
  leagueId: string;
  type: string;
  name: string;
  date: string;
  /** Última ronda publicada (0 = ninguna todavía). */
  round: number;
  /** Jugadores que descansan en esa ronda. */
  rests: string[];
  /** Último cambio del evento (al publicar la ronda), ISO del servidor. */
  changedAt: string;
}

export interface MatchNoticeFeed {
  uid: string;
  /** Mis partidos recientes y abiertos, con mi lado. */
  mine: NoticeMatch[];
  /** Reclamos por resolver de las ligas donde la cuenta es organizadora (con lados, sin jugadores). */
  disputes: Match[];
  challenges: ChallengeNotice[];
  nights: NightNotice[];
  /** Jugador de la cuenta en cada liga de partidos. */
  players: Record<string, string>;
  /** Ligas de partidos donde la cuenta es dueña o admin. */
  adminLeagues: string[];
}

/** Una liga de partidos de la cuenta: lo que hace falta para leer sus avisos. */
export interface MatchLeagueItem {
  lid: string;
  playerId: string | null;
  isAdmin: boolean;
  family: 'racket' | 'team';
  /** Tiene noches de puntos (pádel y pickleball). */
  nights: boolean;
}

// ---------- Qué ligas ----------

const NIGHT_SPORTS = new Set(['padel', 'pickleball']);
const NIGHT_TYPES = ['americano', 'mexicano', 'noche'];
/** Desde cuándo se miran los partidos (además de los abiertos): lo que la campana todavía muestra. */
export const MATCH_NOTICE_WINDOW_MS = 14 * 86400_000;
/** Un partido programado se sigue mirando hasta unas horas después de su hora (el aviso «Partido hoy»). */
const TODAY_WINDOW_MS = 3 * 3600_000;

const familyOf = (sport: string | null | undefined): SportFamily | null =>
  (SPORT_FAMILY as Record<string, SportFamily | undefined>)[sport || 'bowling'] ?? null;

/** Las ligas de partidos (raqueta y equipos) de esas membresías. Las demás no leen nada. */
export function matchLeagueItems(memberships: readonly Member[], leagues: readonly Pick<League, 'id' | 'sport'>[]): MatchLeagueItem[] {
  const sportOf = new Map(leagues.map((l) => [l.id, l.sport ?? 'bowling'] as const));
  const out: MatchLeagueItem[] = [];
  for (const m of memberships) {
    const sport = sportOf.get(m.leagueId);
    const family = familyOf(sport);
    if (!sport || (family !== 'racket' && family !== 'team')) continue;
    out.push({ lid: m.leagueId, playerId: m.playerId, isAdmin: m.role !== 'member', family, nights: NIGHT_SPORTS.has(sport) });
  }
  return out;
}

const itemKey = (i: MatchLeagueItem) => `${i.lid}:${i.playerId ?? '-'}:${i.isAdmin ? 'a' : 'm'}:${i.family === 'team' ? 't' : 'r'}:${i.nights ? 'n' : '-'}`;

const itemOf = (k: string): MatchLeagueItem => {
  const [lid, pid, role, fam, nights] = k.split(':');
  return { lid, playerId: pid === '-' ? null : pid, isAdmin: role === 'a', family: fam === 't' ? 'team' : 'racket', nights: nights === 'n' };
};

// ---------- Del historial ----------

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const place = (v: unknown): { at: string | null; court: string | null } =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? { at: str((v as Record<string, unknown>).at), court: typeof (v as Record<string, unknown>).court === 'string' ? ((v as Record<string, unknown>).court as string) : null }
    : { at: null, court: null };

/**
 * El último cambio de hora, de cancha o aplazamiento (el historial va del más viejo al más nuevo). null si no hay o
 * si el último lo hizo la misma cuenta (lo sabe: no es aviso). Un cambio que no cambió nada tampoco cuenta.
 */
export function lastScheduleChange(history: readonly MatchHistoryItem[] | null | undefined, uid: string): ScheduleChange | null {
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (!h || (h.a !== 'schedule' && h.a !== 'reschedule' && h.a !== 'postpone')) continue;
    const at = str(h.at);
    if (!at || h.by === uid) return null;
    const from = place(h.from);
    const to = place(h.to);
    if (h.a !== 'postpone' && from.at === to.at && (from.court ?? '') === (to.court ?? '')) return null;
    return {
      a: h.a,
      at,
      fromAt: from.at,
      toAt: to.at,
      fromCourt: from.court,
      toCourt: to.court,
      note: typeof h.note === 'string' && h.note.trim() ? h.note.trim() : null,
    };
  }
  return null;
}

// ---------- Lectura ----------

interface MineRow {
  match_id: string;
  league_id: string;
  side: number;
}

interface RoleRow {
  team_id: string;
  player_id: string;
  role: string;
}

interface ChallengeRow {
  id: string;
  league_id: string;
  event_id: string;
  match_id: string | null;
  status: string;
  accept_by: string;
  play_by: string;
  accepted_at: string | null;
  accepted_by: string | null;
  created_at: string;
  challenger_pos: number | null;
  challenged_pos: number | null;
}

interface NightRow {
  id: string;
  league_id: string;
  type: string;
  name: string | null;
  date: string;
  config: Record<string, unknown> | null;
  updated_at: string;
}

const CHALLENGE_COLUMNS = 'id,league_id,event_id,match_id,status,accept_by,play_by,accepted_at,accepted_by,created_at,challenger_pos,challenged_pos';
const OPEN_FOR_CHANGES: readonly MatchStatus[] = ['scheduled', 'postponed'];
const CHALLENGE_STATUSES = new Set(['pending', 'accepted', 'played', 'walkover', 'cancelled']);

const iso = (v: unknown): string | null => (typeof v === 'string' && v ? v : v instanceof Date ? v.toISOString() : null);
const asSide = (v: unknown): Side | null => (v === 1 || v === 2 ? v : null);

/** Lo que no es lo principal no tumba la campana: si falla, queda vacío. */
async function soft<T>(what: string, p: Promise<T[]>): Promise<T[]> {
  try {
    return await p;
  } catch (e) {
    console.warn('[avisos de partidos]', what, e);
    return [];
  }
}

async function inChunks<T>(ids: readonly string[], read: (part: string[]) => Promise<T[]>): Promise<T[]> {
  if (!ids.length) return [];
  return (await Promise.all(chunks([...new Set(ids)]).map(read))).flat();
}

const byIds = (col: string, part: string[]): Filter => ({ col, op: 'in', value: part });

// ---------- Solo lo que cambió ----------

/** Un partido leído: su versión, la fila con sus lados y (programados y aplazados) su historial. */
interface Seen {
  version: number;
  match: Wire<Match>;
  history: MatchHistoryItem[] | null;
}

/**
 * Última lectura de cada partido de la campana. Se lee cada minuto: primero `id, version` y después, completos,
 * solo los que cambiaron (con sus lados y, si están programados o aplazados, su historial). La versión sube con
 * cada cambio de la fila y de sus lados, así que lo guardado sirve para cualquier cuenta que vea el partido (la
 * lista de `id, version` la decide la RLS de la cuenta que lee).
 */
const seen = new Map<string, Seen>();

/** Solo pruebas: olvida las lecturas anteriores. */
export function resetMatchNoticesForTests() {
  seen.clear();
}

type Query = Pick<SelectQuery, 'filters' | 'order' | 'limit'>;

/** Los partidos de esas consultas (sin repetir), bajando completos solo los nuevos o cambiados. */
async function matchesOf(queries: readonly Query[]): Promise<Seen[]> {
  const versions = (await Promise.all(queries.map((q) => select<{ id: string; version: number }>({ table: 'matches', columns: 'id,version', ...q })))).flat();
  const wanted = new Map(versions.map((v) => [v.id, v.version] as const));
  const stale = [...wanted].filter(([id, v]) => seen.get(id)?.version !== v).map(([id]) => id);
  if (stale.length) {
    const rows = await inChunks(stale, (part) => select<MatchRow>({ table: 'matches', columns: MATCH_LIST_COLUMNS, filters: [byIds('id', part)] }));
    const open = rows.filter((r) => OPEN_FOR_CHANGES.includes(r.status)).map((r) => r.id);
    const [sides, histories] = await Promise.all([
      inChunks(stale, (part) => select<MatchSideRow>({ table: 'match_sides', columns: 'match_id,side,team_id,label,seed', filters: [byIds('match_id', part)] })),
      // Si el historial no llega, esos partidos no se guardan: se vuelven a pedir la próxima vez.
      inChunks(open, (part) => select<{ id: string; history: MatchHistoryItem[] | null }>({ table: 'matches', columns: 'id,history', filters: [byIds('id', part)] })).catch(
        (e: unknown) => {
          console.warn('[avisos de partidos] historial', e);
          return null;
        },
      ),
    ]);
    const historyById = new Map((histories ?? []).map((h) => [h.id, Array.isArray(h.history) ? h.history : null] as const));
    for (const r of rows) {
      const isOpen = OPEN_FOR_CHANGES.includes(r.status);
      if (isOpen && !histories) continue;
      seen.set(r.id, { version: r.version, match: toMatch(r, sides), history: isOpen ? (historyById.get(r.id) ?? null) : null });
    }
  }
  const out: Seen[] = [];
  for (const [id, v] of wanted) {
    const s = seen.get(id);
    if (s && s.version === v) out.push(s);
  }
  // Que la memoria no crezca sin fin: pasado un tope, se queda solo lo de esta lectura.
  if (seen.size > 2000) for (const id of [...seen.keys()]) if (!wanted.has(id)) seen.delete(id);
  return out;
}

/**
 * Lee lo de la campana de esas ligas de partidos. `now` en milisegundos (para probarlo). De mis partidos solo baja
 * los que pueden dar un aviso: los que cambiaron en los últimos 14 días (resultados, reclamos, cambios de hora,
 * retos, rondas) y los programados de hoy y mañana. Si falla la lectura de mis partidos, falla todo (la caché
 * conserva lo anterior); lo demás, si falla, queda vacío.
 */
export async function fetchMatchNotices(uid: string, items: readonly MatchLeagueItem[], now: number = Date.now()): Promise<Wire<MatchNoticeFeed>> {
  const lids = new Set(items.map((i) => i.lid));
  const adminLeagues = [...new Set(items.filter((i) => i.isAdmin).map((i) => i.lid))];
  const nightLeagues = [...new Set(items.filter((i) => i.nights).map((i) => i.lid))];
  const teamPlayers = items.filter((i) => i.family === 'team' && i.playerId).map((i) => i.playerId!);
  const players: Record<string, string> = {};
  for (const i of items) if (i.playerId) players[i.lid] = i.playerId;
  const since = new Date(now - MATCH_NOTICE_WINDOW_MS).toISOString();
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const [mineRows, roles, nightRows] = await Promise.all([
    rpc<MineRow[] | null>('my_matches', { p_since: since }).then((r) => (r ?? []).filter((x) => lids.has(x.league_id))),
    soft(
      'roles',
      inChunks(teamPlayers, (part) => select<RoleRow>({ table: 'team_players', columns: 'team_id,player_id,role', filters: [byIds('player_id', part)] })),
    ),
    soft(
      'noches',
      inChunks(nightLeagues, (part) =>
        select<NightRow>({
          table: 'events',
          columns: 'id,league_id,type,name,date,config,updated_at',
          filters: [
            byIds('league_id', part),
            { col: 'type', op: 'in', value: NIGHT_TYPES },
            { col: 'date', op: 'gte', value: toIsoDate(yesterday) },
            { col: 'date', op: 'lte', value: toIsoDate(today) },
          ],
        }),
      ),
    ),
  ]);

  const sideById = new Map(mineRows.map((r) => [r.match_id, asSide(r.side)] as const));
  const mineQueries: Query[] = chunks([...new Set(mineRows.map((r) => r.match_id))]).flatMap((part): Query[] => [
    { filters: [byIds('id', part), { col: 'updated_at', op: 'gte', value: since }] },
    {
      filters: [
        byIds('id', part),
        { col: 'status', op: 'eq', value: 'scheduled' },
        { col: 'scheduled_at', op: 'gte', value: new Date(now - TODAY_WINDOW_MS).toISOString() },
        { col: 'scheduled_at', op: 'lt', value: new Date(now + 2 * 86400_000).toISOString() },
      ],
    },
  ]);
  const disputeQueries: Query[] = chunks(adminLeagues).map((part) => ({
    filters: [byIds('league_id', part), { col: 'status', op: 'eq', value: 'disputed' }],
    order: [{ col: 'disputed_at', asc: false }],
    limit: 50,
  }));
  const [mineSeen, disputeSeen] = await Promise.all([
    mineQueries.length ? matchesOf(mineQueries) : Promise.resolve([]),
    disputeQueries.length ? soft('reclamos', matchesOf(disputeQueries)) : Promise.resolve([]),
  ]);

  const retos = mineSeen.filter((x) => x.match.stage === 'Reto' && x.match.eventId).map((x) => x.match.id);
  const challengeRows = await soft(
    'retos',
    inChunks(retos, (part) => select<ChallengeRow>({ table: 'ladder_challenges', columns: CHALLENGE_COLUMNS, filters: [byIds('match_id', part)] })),
  );

  const captainOf = new Set(roles.filter((r) => r.role === 'captain' || r.role === 'delegate').map((r) => r.team_id));
  const familyById = new Map(items.map((i) => [i.lid, i.family] as const));
  const ops = pendingOps();

  const mine = overlayMatches(
    mineSeen.map(({ match: m, history }): Wire<NoticeMatch> => {
      const mySide = sideById.get(m.id) ?? null;
      const team = mySide ? m.sides[mySide - 1].teamId : null;
      const canAnswer = mySide !== null && (familyById.get(m.leagueId) !== 'team' || (!!team && captainOf.has(team)));
      return { ...m, mySide, canAnswer, change: lastScheduleChange(history, uid) };
    }),
    ops,
  );
  const disputes = overlayMatches(
    disputeSeen.map((x) => x.match),
    ops,
  );

  const challenges: ChallengeNotice[] = challengeRows
    .filter((c) => c.match_id && CHALLENGE_STATUSES.has(c.status))
    .map((c) => ({
      id: c.id,
      leagueId: c.league_id,
      eventId: c.event_id,
      matchId: c.match_id!,
      status: c.status as ChallengeNotice['status'],
      acceptBy: iso(c.accept_by) ?? '',
      playBy: iso(c.play_by) ?? '',
      acceptedAt: iso(c.accepted_at),
      acceptedBy: c.accepted_by ?? null,
      sentAt: iso(c.created_at) ?? '',
      challengerPos: c.challenger_pos ?? null,
      challengedPos: c.challenged_pos ?? null,
    }));

  const nights = nightRows.map((e): NightNotice => {
    const config = e.config && typeof e.config === 'object' ? e.config : {};
    const round = Number(config.round) > 0 ? Math.floor(Number(config.round)) : 0;
    const restsByRound = config.rests && typeof config.rests === 'object' && !Array.isArray(config.rests) ? (config.rests as Record<string, unknown>) : {};
    const rests = Array.isArray(restsByRound[String(round)]) ? (restsByRound[String(round)] as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    return { eventId: e.id, leagueId: e.league_id, type: e.type, name: e.name ?? '', date: e.date, round, rests, changedAt: iso(e.updated_at) ?? '' };
  });

  return { uid, mine, disputes, challenges, nights, players, adminLeagues };
}

/**
 * Los avisos de partidos de la cuenta (campana). Se vuelve a leer cada minuto, al volver a la app y cuando cambian
 * sus partidos desde este teléfono (confirmar, reclamar, retos). null mientras no hay nada o si no juega deportes
 * de partidos.
 */
export function useMatchNotices(uid: string | null | undefined, memberships: readonly Member[], leagues: readonly Pick<League, 'id' | 'sport'>[]): Live<MatchNoticeFeed | null> {
  const items = matchLeagueItems(memberships, leagues);
  const key = sortedKey(items.map(itemKey));
  return useLive<MatchNoticeFeed | null>(
    uid && key ? `matchNotices:${uid}:${key}` : null,
    uid && key ? { kind: 'matchNotices' } : null,
    () => fetchMatchNotices(uid!, key.split(',').map(itemOf)),
    {
      initial: null,
      tags: [tags.feeds, matchTags.mine, ...items.flatMap((i) => [tags.league(i.lid), matchTags.league(i.lid)])],
      pollMs: 60_000,
      staleMs: 20_000,
    },
  );
}
