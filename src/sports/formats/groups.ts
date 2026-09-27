/**
 * Fase de grupos: reparto en zigzag por nivel y cruces hacia el cuadro (1A contra 2B, 1B contra 2A…).
 */

import { nextPowerOfTwo, seedOrder } from './knockout';
import { lotValue } from './random';

/** A, B, C… (después de Z: AA, AB…). */
export function groupLetter(index: number): string {
  let s = '';
  let i = index;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

/** Ordena por nivel (mayor = mejor). Los empates se sortean con la semilla, siempre igual. */
export function sortByLevel(ids: readonly string[], levels: Readonly<Record<string, number>>, seed = ''): string[] {
  return ids.slice().sort((a, b) => (levels[b] ?? 0) - (levels[a] ?? 0) || lotValue(a, seed) - lotValue(b, seed) || (a < b ? -1 : 1));
}

/**
 * Reparte en zigzag: con 3 grupos, 1→A 2→B 3→C 4→C 5→B 6→A 7→A… Recibe los ids ya ordenados por nivel
 * (mejor primero). Si no dividen exacto, los primeros grupos quedan con uno más.
 */
export function snakeGroups(seeded: readonly string[], groups: number): string[][] {
  if (!Number.isInteger(groups) || groups < 1) throw new Error('El número de grupos no es válido.');
  const out: string[][] = Array.from({ length: groups }, () => []);
  seeded.forEach((id, i) => {
    const row = Math.floor(i / groups);
    const pos = i % groups;
    out[row % 2 === 0 ? pos : groups - 1 - pos].push(id);
  });
  return out;
}

export interface Qualifier {
  id: string;
  /** Índice del grupo (0 = A). */
  group: number;
  /** Puesto en su grupo (1 = primero). */
  place: number;
  /** Etiqueta corta: "1A", "2B". */
  label: string;
}

/**
 * Clasificados de cada grupo, en el orden de siembra del cuadro. `ranked[g]` es la tabla del grupo g ya
 * ordenada (ids). Pasan los `perGroup` primeros.
 *
 * Siembra: primero todos los 1.º (A, B, C…), luego los 2.º, etc. Dentro de cada puesto se elige el orden que
 * aleja lo más posible a los del mismo grupo (nunca en la primera ronda si se puede; en mitades opuestas) y,
 * a igualdad, el cruce clásico 1A–2B, 1B–2A, 1C–2D, 1D–2C (con grupos impares: 1A–2B, 1B–2C, 1C–2A).
 * Con más de 8 grupos no se busca: queda el orden de los grupos. Luego se pasa `qualifiers.map(q => q.id)` a
 * `createBracket`.
 */
export function crossGroups(ranked: readonly (readonly string[])[], perGroup: number): Qualifier[] {
  const G = ranked.length;
  if (G < 1 || perGroup < 1) throw new Error('Faltan grupos o clasificados.');
  const tiers: Qualifier[][] = [];
  for (let place = 1; place <= perGroup; place++) {
    const tier: Qualifier[] = [];
    ranked.forEach((table, g) => {
      const id = table[place - 1];
      if (id != null) tier.push({ id, group: g, place, label: `${place}${groupLetter(g)}` });
    });
    tiers.push(tier);
  }
  const total = tiers.reduce((a, t) => a + t.length, 0);
  if (total < 2) throw new Error('Hacen falta al menos 2 clasificados.');
  const size = nextPowerOfTwo(total);
  const rounds = Math.log2(size);
  // Posición en el cuadro (hoja) de cada número de siembra.
  const leaf = new Map(seedOrder(size).map((s, i) => [s, i]));
  // Ronda en que se pueden cruzar dos hojas (1 = primera ronda).
  const meet = (a: number, b: number) => Math.floor(Math.log2(a ^ b)) + 1;
  const partner = (g: number) => (G % 2 === 0 ? g ^ 1 : (g + 1) % G);

  const seeds: Qualifier[] = [];
  for (const tier of tiers) {
    const base = seeds.length;
    const perms = tier.length <= 8 ? permutations(tier.length) : [tier.map((_, i) => i)];
    let best: Qualifier[] = tier;
    let bestCost: [number, number] = [Infinity, Infinity];
    for (const perm of perms) {
      const cand = perm.map((i) => tier[i]);
      const all = [...seeds, ...cand];
      let cost = 0;
      let pref = 0;
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          if (all[i].group !== all[j].group) continue;
          const r = meet(leaf.get(i + 1)!, leaf.get(j + 1)!);
          cost += (total * total + 1) ** (rounds - r);
        }
      }
      // Preferencia del cruce clásico: el rival de primera ronda de cada 1.º es el 2.º de su grupo pareja.
      cand.forEach((q, k) => {
        const s = base + k + 1;
        const opp = size + 1 - s;
        const rival = all[opp - 1];
        if (rival && rival.place === 1 && q.place === 2 && partner(rival.group) !== q.group) pref++;
      });
      if (cost < bestCost[0] || (cost === bestCost[0] && pref < bestCost[1])) {
        best = cand;
        bestCost = [cost, pref];
      }
    }
    seeds.push(...best);
  }
  return seeds;
}

function permutations(n: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const used = new Array<boolean>(n).fill(false);
  const go = () => {
    if (cur.length === n) {
      out.push(cur.slice());
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true;
      cur.push(i);
      go();
      cur.pop();
      used[i] = false;
    }
  };
  go();
  return out;
}
