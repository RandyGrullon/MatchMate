/**
 * Motor de ping pong (tenis de mesa, ITTF 2.11–2.14): juegos a 11 ganando por 2 (en 10-10 se sigue hasta sacar 2 de
 * ventaja), al mejor de 3, 5 o 7 juegos, individual o dobles. El conteo es siempre por rally: cada peloteo suma un
 * punto para quien lo gana.
 *
 * Saque: no depende de quién ganó el punto sino de los puntos jugados en el juego. Cada uno saca 2 puntos seguidos
 * y, desde el 10-10, uno cada uno: turno = jugados < 20 ? jugados / 2 : 10 + (jugados − 20) (ver `serveTurn`). En
 * individual, en los turnos pares saca quien empezó el juego. El juego siguiente lo empieza a sacar quien recibió
 * primero en el anterior (2.13.5).
 *
 * Dobles: un orden de 4 turnos A1→B1→A2→B2→A1 (cada uno le saca al que va después y recibe del que va antes), siempre
 * desde la mitad derecha y en diagonal. En cada juego la pareja que saca elige quién empieza; en el juego 1 la pareja
 * que recibe elige quién recibe primero, y desde el juego 2 recibe primero quien le sacó a ese sacador en el juego
 * anterior (2.14.3).
 *
 * Lados: se cambia al terminar cada juego y, en el juego decisivo (el último posible del partido), cuando alguien
 * llega a 5 puntos; en dobles, en ese momento la pareja que recibe cambia su orden de recepción (2.14.4).
 *
 * Canto del árbitro: primero los puntos de quien saca ("5-3").
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
  type Player,
  type TableTennisRules,
} from './rules';

/** Un turno de saque: quién saca. El que recibe es el del turno siguiente (dobles). */
export interface ServeSlot {
  side: Side;
  player: Player;
}

export type TableTennisEvent =
  /** Terminó un peloteo y lo ganó `side` (siempre suma: el ping pong es por rally). */
  | { type: 'point'; side: Side }
  /**
   * Dobles, antes del primer punto del juego: quién de la pareja `side` saca primero (si saca) o, solo en el juego 1,
   * quién recibe primero (si recibe). Desde el juego 2, quien recibe lo fija el juego anterior.
   */
  | { type: 'order'; side: Side; player: Player }
  | { type: 'retire'; side: Side }
  | { type: 'walkover'; side: Side }
  /**
   * Corrección del admin: juegos terminados y puntos del juego en curso. Lo que no se da se calcula así: si sigue el
   * mismo juego, se conserva quién lo empezó y el orden de dobles; si no, empieza el lado que toca por la paridad de
   * los juegos jugados, con la cadena de dobles por defecto desde el sorteo (las jugadas `order` se pierden). En el
   * juego decisivo, con 5 o más de alguno, ya se cambió de lado (y en dobles se cruzó la recepción cuando el que va
   * arriba llegó a 5). `server`, `serverPlayer` y `receiverPlayer` fijan quién saca y quién recibe el próximo punto;
   * `leftSide`, qué lado está a la izquierda.
   */
  | {
      type: 'correct';
      games: Pair<number>[];
      score: Pair<number>;
      server?: Side;
      serverPlayer?: Player;
      receiverPlayer?: Player;
      leftSide?: Side;
    };

export interface TableTennisState {
  sport: 'table_tennis';
  rules: TableTennisRules;
  setup: Required<MatchSetup>;
  /** Juegos terminados: puntos de cada lado. */
  games: Pair<number>[];
  /** Puntos del juego en curso. */
  score: Pair<number>;
  /** Lado que sacó primero en el juego en curso. */
  gameFirstServer: Side;
  /** Dobles: los 4 turnos del juego en curso (A1, B1, A2, B2), ya con el cruce del decisivo. Individual: []. */
  rotation: ServeSlot[];
  /** Dobles: `rotation` al empezar el juego (antes del cruce). De aquí sale el juego siguiente. */
  gameRotation: ServeSlot[];
  /** Ya se cambió de lado (y, en dobles, de orden de recepción) a mitad del juego decisivo. */
  switched: boolean;
  /** Qué lado está a la izquierda ahora (de la pantalla del anotador). */
  leftSide: Side;
  winner: Side | null;
  finish: Finish | null;
  quitter: Side | null;
  n: number;

