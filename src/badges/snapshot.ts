/**
 * La foto de datos que arma `private.badge_snapshot(job)` para un trabajo de la cola (docs/insignias.md §3.1). Es el
 * contrato entre SQL y el motor puro: filas tal como están en la base (snake_case, `to_jsonb(fila)`), solo las
 * columnas que el motor lee. Cada trabajo trae únicamente las listas que necesita; las que faltan valen vacío.
 *
 * Las temporadas siguen el contrato de `public.seasons` / `public.season_awards` (migración de temporadas).
 */
import type { MatchHistoryItem, MatchPlayerRow, MatchRow, MatchSideRow } from '../lib/data/matchCore';
import type { EntryRow, EventRow, SubmissionRow, TeamRow } from '../lib/data/rows';
import type { GolfCourse, Nine } from '../sports/golf/course';
import type { GolfCompetition } from '../sports/golf/scoring';
import type { SwimGender, SwimStroke } from '../sports/swimming/events';
import type { SwimStatus } from '../sports/swimming/results';
import type { SportId } from '../sports/types';
import type { BadgeAwardRow, BadgeJob, BadgeProgressRow, BadgesAuto } from './types';

// ---------------------------------------------------------------------------------------------------------
// Ligas, cuentas y jugadores

export interface SnapLeague {
  id: string;
  sport: SportId;
  kind: 'liga' | 'torneo';
  name: string;
  tz: string;
  has_minors: boolean;
  badges_auto: BadgesAuto;
  owner_id: string;
  season_start: string | null;
  season_end: string | null;
  require_photo: boolean;
  rules: Record<string, unknown>;
  created_at: string;
}

/** Solo lo que decide si una cuenta es establecida (§1.7.4); nunca el correo ni el id de BowlingX. */
export interface SnapProfile {
  id: string;
  created_at: string;
  blocked_at: string | null;
  /** `profiles.firebase_uid` no nulo: viene de BowlingX. */
  bowlingx: boolean;
  /** Fecha del primer juego `'importado'` de sus jugadores ('YYYY-MM-DD'), si tiene. */
  first_import_on: string | null;
}

export interface SnapMember {
  league_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  is_scorer: boolean;
  joined_at: string;
}

export interface SnapPlayer {
  id: string;
  league_id: string;
  user_id: string | null;
  name: string;
  is_minor: boolean;
  created_at: string;
  /**
   * La cuenta se vinculó ella misma con este jugador (owner o admin: su reclamo al instante, link_account_to_player o
   * ensure_player; private.badge_verified_only, §1.6): en todo trabajo, para las insignias de cuenta, de
   * este jugador solo cuenta el historial verificado (boliche B2, golf G2, natación W1, y partidos R2 o T2 que
   * confirmó una cuenta del otro lado).
   */
  verified_only?: boolean;
}

// ---------------------------------------------------------------------------------------------------------
// Actividad (§1.7.2): el motor la saca de las filas de cada deporte, o SQL la manda ya resuelta para los
// trabajos de cuenta que suman muchas ligas.

/** Un (jugador, fecha local) con al menos una actividad válida. */
export interface ActivityDay {
  sport: SportId;
  league_id: string;
  player_id: string;
  /** Cuenta del jugador (null = sin cuenta). */
  user_id: string | null;
  /** Fecha local de la liga ('YYYY-MM-DD'). */
  date: string;
  /** Cuenta para títulos, asistencia y rachas (torneos, partidos que se confirman, rondas de 3+ tarjetas…). */
  official: boolean;
  /** Solo por la plantilla (equipos sin alineación): vale para días activos, debut y kilometraje, nada más. */
  roster?: boolean;
}

/** Quién tuvo actividad válida en una liga en un mes: la base de «liga real» (§1.7.4). */
export interface LeagueMonthActivity {
  league_id: string;
  /** 'YYYY-MM'. */
  month: string;
  /** Cuentas distintas con actividad válida. */
  users: string[];
  /** Jugadores distintos con actividad válida (con o sin cuenta). */
  players: string[];
}

