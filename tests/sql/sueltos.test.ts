/**
 * Juegos sueltos del boliche (20260929001000_sueltos_logos.sql): los juegos de una cuenta que no son de ninguna liga
 * ni torneo (save_solo_session, delete_solo_session, solo_sessions_of), lo que se ve de otras cuentas, los me gusta y
 * cómo entran en lo social (profile_games, following_games, public_profile, profile_stats, social_notices), la cola
 * sin conexión (p_op_id), el tiempo real y los datos de la cuenta. También: todos los deportes quedan abiertos.
 *
 * Mundo (fixture): liga privada del Banco (org dueño, sofi admin, luis y ana miembros; luis juega e1 con [150]) y
 * liga pública Abierta de otro. Cuentas sin liga: nuevo, otra y extra; dios es superadmin.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, SERVICE, TestDb, fails } from './harness';
import { makeWorld, type World } from './fixture';

let db: TestDb;
let w: World;
/** Hoy en RD ('YYYY-MM-DD'), el mismo «hoy» de la base. */
let today: string;

type Json = Record<string, any>;

const NEW_RPC = ['delete_solo_session', 'save_solo_session', 'solo_sessions_of'];

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
  today = (await db.admin<{ d: string }>(`select to_char((now() at time zone 'America/Santo_Domingo')::date, 'YYYY-MM-DD') as d`))[0].d;
});
afterEach(async () => {
  await db.rollback();
});

/** El día que es `n` días antes de hoy (negativo: después). */
const daysAgo = async (n: number) =>
  (await db.admin<{ d: string }>(`select to_char($1::date - $2::integer, 'YYYY-MM-DD') as d`, [today, n]))[0].d;

const save = (who: string, args: Record<string, unknown> = {}) =>
  db.rpc<string>(who, 'save_solo_session', { p_id: null, p_played_on: today, p_scores: [150], ...args });
const remove = (who: string, id: string) => db.rpc(who, 'delete_solo_session', { p_id: id });
const listOf = (who: string, user: string | null = null, extra: Record<string, unknown> = {}) =>
  db.rpc<Json[]>(who, 'solo_sessions_of', { p_user: user, ...extra });
const row = async (id: string) => (await db.admin<Json>('select * from public.solo_sessions where id = $1', [id]))[0];
const like = (who: string, id: string, liked = true) =>
  db.rpc<{ likes: number; liked: boolean }>(who, 'set_game_like', { p_kind: 'solo', p_id: id, p_liked: liked });
const games = (who: string, target: string, extra: Record<string, unknown> = {}) =>
  db.rpc<Json[]>(who, 'profile_games', { p_user: target, ...extra });
const soloGames = async (who: string, target: string, extra: Record<string, unknown> = {}) =>
  (await games(who, target, extra)).filter((g) => g.kind === 'solo');
const block = (id: string) => db.rpc(w.u.dios, 'admin_block_user', { p_user: id, p_reason: 'prueba' });

/** En la transacción de la prueba: un realtime.send falso que guarda lo que emit manda (como en Supabase). */
async function captureRealtime() {
  await db.admin('create schema if not exists realtime');
  await db.admin('create table realtime.sent (n serial, payload jsonb, event text, topic text, private boolean)');
  await db.admin(`create function realtime.send(payload jsonb, event text, topic text, private boolean default false) returns void
                  language sql as $$ insert into realtime.sent (payload, event, topic, private) values (payload, event, topic, private) $$`);
  return (event: string) =>
    db.admin<{ topic: string; payload: Json }>(`select topic, payload from realtime.sent where event = $1 order by n`, [event]);
}

