/**
 * Anotadores del torneo (20260929001400_anotadores.sql, docs/anotadores.md): nombrar y quitar anotadores (el dueño o un
 * admin), el anotador de una liga de boliche en sus torneos (no en las prácticas), invitar a anotar (invite_scorers y
 * lo que cambia al responder, en la campana y en el detalle), el link para anotar (crear, cambiar, quitar, ver sin
 * cuenta y entrar, también en una liga privada y sin jugador), quien solo anota (sin jugador hasta «También juego»),
 * los avisos, el tiempo real y los permisos.
 *
 * Mundo (fixture): liga privada del Banco (org dueño, sofi admin, luis y ana miembros; luis juega e1 con [150]; Pedro
 * sin cuenta), liga pública Abierta de otro y, con withCopa, el torneo sin liga «Copa» (público: org dueño, sofi admin,
 * luis anotador con su jugador JL, ana miembro; t1 «Copa» con PX inscrito). withCopa también le pone la marca de
 * anotador a ana en la del Banco. Cuentas sin liga: nuevo (nombre y @usuario 'new'), otra y extra.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, TestDb, fails } from './harness';
import { entry, event, league, makeWorld, member, withCopa, type Copa, type World } from './fixture';

let db: TestDb;
let w: World;
let c: Copa;

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
  c = await withCopa(db, w);
});
afterEach(async () => {
  await db.rollback();
});

type Json = Record<string, any>;
interface InviteResult {
  sent: number;
  results: { userId: string; status: string }[];
}
interface Link {
  id: string;
  code: string;
  scope: string;
  refId: string | null;
  title: string;
  path: string;
  expiresAt: string;
  uses: number;
  maxUses: number;
  status: string;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
}
interface Member {
  role: string;
  is_scorer: boolean;
  scorer_only: boolean;
}

const CODE_RE = /^[A-HJ-NP-Z2-9]{10}$/;
const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const photo = () => ({ id: randomUUID(), width: 10, height: 10, bytes: 1000 });

const NEW_RPC = ['create_scorer_link', 'invite_scorers', 'join_as_scorer', 'revoke_scorer_link', 'rotate_scorer_link', 'scorer_access',
  'scorer_link_preview', 'set_member_scorer'];
const HELPERS = ['new_scorer_code', 'scorer_ref_ok', 'scorer_title', 'scorer_path', 'scorer_invite_ok', 'league_invite_valid',
  'is_event_scorer', 'has_scorer_flag', 'scorer_link_status', 'scorer_link_json', 'emit_scorers', 'scorer_link_insert',
  'scorer_link_blocked', 'scorer_link_block', 'scorer_link_unblock', 'scorer_links_minors'];

const setScorer = (who: string, lid: string, uid: string, on: boolean | null, scope: string | null = null, ref: string | null = null) =>
  db.rpc(who, 'set_member_scorer', { p_league: lid, p_user: uid, p_scorer: on, p_scope: scope, p_ref: ref });
const inviteScorers = (who: string, lid: string, users: (string | null)[] | null, scope: string | null = 'liga', ref: string | null = null) =>
  db.rpc<InviteResult>(who, 'invite_scorers', { p_league: lid, p_users: users, p_scope: scope, p_ref: ref });
const invite = (who: string, lid: string, users: string[]) => db.rpc<InviteResult>(who, 'invite_to_league', { p_league: lid, p_users: users });
const respond = (who: string, id: string, accept: boolean | null, prefer: string | null = null) =>
  db.rpc<Json>(who, 'respond_league_invite', { p_invite: id, p_accept: accept, p_prefer: prefer });
const details = (who: string, id: string) => db.rpc<Json | null>(who, 'league_invite_details', { p_invite: id });
const myInvites = (who: string) => db.rpc<Json[]>(who, 'my_league_invites');
const access = (who: string, lid: string) => db.rpc<{ invites: Json[]; links: Link[] }>(who, 'scorer_access', { p_league: lid });
const createLink = (who: string, lid: string, scope: string | null = 'liga', ref: string | null = null) =>
  db.rpc<Link>(who, 'create_scorer_link', { p_league: lid, p_scope: scope, p_ref: ref });
const preview = (who: string, code: string | null) => db.rpc<Json | null>(who, 'scorer_link_preview', { p_code: code });
const join = (who: string, code: string | null) => db.rpc<Json | null>(who, 'join_as_scorer', { p_code: code });

/** La membresía (null si no es de la liga). */
const mem = async (lid: string, uid: string) =>
  (
    await db.admin<Member>('select role, is_scorer, scorer_only from public.league_members where league_id = $1 and user_id = $2', [lid, uid])
  )[0] ?? null;
const playersOf = (lid: string, uid: string) => db.count('public.players', 'league_id = $1 and user_id = $2', [lid, uid]);
/** La invitación de esa cuenta a esa liga: la pendiente o, si no hay, la más nueva. */
const inv = async (lid: string, uid: string) =>
  (
    await db.admin<{ id: string; status: string; invited_by: string | null; as_player: boolean; as_scorer: boolean; scope: string | null; ref_id: string | null }>(
      `select id, status, invited_by, as_player, as_scorer, scope, ref_id from public.league_invites where league_id = $1 and user_id = $2
        order by status = 'pending' desc, created_at desc, decided_at desc nulls first, id desc limit 1`,
      [lid, uid],
    )
  )[0];
const uses = async (id: string) => (await db.admin<{ uses: number }>('select uses from private.scorer_links where id = $1', [id]))[0].uses;
const phone = (uid: string) =>
  db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'BPclave', 'secreto')`, [
    uid,
    `https://fcm.googleapis.com/fcm/send/${uid}`,
  ]);
const pushes = (uid: string) => db.admin<Json>('select title, body, url, tag, ttl from public.push_outbox where user_id = $1 order by id', [uid]);
const block = (uid: string) => db.rpc(w.u.dios, 'admin_block_user', { p_user: uid, p_reason: 'prueba' });
const setRole = (lid: string, uid: string, role: string) =>
  db.admin('update public.league_members set role = $3 where league_id = $1 and user_id = $2', [lid, uid, role]);
/** Deja el límite de esa clave en p_hits (ventana de ahora). */
const fillLimit = (key: string, hits: number) =>
  db.admin(
    `insert into private.rate_limits (key, window_start, hits) values ($1, now(), $2)
     on conflict (key) do update set window_start = now(), hits = excluded.hits`,
    [key, hits],
  );
const hits = async (key: string) => (await db.admin<{ hits: number }>('select hits from private.rate_limits where key = $1', [key]))[0]?.hits ?? 0;
/** Un torneo de la liga del Banco (liga normal de boliche) con Luis inscrito. */
async function bankTourney(name = 'Copa del Banco') {
  const t = await event(db, w.priv, 'torneo', '2026-10-06', 3, name);
  const e = await entry(db, w.priv, t, w.p.luis, [null, null, null], [null, null, null]);
  return { t, e };
}

/** En la transacción de la prueba: un realtime.send falso que guarda lo que emit manda (como en Supabase). */
async function captureRealtime() {
  await db.admin('create schema if not exists realtime');
  await db.admin('create table realtime.sent (n serial, payload jsonb, event text, topic text, private boolean)');
  await db.admin(`create function realtime.send(payload jsonb, event text, topic text, private boolean default false) returns void
                  language sql as $$ insert into realtime.sent (payload, event, topic, private) values (payload, event, topic, private) $$`);
  return () => db.admin<{ topic: string; payload: Json }>(`select topic, payload from realtime.sent where event = 'scorers' order by n`);
}

describe('permisos', () => {
  it('las RPC nuevas: security definer, search_path vacío y con sesión (la vista previa del link también sin cuenta); las ayudas, nadie', async () => {
    const rows = await db.admin<{ fn: string; definer: boolean; anon: boolean; auth: boolean; uid: boolean; path: boolean }>(
      `select p.proname as fn, p.prosecdef as definer, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth, p.prosrc like '%private.require_uid()%' as uid,
              'search_path=""' = any (p.proconfig) as path
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1) order by 1`,
      [NEW_RPC],
    );
    expect(rows).toEqual(
      NEW_RPC.map((fn) => (fn === 'scorer_link_preview'
        ? { fn, definer: true, anon: true, auth: true, uid: false, path: true }
        : { fn, definer: true, anon: false, auth: true, uid: true, path: true })),
    );
    const helpers = await db.admin<{ fn: string; anon: boolean; auth: boolean }>(
      `select p.proname as fn, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = any ($1) order by 1`,
      [HELPERS],
    );
    expect(helpers.map((h) => h.fn)).toEqual([...HELPERS].sort());
    for (const h of helpers) expect(h, h.fn).toMatchObject({ anon: false, auth: false });
    // La firma nueva de set_member_scorer (la de 3 argumentos ya no existe).
    expect(await db.admin(`select to_regprocedure('public.set_member_scorer(uuid, uuid, boolean)') is null as gone,
                                  to_regprocedure('public.set_member_scorer(uuid, uuid, boolean, text, uuid)') is not null as ok`)).toEqual([
      { gone: true, ok: true },
    ]);
    // Sin cuenta: nada más que ver a qué lleva un link.
    for (const [fn, args] of [
      ['set_member_scorer', { p_league: c.copa, p_user: w.u.ana, p_scorer: true }],
      ['invite_scorers', { p_league: c.copa, p_users: [w.u.nuevo] }],
      ['scorer_access', { p_league: c.copa }],
      ['create_scorer_link', { p_league: c.copa }],
      ['rotate_scorer_link', { p_link: randomUUID() }],
      ['revoke_scorer_link', { p_link: randomUUID() }],
      ['join_as_scorer', { p_code: 'ABCDEFGHJK' }],
    ] as [string, Record<string, unknown>][]) {
      await fails(db.rpc(ANON, fn, args), '42501');
    }
    // Las tablas de los links (y de quién entró o ya no puede entrar con uno) no las lee nadie de la app.
    for (const who of [ANON, w.u.org, w.u.dios]) {
      await fails(db.as(who, 'select code from private.scorer_links'), '42501');
      await fails(db.as(who, 'select user_id from private.scorer_link_joins'), '42501');
      await fails(db.as(who, 'select user_id from private.scorer_link_blocks'), '42501');
    }
  });

  it('la vista memberships trae scorer_only', async () => {
    await db.admin(`update public.league_members set scorer_only = true where league_id = $1 and user_id = $2`, [c.copa, w.u.ana]);
    expect(await db.asUser(w.u.ana, 'select scorer_only, is_scorer, player_id from public.memberships where league_id = $1 and user_id = $2', [
      c.copa,
      w.u.ana,
    ])).toEqual([{ scorer_only: true, is_scorer: false, player_id: null }]);
    expect(await db.asUser(w.u.luis, 'select scorer_only from public.memberships where league_id = $1 and user_id = $2', [c.copa, w.u.luis])).toEqual([
      { scorer_only: false },
    ]);
  });
});

