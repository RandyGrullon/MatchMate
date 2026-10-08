import { useEffect } from 'react';
import { BLOCKED_MESSAGE, isBlockedError } from '../backend/errors';
import { BackendError, type Backend, type RealtimeMessage } from '../backend/types';
import { uuidv7 } from '../db/ids';
import { watchTopic } from '../db/query';
import { compressImage, type CompressedLogo } from '../image';
import { LOGO_BUCKET, logoPath, prepareLogo, removeLogoFile } from '../logos';
import { uploadScoreboardPhoto } from '../photos';
import type { Stamp } from '../types';
import {
  GAME_IDS,
  defaultSettings,
  gameMeta,
  isGameId,
  normalizeVerifyFlags,
  parseSeriesScore,
  type EntryType,
  type Format,
  type GameId,
  type KeyResult,
  type Mode,
  type RankMap,
  type RankSource,
  type SeriesResultInput,
  type SlotSource,
  type StagePlan,
  type TournamentSettings,
} from '../../sports/esports';
import type { Side } from '../../sports/types';
import { backend, getUserId, invalidate, rpc, select, useLive, type Live } from './client';
import { tags } from './keys';
import { LEAGUE_QUOTA_CODE, leagueQuotaError } from './leagues';
import { hasResult, iso, isFinal, matchTags, type Match } from './matches';
import { chunks } from './rows';
import type { Wire } from './stamp';

/**
 * Esports (docs/esports.md §10.1): equipos de esports (globales, no de una liga), torneos por juego, inscripciones,
 * fases del cuadro y battle royale. Base: supabase/migrations/20261008000100_esports.sql (§9). Los IDs de juego y los
 * rangos están en ./esportsIds.ts.
 *
 * - Lecturas con la caché (`useLive`): las tablas `esports_*` con RLS (equipos: todos; miembros de equipo: con sesión;
 *   lo de un torneo: la liga visible, también sin cuenta en una pública) y dos RPC (`esports_hub`, que también ve quien
 *   no tiene cuenta, y `esports_my_entries`).
 * - Escrituras con `rpc` (con señal; ninguna va por la cola): son del capitán o del organizador, con la pantalla
 *   abierta. Los resultados de las series son partidos (`public.matches`) y van por src/lib/data/matches.ts tal cual
 *   (`finishMatch`, `confirmResult`…, que sí van por la cola).
 * - Tiempo real: la base avisa 'esports' ({table, op, ids}) en `event:<evento>` y en `league:<liga>`; aquí se escucha el
 *   del evento mientras la pantalla del torneo está abierta (`useEsportsTopic`). Los equipos no tienen tema: se vuelven a
 *   leer al volver a su pantalla y después de cada acción.
 */

// ---------- Tipos ----------

export type TeamRole = 'captain' | 'member' | 'sub';

export interface EsportsTeam {
  id: string;
  game: GameId;
  name: string;
  tag: string;
  description: string;
  logoPath: string | null;
  captainId: string | null;
  memberCount: number;
  createdAt: Stamp | null;
  updatedAt: Stamp | null;
}

export interface EsportsTeamMember {
  teamId: string;
  userId: string;
  role: TeamRole;
  displayName: string;
  /** ISO del servidor. */
  joinedAt: string;
}

export interface TeamPreview {
  teamId: string;
  game: GameId;
  name: string;
  tag: string;
  logoPath: string | null;
  memberCount: number;
}

export type TournamentStatus = 'registration' | 'live' | 'finished' | 'cancelled';

export interface EsportsTournament {
  eventId: string;
  leagueId: string;
  /** El nombre del evento (el del torneo). */
  name: string;
  game: GameId;
  mode: Mode;
  entryType: EntryType;
  format: Format;
  status: TournamentStatus;
  /** ISO del servidor. */
  startsAt: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string;
  checkinMinutes: number | null;
  maxEntries: number;
  settings: TournamentSettings;
  prizeText: string;
  /** El aviso o las reglas del evento. */
  announcement: string;
  updatedAt: Stamp | null;
}

export interface HubTournament
  extends Pick<
    EsportsTournament,
    | 'eventId'
    | 'leagueId'
    | 'name'
    | 'game'
    | 'mode'
    | 'entryType'
    | 'format'
    | 'status'
    | 'startsAt'
    | 'registrationOpensAt'
    | 'registrationClosesAt'
    | 'checkinMinutes'
    | 'maxEntries'
    | 'prizeText'
  > {
  leagueName: string;
  visibility: 'public' | 'private';
  logoPath: string | null;
  approved: number;
  pending: number;
}

export interface HubData {
  tournaments: HubTournament[];
  teams: Pick<EsportsTeam, 'id' | 'name' | 'tag' | 'logoPath' | 'memberCount'>[];
}

export type EntryKind = 'team' | 'player' | 'free_agent';
export type EntryStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'assigned';

export interface EntryMember {
  userId: string;
  role: TeamRole;
  displayName: string;
  gamerTag: string;
  ranks: RankMap;
  rankSource: RankSource;
  playerId: string | null;
}

export interface EsportsEntry {
  id: string;
  leagueId: string;
  eventId: string;
  kind: EntryKind;
  teamId: string | null;
  name: string;
  tag: string;
  captainId: string | null;
  status: EntryStatus;
  seed: number | null;
  checkedInAt: string | null;
  note: string | null;
  /** El equipo de temporada que la base le armó al aprobarlo (el lado de sus partidos). */
  sideTeamId: string | null;
  /** Agente libre asignado: el inscrito al que lo sumaron. */
  assignedEntry: string | null;
  members: EntryMember[];
  createdAt: Stamp | null;
}

export interface StageLink {
  matchId: string;
  stage: 'bracket' | 'groups' | 'playoffs' | 'league';
  part: 'W' | 'L' | 'GF' | 'GF2' | 'P3' | 'G';
  groupNo: number | null;
  bestOf: 1 | 3 | 5 | 7;
  winnerTo: string | null;
  winnerSide: 1 | 2 | null;
  loserTo: string | null;
  loserSide: 1 | 2 | null;
}

export interface BrResult {
  entryId: string;
  /** null = no jugó esa partida. */
  placement: number | null;
  kills: number;
}

export interface BrGame {
  id: string;
  eventId: string;
  round: number;
  gameNo: number;
  map: string;
  status: 'scheduled' | 'finished' | 'void';
  scheduledAt: string | null;
  /** Ids de las fotos (public.photos) de la partida. */
  proof: string[];
  results: BrResult[];
}

export interface MyEntry {
  entryId: string;
  eventId: string;
  leagueId: string;
  tournament: string;
  game: GameId;
  mode: Mode;
  entryStatus: EntryStatus;
  tournamentStatus: TournamentStatus;
  startsAt: string;
  entryName: string;
  role: TeamRole;
  kind: EntryKind;
}

// ---------- Filas de la base ----------

