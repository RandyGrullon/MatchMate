import { useMemo } from 'react';
import { BLOCKED_MESSAGE, isBlockedError } from '../backend/errors';
import { asBackendError } from '../db/errors';
import { invalidate, queryClient, rpc, type Live } from './client';
import { tags } from './keys';

/**
 * Reportes de contenido (20260929000900_legal.sql): «esto no debería estar aquí» sobre un comentario, un aviso de
 * liga, un juego, una liga o una cuenta. RPC: report_content (cualquiera con sesión; lo tiene que ver), resolve_report
 * y list_reports (el superadmin, todo; los admins de una liga, los comentarios, avisos y juegos de su liga que no son
 * suyos, sin saber quién reportó). Un reporte cerrado ya no se decide otra vez ('cerrado'). Nada de esto se guarda en
 * el teléfono (`persist: false`): tiene notas y nombres.
 * Las horas llegan en texto ISO y se quedan así.
 */

// ---------- Tipos ----------

export type ReportKind = 'comment' | 'league' | 'user' | 'game' | 'announcement';
export type ReportReason = 'spam' | 'ofensivo' | 'acoso' | 'falso' | 'menores' | 'otro';
export type ReportStatus = 'open' | 'dismissed' | 'actioned';
/** Filtro de la lista: abiertos, cerrados (descartados y atendidos) o todos. */
export type ReportFilter = 'open' | 'closed' | 'all';

export const REPORT_KINDS: readonly ReportKind[] = ['comment', 'game', 'announcement', 'league', 'user'];

/** Los motivos, en el orden del selector. */
export const REPORT_REASONS: readonly { key: ReportReason; label: string; hint: string }[] = [
  { key: 'ofensivo', label: 'Ofensivo', hint: 'Insultos, groserías, discriminación o algo sexual.' },
  { key: 'acoso', label: 'Acoso o amenazas', hint: 'Molesta, amenaza o persigue a alguien.' },
  { key: 'spam', label: 'Spam o publicidad', hint: 'Anuncios, enlaces o mensajes repetidos.' },
  { key: 'falso', label: 'Falso o trampa', hint: 'Resultados inventados, cuentas falsas o alguien que se hace pasar por otro.' },
  { key: 'menores', label: 'Pone en riesgo a un menor', hint: 'Datos o fotos de un menor, o algo que lo pone en peligro.' },
  { key: 'otro', label: 'Otro motivo', hint: 'Cuéntanos en la nota.' },
];

export const REPORT_REASON_LABEL: Readonly<Record<ReportReason, string>> = Object.fromEntries(REPORT_REASONS.map((r) => [r.key, r.label])) as Record<
  ReportReason,
  string
>;

export const REPORT_KIND_LABEL: Readonly<Record<ReportKind, string>> = {
  comment: 'Comentario',
  game: 'Juego',
  announcement: 'Aviso de liga',
  league: 'Liga',
  user: 'Cuenta',
};

/** «este comentario», «esta liga»… (título del modal). */
export const REPORT_KIND_THIS: Readonly<Record<ReportKind, string>> = {
  comment: 'este comentario',
  game: 'este juego',
  announcement: 'este aviso',
  league: 'esta liga',
  user: 'esta cuenta',
};

/** Largo máximo de la nota de quien reporta y de quien lo atiende (la base: 500). */
export const REPORT_NOTE_MAX = 500;
/** Reportes nuevos por cuenta y día (la base: 'rate_limited'). */
export const REPORTS_PER_DAY = 10;

/** Lo reportado a la vista (null en el reporte = ya no existe). */
export interface ReportTarget {
  title: string;
  text: string | null;
  /** Ruta de la app para verlo. */
  url: string | null;
  /** De quién es (autor, dueño o jugador); null si no hay uno solo (un partido). */
  userId: string | null;
  userName: string | null;
  leagueId: string | null;
  leagueName: string | null;
  sport: string | null;
  /** Solo en una liga (para borrarla desde la consola). */
  leagueKind?: 'liga' | 'torneo';
  members?: number;
  events?: number;
  /** Solo en una cuenta. */
  blocked?: boolean;
}

export interface Report {
  id: string;
  kind: ReportKind;
  targetId: string;
  leagueId: string | null;
  leagueName: string | null;
  reason: ReportReason;
  note: string | null;
  status: ReportStatus;
  createdAt: string;
  handledAt: string | null;
  handledByName: string | null;
  actionNote: string | null;
  /** Solo para el superadmin (a los admins de una liga no se les dice quién reportó). */
  reporterId: string | null;
  reporterName: string | null;
  /** Reportes abiertos de lo mismo (este incluido si está abierto). */
  sameTarget: number;
  target: ReportTarget | null;
}

