import { useEffect } from 'react';
import type { Backend, Filter, RealtimeMessage } from '../backend/types';
import { uuidv7 } from '../db/ids';
import type { OutboxItem } from '../db/outbox';
import { watchTopic } from '../db/query';
import type { Stamp } from '../types';
import type { Side } from '../../sports/types';
import {
  backend,
  cachedQueries,
  currentOutbox,
  enqueue,
  getUserId,
  invalidate,
  onOutbox,
  queryClient,
  rpc,
  select,
  sentOrQueued,
  updateCached,
  useLive,
  type Live,
  type QueryDesc,
} from './client';
import { tags } from './keys';
import { pendingOps } from './pending';
import { chunks } from './rows';
import type { Wire } from './stamp';

/**
 * Partidos (tablas matches, match_sides, match_players): la base común de raqueta y deportes de equipo.
 * Contrato completo: docs/partidos.md.
 *
 * - Lecturas con la caché de consultas. Las listas NO bajan el estado completo del anotador (state), que
 *   solo trae `useMatch`. Al volver a consultar (sin tiempo real) se piden solo `id, version` y se bajan de
 *   nuevo solo los partidos que cambiaron (cuida el egress con muchos espectadores).
 * - Tiempo real: `league:<liga>` y `event:<evento>`; el aviso 'match' trae la fila y se pone directo en la caché.
 * - Escrituras de cancha (publicar, terminar, confirmar, disputar, suspender, alineación) por la cola sin
 *   conexión, con el cambio optimista en pantalla. El resto (admin) directo, con señal.
 * - La regla de las 48 h se calcula al leer: `isFinal(match, now)`.
 */

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
  'dispute_note,note,created_by,created_at,updated_at';

const asSide = (v: unknown): Side | null => (v === 1 || v === 2 ? v : null);
const iso = (v: unknown): string | null => (typeof v === 'string' && v ? v : v instanceof Date ? v.toISOString() : null);

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
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

// ---------- La regla de las 48 h (al leer) ----------

/** Un resultado propuesto sin reclamo cuenta como final a las 48 h. */
export const AUTO_CONFIRM_MS = 48 * 60 * 60 * 1000;

type Timed = Pick<Match, 'status' | 'proposedAt'>;

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

/**
 * Mi lado en el partido según lo que sabe el teléfono (el servidor decide igual): por mis jugadores en el partido
 * o por mis equipos. `teamIds` = equipos donde puedo confirmar (en equipos, solo capitán o delegado; en parejas, las mías).
 * null si no juego o si aparezco en los dos lados.
 */
export function sideOf(
  m: { sides: readonly Pick<MatchSide, 'side' | 'teamId' | 'players'>[] },
  mine: { playerIds?: readonly string[]; teamIds?: readonly string[] },
): Side | null {
  const players = new Set(mine.playerIds ?? []);
  const teams = new Set(mine.teamIds ?? []);
  const hits = m.sides.filter((s) => (s.teamId && teams.has(s.teamId)) || s.players.some((p) => players.has(p.playerId))).map((s) => s.side);
  return hits.length === 1 ? hits[0] : null;
}

/** El rival (o el admin) puede confirmar el resultado propuesto (también después de las 48 h: cierre formal). */
export function canConfirm(m: Timed & Pick<Match, 'proposedSide'>, mySide: Side | null, isAdmin: boolean): boolean {
  if (m.status !== 'finished') return false;
  if (isAdmin) return true;
  return mySide !== null && mySide !== m.proposedSide;
}

/** Disputar: solo el rival y dentro de las 48 h. */
export function canDispute(m: Timed & Pick<Match, 'proposedSide'>, mySide: Side | null, now: number = Date.now()): boolean {
  return awaitingConfirmation(m, now) && mySide !== null && mySide !== m.proposedSide;
}

/** El turno del anotador venció (su teléfono no publica hace rato). */
export function leaseExpired(m: Pick<Match, 'leaseUntil'>, now: number = Date.now()): boolean {
  return !m.leaseUntil || Date.parse(m.leaseUntil) <= now;
}

// ---------- Orden ----------

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const time = (v: string | Stamp | null | undefined) =>
  typeof v === 'string' ? Date.parse(v) : v && typeof v.toMillis === 'function' ? v.toMillis() : Number.POSITIVE_INFINITY;

/** Lo que hace falta para ordenar (sirve con Match y con lo que guarda la caché). */
export interface SortableMatch {
  id: string;
  round: number | null;
  scheduledAt: string | null;
  court: string;
  createdAt?: string | Stamp | null;
}

