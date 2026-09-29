/**
 * Insignias, los datos (20260929000800_insignias.sql): badge_awards, badge_progress y badge_stats con su RLS, el modo
 * de insignias automáticas de la liga (menores: sin títulos), las destacadas del perfil, las RPC del jugador
 * (profile_badges, set_featured_badges, set_badge_hidden, mark_badges_seen), del dueño (set_badges_auto), el aval
 * (review_badge) y el retiro por fraude (super_revoke_badge). Además: aprobar un reclamo con insignias en los dos
 * jugadores (merge_players), juntar duplicados, bajar mis datos y borrar la cuenta.
 *
 * Las insignias las escribe el motor; aquí se siembran como superusuario con `award()`.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { entry, event, league, makeWorld, member, player, type World } from './fixture';
import { DEMO_COURSE } from '../../src/sports/golf/demo';

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

type Json = Record<string, unknown>;
interface Badge {
  id: string;
  key: string;
  sport: string;
  level: number;
  periodKey: string;
  scope: 'cuenta' | 'liga';
  status: string;
  awardedAt: string;
  leagueId: string | null;
  leagueName: string | null;
  playerId: string | null;
  context: Json;
  hidden: boolean;
  seenAt: string | null;
}
interface Profile {
  userId: string;
  isMe: boolean;
  featured: string[];
  awards: Badge[];
  truncated: boolean;
}

const NEW_RPC = [
  'mark_badges_seen',
  'profile_badges',
  'review_badge',
  'set_badge_hidden',
  'set_badges_auto',
  'set_featured_badges',
  'super_revoke_badge',
];

interface AwardFields {
  key?: string;
  sport?: string;
  level?: number;
  period?: string;
  player?: string;
  user?: string;
  league?: string;
  status?: 'provisional' | 'firme' | 'en_revision' | 'revocada';
  hidden?: boolean;
  at?: string;
  seen?: string;
  context?: Json;
  refs?: string[];
}

/** Una insignia como la dejaría el motor. Jugador: `player` + `league`; cuenta: `user`. */
async function award(f: AwardFields): Promise<string> {
  const status = f.status ?? 'firme';
  const rows = await db.admin<{ id: string }>(
    `insert into public.badge_awards (badge_key, sport, level, period_key, player_id, user_id, league_id, status, hidden,
                                      awarded_at, seen_at, context, refs, revoked_at, revoke_reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10::timestamptz, now()), $11, $12, $13,
             case when $8 = 'revocada' then now() end, case when $8 = 'revocada' then 'evidencia' end)
     returning id`,
    [
      f.key ?? 'bowling_games',
      f.sport ?? 'bowling',
      f.level ?? 1,
      f.period ?? '-',
      f.player ?? null,
      f.user ?? null,
      f.league ?? null,
      status,
      f.hidden ?? false,
      f.at ?? null,
      f.seen ?? null,
      f.context ?? {},
      f.refs ?? [],
    ],
  );
  return rows[0].id;
}

const visibleIds = async (who: string) =>
  (await db.as<{ id: string }>(who, 'select id from public.badge_awards order by id')).map((r) => r.id);
const sorted = (ids: string[]) => [...ids].sort();
const profile = (who: string, target: string) => db.rpc<Profile | null>(who, 'profile_badges', { p_user: target });
const featuredOf = async (uid: string) =>
  (await db.admin<{ f: string[] }>('select featured_badges as f from public.profiles where id = $1', [uid]))[0].f;
const row = async (id: string) =>
  (
    await db.admin<Json>(
      `select id, player_id, user_id, league_id, status, hidden, revoke_reason, revoked_by, context,
              private.iso(awarded_at) as awarded_at, private.iso(seen_at) as seen_at
         from public.badge_awards where id = $1`,
      [id],
    )
  )[0];
const joinPriv = (uid: string) => db.rpc<{ player_id: string }>(uid, 'join_league', { p_code: 'ABCD2345' });

/** Liga privada con menores de org, con luis (adulto, con cuenta) y un menor. */
async function kidsLeague() {
  const kids = await league(db, w.u.org, { name: 'Escuelita', visibility: 'private', hasMinors: true, requirePhoto: false });
  await member(db, kids, w.u.org, 'owner', 'org');
  await member(db, kids, w.u.luis, 'member', 'luis');
  const luis = await player(db, kids, 'Luis', w.u.luis);
  const [{ id: kid }] = await db.admin<{ id: string }>(`insert into public.players (league_id, name, is_minor) values ($1, 'Nene', true) returning id`, [kids]);
  return { kids, luis, kid };
}

describe('permisos', () => {
  it('las RPC nuevas: solo con sesión, security definer, y pasan por require_uid', async () => {
    const rows = await db.admin<{ fn: string; definer: boolean; anon: boolean; auth: boolean; uid: boolean }>(
      `select p.proname as fn, p.prosecdef as definer, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              (p.prosrc like '%private.require_uid()%' or p.prosrc like '%private.require_super()%') as uid
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1) order by 1`,
      [NEW_RPC],
    );
    expect(rows).toEqual(NEW_RPC.map((fn) => ({ fn, definer: true, anon: false, auth: true, uid: true })));
    await fails(db.rpc(ANON, 'profile_badges', { p_user: w.u.luis }), '42501');
    await fails(db.rpc(ANON, 'set_badges_auto', { p_league: w.pub, p_mode: 'ninguna' }), '42501');
    // Las ayudas de private no las ejecuta la app.
    await fails(db.as(w.u.org, 'select private.merge_badges($1, $2, $3)', [w.p.pedro, w.p.luis, w.priv]), '42501');
    await fails(db.as(w.u.org, 'select private.badge_can_review($1, $2)', [w.p.pedro, w.u.org]), '42501');
    await fails(db.as(w.u.org, `select private.badge_signal('merge', null, null, null)`), '42501');
  });

  it('las tablas tienen RLS y nadie escribe directo (tampoco el superadmin)', async () => {
    const rls = await db.admin<{ relname: string; rls: boolean }>(
      `select c.relname, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('badge_awards', 'badge_progress', 'badge_stats') order by 1`,
    );
    expect(rls).toEqual(['badge_awards', 'badge_progress', 'badge_stats'].map((relname) => ({ relname, rls: true })));
    const id = await award({ player: w.p.luis, league: w.priv });
    for (const who of [w.u.luis, w.u.org, w.u.dios]) {
      await fails(db.as(who, `update public.badge_awards set hidden = true where id = $1`, [id]), '42501');
      await fails(db.as(who, `delete from public.badge_awards where id = $1`, [id]), '42501');
      await fails(
        db.as(who, `insert into public.badge_awards (badge_key, sport, level, period_key, user_id) values ('debut', 'all', 0, '-', $1)`, [who]),
        '42501',
      );
      await fails(db.as(who, `update public.profiles set featured_badges = array[$1]::uuid[] where id = $2`, [id, who]), '42501');
      await fails(db.as(who, `update public.leagues set badges_auto = 'ninguna' where id = $1`, [w.priv]), '42501');
    }
    expect((await row(id)).hidden).toBe(false);
  });
});

