/**
 * Mis bolas del boliche (20260930000100_bolas.sql): las bolas de una cuenta (save_ball, retire_ball, resurface_ball,
 * delete_ball, my_balls) y con cuál tiró cada juego (set_game_balls, my_ball_games) en un juego suelto, un evento de su
 * liga o un envío suyo. Solo las ve su dueño; la cola sin conexión (p_op_id), los límites, los borrados en cascada, los
 * datos de la cuenta y el bloqueo.
 *
 * Mundo (fixture): liga privada del Banco (org dueño, sofi admin, luis y ana miembros; luis juega e1 con [150], sin
 * foto) y liga pública Abierta de otro. Cuentas sin liga: nuevo, otra y extra; dios es superadmin.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { event, league, makeWorld, member, player, type World } from './fixture';

let db: TestDb;
let w: World;
/** Hoy en RD ('YYYY-MM-DD'), el mismo «hoy» de la base. */
let today: string;

type Json = Record<string, any>;

const NEW_RPC = ['delete_ball', 'my_ball_games', 'my_balls', 'resurface_ball', 'retire_ball', 'save_ball', 'set_game_balls'];
const STRIKES = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10];

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

const saveBall = (who: string, args: Record<string, unknown> = {}) =>
  db.rpc<string>(who, 'save_ball', { p_id: null, p_name: 'Phaze II', p_weight: 15, p_color: '#1d4ed8', ...args });
const ballRow = async (id: string) => (await db.admin<Json>('select * from public.bowling_balls where id = $1', [id]))[0];
const setBalls = (who: string, kind: string, ref: string, balls: Record<string, string | null> | null, extra: Record<string, unknown> = {}) =>
  db.rpc<number>(who, 'set_game_balls', { p_kind: kind, p_ref: ref, p_balls: balls, ...extra });
const tags = (ref: string) =>
  db.admin<{ game: number; ball_id: string }>(
    'select game, ball_id from public.ball_games where coalesce(solo_id, event_id, sub_id) = $1 order by game',
    [ref],
  );
const saveSolo = (who: string, scores: number[], args: Record<string, unknown> = {}) =>
  db.rpc<string>(who, 'save_solo_session', { p_id: null, p_played_on: today, p_scores: scores, ...args });
const myGames = (who: string, extra: Record<string, unknown> = {}) => db.rpc<Json[]>(who, 'my_ball_games', extra);
const block = (id: string) => db.rpc(w.u.dios, 'admin_block_user', { p_user: id, p_reason: 'prueba' });

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
    await fails(saveBall(ANON), '42501');
    await fails(db.rpc(ANON, 'my_balls'), '42501');
    await fails(db.rpc(ANON, 'my_ball_games'), '42501');
    await fails(setBalls(ANON, 'solo', randomUUID(), {}), '42501');
    // approve_submission se redefine (con p_start): sigue igual de cerrada.
    expect(
      await db.admin(
        `select p.prosecdef as definer, has_function_privilege('anon', p.oid, 'execute') as anon,
                has_function_privilege('authenticated', p.oid, 'execute') as auth, 'search_path=""' = any (p.proconfig) as path,
                pg_get_function_identity_arguments(p.oid) as args
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'approve_submission'`,
      ),
    ).toEqual([
      {
        definer: true,
        anon: false,
        auth: true,
        path: true,
        args: 'p_submission uuid, p_values jsonb, p_frames jsonb, p_event uuid, p_average double precision, p_games integer, p_start integer',
      },
    ]);
    // Las ayudas no las ejecuta la app.
    for (const fn of ['private.ball_dates_ok(date, date)', 'private.my_ball(uuid)', 'private.move_sub_balls(uuid, uuid, jsonb)']) {
      expect(await db.admin(`select has_function_privilege('authenticated', $1, 'execute') as x`, [fn])).toEqual([{ x: false }]);
    }
  });

  it('las tablas tienen RLS: cada cuenta lee solo lo suyo (también el superadmin) y nadie escribe directo', async () => {
    const mine = await saveBall(w.u.luis);
    await saveBall(w.u.ana, { p_name: 'Hammer' });
    await saveBall(w.u.dios, { p_name: 'La del jefe' });
    const solo = await saveSolo(w.u.luis, [190]);
    await setBalls(w.u.luis, 'solo', solo, { 0: mine });
    expect(await db.asUser(w.u.luis, 'select id from public.bowling_balls')).toEqual([{ id: mine }]);
    expect(await db.asUser(w.u.luis, 'select ball_id from public.ball_games')).toEqual([{ ball_id: mine }]);
    expect(await db.asUser(w.u.ana, 'select ball_id from public.ball_games')).toEqual([]);
    expect(await db.asUser(w.u.extra, 'select id from public.bowling_balls')).toEqual([]);
    // Ni el superadmin lee las bolas de otros: son de la cuenta.
    expect((await db.asUser(w.u.dios, 'select name from public.bowling_balls')).map((r) => r.name)).toEqual(['La del jefe']);
    await fails(db.asAnon('select id from public.bowling_balls'), '42501');
    await fails(db.asAnon('select id from public.ball_games'), '42501');
    for (const who of [w.u.luis, w.u.dios]) {
      await fails(db.as(who, `insert into public.bowling_balls (user_id, name, weight) values ($1, 'X', 15)`, [who]), '42501');
      await fails(db.as(who, `update public.bowling_balls set name = 'x'`), '42501');
      await fails(db.as(who, 'delete from public.bowling_balls'), '42501');
      await fails(db.as(who, 'insert into public.ball_games (user_id, ball_id, solo_id, game) values ($1, $2, $3, 0)', [who, mine, solo]), '42501');
      await fails(db.as(who, 'delete from public.ball_games'), '42501');
    }
    // Ni con service_role se guarda una bola imposible ni un juego sin lugar (o con dos) o de otro número.
    for (const set of [`weight = 17`, `weight = 5`, `color = 'red'`, `color = '#FFFFFF'`, `cover = 'madera'`, `name = ''`, `brand = repeat('x', 41)`]) {
      await fails(db.asService(`update public.bowling_balls set ${set} where id = $1`, [mine]), '23514');
    }
    await fails(db.asService('update public.ball_games set game = 10'), '23514');
    await fails(db.asService('update public.ball_games set event_id = $1', [w.e.e1]), '23514');
    await fails(db.asService('update public.ball_games set solo_id = null'), '23514');
    // Y una bola de otra cuenta no se puede poner en un juego (la llave es bola + cuenta).
    const anas = (await db.admin<{ id: string }>('select id from public.bowling_balls where user_id = $1', [w.u.ana]))[0].id;
    await fails(db.asService('update public.ball_games set ball_id = $1', [anas]), '23503');
  });

  it('cuenta bloqueada: no guarda bolas ni marca juegos (leer sí)', async () => {
    const id = await saveBall(w.u.luis);
    const solo = await saveSolo(w.u.luis, [150]);
    await block(w.u.luis);
    await fails(saveBall(w.u.luis), 'bloqueada');
    await fails(db.rpc(w.u.luis, 'retire_ball', { p_id: id }), 'bloqueada');
    await fails(db.rpc(w.u.luis, 'resurface_ball', { p_id: id }), 'bloqueada');
    await fails(db.rpc(w.u.luis, 'delete_ball', { p_id: id }), 'bloqueada');
    await fails(setBalls(w.u.luis, 'solo', solo, { 0: id }), 'bloqueada');
    await fails(db.rpc(w.u.luis, 'my_balls'), 'bloqueada');
  });
});

