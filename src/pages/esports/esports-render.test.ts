/**
 * Las pantallas de Esports de la pista 4 dibujadas sin navegador (renderToString) con datos de mentira: Esports sin
 * cuenta y con lo tuyo (y «¿De qué juego?»), la página del juego en Lite y Pro (torneos, equipos, un duelo, crear equipo
 * con y sin ID), el equipo como capitán (con «Invitar»), como miembro y sin ser miembro, unirse con el código, Mi ID de
 * juego (sin cuenta, la lista) y la hoja del ID en cada paso (escribirlo con el rango, «¿Eres tú?», conectado a otra
 * cuenta, lo que hay, el modo local) y el rango de Rocket League. Los avisos (NoticeSlot) se proponen en efectos: no
 * salen aquí; su lógica está en logic.test.ts y en src/components/home/esportsRow.test.ts.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Live } from '../../lib/data/client';
import type { EsportsEntry, EsportsTeam, EsportsTeamMember, EsportsTournament, HubData, MyEntry, TeamRole } from '../../lib/data/esports';
import type { GameIdRecord, IdMove, ProvidersStatus } from '../../lib/data/esportsIds';
import { defaultSettings } from '../../sports/esports';
import { FeedbackProvider } from '../../components/feedback';

const NOW = Date.now();
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const ok = <T,>(data: T): Live<T> => ({ data, loading: false, error: null });

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u1' } as { uid: string } | null, loading: false },
  pro: false,
  hub: { data: { tournaments: [], teams: [] }, loading: false, error: null } as Live<HubData>,
  myTeams: { data: [], loading: false, error: null } as Live<(EsportsTeam & { myRole: TeamRole })[]>,
  myEntries: { data: [], loading: false, error: null } as Live<MyEntry[]>,
  team: { data: null, loading: false, error: null } as Live<{ team: EsportsTeam; members: EsportsTeamMember[] } | null>,
  teamEntries: { data: [], loading: false, error: null } as Live<EsportsEntry[]>,
  tournament: { data: null, loading: false, error: null } as Live<EsportsTournament | null>,
  code: { data: 'K7M2PQ9X', loading: false, error: null } as Live<string | null>,
  ids: { data: [], loading: false, error: null } as Live<GameIdRecord[]>,
  idsFor: { data: [], loading: false, error: null } as Live<GameIdRecord[]>,
  moves: { data: [], loading: false, error: null } as Live<IdMove[]>,
  providers: { data: { lookup: [], link: { steam: true, epic: false, riot: false } }, loading: false, error: null } as Live<ProvidersStatus>,
}));

vi.mock('../../lib/auth', async (orig) => ({ ...(await orig<typeof import('../../lib/auth')>()), useAuth: () => ({ ...state.auth, profile: null, isSuper: false, recovering: false }) }));
vi.mock('../../components/Shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('../../lib/useMode', () => ({
  useIsPro: () => state.pro,
  useMode: () => ({ mode: state.pro ? 'pro' : 'lite', isPro: state.pro, setMode: async () => 'saved', suggestedPro: false }),
}));
vi.mock('../../lib/data/esports', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/esports')>()),
  useEsportsHub: () => state.hub,
  useMyEsportsTeams: (uid: string | null) => (uid ? state.myTeams : ok([])),
  useMyEsportsEntries: (uid: string | null) => (uid ? state.myEntries : ok([])),
  useEsportsTeam: () => state.team,
  useTeamEntries: () => state.teamEntries,
  useEsportsTournament: () => state.tournament,
  useTeamInviteCode: () => state.code,
}));
vi.mock('../../lib/data/esportsIds', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/esportsIds')>()),
  useMyGameIds: (uid: string | null) => (uid ? state.ids : ok([])),
  useGameIdsFor: () => state.idsFor,
  useMyIdMoves: (uid: string | null) => (uid ? state.moves : ok([])),
  useProviders: () => state.providers,
}));

const { default: EsportsHomePage } = await import('./EsportsHomePage');
const { default: GameHubPage } = await import('./GameHubPage');
const { default: TeamPage } = await import('./TeamPage');
const { default: GameIdsPage } = await import('./GameIdsPage');
const { JoinTeamView } = await import('./JoinTeamPage');
const { GameIdSheet } = await import('./ids/GameIdSheet');

const page = (url: string) =>
  renderToString(
    h(
      MemoryRouter,
      { initialEntries: [url] },
      h(
        FeedbackProvider,
        null,
        h(
          Routes,
          null,
          h(Route, { path: '/esports', element: h(EsportsHomePage) }),
          h(Route, { path: '/esports/mi-id', element: h(GameIdsPage) }),
          h(Route, { path: '/esports/equipo/:teamId', element: h(TeamPage) }),
          h(Route, { path: '/esports/:game', element: h(GameHubPage) }),
        ),
      ),
    ),
  );
const bare = (node: ReactNode) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, node)));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const team = (over: Partial<EsportsTeam> = {}): EsportsTeam => ({
  id: 't1',
  game: 'valorant',
  name: 'Los Tigres',
  tag: 'TGR',
  description: 'Jugamos los sábados',
  logoPath: null,
  captainId: 'u1',
  memberCount: 3,
  createdAt: null,
  updatedAt: null,
  ...over,
});
const member = (userId: string, role: TeamRole, displayName: string): EsportsTeamMember => ({ teamId: 't1', userId, role, displayName, joinedAt: iso(NOW) });
const MEMBERS = [member('u2', 'member', 'Bruno'), member('u1', 'captain', 'Ana'), member('u3', 'sub', 'Carla')];
const rec = (over: Partial<GameIdRecord> = {}): GameIdRecord => ({
  userId: 'u1',
  game: 'valorant',
  platform: '',
  region: 'latam',
  idDisplay: 'Ana#LAN',
  status: 'pendiente',
  ownership: 'declarado',
  ranks: { main: { tier: 'gold', div: 2 } },
  rankSource: 'declarado',
  verifiedAt: null,
  confirmedAt: null,
  updatedAt: null,
  ...over,
});
/** Comprobado: por la búsqueda de Riot o con la cuenta conectada. */
const checked = (ownership: 'busqueda' | 'login', over: Partial<GameIdRecord> = {}) => rec({ status: 'confirmado', ownership, confirmedAt: iso(NOW), ...over });
const hubTour = (eventId: string, name: string, status: EsportsTournament['status'], over: Record<string, unknown> = {}) => ({
  eventId,
  leagueId: `l-${eventId}`,
  name,
  game: 'valorant' as const,
  mode: '5v5' as const,
  entryType: 'teams' as const,
  format: 'double_elim' as const,
  status,
  startsAt: iso(NOW + 48 * H),
  registrationOpensAt: null,
  registrationClosesAt: iso(NOW + 24 * H),
  checkinMinutes: null,
  maxEntries: 16,
  prizeText: '',
  leagueName: name,
  visibility: 'public' as const,
  logoPath: null,
  approved: 6,
  pending: 1,
  ...over,
});
const PROVIDERS: ProvidersStatus = { lookup: ['valorant', 'lol'], link: { steam: true, epic: true, riot: true } };
/** El modo local: nada encendido. */
const ALL_OFF: ProvidersStatus = { lookup: [], link: { steam: false, epic: false, riot: false } };