describe('las tablas', () => {
  it('una fila es de un jugador (con su liga) o de una cuenta (sin liga), una sola vez por nivel y periodo', async () => {
    const id = await award({ key: 'bowling_club', player: w.p.luis, league: w.priv, period: '-' });
    expect(await db.admin('select holder from public.badge_awards where id = $1', [id])).toEqual([{ holder: w.p.luis }]);
    const acc = await award({ key: 'month_streak', sport: 'all', user: w.u.luis });
    expect(await db.admin('select holder from public.badge_awards where id = $1', [acc])).toEqual([{ holder: w.u.luis }]);
    // La misma key, deporte, nivel y periodo: una sola (también si la otra está revocada).
    await fails(award({ key: 'bowling_club', player: w.p.luis, league: w.priv, period: '-', status: 'revocada' }), '23505');
    await award({ key: 'bowling_club', player: w.p.luis, league: w.priv, period: '-', level: 2 });
    await award({ key: 'bowling_club', player: w.p.pedro, league: w.priv, period: '-' });
    // Jugador y cuenta a la vez, cuenta con liga, jugador sin liga, jugador de otra liga.
    await fails(award({ player: w.p.luis, league: w.priv, user: w.u.luis }), INVALID);
    await fails(award({ user: w.u.luis, league: w.priv }), INVALID);
    await fails(award({ player: w.p.luis }), INVALID);
    await fails(award({ player: w.p.luis, league: w.pub }), '23503');
    // Key, deporte, nivel y periodo con forma; revocada siempre con fecha.
    await fails(award({ key: 'Bowling Club', user: w.u.luis }), INVALID);
    await fails(award({ sport: 'chess', user: w.u.luis }), INVALID);
    await fails(award({ level: 6, user: w.u.luis }), INVALID);
    await fails(award({ period: 'e:<x>', user: w.u.luis }), INVALID);
    await fails(db.admin(`update public.badge_awards set status = 'revocada' where id = $1`, [id]), INVALID);
    await fails(db.admin(`update public.badge_awards set context = '[]' where id = $1`, [id]), INVALID);
  });

  it('borrar al jugador, la liga o la cuenta se lleva sus insignias; las de liga dejan tombstone', async () => {
    const lg = await award({ player: w.p.pedro, league: w.priv });
    const acc = await award({ key: 'debut', sport: 'all', level: 0, user: w.u.ana });
    await db.admin('delete from public.badge_awards where id = any ($1)', [[lg, acc]]);
    expect(await db.admin(`select row_key, league_id from public.tombstones where tbl = 'badge_awards'`)).toEqual([{ row_key: lg, league_id: w.priv }]);

    const a = await award({ player: w.p.pedro, league: w.priv });
    await db.rpc(w.u.org, 'delete_player', { p_player: w.p.pedro });
    expect(await db.count('public.badge_awards', 'id = $1', [a])).toBe(0);
    const b = await award({ player: w.p.p1, league: w.pub });
    await db.rpc(w.u.otro, 'delete_league', { p_league: w.pub });
    expect(await db.count('public.badge_awards', 'id = $1', [b])).toBe(0);
  });

  it('progreso: uno por dueño, key y deporte; rareza: la leen todos', async () => {
    await db.admin(`insert into public.badge_progress (player_id, league_id, badge_key, sport, value, target, next_level) values ($1, $2, 'bowling_games', 'bowling', 12, 30, 1)`, [w.p.luis, w.priv]);
    await fails(db.admin(`insert into public.badge_progress (player_id, league_id, badge_key, sport, value, target, next_level) values ($1, $2, 'bowling_games', 'bowling', 13, 30, 1)`, [w.p.luis, w.priv]), '23505');
    await fails(db.admin(`insert into public.badge_progress (user_id, league_id, badge_key, sport, value, target, next_level) values ($1, $2, 'mileage', 'all', 1, 50, 1)`, [w.u.luis, w.priv]), INVALID);
    await db.admin(`insert into public.badge_stats (badge_key, sport, level, holders, base, pct, rarity, computed_at) values ('bowling_club', 'bowling', 1, 3, 120, 2.5, 'epica', now())`);
    expect(await db.asAnon('select badge_key, pct, rarity from public.badge_stats')).toEqual([{ badge_key: 'bowling_club', pct: 2.5, rarity: 'epica' }]);
    expect(await db.asUser(w.u.extra, 'select badge_key from public.badge_stats')).toHaveLength(1);
  });
});

