/**
 * Ligas (`/ligas`, rediseño «Calma y foco») dibujada sin navegador: el título con «Crear o unirme» y el resumen
 * («1 liga · 1 en vivo · Próximo: hoy 7:30 pm»), «Tus ligas» en tarjetas del color de su deporte (de qué es, lo
 * próximo, «EN VIVO», jugadores, tu lugar en el boliche y, en Pro, tu papel), «Tus torneos» (tarjetas que se deslizan),
 * «Tus equipos» en su color, «Buscar ligas abiertas» y, en `?ver=abiertas`, las públicas para unirse con la agenda.
 * Lite y Pro; los chips de deporte solo con más de uno.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarItem } from '../lib/calendar';
import type { PublicLeague } from '../lib/data/leagues';
import type { MySquad } from '../lib/data/squads';
import type { League } from '../lib/types';

const TODAY = '2026-10-07';

const world = vi.hoisted(() => ({
  signedIn: true,
  pro: false,
  leagues: [] as League[],
  roles: {} as Record<string, string>,
  upcoming: [] as CalendarItem[],
  liveLids: [] as string[],
  feeds: [] as { lid: string; playerId?: string | null; isAdmin?: boolean; pending?: unknown[]; events: { id: string; playerCount: number }[] }[],
  publics: [] as PublicLeague[],
  players: 6,
  squads: [] as MySquad[],
  streams: [] as { leagueId: string }[],
  standing: null as { average: number | null; pos: number | null; of: number; missing: number } | null,
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
vi.mock('../lib/data/squads', async (orig) => ({
  ...(await orig<typeof import('../lib/data/squads')>()),
  useMySquads: () => ({ data: world.squads, loading: false, error: null }),
}));
vi.mock('../lib/data/streams', async (orig) => ({
  ...(await orig<typeof import('../lib/data/streams')>()),
  useLiveNow: () => ({ data: world.streams, loading: false, error: null }),
}));
vi.mock('../components/home/HomeStats', () => ({
  useMyStanding: (lid: string | null) => ({ standing: lid ? world.standing : null, loading: false }),
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
  world.squads = [];
  world.streams = [];
  world.standing = null;
});

/** El HTML de la tarjeta (article) que tiene `name`. */
const cardOf = (html: string, name: string) => html.split('<article').find((a) => a.includes(`>${name}</a>`)) ?? '';

