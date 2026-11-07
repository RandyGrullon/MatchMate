import { describe, expect, it } from 'vitest';
import type { Match } from '../../../lib/data/matches';
import type { PlayoffSeries } from '../../../lib/data/playoffs';
import { BackendError } from '../../../lib/backend/types';
import { byesText, createPlayoffError, gameResult, initialPlayoffSize, playoffSizeKey, playoffSizes, seedOrder, seriesLabels, shownSeries } from './playoffs';

const s = (p: Partial<PlayoffSeries>): PlayoffSeries => ({
  id: 'x',
  playoffId: 'po',
  round: 1,
  slot: 1,
  bestOf: 3,
  teamA: null,
  teamB: null,
  seedA: null,
  seedB: null,
  labelA: null,
  labelB: null,
  winsA: 0,
  winsB: 0,
  winner: null,
  bye: false,
  nextSeries: null,
  nextSide: null,
  ...p,
});

describe('armar los playoffs', () => {
  const teams = [
    { id: 'c', name: 'Equipo C' },
    { id: 'a', name: 'Equipo A' },
    { id: 'b', name: 'Equipo B' },
  ];

  it('la siembra: la tabla primero y los demás por nombre', () => {
    expect(seedOrder(teams, ['b', 'x'])).toEqual(['b', 'a', 'c']);
  });

  it('los tamaños, el propuesto y el elegido', () => {
    expect(playoffSizes(5)).toEqual([2, 4]);
    expect(initialPlayoffSize([2, 4])).toBe(4);
    expect(initialPlayoffSize([2])).toBe(2);
    expect(initialPlayoffSize([])).toBe(0);
    expect(playoffSizeKey([2, 4], ['a', 'b'], ['a', 'b', 'c'])).toBe(2);
    expect(playoffSizeKey([2, 4], ['b', 'a'], ['a', 'b', 'c'])).toBeUndefined();
  });

  it('los que pasan directo', () => {
    expect(byesText(3)).toBe('El 1.º pasa directo a la segunda ronda (no son potencia de 2).');
    expect(byesText(6)).toBe('Los 2 primeros pasan directo a la segunda ronda (no son potencia de 2).');
    expect(byesText(4)).toBeNull();
  });

  it('los errores de la base', () => {
    expect(createPlayoffError(new BackendError('duplicado', 'validation'))).toBe('Ya hay un playoff en esta temporada.');
    expect(createPlayoffError(new Error('otra cosa'))).toBeNull();
  });
});

describe('la llave', () => {
  const base = {
    sides: [
      { teamId: 'a', label: 'Equipo A' },
      { teamId: 'b', label: 'Equipo B' },
    ],
  } as unknown as Match;

  it('el resultado de un juego', () => {
    expect(gameResult({ ...base, status: 'confirmed', winner: 2, score: { text: '70-64' } }, () => null)).toBe('Equipo B 70-64');
    expect(gameResult({ ...base, status: 'walkover', winner: 1, score: null }, () => null)).toBe('W.O.');
    expect(gameResult({ ...base, status: 'confirmed', winner: null, score: { text: '1-1' } }, () => null)).toBe('Empate 1-1');
  });

  it('las series que se ven y los nombres copiados', () => {
    const list = [
      s({ id: '1', round: 1, slot: 1, teamA: 'a', teamB: 'b', labelA: 'Equipo A' }),
      s({ id: '2', round: 2, slot: 1, teamA: 'a', teamB: 'c' }),
      s({ id: '3', round: 1, slot: 2, bye: true, teamA: 'c' }),
    ];
    expect(shownSeries({ series: list }).map((x) => x.id)).toEqual(['2', '1']);
    expect(seriesLabels({ series: list }).get('a')).toBe('Equipo A');
  });
});