describe('insignias automáticas de la liga', () => {
  it('todas por defecto; una liga con menores nace (o pasa a ser) sin títulos', async () => {
    expect(await db.admin('select badges_auto from public.leagues where id = $1', [w.priv])).toEqual([{ badges_auto: 'todas' }]);
    const { kids } = await kidsLeague();
    expect(await db.admin('select badges_auto from public.leagues where id = $1', [kids])).toEqual([{ badges_auto: 'sin_titulos' }]);
    const { league_id: created } = await db.rpc<{ league_id: string }>(w.u.extra, 'create_league', { p_name: 'Escuela', p_has_minors: true });
    expect(await db.admin('select badges_auto from public.leagues where id = $1', [created])).toEqual([{ badges_auto: 'sin_titulos' }]);
    // Subir has_minors también; si el dueño ya había elegido 'ninguna', se queda.
    await db.rpc(w.u.org, 'update_league', { p_league: w.priv, p_patch: { has_minors: true, require_photo: false } });
    expect(await db.admin('select badges_auto from public.leagues where id = $1', [w.priv])).toEqual([{ badges_auto: 'sin_titulos' }]);
    await db.rpc(w.u.otro, 'set_badges_auto', { p_league: w.pub, p_mode: 'ninguna' });
    await db.admin(`update public.leagues set visibility = 'private' where id = $1`, [w.pub]);
    await db.rpc(w.u.otro, 'update_league', { p_league: w.pub, p_patch: { has_minors: true } });
    expect(await db.admin('select badges_auto from public.leagues where id = $1', [w.pub])).toEqual([{ badges_auto: 'ninguna' }]);
  });

  it('set_badges_auto: el dueño (o el superadmin); en una liga con menores también puede encender los títulos', async () => {
    expect(await db.rpc(w.u.org, 'set_badges_auto', { p_league: w.priv, p_mode: 'ninguna' })).toBe('ninguna');
    expect(await db.asUser(w.u.luis, 'select badges_auto from public.leagues where id = $1', [w.priv])).toEqual([{ badges_auto: 'ninguna' }]);
    await fails(db.rpc(w.u.sofi, 'set_badges_auto', { p_league: w.priv, p_mode: 'todas' }), DENIED);
    await fails(db.rpc(w.u.luis, 'set_badges_auto', { p_league: w.priv, p_mode: 'todas' }), DENIED);
    await fails(db.rpc(w.u.otro, 'set_badges_auto', { p_league: w.priv, p_mode: 'todas' }), DENIED);
    await fails(db.rpc(w.u.org, 'set_badges_auto', { p_league: w.priv, p_mode: 'algunas' }), 'invalido');
    await fails(db.rpc(w.u.org, 'set_badges_auto', { p_league: w.priv, p_mode: null }), 'invalido');
    await fails(db.rpc(w.u.org, 'set_badges_auto', { p_league: '00000000-0000-0000-0000-000000000000', p_mode: 'todas' }), 'no_existe');
    expect(await db.rpc(w.u.dios, 'set_badges_auto', { p_league: w.priv, p_mode: 'sin_titulos' })).toBe('sin_titulos');
    const { kids } = await kidsLeague();
    expect(await db.rpc(w.u.org, 'set_badges_auto', { p_league: kids, p_mode: 'todas' })).toBe('todas');
    expect(await db.admin('select badges_auto from public.leagues where id = $1', [kids])).toEqual([{ badges_auto: 'todas' }]);
  });
});

describe('quién ve qué (RLS)', () => {
  it('las propias en cualquier estado; las de la liga provisionales o firmes y no ocultas; los admins, también las ocultas', async () => {
    const acc = await award({ key: 'month_streak', sport: 'all', user: w.u.luis });
    const lg = await award({ key: 'bowling_clean_game', player: w.p.luis, league: w.priv, period: `g:${w.e1Luis}:1`, status: 'provisional' });
    const hid = await award({ key: 'bowling_breakthrough', player: w.p.luis, league: w.priv, hidden: true });
    const rev = await award({ key: 'bowling_perfect_game', player: w.p.luis, league: w.priv, level: 0, status: 'en_revision' });
    const gone = await award({ key: 'bowling_series', player: w.p.luis, league: w.priv, status: 'revocada' });
    const ped = await award({ player: w.p.pedro, league: w.priv });
    const pub = await award({ player: w.p.p1, league: w.pub });
    const otherAcc = await award({ key: 'debut', sport: 'all', level: 0, user: w.u.ana });

    expect(await visibleIds(w.u.luis)).toEqual(sorted([acc, lg, hid, rev, gone, ped, pub]));
    expect(await visibleIds(w.u.ana)).toEqual(sorted([lg, ped, pub, otherAcc]));
    expect(await visibleIds(w.u.sofi)).toEqual(sorted([lg, hid, ped, pub]));
    expect(await visibleIds(w.u.org)).toEqual(sorted([lg, hid, ped, pub]));
    expect(await visibleIds(w.u.extra)).toEqual([pub]);
    expect(await visibleIds(ANON)).toEqual([pub]);
    expect(await visibleIds(w.u.dios)).toEqual(sorted([acc, lg, hid, rev, gone, ped, pub, otherAcc]));
  });

  it('las de una liga con menores solo las ven sus miembros', async () => {
    const { kids, kid } = await kidsLeague();
    const k = await award({ key: 'debut', level: 0, player: kid, league: kids });
    expect(await visibleIds(w.u.luis)).toEqual([k]);
    expect(await visibleIds(w.u.org)).toEqual([k]);
    expect(await visibleIds(w.u.extra)).toEqual([]);
    expect(await visibleIds(ANON)).toEqual([]);
    expect(await visibleIds(w.u.sofi)).toEqual([]);
  });

  it('el progreso solo lo ve su dueño', async () => {
    await db.admin(`insert into public.badge_progress (player_id, league_id, badge_key, sport, value, target, next_level) values ($1, $2, 'bowling_games', 'bowling', 12, 30, 1)`, [w.p.luis, w.priv]);
    await db.admin(`insert into public.badge_progress (user_id, badge_key, sport, value, target, next_level) values ($1, 'mileage', 'all', 20, 50, 1)`, [w.u.luis]);
    await db.admin(`insert into public.badge_progress (player_id, league_id, badge_key, sport, value, target, next_level) values ($1, $2, 'bowling_games', 'bowling', 1, 30, 1)`, [w.p.pedro, w.priv]);
    expect(await db.asUser(w.u.luis, 'select badge_key, value, target from public.badge_progress order by badge_key')).toEqual([
      { badge_key: 'bowling_games', value: 12, target: 30 },
      { badge_key: 'mileage', value: 20, target: 50 },
    ]);
    for (const who of [w.u.org, w.u.sofi, w.u.ana]) expect(await db.asUser(who, 'select badge_key from public.badge_progress')).toEqual([]);
    await fails(db.asAnon('select * from public.badge_progress'), '42501');
  });
});