describe('set_member_scorer: el dueño o un admin', () => {
  it('un admin nombra y quita a un miembro (también al que nombró el dueño); no a sí mismo, ni a otro admin, ni al dueño', async () => {
    await setScorer(w.u.sofi, c.copa, w.u.ana, true);
    expect(await mem(c.copa, w.u.ana)).toEqual({ role: 'member', is_scorer: true, scorer_only: false });
    await member(db, c.copa, w.u.otra, 'admin', 'otra');
    await fails(setScorer(w.u.sofi, c.copa, w.u.sofi, true), DENIED);
    await fails(setScorer(w.u.sofi, c.copa, w.u.org, true), DENIED);
    await fails(setScorer(w.u.sofi, c.copa, w.u.otra, true), DENIED);
    // Un miembro (también el anotador) y alguien de fuera, no.
    await fails(setScorer(w.u.ana, c.copa, w.u.luis, false), DENIED);
    await fails(setScorer(w.u.luis, c.copa, w.u.ana, false), DENIED);
    await fails(setScorer(w.u.otro, c.copa, w.u.ana, false), DENIED);
    // El dueño, como antes: a cualquiera (también a otro admin o a sí mismo).
    await setScorer(w.u.org, c.copa, w.u.otra, true);
    await setScorer(w.u.org, c.copa, w.u.org, true);
    // Un admin le quita el permiso a luis (lo nombró el dueño en withCopa).
    await setScorer(w.u.sofi, c.copa, w.u.luis, false);
    const flags = await db.admin<{ user_id: string; is_scorer: boolean }>(
      'select user_id, is_scorer from public.league_members where league_id = $1 order by display_name',
      [c.copa],
    );
    expect(flags).toEqual([
      { user_id: w.u.ana, is_scorer: true },
      { user_id: w.u.luis, is_scorer: false },
      { user_id: w.u.org, is_scorer: true },
      { user_id: w.u.otra, is_scorer: true },
      { user_id: w.u.sofi, is_scorer: false },
    ]);
    // El superadmin también.
    await setScorer(w.u.dios, c.copa, w.u.sofi, true);
    expect((await mem(c.copa, w.u.sofi))?.is_scorer).toBe(true);
  });

  it('no_existe e invalido: quien no es miembro, una cuenta bloqueada y un torneo de otra liga', async () => {
    await fails(setScorer(w.u.org, c.copa, w.u.nuevo, true), 'no_existe');
    await fails(setScorer(w.u.sofi, c.copa, randomUUID(), true), 'no_existe');
    await member(db, c.copa, w.u.extra, 'member', 'extra');
    await block(w.u.extra);
    await fails(setScorer(w.u.org, c.copa, w.u.extra, true), 'invalido');
    await fails(setScorer(w.u.org, c.copa, w.u.ana, true, 'evento', w.e.e9), 'invalido');
    await fails(setScorer(w.u.org, c.copa, w.u.ana, true, 'evento', null), 'invalido');
    await fails(setScorer(w.u.org, c.copa, w.u.ana, true, 'liga', c.t1), 'invalido');
    await fails(setScorer(w.u.org, c.copa, w.u.ana, true, 'torneo', c.t1), 'invalido');
    await fails(setScorer(w.u.org, c.copa, w.u.ana, true, 'playoff', c.t1), 'invalido');
    expect((await mem(c.copa, w.u.ana))?.is_scorer).toBe(false);
    // Una liga que no existe: nadie es admin de ella.
    await fails(setScorer(w.u.org, randomUUID(), w.u.ana, true), DENIED);
  });

  it('nombrar avisa una vez («Ahora puedes anotar en …», lleva al torneo); no a uno mismo ni a quien apagó «Tus ligas»', async () => {
    await phone(w.u.ana);
    await setScorer(w.u.sofi, c.copa, w.u.ana, true, 'evento', c.t1);
    await setScorer(w.u.sofi, c.copa, w.u.ana, true, 'evento', c.t1);
    await setScorer(w.u.sofi, c.copa, w.u.ana, false);
    await setScorer(w.u.sofi, c.copa, w.u.ana, true, 'evento', c.t1);
    expect(await pushes(w.u.ana)).toEqual([
      {
        title: 'Ahora puedes anotar en Copa',
        body: 'sofi te nombró anotador. Toca para ir.',
        url: `/l/${c.copa}/e/${c.t1}`,
        tag: `anotador:${c.copa}`,
        ttl: 86400,
      },
    ]);
    // Ya le llegó: quitar y nombrar otra vez el mismo día no le manda otro (uno por día y liga); al otro día, sí.
    await db.admin('update public.push_outbox set sent_at = now() where user_id = $1', [w.u.ana]);
    for (let i = 0; i < 3; i++) {
      await setScorer(w.u.sofi, c.copa, w.u.ana, false);
      await setScorer(w.u.sofi, c.copa, w.u.ana, true, 'evento', c.t1);
    }
    expect(await pushes(w.u.ana)).toHaveLength(1);
    await db.admin(`update public.push_outbox set created_at = now() - interval '25 hours' where user_id = $1`, [w.u.ana]);
    await setScorer(w.u.sofi, c.copa, w.u.ana, false);
    await setScorer(w.u.sofi, c.copa, w.u.ana, true, 'evento', c.t1);
    expect((await pushes(w.u.ana)).map((p) => p.tag)).toEqual([`anotador:${c.copa}`, `anotador:${c.copa}`]);
    // Un torneo sin nombre en una liga normal: «Torneo del martes 6 de octubre»; sin contexto, la liga.
    const t = await event(db, w.priv, 'torneo', '2026-10-06');
    await phone(w.u.luis);
    await setScorer(w.u.org, w.priv, w.u.luis, true, 'evento', t);
    expect((await pushes(w.u.luis)).map((p) => [p.title, p.body, p.url])).toEqual([
      ['Ahora puedes anotar en Torneo del martes 6 de octubre', 'org te nombró anotador. Toca para ir.', `/l/${w.priv}/e/${t}`],
    ]);
    // El dueño nombrándose a sí mismo: sin aviso.
    await phone(w.u.org);
    await setScorer(w.u.org, c.copa, w.u.org, true);
    expect(await pushes(w.u.org)).toEqual([]);
    // Quien apagó los avisos de sus ligas no lo recibe (el prefijo anotador: es de «Tus ligas»).
    await db.rpc(w.u.luis, 'set_push_prefs', { p_prefs: { liga: false } });
    await setScorer(w.u.org, c.copa, w.u.luis, false);
    await setScorer(w.u.org, c.copa, w.u.luis, true);
    expect(await pushes(w.u.luis)).toHaveLength(1);
  });

  it('quitarle el permiso a quien entró solo para anotar lo saca de la liga; a quien juega, lo deja como jugador', async () => {
    await db.admin(`insert into public.league_members (league_id, user_id, role, display_name, is_scorer, scorer_only)
                    values ($1, $2, 'member', 'new', true, true)`, [c.copa, w.u.nuevo]);
    await setScorer(w.u.sofi, c.copa, w.u.nuevo, false);
    expect(await mem(c.copa, w.u.nuevo)).toBeNull();
    expect(await db.count('public.tombstones', `tbl = 'league_members' and row_key = $1`, [`${c.copa}:${w.u.nuevo}`])).toBe(1);
    // Luis juega en la copa (JL): sigue como jugador.
    await setScorer(w.u.sofi, c.copa, w.u.luis, false);
    expect(await mem(c.copa, w.u.luis)).toEqual({ role: 'member', is_scorer: false, scorer_only: false });
    expect(await playersOf(c.copa, w.u.luis)).toBe(1);
    // Un admin que entró solo para anotar pierde la marca y sigue sin jugador (y sin que se lo creen).
    await db.admin(`insert into public.league_members (league_id, user_id, role, display_name, is_scorer, scorer_only)
                    values ($1, $2, 'admin', 'extra', true, true)`, [c.copa, w.u.extra]);
    await setScorer(w.u.org, c.copa, w.u.extra, false);
    expect(await mem(c.copa, w.u.extra)).toEqual({ role: 'admin', is_scorer: false, scorer_only: true });
    expect(await db.rpc(w.u.extra, 'ensure_my_player', { p_league: c.copa })).toBeNull();
    // Quitar a quien no anota: nada.
    await setScorer(w.u.org, c.copa, w.u.ana, false);
    expect(await mem(c.copa, w.u.ana)).toEqual({ role: 'member', is_scorer: false, scorer_only: false });
  });

  it('a quien el dueño eligió para «Diseña insignias» un admin le quita la marca, pero no lo saca de la liga', async () => {
    await db.admin(`insert into public.league_members (league_id, user_id, role, display_name, is_scorer, scorer_only, badge_maker)
                    values ($1, $2, 'member', 'new', true, true, true)`, [c.copa, w.u.nuevo]);
    await setScorer(w.u.sofi, c.copa, w.u.nuevo, false);
    expect(await db.admin('select is_scorer, scorer_only, badge_maker from public.league_members where league_id = $1 and user_id = $2', [
      c.copa,
      w.u.nuevo,
    ])).toEqual([{ is_scorer: false, scorer_only: true, badge_maker: true }]);
    // remove_member tampoco deja al admin (sacarlo es del dueño); el dueño sí.
    await fails(db.rpc(w.u.sofi, 'remove_member', { p_league: c.copa, p_user: w.u.nuevo }), DENIED);
    await db.rpc(w.u.org, 'remove_member', { p_league: c.copa, p_user: w.u.nuevo });
    expect(await mem(c.copa, w.u.nuevo)).toBeNull();
  });
});

