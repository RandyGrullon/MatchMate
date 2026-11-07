/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): una liga de natación ficticia para probar el inicio,
 * el encuentro (pruebas, series, resultados, puntos), el cronómetro por serie, los Puntos y Mis marcas sin el Supabase
 * real, y lo del organizador: crear, cambiar, finalizar, abrir y borrar encuentros, armar el programa, armar y publicar
 * la hoja de series, inscribir a cualquiera, los clubes y los nadadores. La cuenta de prueba es la dueña de la liga, nada
 * (con marcas de dos encuentros cerrados) y entrena el «Club de Ejemplo». Hoy hay un encuentro en juego con la hoja de
 * series publicada (una serie ya cronometrada), en dos semanas un control de marcas y en tres semanas un encuentro sin
 * series (para armarlas). Dos miembros más (uno cronometra). La liga tiene las transmisiones en vivo prendidas.
 *
 * Lo que cambia se guarda en sessionStorage y se borra al salir de la demostración (forgetDemoSwim). Todos los datos son
 * ficticios.
 *
 * Se junta con las demás tablas de la demostración (demoLeague.ts): `swimTables(uid)` da las filas por tabla (las de
 * `leagues`, `memberships`, `players` y `events` se suman a las que ya hay) y `swimRpc(uid, fn, args)` contesta las RPC
 * de natación que usa la app (undefined si no es de esta liga), como las de la base (20260927000500_natacion.sql).
 */
import { BackendError } from '@mm/lib/backend/types';
import { uuidv7 } from '@mm/lib/db/ids';
import { toIsoDate } from '@mm/lib/format';
import { groupForMeet } from '@mm/pages/sports/swimming/logic';
import { validateSwimEvent, type SwimDistance, type SwimStroke } from '@mm/sports/swimming';
import type { AgeScheme } from '@mm/lib/data/swimming';

type Row = Record<string, unknown>;

const KEY = 'mm-demo-natacion';
const DAY = 86_400_000;
const POINTS = [6, 4, 3, 2, 1];

/** Ids fijos: `00000000-0000-7000-8000-0000005<tipo><número>`. */
const id = (kind: string, n: number) => `00000000-0000-7000-8000-0000005${kind}${String(n).padStart(4, '0')}`;

export const DEMO_SWIM = id('0', 1);

// Nadadores (todos mayores de edad) y clubes.
const ME = id('1', 1);
const P1 = id('1', 2);
const P2 = id('1', 3);
const P3 = id('1', 4);
const P4 = id('1', 5);
const P5 = id('1', 6);
const P6 = id('1', 7);
const P7 = id('1', 8);
const CLUB_A = id('5', 1);
const CLUB_B = id('5', 2);
const CLUB_C = id('5', 3);
const CLUB_OF: Record<string, string> = { [ME]: CLUB_A, [P1]: CLUB_B, [P2]: CLUB_A, [P3]: CLUB_C, [P4]: CLUB_B, [P5]: CLUB_C, [P6]: CLUB_C, [P7]: CLUB_A };
const AGE = '18+';

// Dos cuentas más de la liga: una cronometra; la otra todavía no.
const TIMER = id('6', 1);
const MEMBER = id('6', 2);

// Encuentros: dos cerrados (hace 14 y 7 días), el de hoy (en juego), un control de marcas en 14 días y un encuentro en 21.
const M_OLD = id('2', 1);
const M_PAST = id('2', 2);
const M_TODAY = id('2', 3);
const M_NEXT = id('2', 4);
const M_LATER = id('2', 5);

const day = (n: number) => toIsoDate(new Date(Date.now() + n * DAY));
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

const fail = (code: string, kind: 'validation' | 'not_found' | 'permission' = 'validation'): never => {
  throw new BackendError(code, kind, code);
};

/** Una prueba (fila de swim_events). */
const swimEvent = (n: number, meet: string, num: number, distance: number, stroke: string, gender: string): Row => ({
  id: id('3', n),
  league_id: DEMO_SWIM,
  event_id: meet,
  num,
  distance,
  stroke,
  pool: 25,
  gender,
  age_groups: [],
});

/** Las pruebas de un encuentro de club (abiertas, piscina de 25): 50 libre F y M, 50 espalda y 100 libre mixtas. */
const clubEvents = (meet: string, base: number): Row[] =>
  (
    [
      [50, 'libre', 'F'],
      [50, 'libre', 'M'],
      [50, 'espalda', 'X'],
      [100, 'libre', 'X'],
    ] as const
  ).map(([distance, stroke, gender], k) => swimEvent(base + k, meet, k + 1, distance, stroke, gender));