export interface EsportsTeamRow {
  id: string;
  game: string;
  name: string;
  tag: string;
  description: string | null;
  logo_path: string | null;
  captain_id: string | null;
  member_count: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface EsportsTeamMemberRow {
  team_id: string;
  user_id: string;
  role: string;
  display_name: string | null;
  joined_at: string | null;
}

export interface EsportsTournamentRow {
  event_id: string;
  league_id: string;
  game: string;
  mode: string;
  entry_type: string;
  format: string;
  status: string;
  starts_at: string;
  registration_opens_at: string | null;
  registration_closes_at: string;
  checkin_minutes: number | null;
  max_entries: number;
  settings: unknown;
  prize_text: string | null;
  updated_at?: string | null;
}

/** Lo que hace falta del evento del torneo. */
export interface EsportsEventRow {
  id: string;
  name: string | null;
  announcement: string | null;
}

export interface EsportsEntryRow {
  id: string;
  league_id: string;
  event_id: string;
  kind: string;
  team_id: string | null;
  name: string;
  tag: string | null;
  captain_id: string | null;
  status: string;
  seed: number | null;
  checked_in_at: string | null;
  note: string | null;
  side_team_id: string | null;
  assigned_entry: string | null;
  created_at?: string | null;
}

export interface EsportsEntryMemberRow {
  entry_id: string;
  user_id: string;
  role: string;
  display_name: string | null;
  gamer_tag: string | null;
  ranks: unknown;
  rank_source: string | null;
  player_id: string | null;
}

export interface EsportsLinkRow {
  match_id: string;
  stage: string;
  part: string;
  group_no: number | null;
  best_of: number;
  winner_to: string | null;
  winner_side: number | null;
  loser_to: string | null;
  loser_side: number | null;
}

export interface BrGameRow {
  id: string;
  event_id: string;
  round: number;
  game_no: number;
  map: string | null;
  status: string;
  scheduled_at: string | null;
  proof: unknown;
}

export interface BrResultRow {
  game_id: string;
  entry_id: string;
  placement: number | null;
  kills: number | null;
}

const TEAM_COLUMNS = 'id,game,name,tag,description,logo_path,captain_id,member_count,created_at,updated_at';
const MEMBER_COLUMNS = 'team_id,user_id,role,display_name,joined_at';
const TOURNAMENT_COLUMNS =
  'event_id,league_id,game,mode,entry_type,format,status,starts_at,registration_opens_at,registration_closes_at,checkin_minutes,max_entries,' +
  'settings,prize_text,updated_at';
const ENTRY_COLUMNS = 'id,league_id,event_id,kind,team_id,name,tag,captain_id,status,seed,checked_in_at,note,side_team_id,assigned_entry,created_at';
const ENTRY_MEMBER_COLUMNS = 'entry_id,user_id,role,display_name,gamer_tag,ranks,rank_source,player_id';
const LINK_COLUMNS = 'match_id,stage,part,group_no,best_of,winner_to,winner_side,loser_to,loser_side';

// ---------- Filas → app ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, dflt = ''): string => (typeof v === 'string' ? v : dflt);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown, dflt = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : dflt);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const sideOrNull = (v: unknown): 1 | 2 | null => (v === 1 || v === 2 ? v : v === '1' ? 1 : v === '2' ? 2 : null);
const oneOf = <T extends string>(v: unknown, list: readonly T[], dflt: T): T => (list.includes(v as T) ? (v as T) : dflt);

const TEAM_ROLES: readonly TeamRole[] = ['captain', 'member', 'sub'];
const ENTRY_KINDS: readonly EntryKind[] = ['team', 'player', 'free_agent'];
const ENTRY_STATUSES: readonly EntryStatus[] = ['pending', 'approved', 'rejected', 'withdrawn', 'assigned'];
const TOURNAMENT_STATUSES: readonly TournamentStatus[] = ['registration', 'live', 'finished', 'cancelled'];
const RANK_SOURCES: readonly RankSource[] = ['declarado', 'verificado'];
const STAGES: readonly StageLink['stage'][] = ['bracket', 'groups', 'playoffs', 'league'];
const PARTS: readonly StageLink['part'][] = ['W', 'L', 'GF', 'GF2', 'P3', 'G'];
const BEST_OF: readonly StageLink['bestOf'][] = [1, 3, 5, 7];
const asBestOf = (v: unknown): StageLink['bestOf'] => BEST_OF.find((b) => b === num(v)) ?? 1;
const BR_STATUSES: readonly BrGame['status'][] = ['scheduled', 'finished', 'void'];

/** El juego tal como viene de la base (la base solo guarda ids válidos; uno que esta versión no conoce queda tal cual). */
const asGame = (v: unknown): GameId => (isGameId(v) ? v : (str(v) as GameId));
const asRanks = (v: unknown): RankMap => (isObj(v) ? (v as RankMap) : {});
const roleOrder = (r: TeamRole) => TEAM_ROLES.indexOf(r);
const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const gameOrder = (g: string) => {
  const i = GAME_IDS.indexOf(g as GameId);
  return i < 0 ? GAME_IDS.length : i;
};

export function toTeam(r: EsportsTeamRow): Wire<EsportsTeam> {
  return {
    id: r.id,
    game: asGame(r.game),
    name: str(r.name),
    tag: str(r.tag),
    description: str(r.description),
    logoPath: strOrNull(r.logo_path),
    captainId: strOrNull(r.captain_id),
    memberCount: num(r.member_count),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export function toTeamMember(r: EsportsTeamMemberRow): EsportsTeamMember {
  return {
    teamId: r.team_id,
    userId: r.user_id,
    role: oneOf(r.role, TEAM_ROLES, 'member'),
    displayName: str(r.display_name),
    joinedAt: iso(r.joined_at) ?? '',
  };
}

/** Capitán, titulares y suplentes; en cada grupo, por nombre. */
export const compareMembers = (a: Pick<EsportsTeamMember, 'role' | 'displayName'>, b: Pick<EsportsTeamMember, 'role' | 'displayName'>) =>
  roleOrder(a.role) - roleOrder(b.role) || collator.compare(a.displayName, b.displayName);

/**
 * Los ajustes del torneo con los de por defecto del juego debajo (el teléfono siempre manda todos los de su juego; lo
 * que falte o venga raro de una versión vieja queda como el de por defecto). «Pedir ID confirmado» y «Pedir rango
 * verificado» quedan apagados en los juegos que no los pueden comprobar (la base tampoco los cuenta ahí).
 */
export function tournamentSettings(raw: unknown, game: GameId, mode: Mode, format: Format): TournamentSettings {
  let base: TournamentSettings | null = null;
  try {
    base = isGameId(game) ? defaultSettings(game, mode, format) : null;
  } catch {
    base = null;
  }
  const given = isObj(raw) ? raw : {};
  const merged = { ...(base ?? {}), ...given } as TournamentSettings;
  return isGameId(game) ? normalizeVerifyFlags(game, merged) : merged;
}

export function toTournament(r: EsportsTournamentRow, ev?: EsportsEventRow | null): Wire<EsportsTournament> {
  const game = asGame(r.game);
  const mode = str(r.mode) as Mode;
  const format = str(r.format) as Format;
  return {
    eventId: r.event_id,
    leagueId: r.league_id,
    name: str(ev?.name),
    game,
    mode,
    entryType: oneOf(r.entry_type, ['teams', 'open'] as const, 'open'),
    format,
    status: oneOf(r.status, TOURNAMENT_STATUSES, 'registration'),
    startsAt: iso(r.starts_at) ?? '',
    registrationOpensAt: iso(r.registration_opens_at),
    registrationClosesAt: iso(r.registration_closes_at) ?? iso(r.starts_at) ?? '',
    checkinMinutes: numOrNull(r.checkin_minutes),
    maxEntries: num(r.max_entries),
    settings: tournamentSettings(r.settings, game, mode, format),
    prizeText: str(r.prize_text),
    announcement: str(ev?.announcement),
    updatedAt: iso(r.updated_at),
  };
}

export function toEntryMember(r: EsportsEntryMemberRow): EntryMember {
  return {
    userId: r.user_id,
    role: oneOf(r.role, TEAM_ROLES, 'member'),
    displayName: str(r.display_name),
    gamerTag: str(r.gamer_tag),
    ranks: asRanks(r.ranks),
    rankSource: oneOf(r.rank_source, RANK_SOURCES, 'declarado'),
    playerId: strOrNull(r.player_id),
  };
}

export function toEntry(r: EsportsEntryRow, members: readonly EsportsEntryMemberRow[] = []): Wire<EsportsEntry> {
  return {
    id: r.id,
    leagueId: r.league_id,
    eventId: r.event_id,
    kind: oneOf(r.kind, ENTRY_KINDS, 'team'),
    teamId: strOrNull(r.team_id),
    name: str(r.name),
    tag: str(r.tag),
    captainId: strOrNull(r.captain_id),
    status: oneOf(r.status, ENTRY_STATUSES, 'pending'),
    seed: numOrNull(r.seed),
    checkedInAt: iso(r.checked_in_at),
    note: strOrNull(r.note),
    sideTeamId: strOrNull(r.side_team_id),
    assignedEntry: strOrNull(r.assigned_entry),
    members: members
      .filter((m) => m.entry_id === r.id)
      .map(toEntryMember)
      .sort(compareMembers),
    createdAt: iso(r.created_at),
  };
}

/** Por siembra (sin siembra al final), después por cuándo se inscribió y por nombre. */
export function compareEntries(a: Pick<Wire<EsportsEntry>, 'seed' | 'createdAt' | 'name' | 'id'>, b: Pick<Wire<EsportsEntry>, 'seed' | 'createdAt' | 'name' | 'id'>): number {
  const at = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : v && typeof (v as Stamp).toMillis === 'function' ? (v as Stamp).toMillis() : Infinity);
  return (
    (a.seed ?? 1e6) - (b.seed ?? 1e6) ||
    at(a.createdAt) - at(b.createdAt) ||
    collator.compare(a.name, b.name) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export function toLink(r: EsportsLinkRow): StageLink {
  return {
    matchId: r.match_id,
    stage: oneOf(r.stage, STAGES, 'bracket'),
    part: oneOf(r.part, PARTS, 'W'),
    groupNo: numOrNull(r.group_no),
    bestOf: asBestOf(r.best_of),
    winnerTo: strOrNull(r.winner_to),
    winnerSide: sideOrNull(r.winner_side),
    loserTo: strOrNull(r.loser_to),
    loserSide: sideOrNull(r.loser_side),
  };
}

const idList = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && !!x);
  // Postgres sin parsear: '{a,b}'.
  if (typeof v === 'string' && v.startsWith('{') && v.endsWith('}'))
    return v
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  return [];
};

export function toBrGame(r: BrGameRow, results: readonly BrResultRow[] = []): BrGame {
  return {
    id: r.id,
    eventId: r.event_id,
    round: num(r.round, 1),
    gameNo: num(r.game_no, 1),
    map: str(r.map),
    status: oneOf(r.status, BR_STATUSES, 'scheduled'),
    scheduledAt: iso(r.scheduled_at),
    proof: idList(r.proof),
    results: results
      .filter((x) => x.game_id === r.id)
      .map((x) => ({ entryId: x.entry_id, placement: numOrNull(x.placement), kills: num(x.kills) }))
      .sort((a, b) => (a.placement ?? 1e6) - (b.placement ?? 1e6) || (a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0)),
  };
}

/** Lo que devuelve `esports_hub` (camelCase) → la app. `game` es el juego pedido (la RPC no lo repite). */
export function toHubData(raw: unknown, game: GameId): HubData {
  const o = isObj(raw) ? raw : {};
  const list = (v: unknown) => (Array.isArray(v) ? v.filter(isObj) : []);
  return {
    tournaments: list(o.tournaments).map(
      (t): HubTournament => ({
        eventId: str(t.eventId),
        leagueId: str(t.leagueId),
        name: str(t.name),
        game: isGameId(t.game) ? t.game : game,
        mode: str(t.mode) as Mode,
        entryType: oneOf(t.entryType, ['teams', 'open'] as const, 'open'),
        format: str(t.format) as Format,
        status: oneOf(t.status, TOURNAMENT_STATUSES, 'registration'),
        startsAt: iso(t.startsAt) ?? '',
        registrationOpensAt: iso(t.registrationOpensAt),
        registrationClosesAt: iso(t.registrationClosesAt) ?? iso(t.startsAt) ?? '',
        checkinMinutes: numOrNull(t.checkinMinutes),
        maxEntries: num(t.maxEntries),
        prizeText: str(t.prizeText),
        leagueName: str(t.leagueName),
        visibility: t.visibility === 'private' ? 'private' : 'public',
        logoPath: strOrNull(t.logoPath),
        approved: num(t.approved),
        pending: num(t.pending),
      }),
    ),
    teams: list(o.teams).map((t) => ({
      id: str(t.id),
      name: str(t.name),
      tag: str(t.tag),
      logoPath: strOrNull(t.logoPath),
      memberCount: num(t.memberCount),
    })),
  };
}

/** Lo que devuelve `esports_my_entries` (camelCase) → la app, por fecha de inicio. */
export function toMyEntries(raw: unknown): MyEntry[] {
  const list = Array.isArray(raw) ? raw.filter(isObj) : [];
  return list
    .map(
      (e): MyEntry => ({
        entryId: str(e.entryId),
        eventId: str(e.eventId),
        leagueId: str(e.leagueId),
        tournament: str(e.tournament),
        game: asGame(e.game),
        mode: str(e.mode) as Mode,
        entryStatus: oneOf(e.entryStatus, ENTRY_STATUSES, 'pending'),
        tournamentStatus: oneOf(e.tournamentStatus, TOURNAMENT_STATUSES, 'registration'),
        startsAt: iso(e.startsAt) ?? '',
        entryName: str(e.entryName),
        role: oneOf(e.role, TEAM_ROLES, 'member'),
        kind: oneOf(e.kind, ENTRY_KINDS, 'team'),
      }),
    )
    .filter((e) => e.entryId)
    .sort((a, b) => Date.parse(a.startsAt || '9999') - Date.parse(b.startsAt || '9999') || collator.compare(a.tournament, b.tournament));
}

/** Una fila de `esports_team_preview` (snake_case, como `invite_preview`) → la app. */
export function toTeamPreview(raw: unknown): TeamPreview | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r)) return null;
  const teamId = str(r.team_id ?? r.teamId);
  if (!teamId) return null;
  return {
    teamId,
    game: asGame(r.game),
    name: str(r.name),
    tag: str(r.tag),
    logoPath: strOrNull(r.logo_path ?? r.logoPath),
    memberCount: num(r.member_count ?? r.memberCount),
  };
}

