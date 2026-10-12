/**
 * Hoy con transmisiones en vivo (docs/equipos-y-en-vivo.md §2) dibujado sin navegador (renderToString): «En vivo
 * ahora» debajo de lo de hoy cuando tus ligas (o las que sigues) transmiten, y nada cuando no. Las ligas, la actividad y
 * las transmisiones son de mentira (vi.mock).
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveStream } from '../lib/data/streams';
import { FeedbackProvider } from '../components/feedback';

const state = vi.hoisted(() => ({ now: [] as LiveStream[] }));

vi.mock('../lib/auth', async (orig) => ({
  ...(await orig<typeof import('../lib/auth')>()),
  useAuth: () => ({ user: { uid: 'u1', email: 'ana@x.com', displayName: 'Ana Pérez' }, profile: null, isSuper: false, loading: false, recovering: false }),
}));
vi.mock('../lib/useMode', async (orig) => ({
  ...(await orig<typeof import('../lib/useMode')>()),
  useIsPro: () => false,
  useMode: () => ({ mode: 'lite', isPro: false, setMode: async () => 'local', suggestedPro: false }),
}));
vi.mock('../components/home/useHomeData', async (orig) => {
  const today = '2026-10-11';
  return {
    ...(await orig<typeof import('../components/home/useHomeData')>()),
    useMyLeagues: () => ({ uid: 'u1', memberships: { data: [], loading: false, error: null }, all: [], leagues: [], loading: false, error: null, roleOf: () => undefined }),
    useActivity: () => ({
      now: new Date(2026, 9, 11, 19, 0),
      today,
      feeds: [],
      leagues: [],
      mine: [],
      games: [],
      liveItems: [],
      upcoming: [],
      next: null,
      nextMatch: null,
      nextOf: new Map(),
      loading: false,
    }),
  };
});
// El marco de la app (barra de abajo, sin señal) no hace falta aquí.
vi.mock('../components/Shell', async (orig) => ({
  ...(await orig<typeof import('../components/Shell')>()),
  AppShell: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../lib/data/streams', async (orig) => ({
  ...(await orig<typeof import('../lib/data/streams')>()),
  useLiveNow: () => ({ data: state.now, loading: false, error: null }),
}));

const { default: HomePage } = await import('./HomePage');

const stream = (p: Partial<LiveStream> = {}): LiveStream => ({
  id: 's1',
  leagueId: 'L1',
  leagueName: 'Liga del Este',
  sport: 'football',
  matchId: 'm1',
  eventId: null,
  url: 'https://youtu.be/dQw4w9WgXcQ',
  platform: 'youtube',
  title: null,
  label: 'Tigres vs Leones',
  startedAt: new Date().toISOString(),
  startedBy: { id: 'u-ana', name: 'Ana' },
  canEnd: false,
  ...p,
});

const render = () => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(HomePage))));
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

beforeEach(() => {
  state.now = [];
});

describe('Hoy: En vivo ahora', () => {
  it('sin transmisiones no sale', () => {
    expect(text(render())).not.toContain('En vivo ahora');
  });

  it('con transmisiones, la tarjeta con cada una a la página En vivo de su liga', () => {
    state.now = [stream()];
    const html = render();
    expect(text(html)).toContain('En vivo ahora');
    expect(text(html)).toContain('Tigres vs Leones');
    expect(html).toContain('href="/l/L1/vivo?s=s1"');
  });
});