describe('boliche en una liga normal: el anotador anota los torneos, no las prácticas', () => {
  it('en un torneo de la liga: save_game, update_entry, save_verified_games (a quien ya está), pistas y la foto', async () => {
    const { t, e } = await bankTourney();
    // Ana tiene la marca en la del Banco (withCopa) y no tiene jugador ahí.
    await db.rpc(w.u.ana, 'save_game', { p_entry: e, p_game: 0, p_score: 190 });
    await db.rpc(w.u.ana, 'update_entry', { p_entry: e, p_patch: { scores: [190, 200, null] } });
    await db.rpc(w.u.ana, 'save_verified_games', { p_event: t, p_photo: photo(), p_writes: [{ player_id: w.p.luis, values: { '2': 210 } }] });
    expect(await db.admin<{ scores: number[] }>('select scores from public.entries where id = $1', [e])).toEqual([{ scores: [190, 200, 210] }]);
    expect((await db.rpc<Json>(w.u.ana, 'assign_lanes', { p_event: t, p_lanes: [1], p_per_lane: 4, p_mode: 'azar' })).count).toBe(1);
    const r = await db.rpc<{ id: string; path: string }>(w.u.ana, 'add_photo', { p_league: w.priv, p_event: t, p_width: 1, p_height: 1 });
    expect(r.path).toBe(`${w.priv}/${r.id}.webp`);
    // Como antes: no inscribe (ni con la foto) ni cambia lo del admin.
    await fails(
      db.rpc(w.u.ana, 'save_verified_games', { p_event: t, p_photo: photo(), p_writes: [{ player_id: w.p.pedro, values: { '0': 150 } }] }),
      DENIED,
    );
    await fails(db.rpc(w.u.ana, 'update_entry', { p_entry: e, p_patch: { average: 200 } }), DENIED);
    await fails(db.rpc(w.u.ana, 'add_entries', { p_event: t, p_players: [{ player_id: w.p.pedro, average: 0 }] }), DENIED);
    // Sin la marca, un miembro no (luis juega el torneo).
    await fails(db.rpc(w.u.luis, 'save_game', { p_entry: e, p_game: 1, p_score: 300 }), DENIED);
    await fails(db.rpc(w.u.luis, 'assign_lanes', { p_event: t, p_lanes: [1], p_per_lane: 4, p_mode: 'azar' }), DENIED);
  });

  it('en una práctica sigue sin permiso', async () => {
    await fails(db.rpc(w.u.ana, 'save_game', { p_entry: w.e1Luis, p_game: 0, p_score: 300 }), DENIED);
    await fails(db.rpc(w.u.ana, 'update_entry', { p_entry: w.e1Luis, p_patch: { scores: [300] } }), DENIED);
    await fails(
      db.rpc(w.u.ana, 'save_verified_games', { p_event: w.e.e1, p_photo: photo(), p_writes: [{ player_id: w.p.luis, values: { '0': 300 } }] }),
      DENIED,
    );
    await fails(db.rpc(w.u.ana, 'assign_lanes', { p_event: w.e.e1, p_lanes: [1], p_per_lane: 4, p_mode: 'azar' }), DENIED);
    expect(await db.admin('select scores from public.entries where id = $1', [w.e1Luis])).toEqual([{ scores: [150] }]);
  });

  it('en una liga con menores el anotador no sube fotos', async () => {
    const { t } = await bankTourney();
    await db.admin('update public.leagues set require_photo = false, has_minors = true where id = $1', [w.priv]);
    await fails(db.rpc(w.u.ana, 'add_photo', { p_league: w.priv, p_event: t, p_width: 1, p_height: 1 }), DENIED);
  });
});

