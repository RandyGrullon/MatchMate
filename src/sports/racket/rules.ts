/**
 * Reglas de los deportes de raqueta (tenis, pádel, pickleball y ping pong): tipos, valores por defecto, plantillas,
 * validación y las cuentas de "¿este set o juego ya terminó?" que usan los motores y el modo «solo resultado».
 * Todo puro: sin React, sin backend.
 */
import type { Side } from '../types';

export type RacketSport = 'tennis' | 'padel' | 'pickleball' | 'table_tennis';
export const RACKET_SPORTS: readonly RacketSport[] = ['tennis', 'padel', 'pickleball', 'table_tennis'];

/** Par de valores [lado 1, lado 2]. */
export type Pair<T> = [T, T];
/** Jugador dentro de su pareja (0 o 1). En individual siempre es 0. */
export type Player = 0 | 1;

/**
 * Qué pasa en 40-40:
 * - 'ad': ventaja (hay que ganar por 2);
 * - 'noad': sin ventaja, un punto decisivo (tenis);
 * - 'golden': punto de oro (pádel), igual que 'noad' pero con su nombre;
 * - 'star': Star Point de la FIP 2026: se juegan hasta `starAdvantages` ventajas y luego un punto decisivo.
 * En todo punto decisivo la pareja (o el jugador) que recibe elige el lado.
 */
export type DeuceRule = 'ad' | 'noad' | 'golden' | 'star';

/** Reglas de tenis y pádel (el mismo motor de puntos, juegos y sets). */
export interface TennisRules {
  sport: 'tennis' | 'padel';
  /** Dobles (en pádel siempre). */
  doubles: boolean;
  deuce: DeuceRule;
  /** Star Point: cuántas ventajas se juegan antes del punto decisivo (FIP: 2). */
  starAdvantages: number;
  /** Juegos para ganar el set, ganando por 2: 6, o 4 en sets cortos y Fast4. */
  gamesPerSet: number;
  /** Empate en que se juega el tie-break (6; 4 en sets cortos; 3 en Fast4). null = set con ventaja, sin tie-break. */
  tiebreakAt: number | null;
  /** Puntos del tie-break del set (7; Fast4: 5). */
  tiebreakTo: number;
  /** 2 = ganando por 2; 1 = muerte súbita (Fast4: a 5 con punto decisivo en 4-4). */
  tiebreakWinBy: 1 | 2;
  bestOf: 1 | 3 | 5;
  /** Set decisivo: 'set' completo o 'tiebreak' (súper tie-break o match tie-break, ganando por 2). */
  finalSet: 'set' | 'tiebreak';
  /** Puntos del súper tie-break (10). */
  finalTiebreakTo: number;
}

export interface PickleballRules {
  sport: 'pickleball';
  doubles: boolean;
  /** 'sideout': tradicional, solo puntúa el que saca. 'rally': un punto en cada peloteo, sin segundo sacador. */
  scoring: 'sideout' | 'rally';
  /** Puntos del juego: 11, 15 o 21. */
  gameTo: number;
  winBy: 1 | 2;
  /** A 1 juego o al mejor de 3 (o 5). */
  bestOf: 1 | 3 | 5;
  /** Cambio de lado en el juego decisivo cuando alguien llega a estos puntos (6 a 11, 8 a 15, 11 a 21). null = no se cambia. */
  switchAt: number | null;
  /** Solo rally: el punto que gana el juego solo se gana sacando (si el que recibe gana ese peloteo, recupera el saque y nada más). */
  gamePointOnServeOnly: boolean;
}

/** Ping pong (ITTF 2.11–2.14): juegos a 11 ganando por 2, al mejor de 3, 5 o 7, individual o dobles. */
export interface TableTennisRules {
  sport: 'table_tennis';
  /** Dobles: orden de saque A1→B1→A2→B2 (ver tableTennis.ts). */
  doubles: boolean;
  /** Puntos del juego: 11 (fijo; el campo existe para las cuentas de carrera, como en pickleball). */
  gameTo: 11;
  /** Siempre por 2: en 10-10 se sigue hasta sacar 2 de ventaja. */
  winBy: 2;
  bestOf: 3 | 5 | 7;
  /** Cambio de lado en el juego decisivo cuando alguien llega a estos puntos (5). null = sin aviso. */
  switchAt: 5 | null;
}

export type RacketRules = TennisRules | PickleballRules | TableTennisRules;

