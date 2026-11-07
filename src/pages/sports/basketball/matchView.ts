import { twoNumbersParser } from '../../../components/match/parsers';
import type { Side } from '../../../sports/types';
import type { ScoreLine } from './adapter';

/**
 * Lo puro del partido de baloncesto (bits.tsx y MatchDetail.tsx): el lector de «solo resultado», el nombre de cada
 * periodo en «Por cuarto» y el orden de los puntos de cada jugador. Lo usan la web y la app del teléfono.
 */

/** Lector de «solo resultado» del baloncesto: «78-72» (sin empates). */
export const basketballParser = twoNumbersParser({ allowDraw: false, max: 300, unit: 'puntos' });

/** «1C 2C 3C 4C Pr. Pr.2» (o «1T 2T» con 2 mitades): el encabezado de cada periodo. */
export const periodHeader = (i: number, periodsPerGame: number) =>
  i >= periodsPerGame ? `Pr.${i - periodsPerGame > 0 ? i - periodsPerGame + 1 : ''}` : periodsPerGame === 2 ? `${i + 1}T` : `${i + 1}C`;

/** Los puntos de un lado, del que más anotó al que menos. */
export const boxRows = (lines: readonly ScoreLine[], side: Side) => lines.filter((l) => l.side === side).sort((a, b) => b.points - a.points);
