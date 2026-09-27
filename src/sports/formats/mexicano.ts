/**
 * Mexicano: la ronda 1 va al azar (o por nivel) y las siguientes se arman con la tabla del momento:
 * cancha 1 = 1.º+4.º contra 2.º+3.º, cancha 2 = 5.º+8.º contra 6.º+7.º, y así. Si no son múltiplo de 4,
 * descansan los que menos han descansado (a igualdad, el que descansó hace más tiempo y luego el de más abajo).
 */

import { seededRandom, shuffle, type Seed } from './random';
import { socialStandings, type DoublesMatch, type RestPolicy, type ScoredRound, type SocialRound } from './social';
import { matchesPerRound } from './americano';

export interface MexicanoOptions {
  courts: number;
  /** Ronda 1 al azar (por defecto) o por nivel (Playtomic 0–7, A/B/C pasado a número: mayor = mejor). */
  firstRound?: 'random' | 'level';
  levels?: Readonly<Record<string, number>>;
  /** Semilla del sorteo de la ronda 1 y de los descansos empatados. */
  seed?: Seed;
  /** Qué recibe quien descansa en la tabla (ver `socialStandings`). */
  rest?: RestPolicy;
}

/** Rondas ya jugadas (con marcador) para calcular la tabla y los descansos. */
export type MexicanoHistory = readonly (ScoredRound & { round?: number })[];

/** Siguiente ronda del mexicano. Con `previous` vacío arma la ronda 1. */
export function mexicanoRound(players: readonly string[], previous: MexicanoHistory, opts: MexicanoOptions): SocialRound {
  const n = players.length;
  if (n < 4) throw new Error('El mexicano necesita al menos 4 jugadores.');
  if (new Set(players).size !== n) throw new Error('Hay jugadores repetidos.');
  if (!Number.isInteger(opts.courts) || opts.courts < 1) throw new Error('Hace falta al menos una cancha.');
  const m = matchesPerRound(n, opts.courts);
  const k = n - 4 * m;
  const rand = seededRandom(opts.seed ?? `mexicano:${players.join(',')}`);
  const lot = new Map(shuffle(players, rand).map((p, i) => [p, i]));

  const rests = new Map(players.map((p) => [p, 0]));
  const lastRest = new Map(players.map((p) => [p, -1]));
  previous.forEach((r, i) => {
    for (const p of r.rests) {
      if (!rests.has(p)) continue;
      rests.set(p, rests.get(p)! + 1);
      lastRest.set(p, i);
    }
  });

  let order: string[];
  if (!previous.length) {
    if (opts.firstRound === 'level') {
      const lv = opts.levels ?? {};
      order = players.slice().sort((a, b) => (lv[b] ?? 0) - (lv[a] ?? 0) || lot.get(a)! - lot.get(b)!);
    } else order = players.slice().sort((a, b) => lot.get(a)! - lot.get(b)!);
  } else {
    const table = socialStandings(players, previous, { rest: opts.rest });
    order = table.map((r) => r.id);
  }
  const pos = new Map(order.map((p, i) => [p, i]));

  // Descansan los que menos han descansado; a igualdad, el que descansó hace más tiempo, luego el de más abajo
  // en la tabla (en la ronda 1, el sorteo).
  const resting = new Set(
    players
      .slice()
      .sort(
        (a, b) =>
          rests.get(a)! - rests.get(b)! ||
          lastRest.get(a)! - lastRest.get(b)! ||
          (previous.length ? pos.get(b)! - pos.get(a)! : lot.get(a)! - lot.get(b)!),
      )
      .slice(0, k),
  );
  const playing = order.filter((p) => !resting.has(p));
  const matches: DoublesMatch[] = [];
  for (let c = 0; c < m; c++) {
    const [p1, p2, p3, p4] = playing.slice(c * 4, c * 4 + 4);
    matches.push({ court: c + 1, side1: [p1, p4], side2: [p2, p3] });
  }
  return { round: previous.length + 1, matches, rests: order.filter((p) => resting.has(p)) };
}
