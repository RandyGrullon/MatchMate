import { describe, expect, it } from 'vitest';
import { thruText, toParText } from '../../pages/sports/golf/logic';
import { golfBoardShare, thruLabel, toParLabel, type GolfBoardRowLike } from './golf';

const row = (id: string, over: Partial<GolfBoardRowLike> = {}): GolfBoardRowLike => ({
  id,
  rank: 1,
  dq: false,
  toPar: 2,
  netToPar: -3,
  points: 38,
  gross: 74,
  thru: 18,
  holesPlayed: 36,
  ...over,
});
const names: Record<string, string> = { a: 'Ana', b: 'Luis', c: 'Rosa', d: 'Pedro' };

describe('leaderboard de golf para compartir', () => {
  it('los textos son los mismos de la pantalla (contra el par y hoyos)', () => {
    for (const v of [null, undefined, 0, 3, -2]) expect(toParLabel(v)).toBe(toParText(v));
    for (const [t, h] of [
      [0, 18],
      [9, 18],
      [18, 18],
      [20, 18],
    ]) {
      expect(thruLabel(t, h)).toBe(thruText(t, h));
    }
  });

  it('stroke neto: hoyos, bruto (se quita si no cabe) y el neto en negrita', () => {
    const spec = golfBoardShare({
      title: 'Liga de golf',
      subtitle: 'Ronda 2 · Stroke play neto',
      rows: [row('a'), row('b', { rank: 2, netToPar: 0, thru: 12, gross: 50 }), row('c', { rank: null, dq: true, unfinished: true, gross: null, netToPar: null, thru: 14 })],
      nameOf: (id) => names[id],
      stableford: false,
      net: true,
      holes: 18,
    });
    expect(spec.columns).toEqual([{ label: 'Hoyos' }, { label: 'Bruto', optional: true }, { label: 'Neto', strong: true }]);
    expect(spec.sections[0].rows).toEqual([
      { rank: 1, name: 'Ana', dim: false, values: ['F', 74, '−3'] },
      { rank: 2, name: 'Luis', dim: false, values: ['12', 50, 'E'] },
      { rank: null, name: 'Rosa', sub: 'No terminó', dim: true, values: ['14', '–', '–'] },
    ]);
    expect(spec.note).toMatch(/F = terminó/);
  });

  it('bruto, Stableford y el torneo completo (hoyos de todas las rondas)', () => {
    const gross = golfBoardShare({ title: 'L', rows: [row('a')], nameOf: (id) => names[id], stableford: false, net: false, holes: 18 });
    expect(gross.columns[2].label).toBe('Total');
    expect(gross.sections[0].rows[0].values[2]).toBe('+2');

    const sf = golfBoardShare({
      title: 'Copa',
      rows: [row('a', { holesPlayed: 30 }), row('d', { rank: null, dq: true, points: 0 })],
      nameOf: (id) => names[id],
      stableford: true,
      net: true,
      holes: 36,
      total: true,
      statusOf: (r) => (r.dq ? 'Recogió' : undefined),
    });
    expect(sf.columns[2]).toEqual({ label: 'Pts', strong: true });
    expect(sf.sections[0].rows[0].values).toEqual(['30', 74, '38']);
    expect(sf.sections[0].rows[1]).toMatchObject({ sub: 'Recogió', dim: true });
  });
});
