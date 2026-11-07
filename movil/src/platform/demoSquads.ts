/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): Equipos (`/equipos`, docs/equipos-y-en-vivo.md §1
 * y docs/perfiles-equipos-esports.md §3) sin el Supabase real. La cuenta de prueba es capitana de «Equipo de Ejemplo»
 * [EE] (fútbol, con «Jugador Uno» y «Jugador Dos»), sigue a «Equipo Visitante» (código `EQUI2345` para unirse, con
 * partidos, temporada y un torneo en sus números), tiene una invitación pendiente a «Equipo Invitado» (baloncesto) y es
 * dueña de «Fútbol de Ejemplo» (una liga pública de fútbol), donde «Equipo Rival» pide entrar (el panel de los admins).
 * Ahí mismo se puede inscribir «Equipo de Ejemplo» y aceptarlo después.
 *
 * Contesta las RPC de src/lib/data/squads.ts con la misma forma y las mismas reglas que la base (create_squad,
 * update_squad, delete_squad, squad_code, renew_squad_code, squad_preview, join_squad, leave_squad,
 * remove_squad_member, set_squad_member, begin_squad_logo, set_squad_logo, squad_page, my_squads, follow_squad,
 * unfollow_squad, followed_squads, search_squads, request_squad_league, withdraw_squad_request, league_squad_requests,
 * decide_squad_request, sync_squad_roster, squad_followers, squad_games, squad_stats, invite_to_squad,
 * respond_squad_invite, cancel_squad_invite, my_squad_invites, squad_pending_invites), además de squad_posts y
 * create_post con `p_squad` (el muro), search_people con `p_squad` (invitar) y search_leagues (buscar la liga al
 * inscribir: nadie más la contesta en la demostración). Pone «Fútbol de Ejemplo» y su dueño encima de `leagues` y
 * `memberships` (demoSquadsSelect). Se guarda en sessionStorage y se borra al salir de la demostración
 * (forgetDemoSquads). Todos los datos son ficticios.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import type { FollowPerson } from '@mm/lib/data/follows';
import type { Post } from '@mm/lib/data/posts';
import type { SquadGame, SquadLite, SquadPage, SquadRecord, SquadRole, SquadStats } from '@mm/lib/data/squads';
import { uuidv7 } from '@mm/lib/db/ids';
import { toIsoDate } from '@mm/lib/format';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de la capa de abajo de una tabla, sin filtrar; null si no la tiene. */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-equipos';
const DAY = 86_400_000;
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

/** Ids fijos: `00000000-0000-7000-8000-0000aa<tipo><número>`. */
const id = (kind: string, n: number) => `00000000-0000-7000-8000-0000aa${kind}${String(n).padStart(5, '0')}`;

export const DEMO_SQUAD = id('0', 1);
const VISITOR = id('0', 2);
const INVITING = id('0', 3);
const RIVAL = id('0', 4);
/** La liga de fútbol ficticia (pública, de la cuenta de prueba). */
export const DEMO_FOOTBALL = id('2', 1);
/** El código para probar «Unirme con código» (lleva a «Equipo Visitante»). */
export const DEMO_SQUAD_CODE = 'EQUI2345';

const ME = { name: 'Juan Pérez', username: 'juanperez' };
const PERSON = (n: number) => id('1', n);
/** Las cuentas ficticias (las que sigues salen al invitar sin buscar). */
const PEOPLE = [
  { id: PERSON(1), name: 'Jugador Uno', username: 'jugadoruno', isFollowing: true, followsYou: true },
  { id: PERSON(2), name: 'Jugador Dos', username: 'jugadordos', isFollowing: true, followsYou: false },
  { id: PERSON(3), name: 'Jugadora Tres', username: 'jugadoratres', isFollowing: true, followsYou: true },
  { id: PERSON(4), name: 'Jugador Cuatro', username: 'jugadorcuatro', isFollowing: false, followsYou: false },
  { id: PERSON(5), name: 'Jugadora Cinco', username: 'jugadoracinco', isFollowing: false, followsYou: false },
  { id: PERSON(6), name: 'Persona de Prueba', username: 'prueba', isFollowing: false, followsYou: false },
];

