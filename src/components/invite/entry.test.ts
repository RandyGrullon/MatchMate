/**
 * Por dónde se abre la hoja de invitar, dibujado sin navegador (renderToString): «Invitar» arriba del inicio de la liga
 * (la barra «‹ Ligas» de LeagueShell, de cualquier deporte: solo si la cuenta puede invitar) e «Invitar personas» en
 * Admin › Liga. La hoja misma: InviteSheet.test.ts.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { League, Member } from '../../lib/types';

vi.mock('../../lib/data/players', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/players')>()),
  usePlayers: () => ({ data: [], loading: false, error: null }),
}));
vi.mock('../feedback', () => ({
  useFeedback: () => ({ toast: () => undefined, confirm: () => Promise.resolve(false) }),
  useAction: () => async () => undefined,
}));

const { InvitePill, LeagueTopBar } = await import('../league/home/LeagueTopBar');
const { canInviteTo } = await import('./logic');
const { InviteCard } = await import('../InviteCard');

const league = (extra: Partial<League> = {}) =>
  ({ id: 'l1', name: 'Liga de los martes', kind: 'liga', visibility: 'public', sport: 'padel', venue: '', ...extra }) as League;

const ctx = (extra: Partial<LeagueCtx> = {}): LeagueCtx => ({
  lid: 'l1',
  league: league(),
  member: { id: 'l1_u1', leagueId: 'l1', uid: 'u1', name: 'Ana', role: 'member', playerId: null } as Member,
  isAdmin: false,
  isOwner: false,
  isScorer: false,
  canScore: false,
  myPlayerId: null,
  base: '/l/l1',
  ...extra,
});

const inLeague = (value: LeagueCtx, el: ReactElement) => renderToString(h(MemoryRouter, null, h(LeagueContext.Provider, { value }, el)));
const INVITE_BUTTON = /<button type="button"[^>]*aria-haspopup="dialog"[^>]*>(?:(?!<\/button>).)*Invitar<\/button>/;

/** La barra de arriba del inicio, como la arma LeagueShell (homeBar) para cualquier deporte. */
const HomeBar = ({ value }: { value: LeagueCtx }) =>
  h(LeagueTopBar, {
    to: '/ligas',
    label: 'Ligas',
    actions: canInviteTo(value.league, value.isAdmin, !!value.member) && h(InvitePill, { onClick: () => undefined }),
  });

describe('«Invitar» arriba del inicio de la liga', () => {
  it('un miembro de una liga pública y el admin: el botón abre la hoja (cerrada al entrar)', () => {
    for (const value of [ctx(), ctx({ league: league({ visibility: 'private' }), isAdmin: true })]) {
      const html = inLeague(value, h(HomeBar, { value }));
      expect(html).toContain('Ligas');
      expect(html).toMatch(INVITE_BUTTON);
      expect(html).not.toContain('<dialog');
    }
  });

  it('un miembro de una liga privada o quien solo mira: sin botón', () => {
    const priv = ctx({ league: league({ visibility: 'private' }) });
    expect(inLeague(priv, h(HomeBar, { value: priv }))).not.toMatch(INVITE_BUTTON);
    const observer = ctx({ member: null });
    expect(inLeague(observer, h(HomeBar, { value: observer }))).not.toMatch(INVITE_BUTTON);
  });
});

describe('«Invitar personas» en Admin › Liga', () => {
  it('abre la hoja de invitar (cerrada al entrar), además del código, el link y el QR', () => {
    const html = inLeague(ctx({ isAdmin: true }), h(InviteCard, { league: league({ visibility: 'private' }) }));
    expect(html).toMatch(/aria-haspopup="dialog"[^>]*>(?:(?!<\/button>).)*Invitar personas<\/button>/);
    expect(html).not.toContain('<dialog');
  });
});
