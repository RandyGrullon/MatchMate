/**
 * La cuenta y sus datos (20260927001500_cuenta.sql): «tengo 18 años o más» (confirm_adult), bajar mis datos
 * (export_my_data), borrar la cuenta (prepare_delete_account + el borrado en auth.users que hace la Edge Function
 * delete-account, con private.forget_user) y los errores de los teléfonos (log_client_error, admin_client_errors,
 * admin_clear_client_errors).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, SERVICE, TestDb, fails } from './harness';
import { makeWorld, member, type World } from './fixture';

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

type Json = Record<string, any>;

const NEW_RPC = ['admin_clear_client_errors', 'admin_client_errors', 'confirm_adult', 'export_my_data', 'log_client_error', 'prepare_delete_account'];

/** Lo que hace GoTrue al borrar la cuenta con la API de administración (y el manejador local). */
const deleteAuthUser = (uid: string) => db.admin('delete from auth.users where id = $1', [uid]);

const logError = (who: string, args: Record<string, unknown> = {}) =>
  db.rpc<boolean>(who, 'log_client_error', { p_kind: 'error', p_message: 'TypeError: x is undefined', ...args });

describe('permisos de lo nuevo', () => {
  it('solo con sesión, security definer, search_path vacío; nada para anon', async () => {
    const rows = await db.admin<{ fn: string; definer: boolean; auth: boolean; anon: boolean; sp: boolean }>(
      `select p.proname as fn, p.prosecdef as definer, has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('anon', p.oid, 'execute') as anon, 'search_path=""' = any (p.proconfig) as sp
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1) order by 1`,
      [NEW_RPC],
    );
    expect(rows).toEqual(NEW_RPC.map((fn) => ({ fn, definer: true, auth: true, anon: false, sp: true })));
    for (const fn of NEW_RPC) await fails(db.rpc(ANON, fn, fn === 'log_client_error' ? { p_kind: 'error', p_message: 'x' } : {}), '42501');
    // Las ayudas no las ejecuta nadie de la app.
    for (const fn of ['export_hidden_columns()', 'forget_user()', 'release_storage_owner()', 'clean_line(text, integer)', 'error_fingerprint(text, text, text)']) {
      expect(await db.admin(`select has_function_privilege('authenticated', 'private.${fn}', 'execute') as ok`)).toEqual([{ ok: false }]);
    }
  });

  it('una cuenta bloqueada no confirma, no baja datos, no prepara el borrado ni reporta errores', async () => {
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'x' });
    await fails(db.rpc(w.u.luis, 'confirm_adult'), 'bloqueada');
    await fails(db.rpc(w.u.luis, 'export_my_data'), 'bloqueada');
    await fails(db.rpc(w.u.luis, 'prepare_delete_account'), 'bloqueada');
    await fails(logError(w.u.luis), 'bloqueada');
  });
});

describe('tengo 18 años o más', () => {
  it('llena adult_confirmed_at una vez (la primera hora se queda)', async () => {
    const read = async () => (await db.admin<{ at: Date | null }>('select adult_confirmed_at as at from public.profiles where id = $1', [w.u.luis]))[0].at;
    expect(await read()).toBeNull();
    await db.rpc(w.u.luis, 'confirm_adult');
    const first = await read();
    expect(first).not.toBeNull();
    await db.admin(`update public.profiles set adult_confirmed_at = now() - interval '3 days' where id = $1`, [w.u.luis]);
    const old = await read();
    await db.rpc(w.u.luis, 'confirm_adult');
    expect(await read()).toEqual(old);
    // Solo la propia cuenta: a los demás no les cambia nada.
    expect(await db.count('public.profiles', 'adult_confirmed_at is not null')).toBe(1);
    // La cuenta ve su marca (el cliente la lee para no mostrar otra vez la pantalla).
    expect(await db.asUser(w.u.luis, 'select adult_confirmed_at is not null as ok from public.profiles')).toEqual([{ ok: true }]);
  });

  it('el registro con correo (adult: true) ya viene confirmado; con Google no', async () => {
    const mail = await db.createUser('mail@x.com', 'Mail', { adult: true });
    const google = await db.createUser('google@x.com', null, { full_name: 'Google Person' });
    expect(await db.admin('select id, adult_confirmed_at is not null as ok from public.profiles where id = any ($1) order by email', [[mail, google]])).toEqual([
      { id: google, ok: false },
      { id: mail, ok: true },
    ]);
  });

  it('sin perfil: no_existe', async () => {
    const ghost = randomUUID();
    await fails(db.rpc(ghost, 'confirm_adult'), 'no_existe');
  });
});