/** Deportes de raqueta a juegos de puntos (sin sets): en las tablas los «sets» son juegos y los «juegos», puntos. */
export type GameSport = 'pickleball' | 'table_tennis';
export const isGameSport = (sport: string | null | undefined): sport is GameSport => sport === 'pickleball' || sport === 'table_tennis';
export type GameSportRules = PickleballRules | TableTennisRules;
export const isGameSportRules = (r: RacketRules): r is GameSportRules => isGameSport(r.sport);

/** Datos del sorteo, antes del primer punto. Todo es opcional. */
export interface MatchSetup {
  /** Quién saca primero. Por defecto el lado 1. */
  firstServer?: Side;
  /**
   * Dobles: qué jugador de cada pareja saca primero (índice 0 o 1). En pickleball ese jugador empieza cada juego
   * en la derecha (el primer saque siempre sale de la derecha). En ping pong, el de la pareja que recibe es quien
   * recibe primero en el juego 1. Por defecto [0, 0].
   */
  firstPlayer?: Pair<Player>;
  /** Qué lado empieza a la izquierda (de la pantalla del anotador). Por defecto el lado 1. */
  leftSide?: Side;
}

/** Set terminado. En un súper tie-break, `games` queda 1-0 (o 0-1) y el marcador real va en `tiebreak`. */
export interface SetScore {
  games: Pair<number>;
  /** Puntos del tie-break, si se jugó. */
  tiebreak?: Pair<number>;
  /** El set fue un súper tie-break (match tie-break). */
  matchTiebreak?: boolean;
}

/** Cómo terminó el partido: jugado completo, retiro o W.O. */
export type Finish = 'played' | 'retired' | 'walkover';

export interface RulePreset<R extends RacketRules = RacketRules> {
  id: string;
  label: string;
  rules: R;
}

const TENNIS: TennisRules = {
  sport: 'tennis',
  doubles: false,
  deuce: 'ad',
  starAdvantages: 2,
  gamesPerSet: 6,
  tiebreakAt: 6,
  tiebreakTo: 7,
  tiebreakWinBy: 2,
  bestOf: 3,
  finalSet: 'set',
  finalTiebreakTo: 10,
};

const PADEL: TennisRules = { ...TENNIS, sport: 'padel', doubles: true, deuce: 'golden', finalSet: 'tiebreak' };

const PICKLEBALL: PickleballRules = {
  sport: 'pickleball',
  doubles: true,
  scoring: 'sideout',
  gameTo: 11,
  winBy: 2,
  bestOf: 1,
  switchAt: 6,
  gamePointOnServeOnly: false,
};

const TABLE_TENNIS: TableTennisRules = { sport: 'table_tennis', doubles: false, gameTo: 11, winBy: 2, bestOf: 5, switchAt: 5 };

