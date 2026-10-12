/**
 * Equipos fuera de una liga y transmisiones en vivo (20261011000100_equipos_en_vivo.sql; contrato en
 * docs/equipos-y-en-vivo.md): crear, código, unirse, plantilla y capitanía, límites, borrar la cuenta, logo, cambiar y
 * borrar, seguir y buscar, la página, el muro (y Siguiendo, con bloqueos), pedir entrar a una liga, aceptar (el equipo
 * de temporada con su plantilla), rechazar, retirar, sincronizar, temporadas nuevas, el récord, los avisos; y las
 * transmisiones: los links, activar la liga, quién transmite, topes, terminar, lo que ve cada quien, En vivo ahora, el
 * aviso y el tiempo real.
 *
 * Mundo: el de fixture.ts (liga privada del Banco de boliche y liga pública Abierta) más seis cuentas p1…p6 sin liga
 * ('Jugador 1'…'Jugador 6') y, donde hace falta, una liga pública de fútbol (org dueño, sofi admin).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, SERVICE, TestDb, fails } from './harness';
import { event, league, makeWorld, member, player, withCopa, type World } from './fixture';

let db: TestDb;
let w: World;
let p: string[];

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
  p = [];
  for (let i = 1; i <= 6; i++) p.push(await db.createUser(`p${i}@x.com`, `Jugador ${i}`));
});
afterEach(async () => {
  await db.rollback();
});

type Json = Record<string, any>;
interface Created {
  squadId: string;
  inviteCode: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const uuid = () => randomUUID();
const ZERO = { played: 0, won: 0, drawn: 0, lost: 0 };

const NEW_RPC = [
  'begin_squad_logo', 'create_squad', 'decide_squad_request', 'delete_squad', 'end_stream', 'follow_squad', 'followed_squads',
  'join_squad', 'league_squad_requests', 'league_streams', 'leave_squad', 'live_now', 'my_squads', 'remove_squad_member',
  'renew_squad_code', 'request_squad_league', 'search_squads', 'set_league_live', 'set_squad_logo', 'set_squad_member',
  'squad_code', 'squad_page', 'squad_posts', 'squad_preview', 'start_stream', 'sync_squad_roster', 'unfollow_squad',
  'update_squad', 'withdraw_squad_request',
];
// squad_posts también sin cuenta desde 20261012000100_perfiles_equipos_esports.sql.
const ANON_RPC = ['league_streams', 'squad_page', 'squad_posts', 'squad_preview'];
const HELPERS = [
  'squad_lite', 'squad_line', 'squad_color', 'squad_new_code', 'squad_as_captain', 'squad_count', 'squad_record',
  'squad_leagues_json', 'squad_ensure_player', 'squad_materialize', 'squad_members_count', 'squad_follows_count',
  'squad_team_gone', 'stream_platform', 'stream_can', 'stream_label', 'stream_json', 'stream_push', 'post_json', 'push_category',
];

/** Crea un equipo (sin el límite de 5 por día). */
async function mkSquad(who: string, name: string, o: Json = {}): Promise<Created> {
  await db.admin(`delete from private.rate_limits where key = $1`, [`squad:${who}`]);
  return db.rpc<Created>(who, 'create_squad', {
    p_sport: o.sport ?? 'football',
    p_name: name,
    p_tag: o.tag ?? 'TST',
    p_description: o.description ?? '',
    p_city: o.city ?? null,
    p_color: o.color ?? null,
    p_id: o.id ?? null,
  });
}
/** Un equipo con su capitán y los que entran con el código. */
async function squadWith(captain: string, others: string[], name = 'Tigres', o: Json = {}): Promise<Created> {
  const s = await mkSquad(captain, name, o);
  for (const u of others) await db.rpc(u, 'join_squad', { p_code: s.inviteCode });
  return s;
}
const page = (who: string, id: string) => db.rpc<Json | null>(who, 'squad_page', { p_squad: id });
const row = async (id: string) => (await db.admin<Json>('select * from public.squads where id = $1', [id]))[0];
const roles = (id: string) =>
  db.admin<Json>('select user_id, role, position, jersey from public.squad_members where squad_id = $1 order by role, user_id', [id]);
const setMember = (who: string, squad: string, user: string, o: Json = {}) =>
  db.rpc(who, 'set_squad_member', { p_squad: squad, p_user: user, p_role: o.role ?? null, p_position: o.position ?? null, p_jersey: o.jersey ?? null });
const phone = (uid: string) =>
  db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'BPclave', 'secreto')`, [
    uid,
    `https://fcm.googleapis.com/fcm/send/${uid}`,
  ]);
const pushes = (uid: string) => db.admin<Json>('select title, body, url, tag from public.push_outbox where user_id = $1 order by id', [uid]);
const fillLimit = (key: string, hits: number) =>
  db.admin(
    `insert into private.rate_limits (key, window_start, hits) values ($1, now(), $2)
     on conflict (key) do update set window_start = now(), hits = excluded.hits`,
    [key, hits],
  );
/** Cuentas nuevas en lote (el trigger les crea el perfil). */
const manyUsers = async (prefix: string, n: number) =>
  (
    await db.admin<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data)
       select $1 || i || '@x.com', jsonb_build_object('name', $1 || ' ' || i) from generate_series(1, $2::integer) i returning id`,
      [prefix, n],
    )
  ).map((r) => r.id);

/** En la transacción de la prueba: un realtime.send falso que guarda lo que emit manda (como en Supabase). */
async function captureRealtime() {
  await db.admin('create schema if not exists realtime');
  await db.admin('create table realtime.sent (n serial, payload jsonb, event text, topic text, private boolean)');
  await db.admin(`create function realtime.send(payload jsonb, event text, topic text, private boolean default false) returns void
                  language sql as $$ insert into realtime.sent (payload, event, topic, private) values (payload, event, topic, private) $$`);
  return (event: string) => db.admin<{ topic: string; payload: Json }>(`select topic, payload from realtime.sent where event = $1 order by n`, [event]);
}

/** Liga pública de fútbol: org dueño, sofi admin (y quien se pase en `members`). */
async function futbol(name = 'Liga de Fútbol', o: { visibility?: 'public' | 'private'; sport?: string; hasMinors?: boolean } = {}) {
  const lid = await league(db, w.u.org, {
    name,
    visibility: o.visibility ?? 'public',
    sport: o.sport ?? 'football',
    requirePhoto: false,
    hasMinors: o.hasMinors ?? false,
  });
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  return lid;
}
const request = (who: string, squad: string, lid: string) => db.rpc<string>(who, 'request_squad_league', { p_squad: squad, p_league: lid });
const decide = (who: string, req: string, approve: boolean, note: string | null = null) =>
  db.rpc<Json>(who, 'decide_squad_request', { p_request: req, p_approve: approve, p_note: note });
const sync = (who: string, squad: string, lid: string) => db.rpc<Json>(who, 'sync_squad_roster', { p_squad: squad, p_league: lid });
const reqStatus = async (id: string) => (await db.admin<{ status: string }>('select status from public.squad_league_requests where id = $1', [id]))[0].status;
const activeSeason = async (lid: string) =>
  (await db.admin<{ id: string }>(`select id from public.seasons where league_id = $1 and status = 'active'`, [lid]))[0].id;
/** Plantilla del equipo de liga: [{user_id, role, jersey, position}] por cuenta. */
const teamRoster = (team: string) =>
  db.admin<Json>(
    `select p.user_id, tp.role, tp.jersey, tp.position from public.team_players tp join public.players p on p.id = tp.player_id
      where tp.team_id = $1 order by tp.role, p.user_id`,
    [team],
  );
/** Un partido con dos lados (labels) y equipos. */
async function match(lid: string, a: { team?: string | null; label: string }, b: { team?: string | null; label: string }, o: Json = {}) {
  const id = (
    await db.admin<{ id: string }>(
      `insert into public.matches (league_id, status, winner_side, walkover_side) values ($1, $2, $3, $4) returning id`,
      [lid, o.status ?? 'scheduled', o.winner ?? null, o.walkover ?? null],
    )
  )[0].id;
  await db.admin(
    `insert into public.match_sides (match_id, side, league_id, team_id, label) values ($1, 1, $2, $3, $4), ($1, 2, $2, $5, $6)`,
    [id, lid, a.team ?? null, a.label, b.team ?? null, b.label],
  );
  return id;
}

// =====================================================================

describe('permisos', () => {
  it('las RPC nuevas: security definer, search_path vacío y con sesión (squad_preview, squad_page y league_streams también sin cuenta); las ayudas, nadie de la app', async () => {
    const rows = await db.admin<{ fn: string; definer: boolean; anon: boolean; auth: boolean; uid: boolean; path: boolean }>(
      `select p.proname as fn, p.prosecdef as definer, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth, p.prosrc like '%private.require_uid()%' as uid,
              'search_path=""' = any (p.proconfig) as path
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1) order by 1`,
      [NEW_RPC],
    );
    expect(rows).toEqual(
      NEW_RPC.map((fn) => ({ fn, definer: true, anon: ANON_RPC.includes(fn), auth: true, uid: !ANON_RPC.includes(fn), path: true })),
    );
    // create_post (se creó de nuevo con p_squad; 20261012000100_perfiles_equipos_esports.sql suma el juego): una sola,
    // solo con sesión.
    expect(
      await db.admin(
        `select p.oid::regprocedure::text as sig, has_function_privilege('anon', p.oid, 'execute') as anon,
                has_function_privilege('authenticated', p.oid, 'execute') as auth
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_post'`,
      ),
    ).toEqual([{ sig: 'create_post(uuid,text,text,integer,integer,uuid,text,text,uuid,text,uuid,uuid)', anon: false, auth: true }]);
    const helpers = await db.admin<{ fn: string; auth: boolean; anon: boolean }>(
      `select p.proname as fn, has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('anon', p.oid, 'execute') as anon
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = any ($1) order by 1`,
      [HELPERS],
    );
    expect(new Set(helpers.map((h) => h.fn))).toEqual(new Set(HELPERS));
    for (const h of helpers) expect(h, h.fn).toMatchObject({ auth: false, anon: false });
    // Las de Storage siguen para authenticated.
    expect(
      await db.admin(
        `select has_function_privilege('authenticated', 'private.can_upload_logo_path(text)', 'execute') as up,
                has_function_privilege('authenticated', 'private.can_remove_logo_path(text)', 'execute') as rm`,
      ),
    ).toEqual([{ up: true, rm: true }]);
    // Sin cuenta, nada más.
    await fails(db.rpc(ANON, 'create_squad', { p_sport: 'football', p_name: 'X', p_tag: 'XX' }), '42501');
    await fails(db.rpc(ANON, 'join_squad', { p_code: 'ABCDEFGH' }), '42501');
    await fails(db.rpc(ANON, 'start_stream', { p_league: w.pub, p_url: 'https://youtu.be/x' }), '42501');
    await fails(db.rpc(ANON, 'live_now', {}), '42501');
    await fails(db.as(w.u.luis, `select private.stream_platform('https://youtu.be/x')`), '42501');
  });

  it('las tablas: RLS y nadie las lee ni escribe directo; leagues.live_enabled se lee con la liga', async () => {
    const tables = ['live_streams', 'squad_follows', 'squad_league_requests', 'squad_members', 'squad_secrets', 'squads'];
    expect(
      await db.admin(
        `select c.relname, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = any ($1) order by 1`,
        [tables],
      ),
    ).toEqual(tables.map((relname) => ({ relname, rls: true })));
    await mkSquad(p[0], 'Tigres');
    for (const t of tables) {
      for (const who of [ANON, p[0], w.u.dios]) {
        await fails(db.as(who, `select * from public.${t}`), '42501');
        await fails(db.as(who, `delete from public.${t}`), '42501');
      }
    }
    expect(await db.asAnon('select live_enabled from public.leagues where id = $1', [w.pub])).toEqual([{ live_enabled: false }]);
    expect(await db.asUser(w.u.luis, 'select live_enabled from public.leagues where id = $1', [w.priv])).toEqual([{ live_enabled: false }]);
    // squad_id de los equipos de liga y de las publicaciones: se leen como el resto de la fila (teams) o por RPC (posts).
    expect(await db.asAnon('select squad_id from public.teams where league_id = $1', [w.pub])).toEqual([]);
  });
});

