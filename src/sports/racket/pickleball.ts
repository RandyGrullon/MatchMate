/**
 * Motor de pickleball: juegos a 11 (15 o 21) ganando por 2, a 1 juego o al mejor de 3, conteo tradicional
 * (side-out) o por rally, individual o dobles.
 *
 * Conteo tradicional en dobles:
 * - solo puntúa el lado que saca; al puntuar, el sacador cambia de lugar con su compañero y sigue sacando;
 * - si el lado que saca pierde el peloteo, pasa al sacador 2 (el compañero, desde donde esté) y luego hay side-out;
 * - en el side-out saca primero (sacador 1) quien esté a la derecha en ese momento;
 * - cada juego empieza en "0-0-2": el primer lado en sacar tiene un solo sacador.
 * El motor sigue quién está a la derecha en cada pareja (no un "sacador 1" fijo): los lugares solo cambian cuando
 * esa pareja puntúa sacando, así que el que empezó a la derecha está a la derecha cuando su lado va par.
 *
 * Conteo por rally: punto en cada peloteo y sin segundo sacador. Si gana el que recibe, suma y recupera el saque
 * sin cambiar de lugar; saca el jugador del lado que marca su puntaje (par = derecha, impar = izquierda).
 *
 * Canto: "puntos del que saca - puntos del que recibe - número de sacador" (el número solo en dobles tradicional).
 */
import type { MatchEngine, Side } from '../types';
import {
  assertPlayer,
  assertSide,
  flip,
  gamesSummary,
  intPair,
  needed,
  normalizeGames,
  other,
  raceOpen,
  raceWinner,
  resolveSetup,
  validateRules,
  type Finish,
  type MatchSetup,
  type Pair,
  type PickleballRules,
  type Player,
} from './rules';

export type PickleballEvent =
  /** Terminó un peloteo: lo ganó el lado que saca o el que recibe. */
  | { type: 'rally'; won: 'serving' | 'receiving' }
  /** Terminó un peloteo y lo ganó `side` (lo mismo que 'rally', dicho por lado; en tradicional el que recibe no suma). */
  | { type: 'point'; side: Side }
  /** Dobles: quién de la pareja empieza el juego a la derecha (solo antes del primer saque del juego). */
  | { type: 'positions'; side: Side; right: Player }
  | { type: 'retire'; side: Side }
  | { type: 'walkover'; side: Side }
  /**
   * Corrección del admin: juegos terminados y puntos del juego en curso. Lo que no se da se calcula así: saca el mismo
   * lado si sigue el mismo juego (si no, el que empieza ese juego); sacador 1 (o 2 en 0-0 del que empezó); lugares
   * por la paridad del puntaje (el que empezó a la derecha está a la derecha con su lado par); saca el de la derecha
   * (en rally, el del lado que marca su puntaje); lados de la cancha por los juegos jugados.
   */
  | {
      type: 'correct';
      games: Pair<number>[];
      score: Pair<number>;
      server?: Side;
      serverNumber?: 1 | 2;
      serverPlayer?: Player;
      right?: Pair<Player>;
      leftSide?: Side;
    };

export interface PickleballState {
  sport: 'pickleball';
  rules: PickleballRules;
  setup: Required<MatchSetup>;
  /** Juegos terminados: puntos de cada lado. */
  games: Pair<number>[];
  /** Puntos del juego en curso. */
  score: Pair<number>;
  /** Lado que saca. */
  server: Side;
  /** Jugador de esa pareja que saca (en individual, 0). */
  serverPlayer: Player;
  /** Dobles tradicional: sacador 1 o 2 (el primer turno del juego cuenta como 2). null en individual y en rally. */
  serverNumber: 1 | 2 | null;
  /** Dobles: qué jugador de cada pareja está ahora en la derecha (lado par). */
  right: Pair<Player>;
  /** Lado que sacó primero en el juego en curso. */
  gameFirstServer: Side;
  /** Peloteos jugados en el juego en curso. */
  rallies: number;
  /** Ya se cambió de lado a mitad del juego decisivo. */
  switched: boolean;
  /** Qué lado está a la izquierda ahora (de la pantalla del anotador). */
  leftSide: Side;
  winner: Side | null;
  finish: Finish | null;
  quitter: Side | null;
  n: number;

  // ---- Vista: se recalcula en cada jugada ----
  /** Desde dónde saca el sacador: derecha (par) o izquierda (impar). */
  serveFrom: 'right' | 'left';
  /** Canto: "5-3-2" en dobles tradicional, "5-3" en individual o rally. Vacío al terminar. */
  call: string;
  /** Aviso: cambiar de lado ahora (fin de juego o mitad del juego decisivo). */
  changeEnds: boolean;
}