// ---------- Claves y etiquetas de la caché ----------

export const esportsKeys = {
  hub: (game: GameId) => `esports:hub:${game}`,
  team: (id: string) => `esports:team:${id}`,
  myTeams: (uid: string) => `esports:teams:u:${uid}`,
  teamEntries: (id: string) => `esports:team-entries:${id}`,
  tournament: (eventId: string) => `esports:t:${eventId}`,
  leagueTournaments: (lid: string) => `esports:lt:${lid}`,
  entries: (eventId: string) => `esports:entries:${eventId}`,
  links: (eventId: string) => `esports:links:${eventId}`,
  br: (eventId: string) => `esports:br:${eventId}`,
  myEntries: (uid: string) => `esports:entries:u:${uid}`,
};

export const esportsTags = {
  all: 'esports' as const,
  team: (id: string) => `esports:team:${id}`,
  event: (eventId: string) => `esports:e:${eventId}`,
  league: (lid: string) => `esports:l:${lid}`,
  mine: 'esports:mine' as const,
};

/** El código de invitación del equipo (solo el capitán; no se guarda en el teléfono). */
const teamCodeKey = (id: string) => `${esportsKeys.team(id)}:code`;

// ---------- Tiempo real ----------

/** Qué invalida el aviso 'esports' ({table, op, ids}) del tema de un evento o de una liga. */
export function handleEsportsMessage(topic: string, msg: RealtimeMessage) {
  if (msg.event !== 'esports') return;
  const kind = topic.slice(0, topic.indexOf(':'));
  const id = topic.slice(topic.indexOf(':') + 1);
  const table = (msg.payload as { table?: unknown } | null)?.table;
  const extra = table === 'entries' || table === 'members' || table === 'tournament' ? [esportsTags.mine] : [];
  if (kind === 'event') invalidate(esportsTags.event(id), ...extra);
  else if (kind === 'league') invalidate(esportsTags.league(id), ...extra);
}

const watching = new Map<string, { count: number; stop: () => void }>();

function acquire(topic: string): () => void {
  let w = watching.get(topic);
  if (!w) {
    let b: Backend | null = null;
    try {
      b = backend();
    } catch {
      // sin backend: solo consultas
    }
    const kind = topic.slice(0, topic.indexOf(':'));
    const id = topic.slice(topic.indexOf(':') + 1);
    const watch = watchTopic(b, topic, (msg) => handleEsportsMessage(topic, msg), {
      onPoll: () => invalidate(kind === 'event' ? esportsTags.event(id) : esportsTags.league(id)),
      // Sin cuenta no hay canal privado: se consulta cada 15–20 s.
      pollOnly: !getUserId(),
    });
    w = { count: 0, stop: () => watch.stop() };
    watching.set(topic, w);
  }
  const mine = w;
  mine.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--mine.count <= 0) {
      mine.stop();
      if (watching.get(topic) === mine) watching.delete(topic);
    }
  };
}

/** Tiempo real del torneo: 'esports' en event:<id> invalida esportsTags.event(id). Lo llaman los hooks de abajo. */
export function useEsportsTopic(eventId: string | null): void {
  useEffect(() => {
    if (!eventId) return;
    return acquire(`event:${eventId}`);
  }, [eventId]);
}

// ---------- Lecturas ----------

