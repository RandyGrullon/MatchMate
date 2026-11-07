/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): una liga de pádel ficticia, «Pádel de Ejemplo»,
 * para probar lo del organizador de raqueta sin el Supabase real: «Nuevo» (crear la noche, la liga, el torneo, la liga
 * por cajas y la escalera), Organizar › Parejas y niveles, «•••» de un partido (W.O., aplazar, reprogramar, quién juega,
 * corregir, anular y borrar), «•••» de la noche, la liga y el torneo, las cajas del mes, la escalera (retar, aceptar,
 * cancelar), la página del jugador y cerrar o corregir la temporada. La cuenta de prueba es la dueña y juega.
 *
 * Contesta las RPC de src/lib/data/racket.ts, matches.ts y seasonTeams.ts, y las de racket-formats/data.ts, con la
 * misma forma que la base (solo para esta liga: undefined con lo demás). Lo cambiado se guarda en sessionStorage y se
 * borra al salir de la demostración (forgetDemoRacket). Todos los datos son ficticios.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { uuidv7 } from '@mm/lib/db/ids';
import type { Season, SeasonAward } from '@mm/lib/seasons';
import { DEFAULT_BOX_RULES, boxConfigJson, monthDrafts, monthLabel, monthRange } from '@mm/pages/sports/racket-formats/logic/box';
import { DEFAULT_LADDER, ladderConfigJson } from '@mm/pages/sports/racket-formats/logic/ladder';
import { leagueConfigJson, parseLeagueConfig } from '@mm/pages/sports/racket/logic/league';
import { newNightConfig, nightConfigJson, parseNightConfig, isNightType } from '@mm/pages/sports/racket/logic/night';
import { addDays, todayIn, zonedIso } from '@mm/pages/sports/racket/logic/time';
import { newCategory, parseTourneyConfig, tourneyConfigJson } from '@mm/pages/sports/racket/logic/tourney';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de una tabla de las capas de abajo, sin filtrar (null si no la tienen). */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-raqueta';
const TZ = 'America/Santo_Domingo';
const DAY = 86_400_000;
const rid = (n: string) => `00000000-0000-7000-8000-0000005a${n}`;

/** La liga de pádel ficticia. */
export const DEMO_RACKET = rid('0001');
const ME = rid('0101');
const PLAYERS: [string, string, number | null][] = [
  [ME, 'Juan Pérez', 3.5],
  [rid('0102'), 'Jugador Uno', 3.2],
  [rid('0103'), 'Jugadora Dos', 4.1],
  [rid('0104'), 'Jugador Tres', 3.8],
  [rid('0105'), 'Jugadora Cuatro', 2.9],
  [rid('0106'), 'Jugador Cinco', 3],
  [rid('0107'), 'Jugadora Seis', null],
  [rid('0108'), 'Jugador Siete', 2.5],
];
const P = PLAYERS.map((p) => p[0]);
/** Las cuatro parejas de la temporada: la tuya con Jugador Uno. */
const PAIRS: [string, string, [string, string]][] = [
  [rid('0201'), 'Pérez / Uno', [P[0], P[1]]],
  [rid('0202'), 'Dos / Tres', [P[2], P[3]]],
  [rid('0203'), 'Cuatro / Cinco', [P[4], P[5]]],
  [rid('0204'), 'Seis / Siete', [P[6], P[7]]],
];
const T = PAIRS.map((t) => t[0]);
const EV = { liga: rid('0301'), noche: rid('0302'), torneo: rid('0303'), cajas: rid('0304'), escalera: rid('0305') };
const SEASON = rid('0401');

const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const fail = (message: string, kind: BackendErrorKind, code: string | null = null): never => {
  throw new BackendError(message, kind, code);
};
const isObj = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);

interface State {
  events: Row[];
  matches: Row[];
  sides: Row[];
  mplayers: Row[];
  teams: Row[];
  roster: Row[];
  rungs: Row[];
  challenges: Row[];
  seasons: Season[];
}

// ---------- Lo de fábrica ----------

const today = () => todayIn(TZ);
const at = (date: string, time: string) => zonedIso(date, time, TZ) ?? iso();

