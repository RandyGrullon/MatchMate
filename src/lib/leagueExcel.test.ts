/**
 * El Excel de la liga sin escribir el archivo: qué se puede bajar, de qué eventos se traen los juegos, el nombre del
 * archivo y las hojas (con datos ficticios).
 */
import { describe, expect, it } from 'vitest';
import { leagueExcelFileName, leagueExcelScopes, leagueExcelSheets, scopeEventIds } from './leagueExcel';
import type { Season } from './seasons';
import type { BowlingEvent, Entry, Player } from './types';

const season = (over: Partial<Season>): Season => ({
  id: 's1',
  name: 'Temporada de Ejemplo',
  startsOn: '2026-01-01',
  endsOn: '2026-06-30',
  status: 'active',
  closedAt: null,
  closedBy: null,
  standings: null,
  awards: [],
  playoffs: [],
  ...over,
});

const event = (id: string, date: string, type: BowlingEvent['type'] = 'practica'): BowlingEvent => ({
  id,
  type,
  name: type === 'torneo' ? 'Copa de Ejemplo' : '',
  date,
  games: 3,
  hcpBase: 0,
  hcpPercent: 0,
  teams: {},
  playerCount: 0,
});

const entry = (id: string, eventId: string, playerId: string, scores: (number | null)[]): Entry => ({
  id,
  eventId,
  playerId,
  teamId: null,
  average: 0,
  handicapOverride: null,
  scores,
  photos: scores.map((s) => (s == null ? null : 'foto')),
});

/** Una liga sin fechas de temporada. */
const NO_DATES = { seasonStart: '', seasonEnd: '' };

const players: Player[] = [
  { id: 'p1', name: 'Jugador Uno', averageOverride: null },
  { id: 'p2', name: 'Jugadora Dos', averageOverride: null },
];

describe('qué se puede bajar', () => {
  it('la temporada en curso va hasta hoy (sin fin); la cerrada, con su fin; y siempre «Toda la liga»', () => {
    expect(leagueExcelScopes(season({}), NO_DATES)).toEqual([
      { key: 'temporada', label: 'Temporada de Ejemplo', from: '2026-01-01', to: undefined },
      { key: 'todo', label: 'Toda la liga', from: undefined, to: undefined },
    ]);
    expect(leagueExcelScopes(season({ status: 'closed' }), NO_DATES)[0]).toMatchObject({ to: '2026-06-30' });
  });

  it('sin temporadas: las fechas de la liga, si las tiene', () => {
    const scopes = leagueExcelScopes(null, { seasonStart: '2026-01-01', seasonEnd: '2026-06-30' });
    expect(scopes[0].key).toBe('temporada');
    expect(scopes[0].label.startsWith('Temporada (')).toBe(true);
    expect(leagueExcelScopes(null, NO_DATES).map((s) => s.key)).toEqual(['todo']);
  });

  it('solo los eventos de esas fechas', () => {
    const events = [event('e1', '2025-12-20'), event('e2', '2026-02-03'), event('e3', '2026-07-01')];
    expect(scopeEventIds(events, { label: 'x', from: '2026-01-01', to: '2026-06-30' })).toEqual(['e2']);
    expect(scopeEventIds(events, { label: 'Toda la liga' })).toEqual(['e1', 'e2', 'e3']);
  });
});

describe('el archivo', () => {
  it('el nombre sin los caracteres que Windows no deja', () => {
    expect(leagueExcelFileName('Liga/Ejemplo', { label: 'Toda la liga' })).toBe('Liga Ejemplo - Toda la liga.xlsx');
  });

  it('Ranking (con posición desde el mínimo de juegos), Juegos y Eventos', () => {
    const events = [event('e1', '2026-02-03'), event('e2', '2026-02-10', 'torneo')];
    const entries = [
      entry('a1', 'e1', 'p1', [200, 210, 190]),
      entry('a2', 'e2', 'p1', [180, 220, 200]),
      entry('b1', 'e1', 'p2', [150, null, null]),
      // Un jugador borrado: no sale en el Ranking.
      entry('c1', 'e1', 'borrado', [100, 100, 100]),
    ];
    const sheets = leagueExcelSheets({ label: 'Toda la liga' }, events, entries, players);
    expect(sheets.map((s) => s.sheet)).toEqual(['Ranking', 'Juegos', 'Eventos']);
    const ranking = sheets[0].data;
    // Encabezado, Jugador Uno con posición 1, la línea de los que no tienen el mínimo y Jugadora Dos sin posición.
    expect(ranking[1][0]).toMatchObject({ value: 1 });
    expect(ranking[1][1]).toMatchObject({ value: 'Jugador Uno' });
    expect(ranking[2][1]).toMatchObject({ value: 'Con menos de 6 juegos verificados (todavía sin posición)' });
    expect(ranking[3][1]).toMatchObject({ value: 'Jugadora Dos' });
    expect(ranking).toHaveLength(4);
    // Juegos: una fila por participación con juegos (también la del borrado, con su nombre).
    expect(sheets[1].data).toHaveLength(5);
    // Eventos: uno por evento, el torneo con su tipo.
    expect(sheets[2].data[2][2]).toMatchObject({ value: 'Torneo' });
  });
});
