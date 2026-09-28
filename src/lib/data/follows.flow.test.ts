import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryClient, remember } from './client';
import { fetchFollowList, fetchPublicProfile, fetchSocialNotices, loadUpTo, peopleKeys, setFollowing, type PageData, type PublicProfile } from './follows';
import { fetchFollowingGames, fetchProfileGames, fetchProfileStats, profileGamesKey, setGameLike, type ProfileGame } from './profileGames';
import { openWorld, type TestWorld } from './testkit';

/**
 * La capa de datos del perfil social contra la base de verdad (PGlite con las migraciones): liga pública de
 * boliche de org con luis jugando 3 torneos; ana mira, sigue y da me gusta.
 */

let w: TestWorld;
let org: string;
let luis: string;
let ana: string;
let lid: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await w.b.db.query<T>(sql, params)).rows;

beforeAll(async () => {
  w = await openWorld();
  org = await w.signUp('org@x.com', 'org');
  luis = await w.signUp('luis@x.com', 'luis');
  ana = await w.signUp('ana@x.com', 'ana');
  [{ id: lid }] = await q<{ id: string }>(
    `insert into public.leagues (sport, kind, visibility, name, owner_id, venue, schedule, season_start, season_end, contact_name, contact_phone, require_photo)
     values ('bowling', 'liga', 'public', 'Liga Abierta', $1, 'Bolera', 'Martes', '2026-01-01', '2026-12-31', 'Org', '18095550000', false) returning id`,
    [org],
  );
  await q(`insert into public.league_members (league_id, user_id, role, display_name) values ($1, $2, 'owner', 'org'), ($1, $3, 'member', 'luis')`, [lid, org, luis]);
  const [{ id: pid }] = await q<{ id: string }>(`insert into public.players (league_id, name, user_id) values ($1, 'Luis', $2) returning id`, [lid, luis]);
  for (const [date, scores] of [
    ['2026-09-10', [150, 160]],
    ['2026-09-17', [170, 180]],
    ['2026-09-24', [190, 210]],
  ] as const) {
    const [{ id: eid }] = await q<{ id: string }>(`insert into public.events (league_id, type, name, date, games) values ($1, 'torneo', $2, $3, 2) returning id`, [
      lid,
      `Copa ${date}`,
      date,
    ]);
    await q(`insert into public.entries (league_id, event_id, player_id, scores, photos) values ($1, $2, $3, $4, $5)`, [lid, eid, pid, scores, ['sin-foto', 'sin-foto']]);
  }
  await w.as('ana@x.com');
}, 120_000);

afterAll(async () => {
  await w?.close();
});

describe('perfil social (capa de datos)', () => {
  it('perfil público, juegos por páginas y números', async () => {
    expect(await fetchPublicProfile(luis)).toMatchObject({ id: luis, name: 'luis', sports: ['bowling'], gamesCount: 3, isFollowing: false, isMe: false });
    const games = await fetchProfileGames(luis);
    expect(games.map((g) => g.eventName)).toEqual(['Copa 2026-09-24', 'Copa 2026-09-17', 'Copa 2026-09-10']);
    expect(games[0]).toMatchObject({ kind: 'bowling', userName: 'luis', leagueName: 'Liga Abierta', likes: 0, likedByMe: false, detail: { series: 400, high: 210 } });
    // De 2 en 2 con el cursor de la base (at + key).
    const paged = await loadUpTo<ProfileGame>((after, limit) => fetchProfileGames(luis, { after, limit }), 10, 2, (g) => g.key);
    expect(paged).toEqual({ items: games, done: true });
    expect(await fetchProfileGames(luis, { sport: 'padel' })).toEqual([]);
    expect((await fetchProfileStats(luis))?.bowling).toEqual({ sessions: 3, series: [[190, 210], [170, 180], [150, 160]] });
  });

  it('seguir: optimista en la caché y después lo del servidor', async () => {
    const key = peopleKeys.profile(luis);
    remember(key, { kind: 'publicProfile', id: luis });
    queryClient.setQueryData<PublicProfile | null>(key, await fetchPublicProfile(luis));
    const p = setFollowing(luis, true);
    expect(queryClient.getQueryData<PublicProfile>(key)).toMatchObject({ isFollowing: true, followers: 1 });
    expect(await p).toEqual({ following: true, followers: 1 });
    expect(await fetchFollowList(luis, 'followers')).toEqual([expect.objectContaining({ id: ana, name: 'ana', isMe: true })]);
    expect(await fetchFollowList(ana, 'following')).toEqual([expect.objectContaining({ id: luis, name: 'luis', isFollowing: true })]);
    expect((await fetchFollowingGames()).map((g) => g.userId)).toEqual([luis, luis, luis]);
    await expect(setFollowing(ana, true)).rejects.toThrow();
  });

  it('me gusta: optimista en todas las listas y con lo que dice el servidor', async () => {
    const games = await fetchProfileGames(luis);
    const key = profileGamesKey(luis, null);
    remember(key, { kind: 'profileGames', id: luis });
    queryClient.setQueryData<PageData<ProfileGame>>(key, { items: games, done: true });
    const p = setGameLike(games[0], true);
    expect(queryClient.getQueryData<PageData<ProfileGame>>(key)?.items[0]).toMatchObject({ likes: 1, likedByMe: true });
    expect(await p).toEqual({ likes: 1, liked: true });
    expect((await fetchProfileGames(luis))[0]).toMatchObject({ likes: 1, likedByMe: true });
    expect(await fetchPublicProfile(luis)).toMatchObject({ likesReceived: 1 });
    expect(await setGameLike(games[0], false)).toEqual({ likes: 0, liked: false });
    expect(queryClient.getQueryData<PageData<ProfileGame>>(key)?.items[0]).toMatchObject({ likes: 0, likedByMe: false });
  });

  it('avisos de luis: «ana te empezó a seguir»', async () => {
    await w.as('luis@x.com');
    const list = await fetchSocialNotices();
    expect(list).toEqual([expect.objectContaining({ kind: 'social', icon: 'follow', title: 'ana te empezó a seguir', url: `/u/${ana}` })]);
    await w.as('ana@x.com');
    expect(await fetchSocialNotices()).toEqual([]);
  });
});
