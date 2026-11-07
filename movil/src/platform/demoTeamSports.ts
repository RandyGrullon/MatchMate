/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): las ligas de equipos ficticias (baloncesto, fútbol
 * y sala) para probar sin el Supabase real lo del organizador y la mesa. Todos los datos son ficticios.
 *
 * - «Baloncesto de Ejemplo» (liga FIBA, la cuenta es la dueña y juega en «Equipo Uno», del que es capitana): 4 equipos
 *   de 5, la jornada 1 jugada (un partido con la mesa: por cuarto y puntos; otro con solo el resultado), en la jornada 2
 *   uno confirmado y otro que te toca confirmar, la jornada 3 hoy (para abrir la mesa anotadora) y la 4 la semana que
 *   viene. Sin playoffs: «Armar los playoffs» con la tabla de la temporada.
 * - «Fútbol de Ejemplo» (la de demoSquads.ts, Fútbol 7): 4 equipos de 7, la jornada 1 jugada con el acta (goles,
 *   asistencias y tarjetas), en la 2 una roja directa (sale un suspendido) y un resultado en disputa, la 3 hoy (para
 *   abrir el acta) y la 4 la semana que viene; una sanción del comité.
 * - «Relámpago de Ejemplo» (torneo suelto de sala, hoy): 4 equipos y nada armado («Armar el torneo»).
 *
 * Forma de las demás capas (demoPlayers.ts): una clave de sessionStorage, `forgetDemoTeamSports()`,
 * `demoTeamSportsSelect(uid, table, filters, readBelow)` (las filas de abajo con las de aquí encima, o null si la tabla
 * no es de aquí) y `teamSportsRpc(uid, fn, args, read)` (undefined si la función o la liga no es de aquí; lanza
 * BackendError como la base). Contesta los equipos de temporada y su plantilla, los partidos con sus lados y jugadores,
 * el anotador de mesa, la convocatoria, el turno y la publicación de la mesa, terminar, confirmar, reclamar, lo del admin
 * en el partido, las sanciones del comité, los playoffs y las temporadas de estas ligas.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { uuidv7 } from '@mm/lib/db/ids';
import { toIsoDate } from '@mm/lib/format';
import { basketball, type BasketballEvent } from '@mm/sports/team/basketball';
import { football, type FootballEvent } from '@mm/sports/team/football';
import { roundName, seedOrder } from '@mm/sports/formats/knockout';
import { basketballAdapter } from '@mm/pages/sports/basketball/adapter';
import { basketballConfigFrom, templateRules as basketballTemplate } from '@mm/pages/sports/basketball/rules';
import { footballAdapter } from '@mm/pages/sports/football/adapter';
import { footballConfigFrom, templateRules as footballTemplate } from '@mm/pages/sports/football/rules';
import { zonedIso } from '@mm/pages/sports/team/schedule';
import { DEMO_FOOTBALL } from './demoSquads';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de las capas de abajo de una tabla, sin filtrar (null si ninguna la tiene). */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-equipos-deportes';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const TZ = 'America/Santo_Domingo';
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
/** Ids fijos: `00000000-0000-7000-8000-0000b4<tipo><número>`. */
const id = (kind: string, n: number) => `00000000-0000-7000-8000-0000b4${kind}${String(n).padStart(5, '0')}`;

export const DEMO_BASKETBALL = id('0', 1);
export const DEMO_RELAMPAGO = id('0', 2);
export { DEMO_FOOTBALL };
const SEASON = { [DEMO_BASKETBALL]: id('1', 1), [DEMO_FOOTBALL]: id('1', 2), [DEMO_RELAMPAGO]: id('1', 3) } as Record<string, string>;
const RELAMPAGO_EVENT = id('e', 1);
const MINE = new Set([DEMO_BASKETBALL, DEMO_FOOTBALL, DEMO_RELAMPAGO]);

const WORDS = ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez', 'Once', 'Doce', 'Trece', 'Catorce', 'Quince', 'Dieciséis', 'Diecisiete', 'Dieciocho', 'Diecinueve', 'Veinte', 'Veintiuno', 'Veintidós', 'Veintitrés', 'Veinticuatro', 'Veinticinco', 'Veintiséis', 'Veintisiete', 'Veintiocho'];
const TEAM_NAMES = ['Equipo Uno', 'Equipo Dos', 'Equipo Tres', 'Equipo Cuatro'];
const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b'];

/** Las reglas de cada liga (las mismas plantillas de la web). */
const RULES: Record<string, Row> = {
  [DEMO_BASKETBALL]: basketballTemplate('fiba'),
  [DEMO_FOOTBALL]: footballTemplate('campo7', 'football'),
  [DEMO_RELAMPAGO]: footballTemplate('relampago', 'futsal'),
};
const FORMAT: Record<string, string> = { [DEMO_BASKETBALL]: 'fiba', [DEMO_FOOTBALL]: 'football', [DEMO_RELAMPAGO]: 'futsal' };

interface State {
  leagues: Row[];
  memberships: Row[];
  players: Row[];
  events: Row[];
  teams: Row[];
  roster: Row[];
  matches: Row[];
  sides: Row[];
  mplayers: Row[];
  officials: Row[];
  rsvps: Row[];
  sanctions: Row[];
  playoffs: Row[];
  series: Row[];
}

// ---------- Las filas fijas ----------

function leagueRow(o: { id: string; sport: string; kind: 'liga' | 'torneo'; name: string; uid: string; venue: string; schedule: string }): Row {
  return {
    id: o.id,
    sport: o.sport,
    kind: o.kind,
    visibility: 'private',
    name: o.name,
    owner_id: o.uid,
    venue: o.venue,
    schedule: o.schedule,
    season_start: null,
    season_end: null,
    contact_name: 'Juan Pérez',
    contact_phone: '809-000-0000',
    require_photo: false,
    has_minors: false,
    tz: TZ,
    logo_path: null,
    rules: RULES[o.id],
    created_at: iso(-60 * DAY),
  };
}

const ownerRow = (league: string, uid: string, player: string | null): Row => ({ league_id: league, user_id: uid, role: 'owner', is_scorer: false, display_name: 'Juan Pérez', player_id: player, scorer_only: false });
const playerRow = (league: string, pid: string, name: string, uid: string | null = null): Row => ({ id: pid, league_id: league, user_id: uid, name, average_override: null, is_minor: false, attrs: null });
const teamRow = (league: string, tid: string, name: string, order: number, color: string | null): Row => ({ id: tid, league_id: league, event_id: null, name, sort_order: order, color, season_id: SEASON[league], created_at: iso(-50 * DAY), updated_at: iso(-50 * DAY) });
const rosterRow = (league: string, team: string, player: string, jersey: number | null, position: string | null, role = 'player'): Row => ({ league_id: league, team_id: team, player_id: player, jersey, position, role });

