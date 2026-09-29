/**
 * Usuarios e invitaciones (20260929000200_invitaciones.sql): el @usuario de cada cuenta (se genera solo y se
 * cambia con set_username), quién se ve (con sesión, cualquier cuenta sin bloquear; sus juegos siguen filtrados por
 * liga), buscar personas y las invitaciones a una liga (invitar, aceptar, rechazar, cancelar, lo que lee la app).
 *
 * Mundo (fixture): liga privada del Banco (org dueño, sofi admin, luis y ana miembros; luis juega e1 con [150];
 * Pedro sin cuenta) y liga pública Abierta de otro. Cuentas sin liga: nuevo (nombre 'new'), otra y extra.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, SERVICE, TestDb, fails } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';

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
interface Person {
  id: string;
  name: string;
  username: string;
  isFollowing: boolean;
  followsYou: boolean;
  inLeague: boolean;
  invited: boolean;
}
interface InviteResult {
  sent: number;
  results: { userId: string; status: string }[];
}
interface InviteRow {
  id: string;
  status: string;
  invited_by: string | null;
  decided_at: Date | null;
}

const USERNAME_RE = /^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/;
const validUsername = (v: string) => USERNAME_RE.test(v) && !v.includes('..');

const NEW_RPC = [
  'cancel_league_invite',
  'invite_to_league',
  'league_invite_details',
  'my_league_invites',
  'respond_league_invite',
  'search_people',
  'set_username',
  'username_status',
];

const uname = async (id: string) => (await db.admin<{ username: string }>('select username from public.profiles where id = $1', [id]))[0]?.username;
const setName = (id: string, username: string) => db.admin('update public.profiles set username = $2 where id = $1', [id, username]);
const block = (id: string) => db.rpc(w.u.dios, 'admin_block_user', { p_user: id, p_reason: 'prueba' });
const setUsername = (who: string, v: string | null) => db.rpc<string>(who, 'set_username', { p_username: v });
const status = (who: string, v: string | null) => db.rpc<string>(who, 'username_status', { p_username: v });
const search = (who: string, q: string | null, lid: string | null = null, limit: number | null = null) =>
  db.rpc<Person[]>(who, 'search_people', { p_query: q, p_league: lid, p_limit: limit });
const invite = (who: string, lid: string, users: (string | null)[] | null) =>
  db.rpc<InviteResult>(who, 'invite_to_league', { p_league: lid, p_users: users });
const respond = (who: string, id: string, accept: boolean | null, prefer: string | null = null) =>
  db.rpc<Json>(who, 'respond_league_invite', { p_invite: id, p_accept: accept, p_prefer: prefer });
const cancel = (who: string, id: string) => db.rpc(who, 'cancel_league_invite', { p_invite: id });
const details = (who: string, id: string) => db.rpc<Json | null>(who, 'league_invite_details', { p_invite: id });
const myInvites = (who: string) => db.rpc<Json[]>(who, 'my_league_invites');
/** La invitación de esa cuenta a esa liga: la pendiente o, si no hay, la más nueva (en la prueba now() es fijo). */
const inv = async (lid: string, uid: string) =>
  (
    await db.admin<InviteRow>(
      `select id, status, invited_by, decided_at from public.league_invites where league_id = $1 and user_id = $2
        order by status = 'pending' desc, created_at desc, decided_at desc nulls first, id desc limit 1`,
      [lid, uid],
    )
  )[0];
const isMember = async (lid: string, uid: string) => (await db.count('public.league_members', 'league_id = $1 and user_id = $2', [lid, uid])) === 1;
const phone = (uid: string) =>
  db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'BPclave', 'secreto')`, [
    uid,
    `https://fcm.googleapis.com/fcm/send/${uid}`,
  ]);
const pushes = (uid: string) =>
  db.admin<Json>('select title, body, url, tag, ttl, urgency from public.push_outbox where user_id = $1 order by id', [uid]);
/** Deja el límite de esa clave en p_hits (ventana de ahora). */
const fillLimit = (key: string, hits: number) =>
  db.admin(
    `insert into private.rate_limits (key, window_start, hits) values ($1, now(), $2)
     on conflict (key) do update set window_start = now(), hits = excluded.hits`,
    [key, hits],
  );
const follow = (a: string, b: string, ago = 0) =>
  db.admin(`insert into public.follows (follower_id, followee_id, created_at) values ($1, $2, now() - make_interval(mins => $3))`, [a, b, ago]);

/** En la transacción de la prueba: un realtime.send falso que guarda lo que emit manda (como en Supabase). */
async function captureRealtime() {
  await db.admin('create schema if not exists realtime');
  await db.admin('create table realtime.sent (n serial, payload jsonb, event text, topic text, private boolean)');
  await db.admin(`create function realtime.send(payload jsonb, event text, topic text, private boolean default false) returns void
                  language sql as $$ insert into realtime.sent (payload, event, topic, private) values (payload, event, topic, private) $$`);
  return () => db.admin<{ topic: string; payload: Json }>(`select topic, payload from realtime.sent where event = 'invites' order by n`);
}

describe('permisos', () => {
  it('las RPC nuevas: solo con sesión, security definer y pasan por require_uid; las ayudas, nadie de la app', async () => {
    const rows = await db.admin<{ fn: string; definer: boolean; anon: boolean; auth: boolean; uid: boolean; path: boolean }>(
      `select p.proname as fn, p.prosecdef as definer, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth, p.prosrc like '%private.require_uid()%' as uid,
              'search_path=""' = any (p.proconfig) as path
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1) order by 1`,
      [NEW_RPC],
    );
    expect(rows).toEqual(NEW_RPC.map((fn) => ({ fn, definer: true, anon: false, auth: true, uid: true, path: true })));
    const helpers = await db.admin<{ fn: string; definer: boolean; auth: boolean }>(
      `select p.proname as fn, p.prosecdef as definer, has_function_privilege('authenticated', p.oid, 'execute') as auth
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = any ($1) order by 1`,
      [['username_reserved', 'username_clean', 'username_ok', 'username_base', 'pick_username', 'profiles_username', 'rate_take',
        'social_can_see', 'emit_league_invites', 'accept_invites_on_join', 'cancel_invites_on_leave', 'invite_ok', 'people_item']],
    );
    expect(helpers).toHaveLength(13);
    for (const h of helpers) expect(h, h.fn).toMatchObject({ definer: true, auth: false });
    const args: Record<string, Json> = {
      cancel_league_invite: { p_invite: randomUUID() },
      invite_to_league: { p_league: w.pub, p_users: [w.u.ana] },
      league_invite_details: { p_invite: randomUUID() },
      my_league_invites: {},
      respond_league_invite: { p_invite: randomUUID(), p_accept: true },
      search_people: { p_query: 'ana' },
      set_username: { p_username: 'fantasma' },
      username_status: { p_username: 'fantasma' },
    };
    for (const fn of NEW_RPC) await fails(db.rpc(ANON, fn, args[fn]), '42501');
    await fails(db.as(w.u.luis, `select private.pick_username('luis')`), '42501');
    await fails(db.as(w.u.luis, 'select private.social_can_see($1)', [w.u.ana]), '42501');
  });
});

