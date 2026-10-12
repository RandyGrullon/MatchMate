/**
 * LeagueShell dibujado sin navegador en la página de un jugador (`/l/:lid/j/:playerId`): debajo de lo del jugador sale
 * «Ver su perfil» (a su perfil de la app) si tiene cuenta y no es menor; el tuyo dice «Ver mi perfil completo» y lleva a
 * Yo. Sirve para todos los deportes (el boliche aquí; los demás pasan por el mismo marco).
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { League, Member, Player } from '../lib/types';

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u-me' } as { uid: string } | null, isSuper: false, loading: false },
  league: null as unknown,
  membership: null as unknown,
  players: [] as Player[],
}));

vi.mock('../lib/auth', async (orig) => ({ ...(await orig<typeof import('../lib/auth')>()), useAuth: () => state.auth }));
vi.mock('../lib/data', async (orig) => ({
  ...(await orig<typeof import('../lib/data')>()),
  useLeague: () => ({ data: state.league, loading: false, error: null }),
  useMembership: () => ({ data: state.membership, loading: false, error: null }),
}));
vi.mock('../lib/data/players', async (orig) => ({
  ...(await orig<typeof import('../lib/data/players')>()),
  usePlayers: () => ({ data: state.players, loading: false, error: null }),
}));
vi.mock('../lib/useMode', () => ({
  useIsPro: () => false,
  useMode: () => ({ mode: 'lite', isPro: false, setMode: async () => 'saved', suggestedPro: false }),
}));
vi.mock('./Shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
  AppFrame: ({ children }: { children: ReactNode }) => children,
}));

const { default: LeagueShell } = await import('./LeagueShell');

const league = (extra: Partial<League> = {}): League =>
  ({
    id: 'L1',
    name: 'Liga de los martes',
    kind: 'liga',
    visibility: 'public',
    ownerUid: 'u-owner',
    sport: 'bowling',
    hasMinors: false,
    venue: '',
    schedule: '',
    seasonStart: '',
    seasonEnd: '',
    contactName: '',
    contactPhone: '',
    requirePhoto: false,
    ...extra,
  }) as League;
const member: Member = { id: 'L1_u-me', leagueId: 'L1', uid: 'u-me', name: 'Yo', role: 'member', playerId: 'p-me' };

const render = (url: string) =>
  renderToString(
    h(
      MemoryRouter,
      { initialEntries: [url] },
      h(Routes, null, h(Route, { path: '/l/:lid', element: h(LeagueShell) }, h(Route, { path: 'j/:playerId', element: h('p', null, 'Página del jugador') }))),
    ),
  );
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

beforeEach(() => {
  state.auth = { user: { uid: 'u-me' }, isSuper: false, loading: false };
  state.league = league();
  state.membership = member;
  state.players = [
    { id: 'p-ana', name: 'Ana Pérez', averageOverride: null, uid: 'u-ana' },
    { id: 'p-me', name: 'Yo Mismo', averageOverride: null, uid: 'u-me' },
    { id: 'p-sin', name: 'Luis Sin Cuenta', averageOverride: null, uid: null },
    { id: 'p-kid', name: 'Niño', averageOverride: null, uid: 'u-kid', isMinor: true },
  ];
});

describe('la página de un jugador en la liga', () => {
  it('con cuenta: «Ver su perfil» a su perfil de la app, después de lo del jugador', () => {
    const html = render('/l/L1/j/p-ana');
    const t = text(html);
    expect(t).toContain('Página del jugador');
    expect(t).toContain('Ver su perfil');
    expect(html).toContain('href="/u/u-ana"');
    expect(t.indexOf('Página del jugador')).toBeLessThan(t.indexOf('Ver su perfil'));
  });

  it('tu propio jugador: «Ver mi perfil completo» a Yo', () => {
    const html = render('/l/L1/j/p-me');
    expect(text(html)).toContain('Ver mi perfil completo');
    expect(html).toContain('href="/perfil"');
  });

  it('sin cuenta o menor: no sale', () => {
    for (const id of ['p-sin', 'p-kid']) {
      const html = render(`/l/L1/j/${id}`);
      expect(text(html)).toContain('Página del jugador');
      expect(text(html)).not.toContain('Ver su perfil');
      expect(html).not.toContain('href="/u/');
    }
  });

  it('fuera de la página de un jugador no sale', () => {
    expect(text(render('/l/L1'))).not.toContain('Ver su perfil');
  });
});
