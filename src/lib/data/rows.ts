import type {
  BowlingEvent,
  Entry,
  GameComment,
  GameFrames,
  League,
  LeagueKind,
  LeagueRole,
  LiveScore,
  Member,
  Player,
  Reaction,
  ReactionType,
  RankBy,
  Submission,
  SubmissionStatus,
  Suggestion,
  Team,
  UserProfile,
  Visibility,
} from '../types';
import type { Wire } from './stamp';

/**
 * Filas de la base (snake_case, como las devuelve `select`) y su traducción a los tipos de la app (los de
 * BowlingX). Las horas se quedan en texto ISO (`Wire<T>`): se vuelven `Stamp` al salir del hook.
 */

export interface LeagueRow {
  id: string;
  sport: string;
  kind: LeagueKind;
  visibility: Visibility;
  name: string;
  owner_id: string;
  venue: string;
  schedule: string;
  season_start: string | null;
  season_end: string | null;
  contact_name: string;
  contact_phone: string;
  require_photo: boolean;
  has_minors: boolean;
  tz: string;
  /** Falta en filas guardadas en el teléfono antes del logo. */
  logo_path?: string | null;
  /** 20260929001100_insignias.sql. */
  badges_auto?: string;
  /** 20260929001120_insignias_creador.sql. */
  badge_makers?: string;
  created_at: string;
}

export interface MembershipRow {
  league_id: string;
  user_id: string;
  role: LeagueRole;
  is_scorer: boolean;
  display_name: string;
  player_id: string | null;
  /** 20260929001120_insignias_creador.sql. */
  badge_maker?: boolean;
  /** 20260929001400_anotadores.sql: entró solo para anotar (sin jugador). */
  scorer_only?: boolean;
}

export interface ProfileRow {
  id: string;
  email: string | null;
  name: string;
  /** Falta si la consulta no lo pidió. */
  username?: string | null;
  is_superadmin: boolean;
}

export interface PlayerRow {
  id: string;
  league_id: string;
  user_id: string | null;
  name: string;
  average_override: number | null;
  is_minor: boolean;
}

export interface EventRow {
  id: string;
  league_id: string;
  type: string;
  name: string;
  date: string;
  start_time: string | null;
  games: number;
  hcp_base: number;
  hcp_percent: number;
  individual_rank_by: RankBy | null;
  team_rank_by: RankBy | null;
  category_cuts: number[] | null;
  team_size: number;
  announcement: string;
  player_count: number;
  created_at: string;
}

export interface TeamRow {
  id: string;
  event_id: string | null;
  name: string;
  sort_order: number;
  color: string | null;
}

export interface RsvpRow {
  event_id: string;
  player_id: string;
  going: boolean;
}

export interface EntryRow {
  id: string;
  league_id: string;
  event_id: string;
  player_id: string;
  team_id: string | null;
  average: number;
  handicap_override: number | null;
  scores: (number | null)[] | null;
  photos: (string | null)[] | null;
  frames: Record<string, GameFrames> | null;
}

export interface SubmissionRow {
  id: string;
  league_id: string;
  player_id: string;
  event_id: string | null;
  date: string | null;
  scores: (number | null)[];
  scanned: (number | null)[] | null;
  scanned_name: string | null;
  frames: Record<string, GameFrames> | null;
  photo_id: string | null;
  status: SubmissionStatus;
  note: string | null;
  created_by: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface LiveRow {
  event_id: string;
  subject_key: string;
  player_id: string | null;
  state: { scores?: (number | null)[] } | null;
  version: number;
  updated_at: string;
}

export interface SocialRow {
  id: string;
  entry_id: string;
  event_id: string;
  player_id: string;
  user_id: string;
  author_name: string;
  created_at: string;
}

export interface ReactionRow extends SocialRow {
  type: ReactionType;
}

export interface CommentRow extends SocialRow {
  text: string;
}

export interface SuggestionRow {
  id: string;
  league_id: string;
  text: string;
  read: boolean;
  created_at: string;
}

export const memberId = (lid: string, uid: string) => `${lid}_${uid}`;
export const liveId = (eventId: string, playerId: string) => `${eventId}_${playerId}`;

export const toLeague = (r: LeagueRow): Wire<League> => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  visibility: r.visibility,
  ownerUid: r.owner_id,
  venue: r.venue ?? '',
  schedule: r.schedule ?? '',
  seasonStart: r.season_start ?? '',
  seasonEnd: r.season_end ?? '',
  contactName: r.contact_name ?? '',
  contactPhone: r.contact_phone ?? '',
  requirePhoto: r.require_photo,
  sport: r.sport,
  hasMinors: r.has_minors,
  tz: r.tz,
  logoPath: r.logo_path ?? null,
  ...(r.badges_auto === 'todas' || r.badges_auto === 'sin_titulos' || r.badges_auto === 'ninguna' ? { badgesAuto: r.badges_auto } : {}),
  ...(r.badge_makers === 'owner' || r.badge_makers === 'admins' || r.badge_makers === 'chosen' ? { badgeMakers: r.badge_makers } : {}),
  createdAt: r.created_at ?? null,
});

