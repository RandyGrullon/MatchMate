/**
 * Red social (20261009000100_red_social.sql y el Storage de 20261009000110_red_social_supabase.sql; contrato en
 * docs/red-social.md): publicaciones (quién ve qué, bloqueos, ligas privadas y con menores), el feed y sus páginas,
 * me gusta y comentarios (contadores, avisos y tiempo real), borrar, seguir y buscar ligas, biografía, foto de perfil,
 * bloquear, lo que cambió en el perfil, la búsqueda, seguir y la campana, los reportes, la cola de Storage y las
 * políticas de los buckets.
 *
 * Mundo (fixture): liga privada del Banco (org dueño, sofi admin, luis y ana miembros) y liga pública Abierta de otro.
 * Cuentas sin liga: nuevo, otra y extra; superadmins dios y dios2.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, MIGRATIONS_DIR, SERVICE, TestDb, fails } from './harness';
import { league, makeWorld, member, type World } from './fixture';

let db: TestDb;
let w: World;

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
});
afterEach(async () => {
  await db.rollback();
});

type Json = Record<string, unknown>;
interface PersonLite {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
}
interface Post {
  id: string;
  author: PersonLite;
  text: string;
  photo: { path: string; w: number | null; h: number | null } | null;
  league: { id: string; name: string; sport: string } | null;
  sport: string | null;
  visibility: 'public' | 'followers' | 'league';
  at: string;
  likes: number;
  likedByMe: boolean;
  comments: number;
  isMine: boolean;
  canDelete: boolean;
}
interface PostComment {
  id: string;
  postId: string;
  author: PersonLite;
  text: string;
  at: string;
  isMine: boolean;
  canDelete: boolean;
}
interface LeagueHit {
  id: string;
  name: string;
  sport: string;
  kind: string;
  visibility: string;
  venue: string | null;
  logo: string | null;
  members: number;
  followers: number;
  isMember: boolean;
  isFollowing: boolean;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const uuid = () => randomUUID();

const NEW_RPC = [
  'add_post_comment', 'block_user', 'create_post', 'delete_post', 'delete_post_comment', 'follow_league', 'followed_leagues',
  'league_posts', 'league_social', 'my_blocked_users', 'post_comments', 'post_detail', 'search_leagues', 'set_avatar', 'set_bio',
  'set_post_like', 'social_feed', 'unblock_user', 'unfollow_league', 'user_posts',
];
const HELPERS = [
  'blocked_between', 'social_clean_text', 'social_text_ok', 'social_snippet', 'person_lite', 'can_see_post', 'post_json',
  'post_comment_json', 'league_hit', 'post_push_body', 'post_likes_count', 'post_comments_count', 'queue_post_photo_purge',
  'queue_avatar_purge',
];

/** Sin los límites de publicar y comentar (en la prueba now() no avanza: el de 3 s nunca se vencería). */
const resetLimits = () => db.admin(`delete from private.rate_limits where key like 'post:%' or key like 'post_comment:%'`);
const createPost = (who: string, args: Json) => db.rpc<Post>(who, 'create_post', args);
/** Publica (sin los límites) y devuelve el Post. */
async function mkPost(who: string, args: Json = {}): Promise<Post> {
  await resetLimits();
  return createPost(who, { p_id: uuid(), p_text: 'Hola', ...args });
}
/** La hora de una publicación: hace `mins` minutos. */
const setAt = (id: string, mins: number) =>
  db.admin(`update public.posts set created_at = date_trunc('milliseconds', now()) - make_interval(mins => $2) where id = $1`, [id, mins]);
const detail = (who: string, id: string) => db.rpc<Post | null>(who, 'post_detail', { p_post: id });
const sees = async (who: string, id: string) => (await detail(who, id)) !== null;
const feed = (who: string, scope: string | null = 'following', limit: number | null = null, before: string | null = null, beforeId: string | null = null) =>
  db.rpc<Post[]>(who, 'social_feed', { p_scope: scope, p_limit: limit, p_before: before, p_before_id: beforeId });
const ids = (list: { id: string }[]) => list.map((x) => x.id);
const like = (who: string, id: string, liked = true) => db.rpc<{ likes: number; liked: boolean }>(who, 'set_post_like', { p_post: id, p_liked: liked });
/** Comenta (sin el límite de uno cada 3 s). */
async function comment(who: string, postId: string, text: string, id: string | null = null): Promise<PostComment> {
  await db.admin(`delete from private.rate_limits where key = $1`, [`post_comment:s:${who}`]);
  return db.rpc<PostComment>(who, 'add_post_comment', { p_post: postId, p_text: text, p_id: id });
}
/** La hora de un comentario: hace `mins` minutos. */
const commentAt = (id: string, mins: number) =>
  db.admin(`update public.post_comments set created_at = date_trunc('milliseconds', now()) - make_interval(mins => $2) where id = $1`, [id, mins]);
const comments = (who: string, postId: string, limit: number | null = null, after: string | null = null, afterId: string | null = null) =>
  db.rpc<PostComment[]>(who, 'post_comments', { p_post: postId, p_limit: limit, p_after: after, p_after_id: afterId });
const follow = (a: string, b: string) => db.admin('insert into public.follows (follower_id, followee_id) values ($1, $2)', [a, b]);
const superBlock = (id: string) => db.rpc(w.u.dios, 'admin_block_user', { p_user: id, p_reason: 'prueba' });
const blockUser = (a: string, b: string) => db.rpc<{ blocked: boolean }>(a, 'block_user', { p_user: b });
const fillLimit = (key: string, hits: number) =>
  db.admin(
    `insert into private.rate_limits (key, window_start, hits) values ($1, now(), $2)
     on conflict (key) do update set window_start = now(), hits = excluded.hits`,
    [key, hits],
  );
const phone = (uid: string) =>
  db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'BPclave', 'secreto')`, [
    uid,
    `https://fcm.googleapis.com/fcm/send/${uid}`,
  ]);
const pushes = (uid: string) => db.admin<Json>('select title, body, url, tag from public.push_outbox where user_id = $1 order by id', [uid]);
const queue = () => db.admin<{ path: string; bucket: string }>('select path, bucket from private.storage_purge_queue order by path');
const avatarPath = (uid: string, ext = 'webp') => `${uid}/${uuid()}.${ext}`;

/** En la transacción de la prueba: un realtime.send falso que guarda lo que emit manda (como en Supabase). */
async function captureRealtime() {
  await db.admin('create schema if not exists realtime');
  await db.admin('create table realtime.sent (n serial, payload jsonb, event text, topic text, private boolean)');
  await db.admin(`create function realtime.send(payload jsonb, event text, topic text, private boolean default false) returns void
                  language sql as $$ insert into realtime.sent (payload, event, topic, private) values (payload, event, topic, private) $$`);
  return (event: string) =>
    db.admin<{ topic: string; payload: Json }>(`select topic, payload from realtime.sent where event = $1 order by n`, [event]);
}

// =====================================================================

describe('permisos', () => {
  it('las RPC nuevas: solo con sesión, security definer, search_path vacío y pasan por require_uid; las ayudas, nadie de la app', async () => {
    const rows = await db.admin<{ fn: string; definer: boolean; anon: boolean; auth: boolean; uid: boolean; path: boolean }>(
      `select p.proname as fn, p.prosecdef as definer, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth, p.prosrc like '%private.require_uid()%' as uid,
              'search_path=""' = any (p.proconfig) as path
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1) order by 1`,
      [NEW_RPC],
    );
    expect(rows).toEqual(NEW_RPC.map((fn) => ({ fn, definer: true, anon: false, auth: true, uid: true, path: true })));
    const helpers = await db.admin<{ fn: string; auth: boolean; anon: boolean }>(
      `select p.proname as fn, has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('anon', p.oid, 'execute') as anon
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = any ($1) order by 1`,
      [HELPERS],
    );
    expect(helpers).toHaveLength(HELPERS.length);
    for (const h of helpers) expect(h, h.fn).toMatchObject({ auth: false, anon: false });
    // Sin cuenta, nada.
    await fails(db.rpc(ANON, 'social_feed', {}), '42501');
    await fails(db.rpc(ANON, 'create_post', { p_id: uuid(), p_text: 'hola' }), '42501');
    await fails(db.rpc(ANON, 'search_leagues', { p_query: 'liga' }), '42501');
    await fails(db.as(w.u.luis, `select private.can_see_post($1, null, 'public')`, [w.u.ana]), '42501');
    // La cola de Storage sigue siendo solo de service_role.
    await fails(db.as(w.u.dios, `select * from public.purge_queue_take(p_bucket => 'avatars')`), '42501');
    await fails(db.as(w.u.dios, `select public.purge_queue_done('{}', 'posts')`), '42501');
  });

  it('las tablas: RLS y nadie las lee ni escribe directo (todo por RPC)', async () => {
    const tables = ['posts', 'post_likes', 'post_comments', 'league_follows', 'user_blocks'];
    const rls = await db.admin<{ relname: string; rls: boolean }>(
      `select c.relname, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any ($1) order by 1`,
      [tables],
    );
    expect(rls).toEqual([...tables].sort().map((relname) => ({ relname, rls: true })));
    await mkPost(w.u.luis);
    for (const t of tables) {
      for (const who of [w.u.luis, w.u.dios]) {
        await fails(db.asUser(who, `select * from public.${t}`), '42501');
        await fails(db.asUser(who, `delete from public.${t}`), '42501');
      }
    }
    await fails(db.asUser(w.u.luis, 'select * from private.posts_deleted'), '42501');
    await fails(db.asUser(w.u.luis, `insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)`, [w.u.luis, w.u.ana]), '42501');
    // El perfil propio sí trae las columnas nuevas.
    expect(await db.asUser(w.u.luis, 'select bio, avatar_path from public.profiles')).toEqual([{ bio: null, avatar_path: null }]);
  });
});