function eventRow(id: string, type: string, name: string, date: string, config: Row, startTime: string | null = null): Row {
  return { id, league_id: DEMO_RACKET, type, name, date, start_time: startTime, config, player_count: countOf(type, config), created_at: iso(-30 * DAY), updated_at: iso(-DAY) };
}

/** Lo que cuenta la base: jugadores de la noche o parejas de la liga, el torneo, las cajas o la escalera. */
function countOf(type: string, config: Row): number {
  if (isNightType(type)) return parseNightConfig(config, type).players.length;
  if (type === 'torneo') return parseTourneyConfig(config).categories.reduce((n, c) => n + c.pairs.length, 0);
  if (type === 'cajas') return Array.isArray(config.entrants) ? config.entrants.length : 0;
  if (type === 'escalera') return 0;
  return parseLeagueConfig(config).pairs.length;
}

/** Un partido como lo guarda la base. */
function matchRow(o: { id: string; eventId: string; round?: number | null; stage?: string; court?: string; scheduledAt?: string | null; status?: string; score?: Row | null; winner?: number | null; proposedSide?: number | null; rules?: Row }): Row {
  const status = o.status ?? 'scheduled';
  const done = status === 'confirmed' || status === 'finished';
  return {
    id: o.id,
    league_id: DEMO_RACKET,
    event_id: o.eventId,
    round: o.round ?? null,
    stage: o.stage ?? '',
    bracket_key: null,
    court: o.court ?? '',
    scheduled_at: o.scheduledAt ?? null,
    status,
    format: 'sets',
    require_confirm: true,
    score: o.score ?? null,
    seq: done ? 1 : 0,
    version: 1,
    winner_side: o.winner ?? null,
    walkover_side: null,
    scorer_id: null,
    lease_until: null,
    proposed_by: null,
    proposed_at: done ? iso(-2 * DAY) : null,
    proposed_side: o.proposedSide ?? (done ? 1 : null),
    confirmed_by: status === 'confirmed' ? 'demo' : null,
    confirmed_at: status === 'confirmed' ? iso(-2 * DAY) : null,
    disputed_by: null,
    disputed_at: null,
    dispute_note: null,
    note: null,
    created_by: null,
    series_id: null,
    created_at: iso(-14 * DAY),
    updated_at: iso(-DAY),
    rules: o.rules ?? {},
    state: null,
    history: [],
  };
}

const sets = (text: string): Row => ({ text, sets: text.split(' ').map((s) => s.split('-').map(Number)) });

