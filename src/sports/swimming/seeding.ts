/**
 * Natación: reparto en series y carriles para finales por tiempo.
 *
 * - Se ordena por tiempo de siembra (el menor primero); los «sin tiempo» (NT) al final, así caen en las primeras series.
 * - La serie más rápida va AL FINAL: la última serie lleva a los mejores, la penúltima a los siguientes…
 * - Mínimo 3 nadadores en la primera serie: si queda con menos, se le pasan los más lentos de la segunda.
 * - Dentro de cada serie, los mejores tiempos en los carriles del centro
 *   (4, 5, 3, 6, 2, 7, 1, 8 con 8 carriles; 3, 4, 2, 5, 1, 6 con 6).
 * - Empates de siembra: queda el orden de inscripción (el organizador puede moverlos a mano).
 * - Las series mezclan categorías: el puesto se calcula después por categoría (ver `results.ts`).
 */

export interface SeedEntry {
  id: string;
  /** Tiempo de siembra en centésimas; null = sin tiempo (NT). */
  seed: number | null;
}

export interface HeatLane {
  lane: number;
  entryId: string;
  seed: number | null;
}

export interface Heat {
  /** Número de serie, desde 1 (la 1 es la más lenta). */
  n: number;
  /** Ordenados por número de carril. */
  lanes: HeatLane[];
}

export interface SeedOptions {
  /** Carriles de la piscina (por defecto 8). */
  lanes?: number;
  /** Orden en que se llenan los carriles (el primero para el mejor tiempo). Por defecto del centro hacia afuera. */
  laneOrder?: number[];
  /** Mínimo de nadadores en la primera serie (por defecto 3). */
  minFirstHeat?: number;
}

/**
 * Carriles del centro hacia afuera. Par: 4, 5, 3, 6, 2, 7, 1, 8 (8) y 3, 4, 2, 5, 1, 6 (6).
 * Impar: el del centro y luego alternando: 5 → 3, 2, 4, 1, 5.
 */
export function centerOutLanes(n: number): number[] {
  const out: number[] = [];
  if (n <= 0) return out;
  if (n % 2 === 0) {
    const lo = n / 2;
    for (let k = 0; k < n / 2; k++) out.push(lo - k, lo + 1 + k);
  } else {
    const c = (n + 1) / 2;
    out.push(c);
    for (let k = 1; k <= (n - 1) / 2; k++) out.push(c - k, c + k);
  }
  return out;
}

const bySeed = (a: SeedEntry, b: SeedEntry) => (a.seed ?? Infinity) - (b.seed ?? Infinity);

/** Tamaño de cada serie, de la 1 (más lenta) a la última. */
export function heatSizes(entries: number, lanes: number, minFirstHeat = 3): number[] {
  if (entries <= 0 || lanes <= 0) return [];
  const heats = Math.ceil(entries / lanes);
  const sizes = Array<number>(heats).fill(lanes);
  sizes[0] = entries - lanes * (heats - 1);
  const min = Math.min(minFirstHeat, lanes);
  if (heats > 1 && sizes[0] < min) {
    const move = min - sizes[0];
    sizes[0] += move;
    sizes[1] -= move;
  }
  return sizes;
}

/** Arma las series y los carriles. */
export function seedHeats(entries: readonly SeedEntry[], opts: SeedOptions = {}): Heat[] {
  const order = opts.laneOrder ?? centerOutLanes(opts.lanes ?? 8);
  const sorted = entries.map((e, i) => ({ e, i })).sort((a, b) => bySeed(a.e, b.e) || a.i - b.i);
  const sizes = heatSizes(sorted.length, order.length, opts.minFirstHeat ?? 3);
  // Los más rápidos llenan la última serie; se va hacia atrás.
  const heats: Heat[] = [];
  let taken = 0;
  for (let h = sizes.length - 1; h >= 0; h--) {
    const group = sorted.slice(taken, taken + sizes[h]);
    taken += sizes[h];
    const lanes = group.map(({ e }, k) => ({ lane: order[k], entryId: e.id, seed: e.seed })).sort((a, b) => a.lane - b.lane);
    heats[h] = { n: h + 1, lanes };
  }
  return heats;
}
