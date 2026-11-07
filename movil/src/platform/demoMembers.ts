/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): Organizar › Miembros y Reclamos de las ligas
 * ficticias (demoLeague.ts). Pone en «Liga de Ejemplo» cinco cuentas más (una admin, una que anota, una que entró solo
 * para anotar, una que pide ser «Jugador Uno» y una que todavía no abrió la liga), sus jugadores y dos reclamos (uno
 * por decidir y uno ya rechazado). Contesta las RPC de src/lib/data/members.ts (set_member_role, set_member_scorer,
 * remove_member), set_member_badge_maker (src/lib/data/leagueBadges.ts) y las del admin en src/lib/data/claims.ts
 * (decide_player_claim, player_claim_conflicts), con la misma forma y las mismas reglas que la base, y pone lo
 * cambiado encima de las filas de abajo (memberships, players, player_claims y, al aprobar, entries, submissions y
 * event_lanes del jugador que se juntó). Se guarda en sessionStorage y se borra al salir de la demostración
 * (forgetDemoMembers). Todos los datos son ficticios.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { DEMO_LEAGUE } from './demoLeague';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de la capa de abajo de una tabla, sin filtrar; null si no la tiene. */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-miembros';
const DAY = 86_400_000;

// Las cuentas, los jugadores y los reclamos ficticios de «Liga de Ejemplo».
const USER = (n: number) => `00000000-0000-7000-8000-00000000d1a${n}`;
const PLAYER = (n: number) => `00000000-0000-7000-8000-00000000f1a${n}`;
const CLAIM = (n: number) => `00000000-0000-7000-8000-0000000c1a0${n}`;
/** «Jugador Uno» y «Jugadora Dos», los jugadores sin cuenta de demoLeague.ts. */
const PLAYER_ONE = '00000000-0000-7000-8000-00000000f102';
const PLAYER_TWO = '00000000-0000-7000-8000-00000000f103';

const member = (uid: string, name: string, extra: Row = {}): Row => ({
  league_id: DEMO_LEAGUE,
  user_id: uid,
  role: 'member',
  is_scorer: false,
  display_name: name,
  player_id: null,
  badge_maker: false,
  scorer_only: false,
  ...extra,
});
const MEMBERS: Row[] = [
  member(USER(1), 'Jugador Cuatro', { role: 'admin', player_id: PLAYER(1) }),
  member(USER(2), 'Jugadora Cinco', { is_scorer: true, player_id: PLAYER(2) }),
  member(USER(3), 'Anotador de Prueba', { is_scorer: true, scorer_only: true }),
  member(USER(4), 'Cuenta de Prueba', { player_id: PLAYER(4) }),
  // Se unió y todavía no abrió la liga: su jugador se crea al abrirla.
  member(USER(5), 'Jugador Seis'),
];

const player = (id: string, uid: string, name: string): Row => ({ id, league_id: DEMO_LEAGUE, user_id: uid, name, average_override: null, is_minor: false, attrs: null });
const PLAYERS: Row[] = [
  player(PLAYER(1), USER(1), 'Jugador Cuatro'),
  player(PLAYER(2), USER(2), 'Jugadora Cinco'),
  // El jugador propio de «Cuenta de Prueba» (se creó al unirse); al aprobar su reclamo se junta con «Jugador Uno».
  player(PLAYER(4), USER(4), 'Cuenta de Prueba'),
];