function seed(): State {
  const s: State = { events: [], matches: [], sides: [], mplayers: [], teams: [], roster: [], rungs: [], challenges: [], seasons: [] };
  PAIRS.forEach(([id, name, players], i) => {
    s.teams.push({ id, league_id: DEMO_RACKET, name, sort_order: i, color: null, season_id: null, event_id: null, created_at: iso(-40 * DAY), updated_at: iso(-40 * DAY) });
    players.forEach((p) => s.roster.push({ league_id: DEMO_RACKET, team_id: id, player_id: p, jersey: null, position: null, role: 'player' }));
  });
  const d = today();

  // La liga de parejas: 2 jornadas jugadas (una por confirmar) y la 3 por jugar.
  const start = addDays(d, -14);
  s.events.push(eventRow(EV.liga, 'liga', 'Liga de Parejas de Ejemplo', start, leagueConfigJson(parseLeagueConfig({ pairs: T, double: false, startDate: start, times: ['20:00'], everyDays: 7, minutes: 90 }, start)), '20:00'));
  const fixtures: [number, string, string, string | null, string, number | null, string][] = [
    [1, T[0], T[1], '6-4 6-3', 'confirmed', 1, start],
    [1, T[2], T[3], '6-2 4-6 10-7', 'confirmed', 1, start],
    [2, T[0], T[2], '7-5 6-4', 'confirmed', 1, addDays(start, 7)],
    [2, T[1], T[3], '3-6 6-4 10-8', 'finished', 1, addDays(start, 7)],
    [3, T[0], T[3], null, 'scheduled', null, d],
    [3, T[1], T[2], null, 'scheduled', null, addDays(d, 2)],
  ];
  fixtures.forEach(([round, a, b, score, status, winner, day], i) => {
    const id = rid(`05${String(i + 1).padStart(2, '0')}`);
    s.matches.push(matchRow({ id, eventId: EV.liga, round, court: `Cancha ${(i % 2) + 1}`, scheduledAt: at(day, '20:00'), status, score: score ? sets(score) : null, winner }));
    addSides(s, id, [a, b]);
  });

  // La noche de americano de hoy (todavía sin ronda 1).
  s.events.push(eventRow(EV.noche, 'americano', 'Americano del jueves', d, nightConfigJson({ ...newNightConfig('americano', { players: P, courts: ['Cancha 1', 'Cancha 2'] }), seed: 'noche:demo' }), '19:00'));

  // El torneo de la semana que viene: una categoría con las cuatro parejas (los grupos y el cuadro se arman en Pro).
  s.events.push(eventRow(EV.torneo, 'torneo', 'Copa de Ejemplo', addDays(d, 7), tourneyConfigJson({ v: 1, format: 'torneo', categories: [{ ...newCategory('A'), pairs: T }], courts: [], points: 'standard' }), '09:00'));

  // La liga por cajas del mes: una caja de cuatro parejas, todos contra todos (dos ya jugados).
  const month = monthRange(d);
  const boxes = [[...T]];
  s.events.push(
    eventRow(
      EV.cajas,
      'cajas',
      'Cajas de Ejemplo',
      month.start,
      boxConfigJson({ v: 1, format: 'cajas', doubles: true, rules: DEFAULT_BOX_RULES, points: 'standard', entrants: [...T], months: [{ n: 1, label: monthLabel(month.start), start: month.start, end: month.end, boxes, closed: false, moves: [] }], round: 1 }),
    ),
  );
  const entrant = (id: string) => ({ id, players: [...(PAIRS.find((x) => x[0] === id)?.[2] ?? [])], team: true });
  monthDrafts(boxes, entrant).forEach((m, i) => {
    const id = rid(`06${String(i + 1).padStart(2, '0')}`);
    const played = i < 2;
    s.matches.push(matchRow({ id, eventId: EV.cajas, round: 1, stage: m.stage, status: played ? 'confirmed' : 'scheduled', score: played ? sets(i === 0 ? '6-3 6-4' : '4-6 6-2 10-5') : null, winner: played ? 1 : null }));
    addSides(s, id, [m.sides[0].teamId!, m.sides[1].teamId!]);
  });

  // La escalera: tú vas 3.º; Seis / Siete retó a Cuatro / Cinco (por aceptar).
  s.events.push(eventRow(EV.escalera, 'escalera', 'Escalera de Ejemplo', addDays(d, -20), ladderConfigJson({ ...DEFAULT_LADDER, doubles: true })));
  [T[1], T[2], T[0], T[3]].forEach((t, i) => s.rungs.push(rungRow(EV.escalera, t, i + 1)));
  s.challenges.push({
    id: rid('0701'),
    league_id: DEMO_RACKET,
    event_id: EV.escalera,
    challenger: T[3],
    challenged: T[2],
    challenger_pos: 4,
    challenged_pos: 2,
    match_id: null,
    status: 'pending',
    accept_by: iso(2 * DAY),
    play_by: iso(7 * DAY),
    accepted_at: null,
    resolved_at: null,
    winner: null,
    note: null,
    created_at: iso(-DAY),
  });

  // La temporada en curso (se cierra en Organizar › Temporada y fechas).
  s.seasons.push({ id: SEASON, name: 'Temporada de Ejemplo', startsOn: addDays(d, -60), endsOn: null, status: 'active', closedAt: null, closedBy: null, standings: null, awards: [], playoffs: [] });
  return s;
}

const rungRow = (eventId: string, entrant: string, position: number): Row => ({
  league_id: DEMO_RACKET,
  event_id: eventId,
  entrant_id: entrant,
  position,
  player_id: T.includes(entrant) ? null : entrant,
  team_id: T.includes(entrant) ? entrant : null,
  joined_at: iso(-20 * DAY),
});

/** Los dos lados de un partido: las parejas (o jugadores) con su nombre y quién juega. */
function addSides(s: State, matchId: string, ids: [string, string], names?: (id: string) => string) {
  ids.forEach((id, i) => {
    const team = s.teams.find((t) => t.id === id);
    const players = team ? s.roster.filter((r) => r.team_id === id).map((r) => String(r.player_id)) : [id];
    s.sides.push({ match_id: matchId, side: i + 1, team_id: team ? id : null, label: team ? String(team.name) : (names?.(id) ?? id), seed: null });
    players.forEach((p) => s.mplayers.push({ match_id: matchId, player_id: p, side: i + 1, position: null, jersey: null, sub: false }));
  });
}

