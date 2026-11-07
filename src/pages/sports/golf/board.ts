/**
 * Lo que no es pantalla del leaderboard de golf (GolfBoard.tsx de la web y el de la app del teléfono): qué dice cada fila
 * (sin puesto, los hoyos jugados, lo de cada ronda de un torneo), la nota de Pro, el subtítulo de la imagen y la línea de
 * abajo. Sin React.
 */
import { thruText, type BoardRow } from './logic';

/** Sin puesto: «No terminó», «Descalificado» o «Recogió»; null si tiene puesto. */
export const boardStatus = (r: Pick<BoardRow, 'unfinished' | 'dq' | 'card'>): string | null =>
  r.unfinished ? 'No terminó' : r.dq ? (r.card?.dq ? 'Descalificado' : 'Recogió') : null;

/**
 * Los hoyos jugados de una fila («7», «F» o «–»). En el torneo (`whole`) cuentan todos los hoyos de sus rondas
 * (`holes`); en la ronda, los de la ronda (`roundHoles`).
 */
export const boardThru = (r: Pick<BoardRow, 'thru' | 'holesPlayed'>, whole: boolean, holes: number, roundHoles: number): string =>
  thruText(r.thru && whole ? r.holesPlayed : r.thru, whole ? holes : roundHoles);

/** En el torneo: lo de cada ronda («R1 36 · R2 34»: puntos en Stableford, neto o bruto); vacío en una ronda. */
export function boardPerRound(r: Pick<BoardRow, 'rounds'>, o: { whole: boolean; stableford: boolean; net: boolean }): string {
  if (!o.whole) return '';
  return r.rounds
    .map((s, i) => (s && s.thru ? `R${i + 1} ${o.stableford ? s.points : ((o.net ? s.net : s.gross) ?? '–')}` : null))
    .filter(Boolean)
    .join(' · ');
}

/** Lite: debajo del nombre, sin puesto o cómo va («Terminó», «Sin empezar», «7 hoyos») y lo de cada ronda. */
export function boardLiteLine(r: BoardRow, o: { whole: boolean; stableford: boolean; net: boolean; holes: number; roundHoles: number }): string {
  const t = boardThru(r, o.whole, o.holes, o.roundHoles);
  return [boardStatus(r) ?? (t === 'F' ? 'Terminó' : t === '–' ? 'Sin empezar' : `${t} ${t === '1' ? 'hoyo' : 'hoyos'}`), boardPerRound(r, o)].filter(Boolean).join(' · ');
}

/** Pro: debajo del nombre, sin puesto, el desempate («desempate: últimos 9») y lo de cada ronda. */
export function boardProNote(r: BoardRow, o: { whole: boolean; stableford: boolean; net: boolean }): string {
  return [boardStatus(r), r.decidedBy ? `desempate: ${r.decidedBy}` : null, boardPerRound(r, o)].filter(Boolean).join(' · ');
}

/** Pro: el encabezado de la columna grande («Pts», «Neto» o «Total») y el de la última («Neto» o «Pts»). */
export const boardColumns = (o: { stableford: boolean; net: boolean }) => ({ main: o.stableford ? 'Pts' : o.net ? 'Neto' : 'Total', last: o.stableford ? 'Neto' : 'Pts' });

/** El subtítulo de la imagen del leaderboard: «Torneo (3 rondas)» o «Ronda 2», el campo y cómo se ve. */
export function boardShareSubtitle(o: { whole: boolean; rounds: number; roundNo: number | null; courseName: string; mode: string }): string {
  return [o.whole ? `Torneo (${o.rounds} rondas)` : o.roundNo ? `Ronda ${o.roundNo}` : null, o.courseName, o.mode].filter(Boolean).join(' · ');
}

/** La línea de abajo: en Pro, cómo se rompen los empates; en Lite, que tocar abre la tarjeta. */
export const boardFootnote = (pro: boolean, o: { stableford: boolean; net: boolean }): string =>
  pro ? `Empates: countback (últimos 9, 6, 3 y 1 hoyos${o.net && !o.stableford ? ', con la parte del handicap' : ''}). F = terminó.` : 'Toca un jugador para ver su tarjeta.';
