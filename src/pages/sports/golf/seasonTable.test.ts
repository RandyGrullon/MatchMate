import { describe, expect, it } from 'vitest';
import { golfSeasonFilter } from './seasonTable';

/** Qué rondas del golf entran en el orden de mérito de una temporada (golfSeasonFilter). */
describe('rondas de golf por temporada', () => {
  const dates = new Map([
    ['dic25', '2025-12-14'],
    ['ene26', '2026-01-11'],
    ['jul26', '2026-07-05'],
  ]);
  const league = { seasonStart: '2026-01-01', seasonEnd: '2026-06-30' };

  it('una cerrada: solo las de sus fechas; la activa: de su inicio en adelante (su fin es solo el previsto)', () => {
    const closed = golfSeasonFilter({ startsOn: '2025-01-01', endsOn: '2025-12-31', status: 'closed' }, league, dates);
    expect([...dates.keys()].filter(closed)).toEqual(['dic25']);
    const active = golfSeasonFilter({ startsOn: '2026-01-01', endsOn: '2026-06-30', status: 'active' }, league, dates);
    expect([...dates.keys()].filter(active)).toEqual(['ene26', 'jul26']);
    // Una ronda de un evento que no se conoce no entra.
    expect(active('otro')).toBe(false);
  });

  it('sin temporada (datos de antes): las fechas de la liga', () => {
    expect([...dates.keys()].filter(golfSeasonFilter(null, league, dates))).toEqual(['ene26']);
    expect([...dates.keys()].filter(golfSeasonFilter(null, {}, dates))).toEqual(['dic25', 'ene26', 'jul26']);
  });
});