// ---------------------------------------------------------------------------------------------------------
// Boliche

export type SnapEvent = EventRow & {
  /** Solo raqueta: categorías del torneo, meses de la liga por cajas… */
  config?: Record<string, unknown>;
};

export type SnapEntry = EntryRow;
export type SnapSubmission = SubmissionRow;
export type SnapTeam = TeamRow & { league_id: string };

// ---------------------------------------------------------------------------------------------------------
// Partidos (raqueta y equipos)

export type SnapMatch = Omit<MatchRow, 'state' | 'rules' | 'history'> & {
  rules: Record<string, unknown>;
  history: MatchHistoryItem[];
  /**
   * Solo baloncesto en los trabajos de temporada (`fair_play`, `fair_play_team`): el acta del modo cancha
   * (`matches.state` = `{config, base, log}`), de donde salen las faltas técnicas, antideportivas y descalificantes
   * que no van en `score.lines`. Falta o null = el partido no tiene acta.
   */
  state?: Record<string, unknown> | null;
};
export type SnapMatchSide = MatchSideRow;
export type SnapMatchPlayer = MatchPlayerRow;

export interface SnapTeamPlayer {
  team_id: string;
  player_id: string;
  league_id: string;
  role: 'player' | 'captain' | 'delegate';
  created_at: string;
}

/** Anotador de mesa designado del partido (`match_officials`). */
export interface SnapMatchOfficial {
  match_id: string;
  user_id: string;
}

/** Suspensiones de fútbol (`football_sanctions`) para el juego limpio. */
export interface SnapSanction {
  league_id: string;
  team_id: string;
  player_id: string;
  match_id: string;
  created_at: string;
}

export interface SnapLadderRung {
  event_id: string;
  league_id: string;
  entrant_id: string;
  player_id: string | null;
  team_id: string | null;
  position: number;
}

export interface SnapLadderChallenge {
  id: string;
  league_id: string;
  event_id: string;
  challenger: string;
  challenged: string;
  match_id: string | null;
  status: 'pending' | 'accepted' | 'played' | 'walkover' | 'cancelled';
  winner: string | null;
  resolved_at: string | null;
}

// ---------------------------------------------------------------------------------------------------------
// Golf

export interface SnapGolfRound {
  event_id: string;
  league_id: string;
  course_id: string | null;
  /** Copia del campo al crear la ronda. */
  course: GolfCourse;
  holes: 9 | 18;
  nine: Nine;
  competition: GolfCompetition;
  tournament_id: string | null;
  round_no: number | null;
  status: 'abierta' | 'cerrada';
  closed_at: string | null;
  closed_by: string | null;
}

export interface SnapGolfCard {
  id: string;
  league_id: string;
  event_id: string;
  player_id: string;
  tee_id: string;
  hcp_index: number | null;
  course_hcp: number;
  playing_hcp: number;
  group_no: number | null;
  start_hole: number;
  strokes: (number | null)[];
  putts: (number | null)[];
  picked_up: boolean[];
  status: 'abierta' | 'firmada';
  signed_at: string | null;
  signed_by: string | null;
  dq: boolean;
}

// ---------------------------------------------------------------------------------------------------------
// Natación

export interface SnapSwimMeet {
  event_id: string;
  league_id: string;
  pool: 25 | 50;
  points: number[];
  finalized_at: string | null;
}

export interface SnapSwimEvent {
  id: string;
  league_id: string;
  event_id: string;
  num: number;
  distance: number;
  stroke: SwimStroke;
  pool: 25 | 50;
  gender: SwimGender;
  age_groups: string[];
}

export interface SnapSwimEntry {
  id: string;
  league_id: string;
  event_id: string;
  swim_event_id: string;
  player_id: string;
  club_id: string | null;
  age_group: string | null;
  time_cs: number | null;
  status: SwimStatus;
  result_at: string | null;
  recorded_by: string | null;
}

export interface SnapSwimClub {
  id: string;
  league_id: string;
  name: string;
  coach_id: string | null;
}

