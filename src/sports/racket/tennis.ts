/**
 * Motor de tenis y pádel: puntos (0-15-30-40, ventaja, sin ventaja, punto de oro, Star Point), juegos, sets
 * con tie-break, súper tie-break, saque (individual y rotación de dobles) y cambios de lado.
 *
 * El partido es la lista de jugadas; el estado es JSON plano (se guarda o se publica tal cual y otro teléfono
 * sigue desde ahí). Los campos de "vista" (server, display, label…) se recalculan en cada jugada.
 *
 * Saque: el lado que saca cambia cada juego en todo el partido (el tie-break cuenta como un juego del que saca
 * su primer punto). En dobles cada pareja alterna a sus dos jugadores en sus juegos de saque: A1, B1, A2, B2.
 * En el tie-break saca 1 punto el que le toca y luego cada lado saca 2 seguidos, siguiendo esa rotación.
 * Lados: se cambia tras los juegos impares de cada set (1, 3, 5…; el tie-break cuenta como juego) y cada
 * 6 puntos dentro del tie-break.
 */
import type { MatchEngine, Side } from '../types';
import {
  assertPlayer,
  assertSide,
  flip,
  intPair,
  needed,
  normalizeSets,
  other,
  resolveSetup,
  setOpen,
  validateRules,
  type DeuceRule,
  type Finish,
  type MatchSetup,
  type Pair,
  type Player,
  type SetScore,
  type TennisRules,
} from './rules';

export type TennisEvent =
  /** Punto para `side`. */
  | { type: 'point'; side: Side }
  /** Dobles: qué jugador de la pareja saca primero en este set (al empezar el set, antes de su primer juego de saque). */
  | { type: 'order'; side: Side; player: Player }
  /** `side` se retira: gana el otro y se guarda el marcador de ese momento. */
  | { type: 'retire'; side: Side }
  /** `side` no se presentó (solo antes del primer punto). */
  | { type: 'walkover'; side: Side }
  /**
   * Corrección del admin: fija los sets terminados y los juegos del set en curso; el juego en curso vuelve a 0-0.
   * Si no se dan, quién saca y los lados se calculan con los juegos jugados desde el sorteo.
   * `serverPlayer` (dobles) fija qué jugador de la pareja que saca tiene el próximo juego.
   */
  | { type: 'correct'; sets: (SetScore | Pair<number>)[]; games: Pair<number>; server?: Side; serverPlayer?: Player; leftSide?: Side };

export interface TennisState {
  sport: 'tennis' | 'padel';
  rules: TennisRules;
  setup: Required<MatchSetup>;
  /** Sets terminados. */
  sets: SetScore[];
  /** Juegos del set en curso. */
  games: Pair<number>;
  /** Puntos del juego en curso, en números (0, 1, 2, 3, 4…); en el tie-break, los puntos del tie-break. */
  points: Pair<number>;
  /** El juego en curso es un tie-break. */
  tiebreak: boolean;
  /** …y es el súper tie-break que reemplaza al set decisivo. */
  matchTiebreak: boolean;
  /** Lado que tiene el juego en curso (en el tie-break, el que sacó el primer punto). */
  gameServer: Side;
  /** Por pareja: qué jugador saca el próximo juego de saque de esa pareja. */
  nextPlayer: Pair<Player>;
  /** Qué lado está a la izquierda ahora (de la pantalla del anotador). */
  leftSide: Side;
  /** Puntos ganados en todo el partido (tie-breaks incluidos). */
  won: Pair<number>;
  winner: Side | null;
  finish: Finish | null;
  /** Quién se retiró o no se presentó. */
  quitter: Side | null;
  /** Jugadas aplicadas. */
  n: number;

  // ---- Vista: se recalcula en cada jugada ----
  /** Lado que saca este punto. */
  server: Side;
  /** Jugador de esa pareja que saca (en individual, 0). */
  serverPlayer: Player;
  /** Desde qué lado se saca: 'right' (iguales/deuce) o 'left' (ventaja). null = punto decisivo, elige el que recibe. */
  serveFrom: 'right' | 'left' | null;
  /** Marcador del juego por lado: '0', '15', '30', '40', 'AD' (en el tie-break, números). */
  display: Pair<string>;
  /** "15-30", "40-40", "AD-40", "5-3" en tie-break. */
  pointsText: string;
  /** Aviso del punto: 'Iguales', 'Ventaja', 'Punto de oro', 'Punto decisivo', 'Star point', 'Tie-break', 'Súper tie-break'. */
  label: string | null;
  /** Veces que el juego llegó a 40-40 (Star Point: con `rules.starAdvantages` + 1 se juega el punto decisivo). */
  deuces: number;
  /** Este punto decide el juego a 40-40 (sin ventaja, punto de oro o Star Point): el que recibe elige lado. */
  decidingPoint: boolean;
  /** Aviso: cambiar de lado ahora (lo causó la última jugada). */
  changeEnds: boolean;
}