export async function fetchHub(game: GameId): Promise<HubData> {
  return toHubData(await rpc('esports_hub', { p_game: game }), game);
}

/** La página de un juego: sus torneos (abiertos, en curso, terminados) y sus equipos. También sin cuenta. */
export function useEsportsHub(game: GameId | null): Live<HubData> {
  return useLive<HubData>(game ? esportsKeys.hub(game) : null, game ? { kind: 'esportsHub', id: game } : null, () => fetchHub(game!), {
    initial: { tournaments: [], teams: [] },
    tags: [esportsTags.all],
  });
}

async function teamsByIds(ids: readonly string[]): Promise<Wire<EsportsTeam>[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const parts = await Promise.all(
    chunks(unique, 60).map((part) => select<EsportsTeamRow>({ table: 'esports_teams', columns: TEAM_COLUMNS, filters: [{ col: 'id', op: 'in', value: part }] })),
  );
  return parts.flat().map(toTeam);
}

export async function fetchMyTeams(uid: string): Promise<Wire<EsportsTeam & { myRole: TeamRole }>[]> {
  const mine = await select<Pick<EsportsTeamMemberRow, 'team_id' | 'role'>>({
    table: 'esports_team_members',
    columns: 'team_id,role',
    filters: [{ col: 'user_id', op: 'eq', value: uid }],
  });
  const roleOf = new Map(mine.map((m) => [m.team_id, oneOf(m.role, TEAM_ROLES, 'member')] as const));
  const teams = await teamsByIds([...roleOf.keys()]);
  return teams
    .map((t) => ({ ...t, myRole: roleOf.get(t.id) ?? 'member' }))
    .sort((a, b) => gameOrder(a.game) - gameOrder(b.game) || collator.compare(a.name, b.name));
}

/** Mis equipos de esports (de todos los juegos), con mi rol en cada uno. */
export function useMyEsportsTeams(uid: string | null | undefined): Live<(EsportsTeam & { myRole: TeamRole })[]> {
  return useLive<(EsportsTeam & { myRole: TeamRole })[]>(uid ? esportsKeys.myTeams(uid) : null, uid ? { kind: 'esportsMyTeams', id: uid } : null, () => fetchMyTeams(uid!), {
    initial: [],
    tags: [esportsTags.all, esportsTags.mine],
  });
}

export async function fetchTeam(teamId: string): Promise<Wire<{ team: EsportsTeam; members: EsportsTeamMember[] }> | null> {
  const [team] = await teamsByIds([teamId]);
  if (!team) return null;
  // Los miembros solo se leen con sesión (RLS): sin cuenta se ve el equipo sin la lista.
  const rows = getUserId()
    ? await select<EsportsTeamMemberRow>({ table: 'esports_team_members', columns: MEMBER_COLUMNS, filters: [{ col: 'team_id', op: 'eq', value: teamId }] })
    : [];
  return { team, members: rows.map(toTeamMember).sort(compareMembers) };
}

/** Un equipo y sus miembros (capitán, titulares y suplentes). null si ya no existe. */
export function useEsportsTeam(teamId: string | undefined): Live<{ team: EsportsTeam; members: EsportsTeamMember[] } | null> {
  return useLive<{ team: EsportsTeam; members: EsportsTeamMember[] } | null>(
    teamId ? esportsKeys.team(teamId) : null,
    teamId ? { kind: 'esportsTeam', id: teamId } : null,
    () => fetchTeam(teamId!),
    { initial: null, tags: teamId ? [esportsTags.all, esportsTags.team(teamId)] : [] },
  );
}

async function membersOfEntries(entryIds: readonly string[]): Promise<EsportsEntryMemberRow[]> {
  const ids = [...new Set(entryIds)];
  if (!ids.length) return [];
  const parts = await Promise.all(
    chunks(ids, 60).map((part) =>
      select<EsportsEntryMemberRow>({ table: 'esports_entry_members', columns: ENTRY_MEMBER_COLUMNS, filters: [{ col: 'entry_id', op: 'in', value: part }] }),
    ),
  );
  return parts.flat();
}

export async function fetchTeamEntries(teamId: string): Promise<Wire<EsportsEntry>[]> {
  const rows = await select<EsportsEntryRow>({ table: 'esports_entries', columns: ENTRY_COLUMNS, filters: [{ col: 'team_id', op: 'eq', value: teamId }] });
  const members = await membersOfEntries(rows.map((r) => r.id));
  // Lo más nuevo primero.
  return rows.map((r) => toEntry(r, members)).sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '') || compareEntries(a, b));
}

/** Las inscripciones del equipo (las de los torneos que se pueden ver). */
export function useTeamEntries(teamId: string | undefined): Live<EsportsEntry[]> {
  return useLive<EsportsEntry[]>(teamId ? esportsKeys.teamEntries(teamId) : null, teamId ? { kind: 'esportsTeamEntries', id: teamId } : null, () => fetchTeamEntries(teamId!), {
    initial: [],
    tags: teamId ? [esportsTags.all, esportsTags.team(teamId)] : [],
  });
}

/** El código de invitación del equipo: solo lo pide el capitán (null para los demás). */
export function useTeamInviteCode(teamId: string | undefined, isCaptain: boolean): Live<string | null> {
  const on = !!teamId && isCaptain;
  return useLive<string | null>(on ? teamCodeKey(teamId) : null, on ? { kind: 'esportsTeamCode', id: teamId } : null, async () => (await rpc<string | null>('esports_team_code', { p_team: teamId })) ?? null, {
    initial: null,
    tags: on ? [esportsTags.team(teamId)] : [],
    persist: false,
  });
}

async function eventsOf(filter: { col: 'id' | 'league_id'; value: string }): Promise<EsportsEventRow[]> {
  return select<EsportsEventRow>({ table: 'events', columns: 'id,name,announcement', filters: [{ col: filter.col, op: 'eq', value: filter.value }] });
}

export async function fetchTournament(eventId: string): Promise<Wire<EsportsTournament> | null> {
  const [rows, events] = await Promise.all([
    select<EsportsTournamentRow>({ table: 'esports_tournaments', columns: TOURNAMENT_COLUMNS, filters: [{ col: 'event_id', op: 'eq', value: eventId }] }),
    eventsOf({ col: 'id', value: eventId }),
  ]);
  const r = rows[0];
  return r ? toTournament(r, events.find((e) => e.id === r.event_id)) : null;
}

/** El torneo (con el nombre y el aviso de su evento), en vivo mientras la pantalla está abierta. null si no existe. */
export function useEsportsTournament(eventId: string | undefined): Live<EsportsTournament | null> {
  useEsportsTopic(eventId ?? null);
  return useLive<EsportsTournament | null>(
    eventId ? esportsKeys.tournament(eventId) : null,
    eventId ? { kind: 'esportsTournament', eventId } : null,
    () => fetchTournament(eventId!),
    { initial: null, tags: eventId ? [esportsTags.all, esportsTags.event(eventId), tags.event(eventId)] : [] },
  );
}

export async function fetchLeagueTournaments(lid: string): Promise<Wire<EsportsTournament>[]> {
  const [rows, events] = await Promise.all([
    select<EsportsTournamentRow>({ table: 'esports_tournaments', columns: TOURNAMENT_COLUMNS, filters: [{ col: 'league_id', op: 'eq', value: lid }] }),
    eventsOf({ col: 'league_id', value: lid }),
  ]);
  const byId = new Map(events.map((e) => [e.id, e]));
  return rows
    .map((r) => toTournament(r, byId.get(r.event_id)))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || collator.compare(a.name, b.name));
}

/** Los torneos de una liga de esports (o el único de un torneo suelto), por fecha de inicio. */
export function useLeagueTournaments(lid: string | undefined): Live<EsportsTournament[]> {
  return useLive<EsportsTournament[]>(lid ? esportsKeys.leagueTournaments(lid) : null, lid ? { kind: 'esportsLeagueTournaments', lid } : null, () => fetchLeagueTournaments(lid!), {
    initial: [],
    tags: lid ? [esportsTags.all, esportsTags.league(lid), tags.league(lid), tags.events(lid)] : [],
  });
}

