/**
 * Organizar (`/organizar`) dibujado sin navegador: el título, la ficha de la liga (la pedida con `?liga=`, la última
 * que se miró o la primera), lo de esa liga («Por hacer» y «La liga», de mentira aquí: están en
 * src/components/organizer/hub.test.ts), «Esto es de Pro · Usar Pro» en Lite, sin ligas cómo crear una, y el
 * superadmin con su consola.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLeagueCtx, type LeagueCtx } from '../lib/league';
import type { League } from '../lib/types';

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u1' } as { uid: string } | null, loading: false, isSuper: false },
  members: [] as { leagueId: string; role: string }[],
  leagues: [] as League[],
  pro: true,
  last: null as string | null,
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
vi.mock('../components/organizer/Hub', async (orig) => ({
  ...(await orig<typeof import('../components/organizer/Hub')>()),
  // La liga de la ficha, como si ya se hubiera leído (con permiso si la organiza o es el superadmin).
  useOrganizerCtx: (lid: string | null) => {
    const league = state.leagues.find((l) => l.id === lid) ?? null;
    const role = state.members.find((m) => m.leagueId === lid)?.role;
    const admin = role === 'owner' || role === 'admin' || state.auth.isSuper;
    const ctx: LeagueCtx | null = league
      ? { lid: league.id, league, member: null, isAdmin: admin, isOwner: admin, isScorer: false, canScore: admin, myPlayerId: null, base: `/l/${league.id}` }
      : null;
    return { ctx, loading: false, error: null };
  },
  OrganizeHub: () => h(HubProbe),
  useToDoSummary: () => ({ count: 0, line: '', loading: false }),
}));
vi.mock('../components/mode', async (orig) => ({
  ...(await orig<typeof import('../components/mode')>()),
  useIsPro: () => state.pro,
  useSwitchMode: () => async () => undefined,
}));
vi.mock('../components/CreateMenu', () => ({ useCreateMenu: () => ({ openMenu: () => undefined }) }));
vi.mock('../components/home/LeagueCard', () => ({ LeagueLogo: ({ children }: { children: ReactNode }) => children }));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

/** Lo de la liga, de mentira: dice de qué liga es (así se ve que va dentro de su LeagueContext). */
function HubProbe() {
  return h('p', null, `[Por hacer y La liga de ${useLeagueCtx().league.name}]`);
}

const { default: OrganizePage } = await import('./OrganizePage');

// La última liga que se miró vive en el teléfono (localStorage): aquí, en memoria.
const stored = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => stored.get(k) ?? null,
  setItem: (k: string, v: string) => void stored.set(k, String(v)),
  removeItem: (k: string) => void stored.delete(k),
});

const render = (url = '/organizar') => {
  if (state.last) stored.set('mm:organizar:u1', state.last);
  else stored.delete('mm:organizar:u1');
  return renderToString(h(MemoryRouter, { initialEntries: [url] }, h(Routes, null, h(Route, { path: '/organizar', element: h(OrganizePage) }))));
};
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const league = (id: string, name: string, extra: Partial<League> = {}): League =>
  ({ id, name, kind: 'liga', visibility: 'private', sport: 'bowling', logoPath: null, ...extra }) as unknown as League;

beforeEach(() => {
  state.auth = { user: { uid: 'u1' }, loading: false, isSuper: false };
  state.members = [
    { leagueId: 'L1', role: 'owner' },
    { leagueId: 'L2', role: 'admin' },
    { leagueId: 'L3', role: 'member' },
  ];
  state.leagues = [league('L1', 'Liga de los martes'), league('L2', 'Copa de octubre', { kind: 'torneo' }), league('L3', 'Liga del club')];
  state.pro = true;
  state.last = null;
});

describe('Organizar', () => {
  it('el título, la ficha de la primera liga que organizas y lo de esa liga', () => {
    const out = render();
    const t = text(out);
    expect(out).toContain('<h1 class="text-title">Organizar</h1>');
    expect(out).toContain('aria-label="Liga de los martes: cambiar de liga"');
    expect(t).toContain('[Por hacer y La liga de Liga de los martes]');
    expect(t).not.toContain('Esto es de Pro');
    expect(t).not.toContain('Panel del superadmin');
  });

  it('`?liga=` elige otra de las que organizas; una que no organizas no se abre', () => {
    expect(text(render('/organizar?liga=L2'))).toContain('[Por hacer y La liga de Copa de octubre]');
    const t = text(render('/organizar?liga=L3'));
    expect(t).not.toContain('Liga del club');
    expect(t).toContain('[Por hacer y La liga de Liga de los martes]');
  });

  it('sin `?liga=`, la última que se miró (si todavía la organizas)', () => {
    state.last = 'L2';
    expect(text(render())).toContain('[Por hacer y La liga de Copa de octubre]');
    state.last = 'L3';
    expect(text(render())).toContain('[Por hacer y La liga de Liga de los martes]');
  });

  it('en Lite se abre igual, con «Esto es de Pro · Usar Pro»', () => {
    state.pro = false;
    const t = text(render());
    expect(t).toContain('Esto es de Pro');
    expect(t).toContain('Usar Pro');
    expect(t).toContain('[Por hacer y La liga de Liga de los martes]');
  });

  it('sin ligas que organizar: cómo crear una', () => {
    state.members = [{ leagueId: 'L3', role: 'member' }];
    const t = text(render());
    expect(t).toContain('Todavía no organizas ninguna liga');
    expect(t).toContain('Crear o unirme');
    expect(t).not.toContain('cambiar de liga');
  });

  it('el superadmin ve además su consola, y abre cualquier liga pedida', () => {
    state.auth = { user: { uid: 'u1' }, loading: false, isSuper: true };
    state.members = [{ leagueId: 'L1', role: 'owner' }];
    const out = render('/organizar?liga=L3');
    expect(text(out)).toContain('Panel del superadmin');
    expect(out).toContain('href="/superadmin"');
    expect(text(out)).toContain('[Por hacer y La liga de Liga del club]');
  });
});