/** Ronda → hora → cancha («Cancha 2» antes que «Cancha 10») → creación. */
export function compareMatches(a: SortableMatch, b: SortableMatch): number {
  return (
    (a.round ?? 1e6) - (b.round ?? 1e6) ||
    time(a.scheduledAt) - time(b.scheduledAt) ||
    collator.compare(a.court, b.court) ||
    time(a.createdAt) - time(b.createdAt) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

// ---------- Claves y etiquetas de la caché ----------

export const matchKeys = {
  league: (lid: string) => `matches:l:${lid}`,
  event: (eventId: string) => `matches:e:${eventId}`,
  one: (id: string) => `match:${id}`,
  mine: (uid: string) => `matches:me:${uid}`,
};

export const matchTags = {
  league: (lid: string) => `matches:${lid}`,
  event: (eventId: string) => `matches:e:${eventId}`,
  one: (id: string) => `match:${id}`,
  mine: 'matches:me',
};

/** Etiqueta de los equipos y parejas de temporada (seasonTeams.ts). Aquí porque el tiempo real de la liga la invalida. */
export const seasonTeamTag = (lid: string) => `steams:${lid}`;

// ---------- Cambios de este teléfono que el servidor todavía no confirma ----------

/** RPC de partidos que van por la cola. */
export const MATCH_QUEUED_FNS = new Set(['publish_match', 'finish_match', 'confirm_result', 'dispute_result', 'suspend_match', 'set_match_players']);

const nowIso = (ms: number) => new Date(ms).toISOString();

/** Aplica encima lo pendiente de la cola (en orden). Mismo objeto si nada cambió. */
export function overlayMatch<M extends Wire<Match>>(m: M, ops: readonly OutboxItem[]): M {
  let out = m;
  for (const o of ops) {
    if (!MATCH_QUEUED_FNS.has(o.fn) || o.args.p_match !== m.id) continue;
    const a = o.args;
    const next = { ...out, pending: true } as M;
    switch (o.fn) {
      case 'publish_match':
        if (typeof a.p_seq === 'number' && a.p_seq < out.seq) continue;
        next.score = (a.p_score as MatchScore | null) ?? null;
        next.seq = Number(a.p_seq) || out.seq;
        // Como el servidor: en vivo solo con algo nuevo; un suspendido, solo si quien publica lo retomó (tiene el turno).
        if (Number(a.p_seq) > out.seq && (out.status === 'scheduled' || (out.status === 'suspended' && out.scorerId === o.userId))) next.status = 'live';
        // El detalle (useMatch) también lleva el estado del anotador.
        if (out.state !== undefined) next.state = (a.p_state as Record<string, unknown> | null) ?? out.state;
        break;
      case 'finish_match':
        if (!isOpen(out) && out.status !== 'finished') continue;
        next.status = 'finished';
        next.score = (a.p_score as MatchScore | null) ?? out.score;
        next.winner = asSide(a.p_winner);
        next.walkoverSide = null;
        next.proposedAt = nowIso(o.createdAt);
        next.proposedBy = o.userId;
        next.scorerId = null;
        next.leaseUntil = null;
        break;
      case 'confirm_result':
        if (out.status !== 'finished') continue;
        next.status = 'confirmed';
        next.confirmedBy = o.userId;
        next.confirmedAt = nowIso(o.createdAt);
        break;
      case 'dispute_result':
        if (out.status !== 'finished') continue;
        next.status = 'disputed';
        next.disputedBy = o.userId;
        next.disputedAt = nowIso(o.createdAt);
        next.disputeNote = (a.p_note as string | null) ?? null;
        break;
      case 'suspend_match':
        if (out.status !== 'live' && out.status !== 'scheduled') continue;
        next.status = 'suspended';
        if (a.p_score) next.score = a.p_score as MatchScore;
        next.scorerId = null;
        next.leaseUntil = null;
        break;
      case 'set_match_players': {
        const side = asSide(a.p_side);
        if (!side) continue;
        const players = ((a.p_players as { player_id: string; position?: string | null; jersey?: number | null; sub?: boolean }[]) ?? []).map(
          (p): MatchPlayer => ({ playerId: p.player_id, side, position: p.position ?? null, jersey: p.jersey ?? null, sub: !!p.sub }),
        );
        const sides = out.sides.map((s) => (s.side === side ? { ...s, players } : s)) as [MatchSide, MatchSide];
        next.sides = sides;
        break;
      }
    }
    out = next;
  }
  return out;
}

export function overlayMatches<M extends Wire<Match>>(list: M[], ops: readonly OutboxItem[]): M[] {
  if (!ops.some((o) => MATCH_QUEUED_FNS.has(o.fn))) return list;
  let changed = false;
  const out = list.map((m) => {
    const next = overlayMatch(m, ops);
    if (next !== m) changed = true;
    return next;
  });
  return changed ? out : list;
}

// ---------- Lecturas ----------

async function withSides(rows: MatchRow[]): Promise<Wire<Match>[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const parts = await Promise.all(
    chunks(ids).map(async (part) => {
      const byMatch: Filter = { col: 'match_id', op: 'in', value: part };
      const [s, p] = await Promise.all([
        select<MatchSideRow>({ table: 'match_sides', columns: 'match_id,side,team_id,label,seed', filters: [byMatch] }),
        select<MatchPlayerRow>({ table: 'match_players', columns: 'match_id,player_id,side,position,jersey,sub', filters: [byMatch] }),
      ]);
      return { s, p };
    }),
  );
  const sides = parts.flatMap((x) => x.s);
  const players = parts.flatMap((x) => x.p);
  return rows.map((r) => toMatch(r, sides, players));
}

async function rowsByIds(ids: readonly string[], columns = MATCH_LIST_COLUMNS): Promise<MatchRow[]> {
  const parts = await Promise.all(chunks([...new Set(ids)]).map((part) => select<MatchRow>({ table: 'matches', columns, filters: [{ col: 'id', op: 'in', value: part }] })));
  return parts.flat();
}

/** Última lectura del servidor de cada lista (sin lo pendiente), para bajar solo lo que cambió. */
const seen = new Map<string, Map<string, Wire<Match>>>();

/** Solo pruebas: olvida las lecturas anteriores. */
export function resetMatchesForTests() {
  seen.clear();
}

/**
 * Lista de partidos con esos filtros. La primera vez baja todo; después pide `id, version` y baja de nuevo solo
 * los que cambiaron (y los nuevos). Devuelve la lista ordenada con lo pendiente de la cola encima.
 */
export async function fetchMatchList(key: string, lid: string | null, filters: Filter[]): Promise<Wire<Match>[]> {
  const before = seen.get(key);
  let list: Wire<Match>[];
  if (!before) {
    list = await withSides(await select<MatchRow>({ table: 'matches', columns: MATCH_LIST_COLUMNS, filters }));
  } else {
    const versions = await select<{ id: string; version: number }>({ table: 'matches', columns: 'id,version', filters });
    const changed = versions.filter((v) => before.get(v.id)?.version !== v.version).map((v) => v.id);
    const fresh = changed.length ? await withSides(await rowsByIds(changed)) : [];
    const byId = new Map(fresh.map((m) => [m.id, m] as const));
    list = versions.map((v) => byId.get(v.id) ?? before.get(v.id)).filter((m): m is Wire<Match> => !!m);
  }
  seen.set(key, new Map(list.map((m) => [m.id, m] as const)));
  list.sort(compareMatches);
  return overlayMatches(list, pendingOps(lid ?? undefined));
}

export const fetchLeagueMatches = (lid: string) => fetchMatchList(matchKeys.league(lid), lid, [{ col: 'league_id', op: 'eq', value: lid }]);

export const fetchEventMatches = (lid: string, eventId: string) =>
  fetchMatchList(matchKeys.event(eventId), lid, [
    { col: 'league_id', op: 'eq', value: lid },
    { col: 'event_id', op: 'eq', value: eventId },
  ]);

/** Un partido completo: con reglas, estado del anotador e historial. null si no existe o no se ve. */
export async function fetchMatch(lid: string | null, id: string): Promise<Wire<Match> | null> {
  const rows = await select<MatchRow>({ table: 'matches', filters: [{ col: 'id', op: 'eq', value: id }] });
  if (!rows.length) return null;
  const [m] = await withSides(rows);
  return overlayMatch(m, pendingOps(lid ?? m.leagueId));
}

/** Mis partidos en todas mis ligas (por mis jugadores o mis parejas/equipos), con mi lado. */
export async function fetchMyMatches(since: string | null = null): Promise<Wire<Match>[]> {
  const mine = (await rpc<{ match_id: string; league_id: string; side: number }[] | null>('my_matches', since ? { p_since: since } : {})) ?? [];
  if (!mine.length) return [];
  const sideById = new Map(mine.map((r) => [r.match_id, asSide(r.side)] as const));
  const list = await withSides(await rowsByIds(mine.map((r) => r.match_id)));
  const ops = pendingOps();
  return overlayMatches(
    list.map((m) => ({ ...m, mySide: sideById.get(m.id) ?? null })),
    ops,
  ).sort((a, b) => time(a.scheduledAt) - time(b.scheduledAt) || compareMatches(a, b));
}

/** Partidos de la liga o de un evento, en vivo mientras la pantalla está abierta. */
export function useMatches(opts: { lid: string | undefined; eventId?: string | null }): Live<Match[]> {
  const { lid, eventId } = opts;
  useMatchTopic(lid ? (eventId ? `event:${eventId}` : `league:${lid}`) : null, lid ?? null);
  const key = lid ? (eventId ? matchKeys.event(eventId) : matchKeys.league(lid)) : null;
  const desc: QueryDesc | null = lid ? { kind: 'matches', lid, eventId: eventId ?? undefined } : null;
  return useLive<Match[]>(key, desc, () => (eventId ? fetchEventMatches(lid!, eventId) : fetchLeagueMatches(lid!)), {
    initial: [],
    tags: lid ? [tags.league(lid), matchTags.league(lid), ...(eventId ? [matchTags.event(eventId)] : [])] : [],
  });
}

/** Un partido completo (reglas, estado para retomar, historial). En vivo por el tema de su evento o de la liga. */
export function useMatch(lid: string | undefined, id: string | undefined, opts: { eventId?: string | null } = {}): Live<Match | null> {
  useMatchTopic(lid && id ? (opts.eventId ? `event:${opts.eventId}` : `league:${lid}`) : null, lid ?? null);
  return useLive<Match | null>(lid && id ? matchKeys.one(id) : null, lid && id ? { kind: 'match', lid, id } : null, () => fetchMatch(lid!, id!), {
    initial: null,
    tags: lid && id ? [tags.league(lid), matchTags.league(lid), matchTags.one(id)] : [],
  });
}

/** Mis partidos de todas mis ligas (Calendario, «Mis partidos»). `since` ISO: desde esa fecha (más los abiertos). */
export function useMyMatches(uid: string | null | undefined, since: string | null = null): Live<Match[]> {
  return useLive<Match[]>(uid ? `${matchKeys.mine(uid)}:${since ?? ''}` : null, uid ? { kind: 'myMatches' } : null, () => fetchMyMatches(since), {
    initial: [],
    tags: [matchTags.mine],
  });
}

// ---------- Tiempo real ----------

const KINDS = ['matches', 'match', 'myMatches'] as const;

/** El aviso 'match' trae la fila: se pone en la caché sin volver a leer. */
export function applyMatchRow(row: MatchRow) {
  const fields = rowFields(row);
  const patch = <M extends Wire<Match>>(m: M): M => overlayMatch({ ...m, ...fields, pending: undefined } as M, pendingOps(row.league_id));
  for (const s of seen.values()) {
    const old = s.get(row.id);
    if (old) s.set(row.id, { ...old, ...fields });
  }
  for (const kind of KINDS) {
    for (const { key, desc } of cachedQueries(kind)) {
      if (kind === 'match') {
        if (desc.id !== row.id) continue;
        const old = queryClient.getQueryData<Wire<Match> | null>(key);
        if (!old) continue;
        queryClient.setQueryData<Wire<Match> | null>(key, patch(old));
        // El estado del anotador no viene en el aviso: si avanzó, se vuelve a leer.
        if (old.seq !== row.seq && old.state !== undefined) queryClient.invalidateKey(key);
        continue;
      }
      const list = queryClient.getQueryData<Wire<Match>[]>(key);
      if (!list) continue;
      const i = list.findIndex((m) => m.id === row.id);
      if (kind === 'matches') {
        const belongs = desc.lid === row.league_id && (!desc.eventId || desc.eventId === row.event_id);
        if (i < 0) {
          if (belongs) queryClient.invalidateKey(key);
          continue;
        }
        if (!belongs) {
          queryClient.setQueryData<Wire<Match>[]>(key, list.filter((m) => m.id !== row.id));
          continue;
        }
      } else if (i < 0) continue;
      const next = list.slice();
      next[i] = patch(list[i]);
      if (kind === 'matches') next.sort(compareMatches);
      queryClient.setQueryData<Wire<Match>[]>(key, next);
    }
  }
}

/** Qué hace cada aviso de los partidos (los demás eventos del tema no son de aquí). */
export function handleMatchMessage(topic: string, msg: RealtimeMessage) {
  const kind = topic.slice(0, topic.indexOf(':'));
  const id = topic.slice(topic.indexOf(':') + 1);
  if (msg.event === 'match') {
    const row = msg.payload as MatchRow | null;
    if (row && typeof row === 'object' && typeof row.id === 'string' && !('truncated' in row)) applyMatchRow(row);
    else invalidate(kind === 'league' ? matchTags.league(id) : matchTags.event(id), matchTags.mine);
    return;
  }
  if (msg.event === 'matches') {
    const ids = ((msg.payload as { ids?: unknown } | null)?.ids ?? []) as unknown[];
    invalidate(kind === 'league' ? matchTags.league(id) : matchTags.event(id), matchTags.mine, ...ids.filter((x): x is string => typeof x === 'string').map(matchTags.one));
    return;
  }
  if (msg.event === 'teams' && kind === 'league') invalidate(seasonTeamTag(id));
}

/** Sin tiempo real: lo que se vuelve a leer cada 15–20 s (las listas solo bajan lo que cambió). */
function pollTopic(topic: string) {
  const kind = topic.slice(0, topic.indexOf(':'));
  const id = topic.slice(topic.indexOf(':') + 1);
  if (kind === 'league') invalidate(matchTags.league(id), seasonTeamTag(id));
  else if (kind === 'event') invalidate(matchTags.event(id));
}

const watching = new Map<string, { count: number; stop: () => void }>();

function acquire(topic: string): () => void {
  let w = watching.get(topic);
  if (!w) {
    let b: Backend | null = null;
    try {
      b = backend();
    } catch {
      // sin backend: solo consultas
    }
    const watch = watchTopic(b, topic, (msg) => handleMatchMessage(topic, msg), { onPoll: () => pollTopic(topic), pollOnly: !getUserId() });
    w = { count: 0, stop: () => watch.stop() };
    watching.set(topic, w);
  }
  const mine = w;
  mine.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--mine.count <= 0) {
      mine.stop();
      if (watching.get(topic) === mine) watching.delete(topic);
    }
  };
}

