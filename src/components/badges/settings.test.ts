import { describe, expect, it } from 'vitest';
import { BADGES_AUTO_OPTIONS, badgesAutoIntro, badgesAutoOf, pickedOr } from './settings';

describe('insignias automáticas (settings.ts)', () => {
  it('las tres opciones y el modo sin dato (con menores, sin títulos)', () => {
    expect(BADGES_AUTO_OPTIONS.map((o) => o.mode)).toEqual(['todas', 'sin_titulos', 'ninguna']);
    expect(badgesAutoOf({})).toBe('todas');
    expect(badgesAutoOf({ hasMinors: true })).toBe('sin_titulos');
    expect(badgesAutoOf({ badgesAuto: 'ninguna', hasMinors: true })).toBe('ninguna');
    expect(badgesAutoIntro(false)).toMatch(/Solo el dueño lo cambia\.$/);
  });

  it('lo elegido se ve al momento y, si la base cambió, manda la base', () => {
    expect(pickedOr({ from: 'todas', to: 'ninguna' }, 'todas')).toBe('ninguna');
    expect(pickedOr({ from: 'todas', to: 'ninguna' }, 'sin_titulos')).toBe('sin_titulos');
    expect(pickedOr(null, 'todas')).toBe('todas');
  });
});
