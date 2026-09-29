/**
 * Consola de MatchMate (solo el superadmin: el dueño de la app). CONTRATO entre la base y las pantallas.
 *
 * Todo sale de RPC `admin_*` (security definer, que revisan `private.is_super()` y dejan rastro en
 * `admin_audit`). Nada de esto se guarda en el teléfono (`persist: false`): tiene correos y datos de todos.
 * Paso a paso de lo que muestra cada sección: src/pages/superadmin/.
 *
 * Base: supabase/migrations/20260927001100_consola.sql (resumen en supabase/README.md, «Consola del superadmin»).
 * Las horas llegan como texto ISO ('2026-09-27T16:03:11.123Z') y se quedan como texto (no son `Stamp`).
 */
import { useMemo } from 'react';
import type { SportStatus } from '../../sports/status';
import type { ClientErrorKind } from '../errorReport';
import type { LeagueKind, LeagueRole, Visibility } from '../types';
import { backend, invalidate, queryClient, rpc, type Live } from './client';
import { keys, tags } from './keys';

// ---------- Tipos ----------

export interface AdminOverview {
  generatedAt: string;
  users: {
    total: number;
    new7d: number;
    new30d: number;
    /** Cuentas que abrieron la app (profiles.last_seen_at) en los últimos 7 / 30 días. */
    active7d: number;
    active30d: number;
    superadmins: number;
    blocked: number;
    /** Registradas sin confirmar el correo. */
    unconfirmed: number;
  };
  leagues: {
    total: number;
    public: number;
    private: number;
    tournaments: number;
    withMinors: number;
    new30d: number;
    /** Ligas con algo nuevo (eventos, juegos, partidos) en 7 días. */
    active7d: number;
    bySport: { sport: string; leagues: number; players: number; active7d: number }[];
  };
  activity: { events7d: number; matches7d: number; entries7d: number; submissionsPending: number; photos7d: number };
  /** Bytes (null = no se puede saber en este backend). Plan gratis: base 500 MB, Storage 1 GB. */
  storage: { dbBytes: number | null; photosBytes: number | null; photos: number };
  scan: { today: number; dailyLimit: number; perUserLimit: number };
  push: { subscriptions: number; queued: number; sent24h: number; failed24h: number };
}

/**
 * Un día de la serie ('YYYY-MM-DD', día en hora de República Dominicana; las lecturas de fotos van por el día
 * de Google, que empieza a las 3–4 am de RD).
 */
export interface AdminSeriesPoint {
  day: string;
  signups: number;
  activeUsers: number;
  events: number;
  matches: number;
  entries: number;
  scans: number;
}

export type AdminUserFilter = 'all' | 'super' | 'blocked' | 'unconfirmed' | 'inactive';

export interface AdminUser {
  id: string;
  email: string | null;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  lastSignInAt: string | null;
  confirmed: boolean;
  /** 'email', 'google'… (null si no se sabe). */
  provider: string | null;
  superadmin: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  leagues: number;
  ownedLeagues: number;
}

export interface AdminUserDetail extends AdminUser {
  memberships: { leagueId: string; leagueName: string; sport: string; kind: LeagueKind; role: LeagueRole; scorer: boolean; joinedAt: string | null }[];
  pushDevices: number;
  scansToday: number;
  adult: boolean;
}

export type AdminLeagueSort = 'activity' | 'name' | 'created' | 'members';

export interface AdminLeague {
  id: string;
  name: string;
  sport: string;
  kind: LeagueKind;
  visibility: Visibility;
  hasMinors: boolean;
  ownerId: string;
  ownerName: string;
  ownerEmail: string | null;
  members: number;
  players: number;
  events: number;
  lastActivityAt: string | null;
  createdAt: string;
}

export interface AdminAuditEntry {
  id: number;
  at: string;
  actorId: string | null;
  actorName: string | null;
  /** 'set_superadmin', 'set_sport_status', 'block_user', 'unblock_user', 'announce', 'delete_league', 'transfer_league'… */
  action: string;
  targetType: 'user' | 'league' | 'sport' | 'app';
  targetId: string | null;
  detail: Record<string, unknown>;
}

