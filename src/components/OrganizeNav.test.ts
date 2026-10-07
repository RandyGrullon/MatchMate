/**
 * El número de la pestaña «Organizar» dibujado sin navegador: la suma de lo pendiente en las ligas que organiza (solo
 * las de dueña o admin), nada en Lite, y a dónde lleva.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  members: [] as { leagueId: string; role: string }[],
  askedMembers: [] as (string | undefined)[],
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('../lib/data/members', () => ({
  useMyMemberships: (uid: string | undefined) => {
    state.askedMembers.push(uid);
    return { data: uid ? state.members : [], loading: false, error: null };
  },
}));
vi.mock('../lib/data/organizer', () => ({
  useLeaguePending: () => ({ data: null, loading: false, error: null }),
  pendingTotal: () => 0,
}));

const { MAX_COUNTED, pendingSum, setPendingCountForTests, useOrganize } = await import('./OrganizeNav');

function Probe({ on, out }: { on: boolean; out: { value?: ReturnType<typeof useOrganize> } }) {
  out.value = useOrganize(on);
  return h('div', null, out.value.probes);
}
const run = (on: boolean, url = '/') => {
  const out: { value?: ReturnType<typeof useOrganize> } = {};
  renderToString(h(MemoryRouter, { initialEntries: [url] }, h(Probe, { on, out })));
  return out.value!;
};

beforeEach(() => {
  state.members = [
    { leagueId: 'L1', role: 'owner' },
    { leagueId: 'L2', role: 'member' },
    { leagueId: 'L3', role: 'admin' },
  ];
  state.askedMembers.length = 0;
  for (const lid of ['L1', 'L2', 'L3']) setPendingCountForTests(lid, 0);
});

describe('el número de Organizar', () => {
  it('suma lo pendiente de las ligas que organiza (no las que solo juega)', () => {
    setPendingCountForTests('L1', 2);
    setPendingCountForTests('L2', 5);
    setPendingCountForTests('L3', 1);
    const o = run(true);
    expect(o.total).toBe(3);
    expect(o.href).toBe('/organizar');
    expect(pendingSum(['L1', 'L2'])).toBe(7);
  });

  it('dentro de una liga que organiza, lleva directo a su Organizar', () => {
    expect(run(true, '/l/L3/e/E1').href).toBe('/l/L3/admin');
  });

  it('apagado (Lite): ni número ni pide las ligas', () => {
    setPendingCountForTests('L1', 4);
    const o = run(false);
    expect(o.total).toBe(0);
    expect(state.askedMembers).toEqual([undefined]);
  });

  it('cuenta hasta un tope de ligas', () => {
    expect(MAX_COUNTED).toBeGreaterThanOrEqual(5);
  });
});