const seedEvents = (): Row[] => [
  ...clubEvents(M_OLD, 1),
  ...clubEvents(M_PAST, 11),
  ...clubEvents(M_TODAY, 21),
  // El control de marcas: mixtas, una por estilo.
  ...(
    [
      [50, 'libre'],
      [50, 'espalda'],
      [50, 'pecho'],
    ] as const
  ).map(([distance, stroke], k) => swimEvent(31 + k, M_NEXT, k + 1, distance, stroke, 'X')),
  // El de dentro de tres semanas: con inscritos y sin series todavía.
  ...clubEvents(M_LATER, 41).slice(0, 3),
];

/** El id de la prueba `num` (1–4) de un encuentro de club. */
const ev = (meet: string, num: number) => id('3', (meet === M_OLD ? 1 : meet === M_PAST ? 11 : meet === M_TODAY ? 21 : 41) + num - 1);

interface Lane {
  player: string;
  heat: number | null;
  lane: number | null;
  seed: number | null;
  /** Centésimas; null = todavía no nada. */
  time?: number | null;
  status?: 'ok' | 'dq' | 'dns' | 'dnf';
}

let seq = 0;
function entries(meet: string, num: number, lanes: Lane[], resultAt: string | null): Row[] {
  return lanes.map((l) => {
    const swum = l.time != null || (l.status ?? 'ok') !== 'ok';
    return {
      id: id('4', ++seq),
      league_id: DEMO_SWIM,
      event_id: meet,
      swim_event_id: ev(meet, num),
      player_id: l.player,
      club_id: CLUB_OF[l.player] ?? null,
      age_group: AGE,
      seed_cs: l.seed,
      heat: l.heat,
      lane: l.lane,
      time_cs: l.time ?? null,
      status: l.status ?? 'ok',
      result_at: swum ? resultAt : null,
    };
  });
}