interface SquadRow {
  id: string;
  sport: string;
  name: string;
  tag: string;
  logo: string | null;
  color: string | null;
  city: string | null;
  recruiting: boolean;
  description: string;
  createdAt: string;
}
interface MemberRow {
  squad: string;
  user: string;
  role: SquadRole;
  position: string | null;
  jersey: number | null;
  at: string;
}
interface RequestRow {
  id: string;
  squad: string;
  league: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  note: string | null;
  by: string;
  at: string;
}
interface InviteRow {
  id: string;
  squad: string;
  user: string;
  by: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  at: string;
}
interface State {
  squads: SquadRow[];
  members: MemberRow[];
  follows: { squad: string; user: string; at: string }[];
  codes: Record<string, string>;
  requests: RequestRow[];
  invites: InviteRow[];
  posts: Post[];
}

function seed(uid: string): State {
  const squad = (s: Partial<SquadRow> & Pick<SquadRow, 'id' | 'sport' | 'name' | 'tag'>): SquadRow => ({ logo: null, color: null, city: null, recruiting: false, description: '', createdAt: iso(-40 * DAY), ...s });
  const member = (sq: string, user: string, role: SquadRole, position: string | null, jersey: number | null, days: number): MemberRow => ({ squad: sq, user, role, position, jersey, at: iso(-days * DAY) });
  return {
    squads: [
      squad({ id: DEMO_SQUAD, sport: 'football', name: 'Equipo de Ejemplo', tag: 'EE', city: 'Santo Domingo', recruiting: true, description: 'Jugamos los domingos en la mañana. Buscamos un portero suplente.' }),
      squad({ id: VISITOR, sport: 'football', name: 'Equipo Visitante', tag: 'VIS', city: 'Santiago', color: '#2563eb', description: 'Un equipo ficticio para probar «Unirme con código».' }),
      squad({ id: INVITING, sport: 'basketball', name: 'Equipo Invitado', tag: 'INV', city: 'Santo Domingo', color: '#16a34a' }),
      squad({ id: RIVAL, sport: 'football', name: 'Equipo Rival', tag: 'RIV', city: 'La Romana', color: '#dc2626' }),
    ],
    members: [
      member(DEMO_SQUAD, uid, 'captain', 'Delantero', 9, 40),
      member(DEMO_SQUAD, PERSON(1), 'member', 'Portero', 1, 30),
      member(DEMO_SQUAD, PERSON(2), 'member', 'Defensa', 4, 20),
      member(VISITOR, PERSON(4), 'captain', null, 10, 50),
      member(VISITOR, PERSON(5), 'member', 'Portera', 1, 45),
      member(INVITING, PERSON(6), 'captain', 'Base', 7, 25),
      member(INVITING, PERSON(3), 'member', null, null, 20),
      member(RIVAL, PERSON(3), 'captain', 'Volante', 8, 15),
      member(RIVAL, PERSON(2), 'member', null, null, 10),
    ],
    follows: [
      { squad: VISITOR, user: uid, at: iso(-5 * DAY) },
      { squad: DEMO_SQUAD, user: PERSON(3), at: iso(-6 * DAY) },
      { squad: DEMO_SQUAD, user: PERSON(4), at: iso(-3 * DAY) },
      { squad: VISITOR, user: PERSON(1), at: iso(-8 * DAY) },
    ],
    codes: { [DEMO_SQUAD]: 'EQUI1234', [VISITOR]: DEMO_SQUAD_CODE, [INVITING]: 'EQUI3456', [RIVAL]: 'EQUI4567' },
    requests: [
      { id: id('3', 1), squad: VISITOR, league: DEMO_FOOTBALL, status: 'approved', note: null, by: PERSON(4), at: iso(-30 * DAY) },
      { id: id('3', 2), squad: RIVAL, league: DEMO_FOOTBALL, status: 'pending', note: null, by: PERSON(3), at: iso(-2 * DAY) },
    ],
    invites: [{ id: id('5', 1), squad: INVITING, user: uid, by: PERSON(6), status: 'pending', at: iso(-3 * 3_600_000) }],
    // Lo primero del muro de «Equipo de Ejemplo» (su `squad` se arma de nuevo al leer).
    posts: [
      {
        id: id('4', 1),
        author: { id: PERSON(1), name: 'Jugador Uno', username: 'jugadoruno', avatar: null },
        text: 'El domingo jugamos a las 9:00 en el Campo de Ejemplo. ¡No falten!',
        photo: null,
        league: null,
        squad: { id: DEMO_SQUAD, sport: 'football', name: 'Equipo de Ejemplo', tag: 'EE', logo: null, color: null, city: 'Santo Domingo', recruiting: true, members: 3, followers: 2 },
        sport: 'football',
        visibility: 'public',
        at: iso(-DAY),
        likes: 2,
        likedByMe: false,
        comments: 0,
        isMine: false,
        canDelete: false,
      },
    ],
  };
}

