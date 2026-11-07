import { describe, expect, it } from 'vitest';
import { sortedAwards } from './awardOrder';

describe('el orden de los premios', () => {
  it('el campeón aparte y los demás en su orden', () => {
    const awards = [
      { kind: 'mvp' as const, name: 'Jugador Uno' },
      { kind: 'tercero' as const, name: 'Pareja Tres' },
      { kind: 'campeon' as const, name: 'Pareja Uno' },
      { kind: 'subcampeon' as const, name: 'Pareja Dos' },
    ];
    const { champion, rest } = sortedAwards(awards);
    expect(champion?.name).toBe('Pareja Uno');
    expect(rest.map((a) => a.kind)).toEqual(['subcampeon', 'tercero', 'mvp']);
    expect(sortedAwards([]).champion).toBeNull();
  });
});
