/**
 * Las pantallas de Equipos dibujadas sin navegador (renderToString) con datos de mentira: Equipos (sin cuenta, con lo
 * tuyo —también los de esports—, lo que sigues, sin nada y «Crear equipo» abierto con `?crear=1`), la hoja de crear (el
 * deporte, los datos y cuándo deja crear), la página del equipo como un perfil (sin cuenta, capitán, miembro, quien no
 * es miembro y quien tiene invitación; los números, los seguidores y las pestañas Publicaciones, Juegos, Torneos,
 * Estadísticas —con las ligas— y Plantilla —con `?jugador=`—; «Invitar» con `?invitar=1`, con la búsqueda de personas y
 * las pendientes; no existe) y la pantalla de unirse con el código (leyendo, no sirve, sin cuenta, ya estás y «Unirme»).
 * Los menús y hojas cerradas no se dibujan: su lógica está en src/components/squads/squads.test.ts.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Live } from '../../lib/data/client';
import type { EsportsTeam, TeamRole } from '../../lib/data/esports';
import type { FollowPerson, Paged } from '../../lib/data/follows';
import type { PeopleLive, PersonHit } from '../../lib/data/people';
import type { Post } from '../../lib/data/posts';
import type { MySquad, MySquadInvite, SquadGame, SquadLite, SquadMember, SquadPage, SquadPendingInvite, SquadSearch, SquadStats } from '../../lib/data/squads';
import { FeedbackProvider } from '../../components/feedback';

const ok = <T,>(data: T): Live<T> => ({ data, loading: false, error: null });

const state = vi.hoisted(() => ({
  followers: null as Paged<FollowPerson> | null,
  games: null as Paged<SquadGame> | null,
  stats: { data: null, loading: false, error: null } as Live<SquadStats | null>,
  pending: { data: [], loading: false, error: null } as Live<SquadPendingInvite[]>,
  myInvites: { data: [], loading: false, error: null } as Live<MySquadInvite[]>,
  people: { data: [], loading: false, error: null, settled: true, query: '' } as PeopleLive,
  asked: [] as string[],
  auth: { user: { uid: 'u1' } as { uid: string } | null, loading: false },
  pro: false,
  squad: { data: null, loading: false, error: null } as Live<SquadPage | null>,
  mine: { data: [], loading: false, error: null } as Live<MySquad[]>,
  followed: { data: [], loading: false, error: null } as Live<SquadLite[]>,
  search: { data: [], loading: false, error: null, settled: true } as SquadSearch,
  code: { data: 'K7M2PQ9X', loading: false, error: null } as Live<string | null>,
  esports: { data: [], loading: false, error: null } as Live<(EsportsTeam & { myRole: TeamRole })[]>,
  posts: null as Paged<Post> | null,
  creatable: ['bowling', 'padel', 'basketball', 'football', 'futsal', 'swimming', 'esports'] as string[],
  leagues: [] as Record<string, unknown>[],
}));

vi.mock('../../lib/auth', async (orig) => ({
  ...(await orig<typeof import('../../lib/auth')>()),
  useAuth: () => ({ ...state.auth, profile: { name: 'Ana' }, isSuper: false, recovering: false }),
}));
vi.mock('../../components/Shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('../../lib/useMode', async (orig) => ({ ...(await orig<typeof import('../../lib/useMode')>()), useIsPro: () => state.pro }));
vi.mock('../../lib/data/squads', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/squads')>()),
  useSquad: () => state.squad,
  useMySquads: () => state.mine,
  useFollowedSquads: () => state.followed,
  useSquadSearch: () => state.search,
  useSquadCode: () => state.code,
  useSquadFollowers: (id: string | null | undefined) => {
    state.asked.push(`followers:${id}`);
    return state.followers ?? paged<FollowPerson>();
  },
  useSquadGames: (id: string | null | undefined) => {
    state.asked.push(`games:${id}`);
    return state.games ?? paged<SquadGame>();
  },
  useSquadStats: (id: string | null | undefined) => {
    state.asked.push(`stats:${id}`);
    return state.stats;
  },
  useSquadPendingInvites: () => state.pending,
  useMySquadInvites: () => state.myInvites,
}));
vi.mock('../../lib/data/people', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/people')>()),
  usePeople: (query: string, lid?: string | null, squad?: string | null) => {
    state.asked.push(`people:${query}:${lid ?? '-'}:${squad ?? '-'}`);
    return state.people;
  },
}));
vi.mock('../../lib/data/esports', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/esports')>()),
  useMyEsportsTeams: (uid: string | null) => (uid ? state.esports : ok([])),
}));
vi.mock('../../lib/data/posts', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/posts')>()),
  useSquadPosts: () => state.posts ?? paged<Post>(),
}));
vi.mock('../../lib/data/follows', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/follows')>()),
  usePublicProfile: () => ({ data: null, loading: false, error: null }),
}));
vi.mock('../../components/home/useHomeData', () => ({ useMyLeagues: () => ({ all: state.leagues, memberships: ok([]), loading: false, error: null }) }));
vi.mock('../../sports/status', async (orig) => {
  const real = await orig<typeof import('../../sports/status')>();
  const { groupSports } = await import('../../sports/registry');
  return {
    ...real,
    useSportStatus: () => ({
      status: {},
      loaded: true,
      creatable: state.creatable,
      choices: groupSports(state.creatable as never),
      canCreate: (s: string) => state.creatable.includes(s),
    }),
  };
});

const { default: SquadsPage } = await import('./SquadsPage');
const { default: SquadPageScreen } = await import('./SquadPage');
const { JoinSquadView } = await import('./JoinSquadPage');
const { CreateSquadSheet, createGate } = await import('./CreateSquadSheet');
const { SquadMemberSheet } = await import('./SquadMemberSheet');
const { SquadLeagueSheet } = await import('./SquadLeagueSheet');
const { SquadFollowersSheet } = await import('../../components/squads/SquadHeader');

function paged<T>(extra: Partial<Paged<T>> = {}): Paged<T> {
  return { data: [], loading: false, error: null, hasMore: false, loadingMore: false, moreError: null, loadMore: async () => undefined, refresh: () => undefined, ...extra };
}

const page = (url: string) =>
  renderToString(
    h(
      MemoryRouter,
      { initialEntries: [url] },
      h(
        FeedbackProvider,
        null,
        h(Routes, null, h(Route, { path: '/equipos', element: h(SquadsPage) }), h(Route, { path: '/equipos/:squadId', element: h(SquadPageScreen) })),
      ),
    ),
  );
const bare = (node: ReactNode, url = '/') => renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, node)));
const text = (html: string) =>
  html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const lite = (id: string, extra: Partial<SquadLite> = {}): SquadLite => ({
  id,
  sport: 'football',
  name: `Tigres ${id}`,
  tag: 'TGR',
  logo: null,
  color: null,
  city: null,
  recruiting: false,
  members: 12,
  followers: 3,
  ...extra,
});
const member = (id: string, name: string, extra: Partial<SquadMember> = {}): SquadMember => ({
  id,
  name,
  username: null,
  avatar: null,
  role: 'member',
  position: null,
  jersey: null,
  isMe: false,
  ...extra,
});
const ROSTER = [member('u2', 'Bruno', { position: 'Portero', jersey: 1 }), member('u1', 'Ana', { role: 'captain', isMe: true, jersey: 10 }), member('u3', 'Carla')];

const full = (extra: Partial<SquadPage> = {}): SquadPage => ({
  ...lite('S1', { name: 'Los Tigres', city: 'Santiago', color: '#dc2626', recruiting: true, members: 3, followers: 41 }),
  description: 'Jugamos los domingos',
  captainId: 'u1',
  isMember: true,
  myRole: 'captain',
  isFollowing: false,
  createdAt: new Date().toISOString(),
  roster: ROSTER,
  leagues: [],
  record: { played: 7, won: 5, drawn: 0, lost: 2 },
  ...extra,
});
const asMember = (extra: Partial<SquadPage> = {}) =>
  full({ myRole: 'member', captainId: 'u2', roster: ROSTER.map((m) => (m.id === 'u1' ? { ...m, role: 'member' as const } : m.id === 'u2' ? { ...m, role: 'captain' as const } : m)), ...extra });
const outsider = (extra: Partial<SquadPage> = {}) => full({ isMember: false, myRole: null, captainId: 'u2', roster: ROSTER.map((m) => ({ ...m, isMe: false, role: m.id === 'u2' ? ('captain' as const) : ('member' as const) })), ...extra });

beforeEach(() => {
  state.auth = { user: { uid: 'u1' }, loading: false };
  state.pro = false;
  state.squad = ok(null);
  state.mine = ok([]);
  state.followed = ok([]);
  state.search = { data: [], loading: false, error: null, settled: true };
  state.code = ok('K7M2PQ9X');
  state.esports = ok([]);
  state.posts = null;
  state.creatable = ['bowling', 'padel', 'basketball', 'football', 'futsal', 'swimming', 'esports'];
  state.leagues = [];
  state.followers = null;
  state.games = null;
  state.stats = ok(null);
  state.pending = ok([]);
  state.myInvites = ok([]);
  state.people = { data: [], loading: false, error: null, settled: true, query: '' };
  state.asked = [];
});

describe('Equipos (/equipos)', () => {
  it('sin cuenta: «Equipos» y entrar (el único botón principal es crear la cuenta)', () => {
    state.auth = { user: null, loading: false };
    const html = page('/equipos');
    const t = text(html);
    expect(t).toContain('Ligas');
    expect(html).toContain('href="/ligas"');
    expect(t).toContain('Equipos');
    expect(t).toContain('Tu equipo competitivo, con o sin liga');
    expect(t).not.toContain('Crear equipo');
    expect(t).toContain('Entra para ver tus equipos');
    expect(html).toContain('href="/login?next=%2Fequipos"');
    expect(t).not.toContain('Mis equipos');
  });

  it('con lo tuyo: «Mis equipos» (también los de esports, con su juego), «Equipos que sigo», el código y esports', () => {
    state.mine = ok([{ ...lite('S1', { name: 'Los Tigres' }), role: 'captain' }, { ...lite('S2', { name: 'Halcones', sport: 'basketball', members: 1 }), role: 'member' }]);
    state.esports = ok([
      { id: 'e1', game: 'valorant', name: 'Radiantes', tag: 'RAD', description: '', logoPath: null, captainId: 'u9', memberCount: 5, createdAt: null, updatedAt: null, myRole: 'member' },
    ]);
    state.followed = ok([lite('S7', { name: 'Leones' })]);
    const html = page('/equipos');
    const t = text(html);
    const order = ['Crear equipo', 'Mis equipos', 'Los Tigres [TGR]', 'Halcones [TGR]', 'Radiantes [RAD]', 'Equipos que sigo', 'Leones [TGR]', 'Unirme con código'];
    const at = order.map((s) => t.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(t).toContain('Fútbol · 12 miembros · Capitán');
    expect(t).toContain('Baloncesto · 1 miembro');
    expect(t).toContain('VALORANT · 5 miembros');
    expect(html).toContain('href="/equipos/S1"');
    expect(html).toContain('href="/esports/equipo/e1"');
    expect(html).toContain('aria-label="Dejar de seguir Leones"');
    expect(html).toContain('placeholder="Buscar equipos por nombre, tag o ciudad"');
    expect(html).toContain('aria-label="Código del equipo"');
    expect(html).toContain('maxLength="8"');
    expect(html).toContain('href="/esports"');
    expect(t).not.toContain('Todavía no tienes equipo');
  });

  it('sin nada todavía: cómo empezar; cargando: la forma de la lista', () => {
    expect(text(page('/equipos'))).toContain('Todavía no tienes equipo');
    state.mine = { data: [], loading: true, error: null };
    const html = page('/equipos');
    expect(html).toContain('Cargando tus equipos');
    expect(text(html)).not.toContain('Todavía no tienes equipo');
  });

  it('?crear=1 abre «Crear equipo» en el paso del deporte (con Esports); con ?deporte=, directo a los datos', () => {
    let t = text(page('/equipos?crear=1'));
    expect(t).toContain('¿De qué deporte?');
    expect(t).toContain('Esports');
    expect(t).toContain('Seguir');
    t = text(page('/equipos?crear=1&deporte=football'));
    expect(t).toContain('Fútbol de campo · Cambiar');
    expect(t).toContain('Nombre del equipo');
    expect(t).toContain('Busca jugadores');
    expect(t).not.toContain('¿De qué deporte?');
  });
});

describe('crear un equipo', () => {
  const sheet = (initial?: Record<string, unknown>, sport: string | null = 'football') =>
    bare(h(CreateSquadSheet, { open: true, onClose: () => undefined, onEsports: () => undefined, sport, initial }));
  const createButton = (html: string) => html.match(/<button type="submit"[^>]*>(?:(?!<\/button>).)*Crear equipo/s)?.[0] ?? '';

  it('cuándo deja crear (squadProblem) y cuándo lo dice', () => {
    expect(createGate({ name: '', tag: '' })).toEqual({ problem: 'Ponle un nombre al equipo.', shown: null, canCreate: false });
    expect(createGate({ name: 'A', tag: '' }).shown).toBe('Ponle un nombre al equipo.');
    expect(createGate({ name: 'Los Tigres', tag: 'L' }).shown).toBe('El tag va de 2 a 5 letras o números (como TGR).');
    expect(createGate({ name: 'Los Tigres', tag: 'LT', city: 'x'.repeat(41) }).shown).toBe('Usa 40 caracteres o menos en la ciudad.');
    expect(createGate({ name: 'Los Tigres', tag: 'LT' }).canCreate).toBe(true);
    expect(createGate({ name: 'Los Tigres', tag: 'LT' }, true).canCreate).toBe(false);
  });

  it('vacío: «Crear equipo» apagado y sin regaños; con nombre, el tag sale solo y deja crear', () => {
    const empty = sheet();
    expect(createButton(empty)).toContain('disabled=""');
    expect(empty).not.toContain('role="alert"');
    const ready = sheet({ name: 'Los Tigres del Este' });
    // «Los Tigres del Este» → TE (sin «los» ni «del»).
    expect(ready).toContain('value="TE"');
    expect(createButton(ready)).not.toContain('disabled=""');
    const bad = sheet({ name: 'X' });
    expect(bad).toContain('role="alert"');
    expect(text(bad)).toContain('Ponle un nombre al equipo.');
    expect(createButton(bad)).toContain('disabled=""');
  });

  it('los datos: color (el del deporte de entrada y la lista), ciudad, descripción y «Busca jugadores»', () => {
    const html = sheet({ name: 'Los Tigres', color: '#2563eb', recruiting: true });
    expect(html).toContain('aria-label="El color del deporte"');
    expect(html).toMatch(/role="radio" aria-checked="true" aria-label="Azul"/);
    expect(html).toContain('placeholder="Santo Domingo"');
    expect(html).toMatch(/role="switch" aria-checked="true"/);
    expect(html).toContain('mm-squad-2563eb');
  });

  it('sin cuenta: entrar; esports no sale marcado', () => {
    expect(text(sheet(undefined, 'esports'))).toContain('¿De qué deporte?');
    state.auth = { user: null, loading: false };
    expect(text(sheet())).toContain('Entra para crear tu equipo');
  });
});

describe('la página del equipo', () => {
  const tabs = (html: string) => [...html.matchAll(/role="tab" aria-selected="(true|false)"[^>]*>([^<]*)</g)].map((m) => ({ on: m[1] === 'true', label: m[2] }));
  const onTab = (html: string) => tabs(html).find((t) => t.on)?.label;
  const rec = (won: number, drawn: number, lost: number) => ({ played: won + drawn + lost, won, drawn, lost });

  it('cargando, error y un equipo que no existe', () => {
    state.squad = { data: null, loading: true, error: null };
    expect(page('/equipos/S1')).toContain('skeleton');
    state.squad = { data: null, loading: false, error: new Error('red') };
    expect(text(page('/equipos/S1'))).toContain('No se pudieron cargar los datos');
    state.squad = ok(null);
    const html = page('/equipos/S1');
    expect(text(html)).toContain('Este equipo ya no existe');
    expect(html).toContain('href="/equipos"');
  });

  it('arriba, como un perfil y en su color: logo, nombre, tag, deporte, ciudad, «Busca jugadores» y la descripción', () => {
    state.squad = ok(full());
    const html = page('/equipos/S1');
    const t = text(html);
    expect(html).toContain('mm-squad-dc2626');
    expect(html).toContain('>TGR</text>');
    expect(html).toContain('Los Tigres</h1>');
    expect(t).toContain('[TGR]');
    expect(t).toContain('Fútbol de campo · Santiago');
    expect(t).toContain('Busca jugadores');
    expect(t).toContain('Jugamos los domingos');
    expect(html).toContain('href="/equipos"');
  });

  it('los números: Publicaciones · Seguidores · Me gusta · Miembros y el récord', () => {
    state.squad = ok(full({ posts: 12, likes: 1500 }));
    const html = page('/equipos/S1');
    const t = text(html);
    expect(html).toContain('aria-label="Números del equipo"');
    expect(t).toContain('12 Publicaciones');
    expect(t).toContain('41 Seguidores');
    expect(t).toContain('1.5 mil Me gusta');
    expect(t).toContain('3 Miembros');
    expect(t).toContain('Récord 5 G · 2 P 7 partidos · 71 % ganados');
    // Una copia vieja sin publicaciones ni me gusta: 0; uno solo, en singular; sin partidos, lo dice.
    state.squad = ok(full({ members: 1, followers: 1, posts: 1, record: rec(0, 0, 0) }));
    const one = text(page('/equipos/S1'));
    expect(one).toContain('1 Publicación');
    expect(one).toContain('1 Seguidor ');
    expect(one).toContain('0 Me gusta');
    expect(one).toContain('1 Miembro ');
    expect(one).toContain('Récord — Sin partidos todavía');
  });

  it('las pestañas: Publicaciones de entrada; ?tab= abre otra (los links viejos de muro y ligas también)', () => {
    state.squad = ok(full());
    let html = page('/equipos/S1');
    expect(tabs(html)).toEqual([
      { on: true, label: 'Publicaciones' },
      { on: false, label: 'Juegos' },
      { on: false, label: 'Torneos' },
      { on: false, label: 'Estadísticas' },
      { on: false, label: 'Plantilla' },
    ]);
    expect(onTab(page('/equipos/S1?tab=juegos'))).toBe('Juegos');
    expect(onTab(page('/equipos/S1?tab=muro'))).toBe('Publicaciones');
    html = page('/equipos/S1?tab=ligas');
    expect(onTab(html)).toBe('Estadísticas');
    expect(text(html)).toContain('Inscribir en una liga');
  });

  it('seguidores: la lista (también sin cuenta) con su perfil, «Te sigue» y Seguir (menos tú); vacía, lo dice', () => {
    const person = (id: string, name: string, extra: Partial<FollowPerson> = {}): FollowPerson => ({
      id,
      name,
      username: name.toLowerCase(),
      avatar: null,
      at: new Date().toISOString(),
      isFollowing: false,
      followsYou: false,
      isMe: false,
      ...extra,
    });
    state.followers = paged<FollowPerson>({
      data: [person('f1', 'Ana', { followsYou: true }), person('f2', 'Beto', { isFollowing: true }), person('u1', 'Yo', { isMe: true })],
      hasMore: true,
    });
    const html = bare(h(SquadFollowersSheet, { squad: full(), open: true, onClose: () => undefined }));
    const t = text(html);
    expect(t).toContain('Seguidores de Los Tigres');
    expect(html).toContain('href="/u/f1"');
    expect(html).toContain('href="/u/f2"');
    expect(t).toContain('@ana');
    expect(t).toContain('Te sigue');
    expect(html).toContain('aria-label="Seguir a Ana"');
    expect(html).toContain('aria-label="Dejar de seguir a Beto"');
    expect(html).not.toContain('Seguir a Yo');
    expect(t).toContain('Tú');
    expect(t).toContain('Ver más');
    expect(state.asked).toContain('followers:S1');
    state.followers = paged<FollowPerson>();
    expect(text(bare(h(SquadFollowersSheet, { squad: full(), open: true, onClose: () => undefined })))).toContain('Todavía nadie sigue a este equipo');
    // Cerrada no lee nada.
    state.asked = [];
    bare(h(SquadFollowersSheet, { squad: full(), open: false, onClose: () => undefined }));
    expect(state.asked).toEqual([]);
  });

  it('capitán: «Invitar», «•••» y la plantilla (capitán primero, posición y número, cada fila a su perfil y «•••»)', () => {
    state.squad = ok(full());
    const html = page('/equipos/S1?tab=plantilla');
    const t = text(html);
    expect(t).toContain('Invitar');
    expect(html).toContain('aria-label="Más opciones"');
    expect(html).not.toContain('aria-label="Seguir Los Tigres"');
    expect(onTab(html)).toBe('Plantilla');
    expect(t).toContain('Con «•••» cambias su posición y número');
    expect(t.indexOf('Ana (tú)')).toBeLessThan(t.indexOf('Bruno'));
    expect(t).toContain('Capitán');
    expect(t).toContain('Portero · #1');
    expect(html).toContain('href="/u/u2"');
    expect(html).toContain('aria-label="Bruno: opciones"');
    expect(html).toContain('aria-label="Ana: opciones"');
    // La hoja de invitar no está abierta.
    expect(t).not.toContain('Código del equipo');
  });

  it('?invitar=1 (capitán): la búsqueda (miembro «Ya está», invitado y nuevo), las pendientes con «Retirar» y el código', () => {
    state.squad = ok(full());
    const hit = (id: string, name: string, extra: Partial<PersonHit> = {}): PersonHit => ({
      id,
      name,
      username: name.toLowerCase(),
      isFollowing: true,
      followsYou: false,
      inLeague: false,
      invited: false,
      inSquad: false,
      ...extra,
    });
    state.people = { data: [hit('p1', 'Dario'), hit('u2', 'Bruno', { inSquad: true }), hit('p3', 'Elsa', { invited: true })], loading: false, error: null, settled: true, query: '' };
    state.pending = ok([{ id: 'i1', user: { id: 'p3', name: 'Elsa', username: 'elsa', avatar: null }, createdAt: new Date(Date.now() - 2 * 3600_000).toISOString() }]);
    const html = page('/equipos/S1?invitar=1');
    const t = text(html);
    expect(t).toContain('Invitar al equipo');
    // La búsqueda pide la del equipo (cada persona trae «ya es miembro» / «invitado»).
    expect(state.asked).toContain('people::-:S1');
    expect(html).toContain('placeholder="Busca por nombre o @usuario"');
    expect(t).toContain('Personas que sigues');
    expect(html).toContain('aria-label="Dario, @dario"');
    expect(html).toContain('aria-label="Bruno, @bruno, ya está en el equipo"');
    expect(html).toContain('aria-label="Elsa, @elsa, ya tiene invitación"');
    expect(t).toContain('Ya está');
    expect(t).toContain('Invitado');
    // Las que esperan respuesta, con «Retirar».
    expect(t).toContain('Esperan respuesta 1');
    expect(t).toContain('@elsa · invitado hace 2 h');
    expect(html).toContain('aria-label="Retirar la invitación a Elsa"');
    // Y el link de siempre, debajo.
    expect(t).toContain('O con el link');
    expect(html).toContain('aria-label="Código QR de la invitación"');
    expect(t).toContain('K7M2PQ9X');
    expect(t).toContain('Código nuevo');
    expect(html).toContain('Copiar enlace');
    expect(t.indexOf('Personas que sigues')).toBeLessThan(t.indexOf('Esperan respuesta'));
    expect(t.indexOf('Esperan respuesta')).toBeLessThan(t.indexOf('O con el link'));
    // Nadie elegido: sin el botón de enviar.
    expect(t).not.toContain('Enviar invitación');
    // A otro no se le abre.
    state.squad = ok(asMember());
    expect(text(page('/equipos/S1?invitar=1'))).not.toContain('Invitar al equipo');
  });

  it('?invitar=1 con el equipo lleno: sin la búsqueda, lo dice; sin pendientes no sale esa parte', () => {
    state.squad = ok(full({ members: 40 }));
    const t = text(page('/equipos/S1?invitar=1'));
    expect(t).toContain('El equipo ya tiene 40 miembros');
    expect(t).not.toContain('Personas que sigues');
    expect(t).not.toContain('Esperan respuesta');
    expect(t).toContain('K7M2PQ9X');
  });

  it('miembro: sin «Invitar» ni Seguir, con «•••» (salir); la plantilla lleva a cada perfil', () => {
    state.squad = ok(asMember());
    const html = page('/equipos/S1?tab=plantilla');
    const t = text(html);
    expect(t).not.toContain('Invitar');
    expect(html).not.toContain('aria-label="Seguir Los Tigres"');
    expect(html).toContain('aria-label="Más opciones"');
    expect(html).toContain('href="/u/u2"');
    expect(html).not.toContain(': opciones');
    expect(t).not.toContain('Con «•••»');
  });

  it('?jugador= (desde el perfil global): Plantilla de entrada, con su tarjeta arriba (número, posición, papel y «Ver su perfil»)', () => {
    state.squad = ok(outsider());
    const html = page('/equipos/S1?jugador=u2');
    const t = text(html);
    expect(onTab(html)).toBe('Plantilla');
    expect(html).toContain('aria-label="Bruno en Los Tigres"');
    expect(t).toContain('En Los Tigres');
    expect(t).toContain('#1 · Portero · Capitán');
    expect(t).toContain('Ver su perfil');
    expect(html).toMatch(/href="\/u\/u2"[^>]*>(<svg[^]*?<\/svg>)?Ver su perfil/);
    // La tarjeta va antes de la plantilla, y su fila sale marcada.
    expect(t.indexOf('Ver su perfil')).toBeLessThan(t.indexOf('Carla'));
    expect(html).toMatch(/mm-row relative[^"]*bg-accent-soft[^>]*><div[^>]*>B</);
    // Alguien que ya no está: solo la plantilla.
    expect(text(page('/equipos/S1?jugador=nadie'))).not.toContain('Ver su perfil');
    // Pidiendo otra pestaña, esa.
    expect(onTab(page('/equipos/S1?jugador=u2&tab=juegos'))).toBe('Juegos');
  });

  it('quien no es miembro: Seguir (o Siguiendo), sin «•••»', () => {
    state.squad = ok(outsider());
    let html = page('/equipos/S1');
    expect(html).toContain('aria-label="Seguir Los Tigres"');
    expect(html).not.toContain('aria-label="Más opciones"');
    expect(text(html)).not.toContain('Invitar');
    state.squad = ok(outsider({ isFollowing: true }));
    html = page('/equipos/S1');
    expect(html).toContain('aria-label="Dejar de seguir Los Tigres"');
  });

  it('con una invitación pendiente a este equipo: quién invitó, Rechazar y Aceptar (en lugar de Seguir)', () => {
    state.squad = ok(outsider());
    state.myInvites = ok([
      { id: 'i1', squad: lite('S1', { name: 'Los Tigres' }), invitedBy: { id: 'u2', name: 'Bruno Díaz', username: 'bruno' }, createdAt: new Date().toISOString() },
      { id: 'i2', squad: lite('S9', { name: 'Otros' }), invitedBy: { id: 'u5', name: 'Eva', username: null }, createdAt: new Date().toISOString() },
    ]);
    const html = page('/equipos/S1');
    const t = text(html);
    expect(t).toContain('Bruno Díaz (@bruno) te invitó a este equipo');
    expect(t).not.toContain('Eva');
    expect(html.match(/>Aceptar</g)).toHaveLength(1);
    expect(html.match(/>Rechazar</g)).toHaveLength(1);
    expect(html).not.toContain('aria-label="Seguir Los Tigres"');
    // Sin invitación a este, Seguir.
    state.myInvites = ok([]);
    const none = page('/equipos/S1');
    expect(text(none)).not.toContain('te invitó');
    expect(none).toContain('aria-label="Seguir Los Tigres"');
  });

  it('sin cuenta: lo de arriba, los números, Seguir y las pestañas, que piden entrar (sin leer nada)', () => {
    state.auth = { user: null, loading: false };
    state.squad = ok(outsider({ roster: [] }));
    let html = page('/equipos/S1?tab=plantilla');
    let t = text(html);
    expect(t).toContain('Los Tigres');
    expect(t).toContain('41 Seguidores');
    expect(html).toContain('aria-label="Seguir Los Tigres"');
    expect(t).toContain('Entra para ver la plantilla');
    expect(html).toContain('href="/login?next=%2Fequipos%2FS1%3Ftab%3Dplantilla"');
    expect(tabs(html)).toHaveLength(5);
    html = page('/equipos/S1?tab=juegos');
    t = text(html);
    expect(t).toContain('Entra para ver sus partidos');
    expect(text(page('/equipos/S1'))).toContain('Entra para ver sus publicaciones');
    expect(text(page('/equipos/S1?tab=torneos'))).toContain('Entra para ver sus partidos');
    expect(text(page('/equipos/S1?tab=estadisticas'))).toContain('Entra para ver sus partidos');
    // Sin sesión, ni los partidos ni los números (piden cuenta).
    expect(state.asked.filter((a) => a.startsWith('games:') || a.startsWith('stats:'))).toEqual([]);
  });

  it('Publicaciones: los miembros publican; quien no es miembro solo lee; vacío, lo dice', () => {
    state.squad = ok(asMember());
    let t = text(page('/equipos/S1'));
    expect(t).toContain('¿Qué cuenta el equipo?');
    expect(t).toContain('Todavía no hay publicaciones');
    state.squad = ok(outsider());
    state.posts = paged<Post>({
      data: [
        {
          id: 'p1',
          author: { id: 'u2', name: 'Bruno', username: null, avatar: null },
          text: '¡Ganamos!',
          photo: null,
          league: null,
          squad: lite('S1', { name: 'Los Tigres' }),
          sport: null,
          visibility: 'public',
          at: new Date().toISOString(),
          likes: 0,
          likedByMe: false,
          comments: 0,
          isMine: false,
          canDelete: false,
        },
      ],
    });
    const html = page('/equipos/S1?tab=publicaciones');
    t = text(html);
    expect(t).not.toContain('¿Qué cuenta el equipo?');
    expect(t).toContain('¡Ganamos!');
    // En su muro no se repite el equipo.
    expect(html).not.toContain('data-squad-chip');
    expect(onTab(html)).toBe('Publicaciones');
  });

  it('Juegos: la fecha, «Tigres vs Leones», la liga y la jornada, el marcador del equipo primero y G / E / P; cada uno abre el partido', () => {
    state.squad = ok(full());
    const game = (key: string, extra: Partial<SquadGame>): SquadGame => ({
      key,
      matchId: `m-${key}`,
      leagueId: 'L1',
      leagueName: 'Liga Norte',
      sport: 'football',
      at: '2026-10-04T20:00:00.000Z',
      side: 1,
      mine: 'Los Tigres',
      opponent: 'Leones',
      score: '2-1',
      result: 'win',
      walkover: false,
      stage: null,
      round: '3',
      url: `/l/L1/juegos?partido=m-${key}`,
      ...extra,
    });
    state.games = paged<SquadGame>({
      data: [
        game('a', {}),
        game('b', { side: 2, score: '3-0', result: 'loss', opponent: 'Halcones', round: '2' }),
        game('c', { score: '1-1', result: 'draw', opponent: null, stage: 'Final', round: null }),
        game('d', { score: 'W.O.', walkover: true, result: 'win', opponent: 'Pumas' }),
      ],
      hasMore: true,
    });
    const html = page('/equipos/S1?tab=juegos');
    const t = text(html);
    expect(state.asked).toContain('games:S1');
    expect(html).toContain('aria-label="Partidos del equipo"');
    expect(t).toContain('Los Tigres vs Leones');
    expect(t).toContain('Liga Norte · Jornada 3');
    expect(t).toContain('2-1');
    // Del lado 2: el marcador se da vuelta (el equipo primero).
    expect(t).toContain('Los Tigres vs Halcones Liga Norte · Jornada 2 0-3');
    expect(t).toContain('Los Tigres vs Rival por definir Liga Norte · Final 1-1');
    expect(t).toContain('Liga Norte · Jornada 3 · W.O.');
    expect(t).not.toContain('W.O. W.O.');
    expect(html).toContain('href="/l/L1/juegos?partido=m-a"');
    expect(t).toContain('G Ganó');
    expect(t).toContain('P Perdió');
    expect(t).toContain('E Empató');
    expect(html).toContain('dateTime="2026-10-');
    expect(t).toContain('Ver más');
    // Vacío y cargando.
    state.games = paged<SquadGame>();
    expect(text(page('/equipos/S1?tab=juegos'))).toContain('Todavía no hay partidos');
    state.games = paged<SquadGame>({ loading: true });
    expect(page('/equipos/S1?tab=juegos')).toContain('class="skeleton');
  });

  it('Torneos: cada uno con la fecha y el récord, a su evento (o a la liga); sin torneos, lo dice', () => {
    state.squad = ok(full());
    state.stats = ok({
      record: rec(5, 0, 2),
      leagues: [],
      tournaments: [
        { leagueId: 'L1', eventId: 'E1', name: 'Copa de Verano', sport: 'football', date: '2026-08-15', record: rec(3, 0, 1) },
        { leagueId: 'T2', eventId: null, name: 'Torneo Relámpago', sport: 'football', date: null, record: rec(0, 0, 0) },
      ],
    });
    const html = page('/equipos/S1?tab=torneos');
    const t = text(html);
    expect(state.asked).toContain('stats:S1');
    expect(t).toContain('Copa de Verano');
    expect(t).toMatch(/15 .*2026 · 3 G · 1 P/);
    expect(t).toContain('Torneo Relámpago Sin partidos todavía');
    expect(html).toContain('href="/l/L1/e/E1"');
    expect(html).toContain('href="/l/T2"');
    state.stats = ok({ record: rec(0, 0, 0), leagues: [], tournaments: [] });
    expect(text(page('/equipos/S1?tab=torneos'))).toContain('Todavía no juega torneos');
  });

  it('Estadísticas: el récord total y cada liga con su récord por temporada', () => {
    state.squad = ok(
      full({
        leagues: [{ leagueId: 'L1', name: 'Liga Norte', sport: 'football', logo: null, status: 'approved', requestId: 'r1', record: rec(1, 0, 0) }],
      }),
    );
    state.stats = ok({
      record: rec(6, 1, 2),
      leagues: [
        {
          leagueId: 'L1',
          name: 'Liga Norte',
          kind: 'liga',
          sport: 'football',
          logo: null,
          record: rec(4, 1, 1),
          seasons: [
            { seasonId: 's2', name: 'Apertura 2026', record: rec(3, 1, 0) },
            { seasonId: 's1', name: 'Clausura 2025', record: rec(1, 0, 1) },
          ],
        },
        { leagueId: 'L9', name: 'Liga Vieja', kind: 'liga', sport: 'football', logo: null, record: rec(2, 0, 1), seasons: [] },
      ],
      tournaments: [],
    });
    const html = page('/equipos/S1?tab=estadisticas');
    const t = text(html);
    expect(t).toContain('Récord 9 Jugados 6 Ganados 1 Empatados 2 Perdidos 9 partidos · 67 % ganados');
    expect(t).toContain('Liga Norte 4 G · 1 E · 1 P Aceptado');
    expect(html).toContain('aria-label="Temporadas en Liga Norte"');
    expect(t).toContain('Apertura 2026 3 G · 1 E · 0 P');
    expect(t).toContain('Clausura 2025 1 G · 1 P');
    // Una liga que solo está en los números (sin solicitud a la vista).
    expect(t).toContain('Liga Vieja 2 G · 1 P');
    expect(html).toContain('href="/l/L9"');
    expect(t).toContain('Inscribir en una liga');
    // Sin los números todavía: el récord del equipo.
    state.stats = { data: null, loading: true, error: null };
    expect(text(page('/equipos/S1?tab=estadisticas'))).toContain('Récord 7 Jugados 5 Ganados 0 Empatados 2 Perdidos');
  });

  it('Estadísticas › Ligas (capitán): estado y récord de cada una, retirar, pasar miembros nuevos e «Inscribir en una liga»', () => {
    state.squad = ok(
      full({
        leagues: [
          { leagueId: 'L1', name: 'Liga Norte', sport: 'football', logo: null, status: 'approved', requestId: 'r1', record: { played: 4, won: 3, drawn: 1, lost: 0 } },
          { leagueId: 'L2', name: 'Liga Sur', sport: 'football', logo: null, status: 'pending', requestId: 'r2', record: { played: 0, won: 0, drawn: 0, lost: 0 } },
          { leagueId: 'L3', name: 'Copa Este', sport: 'football', logo: null, status: 'rejected', requestId: 'r3', record: { played: 0, won: 0, drawn: 0, lost: 0 } },
          { leagueId: 'L4', name: 'Liga Vieja', sport: 'football', logo: null, status: 'withdrawn', requestId: 'r4', record: { played: 0, won: 0, drawn: 0, lost: 0 } },
        ],
      }),
    );
    const html = page('/equipos/S1?tab=estadisticas');
    const t = text(html);
    expect(t).toContain('Liga Norte');
    expect(t).toContain('3 G · 1 E · 0 P');
    expect(t).toContain('Aceptado');
    expect(t).toContain('Pendiente');
    expect(t).toContain('Rechazado');
    expect(t).not.toContain('Liga Vieja');
    expect(t).toContain('Pasar miembros nuevos');
    expect(t).toContain('Retirar solicitud');
    expect(t).toContain('Inscribir en una liga');
    expect(html).toContain('href="/l/L1"');
    expect(t.indexOf('Liga Norte')).toBeLessThan(t.indexOf('Liga Sur'));
  });

  it('Estadísticas › Ligas (miembro): sin botones; sin ligas, lo dice; en otros deportes, «Pronto»', () => {
    state.squad = ok(asMember({ leagues: [{ leagueId: 'L2', name: 'Liga Sur', sport: 'football', logo: null, status: 'pending', requestId: 'r2', record: { played: 0, won: 0, drawn: 0, lost: 0 } }] }));
    let t = text(page('/equipos/S1?tab=estadisticas'));
    expect(t).toContain('Liga Sur');
    expect(t).not.toContain('Retirar solicitud');
    expect(t).not.toContain('Inscribir en una liga');
    state.squad = ok(full());
    t = text(page('/equipos/S1?tab=estadisticas'));
    expect(t).toContain('Todavía no juega en ninguna liga');
    expect(t).toContain('Inscríbelo en una liga de fútbol de campo');
    state.squad = ok(full({ sport: 'swimming' }));
    t = text(page('/equipos/S1?tab=estadisticas'));
    expect(t).toContain('Pronto podrás inscribir equipos de natación.');
    expect(t).not.toContain('Inscribir en una liga');
  });
});

describe('unirse con el código', () => {
  const join = (preview: SquadLite | null | undefined, uid: string | null = 'u1') =>
    bare(h(JoinSquadView, { code: 'K7M2PQ9X', preview, uid }), '/equipos/unirse/K7M2PQ9X');

  it('leyendo y un código que no sirve', () => {
    expect(join(undefined)).toContain('aria-label="Cargando"');
    const dead = join(null);
    expect(text(dead)).toContain('Esta invitación no sirve');
    expect(dead).toContain('href="/equipos"');
  });

  it('sin cuenta: el equipo y entrar (vuelve aquí)', () => {
    const html = join(lite('S1', { name: 'Los Tigres', city: 'Santiago' }), null);
    const t = text(html);
    expect(t).toContain('Te invitaron al equipo');
    expect(t).toContain('Los Tigres [TGR]');
    expect(t).toContain('Fútbol de campo · Santiago');
    expect(t).toContain('12 miembros');
    expect(t).toContain('Entra para unirte al equipo');
    expect(html).toContain('href="/login?modo=registro&amp;next=%2Fequipos%2Funirse%2FK7M2PQ9X"');
  });

  it('ya estás: «Ya estás en este equipo» con el link; si no, «Unirme al equipo»', () => {
    state.mine = ok([{ ...lite('S1'), role: 'member' }]);
    const html = join(lite('S1'));
    expect(text(html)).toContain('Ya estás en este equipo');
    expect(html).toContain('href="/equipos/S1"');
    expect(text(html)).not.toContain('Unirme al equipo');
    state.mine = ok([]);
    expect(text(join(lite('S1')))).toContain('Unirme al equipo');
    state.mine = { data: [], loading: true, error: null };
    expect(join(lite('S1'))).toContain('aria-label="Cargando"');
  });
});

describe('las hojas del capitán', () => {
  it('alguien de la plantilla: posición y número, la capitanía y sacarlo; uno mismo, solo posición y número', () => {
    const squad = full();
    const other = bare(h(SquadMemberSheet, { member: ROSTER[0]!, squad, viewer: 'captain', onClose: () => undefined }));
    const t = text(other);
    expect(t).toContain('Bruno');
    expect(other).toContain('value="Portero"');
    expect(other).toContain('value="1"');
    expect(t).toContain('Guardar posición y número');
    expect(t).toContain('Pasar la capitanía');
    expect(t).toContain('Sacar del equipo');
    expect(other).toContain('href="/u/u2"');
    const me = text(bare(h(SquadMemberSheet, { member: ROSTER[1]!, squad, viewer: 'captain', onClose: () => undefined })));
    expect(me).toContain('Ana (tú)');
    expect(me).toContain('Guardar posición y número');
    expect(me).not.toContain('Pasar la capitanía');
    expect(me).not.toContain('Sacar del equipo');
  });

  it('«Inscribir en una liga»: sin buscar, mis ligas de ese deporte (sin menores), con lo que ya pidió marcado', () => {
    state.leagues = [
      { id: 'L1', name: 'Liga Norte', sport: 'football', kind: 'liga', visibility: 'public', venue: 'Cancha 1', logoPath: null },
      { id: 'L2', name: 'Liga Sur', sport: 'football', kind: 'liga', visibility: 'private', venue: null, logoPath: null },
      { id: 'L3', name: 'Pádel Naco', sport: 'padel', kind: 'liga', visibility: 'public', venue: null, logoPath: null },
      { id: 'L4', name: 'Infantil', sport: 'football', kind: 'liga', visibility: 'public', venue: null, logoPath: null, hasMinors: true },
    ];
    const squad = full({ leagues: [{ leagueId: 'L2', name: 'Liga Sur', sport: 'football', logo: null, status: 'pending', requestId: 'r2', record: { played: 0, won: 0, drawn: 0, lost: 0 } }] });
    const html = bare(h(SquadLeagueSheet, { open: true, onClose: () => undefined, squad }));
    const t = text(html);
    expect(t).toContain('Inscribir en una liga');
    expect(t).toContain('Tus ligas de fútbol de campo');
    expect(t).toContain('Liga Norte');
    expect(t).toContain('Pedir');
    expect(t).toContain('Liga Sur');
    expect(t).toContain('Pendiente');
    expect(t).not.toContain('Pádel Naco');
    expect(t).not.toContain('Infantil');
    expect(html).toContain('placeholder="Nombre de la liga o lugar"');
    state.leagues = [];
    expect(text(bare(h(SquadLeagueSheet, { open: true, onClose: () => undefined, squad: full() })))).toContain('Todavía no estás en ninguna liga de fútbol de campo');
  });
});