// =====================================================================

describe('publicar', () => {
  it('una publicación de texto: el Post completo, con el autor (PersonLite) y la hora ISO', async () => {
    const id = uuid();
    const p = await createPost(w.u.luis, { p_id: id, p_text: 'Mi primer juego' });
    expect(p).toEqual({
      id,
      author: { id: w.u.luis, name: 'luis', username: 'luis', avatar: null },
      text: 'Mi primer juego',
      photo: null,
      league: null,
      sport: null,
      visibility: 'public',
      at: expect.stringMatching(ISO),
      likes: 0,
      likedByMe: false,
      comments: 0,
      isMine: true,
      canDelete: true,
    });
    // Otra cuenta la ve igual, sin poder borrarla.
    expect(await detail(w.u.extra, id)).toEqual({ ...p, isMine: false, canDelete: false });
    // El superadmin puede borrarla.
    expect(await detail(w.u.dios, id)).toMatchObject({ isMine: false, canDelete: true });
  });

  it('el texto se limpia (saltos de línea, a lo más una línea en blanco, sin espacios alrededor); emoji y enlaces pasan', async () => {
    const p = await mkPost(w.u.luis, { p_text: '  \r\n Hola  \r\n\r\n\r\n\r\nmundo \t\n\u0007 🎳 https://example.com/x?y=1  \n\n' });
    expect(p.text).toBe('Hola\n\nmundo\n 🎳 https://example.com/x?y=1');
    const long = await mkPost(w.u.luis, { p_text: 'x'.repeat(1000) });
    expect(long.text).toHaveLength(1000);
    await resetLimits();
    await fails(createPost(w.u.luis, { p_id: uuid(), p_text: 'x'.repeat(1001) }), 'invalido');
  });

  it('mismo p_id otra vez devuelve la que ya está (sin contar en el límite); de otra cuenta: duplicado', async () => {
    const id = uuid();
    const first = await mkPost(w.u.luis, { p_id: id, p_text: 'Una vez' });
    await fillLimit(`post:h:${w.u.luis}`, 10);
    const again = await createPost(w.u.luis, { p_id: id, p_text: 'Otra cosa' });
    expect(again).toEqual(first);
    expect(await db.count('public.posts', 'author_id = $1', [w.u.luis])).toBe(1);
    await fails(createPost(w.u.ana, { p_id: id, p_text: 'Mía' }), 'duplicado');
    // Borrada, el reintento viejo no la revive.
    await db.rpc(w.u.luis, 'delete_post', { p_post: id });
    await resetLimits();
    await fails(createPost(w.u.luis, { p_id: id, p_text: 'Una vez' }), 'no_existe');
    expect(await db.count('public.posts', 'id = $1', [id])).toBe(0);
  });

  it('lo que no sirve: sin texto ni foto, id nulo, a quién raro, deporte raro, followers con liga, league sin liga', async () => {
    await resetLimits();
    for (const args of [
      { p_text: '' },
      { p_text: '   \n\n  ' },
      { p_text: null },
      { p_text: 'hola', p_visibility: 'amigos' },
      { p_text: 'hola', p_visibility: 'league' },
      { p_text: 'hola', p_sport: 'Bowling!' },
      { p_text: 'hola', p_sport: 'x' },
      { p_text: 'hola', p_league: w.priv, p_visibility: 'followers' },
    ]) {
      await fails(createPost(w.u.luis, { p_id: uuid(), ...args }), 'invalido');
    }
    await fails(createPost(w.u.luis, { p_id: null, p_text: 'hola' }), 'invalido');
    // Sin liga: el deporte que se elija (o ninguno); a quién: public o followers.
    expect(await mkPost(w.u.luis, { p_sport: ' PADEL ' })).toMatchObject({ sport: 'padel', league: null });
    expect(await mkPost(w.u.luis, { p_visibility: 'followers' })).toMatchObject({ visibility: 'followers' });
    // Sin cuenta o bloqueada, nada.
    await superBlock(w.u.otra);
    await fails(createPost(w.u.otra, { p_id: uuid(), p_text: 'hola' }), 'bloqueada');
  });

  it('la foto: exactamente <yo>/<p_id>.webp|jpg, con su tamaño; puede ir sin texto', async () => {
    const id = uuid();
    const p = await mkPost(w.u.luis, { p_id: id, p_text: '', p_photo: `${w.u.luis}/${id}.webp`, p_photo_w: 1080, p_photo_h: 1350 });
    expect(p).toMatchObject({ text: '', photo: { path: `${w.u.luis}/${id}.webp`, w: 1080, h: 1350 } });
    const id2 = uuid();
    expect((await mkPost(w.u.luis, { p_id: id2, p_photo: `${w.u.luis}/${id2}.jpg` })).photo).toEqual({ path: `${w.u.luis}/${id2}.jpg`, w: null, h: null });
    await resetLimits();
    const id3 = uuid();
    for (const [photo, pw, ph] of [
      [`${w.u.ana}/${id3}.webp`, null, null],
      [`${w.u.luis}/${uuid()}.webp`, null, null],
      [`${w.u.luis}/${id3}.png`, null, null],
      [`${w.u.luis}/${id3}.WEBP`, null, null],
      [`/${w.u.luis}/${id3}.webp`, null, null],
      [`${w.u.luis}/${id3}.webp`, 0, 100],
      [`${w.u.luis}/${id3}.webp`, 100, 10001],
    ] as [string, number | null, number | null][]) {
      await fails(createPost(w.u.luis, { p_id: id3, p_text: 'x', p_photo: photo, p_photo_w: pw, p_photo_h: ph }), 'invalido');
    }
    // Sin foto, el tamaño no se guarda.
    expect((await mkPost(w.u.luis, { p_photo_w: 100, p_photo_h: 100 })).photo).toBeNull();
  });

  it('en una liga: solo miembros y sin menores; pública: public o league; privada: solo league; el deporte es el de la liga', async () => {
    const inPriv = await mkPost(w.u.luis, { p_league: w.priv, p_visibility: 'league', p_sport: 'golf' });
    expect(inPriv).toMatchObject({ league: { id: w.priv, name: 'Liga del Banco', sport: 'bowling' }, sport: 'bowling', visibility: 'league' });
    await resetLimits();
    await fails(createPost(w.u.luis, { p_id: uuid(), p_text: 'x', p_league: w.priv, p_visibility: 'public' }), 'invalido');
    await fails(createPost(w.u.luis, { p_id: uuid(), p_text: 'x', p_league: w.priv }), 'invalido');
    // En la pública: su dueño (miembro) elige.
    expect(await mkPost(w.u.otro, { p_league: w.pub })).toMatchObject({ visibility: 'public', league: { id: w.pub } });
    expect(await mkPost(w.u.otro, { p_league: w.pub, p_visibility: 'league' })).toMatchObject({ visibility: 'league' });
    // Quien no es miembro, no (ni el superadmin); una liga que no existe.
    await resetLimits();
    await fails(createPost(w.u.extra, { p_id: uuid(), p_text: 'x', p_league: w.pub }), DENIED);
    await fails(createPost(w.u.dios, { p_id: uuid(), p_text: 'x', p_league: w.pub }), DENIED);
    await fails(createPost(w.u.luis, { p_id: uuid(), p_text: 'x', p_league: w.pub }), DENIED);
    await fails(createPost(w.u.luis, { p_id: uuid(), p_text: 'x', p_league: uuid(), p_visibility: 'league' }), 'no_existe');
    // Liga con menores: nada social.
    const kids = await league(db, w.u.org, { name: 'Infantil', visibility: 'private', requirePhoto: false, hasMinors: true });
    await member(db, kids, w.u.org, 'owner', 'org');
    await fails(createPost(w.u.org, { p_id: uuid(), p_text: 'x', p_league: kids, p_visibility: 'league' }), DENIED);
  });

  it('palabras prohibidas: palabras (también separadas, con números o mayúsculas); las palabras sanas pasan', async () => {
    for (const bad of ['Eres un PENDEJO', 'qué m1erd@ de juego', 'p u t a', 'p.u.t.a', 'son unas putas', 'comemierda total', 'Cabrón']) {
      await resetLimits();
      await fails(createPost(w.u.luis, { p_id: uuid(), p_text: bad }), 'palabras');
    }
    for (const fine of ['El hijo de Rafael jugó bien', 'Una disputa por el primer lugar', 'Fue ridículo 😂', 'Singapur 2026', 'Ve a https://www.youtube.com/watch?v=abc']) {
      expect((await mkPost(w.u.luis, { p_text: fine })).text).toBe(fine);
    }
    expect(await db.count('public.posts', 'author_id = $1', [w.u.luis])).toBe(5);
  });

  it('límites: 10 por hora y 40 por día', async () => {
    await resetLimits();
    for (let i = 0; i < 10; i++) await createPost(w.u.luis, { p_id: uuid(), p_text: `p${i}` });
    await fails(createPost(w.u.luis, { p_id: uuid(), p_text: 'once' }), 'rate_limited');
    // Otra cuenta no se ve afectada.
    await createPost(w.u.ana, { p_id: uuid(), p_text: 'hola' });
    await db.admin(`update private.rate_limits set window_start = now() - interval '61 minutes' where key = $1`, [`post:h:${w.u.luis}`]);
    await createPost(w.u.luis, { p_id: uuid(), p_text: 'otra hora' });
    await fillLimit(`post:d:${w.u.luis}`, 40);
    await db.admin(`delete from private.rate_limits where key = $1`, [`post:h:${w.u.luis}`]);
    await fails(createPost(w.u.luis, { p_id: uuid(), p_text: 'otro día' }), 'rate_limited');
    // Lo que falla no cuenta.
    await resetLimits();
    await fails(createPost(w.u.luis, { p_id: uuid(), p_text: 'pendejo' }), 'palabras');
    expect(await db.count('private.rate_limits', `key like 'post:%' and key like $1`, [`%${w.u.luis}`])).toBe(0);
  });
});

