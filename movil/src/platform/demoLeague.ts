/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): una liga de boliche ficticia para probar Hoy, el
 * evento, «Enviar mis juegos», «Por aprobar» y «Cómo van todos» sin el Supabase real. La cuenta de prueba es la admin
 * de la liga y juega; hay otro jugador con un envío pendiente y uno con juegos aprobados. Lo que cambia (envíos,
 * aprobar, rechazar) se guarda en sessionStorage y se borra al salir de la demostración. Todos los datos son ficticios.
 */
import { toIsoDate } from '@mm/lib/format';
import { DEMO_COURSE, DEMO_PARS } from '@mm/sports/golf/demo';
import { esportsRpc, esportsTables, forgetDemoEsports } from './demoEsports';
import { announceRpc, announceTables, forgetDemoAnnounce } from './demoAnnounce';
import { forgetDemoSolo, soloRpc } from './demoSolo';
import { forgetDemoSwim, swimRpc, swimTables } from './demoSwim';

const KEY = 'mm-demo-liga';
export const DEMO_LEAGUE = '00000000-0000-7000-8000-00000000f001';
const EVENT = '00000000-0000-7000-8000-00000000f0e1';
const ME_PLAYER = '00000000-0000-7000-8000-00000000f101';
const OTHER = '00000000-0000-7000-8000-00000000f102';
const THIRD = '00000000-0000-7000-8000-00000000f103';
// Dos prácticas pasadas, con juegos aprobados de los tres (para la tabla y «Mis números»).
const PAST = ['00000000-0000-7000-8000-00000000f0e2', '00000000-0000-7000-8000-00000000f0e3'];
const DAY = 86_400_000;
const dayAgo = (n: number) => toIsoDate(new Date(Date.now() - n * DAY));
const pastEntry = (n: number, eventId: string, playerId: string, scores: number[]): Row => ({
  id: `00000000-0000-7000-8000-0000000f5${String(n).padStart(3, '0')}`,
  league_id: DEMO_LEAGUE,
  event_id: eventId,
  player_id: playerId,
  team_id: null,
  average: 180,
  handicap_override: null,
  scores,
  photos: scores.map(() => 'ok'),
  frames: null,
});
const practice = (id: string, date: string): Row => ({
  id,
  league_id: DEMO_LEAGUE,
  type: 'practica',
  name: '',
  date,
  start_time: null,
  games: 3,
  hcp_base: 0,
  hcp_percent: 0,
  individual_rank_by: null,
  team_rank_by: null,
  category_cuts: null,
  team_size: 1,
  announcement: '',
  player_count: 3,
  created_at: iso(-30 * 86_400_000),
});

// Dos torneos por equipos de 2: uno jugado hace 3 días (su clasificación, también por equipos) y uno en 3 días con
// los tres inscritos (para armar los equipos en Organizar). Los equipos del torneo van en la tabla `teams`.
const TOURNEY_PAST = '00000000-0000-7000-8000-00000000f0e6';
const TOURNEY_NEXT = '00000000-0000-7000-8000-00000000f0e5';
const TEAM = (n: number) => `00000000-0000-7000-8000-00000000f7a${n}`;
const tourney = (id: string, name: string, date: string): Row => ({
  ...practice(id, date),
  type: 'torneo',
  name,
  hcp_base: 220,
  hcp_percent: 80,
  individual_rank_by: 'scratch',
  team_rank_by: 'scratch',
  team_size: 2,
  announcement: '',
});
const teamEntry = (n: number, eventId: string, playerId: string, teamId: string, scores: number[]): Row => ({ ...pastEntry(n, eventId, playerId, scores), team_id: teamId, photos: scores.map(() => 'ok') });
const TOURNEY_ENTRIES: Row[] = [
  teamEntry(7, TOURNEY_PAST, ME_PLAYER, TEAM(1), [201, 189, 210]),
  teamEntry(8, TOURNEY_PAST, OTHER, TEAM(1), [178, 196, 184]),
  teamEntry(9, TOURNEY_PAST, THIRD, TEAM(2), [205, 214, 199]),
  teamEntry(10, TOURNEY_NEXT, ME_PLAYER, TEAM(3), []),
  teamEntry(11, TOURNEY_NEXT, OTHER, TEAM(3), []),
  teamEntry(12, TOURNEY_NEXT, THIRD, TEAM(4), []),
];
const TOURNEY_TEAMS: Row[] = [
  { id: TEAM(1), league_id: DEMO_LEAGUE, event_id: TOURNEY_PAST, name: 'Equipo Uno', sort_order: 0, color: null },
  { id: TEAM(2), league_id: DEMO_LEAGUE, event_id: TOURNEY_PAST, name: 'Equipo Dos', sort_order: 1, color: null },
  { id: TEAM(3), league_id: DEMO_LEAGUE, event_id: TOURNEY_NEXT, name: 'Equipo Uno', sort_order: 0, color: null },
  { id: TEAM(4), league_id: DEMO_LEAGUE, event_id: TOURNEY_NEXT, name: 'Equipo Dos', sort_order: 1, color: null },
];

