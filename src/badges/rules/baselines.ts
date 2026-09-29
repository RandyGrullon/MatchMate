/**
 * Líneas base personales (docs/insignias.md §1.7.6): todo lo de progreso se mide contra tu propio historial, nunca
 * contra lo que escribe uno mismo (`entries.average`, `average_override`, `hcp_index`, `seed_cs`).
 * - Boliche: piso de la media de los últimos 30 juegos B1 antes de la fecha (12+).
 * - Raqueta: % de juegos ganados (`racketGames` en racket.ts).
 * - Golf: diferencial MatchMate (no oficial) e índice topado.
 * - Natación: marca personal (`personalBestSteps` en swim.ts).
 */
import { DEFAULT_ALLOWANCE, handicapFor, MAX_INDEX, MIN_INDEX } from '../../sports/golf/course';
import type { SnapGolfCard, SnapGolfRound } from '../snapshot';
import { gameOrder, type BowlingGame } from './bowling';
import { cardHoles, roundRating } from './golf';

// ---------------------------------------------------------------------------------------------------------
// Boliche

export const BOWLING_BASE_WINDOW = 30;
export const BOWLING_BASE_MIN = 12;

/**
 * Línea base de boliche antes de la fecha `before` ('YYYY-MM-DD', sin incluirla): piso de la media de los últimos
 * `window` juegos B1 (de la cuenta: todos sus jugadores de boliche; sin cuenta: los de su liga). null con menos de
 * `min` juegos.
 */
export function bowlingBaseline(
  games: readonly Pick<BowlingGame, 'date' | 'start_time' | 'event_id' | 'index' | 'score'>[],
  before: string,
  opts: { window?: number; min?: number } = {},
): { base: number; games: number } | null {
  const window = opts.window ?? BOWLING_BASE_WINDOW;
  const min = opts.min ?? BOWLING_BASE_MIN;
  const prior = games.filter((g) => g.date < before).sort(gameOrder).slice(-window);
  if (prior.length < min) return null;
  return { base: Math.floor(prior.reduce((n, g) => n + g.score, 0) / prior.length), games: prior.length };
}

/** Media de puntajes (con decimales); null sin juegos. */
export const meanScore = (games: readonly Pick<BowlingGame, 'score'>[]): number | null =>
  games.length ? games.reduce((n, g) => n + g.score, 0) / games.length : null;

// ---------------------------------------------------------------------------------------------------------
// Raqueta

/** % (0–100, con decimales) de juegos ganados sobre jugados; null sin juegos. */
export function gamesWonPct(pairs: readonly (readonly [number, number])[]): number | null {
  let won = 0;
  let played = 0;
  for (const [mine, theirs] of pairs) {
    won += mine;
    played += mine + theirs;
  }
  return played ? (won / played) * 100 : null;
}

// ---------------------------------------------------------------------------------------------------------
// Golf

/** Golpes de más que cuenta un hoyo en el bruto ajustado (y lo que vale un hoyo levantado): par + 3. */
export const ADJUSTED_OVER_PAR = 3;

/**
 * Diferencial MatchMate (no oficial) de una tarjeta: bruto ajustado = Σ min(golpes, par + 3), un hoyo levantado vale
 * par + 3; diferencial = (bruto ajustado − rating) × 113 / slope, con la salida de la copia del campo. Las de 9 hoyos
 * usan el rating de su vuelta y solo se comparan con otras de 9. Una décima. null si falta un hoyo o la salida.
 */
export function golfDifferential(card: Pick<SnapGolfCard, 'tee_id' | 'strokes' | 'picked_up'>, round: Pick<SnapGolfRound, 'course' | 'nine'>): { value: number; holes: 9 | 18 } | null {
  const holes = cardHoles(card, round);
  const r = roundRating(round, card.tee_id);
  if (!holes || !r || (holes.length !== 9 && holes.length !== 18)) return null;
  let adjusted = 0;
  for (let i = 0; i < holes.length; i++) {
    const cap = holes[i].par + ADJUSTED_OVER_PAR;
    const s = card.strokes[i];
    if (card.picked_up?.[i]) adjusted += cap;
    else if (typeof s === 'number' && s >= 1) adjusted += Math.min(s, cap);
    else return null;
  }
  return { value: Math.round(((adjusted - r.rating) * 113 * 10) / r.slope) / 10, holes: holes.length === 9 ? 9 : 18 };
}

/** Diferenciales que entran al índice derivado, los mejores de cuántos, y el mínimo para calcularlo. */
export const DERIVED_INDEX = { last: 20, best: 8, min: 5 } as const;
/** Sin índice derivado se usa el escrito, topado en 36. */
export const UNDERIVED_INDEX_CAP = 36;

/**
 * Índice topado (§1.7.6) = min(`hcp_index`, índice derivado). Derivado = media de los mejores 8 de los últimos 20
 * diferenciales de rondas G2 de 18 hoyos (en orden de fecha). Con menos de 5 diferenciales, el escrito topado en 36.
 * Sin índice escrito se juega con 0, como en la ronda.
 */
export function cappedIndex(hcpIndex: number | null | undefined, differentials18: readonly number[]): number {
  const own = typeof hcpIndex === 'number' && Number.isFinite(hcpIndex) ? hcpIndex : 0;
  const clamp = (x: number) => Math.min(MAX_INDEX, Math.max(MIN_INDEX, x));
  if (differentials18.length < DERIVED_INDEX.min) return clamp(Math.min(own, UNDERIVED_INDEX_CAP));
  const best = [...differentials18.slice(-DERIVED_INDEX.last)].sort((a, b) => a - b).slice(0, DERIVED_INDEX.best);
  const derived = Math.round((best.reduce((n, d) => n + d, 0) / best.length) * 10) / 10;
  return clamp(Math.min(own, derived));
}

/** Hándicap de juego recalculado con el índice topado, con el % de la competencia de la ronda. */
export function cappedPlayingHcp(card: Pick<SnapGolfCard, 'tee_id'>, round: Pick<SnapGolfRound, 'course' | 'nine' | 'competition'>, index: number): number | null {
  try {
    return handicapFor(index, round.course, card.tee_id, { nine: round.nine, allowance: round.competition?.allowance ?? DEFAULT_ALLOWANCE }).playingHcp;
  } catch {
    return null;
  }
}