export interface AdminSystem {
  backend: 'supabase' | 'local';
  /** Migraciones aplicadas (Supabase: supabase_migrations.schema_migrations). null en local. */
  migrations: { version: string; name: string | null }[] | null;
  /** Último «mantener despierto» (private.heartbeat). */
  lastHeartbeat: string | null;
  /** Tareas de pg_cron y su última corrida. null si no hay pg_cron (local). */
  cron: { job: string; schedule: string; lastRunAt: string | null; lastStatus: string | null }[] | null;
  push: { queued: number; claimed: number; failed24h: number; oldestQueuedAt: string | null };
  sportStatus: { sport: string; status: SportStatus; leagues: number }[];
}

export interface AdminScanStats {
  days: { day: string; scans: number }[];
  models: { model: string; today: number; total: number }[];
  topUsers: { userId: string; name: string; email: string | null; scans: number }[];
  today: number;
  dailyLimit: number;
  perUserLimit: number;
}

export type AnnouncementAudience =
  | { kind: 'all' }
  | { kind: 'sport'; sport: string }
  | { kind: 'league'; leagueId: string }
  | { kind: 'admins' };

export interface AnnouncementInput {
  /** ≤ 60 caracteres. */
  title: string;
  /** ≤ 180 caracteres. */
  body: string;
  /** Ruta dentro de la app ('/l/…', '/'); nunca una dirección de afuera. */
  url?: string;
  audience: AnnouncementAudience;
}

export interface Page<T> {
  rows: T[];
  total: number;
}

/**
 * Un error de los teléfonos agrupado por huella (el mismo tipo, mensaje sin ids ni números, y pantalla):
 * cuántas veces, en cuántos reportes y a cuántas cuentas, y el último reporte completo. Base:
 * 20260927001500_cuenta.sql (admin_client_errors); los reporta src/lib/errorReport.ts.
 */
export interface AdminClientError {
  fingerprint: string;
  /** Veces en total (un reporte suma las repeticiones de la misma cuenta en 24 h). */
  hits: number;
  reports: number;
  users: number;
  firstAt: string;
  lastAt: string;
  kind: ClientErrorKind;
  message: string;
  /** Pantalla donde pasó ('liga/ranking', 'cuenta'…). */
  component: string | null;
  stack: string | null;
  route: string | null;
  ua: string | null;
  appVersion: string | null;
  /** La cuenta del último reporte. */
  userId: string | null;
  userName: string | null;
  /** Hasta 5 rutas (las más repetidas) y 5 versiones (las más nuevas). */
  routes: string[];
  versions: string[];
}

export interface AdminClientErrors extends Page<AdminClientError> {
  /** Veces y cuentas de todo lo filtrado (no solo esta página). */
  hits: number;
  users: number;
}

// ---------- Límites (los mismos que revisa la base) ----------

/** Filas por página: la base da como mucho 100. */
export const ADMIN_MAX_PAGE_SIZE = 100;
export const MAX_ANNOUNCE_TITLE = 60;
export const MAX_ANNOUNCE_BODY = 180;
export const MAX_BLOCK_REASON = 200;
/** Anuncios por hora entre todos los superadmins (después: 'rate_limited'). */
export const ANNOUNCES_PER_HOUR = 5;
export const CLIENT_ERROR_KINDS: readonly ClientErrorKind[] = ['error', 'promise', 'render', 'chunk'];
/** Días hacia atrás que se pueden ver (la base guarda 30). */
export const CLIENT_ERROR_DAYS = [1, 7, 30] as const;

/** Nombre en español de cada acción de la auditoría (las que no están aquí se muestran tal cual). */
export const ADMIN_ACTION_LABELS: Readonly<Record<string, string>> = {
  set_superadmin: 'Superadmin',
  set_sport_status: 'Estado de deporte',
  block_user: 'Bloqueó cuenta',
  unblock_user: 'Desbloqueó cuenta',
  announce: 'Anuncio',
  delete_league: 'Borró liga',
  transfer_league: 'Traspasó liga',
  clear_errors: 'Borró errores',
  delete_account: 'Cuenta borrada',
  resolve_report: 'Atendió reporte',
};

/**
 * ¿Sirve como ruta de un anuncio? Igual que private.app_path_ok: empieza con una sola '/', sin espacios ni
 * barras invertidas, hasta 200 caracteres. Vacío = '/' (sirve).
 */