/**
 * Escucha los avisos de partidos y equipos de ese tema (`league:<id>` o `event:<id>`) mientras la pantalla esté
 * abierta. Uno por tema aunque lo pidan varias pantallas; si el canal falla, consulta cada 15–20 s.
 */
export function useMatchTopic(topic: string | null, _lid: string | null = null) {
  useEffect(() => {
    if (!topic) return;
    return acquire(topic);
  }, [topic]);
}

// ---------- Resultados de las RPC ----------

export interface ClaimResult {
  ok: boolean;
  scorerId: string | null;
  scorerName: string | null;
  leaseUntil: string | null;
  /** El turno de quien lo tiene venció (su teléfono no publica): el admin puede tomar el control. */
  expired: boolean;
  status: MatchStatus;
  seq: number;
  version: number;
  /** Estado publicado (solo si ok): para retomar. */
  state: Record<string, unknown> | null;
}

export type PublishFailure = 'lease' | 'stale' | 'cerrado';

export interface PublishResult {
  ok: boolean;
  reason?: PublishFailure;
  status?: MatchStatus;
  seq?: number;
  version?: number;
  leaseUntil?: string | null;
  scorerId?: string | null;
  scorerName?: string | null;
}

export interface FinishResult {
  ok: boolean;
  status?: MatchStatus;
  reason?: 'stale';
}