  // ---- Vista: se recalcula en cada jugada (refresh) ----
  server: Side;
  serverPlayer: Player;
  /** Dobles: quién recibe (en individual, 0). */
  receiverPlayer: Player;
  /** Saques que le quedan a quien saca en este turno: 2 o 1 (desde 10-10, siempre 1). */
  servesLeft: 1 | 2;
  /** Dobles: siempre desde la mitad derecha y en diagonal. Individual: null (desde cualquier lado). */
  serveFrom: 'right' | null;
  /** Canto del árbitro: primero los puntos de quien saca ("5-3"). Vacío al terminar. */
  call: string;
  /** «Un saque cada uno» desde el 10-10; si no, null. */
  label: string | null;
  /** Aviso: cambiar de lado ahora (fin de juego o 5 puntos en el decisivo). */
  changeEnds: boolean;
  /** Dobles, juego decisivo: la pareja que recibe acaba de cambiar su orden de recepción. */
  receiveSwap: boolean;
}

// ---- Ayudas puras (también las usan las pruebas y el modo cancha) ----

/** Turno de saque del próximo punto con `played` puntos ya jugados: cada 2 puntos; desde 10-10, cada punto. */
export const serveTurn = (played: number, gameTo = 11): number => {
  const deuce = 2 * (gameTo - 1); // 20
  return played < deuce ? Math.floor(played / 2) : gameTo - 1 + (played - deuce);
};

/** Saques que le quedan a quien saca con `played` puntos ya jugados: 2 al empezar su turno, 1 en el segundo o desde 10-10. */
export const servesLeftAt = (played: number, gameTo = 11): 1 | 2 => (played >= 2 * (gameTo - 1) ? 1 : played % 2 === 0 ? 2 : 1);

/** Orden de un juego de dobles: [primer sacador, primer receptor, compañero del sacador, compañero del receptor]. */
export const rotationOf = (first: ServeSlot, receiver: ServeSlot): ServeSlot[] => [
  { side: first.side, player: first.player },
  { side: receiver.side, player: receiver.player },
  { side: first.side, player: flip(first.player) },
  { side: receiver.side, player: flip(receiver.player) },
];

/**
 * Juego siguiente: saca `player` (de la pareja que recibió primero en `prev`) y recibe quien le sacó a él en el juego
 * anterior (el turno de antes del suyo en `prev`).
 */
export function nextRotation(prev: readonly ServeSlot[], player: Player): ServeSlot[] {
  const side = prev[1].side;
  const i = prev.findIndex((x) => x.side === side && x.player === player);
  if (i < 0) throw new Error('El orden de saque no es válido.');
  return rotationOf({ side, player }, prev[(i + 3) % 4]);
}

/** Cruce del decisivo: la pareja que recibe el próximo punto (turno `turn`) cambia su orden de recepción. */
export const swapReceivers = (rot: readonly ServeSlot[], turn: number): ServeSlot[] => {
  const out = rot.map((x) => ({ side: x.side, player: x.player }));
  const a = (turn + 1) % 4;
  const b = (turn + 3) % 4;
  [out[a], out[b]] = [out[b], out[a]];
  return out;
};

/** Orden armado alrededor del turno `turn`: ahí saca `server` y recibe `receiver`; los compañeros en los dos siguientes. */
function rotationAround(turn: number, server: ServeSlot, receiver: ServeSlot): ServeSlot[] {
  const base = rotationOf(server, receiver);
  const out: ServeSlot[] = new Array(4);
  for (let j = 0; j < 4; j++) out[(turn + j) % 4] = base[j];
  return out;
}

