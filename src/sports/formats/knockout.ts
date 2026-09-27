/**
 * Cuadro de eliminación simple.
 *
 * - Se completa a la siguiente potencia de 2; los pases directos (byes) les tocan a los mejores sembrados,
 *   con el orden estándar de siembra (1 contra el último, 1 y 2 solo se pueden ver en la final).
 * - Partido por el 3.er lugar opcional (los perdedores de semifinales).
 * - El cuadro se recalcula siempre desde la siembra + los ganadores anotados: si se corrige un ganador, lo que
 *   dependía de él se borra solo.
 */

import type { Side } from '../types';

export interface BracketMatch {
  /** 'R1-1' (ronda 1, partido 1), …; 'P3' = 3.er lugar. */
  key: string;
  /** 1 = primera ronda; la final (y el 3.er lugar) es la última. */
  round: number;
  /** Posición dentro de la ronda, desde 0. */
  index: number;
  side1: string | null;
  side2: string | null;
  seed1: number | null;
  seed2: number | null;
  /** Pase directo: a uno de los lados no le toca rival y avanza solo. */
  bye: boolean;
  winner: string | null;
  /** A dónde va el ganador (null en la final y en el 3.er lugar). */
  next: { key: string; side: Side } | null;
  /** A dónde va el perdedor (semifinales con 3.er lugar). */
  loserNext: { key: string; side: Side } | null;
  thirdPlace: boolean;
}

export interface Bracket {
  /** Participantes por orden de siembra (1.º = mejor). */
  seeds: string[];
  /** Tamaño del cuadro (potencia de 2). */
  size: number;
  rounds: number;
  thirdPlace: boolean;
  /** Ganadores anotados por partido (sin los byes, que son automáticos). */
  winners: Record<string, string>;
  matches: BracketMatch[];
}