// =====================================================================

describe('quién ve qué', () => {
  it('public: cualquiera con sesión; followers: el autor y quien lo sigue; el superadmin, todas', async () => {
    const pub = await mkPost(w.u.extra, { p_text: 'para todos' });
    const fol = await mkPost(w.u.extra, { p_text: 'para mis seguidores', p_visibility: 'followers' });
    for (const who of [w.u.luis, w.u.otra, w.u.extra, w.u.dios]) expect(await sees(who, pub.id), who).toBe(true);
    expect(await sees(w.u.extra, fol.id)).toBe(true);
    expect(await sees(w.u.luis, fol.id)).toBe(false);
    expect(await sees(w.u.dios, fol.id)).toBe(true);
    // Seguir a extra la destapa; que extra me siga a mí, no.
    await follow(w.u.extra, w.u.ana);
    expect(await sees(w.u.ana, fol.id)).toBe(false);
    await follow(w.u.luis, w.u.extra);
    expect(await sees(w.u.luis, fol.id)).toBe(true);
    expect(await detail(w.u.luis, fol.id)).toMatchObject({ visibility: 'followers', isMine: false, canDelete: false });
    expect(await detail(w.u.otra, uuid())).toBeNull();
  });

  it('league: solo los miembros (también en una liga pública); public de una liga pública: cualquiera', async () => {
    const priv = await mkPost(w.u.luis, { p_league: w.priv, p_visibility: 'league' });
    for (const who of [w.u.org, w.u.sofi, w.u.ana, w.u.luis, w.u.dios]) expect(await sees(who, priv.id), who).toBe(true);
    for (const who of [w.u.otro, w.u.extra]) expect(await sees(who, priv.id), who).toBe(false);
    const pubLeague = await mkPost(w.u.otro, { p_league: w.pub, p_visibility: 'league' });
    expect(await sees(w.u.extra, pubLeague.id)).toBe(false);
    expect(await sees(w.u.otro, pubLeague.id)).toBe(true);
    const pubAll = await mkPost(w.u.otro, { p_league: w.pub });
    expect(await sees(w.u.extra, pubAll.id)).toBe(true);
  });

  it('si la liga deja de ser pública, una public de esa liga es solo para sus miembros (y sale como league)', async () => {
    const p = await mkPost(w.u.otro, { p_league: w.pub });
    await member(db, w.pub, w.u.ana, 'member', 'ana');
    await db.admin(`update public.leagues set visibility = 'private' where id = $1`, [w.pub]);
    expect(await sees(w.u.extra, p.id)).toBe(false);
    expect(await detail(w.u.ana, p.id)).toMatchObject({ visibility: 'league' });
    expect(await detail(w.u.dios, p.id)).toMatchObject({ visibility: 'league' });
    expect(ids(await feed(w.u.extra, 'discover'))).not.toContain(p.id);
    // Vuelve a ser pública: vuelve a verse.
    await db.admin(`update public.leagues set visibility = 'public' where id = $1`, [w.pub]);
    expect(await detail(w.u.extra, p.id)).toMatchObject({ visibility: 'public' });
  });

  it('liga con menores: lo social está apagado (nadie la ve, ni sus miembros; el superadmin sí)', async () => {
    const p = await mkPost(w.u.luis, { p_league: w.priv, p_visibility: 'league' });
    await db.admin('update public.leagues set require_photo = false, has_minors = true where id = $1', [w.priv]);
    for (const who of [w.u.luis, w.u.ana, w.u.org]) expect(await sees(who, p.id), who).toBe(false);
    expect(await sees(w.u.dios, p.id)).toBe(true);
    expect(await db.rpc(w.u.ana, 'league_posts', { p_league: w.priv })).toEqual([]);
    expect(await db.rpc<Json>(w.u.luis, 'league_social', { p_league: w.priv })).toMatchObject({ canPost: false, canFollow: false });
  });

  it('autor bloqueado por el superadmin: no se ve (el superadmin sí)', async () => {
    const p = await mkPost(w.u.extra);
    await superBlock(w.u.extra);
    expect(await sees(w.u.luis, p.id)).toBe(false);
    expect(await sees(w.u.dios, p.id)).toBe(true);
    expect(await db.rpc(w.u.luis, 'user_posts', { p_user: w.u.extra })).toEqual([]);
  });

  it('bloqueos: ni quien bloqueó ni el bloqueado ven lo del otro (feed, perfil, detalle)', async () => {
    const pa = await mkPost(w.u.ana, { p_text: 'de ana' });
    const pe = await mkPost(w.u.extra, { p_text: 'de extra' });
    await follow(w.u.ana, w.u.extra);
    await follow(w.u.extra, w.u.ana);
    await blockUser(w.u.ana, w.u.extra);
    expect(await sees(w.u.ana, pe.id)).toBe(false);
    expect(await sees(w.u.extra, pa.id)).toBe(false);
    expect(ids(await feed(w.u.ana, 'discover'))).not.toContain(pe.id);
    expect(ids(await feed(w.u.extra, 'discover'))).not.toContain(pa.id);
    expect(await db.rpc(w.u.extra, 'user_posts', { p_user: w.u.ana })).toEqual([]);
    expect(await db.rpc(w.u.ana, 'user_posts', { p_user: w.u.extra })).toEqual([]);
    // Los demás siguen viendo las dos; el superadmin también.
    expect(await sees(w.u.luis, pa.id)).toBe(true);
    expect(await sees(w.u.luis, pe.id)).toBe(true);
    // Desbloquear las destapa.
    await db.rpc(w.u.ana, 'unblock_user', { p_user: w.u.extra });
    expect(await sees(w.u.extra, pa.id)).toBe(true);
  });
});

// =====================================================================

describe('feed y páginas', () => {
  it('following: las mías, de quien sigo, de mis ligas y de las ligas que sigo; discover: las públicas de todos', async () => {
    const mine = await mkPost(w.u.ana, { p_text: 'mía' });
    const followed = await mkPost(w.u.extra, { p_text: 'de extra (lo sigo)' });
    const followedOnly = await mkPost(w.u.extra, { p_text: 'solo seguidores', p_visibility: 'followers' });
    const myLeague = await mkPost(w.u.luis, { p_league: w.priv, p_visibility: 'league' });
    const followedLeague = await mkPost(w.u.otro, { p_league: w.pub });
    const otherLeagueOnly = await mkPost(w.u.otro, { p_league: w.pub, p_visibility: 'league' });
    const stranger = await mkPost(w.u.otra, { p_text: 'de alguien que no sigo' });
    const strangerFollowers = await mkPost(w.u.otra, { p_visibility: 'followers' });
    await follow(w.u.ana, w.u.extra);
    await db.rpc(w.u.ana, 'follow_league', { p_league: w.pub });

    const following = ids(await feed(w.u.ana));
    expect(following.sort()).toEqual([mine.id, followed.id, followedOnly.id, myLeague.id, followedLeague.id].sort());
    for (const no of [otherLeagueOnly.id, stranger.id, strangerFollowers.id]) expect(following).not.toContain(no);

    const discover = ids(await feed(w.u.ana, 'discover'));
    expect(discover.sort()).toEqual([mine.id, followed.id, followedLeague.id, stranger.id].sort());
    // Sin el parámetro: following.
    expect(ids(await db.rpc<Post[]>(w.u.ana, 'social_feed', {})).sort()).toEqual([...following].sort());
    await fails(feed(w.u.ana, 'amigos'), 'invalido');
  });

  it('más nuevas primero y por páginas (p_before, p_before_id), también con la misma hora; hasta 50', async () => {
    const posts: Post[] = [];
    for (let i = 0; i < 6; i++) posts.push(await mkPost(w.u.luis, { p_text: `p${i}` }));
    // Hora distinta para 4; las dos últimas con la misma hora (las ordena el id).
    for (let i = 0; i < 4; i++) await setAt(posts[i].id, 60 - i * 10);
    await setAt(posts[4].id, 5);
    await setAt(posts[5].id, 5);
    const sameTime = [posts[4].id, posts[5].id].sort().reverse();
    const expected = [...sameTime, posts[3].id, posts[2].id, posts[1].id, posts[0].id];
    const all = await feed(w.u.luis);
    expect(ids(all)).toEqual(expected);
    expect(all.map((p) => p.at)).toEqual([...all.map((p) => p.at)].sort().reverse());

    const seen: string[] = [];
    let before: Post | null = null;
    for (let page = 0; page < 4; page++) {
      const list: Post[] = await feed(w.u.luis, 'following', 2, before?.at ?? null, before?.id ?? null);
      seen.push(...ids(list));
      if (list.length < 2) break;
      before = list[list.length - 1];
    }
    expect(seen).toEqual(expected);
    // El mismo cursor sirve en user_posts y en discover.
    const p1 = await db.rpc<Post[]>(w.u.ana, 'user_posts', { p_user: w.u.luis, p_limit: 3 });
    expect(ids(p1)).toEqual(expected.slice(0, 3));
    const p2 = await db.rpc<Post[]>(w.u.ana, 'user_posts', { p_user: w.u.luis, p_limit: 3, p_before: p1[2].at, p_before_id: p1[2].id });
    expect(ids(p2)).toEqual(expected.slice(3));
    // Solo la hora (sin id): las de antes de esa hora.
    const at4 = all.find((p) => p.id === posts[4].id)!.at;
    expect(ids(await feed(w.u.luis, 'discover', 50, at4))).toEqual([posts[3].id, posts[2].id, posts[1].id, posts[0].id]);
    // p_limit fuera de rango: entre 1 y 50.
    expect(await feed(w.u.luis, 'following', 0)).toHaveLength(1);
    expect(await feed(w.u.luis, 'following', 500)).toHaveLength(6);
  });

  it('user_posts y league_posts: solo lo que ve quien mira', async () => {
    const pub = await mkPost(w.u.luis, { p_text: 'pública' });
    const fol = await mkPost(w.u.luis, { p_visibility: 'followers' });
    const lg = await mkPost(w.u.luis, { p_league: w.priv, p_visibility: 'league' });
    await setAt(pub.id, 3);
    await setAt(fol.id, 2);
    await setAt(lg.id, 1);
    expect(ids(await db.rpc<Post[]>(w.u.luis, 'user_posts', { p_user: w.u.luis }))).toEqual([lg.id, fol.id, pub.id]);
    expect(ids(await db.rpc<Post[]>(w.u.ana, 'user_posts', { p_user: w.u.luis }))).toEqual([lg.id, pub.id]);
    expect(ids(await db.rpc<Post[]>(w.u.extra, 'user_posts', { p_user: w.u.luis }))).toEqual([pub.id]);
    expect(ids(await db.rpc<Post[]>(w.u.ana, 'league_posts', { p_league: w.priv }))).toEqual([lg.id]);
    expect(await db.rpc(w.u.extra, 'league_posts', { p_league: w.priv })).toEqual([]);
    expect(await db.rpc(w.u.extra, 'user_posts', { p_user: null })).toEqual([]);
  });
});

