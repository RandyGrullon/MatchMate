/**
 * Tipos comunes a todos los deportes de MatchMate. Los motores de cada deporte son funciones PURAS
 * (sin React, sin backend, sin fechas del sistema): reciben datos y devuelven datos, y se prueban solos.
 */

export type SportId = 'bowling' | 'padel' | 'tennis' | 'pickleball' | 'basketball' | 'football' | 'futsal' | 'golf' | 'swimming';

/** series: cada quien anota su número (pinos, golpes, tiempo). racket: partidos con sets. team: equipos por tiempos. */
export type SportFamily = 'series' | 'racket' | 'team';

export const SPORT_FAMILY: Record<SportId, SportFamily> = {
  bowling: 'series',
  golf: 'series',
  swimming: 'series',
  padel: 'racket',
  tennis: 'racket',
  pickleball: 'racket',
  basketball: 'team',
  football: 'team',
  futsal: 'team',
};

export type Side = 1 | 2;

/**
 * Motor de un partido en cancha: el partido es una lista de jugadas y el marcador se recalcula desde ella.
 * Deshacer = volver a calcular sin la última jugada. Todo puro y determinista.
 */
export interface MatchEngine<Config, State, Ev> {
  init(config: Config): State;
  /** Aplica una jugada. Lanza un Error con mensaje en español si la jugada no es válida en ese estado. */
  apply(state: State, ev: Ev): State;
  isOver(state: State): boolean;
  /** Ganador (null = empate o sin terminar) y un texto corto del marcador ("6-4 3-6 10-7"). */
  result(state: State): { winner: Side | null; summary: string };
}

/** Recalcula el estado desde el principio (deshacer = replay(config, log.slice(0, -1))). */
export function replay<C, S, E>(engine: MatchEngine<C, S, E>, config: C, log: readonly E[]): S {
  return log.reduce((s, ev) => engine.apply(s, ev), engine.init(config));
}

/** Fila de una tabla de posiciones, igual para todos los deportes de partido. */
export interface StandingRow {
  /** Jugador, pareja o equipo. */
  id: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  /** Puntos de tabla. */
  points: number;
  /** A favor / en contra según el deporte: sets, juegos, puntos o goles (ver `extra`). */
  for: number;
  against: number;
  diff: number;
  /** Otros totales del deporte (p. ej. setsFor, gamesFor, yellow, red). */
  extra: Record<string, number>;
  /** Puesto (empates que no se pudieron romper comparten puesto). */
  rank: number;
  /** Qué regla decidió el puesto frente al de arriba, para mostrarlo ("dif. de sets"). */
  decidedBy?: string;
}

/** Resultado de un partido ya terminado, tal como lo usan las tablas. */
export interface MatchResult {
  id: string;
  side1: string;
  side2: string;
  /** null = empate. */
  winner: Side | null;
  /** W.O.: quien no se presentó. */
  walkover?: Side;
  /** Totales por lado (sets, juegos, puntos, goles…) según el deporte. */
  totals: Record<string, [number, number]>;
}