const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const claimRow = (id: string, extra: Row): Row => ({
  id,
  league_id: DEMO_LEAGUE,
  status: 'pending',
  note: null,
  decided_by: null,
  decided_at: null,
  decision_note: null,
  ...extra,
});
/** Los reclamos de la liga (las horas, contadas desde ahora). `owner`: quien decidió el ya rechazado. */
const claims = (owner: unknown): Row[] => [
  claimRow(CLAIM(1), {
    player_id: PLAYER_ONE,
    user_id: USER(4),
    note: 'Soy yo, juego los martes.',
    claimant_name: 'Cuenta de Prueba',
    player_name: 'Jugador Uno',
    created_at: iso(-2 * DAY),
    updated_at: iso(-2 * DAY),
  }),
  claimRow(CLAIM(2), {
    player_id: PLAYER_TWO,
    user_id: USER(2),
    status: 'rejected',
    claimant_name: 'Jugadora Cinco',
    player_name: 'Jugadora Dos',
    created_at: iso(-5 * DAY),
    updated_at: iso(-4 * DAY),
    decided_by: owner ?? null,
    decided_at: iso(-4 * DAY),
    decision_note: 'Habla conmigo en la bolera.',
  }),
];

interface State {
  /** Lo cambiado de cada membresía (`<liga>:<cuenta>`): role, is_scorer, badge_maker y, al aprobar, player_id. */
  members: Record<string, Row>;
  /** Las membresías que ya no están (sacar de la liga, o quitarle anotador a quien entró solo para anotar). */
  left: string[];
  /** Lo cambiado de cada jugador (al aprobar, su cuenta; al salir la cuenta de la liga, sin cuenta). */
  players: Record<string, Row>;
  /** Los jugadores que se fueron al aprobar (el propio de la cuenta, que se junta con el pedido). */
  removed: string[];
  /** Al aprobar: lo del jugador propio de la cuenta (id) es del pedido. */
  moved: Record<string, string>;
  /** Lo cambiado de cada reclamo (decidir; cancelar si la cuenta sale de la liga). */
  claims: Record<string, Row>;
}

const empty = (): State => ({ members: {}, left: [], players: {}, removed: [], moved: {}, claims: {} });

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

export function forgetDemoMembers() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

const fail = (message: string, kind: BackendErrorKind, code: string | null = null): never => {
  throw new BackendError(message, kind, code);
};
const deny = () => fail('no_permitido', 'permission', 'no_permitido');
const keyOf = (league: unknown, user: unknown) => `${String(league)}:${String(user)}`;

const matches = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    if (f.op === 'eq') return r[f.col] === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
    if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
    return true;
  });

/** Lo de un jugador que se juntó al aprobar pasa al del pedido (también si se juntó dos veces). */
const ownerOf = (s: State, id: unknown): unknown => {
  let cur = id;
  for (let i = 0; i < 10 && typeof cur === 'string' && s.moved[cur]; i++) cur = s.moved[cur];
  return cur;
};

/** Una tabla con las filas de «Liga de Ejemplo» y lo cambiado encima (sin filtrar); null si no es de esta capa. */
function overlay(s: State, table: string, read: Read): Row[] | null {
  if (table === 'memberships') {
    return [...(read('memberships') ?? []), ...MEMBERS]
      .filter((m) => !s.left.includes(keyOf(m.league_id, m.user_id)))
      .map((m) => {
        const patch = s.members[keyOf(m.league_id, m.user_id)];
        return patch ? { ...m, ...patch } : m;
      });
  }
  if (table === 'players') {
    return [...(read('players') ?? []), ...PLAYERS]
      .filter((p) => !s.removed.includes(p.id as string))
      .map((p) => (s.players[p.id as string] ? { ...p, ...s.players[p.id as string] } : p));
  }
  if (table === 'player_claims') {
    const owner = (read('leagues') ?? []).find((l) => l.id === DEMO_LEAGUE)?.owner_id;
    return [...(read('player_claims') ?? []), ...claims(owner)].map((c) => (s.claims[c.id as string] ? { ...c, ...s.claims[c.id as string] } : c));
  }
  // Lo jugado: solo cambia si se juntaron jugadores al aprobar.
  if ((table === 'entries' || table === 'submissions' || table === 'event_lanes') && Object.keys(s.moved).length) {
    const base = read(table);
    if (!base) return null;
    return base.map((r) => {
      const to = ownerOf(s, r.player_id);
      return to === r.player_id ? r : { ...r, player_id: to };
    });
  }
  return null;
}

