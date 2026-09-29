/** Cinta de periodo (docs/insignias.md §4.5) y nombre accesible de una insignia (§4.6). */
import { describe, expect, it } from 'vitest';
import { RIBBONS, ribbonTextWidth } from './geometry';
import { MONTH_ABBR, RIBBON_MAX, badgeLabel, humanPeriod, periodFromKey, periodLabel, periodRibbon, type PeriodSpec } from './period';

describe('cinta de periodo', () => {
  it('mes, año, temporada, torneo, racha y texto libre', () => {
    expect(periodRibbon({ kind: 'month', year: 2026, month: 10 })).toEqual({ long: 'OCT 2026', short: 'OCT 26' });
    expect(periodRibbon({ kind: 'month', year: 2027, month: 1 })).toEqual({ long: 'ENE 2027', short: 'ENE 27' });
    expect(periodRibbon({ kind: 'year', year: 2026 })).toEqual({ long: '2026', short: '2026' });
    expect(periodRibbon({ kind: 'season', startsOn: '2026-02-01', endsOn: '2026-11-30' })).toEqual({ long: 'TEMP 2026', short: 'T 2026' });
    expect(periodRibbon({ kind: 'season', startsOn: '2026-09-01', endsOn: '2027-05-31' })).toEqual({ long: 'TEMP 26/27', short: 'T 26/27' });
    // Una temporada abierta (sin fin) usa el año de inicio.
    expect(periodRibbon({ kind: 'season', startsOn: '2026-09-01', endsOn: '' })).toEqual({ long: 'TEMP 2026', short: 'T 2026' });
    expect(periodRibbon({ kind: 'tournament', date: '2026-10-17' })).toEqual({ long: 'OCT 2026', short: 'OCT 26', top: 'TORNEO' });
    expect(periodRibbon({ kind: 'streak', count: 10 })).toEqual({ long: '×10', short: '×10' });
    expect(periodRibbon({ kind: 'custom', text: '  los  pinos ' })).toEqual({ long: 'LOS PINOS', short: '' });
    expect(periodRibbon({ kind: 'custom', text: 'copa' })).toEqual({ long: 'COPA', short: 'COPA' });
    expect(periodRibbon({ kind: 'custom', text: 'campeonato nacional' }).long).toBe('CAMPEONATO');
    expect(periodLabel(periodRibbon({ kind: 'month', year: 2026, month: 3 }), 'short')).toBe('MAR 26');
    expect(periodLabel(periodRibbon({ kind: 'month', year: 2026, month: 3 }), 'long')).toBe('MAR 2026');
  });

  it('los largos: la larga cabe en 10 y la corta en 7, y el texto cabe en la cinta sin apretarse', () => {
    const specs: PeriodSpec[] = [
      ...MONTH_ABBR.map((_, i) => ({ kind: 'month' as const, year: 2026, month: i + 1 })),
      { kind: 'year', year: 2030 },
      { kind: 'season', startsOn: '2026-01-01', endsOn: '2026-12-31' },
      { kind: 'season', startsOn: '2029-08-01', endsOn: '2030-06-30' },
      { kind: 'tournament', date: '2026-12-05' },
      { kind: 'streak', count: 999 },
    ];
    for (const s of specs) {
      const r = periodRibbon(s);
      expect(r.long.length, r.long).toBeLessThanOrEqual(RIBBON_MAX.long);
      expect(r.short.length, r.short).toBeLessThanOrEqual(RIBBON_MAX.short);
      expect(ribbonTextWidth(r.long, RIBBONS.long.size, RIBBONS.long.spacing), r.long).toBeLessThanOrEqual(RIBBONS.long.max);
      expect(ribbonTextWidth(r.short, RIBBONS.short.size, RIBBONS.short.spacing), r.short).toBeLessThanOrEqual(RIBBONS.short.max);
    }
  });

  it('claves de periodo: mes y año (las temporadas necesitan sus fechas)', () => {
    expect(periodFromKey('2026-10')).toEqual({ long: 'OCT 2026', short: 'OCT 26' });
    expect(periodFromKey('2026')).toEqual({ long: '2026', short: '2026' });
    expect(periodFromKey('2026-13')).toBeNull();
    expect(periodFromKey('s:9b2c')).toBeNull();
    expect(periodFromKey('-')).toBeNull();
  });

  it('en palabras', () => {
    expect(humanPeriod({ long: 'OCT 2026', short: 'OCT 26' })).toBe('Octubre 2026');
    expect(humanPeriod({ long: 'OCT 2026', short: 'OCT 26' }, false)).toBe('octubre 2026');
    expect(humanPeriod({ long: 'TEMP 26/27', short: 'T 26/27' })).toBe('Temporada 26/27');
    expect(humanPeriod({ long: '2026', short: '2026' })).toBe('2026');
    expect(humanPeriod({ long: '×12', short: '×12' })).toBe('');
    expect(humanPeriod({ long: 'LOS PINOS', short: '' })).toBe('LOS PINOS');
    expect(humanPeriod(null)).toBe('');
  });
});

describe('nombre accesible', () => {
  it('nombre, nivel y periodo; con estado cuando no está desbloqueada', () => {
    const oct = periodRibbon({ kind: 'month', year: 2026, month: 10 });
    expect(badgeLabel('Constancia', { tier: 'oro', period: oct })).toBe('Constancia, oro, octubre 2026');
    expect(badgeLabel('Juego perfecto', { tier: 'unico' }, 'review')).toBe('Juego perfecto, única, en revisión');
    expect(badgeLabel('Club 275', { tier: 'platino' }, 'progress')).toBe('Club 275, platino, bloqueada');
    expect(badgeLabel('Victorias', { tier: 'plata' }, 'unlocked')).toBe('Victorias, plata');
    // Los colores de liga no dicen metal.
    expect(badgeLabel('Cigua palmera', { tier: { custom: '#db2777' }, period: { long: 'TEMP 2026', short: 'T 2026' } })).toBe('Cigua palmera, Temporada 2026');
  });
});
