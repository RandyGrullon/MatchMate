/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): las insignias de la cuenta de prueba (Juan Pérez)
 * y de «Liga de Ejemplo» (demoLeague.ts). Contesta las RPC de src/lib/data/badges.ts (profile_badges, badge_notices,
 * set_featured_badges, set_badge_hidden, set_league_badge_hidden, mark_badges_seen, mark_league_badges_seen,
 * report_badge, set_badges_auto y review_badge) y set_badge_policy (src/lib/data/leagueBadges.ts), con la misma forma y
 * los mismos errores que la base (20260929001100_insignias.sql, …1110_insignias_motor.sql y …1120_insignias_creador.sql),
 * y las tablas que leen las pantallas de la liga: badge_awards, badge_progress, badge_stats y, en `leagues`, los
 * ajustes (badges_auto y badge_makers) encima de la capa de abajo.
 *
 * De fábrica: Juan con varias ganadas (Primera línea, Líneas jugadas, Club 200 y 225, segundo lugar de la Temporada de
 * Ejemplo 1, asistencia perfecta del mes), dos nuevas sin ver (Serie de tres y una privada, Rompe barreras: salen en el
 * aviso al ganar), otras en camino (badge_progress) y dos de la liga (una del creador sin ver y el premio de la Copa de
 * Ejemplo); la liga con «Figura del mes» y la asistencia perfecta del mes pasado (salen del día 3 al 9) y el podio de la
 * temporada cerrada; y una hazaña por confirmar (el juego perfecto de Jugador Uno). Se guarda en sessionStorage y se
 * borra al salir de la demostración (forgetDemoBadges). Todos los datos son ficticios.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { addMonths } from '@mm/badges/rules/periods';
import { addDays, todayIn } from '@mm/pages/sports/racket/logic/time';
import { DEMO_LEAGUE } from './demoLeague';
import { DEMO_SEASON_CLOSED } from './demoSeasons';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de una tabla por debajo de esta capa, sin filtrar (null si no es de las ligas ficticias). */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-insignias';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TZ = 'America/Santo_Domingo';

// Los jugadores y eventos de «Liga de Ejemplo» (demoLeague.ts): Juan Pérez (la cuenta de prueba), Jugador Uno y
// Jugadora Dos; la práctica de hace 7 días y la Copa de Ejemplo de hace 3.
const ME_PLAYER = '00000000-0000-7000-8000-00000000f101';
const OTHER = '00000000-0000-7000-8000-00000000f102';
const THIRD = '00000000-0000-7000-8000-00000000f103';
const PRACTICE = '00000000-0000-7000-8000-00000000f0e3';
const COPA = '00000000-0000-7000-8000-00000000f0e6';
const LEAGUE_NAME = 'Liga de Ejemplo';
const ID = (n: number) => `00000000-0000-7000-8000-0000000b${String(n).padStart(4, '0')}`;

/** Una insignia automática como la guarda la base. */
interface Award {
  id: string;
  key: string;
  sport: string;
  level: number;
  periodKey: string;
  /** La cuenta (las de cuenta) o null (las de la liga, con `playerId`). */
  userId: string | null;
  playerId: string | null;
  leagueId: string | null;
  status: 'provisional' | 'firme' | 'en_revision' | 'revocada';
  awardedAt: string;
  context: Row;
  hidden: boolean;
  /** Ya vio el aviso de desbloqueo. */
  seen: boolean;
}

/** Una insignia del creador de la liga (o un premio del torneo) como la arma `private.league_award_json`. */
interface LeagueAward {
  id: string;
  badgeId: string;
  playerId: string;
  teamName: string | null;
  period: string;
  division: string;
  awardedAt: string;
  hidden: boolean;
  note: string | null;
  seen: boolean;
  badge: Row;
  prizeSlotId: string | null;
  prize: Row | null;
}

