/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): lo del organizador de golf en «Golf de Ejemplo»
 * (demoLeague.ts). Contesta las RPC de src/lib/data/golf.ts con la misma forma que la base (20260927000400_golf.sql):
 * campos (golf_save_course, golf_delete_course), rondas y torneos (golf_create_round, golf_create_tournament,
 * golf_delete_tournament, golf_update_round, golf_close_round), inscribir y grupos (golf_register, golf_add_players,
 * golf_unregister, golf_set_groups, golf_set_dq), la tarjeta (golf_save_hole_scores, golf_sign_card) y, de las rondas de
 * golf, delete_event; además las temporadas de la liga de golf (league_seasons, league_champions). Pone lo cambiado
 * encima de las filas de la liga (golf_courses, golf_rounds, golf_tournaments, golf_cards y events) y trae de fábrica un
 * campo de 9 hoyos más y una ronda la semana que viene sin inscritos (para inscribir y armar los grupos). Se guarda en
 * sessionStorage y se borra al salir de la demostración (forgetDemoGolf). Todos los datos son ficticios.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { uuidv7 } from '@mm/lib/db/ids';
import { toIsoDate } from '@mm/lib/format';
import type { Season } from '@mm/lib/seasons';
import { makeSnapshot, snapshotTable } from '@mm/components/season/logic';
import { DEFAULT_ALLOWANCE, handicapFor, isValidIndex, type GolfCourse } from '@mm/sports/golf/course';
import { DEMO_COURSE } from '@mm/sports/golf/demo';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de una tabla de las ligas ficticias (la capa de abajo, sin filtrar); null si no es de ellas. */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-golf';
const DAY = 86_400_000;
/** «Golf de Ejemplo» (demoLeague.ts). */
const DEMO_GOLF = '00000000-0000-7000-8000-00000000a001';
// Sus jugadores (demoLeague.ts): Juan Pérez (la cuenta de prueba), Golfista Uno y Golfista Dos.
const G_ME = '00000000-0000-7000-8000-00000000a101';
const G_ONE = '00000000-0000-7000-8000-00000000a102';
const G_TWO = '00000000-0000-7000-8000-00000000a103';
/** La ronda de la semana que viene (sin inscritos) y el campo corto de 9 hoyos. */
const NEXT_ROUND = '00000000-0000-7000-8000-00000000a0e3';
const SHORT_COURSE = '00000000-0000-7000-8000-00000000a0c2';
const SEASON_ACTIVE = '00000000-0000-7000-8000-00000000a5a1';
const SEASON_CLOSED = '00000000-0000-7000-8000-00000000a5a2';

const iso = (offset = 0) => new Date(Date.now() + offset).toISOString();
const dayFrom = (n: number) => toIsoDate(new Date(Date.now() + n * DAY));
const fail = (message: string, kind: BackendErrorKind = 'validation', code: string | null = message): never => {
  throw new BackendError(message, kind, code);
};
const invalid = () => fail('invalido');

/** El campo corto (9 hoyos, par 35): los números son inventados. */
const SHORT: GolfCourse = {
  id: SHORT_COURSE,
  name: 'Campo Corto de Ejemplo',
  holes: [4, 3, 5, 4, 4, 3, 4, 4, 4].map((par, i) => ({ par, si: [5, 9, 1, 3, 7, 8, 2, 6, 4][i] })),
  tees: [
    { id: 'blanca', name: 'Blancas', rating: 34.6, slope: 118, par: 35 },
    { id: 'roja', name: 'Rojas', rating: 33.9, slope: 112, par: 35 },
  ],
};

/** Un evento de golf con la forma de `events` (como los de demoLeague.ts). */
function eventRow(id: string, date: string, name = '', startTime: string | null = null): Row {
  return {
    id,
    league_id: DEMO_GOLF,
    type: 'ronda',
    name,
    date,
    start_time: startTime,
    games: 1,
    hcp_base: 0,
    hcp_percent: 0,
    individual_rank_by: null,
    team_rank_by: null,
    category_cuts: null,
    team_size: 1,
    announcement: '',
    player_count: 0,
    created_at: iso(),
  };
}