describe('invite_scorers', () => {
  it('solo un admin; de 1 a 20 cuentas; el contexto tiene que ser de la liga', async () => {
    await member(db, w.pub, w.u.luis, 'member', 'luis');
    await fails(inviteScorers(w.u.luis, w.pub, [w.u.nuevo]), DENIED);
    await fails(inviteScorers(w.u.ana, c.copa, [w.u.nuevo]), DENIED);
    await fails(inviteScorers(w.u.luis, c.copa, [w.u.nuevo]), DENIED);
    await fails(inviteScorers(w.u.otra, c.copa, [w.u.nuevo]), DENIED);
    await fails(inviteScorers(w.u.org, randomUUID(), [w.u.nuevo]), 'no_existe');
    await fails(inviteScorers(w.u.org, c.copa, []), 'invalido');
    await fails(inviteScorers(w.u.org, c.copa, null), 'invalido');
    await fails(inviteScorers(w.u.org, c.copa, [null]), 'invalido');
    await fails(inviteScorers(w.u.org, c.copa, Array.from({ length: 21 }, () => randomUUID())), 'invalido');
    await fails(inviteScorers(w.u.org, c.copa, [w.u.nuevo], 'evento', w.e.e9), 'invalido');
    await fails(inviteScorers(w.u.org, c.copa, [w.u.nuevo], 'playoff', c.t1), 'invalido');
    await fails(inviteScorers(w.u.org, c.copa, [w.u.nuevo], 'liga', c.t1), 'invalido');
    expect(await db.count('public.league_invites')).toBe(0);
    // 20 distintas (con repetidas y null) sí.
    const many = Array.from({ length: 20 }, () => randomUUID());
    const r = await inviteScorers(w.u.org, c.copa, [...many, null, many[0]]);
    expect(r.results.map((x) => x.userId)).toEqual(many);
  });

  it('estados: sent, member, unavailable, pending y declined (7 días)', async () => {
    await block(w.u.extra);
    const ghost = randomUUID();
    const r = await inviteScorers(w.u.sofi, c.copa, [w.u.nuevo, w.u.ana, w.u.sofi, w.u.extra, w.u.nuevo, ghost], 'evento', c.t1);
    expect(r).toEqual({
      sent: 1,
      results: [
        { userId: w.u.nuevo, status: 'sent' },
        { userId: w.u.ana, status: 'member' },
        { userId: w.u.sofi, status: 'unavailable' },
        { userId: w.u.extra, status: 'unavailable' },
        { userId: ghost, status: 'unavailable' },
      ],
    });
    const a = await inv(c.copa, w.u.nuevo);
    expect(a).toMatchObject({ status: 'pending', invited_by: w.u.sofi, as_player: false, as_scorer: true, scope: 'evento', ref_id: c.t1 });
    // Otra vez (también otro admin): ya la tiene. Y cuenta como invitada para invite_to_league.
    expect((await inviteScorers(w.u.org, c.copa, [w.u.nuevo])).results).toEqual([{ userId: w.u.nuevo, status: 'pending' }]);
    expect((await invite(w.u.org, c.copa, [w.u.nuevo])).results).toEqual([{ userId: w.u.nuevo, status: 'pending' }]);
    // La rechaza: 7 días sin otra.
    expect(await respond(w.u.nuevo, a.id, false)).toEqual({ status: 'declined', leagueId: c.copa });
    expect((await inviteScorers(w.u.sofi, c.copa, [w.u.nuevo])).results).toEqual([{ userId: w.u.nuevo, status: 'declined' }]);
    await db.admin(`update public.league_invites set decided_at = now() - interval '8 days' where id = $1`, [a.id]);
    expect((await inviteScorers(w.u.sofi, c.copa, [w.u.nuevo])).results).toEqual([{ userId: w.u.nuevo, status: 'sent' }]);
    expect(await inv(c.copa, w.u.nuevo)).toMatchObject({ status: 'pending', scope: 'liga', ref_id: null });
  });

  it('el límite es el de invite_to_league (100 por día por cuenta)', async () => {
    await fillLimit(`invite:${w.u.org}`, 99);
    expect(await inviteScorers(w.u.org, c.copa, [w.u.nuevo, w.u.otra])).toEqual({
      sent: 1,
      results: [
        { userId: w.u.nuevo, status: 'sent' },
        { userId: w.u.otra, status: 'rate_limited' },
      ],
    });
    expect(await hits(`invite:${w.u.org}`)).toBe(100);
    await fails(inviteScorers(w.u.org, c.copa, [w.u.otra]), 'rate_limited');
    await fails(invite(w.u.org, w.priv, [w.u.otra]), 'rate_limited');
    // Otra cuenta, su propio límite.
    expect((await inviteScorers(w.u.sofi, c.copa, [w.u.otra])).sent).toBe(1);
  });

  it('si ya tenía una para jugar, la reemplaza: la nueva invita a las dos cosas', async () => {
    await invite(w.u.org, w.priv, [w.u.nuevo]);
    const old = await inv(w.priv, w.u.nuevo);
    expect((await inviteScorers(w.u.sofi, w.priv, [w.u.nuevo])).results).toEqual([{ userId: w.u.nuevo, status: 'sent' }]);
    expect(await db.admin('select status from public.league_invites where id = $1', [old.id])).toEqual([{ status: 'cancelled' }]);
    expect(await inv(w.priv, w.u.nuevo)).toMatchObject({
      status: 'pending',
      invited_by: w.u.sofi,
      as_player: true,
      as_scorer: true,
      scope: 'liga',
      ref_id: null,
    });
    // Ya es una de anotador pendiente.
    expect((await inviteScorers(w.u.org, w.priv, [w.u.nuevo])).results).toEqual([{ userId: w.u.nuevo, status: 'pending' }]);
    expect(await db.count('public.league_invites', 'league_id = $1 and user_id = $2', [w.priv, w.u.nuevo])).toBe(2);
  });

  it('push «<admin> te invitó a anotar en <torneo>»: a la invitación, uno por día de quien invita', async () => {
    await phone(w.u.nuevo);
    await inviteScorers(w.u.sofi, c.copa, [w.u.nuevo], 'evento', c.t1);
    const { id } = await inv(c.copa, w.u.nuevo);
    const first = {
      title: 'sofi te invitó a anotar en Copa',
      body: 'Toca para ver la invitación. No te inscribe como jugador.',
      url: `/invitacion/${id}`,
      tag: `invitacion:${id}`,
      ttl: 604800,
    };
    expect(await pushes(w.u.nuevo)).toEqual([first]);
    // Retirar y volver a invitar el mismo día: no le llena el teléfono.
    await db.rpc(w.u.sofi, 'cancel_league_invite', { p_invite: id });
    expect((await inviteScorers(w.u.sofi, c.copa, [w.u.nuevo])).sent).toBe(1);
    expect(await pushes(w.u.nuevo)).toEqual([first]);
    // Con una para jugar de otro admin: «También te invitó a jugar».
    await phone(w.u.otra);
    await invite(w.u.org, w.priv, [w.u.otra]);
    await inviteScorers(w.u.sofi, w.priv, [w.u.otra]);
    const id2 = (await inv(w.priv, w.u.otra)).id;
    expect((await pushes(w.u.otra)).map((p) => [p.title, p.body, p.url, p.tag])).toEqual([
      ['org te invitó a Liga del Banco', 'Toca para ver la invitación y unirte.', expect.any(String), expect.any(String)],
      ['sofi te invitó a anotar en Liga del Banco', 'También te invitó a jugar. Toca para ver la invitación.', `/invitacion/${id2}`, `invitacion:${id2}`],
    ]);
    // Quien apagó «Tus ligas» no lo recibe (la invitación igual sale en su campana).
    await phone(w.u.extra);
    await db.rpc(w.u.extra, 'set_push_prefs', { p_prefs: { liga: false } });
    expect((await inviteScorers(w.u.sofi, c.copa, [w.u.extra])).sent).toBe(1);
    expect(await pushes(w.u.extra)).toEqual([]);
    expect((await myInvites(w.u.extra)).map((i) => i.leagueId)).toEqual([c.copa]);
  });

  it('una de solo anotar que ya no vale no cuenta como invitada (search_people, invite_to_league)', async () => {
    await member(db, w.pub, w.u.luis, 'admin', 'luis');
    await inviteScorers(w.u.luis, w.pub, [w.u.nuevo]);
    const find = async () => (await db.rpc<Json[]>(w.u.otro, 'search_people', { p_query: 'new', p_league: w.pub })).find((p) => p.id === w.u.nuevo);
    expect(await find()).toMatchObject({ invited: true, inLeague: false });
    // Luis deja de ser admin: en la pública la parte de anotar ya no vale (y no invitaba a jugar).
    await setRole(w.pub, w.u.luis, 'member');
    expect(await find()).toMatchObject({ invited: false });
    expect(await myInvites(w.u.nuevo)).toEqual([]);
    expect((await invite(w.u.otro, w.pub, [w.u.nuevo])).results).toEqual([{ userId: w.u.nuevo, status: 'sent' }]);
    expect(await db.count('public.league_invites', `league_id = $1 and user_id = $2 and status = 'cancelled'`, [w.pub, w.u.nuevo])).toBe(1);
  });
});

describe('responder una invitación de anotador', () => {
  it('aceptar: anotador, solo para anotar y sin jugador (aunque llegue p_prefer); push «aceptó anotar»', async () => {
    await phone(w.u.sofi);
    await inviteScorers(w.u.sofi, c.copa, [w.u.nuevo], 'evento', c.t1);
    const { id } = await inv(c.copa, w.u.nuevo);
    const players = await db.count('public.players', 'league_id = $1', [c.copa]);
    expect(await respond(w.u.nuevo, id, true, c.px)).toEqual({
      status: 'accepted',
      leagueId: c.copa,
      playerId: null,
      claimId: null,
      scorer: { title: 'Copa', scope: 'evento', refId: c.t1, path: `/l/${c.copa}/e/${c.t1}` },
    });
    expect(await mem(c.copa, w.u.nuevo)).toEqual({ role: 'member', is_scorer: true, scorer_only: true });
    expect(await db.count('public.players', 'league_id = $1', [c.copa])).toBe(players);
    expect(await db.count('public.player_claims')).toBe(0);
    expect((await inv(c.copa, w.u.nuevo)).status).toBe('accepted');
    expect(await pushes(w.u.sofi)).toEqual([
      { title: 'new aceptó anotar en Copa', body: 'Ya puede anotar.', url: `/l/${c.copa}/e/${c.t1}`, tag: `invitacion-ok:${id}`, ttl: 86400 },
    ]);
    // Ya anota en el torneo (sin jugador) y la app no le crea uno.
    await db.rpc(w.u.nuevo, 'save_game', { p_entry: c.t1Px, p_game: 0, p_score: 180 });
    expect(await db.rpc(w.u.nuevo, 'ensure_my_player', { p_league: c.copa })).toBeNull();
    // Otra vez: cómo quedó.
    expect(await respond(w.u.nuevo, id, true)).toEqual({ status: 'accepted', leagueId: c.copa });
  });

  it('también para jugar: entra con su jugador y anota (no queda «solo anota»)', async () => {
    await invite(w.u.org, w.priv, [w.u.nuevo]);
    await inviteScorers(w.u.sofi, w.priv, [w.u.nuevo]);
    const { id } = await inv(w.priv, w.u.nuevo);
    const r = await respond(w.u.nuevo, id, true, w.p.pedro);
    expect(r).toEqual({
      status: 'accepted',
      leagueId: w.priv,
      playerId: expect.any(String),
      claimId: expect.any(String),
      scorer: { title: 'Liga del Banco', scope: 'liga', refId: null, path: `/l/${w.priv}` },
    });
    expect(await mem(w.priv, w.u.nuevo)).toEqual({ role: 'member', is_scorer: true, scorer_only: false });
    expect(await playersOf(w.priv, w.u.nuevo)).toBe(1);
  });

  it('si quien invitó ya no es admin: en la pública entra solo a jugar; en la privada, la de solo anotar ya no vale', async () => {
    await member(db, w.pub, w.u.luis, 'admin', 'luis');
    await invite(w.u.luis, w.pub, [w.u.nuevo]);
    await inviteScorers(w.u.luis, w.pub, [w.u.nuevo]);
    const a = (await inv(w.pub, w.u.nuevo)).id;
    await setRole(w.pub, w.u.luis, 'member');
    expect(await details(w.u.nuevo, a)).not.toHaveProperty('scorer');
    expect(await respond(w.u.nuevo, a, true)).toEqual({ status: 'accepted', leagueId: w.pub, playerId: expect.any(String), claimId: null });
    expect(await mem(w.pub, w.u.nuevo)).toEqual({ role: 'member', is_scorer: false, scorer_only: false });

    await inviteScorers(w.u.sofi, w.priv, [w.u.extra]);
    const b = (await inv(w.priv, w.u.extra)).id;
    await setRole(w.priv, w.u.sofi, 'member');
    expect(await respond(w.u.extra, b, true)).toEqual({ status: 'cancelled', leagueId: w.priv });
    expect(await mem(w.priv, w.u.extra)).toBeNull();
    // Y si quien invitó está bloqueado, tampoco.
    await inviteScorers(w.u.org, c.copa, [w.u.otra]);
    const d = (await inv(c.copa, w.u.otra)).id;
    await block(w.u.org);
    expect(await respond(w.u.otra, d, true)).toEqual({ status: 'cancelled', leagueId: c.copa });
  });

  it('entrar por otro camino con una de anotador pendiente: jugador y anotador; la invitación queda aceptada', async () => {
    await inviteScorers(w.u.sofi, w.priv, [w.u.nuevo]);
    const r = await db.rpc<Json>(w.u.nuevo, 'join_league', { p_code: w.code });
    expect(r.player_id).toEqual(expect.any(String));
    expect(await mem(w.priv, w.u.nuevo)).toEqual({ role: 'member', is_scorer: true, scorer_only: false });
    expect((await inv(w.priv, w.u.nuevo)).status).toBe('accepted');
    // Con una para jugar, no.
    await invite(w.u.otro, w.pub, [w.u.extra]);
    await db.rpc(w.u.extra, 'join_league', { p_league: w.pub });
    expect(await mem(w.pub, w.u.extra)).toEqual({ role: 'member', is_scorer: false, scorer_only: false });
    // Ni si la de anotador ya no vale (quien invitó dejó de ser admin).
    await member(db, w.pub, w.u.luis, 'admin', 'luis');
    await inviteScorers(w.u.luis, w.pub, [w.u.otra]);
    await setRole(w.pub, w.u.luis, 'member');
    await db.rpc(w.u.otra, 'join_league', { p_league: w.pub });
    expect(await mem(w.pub, w.u.otra)).toEqual({ role: 'member', is_scorer: false, scorer_only: false });
  });
});

