import { describe, expect, it } from 'vitest';
import { ellipsize, estimateWidth, fontSpec, wrapLines, type Measure } from './scene';

/** Cada letra mide lo mismo (10 px con letra de 10): fácil de contar. */
const mono: Measure = (text, size) => Array.from(text).length * size;

describe('medir textos sin navegador', () => {
  it('lo ancho mide más que lo estrecho y la negrita un poco más', () => {
    expect(estimateWidth('MMMM', 16, 400)).toBeGreaterThan(estimateWidth('iiii', 16, 400));
    expect(estimateWidth('Ana Pérez', 16, 800)).toBeGreaterThan(estimateWidth('Ana Pérez', 16, 400));
    expect(estimateWidth('', 16, 400)).toBe(0);
    // Crece con el tamaño de la letra.
    expect(estimateWidth('Tabla', 24, 600)).toBeCloseTo(estimateWidth('Tabla', 12, 600) * 2);
  });

  it('la letra del canvas lleva el peso, el tamaño y la de la app primero', () => {
    expect(fontSpec(16, 700)).toMatch(/^700 16px Inter, /);
  });
});

describe('cortar con «…»', () => {
  it('lo que cabe queda igual (sin espacios de más)', () => {
    expect(ellipsize('  Los   Tigres ', 100, 10, 400, mono)).toBe('Los Tigres');
  });

  it('lo que no cabe se corta y el resultado cabe', () => {
    const out = ellipsize('Club Deportivo Naco', 100, 10, 400, mono);
    expect(out.endsWith('…')).toBe(true);
    expect(mono(out, 10, 400)).toBeLessThanOrEqual(100);
    expect(out).toBe('Club Depo…');
  });

  it('no deja un espacio antes del «…» y, si no cabe nada, solo «…»', () => {
    expect(ellipsize('Ana Pérez', 50, 10, 400, mono)).toBe('Ana…');
    expect(ellipsize('Ana', 5, 10, 400, mono)).toBe('…');
  });

  it('no parte un emoji ni una letra con tilde', () => {
    const out = ellipsize('Ñoño 🏆 campeón del torneo', 80, 10, 400, mono);
    expect(out).toBe('Ñoño 🏆…');
  });
});

describe('partir en renglones', () => {
  it('reparte las palabras sin pasarse del ancho', () => {
    const lines = wrapLines('Liga de pádel del jueves en la noche', 120, 10, 400, mono, 3);
    expect(lines).toEqual(['Liga de', 'pádel del', 'jueves en l…']);
    for (const l of lines) expect(mono(l, 10, 400)).toBeLessThanOrEqual(120);
  });

  it('el último renglón lleva «…» si sobra texto', () => {
    const lines = wrapLines('Liga de pádel del jueves en la noche', 120, 10, 400, mono, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    expect(mono(lines[1], 10, 400)).toBeLessThanOrEqual(120);
  });

  it('una palabra más larga que el renglón también se corta', () => {
    const lines = wrapLines('Supercalifragilístico sí', 100, 10, 400, mono, 2);
    expect(lines[0]).toBe('Supercali…');
    expect(lines[1]).toBe('sí');
  });

  it('sin texto, sin renglones', () => {
    expect(wrapLines('   ', 100, 10, 400, mono)).toEqual([]);
  });
});
