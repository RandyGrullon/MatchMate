/**
 * Natación: puestos, puntos por club y medallero en finales por tiempo.
 *
 * - El puesto se calcula por tiempo DENTRO de cada sexo y categoría (las series mezclan categorías).
 * - Empate (mismas centésimas): comparten el puesto (1, 2, 2, 4) y se suman los puntos de los puestos
 *   empatados y se reparten entre ellos.
 * - DQ, DNS y DNF no tienen puesto ni puntos.
 * - Puntos por puesto configurables: 6-4-3-2-1, o 9-7-6-5-4-3-2-1 con 8 carriles. Sin relevos en la v1.
 */

import type { SwimGender } from './events';

export type SwimStatus = 'ok' | 'dq' | 'dns' | 'dnf';

export const STATUS_LABEL: Record<SwimStatus, string> = { ok: '', dq: 'DQ', dns: 'No salió', dnf: 'No terminó' };

export const POINTS_6_LANES = [6, 4, 3, 2, 1];
export const POINTS_8_LANES = [9, 7, 6, 5, 4, 3, 2, 1];

/** Tabla por defecto según los carriles de la piscina. */
export function defaultPoints(lanes: number): number[] {
  return lanes >= 8 ? POINTS_8_LANES : POINTS_6_LANES;
}

export interface SwimResult {
  entryId: string;
  swimmerId?: string;
  /** Club o equipo. */
  teamId?: string | null;
  gender?: SwimGender | null;
  /** Categoría del nadador (id de `AgeGroup`), calculada a la fecha de referencia. */
  ageGroup?: string | null;
  /** Centésimas; null = sin tiempo. */
  time: number | null;
  status: SwimStatus;
}

export interface PlacedFields {
  /** null = DQ, DNS, DNF o sin tiempo. */
  place: number | null;
  points: number;
  /** Comparte el puesto con otro. */
  tied: boolean;
}

export type Placed<T extends SwimResult = SwimResult> = T & PlacedFields;

/** Puntos de un puesto compartido por `tied` nadadores: la suma de los puestos empatados repartida. */
export function splitPoints(place: number, tied: number, table: readonly number[]): number {
  let total = 0;
  for (let k = 0; k < tied; k++) total += table[place - 1 + k] ?? 0;
  return total / tied;
}

const counts = (r: SwimResult) => r.status === 'ok' && r.time != null && r.time > 0;

/**
 * Puestos y puntos de una prueba. Devuelve las filas agrupadas por sexo y categoría (en el orden en que
 * aparece cada grupo), y dentro de cada grupo por puesto; al final del grupo los que no cuentan.
 */
export function placeResults<T extends SwimResult>(results: readonly T[], table: readonly number[] = POINTS_6_LANES): Placed<T>[] {
  const groups = new Map<string, T[]>();
  results.forEach((r) => {
    const key = `${r.gender ?? ''}|${r.ageGroup ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  });
  const out: Placed<T>[] = [];
  groups.forEach((rows) => {
    const ok = rows.filter(counts).sort((a, b) => a.time! - b.time!);
    const rest = rows.filter((r) => !counts(r));
    let i = 0;
    while (i < ok.length) {
      let j = i + 1;
      while (j < ok.length && ok[j].time === ok[i].time) j++;
      const n = j - i;
      const points = splitPoints(i + 1, n, table);
      for (let k = i; k < j; k++) out.push({ ...ok[k], place: i + 1, points, tied: n > 1 });
      i = j;
    }
    rest.forEach((r) => out.push({ ...r, place: null, points: 0, tied: false }));
  });
  return out;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export interface TeamScore {
  teamId: string;
  points: number;
  gold: number;
  silver: number;
  bronze: number;
  /** Empates en puntos comparten puesto. */
  rank: number;
}

/** Puntos por club sumando todas las pruebas ya con puesto (`placeResults` de cada una). */
export function teamPoints(rows: readonly Placed[]): TeamScore[] {
  const acc = new Map<string, TeamScore>();
  rows.forEach((r) => {
    if (!r.teamId) return;
    const t = acc.get(r.teamId) ?? { teamId: r.teamId, points: 0, gold: 0, silver: 0, bronze: 0, rank: 0 };
    t.points += r.points;
    if (r.place === 1) t.gold++;
    else if (r.place === 2) t.silver++;
    else if (r.place === 3) t.bronze++;
    acc.set(r.teamId, t);
  });
  const list = [...acc.values()].map((t) => ({ ...t, points: round2(t.points) }));
  list.sort((a, b) => b.points - a.points);
  list.forEach((t, k) => (t.rank = k > 0 && t.points === list[k - 1].points ? list[k - 1].rank : k + 1));
  return list;
}

export interface MedalRow {
  id: string;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
  rank: number;
}

/**
 * Medallero (oro, luego plata, luego bronce). Por club por defecto; `keyOf` permite hacerlo por nadador.
 * Con empate en el 1.º los dos llevan oro y no hay plata (el siguiente es 3.º → bronce).
 */
export function medalTable<T extends Placed>(rows: readonly T[], keyOf: (r: T) => string | null | undefined = (r) => r.teamId): MedalRow[] {
  const acc = new Map<string, MedalRow>();
  rows.forEach((r) => {
    const id = keyOf(r);
    if (!id || r.place == null || r.place > 3) return;
    const m = acc.get(id) ?? { id, gold: 0, silver: 0, bronze: 0, total: 0, rank: 0 };
    if (r.place === 1) m.gold++;
    else if (r.place === 2) m.silver++;
    else m.bronze++;
    m.total++;
    acc.set(id, m);
  });
  const list = [...acc.values()].sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze);
  list.forEach((m, k) => {
    const p = list[k - 1];
    m.rank = p && p.gold === m.gold && p.silver === m.silver && p.bronze === m.bronze ? p.rank : k + 1;
  });
  return list;
}
