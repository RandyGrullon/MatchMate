/**
 * El número de la fila «Organizar» sin pantalla: lo que suma cada liga (lo pendiente y las notas nuevas del buzón), la
 * suma de las contadas y el tope de ligas.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/data/organizer', () => ({
  useLeaguePending: () => ({ data: null, loading: false, error: null }),
  pendingTotal: (p: { total: number } | null | undefined) => p?.total ?? 0,
}));
vi.mock('./notifications/provider', () => ({ useNotifications: () => ({ feeds: [] }) }));

const { MAX_COUNTED, leagueCount, pendingSum, setPendingCountForTests, useOrganizeTotal } = await import('./organizeCount');

function Total({ lids, out }: { lids: string[]; out: { value?: ReturnType<typeof useOrganizeTotal> } }) {
  out.value = useOrganizeTotal(lids);
  return null;
}
const total = (lids: string[]) => {
  const out: { value?: ReturnType<typeof useOrganizeTotal> } = {};
  renderToString(h(Total, { lids, out }));
  return out.value!;
};

beforeEach(() => {
  for (let i = 1; i <= 12; i++) setPendingCountForTests(`L${i}`, 0);
});

describe('el número de Organizar', () => {
  it('cada liga suma lo pendiente y sus notas nuevas del buzón', () => {
    const p = { total: 2 } as Parameters<typeof leagueCount>[0];
    const feeds = [
      { lid: 'L1', suggestions: [{}] },
      { lid: 'L3', suggestions: [{}, {}] },
    ];
    expect(leagueCount(p, feeds, 'L1')).toBe(3);
    expect(leagueCount(null, feeds, 'L3')).toBe(2);
    expect(leagueCount(undefined, [], 'L9')).toBe(0);
  });

  it('suma lo último que se contó de las ligas pedidas', () => {
    setPendingCountForTests('L1', 2);
    setPendingCountForTests('L2', 5);
    expect(pendingSum(['L1', 'L2'])).toBe(7);
    expect(total(['L1', 'L3']).total).toBe(2);
  });

  it(`cuenta solo las primeras ${MAX_COUNTED} ligas`, () => {
    const lids = Array.from({ length: 12 }, (_, i) => `L${i + 1}`);
    for (const lid of lids) setPendingCountForTests(lid, 1);
    const t = total(lids);
    expect(t.counted).toHaveLength(MAX_COUNTED);
    expect(t.total).toBe(MAX_COUNTED);
  });
});
