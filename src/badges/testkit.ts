/**
 * Solo pruebas: filas de la foto (`BadgeSnapshot`) con valores por defecto, para armar escenarios cortos en las
 * pruebas de las reglas y de los evaluadores.
 */
import { DEMO_COURSE } from '../sports/golf/demo';
import type { SportId } from '../sports/types';
import type {
  ActivityDay,
  SnapEntry,
  SnapEvent,
  SnapGolfCard,
  SnapGolfRound,
  SnapLeague,
  SnapMatch,
  SnapMatchPlayer,
  SnapMatchSide,
  SnapMember,
  SnapPlayer,
  SnapProfile,
  SnapSubmission,
  SnapSwimEntry,
  SnapSwimEvent,
  SnapSwimMeet,
  SnapTeamPlayer,
} from './snapshot';

/** Un id de foto con forma de uuid. */
export const photoId = (n: number) => `0192f3c4-0000-7000-8000-${String(n).padStart(12, '0')}`;

export const snapProfile = (id: string, over: Partial<SnapProfile> = {}): SnapProfile => ({
  id,
  created_at: '2026-01-01T12:00:00.000Z',
  blocked_at: null,
  bowlingx: false,
  first_import_on: null,
  ...over,
});

export const snapLeague = (id: string, over: Partial<SnapLeague> = {}): SnapLeague => ({
  id,
  sport: 'bowling',
  kind: 'liga',
  name: `Liga ${id}`,
  tz: 'America/Santo_Domingo',
  has_minors: false,
  badges_auto: 'todas',
  owner_id: 'u-owner',
  season_start: null,
  season_end: null,
  require_photo: false,
  rules: {},
  created_at: '2026-01-01T12:00:00.000Z',
  ...over,
});

export const snapMember = (league_id: string, user_id: string, role: SnapMember['role'] = 'member', over: Partial<SnapMember> = {}): SnapMember => ({
  league_id,
  user_id,
  role,
  is_scorer: false,
  joined_at: '2026-01-01T12:00:00.000Z',
  ...over,
});

export const snapPlayer = (id: string, league_id: string, user_id: string | null = null, over: Partial<SnapPlayer> = {}): SnapPlayer => ({
  id,
  league_id,
  user_id,
  name: id,
  is_minor: false,
  created_at: '2026-01-01T12:00:00.000Z',
  ...over,
});

/** Una actividad válida (un jugador, un día). */
export const act = (player_id: string, date: string, over: Partial<ActivityDay> = {}): ActivityDay => ({
  sport: 'bowling' as SportId,
  league_id: 'L',
  player_id,
  user_id: null,
  date,
  official: true,
  ...over,
});

// ---------------------------------------------------------------------------------------------------------
// Boliche

export const snapEvent = (id: string, over: Partial<SnapEvent> = {}): SnapEvent => ({
  id,
  league_id: 'L',
  type: 'torneo',
  name: `Evento ${id}`,
  date: '2026-10-06',
  start_time: '19:00:00',
  games: 3,
  hcp_base: 220,
  hcp_percent: 0,
  individual_rank_by: null,
  team_rank_by: null,
  category_cuts: null,
  team_size: 0,
  announcement: '',
  player_count: 0,
  created_at: '2026-10-01T12:00:00.000Z',
  ...over,
});

export const snapEntry = (id: string, event_id: string, player_id: string, scores: (number | null)[], photos: (string | null)[], over: Partial<SnapEntry> = {}): SnapEntry => ({
  id,
  league_id: 'L',
  event_id,
  player_id,
  team_id: null,
  average: 0,
  handicap_override: null,
  scores,
  photos,
  frames: null,
  ...over,
});

export const snapSubmission = (id: string, player_id: string, scores: number[], over: Partial<SnapSubmission> = {}): SnapSubmission => ({
  id,
  league_id: 'L',
  player_id,
  event_id: null,
  date: '2026-10-06',
  scores,
  scanned: null,
  scanned_name: null,
  frames: null,
  photo_id: null,
  status: 'aprobado',
  note: null,
  created_by: null,
  created_at: '2026-10-06T23:00:00.000Z',
  reviewed_at: '2026-10-07T12:00:00.000Z',
  reviewed_by: null,
  ...over,
});

// ---------------------------------------------------------------------------------------------------------
// Partidos