// ---------- Guardado ----------

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
    // sin sessionStorage: sigue en memoria hasta recargar
  }
}

export function forgetDemoRacket() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

// ---------- Lecturas ----------

const fixed = (uid: string): Record<string, Row[]> => ({
  leagues: [
    {
      id: DEMO_RACKET,
      sport: 'padel',
      kind: 'liga',
      visibility: 'private',
      name: 'Pádel de Ejemplo',
      owner_id: uid,
      venue: 'Club de Ejemplo',
      schedule: 'Jueves 7:00 p. m.',
      season_start: null,
      season_end: null,
      contact_name: 'Juan Pérez',
      contact_phone: '809-000-0000',
      require_photo: false,
      has_minors: false,
      tz: TZ,
      logo_path: null,
      rules: {},
      created_at: iso(-90 * DAY),
    },
  ],
  memberships: [{ league_id: DEMO_RACKET, user_id: uid, role: 'owner', is_scorer: false, display_name: 'Juan Pérez', player_id: ME, scorer_only: false }],
  players: PLAYERS.map(([id, name, level]) => ({ id, league_id: DEMO_RACKET, user_id: id === ME ? uid : null, name, average_override: null, is_minor: false, attrs: level != null ? { level } : null })),
});

function mine(s: State, table: string): Row[] | null {
  switch (table) {
    case 'events':
      return [...s.events].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    case 'matches':
      return s.matches;
    case 'match_sides':
      return s.sides;
    case 'match_players':
      return s.mplayers;
    case 'teams':
      return s.teams;
    case 'team_players':
      return s.roster;
    case 'ladder_rungs':
      return s.rungs;
    case 'ladder_challenges':
      return s.challenges;
    case 'event_signups':
      return [];
    default:
      return null;
  }
}

const passes = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    if (f.op === 'eq') return r[f.col] === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
    if (f.op === 'is') return f.value === null ? r[f.col] == null : r[f.col] === f.value;
    if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
    return true;
  });

/**
 * Las filas de `table` de las capas de abajo con las de la liga de pádel ficticia encima (la liga, su dueño, sus
 * jugadores, eventos, partidos, parejas y la escalera), con los filtros (eq, in, is y gt); null si la tabla no es de
 * las que toca esta liga. Va justo encima de la liga ficticia (demoLeague.ts): así los jugadores nuevos y los niveles
 * (demoPlayers.ts) y las reglas del partido (update_league, demoSettings.ts) caen encima de estas filas.
 */
export function demoRacketSelect(uid: string, table: string, filters: readonly Filter[] = [], readBelow: Read): Row[] | null {
  const extra = fixed(uid)[table] ?? mine(load(), table);
  if (!extra) return null;
  return [...(readBelow(table) ?? []), ...extra].filter((r) => passes(r, filters));
}

// ---------- RPC ----------

const RPCS = new Set([
  'create_event',
  'update_event',
  'delete_event',
  'create_season_team',
  'update_season_team',
  'delete_season_team',
  'set_roster',
  'set_walkover',
  'postpone_match',
  'reschedule_match',
  'set_match_players',
  'void_match',
  'delete_match',
  'admin_correct_result',
  'resolve_dispute',
  'finish_match',
  'confirm_result',
  'dispute_result',
  'save_box_month',
  'set_ladder',
  'join_ladder',
  'leave_ladder',
  'create_challenge',
  'accept_challenge',
  'cancel_challenge',
  'sync_ladder',
  'league_seasons',
  'league_champions',
  'close_season',
  'start_season',
]);

const AWARD_LABEL: Record<SeasonAward['kind'], string | null> = {
  campeon: 'Campeón',
  subcampeon: 'Subcampeón',
  tercero: 'Tercer lugar',
  mvp: 'MVP',
  mas_mejorado: 'Más mejorado',
  fair_play: 'Fair play',
  otro: null,
};