// ---------------------------------------------------------------------------------------------------------
// Temporadas (contrato de public.seasons y public.season_awards)

export interface SnapSeason {
  id: string;
  league_id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  status: 'active' | 'closed';
  closed_at: string | null;
  closed_by: string | null;
  /** Tabla final tal como la calculó el teléfono al cerrar (evidencia; el motor recalcula). */
  standings: unknown;
}

export type SeasonAwardKind = 'campeon' | 'subcampeon' | 'tercero' | 'mvp' | 'mas_mejorado' | 'fair_play' | 'otro';

export interface SnapSeasonAward {
  id: string;
  season_id: string;
  league_id: string;
  kind: SeasonAwardKind;
  label: string;
  player_id: string | null;
  team_id: string | null;
  note: string | null;
}

// ---------------------------------------------------------------------------------------------------------
// Comunidad

/** Una reacción que la cuenta del trabajo le dio al juego de otro (`reactions` o `game_likes`). */
export interface SnapCheer {
  league_id: string;
  /** Jugador del juego felicitado. */
  player_id: string;
  /** Su cuenta (null = sin cuenta): una persona con cuenta cuenta una vez entre ligas. */
  user_id: string | null;
  at: string;
  /**
   * `false` = el felicitado no cuenta aunque tenga días. El motor no se fía de que falte: que tenga un día activo en una
   * liga real lo mira él con la actividad de la foto (SQL manda los primeros días de cada felicitado).
   */
  active?: boolean;
}

/**
 * Un acto de servicio (`table_crew`, `season_organizer`; §2.12), ya con su fecha local. SQL solo manda los de días
 * en que la cuenta no tenía jugadores propios en ningún lado, y las rondas de golf cerradas con 4+ tarjetas.
 */
export interface SnapServiceAct {
  league_id: string;
  date: string;
  kind: 'match' | 'submission' | 'swim' | 'golf';
  ref: string;
  /** Cuenta que lo hizo (en los trabajos de temporada vienen los de todo el staff). Falta = la cuenta del trabajo. */
  user_id?: string;
}

// ---------------------------------------------------------------------------------------------------------

/** Lo que devuelve `private.badge_snapshot(job)`. */
export interface BadgeSnapshot {
  v: 1;
  /** Hora del servidor al armar la foto (ISO). */
  now: string;
  job: BadgeJob;
  /**
   * Jugadores que evalúa el trabajo (ids). De cada uno viene su historial completo del deporte (con cuenta: el de
   * todos los jugadores de esa cuenta en ese deporte). Sin esto, el motor los deduce del trabajo (`targetsOf` en
   * evaluators/context.ts).
   */
  targets?: string[];
  leagues?: SnapLeague[];
  members?: SnapMember[];
  profiles?: SnapProfile[];
  players?: SnapPlayer[];
  activity?: ActivityDay[];
  league_months?: LeagueMonthActivity[];
  events?: SnapEvent[];
  teams?: SnapTeam[];
  entries?: SnapEntry[];
  submissions?: SnapSubmission[];
  matches?: SnapMatch[];
  match_sides?: SnapMatchSide[];
  match_players?: SnapMatchPlayer[];
  match_officials?: SnapMatchOfficial[];
  team_players?: SnapTeamPlayer[];
  sanctions?: SnapSanction[];
  ladder_rungs?: SnapLadderRung[];
  ladder_challenges?: SnapLadderChallenge[];
  golf_rounds?: SnapGolfRound[];
  golf_cards?: SnapGolfCard[];
  swim_meets?: SnapSwimMeet[];
  swim_events?: SnapSwimEvent[];
  swim_entries?: SnapSwimEntry[];
  swim_clubs?: SnapSwimClub[];
  seasons?: SnapSeason[];
  season_awards?: SnapSeasonAward[];
  cheers?: SnapCheer[];
  service?: SnapServiceAct[];
  /** Filas que ya existen para los dueños del trabajo (para no repetir, revocar o ver el mes anterior). */
  awards?: BadgeAwardRow[];
  progress?: BadgeProgressRow[];
}