describe('@usuario', () => {
  it('toda cuenta tiene uno: del nombre (sin acentos ni símbolos), si no «jugador»; nunca del correo', async () => {
    expect(await Promise.all(Object.values(w.u).map(uname))).toEqual(['org', 'sofi', 'luis', 'ana', 'otro', 'new', 'otra', 'extra', 'dios', 'dios2']);
    // Los casos de nuevas.test.ts: nombre de Google vacío (el nombre ya es lo de antes de la @), de 80 letras, sin correo.
    expect(await uname(await db.createUser('maria.perez@gmail.com', null, { full_name: '   ' }))).toBe('mariaperez');
    expect(await uname(await db.createUser('largo@x.com', null, { full_name: 'x'.repeat(80) }))).toBe('x'.repeat(15));
    expect(await uname(await db.createUser(null as unknown as string, null))).toBe('jugador');
    // Tomado: con 4 números. Ñ y acentos fuera.
    expect(await uname(await db.createUser('g@x.com', null, { full_name: 'María Pérez' }))).toMatch(/^mariaperez\d{4}$/);
    expect(await uname(await db.createUser('n@x.com', 'Ñoño Núñez'))).toBe('nononunez');
    // Nombre corto o sin letras latinas: «jugador» (ya tomado: con números). El correo no: el @usuario lo ve y lo
    // busca cualquiera con sesión, y el correo es privado.
    const al = await db.createUser('juan.perez.1987+liga@gmail.com', 'Al');
    expect(await uname(al)).toMatch(/^jugador\d{4}$/);
    expect(await uname(await db.createUser('li@x.com', '李小龙'))).toMatch(/^jugador\d{4}$/);
    expect((await search(w.u.ana, 'juanperez')).map((p) => p.id)).not.toContain(al);
    // Reservado: nunca tal cual.
    expect(await uname(await db.createUser('jefe@x.com', 'Admin'))).toMatch(/^admin\d{4}$/);
    // Si el perfil faltara, ensure_profile lo crea también con usuario.
    const u = await db.createUser('perdido@x.com', 'Perdido');
    await db.admin('delete from public.profiles where id = $1', [u]);
    await db.rpc(u, 'ensure_profile');
    expect(await uname(u)).toBe('perdido');
    const all = await db.admin<{ username: string }>('select username from public.profiles');
    expect(all.every((r) => validUsername(r.username))).toBe(true);
    expect(new Set(all.map((r) => r.username)).size).toBe(all.length);
    // La columna es obligatoria y única, con el formato (ni siquiera por debajo).
    await fails(db.asService('update public.profiles set username = null where id = $1', [w.u.ana]), '23502');
    await fails(db.asService(`update public.profiles set username = 'luis' where id = $1`, [w.u.ana]), '23505');
    await fails(db.asService(`update public.profiles set username = 'a..b' where id = $1`, [w.u.ana]), '23514');
  });

  it('choques: muchas cuentas con el mismo nombre salen con usuarios distintos y válidos', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) ids.push(await db.createUser(`ana${i}@x.com`, 'Ana'));
    const names = await Promise.all(ids.map(uname));
    expect(names.every((n) => /^ana\d{4}$/.test(n))).toBe(true);
    expect(new Set([...names, 'ana']).size).toBe(13);
  });

  it('si se acaban los 30 intentos: 12 letras + 8 al azar; con cualquier base cumple el formato', async () => {
    await db.createUser('lucia@x.com', 'Lucía');
    // Los 30 intentos que va a hacer con esta semilla, ya tomados.
    await db.admin('select setseed(0.42)');
    const tries = await db.admin<{ v: string }>(`select 'lucia' || lpad(floor(random() * 10000)::integer::text, 4, '0') as v from generate_series(1, 30)`);
    for (const [i, v] of [...new Set(tries.map((t) => t.v))].entries()) await setName(await db.createUser(`lucia-${i}@x.com`, 'Otra Lucía'), v);
    await db.admin('select setseed(0.42)');
    const [{ v }] = await db.admin<{ v: string }>(`select private.pick_username('lucia') as v`);
    expect(v).toMatch(/^lucia[0-9a-f]{8}$/);
    const odd = await db.admin<{ v: string }>(
      `select private.pick_username(x) as v from unnest(array['', null, 'a', 'ADMIN!!', repeat('x', 40), 'ñu', '....', 'a_b.c']) x`,
    );
    for (const r of odd) expect(validUsername(r.v), r.v).toBe(true);
  });

  it('set_username: normaliza, valida, no deja reservados ni repetidos, y 5 cambios por día', async () => {
    expect(await setUsername(w.u.luis, ' @Luis_Perez ')).toBe('luis_perez');
    expect(await uname(w.u.luis)).toBe('luis_perez');
    for (const bad of ['ab', 'x'.repeat(21), '.luis', 'luis.', 'lu..is', 'luis perez', 'luis-p', 'josé', 'ñandu', '@@luis', '', null]) {
      await fails(setUsername(w.u.luis, bad), 'invalido');
    }
    for (const r of ['admin', '@Soporte', 'www', 'invitacion']) await fails(setUsername(w.u.luis, r), 'reservado');
    await fails(setUsername(w.u.luis, 'ana'), 'duplicado');
    await fails(setUsername(w.u.luis, '@ANA'), 'duplicado');
    // 4 cambios más (5 en el día); el sexto no. El mismo que ya tiene no cuenta (ni con el límite lleno).
    for (const v of ['luis.2', 'luis_3', 'l.u.i.s', 'luis5']) expect(await setUsername(w.u.luis, v)).toBe(v);
    expect(await setUsername(w.u.luis, 'LUIS5')).toBe('luis5');
    await fails(setUsername(w.u.luis, 'luis6'), 'rate_limited');
    expect(await setUsername(w.u.luis, '@luis5')).toBe('luis5');
    await db.admin(`update private.rate_limits set window_start = now() - interval '25 hours' where key = $1`, [`username:${w.u.luis}`]);
    expect(await setUsername(w.u.luis, 'luis6')).toBe('luis6');
    // El que dejó queda libre para otra cuenta.
    expect(await setUsername(w.u.ana, 'luis5')).toBe('luis5');
    // Nada directo; sin cuenta no; bloqueada tampoco.
    await fails(db.asUser(w.u.ana, `update public.profiles set username = 'anita' where id = $1`, [w.u.ana]), '42501');
    await fails(setUsername(ANON, 'fantasma'), '42501');
    await block(w.u.otra);
    await fails(setUsername(w.u.otra, 'otra_nueva'), 'bloqueada');
    expect(await uname(w.u.otra)).toBe('otra');
  });

  it('username_status: mine, ok, taken, invalid, reserved (600 por hora)', async () => {
    expect(await status(w.u.luis, 'luis')).toBe('mine');
    expect(await status(w.u.luis, ' @LUIS ')).toBe('mine');
    expect(await status(w.u.luis, 'ana')).toBe('taken');
    expect(await status(w.u.luis, 'nadie_tiene.este')).toBe('ok');
    expect(await status(w.u.luis, 'a.b')).toBe('ok');
    expect(await status(w.u.luis, 'x'.repeat(20))).toBe('ok');
    for (const bad of ['ab', 'a..b', 'x'.repeat(21), 'luis!', '', null]) expect(await status(w.u.luis, bad)).toBe('invalid');
    expect(await status(w.u.luis, 'Admin')).toBe('reserved');
    await fillLimit(`username_check:u:${w.u.luis}`, 600);
    await fails(status(w.u.luis, 'luis'), 'rate_limited');
  });
});

