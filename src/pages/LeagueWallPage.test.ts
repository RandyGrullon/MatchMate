/**
 * El muro de la liga (/l/:lid/muro) dibujado sin navegador (renderToString): liga con menores, sin cuenta, miembro que
 * puede publicar y quien solo mira.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paged } from '../lib/data/follows';
import type { Post } from '../lib/data/posts';
import { LeagueContext, type LeagueCtx } from '../lib/league';
import type { League } from '../lib/types';
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
  social: { data: null as unknown, loading: false, error: null },
  posts: null as unknown,
}));

vi.mock('../lib/auth', async (orig) => ({ ...(await orig<typeof import('../lib/auth')>()), useAuth: () => state.auth }));
vi.mock('../lib/useMode', () => ({
  useIsPro: () => false,
  useMode: () => ({ mode: 'lite', isPro: false, setMode: async () => 'saved', suggestedPro: false }),
}));
vi.mock('../components/home/useHomeData', () => ({ useMyLeagues: () => ({ all: [], loading: false, error: null }) }));
vi.mock('../lib/data/follows', async (orig) => ({
  ...(await orig<typeof import('../lib/data/follows')>()),
  usePublicProfile: () => ({ data: null, loading: false, error: null }),
}));
vi.mock('../lib/data/leagueSocial', async (orig) => ({
  ...(await orig<typeof import('../lib/data/leagueSocial')>()),
  useLeagueSocial: () => state.social,
}));
vi.mock('../lib/data/posts', async (orig) => ({
  ...(await orig<typeof import('../lib/data/posts')>()),
  useLeaguePosts: () => state.posts,
}));

const { default: LeagueWallPage } = await import('./LeagueWallPage');

const league = (extra: Partial<League> = {}): League => ({
  id: 'L1',
  name: 'Pádel del Club',
  visibility: 'public',
  ownerUid: 'u-dueno',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport: 'padel',
  ...extra,
});

const post: Post = {
  id: 'p1',
  author: { id: 'u-ana', name: 'Ana Pérez', username: 'anaperez', avatar: null },
  text: 'Foto de la final',
  photo: null,
  league: { id: 'L1', name: 'Pádel del Club', sport: 'padel' },
  sport: null,
  visibility: 'league',
  at: new Date().toISOString(),
  likes: 0,
  likedByMe: false,
  comments: 0,
  isMine: false,
  canDelete: false,
};

const render = (l: League = league()) => {
  const ctx: LeagueCtx = { lid: l.id, league: l, member: null, isAdmin: false, isOwner: false, isScorer: false, canScore: false, myPlayerId: null, base: `/l/${l.id}` };
  return renderToString(
    h(MemoryRouter, { initialEntries: [`/l/${l.id}/muro`] }, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx }, h(LeagueWallPage)))),
  );
};
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

beforeEach(() => {
  state.auth = { user: { uid: 'u-me' }, profile: { name: 'Yo' }, loading: false };
  state.social = { data: { following: false, followers: 0, isMember: true, canPost: true, canFollow: false }, loading: false, error: null };
  state.posts = paged<Post>({ data: [post] });
});

describe('muro de la liga', () => {
  it('liga con menores: lo social apagado, con calma', () => {
    const t = text(render(league({ hasMinors: true, visibility: 'private' })));
    expect(t).toContain('Muro');
    expect(t).toContain('Aquí no hay muro');
    expect(t).toContain('tiene menores');
    expect(t).not.toContain('Foto de la final');
  });

  it('sin cuenta: entrar y volver al muro', () => {
    state.auth = { user: null, profile: { name: '' }, loading: false };
    const out = render();
    expect(text(out)).toContain('Entra para ver el muro');
    expect(out).toContain('href="/login?next=%2Fl%2FL1%2Fmuro"');
  });

  it('miembro: publicar en la liga y las publicaciones sin repetir la liga', () => {
    const out = render();
    const t = text(out);
    expect(t).toContain('¿Qué pasó en la liga?');
    expect(t).toContain('Foto de la final');
    expect(t).toContain('Solo la liga');
    expect(out).not.toContain('href="/l/L1"');
  });

  it('quien solo mira: sin «publicar»; vacío lo dice', () => {
    state.social = { data: { following: false, followers: 3, isMember: false, canPost: false, canFollow: true }, loading: false, error: null };
    state.posts = paged<Post>();
    const t = text(render());
    expect(t).not.toContain('¿Qué pasó en la liga?');
    expect(t).toContain('Todavía no hay publicaciones');
    expect(t).toContain('Cuando alguien de la liga publique');
  });

  it('un torneo habla de torneo', () => {
    expect(text(render(league({ kind: 'torneo' })))).toContain('¿Qué pasó en el torneo?');
  });
});
