/**
 * Consola del superadmin (20260927001100_consola.sql): permisos de las RPC admin_*, bloqueo de cuentas, auditoría,
 * anuncios (validación, público, ritmo y cola), listas con páginas, series por día, resumen, sistema, lecturas
 * de fotos y touch_seen.
 *
 * Ojo: cada prueba corre en UNA transacción, así que now() es la misma hora en toda la prueba (las horas
 * «de antes» se ponen a mano).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANON, DENIED, MIGRATIONS_DIR, SERVICE, TestDb, fails } from './harness';
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

type Json = Record<string, any>;

/** Teléfono con avisos push de la cuenta (n = cuál de sus teléfonos). */
const phone = (uid: string, n = 1) =>
  db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'BPclave', 'secreto')`, [
    uid,
    `https://fcm.googleapis.com/fcm/send/${uid}-${n}`,
  ]);

/** Pone updated_at en el pasado (sin triggers en esa sentencia: el de updated_at lo volvería a now()). */
async function backdate(table: string, leagueId: string, ago: string) {
  await db.admin('set local session_replication_role = replica');
  try {
    await db.admin(`update ${table} set updated_at = now() - $2::interval where league_id = $1`, [leagueId, ago]);
  } finally {
    await db.admin('set local session_replication_role = origin');
  }
}

const audit = () =>
  db.admin<{ action: string; target_type: string; target_id: string | null; actor_id: string | null; detail: Json }>(
    'select action, target_type, target_id, actor_id, detail from public.admin_audit order by id',
  );

const today = async () => (await db.admin<{ d: string }>(`select to_char(private.console_day(), 'YYYY-MM-DD') as d`))[0].d;
const dayOffset = async (days: number) =>
  (await db.admin<{ d: string }>(`select to_char(private.console_day() + $1::int, 'YYYY-MM-DD') as d`, [days]))[0].d;

const ANNOUNCE = { p_title: 'Nueva versión', p_body: 'Ya puedes crear ligas de pádel.', p_url: '/', p_audience: { kind: 'all' } };

/** Todas las RPC de la consola con argumentos que sirven. */
const adminCalls = (): [string, Record<string, unknown>][] => [
  ['admin_overview', {}],
  ['admin_series', { p_days: 30 }],
  ['admin_users', {}],
  ['admin_user', { p_user: w.u.luis }],
  ['admin_leagues', {}],
  ['admin_audit_log', {}],
  ['admin_system', {}],
  ['admin_scan_stats', { p_days: 30 }],
  ['admin_client_errors', {}],
  ['admin_clear_client_errors', {}],
  ['admin_block_user', { p_user: w.u.luis, p_reason: 'spam' }],
  ['admin_unblock_user', { p_user: w.u.luis }],
  ['admin_announce', ANNOUNCE],
  ['admin_count_recipients', { p_audience: { kind: 'all' } }],
];

describe('permisos', () => {
  it('cada RPC admin_* rechaza a quien no es superadmin (también dueños, admins de liga y sin cuenta)', async () => {
    for (const [fn, args] of adminCalls()) {
      for (const who of [ANON, w.u.luis, w.u.org, w.u.sofi, w.u.otro]) await fails(db.rpc(who, fn, args), DENIED);
    }
    // Nada quedó hecho.
    expect(await db.count('public.admin_audit')).toBe(0);
    expect(await db.count('public.profiles', 'blocked_at is not null')).toBe(0);
  });

  it('el superadmin sí puede (y la lista de arriba son todas las admin_* nuevas)', async () => {
    for (const [fn, args] of adminCalls()) await db.rpc(w.u.dios, fn, args);
    const fns = await db.admin<{ fn: string }>(
      `select p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'admin\\_%' and p.proname <> 'admin_correct_result' order by 1`,
    );
    expect(fns.map((r) => r.fn)).toEqual(adminCalls().map(([fn]) => fn).sort());
  });

  it('la auditoría solo la lee el superadmin y nadie escribe en ella directo', async () => {
    await db.rpc(w.u.dios, 'set_sport_status', { p_sport: 'padel', p_status: 'open' });
    expect(await db.asUser(w.u.dios, 'select action from public.admin_audit')).toEqual([{ action: 'set_sport_status' }]);
    expect(await db.asUser(w.u.org, 'select action from public.admin_audit')).toEqual([]);
    await fails(db.asAnon('select action from public.admin_audit'), '42501');
    for (const who of [w.u.dios, w.u.org]) {
      await fails(db.as(who, `insert into public.admin_audit (action, target_type) values ('x_x', 'app')`), '42501');
      await fails(db.as(who, 'delete from public.admin_audit'), '42501');
      await fails(db.as(who, `update public.admin_audit set action = 'y_y'`), '42501');
    }
    await fails(db.as(w.u.dios, 'select private.audit($1, $2, null)', ['hola', 'app']), '42501');
    await fails(db.as(w.u.dios, 'select * from private.daily_seen'), '42501');
  });

  it('touch_seen: solo con sesión (sin cuenta no hay permiso)', async () => {
    await fails(db.rpc(ANON, 'touch_seen'), '42501');
    await db.rpc(w.u.luis, 'touch_seen');
  });

  it('todas las RPC con sesión pasan por require_uid (así el bloqueo frena toda escritura)', async () => {
    const rows = await db.admin<{ fn: string }>(
      `select p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
          and p.prosrc not like '%private.require_uid()%' and p.prosrc not like '%private.require_super()%'
        order by 1`,
    );
    // Lecturas (y touch_seen, que nunca falla): no escriben nada de la persona. delete_push_subscription solo borra
    // el teléfono de la propia cuenta (una bloqueada también puede apagar sus notificaciones).
    expect(rows.map((r) => r.fn)).toEqual(['delete_push_subscription', 'invite_preview', 'my_matches', 'server_now', 'sync_ladder', 'touch_seen']);
  });
});

