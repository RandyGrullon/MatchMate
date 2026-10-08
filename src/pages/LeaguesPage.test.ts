/**
 * Ligas (`/ligas`, rediseño «Calma y foco») dibujada sin navegador: el título con «Crear o unirme», «Tus ligas» con lo
 * de hoy («En juego hoy · 6 jugadores»), «Tus torneos» (también el de la liga), «Buscar ligas abiertas» y, en
 * `?ver=abiertas`, las públicas para unirse con la agenda. Lite y Pro; los chips de deporte solo con más de uno.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarItem } from '../lib/calendar';
import type { PublicLeague } from '../lib/data/leagues';
import type { League } from '../lib/types';

const TODAY = '2026-10-07';

const world = vi.hoisted(() => ({
  signedIn: true,
  pro: false,
  leagues: [] as League[],
  roles: {} as Record<string, string>,
  upcoming: [] as CalendarItem[],
  liveLids: [] as string[],
  feeds: [] as { lid: string; events: { id: string; playerCount: number }[] }[],
  publics: [] as PublicLeague[],
  players: 6,
}));

vi.mock('../lib/auth', async (orig) => ({
  ...(await orig<typeof import('../lib/auth')>()),
  useAuth: () => ({ user: world.signedIn ? { uid: 'u1' } : null, profile: null, isSuper: false, loading: false, recovering: false }),
}));
vi.mock('../lib/useMode', async (orig) => ({
  ...(await orig<typeof import('../lib/useMode')>()),
  useIsPro: () => world.pro,
}));
vi.mock('../components/home/useHomeData', () => ({
  useMyLeagues: () => ({
    uid: world.signedIn ? 'u1' : undefined,
    memberships: { data: [], loading: false, error: null },
    all: world.signedIn ? world.leagues : [],
    leagues: world.leagues,
    loading: false,
    error: null,
    roleOf: (lid: string) => world.roles[lid],
  }),
  useActivity: (leagues: League[]) => {
    const ids = new Set(leagues.map((l) => l.id));
    const upcoming = world.upcoming.filter((u) => ids.has(u.lid));
    const nextOf = new Map<string, CalendarItem>();
    for (const u of upcoming) if (!nextOf.has(u.lid)) nextOf.set(u.lid, u);
    return {
      now: new Date(2026, 9, 7, 19, 48),
      today: TODAY,
      feeds: world.feeds,
      leagues,
      mine: [],
      games: world.liveLids.map((lid) => ({ feed: { lid }, event: { id: `${lid}-hoy` }, info: { live: true, startsSoon: false, startLabel: null } })),
      liveItems: [],
      upcoming,
      next: null,
      nextMatch: null,
      nextOf,
      loading: false,
    };
  },
  useJoin: () => ({ joining: null, join: async () => undefined, modal: null }),
}));
vi.mock('../lib/data', async (orig) => ({
  ...(await orig<typeof import('../lib/data')>()),
  usePlayers: () => ({ data: Array.from({ length: world.players }, (_, i) => ({ id: `p${i}`, name: `J${i}`, averageOverride: null })), loading: false, error: null }),
}));
vi.mock('../lib/data/leagues', async (orig) => ({
  ...(await orig<typeof import('../lib/data/leagues')>()),
  usePublicLeagues: (q: { sport?: string | null; enabled?: boolean } = {}) => ({
    data: q.enabled === false ? [] : world.publics.filter((l) => !q.sport || (l.sport ?? 'bowling') === q.sport),
    loading: false,
    error: null,
  }),
}));
vi.mock('../components/CreateMenu', () => ({ useCreateMenu: () => ({ openMenu: () => undefined, startCreate: () => undefined }) }));
vi.mock('../components/home/LeagueCard', () => ({ LeagueLogo: ({ children }: { children: ReactNode }) => children }));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const { default: LeaguesPage } = await import('./LeaguesPage');

const render = (path = '/ligas') => renderToString(h(MemoryRouter, { initialEntries: [path] }, h(LeaguesPage)));
const text = (html: string) =>
  html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const league = (id: string, name: string, extra: Partial<League> = {}): League =>
  ({ id, name, kind: 'liga', visibility: 'public', sport: 'bowling', schedule: 'Martes · 7:30 pm', venue: 'Bolera Sambil', logoPath: null, ...extra }) as League;

const item = (p: Partial<CalendarItem>): CalendarItem => ({
  key: `${p.lid}:${p.date}:${p.eventId}`,
  kind: 'event',
  date: TODAY,
  lid: 'l1',
  leagueName: 'Liga de los martes',
  sport: 'bowling',
  type: 'practica',
  name: 'Práctica',
  time: '7:30 pm',
  minutes: 19 * 60 + 30,
  eventId: 'e1',
  playerId: 'p1',
  going: false,
  href: `/l/${p.lid ?? 'l1'}/e/${p.eventId ?? 'e1'}`,
  matchId: null,
  ...p,
});

/** Mañana en la fecha local (la tarjeta dice «juega mañana» sin depender del día en que corre la prueba). */
const tomorrow = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const publicLeague = (id: string, name: string, extra: Partial<PublicLeague> = {}): PublicLeague =>
  ({
    ...league(id, name),
    members: 8,
    players: 8,
    activity: 3,
    nextEventAt: null,
    nextEventDate: tomorrow,
    lastActivityAt: null,
    ...extra,
  }) as PublicLeague;

