/**
 * La ruedita de las plantillas de reglas (organizar › parejas y el «Cambiar» de la cancha de pádel, tenis, pickleball y
 * ping pong): solo la que se está guardando gira y las demás esperan. Son opciones de una lista (la puesta, marcada y
 * con su ✓), ya no botones apilados.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PresetButtons } from './bits';

const PRESETS = [
  { id: 'a', label: 'Punto de oro' },
  { id: 'b', label: 'Con ventaja' },
  { id: 'c', label: 'Star Point' },
];

const spins = (html: string) => html.split('animate-spin').length - 1;
const disabled = (html: string) => html.split('disabled=""').length - 1;

describe('PresetButtons', () => {
  it('sin nada guardándose: sin ruedita y todas se pueden tocar', () => {
    const html = renderToString(h(PresetButtons, { presets: PRESETS, current: 'a', pending: null, onPick: () => {} }));
    expect(spins(html)).toBe(0);
    expect(disabled(html)).toBe(0);
    expect(html).toContain('Con ventaja');
    // La puesta está marcada (y solo esa).
    expect(html.split('aria-checked="true"').length - 1).toBe(1);
    expect(html.indexOf('aria-checked="true"')).toBeLessThan(html.indexOf('Punto de oro'));
  });

  it('guardando una: gira solo esa y las demás esperan', () => {
    const html = renderToString(h(PresetButtons, { presets: PRESETS, current: 'a', pending: 'b', onPick: () => {} }));
    expect(spins(html)).toBe(1);
    expect(disabled(html)).toBe(PRESETS.length);
    // La ruedita va dentro del botón de «Con ventaja».
    const at = html.indexOf('Con ventaja');
    const b = html.slice(html.lastIndexOf('<button', at), html.indexOf('</button>', at));
    expect(b).toContain('animate-spin');
  });
});
