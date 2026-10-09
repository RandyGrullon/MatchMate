import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryClient, remember } from './client';
import { fetchPublicProfile, fetchSocialNotices, setFollowing, type PageData } from './follows';
import { fetchPeople } from './people';
import { rpc } from './client';
import {
  addPostComment,
  createPost,
  deletePost,
  deletePostComment,
  fetchComments,
  fetchFeed,
  fetchLeaguePosts,
  fetchPost,
  fetchUserPosts,
  postKeys,
  setPostLike,
  type Post,
} from './posts';
import { setBio, setBlocked } from './profileSocial';
import { setLeagueFollowing, type LeagueHit, type LeagueSocial } from './leagueSocial';
import { openWorld, type TestWorld } from './testkit';

/**
 * La red social desde la capa de datos contra la base de verdad (PGlite con las migraciones): ana publica, luis la
 * sigue, le da me gusta y comenta; la liga pública de org se sigue y se busca; bloquear lo esconde todo.
 */

let w: TestWorld;
let org: string;
let ana: string;
let luis: string;
let lid: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await w.b.db.query<T>(sql, params)).rows;

beforeAll(async () => {
  w = await openWorld();
  org = await w.signUp('org@x.com', 'org');
  luis = await w.signUp('luis@x.com', 'luis');
  ana = await w.signUp('ana@x.com', 'ana');
  [{ id: lid }] = await q<{ id: string }>(
    `insert into public.leagues (sport, kind, visibility, name, owner_id, venue, schedule, season_start, season_end, contact_name, contact_phone, require_photo)
     values ('padel', 'liga', 'public', 'Pádel del Este', $1, 'Club Este', 'Martes', '2026-01-01', '2026-12-31', 'Org', '18095550000', false) returning id`,
    [org],
  );
  await q(`insert into public.league_members (league_id, user_id, role, display_name) values ($1, $2, 'owner', 'org')`, [lid, org]);
}, 120_000);

afterAll(async () => {
  await w?.close();
});

