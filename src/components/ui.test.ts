/**
 * Colores sobre los del tema: en el modo oscuro el oro, la plata y el bronce son claros, así que el número de la
 * medalla no puede ir en blanco fijo (no se leía). Va del color del fondo de la app, que cambia con el modo.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Position } from './ui';

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