/** Orden del juego 1 según el sorteo: saca `firstPlayer` del lado que saca y recibe `firstPlayer` del otro. */
function firstRotation(su: Required<MatchSetup>): ServeSlot[] {
  const f = su.firstServer;
  const r = other(f);
  return rotationOf({ side: f, player: su.firstPlayer[f - 1] }, { side: r, player: su.firstPlayer[r - 1] });
}

/** Cadena por defecto del juego `k` (0 = el primero): en cada juego saca primero quien recibió primero en el anterior. */
function defaultRotation(su: Required<MatchSetup>, k: number): ServeSlot[] {
  let rot = firstRotation(su);
  for (let i = 0; i < k; i++) rot = nextRotation(rot, rot[1].player);
  return rot;
}

const copyRotation = (rot: readonly ServeSlot[]): ServeSlot[] => rot.map((x) => ({ side: x.side, player: x.player }));
const gamesWon = (games: readonly Pair<number>[], side: Side) => games.filter((g) => (g[0] > g[1] ? 1 : 2) === side).length;
const isDeciding = (s: Pick<TableTennisState, 'games' | 'rules'>) => s.games.length === s.rules.bestOf - 1;

// ---- Motor ----

export function initTableTennis(rules: TableTennisRules, setup?: MatchSetup): TableTennisState {
  const errors = validateRules(rules);
  if (errors.length || rules.sport !== 'table_tennis') throw new Error(errors.join(' ') || 'Reglas no válidas.');
  const su = resolveSetup(setup, rules.doubles);
  const rot = rules.doubles ? firstRotation(su) : [];
  const s: TableTennisState = {
    sport: 'table_tennis',
    rules: { ...rules },
    setup: su,
    games: [],
    score: [0, 0],
    gameFirstServer: su.firstServer,
    rotation: rot,
    gameRotation: copyRotation(rot),
    switched: false,
    leftSide: su.leftSide,
    winner: null,
    finish: null,
    quitter: null,
    n: 0,
    server: su.firstServer,
    serverPlayer: 0,
    receiverPlayer: 0,
    servesLeft: 2,
    serveFrom: null,
    call: '',
    label: null,
    changeEnds: false,
    receiveSwap: false,
  };
  return refresh(s);
}

export function applyTableTennis(state: TableTennisState, ev: TableTennisEvent): TableTennisState {
  if (!ev || typeof ev !== 'object') throw new Error('Jugada no válida.');
  const s = structuredClone(state);
  s.n++;
  s.changeEnds = false;
  s.receiveSwap = false;
  switch (ev.type) {
    case 'point':
      assertSide(ev.side);
      playing(s);
      point(s, ev.side);
      break;
    case 'order':
      assertSide(ev.side);
      assertPlayer(ev.player);
      playing(s);
      order(s, ev.side, ev.player);
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
      if (s.games.length || s.score[0] + s.score[1]) throw new Error('Ya se jugaron puntos: usa «Retiro».');
      s.winner = other(ev.side);
      s.finish = 'walkover';
      s.quitter = ev.side;
      break;
    case 'correct':
      correct(s, ev);
      break;
    default:
      throw new Error('Jugada no válida para ping pong.');
  }
  return refresh(s);
}

function playing(s: TableTennisState) {
  if (s.winner !== null) throw new Error('El partido ya terminó.');
}

function changeEnds(s: TableTennisState) {
  s.leftSide = other(s.leftSide);
  s.changeEnds = true;
}

