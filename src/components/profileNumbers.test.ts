import { describe, expect, it } from 'vitest';
import type { PlayerStats } from '../lib/stats';
import { globalPendingNote, globalWhatLine, sportLeaguesTitle, statsLine } from './profileNumbers';

const stats = (over: Partial<PlayerStats>): PlayerStats => ({ games: 0, pins: 0, high: 0, highSeries: 0, pending: 0, autoAverage: null, ...over }) as PlayerStats;

describe('Por liga y temporada', () => {
  it('lo que suma el total', () => {
    expect(
      globalWhatLine({
        all: stats({ games: 12 }),
        perLeague: [{ lid: 'liga-1', name: 'Liga de Ejemplo', stats: stats({ games: 9 }) }],
        practices: 3,
        tournaments: 1,
        solo: stats({ games: 3 }),
      }),
    ).toBe('12 juegos · 1 liga · 3 prácticas · 1 torneo · 3 juegos sueltos');
    // Solo juegos sueltos: sin ligas ni prácticas.
    expect(globalWhatLine({ all: stats({ games: 1 }), perLeague: [], practices: 0, tournaments: 0, solo: stats({ games: 1 }) })).toBe('1 juego · 1 juego suelto');
  });

  it('la nota de lo que falta aprobar', () => {
    expect(globalPendingNote(0)).toBe('Solo cuentan los juegos que ya cuentan en cada liga.');
    expect(globalPendingNote(1)).toBe('Solo cuentan los juegos que ya cuentan en cada liga. 1 juego por aprobar todavía no suma.');
    expect(globalPendingNote(2)).toBe('Solo cuentan los juegos que ya cuentan en cada liga. 2 juegos por aprobar todavía no suman.');
  });

  it('la línea de cada liga', () => {
    expect(statsLine(stats({ games: 9, pins: 1800, high: 245, pending: 2 }))).toBe('9 juegos · puntaje 1,800 · mejor 245 · 2 por aprobar'.replace('1,800', (1800).toLocaleString('es-DO')));
    expect(statsLine(stats({ games: 0 }))).toBe('0 juegos');
    expect(sportLeaguesTitle(true)).toBe('Mis ligas');
    expect(sportLeaguesTitle(false)).toBe('Otros deportes');
  });
});
