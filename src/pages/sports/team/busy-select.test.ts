/**
 * La lista que guarda al cambiar (anotador de mesa, posición y rol de la plantilla): mientras espera muestra la
 * ruedita donde va la flecha, no se puede tocar y avisa a los lectores de pantalla. Sin navegador (renderToString).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BusySelect } from './TeamBits';

const render = (busy: boolean, disabled?: boolean) =>
  renderToString(
    h(BusySelect, { busy, disabled, className: 'sm:w-64', selectClassName: 'h-11', 'aria-label': 'Anotador', value: 'a', onChange: () => undefined }, h('option', { value: 'a' }, 'Ana')),
  );

describe('BusySelect', () => {
  it('esperando: ruedita, sin flecha, apagada y aria-busy', () => {
    const html = render(true);
    expect(html).toContain('animate-spin');
    expect(html).toContain('appearance-none');
    expect(html).toMatch(/<select[^>]*disabled=""/);
    expect(html).toContain('aria-busy="true"');
    // El ancho va en el contenedor y el alto en la lista: no se mueve nada al aparecer la ruedita.
    expect(html).toMatch(/<span class="relative block sm:w-64">/);
    expect(html).toMatch(/<select[^>]*class="[^"]*h-11/);
  });

  it('sin esperar: la lista normal, se puede tocar', () => {
    const html = render(false);
    expect(html).not.toContain('animate-spin');
    expect(html).not.toContain('appearance-none');
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('aria-busy');
  });

  it('apagada por fuera (otra acción en curso) sin ruedita', () => {
    const html = render(false, true);
    expect(html).not.toContain('animate-spin');
    expect(html).toMatch(/<select[^>]*disabled=""/);
  });
});