describe('perfil (profile_badges)', () => {
  /** Luis juega también en la liga pública; otro es su dueño (comparten liga). */
  async function setup() {
    await member(db, w.pub, w.u.luis, 'member', 'luis');
    const pubLuis = await player(db, w.pub, 'Luis', w.u.luis);
    const { kids, luis: kidsLuis } = await kidsLeague();
    const a = {
      acc: await award({ key: 'month_streak', sport: 'all', level: 2, user: w.u.luis, at: '2026-09-01T12:00:00Z', context: { v: 1, league: { id: w.priv, name: 'Liga del Banco' }, event: { id: w.e.e1, name: 'Práctica' }, values: { n: 6 } } }),
      priv: await award({ key: 'bowling_club', player: w.p.luis, league: w.priv, at: '2026-09-02T12:00:00Z' }),
      pub: await award({ key: 'bowling_club', player: pubLuis, league: w.pub, level: 2, at: '2026-09-03T12:00:00Z' }),
      hidden: await award({ key: 'bowling_breakthrough', player: pubLuis, league: w.pub, hidden: true, at: '2026-09-04T12:00:00Z' }),
      review: await award({ key: 'bowling_perfect_game', level: 0, period: 'g:x:1', player: pubLuis, league: w.pub, status: 'en_revision', at: '2026-09-05T12:00:00Z' }),
      seenGone: await award({ key: 'bowling_series', player: pubLuis, league: w.pub, status: 'revocada', seen: '2026-09-06T12:00:00Z', at: '2026-09-06T12:00:00Z' }),
      unseenGone: await award({ key: 'bowling_series', level: 2, player: pubLuis, league: w.pub, status: 'revocada', at: '2026-09-07T12:00:00Z' }),
      kids: await award({ key: 'debut', level: 0, player: kidsLuis, league: kids, at: '2026-09-08T12:00:00Z' }),
    };
    return { pubLuis, kids, a };
  }

  it('otra cuenta ve las de cuenta y las de ligas que ve (sin menores), firmes o provisionales y no ocultas', async () => {
    const { a, pubLuis } = await setup();
    // otro comparte la liga pública pero no ve la privada: la de cuenta pierde la liga y el evento de su evidencia.
    const p = (await profile(w.u.otro, w.u.luis))!;
    expect(p).toMatchObject({ userId: w.u.luis, isMe: false, featured: [], truncated: false });
    expect(p.awards.map((b) => b.id)).toEqual([a.pub, a.acc]);
    expect(p.awards[0]).toEqual({
      id: a.pub, key: 'bowling_club', sport: 'bowling', level: 2, periodKey: '-', scope: 'liga', status: 'firme',
      awardedAt: '2026-09-03T12:00:00.000Z', firmAt: null, leagueId: w.pub, leagueName: 'Liga Abierta', playerId: pubLuis,
      context: {}, hidden: false, seenAt: null,
    });
    expect(p.awards[1]).toMatchObject({ scope: 'cuenta', leagueId: null, playerId: null, context: { v: 1, values: { n: 6 } } });
    expect(p.awards[1].context).not.toHaveProperty('league');
    expect(p.awards[1].context).not.toHaveProperty('event');
    // ana comparte la privada: ve la de esa liga y la evidencia completa.
    const q = (await profile(w.u.ana, w.u.luis))!;
    expect(q.awards.map((b) => b.id)).toEqual([a.pub, a.priv, a.acc]);
    expect(q.awards[2].context).toMatchObject({ league: { id: w.priv, name: 'Liga del Banco' }, event: { id: w.e.e1 } });
    // Quien no tiene nada en común pero lo ve (luis es miembro de una liga pública): lo público.
    expect((await profile(w.u.extra, w.u.luis))!.awards.map((b) => b.id)).toEqual([a.pub, a.acc]);
    // El superadmin ve las de todas las ligas, pero tampoco las de menores ni las ocultas.
    expect((await profile(w.u.dios, w.u.luis))!.awards.map((b) => b.id)).toEqual([a.pub, a.priv, a.acc]);
  });

  it('la propia: todas (ocultas, en revisión, de ligas con menores), menos las revocadas que nunca vio', async () => {
    const { a } = await setup();
    await db.admin(`update public.badge_awards set seen_at = '2026-09-10T00:00:00Z' where id = $1`, [a.pub]);
    const p = (await profile(w.u.luis, w.u.luis))!;
    expect(p.isMe).toBe(true);
    expect(p.awards.map((b) => b.id)).toEqual([a.kids, a.seenGone, a.review, a.hidden, a.pub, a.priv, a.acc]);
    expect(p.awards.find((b) => b.id === a.pub)!.seenAt).toBe('2026-09-10T00:00:00.000Z');
    expect(p.awards.find((b) => b.id === a.hidden)!.hidden).toBe(true);
    expect(p.awards.find((b) => b.id === a.review)!.status).toBe('en_revision');
    expect(p.awards.find((b) => b.id === a.acc)!.context).toHaveProperty('league');
  });

  it('no existe o no se ve: null; cuenta bloqueada: nada (salvo al superadmin)', async () => {
    const { a } = await setup();
    expect(await profile(w.u.extra, w.u.nuevo)).toBeNull();
    expect(await profile(w.u.extra, '00000000-0000-0000-0000-000000000000')).toBeNull();
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'x' });
    expect(await profile(w.u.otro, w.u.luis)).toEqual({ userId: w.u.luis, isMe: false, featured: [], awards: [], truncated: false });
    expect((await profile(w.u.dios, w.u.luis))!.awards.map((b) => b.id)).toEqual([a.pub, a.priv, a.acc]);
  });

  it('destacadas: solo las que quien mira puede ver hoy, en su orden', async () => {
    const { a } = await setup();
    expect(await db.rpc(w.u.luis, 'set_featured_badges', { p_ids: [a.priv, a.pub, a.acc] })).toEqual([a.priv, a.pub, a.acc]);
    expect((await profile(w.u.ana, w.u.luis))!.featured).toEqual([a.priv, a.pub, a.acc]);
    expect((await profile(w.u.otro, w.u.luis))!.featured).toEqual([a.pub, a.acc]);
    // Ocultarla la saca de las destacadas.
    await db.rpc(w.u.luis, 'set_badge_hidden', { p_award: a.pub, p_hidden: true });
    expect(await featuredOf(w.u.luis)).toEqual([a.priv, a.acc]);
    expect((await profile(w.u.otro, w.u.luis))!.featured).toEqual([a.acc]);
    // Revocada por el motor: deja de salir aunque siga en la lista.
    await db.admin(`update public.badge_awards set status = 'revocada', revoked_at = now(), revoke_reason = 'evidencia' where id = $1`, [a.acc]);
    expect((await profile(w.u.luis, w.u.luis))!.featured).toEqual([a.priv]);
  });

  it('una página de hasta 1000 (truncated)', async () => {
    await db.admin(
      `insert into public.badge_awards (badge_key, sport, level, period_key, user_id, status)
       select 'bowling_perfect_game', 'bowling', 0, 'g:' || i, $1, 'firme' from generate_series(1, 1001) i`,
      [w.u.ana],
    );
    const p = (await profile(w.u.luis, w.u.ana))!;
    expect(p.awards).toHaveLength(1000);
    expect(p.truncated).toBe(true);
  });
});

