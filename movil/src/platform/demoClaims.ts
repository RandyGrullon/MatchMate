/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): «Mi reclamo» de la cuenta de prueba (ClaimBanner,
 * movil/src/components/claims). Contesta lo que pide la cuenta en src/lib/data/claims.ts (request_player_claim y
 * cancel_player_claim), con la misma forma y las mismas reglas que la base (20260929000100_reclamos.sql), y deja el
 * pedido cuando se une eligiendo «¿Quién eres?» (join_league con p_prefer: lo apunta y sigue la Agenda, que es la que
 * une). Pone encima de las filas de abajo los pedidos de la cuenta (player_claims) y, si un admin pidió un jugador
 * (queda aprobado al momento), el jugador pedido con la cuenta y sin el suyo (players, memberships).
 *
 * Para ver la tarjeta: en «Liga Abierta de Ejemplo» (la de boliche de la Agenda, demoAgenda.ts) la cuenta trae un pedido
 * ya rechazado de «Jugador Sin Cuenta» (sale cuando entra a la liga); al cerrarlo sale «¿Ya jugabas en esta liga? Busca
 * tu nombre», y al pedirlo queda «Mi reclamo: pendiente de aprobación». Se guarda en sessionStorage y se borra al salir
 * de la demostración (forgetDemoClaims). Todos los datos son ficticios.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { uuidv7 } from '@mm/lib/db/ids';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de la capa de abajo de una tabla, sin filtrar; null si no la tiene. */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-reclamos';
const DAY = 86_400_000;
const NOTE_MAX = 300;
/** Pedidos por cuenta en un día (private.rate_blocked de la base). */
const DAILY_LIMIT = 10;

/** «Liga Abierta de Ejemplo» (demoAgenda.ts), su dueño y su jugador sin cuenta, «Jugador Sin Cuenta». */
const AGENDA_BOWL = '00000000-0000-7000-8000-00000000ab01';
const AGENDA_OWNER = '00000000-0000-7000-8000-00000000d0ff';
const AGENDA_FREE = '00000000-0000-7000-8000-00000000ab11';
/** El pedido de la cuenta que el admin de esa liga ya rechazó. */
const REJECTED = '00000000-0000-7000-8000-0000000c1b01';

/** Lo que jugó un jugador (lo que se juntaría al aprobar): usePlayerHistory de src/components/claims/data.ts. */
const HISTORY_TABLES = ['entries', 'match_players', 'golf_cards', 'swim_entries'];

interface State {
  /** Los pedidos de la cuenta (pedir, o «¿Quién eres?» al unirse). */
  added: Row[];
  /** Lo cambiado de cada pedido (cancelarlo, o el anterior de la liga al pedir otro). */
  patched: Record<string, Row>;
  /** Lo que pidió un admin (aprobado al momento): el jugador pedido queda con la cuenta y el suyo se va. */
  approved: { league: string; player: string; own: string | null }[];
}

const empty = (): State => ({ added: [], patched: {}, approved: [] });

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

export function forgetDemoClaims() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const fail = (message: string, kind: BackendErrorKind, code: string | null = message): never => {
  throw new BackendError(message, kind, code);
};

const matches = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    if (f.op === 'eq') return r[f.col] === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
    if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
    return true;
  });

const isMember = (memberships: readonly Row[], league: unknown, uid: string) => memberships.some((m) => m.league_id === league && m.user_id === uid);

/** El pedido ya rechazado de la cuenta en «Liga Abierta de Ejemplo» (las horas, contadas desde ahora). */
const rejectedRow = (uid: string): Row => ({
  id: REJECTED,
  league_id: AGENDA_BOWL,
  player_id: AGENDA_FREE,
  user_id: uid,
  status: 'rejected',
  note: null,
  claimant_name: 'Juan Pérez',
  player_name: 'Jugador Sin Cuenta',
  created_at: iso(-2 * DAY),
  updated_at: iso(-DAY),
  decided_by: AGENDA_OWNER,
  decided_at: iso(-DAY),
  decision_note: 'No te encontré en la planilla. Habla conmigo en la bolera.',
});

/** Una tabla con lo de esta capa encima (sin filtrar); null si no es de esta capa. */
function overlay(s: State, uid: string, table: string, read: Read): Row[] | null {
  if (table === 'player_claims') {
    const mine = [...(isMember(read('memberships') ?? [], AGENDA_BOWL, uid) ? [rejectedRow(uid)] : []), ...s.added];
    return [...(read('player_claims') ?? []), ...mine].map((c) => (s.patched[c.id as string] ? { ...c, ...s.patched[c.id as string] } : c));
  }
  if (!s.approved.length || (table !== 'players' && table !== 'memberships')) return null;
  const base = read(table);
  if (!base) return null;
  if (table === 'players') {
    const gone = new Set(s.approved.map((x) => x.own));
    const taken = new Set(s.approved.map((x) => x.player));
    return base.filter((p) => !gone.has(p.id as string)).map((p) => (taken.has(p.id as string) ? { ...p, user_id: uid } : p));
  }
  return base.map((m) => {
    // El último que pidió en esa liga.
    const x = m.user_id === uid ? [...s.approved].reverse().find((a) => a.league === m.league_id) : undefined;
    return x ? { ...m, player_id: x.player } : m;
  });
}

