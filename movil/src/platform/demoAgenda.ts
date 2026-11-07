/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): el Calendario › Abiertas («¿Dónde juego esta
 * semana?») con ligas públicas ficticias. Contesta public_agenda (src/lib/data/agenda.ts) con la misma forma que la
 * base, y lo de «Me apunto» en esas ligas: join_league (también con el pedido de «¿Quién eres?»), set_rsvp,
 * golf_register y join_signup. Al unirse, la liga queda con la cuenta: pone encima de las filas de siempre su liga, su
 * membresía, su jugador, sus eventos y sus «Voy» (leagues, memberships, players, events, event_rsvps); la de boliche
 * tiene además un jugador sin cuenta para que salga «¿Quién eres?». Se guarda en sessionStorage y se borra al salir de
 * la demostración (forgetDemoAgenda). Todos los datos son ficticios.
 */
import { uuidv7 } from '@mm/lib/db/ids';
import { toIsoDate } from '@mm/lib/format';
import { formatTime } from '@mm/lib/schedule';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de una tabla de las capas de abajo, sin filtrar (null si no la tienen). */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-agenda';
const DAY = 86_400_000;

const BOWL = '00000000-0000-7000-8000-00000000ab01';
const GOLF = '00000000-0000-7000-8000-00000000ab02';
const PADEL = '00000000-0000-7000-8000-00000000ab03';
/** El jugador sin cuenta de la liga de boliche (para «¿Quién eres?»). */
const FREE_PLAYER = '00000000-0000-7000-8000-00000000ab11';
/** El jugador de la cuenta en cada liga, cuando se une. */
const MY_PLAYER: Record<string, string> = {
  [BOWL]: '00000000-0000-7000-8000-00000000ab21',
  [GOLF]: '00000000-0000-7000-8000-00000000ab22',
  [PADEL]: '00000000-0000-7000-8000-00000000ab23',
};

interface League {
  id: string;
  name: string;
  sport: string;
  venue: string;
  schedule: string;
}
const LEAGUES: League[] = [
  { id: BOWL, name: 'Liga Abierta de Ejemplo', sport: 'bowling', venue: 'Bolera de Ejemplo', schedule: 'Jueves 7:00 p. m.' },
  { id: GOLF, name: 'Golf Abierto de Ejemplo', sport: 'golf', venue: 'Campo de Ejemplo', schedule: 'Sábados 8:00 a. m.' },
  { id: PADEL, name: 'Pádel Abierto de Ejemplo', sport: 'padel', venue: 'Club de Ejemplo', schedule: 'Viernes 7:30 p. m.' },
];

/** Una fecha abierta: en cuántos días, a qué hora y cómo se apunta (con cuántos van ya, sin contar la cuenta). */
interface Open {
  id: string;
  league: string;
  type: string;
  name: string;
  inDays: number;
  time: string;
  join: 'rsvp' | 'golf' | 'signup';
  taken: number;
  cap?: number;
  /** Torneo por categorías: se apunta en su evento. */
  categories?: boolean;
  /** La inscripción cierra el día antes a las 6:00 p. m. */
  closes?: boolean;
}
const OPEN: Open[] = [
  { id: '00000000-0000-7000-8000-00000000ae01', league: BOWL, type: 'practica', name: '', inDays: 1, time: '19:00', join: 'rsvp', taken: 5 },
  { id: '00000000-0000-7000-8000-00000000ae02', league: PADEL, type: 'americano', name: 'Noche de pádel de ejemplo', inDays: 2, time: '19:30', join: 'signup', taken: 13, cap: 16, closes: true },
  { id: '00000000-0000-7000-8000-00000000ae03', league: GOLF, type: 'ronda', name: '', inDays: 4, time: '08:00', join: 'golf', taken: 6 },
  { id: '00000000-0000-7000-8000-00000000ae04', league: PADEL, type: 'torneo', name: 'Torneo de pádel de ejemplo', inDays: 6, time: '09:00', join: 'signup', taken: 10, cap: 24, categories: true, closes: true },
  { id: '00000000-0000-7000-8000-00000000ae05', league: BOWL, type: 'practica', name: '', inDays: 8, time: '19:00', join: 'rsvp', taken: 0 },
  { id: '00000000-0000-7000-8000-00000000ae06', league: PADEL, type: 'americano', name: 'Americano de ejemplo', inDays: 9, time: '19:30', join: 'signup', taken: 7, cap: 8 },
];

