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
  // Deportes (partidos, golf, natación, raqueta, equipos).
  'admin_correct_result', 'claim_scorer', 'confirm_result', 'create_matches', 'create_season_team', 'delete_match',
  'delete_season_team', 'dispute_result', 'finish_match', 'my_matches', 'postpone_match', 'publish_match',
  'release_scorer', 'remove_team_player', 'reschedule_match', 'resolve_dispute', 'set_match_players',
  'set_match_sides', 'set_roster', 'set_team_player', 'set_walkover', 'suspend_match', 'update_match_schedule',
  'update_season_team', 'void_match', 'golf_add_players', 'golf_close_round', 'golf_create_round',
  'golf_create_tournament', 'golf_delete_course', 'golf_delete_tournament', 'golf_register', 'golf_save_course',
  'golf_save_hole_scores', 'golf_set_dq', 'golf_set_groups', 'golf_set_index', 'golf_sign_card', 'golf_unregister',
  'golf_update_round', 'swim_create_meet', 'swim_delete_club', 'swim_delete_event', 'swim_enter',
  'swim_finalize_meet', 'swim_publish_heats', 'swim_record_heat', 'swim_register_swimmer', 'swim_save_club',
  'swim_save_events', 'swim_unenter', 'swim_update_meet', 'swim_update_swimmer', 'save_night_round',
  'save_points_result', 'accept_challenge', 'cancel_challenge', 'create_challenge', 'join_ladder', 'leave_ladder',
  'save_box_month', 'set_ladder', 'sync_ladder', 'server_now', 'set_match_official', 'set_match_rsvp',
  'delete_football_sanction', 'save_football_sanction',
  // Liga (avisos e invitación), inscripciones y cuenta (mayores de 18, datos, borrar, errores).
  'invite_details', 'league_announce', 'league_announce_reach', 'join_signup', 'leave_signup', 'set_signup',
  'admin_clear_client_errors', 'admin_client_errors', 'confirm_adult', 'export_my_data', 'log_client_error',
  'prepare_delete_account',
  // Consola del superadmin (y touch_seen, de cualquier cuenta).
  'touch_seen', 'admin_overview', 'admin_series', 'admin_users', 'admin_user', 'admin_leagues', 'admin_audit_log',
  'admin_system', 'admin_scan_stats', 'admin_block_user', 'admin_unblock_user', 'admin_announce', 'admin_count_recipients',
  // Social: seguir, perfil público, juegos con me gusta y avisos.
  'follow_list', 'follow_user', 'following_games', 'profile_games', 'profile_stats', 'public_profile', 'set_game_like',
  'social_notices', 'unfollow_user',
  // Reclamos: «ese jugador soy yo» y el admin lo aprueba.
  'cancel_player_claim', 'decide_player_claim', 'player_claim_conflicts', 'request_player_claim',
  // @usuario, buscar personas e invitaciones a una liga.
  'set_username', 'username_status', 'search_people', 'invite_to_league', 'respond_league_invite', 'cancel_league_invite',
  'my_league_invites', 'league_invite_details',
  // Avisos al teléfono: preferencias de cada cuenta y el espacio del plan gratis en la consola.
  'set_push_prefs', 'admin_storage_usage',
  // Legal: aceptar los términos vigentes y reportar contenido (y los reportes propios, para «Descargar mis datos»).
  'accept_legal', 'admin_legal_stats', 'list_reports', 'my_reports', 'report_content', 'resolve_report',
  // Organizador: ligas públicas, pendientes, juntar jugadores, menores, suspender un día y pistas del boliche.
  'public_leagues_feed', 'league_pending', 'merge_league_players', 'merge_league_players_preview', 'set_player_minor',
  'suspend_day', 'suspend_day_preview', 'assign_lanes', 'clear_lanes', 'publish_lanes', 'set_player_lane',
  // Temporadas, campeones, playoffs, marcas del boliche y «¿Dónde juego esta semana?».
  'close_season', 'start_season', 'league_seasons', 'league_champions', 'create_playoffs', 'delete_playoffs', 'sync_playoffs',
  'bowling_game_context', 'public_agenda',
  // Juegos sueltos del boliche y el logo de la liga.
  'save_solo_session', 'delete_solo_session', 'solo_sessions_of', 'begin_logo_upload', 'set_league_logo',
  // Insignias: el perfil, destacadas, ocultar, visto, el modo de la liga, el aval y el retiro por fraude.
  'mark_badges_seen', 'profile_badges', 'review_badge', 'set_badge_hidden', 'set_badges_auto', 'set_featured_badges',
  'super_revoke_badge',
  // Insignias, el motor: los avisos de la cuenta (y hazañas por confirmar), el historial y la consola (superadmin).
  'badge_notices', 'badges_backfill', 'admin_badges_engine', 'admin_badge_jobs',
  // Insignias, el creador de la liga: permisos, diseños, dar, retirar, ocultar, ver, reportes y moderación.
  'set_badge_policy', 'set_member_badge_maker', 'save_league_badge', 'archive_league_badge', 'delete_league_badge',
  'award_league_badge', 'revoke_league_badge_award', 'set_league_badge_hidden', 'mark_league_badges_seen',
  'league_badge_holders', 'report_league_badge', 'report_badge', 'hide_league_badge', 'admin_badge_reports',
  'admin_resolve_badge_reports', 'admin_blocked_terms',
  // Premios del torneo: la insignia de cada lugar del podio, el podio que calcula el servidor, entregar y cerrar.
  'set_tournament_prizes', 'tournament_podium', 'deliver_tournament_prizes', 'close_tournament_prizes',
  // Anotadores del torneo: invitar a anotar, lo que ve la hoja y el link para anotar (crear, cambiar, quitar, ver y entrar).
  'invite_scorers', 'scorer_access', 'create_scorer_link', 'rotate_scorer_link', 'revoke_scorer_link', 'scorer_link_preview',
  'join_as_scorer',
  // Mis bolas del boliche: guardar, retirar, pulir y borrar una bola, con cuál tiró cada juego y leerlas.
  'save_ball', 'retire_ball', 'resurface_ball', 'delete_ball', 'set_game_balls', 'my_balls', 'my_ball_games',
  // El diseño de las bolas (colores, dibujo y figuras).
  'set_ball_design',
  // El modo de la app del rediseño (Lite o Pro, guardado en la cuenta).
  'set_ui_mode',
].sort();

