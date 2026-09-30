/**
 * Mesa de ping pong, sin React: el adaptador del motor para el modo cancha y lo que se muestra: quién saca y quién
 * recibe, cuántos saques le quedan («2.º saque»), el «Un saque cada uno» desde el 10-10, punto de juego y de
 * partido, el cambio de lado (fin de juego y a los 5 del decisivo) y, en dobles, el cruce de la recepción en el
 * decisivo. Puro.
 */
import type { CourtAdapter } from '../../../../court';
import { needed, tableTennisEngine, type MatchSetup, type Player, type TableTennisEvent, type TableTennisRules, type TableTennisState } from '../../../../sports/racket';
import type { Side } from '../../../../sports/types';
import { racketScore } from '../../racket/court/adapters';

const total = (s: Pick<TableTennisState, 'score'>) => s.score[0] + s.score[1];
/** Los dos llegaron a 10 (a 11): desde ahí, un saque cada uno y se gana por 2. */
const isDeuce = (s: Pick<TableTennisState, 'score' | 'rules'>) => s.score[0] >= s.rules.gameTo - 1 && s.score[1] >= s.rules.gameTo - 1;

/**
 * Adaptador del modo cancha. Publica al terminar cada juego, cada 4 puntos anotados, al llegar a 10-10 y al
 * terminar; nunca por cada punto. Si no, la máquina publica como mucho cada minuto.
 */
export function tableTennisAdapter(rules: TableTennisRules): CourtAdapter<MatchSetup, TableTennisState, TableTennisEvent> {
  return {
    engine: tableTennisEngine(rules),
    score: racketScore,
    milestone: (prev, next) =>
      next.winner !== null ||
      prev.games.length !== next.games.length ||
      (isDeuce(next) && !isDeuce(prev)) ||
      (total(next) !== total(prev) && total(next) > 0 && total(next) % 4 === 0),
  };
}

export interface TtView {
  /** Lado que saca el próximo punto. */
  serving: Side;
  /** Quién saca: en dobles el jugador; en individual, el nombre del lado. */
  serverName: string;
  /** Dobles: quién recibe (de la otra pareja). Individual: null. */
  receiverName: string | null;
  /** Saques que le quedan en su turno: 2 (el 1.º de los dos) o 1 (el 2.º, o uno cada uno desde 10-10). */
  servesLeft: 1 | 2;
  /** 10-10 o más: un saque cada uno y se gana por 2. */
  deuce: boolean;
  /** El lado que gana el juego si gana el próximo punto (null = nadie). */
  gamePoint: Side | null;
  /** El lado que gana el partido si gana el próximo punto. */
  matchPoint: Side | null;
  /** Juegos terminados como texto («11-7») y puntos del juego que va. */
  done: string[];
  now: [number, number];
  /** Juegos ganados por cada lado. */
  gamesWon: [number, number];
  /**
   * Para la cabecera de la mesa: juegos ganados y juegos terminados con el lado de la izquierda primero, como las
   * mitades (en ping pong se cambia de lado en cada juego: con el lado 1 siempre primero se leería al revés).
   */
  gamesLeft: [number, number];
  doneLeft: string[];
  /** Juego que se juega (1 a 7) y si es el decisivo. */
  gameNo: number;
  deciding: boolean;
  /** Aviso de cambio de lado (fin de juego o 5 puntos en el decisivo). */
  switchNow: boolean;
  /** Dobles, decisivo: la pareja que recibe acaba de cambiar su orden de recepción. */
  receiveSwap: boolean;
  /** Con `receiveSwap`: quién recibe ahora (después del cruce). */
  nextReceiver: string | null;
  /** Dobles, antes del primer punto del juego: se puede elegir el orden (quién saca; en el juego 1, quién recibe). */
  canOrder: boolean;
  over: boolean;
  winner: Side | null;
}

/** Lo que se muestra en la mesa. `people[i]` = nombres de los jugadores del lado i (en su orden: 0 y 1). */
export function ttView(s: TableTennisState, people: readonly (readonly string[])[], labels: readonly [string, string]): TtView {
  const r = s.rules;
  const nameOf = (side: Side, p: Player) => people[side - 1]?.[p] ?? `Jugador ${p + 1}`;
  const receiving: Side = s.server === 1 ? 2 : 1;
  const receiverName = r.doubles ? nameOf(receiving, s.receiverPlayer) : null;
  const gamesWon: [number, number] = [0, 0];
  for (const g of s.games) gamesWon[g[0] > g[1] ? 0 : 1]++;
  const need = needed(r.bestOf);
  const over = s.winner !== null;
  // Punto de juego: con 10 o más y adelante (a 11 ganando por 2, un punto más cierra el juego).
  const gp = ([1, 2] as const).find((side) => {
    const [mine, theirs] = [s.score[side - 1], s.score[2 - side]];
    return mine >= r.gameTo - 1 && mine - theirs >= r.winBy - 1;
  });
  const gamePoint = !over && gp !== undefined ? gp : null;
  return {
    serving: s.server,
    serverName: r.doubles ? nameOf(s.server, s.serverPlayer) : labels[s.server - 1],
    receiverName,
    servesLeft: s.servesLeft,
    deuce: !over && isDeuce(s),
    gamePoint,
    matchPoint: gamePoint !== null && gamesWon[gamePoint - 1] === need - 1 ? gamePoint : null,
    done: s.games.map((g) => `${g[0]}-${g[1]}`),
    now: [s.score[0], s.score[1]],
    gamesWon,
    gamesLeft: leftFirst(s.leftSide, gamesWon),
    doneLeft: s.games.map((g) => leftFirst(s.leftSide, g).join('-')),
    gameNo: Math.min(s.games.length + 1, r.bestOf),
    deciding: s.games.length === r.bestOf - 1,
    switchNow: s.changeEnds,
    receiveSwap: s.receiveSwap,
    nextReceiver: s.receiveSwap ? receiverName : null,
    canOrder: r.doubles && !over && total(s) === 0,
    over,
    winner: s.winner,
  };
}

const leftFirst = (left: Side, [a, b]: readonly [number, number]): [number, number] => (left === 1 ? [a, b] : [b, a]);

/** Marcador de juegos visto desde `side`: el lado 2 lee «7-11 7-11 3-5 ret.» como «11-7 11-7 5-3 ret.». */
export const scoreFrom = (text: string, side: Side): string => (side === 1 ? text : text.replace(/(\d{1,2})-(\d{1,2})/g, '$2-$1'));

/**
 * Al terminar: «Gana Ana» (en dobles, «Ganan Ana / Luis») y el marcador del lado del ganador, como en «Solo el
 * resultado» (un 3-0 del lado 2 no se lee «7-11 7-11 7-11»).
 */
export function winnerText(winner: Side, labels: readonly [string, string], summary: string, doubles: boolean): { who: string; score: string } {
  return { who: `${doubles ? 'Ganan' : 'Gana'} ${labels[winner - 1]}`, score: scoreFrom(summary, winner) };
}

/** «2 saques», «2.º saque» o, desde el 10-10, «1 saque». */
export function servesText(v: Pick<TtView, 'servesLeft' | 'deuce'>): string {
  if (v.deuce) return '1 saque';
  return v.servesLeft === 2 ? '2 saques' : '2.º saque';
}
