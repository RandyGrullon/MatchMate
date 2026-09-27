/**
 * Golf: tarjeta de un jugador y puntaje de una ronda en cada formato.
 *
 * Formatos v1 (sin match play, four-ball, scramble ni skins):
 * - 'stroke': stroke play bruto o neto. Recoger la bola en un hoyo = no terminar el hoyo = descalificado
 *   para esa ronda (Regla 3.3c): no hay total.
 * - 'stableford': puntos por hoyo contra el par neto (0 doble bogey o peor / recogió, 1 bogey, 2 par,
 *   3 birdie, 4 eagle, 5 albatros). Recoger vale 0 puntos, no descalifica.
 * - 'maxScore': «máximo por hoyo» (Regla 21.2): cada hoyo cuenta como mucho el tope (por defecto doble bogey neto);
 *   recoger cuenta el tope.
 *
 * En la tarjeta, un hoyo donde recogió va con golpes null y `pickedUp[i] = true` (nunca con 0).
 */

import { strokesReceived, type PlayedHole } from './course';

export const MIN_STROKES = 1;
export const MAX_STROKES = 20;
export const MAX_PUTTS = 10;

export interface GolfCard {
  /** Golpes por hoyo (1–20), en el orden de `holes` de la ronda; null = no se ha jugado. */
  strokes: (number | null)[];
  /** Putts opcionales por hoyo. */
  putts?: (number | null)[];
  /** Recogió la bola en ese hoyo (no lo terminó). */
  pickedUp?: boolean[];
}

/** Una ronda de un jugador: sus hoyos (según su salida), su handicap de juego ya calculado y su tarjeta. */
export interface GolfRound {
  holes: PlayedHole[];
  playingHcp: number;
  card: GolfCard;
}

export type GolfFormat = 'stroke' | 'stableford' | 'maxScore';
export type GolfBasis = 'net' | 'gross';

/** Tope por hoyo del formato «máximo por hoyo» (Regla 21.2). */
export type MaxScoreRule = { kind: 'netDoubleBogey' } | { kind: 'doublePar' } | { kind: 'parPlus'; n: number } | { kind: 'fixed'; value: number };

export interface GolfCompetition {
  format: GolfFormat;
  /** Neto (con handicap) o bruto. En Stableford bruto los puntos van contra el par, sin golpes de ventaja. */
  basis: GolfBasis;
  /** % de handicap de la competencia (95 por defecto); lo usa quien calcula `playingHcp` (ver `handicapFor`). */
  allowance?: number;
  /** Solo para 'maxScore'. Por defecto, doble bogey neto. */
  maxScore?: MaxScoreRule;
}

export interface HoleScore extends PlayedHole {
  /** Golpes de ventaja en este hoyo (negativo con handicap plus). */
  received: number;
  /** Lo anotado (null si no se jugó o si recogió). */
  strokes: number | null;
  pickedUp: boolean;
  /** Tiene golpes o recogió. */
  played: boolean;
  /** Golpes que cuentan para el total: en 'maxScore' con el tope. null si no se jugó o si recogió (fuera de 'maxScore'). */
  score: number | null;
  /** Puntos Stableford del hoyo (null si no se jugó). */
  points: number | null;
  putts: number | null;
}

export interface RoundScore {
  holes: HoleScore[];
  playingHcp: number;
  /** Hoyos terminados (con golpes o recogió). */
  thru: number;
  complete: boolean;
  /** Stroke play con un hoyo sin terminar: sin total (Regla 3.3c). */
  dq: boolean;
  /** Suma de golpes que cuentan de los hoyos jugados. null si no ha empezado o si hay un hoyo sin total. */
  gross: number | null;
  /** Bruto menos los golpes de ventaja de los hoyos jugados (con la ronda completa, bruto − handicap de juego). */
  net: number | null;
  points: number;
  /** Par de los hoyos jugados. */
  par: number;
  toPar: number | null;
  netToPar: number | null;
  /** Total de putts anotados (null si no anotó ninguno). */
  putts: number | null;
}

export function emptyCard(holes: number): GolfCard {
  return { strokes: Array(holes).fill(null), putts: Array(holes).fill(null), pickedUp: Array(holes).fill(false) };
}

export function isValidStrokes(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= MIN_STROKES && n <= MAX_STROKES;
}

/** Errores de la tarjeta en español (vacía = válida). */
export function validateCard(card: GolfCard, holes: number): string[] {
  const out: string[] = [];
  if (card.strokes.length !== holes) out.push(`La tarjeta debe tener ${holes} hoyos.`);
  card.strokes.forEach((s, i) => {
    if (s != null && !isValidStrokes(s)) out.push(`Hoyo ${i + 1}: los golpes van de ${MIN_STROKES} a ${MAX_STROKES}.`);
    if (s != null && card.pickedUp?.[i]) out.push(`Hoyo ${i + 1}: si recogió, no lleva golpes.`);
    const p = card.putts?.[i];
    if (p != null && (!Number.isInteger(p) || p < 0 || p > MAX_PUTTS)) out.push(`Hoyo ${i + 1}: los putts van de 0 a ${MAX_PUTTS}.`);
    else if (p != null && s != null && p >= s) out.push(`Hoyo ${i + 1}: no puede tener tantos putts como golpes.`);
  });
  if (card.putts && card.putts.length !== holes) out.push(`Los putts deben ser ${holes}.`);
  if (card.pickedUp && card.pickedUp.length !== holes) out.push(`Las marcas de «recogió» deben ser ${holes}.`);
  return out;
}