export async function fetchEntries(eventId: string): Promise<Wire<EsportsEntry>[]> {
  const [rows, members] = await Promise.all([
    select<EsportsEntryRow>({ table: 'esports_entries', columns: ENTRY_COLUMNS, filters: [{ col: 'event_id', op: 'eq', value: eventId }] }),
    select<EsportsEntryMemberRow>({ table: 'esports_entry_members', columns: ENTRY_MEMBER_COLUMNS, filters: [{ col: 'event_id', op: 'eq', value: eventId }] }),
  ]);
  return rows.map((r) => toEntry(r, members)).sort(compareEntries);
}

/** Los inscritos del torneo con su plantilla (la foto), en vivo. */
export function useEntries(eventId: string | undefined): Live<EsportsEntry[]> {
  useEsportsTopic(eventId ?? null);
  return useLive<EsportsEntry[]>(eventId ? esportsKeys.entries(eventId) : null, eventId ? { kind: 'esportsEntries', eventId } : null, () => fetchEntries(eventId!), {
    initial: [],
    tags: eventId ? [esportsTags.all, esportsTags.event(eventId)] : [],
  });
}

export async function fetchStageLinks(eventId: string): Promise<StageLink[]> {
  const rows = await select<EsportsLinkRow>({ table: 'esports_matches', columns: LINK_COLUMNS, filters: [{ col: 'event_id', op: 'eq', value: eventId }] });
  return rows.map(toLink);
}

/** Los enlaces del cuadro (fase, parte, a dónde va el ganador y el perdedor) de cada serie del torneo. */
export function useStageLinks(eventId: string | undefined): Live<StageLink[]> {
  useEsportsTopic(eventId ?? null);
  return useLive<StageLink[]>(eventId ? esportsKeys.links(eventId) : null, eventId ? { kind: 'esportsLinks', eventId } : null, () => fetchStageLinks(eventId!), {
    initial: [],
    tags: eventId ? [esportsTags.all, esportsTags.event(eventId)] : [],
  });
}

export async function fetchBrGames(eventId: string): Promise<BrGame[]> {
  const games = await select<BrGameRow>({
    table: 'esports_br_games',
    columns: 'id,event_id,round,game_no,map,status,scheduled_at,proof',
    filters: [{ col: 'event_id', op: 'eq', value: eventId }],
  });
  const ids = games.map((g) => g.id);
  const parts = await Promise.all(
    chunks(ids, 60).map((part) =>
      select<BrResultRow>({ table: 'esports_br_results', columns: 'game_id,entry_id,placement,kills', filters: [{ col: 'game_id', op: 'in', value: part }] }),
    ),
  );
  const results = parts.flat();
  return games.map((g) => toBrGame(g, results)).sort((a, b) => a.round - b.round || a.gameNo - b.gameNo);
}

/** Las partidas de battle royale del torneo (por ronda y número) con el puesto y las kills de cada inscrito. */
export function useBrGames(eventId: string | undefined): Live<BrGame[]> {
  useEsportsTopic(eventId ?? null);
  return useLive<BrGame[]>(eventId ? esportsKeys.br(eventId) : null, eventId ? { kind: 'esportsBr', eventId } : null, () => fetchBrGames(eventId!), {
    initial: [],
    tags: eventId ? [esportsTags.all, esportsTags.event(eventId)] : [],
  });
}

export async function fetchMyEntries(): Promise<MyEntry[]> {
  return toMyEntries(await rpc('esports_my_entries'));
}

/** Mis inscripciones (por la plantilla o como capitán) vivas o de torneos sin terminar. */
export function useMyEsportsEntries(uid: string | null | undefined): Live<MyEntry[]> {
  return useLive<MyEntry[]>(uid ? esportsKeys.myEntries(uid) : null, uid ? { kind: 'esportsMyEntries', id: uid } : null, fetchMyEntries, {
    initial: [],
    tags: [esportsTags.all, esportsTags.mine],
  });
}

// ---------- Equipos ----------

const afterTeam = (teamId?: string | null) => invalidate(esportsTags.all, esportsTags.mine, ...(teamId ? [esportsTags.team(teamId)] : []));


/** Crea el equipo (la cuenta queda de capitán; necesita su ID de ese juego confirmado). Devuelve el id y el código. */
export async function createTeam(input: { game: GameId; name: string; tag: string; description?: string }): Promise<{ teamId: string; inviteCode: string }> {
  const id = uuidv7();
  const r = await rpc<unknown>('esports_create_team', {
    p_game: input.game,
    p_name: input.name.trim(),
    p_tag: input.tag.trim().toUpperCase(),
    p_description: (input.description ?? '').trim(),
    p_id: id,
  });
  const o = isObj(r) ? r : {};
  const teamId = str(o.teamId, id);
  afterTeam(teamId);
  return { teamId, inviteCode: str(o.inviteCode) };
}

/** El capitán cambia el nombre, el tag o la descripción. */
export async function updateTeam(teamId: string, patch: { name?: string; tag?: string; description?: string }): Promise<void> {
  const p: Obj = {};
  if (patch.name !== undefined) p.name = patch.name.trim();
  if (patch.tag !== undefined) p.tag = patch.tag.trim().toUpperCase();
  if (patch.description !== undefined) p.description = patch.description.trim();
  await rpc('esports_update_team', { p_team: teamId, p_patch: p });
  afterTeam(teamId);
}

/** El capitán borra el equipo (y después el archivo de su logo, si tenía). */
export async function deleteTeam(teamId: string): Promise<void> {
  const rows = await select<{ logo_path: string | null }>({ table: 'esports_teams', columns: 'id,logo_path', filters: [{ col: 'id', op: 'eq', value: teamId }] }).catch(
    () => [] as { logo_path: string | null }[],
  );
  await rpc('esports_delete_team', { p_team: teamId });
  await removeLogoFile(rows[0]?.logo_path ?? null);
  afterTeam(teamId);
}

/** Código nuevo (el anterior deja de servir). */
export async function renewTeamCode(teamId: string): Promise<string> {
  const code = await rpc<string>('esports_renew_team_code', { p_team: teamId });
  invalidate(esportsTags.team(teamId));
  return code;
}

/** El código como lo espera la base: sin espacios ni guiones y en mayúsculas. */
export const normalizeTeamCode = (code: string) => code.replace(/[\s-]+/g, '').toUpperCase();

/** A qué equipo lleva un código (también sin cuenta). null si el código no sirve. */
export async function previewTeamCode(code: string): Promise<TeamPreview | null> {
  const c = normalizeTeamCode(code);
  if (!c) return null;
  return toTeamPreview(await rpc<unknown>('esports_team_preview', { p_code: c }));
}

/** Entra al equipo con el código. null = código malo. */
export async function joinTeam(code: string): Promise<{ teamId: string } | null> {
  const c = normalizeTeamCode(code);
  if (!c) return null;
  const r = await rpc<unknown>('esports_join_team', { p_code: c });
  const teamId = isObj(r) ? str(r.teamId) : '';
  if (!teamId) return null;
  afterTeam(teamId);
  return { teamId };
}

export async function leaveTeam(teamId: string): Promise<void> {
  await rpc('esports_leave_team', { p_team: teamId });
  afterTeam(teamId);
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  await rpc('esports_remove_member', { p_team: teamId, p_user: userId });
  afterTeam(teamId);
}

/** Titular o suplente; `captain` pasa la capitanía (el anterior queda de titular). */
export async function setTeamMemberRole(teamId: string, userId: string, role: TeamRole): Promise<void> {
  await rpc('esports_set_member_role', { p_team: teamId, p_user: userId, p_role: role });
  afterTeam(teamId);
}

/** El bucket `logos` acepta hasta 256 kB (el logo comprimido pesa ≤ 120 kB). */
const MAX_LOGO_UPLOAD_BYTES = 262_144;

const isCompressed = (v: Blob | CompressedLogo): v is CompressedLogo =>
  typeof (v as CompressedLogo).contentType === 'string' && (v as CompressedLogo).blob instanceof Blob;

/**
 * Sube el logo del equipo (un archivo o uno ya comprimido con `prepareLogo`) y lo pone; borra el anterior. Como
 * `uploadLeagueLogo`: el mismo bucket público `logos`, en la carpeta del equipo ('<equipo>/<uuid>.webp'), reservando la
 * ruta con `esports_begin_team_logo` y poniéndola con `esports_set_team_logo`. Solo el capitán. Devuelve la ruta.
 */