beforeEach(() => {
  state.auth = { user: { uid: 'u1' }, loading: false };
  state.pro = false;
  state.hub = ok({ tournaments: [], teams: [] });
  state.myTeams = ok([]);
  state.myEntries = ok([]);
  state.team = ok(null);
  state.teamEntries = ok([]);
  state.tournament = ok(null);
  state.code = ok('K7M2PQ9X');
  state.ids = ok([]);
  state.idsFor = ok([]);
  state.moves = ok([]);
  state.providers = ok({ lookup: [], link: { steam: true, epic: false, riot: false } });
});

describe('Esports (/esports)', () => {
  it('sin cuenta: los 15 juegos en tres secciones y «Mi ID de juego», sin «Mis…» ni botón principal', () => {
    state.auth = { user: null, loading: false };
    const out = page('/esports');
    const t = text(out);
    expect(t).toContain('Esports');
    expect(t).toContain('Torneos y equipos por juego');
    for (const s of ['Por equipos', '1 contra 1', 'Battle royale', 'Mi ID de juego']) expect(t).toContain(s);
    for (const g of ['VALORANT', 'Rocket League', 'EA SPORTS FC', 'Clash Royale', 'Free Fire', 'PUBG Mobile']) expect(t).toContain(g);
    expect(t).toContain('5 contra 5 · mapas a 13 rondas');
    expect(out).toContain('href="/esports/valorant"');
    expect(out).toContain('href="/esports/pubg_mobile"');
    expect(out).toContain('href="/esports/mi-id"');
    expect(out).toContain('href="/ligas"');
    expect(t).not.toContain('Mis equipos');
    expect(t).not.toContain('Mis torneos');
    expect(t).toContain('Para unirte a equipos e inscribirte');
    // Es un índice: ningún botón principal.
    expect(out).not.toContain('bg-accent text-accent-fg');
  });

  it('con cuenta: «Mis torneos» (fase) y «Mis equipos» (juego, miembros y rol)', () => {
    state.myTeams = ok([{ ...team({ memberCount: 5 }), myRole: 'captain' }]);
    state.myEntries = ok([
      {
        entryId: 'e1',
        eventId: 'ev1',
        leagueId: 'l1',
        tournament: 'Copa Caribe',
        game: 'valorant',
        mode: '5v5',
        entryStatus: 'pending',
        tournamentStatus: 'registration',
        startsAt: iso(NOW + 48 * H),
        entryName: 'Los Tigres',
        role: 'captain',
        kind: 'team',
      },
    ]);
    state.ids = ok([rec(), rec({ game: 'cs2', idDisplay: '22202' })]);
    const out = page('/esports');
    const t = text(out);
    expect(t).toContain('Mis torneos');
    expect(t).toContain('Copa Caribe');
    expect(t).toContain('Los Tigres · Por aprobar');
    expect(t).toContain('Inscripción abierta');
    expect(out).toContain('href="/l/l1"');
    expect(t).toContain('Mis equipos');
    expect(t).toContain('Los Tigres [TGR]');
    expect(t).toContain('VALORANT · 5 miembros · Capitán');
    expect(out).toContain('href="/esports/equipo/t1"');
    expect(t).toContain('VALORANT · Counter-Strike 2');
  });
});