// =====================================================================

describe('me gusta', () => {
  it('dar y quitar: contador, likedByMe, idempotente; aviso al autor (juntos) y tiempo real', async () => {
    const sent = await captureRealtime();
    await phone(w.u.luis);
    const p = await mkPost(w.u.luis, { p_text: 'Hice 250 en el tercer juego' });
    expect(await like(w.u.ana, p.id)).toEqual({ likes: 1, liked: true });
    expect(await like(w.u.ana, p.id)).toEqual({ likes: 1, liked: true });
    expect(await detail(w.u.ana, p.id)).toMatchObject({ likes: 1, likedByMe: true });
    expect(await detail(w.u.extra, p.id)).toMatchObject({ likes: 1, likedByMe: false });
    expect(await pushes(w.u.luis)).toEqual([
      { title: 'A ana le gustó tu publicación', body: 'Hice 250 en el tercer juego', url: `/p/${p.id}`, tag: `reaccion:post:${p.id}` },
    ]);
    // El segundo (el aviso todavía espera): el mismo aviso con el texto nuevo.
    expect(await like(w.u.extra, p.id)).toEqual({ likes: 2, liked: true });
    expect(await pushes(w.u.luis)).toEqual([expect.objectContaining({ title: 'A extra y 1 más les gustó tu publicación', tag: `reaccion:post:${p.id}` })]);
    // El propio: ni aviso ni tiempo real.
    expect(await like(w.u.luis, p.id)).toEqual({ likes: 3, liked: true });
    expect(await pushes(w.u.luis)).toHaveLength(1);
    expect(await like(w.u.ana, p.id, false)).toEqual({ likes: 2, liked: false });
    expect(await like(w.u.ana, p.id, false)).toEqual({ likes: 2, liked: false });
    expect((await db.admin<{ likes: number }>('select likes from public.posts where id = $1', [p.id]))[0].likes).toBe(2);
    expect(await sent('post_like')).toEqual([
      { topic: `user:${w.u.luis}`, payload: { op: 'insert', postId: p.id, userId: w.u.ana } },
      { topic: `user:${w.u.luis}`, payload: { op: 'insert', postId: p.id, userId: w.u.extra } },
      { topic: `user:${w.u.luis}`, payload: { op: 'delete', postId: p.id, userId: w.u.ana } },
    ]);
  });

  it('solo a lo que se ve (no_existe); quitarlo, siempre; 300 por hora', async () => {
    const p = await mkPost(w.u.luis, { p_league: w.priv, p_visibility: 'league' });
    await fails(like(w.u.extra, p.id), 'no_existe');
    await fails(like(w.u.extra, uuid()), 'no_existe');
    await fails(like(w.u.extra, null as unknown as string), 'invalido');
    await like(w.u.ana, p.id);
    await blockUser(w.u.luis, w.u.ana);
    await fails(like(w.u.ana, p.id), 'no_existe');
    expect(await like(w.u.ana, p.id, false)).toEqual({ likes: 0, liked: false });
    const q = await mkPost(w.u.extra);
    await fillLimit(`like:u:${w.u.otra}`, 300);
    await fails(like(w.u.otra, q.id), 'rate_limited');
    await superBlock(w.u.otro);
    await fails(like(w.u.otro, q.id), 'bloqueada');
  });
});

// =====================================================================

describe('comentarios', () => {
  it('comentar: el PostComment, el contador, la lista del más viejo al más nuevo por páginas; aviso y tiempo real', async () => {
    const sent = await captureRealtime();
    await phone(w.u.luis);
    const p = await mkPost(w.u.luis, { p_text: 'Partidazo' });
    const c1 = await comment(w.u.ana, p.id, '  ¡Bien jugado!\n\n\n\n🎳  ');
    expect(c1).toEqual({
      id: expect.any(String),
      postId: p.id,
      author: { id: w.u.ana, name: 'ana', username: 'ana', avatar: null },
      text: '¡Bien jugado!\n\n🎳',
      at: expect.stringMatching(ISO),
      isMine: true,
      canDelete: true,
    });
    expect(await pushes(w.u.luis)).toEqual([
      { title: 'ana comentó tu publicación: «¡Bien jugado! 🎳»', body: 'Partidazo', url: `/p/${p.id}`, tag: `comentario:post:${p.id}` },
    ]);
    const c2 = await comment(w.u.extra, p.id, 'x'.repeat(500));
    // El último comentario reemplaza el aviso que espera (recortado a 80).
    expect((await pushes(w.u.luis))[0].title).toBe(`extra comentó tu publicación: «${'x'.repeat(80)}…»`);
    const c3 = await comment(w.u.luis, p.id, 'Gracias');
    expect(await pushes(w.u.luis)).toHaveLength(1);
    await commentAt(c1.id, 3);
    await commentAt(c2.id, 2);
    expect(await detail(w.u.ana, p.id)).toMatchObject({ comments: 3 });

    const all = await comments(w.u.extra, p.id);
    expect(ids(all)).toEqual([c1.id, c2.id, c3.id]);
    expect(all[0]).toMatchObject({ isMine: false, canDelete: false });
    // El autor de la publicación puede borrar todos.
    expect((await comments(w.u.luis, p.id)).map((c) => c.canDelete)).toEqual([true, true, true]);
    const page1 = await comments(w.u.extra, p.id, 2);
    expect(ids(page1)).toEqual([c1.id, c2.id]);
    expect(ids(await comments(w.u.extra, p.id, 2, page1[1].at, page1[1].id))).toEqual([c3.id]);
    expect(await sent('post_comment')).toEqual([
      { topic: `user:${w.u.luis}`, payload: { op: 'insert', postId: p.id, commentId: c1.id, userId: w.u.ana } },
      { topic: `user:${w.u.luis}`, payload: { op: 'insert', postId: p.id, commentId: c2.id, userId: w.u.extra } },
    ]);
  });

  it('p_id: el mismo otra vez devuelve el que ya está; de otra cuenta u otra publicación: duplicado', async () => {
    const p = await mkPost(w.u.luis);
    const q = await mkPost(w.u.luis);
    const id = uuid();
    const c = await comment(w.u.ana, p.id, 'Hola', id);
    expect(c.id).toBe(id);
    expect(await comment(w.u.ana, p.id, 'Otra cosa', id)).toEqual(c);
    expect(await detail(w.u.ana, p.id)).toMatchObject({ comments: 1 });
    await fails(comment(w.u.extra, p.id, 'Hola', id), 'duplicado');
    await fails(comment(w.u.ana, q.id, 'Hola', id), 'duplicado');
  });

  it('texto de 1 a 500, sin palabras prohibidas; uno cada 3 s y 120 por hora', async () => {
    const p = await mkPost(w.u.luis);
    for (const bad of ['', '   \n ', null, 'x'.repeat(501)]) await fails(comment(w.u.ana, p.id, bad as string), 'invalido');
    await fails(comment(w.u.ana, p.id, 'eres un idiota'), 'palabras');
    await fails(comment(w.u.ana, null as unknown as string, 'hola'), 'invalido');
    await db.admin(`delete from private.rate_limits where key like 'post_comment:%'`);
    await db.rpc(w.u.ana, 'add_post_comment', { p_post: p.id, p_text: 'uno' });
    await fails(db.rpc(w.u.ana, 'add_post_comment', { p_post: p.id, p_text: 'dos' }), 'rate_limited');
    await db.admin(`update private.rate_limits set window_start = now() - interval '4 seconds' where key = $1`, [`post_comment:s:${w.u.ana}`]);
    await db.rpc(w.u.ana, 'add_post_comment', { p_post: p.id, p_text: 'dos' });
    await fillLimit(`post_comment:h:${w.u.ana}`, 120);
    await fails(comment(w.u.ana, p.id, 'tres'), 'rate_limited');
    expect(await detail(w.u.ana, p.id)).toMatchObject({ comments: 2 });
  });

  it('no se comenta lo que no se ve (no_existe) ni con un bloqueo entre las dos cuentas (no_permitido)', async () => {
    const lg = await mkPost(w.u.luis, { p_league: w.priv, p_visibility: 'league' });
    await fails(comment(w.u.extra, lg.id, 'hola'), 'no_existe');
    await fails(comment(w.u.extra, uuid(), 'hola'), 'no_existe');
    const p = await mkPost(w.u.luis);
    await blockUser(w.u.luis, w.u.extra);
    await fails(comment(w.u.extra, p.id, 'hola'), DENIED);
    const q = await mkPost(w.u.extra);
    await fails(comment(w.u.luis, q.id, 'hola'), DENIED);
    expect(await comments(w.u.extra, p.id)).toEqual([]);
  });

  it('la lista no trae los de un bloqueo con quien mira ni los de cuentas bloqueadas por el superadmin (el superadmin, todos)', async () => {
    const p = await mkPost(w.u.luis);
    const ca = await comment(w.u.ana, p.id, 'de ana');
    const ce = await comment(w.u.extra, p.id, 'de extra');
    const co = await comment(w.u.otra, p.id, 'de otra');
    await commentAt(ca.id, 3);
    await commentAt(ce.id, 2);
    await commentAt(co.id, 1);
    await blockUser(w.u.ana, w.u.extra);
    await superBlock(w.u.otra);
    expect(ids(await comments(w.u.ana, p.id))).toEqual([ca.id]);
    expect(ids(await comments(w.u.extra, p.id))).toEqual([ce.id]);
    expect(ids(await comments(w.u.luis, p.id))).toEqual([ca.id, ce.id]);
    expect(ids(await comments(w.u.dios, p.id))).toEqual([ca.id, ce.id, co.id]);
    // De una publicación que no se ve: [].
    expect(await comments(w.u.extra, uuid())).toEqual([]);
  });

  it('borrar un comentario: su autor, el de la publicación, un admin de la liga o el superadmin; nadie más', async () => {
    const sent = await captureRealtime();
    const lg = await mkPost(w.u.luis, { p_league: w.priv, p_visibility: 'league' });
    const del = (who: string, id: string) => db.rpc<boolean>(who, 'delete_post_comment', { p_comment: id });
    const c1 = await comment(w.u.ana, lg.id, 'uno');
    const c2 = await comment(w.u.ana, lg.id, 'dos');
    const c3 = await comment(w.u.ana, lg.id, 'tres');
    const c4 = await comment(w.u.org, lg.id, 'cuatro');
    const c5 = await comment(w.u.ana, lg.id, 'cinco');
    for (const [i, c] of [c1, c2, c3, c4, c5].entries()) await commentAt(c.id, 10 - i);
    expect((await comments(w.u.sofi, lg.id)).map((c) => c.canDelete)).toEqual([true, true, true, true, true]);
    expect((await comments(w.u.org, lg.id)).map((c) => [c.isMine, c.canDelete])).toEqual([[false, true], [false, true], [false, true], [true, true], [false, true]]);
    await fails(del(w.u.otro, c1.id), DENIED);
    await fails(del(w.u.extra, c1.id), DENIED);
    expect(await del(w.u.ana, c1.id)).toBe(true);
    expect(await del(w.u.ana, c1.id)).toBe(false);
    expect(await del(w.u.luis, c2.id)).toBe(true);
    expect(await del(w.u.sofi, c3.id)).toBe(true);
    // Ana (miembro) no borra el de org.
    await fails(del(w.u.ana, c4.id), DENIED);
    expect(await del(w.u.dios, c5.id)).toBe(true);
    expect(await detail(w.u.ana, lg.id)).toMatchObject({ comments: 1 });
    // El superadmin borrando lo de otra cuenta queda en la auditoría.
    expect(await db.admin(`select action, target_id, detail ->> 'commentId' as c from public.admin_audit where action = 'delete_post_comment'`)).toEqual([
      { action: 'delete_post_comment', target_id: w.u.ana, c: c5.id },
    ]);
    expect((await sent('post_comment')).filter((x) => x.payload.op === 'delete').map((x) => x.payload.commentId)).toEqual([c1.id, c3.id, c5.id]);
  });
});