export interface ReportPage {
  rows: Report[];
  /** Con el filtro de estado. */
  total: number;
  /** Abiertos (sin el filtro de estado). */
  open: number;
  /** Todos (abiertos y cerrados). */
  all: number;
}

// ---------- De lo que manda la base a los tipos ----------

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;

export function toReportTarget(raw: unknown): ReportTarget | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = obj(raw);
  return {
    title: str(r.title) || 'Sin nombre',
    text: strOrNull(r.text),
    url: typeof r.url === 'string' && r.url.startsWith('/') && !r.url.startsWith('//') ? r.url : null,
    userId: strOrNull(r.userId),
    userName: strOrNull(r.userName),
    leagueId: strOrNull(r.leagueId),
    leagueName: strOrNull(r.leagueName),
    sport: strOrNull(r.sport),
    ...(r.kind === 'liga' || r.kind === 'torneo' ? { leagueKind: r.kind } : {}),
    ...(r.members != null ? { members: num(r.members) } : {}),
    ...(r.events != null ? { events: num(r.events) } : {}),
    ...(typeof r.blocked === 'boolean' ? { blocked: r.blocked } : {}),
  };
}

export function toReport(raw: unknown): Report {
  const r = obj(raw);
  return {
    id: str(r.id),
    kind: oneOf(r.kind, REPORT_KINDS, 'comment'),
    targetId: str(r.targetId),
    leagueId: strOrNull(r.leagueId),
    leagueName: strOrNull(r.leagueName),
    reason: oneOf(r.reason, REPORT_REASONS.map((x) => x.key), 'otro'),
    note: strOrNull(r.note),
    status: oneOf(r.status, ['open', 'dismissed', 'actioned'] as const, 'open'),
    createdAt: str(r.createdAt),
    handledAt: strOrNull(r.handledAt),
    handledByName: strOrNull(r.handledByName),
    actionNote: strOrNull(r.actionNote),
    reporterId: strOrNull(r.reporterId),
    reporterName: strOrNull(r.reporterName),
    sameTarget: num(r.sameTarget),
    target: toReportTarget(r.target),
  };
}

export function toReportPage(raw: unknown): ReportPage {
  const r = obj(raw);
  return {
    rows: (Array.isArray(r.rows) ? r.rows : []).map(toReport),
    total: num(r.total),
    open: num(r.open),
    all: num(r.all),
  };
}

const cleanNote = (note: string | null | undefined) => {
  const t = (note ?? '').trim();
  return t ? t.slice(0, REPORT_NOTE_MAX) : null;
};

// ---------- Etiquetas de la caché ----------

export const reportTags = {
  /** Todas las listas de reportes (consola y ligas). */
  all: 'reports',
  league: (lid: string) => `reports:${lid}`,
};

// ---------- Escrituras ----------

export interface ReportInput {
  kind: ReportKind;
  targetId: string;
  reason: ReportReason;
  note?: string | null;
}

/** Reporta. Devuelve el id del reporte (el mismo si ya lo había reportado y sigue abierto). */
export async function reportContent(input: ReportInput): Promise<string> {
  const id = await rpc<string>('report_content', {
    p_kind: input.kind,
    p_target: input.targetId,
    p_reason: input.reason,
    p_note: cleanNote(input.note),
  });
  invalidate(reportTags.all);
  return id;
}

/**
 * Descarta ('dismissed') o marca como atendido ('actioned') un reporte abierto. Cierra también los demás abiertos de
 * lo mismo. Si otro ya lo cerró falla con 'cerrado' (su decisión se queda) y la lista se pone al día.
 */
export async function resolveReport(id: string, status: Exclude<ReportStatus, 'open'>, note?: string | null): Promise<void> {
  try {
    await rpc('resolve_report', { p_report: id, p_status: status, p_note: cleanNote(note) });
  } catch (e) {
    if (isReportClosedError(e)) invalidate(reportTags.all);
    throw e;
  }
  invalidate(reportTags.all, tags.adminAudit);
}

/**
 * Herramienta de la consola y de los admins: borra el comentario reportado (delete_comment: su autor o un admin
 * de la liga, y el superadmin) y deja el reporte como atendido (si otro ya lo cerró, se queda como lo dejó).
 * Devuelve si se borró (false = ya no existía).
 */
