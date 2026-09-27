/**
 * Cancha de pickleball, sin React: el adaptador del motor para el modo cancha (partido a juegos, o el juego del
 * round robin, que se guarda con sus puntos) y lo que se muestra: el canto grande («5-3-2»), quién saca y desde
 * dónde, dónde está cada jugador (derecha o izquierda), segundo sacador y cambio de lado. Puro.
 */
import type { CourtAdapter } from '../../../../court';
import type { MatchScore } from '../../../../lib/data/matches';
import { pickleballEngine, toLive, type MatchSetup, type PickleballEvent, type PickleballRules, type PickleballState } from '../../../../sports/racket';
import type { Side } from '../../../../sports/types';
import { racketScore } from '../../racket/court/adapters';

export type PickleMode = 'sets' | 'game';

/** Puntos del juego que se juega o del último que se terminó. */
export function gamePoints(s: PickleballState): [number, number] {
  if (s.winner !== null && s.games.length) {
    const g = s.games[s.games.length - 1];
    return [g[0], g[1]];
  }
  return [s.score[0], s.score[1]];
}

/** matches.score del juego del round robin: los puntos del juego (van a save_points_result). */
export function gameScore(s: PickleballState): MatchScore {
  const [a, b] = gamePoints(s);
  return { text: `${a}-${b}`, sides: [a, b], live: toLive(s) as unknown as Record<string, unknown> };
}

/**
 * Adaptador del modo cancha. Publica al terminar cada juego, cada 4 puntos anotados o al terminar (nunca por
 * punto); si no, como mucho cada minuto.
 */
export function pickleballAdapter(rules: PickleballRules, mode: PickleMode = 'sets'): CourtAdapter<MatchSetup, PickleballState, PickleballEvent> {
  const engine = pickleballEngine(rules);
  const total = (s: PickleballState) => s.score[0] + s.score[1];
  return {
    engine,
    score: mode === 'game' ? gameScore : racketScore,
    milestone: (prev, next) =>
      next.winner !== null || prev.games.length !== next.games.length || (total(next) !== total(prev) && total(next) > 0 && total(next) % 4 === 0),
  };
}

export interface PickleSpot {
  side: Side;
  label: string;
  /** Nombres de quien está a la derecha y a la izquierda (dobles). En individual, `right` = el jugador. */
  right: string;
  left: string | null;
  serving: boolean;
  /** Quién saca de esa pareja (nombre) si es la que saca. */
  server: string | null;
}

export interface PickleView {
  /** «5-3-2» (dobles tradicional), «5-3» (individual o rally). Vacío al terminar. */
  call: string;
  /** Las partes del canto para mostrarlas grandes: puntos del que saca, del que recibe y número de sacador. */
  parts: [number, number, 1 | 2 | null];
  serving: Side;
  /** Nombre de quien saca (o del lado en individual). */
  serverName: string;
  serverNumber: 1 | 2 | null;
  /** Desde dónde saca: derecha (par) o izquierda (impar). */
  from: 'derecha' | 'izquierda';
  spots: [PickleSpot, PickleSpot];
  /** Juegos terminados como texto («11-7») y puntos del juego que va. */
  done: string[];
  now: [number, number];
  /** Juego que se juega (1, 2, 3) y si es el decisivo. */
  gameNo: number;
  deciding: boolean;
  /** Aviso de cambio de lado (fin de juego o mitad del decisivo). */
  switchNow: boolean;
  /** Primer saque del juego en dobles tradicional («0-0-2»: solo un sacador). */
  firstServe: boolean;
  over: boolean;
  winner: Side | null;
}

/** Lo que se muestra en la cancha. `people[i]` = nombres de los jugadores del lado i (en su orden: 0 y 1). */
export function pickleView(s: PickleballState, people: readonly (readonly string[])[], labels: readonly [string, string]): PickleView {
  const r = s.rules;
  const nameOf = (side: Side, p: 0 | 1) => people[side - 1]?.[p] ?? (r.doubles ? `Jugador ${p + 1}` : labels[side - 1]);
  const srv = s.server;
  const spot = (side: Side): PickleSpot => {
    const i = side - 1;
    if (!r.doubles) return { side, label: labels[i], right: labels[i], left: null, serving: srv === side, server: srv === side ? labels[i] : null };
    const rp = s.right[i];
    const lp = rp === 0 ? 1 : 0;
    return {
      side,
      label: labels[i],
      right: nameOf(side, rp),
      left: nameOf(side, lp),
      serving: srv === side,
      server: srv === side ? nameOf(side, s.serverPlayer) : null,
    };
  };
  const [a, b] = [s.score[srv - 1], s.score[2 - srv]];
  const deciding = s.games.length === r.bestOf - 1;
  return {
    call: s.call,
    parts: [a, b, s.serverNumber],
    serving: srv,
    serverName: r.doubles ? nameOf(srv, s.serverPlayer) : labels[srv - 1],
    serverNumber: s.serverNumber,
    from: s.serveFrom === 'right' ? 'derecha' : 'izquierda',
    spots: [spot(1), spot(2)],
    done: s.games.map((g) => `${g[0]}-${g[1]}`),
    now: [s.score[0], s.score[1]],
    gameNo: Math.min(s.games.length + 1, r.bestOf),
    deciding,
    switchNow: s.changeEnds,
    firstServe: r.doubles && r.scoring === 'sideout' && s.rallies === 0 && s.server === s.gameFirstServer && s.serverNumber === 2,
    over: s.winner !== null,
    winner: s.winner,
  };
}

/** «Sacador 2», «Sacador 1» o nada. */
export const serverNumberText = (n: 1 | 2 | null) => (n === null ? '' : `Sacador ${n}`);