type Raw = Record<string, unknown> | null | undefined;

export function toClaimResult(r: Raw): ClaimResult {
  const x = r ?? {};
  return {
    ok: x.ok === true,
    scorerId: (x.scorer_id as string | null) ?? null,
    scorerName: (x.scorer_name as string | null) ?? null,
    leaseUntil: iso(x.lease_until),
    expired: x.expired === true,
    status: (x.status as MatchStatus) ?? 'scheduled',
    seq: Number(x.seq ?? 0),
    version: Number(x.version ?? 0),
    state: (x.state as Record<string, unknown> | null) ?? null,
  };
}

export function toPublishResult(r: Raw): PublishResult {
  const x = r ?? {};
  const out: PublishResult = { ok: x.ok === true };
  if (typeof x.reason === 'string') out.reason = x.reason as PublishFailure;
  if (typeof x.status === 'string') out.status = x.status as MatchStatus;
  if (typeof x.seq === 'number') out.seq = x.seq;
  if (typeof x.version === 'number') out.version = x.version;
  if ('lease_until' in x) out.leaseUntil = iso(x.lease_until);
  if ('scorer_id' in x) out.scorerId = (x.scorer_id as string | null) ?? null;
  if ('scorer_name' in x) out.scorerName = (x.scorer_name as string | null) ?? null;
  return out;
}

