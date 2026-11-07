/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): la hoja «Anotadores» de «Liga de Ejemplo»
 * (demoLeague.ts) y el link para anotar (/anotar/<código>). Contesta las RPC de src/lib/data/scorers.ts que no son de
 * los miembros (scorer_access, invite_scorers, create_scorer_link, rotate_scorer_link, revoke_scorer_link,
 * scorer_link_preview y join_as_scorer), cancel_league_invite de sus invitaciones de anotador y search_people en
 * «Liga de Ejemplo» (src/lib/data/people.ts), con la misma forma que la base (20260929001400_anotadores.sql). Los
 * miembros de la liga y «Hacer anotador» / «Quitar» (set_member_scorer) son de demoMembers.ts: ahí están los que ya
 * anotan («Jugadora Cinco» y «Anotador de Prueba», que entró solo para anotar).
 *
 * De fábrica: una invitación de anotador pendiente («Persona Invitada») y, para aceptar, el link DEMO_SCORER_CODE de
 * otra liga ficticia («Liga de los Sábados», donde la cuenta de prueba no está: al entrar queda anotadora sin jugador;
 * sus filas de `leagues` y `memberships` van en demoScorersSelect). DEMO_SCORER_DEAD_CODE es un link vencido. Se guarda
 * en sessionStorage y se borra al salir de la demostración (forgetDemoScorers). Todos los datos son ficticios.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { uuidv7 } from '@mm/lib/db/ids';
import { foldName, nameMatches } from '@mm/components/scorers/logic';
import { DEMO_LEAGUE } from './demoLeague';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de la capa de abajo de una tabla, sin filtrar; null si no la tiene. */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-anotadores';
const DAY = 86_400_000;

/** El link para anotar que la cuenta de prueba puede aceptar (de «Liga de los Sábados»). */
export const DEMO_SCORER_CODE = 'ANTE234567';
/** Un link para anotar que ya venció. */
export const DEMO_SCORER_DEAD_CODE = 'VENC234567';
/** La liga ficticia del link para aceptar. */
export const DEMO_SCORER_LEAGUE = '00000000-0000-7000-8000-0000000ad001';
const SAT_OWNER = '00000000-0000-7000-8000-0000000ad00f';
const SAT_NAME = 'Liga de los Sábados';
const PERSON = (n: number) => `00000000-0000-7000-8000-0000000ad1${String(n).padStart(2, '0')}`;
const SEED_INVITE = '00000000-0000-7000-8000-0000000ad201';

/** Las cuentas que salen en «Por @usuario» (además de los miembros de la liga). */
const PEOPLE = [
  { id: PERSON(1), name: 'Persona de Ejemplo', username: 'personaejemplo', isFollowing: true, followsYou: true },
  { id: PERSON(2), name: 'Persona Invitada', username: 'personainvitada', isFollowing: true, followsYou: false },
  { id: PERSON(3), name: 'Persona Tres', username: 'personatres', isFollowing: false, followsYou: false },
];

interface State {
  /** Invitaciones de anotador pendientes de «Liga de Ejemplo» (la forma de scorer_access, con la liga). */
  invites: Row[];
  /** Links para anotar de «Liga de Ejemplo» (sin los quitados o cambiados). */
  links: Row[];
  /** La cuenta que entró con DEMO_SCORER_CODE (la de prueba), o null. */
  joined: string | null;
  /** Veces que se usó DEMO_SCORER_CODE. */
  uses: number;
}

const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

function seed(): State {
  return {
    invites: [
      {
        id: SEED_INVITE,
        leagueId: DEMO_LEAGUE,
        user: { id: PERSON(2), name: 'Persona Invitada', username: 'personainvitada' },
        invitedBy: null,
        asPlayer: false,
        scope: 'liga',
        refId: null,
        title: 'Liga de Ejemplo',
        createdAt: iso(-3 * 3_600_000),
      },
    ],
    links: [],
    joined: null,
    uses: 3,
  };
}

