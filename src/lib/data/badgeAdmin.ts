/**
 * Consola del superadmin › Insignias (docs/insignias.md §6.6): reportes, palabras bloqueadas del creador, el motor
 * (cola, trabajos que ya no se toman, historial en seco y de verdad) y el retiro por fraude. CONTRATO con la base:
 * - 20260929001120_insignias_creador.sql: admin_badge_reports, admin_resolve_badge_reports, admin_blocked_terms,
 *   hide_league_badge (en leagueBadges.ts);
 * - 20260929001110_insignias_motor.sql: admin_badges_engine, admin_badge_jobs, badges_backfill;
 * - 20260929001100_insignias.sql: super_revoke_badge.
 * Las hazañas vencidas (14+ días o sin quién las confirme) llegan por `badge_notices` (useBadgeNotices, badges.ts).
 * Nada se guarda en el teléfono (`persist: false`), como el resto de la consola.
 */
import { useMemo } from 'react';
import { invalidate, queryClient, rpc, type Live } from './client';
import { badgeTags } from './badges';
import { toLeagueBadge, type LeagueBadge } from './leagueBadges';
import { tags } from './keys';

// ---------- Tipos ----------

export type ReportKind = 'diseno' | 'insignia';
export type ReportResolution = 'oculta' | 'retirada' | 'descartado';

/** Una insignia automática reportada (lo que manda admin_badge_reports). */
export interface ReportedAward {
  id: string;
  key: string;
  sport: string;
  level: number;
  periodKey: string;
  status: string;
  playerId: string | null;
  playerName: string | null;
  userId: string | null;
  context: Record<string, unknown>;
}

export interface BadgeReport {
  id: number;
  kind: ReportKind;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  resolution: ReportResolution | null;
  reporterId: string | null;
  reporterName: string | null;
  leagueId: string | null;
  leagueName: string | null;
  /** Reportes abiertos del mismo diseño o de la misma insignia (este incluido). */
  sameTarget: number;
  design: LeagueBadge | null;
  award: ReportedAward | null;
}

export interface BadgeReports {
  open: number;
  rows: BadgeReport[];
}

export interface BlockedTerm {
  term: string;
  /** Solo como palabra entera (o su plural). */
  whole: boolean;
  createdAt: string;
}

export interface EngineJob {
  id: number;
  kind: string;
  leagueId: string | null;
  leagueName: string | null;
  userId: string | null;
  userName: string | null;
  ref: string;
  attempts: number;
  lastError: string | null;
  runAfter: string;
  createdAt: string;
}

export interface DryRunRow {
  key: string;
  sport: string;
  level: number;
  holders: number;
  base: number;
  /** Porcentaje con un decimal; null sin base. */
  pct: number | null;
}

export interface BadgeEngine {
  queue: { pending: number; due: number; locked: number; dead: number; notices: number; oldestDue: string | null };
  byKind: { kind: string; pending: number; dead: number }[];
  /** Trabajos con 5+ intentos: el motor ya no los toma. */
  dead: EngineJob[];
  /** Corridas del historial que siguen en la cola. */
  backfill: { runId: string; dryRun: boolean; pending: number; dead: number }[];
  /** Las últimas corridas en seco. */
  runs: { runId: string; at: string; badges: number; holders: number }[];
  /** La corrida en seco pedida (o la última). */
  dryRun: { runId: string; rows: DryRunRow[] } | null;
  /** Los últimos periodos que corrieron (badge_runs). */
  periods: { kind: string; scope: string; periodKey: string; doneAt: string; awarded: number }[];
}

export interface BackfillResult {
  runId: string;
  dryRun: boolean;
  jobs: number;
  leagues: number;
  accounts: number;
}

// ---------- De la base a la pantalla ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(num(v, NaN)) ? num(v) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const RESOLUTIONS: readonly ReportResolution[] = ['oculta', 'retirada', 'descartado'];

export function toReportedAward(raw: unknown): ReportedAward | null {
  if (!isObj(raw) || !str(raw.id) || !str(raw.key)) return null;
  return {
    id: str(raw.id),
    key: str(raw.key),
    sport: str(raw.sport) || 'all',
    level: Math.max(0, Math.min(5, Math.trunc(num(raw.level)))),
    periodKey: str(raw.periodKey) || '-',
    status: str(raw.status),
    playerId: strOrNull(raw.playerId),
    playerName: strOrNull(raw.playerName),
    userId: strOrNull(raw.userId),
    context: isObj(raw.context) ? raw.context : {},
  };
}

