/**
 * Insignias en el perfil (20260929001300_insignias_perfil.sql): las de la liga (las que da una persona y los premios
 * del torneo) se destacan debajo del nombre (set_featured_badges y profile_badges.featured / featuredLeague), salen
 * solas de las destacadas al ocultarse, retirarse o esconderse su diseño, y quién las ve en el perfil de otra cuenta:
 * un premio con el orden verificado por el servidor de una competencia que jugaron 2+ cuentas (prize_accounts, contado
 * al entregar) basta con que la liga se vea y no tenga menores (aunque sea pequeña o nueva); el de una competencia de
 * una sola cuenta, el premio sin verificar y el que da una persona siguen con 6+ cuentas y 14+ días. Nunca las
 * ocultas, las de un diseño escondido ni las de ligas con menores. Cada una trae su premio (lugar, título y
 * competencia), y hasChosen dice si la cuenta eligió destacadas (aunque quien mira no vea ninguna).
 *
 * Mundo: el de fixture.ts (liga privada «Liga del Banco», nueva y con 4 cuentas: dueño org, admin sofi, miembros luis
 * y ana). Cada prueba en su transacción (se deshace al final).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, TestDb, fails } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';

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
interface Prize {
  slotId: string;
  verified: boolean;
  place: number | null;
  placeLabel: string | null;
  category: string | null;
  title: string | null;
  competition: string | null;
}
interface LeagueAward {
  id: string;
  badgeId: string;
  leagueName: string;
  period: string;
  hidden: boolean;
  note: string | null;
  prizeSlotId: string | null;
  prize: Prize | null;
  onProfile: boolean;
  badge: Json;
}
interface Profile {
  userId: string;
  isMe: boolean;
  featured: string[];
  featuredLeague: string[];
  hasChosen: boolean;
  awards: { id: string }[];
  leagueAwards: LeagueAward[];
  leagueTruncated: boolean;
}

const CAMPEON = { name: 'Campeón', shape: 'shield', palette: 'oro', icon: 'trophy', limit_kind: 'abierta', template: 'champion' };
const NEW_PRIVATE = [
  'league_award_accounts', 'league_award_prize', 'league_award_public', 'league_award_unfeature', 'league_badge_unfeature', 'prize_accounts',
];

const profile = (who: string, target: string) => db.rpc<Profile | null>(who, 'profile_badges', { p_user: target });
const feature = (who: string, ids: string[] | null) => db.rpc<string[]>(who, 'set_featured_badges', { p_ids: ids });
const featuredOf = async (uid: string) =>
  (await db.admin<{ f: string[] }>('select featured_badges as f from public.profiles where id = $1', [uid]))[0].f;
const idsOf = (list: { id: string }[]) => list.map((x) => x.id).sort();
const sorted = (xs: string[]) => [...xs].sort();

/** Un diseño del creador (lo guarda el dueño de la liga); devuelve su id. */
const design = async (lid: string, who = w.u.org, extra: Json = {}) =>
  (await db.rpc<{ id: string }>(who, 'save_league_badge', { p_league: lid, p_id: null, p_design: { ...CAMPEON, ...extra } })).id;
/** Una insignia que da una persona (award_league_badge); devuelve el id del otorgamiento. */
const give = async (who: string, badge: string, pid: string) =>
  (await db.rpc<{ awards: { id: string }[] }>(who, 'award_league_badge', { p_badge: badge, p_players: [pid], p_notify: false })).awards[0].id;

/** Una automática como la dejaría el motor (firme). */
async function auto(pid: string, lid: string, key = 'bowling_club'): Promise<string> {
  const rows = await db.admin<{ id: string }>(
    `insert into public.badge_awards (badge_key, sport, level, period_key, player_id, league_id, status)
     values ($1, 'bowling', 1, '-', $2, $3, 'firme') returning id`,
    [key, pid, lid],
  );
  return rows[0].id;
}

/** El jugador de org en esa liga (lo crea si no lo tiene). */
async function orgPlayer(lid: string): Promise<string> {
  const [have] = await db.admin<{ id: string }>('select id from public.players where league_id = $1 and user_id = $2', [lid, w.u.org]);
  return have?.id ?? player(db, lid, 'Org', w.u.org);
}

/** Una participación del boliche con un juego que cuenta (con puntaje y foto). */
const entryOf = (lid: string, ev: string, pid: string, score: number, average = 180) =>
  db.admin(`insert into public.entries (league_id, event_id, player_id, average, scores, photos) values ($1, $2, $3, $4, $5, $6)`, [
    lid,
    ev,
    pid,
    average,
    [score],
    ['sin-foto'],
  ]);

let evN = 0;
/**
 * Un premio del torneo como lo deja deliver_tournament_prizes: un torneo del boliche («Copa <n>», 80 % de handicap) que
 * juegan el ganador y `rivals` (por defecto el jugador de org: 2 cuentas), su premiación con el 1.er lugar individual y
 * el otorgamiento con prize_slot_id y prize_verified, entregado por org (prize_accounts lo cuenta la base).
 */