function load(): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return { ...seed(), ...(JSON.parse(raw) as Partial<State>) };
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

export function forgetDemoScorers() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

const fail = (message: string, kind: BackendErrorKind, code: string | null = null): never => {
  throw new BackendError(message, kind, code);
};

const matches = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    if (f.op === 'eq') return r[f.col] === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
    if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
    return true;
  });

/** Las filas de «Liga de los Sábados»: la liga y su dueño; con la cuenta de prueba adentro si entró con el link. */
function satRows(s: State): Record<'leagues' | 'memberships', Row[]> {
  const member = (user: string, name: string, extra: Row): Row => ({
    league_id: DEMO_SCORER_LEAGUE,
    user_id: user,
    role: 'member',
    is_scorer: false,
    display_name: name,
    player_id: null,
    badge_maker: false,
    scorer_only: false,
    ...extra,
  });
  return {
    leagues: [
      {
        id: DEMO_SCORER_LEAGUE,
        sport: 'bowling',
        kind: 'liga',
        visibility: 'private',
        name: SAT_NAME,
        owner_id: SAT_OWNER,
        venue: 'Bolera de Ejemplo',
        schedule: 'Sábados 10:00 a. m.',
        season_start: null,
        season_end: null,
        contact_name: '',
        contact_phone: '',
        require_photo: true,
        has_minors: false,
        tz: 'America/Santo_Domingo',
        logo_path: null,
        created_at: iso(-90 * DAY),
      },
    ],
    memberships: [
      member(SAT_OWNER, 'Organizador de Ejemplo', { role: 'owner' }),
      ...(s.joined ? [member(s.joined, 'Juan Pérez', { is_scorer: true, scorer_only: true })] : []),
    ],
  };
}

/**
 * Las filas de `table` con «Liga de los Sábados» encima (leagues y memberships) y los filtros (eq, in y gt); null si
 * la tabla no es de las que toca esta parte. `read`: la capa de abajo sin filtrar.
 */
export function demoScorersSelect(table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  if (table !== 'leagues' && table !== 'memberships') return null;
  const mine = satRows(load())[table];
  const rows = [...(read(table) ?? []).filter((r) => (table === 'leagues' ? r.id : r.league_id) !== DEMO_SCORER_LEAGUE), ...mine];
  return rows.filter((r) => matches(r, filters));
}

/** Cómo está un link (private.scorer_link_status): vencido, lleno o sirve. */
const statusOf = (k: Row) => (Date.parse(String(k.expiresAt)) <= Date.now() ? 'expired' : Number(k.uses) >= Number(k.maxUses) ? 'full' : 'ok');
const withStatus = (k: Row): Row => ({ ...k, status: statusOf(k) });

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 10 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

/**
 * Las RPC de los anotadores en las ligas ficticias. `read`: las tablas con todas las capas (las membresías como están).
 * undefined si no es de esta parte o la liga no es «Liga de Ejemplo» (sigue demoBackend como siempre).
 */