describe('deportes', () => {
  it('todos quedan abiertos; el superadmin todavía los pone en beta o los cierra', async () => {
    expect(await db.admin(`select id from public.sport_status where status <> 'open'`)).toEqual([]);
    expect((await db.asAnon('select id from public.sport_status')).length).toBe(10);
    // Cualquier cuenta crea ligas de cualquier deporte.
    const r = await db.rpc<{ league_id: string }>(w.u.nuevo, 'create_league', { p_name: 'Pádel del barrio', p_sport: 'padel' });
    expect(await db.admin('select sport from public.leagues where id = $1', [r.league_id])).toEqual([{ sport: 'padel' }]);
    await db.rpc(w.u.dios, 'set_sport_status', { p_sport: 'padel', p_status: 'beta' });
    await fails(db.rpc(w.u.nuevo, 'create_league', { p_name: 'Otra de pádel', p_sport: 'padel' }), DENIED);
    await db.rpc(w.u.dios, 'set_sport_status', { p_sport: 'golf', p_status: 'closed' });
    await fails(db.rpc(w.u.dios, 'create_league', { p_name: 'Golf', p_sport: 'golf' }), 'cerrado');
  });
});

describe('permisos', () => {
  it('las RPC nuevas: solo con sesión, security definer, search_path vacío y pasan por require_uid', async () => {
    const rows = await db.admin<Json>(
      `select p.proname as fn, p.prosecdef as definer, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth, p.prosrc like '%private.require_uid()%' as uid,
              'search_path=""' = any (p.proconfig) as path
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1) order by 1`,
      [NEW_RPC],
    );
    expect(rows).toEqual(NEW_RPC.map((fn) => ({ fn, definer: true, anon: false, auth: true, uid: true, path: true })));
    await fails(db.rpc(ANON, 'save_solo_session', { p_id: null, p_played_on: today, p_scores: [150] }), '42501');
    await fails(db.rpc(ANON, 'solo_sessions_of', {}), '42501');
    await fails(db.rpc(ANON, 'delete_solo_session', { p_id: randomUUID() }), '42501');
    // La ayuda del tiempo real no la ejecuta la app.
    expect(await db.admin(`select has_function_privilege('authenticated', 'private.emit_solo_sessions()', 'execute') as x`)).toEqual([{ x: false }]);
  });

  it('las tablas tienen RLS: cada cuenta lee lo suyo (el superadmin todo) y nadie escribe directo', async () => {
    const id = await save(w.u.luis, { p_scores: [190] });
    await save(w.u.ana, { p_scores: [120] });
    await like(w.u.ana, id);
    expect((await db.asUser(w.u.luis, 'select user_id from public.solo_sessions')).map((r) => r.user_id)).toEqual([w.u.luis]);
    expect(await db.asUser(w.u.extra, 'select id from public.solo_sessions')).toEqual([]);
    expect(await db.asUser(w.u.dios, 'select id from public.solo_sessions')).toHaveLength(2);
    await fails(db.asAnon('select id from public.solo_sessions'), '42501');
    await fails(db.asAnon('select session_id from public.solo_likes'), '42501');
    // Me gusta: quien lo dio y el dueño del juego.
    expect(await db.asUser(w.u.ana, 'select session_id from public.solo_likes')).toEqual([{ session_id: id }]);
    expect(await db.asUser(w.u.luis, 'select user_id from public.solo_likes')).toEqual([{ user_id: w.u.ana }]);
    expect(await db.asUser(w.u.extra, 'select user_id from public.solo_likes')).toEqual([]);
    for (const who of [w.u.luis, w.u.dios]) {
      await fails(
        db.as(who, `insert into public.solo_sessions (user_id, played_on, scores) values ($1, current_date, '{100}')`, [who]),
        '42501',
      );
      await fails(db.as(who, `update public.solo_sessions set note = 'x'`), '42501');
      await fails(db.as(who, 'delete from public.solo_sessions'), '42501');
      await fails(db.as(who, 'insert into public.solo_likes (session_id, user_id) values ($1, $2)', [id, who]), '42501');
    }
    // Ni con service_role se guardan pinos fuera de 0–300, juegos de más o huecos.
    for (const scores of [[301], [-1], [], Array(11).fill(100), [150, null]]) {
      await fails(db.asService('update public.solo_sessions set scores = $1 where id = $2', [scores, id]), '23514');
    }
  });

  it('cuenta bloqueada: no guarda, no borra y no da me gusta', async () => {
    const id = await save(w.u.luis);
    const anas = await save(w.u.ana);
    await block(w.u.luis);
    await fails(save(w.u.luis), 'bloqueada');
    await fails(remove(w.u.luis, id), 'bloqueada');
    await fails(like(w.u.luis, anas), 'bloqueada');
    await fails(listOf(w.u.luis), 'bloqueada');
  });
});