/** Plantillas probadas por deporte. La primera es la de por defecto. */
export const RULE_PRESETS: {
  tennis: RulePreset<TennisRules>[];
  padel: RulePreset<TennisRules>[];
  pickleball: RulePreset<PickleballRules>[];
  table_tennis: RulePreset<TableTennisRules>[];
} = {
  tennis: [
    { id: 'normal', label: 'Mejor de 3 sets con ventaja', rules: TENNIS },
    { id: 'mtb', label: 'Mejor de 3, el tercero a súper tie-break', rules: { ...TENNIS, finalSet: 'tiebreak' } },
    { id: 'noad-mtb', label: 'Sin ventaja, el tercero a súper tie-break', rules: { ...TENNIS, deuce: 'noad', finalSet: 'tiebreak' } },
    { id: 'cortos', label: 'Sets cortos a 4 (tie-break en 4-4)', rules: { ...TENNIS, gamesPerSet: 4, tiebreakAt: 4 } },
    {
      id: 'fast4',
      label: 'Fast4: sets a 4, sin ventaja, tie-break a 5 en 3-3',
      rules: { ...TENNIS, deuce: 'noad', gamesPerSet: 4, tiebreakAt: 3, tiebreakTo: 5, tiebreakWinBy: 1 },
    },
    { id: 'bo5', label: 'Mejor de 5 sets', rules: { ...TENNIS, bestOf: 5 } },
    { id: 'dobles', label: 'Dobles, sin ventaja, el tercero a súper tie-break', rules: { ...TENNIS, doubles: true, deuce: 'noad', finalSet: 'tiebreak' } },
  ],
  padel: [
    { id: 'amateur', label: 'Punto de oro, el tercero a súper tie-break', rules: PADEL },
    { id: 'ventaja', label: 'Con ventaja, el tercero a súper tie-break', rules: { ...PADEL, deuce: 'ad' } },
    { id: 'star', label: 'Star Point (FIP 2026), tres sets completos', rules: { ...PADEL, deuce: 'star', finalSet: 'set' } },
    { id: 'tres-sets', label: 'Punto de oro, tres sets completos', rules: { ...PADEL, finalSet: 'set' } },
  ],
  pickleball: [
    { id: 'a11', label: 'Dobles, un juego a 11', rules: PICKLEBALL },
    { id: 'bo3', label: 'Dobles, mejor de 3 juegos a 11', rules: { ...PICKLEBALL, bestOf: 3 } },
    { id: 'a15', label: 'Dobles, un juego a 15', rules: { ...PICKLEBALL, gameTo: 15, switchAt: 8 } },
    { id: 'a21', label: 'Dobles, un juego a 21', rules: { ...PICKLEBALL, gameTo: 21, switchAt: 11 } },
    { id: 'rally', label: 'Conteo por rally, un juego a 21', rules: { ...PICKLEBALL, scoring: 'rally', gameTo: 21, switchAt: 11 } },
    { id: 'individual', label: 'Individual, mejor de 3 juegos a 11', rules: { ...PICKLEBALL, doubles: false, bestOf: 3 } },
  ],
  table_tennis: [
    { id: 'bo5', label: 'Individual, al mejor de 5 juegos a 11', rules: TABLE_TENNIS },
    { id: 'bo3', label: 'Individual, al mejor de 3 juegos a 11', rules: { ...TABLE_TENNIS, bestOf: 3 } },
    { id: 'bo7', label: 'Individual, al mejor de 7 juegos a 11', rules: { ...TABLE_TENNIS, bestOf: 7 } },
    { id: 'dobles', label: 'Dobles, al mejor de 5 juegos a 11', rules: { ...TABLE_TENNIS, doubles: true } },
    { id: 'dobles-bo3', label: 'Dobles, al mejor de 3 juegos a 11', rules: { ...TABLE_TENNIS, doubles: true, bestOf: 3 } },
    { id: 'dobles-bo7', label: 'Dobles, al mejor de 7 juegos a 11', rules: { ...TABLE_TENNIS, doubles: true, bestOf: 7 } },
  ],
};

/** Reglas por defecto del deporte (copia nueva). */
export function defaultRules(sport: 'table_tennis'): TableTennisRules;
export function defaultRules(sport: 'pickleball'): PickleballRules;
export function defaultRules(sport: 'tennis' | 'padel'): TennisRules;
export function defaultRules(sport: RacketSport): RacketRules;
export function defaultRules(sport: RacketSport): RacketRules {
  if (!RACKET_SPORTS.includes(sport)) throw new Error('Deporte de raqueta no válido.');
  return { ...RULE_PRESETS[sport][0].rules };
}

const isInt = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isBestOf = (v: unknown) => v === 1 || v === 3 || v === 5;