/** Lo de fábrica: dos encuentros cerrados con todos los tiempos y el de hoy con la serie 1 del 50 libre M ya cronometrada. */
function seedEntries(): Row[] {
  seq = 0;
  const old = iso(-14 * DAY);
  const past = iso(-7 * DAY);
  const now = iso(-3_600_000);
  return [
    // Hace 14 días.
    ...entries(M_OLD, 1, [
      { player: P6, heat: 1, lane: 2, seed: null, time: 3502 },
      { player: P2, heat: 1, lane: 3, seed: null, time: 3310 },
      { player: P4, heat: 1, lane: 4, seed: null, time: 3189 },
    ], old),
    ...entries(M_OLD, 2, [
      { player: P7, heat: 1, lane: 1, seed: null, time: 3420 },
      { player: P5, heat: 1, lane: 2, seed: null, time: 3350 },
      { player: P1, heat: 1, lane: 3, seed: null, time: 2990 },
      { player: P3, heat: 1, lane: 4, seed: null, time: 3102 },
      { player: ME, heat: 1, lane: 5, seed: null, time: 3245 },
    ], old),
    ...entries(M_OLD, 3, [
      { player: P6, heat: 1, lane: 1, seed: null, time: 4210 },
      { player: ME, heat: 1, lane: 2, seed: null, time: 4012 },
      { player: P4, heat: 1, lane: 3, seed: null, time: 3720 },
      { player: P2, heat: 1, lane: 4, seed: null, time: 3890 },
      { player: P3, heat: 1, lane: 5, seed: null, time: 3975 },
    ], old),
    ...entries(M_OLD, 4, [
      { player: P6, heat: 1, lane: 1, seed: null, time: 7890 },
      { player: P5, heat: 1, lane: 2, seed: null, time: 7604 },
      { player: P1, heat: 1, lane: 3, seed: null, time: 6650 },
      { player: P4, heat: 1, lane: 4, seed: null, time: 7010 },
      { player: ME, heat: 1, lane: 5, seed: null, time: 7420 },
      { player: P7, heat: 1, lane: 6, seed: null, time: 7702 },
    ], old),
    // Hace 7 días (un DQ y un «No salió»).
    ...entries(M_PAST, 1, [
      { player: P6, heat: 1, lane: 2, seed: 3502, time: 3466 },
      { player: P4, heat: 1, lane: 3, seed: 3189, time: 3204 },
      { player: P2, heat: 1, lane: 4, seed: 3310, time: 3265 },
    ], past),
    ...entries(M_PAST, 2, [
      { player: P7, heat: 1, lane: 1, seed: 3420, time: 3415, status: 'dq' },
      { player: ME, heat: 1, lane: 2, seed: 3245, time: 3188 },
      { player: P1, heat: 1, lane: 3, seed: 2990, time: 2975 },
      { player: P3, heat: 1, lane: 4, seed: 3102, time: 3120 },
      { player: P5, heat: 1, lane: 5, seed: 3350, time: 3301 },
    ], past),
    ...entries(M_PAST, 3, [
      { player: P6, heat: 1, lane: 1, seed: 4210, time: 4150 },
      { player: ME, heat: 1, lane: 2, seed: 4012, time: 3950 },
      { player: P4, heat: 1, lane: 3, seed: 3720, time: 3698 },
      { player: P2, heat: 1, lane: 4, seed: 3890, time: 3861 },
      { player: P3, heat: 1, lane: 5, seed: 3975, time: null, status: 'dns' },
    ], past),
    ...entries(M_PAST, 4, [
      { player: P6, heat: 1, lane: 1, seed: 7890, time: 7802 },
      { player: P5, heat: 1, lane: 2, seed: 7604, time: 7550 },
      { player: P1, heat: 1, lane: 3, seed: 6650, time: 6602 },
      { player: P4, heat: 1, lane: 4, seed: 7010, time: 6988 },
      { player: ME, heat: 1, lane: 5, seed: 7420, time: 7311 },
      { player: P7, heat: 1, lane: 6, seed: 7702, time: 7650 },
    ], past),
    // Hoy: la hoja de series publicada; del 50 libre M ya se publicó la serie 1.
    ...entries(M_TODAY, 1, [
      { player: P6, heat: 1, lane: 2, seed: 3466 },
      { player: P4, heat: 1, lane: 3, seed: 3189 },
      { player: P2, heat: 1, lane: 4, seed: 3265 },
    ], null),
    ...entries(M_TODAY, 2, [
      { player: P7, heat: 1, lane: 2, seed: 3420, time: 3399 },
      { player: ME, heat: 1, lane: 3, seed: 3188, time: 3175 },
      { player: P5, heat: 1, lane: 4, seed: 3301, time: 3290 },
    ], now),
    ...entries(M_TODAY, 2, [
      { player: P3, heat: 2, lane: 3, seed: 3102 },
      { player: P1, heat: 2, lane: 4, seed: 2975 },
    ], null),
    ...entries(M_TODAY, 3, [
      { player: P6, heat: 1, lane: 2, seed: 4150 },
      { player: P4, heat: 1, lane: 3, seed: 3698 },
      { player: P2, heat: 1, lane: 4, seed: 3861 },
      { player: ME, heat: 1, lane: 5, seed: 3950 },
    ], null),
    ...entries(M_TODAY, 4, [
      { player: P5, heat: 1, lane: 2, seed: 7550 },
      { player: P1, heat: 1, lane: 3, seed: 6602 },
      { player: P4, heat: 1, lane: 4, seed: 6988 },
      { player: ME, heat: 1, lane: 5, seed: 7311 },
    ], null),
    // En tres semanas: inscritos con su siembra, sin series (para «Armar series»).
    ...entries(M_LATER, 1, [
      { player: P6, heat: null, lane: null, seed: 3466 },
      { player: P4, heat: null, lane: null, seed: 3204 },
      { player: P2, heat: null, lane: null, seed: 3265 },
    ], null),
    ...entries(M_LATER, 2, [
      { player: P7, heat: null, lane: null, seed: 3399 },
      { player: ME, heat: null, lane: null, seed: 3175 },
      { player: P5, heat: null, lane: null, seed: 3290 },
      { player: P3, heat: null, lane: null, seed: 3120 },
      { player: P1, heat: null, lane: null, seed: 2975 },
    ], null),
    ...entries(M_LATER, 3, [
      { player: P4, heat: null, lane: null, seed: 3698 },
      { player: ME, heat: null, lane: null, seed: null },
    ], null),
  ];
}