describe('Ligas (Lite)', () => {
  it('como el diseño: «Ligas», «Crear o unirme», el resumen, Tus ligas, Tus torneos y Buscar ligas abiertas', () => {
    const html = render();
    const t = text(html);
    expect(html).toContain('class="text-title"');
    const order = [
      'Ligas',
      'Crear o unirme',
      '1 liga · 1 torneo · 1 en vivo · Próximo: hoy 7:30 pm',
      'Tus ligas',
      'Liga de los martes',
      'Boliche · Pública',
      'Hoy, 7:30 pm',
      'Práctica · Bolera Sambil',
      '6 jugadores',
      'Tus torneos',
      'Copa de octubre',
      'Sábado 24 oct · 6 inscritos',
      'Buscar ligas abiertas',
      'Boliche y otros deportes',
    ];
    const at = order.map((s) => t.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // Un solo link por tarjeta: el nombre (que cubre toda la tarjeta).
    const card = cardOf(html, 'Liga de los martes');
    expect(card.match(/<a /g)).toHaveLength(1);
    expect(card).toContain('href="/l/l1"');
    expect(html).toContain('href="/l/l1/e/copa"');
    expect(html).toContain('href="/ligas?ver=abiertas"');
    // Lo que se fue a Hoy o a la hoja: ni Próximos, ni las públicas, ni el código aquí; el papel solo en Pro.
    for (const gone of ['Próximos', 'Públicas para unirte', '¿Te invitaron?', 'Mis ligas', 'Solo boliche', 'Dueño']) expect(t).not.toContain(gone);
    // Un solo deporte: sin chips.
    expect(t).not.toContain('Todos');
  });

  it('la tarjeta de una liga: el color de su deporte, de qué es y quién entra, el logo grande y lo próximo de hoy resaltado', () => {
    world.leagues = [league('l1', 'Liga de los martes'), league('l2', 'Pádel del club', { sport: 'padel', visibility: 'private', venue: 'Club Este' })];
    world.roles = { l1: 'owner', l2: 'member' };
    world.upcoming = [item({ lid: 'l1', eventId: 'l1-hoy' }), item({ lid: 'l2', sport: 'padel', type: 'americano', name: 'Americano', eventId: 'am', date: '2026-10-08', time: '8:00 pm' })];
    const html = render();
    const padel = cardOf(html, 'Pádel del club');
    expect(padel).toContain('mm-tint-padel');
    expect(text(padel)).toContain('Pádel · Privada');
    expect(text(padel)).toContain('Próximo: Mañana, 8:00 pm');
    expect(text(padel)).toContain('Americano · Club Este');
    // La franja suave del deporte arriba y el logo de 56 px (sin logo: el ícono del deporte en su color lleno).
    expect(padel).toContain('bg-gradient-to-b from-accent-soft');
    expect(padel).toMatch(/size-14 rounded-\[18px\][^"]*"|rounded-\[18px\][^"]*size-14/);
    expect(padel).toContain('bg-accent text-accent-fg');
    // Lo de hoy se resalta (acento suave); lo de mañana, en gris.
    expect(cardOf(html, 'Liga de los martes')).toMatch(/rounded-2xl[^"]*bg-accent-soft/);
    expect(padel).toMatch(/rounded-2xl[^"]*bg-surface-2/);
    // Esports: el juego en vez de «Esports».
    world.leagues = [league('l3', 'Liga Radiante', { sport: 'esports', game: 'valorant' })];
    expect(text(render())).toContain('VALORANT · Pública');
  });

  it('«EN VIVO» en rojo si se está jugando (o si la liga transmite), con su punto que late', () => {
    const html = render();
    const card = cardOf(html, 'Liga de los martes');
    expect(text(card)).toContain('EN VIVO');
    expect(card).toContain('bg-danger');
    expect(card).toContain('live-dot');
    expect(card).toContain('ring-danger');
    // Sin juego ni transmisión: nada.
    world.liveLids = [];
    expect(text(cardOf(render(), 'Liga de los martes'))).not.toContain('EN VIVO');
    // Con una transmisión activa de la liga.
    world.streams = [{ leagueId: 'l1' }];
    const streaming = render();
    expect(text(cardOf(streaming, 'Liga de los martes'))).toContain('EN VIVO');
    expect(text(streaming)).toContain('1 liga · 1 torneo · 1 en vivo');
  });

  it('el resumen de arriba dice solo lo que hay', () => {
    world.leagues = [league('l1', 'Liga de los martes'), league('l2', 'Pádel Naco', { sport: 'padel' }), league('l3', 'Liga del jueves')];
    world.upcoming = [item({ lid: 'l2', sport: 'padel', eventId: 'x', date: '2026-10-09', time: '6:00 pm' })];
    world.liveLids = [];
    expect(text(render())).toContain(' 3 ligas · Próximo: viernes 6:00 pm ');
    world.liveLids = ['l1'];
    expect(text(render())).toContain(' 3 ligas · 1 en vivo · Próximo: viernes 6:00 pm ');
    world.upcoming = [];
    world.liveLids = [];
    const t = text(render());
    expect(t).toContain(' 3 ligas ');
    expect(t).not.toContain('Próximo:');
    expect(t).not.toContain('en vivo');
  });

  it('cada torneo dice su deporte (con el trofeo) e «Inscrito» si ya te inscribiste', () => {
    world.upcoming = [
      item({ lid: 'l1', eventId: 'l1-hoy' }),
      item({ lid: 'l1', type: 'torneo', name: 'Copa de octubre', date: '2026-10-24', eventId: 'copa', time: null, minutes: null, going: true }),
    ];
    const html = render();
    const copa = cardOf(html, 'Copa de octubre');
    expect(copa).toContain('lucide-trophy');
    expect(text(copa)).toMatch(/boliche/i);
    expect(text(copa)).toContain('Inscrito');
    expect(text(copa)).not.toContain('ya te inscribiste');
    // Uno solo: todo el ancho (sin carrusel).
    expect(html).not.toContain('snap-x');
  });

  it('con varios torneos, se deslizan de lado (y en dos columnas desde 640 px)', () => {
    world.upcoming = [
      item({ lid: 'l1', eventId: 'l1-hoy' }),
      item({ lid: 'l1', type: 'torneo', name: 'Copa de octubre', date: '2026-10-24', eventId: 'copa', time: null, minutes: null }),
      item({ lid: 'l1', type: 'torneo', name: 'Copa de noviembre', date: '2026-11-07', eventId: 'copa2', time: null, minutes: null }),
    ];
    const html = render();
    expect(html).toMatch(/<ul role="list" class="[^"]*snap-x snap-mandatory[^"]*sm:grid-cols-2/);
    expect(html.match(/snap-start/g)).toHaveLength(2);
    // El torneo que se está jugando: «EN VIVO».
    world.liveLids = [];
    world.upcoming = [item({ lid: 'l1', type: 'torneo', name: 'Copa de hoy', eventId: 'l1-hoy' })];
    world.liveLids = ['l1'];
    expect(text(cardOf(render(), 'Copa de hoy'))).toContain('EN VIVO');
  });

  it('arriba a la derecha, después de «Crear o unirme», la lupa (buscar personas y ligas)', () => {
    const html = render();
    const header = /<header[^>]*>(.*?)<\/header>/.exec(html)![1];
    expect(header).toContain('aria-label="Buscar personas y ligas"');
    expect(header.indexOf('Crear o unirme')).toBeLessThan(header.indexOf('href="/buscar"'));
    // En un teléfono angosto el «+» se va para que quepan los dos.
    expect(header).toContain('max-[390px]:hidden');
  });

  it('sin torneos no sale «Tus torneos»; si no juega hoy, cuándo es lo próximo; sin calendario, su horario', () => {
    world.upcoming = [item({ lid: 'l1', date: '2026-10-13', eventId: 'p2' })];
    world.liveLids = [];
    const t = text(render());
    expect(t).not.toContain('Tus torneos');
    expect(t).toContain('Próximo: Martes, 7:30 pm Práctica · Bolera Sambil 6 jugadores');
    world.upcoming = [];
    expect(text(render())).toContain('Juegan: Martes · 7:30 pm Según el horario · Bolera Sambil');
  });

  it('boliche: tu lugar en la tabla y tu promedio (si eres jugador de la liga)', () => {
    world.feeds = [{ lid: 'l1', playerId: 'p1', events: [{ id: 'copa', playerCount: 6 }] }];
    world.standing = { average: 195, pos: 2, of: 6, missing: 0 };
    expect(text(cardOf(render(), 'Liga de los martes'))).toContain('6 jugadores 2.º de 6 Promedio 195');
    // Sin jugador en la liga: no se lee nada.
    world.feeds = [{ lid: 'l1', playerId: null, events: [] }];
    expect(text(render())).not.toContain('Promedio');
  });

  it('cuenta nueva: unirse o crear, y buscar ligas abiertas', () => {
    world.leagues = [];
    const t = text(render());
    expect(t).toContain('Todavía no estás en ninguna liga');
    expect(t).toContain('Crear o unirme');
    expect(t).toContain('Buscar ligas abiertas');
    expect(t).not.toContain('Tus ligas');
    expect(t).not.toContain('Próximo:');
  });

  it('con más de un deporte, los chips (Todos y los suyos), que filtran las tarjetas y el resumen', () => {
    world.leagues = [league('l1', 'Liga de los martes'), league('l2', 'Pádel Naco', { sport: 'padel' })];
    const t = text(render());
    expect(t).toContain('Todos');
    expect(t).toContain('Pádel');
    expect(t).toContain('Pádel Naco');
    expect(t).toContain('De todos los deportes');
    expect(t).toContain('2 ligas');
    // Con el chip de pádel, solo lo de pádel.
    const padel = text(render('/ligas?deporte=padel'));
    expect(padel).toContain('Pádel Naco');
    expect(padel).not.toContain('Liga de los martes');
    expect(padel).toContain(' 1 liga ');
    expect(padel).not.toContain('Copa de octubre');
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

describe('Ligas: equipos', () => {
  const squad = (id: string, name: string, extra: Partial<MySquad> = {}): MySquad => ({
    id,
    sport: 'football',
    name,
    tag: 'TGR',
    logo: null,
    color: null,
    city: null,
    recruiting: false,
    members: 12,
    followers: 0,
    role: 'member',
    ...extra,
  });

  it('sin equipos: la fila «Equipos» (a /equipos) antes de «Buscar ligas abiertas»', () => {
    const html = render();
    const t = text(html);
    expect(t).toContain('Equipos Crea tu equipo competitivo, con o sin liga');
    expect(html).toContain('href="/equipos"');
    expect(t.indexOf('Tus torneos')).toBeLessThan(t.indexOf('Crea tu equipo'));
    expect(t.indexOf('Crea tu equipo')).toBeLessThan(t.indexOf('Buscar ligas abiertas'));
    expect(t).not.toContain('Tus equipos');
  });

  it('con equipos: «Tus equipos» (hasta 3, cada uno en su color, con mi papel) y «Ver todos»', () => {
    world.squads = [
      squad('s1', 'Los Tigres', { role: 'captain', color: '#dc2626' }),
      squad('s2', 'Halcones', { sport: 'basketball', members: 1 }),
      squad('s3', 'Leones'),
      squad('s4', 'Pumas'),
    ];
    const html = render();
    const t = text(html);
    expect(t).toContain('Tus equipos');
    expect(t).toContain('Los Tigres [TGR] Fútbol · 12 miembros · Capitán');
    expect(t).toContain('Baloncesto · 1 miembro');
    expect(t).not.toContain('Pumas');
    expect(html).toContain('href="/equipos/s1"');
    expect(html).toMatch(/href="\/equipos"[^>]*>Ver todos/);
    expect(t).not.toContain('Crea tu equipo');
    expect(t.indexOf('Tus ligas')).toBeLessThan(t.indexOf('Tus equipos'));
    // En el color del equipo (o el de su deporte): la tarjeta en su acento suave.
    expect(html).toContain('mm-squad-dc2626');
    expect(html).toContain('mm-tint-basketball');
    expect(html.match(/rounded-2xl bg-accent-soft/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('el filtro de deporte también filtra los equipos', () => {
    world.leagues = [league('l1', 'Liga de los martes'), league('l2', 'Pádel Naco', { sport: 'padel' })];
    world.squads = [squad('s1', 'Los Tigres')];
    const t = text(render('/ligas?deporte=padel'));
    expect(t).not.toContain('Los Tigres');
    expect(t).not.toContain('Crea tu equipo');
  });
});

describe('Ligas (Pro)', () => {
  it('el mismo orden, más denso (dos columnas desde 640 px), con mi papel', () => {
    world.pro = true;
    const html = render();
    const t = text(html);
    expect(html).toContain('class="text-title-pro"');
    expect(text(cardOf(html, 'Liga de los martes'))).toContain('6 jugadores Dueño');
    expect(html).toMatch(/class="stagger grid gap-3 sm:grid-cols-2"/);
    // Logo de 48 y menos relleno.
    expect(cardOf(html, 'Liga de los martes')).toContain(' p-4');
    expect(t).toContain('Sábado 24 oct · 6 inscritos');
    expect(t).toContain('Buscar ligas abiertas');
    // Siendo miembro, sin papel.
    world.roles = { l1: 'member' };
    expect(text(render())).not.toContain('Miembro');
  });

  it('quien organiza ve cuánto espera por aprobar', () => {
    world.pro = true;
    world.feeds = [{ lid: 'l1', playerId: null, isAdmin: true, pending: [{}, {}], events: [] }];
    expect(text(cardOf(render(), 'Liga de los martes'))).toContain('Dueño 2 por aprobar');
    world.pro = false;
    expect(text(render())).not.toContain('por aprobar');
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
