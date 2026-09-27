/**
 * Calendario del Americano: siempre dobles, puntaje individual, compañeros que rotan.
 *
 * - Con N múltiplo de 4 (y N/4 múltiplo de las canchas) o N ≡ 1 mod 4 con canchas para todos (1 descansa por
 *   ronda), se usa el método del círculo: nadie repite compañero hasta haber jugado con todos.
 * - En los demás casos (N ≡ 2 o 3 mod 4, o canchas que no cuadran) se arma ronda a ronda: descansan los que
 *   menos han descansado y se buscan parejas nuevas; si ya no hay, las que menos se han repetido. Se prueban
 *   varios intentos con la semilla y se queda el que mejor reparte compañeros y rivales. Con calendarios de
 *   hasta ~75 % de «todos con todos» no se repite compañero; muy cerca del 100 % puede repetirse uno.
 * - "Balanceado parcial": se elige cuántas rondas jugar (todos con todos puede ser demasiado largo).
 */

import { seededRandom, shuffle, type Seed } from './random';
import type { DoublesMatch, SocialRound } from './social';

export const AMERICANO_MIN = 4;
export const AMERICANO_MAX = 32;

export interface AmericanoOptions {
  courts: number;
  rounds: number;
  /** Semilla del sorteo. Sin semilla se respeta el orden de `players`; con semilla se barajan. */
  seed?: Seed;
  /** Intentos en el modo de búsqueda (por defecto 24). */
  attempts?: number;
}

/** Partidos por ronda: una cancha por cada 4 jugadores, sin pasar de las canchas que hay. */
export function matchesPerRound(players: number, courts: number): number {
  return Math.max(0, Math.min(Math.floor(courts), Math.floor(players / 4)));
}

/** Rondas para que, en teoría, cada quien juegue con todos como compañero (N−1 con múltiplo de 4, N con N ≡ 1). */
export function americanoRoundsForAll(players: number, courts: number): number {
  const m = matchesPerRound(players, courts);
  if (!m) return 0;
  return Math.ceil((players * (players - 1)) / 2 / (2 * m));
}

/** Cantidades de rondas (hasta `max`) en las que todos descansan lo mismo y juegan los mismos partidos. */
export function roundsWithEqualRests(players: number, courts: number, max: number): number[] {
  const rest = players - 4 * matchesPerRound(players, courts);
  const out: number[] = [];
  for (let r = 1; r <= max; r++) if ((r * rest) % players === 0) out.push(r);
  return out;
}

export interface ScheduleStats {
  /** Veces que cada par fue compañero: partners[a][b]. */
  partners: Record<string, Record<string, number>>;
  opponents: Record<string, Record<string, number>>;
  rests: Record<string, number>;
  played: Record<string, number>;
  /** Máximo de veces que un mismo par repitió como compañeros. */
  maxPartner: number;
}

/** Números del calendario para revisarlo o mostrarlo ("juegas 7 partidos, descansas 2"). */
export function scheduleStats(players: readonly string[], rounds: readonly SocialRound[]): ScheduleStats {
  const zero = () => Object.fromEntries(players.map((p) => [p, 0])) as Record<string, number>;
  const partners = Object.fromEntries(players.map((p) => [p, zero()])) as Record<string, Record<string, number>>;
  const opponents = Object.fromEntries(players.map((p) => [p, zero()])) as Record<string, Record<string, number>>;
  const rests = zero();
  const played = zero();
  let maxPartner = 0;
  for (const r of rounds) {
    for (const p of r.rests) rests[p]++;
    for (const m of r.matches) {
      for (const [side, other] of [
        [m.side1, m.side2],
        [m.side2, m.side1],
      ]) {
        const [a, b] = side;
        played[a]++;
        played[b]++;
        partners[a][b]++;
        partners[b][a]++;
        maxPartner = Math.max(maxPartner, partners[a][b]);
        for (const x of side) for (const y of other) opponents[x][y]++;
      }
    }
  }
  return { partners, opponents, rests, played, maxPartner };
}

