/**
 * Siembra de los inscritos y balance de agentes libres (docs/esports.md §3.5). Determinista: el azar sale de una
 * semilla (el id del evento), nunca de Math.random.
 */
import { lotValue, seededRandom, shuffle } from '../formats/random';

export type SeedingMethod = 'manual' | 'random' | 'rank';

/** Un inscrito con el ordinal del rango de cada miembro titular (`rankOrdinal`; null = sin rango). */
export interface SeedEntry {
  id: string;
  ordinals: readonly (number | null)[];
}

/** Promedio de los `teamSize` mejores con rango; null si nadie tiene. */
export function entryStrength(ordinals: readonly (number | null)[], teamSize: number): number | null {
  const ranked = ordinals.filter((o): o is number => typeof o === 'number' && Number.isFinite(o)).sort((a, b) => b - a);
  const best = ranked.slice(0, Math.max(1, Math.trunc(teamSize) || 1));
  if (!best.length) return null;
  return best.reduce((a, b) => a + b, 0) / best.length;
}

/**
 * Orden de siembra (ids, el mejor primero):
 * - `manual`: el orden de `manual` (los que no están en `entries` se ignoran; los que falten, al final en su orden);
 * - `random`: barajado con `seededRandom(seed)`;
 * - `rank`: por `entryStrength` de mayor a menor, sin rango al final, empates por `lotValue(id, seed)`.
 */
export function seedEntries(entries: readonly SeedEntry[], method: SeedingMethod, o: { seed: string; teamSize: number; manual?: readonly string[] }): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    ids.push(e.id);
  }
  if (method === 'manual') {
    const out: string[] = [];
    const used = new Set<string>();
    for (const id of o.manual ?? []) {
      if (seen.has(id) && !used.has(id)) {
        used.add(id);
        out.push(id);
      }
    }
    for (const id of ids) if (!used.has(id)) out.push(id);
    return out;
  }
  if (method === 'random') return shuffle(ids, seededRandom(o.seed));
  const strength = new Map<string, number | null>();
  for (const e of entries) if (!strength.has(e.id)) strength.set(e.id, entryStrength(e.ordinals, o.teamSize));
  return ids.slice().sort((a, b) => {
    const sa = strength.get(a) ?? null;
    const sb = strength.get(b) ?? null;
    if (sa !== null && sb !== null && sa !== sb) return sb - sa;
    if ((sa === null) !== (sb === null)) return sa === null ? 1 : -1;
    return lotValue(a, o.seed) - lotValue(b, o.seed) || (a < b ? -1 : a > b ? 1 : 0);
  });
}

export interface FreeAgent {
  userId: string;
  ordinal: number | null;
}

/** strength = suma de los ordinales de sus titulares (null si ninguno tiene rango). */
export interface BalancedTeam {
  members: { userId: string; role: 'captain' | 'member' | 'sub' }[];
  strength: number | null;
}

/**
 * Arma equipos parejos con agentes libres: se ordenan por ordinal (sin rango al final; empates por
 * `lotValue(userId, seed)`); se hacen `floor(n / teamSize)` equipos y los primeros se reparten en serpiente (ronda
 * par de izquierda a derecha, impar al revés). El capitán de cada equipo es su primer elegido. Los que sobran entran
 * como suplentes al equipo de menor fuerza que tenga lugar (`subs` por equipo; a igual fuerza, el de menos
 * suplentes y después el primero) y el resto queda en `leftover`.
 */
export function balanceTeams(agents: readonly FreeAgent[], o: { teamSize: number; subs: number; seed: string }): { teams: BalancedTeam[]; leftover: string[] } {
  const seen = new Set<string>();
  const list = agents.filter((a) => (seen.has(a.userId) ? false : (seen.add(a.userId), true)));
  const ord = (a: FreeAgent) => (typeof a.ordinal === 'number' && Number.isFinite(a.ordinal) ? a.ordinal : null);
  const sorted = list.slice().sort((a, b) => {
    const oa = ord(a);
    const ob = ord(b);
    if (oa !== null && ob !== null && oa !== ob) return ob - oa;
    if ((oa === null) !== (ob === null)) return oa === null ? 1 : -1;
    return lotValue(a.userId, o.seed) - lotValue(b.userId, o.seed) || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);
  });
  const size = Math.max(1, Math.trunc(o.teamSize) || 1);
  const T = Math.floor(sorted.length / size);
  if (T === 0) return { teams: [], leftover: sorted.map((a) => a.userId) };

  const picks: FreeAgent[][] = Array.from({ length: T }, () => []);
  sorted.slice(0, T * size).forEach((a, i) => {
    const round = Math.floor(i / T);
    const pos = i % T;
    picks[round % 2 === 0 ? pos : T - 1 - pos].push(a);
  });
  const teams: BalancedTeam[] = picks.map((p) => {
    const ords = p.map(ord).filter((x): x is number => x !== null);
    return {
      members: p.map((a, k) => ({ userId: a.userId, role: k === 0 ? ('captain' as const) : ('member' as const) })),
      strength: ords.length ? ords.reduce((x, y) => x + y, 0) : null,
    };
  });

  const subsCap = Math.max(0, Math.trunc(o.subs) || 0);
  const subsOf = teams.map(() => 0);
  const leftover: string[] = [];
  for (const a of sorted.slice(T * size)) {
    let best = -1;
    for (let t = 0; t < T; t++) {
      if (subsOf[t] >= subsCap) continue;
      if (best < 0 || weaker(teams[t], subsOf[t], teams[best], subsOf[best])) best = t;
    }
    if (best < 0) leftover.push(a.userId);
    else {
      teams[best].members.push({ userId: a.userId, role: 'sub' });
      subsOf[best]++;
    }
  }
  return { teams, leftover };
}

/** ¿El equipo x es más débil que y? Sin rango cuenta como el más débil; a igual fuerza, el de menos suplentes. */
function weaker(x: BalancedTeam, xSubs: number, y: BalancedTeam, ySubs: number): boolean {
  const sx = x.strength ?? -Infinity;
  const sy = y.strength ?? -Infinity;
  if (sx !== sy) return sx < sy;
  return xSubs < ySubs;
}