function load(uid: string): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    // sin sessionStorage: lo de entrada
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

export function forgetDemoSquads() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

const fail = (message: string, kind: BackendErrorKind, code: string | null = null): never => {
  throw new BackendError(message, kind, code);
};
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const fold = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const cleanTag = (v: unknown) => text(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 8 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const NO_RECORD: SquadRecord = { played: 0, won: 0, drawn: 0, lost: 0 };
/** Los deportes de equipo (los que inscriben equipos en ligas). */
const TEAM_SPORTS = ['football', 'futsal', 'basketball'];

// ---------- La liga de fútbol ficticia ----------

const footballLeague = (uid: string): Row => ({
  id: DEMO_FOOTBALL,
  sport: 'football',
  kind: 'liga',
  visibility: 'public',
  name: 'Fútbol de Ejemplo',
  owner_id: uid,
  venue: 'Campo de Ejemplo',
  schedule: 'Domingos 9:00 a. m.',
  season_start: null,
  season_end: null,
  contact_name: 'Juan Pérez',
  contact_phone: '809-000-0000',
  require_photo: false,
  has_minors: false,
  tz: 'America/Santo_Domingo',
  logo_path: null,
  created_at: iso(-90 * DAY),
});
const footballOwner = (uid: string): Row => ({ league_id: DEMO_FOOTBALL, user_id: uid, role: 'owner', is_scorer: false, display_name: ME.name, player_id: null, scorer_only: false });

/** La tabla de abajo con lo de Equipos encima (sin repetir si ya está); null si no es una de las que toca. */
function overlay(uid: string, table: string, read: Read): Row[] | null {
  if (table === 'leagues') {
    const base = read('leagues') ?? [];
    return base.some((l) => l.id === DEMO_FOOTBALL) ? base : [...base, footballLeague(uid)];
  }
  if (table === 'memberships') {
    const base = read('memberships') ?? [];
    return base.some((m) => m.league_id === DEMO_FOOTBALL && m.user_id === uid) ? base : [...base, footballOwner(uid)];
  }
  return null;
}

const matches = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    if (f.op === 'eq') return r[f.col] === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
    if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
    return true;
  });

/**
 * `leagues` y `memberships` con «Fútbol de Ejemplo» y su dueño encima, con los filtros (eq, in y gt); null si la tabla
 * no es de Equipos. `read`: la capa de abajo sin filtrar.
 */
export function demoSquadsSelect(uid: string, table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  const rows = overlay(uid, table, read);
  return rows ? rows.filter((r) => matches(r, filters)) : null;
}

// ---------- Los partidos de «Equipo Visitante» (sus números) ----------

const VISITOR_GAMES = (): SquadGame[] => [
  {
    key: 'demo-1',
    matchId: id('6', 1),
    leagueId: DEMO_FOOTBALL,
    leagueName: 'Fútbol de Ejemplo',
    sport: 'football',
    at: iso(-7 * DAY),
    side: 1,
    mine: 'Equipo Visitante',
    opponent: 'Equipo Uno',
    score: '2-1',
    result: 'win',
    walkover: false,
    stage: null,
    round: '2',
    url: `/l/${DEMO_FOOTBALL}`,
  },
  {
    key: 'demo-2',
    matchId: id('6', 2),
    leagueId: DEMO_FOOTBALL,
    leagueName: 'Fútbol de Ejemplo',
    sport: 'football',
    at: iso(-14 * DAY),
    side: 2,
    mine: 'Equipo Visitante',
    opponent: 'Equipo Dos',
    score: '3-0',
    result: 'loss',
    walkover: false,
    stage: null,
    round: '1',
    url: `/l/${DEMO_FOOTBALL}`,
  },
];
const VISITOR_RECORD: SquadRecord = { played: 2, won: 1, drawn: 0, lost: 1 };

// ---------- Las RPC ----------

const FNS = [
  'create_squad',
  'update_squad',
  'delete_squad',
  'squad_code',
  'renew_squad_code',
  'squad_preview',
  'join_squad',
  'leave_squad',
  'remove_squad_member',
  'set_squad_member',
  'begin_squad_logo',
  'set_squad_logo',
  'squad_page',
  'my_squads',
  'follow_squad',
  'unfollow_squad',
  'followed_squads',
  'search_squads',
  'request_squad_league',
  'withdraw_squad_request',
  'league_squad_requests',
  'decide_squad_request',
  'sync_squad_roster',
  'squad_followers',
  'squad_games',
  'squad_stats',
  'squad_posts',
  'invite_to_squad',
  'respond_squad_invite',
  'cancel_squad_invite',
  'my_squad_invites',
  'squad_pending_invites',
  'search_leagues',
  'search_people',
  'create_post',
];

