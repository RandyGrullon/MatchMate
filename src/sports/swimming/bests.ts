/**
 * Natación: marcas personales. La marca es el mejor tiempo por estilo + distancia + piscina:
 * las de 25 m y 50 m van SEPARADAS (no se convierten). Solo cuentan los tiempos con estado «ok».
 */

import { bestKey, SWIM_STROKES, type PoolLength, type SwimStroke } from './events';
import type { SwimStatus } from './results';

/** Un tiempo nadado por el nadador (de cualquier encuentro o del «Control de marcas»). */
export interface SwimSwim {
  distance: number;
  stroke: SwimStroke;
  pool: PoolLength;
  time: number | null;
  status: SwimStatus;
  /** 'AAAA-MM-DD'. */
  date: string;
  eventId?: string;
}

export interface BestStep {
  date: string;
  time: number;
  /** % que mejoró frente a la marca anterior (null en el primer tiempo). */
  pct: number | null;
  eventId?: string;
}

export interface PersonalBest {
  key: string;
  distance: number;
  stroke: SwimStroke;
  pool: PoolLength;
  best: number;
  date: string;
  /** Tiempos válidos nadados en esta prueba. */
  swims: number;
  first: number;
  last: number;
  /** % de mejora del primer tiempo a la marca. */
  improvementPct: number;
  /** Cada vez que bajó su marca, en orden de fecha. */
  progression: BestStep[];
}

/** % de mejora de un tiempo a otro (positivo = bajó), con 2 decimales. */
export function improvementPct(from: number, to: number): number {
  return Math.round(((from - to) / from) * 10000) / 100;
}

const valid = (s: SwimSwim) => s.status === 'ok' && s.time != null && s.time > 0;

/** Marcas personales de un nadador, ordenadas por estilo, piscina y distancia. */
export function personalBests(swims: readonly SwimSwim[]): PersonalBest[] {
  const groups = new Map<string, SwimSwim[]>();
  swims
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => valid(s))
    .sort((a, b) => a.s.date.localeCompare(b.s.date) || a.i - b.i)
    .forEach(({ s }) => {
      const k = bestKey(s);
      groups.set(k, [...(groups.get(k) ?? []), s]);
    });
  const out: PersonalBest[] = [];
  groups.forEach((list, key) => {
    const progression: BestStep[] = [];
    let best: SwimSwim | null = null;
    list.forEach((s) => {
      if (best && s.time! >= best.time!) return;
      progression.push({ date: s.date, time: s.time!, pct: best ? improvementPct(best.time!, s.time!) : null, eventId: s.eventId });
      best = s;
    });
    const b = best!;
    out.push({
      key,
      distance: b.distance,
      stroke: b.stroke,
      pool: b.pool,
      best: b.time!,
      date: b.date,
      swims: list.length,
      first: list[0].time!,
      last: list[list.length - 1].time!,
      improvementPct: improvementPct(list[0].time!, b.time!),
      progression,
    });
  });
  const strokeOrder = (s: SwimStroke) => SWIM_STROKES.indexOf(s);
  return out.sort((a, b) => strokeOrder(a.stroke) - strokeOrder(b.stroke) || a.pool - b.pool || a.distance - b.distance);
}

/**
 * ¿Este tiempo es marca personal frente a lo que ya tenía? (el primer tiempo válido en una prueba también lo es).
 * Para marcar «¡Marca personal!» en los resultados.
 */
export function isPersonalBest(history: readonly SwimSwim[], swim: SwimSwim): boolean {
  if (!valid(swim)) return false;
  const key = bestKey(swim);
  return history.filter((h) => valid(h) && bestKey(h) === key && h !== swim).every((h) => h.time! > swim.time!);
}