describe('la página del juego (/esports/:game)', () => {
  it('Lite sin equipo: «Crear equipo» es el botón principal, «Torneos | Equipos», las secciones de torneos y «¿Organizas?»', () => {
    state.hub = ok({
      tournaments: [
        hubTour('a', 'Copa Abierta', 'registration'),
        hubTour('b', 'Liga Privada', 'live', { visibility: 'private' }),
        hubTour('c', 'Copa Pasada', 'finished', { startsAt: iso(NOW - 72 * H), registrationClosesAt: iso(NOW - 80 * H) }),
      ],
      teams: [{ id: 't9', name: 'Fénix', tag: 'FNX', logoPath: null, memberCount: 5 }],
    });
    const out = page('/esports/valorant');
    const t = text(out);
    expect(t).toContain('VALORANT');
    expect(t).toContain('5 contra 5 · Riot ID');
    expect(t).toContain('Torneos abiertos');
    expect(t).toContain('Equipos');
    expect(out).toContain('href="/esports"');
    expect(t.match(/Crear equipo/g)).toHaveLength(1);
    expect(t).not.toMatch(/Crear torneo\s*Crear equipo/);
    expect(out).toContain('role="radiogroup" aria-label="Qué ver"');
    for (const s of ['Inscripción abierta', 'En curso', 'Terminados', 'Copa Abierta', 'Liga Privada', 'Copa Pasada']) expect(t).toContain(s);
    expect(t).toContain('5 contra 5 · Doble eliminación · Solo equipos · 6/16');
    expect(out).toContain('aria-label="Liga Privada (privado)"');
    expect(out).toContain('href="/l/l-a"');
    expect(t).toContain('¿Organizas? Crear torneo');
    expect(out).toContain('href="/esports/valorant/nuevo-torneo"');
    // La vista de equipos no se ve hasta elegirla.
    expect(t).not.toContain('Fénix [FNX]');
  });

  it('Pro: «Crear torneo» principal y «Crear equipo» en gris; sin «¿Organizas?»', () => {
    state.pro = true;
    state.myTeams = ok([{ ...team(), myRole: 'captain' }]);
    const t = text(page('/esports/valorant'));
    expect(t).toMatch(/Crear torneo\s*Crear equipo/);
    expect(t).not.toContain('¿Organizas?');
    expect(t).toContain('Todavía no hay torneos de VALORANT');
  });

  it('?ver=equipos: el buscador, «Tus equipos» primero y los demás', () => {
    state.myTeams = ok([{ ...team(), myRole: 'captain' }]);
    state.hub = ok({
      tournaments: [],
      teams: [
        { id: 't1', name: 'Los Tigres', tag: 'TGR', logoPath: null, memberCount: 3 },
        { id: 't9', name: 'Fénix', tag: 'FNX', logoPath: null, memberCount: 5 },
      ],
    });
    const out = page('/esports/valorant?ver=equipos');
    const t = text(out);
    expect(out).toContain('placeholder="Buscar por nombre o tag"');
    expect(t).toContain('Tus equipos');
    expect(t).toContain('Otros equipos');
    expect(t.indexOf('Los Tigres [TGR]')).toBeLessThan(t.indexOf('Fénix [FNX]'));
    expect(t.match(/Los Tigres \[TGR\]/g)).toHaveLength(1);
    expect(t).toContain('5 miembros');
    // Ya tiene equipo de este juego: en Lite no hay botón principal.
    expect(t).not.toContain('Crear equipo');
  });

  it('un duelo (EA SPORTS FC): sin equipos ni selector, «En curso» en lugar de «Equipos»', () => {
    const out = page('/esports/ea_fc');
    const t = text(out);
    expect(t).toContain('EA SPORTS FC');
    expect(t).toContain('1 contra 1 · EA ID');
    expect(out).not.toContain('aria-label="Qué ver"');
    expect(t).not.toContain('Crear equipo');
    expect(t).toContain('En curso');
    // Sin torneos, el cartel trae «Crear torneo» y no se repite «¿Organizas?».
    expect(t).toContain('Todavía no hay torneos de EA SPORTS FC');
    expect(t).not.toContain('¿Organizas?');
    state.hub = ok({ tournaments: [{ ...hubTour('f', 'Copa FC', 'registration'), game: 'ea_fc', mode: '1v1', entryType: 'open' }], teams: [] });
    expect(text(page('/esports/ea_fc'))).toContain('¿Organizas? Crear torneo');
  });

  it('un juego que no existe no dibuja la página', () => {
    expect(text(page('/esports/zelda'))).not.toContain('Torneos abiertos');
  });

  it('?crear=equipo sin ID: «Primero pon tu ID» y vuelve a crear el equipo', () => {
    state.ids = ok([rec({ game: 'cs2', idDisplay: '22202' })]);
    const out = page('/esports/valorant?crear=equipo');
    const t = text(out);
    expect(t).toContain('Primero pon tu ID de VALORANT');
    expect(out).toContain(`href="/esports/mi-id?juego=valorant&amp;volver=${encodeURIComponent('/esports/valorant?crear=equipo')}"`);
    expect(t).not.toContain('Nombre del equipo');
  });

  it('?crear=equipo con el ID puesto (declarado basta): el formulario (nombre, tag, descripción y logo)', () => {
    state.ids = ok([rec()]);
    const t = text(page('/esports/valorant?crear=equipo&volver=/l/abc'));
    for (const s of ['Crear equipo', 'Nombre del equipo', 'Tag', 'Descripción (opcional)', 'Logo (opcional)', 'Elegir logo']) expect(t).toContain(s);
  });

  it('?crear=liga: «Crear liga» con pública o privada y la sede', () => {
    const out = page('/esports/rocket_league?crear=liga');
    const t = text(out);
    expect(t).toContain('Crear liga');
    expect(t).toContain('Nombre de la liga');
    expect(out).toContain('placeholder="Liga de Rocket League"');
    expect(t).toContain('Pública');
    expect(t).toContain('Privada');
    expect(out).toContain('placeholder="Online, cibercafé o centro gamer"');
  });
});