/** Errores de las reglas en español (vacío = bien). Revisa también datos que vengan de la base. */
export function validateRules(rules: RacketRules): string[] {
  const e: string[] = [];
  const r = rules as unknown as Record<string, unknown>;
  if (!r || typeof r !== 'object' || !RACKET_SPORTS.includes(r.sport as RacketSport)) return ['Deporte de raqueta no válido.'];
  if (typeof r.doubles !== 'boolean') e.push('Falta decir si es individual o dobles.');
  // Ping pong: reglas fijas de la ITTF, salvo el largo del partido (antes de la revisión general, que topa en 5).
  if (r.sport === 'table_tennis') {
    if (r.bestOf !== 3 && r.bestOf !== 5 && r.bestOf !== 7) e.push('El partido es al mejor de 3, 5 o 7 juegos.');
    if (r.gameTo !== 11) e.push('El juego es a 11 puntos.');
    if (r.winBy !== 2) e.push('El juego se gana por 2.');
    if (r.switchAt !== 5 && r.switchAt !== null) e.push('El cambio de lado del juego decisivo es a los 5 puntos.');
    return e;
  }
  if (!isBestOf(r.bestOf)) e.push('El partido es a 1, 3 o 5.');
  if (r.sport === 'pickleball') {
    if (r.scoring !== 'sideout' && r.scoring !== 'rally') e.push('El conteo es tradicional o por rally.');
    if (!isInt(r.gameTo, 5, 25)) e.push('El juego va de 5 a 25 puntos.');
    if (r.winBy !== 1 && r.winBy !== 2) e.push('Se gana por 1 o por 2.');
    if (r.switchAt !== null && !isInt(r.switchAt, 1, Number(r.gameTo) - 1)) e.push('El cambio de lado va entre 1 y los puntos del juego menos 1.');
    if (typeof r.gamePointOnServeOnly !== 'boolean') e.push('Falta decir si el punto de juego se gana solo sacando.');
    return e;
  }
  if (r.sport === 'padel' && r.doubles !== true) e.push('El pádel siempre es en dobles.');
  if (r.sport === 'tennis' && r.deuce !== 'ad' && r.deuce !== 'noad') e.push('En tenis el 40-40 es con ventaja o sin ventaja.');
  if (r.sport === 'padel' && r.deuce !== 'ad' && r.deuce !== 'golden' && r.deuce !== 'star') e.push('En pádel el 40-40 es punto de oro, ventaja o Star Point.');
  if (!isInt(r.starAdvantages, 1, 5)) e.push('Las ventajas del Star Point van de 1 a 5.');
  const gps = r.gamesPerSet;
  if (!isInt(gps, 2, 9)) e.push('Los juegos por set van de 2 a 9.');
  else if (r.tiebreakAt !== null && r.tiebreakAt !== gps && r.tiebreakAt !== Number(gps) - 1) {
    e.push(`El tie-break del set se juega en ${gps}-${gps} o en ${Number(gps) - 1}-${Number(gps) - 1}.`);
  }
  if (!isInt(r.tiebreakTo, 3, 15)) e.push('El tie-break va de 3 a 15 puntos.');
  if (r.tiebreakWinBy !== 1 && r.tiebreakWinBy !== 2) e.push('El tie-break se gana por 1 o por 2.');
  if (r.finalSet !== 'set' && r.finalSet !== 'tiebreak') e.push('El set decisivo es completo o súper tie-break.');
  if (r.finalSet === 'tiebreak' && r.bestOf === 1) e.push('A un solo set no hay súper tie-break.');
  if (!isInt(r.finalTiebreakTo, 5, 21)) e.push('El súper tie-break va de 5 a 21 puntos.');
  return e;
}

/**
 * Reglas completas a partir de un cambio parcial sobre las de por defecto. Lanza un Error si no son válidas.
 * Si cambian `gamesPerSet` sin `tiebreakAt`, el tie-break va en el empate a `gamesPerSet`;
 * si cambian `gameTo` sin `switchAt`, el cambio de lado va a la mitad (6, 8 u 11). En ping pong no se recalcula nada.
 */
export function resolveRules(sport: 'table_tennis', partial?: Partial<TableTennisRules>): TableTennisRules;
export function resolveRules(sport: 'pickleball', partial?: Partial<PickleballRules>): PickleballRules;
export function resolveRules(sport: 'tennis' | 'padel', partial?: Partial<TennisRules>): TennisRules;
export function resolveRules(sport: RacketSport, partial?: Partial<RacketRules>): RacketRules;
export function resolveRules(sport: RacketSport, partial: Partial<RacketRules> = {}): RacketRules {
  const given = Object.fromEntries(Object.entries(partial).filter(([, v]) => v !== undefined));
  const merged = { ...defaultRules(sport), ...given, sport } as RacketRules;
  if (merged.sport === 'pickleball') {
    if (!('switchAt' in given)) merged.switchAt = Math.ceil(merged.gameTo / 2);
  } else if (merged.sport !== 'table_tennis' && !('tiebreakAt' in given) && 'gamesPerSet' in given) {
    merged.tiebreakAt = merged.gamesPerSet;
  }
  const errors = validateRules(merged);
  if (errors.length) throw new Error(errors.join(' '));
  return merged;
}