export function toBadgeReport(raw: unknown): BadgeReport | null {
  if (!isObj(raw) || raw.id === undefined || raw.id === null) return null;
  const resolution = str(raw.resolution);
  return {
    id: num(raw.id),
    kind: raw.kind === 'diseno' ? 'diseno' : 'insignia',
    reason: str(raw.reason),
    createdAt: str(raw.createdAt),
    resolvedAt: strOrNull(raw.resolvedAt),
    resolution: (RESOLUTIONS as readonly string[]).includes(resolution) ? (resolution as ReportResolution) : null,
    reporterId: strOrNull(raw.reporterId),
    reporterName: strOrNull(raw.reporterName),
    leagueId: strOrNull(raw.leagueId),
    leagueName: strOrNull(raw.leagueName),
    sameTarget: Math.max(1, num(raw.sameTarget, 1)),
    design: raw.design ? toLeagueBadge(raw.design) : null,
    award: raw.award ? toReportedAward(raw.award) : null,
  };
}

export function toBadgeReports(raw: unknown): BadgeReports {
  const o = isObj(raw) ? raw : {};
  return { open: num(o.open), rows: list(o.rows).map(toBadgeReport).filter((r): r is BadgeReport => r !== null) };
}

export const toBlockedTerms = (raw: unknown): BlockedTerm[] =>
  list(raw)
    .filter(isObj)
    .map((t) => ({ term: str(t.term), whole: t.whole === true, createdAt: str(t.createdAt) }))
    .filter((t) => !!t.term);

function toEngineJob(raw: unknown): EngineJob | null {
  if (!isObj(raw) || raw.id === undefined) return null;
  return {
    id: num(raw.id),
    kind: str(raw.kind),
    leagueId: strOrNull(raw.leagueId),
    leagueName: strOrNull(raw.leagueName),
    userId: strOrNull(raw.userId),
    userName: strOrNull(raw.userName),
    ref: str(raw.ref),
    attempts: num(raw.attempts),
    lastError: strOrNull(raw.lastError),
    runAfter: str(raw.runAfter),
    createdAt: str(raw.createdAt),
  };
}

export function toBadgeEngine(raw: unknown): BadgeEngine | null {
  if (!isObj(raw)) return null;
  const q = isObj(raw.queue) ? raw.queue : {};
  const dry = isObj(raw.dryRun) ? raw.dryRun : null;
  return {
    queue: { pending: num(q.pending), due: num(q.due), locked: num(q.locked), dead: num(q.dead), notices: num(q.notices), oldestDue: strOrNull(q.oldestDue) },
    byKind: list(raw.byKind)
      .filter(isObj)
      .map((k) => ({ kind: str(k.kind), pending: num(k.pending), dead: num(k.dead) })),
    dead: list(raw.dead)
      .map(toEngineJob)
      .filter((j): j is EngineJob => j !== null),
    backfill: list(raw.backfill)
      .filter(isObj)
      .map((b) => ({ runId: str(b.runId), dryRun: b.dryRun === true, pending: num(b.pending), dead: num(b.dead) })),
    runs: list(raw.runs)
      .filter(isObj)
      .map((r) => ({ runId: str(r.runId), at: str(r.at), badges: num(r.badges), holders: num(r.holders) })),
    dryRun:
      dry && str(dry.runId)
        ? {
            runId: str(dry.runId),
            rows: list(dry.rows)
              .filter(isObj)
              .map((r) => ({ key: str(r.key), sport: str(r.sport) || 'all', level: num(r.level), holders: num(r.holders), base: num(r.base), pct: numOrNull(r.pct) })),
          }
        : null,
    periods: list(raw.periods)
      .filter(isObj)
      .map((p) => ({ kind: str(p.kind), scope: str(p.scope), periodKey: str(p.periodKey), doneAt: str(p.doneAt), awarded: num(p.awarded) })),
  };
}

// ---------- Claves y etiquetas ----------

