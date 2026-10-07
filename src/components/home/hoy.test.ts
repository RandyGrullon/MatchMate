/**
 * Hoy (rediseño «Calma y foco») dibujado sin navegador (renderToString): la tarjeta de hoy en Lite y en Pro (tus juegos,
 * el juego a medias, UN botón y la línea social), el día sin juego con «Voy», la cuenta nueva con el código, «Lo que
 * viene» con «Voy» en línea, el encabezado con la campana y «PRO ▾», y las secciones de Pro (Por hacer, En vivo, Esta
 * semana). Los datos de la liga son de mentira (vi.mock); la memoria de la hoja de anotar, un Map.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarItem } from '../../lib/calendar';
import type { LeagueFeed } from '../../lib/data';
import type { GameDraft } from '../../lib/draft';
import type { LaneRow } from '../../lib/lanes';
import type { LiveGame } from '../../lib/live';
import type { BowlingEvent, Entry, League, LiveScore, Player, Submission } from '../../lib/types';
import type { EditorWork } from '../frames/FrameEditor';
import { gameKey, myGamesPlace, writeGameDraft } from '../frames/draftMemory';
import { FeedbackProvider } from '../feedback';

const world = vi.hoisted(() => ({
  pro: false,
  entries: [] as Entry[],
  subs: [] as Submission[],
  live: [] as LiveScore[],
  players: [] as Player[],
  lanes: [] as LaneRow[],
  draft: null as GameDraft | null,
  following: [] as unknown[],
  suggested: false,
  members: [] as { leagueId: string; role: string }[],
}));

vi.mock('../../lib/auth', async (orig) => ({
  ...(await orig<typeof import('../../lib/auth')>()),
  useAuth: () => ({ user: { uid: 'u1', email: 'ana@x.com', displayName: 'Ana Pérez' }, profile: null, isSuper: false, loading: false, recovering: false }),
}));
vi.mock('../../lib/data', async (orig) => {
  const ok = <T,>(data: T) => ({ data, loading: false, error: null });
  return {
    ...(await orig<typeof import('../../lib/data')>()),
    useEventEntries: () => ok(world.entries),
    useEventSubmissions: () => ok(world.subs),
    useEventLive: () => ok(world.live),
    usePlayers: () => ok(world.players),
    useMyMemberships: () => ok(world.members),
    useLeaguesByIds: () => ok([league]),
  };
});
vi.mock('../../lib/data/lanes', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/lanes')>()),
  useEventLanes: () => ({ data: world.lanes, loading: false, error: null }),
}));
vi.mock('../../lib/draft', async (orig) => ({
  ...(await orig<typeof import('../../lib/draft')>()),
  useDraft: () => world.draft,
}));
vi.mock('../../lib/data/profileGames', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/profileGames')>()),
  useFollowingGames: () => ({
    data: world.following,
    loading: false,
    error: null,
    hasMore: false,
    loadingMore: false,
    moreError: null,
    loadMore: async () => undefined,
    refresh: () => undefined,
  }),
}));
vi.mock('../../lib/useMode', async (orig) => ({
  ...(await orig<typeof import('../../lib/useMode')>()),
  useIsPro: () => world.pro,
  useMode: () => ({ mode: world.pro ? 'pro' : 'lite', isPro: world.pro, setMode: async () => 'local', suggestedPro: world.suggested }),
}));

const { GameTiles, NextUpCard, TodayCard } = await import('./TodayCard');
const { JoinLeagueCard } = await import('./JoinLeagueCard');
const { UpNext } = await import('./UpNext');
const { HomeHeader } = await import('./HomeHeader');
const { LiveSectionPro, ToDoSection, WeekStrip, toDoOf } = await import('./ProSections');
const { pendingNotice } = await import('./useHomeNotices');
const { FollowingSlot } = await import('./FollowingSlot');
const { ModeSheet } = await import('./HomeSheets');
const { AgendaRow } = await import('./WeekAgenda');
const { LiveActions } = await import('../LiveNow');

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

const render = (node: ReactNode) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, node)));
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const TODAY = '2026-10-07';
const at = (ms: number) => ({ toMillis: () => ms });
const league: League = {
  id: 'L1',
  name: 'Liga de los martes',
  visibility: 'public',
  ownerUid: 'u1',
  venue: 'Bolera Sambil',
  schedule: 'Miércoles 7:30 pm',
  seasonStart: '2026-09-01',
  seasonEnd: '2026-12-15',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport: 'bowling',
};
const practice: BowlingEvent = { id: 'E1', type: 'practica', name: 'Práctica de hoy', date: TODAY, games: 3, hcpBase: 0, hcpPercent: 0, teams: {}, playerCount: 6 };
const feed = (p: Partial<LeagueFeed> = {}): LeagueFeed => ({
  lid: 'L1',
  uid: 'u1',
  playerId: 'p-ana',
  isAdmin: false,
  isScorer: false,
  events: [practice],
  mySubs: [],
  pending: [],
  reactions: [],
  comments: [],
  suggestions: [],
  ...p,
});
const game = (p: Partial<LeagueFeed> = {}): LiveGame => ({ feed: feed(p), league, event: practice, info: { live: true, startLabel: '7:30 pm', startsSoon: false } });
const entry = (playerId: string, scores: (number | null)[]): Entry => ({
  id: `en-${playerId}`,
  eventId: 'E1',
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
  world.players = [
    { id: 'p-pedro', name: 'Pedro Gómez', averageOverride: null },
    { id: 'p-luis', name: 'Luis Martínez', averageOverride: null },
    { id: 'p-sofia', name: 'Sofía Rodríguez', averageOverride: null },
    { id: 'p-ana', name: 'Ana Pérez', averageOverride: null },
  ];
  world.entries = [entry('p-pedro', [212, 245, 201]), entry('p-luis', [199, 182, 224]), entry('p-sofia', [168, 175, 159]), entry('p-ana', [187, 210, null])];
  world.subs = [];
  world.live = [];
  world.lanes = [{ eventId: 'E1', playerId: 'p-ana', lane: 7, position: 1, publishedAt: '2026-10-07T20:00:00Z' }];
  world.draft = null;
  world.following = [];
  world.suggested = false;
  world.members = [];
  // El juego 3 de Ana quedó a medias en la hoja de anotar: strike, spare y 9 (48, 3 cuadros).
  writeGameDraft(gameKey(myGamesPlace('u1', 'L1', 'p-ana', 'E1'), 2), work([10, 7, 3, 9, 0]), null);
});

describe('la tarjeta de hoy (Lite)', () => {
  it('la práctica una vez: título, liga · bolera, hora y pista, tus juegos y el juego a medias', () => {
    const out = text(render(h(TodayCard, { game: game(), today: TODAY, pro: false })));
    expect(out).toContain('En juego ahora');
    expect(out).toContain('7:30 pm · Pista 7');
    expect(out).toContain('Práctica de hoy');
    expect(out).toContain('Liga de los martes · Bolera Sambil');
    expect(out).toContain('Juego 1 187');
    expect(out).toContain('Juego 2 210');
    expect(out).toContain('Juego 3 A medias');
  });

  it('si el evento cae otro día que el de la liga, la hora es la del evento', () => {
    const g = { ...game(), event: { ...practice, startTime: '19:30:00' }, info: { live: true, startLabel: null, startsSoon: false } };
    expect(text(render(h(TodayCard, { game: g, today: TODAY, pro: false })))).toContain('7:30 pm · Pista 7');
  });

  it('sin hora ni pista (el evento cae otro día y no hay pistas): nada arriba a la derecha', () => {
    world.lanes = [];
    const g = { ...game(), info: { live: true, startLabel: null, startsSoon: false } };
    const html = render(h(TodayCard, { game: g, today: TODAY, pro: false }));
    expect(html).not.toMatch(/<span class="shrink-0 text-sm font-\[550\] text-muted"><\/span>/);
    expect(text(html)).toContain('En juego ahora');
  });

  it('UN botón: «Seguir mi juego 3», que abre la hoja de anotar en la práctica', () => {
    const html = render(h(TodayCard, { game: game(), today: TODAY, pro: false }));
    expect(text(html)).toContain('Seguir mi juego 3');
    expect(html).toContain('href="/l/L1/e/E1?anotar=1"');
    // En Lite no está la planilla (es de Pro), aunque organice la liga.
    expect(text(render(h(TodayCard, { game: game({ isAdmin: true }), today: TODAY, pro: false })))).not.toContain('Planilla');
  });

  it('la línea social lleva a la práctica: «4 jugando · Pedro va primero»', () => {
    const html = render(h(TodayCard, { game: game(), today: TODAY, pro: false }));
    expect(text(html)).toContain('PG LM SR');
    expect(text(html)).toContain('4 jugando · Pedro va primero');
    expect(html).toContain('href="/l/L1/e/E1"');
  });

  it('sin nada a medias: «Anotar juego 3» y la ficha que sigue con «+»', () => {
    store.clear();
    const out = text(render(h(TodayCard, { game: game(), today: TODAY, pro: false })));
    expect(out).toContain('Anotar juego 3');
    expect(out).toContain('por anotar');
    expect(out).not.toContain('A medias');
  });

  it('todos en el teléfono sin enviar: «Enviar mis juegos»', () => {
    store.clear();
    world.entries = world.entries.filter((e) => e.playerId !== 'p-ana');
    world.draft = { eventId: 'E1', values: ['187', '210', '199'] };
    expect(text(render(h(TodayCard, { game: game(), today: TODAY, pro: false })))).toContain('Enviar mis juegos');
  });
});

describe('la tarjeta de hoy (Pro)', () => {
  it('J1 J2 J3 y la Serie, «74…» del juego a medias, «Seguir juego 3» y «Planilla» para quien la anota', () => {
    world.pro = true;
    const html = render(h(TodayCard, { game: game({ isAdmin: true }), today: TODAY, pro: true }));
    const out = text(html);
    expect(out).toContain('En juego · 4 jugando');
    expect(out).toContain('J1 187');
    expect(out).toContain('J3 48…');
    expect(out).toContain('Serie 397');
    expect(out).toContain('Seguir juego 3');
    expect(out).toContain('Planilla');
    expect(html).toContain('href="/l/L1/e/E1?tab=juegos"');
    // La línea social va abajo, en «En vivo».
    expect(out).not.toContain('va primero');
  });

  it('arriba, «En juego · 4 jugando» entero: si no cabe, se acorta el nombre de la liga', () => {
    const html = render(h(TodayCard, { game: game(), today: TODAY, pro: true }));
    expect(html).toMatch(/<p class="flex items-center gap-2 text-sm font-semibold text-accent shrink-0">/);
    expect(html).toMatch(/<span class="min-w-0 truncate text-sm text-muted">Liga de los martes<\/span>/);
  });

  it('quien solo juega no tiene «Planilla»', () => {
    expect(text(render(h(TodayCard, { game: game(), today: TODAY, pro: true })))).not.toContain('Planilla');
  });
});

describe('las fichas', () => {
  it('lo enviado todavía no cuenta: en gris', () => {
    const html = render(h(GameTiles, { cells: [{ kind: 'tabla', score: 187, counted: true }, { kind: 'enviado', score: 190 }, { kind: 'vacio' }] }));
    expect(html).toMatch(/text-faint[^>]*>.*190/s);
    expect(text(html)).toContain('por anotar');
  });
});

describe('día sin juego', () => {
  const next: CalendarItem = {
    key: 'L1:E2',
    kind: 'event',
    date: '2026-10-13',
    lid: 'L1',
    leagueName: 'Liga de los martes',
    sport: 'bowling',
    type: 'practica',
    name: 'Práctica',
    time: '7:30 pm',
    minutes: 19 * 60 + 30,
    eventId: 'E2',
    playerId: 'p-ana',
    going: false,
    href: '/l/L1/e/E2',
    matchId: null,
  };

  it('«Hoy no te toca jugar · Tu próxima práctica» con su fecha (OCT / 13) y «Voy» como botón principal', () => {
    const html = render(h(NextUpCard, { item: next, today: '2026-10-08', rsvp: async () => undefined, anotar: 'ANOTAR' }));
    const out = text(html);
    expect(out).toContain('Hoy no te toca jugar');
    expect(out).toContain('Tu próxima práctica');
    expect(out).toContain('OCT');
    expect(out).toContain('13');
    expect(out).toContain('Martes · 7:30 pm');
    expect(out).toContain('Liga de los martes');
    expect(html).toContain('aria-label="Voy"');
    expect(out).toContain('ANOTAR');
  });

  it('con las pistas publicadas, su pista', () => {
    world.lanes = [{ eventId: 'E2', playerId: 'p-ana', lane: 4, position: 2, publishedAt: '2026-10-12T20:00:00Z' }];
    expect(text(render(h(NextUpCard, { item: next, today: '2026-10-08', rsvp: null, anotar: null })))).toContain('Martes · 7:30 pm · Pista 4');
  });

  it('ya confirmado: «Vas»; sin evento creado no hay «Voy»; un torneo dice el suyo', () => {
    expect(render(h(NextUpCard, { item: { ...next, going: true }, today: '2026-10-08', rsvp: async () => undefined, anotar: null }))).toContain('aria-pressed="true"');
    expect(render(h(NextUpCard, { item: next, today: '2026-10-08', rsvp: null, anotar: null }))).not.toContain('aria-label="Voy"');
    expect(text(render(h(NextUpCard, { item: { ...next, type: 'torneo', name: 'Copa de octubre' }, today: '2026-10-08', rsvp: null, anotar: null })))).toContain(
      'Tu próximo torneo',
    );
  });

  it('el evento es hoy más tarde: «Hoy juegas»', () => {
    const out = text(render(h(NextUpCard, { item: { ...next, date: TODAY }, today: TODAY, rsvp: null, anotar: null })));
    expect(out).toContain('Hoy juegas');
    expect(out).toContain('Práctica de hoy');
  });
});

describe('cuenta nueva', () => {
  it('«Únete a tu liga» con el código, «Unirme», el QR y «o también»', () => {
    const html = render(h(JoinLeagueCard, { onCreate: () => undefined }));
    const out = text(html);
    expect(out).toContain('Únete a tu liga');
    expect(html).toContain('placeholder="CÓDIGO"');
    expect(out).toContain('Unirme');
    expect(out).toContain('o escanea el QR');
    expect(out).toContain('o también');
    expect(out).toContain('Crear mi liga');
    expect(out).toContain('Anotar un juego suelto');
    expect(html).toContain('href="/juegos-sueltos?nuevo=1"');
    expect(out).toContain('Buscar ligas abiertas');
    expect(html).toContain('href="/ligas"');
  });

  it('sin poder crear ligas no ofrece «Crear mi liga»', () => {
    expect(text(render(h(JoinLeagueCard, { onCreate: null })))).not.toContain('Crear mi liga');
  });
});

describe('Lo que viene', () => {
  const base: CalendarItem = {
    key: 'k',
    kind: 'event',
    date: '2026-10-13',
    lid: 'L1',
    leagueName: 'Liga de los martes',
    sport: 'bowling',
    type: 'practica',
    name: 'Práctica',
    time: '7:30 pm',
    minutes: null,
    eventId: 'E2',
    playerId: 'p-ana',
    going: false,
    href: '/l/L1/e/E2',
    matchId: null,
  };

  it('cada fecha con mes y día, el día de la semana y «Voy» en línea en las prácticas', () => {
    const items = [
      base,
      { ...base, key: 'k2', date: '2026-10-24', type: 'torneo', name: 'Copa de octubre', time: null, eventId: 'E3', href: '/l/L1/e/E3' },
      { ...base, key: 'k3', date: '2026-10-20', going: true, eventId: 'E4' },
      { ...base, key: 'k4', date: '2026-10-27' },
    ];
    const html = render(h(UpNext, { items, today: TODAY, onCalendar: () => undefined }));
    const out = text(html);
    expect(out).toContain('Lo que viene');
    expect(out).toContain('Calendario');
    expect(out).toContain('Martes · 7:30 pm');
    expect(out).toContain('Copa de octubre');
    expect(out).toContain('Sábado');
    expect(html).toContain('aria-label="Voy"');
    expect(html).toContain('aria-label="Vas (toca si ya no vas)"');
    // Solo 3: el resto, en el Calendario.
    expect(out).not.toContain('27 de octubre');
    expect(html).toContain('href="/l/L1/e/E3"');
  });

  it('un torneo al que ya dijiste «Voy»: «Sábado · ya te inscribiste»', () => {
    const copa = { ...base, key: 'k2', date: '2026-10-24', type: 'torneo', name: 'Copa de octubre', time: null, eventId: 'E3', going: true };
    expect(text(render(h(UpNext, { items: [copa], today: TODAY, onCalendar: () => undefined })))).toContain('Copa de octubre Sábado · ya te inscribiste');
    expect(text(render(h(UpNext, { items: [{ ...copa, going: false }], today: TODAY, onCalendar: () => undefined })))).not.toContain('inscribiste');
  });

  it('una práctica que el admin todavía no creó no tiene «Voy» (lleva a la liga)', () => {
    const html = render(h(UpNext, { items: [{ ...base, eventId: null, href: '/l/L1' }], today: TODAY, onCalendar: () => undefined }));
    expect(html).not.toContain('aria-label="Voy"');
    expect(html).toContain('href="/l/L1"');
  });

  it('sin fechas lo dice en una línea', () => {
    expect(text(render(h(UpNext, { items: [], today: TODAY, onCalendar: () => undefined })))).toContain('Nada más en los próximos 30 días.');
  });
});

describe('el encabezado de Hoy', () => {
  it('la fecha, «Hola, Ana» y la campana (lleva a Avisos); «PRO ▾» solo en Pro', () => {
    const now = new Date(2026, 9, 7, 19, 48);
    const lite = render(h(HomeHeader, { now, name: 'Ana' }));
    expect(text(lite)).toContain('Miércoles 7 de octubre');
    expect(text(lite)).toContain('Hola, Ana');
    expect(lite).toContain('href="/avisos"');
    expect(lite).not.toContain('Modo Pro');
    world.pro = true;
    expect(render(h(HomeHeader, { now, name: 'Ana' }))).toContain('aria-label="Modo Pro: cambiar cómo ver la app"');
  });

  it('como el diseño: en el margen de 24 px de la pantalla (sin más) y 10 px arriba', () => {
    const html = render(h(HomeHeader, { now: new Date(2026, 9, 7, 19, 48), name: 'Ana' }));
    expect(html).toMatch(/^<header class="-mt-2\.5 flex items-end justify-between gap-3">/);
    expect(html).not.toContain('px-1');
  });
});

describe('la hoja del modo', () => {
  it('«Elige cómo ver la app»: Lite y Pro en dos tarjetas; a quien organiza, Pro «Para ti» con «Usar Pro» y «Seguir en Lite»', () => {
    world.suggested = true;
    world.members = [{ leagueId: 'L1', role: 'owner' }];
    const html = render(h(ModeSheet, { open: true, onClose: () => undefined }));
    const out = text(html);
    expect(out).toContain('Elige cómo ver la app');
    expect(out).toContain('La misma app, con más o menos detalle. Se guarda en tu cuenta y cambias cuando quieras.');
    expect(out).toContain('Lite Lo esencial Anotar rápido Tu promedio Tus ligas y fechas');
    expect(out).toContain('Para ti Pro Todo el detalle Aprobar juegos Planilla y Excel Estadísticas');
    expect(out).toContain('Organizas Liga de los martes : en Pro tienes la pestaña Organizar.');
    expect(out).toContain('Usar Pro');
    expect(out).toContain('Seguir en Lite');
    expect(html.match(/role="radio" aria-checked="true"/g)).toHaveLength(1);
  });

  it('sin organizar nada: arranca en el modo de ahora, sin «Para ti»', () => {
    const out = text(render(h(ModeSheet, { open: true, onClose: () => undefined })));
    expect(out).not.toContain('Para ti');
    expect(out).not.toContain('Organizas');
    expect(out).toContain('Seguir en Lite');
    expect(out).not.toContain('Usar Pro');
  });
});

describe('«Voy» y «Vas ✓» del Calendario', () => {
  const row: CalendarItem = {
    key: 'k',
    kind: 'event',
    date: '2026-10-13',
    lid: 'L1',
    leagueName: 'Liga de los martes',
    sport: 'bowling',
    type: 'practica',
    name: 'Práctica',
    time: '7:30 pm',
    minutes: null,
    eventId: 'E2',
    playerId: 'p-ana',
    going: true,
    href: '/l/L1/e/E2',
    matchId: null,
  };

  it('como en «Lo que viene»: «Vas ✓» en gris (el verde es solo para lo que sube) y «Voy» en el acento suave', () => {
    const going = render(h(AgendaRow, { item: row, onGoing: async () => undefined }));
    expect(going).toContain('aria-label="Vas (toca si ya no vas)"');
    expect(going).toContain('bg-surface-2 text-fg-2');
    expect(going).not.toContain('bg-ok-soft text-ok');
    const voy = render(h(AgendaRow, { item: { ...row, going: false }, onGoing: async () => undefined }));
    expect(voy).toContain('bg-accent-soft text-accent');
  });
});

describe('lo que se juega en la Liga (LiveActions) dice lo mismo que Hoy', () => {
  const approved: Submission = { id: 's1', playerId: 'p-ana', eventId: 'E1', scores: [187, 210], scanned: null, photoId: null, status: 'aprobado', note: null, createdAt: at(1) };

  it('el juego a medias: «Seguir mi juego 3» (abre la hoja ahí); nada de «aprobó» mientras falta uno', () => {
    const html = render(h(LiveActions, { feed: feed({ mySubs: [approved] }), event: practice, today: TODAY }));
    expect(text(html)).toContain('Seguir mi juego 3');
    expect(html).toContain('href="/l/L1/e/E1?anotar=1"');
    expect(text(html)).not.toContain('aprobó');
    expect(text(html)).not.toContain('ya están en la tabla');
  });

  it('quien organiza y juega: en Lite su botón; la planilla («Anotar juegos») en Pro', () => {
    const lite = text(render(h(LiveActions, { feed: feed({ isAdmin: true }), event: practice, today: TODAY })));
    expect(lite).toContain('Seguir mi juego 3');
    expect(lite).not.toContain('Anotar juegos');
    world.pro = true;
    const html = render(h(LiveActions, { feed: feed({ isAdmin: true }), event: practice, today: TODAY }));
    expect(text(html)).toContain('Anotar juegos');
    expect(html).toContain('href="/l/L1/e/E1?tab=juegos"');
  });

  it('quien organiza y no juega: la planilla es su botón (también en Lite)', () => {
    const html = render(h(LiveActions, { feed: feed({ isAdmin: true, playerId: null }), event: practice, today: TODAY }));
    expect(text(html)).toContain('Anotar juegos de todos');
    expect(html).toContain('href="/l/L1/e/E1?tab=juegos"');
  });

  it('todo en la tabla: «Tus juegos ya están en la tabla» y «Ver mis juegos»', () => {
    store.clear();
    world.entries = [entry('p-ana', [187, 210, 199])];
    const out = text(render(h(LiveActions, { feed: feed(), event: practice, today: TODAY })));
    expect(out).toContain('Tus juegos ya están en la tabla');
    expect(out).toContain('Ver mis juegos');
  });
});

describe('Pro: Por hacer, En vivo y Esta semana', () => {
  const sub = (playerId: string, photoId: string | null): Submission => ({
    id: `s-${playerId}`,
    playerId,
    eventId: 'E1',
    scores: [180],
    scanned: null,
    photoId,
    status: 'pendiente',
    note: null,
    createdAt: at(1),
  });

  it('lo pendiente de cada liga que organizas: aprobar (sin los tuyos), buzón y torneos sin equipos', () => {
    const copa: BowlingEvent = { ...practice, id: 'T1', type: 'torneo', name: 'Copa de octubre', date: '2026-10-24', teamSize: 4 };
    const feeds = [
      feed({ isAdmin: true, pending: [sub('p-sofia', 'f'), sub('p-carmen', 'f'), sub('p-ana', null)], suggestions: [{ id: 'n1', text: 'Más café', read: false }], events: [practice, copa] }),
      feed({ lid: 'L2', isAdmin: false, pending: [sub('p-x', 'f')] }),
    ];
    const todo = toDoOf(feeds, TODAY);
    expect(todo).toHaveLength(1);
    expect(todo[0]).toMatchObject({ lid: 'L1', approvals: 2, suggestions: 1, teams: [{ id: 'T1', name: 'Copa de octubre', date: '2026-10-24' }] });
    world.players = [...world.players, { id: 'p-carmen', name: 'Carmen Díaz', averageOverride: null }];
    const html = render(h(ToDoSection, { todo, leagues: [league] }));
    const out = text(html);
    expect(out).toContain('Por hacer');
    expect(out).toContain('Organizar');
    expect(out).toContain('Aprobar juegos');
    expect(out).toContain('Sofía y Carmen · con foto');
    expect(out).toContain('Copa de octubre');
    expect(out).toContain('Faltan los equipos · sáb 24 oct');
    expect(out).toContain('Buzón de la liga');
    expect(out).toContain('1 sugerencia nueva');
    expect(html).toContain('href="/l/L1/admin?tab=aprobar"');
    expect(html).toContain('href="/l/L1/admin?tab=buzon"');
    // Nada pendiente: no sale.
    expect(text(render(h(ToDoSection, { todo: [], leagues: [league] })))).not.toContain('Por hacer');
  });

  it('«En vivo»: los 3 primeros y tú, con tus juegos y lo que llevas del que va a medias', () => {
    world.entries = [...world.entries, entry('p-jose', [150, 150, 150])];
    world.players = [...world.players, { id: 'p-jose', name: 'José Ramírez', averageOverride: null }];
    const out = text(render(h(LiveSectionPro, { game: game(), today: TODAY })));
    expect(out).toContain('En vivo');
    expect(out).toContain('Ver toda');
    expect(out).toContain('1 PG Pedro Gómez 212 · 245 · 201 658');
    expect(out).toContain('Ana Pérez Tú 187 · 210 · 48… 397');
    expect(out).not.toContain('José');
  });

  it('«Esta semana · octubre»: lunes a domingo, hoy marcado, y abre el calendario', () => {
    const out = render(h(WeekStrip, { feeds: [feed()], leagues: [league], matches: [], today: TODAY, onOpen: () => undefined }));
    expect(text(out)).toContain('Esta semana · octubre');
    expect(text(out)).toContain('L 5');
    expect(text(out)).toContain('D 11');
    expect(out).toContain('aria-label="Abrir el calendario de la semana"');
    expect(out).toMatch(/bg-accent text-accent-fg[^>]*>7</);
  });
});

describe('el aviso de Hoy', () => {
  it('juegos por aprobar en las ligas que organizas (sin los tuyos); el id cambia si llegan más', () => {
    const s = (playerId: string) => ({ playerId }) as Submission;
    const n = pendingNotice([feed({ isAdmin: true, pending: [s('p-sofia'), s('p-carmen'), s('p-ana')] })], [league]);
    expect(n).toMatchObject({ kind: 'admin', title: '2 envíos por aprobar', text: 'Liga de los martes', action: { label: 'Ver', to: '/l/L1/admin?tab=aprobar' } });
    expect(n!.id).toBe('pendientes:L1:2');
    expect(pendingNotice([feed({ isAdmin: true, pending: [s('p-ana')] })], [league])).toBeNull();
    expect(pendingNotice([feed({ pending: [s('p-sofia')] })], [league])).toBeNull();
  });
});

describe('Siguiendo', () => {
  it('sale solo si quienes sigues ya jugaron (con «Buscar personas»); vacío, nada', () => {
    expect(text(render(h(FollowingSlot, { sport: null })))).not.toContain('Siguiendo');
    world.following = [
      {
        key: 'j:s1',
        kind: 'solo',
        id: 's1',
        playerId: null,
        userId: 'u2',
        userName: 'Pedro Gómez',
        leagueId: null,
        leagueName: null,
        sport: 'bowling',
        eventId: null,
        eventName: 'Juego suelto',
        eventType: null,
        eventDate: TODAY,
        at: '2026-10-07T16:00:00.000Z',
        url: null,
        likes: 1,
        likedByMe: false,
        detail: { title: 'Juego suelto', venue: 'Bolera Norte', scores: [210], series: 210, high: 210 },
      },
    ];
    const html = render(h(FollowingSlot, { sport: null }));
    expect(text(html)).toContain('Siguiendo');
    expect(text(html)).toContain('Pedro Gómez');
    expect(html).toContain('href="/buscar"');
  });
});
