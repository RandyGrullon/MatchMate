/**
 * El modo de la app (20261007000100_modo_app.sql): profiles.ui_mode ('lite' | 'pro' | null = automático) con su CHECK,
 * set_ui_mode (solo el propio, valores exactos, null vuelve a automático, el mismo no escribe) y cómo lo lee la app: con
 * el perfil propio (`select …, push_prefs, ui_mode` de fetchProfile en src/lib/auth.tsx) bajo la RLS de profiles. Otra
 * cuenta no lo lee ni lo cambia; sale en export_my_data.
 *
 * Mundo (fixture): luis y ana (liga privada del Banco), extra sin liga; dios es superadmin.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, SERVICE, TestDb, fails } from './harness';
import { makeWorld, type World } from './fixture';

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

const setMode = (who: string, mode: string | null) => db.rpc<string | null>(who, 'set_ui_mode', { p_mode: mode });
const row = async (id: string) => (await db.admin<Json>('select ui_mode from public.profiles where id = $1', [id]))[0];
/** Lo mismo que pide fetchProfile (src/lib/auth.tsx) al abrir la app, con ui_mode al final. */
const CLIENT_COLUMNS = 'id, email, name, is_superadmin, adult_confirmed_at, created_at, username, push_prefs, ui_mode';
const readProfile = (who: string, id: string) => db.as<Json>(who, `select ${CLIENT_COLUMNS} from public.profiles where id = $1`, [id]);

describe('permisos', () => {
  it('set_ui_mode: solo con sesión, security definer, search_path vacío y pasa por require_uid', async () => {
    const rows = await db.admin<Json>(
      `select p.proname as fn, p.prosecdef as definer, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth, p.prosrc like '%private.require_uid()%' as uid,
              'search_path=""' = any (p.proconfig) as path, pg_get_function_identity_arguments(p.oid) as args,
              pg_get_function_result(p.oid) as result
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('export_my_data', 'set_ui_mode') order by 1`,
    );
    expect(rows).toEqual([
      { fn: 'export_my_data', definer: true, anon: false, auth: true, uid: true, path: true, args: '', result: 'jsonb' },
      { fn: 'set_ui_mode', definer: true, anon: false, auth: true, uid: true, path: true, args: 'p_mode text', result: 'text' },
    ]);
    await fails(setMode(ANON, 'pro'), '42501');
  });

  it('nadie escribe ui_mode directo; ni con la clave secreta se guarda otro valor (CHECK)', async () => {
    for (const who of [w.u.luis, w.u.dios]) {
      await fails(db.as(who, `update public.profiles set ui_mode = 'pro' where id = $1`, [who]), '42501');
    }
    for (const bad of ['x', '', 'Pro', 'LITE', ' pro']) {
      await fails(db.asService('update public.profiles set ui_mode = $1 where id = $2', [bad, w.u.luis]), '23514');
    }
    await db.asService(`update public.profiles set ui_mode = 'pro' where id = $1`, [w.u.luis]);
    expect((await row(w.u.luis)).ui_mode).toBe('pro');
  });

  it('cuenta bloqueada: no lo cambia (leerlo sí)', async () => {
    await setMode(w.u.luis, 'pro');
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'prueba' });
    await fails(setMode(w.u.luis, 'lite'), 'bloqueada');
    expect(await readProfile(w.u.luis, w.u.luis)).toEqual([expect.objectContaining({ id: w.u.luis, ui_mode: 'pro' })]);
  });
});

