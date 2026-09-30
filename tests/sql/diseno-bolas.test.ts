/**
 * El diseño de las bolas (20260930000300_diseno_bolas.sql): bowling_balls.design con su CHECK, set_ball_design (solo
 * las bolas propias, revisa cada clave, copia el color base, límite de cambios) y my_balls con el diseño. La revisión
 * de la base (private.ball_design_ok) dice lo mismo que la del teléfono (ballDesignProblem de src/lib/ballDesign.ts),
 * caso por caso, y lo que arregla normalizeBallDesign siempre se puede guardar.
 *
 * Mundo (fixture): luis y ana (liga privada del Banco), extra sin liga; dios es superadmin.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, TestDb, fails } from './harness';
import { makeWorld, type World } from './fixture';
import { ballDesignProblem, defaultBallDesign, newSticker, normalizeBallDesign, type BallDesign } from '../../src/lib/ballDesign';

let db: TestDb;
let w: World;

type Json = Record<string, any>;

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

const saveBall = (who: string, args: Record<string, unknown> = {}) =>
  db.rpc<string>(who, 'save_ball', { p_id: null, p_name: 'Phaze II', p_weight: 15, p_color: '#1d4ed8', ...args });
const setDesign = (who: string, ball: string, design: unknown) =>
  db.rpc<Json | null>(who, 'set_ball_design', { p_ball: ball, p_design: design === undefined ? null : JSON.stringify(design) });
const ballRow = async (id: string) => (await db.admin<Json>('select * from public.bowling_balls where id = $1', [id]))[0];
const block = (id: string) => db.rpc(w.u.dios, 'admin_block_user', { p_user: id, p_reason: 'prueba' });

/** Un diseño completo que vale: galaxia con cinco figuras (las de texto, con su texto). */
const FULL: BallDesign = {
  v: 1,
  base: '#0b1026',
  second: '#7c3aed',
  third: null,
  pattern: 'galaxia',
  scale: 1.25,
  softness: 0.6,
  angle: 45,
  shine: true,
  holes: false,
  stickers: [
    { shape: 'estrella', color: '#facc15', x: -0.5, y: 0.2, size: 0.25, rotation: 15 },
    { shape: 'numero', text: '123', color: '#f8fafc', x: 0, y: 0.45, size: 0.3, rotation: 0 },
    { shape: 'iniciales', text: 'ÑÁ', color: '#dc2626', x: 0.5, y: 0.2, size: 0.3, rotation: 350 },
    { shape: 'calavera', color: '#ffffff', x: 0, y: -0.7, size: 0.2, rotation: 0 },
    { shape: 'logo', color: '#111827', x: 0.6, y: -0.3, size: 0.2, rotation: 90 },
  ],
};

/** Lo de FULL con un cambio (en la raíz o en una figura). */
const withKey = (patch: Record<string, unknown>): Json => ({ ...FULL, ...patch });
const withSticker = (i: number, patch: Record<string, unknown>): Json => ({
  ...FULL,
  stickers: FULL.stickers.map((s, j) => (j === i ? { ...s, ...patch } : s)),
});
const without = (o: Json, key: string): Json => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));

/** La revisión de la base para una lista de JSON (en texto, tal cual). */
async function sqlOk(texts: string[]): Promise<boolean[]> {
  const rows = await db.admin<{ ok: boolean }>(
    'select private.ball_design_ok(x.d::jsonb) as ok from unnest($1::text[]) with ordinality as x (d, n) order by x.n',
    [texts],
  );
  return rows.map((r) => r.ok);
}