const toFinishResult = (r: Raw): FinishResult => {
  const x = r ?? {};
  const out: FinishResult = { ok: x.ok !== false };
  if (typeof x.status === 'string') out.status = x.status as MatchStatus;
  if (x.reason === 'stale') out.reason = 'stale';
  return out;
};

// ---------- Escrituras del admin (con señal) ----------

export interface PlayerDraft {
  playerId: string;
  position?: string | null;
  jersey?: number | null;
  sub?: boolean;
}

export interface SideDraft {
  side: Side;
  teamId?: string | null;
  /** Sin nombre: el del equipo, o los jugadores («Ana / Luis»), o «Por definir». */
  label?: string;
  seed?: number | null;
  players?: PlayerDraft[];
}

export interface MatchDraft {
  /** Id del teléfono (si no, se genera uno). */
  id?: string;
  eventId?: string | null;
  round?: number | null;
  stage?: string;
  bracketKey?: string | null;
  court?: string;
  /** ISO. */
  scheduledAt?: string | null;
  format?: string;
  /** Sin reglas: se copian las de la liga. */
  rules?: Record<string, unknown>;
  /** false = el resultado de un jugador queda final (americano). Por defecto true. */
  requireConfirm?: boolean;
  sides: [SideDraft, SideDraft];
}