export const toMember = (r: MembershipRow): Member => ({
  id: memberId(r.league_id, r.user_id),
  leagueId: r.league_id,
  uid: r.user_id,
  name: r.display_name,
  role: r.role,
  playerId: r.player_id ?? null,
  scorer: r.is_scorer,
  ...(r.badge_maker ? { badgeMaker: true } : {}),
  ...(r.scorer_only ? { scorerOnly: true } : {}),
});

export const toProfile = (r: ProfileRow): UserProfile => ({
  id: r.id,
  email: r.email ?? '',
  name: r.name,
  username: r.username ?? '',
  superadmin: r.is_superadmin === true,
});

export const toPlayer = (r: PlayerRow): Player => ({
  id: r.id,
  name: r.name,
  averageOverride: r.average_override ?? null,
  uid: r.user_id ?? null,
  isMinor: r.is_minor,
});

/** El evento de la app con sus equipos (`teams[id] = {name, order}`) y su «voy» (`rsvp[jugador] = true`). */
export function toEvent(r: EventRow, teams: TeamRow[] = [], rsvps: RsvpRow[] = []): Wire<BowlingEvent> {
  const teamMap: Record<string, Team> = {};
  for (const t of teams) if (t.event_id === r.id) teamMap[t.id] = { name: t.name, order: t.sort_order, color: t.color };
  const rsvp: Record<string, boolean> = {};
  for (const x of rsvps) if (x.event_id === r.id && x.going) rsvp[x.player_id] = true;
  return {
    id: r.id,
    type: r.type as BowlingEvent['type'],
    name: r.name ?? '',
    date: r.date,
    games: r.games,
    hcpBase: r.hcp_base,
    hcpPercent: r.hcp_percent,
    teams: teamMap,
    playerCount: r.player_count ?? 0,
    individualRankBy: r.individual_rank_by ?? undefined,
    teamRankBy: r.team_rank_by ?? undefined,
    categoryCuts: r.category_cuts && r.category_cuts.length === 3 ? (r.category_cuts as [number, number, number]) : undefined,
    teamSize: r.team_size,
    announcement: r.announcement ?? '',
    rsvp,
    startTime: r.start_time,
    createdAt: r.created_at ?? null,
  };
}

export const toEntry = (r: EntryRow): Entry => ({
  id: r.id,
  eventId: r.event_id,
  playerId: r.player_id,
  teamId: r.team_id ?? null,
  average: r.average ?? 0,
  handicapOverride: r.handicap_override ?? null,
  scores: r.scores ?? [],
  photos: r.photos ?? [],
  ...(r.frames && Object.keys(r.frames).length ? { frames: r.frames } : {}),
});

export const toSubmission = (r: SubmissionRow): Wire<Submission> => ({
  id: r.id,
  playerId: r.player_id,
  eventId: r.event_id ?? null,
  date: r.date ?? null,
  scores: r.scores ?? [],
  scanned: r.scanned ?? null,
  scannedName: r.scanned_name ?? null,
  frames: r.frames ?? null,
  photoId: r.photo_id ?? null,
  status: r.status,
  note: r.note ?? null,
  createdAt: r.created_at ?? null,
  reviewedAt: r.reviewed_at ?? null,
  reviewedBy: r.reviewed_by ?? null,
  createdBy: r.created_by ?? null,
});

/** Solo los de jugador (`p:<id>`); los de partidos llegarán con su deporte. */
export function toLive(r: LiveRow): Wire<LiveScore> | null {
  if (!r.player_id) return null;
  return {
    id: liveId(r.event_id, r.player_id),
    eventId: r.event_id,
    playerId: r.player_id,
    scores: Array.isArray(r.state?.scores) ? r.state.scores : [],
    updatedAt: r.updated_at ?? null,
  };
}

export const toReaction = (r: ReactionRow): Wire<Reaction> => ({
  id: r.id,
  entryId: r.entry_id,
  eventId: r.event_id,
  playerId: r.player_id,
  uid: r.user_id,
  name: r.author_name,
  type: r.type,
  createdAt: r.created_at ?? null,
});

export const toComment = (r: CommentRow): Wire<GameComment> => ({
  id: r.id,
  entryId: r.entry_id,
  eventId: r.event_id,
  playerId: r.player_id,
  uid: r.user_id,
  name: r.author_name,
  text: r.text,
  createdAt: r.created_at ?? null,
});

export const toSuggestion = (r: SuggestionRow): Wire<Suggestion> => ({
  id: r.id,
  text: r.text,
  read: r.read,
  createdAt: r.created_at ?? null,
});

/** De a pedazos (las listas `in (...)` muy largas no caben en la URL de PostgREST). */
export function chunks<T>(list: readonly T[], size = 60): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
