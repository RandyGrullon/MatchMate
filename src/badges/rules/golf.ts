/**
 * Validación de golf para las insignias (docs/insignias.md §1.7.5): tarjeta contada (G1) y validada (G2: con
 * marcador de otra cuenta en el grupo y campo sano), hoyos de la tarjeta y actividad. Todo sobre la copia del campo
 * que guarda la ronda (`golf_rounds.course`), con los helpers de src/sports/golf.
 */
import { findTee, isValidIndex, teeHoles, teeRating, MAX_SLOPE, MIN_SLOPE, type PlayedHole, type TeeRating } from '../../sports/golf/course';
import { isValidStrokes } from '../../sports/golf/scoring';
import type { ActivityDay, SnapGolfCard, SnapGolfRound } from '../snapshot';

/** Hoyos que juega la tarjeta con el par y el SI de su salida; null si la salida no está en la copia del campo. */
export function cardHoles(card: Pick<SnapGolfCard, 'tee_id'>, round: Pick<SnapGolfRound, 'course' | 'nine'>): PlayedHole[] | null {
  try {
    return teeHoles(round.course, findTee(round.course, card.tee_id), round.nine);
  } catch {
    return null;
  }
}

/** G1: firmada, sin DQ, ronda cerrada y todos los hoyos de la vuelta con golpes o bola levantada. */
export function isG1(card: SnapGolfCard, round: SnapGolfRound): boolean {
  if (card.status !== 'firmada' || card.dq || round.status !== 'cerrada' || card.event_id !== round.event_id) return false;
  const holes = cardHoles(card, round);
  if (!holes || card.strokes.length !== holes.length) return false;
  return holes.every((_, i) => isValidStrokes(card.strokes[i]) || !!card.picked_up?.[i]);
}

/** Tarjeta de 9 hoyos (ida o vuelta de un campo de 18, o un campo de 9). */
export const isNineHoles = (card: Pick<SnapGolfCard, 'tee_id'>, round: Pick<SnapGolfRound, 'course' | 'nine'>): boolean => cardHoles(card, round)?.length === 9;

/**
 * Campo sano en la copia de la ronda: pares de 3 a 5, par total 68–74 (34–37 en 9 hoyos), rating 55–80 (en 9
 * hoyos, la mitad) y slope 55–155.
 */
export function saneField(round: Pick<SnapGolfRound, 'course' | 'nine'>, teeId: string): boolean {
  const holes = cardHoles({ tee_id: teeId }, round);
  if (!holes || (holes.length !== 9 && holes.length !== 18)) return false;
  if (!holes.every((h) => h.par >= 3 && h.par <= 5)) return false;
  const par = holes.reduce((n, h) => n + h.par, 0);
  const nine = holes.length === 9;
  if (nine ? par < 34 || par > 37 : par < 68 || par > 74) return false;
  const r = roundRating(round, teeId);
  const [lo, hi] = nine ? [27.5, 40] : [55, 80];
  return !!r && r.rating >= lo && r.rating <= hi && r.slope >= MIN_SLOPE && r.slope <= MAX_SLOPE;
}

/** Rating, slope y par de la salida para los hoyos de la ronda (la vuelta de 9 si es de 9); null si no existe. */
export function roundRating(round: Pick<SnapGolfRound, 'course' | 'nine'>, teeId: string): TeeRating | null {
  try {
    return teeRating(round.course, findTee(round.course, teeId), round.nine).rating;
  } catch {
    return null;
  }
}

/** Marcador: otra tarjeta G1 del mismo evento y grupo, de otra cuenta. */
export function hasMarker(card: SnapGolfCard, cards: readonly SnapGolfCard[], round: SnapGolfRound, userOf: (playerId: string) => string | null): boolean {
  if (card.group_no == null) return false;
  const me = userOf(card.player_id);
  return cards.some((c) => {
    if (c.id === card.id || c.event_id !== card.event_id || c.group_no !== card.group_no || !isG1(c, round)) return false;
    const u = userOf(c.player_id);
    return !!u && u !== me;
  });
}

/** Cuentas que marcaron la tarjeta (evidencia de las hazañas). */
export function markersOf(card: SnapGolfCard, cards: readonly SnapGolfCard[], round: SnapGolfRound, userOf: (playerId: string) => string | null): string[] {
  if (card.group_no == null) return [];
  const me = userOf(card.player_id);
  const out = new Set<string>();
  for (const c of cards) {
    if (c.id === card.id || c.event_id !== card.event_id || c.group_no !== card.group_no || !isG1(c, round)) continue;
    const u = userOf(c.player_id);
    if (u && u !== me) out.add(u);
  }
  return [...out];
}

/** G2: G1, marcador de otra cuenta en el grupo y campo sano. */
export function isG2(card: SnapGolfCard, round: SnapGolfRound, cards: readonly SnapGolfCard[], userOf: (playerId: string) => string | null): boolean {
  return isG1(card, round) && saneField(round, card.tee_id) && hasMarker(card, cards, round, userOf);
}

/** Bruto sin hoyos levantados (null si levantó alguno o falta un hoyo). */
export function grossOf(card: Pick<SnapGolfCard, 'strokes' | 'picked_up'>, holes: readonly PlayedHole[]): number | null {
  let total = 0;
  for (let i = 0; i < holes.length; i++) {
    const s = card.strokes[i];
    if (card.picked_up?.[i] || !isValidStrokes(s)) return null;
    total += s;
  }
  return total;
}

/** Índice escrito a mano, si es válido (nunca se usa solo: ver `cappedIndex` en baselines.ts). */
export const declaredIndex = (card: Pick<SnapGolfCard, 'hcp_index'>): number | null => (isValidIndex(card.hcp_index) ? card.hcp_index : null);

/**
 * Actividad válida de golf: una tarjeta G1 da el día de la ronda. Oficial si la ronda cerrada tuvo 3+ tarjetas G1.
 */
export function golfActivity(
  cards: readonly SnapGolfCard[],
  rounds: readonly SnapGolfRound[],
  ctx: { userOf: (playerId: string) => string | null; dateOf: (eventId: string) => string | null },
): ActivityDay[] {
  const byEvent = new Map(rounds.map((r) => [r.event_id, r]));
  const counted = cards.filter((c) => {
    const r = byEvent.get(c.event_id);
    return !!r && isG1(c, r);
  });
  const perEvent = new Map<string, number>();
  for (const c of counted) perEvent.set(c.event_id, (perEvent.get(c.event_id) ?? 0) + 1);
  const out: ActivityDay[] = [];
  for (const c of counted) {
    const date = ctx.dateOf(c.event_id);
    if (!date) continue;
    out.push({ sport: 'golf', league_id: c.league_id, player_id: c.player_id, user_id: ctx.userOf(c.player_id), date, official: (perEvent.get(c.event_id) ?? 0) >= 3 });
  }
  return out;
}