describe('guardar', () => {
  it('con el id del teléfono: recorta la bolera y la nota y guarda los cuadros', async () => {
    const id = randomUUID();
    const frames = { '1': { rolls: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10] } };
    expect(
      await save(w.u.luis, { p_id: id, p_scores: [190, 300], p_frames: frames, p_venue: '  Bolera Sur  ', p_note: ' Buen día ', p_played_on: await daysAgo(3) }),
    ).toBe(id);
    const r = await row(id);
    expect(r).toMatchObject({ user_id: w.u.luis, sport: 'bowling', venue: 'Bolera Sur', note: 'Buen día', scores: [190, 300], frames, shared: true });
    expect(await db.admin(`select to_char(played_on, 'YYYY-MM-DD') as d from public.solo_sessions where id = $1`, [id])).toEqual([
      { d: await daysAgo(3) },
    ]);
    // Sin id: uno nuevo. Cuadros vacíos = sin cuadros.
    const other = await save(w.u.luis, { p_frames: {}, p_shared: false });
    expect(other).not.toBe(id);
    expect(await row(other)).toMatchObject({ frames: null, shared: false, venue: '', note: '', scores: [150] });
  });

  it('cambiar el mío lo reemplaza todo; el de otra cuenta no (ni el superadmin)', async () => {
    const id = await save(w.u.luis, { p_scores: [190, 210], p_venue: 'Sur', p_frames: { '0': { rolls: [] } } });
    const before = await row(id);
    expect(await save(w.u.luis, { p_id: id, p_scores: [100], p_shared: false, p_note: 'corregido' })).toBe(id);
    expect(await row(id)).toMatchObject({ scores: [100], venue: '', note: 'corregido', frames: null, shared: false, created_at: before.created_at });
    for (const who of [w.u.ana, w.u.dios]) await fails(save(who, { p_id: id, p_scores: [300] }), DENIED);
    expect((await row(id)).scores).toEqual([100]);
  });

  it('lo que no sirve: invalido', async () => {
    const bad: Record<string, unknown>[] = [
      { p_played_on: null },
      { p_played_on: await daysAgo(-2) },
      { p_played_on: (await db.admin<{ d: string }>(`select to_char(($1::date - interval '10 years')::date - 1, 'YYYY-MM-DD') as d`, [today]))[0].d },
      { p_scores: null },
      { p_scores: [] },
      { p_scores: Array(11).fill(100) },
      { p_scores: [301] },
      { p_scores: [-1] },
      { p_scores: [150, null] },
      { p_scores: ['150'] },
      { p_scores: [150.5] },
      { p_scores: { a: 1 } },
      { p_venue: 'x'.repeat(81) },
      { p_note: 'x'.repeat(301) },
      { p_frames: [] },
      { p_frames: 'cuadros' },
      { p_frames: { '1': { rolls: [] } } },
      { p_frames: { a: { rolls: [] } } },
      { p_frames: { '10': { rolls: [] } } },
      { p_frames: { '0': 5 } },
    ];
    for (const args of bad) await fails(save(w.u.luis, args), INVALID);
    expect(await db.count('public.solo_sessions')).toBe(0);
    // Los bordes sí: mañana, hace 10 años justos, 10 juegos, bolera de 80 y nota de 300.
    const tenYears = (await db.admin<{ d: string }>(`select to_char(($1::date - interval '10 years')::date, 'YYYY-MM-DD') as d`, [today]))[0].d;
    await save(w.u.luis, { p_played_on: await daysAgo(-1) });
    await save(w.u.luis, { p_played_on: tenYears, p_scores: Array(10).fill(0), p_venue: 'x'.repeat(80), p_note: 'y'.repeat(300) });
    expect(await db.count('public.solo_sessions')).toBe(2);
  });

  it('p_op_id: reintentar devuelve el mismo id y no repite nada; el mismo op de otra cuenta: duplicado', async () => {
    const op = randomUUID();
    const id = await save(w.u.luis, { p_op_id: op, p_scores: [200] });
    // El reintento (aunque traiga otra cosa) no crea otro ni cambia el que hizo.
    expect(await save(w.u.luis, { p_op_id: op, p_scores: [250] })).toBe(id);
    expect(await db.count('public.solo_sessions', 'user_id = $1', [w.u.luis])).toBe(1);
    expect((await row(id)).scores).toEqual([200]);
    await fails(save(w.u.ana, { p_op_id: op }), 'duplicado');
    // Una operación nueva sí cambia el mismo juego.
    expect(await save(w.u.luis, { p_op_id: randomUUID(), p_id: id, p_scores: [250] })).toBe(id);
    expect((await row(id)).scores).toEqual([250]);
  });

  it('ritmo: 200 por día (crear o cambiar)', async () => {
    const id = await save(w.u.luis);
    expect(await db.admin('select hits from private.rate_limits where key = $1', [`solo:${w.u.luis}`])).toEqual([{ hits: 1 }]);
    await db.admin(`update private.rate_limits set hits = 200 where key = $1`, [`solo:${w.u.luis}`]);
    await fails(save(w.u.luis), 'rate_limited');
    await fails(save(w.u.luis, { p_id: id, p_scores: [120] }), 'rate_limited');
    // Otra cuenta no se ve afectada; al día siguiente vuelve a poder.
    await save(w.u.ana);
    await db.admin(`update private.rate_limits set window_start = now() - interval '25 hours' where key = $1`, [`solo:${w.u.luis}`]);
    await save(w.u.luis);
  });
});

