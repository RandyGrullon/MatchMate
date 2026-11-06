/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): una liga de natación ficticia para probar el inicio,
 * el encuentro (pruebas, series, resultados, puntos), el cronómetro por serie, los Puntos y Mis marcas sin el Supabase
 * real. La cuenta de prueba es la dueña de la liga, nada (con marcas de dos encuentros cerrados) y entrena el «Club de
 * Ejemplo». Hoy hay un encuentro en juego con la hoja de series publicada (una serie ya cronometrada) y en dos semanas un
 * control de marcas. Lo que cambia (inscribir, sacar, publicar una serie) se guarda en sessionStorage y se borra al salir
 * de la demostración (forgetDemoSwim). Todos los datos son ficticios.
 *
 * Se junta con las demás tablas de la demostración: `swimTables(uid)` da las filas por tabla (las de `leagues`,
 * `memberships`, `players` y `events` se suman a las que ya hay) y `swimRpc(uid, fn, args)` contesta las RPC de
 * natación que usa la app (undefined si no es de esta liga).
 */
import { uuidv7 } from '@mm/lib/db/ids';
import { toIsoDate } from '@mm/lib/format';

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

// Encuentros: dos cerrados (hace 14 y 7 días), el de hoy (en juego) y un control de marcas en 14 días.
const M_OLD = id('2', 1);
const M_PAST = id('2', 2);
const M_TODAY = id('2', 3);
const M_NEXT = id('2', 4);

const day = (n: number) => toIsoDate(new Date(Date.now() + n * DAY));
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

/** Las pruebas de un encuentro de club (abiertas, piscina de 25): 50 libre F y M, 50 espalda y 100 libre mixtas. */
const clubEvents = (meet: string, base: number): Row[] =>
  (
    [
      [50, 'libre', 'F'],
      [50, 'libre', 'M'],
      [50, 'espalda', 'X'],
      [100, 'libre', 'X'],
    ] as const
  ).map(([distance, stroke, gender], k) => ({
    id: id('3', base + k),
    league_id: DEMO_SWIM,
    event_id: meet,
    num: k + 1,
    distance,
    stroke,
    pool: 25,
    gender,
    age_groups: [],
  }));

const EVENTS: Row[] = [
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
  ).map(([distance, stroke], k) => ({ id: id('3', 31 + k), league_id: DEMO_SWIM, event_id: M_NEXT, num: k + 1, distance, stroke, pool: 25, gender: 'X', age_groups: [] })),
];

/** El id de la prueba `num` (1–4) de un encuentro de club. */
const ev = (meet: string, num: number) => id('3', (meet === M_OLD ? 1 : meet === M_PAST ? 11 : 21) + num - 1);

interface Lane {
  player: string;
  heat: number;
  lane: number;
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
  ];
}

function load(): Row[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Row[];
  } catch {
    // sin sessionStorage: lo de fábrica
  }
  return seedEntries();
}