interface State {
  /** Ocultas o mostradas (id → oculta), de las automáticas y de las de la liga. */
  hidden: Record<string, boolean>;
  /** Las que ya vio en el aviso al ganar. */
  seen: string[];
  /** Las destacadas elegidas, en su orden; null = nunca eligió (salen solas). */
  featured: string[] | null;
  /** Las hazañas ya decididas (id → firme o revocada). */
  reviews: Record<string, 'firme' | 'revocada'>;
  /** Insignias automáticas de cada liga (badges_auto). */
  auto: Record<string, string>;
  /** ¿Quién diseña y da insignias? de cada liga (badge_makers). */
  makers: Record<string, string>;
  /** Cuándo mandó cada reporte (5 por día). */
  reports: number[];
}

const empty = (): State => ({ hidden: {}, seen: [], featured: null, reviews: {}, auto: {}, makers: {}, reports: [] });

function load(): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return { ...empty(), ...(JSON.parse(raw) as Partial<State>) };
  } catch {
    // sin sessionStorage: lo de fábrica
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

export function forgetDemoBadges() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const fail = (message: string, kind: BackendErrorKind, code: string | null = 'P0001'): never => {
  throw new BackendError(message, kind, code);
};
const deny = () => fail('no_permitido', 'permission', '42501');
const league = { id: DEMO_LEAGUE, name: LEAGUE_NAME };

/** Las fijas, con las fechas de ahora (el mes pasado, la temporada cerrada hace 41 días). */
function seedAwards(uid: string): Award[] {
  const today = todayIn(TZ);
  const month = addMonths(today.slice(0, 7), -1);
  const monthWindow = [`${month}-01`, addDays(`${addMonths(month, 1)}-01`, -1)];
  const season = { id: DEMO_SEASON_CLOSED, name: 'Temporada de Ejemplo 1' };
  const seasonWindow = [addDays(today, -200), addDays(today, -41)];
  const mine = (n: number, p: Partial<Award> & Pick<Award, 'key' | 'level' | 'awardedAt'>): Award => ({
    id: ID(n),
    sport: 'bowling',
    periodKey: '-',
    userId: uid,
    playerId: null,
    leagueId: DEMO_LEAGUE,
    status: 'firme',
    context: { league },
    hidden: false,
    seen: true,
    ...p,
  });
  const inLeague = (n: number, p: Partial<Award> & Pick<Award, 'key' | 'level' | 'awardedAt' | 'playerId'>): Award =>
    mine(n, { userId: null, ...p });
  return [
    mine(1, { key: 'debut', level: 0, awardedAt: ago(40 * DAY) }),
    mine(2, { key: 'bowling_games', level: 1, awardedAt: ago(25 * DAY), context: { league, values: { n: 30 } } }),
    mine(3, { key: 'bowling_club', level: 1, awardedAt: ago(30 * DAY), context: { league, values: { n: 201 } } }),
    mine(4, { key: 'bowling_club', level: 2, awardedAt: ago(9 * DAY), context: { league, values: { n: 231 } } }),
    // Nuevas sin ver: salen en el aviso al ganar (la privada pregunta si se muestra).
    mine(5, { key: 'bowling_series', level: 2, awardedAt: ago(3 * HOUR), seen: false, context: { league, event: { id: COPA, name: 'Copa de Ejemplo' }, values: { n: 600 } } }),
    mine(6, { key: 'bowling_breakthrough', level: 3, awardedAt: ago(HOUR), seen: false, hidden: true, context: { league, values: { n: 210 } } }),
    // De la liga: el podio de la temporada cerrada y la asistencia del mes pasado.
    inLeague(7, { key: 'season_podium', level: 2, playerId: ME_PLAYER, periodKey: `s:${DEMO_SEASON_CLOSED}`, awardedAt: ago(41 * DAY), context: { league, season, window: seasonWindow } }),
    inLeague(8, { key: 'season_podium', level: 3, playerId: OTHER, periodKey: `s:${DEMO_SEASON_CLOSED}`, awardedAt: ago(41 * DAY), context: { league, season, window: seasonWindow } }),
    inLeague(9, { key: 'season_podium', level: 1, playerId: THIRD, periodKey: `s:${DEMO_SEASON_CLOSED}`, awardedAt: ago(41 * DAY), context: { league, season, window: seasonWindow } }),
    inLeague(10, { key: 'player_of_month', level: 0, playerId: OTHER, periodKey: month, awardedAt: ago(2 * DAY), context: { league, window: monthWindow, values: { valor: 'promedio 205 en 9 juegos' } } }),
    inLeague(11, { key: 'perfect_attendance_month', level: 0, playerId: ME_PLAYER, periodKey: month, awardedAt: ago(2 * DAY), context: { league, window: monthWindow } }),
    inLeague(12, { key: 'perfect_attendance_month', level: 0, playerId: THIRD, periodKey: month, awardedAt: ago(2 * DAY), context: { league, window: monthWindow } }),
    // La hazaña por confirmar: el juego perfecto de Jugador Uno en la práctica (la confirma quien no jugó).
    inLeague(13, {
      key: 'bowling_perfect_game',
      level: 0,
      playerId: OTHER,
      periodKey: `e:${PRACTICE}`,
      status: 'en_revision',
      awardedAt: ago(DAY),
      context: { league, event: { id: PRACTICE, name: 'Práctica' }, values: { valor: 'juego de 300 con la foto del marcador' } },
    }),
  ];
}

/** Las de la liga para Juan: una del creador (sin ver, con nota) y el premio de la Copa de Ejemplo. */
function seedLeagueAwards(): LeagueAward[] {
  return [
    {
      id: ID(101),
      badgeId: ID(201),
      playerId: ME_PLAYER,
      teamName: null,
      period: '',
      division: '',
      awardedAt: ago(2 * DAY),
      hidden: false,
      note: '¡Gracias por ayudar a los nuevos!',
      seen: false,
      badge: { id: ID(201), name: 'Buen compañero', description: 'Siempre con la mejor actitud en la bolera.', shape: 'circle', palette: 'liga', color: null, icon: 'heart-handshake', topText: '', periodText: '' },
      prizeSlotId: null,
      prize: null,
    },
    {
      id: ID(102),
      badgeId: ID(202),
      playerId: ME_PLAYER,
      teamName: 'Equipo Uno',
      period: '',
      division: '',
      awardedAt: ago(2 * DAY + HOUR),
      hidden: false,
      note: '1.er lugar · Equipos (scratch) · Copa de Ejemplo',
      seen: true,
      badge: { id: ID(202), name: 'Campeones', description: 'Primer lugar de la Copa de Ejemplo.', shape: 'shield', palette: 'oro', color: null, icon: 'trophy', topText: 'CAMPEÓN', periodText: '' },
      prizeSlotId: ID(301),
      prize: { slotId: ID(301), verified: true, place: 1, placeLabel: '1.er lugar', category: 'equipo', title: 'Equipos (scratch)', competition: 'Copa de Ejemplo' },
    },
  ];
}

/** Las fijas con lo cambiado encima (ocultas, vistas, hazañas decididas). */
function awardsOf(uid: string, s: State): Award[] {
  return seedAwards(uid).map((a) => ({
    ...a,
    hidden: a.id in s.hidden ? s.hidden[a.id] : a.hidden,
    seen: a.seen || s.seen.includes(a.id),
    status: s.reviews[a.id] ?? a.status,
  }));
}

function leagueAwardsOf(s: State): LeagueAward[] {
  return seedLeagueAwards().map((a) => ({ ...a, hidden: a.id in s.hidden ? s.hidden[a.id] : a.hidden, seen: a.seen || s.seen.includes(a.id) }));
}

/** Las de Juan: las de cuenta y las de su jugador en la liga. */
const isMine = (uid: string, a: Award) => a.userId === uid || a.playerId === ME_PLAYER;
const visible = (a: Award) => (a.status === 'provisional' || a.status === 'firme') && !a.hidden;

/** Una automática como la devuelven profile_badges y badge_notices. */
const awardJson = (a: Award) => ({
  id: a.id,
  key: a.key,
  sport: a.sport,
  level: a.level,
  periodKey: a.periodKey,
  scope: a.userId ? 'cuenta' : 'liga',
  status: a.status,
  awardedAt: a.awardedAt,
  firmAt: a.status === 'firme' ? a.awardedAt : null,
  leagueId: a.leagueId,
  leagueName: a.leagueId ? LEAGUE_NAME : null,
  playerId: a.playerId,
  context: a.context,
  hidden: a.hidden,
  seenAt: a.seen ? a.awardedAt : null,
});

/** Una de la liga como la devuelven profile_badges y badge_notices. Los demás todavía no la ven: la liga es pequeña. */
const leagueAwardJson = (a: LeagueAward) => ({
  id: a.id,
  badgeId: a.badgeId,
  leagueId: DEMO_LEAGUE,
  leagueName: LEAGUE_NAME,
  sport: 'bowling',
  playerId: a.playerId,
  teamName: a.teamName,
  period: a.period,
  division: a.division,
  awardedAt: a.awardedAt,
  hidden: a.hidden,
  note: a.note,
  seenAt: a.seen ? a.awardedAt : null,
  badge: a.badge,
  prizeSlotId: a.prizeSlotId,
  prize: a.prize,
  onProfile: false,
});

/** Una fila de `badge_awards` (lo que leen la liga, el jugador, el evento y el título vigente). */
const awardRow = (a: Award): Row => ({
  id: a.id,
  badge_key: a.key,
  sport: a.sport,
  level: a.level,
  period_key: a.periodKey,
  player_id: a.playerId,
  user_id: a.userId,
  league_id: a.userId ? null : a.leagueId,
  status: a.status,
  awarded_at: a.awardedAt,
  firm_at: a.status === 'firme' ? a.awardedAt : null,
  context: a.context,
  hidden: a.hidden,
  seen_at: a.seen ? a.awardedAt : null,
});

/** Lo que le falta a Juan para el siguiente nivel. */
const PROGRESS: readonly Row[] = [
  { badge_key: 'bowling_games', sport: 'bowling', value: 54, target: 100, next_level: 2 },
  { badge_key: 'bowling_club', sport: 'bowling', value: 231, target: 250, next_level: 3 },
  { badge_key: 'bowling_series', sport: 'bowling', value: 600, target: 650, next_level: 3 },
  { badge_key: 'bowling_over_average', sport: 'bowling', value: 18, target: 25, next_level: 1 },
];

/** La rareza medida (de mentira): cuántos de 120 jugadores de boliche la tienen. */
const STATS: readonly Row[] = [
  { badge_key: 'debut', sport: 'bowling', level: 0, holders: 100, base: 120, pct: 83, rarity: 'comun' },
  { badge_key: 'bowling_games', sport: 'bowling', level: 1, holders: 60, base: 120, pct: 50, rarity: 'comun' },
  { badge_key: 'bowling_club', sport: 'bowling', level: 1, holders: 40, base: 120, pct: 33, rarity: 'poco_comun' },
  { badge_key: 'bowling_club', sport: 'bowling', level: 2, holders: 14, base: 120, pct: 12, rarity: 'rara' },
  { badge_key: 'bowling_series', sport: 'bowling', level: 2, holders: 9, base: 120, pct: 7.5, rarity: 'rara' },
  { badge_key: 'bowling_breakthrough', sport: 'bowling', level: 3, holders: 30, base: 120, pct: 25, rarity: 'poco_comun' },
  { badge_key: 'season_podium', sport: 'bowling', level: 2, holders: 4, base: 120, pct: 3.3, rarity: 'epica' },
];

/** Los filtros de las lecturas de insignias: eq, in, gt, gte y lte (las horas se comparan como horas). */
function matches(r: Row, filters: readonly Filter[]): boolean {
  const cmp = (a: unknown, b: unknown) => {
    const x = typeof a === 'string' ? Date.parse(a) : Number(a);
    const y = typeof b === 'string' ? Date.parse(b) : Number(b);
    return Number.isFinite(x) && Number.isFinite(y) ? x - y : String(a).localeCompare(String(b));
  };
  return filters.every((f) => {
    const v = r[f.col];
    if (f.op === 'eq') return v === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(v);
    if (v == null) return false;
    if (f.op === 'gt') return cmp(v, f.value) > 0;
    if (f.op === 'gte') return cmp(v, f.value) >= 0;
    if (f.op === 'lte') return cmp(v, f.value) <= 0;
    return true;
  });
}

/**
 * Las filas de `table` con las insignias de la demostración y los filtros; null si la tabla no es de las insignias
 * (contesta la capa de abajo). En `leagues`, los ajustes de las insignias encima de las filas de abajo (`read`).
 */
export function demoBadgesSelect(uid: string, table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  const s = load();
  let rows: Row[] | null = null;
  if (table === 'badge_awards') rows = awardsOf(uid, s).map(awardRow);
  else if (table === 'badge_progress') rows = PROGRESS.map((p) => ({ ...p, user_id: uid, player_id: null, league_id: null }));
  else if (table === 'badge_stats') rows = [...STATS];
  else if (table === 'leagues') {
    const base = read('leagues');
    if (!base) return null;
    rows = base.map((l) => {
      const id = l.id as string;
      return s.auto[id] || s.makers[id] ? { ...l, ...(s.auto[id] ? { badges_auto: s.auto[id] } : {}), ...(s.makers[id] ? { badge_makers: s.makers[id] } : {}) } : l;
    });
  }
  return rows ? rows.filter((r) => matches(r, filters)) : null;
}

const FNS = [
  'profile_badges',
  'badge_notices',
  'set_featured_badges',
  'set_badge_hidden',
  'set_league_badge_hidden',
  'mark_badges_seen',
  'mark_league_badges_seen',
  'report_badge',
  'set_badges_auto',
  'set_badge_policy',
  'review_badge',
];
const AUTO_MODES = ['todas', 'sin_titulos', 'ninguna'];
const POLICIES = ['owner', 'admins', 'chosen'];
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * Las RPC de las insignias en la demostración. `read`: las filas de las ligas ficticias sin filtrar (para saber de quién
 * es una liga). undefined si la función no es de las insignias, o si es la vitrina de otra cuenta (sigue demoBackend).
 */
export function badgesRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  if (!FNS.includes(fn)) return undefined;
  if (fn === 'profile_badges' && a.p_user !== uid) return undefined;
  const s = load();
  const all = awardsOf(uid, s);
  const mine = all.filter((x) => isMine(uid, x));
  const leagueAwards = leagueAwardsOf(s);
  const ownerOf = (lid: unknown) => {
    const l = read('leagues').find((x) => x.id === lid);
    if (!l) fail('no_existe', 'not_found');
    if (l!.owner_id !== uid) deny();
  };

  switch (fn) {
    case 'profile_badges': {
      const shownIds = new Set([...mine.filter(visible).map((x) => x.id), ...leagueAwards.filter((x) => !x.hidden).map((x) => x.id)]);
      const featured = (s.featured ?? []).filter((id) => shownIds.has(id));
      return {
        userId: uid,
        isMe: true,
        featured,
        hasChosen: (s.featured ?? []).length > 0,
        awards: mine.filter((x) => x.status !== 'revocada').map(awardJson),
        truncated: false,
        leagueAwards: leagueAwards.map(leagueAwardJson),
      };
    }
    case 'badge_notices': {
      const unseen = mine.filter((x) => !x.seen && (x.status === 'provisional' || x.status === 'firme')).sort((x, y) => y.awardedAt.localeCompare(x.awardedAt));
      const reviews = all
        .filter((x) => x.status === 'en_revision' && !isMine(uid, x))
        .map((x) => ({
          id: x.id,
          key: x.key,
          sport: x.sport,
          level: x.level,
          periodKey: x.periodKey,
          leagueId: x.leagueId,
          leagueName: LEAGUE_NAME,
          playerId: x.playerId,
          playerName: x.playerId === OTHER ? 'Jugador Uno' : 'Jugadora Dos',
          refs: [],
          context: x.context,
          awardedAt: x.awardedAt,
          overdue: Date.now() - Date.parse(x.awardedAt) >= 14 * DAY,
        }));
      const unseenLeague = leagueAwards.filter((x) => !x.seen).map(leagueAwardJson);
      return { awards: unseen.slice(0, Number(a.p_limit) || 50).map(awardJson), unseen: unseen.length, reviews, leagueAwards: unseenLeague };
    }
    case 'set_featured_badges': {
      // Solo las que se ven: automáticas provisionales o firmes sin ocultar, o de la liga que los demás ven en el perfil.
      const ok = new Set(mine.filter(visible).map((x) => x.id));
      const list = [...new Set(ids(a.p_ids))].filter((id) => ok.has(id)).slice(0, 3);
      s.featured = list;
      save(s);
      return list;
    }
    case 'set_badge_hidden': {
      const x = mine.find((y) => y.id === a.p_award && y.status !== 'revocada') ?? fail('no_existe', 'not_found');
      const hidden = a.p_hidden === true;
      s.hidden[x.id] = hidden;
      if (hidden && s.featured) s.featured = s.featured.filter((id) => id !== x.id);
      save(s);
      return true;
    }
    case 'set_league_badge_hidden': {
      const x = leagueAwards.find((y) => y.id === a.p_award) ?? fail('no_existe', 'not_found');
      const hidden = a.p_hidden === true;
      s.hidden[x.id] = hidden;
      if (hidden && s.featured) s.featured = s.featured.filter((id) => id !== x.id);
      save(s);
      return true;
    }
    case 'mark_badges_seen':
    case 'mark_league_badges_seen': {
      const list = ids(a.p_ids);
      if (list.length > 50) fail('invalido', 'validation');
      const pool = fn === 'mark_badges_seen' ? mine.filter((x) => !x.seen).map((x) => x.id) : leagueAwards.filter((x) => !x.seen).map((x) => x.id);
      const marked = list.filter((id) => pool.includes(id));
      s.seen = [...new Set([...s.seen, ...marked])];
      save(s);
      return marked.length;
    }
    case 'report_badge': {
      const x = all.find((y) => y.id === a.p_award && visible(y)) ?? fail('no_existe', 'not_found');
      if (isMine(uid, x)) deny();
      if (typeof a.p_reason === 'string' && [...a.p_reason.trim()].length > 140) fail('invalido', 'validation');
      const today = s.reports.filter((t) => Date.now() - t < DAY);
      if (today.length >= 5) fail('rate_limited', 'rate_limited');
      s.reports = [...today, Date.now()];
      save(s);
      return null;
    }
    case 'set_badges_auto': {
      ownerOf(a.p_league);
      if (!AUTO_MODES.includes(String(a.p_mode))) fail('invalido', 'validation');
      s.auto[String(a.p_league)] = String(a.p_mode);
      save(s);
      return a.p_mode;
    }
    case 'set_badge_policy': {
      ownerOf(a.p_league);
      if (!POLICIES.includes(String(a.p_policy))) fail('invalido', 'validation');
      s.makers[String(a.p_league)] = String(a.p_policy);
      save(s);
      return a.p_policy;
    }
    case 'review_badge': {
      const x = all.find((y) => y.id === a.p_award && y.status === 'en_revision') ?? fail('no_existe', 'not_found');
      // Confirma el dueño o un admin que no jugó: en la demostración, la cuenta de prueba es la dueña y no es de ella.
      ownerOf(x.leagueId);
      if (isMine(uid, x)) deny();
      if (typeof a.p_note === 'string' && [...a.p_note.trim()].length > 140) fail('invalido', 'validation');
      const status = a.p_ok === true ? 'firme' : 'revocada';
      s.reviews[x.id] = status;
      save(s);
      return status;
    }
    default:
      return undefined;
  }
}