describe('bajar mis datos', () => {
  it('trae su cuenta, sus ligas, sus jugadores y lo que cuelga de ellos (nada de otros)', async () => {
    await db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, ua) values ($1, 'https://fcm.googleapis.com/fcm/send/l', 'BPclave', 'secreto', 'Android')`, [w.u.luis]);
    await db.admin(`insert into public.player_private (player_id, league_id, birth_year, sex) values ($1, $2, 1990, 'M')`, [w.p.luis, w.priv]);
    await db.rpc(w.u.ana, 'add_comment', { p_entry: w.e1Luis, p_text: 'Buen juego' });
    await db.rpc(w.u.luis, 'add_comment', { p_entry: w.e1Luis, p_text: 'Gracias' });
    await db.rpc(w.u.luis, 'touch_seen');
    await logError(w.u.luis);

    const d = await db.rpc<Json>(w.u.luis, 'export_my_data');
    expect(d.format).toBe('matchmate-mis-datos');
    expect(d.version).toBe(1);
    expect(d.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(d.account).toMatchObject({ id: w.u.luis, email: 'luis@x.com', name: 'luis', superadmin: false, blockedAt: null, adultConfirmedAt: null });
    expect(d.leagues).toEqual([
      expect.objectContaining({ leagueId: w.priv, name: 'Liga del Banco', sport: 'bowling', role: 'member', displayName: 'luis', scorer: false }),
    ]);
    expect(d.players).toEqual([expect.objectContaining({ id: w.p.luis, leagueId: w.priv, leagueName: 'Liga del Banco', name: 'Luis' })]);

    const t = d.tables as Record<string, Json[]>;
    expect(t.entries.map((e) => e.id)).toEqual([w.e1Luis]);
    expect(t.entries[0].scores).toEqual([150]);
    // Los datos que el admin guardó de su jugador también son suyos.
    expect(t.player_private).toEqual([expect.objectContaining({ player_id: w.p.luis, birth_year: 1990, sex: 'M' })]);
    // Comentarios: solo los que escribió (el de Ana en su juego no es de él).
    expect(t.comments.map((c) => c.text)).toEqual(['Gracias']);
    // Teléfonos sin las claves del push.
    expect(t.push_subscriptions).toHaveLength(1);
    expect(t.push_subscriptions[0]).toMatchObject({ ua: 'Android', user_id: w.u.luis });
    expect(t.push_subscriptions[0]).not.toHaveProperty('p256dh');
    expect(t.push_subscriptions[0]).not.toHaveProperty('auth');
    expect(t.push_subscriptions[0]).not.toHaveProperty('endpoint');
    expect(t.client_errors).toHaveLength(1);
    // Nada de otras cuentas ni de otros jugadores; las tablas internas no salen.
    const all = JSON.stringify(d);
    expect(all).not.toContain(w.p.pedro);
    expect(all).not.toContain(w.u.org);
    expect(all).not.toContain('Buen juego');
    expect(t).not.toHaveProperty('push_outbox');
    expect(t).not.toHaveProperty('league_members');
    expect(d.daysSeen).toHaveLength(1);
    expect(d.truncated).toEqual([]);
  });

  it('una cuenta sin ligas: vacío pero completo', async () => {
    const d = await db.rpc<Json>(w.u.nuevo, 'export_my_data');
    expect(d.account.email).toBe('new@x.com');
    expect(d.leagues).toEqual([]);
    expect(d.players).toEqual([]);
    expect(d.matches).toEqual([]);
    expect(d.tables).toEqual({});
  });

  it('como mucho 5 por hora', async () => {
    for (let i = 0; i < 5; i++) await db.rpc(w.u.luis, 'export_my_data');
    await fails(db.rpc(w.u.luis, 'export_my_data'), 'rate_limited');
    // Otra cuenta no se ve afectada.
    await db.rpc(w.u.ana, 'export_my_data');
    await db.admin(`update private.rate_limits set window_start = now() - interval '2 hours' where key = $1`, [`export:u:${w.u.luis}`]);
    await db.rpc(w.u.luis, 'export_my_data');
  });
});

describe('borrar la cuenta', () => {
  it('un miembro sin ligas a su nombre puede', async () => {
    const plan = await db.rpc<Json>(w.u.luis, 'prepare_delete_account');
    expect(plan).toEqual({
      canDelete: true,
      blockers: [],
      ownedLeagues: [],
      summary: { leagues: 1, players: 1, comments: 0, reactions: 0, devices: 0 },
    });
  });

  it('el dueño primero pasa o borra sus ligas (con la lista de a quién)', async () => {
    const plan = await db.rpc<Json>(w.u.org, 'prepare_delete_account');
    expect(plan.canDelete).toBe(false);
    expect(plan.blockers).toEqual(['owned_leagues']);
    expect(plan.ownedLeagues).toEqual([
      {
        id: w.priv,
        name: 'Liga del Banco',
        sport: 'bowling',
        kind: 'liga',
        memberCount: 3,
        // Los admins primero.
        members: [
          { userId: w.u.sofi, name: 'sofi', role: 'admin' },
          { userId: w.u.ana, name: 'ana', role: 'member' },
          { userId: w.u.luis, name: 'luis', role: 'member' },
        ],
      },
    ]);
    // Borrar la cuenta así falla (la base no deja: leagues.owner_id).
    await fails(deleteAuthUser(w.u.org), ['23001', '23503']);

    // Pasa la liga a sofi: ya puede.
    await db.rpc(w.u.org, 'transfer_ownership', { p_league: w.priv, p_user: w.u.sofi });
    expect((await db.rpc<Json>(w.u.org, 'prepare_delete_account')).canDelete).toBe(true);
    await deleteAuthUser(w.u.org);
    expect(await db.count('public.profiles', 'id = $1', [w.u.org])).toBe(0);
    expect(await db.admin('select owner_id from public.leagues where id = $1', [w.priv])).toEqual([{ owner_id: w.u.sofi }]);
  });

  it('una liga donde está solo: la borra y listo', async () => {
    const own = await db.rpc<Json>(w.u.nuevo, 'create_league', { p_name: 'Mía' });
    const plan = await db.rpc<Json>(w.u.nuevo, 'prepare_delete_account');
    expect(plan.ownedLeagues).toEqual([expect.objectContaining({ id: own.league_id, name: 'Mía', memberCount: 0, members: [] })]);
    await db.rpc(w.u.nuevo, 'delete_league', { p_league: own.league_id });
    expect((await db.rpc<Json>(w.u.nuevo, 'prepare_delete_account')).canDelete).toBe(true);
  });

  it('el último superadmin no puede (la app se quedaría sin dueño)', async () => {
    expect((await db.rpc<Json>(w.u.dios, 'prepare_delete_account')).canDelete).toBe(true);
    await db.admin('update public.profiles set is_superadmin = false where id = $1', [w.u.dios2]);
    const plan = await db.rpc<Json>(w.u.dios, 'prepare_delete_account');
    expect(plan).toMatchObject({ canDelete: false, blockers: ['last_superadmin'] });
  });

  it('al borrarse: se va todo lo suyo, sus jugadores quedan sin cuenta con sus resultados', async () => {
    await db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/fcm/send/l', 'k', 's')`, [w.u.luis]);
    await db.rpc(w.u.luis, 'add_comment', { p_entry: w.e1Luis, p_text: 'Gracias' });
    await db.rpc(w.u.luis, 'set_reaction', { p_entry: w.e1Luis, p_type: 'like' });
    await db.rpc(w.u.luis, 'touch_seen');
    await db.rpc(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_scores: [180], p_event: w.e.e1 });
    await logError(w.u.luis);
    await db.rpc(w.u.luis, 'export_my_data');
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'prueba' });
    await db.rpc(w.u.dios, 'admin_unblock_user', { p_user: w.u.luis });
    expect(await db.count('private.op_log', 'user_id = $1', [w.u.luis])).toBe(1);
    expect(await db.count('private.paces', 'user_id = $1', [w.u.luis])).toBeGreaterThan(0);
    expect(await db.count('private.rate_limits', `key like '%' || $1`, [w.u.luis])).toBeGreaterThan(0);

    await deleteAuthUser(w.u.luis);

    expect(await db.count('public.profiles', 'id = $1', [w.u.luis])).toBe(0);
    expect(await db.count('public.league_members', 'user_id = $1', [w.u.luis])).toBe(0);
    expect(await db.count('public.comments', 'user_id = $1', [w.u.luis])).toBe(0);
    expect(await db.count('public.reactions', 'user_id = $1', [w.u.luis])).toBe(0);
    expect(await db.count('public.push_subscriptions', 'user_id = $1', [w.u.luis])).toBe(0);
    expect(await db.count('public.client_errors', 'user_id = $1', [w.u.luis])).toBe(0);
    expect(await db.count('private.daily_seen', 'user_id = $1', [w.u.luis])).toBe(0);
    expect(await db.count('private.op_log', 'user_id = $1', [w.u.luis])).toBe(0);
    expect(await db.count('private.paces', 'user_id = $1', [w.u.luis])).toBe(0);
    expect(await db.count('private.rate_limits', `key like '%' || $1`, [w.u.luis])).toBe(0);
    // Su jugador sigue en la liga (sin cuenta) con su juego y su envío.
    expect(await db.admin('select name, user_id from public.players where id = $1', [w.p.luis])).toEqual([{ name: 'Luis', user_id: null }]);
    expect(await db.count('public.entries', 'id = $1', [w.e1Luis])).toBe(1);
    expect(await db.count('public.submissions', 'player_id = $1', [w.p.luis])).toBe(1);
    // La auditoría queda sin su nombre ni su correo, y anota que la cuenta se borró.
    const audit = await db.admin<{ action: string; detail: Json }>(
      `select action, detail from public.admin_audit where target_id = $1 order by id`,
      [w.u.luis],
    );
    expect(audit.map((a) => a.action)).toEqual(['block_user', 'unblock_user', 'delete_account']);
    for (const a of audit) {
      expect(a.detail).not.toHaveProperty('name');
      expect(a.detail).not.toHaveProperty('email');
    }
    expect(audit[0].detail).toMatchObject({ reason: 'prueba' });
    expect(audit[2].detail.createdAt).toMatch(/Z$/);
  });

  it('sus fotos de Storage siguen en la liga, sin dueño (Supabase no deja borrar a quien es dueño de archivos)', async () => {
    // Como en Supabase: owner con FK a auth.users y owner_id en texto.
    await db.admin(`alter table storage.objects add column owner_id text`);
    await db.admin(`alter table storage.objects add constraint t_objects_owner_fkey foreign key (owner) references auth.users (id)`);
    await db.admin(`insert into storage.buckets (id, name) values ('scoreboards', 'scoreboards') on conflict do nothing`);
    const mine = `${w.priv}/${randomUUID()}.webp`;
    const other = `${w.priv}/${randomUUID()}.webp`;
    await db.admin(`insert into storage.objects (bucket_id, name, owner, owner_id) values ('scoreboards', $1, $2::uuid, $3), ('scoreboards', $4, $5::uuid, $6)`, [
      mine,
      w.u.luis,
      w.u.luis,
      other,
      w.u.org,
      w.u.org,
    ]);
    await deleteAuthUser(w.u.luis);
    expect(await db.admin('select name, owner, owner_id from storage.objects order by name = $1 desc', [mine])).toEqual([
      { name: mine, owner: null, owner_id: null },
      { name: other, owner: w.u.org, owner_id: w.u.org },
    ]);
  });

  it('el mínimo del shim (sin owner_id) también', async () => {
    await db.admin(`insert into storage.buckets (id, name) values ('scoreboards', 'scoreboards') on conflict do nothing`);
    await db.admin(`insert into storage.objects (bucket_id, name, owner) values ('scoreboards', 'x/y.webp', $1)`, [w.u.luis]);
    await deleteAuthUser(w.u.luis);
    expect(await db.admin('select owner from storage.objects')).toEqual([{ owner: null }]);
  });

  it('traspasos y ligas borradas por un superadmin quedan sin el nombre de la cuenta borrada', async () => {
    await db.rpc(w.u.dios, 'transfer_ownership', { p_league: w.priv, p_user: w.u.sofi });
    const lid = (await db.rpc<Json>(w.u.nuevo, 'create_league', { p_name: 'Otra' })).league_id;
    await db.rpc(w.u.dios, 'delete_league', { p_league: lid });
    await deleteAuthUser(w.u.org);
    await deleteAuthUser(w.u.nuevo);
    const rows = await db.admin<{ action: string; detail: Json }>(`select action, detail from public.admin_audit where action in ('transfer_league', 'delete_league') order by id`);
    expect(rows[0].detail).not.toHaveProperty('fromName');
    expect(rows[0].detail).toMatchObject({ toName: 'sofi', from: w.u.org, to: w.u.sofi });
    expect(rows[1].detail).not.toHaveProperty('ownerName');
    expect(rows[1].detail).toMatchObject({ name: 'Otra', ownerId: w.u.nuevo });
  });
});