describe('destacadas, ocultar y visto', () => {
  it('set_featured_badges: hasta 3, suyas, visibles y no de ligas con menores', async () => {
    const mine = [
      await award({ key: 'bowling_club', player: w.p.luis, league: w.priv }),
      await award({ key: 'month_streak', sport: 'all', user: w.u.luis }),
      await award({ key: 'bowling_series', player: w.p.luis, league: w.priv, status: 'provisional' }),
      await award({ key: 'bowling_games', player: w.p.luis, league: w.priv }),
    ];
    expect(await db.rpc(w.u.luis, 'set_featured_badges', { p_ids: [mine[1], mine[0], mine[1]] })).toEqual([mine[1], mine[0]]);
    expect(await featuredOf(w.u.luis)).toEqual([mine[1], mine[0]]);
    await fails(db.rpc(w.u.luis, 'set_featured_badges', { p_ids: mine }), 'invalido');
    const hidden = await award({ key: 'bowling_breakthrough', player: w.p.luis, league: w.priv, hidden: true });
    const review = await award({ key: 'bowling_perfect_game', level: 0, player: w.p.luis, league: w.priv, status: 'en_revision' });
    const gone = await award({ key: 'bowling_strike_streak', player: w.p.luis, league: w.priv, status: 'revocada' });
    for (const id of [hidden, review, gone]) await fails(db.rpc(w.u.luis, 'set_featured_badges', { p_ids: [id] }), 'invalido');
    const { kids, luis: kidsLuis } = await kidsLeague();
    await fails(db.rpc(w.u.luis, 'set_featured_badges', { p_ids: [await award({ key: 'debut', level: 0, player: kidsLuis, league: kids })] }), 'invalido');
    // De otro (un jugador de la liga o la cuenta de alguien): no.
    await fails(db.rpc(w.u.luis, 'set_featured_badges', { p_ids: [await award({ player: w.p.pedro, league: w.priv })] }), DENIED);
    await fails(db.rpc(w.u.luis, 'set_featured_badges', { p_ids: [await award({ key: 'debut', sport: 'all', level: 0, user: w.u.ana })] }), DENIED);
    await fails(db.rpc(w.u.luis, 'set_featured_badges', { p_ids: ['00000000-0000-0000-0000-000000000000'] }), 'no_existe');
    expect(await featuredOf(w.u.luis)).toEqual([mine[1], mine[0]]);
    // null o [] las quita.
    expect(await db.rpc(w.u.luis, 'set_featured_badges', { p_ids: null })).toEqual([]);
    expect(await featuredOf(w.u.luis)).toEqual([]);
  });

  it('set_badge_hidden: solo el dueño (también de las de su jugador); mostrar vale para las privadas por defecto', async () => {
    const priv = await award({ key: 'bowling_breakthrough', player: w.p.luis, league: w.priv, hidden: true });
    await fails(db.rpc(w.u.org, 'set_badge_hidden', { p_award: priv, p_hidden: false }), DENIED);
    await fails(db.rpc(w.u.ana, 'set_badge_hidden', { p_award: priv, p_hidden: false }), DENIED);
    await fails(db.rpc(w.u.luis, 'set_badge_hidden', { p_award: priv, p_hidden: null }), 'invalido');
    await fails(db.rpc(w.u.luis, 'set_badge_hidden', { p_award: '00000000-0000-0000-0000-000000000000', p_hidden: true }), 'no_existe');
    expect(await visibleIds(w.u.ana)).toEqual([]);
    expect(await db.rpc(w.u.luis, 'set_badge_hidden', { p_award: priv, p_hidden: false })).toBe(false);
    expect(await visibleIds(w.u.ana)).toEqual([priv]);
    const acc = await award({ key: 'month_streak', sport: 'all', user: w.u.luis });
    expect(await db.rpc(w.u.luis, 'set_badge_hidden', { p_award: acc, p_hidden: true })).toBe(true);
    expect((await row(acc)).hidden).toBe(true);
  });

  it('mark_badges_seen: hasta 50, solo las suyas sin ver; devuelve cuántas', async () => {
    const a = await award({ key: 'bowling_club', player: w.p.luis, league: w.priv });
    const b = await award({ key: 'month_streak', sport: 'all', user: w.u.luis });
    const other = await award({ player: w.p.pedro, league: w.priv });
    expect(await db.rpc(w.u.luis, 'mark_badges_seen', { p_ids: [a, b, other] })).toBe(2);
    expect(await db.rpc(w.u.luis, 'mark_badges_seen', { p_ids: [a, b] })).toBe(0);
    expect((await row(a)).seen_at).toBeTruthy();
    expect((await row(other)).seen_at).toBeNull();
    expect(await db.rpc(w.u.luis, 'mark_badges_seen', { p_ids: [] })).toBe(0);
    await fails(db.rpc(w.u.luis, 'mark_badges_seen', { p_ids: null }), 'invalido');
    await fails(db.rpc(w.u.luis, 'mark_badges_seen', { p_ids: Array.from({ length: 51 }, () => a) }), 'invalido');
  });
});

