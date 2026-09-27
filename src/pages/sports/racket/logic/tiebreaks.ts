/**
 * Cómo se ordena la tabla, en palabras, según el deporte (lo que calculan pairStandings y seasonPlayerTable con
 * src/sports/formats/standings.ts). Puro.
 */
import type { RacketSport } from '../../../../sports/racket';
import type { PointsScheme } from './results';

/** Desempates de la tabla de una liga, un grupo o una caja. */
export function tiebreakText(sport: RacketSport): string {
  if (sport === 'pickleball') {
    return 'Orden (round robin de USA Pickleball): partidos ganados → ganados entre los empatados → dif. de puntos → dif. de puntos entre los empatados → dif. de puntos contra el de arriba → puntos a favor → sorteo.';
  }
  return 'Desempates: puntos → enfrentamiento directo (o minitabla si son 3 o más) → dif. de sets → dif. de juegos → juegos a favor → sorteo.';
}

/** Puntos de la tabla: «ganar 3, perder 1» (o «ganar 2, perder 0»); pickleball cuenta partidos ganados. */
export function pointsText(sport: RacketSport, scheme: PointsScheme = 'standard'): string {
  if (sport === 'pickleball') return 'cuenta los partidos ganados';
  return scheme === '2-0' ? 'ganar 2, perder 0' : 'ganar 3, perder 1';
}

/** Nota del ranking individual de la temporada. */
export function rankingNote(sport: RacketSport): string {
  if (sport === 'pickleball') return 'Cada jugador suma lo de su lado en los partidos de liga, torneo, cajas y escalera: partidos ganados, luego dif. de juegos y de puntos.';
  return 'Cada jugador suma lo de su lado en los partidos a sets (liga, torneos, cajas y escalera): ganar 3, perder 1, W.O. 0.';
}