function save(rows: Row[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(rows));
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

const swimMeet = (eventId: string, published: string | null, finalized: string | null): Row => ({
  event_id: eventId,
  league_id: DEMO_SWIM,
  pool: 25,
  lanes: 6,
  points: POINTS,
  age_groups: 'cccan',
  heats_published_at: published,
  finalized_at: finalized,
});

const PLAYERS: [string, string][] = [
  [P1, 'Nadador Uno'],
  [P2, 'Nadadora Dos'],
  [P3, 'Nadador Tres'],
  [P4, 'Nadadora Cuatro'],
  [P5, 'Nadador Cinco'],
  [P6, 'Nadadora Seis'],
  [P7, 'Nadador Siete'],
];

/** Las filas de la liga de natación ficticia, por tabla. */
export function swimTables(uid: string): Record<string, Row[]> {
  const year = Number(day(0).slice(0, 4));
  const swimEntries = load();
  const swimmersOf = (meet: string) => new Set(swimEntries.filter((e) => e.event_id === meet).map((e) => e.player_id)).size;
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
        tz: 'America/Santo_Domingo',
        logo_path: null,
        rules: { pool: 25, lanes: 6, points: POINTS, ageGroups: 'cccan' },
        created_at: iso(-60 * DAY),
      },
    ],
    memberships: [{ league_id: DEMO_SWIM, user_id: uid, role: 'owner', is_scorer: false, display_name: 'Juan Pérez', player_id: ME, scorer_only: false }],
    players: [
      { id: ME, league_id: DEMO_SWIM, user_id: uid, name: 'Juan Pérez', average_override: null, is_minor: false, attrs: null },
      ...PLAYERS.map(([pid, name]) => ({ id: pid, league_id: DEMO_SWIM, user_id: null, name, average_override: null, is_minor: false, attrs: null })),
    ],
    events: [
      meetEvent(M_OLD, 'encuentro', 'Copa de Ejemplo', day(-14), { player_count: swimmersOf(M_OLD) }),
      meetEvent(M_PAST, 'encuentro', '', day(-7), { player_count: swimmersOf(M_PAST) }),
      meetEvent(M_TODAY, 'encuentro', 'Festival de Ejemplo', day(0), {
        start_time: '08:00:00',
        announcement: 'Calentamiento a las 7:30 a. m. en los carriles de la orilla.',
        player_count: swimmersOf(M_TODAY),
      }),
      meetEvent(M_NEXT, 'control', '', day(14)),
    ],
    swim_meets: [swimMeet(M_OLD, iso(-15 * DAY), iso(-14 * DAY)), swimMeet(M_PAST, iso(-8 * DAY), iso(-7 * DAY)), swimMeet(M_TODAY, iso(-2 * 3_600_000), null), swimMeet(M_NEXT, null, null)],
    swim_events: EVENTS,
    swim_entries: swimEntries,
    // Por nombre, como la base.
    swim_clubs: [
      { id: CLUB_B, league_id: DEMO_SWIM, name: 'Club Acuático de Prueba', short: 'CAP', color: '#16a34a', coach_id: null },
      { id: CLUB_A, league_id: DEMO_SWIM, name: 'Club de Ejemplo', short: 'CDE', color: '#2563eb', coach_id: uid },
      { id: CLUB_C, league_id: DEMO_SWIM, name: 'Club Delfines Ficticios', short: 'CDF', color: '#f59e0b', coach_id: null },
    ],
    swim_swimmers: [ME, ...PLAYERS.map(([pid]) => pid)].map((pid) => ({ player_id: pid, league_id: DEMO_SWIM, club_id: CLUB_OF[pid] ?? null, category: AGE, category_year: year })),
  };
}

/**
 * Las RPC de natación de la app, como las de la base (20260927000500_natacion.sql), sobre las inscripciones guardadas:
 * - `swim_record_heat` (publicar una serie): guarda tiempo, estado y cuándo; devuelve cuántos carriles.
 * - `swim_enter` (inscribirse o cambiar la siembra): devuelve cuántos entraron o cambiaron.
 * - `swim_unenter` (sacar de una prueba antes de nadar): true.
 * undefined si no es de esta liga.
 */
export function swimRpc(_uid: string, fn: string, a: Record<string, unknown>): unknown {
  if (fn !== 'swim_record_heat' && fn !== 'swim_enter' && fn !== 'swim_unenter') return undefined;
  const rows = load();
  if (fn === 'swim_unenter') {
    const i = rows.findIndex((e) => e.id === a.p_entry);
    if (i < 0) return undefined;
    if (rows[i].time_cs != null || rows[i].result_at != null) throw new Error('invalido');
    rows.splice(i, 1);
    save(rows);
    return true;
  }
  const se = EVENTS.find((e) => e.id === a.p_swim_event);
  if (!se) return undefined;
  if (fn === 'swim_record_heat') {
    const results = Array.isArray(a.p_results) ? (a.p_results as { entry_id?: unknown; time_cs?: unknown; status?: unknown }[]) : [];
    let n = 0;
    for (const r of results) {
      const e = rows.find((x) => x.id === r.entry_id && x.swim_event_id === se.id && x.heat === a.p_heat);
      if (!e) continue;
      const status = typeof r.status === 'string' ? r.status : 'ok';
      const time = typeof r.time_cs === 'number' ? r.time_cs : null;
      e.time_cs = time;
      e.status = status;
      e.result_at = status === 'ok' && time == null ? null : iso();
      n++;
    }
    save(rows);
    return n;
  }
  // swim_enter
  const list = Array.isArray(a.p_entries) ? (a.p_entries as { player_id?: unknown; seed_cs?: unknown }[]) : [];
  let n = 0;
  for (const x of list) {
    if (typeof x.player_id !== 'string') continue;
    const seed = typeof x.seed_cs === 'number' ? x.seed_cs : null;
    const had = rows.find((e) => e.swim_event_id === se.id && e.player_id === x.player_id);
    if (had) {
      if (had.time_cs != null || had.result_at != null) continue;
      had.seed_cs = seed;
    } else {
      rows.push({
        id: uuidv7(),
        league_id: DEMO_SWIM,
        event_id: se.event_id,
        swim_event_id: se.id,
        player_id: x.player_id,
        club_id: CLUB_OF[x.player_id] ?? null,
        age_group: AGE,
        seed_cs: seed,
        heat: null,
        lane: null,
        time_cs: null,
        status: 'ok',
        result_at: null,
      });
    }
    n++;
  }
  save(rows);
  return n;
}