describe('lo que lee la invitada: la campana y el detalle', () => {
  it('my_league_invites: scorer solo en las de anotador que valen; las demás, igual que antes', async () => {
    await invite(w.u.otro, w.pub, [w.u.nuevo]);
    await inviteScorers(w.u.sofi, c.copa, [w.u.nuevo], 'evento', c.t1);
    await db.admin(`update public.league_invites set created_at = now() - interval '1 hour' where league_id = $1`, [w.pub]);
    const [a, b] = [await inv(c.copa, w.u.nuevo), await inv(w.pub, w.u.nuevo)];
    expect(await myInvites(w.u.nuevo)).toEqual([
      {
        id: a.id,
        leagueId: c.copa,
        leagueName: 'Copa',
        logoPath: null,
        sport: 'bowling',
        kind: 'torneo',
        visibility: 'public',
        members: 4,
        invitedBy: { id: w.u.sofi, name: 'sofi', username: 'sofi' },
        createdAt: ISO,
        scorer: { title: 'Copa', scope: 'evento', refId: c.t1, path: `/l/${c.copa}/e/${c.t1}`, asPlayer: false },
      },
      {
        id: b.id,
        leagueId: w.pub,
        leagueName: 'Liga Abierta',
        logoPath: null,
        sport: 'bowling',
        kind: 'liga',
        visibility: 'public',
        members: 1,
        invitedBy: { id: w.u.otro, name: 'otro', username: 'otro' },
        createdAt: ISO,
      },
    ]);
    // Quien la mandó deja de ser admin: la de solo anotar ya no sale.
    await setRole(c.copa, w.u.sofi, 'member');
    expect((await myInvites(w.u.nuevo)).map((i) => i.id)).toEqual([b.id]);
  });

  it('league_invite_details: scorer; sin «¿Quién eres?» en la de solo anotar; con la de jugar, los libres', async () => {
    await inviteScorers(w.u.sofi, c.copa, [w.u.nuevo], 'evento', c.t1);
    const a = (await inv(c.copa, w.u.nuevo)).id;
    expect(await details(w.u.nuevo, a)).toMatchObject({
      status: 'pending',
      invitedBy: { id: w.u.sofi },
      league: { id: c.copa, name: 'Copa', kind: 'torneo' },
      players: [],
      scorer: { title: 'Copa', scope: 'evento', refId: c.t1, path: `/l/${c.copa}/e/${c.t1}`, asPlayer: false },
    });
    // Para jugar y anotar: los jugadores libres y asPlayer.
    await invite(w.u.org, w.priv, [w.u.nuevo]);
    await inviteScorers(w.u.sofi, w.priv, [w.u.nuevo]);
    const b = (await inv(w.priv, w.u.nuevo)).id;
    expect(await details(w.u.nuevo, b)).toMatchObject({
      status: 'pending',
      players: [{ id: w.p.pedro, name: 'Pedro' }],
      scorer: { title: 'Liga del Banco', scope: 'liga', refId: null, path: `/l/${w.priv}`, asPlayer: true },
    });
    // Una normal: sin scorer (igual que antes).
    await invite(w.u.otro, w.pub, [w.u.nuevo]);
    expect(await details(w.u.nuevo, (await inv(w.pub, w.u.nuevo)).id)).not.toHaveProperty('scorer');
    // Quien invitó deja de ser admin: la de solo anotar sale como cancelada (y dice que era para anotar).
    await setRole(c.copa, w.u.sofi, 'member');
    expect(await details(w.u.nuevo, a)).toMatchObject({ status: 'cancelled', players: [], scorer: { title: 'Copa' } });
    // Si el evento se borra, el texto es el de la liga y lleva a su portada.
    await db.admin('delete from public.events where id = $1', [c.t1]);
    expect((await details(w.u.nuevo, a))?.scorer).toEqual({ title: 'Copa', scope: 'evento', refId: c.t1, path: `/l/${c.copa}`, asPlayer: false });
  });
});

