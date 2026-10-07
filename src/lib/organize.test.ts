import { describe, expect, it } from 'vitest';
import { countLabel, leagueOfPath, organizeHref, organizeLanding, organizedLeagueIds } from './organize';

describe('Organizar: qué ligas y a dónde', () => {
  it('las ligas que organiza: dueña o admin, sin repetir y en su orden', () => {
    expect(
      organizedLeagueIds([
        { leagueId: 'A', role: 'member' },
        { leagueId: 'B', role: 'owner' },
        { leagueId: 'C', role: 'admin' },
        { leagueId: 'B', role: 'admin' },
      ]),
    ).toEqual(['B', 'C']);
    expect(organizedLeagueIds(null)).toEqual([]);
  });

  it('la liga de la ruta', () => {
    expect(leagueOfPath('/l/L1/e/E1')).toBe('L1');
    expect(leagueOfPath('/l/L%201')).toBe('L 1');
    expect(leagueOfPath('/ligas')).toBeNull();
  });

  it('la pestaña: dentro de una liga que organiza, directo a su Organizar; si no, a /organizar', () => {
    expect(organizeHref('/l/L1/ranking', ['L1', 'L2'])).toBe('/l/L1/admin');
    expect(organizeHref('/l/L3', ['L1'])).toBe('/organizar');
    expect(organizeHref('/', ['L1'])).toBe('/organizar');
  });

  it('/organizar: con una sola liga, directo; con varias, sin ninguna o con la consola, la lista', () => {
    expect(organizeLanding(['L1'], false)).toEqual({ redirect: '/l/L1/admin' });
    expect(organizeLanding(['L1'], true)).toEqual({ list: true });
    expect(organizeLanding(['L1', 'L2'], false)).toEqual({ list: true });
    expect(organizeLanding([], false)).toEqual({ list: true });
  });

  it('el número del globo', () => {
    expect(countLabel(0)).toBe('');
    expect(countLabel(-2)).toBe('');
    expect(countLabel(3)).toBe('3');
    expect(countLabel(99)).toBe('99');
    expect(countLabel(100)).toBe('99+');
    expect(countLabel(Number.NaN)).toBe('');
  });
});
