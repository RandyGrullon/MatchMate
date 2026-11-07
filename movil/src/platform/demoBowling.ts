/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): lo del organizador del boliche en las ligas
 * ficticias (demoLeague.ts). Contesta las RPC de crear, configurar y eliminar un evento (create_event, update_event,
 * delete_event), la Planilla (add_practice_game, save_game, add_entries, remove_entry y update_entry sin `team_id`: la
 * foto de un juego) y las pistas (assign_lanes, set_player_lane, clear_lanes, publish_lanes), con la misma forma que la
 * base, y pone lo cambiado encima de las filas de la liga (events, entries, event_lanes y, de un evento eliminado,
 * submissions y teams). Se guarda en sessionStorage y se borra al salir de la demostración (forgetDemoBowling). Todos
 * los datos son ficticios.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { uuidv7 } from '@mm/lib/db/ids';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de una tabla como están en la capa de abajo, sin filtrar (null si no es de las ligas ficticias). */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-boliche';
const NO_PHOTO = 'sin-foto';

/** Lo cambiado de un juego de una inscripción (lo que no está, como estaba). */
interface Cell {
  score?: number | null;
  photo?: string | null;
  /** Los tiros del juego (null = sin cuadros). */
  frame?: unknown;
}

interface State {
  /** Eventos creados (create_event). */
  events: Row[];
  /** Lo cambiado de cada evento (update_event, add_practice_game), con las claves de la base. */
  eventPatch: Record<string, Row>;
  /** Eventos eliminados (delete_event). */
  removedEvents: string[];
  /** Inscripciones nuevas (add_entries). */
  entries: Row[];
  /** Lo cambiado de cada juego de una inscripción (save_game, update_entry): `<inscripción>` → `<juego>` → lo nuevo. */
  cells: Record<string, Record<string, Cell>>;
  /** Inscripciones quitadas (remove_entry). */
  removedEntries: string[];
  /** Las pistas de cada evento que se tocaron (reemplazan a las de la liga). */
  lanes: Record<string, Row[]>;
}

const empty = (): State => ({ events: [], eventPatch: {}, removedEvents: [], entries: [], cells: {}, removedEntries: [], lanes: {} });

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

export function forgetDemoBowling() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

const iso = () => new Date().toISOString();
const fail = (message: string, kind: BackendErrorKind, code: string | null = null): never => {
  throw new BackendError(message, kind, code);
};
const invalid = () => fail('invalido', 'validation', 'invalido');
const denied = () => fail('no_permitido', 'permission', 'no_permitido');
const int = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : invalid();
};

const matches = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    if (f.op === 'eq') return r[f.col] === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
    if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
    return true;
  });

/** Una inscripción con sus juegos cambiados encima (los arreglos del largo que haga falta). */
function withCells(e: Row, cells: Record<string, Cell> | undefined): Row {
  if (!cells) return e;
  const scores = [...(((e.scores as (number | null)[] | null) ?? []) as (number | null)[])];
  const photos = [...(((e.photos as (string | null)[] | null) ?? []) as (string | null)[])];
  const frames = { ...((e.frames as Record<string, unknown> | null) ?? {}) };
  for (const [k, cell] of Object.entries(cells)) {
    const i = Number(k);
    while (scores.length <= i) scores.push(null);
    while (photos.length <= i) photos.push(null);
    if ('score' in cell) scores[i] = cell.score ?? null;
    if ('photo' in cell) photos[i] = cell.photo ?? null;
    if ('frame' in cell) {
      if (cell.frame == null) delete frames[k];
      else frames[k] = cell.frame;
    }
  }
  return { ...e, scores, photos, frames: Object.keys(frames).length ? frames : null };
}

/** Una tabla de la liga con lo cambiado encima (sin filtrar); null si no es de las que toca el organizador del boliche. */
function overlay(s: State, table: string, read: Read): Row[] | null {
  const gone = new Set(s.removedEvents);
  if (table === 'events') {
    const base = read('events');
    if (!base) return null;
    return [...base, ...s.events].filter((e) => !gone.has(e.id as string)).map((e) => (s.eventPatch[e.id as string] ? { ...e, ...s.eventPatch[e.id as string] } : e));
  }
  if (table === 'entries') {
    const base = read('entries');
    if (!base) return null;
    const removed = new Set(s.removedEntries);
    return [...base, ...s.entries].filter((e) => !removed.has(e.id as string) && !gone.has(e.event_id as string)).map((e) => withCells(e, s.cells[e.id as string]));
  }
  if (table === 'event_lanes') {
    const base = read('event_lanes') ?? [];
    const touched = new Set(Object.keys(s.lanes));
    return [...base.filter((r) => !touched.has(r.event_id as string)), ...Object.values(s.lanes).flat()].filter((r) => !gone.has(r.event_id as string));
  }
  if (table === 'submissions' || table === 'teams') {
    const base = read(table);
    if (!base || !gone.size) return null;
    return base.filter((r) => !gone.has(r.event_id as string));
  }
  return null;
}