// =====================================================================

describe('borrar una publicación', () => {
  it('su autor, un admin de su liga o el superadmin; nadie más. Se van sus me gusta y comentarios; canDelete lo dice', async () => {
    const del = (who: string, id: string) => db.rpc<boolean>(who, 'delete_post', { p_post: id });
    const a = await mkPost(w.u.luis, { p_league: w.priv, p_visibility: 'league' });
    const b = await mkPost(w.u.luis, { p_league: w.priv, p_visibility: 'league' });
    const c = await mkPost(w.u.luis, { p_league: w.priv, p_visibility: 'league' });
    const d = await mkPost(w.u.extra);
    expect((await detail(w.u.sofi, a.id))!.canDelete).toBe(true);
    expect((await detail(w.u.org, a.id))!.canDelete).toBe(true);
    expect((await detail(w.u.ana, a.id))!.canDelete).toBe(false);
    expect((await detail(w.u.luis, d.id))!.canDelete).toBe(false);
    await like(w.u.ana, a.id);
    await comment(w.u.ana, a.id, 'hola');
    await fails(del(w.u.ana, a.id), DENIED);
    await fails(del(w.u.otro, a.id), DENIED);
    await fails(del(w.u.luis, d.id), DENIED);
    expect(await del(w.u.luis, a.id)).toBe(true);
    expect(await del(w.u.luis, a.id)).toBe(false);
    expect(await db.count('public.post_likes', 'post_id = $1', [a.id])).toBe(0);
    expect(await db.count('public.post_comments', 'post_id = $1', [a.id])).toBe(0);
    expect(await del(w.u.sofi, b.id)).toBe(true);
    expect(await del(w.u.org, c.id)).toBe(true);
    expect(await del(w.u.dios, d.id)).toBe(true);
    expect(await db.admin(`select action, target_type, target_id, detail ->> 'postId' as post from public.admin_audit where action = 'delete_post'`)).toEqual([
      { action: 'delete_post', target_type: 'user', target_id: w.u.extra, post: d.id },
    ]);
    expect(await db.count('private.posts_deleted', 'id = any ($1)', [[a.id, b.id, c.id, d.id]])).toBe(4);
    expect(await db.rpc(w.u.luis, 'delete_post', { p_post: uuid() })).toBe(false);
  });

  it('la foto va a la cola de Storage (bucket posts): al borrarla, al borrar su liga y al borrar la cuenta', async () => {
    const photo = async (who: string, args: Json = {}) => {
      const id = uuid();
      await mkPost(who, { p_id: id, p_photo: `${who}/${id}.webp`, ...args });
      return `${who}/${id}.webp`;
    };
    const p1 = await photo(w.u.luis);
    const p2 = await photo(w.u.otro, { p_league: w.pub });
    const p3 = await photo(w.u.ana);
    const p4 = await mkPost(w.u.ana, { p_text: 'sin foto' });
    await db.rpc(w.u.luis, 'delete_post', { p_post: p1.split('/')[1].replace('.webp', '') });
    expect(await queue()).toEqual([{ path: p1, bucket: 'posts' }]);
    await db.rpc(w.u.otro, 'delete_league', { p_league: w.pub });
    expect(await db.count('private.storage_purge_queue', `path = $1 and bucket = 'posts'`, [p2])).toBe(1);
    await db.admin('delete from auth.users where id = $1', [w.u.ana]);
    expect(await db.count('private.storage_purge_queue', `path = $1 and bucket = 'posts'`, [p3])).toBe(1);
    expect(await db.count('public.posts', 'id = $1', [p4.id])).toBe(0);
  });
});

// =====================================================================

describe('seguir ligas', () => {
  it('league_social: lo que puede cada quien (miembro publica; quien no es miembro de una pública, la sigue)', async () => {
    expect(await db.rpc(w.u.extra, 'league_social', { p_league: w.pub })).toEqual({
      following: false, followers: 0, isMember: false, canPost: false, canFollow: true,
    });
    expect(await db.rpc(w.u.otro, 'league_social', { p_league: w.pub })).toEqual({
      following: false, followers: 0, isMember: true, canPost: true, canFollow: false,
    });
    expect(await db.rpc(w.u.luis, 'league_social', { p_league: w.priv })).toEqual({
      following: false, followers: 0, isMember: true, canPost: true, canFollow: false,
    });
    expect(await db.rpc(w.u.extra, 'league_social', { p_league: w.priv })).toBeNull();
    expect(await db.rpc(w.u.extra, 'league_social', { p_league: uuid() })).toBeNull();
    expect(await db.rpc(w.u.dios, 'league_social', { p_league: w.priv })).toMatchObject({ isMember: false, canPost: false, canFollow: false });
  });

  it('seguir y dejar de seguir: idempotente, cuenta seguidores; privada, con menores o siendo miembro no; 60 por hora', async () => {
    expect(await db.rpc(w.u.extra, 'follow_league', { p_league: w.pub })).toEqual({ following: true, followers: 1 });
    expect(await db.rpc(w.u.extra, 'follow_league', { p_league: w.pub })).toEqual({ following: true, followers: 1 });
    expect(await db.rpc(w.u.ana, 'follow_league', { p_league: w.pub })).toEqual({ following: true, followers: 2 });
    expect(await db.rpc(w.u.extra, 'league_social', { p_league: w.pub })).toMatchObject({ following: true, followers: 2 });
    expect(await db.rpc(w.u.extra, 'unfollow_league', { p_league: w.pub })).toEqual({ following: false, followers: 1 });
    expect(await db.rpc(w.u.extra, 'unfollow_league', { p_league: w.pub })).toEqual({ following: false, followers: 1 });
    await fails(db.rpc(w.u.extra, 'follow_league', { p_league: w.priv }), 'no_existe');
    await fails(db.rpc(w.u.extra, 'follow_league', { p_league: uuid() }), 'no_existe');
    await fails(db.rpc(w.u.luis, 'follow_league', { p_league: w.priv }), DENIED);
    await fails(db.rpc(w.u.otro, 'follow_league', { p_league: w.pub }), DENIED);
    await fails(db.rpc(w.u.extra, 'unfollow_league', { p_league: null }), 'invalido');
    const kids = await league(db, w.u.org, { name: 'Infantil', visibility: 'private', requirePhoto: false, hasMinors: true });
    await member(db, kids, w.u.org, 'owner', 'org');
    await fails(db.rpc(w.u.extra, 'follow_league', { p_league: kids }), 'no_existe');
    await fails(db.rpc(w.u.org, 'follow_league', { p_league: kids }), DENIED);
    await fillLimit(`follow_league:u:${w.u.otra}`, 60);
    await fails(db.rpc(w.u.otra, 'follow_league', { p_league: w.pub }), 'rate_limited');
  });

  it('followed_leagues: la que seguí más reciente primero (LeagueHit), solo las que todavía veo', async () => {
    const other = await league(db, w.u.org, { name: 'Copa Águilas', visibility: 'public', kind: 'torneo', sport: 'padel' });
    await member(db, other, w.u.org, 'owner', 'org');
    await db.rpc(w.u.extra, 'follow_league', { p_league: w.pub });
    await db.admin(`update public.league_follows set created_at = now() - interval '1 hour' where user_id = $1`, [w.u.extra]);
    await db.rpc(w.u.extra, 'follow_league', { p_league: other });
    const list = await db.rpc<LeagueHit[]>(w.u.extra, 'followed_leagues', {});
    expect(list).toEqual([
      { id: other, name: 'Copa Águilas', sport: 'padel', kind: 'torneo', visibility: 'public', venue: 'Bolera', logo: null, members: 1,
        followers: 1, isMember: false, isFollowing: true },
      { id: w.pub, name: 'Liga Abierta', sport: 'bowling', kind: 'liga', visibility: 'public', venue: 'Bolera', logo: null, members: 1,
        followers: 1, isMember: false, isFollowing: true },
    ]);
    expect(await db.rpc<LeagueHit[]>(w.u.extra, 'followed_leagues', { p_limit: 1 })).toHaveLength(1);
    await db.admin(`update public.leagues set visibility = 'private' where id = $1`, [other]);
    expect(ids(await db.rpc<LeagueHit[]>(w.u.extra, 'followed_leagues', {}))).toEqual([w.pub]);
  });
});