/** Sorteo con los valores por defecto puestos. En individual el jugador siempre es 0. */
export function resolveSetup(setup: MatchSetup | undefined, doubles: boolean): Required<MatchSetup> {
  const firstServer = setup?.firstServer ?? 1;
  const leftSide = setup?.leftSide ?? 1;
  const fp = setup?.firstPlayer ?? [0, 0];
  if (firstServer !== 1 && firstServer !== 2) throw new Error('Quién saca primero no es válido.');
  if (leftSide !== 1 && leftSide !== 2) throw new Error('El lado inicial no es válido.');
  if (!Array.isArray(fp) || fp.length !== 2 || fp.some((p) => p !== 0 && p !== 1)) throw new Error('El orden de saque no es válido.');
  return { firstServer, leftSide, firstPlayer: doubles ? [fp[0], fp[1]] : [0, 0] };
}

// ---- Ayudas comunes a los motores ----

export const other = (side: Side): Side => (side === 1 ? 2 : 1);
export const flip = (p: Player): Player => (p === 0 ? 1 : 0);
/** Sets (o juegos) que hay que ganar: 1, 2, 3 o 4 (ping pong al mejor de 7). */
export const needed = (bestOf: number) => Math.ceil(bestOf / 2);

export function assertSide(side: unknown): asserts side is Side {
  if (side !== 1 && side !== 2) throw new Error('Lado no válido.');
}

export function assertPlayer(p: unknown): asserts p is Player {
  if (p !== 0 && p !== 1) throw new Error('Jugador no válido.');
}

/**
 * Marcador corto de un partido a juegos (pickleball y ping pong), siempre lado 1 primero: "11-7 9-11 11-5",
 * "11-7 3-5 ret.", "W.O."; en curso agrega el juego actual.
 */
export function gamesSummary(s: { games: readonly Pair<number>[]; score: Pair<number>; finish: Finish | null }): string {
  if (s.finish === 'walkover') return 'W.O.';
  const parts = s.games.map((g) => `${g[0]}-${g[1]}`);
  if (s.finish !== 'played') {
    if (s.score[0] + s.score[1] > 0 || (!parts.length && s.finish === null)) parts.push(`${s.score[0]}-${s.score[1]}`);
    if (s.finish === 'retired') parts.push('ret.');
  }
  return parts.join(' ');
}

/** Par de enteros de 0 a 99, o Error con `msg`. */
export function intPair(v: unknown, msg: string): Pair<number> {
  if (!Array.isArray(v) || v.length !== 2 || !v.every((x) => isInt(x, 0, 99))) throw new Error(msg);
  return [v[0], v[1]];
}

// ---- ¿Terminó? Tie-breaks y juegos de pickleball y ping pong ("carrera a N ganando por 1 o 2") ----

/** Quién ganó una carrera a `to` puntos ganando por `winBy`, si el marcador ya la terminó. */
export function raceWinner(to: number, winBy: number, [a, b]: Pair<number>): Side | null {
  if (a >= to && a - b >= winBy) return 1;
  if (b >= to && b - a >= winBy) return 2;
  return null;
}

/** El marcador se puede dar con la carrera todavía abierta. */
export function raceOpen(to: number, winBy: number, [a, b]: Pair<number>): boolean {
  if (a < 0 || b < 0 || raceWinner(to, winBy, [a, b]) !== null) return false;
  // Ganando por 1 no hay empate más allá de la meta: 11-11 a 11 no existe.
  return winBy === 2 || (a < to && b < to);
}

/** Ganador si el marcador es un final posible de la carrera (el último punto lo ganó el ganador). */
export function raceFinal(to: number, winBy: number, score: Pair<number>): Side | null {
  const w = raceWinner(to, winBy, score);
  if (w === null) return null;
  const prev: Pair<number> = w === 1 ? [score[0] - 1, score[1]] : [score[0], score[1] - 1];
  return raceOpen(to, winBy, prev) ? w : null;
}

// ---- ¿Terminó? Sets de tenis y pádel (juegos) ----

function setWinnerRaw(r: TennisRules, [a, b]: Pair<number>): Side | null {
  const t = r.tiebreakAt;
  if (t !== null && a === t + 1 && b === t) return 1;
  if (t !== null && b === t + 1 && a === t) return 2;
  if (a >= r.gamesPerSet && a - b >= 2) return 1;
  if (b >= r.gamesPerSet && b - a >= 2) return 2;
  return null;
}

/** El set puede estar en curso con esos juegos (incluido el empate que lleva al tie-break). */
export function setOpen(r: TennisRules, [a, b]: Pair<number>): boolean {
  if (a < 0 || b < 0 || setWinnerRaw(r, [a, b]) !== null) return false;
  const t = r.tiebreakAt;
  // Pasado el empate del tie-break no hay más set: de 6-6 solo se sale a 7-6.
  return t === null || !(a >= t && b >= t && (a > t || b > t));
}