export function scorersRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  const FNS = ['scorer_access', 'invite_scorers', 'cancel_league_invite', 'create_scorer_link', 'rotate_scorer_link', 'revoke_scorer_link', 'scorer_link_preview', 'join_as_scorer', 'search_people'];
  if (!FNS.includes(fn)) return undefined;
  const s = load();
  const members = () => read('memberships');
  const memberOf = (league: unknown, user: unknown) => members().find((m) => m.league_id === league && m.user_id === user) ?? null;
  const leagueOf = (id: unknown) => read('leagues').find((l) => l.id === id) ?? null;
  const isAdmin = (league: unknown) => leagueOf(league)?.owner_id === uid || ['owner', 'admin'].includes(String(memberOf(league, uid)?.role));
  const title = (league: unknown, scope: unknown, ref: unknown) => {
    const name = String(leagueOf(league)?.name ?? '');
    if (scope === 'evento') return String(read('events').find((e) => e.id === ref)?.name || '') || 'Torneo';
    return name;
  };
  const pathOf = (league: unknown, scope: unknown, ref: unknown) =>
    scope === 'evento' ? `/l/${String(league)}/e/${String(ref)}` : scope === 'playoff' ? `/l/${String(league)}/playoffs` : `/l/${String(league)}`;
  const mineLink = (id: unknown) => s.links.find((k) => k.id === id) ?? null;
  const done = <T,>(v: T): T => {
    save(s);
    return v;
  };

  switch (fn) {
    case 'scorer_access': {
      if (a.p_league !== DEMO_LEAGUE) return undefined;
      if (!isAdmin(DEMO_LEAGUE)) fail('no_permitido', 'permission', 'no_permitido');
      // Las de quien ya entró a la liga no salen (la base las cierra al entrar).
      const invites = s.invites.filter((i) => !memberOf(DEMO_LEAGUE, (i.user as Row).id)).map(({ leagueId: _l, ...i }) => i);
      return { invites, links: s.links.map(withStatus) };
    }
    case 'invite_scorers': {
      if (a.p_league !== DEMO_LEAGUE) return undefined;
      if (!isAdmin(DEMO_LEAGUE)) fail('no_permitido', 'permission', 'no_permitido');
      const ids = Array.isArray(a.p_users) ? (a.p_users as unknown[]).map(String) : [];
      let sent = 0;
      const results = ids.map((user) => {
        const person = PEOPLE.find((p) => p.id === user);
        if (memberOf(DEMO_LEAGUE, user)) return { userId: user, status: 'member' };
        if (!person) return { userId: user, status: 'unavailable' };
        if (s.invites.some((i) => (i.user as Row).id === user)) return { userId: user, status: 'pending' };
        sent += 1;
        s.invites.unshift({
          id: uuidv7(),
          leagueId: DEMO_LEAGUE,
          user: { id: person.id, name: person.name, username: person.username },
          invitedBy: { id: uid, name: 'Juan Pérez' },
          asPlayer: false,
          scope: a.p_scope === 'evento' || a.p_scope === 'playoff' ? a.p_scope : 'liga',
          refId: a.p_ref ?? null,
          title: title(DEMO_LEAGUE, a.p_scope, a.p_ref),
          createdAt: iso(),
        });
        return { userId: user, status: 'sent' };
      });
      return done({ sent, results });
    }
    case 'cancel_league_invite': {
      if (!s.invites.some((i) => i.id === a.p_invite)) return undefined;
      s.invites = s.invites.filter((i) => i.id !== a.p_invite);
      return done(null);
    }
    case 'create_scorer_link': {
      if (a.p_league !== DEMO_LEAGUE) return undefined;
      if (!isAdmin(DEMO_LEAGUE)) fail('no_permitido', 'permission', 'no_permitido');
      if (leagueOf(DEMO_LEAGUE)?.has_minors) fail('invalido', 'validation', 'invalido');
      const scope = a.p_scope === 'evento' || a.p_scope === 'playoff' ? a.p_scope : 'liga';
      const ref = scope === 'liga' ? null : (a.p_ref ?? null);
      // El que ya sirve en ese contexto (crear dos veces da el mismo); si no sirve, se reemplaza.
      const same = s.links.find((k) => k.scope === scope && (k.refId ?? null) === ref);
      if (same && statusOf(same) === 'ok') return withStatus(same);
      if (s.links.filter((k) => statusOf(k) === 'ok').length >= 10) fail('cupo_lleno', 'validation', 'cupo_lleno');
      const link: Row = {
        id: uuidv7(),
        code: newCode(),
        scope,
        refId: ref,
        title: title(DEMO_LEAGUE, scope, ref),
        path: pathOf(DEMO_LEAGUE, scope, ref),
        expiresAt: iso(7 * DAY),
        uses: 0,
        maxUses: 20,
        createdBy: { id: uid, name: 'Juan Pérez' },
        createdAt: iso(),
      };
      s.links = [link, ...s.links.filter((k) => k !== same)];
      return done(withStatus(link));
    }
    case 'rotate_scorer_link': {
      const old = mineLink(a.p_link);
      if (!old) return undefined;
      const next: Row = { ...old, id: uuidv7(), code: newCode(), uses: 0, expiresAt: iso(7 * DAY), createdBy: { id: uid, name: 'Juan Pérez' }, createdAt: iso() };
      s.links = [next, ...s.links.filter((k) => k.id !== old.id)];
      return done(withStatus(next));
    }
    case 'revoke_scorer_link': {
      if (!mineLink(a.p_link)) return undefined;
      s.links = s.links.filter((k) => k.id !== a.p_link);
      return done(null);
    }
    case 'scorer_link_preview':
    case 'join_as_scorer': {
      const code = String(a.p_code ?? '').trim().toUpperCase();
      if (code === DEMO_SCORER_DEAD_CODE) return { status: 'expired' };
      const own = s.links.find((k) => k.code === code);
      if (code !== DEMO_SCORER_CODE && !own) return undefined;
      const league = own ? DEMO_LEAGUE : DEMO_SCORER_LEAGUE;
      const link = own ? withStatus(own) : { scope: 'liga', refId: null, expiresAt: iso(5 * DAY), uses: s.uses, maxUses: 20, status: s.uses >= 20 ? 'full' : 'ok' };
      if (link.status !== 'ok') return { status: link.status };
      const l = leagueOf(league);
      const me = memberOf(league, uid);
      const canScore = !!me && (me.role === 'owner' || me.role === 'admin' || me.is_scorer === true);
      const linkTitle = title(league, link.scope, link.refId);
      const path = pathOf(league, link.scope, link.refId);
      if (fn === 'scorer_link_preview') {
        return {
          status: 'ok',
          leagueId: league,
          name: l?.name ?? '',
          sport: l?.sport ?? 'bowling',
          kind: l?.kind ?? 'liga',
          visibility: l?.visibility ?? 'private',
          logoPath: l?.logo_path ?? null,
          scope: link.scope,
          refId: link.refId,
          title: linkTitle,
          path,
          expiresAt: link.expiresAt,
          member: !!me,
          canScore,
        };
      }
      const out = (status: string) => ({ status, leagueId: league, scope: link.scope, refId: link.refId, title: linkTitle, path });
      if (canScore) return out('already');
      // Solo el link de «Liga de los Sábados» deja entrar a alguien nuevo: la cuenta de prueba ya es dueña de la otra.
      if (league !== DEMO_SCORER_LEAGUE) return out('already');
      s.joined = uid;
      s.uses += 1;
      return done(out('joined'));
    }
    case 'search_people': {
      if (a.p_league !== DEMO_LEAGUE) return undefined;
      const q = String(a.p_query ?? '').trim().toLowerCase();
      // Los miembros de la liga (menos la cuenta de prueba), con un @usuario armado con su nombre.
      const fromLeague = members()
        .filter((m) => m.league_id === DEMO_LEAGUE && m.user_id !== uid)
        .map((m) => ({ id: String(m.user_id), name: String(m.display_name ?? ''), username: foldName(String(m.display_name ?? '')).replace(/[^a-z0-9]/g, ''), isFollowing: false, followsYou: false }));
      const all = [...PEOPLE.filter((p) => !fromLeague.some((m) => m.id === p.id)), ...fromLeague];
      const hits = q ? all.filter((p) => nameMatches(`${p.name} ${p.username}`, q)) : all.filter((p) => p.isFollowing);
      return hits.slice(0, Number(a.p_limit) || 30).map((p) => ({
        ...p,
        avatar: null,
        inLeague: !!memberOf(DEMO_LEAGUE, p.id),
        invited: s.invites.some((i) => (i.user as Row).id === p.id),
      }));
    }
  }
  return undefined;
}