describe('el link para anotar', () => {
  it('crear: solo un admin; no en una liga con menores; el contexto tiene que ser de la liga', async () => {
    for (const who of [w.u.luis, w.u.ana, w.u.otra]) await fails(createLink(who, c.copa), DENIED);
    await fails(createLink(w.u.org, randomUUID()), 'no_existe');
    const kids = await league(db, w.u.org, { name: 'Escuelita', visibility: 'private', requirePhoto: false, hasMinors: true });
    await member(db, kids, w.u.org, 'owner', 'org');
    await fails(createLink(w.u.org, kids), 'invalido');
    await fails(createLink(w.u.org, c.copa, 'evento', w.e.e9), 'invalido');
    await fails(createLink(w.u.org, c.copa, 'evento', null), 'invalido');
    await fails(createLink(w.u.org, c.copa, 'liga', c.t1), 'invalido');
    await fails(createLink(w.u.org, c.copa, 'x', null), 'invalido');
    expect(await db.count('private.scorer_links')).toBe(0);
    // En la de menores sí se invita por @usuario.
    expect((await inviteScorers(w.u.org, kids, [w.u.nuevo])).sent).toBe(1);
  });

  it('crear dos veces da el mismo (sin costo); su forma; scorer_access lo lista con las invitaciones', async () => {
    const a = await createLink(w.u.sofi, c.copa, 'evento', c.t1);
    expect(a).toEqual({
      id: expect.any(String),
      code: expect.stringMatching(CODE_RE),
      scope: 'evento',
      refId: c.t1,
      title: 'Copa',
      path: `/l/${c.copa}/e/${c.t1}`,
      expiresAt: ISO,
      uses: 0,
      maxUses: 20,
      status: 'ok',
      createdBy: { id: w.u.sofi, name: 'sofi' },
      createdAt: ISO,
    });
    expect(await createLink(w.u.org, c.copa, 'evento', c.t1)).toEqual(a);
    expect(await db.admin(`select expires_at - created_at = interval '7 days' as ok from private.scorer_links where id = $1`, [a.id])).toEqual([
      { ok: true },
    ]);
    // Otro contexto: otro link. Solo crear cuesta.
    const b = await createLink(w.u.org, c.copa);
    expect(b).toMatchObject({ scope: 'liga', refId: null, title: 'Copa', path: `/l/${c.copa}`, createdBy: { id: w.u.org } });
    expect(b.code).not.toBe(a.code);
    expect([await hits(`scorer-link:${w.u.sofi}`), await hits(`scorer-link:${w.u.org}`)]).toEqual([1, 1]);

    await inviteScorers(w.u.sofi, c.copa, [w.u.nuevo], 'evento', c.t1);
    await invite(w.u.org, c.copa, [w.u.otra]);
    const got = await access(w.u.org, c.copa);
    expect(got.invites).toEqual([
      {
        id: (await inv(c.copa, w.u.nuevo)).id,
        user: { id: w.u.nuevo, name: 'new', username: 'new' },
        invitedBy: { id: w.u.sofi, name: 'sofi' },
        asPlayer: false,
        scope: 'evento',
        refId: c.t1,
        title: 'Copa',
        createdAt: ISO,
      },
    ]);
    expect(got.links).toHaveLength(2);
    expect(got.links).toEqual(expect.arrayContaining([a, b]));
    // Solo admins.
    for (const who of [w.u.luis, w.u.ana, w.u.otra]) await fails(access(who, c.copa), DENIED);
    expect(await access(w.u.dios, c.copa)).toMatchObject({ links: expect.any(Array) });
  });

  it('el tope: 10 abiertos sin vencer por liga y 20 creados o cambiados por día por cuenta', async () => {
    const evs: string[] = [];
    for (let i = 0; i < 11; i++) evs.push(await event(db, w.priv, 'torneo', '2026-10-06', 3, `T${i}`));
    for (let i = 0; i < 10; i++) await createLink(w.u.org, w.priv, 'evento', evs[i]);
    await fails(createLink(w.u.org, w.priv, 'evento', evs[10]), 'cupo_lleno');
    await fails(createLink(w.u.sofi, w.priv), 'cupo_lleno');
    // Uno vencido no cuenta; en otra liga, tampoco.
    await db.admin(`update private.scorer_links set expires_at = now() - interval '1 minute' where ref_id = $1`, [evs[0]]);
    await createLink(w.u.org, w.priv, 'evento', evs[10]);
    await createLink(w.u.org, c.copa);
    expect(await hits(`scorer-link:${w.u.org}`)).toBe(12);
    // 20 por día: el siguiente, no; pedir uno que ya existe no cuesta.
    await fillLimit(`scorer-link:${w.u.sofi}`, 20);
    await fails(createLink(w.u.sofi, c.copa, 'evento', c.t1), 'rate_limited');
    expect(await createLink(w.u.sofi, c.copa)).toMatchObject({ scope: 'liga', status: 'ok' });
    await fails(db.rpc(w.u.sofi, 'rotate_scorer_link', { p_link: (await createLink(w.u.org, c.copa)).id }), 'rate_limited');
  });

  it('el que venció, se llenó o se cerró: crear otra vez lo cambia por uno nuevo', async () => {
    const a = await createLink(w.u.org, c.copa);
    await db.admin(`update private.scorer_links set expires_at = now() where id = $1`, [a.id]);
    expect((await access(w.u.org, c.copa)).links).toEqual([{ ...a, status: 'expired', expiresAt: ISO }]);
    const b = await createLink(w.u.org, c.copa);
    expect(b.code).not.toBe(a.code);
    expect(await preview(w.u.nuevo, a.code)).toEqual({ status: 'revoked' });
    await db.admin(`update private.scorer_links set uses = max_uses where id = $1`, [b.id]);
    expect((await access(w.u.org, c.copa)).links.map((l) => l.status)).toEqual(['full']);
    const d = await createLink(w.u.org, c.copa);
    expect([a.code, b.code]).not.toContain(d.code);
    expect(await db.count('private.scorer_links', 'league_id = $1 and revoked_at is null', [c.copa])).toBe(1);
  });

  it('cambiar: el de antes deja de servir (quien ya entró sigue anotando); quitar', async () => {
    const a = await createLink(w.u.org, c.copa, 'evento', c.t1);
    expect(await join(w.u.nuevo, a.code)).toMatchObject({ status: 'joined' });
    await fails(db.rpc(w.u.luis, 'rotate_scorer_link', { p_link: a.id }), DENIED);
    await fails(db.rpc(w.u.org, 'rotate_scorer_link', { p_link: randomUUID() }), 'no_existe');
    const b = await db.rpc<Link>(w.u.sofi, 'rotate_scorer_link', { p_link: a.id });
    expect(b).toMatchObject({ scope: 'evento', refId: c.t1, uses: 0, status: 'ok', createdBy: { id: w.u.sofi, name: 'sofi' } });
    expect(b.code).not.toBe(a.code);
    expect(await preview(w.u.otra, a.code)).toEqual({ status: 'revoked' });
    expect(await join(w.u.otra, a.code)).toEqual({ status: 'revoked' });
    expect(await mem(c.copa, w.u.otra)).toBeNull();
    expect(await mem(c.copa, w.u.nuevo)).toMatchObject({ is_scorer: true });
    expect((await access(w.u.org, c.copa)).links).toEqual([b]);
    // Quitar: solo un admin; ya quitado, nada.
    await fails(db.rpc(w.u.ana, 'revoke_scorer_link', { p_link: b.id }), DENIED);
    await fails(db.rpc(w.u.org, 'revoke_scorer_link', { p_link: randomUUID() }), 'no_existe');
    await db.rpc(w.u.org, 'revoke_scorer_link', { p_link: b.id });
    await db.rpc(w.u.org, 'revoke_scorer_link', { p_link: b.id });
    expect(await preview(w.u.otra, b.code)).toEqual({ status: 'revoked' });
    expect((await access(w.u.org, c.copa)).links).toEqual([]);
    // Crear otra vez: uno nuevo. Si el torneo ya no existe, no se cambia (y no se crea para él).
    const d = await createLink(w.u.org, c.copa, 'evento', c.t1);
    expect([a.code, b.code]).not.toContain(d.code);
    await db.admin('delete from public.events where id = $1', [c.t1]);
    await fails(db.rpc(w.u.org, 'rotate_scorer_link', { p_link: d.id }), 'invalido');
    await fails(createLink(w.u.org, c.copa, 'evento', c.t1), 'invalido');
    // El que ya estaba sigue sirviendo y lleva a la portada.
    expect(await preview(w.u.otra, d.code)).toMatchObject({ status: 'ok', title: 'Copa', path: `/l/${c.copa}` });
  });
});

describe('scorer_link_preview', () => {
  it('sin cuenta: a qué lleva el link (también de una liga privada); member y canScore según quién mira', async () => {
    const a = await createLink(w.u.org, c.copa, 'evento', c.t1);
    const base = {
      status: 'ok',
      leagueId: c.copa,
      name: 'Copa',
      sport: 'bowling',
      kind: 'torneo',
      visibility: 'public',
      logoPath: null,
      scope: 'evento',
      refId: c.t1,
      title: 'Copa',
      path: `/l/${c.copa}/e/${c.t1}`,
      expiresAt: ISO,
    };
    expect(await preview(ANON, a.code)).toEqual({ ...base, member: false, canScore: false });
    expect(await preview(ANON, `  ${a.code.toLowerCase()} `)).toEqual({ ...base, member: false, canScore: false });
    expect(await preview(w.u.nuevo, a.code)).toEqual({ ...base, member: false, canScore: false });
    expect(await preview(w.u.ana, a.code)).toMatchObject({ member: true, canScore: false });
    expect(await preview(w.u.luis, a.code)).toMatchObject({ member: true, canScore: true });
    expect(await preview(w.u.sofi, a.code)).toMatchObject({ member: true, canScore: true });
    expect(await preview(w.u.org, a.code)).toMatchObject({ member: true, canScore: true });
    const t = await event(db, w.priv, 'torneo', '2026-10-06');
    const p = await createLink(w.u.org, w.priv, 'evento', t);
    expect(await preview(ANON, p.code)).toMatchObject({
      status: 'ok',
      leagueId: w.priv,
      name: 'Liga del Banco',
      kind: 'liga',
      visibility: 'private',
      title: 'Torneo del martes 6 de octubre',
      path: `/l/${w.priv}/e/${t}`,
      member: false,
      canScore: false,
    });
    // Ana tiene la marca en la del Banco: ya anota.
    expect(await preview(w.u.ana, p.code)).toMatchObject({ member: true, canScore: true });
  });

  it('un código que no existe: null y cuenta (el mismo límite que invite_preview, 30 por hora); si no sirve, solo el estado', async () => {
    expect(await preview(ANON, 'ZZZZZZZZZZ')).toBeNull();
    expect(await preview(ANON, null)).toBeNull();
    expect(await hits('preview:ip:anon')).toBe(2);
    await fillLimit('preview:ip:anon', 30);
    await fails(preview(ANON, 'ZZZZZZZZZZ'), 'rate_limited');
    await fails(db.rpcRows(ANON, 'invite_preview', { p_code: w.code }), 'rate_limited');
    // Con cuenta, el suyo.
    expect(await preview(w.u.nuevo, 'ZZZZZZZZZZ')).toBeNull();
    expect(await hits(`preview:u:${w.u.nuevo}`)).toBe(1);
    // Vencido, lleno o cerrado: solo el estado (ni la liga), y no cuenta como intento.
    const a = await createLink(w.u.sofi, c.copa);
    await db.admin(`update private.scorer_links set expires_at = now() - interval '1 second' where id = $1`, [a.id]);
    expect(await preview(w.u.nuevo, a.code)).toEqual({ status: 'expired' });
    await db.admin(`update private.scorer_links set expires_at = now() + interval '1 day', uses = max_uses where id = $1`, [a.id]);
    expect(await preview(w.u.nuevo, a.code)).toEqual({ status: 'full' });
    await db.admin(`update private.scorer_links set uses = 0 where id = $1`, [a.id]);
    await setRole(c.copa, w.u.sofi, 'member');
    expect(await preview(w.u.nuevo, a.code)).toEqual({ status: 'closed' });
    await setRole(c.copa, w.u.sofi, 'admin');
    expect(await preview(w.u.nuevo, a.code)).toMatchObject({ status: 'ok' });
    await block(w.u.sofi);
    expect(await preview(w.u.nuevo, a.code)).toEqual({ status: 'closed' });
    expect(await hits(`preview:u:${w.u.nuevo}`)).toBe(1);
  });
});