describe('bloqueo', () => {
  it('bloqueada no escribe nada (bloqueada, 42501); lee igual; al desbloquear vuelve a escribir', async () => {
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: '  Spam en los comentarios  ' });
    expect(await db.admin('select blocked_reason, blocked_at is not null as b from public.profiles where id = $1', [w.u.luis])).toEqual([
      { blocked_reason: 'Spam en los comentarios', b: true },
    ]);

    const err = await fails(db.rpc(w.u.luis, 'send_suggestion', { p_league: w.priv, p_text: 'hola' }), 'bloqueada');
    expect(err.code).toBe('42501');
    await fails(db.rpc(w.u.luis, 'create_league', { p_name: 'Otra' }), 'bloqueada');
    await fails(db.rpc(w.u.luis, 'rename_profile', { p_name: 'Luis 2' }), 'bloqueada');
    await fails(db.rpc(w.u.luis, 'join_league', { p_league: w.pub }), 'bloqueada');
    await fails(db.rpc(w.u.luis, 'publish_live', { p_event: w.e.e1, p_scores: [100] }), 'bloqueada');
    await fails(db.rpc(w.u.luis, 'add_comment', { p_entry: w.e1Luis, p_text: 'hola' }), 'bloqueada');
    await fails(db.rpc(w.u.luis, 'upsert_push_subscription', { p_endpoint: 'https://fcm.googleapis.com/fcm/send/x', p_p256dh: 'a', p_auth: 'b' }), 'bloqueada');
    await fails(
      db.rpc(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_scores: [150], p_event: w.e.e1 }),
      'bloqueada',
    );

    // Leer sigue: su liga, su perfil (ve que está bloqueada), la escalera y touch_seen.
    expect(await db.asUser(w.u.luis, 'select id from public.entries where league_id = $1', [w.priv])).toHaveLength(1);
    expect(await db.asUser(w.u.luis, 'select blocked_at is not null as b from public.profiles')).toEqual([{ b: true }]);
    await fails(db.rpc(w.u.luis, 'sync_ladder', { p_event: randomUUID() }), 'no_existe');
    await db.rpc(w.u.luis, 'touch_seen');

    // Tampoco sube fotos a Storage ni gasta lecturas con IA.
    const path = `${w.priv}/${randomUUID()}.webp`;
    expect(await db.asUser(w.u.luis, 'select private.can_upload_photo_path($1) as ok', [path])).toEqual([{ ok: false }]);
    await fails(db.as(SERVICE, `select public.scan_begin(p_user => $1, p_league => $2, p_event => null, p_key => $3)`, [w.u.luis, w.priv, 'a'.repeat(64)]), 'bloqueada');

    await db.rpc(w.u.dios, 'admin_unblock_user', { p_user: w.u.luis });
    expect(await db.admin('select blocked_reason, blocked_at from public.profiles where id = $1', [w.u.luis])).toEqual([
      { blocked_reason: null, blocked_at: null },
    ]);
    await db.rpc(w.u.luis, 'send_suggestion', { p_league: w.priv, p_text: 'hola' });
    expect(await db.asUser(w.u.luis, 'select private.can_upload_photo_path($1) as ok', [path])).toEqual([{ ok: true }]);
  });

  it('bloquear no borra nada', async () => {
    const before = await Promise.all(['public.league_members', 'public.players', 'public.entries'].map((t) => db.count(t)));
    await phone(w.u.luis);
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: '' });
    const after = await Promise.all(['public.league_members', 'public.players', 'public.entries'].map((t) => db.count(t)));
    expect(after).toEqual(before);
    expect(await db.count('public.push_subscriptions', 'user_id = $1', [w.u.luis])).toBe(1);
    // Motivo vacío = sin motivo. Bloquear otra vez no cambia la hora (sí el motivo).
    expect(await db.admin('select blocked_reason from public.profiles where id = $1', [w.u.luis])).toEqual([{ blocked_reason: null }]);
    await db.admin(`update public.profiles set blocked_at = now() - interval '1 day' where id = $1`, [w.u.luis]);
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'otra vez' });
    expect(await db.admin(`select blocked_reason, blocked_at < now() as old from public.profiles where id = $1`, [w.u.luis])).toEqual([
      { blocked_reason: 'otra vez', old: true },
    ]);
  });

  it('no a sí mismo, no a un superadmin, no a quien no existe, motivo de hasta 200', async () => {
    await fails(db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.dios, p_reason: 'x' }), 'invalido');
    await fails(db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.dios2, p_reason: 'x' }), 'no_permitido');
    await fails(db.rpc(w.u.dios, 'admin_block_user', { p_user: randomUUID(), p_reason: 'x' }), 'no_existe');
    await fails(db.rpc(w.u.dios, 'admin_unblock_user', { p_user: randomUUID() }), 'no_existe');
    await fails(db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'x'.repeat(201) }), 'invalido');
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'x'.repeat(200) });
    expect(await db.count('public.profiles', 'blocked_at is not null')).toBe(1);
  });

  it('nombrar superadmin a una cuenta bloqueada la desbloquea (un superadmin nunca está bloqueado)', async () => {
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'x' });
    await db.rpc(w.u.dios, 'set_superadmin', { p_user: w.u.luis, p_value: true });
    expect(await db.admin('select is_superadmin, blocked_at, blocked_reason from public.profiles where id = $1', [w.u.luis])).toEqual([
      { is_superadmin: true, blocked_at: null, blocked_reason: null },
    ]);
    expect((await audit()).at(-1)).toMatchObject({ action: 'set_superadmin', detail: { value: true, unblocked: true } });
  });
});