/** RPC de public solo para la clave secreta (service_role): Edge Functions, cron y scripts. Nadie de la app. */
const RPC_SERVICE_ONLY = [
  'claim_push_batch', 'finish_push_batch', 'migration_sync_passwords', 'ping', 'purge_queue_done', 'purge_queue_take',
  'scan_begin', 'scan_finish', 'scan_next_model', 'storage_orphans',
  // El motor de insignias (la Edge Function `insignias`): tomar, la foto de datos, aplicar, fallar, soltar y terminar.
  'badge_apply', 'badge_claim', 'badge_fail', 'badge_finish', 'badge_release', 'badge_snapshot',
].sort();

/** Lo único security definer que un visitante sin cuenta puede ejecutar. */
const ANON_ALLOWED = [
  'private.readable_leagues', 'public.invite_preview', 'public.public_agenda', 'public.public_leagues_feed', 'public.scorer_link_preview',
];

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

  it('las RPC de solo service_role: exactamente las de la lista, y ni anon ni authenticated las ejecutan', async () => {
    const rows = await db.admin<{ fn: string }>(
      `select p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('service_role', p.oid, 'execute')
          and not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')
        order by 1`,
    );
    expect(rows.map((r) => r.fn)).toEqual(RPC_SERVICE_ONLY);
    for (const fn of ['purge_queue_take', 'storage_orphans']) {
      await fails(db.as(ANON, `select * from public.${fn}()`), '42501');
      await fails(db.as(w.u.dios, `select * from public.${fn}()`), '42501');
      expect(await db.as(SERVICE, `select * from public.${fn}()`)).toEqual([]);
    }
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
    // Ni con el link para anotar (solo ver a qué lleva).
    await fails(db.rpc(ANON, 'join_as_scorer', { p_code: 'ABCDEFGHJK' }), '42501');
    expect(await db.rpc(ANON, 'scorer_link_preview', { p_code: 'ABCDEFGHJK' })).toBeNull();
  });

  it('los perfiles nunca los lee un visitante sin cuenta (tienen el correo)', async () => {
    await fails(db.asAnon('select id from public.profiles'), '42501');
    await fails(db.asAnon('select league_id from public.league_members'), '42501');
    await fails(db.asAnon('select player_id from public.memberships'), '42501');
    // service_role sí (respaldos, Edge Functions).
    expect((await db.as(SERVICE, 'select id from public.profiles')).length).toBeGreaterThanOrEqual(10);
  });

  it('de private, anon y authenticated solo ejecutan lo que usan las políticas (RLS y Storage)', async () => {
    const rows = await db.admin<{ who: string; fn: string }>(
      `select r.who, p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'), ('authenticated')) as r (who)
        where n.nspname = 'private' and has_function_privilege(r.who, p.oid, 'execute') order by 1, 2`,
    );
    expect(rows).toEqual([
      { who: 'anon', fn: 'readable_leagues' },
      ...[
        'admin_leagues', 'can_remove_logo_path', 'can_upload_logo_path', 'can_upload_photo_path', 'is_super', 'my_leagues',
        'photo_admin_leagues', 'readable_leagues',
      ].map((fn) => ({
        who: 'authenticated',
        fn,
      })),
    ]);
  });

  it('otra cuenta (dueño o admin de liga) no ve correos ajenos ni la auditoría; el superadmin sí', async () => {
    for (const who of [w.u.org, w.u.sofi, w.u.luis]) {
      expect(await db.asUser(who, 'select id from public.profiles')).toEqual([{ id: who }]);
      expect(await db.asUser(who, 'select id from public.admin_audit')).toEqual([]);
      // Las RPC de la consola tampoco (y en la auditoría no queda nada).
      await fails(db.rpc(who, 'admin_users', {}), ['no_permitido', '42501']);
      await fails(db.rpc(who, 'admin_user', { p_user: w.u.ana }), ['no_permitido', '42501']);
    }
    expect((await db.asUser(w.u.dios, 'select id from public.profiles')).length).toBeGreaterThanOrEqual(10);
    // Una cuenta bloqueada sigue viendo solo lo suyo.
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.org, p_reason: 'x' });
    expect(await db.asUser(w.u.org, 'select id, blocked_at is not null as b from public.profiles')).toEqual([{ id: w.u.org, b: true }]);
    await fails(db.rpc(w.u.org, 'admin_users', {}), ['bloqueada', 'no_permitido']);
  });
});
