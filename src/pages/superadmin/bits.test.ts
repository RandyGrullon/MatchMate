/**
 * Piezas de la consola: el control segmentado mientras se guarda lo elegido (la ruedita en vez de su ícono, del mismo
 * tamaño, y no se puede cambiar mientras), como el estado de cada deporte.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Segmented } from './bits';

const options = [
  { value: 'open', label: 'Abierto', icon: h('svg', { className: 'size-3.5', 'data-icon': 'open' }) },
  { value: 'beta', label: 'Beta', icon: h('svg', { className: 'size-3.5', 'data-icon': 'beta' }) },
  { value: 'closed', label: 'Cerrado', icon: h('svg', { className: 'size-3.5', 'data-icon': 'closed' }) },
] as const;

const render = (busy?: boolean) => renderToString(h(Segmented<'open' | 'beta' | 'closed'>, { label: 'Estado', options, value: 'beta', onChange: () => {}, busy }));

describe('Segmented', () => {
  it('sin guardar: los íconos tal cual, sin ruedita y se puede cambiar', () => {
    const html = render();
    expect(html).not.toContain('animate-spin');
    expect(html).not.toContain('aria-busy');
    expect(html).not.toContain('disabled');
    for (const o of options) expect(html).toContain(`data-icon="${o.value}"`);
  });

  it('guardando: la ruedita del mismo tamaño en lugar del ícono de lo elegido, y nada se puede tocar', () => {
    const html = render(true);
    expect(html).toContain('aria-busy="true"');
    // Solo lo elegido cambia el ícono; los otros lo conservan.
    expect(html).not.toContain('data-icon="beta"');
    expect(html).toContain('data-icon="open"');
    expect(html).toContain('data-icon="closed"');
    const spin = /<svg[^>]*class="([^"]*animate-spin[^"]*)"/.exec(html)?.[1].split(/\s+/) ?? [];
    expect(spin).toContain('size-3.5');
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(options.length);
    // La ruedita va en el botón marcado.
    const checked = /<button[^>]*aria-checked="true"[^>]*>(.*?)<\/button>/.exec(html)?.[1] ?? '';
    expect(checked).toContain('animate-spin');
  });
});
