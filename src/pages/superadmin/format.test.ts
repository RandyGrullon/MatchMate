import { describe, expect, it } from 'vitest';
import { GB, MB, deltaDirection, fmtBytes, fmtCompact, fmtDay, fmtDelta, fmtNum, fmtPct, parseDay, pctChange, plural, ratio, relativeTime } from './format';

describe('formatos de la consola (es-DO)', () => {
  it('números con separador de miles; null es un guion', () => {
    expect(fmtNum(1234567)).toBe('1,234,567');
    expect(fmtNum(0)).toBe('0');
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(Number.NaN)).toBe('—');
  });

  it('números cortos solo desde 10 000', () => {
    expect(fmtCompact(9999)).toBe('9,999');
    expect(fmtCompact(12_900)).toMatch(/^12[.,]9\s?k$/i);
    expect(fmtCompact(undefined)).toBe('—');
  });

  it('bytes legibles', () => {
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(3.4 * MB)).toBe('3.4 MB');
    expect(fmtBytes(812 * MB)).toBe('812 MB');
    expect(fmtBytes(1.25 * GB)).toBe('1.3 GB');
    expect(fmtBytes(500 * MB)).toBe('500 MB');
    expect(fmtBytes(null)).toBe('—');
    expect(fmtBytes(-1)).toBe('—');
  });

  it('porcentajes (con un decimal si es menos de 1 %)', () => {
    expect(fmtPct(0.8)).toBe('80 %');
    expect(fmtPct(0.004)).toBe('0.4 %');
    expect(fmtPct(0)).toBe('0 %');
    expect(fmtPct(1.234, 1)).toBe('123.4 %');
    expect(fmtPct(null)).toBe('—');
    expect(ratio(5, 0)).toBe(0);
  });

  it('cambio contra el periodo anterior', () => {
    expect(pctChange(12, 10)).toBeCloseTo(0.2);
    expect(pctChange(5, 10)).toBeCloseTo(-0.5);
    expect(pctChange(0, 0)).toBe(0);
    expect(pctChange(3, 0)).toBeNull();
    expect(fmtDelta(0.25)).toBe('+25 %');
    expect(fmtDelta(-0.1)).toBe('−10 %');
    expect(fmtDelta(0)).toBe('igual');
    expect(fmtDelta(null)).toBe('nuevo');
    expect(deltaDirection(0.3)).toBe('up');
    expect(deltaDirection(-0.3)).toBe('down');
    expect(deltaDirection(0.001)).toBe('flat');
    expect(deltaDirection(null)).toBe('up');
  });

  it('hace cuánto', () => {
    const now = Date.parse('2026-09-27T12:00:00Z');
    expect(relativeTime(null, now)).toBe('nunca');
    expect(relativeTime('2026-09-27T11:59:50Z', now)).toBe('ahora mismo');
    expect(relativeTime('2026-09-27T11:55:00Z', now)).toBe('hace 5 minutos');
    expect(relativeTime('2026-09-27T09:00:00Z', now)).toBe('hace 3 horas');
    expect(relativeTime('2026-09-26T12:00:00Z', now)).toBe('ayer');
    expect(relativeTime('2026-09-20T12:00:00Z', now)).toBe('hace 7 días');
    expect(relativeTime('2026-06-27T12:00:00Z', now)).toBe('hace 3 meses');
    expect(relativeTime('2024-09-27T12:00:00Z', now)).toBe('hace 2 años');
    expect(relativeTime('no es fecha', now)).toBe('—');
  });

  it('días de la serie sin correrse por la zona horaria', () => {
    const d = parseDay('2026-01-31');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 0, 31]);
    expect(fmtDay('2026-09-27')).toMatch(/^27 sept?/);
    expect(fmtDay('2026-09-27', true)).toMatch(/2026/);
  });

  it('plural', () => {
    expect(plural(1, 'cuenta', 'cuentas')).toBe('1 cuenta');
    expect(plural(1200, 'cuenta', 'cuentas')).toBe('1,200 cuentas');
    expect(plural(0, 'liga', 'ligas')).toBe('0 ligas');
  });
});