describe('quién se ve', () => {
  it('con sesión se ve cualquier cuenta sin bloquear, con su @usuario, pero nada de sus ligas privadas', async () => {
    // extra no está en ninguna liga: antes nadie lo veía.
    expect(await db.rpc(w.u.ana, 'public_profile', { p_user: w.u.extra })).toMatchObject({
      id: w.u.extra,
      name: 'extra',
      username: 'extra',
      sports: [],
      gamesCount: 0,
      isMe: false,
    });
    expect(await db.rpc(w.u.ana, 'follow_user', { p_user: w.u.extra })).toMatchObject({ following: true });
    // Luis solo juega en el Banco (privada). Ana (miembro) le da me gusta a su juego.
    await db.rpc(w.u.ana, 'set_game_like', { p_kind: 'bowling', p_id: w.e1Luis, p_liked: true });
    expect(await db.rpc(w.u.ana, 'public_profile', { p_user: w.u.luis })).toMatchObject({ username: 'luis', sports: ['bowling'], gamesCount: 1, likesReceived: 1 });
    // extra lo ve (y lo encuentra), pero sin juegos, me gusta ni números de esa liga.
    expect(await db.rpc(w.u.extra, 'public_profile', { p_user: w.u.luis })).toMatchObject({ username: 'luis', sports: [], gamesCount: 0, likesReceived: 0 });
    expect(await db.rpc(w.u.extra, 'profile_games', { p_user: w.u.luis })).toEqual([]);
    expect(await db.rpc(w.u.extra, 'profile_stats', { p_user: w.u.luis })).toEqual({ bowling: null, matches: [], golf: null, swim: null });
    await db.rpc(w.u.ana, 'follow_user', { p_user: w.u.luis });
    expect(await db.rpc(w.u.extra, 'follow_list', { p_user: w.u.luis, p_kind: 'followers' })).toEqual([
      expect.objectContaining({ id: w.u.ana, name: 'ana', username: 'ana', isFollowing: false }),
    ]);
    expect(await db.rpc(w.u.extra, 'following_games', {})).toEqual([]);
  });

  it('una cuenta bloqueada no se ve (salvo por lo de antes: compartir liga o seguirse)', async () => {
    await block(w.u.otra);
    expect(await db.rpc(w.u.ana, 'public_profile', { p_user: w.u.otra })).toBeNull();
    expect(await db.rpc(w.u.ana, 'follow_list', { p_user: w.u.otra, p_kind: 'followers' })).toEqual([]);
    await fails(db.rpc(w.u.ana, 'follow_user', { p_user: w.u.otra }), DENIED);
    expect((await search(w.u.ana, 'otra')).map((p) => p.id)).not.toContain(w.u.otra);
    // Luis bloqueado: ana comparte el Banco con él y lo sigue viendo; extra ya no.
    await block(w.u.luis);
    expect(await db.rpc(w.u.ana, 'public_profile', { p_user: w.u.luis })).toMatchObject({ username: 'luis' });
    expect(await db.rpc(w.u.extra, 'public_profile', { p_user: w.u.luis })).toBeNull();
    // El superadmin ve a todas.
    expect(await db.rpc(w.u.dios, 'public_profile', { p_user: w.u.otra })).toMatchObject({ username: 'otra' });
  });
});