describe('el equipo (/esports/equipo/:teamId)', () => {
  beforeEach(() => {
    state.team = ok({ team: team(), members: MEMBERS });
    state.idsFor = ok([checked('busqueda'), rec({ userId: 'u2', idDisplay: 'Bruno#LAN', ranks: {} })]);
  });

  it('como capitán: «Invitar», los miembros en orden con su ID, rango y rol, el «•••» y los torneos', () => {
    state.teamEntries = ok([
      {
        id: 'en1',
        leagueId: 'l1',
        eventId: 'ev1',
        kind: 'team',
        teamId: 't1',
        name: 'Los Tigres',
        tag: 'TGR',
        captainId: 'u1',
        status: 'pending',
        seed: null,
        checkedInAt: null,
        note: null,
        sideTeamId: null,
        assignedEntry: null,
        members: [],
        createdAt: null,
      },
    ]);
    state.tournament = ok({
      eventId: 'ev1',
      leagueId: 'l1',
      name: 'Copa Caribe',
      game: 'valorant',
      mode: '5v5',
      entryType: 'teams',
      format: 'single_elim',
      status: 'registration',
      startsAt: iso(NOW + 48 * H),
      registrationOpensAt: null,
      registrationClosesAt: iso(NOW + 24 * H),
      checkinMinutes: null,
      maxEntries: 8,
      settings: defaultSettings('valorant', '5v5', 'single_elim'),
      prizeText: '',
      announcement: '',
      updatedAt: null,
    });
    const out = page('/esports/equipo/t1');
    const t = text(out);
    expect(t).toContain('Los Tigres');
    expect(t).toContain('[TGR]');
    expect(t).toContain('Jugamos los sábados');
    expect(out).toContain('href="/esports/valorant"');
    expect(t).toContain('Invitar');
    expect(out).toContain('aria-label="Más opciones"');
    expect(t).toContain('2 titulares · 1 suplente');
    // El capitán primero, después los titulares y al final los suplentes.
    expect(t.indexOf('Ana (tú)')).toBeLessThan(t.indexOf('Bruno'));
    expect(t.indexOf('Bruno')).toBeLessThan(t.indexOf('Carla'));
    expect(t).toContain('Ana#LAN');
    expect(t).toContain('Oro 2 · Declarado');
    expect(t).toContain('Capitán');
    expect(t).toContain('Suplente');
    // El chip del ID: «Comprobado» (Riot lo encontró) o «Declarado».
    expect(t).toContain('Comprobado');
    expect(t).toContain('Declarado');
    expect(t).not.toContain('Pendiente');
    expect(t).toContain('Sin ID de juego');
    // El capitán toca a los demás (no a sí mismo).
    expect(out).toContain('aria-label="Bruno: opciones"');
    expect(out).not.toContain('aria-label="Ana: opciones"');
    expect(t).toContain('Torneos del equipo');
    expect(t).toContain('Copa Caribe');
    expect(t).toContain('Por aprobar');
    expect(out).toContain('href="/l/l1"');
  });

  it('?invitar=1 (al crearlo): la hoja con el código, el QR y «Cambiar código»', () => {
    const out = page('/esports/equipo/t1?invitar=1');
    const t = text(out);
    expect(t).toContain('Invitar al equipo');
    expect(t).toContain('Necesita su ID del juego.');
    expect(t).toContain('K7M2PQ9X');
    expect(out).toContain('aria-label="Código QR de la invitación"');
    expect(t).toContain('Cambiar código');
    expect(t).toContain('Copiar enlace');
  });

  it('como miembro: sin «Invitar», con «•••» (salir) y sin tocar a los demás', () => {
    state.auth = { user: { uid: 'u2' }, loading: false };
    const out = page('/esports/equipo/t1?invitar=1');
    const t = text(out);
    expect(t).not.toContain('Invitar');
    expect(out).toContain('aria-label="Más opciones"');
    expect(t).toContain('Bruno (tú)');
    expect(out).not.toContain(': opciones"');
  });

  it('sin ser miembro: ni «Invitar» ni «•••»; sin cuenta, «Entrar» para ver quiénes juegan', () => {
    state.auth = { user: { uid: 'x' }, loading: false };
    const out = page('/esports/equipo/t1');
    expect(text(out)).not.toContain('Invitar');
    expect(out).not.toContain('aria-label="Más opciones"');
    state.auth = { user: null, loading: false };
    const anon = text(page('/esports/equipo/t1'));
    expect(anon).toContain('3 miembros. Entra a tu cuenta para ver quiénes juegan.');
  });

  it('un equipo que ya no existe', () => {
    state.team = ok(null);
    expect(text(page('/esports/equipo/t1'))).toContain('Este equipo ya no existe');
  });
});

