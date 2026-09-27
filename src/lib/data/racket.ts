import { useMemo } from 'react';
import { uuidv7 } from '../db/ids';
import type { OutboxItem } from '../db/outbox';
import type { Stamp } from '../types';
import type { Side } from '../../sports/types';
import { enqueue, invalidate, onOutbox, rpc, select, sentOrQueued, updateCached, useLive, useOutboxSnapshot, type Live } from './client';
import { tags } from './keys';
import { draftArg, matchTags, type FinishResult, type Match, type MatchDraft, type MatchStatus } from './matches';
import { pendingOps } from './pending';
import type { Wire } from './stamp';
import { useTopic } from './topics';

/**
 * Raqueta (pádel ahora; tenis y pickleball después): lo que la base de partidos (matches.ts) no trae.
 * Migración: supabase/migrations/20260927000600_padel.sql.
 *
 * - Eventos con su configuración (events.config): la noche de americano/mexicano, la liga de parejas y el torneo
 *   por categorías. La app de siempre (BowlingEvent) no lee `config`; aquí sí.
 * - Reglas de la liga (leagues.rules: `{ match: reglas del motor de raqueta }`) y nivel de cada jugador
 *   (players.attrs.level, Playtomic 0–7: solo arma la ronda 1 del mexicano y la siembra de los torneos).
 * - save_night_round (admin, con señal): publica una ronda de la noche.
 * - save_points_result (por la cola, sin señal también): termina o corrige un partido a puntos (admite empate).
 */

// ---------- Eventos con configuración ----------

export interface RacketEvent {
  id: string;
  leagueId: string;
  /** 'americano' | 'mexicano' | 'liga' | 'torneo' (y 'noche' de antes). */
  type: string;
  name: string;
  /** 'YYYY-MM-DD'. */
  date: string;
  /** 'HH:MM' o null. */
  startTime: string | null;
  config: Record<string, unknown>;
  /** Jugadores de la noche o parejas (lo cuenta la base). */
  playerCount: number;
  createdAt: Stamp | null;
  updatedAt: Stamp | null;
}

export interface RacketEventRow {
  id: string;
  league_id: string;
  type: string;
  name: string;
  date: string;
  start_time: string | null;
  config: Record<string, unknown> | null;
  player_count: number | null;
  created_at: string;
  updated_at: string;
}