export function isAnnouncementUrl(url: string | undefined | null): boolean {
  const u = (url ?? '').trim();
  if (!u) return true;
  // eslint-disable-next-line no-control-regex
  return u.length <= 200 && u.startsWith('/') && !u.startsWith('//') && !/[\s\\\u0000-\u001f\u007f]/.test(u);
}

// ---------- De lo que manda la base a los tipos de arriba ----------
// La base ya manda camelCase; aquí solo se asegura el tipo de cada campo (números, textos, null) para que una
// fila rara nunca rompa una pantalla.

type Raw = Record<string, unknown>;

const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : v == null ? null : String(v));
const bool = (v: unknown): boolean => v === true || v === 'true';
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;

const KINDS: readonly LeagueKind[] = ['liga', 'torneo'];
const VISIBILITIES: readonly Visibility[] = ['public', 'private'];
const ROLES: readonly LeagueRole[] = ['owner', 'admin', 'member'];
const STATUSES: readonly SportStatus[] = ['open', 'beta', 'closed'];
const TARGETS: readonly AdminAuditEntry['targetType'][] = ['user', 'league', 'sport', 'app'];

export function toAdminOverview(raw: unknown): AdminOverview | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = obj(raw);
  const u = obj(r.users);
  const l = obj(r.leagues);
  const a = obj(r.activity);
  const s = obj(r.storage);
  const sc = obj(r.scan);
  const p = obj(r.push);
  return {
    generatedAt: str(r.generatedAt),
    users: {
      total: num(u.total),
      new7d: num(u.new7d),
      new30d: num(u.new30d),
      active7d: num(u.active7d),
      active30d: num(u.active30d),
      superadmins: num(u.superadmins),
      blocked: num(u.blocked),
      unconfirmed: num(u.unconfirmed),
    },
    leagues: {
      total: num(l.total),
      public: num(l.public),
      private: num(l.private),
      tournaments: num(l.tournaments),
      withMinors: num(l.withMinors),
      new30d: num(l.new30d),
      active7d: num(l.active7d),
      bySport: list(l.bySport).map((x) => {
        const b = obj(x);
        return { sport: str(b.sport), leagues: num(b.leagues), players: num(b.players), active7d: num(b.active7d) };
      }),
    },
    activity: {
      events7d: num(a.events7d),
      matches7d: num(a.matches7d),
      entries7d: num(a.entries7d),
      submissionsPending: num(a.submissionsPending),
      photos7d: num(a.photos7d),
    },
    storage: { dbBytes: numOrNull(s.dbBytes), photosBytes: numOrNull(s.photosBytes), photos: num(s.photos) },
    scan: { today: num(sc.today), dailyLimit: num(sc.dailyLimit), perUserLimit: num(sc.perUserLimit) },
    push: { subscriptions: num(p.subscriptions), queued: num(p.queued), sent24h: num(p.sent24h), failed24h: num(p.failed24h) },
  };
}

export const toAdminSeries = (raw: unknown): AdminSeriesPoint[] =>
  list(raw).map((x) => {
    const d = obj(x);
    return {
      day: str(d.day),
      signups: num(d.signups),
      activeUsers: num(d.activeUsers),
      events: num(d.events),
      matches: num(d.matches),
      entries: num(d.entries),
      scans: num(d.scans),
    };
  });

export function toAdminUser(raw: unknown): AdminUser {
  const r = obj(raw);
  return {
    id: str(r.id),
    email: strOrNull(r.email),
    name: str(r.name),
    createdAt: str(r.createdAt),
    lastSeenAt: strOrNull(r.lastSeenAt),
    lastSignInAt: strOrNull(r.lastSignInAt),
    confirmed: bool(r.confirmed),
    provider: strOrNull(r.provider),
    superadmin: bool(r.superadmin),
    blockedAt: strOrNull(r.blockedAt),
    blockedReason: strOrNull(r.blockedReason),
    leagues: num(r.leagues),
    ownedLeagues: num(r.ownedLeagues),
  };
}