export async function uploadTeamLogo(teamId: string, file: Blob | CompressedLogo): Promise<string> {
  const logo = isCompressed(file) ? file : await prepareLogo(file);
  if (!logo.blob.size || logo.blob.size > MAX_LOGO_UPLOAD_BYTES) throw new BackendError('El logo es muy grande.', 'validation', 'imagen');
  const team = teamId.toLowerCase();
  const path = logoPath(team, uuidv7(), logo.contentType);
  await rpc('esports_begin_team_logo', { p_team: team, p_path: path });
  await backend().storage.upload(LOGO_BUCKET, path, logo.blob, logo.contentType);
  let old: string | null;
  try {
    old = await rpc<string | null>('esports_set_team_logo', { p_team: team, p_path: path });
  } catch (e) {
    // No quedó puesto: el archivo que se acaba de subir sobra.
    await removeLogoFile(path);
    throw e;
  }
  if (old && old !== path) await removeLogoFile(old);
  afterTeam(teamId);
  return path;
}

/** Quita el logo del equipo (vuelve el tag en un círculo) y borra el archivo. */
export async function removeTeamLogo(teamId: string): Promise<void> {
  const old = await rpc<string | null>('esports_set_team_logo', { p_team: teamId, p_path: null });
  if (old) await removeLogoFile(old);
  afterTeam(teamId);
}

/** El link para entrar al equipo. */
export const teamJoinUrl = (origin: string, code: string): string => `${origin.replace(/\/+$/, '')}/esports/unirse/${encodeURIComponent(code)}`;

/** «Únete a Los Tigres (VALORANT) en MatchMate». */
export const teamShareText = (team: Pick<EsportsTeam, 'name' | 'game'>): string => `Únete a ${team.name} (${gameMeta(team.game)?.name ?? 'esports'}) en MatchMate`;

// ---------- Torneos ----------

export interface TournamentInput {
  game: GameId;
  name: string;
  mode: Mode;
  entryType: EntryType;
  format: Format;
  /** ISO. */
  startsAt: string;
  maxEntries: number;
  settings: TournamentSettings;
  visibility: 'public' | 'private';
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  checkinMinutes?: number | null;
  venue?: string;
  announcement?: string;
  prizeText?: string;
  tz?: string;
}

/** Los argumentos de `esports_create_tournament` (ids del teléfono). */
export function tournamentArgs(input: TournamentInput, ids: { leagueId?: string; newLeagueId: string; eventId: string }): Record<string, unknown> {
  const args: Record<string, unknown> = {
    p_game: input.game,
    p_name: input.name.trim(),
    p_mode: input.mode,
    p_entry_type: input.entryType,
    p_format: input.format,
    p_starts_at: input.startsAt,
    p_max_entries: input.maxEntries,
    p_settings: input.settings,
    p_visibility: input.visibility,
    p_registration_opens_at: input.registrationOpensAt ?? null,
    p_registration_closes_at: input.registrationClosesAt ?? null,
    p_checkin_minutes: input.checkinMinutes ?? null,
    p_venue: (input.venue ?? '').trim(),
    p_announcement: (input.announcement ?? '').trim(),
    p_prize_text: (input.prizeText ?? '').trim(),
    p_event_id: ids.eventId,
  };
  if (input.tz) args.p_tz = input.tz;
  if (ids.leagueId) args.p_league = ids.leagueId;
  else args.p_id = ids.newLeagueId;
  return args;
}

const afterLeague = (lid: string) => invalidate(tags.leagues, tags.members, tags.feeds, tags.league(lid), tags.events(lid), esportsTags.all, esportsTags.league(lid));

/**
 * Crea el torneo: sin `leagueId`, un torneo suelto (su liga de un solo torneo, con el tope de 5 por día como siempre);
 * con `leagueId`, adentro de esa liga de esports (admin). Devuelve la liga, el evento y el código si es privado.
 */
export async function createEsportsTournament(input: TournamentInput, leagueId?: string): Promise<{ leagueId: string; eventId: string; inviteCode: string | null }> {
  const newLeagueId = uuidv7();
  const eventId = uuidv7();
  let r: unknown;
  try {
    r = await rpc<unknown>('esports_create_tournament', tournamentArgs(input, { leagueId, newLeagueId, eventId }));
  } catch (e) {
    throw leagueQuotaError(e);
  }
  const o = isObj(r) ? r : {};
  const lid = str(o.leagueId, leagueId ?? newLeagueId);
  afterLeague(lid);
  return { leagueId: lid, eventId: str(o.eventId, eventId), inviteCode: strOrNull(o.inviteCode) };
}

/** Una liga de esports (de un juego) para tener varios torneos adentro. Devuelve su id. */
export async function createEsportsLeague(input: { game: GameId; name: string; visibility: 'public' | 'private'; venue?: string; tz?: string }): Promise<string> {
  const lid = uuidv7();
  try {
    await rpc('create_league', {
      p_name: input.name.trim(),
      p_visibility: input.visibility,
      p_kind: 'liga',
      p_sport: 'esports',
      p_venue: (input.venue ?? '').trim(),
      p_rules: { game: input.game },
      p_id: lid,
      ...(input.tz ? { p_tz: input.tz } : {}),
    });
  } catch (e) {
    throw leagueQuotaError(e);
  }
  afterLeague(lid);
  return lid;
}

type TournamentPatch = Partial<
  Pick<
    TournamentInput,
    | 'name'
    | 'startsAt'
    | 'registrationOpensAt'
    | 'registrationClosesAt'
    | 'checkinMinutes'
    | 'maxEntries'
    | 'prizeText'
    | 'announcement'
    | 'mode'
    | 'entryType'
    | 'format'
    | 'settings'
  >
>;

/** El cambio del torneo con los nombres de la base (solo lo que viene). */
export function tournamentPatchArg(patch: TournamentPatch): Record<string, unknown> {
  const map: [keyof TournamentPatch, string][] = [
    ['name', 'name'],
    ['startsAt', 'starts_at'],
    ['registrationOpensAt', 'registration_opens_at'],
    ['registrationClosesAt', 'registration_closes_at'],
    ['checkinMinutes', 'checkin_minutes'],
    ['maxEntries', 'max_entries'],
    ['prizeText', 'prize_text'],
    ['announcement', 'announcement'],
    ['mode', 'mode'],
    ['entryType', 'entry_type'],
    ['format', 'format'],
    ['settings', 'settings'],
  ];
  const out: Record<string, unknown> = {};
  for (const [from, to] of map) {
    const v = patch[from];
    if (v !== undefined) out[to] = typeof v === 'string' && (from === 'name' || from === 'prizeText' || from === 'announcement') ? v.trim() : v;
  }
  return out;
}

const afterEvent = (eventId: string) => invalidate(esportsTags.all, esportsTags.mine, esportsTags.event(eventId), tags.event(eventId));

/** Admin: cambia el torneo (lo del formato, solo antes de empezar y sin fases). */
export async function updateTournament(eventId: string, patch: TournamentPatch): Promise<void> {
  await rpc('esports_update_tournament', { p_event: eventId, p_patch: tournamentPatchArg(patch) });
  afterEvent(eventId);
}

/** Admin: empezar, cerrar, cancelar o volver a la inscripción. */
export async function setTournamentStatus(eventId: string, status: TournamentStatus): Promise<void> {
  await rpc('esports_set_status', { p_event: eventId, p_status: status });
  afterEvent(eventId);
}

// ---------- Inscripciones ----------

/** Lo que cambia una inscripción: el torneo, mis inscripciones y lo que la base materializó en la liga. */
const afterEntry = (eventId?: string | null) =>
  invalidate(esportsTags.all, esportsTags.mine, tags.members, tags.feeds, ...(eventId ? [esportsTags.event(eventId), tags.event(eventId)] : []));

const memberArgs = (members: readonly { userId: string; role: TeamRole }[]) => members.map((m) => ({ user_id: m.userId, role: m.role }));

/** El capitán inscribe a su equipo con la plantilla elegida (él va solo). Devuelve el id del inscrito. */
export async function registerTeam(eventId: string, teamId: string, members: readonly { userId: string; role: 'member' | 'sub' }[]): Promise<string> {
  const id = await rpc<string>('esports_register_team', { p_event: eventId, p_team: teamId, p_members: memberArgs(members) });
  afterEntry(eventId);
  invalidate(esportsTags.team(teamId));
  return id;
}