describe('permisos', () => {
  it('set_ball_design: solo con sesión, security definer, search_path vacío y pasa por require_uid; la revisión, nadie de la app', async () => {
    const rows = await db.admin<Json>(
      `select p.proname as fn, p.prosecdef as definer, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth, p.prosrc like '%private.require_uid()%' as uid,
              'search_path=""' = any (p.proconfig) as path, pg_get_function_identity_arguments(p.oid) as args
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('my_balls', 'set_ball_design') order by 1`,
    );
    expect(rows).toEqual([
      { fn: 'my_balls', definer: true, anon: false, auth: true, uid: true, path: true, args: '' },
      { fn: 'set_ball_design', definer: true, anon: false, auth: true, uid: true, path: true, args: 'p_ball uuid, p_design jsonb' },
    ]);
    await fails(setDesign(ANON, randomUUID(), FULL), '42501');
    for (const fn of ['private.ball_design_ok(jsonb)', 'private.ball_hex_ok(jsonb)', 'private.ball_num_ok(jsonb, numeric, numeric)']) {
      expect(
        await db.admin(
          `select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as auth,
                  has_function_privilege('service_role', $1, 'execute') as service`,
          [fn],
        ),
        fn,
      ).toEqual([{ anon: false, auth: false, service: true }]);
    }
  });

  it('nadie escribe el diseño directo; ni con la clave secreta se guarda uno que no vale (CHECK)', async () => {
    const id = await saveBall(w.u.luis);
    for (const who of [w.u.luis, w.u.dios]) {
      await fails(db.as(who, 'update public.bowling_balls set design = $1::text::jsonb where id = $2', [JSON.stringify(FULL), id]), '42501');
    }
    for (const bad of [withKey({ base: '#FFFFFF' }), withKey({ extra: 1 }), withSticker(1, { text: '<b>' }), 'null', '[]']) {
      await fails(db.asService('update public.bowling_balls set design = $1::text::jsonb where id = $2', [typeof bad === 'string' ? bad : JSON.stringify(bad), id]), '23514');
    }
    await db.asService('update public.bowling_balls set design = $1::text::jsonb where id = $2', [JSON.stringify(FULL), id]);
    expect((await ballRow(id)).design).toEqual(FULL);
  });

  it('cuenta bloqueada: no diseña (leer sí)', async () => {
    const id = await saveBall(w.u.luis);
    await block(w.u.luis);
    await fails(setDesign(w.u.luis, id, FULL), 'bloqueada');
    expect(await ballRow(id)).toMatchObject({ design: null, color: '#1d4ed8' });
  });
});