describe('borrar', () => {
  it('el mío (con sus me gusta); el de otra cuenta no; el superadmin sí; el que no está: no_existe', async () => {
    const a = await save(w.u.luis);
    const b = await save(w.u.luis);
    await like(w.u.ana, a);
    await fails(remove(w.u.ana, a), DENIED);
    await remove(w.u.luis, a);
    expect(await db.count('public.solo_sessions', 'id = $1', [a])).toBe(0);
    expect(await db.count('public.solo_likes', 'session_id = $1', [a])).toBe(0);
    await fails(remove(w.u.luis, a), 'no_existe');
    await remove(w.u.dios, b);
    expect(await db.count('public.solo_sessions')).toBe(0);
  });

  it('un guardado viejo que llega después de borrarlo (la cola de otro teléfono) no lo revive', async () => {
    const id = await save(w.u.luis, { p_op_id: randomUUID() });
    await remove(w.u.luis, id);
    await fails(save(w.u.luis, { p_id: id, p_op_id: randomUUID(), p_scores: [200] }), 'no_existe');
    await fails(save(w.u.luis, { p_id: id }), 'no_existe');
    expect(await db.count('public.solo_sessions', 'id = $1', [id])).toBe(0);
    // Borrado por el superadmin: igual, también para otra cuenta con ese id.
    const b = await save(w.u.ana);
    await remove(w.u.dios, b);
    await fails(save(w.u.ana, { p_id: b }), 'no_existe');
    await fails(save(w.u.luis, { p_id: b }), 'no_existe');
    expect(await db.admin('select user_id from private.solo_deleted where id = $1', [b])).toEqual([{ user_id: w.u.ana }]);
    // Nadie lo lee por la API.
    await fails(db.as(w.u.ana, 'select id from private.solo_deleted'), '42501');
  });
});