// =====================================================================

describe('equipos', () => {
  it('crear: capitán con su código; nombre único por deporte (sin acentos ni mayúsculas); no esports; textos y color; 5 por día', async () => {
    const s = await mkSquad(p[0], '  Los   Tigres ', { tag: 'tgr', description: '  Del barrio  ', city: ' Santo   Domingo ', color: '#FF8800' });
    expect(s.inviteCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(await row(s.squadId)).toMatchObject({
      sport: 'football', name: 'Los Tigres', tag: 'TGR', description: 'Del barrio', city: 'Santo Domingo', color: '#ff8800',
      logo_path: null, recruiting: false, captain_id: p[0], member_count: 1, follower_count: 0, created_by: p[0],
    });
    expect(await roles(s.squadId)).toEqual([{ user_id: p[0], role: 'captain', position: null, jersey: null }]);
    expect(await db.admin('select invite_code from public.squad_secrets where squad_id = $1', [s.squadId])).toEqual([{ invite_code: s.inviteCode }]);
    // Repetido en el deporte (sin acentos ni mayúsculas); en otro deporte sí.
    await fails(mkSquad(p[1], 'los tígres'), 'duplicado');
    await mkSquad(p[1], 'Los Tigres', { sport: 'basketball' });
    // Esports tiene sus equipos; un deporte que no existe; tag, nombre, color, textos largos y palabras.
    await fails(mkSquad(p[1], 'Gamers', { sport: 'esports' }), INVALID);
    await fails(mkSquad(p[1], 'Curling', { sport: 'curling' }), INVALID);
    await fails(mkSquad(p[1], 'Tag malo', { tag: 'A' }), INVALID);
    await fails(mkSquad(p[1], 'Tag malo', { tag: 'AB-C' }), INVALID);
    await fails(mkSquad(p[1], 'X'), INVALID);
    await fails(mkSquad(p[1], 'x'.repeat(41)), INVALID);
    await fails(mkSquad(p[1], 'Rojos', { color: 'rojo' }), INVALID);
    await fails(mkSquad(p[1], 'Largos', { description: 'x'.repeat(201) }), INVALID);
    await fails(mkSquad(p[1], 'Lejos', { city: 'x'.repeat(41) }), INVALID);
    await fails(mkSquad(p[1], 'Los Pendejos'), 'palabras');
    await fails(mkSquad(p[1], 'Limpios', { description: 'somos una mierda' }), 'palabras');
    // Cinco por día (los que fallan no cuentan).
    await db.admin(`delete from private.rate_limits where key = $1`, [`squad:${p[2]}`]);
    for (let i = 1; i <= 5; i++) await db.rpc(p[2], 'create_squad', { p_sport: 'futsal', p_name: `Sala ${i}`, p_tag: 'SAL' });
    await fails(db.rpc(p[2], 'create_squad', { p_sport: 'futsal', p_name: 'Sala 6', p_tag: 'SAL' }), 'rate_limited');
  });

  it('reintento con el mismo p_id: el mismo equipo y código si sigo de capitán; si no, duplicado', async () => {
    const id = uuid();
    const s = await mkSquad(p[0], 'Tigres', { id });
    expect(s.squadId).toBe(id);
    expect(await mkSquad(p[0], 'Tigres', { id })).toEqual(s);
    await fails(mkSquad(p[1], 'Otro', { id }), 'duplicado');
    expect(await db.count('public.squads')).toBe(1);
  });

  it('límites: capitán de 10 o miembro de 20 equipos (limite); 40 miembros (cupo_lleno)', async () => {
    // p0 ya es capitán de 10.
    await db.admin(
      `with s as (insert into public.squads (sport, name, tag, captain_id) select 'football', 'Equipo ' || i, 'EQ', $1
                    from generate_series(1, 10) i returning id)
       insert into public.squad_members (squad_id, user_id, role) select s.id, $1, 'captain' from s`,
      [p[0]],
    );
    await fails(mkSquad(p[0], 'Once'), 'limite');
    // p1 es miembro de 20 (de los que p2 es capitán): no entra a otro ni crea.
    await db.admin(
      `with s as (insert into public.squads (sport, name, tag, captain_id) select 'basketball', 'Quinteto ' || i, 'QT', $1
                    from generate_series(1, 20) i returning id)
       insert into public.squad_members (squad_id, user_id, role)
       select s.id, $1, 'captain' from s union all select s.id, $2, 'member' from s`,
      [p[2], p[1]],
    );
    const t = await mkSquad(p[3], 'Abiertos');
    await fails(db.rpc(p[1], 'join_squad', { p_code: t.inviteCode }), 'limite');
    await fails(mkSquad(p[1], 'Propio'), 'limite');
    // 40 miembros: lleno.
    const many = await manyUsers('m', 39);
    await db.admin(`insert into public.squad_members (squad_id, user_id) select $1, unnest($2::uuid[])`, [t.squadId, many]);
    expect((await row(t.squadId)).member_count).toBe(40);
    await fails(db.rpc(p[4], 'join_squad', { p_code: t.inviteCode }), 'cupo_lleno');
  });

  it('el código: solo el capitán lo lee; sin cuenta se ve a qué equipo lleva; unirse (código malo: null; a los 10, rate_limited); aviso al capitán', async () => {
    await phone(p[0]);
    const s = await mkSquad(p[0], 'Tigres');
    expect(await db.rpc(p[0], 'squad_code', { p_squad: s.squadId })).toBe(s.inviteCode);
    await fails(db.rpc(p[1], 'squad_code', { p_squad: s.squadId }), DENIED);
    expect(await db.rpc(w.u.dios, 'squad_code', { p_squad: s.squadId })).toBe(s.inviteCode);
    const lite = { id: s.squadId, sport: 'football', name: 'Tigres', tag: 'TST', logo: null, color: null, city: null, recruiting: false, members: 1, followers: 0 };
    const code = ` ${s.inviteCode.toLowerCase().slice(0, 4)} ${s.inviteCode.slice(4)}`;
    expect(await db.rpc(ANON, 'squad_preview', { p_code: code })).toEqual(lite);
    expect(await db.rpc(p[1], 'squad_preview', { p_code: s.inviteCode })).toEqual(lite);
    expect(await db.rpc(ANON, 'squad_preview', { p_code: 'ZZZZZZZZ' })).toBeNull();
    // Seguía al equipo: al entrar deja de seguirlo (los miembros no lo siguen).
    await db.rpc(p[1], 'follow_squad', { p_squad: s.squadId });
    expect(await db.rpc(p[1], 'join_squad', { p_code: code })).toEqual({ squadId: s.squadId });
    expect(await row(s.squadId)).toMatchObject({ member_count: 2, follower_count: 0 });
    expect(await pushes(p[0])).toEqual([
      { title: 'Jugador 2 se unió a tu equipo', body: 'Tigres', url: `/equipos/${s.squadId}`, tag: `equipo:miembro:${s.squadId}` },
    ]);
    // Otra vez: lo mismo, sin otro aviso.
    expect(await db.rpc(p[1], 'join_squad', { p_code: s.inviteCode })).toEqual({ squadId: s.squadId });
    expect(await pushes(p[0])).toHaveLength(1);
    // El siguiente que entra mientras el aviso espera: se le cambia el texto (no se encola otro).
    await db.rpc(p[2], 'join_squad', { p_code: s.inviteCode });
    expect(await pushes(p[0])).toEqual([expect.objectContaining({ title: 'Jugador 3 se unió a tu equipo' })]);
    // Código nuevo: el anterior ya no sirve.
    const renewed = await db.rpc<string>(p[0], 'renew_squad_code', { p_squad: s.squadId });
    expect(renewed).not.toBe(s.inviteCode);
    await fails(db.rpc(p[1], 'renew_squad_code', { p_squad: s.squadId }), DENIED);
    expect(await db.rpc(p[3], 'join_squad', { p_code: s.inviteCode })).toBeNull();
    for (let i = 0; i < 9; i++) expect(await db.rpc(p[3], 'join_squad', { p_code: 'ABCDEFGH' })).toBeNull();
    await fails(db.rpc(p[3], 'join_squad', { p_code: renewed }), 'rate_limited');
  });

  it('plantilla: posición y número, pasar la capitanía, sacar y salir; el capitán no sale con otros; el último se lleva el equipo', async () => {
    const s = await squadWith(p[0], [p[1], p[2]]);
    await fails(db.rpc(p[0], 'leave_squad', { p_squad: s.squadId }), INVALID);
    await fails(db.rpc(p[1], 'remove_squad_member', { p_squad: s.squadId, p_user: p[2] }), DENIED);
    await fails(db.rpc(p[0], 'remove_squad_member', { p_squad: s.squadId, p_user: p[0] }), INVALID);
    // Posición y número.
    await setMember(p[0], s.squadId, p[1], { position: '  Portero ', jersey: 1 });
    await fails(setMember(p[0], s.squadId, p[2], { jersey: 1 }), 'duplicado');
    await fails(setMember(p[0], s.squadId, p[2], { jersey: 100 }), INVALID);
    await fails(setMember(p[0], s.squadId, p[2], { position: 'x'.repeat(21) }), INVALID);
    await fails(setMember(p[0], s.squadId, p[2], { role: 'jefe' }), INVALID);
    await fails(setMember(p[1], s.squadId, p[2], { jersey: 9 }), DENIED);
    await fails(setMember(p[0], s.squadId, p[3], { jersey: 9 }), 'no_existe');
    await setMember(p[0], s.squadId, p[2], { position: 'Defensa', jersey: 4 });
    // Pasar la capitanía: su posición y número se quedan; el anterior queda de miembro.
    await setMember(p[0], s.squadId, p[1], { role: 'captain' });
    const byUser = (rows: Json[]) => Object.fromEntries(rows.map((r) => [r.user_id, r]));
    expect(byUser(await roles(s.squadId))).toEqual({
      [p[0]]: { user_id: p[0], role: 'member', position: null, jersey: null },
      [p[1]]: { user_id: p[1], role: 'captain', position: 'Portero', jersey: 1 },
      [p[2]]: { user_id: p[2], role: 'member', position: 'Defensa', jersey: 4 },
    });
    expect((await row(s.squadId)).captain_id).toBe(p[1]);
    await fails(db.rpc(p[0], 'squad_code', { p_squad: s.squadId }), DENIED);
    expect(await db.rpc(p[1], 'squad_code', { p_squad: s.squadId })).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    // Bajarse a sí mismo sin pasarla: no. Editar sin rol: null quita la posición y el número.
    await fails(setMember(p[1], s.squadId, p[1], { role: 'member' }), INVALID);
    await setMember(p[1], s.squadId, p[2], {});
    expect(byUser(await roles(s.squadId))[p[2]]).toMatchObject({ position: null, jersey: null });
    // Sacar y salir.
    await db.rpc(p[1], 'remove_squad_member', { p_squad: s.squadId, p_user: p[2] });
    await fails(db.rpc(p[1], 'remove_squad_member', { p_squad: s.squadId, p_user: p[2] }), 'no_existe');
    await db.rpc(p[0], 'leave_squad', { p_squad: s.squadId });
    expect((await row(s.squadId)).member_count).toBe(1);
    await fails(db.rpc(p[0], 'leave_squad', { p_squad: s.squadId }), 'no_existe');
    await db.rpc(p[1], 'leave_squad', { p_squad: s.squadId });
    expect(await db.count('public.squads', 'id = $1', [s.squadId])).toBe(0);
    expect(await db.count('public.squad_secrets', 'squad_id = $1', [s.squadId])).toBe(0);
  });

  it('borrar la cuenta: la capitanía pasa al más antiguo; sin miembros el equipo se borra (y su logo va a la cola); se van sus seguidas', async () => {
    const a = await squadWith(p[0], [p[1], p[2]], 'Herencia');
    await db.admin(`update public.squad_members set joined_at = now() - interval '1 day' where squad_id = $1 and user_id = $2`, [a.squadId, p[1]]);
    await db.admin(`update public.squad_members set joined_at = now() - interval '2 days' where squad_id = $1 and user_id = $2`, [a.squadId, p[2]]);
    await db.rpc(p[4], 'follow_squad', { p_squad: a.squadId });
    expect((await row(a.squadId)).follower_count).toBe(1);
    await db.admin('delete from auth.users where id = any ($1)', [[p[0], p[4]]]);
    expect(await row(a.squadId)).toMatchObject({ captain_id: p[2], member_count: 2, follower_count: 0 });
    expect(await db.admin(`select user_id from public.squad_members where squad_id = $1 and role = 'captain'`, [a.squadId])).toEqual([{ user_id: p[2] }]);
    // Solo: el equipo se va con la cuenta (y el logo a la cola de Storage).
    const b = await mkSquad(p[3], 'Solitario');
    const logo = `${b.squadId}/${uuid()}.webp`;
    await db.admin('update public.squads set logo_path = $2 where id = $1', [b.squadId, logo]);
    await db.admin('delete from auth.users where id = $1', [p[3]]);
    expect(await db.count('public.squads', 'id = $1', [b.squadId])).toBe(0);
    expect(await db.admin(`select bucket from private.storage_purge_queue where path = $1`, [logo])).toEqual([{ bucket: 'logos' }]);
  });

  it('el logo: lo reserva y lo pone el capitán; el anterior va a la cola; las políticas de Storage; purge_queue_take no toma uno en uso', async () => {
    const s = await squadWith(p[0], [p[1]], 'Con Logo');
    const path1 = `${s.squadId}/${uuid()}.webp`;
    const path2 = `${s.squadId}/${uuid()}.png`;
    const canUpload = async (who: string, path: string) => (await db.as<{ ok: boolean }>(who, 'select private.can_upload_logo_path($1) as ok', [path]))[0].ok;
    const canRemove = async (who: string, path: string) => (await db.as<{ ok: boolean }>(who, 'select private.can_remove_logo_path($1) as ok', [path]))[0].ok;
    expect(await canUpload(p[0], path1)).toBe(false);
    await db.rpc(p[0], 'begin_squad_logo', { p_squad: s.squadId, p_path: path1 });
    expect(await canUpload(p[0], path1)).toBe(true);
    expect(await canUpload(p[1], path1)).toBe(false);
    await fails(db.rpc(p[1], 'begin_squad_logo', { p_squad: s.squadId, p_path: path2 }), DENIED);
    await fails(db.rpc(p[0], 'begin_squad_logo', { p_squad: s.squadId, p_path: `${uuid()}/${uuid()}.webp` }), INVALID);
    await fails(db.rpc(p[0], 'begin_squad_logo', { p_squad: s.squadId, p_path: path1 }), INVALID);
    // Sin reserva no se pone.
    await fails(db.rpc(p[0], 'set_squad_logo', { p_squad: s.squadId, p_path: path2 }), INVALID);
    expect(await db.rpc(p[0], 'set_squad_logo', { p_squad: s.squadId, p_path: path1 })).toBeNull();
    expect(await canUpload(p[0], path1)).toBe(false);
    expect(await canRemove(p[0], path1)).toBe(true);
    expect(await canRemove(p[1], path1)).toBe(false);
    expect((await page(ANON, s.squadId))!.logo).toBe(path1);
    await db.rpc(p[0], 'begin_squad_logo', { p_squad: s.squadId, p_path: path2 });
    expect(await db.rpc(p[0], 'set_squad_logo', { p_squad: s.squadId, p_path: path2 })).toBe(path1);
    expect(await db.admin(`select path from private.storage_purge_queue where bucket = 'logos'`)).toEqual([{ path: path1 }]);
    // Uno en uso que quedó en la cola no se toma (y sale de la cola).
    await db.admin(`insert into private.storage_purge_queue (path, bucket) values ($1, 'logos')`, [path2]);
    expect(await db.as(SERVICE, `select * from public.purge_queue_take(p_bucket => 'logos')`)).toEqual([{ path: path1 }]);
    expect(await db.count('private.storage_purge_queue', 'path = $1', [path2])).toBe(0);
    // Quitarlo: el de ahora va a la cola.
    expect(await db.rpc(p[0], 'set_squad_logo', { p_squad: s.squadId, p_path: null })).toBe(path2);
    expect(await db.count('private.storage_purge_queue', 'path = $1', [path2])).toBe(1);
    // Las ligas y los equipos de esports siguen igual.
    expect(await canUpload(w.u.org, `${w.priv}/${uuid()}.webp`)).toBe(false);
  });

  it('cambiar y borrar: claves permitidas, nombre repetido, recruiting; solo el capitán (o el superadmin); los equipos de liga se quedan', async () => {
    const s = await squadWith(p[0], [p[1]]);
    await mkSquad(p[2], 'Leones');
    await db.rpc(p[0], 'update_squad', {
      p_squad: s.squadId,
      p_patch: { name: ' Pumas ', tag: 'pum', description: 'Nuevo', city: 'Santiago', color: '#00AA00', recruiting: true },
    });
    expect(await row(s.squadId)).toMatchObject({ name: 'Pumas', tag: 'PUM', description: 'Nuevo', city: 'Santiago', color: '#00aa00', recruiting: true });
    await db.rpc(p[0], 'update_squad', { p_squad: s.squadId, p_patch: { city: null, color: null } });
    expect(await row(s.squadId)).toMatchObject({ city: null, color: null, recruiting: true });
    await fails(db.rpc(p[0], 'update_squad', { p_squad: s.squadId, p_patch: { sport: 'basketball' } }), INVALID);
    await fails(db.rpc(p[0], 'update_squad', { p_squad: s.squadId, p_patch: { recruiting: 'si' } }), INVALID);
    await fails(db.rpc(p[0], 'update_squad', { p_squad: s.squadId, p_patch: { name: 'leónes' } }), 'duplicado');
    await fails(db.rpc(p[1], 'update_squad', { p_squad: s.squadId, p_patch: { name: 'Mío' } }), DENIED);
    await db.rpc(w.u.dios, 'update_squad', { p_squad: s.squadId, p_patch: { description: 'Moderado' } });
    // Borrar: el equipo de liga que salió de él se queda (sin squad_id); su muro se va.
    const lid = await futbol();
    const req = await request(p[0], s.squadId, lid);
    const res = await decide(w.u.org, req, true);
    await db.rpc(p[1], 'create_post', { p_id: uuid(), p_text: 'Hola equipo', p_squad: s.squadId });
    await fails(db.rpc(p[1], 'delete_squad', { p_squad: s.squadId }), DENIED);
    await db.rpc(p[0], 'delete_squad', { p_squad: s.squadId });
    expect(await db.count('public.squads', 'id = $1', [s.squadId])).toBe(0);
    expect(await db.admin('select name, squad_id from public.teams where id = $1', [res.teamId])).toEqual([{ name: 'Pumas', squad_id: null }]);
    expect(await db.count('public.posts', 'squad_id = $1', [s.squadId])).toBe(0);
    expect(await db.count('public.squad_league_requests', 'squad_id = $1', [s.squadId])).toBe(0);
    await fails(db.rpc(p[0], 'delete_squad', { p_squad: s.squadId }), 'no_existe');
  });

  it('seguir: cualquier cuenta menos los miembros; contadores; los que sigo; dejar de seguir', async () => {
    const s = await squadWith(p[0], [p[1]]);
    expect(await db.rpc(w.u.extra, 'follow_squad', { p_squad: s.squadId })).toEqual({ following: true, followers: 1 });
    expect(await db.rpc(w.u.extra, 'follow_squad', { p_squad: s.squadId })).toEqual({ following: true, followers: 1 });
    expect(await db.rpc(w.u.otra, 'follow_squad', { p_squad: s.squadId })).toEqual({ following: true, followers: 2 });
    await fails(db.rpc(p[1], 'follow_squad', { p_squad: s.squadId }), DENIED);
    await fails(db.rpc(w.u.extra, 'follow_squad', { p_squad: uuid() }), 'no_existe');
    expect(await db.rpc(w.u.extra, 'followed_squads', {})).toEqual([
      { id: s.squadId, sport: 'football', name: 'Tigres', tag: 'TST', logo: null, color: null, city: null, recruiting: false, members: 2, followers: 2 },
    ]);
    expect((await page(w.u.extra, s.squadId))!.isFollowing).toBe(true);
    expect(await db.rpc(w.u.extra, 'unfollow_squad', { p_squad: s.squadId })).toEqual({ following: false, followers: 1 });
    expect(await db.rpc(w.u.extra, 'unfollow_squad', { p_squad: s.squadId })).toEqual({ following: false, followers: 1 });
    expect(await db.rpc(w.u.extra, 'followed_squads', {})).toEqual([]);
  });

  it('buscar: cada palabra en cualquier orden, sin acentos, por nombre, tag o ciudad; por deporte; los míos primero', async () => {
    const a = await mkSquad(p[0], 'Tigres del Este', { tag: 'TDE', city: 'San Pedro' });
    const b = await mkSquad(p[1], 'Águilas', { sport: 'basketball', tag: 'AGU', city: 'Santiago' });
    const c = await mkSquad(p[2], 'Este Unido', { tag: 'EUN' });
    const ids = (list: Json[]) => list.map((x) => x.id);
    const search = (who: string, q: string, sport: string | null = null) => db.rpc<Json[]>(who, 'search_squads', { p_query: q, p_sport: sport });
    expect(ids(await search(w.u.extra, 'este tigres'))).toEqual([a.squadId]);
    expect(ids(await search(w.u.extra, 'AGUILAS'))).toEqual([b.squadId]);
    expect(ids(await search(w.u.extra, 'aguilas', 'football'))).toEqual([]);
    expect(ids(await search(w.u.extra, 'santiago'))).toEqual([b.squadId]);
    expect(ids(await search(w.u.extra, 'tde'))).toEqual([a.squadId]);
    expect(await search(w.u.extra, 'a')).toEqual([]);
    // «este»: los dos; quien es de «Este Unido» lo ve primero; los demás, primero el que empieza así.
    expect(ids(await search(w.u.extra, 'este'))).toEqual([c.squadId, a.squadId]);
    expect(ids(await search(p[0], 'este'))).toEqual([a.squadId, c.squadId]);
  });

  it('la página: sin cuenta (sin plantilla), un miembro (con la plantilla) y mis equipos', async () => {
    const s = await squadWith(p[0], [p[1]], 'Tigres', { description: 'Del barrio', city: 'Santiago', color: '#112233' });
    await setMember(p[0], s.squadId, p[1], { position: 'Portero', jersey: 1 });
    const lite = {
      id: s.squadId, sport: 'football', name: 'Tigres', tag: 'TST', logo: null, color: '#112233', city: 'Santiago', recruiting: false,
      members: 2, followers: 0,
    };
    expect(await page(ANON, s.squadId)).toEqual({
      ...lite,
      description: 'Del barrio',
      captainId: p[0],
      isMember: false,
      myRole: null,
      isFollowing: false,
      createdAt: expect.stringMatching(ISO),
      roster: [],
      leagues: [],
      record: ZERO,
      // 20261012000100_perfiles_equipos_esports.sql.
      posts: 0,
      likes: 0,
    });
    const usernames = Object.fromEntries(
      (await db.admin<{ id: string; username: string }>('select id, username from public.profiles where id = any ($1)', [[p[0], p[1]]])).map((r) => [
        r.id,
        r.username,
      ]),
    );
    const mine = await page(p[1], s.squadId);
    expect(mine).toMatchObject({ isMember: true, myRole: 'member', isFollowing: false });
    expect(mine!.roster).toEqual([
      { id: p[0], name: 'Jugador 1', username: usernames[p[0]], avatar: null, role: 'captain', position: null, jersey: null, isMe: false },
      { id: p[1], name: 'Jugador 2', username: usernames[p[1]], avatar: null, role: 'member', position: 'Portero', jersey: 1, isMe: true },
    ]);
    expect((await page(w.u.extra, s.squadId))!.roster).toHaveLength(2);
    expect(await page(ANON, uuid())).toBeNull();
    // Mis equipos: de los que soy capitán primero.
    const other = await mkSquad(p[1], 'Bravos');
    expect(await db.rpc(p[1], 'my_squads', {})).toEqual([
      { id: other.squadId, sport: 'football', name: 'Bravos', tag: 'TST', logo: null, color: null, city: null, recruiting: false, members: 1, followers: 0, role: 'captain' },
      { ...lite, role: 'member' },
    ]);
    expect(await db.rpc(w.u.extra, 'my_squads', {})).toEqual([]);
  });
});

// =====================================================================

describe('el muro del equipo', () => {
  it('publicar: los miembros, siempre para todos, con el equipo en el Post; sale en Siguiendo a quien lo sigue o es miembro', async () => {
    const s = await squadWith(p[0], [p[1], p[2]]);
    await db.rpc(w.u.extra, 'follow_squad', { p_squad: s.squadId });
    const id = uuid();
    const post = await db.rpc<Json>(p[1], 'create_post', { p_id: id, p_text: 'Ganamos el domingo', p_squad: s.squadId });
    expect(post).toMatchObject({
      id,
      text: 'Ganamos el domingo',
      league: null,
      squad: { id: s.squadId, sport: 'football', name: 'Tigres', tag: 'TST', logo: null, color: null, city: null, recruiting: false, members: 3, followers: 1 },
      sport: 'football',
      visibility: 'public',
      isMine: true,
    });
    // Reintento: la misma.
    expect((await db.rpc<Json>(p[1], 'create_post', { p_id: id, p_text: 'Ganamos el domingo', p_squad: s.squadId })).id).toBe(id);
    await fails(db.rpc(p[3], 'create_post', { p_id: uuid(), p_text: 'Hola', p_squad: s.squadId }), DENIED);
    await fails(db.rpc(p[1], 'create_post', { p_id: uuid(), p_text: 'Hola', p_squad: s.squadId, p_visibility: 'followers' }), INVALID);
    await fails(db.rpc(w.u.otro, 'create_post', { p_id: uuid(), p_text: 'Hola', p_squad: s.squadId, p_league: w.pub }), INVALID);
    await fails(db.rpc(p[1], 'create_post', { p_id: uuid(), p_text: 'Hola', p_squad: uuid() }), 'no_existe');
    // Sin equipo, igual que antes (squad null).
    expect((await db.rpc<Json>(p[3], 'create_post', { p_id: uuid(), p_text: 'Solo' })).squad).toBeNull();
    const feedIds = async (who: string, scope = 'following') => (await db.rpc<Json[]>(who, 'social_feed', { p_scope: scope })).map((x) => x.id);
    expect(await feedIds(p[2])).toContain(id); // miembro
    expect(await feedIds(w.u.extra)).toContain(id); // seguidor
    expect(await feedIds(w.u.otra)).not.toContain(id); // nadie del equipo
    expect(await feedIds(w.u.otra, 'discover')).toContain(id);
    expect((await db.rpc<Json[]>(w.u.otra, 'squad_posts', { p_squad: s.squadId })).map((x) => x.id)).toEqual([id]);
    expect(await db.rpc(w.u.otra, 'post_detail', { p_post: id })).toMatchObject({ squad: { id: s.squadId } });
    // Sin cuenta (20261012000100_perfiles_equipos_esports.sql): lo público.
    expect((await db.rpc<Json[]>(ANON, 'squad_posts', { p_squad: s.squadId })).map((x) => x.id)).toEqual([id]);
  });

  it('bloqueos: quien bloqueó al autor (o fue bloqueado) no ve sus publicaciones del muro ni en el feed', async () => {
    const s = await squadWith(p[0], [p[1]]);
    await db.rpc(w.u.extra, 'follow_squad', { p_squad: s.squadId });
    await db.rpc(w.u.otra, 'follow_squad', { p_squad: s.squadId });
    const post = await db.rpc<Json>(p[1], 'create_post', { p_id: uuid(), p_text: 'Entreno a las 7', p_squad: s.squadId });
    await db.rpc(w.u.extra, 'block_user', { p_user: p[1] });
    await db.rpc(p[1], 'block_user', { p_user: w.u.otra });
    for (const who of [w.u.extra, w.u.otra]) {
      expect(await db.rpc(who, 'squad_posts', { p_squad: s.squadId })).toEqual([]);
      expect((await db.rpc<Json[]>(who, 'social_feed', {})).map((x) => x.id)).not.toContain(post.id);
    }
    expect((await db.rpc<Json[]>(p[0], 'squad_posts', { p_squad: s.squadId })).map((x) => x.id)).toEqual([post.id]);
  });
});

// =====================================================================

describe('el equipo en una liga', () => {
  it('pedir: el capitán, liga del mismo deporte de equipos, sin menores, pública o de la que es miembro; una pendiente; aviso a los admins', async () => {
    const lid = await futbol();
    await phone(w.u.org);
    await phone(w.u.sofi);
    const s = await squadWith(p[0], [p[1]]);
    await fails(request(p[1], s.squadId, lid), DENIED);
    await fails(request(p[0], s.squadId, w.pub), INVALID); // boliche
    const hoops = await futbol('Baloncesto', { sport: 'basketball' });
    await fails(request(p[0], s.squadId, hoops), INVALID);
    const priv = await futbol('Privada', { visibility: 'private' });
    await fails(request(p[0], s.squadId, priv), 'no_existe');
    const minors = await futbol('Infantil', { visibility: 'private', hasMinors: true });
    await member(db, minors, p[0], 'member', 'Jugador 1');
    await fails(request(p[0], s.squadId, minors), INVALID);
    // De una privada de la que es miembro, sí.
    await member(db, priv, p[0], 'member', 'Jugador 1');
    await request(p[0], s.squadId, priv);
    await fails(request(p[0], s.squadId, uuid()), 'no_existe');

    const req = await request(p[0], s.squadId, lid);
    const msg = { title: 'Tigres quiere entrar a Liga de Fútbol', body: 'Acéptalo o recházalo en la app.', url: `/l/${lid}/admin`, tag: `equipo:solicitud:${req}` };
    expect(await pushes(w.u.org)).toContainEqual(msg);
    expect(await pushes(w.u.sofi)).toContainEqual(msg);
    await fails(request(p[0], s.squadId, lid), 'duplicado');
    // Lo que ven los admins.
    expect(await db.rpc(w.u.sofi, 'league_squad_requests', { p_league: lid })).toEqual([
      {
        id: req,
        squad: { id: s.squadId, sport: 'football', name: 'Tigres', tag: 'TST', logo: null, color: null, city: null, recruiting: false, members: 2, followers: 0 },
        status: 'pending',
        note: null,
        createdAt: expect.stringMatching(ISO),
        requestedBy: { id: p[0], name: 'Jugador 1' },
      },
    ]);
    await fails(db.rpc(p[0], 'league_squad_requests', { p_league: lid }), DENIED);
    // En la página: los miembros ven la pendiente; los demás, solo las aprobadas.
    expect((await page(p[1], s.squadId))!.leagues).toContainEqual({
      leagueId: lid, name: 'Liga de Fútbol', sport: 'football', logo: null, status: 'pending', requestId: req, record: ZERO,
    });
    expect((await page(ANON, s.squadId))!.leagues).toEqual([]);
    // Retirar: el capitán, solo pendiente; después se puede pedir otra vez.
    await fails(db.rpc(p[1], 'withdraw_squad_request', { p_request: req }), DENIED);
    await db.rpc(p[0], 'withdraw_squad_request', { p_request: req });
    expect(await reqStatus(req)).toBe('withdrawn');
    await fails(db.rpc(p[0], 'withdraw_squad_request', { p_request: req }), 'cerrado');
    await fails(decide(w.u.org, req, true), 'cerrado');
    await request(p[0], s.squadId, lid);
  });

  it('aceptar: el equipo de temporada con nombre, color y plantilla (capitán captain); se salta quien ya está en otro equipo; aviso al capitán', async () => {
    const lid = await futbol();
    await phone(p[0]);
    const s = await squadWith(p[0], [p[1], p[2]], 'Tigres', { color: '#112233' });
    await setMember(p[0], s.squadId, p[1], { position: 'Delantero', jersey: 7 });
    // p2 ya juega en otro equipo de esta temporada de la liga.
    await member(db, lid, p[2], 'member', 'Jugador 3');
    const pl = await player(db, lid, 'Jugador 3', p[2]);
    await db.rpc(w.u.org, 'create_season_team', { p_league: lid, p_name: 'Otros', p_players: [{ player_id: pl }] });
    const req = await request(p[0], s.squadId, lid);
    await fails(decide(p[1], req, true), DENIED);
    await fails(decide(w.u.sofi, req, true, 'x'.repeat(201)), INVALID);
    const res = await decide(w.u.sofi, req, true, 'Bienvenidos');
    expect(res).toEqual({ teamId: expect.any(String), added: 2, skipped: 1 });
    expect(await db.admin('select league_id, event_id, name, color, squad_id, season_id from public.teams where id = $1', [res.teamId])).toEqual([
      { league_id: lid, event_id: null, name: 'Tigres', color: '#112233', squad_id: s.squadId, season_id: await activeSeason(lid) },
    ]);
    expect(await teamRoster(res.teamId)).toEqual(
      [
        { user_id: p[0], role: 'captain', jersey: null, position: null },
        { user_id: p[1], role: 'player', jersey: 7, position: 'Delantero' },
      ].sort((a, b) => (a.role < b.role ? -1 : 1)),
    );
    expect(await db.admin(`select user_id, role from public.league_members where league_id = $1 and user_id = any ($2) order by user_id`, [lid, [p[0], p[1]]])).toEqual(
      [p[0], p[1]].sort().map((u) => ({ user_id: u, role: 'member' })),
    );
    expect(await db.count('public.players', 'league_id = $1 and user_id = any ($2)', [lid, [p[0], p[1]]])).toBe(2);
    expect(await db.admin('select status, decided_by, note from public.squad_league_requests where id = $1', [req])).toEqual([
      { status: 'approved', decided_by: w.u.sofi, note: 'Bienvenidos' },
    ]);
    expect(await pushes(p[0])).toContainEqual({ title: 'Liga de Fútbol aceptó a Tigres', body: 'Bienvenidos', url: `/equipos/${s.squadId}`, tag: `equipo:liga:${req}` });
    await fails(decide(w.u.sofi, req, true), 'cerrado');
    await fails(request(p[0], s.squadId, lid), 'duplicado');
    // La página: la liga aprobada se ve también sin cuenta. Es miembro de la liga: lo ve en «mis ligas».
    expect((await page(ANON, s.squadId))!.leagues).toEqual([
      { leagueId: lid, name: 'Liga de Fútbol', sport: 'football', logo: null, status: 'approved', requestId: req, record: ZERO },
    ]);
    // La plantilla del equipo de la liga la puede ver cualquiera de la liga (es un equipo de temporada normal).
    expect(await db.asAnon('select squad_id from public.teams where id = $1', [res.teamId])).toEqual([{ squad_id: s.squadId }]);
  });

  it('rechazar no crea nada; sincronizar pasa a los nuevos (capitán o admin); la nueva capitanía; si la liga borra el equipo, se puede pedir otra vez', async () => {
    const lid = await futbol();
    await phone(p[0]);
    const s = await mkSquad(p[0], 'Tigres');
    const r1 = await request(p[0], s.squadId, lid);
    expect(await decide(w.u.sofi, r1, false, '  Cupo lleno  ')).toEqual({});
    expect(await db.admin('select status, note from public.squad_league_requests where id = $1', [r1])).toEqual([{ status: 'rejected', note: 'Cupo lleno' }]);
    expect(await pushes(p[0])).toContainEqual({ title: 'Liga de Fútbol rechazó a Tigres', body: 'Cupo lleno', url: `/equipos/${s.squadId}`, tag: `equipo:liga:${r1}` });
    expect(await db.count('public.teams', 'squad_id = $1', [s.squadId])).toBe(0);
    await fails(sync(p[0], s.squadId, lid), 'no_existe');

    const r2 = await request(p[0], s.squadId, lid);
    const res = await decide(w.u.org, r2, true);
    expect(res).toMatchObject({ added: 1, skipped: 0 });
    await db.rpc(p[3], 'join_squad', { p_code: s.inviteCode });
    await fails(sync(w.u.extra, s.squadId, lid), DENIED);
    await fails(sync(p[3], s.squadId, lid), DENIED);
    expect(await sync(p[0], s.squadId, lid)).toEqual({ added: 1, skipped: 0 });
    expect(await sync(w.u.sofi, s.squadId, lid)).toEqual({ added: 0, skipped: 0 });
    // La capitanía pasa a p3: en la plantilla de la liga también.
    await setMember(p[0], s.squadId, p[3], { role: 'captain' });
    await sync(p[3], s.squadId, lid);
    expect(await teamRoster(res.teamId)).toEqual([
      { user_id: p[3], role: 'captain', jersey: null, position: null },
      { user_id: p[0], role: 'player', jersey: null, position: null },
    ]);
    // La liga borra el equipo: la solicitud queda retirada y se puede pedir otra vez.
    await db.rpc(w.u.org, 'delete_season_team', { p_team: res.teamId });
    expect(await reqStatus(r2)).toBe('withdrawn');
    await fails(sync(p[3], s.squadId, lid), 'no_existe');
    await request(p[3], s.squadId, lid);
  });

  it('temporada nueva: copiar los equipos conserva squad_id; sin copiar, sincronizar crea el equipo de la temporada nueva', async () => {
    const lid = await futbol();
    const s = await squadWith(p[0], [p[1]]);
    const res = await decide(w.u.org, await request(p[0], s.squadId, lid), true);
    const year = Number((await db.admin<{ y: string }>(`select to_char(now(), 'YYYY') as y`))[0].y) + 1;
    await db.rpc(w.u.org, 'close_season', { p_season: await activeSeason(lid), p_standings: { rows: [] }, p_awards: [] });
    await db.rpc(w.u.org, 'start_season', { p_league: lid, p_name: `Temporada ${year}`, p_starts_on: `${year}-01-01`, p_copy_teams: true });
    const season2 = await activeSeason(lid);
    const copies = await db.admin<{ id: string }>('select id from public.teams where squad_id = $1 and season_id = $2', [s.squadId, season2]);
    expect(copies).toHaveLength(1);
    expect(copies[0].id).not.toBe(res.teamId);
    expect(await teamRoster(copies[0].id)).toHaveLength(2);
    // Sincronizar usa la copia (nada nuevo).
    expect(await sync(p[0], s.squadId, lid)).toEqual({ added: 0, skipped: 0 });

    // Otra liga sin copiar: sincronizar crea el equipo de la temporada nueva con la plantilla.
    const lid2 = await futbol('Liga B');
    await decide(w.u.org, await request(p[0], s.squadId, lid2), true);
    await db.rpc(w.u.org, 'close_season', { p_season: await activeSeason(lid2), p_standings: { rows: [] }, p_awards: [] });
    await db.rpc(w.u.org, 'start_season', { p_league: lid2, p_name: `Temporada ${year}`, p_starts_on: `${year}-01-01` });
    expect(await sync(p[0], s.squadId, lid2)).toEqual({ added: 2, skipped: 0 });
    expect(await db.count('public.teams', 'league_id = $1 and squad_id = $2', [lid2, s.squadId])).toBe(2);
    expect(await db.count('public.teams', 'league_id = $1 and squad_id = $2 and season_id = $3', [lid2, s.squadId, await activeSeason(lid2)])).toBe(1);
  });

  it('récord: partidos terminados o confirmados (y W.O.) de sus equipos de liga, por liga y en total', async () => {
    const lid = await futbol();
    const s = await mkSquad(p[0], 'Tigres');
    const res = await decide(w.u.org, await request(p[0], s.squadId, lid), true);
    const rival = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: lid, p_name: 'Leones' });
    const T = { team: res.teamId as string, label: 'Tigres' };
    const L = { team: rival, label: 'Leones' };
    await match(lid, T, L, { status: 'confirmed', winner: 1 }); // ganado
    await match(lid, L, T, { status: 'confirmed', winner: 1 }); // perdido
    await match(lid, T, L, { status: 'finished' }); // empate (propuesto)
    await match(lid, L, T, { status: 'walkover', walkover: 2, winner: 1 }); // W.O. en contra
    await match(lid, T, L, { status: 'walkover', walkover: 0 }); // W.O. doble: no cuenta
    await match(lid, T, L, { status: 'scheduled' });
    await match(lid, T, L, { status: 'void' });
    await match(lid, T, L, { status: 'disputed', winner: 1 });
    const record = { played: 4, won: 1, drawn: 1, lost: 2 };
    const pg = await page(ANON, s.squadId);
    expect(pg!.record).toEqual(record);
    expect(pg!.leagues[0].record).toEqual(record);
    // Otra liga: suma en el total, no en la de la primera.
    const lid2 = await futbol('Liga B');
    const res2 = await decide(w.u.org, await request(p[0], s.squadId, lid2), true);
    const rival2 = await db.rpc<string>(w.u.org, 'create_season_team', { p_league: lid2, p_name: 'Toros' });
    await match(lid2, { team: rival2, label: 'Toros' }, { team: res2.teamId, label: 'Tigres' }, { status: 'confirmed', winner: 2 });
    const pg2 = await page(p[0], s.squadId);
    expect(pg2!.record).toEqual({ played: 5, won: 2, drawn: 1, lost: 2 });
    expect(pg2!.leagues.find((l: Json) => l.leagueId === lid).record).toEqual(record);
    expect(pg2!.leagues.find((l: Json) => l.leagueId === lid2).record).toEqual({ played: 1, won: 1, drawn: 0, lost: 0 });
  });
});

