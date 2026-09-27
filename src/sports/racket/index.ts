/**
 * Deportes de raqueta: tenis, pádel y pickleball. Punto de entrada de la familia.
 *
 * Uso típico:
 *   const engine = createRacketEngine('padel');              // reglas por defecto (punto de oro, súper tie-break)
 *   let s = engine.init({ firstServer: 2, firstPlayer: [0, 1] });
 *   s = engine.apply(s, { type: 'point', side: 1 });
 *   const antes = replay(engine, setup, log.slice(0, -1));    // deshacer
 *   matchTotals(s)                                            // { sets, games, points } para la tabla
 *
 * El estado es JSON plano: se guarda en el partido y otro teléfono puede seguir con `applyRacket` sobre él.
 */
import type { MatchEngine, MatchResult, Side } from '../types';
import { applyPickleball, initPickleball, pickleballEngine, pickleballResult, type PickleballEvent, type PickleballState } from './pickleball';
import {
  resolveRules,
  type MatchSetup,
  type Pair,
  type PickleballRules,
  type Player,
  type RacketRules,
  type RacketSport,
  type SetScore,
  type TennisRules,
} from './rules';
import { applyTennis, initTennis, setText, tennisEngine, tennisResult, type TennisEvent, type TennisState } from './tennis';

export * from './rules';
export * from './tennis';
export * from './pickleball';

export type RacketState = TennisState | PickleballState;
export type RacketEvent = TennisEvent | PickleballEvent;

/** Aplica una jugada a cualquier partido de raqueta (usa las reglas guardadas en el estado). */
export function applyRacket(state: RacketState, ev: RacketEvent): RacketState {
  return state.sport === 'pickleball' ? applyPickleball(state, ev as PickleballEvent) : applyTennis(state, ev as TennisEvent);
}

export function racketResult(state: RacketState): { winner: Side | null; summary: string } {
  return state.sport === 'pickleball' ? pickleballResult(state) : tennisResult(state);
}

/**
 * Motor del deporte con las reglas de por defecto más los cambios de `rules`. Lanza un Error (en español) si
 * las reglas no son válidas. `init` recibe el sorteo (quién saca, orden de cada pareja, lado inicial).
 */
export function createRacketEngine(sport: 'pickleball', rules?: Partial<PickleballRules>): MatchEngine<MatchSetup, PickleballState, PickleballEvent>;
export function createRacketEngine(sport: 'tennis' | 'padel', rules?: Partial<TennisRules>): MatchEngine<MatchSetup, TennisState, TennisEvent>;
export function createRacketEngine(sport: RacketSport, rules?: Partial<RacketRules>): MatchEngine<MatchSetup, RacketState, RacketEvent>;
export function createRacketEngine(sport: RacketSport, rules: Partial<RacketRules> = {}): MatchEngine<MatchSetup, RacketState, RacketEvent> {
  const full = resolveRules(sport, rules);
  const engine = full.sport === 'pickleball' ? pickleballEngine(full) : tennisEngine(full);
  return engine as unknown as MatchEngine<MatchSetup, RacketState, RacketEvent>;
}

/** Estado inicial con reglas completas (sin pasar por `createRacketEngine`). */
export function initRacket(rules: RacketRules, setup?: MatchSetup): RacketState {
  return rules.sport === 'pickleball' ? initPickleball(rules, setup) : initTennis(rules, setup);
}

/**
 * Para la tabla: si hubo retiro o W.O., completa el partido como si el ganador ganara todos los puntos que
 * faltaban (W.O. = 6-0 6-0 en tenis y pádel, 11-0 en pickleball; retiro = se termina el set o juego en curso
 * a favor del ganador y, si hace falta, los que siguen). Si no, devuelve el mismo estado.
 */
export function completeMatch(state: RacketState): RacketState {
  if (state.winner === null || state.finish === 'played') return state;
  const w = state.winner;
  let s = { ...structuredClone(state), winner: null, finish: null, quitter: null } as RacketState;
  for (let guard = 0; s.winner === null && guard < 5000; guard++) s = applyRacket(s, { type: 'point', side: w });
  return s;
}

export interface RacketTotals {
  /** Sets ganados (en pickleball, juegos ganados: cada juego hace de set). */
  sets: Pair<number>;
  /** Juegos ganados (el súper tie-break cuenta como un juego 1-0). En pickleball, igual que `sets`. */
  games: Pair<number>;
  /** Puntos ganados (en tenis y pádel, todos los puntos jugados, tie-breaks incluidos). */
  points: Pair<number>;
}