describe('buscar personas', () => {
  it('vacío (o solo @): las cuentas que sigo, la más reciente primero, sin bloqueadas; una letra: nada', async () => {
    await follow(w.u.ana, w.u.luis, 30);
    await follow(w.u.ana, w.u.sofi, 20);
    await follow(w.u.ana, w.u.extra, 10);
    await follow(w.u.luis, w.u.ana);
    const list = await search(w.u.ana, '');
    expect(list.map((p) => p.username)).toEqual(['extra', 'sofi', 'luis']);
    expect(list[2]).toEqual({ id: w.u.luis, name: 'luis', username: 'luis', isFollowing: true, followsYou: true, inLeague: false, invited: false });
    expect(await search(w.u.ana, '@')).toEqual(list);
    expect(await search(w.u.ana, null)).toEqual(list);
    expect(await search(w.u.ana, '', null, 2)).toEqual(list.slice(0, 2));
    await block(w.u.extra);
    expect((await search(w.u.ana, '  ')).map((p) => p.username)).toEqual(['sofi', 'luis']);
    expect(await search(w.u.ana, 'l')).toEqual([]);
    expect(await search(w.u.ana, '@l')).toEqual([]);
    expect(await search(w.u.otra, '')).toEqual([]);
  });

  it('orden: @usuario exacto, a quien sigo, @usuario que empieza así, nombre que empieza así y el resto por nombre', async () => {
    const make = async (name: string, username: string) => {
      const id = await db.createUser(`${username}@x.com`, name);
      await setName(id, username);
      return id;
    };
    const u0 = await make('Zoe Zapata', 'carl');
    const u1 = await make('Carla Díaz', 'carla');
    const u2 = await make('Carlos Ruiz', 'carlos_r');
    const u3 = await make('Ana Carla', 'anita');
    const u4 = await make('Carlota', 'zeta');
    const u5 = await make('Pedro', 'carlitos');
    const u6 = await make('María Carlina', 'maria6');
    await make('Nada Que Ver', 'nadie');
    await follow(w.u.luis, u3);
    const order = [u0, u3, u1, u2, u5, u4, u6];
    expect((await search(w.u.luis, 'carl')).map((p) => p.id)).toEqual(order);
    expect((await search(w.u.luis, ' @CARL ')).map((p) => p.id)).toEqual(order);
    expect((await search(w.u.luis, 'carl')).find((p) => p.id === u3)).toMatchObject({ isFollowing: true, username: 'anita' });
    // Sin acentos, por nombre completo, y el @usuario solo por el principio.
    expect((await search(w.u.luis, 'díaz')).map((p) => p.id)).toEqual([u1]);
    expect((await search(w.u.luis, 'carla diaz')).map((p) => p.id)).toEqual([u1]);
    expect((await search(w.u.luis, 'maria')).map((p) => p.id)).toEqual([u6]);
    expect(await search(w.u.luis, 'arlit')).toEqual([]);
    // % y _ no son comodines; sin letras no se busca por nombre (no salen todas).
    for (const q of ['c_rl', 'c%', '%%', '__', '..']) expect(await search(w.u.luis, q), q).toEqual([]);
    // Nunca yo ni una bloqueada; límite de 1 a 50.
    expect((await search(u1, 'carla')).map((p) => p.id)).toEqual([u3]);
    await block(u2);
    expect((await search(w.u.luis, 'carl')).map((p) => p.id)).toEqual(order.filter((id) => id !== u2));
    expect(await search(w.u.luis, 'carl', null, 2)).toHaveLength(2);
    expect(await search(w.u.luis, 'carl', null, 0)).toHaveLength(1);
    expect(await search(w.u.luis, 'carl', null, 500)).toHaveLength(6);
  });

  it('ritmo: 600 búsquedas por hora (la lista de quienes sigo no cuenta)', async () => {
    await fillLimit(`search:u:${w.u.luis}`, 600);
    await fails(search(w.u.luis, 'ana'), 'rate_limited');
    expect(await search(w.u.luis, '')).toEqual([]);
    expect(await search(w.u.luis, 'a')).toEqual([]);
    await fails(search(ANON, 'ana'), '42501');
  });

  it('con una liga: quién ya está y quién ya tiene invitación; solo miembros de esa liga o el superadmin', async () => {
    const find = async (who: string, q: string, lid: string | null) => (await search(who, q, lid)).find((p) => p.username === q);
    expect(await find(w.u.org, 'ana', w.priv)).toMatchObject({ inLeague: true, invited: false });
    expect(await find(w.u.org, 'new', w.priv)).toMatchObject({ inLeague: false, invited: false });
    await invite(w.u.org, w.priv, [w.u.nuevo]);
    expect(await find(w.u.org, 'new', w.priv)).toMatchObject({ inLeague: false, invited: true });
    // Un miembro sin permiso de invitar igual ve las marcas; sin liga, todo en false.
    expect(await find(w.u.luis, 'new', w.priv)).toMatchObject({ invited: true });
    expect(await find(w.u.org, 'ana', null)).toMatchObject({ inLeague: false, invited: false });
    await fails(search(w.u.extra, 'ana', w.priv), DENIED);
    await fails(search(w.u.extra, 'ana', w.pub), DENIED);
    expect(await find(w.u.dios, 'new', w.priv)).toMatchObject({ invited: true });
  });
});