describe('auditoría', () => {
  it('cada acción de la consola deja su fila (quién, qué, a quién)', async () => {
    await db.rpc(w.u.dios, 'set_superadmin', { p_user: w.u.sofi, p_value: true });
    await db.rpc(w.u.dios, 'set_sport_status', { p_sport: 'tennis', p_status: 'closed' });
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'spam' });
    await db.rpc(w.u.dios, 'admin_unblock_user', { p_user: w.u.luis });
    await db.rpc(w.u.dios, 'admin_announce', ANNOUNCE);
    const rows = await audit();
    expect(rows.map((r) => [r.action, r.target_type, r.target_id])).toEqual([
      ['set_superadmin', 'user', w.u.sofi],
      ['set_sport_status', 'sport', 'tennis'],
      ['block_user', 'user', w.u.luis],
      ['unblock_user', 'user', w.u.luis],
      ['announce', 'app', null],
    ]);
    expect(rows.every((r) => r.actor_id === w.u.dios)).toBe(true);
    expect(rows[0].detail).toMatchObject({ value: true, before: false, name: 'sofi', email: 'sofi@x.com' });
    // Todos los deportes están abiertos desde 20260929000300_sueltos_logos.sql.
    expect(rows[1].detail).toEqual({ from: 'open', to: 'closed' });
    expect(rows[2].detail).toMatchObject({ reason: 'spam', name: 'luis' });
    expect(rows[3].detail).toMatchObject({ wasBlocked: true, reason: 'spam' });
    expect(rows[4].detail).toMatchObject({ title: 'Nueva versión', url: '/', audience: { kind: 'all' }, recipients: 0 });
  });

  it('borrar o traspasar una liga ajena (superadmin) queda; el dueño con la suya, no', async () => {
    await db.rpc(w.u.dios, 'transfer_ownership', { p_league: w.priv, p_user: w.u.sofi });
    expect(await db.admin('select owner_id from public.leagues where id = $1', [w.priv])).toEqual([{ owner_id: w.u.sofi }]);
    expect(await db.admin('select user_id, role from public.league_members where league_id = $1 and role <> $2 order by role', [w.priv, 'member'])).toEqual([
      { user_id: w.u.org, role: 'admin' },
      { user_id: w.u.sofi, role: 'owner' },
    ]);
    await db.rpc(w.u.dios, 'delete_league', { p_league: w.pub });
    expect(await db.count('public.leagues', 'id = $1', [w.pub])).toBe(0);
    const rows = await audit();
    expect(rows.map((r) => [r.action, r.target_type, r.target_id])).toEqual([
      ['transfer_league', 'league', w.priv],
      ['delete_league', 'league', w.pub],
    ]);
    expect(rows[0].detail).toMatchObject({ name: 'Liga del Banco', from: w.u.org, to: w.u.sofi, fromName: 'org', toName: 'sofi' });
    expect(rows[1].detail).toMatchObject({ name: 'Liga Abierta', sport: 'bowling', ownerId: w.u.otro, ownerName: 'otro', members: 1, players: 1, events: 1 });

    // El dueño con su liga: igual que siempre y sin rastro.
    await db.rpc(w.u.sofi, 'transfer_ownership', { p_league: w.priv, p_user: w.u.org });
    await db.rpc(w.u.org, 'delete_league', { p_league: w.priv });
    expect(await db.count('public.admin_audit')).toBe(2);
    // Los de siempre siguen sin poder.
    const lid = (await db.rpc<Json>(w.u.otro, 'create_league', { p_name: 'Nueva' })).league_id;
    await fails(db.rpc(w.u.luis, 'delete_league', { p_league: lid }), DENIED);
    await fails(db.rpc(w.u.dios, 'delete_league', { p_league: randomUUID() }), 'no_existe');
    await fails(db.rpc(w.u.dios, 'transfer_ownership', { p_league: lid, p_user: w.u.luis }), 'no_existe');
    expect(await db.count('public.admin_audit')).toBe(2);
  });

  it('admin_audit_log: lo más nuevo primero, con nombre de quién, filtro por acción y páginas', async () => {
    await db.rpc(w.u.dios, 'set_sport_status', { p_sport: 'padel', p_status: 'open' });
    await db.rpc(w.u.dios2, 'set_sport_status', { p_sport: 'golf', p_status: 'open' });
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: null });
    const all = await db.rpc<Json>(w.u.dios, 'admin_audit_log', {});
    expect(all.total).toBe(3);
    expect(all.rows.map((r: Json) => [r.action, r.actorName])).toEqual([
      ['block_user', 'dios'],
      ['set_sport_status', 'dios2'],
      ['set_sport_status', 'dios'],
    ]);
    expect(all.rows[0]).toMatchObject({ actorId: w.u.dios, targetType: 'user', targetId: w.u.luis, detail: { reason: null } });
    expect(all.rows[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(typeof all.rows[0].id).toBe('number');

    const f = await db.rpc<Json>(w.u.dios, 'admin_audit_log', { p_action: 'set_sport_status', p_limit: 1, p_offset: 1 });
    expect(f.total).toBe(2);
    expect(f.rows.map((r: Json) => r.detail.to)).toEqual(['open']);
    expect(f.rows[0].targetId).toBe('padel');
    expect((await db.rpc<Json>(w.u.dios, 'admin_audit_log', { p_action: 'nada' })).rows).toEqual([]);
  });
});

