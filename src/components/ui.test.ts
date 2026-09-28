/**
 * Colores sobre los del tema: en el modo oscuro el oro, la plata y el bronce son claros, así que el número de la
 * medalla no puede ir en blanco fijo (no se leía). Va del color del fondo de la app, que cambia con el modo.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LoadError, Loading, Position, isDeniedError } from './ui';

const classOf = (pos: number) => /class="([^"]*)"/.exec(renderToString(h(Position, { pos })))?.[1].split(/\s+/) ?? [];

describe('medallas de posición', () => {
  it('oro, plata y bronce con el número del color del fondo (sirve en claro y en oscuro)', () => {
    for (const [pos, bg] of [
      [1, 'bg-gold'],
      [2, 'bg-silver'],
      [3, 'bg-bronze'],
    ] as const) {
      const cls = classOf(pos);
      expect(cls).toContain(bg);
      expect(cls).toContain('text-bg');
      expect(cls).not.toContain('text-white');
    }
  });

  it('del 4 en adelante, solo el número', () => {
    const cls = classOf(4);
    expect(cls).toContain('text-muted');
    expect(cls.some((c) => c.startsWith('bg-'))).toBe(false);
  });
});

describe('carga y errores', () => {
  it('la carga es el logo de MatchMate (sirve para todos los deportes), no una bola de boliche', () => {
    const html = renderToString(h(Loading, { label: 'Cargando la liga' }));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Cargando la liga"');
    expect(html).toContain('mm-spin');
    expect(html.match(/class="mm-head mm-head-\d"/g)).toHaveLength(2);
    expect(html).not.toContain('bowl-loader');
  });

  it('sin señal o con el servidor caído: «Reintentar» (sin recargar la app)', () => {
    const html = renderToString(h(LoadError, { error: new Error('Failed to fetch') }));
    expect(html).toContain('Reintentar');
    expect(html).not.toContain('recarga la página');
  });

  it('sin permiso: reintentar no sirve, no sale el botón', () => {
    for (const error of [new Error('permission-denied'), Object.assign(new Error('no_permitido'), { kind: 'permission' })]) {
      expect(isDeniedError(error)).toBe(true);
      const html = renderToString(h(LoadError, { error }));
      expect(html).toContain('No tienes permiso para ver esto.');
      expect(html).not.toContain('Reintentar');
    }
    expect(isDeniedError(Object.assign(new Error('x'), { kind: 'network' }))).toBe(false);
  });
});