function matchRow(o: { id: string; league: string; round?: number | null; stage?: string; court?: string; at: string | null; status?: string; eventId?: string | null; seriesId?: string | null }): Row {
  return {
    id: o.id,
    league_id: o.league,
    event_id: o.eventId ?? null,
    round: o.round ?? null,
    stage: o.stage ?? '',
    bracket_key: null,
    court: o.court ?? '',
    scheduled_at: o.at,
    status: o.status ?? 'scheduled',
    format: FORMAT[o.league],
    require_confirm: true,
    score: null,
    seq: 0,
    version: 1,
    winner_side: null,
    walkover_side: null,
    scorer_id: null,
    lease_until: null,
    proposed_by: null,
    proposed_at: null,
    proposed_side: null,
    confirmed_by: null,
    confirmed_at: null,
    disputed_by: null,
    disputed_at: null,
    dispute_note: null,
    note: null,
    created_by: null,
    series_id: o.seriesId ?? null,
    created_at: iso(-40 * DAY),
    updated_at: iso(-DAY),
    rules: structuredClone(RULES[o.league]),
    state: null,
    history: [],
  };
}

/** Hoy (o dentro de `days` días) a esa hora en la zona de la liga. */
const at = (days: number, time: string) => zonedIso(toIsoDate(new Date(Date.now() + days * DAY)), time, TZ);

/** Un partido de baloncesto ya jugado con la mesa: los puntos de cada cuarto repartidos entre los presentes. */
function basketballPlayed(lineups: [string[], string[]], periods: [number, number][]): { state: Row; score: Row; winner: 1 | 2 | null } {
  const config = basketballConfigFrom(RULES[DEMO_BASKETBALL]);
  const log: BasketballEvent[] = [
    { type: 'present', side: 1, players: lineups[0] },
    { type: 'present', side: 2, players: lineups[1] },
  ];
  let turn = 0;
  for (const [a, b] of periods) {
    ([1, 2] as const).forEach((side) => {
      let left = side === 1 ? a : b;
      const team = lineups[side - 1];
      while (left > 0) {
        const points = left >= 3 && turn % 4 === 0 ? 3 : left >= 2 ? 2 : 1;
        log.push({ type: 'score', side, points: points as 1 | 2 | 3, player: team[turn % team.length] });
        left -= points;
        turn++;
      }
      if (turn % 3 === 0) log.push({ type: 'foul', side, kind: 'personal', player: team[turn % team.length] });
    });
    log.push({ type: 'period_end' });
  }
  const adapter = basketballAdapter();
  const state = log.reduce((s, ev) => basketball.apply(s, ev), basketball.init(config));
  return { state: { v: 1, seq: log.length, config, base: null, log, at: Date.now() - 7 * DAY }, score: adapter.score(state) as Row, winner: adapter.winner?.(state) ?? null };
}

/** Un partido de fútbol ya jugado con el acta: presentes y las jugadas con su minuto. */
function footballPlayed(lineups: [string[], string[]], plays: FootballEvent[]): { state: Row; score: Row; winner: 1 | 2 | null } {
  const config = footballConfigFrom(RULES[DEMO_FOOTBALL], 'football');
  // Las jugadas de cada tiempo por su minuto (el 2.º tiempo empieza después de la mitad).
  const minuteOf = (p: FootballEvent) => ('minute' in p && typeof p.minute === 'string' ? Number.parseInt(p.minute, 10) : 0);
  const log: FootballEvent[] = [
    { type: 'present', side: 1, players: lineups[0] },
    { type: 'present', side: 2, players: lineups[1] },
    ...plays.filter((p) => minuteOf(p) <= config.halfMinutes),
    { type: 'period_end' },
    ...plays.filter((p) => minuteOf(p) > config.halfMinutes),
    { type: 'period_end' },
  ];
  const adapter = footballAdapter();
  const state = log.reduce((s, ev) => football.apply(s, ev), football.init(config));
  return { state: { v: 1, seq: log.length, config, base: null, log, at: Date.now() - 7 * DAY }, score: adapter.score(state) as Row, winner: adapter.winner?.(state) ?? null };
}

/** El resultado de un partido que ya cuenta (confirmado) o que espera al rival (propuesto por `side`). */
function played(m: Row, r: { state?: Row | null; score: Row; winner: 1 | 2 | null }, how: { status: 'confirmed' | 'finished' | 'disputed'; side?: 1 | 2; note?: string }) {
  Object.assign(m, {
    status: how.status,
    score: r.score,
    state: r.state ?? null,
    winner_side: r.winner,
    seq: r.state ? Number(r.state.seq) : 0,
    proposed_by: 'demo',
    proposed_at: how.status === 'finished' ? iso(-5 * HOUR) : iso(-6 * DAY),
    proposed_side: how.status === 'confirmed' ? null : (how.side ?? 1),
    confirmed_by: how.status === 'confirmed' ? 'demo' : null,
    confirmed_at: how.status === 'confirmed' ? iso(-6 * DAY) : null,
    disputed_by: how.status === 'disputed' ? 'demo' : null,
    disputed_at: how.status === 'disputed' ? iso(-5 * DAY) : null,
    dispute_note: how.note ?? null,
  });
}