export async function deleteReportedComment(report: Pick<Report, 'id' | 'targetId' | 'leagueId'>): Promise<boolean> {
  const deleted = await rpc<boolean>('delete_comment', { p_comment: report.targetId });
  if (report.leagueId) invalidate(tags.league(report.leagueId));
  try {
    await resolveReport(report.id, 'actioned', deleted ? 'Se borró el comentario.' : 'El comentario ya no existía.');
  } catch (e) {
    if (!isReportClosedError(e)) throw e;
  }
  return deleted !== false;
}

// ---------- Lecturas ----------

export interface ReportsQuery {
  /** La liga (obligatoria para un admin de liga; el superadmin puede no pasarla). */
  league?: string | null;
  status: ReportFilter;
  kind?: ReportKind | null;
  /** Página, desde 0. */
  page: number;
  /** Filas por página (1–100). */
  pageSize: number;
}

export async function fetchReports(q: ReportsQuery): Promise<ReportPage> {
  const size = Math.min(100, Math.max(1, Math.floor(q.pageSize) || 25));
  return toReportPage(
    await rpc('list_reports', {
      p_status: q.status,
      p_league: q.league ?? null,
      p_kind: q.kind ?? null,
      p_limit: size,
      p_offset: Math.max(0, Math.floor(q.page) || 0) * size,
    }),
  );
}

const EMPTY: ReportPage = { rows: [], total: 0, open: 0, all: 0 };

function useReportQuery(key: string | null, fetcher: () => Promise<ReportPage>, tagList: string[]): Live<ReportPage> {
  const st = queryClient.useQuery<ReportPage>(key, fetcher, { initial: EMPTY, tags: tagList, persist: false, staleMs: 30_000 });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

/** La lista (superadmin: todas o de una liga; admin de liga: la suya). */
export function useReports(enabled: boolean, q: ReportsQuery): Live<ReportPage> {
  const size = Math.min(100, Math.max(1, Math.floor(q.pageSize) || 25));
  const page = Math.max(0, Math.floor(q.page) || 0);
  const key = enabled ? `reports:list:${q.league ?? '*'}:${q.status}:${q.kind ?? ''}:${page}:${size}` : null;
  return useReportQuery(key, () => fetchReports({ ...q, page, pageSize: size }), [
    reportTags.all,
    ...(q.league ? [reportTags.league(q.league)] : [tags.admin]),
  ]);
}

/** Cuántos hay (abiertos y en total) para el número del menú: de una liga o, sin liga, de toda la app (superadmin). */
export function useReportCounts(enabled: boolean, league?: string | null): Live<{ open: number; all: number }> {
  const key = enabled ? `reports:count:${league ?? '*'}` : null;
  const st = useReportQuery(key, () => fetchReports({ league, status: 'open', page: 0, pageSize: 1 }), [
    reportTags.all,
    ...(league ? [reportTags.league(league)] : [tags.admin]),
  ]);
  return useMemo(() => ({ data: { open: st.data.open, all: st.data.all }, loading: st.loading, error: st.error }), [st]);
}

// ---------- Errores ----------

/** El código corto de la base: 'cerrado: …' → 'cerrado'. */
const errorCode = (e: unknown) => (e instanceof Error ? e.message : String(e ?? '')).trim().split(/[\s:]/)[0];

/** ¿Otro ya había cerrado el reporte (resolve_report: 'cerrado')? */
export const isReportClosedError = (e: unknown): boolean => errorCode(e) === 'cerrado';

/** El error de reportar o atender en palabras simples. */
export function reportErrorText(e: unknown): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  const be = asBackendError(e);
  const code = errorCode(e);
  if (code === 'cerrado') return 'Alguien más ya lo cerró. Mira cómo quedó en «Cerrados».';
  if (be?.kind === 'rate_limited' || code === 'rate_limited') return `Ya hiciste ${REPORTS_PER_DAY} reportes hoy. Prueba mañana.`;
  if (be?.kind === 'not_found' || code === 'no_existe') return 'Eso ya no existe o no lo puedes ver.';
  if (be?.kind === 'permission' || code === 'no_permitido') return 'No tienes permiso para hacer eso.';
  if (be?.kind === 'network') return 'Sin conexión. Prueba otra vez cuando tengas señal.';
  if (be?.kind === 'auth') return 'Tu sesión venció. Entra de nuevo.';
  if (be?.kind === 'validation' || code === 'invalido') return 'No puedes reportar algo tuyo, o falta el motivo.';
  return 'No se pudo. Prueba otra vez.';
}
