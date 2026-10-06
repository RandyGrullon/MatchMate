/**
 * El Select que guarda al elegir (equipo del inscrito, agregar al equipo, mover de pista): mientras espera, la ruedita
 * va donde la flecha y no deja elegir otra vez. Sin navegador (renderToString).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BusySelectView } from './BusySelect';

const view = (busy: boolean) =>
  renderToString(
    h(BusySelectView, { busy, value: 'a', onChange: () => undefined, 'aria-label': 'Equipo', className: 'h-9', wrapClassName: 'w-36 shrink-0' }, [
      h('option', { key: 'a', value: 'a' }, 'Los Strikers'),
      h('option', { key: 'b', value: 'b' }, 'Los Spares'),
    ]),
  );

describe('BusySelect', () => {
  it('sin esperar: se elige como siempre, sin ruedita', () => {
    const html = view(false);
    expect(html).toContain('Los Strikers');
    expect(html).not.toContain('animate-spin');
    expect(html).not.toMatch(/<select[^>]*\sdisabled=""/);
    expect(html).not.toContain('aria-busy');
    expect(html).toContain('w-36 shrink-0');
  });

  it('esperando: la ruedita en lugar de la flecha y el Select quieto', () => {
    const html = view(true);
    expect(html).toContain('animate-spin');
    expect(html).toMatch(/<select[^>]*\sdisabled=""/);
    expect(html).toMatch(/<select[^>]*aria-busy="true"/);
    expect(html).toMatch(/<select[^>]*class="[^"]*appearance-none/);
    // Mismo ancho: la caja no cambia.
    expect(html).toContain('w-36 shrink-0');
  });
});