function seed(uid: string): State {
  const s: State = { leagues: [], memberships: [], players: [], events: [], teams: [], roster: [], matches: [], sides: [], mplayers: [], officials: [], rsvps: [], sanctions: [], playoffs: [], series: [] };
  let n = 0;
  const addMatch = (league: string, o: Omit<Parameters<typeof matchRow>[0], 'id' | 'league'>, home: string, away: string, names: [string, string]) => {
    const mid = id('5', ++n);
    const m = matchRow({ id: mid, league, ...o });
    s.matches.push(m);
    s.sides.push({ league_id: league, match_id: mid, side: 1, team_id: home, label: names[0], seed: null }, { league_id: league, match_id: mid, side: 2, team_id: away, label: names[1], seed: null });
    return m;
  };

  // «Baloncesto de Ejemplo»: 4 equipos de 5; la cuenta juega en «Equipo Uno» (capitana, dorsal 7).
  const bbMe = id('2', 1);
  s.leagues.push(leagueRow({ id: DEMO_BASKETBALL, sport: 'basketball', kind: 'liga', name: 'Baloncesto de Ejemplo', uid, venue: 'Cancha de Ejemplo', schedule: 'Viernes 8:00 p. m.' }));
  s.memberships.push(ownerRow(DEMO_BASKETBALL, uid, bbMe));
  const bbTeams = TEAM_NAMES.map((_, i) => id('3', i + 1));
  const bbRoster: string[][] = [[], [], [], []];
  s.players.push(playerRow(DEMO_BASKETBALL, bbMe, 'Juan Pérez', uid));
  bbRoster[0].push(bbMe);
  for (let i = 0; i < 19; i++) {
    const pid = id('2', i + 2);
    s.players.push(playerRow(DEMO_BASKETBALL, pid, `Jugador ${WORDS[i]}`));
    bbRoster[(i + 1) % 4].push(pid);
  }
  const BB_POS = ['Base', 'Escolta', 'Alero', 'Ala-pívot', 'Pívot'];
  bbTeams.forEach((tid, t) => {
    s.teams.push(teamRow(DEMO_BASKETBALL, tid, TEAM_NAMES[t], t, COLORS[t]));
    bbRoster[t].forEach((pid, k) => s.roster.push(rosterRow(DEMO_BASKETBALL, tid, pid, pid === bbMe ? 7 : 4 + k * 3 + t, BB_POS[k % BB_POS.length], k === 0 ? 'captain' : 'player')));
  });
  const bb = (a: number, b: number) => [bbTeams[a], bbTeams[b], [TEAM_NAMES[a], TEAM_NAMES[b]] as [string, string]] as const;
  const court = 'Cancha de Ejemplo';
  // Jornada 1 (hace 14 días): con la mesa y solo el resultado.
  played(addMatch(DEMO_BASKETBALL, { round: 1, court, at: at(-14, '20:00') }, ...bb(0, 1)), basketballPlayed([bbRoster[0], bbRoster[1]], [[18, 20], [22, 16], [19, 17], [19, 19]]), { status: 'confirmed' });
  played(addMatch(DEMO_BASKETBALL, { round: 1, court, at: at(-14, '21:30') }, ...bb(2, 3)), { score: { text: '65-70', sides: [65, 70] }, winner: 2 }, { status: 'confirmed' });
  // Jornada 2 (hace 7 días): uno confirmado y otro que te toca confirmar (lo propuso «Equipo Cuatro»).
  played(addMatch(DEMO_BASKETBALL, { round: 2, court, at: at(-7, '20:00') }, ...bb(1, 2)), basketballPlayed([bbRoster[1], bbRoster[2]], [[15, 14], [17, 20], [16, 15], [21, 18]]), { status: 'confirmed' });
  played(addMatch(DEMO_BASKETBALL, { round: 2, court, at: at(-7, '21:30') }, ...bb(3, 0)), basketballPlayed([bbRoster[3], bbRoster[0]], [[20, 18], [16, 19], [18, 15], [14, 20]]), { status: 'finished', side: 1 });
  // Jornada 3 (hoy): para abrir la mesa anotadora; la 4, la semana que viene.
  const today = addMatch(DEMO_BASKETBALL, { round: 3, court, at: at(0, '20:00') }, ...bb(0, 2));
  addMatch(DEMO_BASKETBALL, { round: 3, court, at: at(0, '21:30') }, ...bb(1, 3));
  addMatch(DEMO_BASKETBALL, { round: 4, court, at: at(7, '20:00') }, ...bb(1, 0));
  addMatch(DEMO_BASKETBALL, { round: 4, court, at: at(7, '21:30') }, ...bb(3, 2));
  // La convocatoria de hoy: dos compañeros ya dijeron «Voy» y uno «Tal vez».
  s.rsvps.push(
    { league_id: DEMO_BASKETBALL, match_id: today.id, player_id: bbRoster[0][1], side: 1, status: 'yes', set_by: null, updated_at: iso(-3 * HOUR) },
    { league_id: DEMO_BASKETBALL, match_id: today.id, player_id: bbRoster[0][2], side: 1, status: 'yes', set_by: null, updated_at: iso(-2 * HOUR) },
    { league_id: DEMO_BASKETBALL, match_id: today.id, player_id: bbRoster[0][3], side: 1, status: 'maybe', set_by: null, updated_at: iso(-HOUR) },
  );

  // «Fútbol de Ejemplo» (de demoSquads.ts): 4 equipos de 7; la cuenta juega en «Equipo Uno» (capitana, dorsal 10).
  const fbMe = id('6', 1);
  const fbTeams = TEAM_NAMES.map((_, i) => id('7', i + 1));
  const fbRoster: string[][] = [[], [], [], []];
  s.players.push(playerRow(DEMO_FOOTBALL, fbMe, 'Juan Pérez', uid));
  fbRoster[0].push(fbMe);
  for (let i = 0; i < 27; i++) {
    const pid = id('6', i + 2);
    s.players.push(playerRow(DEMO_FOOTBALL, pid, `Jugador ${WORDS[i]}`));
    fbRoster[(i + 1) % 4].push(pid);
  }
  const FB_POS = ['Portero', 'Defensa', 'Defensa', 'Mediocampista', 'Mediocampista', 'Delantero', 'Delantero'];
  fbTeams.forEach((tid, t) => {
    s.teams.push(teamRow(DEMO_FOOTBALL, tid, TEAM_NAMES[t], t, COLORS[t]));
    fbRoster[t].forEach((pid, k) => s.roster.push(rosterRow(DEMO_FOOTBALL, tid, pid, pid === fbMe ? 10 : k + 1 + t * 10, FB_POS[k], k === 0 ? 'captain' : 'player')));
  });
  const fb = (a: number, b: number) => [fbTeams[a], fbTeams[b], [TEAM_NAMES[a], TEAM_NAMES[b]] as [string, string]] as const;
  const field = 'Campo de Ejemplo';
  const R = fbRoster;
  // Jornada 1: 2-1 con goles, asistencia y una amarilla; 0-0 en el otro.
  played(
    addMatch(DEMO_FOOTBALL, { round: 1, court: field, at: at(-14, '09:00') }, ...fb(0, 1)),
    footballPlayed(
      [R[0], R[1]],
      [
        { type: 'goal', side: 1, player: R[0][0], assist: R[0][3], minute: '12' },
        { type: 'card', side: 2, player: R[1][2], card: 'yellow', minute: '20' },
        { type: 'goal', side: 2, player: R[1][5], minute: '31' },
        { type: 'goal', side: 1, player: R[0][5], assist: R[0][0], minute: '44' },
      ],
    ),
    { status: 'confirmed' },
  );
  played(addMatch(DEMO_FOOTBALL, { round: 1, court: field, at: at(-14, '10:30') }, ...fb(2, 3)), footballPlayed([R[2], R[3]], []), { status: 'confirmed' });
  // Jornada 2: una roja directa (queda suspendido para la jornada 3) y un resultado en disputa.
  played(
    addMatch(DEMO_FOOTBALL, { round: 2, court: field, at: at(-7, '09:00') }, ...fb(1, 2)),
    footballPlayed(
      [R[1], R[2]],
      [
        { type: 'goal', side: 2, player: R[2][4], minute: '8' },
        { type: 'card', side: 1, player: R[1][3], card: 'red', minute: '27' },
        { type: 'goal', side: 1, player: R[1][6], minute: '33' },
        { type: 'goal', side: 2, player: R[2][5], assist: R[2][4], minute: '40' },
        { type: 'goal', side: 2, player: R[2][6], minute: '47' },
      ],
    ),
    { status: 'confirmed' },
  );
  played(
    addMatch(DEMO_FOOTBALL, { round: 2, court: field, at: at(-7, '10:30') }, ...fb(3, 0)),
    footballPlayed([R[3], R[0]], [
      { type: 'goal', side: 1, player: R[3][5], minute: '15' },
      { type: 'goal', side: 2, player: R[0][0], minute: '38' },
    ]),
    { status: 'disputed', side: 2, note: 'El gol de Equipo Cuatro fue fuera de lugar.' },
  );
  // Jornada 3 (hoy, para abrir el acta) y la 4 la semana que viene.
  const fbToday = addMatch(DEMO_FOOTBALL, { round: 3, court: field, at: at(0, '20:00') }, ...fb(0, 2));
  addMatch(DEMO_FOOTBALL, { round: 3, court: field, at: at(0, '21:30') }, ...fb(1, 3));
  addMatch(DEMO_FOOTBALL, { round: 4, court: field, at: at(7, '09:00') }, ...fb(2, 1));
  addMatch(DEMO_FOOTBALL, { round: 4, court: field, at: at(7, '10:30') }, ...fb(0, 3));
  s.rsvps.push({ league_id: DEMO_FOOTBALL, match_id: fbToday.id, player_id: R[0][1], side: 1, status: 'yes', set_by: null, updated_at: iso(-2 * HOUR) });
  // Una sanción del comité: 1 partido más a uno de «Equipo Dos» desde la jornada 2.
  s.sanctions.push({ id: id('9', 1), league_id: DEMO_FOOTBALL, team_id: fbTeams[1], player_id: R[1][2], match_id: s.matches.find((m) => m.league_id === DEMO_FOOTBALL && m.round === 2)!.id, matches: 1, note: 'Protestó al árbitro', created_by: uid, created_at: iso(-6 * DAY) });

  // «Relámpago de Ejemplo»: el torneo suelto de sala de hoy, con 4 equipos y nada armado.
  s.leagues.push(leagueRow({ id: DEMO_RELAMPAGO, sport: 'futsal', kind: 'torneo', name: 'Relámpago de Ejemplo', uid, venue: 'Cancha de Ejemplo', schedule: '' }));
  s.memberships.push(ownerRow(DEMO_RELAMPAGO, uid, null));
  s.events.push({ id: RELAMPAGO_EVENT, league_id: DEMO_RELAMPAGO, type: 'torneo', name: 'Relámpago de Ejemplo', date: toIsoDate(new Date()), start_time: null, games: 1, hcp_base: 0, hcp_percent: 0, individual_rank_by: null, team_rank_by: null, category_cuts: null, team_size: 1, announcement: 'Llega 30 minutos antes para el sorteo de los grupos.', player_count: 0, created_at: iso(-3 * DAY) });
  TEAM_NAMES.forEach((name, t) => {
    const tid = id('8', t + 1);
    s.teams.push(teamRow(DEMO_RELAMPAGO, tid, name, t, COLORS[t]));
    for (let k = 0; k < 5; k++) {
      const pid = id('8', 100 + t * 5 + k);
      s.players.push(playerRow(DEMO_RELAMPAGO, pid, `Jugador ${WORDS[t * 5 + k]}`));
      s.roster.push(rosterRow(DEMO_RELAMPAGO, tid, pid, k + 1, null, k === 0 ? 'captain' : 'player'));
    }
  });
  return s;
}

