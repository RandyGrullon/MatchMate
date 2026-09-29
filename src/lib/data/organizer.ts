import { claimTags } from './claims';
import { invalidate, rpc, useLive, type Live } from './client';
import { tags } from './keys';
import { matchTags } from './matches';

/**
 * Lo del organizador (20260929000600_organizador.sql) que no es de un deporte:
 * - Pendientes (league_pending): lo que espera por el admin en su liga, con enlaces, y los «primeros pasos» de
 *   una liga nueva. Lo usan la pestaña «Pendientes» del Admin, la tarjeta del inicio y el número de «Admin».
 * - Suspender un día (suspend_day_preview / suspend_day): mueve o aplaza lo de ese día y avisa UNA vez a la liga.
 *
 * La base manda las horas en texto ISO; aquí van con nombres que no son `createdAt` (así no se vuelven `Stamp`).
 */

// ---------- Claves y etiquetas ----------

export const organizerTags = {
  /** Pendientes de la liga (se vuelven a leer después de suspender un día o de lo que cambie lo pendiente). */
  pending: (lid: string) => `pending:${lid}`,
  /** Vista previa de suspender (todas las fechas de la liga). */
  suspend: (lid: string) => `suspend:${lid}`,
};

export const organizerKeys = {
  pending: (lid: string) => `pending:l:${lid}`,
  suspend: (lid: string, date: string) => `suspend:l:${lid}:${date}`,
};

// ---------- Pendientes ----------

export interface PendingSection<T> {
  count: number;
  /** Dónde se ve todo (ruta de la app). */
  url: string;
  /** Hasta 5, lo más viejo primero. */
  items: T[];
}

export interface PendingSubmission {
  id: string;
  playerId: string;
  playerName: string;
  eventId: string | null;
  eventName: string | null;
  /** Día que jugó ('YYYY-MM-DD'). */
  date: string | null;
  games: number;
  hasPhoto: boolean;
  /** Cuándo lo envió (ISO). */
  sentAt: string | null;
}

export interface PendingMatch {
  id: string;
  label: string;
  sides: string[];
  scheduledAt: string | null;
  /** Solo los reclamados. */
  disputedAt: string | null;
  note: string | null;
  /** Solo los que no tienen resultado: 'scheduled' | 'live' | 'suspended'. */
  status: string | null;
  url: string;
}

export interface PendingClaim {
  id: string;
  playerId: string;
  playerName: string;
  claimantName: string;
  note: string | null;
  /** Cuándo lo pidió (ISO). */
  requestedAt: string | null;
}

export interface PendingWaitlist {
  eventId: string;
  name: string;
  date: string;
  waiting: number;
  url: string;
}

export type ChecklistKey = 'invite' | 'players' | 'schedule' | 'result';

export interface ChecklistStep {
  key: ChecklistKey | string;
  label: string;
  done: boolean;
  url: string;
}

export interface Checklist {
  complete: boolean;
  done: number;
  total: number;
  steps: ChecklistStep[];
}

export interface LeaguePending {
  /** La suma de los pendientes (sin los primeros pasos). */
  total: number;
  submissions: PendingSection<PendingSubmission>;
  disputes: PendingSection<PendingMatch>;
  overdue: PendingSection<PendingMatch>;
  claims: PendingSection<PendingClaim>;
  waitlists: PendingSection<PendingWaitlist>;
  /** Solo los primeros 30 días de la liga. */
  checklist: Checklist | null;
}

type Raw = Record<string, unknown>;

const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? v.map(obj) : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const int = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
};

/** Solo rutas de la app ('/l/…'): lo demás cae en `fallback`. */
export function appPath(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^\/(?!\/)[\w\-/?=&.%:]*$/.test(v) ? v : fallback;
}

function section<T>(raw: unknown, fallback: string, item: (r: Raw) => T): PendingSection<T> {
  const r = obj(raw);
  return { count: int(r.count), url: appPath(r.url, fallback), items: arr(r.items).map(item) };
}

const matchItem = (base: string) => (r: Raw): PendingMatch => ({
  id: String(r.id ?? ''),
  label: str(r.label) ?? 'Partido',
  sides: Array.isArray(r.sides) ? r.sides.filter((s): s is string => typeof s === 'string') : [],
  scheduledAt: str(r.scheduledAt),
  disputedAt: str(r.disputedAt),
  note: str(r.note),
  status: str(r.status),
  url: appPath(r.url, `${base}/juegos`),
});