const PAST_ENTRIES: Row[] = [
  pastEntry(1, PAST[0], ME_PLAYER, [188, 201, 176]),
  pastEntry(2, PAST[0], OTHER, [212, 190, 199]),
  pastEntry(3, PAST[0], THIRD, [170, 185, 193]),
  pastEntry(4, PAST[1], ME_PLAYER, [195, 207, 183]),
  pastEntry(5, PAST[1], OTHER, [180, 221, 204]),
  pastEntry(6, PAST[1], THIRD, [166, 178, 190]),
];

type Row = Record<string, unknown>;
interface State {
  entries: Row[];
  submissions: Row[];
}

const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

function seed(): State {
  return {
    entries: [
      { id: '00000000-0000-7000-8000-00000000f201', league_id: DEMO_LEAGUE, event_id: EVENT, player_id: THIRD, team_id: null, average: 180, handicap_override: null, scores: [198, 176, null], photos: ['ok', 'ok', null], frames: null },
    ],
    submissions: [
      {
        id: '00000000-0000-7000-8000-00000000f301',
        league_id: DEMO_LEAGUE,
        player_id: OTHER,
        event_id: EVENT,
        date: null,
        scores: [181, 204],
        scanned: null,
        scanned_name: null,
        frames: null,
        photo_id: '00000000-0000-7000-8000-00000000f401',
        status: 'pendiente',
        note: null,
        created_by: null,
        created_at: iso(-20 * 60_000),
        reviewed_at: null,
        reviewed_by: null,
      },
    ],
  };
}

function load(): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    // sin sessionStorage: lo de fábrica
  }
  return seed();
}

function save(s: State) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sin sessionStorage
  }
}

