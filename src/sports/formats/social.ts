/**
 * Noches sociales de dobles con puntaje individual (Americano y Mexicano): tipos de ronda, tabla individual
 * y el motor de "suma de puntos" de la cancha (se toca la pareja que ganó el punto).
 */

import type { MatchEngine, Side, StandingRow } from '../types';
import { resolveTies, tiebreak } from './standings';

export interface DoublesMatch {
  /** Cancha 1, 2, … */
  court: number;
  side1: [string, string];
  side2: [string, string];
}

export interface SocialRound {
  /** Ronda 1, 2, … */
  round: number;
  matches: DoublesMatch[];
  /** Quién descansa en esta ronda. */
  rests: string[];
}

/** Partido de una ronda con su marcador (null = todavía no se ha jugado). */
export interface ScoredDoubles {
  side1: readonly string[];
  side2: readonly string[];
  score1?: number | null;
  score2?: number | null;
}

export interface ScoredRound {
  matches: readonly ScoredDoubles[];
  rests: readonly string[];
}

/**
 * Qué recibe quien descansa:
 * - `own-average` (por defecto): su propio promedio de puntos por partido, por cada descanso.
 * - `round-average`: el promedio de puntos por jugador de esa ronda.
 * - `normalize`: la tabla va por puntos por partido jugado (promedio).
 * - `none`: nada, solo lo que sumó.
 */
export type RestPolicy = 'own-average' | 'round-average' | 'normalize' | 'none';

const round2 = (x: number) => Math.round(x * 100) / 100;

const scored = (m: ScoredDoubles): m is ScoredDoubles & { score1: number; score2: number } => m.score1 != null && m.score2 != null;

/**
 * Tabla individual de americano o mexicano. Cada jugador suma los puntos de su pareja en cada partido.
 * Orden: puntos → partidos ganados → dif. de puntos; si sigue el empate, comparten puesto (en el orden de
 * `players`). Una ronda cuenta (también sus descansos) cuando tiene al menos un partido con marcador.
 *
 * `for`/`against`/`diff` son puntos anotados y recibidos de verdad; `points` incluye lo del descanso.
 * `extra`: rests (descansos), avg (puntos por partido), bonus (lo sumado por descansar).
 */
export function socialStandings(players: readonly string[], rounds: readonly ScoredRound[], opts: { rest?: RestPolicy } = {}): StandingRow[] {
  const policy = opts.rest ?? 'own-average';
  const rows = new Map<string, StandingRow>();
  const bonusRound = new Map<string, number>();
  for (const id of players) {
    if (rows.has(id)) continue;
    rows.set(id, { id, played: 0, won: 0, drawn: 0, lost: 0, points: 0, for: 0, against: 0, diff: 0, extra: { rests: 0, avg: 0, bonus: 0 }, rank: 0 });
    bonusRound.set(id, 0);
  }
  const add = (id: string, mine: number, theirs: number) => {
    const r = rows.get(id);
    if (!r) return;
    r.played++;
    r.for += mine;
    r.against += theirs;
    if (mine > theirs) r.won++;
    else if (mine < theirs) r.lost++;
    else r.drawn++;
  };

  for (const round of rounds) {
    const done = round.matches.filter(scored);
    if (!done.length) continue;
    let sum = 0;
    let count = 0;
    for (const m of done) {
      for (const p of m.side1) add(p, m.score1, m.score2);
      for (const p of m.side2) add(p, m.score2, m.score1);
      sum += m.score1 * m.side1.length + m.score2 * m.side2.length;
      count += m.side1.length + m.side2.length;
    }
    const roundAvg = count ? sum / count : 0;
    for (const p of round.rests) {
      const r = rows.get(p);
      if (!r) continue;
      r.extra.rests++;
      bonusRound.set(p, bonusRound.get(p)! + roundAvg);
    }
  }

  for (const r of rows.values()) {
    r.diff = r.for - r.against;
    const avg = r.played ? r.for / r.played : 0;
    r.extra.avg = round2(avg);
    if (policy === 'normalize') r.points = round2(avg);
    else {
      const bonus = policy === 'own-average' ? avg * r.extra.rests : policy === 'round-average' ? bonusRound.get(r.id)! : 0;
      r.extra.bonus = round2(bonus);
      r.points = round2(r.for + bonus);
    }
  }
  return resolveTies([...rows.values()], [], [tiebreak.points(), tiebreak.wins(), tiebreak.diff('dif. de puntos')]);
}

// ---------------------------------------------------------------------------------------------------------
// Motor de suma de puntos (pantalla del americano/mexicano)

/** Totales usuales del americano: el partido termina cuando entre los dos lados suman esto. */
export const SOCIAL_TARGETS = [16, 21, 24, 32] as const;

export interface PointsConfig {
  /** `total`: termina al llegar la suma a `target`. `time`: por tiempo, termina con «Terminar». */
  mode: 'total' | 'time';
  target?: number;
  /** Minutos del partido en modo tiempo (solo para mostrar). */
  minutes?: number;
  /** Cada cuántos puntos cambia el saque (por defecto 4). */
  serveEvery?: number;
  /** Qué lado saca primero (por defecto 1). */
  firstServe?: Side;
}

export interface PointsState {
  config: PointsConfig;
  score: [number, number];
  ended: boolean;
}

export type PointsEvent = { type: 'point'; side: Side } | { type: 'end' };

function targetOf(config: PointsConfig): number {
  const t = config.target ?? 24;
  if (!Number.isInteger(t) || t < 1) throw new Error('El total del partido no es válido.');
  return t;
}

export const pointsEngine: MatchEngine<PointsConfig, PointsState, PointsEvent> = {
  init(config) {
    if (config.mode === 'total') targetOf(config);
    return { config, score: [0, 0], ended: false };
  },
  apply(state, ev) {
    if (pointsEngine.isOver(state)) throw new Error('El partido ya terminó.');
    if (ev.type === 'end') return { ...state, ended: true };
    if (ev.side !== 1 && ev.side !== 2) throw new Error('Lado no válido.');
    const score: [number, number] = [state.score[0], state.score[1]];
    score[ev.side - 1]++;
    return { ...state, score };
  },
  isOver(state) {
    return state.ended || (state.config.mode === 'total' && state.score[0] + state.score[1] >= targetOf(state.config));
  },
  result(state) {
    const [a, b] = state.score;
    const winner: Side | null = !pointsEngine.isOver(state) || a === b ? null : a > b ? 1 : 2;
    return { winner, summary: `${a}-${b}` };
  },
};

/** Quién saca ahora y si el saque acaba de cambiar (para avisar en pantalla). */
export function serveInfo(state: PointsState): { side: Side; turn: number; changed: boolean } {
  const every = Math.max(1, state.config.serveEvery ?? 4);
  const total = state.score[0] + state.score[1];
  const turn = Math.floor(total / every);
  const first = state.config.firstServe ?? 1;
  const side: Side = turn % 2 === 0 ? first : first === 1 ? 2 : 1;
  return { side, turn, changed: total > 0 && total % every === 0 };
}

/** Revisa un marcador escrito a mano. Devuelve el error en español o null si está bien. */
export function validatePointsScore(config: PointsConfig, score1: number, score2: number): string | null {
  if (![score1, score2].every((s) => Number.isInteger(s) && s >= 0)) return 'Los puntos deben ser números enteros de 0 en adelante.';
  if (config.mode === 'total') {
    const t = targetOf(config);
    if (score1 + score2 !== t) return `Los puntos de los dos lados deben sumar ${t}.`;
  }
  return null;
}