interface State {
  /** Las ligas donde la cuenta ya entró. */
  joined: string[];
  /** Las fechas donde la cuenta va, está inscrita o apuntada. */
  going: string[];
  /** Los que quedaron en espera (raqueta, sin lugar). */
  waiting: string[];
}

const empty = (): State => ({ joined: [], going: [], waiting: [] });

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

export function forgetDemoAgenda() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

const dateIn = (n: number) => toIsoDate(new Date(Date.now() + n * DAY));
/** El día antes de la fecha, a las 6:00 p. m. (la hora del teléfono). */
const closesAt = (n: number) => {
  const d = new Date(Date.now() + (n - 1) * DAY);
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
};
const leagueOf = (id: unknown) => LEAGUES.find((l) => l.id === id) ?? null;
const openOf = (id: unknown) => OPEN.find((o) => o.id === id) ?? null;
const add = (list: string[], id: string) => (list.includes(id) ? list : [...list, id]);

const matches = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    if (f.op === 'eq') return r[f.col] === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
    if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
    return true;
  });

/** Cuántos van contando a la cuenta, y si todavía hay lugar. */
function spotsOf(s: State, o: Open) {
  const taken = o.taken + (s.going.includes(o.id) ? 1 : 0);
  const spotsLeft = o.cap != null ? Math.max(0, o.cap - taken) : null;
  return { taken, spotsLeft, waitlist: o.cap != null ? s.waiting.filter((w) => w === o.id).length : null };
}

/** Una fecha como la manda public_agenda (AgendaItem). */
function agendaItem(s: State, o: Open): Row {
  const l = leagueOf(o.league)!;
  const { taken, spotsLeft, waitlist } = spotsOf(s, o);
  return {
    eventId: o.id,
    leagueId: l.id,
    leagueName: l.name,
    sport: l.sport,
    leagueKind: 'liga',
    logoPath: null,
    type: o.type,
    name: o.name,
    date: dateIn(o.inDays),
    time: o.time,
    timeLabel: formatTime(o.time),
    venue: l.venue,
    join: o.join,
    cap: o.cap ?? null,
    taken,
    spotsLeft,
    waitlist,
    until: o.closes ? closesAt(o.inDays) : null,
    categories: o.categories ? [{ id: `${o.id}:a`, name: 'Categoría A', cap: 12, taken: 5, spotsLeft: 7 }] : null,
    mine: s.going.includes(o.id) || s.waiting.includes(o.id),
    url: `/l/${l.id}/e/${o.id}`,
  };
}

const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

/** Las filas de las ligas públicas donde la cuenta ya entró (y el jugador sin cuenta del boliche, siempre). */
function rowsOf(uid: string, s: State, table: string): Row[] | null {
  const joined = LEAGUES.filter((l) => s.joined.includes(l.id));
  if (table === 'leagues') {
    return joined.map((l) => ({
      id: l.id,
      sport: l.sport,
      kind: 'liga',
      visibility: 'public',
      name: l.name,
      owner_id: '00000000-0000-7000-8000-00000000d0ff',
      venue: l.venue,
      schedule: l.schedule,
      season_start: null,
      season_end: null,
      contact_name: 'Persona de Prueba',
      contact_phone: '809-000-0000',
      require_photo: false,
      has_minors: false,
      tz: 'America/Santo_Domingo',
      logo_path: null,
      created_at: iso(-90 * DAY),
    }));
  }
  if (table === 'memberships') {
    return joined.map((l) => ({ league_id: l.id, user_id: uid, role: 'member', is_scorer: false, display_name: 'Juan Pérez', player_id: MY_PLAYER[l.id], scorer_only: false }));
  }
  if (table === 'players') {
    return [
      { id: FREE_PLAYER, league_id: BOWL, user_id: null, name: 'Jugador Sin Cuenta', average_override: null, is_minor: false },
      ...joined.map((l) => ({ id: MY_PLAYER[l.id], league_id: l.id, user_id: uid, name: 'Juan Pérez', average_override: null, is_minor: false })),
    ];
  }
  if (table === 'events') {
    return OPEN.filter((o) => s.joined.includes(o.league)).map((o) => ({
      id: o.id,
      league_id: o.league,
      type: o.type,
      name: o.name,
      date: dateIn(o.inDays),
      start_time: `${o.time}:00`,
      games: o.join === 'rsvp' ? 3 : 1,
      hcp_base: 0,
      hcp_percent: 0,
      individual_rank_by: null,
      team_rank_by: null,
      category_cuts: null,
      team_size: 1,
      announcement: '',
      player_count: spotsOf(s, o).taken,
      created_at: iso(-7 * DAY),
    }));
  }
  if (table === 'event_rsvps') {
    return OPEN.filter((o) => o.join === 'rsvp' && s.going.includes(o.id)).map((o) => ({ event_id: o.id, player_id: MY_PLAYER[o.league], going: true }));
  }
  return null;
}