beforeEach(() => {
  world.signedIn = true;
  world.pro = false;
  world.leagues = [league('l1', 'Liga de los martes')];
  world.roles = { l1: 'owner' };
  world.upcoming = [
    item({ lid: 'l1', eventId: 'l1-hoy' }),
    item({ lid: 'l1', type: 'torneo', name: 'Copa de octubre', date: '2026-10-24', eventId: 'copa', time: null, minutes: null }),
  ];
  world.liveLids = ['l1'];
  world.feeds = [{ lid: 'l1', events: [{ id: 'copa', playerCount: 6 }] }];
  world.publics = [];
  world.players = 6;
});

describe('Ligas (Lite)', () => {
  it('como el diseño: «Ligas», «Crear o unirme», Tus ligas, Tus torneos y Buscar ligas abiertas', () => {
    const html = render();
    const t = text(html);
    expect(html).toContain('class="text-title"');
    const order = ['Ligas', 'Crear o unirme', 'Tus ligas', 'Liga de los martes', 'En juego hoy · 6 jugadores', 'Tus torneos', 'Copa de octubre', 'Sábado 24 oct · 6 inscritos', 'Buscar ligas abiertas', 'Boliche y otros deportes'];
    const at = order.map((s) => t.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // «En juego hoy» va en el color del deporte.
    expect(html).toMatch(/<span class="font-semibold text-accent">En juego hoy<\/span>/);
    expect(html).toContain('href="/l/l1"');
    expect(html).toContain('href="/l/l1/e/copa"');
    expect(html).toContain('href="/ligas?ver=abiertas"');
    // Lo que se fue a Hoy o a la hoja: ni Próximos, ni las públicas, ni el código aquí.
    for (const gone of ['Próximos', 'Públicas para unirte', '¿Te invitaron?', 'Mis ligas', 'Solo boliche', 'Dueño']) expect(t).not.toContain(gone);
    // Un solo deporte: sin chips.
    expect(t).not.toContain('Todos');
  });

  it('sin torneos no sale «Tus torneos»; si no juega hoy, cuándo es lo próximo', () => {
    world.upcoming = [item({ lid: 'l1', date: '2026-10-13', eventId: 'p2' })];
    world.liveLids = [];
    const t = text(render());
    expect(t).not.toContain('Tus torneos');
    expect(t).toContain('Martes, 7:30 pm · 6 jugadores');
  });

  it('cuenta nueva: unirse o crear, y buscar ligas abiertas', () => {
    world.leagues = [];
    const t = text(render());
    expect(t).toContain('Todavía no estás en ninguna liga');
    expect(t).toContain('Crear o unirme');
    expect(t).toContain('Buscar ligas abiertas');
    expect(t).not.toContain('Tus ligas');
  });

  it('con más de un deporte, los chips (Todos y los suyos)', () => {
    world.leagues = [league('l1', 'Liga de los martes'), league('l2', 'Pádel Naco', { sport: 'padel' })];
    const t = text(render());
    expect(t).toContain('Todos');
    expect(t).toContain('Pádel');
    expect(t).toContain('Pádel Naco');
    expect(t).toContain('De todos los deportes');
    // Con el chip de pádel, solo lo de pádel.
    const padel = text(render('/ligas?deporte=padel'));
    expect(padel).toContain('Pádel Naco');
    expect(padel).not.toContain('Liga de los martes');
  });

  it('esports: con el filtro en Esports, o sin filtro y la cuenta en esports, la fila «Torneos de esports» → /esports', () => {
    // Sin nada de esports: no sale.
    expect(text(render())).not.toContain('Torneos de esports');
    world.leagues = [league('l1', 'Liga de los martes'), league('l3', 'Copa Radiante', { sport: 'esports', kind: 'torneo' })];
    const all = render();
    expect(text(all)).toContain('Torneos de esports');
    expect(all).toContain('href="/esports"');
    // Antes de «Buscar ligas abiertas».
    expect(text(all).indexOf('Torneos de esports')).toBeLessThan(text(all).indexOf('Buscar ligas abiertas'));
    expect(text(render('/ligas?deporte=esports'))).toContain('Torneos de esports');
    // Con el filtro en otro deporte, no.
    expect(text(render('/ligas?deporte=bowling'))).not.toContain('Torneos de esports');
  });
});

describe('Ligas (Pro)', () => {
  it('el mismo orden, más denso, con mi papel', () => {
    world.pro = true;
    const html = render();
    const t = text(html);
    expect(html).toContain('class="text-title-pro"');
    expect(t).toContain('En juego hoy · 6 jugadores · Dueño');
    expect(t).toContain('Sábado 24 oct · 6 inscritos');
    expect(t).toContain('Buscar ligas abiertas');
  });
});

describe('Buscar ligas abiertas', () => {
  it('las públicas para unirse (las mías no), con chips de deporte, buscador y la agenda', () => {
    world.publics = [publicLeague('l1', 'Liga de los martes'), publicLeague('x', 'Liga del Naco'), publicLeague('y', 'Pádel Piantini', { sport: 'padel' })];
    const html = render('/ligas?ver=abiertas');
    const t = text(html);
    expect(t).toContain('Ligas abiertas');
    expect(html).toContain('href="/ligas"');
    expect(html).toContain('placeholder="Buscar por nombre o lugar"');
    expect(t).toContain('¿Dónde juego esta semana?');
    expect(html).toContain('href="/agenda"');
    expect(t).toContain('Para unirte');
    expect(t).toContain('Liga del Naco');
    expect(t).toContain('Pádel Piantini');
    expect(t).not.toMatch(/Para unirte.*Liga de los martes/);
    expect(html).toContain('aria-label="Unirme a Liga del Naco"');
    expect(t).toContain('Todos');
    expect(t).toContain('Boliche · 8 jugadores · juega mañana · Bolera Sambil');
  });

  it('sin ninguna para unirse lo dice', () => {
    world.publics = [publicLeague('l1', 'Liga de los martes')];
    expect(text(render('/ligas?ver=abiertas'))).toContain('Ya estás en todas las públicas.');
  });

  it('sin cuenta: las abiertas, con «Entrar»', () => {
    world.signedIn = false;
    world.publics = [publicLeague('x', 'Liga del Naco')];
    const html = render();
    const t = text(html);
    expect(t).toContain('Ligas abiertas');
    expect(t).toContain('Entrar');
    expect(t).toContain('Liga del Naco');
    expect(html).not.toContain('href="/ligas"');
  });
});