async function prize(lid: string, pid: string, badge: string, verified: boolean, rivals?: string[]): Promise<{ id: string; slot: string; ev: string }> {
  const name = `Copa ${++evN}`;
  const [{ id: ev }] = await db.admin<{ id: string }>(
    `insert into public.events (league_id, type, name, date, games, hcp_base, hcp_percent)
     values ($1, 'torneo', $2, '2026-09-20', 3, 230, 80) returning id`,
    [lid, name],
  );
  await entryOf(lid, ev, pid, 250);
  for (const r of rivals ?? [await orgPlayer(lid)]) await entryOf(lid, ev, r, 100);
  const [{ id: tp }] = await db.admin<{ id: string }>(
    `insert into public.tournament_prizes (league_id, scope, event_id, period) values ($1, 'evento', $2, 'SEP 2026') returning id`,
    [lid, ev],
  );
  const [{ id: slot }] = await db.admin<{ id: string }>(
    `insert into public.tournament_prize_slots (prize_id, league_id, category, place, badge_id, verified, delivered_at)
     values ($1, $2, 'individual', 1, $3, $4, now()) returning id`,
    [tp, lid, badge, verified],
  );
  const [{ id }] = await db.admin<{ id: string }>(
    `insert into public.league_badge_awards (badge_id, league_id, player_id, period, note, awarded_by, prize_slot_id, prize_verified)
     values ($1, $2, $3, 'SEP 2026', '1.er lugar · Individual (handicap) · ' || $4, $5, $6, $7) returning id`,
    [badge, lid, pid, name, w.u.org, slot, verified],
  );
  return { id, slot, ev };
}

/** Liga privada con menores de org, con luis (adulto, con cuenta) y ana de miembros. */
async function kidsLeague() {
  const kids = await league(db, w.u.org, { name: 'Escuelita', visibility: 'private', hasMinors: true, requirePhoto: false });
  await member(db, kids, w.u.org, 'owner', 'org');
  await member(db, kids, w.u.luis, 'member', 'luis');
  await member(db, kids, w.u.ana, 'member', 'ana');
  return { kids, luis: await player(db, kids, 'Luis', w.u.luis) };
}

/** La liga privada pasa private.league_badges_public: 6 cuentas miembro y 15 días de creada. */
async function growPriv() {
  await member(db, w.priv, w.u.nuevo, 'member', 'nuevo');
  await member(db, w.priv, w.u.otra, 'member', 'otra');
  await db.admin(`update public.leagues set created_at = now() - interval '15 days' where id = $1`, [w.priv]);
}

/**
 * Un premio del torneo entregado con las RPC de verdad (como en la app): `by` guarda un «Campeón», arma un torneo del
 * boliche de ayer (en la zona de la liga) con esas líneas [jugador, promedio, puntaje], elige el premio del 1.er lugar
 * individual, ve el podio que calcula el servidor y lo entrega. Devuelve el otorgamiento del que ganó.
 */
async function deliveredPrize(lid: string, by: string, lines: (readonly [string, number, number])[], name: string): Promise<string> {
  const [{ d }] = await db.admin<{ d: string }>('select (private.signup_today($1) - 1)::text as d', [lid]);
  const [{ id: ev }] = await db.admin<{ id: string }>(
    `insert into public.events (league_id, type, name, date, games, hcp_base, hcp_percent)
     values ($1, 'torneo', $2, $3, 1, 230, 80) returning id`,
    [lid, name, d],
  );
  for (const [pid, avg, score] of lines) await entryOf(lid, ev, pid, score, avg);
  const champ = await design(lid, by, { limit_kind: 'unica' });
  const set = await db.rpc<{ id: string; slots: { id: string }[] }>(by, 'set_tournament_prizes', {
    p_league: lid, p_scope: 'evento', p_ref: ev, p_period: null, p_slots: [{ category: 'individual', place: 1, badge_id: champ }],
  });
  const pod = await db.rpc<{ slots: { slotId: string; status: string; units: { ref: string; players: { id: string }[] }[] }[] }>(by, 'tournament_podium', {
    p_prize: set.id,
  });
  expect(pod.slots[0].status).toBe('listo');
  const want = pod.slots.map((s) => ({ slot_id: s.slotId, units: s.units.map((u) => ({ ref: u.ref, players: u.players.map((x) => x.id) })) }));
  await db.rpc(by, 'deliver_tournament_prizes', { p_prize: set.id, p_podium: want, p_notify: false });
  const [{ id }] = await db.admin<{ id: string }>(
    'select id from public.league_badge_awards where prize_slot_id = $1 and revoked_at is null',
    [set.slots[0].id],
  );
  return id;
}