describe('leer: solo_sessions_of', () => {
  it('los míos, todos, del más nuevo al más viejo, con páginas', async () => {
    const d1 = await daysAgo(1);
    const d5 = await daysAgo(5);
    const old = await save(w.u.luis, { p_played_on: d5, p_scores: [120, 130] });
    const hidden = await save(w.u.luis, { p_played_on: d1, p_shared: false, p_venue: 'Norte', p_note: 'Solo para mí' });
    const shared = await save(w.u.luis, { p_played_on: d1, p_scores: [200], p_frames: { '0': { rolls: [10] } } });
    await save(w.u.ana);
    const list = await listOf(w.u.luis);
    // Mismo día: por id, de mayor a menor.
    const sameDay = [hidden, shared].sort().reverse();
    expect(list.map((s) => s.id)).toEqual([...sameDay, old]);
    expect(list.find((s) => s.id === hidden)).toEqual({
      id: hidden,
      userId: w.u.luis,
      playedOn: d1,
      venue: 'Norte',
      note: 'Solo para mí',
      scores: [150],
      frames: null,
      shared: false,
      createdAt: expect.stringMatching(/Z$/),
      updatedAt: expect.stringMatching(/Z$/),
      likes: 0,
      likedByMe: false,
    });
    expect(list.find((s) => s.id === shared)).toMatchObject({ frames: { '0': { rolls: [10] } }, shared: true });
    // p_user = yo es lo mismo que null.
    expect((await listOf(w.u.luis, w.u.luis)).map((s) => s.id)).toEqual(list.map((s) => s.id));
    // Páginas.
    const first = await listOf(w.u.luis, null, { p_limit: 1 });
    expect(first.map((s) => s.id)).toEqual([sameDay[0]]);
    const next = await listOf(w.u.luis, null, { p_limit: 5, p_before: first[0].playedOn, p_before_id: first[0].id });
    expect(next.map((s) => s.id)).toEqual([sameDay[1], old]);
    expect((await listOf(w.u.luis, null, { p_before: d1 })).map((s) => s.id)).toEqual([old]);
    expect(await listOf(w.u.luis, null, { p_before: d5, p_before_id: old })).toEqual([]);
  });

  it('los de otra cuenta: solo los compartidos y si la ve', async () => {
    const shared = await save(w.u.luis, { p_scores: [210] });
    await save(w.u.luis, { p_shared: false });
    // ana comparte liga con luis; extra no, pero con sesión se ve cualquier cuenta sin bloquear.
    for (const who of [w.u.ana, w.u.extra, w.u.dios]) {
      expect((await listOf(who, w.u.luis)).map((s) => s.id)).toEqual([shared]);
    }
    await block(w.u.luis);
    expect(await listOf(w.u.extra, w.u.luis)).toEqual([]);
    expect((await listOf(w.u.ana, w.u.luis)).map((s) => s.id)).toEqual([shared]);
    expect(await listOf(w.u.ana, randomUUID())).toEqual([]);
  });
});