// =====================================================================

describe('buscar ligas', () => {
  it('mis ligas (cualquiera) y las públicas sin menores; por nombre o lugar, sin acentos; al menos 2 letras', async () => {
    const cana = await league(db, w.u.otro, { name: 'Cañada de Águilas', visibility: 'public', sport: 'padel' });
    await db.admin(`update public.leagues set venue = 'Club Ñandú' where id = $1`, [cana]);
    const search = (who: string, q: string | null, limit: number | null = null) =>
      db.rpc<LeagueHit[]>(who, 'search_leagues', { p_query: q, p_limit: limit });
    expect(ids(await search(w.u.extra, 'liga'))).toEqual([w.pub]);
    // Luis: primero la suya (privada), luego la pública.
    expect(ids(await search(w.u.luis, 'LIGA'))).toEqual([w.priv, w.pub]);
    expect((await search(w.u.luis, 'liga'))[0]).toMatchObject({ isMember: true, visibility: 'private', members: 4 });
    expect(ids(await search(w.u.extra, 'aguilas'))).toEqual([cana]);
    expect(ids(await search(w.u.extra, 'cañada'))).toEqual([cana]);
    expect(ids(await search(w.u.extra, 'nandu'))).toEqual([cana]);
    expect(ids(await search(w.u.extra, 'bolera'))).toEqual([w.pub]);
    for (const q of ['l', ' ', '', null, '%%', '__', '¡!']) expect(await search(w.u.extra, q), String(q)).toEqual([]);
    expect(await search(w.u.extra, 'liga', 0)).toHaveLength(1);
    // Una liga con menores: solo para sus miembros.
    const kids = await league(db, w.u.org, { name: 'Liga Infantil', visibility: 'private', requirePhoto: false, hasMinors: true });
    await member(db, kids, w.u.org, 'owner', 'org');
    expect(ids(await search(w.u.org, 'infantil'))).toEqual([kids]);
    expect(await search(w.u.extra, 'infantil')).toEqual([]);
    await fillLimit(`search_leagues:u:${w.u.extra}`, 600);
    await fails(search(w.u.extra, 'liga'), 'rate_limited');
  });
});

// =====================================================================

describe('perfil: biografía y foto', () => {
  it('set_bio: una línea, ≤ 160, sin palabras prohibidas; vacía la quita; sale en public_profile', async () => {
    expect(await db.rpc(w.u.luis, 'set_bio', { p_bio: '  Bolichero   de\nSanto Domingo 🎳  ' })).toBe('Bolichero de Santo Domingo 🎳');
    expect(await db.rpc(w.u.ana, 'public_profile', { p_user: w.u.luis })).toMatchObject({ bio: 'Bolichero de Santo Domingo 🎳' });
    expect(await db.rpc(w.u.luis, 'set_bio', { p_bio: 'x'.repeat(160) })).toHaveLength(160);
    await fails(db.rpc(w.u.luis, 'set_bio', { p_bio: 'x'.repeat(161) }), 'invalido');
    await fails(db.rpc(w.u.luis, 'set_bio', { p_bio: 'soy un cabron' }), 'palabras');
    expect(await db.rpc(w.u.luis, 'set_bio', { p_bio: '   ' })).toBeNull();
    expect(await db.rpc(w.u.luis, 'set_bio', { p_bio: null })).toBeNull();
    expect(await db.rpc(w.u.ana, 'public_profile', { p_user: w.u.luis })).toMatchObject({ bio: null });
    await superBlock(w.u.otra);
    await fails(db.rpc(w.u.otra, 'set_bio', { p_bio: 'hola' }), 'bloqueada');
  });

  it('set_avatar: <yo>/<uuid>.webp|jpg; la anterior va a la cola (avatars); null la quita; 20 por día', async () => {
    const a1 = avatarPath(w.u.luis);
    expect(await db.rpc(w.u.luis, 'set_avatar', { p_path: a1 })).toEqual({ avatar: a1 });
    expect(await db.rpc(w.u.luis, 'set_avatar', { p_path: a1 })).toEqual({ avatar: a1 });
    expect(await queue()).toEqual([]);
    const a2 = avatarPath(w.u.luis, 'jpg');
    expect(await db.rpc(w.u.luis, 'set_avatar', { p_path: a2 })).toEqual({ avatar: a2 });
    expect(await queue()).toEqual([{ path: a1, bucket: 'avatars' }]);
    // Una ruta en la cola ya no se puede volver a poner.
    await fails(db.rpc(w.u.luis, 'set_avatar', { p_path: a1 }), 'invalido');
    for (const bad of [avatarPath(w.u.ana), `${w.u.luis}/foto.webp`, `${w.u.luis}/${uuid()}.png`, `${w.u.luis}/${uuid().toUpperCase()}.webp`, `${w.u.luis}/x/${uuid()}.webp`]) {
      await fails(db.rpc(w.u.luis, 'set_avatar', { p_path: bad }), 'invalido');
    }
    expect(await db.rpc(w.u.luis, 'set_avatar', { p_path: null })).toEqual({ avatar: null });
    expect((await queue()).map((q) => q.path).sort()).toEqual([a1, a2].sort());
    // Sale en todo lo que muestra a la cuenta.
    const a3 = avatarPath(w.u.luis);
    await db.rpc(w.u.luis, 'set_avatar', { p_path: a3 });
    const p = await mkPost(w.u.luis);
    expect(p.author.avatar).toBe(a3);
    expect(await db.rpc(w.u.ana, 'public_profile', { p_user: w.u.luis })).toMatchObject({ avatar: a3 });
    expect((await db.rpc<Json[]>(w.u.ana, 'search_people', { p_query: 'luis' }))[0]).toMatchObject({ id: w.u.luis, avatar: a3 });
    await follow(w.u.luis, w.u.ana);
    expect(await db.rpc<Json[]>(w.u.extra, 'follow_list', { p_user: w.u.ana, p_kind: 'followers' })).toEqual([
      expect.objectContaining({ id: w.u.luis, avatar: a3 }),
    ]);
    expect((await comment(w.u.luis, p.id, 'yo')).author.avatar).toBe(a3);
    // Límite: 20 cambios por día.
    await fillLimit(`avatar:${w.u.luis}`, 20);
    await fails(db.rpc(w.u.luis, 'set_avatar', { p_path: avatarPath(w.u.luis) }), 'rate_limited');
    expect(await db.rpc(w.u.luis, 'set_avatar', { p_path: a3 })).toEqual({ avatar: a3 });
    // Al borrar la cuenta, la foto también va a la cola.
    await db.admin('delete from auth.users where id = $1', [w.u.luis]);
    expect(await db.count('private.storage_purge_queue', `path = $1 and bucket = 'avatars'`, [a3])).toBe(1);
  });
});

// =====================================================================