/** Individual (modo de 1) o agente libre (modo de equipo con entrada «Libre»). */
export async function registerSolo(eventId: string): Promise<string> {
  const id = await rpc<string>('esports_register_solo', { p_event: eventId });
  afterEntry(eventId);
  return id;
}

/** La plantilla nueva del inscrito (el capitán en la inscripción; el admin siempre). */
export async function setEntryRoster(entryId: string, members: readonly { userId: string; role: TeamRole }[]): Promise<void> {
  await rpc('esports_set_entry_roster', { p_entry: entryId, p_members: memberArgs(members) });
  afterEntry();
}

/** Admin: nombre, tag, siembra o nota del inscrito. */
export async function updateEntry(entryId: string, patch: { name?: string; tag?: string; seed?: number | null; note?: string | null }): Promise<void> {
  const p: Obj = {};
  if (patch.name !== undefined) p.name = patch.name.trim();
  if (patch.tag !== undefined) p.tag = patch.tag.trim().toUpperCase();
  if (patch.seed !== undefined) p.seed = patch.seed;
  if (patch.note !== undefined) p.note = patch.note === null ? null : patch.note.trim();
  await rpc('esports_update_entry', { p_entry: entryId, p_patch: p });
  afterEntry();
}

/** El capitán o el individual se retira (solo durante la inscripción). */
export async function withdrawEntry(entryId: string): Promise<void> {
  await rpc('esports_withdraw', { p_entry: entryId });
  afterEntry();
}

/** Admin: aprobar (la base lo materializa en la liga) o rechazar con una nota. */
export async function decideEntry(entryId: string, approve: boolean, note?: string): Promise<void> {
  const args: Record<string, unknown> = { p_entry: entryId, p_approve: approve };
  if (note?.trim()) args.p_note = note.trim().slice(0, 200);
  await rpc('esports_decide_entry', args);
  afterEntry();
}

/** Check-in (o quitarlo con `undo`). */
export async function checkIn(entryId: string, undo = false): Promise<void> {
  await rpc('esports_check_in', { p_entry: entryId, p_undo: undo });
  afterEntry();
}

/** Admin: la siembra (todos los aprobados, en orden). */
export async function setSeeds(eventId: string, order: readonly string[]): Promise<void> {
  await rpc('esports_set_seeds', { p_event: eventId, p_order: [...order] });
  afterEntry(eventId);
}

/** Admin: arma equipos con agentes libres (quedan aprobados). Devuelve los ids de los inscritos nuevos. */
export async function formTeams(
  eventId: string,
  teams: readonly { name: string; tag?: string; members: { userId: string; role: TeamRole }[] }[],
): Promise<string[]> {
  const ids = await rpc<string[]>('esports_form_teams', {
    p_event: eventId,
    p_teams: teams.map((t) => ({ name: t.name.trim(), ...(t.tag?.trim() ? { tag: t.tag.trim().toUpperCase() } : {}), members: memberArgs(t.members) })),
  });
  afterEntry(eventId);
  return ids ?? [];
}

/** Admin: suma un agente libre a un equipo inscrito con lugar. */
export async function assignFreeAgent(freeAgentEntryId: string, entryId: string, role: TeamRole = 'member'): Promise<void> {
  await rpc('esports_assign_free_agent', { p_free_agent: freeAgentEntryId, p_entry: entryId, p_role: role });
  afterEntry();
}

// ---------- Fases y cuadro ----------

/** Un lado del lote de `esports_create_stage`: el inscrito (si ya se sabe) o el texto de dónde sale. */
function slotArg(side: Side, source: SlotSource, label: string): { side: Side; entry_id: string | null; label: string } {
  if (source.kind === 'entry') return { side, entry_id: source.entryId, label: '' };
  return { side, entry_id: null, label: label || 'Por definir' };
}

/**
 * El lote de `esports_create_stage` desde el plan del motor: un id por llave (`newId`, por defecto uuidv7), los
 * inscritos como `entry_id` y los enlaces (`Link` por llave) como `{id, side}`. Un enlace a una llave que no está en el
 * plan es un error del plan.
 */
export function stageMatchesArg(plan: StagePlan, opts: { scheduledAt?: Record<string, string>; newId?: () => string } = {}): Record<string, unknown>[] {
  const newId = opts.newId ?? uuidv7;
  const idOf = new Map(plan.matches.map((m) => [m.key, newId()] as const));
  const link = (l: { key: string; side: Side } | null) => {
    if (!l) return null;
    const id = idOf.get(l.key);
    if (!id) throw new BackendError(`El cuadro no tiene la llave ${l.key}.`, 'validation', 'invalido');
    return { id, side: l.side };
  };
  return plan.matches.map((m) => ({
    id: idOf.get(m.key)!,
    key: m.key,
    part: m.part,
    round: m.round,
    group_no: m.group,
    stage: m.stage,
    best_of: m.bestOf,
    scheduled_at: opts.scheduledAt?.[m.key] ?? null,
    sides: [slotArg(1, m.sides[0], m.labels[0]), slotArg(2, m.sides[1], m.labels[1])],
    winner_to: link(m.winnerTo),
    loser_to: link(m.loserTo),
  }));
}

const afterStage = (lid: string, eventId: string) =>
  invalidate(esportsTags.all, esportsTags.event(eventId), tags.event(eventId), matchTags.league(lid), matchTags.event(eventId), matchTags.mine);

/** Admin: crea la fase (cuadro, grupos, playoffs o liga) con sus partidos y enlaces; el torneo pasa a «En curso». */
export async function createStage(lid: string, eventId: string, plan: StagePlan, opts?: { scheduledAt?: Record<string, string> }): Promise<string[]> {
  const matches = stageMatchesArg(plan, opts);
  if (!matches.length) return [];
  const ids = await rpc<string[]>('esports_create_stage', { p_event: eventId, p_stage: plan.kind, p_matches: matches });
  afterStage(lid, eventId);
  return ids ?? matches.map((m) => m.id as string);
}

/** Admin: borra una fase sin resultados (para rehacer el cuadro). */
export async function deleteStage(lid: string, eventId: string, stage: StagePlan['kind']): Promise<void> {
  await rpc('esports_delete_stage', { p_event: eventId, p_stage: stage });
  afterStage(lid, eventId);
}

/**
 * Aplica al cuadro lo que pasó a final por las 48 h (lo llama la pantalla del torneo al abrir). Devuelve cuántos lados
 * puso. La base solo deja a los de la liga (miembros, admins, superadmin): para quien mira un torneo público sin ser
 * de la liga (o sin cuenta) no es un error, devuelve 0 sin avisar.
 */
export async function syncBracket(eventId: string): Promise<number> {
  let n: number;
  try {
    n = Number(await rpc<number>('esports_sync', { p_event: eventId })) || 0;
  } catch (e) {
    if (e instanceof BackendError && (e.kind === 'permission' || e.kind === 'auth')) return 0;
    throw e;
  }
  if (n > 0) invalidate(esportsTags.event(eventId), matchTags.event(eventId), matchTags.mine);
  return n;
}

/** El lado que no vino en un W.O. → el ganador (W.O. de los dos: ninguno). */
const walkoverWinner = (wo: 0 | 1 | 2 | null): Side | null => (wo === 1 ? 2 : wo === 2 ? 1 : null);

/**
 * Mapa de la fila del partido al motor: lados como ids de inscritos (por side_team_id). null si el partido no tiene
 * resultado todavía o si alguno de sus lados no es un inscrito (el cuadro todavía no lo sabe).
 */
export function seriesInput(m: Match, entryBySideTeam: ReadonlyMap<string, string>): SeriesResultInput | null {
  if (!hasResult(m)) return null;
  const side1 = m.sides[0].teamId ? entryBySideTeam.get(m.sides[0].teamId) : undefined;
  const side2 = m.sides[1].teamId ? entryBySideTeam.get(m.sides[1].teamId) : undefined;
  if (!side1 || !side2) return null;
  const walkover = m.status === 'walkover' ? (m.walkoverSide ?? 0) : null;
  const winner = m.winner ?? (walkover !== null ? walkoverWinner(walkover) : null);
  return { id: m.id, side1, side2, winner, walkover, score: parseSeriesScore(m.score) };
}

/**
 * El ganador y el perdedor de una serie, como inscritos (por side_team_id): W.O. de un lado, gana el otro; doble W.O.
 * o empate (FC), nadie. No mira si es final (eso lo hace `keyResults`).
 */