export function initPickleball(rules: PickleballRules, setup?: MatchSetup): PickleballState {
  const errors = validateRules(rules);
  if (errors.length || rules.sport !== 'pickleball') throw new Error(errors.join(' ') || 'Reglas no válidas.');
  const su = resolveSetup(setup, rules.doubles);
  const s: PickleballState = {
    sport: 'pickleball',
    rules: { ...rules },
    setup: su,
    games: [],
    score: [0, 0],
    server: su.firstServer,
    serverPlayer: 0,
    serverNumber: null,
    right: [0, 0],
    gameFirstServer: su.firstServer,
    rallies: 0,
    switched: false,
    leftSide: su.leftSide,
    winner: null,
    finish: null,
    quitter: null,
    n: 0,
    serveFrom: 'right',
    call: '',
    changeEnds: false,
  };
  startGame(s, su.firstServer);
  return refresh(s);
}

/** Deja listo un juego nuevo: 0-0, cada pareja en su lugar inicial y saca `first` desde la derecha. */
function startGame(s: PickleballState, first: Side) {
  const r = s.rules;
  s.score = [0, 0];
  s.rallies = 0;
  s.switched = false;
  s.gameFirstServer = first;
  s.server = first;
  s.right = [s.setup.firstPlayer[0], s.setup.firstPlayer[1]];
  s.serverPlayer = r.doubles ? s.right[first - 1] : 0;
  s.serverNumber = r.doubles && r.scoring === 'sideout' ? 2 : null;
}

export function applyPickleball(state: PickleballState, ev: PickleballEvent): PickleballState {
  if (!ev || typeof ev !== 'object') throw new Error('Jugada no válida.');
  const s = structuredClone(state);
  s.n++;
  s.changeEnds = false;
  switch (ev.type) {
    case 'rally':
      if (ev.won !== 'serving' && ev.won !== 'receiving') throw new Error('Falta decir quién ganó el peloteo.');
      playing(s);
      rally(s, ev.won);
      break;
    case 'point':
      assertSide(ev.side);
      playing(s);
      rally(s, ev.side === s.server ? 'serving' : 'receiving');
      break;
    case 'positions':
      assertSide(ev.side);
      assertPlayer(ev.right);
      playing(s);
      if (!s.rules.doubles) throw new Error('En individual no hay lugares de pareja.');
      if (s.rallies > 0) throw new Error('Los lugares se eligen antes del primer saque del juego.');
      s.right[ev.side - 1] = ev.right;
      if (ev.side === s.server) s.serverPlayer = ev.right;
      break;
    case 'retire':
      assertSide(ev.side);
      playing(s);
      s.winner = other(ev.side);
      s.finish = 'retired';
      s.quitter = ev.side;
      break;
    case 'walkover':
      assertSide(ev.side);
      playing(s);
      if (s.games.length || s.rallies) throw new Error('Ya se jugaron puntos: usa «Retiro».');
      s.winner = other(ev.side);
      s.finish = 'walkover';
      s.quitter = ev.side;
      break;
    case 'correct':
      correct(s, ev);
      break;
    default:
      throw new Error('Jugada no válida para pickleball.');
  }
  return refresh(s);
}

function playing(s: PickleballState) {
  if (s.winner !== null) throw new Error('El partido ya terminó.');
}

function changeEnds(s: PickleballState) {
  s.leftSide = other(s.leftSide);
  s.changeEnds = true;
}

function rally(s: PickleballState, won: 'serving' | 'receiving') {
  const r = s.rules;
  const srv = s.server;
  const rcv = other(srv);
  s.rallies++;
  if (won === 'serving') {
    s.score[srv - 1]++;
    // El sacador cambia de lugar con su compañero y sigue sacando.
    if (r.doubles) s.right[srv - 1] = flip(s.right[srv - 1]);
    return scored(s, srv);
  }
  if (r.scoring === 'sideout') {
    if (r.doubles && s.serverNumber === 1) {
      s.serverNumber = 2;
      s.serverPlayer = flip(s.serverPlayer);
    } else {
      s.server = rcv;
      s.serverNumber = r.doubles ? 1 : null;
      s.serverPlayer = r.doubles ? s.right[rcv - 1] : 0;
    }
    return;
  }
  // Rally: el que recibe suma (salvo que sea su punto de juego y solo se gane sacando) y recupera el saque.
  const next: Pair<number> = [s.score[0], s.score[1]];
  next[rcv - 1]++;
  const blocked = r.gamePointOnServeOnly && raceWinner(r.gameTo, r.winBy, next) === rcv;
  if (!blocked) s.score = next;
  s.server = rcv;
  s.serverPlayer = r.doubles ? (s.score[rcv - 1] % 2 === 0 ? s.right[rcv - 1] : flip(s.right[rcv - 1])) : 0;
  if (!blocked) scored(s, rcv);
}

function scored(s: PickleballState, side: Side) {
  const r = s.rules;
  if (raceWinner(r.gameTo, r.winBy, s.score) === side) return gameOver(s, side);
  const deciding = s.games.length === r.bestOf - 1;
  if (deciding && r.switchAt !== null && !s.switched && Math.max(s.score[0], s.score[1]) >= r.switchAt) {
    s.switched = true;
    changeEnds(s);
  }
}