describe('unirse con el código (/esports/unirse/:code)', () => {
  const preview = { teamId: 't1', game: 'valorant' as const, name: 'Los Tigres', tag: 'TGR', logoPath: null, memberCount: 4 };
  const join = (uid: string | null, p: typeof preview | null | undefined = preview) => text(bare(h(JoinTeamView, { code: 'K7M2PQ9X', preview: p, uid })));

  it('con todo (un ID declarado basta): «Unirme al equipo»', () => {
    state.ids = ok([rec()]);
    const t = join('u9');
    expect(t).toContain('Te invitaron al equipo');
    expect(t).toContain('Los Tigres [TGR]');
    expect(t).toContain('VALORANT');
    expect(t).toContain('4 miembros');
    expect(t).toContain('Unirme al equipo');
  });

  it('sin ID: «Primero pon tu ID» y vuelve aquí; sin cuenta: crear cuenta o entrar', () => {
    const html = bare(h(JoinTeamView, { code: 'K7M2PQ9X', preview, uid: 'u9' }));
    expect(text(html)).toContain('Primero pon tu ID de VALORANT');
    expect(html).toContain(`href="/esports/mi-id?juego=valorant&amp;volver=${encodeURIComponent('/esports/unirse/K7M2PQ9X')}"`);
    const t = join(null);
    expect(t).toContain('Crear cuenta y unirme');
    expect(t).toContain('Ya tengo cuenta');
    expect(t).not.toContain('Unirme al equipo');
  });

  it('un código que no sirve', () => {
    expect(join('u9', null)).toContain('Esta invitación no sirve');
  });
});