export function keyResultOf(
  m: Pick<Match, 'sides' | 'winner' | 'status' | 'walkoverSide'>,
  entryBySideTeam: ReadonlyMap<string, string>,
): KeyResult {
  const ids = m.sides.map((s) => (s.teamId ? (entryBySideTeam.get(s.teamId) ?? null) : null)) as [string | null, string | null];
  const wo = m.status === 'walkover' ? (m.walkoverSide ?? 0) : null;
  const w = m.winner ?? (wo !== null ? walkoverWinner(wo) : null);
  return w ? { winner: ids[w - 1], loser: ids[2 - w] } : { winner: null, loser: null };
}

/**
 * Resultados por llave del plan (para resolvePlan/champion/podium): de los partidos finales del evento (confirmados,
 * W.O. o propuestos hace 48 h), solo los del cuadro (`links`; sin enlaces, todos los que tienen llave). Empate (FC) o
 * W.O. de los dos: sin ganador ni perdedor.
 */
export function keyResults(
  matches: readonly Match[],
  links: readonly StageLink[],
  entryBySideTeam: ReadonlyMap<string, string>,
  now: number,
): Record<string, KeyResult> {
  const inBracket = new Set(links.map((l) => l.matchId));
  const out: Record<string, KeyResult> = {};
  for (const m of matches) {
    if (!m.bracketKey || (inBracket.size && !inBracket.has(m.id)) || !isFinal(m, now)) continue;
    out[m.bracketKey] = keyResultOf(m, entryBySideTeam);
  }
  return out;
}

/** side_team_id → id del inscrito (para pasar los partidos al motor). */
export function entriesBySideTeam(entries: readonly Pick<EsportsEntry, 'id' | 'sideTeamId'>[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of entries) if (e.sideTeamId) map.set(e.sideTeamId, e.id);
  return map;
}

// ---------- Battle royale ----------

/** El argumento de `esports_br_save_game` (nombres de la base). */
export function brGameArg(game: {
  id: string;
  round: number;
  gameNo: number;
  map?: string;
  scheduledAt?: string | null;
  status?: 'scheduled' | 'finished' | 'void';
  proof?: string[];
  results?: BrResult[];
}): Record<string, unknown> {
  const out: Record<string, unknown> = { id: game.id, round: game.round, game_no: game.gameNo };
  if (game.map !== undefined) out.map = game.map.trim();
  if (game.scheduledAt !== undefined) out.scheduled_at = game.scheduledAt;
  if (game.status) out.status = game.status;
  if (game.proof) out.proof = [...game.proof];
  if (game.results) out.results = game.results.map((r) => ({ entry_id: r.entryId, placement: r.placement, kills: r.kills }));
  return out;
}

/** Admin o anotador: crea o reemplaza una partida con el puesto y las kills de cada inscrito. Devuelve su id. */
export async function saveBrGame(
  eventId: string,
  game: { id?: string; round: number; gameNo: number; map?: string; scheduledAt?: string | null; status?: 'scheduled' | 'finished' | 'void'; proof?: string[]; results?: BrResult[] },
): Promise<string> {
  const id = game.id ?? uuidv7();
  const r = await rpc<string>('esports_br_save_game', { p_event: eventId, p_game: brGameArg({ ...game, id }) });
  afterEvent(eventId);
  return r || id;
}

export async function deleteBrGame(eventId: string, gameId: string): Promise<void> {
  await rpc('esports_br_delete_game', { p_game: gameId });
  afterEvent(eventId);
}

// ---------- Pruebas del partido (capturas) ----------

/**
 * La captura de la pantalla final: se comprime, se sube a `scoreboards` ('<liga>/<foto>.webp') y se registra con
 * `add_photo`. Devuelve el id de la foto (va en `score.proof` o en la partida de battle royale). Necesita señal.
 */
export async function addMatchProof(lid: string, eventId: string, file: Blob): Promise<string> {
  let img;
  try {
    img = await compressImage(file);
  } catch (e) {
    console.warn('[esports] captura', e);
    throw new BackendError('No se pudo abrir esa imagen.', 'validation', 'imagen');
  }
  const up = await uploadScoreboardPhoto(lid, img, uuidv7());
  const r = await rpc<unknown>('add_photo', {
    p_league: lid,
    p_id: up.photoId,
    p_event: eventId,
    p_width: up.width,
    p_height: up.height,
    p_bytes: up.bytes,
    p_content_type: up.contentType,
  });
  return isObj(r) ? str(r.id, up.photoId) : up.photoId;
}

// ---------- Textos de error (§9.13) ----------

const messageOf = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : '').trim();

/** Qué se estaba haciendo, para elegir el texto cuando el código sirve para varias cosas. */
export type EsportsErrorContext = 'equipo' | 'inscripcion' | 'torneo' | 'cuadro';

/**
 * El error de una RPC de esports en palabras simples (§9.13). `game` pone el nombre del juego («Primero pon tu ID de
 * VALORANT.»); `ctx` elige entre los textos de un mismo código («cupo_lleno» de un equipo o de un torneo). Si no
 * viene, se mira el detalle del mensaje ('cerrado: cuadro', 'sin_id: Ana').
 */
export function esportsErrorText(e: unknown, game?: GameId, ctx?: EsportsErrorContext): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  const k = e instanceof BackendError ? e.kind : null;
  const msg = messageOf(e);
  const code = msg.split(/[\s:]/)[0];
  const detail = msg.includes(':') ? msg.slice(msg.indexOf(':') + 1).trim() : '';
  const gameName = (game && gameMeta(game)?.name) || '';
  const juego = gameName || 'juego';
  // El nombre de la persona de la plantilla a quien le falta (la base lo manda en el detalle: 'sin_id: Ana Pérez').
  const person = detail && !/^[a-z_]+$/.test(detail) ? detail : '';
  if (e instanceof BackendError && e.code === 'imagen') return 'No se pudo abrir esa imagen. Prueba con otra (JPG, PNG o WebP).';
  // El tope de ligas y torneos nuevos ya viene en palabras (leagueQuotaError).
  if (e instanceof BackendError && e.code === LEAGUE_QUOTA_CODE) return e.message;
  switch (code) {
    case 'sin_id':
      return person ? `${person} todavía no pone su ID de ${juego}.` : `Primero pon tu ID de ${juego}.`;
    case 'id_sin_comprobar':
      if (person) return `${person} todavía no tiene su ID de ${juego} comprobado.`;
      return gameName ? `Este torneo pide tu ID de ${gameName} comprobado.` : 'Este torneo pide tu ID del juego comprobado.';
    case 'sin_rango':
      if (person) return `${person} todavía no tiene su rango de ${juego} verificado.`;
      return gameName ? `Este torneo pide tu rango verificado de ${gameName}.` : 'Este torneo pide tu rango verificado.';
    case 'id_tomado':
      return 'Ese ID está conectado a otra cuenta con su inicio de sesión.';
    case 'cupo_lleno':
      return ctx === 'equipo' || /equipo/.test(detail) ? 'El equipo está lleno.' : 'Ya no hay cupo.';
    case 'limite':
      return 'Llegaste al máximo de equipos.';
    case 'cerrado':
      if (ctx === 'cuadro' || /cuadro/.test(detail)) return 'El partido siguiente ya empezó: anúlalo primero.';
      if (ctx === 'torneo' || /empez|live|curso/.test(detail)) return 'El torneo ya empezó.';
      return 'La inscripción está cerrada.';
    case 'duplicado':
      if (ctx === 'equipo' || /nombre|equipo/.test(detail)) return 'Ya hay un equipo con ese nombre.';
      return 'Ya está inscrito en este torneo.';
  }
  if (k === 'rate_limited' || code === 'rate_limited') return 'Hiciste muchos intentos. Prueba más tarde.';
  if (k === 'permission' || code === 'no_permitido') return 'No tienes permiso para eso.';
  if (k === 'not_found' || code === 'no_existe') return 'Eso ya no existe.';
  if (k === 'network') return 'Sin conexión. Prueba otra vez cuando tengas señal.';
  if (k === 'auth') return 'Entra a tu cuenta para eso.';
  if (code === 'invalido') return 'Revisa los datos: algo no es válido.';
  return 'No se pudo. Prueba otra vez.';
}