export const snapMatch = (id: string, over: Partial<SnapMatch> = {}): SnapMatch => ({
  id,
  league_id: 'L',
  event_id: null,
  round: null,
  stage: '',
  bracket_key: null,
  court: '',
  scheduled_at: '2026-10-06T23:00:00.000Z',
  status: 'confirmed',
  format: 'sets',
  require_confirm: true,
  score: { text: '6-4 6-3', sides: [2, 0] },
  seq: 0,
  version: 1,
  winner_side: 1,
  walkover_side: null,
  scorer_id: null,
  lease_until: null,
  proposed_by: null,
  proposed_at: '2026-10-07T01:00:00.000Z',
  proposed_side: null,
  confirmed_by: null,
  confirmed_at: null,
  disputed_by: null,
  disputed_at: null,
  dispute_note: null,
  note: null,
  created_by: null,
  created_at: '2026-10-01T12:00:00.000Z',
  updated_at: '2026-10-07T01:00:00.000Z',
  rules: {},
  history: [],
  ...over,
});

/** Lados y jugadores de un partido: `[[equipo, [jugadores]], [equipo, [jugadores]]]`. */
export function matchSides(match_id: string, s1: [string | null, string[]], s2: [string | null, string[]]): { sides: SnapMatchSide[]; players: SnapMatchPlayer[] } {
  const sides: SnapMatchSide[] = [];
  const players: SnapMatchPlayer[] = [];
  ([s1, s2] as const).forEach(([team_id, ids], i) => {
    sides.push({ match_id, side: i + 1, team_id, label: team_id ?? ids.join(' / '), seed: null });
    for (const player_id of ids) players.push({ match_id, player_id, side: i + 1, position: null, jersey: null, sub: false });
  });
  return { sides, players };
}

export const snapTeamPlayer = (team_id: string, player_id: string, role: SnapTeamPlayer['role'] = 'player', created_at = '2026-01-01T12:00:00.000Z'): SnapTeamPlayer => ({
  team_id,
  player_id,
  league_id: 'L',
  role,
  created_at,
});

// ---------------------------------------------------------------------------------------------------------
// Golf (sobre el campo de ejemplo: par 72, azules 71.2/128)

export const snapRound = (event_id: string, over: Partial<SnapGolfRound> = {}): SnapGolfRound => ({
  event_id,
  league_id: 'L',
  course_id: 'demo',
  course: DEMO_COURSE,
  holes: 18,
  nine: 'all',
  competition: { format: 'stroke', basis: 'net', allowance: 95 },
  tournament_id: null,
  round_no: null,
  status: 'cerrada',
  closed_at: '2026-10-06T22:00:00.000Z',
  closed_by: 'u-admin',
  ...over,
});

/** Tarjeta firmada; `strokes` por hoyo (por defecto, par en todos). */
export const snapCard = (id: string, event_id: string, player_id: string, strokes?: (number | null)[], over: Partial<SnapGolfCard> = {}): SnapGolfCard => {
  const s = strokes ?? DEMO_COURSE.holes.map((h) => h.par);
  return {
    id,
    league_id: 'L',
    event_id,
    player_id,
    tee_id: 'azul',
    hcp_index: null,
    course_hcp: 0,
    playing_hcp: 0,
    group_no: 1,
    start_hole: 1,
    strokes: s,
    putts: s.map(() => null),
    picked_up: s.map(() => false),
    status: 'firmada',
    signed_at: '2026-10-06T21:00:00.000Z',
    signed_by: null,
    dq: false,
    ...over,
  };
};

// ---------------------------------------------------------------------------------------------------------
// Natación

export const snapMeet = (event_id: string, over: Partial<SnapSwimMeet> = {}): SnapSwimMeet => ({
  event_id,
  league_id: 'L',
  pool: 25,
  points: [6, 4, 3, 2, 1],
  finalized_at: '2026-10-06T22:00:00.000Z',
  ...over,
});

export const snapSwimEvent = (id: string, event_id: string, over: Partial<SnapSwimEvent> = {}): SnapSwimEvent => ({
  id,
  league_id: 'L',
  event_id,
  num: 1,
  distance: 100,
  stroke: 'libre',
  pool: 25,
  gender: 'F',
  age_groups: [],
  ...over,
});

export const snapSwimEntry = (id: string, event_id: string, swim_event_id: string, player_id: string, time_cs: number | null, over: Partial<SnapSwimEntry> = {}): SnapSwimEntry => ({
  id,
  league_id: 'L',
  event_id,
  swim_event_id,
  player_id,
  club_id: null,
  age_group: '11-12',
  time_cs,
  status: 'ok',
  result_at: '2026-10-06T20:00:00.000Z',
  recorded_by: 'u-scorer',
  ...over,
});