describe('anuncios', () => {
  /** org 2 teléfonos; sofi, luis, otro y nuevo 1; ana y extra ninguno. */
  async function phones() {
    await phone(w.u.org, 1);
    await phone(w.u.org, 2);
    for (const u of [w.u.sofi, w.u.luis, w.u.otro, w.u.nuevo]) await phone(u);
  }
  const count = (audience: Json) => db.rpc<number>(w.u.dios, 'admin_count_recipients', { p_audience: audience });

  it('valida título, texto, ruta y público', async () => {
    const bad: Json[] = [
      { p_title: '' },
      { p_title: '   ' },
      { p_title: 'x'.repeat(61) },
      { p_body: '' },
      { p_body: 'x'.repeat(181) },
      { p_url: 'https://otro.com' },
      { p_url: '//otro.com' },
      { p_url: '/\\otro.com' },
      { p_url: 'l/abc' },
      { p_url: '/l/a b' },
      { p_url: '/' + 'x'.repeat(200) },
      { p_url: 'javascript:alert(1)' },
      { p_url: '\t/ligas' },
      { p_url: '/l/a\nb' },
      { p_url: '/l/a\u007fb' },
      { p_url: '\\\\otro.com' },
      { p_audience: { kind: 'nadie' } },
      { p_audience: [] },
      { p_audience: { kind: 'sport', sport: 'cricket' } },
      { p_audience: { kind: 'sport' } },
      { p_audience: { kind: 'league', leagueId: 'abc' } },
    ];
    for (const b of bad) await fails(db.rpc(w.u.dios, 'admin_announce', { ...ANNOUNCE, ...b }), 'invalido');
    await fails(db.rpc(w.u.dios, 'admin_announce', { ...ANNOUNCE, p_audience: { kind: 'league', leagueId: randomUUID() } }), 'no_existe');
    await fails(db.rpc(w.u.dios, 'admin_count_recipients', { p_audience: { kind: 'x' } }), 'invalido');
    expect(await db.count('public.admin_audit')).toBe(0);
    // Límites justos, recortado y ruta por defecto.
    await phone(w.u.luis);
    await db.rpc(w.u.dios, 'admin_announce', { ...ANNOUNCE, p_title: ` ${'t'.repeat(60)} `, p_body: 'b'.repeat(180), p_url: null });
    await db.rpc(w.u.dios, 'admin_announce', { ...ANNOUNCE, p_url: '/l/123?x=1#y' });
    expect(await db.admin('select title, url from public.push_outbox order by id')).toEqual([
      { title: 't'.repeat(60), url: '/' },
      { title: 'Nueva versión', url: '/l/123?x=1#y' },
    ]);
  });

  it('cuántos reciben: todos, un deporte, una liga, los admins (solo con teléfono y sin bloquear)', async () => {
    await phones();
    expect(await count({ kind: 'all' })).toBe(5);
    expect(await count({ kind: 'sport', sport: 'bowling' })).toBe(4);
    expect(await count({ kind: 'sport', sport: 'padel' })).toBe(0);
    expect(await count({ kind: 'league', leagueId: w.priv })).toBe(3);
    expect(await count({ kind: 'league', leagueId: w.pub.toUpperCase() })).toBe(1);
    expect(await count({ kind: 'admins' })).toBe(3);
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.nuevo, p_reason: 'x' });
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.sofi, p_reason: 'x' });
    expect(await count({ kind: 'all' })).toBe(3);
    expect(await count({ kind: 'admins' })).toBe(2);
  });

  it('una fila por cuenta en la cola (el trigger la reparte por teléfono) y queda en la auditoría', async () => {
    await phones();
    const n = await db.rpc<number>(w.u.dios, 'admin_announce', { ...ANNOUNCE, p_url: `/l/${w.priv}`, p_audience: { kind: 'league', leagueId: w.priv } });
    expect(n).toBe(3);
    const rows = await db.admin<{ user_id: string; n: number; title: string; body: string; url: string; ttl: number; tags: number }>(
      `select user_id, count(*)::int as n, min(title) as title, min(body) as body, min(url) as url, min(ttl) as ttl,
              count(distinct tag)::int as tags
         from public.push_outbox group by user_id order by 2 desc, 1`,
    );
    expect(rows.map((r) => [r.user_id, r.n])).toEqual([[w.u.org, 2], ...[w.u.luis, w.u.sofi].sort().map((u) => [u, 1])]);
    for (const r of rows) expect(r).toMatchObject({ title: ANNOUNCE.p_title, body: ANNOUNCE.p_body, url: `/l/${w.priv}`, ttl: 86400, tags: 1 });
    expect(await db.count('public.push_outbox', 'subscription_id is null')).toBe(0);
    expect(await db.count('public.push_outbox', `tag like 'anuncio:%'`)).toBe(4);
    expect((await audit()).at(-1)).toMatchObject({
      action: 'announce',
      detail: { recipients: 3, audience: { kind: 'league', leagueId: w.priv }, url: `/l/${w.priv}` },
    });
  });

  it('máximo 5 por hora (entre todos los superadmins); los de hace más de una hora no cuentan', async () => {
    for (let i = 0; i < 3; i++) await db.rpc(w.u.dios, 'admin_announce', ANNOUNCE);
    for (let i = 0; i < 2; i++) await db.rpc(w.u.dios2, 'admin_announce', ANNOUNCE);
    await fails(db.rpc(w.u.dios, 'admin_announce', ANNOUNCE), 'rate_limited');
    await fails(db.rpc(w.u.dios2, 'admin_announce', ANNOUNCE), 'rate_limited');
    expect(await db.count('public.admin_audit', `action = 'announce'`)).toBe(5);
    await db.admin(`update public.admin_audit set at = now() - interval '61 minutes' where id = (select min(id) from public.admin_audit)`);
    await db.rpc(w.u.dios, 'admin_announce', ANNOUNCE);
    await fails(db.rpc(w.u.dios, 'admin_announce', ANNOUNCE), 'rate_limited');
  });
});