export function toAdminUserDetail(raw: unknown): AdminUserDetail | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = obj(raw);
  return {
    ...toAdminUser(r),
    memberships: list(r.memberships).map((x) => {
      const m = obj(x);
      return {
        leagueId: str(m.leagueId),
        leagueName: str(m.leagueName),
        sport: str(m.sport),
        kind: oneOf(m.kind, KINDS, 'liga'),
        role: oneOf(m.role, ROLES, 'member'),
        scorer: bool(m.scorer),
        joinedAt: strOrNull(m.joinedAt),
      };
    }),
    pushDevices: num(r.pushDevices),
    scansToday: num(r.scansToday),
    adult: bool(r.adult),
  };
}

export function toAdminLeague(raw: unknown): AdminLeague {
  const r = obj(raw);
  return {
    id: str(r.id),
    name: str(r.name),
    sport: str(r.sport),
    kind: oneOf(r.kind, KINDS, 'liga'),
    visibility: oneOf(r.visibility, VISIBILITIES, 'private'),
    hasMinors: bool(r.hasMinors),
    ownerId: str(r.ownerId),
    ownerName: str(r.ownerName),
    ownerEmail: strOrNull(r.ownerEmail),
    members: num(r.members),
    players: num(r.players),
    events: num(r.events),
    lastActivityAt: strOrNull(r.lastActivityAt),
    createdAt: str(r.createdAt),
  };
}

export function toAdminAuditEntry(raw: unknown): AdminAuditEntry {
  const r = obj(raw);
  return {
    id: num(r.id),
    at: str(r.at),
    actorId: strOrNull(r.actorId),
    actorName: strOrNull(r.actorName),
    action: str(r.action),
    targetType: oneOf(r.targetType, TARGETS, 'app'),
    targetId: strOrNull(r.targetId),
    detail: obj(r.detail),
  };
}

export function toAdminClientError(raw: unknown): AdminClientError {
  const r = obj(raw);
  const texts = (v: unknown) => list(v).filter((x): x is string => typeof x === 'string' && x !== '');
  return {
    fingerprint: str(r.fingerprint),
    hits: num(r.hits),
    reports: num(r.reports),
    users: num(r.users),
    firstAt: str(r.firstAt),
    lastAt: str(r.lastAt),
    kind: oneOf(r.kind, CLIENT_ERROR_KINDS, 'error'),
    message: str(r.message),
    component: strOrNull(r.component),
    stack: strOrNull(r.stack),
    route: strOrNull(r.route),
    ua: strOrNull(r.ua),
    appVersion: strOrNull(r.appVersion),
    userId: strOrNull(r.userId),
    userName: strOrNull(r.userName),
    routes: texts(r.routes),
    versions: texts(r.versions),
  };
}

export function toAdminClientErrors(raw: unknown): AdminClientErrors {
  const r = obj(raw);
  return { ...toPage(r, toAdminClientError), hits: num(r.hits), users: num(r.users) };
}

/** {rows, total} de la base → Page<T> (total nunca menor que las filas). */
export function toPage<T>(raw: unknown, row: (x: unknown) => T): Page<T> {
  const r = obj(raw);
  const rows = list(r.rows).map(row);
  return { rows, total: Math.max(num(r.total), rows.length) };
}

export function toAdminSystem(raw: unknown, mode?: AdminSystem['backend']): AdminSystem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = obj(raw);
  const p = obj(r.push);
  return {
    backend: mode ?? oneOf(r.backend, ['supabase', 'local'] as const, 'local'),
    migrations: Array.isArray(r.migrations)
      ? r.migrations.map((x) => {
          const m = obj(x);
          return { version: str(m.version), name: strOrNull(m.name) };
        })
      : null,
    lastHeartbeat: strOrNull(r.lastHeartbeat),
    cron: Array.isArray(r.cron)
      ? r.cron.map((x) => {
          const c = obj(x);
          return { job: str(c.job), schedule: str(c.schedule), lastRunAt: strOrNull(c.lastRunAt), lastStatus: strOrNull(c.lastStatus) };
        })
      : null,
    push: { queued: num(p.queued), claimed: num(p.claimed), failed24h: num(p.failed24h), oldestQueuedAt: strOrNull(p.oldestQueuedAt) },
    sportStatus: list(r.sportStatus).map((x) => {
      const s = obj(x);
      return { sport: str(s.sport), status: oneOf(s.status, STATUSES, 'beta'), leagues: num(s.leagues) };
    }),
  };
}

