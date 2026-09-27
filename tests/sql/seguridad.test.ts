/**
 * Seguridad del esquema: la RLS se aplica de verdad (canario), nada queda abierto por accidente
 * (recorre pg_class y pg_proc) y un visitante sin cuenta no escribe en ninguna tabla.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, SERVICE, TestDb, fails } from './harness';
import { makeWorld, type World } from './fixture';

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

/** RPC que la app llama con sesión (el contrato de supabase/README.md). */
const RPC_AUTHENTICATED = [
  'add_comment', 'add_entries', 'add_photo', 'add_practice_game', 'add_team', 'apply_teams', 'approve_submission', 'claim_player',
  'create_event', 'create_league', 'create_player', 'create_tournament', 'delete_comment', 'delete_event', 'delete_league', 'delete_live',
  'delete_old_photos', 'delete_player', 'delete_push_subscription', 'delete_reaction', 'delete_suggestion', 'delete_team', 'ensure_my_player',
  'ensure_profile', 'invite_preview', 'join_league', 'leave_league', 'link_account_to_player', 'mark_suggestions_read', 'publish_live',
  'reject_submission', 'remove_entry', 'remove_member', 'rename_profile', 'rename_team', 'renew_invite_code', 'save_game',
  'save_verified_games', 'send_suggestion', 'set_member_role', 'set_member_scorer', 'set_player_private', 'set_reaction', 'set_rsvp',
  'set_sport_status', 'set_submission_scan', 'set_superadmin', 'step_down_admin', 'submit_games', 'transfer_ownership', 'unlink_account',
  'update_entries', 'update_entry', 'update_event', 'update_league', 'update_player', 'upsert_push_subscription',
].sort();

/** Lo único security definer que un visitante sin cuenta puede ejecutar. */
const ANON_ALLOWED = ['private.readable_leagues', 'public.invite_preview'];

describe('canario: la RLS se aplica en PGlite', () => {
  it('como authenticated no es superusuario y solo ve lo suyo', async () => {
    expect(await db.asUser(w.u.extra, `select current_user as u, (select rolsuper from pg_roles where rolname = current_user) as su`)).toEqual([
      { u: 'authenticated', su: false },
    ]);
    // El superusuario ve la participación de la liga privada; alguien de fuera no.
    expect(await db.admin('select id from public.entries where league_id = $1', [w.priv])).toHaveLength(1);
    expect(await db.asUser(w.u.extra, 'select id from public.entries where league_id = $1', [w.priv])).toHaveLength(0);
    expect(await db.asUser(w.u.luis, 'select id from public.entries where league_id = $1', [w.priv])).toHaveLength(1);
    // Y después de la llamada, la sesión vuelve a ser la del superusuario.
    expect(await db.admin('select current_user as u')).toEqual([{ u: 'postgres' }]);
  });

  it('como anon y service_role', async () => {
    expect(await db.asAnon('select current_user as u, auth.uid() as uid')).toEqual([{ u: 'anon', uid: null }]);
    expect(await db.asUser(w.u.ana, 'select auth.uid() as uid')).toEqual([{ uid: w.u.ana }]);
    // service_role salta la RLS (Edge Functions y cron).
    expect(await db.asService('select id from public.suggestions')).toEqual([]);
    expect(await db.asService('select id from public.entries where league_id = $1', [w.priv])).toHaveLength(1);
  });
});

