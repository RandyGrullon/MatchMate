/** La puerta del organizador de esports (organizer.ts): solo en Pro y si es admin de la liga. */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeagueContext, type LeagueCtx } from '../../../lib/league';
import { useOrganizer } from './organizer';

const state = vi.hoisted(() => ({ pro: true }));
vi.mock('../../../lib/useMode', async (orig) => ({
  ...(await orig<typeof import('../../../lib/useMode')>()),
  useIsPro: () => state.pro,
}));
afterEach(() => {
  state.pro = true;
});

function Probe() {
  return h('span', null, useOrganizer() ? 'organiza' : 'no');
}

const ctx = (isAdmin: boolean) => ({ lid: 'L1', isAdmin }) as unknown as LeagueCtx;
const render = (isAdmin: boolean) => renderToString(h(LeagueContext.Provider, { value: ctx(isAdmin) }, h(Probe)));

describe('useOrganizer', () => {
  it('el admin en Pro organiza', () => {
    expect(render(true)).toBe('<span>organiza</span>');
  });

  it('el admin en Lite no (lo de organizar está en Pro)', () => {
    state.pro = false;
    expect(render(true)).toBe('<span>no</span>');
  });

  it('quien no es admin no organiza, ni en Pro', () => {
    expect(render(false)).toBe('<span>no</span>');
  });
});
