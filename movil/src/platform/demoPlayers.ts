/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): Organizar › Jugadores de las ligas ficticias
 * (demoLeague.ts). Contesta las RPC de src/lib/data/players.ts (create_player, update_player, delete_player,
 * set_player_minor, link_account_to_player, unlink_account, merge_league_players_preview, merge_league_players) y
 * golf_set_index, con la misma forma que la base, y pone lo cambiado encima de las filas fijas de la liga (players,
 * memberships, entries, submissions, event_lanes y player_private). Se guarda en sessionStorage y se borra al salir de
 * la demostración (forgetDemoPlayers). Todos los datos son ficticios.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { uuidv7 } from '@mm/lib/db/ids';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas fijas de una tabla de las ligas ficticias, sin filtrar (demoLeagueSelect sin filtros). */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-jugadores';

interface State {
  /** Jugadores nuevos (create_player, unlink_account). */
  added: Row[];
  /** Lo cambiado de cada jugador (nombre, promedio fijo, menor, attrs, cuenta). */
  patched: Record<string, Row>;
  /** Jugadores borrados (delete_player, o el que se fue al juntar). */
  removed: string[];
  /** Al juntar: lo del que se fue (id) es del que quedó. */
  moved: Record<string, string>;
  /** El jugador de cada cuenta (`<liga>:<cuenta>`), cuando cambió (vincular, separar, borrar). */
  members: Record<string, string | null>;
  /** Los datos del tutor de cada menor (player_private; solo admins). */
  guardians: Record<string, Row>;
}

const empty = (): State => ({ added: [], patched: {}, removed: [], moved: {}, members: {}, guardians: {} });

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

export function forgetDemoPlayers() {
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
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const memberKey = (league: unknown, user: unknown) => `${String(league)}:${String(user)}`;

const matches = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    if (f.op === 'eq') return r[f.col] === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
    if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
    return true;
  });

/** Lo de un jugador que se fue al juntar pasa al que quedó (también si se juntó dos veces). */
const ownerOf = (s: State, id: unknown): unknown => {
  let cur = id;
  for (let i = 0; i < 10 && typeof cur === 'string' && s.moved[cur]; i++) cur = s.moved[cur];
  return cur;
};

/** Una tabla de la liga ficticia con lo cambiado encima (sin filtrar); null si no es de las que toca Jugadores. */
function overlay(s: State, table: string, read: Read): Row[] | null {
  if (table === 'players') {
    const base = read('players') ?? [];
    return [...base, ...s.added]
      .filter((p) => !s.removed.includes(p.id as string))
      .map((p) => (s.patched[p.id as string] ? { ...p, ...s.patched[p.id as string] } : p))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
  }
  if (table === 'memberships') {
    return (read('memberships') ?? []).map((m) => {
      const k = memberKey(m.league_id, m.user_id);
      return k in s.members ? { ...m, player_id: s.members[k] } : m;
    });
  }
  if (table === 'entries' || table === 'submissions' || table === 'event_lanes') {
    const base = read(table);
    if (!base) return null;
    return base.flatMap((r) => {
      const owner = ownerOf(s, r.player_id);
      if (s.removed.includes(owner as string)) return [];
      return [owner === r.player_id ? r : { ...r, player_id: owner }];
    });
  }
  // Lo de los tutores cambiado aquí encima de lo de fábrica (el año y el sexo de los nadadores, otras ligas).
  if (table === 'player_private') return [...(read('player_private') ?? []).filter((r) => !(String(r.player_id) in s.guardians)), ...Object.values(s.guardians)];
  return null;
}

/**
 * Las filas de `table` con lo cambiado en Jugadores y los filtros (eq, in y gt); null si la tabla no es de las que
 * toca Jugadores (entonces contesta demoLeagueSelect como siempre). `read`: demoLeagueSelect sin filtros.
 */
export function demoPlayersSelect(table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  const rows = overlay(load(), table, read);
  return rows ? rows.filter((r) => matches(r, filters)) : null;
}

/** El tutor de un menor para player_private (create_player y set_player_minor piden el nombre y el permiso). */
function guardianRow(league: unknown, player: string, a: Record<string, unknown>): Row {
  const name = text(a.p_guardian_name);
  if (!name || a.p_consent !== true) fail('invalido', 'validation', 'invalido');
  const phone = text(a.p_guardian_phone);
  if (phone && !/^[0-9+]{1,20}$/.test(phone)) fail('invalido', 'validation', 'invalido');
  return { league_id: league, player_id: player, guardian_name: name.slice(0, 60), guardian_phone: phone || null, consent_at: iso() };
}

