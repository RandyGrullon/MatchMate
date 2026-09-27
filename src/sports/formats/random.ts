/**
 * Azar con semilla para los formatos: la misma semilla da siempre el mismo resultado (pruebas, repetir un
 * sorteo, que dos teléfonos armen la misma ronda). Nunca se usa Math.random.
 */

export type Seed = number | string;

/** Hash FNV-1a de 32 bits: el mismo texto da siempre el mismo número. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Generador pseudoaleatorio (mulberry32) en [0, 1): misma semilla, misma secuencia. */
export function seededRandom(seed: Seed): () => number {
  let a = typeof seed === 'number' ? Math.floor(seed) >>> 0 : hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Copia barajada (Fisher-Yates) con el generador dado. */
export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Número de sorteo de un id: menor sale primero. Con otra semilla (p. ej. el id de la liga) cambia el orden. */
export function lotValue(id: string, seed = ''): number {
  return hashString(`${seed}:${id}`);
}