describe('aval (review_badge)', () => {
  /** Torneo de la liga privada con luis (300) y sofi (admin, compite) jugando. */
  async function feat() {
    const t = await event(db, w.priv, 'torneo', '2026-09-26', 3, 'Torneo');
    const sofiPlayer = await player(db, w.priv, 'Sofi', w.u.sofi);
    const e = await entry(db, w.priv, t, w.p.luis, [300], ['importado']);
    await entry(db, w.priv, t, sofiPlayer, [180], ['importado']);
    return award({ key: 'bowling_perfect_game', level: 0, period: `g:${e}:1`, player: w.p.luis, league: w.priv, status: 'en_revision', refs: [`entry:${e}:1`] });
  }

  it('lo da un dueño o admin que no es el jugador ni compite en el evento', async () => {
    const id = await feat();
    // Mientras está en revisión solo la ve el jugador.
    expect(await visibleIds(w.u.ana)).toEqual([]);
    await fails(db.rpc(w.u.luis, 'review_badge', { p_award: id, p_ok: true }), DENIED);
    await fails(db.rpc(w.u.sofi, 'review_badge', { p_award: id, p_ok: true }), DENIED);
    await fails(db.rpc(w.u.ana, 'review_badge', { p_award: id, p_ok: true }), DENIED);
    await fails(db.rpc(w.u.otro, 'review_badge', { p_award: id, p_ok: true }), DENIED);
    // Aunque el jugador sea admin, no se confirma a sí mismo.
    await db.admin(`update public.league_members set role = 'admin' where league_id = $1 and user_id = $2`, [w.priv, w.u.luis]);
    await fails(db.rpc(w.u.luis, 'review_badge', { p_award: id, p_ok: true }), DENIED);
    await fails(db.rpc(w.u.org, 'review_badge', { p_award: id, p_ok: true, p_note: 'x'.repeat(141) }), 'invalido');
    await fails(db.rpc(w.u.org, 'review_badge', { p_award: '00000000-0000-0000-0000-000000000000', p_ok: true }), 'no_existe');

    expect(await db.rpc(w.u.org, 'review_badge', { p_award: id, p_ok: true, p_note: ' Vi la foto ' })).toBe('firme');
    const r = await row(id);
    expect(r).toMatchObject({ status: 'firme', revoke_reason: null });
    expect((r.context as Json).review).toMatchObject({ ok: true, note: 'Vi la foto' });
    expect(await visibleIds(w.u.ana)).toEqual([id]);
    // Ya decidida: devuelve cómo quedó (dos admins a la vez).
    expect(await db.rpc(w.u.org, 'review_badge', { p_award: id, p_ok: false })).toBe('firme');
    expect(await db.count('public.admin_audit', `action = 'review_badge'`)).toBe(0);
  });

  it('no se pudo confirmar: revocada con «aval», sin rastro público; el superadmin también decide (con auditoría)', async () => {
    const id = await feat();
    expect(await db.rpc(w.u.org, 'review_badge', { p_award: id, p_ok: false })).toBe('revocada');
    expect(await row(id)).toMatchObject({ status: 'revocada', revoke_reason: 'aval', revoked_by: w.u.org });
    expect(await visibleIds(w.u.ana)).toEqual([]);
    expect(await visibleIds(w.u.org)).toEqual([]);
    expect(await visibleIds(w.u.luis)).toEqual([id]);

    const other = await award({ key: 'bowling_seven_ten', level: 0, period: 'g:y:2', player: w.p.luis, league: w.priv, status: 'en_revision' });
    expect(await db.rpc(w.u.dios, 'review_badge', { p_award: other, p_ok: true })).toBe('firme');
    expect(await db.admin(`select actor_id, target_type, target_id, detail ->> 'key' as key from public.admin_audit where action = 'review_badge'`)).toEqual([
      { actor_id: w.u.dios, target_type: 'league', target_id: w.priv, key: 'bowling_seven_ten' },
    ]);
  });

  it('golf: nadie del mismo evento (su grupo tampoco)', async () => {
    const golf = await league(db, w.u.org, { name: 'Golf', visibility: 'private', sport: 'golf', requirePhoto: false });
    await member(db, golf, w.u.org, 'owner', 'org');
    await member(db, golf, w.u.sofi, 'admin', 'sofi');
    await member(db, golf, w.u.luis, 'member', 'luis');
    const gl = await player(db, golf, 'Luis', w.u.luis);
    const gs = await player(db, golf, 'Sofi', w.u.sofi);
    const course = await db.rpc<string>(w.u.org, 'golf_save_course', {
      p_league: golf,
      p_name: 'Campo',
      p_holes: DEMO_COURSE.holes.map((h) => ({ par: h.par, si: h.si })),
      p_tees: JSON.parse(JSON.stringify(DEMO_COURSE.tees)),
    });
    const ev = await db.rpc<string>(w.u.org, 'golf_create_round', { p_league: golf, p_date: '2026-09-20', p_course: course });
    await db.rpc(w.u.org, 'golf_add_players', { p_event: ev, p_players: [{ player_id: gl }, { player_id: gs }] });
    const [{ id: c }] = await db.admin<{ id: string }>('select id from public.golf_cards where event_id = $1 and player_id = $2', [ev, gl]);
    const id = await award({ key: 'golf_hole_in_one', sport: 'golf', level: 0, period: `c:${c}`, player: gl, league: golf, status: 'en_revision', refs: [`card:${c}`] });
    await fails(db.rpc(w.u.sofi, 'review_badge', { p_award: id, p_ok: true }), DENIED);
    expect(await db.rpc(w.u.org, 'review_badge', { p_award: id, p_ok: true })).toBe('firme');
  });
});