export function forgetDemoLeague() {
  forgetDemoSwim();
  forgetDemoEsports();
  forgetDemoSolo();
  forgetDemoAnnounce();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

// ---------- La liga de golf ficticia: una ronda hoy (en juego) y una cerrada, con el campo de ejemplo de la web ----------
export const DEMO_GOLF = '00000000-0000-7000-8000-00000000a001';
const GOLF_TODAY = '00000000-0000-7000-8000-00000000a0e1';
const GOLF_PAST = '00000000-0000-7000-8000-00000000a0e2';
const G_ME = '00000000-0000-7000-8000-00000000a101';
const G_ONE = '00000000-0000-7000-8000-00000000a102';
const G_TWO = '00000000-0000-7000-8000-00000000a103';
const COMPETITION = { format: 'stroke', basis: 'net', allowance: 95 };
const golfEvent = (id: string, date: string): Row => ({ ...practice(id, date), league_id: DEMO_GOLF, type: 'ronda', games: 1 });
const golfRound = (eventId: string, closed: boolean): Row => ({
  event_id: eventId,
  league_id: DEMO_GOLF,
  course_id: 'demo',
  course: DEMO_COURSE,
  course_name: DEMO_COURSE.name,
  holes: 18,
  nine: 'all',
  competition: COMPETITION,
  shotgun: false,
  tournament_id: null,
  round_no: null,
  status: closed ? 'cerrada' : 'abierta',
  closed_at: closed ? iso(-6 * 86_400_000) : null,
});
// Golpes: el par con algo de ruido (inventado). `upTo` = hoyos anotados.
const strokesOf = (shift: number[], upTo = 18) => DEMO_PARS.map((p, i) => (i < upTo ? p + (shift[i % shift.length] ?? 0) : null));
const golfCard = (n: number, eventId: string, playerId: string, hcp: number, strokes: (number | null)[], signed = false): Row => ({
  id: `00000000-0000-7000-8000-0000000a2${String(n).padStart(3, '0')}`,
  league_id: DEMO_GOLF,
  event_id: eventId,
  player_id: playerId,
  tee_id: 'azul',
  hcp_index: hcp,
  course_hcp: hcp,
  playing_hcp: Math.round(hcp * 0.95),
  group_no: 1,
  start_hole: 1,
  strokes,
  putts: strokes.map(() => null),
  picked_up: strokes.map(() => false),
  status: signed ? 'firmada' : 'abierta',
  signed_at: signed ? iso(-6 * 86_400_000) : null,
  scored_at: strokes.some((x) => x != null) ? iso(-3_600_000) : null,
  dq: false,
});
function golfTables(uid: string): Record<string, Row[]> {
  return {
    golf_courses: [{ id: 'demo', league_id: DEMO_GOLF, name: DEMO_COURSE.name, holes: DEMO_COURSE.holes, tees: DEMO_COURSE.tees }],
    golf_rounds: [golfRound(GOLF_TODAY, false), golfRound(GOLF_PAST, true)],
    golf_tournaments: [],
    golf_cards: [
      golfCard(1, GOLF_TODAY, G_ME, 14.2, strokesOf([1, 0, 0, 1], 6)),
      golfCard(2, GOLF_TODAY, G_ONE, 8.4, strokesOf([0, 1, 0], 7)),
      golfCard(3, GOLF_TODAY, G_TWO, 20.1, strokesOf([1, 1, 0], 5)),
      golfCard(4, GOLF_PAST, G_ME, 14.2, strokesOf([1, 0, 1, 0]), true),
      golfCard(5, GOLF_PAST, G_ONE, 8.4, strokesOf([0, 0, 1]), true),
      golfCard(6, GOLF_PAST, G_TWO, 20.1, strokesOf([1, 2, 0]), true),
    ],
    golfLeague: [
      {
        id: DEMO_GOLF,
        sport: 'golf',
        kind: 'liga',
        visibility: 'private',
        name: 'Golf de Ejemplo',
        owner_id: uid,
        venue: DEMO_COURSE.name,
        schedule: 'Sábados 8:00 a. m.',
        season_start: null,
        season_end: null,
        contact_name: '',
        contact_phone: '',
        require_photo: false,
        has_minors: false,
        tz: 'America/Santo_Domingo',
        logo_path: null,
        created_at: iso(-60 * 86_400_000),
      },
    ],
    golfMember: [{ league_id: DEMO_GOLF, user_id: uid, role: 'owner', is_scorer: false, display_name: 'Juan Pérez', player_id: G_ME, scorer_only: false }],
    golfPlayers: [
      { id: G_ME, league_id: DEMO_GOLF, user_id: uid, name: 'Juan Pérez', average_override: null, is_minor: false, attrs: { golf: { index: 14.2 } } },
      { id: G_ONE, league_id: DEMO_GOLF, user_id: null, name: 'Golfista Uno', average_override: null, is_minor: false, attrs: null },
      { id: G_TWO, league_id: DEMO_GOLF, user_id: null, name: 'Golfista Dos', average_override: null, is_minor: false, attrs: null },
    ],
    golfEvents: [golfEvent(GOLF_TODAY, toIsoDate(new Date())), golfEvent(GOLF_PAST, dayAgo(6))],
  };
}

/** Las filas fijas (la liga, los jugadores, la práctica de hoy) y lo que cambia (planilla y envíos). */
function tables(uid: string): Record<string, Row[]> {
  const s = load();
  const g = golfTables(uid);
  // La liga de natación ficticia (demoSwim.ts): sus tablas propias y sus filas de liga, jugadores y encuentros.
  const { leagues: swimLeagues = [], memberships: swimMembers = [], players: swimPlayers = [], events: swimEvents = [], ...swim } = swimTables(uid);
  // La de esports (demoEsports.ts): sus torneos, equipos e IDs, y sus series en matches y match_sides.
  const { leagues: espLeagues = [], memberships: espMembers = [], players: espPlayers = [], events: espEvents = [], ...esp } = esportsTables(uid);
  return {
    ...swim,
    ...esp,
    ...announceTables(DEMO_LEAGUE),
    golf_courses: g.golf_courses,
    golf_rounds: g.golf_rounds,
    golf_tournaments: g.golf_tournaments,
    golf_cards: g.golf_cards,
    leagues: [
      {
        id: DEMO_LEAGUE,
        sport: 'bowling',
        kind: 'liga',
        visibility: 'private',
        name: 'Liga de Ejemplo',
        owner_id: uid,
        venue: 'Bolera de Ejemplo',
        schedule: 'Martes 7:00 p. m.',
        season_start: null,
        season_end: null,
        contact_name: 'Juan Pérez',
        contact_phone: '809-000-0000',
        require_photo: true,
        has_minors: false,
        tz: 'America/Santo_Domingo',
        logo_path: null,
        created_at: iso(-60 * 86_400_000),
      },
      ...g.golfLeague,
      ...swimLeagues,
      ...espLeagues,
    ],
    memberships: [{ league_id: DEMO_LEAGUE, user_id: uid, role: 'owner', is_scorer: false, display_name: 'Juan Pérez', player_id: ME_PLAYER, scorer_only: false }, ...g.golfMember, ...swimMembers, ...espMembers],
    players: [
      { id: ME_PLAYER, league_id: DEMO_LEAGUE, user_id: uid, name: 'Juan Pérez', average_override: null, is_minor: false },
      { id: OTHER, league_id: DEMO_LEAGUE, user_id: null, name: 'Jugador Uno', average_override: null, is_minor: false },
      { id: THIRD, league_id: DEMO_LEAGUE, user_id: null, name: 'Jugadora Dos', average_override: null, is_minor: false },
      ...g.golfPlayers,
      ...swimPlayers,
      ...espPlayers,
    ],
    events: [
      practice(PAST[0], dayAgo(14)),
      practice(PAST[1], dayAgo(7)),
      tourney(TOURNEY_PAST, 'Copa de Ejemplo', dayAgo(3)),
      { ...tourney(TOURNEY_NEXT, 'Torneo de Ejemplo', toIsoDate(new Date(Date.now() + 3 * DAY))), announcement: 'Trae tu bola: son 3 juegos, por equipos de 2.' },
      {
        id: EVENT,
        league_id: DEMO_LEAGUE,
        type: 'practica',
        name: '',
        date: toIsoDate(new Date()),
        start_time: null,
        games: 3,
        hcp_base: 0,
        hcp_percent: 0,
        individual_rank_by: null,
        team_rank_by: null,
        category_cuts: null,
        team_size: 1,
        announcement: '',
        player_count: 3,
        created_at: iso(-86_400_000),
      },
      ...g.golfEvents,
      ...swimEvents,
      ...espEvents,
    ],
    entries: [...PAST_ENTRIES, ...TOURNEY_ENTRIES, ...s.entries],
    // Los equipos de los torneos del boliche (y los de temporada de esports).
    teams: [...(esp.teams ?? []), ...TOURNEY_TEAMS],
    submissions: s.submissions,
    // Las pistas de hoy, ya publicadas: tú en la 7 con Jugador Uno.
    event_lanes: [
      { event_id: EVENT, player_id: ME_PLAYER, lane: 7, position: 1, published_at: iso(-3_600_000) },
      { event_id: EVENT, player_id: OTHER, lane: 7, position: 2, published_at: iso(-3_600_000) },
      { event_id: EVENT, player_id: THIRD, lane: 8, position: 1, published_at: iso(-3_600_000) },
    ],
  };
}

type Filter = { col: string; op: string; value: unknown };

/** Las filas de una tabla de la liga ficticia con los filtros más comunes (eq, in y gt); null si no es de la liga. */
export function demoLeagueSelect(uid: string, table: string, filters: readonly Filter[] = []): Row[] | null {
  const all = tables(uid)[table];
  if (!all) return null;
  return all.filter((r) =>
    filters.every((f) => {
      if (f.op === 'eq') return r[f.col] === f.value;
      if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
      if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
      return true;
    }),
  );
}

/** Un código de invitación ficticio (otra liga, con dos jugadores sin cuenta) para probar /unirse y el lector de QR. */
export const DEMO_CODE = 'ABCD2345';
const OTHER_LEAGUE = '00000000-0000-7000-8000-00000000f002';

/** Las RPC de la liga ficticia: enviar, aprobar, rechazar y la invitación. undefined si no es de la liga. */
export function demoLeagueRpc(uid: string, fn: string, a: Record<string, unknown>): unknown {
  const swim = swimRpc(uid, fn, a);
  if (swim !== undefined) return swim;
  const esp = esportsRpc(uid, fn, a);
  if (esp !== undefined) return esp;
  const solo = soloRpc(uid, fn, a);
  if (solo !== undefined) return solo;
  const notice = announceRpc(DEMO_LEAGUE, fn, a);
  if (notice !== undefined) return notice;
  if (fn === 'invite_preview' || fn === 'invite_details') {
    if (a.p_code !== DEMO_CODE) return null;
    if (fn === 'invite_preview') return [{ league_id: OTHER_LEAGUE, name: 'Liga de los Jueves', sport: 'bowling', kind: 'liga', visibility: 'private', logo_path: null }];
    return {
      leagueId: OTHER_LEAGUE,
      name: 'Liga de los Jueves',
      sport: 'bowling',
      kind: 'liga',
      visibility: 'private',
      venue: 'Bolera de Ejemplo',
      schedule: 'Jueves 7:00 p. m.',
      seasonStart: null,
      seasonEnd: null,
      hasMinors: false,
      members: 8,
      member: false,
      players: [
        { id: '00000000-0000-7000-8000-00000000f111', name: 'Juan Pérez' },
        { id: '00000000-0000-7000-8000-00000000f112', name: 'Jugador Tres' },
      ],
    };
  }
  const s = load();
  if (fn === 'submit_games') {
    if (a.p_league !== DEMO_LEAGUE) return undefined;
    s.submissions.push({
      id: a.p_id,
      league_id: DEMO_LEAGUE,
      player_id: a.p_player,
      event_id: a.p_event,
      date: a.p_date ?? null,
      scores: a.p_scores,
      scanned: a.p_scanned ?? null,
      scanned_name: null,
      frames: a.p_frames ?? null,
      photo_id: a.p_photo ?? null,
      status: 'pendiente',
      note: null,
      created_by: uid,
      created_at: iso(),
      reviewed_at: null,
      reviewed_by: null,
    });
    save(s);
    return a.p_id;
  }
  if (fn === 'approve_submission' || fn === 'reject_submission') {
    const sub = s.submissions.find((x) => x.id === a.p_submission);
    if (!sub) return undefined;
    sub.status = fn === 'approve_submission' ? 'aprobado' : 'rechazado';
    sub.reviewed_at = iso();
    if (fn === 'reject_submission') sub.note = a.p_note ?? null;
    if (fn === 'approve_submission') {
      const values = (a.p_values ?? {}) as Record<string, number>;
      let entry = s.entries.find((e) => e.event_id === EVENT && e.player_id === sub.player_id);
      if (!entry) {
        entry = { id: `00000000-0000-7000-8000-${String(Date.now()).slice(-12)}`, league_id: DEMO_LEAGUE, event_id: EVENT, player_id: sub.player_id, team_id: null, average: Number(a.p_average ?? 0), handicap_override: null, scores: [null, null, null], photos: [null, null, null], frames: null };
        s.entries.push(entry);
      }
      const scores = [...((entry.scores as (number | null)[]) ?? [])];
      const photos = [...((entry.photos as (string | null)[]) ?? [])];
      for (const [i, v] of Object.entries(values)) {
        scores[+i] = v;
        photos[+i] = (sub.photo_id as string | null) ?? 'sin-foto';
      }
      entry.scores = scores;
      entry.photos = photos;
    }
    save(s);
    return fn === 'approve_submission' ? { entry_id: 'demo', event_id: EVENT } : null;
  }
  return undefined;
}