const PTS = ['0', '15', '30', '40'];
const DECIDING: Record<DeuceRule, string> = { ad: 'Iguales', noad: 'Punto decisivo', golden: 'Punto de oro', star: 'Star point' };

/** Con a-b en el juego (sin tie-break), el próximo punto decide el juego a 40-40. */
function isDeciding(r: TennisRules, a: number, b: number): boolean {
  if (a !== b || a < 3) return false;
  if (r.deuce === 'noad' || r.deuce === 'golden') return true;
  // Star Point: 3-3 es la 1.ª vez en iguales, 4-4 la 2.ª… pasada la última ventaja, punto decisivo.
  return r.deuce === 'star' && a - 2 > r.starAdvantages;
}

export function initTennis(rules: TennisRules, setup?: MatchSetup): TennisState {
  const errors = validateRules(rules);
  if (errors.length || (rules.sport !== 'tennis' && rules.sport !== 'padel')) throw new Error(errors.join(' ') || 'Reglas no válidas.');
  const su = resolveSetup(setup, rules.doubles);
  return refresh({
    sport: rules.sport,
    rules: { ...rules },
    setup: su,
    sets: [],
    games: [0, 0],
    points: [0, 0],
    tiebreak: false,
    matchTiebreak: false,
    gameServer: su.firstServer,
    nextPlayer: [su.firstPlayer[0], su.firstPlayer[1]],
    leftSide: su.leftSide,
    won: [0, 0],
    winner: null,
    finish: null,
    quitter: null,
    n: 0,
    server: su.firstServer,
    serverPlayer: 0,
    serveFrom: 'right',
    display: ['0', '0'],
    pointsText: '0-0',
    label: null,
    deuces: 0,
    decidingPoint: false,
    changeEnds: false,
  });
}

export function applyTennis(state: TennisState, ev: TennisEvent): TennisState {
  if (!ev || typeof ev !== 'object') throw new Error('Jugada no válida.');
  const s = structuredClone(state);
  s.n++;
  s.changeEnds = false;
  switch (ev.type) {
    case 'point':
      assertSide(ev.side);
      playing(s);
      point(s, ev.side);
      break;
    case 'order':
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
      if (s.sets.length || s.games[0] || s.games[1] || s.won[0] || s.won[1]) throw new Error('Ya se jugaron puntos: usa «Retiro».');
      s.winner = other(ev.side);
      s.finish = 'walkover';
      s.quitter = ev.side;
      break;
    case 'correct':
      correct(s, ev);
      break;
    default:
      throw new Error('Jugada no válida para tenis o pádel.');
  }
  return refresh(s);
}

function playing(s: TennisState) {
  if (s.winner !== null) throw new Error('El partido ya terminó.');
}

function changeEnds(s: TennisState) {
  s.leftSide = other(s.leftSide);
  s.changeEnds = true;
}

function point(s: TennisState, side: Side) {
  const r = s.rules;
  const i = side - 1;
  s.won[i]++;
  s.points[i]++;
  const a = s.points[i];
  const b = s.points[1 - i];
  if (s.tiebreak) {
    const to = s.matchTiebreak ? r.finalTiebreakTo : r.tiebreakTo;
    const by = s.matchTiebreak ? 2 : r.tiebreakWinBy;
    if (a >= to && a - b >= by) return gameWon(s, side);
    if ((a + b) % 6 === 0) changeEnds(s);
    return;
  }
  if (isDeciding(r, a - 1, b) || (a >= 4 && a - b >= 2)) gameWon(s, side);
}