describe('listas', () => {
  it('admin_users: páginas estables con total, filtros y búsqueda', async () => {
    const page = (args: Json) => db.rpc<Json>(w.u.dios, 'admin_users', args);
    const first = await page({ p_limit: 3 });
    expect(first.total).toBe(10);
    expect(first.rows).toHaveLength(3);
    const ids: string[] = [];
    for (let off = 0; off < 10; off += 3) ids.push(...(await page({ p_limit: 3, p_offset: off })).rows.map((r: Json) => r.id));
    expect(new Set(ids).size).toBe(10);
    expect((await page({ p_limit: 3, p_offset: 9 })).rows).toHaveLength(1);
    expect((await page({ p_offset: 50 })).rows).toEqual([]);
    expect((await page({ p_limit: 0 })).rows).toHaveLength(1);
    expect((await page({ p_limit: 1000 })).rows).toHaveLength(10);

    // Más nuevas primero.
    await db.admin(`update public.profiles set created_at = now() + interval '1 minute' where id = $1`, [w.u.extra]);
    expect((await page({ p_limit: 1 })).rows[0].name).toBe('extra');

    expect((await page({ p_filter: 'super' })).rows.map((r: Json) => r.name).sort()).toEqual(['dios', 'dios2']);
    expect((await page({ p_search: 'SOFI' })).rows.map((r: Json) => r.name)).toEqual(['sofi']);
    expect((await page({ p_search: 'x.com' })).total).toBe(10);
    expect((await page({ p_search: w.u.ana })).rows.map((r: Json) => r.name)).toEqual(['ana']);
    expect((await page({ p_search: '%' })).total).toBe(0);
    expect((await page({ p_search: '_' })).total).toBe(0);
    expect((await page({ p_search: '   ' })).total).toBe(10);

    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'x' });
    expect((await page({ p_filter: 'blocked' })).rows.map((r: Json) => r.name)).toEqual(['luis']);
    expect((await page({ p_filter: 'unconfirmed' })).total).toBe(10);
    await db.admin(`update auth.users set email_confirmed_at = now() where id = any($1)`, [[w.u.org, w.u.sofi]]);
    expect((await page({ p_filter: 'unconfirmed' })).total).toBe(8);
    expect((await page({ p_filter: 'inactive' })).total).toBe(10);
    await db.rpc(w.u.ana, 'touch_seen');
    expect((await page({ p_filter: 'inactive' })).total).toBe(9);
    await db.admin(`update public.profiles set last_seen_at = now() - interval '31 days' where id = $1`, [w.u.ana]);
    expect((await page({ p_filter: 'inactive' })).total).toBe(10);
    await fails(page({ p_filter: 'raro' }), 'invalido');
  });

  it('admin_users: cada fila trae lo del contrato', async () => {
    await db.admin(
      `update auth.users set email_confirmed_at = now(), last_sign_in_at = now(), raw_app_meta_data = '{"provider": "google"}' where id = $1`,
      [w.u.org],
    );
    const { rows } = await db.rpc<Json>(w.u.dios, 'admin_users', { p_search: 'org@' });
    expect(rows).toHaveLength(1);
    const iso = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(rows[0]).toEqual({
      id: w.u.org,
      email: 'org@x.com',
      name: 'org',
      createdAt: iso,
      lastSeenAt: null,
      lastSignInAt: iso,
      confirmed: true,
      provider: 'google',
      superadmin: false,
      blockedAt: null,
      blockedReason: null,
      leagues: 1,
      ownedLeagues: 1,
    });
    const [dios] = (await db.rpc<Json>(w.u.dios, 'admin_users', { p_search: 'dios@' })).rows;
    expect(dios).toMatchObject({ superadmin: true, confirmed: false, provider: null, lastSignInAt: null, leagues: 0, ownedLeagues: 0 });
  });

  it('admin_user: detalle con sus ligas, teléfonos, lecturas de hoy y mayor de edad; null si no existe', async () => {
    await phone(w.u.luis, 1);
    await phone(w.u.luis, 2);
    await db.admin('insert into private.scan_usage (user_id, day, n) values ($1, private.scan_day(), 4)', [w.u.luis]);
    await db.admin('update public.profiles set adult_confirmed_at = now() where id = $1', [w.u.luis]);
    await db.admin(`update public.league_members set is_scorer = true where user_id = $1`, [w.u.luis]);
    const d = await db.rpc<Json>(w.u.dios, 'admin_user', { p_user: w.u.luis });
    expect(d).toMatchObject({ id: w.u.luis, name: 'luis', leagues: 1, ownedLeagues: 0, pushDevices: 2, scansToday: 4, adult: true });
    expect(d.memberships).toEqual([
      { leagueId: w.priv, leagueName: 'Liga del Banco', sport: 'bowling', kind: 'liga', role: 'member', scorer: true, joinedAt: expect.any(String) },
    ]);
    expect(await db.rpc(w.u.dios, 'admin_user', { p_user: randomUUID() })).toBeNull();
    expect(await db.rpc<Json>(w.u.dios, 'admin_user', { p_user: w.u.extra })).toMatchObject({ memberships: [], pushDevices: 0, scansToday: 0, adult: false });
  });

  it('admin_leagues: filtros, orden, búsqueda por dueño, páginas y cada fila', async () => {
    const list = async (args: Json) => db.rpc<Json>(w.u.dios, 'admin_leagues', args);
    const names = async (args: Json) => (await list(args)).rows.map((r: Json) => r.name);
    expect((await list({})).total).toBe(2);
    expect(await names({ p_sort: 'name' })).toEqual(['Liga Abierta', 'Liga del Banco']);
    expect(await names({ p_sort: 'members' })).toEqual(['Liga del Banco', 'Liga Abierta']);
    expect(await names({ p_visibility: 'public' })).toEqual(['Liga Abierta']);
    expect(await names({ p_kind: 'torneo' })).toEqual([]);
    expect(await names({ p_sport: 'padel' })).toEqual([]);
    expect(await names({ p_search: 'otro@x' })).toEqual(['Liga Abierta']);
    expect(await names({ p_search: 'banco' })).toEqual(['Liga del Banco']);
    expect(await names({ p_search: w.pub })).toEqual(['Liga Abierta']);
    const p2 = await list({ p_sort: 'name', p_limit: 1, p_offset: 1 });
    expect([p2.total, p2.rows.map((r: Json) => r.name)]).toEqual([2, ['Liga del Banco']]);

    // Actividad: la liga con lo último que se movió va primero; sin nada, al final.
    await backdate('public.events', w.pub, '3 days');
    await backdate('public.events', w.priv, '9 days');
    await backdate('public.entries', w.priv, '1 day');
    const empty = (await db.rpc<Json>(w.u.otra, 'create_league', { p_name: 'Vacía' })).league_id;
    expect(await names({ p_sort: 'activity' })).toEqual(['Liga del Banco', 'Liga Abierta', 'Vacía']);
    const rows = (await list({ p_sort: 'activity' })).rows;
    expect(rows[2]).toMatchObject({ id: empty, lastActivityAt: null, members: 1, players: 1, events: 0 });
    expect(rows[0]).toEqual({
      id: w.priv,
      name: 'Liga del Banco',
      sport: 'bowling',
      kind: 'liga',
      visibility: 'private',
      logoPath: null,
      hasMinors: false,
      ownerId: w.u.org,
      ownerName: 'org',
      ownerEmail: 'org@x.com',
      members: 4,
      players: 2,
      events: 1,
      lastActivityAt: expect.stringMatching(/Z$/),
      createdAt: expect.stringMatching(/Z$/),
    });
    // La misma hora con cualquier orden.
    const byName = (await list({ p_sort: 'name' })).rows.find((r: Json) => r.id === w.priv);
    expect(byName.lastActivityAt).toBe(rows[0].lastActivityAt);

    await fails(list({ p_sort: 'raro' }), 'invalido');
    await fails(list({ p_kind: 'copa' }), 'invalido');
    await fails(list({ p_visibility: 'secreta' }), 'invalido');
  });
});