function load(uid: string): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    // sin sessionStorage: lo de fábrica
  }
  return seed(uid);
}

function save(s: State) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sin sessionStorage: sigue en memoria hasta recargar
  }
}

export function forgetDemoTeamSports() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

const fail = (message: string, kind: BackendErrorKind, code: string | null = null): never => {
  throw new BackendError(message, kind, code);
};
const isObj = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

const passes = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    const v = r[f.col];
    if (f.op === 'eq') return v === f.value;
    if (f.op === 'neq') return v !== f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(v);
    if (f.op === 'is') return f.value === null ? v == null : v === f.value;
    if (f.op === 'gt') return typeof v === 'number' ? v > (f.value as number) : String(v ?? '') > String(f.value);
    if (f.op === 'gte') return typeof v === 'number' ? v >= (f.value as number) : String(v ?? '') >= String(f.value);
    if (f.op === 'lt') return typeof v === 'number' ? v < (f.value as number) : String(v ?? '') < String(f.value);
    if (f.op === 'lte') return typeof v === 'number' ? v <= (f.value as number) : String(v ?? '') <= String(f.value);
    return true;
  });

// ---------- Lecturas ----------

/** Lo de aquí de cada tabla (las que comparte con otras capas se suman a las de abajo). */
function mine(s: State, table: string): Row[] | null {
  switch (table) {
    case 'leagues':
      return s.leagues;
    case 'memberships':
      return s.memberships;
    case 'players':
      return s.players;
    case 'events':
      return s.events;
    case 'teams':
      return s.teams;
    case 'team_players':
      return s.roster;
    case 'matches':
      return s.matches;
    case 'match_sides':
      return s.sides;
    case 'match_players':
      return s.mplayers;
    case 'match_officials':
      return s.officials;
    case 'match_rsvps':
      return s.rsvps;
    case 'football_sanctions':
      return s.sanctions;
    case 'playoffs':
      return s.playoffs;
    case 'playoff_series':
      return s.series;
    default:
      return null;
  }
}

/**
 * Las filas de `table` de las capas de abajo con las de estas ligas encima, con los filtros (eq, neq, in, is, gt, gte,
 * lt y lte); null si la tabla no es de las que tocan. «Fútbol de Ejemplo» llega de abajo (demoSquads.ts): aquí se le
 * ponen sus reglas y el jugador de la cuenta. Va justo encima de demoSquads (así Jugadores, Miembros, Ajustes y las
 * temporadas caen encima de estas filas).
 */
export function demoTeamSportsSelect(uid: string, table: string, filters: readonly Filter[] = [], readBelow: Read): Row[] | null {
  const s = load(uid);
  const extra = mine(s, table);
  if (!extra) return null;
  let below = readBelow(table) ?? [];
  if (table === 'leagues') below = below.map((l) => (l.id === DEMO_FOOTBALL && !isObj(l.rules) ? { ...l, rules: RULES[DEMO_FOOTBALL] } : l));
  if (table === 'memberships') below = below.map((m) => (m.league_id === DEMO_FOOTBALL && m.user_id === uid && !m.player_id ? { ...m, player_id: id('6', 1) } : m));
  return [...below, ...extra].filter((r) => passes(r, filters));
}

// ---------- RPC ----------

const RPCS = new Set([
  'server_now',
  'league_seasons',
  'league_champions',
  'create_season_team',
  'update_season_team',
  'delete_season_team',
  'set_team_player',
  'remove_team_player',
  'set_roster',
  'create_matches',
  'update_match_schedule',
  'set_match_sides',
  'set_match_official',
  'set_match_rsvp',
  'claim_scorer',
  'release_scorer',
  'publish_match',
  'finish_match',
  'suspend_match',
  'set_match_players',
  'confirm_result',
  'dispute_result',
  'resolve_dispute',
  'admin_correct_result',
  'set_walkover',
  'postpone_match',
  'reschedule_match',
  'void_match',
  'delete_match',
  'save_football_sanction',
  'delete_football_sanction',
  'create_playoffs',
  'delete_playoffs',
  'sync_playoffs',
]);