describe('retiro por fraude (super_revoke_badge)', () => {
  it('solo el superadmin; queda en la auditoría y sale de las destacadas', async () => {
    const id = await award({ key: 'bowling_club', level: 3, player: w.p.luis, league: w.priv });
    await db.rpc(w.u.luis, 'set_featured_badges', { p_ids: [id] });
    for (const who of [w.u.org, w.u.luis]) await fails(db.rpc(who, 'super_revoke_badge', { p_award: id }), DENIED);
    await fails(db.rpc(w.u.dios, 'super_revoke_badge', { p_award: id, p_note: 'x'.repeat(201) }), 'invalido');
    await fails(db.rpc(w.u.dios, 'super_revoke_badge', { p_award: '00000000-0000-0000-0000-000000000000' }), 'no_existe');
    await db.rpc(w.u.dios, 'super_revoke_badge', { p_award: id, p_note: 'Juegos inventados' });
    await db.rpc(w.u.dios, 'super_revoke_badge', { p_award: id });
    expect(await row(id)).toMatchObject({ status: 'revocada', revoke_reason: 'fraude', revoked_by: w.u.dios });
    expect(await featuredOf(w.u.luis)).toEqual([]);
    expect(await visibleIds(w.u.ana)).toEqual([]);
    const audit = await db.admin<{ target_type: string; target_id: string; detail: Json }>(
      `select target_type, target_id, detail from public.admin_audit where action = 'revoke_badge'`,
    );
    expect(audit).toEqual([
      {
        target_type: 'league',
        target_id: w.priv,
        detail: expect.objectContaining({ award: id, key: 'bowling_club', level: 3, userId: w.u.luis, status: 'firme', note: 'Juegos inventados' }),
      },
    ]);
    const acc = await award({ key: 'month_streak', sport: 'all', user: w.u.ana });
    await db.rpc(w.u.dios, 'super_revoke_badge', { p_award: acc });
    expect(await db.admin(`select target_type, target_id from public.admin_audit where action = 'revoke_badge' and detail ->> 'award' = $1`, [acc])).toEqual([
      { target_type: 'user', target_id: w.u.ana },
    ]);
  });
});

describe('reclamos y fusiones', () => {
  it('aprobar un reclamo con insignias en los dos jugadores: se juntan sin chocar', async () => {
    const { player_id: mine } = await joinPriv(w.u.nuevo);
    // Choca: la firme de Pedro gana a la provisional (más vieja) del propio; se lleva la fecha más vieja.
    const clubMine = await award({ key: 'bowling_club', player: mine, league: w.priv, status: 'provisional', at: '2026-09-20T00:00:00Z' });
    const clubPedro = await award({ key: 'bowling_club', player: w.p.pedro, league: w.priv, hidden: true, seen: '2026-09-26T00:00:00Z', at: '2026-09-25T00:00:00Z' });
    // Choca con el mismo estado: gana la más vieja; oculta solo si las dos lo estaban.
    const debutMine = await award({ key: 'debut', level: 0, player: mine, league: w.priv, hidden: true, at: '2026-09-01T00:00:00Z' });
    const debutPedro = await award({ key: 'debut', level: 0, player: w.p.pedro, league: w.priv, hidden: true, seen: '2026-09-11T00:00:00Z', at: '2026-09-10T00:00:00Z' });
    // No choca: pasa tal cual.
    const clean = await award({ key: 'bowling_clean_game', period: 'g:x:1', player: mine, league: w.priv, status: 'provisional' });
    const acc = await award({ key: 'month_streak', sport: 'all', user: w.u.nuevo });
    await db.admin(`insert into public.badge_progress (player_id, league_id, badge_key, sport, value, target, next_level) values ($1, $3, 'bowling_games', 'bowling', 5, 30, 1), ($2, $3, 'bowling_games', 'bowling', 9, 30, 1)`, [mine, w.p.pedro, w.priv]);
    await db.rpc(w.u.nuevo, 'set_featured_badges', { p_ids: [acc, clubMine] });

    const id = await db.rpc<string>(w.u.nuevo, 'request_player_claim', { p_player: w.p.pedro });
    expect(await db.rpc(w.u.sofi, 'decide_player_claim', { p_claim: id, p_approve: true })).toBe('approved');
    expect(await db.count('public.players', 'id = $1', [mine])).toBe(0);

    const left = await db.admin<{ id: string }>('select id from public.badge_awards where player_id = $1 order by id', [w.p.pedro]);
    expect(left.map((r) => r.id)).toEqual(sorted([clubPedro, debutMine, clean]));
    expect(await row(clubPedro)).toMatchObject({ status: 'firme', hidden: false, awarded_at: '2026-09-20T00:00:00.000Z', seen_at: '2026-09-26T00:00:00.000Z' });
    expect(await row(debutMine)).toMatchObject({ player_id: w.p.pedro, hidden: true, awarded_at: '2026-09-01T00:00:00.000Z', seen_at: '2026-09-11T00:00:00.000Z' });
    expect(await row(clean)).toMatchObject({ player_id: w.p.pedro, league_id: w.priv, status: 'provisional' });
    expect(await row(acc)).toMatchObject({ user_id: w.u.nuevo, player_id: null });
    // Las borradas dejan tombstone y salen de las destacadas; el progreso de los dos se recalcula (se borra).
    expect(await db.count('public.badge_awards', 'id = any ($1)', [[clubMine, debutPedro]])).toBe(0);
    expect(sorted((await db.admin<{ row_key: string }>(`select row_key from public.tombstones where tbl = 'badge_awards'`)).map((r) => r.row_key))).toEqual(
      sorted([clubMine, debutPedro]),
    );
    expect(await featuredOf(w.u.nuevo)).toEqual([acc]);
    expect(await db.count('public.badge_progress')).toBe(0);
    // Ahora son suyas por Pedro.
    expect(await visibleIds(w.u.nuevo)).toEqual(sorted([clubPedro, debutMine, clean, acc]));
  });

  it('juntar un duplicado que el admin anotó dos veces (la revocada pierde)', async () => {
    const first = await db.rpc<string>(w.u.ana, 'request_player_claim', { p_player: w.p.pedro });
    await db.rpc(w.u.org, 'decide_player_claim', { p_claim: first, p_approve: true });
    const dup = await player(db, w.priv, 'Pedro Pérez');
    const gone = await award({ key: 'bowling_series', player: w.p.pedro, league: w.priv, status: 'revocada', at: '2026-08-01T00:00:00Z' });
    const live = await award({ key: 'bowling_series', player: dup, league: w.priv, status: 'provisional', at: '2026-09-01T00:00:00Z' });
    const moved = await award({ key: 'bowling_games', level: 2, player: w.p.pedro, league: w.priv });
    const second = await db.rpc<string>(w.u.ana, 'request_player_claim', { p_player: dup });
    expect(await db.rpc(w.u.org, 'decide_player_claim', { p_claim: second, p_approve: true })).toBe('approved');
    expect((await db.admin<{ id: string }>('select id from public.badge_awards where player_id = $1 order by id', [dup])).map((r) => r.id)).toEqual(sorted([live, moved]));
    expect(await db.count('public.badge_awards', 'id = $1', [gone])).toBe(0);
    expect(await row(live)).toMatchObject({ status: 'provisional', awarded_at: '2026-08-01T00:00:00.000Z' });
  });

  it('en una liga de equipos también (y las de otra liga no se tocan)', async () => {
    const fut = await league(db, w.u.org, { name: 'Fútbol', visibility: 'private', sport: 'football', requirePhoto: false });
    await member(db, fut, w.u.org, 'owner', 'org');
    await member(db, fut, w.u.ana, 'member', 'ana');
    const guest = await player(db, fut, 'Ana G.');
    const mine = await db.rpc<string>(w.u.ana, 'ensure_my_player', { p_league: fut });
    const a = await award({ key: 'team_matches', sport: 'football', player: mine, league: fut });
    const b = await award({ key: 'team_matches', sport: 'football', player: guest, league: fut, level: 2 });
    const elsewhere = await award({ player: w.p.pedro, league: w.priv });
    const id = await db.rpc<string>(w.u.ana, 'request_player_claim', { p_player: guest });
    expect(await db.rpc(w.u.org, 'decide_player_claim', { p_claim: id, p_approve: true })).toBe('approved');
    expect((await db.admin<{ id: string }>('select id from public.badge_awards where player_id = $1 order by id', [guest])).map((r) => r.id)).toEqual(sorted([a, b]));
    expect(await row(elsewhere)).toMatchObject({ player_id: w.p.pedro });
  });
});