describe('bloquear', () => {
  it('block_user: deja de seguirse en las dos direcciones; idempotente; my_blocked_users; unblock_user', async () => {
    await follow(w.u.ana, w.u.extra);
    await follow(w.u.extra, w.u.ana);
    await follow(w.u.ana, w.u.luis);
    expect(await blockUser(w.u.ana, w.u.extra)).toEqual({ blocked: true });
    expect(await blockUser(w.u.ana, w.u.extra)).toEqual({ blocked: true });
    expect(await db.count('public.follows', '(follower_id = $1 and followee_id = $2) or (follower_id = $2 and followee_id = $1)', [w.u.ana, w.u.extra])).toBe(0);
    expect(await db.count('public.follows', 'follower_id = $1 and followee_id = $2', [w.u.ana, w.u.luis])).toBe(1);
    await fails(blockUser(w.u.ana, w.u.ana), 'invalido');
    await fails(blockUser(w.u.ana, uuid()), 'no_existe');
    await fails(blockUser(w.u.ana, null as unknown as string), 'invalido');
    await db.admin(`update public.user_blocks set created_at = now() - interval '1 day' where blocker_id = $1`, [w.u.ana]);
    await blockUser(w.u.ana, w.u.otra);
    expect(await db.rpc(w.u.ana, 'my_blocked_users')).toEqual([
      { id: w.u.otra, name: 'otra', username: 'otra', avatar: null, at: expect.stringMatching(ISO) },
      { id: w.u.extra, name: 'extra', username: 'extra', avatar: null, at: expect.stringMatching(ISO) },
    ]);
    expect(await db.rpc(w.u.extra, 'my_blocked_users')).toEqual([]);
    expect(await db.rpc(w.u.ana, 'unblock_user', { p_user: w.u.extra })).toEqual({ blocked: false });
    expect(await db.rpc(w.u.ana, 'unblock_user', { p_user: w.u.extra })).toEqual({ blocked: false });
    expect(ids(await db.rpc<PersonLite[]>(w.u.ana, 'my_blocked_users'))).toEqual([w.u.otra]);
  });

  it('perfil: null para el bloqueado (y follow_list vacía); quien bloqueó lo ve con blockedByMe; el superadmin, igual', async () => {
    await follow(w.u.luis, w.u.ana);
    await blockUser(w.u.ana, w.u.extra);
    expect(await db.rpc(w.u.extra, 'public_profile', { p_user: w.u.ana })).toBeNull();
    expect(await db.rpc(w.u.extra, 'follow_list', { p_user: w.u.ana, p_kind: 'followers' })).toEqual([]);
    expect(await db.rpc(w.u.ana, 'public_profile', { p_user: w.u.extra })).toMatchObject({ id: w.u.extra, blockedByMe: true });
    expect(await db.rpc(w.u.luis, 'public_profile', { p_user: w.u.ana })).toMatchObject({ blockedByMe: false });
    expect(await db.rpc(w.u.dios, 'public_profile', { p_user: w.u.ana })).toMatchObject({ id: w.u.ana });
    expect(await db.rpc<Json[]>(w.u.luis, 'follow_list', { p_user: w.u.ana, p_kind: 'followers' })).toHaveLength(1);
  });

  it('búsqueda y seguir: ni quien bloqueó ni el bloqueado se encuentran ni se pueden seguir', async () => {
    await blockUser(w.u.ana, w.u.extra);
    const search = (who: string, q: string) => db.rpc<Json[]>(who, 'search_people', { p_query: q });
    expect(ids((await search(w.u.ana, 'extra')) as { id: string }[])).not.toContain(w.u.extra);
    expect(ids((await search(w.u.extra, 'ana')) as { id: string }[])).not.toContain(w.u.ana);
    expect(ids((await search(w.u.luis, 'ana')) as { id: string }[])).toContain(w.u.ana);
    await fails(db.rpc(w.u.extra, 'follow_user', { p_user: w.u.ana }), DENIED);
    await fails(db.rpc(w.u.ana, 'follow_user', { p_user: w.u.extra }), DENIED);
    await db.rpc(w.u.ana, 'unblock_user', { p_user: w.u.extra });
    expect(await db.rpc(w.u.extra, 'follow_user', { p_user: w.u.ana })).toMatchObject({ following: true });
  });
});

// =====================================================================

describe('perfil público', () => {
  it('bio, avatar, posts (las que ve quien mira) y blockedByMe', async () => {
    await mkPost(w.u.luis, { p_text: 'pública' });
    await mkPost(w.u.luis, { p_visibility: 'followers' });
    await mkPost(w.u.luis, { p_league: w.priv, p_visibility: 'league' });
    expect(await db.rpc(w.u.extra, 'public_profile', { p_user: w.u.luis })).toMatchObject({ bio: null, avatar: null, posts: 1, blockedByMe: false });
    expect(await db.rpc(w.u.ana, 'public_profile', { p_user: w.u.luis })).toMatchObject({ posts: 2 });
    await follow(w.u.ana, w.u.luis);
    expect(await db.rpc(w.u.ana, 'public_profile', { p_user: w.u.luis })).toMatchObject({ posts: 3 });
    expect(await db.rpc(w.u.luis, 'public_profile', { p_user: w.u.luis })).toMatchObject({ posts: 3, isMe: true });
  });
});

// =====================================================================

describe('avisos de la campana', () => {
  it('post_like y post_comment de otras cuentas en mis publicaciones (sin las mías, bloqueos ni las de hace más de 30 días)', async () => {
    const p = await mkPost(w.u.luis);
    await like(w.u.ana, p.id);
    await like(w.u.luis, p.id);
    await like(w.u.otra, p.id);
    const c = await comment(w.u.extra, p.id, `Muy   bien\n${'y'.repeat(100)}`);
    await comment(w.u.luis, p.id, 'Gracias');
    await db.admin(`update public.post_likes set created_at = now() - interval '2 minutes' where user_id = $1`, [w.u.ana]);
    await db.admin(`update public.post_likes set created_at = now() - interval '31 days' where user_id = $1`, [w.u.otra]);
    const notices = await db.rpc<Json[]>(w.u.luis, 'social_notices', {});
    expect(notices).toEqual([
      { kind: 'post_comment', at: expect.stringMatching(ISO), userId: w.u.extra, name: 'extra', postId: p.id, text: `Muy bien ${'y'.repeat(71)}` },
      { kind: 'post_like', at: expect.stringMatching(ISO), userId: w.u.ana, name: 'ana', postId: p.id },
    ]);
    expect(c.text).toContain('\n');
    // Con un bloqueo, sus avisos ya no salen.
    await blockUser(w.u.luis, w.u.extra);
    expect((await db.rpc<Json[]>(w.u.luis, 'social_notices', {})).map((n) => n.kind)).toEqual(['post_like']);
    // Y siguen saliendo los de antes (seguir).
    await follow(w.u.otro, w.u.luis);
    expect((await db.rpc<Json[]>(w.u.luis, 'social_notices', { p_limit: 1 })).map((n) => n.kind)).toEqual(['follow']);
  });
});

// =====================================================================

describe('reportes', () => {
  it('post y post_comment: tienen que verse; de su autor (no lo propio); la liga de la publicación; el admin de la liga los ve y decide', async () => {
    const report = (who: string, kind: string, target: string) =>
      db.rpc<string>(who, 'report_content', { p_kind: kind, p_target: target, p_reason: 'ofensivo', p_note: 'feo' });
    const lg = await mkPost(w.u.luis, { p_league: w.priv, p_visibility: 'league', p_text: 'algo feo' });
    const c = await comment(w.u.ana, lg.id, 'otro comentario');
    const free = await mkPost(w.u.extra, { p_text: 'sin liga' });
    await fails(report(w.u.extra, 'post', lg.id), 'no_existe');
    await fails(report(w.u.extra, 'post_comment', c.id), 'no_existe');
    await fails(report(w.u.luis, 'post', lg.id), 'invalido');
    await fails(report(w.u.ana, 'post_comment', c.id), 'invalido');
    await fails(report(w.u.ana, 'post', uuid()), 'no_existe');
    const r1 = await report(w.u.ana, 'post', lg.id);
    expect(await report(w.u.ana, 'post', lg.id)).toBe(r1);
    const r2 = await report(w.u.luis, 'post_comment', c.id);
    const r3 = await report(w.u.luis, 'post', free.id);
    expect(await db.admin('select target_kind, league_id, target_owner_id from public.reports where id = any ($1) order by target_kind, league_id nulls last', [[r1, r2, r3]])).toEqual([
      { target_kind: 'post', league_id: w.priv, target_owner_id: w.u.luis },
      { target_kind: 'post', league_id: null, target_owner_id: w.u.extra },
      { target_kind: 'post_comment', league_id: w.priv, target_owner_id: w.u.ana },
    ]);
    // Sofi (admin del Banco) ve los dos de su liga, sin quién reportó; el de sin liga, no.
    const list = await db.rpc<{ rows: Json[]; total: number }>(w.u.sofi, 'list_reports', { p_league: w.priv });
    expect(list.total).toBe(2);
    const post = list.rows.find((r) => r.kind === 'post')!;
    expect(post).toMatchObject({ targetId: lg.id, reporterId: null, leagueName: 'Liga del Banco' });
    expect(post.target).toMatchObject({ title: 'Publicación de luis', text: 'algo feo', userId: w.u.luis, url: `/p/${lg.id}`, leagueName: 'Liga del Banco' });
    const pc = list.rows.find((r) => r.kind === 'post_comment')!;
    expect(pc.target).toMatchObject({ title: 'Comentario de ana', text: 'otro comentario', postId: lg.id, url: `/p/${lg.id}` });
    expect((await db.rpc<{ total: number }>(w.u.sofi, 'list_reports', { p_league: w.priv, p_kind: 'post_comment' })).total).toBe(1);
    // Directo por la tabla, lo mismo (la política reports_read).
    expect(await db.asUser(w.u.sofi, 'select target_kind from public.reports order by target_kind')).toEqual([{ target_kind: 'post' }, { target_kind: 'post_comment' }]);
    await db.rpc(w.u.sofi, 'resolve_report', { p_report: r1, p_status: 'actioned', p_note: 'borrada' });
    await fails(db.rpc(w.u.sofi, 'resolve_report', { p_report: r3, p_status: 'dismissed' }), DENIED);
    expect((await db.rpc<{ total: number }>(w.u.dios, 'list_reports', { p_kind: 'post' })).total).toBe(1);
    // El aviso a los superadmins dice qué es.
    expect((await db.admin<{ v: string }>(`select private.report_kind_label('post') as v`))[0].v).toBe('Una publicación');
  });
});

// =====================================================================