describe('invitar', () => {
  it('quién invita: miembro en liga pública; en privada (también con menores) solo dueño, admin o superadmin', async () => {
    await member(db, w.pub, w.u.luis, 'member', 'luis');
    expect(await invite(w.u.luis, w.pub, [w.u.ana])).toEqual({ sent: 1, results: [{ userId: w.u.ana, status: 'sent' }] });
    await fails(invite(w.u.luis, w.priv, [w.u.nuevo]), DENIED);
    expect((await invite(w.u.sofi, w.priv, [w.u.nuevo])).sent).toBe(1);
    expect((await invite(w.u.org, w.priv, [w.u.extra])).sent).toBe(1);
    expect((await invite(w.u.dios, w.priv, [w.u.otra])).sent).toBe(1);
    // De fuera (ni a la pública), sin cuenta, o a una liga que no existe.
    await fails(invite(w.u.extra, w.pub, [w.u.otra]), DENIED);
    await fails(invite(w.u.extra, w.priv, [w.u.otra]), DENIED);
    await fails(invite(ANON, w.pub, [w.u.otra]), '42501');
    await fails(invite(w.u.org, randomUUID(), [w.u.otra]), 'no_existe');
    // Liga con menores: siempre privada.
    const kids = await league(db, w.u.org, { name: 'Escuelita', visibility: 'private', requirePhoto: false, hasMinors: true });
    await member(db, kids, w.u.org, 'owner', 'org');
    await member(db, kids, w.u.sofi, 'member', 'sofi');
    await fails(invite(w.u.sofi, kids, [w.u.ana]), DENIED);
    expect((await invite(w.u.org, kids, [w.u.ana])).sent).toBe(1);
  });

  it('la lista: sin repetidas y en su orden, de 1 a 50', async () => {
    await fails(invite(w.u.org, w.priv, null), 'invalido');
    await fails(invite(w.u.org, w.priv, []), 'invalido');
    await fails(invite(w.u.org, w.priv, [null]), 'invalido');
    await fails(invite(w.u.org, w.priv, Array.from({ length: 51 }, () => randomUUID())), 'invalido');
    const fifty = Array.from({ length: 50 }, () => randomUUID());
    expect((await invite(w.u.org, w.priv, [...fifty, ...fifty.slice(0, 10)])).results).toHaveLength(50);
    const r = await invite(w.u.org, w.priv, [w.u.extra, w.u.nuevo, w.u.extra, null]);
    expect(r).toEqual({ sent: 2, results: [{ userId: w.u.extra, status: 'sent' }, { userId: w.u.nuevo, status: 'sent' }] });
  });

  it('cada cuenta sale con su estado y solo las nuevas cuentan en el límite', async () => {
    await block(w.u.otra);
    const ghost = randomUUID();
    const r = await invite(w.u.org, w.priv, [w.u.org, ghost, w.u.otra, w.u.luis, w.u.nuevo, w.u.extra]);
    expect(r).toEqual({
      sent: 2,
      results: [
        { userId: w.u.org, status: 'unavailable' },
        { userId: ghost, status: 'unavailable' },
        { userId: w.u.otra, status: 'unavailable' },
        { userId: w.u.luis, status: 'member' },
        { userId: w.u.nuevo, status: 'sent' },
        { userId: w.u.extra, status: 'sent' },
      ],
    });
    // Ya pendiente (también si la manda otro admin).
    expect((await invite(w.u.sofi, w.priv, [w.u.nuevo])).results).toEqual([{ userId: w.u.nuevo, status: 'pending' }]);
    expect(await db.count('public.league_invites', 'league_id = $1 and user_id = $2', [w.priv, w.u.nuevo])).toBe(1);
    // La rechazó: 7 días sin volver a invitar.
    await respond(w.u.nuevo, (await inv(w.priv, w.u.nuevo)).id, false);
    expect((await invite(w.u.org, w.priv, [w.u.nuevo])).results).toEqual([{ userId: w.u.nuevo, status: 'declined' }]);
    await db.admin(`update public.league_invites set decided_at = now() - interval '8 days' where user_id = $1`, [w.u.nuevo]);
    expect((await invite(w.u.org, w.priv, [w.u.nuevo])).results).toEqual([{ userId: w.u.nuevo, status: 'sent' }]);
    expect(await db.admin('select hits from private.rate_limits where key = $1', [`invite:${w.u.org}`])).toEqual([{ hits: 3 }]);
    // Quien invitó queda guardado.
    expect(await inv(w.priv, w.u.nuevo)).toMatchObject({ status: 'pending', invited_by: w.u.org, decided_at: null });
  });

  it('100 invitaciones por día', async () => {
    await fillLimit(`invite:${w.u.org}`, 100);
    await fails(invite(w.u.org, w.priv, [w.u.nuevo]), 'rate_limited');
    await db.admin(`update private.rate_limits set window_start = now() - interval '25 hours' where key = $1`, [`invite:${w.u.org}`]);
    expect((await invite(w.u.org, w.priv, [w.u.nuevo])).sent).toBe(1);
  });

  it('el límite se mira con cada una: una llamada no se pasa de 100 (las que no caben, «rate_limited»)', async () => {
    await fillLimit(`invite:${w.u.org}`, 98);
    const r = await invite(w.u.org, w.priv, [w.u.nuevo, w.u.luis, w.u.extra, w.u.otra]);
    expect(r).toEqual({
      sent: 2,
      results: [
        { userId: w.u.nuevo, status: 'sent' },
        { userId: w.u.luis, status: 'member' },
        { userId: w.u.extra, status: 'sent' },
        { userId: w.u.otra, status: 'rate_limited' },
      ],
    });
    expect(await db.admin('select hits from private.rate_limits where key = $1', [`invite:${w.u.org}`])).toEqual([{ hits: 100 }]);
    expect(await db.count('public.league_invites', 'league_id = $1 and user_id = $2', [w.priv, w.u.otra])).toBe(0);
    await fails(invite(w.u.org, w.priv, [w.u.otra]), 'rate_limited');
  });

  it('push: uno por persona y día de quien invita (invitar, retirar y volver a invitar no le llena el teléfono)', async () => {
    await phone(w.u.nuevo);
    for (let i = 0; i < 3; i++) {
      expect((await invite(w.u.org, w.priv, [w.u.nuevo])).results[0].status).toBe('sent');
      await cancel(w.u.org, (await inv(w.priv, w.u.nuevo)).id);
    }
    // Ni a otra liga el mismo día.
    const kids = await league(db, w.u.org, { name: 'Escuelita', visibility: 'private', requirePhoto: false, hasMinors: true });
    await member(db, kids, w.u.org, 'owner', 'org');
    expect((await invite(w.u.org, kids, [w.u.nuevo])).sent).toBe(1);
    expect((await pushes(w.u.nuevo)).map((p) => p.title)).toEqual(['org te invitó a Liga del Banco']);
    // Otra persona que invita sí le llega; al otro día, también de la misma.
    expect((await invite(w.u.otro, w.pub, [w.u.nuevo])).sent).toBe(1);
    await db.admin(`update public.league_invites set created_at = now() - interval '25 hours' where invited_by = $1`, [w.u.org]);
    await cancel(w.u.org, (await inv(kids, w.u.nuevo)).id);
    expect((await invite(w.u.org, kids, [w.u.nuevo])).sent).toBe(1);
    expect((await pushes(w.u.nuevo)).map((p) => p.title)).toEqual(['org te invitó a Liga del Banco', 'otro te invitó a Liga Abierta', 'org te invitó a Escuelita']);
  });

  it('push «<nombre> te invitó a <liga>» a la cuenta invitada y tiempo real a los dos y a la liga', async () => {
    const sent = await captureRealtime();
    await phone(w.u.nuevo);
    await invite(w.u.org, w.priv, [w.u.nuevo, w.u.extra]);
    const id = (await inv(w.priv, w.u.nuevo)).id;
    expect(await pushes(w.u.nuevo)).toEqual([
      {
        title: 'org te invitó a Liga del Banco',
        body: 'Toca para ver la invitación y unirte.',
        url: `/invitacion/${id}`,
        tag: `invitacion:${id}`,
        ttl: 604800,
        urgency: 'normal',
      },
    ]);
    // Sin teléfono no queda nada en la cola.
    expect(await pushes(w.u.extra)).toEqual([]);
    const mine = (await sent()).filter((m) => m.payload.id === id);
    expect(mine).toEqual([
      { topic: `user:${w.u.nuevo}`, payload: { id, status: 'pending', league_id: w.priv } },
      { topic: `user:${w.u.org}`, payload: { id, status: 'pending', league_id: w.priv } },
      { topic: `league:${w.priv}`, payload: { id, status: 'pending' } },
    ]);
    await respond(w.u.nuevo, id, true);
    expect((await sent()).filter((m) => m.payload.id === id && m.payload.status === 'accepted').map((m) => m.topic)).toEqual([
      `user:${w.u.nuevo}`,
      `user:${w.u.org}`,
      `league:${w.priv}`,
    ]);
  });
});

