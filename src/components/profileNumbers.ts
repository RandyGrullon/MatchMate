import type { PlayerStats } from '../lib/stats';
import type { BowlingNumbers } from './bowlingNumbers';

/**
 * Yo › «Por liga y temporada» sin dibujar (lo dibujan GlobalStats.tsx en la web y la app del teléfono): la línea de lo
 * que suma el total, la nota de lo que falta aprobar y la línea de cada liga.
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Debajo del promedio de «Todo junto»: «48 juegos · 2 ligas · 12 prácticas · 3 torneos · 6 juegos sueltos». */
export function globalWhatLine(n: Pick<BowlingNumbers, 'all' | 'perLeague' | 'practices' | 'tournaments' | 'solo'>): string {
  const leagues = n.perLeague.length;
  return [
    plural(n.all.games, 'juego', 'juegos'),
    leagues > 0 && plural(leagues, 'liga', 'ligas'),
    leagues > 0 && plural(n.practices, 'práctica', 'prácticas'),
    leagues > 0 && plural(n.tournaments, 'torneo', 'torneos'),
    n.solo && plural(n.solo.games, 'juego suelto', 'juegos sueltos'),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** La nota de «Todo junto»: solo cuentan los juegos que ya cuentan (y cuántos esperan que los aprueben). */
export function globalPendingNote(pending: number): string {
  return `Solo cuentan los juegos que ya cuentan en cada liga.${pending > 0 ? ` ${plural(pending, 'juego', 'juegos')} por aprobar todavía no ${pending === 1 ? 'suma' : 'suman'}.` : ''}`;
}

/** Debajo del nombre en «Por liga»: juegos, puntaje, mejor juego y lo que falta aprobar. */
export function statsLine(stats: Pick<PlayerStats, 'games' | 'pins' | 'high' | 'pending'>): string {
  return [
    plural(stats.games, 'juego', 'juegos'),
    stats.pins > 0 && `puntaje ${stats.pins.toLocaleString('es-DO')}`,
    stats.high > 0 && `mejor ${stats.high}`,
    stats.pending > 0 && `${stats.pending} por aprobar`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Los otros deportes en «Por liga y temporada»: «Mis ligas» si no juega boliche, «Otros deportes» si también. */
export const sportLeaguesTitle = (alone: boolean) => (alone ? 'Mis ligas' : 'Otros deportes');

export const SPORT_LEAGUES_TEXT = 'Cada deporte lleva sus números en la liga: toca una para ver los tuyos.';
