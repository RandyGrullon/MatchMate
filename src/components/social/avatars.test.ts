/**
 * La foto de perfil donde salen personas (renderToString, sin navegador): el link a un perfil, las filas de seguidores y
 * seguidos y la cabecera del perfil (con su biografía). Sin foto, o mientras llega, las iniciales.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FollowPerson, PublicProfile } from '../../lib/data/follows';
import { AVATAR_BUCKET, primePublicUrl } from '../../lib/publicImages';
import { FeedbackProvider } from '../feedback';

const state = vi.hoisted(() => ({
  profile: { data: null as unknown, loading: false, error: null as Error | null },
  list: [] as FollowPerson[],
}));

vi.mock('../../lib/data/follows', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/follows')>()),
  usePublicProfile: () => state.profile,
  useFollowList: () => ({
    data: state.list,
    loading: false,
    error: null,
    hasMore: false,
    loadingMore: false,
    moreError: null,
    loadMore: async () => undefined,
    refresh: () => undefined,
  }),
}));

const { UserLink } = await import('./UserLink');
const { FollowersSheet } = await import('./FollowersSheet');
const { ProfileView } = await import('./ProfileView');

const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el)));
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

primePublicUrl(AVATAR_BUCKET, 'u2/ana.webp', 'https://img.test/u2/ana.webp');

const person = (id: string, name: string, extra: Partial<FollowPerson> = {}): FollowPerson => ({
  id,
  name,
  username: name.split(' ')[0]!.toLowerCase(),
  at: '2026-10-01T00:00:00Z',
  isFollowing: false,
  followsYou: false,
  isMe: false,
  ...extra,
});

beforeEach(() => {
  state.profile = { data: null, loading: false, error: null };
  state.list = [];
});

describe('UserLink', () => {
  it('con foto: la foto (no las iniciales) dentro del link', () => {
    const out = render(h(UserLink, { userId: 'u2', name: 'Ana Pérez', username: 'ana', photo: 'u2/ana.webp' }));
    expect(out).toMatch(/<a [^>]*href="\/u\/u2"[^>]*><img src="https:\/\/img\.test\/u2\/ana\.webp"/);
    expect(text(out)).not.toContain('AP');
  });

  it('sin foto: las iniciales', () => {
    const out = render(h(UserLink, { userId: 'u2', name: 'Ana Pérez', photo: null }));
    expect(out).not.toContain('<img');
    expect(text(out)).toContain('AP Ana Pérez');
  });
});

describe('seguidores y seguidos', () => {
  it('cada persona con su foto o sus iniciales', () => {
    state.list = [person('u2', 'Ana Pérez', { avatar: 'u2/ana.webp', followsYou: true }), person('u3', 'Beto Ruiz')];
    const out = render(
      h(FollowersSheet, {
        userId: 'u1',
        name: 'Caro',
        kind: 'followers',
        counts: { followers: 2, following: 0 },
        onKind: () => undefined,
        onClose: () => undefined,
      }),
    );
    const t = text(out);
    expect(out).toContain('src="https://img.test/u2/ana.webp"');
    expect(t).toContain('Ana Pérez @ana Te sigue');
    expect(t).toContain('BR Beto Ruiz @beto');
  });
});

describe('la cabecera del perfil', () => {
  const profile = (extra: Partial<PublicProfile> = {}): PublicProfile => ({
    id: 'u2',
    name: 'Ana Pérez',
    username: 'ana',
    since: null,
    sports: [],
    followers: 0,
    following: 0,
    likesReceived: 0,
    gamesCount: 0,
    isFollowing: false,
    followsYou: false,
    isMe: false,
    ...extra,
  });

  it('su foto y su biografía', () => {
    state.profile = { data: profile({ avatar: 'u2/ana.webp', bio: 'Pádel los martes.' }), loading: false, error: null };
    const out = render(h(ProfileView, { userId: 'u2' }));
    expect(out).toContain('src="https://img.test/u2/ana.webp"');
    expect(text(out)).toContain('Pádel los martes.');
  });

  it('bloqueada: sin su biografía', () => {
    state.profile = { data: profile({ bio: 'Pádel los martes.', blockedByMe: true }), loading: false, error: null };
    expect(text(render(h(ProfileView, { userId: 'u2' })))).not.toContain('Pádel los martes.');
  });
});
