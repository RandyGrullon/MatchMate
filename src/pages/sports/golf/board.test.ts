/** Lo puro del leaderboard de golf (board.ts): qué dice cada fila, la nota de Pro y la línea de abajo. Datos ficticios. */
import { describe, expect, it } from 'vitest';
import { boardColumns, boardFootnote, boardLiteLine, boardPerRound, boardProNote, boardShareSubtitle, boardStatus, boardThru } from './board';
import type { BoardRow } from './logic';

const round = (o: { thru: number; points?: number; net?: number | null; gross?: number | null }) => ({ points: 0, net: null, gross: null, ...o }) as unknown as BoardRow['rounds'][number];
const row = (o: Partial<BoardRow> = {}): BoardRow =>
  ({
    id: 'p1',
    rank: 1,
    rounds: [],
    value: 0,
    gross: 36,
    net: 34,
    points: 20,
    toPar: 0,
    netToPar: -2,
    holesPlayed: 9,
    thru: 9,
    roundsDone: 1,
    complete: true,
    dq: false,
    card: null,
    unfinished: false,
    ...o,
  }) as BoardRow;

describe('el leaderboard de golf', () => {
  it('sin puesto', () => {
    expect(boardStatus(row())).toBeNull();
    expect(boardStatus(row({ unfinished: true }))).toBe('No terminó');
    expect(boardStatus(row({ dq: true, card: { dq: true } as BoardRow['card'] }))).toBe('Descalificado');
    expect(boardStatus(row({ dq: true }))).toBe('Recogió');
  });

  it('los hoyos jugados en la ronda y en el torneo', () => {
    expect(boardThru(row({ thru: 9 }), false, 36, 9)).toBe('F');
    expect(boardThru(row({ thru: 4 }), false, 36, 9)).toBe('4');
    expect(boardThru(row({ thru: 4, holesPlayed: 22 }), true, 36, 18)).toBe('22');
    expect(boardThru(row({ thru: 0 }), true, 36, 18)).toBe('–');
  });

  it('lo de cada ronda del torneo y las notas', () => {
    const r = row({ rounds: [round({ thru: 18, points: 36, net: 70, gross: 80 }), null, round({ thru: 0 })], decidedBy: 'últimos 9' });
    expect(boardPerRound(r, { whole: false, stableford: true, net: true })).toBe('');
    expect(boardPerRound(r, { whole: true, stableford: true, net: true })).toBe('R1 36');
    expect(boardPerRound(r, { whole: true, stableford: false, net: false })).toBe('R1 80');
    expect(boardProNote(r, { whole: true, stableford: false, net: true })).toBe('desempate: últimos 9 · R1 70');
    expect(boardLiteLine(row({ thru: 3 }), { whole: false, stableford: false, net: false, holes: 9, roundHoles: 9 })).toBe('3 hoyos');
    expect(boardLiteLine(row({ thru: 1 }), { whole: false, stableford: false, net: false, holes: 9, roundHoles: 9 })).toBe('1 hoyo');
    expect(boardLiteLine(row({ thru: 0 }), { whole: false, stableford: false, net: false, holes: 9, roundHoles: 9 })).toBe('Sin empezar');
    expect(boardLiteLine(row(), { whole: false, stableford: false, net: false, holes: 9, roundHoles: 9 })).toBe('Terminó');
  });

  it('las columnas, la imagen y la línea de abajo', () => {
    expect(boardColumns({ stableford: true, net: true })).toEqual({ main: 'Pts', last: 'Neto' });
    expect(boardColumns({ stableford: false, net: true })).toEqual({ main: 'Neto', last: 'Pts' });
    expect(boardColumns({ stableford: false, net: false }).main).toBe('Total');
    expect(boardShareSubtitle({ whole: true, rounds: 3, roundNo: 2, courseName: 'Campo de Ejemplo', mode: 'Bruto' })).toBe('Torneo (3 rondas) · Campo de Ejemplo · Bruto');
    expect(boardShareSubtitle({ whole: false, rounds: 1, roundNo: null, courseName: 'Campo de Ejemplo', mode: 'Neto' })).toBe('Campo de Ejemplo · Neto');
    expect(boardFootnote(false, { stableford: false, net: false })).toBe('Toca un jugador para ver su tarjeta.');
    expect(boardFootnote(true, { stableford: false, net: true })).toBe('Empates: countback (últimos 9, 6, 3 y 1 hoyos, con la parte del handicap). F = terminó.');
    expect(boardFootnote(true, { stableford: true, net: true })).toBe('Empates: countback (últimos 9, 6, 3 y 1 hoyos). F = terminó.');
  });
});
