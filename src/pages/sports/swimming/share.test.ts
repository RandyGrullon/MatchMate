import { describe, expect, it } from 'vitest';
import type { SwimClub, SwimMeet } from '../../../lib/data/swimming';
import { meetPointsShare, seasonPointsShare } from './share';

const meet = (over: Partial<SwimMeet> = {}): SwimMeet => ({
  id: 'm1',
  type: 'encuentro',
  name: 'Copa de Ejemplo',
  date: '2026-10-10',
  startTime: null,
  announcement: '',
  pool: 25,
  lanes: 6,
  points: [6, 4, 3, 2, 1],
  ageGroups: 'cccan',
  heatsPublishedAt: null,
  finalizedAt: null,
  ...over,
});

const clubs = new Map<string, SwimClub>([['c1', { id: 'c1', name: 'Club de Ejemplo', short: 'CDE', color: '#2563eb', coachId: null }]]);
const row = { teamId: 'c1', points: 10.5, gold: 1, silver: 1, bronze: 0, rank: 1 };

describe('las imágenes de natación', () => {
  it('los puntos de un encuentro: provisional hasta finalizar y el club borrado', () => {
    const open = meetPointsShare(meet(), [row, { ...row, teamId: 'c9', rank: 2 }], clubs);
    expect(open.title).toBe('Copa de Ejemplo');
    expect(open.subtitle).toBe('Puntos por club · Provisional');
    expect(open.note).toBe('Puntos por puesto: 6-4-3-2-1. En un empate se reparten.');
    expect(open.sections[0].rows.map((r) => r.name)).toEqual(['Club de Ejemplo', '(club borrado)']);
    expect(open.sections[0].rows[0].values.at(-1)).toBe('10,5');
    expect(meetPointsShare(meet({ finalizedAt: '2026-10-10T20:00:00Z' }), [row], clubs).subtitle).toBe('Puntos por club');
  });

  it('los puntos de la temporada (por año o por temporada)', () => {
    const table = { clubs: [{ clubId: 'c1', points: 12, gold: 2, silver: 0, bronze: 1, rank: 1, byMeet: {} }], meets: [meet()] };
    const byYear = seasonPointsShare({ leagueName: 'Natación de Ejemplo', shown: '2026', withSeasons: false, table, clubs });
    expect(byYear.subtitle).toBe('Puntos de la temporada 2026');
    expect(byYear.note).toBe('Suma de 1 encuentro. El control de marcas no cuenta.');
    expect(seasonPointsShare({ leagueName: 'Natación de Ejemplo', shown: 'Temporada de Ejemplo', withSeasons: true, table, clubs }).subtitle).toBe('Puntos · Temporada de Ejemplo');
  });
});
