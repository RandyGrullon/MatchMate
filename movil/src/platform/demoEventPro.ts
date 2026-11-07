/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): lo de Pro del evento del boliche en las ligas
 * ficticias (demoLeague.ts):
 * - Torneo › Inscritos: update_entry con el promedio o el handicap fijo (sin juegos, fotos ni equipo: esos los contestan
 *   demoBowling.ts y demoTeams.ts) y update_entries («Actualizar promedios»).
 * - Planilla › Verificar con foto: save_verified_games (inscribe a los nuevos y pone los juegos con su foto con las RPC
 *   de demoBowling.ts, que guarda los juegos de la demo) y la fila de la foto en `photos`; y la lectura de la foto
 *   (scan-bowling) de cualquier foto de un evento ficticio: los inscritos con juegos inventados.
 * Pone lo cambiado encima de las filas (entries y photos). Se guarda en sessionStorage y se borra al salir de la
 * demostración (forgetDemoEventPro). Todos los datos son ficticios.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { bowlingRpc } from './demoBowling';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de una tabla como están en la capa de abajo, sin filtrar (null si no es de las ligas ficticias). */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-evento-pro';

interface State {
  /** El promedio y el handicap fijo cambiados de cada inscripción (con las claves de la base). */
  entries: Record<string, { average?: number; handicap_override?: number | null }>;
  /** Las fotos con que se verificaron juegos (save_verified_games). */
  photos: Row[];
}

const empty = (): State => ({ entries: {}, photos: [] });

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

export function forgetDemoEventPro() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nada que borrar
  }
}

const fail = (message: string, kind: BackendErrorKind, code: string | null = null): never => {
  throw new BackendError(message, kind, code);
};
const invalid = () => fail('invalido', 'validation', 'invalido');
const denied = () => fail('no_permitido', 'permission', 'no_permitido');

const matches = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    if (f.op === 'eq') return r[f.col] === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
    if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
    return true;
  });

/**
 * Las filas de `table` con lo cambiado aquí y los filtros; null si la tabla no es de las que toca (contesta la capa de
 * abajo como siempre). `read`: la capa de abajo, sin filtrar.
 */
export function demoEventProSelect(table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  const s = load();
  if (table === 'entries') {
    const base = read('entries');
    if (!base || !Object.keys(s.entries).length) return null;
    return base.map((e) => (s.entries[e.id as string] ? { ...e, ...s.entries[e.id as string] } : e)).filter((r) => matches(r, filters));
  }
  if (table === 'photos') {
    if (!s.photos.length) return null;
    return [...(read('photos') ?? []), ...s.photos].filter((r) => matches(r, filters));
  }
  return null;
}

const ENTRY_KEYS = ['average', 'handicap_override'];

/** Un número de 0 a 300 (lo que la base acepta para el promedio y el handicap). */
const pins = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 300 ? n : invalid();
};

/**
 * Las RPC de lo de Pro del evento en las ligas ficticias. `read`: las filas de una tabla como están ahora, con todas las
 * capas y sin filtrar. undefined si no es de aquí (sigue demoBackend como siempre). Va ANTES de las de demoTeams.ts y
 * demoBowling.ts (update_entry con el promedio también lo agarraría demoBowling.ts sin cambiar nada).
 */
