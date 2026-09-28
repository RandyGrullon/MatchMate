/**
 * Social (20260928000200_social.sql): seguir cuentas, me gusta en los juegos de todos los deportes, el perfil
 * público con lo que ve cada quien, los juegos de las cuentas que sigo y los avisos de la campana.
 *
 * Mundo (fixture): liga privada del Banco (org dueño, sofi admin, luis y ana miembros; luis juega e1 con [150] sin
 * verificar) y liga pública Abierta de otro. Aquí se agrega:
 * - en la Abierta, el jugador de luis con un torneo jugado (190, 210 verificados);
 * - una liga de pádel pública (Pádel Abierto) con luis + ana contra otra + nuevo, partido confirmado (ganó el lado 1);
 * - una liga con menores (privada) donde org juega: nada social sale de ahí.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { entry, event, league, makeWorld, member, player, type World } from './fixture';

let db: TestDb;
let w: World;
let x: Extra;

interface Extra {
  pubLuis: string;
  t1: string;
  t1Luis: string;
  padel: string;
  pp: { luis: string; ana: string; otra: string; nuevo: string };
  match: string;
  minors: string;
  minorsEntry: string;
}

type Json = Record<string, unknown>;
type Game = Json & { key: string; kind: string; id: string; at: string; likes: number; likedByMe: boolean; detail: Json; userId: string };

const NEW_RPC = [
  'follow_list',
  'follow_user',
  'following_games',
  'profile_games',
  'profile_stats',
  'public_profile',
  'set_game_like',
  'social_notices',
  'unfollow_user',
];

async function makeExtra(): Promise<Extra> {
  // Luis juega también en la liga pública (se une como miembro con su jugador).
  await member(db, w.pub, w.u.luis, 'member', 'luis');
  const pubLuis = await player(db, w.pub, 'Luis', w.u.luis);
  const t1 = await event(db, w.pub, 'torneo', '2026-09-20', 3, 'Copa Abierta');
  const t1Luis = await entry(db, w.pub, t1, pubLuis, [190, 210, null], ['sin-foto', 'sin-foto', null]);

  // Pádel público: luis + ana contra otra + nuevo.
  const padel = await league(db, w.u.otro, { name: 'Pádel Abierto', visibility: 'public', sport: 'padel', requirePhoto: false });
  await db.admin(`update public.leagues set rules = '{"match": {"sport": "padel", "deuce": "golden"}}' where id = $1`, [padel]);
  await member(db, padel, w.u.otro, 'owner', 'otro');
  for (const [uid, name] of [
    [w.u.luis, 'luis'],
    [w.u.ana, 'ana'],
    [w.u.otra, 'otra'],
    [w.u.nuevo, 'nuevo'],
  ] as const) {
    await member(db, padel, uid, 'member', name);
  }
  const pp = {
    luis: await player(db, padel, 'Luis', w.u.luis),
    ana: await player(db, padel, 'Ana', w.u.ana),
    otra: await player(db, padel, 'Otra', w.u.otra),
    nuevo: await player(db, padel, 'Nuevo', w.u.nuevo),
  };
  const [match] = await db.rpc<string[]>(w.u.otro, 'create_matches', {
    p_league: padel,
    p_matches: [
      {
        scheduled_at: '2026-09-25T23:00:00Z',
        sides: [
          { side: 1, label: 'Luis / Ana', players: [{ player_id: pp.luis }, { player_id: pp.ana }] },
          { side: 2, label: 'Otra / Nuevo', players: [{ player_id: pp.otra }, { player_id: pp.nuevo }] },
        ],
      },
    ],
  });
  await db.admin(
    `update public.matches set status = 'confirmed', winner_side = 1, score = '{"text": "6-4 6-3"}', proposed_at = now(), confirmed_at = now()
      where id = $1`,
    [match],
  );

  // Liga con menores (privada): org juega ahí, pero nada social sale de esa liga.
  const minors = await league(db, w.u.org, { name: 'Escuelita', visibility: 'private', requirePhoto: false, hasMinors: true });
  await member(db, minors, w.u.org, 'owner', 'org');
  await member(db, minors, w.u.sofi, 'member', 'sofi');
  const minorsOrg = await player(db, minors, 'Org', w.u.org);
  const me = await event(db, minors, 'practica', '2026-09-24');
  const minorsEntry = await entry(db, minors, me, minorsOrg, [120], ['sin-foto']);

  return { pubLuis, t1, t1Luis, padel, pp, match, minors, minorsEntry };
}

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
  x = await makeExtra();
});
afterEach(async () => {
  await db.rollback();
});

const follow = (who: string, target: string) => db.rpc<Json>(who, 'follow_user', { p_user: target });
const unfollow = (who: string, target: string) => db.rpc<Json>(who, 'unfollow_user', { p_user: target });
const profile = (who: string, target: string) => db.rpc<Json | null>(who, 'public_profile', { p_user: target });
const games = (who: string, target: string, extra: Record<string, unknown> = {}) =>
  db.rpc<Game[]>(who, 'profile_games', { p_user: target, ...extra });
const like = (who: string, kind: string, id: string, liked = true, player: string | null = null) =>
  db.rpc<{ likes: number; liked: boolean }>(who, 'set_game_like', { p_kind: kind, p_id: id, p_liked: liked, p_player: player });

describe('permisos', () => {
  it('las RPC nuevas: solo con sesión, security definer, y pasan por require_uid', async () => {
    const rows = await db.admin<{ fn: string; definer: boolean; anon: boolean; auth: boolean; uid: boolean }>(
      `select p.proname as fn, p.prosecdef as definer, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth, p.prosrc like '%private.require_uid()%' as uid
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1) order by 1`,
      [NEW_RPC],
    );
    expect(rows).toEqual(NEW_RPC.map((fn) => ({ fn, definer: true, anon: false, auth: true, uid: true })));
    // Sin cuenta: nada.
    await fails(db.rpc(ANON, 'follow_user', { p_user: w.u.luis }), '42501');
    await fails(db.rpc(ANON, 'public_profile', { p_user: w.u.luis }), '42501');
    await fails(db.asAnon('select * from public.follows'), '42501');
    await fails(db.asAnon('select * from public.game_likes'), '42501');
    // Las ayudas de private no las ejecuta la app.
    await fails(db.as(w.u.luis, 'select private.social_can_see($1)', [w.u.ana]), '42501');
    await fails(db.as(w.u.luis, `select private.social_games(array[$1]::uuid[], null, 10, null, '')`, [w.u.ana]), '42501');
  });

  it('las tablas tienen RLS y nadie escribe directo (ni con los datos bien puestos)', async () => {
    const rls = await db.admin<{ relname: string; rls: boolean }>(
      `select c.relname, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('follows', 'game_likes') order by 1`,
    );
    expect(rls).toEqual([
      { relname: 'follows', rls: true },
      { relname: 'game_likes', rls: true },
    ]);
    await fails(db.as(w.u.ana, 'insert into public.follows (follower_id, followee_id) values ($1, $2)', [w.u.ana, w.u.luis]), '42501');
    await fails(
      db.as(w.u.ana, `insert into public.game_likes (league_id, player_id, kind, match_id, user_id) values ($1, $2, 'match', $3, $4)`, [
        x.padel,
        x.pp.luis,
        x.match,
        w.u.ana,
      ]),
      '42501',
    );
    await follow(w.u.ana, w.u.luis);
    await fails(db.as(w.u.ana, 'delete from public.follows'), '42501');
    // Nadie se sigue a sí mismo, ni siquiera por debajo.
    await fails(db.asService('insert into public.follows (follower_id, followee_id) values ($1, $1)', [w.u.ana]), '23514');
  });

  it('cuenta bloqueada: no sigue ni da me gusta', async () => {
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.ana, p_reason: 'spam' });
    await fails(follow(w.u.ana, w.u.luis), 'bloqueada');
    await fails(like(w.u.ana, 'bowling', x.t1Luis), 'bloqueada');
    await fails(profile(w.u.ana, w.u.luis), 'bloqueada');
  });
});

describe('seguir', () => {
  it('seguir y dejar de seguir: idempotente, con los números al día', async () => {
    expect(await follow(w.u.ana, w.u.luis)).toEqual({ following: true, followers: 1 });
    expect(await follow(w.u.ana, w.u.luis)).toEqual({ following: true, followers: 1 });
    expect(await follow(w.u.otra, w.u.luis)).toEqual({ following: true, followers: 2 });
    expect(await db.count('public.follows', 'followee_id = $1', [w.u.luis])).toBe(2);
    expect(await unfollow(w.u.ana, w.u.luis)).toEqual({ following: false, followers: 1 });
    expect(await unfollow(w.u.ana, w.u.luis)).toEqual({ following: false, followers: 1 });
    // Directo, cada quien lee solo sus filas (lo de otros va por las RPC, que miran quién se ve).
    expect(await db.asUser(w.u.extra, 'select follower_id from public.follows where followee_id = $1', [w.u.luis])).toEqual([]);
    expect(await db.asUser(w.u.luis, 'select follower_id from public.follows where followee_id = $1', [w.u.luis])).toEqual([
      { follower_id: w.u.otra },
    ]);
    expect(await db.asUser(w.u.otra, 'select followee_id from public.follows where follower_id = $1', [w.u.otra])).toEqual([
      { followee_id: w.u.luis },
    ]);
  });

  it('no a uno mismo, ni a quien no existe, ni a una cuenta bloqueada o que no se ve', async () => {
    await fails(follow(w.u.ana, w.u.ana), INVALID);
    await fails(follow(w.u.ana, randomUUID()), 'no_existe');
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.otra, p_reason: 'x' });
    await fails(follow(w.u.ana, w.u.otra), DENIED);
    // extra no está en ninguna liga: nadie lo ve (salvo el superadmin).
    await fails(follow(w.u.ana, w.u.extra), DENIED);
    expect(await follow(w.u.dios, w.u.extra)).toMatchObject({ following: true });
    // Como dios lo sigue, extra ahora ve a dios y lo puede seguir de vuelta.
    expect(await follow(w.u.extra, w.u.dios)).toMatchObject({ following: true });
  });

  it('push «te empezó a seguir» una vez por persona y día, y aviso en tiempo real', async () => {
    await db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/fcm/send/l', 'k', 'a')`, [
      w.u.luis,
    ]);
    const pushes = () =>
      db.admin<{ title: string; url: string; tag: string }>('select title, url, tag from public.push_outbox where user_id = $1', [w.u.luis]);
    await follow(w.u.ana, w.u.luis);
    expect(await pushes()).toEqual([{ title: 'ana te empezó a seguir', url: `/u/${w.u.ana}`, tag: `seguir:${w.u.ana}` }]);
    await unfollow(w.u.ana, w.u.luis);
    await follow(w.u.ana, w.u.luis);
    expect(await pushes()).toHaveLength(1);
  });

  it('ritmo: 60 cambios por hora', async () => {
    await db.admin(`insert into private.rate_limits (key, window_start, hits) values ($1, now(), 60)`, [`follow:u:${w.u.ana}`]);
    await fails(follow(w.u.ana, w.u.luis), 'rate_limited');
    // Lo que no cambia nada no cuenta.
    expect(await unfollow(w.u.ana, w.u.luis)).toEqual({ following: false, followers: 0 });
  });

  it('listas de seguidores y seguidos, con nombres, si lo sigo yo y páginas', async () => {
    await follow(w.u.ana, w.u.luis);
    await follow(w.u.otra, w.u.luis);
    await follow(w.u.luis, w.u.ana);
    await db.admin(`update public.follows set created_at = now() - interval '1 hour' where follower_id = $1 and followee_id = $2`, [w.u.ana, w.u.luis]);
    const list = await db.rpc<Json[]>(w.u.ana, 'follow_list', { p_user: w.u.luis, p_kind: 'followers' });
    expect(list.map((r) => [r.name, r.isFollowing, r.followsYou, r.isMe])).toEqual([
      ['otra', false, false, false],
      ['ana', false, false, true],
    ]);
    const page2 = await db.rpc<Json[]>(w.u.ana, 'follow_list', {
      p_user: w.u.luis,
      p_kind: 'followers',
      p_limit: 1,
      p_before: list[0].at,
      p_before_id: list[0].id,
    });
    expect(page2.map((r) => r.name)).toEqual(['ana']);
    expect((await db.rpc<Json[]>(w.u.ana, 'follow_list', { p_user: w.u.luis, p_kind: 'following' })).map((r) => r.name)).toEqual(['ana']);
    await fails(db.rpc(w.u.ana, 'follow_list', { p_user: w.u.luis, p_kind: 'amigos' }), INVALID);
    // De alguien que no se ve (org solo está en ligas privadas): vacío.
    await follow(w.u.sofi, w.u.org);
    expect(await db.rpc(w.u.extra, 'follow_list', { p_user: w.u.org, p_kind: 'followers' })).toEqual([]);
    expect(await db.rpc<Json[]>(w.u.ana, 'follow_list', { p_user: w.u.org, p_kind: 'followers' })).toEqual([
      expect.objectContaining({ id: w.u.sofi, name: 'sofi' }),
    ]);
    // En la lista de alguien que se ve no sale quien no se ve (extra no está en ninguna liga), aunque cuente.
    await follow(w.u.dios, w.u.extra);
    await follow(w.u.extra, w.u.luis);
    expect((await db.rpc<Json[]>(w.u.ana, 'follow_list', { p_user: w.u.luis, p_kind: 'followers' })).map((r) => r.name)).not.toContain('extra');
    expect(await db.rpc<Json>(w.u.ana, 'public_profile', { p_user: w.u.luis })).toMatchObject({ followers: 3 });
    // Luis sí ve a extra en sus seguidores (lo sigue a él).
    expect((await db.rpc<Json[]>(w.u.luis, 'follow_list', { p_user: w.u.luis, p_kind: 'followers' })).map((r) => r.id)).toContain(w.u.extra);
  });
});

describe('perfil público', () => {
  it('lo que ve cada quien: números, deportes y si se siguen', async () => {
    await follow(w.u.ana, w.u.luis);
    await like(w.u.ana, 'bowling', x.t1Luis);
    await like(w.u.otra, 'match', x.match, true, x.pp.luis);
    const p = await profile(w.u.ana, w.u.luis);
    expect(p).toMatchObject({
      id: w.u.luis,
      name: 'luis',
      sports: ['bowling', 'padel'],
      followers: 1,
      following: 0,
      likesReceived: 2,
      // Banco (e1, sin verificar pero anotado), Copa Abierta y el partido.
      gamesCount: 3,
      isFollowing: true,
      followsYou: false,
      isMe: false,
    });
    // Alguien de fuera del Banco (liga privada) no ve ese juego.
    await follow(w.u.otra, w.u.luis);
    expect(await profile(w.u.otra, w.u.luis)).toMatchObject({ gamesCount: 2, likesReceived: 2, followers: 2 });
    // extra no ve a luis por ninguna liga... pero luis es miembro de ligas públicas: sí lo ve.
    expect(await profile(w.u.extra, w.u.luis)).toMatchObject({ name: 'luis', gamesCount: 2, isFollowing: false });
    // org solo juega en ligas privadas (una con menores): extra no lo ve.
    expect(await profile(w.u.extra, w.u.org)).toBeNull();
    expect(await profile(w.u.extra, randomUUID())).toBeNull();
    // Su propio perfil.
    expect(await profile(w.u.luis, w.u.luis)).toMatchObject({ isMe: true, gamesCount: 3 });
  });

  it('la liga con menores no sale en nada social', async () => {
    // sofi comparte la Escuelita con org: lo ve, pero sin los juegos de esa liga.
    expect(await profile(w.u.sofi, w.u.org)).toMatchObject({ gamesCount: 0, sports: [] });
    expect(await games(w.u.sofi, w.u.org)).toEqual([]);
    await fails(like(w.u.sofi, 'bowling', x.minorsEntry), DENIED);
  });

  it('juegos: más nuevos primero, con detalle por deporte, me gusta y páginas', async () => {
    const list = await games(w.u.ana, w.u.luis);
    // Partido (25 sept), práctica del Banco (22 sept) y Copa Abierta (20 sept).
    expect(list.map((g) => g.kind)).toEqual(['match', 'bowling', 'bowling']);
    const [m, e1, t1] = list;
    expect(m).toMatchObject({
      key: `m:${x.match}:${x.pp.luis}`,
      id: x.match,
      playerId: x.pp.luis,
      userId: w.u.luis,
      userName: 'luis',
      leagueId: x.padel,
      leagueName: 'Pádel Abierto',
      sport: 'padel',
      url: `/l/${x.padel}/juegos?partido=${x.match}`,
      likes: 0,
      likedByMe: false,
      detail: { side: 1, mine: 'Luis / Ana', opponent: 'Otra / Nuevo', score: '6-4 6-3', result: 'win', walkover: false, final: true },
    });
    expect(t1).toMatchObject({
      id: x.t1Luis,
      sport: 'bowling',
      eventName: 'Copa Abierta',
      eventType: 'torneo',
      eventDate: '2026-09-20',
      url: `/l/${w.pub}/juegos?juego=${x.t1Luis}&evento=${x.t1}`,
      detail: { scores: [190, 210], verified: [true, true], series: 400, high: 210 },
    });
    expect(e1).toMatchObject({ id: w.e1Luis, detail: { scores: [150], verified: [false], series: 150 } });
    // Página siguiente desde el primero.
    const next = await games(w.u.ana, w.u.luis, { p_limit: 1, p_before: m.at, p_before_key: m.key });
    expect(next.map((g) => g.id)).toEqual([w.e1Luis]);
    const last = await games(w.u.ana, w.u.luis, { p_limit: 5, p_before: next[0].at, p_before_key: next[0].key });
    expect(last.map((g) => g.id)).toEqual([x.t1Luis]);
    expect(await games(w.u.ana, w.u.luis, { p_before: last[0].at, p_before_key: last[0].key })).toEqual([]);
    // Por deporte.
    expect((await games(w.u.ana, w.u.luis, { p_sport: 'padel' })).map((g) => g.id)).toEqual([x.match]);
    // Alguien sin acceso al Banco no ve ese juego; alguien que no lo ve, nada.
    expect((await games(w.u.otra, w.u.luis)).map((g) => g.id)).toEqual([x.match, x.t1Luis]);
    expect(await games(w.u.extra, w.u.org)).toEqual([]);
  });

  it('estadísticas por deporte', async () => {
    const s = await db.rpc<Json>(w.u.otra, 'profile_stats', { p_user: w.u.luis });
    expect(s).toEqual({
      bowling: { sessions: 1, series: [[190, 210]] },
      matches: [{ sport: 'padel', played: 1, won: 1, lost: 0, drawn: 0 }],
      golf: null,
      swim: null,
    });
    // Del lado que perdió.
    expect((await db.rpc<Json>(w.u.luis, 'profile_stats', { p_user: w.u.otra })).matches).toEqual([
      { sport: 'padel', played: 1, won: 0, lost: 1, drawn: 0 },
    ]);
    expect(await db.rpc(w.u.extra, 'profile_stats', { p_user: w.u.org })).toBeNull();
  });
});

describe('me gusta', () => {
  it('boliche: es una reacción «like»; quitarla la borra; una felicitación ya cuenta', async () => {
    // otra no es de la liga pública, pero la ve: puede dar me gusta.
    expect(await like(w.u.otra, 'bowling', x.t1Luis)).toEqual({ likes: 1, liked: true });
    expect(await like(w.u.otra, 'bowling', x.t1Luis)).toEqual({ likes: 1, liked: true });
    expect(await db.admin('select user_id, author_name, type from public.reactions where entry_id = $1', [x.t1Luis])).toEqual([
      { user_id: w.u.otra, author_name: 'otra', type: 'like' },
    ]);
    expect(await like(w.u.otra, 'bowling', x.t1Luis, false)).toEqual({ likes: 0, liked: false });
    // Liga privada: solo sus miembros.
    await fails(like(w.u.otra, 'bowling', w.e1Luis), DENIED);
    await db.rpc(w.u.ana, 'set_reaction', { p_entry: w.e1Luis, p_type: 'felicitar' });
    expect(await like(w.u.ana, 'bowling', w.e1Luis)).toEqual({ likes: 1, liked: true });
    expect(await db.admin('select type from public.reactions where entry_id = $1', [w.e1Luis])).toEqual([{ type: 'felicitar' }]);
    await fails(like(w.u.ana, 'bowling', randomUUID()), 'no_existe');
    await fails(like(w.u.ana, 'dardos', x.t1Luis), INVALID);
  });

  it('partido: por jugador; solo quien jugó, con resultado, y la liga y el jugador salen del partido', async () => {
    expect(await like(w.u.extra, 'match', x.match, true, x.pp.luis)).toEqual({ likes: 1, liked: true });
    expect(await like(w.u.otra, 'match', x.match, true, x.pp.luis)).toEqual({ likes: 2, liked: true });
    expect(await like(w.u.otra, 'match', x.match, true, x.pp.ana)).toEqual({ likes: 1, liked: true });
    expect(await db.admin('select league_id, kind from public.game_likes where match_id = $1 and user_id = $2 and player_id = $3', [x.match, w.u.otra, x.pp.luis])).toEqual([
      { league_id: x.padel, kind: 'match' },
    ]);
    const [m] = await games(w.u.otra, w.u.luis, { p_sport: 'padel' });
    expect(m).toMatchObject({ likes: 2, likedByMe: true });
    // Un jugador que no jugó ese partido, o un partido sin resultado: no.
    await fails(like(w.u.otra, 'match', x.match, true, w.p.luis), INVALID);
    await fails(like(w.u.otra, 'match', x.match, true, null), INVALID);
    await db.admin(`update public.matches set status = 'scheduled', winner_side = null where id = $1`, [x.match]);
    await fails(like(w.u.nuevo, 'match', x.match, true, x.pp.luis), INVALID);
    // Quitarlo sí se puede siempre.
    expect(await like(w.u.otra, 'match', x.match, false, x.pp.luis)).toEqual({ likes: 1, liked: false });
    // Tiempo real a la cuenta dueña del juego (no a quien da el me gusta).
  });

  it('los me gusta los ven quienes ven la liga', async () => {
    await like(w.u.otra, 'match', x.match, true, x.pp.luis);
    expect(await db.asUser(w.u.extra, 'select user_id from public.game_likes')).toEqual([{ user_id: w.u.otra }]);
    await db.admin(`update public.leagues set visibility = 'private' where id = $1`, [x.padel]);
    expect(await db.asUser(w.u.extra, 'select user_id from public.game_likes')).toEqual([]);
    expect(await db.asUser(w.u.luis, 'select user_id from public.game_likes')).toEqual([{ user_id: w.u.otra }]);
    await fails(like(w.u.extra, 'match', x.match, true, x.pp.luis), DENIED);
  });

  it('golf: me gusta en la tarjeta del jugador', async () => {
    const golf = await league(db, w.u.otro, { name: 'Golf Abierto', visibility: 'public', sport: 'golf', requirePhoto: false });
    await member(db, golf, w.u.otro, 'owner', 'otro');
    await member(db, golf, w.u.luis, 'member', 'luis');
    const gp = await player(db, golf, 'Luis', w.u.luis);
    const holes = Array.from({ length: 18 }, (_, i) => ({ par: i % 3 === 0 ? 5 : 4, si: i + 1 }));
    const course = await db.rpc<string>(w.u.otro, 'golf_save_course', {
      p_league: golf,
      p_name: 'Campo',
      p_holes: holes,
      p_tees: [{ id: 'azul', name: 'Azul', rating: 72, slope: 125, par: holes.reduce((a, h) => a + h.par, 0) }],
    });
    const round = await db.rpc<string>(w.u.otro, 'golf_create_round', { p_league: golf, p_date: '2026-09-26', p_course: course });
    const card = await db.rpc<string>(w.u.luis, 'golf_register', { p_event: round, p_tee: 'azul' });
    await db.rpc(w.u.luis, 'golf_save_hole_scores', {
      p_op_id: randomUUID(),
      p_event: round,
      p_cards: [{ card_id: card, holes: holes.map((h, i) => ({ i, s: h.par })) }],
    });
    const [g] = await games(w.u.otra, w.u.luis, { p_sport: 'golf' });
    expect(g).toMatchObject({ kind: 'golf', id: card, url: `/l/${golf}/e/${round}`, detail: { course: 'Campo', holes: 18, played: 18, gross: 78 } });
    expect(await like(w.u.otra, 'golf', card)).toEqual({ likes: 1, liked: true });
    expect((await db.rpc<Json>(w.u.otra, 'profile_stats', { p_user: w.u.luis })).golf).toEqual({ rounds: 1, best18: 78, avg18: 78, best9: null });
    // Aviso para luis.
    const notices = await db.rpc<Json[]>(w.u.luis, 'social_notices', {});
    expect(notices).toEqual([expect.objectContaining({ kind: 'like', userId: w.u.otra, name: 'otra', gameKind: 'golf', id: card, url: `/l/${golf}/e/${round}` })]);
  });

  it('natación: un resultado que no existe', async () => {
    await fails(like(w.u.otra, 'swim', randomUUID()), 'no_existe');
  });

  it('ritmo: 300 cambios por hora', async () => {
    await db.admin(`insert into private.rate_limits (key, window_start, hits) values ($1, now(), 300)`, [`like:u:${w.u.otra}`]);
    await fails(like(w.u.otra, 'match', x.match, true, x.pp.luis), 'rate_limited');
  });
});

describe('inicio y campana', () => {
  it('juegos de quienes sigo, por deporte', async () => {
    expect(await db.rpc(w.u.otra, 'following_games', {})).toEqual([]);
    await follow(w.u.otra, w.u.luis);
    await follow(w.u.otra, w.u.ana);
    const all = await db.rpc<Game[]>(w.u.otra, 'following_games', {});
    // El partido sale una vez por cada jugador (es el juego de cada uno); el Banco (privado) no.
    expect(all.map((g) => g.kind)).toEqual(['match', 'match', 'bowling']);
    expect(all.slice(0, 2).map((g) => g.userId).sort()).toEqual([w.u.luis, w.u.ana].sort());
    expect(all[2]).toMatchObject({ id: x.t1Luis, userId: w.u.luis, userName: 'luis' });
    expect((await db.rpc<Game[]>(w.u.otra, 'following_games', { p_sport: 'bowling' })).map((g) => g.id)).toEqual([x.t1Luis]);
  });

  it('avisos: te empezó a seguir y le gustó tu juego (no los propios ni los del boliche)', async () => {
    await follow(w.u.ana, w.u.luis);
    await like(w.u.otra, 'match', x.match, true, x.pp.luis);
    await like(w.u.luis, 'match', x.match, true, x.pp.luis);
    await like(w.u.otra, 'bowling', x.t1Luis);
    const n = await db.rpc<Json[]>(w.u.luis, 'social_notices', {});
    expect(n.map((i) => [i.kind, i.name])).toEqual(
      expect.arrayContaining([
        ['follow', 'ana'],
        ['like', 'otra'],
      ]),
    );
    expect(n).toHaveLength(2);
    expect(n.find((i) => i.kind === 'like')).toMatchObject({ gameKind: 'match', id: x.match, sport: 'padel', url: `/l/${x.padel}/juegos?partido=${x.match}` });
    expect(await db.rpc(w.u.ana, 'social_notices', { p_limit: 500 })).toEqual([]);
  });
});