const EVENT_COLUMNS = 'id,league_id,type,name,date,start_time,config,player_count,created_at,updated_at';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function toRacketEvent(r: RacketEventRow): Wire<RacketEvent> {
  return {
    id: r.id,
    leagueId: r.league_id,
    type: r.type,
    name: r.name ?? '',
    date: typeof r.date === 'string' ? r.date.slice(0, 10) : '',
    startTime: typeof r.start_time === 'string' && r.start_time ? r.start_time.slice(0, 5) : null,
    config: isObj(r.config) ? r.config : {},
    playerCount: r.player_count ?? 0,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

export const racketKeys = {
  events: (lid: string) => `racket:events:${lid}`,
  event: (id: string) => `racket:event:${id}`,
  rules: (lid: string) => `racket:rules:${lid}`,
  levels: (lid: string) => `racket:levels:${lid}`,
};

export async function fetchRacketEvents(lid: string): Promise<Wire<RacketEvent>[]> {
  const rows = await select<RacketEventRow>({
    table: 'events',
    columns: EVENT_COLUMNS,
    filters: [{ col: 'league_id', op: 'eq', value: lid }],
    order: [{ col: 'date', asc: false }],
  });
  return rows.map(toRacketEvent);
}

export async function fetchRacketEvent(lid: string, id: string): Promise<Wire<RacketEvent> | null> {
  const rows = await select<RacketEventRow>({
    table: 'events',
    columns: EVENT_COLUMNS,
    filters: [
      { col: 'id', op: 'eq', value: id },
      { col: 'league_id', op: 'eq', value: lid },
    ],
  });
  return rows[0] ? toRacketEvent(rows[0]) : null;
}

/** Eventos de la liga con su configuración (los más nuevos primero), al día mientras la pantalla está abierta. */
export function useRacketEvents(lid: string | undefined): Live<RacketEvent[]> {
  useTopic(lid ? `league:${lid}` : null, lid ?? null);
  return useLive<RacketEvent[]>(lid ? racketKeys.events(lid) : null, lid ? { kind: 'racketEvents', lid } : null, () => fetchRacketEvents(lid!), {
    initial: [],
    tags: lid ? [tags.league(lid), tags.events(lid)] : [],
  });
}

/** Un evento con su configuración (la noche cambia de ronda: se relee con el aviso de la liga). */
export function useRacketEvent(lid: string | undefined, id: string | undefined): Live<RacketEvent | null> {
  useTopic(lid && id ? `league:${lid}` : null, lid ?? null);
  return useLive<RacketEvent | null>(
    lid && id ? racketKeys.event(id) : null,
    lid && id ? { kind: 'racketEvent', lid, id } : null,
    () => fetchRacketEvent(lid!, id!),
    { initial: null, tags: lid && id ? [tags.league(lid), tags.events(lid), tags.event(id)] : [] },
  );
}

// ---------- Reglas de la liga y nivel de los jugadores ----------

export async function fetchLeagueRules(lid: string): Promise<Record<string, unknown>> {
  const rows = await select<{ rules: unknown }>({ table: 'leagues', columns: 'id,rules', filters: [{ col: 'id', op: 'eq', value: lid }] });
  return isObj(rows[0]?.rules) ? (rows[0].rules as Record<string, unknown>) : {};
}

/** leagues.rules tal cual (`{ match: … }` en raqueta). */
export const useLeagueRules = (lid: string | undefined): Live<Record<string, unknown>> =>
  useLive<Record<string, unknown>>(lid ? racketKeys.rules(lid) : null, lid ? { kind: 'racketRules', lid } : null, () => fetchLeagueRules(lid!), {
    initial: {},
    tags: lid ? [tags.league(lid)] : [],
  });

/** Admin: cambia las reglas del partido de la liga (los partidos ya creados se quedan con las suyas). */
export async function saveLeagueMatchRules(lid: string, match: Record<string, unknown>) {
  const current = await fetchLeagueRules(lid);
  await rpc('update_league', { p_league: lid, p_patch: { rules: { ...current, match } } });
  invalidate(tags.league(lid), tags.leagues);
}

/** Nivel guardado en players.attrs (número 0–7; null si no tiene). */
export function levelOf(attrs: unknown): number | null {
  const v = isObj(attrs) ? attrs.level : null;
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(7, Math.max(0, v)) : null;
}

export async function fetchPlayerLevels(lid: string): Promise<Record<string, number>> {
  const rows = await select<{ id: string; attrs: unknown }>({ table: 'players', columns: 'id,attrs', filters: [{ col: 'league_id', op: 'eq', value: lid }] });
  const out: Record<string, number> = {};
  for (const r of rows) {
    const l = levelOf(r.attrs);
    if (l !== null) out[r.id] = l;
  }
  return out;
}

/** Nivel de cada jugador de la liga (id → 0–7). */
export const usePlayerLevels = (lid: string | undefined): Live<Record<string, number>> =>
  useLive<Record<string, number>>(lid ? racketKeys.levels(lid) : null, lid ? { kind: 'racketLevels', lid } : null, () => fetchPlayerLevels(lid!), {
    initial: {},
    tags: lid ? [tags.league(lid), tags.players(lid)] : [],
  });

/** Admin: pone (o quita, con null) el nivel de un jugador. Conserva lo demás de attrs. */
export async function setPlayerLevel(lid: string, playerId: string, level: number | null) {
  const rows = await select<{ id: string; attrs: unknown }>({ table: 'players', columns: 'id,attrs', filters: [{ col: 'id', op: 'eq', value: playerId }] });
  const attrs: Record<string, unknown> = isObj(rows[0]?.attrs) ? { ...(rows[0].attrs as Record<string, unknown>) } : {};
  if (level === null) delete attrs.level;
  else attrs.level = Math.min(7, Math.max(0, Math.round(level * 10) / 10));
  await rpc('update_player', { p_player: playerId, p_patch: { attrs } });
  invalidate(tags.players(lid));
}

// ---------- Escrituras de eventos (admin, con señal) ----------

export interface RacketEventInput {
  type: string;
  name: string;
  date: string;
  startTime?: string | null;
  config: Record<string, unknown>;
}

const afterEvent = (lid: string, id?: string) => invalidate(tags.events(lid), ...(id ? [tags.event(id)] : []), tags.feeds);

/** Crea la noche, la liga de parejas o el torneo con su configuración. Devuelve el id. */
export async function createRacketEvent(lid: string, input: RacketEventInput): Promise<string> {
  const id = uuidv7();
  await rpc('create_event', {
    p_id: id,
    p_league: lid,
    p_type: input.type,
    p_date: input.date,
    p_name: input.name.trim(),
    p_start_time: input.startTime || null,
    p_config: input.config,
  });
  afterEvent(lid);
  return id;
}

/** Cambia nombre, fecha, hora o configuración (la configuración se reemplaza entera). */
export async function updateRacketEvent(lid: string, id: string, patch: Partial<RacketEventInput>) {
  const p: Record<string, unknown> = {};
  if (patch.name !== undefined) p.name = patch.name.trim();
  if (patch.date !== undefined) p.date = patch.date;
  if (patch.startTime !== undefined) p.start_time = patch.startTime || null;
  if (patch.config !== undefined) p.config = patch.config;
  if (!Object.keys(p).length) return;
  await rpc('update_event', { p_event: id, p_patch: p });
  afterEvent(lid, id);
}

/**
 * Admin: publica la ronda `round` de la noche (atómica: rehace la ronda si ninguno de sus partidos empezó,
 * guarda quién descansa y avisa por push a cada jugador). Devuelve los ids de los partidos.
 */
export async function saveNightRound(lid: string, eventId: string, round: number, drafts: readonly MatchDraft[], rests: readonly string[]): Promise<string[]> {
  const matches = drafts.map((d) => draftArg({ ...d, eventId, id: d.id ?? uuidv7() }));
  const ids = await rpc<string[]>('save_night_round', { p_event: eventId, p_round: round, p_matches: matches, p_rests: [...rests] });
  invalidate(matchTags.league(lid), matchTags.event(eventId), matchTags.mine, tags.events(lid), tags.event(eventId));
  return ids ?? [];
}

// ---------- Resultado a puntos (por la cola) ----------

export const POINTS_FN = 'save_points_result';
export const pointsCollapse = (id: string) => `mpts:${id}`;

const asSide = (v: unknown): Side | null => (v === 1 || v === 2 ? v : null);

function toFinish(r: unknown): FinishResult {
  const x = isObj(r) ? r : {};
  const out: FinishResult = { ok: x.ok !== false };
  if (typeof x.status === 'string') out.status = x.status as MatchStatus;
  if (x.reason === 'stale') out.reason = 'stale';
  return out;
}

/**
 * Termina (o, el admin, corrige) un partido del americano o el mexicano con los puntos de cada lado. Va por la
 * cola: sin señal se ve enseguida y sale solo al volver (undefined = quedó en la cola).
 */
export async function savePointsResult(
  lid: string,
  matchId: string,
  score: readonly [number, number],
  opts: { state?: Record<string, unknown> | null; seq?: number | null; note?: string } = {},
): Promise<FinishResult | undefined> {
  const args: Record<string, unknown> = { p_match: matchId, p_score1: score[0], p_score2: score[1] };
  if (opts.state) args.p_state = opts.state;
  if (opts.seq != null) args.p_seq = opts.seq;
  if (opts.note?.trim()) args.p_note = opts.note.trim().slice(0, 500);
  const { done } = enqueue<unknown>(POINTS_FN, args, { group: lid, collapseKey: pointsCollapse(matchId), label: 'Resultado de la cancha' });
  const out = await sentOrQueued(done);
  return out === undefined ? undefined : toFinish(out);
}

/** El resultado a puntos que está en la cola, encima del partido (para verlo antes de que llegue). */
export function overlayPoints<M extends Wire<Match>>(m: M, ops: readonly OutboxItem[]): M {
  let out = m;
  for (const o of ops) {
    if (o.fn !== POINTS_FN || o.args.p_match !== m.id) continue;
    const a = Number(o.args.p_score1);
    const b = Number(o.args.p_score2);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    out = {
      ...out,
      pending: true,
      status: 'confirmed',
      score: { text: `${a}-${b}`, sides: [a, b] },
      winner: asSide(a > b ? 1 : b > a ? 2 : null),
      walkoverSide: null,
      scorerId: null,
      leaseUntil: null,
      confirmedAt: new Date(o.createdAt).toISOString(),
    } as M;
  }
  return out;
}

export function overlayPointsList<M extends Wire<Match>>(list: readonly M[], ops: readonly OutboxItem[]): M[] {
  if (!ops.some((o) => o.fn === POINTS_FN)) return list as M[];
  return list.map((m) => overlayPoints(m, ops));
}

/**
 * Partidos con los resultados a puntos que siguen en la cola encima (una relectura del servidor antes de que
 * salgan no los esconde). Se vuelve a calcular cuando cambia la cola.
 */
export function useWithPendingPoints(lid: string | undefined, list: readonly Match[]): Match[] {
  const snap = useOutboxSnapshot();
  return useMemo(() => {
    const ops = pendingOps(lid).filter((o) => o.fn === POINTS_FN);
    // `snap` cambia cuando la cola cambia (se encoló o salió algo): por eso está en las dependencias.
    return snap && ops.length ? (overlayPointsList(list as unknown as Wire<Match>[], ops) as unknown as Match[]) : (list as Match[]);
  }, [lid, list, snap]);
}

onOutbox({
  enqueue: (item) => {
    if (item.fn !== POINTS_FN) return;
    const ops = [item];
    const id = item.args.p_match;
    updateCached<Wire<Match>[]>('matches', (list, d) => (d.lid === item.group ? overlayPointsList(list, ops) : list));
    updateCached<Wire<Match>[]>('myMatches', (list) => overlayPointsList(list, ops));
    updateCached<Wire<Match> | null>('match', (m, d) => (m && d.id === id ? overlayPoints(m, ops) : m));
  },
  settled: (item) => {
    if (item.fn !== POINTS_FN) return;
    const id = typeof item.args.p_match === 'string' ? item.args.p_match : null;
    invalidate(matchTags.league(item.group), matchTags.mine, ...(id ? [matchTags.one(id)] : []));
  },
});