describe('set_ui_mode', () => {
  it('una cuenta nueva empieza en automático (null)', async () => {
    const id = await db.createUser('modo@x.com', 'Modo');
    expect(await readProfile(id, id)).toEqual([expect.objectContaining({ id, ui_mode: null })]);
    for (const u of Object.values(w.u)) expect((await row(u)).ui_mode).toBeNull();
  });

  it('elige Pro o Lite y vuelve a automático con null; devuelve cómo quedó', async () => {
    expect(await setMode(w.u.luis, 'pro')).toBe('pro');
    expect((await row(w.u.luis)).ui_mode).toBe('pro');
    expect(await setMode(w.u.luis, 'lite')).toBe('lite');
    expect((await row(w.u.luis)).ui_mode).toBe('lite');
    expect(await setMode(w.u.luis, null)).toBeNull();
    expect((await row(w.u.luis)).ui_mode).toBeNull();
  });

  it('el mismo que ya tiene no escribe nada (reintentar es seguro)', async () => {
    // Cada UPDATE deja una versión nueva de la fila (otro ctid); updated_at no sirve: en la misma transacción now() no
    // cambia y el trigger lo pisa.
    const ctid = async () => (await db.admin<{ c: string }>('select ctid::text as c from public.profiles where id = $1', [w.u.luis]))[0].c;
    await setMode(w.u.luis, 'pro');
    const before = await ctid();
    expect(await setMode(w.u.luis, 'pro')).toBe('pro');
    expect(await ctid()).toBe(before);
    await setMode(w.u.luis, null);
    const reset = await ctid();
    expect(reset).not.toBe(before);
    expect(await setMode(w.u.luis, null)).toBeNull();
    expect(await ctid()).toBe(reset);
  });

  it('un valor que no es lite ni pro: invalido (y no cambia nada)', async () => {
    await setMode(w.u.luis, 'lite');
    for (const bad of ['', 'x', 'Pro', 'PRO', ' pro', 'lite ', 'auto', 'null']) {
      await fails(setMode(w.u.luis, bad), 'invalido');
    }
    expect((await row(w.u.luis)).ui_mode).toBe('lite');
  });

  it('solo cambia el de quien llama: ni otra cuenta ni el superadmin tocan el de luis', async () => {
    await setMode(w.u.luis, 'pro');
    await setMode(w.u.ana, 'lite');
    await setMode(w.u.dios, 'pro');
    expect((await row(w.u.luis)).ui_mode).toBe('pro');
    expect((await row(w.u.ana)).ui_mode).toBe('lite');
    expect((await row(w.u.dios)).ui_mode).toBe('pro');
    // La RPC no recibe a quién: un argumento de más no existe.
    await fails(db.rpc(w.u.ana, 'set_ui_mode', { p_mode: 'lite', p_user: w.u.luis }), '42883');
    expect((await row(w.u.luis)).ui_mode).toBe('pro');
  });

  it('sin perfil (el registro no alcanzó a crearlo): no_existe', async () => {
    const id = await db.createUser('sinperfil@x.com', 'Sin Perfil');
    await db.admin('delete from public.profiles where id = $1', [id]);
    await fails(setMode(id, 'pro'), 'no_existe');
  });
});

describe('leer el modo', () => {
  it('la app lo lee con su perfil (las mismas columnas de fetchProfile + ui_mode)', async () => {
    await setMode(w.u.luis, 'pro');
    expect(await readProfile(w.u.luis, w.u.luis)).toEqual([
      expect.objectContaining({ id: w.u.luis, email: 'luis@x.com', push_prefs: {}, ui_mode: 'pro' }),
    ]);
  });

  it('otra cuenta no lo lee: ni la fila de profiles ni por las RPC que muestran a otros', async () => {
    await setMode(w.u.luis, 'pro');
    // La RLS solo deja la fila propia: ana (comparte liga) y extra (sin liga) no ven nada de luis.
    for (const who of [w.u.ana, w.u.extra]) {
      expect(await readProfile(who, w.u.luis)).toEqual([]);
      expect(await db.as(who, 'select ui_mode from public.profiles where ui_mode is not null')).toEqual([]);
      expect(await db.as<Json>(who, 'select id from public.profiles')).toEqual([{ id: who }]);
    }
    // Sin cuenta: ni el GRANT.
    await fails(db.as(ANON, 'select ui_mode from public.profiles'), '42501');
    // Lo que sí ve de otra cuenta no trae el modo.
    const seen = [
      await db.rpc<Json>(w.u.ana, 'public_profile', { p_user: w.u.luis }),
      await db.rpc<Json[]>(w.u.ana, 'search_people', { p_query: 'luis' }),
    ];
    expect(seen[0]).toMatchObject({ username: 'luis' });
    expect(JSON.stringify(seen)).not.toMatch(/ui_?mode/i);
  });

  it('el superadmin lo ve como el resto del perfil (como el correo); la clave secreta también', async () => {
    await setMode(w.u.luis, 'lite');
    expect(await readProfile(w.u.dios, w.u.luis)).toEqual([expect.objectContaining({ id: w.u.luis, ui_mode: 'lite' })]);
    expect(await db.as(SERVICE, 'select ui_mode from public.profiles where id = $1', [w.u.luis])).toEqual([{ ui_mode: 'lite' }]);
  });

  it('sale en «Descargar mis datos» (export_my_data: account.uiMode), solo el propio', async () => {
    expect((await db.rpc<Json>(w.u.luis, 'export_my_data')).account).toMatchObject({ id: w.u.luis, uiMode: null, pushPrefs: {} });
    await setMode(w.u.luis, 'pro');
    await setMode(w.u.ana, 'lite');
    const d = await db.rpc<Json>(w.u.luis, 'export_my_data');
    expect(d.account).toMatchObject({ id: w.u.luis, email: 'luis@x.com', username: 'luis', uiMode: 'pro' });
    expect(d.format).toBe('matchmate-mis-datos');
    expect((await db.rpc<Json>(w.u.ana, 'export_my_data')).account.uiMode).toBe('lite');
  });
});