/**
 * Las filas de `table` con las cuentas y los reclamos de la liga ficticia y lo cambiado, con los filtros (eq, in y
 * gt); null si la tabla no es de esta capa (contesta la de abajo). `read`: la capa de abajo sin filtros.
 */
export function demoMembersSelect(table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  const rows = overlay(load(), table, read);
  return rows ? rows.filter((r) => matches(r, filters)) : null;
}

/**
 * Las RPC de Organizar › Miembros y Reclamos en las ligas ficticias. `read`: las tablas con todas las capas (para ver
 * las membresías, los jugadores y los juegos como están). undefined si no es de esta parte o la liga (o el reclamo) no
 * es de las ficticias: sigue demoBackend como siempre.
 */
export function membersRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  const FNS = ['set_member_role', 'set_member_scorer', 'set_member_badge_maker', 'remove_member', 'decide_player_claim', 'player_claim_conflicts'];
  if (!FNS.includes(fn)) return undefined;
  const s = load();
  const members = read('memberships');
  const players = read('players');
  const leagueOf = (id: unknown) => read('leagues').find((l) => l.id === id) ?? null;
  const memberOf = (league: unknown, user: unknown) => members.find((m) => m.league_id === league && m.user_id === user) ?? null;
  const isOwner = (league: unknown) => leagueOf(league)?.owner_id === uid || memberOf(league, uid)?.role === 'owner';
  const isAdmin = (league: unknown) => isOwner(league) || memberOf(league, uid)?.role === 'admin';
  const playerOfUser = (league: unknown, user: unknown) => players.find((p) => p.league_id === league && p.user_id === user) ?? null;
  const patchMember = (league: unknown, user: unknown, p: Row) => {
    const k = keyOf(league, user);
    s.members[k] = { ...s.members[k], ...p };
  };
  const patchPlayer = (id: unknown, p: Row) => {
    s.players[String(id)] = { ...s.players[String(id)], ...p };
  };
  // Sale de la liga: su jugador queda sin cuenta y su reclamo pendiente se cancela (como los triggers de la base).
  const leave = (league: unknown, user: unknown) => {
    const k = keyOf(league, user);
    if (!s.left.includes(k)) s.left.push(k);
    const own = playerOfUser(league, user);
    if (own) patchPlayer(own.id, { user_id: null });
    for (const c of read('player_claims')) {
      if (c.league_id === league && c.user_id === user && c.status === 'pending') s.claims[c.id as string] = { ...s.claims[c.id as string], status: 'cancelled', decided_at: iso(), updated_at: iso() };
    }
  };
  // Lo que choca al juntar dos jugadores (private.claim_conflicts): los dos con juegos en el mismo evento.
  const conflictsOf = (own: Row, claimed: Row) => {
    const entries = read('entries');
    const eventsOf = (id: unknown) => new Set(entries.filter((e) => e.player_id === id).map((e) => e.event_id));
    const mine = eventsOf(own.id);
    const both = [...eventsOf(claimed.id)].filter((e) => mine.has(e)).length;
    return both ? [{ what: 'entries', label: 'Juegos en el mismo evento', count: both }] : [];
  };

  // ---------- Reclamos ----------
  if (fn === 'decide_player_claim' || fn === 'player_claim_conflicts') {
    const claim = read('player_claims').find((c) => c.id === a.p_claim);
    if (!claim) return undefined;
    const lid = claim.league_id;
    if (!isAdmin(lid)) deny();
    const own = playerOfUser(lid, claim.user_id);
    const claimed = players.find((p) => p.id === claim.player_id) ?? fail('no_existe', 'not_found', 'no_existe');
    if (fn === 'player_claim_conflicts') return own && own.id !== claimed.id ? conflictsOf(own, claimed) : [];

    const note = typeof a.p_note === 'string' && a.p_note.trim() ? a.p_note.trim() : null;
    if (typeof a.p_approve !== 'boolean' || (note?.length ?? 0) > 300) fail('invalido', 'validation', 'invalido');
    if (claim.status !== 'pending') return claim.status;
    const decided = { decided_by: uid, decided_at: iso(), updated_at: iso(), decision_note: note };
    if (a.p_approve) {
      if (claimed.user_id) fail('duplicado', 'conflict', 'duplicado');
      if (claimed.is_minor) fail('invalido', 'validation', 'invalido');
      if (!memberOf(lid, claim.user_id)) fail('no_existe', 'not_found', 'no_existe');
      // Los dos jugadores se juntan en el del pedido: lo del propio pasa a él y el propio se borra.
      if (own && own.id !== claimed.id) {
        const conflicts = conflictsOf(own, claimed);
        if (conflicts.length) fail(`conflicto: ${conflicts.map((x) => `${x.label} (${x.count})`).join(', ')}`, 'validation');
        if (!s.removed.includes(own.id as string)) s.removed.push(own.id as string);
        s.moved[own.id as string] = claimed.id as string;
      }
      patchPlayer(claimed.id, { user_id: claim.user_id });
      patchMember(lid, claim.user_id, { player_id: claimed.id });
      s.claims[claim.id as string] = { ...s.claims[claim.id as string], status: 'approved', ...decided };
    } else {
      s.claims[claim.id as string] = { ...s.claims[claim.id as string], status: 'rejected', ...decided };
    }
    save(s);
    return a.p_approve ? 'approved' : 'rejected';
  }

  // ---------- Permisos ----------
  const league = a.p_league;
  if (!leagueOf(league)) return undefined;
  const target = memberOf(league, a.p_user);

  if (fn === 'set_member_role') {
    if (a.p_role !== 'admin' && a.p_role !== 'member') fail('invalido', 'validation', 'invalido');
    // El dueño nombra y quita admins; un admin solo puede dejar de serlo él mismo.
    if (!isOwner(league) && !(a.p_user === uid && target?.role === 'admin' && a.p_role === 'member')) deny();
    if (!target) fail('no_existe', 'not_found', 'no_existe');
    if (target!.role === 'owner') deny();
    patchMember(league, a.p_user, { role: a.p_role });
    save(s);
    return null;
  }

  if (fn === 'set_member_scorer') {
    if (!isAdmin(league)) deny();
    const m = target ?? fail('no_existe', 'not_found', 'no_existe');
    // Un admin que no es el dueño solo a miembros.
    if (!isOwner(league) && m.role !== 'member') deny();
    if (a.p_scorer === true) {
      if (!m.is_scorer) patchMember(league, a.p_user, { is_scorer: true });
    } else if (m.is_scorer) {
      // Quien entró solo para anotar (miembro sin jugador ni «Diseña insignias») sale de la liga.
      if (m.scorer_only && m.role === 'member' && !m.badge_maker && !playerOfUser(league, a.p_user)) leave(league, a.p_user);
      else patchMember(league, a.p_user, { is_scorer: false });
    }
    save(s);
    return null;
  }

  if (fn === 'set_member_badge_maker') {
    if (!isOwner(league)) deny();
    if (!target) fail('no_existe', 'not_found', 'no_existe');
    patchMember(league, a.p_user, { badge_maker: a.p_on === true });
    save(s);
    return null;
  }

  // remove_member: el dueño saca a cualquiera (menos a sí mismo); un admin, a los miembros sin permisos; cada uno, a sí mismo.
  const m = target ?? fail('no_existe', 'not_found', 'no_existe');
  if (m.role === 'owner') deny();
  if (!(a.p_user === uid || isOwner(league) || (isAdmin(league) && m.role === 'member' && !m.is_scorer && !m.badge_maker))) deny();
  leave(league, a.p_user);
  save(s);
  return null;
}