const MATCH_RPCS = new Set([
  'update_match_schedule',
  'set_match_sides',
  'set_match_official',
  'set_match_rsvp',
  'claim_scorer',
  'release_scorer',
  'publish_match',
  'finish_match',
  'suspend_match',
  'set_match_players',
  'confirm_result',
  'dispute_result',
  'resolve_dispute',
  'admin_correct_result',
  'set_walkover',
  'postpone_match',
  'reschedule_match',
  'void_match',
  'delete_match',
]);

/** El turno de la mesa: 2 minutos sin publicar (como private.match_lease()). */
const LEASE_MS = 2 * 60_000;
const OPEN = ['scheduled', 'live', 'suspended'];

/** Un resultado que cuenta para la serie: confirmado, W.O. o propuesto hace 48 h. */
const counts = (m: Row) => m.status === 'confirmed' || m.status === 'walkover' || (m.status === 'finished' && typeof m.proposed_at === 'string' && Date.parse(m.proposed_at) <= Date.now() - 48 * HOUR);

/**
 * Las RPC de las ligas de equipos ficticias (la misma forma que la base). undefined si no son de estas ligas (otro
 * equipo, otro partido, otra liga). `read`: todas las capas sin filtrar (los nombres de los jugadores nuevos, las reglas
 * cambiadas en Ajustes).
 */