describe('errores de los teléfonos', () => {
  it('guarda, recorta y limpia lo que llega', async () => {
    expect(
      await logError(w.u.luis, {
        p_kind: ' Render ',
        p_message: `  Falló\u0007 la pantalla ${'x'.repeat(600)}`,
        p_stack: `Error: x\n    at A (index.js:1:2)\u0001\n${'y'.repeat(5000)}`,
        p_route: '/l/abc/ranking',
        p_component: 'liga/ranking',
        p_ua: 'Mozilla/5.0 '.repeat(40),
        p_app_version: 'index-AbC123',
      }),
    ).toBe(true);
    const [r] = await db.admin<Json>('select * from public.client_errors');
    expect(r.kind).toBe('render');
    expect(r.message.startsWith('Falló la pantalla')).toBe(true);
    expect(r.message).toHaveLength(500);
    expect(r.stack.startsWith('Error: x\n    at A (index.js:1:2)\n')).toBe(true);
    expect(r.stack).toHaveLength(4000);
    expect(r.ua.length).toBeLessThanOrEqual(300);
    expect(r).toMatchObject({ route: '/l/abc/ranking', component: 'liga/ranking', app_version: 'index-AbC123', hits: 1, user_id: w.u.luis });
    expect(r.fingerprint).toMatch(/^[0-9a-f]{32}$/);
    // Mensaje vacío: se guarda igual (con un texto que lo dice). Tipo que no existe: invalido.
    await logError(w.u.ana, { p_message: '   ' });
    expect(await db.admin(`select message from public.client_errors where user_id = $1`, [w.u.ana])).toEqual([{ message: '(sin mensaje)' }]);
    await fails(logError(w.u.luis, { p_kind: 'warning' }), 'invalido');
  });

  it('el mismo error de la misma cuenta suma en la misma fila (otro id o número en el mensaje también)', async () => {
    await logError(w.u.luis, { p_message: `No existe ${randomUUID()} (fila 12)`, p_route: '/a' });
    await logError(w.u.luis, { p_message: `No existe ${randomUUID()} (fila 99)`, p_route: '/b', p_app_version: 'v2' });
    await logError(w.u.ana, { p_message: `No existe ${randomUUID()} (fila 1)` });
    const rows = await db.admin<Json>('select user_id, hits, route, app_version, fingerprint from public.client_errors order by user_id = $1 desc', [w.u.luis]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ user_id: w.u.luis, hits: 2, route: '/b', app_version: 'v2' });
    expect(rows[1]).toMatchObject({ user_id: w.u.ana, hits: 1 });
    expect(rows[0].fingerprint).toBe(rows[1].fingerprint);
    // Otra pantalla u otro tipo = otro error.
    await logError(w.u.luis, { p_message: `No existe ${randomUUID()}`, p_component: 'home' });
    await logError(w.u.luis, { p_kind: 'promise', p_message: `No existe ${randomUUID()}` });
    expect(await db.count('public.client_errors', 'user_id = $1', [w.u.luis])).toBe(3);
    // Pasadas 24 h, el mismo error abre una fila nueva.
    await db.admin(`update public.client_errors set last_at = now() - interval '25 hours'`);
    await logError(w.u.luis, { p_message: `No existe ${randomUUID()} (fila 5)`, p_route: '/c' });
    expect(await db.count('public.client_errors', 'user_id = $1', [w.u.luis])).toBe(4);
  });

  it('topes: 20 por hora por cuenta y 1000 nuevos al día entre todos (sin fallar)', async () => {
    for (let i = 0; i < 20; i++) expect(await logError(w.u.luis, { p_message: `error ${String.fromCharCode(97 + i)}` })).toBe(true);
    expect(await logError(w.u.luis, { p_message: 'uno más' })).toBe(false);
    expect(await db.count('public.client_errors', 'user_id = $1', [w.u.luis])).toBe(20);
    // La cuenta del tope quedó guardada (no se deshizo con un error).
    expect(await db.admin('select hits from private.rate_limits where key = $1', [`err:u:${w.u.luis}`])).toEqual([{ hits: 20 }]);

    await db.admin(`insert into private.rate_limits (key, window_start, hits) values ('err:all', now(), 1000)
                    on conflict (key) do update set hits = 1000, window_start = now()`);
    expect(await logError(w.u.ana, { p_message: 'nuevo' })).toBe(false);
    expect(await db.count('public.client_errors', 'user_id = $1', [w.u.ana])).toBe(0);
    // Uno que ya estaba (misma cuenta, 24 h) igual suma.
    await db.admin(`update private.rate_limits set hits = 0 where key = 'err:all'`);
    await logError(w.u.ana, { p_message: 'nuevo' });
    await db.admin(`update private.rate_limits set hits = 1000 where key = 'err:all'`);
    expect(await logError(w.u.ana, { p_message: 'nuevo' })).toBe(true);
    expect(await db.admin('select hits from public.client_errors where user_id = $1', [w.u.ana])).toEqual([{ hits: 2 }]);
  });

  it('lo de más de 30 días se borra al guardar', async () => {
    await logError(w.u.ana, { p_message: 'viejo' });
    await db.admin(`update public.client_errors set at = now() - interval '40 days', last_at = now() - interval '40 days'`);
    await logError(w.u.luis, { p_message: 'nuevo' });
    expect(await db.admin('select message from public.client_errors')).toEqual([{ message: 'nuevo' }]);
  });

  it('nunca más de 5000 filas: sale lo más viejo', async () => {
    await db.admin(`insert into public.client_errors (user_id, fingerprint, kind, message, at, last_at)
                    select $1, md5(g::text), 'error', 'viejo ' || g, now() - interval '1 day' - g * interval '1 second',
                           now() - interval '1 day' - g * interval '1 second'
                      from generate_series(1, 5000) g`, [w.u.ana]);
    await logError(w.u.luis, { p_message: 'nuevo' });
    expect(await db.count('public.client_errors')).toBe(5000);
    // Se fue el más viejo (el 5000) y quedó el nuevo.
    expect(await db.count('public.client_errors', `message = 'viejo 5000'`)).toBe(0);
    expect(await db.count('public.client_errors', `message = 'nuevo'`)).toBe(1);
  });

  it('solo el superadmin lee la tabla; nadie escribe directo', async () => {
    await logError(w.u.luis);
    expect(await db.asUser(w.u.luis, 'select id from public.client_errors')).toEqual([]);
    expect(await db.asUser(w.u.org, 'select id from public.client_errors')).toEqual([]);
    expect(await db.asUser(w.u.dios, 'select message from public.client_errors')).toEqual([{ message: 'TypeError: x is undefined' }]);
    await fails(db.asAnon('select id from public.client_errors'), '42501');
    for (const who of [w.u.luis, w.u.dios]) {
      await fails(db.as(who, `insert into public.client_errors (fingerprint, kind, message) values (md5('a'), 'error', 'x')`), '42501');
      await fails(db.as(who, 'delete from public.client_errors'), '42501');
      await fails(db.as(who, `update public.client_errors set hits = 5`), '42501');
    }
    // service_role (respaldos, Edge Functions) sí la lee.
    expect(await db.as(SERVICE, 'select id from public.client_errors')).toHaveLength(1);
  });
});