function point(s: TableTennisState, side: Side) {
  const r = s.rules;
  s.score[side - 1]++;
  if (raceWinner(r.gameTo, r.winBy, s.score) === side) return gameOver(s, side);
  // Juego decisivo: cambio de lado cuando alguien llega a 5 (una sola vez) y, en dobles, cruce de la recepción.
  if (isDeciding(s) && r.switchAt !== null && !s.switched && Math.max(s.score[0], s.score[1]) >= r.switchAt) {
    s.switched = true;
    changeEnds(s);
    if (r.doubles) {
      s.rotation = swapReceivers(s.rotation, serveTurn(s.score[0] + s.score[1], r.gameTo));
      s.receiveSwap = true;
    }
  }
}

function gameOver(s: TableTennisState, side: Side) {
  const r = s.rules;
  s.games.push([s.score[0], s.score[1]]);
  s.score = [0, 0];
  if (gamesWon(s.games, side) >= needed(r.bestOf)) {
    s.winner = side;
    s.finish = 'played';
    return;
  }
  // El juego siguiente lo empieza a sacar quien recibió primero en este (y en dobles, por defecto, ese mismo jugador).
  s.gameFirstServer = other(s.gameFirstServer);
  if (r.doubles) {
    s.gameRotation = nextRotation(s.gameRotation, s.gameRotation[1].player);
    s.rotation = copyRotation(s.gameRotation);
  }
  s.switched = false;
  changeEnds(s);
}

function order(s: TableTennisState, side: Side, player: Player) {
  if (!s.rules.doubles) throw new Error('En individual no hay orden de pareja.');
  if (s.score[0] + s.score[1] > 0) throw new Error('El orden se elige antes del primer saque del juego.');
  const rot = s.rotation;
  const firstGame = s.games.length === 0;
  if (side === rot[0].side) {
    if (firstGame) s.rotation = rotationOf({ side, player }, rot[1]);
    // Desde el juego 2 el receptor lo fija el juego anterior: elegir al compañero corre la rotación 2 lugares.
    else if (player !== rot[0].player) s.rotation = [rot[2], rot[3], rot[0], rot[1]];
  } else {
    if (!firstGame) throw new Error('En este juego recibe primero quien le sacó en el juego anterior.');
    s.rotation = rotationOf(rot[0], { side, player });
  }
  s.gameRotation = copyRotation(s.rotation);
}

