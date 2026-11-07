/** Lo puro del partido de fútbol (matchView.ts): el acta completa, goles por tiempo y el lado de un autogol. Datos ficticios. */
import { describe, expect, it } from 'vitest';
import { actaRows, eventPlayerSide, periodsLineParts, playerLineNotes, sidePlayerLines, stateFromSnapshot } from './matchView';

const names = ['Equipo Uno', 'Equipo Dos'] as const;
const who = (_side: 1 | 2, id?: string) => (id ? `#10 ${id}` : '');

describe('actaRows', () => {
  it('gol con asistencia, cambio, penal y fin del tiempo', () => {
    const rows = actaRows(
      [
        { kind: 'goal', side: 1, player: 'Jugador Uno', assist: 'Jugador Dos', period: 1, minute: '23' },
        { kind: 'sub', side: 2, player: 'Jugador Tres', in: 'Jugador Cuatro', period: 2, minute: null },
        { kind: 'shootout', side: 2, player: undefined, scored: false, period: 5, minute: null },
        { kind: 'period_end', side: null, period: 1, minute: null },
      ],
      names,
      who,
    );
    expect(rows[0]).toEqual({ when: "23'", kind: 'goal', title: 'Gol', team: 'Equipo Uno', detail: '#10 Jugador Uno (asistencia de #10 Jugador Dos)' });
    expect(rows[1]).toMatchObject({ when: '2T', title: 'Cambio', detail: 'sale #10 Jugador Tres, entra #10 Jugador Cuatro' });
    expect(rows[2]).toMatchObject({ title: 'Penal', detail: 'Equipo Dos: fallado' });
    expect(rows[3]).toMatchObject({ when: '', title: 'Fin del tiempo', team: null });
  });
  it('autogol: el jugador es del otro lado', () => {
    expect(eventPlayerSide({ kind: 'own_goal', side: 1 })).toBe(2);
    expect(eventPlayerSide({ kind: 'goal', side: 1 })).toBe(1);
  });
});

describe('periodsLineParts', () => {
  it('dos tiempos, prórroga y penales', () => {
    expect(periodsLineParts({ periods: [[1, 0], [0, 1], [0, 0]], pens: [4, 3] })).toEqual({ periods: ['1T: 1-0', '2T: 0-1', 'Pr.1: 0-0'], pens: 'Penales: 4-3' });
  });
  it('un solo tiempo sin penales: nada', () => {
    expect(periodsLineParts({ periods: [[2, 1]] })).toEqual({ periods: [], pens: null });
    expect(periodsLineParts(null)).toEqual({ periods: [], pens: null });
  });
});

describe('stateFromSnapshot', () => {
  it('sin acta del anotador: null', () => {
    expect(stateFromSnapshot(null)).toBeNull();
    expect(stateFromSnapshot({ algo: 1 })).toBeNull();
  });
});

describe('la tabla «Jugadores» del partido (Pro)', () => {
  const line = (playerId: string, side: 1 | 2, extra: Partial<Parameters<typeof playerLineNotes>[0]> = {}) => ({
    playerId,
    side,
    played: true,
    goals: 0,
    assists: 0,
    ownGoals: 0,
    yellows: 0,
    red: null,
    keeper: false,
    conceded: 0,
    ...extra,
  });
  it('los de un lado por dorsal (sin dorsal, al final)', () => {
    const jerseys: Record<string, number | null> = { a: 10, b: null, c: 3, d: 1 };
    const rows = sidePlayerLines([line('a', 1), line('b', 1), line('c', 1), line('d', 2)], 1, (l) => jerseys[l.playerId]);
    expect(rows.map((l) => l.playerId)).toEqual(['c', 'a', 'b']);
  });
  it('portero y banco', () => {
    expect(playerLineNotes({ keeper: true, played: true, conceded: 2 })).toEqual(['(portero, 2 rec.)']);
    expect(playerLineNotes({ keeper: true, played: false, conceded: 0 })).toEqual(['(portero)', '(banco)']);
    expect(playerLineNotes({ keeper: false, played: true, conceded: 0 })).toEqual([]);
  });
});