describe('join_as_scorer', () => {
  it('en una liga privada, sin el código de la liga: anotador, solo para anotar, sin jugador; suma un uso', async () => {
    const { t, e } = await bankTourney();
    const a = await createLink(w.u.org, w.priv, 'evento', t);
    const players = await db.count('public.players', 'league_id = $1', [w.priv]);
    expect(await join(w.u.nuevo, ` ${a.code.toLowerCase()} `)).toEqual({
      status: 'joined',
      leagueId: w.priv,
      scope: 'evento',
      refId: t,
      title: 'Copa del Banco',
      path: `/l/${w.priv}/e/${t}`,
    });
    expect(await mem(w.priv, w.u.nuevo)).toEqual({ role: 'member', is_scorer: true, scorer_only: true });
    expect(await db.count('public.players', 'league_id = $1', [w.priv])).toBe(players);
    expect(await db.admin('select uses, last_used_at is not null as used from private.scorer_links where id = $1', [a.id])).toEqual([
      { uses: 1, used: true },
    ]);
    // Ve la liga privada y anota el torneo (también la foto); la práctica, no.
    expect(await db.asUser(w.u.nuevo, 'select id from public.leagues where id = $1', [w.priv])).toHaveLength(1);
    await db.rpc(w.u.nuevo, 'save_game', { p_entry: e, p_game: 0, p_score: 200 });
    await db.rpc(w.u.nuevo, 'save_verified_games', { p_event: t, p_photo: photo(), p_writes: [{ player_id: w.p.luis, values: { '1': 180 } }] });
    await fails(db.rpc(w.u.nuevo, 'save_game', { p_entry: w.e1Luis, p_game: 0, p_score: 200 }), DENIED);
    // Otra vez: 'already' (no suma); la vista previa dice que ya anota.
    expect(await preview(w.u.nuevo, a.code)).toMatchObject({ member: true, canScore: true });
    expect(await join(w.u.nuevo, a.code)).toMatchObject({ status: 'already', leagueId: w.priv });
    expect(await uses(a.id)).toBe(1);
    expect(await db.asUser(w.u.nuevo, 'select scorer_only, is_scorer, player_id from public.memberships where league_id = $1 and user_id = $2', [
      w.priv,
      w.u.nuevo,
    ])).toEqual([{ scorer_only: true, is_scorer: true, player_id: null }]);
  });

  it('un miembro que juega queda anotador y conserva su jugador; el dueño, un admin o quien ya anota: already', async () => {
    const a = await createLink(w.u.org, w.priv);
    expect(await join(w.u.luis, a.code)).toEqual({
      status: 'upgraded',
      leagueId: w.priv,
      scope: 'liga',
      refId: null,
      title: 'Liga del Banco',
      path: `/l/${w.priv}`,
    });
    expect(await mem(w.priv, w.u.luis)).toEqual({ role: 'member', is_scorer: true, scorer_only: false });
    expect(await playersOf(w.priv, w.u.luis)).toBe(1);
    for (const who of [w.u.org, w.u.sofi, w.u.ana, w.u.luis]) expect(await join(who, a.code)).toMatchObject({ status: 'already' });
    expect(await uses(a.id)).toBe(1);
  });

  it('su invitación pendiente queda aceptada', async () => {
    await invite(w.u.org, w.priv, [w.u.nuevo]);
    const a = await createLink(w.u.org, w.priv);
    await join(w.u.nuevo, a.code);
    expect((await inv(w.priv, w.u.nuevo)).status).toBe('accepted');
    expect(await mem(w.priv, w.u.nuevo)).toEqual({ role: 'member', is_scorer: true, scorer_only: true });
  });

  it('link que no sirve (vencido, lleno, quitado, su creador ya no es admin o está bloqueado, liga con menores): nadie entra', async () => {
    const a = await createLink(w.u.sofi, c.copa);
    const tryJoin = async (code: string, status: string) => {
      expect(await join(w.u.nuevo, code)).toEqual({ status });
      expect(await mem(c.copa, w.u.nuevo)).toBeNull();
    };
    await db.admin(`update private.scorer_links set expires_at = now() where id = $1`, [a.id]);
    await tryJoin(a.code, 'expired');
    await db.admin(`update private.scorer_links set expires_at = now() + interval '1 day', uses = 20 where id = $1`, [a.id]);
    await tryJoin(a.code, 'full');
    await db.admin(`update private.scorer_links set uses = 0 where id = $1`, [a.id]);
    await setRole(c.copa, w.u.sofi, 'member');
    await tryJoin(a.code, 'closed');
    await setRole(c.copa, w.u.sofi, 'admin');
    await block(w.u.sofi);
    await tryJoin(a.code, 'closed');
    await db.rpc(w.u.dios, 'admin_unblock_user', { p_user: w.u.sofi });
    await db.rpc(w.u.org, 'revoke_scorer_link', { p_link: a.id });
    await tryJoin(a.code, 'revoked');
    expect(await uses(a.id)).toBe(0);
    // La cuenta de quien lo creó se borra: cerrado.
    const b = await createLink(w.u.sofi, c.copa);
    await db.admin('delete from public.league_members where league_id = $1 and user_id = $2', [c.copa, w.u.sofi]);
    await db.admin('delete from auth.users where id = $1', [w.u.sofi]);
    await tryJoin(b.code, 'closed');
    // La liga pasa a tener menores: cerrado.
    const k = await createLink(w.u.org, w.priv);
    await db.admin('update public.leagues set require_photo = false, has_minors = true where id = $1', [w.priv]);
    expect(await join(w.u.nuevo, k.code)).toEqual({ status: 'closed' });
    expect(await mem(w.priv, w.u.nuevo)).toBeNull();
    await fails(db.rpc(w.u.org, 'rotate_scorer_link', { p_link: k.id }), 'invalido');
  });

  it('una cuenta bloqueada no entra; 10 códigos que no existen por hora (el límite de join_league)', async () => {
    const a = await createLink(w.u.org, c.copa);
    await block(w.u.extra);
    await fails(join(w.u.extra, a.code), 'bloqueada');
    for (let i = 0; i < 10; i++) expect(await join(w.u.nuevo, 'ZZZZZZZZZZ')).toBeNull();
    expect(await hits(`join:${w.u.nuevo}`)).toBe(10);
    await fails(join(w.u.nuevo, a.code), 'rate_limited');
    await fails(db.rpc(w.u.nuevo, 'join_league', { p_code: w.code }), 'rate_limited');
    expect(await mem(c.copa, w.u.nuevo)).toBeNull();
    // Un link que no sirve no cuenta como intento.
    await db.admin(`update private.scorer_links set expires_at = now() where id = $1`, [a.id]);
    expect(await join(w.u.otra, a.code)).toEqual({ status: 'expired' });
    expect(await hits(`join:${w.u.otra}`)).toBe(0);
  });

  it('avisa a quien creó el link; si entran varios antes de que salga, se agrupa', async () => {
    await phone(w.u.sofi);
    const a = await createLink(w.u.sofi, c.copa, 'evento', c.t1);
    await join(w.u.nuevo, a.code);
    const push = {
      title: 'new entró a anotar en Copa',
      body: 'Con tu link para anotar. Si no sabes quién es, quítalo y cambia el link en «Anotadores».',
      url: `/l/${c.copa}/e/${c.t1}`,
      tag: `anotador:${a.id}`,
      ttl: 86400,
    };
    expect(await pushes(w.u.sofi)).toEqual([push]);
    // Ana (miembro) entra también: el aviso que espera cambia de texto.
    await join(w.u.ana, a.code);
    expect(await pushes(w.u.sofi)).toEqual([{ ...push, title: 'Entraron varias personas a anotar en Copa' }]);
    // Quien ya anotaba no avisa.
    await join(w.u.luis, a.code);
    expect(await pushes(w.u.sofi)).toHaveLength(1);
    expect(await uses(a.id)).toBe(2);
  });
});

describe('quien solo anota', () => {
  it('no recibe jugador solo (ensure_my_player: null); «También juego» (join_league) lo crea y apaga scorer_only', async () => {
    const a = await createLink(w.u.org, w.priv);
    await join(w.u.nuevo, a.code);
    expect(await db.rpc(w.u.nuevo, 'ensure_my_player', { p_league: w.priv })).toBeNull();
    expect(await playersOf(w.priv, w.u.nuevo)).toBe(0);
    const r = await db.rpc<Json>(w.u.nuevo, 'join_league', { p_league: w.priv });
    expect(r).toMatchObject({ league_id: w.priv, player_id: expect.any(String), claim_id: null });
    expect(await mem(w.priv, w.u.nuevo)).toEqual({ role: 'member', is_scorer: true, scorer_only: false });
    expect(await db.rpc(w.u.nuevo, 'ensure_my_player', { p_league: w.priv })).toBe(r.player_id);
    // Ahora quitarle el permiso lo deja en la liga, como jugador.
    await setScorer(w.u.sofi, w.priv, w.u.nuevo, false);
    expect(await mem(w.priv, w.u.nuevo)).toEqual({ role: 'member', is_scorer: false, scorer_only: false });
    expect(await playersOf(w.priv, w.u.nuevo)).toBe(1);
  });

  it('inscribirse (golf, raqueta…) también es decidir jugar: private.ensure_player apaga scorer_only', async () => {
    const a = await createLink(w.u.org, c.copa);
    await join(w.u.nuevo, a.code);
    expect(await db.admin('select private.ensure_player($1, $2, null) is not null as ok', [c.copa, w.u.nuevo])).toEqual([{ ok: true }]);
    expect(await mem(c.copa, w.u.nuevo)).toEqual({ role: 'member', is_scorer: true, scorer_only: false });
  });

  it('sale de la liga por su cuenta; un admin no lo saca con remove_member (anota), pero le quita el permiso y sale', async () => {
    const a = await createLink(w.u.org, w.priv);
    await join(w.u.nuevo, a.code);
    await join(w.u.otra, a.code);
    await db.rpc(w.u.nuevo, 'leave_league', { p_league: w.priv });
    expect(await mem(w.priv, w.u.nuevo)).toBeNull();
    await fails(db.rpc(w.u.sofi, 'remove_member', { p_league: w.priv, p_user: w.u.otra }), DENIED);
    await setScorer(w.u.sofi, w.priv, w.u.otra, false);
    expect(await mem(w.priv, w.u.otra)).toBeNull();
    // Quien salió por su cuenta puede volver con el link; a quien sacó un admin, el link ya no lo deja entrar.
    expect(await join(w.u.nuevo, a.code)).toMatchObject({ status: 'joined' });
    expect(await join(w.u.otra, a.code)).toEqual({ status: 'removed' });
    expect(await mem(w.priv, w.u.otra)).toBeNull();
  });
});