const playerArg = (p: PlayerDraft) => ({ player_id: p.playerId, position: p.position ?? null, jersey: p.jersey ?? null, sub: !!p.sub });

export function sideArg(s: SideDraft): Record<string, unknown> {
  const out: Record<string, unknown> = { side: s.side, team_id: s.teamId ?? null };
  if (s.label?.trim()) out.label = s.label.trim();
  if (s.seed != null) out.seed = s.seed;
  if (s.players) out.players = s.players.map(playerArg);
  return out;
}

export function draftArg(d: MatchDraft & { id: string }): Record<string, unknown> {
  const out: Record<string, unknown> = { id: d.id, sides: d.sides.map(sideArg) };
  if (d.eventId) out.event_id = d.eventId;
  if (d.round != null) out.round = d.round;
  if (d.stage) out.stage = d.stage;
  if (d.bracketKey) out.bracket_key = d.bracketKey;
  if (d.court) out.court = d.court;
  if (d.scheduledAt) out.scheduled_at = d.scheduledAt;
  if (d.format) out.format = d.format;
  if (d.rules) out.rules = d.rules;
  if (d.requireConfirm === false) out.require_confirm = false;
  return out;
}

const afterMatches = (lid: string, ...ids: string[]) => invalidate(matchTags.league(lid), matchTags.mine, ...ids.map(matchTags.one));

/** Admin: crea partidos en lote (calendario, ronda, cuadro). Devuelve los ids en el mismo orden. */
export async function createMatches(lid: string, drafts: readonly MatchDraft[]): Promise<string[]> {
  if (!drafts.length) return [];
  const withIds = drafts.map((d) => ({ ...d, id: d.id ?? uuidv7() }));
  const ids = await rpc<string[]>('create_matches', { p_league: lid, p_matches: withIds.map(draftArg) });
  afterMatches(lid);
  return ids ?? withIds.map((d) => d.id);
}

export interface MatchSchedulePatch {
  scheduledAt?: string | null;
  court?: string;
  round?: number | null;
  stage?: string;
  bracketKey?: string | null;
  eventId?: string | null;
  format?: string;
  requireConfirm?: boolean;
  /** Solo antes de empezar. */
  rules?: Record<string, unknown>;
}

export function schedulePatchArg(p: MatchSchedulePatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.scheduledAt !== undefined) out.scheduled_at = p.scheduledAt;
  if (p.court !== undefined) out.court = p.court;
  if (p.round !== undefined) out.round = p.round;
  if (p.stage !== undefined) out.stage = p.stage;
  if (p.bracketKey !== undefined) out.bracket_key = p.bracketKey;
  if (p.eventId !== undefined) out.event_id = p.eventId;
  if (p.format !== undefined) out.format = p.format;
  if (p.requireConfirm !== undefined) out.require_confirm = p.requireConfirm;
  if (p.rules !== undefined) out.rules = p.rules;
  return out;
}

export async function updateMatchSchedule(lid: string, id: string, patch: MatchSchedulePatch) {
  await rpc('update_match_schedule', { p_match: id, p_patch: schedulePatchArg(patch) });
  afterMatches(lid, id);
}

/** Admin: cambia los dos lados (p. ej. el cuadro ya sabe quién pasa). No con resultado anotado. */
export async function setMatchSides(lid: string, id: string, sides: [SideDraft, SideDraft]) {
  await rpc('set_match_sides', { p_match: id, p_sides: sides.map(sideArg) });
  afterMatches(lid, id);
}

/** Pide el turno de anotar (con señal). El admin con `force` se lo quita a otro (confirmar antes en pantalla). */
export async function claimScorer(lid: string, id: string, force = false): Promise<ClaimResult> {
  const r = toClaimResult(await rpc<Raw>('claim_scorer', force ? { p_match: id, p_force: true } : { p_match: id }));
  if (r.ok) afterMatches(lid, id);
  return r;
}

/** Suelta el turno o se lo pasa a otra cuenta (entregar el control). El admin se lo da a quien quiera. */
export async function releaseScorer(lid: string, id: string, to: string | null = null) {
  await rpc('release_scorer', to ? { p_match: id, p_to: to } : { p_match: id });
  afterMatches(lid, id);
}

