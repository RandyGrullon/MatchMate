/**
 * Pistas del boliche (event_lanes, 20260929000600_organizador.sql): lo que no es pantalla. Leer lo que escribe el
 * admin («5-9», «3, 5, 7-8»), agrupar por pista, el texto para WhatsApp («Pista 7: Juan, Ana, Luis»), quiénes
 * entran (los que dijeron «voy» o están inscritos) y en qué orden por promedio. Funciones puras, con pruebas en
 * lanes.test.ts.
 */
import type { BowlingEvent, Entry, Player } from './types';

/** Pista más alta que acepta la base y cuántas pistas distintas por evento. */
export const MAX_LANE = 999;
export const MAX_LANES = 100;
/** Jugadores por pista que acepta la base (1–20); en el selector, hasta 8. */
export const MAX_PER_LANE = 20;
export const PER_LANE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type LaneMode = 'promedio' | 'equipo' | 'azar';

/** Una fila de event_lanes, como la usa la app. */
export interface LaneRow {
  eventId: string;
  playerId: string;
  lane: number;
  /** Orden en la pista (1 = tira primero). */
  position: number;
  /** Cuándo se avisó (null = cambió y no se ha avisado). */
  publishedAt: string | null;
}

export interface LaneGroup {
  lane: number;
  players: { playerId: string; name: string; position: number }[];
}

/**
 * «5-9» → [5, 6, 7, 8, 9]; «3, 5, 7-8» → [3, 5, 7, 8]; «9-7» → [9, 8, 7] (en el orden que se escribió). También
 * como se dice: «5 a 9», «5 al 9», «3, 5 y 7». Sin repetir. null si hay algo que no es una pista (1–999) o son más
 * de 100.
 */
export function parseLanes(text: string): number[] | null {
  const parts = text
    .replace(/[–—]/g, '-')
    .replace(/(\d)\s+al?\s+(?=\d)/gi, '$1-')
    .replace(/(\d)\s+y\s+(?=\d)/gi, '$1,')
    .replace(/\s*-\s*/g, '-')
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const out: number[] = [];
  const seen = new Set<number>();
  const add = (n: number) => {
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  };
  for (const part of parts) {
    const m = /^(\d{1,3})(?:-(\d{1,3}))?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (a < 1 || b < 1 || a > MAX_LANE || b > MAX_LANE) return null;
    if (Math.abs(b - a) >= MAX_LANES) return null;
    const step = a <= b ? 1 : -1;
    for (let n = a; n !== b + step; n += step) add(n);
    if (out.length > MAX_LANES) return null;
  }
  return out;
}

/** [5, 6, 7, 8, 9, 12] → «5-9, 12» (para recordar lo último que se usó). */
export function formatLanes(lanes: readonly number[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < lanes.length) {
    let j = i;
    while (j + 1 < lanes.length && lanes[j + 1] === lanes[j] + 1) j++;
    out.push(j > i ? `${lanes[i]}-${lanes[j]}` : String(lanes[i]));
    i = j + 1;
  }
  return out.join(', ');
}

/** Cuántas pistas hacen falta para `players` jugadores de a `perLane`. */
export const lanesNeeded = (players: number, perLane: number) => (players > 0 && perLane > 0 ? Math.ceil(players / perLane) : 0);

/** Las filas agrupadas por pista (de menor a mayor), cada pista en su orden y, empatados, por nombre. */
export function groupLanes(rows: readonly LaneRow[], nameOf: (playerId: string) => string): LaneGroup[] {
  const byLane = new Map<number, LaneGroup>();
  for (const r of rows) {
    const g = byLane.get(r.lane) ?? { lane: r.lane, players: [] };
    g.players.push({ playerId: r.playerId, name: nameOf(r.playerId), position: r.position });
    byLane.set(r.lane, g);
  }
  const groups = [...byLane.values()].sort((a, b) => a.lane - b.lane);
  for (const g of groups) g.players.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'es') || a.playerId.localeCompare(b.playerId));
  return groups;
}

/** Una línea por pista: «Pista 7: Juan, Ana, Luis». */
export const laneLine = (g: LaneGroup) => `Pista ${g.lane}: ${g.players.map((p) => p.name).join(', ')}`;

/** El texto para WhatsApp: el nombre del evento (si viene) y una línea por pista. */
export function lanesText(groups: readonly LaneGroup[], title?: string): string {
  const lines = groups.filter((g) => g.players.length).map(laneLine);
  if (!lines.length) return '';
  return title ? `${title}\n\n${lines.join('\n')}` : lines.join('\n');
}

/** La pista del jugador en el evento (null si no tiene). */
export const laneOf = (rows: readonly LaneRow[], playerId: string | null | undefined): LaneRow | null =>
  (playerId && rows.find((r) => r.playerId === playerId)) || null;

/** Los jugadores ya vieron las pistas: el admin las publicó alguna vez (después, cada cambio se ve de una vez). */
export const lanesPublished = (rows: readonly LaneRow[]) => rows.some((r) => r.publishedAt != null);

/** Cuántas pistas cambiaron y no se han avisado. */
export const unpublishedCount = (rows: readonly LaneRow[]) => rows.filter((r) => r.publishedAt == null).length;

/** Quiénes entran a las pistas (lo mismo que usa la base): los inscritos y los que dijeron «voy», sin repetir. */
export function laneCandidates(event: Pick<BowlingEvent, 'rsvp'>, entries: readonly Pick<Entry, 'playerId'>[]): string[] {
  const out = new Set<string>(entries.map((e) => e.playerId));
  for (const [id, going] of Object.entries(event.rsvp ?? {})) if (going) out.add(id);
  return [...out];
}

/** Los jugadores de mayor a menor promedio (sin promedio al final; empatados, por nombre): `p_order` de assign_lanes. */
export function orderByAverage(ids: readonly string[], averages: ReadonlyMap<string, number>, players: readonly Pick<Player, 'id' | 'name'>[]): string[] {
  const name = new Map(players.map((p) => [p.id, p.name]));
  return [...ids].sort(
    (a, b) =>
      (averages.get(b) ?? -1) - (averages.get(a) ?? -1) ||
      (name.get(a) ?? '').localeCompare(name.get(b) ?? '', 'es') ||
      a.localeCompare(b),
  );
}

/** El evento tiene equipos armados (para ofrecer «Por equipo»). */
export const hasTeams = (entries: readonly Pick<Entry, 'teamId'>[]) => entries.some((e) => e.teamId != null);

/** Qué pistas se pueden elegir al mover a alguien: las del generador y las que ya tienen gente, sin repetir, en orden. */
export function laneChoices(typed: readonly number[] | null, rows: readonly LaneRow[]): number[] {
  return [...new Set([...(typed ?? []), ...rows.map((r) => r.lane)])].sort((a, b) => a - b);
}