export function teamSportsRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  if (!RPCS.has(fn)) return undefined;
  if (fn === 'server_now') return iso();
  const s = load(uid);
  const done = <V>(v: V): V => {
    save(s);
    return v;
  };
  const bump = (m: Row, patch: Row) => Object.assign(m, patch, { version: Number(m.version) + 1, updated_at: iso() });
  const leagueRules = (lid: string) => {
    const l = read('leagues').find((x) => x.id === lid);
    return structuredClone(isObj(l?.rules) ? l.rules : RULES[lid]);
  };
  const teamName = (tid: unknown) => String(s.teams.find((t) => t.id === tid)?.name ?? 'Por definir');
  const writeSides = (league: string, mid: string, list: unknown) => {
    s.sides = s.sides.filter((x) => x.match_id !== mid);
    s.mplayers = s.mplayers.filter((x) => x.match_id !== mid);
    for (const raw of (Array.isArray(list) ? list : []) as Row[]) {
      const side = Number(raw.side);
      const team = typeof raw.team_id === 'string' ? raw.team_id : null;
      s.sides.push({ league_id: league, match_id: mid, side, team_id: team, label: typeof raw.label === 'string' && raw.label ? raw.label : team ? teamName(team) : 'Por definir', seed: typeof raw.seed === 'number' ? raw.seed : null });
      for (const p of (Array.isArray(raw.players) ? raw.players : []) as Row[]) s.mplayers.push({ league_id: league, match_id: mid, player_id: p.player_id, side, position: p.position ?? null, jersey: p.jersey ?? null, sub: !!p.sub });
    }
  };

  // ---------- Las temporadas ----------

  if (fn === 'league_seasons' || fn === 'league_champions') {
    const lid = String(a.p_league ?? '');
    if (!MINE.has(lid)) return undefined;
    if (fn === 'league_champions') return [];
    return [{ id: SEASON[lid], name: 'Temporada 2026', startsOn: toIsoDate(new Date(Date.now() - 60 * DAY)), endsOn: toIsoDate(new Date(Date.now() + 120 * DAY)), status: 'active', closedAt: null, closedBy: null, standings: null, awards: [], playoffs: [] }];
  }

  // ---------- Los equipos y su plantilla ----------

  if (fn === 'create_season_team') {
    const lid = String(a.p_league ?? '');
    if (!MINE.has(lid)) return undefined;
    const name = String(a.p_name ?? '').trim();
    if (!name) fail('invalido', 'validation', 'invalido');
    if (s.teams.some((t) => t.league_id === lid && t.event_id == null && String(t.name).toLowerCase() === name.toLowerCase())) fail('duplicado', 'conflict', 'duplicado');
    const tid = typeof a.p_id === 'string' ? a.p_id : uuidv7();
    s.teams.push(teamRow(lid, tid, name, s.teams.filter((t) => t.league_id === lid).length, typeof a.p_color === 'string' ? a.p_color : null));
    for (const p of (Array.isArray(a.p_players) ? a.p_players : []) as Row[]) s.roster.push(rosterRow(lid, tid, String(p.player_id), (p.jersey as number | null) ?? null, (p.position as string | null) ?? null, typeof p.role === 'string' ? p.role : 'player'));
    return done(tid);
  }
  if (fn === 'update_season_team' || fn === 'delete_season_team' || fn === 'set_team_player' || fn === 'remove_team_player' || fn === 'set_roster') {
    const t = s.teams.find((x) => x.id === a.p_team);
    if (!t) return undefined;
    const lid = String(t.league_id);
    if (fn === 'update_season_team') {
      const p = isObj(a.p_patch) ? a.p_patch : {};
      if (typeof p.name === 'string') {
        if (!p.name.trim()) fail('invalido', 'validation', 'invalido');
        t.name = p.name.trim();
      }
      if ('color' in p) t.color = p.color ?? null;
      if (typeof p.sort_order === 'number') t.sort_order = p.sort_order;
      t.updated_at = iso();
      return done(null);
    }
    if (fn === 'delete_season_team') {
      s.teams = s.teams.filter((x) => x !== t);
      s.roster = s.roster.filter((r) => r.team_id !== t.id);
      // Sus partidos se quedan con el nombre copiado.
      for (const side of s.sides) if (side.team_id === t.id) side.team_id = null;
      return done(null);
    }
    if (fn === 'set_team_player') {
      const pid = String(a.p_player ?? '');
      const jersey = typeof a.p_jersey === 'number' ? a.p_jersey : null;
      if (jersey !== null && s.roster.some((r) => r.team_id === t.id && r.player_id !== pid && r.jersey === jersey)) fail('duplicado', 'conflict', 'duplicado');
      if (s.roster.some((r) => r.league_id === lid && r.team_id !== t.id && r.player_id === pid)) fail('invalido', 'validation', 'invalido');
      const cur = s.roster.find((r) => r.team_id === t.id && r.player_id === pid);
      if (cur) Object.assign(cur, { jersey, position: a.p_position ?? null, ...(typeof a.p_role === 'string' ? { role: a.p_role } : {}) });
      else s.roster.push(rosterRow(lid, String(t.id), pid, jersey, (a.p_position as string | null) ?? null, typeof a.p_role === 'string' ? a.p_role : 'player'));
      return done(null);
    }
    if (fn === 'remove_team_player') {
      const before = s.roster.length;
      s.roster = s.roster.filter((r) => !(r.team_id === t.id && r.player_id === a.p_player));
      return done(s.roster.length < before);
    }
    s.roster = [...s.roster.filter((r) => r.team_id !== t.id), ...((Array.isArray(a.p_players) ? a.p_players : []) as Row[]).map((p) => rosterRow(lid, String(t.id), String(p.player_id), (p.jersey as number | null) ?? null, (p.position as string | null) ?? null, typeof p.role === 'string' ? p.role : 'player'))];
    return done(null);
  }

  // ---------- Crear partidos (calendario, partido suelto, relámpago) ----------

  if (fn === 'create_matches') {
    const lid = String(a.p_league ?? '');
    if (!MINE.has(lid)) return undefined;
    const list = (Array.isArray(a.p_matches) ? a.p_matches : []) as Row[];
    if (!list.length || list.length > 200) fail('invalido', 'validation', 'invalido');
    const ids: string[] = [];
    for (const d of list) {
      const mid = typeof d.id === 'string' ? d.id : uuidv7();
      const m = matchRow({ id: mid, league: lid, round: typeof d.round === 'number' ? d.round : null, stage: typeof d.stage === 'string' ? d.stage : '', court: typeof d.court === 'string' ? d.court : '', at: typeof d.scheduled_at === 'string' ? d.scheduled_at : null, eventId: typeof d.event_id === 'string' ? d.event_id : null });
      m.bracket_key = typeof d.bracket_key === 'string' ? d.bracket_key : null;
      if (typeof d.format === 'string' && d.format) m.format = d.format;
      m.rules = isObj(d.rules) ? d.rules : leagueRules(lid);
      if (d.require_confirm === false) m.require_confirm = false;
      m.created_by = uid;
      m.created_at = iso();
      s.matches.push(m);
      writeSides(lid, mid, d.sides);
      ids.push(mid);
    }
    return done(ids);
  }

  // ---------- Las sanciones del comité ----------

  if (fn === 'save_football_sanction') {
    const m = s.matches.find((x) => x.id === a.p_match);
    if (!m) return undefined;
    const n = Number(a.p_matches);
    if (!Number.isInteger(n) || n < 1 || n > 50) fail('invalido', 'validation', 'invalido');
    const sid = typeof a.p_id === 'string' ? a.p_id : uuidv7();
    s.sanctions = s.sanctions.filter((x) => x.id !== sid);
    s.sanctions.push({ id: sid, league_id: m.league_id, team_id: a.p_team, player_id: a.p_player, match_id: m.id, matches: n, note: typeof a.p_note === 'string' && a.p_note.trim() ? a.p_note.trim() : null, created_by: uid, created_at: iso() });
    return done(sid);
  }
  if (fn === 'delete_football_sanction') {
    const before = s.sanctions.length;
    s.sanctions = s.sanctions.filter((x) => x.id !== a.p_id);
    if (s.sanctions.length === before) return undefined;
    return done(true);
  }

  // ---------- Los playoffs ----------

  if (fn === 'create_playoffs') {
    const lid = String(a.p_league ?? '');
    if (!MINE.has(lid)) return undefined;
    if (a.p_season !== SEASON[lid]) fail('no_existe', 'not_found', 'no_existe');
    const teams = (Array.isArray(a.p_teams) ? a.p_teams : []) as string[];
    const bestOf = (Array.isArray(a.p_best_of) ? a.p_best_of : []) as number[];
    let size = 1;
    let rounds = 0;
    while (size < teams.length) {
      size *= 2;
      rounds++;
    }
    if (teams.length < 2 || teams.length > 32 || new Set(teams).size !== teams.length || bestOf.length !== rounds || bestOf.some((b) => ![1, 3, 5, 7].includes(b))) fail('invalido', 'validation', 'invalido');
    if (s.playoffs.some((p) => p.season_id === a.p_season && p.status === 'active')) fail('duplicado', 'conflict', 'duplicado');
    const pid = uuidv7();
    s.playoffs.push({ id: pid, league_id: lid, season_id: a.p_season, name: 'Playoffs', status: 'active', best_of: bestOf, seeds: teams, winner: null, created_at: iso() });
    const made: Row[] = [];
    for (let rd = 1; rd <= rounds; rd++) {
      for (let sl = 1; sl <= size / 2 ** rd; sl++) {
        made.push({ id: uuidv7(), playoff_id: pid, league_id: lid, round: rd, slot: sl, best_of: bestOf[rd - 1], team_a: null, team_b: null, seed_a: null, seed_b: null, label_a: null, label_b: null, wins_a: 0, wins_b: 0, winner: null, bye: false, next_series: null, next_side: null });
      }
    }
    for (const x of made) {
      const nx = made.find((y) => y.round === Number(x.round) + 1 && y.slot === Math.floor((Number(x.slot) + 1) / 2));
      if (nx) Object.assign(x, { next_series: nx.id, next_side: Number(x.slot) % 2 === 1 ? 'a' : 'b' });
    }
    const order = seedOrder(size);
    for (const x of made.filter((y) => y.round === 1)) {
      const i = Number(x.slot);
      const sa = order[2 * i - 2];
      const sb = order[2 * i - 1];
      Object.assign(x, {
        team_a: sa <= teams.length ? teams[sa - 1] : null,
        seed_a: sa <= teams.length ? sa : null,
        label_a: sa <= teams.length ? teamName(teams[sa - 1]) : null,
        team_b: sb <= teams.length ? teams[sb - 1] : null,
        seed_b: sb <= teams.length ? sb : null,
        label_b: sb <= teams.length ? teamName(teams[sb - 1]) : null,
        bye: sa > teams.length || sb > teams.length,
      });
    }
    s.series.push(...made);
    for (const x of made.filter((y) => y.round === 1).sort((p, q) => Number(p.slot) - Number(q.slot))) refreshSeries(s, String(x.id), uid, leagueRules);
    return done(pid);
  }
  if (fn === 'delete_playoffs' || fn === 'sync_playoffs') {
    const p = s.playoffs.find((x) => x.id === a.p_playoff);
    if (!p) return undefined;
    const series = s.series.filter((x) => x.playoff_id === p.id);
    if (fn === 'delete_playoffs') {
      const ids = new Set(series.map((x) => x.id));
      const gone = new Set(s.matches.filter((m) => ids.has(m.series_id) && (m.status === 'scheduled' || m.status === 'postponed') && Number(m.seq) === 0).map((m) => m.id));
      s.matches = s.matches.filter((m) => !gone.has(m.id)).map((m) => (ids.has(m.series_id) ? { ...m, series_id: null } : m));
      s.sides = s.sides.filter((x) => !gone.has(x.match_id));
      s.series = s.series.filter((x) => x.playoff_id !== p.id);
      s.playoffs = s.playoffs.filter((x) => x !== p);
      return done(null);
    }
    const before = JSON.stringify(series.map((x) => [x.team_a, x.team_b, x.wins_a, x.wins_b, x.winner]));
    for (const x of [...series].sort((p1, p2) => Number(p1.round) - Number(p2.round) || Number(p1.slot) - Number(p2.slot))) refreshSeries(s, String(x.id), uid, leagueRules);
    const after = s.series.filter((x) => x.playoff_id === p.id).map((x) => [x.team_a, x.team_b, x.wins_a, x.wins_b, x.winner]);
    const was = JSON.parse(before) as unknown[][];
    return done(after.filter((v, i) => JSON.stringify(v) !== JSON.stringify(was[i])).length);
  }

  // ---------- Un partido ----------

  if (!MATCH_RPCS.has(fn)) return undefined;
  const m = s.matches.find((x) => x.id === a.p_match);
  if (!m) return undefined;
  const lid = String(m.league_id);
  const mid = String(m.id);
  const status = String(m.status);
  // Lo que cambia el ganador de un juego de playoff: la serie se vuelve a contar.
  const afterResult = () => {
    if (typeof m.series_id === 'string') refreshSeries(s, m.series_id, uid, leagueRules);
  };

  switch (fn) {
    case 'update_match_schedule': {
      const p = isObj(a.p_patch) ? a.p_patch : {};
      bump(m, {
        ...('scheduled_at' in p ? { scheduled_at: p.scheduled_at ?? null } : {}),
        ...('court' in p ? { court: p.court ?? '' } : {}),
        ...('round' in p ? { round: p.round ?? null } : {}),
        ...('stage' in p ? { stage: p.stage ?? '' } : {}),
      });
      return done(null);
    }
    case 'set_match_sides':
      writeSides(lid, mid, a.p_sides);
      bump(m, {});
      return done(null);
    case 'set_match_official': {
      s.officials = s.officials.filter((o) => o.match_id !== mid);
      if (typeof a.p_user === 'string') {
        const who = read('memberships').find((x) => x.league_id === lid && x.user_id === a.p_user);
        s.officials.push({ league_id: lid, match_id: mid, user_id: a.p_user, name: String(who?.display_name ?? (a.p_user === uid ? 'Juan Pérez' : 'Anotador')) });
      }
      return done(null);
    }
    case 'set_match_rsvp': {
      const side = s.sides.find((x) => x.match_id === mid && s.roster.some((r) => r.team_id === x.team_id && r.player_id === a.p_player));
      s.rsvps = s.rsvps.filter((r) => !(r.match_id === mid && r.player_id === a.p_player));
      if (a.p_status) s.rsvps.push({ league_id: lid, match_id: mid, player_id: a.p_player, side: side?.side ?? 1, status: a.p_status, set_by: uid, updated_at: iso() });
      return done(null);
    }
    case 'claim_scorer': {
      if (!OPEN.includes(status)) fail('cerrado', 'conflict', 'cerrado');
      const ok = !m.scorer_id || m.scorer_id === uid || a.p_force === true;
      if (ok) bump(m, { scorer_id: uid, lease_until: iso(LEASE_MS) });
      return done({ ok, scorer_id: m.scorer_id, scorer_name: m.scorer_id === uid ? 'Juan Pérez' : 'Anotador', lease_until: m.lease_until, expired: typeof m.lease_until === 'string' && Date.parse(m.lease_until) < Date.now(), status: m.status, seq: m.seq, version: m.version, ...(ok ? { state: m.state } : {}) });
    }
    case 'release_scorer':
      if (m.scorer_id === (a.p_to ?? null)) return done(null);
      bump(m, { scorer_id: a.p_to ?? null, lease_until: a.p_to ? iso(LEASE_MS) : null });
      return done(null);
    case 'publish_match': {
      const seq = Number(a.p_seq);
      if (!OPEN.includes(status)) return done({ ok: false, reason: 'cerrado', status, seq: m.seq });
      if (m.scorer_id && m.scorer_id !== uid) return done({ ok: false, reason: 'lease', status, seq: m.seq, scorer_id: m.scorer_id, scorer_name: 'Anotador', lease_until: m.lease_until });
      if (seq < Number(m.seq)) return done({ ok: false, reason: 'stale', status, seq: m.seq });
      const live = (status === 'scheduled' || status === 'suspended') && seq > Number(m.seq);
      bump(m, { state: a.p_state ?? null, score: a.p_score ?? null, seq, scorer_id: uid, lease_until: iso(LEASE_MS), ...(live ? { status: 'live' } : {}) });
      return done({ ok: true, status: m.status, seq: m.seq, version: m.version, lease_until: m.lease_until });
    }
    case 'finish_match': {
      if (status !== 'finished' && !OPEN.includes(status)) fail('cerrado', 'conflict', 'cerrado');
      const seq = typeof a.p_seq === 'number' ? a.p_seq : Number(m.seq);
      // La cuenta de prueba organiza estas ligas: lo que anota queda confirmado (como el admin en la base).
      bump(m, { status: 'confirmed', score: a.p_score ?? null, winner_side: a.p_winner ?? null, walkover_side: null, state: a.p_state ?? m.state, seq: Math.max(Number(m.seq), seq), scorer_id: null, lease_until: null, proposed_by: uid, proposed_at: iso(), proposed_side: null, confirmed_by: uid, confirmed_at: iso(), disputed_by: null, disputed_at: null, dispute_note: null });
      afterResult();
      return done({ ok: true, status: 'confirmed' });
    }
    case 'suspend_match':
      if (!OPEN.includes(status)) fail('cerrado', 'conflict', 'cerrado');
      bump(m, { status: 'suspended', ...(a.p_state ? { state: a.p_state } : {}), ...(a.p_score ? { score: a.p_score } : {}), ...(typeof a.p_seq === 'number' ? { seq: Math.max(Number(m.seq), a.p_seq) } : {}), scorer_id: null, lease_until: null, note: typeof a.p_note === 'string' ? a.p_note : m.note });
      return done(null);
    case 'set_match_players': {
      const side = Number(a.p_side);
      s.mplayers = [
        ...s.mplayers.filter((x) => !(x.match_id === mid && x.side === side)),
        ...((Array.isArray(a.p_players) ? a.p_players : []) as Row[]).map((p) => ({ league_id: lid, match_id: mid, player_id: p.player_id, side, position: p.position ?? null, jersey: p.jersey ?? null, sub: !!p.sub })),
      ];
      return done(null);
    }
    case 'confirm_result':
      if (status !== 'finished') fail('cerrado', 'conflict', 'cerrado');
      bump(m, { status: 'confirmed', confirmed_by: uid, confirmed_at: iso() });
      afterResult();
      return done(null);
    case 'dispute_result':
      if (status !== 'finished') fail('cerrado', 'conflict', 'cerrado');
      bump(m, { status: 'disputed', disputed_by: uid, disputed_at: iso(), dispute_note: typeof a.p_note === 'string' ? a.p_note : null });
      return done(null);
    case 'resolve_dispute':
      if (status !== 'disputed') fail('cerrado', 'conflict', 'cerrado');
      bump(m, { status: 'confirmed', confirmed_by: uid, confirmed_at: iso(), ...(a.p_score ? { score: a.p_score, winner_side: a.p_winner ?? null } : {}), ...(a.p_state ? { state: a.p_state } : {}), note: typeof a.p_note === 'string' ? a.p_note : m.note });
      afterResult();
      return done(null);
    case 'admin_correct_result':
      bump(m, { status: 'confirmed', score: a.p_score ?? m.score, winner_side: a.p_winner ?? null, walkover_side: null, ...(a.p_state ? { state: a.p_state } : {}), confirmed_by: uid, confirmed_at: iso(), proposed_by: m.proposed_by ?? uid, proposed_at: m.proposed_at ?? iso(), disputed_by: null, disputed_at: null, dispute_note: null, scorer_id: null, lease_until: null, note: typeof a.p_note === 'string' ? a.p_note : m.note });
      afterResult();
      return done(null);
    case 'set_walkover': {
      const absent = Number(a.p_absent);
      bump(m, { status: 'walkover', walkover_side: absent, winner_side: absent === 1 ? 2 : absent === 2 ? 1 : null, score: a.p_score ?? null, scorer_id: null, lease_until: null, confirmed_by: uid, confirmed_at: iso() });
      afterResult();
      return done(null);
    }
    case 'postpone_match':
      if (status !== 'scheduled' && status !== 'suspended') fail('cerrado', 'conflict', 'cerrado');
      bump(m, { status: 'postponed', scheduled_at: null, note: typeof a.p_note === 'string' ? a.p_note : m.note });
      return done(null);
    case 'reschedule_match':
      bump(m, { scheduled_at: a.p_scheduled_at ?? null, ...(typeof a.p_court === 'string' ? { court: a.p_court } : {}), ...(status === 'postponed' ? { status: 'scheduled' } : {}), note: typeof a.p_note === 'string' && a.p_note ? a.p_note : m.note });
      return done(null);
    case 'void_match':
      bump(m, { status: 'void', winner_side: null, scorer_id: null, lease_until: null, note: typeof a.p_note === 'string' ? a.p_note : m.note });
      afterResult();
      return done(null);
    case 'delete_match':
      s.matches = s.matches.filter((x) => x !== m);
      s.sides = s.sides.filter((x) => x.match_id !== mid);
      s.mplayers = s.mplayers.filter((x) => x.match_id !== mid);
      s.rsvps = s.rsvps.filter((x) => x.match_id !== mid);
      s.officials = s.officials.filter((x) => x.match_id !== mid);
      if (typeof m.series_id === 'string') refreshSeries(s, m.series_id, uid, leagueRules);
      return done(null);
    default:
      return undefined;
  }
}