describe('set_ball_design', () => {
  it('guarda el diseño, le copia el color base a la bola y my_balls lo trae; null lo quita (el color se queda)', async () => {
    const id = await saveBall(w.u.luis);
    expect((await db.rpc<Json>(w.u.luis, 'my_balls')).balls[0]).toMatchObject({ id, color: '#1d4ed8', design: null });
    expect(await setDesign(w.u.luis, id, FULL)).toEqual(FULL);
    expect(await ballRow(id)).toMatchObject({ design: FULL, color: '#0b1026' });
    const r = await db.rpc<Json>(w.u.luis, 'my_balls');
    expect(r.balls).toEqual([expect.objectContaining({ id, name: 'Phaze II', color: '#0b1026', design: FULL })]);
    // Cambiarlo lo reemplaza entero.
    const plain = defaultBallDesign('#dc2626');
    expect(await setDesign(w.u.luis, id, plain)).toEqual(plain);
    expect(await ballRow(id)).toMatchObject({ design: plain, color: '#dc2626' });
    // Quitarlo: con null o con el null de JSON.
    expect(await db.rpc(w.u.luis, 'set_ball_design', { p_ball: id, p_design: null })).toBeNull();
    expect(await ballRow(id)).toMatchObject({ design: null, color: '#dc2626' });
    await setDesign(w.u.luis, id, FULL);
    expect(await db.rpc(w.u.luis, 'set_ball_design', { p_ball: id, p_design: 'null' })).toBeNull();
    expect((await ballRow(id)).design).toBeNull();
  });

  it('save_ball no toca el diseño (cambiar el nombre, el peso o retirarla lo deja igual)', async () => {
    const id = await saveBall(w.u.luis);
    await setDesign(w.u.luis, id, FULL);
    await saveBall(w.u.luis, { p_id: id, p_name: 'Otra', p_weight: 14, p_color: '#0b1026' });
    await db.rpc(w.u.luis, 'retire_ball', { p_id: id });
    expect(await ballRow(id)).toMatchObject({ name: 'Otra', weight: 14, retired: true, design: FULL });
  });

  it('solo las bolas propias: la de otra cuenta no (tampoco el superadmin); una que no existe tampoco', async () => {
    const anas = await saveBall(w.u.ana, { p_name: 'De Ana' });
    for (const who of [w.u.luis, w.u.dios]) await fails(setDesign(who, anas, FULL), 'no_permitido');
    await fails(setDesign(w.u.luis, randomUUID(), FULL), 'no_existe');
    await fails(db.rpc(w.u.luis, 'set_ball_design', { p_ball: null, p_design: null }), 'no_existe');
    expect(await ballRow(anas)).toMatchObject({ design: null, color: '#1d4ed8' });
  });

  it('lo que no vale: invalido (y no cambia nada)', async () => {
    const id = await saveBall(w.u.luis);
    for (const bad of [
      withKey({ v: 2 }),
      withKey({ base: 'red' }),
      withKey({ pattern: 'rayas' }),
      withKey({ scale: 3 }),
      withKey({ stickers: [...FULL.stickers, FULL.stickers[0]] }),
      withSticker(2, { text: '<script>' }),
      withSticker(0, { text: 'X' }),
      without(FULL, 'holes'),
      [],
      'hola',
    ]) {
      await fails(setDesign(w.u.luis, id, bad), 'invalido');
    }
    // Un diseño que no vale ni siquiera dice si la bola es de otra cuenta.
    await fails(setDesign(w.u.luis, await saveBall(w.u.ana), withKey({ v: 2 })), 'invalido');
    expect((await ballRow(id)).design).toBeNull();
  });

  it('100 cambios por día a sus bolas (los mismos de save_ball); poner el mismo diseño no cuenta ni choca con el límite', async () => {
    const id = await saveBall(w.u.luis);
    const hits = async () => (await db.admin<{ hits: number }>('select hits from private.rate_limits where key = $1', [`balls:${w.u.luis}`]))[0].hits;
    const before = await hits();
    await setDesign(w.u.luis, id, FULL);
    expect(await hits()).toBe(before + 1);
    await setDesign(w.u.luis, id, FULL);
    expect(await hits()).toBe(before + 1);
    await db.admin('update private.rate_limits set hits = 100 where key = $1', [`balls:${w.u.luis}`]);
    // El mismo (reintento): sale bien sin contar.
    expect(await setDesign(w.u.luis, id, FULL)).toEqual(FULL);
    await fails(setDesign(w.u.luis, id, withKey({ angle: 90 })), 'rate_limited');
    await fails(saveBall(w.u.luis, { p_name: 'Otra' }), 'rate_limited');
    expect((await ballRow(id)).design).toEqual(FULL);
    await db.admin(`update private.rate_limits set window_start = now() - interval '25 hours' where key = $1`, [`balls:${w.u.luis}`]);
    await setDesign(w.u.luis, id, withKey({ angle: 90 }));
    expect((await ballRow(id)).design.angle).toBe(90);
  });

  it('el mismo diseño con otro color en la bola (lo cambió save_ball) sí vuelve a poner el color base', async () => {
    const id = await saveBall(w.u.luis);
    await setDesign(w.u.luis, id, FULL);
    await saveBall(w.u.luis, { p_id: id, p_color: '#16a34a' });
    expect(await ballRow(id)).toMatchObject({ color: '#16a34a', design: FULL });
    await setDesign(w.u.luis, id, FULL);
    expect((await ballRow(id)).color).toBe('#0b1026');
  });
});