describe('Mi ID de juego (/esports/mi-id)', () => {
  it('sin cuenta: la tarjeta para entrar', () => {
    state.auth = { user: null, loading: false };
    const t = text(page('/esports/mi-id'));
    expect(t).toContain('Mi ID de juego');
    expect(t).toContain('Entra para poner tu ID de juego');
  });

  it('vacía: qué es y «Agregar un ID»', () => {
    const t = text(page('/esports/mi-id'));
    expect(t).toContain('Todavía no tienes IDs de juego');
    expect(t).toContain('Agregar un ID');
  });

  it('la lista (en el orden de los juegos) con el rango y su chip; sin reclamos ni capturas', () => {
    state.ids = ok([rec({ game: 'cs2', idDisplay: '22202', ranks: { main: { value: 12500 } } }), checked('busqueda'), checked('login', { game: 'rocket_league', idDisplay: 'Ana_RL', ranks: {} })]);
    const out = page('/esports/mi-id');
    const t = text(out);
    expect(t).toContain('Tus IDs');
    expect(t.indexOf('Ana#LAN')).toBeLessThan(t.indexOf('22202'));
    expect(t).toContain('Oro 2 · Declarado');
    expect(t).toContain('Comprobado');
    expect(t).toContain('Declarado');
    expect(t).toContain('Cuenta conectada');
    expect(t).not.toContain('Reclamos');
    expect(t).not.toContain('captura');
    expect(t).not.toContain('código de prueba');
    expect(t).toContain('Agregar un ID');
  });

  it('?juego=valorant sin ID: la hoja con «Conectar con Riot», el campo, el rango y «Buscar»', () => {
    state.providers = ok(PROVIDERS);
    const out = page('/esports/mi-id?juego=valorant');
    const t = text(out);
    expect(t).toContain('Entra con tu cuenta de Riot y tu ID queda conectado.');
    expect(t).toContain('Conectar con Riot');
    expect(t).toContain('Región');
    expect(t).toContain('Latinoamérica');
    expect(t).toContain('Tu Riot ID');
    expect(out).toContain('placeholder="Nombre#LAN"');
    expect(t).toContain('Tu rango (opcional)');
    expect(t).toContain('Buscar');
  });

  it('?juego= con el proveedor apagado: sin «Conectar», y «Guardar» si no hay búsqueda', () => {
    const t = text(page('/esports/mi-id?juego=valorant'));
    expect(t).not.toContain('Conectar con');
    expect(t).toContain('Guardar');
    expect(t).not.toContain('Buscar');
    const cs = text(page('/esports/mi-id?juego=cs2'));
    expect(cs).toContain('Conectar con Steam');
    expect(cs).toContain('Tu código de amigo de Steam');
    expect(cs).toContain('Guardar');
    // Un juego sin verificación: escribir el ID y el rango, y «Guardar».
    const mlbb = text(page('/esports/mi-id?juego=mlbb'));
    expect(mlbb).not.toContain('Conectar con');
    expect(mlbb).toContain('Tu rango (opcional)');
    expect(mlbb).toContain('Guardar');
  });
});