// =====================================================================

describe('transmisiones en vivo', () => {
  /** Liga de fútbol pública con las transmisiones activadas: org dueño, sofi admin, ana anotadora, luis miembro. */
  async function liveLeague(name = 'Liga de Fútbol') {
    const lid = await futbol(name);
    await member(db, lid, w.u.ana, 'member', 'ana', true);
    await member(db, lid, w.u.luis, 'member', 'luis');
    await db.rpc(w.u.org, 'set_league_live', { p_league: lid, p_enabled: true });
    return lid;
  }
  const start = (who: string, lid: string, o: Json = {}) =>
    db.rpc<Json>(who, 'start_stream', {
      p_league: lid,
      p_url: o.url ?? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      p_title: o.title ?? null,
      p_match: o.match ?? null,
      p_event: o.event ?? null,
    });
  const streams = (who: string, lid: string) => db.rpc<Json[]>(who, 'league_streams', { p_league: lid });
  const liveNow = (who: string) => db.rpc<Json[]>(who, 'live_now', {});
  const resetStreamLimits = (lid: string) => db.admin(`delete from private.rate_limits where key in ($1, $2)`, [`stream:${lid}`, `envivo:${lid}`]);

  it('private.stream_platform: https de las seis plataformas, sin usuario ni puerto; nada más', async () => {
    const cases: [string, string | null][] = [
      ['https://www.youtube.com/watch?v=abc', 'youtube'],
      ['https://youtube.com/live/abc', 'youtube'],
      ['https://m.youtube.com/watch?v=abc', 'youtube'],
      ['https://youtu.be/abc', 'youtube'],
      ['HTTPS://WWW.YOUTUBE.COM/watch?v=abc', 'youtube'],
      ['https://www.twitch.tv/canal', 'twitch'],
      ['https://twitch.tv/canal', 'twitch'],
      ['https://m.twitch.tv/canal', 'twitch'],
      ['https://www.facebook.com/liga/videos/1', 'facebook'],
      ['https://m.facebook.com/liga', 'facebook'],
      ['https://fb.watch/abc', 'facebook'],
      ['https://kick.com/canal', 'kick'],
      ['https://www.kick.com/canal', 'kick'],
      ['https://www.instagram.com/liga/live', 'instagram'],
      ['https://instagram.com/liga', 'instagram'],
      ['https://www.tiktok.com/@liga/live', 'tiktok'],
      ['https://vm.tiktok.com/abc', 'tiktok'],
      ['https://tiktok.com', 'tiktok'],
      ['https://youtu.be?x=1', 'youtube'],
      ['http://www.youtube.com/watch?v=abc', null],
      ['www.youtube.com/watch?v=abc', null],
      ['https://www.youtube-nocookie.com/embed/abc', null],
      ['https://youtube.com.evil.com/x', null],
      ['https://evilyoutube.com/x', null],
      ['https://user:pass@youtube.com/x', null],
      ['https://youtube.com@evil.com/x', null],
      ['https://youtube.com:8080/x', null],
      ['https://youtube.com /x', null],
      ['https://youtube.com/x\ny', null],
      ['https://youtube.com\\@evil.com', null],
      ['https://studio.youtube.com/x', null],
      ['https://youtube.com/' + 'x'.repeat(281), null],
      ['javascript:alert(1)', null],
      ['', null],
    ];
    const rows = await db.admin<{ u: string; p: string | null }>(`select u, private.stream_platform(u) as p from unnest($1::text[]) u`, [cases.map((c) => c[0])]);
    expect(rows.map((r) => [r.u, r.p])).toEqual(cases);
    expect((await db.admin<{ p: string | null }>(`select private.stream_platform(null) as p`))[0].p).toBeNull();
  });

  it('set_league_live: solo los admins; apagarla termina las activas', async () => {
    const lid = await futbol();
    await member(db, lid, w.u.luis, 'member', 'luis');
    await fails(db.rpc(w.u.luis, 'set_league_live', { p_league: lid, p_enabled: true }), DENIED);
    await fails(db.rpc(w.u.sofi, 'set_league_live', { p_league: lid, p_enabled: null }), INVALID);
    await fails(db.rpc(w.u.sofi, 'set_league_live', { p_league: uuid(), p_enabled: true }), 'no_existe');
    await db.rpc(w.u.sofi, 'set_league_live', { p_league: lid, p_enabled: true });
    expect(await db.asAnon('select live_enabled from public.leagues where id = $1', [lid])).toEqual([{ live_enabled: true }]);
    await start(w.u.sofi, lid);
    expect(await streams(ANON, lid)).toHaveLength(1);
    await db.rpc(w.u.org, 'set_league_live', { p_league: lid, p_enabled: false });
    expect(await streams(ANON, lid)).toEqual([]);
    expect(await db.count('public.live_streams', 'league_id = $1 and ended_at is null', [lid])).toBe(0);
    await fails(start(w.u.sofi, lid), 'cerrado');
  });

  it('start_stream: admins y anotadores (en el boliche, solo admins), con la liga activada; el link, el título y el LiveStream', async () => {
    const lid = await futbol();
    await member(db, lid, w.u.ana, 'member', 'ana', true);
    await member(db, lid, w.u.luis, 'member', 'luis');
    await fails(start(w.u.org, lid), 'cerrado');
    await db.rpc(w.u.org, 'set_league_live', { p_league: lid, p_enabled: true });
    await fails(start(w.u.luis, lid), DENIED);
    await fails(start(w.u.extra, lid), DENIED);
    await fails(start(w.u.org, uuid()), 'no_existe');
    const s = await start(w.u.org, lid, { title: '  La   final ' });
    expect(s).toEqual({
      id: expect.any(String),
      leagueId: lid,
      leagueName: 'Liga de Fútbol',
      sport: 'football',
      matchId: null,
      eventId: null,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      platform: 'youtube',
      title: 'La final',
      label: null,
      startedAt: expect.stringMatching(ISO),
      startedBy: { id: w.u.org, name: 'org' },
      canEnd: true,
    });
    // La anotadora también.
    expect(await start(w.u.ana, lid, { url: 'https://www.twitch.tv/liga' })).toMatchObject({ platform: 'twitch', startedBy: { id: w.u.ana, name: 'ana' } });
    // Link, título y destino.
    await fails(start(w.u.org, lid, { url: 'http://www.youtube.com/watch?v=x' }), INVALID);
    await fails(start(w.u.org, lid, { url: 'https://example.com/live' }), INVALID);
    await fails(start(w.u.org, lid, { title: 'x'.repeat(81) }), INVALID);
    await fails(start(w.u.org, lid, { title: 'qué mierda' }), 'palabras');
    const ev = await event(db, lid, 'jornada', '2026-10-03', 1, 'Jornada 1');
    const m = await match(lid, { label: 'Tigres' }, { label: 'Leones' });
    await fails(start(w.u.org, lid, { match: m, event: ev }), INVALID);
    const otherLeague = await futbol('Otra');
    const mOther = await match(otherLeague, { label: 'A' }, { label: 'B' });
    await fails(start(w.u.org, lid, { match: mOther }), 'no_existe');
    await fails(start(w.u.org, lid, { event: w.e.e9 }), 'no_existe');
    expect(await start(w.u.org, lid, { match: m })).toMatchObject({ matchId: m, label: 'Tigres vs Leones', title: null });
    expect(await start(w.u.org, lid, { event: ev })).toMatchObject({ eventId: ev, label: 'Jornada 1' });
    // Boliche: el anotador del torneo no; los admins sí.
    const c = await withCopa(db, w);
    await db.rpc(w.u.org, 'set_league_live', { p_league: c.copa, p_enabled: true });
    await fails(start(w.u.luis, c.copa), DENIED);
    expect(await start(w.u.sofi, c.copa, { event: c.t1 })).toMatchObject({ sport: 'bowling', label: 'Copa' });
  });

  it('una activa por partido o evento, hasta 5 por liga, 20 por día; terminar libera; las de 12 horas se terminan solas', async () => {
    const lid = await liveLeague();
    const m = await match(lid, { label: 'Tigres' }, { label: 'Leones' });
    const ev = await event(db, lid, 'jornada', '2026-10-03', 1, '');
    const a = await start(w.u.org, lid, { match: m });
    await fails(start(w.u.sofi, lid, { match: m }), 'duplicado');
    const b = await start(w.u.org, lid, { event: ev });
    expect(b.label).toBe('Jornada del 3 de octubre');
    await fails(start(w.u.org, lid, { event: ev }), 'duplicado');
    // Terminar: quien la puede poner; libera el partido.
    await fails(db.rpc(w.u.luis, 'end_stream', { p_stream: a.id }), DENIED);
    await fails(db.rpc(w.u.org, 'end_stream', { p_stream: uuid() }), 'no_existe');
    await db.rpc(w.u.ana, 'end_stream', { p_stream: a.id });
    await db.rpc(w.u.ana, 'end_stream', { p_stream: a.id });
    const a2 = await start(w.u.org, lid, { match: m });
    // Cinco activas por liga.
    await start(w.u.org, lid);
    await start(w.u.org, lid);
    await start(w.u.org, lid);
    await fails(start(w.u.org, lid), 'limite');
    expect(await streams(w.u.luis, lid)).toHaveLength(5);
    // Una de hace 12 horas ya no está activa: se termina sola y deja lugar.
    await db.admin(`update public.live_streams set started_at = now() - interval '13 hours' where id = $1`, [a2.id]);
    expect(await streams(w.u.luis, lid)).toHaveLength(4);
    await start(w.u.org, lid, { match: m });
    expect(await db.admin('select ended_at is not null as ended from public.live_streams where id = $1', [a2.id])).toEqual([{ ended: true }]);
    // 20 por día por liga (las que fallan no cuentan).
    await fillLimit(`stream:${lid}`, 20);
    await db.rpc(w.u.org, 'end_stream', { p_stream: b.id });
    await fails(start(w.u.org, lid, { event: ev }), 'rate_limited');
  });

  it('league_streams: sin cuenta en una liga pública; privada, solo sus miembros; canEnd. live_now: mis ligas, las que sigo y las de los equipos que sigo', async () => {
    const lid = await liveLeague();
    const s1 = await start(w.u.org, lid, { title: 'Final' });
    expect(await streams(ANON, lid)).toEqual([expect.objectContaining({ id: s1.id, canEnd: false })]);
    expect(await streams(w.u.luis, lid)).toEqual([expect.objectContaining({ id: s1.id, canEnd: false })]);
    expect(await streams(w.u.ana, lid)).toEqual([expect.objectContaining({ id: s1.id, canEnd: true })]);
    expect(await streams(ANON, uuid())).toEqual([]);
    // Liga privada (boliche): nadie de fuera.
    await db.rpc(w.u.org, 'set_league_live', { p_league: w.priv, p_enabled: true });
    const s2 = await start(w.u.sofi, w.priv);
    expect(await streams(ANON, w.priv)).toEqual([]);
    expect(await streams(w.u.extra, w.priv)).toEqual([]);
    expect((await streams(w.u.luis, w.priv)).map((x) => x.id)).toEqual([s2.id]);
    expect((await streams(w.u.dios, w.priv)).map((x) => x.id)).toEqual([s2.id]);
    // En vivo ahora.
    const lid2 = await liveLeague('Liga B');
    const s3 = await start(w.u.org, lid2);
    const sq = await mkSquad(p[0], 'Tigres');
    await decide(w.u.org, await request(p[0], sq.squadId, lid2), true);
    const ids = async (who: string) => (await liveNow(who)).map((x) => x.id).sort();
    expect(await ids(w.u.luis)).toEqual([s1.id, s2.id, s3.id].sort()); // miembro de las tres
    expect(await ids(w.u.extra)).toEqual([]);
    await db.rpc(w.u.extra, 'follow_league', { p_league: lid });
    expect(await ids(w.u.extra)).toEqual([s1.id]);
    await db.rpc(w.u.extra, 'follow_squad', { p_squad: sq.squadId });
    expect(await ids(w.u.extra)).toEqual([s1.id, s3.id].sort());
    expect(await ids(p[0])).toEqual([s3.id]); // miembro de la liga por el equipo
    expect(await ids(w.u.otra)).toEqual([]);
    // La más nueva primero; las de hace 12 horas ya no.
    await db.admin(`update public.live_streams set started_at = now() - interval '13 hours' where id = $1`, [s1.id]);
    expect(await ids(w.u.extra)).toEqual([s3.id]);
    expect(await streams(ANON, lid)).toEqual([]);
  });

  it('aviso: a los miembros y seguidores sin quien la empezó, sin bloqueos; uno por liga cada 30 minutos; tiempo real', async () => {
    const sent = await captureRealtime();
    const lid = await liveLeague();
    // Seguidores: extra (con teléfono), otra (bloqueó a org) y nuevo (sin teléfono).
    for (const u of [w.u.extra, w.u.otra, w.u.nuevo]) await db.rpc(u, 'follow_league', { p_league: lid });
    await db.rpc(w.u.otra, 'block_user', { p_user: w.u.org });
    for (const u of [w.u.org, w.u.sofi, w.u.luis, w.u.ana, w.u.extra, w.u.otra]) await phone(u);
    const s = await start(w.u.org, lid, { title: 'Final' });
    const msg = { title: '🔴 En vivo: Final', body: 'Liga de Fútbol', url: `/l/${lid}/vivo`, tag: `envivo:${lid}` };
    for (const u of [w.u.sofi, w.u.luis, w.u.ana, w.u.extra]) expect(await pushes(u)).toEqual([msg]);
    expect(await pushes(w.u.org)).toEqual([]);
    expect(await pushes(w.u.otra)).toEqual([]);
    expect(await sent('streams')).toEqual([
      { topic: `league:${lid}`, payload: { op: 'live', enabled: true } },
      { topic: `league:${lid}`, payload: { op: 'insert', ids: [s.id] } },
    ]);
    // Otra en menos de 30 minutos: sin aviso.
    const m = await match(lid, { label: 'Tigres' }, { label: 'Leones' });
    const s2 = await start(w.u.sofi, lid, { match: m });
    expect(await pushes(w.u.luis)).toHaveLength(1);
    // Media hora después (y el anterior ya salió): otro aviso, con el partido; ahora también a org (no la empezó él).
    await db.admin(`update private.rate_limits set window_start = now() - interval '31 minutes' where key = $1`, [`envivo:${lid}`]);
    await db.admin(`update public.push_outbox set sent_at = now()`);
    await db.rpc(w.u.sofi, 'end_stream', { p_stream: s2.id });
    await start(w.u.sofi, lid, { match: m });
    expect(await pushes(w.u.luis)).toEqual([msg, { ...msg, title: '🔴 En vivo: Tigres vs Leones' }]);
    expect(await pushes(w.u.org)).toEqual([{ ...msg, title: '🔴 En vivo: Tigres vs Leones' }]);
    expect(await pushes(w.u.sofi)).toEqual([msg]);
    // La categoría: «Tus ligas» (apagada, no llega).
    expect(await db.admin(`select private.push_category('envivo:x') as a, private.push_category('equipo:x') as b`)).toEqual([{ a: 'liga', b: 'liga' }]);
    await db.rpc(w.u.extra, 'set_push_prefs', { p_prefs: { liga: false } });
    await db.admin(`update private.rate_limits set window_start = now() - interval '31 minutes' where key = $1`, [`envivo:${lid}`]);
    await db.admin(`update public.push_outbox set sent_at = now()`);
    await start(w.u.org, lid);
    expect(await pushes(w.u.extra)).toHaveLength(2);
    expect(await pushes(w.u.luis)).toHaveLength(3);
    // Terminar y apagar avisan en tiempo real.
    await db.rpc(w.u.org, 'end_stream', { p_stream: s.id });
    await db.rpc(w.u.org, 'set_league_live', { p_league: lid, p_enabled: false });
    const ops = (await sent('streams')).map((x) => x.payload.op);
    expect(ops.slice(-3)).toEqual(['end', 'end', 'live']);
    expect((await sent('streams')).at(-1)).toEqual({ topic: `league:${lid}`, payload: { op: 'live', enabled: false } });
    await resetStreamLimits(lid);
  });
});
