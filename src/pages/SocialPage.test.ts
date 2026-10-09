/**
 * Social (/social) dibujada sin navegador (renderToString): sin cuenta, el título con la lupa, «¿Qué jugaste hoy?»,
 * «Siguiendo · Descubrir · Juegos» (`?ver=`) y lo vacío de cada parte.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paged } from '../lib/data/follows';
import type { FeedScope, Post } from '../lib/data/posts';
import type { ProfileGame } from '../lib/data/profileGames';
import { FeedbackProvider } from '../components/feedback';

const paged = <T,>(extra: Partial<Paged<T>> = {}): Paged<T> => ({
  data: [],
  loading: false,
  error: null,
  hasMore: false,
  loadingMore: false,
  moreError: null,
  loadMore: async () => undefined,
  refresh: () => undefined,
  ...extra,
});

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u-me' } as { uid: string } | null, profile: { name: 'Yo' }, loading: false },
  feeds: {} as Record<string, unknown>,
  asked: [] as string[],
  games: null as unknown,
}));

vi.mock('../lib/auth', async (orig) => ({ ...(await orig<typeof import('../lib/auth')>()), useAuth: () => state.auth }));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: unknown }) => children }));
vi.mock('../lib/useMode', () => ({
  useIsPro: () => false,
  useMode: () => ({ mode: 'lite', isPro: false, setMode: async () => 'saved', suggestedPro: false }),
}));
vi.mock('../components/home/useHomeData', () => ({ useMyLeagues: () => ({ all: [], loading: false, error: null }) }));
vi.mock('../lib/data/follows', async (orig) => ({
  ...(await orig<typeof import('../lib/data/follows')>()),
  usePublicProfile: () => ({ data: null, loading: false, error: null }),
}));
vi.mock('../lib/data/posts', async (orig) => ({
  ...(await orig<typeof import('../lib/data/posts')>()),
  useSocialFeed: (scope: FeedScope) => {
    state.asked.push(scope);
    return state.feeds[scope];
  },
}));
vi.mock('../lib/data/profileGames', async (orig) => ({
  ...(await orig<typeof import('../lib/data/profileGames')>()),
  useFollowingGames: () => state.games,
}));

const { default: SocialPage, socialTab } = await import('./SocialPage');

const post = (id: string, extra: Partial<Post> = {}): Post => ({
  id,
  author: { id: 'u-ana', name: 'Ana Pérez', username: 'anaperez', avatar: null },
  text: `Publicación ${id}`,
  photo: null,
  league: null,
  sport: null,
  visibility: 'public',
  at: new Date().toISOString(),
  likes: 0,
  likedByMe: false,
  comments: 0,
  isMine: false,
  canDelete: false,
  ...extra,
});

const render = (url = '/social') =>
  renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(Routes, null, h(Route, { path: '/social', element: h(SocialPage) })))));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');
/** La opción elegida del segmentado. */
const checked = (html: string) => html.match(/aria-checked="true"[^>]*>([^<]+)</)?.[1];

beforeEach(() => {
  state.auth = { user: { uid: 'u-me' }, profile: { name: 'Yo' }, loading: false };
  state.feeds = { following: paged<Post>(), discover: paged<Post>() };
  state.asked = [];
  state.games = paged<ProfileGame>();
});

describe('Social', () => {
  it('`?ver=` → la parte que se ve', () => {
    expect(socialTab(null)).toBe('siguiendo');
    expect(socialTab('descubrir')).toBe('descubrir');
    expect(socialTab('juegos')).toBe('juegos');
    expect(socialTab('otra')).toBe('siguiendo');
  });

  it('sin cuenta: el título, la lupa y entrar (vuelve a Social)', () => {
    state.auth = { user: null, profile: { name: '' }, loading: false };
    const out = render();
    expect(text(out)).toContain('Social');
    expect(out).toContain('href="/buscar"');
    expect(text(out)).toContain('Entra para ver Social');
    expect(out).toContain('href="/login?next=%2Fsocial"');
    expect(text(out)).not.toContain('¿Qué jugaste hoy?');
  });

  it('Siguiendo vacío: buscar personas o ver Descubrir (y solo pide el feed de Siguiendo)', () => {
    const out = render();
    const t = text(out);
    expect(t).toContain('¿Qué jugaste hoy?');
    expect(checked(out)).toBe('Siguiendo');
    expect(t).toContain('Siguiendo');
    expect(t).toContain('Descubrir');
    expect(t).toContain('Juegos');
    expect(t).toContain('Aquí sale lo de tu gente');
    expect(t).toContain('Buscar personas');
    expect(t).toContain('Ver Descubrir');
    expect(out.match(/href="\/buscar"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(state.asked).toEqual(['following']);
  });

  it('Descubrir: las publicaciones públicas de todos', () => {
    state.feeds.discover = paged<Post>({ data: [post('p1'), post('p2')] });
    const out = render('/social?ver=descubrir');
    expect(checked(out)).toBe('Descubrir');
    expect(out.match(/data-post="/g)).toHaveLength(2);
    expect(text(out)).toContain('Publicación p1');
    expect(state.asked).toEqual(['discover']);
  });

  it('Descubrir vacío y Siguiendo con publicaciones', () => {
    expect(text(render('/social?ver=descubrir'))).toContain('Todavía no hay publicaciones');
    state.feeds.following = paged<Post>({ data: [post('p3')] });
    const out = render();
    expect(out).toContain('data-post="p3"');
    expect(text(out)).not.toContain('Aquí sale lo de tu gente');
  });

  it('Juegos: los juegos de quien sigues (vacío: buscar personas)', () => {
    const out = render('/social?ver=juegos');
    expect(checked(out)).toBe('Juegos');
    expect(text(out)).toContain('Todavía no hay juegos');
    expect(state.asked).toEqual([]);
  });
});