describe('responder', () => {
  it('aceptar: entra a la liga con su jugador, la invitación queda aceptada y le llega un push a quien invitó', async () => {
    await phone(w.u.org);
    await invite(w.u.org, w.priv, [w.u.nuevo]);
    const { id } = await inv(w.priv, w.u.nuevo);
    await fails(respond(w.u.luis, id, true), 'no_existe');
    await fails(respond(w.u.nuevo, id, null), 'invalido');
    await fails(respond(w.u.nuevo, randomUUID(), true), 'no_existe');
    const r = await respond(w.u.nuevo, id, true);
    expect(r).toEqual({ status: 'accepted', leagueId: w.priv, playerId: expect.any(String), claimId: null });
    expect(await db.admin('select role, display_name from public.league_members where league_id = $1 and user_id = $2', [w.priv, w.u.nuevo])).toEqual([
      { role: 'member', display_name: 'new' },
    ]);
    expect(await db.admin('select id, name from public.players where league_id = $1 and user_id = $2', [w.priv, w.u.nuevo])).toEqual([
      { id: r.playerId, name: 'new' },
    ]);
    const row = await inv(w.priv, w.u.nuevo);
    expect(row.status).toBe('accepted');
    expect(row.decided_at).not.toBeNull();
    expect(await pushes(w.u.org)).toEqual([
      { title: 'new aceptó tu invitación', body: 'Ya está en Liga del Banco.', url: `/l/${w.priv}`, tag: `invitacion-ok:${id}`, ttl: 86400, urgency: 'normal' },
    ]);
    // Otra vez (o rechazarla después): cómo quedó, sin cambiar nada.
    expect(await respond(w.u.nuevo, id, true)).toEqual({ status: 'accepted', leagueId: w.priv });
    expect(await respond(w.u.nuevo, id, false)).toEqual({ status: 'accepted', leagueId: w.priv });
    expect(await pushes(w.u.org)).toHaveLength(1);
    expect(await myInvites(w.u.nuevo)).toEqual([]);
  });

  it('aceptar eligiendo un jugador libre («¿Quién eres?») deja el reclamo, como join_league', async () => {
    await invite(w.u.org, w.priv, [w.u.nuevo]);
    const { id } = await inv(w.priv, w.u.nuevo);
    expect(await details(w.u.nuevo, id)).toMatchObject({ players: [{ id: w.p.pedro, name: 'Pedro' }] });
    const r = await respond(w.u.nuevo, id, true, w.p.pedro);
    expect(r.claimId).toEqual(expect.any(String));
    expect(r.playerId).not.toBe(w.p.pedro);
    expect(await db.admin('select player_id, user_id, status from public.player_claims where id = $1', [r.claimId])).toEqual([
      { player_id: w.p.pedro, user_id: w.u.nuevo, status: 'pending' },
    ]);
    expect(await details(w.u.nuevo, id)).toMatchObject({ status: 'accepted', member: true, players: [] });
  });

  it('rechazar: no entra y la invitación queda cerrada', async () => {
    await invite(w.u.org, w.priv, [w.u.nuevo]);
    const { id } = await inv(w.priv, w.u.nuevo);
    expect(await respond(w.u.nuevo, id, false)).toEqual({ status: 'declined', leagueId: w.priv });
    expect(await isMember(w.priv, w.u.nuevo)).toBe(false);
    expect(await inv(w.priv, w.u.nuevo)).toMatchObject({ status: 'declined', decided_at: expect.any(Date) });
    expect(await respond(w.u.nuevo, id, true)).toEqual({ status: 'declined', leagueId: w.priv });
    expect(await isMember(w.priv, w.u.nuevo)).toBe(false);
  });

  it('si la liga dejó de ser pública y quien invitó no es admin, ya no vale (ni se ve la liga); la del dueño sí', async () => {
    await player(db, w.pub, 'Jugador Libre');
    await member(db, w.pub, w.u.luis, 'member', 'luis');
    await invite(w.u.luis, w.pub, [w.u.extra]);
    await invite(w.u.otro, w.pub, [w.u.nuevo]);
    const old = (await inv(w.pub, w.u.extra)).id;
    await db.admin(`update public.leagues set visibility = 'private' where id = $1`, [w.pub]);
    // La de luis ya no sale en su campana, ni con los datos de la liga (ahora privada) ni sus jugadores.
    expect(await myInvites(w.u.extra)).toEqual([]);
    expect(await details(w.u.extra, old)).toMatchObject({
      status: 'cancelled',
      players: [],
      league: { id: w.pub, name: 'Liga Abierta', visibility: 'private', venue: null, schedule: null, seasonStart: null, seasonEnd: null, members: null },
    });
    expect((await search(w.u.otro, 'extra', w.pub)).find((p) => p.id === w.u.extra)).toMatchObject({ invited: false });
    // La del dueño sigue: con todo.
    expect((await myInvites(w.u.nuevo)).map((i) => i.leagueId)).toEqual([w.pub]);
    expect(await details(w.u.nuevo, (await inv(w.pub, w.u.nuevo)).id)).toMatchObject({
      status: 'pending',
      league: { venue: 'Bolera', members: 2 },
      players: expect.arrayContaining([expect.objectContaining({ name: 'Jugador Libre' })]),
    });
    // El dueño la puede invitar otra vez: la vieja se cancela y queda la nueva.
    expect((await invite(w.u.otro, w.pub, [w.u.extra])).results).toEqual([{ userId: w.u.extra, status: 'sent' }]);
    expect(await db.admin('select status from public.league_invites where id = $1', [old])).toEqual([{ status: 'cancelled' }]);
    expect(await respond(w.u.extra, old, true)).toEqual({ status: 'cancelled', leagueId: w.pub });
    expect(await isMember(w.pub, w.u.extra)).toBe(false);
    expect(await respond(w.u.nuevo, (await inv(w.pub, w.u.nuevo)).id, true)).toMatchObject({ status: 'accepted' });
    expect(await isMember(w.pub, w.u.nuevo)).toBe(true);
  });

  it('una cuenta bloqueada no responde; si quien invitó está bloqueado, su invitación ya no vale', async () => {
    await invite(w.u.sofi, w.priv, [w.u.extra, w.u.nuevo]);
    await block(w.u.extra);
    await fails(respond(w.u.extra, (await inv(w.priv, w.u.extra)).id, true), 'bloqueada');
    await phone(w.u.sofi);
    const id = (await inv(w.priv, w.u.nuevo)).id;
    await block(w.u.sofi);
    // Ya no sale ni deja entrar a la privada (ni le llega el push de «aceptó»).
    expect(await myInvites(w.u.nuevo)).toEqual([]);
    expect(await details(w.u.nuevo, id)).toMatchObject({ status: 'cancelled', players: [], league: { venue: null } });
    expect(await respond(w.u.nuevo, id, true)).toEqual({ status: 'cancelled', leagueId: w.priv });
    expect(await isMember(w.priv, w.u.nuevo)).toBe(false);
    expect(await pushes(w.u.sofi)).toEqual([]);
    // Otro admin sí la puede invitar.
    expect((await invite(w.u.org, w.priv, [w.u.nuevo])).results).toEqual([{ userId: w.u.nuevo, status: 'sent' }]);
    // Bloqueada, tampoco invita.
    await fails(invite(w.u.sofi, w.priv, [w.u.otra]), 'bloqueada');
  });
});