/**
 * Las filas de `table` con los pedidos de la cuenta y lo cambiado, con los filtros (eq, in y gt); null si la tabla no
 * es de esta capa (contesta la de abajo). `read`: la capa de abajo sin filtros.
 */
export function demoClaimsSelect(uid: string, table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  const rows = overlay(load(), uid, table, read);
  return rows ? rows.filter((r) => matches(r, filters)) : null;
}

/**
 * Lo que pide la cuenta: request_player_claim y cancel_player_claim. También mira join_league con p_prefer (deja el
 * pedido, como la base) y devuelve undefined para que la Agenda haga la unión. `read`: las tablas con todas las capas
 * (esta incluida). undefined si no es de esta parte.
 */
export function claimsRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  if (fn !== 'request_player_claim' && fn !== 'cancel_player_claim' && fn !== 'join_league') return undefined;
  const s = load();
  const claims = read('player_claims');
  const players = read('players');
  const memberships = read('memberships');
  const patch = (id: unknown, p: Row) => {
    const added = s.added.find((c) => c.id === id);
    if (added) Object.assign(added, p);
    else s.patched[String(id)] = { ...s.patched[String(id)], ...p };
  };
  /** Su pedido nuevo (antes se cancela el pendiente que tenía en esa liga: «cambió de idea»). */
  const file = (player: Row, note: string | null, status: 'pending' | 'approved') => {
    for (const c of claims) {
      if (c.league_id === player.league_id && c.user_id === uid && c.status === 'pending') patch(c.id, { status: 'cancelled', decided_at: iso(), updated_at: iso() });
    }
    const name = memberships.find((m) => m.league_id === player.league_id && m.user_id === uid)?.display_name ?? memberships.find((m) => m.user_id === uid)?.display_name;
    const row: Row = {
      id: uuidv7(),
      league_id: player.league_id,
      player_id: player.id,
      user_id: uid,
      status,
      note,
      claimant_name: String(name ?? '').slice(0, 60),
      player_name: String(player.name ?? '').slice(0, 60),
      created_at: iso(),
      updated_at: iso(),
      decided_by: status === 'approved' ? uid : null,
      decided_at: status === 'approved' ? iso() : null,
      decision_note: null,
    };
    s.added.push(row);
    return row;
  };

  // ---------- Unirse eligiendo «¿Quién eres?» ----------
  if (fn === 'join_league') {
    const p = typeof a.p_prefer === 'string' ? players.find((x) => x.id === a.p_prefer && x.league_id === a.p_league) : undefined;
    // Ya miembro, el jugador ya tiene cuenta, es menor o alguien más lo pidió: la base no deja pedido.
    if (!p || p.user_id || p.is_minor || isMember(memberships, a.p_league, uid) || claims.some((c) => c.player_id === p.id && c.status === 'pending')) return undefined;
    file(p, null, 'pending');
    save(s);
    return undefined;
  }

  // ---------- Cancelar el suyo ----------
  if (fn === 'cancel_player_claim') {
    const c = claims.find((x) => x.id === a.p_claim && x.user_id === uid) ?? fail('no_existe', 'not_found');
    if (c.status === 'cancelled') return null;
    if (c.status !== 'pending') fail('invalido', 'validation');
    patch(c.id, { status: 'cancelled', decided_at: iso(), updated_at: iso() });
    save(s);
    return null;
  }

  // ---------- Pedir ser ese jugador ----------
  const note = typeof a.p_note === 'string' && a.p_note.trim() ? a.p_note.trim() : null;
  if ((note?.length ?? 0) > NOTE_MAX) fail('invalido', 'validation');
  const player = players.find((p) => p.id === a.p_player) ?? fail('no_existe', 'not_found');
  const league = player.league_id;
  const member = memberships.find((m) => m.league_id === league && m.user_id === uid) ?? fail('no_permitido', 'permission');
  if (player.user_id === uid) return null;
  if (player.user_id) fail('duplicado', 'conflict');
  if (player.is_minor) fail('invalido', 'validation');
  const same = claims.find((c) => c.player_id === player.id && c.status === 'pending' && c.user_id === uid);
  if (same) return same.id;
  if (claims.some((c) => c.player_id === player.id && c.status === 'pending')) fail('duplicado', 'conflict');
  if (s.added.filter((c) => Date.now() - Date.parse(String(c.created_at)) < DAY).length >= DAILY_LIMIT) fail('rate_limited', 'rate_limited');

  const owner = read('leagues').find((l) => l.id === league)?.owner_id === uid;
  if (!owner && member.role !== 'owner' && member.role !== 'admin') {
    const row = file(player, note, 'pending');
    save(s);
    return row.id;
  }
  // Un admin queda aprobado al momento: los dos jugadores se juntan en el pedido. Aquí solo si el suyo no jugó nada
  // (lo de la tarjeta del inicio); con juegos, lo junta la capa de abajo (si la tiene).
  const own = (member.player_id as string | null) ?? (players.find((p) => p.league_id === league && p.user_id === uid)?.id as string | undefined) ?? null;
  if (own && HISTORY_TABLES.some((t) => read(t).some((r) => r.player_id === own))) return undefined;
  const row = file(player, note, 'approved');
  s.approved.push({ league: String(league), player: String(player.id), own: own === player.id ? null : own });
  save(s);
  return row.id;
}