/**
 * Las RPC de Equipos en la demostración. `read`: las tablas de las ligas ficticias con todas las capas (sin filtrar).
 * undefined si no es de Equipos (search_people y create_post solo con un equipo de aquí), y sigue demoBackend como
 * siempre.
 */
export function squadsRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  if (!FNS.includes(fn)) return undefined;
  if ((fn === 'search_people' || fn === 'create_post') && !a.p_squad) return undefined;
  const s = load(uid);
  const done = <T>(v: T): T => {
    save(s);
    return v;
  };
  const view = (t: string) => overlay(uid, t, read) ?? read(t);

  const person = (user: string) => (user === uid ? { id: uid, ...ME } : (PEOPLE.find((p) => p.id === user) ?? { id: user, name: 'Alguien', username: '' }));
  const squadOf = (sq: unknown) => s.squads.find((x) => x.id === sq) ?? null;
  const mustSquad = (sq: unknown) => squadOf(sq) ?? fail('no_existe', 'not_found', 'no_existe');
  const membersOf = (sq: string) => s.members.filter((m) => m.squad === sq);
  const memberOf = (sq: string, user: string) => s.members.find((m) => m.squad === sq && m.user === user) ?? null;
  const roleOf = (sq: string) => memberOf(sq, uid)?.role ?? null;
  const mustCaptain = (sq: unknown) => {
    const x = mustSquad(sq);
    if (roleOf(x.id) !== 'captain') fail('no_permitido', 'permission', 'no_permitido');
    return x;
  };
  const followersOf = (sq: string) => s.follows.filter((f) => f.squad === sq);
  const lite = (x: SquadRow): SquadLite => ({
    id: x.id,
    sport: x.sport,
    name: x.name,
    tag: x.tag,
    logo: x.logo,
    color: x.color,
    city: x.city,
    recruiting: x.recruiting,
    members: membersOf(x.id).length,
    followers: followersOf(x.id).length,
  });
  const leagueOf = (lid: unknown) => view('leagues').find((l) => l.id === lid) ?? null;
  const isLeagueMember = (lid: unknown) => view('memberships').some((m) => m.league_id === lid && m.user_id === uid);
  const isLeagueAdmin = (lid: unknown) => leagueOf(lid)?.owner_id === uid || view('memberships').some((m) => m.league_id === lid && m.user_id === uid && (m.role === 'owner' || m.role === 'admin'));
  const recordOf = (sq: string) => (sq === VISITOR ? VISITOR_RECORD : NO_RECORD);
  const nameTaken = (sport: string, name: string, except?: string) => s.squads.some((x) => x.sport === sport && x.id !== except && fold(x.name) === fold(name));
  const validTag = (tag: string) => /^[A-Z0-9]{2,5}$/.test(tag);
  const addMember = (sq: SquadRow) => {
    if (memberOf(sq.id, uid)) return;
    if (membersOf(sq.id).length >= 40) fail('cupo_lleno', 'validation', 'cupo_lleno');
    if (s.members.filter((m) => m.user === uid).length >= 20) fail('limite', 'validation', 'limite');
    s.members.push({ squad: sq.id, user: uid, role: 'member', position: null, jersey: null, at: iso() });
    // Los miembros no lo siguen (ya lo ven); su invitación pendiente queda aceptada.
    s.follows = s.follows.filter((f) => !(f.squad === sq.id && f.user === uid));
    for (const i of s.invites) if (i.squad === sq.id && i.user === uid && i.status === 'pending') i.status = 'accepted';
  };
  const removeSquad = (sq: string) => {
    s.squads = s.squads.filter((x) => x.id !== sq);
    s.members = s.members.filter((m) => m.squad !== sq);
    s.follows = s.follows.filter((f) => f.squad !== sq);
    s.invites = s.invites.filter((i) => i.squad !== sq);
    s.requests = s.requests.filter((r) => r.squad !== sq || r.status === 'approved');
    s.posts = s.posts.filter((p) => p.squad?.id !== sq);
    delete s.codes[sq];
  };
  const pageOf = (x: SquadRow): SquadPage => {
    const role = roleOf(x.id);
    const captain = membersOf(x.id).find((m) => m.role === 'captain');
    const latest = new Map<string, RequestRow>();
    for (const r of s.requests.filter((q) => q.squad === x.id).sort((p, q) => p.at.localeCompare(q.at))) latest.set(r.league, r);
    return {
      ...lite(x),
      description: x.description,
      captainId: captain?.user ?? '',
      isMember: !!role,
      myRole: role,
      isFollowing: followersOf(x.id).some((f) => f.user === uid),
      createdAt: x.createdAt,
      roster: membersOf(x.id).map((m) => {
        const p = person(m.user);
        return { id: m.user, name: p.name, username: p.username || null, avatar: null, role: m.role, position: m.position, jersey: m.jersey, isMe: m.user === uid };
      }),
      leagues: [...latest.values()].map((r) => {
        const l = leagueOf(r.league);
        return { leagueId: r.league, name: String(l?.name ?? 'Liga'), sport: String(l?.sport ?? x.sport), logo: (l?.logo_path as string | null) ?? null, status: r.status, requestId: r.id, record: r.status === 'approved' ? recordOf(x.id) : NO_RECORD };
      }),
      record: recordOf(x.id),
      posts: s.posts.filter((p) => p.squad?.id === x.id).length,
      likes: s.posts.filter((p) => p.squad?.id === x.id).reduce((n, p) => n + p.likes, 0),
    };
  };

  switch (fn) {
    // ---------- Leer ----------
    case 'squad_page': {
      const x = squadOf(a.p_squad);
      return x ? pageOf(x) : null;
    }
    case 'my_squads':
      return s.members.filter((m) => m.user === uid).flatMap((m) => {
        const x = squadOf(m.squad);
        return x ? [{ ...lite(x), role: m.role }] : [];
      });
    case 'followed_squads':
      return s.follows.filter((f) => f.user === uid).flatMap((f) => {
        const x = squadOf(f.squad);
        return x ? [lite(x)] : [];
      });
    case 'search_squads': {
      const q = fold(text(a.p_query));
      const sport = a.p_sport ? String(a.p_sport) : null;
      return s.squads
        .filter((x) => (!sport || x.sport === sport) && [x.name, x.tag, x.city ?? ''].some((v) => fold(v).includes(q)))
        .slice(0, Number(a.p_limit) || 20)
        .map(lite);
    }
    case 'squad_preview': {
      const code = text(a.p_code).toUpperCase();
      const sq = Object.keys(s.codes).find((k) => s.codes[k] === code);
      const x = sq ? squadOf(sq) : null;
      return x ? lite(x) : null;
    }
    case 'squad_code':
      return roleOf(mustSquad(a.p_squad).id) === 'captain' ? (s.codes[String(a.p_squad)] ?? null) : null;
    case 'squad_followers': {
      if (a.p_before) return [];
      const x = mustSquad(a.p_squad);
      return followersOf(x.id)
        .sort((p, q) => q.at.localeCompare(p.at))
        .map((f): FollowPerson => {
          const p = person(f.user);
          const known = PEOPLE.find((k) => k.id === f.user);
          return { id: f.user, name: p.name, username: p.username, at: f.at, isFollowing: !!known?.isFollowing, followsYou: !!known?.followsYou, isMe: f.user === uid, avatar: null };
        });
    }
    case 'squad_games':
      return a.p_before || a.p_squad !== VISITOR ? [] : VISITOR_GAMES();
    case 'squad_stats': {
      const x = mustSquad(a.p_squad);
      const approved = s.requests.filter((r) => r.squad === x.id && r.status === 'approved');
      const stats: SquadStats = {
        record: recordOf(x.id),
        leagues: approved.map((r) => {
          const l = leagueOf(r.league);
          const record = recordOf(x.id);
          return {
            leagueId: r.league,
            name: String(l?.name ?? 'Liga'),
            kind: l?.kind === 'torneo' ? 'torneo' : 'liga',
            sport: String(l?.sport ?? x.sport),
            logo: (l?.logo_path as string | null) ?? null,
            record,
            seasons: record.played ? [{ seasonId: id('7', 1), name: 'Temporada de Ejemplo', record }] : [],
          };
        }),
        tournaments: x.id === VISITOR ? [{ leagueId: DEMO_FOOTBALL, eventId: null, name: 'Relámpago de Ejemplo', sport: 'football', date: toIsoDate(new Date(Date.now() - 10 * DAY)), record: { played: 1, won: 1, drawn: 0, lost: 0 } }] : [],
      };
      return stats;
    }
    case 'squad_posts': {
      if (a.p_before) return [];
      const x = mustSquad(a.p_squad);
      return s.posts
        .filter((p) => p.squad?.id === x.id)
        .sort((p, q) => q.at.localeCompare(p.at))
        .map((p) => ({ ...p, squad: lite(x) }));
    }

    // ---------- Crear y editar ----------
    case 'create_squad': {
      const sport = String(a.p_sport ?? '');
      const name = text(a.p_name);
      const tag = cleanTag(a.p_tag);
      if (!sport || sport === 'esports' || name.length < 2 || name.length > 40 || !validTag(tag)) fail('invalido', 'validation', 'invalido');
      if (nameTaken(sport, name)) fail('duplicado', 'conflict', 'duplicado');
      const sq = typeof a.p_id === 'string' && a.p_id ? a.p_id : uuidv7();
      s.squads.push({ id: sq, sport, name, tag, logo: null, color: typeof a.p_color === 'string' ? a.p_color.toLowerCase() : null, city: text(a.p_city) || null, recruiting: false, description: text(a.p_description).slice(0, 200), createdAt: iso() });
      s.members.push({ squad: sq, user: uid, role: 'captain', position: null, jersey: null, at: iso() });
      s.codes[sq] = newCode();
      return done({ squadId: sq, inviteCode: s.codes[sq] });
    }
    case 'update_squad': {
      const x = mustCaptain(a.p_squad);
      const p = (a.p_patch ?? {}) as Row;
      if (typeof p.name === 'string') {
        const name = p.name.trim();
        if (name.length < 2 || name.length > 40) fail('invalido', 'validation', 'invalido');
        if (nameTaken(x.sport, name, x.id)) fail('duplicado', 'conflict', 'duplicado');
        x.name = name;
      }
      if (typeof p.tag === 'string') {
        const tag = cleanTag(p.tag);
        if (!validTag(tag)) fail('invalido', 'validation', 'invalido');
        x.tag = tag;
      }
      if ('city' in p) x.city = text(p.city) || null;
      if ('color' in p) x.color = typeof p.color === 'string' ? p.color.toLowerCase() : null;
      if (typeof p.description === 'string') x.description = p.description.trim().slice(0, 200);
      if (typeof p.recruiting === 'boolean') x.recruiting = p.recruiting;
      return done(null);
    }
    case 'delete_squad':
      removeSquad(mustCaptain(a.p_squad).id);
      return done(null);
    case 'renew_squad_code': {
      const x = mustCaptain(a.p_squad);
      s.codes[x.id] = newCode();
      return done(s.codes[x.id]);
    }
    case 'begin_squad_logo':
      mustCaptain(a.p_squad);
      return null;
    case 'set_squad_logo': {
      const x = mustCaptain(a.p_squad);
      const old = x.logo;
      x.logo = typeof a.p_path === 'string' && a.p_path ? a.p_path : null;
      return done(old);
    }

    // ---------- La plantilla ----------
    case 'join_squad': {
      const code = text(a.p_code).toUpperCase();
      const sq = Object.keys(s.codes).find((k) => s.codes[k] === code);
      const x = (sq ? squadOf(sq) : null) ?? fail('no_existe', 'not_found', 'no_existe');
      addMember(x);
      return done({ squadId: x.id });
    }
    case 'leave_squad': {
      const x = mustSquad(a.p_squad);
      const mine = memberOf(x.id, uid) ?? fail('no_existe', 'not_found', 'no_existe');
      if (mine.role === 'captain') {
        // Solo, el equipo se borra; con más gente, primero pasa la capitanía.
        if (membersOf(x.id).length > 1) fail('capitan', 'validation', 'capitan');
        removeSquad(x.id);
      } else s.members = s.members.filter((m) => m !== mine);
      return done(null);
    }
    case 'remove_squad_member': {
      const x = mustCaptain(a.p_squad);
      const target = memberOf(x.id, String(a.p_user)) ?? fail('no_existe', 'not_found', 'no_existe');
      if (target.user === uid) fail('invalido', 'validation', 'invalido');
      s.members = s.members.filter((m) => m !== target);
      return done(null);
    }
    case 'set_squad_member': {
      const x = mustCaptain(a.p_squad);
      const target = memberOf(x.id, String(a.p_user)) ?? fail('no_existe', 'not_found', 'no_existe');
      if (a.p_role === 'captain') {
        if (target.user !== uid) {
          memberOf(x.id, uid)!.role = 'member';
          target.role = 'captain';
        }
        return done(null);
      }
      const jersey = typeof a.p_jersey === 'number' ? a.p_jersey : null;
      if (jersey != null && (jersey < 0 || jersey > 99)) fail('invalido', 'validation', 'invalido');
      if (jersey != null && membersOf(x.id).some((m) => m !== target && m.jersey === jersey)) fail('duplicado', 'conflict', 'duplicado');
      target.position = text(a.p_position).slice(0, 20) || null;
      target.jersey = jersey;
      return done(null);
    }

    // ---------- Seguir ----------
    case 'follow_squad':
    case 'unfollow_squad': {
      const x = mustSquad(a.p_squad);
      const follow = fn === 'follow_squad';
      s.follows = s.follows.filter((f) => !(f.squad === x.id && f.user === uid));
      if (follow && !memberOf(x.id, uid)) s.follows.push({ squad: x.id, user: uid, at: iso() });
      return done({ following: followersOf(x.id).some((f) => f.user === uid), followers: followersOf(x.id).length });
    }

    // ---------- Ligas ----------
    case 'request_squad_league': {
      const x = mustCaptain(a.p_squad);
      const l = leagueOf(a.p_league);
      if (!l || (l.visibility !== 'public' && !isLeagueMember(l.id))) fail('no_existe', 'not_found', 'no_existe');
      if (l!.sport !== x.sport || !TEAM_SPORTS.includes(x.sport) || l!.has_minors) fail('invalido', 'validation', 'invalido');
      if (s.requests.some((r) => r.squad === x.id && r.league === l!.id && (r.status === 'pending' || r.status === 'approved'))) fail('duplicado', 'conflict', 'duplicado');
      const rid = uuidv7();
      s.requests.push({ id: rid, squad: x.id, league: String(l!.id), status: 'pending', note: null, by: uid, at: iso() });
      return done(rid);
    }
    case 'withdraw_squad_request': {
      const r = s.requests.find((q) => q.id === a.p_request) ?? fail('no_existe', 'not_found', 'no_existe');
      mustCaptain(r.squad);
      if (r.status !== 'pending') fail('cerrado', 'validation', 'cerrado');
      r.status = 'withdrawn';
      return done(null);
    }
    case 'league_squad_requests': {
      if (!isLeagueAdmin(a.p_league)) return [];
      const order = { pending: 0, approved: 1, rejected: 2, withdrawn: 3 } as const;
      return s.requests
        .filter((r) => r.league === a.p_league && r.status !== 'withdrawn')
        .sort((p, q) => order[p.status] - order[q.status] || q.at.localeCompare(p.at))
        .flatMap((r) => {
          const x = squadOf(r.squad);
          return x ? [{ id: r.id, squad: lite(x), status: r.status, note: r.note, createdAt: r.at, requestedBy: { id: r.by, name: person(r.by).name } }] : [];
        });
    }
    case 'decide_squad_request': {
      const r = s.requests.find((q) => q.id === a.p_request) ?? fail('no_existe', 'not_found', 'no_existe');
      if (!isLeagueAdmin(r.league)) fail('no_permitido', 'permission', 'no_permitido');
      if (r.status !== 'pending') fail('cerrado', 'validation', 'cerrado');
      if (a.p_approve === true) {
        r.status = 'approved';
        return done({ teamId: uuidv7(), added: membersOf(r.squad).length, skipped: 0 });
      }
      r.status = 'rejected';
      r.note = text(a.p_note).slice(0, 200) || null;
      return done({});
    }
    case 'sync_squad_roster': {
      const x = mustSquad(a.p_squad);
      if (roleOf(x.id) !== 'captain' && !isLeagueAdmin(a.p_league)) fail('no_permitido', 'permission', 'no_permitido');
      if (!s.requests.some((r) => r.squad === x.id && r.league === a.p_league && r.status === 'approved')) fail('no_existe', 'not_found', 'no_existe');
      return { added: 0, skipped: 0 };
    }
    case 'search_leagues': {
      const q = fold(text(a.p_query));
      const members = view('memberships');
      return view('leagues')
        .filter((l) => (l.visibility === 'public' || isLeagueMember(l.id)) && [String(l.name ?? ''), String(l.venue ?? '')].some((v) => fold(v).includes(q)))
        .slice(0, Number(a.p_limit) || 20)
        .map((l) => ({
          id: l.id,
          name: l.name,
          sport: l.sport,
          kind: l.kind === 'torneo' ? 'torneo' : 'liga',
          visibility: l.visibility === 'public' ? 'public' : 'private',
          venue: (l.venue as string | null) || null,
          logo: (l.logo_path as string | null) ?? null,
          members: members.filter((m) => m.league_id === l.id).length,
          followers: 0,
          isMember: isLeagueMember(l.id),
          isFollowing: false,
        }));
    }

    // ---------- Invitar dentro de la app ----------
    case 'search_people': {
      const x = squadOf(a.p_squad);
      if (!x) return undefined;
      const q = fold(text(a.p_query));
      const hits = PEOPLE.filter((p) => (q ? fold(`${p.name} ${p.username}`).includes(q) : p.isFollowing));
      return hits.slice(0, Number(a.p_limit) || 30).map((p) => ({
        ...p,
        avatar: null,
        inLeague: false,
        inSquad: !!memberOf(x.id, p.id),
        invited: s.invites.some((i) => i.squad === x.id && i.user === p.id && i.status === 'pending'),
      }));
    }
    case 'invite_to_squad': {
      const x = mustCaptain(a.p_squad);
      const users = Array.isArray(a.p_users) ? a.p_users.map(String) : [];
      const results = users.map((user) => {
        if (memberOf(x.id, user)) return { userId: user, status: 'member' as const };
        if (s.invites.some((i) => i.squad === x.id && i.user === user && i.status === 'pending')) return { userId: user, status: 'pending' as const };
        if (!PEOPLE.some((p) => p.id === user)) return { userId: user, status: 'unavailable' as const };
        const pendingCount = s.invites.filter((i) => i.squad === x.id && i.status === 'pending').length;
        if (membersOf(x.id).length + pendingCount >= 40) return { userId: user, status: 'full' as const };
        s.invites.push({ id: uuidv7(), squad: x.id, user, by: uid, status: 'pending', at: iso() });
        return { userId: user, status: 'sent' as const };
      });
      return done({ sent: results.filter((r) => r.status === 'sent').length, results });
    }
    case 'respond_squad_invite': {
      const inv = s.invites.find((i) => i.id === a.p_invite && i.user === uid) ?? fail('no_existe', 'not_found', 'no_existe');
      if (inv.status !== 'pending') fail('cerrado', 'validation', 'cerrado');
      if (a.p_accept === true) {
        addMember(mustSquad(inv.squad));
        inv.status = 'accepted';
        return done({ squadId: inv.squad });
      }
      inv.status = 'declined';
      return done({});
    }
    case 'cancel_squad_invite': {
      const inv = s.invites.find((i) => i.id === a.p_invite) ?? fail('no_existe', 'not_found', 'no_existe');
      mustCaptain(inv.squad);
      if (inv.status !== 'pending') fail('cerrado', 'validation', 'cerrado');
      inv.status = 'cancelled';
      return done(null);
    }
    case 'my_squad_invites':
      return s.invites
        .filter((i) => i.user === uid && i.status === 'pending')
        .flatMap((i) => {
          const x = squadOf(i.squad);
          const by = person(i.by);
          return x ? [{ id: i.id, squad: lite(x), invitedBy: { id: by.id, name: by.name, username: by.username || null }, createdAt: i.at }] : [];
        });
    case 'squad_pending_invites': {
      const x = mustCaptain(a.p_squad);
      return s.invites
        .filter((i) => i.squad === x.id && i.status === 'pending')
        .map((i) => {
          const p = person(i.user);
          return { id: i.id, user: { id: p.id, name: p.name, username: p.username || null, avatar: null }, createdAt: i.at };
        });
    }

    // ---------- El muro ----------
    case 'create_post': {
      const x = squadOf(a.p_squad);
      if (!x) return undefined;
      if (!memberOf(x.id, uid)) fail('no_permitido', 'permission', 'no_permitido');
      const post: Post = {
        id: typeof a.p_id === 'string' ? a.p_id : uuidv7(),
        author: { id: uid, name: ME.name, username: ME.username, avatar: null },
        text: text(a.p_text),
        photo: typeof a.p_photo === 'string' && a.p_photo ? { path: a.p_photo, w: typeof a.p_photo_w === 'number' ? a.p_photo_w : null, h: typeof a.p_photo_h === 'number' ? a.p_photo_h : null } : null,
        league: null,
        squad: lite(x),
        sport: x.sport,
        visibility: 'public',
        at: iso(),
        likes: 0,
        likedByMe: false,
        comments: 0,
        isMine: true,
        canDelete: true,
      };
      s.posts.push(post);
      return done(post);
    }
  }
  return undefined;
}
