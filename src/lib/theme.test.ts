import { describe, expect, it } from 'vitest';
import { ACCENT_PRESETS, accentCss, accentVars, contrast, parseHex, scopedVarsCss, sportAccentCss } from './theme';
import { SPORTS } from '../sports/registry';

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

describe('color del deporte en que estás', () => {
  it('toda la app en el color del deporte, con los mismos tonos que en claro y oscuro', () => {
    const css = sportAccentCss('#0d9488', { accent: null });
    expect(css).toBe(accentCss('#0d9488'));
    expect(css).toContain('html:root{--accent:');
    expect(css).toContain('html:root[data-theme="dark"]');
  });

  it('sin color (boliche o «Todos») o con un color elegido en Configuración: nada', () => {
    expect(sportAccentCss(null, { accent: null })).toBe('');
    expect(sportAccentCss('#0d9488', { accent: '#dc2626' })).toBe('');
    // Elegir el morado de siempre es como no elegir.
    expect(sportAccentCss('#0d9488', { accent: '#4338CA' })).not.toBe('');
  });

  it('una parte de la pantalla con el color de SU deporte (el morado con sus tonos a mano)', () => {
    const purple = scopedVarsCss('.mm-tint-bowling', null);
    expect(purple).toContain('.mm-tint-bowling{--accent:#4338ca;--accent-fg:#ffffff;--accent-soft:#e8e7fb;}');
    expect(purple).toContain(':root[data-theme="dark"] .mm-tint-bowling{--accent:#8b8cf6;');
    expect(scopedVarsCss('.mm-tint-padel', '#0d9488')).toContain('.mm-tint-padel{--accent:#');
    expect(scopedVarsCss('body', null)).toBe('');
    expect(scopedVarsCss('.x', 'verde')).toBe('');
  });
});

describe('color de cada deporte (AA)', () => {
  const ratio = (a: string, b: string) => contrast(parseHex(a)!, parseHex(b)!);

  it('el color de cada deporte se lee (4.5:1) sobre las tarjetas, el fondo, su fondo suave y con su texto encima', () => {
    const colored = Object.values(SPORTS).filter((s) => s.color);
    expect(colored.length).toBeGreaterThan(0);
    for (const s of colored) {
      const css = sportAccentCss(s.color, { accent: null });
      expect(css, s.id).toContain('html:root{--accent:');
      const { light, dark } = accentVars(s.color!)!;
      for (const [on, bg] of [
        [light.accent, '#ffffff'],
        [light.accent, '#f4f5f8'],
        [light.accent, '#eef0f4'],
        [light.accent, light.soft],
        [light.accent, light.fg],
        [dark.accent, '#161922'],
        [dark.accent, '#0d0f15'],
        [dark.accent, '#1e222d'],
        [dark.accent, dark.soft],
        [dark.accent, dark.fg],
      ]) {
        expect(ratio(on, bg), `${s.id} ${on} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