export function toAdminScanStats(raw: unknown): AdminScanStats | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = obj(raw);
  return {
    days: list(r.days).map((x) => {
      const d = obj(x);
      return { day: str(d.day), scans: num(d.scans) };
    }),
    models: list(r.models).map((x) => {
      const m = obj(x);
      return { model: str(m.model), today: num(m.today), total: num(m.total) };
    }),
    topUsers: list(r.topUsers).map((x) => {
      const t = obj(x);
      return { userId: str(t.userId), name: str(t.name), email: strOrNull(t.email), scans: num(t.scans) };
    }),
    today: num(r.today),
    dailyLimit: num(r.dailyLimit),
    perUserLimit: num(r.perUserLimit),
  };
}

// ---------- Páginas ----------

/**
 * Página → límite y desde dónde. `page` empieza en 0; `pageSize` de 1 a 100 (la base no da más).
 * Un número raro (negativo, decimal, NaN) se corrige en vez de fallar.
 */
export function pageArgs(page: number, pageSize: number): { p_limit: number; p_offset: number } {
  const size = Math.min(ADMIN_MAX_PAGE_SIZE, Math.max(1, Math.floor(Number.isFinite(pageSize) ? pageSize : 25)));
  const p = Math.max(0, Math.floor(Number.isFinite(page) ? page : 0));
  return { p_limit: size, p_offset: p * size };
}

const cleanSearch = (s: string | undefined) => (s ?? '').trim().slice(0, 100);

/** Clave de caché de una lista: los mismos parámetros (ya normalizados) = la misma consulta. */
const listKey = (parts: readonly unknown[]) => JSON.stringify(parts);

// ---------- Lecturas sin pantalla (también las usan las pruebas) ----------

export const fetchAdminOverview = async (): Promise<AdminOverview | null> => toAdminOverview(await rpc('admin_overview'));

export const fetchAdminSeries = async (days: number): Promise<AdminSeriesPoint[]> => toAdminSeries(await rpc('admin_series', { p_days: days }));

export interface AdminUsersQuery {
  search?: string;
  filter?: AdminUserFilter;
  /** Página, desde 0. */
  page: number;
  /** Filas por página (1–100). */
  pageSize: number;
}

export const fetchAdminUsers = async (q: AdminUsersQuery): Promise<Page<AdminUser>> =>
  toPage(
    await rpc('admin_users', { p_search: cleanSearch(q.search) || null, p_filter: q.filter ?? 'all', ...pageArgs(q.page, q.pageSize) }),
    toAdminUser,
  );

export const fetchAdminUser = async (id: string): Promise<AdminUserDetail | null> => toAdminUserDetail(await rpc('admin_user', { p_user: id }));

export interface AdminLeaguesQuery {
  search?: string;
  sport?: string;
  kind?: LeagueKind;
  visibility?: Visibility;
  sort?: AdminLeagueSort;
  /** Página, desde 0. */
  page: number;
  /** Filas por página (1–100). */
  pageSize: number;
}

export const fetchAdminLeagues = async (q: AdminLeaguesQuery): Promise<Page<AdminLeague>> =>
  toPage(
    await rpc('admin_leagues', {
      p_search: cleanSearch(q.search) || null,
      p_sport: q.sport || null,
      p_kind: q.kind || null,
      p_visibility: q.visibility || null,
      p_sort: q.sort ?? 'activity',
      ...pageArgs(q.page, q.pageSize),
    }),
    toAdminLeague,
  );

export interface AdminAuditQuery {
  action?: string;
  /** Página, desde 0. */
  page: number;
  /** Filas por página (1–100). */
  pageSize: number;
}

export const fetchAdminAudit = async (q: AdminAuditQuery): Promise<Page<AdminAuditEntry>> =>
  toPage(await rpc('admin_audit_log', { p_action: q.action?.trim() || null, ...pageArgs(q.page, q.pageSize) }), toAdminAuditEntry);

export const fetchAdminSystem = async (): Promise<AdminSystem | null> => toAdminSystem(await rpc('admin_system'), backend().mode);

export const fetchAdminScanStats = async (days: number): Promise<AdminScanStats | null> =>
  toAdminScanStats(await rpc('admin_scan_stats', { p_days: days }));