/** Lo que devuelve league_pending → tipos de la app (con lo que falte en cero, para no romper la pantalla). */
export function toLeaguePending(raw: unknown, lid: string): LeaguePending {
  const r = obj(raw);
  const base = `/l/${lid}`;
  const submissions = section(r.submissions, `${base}/admin?tab=aprobar`, (x) => ({
    id: String(x.id ?? ''),
    playerId: String(x.playerId ?? ''),
    playerName: str(x.playerName) ?? 'Jugador',
    eventId: str(x.eventId),
    eventName: str(x.eventName),
    date: str(x.date),
    games: int(x.games),
    hasPhoto: x.hasPhoto === true,
    sentAt: str(x.createdAt),
  }));
  const disputes = section(r.disputes, `${base}/juegos`, matchItem(base));
  const overdue = section(r.overdue, `${base}/juegos`, matchItem(base));
  const claims = section(r.claims, `${base}/admin?tab=reclamos`, (x) => ({
    id: String(x.id ?? ''),
    playerId: String(x.playerId ?? ''),
    playerName: str(x.playerName) ?? 'un jugador',
    claimantName: str(x.claimantName) ?? 'Alguien',
    note: str(x.note),
    requestedAt: str(x.createdAt),
  }));
  const waitlists = section(r.waitlists, base, (x) => ({
    eventId: String(x.eventId ?? ''),
    name: str(x.name) ?? 'Evento',
    date: str(x.date) ?? '',
    waiting: int(x.waiting),
    url: appPath(x.url, base),
  }));
  const c = r.checklist && typeof r.checklist === 'object' ? obj(r.checklist) : null;
  const steps = c
    ? arr(c.steps).map((s) => ({ key: String(s.key ?? ''), label: str(s.label) ?? '', done: s.done === true, url: appPath(s.url, base) }))
    : [];
  const checklist: Checklist | null = c
    ? { steps, done: steps.filter((s) => s.done).length, total: steps.length, complete: steps.every((s) => s.done) }
    : null;
  const total = submissions.count + disputes.count + overdue.count + claims.count + waitlists.count;
  return { total, submissions, disputes, overdue, claims, waitlists, checklist };
}

export async function fetchLeaguePending(lid: string): Promise<LeaguePending> {
  return toLeaguePending(await rpc<unknown>('league_pending', { p_league: lid }), lid);
}

/**
 * Admin: lo pendiente de la liga (null mientras carga, sin liga o sin ser admin). Se vuelve a leer al volver a la
 * pantalla, cada 2 minutos y al cambiar los reclamos; los envíos y los reclamos, además, ya se cuentan en vivo
 * (`pendingTotal`).
 */
export function useLeaguePending(lid: string | null | undefined): Live<LeaguePending | null> {
  return useLive<LeaguePending | null>(
    lid ? organizerKeys.pending(lid) : null,
    lid ? { kind: 'pending', lid } : null,
    () => fetchLeaguePending(lid as string),
    {
      initial: null,
      tags: lid ? [organizerTags.pending(lid), tags.league(lid), claimTags.league(lid)] : [],
      staleMs: 20_000,
      pollMs: 120_000,
    },
  );
}

/**
 * Cuántas cosas esperan por el admin (el número de «Pendientes» y, con las sugerencias, el de «Admin»). Los envíos
 * por aprobar y los reclamos se toman de lo que la pantalla ya cuenta en vivo (si se pasan); lo demás, de
 * league_pending.
 */
export function pendingTotal(p: LeaguePending | null | undefined, live: { submissions?: number; claims?: number } = {}): number {
  const submissions = live.submissions ?? p?.submissions.count ?? 0;
  const claims = live.claims ?? p?.claims.count ?? 0;
  return submissions + claims + (p ? p.disputes.count + p.overdue.count + p.waitlists.count : 0);
}

// ---------- Suspender un día ----------

export interface SuspendMatch {
  id: string;
  label: string;
  /** 'racket' | 'team'. */
  sub: string;
  status: string;
  scheduledAt: string | null;
  /** No se toca (en juego o con resultado). */
  locked: boolean;
  reason: 'en_juego' | 'con_resultado' | null;
}

export interface SuspendEvent {
  id: string;
  label: string;
  /** 'bowling' | 'golf' | 'swim' | 'event'. */
  sub: string;
  startTime: string | null;
  locked: boolean;
  reason: 'con_resultado' | null;
  /** Tiene inscritos u otra cosa que se perdería al cancelarlo (sin fecha nueva se queda). */
  content: boolean;
}

export interface SuspendPreview {
  date: string;
  matches: SuspendMatch[];
  events: SuspendEvent[];
  counts: { matches: number; bowlingEvents: number; golfRounds: number; swimMeets: number; otherEvents: number; locked: number };
  withNewDate: { matches: number; events: number };
  withoutDate: { postponed: number; cancelled: number; kept: number };
}

export interface SuspendResult {
  date: string;
  newDate: string | null;
  matches: { moved: number; postponed: number };
  events: { moved: number; cancelled: number; kept: number };
  locked: number;
  announced: boolean;
  /** Por qué no salió el aviso: 'nada' (no cambió nada), 'duplicado' (el mismo salió hace poco), 'limite' (ya se
   * mandaron los del día); null si salió (o la base no lo dijo). */
  skipped: SuspendSkip | null;
  recipients: number;
  body: string;
}

export type SuspendSkip = 'nada' | 'duplicado' | 'limite';

const reasonOf = (v: unknown) => (v === 'en_juego' || v === 'con_resultado' ? v : null);