/** Hoyos que se juegan y el primero (golf_round_holes y golf_first_hole de la base). */
const roundHoles = (course: GolfCourse, nine: string) => (course.holes.length === 18 && (nine === 'front' || nine === 'back') ? 9 : course.holes.length);
const firstHole = (course: GolfCourse, nine: string) => (course.holes.length === 18 && nine === 'back' ? 10 : 1);

function roundRow(eventId: string, course: GolfCourse, extra: Row = {}): Row {
  const nine = (extra.nine as string | undefined) ?? 'all';
  return {
    event_id: eventId,
    league_id: DEMO_GOLF,
    course_id: course.id,
    course,
    course_name: course.name,
    holes: roundHoles(course, nine),
    nine,
    competition: { format: 'stroke', basis: 'net', allowance: DEFAULT_ALLOWANCE },
    shotgun: false,
    tournament_id: null,
    round_no: null,
    status: 'abierta',
    closed_at: null,
    ...extra,
  };
}

/** Lo que trae de fábrica encima de la liga: el campo corto y la ronda de la semana que viene. */
const FIXED = {
  courses: (): Row[] => [{ id: SHORT.id, league_id: DEMO_GOLF, name: SHORT.name, holes: SHORT.holes, tees: SHORT.tees }],
  events: (): Row[] => [eventRow(NEXT_ROUND, dayFrom(7), 'Mensual de Ejemplo', '08:00:00')],
  rounds: (): Row[] => [roundRow(NEXT_ROUND, DEMO_COURSE)],
};

interface State {
  /** Lo cambiado de cada tabla por su id (null = borrado). */
  courses: Record<string, Row | null>;
  rounds: Record<string, Row | null>;
  events: Record<string, Row | null>;
  cards: Record<string, Row | null>;
  tournaments: Record<string, Row | null>;
}

const empty = (): State => ({ courses: {}, rounds: {}, events: {}, cards: {}, tournaments: {} });

function load(): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return { ...empty(), ...(JSON.parse(raw) as Partial<State>) };
  } catch {
    // sin sessionStorage: nada cambiado
  }
  return empty();
}

function save(s: State) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sin sessionStorage: sigue en memoria hasta recargar
  }
}

export function forgetDemoGolf() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

const matches = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    if (f.op === 'eq') return r[f.col] === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
    if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
    return true;
  });

/** Las filas de abajo con lo cambiado encima (por `key`): las cambiadas reemplazan, las nuevas se suman, null borra. */
function merge(base: readonly Row[], changed: Record<string, Row | null>, key = 'id'): Row[] {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of base) {
    const id = String(r[key]);
    seen.add(id);
    if (id in changed) {
      if (changed[id]) out.push(changed[id]!);
    } else out.push(r);
  }
  for (const [id, r] of Object.entries(changed)) if (r && !seen.has(id)) out.push(r);
  return out;
}

const GOLF_TABLES = ['golf_courses', 'golf_rounds', 'golf_tournaments', 'golf_cards', 'events'];

/** Una tabla con lo del golf encima (sin filtrar); null si no es de las del golf. */
function overlay(s: State, table: string, read: Read): Row[] | null {
  if (!GOLF_TABLES.includes(table)) return null;
  const events = merge([...(read('events') ?? []), ...FIXED.events()], s.events);
  const alive = new Set(events.map((e) => e.id as string));
  if (table === 'golf_courses') return merge([...(read('golf_courses') ?? []), ...FIXED.courses()], s.courses);
  if (table === 'golf_tournaments') return merge(read('golf_tournaments') ?? [], s.tournaments);
  if (table === 'golf_rounds') return merge([...(read('golf_rounds') ?? []), ...FIXED.rounds()], s.rounds, 'event_id').filter((r) => alive.has(r.event_id as string));
  const cards = merge(read('golf_cards') ?? [], s.cards).filter((c) => alive.has(c.event_id as string));
  if (table === 'golf_cards') return cards;
  // Los eventos de golf con cuántos inscritos tienen (player_count, como la base).
  return events.map((e) => (e.league_id === DEMO_GOLF ? { ...e, player_count: cards.filter((c) => c.event_id === e.id).length } : e));
}