describe('nada abierto por accidente', () => {
  it('todas las tablas de public tienen RLS', async () => {
    const rows = await db.admin<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
    // Y hay tablas que revisar (la consulta no está vacía por error).
    expect(await db.count('pg_class c join pg_namespace n on n.oid = c.relnamespace', `n.nspname = 'public' and c.relkind = 'r'`)).toBeGreaterThan(15);
  });

  it('ninguna vista sin security_invoker', async () => {
    const views = await db.admin<{ relname: string; opts: string[] | null }>(
      `select c.relname, c.reloptions as opts from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('v', 'm')`,
    );
    expect(views.length).toBeGreaterThan(0);
    for (const v of views) expect(v.opts ?? [], v.relname).toContain('security_invoker=true');
  });

  it('ninguna función security definer ejecutable por anon fuera de la lista', async () => {
    const rows = await db.admin<{ fn: string }>(
      `select n.nspname || '.' || p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where p.prosecdef and n.nspname not in ('pg_catalog', 'information_schema')
          and has_function_privilege('anon', p.oid, 'execute') order by 1`,
    );
    expect(rows.map((r) => r.fn)).toEqual(ANON_ALLOWED);
  });

  it('las RPC de public son exactamente las del contrato; nadie ejecuta por PUBLIC', async () => {
    const auth = await db.admin<{ fn: string }>(
      `select p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') order by 1`,
    );
    expect(auth.map((r) => r.fn)).toEqual(RPC_AUTHENTICATED);
    const open = await db.admin<{ fn: string }>(
      `select n.nspname || '.' || p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private') and (p.proacl is null or p.proacl::text like '%"=X/%' or p.proacl::text like '%,=X/%' or p.proacl::text like '{=X/%')`,
    );
    expect(open).toEqual([]);
    // Todas las RPC corren como su dueño y con search_path vacío.
    const loose = await db.admin<{ fn: string }>(
      `select n.nspname || '.' || p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private') and not coalesce('search_path=""' = any (p.proconfig), false)`,
    );
    expect(loose).toEqual([]);
  });

  it('anon y authenticated no tienen permisos de escritura en ninguna tabla ni secuencia', async () => {
    const rows = await db.admin<{ who: string; rel: string; priv: string }>(
      `select r.who, n.nspname || '.' || c.relname as rel, pr.priv
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         cross join (values ('anon'), ('authenticated')) as r (who)
         cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as pr (priv)
        where n.nspname in ('public', 'private') and c.relkind in ('r', 'p', 'v', 'm')
          and has_table_privilege(r.who, c.oid, pr.priv)`,
    );
    expect(rows).toEqual([]);
    const seqs = await db.admin(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('public', 'private') and c.relkind = 'S'
          and (has_sequence_privilege('anon', c.oid, 'usage') or has_sequence_privilege('authenticated', c.oid, 'usage'))`,
    );
    expect(seqs).toEqual([]);
    // Nada de private se lee por la API.
    const priv = await db.admin(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'private' and c.relkind = 'r'
          and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))`,
    );
    expect(priv).toEqual([]);
  });

  it('un visitante sin cuenta no escribe en ninguna tabla (lo intenta en todas)', async () => {
    const tables = await db.admin<{ t: string }>(
      `select n.nspname || '.' || c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('public', 'private') and c.relkind = 'r' order by 1`,
    );
    for (const { t } of tables) {
      for (const who of [ANON, w.u.luis, w.u.dios]) {
        await fails(db.as(who, `insert into ${t} default values`), '42501');
        await fails(db.as(who, `delete from ${t}`), '42501');
      }
    }
    // Ni con las RPC (salvo ver una invitación).
    await fails(db.rpc(ANON, 'create_league', { p_name: 'X' }), '42501');
    await fails(db.rpc(ANON, 'join_league', { p_league: w.pub }), '42501');
    await fails(db.rpc(ANON, 'publish_live', { p_event: w.e.e9, p_scores: [100] }), '42501');
    await fails(db.rpc(ANON, 'send_suggestion', { p_league: w.pub, p_text: 'hola' }), '42501');
    expect(await db.rpcRows(ANON, 'invite_preview', { p_code: 'ABCD2345' })).toHaveLength(1);
  });

  it('los perfiles nunca los lee un visitante sin cuenta (tienen el correo)', async () => {
    await fails(db.asAnon('select id from public.profiles'), '42501');
    await fails(db.asAnon('select league_id from public.league_members'), '42501');
    await fails(db.asAnon('select player_id from public.memberships'), '42501');
    // service_role sí (respaldos, Edge Functions).
    expect((await db.as(SERVICE, 'select id from public.profiles')).length).toBeGreaterThanOrEqual(10);
  });
});
