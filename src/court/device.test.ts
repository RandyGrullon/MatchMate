import { describe, expect, it } from 'vitest';
import { courtVars } from './device';

/** Contraste WCAG entre dos colores #rrggbb. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, b2] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('modo sol', () => {
  it('fija la letra sobre los colores fuertes: con el tema oscuro no queda letra oscura sobre rojo oscuro', () => {
    const v = courtVars(true);
    // El tema oscuro pone --on-danger casi negro (para su rojo claro): el sol lo tiene que volver a poner.
    for (const [bg, fg] of [
      ['--danger', '--on-danger'],
      ['--ok', '--on-ok'],
      ['--warn', '--on-warn'],
      ['--accent', '--accent-fg'],
      ['--court-a', '--court-a-fg'],
      ['--court-b', '--court-b-fg'],
    ] as const) {
      expect(v[fg], fg).toBeDefined();
      expect(contrast(v[bg], v[fg]), `${fg} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(v['--on-danger']).toBe('#ffffff');
    expect(v.colorScheme).toBe('light');
  });

  it('sin sol, los colores del tema (no pisa --on-danger)', () => {
    expect(courtVars(false)).not.toHaveProperty('--on-danger');
  });
});