function gameOver(s: PickleballState, side: Side) {
  const r = s.rules;
  s.games.push([s.score[0], s.score[1]]);
  s.score = [0, 0];
  s.rallies = 0;
  if (s.games.filter((g) => (g[0] > g[1] ? 1 : 2) === side).length >= needed(r.bestOf)) {
    s.winner = side;
    s.finish = 'played';
    return;
  }
  // El juego siguiente lo empieza a sacar quien recibió primero en este.
  startGame(s, other(s.gameFirstServer));
  changeEnds(s);
}

function correct(s: PickleballState, ev: Extract<PickleballEvent, { type: 'correct' }>) {
  if (s.finish === 'retired' || s.finish === 'walkover') throw new Error('Primero deshaz el retiro o el W.O.');
  const r = s.rules;
  const games = normalizeGames(r, ev.games);
  const score = intPair(ev.score, 'Puntos del juego en curso no válidos.');
  for (const side of [ev.server, ev.leftSide]) if (side !== undefined) assertSide(side);
  if (ev.serverPlayer !== undefined) assertPlayer(ev.serverPlayer);
  if (ev.serverNumber !== undefined && ev.serverNumber !== 1 && ev.serverNumber !== 2) throw new Error('Número de sacador no válido.');
  if (ev.right !== undefined) for (const p of intPair(ev.right, 'Lugares no válidos.')) assertPlayer(p);
  const need = needed(r.bestOf);
  const wins = [1, 2].map((side) => games.filter((g) => (g[0] > g[1] ? 1 : 2) === side).length);
  const winner: Side | null = wins[0] >= need ? 1 : wins[1] >= need ? 2 : null;
  if (winner !== null) {
    if (score[0] || score[1]) throw new Error('El partido ya terminó con esos juegos: los puntos van 0-0.');
  } else if (!raceOpen(r.gameTo, r.winBy, score)) {
    throw new Error(`Puntos no válidos para el juego en curso: ${score[0]}-${score[1]}.`);
  }
  const sameGame = games.length === s.games.length;
  const fp = s.setup.firstPlayer;
  s.games = games;
  s.score = score;
  s.rallies = score[0] + score[1];
  s.winner = winner;
  s.finish = winner ? 'played' : null;
  s.quitter = null;
  s.gameFirstServer = games.length % 2 === 0 ? s.setup.firstServer : other(s.setup.firstServer);
  s.server = ev.server ?? (sameGame ? s.server : s.gameFirstServer);
  s.right = ev.right ? [ev.right[0], ev.right[1]] : [score[0] % 2 === 0 ? fp[0] : flip(fp[0]), score[1] % 2 === 0 ? fp[1] : flip(fp[1])];
  const i = s.server - 1;
  if (r.doubles && r.scoring === 'sideout') {
    s.serverNumber = ev.serverNumber ?? (s.rallies === 0 && s.server === s.gameFirstServer ? 2 : 1);
    s.serverPlayer = ev.serverPlayer ?? s.right[i];
  } else {
    s.serverNumber = null;
    s.serverPlayer = r.doubles ? (ev.serverPlayer ?? (score[i] % 2 === 0 ? s.right[i] : flip(s.right[i]))) : 0;
  }
  s.switched = games.length === r.bestOf - 1 && r.switchAt !== null && Math.max(score[0], score[1]) >= r.switchAt;
  const flips = games.length + (s.switched ? 1 : 0);
  s.leftSide = ev.leftSide ?? (flips % 2 === 0 ? s.setup.leftSide : other(s.setup.leftSide));
}

function refresh(s: PickleballState): PickleballState {
  const srv = s.server - 1;
  s.serveFrom = s.rules.doubles
    ? s.right[srv] === s.serverPlayer ? 'right' : 'left'
    : s.score[srv] % 2 === 0 ? 'right' : 'left';
  s.call = s.winner !== null ? '' : `${s.score[srv]}-${s.score[1 - srv]}${s.serverNumber !== null ? `-${s.serverNumber}` : ''}`;
  return s;
}

/** Marcador corto, siempre lado 1 primero: "11-7 9-11 11-5", "11-7 3-5 ret.", "W.O."; en curso agrega el juego actual. */
export function pickleballSummary(s: PickleballState): string {
  return gamesSummary(s);
}

export function pickleballResult(s: PickleballState): { winner: Side | null; summary: string } {
  return { winner: s.winner, summary: pickleballSummary(s) };
}

/** Motor de pickleball con reglas completas (ver `resolveRules` para partir de las de por defecto). */
export function pickleballEngine(rules: PickleballRules): MatchEngine<MatchSetup, PickleballState, PickleballEvent> {
  return {
    init: (setup) => initPickleball(rules, setup),
    apply: applyPickleball,
    isOver: (s) => s.winner !== null,
    result: pickleballResult,
  };
}
