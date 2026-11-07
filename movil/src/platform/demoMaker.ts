/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): el creador de insignias de la liga
 * (docs/insignias.md §5) en las ligas ficticias (demoLeague.ts). Contesta las RPC de src/lib/data/leagueBadges.ts que
 * usa el creador (save_league_badge, archive_league_badge, delete_league_badge, hide_league_badge,
 * award_league_badge, revoke_league_badge_award, league_badge_holders y report_league_badge), con la misma forma y los
 * mismos errores que la base (20260929001120_insignias_creador.sql y los cambios de 20260929001200_premios_torneo.sql:
 * los premios del torneo no cuentan para los cupos ni los topes), y pone lo suyo encima de league_badges y
 * league_badge_awards (las de abajo: los diseños y los premios de demoPrizes.ts).
 *
 * De fábrica, en «Liga de Ejemplo» (los diseños «Buen compañero», «Campeones» y «Subcampeón» vienen de demoPrizes.ts,
 * con los ids de demoBadges.ts):
 * - «Buen compañero» dado a Juan Pérez hace 2 días por Persona de Prueba, con la nota (es la insignia de la liga de la
 *   vitrina de Juan en demoBadges.ts, el mismo id) y a Jugadora Dos hace 3 horas por la cuenta de prueba (se puede
 *   deshacer: sirve 24 h);
 * - «Asistencia perfecta» archivada, sin dar (sale en «Archivadas (1)»; se puede activar o borrar).
 * Se guarda en sessionStorage y se borra al salir de la demostración (forgetDemoMaker). Todos los datos son ficticios.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { uuidv7 } from '@mm/lib/db/ids';
import { todayIn } from '@mm/badges/rules/periods';
import { isBadgeIconKey } from '@mm/badges/visual/icons';
import { badgeTextProblem, cleanBadgeText } from '@mm/components/badges/text';
import { slotKey } from '@mm/components/badges/maker/design';
import { byTeamAllowed, templateDescription } from '@mm/components/badges/maker/templates';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de una tabla por debajo de esta capa, sin filtrar (null si no es de las ligas ficticias). */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-creador';
/** La clave de demoBadges.ts: de ahí sale lo que el jugador ocultó de su perfil (set_league_badge_hidden). */
const BADGES_KEY = 'mm-demo-insignias';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TZ = 'America/Santo_Domingo';

// Lo de las ligas ficticias (demoLeague.ts): la de boliche y sus jugadores.
const DEMO_LEAGUE = '00000000-0000-7000-8000-00000000f001';
const ME_PLAYER = '00000000-0000-7000-8000-00000000f101';
const THIRD = '00000000-0000-7000-8000-00000000f103';
// Los de demoBadges.ts: «Buen compañero» y la insignia de la liga de la vitrina de Juan.
const BID = (n: number) => `00000000-0000-7000-8000-0000000b${String(n).padStart(4, '0')}`;
const COMPANION = BID(201);
const JUAN_COMPANION_AWARD = BID(101);
// Los de aquí.
const MID = (n: number) => `00000000-0000-7000-8000-0000000d${String(n).padStart(4, '0')}`;
const ATTENDANCE = MID(1);
const THIRD_COMPANION_AWARD = MID(11);
/** Otra persona de la liga (la de las invitaciones de demoBackend.ts): quien le dio «Buen compañero» a Juan. */
const OTHER_ADMIN = '00000000-0000-7000-8000-00000000d0ff';
const OTHER_ADMIN_NAME = 'Persona de Prueba';

interface State {
  /** Diseños creados aquí. */
  added: Row[];
  /** Diseños de abajo como quedaron al cambiarlos (todo el diseño). */
  patched: Record<string, Row>;
  /** Diseños borrados (nunca se dieron). */
  removed: string[];
  /** Otorgamientos de «Dar insignia» (con la nota y quién la dio). */
  awards: Row[];
  /** Retiradas de otorgamientos de abajo (los premios): id → revoked_at, revoked_by, revoke_reason. */
  revoked: Record<string, Row>;
  /** Los reportes de la cuenta (badge y cuándo). */
  reports: { badgeId: string; at: number }[];
  /** Cuándo guardó cada diseño (20 por hora). */
  saves: number[];
}