describe('series y resumen', () => {
  it('admin_series: un día por fila hasta hoy, con ceros', async () => {
    for (const days of [30, 90, 365]) {
      const s = await db.rpc<Json[]>(w.u.dios, 'admin_series', { p_days: days });
      expect(s).toHaveLength(days);
      expect(s.at(-1)!.day).toBe(await today());
      expect(s[0].day).toBe(await dayOffset(-(days - 1)));
      expect(Object.keys(s[0]).sort()).toEqual(['activeUsers', 'day', 'entries', 'events', 'matches', 'scans', 'signups']);
    }
    expect(await db.rpc<Json[]>(w.u.dios, 'admin_series', { p_days: 0 })).toHaveLength(1);
    expect(await db.rpc<Json[]>(w.u.dios, 'admin_series', { p_days: 5000 })).toHaveLength(366);
    expect(await db.rpc<Json[]>(w.u.dios, 'admin_series', { p_days: null })).toHaveLength(30);
  });

  it('admin_series: cuenta registros, activos, eventos, partidos, juegos y lecturas de cada día', async () => {
    await db.admin(`update public.profiles set created_at = now() - interval '2 days' where id = any($1)`, [[w.u.luis, w.u.ana]]);
    await db.admin(`update public.profiles set created_at = now() - interval '400 days' where id = $1`, [w.u.extra]);
    await db.rpc(w.u.luis, 'touch_seen');
    await db.rpc(w.u.org, 'touch_seen');
    await db.admin(`insert into private.daily_seen (day, user_id) values (private.console_day() - 1, $1)`, [w.u.org]);
    await db.admin(`update public.events set created_at = now() - interval '1 day' where id = $1`, [w.e.e9]);
    await db.admin(`insert into private.scan_days (day, n) values (private.console_day() - 3, 7)`);
    const s = await db.rpc<Json[]>(w.u.dios, 'admin_series', { p_days: 30 });
    const at = (back: number) => s[s.length - 1 - back];
    expect(at(0)).toMatchObject({ signups: 7, activeUsers: 2, events: 1, entries: 1, matches: 0 });
    expect(at(1)).toMatchObject({ signups: 0, activeUsers: 1, events: 1, entries: 0 });
    expect(at(2)).toMatchObject({ signups: 2, activeUsers: 0 });
    expect(at(3)).toMatchObject({ scans: 7, signups: 0 });
    expect(s.reduce((n, d) => n + d.signups, 0)).toBe(9);
  });

  it('admin_overview: los números de un mundo chico', async () => {
    await phone(w.u.luis);
    await phone(w.u.org);
    await db.rpc(w.u.luis, 'touch_seen');
    await db.admin(`update public.profiles set created_at = now() - interval '20 days' where id = $1`, [w.u.ana]);
    await db.admin(`update public.profiles set created_at = now() - interval '60 days' where id = $1`, [w.u.extra]);
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.otra, p_reason: null });
    await db.admin(`update auth.users set email_confirmed_at = now() where id = $1`, [w.u.org]);
    const pid = randomUUID();
    await db.admin(`insert into public.photos (id, league_id, path, bytes) values ($1, $2, $3, 1500)`, [pid, w.priv, `${w.priv}/${pid}.webp`]);
    await db.admin(`insert into public.push_outbox (user_id, subscription_id, title, sent_at) select user_id, id, 'x', now() from public.push_subscriptions where user_id = $1`, [w.u.luis]);
    await db.admin(`insert into public.push_outbox (user_id, subscription_id, title, attempts) select user_id, id, 'y', 5 from public.push_subscriptions where user_id = $1`, [w.u.org]);
    await db.admin(`insert into private.scan_days (day, n) values (private.scan_day(), 12)`);

    const o = await db.rpc<Json>(w.u.dios, 'admin_overview');
    expect(o.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(o.users).toEqual({ total: 10, new7d: 8, new30d: 9, active7d: 1, active30d: 1, superadmins: 2, blocked: 1, unconfirmed: 9 });
    expect(o.leagues).toMatchObject({ total: 2, public: 1, private: 1, tournaments: 0, withMinors: 0, new30d: 2, active7d: 2 });
    expect(o.leagues.bySport).toHaveLength(9);
    expect(o.leagues.bySport[0]).toEqual({ sport: 'bowling', leagues: 2, players: 3, active7d: 2 });
    expect(o.leagues.bySport[1]).toEqual({ sport: 'padel', leagues: 0, players: 0, active7d: 0 });
    expect(o.activity).toEqual({ events7d: 2, matches7d: 0, entries7d: 1, submissionsPending: 0, photos7d: 1 });
    expect(o.storage.photos).toBe(1);
    expect(o.storage.photosBytes).toBe(1500);
    expect(o.storage.dbBytes === null || o.storage.dbBytes > 0).toBe(true);
    expect(o.scan).toEqual({ today: 12, dailyLimit: 900, perUserLimit: 40 });
    expect(o.push).toEqual({ subscriptions: 2, queued: 0, sent24h: 1, failed24h: 1 });

    // Una liga sin movimiento en 7 días deja de contar como activa.
    await backdate('public.events', w.pub, '8 days');
    expect((await db.rpc<Json>(w.u.dios, 'admin_overview')).leagues.active7d).toBe(1);
  });
});

