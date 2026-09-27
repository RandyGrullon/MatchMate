import { describe, expect, it } from 'vitest';
import { ACCENT_PRESETS, accentCss, accentVars, contrast, parseHex } from './theme';

describe('color de la app', () => {
  it('cualquier color se lee sobre el fondo claro y el oscuro, con su texto encima', () => {
    for (const hex of [...ACCENT_PRESETS.map((p) => p.hex), '#ffff00', '#00ffff', '#111111', '#ffffff', '#7fff00']) {
      const v = accentVars(hex)!;
      expect(contrast(parseHex(v.light.accent)!, parseHex('#ffffff')!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(parseHex(v.dark.accent)!, parseHex('#161922')!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(parseHex(v.light.accent)!, parseHex(v.light.fg)!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(parseHex(v.dark.accent)!, parseHex(v.dark.fg)!)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('el morado de siempre no cambia nada (usa los tonos diseñados)', () => {
    expect(accentCss(null)).toBe('');
    expect(accentCss('#4338CA')).toBe('');
    expect(accentCss('#2563eb')).toContain('html:root[data-theme="dark"]');
  });

  it('un color inválido no rompe nada', () => {
    expect(parseHex('azul')).toBeNull();
    expect(accentCss('azul')).toBe('');
  });
});