describe('errores en la consola', () => {
  async function seed() {
    await logError(w.u.luis, { p_message: 'Cannot read properties of undefined (reading "name")', p_route: '/l/1/ranking', p_component: 'liga/ranking', p_app_version: 'v1' });
    await logError(w.u.luis, { p_message: 'Cannot read properties of undefined (reading "name")', p_route: '/l/2/ranking', p_component: 'liga/ranking', p_app_version: 'v2' });
    await logError(w.u.ana, { p_message: 'Cannot read properties of undefined (reading "name")', p_route: '/l/2/ranking', p_component: 'liga/ranking', p_app_version: 'v2' });
    await logError(w.u.ana, { p_kind: 'chunk', p_message: 'Failed to fetch dynamically imported module', p_route: '/cuenta', p_component: 'cuenta' });
    // El chunk es más viejo: el de la tabla va primero.
    await db.admin(`update public.client_errors set last_at = now() - interval '2 hours', at = now() - interval '2 hours' where kind = 'chunk'`);
  }

  it('agrupa por huella, lo más reciente primero, con el último reporte, rutas y versiones', async () => {
    await seed();
    const r = await db.rpc<Json>(w.u.dios, 'admin_client_errors', {});
    expect(r.total).toBe(2);
    expect(r.hits).toBe(4);
    expect(r.users).toBe(2);
    expect(r.rows).toHaveLength(2);
    const [a, b] = r.rows;
    expect(a).toMatchObject({
      kind: 'error',
      message: 'Cannot read properties of undefined (reading "name")',
      component: 'liga/ranking',
      hits: 3,
      reports: 2,
      users: 2,
      route: '/l/2/ranking',
      appVersion: 'v2',
    });
    expect(a.routes).toEqual(['/l/2/ranking']);
    expect(a.versions).toEqual(['v2']);
    expect(['ana', 'luis']).toContain(a.userName);
    expect(a.fingerprint).toMatch(/^[0-9a-f]{32}$/);
    expect(a.lastAt).toMatch(/Z$/);
    expect(b).toMatchObject({ kind: 'chunk', hits: 1, users: 1, userName: 'ana', routes: ['/cuenta'], versions: [] });
  });

  it('filtra por tipo, busca (sin comodines) y pagina', async () => {
    await seed();
    const onlyChunk = await db.rpc<Json>(w.u.dios, 'admin_client_errors', { p_kind: 'chunk' });
    expect(onlyChunk.rows.map((x: Json) => x.kind)).toEqual(['chunk']);
    expect((await db.rpc<Json>(w.u.dios, 'admin_client_errors', { p_search: 'dynamically' })).total).toBe(1);
    expect((await db.rpc<Json>(w.u.dios, 'admin_client_errors', { p_search: 'ranking' })).total).toBe(1);
    expect((await db.rpc<Json>(w.u.dios, 'admin_client_errors', { p_search: '%' })).total).toBe(0);
    const fp = onlyChunk.rows[0].fingerprint;
    expect((await db.rpc<Json>(w.u.dios, 'admin_client_errors', { p_search: fp.toUpperCase() })).rows.map((x: Json) => x.kind)).toEqual(['chunk']);
    const page2 = await db.rpc<Json>(w.u.dios, 'admin_client_errors', { p_limit: 1, p_offset: 1 });
    expect(page2.total).toBe(2);
    expect(page2.rows.map((x: Json) => x.kind)).toEqual(['chunk']);
    // Solo lo de los últimos p_days días.
    await db.admin(`update public.client_errors set last_at = now() - interval '3 days' where kind = 'chunk'`);
    expect((await db.rpc<Json>(w.u.dios, 'admin_client_errors', { p_days: 2 })).total).toBe(1);
    await fails(db.rpc(w.u.dios, 'admin_client_errors', { p_kind: 'otra' }), 'invalido');
  });

  it('borrar un grupo (ya se arregló) o todo, con auditoría', async () => {
    await seed();
    const { rows } = await db.rpc<Json>(w.u.dios, 'admin_client_errors', {});
    expect(await db.rpc(w.u.dios, 'admin_clear_client_errors', { p_fingerprint: rows[0].fingerprint })).toBe(2);
    expect(await db.count('public.client_errors')).toBe(1);
    expect(await db.rpc(w.u.dios, 'admin_clear_client_errors', {})).toBe(1);
    expect(await db.count('public.client_errors')).toBe(0);
    const audit = await db.admin<{ action: string; target_id: string | null; detail: Json; actor_id: string }>(
      `select action, target_id, detail, actor_id from public.admin_audit where action = 'clear_errors' order by id`,
    );
    expect(audit).toEqual([
      { action: 'clear_errors', target_id: rows[0].fingerprint, actor_id: w.u.dios, detail: { deleted: 2, all: false, message: 'Cannot read properties of undefined (reading "name")' } },
      { action: 'clear_errors', target_id: null, actor_id: w.u.dios, detail: { deleted: 1, all: true } },
    ]);
    await fails(db.rpc(w.u.dios, 'admin_clear_client_errors', { p_fingerprint: 'no-es-huella' }), 'invalido');
  });

  it('nadie más que el superadmin', async () => {
    await seed();
    for (const who of [w.u.org, w.u.luis]) {
      await fails(db.rpc(who, 'admin_client_errors', {}), DENIED);
      await fails(db.rpc(who, 'admin_clear_client_errors', {}), DENIED);
    }
    // Los dos iguales de luis van en una fila (hits 2).
    expect(await db.count('public.client_errors')).toBe(3);
  });
});

describe('miembro que era de otra liga', () => {
  it('prepare_delete_account cuenta sus ligas y jugadores de todas', async () => {
    await member(db, w.pub, w.u.luis, 'member', 'Luis P');
    await db.admin('insert into public.players (league_id, name, user_id) values ($1, $2, $3)', [w.pub, 'Luis P', w.u.luis]);
    const plan = await db.rpc<Json>(w.u.luis, 'prepare_delete_account');
    expect(plan.summary).toMatchObject({ leagues: 2, players: 2 });
    const d = await db.rpc<Json>(w.u.luis, 'export_my_data');
    expect(d.leagues.map((l: Json) => l.name).sort()).toEqual(['Liga Abierta', 'Liga del Banco']);
  });
});