describe('permisos', () => {
  it('las ayudas nuevas: nadie de la app; las RPC siguen solo con sesión', async () => {
    const rows = await db.admin<{ fn: string; anon: boolean; auth: boolean; definer: boolean }>(
      `select p.proname as fn, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth, p.prosecdef as definer
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = any ($1) order by 1`,
      [NEW_PRIVATE],
    );
    expect(rows).toEqual(NEW_PRIVATE.map((fn) => ({ fn, anon: false, auth: false, definer: true })));
    await fails(db.as(w.u.luis, 'select private.league_award_public(null::public.league_badge_awards)'), '42501');
    await fails(db.as(w.u.luis, 'select private.prize_accounts(null)'), '42501');
    // Cuántas cuentas jugaron no se lee directo (sin grant de la columna).
    await fails(db.as(w.u.luis, 'select prize_accounts from public.league_badge_awards'), '42501');
    await fails(db.rpc(ANON, 'profile_badges', { p_user: w.u.luis }), '42501');
    await fails(db.rpc(ANON, 'set_featured_badges', { p_ids: [] }), '42501');
  });
});

describe('destacadas con insignias de la liga', () => {
  it('set_featured_badges: premios del torneo y las que da una persona, junto con las automáticas y en su orden', async () => {
    const badge = await design(w.priv);
    const a = await auto(w.p.luis, w.priv);
    const manual = await give(w.u.org, badge, w.p.luis);
    const won = (await prize(w.priv, w.p.luis, badge, true)).id;
    expect(await feature(w.u.luis, [won, a, manual, won])).toEqual([won, a, manual]);
    expect(await featuredOf(w.u.luis)).toEqual([won, a, manual]);
    const own = (await profile(w.u.luis, w.u.luis))!;
    expect(own.featured).toEqual([won, a, manual]);
    expect(own.featuredLeague).toEqual([won, manual]);
    // null o [] las quita.
    expect(await feature(w.u.luis, null)).toEqual([]);
    expect((await profile(w.u.luis, w.u.luis))!).toMatchObject({ featured: [], featuredLeague: [] });
  });

  it('invalido: retirada, oculta, de un diseño escondido o de una liga con menores; de otro: no_permitido; no_existe', async () => {
    const badge = await design(w.priv);
    const keep = await give(w.u.org, badge, w.p.luis);
    await feature(w.u.luis, [keep]);
    const other = await design(w.priv, w.u.org, { name: 'Buena vibra' });
    const gone = await give(w.u.org, other, w.p.luis);
    await db.rpc(w.u.org, 'revoke_league_badge_award', { p_award: gone });
    const hidden = (await prize(w.priv, w.p.luis, badge, true)).id;
    await db.rpc(w.u.luis, 'set_league_badge_hidden', { p_award: hidden, p_hidden: true });
    const banned = await design(w.priv, w.u.org, { name: 'Escondida' });
    const bannedAward = await give(w.u.org, banned, w.p.luis);
    await db.rpc(w.u.dios, 'hide_league_badge', { p_id: banned, p_hidden: true });
    const { kids, luis: kidsLuis } = await kidsLeague();
    const kidsPrize = (await prize(kids, kidsLuis, await design(kids), true)).id;
    for (const id of [gone, hidden, bannedAward, kidsPrize]) await fails(feature(w.u.luis, [id]), 'invalido');
    // De otro: un jugador sin cuenta de la liga o el jugador de otra cuenta (también retirada, antes que invalido).
    const sofiP = await player(db, w.priv, 'Sofi', w.u.sofi);
    for (const id of [await give(w.u.org, badge, w.p.pedro), await give(w.u.org, badge, sofiP)]) await fails(feature(w.u.luis, [id]), DENIED);
    await fails(feature(w.u.sofi, [gone]), DENIED);
    await fails(feature(w.u.luis, ['00000000-0000-0000-0000-000000000000']), 'no_existe');
    // Hasta 3 entre las dos tablas.
    const more = [await auto(w.p.luis, w.priv), await auto(w.p.luis, w.priv, 'bowling_games'), (await prize(w.priv, w.p.luis, badge, false)).id];
    await fails(feature(w.u.luis, [keep, ...more]), 'invalido');
    // Nada de eso cambió las que tenía.
    expect(await featuredOf(w.u.luis)).toEqual([keep]);
  });

  it('salen solas al ocultarse, retirarse o esconderse su diseño, y no vuelven solas', async () => {
    const badge = await design(w.priv);
    const a = await auto(w.p.luis, w.priv);
    const manual = await give(w.u.org, badge, w.p.luis);
    const won = (await prize(w.priv, w.p.luis, badge, true)).id;
    await feature(w.u.luis, [manual, won, a]);
    // Oculta (y mostrada otra vez): fuera.
    await db.rpc(w.u.luis, 'set_league_badge_hidden', { p_award: manual, p_hidden: true });
    await db.rpc(w.u.luis, 'set_league_badge_hidden', { p_award: manual, p_hidden: false });
    expect(await featuredOf(w.u.luis)).toEqual([won, a]);
    // Retirada por el dueño: fuera.
    await db.rpc(w.u.org, 'revoke_league_badge_award', { p_award: won });
    expect(await featuredOf(w.u.luis)).toEqual([a]);
    // El superadmin esconde el diseño (y lo deja de esconder): fuera, también de las destacadas de otros.
    const other = await design(w.priv, w.u.org, { name: 'Buena vibra' });
    const mine = await give(w.u.org, other, w.p.luis);
    const anaP = await player(db, w.priv, 'Ana', w.u.ana);
    const hers = await give(w.u.org, other, anaP);
    await feature(w.u.luis, [a, mine]);
    await feature(w.u.ana, [hers]);
    await db.rpc(w.u.dios, 'hide_league_badge', { p_id: other, p_hidden: true });
    await db.rpc(w.u.dios, 'hide_league_badge', { p_id: other, p_hidden: false });
    expect(await featuredOf(w.u.luis)).toEqual([a]);
    expect(await featuredOf(w.u.ana)).toEqual([]);
  });
});