/** Ganador del set si esos juegos son un final posible (6-4, 7-5, 7-6, 4-2 en sets cortos…). */
export function setWinner(r: TennisRules, games: Pair<number>): Side | null {
  const w = setWinnerRaw(r, games);
  if (w === null) return null;
  const prev: Pair<number> = w === 1 ? [games[0] - 1, games[1]] : [games[0], games[1] - 1];
  return setOpen(r, prev) ? w : null;
}

/** El set terminó en tie-break (7-6, 5-4 en sets cortos, 4-3 en Fast4). */
export function isTiebreakSet(r: TennisRules, [a, b]: Pair<number>): boolean {
  const t = r.tiebreakAt;
  return t !== null && Math.min(a, b) === t && Math.max(a, b) === t + 1;
}

/**
 * Revisa y ordena sets terminados escritos a mano o guardados: acepta [6, 4] o { games, tiebreak }.
 * En la posición del súper tie-break acepta [10, 7] (o { games: [1, 0], tiebreak: [10, 7] }).
 * Lanza un Error en español si algo no cuadra con las reglas.
 */
export function normalizeSets(r: TennisRules, input: readonly (SetScore | Pair<number>)[]): SetScore[] {
  if (!Array.isArray(input)) throw new Error('Sets no válidos.');
  if (input.length > r.bestOf) throw new Error(`El partido es a ${r.bestOf} set${r.bestOf === 1 ? '' : 's'} como máximo.`);
  const need = needed(r.bestOf);
  const wins = [0, 0];
  return input.map((raw, k) => {
    if (wins[0] >= need || wins[1] >= need) throw new Error('Hay sets después de terminado el partido.');
    const obj = (Array.isArray(raw) ? { games: raw } : raw) as SetScore;
    const games = intPair(obj?.games, `Set ${k + 1} no válido.`);
    const tb = obj.tiebreak === undefined ? undefined : intPair(obj.tiebreak, `Tie-break del set ${k + 1} no válido.`);
    let set: SetScore;
    let w: Side | null;
    if (r.finalSet === 'tiebreak' && k === r.bestOf - 1) {
      // Súper tie-break: el marcador real son los puntos.
      const pts = tb ?? (games[0] + games[1] === 1 ? undefined : games);
      w = pts ? raceFinal(r.finalTiebreakTo, 2, pts) : games[0] === 1 ? 1 : 2;
      if (w === null) throw new Error(`Súper tie-break no válido: ${pts![0]}-${pts![1]}.`);
      set = { games: w === 1 ? [1, 0] : [0, 1], matchTiebreak: true };
      if (pts) set.tiebreak = pts;
    } else {
      w = setWinner(r, games);
      if (w === null) throw new Error(`Set ${k + 1} no válido: ${games[0]}-${games[1]}.`);
      set = { games };
      if (tb && isTiebreakSet(r, games)) {
        if (raceFinal(r.tiebreakTo, r.tiebreakWinBy, tb) !== w) throw new Error(`Tie-break del set ${k + 1} no válido: ${tb[0]}-${tb[1]}.`);
        set.tiebreak = tb;
      }
    }
    wins[w - 1]++;
    return set;
  });
}

/** Revisa juegos terminados de pickleball o ping pong ([11, 7], [9, 11]…). Lanza un Error si alguno no cuadra. */
export function normalizeGames(r: Pick<GameSportRules, 'gameTo' | 'winBy' | 'bestOf'>, input: readonly Pair<number>[]): Pair<number>[] {
  if (!Array.isArray(input)) throw new Error('Juegos no válidos.');
  if (input.length > r.bestOf) throw new Error(`El partido es a ${r.bestOf} juego${r.bestOf === 1 ? '' : 's'} como máximo.`);
  const need = needed(r.bestOf);
  const wins = [0, 0];
  return input.map((raw, k) => {
    if (wins[0] >= need || wins[1] >= need) throw new Error('Hay juegos después de terminado el partido.');
    const g = intPair(raw, `Juego ${k + 1} no válido.`);
    const w = raceFinal(r.gameTo, r.winBy, g);
    if (w === null) throw new Error(`Juego ${k + 1} no válido: ${g[0]}-${g[1]}.`);
    wins[w - 1]++;
    return g;
  });
}