/** Orden estándar de siembra en el cuadro: 8 → [1, 8, 4, 5, 2, 7, 3, 6]. */
export function seedOrder(size: number): number[] {
  if (size < 1 || (size & (size - 1)) !== 0) throw new Error('El tamaño del cuadro debe ser potencia de 2.');
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Nombre de la ronda: Final, Semifinal, Cuartos de final, Octavos de final, Ronda de 32… */
export function roundName(round: number, rounds: number): string {
  const left = rounds - round;
  if (left === 0) return 'Final';
  if (left === 1) return 'Semifinal';
  if (left === 2) return 'Cuartos de final';
  if (left === 3) return 'Octavos de final';
  return `Ronda de ${2 ** (left + 1)}`;
}

/** Crea el cuadro con los participantes ya ordenados por siembra (mejor primero). */
export function createBracket(seeds: readonly string[], opts: { thirdPlace?: boolean } = {}): Bracket {
  if (seeds.length < 2) throw new Error('El cuadro necesita al menos 2 participantes.');
  if (new Set(seeds).size !== seeds.length) throw new Error('Hay participantes repetidos.');
  return buildBracket(seeds.slice(), !!opts.thirdPlace && seeds.length >= 4, {});
}

/**
 * Anota (o borra con null) el ganador de un partido y devuelve el cuadro nuevo. Lanza Error si el ganador no
 * es uno de los dos lados o si el partido todavía no tiene sus dos lados.
 */
export function setWinner(bracket: Bracket, key: string, winner: string | null): Bracket {
  const match = bracket.matches.find((m) => m.key === key);
  if (!match) throw new Error('Ese partido no existe en el cuadro.');
  if (match.bye) throw new Error('Ese partido es un pase directo.');
  const winners = { ...bracket.winners };
  if (winner === null) delete winners[key];
  else {
    if (!match.side1 || !match.side2) throw new Error('Todavía no se sabe quién juega ese partido.');
    if (winner !== match.side1 && winner !== match.side2) throw new Error('El ganador tiene que ser uno de los dos lados.');
    winners[key] = winner;
  }
  return buildBracket(bracket.seeds, bracket.thirdPlace, winners);
}

/** Campeón, o null si falta la final. */
export function champion(bracket: Bracket): string | null {
  return bracket.matches.find((m) => m.round === bracket.rounds && !m.thirdPlace)?.winner ?? null;
}

/** Puestos 1.º a 4.º cuando se saben (3.º y 4.º solo con partido por el 3.er lugar). */
export function podium(bracket: Bracket): (string | null)[] {
  const final = bracket.matches.find((m) => m.round === bracket.rounds && !m.thirdPlace)!;
  const loser = (m: BracketMatch) => (m.winner && m.side1 && m.side2 ? (m.winner === m.side1 ? m.side2 : m.side1) : null);
  const out: (string | null)[] = [final.winner, loser(final)];
  const p3 = bracket.matches.find((m) => m.thirdPlace);
  if (p3) out.push(p3.winner, loser(p3));
  return out;
}

function buildBracket(seeds: string[], thirdPlace: boolean, recorded: Record<string, string>): Bracket {
  const size = nextPowerOfTwo(seeds.length);
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  const matches: BracketMatch[] = [];
  const byKey = new Map<string, BracketMatch>();
  const key = (round: number, index: number) => `R${round}-${index + 1}`;
  const winners: Record<string, string> = {};

  // Esqueleto: lados vacíos y a dónde va cada ganador.
  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r;
    for (let i = 0; i < count; i++) {
      const m: BracketMatch = {
        key: key(r, i),
        round: r,
        index: i,
        side1: null,
        side2: null,
        seed1: null,
        seed2: null,
        bye: false,
        winner: null,
        next: r < rounds ? { key: key(r + 1, Math.floor(i / 2)), side: i % 2 === 0 ? 1 : 2 } : null,
        loserNext: thirdPlace && r === rounds - 1 ? { key: 'P3', side: i % 2 === 0 ? 1 : 2 } : null,
        thirdPlace: false,
      };
      matches.push(m);
      byKey.set(m.key, m);
    }
  }
  if (thirdPlace) {
    const p3: BracketMatch = {
      key: 'P3',
      round: rounds,
      index: 1,
      side1: null,
      side2: null,
      seed1: null,
      seed2: null,
      bye: false,
      winner: null,
      next: null,
      loserNext: null,
      thirdPlace: true,
    };
    matches.push(p3);
    byKey.set('P3', p3);
  }

  const seedOf = new Map(seeds.map((s, i) => [s, i + 1]));
  const place = (target: { key: string; side: Side } | null, id: string | null) => {
    if (!target || !id) return;
    const m = byKey.get(target.key)!;
    if (target.side === 1) {
      m.side1 = id;
      m.seed1 = seedOf.get(id) ?? null;
    } else {
      m.side2 = id;
      m.seed2 = seedOf.get(id) ?? null;
    }
  };

  // Primera ronda con la siembra estándar; donde falta rival, pase directo.
  for (let i = 0; i < size / 2; i++) {
    const m = byKey.get(key(1, i))!;
    const s1 = order[2 * i];
    const s2 = order[2 * i + 1];
    m.side1 = seeds[s1 - 1] ?? null;
    m.side2 = seeds[s2 - 1] ?? null;
    m.seed1 = m.side1 ? s1 : null;
    m.seed2 = m.side2 ? s2 : null;
  }

  // Ronda por ronda: byes automáticos (solo en la primera) y luego los ganadores anotados que sigan siendo
  // válidos. Como hay más de la mitad de participantes, nunca hay un partido sin nadie ni un bye en semifinales
  // con 3.er lugar (el 3.er lugar exige 4 o más).
  const decide = (m: BracketMatch) => {
    if (m.side1 && m.side2 && (recorded[m.key] === m.side1 || recorded[m.key] === m.side2)) {
      m.winner = recorded[m.key];
      winners[m.key] = m.winner;
    }
  };
  for (let r = 1; r <= rounds; r++) {
    for (const m of matches) {
      if (m.round !== r || m.thirdPlace) continue;
      if (r === 1 && (!m.side1 || !m.side2)) {
        m.bye = true;
        m.winner = m.side1 ?? m.side2;
      } else decide(m);
      place(m.next, m.winner);
      if (m.loserNext && m.winner) place(m.loserNext, m.winner === m.side1 ? m.side2 : m.side1);
    }
  }
  const p3 = byKey.get('P3');
  if (p3) decide(p3);
  return { seeds, size, rounds, thirdPlace, winners, matches };
}