/** Un encuentro como fila de `events` (las mismas columnas que las demás de la demostración). */
const meetEvent = (eventId: string, type: 'encuentro' | 'control', name: string, date: string, extra: Partial<Row> = {}): Row => ({
  id: eventId,
  league_id: DEMO_SWIM,
  type,
  name,
  date,
  start_time: null,
  games: 1,
  hcp_base: 0,
  hcp_percent: 0,
  individual_rank_by: null,
  team_rank_by: null,
  category_cuts: null,
  team_size: 1,
  announcement: '',
  player_count: 0,
  created_at: iso(-30 * DAY),
  ...extra,
});

const swimMeet = (eventId: string, published: string | null, finalized: string | null, o: { pool?: number; lanes?: number; points?: number[]; ageGroups?: AgeScheme } = {}): Row => ({
  event_id: eventId,
  league_id: DEMO_SWIM,
  pool: o.pool ?? 25,
  lanes: o.lanes ?? 6,
  points: o.points ?? POINTS,
  age_groups: o.ageGroups ?? 'cccan',
  heats_published_at: published,
  finalized_at: finalized,
});

const PLAYERS: [string, string, 'F' | 'M', number][] = [
  [P1, 'Nadador Uno', 'M', 1994],
  [P2, 'Nadadora Dos', 'F', 1996],
  [P3, 'Nadador Tres', 'M', 1990],
  [P4, 'Nadadora Cuatro', 'F', 1998],
  [P5, 'Nadador Cinco', 'M', 1988],
  [P6, 'Nadadora Seis', 'F', 1992],
  [P7, 'Nadador Siete', 'M', 1995],
];

/** Lo que cambia en la demostración: los encuentros, las pruebas, las inscripciones, los clubes y los nadadores. */
interface SwimState {
  events: Row[];
  swimMeets: Row[];
  swimEvents: Row[];
  entries: Row[];
  clubs: Row[];
  /** Los nadadores registrados en la demostración (los de fábrica están en PLAYERS). */
  players: Row[];
  /** Cambios a los jugadores de fábrica (nombre). */
  renamed: Record<string, string>;
  swimmers: Row[];
  priv: Row[];
}

function seed(uid: string): SwimState {
  const year = Number(day(0).slice(0, 4));
  return {
    events: [
      meetEvent(M_OLD, 'encuentro', 'Copa de Ejemplo', day(-14)),
      meetEvent(M_PAST, 'encuentro', '', day(-7)),
      meetEvent(M_TODAY, 'encuentro', 'Festival de Ejemplo', day(0), { start_time: '08:00:00', announcement: 'Calentamiento a las 7:30 a. m. en los carriles de la orilla.' }),
      meetEvent(M_NEXT, 'control', '', day(14)),
      meetEvent(M_LATER, 'encuentro', 'Encuentro de Ejemplo', day(21), { start_time: '09:00:00' }),
    ],
    swimMeets: [
      swimMeet(M_OLD, iso(-15 * DAY), iso(-14 * DAY)),
      swimMeet(M_PAST, iso(-8 * DAY), iso(-7 * DAY)),
      swimMeet(M_TODAY, iso(-2 * 3_600_000), null),
      swimMeet(M_NEXT, null, null),
      swimMeet(M_LATER, null, null),
    ],
    swimEvents: seedEvents(),
    entries: seedEntries(),
    // Por nombre, como la base.
    clubs: [
      { id: CLUB_B, league_id: DEMO_SWIM, name: 'Club Acuático de Prueba', short: 'CAP', color: '#16a34a', coach_id: null },
      { id: CLUB_A, league_id: DEMO_SWIM, name: 'Club de Ejemplo', short: 'CDE', color: '#2563eb', coach_id: uid },
      { id: CLUB_C, league_id: DEMO_SWIM, name: 'Club Delfines Ficticios', short: 'CDF', color: '#f59e0b', coach_id: null },
    ],
    players: [],
    renamed: {},
    swimmers: [ME, ...PLAYERS.map(([pid]) => pid)].map((pid) => ({ player_id: pid, league_id: DEMO_SWIM, club_id: CLUB_OF[pid] ?? null, category: AGE, category_year: year })),
    priv: [
      { player_id: ME, league_id: DEMO_SWIM, birth_year: 1991, sex: 'M', guardian_name: null, consent_at: null },
      ...PLAYERS.map(([pid, , sex, born]) => ({ player_id: pid, league_id: DEMO_SWIM, birth_year: born, sex, guardian_name: null, consent_at: null })),
    ],
  };
}