/** Admin: decide una disputa (sin marcador: queda el propuesto). */
export async function resolveDispute(lid: string, id: string, fix: { score?: MatchScore; winner?: Side | null; state?: Record<string, unknown>; note?: string } = {}) {
  const args: Record<string, unknown> = { p_match: id };
  if (fix.score) {
    args.p_score = fix.score;
    args.p_winner = fix.winner ?? null;
  }
  if (fix.state) args.p_state = fix.state;
  if (fix.note?.trim()) args.p_note = fix.note.trim();
  await rpc('resolve_dispute', args);
  afterMatches(lid, id);
}

/** Admin: corrige el resultado en cualquier momento (queda confirmado). */
export async function adminCorrectResult(lid: string, id: string, r: { score: MatchScore; winner: Side | null; state?: Record<string, unknown>; note?: string }) {
  const args: Record<string, unknown> = { p_match: id, p_score: r.score, p_winner: r.winner };
  if (r.state) args.p_state = r.state;
  if (r.note?.trim()) args.p_note = r.note.trim();
  await rpc('admin_correct_result', args);
  afterMatches(lid, id);
}

/** Admin: W.O. `absent` = lado que no vino (0 = ninguno). `score` = el marcador del W.O. del deporte. */
export async function setWalkover(lid: string, id: string, absent: 0 | 1 | 2, opts: { score?: MatchScore; note?: string } = {}) {
  const args: Record<string, unknown> = { p_match: id, p_absent: absent };
  if (opts.score) args.p_score = opts.score;
  if (opts.note?.trim()) args.p_note = opts.note.trim();
  await rpc('set_walkover', args);
  afterMatches(lid, id);
}

export async function postponeMatch(lid: string, id: string, note?: string) {
  await rpc('postpone_match', note?.trim() ? { p_match: id, p_note: note.trim() } : { p_match: id });
  afterMatches(lid, id);
}

/** Admin: nueva fecha (ISO) y cancha. Aplazado vuelve a programado. */
export async function rescheduleMatch(lid: string, id: string, scheduledAt: string, opts: { court?: string; note?: string } = {}) {
  const args: Record<string, unknown> = { p_match: id, p_scheduled_at: scheduledAt };
  if (opts.court !== undefined) args.p_court = opts.court;
  if (opts.note?.trim()) args.p_note = opts.note.trim();
  await rpc('reschedule_match', args);
  afterMatches(lid, id);
}

export async function voidMatch(lid: string, id: string, note?: string) {
  await rpc('void_match', note?.trim() ? { p_match: id, p_note: note.trim() } : { p_match: id });
  afterMatches(lid, id);
}

export async function deleteMatch(lid: string, id: string) {
  await rpc('delete_match', { p_match: id });
  afterMatches(lid, id);
}

// ---------- Escrituras de cancha (por la cola) ----------

export const matchCollapse = {
  publish: (id: string) => `mpub:${id}`,
  finish: (id: string) => `mfin:${id}`,
  confirm: (id: string) => `mconf:${id}`,
  dispute: (id: string) => `mdisp:${id}`,
  suspend: (id: string) => `msus:${id}`,
  players: (id: string, side: Side) => `mplay:${id}:${side}`,
};

/**
 * Publica el estado del anotador. Va por la cola con colapso: sin señal solo sale el último. `done` se cumple
 * cuando el servidor lo tiene, con `{ok}` o `{ok: false, reason}` ('lease': otro anotador tomó el control;
 * 'stale': otro teléfono publicó algo más nuevo; 'cerrado': el partido ya terminó o se aplazó).
 */
export function publishMatch(
  lid: string,
  id: string,
  p: { seq: number; state: Record<string, unknown>; score: MatchScore | null },
): { opId: string; done: Promise<PublishResult> } {
  const { opId, done } = enqueue<Raw>(
    'publish_match',
    { p_match: id, p_seq: p.seq, p_state: p.state, p_score: p.score },
    { group: lid, collapseKey: matchCollapse.publish(id), label: 'Marcador en vivo' },
  );
  return { opId, done: done.then(toPublishResult) };
}

/**
 * Termina el partido con su resultado (por la cola). Con señal espera al servidor ({ok, status}: 'confirmed' si
 * lo anotó el admin o el anotador de la liga, 'finished' si falta que confirme el rival). Sin señal: undefined
 * (queda guardado y sale solo).
 */
export async function finishMatch(
  lid: string,
  id: string,
  r: { score: MatchScore; winner: Side | null; state?: Record<string, unknown> | null; seq?: number | null },
): Promise<FinishResult | undefined> {
  const args: Record<string, unknown> = { p_match: id, p_score: r.score, p_winner: r.winner };
  if (r.state) args.p_state = r.state;
  if (r.seq != null) args.p_seq = r.seq;
  const { done } = enqueue<Raw>('finish_match', args, { group: lid, collapseKey: matchCollapse.finish(id), label: 'Resultado del partido' });
  const out = await sentOrQueued(done);
  return out === undefined ? undefined : toFinishResult(out);
}

