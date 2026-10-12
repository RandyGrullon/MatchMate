/**
 * Las pantallas de Equipos dibujadas sin navegador (renderToString) con datos de mentira: Equipos (sin cuenta, con lo
 * tuyo —también los de esports—, lo que sigues, sin nada y «Crear equipo» abierto con `?crear=1`), la hoja de crear (el
 * deporte, los datos y cuándo deja crear), la página del equipo (sin cuenta, capitán, miembro y quien no es miembro;
 * Plantilla, Muro y Ligas; «Invitar» con `?invitar=1`; no existe) y la pantalla de unirse con el código (leyendo, no
 * sirve, sin cuenta, ya estás y «Unirme»). Los menús y hojas cerradas no se dibujan: su lógica está en
 * src/components/squads/squads.test.ts.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Live } from '../../lib/data/client';
import type { EsportsTeam, TeamRole } from '../../lib/data/esports';
import type { Paged } from '../../lib/data/follows';
import type { Post } from '../../lib/data/posts';
import type { MySquad, SquadLite, SquadMember, SquadPage, SquadSearch } from '../../lib/data/squads';
import { FeedbackProvider } from '../../components/feedback';

const ok = <T,>(data: T): Live<T> => ({ data, loading: false, error: null });

const state = vi.hoisted(() => ({
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
const radios = (html: string) => [...html.matchAll(/role="radio" aria-checked="(true|false)"[^>]*>(?:<svg[^]*?<\/svg>)?([^<]*)</g)].map((m) => ({ on: m[1] === 'true', label: m[2] }));

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

  it('arriba, en su color: logo, nombre, tag, deporte, ciudad, «Busca jugadores» y miembros · seguidores · récord', () => {
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
    expect(t).toContain('3 miembros');
    expect(t).toContain('41 seguidores');
    expect(t).toContain('5 G · 2 P récord');
    expect(html).toContain('aria-label="Números del equipo"');
    expect(html).toContain('href="/equipos"');
  });

  it('capitán: «Invitar», «•••» y la plantilla que se toca (capitán primero, posición y número)', () => {
    state.squad = ok(full());
    const html = page('/equipos/S1');
    const t = text(html);
    expect(t).toContain('Invitar');
    expect(html).toContain('aria-label="Más opciones"');
    expect(html).not.toContain('aria-label="Seguir Los Tigres"');
    expect(radios(html)).toEqual([
      { on: true, label: 'Plantilla' },
      { on: false, label: 'Muro' },
      { on: false, label: 'Ligas' },
    ]);
    expect(t).toContain('Toca a alguien para su posición y número');
    expect(t.indexOf('Ana (tú)')).toBeLessThan(t.indexOf('Bruno'));
    expect(t).toContain('Capitán');
    expect(t).toContain('Portero · #1');
    expect(html).toContain('aria-label="Bruno: opciones"');
    expect(html).not.toContain('href="/u/u2"');
    // La hoja de invitar no está abierta.
    expect(t).not.toContain('Código del equipo');
  });

  it('?invitar=1 (capitán): el QR, el código, compartir y «Código nuevo»; a otro no se le abre', () => {
    state.squad = ok(full());
    const html = page('/equipos/S1?invitar=1');
    const t = text(html);
    expect(t).toContain('Invitar al equipo');
    expect(html).toContain('aria-label="Código QR de la invitación"');
    expect(t).toContain('K7M2PQ9X');
    expect(t).toContain('Código nuevo');
    expect(html).toContain('Copiar enlace');
    state.squad = ok(asMember());
    expect(text(page('/equipos/S1?invitar=1'))).not.toContain('Invitar al equipo');
  });

  it('miembro: sin «Invitar» ni Seguir, con «•••» (salir); la plantilla lleva a cada perfil', () => {
    state.squad = ok(asMember());
    const html = page('/equipos/S1');
    const t = text(html);
    expect(t).not.toContain('Invitar');
    expect(html).not.toContain('aria-label="Seguir Los Tigres"');
    expect(html).toContain('aria-label="Más opciones"');
    expect(html).toContain('href="/u/u2"');
    expect(html).not.toContain(': opciones');
    expect(t).not.toContain('Toca a alguien');
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

  it('sin cuenta: lo de arriba, Seguir y «Entra para ver la plantilla» (sin pestañas)', () => {
    state.auth = { user: null, loading: false };
    state.squad = ok(outsider({ roster: [] }));
    const html = page('/equipos/S1?tab=muro');
    const t = text(html);
    expect(t).toContain('Los Tigres');
    expect(html).toContain('aria-label="Seguir Los Tigres"');
    expect(t).toContain('Entra para ver la plantilla');
    expect(html).toContain('href="/login?next=%2Fequipos%2FS1%3Ftab%3Dmuro"');
    expect(radios(html)).toEqual([]);
  });

  it('Muro: los miembros publican; quien no es miembro solo lee; vacío, lo dice', () => {
    state.squad = ok(asMember());
    let t = text(page('/equipos/S1?tab=muro'));
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
    const html = page('/equipos/S1?tab=muro');
    t = text(html);
    expect(t).not.toContain('¿Qué cuenta el equipo?');
    expect(t).toContain('¡Ganamos!');
    // En su muro no se repite el equipo.
    expect(html).not.toContain('data-squad-chip');
    expect(radios(html).find((r) => r.on)?.label).toBe('Muro');
  });

  it('Ligas (capitán): estado y récord de cada una, retirar, pasar miembros nuevos e «Inscribir en una liga»', () => {
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
    const html = page('/equipos/S1?tab=ligas');
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

  it('Ligas (miembro): sin botones; sin ligas, lo dice; en otros deportes, «Pronto»', () => {
    state.squad = ok(asMember({ leagues: [{ leagueId: 'L2', name: 'Liga Sur', sport: 'football', logo: null, status: 'pending', requestId: 'r2', record: { played: 0, won: 0, drawn: 0, lost: 0 } }] }));
    let t = text(page('/equipos/S1?tab=ligas'));
    expect(t).toContain('Liga Sur');
    expect(t).not.toContain('Retirar solicitud');
    expect(t).not.toContain('Inscribir en una liga');
    state.squad = ok(full());
    t = text(page('/equipos/S1?tab=ligas'));
    expect(t).toContain('Todavía no juega en ninguna liga');
    expect(t).toContain('Inscríbelo en una liga de fútbol de campo');
    state.squad = ok(full({ sport: 'swimming' }));
    t = text(page('/equipos/S1?tab=ligas'));
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