/**
 * Las filas de `table` con lo de las ligas públicas de la agenda encima (filtros eq, in y gt); null si la tabla no es
 * de las que toca la agenda (entonces contesta la capa de abajo como siempre). `read`: la capa de abajo sin filtros.
 */
export function demoAgendaSelect(uid: string, table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  const mine = rowsOf(uid, load(), table);
  if (!mine) return null;
  return [...(read(table) ?? []), ...mine].filter((r) => matches(r, filters));
}

/**
 * Las RPC de la agenda pública ficticia: public_agenda y «Me apunto» (join_league, set_rsvp, golf_register y
 * join_signup) en sus ligas. undefined si no es de la agenda (sigue demoBackend como siempre).
 */
export function agendaRpc(_uid: string, fn: string, a: Record<string, unknown>): unknown {
  if (fn === 'public_agenda') {
    const s = load();
    const from = typeof a.p_from === 'string' && a.p_from ? a.p_from : dateIn(0);
    const days = Number(a.p_days) || 14;
    const to = toIsoDate(new Date(new Date(`${from}T12:00:00`).getTime() + days * DAY));
    const items = OPEN.map((o) => agendaItem(s, o))
      .filter((i) => (!a.p_sport || i.sport === a.p_sport) && String(i.date) >= from && String(i.date) < to)
      .sort((x, y) => String(x.date).localeCompare(String(y.date)) || String(x.time).localeCompare(String(y.time)));
    return { from, days, items };
  }
  if (fn === 'join_league') {
    const l = leagueOf(a.p_league);
    if (!l) return undefined;
    const s = load();
    s.joined = add(s.joined, l.id);
    save(s);
    // Si dijo ser el jugador sin cuenta, queda el pedido para el admin (mientras, juega con el suyo).
    return { league_id: l.id, player_id: MY_PLAYER[l.id], claim_id: a.p_prefer ? uuidv7() : null };
  }
  if (fn === 'set_rsvp' || fn === 'golf_register' || fn === 'join_signup') {
    const o = openOf(a.p_event);
    if (!o) return undefined;
    const s = load();
    if (fn === 'set_rsvp') {
      s.going = a.p_going === false ? s.going.filter((id) => id !== o.id) : add(s.going, o.id);
      save(s);
      return null;
    }
    if (fn === 'golf_register') {
      s.going = add(s.going, o.id);
      save(s);
      return uuidv7();
    }
    // join_signup: ya entra a la liga; con lugar queda en la lista, sin lugar en la espera.
    s.joined = add(s.joined, o.league);
    const full = spotsOf(s, o).spotsLeft === 0 && !s.going.includes(o.id);
    if (full) s.waiting = add(s.waiting, o.id);
    else s.going = add(s.going, o.id);
    save(s);
    // En la lista, el número es cuántos van (con la cuenta); en la espera, su lugar en la fila.
    const position = full ? s.waiting.indexOf(o.id) + 1 : spotsOf(s, o).taken;
    return { status: full ? 'wait' : 'in', position, entrant_id: uuidv7(), category: null };
  }
  return undefined;
}