function gameWon(s: TennisState, side: Side) {
  const r = s.rules;
  const wasTiebreak = s.tiebreak;
  const tbPoints: Pair<number> = [s.points[0], s.points[1]];
  s.games[side - 1]++;
  if (r.doubles) s.nextPlayer[s.gameServer - 1] = flip(s.nextPlayer[s.gameServer - 1]);
  s.gameServer = other(s.gameServer);
  s.points = [0, 0];
  s.tiebreak = false;
  const inSet = s.games[0] + s.games[1];
  const [g, o] = side === 1 ? s.games : [s.games[1], s.games[0]];
  const setDone = wasTiebreak || (g >= r.gamesPerSet && g - o >= 2);
  if (setDone) {
    const set: SetScore = { games: [s.games[0], s.games[1]] };
    if (wasTiebreak) set.tiebreak = tbPoints;
    if (s.matchTiebreak) set.matchTiebreak = true;
    s.sets.push(set);
    s.games = [0, 0];
    s.matchTiebreak = false;
    if (s.sets.filter((x) => (x.games[0] > x.games[1] ? 1 : 2) === side).length >= needed(r.bestOf)) {
      s.winner = side;
      s.finish = 'played';
      return;
    }
    if (r.finalSet === 'tiebreak' && s.sets.length === r.bestOf - 1) {
      s.tiebreak = true;
      s.matchTiebreak = true;
    }
  } else if (r.tiebreakAt !== null && s.games[0] === r.tiebreakAt && s.games[1] === r.tiebreakAt) {
    s.tiebreak = true;
  }
  // Juego impar del set (contando el que acaba de cerrar el set): cambio de lado.
  if (inSet % 2 === 1) changeEnds(s);
}

function order(s: TennisState, side: Side, player: Player) {
  assertSide(side);
  assertPlayer(player);
  playing(s);
  if (!s.rules.doubles) throw new Error('En individual no hay orden de saque.');
  const g = s.games[0] + s.games[1];
  const fresh = s.points[0] === 0 && s.points[1] === 0 && (!s.tiebreak || s.matchTiebreak);
  if (!fresh || !(g === 0 || (g === 1 && side === s.gameServer))) {
    throw new Error('El orden de saque de cada pareja se elige al empezar el set, antes de su primer juego de saque.');
  }
  s.nextPlayer[side - 1] = player;
}

/** Cambios de lado desde el sorteo hasta este marcador (para la corrección del admin). */
function endChanges(sets: SetScore[], games: Pair<number>): number {
  let n = Math.ceil((games[0] + games[1]) / 2);
  for (const x of sets) {
    n += Math.ceil((x.games[0] + x.games[1]) / 2);
    if (x.tiebreak) n += Math.max(0, Math.floor((x.tiebreak[0] + x.tiebreak[1] - 1) / 6));
  }
  return n;
}

function correct(s: TennisState, ev: Extract<TennisEvent, { type: 'correct' }>) {
  if (s.finish === 'retired' || s.finish === 'walkover') throw new Error('Primero deshaz el retiro o el W.O.');
  const r = s.rules;
  const sets = normalizeSets(r, ev.sets);
  const games = intPair(ev.games, 'Juegos del set en curso no válidos.');
  if (ev.server !== undefined) assertSide(ev.server);
  if (ev.leftSide !== undefined) assertSide(ev.leftSide);
  if (ev.serverPlayer !== undefined) assertPlayer(ev.serverPlayer);
  const need = needed(r.bestOf);
  const wins = [1, 2].map((side) => sets.filter((x) => (x.games[0] > x.games[1] ? 1 : 2) === side).length);
  const winner: Side | null = wins[0] >= need ? 1 : wins[1] >= need ? 2 : null;
  const mtb = winner === null && r.finalSet === 'tiebreak' && sets.length === r.bestOf - 1;
  if (winner !== null || mtb) {
    if (games[0] || games[1]) throw new Error(winner ? 'El partido ya terminó con esos sets: los juegos van 0-0.' : 'El set decisivo es súper tie-break: los juegos van 0-0.');
  } else if (!setOpen(r, games)) {
    throw new Error(`Juegos no válidos para el set en curso: ${games[0]}-${games[1]}.`);
  }
  s.sets = sets;
  s.games = games;
  s.points = [0, 0];
  s.matchTiebreak = mtb;
  s.tiebreak = mtb || (r.tiebreakAt !== null && games[0] === r.tiebreakAt && games[1] === r.tiebreakAt);
  s.winner = winner;
  s.finish = winner ? 'played' : null;
  s.quitter = null;
  const played = sets.reduce((t, x) => t + x.games[0] + x.games[1], 0) + games[0] + games[1];
  s.gameServer = ev.server ?? (played % 2 === 0 ? s.setup.firstServer : other(s.setup.firstServer));
  if (ev.serverPlayer !== undefined && r.doubles) s.nextPlayer[s.gameServer - 1] = ev.serverPlayer;
  s.leftSide = ev.leftSide ?? (endChanges(sets, games) % 2 === 0 ? s.setup.leftSide : other(s.setup.leftSide));
}