/** El rival (o el admin) confirma el resultado propuesto. */
export async function confirmResult(lid: string, id: string): Promise<void> {
  const { done } = enqueue('confirm_result', { p_match: id }, { group: lid, collapseKey: matchCollapse.confirm(id), label: 'Confirmar resultado' });
  await sentOrQueued(done);
}

/** El rival no está de acuerdo (dentro de las 48 h): decide el admin. */
export async function disputeResult(lid: string, id: string, note: string): Promise<void> {
  const args: Record<string, unknown> = { p_match: id };
  if (note.trim()) args.p_note = note.trim().slice(0, 500);
  const { done } = enqueue('dispute_result', args, { group: lid, collapseKey: matchCollapse.dispute(id), label: 'Reclamo del resultado' });
  await sentOrQueued(done);
}

/** Suspende con marcador parcial (lluvia, luz): quien anota o el admin. Se retoma pidiendo el turno. */
export async function suspendMatch(
  lid: string,
  id: string,
  r: { state?: Record<string, unknown> | null; score?: MatchScore | null; seq?: number | null; note?: string } = {},
): Promise<void> {
  const args: Record<string, unknown> = { p_match: id };
  if (r.state) args.p_state = r.state;
  if (r.score) args.p_score = r.score;
  if (r.seq != null) args.p_seq = r.seq;
  if (r.note?.trim()) args.p_note = r.note.trim();
  const { done } = enqueue('suspend_match', args, { group: lid, collapseKey: matchCollapse.suspend(id), label: 'Partido suspendido' });
  await sentOrQueued(done);
}

/**
 * Quita de la cola lo que este teléfono tenía por publicar o terminar de ese partido (el modo cancha lo pide
 * cuando su lista ya no vale: otro anotador, otra lista más nueva, el partido se suspendió). Lo que ya se está
 * enviando no se toca. Devuelve cuántas quitó.
 */
export async function discardQueuedCourtOps(lid: string, id: string): Promise<number> {
  const ob = currentOutbox();
  if (!ob) return 0;
  const keys = new Set([matchCollapse.publish(id), matchCollapse.finish(id)]);
  let n = 0;
  for (const it of ob.listPending(lid)) {
    if (!it.collapseKey || !keys.has(it.collapseKey) || it.status === 'sending') continue;
    try {
      await ob.discard(it.opId);
      n++;
    } catch {
      // se empezó a enviar justo ahora: el servidor la rechaza igual (turno, lista vieja)
    }
  }
  return n;
}

/**
 * Lo último que este teléfono tiene del partido completo (la caché de `useMatch`, también sin señal): el estado
 * del anotador y el seq del partido. null si no está en la caché.
 */
export function cachedCourtState(id: string): { state: Record<string, unknown> | null; seq: number } | null {
  const m = queryClient.getQueryData<Wire<Match> | null>(matchKeys.one(id));
  if (!m || m.state === undefined) return null;
  return { state: m.state ?? null, seq: m.seq };
}

/** Quién juega en un lado (alineación, presentes, suplente). Por la cola (la mesa lo hace sin señal). */
export async function setMatchPlayers(lid: string, id: string, side: Side, players: readonly PlayerDraft[]): Promise<void> {
  const { done } = enqueue(
    'set_match_players',
    { p_match: id, p_side: side, p_players: players.map(playerArg) },
    { group: lid, collapseKey: matchCollapse.players(id, side), label: 'Jugadores del partido' },
  );
  await sentOrQueued(done);
}

// ---------- Al encolar y al confirmar ----------

function applyOptimistic(item: OutboxItem) {
  if (!MATCH_QUEUED_FNS.has(item.fn)) return;
  const ops = [item];
  const id = item.args.p_match;
  updateCached<Wire<Match>[]>('matches', (list, d) => (d.lid === item.group ? overlayMatches(list, ops) : list));
  updateCached<Wire<Match>[]>('myMatches', (list) => overlayMatches(list, ops));
  updateCached<Wire<Match> | null>('match', (m, d) => (m && d.id === id ? overlayMatch(m, ops) : m));
}

onOutbox({
  enqueue: applyOptimistic,
  settled: (item) => {
    if (!MATCH_QUEUED_FNS.has(item.fn)) return;
    const id = typeof item.args.p_match === 'string' ? item.args.p_match : null;
    // Publicar: el aviso de tiempo real ya trae la fila; solo se quita la marca de pendiente.
    if (item.fn === 'publish_match') {
      if (id) invalidate(matchTags.one(id));
      invalidate(matchTags.league(item.group));
      return;
    }
    invalidate(matchTags.league(item.group), matchTags.mine, ...(id ? [matchTags.one(id)] : []));
  },
});