const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

function seed(uid: string): State {
  return {
    added: [
      {
        id: ATTENDANCE,
        league_id: DEMO_LEAGUE,
        template: 'perfect_attendance',
        name: 'Asistencia perfecta',
        description: templateDescription('perfect_attendance', 'bowling'),
        shape: 'circle',
        palette: 'oro',
        color: null,
        icon: 'calendar-check',
        top_text: '',
        period_text: '',
        limit_kind: 'abierta',
        by_team: false,
        status: 'archivada',
        created_by: uid,
        created_at: iso(-20 * DAY),
        updated_at: iso(-10 * DAY),
      },
    ],
    patched: {},
    removed: [],
    awards: [
      awardRow(JUAN_COMPANION_AWARD, COMPANION, ME_PLAYER, { note: '¡Gracias por ayudar a los nuevos!', awarded_by: OTHER_ADMIN, awarded_at: iso(-2 * DAY) }),
      awardRow(THIRD_COMPANION_AWARD, COMPANION, THIRD, { note: 'Por ayudar a montar las pistas.', awarded_by: uid, awarded_at: iso(-3 * HOUR) }),
    ],
    revoked: {},
    reports: [],
    saves: [],
  };
}

function awardRow(id: string, badge: string, player: string, over: Row = {}): Row {
  return {
    id,
    badge_id: badge,
    league_id: DEMO_LEAGUE,
    player_id: player,
    team_id: null,
    period: '',
    division: '',
    note: '',
    awarded_by: null,
    awarded_at: iso(),
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
    hidden: false,
    prize_slot_id: null,
    ...over,
  };
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

export function forgetDemoMaker() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

/** Lo que el jugador ocultó de su perfil en demoBadges.ts (set_league_badge_hidden lo contesta esa capa). */
function hiddenByOwner(): Record<string, boolean> {
  try {
    const raw = sessionStorage.getItem(BADGES_KEY);
    const hidden = raw ? (JSON.parse(raw) as { hidden?: unknown }).hidden : null;
    return hidden && typeof hidden === 'object' ? (hidden as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Como la base: `private.fail` (P0001 con el código) y `private.deny` (42501 'no_permitido'). */
const fail = (code: string, kind: BackendErrorKind = 'validation'): never => {
  throw new BackendError(code, kind, 'P0001');
};
const deny = (): never => {
  throw new BackendError('no_permitido', 'permission', '42501');
};

const matches = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    if (f.op === 'eq') return r[f.col] === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
    if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
    return true;
  });

const newestFirst = (col: string) => (a: Row, b: Row) => String(b[col] ?? '').localeCompare(String(a[col] ?? ''));

/** Los diseños con lo de aquí encima (los de abajo cambiados o borrados, y los creados aquí), los más nuevos primero. */
function designsOf(s: State, read: Read): Row[] {
  const base = (read('league_badges') ?? []).filter((d) => !s.added.some((x) => x.id === d.id));
  return [...base.map((d) => s.patched[d.id as string] ?? d), ...s.added].filter((d) => !s.removed.includes(d.id as string)).sort(newestFirst('created_at'));
}

/** Los otorgamientos completos (con la nota y quién la dio): los de abajo con sus retiradas y los de aquí. */
function awardsOf(s: State, read: Read): Row[] {
  const hidden = hiddenByOwner();
  const base = (read('league_badge_awards') ?? []).filter((a) => !s.awards.some((x) => x.id === a.id)).map((a) => ({ ...a, ...s.revoked[a.id as string] }));
  return [...base, ...s.awards].map((a) => (a.id as string) in hidden ? { ...a, hidden: hidden[a.id as string] } : a).sort(newestFirst('awarded_at'));
}

// La base no deja leer directo la nota, quién la dio ni el motivo (salen por league_badge_holders).
const PRIVATE = ['note', 'awarded_by', 'revoked_by', 'revoke_reason', 'seen_at'];
const publicAward = (a: Row): Row => Object.fromEntries(Object.entries(a).filter(([k]) => !PRIVATE.includes(k)));

/**
 * Las filas de `table` con lo del creador y los filtros (eq, in y gt); null si la tabla no es league_badges ni
 * league_badge_awards. `read`: la capa de abajo sin filtrar (demoPrizes.ts y lo de más abajo).
 */
export function demoMakerSelect(uid: string, table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  if (table !== 'league_badges' && table !== 'league_badge_awards') return null;
  const s = load(uid);
  const rows = table === 'league_badges' ? designsOf(s, read) : awardsOf(s, read).map(publicAward);
  return rows.filter((r) => matches(r, filters)).map((r) => structuredClone(r));
}

// ---------- Las RPC ----------

const FNS = [
  'save_league_badge',
  'archive_league_badge',
  'delete_league_badge',
  'hide_league_badge',
  'award_league_badge',
  'revoke_league_badge_award',
  'league_badge_holders',
  'report_league_badge',
];
const DESIGN_KEYS = ['template', 'name', 'description', 'shape', 'palette', 'color', 'icon', 'top_text', 'period_text', 'limit_kind', 'by_team', 'status'];
const SHAPES = ['hex', 'shield', 'circle', 'star', 'medal', 'medal_laurel', 'square'];
const PALETTES = ['bronce', 'plata', 'oro', 'platino', 'diamante', 'liga', 'color'];
const LIMIT_OF: Record<string, number> = { unica: 1, selecta: 3, abierta: 20 };
const LOCKED_KEYS = ['template', 'name', 'shape', 'palette', 'color', 'icon', 'top_text', 'period_text', 'limit_kind', 'by_team'];

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const len = (v: unknown) => [...text(v)].length;
const textOk = (v: unknown) => badgeTextProblem(text(v)) === null;

/**
 * Las RPC del creador en las ligas ficticias. `read`: las capas de abajo sin filtrar (demoPrizes.ts y lo de más abajo).
 * undefined si la función no es del creador o la liga no es de la demostración (sigue demoBackend como siempre).
 */
export function makerRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  if (!FNS.includes(fn)) return undefined;
  const s = load(uid);
  const designs = designsOf(s, read);
  const awards = awardsOf(s, read);
  const leagueRow = (league: unknown) => read('leagues').find((l) => l.id === league) ?? null;
  const member = (league: unknown) => read('memberships').find((m) => m.league_id === league && m.user_id === uid) ?? null;
  const isOwner = (league: unknown) => leagueRow(league)?.owner_id === uid || member(league)?.role === 'owner';
  const isAdmin = (league: unknown) => isOwner(league) || member(league)?.role === 'admin';
  // private.can_badges: el dueño, los admins con 'admins' y los marcados con 'chosen'.
  const canBadges = (league: unknown) => {
    if (isOwner(league)) return true;
    const m = member(league);
    const policy = leagueRow(league)?.badge_makers ?? 'admins';
    return (policy === 'admins' && m?.role === 'admin') || (policy === 'chosen' && m?.badge_maker === true);
  };
  const awardsOfBadge = (id: unknown) => awards.filter((x) => x.badge_id === id);
  const designJson = (d: Row): Row => {
    const mine = awardsOfBadge(d.id);
    const given = mine.length;
    return {
      id: d.id,
      name: d.name,
      description: d.description,
      shape: d.shape,
      palette: d.palette,
      color: d.color ?? null,
      icon: d.icon,
      topText: d.top_text,
      periodText: d.period_text,
      template: d.template ?? null,
      limitKind: d.limit_kind,
      byTeam: d.by_team === true,
      status: d.status,
      leagueId: d.league_id,
      createdBy: d.created_by ?? null,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      given,
      active: mine.filter((x) => !x.revoked_at).length,
      locked: given > 0,
    };
  };
  const designOf = (id: unknown) => designs.find((d) => d.id === id) ?? null;
  /** Guarda un diseño cambiado (los de aquí en su lista; los de abajo, encima). */
  const putDesign = (d: Row) => {
    const i = s.added.findIndex((x) => x.id === d.id);
    if (i >= 0) s.added[i] = d;
    else s.patched[d.id as string] = d;
  };

  switch (fn) {
    case 'save_league_badge': {
      if (!leagueRow(a.p_league)) return undefined;
      if (!canBadges(a.p_league)) deny();
      const p = a.p_design;
      if (!p || typeof p !== 'object' || Array.isArray(p)) fail('invalido');
      const design = p as Row;
      if (Object.keys(design).some((k) => !DESIGN_KEYS.includes(k))) fail('invalido');
      const o = designOf(a.p_id);
      const isNew = !o;
      if (o && o.league_id !== a.p_league) fail('no_existe');
      if (o && o.status === 'oculta') deny();
      const hour = s.saves.filter((t) => Date.now() - t < HOUR);
      if (hour.length >= 20) fail('rate_limited', 'rate_limited');
      const n: Row = o
        ? { ...o }
        : {
            id: typeof a.p_id === 'string' ? a.p_id : uuidv7(),
            league_id: a.p_league,
            template: null,
            name: null,
            description: '',
            shape: null,
            palette: null,
            color: null,
            icon: null,
            top_text: '',
            period_text: '',
            limit_kind: 'abierta',
            by_team: false,
            status: 'activa',
            created_by: uid,
            created_at: iso(),
            updated_at: iso(),
          };
      if ('template' in design) n.template = cleanBadgeText(text(design.template)) || null;
      for (const k of ['name', 'description', 'top_text', 'period_text'] as const) if (k in design) n[k] = cleanBadgeText(text(design[k]));
      for (const k of ['shape', 'palette', 'icon', 'limit_kind', 'status'] as const) if (k in design) n[k] = text(design[k]);
      if ('color' in design) n.color = text(design.color).trim().toLowerCase() || null;
      if ('by_team' in design) {
        if (typeof design.by_team !== 'boolean') fail('invalido');
        n.by_team = design.by_team;
      }
      // Un metal o el color de la liga no llevan color propio.
      if (n.palette !== 'color') n.color = null;
      const sport = text(leagueRow(a.p_league)?.sport);
      if (
        len(n.name) < 3 ||
        len(n.name) > 28 ||
        len(n.description) > 140 ||
        len(n.top_text) > 14 ||
        len(n.period_text) > 10 ||
        !SHAPES.includes(text(n.shape)) ||
        !PALETTES.includes(text(n.palette)) ||
        (n.palette === 'color' && !/^#[0-9a-f]{6}$/.test(text(n.color))) ||
        !isBadgeIconKey(text(n.icon)) ||
        (n.template != null && !/^[a-z_]{1,32}$/.test(text(n.template))) ||
        !(text(n.limit_kind) in LIMIT_OF) ||
        !['activa', 'archivada'].includes(text(n.status)) ||
        (n.by_team === true && !byTeamAllowed(sport))
      )
        fail('invalido');
      if (!textOk(n.name) || !textOk(n.description) || !textOk(n.top_text) || !textOk(n.period_text)) fail('texto_bloqueado');
      // Ya se dio: solo cambian la descripción y el estado (para más, «Duplicar»).
      if (o && LOCKED_KEYS.some((k) => (n[k] ?? null) !== (o[k] ?? null)) && awardsOfBadge(o.id).length) fail('ya_dada');
      const inLeague = designs.filter((d) => d.league_id === a.p_league);
      if (isNew && inLeague.length >= 100) fail('limite: total');
      if (n.status === 'activa' && (isNew || o!.status !== 'activa') && inLeague.filter((d) => d.status === 'activa').length >= 30) fail('limite: activas');
      n.updated_at = iso();
      if (isNew) s.added.push(n);
      else putDesign(n);
      s.saves = [...hour, Date.now()];
      save(s);
      return designJson(n);
    }

    case 'archive_league_badge': {
      const b = designOf(a.p_id) ?? fail('no_existe');
      if (!canBadges(b.league_id) || b.status === 'oculta') deny();
      if (typeof a.p_archived !== 'boolean') fail('invalido');
      const status = a.p_archived ? 'archivada' : 'activa';
      if (status === b.status) return status;
      if (status === 'activa' && designs.filter((d) => d.league_id === b.league_id && d.status === 'activa').length >= 30) fail('limite: activas');
      putDesign({ ...b, status, updated_at: iso() });
      save(s);
      return status;
    }

    case 'delete_league_badge': {
      const b = designOf(a.p_id) ?? fail('no_existe');
      if (!canBadges(b.league_id)) deny();
      if (awardsOfBadge(b.id).length) fail('ya_dada');
      s.added = s.added.filter((x) => x.id !== b.id);
      delete s.patched[b.id as string];
      if (!s.removed.includes(b.id as string)) s.removed.push(b.id as string);
      save(s);
      return null;
    }

    case 'hide_league_badge':
      // Solo el superadmin (private.require_super): la cuenta de prueba no lo es.
      return deny();

    case 'award_league_badge': {
      const b = designOf(a.p_badge) ?? fail('no_existe');
      const lid = b.league_id;
      if (!canBadges(lid)) deny();
      if (b.status !== 'activa') fail('no_activa');
      if (!Array.isArray(a.p_players) || a.p_players.some((x) => typeof x !== 'string')) fail('invalido');
      const ids = [...new Set(a.p_players as string[])];
      if (ids.length < 1 || ids.length > 30) fail('invalido');
      const players = read('players');
      const league = leagueRow(lid);
      if (ids.some((id) => !players.some((p) => p.id === id && p.league_id === lid))) fail('no_existe');
      const team = a.p_team ?? null;
      if (b.by_team === true) {
        if (!team) fail('invalido');
        if (!read('teams').some((t) => t.id === team && t.league_id === lid)) fail('no_existe');
        const roster = read('team_players').filter((tp) => tp.team_id === team);
        if (ids.some((id) => !roster.some((tp) => tp.player_id === id))) fail('invalido');
      } else if (team) fail('invalido');
      if (ids.some((id) => players.find((p) => p.id === id)?.user_id === uid)) fail('a_si_mismo');
      const period = cleanBadgeText(a.p_period == null ? text(b.period_text) : text(a.p_period));
      const division = cleanBadgeText(text(a.p_division));
      const note = cleanBadgeText(text(a.p_note));
      if (len(period) > 10 || len(division) > 16 || len(note) > 140) fail('invalido');
      if (!textOk(period) || !textOk(division) || !textOk(note)) fail('texto_bloqueado');
      // Los premios del torneo no cuentan para nada de esto (20260929001200_premios_torneo.sql).
      const given = awards.filter((x) => !x.prize_slot_id);
      const sameSlot = (x: Row) => x.badge_id === b.id && !x.revoked_at && slotKey(text(x.period)) === slotKey(period) && slotKey(text(x.division)) === slotKey(division);
      if (given.some((x) => sameSlot(x) && ids.includes(x.player_id as string))) fail('duplicado');
      const units = new Set(given.filter(sameSlot).map((x) => (b.by_team === true ? (x.team_id ?? x.player_id) : x.player_id)));
      const extra = b.by_team !== true ? ids.length : given.some((x) => sameSlot(x) && x.team_id === team) ? 0 : 1;
      if (units.size + extra > LIMIT_OF[text(b.limit_kind)]) fail('cupo_lleno');
      const tz = text(league?.tz) || TZ;
      const year = todayIn(Date.now(), tz).slice(0, 4);
      if (ids.some((id) => given.filter((x) => x.player_id === id && !x.revoked_at && todayIn(Date.parse(text(x.awarded_at)), tz).slice(0, 4) === year).length >= 15)) fail('limite: jugador');
      if (given.filter((x) => x.league_id === lid && Date.now() - Date.parse(text(x.awarded_at)) < 30 * DAY).length + ids.length > 60) fail('limite: liga');
      if (given.filter((x) => x.awarded_by === uid && Date.now() - Date.parse(text(x.awarded_at)) < HOUR).length + ids.length > 60) fail('rate_limited', 'rate_limited');
      const now = iso();
      const rows = ids.map((id) => awardRow(uuidv7(), String(b.id), id, { league_id: lid, team_id: team, period, division, note, awarded_by: uid, awarded_at: now }));
      s.awards.push(...rows);
      save(s);
      // El aviso le llega a quien tiene cuenta (y nunca en una liga con menores).
      const notified = a.p_notify !== false && !league?.has_minors ? ids.filter((id) => players.find((p) => p.id === id)?.user_id).length : 0;
      return {
        awards: rows.map((r) => ({
          id: r.id,
          badgeId: r.badge_id,
          leagueId: r.league_id,
          playerId: r.player_id,
          teamId: r.team_id,
          period: r.period,
          division: r.division,
          note: r.note,
          awardedBy: r.awarded_by,
          awardedAt: r.awarded_at,
          hidden: false,
          revokedAt: null,
        })),
        notified,
      };
    }

    case 'revoke_league_badge_award': {
      const x = awards.find((y) => y.id === a.p_award) ?? fail('no_existe');
      const lid = x.league_id;
      const recent = Date.now() - Date.parse(text(x.awarded_at)) < DAY;
      if (!(isOwner(lid) || (x.awarded_by === uid && recent && canBadges(lid)))) deny();
      const reason = cleanBadgeText(text(a.p_reason));
      if (len(reason) > 140) fail('invalido');
      if (x.revoked_at) return null;
      const patch = { revoked_at: iso(), revoked_by: uid, revoke_reason: reason || null };
      const i = s.awards.findIndex((y) => y.id === x.id);
      if (i >= 0) s.awards[i] = { ...s.awards[i], ...patch };
      else s.revoked[x.id as string] = patch;
      save(s);
      return null;
    }

    case 'league_badge_holders': {
      const b = designOf(a.p_badge) ?? fail('no_existe');
      const lid = b.league_id;
      if (!leagueRow(lid)) fail('no_existe');
      const admin = isAdmin(lid);
      if (b.status === 'oculta' && !admin) fail('no_existe');
      const owner = isOwner(lid);
      const can = canBadges(lid);
      const players = read('players');
      const teams = read('teams');
      const members = read('memberships');
      const nameOfAccount = (id: unknown) =>
        id ? (members.find((m) => m.league_id === lid && m.user_id === id)?.display_name ?? (id === OTHER_ADMIN ? OTHER_ADMIN_NAME : null)) : null;
      const openReports = s.reports.filter((r) => r.badgeId === b.id).length;
      return {
        badge: { ...designJson(b), ...(admin ? { openReports } : {}) },
        canGive: can && b.status === 'activa',
        awards: awardsOfBadge(b.id)
          .map((x) => ({ x, p: players.find((p) => p.id === x.player_id) ?? null }))
          .filter(({ x, p }) => admin || (!x.revoked_at && (!x.hidden || p?.user_id === uid)))
          .map(({ x, p }) => ({
            id: x.id,
            playerId: x.player_id,
            playerName: p?.name ?? 'Jugador',
            userId: p?.user_id ?? null,
            teamId: x.team_id ?? null,
            teamName: x.team_id ? (teams.find((t) => t.id === x.team_id)?.name ?? null) : null,
            period: x.period ?? '',
            division: x.division ?? '',
            awardedAt: x.awarded_at,
            hidden: x.hidden === true,
            revokedAt: x.revoked_at ?? null,
            note: admin || p?.user_id === uid ? x.note || null : null,
            awardedBy: admin ? (x.awarded_by ?? null) : null,
            awardedByName: admin ? nameOfAccount(x.awarded_by) : null,
            revokedBy: admin ? (x.revoked_by ?? null) : null,
            revokeReason: admin ? (x.revoke_reason ?? null) : null,
            canUndo: !x.revoked_at && (owner || (can && x.awarded_by === uid && Date.now() - Date.parse(text(x.awarded_at)) < DAY)),
          })),
      };
    }

    case 'report_league_badge': {
      const b = designOf(a.p_badge);
      if (!b || b.status === 'oculta') return fail('no_existe');
      if (!member(b.league_id)) deny();
      const reason = cleanBadgeText(text(a.p_reason));
      if (len(reason) > 140) fail('invalido');
      if (s.reports.some((r) => r.badgeId === b.id)) return null;
      const today = s.reports.filter((r) => Date.now() - r.at < DAY);
      if (today.length >= 5) fail('rate_limited', 'rate_limited');
      s.reports.push({ badgeId: String(b.id), at: Date.now() });
      save(s);
      return null;
    }

    default:
      return undefined;
  }
}