/**
 * Cambia un hoyo sin tocar la tarjeta original. Poner golpes quita «recogió»; marcar «recogió» borra golpes y putts.
 */
export function setHole(card: GolfCard, i: number, patch: { strokes?: number | null; putts?: number | null; pickedUp?: boolean }): GolfCard {
  const n = card.strokes.length;
  const strokes = [...card.strokes];
  const putts = card.putts ? [...card.putts] : Array<number | null>(n).fill(null);
  const pickedUp = card.pickedUp ? [...card.pickedUp] : Array<boolean>(n).fill(false);
  if (patch.strokes !== undefined) {
    strokes[i] = patch.strokes;
    if (patch.strokes != null) pickedUp[i] = false;
  }
  if (patch.putts !== undefined) putts[i] = patch.putts;
  if (patch.pickedUp !== undefined) {
    pickedUp[i] = patch.pickedUp;
    if (patch.pickedUp) {
      strokes[i] = null;
      putts[i] = null;
    }
  }
  return { strokes, putts, pickedUp };
}

/** Orden en que se juegan los hoyos (índices) saliendo del hoyo `start` (salida simultánea o por el 10). */
export function playOrder(holes: number, start = 0): number[] {
  return Array.from({ length: holes }, (_, k) => (start + k) % holes);
}

/** Próximo hoyo sin anotar según el orden de juego (null = tarjeta completa). */
export function nextHole(card: GolfCard, start = 0): number | null {
  const i = playOrder(card.strokes.length, start).find((h) => card.strokes[h] == null && !card.pickedUp?.[h]);
  return i ?? null;
}

/** Stableford: 2 puntos por el par neto, uno más por cada golpe menos, uno menos por cada golpe más, y nunca menos de 0. */
export function stablefordPoints(strokes: number, par: number, received = 0): number {
  return Math.max(0, 2 + par + received - strokes);
}

/** Tope del hoyo en el formato «máximo por hoyo». */
export function maxScoreFor(rule: MaxScoreRule, par: number, received: number): number {
  switch (rule.kind) {
    case 'netDoubleBogey':
      return par + 2 + received;
    case 'doublePar':
      return par * 2;
    case 'parPlus':
      return par + rule.n;
    case 'fixed':
      return rule.value;
  }
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** Puntaje de una ronda (completa o en curso) en el formato de la competencia. */
export function scoreRound(round: GolfRound, comp: GolfCompetition): RoundScore {
  const { holes, card } = round;
  const received = strokesReceived(round.playingHcp, holes.map((h) => h.si));
  const rule: MaxScoreRule = comp.maxScore ?? { kind: 'netDoubleBogey' };
  const rows: HoleScore[] = holes.map((h, i) => {
    const pickedUp = !!card.pickedUp?.[i];
    const strokes = pickedUp ? null : (card.strokes[i] ?? null);
    const played = pickedUp || strokes != null;
    let score = strokes;
    if (comp.format === 'maxScore' && played) {
      const cap = maxScoreFor(rule, h.par, received[i]);
      score = strokes == null ? cap : Math.min(strokes, cap);
    }
    const points = !played ? null : strokes == null ? 0 : stablefordPoints(strokes, h.par, comp.basis === 'net' ? received[i] : 0);
    return { ...h, received: received[i], strokes, pickedUp, played, score, points, putts: card.putts?.[i] ?? null };
  });
  const done = rows.filter((r) => r.played);
  const thru = done.length;
  const gap = done.some((r) => r.score == null);
  const par = sum(done.map((r) => r.par));
  const gross = thru && !gap ? sum(done.map((r) => r.score!)) : null;
  const net = gross == null ? null : gross - sum(done.map((r) => r.received));
  const putts = rows.filter((r) => r.putts != null);
  return {
    holes: rows,
    playingHcp: round.playingHcp,
    thru,
    complete: thru === holes.length,
    dq: comp.format === 'stroke' && rows.some((r) => r.pickedUp),
    gross,
    net,
    points: sum(done.map((r) => r.points ?? 0)),
    par,
    toPar: gross == null ? null : gross - par,
    netToPar: net == null ? null : net - par,
    putts: putts.length ? sum(putts.map((r) => r.putts!)) : null,
  };
}

/** Stableford se gana con más puntos; stroke play y «máximo por hoyo», con menos golpes. */
export function higherWins(comp: GolfCompetition): boolean {
  return comp.format === 'stableford';
}

/**
 * Número que ordena la ronda: en Stableford los puntos; en los demás, golpes contra el par (neto o bruto),
 * que sirve con la ronda a medias («thru») y con salidas de par distinto. null = sin empezar o sin total.
 */
export function roundValue(s: RoundScore, comp: GolfCompetition): number | null {
  if (!s.thru) return null;
  if (comp.format === 'stableford') return s.points;
  return comp.basis === 'net' ? s.netToPar : s.toPar;
}