/** Arma las rondas del americano. Lanza un Error en español si los datos no sirven. */
export function americanoSchedule(players: readonly string[], opts: AmericanoOptions): SocialRound[] {
  const n = players.length;
  if (n < AMERICANO_MIN || n > AMERICANO_MAX) throw new Error(`El americano necesita de ${AMERICANO_MIN} a ${AMERICANO_MAX} jugadores.`);
  if (new Set(players).size !== n) throw new Error('Hay jugadores repetidos.');
  if (!Number.isInteger(opts.courts) || opts.courts < 1) throw new Error('Hace falta al menos una cancha.');
  if (!Number.isInteger(opts.rounds) || opts.rounds < 1 || opts.rounds > 100) throw new Error('El número de rondas no es válido.');
  const rand = seededRandom(opts.seed ?? `americano:${players.join(',')}`);
  const ids = opts.seed === undefined ? players.slice() : shuffle(players, rand);
  const m = matchesPerRound(n, opts.courts);
  const circle = (n % 4 === 0 && (n / 4) % m === 0) || (n % 4 === 1 && m === (n - 1) / 4);
  const attempts = opts.attempts ?? 24;
  const plan = circle ? circlePlan(n, m, opts.rounds, rand, attempts) : searchPlan(n, m, opts.rounds, rand, attempts);
  return plan.map((r, i) => ({
    round: i + 1,
    matches: r.matches.map(([a, b, c, d], k): DoublesMatch => ({ court: k + 1, side1: [ids[a], ids[b]], side2: [ids[c], ids[d]] })),
    rests: r.rests.map((p) => ids[p]),
  }));
}

// ---------------------------------------------------------------------------------------------------------
// Interno: índices 0..n−1

interface PlanRound {
  /** [a, b, c, d] = a+b contra c+d. */
  matches: [number, number, number, number][];
  rests: number[];
}

type Matrix = number[][];
const matrix = (n: number): Matrix => Array.from({ length: n }, () => new Array<number>(n).fill(0));

/** Factorización de K_M por el método del círculo: M−1 rondas de M/2 parejas (M par). */
function circleFactors(size: number): [number, number][][] {
  const M = size % 2 === 0 ? size : size + 1;
  const k = M - 1;
  const rounds: [number, number][][] = [];
  for (let r = 0; r < k; r++) {
    const pairs: [number, number][] = [[k, r]];
    for (let i = 1; i < M / 2; i++) pairs.push([(r + i) % k, (r - i + k) % k]);
    rounds.push(pairs);
  }
  return rounds;
}

function applyRound(plan: PlanRound[], matches: [number, number, number, number][], rests: number[], pc: Matrix, oc: Matrix) {
  for (const [a, b, c, d] of matches) {
    pc[a][b]++;
    pc[b][a]++;
    pc[c][d]++;
    pc[d][c]++;
    for (const x of [a, b]) {
      for (const y of [c, d]) {
        oc[x][y]++;
        oc[y][x]++;
      }
    }
  }
  plan.push({ matches, rests });
}

/** Agrupa parejas en partidos buscando rivales que se hayan enfrentado menos. */
function groupPairs(pairs: [number, number][], oc: Matrix, rand: () => number): [number, number, number, number][] {
  const w = (p: [number, number], q: [number, number]) => oc[p[0]][q[0]] + oc[p[0]][q[1]] + oc[p[1]][q[0]] + oc[p[1]][q[1]];
  const W = pairs.map((p) => pairs.map((q) => w(p, q)));
  const { pairs: grouped } = minCostPairing(pairs.length, W, rand, 3000);
  return grouped.map(([i, j]) => [pairs[i][0], pairs[i][1], pairs[j][0], pairs[j][1]]);
}