function load(uid: string): SwimState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SwimState | Row[];
      // Lo guardado antes (solo las inscripciones): lo demás, de fábrica.
      if (Array.isArray(parsed)) return { ...seed(uid), entries: parsed };
      return parsed;
    }
  } catch {
    // sin sessionStorage: lo de fábrica
  }
  return seed(uid);
}

function save(s: SwimState) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sin sessionStorage
  }
}

export function forgetDemoSwim() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

/** Las filas de la liga de natación ficticia, por tabla. */
export function swimTables(uid: string): Record<string, Row[]> {
  const s = load(uid);
  const swimmersOf = (meet: unknown) => new Set(s.entries.filter((e) => e.event_id === meet).map((e) => e.player_id)).size;
  return {
    leagues: [
      {
        id: DEMO_SWIM,
        sport: 'swimming',
        kind: 'liga',
        visibility: 'private',
        name: 'Natación de Ejemplo',
        owner_id: uid,
        venue: 'Piscina de Ejemplo',
        schedule: 'Sábados 8:00 a. m.',
        season_start: null,
        season_end: null,
        contact_name: '',
        contact_phone: '',
        require_photo: false,
        has_minors: false,
        live_enabled: true,
        tz: 'America/Santo_Domingo',
        logo_path: null,
        rules: { pool: 25, lanes: 6, points: POINTS, ageGroups: 'cccan' },
        created_at: iso(-60 * DAY),
      },
    ],
    memberships: [
      { league_id: DEMO_SWIM, user_id: uid, role: 'owner', is_scorer: false, display_name: 'Juan Pérez', player_id: ME, scorer_only: false },
      { league_id: DEMO_SWIM, user_id: TIMER, role: 'member', is_scorer: true, display_name: 'Cronometrista de Ejemplo', player_id: null, scorer_only: false },
      { league_id: DEMO_SWIM, user_id: MEMBER, role: 'member', is_scorer: false, display_name: 'Miembro de Ejemplo', player_id: null, scorer_only: false },
    ],
    players: [
      { id: ME, league_id: DEMO_SWIM, user_id: uid, name: s.renamed[ME] ?? 'Juan Pérez', average_override: null, is_minor: false, attrs: null },
      ...PLAYERS.map(([pid, name]) => ({ id: pid, league_id: DEMO_SWIM, user_id: null, name: s.renamed[pid] ?? name, average_override: null, is_minor: false, attrs: null })),
      ...s.players,
    ],
    events: s.events.map((e) => ({ ...e, player_count: swimmersOf(e.id) })),
    swim_meets: s.swimMeets,
    swim_events: s.swimEvents,
    swim_entries: s.entries,
    swim_clubs: [...s.clubs].sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')),
    swim_swimmers: s.swimmers,
    player_private: s.priv,
  };
}

const SWIM_FNS = [
  'swim_record_heat',
  'swim_enter',
  'swim_unenter',
  'swim_create_meet',
  'swim_update_meet',
  'swim_finalize_meet',
  'swim_save_events',
  'swim_delete_event',
  'swim_publish_heats',
  'swim_save_club',
  'swim_delete_club',
  'swim_register_swimmer',
  'swim_update_swimmer',
  'update_event',
  'delete_event',
];

/** La prueba se puede nadar en esa piscina (validateSwimEvent del motor, como la base). */
const validEvent = (distance: unknown, stroke: unknown, pool: unknown) =>
  typeof distance === 'number' && typeof stroke === 'string' && !validateSwimEvent({ distance: distance as SwimDistance, stroke: stroke as SwimStroke, pool: pool === 50 ? 50 : 25 }).length;

/** Los nadadores con su categoría para el año de hoy (como la base: con el año de nacimiento y las categorías de la liga). */
function categoryOf(birthYear: number | null, scheme: AgeScheme = 'cccan'): string | null {
  return birthYear ? groupForMeet(day(0), scheme, { birthYear }) : null;
}