describe('social', () => {
  it('perfil e inicio: los compartidos salen como kind solo (sin liga), con la url solo para su dueño', async () => {
    const d1 = await daysAgo(1);
    const id = await save(w.u.luis, { p_played_on: d1, p_scores: [190, 210], p_venue: 'Bolera Sur' });
    const plain = await save(w.u.luis, { p_played_on: await daysAgo(2) });
    await save(w.u.luis, { p_played_on: d1, p_shared: false });
    const item = {
      key: `j:${id}`,
      kind: 'solo',
      id,
      playerId: null,
      userId: w.u.luis,
      userName: 'luis',
      leagueId: null,
      leagueName: null,
      sport: 'bowling',
      eventId: null,
      eventName: 'Juego suelto',
      eventType: null,
      eventDate: d1,
      // Mediodía en RD (UTC-4).
      at: `${d1}T16:00:00.000Z`,
      url: null,
      likes: 0,
      likedByMe: false,
      detail: { title: 'Juego suelto', venue: 'Bolera Sur', scores: [190, 210], series: 400, high: 210 },
    };
    const seen = await soloGames(w.u.extra, w.u.luis);
    expect(seen).toEqual([item, expect.objectContaining({ id: plain, detail: { title: 'Juego suelto', venue: null, scores: [150], series: 150, high: 150 } })]);
    expect((await soloGames(w.u.luis, w.u.luis))[0]).toEqual({ ...item, url: `/juegos-sueltos?juego=${id}` });
    // Por deporte: solo en el boliche.
    expect((await soloGames(w.u.extra, w.u.luis, { p_sport: 'bowling' })).map((g) => g.id)).toEqual([id, plain]);
    expect(await games(w.u.extra, w.u.luis, { p_sport: 'padel' })).toEqual([]);
    // Páginas con la clave del juego suelto.
    const [first] = await games(w.u.extra, w.u.luis, { p_limit: 1 });
    expect(first.id).toBe(id);
    expect((await games(w.u.extra, w.u.luis, { p_limit: 1, p_before: first.at, p_before_key: first.key })).map((g) => g.id)).toEqual([plain]);
    // Inicio: las cuentas que sigo.
    await db.rpc(w.u.extra, 'follow_user', { p_user: w.u.luis });
    const feed = await db.rpc<Json[]>(w.u.extra, 'following_games', {});
    expect(feed.filter((g) => g.kind === 'solo').map((g) => g.id)).toEqual([id, plain]);
    expect(feed.find((g) => g.id === id)).toEqual(item);
    expect(await db.rpc<Json[]>(w.u.extra, 'following_games', { p_sport: 'golf' })).toEqual([]);
    // Bloqueado: quien no comparte nada con luis ya no los ve; ana (misma liga) sí.
    await block(w.u.luis);
    expect(await soloGames(w.u.otra, w.u.luis)).toEqual([]);
    expect((await soloGames(w.u.ana, w.u.luis)).map((g) => g.id)).toEqual([id, plain]);
  });

  it('public_profile: cuentan en gamesCount, likesReceived y el boliche en sports', async () => {
    // extra no está en ninguna liga: solo sus juegos sueltos.
    expect(await db.rpc(w.u.ana, 'public_profile', { p_user: w.u.extra })).toMatchObject({ sports: [], gamesCount: 0, likesReceived: 0 });
    const a = await save(w.u.extra, { p_scores: [180] });
    await save(w.u.extra, { p_scores: [200], p_played_on: await daysAgo(1) });
    await save(w.u.extra, { p_shared: false });
    await like(w.u.ana, a);
    await like(w.u.extra, a);
    expect(await db.rpc(w.u.ana, 'public_profile', { p_user: w.u.extra })).toMatchObject({ sports: ['bowling'], gamesCount: 2, likesReceived: 2 });
    // luis: e1 del Banco (ana lo ve) y un juego suelto; el boliche una sola vez.
    await save(w.u.luis);
    expect(await db.rpc(w.u.ana, 'public_profile', { p_user: w.u.luis })).toMatchObject({ sports: ['bowling'], gamesCount: 2 });
    expect(await db.rpc(w.u.otra, 'public_profile', { p_user: w.u.luis })).toMatchObject({ sports: ['bowling'], gamesCount: 1 });
  });

  it('profile_stats: cada juego suelto compartido es una sesión más del boliche, con todos sus juegos', async () => {
    await save(w.u.extra, { p_scores: [150], p_played_on: await daysAgo(3) });
    await save(w.u.extra, { p_scores: [190, 210], p_played_on: await daysAgo(1) });
    await save(w.u.extra, { p_scores: [300], p_shared: false });
    expect(await db.rpc(w.u.ana, 'profile_stats', { p_user: w.u.extra })).toEqual({
      bowling: { sessions: 2, series: [[190, 210], [150]] },
      matches: [],
      golf: null,
      swim: null,
    });
    // Con los de la liga: los verificados de la liga y los sueltos, del más nuevo al más viejo.
    await db.admin(`update public.entries set scores = '{180}', photos = '{sin-foto}' where id = $1`, [w.e1Luis]);
    await save(w.u.luis, { p_scores: [120], p_played_on: await daysAgo(0) });
    expect((await db.rpc<Json>(w.u.ana, 'profile_stats', { p_user: w.u.luis })).bowling).toEqual({ sessions: 2, series: [[120], [180]] });
  });

  it('me gusta: en uno compartido que se ve; quitarlo siempre; se ve en las listas', async () => {
    const id = await save(w.u.luis, { p_scores: [200] });
    const hidden = await save(w.u.luis, { p_shared: false });
    expect(await like(w.u.ana, id)).toEqual({ likes: 1, liked: true });
    expect(await like(w.u.ana, id)).toEqual({ likes: 1, liked: true });
    expect(await like(w.u.extra, id)).toEqual({ likes: 2, liked: true });
    // El dueño también puede.
    expect(await like(w.u.luis, id)).toEqual({ likes: 3, liked: true });
    expect(await like(w.u.luis, id, false)).toEqual({ likes: 2, liked: false });
    expect((await soloGames(w.u.ana, w.u.luis))[0]).toMatchObject({ likes: 2, likedByMe: true });
    expect((await listOf(w.u.extra, w.u.luis))[0]).toMatchObject({ likes: 2, likedByMe: true });
    expect((await listOf(w.u.luis)).find((s) => s.id === id)).toMatchObject({ likes: 2, likedByMe: false });
    // Uno que no es compartido (tampoco el dueño) o que no existe.
    await fails(like(w.u.ana, hidden), DENIED);
    await fails(like(w.u.luis, hidden), DENIED);
    await fails(like(w.u.ana, randomUUID()), 'no_existe');
    // Si deja de ser compartido, quitar el me gusta todavía se puede, pero ya no dice cuántos tiene.
    await save(w.u.luis, { p_id: id, p_scores: [200], p_shared: false });
    expect(await like(w.u.extra, id, false)).toEqual({ likes: 0, liked: false });
    expect(await db.count('public.solo_likes', 'session_id = $1', [id])).toBe(1);
    expect(await like(w.u.extra, id, false)).toEqual({ likes: 0, liked: false });
    // Su dueño sí ve los de su juego.
    expect(await like(w.u.luis, id, false)).toEqual({ likes: 1, liked: false });
    // Dueño bloqueado: quien no comparte liga con él ya no le da me gusta (ni ve los números al quitarlo).
    await save(w.u.luis, { p_id: id, p_scores: [200] });
    await like(w.u.otra, id);
    await block(w.u.luis);
    await fails(like(w.u.otra, id), DENIED);
    expect(await like(w.u.otra, id, false)).toEqual({ likes: 0, liked: false });
    expect(await like(w.u.ana, id)).toEqual({ likes: 1, liked: true });
  });

  it('me gusta: ritmo de 300 cambios por hora, el mismo de los demás juegos', async () => {
    const id = await save(w.u.luis);
    await db.admin(`insert into private.rate_limits (key, window_start, hits) values ($1, now(), 300)`, [`like:u:${w.u.ana}`]);
    await fails(like(w.u.ana, id), 'rate_limited');
  });

  it('avisos de la campana: les gustó tu juego suelto (no los propios)', async () => {
    const id = await save(w.u.luis);
    await like(w.u.otra, id);
    await like(w.u.luis, id);
    const n = await db.rpc<Json[]>(w.u.luis, 'social_notices', {});
    expect(n).toEqual([
      {
        kind: 'like',
        at: expect.stringMatching(/Z$/),
        userId: w.u.otra,
        name: 'otra',
        gameKind: 'solo',
        id,
        playerId: null,
        leagueId: null,
        leagueName: null,
        sport: 'bowling',
        url: `/juegos-sueltos?juego=${id}`,
      },
    ]);
    expect(await db.rpc(w.u.otra, 'social_notices', {})).toEqual([]);
  });

  it('tiempo real: «solo» al dueño cuando cambia uno suyo y «like» cuando otro le da me gusta', async () => {
    const sent = await captureRealtime();
    const id = await save(w.u.luis);
    await save(w.u.luis, { p_id: id, p_scores: [180] });
    await like(w.u.ana, id);
    await like(w.u.luis, id);
    await like(w.u.ana, id, false);
    await remove(w.u.luis, id);
    expect(await sent('solo')).toEqual([
      { topic: `user:${w.u.luis}`, payload: { id, op: 'insert' } },
      { topic: `user:${w.u.luis}`, payload: { id, op: 'update' } },
      { topic: `user:${w.u.luis}`, payload: { id, op: 'delete' } },
    ]);
    // El propio me gusta no le avisa a nadie.
    expect(await sent('like')).toEqual([
      { topic: `user:${w.u.luis}`, payload: { op: 'insert', kind: 'solo', id } },
      { topic: `user:${w.u.luis}`, payload: { op: 'delete', kind: 'solo', id } },
    ]);
  });
});