/**
 * Método del círculo: cada factor es un reparto de todos en parejas que nunca se repiten. Con menos canchas
 * (N/4 múltiplo de las canchas) el factor se reparte en varias rondas seguidas: cada quien juega una vez en
 * ese tramo y los descansos quedan parejos. Se prueban varios órdenes de factores y se queda el que mejor
 * reparte los rivales (los compañeros no cambian: nunca se repiten dentro de un ciclo).
 */
function circlePlan(n: number, m: number, rounds: number, rand: () => number, attempts: number): PlanRound[] {
  const factors = circleFactors(n);
  const dummy = n % 2 === 0 ? -1 : n;
  const bound = spreadLowerBound(n, rounds * m * 4);
  let best: { plan: PlanRound[]; score: number } | null = null;
  for (let a = 0; a < Math.max(1, attempts); a++) {
    const order = a === 0 ? factors : shuffle(factors, rand);
    const pc = matrix(n);
    const oc = matrix(n);
    const plan: PlanRound[] = [];
    for (let f = 0; plan.length < rounds; f++) {
      const factor = order[f % order.length];
      // Con N impar, el que cae con el "fantasma" descansa en todo el tramo.
      const pairs = factor.filter(([x, y]) => x !== dummy && y !== dummy);
      const matches = groupPairs(pairs, oc, rand);
      for (let k = 0; k < matches.length && plan.length < rounds; k += m) {
        const chunk = matches.slice(k, k + m);
        const playing = new Set(chunk.flat());
        const rests = [...Array(n).keys()].filter((p) => !playing.has(p));
        applyRound(plan, chunk, rests, pc, oc);
      }
    }
    const score = sumSquares(oc);
    if (!best || score < best.score) best = { plan, score };
    if (best.score === bound) break;
  }
  return best!.plan;
}

function sumSquares(mx: Matrix): number {
  let s = 0;
  for (let i = 0; i < mx.length; i++) for (let j = i + 1; j < mx.length; j++) s += mx[i][j] * mx[i][j];
  return s;
}

/** Mínimo posible de la suma de cuadrados cuando `edges` encuentros se reparten entre todos los pares. */
function spreadLowerBound(n: number, edges: number): number {
  const pairs = (n * (n - 1)) / 2;
  const q = Math.floor(edges / pairs);
  const r = edges % pairs;
  return (pairs - r) * q * q + r * (q + 1) * (q + 1);
}

function searchPlan(n: number, m: number, rounds: number, rand: () => number, attempts: number): PlanRound[] {
  const bound = spreadLowerBound(n, rounds * 2 * m);
  let best: { plan: PlanRound[]; score: [number, number] } | null = null;
  for (let a = 0; a < Math.max(1, attempts); a++) {
    const attempt = greedyPlan(n, m, rounds, seededRandom(Math.floor(rand() * 2 ** 32)));
    if (!best || attempt.score[0] < best.score[0] || (attempt.score[0] === best.score[0] && attempt.score[1] < best.score[1])) best = attempt;
    if (best.score[0] === bound && a >= 2) break;
  }
  return best!.plan;
}

function greedyPlan(n: number, m: number, rounds: number, rand: () => number): { plan: PlanRound[]; score: [number, number] } {
  const pc = matrix(n);
  const oc = matrix(n);
  const rests = new Array<number>(n).fill(0);
  const lastRest = new Array<number>(n).fill(-1);
  const plan: PlanRound[] = [];
  const k = n - 4 * m;
  for (let r = 0; r < rounds; r++) {
    let chosen: { resting: number[]; pairs: [number, number][]; cost: number } | null = null;
    const variants = k === 0 ? 1 : 4;
    for (let v = 0; v < variants; v++) {
      const resting = pickResters(n, k, rests, lastRest, rand, v === 0);
      const out = new Set(resting);
      const playing = [...Array(n).keys()].filter((p) => !out.has(p));
      const W = playing.map((a) => playing.map((b) => pc[a][b]));
      const res = minCostPairing(playing.length, W, rand, 2500);
      const pairs = res.pairs.map(([i, j]) => [playing[i], playing[j]] as [number, number]);
      if (!chosen || res.cost < chosen.cost) chosen = { resting, pairs, cost: res.cost };
      if (chosen.cost === 0) break;
    }
    for (const p of chosen!.resting) {
      rests[p]++;
      lastRest[p] = r;
    }
    applyRound(plan, groupPairs(chosen!.pairs, oc, rand), chosen!.resting.slice().sort((a, b) => a - b), pc, oc);
  }
  return { plan, score: [sumSquares(pc), sumSquares(oc)] };
}