/** Recalcula los campos de vista. */
function refresh(s: TennisState): TennisState {
  const r = s.rules;
  const [a, b] = s.points;
  if (s.tiebreak) {
    const k = a + b;
    // Turno de saque: el punto 1 es el turno 0, los puntos 2-3 el turno 1, 4-5 el turno 2…
    const turn = k === 0 ? 0 : Math.floor((k + 1) / 2);
    const team = turn % 2 === 0 ? s.gameServer : other(s.gameServer);
    s.server = team;
    s.serverPlayer = r.doubles ? (((s.nextPlayer[team - 1] + Math.floor(turn / 2)) % 2) as Player) : 0;
    s.serveFrom = k % 2 === 0 ? 'right' : 'left';
    s.display = [String(a), String(b)];
    s.deuces = 0;
    s.decidingPoint = false;
    s.label = s.matchTiebreak ? 'Súper tie-break' : 'Tie-break';
  } else {
    s.server = s.gameServer;
    s.serverPlayer = r.doubles ? s.nextPlayer[s.gameServer - 1] : 0;
    s.decidingPoint = isDeciding(r, a, b);
    s.deuces = Math.min(a, b) >= 3 ? Math.min(a, b) - 2 : 0;
    s.serveFrom = s.decidingPoint ? null : (a + b) % 2 === 0 ? 'right' : 'left';
    s.display = a >= 3 && b >= 3 ? (a === b ? ['40', '40'] : a > b ? ['AD', '40'] : ['40', 'AD']) : [PTS[a], PTS[b]];
    s.label = s.decidingPoint ? DECIDING[r.deuce] : a >= 3 && b >= 3 ? (a === b ? 'Iguales' : 'Ventaja') : null;
  }
  s.pointsText = `${s.display[0]}-${s.display[1]}`;
  if (s.winner !== null) {
    s.serveFrom = null;
    s.label = null;
    s.decidingPoint = false;
  }
  return s;
}

/** Texto de un set: "6-4", "7-6(5)" (puntos del que perdió el tie-break), "10-7" en súper tie-break. */
export function setText(set: SetScore): string {
  if (set.matchTiebreak && set.tiebreak) return `${set.tiebreak[0]}-${set.tiebreak[1]}`;
  const base = `${set.games[0]}-${set.games[1]}`;
  return set.tiebreak ? `${base}(${Math.min(set.tiebreak[0], set.tiebreak[1])})` : base;
}

/** Marcador corto, siempre lado 1 primero: "6-4 3-6 10-7", "6-4 3-2 ret.", "W.O."; en curso agrega el set actual. */
export function tennisSummary(s: TennisState): string {
  if (s.finish === 'walkover') return 'W.O.';
  const parts = s.sets.map(setText);
  if (s.finish !== 'played') {
    const [g0, g1] = s.games;
    const [p0, p1] = s.points;
    if (s.matchTiebreak) {
      if (p0 + p1 > 0) parts.push(`${p0}-${p1}`);
    } else if (g0 + g1 + p0 + p1 > 0 || (!parts.length && s.finish === null)) {
      parts.push(`${g0}-${g1}`);
    }
    if (s.finish === 'retired') parts.push('ret.');
  }
  return parts.join(' ');
}

export function tennisResult(s: TennisState): { winner: Side | null; summary: string } {
  return { winner: s.winner, summary: tennisSummary(s) };
}

/** Motor de tenis o pádel con reglas completas (ver `resolveRules` para partir de las de por defecto). */
export function tennisEngine(rules: TennisRules): MatchEngine<MatchSetup, TennisState, TennisEvent> {
  return {
    init: (setup) => initTennis(rules, setup),
    apply: applyTennis,
    isOver: (s) => s.winner !== null,
    result: tennisResult,
  };
}
