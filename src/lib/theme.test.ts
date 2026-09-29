import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCENT_PRESETS, accentCss, accentVars, contrast, loadTheme, parseHex, saveTheme, scopedVarsCss, sportAccentCss } from './theme';
import { SPORTS } from '../sports/registry';

describe('apariencia guardada', () => {
  afterEach(() => vi.unstubAllGlobals());

  const memory = (init: Record<string, string>) => {
    const m = new Map(Object.entries(init));
    return {
      map: m,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };

  it('el color que se eligió antes ya no cuenta: queda el modo y el color lo pone el deporte', () => {
    vi.stubGlobal('localStorage', memory({ 'mm:tema': JSON.stringify({ mode: 'dark', accent: '#dc2626' }) }));
    expect(loadTheme()).toEqual({ mode: 'dark', accent: null });
  });

  it('al guardar se borra el color viejo y solo queda el modo', () => {
    const store = memory({ 'mm:tema': JSON.stringify({ mode: 'system', accent: '#dc2626' }), 'mm:tema-css': 'html:root{--accent:#dc2626}' });
    vi.stubGlobal('localStorage', store);
    // Sin página (Node): saveTheme guarda y no pinta nada.
    vi.stubGlobal('document', { documentElement: { dataset: {} }, getElementById: () => null, querySelectorAll: () => [] });
    saveTheme({ mode: 'light', accent: '#dc2626' });
    expect(JSON.parse(store.map.get('mm:tema')!)).toEqual({ mode: 'light' });
    expect(store.map.has('mm:tema-css')).toBe(false);
  });
});

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