describe('touch_seen', () => {
  const seen = async (uid: string) =>
    (await db.admin<{ at: string | null }>(`select last_seen_at as at from public.profiles where id = $1`, [uid]))[0].at;

  it('escribe como mucho cada 6 horas y agrega el día una sola vez', async () => {
    await db.rpc(w.u.luis, 'touch_seen');
    const first = await seen(w.u.luis);
    expect(first).not.toBeNull();
    await db.admin(`update public.profiles set last_seen_at = now() - interval '5 hours' where id = $1`, [w.u.luis]);
    const fiveAgo = await seen(w.u.luis);
    await db.rpc(w.u.luis, 'touch_seen');
    expect(await seen(w.u.luis)).toEqual(fiveAgo);
    await db.admin(`update public.profiles set last_seen_at = now() - interval '7 hours' where id = $1`, [w.u.luis]);
    await db.rpc(w.u.luis, 'touch_seen');
    expect(await seen(w.u.luis)).toEqual(first);
    expect(await db.count('private.daily_seen', 'user_id = $1', [w.u.luis])).toBe(1);
    expect(await db.admin('select day = private.console_day() as ok from private.daily_seen')).toEqual([{ ok: true }]);
  });

  it('también a una cuenta bloqueada, y a una cuenta sin perfil no le pasa nada', async () => {
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'x' });
    await db.rpc(w.u.luis, 'touch_seen');
    expect(await seen(w.u.luis)).not.toBeNull();
    await db.rpc(randomUUID(), 'touch_seen');
    expect(await db.count('private.daily_seen')).toBe(1);
  });

  it('la limpieza pasa los días de hace más de 35 a un número por día (400 días) y la serie los sigue contando', async () => {
    await db.admin(
      `insert into private.daily_seen (day, user_id)
       select private.console_day() - d, u from unnest($1::int[]) d cross join unnest($2::uuid[]) u`,
      [[401, 399, 36, 35, 10], [w.u.luis]],
    );
    await db.admin(`insert into private.daily_seen (day, user_id) values (private.console_day() - 36, $1)`, [w.u.org]);
    // Borra de daily_seen lo de antes de hace 35 días: -401, -399 y los dos de -36.
    expect(await db.admin('select private.console_cleanup() as n')).toEqual([{ n: 4 }]);
    expect(await db.admin<{ back: number }>('select private.console_day() - day as back from private.daily_seen order by 1')).toEqual([
      { back: 10 },
      { back: 35 },
    ]);
    // Quedan los números por día (el de hace 401 días ya no sirve para ninguna serie).
    expect(await db.admin('select private.console_day() - day as back, users from private.daily_active order by 1')).toEqual([
      { back: 36, users: 2 },
      { back: 399, users: 1 },
    ]);
    const s = await db.rpc<Json[]>(w.u.dios, 'admin_series', { p_days: 365 });
    const at = (back: number) => s[s.length - 1 - back].activeUsers;
    expect([at(10), at(35), at(36), at(37)]).toEqual([1, 1, 2, 0]);
    // Correrla otra vez no cambia nada; un día que ya tenía número suma (no pisa).
    expect(await db.admin('select private.console_cleanup() as n')).toEqual([{ n: 0 }]);
    await db.admin(`insert into private.daily_seen (day, user_id) values (private.console_day() - 36, $1)`, [w.u.ana]);
    await db.admin('select private.console_cleanup()');
    expect(await db.admin('select users from private.daily_active where day = private.console_day() - 36')).toEqual([{ users: 3 }]);
    // Nadie de la app la corre ni lee esas tablas.
    await fails(db.as(w.u.dios, 'select private.console_cleanup()'), '42501');
    await fails(db.as(w.u.dios, 'select * from private.daily_active'), '42501');
  });
});