/**
 * Las RPC de Organizar › Jugadores en las ligas ficticias. `read`: las filas fijas de una tabla (demoLeagueSelect sin
 * filtros). undefined si no es de Jugadores o el jugador no es de una liga ficticia (sigue demoBackend como siempre).
 */
export function playersRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  const FNS = [
    'create_player',
    'update_player',
    'delete_player',
    'set_player_minor',
    'link_account_to_player',
    'unlink_account',
    'merge_league_players_preview',
    'merge_league_players',
    'golf_set_index',
  ];
  if (!FNS.includes(fn)) return undefined;
  const s = load();
  const view = (t: string) => overlay(s, t, read) ?? read(t);
  const players = view('players');
  const playerOf = (id: unknown) => players.find((p) => p.id === id) ?? null;
  const leagueOf = (id: unknown) => read('leagues').find((l) => l.id === id) ?? null;
  const isAdmin = (league: unknown) => view('memberships').some((m) => m.league_id === league && m.user_id === uid && (m.role === 'owner' || m.role === 'admin'));
  const patch = (id: string, p: Row) => {
    const added = s.added.find((x) => x.id === id);
    if (added) Object.assign(added, p);
    else s.patched[id] = { ...s.patched[id], ...p };
  };
  const remove = (id: string) => {
    s.added = s.added.filter((x) => x.id !== id);
    delete s.patched[id];
    delete s.guardians[id];
    if (!s.removed.includes(id)) s.removed.push(id);
  };

  // Crear: la liga tiene que ser una de las ficticias.
  if (fn === 'create_player') {
    if (!leagueOf(a.p_league)) return undefined;
    if (!isAdmin(a.p_league)) fail('no_permitido', 'permission', 'no_permitido');
    const name = text(a.p_name).slice(0, 60);
    if (!name) fail('invalido', 'validation', 'invalido');
    const id = typeof a.p_id === 'string' ? a.p_id : uuidv7();
    const minor = a.p_is_minor === true;
    const guardian = minor ? guardianRow(a.p_league, id, a) : null;
    const average = typeof a.p_average_override === 'number' ? Math.min(300, Math.max(0, Math.round(a.p_average_override))) : null;
    s.added.push({ id, league_id: a.p_league, user_id: null, name, average_override: average, is_minor: minor, attrs: null });
    if (guardian) s.guardians[id] = guardian;
    save(s);
    return id;
  }

  // Las demás: el jugador tiene que ser de una liga ficticia (o el de `p_keep` al juntar).
  const target = playerOf(fn.startsWith('merge_') ? a.p_keep : a.p_player);
  if (!target) {
    const known = fn.startsWith('merge_') ? leagueOf(a.p_league) : null;
    return known ? fail('no_existe', 'not_found', 'no_existe') : undefined;
  }
  const lid = target.league_id;
  const pid = target.id as string;
  if (!isAdmin(lid)) fail('no_permitido', 'permission', 'no_permitido');

  if (fn === 'update_player') {
    const p = (a.p_patch ?? {}) as Row;
    const next: Row = {};
    if (typeof p.name === 'string') {
      const name = p.name.trim().slice(0, 60);
      if (!name) fail('invalido', 'validation', 'invalido');
      next.name = name;
    }
    if ('average_override' in p) next.average_override = typeof p.average_override === 'number' ? Math.min(300, Math.max(0, Math.round(p.average_override))) : null;
    if ('attrs' in p) next.attrs = p.attrs ?? null;
    patch(pid, next);
    save(s);
    return null;
  }

  if (fn === 'golf_set_index') {
    const attrs = { ...((target.attrs as Row | null) ?? {}) };
    const golf = { ...((attrs.golf as Row | undefined) ?? {}) };
    if (typeof a.p_index === 'number') golf.index = a.p_index;
    else delete golf.index;
    attrs.golf = golf;
    patch(pid, { attrs });
    save(s);
    return null;
  }

  if (fn === 'delete_player') {
    // Su cuenta, si tiene, queda sin jugador; sus juegos, envíos y pistas se van con él.
    if (target.user_id) s.members[memberKey(lid, target.user_id)] = null;
    remove(pid);
    save(s);
    return null;
  }

  if (fn === 'set_player_minor') {
    if (target.user_id) fail('invalido', 'validation', 'invalido');
    if (a.p_is_minor === true) {
      s.guardians[pid] = guardianRow(lid, pid, a);
      patch(pid, { is_minor: true });
    } else {
      delete s.guardians[pid];
      patch(pid, { is_minor: false });
    }
    save(s);
    return null;
  }

  if (fn === 'link_account_to_player') {
    if (target.user_id || target.is_minor) fail('invalido', 'validation', 'invalido');
    const member = view('memberships').find((m) => m.league_id === lid && m.user_id === a.p_user) ?? fail('no_existe', 'not_found', 'no_existe');
    const old = typeof member.player_id === 'string' && member.player_id !== pid ? playerOf(member.player_id) : null;
    // El de antes: si nunca jugó un evento se borra; si jugó, se queda en la lista sin cuenta.
    const played = !!old && view('entries').some((e) => e.player_id === old.id);
    if (old && !played) remove(old.id as string);
    else if (old) patch(old.id as string, { user_id: null });
    patch(pid, { user_id: a.p_user });
    s.members[memberKey(lid, a.p_user)] = pid;
    save(s);
    return { removed_old: !!old && !played, old_player_id: old ? old.id : null };
  }

  if (fn === 'unlink_account') {
    const user = target.user_id ?? fail('invalido', 'validation', 'invalido');
    const member = view('memberships').find((m) => m.league_id === lid && m.user_id === user);
    // La cuenta sigue jugando con un jugador nuevo, con su nombre; este se queda en la lista sin cuenta.
    const id = uuidv7();
    s.added.push({ id, league_id: lid, user_id: user, name: String(member?.display_name ?? target.name), average_override: null, is_minor: false, attrs: null });
    patch(pid, { user_id: null });
    s.members[memberKey(lid, user)] = id;
    save(s);
    return id;
  }

  // ---------- Juntar ----------
  const keep = target;
  const drop = playerOf(a.p_drop);
  if (!drop || drop.league_id !== lid || a.p_league !== lid) fail('no_existe', 'not_found', 'no_existe');
  if (drop!.id === keep.id) fail('invalido', 'validation', 'invalido');
  const d = drop!;
  const reason = keep.user_id && d.user_id ? 'dos_cuentas' : (keep.is_minor || d.is_minor) && (keep.user_id ?? d.user_id) ? 'menor_con_cuenta' : null;
  const entries = view('entries');
  const eventsOf = (id: unknown) => new Set(entries.filter((e) => e.player_id === id).map((e) => e.event_id));
  const mine = eventsOf(keep.id);
  const both = [...eventsOf(d.id)].filter((e) => mine.has(e)).length;
  const conflicts = both ? [{ what: 'entries', label: 'Juegos en el mismo evento', count: both }] : [];
  const side = (p: Row) => ({ id: p.id, name: p.name, userId: p.user_id ?? null, isMinor: !!p.is_minor });
  if (fn === 'merge_league_players_preview') {
    return { canMerge: !reason && !conflicts.length, reason, conflicts, moveAccount: !reason && !!d.user_id, keep: side(keep), drop: side(d) };
  }
  if (reason) fail('invalido', 'validation', 'invalido');
  if (conflicts.length) fail(`conflicto: ${conflicts.map((x) => `${x.label} (${x.count})`).join(', ')}`, 'validation');
  // Lo que le falte al que queda (la cuenta, el promedio fijo, si es menor y su tutor) lo toma del que se va.
  const next: Row = {};
  if (!keep.user_id && d.user_id) {
    next.user_id = d.user_id;
    s.members[memberKey(lid, d.user_id)] = keep.id as string;
  }
  if (keep.average_override == null && d.average_override != null) next.average_override = d.average_override;
  if (!keep.is_minor && d.is_minor) next.is_minor = true;
  if (!s.guardians[keep.id as string] && s.guardians[d.id as string]) s.guardians[keep.id as string] = { ...s.guardians[d.id as string], player_id: keep.id };
  patch(keep.id as string, next);
  remove(d.id as string);
  s.moved[d.id as string] = keep.id as string;
  save(s);
  return { playerId: keep.id, removedId: d.id, userId: (next.user_id ?? keep.user_id ?? null) as string | null };
}
