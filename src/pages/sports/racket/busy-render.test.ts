/**
 * La ruedita de las plantillas de reglas (admin › parejas y el «Cambiar» de la cancha de pádel, tenis, pickleball y
 * ping pong): solo la que se está guardando gira y las demás esperan.
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
  });

  it('guardando una: gira solo esa y las demás esperan', () => {
    const html = renderToString(h(PresetButtons, { presets: PRESETS, current: 'a', pending: 'b', onPick: () => {} }));
    expect(spins(html)).toBe(1);
    expect(disabled(html)).toBe(PRESETS.length);
    // La ruedita va dentro del botón de «Con ventaja».
    const b = html.slice(html.lastIndexOf('<button', html.indexOf('Con ventaja')), html.indexOf('Con ventaja'));
    expect(b).toContain('animate-spin');
  });
});