export function eventProRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  if (fn !== 'update_entry' && fn !== 'update_entries' && fn !== 'save_verified_games') return undefined;
  const role = (league: unknown) => read('memberships').find((m) => m.league_id === league && m.user_id === uid) ?? null;
  const isAdmin = (league: unknown) => ['owner', 'admin'].includes(String(role(league)?.role));
  const bowling = new Set(read('leagues').filter((l) => (l.sport ?? 'bowling') === 'bowling').map((l) => l.id));
  const entryOf = (id: unknown) => read('entries').find((e) => e.id === id && bowling.has(e.league_id)) ?? null;

  if (fn === 'update_entry' || fn === 'update_entries') {
    const list =
      fn === 'update_entry' ? [{ id: a.p_entry, patch: a.p_patch }] : Array.isArray(a.p_patches) ? (a.p_patches as { id: unknown; patch: unknown }[]) : invalid();
    // Solo el promedio y el handicap fijo (lo demás lo contestan demoBowling.ts y demoTeams.ts).
    const mine = list.every((p) => {
      const keys = Object.keys((p.patch ?? {}) as Row);
      return keys.length > 0 && keys.every((k) => ENTRY_KEYS.includes(k));
    });
    if (!mine) return undefined;
    const rows = list.map((p) => ({ entry: entryOf(p.id), patch: p.patch as Row }));
    if (rows.some((r) => !r.entry)) return undefined;
    if (rows.some((r) => !isAdmin(r.entry!.league_id))) denied();
    const s = load();
    for (const { entry, patch } of rows) {
      const id = entry!.id as string;
      const next = { ...s.entries[id] };
      if ('average' in patch) next.average = pins(patch.average);
      if ('handicap_override' in patch) next.handicap_override = patch.handicap_override == null ? null : pins(patch.handicap_override);
      s.entries[id] = next;
    }
    save(s);
    return null;
  }

  // save_verified_games: el evento de una liga de boliche ficticia; el admin o el anotador del torneo.
  const ev = read('events').find((e) => e.id === a.p_event && bowling.has(e.league_id));
  if (!ev) return undefined;
  const league = ev.league_id as string;
  const games = Number(ev.games);
  const scorer = role(league)?.is_scorer === true && ev.type === 'torneo';
  if (!isAdmin(league) && !scorer) denied();
  const photo = (a.p_photo ?? null) as Row | null;
  const writes = Array.isArray(a.p_writes) ? (a.p_writes as Row[]) : invalid();
  if (!photo || typeof photo.id !== 'string') invalid();
  const photoId = (photo!.id as string).toLowerCase();
  const inEvent = () => read('entries').filter((e) => e.event_id === ev.id);
  // Los nuevos se inscriben (solo el admin), con su promedio.
  const newcomers = writes.filter((w) => !inEvent().some((e) => e.player_id === w.player_id));
  if (newcomers.length) {
    if (!isAdmin(league)) denied();
    bowlingRpc(uid, 'add_entries', { p_event: ev.id, p_players: newcomers.map((w) => ({ player_id: w.player_id, average: w.average ?? 0 })) }, read);
  }
  for (const w of writes) {
    const entry = inEvent().find((e) => e.player_id === w.player_id);
    if (!entry) invalid();
    const values = (w.values ?? {}) as Record<string, unknown>;
    const scores = Array.from({ length: games }, (_, i) => ((entry!.scores as (number | null)[] | null) ?? [])[i] ?? null);
    const photos = Array.from({ length: games }, (_, i) => ((entry!.photos as (string | null)[] | null) ?? [])[i] ?? null);
    for (const [k, v] of Object.entries(values)) {
      const i = Number(k);
      if (!Number.isInteger(i) || i < 0 || i >= games) invalid();
      scores[i] = pins(v);
      photos[i] = photoId;
    }
    bowlingRpc(uid, 'update_entry', { p_entry: entry!.id, p_patch: { scores, photos } }, read);
  }
  const s = load();
  const type = String(photo!.content_type ?? 'image/jpeg');
  s.photos.push({
    id: photoId,
    league_id: league,
    event_id: ev.id,
    path: `${league.toLowerCase()}/${photoId}.${type === 'image/jpeg' ? 'jpg' : 'webp'}`,
    width: photo!.width ?? null,
    height: photo!.height ?? null,
    purged_at: null,
  });
  save(s);
  return photoId;
}

/**
 * La lectura de la foto del marcador (Edge Function scan-bowling) de una foto cualquiera de un evento ficticio: cada
 * inscrito con juegos inventados (lo de verdad lo lee la IA). undefined si no es de aquí (sigue demoBackend).
 */
export function demoEventProInvoke(fn: string, body: unknown, read: (table: string) => Row[]): unknown {
  if (fn !== 'scan-bowling') return undefined;
  const eventId = (body as { eventId?: unknown } | null)?.eventId;
  const ev = read('events').find((e) => e.id === eventId);
  if (!ev) return undefined;
  const games = Math.min(Number(ev.games) || 3, 10);
  const names = new Map(read('players').map((p) => [p.id, String(p.name ?? '')]));
  const rows = read('entries')
    .filter((e) => e.event_id === ev.id && names.get(e.player_id))
    .slice(0, 8)
    .map((e, k) => {
      const list = Array.from({ length: games }, (_, i) => 150 + ((k * 17 + i * 23) % 80));
      return { name: names.get(e.player_id)!, handicap: null, games: list, total: list.reduce((n, g) => n + g, 0), matchesTotal: true };
    });
  return { rows, model: 'demostración', cached: false };
}