/**
 * Las filas de `table` con lo del golf encima y los filtros (eq, in y gt); null si la tabla no es del golf (entonces
 * contesta la capa de abajo). `read`: la capa de abajo sin filtros.
 */
export function demoGolfSelect(table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  const rows = overlay(load(), table, read);
  return rows ? rows.filter((r) => matches(r, filters)) : null;
}

// ---------- Temporadas de la liga de golf ----------

/** Las temporadas de «Golf de Ejemplo» (la forma de league_seasons): la de ahora y una cerrada con su tabla y premios. */
function golfSeasons(uid: string): Season[] {
  const closedAt = iso(-31 * DAY);
  const snapshot = makeSnapshot(
    'golf',
    [
      snapshotTable(
        { key: 'merito', title: 'Orden de mérito', nameLabel: 'Jugador', note: 'Puntos por puesto en cada ronda cerrada (4 eventos).' },
        [
          { rank: 1, id: G_ONE, name: 'Golfista Uno', events: 4, wins: 2, best: 1, points: 81 },
          { rank: 2, id: G_ME, name: 'Juan Pérez', events: 4, wins: 1, best: 1, points: 74 },
          { rank: 3, id: G_TWO, name: 'Golfista Dos', events: 3, wins: 1, best: 1, points: 57 },
        ],
        [
          { label: 'Jugó', title: 'Eventos jugados', value: (r) => r.events },
          { label: 'Ganó', title: 'Eventos ganados', value: (r) => r.wins },
          { label: 'Mejor', title: 'Mejor puesto', wide: true, value: (r) => r.best },
          { label: 'Puntos', title: 'Puntos del orden de mérito', value: (r) => r.points },
        ],
        (r) => ({ name: r.name, playerId: r.id }),
      ),
    ],
    Date.now() - 31 * DAY,
  );
  const award = (n: number, kind: 'campeon' | 'subcampeon', label: string, playerId: string, name: string) => ({
    id: `00000000-0000-7000-8000-00000000a5b${n}`,
    kind,
    label,
    name,
    playerId,
    teamId: null,
    note: null,
  });
  return [
    { id: SEASON_ACTIVE, name: 'Temporada de Golf 2', startsOn: dayFrom(-30), endsOn: dayFrom(90), status: 'active', closedAt: null, closedBy: null, standings: null, awards: [], playoffs: [] },
    {
      id: SEASON_CLOSED,
      name: 'Temporada de Golf 1',
      startsOn: dayFrom(-200),
      endsOn: dayFrom(-31),
      status: 'closed',
      closedAt,
      closedBy: uid,
      standings: snapshot,
      awards: [award(1, 'campeon', 'Campeón', G_ONE, 'Golfista Uno'), award(2, 'subcampeon', 'Subcampeón', G_ME, 'Juan Pérez')],
      playoffs: [],
    },
  ];
}

// ---------- Las RPC ----------

const FNS = [
  'golf_save_course',
  'golf_delete_course',
  'golf_create_round',
  'golf_create_tournament',
  'golf_delete_tournament',
  'golf_update_round',
  'golf_close_round',
  'golf_register',
  'golf_add_players',
  'golf_unregister',
  'golf_set_groups',
  'golf_set_dq',
  'golf_save_hole_scores',
  'golf_sign_card',
  'delete_event',
  'league_seasons',
  'league_champions',
];

