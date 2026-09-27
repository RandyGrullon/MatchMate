import { useEffect, useState } from 'react';
import type { Backend, RealtimeMessage } from '../backend/types';
import type { OutboxItem } from '../db/outbox';
import { watchTopic } from '../db/query';
import type { Side } from '../../sports/types';
import { backend, enqueue, getUserId, invalidate, onOutbox, rpc, select, sentOrQueued, updateCached, useLive, type Live } from './client';
import { tags } from './keys';
import { pendingOps } from './pending';
import { chunks } from './rows';

/**
 * Lo común de los deportes de equipo (baloncesto, fútbol, sala) encima de los partidos (matches.ts) y los equipos
 * de temporada (seasonTeams.ts). Base: supabase/migrations/20260927000800_baloncesto.sql.
 *
 * - Convocatoria por partido (tabla match_rsvps): Voy / No voy / Tal vez. Va por la cola sin conexión (se ve de
 *   una y sale sola al volver la señal).
 * - Anotador de mesa designado por partido (tabla match_officials): lo pone el admin, con señal.
 * - Reglas de la liga (leagues.rules): lo del partido (`match`), la tabla (`table`) y lo de los equipos (`teams`:
 *   refuerzos, mínimo de jugadores, reloj corrido y la plantilla elegida).
 * - Hora del servidor (`server_now`): el reloj de referencia de la mesa y de los espectadores no depende del
 *   reloj de cada teléfono.
 * - Tiempo real: `league:<liga>` avisa 'match_rsvps' y 'match_officials' ({op, ids}); sin canal, se consulta cada
 *   15–20 s.
 */

// ---------- Tipos ----------

export type RsvpStatus = 'yes' | 'no' | 'maybe';

export const RSVP_STATUSES: readonly RsvpStatus[] = ['yes', 'maybe', 'no'];

export const RSVP_LABEL: Record<RsvpStatus, string> = { yes: 'Voy', maybe: 'Tal vez', no: 'No voy' };

export interface MatchRsvp {
  matchId: string;
  playerId: string;
  side: Side;
  status: RsvpStatus;
  /** Cuenta que la marcó (el jugador, su capitán o el admin). */
  setBy: string | null;
  /** Cuándo (ISO del servidor). No se llama updatedAt para que la caché no la vuelva `Stamp`. */
  at: string | null;
  /** Cambio de este teléfono que todavía no llega al servidor. */
  pending?: boolean;
}

export interface MatchOfficial {
  matchId: string;
  userId: string;
  /** Nombre en la liga (copiado al designarlo). */
  name: string;
}

/** Lo de los equipos en las reglas de la liga (`rules.teams`). */
export interface TeamRules {
  /** Refuerzos por equipo en un partido (jugadores fuera de la plantilla). La base lo hace cumplir en baloncesto. */
  reinforcements: number;
  /** Mínimo de jugadores para jugar: la convocatoria avisa si hay menos «Voy». */
  minPlayers: number;
  /** Reloj corrido (no se para en cada falta). */
  runningClock: boolean;
  /** Plantilla de reglas elegida (para mostrarla). */
  template: string | null;
}

export const DEFAULT_TEAM_RULES: TeamRules = { reinforcements: 2, minPlayers: 5, runningClock: false, template: null };

interface RsvpRow {
  match_id: string;
  player_id: string;
  side: number;
  status: RsvpStatus;
  set_by: string | null;
  updated_at: string | null;
}

interface OfficialRow {
  match_id: string;
  user_id: string;
  name: string | null;
}

// ---------- Filas → app ----------

const asSide = (v: unknown): Side => (v === 2 ? 2 : 1);
const isStatus = (v: unknown): v is RsvpStatus => v === 'yes' || v === 'no' || v === 'maybe';
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function toRsvp(r: RsvpRow): MatchRsvp {
  return {
    matchId: r.match_id,
    playerId: r.player_id,
    side: asSide(r.side),
    status: isStatus(r.status) ? r.status : 'maybe',
    setBy: r.set_by ?? null,
    at: typeof r.updated_at === 'string' ? r.updated_at : null,
  };
}

export const toOfficial = (r: OfficialRow): MatchOfficial => ({ matchId: r.match_id, userId: r.user_id, name: r.name ?? '' });