describe('cola de Storage y cuentas borradas', () => {
  it('purge_queue_take / purge_queue_done con avatars y posts: solo lo de ese bucket, y nunca lo que se volvió a usar', async () => {
    const a = avatarPath(w.u.luis);
    await db.rpc(w.u.luis, 'set_avatar', { p_path: a });
    await db.rpc(w.u.luis, 'set_avatar', { p_path: null });
    const id = uuid();
    await mkPost(w.u.ana, { p_id: id, p_photo: `${w.u.ana}/${id}.jpg` });
    await db.rpc(w.u.ana, 'delete_post', { p_post: id });
    // Una foto de perfil en uso que (por lo que sea) quedó en la cola: no se borra.
    const inUse = avatarPath(w.u.ana);
    await db.rpc(w.u.ana, 'set_avatar', { p_path: inUse });
    await db.admin(`insert into private.storage_purge_queue (path, bucket) values ($1, 'avatars')`, [inUse]);
    const take = (bucket: string | null) =>
      db.as<{ path: string }>(SERVICE, bucket ? `select path from public.purge_queue_take(p_bucket => $1)` : 'select path from public.purge_queue_take()', bucket ? [bucket] : []);
    expect(await take(null)).toEqual([]);
    expect(await take('logos')).toEqual([]);
    expect(await take('avatars')).toEqual([{ path: a }]);
    expect(await db.count('private.storage_purge_queue', 'path = $1', [inUse])).toBe(0);
    expect(await take('posts')).toEqual([{ path: `${w.u.ana}/${id}.jpg` }]);
    expect(await db.as(SERVICE, `select public.purge_queue_done($1, 'posts') as n`, [[a]])).toEqual([{ n: 0 }]);
    expect(await db.as(SERVICE, `select public.purge_queue_done($1, 'avatars') as n`, [[a]])).toEqual([{ n: 1 }]);
    expect(await db.as(SERVICE, `select public.purge_queue_done($1, 'posts') as n`, [[`${w.u.ana}/${id}.jpg`]])).toEqual([{ n: 1 }]);
    await fails(take('otro'), 'invalido');
    await fails(db.as(SERVICE, `select public.purge_queue_done('{}', 'otro')`), 'invalido');
    await fails(db.admin(`insert into private.storage_purge_queue (path, bucket) values ('x/y.webp', 'otro')`), '23514');
  });

  it('borrar la cuenta: se van sus publicaciones, me gusta, comentarios, bloqueos y límites; los contadores de los demás bajan', async () => {
    const p = await mkPost(w.u.ana, { p_text: 'de ana' });
    const mine = await mkPost(w.u.luis, { p_text: 'de luis' });
    await like(w.u.luis, p.id);
    await comment(w.u.luis, p.id, 'hola');
    await like(w.u.extra, p.id);
    await comment(w.u.ana, mine.id, 'en lo de luis');
    await blockUser(w.u.luis, w.u.otra);
    await db.rpc(w.u.luis, 'follow_league', { p_league: w.pub });
    await db.rpc(w.u.luis, 'set_avatar', { p_path: avatarPath(w.u.luis) });
    await db.rpc(w.u.luis, 'delete_post', { p_post: (await mkPost(w.u.luis)).id });
    expect(await detail(w.u.ana, p.id)).toMatchObject({ likes: 2, comments: 1 });
    await db.admin('delete from auth.users where id = $1', [w.u.luis]);
    expect(await detail(w.u.ana, p.id)).toMatchObject({ likes: 1, comments: 0 });
    for (const [t, col] of [['public.posts', 'author_id'], ['public.post_likes', 'user_id'], ['public.post_comments', 'author_id'],
      ['public.user_blocks', 'blocker_id'], ['public.league_follows', 'user_id'], ['private.posts_deleted', 'author_id']]) {
      expect(await db.count(t, `${col} = $1`, [w.u.luis]), t).toBe(0);
    }
    expect(await db.count('private.rate_limits', 'key like $1', [`%${w.u.luis}`])).toBe(0);
  });

  it('export_my_data: bio, avatarPath, sus publicaciones y comentarios; sus me gusta y ligas que sigue en tables', async () => {
    await db.rpc(w.u.luis, 'set_bio', { p_bio: 'Hola' });
    const p = await mkPost(w.u.luis, { p_text: 'mía' });
    const q = await mkPost(w.u.ana, { p_text: 'de ana' });
    await comment(w.u.luis, q.id, 'comentario mío');
    await comment(w.u.ana, p.id, 'de ana en lo mío');
    await like(w.u.luis, q.id);
    await db.rpc(w.u.luis, 'follow_league', { p_league: w.pub });
    const d = await db.rpc<Json>(w.u.luis, 'export_my_data');
    expect(d.account).toMatchObject({ bio: 'Hola', avatarPath: null });
    expect(d.posts).toEqual([expect.objectContaining({ id: p.id, text: 'mía', likes: 0, comments: 1, createdAt: expect.stringMatching(ISO) })]);
    expect(d.postComments).toEqual([{ id: expect.any(String), postId: q.id, text: 'comentario mío', createdAt: expect.stringMatching(ISO) }]);
    const t = d.tables as Record<string, Json[]>;
    expect(t.post_likes).toEqual([expect.objectContaining({ post_id: q.id, user_id: w.u.luis })]);
    expect(t.league_follows).toEqual([expect.objectContaining({ league_id: w.pub, user_id: w.u.luis })]);
    expect(JSON.stringify(d)).not.toContain('de ana en lo mío');
  });
});

// =====================================================================

describe('Storage (20261009000110_red_social_supabase.sql, solo Supabase), probado en PGlite', () => {
  const FILE = '20261009000110_red_social_supabase.sql';
  const put = (who: string, bucket: string, name: string) => db.as(who, `insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, name]);
  const del = (who: string, bucket: string, name: string) =>
    db.as(who, `delete from storage.objects where bucket_id = $1 and name = $2 returning name`, [bucket, name]);
  const list = (who: string, bucket: string) => db.as<{ name: string }>(who, `select name from storage.objects where bucket_id = $1 order by name`, [bucket]);

  beforeEach(async () => {
    await db.pg.exec(readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8'));
    await db.pg.exec(`
      alter table storage.objects enable row level security;
      grant select, insert, delete on storage.objects to authenticated;
    `);
  });

  it('los buckets: públicos, 256 kB y 512 kB, WebP o JPEG; tres políticas cada uno y ninguna de UPDATE; se puede correr otra vez', async () => {
    expect(await db.admin(`select id, public, file_size_limit, allowed_mime_types from storage.buckets where id in ('avatars', 'posts') order by id`)).toEqual([
      { id: 'avatars', public: true, file_size_limit: 262144, allowed_mime_types: ['image/webp', 'image/jpeg'] },
      { id: 'posts', public: true, file_size_limit: 524288, allowed_mime_types: ['image/webp', 'image/jpeg'] },
    ]);
    const policies = () => db.admin(`select policyname, cmd from pg_policies where tablename = 'objects' and (policyname like 'mm_avatars_%' or policyname like 'mm_posts_%') order by 1`);
    expect(await policies()).toEqual([
      { policyname: 'mm_avatars_delete', cmd: 'DELETE' },
      { policyname: 'mm_avatars_read', cmd: 'SELECT' },
      { policyname: 'mm_avatars_upload', cmd: 'INSERT' },
      { policyname: 'mm_posts_delete', cmd: 'DELETE' },
      { policyname: 'mm_posts_read', cmd: 'SELECT' },
      { policyname: 'mm_posts_upload', cmd: 'INSERT' },
    ]);
    await db.pg.exec(readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8'));
    expect(await policies()).toHaveLength(6);
    expect(await db.count('storage.buckets', `id in ('avatars', 'posts')`)).toBe(2);
  });

  it('subir: solo <yo>/<uuid>.webp|jpg en mi carpeta y con la cuenta sin bloquear', async () => {
    for (const bucket of ['avatars', 'posts']) {
      await put(w.u.luis, bucket, avatarPath(w.u.luis));
      await put(w.u.luis, bucket, avatarPath(w.u.luis, 'jpg'));
      await fails(put(w.u.luis, bucket, avatarPath(w.u.ana)), '42501');
      await fails(put(w.u.luis, bucket, `${w.u.luis}/foto.webp`), '42501');
      await fails(put(w.u.luis, bucket, `${w.u.luis}/${uuid()}.png`), '42501');
      await fails(put(w.u.luis, bucket, `${w.u.luis}/x/${uuid()}.webp`), '42501');
      await fails(put(ANON, bucket, avatarPath(w.u.luis)), '42501');
    }
    await superBlock(w.u.ana);
    await fails(put(w.u.ana, 'avatars', avatarPath(w.u.ana)), '42501');
    expect(await db.count('storage.objects', `bucket_id in ('avatars', 'posts')`)).toBe(4);
  });

  it('leer por la API y borrar: solo lo de mi carpeta (bloqueada, no)', async () => {
    const mine = avatarPath(w.u.luis);
    const hers = avatarPath(w.u.ana);
    await db.admin(`insert into storage.objects (bucket_id, name) values ('posts', $1), ('posts', $2)`, [mine, hers]);
    expect(await list(w.u.luis, 'posts')).toEqual([{ name: mine }]);
    expect(await list(w.u.extra, 'posts')).toEqual([]);
    expect(await del(w.u.luis, 'posts', hers)).toEqual([]);
    await superBlock(w.u.luis);
    expect(await del(w.u.luis, 'posts', mine)).toEqual([]);
    await db.rpc(w.u.dios, 'admin_unblock_user', { p_user: w.u.luis });
    expect(await del(w.u.luis, 'posts', mine)).toEqual([{ name: mine }]);
    expect(await db.count('storage.objects', `bucket_id = 'posts'`)).toBe(1);
  });
});