/**
 * Las RPC de natación de la app, como las de la base (20260927000500_natacion.sql), sobre lo guardado:
 * - `swim_record_heat` (publicar una serie): guarda tiempo, estado y cuándo; devuelve cuántos carriles.
 * - `swim_enter` (inscribir o cambiar la siembra): devuelve cuántos entraron o cambiaron.
 * - `swim_unenter` (sacar de una prueba antes de nadar): true.
 * - `swim_create_meet`, `update_event` y `swim_update_meet` (crear y cambiar el encuentro), `swim_finalize_meet`
 *   (finalizar o volver a abrir) y `delete_event` (borrarlo con todo lo suyo).
 * - `swim_save_events` (agregar o cambiar pruebas; devuelve los ids) y `swim_delete_event` (quitar una con sus inscritos).
 * - `swim_publish_heats` (la hoja de series de las pruebas mandadas; devuelve cuántos carriles).
 * - `swim_save_club` y `swim_delete_club` (sus nadadores quedan sin club).
 * - `swim_register_swimmer` (un nadador sin cuenta; en esta liga no hay menores) y `swim_update_swimmer`.
 * undefined si no es de esta liga (o la función no es de aquí).
 */
export function swimRpc(uid: string, fn: string, a: Record<string, unknown>): unknown {
  if (!SWIM_FNS.includes(fn)) return undefined;
  const s = load(uid);
  const meetOf = (meetId: unknown) => s.swimMeets.find((m) => m.event_id === meetId) ?? null;
  const eventOf = (meetId: unknown) => s.events.find((e) => e.id === meetId) ?? null;
  const done = <T>(r: T): T => {
    save(s);
    return r;
  };

  if (fn === 'swim_unenter') {
    const i = s.entries.findIndex((e) => e.id === a.p_entry);
    if (i < 0) return undefined;
    if (s.entries[i].time_cs != null || s.entries[i].result_at != null) fail('invalido');
    s.entries.splice(i, 1);
    return done(true);
  }

  // ---------- El encuentro ----------
  if (fn === 'swim_create_meet') {
    if (a.p_league !== DEMO_SWIM) return undefined;
    const meetId = String(a.p_id ?? uuidv7());
    const type = a.p_type === 'control' ? 'control' : 'encuentro';
    s.events.push(
      meetEvent(meetId, type, String(a.p_name ?? '').trim(), String(a.p_date ?? day(0)), {
        start_time: typeof a.p_start_time === 'string' && a.p_start_time ? a.p_start_time : null,
        announcement: String(a.p_announcement ?? ''),
        created_at: iso(),
      }),
    );
    s.swimMeets.push(
      swimMeet(meetId, null, null, {
        pool: a.p_pool === 50 ? 50 : 25,
        lanes: typeof a.p_lanes === 'number' ? a.p_lanes : 6,
        points: Array.isArray(a.p_points) ? (a.p_points as number[]) : POINTS,
        ageGroups: a.p_age_groups === 'masters' || a.p_age_groups === 'none' ? a.p_age_groups : 'cccan',
      }),
    );
    return done(null);
  }
  if (fn === 'update_event' || fn === 'delete_event') {
    const e = eventOf(a.p_event);
    if (!e || !meetOf(e.id)) return undefined;
    if (fn === 'delete_event') {
      s.events = s.events.filter((x) => x !== e);
      s.swimMeets = s.swimMeets.filter((m) => m.event_id !== e.id);
      s.swimEvents = s.swimEvents.filter((x) => x.event_id !== e.id);
      s.entries = s.entries.filter((x) => x.event_id !== e.id);
      return done(null);
    }
    const p = (a.p_patch ?? {}) as Row;
    for (const k of ['name', 'date', 'start_time', 'announcement', 'type'] as const) if (k in p) e[k] = k === 'start_time' ? p[k] || null : p[k];
    return done(null);
  }
  if (fn === 'swim_update_meet' || fn === 'swim_finalize_meet' || fn === 'swim_publish_heats') {
    const m = meetOf(a.p_meet);
    if (!m) return undefined;
    if (fn === 'swim_finalize_meet') {
      m.finalized_at = a.p_final === false ? null : iso();
      return done(null);
    }
    if (m.finalized_at) fail('invalido');
    if (fn === 'swim_update_meet') {
      const p = (a.p_patch ?? {}) as Row;
      for (const k of ['pool', 'lanes', 'points', 'age_groups'] as const) if (k in p) m[k] = p[k];
      // La piscina de las pruebas sigue a la del encuentro.
      if ('pool' in p) for (const x of s.swimEvents) if (x.event_id === m.event_id) x.pool = p.pool;
      return done(null);
    }
    // swim_publish_heats: las pruebas mandadas quedan enteras como dice la hoja (los que no salen, sin serie).
    const heats = Array.isArray(a.p_heats) ? (a.p_heats as { swim_event_id?: unknown; lanes?: { entry_id?: unknown; heat?: unknown; lane?: unknown }[] }[]) : [];
    let n = 0;
    for (const h of heats) {
      const mine = s.entries.filter((x) => x.swim_event_id === h.swim_event_id && x.event_id === m.event_id);
      if (mine.some((x) => x.result_at != null || x.time_cs != null)) fail('invalido');
      for (const x of mine) {
        x.heat = null;
        x.lane = null;
      }
      for (const l of h.lanes ?? []) {
        const x = mine.find((y) => y.id === l.entry_id);
        if (!x || typeof l.heat !== 'number' || typeof l.lane !== 'number') continue;
        x.heat = l.heat;
        x.lane = l.lane;
        n++;
      }
    }
    m.heats_published_at = iso();
    return done(n);
  }

  // ---------- El programa ----------
  if (fn === 'swim_save_events') {
    const m = meetOf(a.p_meet);
    if (!m) return undefined;
    if (m.finalized_at) fail('invalido');
    const list = Array.isArray(a.p_events) ? (a.p_events as Row[]) : [];
    const ids: string[] = [];
    for (const x of list) {
      if (!validEvent(x.distance, x.stroke, m.pool)) fail('invalido');
      const had = typeof x.id === 'string' ? s.swimEvents.find((y) => y.id === x.id && y.event_id === m.event_id) : undefined;
      const fields = { distance: x.distance, stroke: x.stroke, gender: x.gender === 'F' || x.gender === 'M' ? x.gender : 'X', age_groups: Array.isArray(x.age_groups) ? x.age_groups : [] };
      if (had) {
        const locked = s.entries.some((e) => e.swim_event_id === had.id && (e.result_at != null || e.time_cs != null));
        if (locked && (had.distance !== fields.distance || had.stroke !== fields.stroke)) fail('invalido');
        Object.assign(had, fields, typeof x.num === 'number' ? { num: x.num } : {});
        ids.push(String(had.id));
      } else {
        const nums = s.swimEvents.filter((y) => y.event_id === m.event_id).map((y) => Number(y.num));
        const newId = typeof x.id === 'string' ? x.id : uuidv7();
        s.swimEvents.push({ id: newId, league_id: DEMO_SWIM, event_id: m.event_id, num: typeof x.num === 'number' ? x.num : Math.max(0, ...nums) + 1, pool: m.pool, ...fields });
        ids.push(newId);
      }
    }
    s.swimEvents.sort((p, q) => Number(p.num) - Number(q.num));
    return done(ids);
  }
  if (fn === 'swim_delete_event') {
    const x = s.swimEvents.find((y) => y.id === a.p_swim_event);
    if (!x) return undefined;
    if (meetOf(x.event_id)?.finalized_at) fail('invalido');
    if (s.entries.some((e) => e.swim_event_id === x.id && (e.result_at != null || e.time_cs != null))) fail('invalido');
    s.swimEvents = s.swimEvents.filter((y) => y !== x);
    s.entries = s.entries.filter((e) => e.swim_event_id !== x.id);
    return done(null);
  }

  // ---------- Clubes ----------
  if (fn === 'swim_save_club') {
    if (a.p_league !== DEMO_SWIM) return undefined;
    const name = String(a.p_name ?? '').trim();
    if (!name || name.length > 60 || String(a.p_short ?? '').length > 8) fail('invalido');
    const club = { id: String(a.p_id ?? uuidv7()), league_id: DEMO_SWIM, name, short: String(a.p_short ?? '').trim(), color: a.p_color ?? null, coach_id: a.p_coach ?? null };
    const i = s.clubs.findIndex((x) => x.id === club.id);
    if (i >= 0) s.clubs[i] = club;
    else s.clubs.push(club);
    return done(null);
  }
  if (fn === 'swim_delete_club') {
    if (!s.clubs.some((x) => x.id === a.p_club)) return undefined;
    s.clubs = s.clubs.filter((x) => x.id !== a.p_club);
    for (const x of s.swimmers) if (x.club_id === a.p_club) x.club_id = null;
    return done(null);
  }

  // ---------- Nadadores ----------
  if (fn === 'swim_register_swimmer') {
    if (a.p_league !== DEMO_SWIM) return undefined;
    const name = String(a.p_name ?? '').trim();
    // En la liga ficticia no hay menores («Liga con menores» apagada).
    if (!name || name.length > 60 || a.p_is_minor === true) fail('invalido');
    const pid = String(a.p_id ?? uuidv7());
    const birthYear = typeof a.p_birth_year === 'number' ? a.p_birth_year : null;
    s.players.push({ id: pid, league_id: DEMO_SWIM, user_id: null, name, average_override: null, is_minor: false, attrs: null });
    s.swimmers.push({ player_id: pid, league_id: DEMO_SWIM, club_id: a.p_club ?? null, category: categoryOf(birthYear), category_year: Number(day(0).slice(0, 4)) });
    s.priv.push({ player_id: pid, league_id: DEMO_SWIM, birth_year: birthYear, sex: a.p_sex ?? null, guardian_name: a.p_guardian_name ?? null, consent_at: null });
    return done(null);
  }
  if (fn === 'swim_update_swimmer') {
    const pid = String(a.p_player ?? '');
    const sw = s.swimmers.find((x) => x.player_id === pid);
    if (!sw) return undefined;
    const p = (a.p_patch ?? {}) as Row;
    let pr = s.priv.find((x) => x.player_id === pid);
    if (!pr) s.priv.push((pr = { player_id: pid, league_id: DEMO_SWIM, birth_year: null, sex: null, guardian_name: null, consent_at: null }));
    if (typeof p.name === 'string') {
      const added = s.players.find((x) => x.id === pid);
      if (added) added.name = p.name;
      else s.renamed[pid] = p.name;
    }
    if ('club_id' in p) sw.club_id = p.club_id ?? null;
    if ('birth_year' in p) {
      pr.birth_year = p.birth_year ?? null;
      sw.category = categoryOf((p.birth_year as number | null) ?? null);
    }
    if ('sex' in p) pr.sex = p.sex ?? null;
    if ('guardian_name' in p) pr.guardian_name = p.guardian_name ?? null;
    if (p.consent === true && !pr.consent_at) pr.consent_at = iso();
    return done(null);
  }

  // ---------- Inscripciones y resultados ----------
  const se = s.swimEvents.find((e) => e.id === a.p_swim_event);
  if (!se) return undefined;
  if (fn === 'swim_record_heat') {
    const results = Array.isArray(a.p_results) ? (a.p_results as { entry_id?: unknown; time_cs?: unknown; status?: unknown }[]) : [];
    let n = 0;
    for (const r of results) {
      const e = s.entries.find((x) => x.id === r.entry_id && x.swim_event_id === se.id && x.heat === a.p_heat);
      if (!e) continue;
      const status = typeof r.status === 'string' ? r.status : 'ok';
      const time = typeof r.time_cs === 'number' ? r.time_cs : null;
      e.time_cs = time;
      e.status = status;
      e.result_at = status === 'ok' && time == null ? null : iso();
      n++;
    }
    return done(n);
  }
  // swim_enter
  const meet = meetOf(se.event_id);
  const meetDate = String(eventOf(se.event_id)?.date ?? day(0));
  if (meet?.finalized_at) fail('invalido');
  const list = Array.isArray(a.p_entries) ? (a.p_entries as { player_id?: unknown; seed_cs?: unknown }[]) : [];
  let n = 0;
  for (const x of list) {
    if (typeof x.player_id !== 'string') continue;
    const seedCs = typeof x.seed_cs === 'number' ? x.seed_cs : null;
    const had = s.entries.find((e) => e.swim_event_id === se.id && e.player_id === x.player_id);
    if (had) {
      if (had.time_cs != null || had.result_at != null) continue;
      had.seed_cs = seedCs;
    } else {
      const sw = s.swimmers.find((y) => y.player_id === x.player_id);
      const pr = s.priv.find((y) => y.player_id === x.player_id);
      const scheme = (meet?.age_groups as AgeScheme | undefined) ?? 'cccan';
      s.entries.push({
        id: uuidv7(),
        league_id: DEMO_SWIM,
        event_id: se.event_id,
        swim_event_id: se.id,
        player_id: x.player_id,
        club_id: sw?.club_id ?? null,
        age_group: groupForMeet(meetDate, scheme, { birthYear: (pr?.birth_year as number | null) ?? null, category: (sw?.category as string | null) ?? null, categoryYear: (sw?.category_year as number | null) ?? null }),
        seed_cs: seedCs,
        heat: null,
        lane: null,
        time_cs: null,
        status: 'ok',
        result_at: null,
      });
    }
    n++;
  }
  return done(n);
}