describe('quién ve las de la liga en el perfil', () => {
  /** Luis con un premio verificado, uno sin verificar y uno que da una persona, los tres destacados. */
  async function three() {
    const badge = await design(w.priv);
    const verified = (await prize(w.priv, w.p.luis, badge, true)).id;
    const unverified = (await prize(w.priv, w.p.luis, badge, false)).id;
    const manual = await give(w.u.org, badge, w.p.luis);
    await feature(w.u.luis, [verified, unverified, manual]);
    return { badge, verified, unverified, manual };
  }

  it('premio verificado (jugaron 2 cuentas): lo ve quien ve la liga aunque sea pequeña y nueva; sin verificar o dado a mano: no', async () => {
    const { verified, unverified, manual } = await three();
    // Ana (miembro) en una liga de 4 cuentas y creada hoy: solo el premio verificado.
    const ana = (await profile(w.u.ana, w.u.luis))!;
    expect(idsOf(ana.leagueAwards)).toEqual([verified]);
    expect(ana.leagueAwards[0]).toMatchObject({ onProfile: true, note: null, prizeSlotId: expect.any(String), prize: { verified: true } });
    expect(ana).toMatchObject({ featured: [verified], featuredLeague: [verified] });
    // Alguien de fuera no ve la liga privada: nada.
    expect((await profile(w.u.extra, w.u.luis))!).toMatchObject({ leagueAwards: [], featured: [], featuredLeague: [] });
    // Luis ve las tres, destacadas en su orden, y cuáles salen para otros.
    const own = (await profile(w.u.luis, w.u.luis))!;
    expect(own.featured).toEqual([verified, unverified, manual]);
    expect(own.featuredLeague).toEqual([verified, unverified, manual]);
    expect(Object.fromEntries(own.leagueAwards.map((x) => [x.id, x.onProfile]))).toEqual({ [verified]: true, [unverified]: false, [manual]: false });
    // Liga pública: el de fuera también ve el premio verificado.
    await db.admin(`update public.leagues set visibility = 'public' where id = $1`, [w.priv]);
    expect((await profile(w.u.extra, w.u.luis))!).toMatchObject({ featured: [verified], featuredLeague: [verified] });
    expect(idsOf((await profile(w.u.extra, w.u.luis))!.leagueAwards)).toEqual([verified]);
    // Con 6 cuentas y 15 días (league_badges_public), las tres.
    await growPriv();
    const grown = (await profile(w.u.ana, w.u.luis))!;
    expect(idsOf(grown.leagueAwards)).toEqual(sorted([verified, unverified, manual]));
    expect(grown.featured).toEqual([verified, unverified, manual]);
    expect((await profile(w.u.luis, w.u.luis))!.leagueAwards.every((x) => x.onProfile)).toBe(true);
  });

  it('nunca las ocultas ni las de un diseño escondido (a nadie más que al dueño la oculta; el diseño escondido, ni a él)', async () => {
    const { badge, verified } = await three();
    await db.rpc(w.u.luis, 'set_league_badge_hidden', { p_award: verified, p_hidden: true });
    expect((await profile(w.u.ana, w.u.luis))!).toMatchObject({ leagueAwards: [], featured: [], featuredLeague: [] });
    const own = (await profile(w.u.luis, w.u.luis))!;
    expect(own.leagueAwards.find((x) => x.id === verified)).toMatchObject({ hidden: true, onProfile: false });
    expect(own.featured).not.toContain(verified);
    await db.rpc(w.u.luis, 'set_league_badge_hidden', { p_award: verified, p_hidden: false });
    expect(idsOf((await profile(w.u.ana, w.u.luis))!.leagueAwards)).toEqual([verified]);
    // El superadmin esconde el diseño: ya no sale en ningún perfil (tampoco en el propio).
    await db.rpc(w.u.dios, 'hide_league_badge', { p_id: badge, p_hidden: true });
    expect((await profile(w.u.ana, w.u.luis))!.leagueAwards).toEqual([]);
    expect((await profile(w.u.luis, w.u.luis))!).toMatchObject({ leagueAwards: [], featured: [], featuredLeague: [] });
  });

  it('ligas con menores: el premio verificado solo lo ve su dueño, y no se destaca', async () => {
    const { kids, luis: kidsLuis } = await kidsLeague();
    const kidsPrize = (await prize(kids, kidsLuis, await design(kids), true)).id;
    expect((await profile(w.u.ana, w.u.luis))!.leagueAwards).toEqual([]);
    expect((await profile(w.u.org, w.u.luis))!.leagueAwards).toEqual([]);
    expect((await profile(w.u.dios, w.u.luis))!.leagueAwards).toEqual([]);
    const own = (await profile(w.u.luis, w.u.luis))!;
    expect(own.leagueAwards.map((x) => [x.id, x.onProfile])).toEqual([[kidsPrize, false]]);
    await fails(feature(w.u.luis, [kidsPrize]), 'invalido');
    // Si la destacó antes de que la liga tuviera menores, deja de salir (también para él).
    await db.admin('update public.leagues set has_minors = false where id = $1', [kids]);
    await feature(w.u.luis, [kidsPrize]);
    await db.admin('update public.leagues set has_minors = true where id = $1', [kids]);
    expect((await profile(w.u.luis, w.u.luis))!).toMatchObject({ featured: [], featuredLeague: [] });
  });

  it('una liga de uno no fabrica un «Campeón» público: sin otra cuenta que jugara, el premio verificado no sale afuera', async () => {
    // Liga pública «Liga Abierta», creada hoy y con una sola cuenta (otro, el dueño): se arma un torneo con un jugador
    // sin cuenta, gana y se lo entrega. El orden lo verificó el servidor, pero no jugó ninguna otra cuenta.
    const mine = await player(db, w.pub, 'Otro', w.u.otro);
    const won = await deliveredPrize(w.pub, w.u.otro, [[mine, 180, 250], [w.p.p1, 170, 150]], 'Copa Solo');
    const accounts = async (id: string) =>
      (await db.admin<{ v: boolean; n: number | null }>('select prize_verified as v, prize_accounts as n from public.league_badge_awards where id = $1', [id]))[0];
    expect(await accounts(won)).toEqual({ v: true, n: 1 });
    // Nadie de afuera lo ve (tampoco destacado); el dueño lo ve «solo en su liga».
    expect(await feature(w.u.otro, [won])).toEqual([won]);
    expect((await profile(w.u.extra, w.u.otro))!).toMatchObject({ leagueAwards: [], featured: [], featuredLeague: [], hasChosen: true });
    const own = (await profile(w.u.otro, w.u.otro))!;
    expect(own.leagueAwards.map((x) => [x.id, x.onProfile, x.prize?.verified])).toEqual([[won, false, true]]);
    expect(own).toMatchObject({ featured: [won], hasChosen: true });

    // Org entra a la liga y juega el siguiente torneo: lo gana otro y se lo entrega él mismo (puede: el orden es del
    // servidor). Jugaron 2 cuentas: sale afuera aunque la liga siga pequeña y nueva. El primero, no.
    await member(db, w.pub, w.u.org, 'member', 'org');
    const orgP = await player(db, w.pub, 'Org', w.u.org);
    const won2 = await deliveredPrize(w.pub, w.u.otro, [[mine, 180, 250], [orgP, 170, 150]], 'Copa Dos');
    expect(await accounts(won2)).toEqual({ v: true, n: 2 });
    expect(idsOf((await profile(w.u.extra, w.u.otro))!.leagueAwards)).toEqual([won2]);
    expect(Object.fromEntries((await profile(w.u.otro, w.u.otro))!.leagueAwards.map((x) => [x.id, x.onProfile]))).toEqual({ [won]: false, [won2]: true });
    // Se cuenta al entregar: si después se bloquea a org, el premio se queda como estaba (contar hoy daría 1).
    const [{ prize: pz }] = await db.admin<{ prize: string }>(
      'select s.prize_id as prize from public.tournament_prize_slots s join public.league_badge_awards a on a.prize_slot_id = s.id where a.id = $1',
      [won2],
    );
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.org, p_reason: 'x' });
    expect((await db.admin<{ n: number }>('select private.prize_accounts($1) as n', [pz]))[0].n).toBe(1);
    expect(await accounts(won2)).toEqual({ v: true, n: 2 });
    await db.rpc(w.u.dios, 'admin_unblock_user', { p_user: w.u.org });

    // Cuando la liga pasa league_badges_public (6+ cuentas y 14+ días), el primero también sale.
    for (const [uid, name] of [[w.u.sofi, 'sofi'], [w.u.luis, 'luis'], [w.u.ana, 'ana'], [w.u.nuevo, 'nuevo']] as const) {
      await member(db, w.pub, uid, 'member', name);
    }
    await db.admin(`update public.leagues set created_at = now() - interval '15 days' where id = $1`, [w.pub]);
    expect((await profile(w.u.extra, w.u.otro))!).toMatchObject({ featured: [won], featuredLeague: [won] });
    expect(idsOf((await profile(w.u.extra, w.u.otro))!.leagueAwards)).toEqual(sorted([won, won2]));
  });

  it('cuántas cuentas jugaron (private.prize_accounts): cuadro de raqueta, relámpago y playoff; sin cuenta, anulados y bloqueadas no', async () => {
    const accountsOf = async (prizeId: string) => (await db.admin<{ n: number }>('select private.prize_accounts($1) as n', [prizeId]))[0].n;
    const prizeFor = async (lid: string, scope: 'evento' | 'playoff', ref: string) =>
      (
        await db.admin<{ id: string }>(`insert into public.tournament_prizes (league_id, scope, event_id, playoff_id) values ($1, $2, $3, $4) returning id`, [
          lid,
          scope,
          scope === 'evento' ? ref : null,
          scope === 'playoff' ? ref : null,
        ])
      )[0].id;
    const team = async (lid: string, name: string, roster: string[]) => {
      const [{ id }] = await db.admin<{ id: string }>('insert into public.teams (league_id, name) values ($1, $2) returning id', [lid, name]);
      for (const pid of roster) await db.admin('insert into public.team_players (team_id, player_id, league_id) values ($1, $2, $3)', [id, pid, lid]);
      return id;
    };
    type Side = { team?: string; players?: string[] };
    const match = async (lid: string, sides: [Side, Side], o: { event?: string; key?: string; status?: string; series?: string } = {}) => {
      const [{ id }] = await db.admin<{ id: string }>(
        `insert into public.matches (league_id, event_id, bracket_key, status, winner_side, proposed_at, series_id)
         values ($1, $2, $3, $4, 1, now() - interval '1 hour', $5) returning id`,
        [lid, o.event ?? null, o.key ?? null, o.status ?? 'confirmed', o.series ?? null],
      );
      for (const [i, sd] of sides.entries()) {
        await db.admin('insert into public.match_sides (match_id, side, league_id, team_id, label) values ($1, $2, $3, $4, $5)', [id, i + 1, lid, sd.team ?? null, `Lado ${i + 1}`]);
        for (const pid of sd.players ?? []) {
          await db.admin('insert into public.match_players (match_id, player_id, league_id, side) values ($1, $2, $3, $4)', [id, pid, lid, i + 1]);
        }
      }
      return id;
    };
    const eventOf = async (lid: string) =>
      (await db.admin<{ id: string }>(`insert into public.events (league_id, type, name, date) values ($1, 'torneo', 'Copa', '2026-09-20') returning id`, [lid]))[0].id;

    // Raqueta (torneo por categorías): cuentan la alineación y la pareja de cada lado de los partidos no anulados.
    const padel = await league(db, w.u.org, { name: 'Pádel del Club', visibility: 'public', sport: 'padel', requirePhoto: false });
    for (const [uid, role, name] of [
      [w.u.org, 'owner', 'org'],
      [w.u.luis, 'member', 'luis'],
      [w.u.sofi, 'member', 'sofi'],
      [w.u.ana, 'member', 'ana'],
    ] as const) {
      await member(db, padel, uid, role, name);
    }
    const luisP = await player(db, padel, 'Luis', w.u.luis);
    const sofiP = await player(db, padel, 'Sofi', w.u.sofi);
    const anaP = await player(db, padel, 'Ana', w.u.ana);
    const x = await player(db, padel, 'Equis');
    const y = await player(db, padel, 'Ye');
    const ev = await eventOf(padel);
    const racket = await prizeFor(padel, 'evento', ev);
    await match(padel, [{ players: [luisP] }, { players: [x] }], { event: ev, key: 'A-R1-1' });
    expect(await accountsOf(racket)).toBe(1);
    await match(padel, [{ players: [anaP] }, { players: [y] }], { event: ev, key: 'A-R1-2', status: 'void' });
    expect(await accountsOf(racket)).toBe(1);
    await match(padel, [{ team: await team(padel, 'Pareja Sofi', [sofiP, y]) }, { players: [x] }], { event: ev, key: 'A-R2-1' });
    expect(await accountsOf(racket)).toBe(2);
    // Una cuenta bloqueada no cuenta.
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.sofi, p_reason: 'x' });
    expect(await accountsOf(racket)).toBe(1);
    await db.rpc(w.u.dios, 'admin_unblock_user', { p_user: w.u.sofi });

    // Relámpago (liga kind torneo de baloncesto): los partidos de la liga fuera de un playoff, con sus plantillas.
    const hoops = await league(db, w.u.org, { name: 'Copa Relámpago', visibility: 'public', sport: 'basketball', kind: 'torneo', requirePhoto: false });
    await member(db, hoops, w.u.org, 'owner', 'org');
    await member(db, hoops, w.u.luis, 'member', 'luis');
    await member(db, hoops, w.u.sofi, 'member', 'sofi');
    const hLuis = await player(db, hoops, 'Luis', w.u.luis);
    const hSofi = await player(db, hoops, 'Sofi', w.u.sofi);
    const ko = await prizeFor(hoops, 'evento', await eventOf(hoops));
    const tA = await team(hoops, 'Equipo A', [hLuis, await player(db, hoops, 'H1')]);
    const tB = await team(hoops, 'Equipo B', [await player(db, hoops, 'H2')]);
    await match(hoops, [{ team: tA }, { team: tB }], { key: 'R1-1' });
    expect(await accountsOf(ko)).toBe(1);
    await db.admin('insert into public.team_players (team_id, player_id, league_id) values ($1, $2, $3)', [tB, hSofi, hoops]);
    expect(await accountsOf(ko)).toBe(2);

    // Playoff: los partidos de sus series y las plantillas de los equipos de las series (una serie sin juegos también).
    const liga = await league(db, w.u.org, { name: 'Liga de Barrio', visibility: 'public', sport: 'basketball', requirePhoto: false });
    await member(db, liga, w.u.org, 'owner', 'org');
    await member(db, liga, w.u.ana, 'member', 'ana');
    await member(db, liga, w.u.luis, 'member', 'luis');
    const lAna = await player(db, liga, 'Ana', w.u.ana);
    const lLuis = await player(db, liga, 'Luis', w.u.luis);
    const l1 = await player(db, liga, 'L1');
    const [{ id: season }] = await db.admin<{ id: string }>(`select id from public.seasons where league_id = $1 and status = 'active'`, [liga]);
    const tC = await team(liga, 'Equipo C', [lAna]);
    const tD = await team(liga, 'Equipo D', [l1]);
    const [{ id: po }] = await db.admin<{ id: string }>(
      `insert into public.playoffs (league_id, season_id, status, best_of, seeds, winner) values ($1, $2, 'finished', '{1}', $3, $4) returning id`,
      [liga, season, [tC, tD], tC],
    );
    const [{ id: fin }] = await db.admin<{ id: string }>(
      `insert into public.playoff_series (playoff_id, league_id, round, slot, best_of, team_a, team_b, label_a, label_b, winner)
       values ($1, $2, 1, 1, 1, $3, $4, 'C', 'D', $3) returning id`,
      [po, liga, tC, tD],
    );
    const playoff = await prizeFor(liga, 'playoff', po);
    expect(await accountsOf(playoff)).toBe(1);
    // Un refuerzo con cuenta que jugó la final (en la alineación, sin estar en la plantilla).
    await match(liga, [{ team: tC, players: [lAna] }, { team: tD, players: [l1, lLuis] }], { key: 'PO1-1', series: fin });
    expect(await accountsOf(playoff)).toBe(2);
    // Una premiación que no existe: 0.
    expect(await accountsOf('00000000-0000-0000-0000-000000000000')).toBe(0);
  });

  it('hasChosen: eligió aunque quien mira no vea ninguna; sin elegir o si ya no vale ninguna, false', async () => {
    const { unverified } = await three();
    await feature(w.u.luis, [unverified]);
    // Ana no ve el premio sin verificar (liga pequeña): no ve destacadas, pero sabe que eligió (no salen solas).
    expect((await profile(w.u.ana, w.u.luis))!).toMatchObject({ featured: [], featuredLeague: [], hasChosen: true });
    expect((await profile(w.u.luis, w.u.luis))!).toMatchObject({ featured: [unverified], hasChosen: true });
    await feature(w.u.luis, []);
    expect((await profile(w.u.ana, w.u.luis))!).toMatchObject({ featured: [], hasChosen: false });
    expect((await profile(w.u.luis, w.u.luis))!.hasChosen).toBe(false);
    // Una que ya no vale para nadie (la liga pasó a tener menores) no cuenta como elegida.
    const { kids, luis: kidsLuis } = await kidsLeague();
    await db.admin('update public.leagues set has_minors = false where id = $1', [kids]);
    const a = await auto(kidsLuis, kids);
    await feature(w.u.luis, [a]);
    expect((await profile(w.u.luis, w.u.luis))!.hasChosen).toBe(true);
    await db.admin('update public.leagues set has_minors = true where id = $1', [kids]);
    expect((await profile(w.u.luis, w.u.luis))!).toMatchObject({ featured: [], hasChosen: false });
    expect((await profile(w.u.ana, w.u.luis))!.hasChosen).toBe(false);
  });

  it('cuenta bloqueada: nada (salvo al superadmin); quien está bloqueado no mira', async () => {
    const { verified } = await three();
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'x' });
    expect(await profile(w.u.ana, w.u.luis)).toEqual({
      userId: w.u.luis, isMe: false, featured: [], featuredLeague: [], hasChosen: false, awards: [], truncated: false,
      leagueAwards: [], leagueTruncated: false,
    });
    // El superadmin ve la liga (social_league_ok): el premio verificado y la destacada.
    expect((await profile(w.u.dios, w.u.luis))!).toMatchObject({ featured: [verified], featuredLeague: [verified] });
    await db.rpc(w.u.dios, 'admin_unblock_user', { p_user: w.u.luis });
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.ana, p_reason: 'x' });
    await fails(profile(w.u.ana, w.u.luis), 'bloqueada');
    // Una cuenta bloqueada no escribe: tampoco destaca.
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'x' });
    await fails(feature(w.u.luis, []), 'bloqueada');
  });
});

