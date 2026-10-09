/**
 * «Social» en Hoy (SocialSlot) dibujado sin navegador: no sale vacío, cargando ni con error; con publicaciones, las 2
 * más nuevas en filas cortas con «Ver todo».
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paged } from '../../lib/data/follows';
import type { Post } from '../../lib/data/posts';

const state = vi.hoisted(() => ({ feed: null as unknown, scope: '' }));

vi.mock('../../lib/data/posts', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/posts')>()),
  useSocialFeed: (scope: string) => {
    state.scope = scope;
    return state.feed;
  },
}));

const { SocialSlot } = await import('./SocialSlot');

const paged = (extra: Partial<Paged<Post>> = {}): Paged<Post> => ({
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

const post = (id: string, extra: Partial<Post> = {}): Post => ({
  id,
  author: { id: 'u-ana', name: 'Ana Pérez', username: 'anaperez', avatar: null },
  text: `Texto ${id}\nsegunda línea`,
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

const render = () => renderToString(h(MemoryRouter, null, h(SocialSlot, { className: 'mt-7' })));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

beforeEach(() => {
  state.feed = paged();
});

describe('Social en Hoy', () => {
  it('vacío, cargando o con error: no sale', () => {
    expect(render()).toBe('');
    state.feed = paged({ loading: true });
    expect(render()).toBe('');
    state.feed = paged({ error: new Error('red') });
    expect(render()).toBe('');
  });

  it('las 2 más nuevas de Siguiendo: foto, nombre, primera línea o «📷 Foto», me gusta y comentarios', () => {
    state.feed = paged({
      data: [
        post('p1', { likes: 3, likedByMe: true, comments: 2 }),
        post('p2', { text: '', photo: { path: 'u/p2.webp', w: 10, h: 10 }, isMine: true }),
        post('p3'),
      ],
    });
    const out = render();
    const t = text(out);
    expect(state.scope).toBe('following');
    expect(t).toContain('Social');
    expect(out).toContain('href="/social"');
    expect(t).toContain('Ver todo');
    expect(out).toContain('href="/p/p1"');
    expect(out).toContain('href="/p/p2"');
    expect(out).not.toContain('href="/p/p3"');
    expect(t).toContain('Texto p1');
    expect(t).not.toContain('segunda línea');
    expect(t).toContain('📷 Foto');
    expect(t).toContain('Tú');
    expect(t).toContain('3');
    expect(t).toContain('2');
    expect(out).toContain('fill-current');
  });
});
