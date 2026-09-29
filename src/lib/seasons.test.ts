import { describe, expect, it } from 'vitest';
import { currentSeason, filterBySeason, inSeason, pickSeason, previousSeason, seasonOfDay, sortSeasons } from './seasons';

const s2025 = { id: 'a', startsOn: '2025-01-01', endsOn: '2025-12-20', status: 'closed' as const };
const s2026 = { id: 'b', startsOn: '2026-01-10', endsOn: '2026-06-30', status: 'active' as const };
const all = [s2025, s2026];

describe('temporadas: de cuál es cada día', () => {
  it('la cerrada va de su inicio a su fin; la activa no tiene fin para contar juegos', () => {
    expect(inSeason(s2025, '2025-01-01')).toBe(true);
    expect(inSeason(s2025, '2025-12-20')).toBe(true);
    expect(inSeason(s2025, '2025-12-21')).toBe(false);
    expect(inSeason(s2026, '2026-01-09')).toBe(false);
    // Pasó el fin previsto y sigue activa: cuenta.
    expect(inSeason(s2026, '2026-09-28')).toBe(true);
    expect(inSeason({ ...s2025, endsOn: null }, '2030-01-01')).toBe(true);
  });

  it('el día cae en la que empezó más tarde; entre dos temporadas, en ninguna', () => {
    expect(seasonOfDay(all, '2025-06-01')?.id).toBe('a');
    expect(seasonOfDay(all, '2026-02-01')?.id).toBe('b');
    expect(seasonOfDay(all, '2025-12-31')).toBeNull();
    expect(seasonOfDay(all, '2024-12-31')).toBeNull();
  });

  it('la de ahora es la activa (o la última); la anterior es la que empezó antes', () => {
    expect(currentSeason(all)?.id).toBe('b');
    expect(currentSeason([s2025])?.id).toBe('a');
    expect(currentSeason([])).toBeNull();
    expect(previousSeason(all, s2026)?.id).toBe('a');
    expect(previousSeason(all, s2025)).toBeNull();
    expect(previousSeason(all, null)).toBeNull();
    expect(sortSeasons(all).map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('la elegida en la dirección o, si no existe, la de ahora; y filtrar por su rango', () => {
    expect(pickSeason(all, 'a')?.id).toBe('a');
    expect(pickSeason(all, 'zzz')?.id).toBe('b');
    expect(pickSeason(all, null)?.id).toBe('b');
    const events = [{ d: '2025-03-01' }, { d: '2026-03-01' }];
    expect(filterBySeason(events, s2025, (e) => e.d)).toEqual([{ d: '2025-03-01' }]);
    expect(filterBySeason(events, null, (e) => e.d)).toHaveLength(2);
  });
});
