/**
 * Organizar (`/organizar`) dibujado sin navegador: con varias ligas, la lista con lo que espera en cada una; con una
 * sola, directo a ella; sin ninguna, cómo crear; el superadmin, además, su consola.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toLeaguePending, type LeaguePending } from '../lib/data/organizer';
import type { League } from '../lib/types';

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u1' } as { uid: string } | null, loading: false, isSuper: false },
  members: [] as { leagueId: string; role: string }[],
  leagues: [] as League[],
  pending: {} as Record<string, LeaguePending | null>,
}));

vi.mock('../lib/auth', () => ({ useAuth: () => state.auth }));
vi.mock('../components/home/useHomeData', () => ({
  useMyLeagues: () => ({
    memberships: { data: state.members, loading: false, error: null },
    all: state.leagues,
    loading: false,
    error: null,
  }),
}));
vi.mock('../lib/data/organizer', async (orig) => ({
  ...(await orig<typeof import('../lib/data/organizer')>()),
  useLeaguePending: (lid: string) => ({ data: state.pending[lid] ?? null, loading: false, error: null }),
}));
vi.mock('../components/CreateMenu', () => ({ useCreateMenu: () => ({ openMenu: () => undefined }) }));
vi.mock('../components/home/LeagueCard', () => ({ LeagueLogo: ({ children }: { children: ReactNode }) => children }));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const { default: OrganizePage } = await import('./OrganizePage');

const render = () =>
  renderToString(
    h(
      MemoryRouter,
      { initialEntries: ['/organizar'] },
      h(Routes, null, h(Route, { path: '/organizar', element: h(OrganizePage) }), h(Route, { path: '/l/:lid/admin', element: h('p', null, 'ADMIN DE LA LIGA') })),
    ),
  );
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const league = (id: string, name: string): League =>
  ({ id, name, kind: 'liga', visibility: 'private', sport: 'bowling', logoPath: null }) as unknown as League;
const empty = (url: string) => ({ count: 0, url, items: [] });
const pending = (submissions: number) =>
  toLeaguePending(
    {
      submissions: { count: submissions, url: '/l/x/admin?tab=aprobar', items: [] },
      disputes: empty(''),
      overdue: empty(''),
      claims: empty(''),
      waitlists: empty(''),
      checklist: null,
    },
    'x',
  );

beforeEach(() => {
  state.auth = { user: { uid: 'u1' }, loading: false, isSuper: false };
  state.members = [
    { leagueId: 'L1', role: 'owner' },
    { leagueId: 'L2', role: 'admin' },
    { leagueId: 'L3', role: 'member' },
  ];
  state.leagues = [league('L1', 'Liga de los martes'), league('L2', 'Copa de octubre'), league('L3', 'Liga del club')];
  state.pending = { L1: pending(2), L2: pending(0) };
});

describe('Organizar', () => {
  it('con varias ligas: cada una con lo que espera y su número; solo las que organiza', () => {
    const out = render();
    const t = text(out);
    expect(out).toContain('<h1 class="text-title">Organizar</h1>');
    expect(t).toContain('Liga de los martes');
    expect(t).toContain('2 juegos por aprobar');
    expect(t).toContain('Copa de octubre');
    expect(t).toContain('Todo al día');
    expect(t).not.toContain('Liga del club');
    expect(out).toContain('href="/l/L1/admin"');
    expect(out).toContain('aria-label="Liga de los martes: 2 pendientes"');
    expect(out).toMatch(/bg-accent[^"]*text-accent-fg[^"]*">2<\/span>/);
    expect(t).not.toContain('Panel del superadmin');
  });

  it('con una sola liga va directo a su Organizar', () => {
    state.members = [{ leagueId: 'L1', role: 'owner' }];
    expect(text(render())).not.toContain('Lo que organizas');
  });

  it('sin ligas que organizar: cómo crear una', () => {
    state.members = [{ leagueId: 'L3', role: 'member' }];
    const t = text(render());
    expect(t).toContain('Todavía no organizas ninguna liga');
    expect(t).toContain('Crear o unirme');
  });

  it('el superadmin ve además su consola (aunque organice una sola liga)', () => {
    state.auth = { user: { uid: 'u1' }, loading: false, isSuper: true };
    state.members = [{ leagueId: 'L1', role: 'owner' }];
    const out = render();
    expect(text(out)).toContain('Panel del superadmin');
    expect(out).toContain('href="/superadmin"');
    expect(text(out)).toContain('Liga de los martes');
  });
});
