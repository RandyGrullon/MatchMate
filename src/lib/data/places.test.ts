import { describe, expect, it } from 'vitest';
import { leaguePlacePath, placeSportName, placeSummaryText, placesBySport, squadPlacePath, type LeaguePlace } from './places';

const place = (extra: Partial<LeaguePlace>): LeaguePlace => ({
  leagueId: 'L1',
  name: 'Liga',
  kind: 'liga',
  sport: 'padel',
  game: null,
  logo: null,
  visibility: 'public',
  playerId: 'P1',
  summary: { kind: 'none' },
  ...extra,
});

describe('dónde juega', () => {
  it('la línea de cada liga según el deporte', () => {
    expect(placeSummaryText({ kind: 'bowling', games: 24, average: 181.6, high: 245 })).toBe('Promedio 182 · 24 juegos');
    expect(placeSummaryText({ kind: 'bowling', games: 0, average: null, high: null })).toBe('Sin juegos todavía');
    expect(placeSummaryText({ kind: 'matches', played: 15, won: 12, drawn: 0, lost: 3 })).toBe('12 G · 3 P');
    expect(placeSummaryText({ kind: 'matches', played: 8, won: 5, drawn: 1, lost: 2 })).toBe('5 G · 1 E · 2 P');
    expect(placeSummaryText({ kind: 'golf', rounds: 1, best: 78 })).toBe('Mejor ronda 78 · 1 ronda');
    expect(placeSummaryText({ kind: 'swim', results: 5 })).toBe('5 pruebas');
    expect(placeSummaryText({ kind: 'none' })).toBe('');
  });

  it('el nombre del deporte o del juego y los grupos', () => {
    expect(placeSportName({ sport: 'padel', game: null })).toBe('Pádel');
    expect(placeSportName({ sport: 'esports', game: 'valorant' })).toBe('VALORANT');
    expect(placeSportName({ sport: 'esports', game: null })).toBe('Esports');
    const groups = placesBySport([
      place({ leagueId: 'a', sport: 'padel' }),
      place({ leagueId: 'b', sport: 'esports', game: 'valorant' }),
      place({ leagueId: 'c', sport: 'padel', kind: 'torneo' }),
      place({ leagueId: 'd', sport: 'esports', game: 'fortnite' }),
    ]);
    expect(groups.map((g) => [g.label, g.leagues.map((l) => l.leagueId)])).toEqual([
      ['Pádel', ['a', 'c']],
      ['VALORANT', ['b']],
      ['Fortnite', ['d']],
    ]);
  });

  it('a dónde lleva cada lugar', () => {
    expect(leaguePlacePath({ leagueId: 'L1', playerId: 'P1' })).toBe('/l/L1/j/P1');
    expect(squadPlacePath('S1', 'u-1')).toBe('/equipos/S1?jugador=u-1');
  });
});
