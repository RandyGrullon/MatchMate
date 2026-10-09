/**
 * El perfil de otra cuenta (/u/:id) dibujado sin navegador (renderToString): sin cuenta, cargando, no encontrado y el
 * perfil (rediseño: «‹ Atrás» con Reportar y «•••» (Bloquear), su foto o iniciales, nombre y «@usuario · deportes ·
 * desde», su biografía, un solo Seguir, los 4 números en una tarjeta y «Publicaciones | Juegos | Estadísticas |
 * Insignias»), y bloqueada: «Bloqueaste a …» con «Desbloquear» en vez de sus publicaciones y sus juegos.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicProfile } from '../lib/data/follows';
import { AVATAR_BUCKET, primePublicUrl } from '../lib/publicImages';
import { FeedbackProvider } from '../components/feedback';

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u1' } as { uid: string } | null, loading: false },
  profile: { data: null as unknown, loading: false, error: null as Error | null },
  pro: false,
}));

vi.mock('../lib/auth', () => ({ useAuth: () => state.auth }));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: unknown }) => children }));
vi.mock('../lib/useMode', () => ({
  useIsPro: () => state.pro,
  useMode: () => ({ mode: state.pro ? 'pro' : 'lite', isPro: state.pro, setMode: async () => 'saved', suggestedPro: false }),
}));
vi.mock('../lib/data/follows', async (orig) => ({
  ...(await orig<typeof import('../lib/data/follows')>()),
  usePublicProfile: () => state.profile,
}));
// Las publicaciones se pintan en src/components/posts (con sus propias pruebas): aquí solo dónde van.
vi.mock('../components/posts/PostList', () => ({
  PostList: ({ list, empty }: { list: { data: unknown[] }; empty?: ReactNode }) => (list.data.length ? h('div', { 'data-posts': list.data.length }) : (empty ?? null)),
}));
vi.mock('../lib/data/profileGames', async (orig) => ({
  ...(await orig<typeof import('../lib/data/profileGames')>()),
  useProfileGames: () => ({ data: [], loading: false, error: null, hasMore: false, more: () => undefined }),
  useProfileStats: () => ({ data: null, loading: false, error: null }),
}));

const { default: UserProfilePage, profileLine, profileTab } = await import('./UserProfilePage');

const profile = (extra: Partial<PublicProfile> = {}): PublicProfile => ({
  id: 'u2',
  name: 'Admin Local',
  username: 'adminlocal',
  since: '2026-10-01T12:00:00Z',
  sports: ['bowling', 'padel'],
  followers: 3,
  following: 1,
  likesReceived: 5,
  gamesCount: 0,
  isFollowing: false,
  followsYou: true,
  isMe: false,
  ...extra,
});

const render = (url = '/u/u2') =>
  renderToString(
    h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(Routes, null, h(Route, { path: '/u/:userId', element: h(UserProfilePage) })))),
  );
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

beforeEach(() => {
  state.auth = { user: { uid: 'u1' }, loading: false };
  state.profile = { data: profile(), loading: false, error: null };
  state.pro = false;
});

describe('perfil de otra cuenta', () => {
  it('sin cuenta: Entrar y Crear cuenta vuelven al perfil', () => {
    state.auth = { user: null, loading: false };
    const out = render('/u/u2?tab=insignias');
    expect(text(out)).toContain('Entra para ver este perfil');
    expect(out).toContain('href="/login?next=%2Fu%2Fu2%3Ftab%3Dinsignias"');
    expect(out).toContain('href="/login?modo=registro&amp;next=%2Fu%2Fu2%3Ftab%3Dinsignias"');
  });

  it('el perfil: atrás, reportar y «•••», quién es, un solo Seguir, los 4 números y las 4 partes (Publicaciones primero)', () => {
    const out = render();
    const t = text(out);
    expect(t).toContain('Atrás');
    expect(out).toContain('aria-label="Reportar esta cuenta"');
    expect(out).toContain('aria-label="Más opciones"');
    expect(t).toContain('Admin Local');
    expect(t).toContain('@adminlocal · Boliche y pádel · Desde octubre de 2026');
    expect(t).toContain('Te sigue');
    expect(t).toContain('Seguir también');
    expect(t).toContain('0 Publicaciones');
    expect(t).toContain('3 Seguidores');
    expect(t).toContain('1 Siguiendo');
    expect(t).toContain('5 Me gusta');
    // Cuatro partes (más de 3: pestañas); sin nada en la dirección, Publicaciones.
    expect(out).toMatch(/role="tab" aria-selected="true"[^>]*>Publicaciones/);
    expect(t.indexOf('Publicaciones Juegos Estadísticas Insignias')).toBeGreaterThan(-1);
    expect(t).toContain('Todavía no hay publicaciones');
    expect(t).toContain('Cuando Admin publique algo que puedas ver, sale aquí.');
    // Sin foto: sus iniciales. Sin el degradado de la cabecera.
    expect(t).toContain('AL Admin Local');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('bg-gradient-to-br');
  });

  it('?tab=juegos, ?tab=estadisticas e ?tab=insignias abren esas partes', () => {
    expect(render('/u/u2?tab=juegos')).toMatch(/role="tab" aria-selected="true"[^>]*>Juegos/);
    expect(render('/u/u2?tab=estadisticas')).toMatch(/role="tab" aria-selected="true"[^>]*>Estadísticas/);
    expect(render('/u/u2?tab=insignias')).toMatch(/role="tab" aria-selected="true"[^>]*>Insignias/);
    expect(text(render('/u/u2?tab=juegos'))).not.toContain('Todavía no hay publicaciones');
  });

  it('su foto, su biografía y cuántas publicaciones puedes ver', () => {
    primePublicUrl(AVATAR_BUCKET, 'u2/cara.webp', 'https://img.test/u2/cara.webp');
    state.profile = { data: profile({ avatar: 'u2/cara.webp', bio: 'Pádel los martes, boliche los jueves.', posts: 1 }), loading: false, error: null };
    const out = render();
    const t = text(out);
    expect(out).toContain('src="https://img.test/u2/cara.webp"');
    expect(t).toContain('Pádel los martes, boliche los jueves.');
    expect(t).toContain('1 Publicación');
  });

  it('bloqueada: «Bloqueaste a …» con «Desbloquear», sin Seguir, sin sus publicaciones ni sus juegos', () => {
    state.profile = { data: profile({ blockedByMe: true, bio: 'Hola', followsYou: false, posts: 3 }), loading: false, error: null };
    const out = render();
    const t = text(out);
    expect(t).toContain('Bloqueaste a Admin Local');
    expect(t).toContain('Desbloquear');
    expect(t).not.toContain('Seguir');
    expect(out).not.toContain('role="tablist"');
    expect(t).not.toContain('Todavía no hay publicaciones');
    expect(t).not.toContain('Hola');
    // Reportar y «•••» siguen arriba.
    expect(out).toContain('aria-label="Reportar esta cuenta"');
    expect(out).toContain('aria-label="Más opciones"');
  });

  it('no encontrado y cargando', () => {
    state.profile = { data: null, loading: false, error: null };
    expect(text(render())).toContain('No encontramos este perfil');
    state.profile = { data: null, loading: true, error: null };
    expect(render()).toContain('aria-label="Cargando perfil"');
  });

  it('la línea y la parte de la dirección', () => {
    expect(profileLine({ username: 'ana', sports: ['bowling'], since: null })).toBe('@ana · Boliche');
    expect(profileLine({ username: '', sports: [], since: null })).toBe('');
    expect(profileTab('insignias')).toBe('insignias');
    expect(profileTab('juegos')).toBe('juegos');
    expect(profileTab('otra')).toBe('publicaciones');
    expect(profileTab(null)).toBe('publicaciones');
  });
});