describe('sistema y lecturas de fotos', () => {
  it('admin_system en PGlite: sin migraciones ni cron, con cola de push, despierto y deportes', async () => {
    await phone(w.u.luis);
    await db.admin(`insert into public.push_outbox (user_id, subscription_id, title, created_at) select user_id, id, 'x', now() - interval '10 minutes' from public.push_subscriptions`);
    await db.admin(`insert into public.push_outbox (user_id, subscription_id, title, claimed_at, attempts) select user_id, id, 'y', now(), 1 from public.push_subscriptions`);
    let s = await db.rpc<Json>(w.u.dios, 'admin_system');
    expect(s).toMatchObject({ backend: 'local', migrations: null, cron: null, lastHeartbeat: null });
    expect(s.push).toMatchObject({ queued: 2, claimed: 1, failed24h: 0, oldestQueuedAt: expect.stringMatching(/Z$/) });
    expect(s.sportStatus).toHaveLength(9);
    expect(s.sportStatus[0]).toEqual({ sport: 'bowling', status: 'open', leagues: 2 });
    expect(s.sportStatus.map((x: Json) => x.sport)).toContain('swimming');

    await db.as(SERVICE, 'select public.ping()');
    s = await db.rpc<Json>(w.u.dios, 'admin_system');
    expect(s.lastHeartbeat).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('admin_scan_stats: por día (con ceros), por modelo y quién más lee', async () => {
    await db.admin(`insert into private.scan_days (day, n) values (private.scan_day(), 5), (private.scan_day() - 2, 3)`);
    await db.admin(
      `insert into private.scan_minutes (model, minute, n) values
         ('gemini-a', date_trunc('minute', now()), 4), ('gemini-a', now() - interval '2 days', 6), ('gemini-b', date_trunc('minute', now()), 1)`,
    );
    await db.admin(
      `insert into private.scan_usage (user_id, day, n) values ($1, private.scan_day(), 3), ($1, private.scan_day() - 1, 2), ($2, private.scan_day(), 1),
                                                              ($3, private.scan_day(), 0)`,
      [w.u.luis, w.u.org, w.u.ana],
    );
    const st = await db.rpc<Json>(w.u.dios, 'admin_scan_stats', { p_days: 30 });
    expect(st.days).toHaveLength(30);
    expect(st.days.at(-1).scans).toBe(5);
    expect(st.days.at(-2).scans).toBe(0);
    expect(st.days.at(-3).scans).toBe(3);
    expect(st.models).toEqual([
      { model: 'gemini-a', today: 4, total: 10 },
      { model: 'gemini-b', today: 1, total: 1 },
    ]);
    expect(st.topUsers).toEqual([
      { userId: w.u.luis, name: 'luis', email: 'luis@x.com', scans: 5 },
      { userId: w.u.org, name: 'org', email: 'org@x.com', scans: 1 },
    ]);
    expect(st).toMatchObject({ today: 5, dailyLimit: 900, perUserLimit: 40 });
    expect((await db.rpc<Json>(w.u.dios, 'admin_scan_stats', { p_days: 1000 })).days).toHaveLength(90);
  });
});

describe('lo que solo corre en Supabase, probado en PGlite', () => {
  const delPhoto = (who: string, path: string) => db.as(who, 'delete from storage.objects where name = $1 returning name', [path]);

  it('photo_admin_leagues: las ligas que administra, ninguna si la cuenta está bloqueada', async () => {
    const mine = async (who: string) => (await db.as<{ l: string }>(who, 'select l from private.photo_admin_leagues() l order by 1')).map((r) => r.l);
    expect(await mine(w.u.sofi)).toEqual([w.priv]);
    expect(await mine(w.u.luis)).toEqual([]);
    expect(await mine(w.u.dios)).toEqual([w.priv, w.pub].sort());
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.sofi, p_reason: 'x' });
    expect(await mine(w.u.sofi)).toEqual([]);
    // Leer sigue igual: admin_leagues (las demás políticas) no cambia.
    expect(await db.as(w.u.sofi, 'select l from private.admin_leagues() l')).toEqual([{ l: w.priv }]);
    await fails(db.asAnon('select private.photo_admin_leagues()'), '42501');
  });

  it('Storage (20260927001190_consola_supabase.sql): un admin bloqueado no borra archivos de fotos', async () => {
    // El archivo entero: sin pg_cron solo avisa; con storage.objects cambia la política de borrar.
    await db.pg.exec(readFileSync(join(MIGRATIONS_DIR, '20260927001190_consola_supabase.sql'), 'utf8'));
    // Lo que Supabase ya trae: RLS en storage.objects, permisos y una política de lectura.
    await db.pg.exec(`
      alter table storage.objects enable row level security;
      grant select, delete on storage.objects to authenticated;
      create policy t_read on storage.objects for select to authenticated using (true);
      insert into storage.buckets (id, name) values ('scoreboards', 'scoreboards') on conflict do nothing;
    `);
    const path = `${w.priv}/${randomUUID()}.webp`;
    await db.admin(`insert into storage.objects (bucket_id, name) values ('scoreboards', $1)`, [path]);
    expect(await delPhoto(w.u.luis, path)).toEqual([]);
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.sofi, p_reason: 'x' });
    expect(await delPhoto(w.u.sofi, path)).toEqual([]);
    await db.rpc(w.u.dios, 'admin_unblock_user', { p_user: w.u.sofi });
    expect(await delPhoto(w.u.sofi, path)).toEqual([{ name: path }]);
    expect(await db.count('pg_policies', `tablename = 'objects' and policyname = 'mm_scoreboards_delete'`)).toBe(1);
  });

  it('admin_overview: el tamaño de las fotos sale de Storage si hay', async () => {
    await db.pg.exec(`insert into storage.buckets (id, name) values ('scoreboards', 'scoreboards'), ('otro', 'otro') on conflict do nothing`);
    // Solo cuenta el bucket de las fotos.
    await db.admin(`insert into storage.objects (bucket_id, name, metadata) values ('scoreboards', $1, '{"size": 2048}'), ('otro', 'x', '{"size": 9}')`, [
      `${w.priv}/${randomUUID()}.webp`,
    ]);
    expect((await db.rpc<Json>(w.u.dios, 'admin_overview')).storage.photosBytes).toBe(2048);
  });

  it('admin_system con las tablas de Supabase (de mentira): migraciones y pg_cron con su última corrida', async () => {
    await db.pg.exec(`
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
      insert into supabase_migrations.schema_migrations values
        ('20260926000100', array['select 1'], 'base'), ('20260927001100', array['select 2'], 'consola');
      create schema cron;
      create table cron.job (jobid bigint primary key, schedule text, command text, jobname text);
      create table cron.job_run_details (runid bigint primary key, jobid bigint, status text, start_time timestamptz);
      insert into cron.job values (1, '*/15 * * * *', 'select 1', 'mm-recordatorios'), (2, '40 8 * * *', 'select 2', 'mm-consola-limpieza');
      insert into cron.job_run_details values (1, 1, 'failed', now() - interval '20 minutes'), (2, 1, 'succeeded', now() - interval '5 minutes');
    `);
    const s = await db.rpc<Json>(w.u.dios, 'admin_system');
    expect(s.backend).toBe('supabase');
    expect(s.migrations).toEqual([
      { version: '20260927001100', name: 'consola' },
      { version: '20260926000100', name: 'base' },
    ]);
    expect(s.cron).toEqual([
      { job: 'mm-consola-limpieza', schedule: '40 8 * * *', lastRunAt: null, lastStatus: null },
      { job: 'mm-recordatorios', schedule: '*/15 * * * *', lastRunAt: expect.stringMatching(/Z$/), lastStatus: 'succeeded' },
    ]);
    // CLI viejo, sin la columna name.
    await db.pg.exec('alter table supabase_migrations.schema_migrations drop column name');
    expect((await db.rpc<Json>(w.u.dios, 'admin_system')).migrations).toEqual([
      { version: '20260927001100', name: null },
      { version: '20260926000100', name: null },
    ]);
  });
});