describe('bajar mis datos y borrar la cuenta', () => {
  it('export_my_data trae las de su cuenta y las de sus jugadores (con el progreso), nada de otros', async () => {
    const acc = await award({ key: 'month_streak', sport: 'all', user: w.u.luis });
    const lg = await award({ key: 'bowling_club', player: w.p.luis, league: w.priv, status: 'revocada' });
    const other = await award({ player: w.p.pedro, league: w.priv });
    const otherAcc = await award({ key: 'debut', sport: 'all', level: 0, user: w.u.ana });
    await db.admin(`insert into public.badge_progress (player_id, league_id, badge_key, sport, value, target, next_level) values ($1, $2, 'bowling_games', 'bowling', 12, 30, 1)`, [w.p.luis, w.priv]);
    await db.admin(`insert into public.badge_progress (user_id, badge_key, sport, value, target, next_level) values ($1, 'mileage', 'all', 20, 50, 1)`, [w.u.luis]);
    await db.rpc(w.u.luis, 'set_featured_badges', { p_ids: [acc] });

    const d = await db.rpc<Json & { tables: Record<string, Json[]>; account: Json; leagues: Json[] }>(w.u.luis, 'export_my_data');
    expect(sorted(d.tables.badge_awards.map((b) => b.id as string))).toEqual(sorted([acc, lg]));
    expect(d.tables.badge_progress.map((b) => b.badge_key).sort()).toEqual(['bowling_games', 'mileage']);
    expect(d.account.featuredBadges).toEqual([acc]);
    expect(d.leagues).toEqual([expect.objectContaining({ leagueId: w.priv, badgesAuto: 'todas' })]);
    const all = JSON.stringify(d);
    expect(all).not.toContain(other);
    expect(all).not.toContain(otherAcc);
    // Sin jugadores: solo lo de la cuenta.
    await award({ key: 'debut', sport: 'all', level: 0, user: w.u.nuevo });
    expect((await db.rpc<{ tables: Record<string, Json[]> }>(w.u.nuevo, 'export_my_data')).tables.badge_awards).toHaveLength(1);
  });

  it('al borrar la cuenta se van las de cuenta; las de liga se quedan en su jugador (sin cuenta)', async () => {
    const acc = await award({ key: 'month_streak', sport: 'all', user: w.u.luis });
    const lg = await award({ key: 'bowling_club', player: w.p.luis, league: w.priv });
    await db.admin('delete from auth.users where id = $1', [w.u.luis]);
    expect(await db.count('public.badge_awards', 'id = $1', [acc])).toBe(0);
    expect(await row(lg)).toMatchObject({ player_id: w.p.luis, league_id: w.priv, status: 'firme' });
    expect(await db.admin('select user_id from public.players where id = $1', [w.p.luis])).toEqual([{ user_id: null }]);
  });
});