describe('bolas', () => {
  it('crear con el id del teléfono: recorta, pone el color en minúsculas y lo trae my_balls', async () => {
    const id = randomUUID();
    expect(
      await saveBall(w.u.luis, {
        p_id: id,
        p_name: '  Phaze II ',
        p_brand: ' Storm ',
        p_color: ' #1D4ED8 ',
        p_cover: 'solida',
        p_drilled_on: await daysAgo(90),
        p_resurfaced_on: await daysAgo(10),
      }),
    ).toBe(id);
    expect(await ballRow(id)).toMatchObject({ user_id: w.u.luis, name: 'Phaze II', brand: 'Storm', weight: 15, color: '#1d4ed8', cover: 'solida', retired: false });
    const r = await db.rpc<Json>(w.u.luis, 'my_balls');
    expect(r).toEqual({
      balls: [
        {
          id,
          name: 'Phaze II',
          brand: 'Storm',
          weight: 15,
          color: '#1d4ed8',
          cover: 'solida',
          drilledOn: await daysAgo(90),
          resurfacedOn: await daysAgo(10),
          retired: false,
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
      ],
      lastUsed: null,
    });
    // Sin p_id, una nueva; sin cubierta ni fechas.
    const other = await saveBall(w.u.luis, { p_name: 'Spare', p_weight: 14, p_color: '#ffffff', p_cover: '' });
    expect(await ballRow(other)).toMatchObject({ name: 'Spare', brand: '', cover: null, drilled_on: null, resurfaced_on: null });
    expect((await db.rpc<Json>(w.u.luis, 'my_balls')).balls.map((b: Json) => b.id)).toEqual([id, other]);
  });

  it('cambiar lo reemplaza todo; las retiradas salen al final', async () => {
    const a = await saveBall(w.u.luis, { p_brand: 'Storm', p_cover: 'perlada' });
    const b = await saveBall(w.u.luis, { p_name: 'Otra' });
    await saveBall(w.u.luis, { p_id: a, p_name: 'Phaze', p_weight: 16, p_color: '#000000', p_retired: true });
    expect(await ballRow(a)).toMatchObject({ name: 'Phaze', brand: '', weight: 16, color: '#000000', cover: null, retired: true });
    expect((await db.rpc<Json>(w.u.luis, 'my_balls')).balls.map((x: Json) => x.id)).toEqual([b, a]);
    expect(await db.count('public.bowling_balls', 'user_id = $1', [w.u.luis])).toBe(2);
  });

  it('con p_op_id reintentar devuelve la misma bola sin crear otra', async () => {
    const op = randomUUID();
    const id = await saveBall(w.u.luis, { p_op_id: op });
    expect(await saveBall(w.u.luis, { p_op_id: op, p_name: 'Otra cosa' })).toBe(id);
    expect(await db.count('public.bowling_balls', 'user_id = $1', [w.u.luis])).toBe(1);
    expect((await ballRow(id)).name).toBe('Phaze II');
    // El mismo op_id de otra cuenta no sirve.
    await fails(saveBall(w.u.ana, { p_op_id: op }), 'duplicado');
  });

  it('lo que no vale: nombre, marca, peso, color, cubierta y fechas', async () => {
    const bad: Record<string, unknown>[] = [
      { p_name: '   ' },
      { p_name: 'x'.repeat(41) },
      { p_name: null },
      { p_brand: 'x'.repeat(41) },
      { p_weight: 5 },
      { p_weight: 17 },
      { p_weight: null },
      { p_color: 'azul' },
      { p_color: '#12345' },
      { p_color: null },
      { p_cover: 'madera' },
      { p_drilled_on: await daysAgo(-2) },
      { p_resurfaced_on: await daysAgo(-2) },
      { p_drilled_on: '1990-01-01' },
      { p_drilled_on: await daysAgo(5), p_resurfaced_on: await daysAgo(6) },
    ];
    for (const args of bad) await fails(saveBall(w.u.luis, args), INVALID);
    // Mañana sí (el teléfono puede estar en otra hora) y el mismo día perforada y pulida también.
    await saveBall(w.u.luis, { p_drilled_on: await daysAgo(-1), p_resurfaced_on: await daysAgo(-1) });
    expect(await db.count('public.bowling_balls')).toBe(1);
  });

  it('la bola de otra cuenta no se cambia, no se retira, no se pule ni se borra (tampoco el superadmin)', async () => {
    const id = await saveBall(w.u.luis);
    for (const who of [w.u.ana, w.u.dios]) {
      await fails(saveBall(who, { p_id: id, p_name: 'Mía' }), DENIED);
      await fails(db.rpc(who, 'retire_ball', { p_id: id }), DENIED);
      await fails(db.rpc(who, 'resurface_ball', { p_id: id }), DENIED);
      await fails(db.rpc(who, 'delete_ball', { p_id: id }), DENIED);
    }
    expect(await ballRow(id)).toMatchObject({ name: 'Phaze II', retired: false, resurfaced_on: null });
    for (const fn of ['retire_ball', 'resurface_ball', 'delete_ball']) await fails(db.rpc(w.u.luis, fn, { p_id: randomUUID() }), 'no_existe');
  });

  it('hasta 30 por cuenta (las retiradas cuentan) y 100 cambios por día', async () => {
    for (let i = 0; i < 30; i++) await saveBall(w.u.luis, { p_name: `Bola ${i}`, p_retired: i < 5 });
    await fails(saveBall(w.u.luis, { p_name: 'La 31' }), 'cupo_lleno');
    // Cambiar una que ya tiene sí se puede; otra cuenta tiene su propio cupo.
    const first = (await db.admin<{ id: string }>('select id from public.bowling_balls where user_id = $1 limit 1', [w.u.luis]))[0].id;
    await saveBall(w.u.luis, { p_id: first, p_name: 'Cambiada' });
    await saveBall(w.u.ana);
    // Borrar una deja lugar.
    await db.rpc(w.u.luis, 'delete_ball', { p_id: first });
    await saveBall(w.u.luis, { p_name: 'La 30 otra vez' });

    await db.admin(`update private.rate_limits set hits = 100 where key = $1`, [`balls:${w.u.ana}`]);
    await fails(saveBall(w.u.ana, { p_name: 'Otra' }), 'rate_limited');
    const anas = (await db.admin<{ id: string }>('select id from public.bowling_balls where user_id = $1', [w.u.ana]))[0].id;
    await fails(db.rpc(w.u.ana, 'retire_ball', { p_id: anas }), 'rate_limited');
    await db.admin(`update private.rate_limits set window_start = now() - interval '25 hours' where key = $1`, [`balls:${w.u.ana}`]);
    await saveBall(w.u.ana, { p_name: 'Otra' });
  });

  it('retirar y volver a usar; pulir hoy (o ese día) sin pasar de mañana ni antes de perforarla', async () => {
    const id = await saveBall(w.u.luis, { p_drilled_on: await daysAgo(30) });
    await db.rpc(w.u.luis, 'retire_ball', { p_id: id });
    expect((await ballRow(id)).retired).toBe(true);
    await db.rpc(w.u.luis, 'retire_ball', { p_id: id, p_retired: false });
    expect((await ballRow(id)).retired).toBe(false);

    await db.rpc(w.u.luis, 'resurface_ball', { p_id: id });
    expect((await db.rpc<Json>(w.u.luis, 'my_balls')).balls[0].resurfacedOn).toBe(today);
    await db.rpc(w.u.luis, 'resurface_ball', { p_id: id, p_on: await daysAgo(3) });
    expect((await db.rpc<Json>(w.u.luis, 'my_balls')).balls[0].resurfacedOn).toBe(await daysAgo(3));
    await fails(db.rpc(w.u.luis, 'resurface_ball', { p_id: id, p_on: await daysAgo(31) }), 'invalido');
    await fails(db.rpc(w.u.luis, 'resurface_ball', { p_id: id, p_on: await daysAgo(-2) }), 'invalido');

    // Con p_op_id: reintentar no repite (la segunda con otra fecha no cambia nada).
    const op = randomUUID();
    await db.rpc(w.u.luis, 'resurface_ball', { p_id: id, p_on: await daysAgo(1), p_op_id: op });
    await db.rpc(w.u.luis, 'resurface_ball', { p_id: id, p_on: await daysAgo(2), p_op_id: op });
    expect((await db.rpc<Json>(w.u.luis, 'my_balls')).balls[0].resurfacedOn).toBe(await daysAgo(1));
    const op2 = randomUUID();
    await db.rpc(w.u.luis, 'retire_ball', { p_id: id, p_op_id: op2 });
    await db.rpc(w.u.luis, 'retire_ball', { p_id: id, p_retired: false });
    await db.rpc(w.u.luis, 'retire_ball', { p_id: id, p_op_id: op2 });
    expect((await ballRow(id)).retired).toBe(false);
  });
});

describe('con qué bola tiró cada juego', () => {
  it('juego suelto: cada juego que viene cambia, null lo quita y los demás se quedan', async () => {
    const a = await saveBall(w.u.luis, { p_name: 'A' });
    const b = await saveBall(w.u.luis, { p_name: 'B' });
    const solo = await saveSolo(w.u.luis, [180, 200, 210]);
    expect(await setBalls(w.u.luis, 'solo', solo, { 0: a, 1: a, 2: b })).toBe(3);
    expect(await tags(solo)).toEqual([
      { game: 0, ball_id: a },
      { game: 1, ball_id: a },
      { game: 2, ball_id: b },
    ]);
    expect(await setBalls(w.u.luis, 'solo', solo, { 1: b, 2: null })).toBe(2);
    expect(await tags(solo)).toEqual([
      { game: 0, ball_id: a },
      { game: 1, ball_id: b },
    ]);
    // Vacío o null: no cambia nada.
    expect(await setBalls(w.u.luis, 'solo', solo, {})).toBe(2);
    expect(await setBalls(w.u.luis, 'solo', solo, null)).toBe(2);
    expect((await db.rpc<Json>(w.u.luis, 'my_balls')).lastUsed).toBe(b);
  });

  it('juego suelto: si queda con menos juegos, los de más se quitan; una bola ajena o borrada se salta', async () => {
    const a = await saveBall(w.u.luis);
    const anas = await saveBall(w.u.ana);
    const solo = await saveSolo(w.u.luis, [180, 200, 210]);
    await setBalls(w.u.luis, 'solo', solo, { 0: a, 1: a, 2: a });
    await db.rpc(w.u.luis, 'save_solo_session', { p_id: solo, p_played_on: today, p_scores: [180] });
    expect(await setBalls(w.u.luis, 'solo', solo, { 0: a })).toBe(1);
    expect(await tags(solo)).toEqual([{ game: 0, ball_id: a }]);
    // El juego 1 ya no existe.
    await fails(setBalls(w.u.luis, 'solo', solo, { 1: a }), 'invalido');
    expect(await setBalls(w.u.luis, 'solo', solo, { 0: anas })).toBe(0);
    expect(await setBalls(w.u.luis, 'solo', solo, { 0: randomUUID() })).toBe(0);
    expect(await tags(solo)).toEqual([]);
  });

  it('juego suelto: un número pasa la bola que tiene ahora ese otro juego (se borró uno del medio sin señal)', async () => {
    const a = await saveBall(w.u.luis, { p_name: 'A' });
    const b = await saveBall(w.u.luis, { p_name: 'B' });
    const c = await saveBall(w.u.luis, { p_name: 'C' });
    const solo = await saveSolo(w.u.luis, [180, 200, 210, 150]);
    await setBalls(w.u.luis, 'solo', solo, { 0: a, 1: b, 2: c, 3: null });
    // Se borró el juego 2 (el de 200): los de después suben uno y se llevan su bola.
    await db.rpc(w.u.luis, 'save_solo_session', { p_id: solo, p_played_on: today, p_scores: [180, 210, 150] });
    expect(await setBalls(w.u.luis, 'solo', solo, { 0: 0, 1: 2, 2: 3 } as unknown as Record<string, string>)).toBe(2);
    expect(await tags(solo)).toEqual([
      { game: 0, ball_id: a },
      { game: 1, ball_id: c },
    ]);
    // Se mezclan con bolas y null; se leen antes de cambiar nada (cambiar de lugar dos juegos).
    expect(await setBalls(w.u.luis, 'solo', solo, { 0: 1, 1: 0, 2: b } as unknown as Record<string, string>)).toBe(3);
    expect(await tags(solo)).toEqual([
      { game: 0, ball_id: c },
      { game: 1, ball_id: a },
      { game: 2, ball_id: b },
    ]);
    // Un juego sin bola (o que ya no existe) no le pone ninguna.
    expect(await setBalls(w.u.luis, 'solo', solo, { 0: 7, 1: null } as unknown as Record<string, string>)).toBe(1);
    expect(await tags(solo)).toEqual([{ game: 2, ball_id: b }]);
  });

  it('lo que no cambia se queda como está: la «última que usó» sigue siendo la de verdad', async () => {
    const a = await saveBall(w.u.luis, { p_name: 'A' });
    const b = await saveBall(w.u.luis, { p_name: 'B' });
    const old = await saveSolo(w.u.luis, [180, 190], { p_played_on: await daysAgo(60) });
    await setBalls(w.u.luis, 'solo', old, { 0: a, 1: a });
    const recent = await saveSolo(w.u.luis, [200]);
    await setBalls(w.u.luis, 'solo', recent, { 0: b });
    expect((await db.rpc<Json>(w.u.luis, 'my_balls')).lastUsed).toBe(b);
    const stamps = () => db.admin('select game, created_at::text as at from public.ball_games where solo_id = $1 order by game', [old]);
    const before = await stamps();
    // Guardar otra vez el juego viejo con las mismas bolas (p. ej. se cambió la bolera) no toca nada.
    expect(await setBalls(w.u.luis, 'solo', old, { 0: a, 1: a })).toBe(2);
    expect(await stamps()).toEqual(before);
    expect((await db.rpc<Json>(w.u.luis, 'my_balls')).lastUsed).toBe(b);
    // Cambiar una sí la marca (esa es la última que eligió).
    await setBalls(w.u.luis, 'solo', old, { 0: a, 1: b });
    await setBalls(w.u.luis, 'solo', old, { 0: b, 1: b });
    expect((await db.rpc<Json>(w.u.luis, 'my_balls')).lastUsed).toBe(b);
  });

  it('lo que no vale: tipo, claves y valores', async () => {
    const a = await saveBall(w.u.luis);
    const solo = await saveSolo(w.u.luis, [150]);
    for (const [kind, balls] of [
      ['partido', { 0: a }],
      ['solo', { x: a }],
      ['solo', { 10: a }],
      ['solo', { '-1': a }],
      ['solo', { 0: 'no-es-uuid' }],
      // Un número es «la bola de ese otro juego» (de 0 a 9, entero) y solo en un juego suelto.
      ['solo', { 0: 10 }],
      ['solo', { 0: -1 }],
      ['solo', { 0: 1.5 }],
      ['solo', { 0: true }],
      ['event', { 0: 0 }],
      ['sub', { 0: 0 }],
    ] as const) {
      await fails(setBalls(w.u.luis, kind, solo, balls as unknown as Record<string, string>), 'invalido');
    }
    await fails(db.rpc(w.u.luis, 'set_game_balls', { p_kind: 'solo', p_ref: solo, p_balls: [a] }), 'invalido');
    await fails(db.rpc(w.u.luis, 'set_game_balls', { p_kind: 'solo', p_ref: null, p_balls: {} }), 'invalido');
    expect(await tags(solo)).toEqual([]);
  });

  it('de otra cuenta: no_permitido; uno que ya no está: no hace nada (la cola pudo llegar tarde)', async () => {
    const a = await saveBall(w.u.luis);
    const anas = await saveSolo(w.u.ana, [150]);
    await fails(setBalls(w.u.luis, 'solo', anas, { 0: a }), DENIED);
    expect(await setBalls(w.u.luis, 'solo', randomUUID(), { 0: a })).toBe(0);
    expect(await setBalls(w.u.luis, 'event', randomUUID(), { 0: a })).toBe(0);
    expect(await setBalls(w.u.luis, 'sub', randomUUID(), { 0: a })).toBe(0);
    expect(await db.count('public.ball_games')).toBe(0);
  });

  it('evento de su liga: quien tiene jugador en la liga; hasta los juegos del evento; solo del boliche', async () => {
    const a = await saveBall(w.u.luis);
    expect(await setBalls(w.u.luis, 'event', w.e.e1, { 0: a })).toBe(1);
    // Otro juego del mismo evento no toca el primero.
    expect(await setBalls(w.u.luis, 'event', w.e.e1, { 2: a })).toBe(2);
    await fails(setBalls(w.u.luis, 'event', w.e.e1, { 3: a }), 'invalido');
    // Ana es miembro sin jugador; otro no es de la liga.
    const anas = await saveBall(w.u.ana);
    await fails(setBalls(w.u.ana, 'event', w.e.e1, { 0: anas }), DENIED);
    const extras = await saveBall(w.u.extra);
    await fails(setBalls(w.u.extra, 'event', w.e.e9, { 0: extras }), DENIED);
    // Una liga de otro deporte no tiene bolas.
    const padel = await league(db, w.u.luis, { name: 'Pádel', visibility: 'private', sport: 'padel' });
    await member(db, padel, w.u.luis, 'owner', 'luis');
    await player(db, padel, 'Luis', w.u.luis);
    const match = await event(db, padel, 'torneo', today);
    await fails(setBalls(w.u.luis, 'event', match, { 0: a }), 'invalido');
    // Cada cuenta tiene lo suyo en el mismo evento: el dueño también juega.
    await player(db, w.priv, 'Org', w.u.org);
    const orgs = await saveBall(w.u.org);
    expect(await setBalls(w.u.org, 'event', w.e.e1, { 0: orgs })).toBe(1);
    expect(await db.count('public.ball_games', 'event_id = $1', [w.e.e1])).toBe(3);
  });

  it('envío: solo los suyos (ni el admin marca los de otro); hasta los juegos del envío', async () => {
    const a = await saveBall(w.u.luis);
    const sub = await db.rpc<string>(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_scores: [180, 200], p_date: today });
    expect(await setBalls(w.u.luis, 'sub', sub, { 0: a, 1: a })).toBe(2);
    await fails(setBalls(w.u.luis, 'sub', sub, { 2: a }), 'invalido');
    const sofis = await saveBall(w.u.sofi);
    await fails(setBalls(w.u.sofi, 'sub', sub, { 0: sofis }), DENIED);
    // Uno que el admin mandó por Pedro (sin cuenta) tampoco es de nadie más.
    const forPedro = await db.rpc<string>(w.u.sofi, 'submit_games', {
      p_op_id: randomUUID(),
      p_league: w.priv,
      p_scores: [150],
      p_date: today,
      p_player: w.p.pedro,
    });
    await fails(setBalls(w.u.sofi, 'sub', forPedro, { 0: sofis }), DENIED);
    await fails(setBalls(w.u.luis, 'sub', forPedro, { 0: a }), DENIED);
  });

  it('con p_op_id: reintentar no repite (y devuelve lo mismo); 500 por día', async () => {
    const a = await saveBall(w.u.luis);
    const b = await saveBall(w.u.luis, { p_name: 'B' });
    const solo = await saveSolo(w.u.luis, [150, 160]);
    const op = randomUUID();
    expect(await setBalls(w.u.luis, 'solo', solo, { 0: a }, { p_op_id: op })).toBe(1);
    await setBalls(w.u.luis, 'solo', solo, { 0: b });
    expect(await setBalls(w.u.luis, 'solo', solo, { 0: a, 1: a }, { p_op_id: op })).toBe(1);
    expect(await tags(solo)).toEqual([{ game: 0, ball_id: b }]);
    await db.admin(`update private.rate_limits set hits = 500 where key = $1`, [`ballgames:${w.u.luis}`]);
    await fails(setBalls(w.u.luis, 'solo', solo, { 1: a }), 'rate_limited');
  });
});