/**
 * Las filas de `table` con lo cambiado por el organizador del boliche y los filtros (eq, in y gt); null si la tabla no
 * es de las que toca (entonces contesta la capa de abajo como siempre). `read`: la capa de abajo, sin filtrar.
 */
export function demoBowlingSelect(table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  const rows = overlay(load(), table, read);
  return rows ? rows.filter((r) => matches(r, filters)) : null;
}

const FNS = [
  'create_event',
  'update_event',
  'delete_event',
  'add_practice_game',
  'save_game',
  'add_entries',
  'remove_entry',
  'update_entry',
  'assign_lanes',
  'set_player_lane',
  'clear_lanes',
  'publish_lanes',
];

/** Las claves de un evento que cambia update_event (las de eventPatch en src/lib/data/events.ts). */
const EVENT_KEYS = ['type', 'name', 'date', 'games', 'hcp_base', 'hcp_percent', 'individual_rank_by', 'team_rank_by', 'category_cuts', 'team_size', 'announcement', 'start_time'];

/**
 * Las RPC del organizador del boliche en las ligas ficticias. `read`: las filas de una tabla como están ahora, con
 * todas las capas (también esta: demoBowlingSelect) y sin filtrar. undefined si no es de aquí o lo pedido no es de una
 * liga de boliche ficticia (sigue demoBackend como siempre).
 */
