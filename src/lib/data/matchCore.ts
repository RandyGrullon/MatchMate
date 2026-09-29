/**
 * Lo puro de los partidos: tipos, filas de la base y su traducción al tipo de la app, la regla de las 48 h (se
 * calcula al leer) y el id de cada lado. Sin React ni backend, así lo pueden usar la lógica de cada deporte y el
 * motor de insignias (que corre en Deno). `matches.ts` lo reexporta todo.
 */
import type { Stamp } from '../types';
import type { Side } from '../../sports/types';
import type { Wire } from './stamp';

// ---------- Tipos ----------

export type MatchStatus = 'scheduled' | 'live' | 'suspended' | 'finished' | 'confirmed' | 'disputed' | 'walkover' | 'void' | 'postponed';

export const MATCH_STATUSES: readonly MatchStatus[] = ['scheduled', 'live', 'suspended', 'finished', 'confirmed', 'disputed', 'walkover', 'void', 'postponed'];

/** Marcador resumido (matches.score): `text` para mostrar y `sides` = el número grande de cada lado (sets, goles, puntos). */
export interface MatchScore {
  text?: string;
  sides?: [number, number];
  [key: string]: unknown;
}

export interface MatchPlayer {
  playerId: string;
  side: Side;
  /** 'drive' / 'reves', 'GK', 'titular'… (lo define cada deporte). */
  position: string | null;
  jersey: number | null;
  /** Suplente o refuerzo. */
  sub: boolean;
}

export interface MatchSide {
  side: Side;
  /** Pareja o equipo de temporada (null = lado armado solo con jugadores, p. ej. americano). */
  teamId: string | null;
  /** Nombre copiado: «Ana / Luis», «Tigres», «Por definir». */
  label: string;
  seed: number | null;
  players: MatchPlayer[];
}

/** Una línea del historial: acción (`a`), quién, cuándo y lo que la acompaña (from, to, score, note…). */
export interface MatchHistoryItem {
  at: string;
  by: string | null;
  a: string;
  note?: string;
  [key: string]: unknown;
}

export interface Match {
  id: string;
  leagueId: string;
  eventId: string | null;
  round: number | null;
  stage: string;
  bracketKey: string | null;
  court: string;
  /** ISO (hora del servidor) o null. */
  scheduledAt: string | null;
  status: MatchStatus;
  format: string;
  requireConfirm: boolean;
  score: MatchScore | null;
  winner: Side | null;
  /** W.O.: el lado que no vino (0 = ninguno). */
  walkoverSide: 0 | 1 | 2 | null;
  scorerId: string | null;
  leaseUntil: string | null;
  seq: number;
  version: number;
  proposedBy: string | null;
  proposedAt: string | null;
  proposedSide: Side | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  disputedBy: string | null;
  disputedAt: string | null;
  disputeNote: string | null;
  note: string | null;
  createdBy: string | null;
  /** Juego de una serie del playoff (src/lib/data/playoffs.ts): no cuenta en la tabla de la temporada. */
  seriesId?: string | null;
  sides: [MatchSide, MatchSide];
  createdAt: Stamp | null;
  updatedAt: Stamp | null;
  /** Solo `useMatch`: reglas copiadas, estado del anotador e historial. */
  rules?: Record<string, unknown>;
  state?: Record<string, unknown> | null;
  history?: MatchHistoryItem[];
  /** Solo `useMyMatches`: mi lado. */
  mySide?: Side | null;
  /** Hay un cambio de este teléfono en la cola que el servidor todavía no confirma. */
  pending?: boolean;
}

// ---------- Filas de la base ----------

export interface MatchRow {
  id: string;
  league_id: string;
  event_id: string | null;
  round: number | null;
  stage: string;
  bracket_key: string | null;
  court: string;
  scheduled_at: string | null;
  status: MatchStatus;
  format: string;
  require_confirm: boolean;
  score: MatchScore | null;
  seq: number;
  version: number;
  winner_side: number | null;
  walkover_side: number | null;
  scorer_id: string | null;
  lease_until: string | null;
  proposed_by: string | null;
  proposed_at: string | null;
  proposed_side: number | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  disputed_by: string | null;
  disputed_at: string | null;
  dispute_note: string | null;
  note: string | null;
  created_by: string | null;
  series_id?: string | null;
  created_at: string;
  updated_at: string;
  rules?: Record<string, unknown>;
  state?: Record<string, unknown> | null;
  history?: MatchHistoryItem[];
}

export interface MatchSideRow {
  match_id: string;
  side: number;
  team_id: string | null;
  label: string;
  seed: number | null;
}

export interface MatchPlayerRow {
  match_id: string;
  player_id: string;
  side: number;
  position: string | null;
  jersey: number | null;
  sub: boolean;
}

/** Columnas de las listas: todo menos state, rules e history (lo mismo que trae el aviso 'match'). */
export const MATCH_LIST_COLUMNS =
  'id,league_id,event_id,round,stage,bracket_key,court,scheduled_at,status,format,require_confirm,score,seq,version,winner_side,' +
  'walkover_side,scorer_id,lease_until,proposed_by,proposed_at,proposed_side,confirmed_by,confirmed_at,disputed_by,disputed_at,' +
  'dispute_note,note,created_by,series_id,created_at,updated_at';