describe('mis juegos con bola', () => {
  it('juntan juegos sueltos, eventos y envíos con su fecha, puntaje, cuadros y si cuentan', async () => {
    const a = await saveBall(w.u.luis, { p_name: 'A' });
    const b = await saveBall(w.u.luis, { p_name: 'B' });
    // Juego suelto de hace 5 días (el primero con cuadros).
    const solo = await saveSolo(w.u.luis, [300, 180], { p_played_on: await daysAgo(5), p_frames: { 0: { rolls: STRIKES } } });
    await setBalls(w.u.luis, 'solo', solo, { 0: a, 1: b });
    // e1 (práctica de la liga): luis tiene [150] sin foto (no cuenta todavía).
    const e1Date = (await db.admin<{ d: string }>(`select to_char(date, 'YYYY-MM-DD') as d from public.events where id = $1`, [w.e.e1]))[0].d;
    await setBalls(w.u.luis, 'event', w.e.e1, { 0: a, 1: a });
    // Un envío por fecha que está pendiente y otro que se rechaza.
    const pending = await db.rpc<string>(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_scores: [210], p_date: await daysAgo(1) });
    await setBalls(w.u.luis, 'sub', pending, { 0: b });
    const rejected = await db.rpc<string>(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_scores: [99], p_date: await daysAgo(1) });
    await setBalls(w.u.luis, 'sub', rejected, { 0: b });
    await db.rpc(w.u.org, 'reject_submission', { p_submission: rejected, p_note: 'No' });

    const games = await myGames(w.u.luis);
    const find = (kind: string, ref: string, game: number) => games.find((g) => g.kind === kind && g.ref === ref && g.game === game);
    expect(find('solo', solo, 0)).toEqual({ ball: a, kind: 'solo', ref: solo, game: 0, date: await daysAgo(5), score: 300, frames: { rolls: STRIKES }, counted: true });
    expect(find('solo', solo, 1)).toMatchObject({ ball: b, score: 180, frames: null, counted: true });
    expect(find('event', w.e.e1, 0)).toMatchObject({ ball: a, date: e1Date, score: 150, counted: false });
    // El juego 2 de e1 todavía no tiene puntaje.
    expect(find('event', w.e.e1, 1)).toMatchObject({ ball: a, score: null, counted: false });
    expect(find('sub', pending, 0)).toMatchObject({ ball: b, date: await daysAgo(1), score: 210, counted: false });
    expect(find('sub', rejected, 0)).toBeUndefined();
    expect(games).toHaveLength(5);
    // Del más nuevo al más viejo (sin fecha no hay: todos tienen una).
    const dates = games.map((g) => g.date as string);
    expect([...dates].sort().reverse()).toEqual(dates);

    // Se verifican: el admin pone la foto en e1 y aprueba el envío en el juego 2 de la práctica de ese día, con otro número.
    await db.admin(`update public.entries set photos = '{sin-foto}' where id = $1`, [w.e1Luis]);
    const approved = await db.rpc<Json>(w.u.org, 'approve_submission', { p_submission: pending, p_values: { 1: 215 }, p_start: 1 });
    const again = await myGames(w.u.luis);
    expect(again.find((g) => g.kind === 'event' && g.ref === w.e.e1 && g.game === 0)).toMatchObject({ score: 150, counted: true });
    // La bola del envío pasó al juego del evento donde quedó, con lo que aprobó el admin (no lo que se envió).
    expect(again.find((g) => g.kind === 'sub')).toBeUndefined();
    expect(again.find((g) => g.ref === approved.event_id)).toEqual({
      ball: b,
      kind: 'event',
      ref: approved.event_id,
      game: 1,
      date: await daysAgo(1),
      score: 215,
      frames: null,
      counted: true,
    });

    // Solo los de un lugar, y hasta p_limit.
    expect((await myGames(w.u.luis, { p_ref: solo })).map((g) => g.game)).toEqual([1, 0]);
    expect(await myGames(w.u.luis, { p_limit: 2 })).toHaveLength(2);
    // Otra cuenta no ve nada de esto.
    expect(await myGames(w.u.ana)).toEqual([]);
    expect(await myGames(w.u.ana, { p_ref: solo })).toEqual([]);
  });

  it('envío aprobado: cada bola va al juego del evento que aprobó el admin; lo que no aprobó no cuenta', async () => {
    const a = await saveBall(w.u.luis, { p_name: 'A' });
    const b = await saveBall(w.u.luis, { p_name: 'B' });
    const c = await saveBall(w.u.luis, { p_name: 'C' });
    // luis ya marcó el juego 2 de e1 desde la hoja del evento con C.
    await setBalls(w.u.luis, 'event', w.e.e1, { 1: c });
    const sub = await db.rpc<string>(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_scores: [198, 170, 205], p_event: w.e.e1 });
    await setBalls(w.u.luis, 'sub', sub, { 0: a, 1: b, 2: a });
    const byGame = (a: unknown[], b: unknown[]) => Number(a[0]) - Number(b[0]);
    expect((await myGames(w.u.luis, { p_ref: sub })).map((g) => [g.game, g.score, g.counted]).sort(byGame)).toEqual([
      [0, 198, false],
      [1, 170, false],
      [2, 205, false],
    ]);
    // El admin corrige el J1 (189, lo leyó de la foto), aprueba el J2 y deja fuera el J3.
    await db.rpc(w.u.org, 'approve_submission', { p_submission: sub, p_values: { 0: 189, 1: 170 }, p_event: w.e.e1, p_start: 0 });
    expect(await tags(sub)).toEqual([]);
    // El juego 2 ya tenía C: el envío lo pisó, así que queda la bola del envío.
    expect((await myGames(w.u.luis, { p_ref: w.e.e1 })).map((g) => [g.game, g.ball, g.score, g.counted]).sort(byGame)).toEqual([
      [0, a, 189, true],
      [1, b, 170, true],
    ]);
    expect(await db.admin('select games from private.sub_games where sub_id = $1', [sub])).toEqual([{ games: { 0: 0, 1: 1 } }]);
    // Si después el admin cambia el juego, la bola lo sigue (sale de la participación).
    await db.admin('update public.entries set scores[1] = 191 where id = $1', [w.e1Luis]);
    expect((await myGames(w.u.luis, { p_ref: w.e.e1 })).find((g) => g.game === 0)).toMatchObject({ score: 191 });
  });

  it('envío aprobado: la bola que llega después va a su juego del evento; un envío rechazado no marca nada', async () => {
    const a = await saveBall(w.u.luis);
    const sub = await db.rpc<string>(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_scores: [180, 190], p_date: today });
    const r = await db.rpc<Json>(w.u.org, 'approve_submission', { p_submission: sub, p_values: { 3: 180, 4: 190 }, p_start: 3, p_games: 5 });
    // La cola sin conexión la mandó tarde: igual cae en los juegos 4 y 5 de la práctica.
    expect(await setBalls(w.u.luis, 'sub', sub, { 0: a, 1: a })).toBe(2);
    expect(await tags(sub)).toEqual([]);
    expect(await tags(r.event_id)).toEqual([
      { game: 3, ball_id: a },
      { game: 4, ball_id: a },
    ]);
    // (Marcados en el mismo momento: el orden entre los dos no importa.)
    expect((await myGames(w.u.luis)).map((g) => [g.kind, g.game, g.score, g.counted]).sort((x, y) => Number(x[1]) - Number(y[1]))).toEqual([
      ['event', 3, 180, true],
      ['event', 4, 190, true],
    ]);
    // Un juego que no está en el envío sigue sin valer; p_start fuera de 0 a 9 tampoco.
    await fails(setBalls(w.u.luis, 'sub', sub, { 2: a }), 'invalido');
    const other = await db.rpc<string>(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_scores: [150], p_date: today });
    await fails(db.rpc(w.u.org, 'approve_submission', { p_submission: other, p_values: { 0: 150 }, p_start: 10 }), 'invalido');
    await db.rpc(w.u.org, 'reject_submission', { p_submission: other, p_note: 'No' });
    expect(await setBalls(w.u.luis, 'sub', other, { 0: a })).toBe(0);
    expect(await tags(other)).toEqual([]);
  });

  it('aprobado desde un teléfono de antes (sin p_start): cuenta en su mismo juego solo si el admin aprobó lo que se envió', async () => {
    const a = await saveBall(w.u.luis);
    const sub = await db.rpc<string>(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_scores: [198, 170], p_event: w.e.e1 });
    await setBalls(w.u.luis, 'sub', sub, { 0: a, 1: a });
    await db.rpc(w.u.org, 'approve_submission', { p_submission: sub, p_values: { 0: 189, 1: 170 } });
    expect((await myGames(w.u.luis)).map((g) => [g.kind, g.game, g.score, g.counted])).toEqual([['event', 1, 170, true]]);
  });

  it('si la cuenta ya no tiene jugador en esa liga, el juego sale sin puntaje', async () => {
    const a = await saveBall(w.u.luis);
    await setBalls(w.u.luis, 'event', w.e.e1, { 0: a });
    await db.admin('update public.players set user_id = null where id = $1', [w.p.luis]);
    expect(await myGames(w.u.luis)).toEqual([expect.objectContaining({ kind: 'event', score: null, counted: false })]);
  });
});