describe('quitar vale aunque tenga el link', () => {
  it('a quien un admin le quitó el permiso o sacó de la liga, ningún link de la liga lo deja entrar (tampoco uno nuevo)', async () => {
    const a = await createLink(w.u.org, w.priv);
    expect(await join(w.u.nuevo, a.code)).toMatchObject({ status: 'joined' });
    await setScorer(w.u.sofi, w.priv, w.u.nuevo, false);
    expect(await mem(w.priv, w.u.nuevo)).toBeNull();
    // La vista previa y entrar: 'removed', sin cambiar nada (ni un uso del link ni un intento).
    expect(await preview(w.u.nuevo, a.code)).toEqual({ status: 'removed' });
    expect(await join(w.u.nuevo, a.code)).toEqual({ status: 'removed' });
    expect(await mem(w.priv, w.u.nuevo)).toBeNull();
    expect(await uses(a.id)).toBe(1);
    expect(await hits(`join:${w.u.nuevo}`)).toBe(0);
    // Tampoco con el link cambiado ni con el de otro torneo de la liga; los demás sí entran.
    const b = await db.rpc<Link>(w.u.org, 'rotate_scorer_link', { p_link: a.id });
    const t = await event(db, w.priv, 'torneo', '2026-10-06');
    const d = await createLink(w.u.org, w.priv, 'evento', t);
    for (const k of [b, d]) expect(await join(w.u.nuevo, k.code)).toEqual({ status: 'removed' });
    expect(await join(w.u.otra, b.code)).toMatchObject({ status: 'joined' });
    // Un miembro que juega y al que un admin le quitó la marca no se la vuelve a dar con el link.
    expect(await join(w.u.luis, b.code)).toMatchObject({ status: 'upgraded' });
    await setScorer(w.u.sofi, w.priv, w.u.luis, false);
    expect(await preview(w.u.luis, b.code)).toEqual({ status: 'removed' });
    expect(await join(w.u.luis, b.code)).toEqual({ status: 'removed' });
    expect(await mem(w.priv, w.u.luis)).toEqual({ role: 'member', is_scorer: false, scorer_only: false });
    // A quien el dueño sacó de la liga (remove_member), tampoco.
    await db.rpc(w.u.org, 'remove_member', { p_league: w.priv, p_user: w.u.otra });
    expect(await join(w.u.otra, b.code)).toEqual({ status: 'removed' });
    // Otra liga, otra cosa: nuevo entra a la copa con su link.
    expect(await join(w.u.nuevo, (await createLink(w.u.org, c.copa)).code)).toMatchObject({ status: 'joined' });
  });

  it('salir por su cuenta o quitarse uno mismo la marca no lo frena', async () => {
    const a = await createLink(w.u.org, w.priv);
    await join(w.u.nuevo, a.code);
    await db.rpc(w.u.nuevo, 'leave_league', { p_league: w.priv });
    expect(await join(w.u.nuevo, a.code)).toMatchObject({ status: 'joined' });
    // El dueño se pone y se quita la marca: sigue siendo dueño (ya anota).
    await setScorer(w.u.org, w.priv, w.u.org, true);
    await setScorer(w.u.org, w.priv, w.u.org, false);
    expect(await db.count('private.scorer_link_blocks', 'league_id = $1', [w.priv])).toBe(0);
  });

  it('un admin lo puede volver a hacer anotador (nombrarlo o invitarlo por su @usuario): el link lo deja entrar otra vez', async () => {
    const a = await createLink(w.u.org, w.priv);
    await join(w.u.luis, a.code);
    await setScorer(w.u.sofi, w.priv, w.u.luis, false);
    await setScorer(w.u.sofi, w.priv, w.u.luis, true);
    expect(await join(w.u.luis, a.code)).toMatchObject({ status: 'already' });
    expect(await db.count('private.scorer_link_blocks', 'league_id = $1 and user_id = $2', [w.priv, w.u.luis])).toBe(0);
    // Sacado de la liga y después invitado: al aceptar anota, y si sale por su cuenta puede volver con el link.
    await join(w.u.nuevo, a.code);
    await setScorer(w.u.sofi, w.priv, w.u.nuevo, false);
    expect(await join(w.u.nuevo, a.code)).toEqual({ status: 'removed' });
    expect((await inviteScorers(w.u.sofi, w.priv, [w.u.nuevo])).results).toEqual([{ userId: w.u.nuevo, status: 'sent' }]);
    await respond(w.u.nuevo, (await inv(w.priv, w.u.nuevo)).id, true);
    expect(await mem(w.priv, w.u.nuevo)).toEqual({ role: 'member', is_scorer: true, scorer_only: true });
    await db.rpc(w.u.nuevo, 'leave_league', { p_league: w.priv });
    expect(await join(w.u.nuevo, a.code)).toMatchObject({ status: 'joined' });
  });
});

describe('la liga pasa a tener menores', () => {
  it('quien entró con el link y sigue solo anotando sale de la liga; los demás se quedan', async () => {
    const a = await createLink(w.u.org, w.priv);
    // nuevo entró con el link: sale. otra entró con el link y después dijo «También juego»: se queda. otro entró con el
    // link y el dueño le dio «Diseña insignias»: se queda. luis ya era miembro: se queda.
    for (const who of [w.u.nuevo, w.u.otra, w.u.otro, w.u.luis]) await join(who, a.code);
    await db.rpc(w.u.otra, 'join_league', { p_league: w.priv });
    await db.admin('update public.league_members set badge_maker = true where league_id = $1 and user_id = $2', [w.priv, w.u.otro]);
    // extra lo invitó un admin (lo eligió): se queda aunque solo anote.
    await inviteScorers(w.u.org, w.priv, [w.u.extra]);
    await respond(w.u.extra, (await inv(w.priv, w.u.extra)).id, true);
    // Cambiar otra cosa no saca a nadie.
    await db.rpc(w.u.org, 'update_league', { p_league: w.priv, p_patch: { venue: 'Bolera Nueva' } });
    expect(await mem(w.priv, w.u.nuevo)).toMatchObject({ scorer_only: true });
    await db.rpc(w.u.org, 'update_league', { p_league: w.priv, p_patch: { has_minors: true, require_photo: false } });
    expect(await mem(w.priv, w.u.nuevo)).toBeNull();
    expect(await mem(w.priv, w.u.otra)).toEqual({ role: 'member', is_scorer: true, scorer_only: false });
    expect(await mem(w.priv, w.u.otro)).toEqual({ role: 'member', is_scorer: true, scorer_only: true });
    expect(await mem(w.priv, w.u.luis)).toEqual({ role: 'member', is_scorer: true, scorer_only: false });
    expect(await mem(w.priv, w.u.extra)).toEqual({ role: 'member', is_scorer: true, scorer_only: true });
    // El link ya no sirve, y un admin lo puede invitar por su @usuario.
    expect(await preview(ANON, a.code)).toEqual({ status: 'closed' });
    expect((await inviteScorers(w.u.org, w.priv, [w.u.nuevo])).results).toEqual([{ userId: w.u.nuevo, status: 'sent' }]);
  });
});

describe('tiempo real', () => {
  it("'scorers' a la liga (y a la cuenta que cambió): nombrar, quitar, links, entrar y aceptar", async () => {
    const sent = await captureRealtime();
    await setScorer(w.u.sofi, c.copa, w.u.ana, true);
    expect(await sent()).toEqual([
      { topic: `league:${c.copa}`, payload: { user_id: w.u.ana } },
      { topic: `user:${w.u.ana}`, payload: { league_id: c.copa } },
    ]);
    // Sin cambios: nada.
    await setScorer(w.u.sofi, c.copa, w.u.ana, true);
    expect(await sent()).toHaveLength(2);
    const a = await createLink(w.u.org, c.copa);
    await db.rpc(w.u.org, 'revoke_scorer_link', { p_link: a.id });
    const b = await createLink(w.u.org, c.copa);
    await join(w.u.nuevo, b.code);
    await inviteScorers(w.u.sofi, c.copa, [w.u.otra]);
    await respond(w.u.otra, (await inv(c.copa, w.u.otra)).id, true);
    expect((await sent()).slice(2)).toEqual([
      { topic: `league:${c.copa}`, payload: { user_id: null } },
      { topic: `league:${c.copa}`, payload: { user_id: null } },
      { topic: `league:${c.copa}`, payload: { user_id: null } },
      { topic: `league:${c.copa}`, payload: { user_id: w.u.nuevo } },
      { topic: `user:${w.u.nuevo}`, payload: { league_id: c.copa } },
      { topic: `league:${c.copa}`, payload: { user_id: w.u.otra } },
      { topic: `user:${w.u.otra}`, payload: { league_id: c.copa } },
    ]);
  });
});
