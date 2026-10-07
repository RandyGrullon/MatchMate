/**
 * Yo (`/perfil`) dibujado sin navegador, como final/6-perfil.png (Lite) y p6-perfil.png (Pro): arriba «Lite | Pro» y un
 * solo engranaje (la cuenta); tu nombre, tu @usuario y tu liga; en Lite tu promedio con cómo vas, los 3 números, Mis
 * bolas, Insignias y las filas Mis juegos y Amigos y seguidores (los seguidores ya no van en la cabecera); en Pro los 6
 * números, la tendencia, tus tiros y las filas. Las partes (`?tab=`) se abren con «‹ Yo».
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../lib/data/client';
import type { PublicProfile } from '../lib/data/follows';
import type { BowlingEvent, Entry, League, Member } from '../lib/types';

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u1' } as { uid: string } | null, loading: false, isSuper: false, profile: { username: 'anaperez' } as { username: string } | null },
  members: [] as Member[],
  leagues: [] as League[],
  profile: null as PublicProfile | null,
  pro: false,
}));

vi.mock('../lib/auth', async (orig) => ({
  ...(await orig<typeof import('../lib/auth')>()),
  useAuth: () => state.auth,
  displayName: () => 'Ana Pérez',
}));
vi.mock('../lib/data', async (orig) => ({
  ...(await orig<typeof import('../lib/data')>()),
  useMyMemberships: () => ({ data: state.members, loading: false, error: null }),
  useLeaguesByIds: () => ({ data: state.leagues, loading: false, error: null }),
}));
vi.mock('../lib/data/follows', async (orig) => ({
  ...(await orig<typeof import('../lib/data/follows')>()),
  usePublicProfile: () => ({ data: state.profile, loading: false, error: null }),
}));
vi.mock('../lib/data/solo', async (orig) => ({
  ...(await orig<typeof import('../lib/data/solo')>()),
  useMySoloSessions: () => ({ data: [], loading: false, error: null }),
}));
vi.mock('../lib/useMode', () => ({
  useIsPro: () => state.pro,
  useMode: () => ({ mode: state.pro ? 'pro' : 'lite', isPro: state.pro, setMode: async () => 'saved', suggestedPro: false }),
}));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const { default: ProfilePage, identityLine, socialLine, yoPart } = await import('./ProfilePage');

const render = (url = '/perfil') =>
  renderToString(h(MemoryRouter, { initialEntries: [url] }, h(Routes, null, h(Route, { path: '/perfil', element: h(ProfilePage) }))));
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

const league = (id: string, name: string, sport = 'bowling'): League =>
  ({ id, name, kind: 'liga', visibility: 'private', sport, logoPath: null }) as unknown as League;
const member = (lid: string, playerId: string | null = 'p1'): Member => ({ id: `${lid}_u1`, leagueId: lid, uid: 'u1', name: 'Ana', role: 'member', playerId });
const ev = (id: string, date: string): BowlingEvent => ({ id, type: 'practica', name: '', date, games: 4, hcpBase: 0, hcpPercent: 0, teams: {}, playerCount: 6 });
const en = (eventId: string, scores: number[]): Entry =>
  ({ id: `en-${eventId}`, eventId, playerId: 'p1', teamId: null, average: 0, handicapOverride: null, scores, photos: scores.map(() => 'f') }) as Entry;
const pub = (extra: Partial<PublicProfile> = {}): PublicProfile => ({
  id: 'u1',
  name: 'Ana Pérez',
  username: 'anaperez',
  since: '2026-10-01T00:00:00Z',
  sports: ['bowling'],
  followers: 0,
  following: 0,
  likesReceived: 0,
  gamesCount: 9,
  isFollowing: false,
  followsYou: false,
  isMe: true,
  ...extra,
});

beforeEach(() => {
  state.auth = { user: { uid: 'u1' }, loading: false, isSuper: false, profile: { username: 'anaperez' } };
  state.members = [member('bol')];
  state.leagues = [league('bol', 'Liga de los martes')];
  state.profile = pub();
  state.pro = false;
  // Los de final/6-perfil.png: 199 176 192 | 199 181 214 | 187 210.
  queryClient.setQueryData('across:bol:p1', [
    {
      lid: 'bol',
      playerId: 'p1',
      events: [ev('e1', '2026-09-29'), ev('e2', '2026-10-06'), ev('e3', '2026-10-07')],
      entries: [en('e1', [199, 176, 192]), en('e2', [199, 181, 214]), en('e3', [187, 210])],
    },
  ]);
});
afterEach(() => queryClient.invalidateAll());

describe('Yo en Lite', () => {
  it('arriba «Lite | Pro» y un solo engranaje; tu nombre, @usuario y liga; sin seguidores ni «Editar perfil» en la cabecera', () => {
    const html = render();
    const t = text(html);
    expect(html).toContain('role="radiogroup" aria-label="Cómo ver la app"');
    expect(html).toMatch(/aria-checked="true"[^>]*>.*?Lite<\/button>/);
    expect(html.match(/aria-label="Configuración de la cuenta"/g)).toHaveLength(1);
    expect(html).toContain('href="/cuenta"');
    expect(t).toContain('AP Ana Pérez');
    expect(t).toContain('@anaperez · Liga de los martes');
    expect(t).not.toContain('Editar perfil');
    expect(t).not.toContain('Siguiendo');
    expect(t).not.toContain('En MatchMate desde');
  });

  it('tu promedio con cómo vas y Mejor juego · Mejor serie · Juegos; Mis bolas, Insignias y las filas', () => {
    const html = render();
    const t = text(html);
    // (199 + 176 + 192 + 199 + 181 + 214 + 187 + 210) / 8 = 194.75.
    expect(t).toContain('Tu promedio 194');
    // Cómo vas: octubre (198.2) contra septiembre (189), como la Tendencia de Pro (+9.2).
    expect(t).toContain('+9 en octubre');
    expect(t).toContain('Mejor juego 214');
    expect(t).toContain('Mejor serie 594');
    expect(t).toContain('Juegos 8');
    expect(t).toContain('Mis bolas');
    expect(t).toContain('Agrega tu bola');
    expect(t).toContain('Mis juegos Prácticas, torneos y sueltos');
    expect(t).toContain('Amigos y seguidores Buscar personas');
    // Sin seguidores todavía, la fila busca personas.
    expect(html).toContain('href="/buscar"');
    // Lo de Pro no sale.
    expect(t).not.toContain('Tendencia');
    expect(t).not.toContain('Tus tiros');
    expect(t).not.toContain('Por liga y temporada');
  });

  it('con seguidores, la fila los cuenta y abre la lista', () => {
    state.profile = pub({ followers: 3, following: 1, likesReceived: 5 });
    const html = render();
    expect(text(html)).toContain('Amigos y seguidores 3 seguidores · 1 siguiendo · 5 me gusta');
    expect(html).not.toContain('href="/buscar"');
  });

  it('solo otros deportes: sin números del boliche, con tus ligas (cada una a sus números)', () => {
    state.members = [member('pad', null)];
    state.leagues = [league('pad', 'Pádel Club', 'padel')];
    const html = render();
    const t = text(html);
    expect(t).not.toContain('Tu promedio');
    expect(t).not.toContain('Mis bolas');
    expect(t).toContain('Mis ligas');
    expect(html).toContain('href="/l/pad/perfil"');
  });
});

describe('Yo en Pro', () => {
  it('los 6 números, la tendencia, tus tiros y las filas (Por liga y temporada, Mis juegos, Insignias, Amigos)', () => {
    state.pro = true;
    const html = render();
    const t = text(html);
    expect(html).toMatch(/aria-checked="true"[^>]*>.*?Pro<\/button>/);
    for (const s of ['Promedio', 'Mejor juego', 'Mejor serie', 'Juegos', 'Hcp', 'Asistencia']) expect(t).toContain(s);
    expect(t).toContain('3/3');
    expect(t).toContain('Tendencia');
    expect(t).toContain('214 mejor');
    expect(t).toContain('Septiembre');
    expect(t).toContain('Tus tiros');
    expect(t).toContain('Anota tus juegos con Teclado');
    expect(t).toContain('Por liga y temporada');
    expect(t).toContain('Mis juegos');
    expect(t).toContain('Insignias');
    expect(t).toContain('Amigos y seguidores');
    // Sin bolas, una fila para agregar la primera.
    expect(t).toContain('Mis bolas Agrega tu bola');
    expect(t).not.toContain('Tu promedio');
  });
});

describe('las partes de Yo', () => {
  it('Mis juegos: «‹ Yo», el título y los juegos sueltos arriba', () => {
    const html = render('/perfil?tab=juegos');
    const t = text(html);
    expect(t).toContain('Yo Mis juegos');
    expect(html).toContain('href="/perfil"');
    expect(html).toContain('href="/juegos-sueltos"');
    expect(t).not.toContain('Tu promedio');
  });

  it('Por liga y temporada: todo junto, por liga y por año', () => {
    const t = text(render('/perfil?tab=estadisticas'));
    expect(t).toContain('Por liga y temporada');
    expect(t).toContain('Todo junto');
    expect(t).toContain('Liga de los martes');
    expect(t).toContain('Por año');
  });

  it('Insignias: la vitrina (la del push, `?tab=insignias&insignia=…`)', () => {
    const t = text(render('/perfil?tab=insignias&insignia=a1'));
    expect(t).toContain('Yo Insignias');
  });

  it('sin cuenta: entrar o crear la cuenta y volver aquí', () => {
    state.auth = { user: null, loading: false, isSuper: false, profile: null };
    const html = render('/perfil?tab=insignias');
    expect(text(html)).toContain('Tu perfil de jugador');
    expect(html).toContain('href="/login?next=%2Fperfil%3Ftab%3Dinsignias"');
  });
});

describe('las cuentas de Yo', () => {
  it('«@usuario · tu liga» (la de más juegos; «y N más» con otras)', () => {
    const leagues = [league('a', 'Liga A'), league('b', 'Liga B')];
    expect(identityLine('anaperez', [leagues[0]])).toBe('@anaperez · Liga A');
    expect(identityLine('anaperez', leagues, 'b')).toBe('@anaperez · Liga B y 1 más');
    expect(identityLine('', [])).toBeNull();
    expect(identityLine(null, [leagues[0]])).toBe('Liga A');
  });

  it('la fila de amigos y la parte del link', () => {
    expect(socialLine(null)).toBe('Buscar personas');
    expect(socialLine({ followers: 1, following: 0, likesReceived: 0 })).toBe('1 seguidor · 0 siguiendo');
    expect(yoPart('insignias')).toBe('insignias');
    expect(yoPart('estadisticas')).toBe('estadisticas');
    expect(yoPart('otra')).toBeNull();
  });
});