describe('la cuenta', () => {
  it('mis datos traen mis juegos sueltos y los me gusta que di', async () => {
    const mine = await save(w.u.luis, { p_scores: [190], p_venue: 'Sur' });
    const anas = await save(w.u.ana);
    await like(w.u.luis, anas);
    const d = await db.rpc<Json>(w.u.luis, 'export_my_data');
    expect(d.tables.solo_sessions).toEqual([expect.objectContaining({ id: mine, user_id: w.u.luis, scores: [190], venue: 'Sur' })]);
    expect(d.tables.solo_likes).toEqual([expect.objectContaining({ session_id: anas, user_id: w.u.luis })]);
  });

  it('al borrar la cuenta se van sus juegos sueltos (también los ids de los borrados), sus me gusta y su límite', async () => {
    const mine = await save(w.u.luis);
    await remove(w.u.luis, await save(w.u.luis));
    const anas = await save(w.u.ana);
    await like(w.u.luis, anas);
    await like(w.u.ana, mine);
    await db.admin(`insert into private.rate_limits (key, window_start, hits) values ($1, now(), 1)`, [`logo:${w.u.luis}`]);
    expect(await db.count('private.rate_limits', `key like '%' || $1`, [w.u.luis])).toBeGreaterThanOrEqual(3);
    await db.admin('delete from auth.users where id = $1', [w.u.luis]);
    expect(await db.count('public.solo_sessions', 'user_id = $1', [w.u.luis])).toBe(0);
    expect(await db.count('private.solo_deleted')).toBe(0);
    expect(await db.count('public.solo_likes')).toBe(0);
    expect(await db.count('private.rate_limits', `key like '%' || $1`, [w.u.luis])).toBe(0);
    // Lo de ana sigue.
    expect(await db.count('public.solo_sessions', 'id = $1', [anas])).toBe(1);
    expect(await db.count('private.rate_limits', 'key = $1', [`solo:${w.u.ana}`])).toBe(1);
  });

  it('service_role (Edge Functions) lee todo, como en las demás tablas', async () => {
    await save(w.u.luis);
    expect(await db.as(SERVICE, 'select user_id from public.solo_sessions')).toEqual([{ user_id: w.u.luis }]);
  });
});