type Hole = { i: number; s: number | null; p: number | null; u: boolean };

/**
 * Las RPC del golf en «Golf de Ejemplo». `read`: la capa de abajo sin filtros (la liga con sus jugadores, miembros y
 * eventos). undefined si la función no es del golf o no es de la liga de golf ficticia (sigue demoBackend).
 */
export function golfRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  if (!FNS.includes(fn)) return undefined;

  if (fn === 'league_seasons' || fn === 'league_champions') {
    if (a.p_league !== DEMO_GOLF) return undefined;
    const list = golfSeasons(uid);
    if (fn === 'league_seasons') return list;
    return list
      .filter((x) => x.status === 'closed')
      .map((x) => {
        const champ = x.awards.find((w) => w.kind === 'campeon');
        return {
          seasonId: x.id,
          name: x.name,
          startsOn: x.startsOn,
          endsOn: x.endsOn,
          closedAt: x.closedAt,
          champion: champ ? { label: champ.label, name: champ.name, playerId: champ.playerId, teamId: champ.teamId } : null,
          awards: x.awards.map(({ id: _id, ...rest }) => rest),
        };
      });
  }

  const s = load();
  const view = (t: string) => overlay(s, t, read) ?? read(t) ?? [];
  const isAdmin = view('memberships').some((m) => m.league_id === DEMO_GOLF && m.user_id === uid && (m.role === 'owner' || m.role === 'admin'));
  const myPlayer = (view('memberships').find((m) => m.league_id === DEMO_GOLF && m.user_id === uid)?.player_id as string | undefined) ?? null;
  const requireAdmin = () => {
    if (!isAdmin) fail('no_permitido', 'permission');
  };
  const roundOf = (eventId: unknown) => view('golf_rounds').find((r) => r.event_id === eventId) ?? null;
  const eventOf = (eventId: unknown) => view('events').find((e) => e.id === eventId && e.league_id === DEMO_GOLF) ?? null;
  const cardOf = (cardId: unknown) => view('golf_cards').find((c) => c.id === cardId) ?? null;
  const courseOf = (id: unknown) => view('golf_courses').find((c) => c.id === id && c.league_id === DEMO_GOLF) ?? null;
  const commit = <T,>(out: T): T => {
    save(s);
    return out;
  };

  /** Handicap de campo (sin redondear) y de juego de una tarjeta (golf_refresh_hcp de la base). */
  const withHcp = (card: Row, round: Row): Row => {
    const index = card.hcp_index as number | null;
    if (index == null) return { ...card, course_hcp: 0, playing_hcp: 0 };
    const comp = round.competition as { allowance?: number };
    const info = handicapFor(index, round.course as GolfCourse, card.tee_id as string, { nine: round.nine as 'all', allowance: comp.allowance ?? DEFAULT_ALLOWANCE });
    return { ...card, course_hcp: info.courseHcp, playing_hcp: info.playingHcp };
  };
  /** El Index del perfil del jugador (players.attrs.golf). */
  const profileIndex = (playerId: string) => {
    const attrs = view('players').find((p) => p.id === playerId)?.attrs as { golf?: { index?: number } } | null | undefined;
    return typeof attrs?.golf?.index === 'number' ? attrs.golf.index : null;
  };
  const started = (c: Row) => (c.strokes as (number | null)[]).some((x) => x != null) || (c.picked_up as boolean[]).some(Boolean);
  const writeHoles = (c: Row, holes: unknown, n: number): Row => {
    if (!Array.isArray(holes)) invalid();
    const strokes = [...(c.strokes as (number | null)[])];
    const putts = [...(c.putts as (number | null)[])];
    const picked = [...(c.picked_up as boolean[])];
    for (const h of holes as Hole[]) {
      if (!Number.isInteger(h.i) || h.i < 0 || h.i >= n) invalid();
      if (h.u) {
        strokes[h.i] = null;
        putts[h.i] = null;
        picked[h.i] = true;
      } else {
        if (h.s != null && (h.s < 1 || h.s > 20)) invalid();
        strokes[h.i] = h.s;
        putts[h.i] = h.p;
        picked[h.i] = false;
      }
    }
    return { ...c, strokes, putts, picked_up: picked, scored_at: c.scored_at ?? iso() };
  };

  // ---------- Campos ----------

  if (fn === 'golf_save_course') {
    if (a.p_league !== DEMO_GOLF) return undefined;
    requireAdmin();
    const name = typeof a.p_name === 'string' ? a.p_name.trim().replace(/\s+/g, ' ') : '';
    if (!name || !Array.isArray(a.p_holes) || !Array.isArray(a.p_tees) || !a.p_tees.length) invalid();
    const id = typeof a.p_id === 'string' ? a.p_id : uuidv7();
    if (!courseOf(id) && view('golf_courses').filter((c) => c.league_id === DEMO_GOLF).length >= 30) invalid();
    s.courses[id] = { id, league_id: DEMO_GOLF, name, holes: a.p_holes, tees: a.p_tees };
    return commit(id);
  }
  if (fn === 'golf_delete_course') {
    if (!courseOf(a.p_course)) return undefined;
    requireAdmin();
    s.courses[a.p_course as string] = null;
    return commit(null);
  }

  // ---------- Rondas y torneos ----------

  const createRound = (p: { id: string; date: string; course: unknown; name: string; nine: string; startTime: unknown; competition: unknown; shotgun: boolean; tournament: string | null }) => {
    if (!p.date || !['all', 'front', 'back'].includes(p.nine)) invalid();
    const c = courseOf(p.course) ?? fail('no_existe', 'not_found');
    const course: GolfCourse = { id: c.id as string, name: c.name as string, holes: c.holes as GolfCourse['holes'], tees: c.tees as GolfCourse['tees'] };
    // Con torneo, la siguiente ronda de ese torneo.
    const roundNo = p.tournament ? view('golf_rounds').filter((r) => r.tournament_id === p.tournament).length + 1 : null;
    const startTime = typeof p.startTime === 'string' && p.startTime ? (p.startTime.length === 5 ? `${p.startTime}:00` : p.startTime) : null;
    s.events[p.id] = eventRow(p.id, p.date, p.name.trim(), startTime);
    const competition = p.competition && typeof p.competition === 'object' ? p.competition : { format: 'stroke', basis: 'net', allowance: DEFAULT_ALLOWANCE };
    s.rounds[p.id] = roundRow(p.id, course, { nine: p.nine, competition, shotgun: p.shotgun, tournament_id: p.tournament, round_no: roundNo, holes: roundHoles(course, p.nine) });
    return p.id;
  };

  if (fn === 'golf_create_round') {
    if (a.p_league !== DEMO_GOLF) return undefined;
    requireAdmin();
    const id = createRound({
      id: typeof a.p_id === 'string' ? a.p_id : uuidv7(),
      date: String(a.p_date ?? ''),
      course: a.p_course,
      name: String(a.p_name ?? ''),
      nine: String(a.p_nine ?? 'all'),
      startTime: a.p_start_time,
      competition: a.p_competition,
      shotgun: a.p_shotgun === true,
      tournament: (a.p_tournament as string | null) ?? null,
    });
    return commit(id);
  }
  if (fn === 'golf_create_tournament') {
    if (a.p_league !== DEMO_GOLF) return undefined;
    requireAdmin();
    const name = typeof a.p_name === 'string' ? a.p_name.trim() : '';
    const dates = Array.isArray(a.p_dates) ? (a.p_dates as string[]) : [];
    const ids = Array.isArray(a.p_event_ids) ? (a.p_event_ids as string[]) : dates.map(() => uuidv7());
    if (!name || dates.length < 1 || dates.length > 6 || dates.some((d) => !d) || ids.length !== dates.length) invalid();
    const tid = typeof a.p_id === 'string' ? a.p_id : uuidv7();
    s.tournaments[tid] = { id: tid, league_id: DEMO_GOLF, name };
    dates.forEach((date, i) =>
      createRound({
        id: ids[i],
        date,
        course: a.p_course,
        name: dates.length === 1 ? name : `${name} · Ronda ${i + 1}`,
        nine: String(a.p_nine ?? 'all'),
        startTime: null,
        competition: a.p_competition,
        shotgun: a.p_shotgun === true,
        tournament: tid,
      }),
    );
    // El número de cada ronda, en el orden de sus fechas como las dio el admin.
    ids.forEach((id, i) => (s.rounds[id] = { ...s.rounds[id]!, round_no: i + 1 }));
    return commit({ tournament_id: tid, event_ids: ids });
  }
  if (fn === 'golf_delete_tournament') {
    const t = view('golf_tournaments').find((x) => x.id === a.p_tournament && x.league_id === DEMO_GOLF);
    if (!t) return undefined;
    requireAdmin();
    for (const r of view('golf_rounds').filter((x) => x.tournament_id === t.id)) s.events[r.event_id as string] = null;
    s.tournaments[t.id as string] = null;
    return commit(null);
  }
  if (fn === 'delete_event') {
    const ev = eventOf(a.p_event);
    if (!ev) return undefined;
    requireAdmin();
    s.events[ev.id as string] = null;
    return commit(null);
  }
  if (fn === 'golf_update_round') {
    const ev = eventOf(a.p_event);
    if (!ev) return undefined;
    requireAdmin();
    const patch = (a.p_patch ?? {}) as Row;
    if (typeof patch !== 'object' || Object.keys(patch).some((k) => !['course', 'nine', 'competition', 'shotgun'].includes(k))) invalid();
    const c = 'course' in patch ? (courseOf(patch.course) ?? fail('no_existe', 'not_found')) : null;
    const copy: GolfCourse | null = c ? { id: c.id as string, name: c.name as string, holes: c.holes as GolfCourse['holes'], tees: c.tees as GolfCourse['tees'] } : null;
    const round = roundOf(ev.id);
    if (!round) {
      if (!copy) invalid();
      s.rounds[ev.id as string] = roundRow(ev.id as string, copy!, {
        nine: (patch.nine as string | undefined) ?? 'all',
        ...('competition' in patch ? { competition: patch.competition } : {}),
        shotgun: patch.shotgun === true,
      });
      return commit(null);
    }
    if (round.status !== 'abierta') fail('cerrado');
    const nine = (patch.nine as string | undefined) ?? (round.nine as string);
    const cards = view('golf_cards').filter((x) => x.event_id === ev.id);
    if ((copy || nine !== round.nine) && cards.some(started)) invalid();
    const course = copy ?? (round.course as GolfCourse);
    const next: Row = {
      ...round,
      ...(copy ? { course_id: copy.id, course: copy, course_name: copy.name } : {}),
      nine,
      holes: roundHoles(course, nine),
      ...('competition' in patch ? { competition: patch.competition } : {}),
      ...('shotgun' in patch ? { shotgun: patch.shotgun === true } : {}),
    };
    s.rounds[ev.id as string] = next;
    const resize = !!copy || 'nine' in patch;
    for (const x of cards) {
      let card = x;
      if (resize) {
        // Campo u hoyos nuevos: tarjetas vacías del tamaño nuevo y, si su salida ya no existe, la primera.
        const n = roundHoles(course, nine);
        card = {
          ...card,
          tee_id: course.tees.some((t) => t.id === card.tee_id) ? card.tee_id : course.tees[0]?.id,
          strokes: Array(n).fill(null),
          putts: Array(n).fill(null),
          picked_up: Array(n).fill(false),
          start_hole: firstHole(course, nine),
          status: 'abierta',
          signed_at: null,
          scored_at: null,
        };
      }
      s.cards[x.id as string] = withHcp(card, next);
    }
    return commit(null);
  }
  if (fn === 'golf_close_round') {
    const round = roundOf(a.p_event);
    if (!round || round.league_id !== DEMO_GOLF) return undefined;
    requireAdmin();
    const closed = a.p_closed !== false;
    s.rounds[round.event_id as string] = { ...round, status: closed ? 'cerrada' : 'abierta', closed_at: closed ? iso() : null };
    return commit(null);
  }

  // ---------- Inscripciones y grupos ----------

  const register = (eventId: unknown, playerArg: unknown, tee: unknown, index: unknown): string => {
    const round = roundOf(eventId) ?? invalid();
    const player = (playerArg as string | null) ?? myPlayer;
    if (!player || (player !== myPlayer && !isAdmin)) fail('no_permitido', 'permission');
    if (round.status !== 'abierta') fail('cerrado');
    if (!view('players').some((p) => p.id === player && p.league_id === DEMO_GOLF)) fail('no_existe', 'not_found');
    if (index != null && (typeof index !== 'number' || !isValidIndex(index))) invalid();
    const course = round.course as GolfCourse;
    if (tee != null && !course.tees.some((t) => t.id === tee)) invalid();
    const current = view('golf_cards').find((c) => c.event_id === eventId && c.player_id === player);
    const round1 = (v: number) => Math.round(v * 10) / 10;
    if (!current) {
      const n = roundHoles(course, round.nine as string);
      const id = uuidv7();
      const idx = (index as number | null) ?? profileIndex(player!);
      const card: Row = {
        id,
        league_id: DEMO_GOLF,
        event_id: eventId,
        player_id: player,
        tee_id: (tee as string | null) ?? course.tees[0]?.id,
        hcp_index: idx == null ? null : round1(idx),
        course_hcp: 0,
        playing_hcp: 0,
        group_no: null,
        start_hole: firstHole(course, round.nine as string),
        strokes: Array(n).fill(null),
        putts: Array(n).fill(null),
        picked_up: Array(n).fill(false),
        status: 'abierta',
        signed_at: null,
        scored_at: null,
        dq: false,
      };
      s.cards[id] = withHcp(card, round);
      return id;
    }
    if (!isAdmin && (current.status === 'firmada' || current.scored_at != null || started(current))) fail('cerrado');
    s.cards[current.id as string] = withHcp({ ...current, tee_id: (tee as string | null) ?? current.tee_id, hcp_index: index == null ? current.hcp_index : round1(index as number) }, round);
    return current.id as string;
  };

  if (fn === 'golf_register') {
    if (!eventOf(a.p_event)) return undefined;
    return commit(register(a.p_event, a.p_player, a.p_tee, a.p_index));
  }
  if (fn === 'golf_add_players') {
    if (!eventOf(a.p_event)) return undefined;
    requireAdmin();
    const list = Array.isArray(a.p_players) ? (a.p_players as { player_id?: string; tee_id?: string; index?: number }[]) : invalid();
    let count = 0;
    for (const x of list) {
      if (!x.player_id) invalid();
      if (view('golf_cards').some((c) => c.event_id === a.p_event && c.player_id === x.player_id)) continue;
      register(a.p_event, x.player_id, x.tee_id ?? null, typeof x.index === 'number' ? x.index : null);
      count++;
    }
    return commit(count);
  }
  if (fn === 'golf_unregister') {
    const card = cardOf(a.p_card);
    if (!card) return undefined;
    if (!isAdmin && card.player_id !== myPlayer) fail('no_permitido', 'permission');
    if (roundOf(card.event_id)?.status !== 'abierta') fail('cerrado');
    if (!isAdmin && (card.status === 'firmada' || card.scored_at != null || started(card))) fail('cerrado');
    s.cards[card.id as string] = null;
    return commit(null);
  }
  if (fn === 'golf_set_groups') {
    const round = roundOf(a.p_event);
    if (!round || round.league_id !== DEMO_GOLF) return undefined;
    requireAdmin();
    if (round.status !== 'abierta') fail('cerrado');
    if (!Array.isArray(a.p_groups)) invalid();
    const course = round.course as GolfCourse;
    for (const g of a.p_groups as { card_id: string; group_no?: number | null; start_hole?: number | null }[]) {
      const card = cardOf(g.card_id);
      if (!card || card.event_id !== a.p_event) invalid();
      const next = { ...card! };
      if ('group_no' in g) {
        if (g.group_no != null && (!Number.isInteger(g.group_no) || g.group_no < 1 || g.group_no > 99)) invalid();
        next.group_no = g.group_no ?? null;
      }
      if ('start_hole' in g) {
        if (g.start_hole != null && (!Number.isInteger(g.start_hole) || g.start_hole < 1 || g.start_hole > 18)) invalid();
        next.start_hole = g.start_hole ?? firstHole(course, round.nine as string);
      }
      s.cards[card!.id as string] = next;
    }
    const sizes = new Map<number, number>();
    for (const c of overlay(s, 'golf_cards', read)!.filter((x) => x.event_id === a.p_event)) {
      if (c.group_no != null) sizes.set(c.group_no as number, (sizes.get(c.group_no as number) ?? 0) + 1);
    }
    if ([...sizes.values()].some((n) => n > 4)) invalid();
    return commit(null);
  }
  if (fn === 'golf_set_dq') {
    const card = cardOf(a.p_card);
    if (!card) return undefined;
    requireAdmin();
    if (roundOf(card.event_id)?.status !== 'abierta') fail('cerrado');
    s.cards[card.id as string] = { ...card, dq: a.p_dq === true };
    return commit(null);
  }

  // ---------- La tarjeta en el campo ----------

  if (fn === 'golf_save_hole_scores') {
    const round = roundOf(a.p_event);
    if (!round || round.league_id !== DEMO_GOLF) return undefined;
    if (round.status !== 'abierta') fail('cerrado');
    const mine = view('golf_cards').find((c) => c.event_id === a.p_event && c.player_id === myPlayer) ?? null;
    const n = roundHoles(round.course as GolfCourse, round.nine as string);
    let count = 0;
    for (const x of (Array.isArray(a.p_cards) ? a.p_cards : invalid()) as { card_id: string; holes: Hole[] }[]) {
      const card = cardOf(x.card_id);
      if (!card || card.event_id !== a.p_event) invalid();
      if (!isAdmin && card!.id !== mine?.id && (mine?.group_no == null || card!.group_no !== mine.group_no)) fail('no_permitido', 'permission');
      if (card!.status === 'firmada' && !isAdmin) fail('cerrado');
      s.cards[card!.id as string] = writeHoles(card!, x.holes, n);
      count += x.holes.length;
    }
    return commit(count);
  }
  if (fn === 'golf_sign_card') {
    const card = cardOf(a.p_card);
    if (!card) return undefined;
    const signed = a.p_signed !== false;
    const own = card.player_id === myPlayer;
    if (signed ? !own && !isAdmin : !isAdmin) fail('no_permitido', 'permission');
    const round = roundOf(card.event_id)!;
    if (round.status !== 'abierta') fail('cerrado');
    if (!signed) {
      s.cards[card.id as string] = { ...card, status: 'abierta', signed_at: null };
      return commit(null);
    }
    if (card.status === 'firmada') return null;
    const n = roundHoles(round.course as GolfCourse, round.nine as string);
    const written = a.p_holes != null ? writeHoles(card, a.p_holes, n) : card;
    if ((written.strokes as (number | null)[]).some((x, i) => x == null && !(written.picked_up as boolean[])[i])) invalid();
    s.cards[card.id as string] = { ...written, status: 'firmada', signed_at: iso() };
    return commit(null);
  }
  return undefined;
}