/** Totales para la tabla. En retiro y W.O. usa el partido completado (ver `completeMatch`). */
export function matchTotals(state: RacketState): RacketTotals {
  const s = completeMatch(state);
  const count = (list: Pair<number>[], side: 0 | 1) => list.filter((x) => x[side] > x[1 - side]).length;
  if (s.sport === 'pickleball') {
    const done = s.games;
    const wins: Pair<number> = [count(done, 0), count(done, 1)];
    const points: Pair<number> = [s.score[0], s.score[1]];
    for (const g of done) {
      points[0] += g[0];
      points[1] += g[1];
    }
    return { sets: wins, games: [wins[0], wins[1]], points };
  }
  const sets = s.sets.map((x) => x.games);
  const games: Pair<number> = [s.games[0], s.games[1]];
  for (const g of sets) {
    games[0] += g[0];
    games[1] += g[1];
  }
  return { sets: [count(sets, 0), count(sets, 1)], games, points: [s.won[0], s.won[1]] };
}

/** Resultado para las tablas (`MatchResult` de src/sports/types.ts). `walkover` = quien no se presentó. */
export function toMatchResult(state: RacketState, meta: { id: string; side1: string; side2: string }): MatchResult {
  const t = matchTotals(state);
  const out: MatchResult = { ...meta, winner: state.winner, totals: { sets: t.sets, games: t.games, points: t.points } };
  if (state.finish === 'walkover' && state.quitter !== null) out.walkover = state.quitter;
  return out;
}

/** Foto chica del marcador para la pantalla «En vivo» (lo que ve el público; para retomar se guarda el estado entero). */
export interface RacketLive {
  sport: RacketSport;
  /** Sets (tenis/pádel) o juegos (pickleball) terminados como texto: "6-4", "7-6(5)", "10-7", "11-7". */
  done: string[];
  /** Juegos del set en curso (tenis/pádel) o puntos del juego en curso (pickleball). */
  now: Pair<number>;
  /** Tenis/pádel: marcador del juego ('15', '40', 'AD' o puntos del tie-break). */
  points?: Pair<string>;
  /** Pickleball: canto ("5-3-2"). */
  call?: string;
  server: Side;
  serverPlayer: Player;
  serveFrom: 'right' | 'left' | null;
  leftSide: Side;
  /** Aviso del punto ("Punto de oro", "Tie-break"…). */
  label: string | null;
  changeEnds: boolean;
  over: boolean;
  winner: Side | null;
  summary: string;
  /** Jugadas aplicadas (para descartar fotos viejas). */
  n: number;
}

export function toLive(state: RacketState): RacketLive {
  const base = {
    sport: state.sport,
    server: state.server,
    serverPlayer: state.serverPlayer,
    serveFrom: state.serveFrom,
    leftSide: state.leftSide,
    changeEnds: state.changeEnds,
    over: state.winner !== null,
    winner: state.winner,
    summary: racketResult(state).summary,
    n: state.n,
  };
  if (state.sport === 'pickleball') {
    return { ...base, done: state.games.map((g) => `${g[0]}-${g[1]}`), now: [state.score[0], state.score[1]], call: state.call, label: null };
  }
  return {
    ...base,
    done: state.sets.map(setText),
    now: [state.games[0], state.games[1]],
    points: [state.display[0], state.display[1]],
    label: state.label,
  };
}

const TOKEN = /^\[?(\d{1,2})\s*[-–—:/]\s*(\d{1,2})\]?(?:\((\d{1,2})\))?$/;

/**
 * Modo «solo resultado»: lee "6-4 3-6 10-7", "7-6(5) 6-4" o "11-7 9-11 11-5" (lado 1 primero) y devuelve un
 * estado terminado con esas reglas, listo para `matchTotals` y `racketResult`. Lanza un Error si no cuadra.
 */
export function stateFromScore(rules: RacketRules, text: string, setup?: MatchSetup): RacketState {
  const tokens = String(text ?? '')
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((t) => {
      const m = TOKEN.exec(t);
      if (!m) throw new Error(`No entiendo «${t}». Escribe el marcador así: 6-4 3-6 10-7.`);
      return { a: Number(m[1]), b: Number(m[2]), tb: m[3] === undefined ? null : Number(m[3]) };
    });
  if (!tokens.length) throw new Error('Escribe el marcador.');
  let s = initRacket(rules, setup);
  if (s.sport === 'pickleball') {
    if (tokens.some((t) => t.tb !== null)) throw new Error('En pickleball no hay tie-break.');
    s = applyPickleball(s, { type: 'correct', games: tokens.map((t) => [t.a, t.b]), score: [0, 0] });
  } else {
    const r = s.rules;
    const sets: SetScore[] = tokens.map((t) => {
      const set: SetScore = { games: [t.a, t.b] };
      if (t.tb !== null) {
        // "7-6(5)": el 5 es del que perdió el tie-break; el ganador llegó a 7 o a 2 más.
        const win = r.tiebreakWinBy === 2 ? Math.max(r.tiebreakTo, t.tb + 2) : r.tiebreakTo;
        set.tiebreak = t.a > t.b ? [win, t.tb] : [t.tb, win];
      }
      return set;
    });
    s = applyTennis(s, { type: 'correct', sets, games: [0, 0] });
  }
  if (s.winner === null) throw new Error('Ese marcador no termina el partido.');
  return s;
}