/** Reglas de equipos con sus valores por defecto (lo que venga raro de la base se ignora). */
export function teamRules(rules: unknown, defaults: Partial<TeamRules> = {}): TeamRules {
  const base = { ...DEFAULT_TEAM_RULES, ...defaults };
  const t = isObj(rules) && isObj(rules.teams) ? rules.teams : {};
  const int = (v: unknown, min: number, max: number, dflt: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : dflt;
  return {
    reinforcements: int(t.reinforcements, 0, 30, base.reinforcements),
    minPlayers: int(t.minPlayers, 1, 30, base.minPlayers),
    runningClock: typeof t.runningClock === 'boolean' ? t.runningClock : base.runningClock,
    template: typeof t.template === 'string' && t.template ? t.template : base.template,
  };
}

// ---------- La convocatoria que está en la cola ----------

export const RSVP_FN = 'set_match_rsvp';

/** Clave de colapso: lleva el lado (la RPC no lo recibe; la base lo saca de la plantilla). */
export const rsvpCollapseKey = (matchId: string, playerId: string, side: Side) => `trsvp:${matchId}:${playerId}:${side}`;

function pendingOf(o: OutboxItem): { matchId: string; playerId: string; side: Side; status: RsvpStatus | null } | null {
  if (o.fn !== RSVP_FN) return null;
  const parts = o.collapseKey?.split(':') ?? [];
  const matchId = typeof o.args.p_match === 'string' ? o.args.p_match : null;
  const playerId = typeof o.args.p_player === 'string' ? o.args.p_player : (parts[2] ?? null);
  if (!matchId || !playerId) return null;
  const status = isStatus(o.args.p_status) ? o.args.p_status : null;
  return { matchId, playerId, side: parts[3] === '2' ? 2 : 1, status };
}

/** La convocatoria con lo pendiente de la cola encima (en orden). Misma lista si nada cambia. */
export function overlayRsvps(list: MatchRsvp[], ops: readonly OutboxItem[], matchIds?: ReadonlySet<string>): MatchRsvp[] {
  let out = list;
  for (const o of ops) {
    const p = pendingOf(o);
    if (!p || (matchIds && !matchIds.has(p.matchId))) continue;
    const i = out.findIndex((r) => r.matchId === p.matchId && r.playerId === p.playerId);
    if (p.status === null) {
      if (i < 0) continue;
      out = out.filter((_, j) => j !== i);
      continue;
    }
    const next: MatchRsvp = {
      matchId: p.matchId,
      playerId: p.playerId,
      side: i >= 0 ? out[i].side : p.side,
      status: p.status,
      setBy: o.userId,
      at: new Date(o.createdAt).toISOString(),
      pending: true,
    };
    out = i >= 0 ? out.map((r, j) => (j === i ? next : r)) : [...out, next];
  }
  return out;
}

/** Cuántos «Voy», «Tal vez» y «No voy» tiene un lado, y quién de la plantilla no ha dicho nada. */
export interface RsvpSummary {
  yes: string[];
  maybe: string[];
  no: string[];
  none: string[];
}

export function rsvpSummary(rsvps: readonly MatchRsvp[], matchId: string, side: Side, roster: readonly string[]): RsvpSummary {
  const out: RsvpSummary = { yes: [], maybe: [], no: [], none: [] };
  const mine = new Map(rsvps.filter((r) => r.matchId === matchId && r.side === side).map((r) => [r.playerId, r.status] as const));
  for (const id of roster) {
    const s = mine.get(id);
    (s ? out[s] : out.none).push(id);
  }
  // Alguien que marcó y ya no está en la plantilla cuenta igual (el delegado lo ve).
  for (const [id, s] of mine) if (!roster.includes(id)) out[s].push(id);
  return out;
}

/** Aviso de mínimo: null si alcanza; si no, cuántos faltan para el mínimo (contando solo «Voy»). */
export function rsvpShortfall(summary: Pick<RsvpSummary, 'yes'>, minPlayers: number): number | null {
  const missing = minPlayers - summary.yes.length;
  return missing > 0 ? missing : null;
}

// ---------- Claves de la caché ----------

/** Resumen corto de una lista de ids (para la clave de la caché): cuántos y un hash. */
export function idsKey(ids: readonly string[]): string {
  const s = [...new Set(ids)].sort().join(',');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${new Set(ids).size}-${h.toString(36)}`;
}

export const teamSportKeys = {
  rsvps: (lid: string, matchIds: readonly string[]) => `trsvp:${lid}:${idsKey(matchIds)}`,
  officials: (lid: string) => `tofficial:${lid}`,
  rules: (lid: string) => `trules:${lid}`,
};

export const teamSportTags = {
  rsvps: (lid: string) => `trsvp:${lid}`,
  officials: (lid: string) => `tofficial:${lid}`,
  rules: (lid: string) => `trules:${lid}`,
};

// ---------- Tiempo real ----------

/** Qué invalida cada aviso de `league:<liga>` (lo demás del tema lo atienden matches.ts y topics.ts). */
export function handleTeamMessage(topic: string, msg: RealtimeMessage) {
  const kind = topic.slice(0, topic.indexOf(':'));
  const id = topic.slice(topic.indexOf(':') + 1);
  if (kind !== 'league') return;
  if (msg.event === 'match_rsvps') invalidate(teamSportTags.rsvps(id));
  else if (msg.event === 'match_officials') invalidate(teamSportTags.officials(id));
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
    const lid = topic.slice(topic.indexOf(':') + 1);
    const watch = watchTopic(b, topic, (msg) => handleTeamMessage(topic, msg), {
      onPoll: () => invalidate(teamSportTags.rsvps(lid), teamSportTags.officials(lid)),
      pollOnly: !getUserId(),
    });
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

/** Escucha la convocatoria y los anotadores designados de la liga mientras la pantalla está abierta. */
export function useTeamTopic(lid: string | null | undefined) {
  useEffect(() => {
    if (!lid) return;
    return acquire(`league:${lid}`);
  }, [lid]);
}

// ---------- Lecturas ----------

export async function fetchMatchRsvps(lid: string, matchIds: readonly string[]): Promise<MatchRsvp[]> {
  const ids = [...new Set(matchIds)];
  if (!ids.length) return overlayRsvps([], pendingOps(lid), new Set());
  const parts = await Promise.all(
    chunks(ids, 20).map((part) =>
      select<RsvpRow>({
        table: 'match_rsvps',
        columns: 'match_id,player_id,side,status,set_by,updated_at',
        filters: [
          { col: 'league_id', op: 'eq', value: lid },
          { col: 'match_id', op: 'in', value: part },
        ],
      }),
    ),
  );
  return overlayRsvps(parts.flat().map(toRsvp), pendingOps(lid), new Set(ids));
}

/** Convocatoria de esos partidos (en vivo mientras la pantalla está abierta). */
export function useMatchRsvps(lid: string | undefined, matchIds: readonly string[]): Live<MatchRsvp[]> {
  useTeamTopic(lid);
  const ids = [...new Set(matchIds)].sort();
  const key = lid && ids.length ? teamSportKeys.rsvps(lid, ids) : null;
  return useLive<MatchRsvp[]>(key, lid ? { kind: 'teamRsvps', lid, eventIds: ids } : null, () => fetchMatchRsvps(lid!, ids), {
    initial: [],
    tags: lid ? [tags.league(lid), teamSportTags.rsvps(lid)] : [],
  });
}

export async function fetchMatchOfficials(lid: string): Promise<MatchOfficial[]> {
  const rows = await select<OfficialRow>({ table: 'match_officials', columns: 'match_id,user_id,name', filters: [{ col: 'league_id', op: 'eq', value: lid }] });
  return rows.map(toOfficial);
}

/** Anotadores de mesa designados de la liga (uno por partido). */
export function useMatchOfficials(lid: string | undefined): Live<MatchOfficial[]> {
  useTeamTopic(lid);
  return useLive<MatchOfficial[]>(lid ? teamSportKeys.officials(lid) : null, lid ? { kind: 'teamOfficials', lid } : null, () => fetchMatchOfficials(lid!), {
    initial: [],
    tags: lid ? [tags.league(lid), teamSportTags.officials(lid)] : [],
  });
}

export async function fetchLeagueRules(lid: string): Promise<Record<string, unknown>> {
  const rows = await select<{ id: string; rules: unknown }>({ table: 'leagues', columns: 'id,rules', filters: [{ col: 'id', op: 'eq', value: lid }] });
  const r = rows[0]?.rules;
  return isObj(r) ? r : {};
}

/** Reglas de la liga tal como están en la base (`match`, `table`, `teams`…). */
export function useLeagueRules(lid: string | undefined): Live<Record<string, unknown>> {
  return useLive<Record<string, unknown>>(lid ? teamSportKeys.rules(lid) : null, lid ? { kind: 'teamRules', lid } : null, () => fetchLeagueRules(lid!), {
    initial: {},
    tags: lid ? [tags.league(lid), teamSportTags.rules(lid)] : [],
  });
}

// ---------- Escrituras ----------

/**
 * Convocatoria de un jugador para un partido (null la quita). La marca el jugador, su capitán o delegado, o el
 * admin. Va por la cola: sin señal se ve de una y sale sola. `side` = el lado de su equipo en el partido.
 */
export async function setMatchRsvp(lid: string, matchId: string, playerId: string, side: Side, status: RsvpStatus | null): Promise<void> {
  const { done } = enqueue(
    RSVP_FN,
    { p_match: matchId, p_player: playerId, p_status: status },
    { group: lid, collapseKey: rsvpCollapseKey(matchId, playerId, side), label: status ? `Convocatoria: ${RSVP_LABEL[status]}` : 'Quitar convocatoria' },
  );
  await sentOrQueued(done);
}

/** Admin: anotador de mesa designado del partido (null lo quita). Tiene que poder anotar ese partido. */
export async function setMatchOfficial(lid: string, matchId: string, userId: string | null): Promise<void> {
  await rpc('set_match_official', userId ? { p_match: matchId, p_user: userId } : { p_match: matchId });
  invalidate(teamSportTags.officials(lid));
}

/** Admin: guarda las reglas (mezcla con lo que ya tiene la liga). Los partidos ya creados guardan su copia. */
export async function saveLeagueRules(lid: string, patch: Record<string, unknown>): Promise<void> {
  const current = await fetchLeagueRules(lid);
  await rpc('update_league', { p_league: lid, p_patch: { rules: { ...current, ...patch } } });
  invalidate(tags.league(lid), tags.leagues, teamSportTags.rules(lid));
}

// ---------- Hora del servidor ----------

let offsetMs: number | null = null;
let offsetInflight: Promise<number> | null = null;
const offsetListeners = new Set<(ms: number) => void>();

/**
 * Diferencia (ms) entre el reloj del servidor y el de este teléfono: hora del servidor ≈ Date.now() + offset.
 * Se pide una vez (server_now) y se guarda; sin señal da 0 y se vuelve a intentar la próxima vez.
 */
export function serverOffset(): Promise<number> {
  if (offsetMs !== null) return Promise.resolve(offsetMs);
  offsetInflight ??= (async () => {
    try {
      const t0 = Date.now();
      const iso = await rpc<string>('server_now');
      const t1 = Date.now();
      const server = Date.parse(String(iso));
      if (!Number.isFinite(server)) return 0;
      offsetMs = Math.round(server - (t0 + t1) / 2);
      for (const l of offsetListeners) l(offsetMs);
      return offsetMs;
    } catch {
      return 0;
    } finally {
      offsetInflight = null;
    }
  })();
  return offsetInflight;
}

/** Lo que se sabe ahora de la diferencia con el servidor (0 hasta saberlo). */
export const knownServerOffset = () => offsetMs ?? 0;

/** Solo pruebas. */
export function resetServerOffsetForTests(value: number | null = null) {
  offsetMs = value;
  offsetInflight = null;
}

/** La diferencia con el servidor (0 mientras se pide). */
export function useServerOffset(): number {
  const [ms, setMs] = useState(knownServerOffset);
  useEffect(() => {
    offsetListeners.add(setMs);
    void serverOffset().then(setMs);
    return () => void offsetListeners.delete(setMs);
  }, []);
  return ms;
}

// ---------- Al encolar y al confirmar ----------

onOutbox({
  enqueue: (item) => {
    if (item.fn !== RSVP_FN) return;
    updateCached<MatchRsvp[]>('teamRsvps', (list, d) => (d.lid === item.group ? overlayRsvps(list, [item]) : list));
  },
  settled: (item) => {
    if (item.fn === RSVP_FN) invalidate(teamSportTags.rsvps(item.group));
  },
});