export function toSuspendPreview(raw: unknown, date: string): SuspendPreview {
  const r = obj(raw);
  const c = obj(r.counts);
  const wn = obj(r.withNewDate);
  const wo = obj(r.withoutDate);
  return {
    date: str(r.date) ?? date,
    matches: arr(r.matches).map((m) => ({
      id: String(m.id ?? ''),
      label: str(m.label) ?? 'Partido',
      sub: str(m.sub) ?? '',
      status: str(m.status) ?? '',
      scheduledAt: str(m.scheduledAt),
      locked: m.locked === true,
      reason: reasonOf(m.reason),
    })),
    events: arr(r.events).map((e) => ({
      id: String(e.id ?? ''),
      label: str(e.label) ?? 'Evento',
      sub: str(e.sub) ?? 'event',
      startTime: str(e.startTime),
      locked: e.locked === true,
      reason: e.reason === 'con_resultado' ? 'con_resultado' : null,
      content: e.content === true,
    })),
    counts: {
      matches: int(c.matches),
      bowlingEvents: int(c.bowlingEvents),
      golfRounds: int(c.golfRounds),
      swimMeets: int(c.swimMeets),
      otherEvents: int(c.otherEvents),
      locked: int(c.locked),
    },
    withNewDate: { matches: int(wn.matches), events: int(wn.events) },
    withoutDate: { postponed: int(wo.postponed), cancelled: int(wo.cancelled), kept: int(wo.kept) },
  };
}

export function toSuspendResult(raw: unknown): SuspendResult {
  const r = obj(raw);
  const m = obj(r.matches);
  const e = obj(r.events);
  return {
    date: str(r.date) ?? '',
    newDate: str(r.newDate),
    matches: { moved: int(m.moved), postponed: int(m.postponed) },
    events: { moved: int(e.moved), cancelled: int(e.cancelled), kept: int(e.kept) },
    locked: int(r.locked),
    announced: r.announced === true,
    skipped: r.skipped === 'nada' || r.skipped === 'duplicado' || r.skipped === 'limite' ? r.skipped : null,
    recipients: int(r.recipients),
    body: str(r.body) ?? '',
  };
}

/** Lo que se puede cambiar ese día (sin lo que ya empezó o tiene resultados). */
export const suspendable = (p: SuspendPreview | null | undefined) =>
  p ? p.counts.matches + p.counts.bowlingEvents + p.counts.golfRounds + p.counts.swimMeets + p.counts.otherEvents : 0;

/**
 * Lo que de verdad cambia al suspender: con nueva fecha, lo que pasa a ese día; sin ella, los partidos que quedan
 * aplazados y los eventos vacíos que se cancelan (los que tienen inscritos se quedan en su fecha). 0 = no hay nada
 * que suspender así (la base tampoco manda el aviso).
 */
export const suspendChanges = (p: SuspendPreview | null | undefined, newDate: string | null) =>
  !p ? 0 : newDate ? p.withNewDate.matches + p.withNewDate.events : p.withoutDate.postponed + p.withoutDate.cancelled;

export async function fetchSuspendPreview(lid: string, date: string): Promise<SuspendPreview> {
  return toSuspendPreview(await rpc<unknown>('suspend_day_preview', { p_league: lid, p_date: date }), date);
}

/** Admin: lo que cambiaría al suspender ese día (null mientras carga, sin liga o sin fecha). No se guarda en el teléfono. */
export function useSuspendPreview(lid: string | null | undefined, date: string | null | undefined): Live<SuspendPreview | null> {
  const on = !!(lid && date);
  return useLive<SuspendPreview | null>(
    on ? organizerKeys.suspend(lid as string, date as string) : null,
    on ? { kind: 'suspend', lid: lid as string, id: date as string } : null,
    () => fetchSuspendPreview(lid as string, date as string),
    {
      initial: null,
      tags: on ? [organizerTags.suspend(lid as string), tags.league(lid as string), tags.events(lid as string)] : [],
      staleMs: 60_000,
      persist: false,
    },
  );
}

/** Motivo: 1–90 letras (va en el aviso). */
export const SUSPEND_REASON_MAX = 90;

/**
 * Admin: suspende el día. Con `newDate`, todo pasa a esa fecha (a la misma hora); sin ella, los partidos quedan
 * aplazados y los eventos vacíos se cancelan. Manda UN aviso a la liga (si ya se mandaron los de hoy, igual se
 * suspende: `announced` = false).
 */
export async function suspendDay(lid: string, date: string, reason: string, newDate: string | null): Promise<SuspendResult> {
  const r = await rpc<unknown>('suspend_day', {
    p_league: lid,
    p_date: date,
    p_reason: reason.trim().slice(0, SUSPEND_REASON_MAX),
    p_new_date: newDate || null,
  });
  invalidate(
    tags.events(lid),
    tags.entries(lid),
    tags.feeds,
    matchTags.league(lid),
    matchTags.mine,
    `announcements:${lid}`,
    organizerTags.pending(lid),
    organizerTags.suspend(lid),
  );
  return toSuspendResult(r);
}