describe('red social (capa de datos)', () => {
  let post: Post;

  it('publicar: sale arriba en mi lista de la caché y con la forma del contrato', async () => {
    await w.as('ana@x.com');
    const key = postKeys.user(ana);
    remember(key, { kind: 'posts', status: 'user', id: ana });
    queryClient.setQueryData<PageData<Post>>(key, { items: [], done: true });
    post = await createPost({ text: '  ¡Primera serie de 200!  \n\n\n\nGracias a todos ', visibility: 'public' });
    expect(post).toMatchObject({
      author: { id: ana, name: 'ana', avatar: null },
      text: '¡Primera serie de 200!\n\nGracias a todos',
      photo: null,
      league: null,
      visibility: 'public',
      likes: 0,
      likedByMe: false,
      comments: 0,
      isMine: true,
      canDelete: true,
    });
    expect(queryClient.getQueryData<PageData<Post>>(key)?.items.map((p) => p.id)).toEqual([post.id]);
    expect((await fetchUserPosts(ana)).map((p) => p.id)).toEqual([post.id]);
    expect(await fetchPublicProfile(ana)).toMatchObject({ posts: 1, bio: null, avatar: null, blockedByMe: false });
  });

  it('palabras que no se permiten: la base dice «palabras»', async () => {
    await q(`insert into private.blocked_terms (term, whole) values ('feisimo', true) on conflict do nothing`);
    await expect(createPost({ text: 'qué juego tan feisimo', visibility: 'public' })).rejects.toThrow(/palabras/);
  });

  it('seguir, me gusta y comentar; a ana le llegan los avisos', async () => {
    await w.as('luis@x.com');
    expect((await fetchFeed('following')).map((p) => p.id)).toEqual([]);
    expect((await fetchFeed('discover')).map((p) => p.id)).toEqual([post.id]);
    await setFollowing(ana, true);
    expect((await fetchFeed('following')).map((p) => p.id)).toEqual([post.id]);

    expect(await setPostLike(post, true)).toEqual({ likes: 1, liked: true });
    const c = await addPostComment(post.id, ' ¡Felicidades! ');
    expect(c).toMatchObject({ postId: post.id, author: { id: luis, name: 'luis' }, text: '¡Felicidades!', isMine: true, canDelete: true });
    expect(await fetchPost(post.id)).toMatchObject({ likes: 1, likedByMe: true, comments: 1, isMine: false, canDelete: false });
    expect((await fetchComments(post.id)).map((x) => x.text)).toEqual(['¡Felicidades!']);

    await w.as('ana@x.com');
    const notices = await fetchSocialNotices();
    expect(notices.map((n) => n.title)).toEqual(['luis comentó tu publicación', 'A luis le gustó tu publicación', 'luis te empezó a seguir']);
    expect(notices[0]).toMatchObject({ url: `/p/${post.id}`, icon: 'comment', body: '«¡Felicidades!»' });

    // La autora de la publicación también puede borrar el comentario.
    expect((await fetchComments(post.id))[0]).toMatchObject({ isMine: false, canDelete: true });
    await deletePostComment(c);
    expect(await fetchComments(post.id)).toEqual([]);
    expect(await fetchPost(post.id)).toMatchObject({ comments: 0 });
  });

  it('solo seguidores: luis la ve porque la sigue; org no', async () => {
    await w.as('ana@x.com');
    const mine = await createPost({ text: 'Solo para los que me siguen', visibility: 'followers' });
    await w.as('luis@x.com');
    expect((await fetchFeed('following')).map((p) => p.id)).toContain(mine.id);
    await w.as('org@x.com');
    expect(await fetchPost(mine.id)).toBeNull();
    expect((await fetchFeed('discover')).map((p) => p.id)).not.toContain(mine.id);
  });

  it('ligas: el muro, seguir la liga y buscarla', async () => {
    await w.as('org@x.com');
    const wall = await createPost({ text: 'Inscripciones abiertas para la temporada', leagueId: lid, visibility: 'public' });
    expect(wall.league).toEqual({ id: lid, name: 'Pádel del Este', sport: 'padel' });
    expect(wall.sport).toBe('padel');

    await w.as('luis@x.com');
    expect(await rpc<LeagueSocial>('league_social', { p_league: lid })).toEqual({ following: false, followers: 0, isMember: false, canPost: false, canFollow: true });
    expect((await fetchFeed('following')).map((p) => p.id)).not.toContain(wall.id);
    expect(await setLeagueFollowing(lid, true)).toEqual({ following: true, followers: 1 });
    expect((await fetchFeed('following')).map((p) => p.id)).toContain(wall.id);
    expect((await fetchLeaguePosts(lid)).map((p) => p.id)).toEqual([wall.id]);
    const hits = await rpc<LeagueHit[]>('search_leagues', { p_query: 'padel este', p_limit: 20 });
    expect(hits).toEqual([expect.objectContaining({ id: lid, name: 'Pádel del Este', sport: 'padel', isMember: false, isFollowing: true, followers: 1 })]);
    // Luis no es miembro: no puede publicar en la liga.
    await expect(createPost({ text: 'hola liga', leagueId: lid, visibility: 'league' })).rejects.toThrow();
  });

  it('biografía y búsqueda con la foto (sin foto todavía)', async () => {
    await w.as('ana@x.com');
    expect(await setBio('  Boliche   los martes  ')).toBe('Boliche los martes');
    expect(await fetchPublicProfile(ana)).toMatchObject({ bio: 'Boliche los martes' });
    await w.as('luis@x.com');
    expect(await fetchPeople('ana')).toEqual([expect.objectContaining({ id: ana, avatar: null, isFollowing: true })]);
  });

  it('bloquear: dejan de seguirse, no se ven las publicaciones, no la encuentra y su perfil no existe para ella', async () => {
    await w.as('ana@x.com');
    expect(await setBlocked(luis, true)).toBe(true);
    expect(await fetchPublicProfile(luis)).toMatchObject({ blockedByMe: true, isFollowing: false, followsYou: false });
    await w.as('luis@x.com');
    expect(await fetchPublicProfile(ana)).toBeNull();
    expect(await fetchPost(post.id)).toBeNull();
    expect((await fetchFeed('discover')).map((p) => p.author.id)).not.toContain(ana);
    expect(await fetchPeople('ana')).toEqual([]);
    await expect(setFollowing(ana, true)).rejects.toThrow();
    await w.as('ana@x.com');
    expect(await setBlocked(luis, false)).toBe(false);
    await w.as('luis@x.com');
    expect(await fetchPost(post.id)).toMatchObject({ id: post.id });
  });

  it('borrar: la autora la borra y ya no está', async () => {
    await w.as('ana@x.com');
    await deletePost(post);
    expect(await fetchPost(post.id)).toBeNull();
    expect((await fetchUserPosts(ana)).map((p) => p.id)).not.toContain(post.id);
  });
});