function correct(s: TableTennisState, ev: Extract<TableTennisEvent, { type: 'correct' }>) {
  if (s.finish === 'retired' || s.finish === 'walkover') throw new Error('Primero deshaz el retiro o el W.O.');
  const r = s.rules;
  const games = normalizeGames(r, ev.games);
  const score = intPair(ev.score, 'Puntos del juego en curso no válidos.');
  for (const side of [ev.server, ev.leftSide]) if (side !== undefined) assertSide(side);
  for (const p of [ev.serverPlayer, ev.receiverPlayer]) if (p !== undefined) assertPlayer(p);
  const need = needed(r.bestOf);
  const winner: Side | null = gamesWon(games, 1) >= need ? 1 : gamesWon(games, 2) >= need ? 2 : null;
  if (winner !== null) {
    if (score[0] || score[1]) throw new Error('El partido ya terminó con esos juegos: los puntos van 0-0.');
  } else if (!raceOpen(r.gameTo, r.winBy, score)) {
    throw new Error(`Puntos no válidos para el juego en curso: ${score[0]}-${score[1]}.`);
  }
  // Sigue el mismo juego (el partido estaba en curso y no cambió cuántos juegos van): se conserva quién lo empezó.
  const sameGame = s.winner === null && winner === null && games.length === s.games.length;
  let firstServer: Side = sameGame ? s.gameFirstServer : games.length % 2 === 0 ? s.setup.firstServer : other(s.setup.firstServer);
  let gameRotation = r.doubles ? (sameGame ? copyRotation(s.gameRotation) : defaultRotation(s.setup, games.length)) : [];
  const switched = winner === null && games.length === r.bestOf - 1 && r.switchAt !== null && Math.max(score[0], score[1]) >= r.switchAt;
  // Cruce supuesto: cuando el que va arriba llegó a 5, con el otro en lo suyo (4 como mucho).
  const crossTurn = r.switchAt === null ? 0 : serveTurn(r.switchAt + Math.min(score[0], score[1], r.switchAt - 1), r.gameTo);
  let rotation: ServeSlot[] = [];
  if (r.doubles) {
    // Si el cruce ya pasó en este mismo juego, se conserva el de verdad.
    rotation = sameGame && switched && s.switched ? copyRotation(s.rotation) : switched ? swapReceivers(gameRotation, crossTurn) : copyRotation(gameRotation);
  }
  const k = serveTurn(score[0] + score[1], r.gameTo);
  if (ev.server !== undefined || (r.doubles && (ev.serverPlayer !== undefined || ev.receiverPlayer !== undefined))) {
    if (r.doubles) {
      const cur = rotation[k % 4];
      const rcv = rotation[(k + 1) % 4];
      const side = ev.server ?? cur.side;
      const keep = side === cur.side;
      const sp = ev.serverPlayer ?? (keep ? cur.player : rcv.player);
      const rp = ev.receiverPlayer ?? (keep ? rcv.player : cur.player);
      rotation = rotationAround(k, { side, player: sp }, { side: other(side), player: rp });
      gameRotation = switched ? swapReceivers(rotation, crossTurn) : copyRotation(rotation);
      firstServer = rotation[0].side;
    } else {
      const side = ev.server as Side;
      firstServer = k % 2 === 0 ? side : other(side);
    }
  }
  s.games = games;
  s.score = score;
  s.winner = winner;
  s.finish = winner ? 'played' : null;
  s.quitter = null;
  s.gameFirstServer = firstServer;
  s.rotation = rotation;
  s.gameRotation = gameRotation;
  s.switched = switched;
  const flips = games.length + (switched ? 1 : 0);
  s.leftSide = ev.leftSide ?? (flips % 2 === 0 ? s.setup.leftSide : other(s.setup.leftSide));
}

function refresh(s: TableTennisState): TableTennisState {
  const r = s.rules;
  const played = s.score[0] + s.score[1];
  const turn = serveTurn(played, r.gameTo);
  if (r.doubles) {
    const srv = s.rotation[turn % 4];
    s.server = srv.side;
    s.serverPlayer = srv.player;
    s.receiverPlayer = s.rotation[(turn + 1) % 4].player;
  } else {
    s.server = turn % 2 === 0 ? s.gameFirstServer : other(s.gameFirstServer);
    s.serverPlayer = 0;
    s.receiverPlayer = 0;
  }
  s.servesLeft = servesLeftAt(played, r.gameTo);
  s.serveFrom = r.doubles ? 'right' : null;
  const i = s.server - 1;
  s.call = s.winner !== null ? '' : `${s.score[i]}-${s.score[1 - i]}`;
  s.label = s.winner === null && s.score[0] >= r.gameTo - 1 && s.score[1] >= r.gameTo - 1 ? 'Un saque cada uno' : null;
  return s;
}

/** Marcador corto, siempre lado 1 primero: "11-7 9-11 11-5 11-8", "11-7 3-5 ret.", "W.O."; en curso agrega el juego actual. */
export function tableTennisSummary(s: TableTennisState): string {
  return gamesSummary(s);
}

export function tableTennisResult(s: TableTennisState): { winner: Side | null; summary: string } {
  return { winner: s.winner, summary: tableTennisSummary(s) };
}

/** Motor de ping pong con reglas completas (ver `resolveRules` para partir de las de por defecto). */
export function tableTennisEngine(rules: TableTennisRules): MatchEngine<MatchSetup, TableTennisState, TableTennisEvent> {
  return {
    init: (setup) => initTableTennis(rules, setup),
    apply: applyTableTennis,
    isOver: (s) => s.winner !== null,
    result: tableTennisResult,
  };
}
