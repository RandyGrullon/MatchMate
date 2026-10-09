/**
 * Una publicación (/p/:postId) dibujada sin navegador (renderToString): sin cuenta, cargando, ya no está (o no se ve) y
 * la publicación con sus comentarios y la caja para comentar.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paged } from '../lib/data/follows';
import type { Post, PostComment } from '../lib/data/posts';
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
  auth: { user: { uid: 'u-me' } as { uid: string } | null, loading: false },
  post: { data: null as unknown, loading: false, error: null as Error | null },
  comments: null as unknown,
  asked: [] as (string | null | undefined)[],
}));

vi.mock('../lib/auth', async (orig) => ({ ...(await orig<typeof import('../lib/auth')>()), useAuth: () => state.auth }));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: unknown }) => children }));
vi.mock('../lib/data/posts', async (orig) => ({
  ...(await orig<typeof import('../lib/data/posts')>()),
  usePost: (id: string) => {
    state.asked.push(id);
    return state.post;
  },
  usePostComments: () => state.comments,
}));

const { default: PostPage } = await import('./PostPage');

const post = (extra: Partial<Post> = {}): Post => ({
  id: 'p1',
  author: { id: 'u-ana', name: 'Ana Pérez', username: 'anaperez', avatar: null },
  text: '¡Ganamos la final!\nGracias a todos',
  photo: null,
  league: { id: 'L1', name: 'Pádel del Club', sport: 'padel' },
  sport: null,
  visibility: 'public',
  at: new Date(Date.now() - 3_600_000).toISOString(),
  likes: 2,
  likedByMe: false,
  comments: 2,
  isMine: false,
  canDelete: false,
  ...extra,
});

const comment = (id: string, extra: Partial<PostComment> = {}): PostComment => ({
  id,
  postId: 'p1',
  author: { id: 'u-luis', name: 'Luis Gómez', username: 'luis', avatar: null },
  text: `Comentario ${id}`,
  at: new Date(Date.now() - 600_000).toISOString(),
  isMine: false,
  canDelete: false,
  ...extra,
});

const render = (url = '/p/p1') =>
  renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(Routes, null, h(Route, { path: '/p/:postId', element: h(PostPage) })))));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

beforeEach(() => {
  state.auth = { user: { uid: 'u-me' }, loading: false };
  state.post = { data: post(), loading: false, error: null };
  state.comments = paged<PostComment>({ data: [comment('c1'), comment('c2', { isMine: true, canDelete: true, author: { id: 'u-me', name: 'Yo', username: 'yo', avatar: null } })] });
  state.asked = [];
});

describe('una publicación', () => {
  it('sin cuenta: entrar y volver a la publicación', () => {
    state.auth = { user: null, loading: false };
    const out = render();
    expect(text(out)).toContain('Entra para ver esta publicación');
    expect(out).toContain('href="/login?next=%2Fp%2Fp1"');
    expect(state.asked).toEqual([]);
  });

  it('cargando: la forma de la tarjeta', () => {
    state.post = { data: null, loading: true, error: null };
    expect(render()).toContain('Cargando publicaciones');
  });

  it('ya no está o no la puedes ver', () => {
    state.post = { data: null, loading: false, error: null };
    const out = render();
    expect(text(out)).toContain('Esta publicación ya no está o no la puedes ver');
    expect(out).toContain('href="/social"');
    expect(text(out)).not.toContain('Comentarios');
  });

  it('no se pudo leer: reintentar', () => {
    state.post = { data: null, loading: false, error: new Error('red') };
    expect(text(render())).toContain('Reintentar');
  });

  it('la publicación entera, «‹ Social», sus comentarios y la caja para comentar', () => {
    const out = render();
    const t = text(out);
    expect(state.asked).toEqual(['p1']);
    expect(t).toContain('Social');
    expect(t).toContain('¡Ganamos la final!');
    expect(t).toContain('Pádel del Club');
    expect(t).toContain('Comentarios 2');
    expect(t).toContain('Luis Gómez');
    expect(t).toContain('Comentario c1');
    expect(t).toContain('Tú');
    expect(out.match(/Más opciones del comentario/g)).toHaveLength(2);
    expect(out).toContain('id="comentar-publicacion"');
    expect(out).toContain('Enviar comentario');
    // «Comentar» de la tarjeta va a la caja (es un botón, no otro link a la misma publicación).
    expect(out).toMatch(/<button[^>]*aria-label="Comentarios \(2\)"/);
    expect(out).not.toContain('line-clamp-8');
  });

  it('sin comentarios: invita a ser el primero', () => {
    state.comments = paged<PostComment>();
    state.post = { data: post({ comments: 0 }), loading: false, error: null };
    expect(text(render())).toContain('Todavía no hay comentarios');
  });
});
