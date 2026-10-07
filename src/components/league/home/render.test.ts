/**
 * La Liga sin pestañas (rediseño «Calma y foco», `2-liga.png`) dibujada sin navegador (renderToString): la barra de
 * arriba («‹ Ligas» e «Invitar», «‹ Liga de los martes»), el nombre completo con cuándo y dónde, «En juego ahora» con UN
 * botón (la misma lógica que Hoy), la Tabla con los 3 de arriba, «Próximas fechas» con «Voy» en línea y las filas
 * Jugadores, Resultados anteriores y Mis números (en Pro, «Organizas esta liga»). Ya no hay pestañas, y lo que tenían
 * sigue a un toque. Los datos de la liga son de mentira (vi.mock); la memoria de la hoja de anotar, un Map.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarItem } from '../../../lib/calendar';
import { LeagueContext, type LeagueCtx } from '../../../lib/league';
import type { LiveGame } from '../../../lib/live';
import type { BowlingEvent, Entry, League, Member, Player } from '../../../lib/types';
import type { EditorWork } from '../../frames/FrameEditor';
import { gameKey, myGamesPlace, writeGameDraft } from '../../frames/draftMemory';
import { FeedbackProvider } from '../../feedback';

const world = vi.hoisted(() => ({
  pro: false,
  suggested: false,
  events: [] as BowlingEvent[],
  entries: [] as Entry[],
  players: [] as Player[],
}));

vi.mock('../../../lib/auth', async (orig) => ({
  ...(await orig<typeof import('../../../lib/auth')>()),
  useAuth: () => ({ user: { uid: 'u1', email: 'ana@x.com', displayName: 'Ana Pérez' }, profile: null, isSuper: false, loading: false, recovering: false }),
}));
vi.mock('../../../lib/data', async (orig) => {
  const ok = <T,>(data: T) => ({ data, loading: false, error: null });
  return {
    ...(await orig<typeof import('../../../lib/data')>()),
    useEvents: () => ok(world.events),
    usePlayers: () => ok(world.players),
    useEntriesOfEvents: () => ok(world.entries),
    useEventEntries: (_lid: string, eventId: string) => ok(world.entries.filter((e) => e.eventId === eventId)),
    useEventSubmissions: () => ok([]),
    useEventLive: () => ok([]),
    useSubmissions: () => ok([]),
    useMyMemberships: () => ok([]),
    useLeaguesByIds: () => ok([]),
  };
});
vi.mock('../../../lib/data/players', async (orig) => ({
  ...(await orig<typeof import('../../../lib/data/players')>()),
  usePlayers: () => ({ data: world.players, loading: false, error: null }),
}));
vi.mock('../../../lib/data/seasons', async (orig) => ({
  ...(await orig<typeof import('../../../lib/data/seasons')>()),
  useLeagueSeasons: () => ({ data: [], loading: false, error: null }),
}));
vi.mock('../../../lib/data/lanes', async (orig) => ({
  ...(await orig<typeof import('../../../lib/data/lanes')>()),
  useEventLanes: () => ({ data: [], loading: false, error: null }),
}));
vi.mock('../../../lib/draft', async (orig) => ({
  ...(await orig<typeof import('../../../lib/draft')>()),
  useDraft: () => null,
}));
vi.mock('../../../lib/useNow', () => ({ useNow: () => new Date(2026, 9, 7, 20, 0) }));
vi.mock('../../../lib/useMode', async (orig) => ({
  ...(await orig<typeof import('../../../lib/useMode')>()),
  useIsPro: () => world.pro,
  useMode: () => ({ mode: world.pro ? 'pro' : 'lite', isPro: world.pro, setMode: async () => 'local', suggestedPro: world.suggested }),
}));

const { default: LeagueHome } = await import('../../../pages/LeagueHomePage');
const { InvitePill, LeagueBackBar, LeagueBarProvider, LeagueTopBar, ShellBackBar } = await import('./LeagueTopBar');
const { LeagueRows, NextDates, NowCard, ROW_ICONS } = await import('./LeagueSections');
const { PlayersSheet } = await import('./LeagueSheets');

const store = new Map<string, string>();
const memoryStorage = {
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
beforeAll(() => vi.stubGlobal('localStorage', memoryStorage));
afterAll(() => vi.unstubAllGlobals());

const TODAY = '2026-10-07';
const league: League = {
  id: 'L1',
  name: 'Liga de los martes',
  visibility: 'private',
  ownerUid: 'u1',
  venue: 'Bolera Sambil',
  schedule: 'Martes y miércoles · 7:30 pm',
  seasonStart: '2026-09-01',
  seasonEnd: '2026-12-15',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport: 'bowling',
};
const member = (role: Member['role']): Member => ({ id: `m-${role}`, leagueId: 'L1', uid: 'u1', name: 'Ana Pérez', role, playerId: 'p-ana' });
const ctx = (p: Partial<LeagueCtx> = {}): LeagueCtx => ({
  lid: 'L1',
  league,
  member: member('member'),
  isAdmin: false,
  isOwner: false,
  isScorer: false,
  canScore: false,
  myPlayerId: 'p-ana',
  base: '/l/L1',
  ...p,
});
const render = (node: ReactNode, c: LeagueCtx = ctx()) =>
  renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: c }, node))));
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const ev = (id: string, date: string, p: Partial<BowlingEvent> = {}): BowlingEvent => ({
  id,
  type: 'practica',
  name: '',
  date,
  games: 3,
  hcpBase: 0,
  hcpPercent: 0,
  teams: {},
  playerCount: 6,
  ...p,
});
const today = ev('E0', TODAY, { name: 'Práctica de hoy' });
const entry = (eventId: string, playerId: string, scores: (number | null)[]): Entry => ({
  id: `${eventId}-${playerId}`,
  eventId,
  playerId,
  teamId: null,
  average: 0,
  handicapOverride: null,
  scores,
  photos: scores.map((s) => (s == null ? null : 'f')),
});
const work = (rolls: number[]): EditorWork => ({ mode: 'teclado', rolls, masks: rolls.map(() => null), total: '', hole: null });

beforeEach(() => {
  store.clear();
  world.pro = false;
  world.suggested = false;
  world.players = [
    { id: 'p-pedro', name: 'Pedro Gómez', averageOverride: null },
    { id: 'p-ana', name: 'Ana Pérez', averageOverride: null },
    { id: 'p-luis', name: 'Luis Martínez', averageOverride: null },
    { id: 'p-sofia', name: 'Sofía Rodríguez', averageOverride: null },
  ];
  world.events = [
    ev('E1', '2026-09-29'),
    ev('E2', '2026-10-06'),
    today,
    ev('E3', '2026-10-13', { rsvp: {} }),
    ev('T1', '2026-10-24', { type: 'torneo', name: 'Copa de octubre' }),
  ];
  // Dos prácticas pasadas (6 juegos cada uno, el mínimo para la Tabla) y hoy: Ana lleva 187 y 210.
  world.entries = [
    ...['E1', 'E2'].flatMap((e) => [
      entry(e, 'p-pedro', [219, 219, 219]),
      entry(e, 'p-ana', [195, 195, 195]),
      entry(e, 'p-luis', [194, 194, 194]),
      entry(e, 'p-sofia', [167, 167, 167]),
    ]),
    entry('E0', 'p-ana', [187, 210, null]),
    entry('E0', 'p-pedro', [212, 245, 201]),
  ];
  // El juego 3 de Ana quedó a medias en la hoja de anotar.
  writeGameDraft(gameKey(myGamesPlace('u1', 'L1', 'p-ana', 'E0'), 2), work([10, 7, 3, 9, 0]), null);
});

describe('la barra de arriba', () => {
  it('en el inicio: «‹ Ligas» (vuelve a Ligas) e «Invitar» con texto', () => {
    const html = render(h(LeagueTopBar, { to: '/ligas', label: 'Ligas', actions: h(InvitePill, { onClick: () => {}, ariaLabel: 'Invitar a la liga' }) }));
    expect(html).toContain('href="/ligas"');
    expect(text(html)).toContain('Ligas Invitar');
    expect(html).toContain('aria-label="Invitar a la liga"');
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it('adentro: «‹ Liga de los martes» vuelve al inicio de la liga; una pantalla puede traer la suya con sus botones', () => {
    const html = render(h(LeagueBarProvider, null, h(ShellBackBar)));
    expect(html).toContain('href="/l/L1"');
    expect(text(html)).toContain('Liga de los martes');
    const own = render(h(LeagueBarProvider, null, h(LeagueBackBar, { actions: h('button', null, 'Excel') })));
    expect(text(own)).toContain('Liga de los martes Excel');
  });
});

describe('la Liga en una sola pantalla (Lite)', () => {
  it('sin pestañas: el nombre completo, cuándo y dónde, y las secciones en orden', () => {
    const html = render(h(LeagueHome));
    const out = text(html);
    expect(html).not.toContain('Secciones de la liga');
    expect(out).not.toMatch(/Calendario Juegos Ranking/);
    expect(html).toMatch(/<h1[^>]*>Liga de los martes<\/h1>/);
    expect(out).toContain('Martes y miércoles 7:30 pm · Bolera Sambil');
    const order = ['En juego ahora', 'Tabla', 'Próximas fechas', 'Jugadores', 'Resultados anteriores', 'Mis números en esta liga'].map((t) => out.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('«En juego ahora»: la práctica una vez, lo tuyo en una línea y UN botón que abre la hoja de anotar (1 toque)', () => {
    const html = render(h(LeagueHome));
    const out = text(html);
    expect(out).toContain('Práctica de hoy');
    expect(out).toContain('Llevas 187 y 210 · el juego 3 va a medias');
    expect(out).toContain('Seguir mi juego 3');
    expect(html).toContain('href="/l/L1/e/E0?anotar=1"');
    // El nombre abre la práctica (cómo van todos).
    expect(html).toContain('href="/l/L1/e/E0"');
    expect(out.match(/Seguir mi juego/g)).toHaveLength(1);
  });

  it('Tabla: los 3 de arriba por promedio, tu fila con «Tú», y «Ver toda» abre la Tabla', () => {
    const out = text(render(h(LeagueHome)));
    expect(out).toMatch(/1 PG Pedro Gómez 219 .*2 AP Ana Pérez Tú 195 .*3 LM Luis Martínez 194/);
    expect(out).not.toContain('Sofía Rodríguez');
    const html = render(h(LeagueHome));
    expect(html).toContain('href="/l/L1/ranking"');
    expect(html).toContain('href="/l/L1/j/p-pedro"');
  });

  it('Próximas fechas: la próxima práctica con «Voy» en línea y el torneo con sus inscritos (sin la de hoy, que ya sale arriba)', () => {
    const out = text(render(h(LeagueHome)));
    expect(out).toContain('OCT 13');
    expect(out).toContain('Práctica Martes · 7:30 pm');
    expect(out).toContain('Copa de octubre Sábado · torneo · 6 inscritos');
    expect(out).toContain('Voy');
    expect(out).toContain('Calendario');
    expect(out).not.toContain('OCT 7 ');
  });

  it('lo de las pestañas de antes sigue a un toque: Resultados anteriores (los juegos) y Mis números (mis juegos)', () => {
    const html = render(h(LeagueHome));
    const out = text(html);
    expect(out).toContain('Jugadores 4 en la liga');
    expect(out).toContain('Resultados anteriores 29 sep · 6 oct');
    expect(html).toContain('href="/l/L1/juegos"');
    expect(html).toContain('href="/l/L1/perfil"');
    // Lite: nada de Organizar en la liga (a quien organiza se le sugiere Pro en su aviso).
    expect(html).not.toContain('href="/l/L1/admin"');
    // El buzón de sugerencias para los jugadores, como una fila más.
    expect(out).toContain('Buzón de sugerencias');
  });
});

describe('la Liga en Pro', () => {
  it('quien organiza tiene la fila «Organizas esta liga» que lleva a Organizar; no le sale el buzón', () => {
    world.pro = true;
    const html = render(h(LeagueHome), ctx({ isAdmin: true, isOwner: true, canScore: true, member: member('owner') }));
    const out = text(html);
    expect(out).toContain('Organizas esta liga');
    expect(html).toContain('href="/l/L1/admin"');
    expect(out).not.toContain('Buzón de sugerencias');
    // Lo mismo de Lite: la tarjeta de ahora con su botón, la Tabla y las fechas.
    expect(out).toContain('Seguir mi juego 3');
    expect(out).toContain('Próximas fechas');
  });

  it('un jugador en Pro no ve Organizar', () => {
    world.pro = true;
    expect(render(h(LeagueHome))).not.toContain('href="/l/L1/admin"');
  });
});

describe('quien mira una liga pública sin ser miembro', () => {
  it('«Unirme», la tarjeta de ahora sin botón de anotar, y sin «Mis números»', () => {
    const html = render(h(LeagueHome), ctx({ league: { ...league, visibility: 'public' }, member: null, myPlayerId: null }));
    const out = text(html);
    expect(out).toContain('Estás viendo Liga de los martes');
    expect(out).toContain('Unirme');
    expect(out).toContain('Práctica de hoy');
    expect(out).toContain('Mira cómo van todos');
    expect(out).not.toContain('Seguir mi juego');
    expect(out).not.toContain('Mis números');
  });
});

describe('las piezas', () => {
  it('NowCard: «Empieza a las 7:30 pm» antes de la hora', () => {
    const g: LiveGame = {
      feed: { lid: 'L1', uid: 'u1', playerId: 'p-ana', isAdmin: false, isScorer: false, events: [today], mySubs: [], pending: [], reactions: [], comments: [], suggestions: [] },
      league,
      event: today,
      info: { live: true, startLabel: '7:30 pm', startsSoon: true },
    };
    expect(text(render(h(NowCard, { game: g, today: TODAY, member: true })))).toContain('Empieza a las 7:30 pm');
  });

  it('NextDates: una práctica del horario que todavía no se creó no lleva a ningún lado ni tiene «Voy»', () => {
    const item: CalendarItem = {
      key: 'L1:horario:2026-10-13',
      kind: 'event',
      date: '2026-10-13',
      lid: 'L1',
      leagueName: 'Liga de los martes',
      sport: 'bowling',
      type: 'practica',
      name: 'Práctica',
      time: '7:30 pm',
      minutes: 1170,
      eventId: null,
      playerId: 'p-ana',
      going: false,
      href: '/l/L1',
      matchId: null,
    };
    const html = render(h(NextDates, { items: [item], events: [], today: TODAY, onCalendar: () => {} }));
    expect(html).not.toContain('href="/l/L1"');
    expect(text(html)).not.toContain('Voy');
    expect(text(html)).toContain('Práctica Martes · 7:30 pm');
  });

  it('LeagueRows: el número de lo que espera y el chevron', () => {
    const html = render(h(LeagueRows, { rows: [{ key: 'o', icon: ROW_ICONS.organize, title: 'Organizas esta liga', subtitle: '3 por aprobar', to: '/l/L1/admin', count: 3, accent: true }] }));
    expect(text(html)).toContain('Organizas esta liga 3 por aprobar 3');
    expect(html).toContain('aria-label="3 pendientes"');
  });

  it('PlayersSheet: todos por nombre, cada uno a su página, y en Pro quien organiza edita', () => {
    world.pro = true;
    const html = render(h(PlayersSheet, { open: true, onClose: () => {} }), ctx({ isAdmin: true }));
    const out = text(html);
    expect(out.indexOf('Ana Pérez')).toBeLessThan(out.indexOf('Luis Martínez'));
    expect(html).toContain('href="/l/L1/j/p-sofia"');
    expect(out).toContain('Editar jugadores');
    world.pro = false;
    expect(text(render(h(PlayersSheet, { open: true, onClose: () => {} }), ctx({ isAdmin: true })))).not.toContain('Editar jugadores');
  });
});