/**
 * Vuelve a contar una serie de playoff (private.playoff_refresh de la base): victorias, ganador, el siguiente juego si
 * nadie ha ganado y no hay uno pendiente, y el ganador a la serie siguiente (o campeón si es la final).
 */
function refreshSeries(s: State, seriesId: string, uid: string, rulesOf: (lid: string) => Row) {
  const x = s.series.find((y) => y.id === seriesId);
  if (!x) return;
  const games = s.matches.filter((m) => m.series_id === x.id);
  let winner: string | null = null;
  let wa = 0;
  let wb = 0;
  if (x.bye) winner = (x.team_a ?? x.team_b) as string | null;
  else {
    const need = Math.floor(Number(x.best_of) / 2) + 1;
    for (const g of games) {
      if (!counts(g) || (g.winner_side !== 1 && g.winner_side !== 2)) continue;
      const team = s.sides.find((sd) => sd.match_id === g.id && sd.side === g.winner_side)?.team_id;
      if (team && team === x.team_a) wa++;
      else if (team && team === x.team_b) wb++;
    }
    winner = x.team_a && wa >= need ? String(x.team_a) : x.team_b && wb >= need ? String(x.team_b) : null;
  }
  const prev = x.winner ?? null;
  Object.assign(x, { wins_a: wa, wins_b: wb, winner });
  if (winner) {
    // Ya hay ganador: sobran los juegos programados que no empezaron.
    const gone = new Set(games.filter((g) => (g.status === 'scheduled' || g.status === 'postponed') && Number(g.seq) === 0).map((g) => g.id));
    s.matches = s.matches.filter((m) => !gone.has(m.id));
    s.sides = s.sides.filter((sd) => !gone.has(sd.match_id));
  } else if (x.team_a && x.team_b && !games.some((g) => g.status !== 'void' && !counts(g))) {
    newGame(s, x, uid, rulesOf);
  }
  if (winner === prev) return;
  if (!x.next_series) {
    const p = s.playoffs.find((y) => y.id === x.playoff_id);
    if (p) Object.assign(p, { winner, status: winner ? 'finished' : 'active' });
    return;
  }
  const nx = s.series.find((y) => y.id === x.next_series);
  if (!nx) return;
  const side = x.next_side === 'a' ? 'a' : 'b';
  const seed = winner === x.team_a ? x.seed_a : winner === x.team_b ? x.seed_b : null;
  const label = winner === x.team_a ? x.label_a : winner === x.team_b ? x.label_b : null;
  const gone = new Set(s.matches.filter((m) => m.series_id === nx.id && (m.status === 'scheduled' || m.status === 'postponed') && Number(m.seq) === 0).map((m) => m.id));
  s.matches = s.matches.filter((m) => !gone.has(m.id));
  s.sides = s.sides.filter((sd) => !gone.has(sd.match_id));
  Object.assign(nx, { [`team_${side}`]: winner, [`seed_${side}`]: seed, [`label_${side}`]: label });
  refreshSeries(s, String(nx.id), uid, rulesOf);
}