export interface AdminClientErrorsQuery {
  /** Días hacia atrás (1–90; la base guarda 30). */
  days: number;
  /** Busca en el mensaje, la pantalla y la ruta; o una huella exacta. */
  search?: string;
  kind?: ClientErrorKind;
  /** Página, desde 0. */
  page: number;
  /** Filas por página (1–100). */
  pageSize: number;
}

export const fetchAdminClientErrors = async (q: AdminClientErrorsQuery): Promise<AdminClientErrors> =>
  toAdminClientErrors(
    await rpc('admin_client_errors', {
      p_days: q.days,
      p_search: cleanSearch(q.search) || null,
      p_kind: q.kind || null,
      ...pageArgs(q.page, q.pageSize),
    }),
  );

// ---------- Lecturas (hooks) ----------

/**
 * useQuery de la caché con la forma `Live<T>`, sin guardar en el teléfono. No usa `useLive` a propósito: ese
 * convierte `createdAt` en `Stamp` y aquí las horas son texto.
 */
function useAdminQuery<T>(key: string | null, fetcher: () => Promise<T>, initial: T, tagList: string[]): Live<T> {
  const st = queryClient.useQuery<T>(key, fetcher, { initial, tags: tagList, persist: false });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

const EMPTY_PAGE: Page<never> = { rows: [], total: 0 };
const NO_POINTS: AdminSeriesPoint[] = [];

export function useAdminOverview(enabled: boolean): Live<AdminOverview | null> {
  return useAdminQuery(enabled ? keys.adminOverview : null, fetchAdminOverview, null, [
    tags.admin,
    tags.adminStats,
    tags.adminUsers,
    tags.adminLeagues,
    tags.users,
    tags.leagues,
  ]);
}

export function useAdminSeries(enabled: boolean, days: 30 | 90 | 365): Live<AdminSeriesPoint[]> {
  return useAdminQuery(enabled ? keys.adminSeries(days) : null, () => fetchAdminSeries(days), NO_POINTS, [tags.admin, tags.adminStats]);
}

/** Cuentas, más nuevas primero. `page` desde 0; `pageSize` 1–100. */
export function useAdminUsers(enabled: boolean, q: { search?: string; filter?: AdminUserFilter; page: number; pageSize: number }): Live<Page<AdminUser>> {
  const search = cleanSearch(q.search).toLowerCase();
  const filter = q.filter ?? 'all';
  const { p_limit, p_offset } = pageArgs(q.page, q.pageSize);
  const key = enabled ? keys.adminUsers(listKey([filter, p_offset, p_limit, search])) : null;
  return useAdminQuery(key, () => fetchAdminUsers({ search, filter, page: p_offset / p_limit, pageSize: p_limit }), EMPTY_PAGE as Page<AdminUser>, [
    tags.admin,
    tags.adminUsers,
    tags.users,
  ]);
}

/** Detalle de una cuenta (null mientras no hay id o si no existe). */
export function useAdminUser(id: string | null): Live<AdminUserDetail | null> {
  return useAdminQuery(id ? keys.adminUser(id) : null, () => fetchAdminUser(id!), null, [
    tags.admin,
    tags.adminUsers,
    tags.users,
    ...(id ? [tags.profile(id)] : []),
  ]);
}

/** Ligas y torneos de todos. `page` desde 0; `pageSize` 1–100; `sort` por defecto 'activity'. */
export function useAdminLeagues(
  enabled: boolean,
  q: { search?: string; sport?: string; kind?: LeagueKind; visibility?: Visibility; sort?: AdminLeagueSort; page: number; pageSize: number },
): Live<Page<AdminLeague>> {
  const search = cleanSearch(q.search).toLowerCase();
  const sort = q.sort ?? 'activity';
  const { p_limit, p_offset } = pageArgs(q.page, q.pageSize);
  const norm = { search, sport: q.sport || undefined, kind: q.kind || undefined, visibility: q.visibility || undefined, sort };
  const key = enabled ? keys.adminLeagues(listKey([norm.sport ?? '', norm.kind ?? '', norm.visibility ?? '', sort, p_offset, p_limit, search])) : null;
  return useAdminQuery(key, () => fetchAdminLeagues({ ...norm, page: p_offset / p_limit, pageSize: p_limit }), EMPTY_PAGE as Page<AdminLeague>, [
    tags.admin,
    tags.adminLeagues,
    tags.leagues,
  ]);
}

/** Auditoría, lo más nuevo primero. `page` desde 0; `pageSize` 1–100. */
export function useAdminAudit(enabled: boolean, q: { action?: string; page: number; pageSize: number }): Live<Page<AdminAuditEntry>> {
  const action = q.action?.trim() || undefined;
  const { p_limit, p_offset } = pageArgs(q.page, q.pageSize);
  const key = enabled ? keys.adminAudit(listKey([action ?? '', p_offset, p_limit])) : null;
  return useAdminQuery(key, () => fetchAdminAudit({ action, page: p_offset / p_limit, pageSize: p_limit }), EMPTY_PAGE as Page<AdminAuditEntry>, [
    tags.admin,
    tags.adminAudit,
  ]);
}

export function useAdminSystem(enabled: boolean): Live<AdminSystem | null> {
  return useAdminQuery(enabled ? keys.adminSystem : null, fetchAdminSystem, null, [tags.admin, tags.adminSystem]);
}

export function useAdminScanStats(enabled: boolean, days: 30 | 90): Live<AdminScanStats | null> {
  return useAdminQuery(enabled ? keys.adminScan(days) : null, () => fetchAdminScanStats(days), null, [tags.admin, tags.adminStats]);
}

/** Etiqueta de caché de los errores de los teléfonos (se invalida al borrar un grupo). */
export const ADMIN_ERRORS_TAG = 'admin:errors';
const EMPTY_ERRORS: AdminClientErrors = { rows: [], total: 0, hits: 0, users: 0 };

/** Errores de los teléfonos agrupados, lo más reciente primero. `page` desde 0; `pageSize` 1–100. */
export function useAdminClientErrors(
  enabled: boolean,
  q: { days: number; search?: string; kind?: ClientErrorKind; page: number; pageSize: number },
): Live<AdminClientErrors> {
  const search = cleanSearch(q.search).toLowerCase();
  const days = Math.min(90, Math.max(1, Math.floor(Number.isFinite(q.days) ? q.days : 7)));
  const { p_limit, p_offset } = pageArgs(q.page, q.pageSize);
  const key = enabled ? `admin:errors:${listKey([days, q.kind ?? '', p_offset, p_limit, search])}` : null;
  return useAdminQuery(key, () => fetchAdminClientErrors({ days, search, kind: q.kind, page: p_offset / p_limit, pageSize: p_limit }), EMPTY_ERRORS, [
    tags.admin,
    ADMIN_ERRORS_TAG,
  ]);
}

// ---------- Acciones ----------

/** Bloquea la cuenta: no puede escribir nada (require_uid falla con 'bloqueada'). No a sí mismo ni a un superadmin. */
export async function blockUser(userId: string, reason: string): Promise<void> {
  await rpc('admin_block_user', { p_user: userId, p_reason: reason.trim() || null });
  invalidate(tags.adminUsers, tags.adminAudit, tags.users, tags.profile(userId));
}

export async function unblockUser(userId: string): Promise<void> {
  await rpc('admin_unblock_user', { p_user: userId });
  invalidate(tags.adminUsers, tags.adminAudit, tags.users, tags.profile(userId));
}

/**
 * Nombra o quita un superadmin desde la consola (set_superadmin; nombrar a una cuenta bloqueada la desbloquea).
 * Igual que `setSuperadmin` de members.ts, pero también pone al día la consola (lista, resumen y auditoría).
 */
export async function setUserSuperadmin(userId: string, value: boolean): Promise<void> {
  await rpc('set_superadmin', { p_user: userId, p_value: value });
  invalidate(tags.adminUsers, tags.adminAudit, tags.users, tags.profile(userId));
}

/** Abre, pone en beta o cierra un deporte (set_sport_status). */
export async function setSportStatus(sport: string, status: SportStatus): Promise<void> {
  await rpc('set_sport_status', { p_sport: sport, p_status: status });
  invalidate(tags.adminSystem, tags.adminAudit);
  // La copia de toda la app (selector de deportes, portada): al momento.
  void import('../../sports/status').then((m) => m.refreshSportStatus()).catch(() => undefined);
}

/** Pasa la liga a otra cuenta (debe ser miembro); el dueño anterior queda de admin. */
export async function transferLeague(leagueId: string, userId: string): Promise<void> {
  await rpc('transfer_ownership', { p_league: leagueId, p_user: userId });
  invalidate(tags.adminLeagues, tags.adminUsers, tags.adminAudit, tags.league(leagueId), tags.leagueMembers(leagueId), tags.leagues, tags.members);
}

/** Borra una liga de cualquiera (queda en la auditoría). */
export async function adminDeleteLeague(leagueId: string): Promise<void> {
  await rpc('delete_league', { p_league: leagueId });
  invalidate(
    tags.adminLeagues,
    tags.adminUsers,
    tags.adminAudit,
    tags.adminStats,
    tags.adminSystem,
    tags.league(leagueId),
    tags.leagues,
    tags.members,
    tags.feeds,
  );
}

/** Lo que la base recibe como público del anuncio (solo las claves que entiende). */
const audienceArg = (a: AnnouncementAudience): Record<string, string> =>
  a.kind === 'sport' ? { kind: 'sport', sport: a.sport } : a.kind === 'league' ? { kind: 'league', leagueId: a.leagueId } : { kind: a.kind };

/**
 * Manda un anuncio push. Devuelve a cuántas cuentas se encoló (las que tienen avisos activados en algún teléfono
 * y no están bloqueadas). Máximo 5 por hora ('rate_limited').
 */
export async function sendAnnouncement(input: AnnouncementInput): Promise<{ recipients: number }> {
  const n = await rpc<number>('admin_announce', {
    p_title: input.title.trim(),
    p_body: input.body.trim(),
    p_url: input.url?.trim() || '/',
    p_audience: audienceArg(input.audience),
  });
  invalidate(tags.adminAudit, tags.adminSystem, tags.adminStats);
  return { recipients: num(n) };
}

/** Borra un grupo de errores de los teléfonos (ya se arregló) o todos (sin huella). Devuelve cuántos reportes. */
export async function clearClientErrors(fingerprint: string | null): Promise<number> {
  const n = await rpc<number>('admin_clear_client_errors', { p_fingerprint: fingerprint });
  invalidate(ADMIN_ERRORS_TAG, tags.adminAudit);
  return num(n);
}

/** Cuántas cuentas recibirían el anuncio (para mostrarlo antes de mandar). */
export async function countAnnouncementRecipients(audience: AnnouncementAudience): Promise<number> {
  return num(await rpc<number>('admin_count_recipients', { p_audience: audienceArg(audience) }));
}

/**
 * «Estoy usando la app»: la base anota la última vez (como mucho cada 6 h) y el día (usuarios activos por día).
 * Nunca falla por una cuenta bloqueada. auth.tsx la llama una vez al día por teléfono.
 */
export async function touchSeen(): Promise<void> {
  await rpc('touch_seen');
}

/** Clave del teléfono: el último día (fecha del teléfono) en que esta cuenta avisó que usa la app. */
export const seenKey = (uid: string) => `mm:visto:${uid}`;

type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): KeyValue | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const seenInFlight = new Set<string>();

/**
 * `touchSeen` como mucho una vez al día por teléfono y cuenta (se recuerda en `mm:visto:<uid>`). Nunca lanza:
 * sin señal o con error se intenta la próxima vez. Devuelve si llamó a la base.
 */
export async function touchSeenDaily(uid: string, opts: { storage?: KeyValue | null; now?: Date } = {}): Promise<boolean> {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const today = localDay(opts.now ?? new Date());
  const key = seenKey(uid);
  try {
    if (storage?.getItem(key) === today) return false;
  } catch {
    // sin almacenamiento: se avisa igual (la base lo aguanta: solo escribe una vez cada 6 h)
  }
  if (seenInFlight.has(uid)) return false;
  seenInFlight.add(uid);
  try {
    await touchSeen();
    try {
      storage?.setItem(key, today);
    } catch {
      // sin almacenamiento
    }
    return true;
  } catch {
    return false;
  } finally {
    seenInFlight.delete(uid);
  }
}