describe('borrados, datos de la cuenta y la prueba de humo', () => {
  it('se borran solos con la bola, el juego suelto, el envío y el evento', async () => {
    const a = await saveBall(w.u.luis);
    const b = await saveBall(w.u.luis, { p_name: 'B' });
    const solo = await saveSolo(w.u.luis, [150, 160]);
    await setBalls(w.u.luis, 'solo', solo, { 0: a, 1: b });
    await setBalls(w.u.luis, 'event', w.e.e1, { 0: a });
    const sub = await db.rpc<string>(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_scores: [180], p_date: today });
    await setBalls(w.u.luis, 'sub', sub, { 0: b });
    expect(await db.count('public.ball_games')).toBe(4);

    await db.rpc(w.u.luis, 'delete_ball', { p_id: a });
    expect(await db.count('public.bowling_balls', 'id = $1', [a])).toBe(0);
    expect(await db.admin('select game, ball_id from public.ball_games order by game')).toEqual([
      { game: 0, ball_id: b },
      { game: 1, ball_id: b },
    ]);
    await db.rpc(w.u.luis, 'delete_solo_session', { p_id: solo });
    expect(await db.count('public.ball_games')).toBe(1);
    await db.admin('delete from public.submissions where id = $1', [sub]);
    expect(await db.count('public.ball_games')).toBe(0);
    await setBalls(w.u.luis, 'event', w.e.e1, { 0: b });
    await db.rpc(w.u.org, 'delete_event', { p_event: w.e.e1 });
    expect(await db.count('public.ball_games')).toBe(0);
    expect(await db.count('public.bowling_balls', 'user_id = $1', [w.u.luis])).toBe(1);
  });

  it('salen en «Descargar mis datos» (solo las suyas) y se van al borrar la cuenta', async () => {
    const a = await saveBall(w.u.luis, { p_brand: 'Storm' });
    const solo = await saveSolo(w.u.luis, [150]);
    await setBalls(w.u.luis, 'solo', solo, { 0: a });
    await saveBall(w.u.ana, { p_name: 'De Ana' });
    const d = await db.rpc<Json>(w.u.luis, 'export_my_data');
    expect(d.tables.bowling_balls).toEqual([expect.objectContaining({ id: a, name: 'Phaze II', brand: 'Storm', user_id: w.u.luis })]);
    expect(d.tables.ball_games).toEqual([expect.objectContaining({ ball_id: a, solo_id: solo, game: 0, user_id: w.u.luis })]);
    expect(JSON.stringify(d)).not.toContain('De Ana');

    await db.admin('delete from auth.users where id = $1', [w.u.luis]);
    expect(await db.count('public.bowling_balls', 'user_id = $1', [w.u.luis])).toBe(0);
    expect(await db.count('public.ball_games', 'user_id = $1', [w.u.luis])).toBe(0);
    expect(await db.count('private.rate_limits', 'key like $1', [`%:${w.u.luis}`])).toBe(0);
    expect(await db.count('public.bowling_balls')).toBe(1);
  });

  it('la prueba de humo cuenta esta migración y tiene su paso', () => {
    const smoke = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'supabase', 'smoke.sql'), 'utf8');
    expect(smoke).toContain(`'20260930000100'`);
    expect(smoke).toMatch(/OK mis bolas|ok\('mis bolas/);
  });
});