/** El siguiente juego de la serie (sin fecha): el mejor sembrado es local en los juegos impares. */
function newGame(s: State, x: Row, uid: string, rulesOf: (lid: string) => Row) {
  const n = s.matches.filter((m) => m.series_id === x.id && m.status !== 'void').length + 1;
  const rounds = (s.playoffs.find((p) => p.id === x.playoff_id)?.best_of as number[] | undefined)?.length ?? 1;
  if (n > 2 * Number(x.best_of) + 1 || !x.team_a || !x.team_b) return;
  let aHome = Number(x.seed_a ?? 99) <= Number(x.seed_b ?? 99);
  if (n % 2 === 0) aHome = !aHome;
  const lid = String(x.league_id);
  const stage = `${roundName(Number(x.round), rounds)}${Number(x.best_of) > 1 || n > 1 ? ` · Juego ${n}` : ''}`.slice(0, 40);
  const mid = uuidv7();
  const m = matchRow({ id: mid, league: lid, round: Number(x.round), stage, at: null, seriesId: String(x.id) });
  m.bracket_key = `PO${x.round}-${x.slot}`;
  m.rules = rulesOf(lid);
  m.created_by = uid;
  m.created_at = iso();
  s.matches.push(m);
  const [home, away] = aHome ? (['a', 'b'] as const) : (['b', 'a'] as const);
  s.sides.push(
    { league_id: lid, match_id: mid, side: 1, team_id: x[`team_${home}`], label: x[`label_${home}`], seed: x[`seed_${home}`] },
    { league_id: lid, match_id: mid, side: 2, team_id: x[`team_${away}`], label: x[`label_${away}`], seed: x[`seed_${away}`] },
  );
}