describe('la revisión es la misma en el teléfono y en la base', () => {
  const cases: [string, unknown][] = [
    ['completo', FULL],
    ['el de una bola sin diseño', defaultBallDesign('#1d4ed8')],
    ['perlada de la cubierta', defaultBallDesign('#7c3aed', 'perlada')],
    ['los bordes de cada rango', withKey({ scale: 0.5, softness: 0, angle: 0 })],
    ['los otros bordes', withKey({ scale: 2, softness: 1, angle: 360, stickers: [{ ...FULL.stickers[0], x: -1, y: 1, size: 0.1, rotation: 360 }] })],
    ['figuras al tope', withSticker(0, { x: 1, y: -1, size: 0.6, rotation: 0 })],
    ['sin figuras, colores null', withKey({ second: null, third: null, stickers: [] })],
    ['iniciales con Ñ y tildes', withSticker(2, { text: 'ÑÜÉ' })],
    ['número de una cifra', withSticker(1, { text: '0' })],
    // No valen:
    ['un arreglo', []],
    ['un texto', 'solida'],
    ['un número', 1],
    ['null', null],
    ['falta una clave', without(FULL, 'angle')],
    ['una clave de más', withKey({ seed: 3 })],
    ['v = 2', withKey({ v: 2 })],
    ['v en texto', withKey({ v: '1' })],
    ['base en mayúsculas', withKey({ base: '#0B1026' })],
    ['base corta', withKey({ base: '#fff' })],
    ['base null', withKey({ base: null })],
    ['second vacío', withKey({ second: '' })],
    ['third un número', withKey({ third: 5 })],
    ['dibujo que no existe', withKey({ pattern: 'rayas' })],
    ['dibujo en mayúsculas', withKey({ pattern: 'Galaxia' })],
    ['scale muy chica', withKey({ scale: 0.49 })],
    ['scale muy grande', withKey({ scale: 2.01 })],
    ['scale en texto', withKey({ scale: '1' })],
    ['softness negativa', withKey({ softness: -0.1 })],
    ['angle de más', withKey({ angle: 361 })],
    ['angle negativo', withKey({ angle: -1 })],
    ['shine en texto', withKey({ shine: 'true' })],
    ['holes null', withKey({ holes: null })],
    ['stickers objeto', withKey({ stickers: {} })],
    ['stickers null', withKey({ stickers: null })],
    ['seis figuras', withKey({ stickers: [...FULL.stickers, FULL.stickers[0]] })],
    ['figura null', withKey({ stickers: [null] })],
    ['figura texto', withKey({ stickers: ['estrella'] })],
    ['figura que no existe', withSticker(0, { shape: 'unicornio' })],
    ['figura con clave de más', withSticker(0, { font: 'Arial' })],
    ['figura sin color', withKey({ stickers: [without(FULL.stickers[0], 'color')] })],
    ['texto en una estrella', withSticker(0, { text: '1' })],
    ['número sin texto', withKey({ stickers: [without(FULL.stickers[1], 'text')] })],
    ['número con letras', withSticker(1, { text: 'abc' })],
    ['número de cuatro cifras', withSticker(1, { text: '1234' })],
    ['número vacío', withSticker(1, { text: '' })],
    ['número como número', withSticker(1, { text: 7 })],
    ['número null', withSticker(1, { text: null })],
    ['iniciales en minúsculas', withSticker(2, { text: 'ab' })],
    ['iniciales con marcado', withSticker(2, { text: '<b>' })],
    ['iniciales con espacio', withSticker(2, { text: 'A B' })],
    ['iniciales con comillas', withSticker(2, { text: '"A' })],
    ['iniciales de cuatro letras', withSticker(2, { text: 'ABCD' })],
    ['iniciales con tilde suelta (sin juntar)', withSticker(2, { text: 'Á' })],
    ['color de figura corto', withSticker(0, { color: '#fc0' })],
    ['x de más', withSticker(0, { x: 1.5 })],
    ['y de menos', withSticker(0, { y: -1.01 })],
    ['figura muy chica', withSticker(0, { size: 0.05 })],
    ['figura muy grande', withSticker(0, { size: 0.61 })],
    ['rotación negativa', withSticker(0, { rotation: -1 })],
    ['rotación en texto', withSticker(0, { rotation: '90' })],
  ];

  it('caso por caso', async () => {
    const got = await sqlOk(cases.map(([, x]) => JSON.stringify(x)));
    const want = cases.map(([, x]) => ballDesignProblem(x) === null);
    expect(cases.map(([name], i) => [name, got[i]])).toEqual(cases.map(([name], i) => [name, want[i]]));
    // Y los que valen son justo los primeros nueve.
    expect(want.filter(Boolean)).toHaveLength(9);
    expect(want.slice(0, 9).every(Boolean)).toBe(true);
  });

  it('4 kB o más no vale (un número larguísimo que JavaScript ni siquiera guarda); 1.0 es 1 en los dos', async () => {
    const text = JSON.stringify(FULL);
    const long = text.replace('"scale":1.25', `"scale":1.${'0'.repeat(4100)}1`);
    const almost = text.replace('"scale":1.25', `"scale":1.${'0'.repeat(200)}1`);
    const decimals = text.replace('"v":1,', '"v":1.0,').replace('"angle":45', '"angle":45.000');
    expect(await sqlOk([long, almost, decimals])).toEqual([false, true, true]);
    expect([long, decimals].map((t) => ballDesignProblem(JSON.parse(t)))).toEqual([null, null]);
  });

  it('lo que arregla normalizeBallDesign siempre se puede guardar (y el teléfono dice lo mismo)', async () => {
    const messy: unknown[] = [
      null,
      'galaxia',
      {},
      { base: '#ABC', second: 'RED', third: '#FFFFFF', pattern: 'nada', scale: 99, softness: -3, angle: -30, shine: 1, holes: 'no' },
      { ...FULL, v: 7, extra: true, stickers: [...FULL.stickers, ...FULL.stickers] },
      { ...FULL, stickers: [{ shape: 'numero', text: '12a34', color: '#000', x: 9, y: -9, size: 2, rotation: 725 }, { shape: 'iniciales', text: 'ñé<b>z', color: 'x' }] },
      { ...FULL, stickers: [{ shape: 'numero', text: 'abc' }, { shape: 'iniciales', text: '---' }, { shape: 'estrella', text: 'hola' }, 'x', null] },
      { base: '#123456', scale: '1.5', softness: '0.25', angle: 359.6, stickers: [{ shape: 'rayo', x: 0.12345678, y: '0.5', size: 0.3333333, rotation: 12.7 }] },
    ];
    const fixed = messy.map((x) => normalizeBallDesign(x, '#dc2626'));
    for (const d of fixed) expect(ballDesignProblem(d)).toBeNull();
    expect(await sqlOk(fixed.map((d) => JSON.stringify(d)))).toEqual(fixed.map(() => true));
    // Y una figura nueva de cada tipo, también.
    const d = defaultBallDesign('#111827');
    for (const shape of ['estrella', 'llama', 'rayo', 'corazon', 'calavera'] as const) d.stickers.push(newSticker(shape, d));
    expect(await sqlOk([JSON.stringify(d), JSON.stringify({ ...d, stickers: [newSticker('numero', d), newSticker('iniciales', d, 'Ana')] })])).toEqual([true, true]);
  });
});

describe('datos de la cuenta y la prueba de humo', () => {
  it('el diseño sale en «Descargar mis datos» y se va con la bola', async () => {
    const id = await saveBall(w.u.luis);
    await setDesign(w.u.luis, id, FULL);
    const d = await db.rpc<Json>(w.u.luis, 'export_my_data');
    expect(d.tables.bowling_balls).toEqual([expect.objectContaining({ id, design: FULL, color: '#0b1026' })]);
    await db.rpc(w.u.luis, 'delete_ball', { p_id: id });
    expect(await db.count('public.bowling_balls', 'id = $1', [id])).toBe(0);
  });

  it('la prueba de humo cuenta esta migración y tiene su paso', () => {
    const smoke = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'supabase', 'smoke.sql'), 'utf8');
    expect(smoke).toContain(`'20260930000300'`);
    expect(smoke).toContain(`ok('mis bolas: Ana diseña su bola`);
    expect(smoke).toContain('public.set_ball_design(');
  });
});