/**
 * Quién descansa: siempre los que menos han descansado. Entre los empatados en el corte, la primera variante
 * prefiere al que descansó hace más tiempo; las otras eligen al azar (con la semilla).
 */
function pickResters(n: number, k: number, rests: number[], lastRest: number[], rand: () => number, spaced: boolean): number[] {
  if (k === 0) return [];
  const key = Array.from({ length: n }, () => rand());
  const order = [...Array(n).keys()].sort((a, b) => rests[a] - rests[b] || (spaced ? lastRest[a] - lastRest[b] : 0) || key[a] - key[b]);
  return order.slice(0, k);
}

/**
 * Empareja 0..size−1 (size par) minimizando la suma de pesos W[i][j]. Búsqueda con poda y tope de nodos:
 * primero el más restringido, y como compañero el de menor peso y menos opciones libres.
 */
function minCostPairing(size: number, W: Matrix, rand: () => number, budget: number): { pairs: [number, number][]; cost: number } {
  const used = new Array<boolean>(size).fill(false);
  const key = Array.from({ length: size }, () => rand());
  const rowMin = W.map((row, i) => Math.min(...row.filter((_, j) => j !== i)));
  let rootBound = 0;
  for (let i = 0; i < size; i++) rootBound += rowMin[i];
  rootBound = Math.ceil(rootBound / 2);
  let best = Infinity;
  let bestPairs: [number, number][] = [];
  const cur: [number, number][] = [];
  let nodes = 0;
  let restBound = rootBound * 2;

  const dfs = (cost: number): void => {
    if (best <= rootBound) return;
    if (nodes++ > budget && best < Infinity) return;
    if (cost + Math.ceil(restBound / 2) >= best) return;
    let pick = -1;
    let pickFree = Infinity;
    for (let i = 0; i < size; i++) {
      if (used[i]) continue;
      let free = 0;
      for (let j = 0; j < size; j++) if (j !== i && !used[j] && W[i][j] === rowMin[i]) free++;
      if (free < pickFree || (free === pickFree && key[i] < key[pick])) {
        pick = i;
        pickFree = free;
      }
    }
    if (pick === -1) {
      best = cost;
      bestPairs = cur.slice();
      return;
    }
    const cands: { j: number; w: number; free: number }[] = [];
    for (let j = 0; j < size; j++) {
      if (j === pick || used[j]) continue;
      let free = 0;
      for (let x = 0; x < size; x++) if (x !== j && x !== pick && !used[x] && W[j][x] === 0) free++;
      cands.push({ j, w: W[pick][j], free });
    }
    cands.sort((a, b) => a.w - b.w || a.free - b.free || key[a.j] - key[b.j]);
    used[pick] = true;
    restBound -= rowMin[pick];
    for (const c of cands) {
      used[c.j] = true;
      restBound -= rowMin[c.j];
      cur.push([pick, c.j]);
      dfs(cost + c.w);
      cur.pop();
      restBound += rowMin[c.j];
      used[c.j] = false;
      if (best <= rootBound || (nodes > budget && best < Infinity)) break;
    }
    restBound += rowMin[pick];
    used[pick] = false;
  };
  if (size > 0) dfs(0);
  return { pairs: bestPairs, cost: size > 0 ? best : 0 };
}