export const BADGE_ADMIN_TAG = 'admin:badges';
export const badgeAdminKeys = {
  reports: (open: boolean) => `admin:badges:reports:${open ? 'abiertos' : 'cerrados'}`,
  terms: 'admin:badges:terms',
  engine: (run: string | null) => `admin:badges:engine:${run ?? 'ultima'}`,
};

function useAdminBadgesQuery<T>(key: string | null, fetcher: () => Promise<T>, initial: T): Live<T> {
  const st = queryClient.useQuery<T>(key, fetcher, { initial, tags: [tags.admin, BADGE_ADMIN_TAG], persist: false });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

const NO_REPORTS: BadgeReports = { open: 0, rows: [] };
const NO_TERMS: BlockedTerm[] = [];

// ---------- Lecturas ----------

export function useBadgeReports(enabled: boolean, open = true): Live<BadgeReports> {
  return useAdminBadgesQuery(enabled ? badgeAdminKeys.reports(open) : null, async () => toBadgeReports(await rpc('admin_badge_reports', { p_open: open, p_limit: 100 })), NO_REPORTS);
}

export function useBlockedTerms(enabled: boolean): Live<BlockedTerm[]> {
  return useAdminBadgesQuery(enabled ? badgeAdminKeys.terms : null, async () => toBlockedTerms(await rpc('admin_blocked_terms', {})), NO_TERMS);
}

/** El motor; `run` = una corrida en seco en particular (null: la última). */
export function useBadgeEngine(enabled: boolean, run: string | null = null): Live<BadgeEngine | null> {
  return useAdminBadgesQuery(enabled ? badgeAdminKeys.engine(run) : null, async () => toBadgeEngine(await rpc('admin_badges_engine', { p_run: run })), null);
}

// ---------- Acciones ----------

/** Cierra reportes sin hacer nada («Dejarla»). Nota privada opcional (hasta 200). */
export async function dismissBadgeReports(ids: readonly number[], note?: string | null): Promise<number> {
  try {
    return num(await rpc('admin_resolve_badge_reports', { p_ids: [...ids], p_note: note?.trim().slice(0, 200) || null }));
  } finally {
    invalidate(BADGE_ADMIN_TAG, tags.adminAudit);
  }
}

/** Retira una insignia automática por fraude (cierra sus reportes). Nota hasta 200; queda en la auditoría. */
export async function superRevokeBadge(awardId: string, note?: string | null): Promise<void> {
  try {
    await rpc('super_revoke_badge', { p_award: awardId, p_note: note?.trim().slice(0, 200) || null });
  } finally {
    invalidate(BADGE_ADMIN_TAG, tags.adminAudit, badgeTags.all);
  }
}

/** Añade o quita palabras bloqueadas del creador. Devuelve la lista como quedó. */
export async function editBlockedTerms(change: { add?: readonly string[]; remove?: readonly string[]; whole?: boolean }): Promise<BlockedTerm[]> {
  try {
    const res = toBlockedTerms(
      await rpc('admin_blocked_terms', {
        p_add: change.add?.length ? [...change.add] : null,
        p_remove: change.remove?.length ? [...change.remove] : null,
        p_whole: change.whole ?? false,
      }),
    );
    queryClient.setQueryData(badgeAdminKeys.terms, res);
    return res;
  } finally {
    invalidate(tags.adminAudit);
  }
}

/** Trabajos que el motor ya no toma: volver a la cola ('retry') o borrarlos ('drop'). */
export async function badgeJobs(ids: readonly number[], action: 'retry' | 'drop'): Promise<number> {
  try {
    return num(await rpc('admin_badge_jobs', { p_ids: [...ids], p_action: action }));
  } finally {
    invalidate(BADGE_ADMIN_TAG, tags.adminAudit);
  }
}

/** La primera corrida del historial (§3.5): de toda la app o de una liga, en seco (por defecto) o de verdad. */
export async function startBackfill(leagueId: string | null, dryRun: boolean): Promise<BackfillResult> {
  try {
    const r = await rpc<unknown>('badges_backfill', { p_league: leagueId, p_dry_run: dryRun });
    const o = isObj(r) ? r : {};
    return { runId: str(o.runId), dryRun: o.dryRun !== false, jobs: num(o.jobs), leagues: num(o.leagues), accounts: num(o.accounts) };
  } finally {
    invalidate(BADGE_ADMIN_TAG, tags.adminAudit);
  }
}