export function bowlingRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  if (!FNS.includes(fn)) return undefined;
  const s = load();
  // Lo de ahora (read ya trae lo cambiado aquí); lo que cambia esta llamada va a `s`.
  const view = read;
  const bowling = new Set(read('leagues').filter((l) => (l.sport ?? 'bowling') === 'bowling').map((l) => l.id));
  const role = (league: unknown) => read('memberships').find((m) => m.league_id === league && m.user_id === uid) ?? null;
  const isAdmin = (league: unknown) => ['owner', 'admin'].includes(String(role(league)?.role));
  const eventOf = (id: unknown) => view('events').find((e) => e.id === id && bowling.has(e.league_id)) ?? null;
  // Anota los juegos de todos: el admin y, en un torneo, el anotador de la liga (canScoreEvent de la web).
  const canScore = (ev: Row) => isAdmin(ev.league_id) || (role(ev.league_id)?.is_scorer === true && ev.type === 'torneo');
  const done = <T>(out: T): T => {
    save(s);
    return out;
  };

  if (fn === 'create_event') {
    if (!bowling.has(a.p_league)) return undefined;
    if (!isAdmin(a.p_league)) denied();
    const type = a.p_type === 'torneo' ? 'torneo' : a.p_type === 'practica' ? 'practica' : invalid();
    if (typeof a.p_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a.p_date)) invalid();
    s.events.push({
      id: a.p_id ?? uuidv7(),
      league_id: a.p_league,
      type,
      name: String(a.p_name ?? '').trim().slice(0, 80),
      date: a.p_date,
      start_time: a.p_start_time ?? null,
      games: int(a.p_games, 1, 10),
      hcp_base: int(a.p_hcp_base ?? 0, 0, 300),
      hcp_percent: int(a.p_hcp_percent ?? 0, 0, 100),
      individual_rank_by: a.p_individual_rank_by ?? null,
      team_rank_by: a.p_team_rank_by ?? null,
      category_cuts: a.p_category_cuts ?? null,
      team_size: int(a.p_team_size ?? 0, 0, 10),
      announcement: String(a.p_announcement ?? '').slice(0, 500),
      player_count: 0,
      created_at: iso(),
    });
    return done(null);
  }

  // Lo que pide un evento: el evento (de una liga de boliche ficticia) y quién puede.
  const evId = fn === 'save_game' || fn === 'remove_entry' || fn === 'update_entry' ? view('entries').find((e) => e.id === a.p_entry)?.event_id : a.p_event;
  const ev = eventOf(evId);
  if (!ev) return undefined;
  const id = ev.id as string;

  if (fn === 'update_event' || fn === 'delete_event' || fn === 'add_practice_game' || fn === 'add_entries' || fn === 'remove_entry') {
    // Otro juego en la práctica: cualquiera de la liga (la cola lo manda); lo demás, solo el admin.
    if (fn === 'add_practice_game' ? !role(ev.league_id) : !isAdmin(ev.league_id)) denied();
  } else if (!canScore(ev)) denied();

  if (fn === 'update_event') {
    const patch = (a.p_patch ?? {}) as Row;
    const clean: Row = {};
    for (const k of EVENT_KEYS) if (k in patch) clean[k] = patch[k];
    if ('games' in clean) clean.games = int(clean.games, 1, 10);
    s.eventPatch[id] = { ...s.eventPatch[id], ...clean };
    return done(null);
  }
  if (fn === 'delete_event') {
    s.removedEvents.push(id);
    s.events = s.events.filter((e) => e.id !== id);
    delete s.lanes[id];
    return done(null);
  }
  if (fn === 'add_practice_game') {
    const games = Number(ev.games);
    // Otro ya lo agregó (lo que veía el teléfono no es lo de ahora): no se suma dos veces.
    if (games >= 10 || Number(a.p_expected) !== games) return done(null);
    s.eventPatch[id] = { ...s.eventPatch[id], games: games + 1 };
    return done(null);
  }
  if (fn === 'add_entries') {
    const list = Array.isArray(a.p_players) ? (a.p_players as Row[]) : invalid();
    const players = new Set(read('players').filter((p) => p.league_id === ev.league_id).map((p) => p.id));
    const there = new Set(view('entries').filter((e) => e.event_id === id).map((e) => e.player_id));
    let added = 0;
    for (const p of list) {
      if (!players.has(p.player_id) || there.has(p.player_id)) continue;
      there.add(p.player_id);
      s.entries.push({
        id: uuidv7(),
        league_id: ev.league_id,
        event_id: id,
        player_id: p.player_id,
        team_id: null,
        average: Math.max(0, Math.round(Number(p.average) || 0)),
        handicap_override: null,
        scores: [],
        photos: [],
        frames: null,
      });
      added++;
    }
    return done(added);
  }
  if (fn === 'remove_entry') {
    s.removedEntries.push(a.p_entry as string);
    s.entries = s.entries.filter((e) => e.id !== a.p_entry);
    delete s.cells[a.p_entry as string];
    return done(null);
  }
  if (fn === 'save_game') {
    const game = int(a.p_game, 0, Number(ev.games) - 1);
    const score = a.p_score == null ? null : int(a.p_score, 0, 300);
    const league = read('leagues').find((l) => l.id === ev.league_id);
    const requirePhoto = league?.require_photo !== false;
    const entryId = a.p_entry as string;
    // Como la base: con la foto que la liga exige, el juego queda en borrador hasta verificarlo; sin, cuenta de una.
    s.cells[entryId] = { ...s.cells[entryId], [String(game)]: { score, photo: score != null && !requirePhoto ? NO_PHOTO : null, frame: a.p_frames ?? null } };
    return done(null);
  }
  if (fn === 'update_entry') {
    // Con `team_id` contesta demoTeams.ts (Torneo › Equipos); aquí, los juegos y las fotos (quitar la verificación).
    const patch = (a.p_patch ?? {}) as Row;
    if ('team_id' in patch) return undefined;
    const entryId = a.p_entry as string;
    const cells = { ...s.cells[entryId] };
    const put = (list: unknown, key: 'score' | 'photo') => {
      if (!Array.isArray(list)) return;
      list.forEach((v, i) => {
        cells[String(i)] = { ...cells[String(i)], [key]: v ?? null };
      });
    };
    put(patch.scores, 'score');
    put(patch.photos, 'photo');
    s.cells[entryId] = cells;
    return done(null);
  }

  // ---------- Pistas ----------
  const rows = () => view('event_lanes').filter((r) => r.event_id === id);
  const result = () => {
    const now = s.lanes[id] ?? rows();
    return { eventId: id, count: now.length, unpublished: now.filter((r) => r.published_at == null).length, publishedAt: null, lanes: [], text: '' };
  };
  if (fn === 'assign_lanes') {
    const lanes = [...new Set(Array.isArray(a.p_lanes) ? (a.p_lanes as number[]) : [])];
    const per = int(a.p_per_lane, 1, 20);
    const mode = a.p_mode === 'equipo' || a.p_mode === 'azar' ? a.p_mode : a.p_mode === 'promedio' ? 'promedio' : invalid();
    if (!lanes.length || lanes.length > 100 || lanes.some((n) => !Number.isInteger(n) || n < 1 || n > 999)) invalid();
    const entries = view('entries').filter((e) => e.event_id === id);
    const rsvp = view('event_rsvps').filter((r) => r.event_id === id && r.going);
    const ids = [...new Set([...entries.map((e) => e.player_id as string), ...rsvp.map((r) => r.player_id as string)])];
    if (ids.length > lanes.length * per) invalid();
    const order = Array.isArray(a.p_order) ? (a.p_order as string[]) : [];
    const teamOf = new Map(entries.map((e) => [e.player_id, e.team_id as string | null]));
    const teamOrder = new Map(view('teams').filter((t) => t.event_id === id).map((t) => [t.id, Number(t.sort_order) || 0]));
    const teams = mode === 'equipo' && entries.some((e) => e.team_id != null);
    const rank = (pid: string) => (order.includes(pid) ? order.indexOf(pid) : order.length);
    const sorted =
      mode === 'azar' || (mode === 'equipo' && !teams)
        ? ids.map((pid) => ({ pid, r: Math.random() })).sort((x, y) => x.r - y.r).map((x) => x.pid)
        : [...ids].sort((x, y) => {
            if (teams) {
              const tx = teamOf.get(x) ?? null;
              const ty = teamOf.get(y) ?? null;
              const ox = tx != null ? (teamOrder.get(tx) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
              const oy = ty != null ? (teamOrder.get(ty) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
              if (ox !== oy) return ox - oy;
              if (tx !== ty) return String(tx).localeCompare(String(ty));
            }
            return rank(x) - rank(y);
          });
    // Por promedio o al azar: las pistas que hacen falta, parejas (las primeras llevan uno más). Por equipo: cada
    // equipo empieza pista nueva si no cabe entero en lo que queda.
    const slots: { lane: number; pos: number }[] = [];
    if (teams) {
      let slot = 0;
      let at = 0;
      sorted.forEach((pid, i) => {
        const group = teamOf.get(pid) ?? pid;
        if (i === 0 || group !== (teamOf.get(sorted[i - 1]) ?? sorted[i - 1])) {
          const size = Math.min(per, sorted.filter((x) => (teamOf.get(x) ?? x) === group).length);
          if (at > 0 && at + size > per) {
            slot++;
            at = 0;
          }
        }
        if (at >= per) {
          slot++;
          at = 0;
        }
        slots.push({ lane: slot, pos: at++ });
      });
      if (slot >= lanes.length) sorted.forEach((_, g) => (slots[g] = { lane: Math.floor(g / per), pos: g % per }));
    } else if (sorted.length) {
      const used = Math.min(lanes.length, Math.ceil(sorted.length / per));
      const big = Math.floor(sorted.length / used);
      const extra = sorted.length % used;
      sorted.forEach((_, g) => {
        slots.push(g < (big + 1) * extra ? { lane: Math.floor(g / (big + 1)), pos: g % (big + 1) } : { lane: extra + Math.floor((g - (big + 1) * extra) / big), pos: (g - (big + 1) * extra) % big });
      });
    }
    s.lanes[id] = sorted.map((pid, g) => ({ event_id: id, player_id: pid, lane: lanes[slots[g].lane], position: slots[g].pos + 1, published_at: null }));
    return done(result());
  }
  if (fn === 'set_player_lane') {
    const pid = a.p_player as string;
    const lane = a.p_lane == null ? null : int(a.p_lane, 1, 999);
    const now = (s.lanes[id] ?? rows()).filter((r) => r.player_id !== pid);
    // Los de la pista de donde salió se corren (sin huecos); el que llega va al final de la otra.
    const from = (s.lanes[id] ?? rows()).find((r) => r.player_id === pid)?.lane;
    let pos = 0;
    const renumbered = now
      .sort((x, y) => Number(x.lane) - Number(y.lane) || Number(x.position) - Number(y.position))
      .map((r) => (r.lane === from ? { ...r, position: ++pos, published_at: null } : r));
    if (lane != null) {
      const last = Math.max(0, ...renumbered.filter((r) => r.lane === lane).map((r) => Number(r.position)));
      renumbered.push({ event_id: id, player_id: pid, lane, position: last + 1, published_at: null });
    }
    s.lanes[id] = renumbered;
    return done(result());
  }
  if (fn === 'clear_lanes') {
    const n = (s.lanes[id] ?? rows()).length;
    s.lanes[id] = [];
    return done(n);
  }
  // publish_lanes: cada fila queda avisada; «le avisamos» a los de la lista que tienen cuenta.
  const at = iso();
  const now: Row[] = (s.lanes[id] ?? rows()).map((r) => ({ ...r, published_at: at }));
  s.lanes[id] = now;
  const players = read('players');
  const pushed = now.filter((r) => players.some((p) => p.id === r.player_id && p.user_id)).length;
  return done({ players: now.length, pushed });
}