describe('otros caminos', () => {
  it('unirse con el código (o a la pública) acepta la invitación pendiente', async () => {
    await invite(w.u.org, w.priv, [w.u.nuevo]);
    await db.rpc(w.u.nuevo, 'join_league', { p_code: w.code });
    expect(await inv(w.priv, w.u.nuevo)).toMatchObject({ status: 'accepted', decided_at: expect.any(Date) });
    await invite(w.u.otro, w.pub, [w.u.extra]);
    await db.rpc(w.u.extra, 'join_league', { p_league: w.pub });
    expect((await inv(w.pub, w.u.extra)).status).toBe('accepted');
  });

  it('salir de la liga (o que lo saquen) cancela las que mandó; borrar la liga o la cuenta no falla', async () => {
    await invite(w.u.sofi, w.priv, [w.u.extra]);
    await invite(w.u.org, w.priv, [w.u.nuevo]);
    await db.rpc(w.u.sofi, 'leave_league', { p_league: w.priv });
    expect((await inv(w.priv, w.u.extra)).status).toBe('cancelled');
    expect((await inv(w.priv, w.u.nuevo)).status).toBe('pending');
    // En la pública: el dueño saca a luis y su invitación se cancela.
    await member(db, w.pub, w.u.luis, 'member', 'luis');
    await invite(w.u.luis, w.pub, [w.u.ana]);
    await db.rpc(w.u.otro, 'remove_member', { p_league: w.pub, p_user: w.u.luis });
    expect((await inv(w.pub, w.u.ana)).status).toBe('cancelled');
    // Se borra la cuenta de quien invitó: la invitación sigue, sin quien invitó.
    await member(db, w.pub, w.u.otra, 'member', 'otra');
    await invite(w.u.otra, w.pub, [w.u.extra]);
    await db.admin('delete from auth.users where id = $1', [w.u.otra]);
    expect(await inv(w.pub, w.u.extra)).toMatchObject({ status: 'pending', invited_by: null });
    expect(await myInvites(w.u.extra)).toEqual([expect.objectContaining({ leagueId: w.pub, invitedBy: null })]);
    // Se borra la liga: se van sus invitaciones.
    await db.rpc(w.u.org, 'delete_league', { p_league: w.priv });
    expect(await db.count('public.league_invites', 'league_id = $1', [w.priv])).toBe(0);
  });

  it('cancelar: quien invitó o un admin; la invitada responde que ya no está', async () => {
    await invite(w.u.sofi, w.priv, [w.u.extra]);
    const { id } = await inv(w.priv, w.u.extra);
    await fails(cancel(w.u.luis, id), DENIED);
    await fails(cancel(w.u.extra, id), DENIED);
    await fails(cancel(w.u.otro, id), DENIED);
    await fails(cancel(w.u.org, randomUUID()), 'no_existe');
    await cancel(w.u.org, id);
    expect(await inv(w.priv, w.u.extra)).toMatchObject({ status: 'cancelled', decided_at: expect.any(Date) });
    await cancel(w.u.sofi, id);
    expect(await respond(w.u.extra, id, true)).toEqual({ status: 'cancelled', leagueId: w.priv });
    // Se puede volver a invitar; quien invitó también la retira.
    expect((await invite(w.u.sofi, w.priv, [w.u.extra])).results[0].status).toBe('sent');
    await cancel(w.u.sofi, (await inv(w.priv, w.u.extra)).id);
    expect((await inv(w.priv, w.u.extra)).status).toBe('cancelled');
    // Ya aceptada: no cambia.
    await invite(w.u.org, w.priv, [w.u.nuevo]);
    const acc = (await inv(w.priv, w.u.nuevo)).id;
    await respond(w.u.nuevo, acc, true);
    await cancel(w.u.org, acc);
    expect((await inv(w.priv, w.u.nuevo)).status).toBe('accepted');
  });
});

