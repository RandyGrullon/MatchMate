/**
 * El perfil de otra cuenta (/u/:id) dibujado sin navegador (renderToString): sin cuenta, cargando, no encontrado y el
 * perfil (rediseño: «‹ Atrás» con Reportar, iniciales, nombre y «@usuario · deportes · desde», un solo Seguir, los 3
 * números en una tarjeta y «Juegos | Estadísticas | Insignias»).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicProfile } from '../lib/data/follows';
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

  it('el perfil: atrás y reportar, quién es, un solo Seguir, los 3 números y las 3 partes', () => {
    const out = render();
    const t = text(out);
    expect(t).toContain('Atrás');
    expect(out).toContain('aria-label="Reportar esta cuenta"');
    expect(t).toContain('Admin Local');
    expect(t).toContain('@adminlocal · Boliche y pádel · Desde octubre de 2026');
    expect(t).toContain('Te sigue');
    expect(t).toContain('Seguir también');
    expect(t).toContain('3 Seguidores');
    expect(t).toContain('1 Siguiendo');
    expect(t).toContain('5 Me gusta');
    expect(out).toMatch(/role="radio" aria-checked="true"[^>]*>Juegos/);
    expect(t).toContain('Estadísticas');
    expect(t).toContain('Insignias');
    // Sin las pestañas viejas ni el degradado de la cabecera.
    expect(out).not.toContain('role="tablist"');
    expect(out).not.toContain('bg-gradient-to-br');
  });

  it('?tab=estadisticas abre esa parte', () => {
    expect(render('/u/u2?tab=estadisticas')).toMatch(/role="radio" aria-checked="true"[^>]*>Estadísticas/);
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
    expect(profileTab('otra')).toBe('juegos');
  });
});
