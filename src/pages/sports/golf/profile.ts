/**
 * Los números de golf de un jugador sin React (lo usan GolfProfile.tsx de la web y el perfil de golf de la app): los
 * números de Lite y de Pro, cómo le fue hoyo por hoyo, sus últimas rondas y la línea de cada ronda.
 */
import type { GolfStats } from '../../../sports/golf/stats';
import { toParText, type PlayedRound } from './logic';

/** Un número del perfil (NumbersGrid de la web): el nombre, el valor y si va en el color del deporte. */
export interface GolfNumber {
  label: string;
  value: string | number;
  accent?: boolean;
}

const dec = (v: number | null | undefined) => v?.toLocaleString('es-DO') ?? '–';

/** Con solo rondas de 9 hoyos, los números son de 9 (y lo dice: «Mejor bruto (9 hoyos)»). */
function mainOf(stats: GolfStats) {
  const nineOnly = stats.eighteen.rounds === 0;
  return { main: nineOnly ? stats.nine : stats.eighteen, nine: nineOnly ? ' (9 hoyos)' : '' };
}

/** Lite: Mejor bruto · Promedio · Birdies. */
export function liteNumbers(stats: GolfStats): GolfNumber[] {
  const { main, nine } = mainOf(stats);
  return [
    { label: `Mejor bruto${nine}`, value: main.bestGross ?? '–', accent: true },
    { label: 'Promedio', value: dec(main.avgGross) },
    { label: 'Birdies', value: stats.birdies },
  ];
}

/** Pro: los 6 números. */
export function fullNumbers(stats: GolfStats): GolfNumber[] {
  const { main, nine } = mainOf(stats);
  return [
    { label: `Mejor bruto${nine}`, value: main.bestGross ?? '–', accent: true },
    { label: `Mejor neto${nine}`, value: main.bestNet ?? '–' },
    { label: 'Promedio', value: dec(main.avgGross) },
    { label: 'Stableford medio', value: dec(main.avgPoints) },
    { label: 'Birdies', value: stats.birdies },
    { label: 'Pares', value: stats.pars },
  ];
}

/** Pro: hoyo por hoyo (eagles, bogeys, putts…). */
export function holeNumbers(stats: GolfStats): GolfNumber[] {
  return [
    { label: 'Eagles o mejor', value: stats.eagles + stats.albatrosses },
    { label: 'Bogeys', value: stats.bogeys },
    { label: 'Doble o peor', value: stats.doubleBogeys },
    { label: 'Hoyos en uno', value: stats.holesInOne },
    { label: 'Putts por ronda', value: dec(stats.avgPutts) },
    { label: 'Putts por hoyo', value: dec(stats.puttsPerHole) },
  ];
}

/** Las últimas 10 rondas, la más nueva primero (`dateOf`: el día de cada evento). */
export function recentRounds(rounds: readonly PlayedRound[], dateOf: (eventId: string) => string | undefined): PlayedRound[] {
  return [...rounds].sort((a, b) => (dateOf(b.eventId) ?? '').localeCompare(dateOf(a.eventId) ?? '')).slice(0, 10);
}

/** «1 ronda firmada o cerrada» / «4 rondas firmadas o cerradas». */
export const roundsCount = (n: number) => (n === 1 ? '1 ronda firmada o cerrada' : `${n} rondas firmadas o cerradas`);

/** La línea de una ronda: el campo, los hoyos, el neto, los puntos y si quedó sin terminar. */
export function roundLine(r: PlayedRound): string {
  return [r.round.courseName, `${r.card.strokes.length} hoyos`, `neto ${toParText(r.stableford.netToPar)}`, `${r.stableford.points} pts`, !r.score.complete ? 'sin terminar' : null]
    .filter(Boolean)
    .join(' · ');
}
