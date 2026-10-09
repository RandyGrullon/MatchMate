/**
 * La lupa (/buscar) dibujada sin navegador (renderToString) con resultados de mentira: Todo · Personas · Ligas (`?ver=`),
 * con la caja vacía (a quién sigues, qué ligas sigues y las búsquedas recientes), una búsqueda con y sin resultados
 * (hasta 5 de cada una en «Todo», con «Ver todas»), una sola letra, cargando, el error y sin cuenta (las ligas públicas
 * y, para personas, entrar).
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeagueHit, LeagueSearch } from '../lib/data/leagueSocial';
import type { PublicLeague } from '../lib/data/leagues';
import type { PeopleLive, PersonHit } from '../lib/data/people';
import { AVATAR_BUCKET, primePublicUrl } from '../lib/publicImages';
import { FeedbackProvider } from '../components/feedback';
import { pushRecent, readRecent, recentKey, RECENT_MAX, writeRecent } from '../components/search/recentSearches';
import { leagueResultLine } from '../components/search/SearchRows';

type LiveList<T> = { data: T[]; loading: boolean; error: Error | null };

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u1' } as { uid: string } | null, loading: false },
  people: {} as Partial<PeopleLive>,
  leagues: {} as Partial<LeagueSearch>,
  followed: {} as Partial<LiveList<LeagueHit>>,
  publics: {} as Partial<LiveList<PublicLeague>>,
  askedPeople: [] as string[],
  askedLeagues: [] as { query: string; enabled: boolean }[],
  askedPublic: [] as { query?: string; enabled?: boolean }[],
}));

vi.mock('../lib/auth', () => ({ useAuth: () => state.auth }));
vi.mock('../lib/data/people', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/data/people')>()),
  usePeople: (query: string) => {
    state.askedPeople.push(query);
    return { data: [], loading: false, error: null, settled: true, query, ...state.people };
  },
}));
vi.mock('../lib/data/leagueSocial', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/data/leagueSocial')>()),
  useLeagueSearch: (query: string, enabled = true) => {
    state.askedLeagues.push({ query, enabled });
    return { data: [], loading: false, error: null, settled: true, ...(enabled ? state.leagues : {}) };
  },
  useFollowedLeagues: () => ({ data: [], loading: false, error: null, ...state.followed }),
}));
vi.mock('../lib/data/leagues', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/data/leagues')>()),
  usePublicLeagues: (q: { query?: string; enabled?: boolean } = {}) => {
    state.askedPublic.push(q);
    return { data: [], loading: false, error: null, ...(q.enabled === false ? {} : state.publics) };
  },
}));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const { default: SearchPage } = await import('./SearchPage');

const hit = (id: string, extra: Partial<PersonHit> = {}): PersonHit => ({
  id,
  name: `Persona ${id}`,
  username: `persona_${id}`,
  isFollowing: false,
  followsYou: false,
  inLeague: false,
  invited: false,
  ...extra,
});

const lhit = (id: string, extra: Partial<LeagueHit> = {}): LeagueHit => ({
  id,
  name: `Liga ${id}`,
  sport: 'bowling',
  kind: 'liga',
  visibility: 'public',
  venue: 'Bolera Sambil',
  logo: null,
  members: 12,
  followers: 3,
  isMember: false,
  isFollowing: false,
  ...extra,
});

const pub = (id: string, extra: Partial<PublicLeague> = {}): PublicLeague =>
  ({
    id,
    name: `Pública ${id}`,
    kind: 'liga',
    visibility: 'public',
    sport: 'padel',
    venue: 'Club Naco',
    logoPath: null,
    members: 8,
    players: 8,
    activity: 2,
    nextEventAt: null,
    nextEventDate: null,
    lastActivityAt: null,
    ...extra,
  }) as PublicLeague;

const render = (url = '/buscar') => renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(SearchPage))));
const text = (html: string) =>
  html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
const rowsOf = (html: string) => html.match(/class="mm-row /g)?.length ?? 0;
const checked = (html: string) => /role="radio" aria-checked="true"[^>]*>([^<]*)</.exec(html)?.[1];

const store = new Map<string, string>();
const memoryStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};

beforeEach(() => {
  state.auth = { user: { uid: 'u1' }, loading: false };
  state.people = {};
  state.leagues = {};
  state.followed = {};
  state.publics = {};
  state.askedPeople = [];
  state.askedLeagues = [];
  state.askedPublic = [];
  store.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('la lupa con la caja vacía', () => {
  it('«‹ Social», «Buscar», la caja, Todo · Personas · Ligas; las personas y las ligas que sigues', () => {
    state.people = { data: [hit('a', { isFollowing: true, followsYou: true }), hit('b', { isFollowing: true })] };
    state.followed = { data: [lhit('L1', { isFollowing: true })] };
    const out = render();
    const t = text(out);
    expect(t).toContain('Social');
    expect(out).toContain('<h1 class="text-title break-words">Buscar</h1>');
    expect(out).toContain('placeholder="Personas o ligas"');
    expect(out).toContain('autofocus=""');
    expect(out).toContain('role="search"');
    expect(out.match(/role="radio"/g)).toHaveLength(3);
    expect(t).toMatch(/Todo .*Personas .*Ligas/);
    expect(checked(out)).toBe('Todo');
    // Personas que sigues: la fila con su @usuario y «Te sigue», Seguir al lado.
    expect(out).toContain('class="text-section">Personas que sigues');
    expect(t).toContain('@persona_a · Te sigue');
    expect(t).toContain('Siguiendo');
    expect(out).toContain('href="/u/a"');
    // Ligas que sigues, después.
    expect(t.indexOf('Personas que sigues')).toBeLessThan(t.indexOf('Ligas que sigues'));
    expect(t).toContain('Liga L1');
    expect(t).toContain('Liga · Boliche · Bolera Sambil · 12 miembros');
    expect(out).toContain('href="/l/L1"');
    expect(out).toContain('aria-label="Dejar de seguir Liga L1"');
    expect(rowsOf(out)).toBe(3);
    expect(state.askedPeople).toContain('');
    expect(t).not.toContain('Búsquedas recientes');
  });

  it('sin seguir a nadie ni a ninguna liga todavía', () => {
    const t = text(render());
    expect(t).toContain('Aún no sigues a nadie');
    expect(t).toContain('Búscalos por su nombre o @usuario arriba.');
    expect(t).toContain('Aún no sigues ninguna liga');
    expect(t).toContain('Sigue una liga pública y sus publicaciones salen en Social.');
  });

  it('las búsquedas recientes (las de la cuenta) como chips, con «Borrar»; con algo escrito no salen', () => {
    vi.stubGlobal('localStorage', memoryStorage);
    store.set(recentKey('u1'), JSON.stringify(['ana', 'Liga del martes']));
    store.set(recentKey('otra'), JSON.stringify(['de otra cuenta']));
    let out = render();
    let t = text(out);
    expect(t).toContain('Búsquedas recientes');
    expect(out).toContain('aria-label="Borrar las búsquedas recientes"');
    expect(t.indexOf('ana')).toBeLessThan(t.indexOf('Liga del martes'));
    expect(t).not.toContain('de otra cuenta');
    expect(t.indexOf('Búsquedas recientes')).toBeLessThan(t.indexOf('Personas que sigues'));
    out = render('/buscar?q=pedro');
    t = text(out);
    expect(t).not.toContain('Búsquedas recientes');
  });

  it('sin dónde guardar (sin localStorage) la pantalla sale igual, sin chips', () => {
    expect(() => render()).not.toThrow();
    expect(text(render())).not.toContain('Búsquedas recientes');
  });
});

describe('buscar', () => {
  it('«Todo»: hasta 5 personas y 5 ligas, con «Ver todas» solo donde hay más', () => {
    state.people = { data: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => hit(id)) };
    state.leagues = {
      data: [
        lhit('M', { isMember: true }),
        lhit('P', { name: 'Pádel Naco', sport: 'padel', venue: 'Club Naco', members: 1 }),
        lhit('T', { kind: 'torneo', visibility: 'private', isMember: true, venue: null, members: 0 }),
      ],
    };
    const out = render('/buscar?q=pers');
    const t = text(out);
    expect(out).toContain('value="pers"');
    expect(state.askedPeople).toContain('pers');
    expect(state.askedLeagues).toContainEqual({ query: 'pers', enabled: true });
    expect(t).not.toContain('Personas que sigues');
    expect(out).toContain('class="text-section">Personas');
    expect(out).toContain('class="text-section">Ligas');
    // 5 de las 7 personas y las 3 ligas.
    expect(rowsOf(out)).toBe(8);
    expect(t).toContain('Persona e');
    expect(t).not.toContain('Persona f');
    expect(out.match(/>Ver todas</g)).toHaveLength(1);
    expect(out).toContain('aria-label="Ver todas las personas"');
    // Miembro: «Tu liga» (o «Tu torneo»); pública sin ser miembro: Seguir; privada: nada.
    expect(t).toContain('Tu liga');
    expect(t).toContain('Tu torneo');
    expect(out).toContain('aria-label="Seguir Pádel Naco"');
    expect(out).not.toContain('Seguir Liga M');
    expect(t).toContain('Liga · Pádel · Club Naco · 1 miembro');
    expect(t).toContain('Torneo · Boliche');
    expect(out).toContain('href="/l/P"');
  });

  it('«Personas» (?ver=personas): todas las personas y nada de ligas', () => {
    state.people = { data: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => hit(id)) };
    state.leagues = { data: [lhit('L1')] };
    const out = render('/buscar?q=pers&ver=personas');
    expect(checked(out)).toBe('Personas');
    expect(rowsOf(out)).toBe(7);
    expect(text(out)).not.toContain('Liga L1');
    expect(out).not.toContain('Ver todas');
    expect(out).not.toContain('class="text-section">Personas');
  });

  it('«Ligas» (?ver=ligas): todas las ligas y nada de personas', () => {
    state.people = { data: [hit('a')] };
    state.leagues = { data: ['1', '2', '3', '4', '5', '6'].map((id) => lhit(id)) };
    const out = render('/buscar?q=liga&ver=ligas');
    expect(checked(out)).toBe('Ligas');
    expect(rowsOf(out)).toBe(6);
    expect(text(out)).not.toContain('Persona a');
    expect(out).not.toContain('Ver todas');
  });

  it('con @ es un usuario: en «Todo» solo personas (no pregunta por ligas)', () => {
    state.people = { data: [hit('a')] };
    state.leagues = { data: [lhit('L1')] };
    const out = render('/buscar?q=%40pers');
    expect(out).toContain('value="@pers"');
    expect(state.askedPeople).toContain('@pers');
    expect(state.askedLeagues.every((a) => !a.enabled)).toBe(true);
    expect(text(out)).not.toContain('Liga L1');
    expect(text(out)).toContain('@persona_a');
  });

  it('la foto de perfil de cada persona (si tiene)', () => {
    primePublicUrl(AVATAR_BUCKET, 'a/foto.webp', 'https://img.test/a.webp');
    state.people = { data: [hit('a', { avatar: 'a/foto.webp' }), hit('b')] };
    const out = render('/buscar?q=pers&ver=personas');
    expect(out).toContain('src="https://img.test/a.webp"');
    // Sin foto, las iniciales.
    expect(out).toContain('>PB<');
  });
});

describe('vacíos, una letra, cargando y errores', () => {
  it('nada de nada en «Todo»; en cada filtro, su vacío; en «Todo» con una lista vacía, una línea', () => {
    expect(text(render('/buscar?q=zz'))).toContain('No encontramos nada con «zz»');
    expect(text(render('/buscar?q=zz&ver=personas'))).toContain('No encontramos a nadie con «zz»');
    expect(text(render('/buscar?q=zz&ver=ligas'))).toContain('No encontramos ligas con «zz»');
    state.leagues = { data: [lhit('L1')] };
    const t = text(render('/buscar?q=zz'));
    expect(t).toContain('Ninguna persona con «zz».');
    expect(t).toContain('Liga L1');
    expect(t).not.toContain('No encontramos nada');
  });

  it('una sola letra: pide al menos 2', () => {
    const t = text(render('/buscar?q=z'));
    expect(t).toContain('Escribe al menos 2 letras para buscar.');
    expect(t).not.toContain('No encontramos');
  });

  it('cargando: la forma de la lista; mientras escribe, la lista de antes más clara', () => {
    state.people = { loading: true };
    state.leagues = { loading: true };
    expect(render('/buscar?q=zz')).toContain('class="skeleton');
    state.people = { data: [hit('a')], settled: false };
    state.leagues = { data: [lhit('L1')] };
    const out = render('/buscar?q=zz');
    expect(out).toContain('opacity-60');
    expect(out).toContain('aria-busy="true"');
  });

  it('si falla: el aviso con «Reintentar» (sin tapar la otra lista)', () => {
    state.people = { error: new Error('red') };
    state.leagues = { data: [lhit('L1')] };
    const t = text(render('/buscar?q=zz'));
    expect(t).toContain('No se pudieron cargar los datos');
    expect(t).toContain('Reintentar');
    expect(t).toContain('Liga L1');
  });
});

describe('sin cuenta', () => {
  beforeEach(() => {
    state.auth = { user: null, loading: false };
  });

  it('«Todo»: las ligas públicas (con Seguir) y, para personas, entrar (vuelve a /buscar)', () => {
    state.publics = { data: [pub('P1')] };
    const out = render();
    const t = text(out);
    expect(t).toContain('Ligas públicas');
    expect(t).toContain('Pública P1');
    expect(t).toContain('Liga · Pádel · Club Naco · 8 miembros');
    expect(out).toContain('href="/l/P1"');
    expect(out).toContain('aria-label="Seguir Pública P1"');
    expect(t).toContain('Entra para buscar personas');
    expect(out).toContain('href="/login?next=%2Fbuscar"');
    expect(out).toContain('href="/login?modo=registro&amp;next=%2Fbuscar"');
    expect(t.indexOf('Pública P1')).toBeLessThan(t.indexOf('Entra para buscar personas'));
    expect(state.askedPublic.some((q) => q.enabled === true && q.query === '')).toBe(true);
    expect(t).not.toContain('Personas que sigues');
  });

  it('buscando: las públicas con ese nombre o lugar; sin ninguna, lo dice', () => {
    state.publics = { data: [pub('P1')] };
    render('/buscar?q=Naco');
    expect(state.askedPublic.some((q) => q.enabled === true && q.query === 'naco')).toBe(true);
    state.publics = {};
    const t = text(render('/buscar?q=zz&ver=ligas'));
    expect(t).toContain('No encontramos ligas con «zz»');
    expect(t).not.toContain('Entra para buscar personas');
  });

  it('«Personas»: solo entrar (vuelve con el filtro)', () => {
    state.publics = { data: [pub('P1')] };
    const out = render('/buscar?ver=personas');
    expect(text(out)).toContain('Entra para buscar personas');
    expect(text(out)).not.toContain('Pública P1');
    expect(out).toContain('href="/login?next=%2Fbuscar%3Fver%3Dpersonas"');
  });
});

describe('las búsquedas recientes', () => {
  it('la nueva primero, sin repetir (sin mirar mayúsculas), hasta 6; muy corta no cuenta', () => {
    expect(pushRecent(['ana', 'pedro'], 'Pedro')).toEqual(['Pedro', 'ana']);
    expect(pushRecent([], '  liga   del  martes ')).toEqual(['liga del martes']);
    expect(pushRecent(['ana'], 'a')).toEqual(['ana']);
    expect(pushRecent(['ana'], '@')).toEqual(['ana']);
    expect(pushRecent(['1', '2', '3', '4', '5', '6'].map((n) => `busca ${n}`), 'nueva')).toHaveLength(RECENT_MAX);
    expect(pushRecent(['1', '2', '3', '4', '5', '6'].map((n) => `busca ${n}`), 'nueva')[0]).toBe('nueva');
  });

  it('lo guardado se lee con cuidado (dañado o sin localStorage: vacío) y vaciar lo borra', () => {
    expect(readRecent('u1')).toEqual([]);
    writeRecent('u1', ['ana']);
    vi.stubGlobal('localStorage', memoryStorage);
    store.set(recentKey('u1'), '{no es json');
    expect(readRecent('u1')).toEqual([]);
    store.set(recentKey('u1'), JSON.stringify(['ana', 3, 'Ana', ' pedro ']));
    expect(readRecent('u1')).toEqual(['ana', 'pedro']);
    writeRecent('u1', []);
    expect(store.has(recentKey('u1'))).toBe(false);
    writeRecent(null, ['liga']);
    expect(store.get(recentKey(null))).toBe('["liga"]');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    });
    expect(readRecent('u1')).toEqual([]);
    expect(() => writeRecent('u1', ['x'])).not.toThrow();
  });
});

describe('la línea de una liga', () => {
  it('«Liga · Deporte · lugar · N miembros», sin lo que falta', () => {
    expect(leagueResultLine(lhit('x'))).toBe('Liga · Boliche · Bolera Sambil · 12 miembros');
    expect(leagueResultLine(lhit('x', { kind: 'torneo', sport: 'nada', venue: '  ', members: 0 }))).toBe('Torneo');
  });
});