/**
 * Las RPC de la liga de pádel ficticia (la misma forma que la base). undefined si no son de esta liga (otro evento,
 * otro partido, otra liga). `read`: todas las capas (para los nombres de los jugadores nuevos).
 */
export function racketRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  if (!RPCS.has(fn)) return undefined;
  const s = load();
  const done = <V>(v: V): V => {
    save(s);
    return v;
  };
  const playerName = (id: string) => String(read('players').find((p) => p.id === id)?.name ?? fixed(uid).players.find((p) => p.id === id)?.name ?? '(jugador)');
  const event = (id: unknown) => s.events.find((e) => e.id === id) ?? null;
  const match = (id: unknown) => s.matches.find((m) => m.id === id) ?? null;
  const bump = (m: Row, patch: Row) => Object.assign(m, patch, { version: Number(m.version) + 1, updated_at: iso() });
  const myEntrants = () => [ME, ...s.roster.filter((r) => r.player_id === ME).map((r) => String(r.team_id))];
  const ladderCfg = (eventId: string) => (event(eventId)?.config ?? {}) as Row;
  const ladderOrder = (eventId: string) =>
    s.rungs
      .filter((r) => r.event_id === eventId)
      .sort((x, y) => Number(x.position) - Number(y.position))
      .map((r) => String(r.entrant_id));
  const setOrder = (eventId: string, order: string[]) => {
    s.rungs = [...s.rungs.filter((r) => r.event_id !== eventId), ...order.map((id, i) => rungRow(eventId, id, i + 1))];
  };
  const addMatch = (eventId: string, draft: Row): string => {
    const id = typeof draft.id === 'string' ? draft.id : uuidv7();
    s.matches.push(
      matchRow({
        id,
        eventId,
        round: typeof draft.round === 'number' ? draft.round : null,
        stage: typeof draft.stage === 'string' ? draft.stage : '',
        court: typeof draft.court === 'string' ? draft.court : '',
        scheduledAt: typeof draft.scheduled_at === 'string' ? draft.scheduled_at : null,
        rules: isObj(draft.rules) ? draft.rules : {},
      }),
    );
    const sides = (Array.isArray(draft.sides) ? draft.sides : []) as Row[];
    sides.forEach((side) => {
      const team = typeof side.team_id === 'string' ? s.teams.find((t) => t.id === side.team_id) : undefined;
      const players = (Array.isArray(side.players) ? side.players : []) as Row[];
      const label = typeof side.label === 'string' && side.label ? side.label : team ? String(team.name) : players.map((p) => playerName(String(p.player_id))).join(' / ') || 'Por definir';
      s.sides.push({ match_id: id, side: side.side, team_id: team ? team.id : null, label, seed: null });
      players.forEach((p) => s.mplayers.push({ match_id: id, player_id: p.player_id, side: side.side, position: null, jersey: null, sub: false }));
    });
    return id;
  };

  switch (fn) {
    // ---------- Eventos ----------
    case 'create_event': {
      if (a.p_league !== DEMO_RACKET) return undefined;
      const config = isObj(a.p_config) ? a.p_config : {};
      const type = String(a.p_type);
      s.events.push({ ...eventRow(String(a.p_id ?? uuidv7()), type, String(a.p_name ?? '').trim().slice(0, 80), String(a.p_date), config, (a.p_start_time as string | null) ?? null), created_at: iso(), updated_at: iso() });
      return done(null);
    }
    case 'update_event': {
      const e = event(a.p_event);
      if (!e) return undefined;
      const p = isObj(a.p_patch) ? a.p_patch : {};
      for (const k of ['name', 'date', 'start_time', 'config'] as const) if (k in p) e[k] = p[k];
      e.player_count = countOf(String(e.type), (e.config ?? {}) as Row);
      e.updated_at = iso();
      return done(null);
    }
    case 'delete_event': {
      const e = event(a.p_event);
      if (!e) return undefined;
      const gone = new Set(s.matches.filter((m) => m.event_id === e.id).map((m) => m.id));
      s.events = s.events.filter((x) => x !== e);
      s.matches = s.matches.filter((m) => !gone.has(m.id));
      s.sides = s.sides.filter((x) => !gone.has(x.match_id));
      s.mplayers = s.mplayers.filter((x) => !gone.has(x.match_id));
      s.rungs = s.rungs.filter((r) => r.event_id !== e.id);
      s.challenges = s.challenges.filter((c) => c.event_id !== e.id);
      return done(null);
    }

    // ---------- Parejas de la temporada ----------
    case 'create_season_team': {
      if (a.p_league !== DEMO_RACKET) return undefined;
      const id = String(a.p_id ?? uuidv7());
      const name = String(a.p_name ?? '').trim();
      if (!name) fail('invalido', 'validation', 'invalido');
      s.teams.push({ id, league_id: DEMO_RACKET, name, sort_order: s.teams.length, color: null, season_id: null, event_id: null, created_at: iso(), updated_at: iso() });
      for (const p of (Array.isArray(a.p_players) ? a.p_players : []) as Row[]) s.roster.push({ league_id: DEMO_RACKET, team_id: id, player_id: p.player_id, jersey: null, position: null, role: 'player' });
      return done(id);
    }
    case 'update_season_team':
    case 'delete_season_team':
    case 'set_roster': {
      const t = s.teams.find((x) => x.id === a.p_team);
      if (!t) return undefined;
      if (fn === 'update_season_team') {
        const p = isObj(a.p_patch) ? a.p_patch : {};
        if (typeof p.name === 'string' && p.name.trim()) t.name = p.name.trim();
        t.updated_at = iso();
        // El nombre de la pareja en sus partidos que no han empezado.
        for (const side of s.sides) if (side.team_id === t.id) side.label = t.name;
      } else if (fn === 'delete_season_team') {
        s.teams = s.teams.filter((x) => x !== t);
        s.roster = s.roster.filter((r) => r.team_id !== t.id);
        // Sus partidos se quedan con el nombre de la pareja.
        for (const side of s.sides) if (side.team_id === t.id) side.team_id = null;
      } else {
        s.roster = [...s.roster.filter((r) => r.team_id !== t.id), ...((Array.isArray(a.p_players) ? a.p_players : []) as Row[]).map((p) => ({ league_id: DEMO_RACKET, team_id: t.id, player_id: p.player_id, jersey: null, position: null, role: 'player' }))];
      }
      return done(null);
    }

    // ---------- Liga por cajas ----------
    case 'save_box_month': {
      const e = event(a.p_event);
      if (!e) return undefined;
      const cfg = { ...((e.config ?? {}) as Row) };
      const months = [...((Array.isArray(cfg.months) ? cfg.months : []) as Row[])];
      const n = Number(a.p_month);
      // Lo que no se jugó del mes que se cierra (o del que se rehace) queda anulado o se borra.
      for (const m of s.matches.filter((x) => x.event_id === e.id && (x.status === 'scheduled' || x.status === 'postponed'))) {
        if (m.round === n) s.matches = s.matches.filter((x) => x !== m);
        else m.status = 'void';
      }
      const prev = months.find((m) => m.n === n - 1);
      if (prev && a.p_moves) Object.assign(prev, { closed: true, moves: a.p_moves });
      const month = { n, label: a.p_label ?? '', start: a.p_start ?? null, end: a.p_end ?? null, boxes: a.p_boxes ?? [], closed: false, moves: [] };
      const i = months.findIndex((m) => m.n === n);
      if (i >= 0) months[i] = month;
      else months.push(month);
      e.config = { ...cfg, months, round: n };
      e.player_count = countOf('cajas', e.config as Row);
      const ids = ((Array.isArray(a.p_matches) ? a.p_matches : []) as Row[]).map((d) => addMatch(String(e.id), { ...d, round: n }));
      return done(ids);
    }

    // ---------- Escalera ----------
    case 'set_ladder': {
      if (!event(a.p_event)) return undefined;
      const order = ((Array.isArray(a.p_entrants) ? a.p_entrants : []) as unknown[]).map(String);
      setOrder(String(a.p_event), order);
      // Quien sale pierde sus retos abiertos.
      for (const c of s.challenges) if (c.event_id === a.p_event && (c.status === 'pending' || c.status === 'accepted') && (!order.includes(String(c.challenger)) || !order.includes(String(c.challenged)))) c.status = 'cancelled';
      return done(order.length);
    }
    case 'join_ladder': {
      if (!event(a.p_event)) return undefined;
      const order = ladderOrder(String(a.p_event));
      const who = typeof a.p_entrant === 'string' ? a.p_entrant : (myEntrants().find((x) => (ladderCfg(String(a.p_event)).doubles ? T.includes(x) || s.teams.some((t) => t.id === x) : x === ME)) ?? ME);
      if (!order.includes(who)) order.push(who);
      setOrder(String(a.p_event), order);
      return done(order.indexOf(who) + 1);
    }
    case 'leave_ladder': {
      if (!event(a.p_event)) return undefined;
      setOrder(
        String(a.p_event),
        ladderOrder(String(a.p_event)).filter((x) => x !== a.p_entrant),
      );
      for (const c of s.challenges) if (c.event_id === a.p_event && (c.challenger === a.p_entrant || c.challenged === a.p_entrant) && (c.status === 'pending' || c.status === 'accepted')) c.status = 'cancelled';
      return done(true);
    }
    case 'create_challenge': {
      const e = event(a.p_event);
      if (!e) return undefined;
      const order = ladderOrder(String(e.id));
      const challenger = typeof a.p_challenger === 'string' ? a.p_challenger : (myEntrants().find((x) => order.includes(x)) ?? fail('no_estas', 'validation', 'no_estas'));
      const cfg = (e.config ?? {}) as Row;
      const id = String(a.p_id ?? uuidv7());
      s.challenges.unshift({
        id,
        league_id: DEMO_RACKET,
        event_id: e.id,
        challenger,
        challenged: a.p_challenged,
        challenger_pos: order.indexOf(challenger) + 1,
        challenged_pos: order.indexOf(String(a.p_challenged)) + 1,
        match_id: null,
        status: 'pending',
        accept_by: iso(Number(cfg.acceptDays ?? 3) * DAY),
        play_by: iso((Number(cfg.acceptDays ?? 3) + Number(cfg.playDays ?? 7)) * DAY),
        accepted_at: null,
        resolved_at: null,
        winner: null,
        note: null,
        created_at: iso(),
      });
      return done(id);
    }
    case 'accept_challenge':
    case 'cancel_challenge': {
      const c = s.challenges.find((x) => x.id === a.p_challenge);
      if (!c) return undefined;
      if (fn === 'cancel_challenge') {
        c.status = 'cancelled';
        c.resolved_at = iso();
        c.note = a.p_note ?? null;
        const m = match(c.match_id);
        if (m) bump(m, { status: 'void' });
        return done(true);
      }
      if (c.status !== 'pending') return done(String(c.status));
      const cfg = ladderCfg(String(c.event_id));
      const matchId = addMatch(String(c.event_id), {
        stage: 'Reto',
        court: typeof a.p_court === 'string' ? a.p_court : '',
        scheduled_at: typeof a.p_scheduled_at === 'string' ? a.p_scheduled_at : null,
        rules: isObj(cfg.rules) ? cfg.rules : {},
        sides: [String(c.challenger), String(c.challenged)].map((id, i) => {
          const team = s.teams.find((t) => t.id === id);
          return { side: i + 1, team_id: team ? id : null, players: (team ? s.roster.filter((r) => r.team_id === id).map((r) => String(r.player_id)) : [id]).map((p) => ({ player_id: p })) };
        }),
      });
      Object.assign(c, { status: 'accepted', accepted_at: iso(), match_id: matchId, play_by: iso(Number(cfg.playDays ?? 7) * DAY) });
      return done('accepted');
    }
    case 'sync_ladder':
      return event(a.p_event) ? 0 : undefined;

    // ---------- Temporadas de esta liga ----------
    case 'league_seasons':
    case 'league_champions': {
      if (a.p_league !== DEMO_RACKET) return undefined;
      const sorted = [...s.seasons].sort((x, y) => y.startsOn.localeCompare(x.startsOn));
      if (fn === 'league_seasons') return sorted;
      return sorted
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
    case 'start_season': {
      if (a.p_league !== DEMO_RACKET) return undefined;
      if (s.seasons.some((x) => x.status === 'active')) fail('hay_activa', 'conflict', 'hay_activa');
      const id = uuidv7();
      s.seasons.push({ id, name: String(a.p_name ?? '').trim() || 'Temporada', startsOn: String(a.p_starts_on), endsOn: typeof a.p_ends_on === 'string' ? a.p_ends_on : null, status: 'active', closedAt: null, closedBy: null, standings: null, awards: [], playoffs: [] });
      return done(id);
    }
    case 'close_season': {
      const season = s.seasons.find((x) => x.id === a.p_season);
      if (!season) return undefined;
      const awards = ((Array.isArray(a.p_awards) ? a.p_awards : []) as Row[]).map((w): SeasonAward => {
        const kind = w.kind as SeasonAward['kind'];
        const player = typeof w.player_id === 'string' && w.player_id ? w.player_id : null;
        const team = typeof w.team_id === 'string' && w.team_id ? w.team_id : null;
        const name = player ? playerName(player) : String(s.teams.find((t) => t.id === team)?.name ?? '');
        if (!name || (player ? 1 : 0) + (team ? 1 : 0) !== 1) fail('invalido', 'validation', 'invalido');
        const label = (typeof w.label === 'string' && w.label.trim() ? w.label.trim() : null) ?? AWARD_LABEL[kind] ?? fail('invalido', 'validation', 'invalido');
        return { id: uuidv7(), kind, label, name, playerId: player, teamId: team, note: typeof w.note === 'string' && w.note.trim() ? w.note.trim() : null };
      });
      const wasActive = season.status === 'active';
      Object.assign(season, { status: 'closed', closedAt: season.closedAt ?? iso(), closedBy: wasActive ? uid : season.closedBy, endsOn: wasActive ? today() : season.endsOn, standings: a.p_standings ?? null, awards });
      return done(null);
    }
  }

  // ---------- Partidos de esta liga ----------
  const m = match(a.p_match);
  if (!m) return undefined;
  switch (fn) {
    case 'set_walkover': {
      const absent = Number(a.p_absent);
      bump(m, { status: 'walkover', walkover_side: absent, winner_side: absent === 1 ? 2 : absent === 2 ? 1 : null, score: a.p_score ?? null, note: a.p_note ?? null, seq: Number(m.seq) + 1 });
      return done(null);
    }
    case 'postpone_match':
      bump(m, { status: 'postponed', note: a.p_note ?? null });
      return done(null);
    case 'reschedule_match':
      bump(m, { scheduled_at: a.p_scheduled_at, ...(typeof a.p_court === 'string' ? { court: a.p_court } : {}), ...(m.status === 'postponed' ? { status: 'scheduled' } : {}), note: a.p_note ?? null });
      return done(null);
    case 'set_match_players': {
      const side = Number(a.p_side);
      s.mplayers = [
        ...s.mplayers.filter((x) => !(x.match_id === m.id && x.side === side)),
        ...((Array.isArray(a.p_players) ? a.p_players : []) as Row[]).map((p) => ({ match_id: m.id, player_id: p.player_id, side, position: null, jersey: null, sub: false })),
      ];
      bump(m, {});
      return done(null);
    }
    case 'void_match':
      bump(m, { status: 'void', note: a.p_note ?? null });
      return done(null);
    case 'delete_match':
      s.matches = s.matches.filter((x) => x !== m);
      s.sides = s.sides.filter((x) => x.match_id !== m.id);
      s.mplayers = s.mplayers.filter((x) => x.match_id !== m.id);
      return done(null);
    case 'admin_correct_result':
    case 'resolve_dispute':
      bump(m, { status: 'confirmed', confirmed_by: uid, confirmed_at: iso(), walkover_side: null, ...(a.p_score ? { score: a.p_score, winner_side: a.p_winner ?? null } : {}), note: a.p_note ?? null, seq: Number(m.seq) + 1 });
      return done(null);
    case 'finish_match':
      // Lo que anota quien organiza queda confirmado (como en la base).
      bump(m, { status: 'confirmed', score: a.p_score, winner_side: a.p_winner ?? null, proposed_by: uid, proposed_at: iso(), confirmed_by: uid, confirmed_at: iso(), seq: Number(m.seq) + 1 });
      return done({ ok: true, status: 'confirmed' });
    case 'confirm_result':
      bump(m, { status: 'confirmed', confirmed_by: uid, confirmed_at: iso() });
      return done(null);
    case 'dispute_result':
      bump(m, { status: 'disputed', disputed_by: uid, disputed_at: iso(), dispute_note: a.p_note ?? null });
      return done(null);
  }
  return undefined;
}
