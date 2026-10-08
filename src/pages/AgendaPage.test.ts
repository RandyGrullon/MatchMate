/**
 * El Calendario (/agenda) dibujado sin navegador (renderToString): «‹ Ligas» y el título; con ligas, «Tus ligas |
 * Abiertas» (lo abierto por defecto: ahí llevan los links de «¿Dónde juego esta semana?»); sin cuenta, solo lo abierto;
 * cada fecha en una fila con «Me apunto»; el filtro por día solo en Pro.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgendaItem } from '../lib/data/agenda';
import { FeedbackProvider } from '../components/feedback';

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u1' } as { uid: string } | null, loading: false },
  items: [] as AgendaItem[],
  leagues: [] as { id: string; name: string; sport: string }[],
  pro: false,
}));

vi.mock('../lib/auth', async (orig) => ({ ...(await orig<typeof import('../lib/auth')>()), useAuth: () => state.auth }));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: unknown }) => children }));
vi.mock('../lib/useNow', () => ({ useNow: () => new Date(2026, 9, 5, 12, 0) }));
vi.mock('../lib/useMode', () => ({
  useIsPro: () => state.pro,
  useMode: () => ({ mode: state.pro ? 'pro' : 'lite', isPro: state.pro, setMode: async () => 'saved', suggestedPro: false }),
}));
vi.mock('../lib/data/agenda', async (orig) => ({
  ...(await orig<typeof import('../lib/data/agenda')>()),
  useAgenda: () => ({ data: { items: state.items }, loading: false, error: null }),
}));
vi.mock('../lib/data/members', async (orig) => ({
  ...(await orig<typeof import('../lib/data/members')>()),
  useMyMemberships: () => ({ data: [], loading: false, error: null }),
}));
vi.mock('../components/home/useHomeData', () => ({
  useMyLeagues: () => ({ uid: state.auth.user?.uid, all: state.leagues, leagues: state.leagues, loading: false, error: null }),
  useActivity: () => ({ feeds: [], mine: [], leagues: state.leagues, today: '2026-10-05', loading: false }),
}));

const { default: AgendaPage } = await import('./AgendaPage');

const item = (over: Partial<AgendaItem> = {}): AgendaItem => ({
  eventId: 'ev1',
  leagueId: 'l1',
  leagueName: 'Liga Abierta',
  sport: 'bowling',
  leagueKind: 'liga',
  type: 'practica',
  name: '',
  date: '2026-10-06',
  time: '19:00',
  timeLabel: '7:00 pm',
  venue: 'Bowling Center',
  join: 'rsvp',
  cap: null,
  taken: 3,
  spotsLeft: null,
  waitlist: null,
  until: null,
  categories: null,
  mine: false,
  url: '/l/l1/e/ev1',
  ...over,
});

const render = (url = '/agenda') => renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(AgendaPage))));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

beforeEach(() => {
  state.auth = { user: { uid: 'u1' }, loading: false };
  state.items = [item(), item({ eventId: 'ev2', date: '2026-10-08', name: 'Noche de dobles', leagueName: 'Pádel Norte', sport: 'padel' })];
  state.leagues = [{ id: 'mine', name: 'Liga de los martes', sport: 'bowling' }];
  state.pro = false;
});

describe('el Calendario', () => {
  it('con ligas: «Tus ligas | Abiertas», lo abierto por defecto, cada fecha con «Me apunto»', () => {
    const out = render();
    const t = text(out);
    expect(t).toContain('Ligas');
    expect(out).toContain('class="text-title');
    expect(t).toContain('Calendario');
    expect(out).toMatch(/role="radio" aria-checked="true"[^>]*>Abiertas/);
    expect(t).toContain('Tus ligas');
    expect(t).toContain('OCT 6');
    expect(t).toContain('Martes · 7:00 pm · Liga Abierta · Bowling Center · 3 van');
    expect(t).toContain('Noche de dobles');
    expect(t.match(/Me apunto/g)?.length).toBe(2);
    // Lite: el filtro por deporte (son 2), sin el de los días.
    expect(out).toContain('aria-label="Filtrar por deporte"');
    expect(out).not.toContain('aria-label="Filtrar por día"');
  });

  it('?ver=mias: la semana de tus ligas', () => {
    const out = render('/agenda?ver=mias');
    expect(out).toMatch(/role="radio" aria-checked="true"[^>]*>Tus ligas/);
    expect(text(out)).toContain('Tus ligas, semana por semana');
    expect(text(out)).not.toContain('Me apunto');
  });

  it('sin cuenta (o sin ligas): solo lo abierto, sin el segmentado', () => {
    state.auth = { user: null, loading: false };
    const out = render('/agenda?ver=mias');
    expect(out).not.toContain('role="radiogroup"');
    expect(text(out)).toContain('Me apunto');
  });

  it('Pro: también el filtro por día', () => {
    state.pro = true;
    expect(render()).toContain('aria-label="Filtrar por día"');
  });

  it('nada abierto', () => {
    state.items = [];
    expect(text(render())).toContain('Nada abierto por ahora');
  });
});