/** Lado 1 o 2 de un valor de la base; null si no es ninguno. */
export const asSide = (v: unknown): Side | null => (v === 1 || v === 2 ? v : null);
/** Hora de la base como texto ISO (o null). */
export const iso = (v: unknown): string | null => (typeof v === 'string' && v ? v : v instanceof Date ? v.toISOString() : null);

const emptySide = (side: Side): MatchSide => ({ side, teamId: null, label: 'Por definir', seed: null, players: [] });

/** Fila + lados + jugadores → partido de la app (horas en texto: `Wire`). */
export function toMatch(row: MatchRow, sideRows: readonly MatchSideRow[] = [], playerRows: readonly MatchPlayerRow[] = []): Wire<Match> {
  const sides = ([1, 2] as const).map((n): MatchSide => {
    const s = sideRows.find((r) => r.match_id === row.id && r.side === n);
    const base = s ? { side: n, teamId: s.team_id, label: s.label, seed: s.seed, players: [] as MatchPlayer[] } : emptySide(n);
    base.players = playerRows
      .filter((p) => p.match_id === row.id && p.side === n)
      .map((p) => ({ playerId: p.player_id, side: n, position: p.position, jersey: p.jersey, sub: !!p.sub }));
    return base;
  }) as [MatchSide, MatchSide];
  const out: Wire<Match> = {
    ...rowFields(row),
    sides,
  };
  if (row.rules !== undefined) out.rules = row.rules ?? {};
  if (row.state !== undefined) out.state = row.state ?? null;
  if (row.history !== undefined) out.history = Array.isArray(row.history) ? row.history : [];
  return out;
}

/** Los campos de la fila (sin lados): también lo que trae el aviso 'match' de tiempo real. */
export function rowFields(row: MatchRow): Omit<Wire<Match>, 'sides'> {
  const wo = row.walkover_side;
  return {
    id: row.id,
    leagueId: row.league_id,
    eventId: row.event_id ?? null,
    round: row.round ?? null,
    stage: row.stage ?? '',
    bracketKey: row.bracket_key ?? null,
    court: row.court ?? '',
    scheduledAt: iso(row.scheduled_at),
    status: row.status,
    format: row.format ?? '',
    requireConfirm: row.require_confirm !== false,
    score: row.score ?? null,
    winner: asSide(row.winner_side),
    walkoverSide: wo === 0 || wo === 1 || wo === 2 ? wo : null,
    scorerId: row.scorer_id ?? null,
    leaseUntil: iso(row.lease_until),
    seq: row.seq ?? 0,
    version: row.version ?? 0,
    proposedBy: row.proposed_by ?? null,
    proposedAt: iso(row.proposed_at),
    proposedSide: asSide(row.proposed_side),
    confirmedBy: row.confirmed_by ?? null,
    confirmedAt: iso(row.confirmed_at),
    disputedBy: row.disputed_by ?? null,
    disputedAt: iso(row.disputed_at),
    disputeNote: row.dispute_note ?? null,
    note: row.note ?? null,
    createdBy: row.created_by ?? null,
    seriesId: row.series_id ?? null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

// ---------- La regla de las 48 h (al leer) ----------

/** Un resultado propuesto sin reclamo cuenta como final a las 48 h. */
export const AUTO_CONFIRM_MS = 48 * 60 * 60 * 1000;

export type Timed = Pick<Match, 'status' | 'proposedAt'>;

/** Cuándo (ms) un resultado propuesto cuenta solo; null si no está por confirmar. */
export function autoConfirmAt(m: Timed): number | null {
  if (m.status !== 'finished' || !m.proposedAt) return null;
  const t = Date.parse(m.proposedAt);
  return Number.isFinite(t) ? t + AUTO_CONFIRM_MS : null;
}

/** El resultado cuenta para tablas y estadísticas: confirmado, W.O., o propuesto hace 48 h o más. */
export function isFinal(m: Timed, now: number = Date.now()): boolean {
  if (m.status === 'confirmed' || m.status === 'walkover') return true;
  const at = autoConfirmAt(m);
  return at !== null && at <= now;
}

/** Propuesto y todavía dentro de las 48 h: «por confirmar». */
export function awaitingConfirmation(m: Timed, now: number = Date.now()): boolean {
  return m.status === 'finished' && !isFinal(m, now);
}

/** Tiene un resultado (aunque no sea final todavía): propuesto, en disputa, confirmado o W.O. */
export const hasResult = (m: Pick<Match, 'status'>) =>
  m.status === 'finished' || m.status === 'confirmed' || m.status === 'disputed' || m.status === 'walkover';

/** Se está jugando o se puede retomar (el anotador puede publicar). */
export const isOpen = (m: Pick<Match, 'status'>) => m.status === 'scheduled' || m.status === 'live' || m.status === 'suspended';

/** Solo los partidos que cuentan (para las tablas de cada deporte). */
export const finalMatches = <M extends Timed>(list: readonly M[], now: number = Date.now()): M[] => list.filter((m) => isFinal(m, now));

/** Id del lado para las tablas: la pareja o el equipo; si no hay, sus jugadores ordenados (`p:<id>+<id>`). */
export function sideKey(s: { teamId: string | null; players: readonly Pick<MatchPlayer, 'playerId'>[] }): string {
  if (s.teamId) return s.teamId;
  return `p:${s.players
    .map((p) => p.playerId)
    .sort()
    .join('+')}`;
}
