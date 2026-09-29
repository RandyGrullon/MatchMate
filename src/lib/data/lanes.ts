import type { LaneMode, LaneRow } from '../lanes';
import { invalidate, rpc, select, useLive, type Live } from './client';
import { tags } from './keys';

/**
 * Pistas del boliche (20260929000600_organizador.sql). Lectura: la tabla `event_lanes` (la lee quien ve la liga).
 * Escrituras (admin o anotador): assign_lanes, set_player_lane, clear_lanes y publish_lanes (un push por jugador con
 * cuenta: «Tu pista: 7 · <evento>»). Tiempo real: 'lanes' en `event:<id>` (src/lib/data/topics.ts).
 *
 * Por promedio: el promedio lo calcula el teléfono (average_override o los juegos verificados, como en el resto
 * de la app) y va como `p_order`, de mayor a menor.
 */

export const laneTags = {
  event: (eventId: string) => `lanes:${eventId}`,
};

export const laneKeys = {
  event: (eventId: string) => `lanes:e:${eventId}`,
};

interface LaneDbRow {
  event_id: string;
  player_id: string;
  lane: number;
  position: number;
  published_at: string | null;
}

const toLaneRow = (r: LaneDbRow): LaneRow => ({
  eventId: r.event_id,
  playerId: r.player_id,
  lane: Number(r.lane),
  position: Number(r.position),
  publishedAt: r.published_at ?? null,
});

export async function fetchEventLanes(eventId: string): Promise<LaneRow[]> {
  const rows = await select<LaneDbRow>({
    table: 'event_lanes',
    columns: 'event_id,player_id,lane,position,published_at',
    filters: [{ col: 'event_id', op: 'eq', value: eventId }],
    order: [
      { col: 'lane', asc: true },
      { col: 'position', asc: true },
    ],
    limit: 2000,
  });
  return rows.map(toLaneRow);
}

/** Las pistas del evento (vacío mientras carga o si no hay). */
export function useEventLanes(lid: string | null | undefined, eventId: string | null | undefined): Live<LaneRow[]> {
  const on = !!(lid && eventId);
  return useLive<LaneRow[]>(
    on ? laneKeys.event(eventId as string) : null,
    on ? { kind: 'lanes', lid: lid as string, eventId: eventId as string } : null,
    () => fetchEventLanes(eventId as string),
    { initial: [], tags: on ? [laneTags.event(eventId as string), tags.league(lid as string)] : [], staleMs: 60_000 },
  );
}

/** Lo que devuelven assign_lanes y set_player_lane (la base ya agrupa; la pantalla vuelve a leer la tabla). */
export interface LanesResult {
  eventId: string;
  count: number;
  unpublished: number;
  publishedAt: string | null;
  lanes: { lane: number; players: { playerId: string; name: string; position: number; userId: string | null }[] }[];
  text: string;
}

const after = (eventId: string) => invalidate(laneTags.event(eventId));

/**
 * Arma las pistas (reemplaza las que había) con los que dijeron «voy» o están inscritos. `order`: los jugadores de
 * mayor a menor promedio ('promedio'; en 'equipo', el orden dentro de cada equipo). 'invalido' si no caben.
 */
export async function assignLanes(
  eventId: string,
  opts: { lanes: readonly number[]; perLane: number; mode: LaneMode; order?: readonly string[] | null },
): Promise<LanesResult> {
  const r = await rpc<LanesResult>('assign_lanes', {
    p_event: eventId,
    p_lanes: [...opts.lanes],
    p_per_lane: opts.perLane,
    p_mode: opts.mode,
    p_order: opts.mode === 'azar' || !opts.order?.length ? null : [...opts.order],
  });
  after(eventId);
  return r;
}

/** Pone al jugador al final de otra pista; con `lane` null lo quita. Queda sin avisar. */
export async function setPlayerLane(eventId: string, playerId: string, lane: number | null): Promise<LanesResult> {
  const r = await rpc<LanesResult>('set_player_lane', { p_event: eventId, p_player: playerId, p_lane: lane });
  after(eventId);
  return r;
}

/** Borra las pistas del evento. Devuelve cuántas había. */
export async function clearLanes(eventId: string): Promise<number> {
  const n = await rpc<number>('clear_lanes', { p_event: eventId });
  after(eventId);
  return Number(n) || 0;
}

/** Avisa a cada jugador con cuenta su pista. `pushed` = cuentas avisadas. 'rate_limited' si ya se avisó 6 veces esta hora. */
export async function publishLanes(eventId: string): Promise<{ players: number; pushed: number }> {
  const r = await rpc<{ players: number; pushed: number }>('publish_lanes', { p_event: eventId });
  after(eventId);
  return { players: Number(r?.players) || 0, pushed: Number(r?.pushed) || 0 };
}