describe('lo que lee la app', () => {
  it('mis invitaciones pendientes, la más nueva primero', async () => {
    await member(db, w.pub, w.u.luis, 'member', 'luis');
    await invite(w.u.org, w.priv, [w.u.nuevo]);
    await invite(w.u.luis, w.pub, [w.u.nuevo]);
    await invite(w.u.org, w.priv, [w.u.extra]);
    await db.admin(`update public.league_invites set created_at = now() - interval '1 hour' where league_id = $1`, [w.priv]);
    const [a, b] = [await inv(w.pub, w.u.nuevo), await inv(w.priv, w.u.nuevo)];
    const list = await myInvites(w.u.nuevo);
    expect(list).toEqual([
      {
        id: a.id,
        leagueId: w.pub,
        leagueName: 'Liga Abierta',
        sport: 'bowling',
        kind: 'liga',
        visibility: 'public',
        members: 2,
        invitedBy: { id: w.u.luis, name: 'luis', username: 'luis' },
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      },
      expect.objectContaining({ id: b.id, leagueId: w.priv, leagueName: 'Liga del Banco', visibility: 'private', members: 4, invitedBy: { id: w.u.org, name: 'org', username: 'org' } }),
    ]);
    await respond(w.u.nuevo, b.id, false);
    expect((await myInvites(w.u.nuevo)).map((i) => i.id)).toEqual([a.id]);
    expect(await myInvites(w.u.org)).toEqual([]);
  });

  it('el detalle: solo para la cuenta invitada (y el superadmin), con los jugadores libres mientras está pendiente', async () => {
    await invite(w.u.org, w.priv, [w.u.nuevo]);
    const { id } = await inv(w.priv, w.u.nuevo);
    expect(await details(w.u.nuevo, id)).toEqual({
      id,
      status: 'pending',
      createdAt: expect.any(String),
      invitedBy: { id: w.u.org, name: 'org', username: 'org' },
      mine: true,
      member: false,
      league: {
        id: w.priv,
        name: 'Liga del Banco',
        sport: 'bowling',
        kind: 'liga',
        visibility: 'private',
        venue: 'Bolera',
        schedule: 'Martes 7 pm',
        seasonStart: '2026-01-01',
        seasonEnd: '2026-12-31',
        members: 4,
      },
      players: [{ id: w.p.pedro, name: 'Pedro' }],
    });
    // Un jugador con reclamo pendiente de otra cuenta ya no se ofrece.
    await db.rpc(w.u.ana, 'request_player_claim', { p_player: w.p.pedro });
    expect(await details(w.u.nuevo, id)).toMatchObject({ players: [] });
    for (const who of [w.u.org, w.u.sofi, w.u.luis, w.u.extra]) expect(await details(who, id)).toBeNull();
    // El superadmin la ve, pero no es suya (no la responde); member habla de la cuenta invitada.
    expect(await details(w.u.dios, id)).toMatchObject({ id, status: 'pending', mine: false, member: false });
    await fails(respond(w.u.dios, id, true), 'no_existe');
    expect(await details(w.u.nuevo, randomUUID())).toBeNull();
    // Aceptó y después salió: sigue 'accepted', pero member dice que ya no está.
    await respond(w.u.nuevo, id, true);
    expect(await details(w.u.dios, id)).toMatchObject({ status: 'accepted', mine: false, member: true });
    await db.rpc(w.u.nuevo, 'leave_league', { p_league: w.priv });
    expect(await details(w.u.nuevo, id)).toMatchObject({ status: 'accepted', mine: true, member: false, league: { venue: null, members: null } });
  });

  it('la tabla: la leen la invitada, quien invitó y los admins de la liga; nadie escribe directo', async () => {
    await member(db, w.pub, w.u.luis, 'member', 'luis');
    await invite(w.u.luis, w.pub, [w.u.nuevo]);
    const { id } = await inv(w.pub, w.u.nuevo);
    const read = (uid: string) => db.asUser<{ id: string }>(uid, 'select id from public.league_invites');
    for (const u of [w.u.nuevo, w.u.luis, w.u.otro, w.u.dios]) expect(await read(u), u).toEqual([{ id }]);
    for (const u of [w.u.ana, w.u.org, w.u.extra]) expect(await read(u), u).toEqual([]);
    await fails(db.asAnon('select id from public.league_invites'), '42501');
    await fails(db.asUser(w.u.nuevo, `update public.league_invites set status = 'accepted', decided_at = now() where id = $1`, [id]), '42501');
    await fails(db.asUser(w.u.luis, 'insert into public.league_invites (league_id, user_id, invited_by) values ($1, $2, $3)', [w.pub, w.u.extra, w.u.luis]), '42501');
    await fails(db.asUser(w.u.otro, 'delete from public.league_invites where id = $1', [id]), '42501');
    // Las reglas valen también por debajo.
    await fails(db.asService('insert into public.league_invites (league_id, user_id, invited_by) values ($1, $2, $2)', [w.pub, w.u.extra]), '23514');
    await fails(db.asService('insert into public.league_invites (league_id, user_id) values ($1, $2)', [w.pub, w.u.nuevo]), '23505');
    await fails(db.asService(`insert into public.league_invites (league_id, user_id, status) values ($1, $2, 'accepted')`, [w.pub, w.u.extra]), '23514');
    // Borrar deja su tombstone.
    await db.admin('delete from public.league_invites where id = $1', [id]);
    expect(await db.admin('select tbl, row_key, league_id from public.tombstones where tbl = $1', ['league_invites'])).toEqual([
      { tbl: 'league_invites', row_key: id, league_id: w.pub },
    ]);
  });
});

describe('jugadores al aceptar', () => {
  it('un jugador con el mismo nombre libre queda pedido (ensure_player de siempre)', async () => {
    const jose = await player(db, w.priv, 'José Peña');
    const u = await db.createUser('jose@x.com', 'jose pena');
    await invite(w.u.org, w.priv, [u]);
    const r = await respond(u, (await inv(w.priv, u)).id, true);
    expect(r.playerId).not.toBe(jose);
    expect(await db.admin('select player_id, status from public.player_claims where id = $1', [r.claimId])).toEqual([{ player_id: jose, status: 'pending' }]);
  });
});

describe('servicio', () => {
  it('service_role lee todo (respaldos)', async () => {
    await invite(w.u.org, w.priv, [w.u.nuevo]);
    expect(await db.as(SERVICE, 'select user_id from public.league_invites')).toEqual([{ user_id: w.u.nuevo }]);
  });
});