describe('el premio del torneo se lee claro', () => {
  it('entregado por el servidor: lugar, título y competencia en el perfil y los avisos; sin la competencia, se queda', async () => {
    const [{ d }] = await db.admin<{ d: string }>('select (private.signup_today($1) - 1)::text as d', [w.priv]);
    const [{ id: ev }] = await db.admin<{ id: string }>(
      `insert into public.events (league_id, type, name, date, games, hcp_base, hcp_percent)
       values ($1, 'torneo', 'Copa de Octubre', $2, 1, 230, 80) returning id`,
      [w.priv, d],
    );
    const orgP = await player(db, w.priv, 'Org', w.u.org);
    // Con handicap: luis 200 + 40 = 240, org 150 + 48 = 198.
    for (const [pid, avg, score] of [[w.p.luis, 180, 200], [orgP, 170, 150]] as const) {
      await db.admin(
        `insert into public.entries (league_id, event_id, player_id, average, scores, photos) values ($1, $2, $3, $4, $5, $6)`,
        [w.priv, ev, pid, avg, [score], ['sin-foto']],
      );
    }
    const champ = await design(w.priv, w.u.org, { limit_kind: 'unica' });
    const manual = await give(w.u.org, champ, w.p.luis);
    const set = await db.rpc<{ id: string; slots: { id: string }[] }>(w.u.org, 'set_tournament_prizes', {
      p_league: w.priv, p_scope: 'evento', p_ref: ev, p_period: 'OCT 2026', p_slots: [{ category: 'individual', place: 1, badge_id: champ }],
    });
    const pod = await db.rpc<{ slots: { slotId: string; units: { ref: string; players: { id: string }[] }[] }[] }>(w.u.org, 'tournament_podium', {
      p_prize: set.id,
    });
    const want = pod.slots.map((s) => ({ slot_id: s.slotId, units: s.units.map((u) => ({ ref: u.ref, players: u.players.map((x) => x.id) })) }));
    expect(want[0].units.map((u) => u.ref)).toEqual([`p:${w.p.luis}`]);
    await db.rpc(w.u.org, 'deliver_tournament_prizes', { p_prize: set.id, p_podium: want, p_notify: false });
    const [{ id: won }] = await db.admin<{ id: string }>('select id from public.league_badge_awards where prize_slot_id = $1', [set.slots[0].id]);

    const expected = {
      slotId: set.slots[0].id, verified: true, place: 1, placeLabel: '1.er lugar', category: 'individual',
      title: 'Individual (handicap)', competition: 'Copa de Octubre',
    };
    // Ana (miembro de una liga pequeña y nueva) ve el premio verificado: «Campeón · Copa de Octubre · Liga del Banco».
    const seen = (await profile(w.u.ana, w.u.luis))!.leagueAwards;
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      id: won, leagueName: 'Liga del Banco', period: 'OCT 2026', prizeSlotId: set.slots[0].id, prize: expected,
      badge: expect.objectContaining({ name: 'Campeón' }),
    });
    // El propio: el premio y la que dio una persona (sin premio).
    const own = (await profile(w.u.luis, w.u.luis))!.leagueAwards;
    expect(own.find((x) => x.id === won)!.prize).toEqual(expected);
    expect(own.find((x) => x.id === manual)).toMatchObject({ prizeSlotId: null, prize: null, onProfile: false });
    // Los avisos traen lo mismo.
    const notices = await db.rpc<{ leagueAwards: LeagueAward[] }>(w.u.luis, 'badge_notices', {});
    expect(notices.leagueAwards.find((x) => x.id === won)!.prize).toEqual(expected);
    // Se destaca, y se borra la competencia: el premio se queda (verificado), sin lugar ni competencia.
    await feature(w.u.luis, [won]);
    await db.admin('delete from public.events where id = $1', [ev]);
    expect(await db.count('public.tournament_prize_slots', 'id = $1', [set.slots[0].id])).toBe(0);
    const after = (await profile(w.u.ana, w.u.luis))!;
    expect(after.featured).toEqual([won]);
    expect(after.leagueAwards.map((x) => x.prize)).toEqual([
      { slotId: set.slots[0].id, verified: true, place: null, placeLabel: null, category: null, title: null, competition: null },
    ]);
  });
});