describe('la hoja del ID, paso por paso', () => {
  const sheet = (props: Record<string, unknown>) =>
    bare(
      h(GameIdSheet, {
        open: true,
        onClose: () => {},
        game: 'valorant',
        record: null,
        providers: PROVIDERS,
        onDone: () => {},
        ...props,
      }),
    );

  it('NBA 2K: la plataforma primero', () => {
    const t = text(sheet({ game: 'nba_2k' }));
    expect(t).toContain('Plataforma');
    expect(t).toContain('Elige la plataforma');
    expect(t).toContain('PlayStation');
    expect(t).toContain('Tu usuario de la consola');
  });

  it('escribir el ID: un solo paso con el rango (opcional) y «Guardar»; sin casilla de «es mío»', () => {
    const out = sheet({ game: 'mlbb' });
    const t = text(out);
    expect(t).toContain('Tu rango (opcional)');
    expect(t).toContain('Sin rango');
    expect(t).toContain('Guardar');
    expect(t).not.toContain('Confirmo que este ID es mío');
    expect(t).not.toContain('Confirmar mi ID');
    // VALORANT con Riot encendido: «Buscar», y la escalera de VALORANT en el rango.
    const val = text(sheet({}));
    expect(val).toContain('Buscar');
    expect(val).toContain('Inmortal');
  });

  it('no lo encontró: el aviso y «Guardarlo así» (queda declarado)', () => {
    const t = text(sheet({ initial: { raw: 'Ana#LAN', message: 'No encontramos ese Riot ID. Revisa cómo lo escribiste.' } }));
    expect(t).toContain('No encontramos ese Riot ID. Revisa cómo lo escribiste.');
    expect(t).toContain('Guardarlo así');
  });

  it('«¿Eres tú?» con el nombre y el rango que encontró', () => {
    const t = text(
      sheet({ game: 'lol', initial: { step: 'found', display: 'Ana#LAN', found: { status: 'found', lookupId: 'lk1', displayName: 'Ana#LAN', ranks: { main: { tier: 'diamond', div: 2 } } } } }),
    );
    expect(t).toContain('¿Eres tú?');
    expect(t).toContain('Diamante II · Verificado');
    expect(t).toContain('Sí, soy yo');
    expect(t).toContain('No soy yo');
  });

  it('conectado a otra cuenta: con qué entró, «Conectar con…» si está encendido o «Prueba con otro ID»', () => {
    const t = text(sheet({ game: 'rocket_league', initial: { step: 'taken', display: 'AnaRL' } }));
    expect(t).toContain('Ese ID está conectado a otra cuenta');
    expect(t).toContain('Quien lo conectó entró con su cuenta de Epic. Si es tuyo, conéctalo tú y pasa a tu cuenta.');
    expect(t).toContain('Conectar con Epic');
    expect(t).toContain('Prueba con otro ID');
    expect(t).not.toContain('Reclamar');
    const off = text(sheet({ game: 'rocket_league', providers: ALL_OFF, initial: { step: 'taken', display: 'AnaRL' } }));
    expect(off).not.toContain('Conectar con');
    expect(off).toContain('Prueba con otro ID');
  });

  it('lo que hay: el ID con su chip, el rango, comprobar, conectar, cambiar y quitar; nada de capturas', () => {
    const t = text(sheet({ record: rec() }));
    expect(t).toContain('Ana#LAN');
    expect(t).toContain('Declarado');
    expect(t).toContain('Oro 2 · Declarado');
    expect(t).toContain('Cambiar mi rango');
    expect(t).toContain('Comprobar con Riot');
    expect(t).toContain('Conectar con Riot');
    expect(t).toContain('Cambiar mi ID');
    expect(t).toContain('Quitar mi ID');
    expect(t).not.toContain('captura');
    expect(t).not.toContain('Confirmar mi ID');
    const found = text(sheet({ record: checked('busqueda', { ranks: {} }) }));
    expect(found).toContain('Comprobado');
    expect(found).toContain('Poner mi rango');
    expect(found).not.toContain('Comprobar con Riot');
    const login = text(sheet({ record: checked('login') }));
    expect(login).toContain('Cuenta conectada');
    expect(login).toContain('Lo conectaste con tu cuenta de Riot.');
    expect(login).not.toContain('Cambiar mi ID');
    expect(login).not.toContain('Conectar con Riot');
    expect(login).toContain('Quitar mi ID');
  });

  it('el modo local: nada encendido, el ID se guarda declarado («Guardar», sin «Conectar» ni «Buscar»)', () => {
    const t = text(sheet({ game: 'lol', providers: ALL_OFF }));
    expect(t).toContain('Guardar');
    expect(t).not.toContain('Buscar');
    expect(t).not.toContain('Conectar con');
    const r = text(sheet({ providers: ALL_OFF, record: rec() }));
    expect(r).not.toContain('Comprobar con Riot');
    expect(r).not.toContain('Conectar con');
    expect(r).toContain('Cambiar mi ID');
  });

  it('Rocket League: el rango por modo con el MMR (aprox., temporada actual)', () => {
    const out = sheet({ game: 'rocket_league', record: rec({ game: 'rocket_league', idDisplay: 'Ana_RL', ranks: { '3v3': { tier: 'gc2', div: 3, mmr: 1650 } } }), initial: { step: 'rank' } });
    const t = text(out);
    expect(out).toContain('aria-label="Modo del rango"');
    for (const m of ['1v1', '2v2', '3v3']) expect(out).toContain(`aria-label="Rango en ${m}"`);
    expect(t).toContain('Tu MMR (opcional)');
    expect(t).toContain('aprox., temporada actual');
    expect(out).toContain('value="1650"');
    expect(t).toContain('Gran Campeón II · Div. III');
    expect(t).toContain('Guardar rango');
  });
});
