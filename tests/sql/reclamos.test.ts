/**
 * Reclamos (20260929000100_reclamos.sql): «ese jugador soy yo». La cuenta pide un jugador sin cuenta de su liga y
 * el dueño o un admin lo aprueba; al aprobar se juntan el jugador propio de la cuenta y el reclamado. Unirse
 * eligiendo «¿Quién eres?» (o con el mismo nombre) ya no vincula al momento: deja el pedido.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DENIED, TestDb, fails } from './harness';
import { event, entry, league, makeWorld, member, player, type World } from './fixture';

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
interface Claim {
  id: string;
  status: string;
  player_id: string;
  user_id: string;
  note: string | null;
  claimant_name: string;
  player_name: string;
  decided_by: string | null;
  decision_note: string | null;
}

const phone = (uid: string) =>
  db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'BPclave', 'secreto')`, [
    uid,
    `https://fcm.googleapis.com/fcm/send/${uid}`,
  ]);
const outbox = () => db.admin<{ user_id: string; title: string; body: string; url: string }>('select user_id, title, body, url from public.push_outbox order by title, user_id');
const claim = async (id: string) => (await db.admin<Claim>('select * from public.player_claims where id = $1', [id]))[0];
const ownerOf = async (pid: string) => (await db.admin<{ user_id: string | null }>('select user_id from public.players where id = $1', [pid]))[0]?.user_id;
const exists = async (pid: string) => (await db.count('public.players', 'id = $1', [pid])) === 1;
const joinPriv = (uid: string, prefer: string | null = null) =>
  db.rpc<{ league_id: string; player_id: string; claim_id: string | null }>(uid, 'join_league', { p_code: 'ABCD2345', p_prefer: prefer });

describe('pedir un jugador', () => {
  it('queda pendiente, el jugador sigue libre y les llega a los admins', async () => {
    await phone(w.u.org);
    await phone(w.u.sofi);
    await phone(w.u.ana);
    const id = await db.rpc<string>(w.u.ana, 'request_player_claim', { p_player: w.p.pedro, p_note: ' Soy yo, el de los martes ' });
    expect(await claim(id)).toMatchObject({ status: 'pending', player_id: w.p.pedro, user_id: w.u.ana, note: 'Soy yo, el de los martes', claimant_name: 'ana', player_name: 'Pedro' });
    expect(await ownerOf(w.p.pedro)).toBeNull();
    expect(await outbox()).toEqual(
      [w.u.org, w.u.sofi]
        .sort()
        .map((u) => ({ user_id: u, title: 'ana dice que es Pedro', body: 'En Liga del Banco. Toca para aprobar o rechazar. «Soy yo, el de los martes»', url: `/l/${w.priv}/admin?tab=reclamos` })),
    );
    // Pedirlo otra vez: el mismo pedido (sin otro push).
    expect(await db.rpc(w.u.ana, 'request_player_claim', { p_player: w.p.pedro })).toBe(id);
    expect(await outbox()).toHaveLength(2);
  });

  it('lo leen quien lo pidió y los admins de la liga (y el superadmin); nadie escribe directo', async () => {
    const id = await db.rpc<string>(w.u.ana, 'request_player_claim', { p_player: w.p.pedro });
    const read = (uid: string) => db.asUser<{ id: string }>(uid, 'select id from public.player_claims');
    for (const u of [w.u.ana, w.u.org, w.u.sofi, w.u.dios]) expect(await read(u)).toEqual([{ id }]);
    for (const u of [w.u.luis, w.u.otro, w.u.extra]) expect(await read(u)).toEqual([]);
    await fails(db.asUser(w.u.ana, `update public.player_claims set status = 'approved'`), '42501');
    await fails(
      db.asUser(w.u.ana, 'insert into public.player_claims (league_id, player_id, user_id) values ($1, $2, $3)', [w.priv, w.p.pedro, w.u.ana]),
      '42501',
    );
  });

  it('solo un jugador libre, no menor y de su liga; uno pendiente por jugador y por cuenta', async () => {
    await fails(db.rpc(w.u.ana, 'request_player_claim', { p_player: w.p.p1 }), DENIED);
    await fails(db.rpc(w.u.ana, 'request_player_claim', { p_player: w.p.luis }), 'duplicado');
    await fails(db.rpc(w.u.ana, 'request_player_claim', { p_player: w.p.pedro, p_note: 'x'.repeat(301) }), 'invalido');
    await fails(db.rpc(w.u.ana, 'request_player_claim', { p_player: '00000000-0000-0000-0000-000000000000' }), 'no_existe');
    // El suyo: nada que pedir.
    expect(await db.rpc(w.u.luis, 'request_player_claim', { p_player: w.p.luis })).toBeNull();
    // Menores: nunca.
    const kids = await league(db, w.u.org, { name: 'Infantil', visibility: 'private', hasMinors: true, requirePhoto: false });
    await member(db, kids, w.u.org, 'owner', 'org');
    await member(db, kids, w.u.ana, 'member', 'ana');
    const [{ id: kid }] = await db.admin<{ id: string }>(`insert into public.players (league_id, name, is_minor) values ($1, 'Nene', true) returning id`, [kids]);
    await fails(db.rpc(w.u.ana, 'request_player_claim', { p_player: kid }), 'invalido');
    // Luis ya tiene jugador y aun así puede pedir (al aprobar se juntan). Ana ya no puede pedir a Pedro.
    const first = await db.rpc<string>(w.u.luis, 'claim_player', { p_player: w.p.pedro });
    await fails(db.rpc(w.u.ana, 'request_player_claim', { p_player: w.p.pedro }), 'duplicado');
    // Luis cambia de idea: el primero se cancela y Pedro queda para ana.
    const otro = await player(db, w.priv, 'Otro');
    const second = await db.rpc<string>(w.u.luis, 'request_player_claim', { p_player: otro });
    expect((await claim(first)).status).toBe('cancelled');
    expect((await claim(second)).status).toBe('pending');
    expect(await db.rpc(w.u.ana, 'request_player_claim', { p_player: w.p.pedro })).toBeTruthy();
  });

  it('quien lo pidió lo retira; salir de la liga también lo cancela', async () => {
    const id = await db.rpc<string>(w.u.ana, 'request_player_claim', { p_player: w.p.pedro });
    await fails(db.rpc(w.u.luis, 'cancel_player_claim', { p_claim: id }), 'no_existe');
    await db.rpc(w.u.ana, 'cancel_player_claim', { p_claim: id });
    await db.rpc(w.u.ana, 'cancel_player_claim', { p_claim: id });
    expect((await claim(id)).status).toBe('cancelled');
    const again = await db.rpc<string>(w.u.ana, 'request_player_claim', { p_player: w.p.pedro });
    await db.rpc(w.u.ana, 'leave_league', { p_league: w.priv });
    expect((await claim(again)).status).toBe('cancelled');
  });

  it('10 pedidos por día', async () => {
    for (let i = 0; i < 10; i++) await db.rpc(w.u.ana, 'request_player_claim', { p_player: await player(db, w.priv, `J${i}`) });
    await fails(db.rpc(w.u.ana, 'request_player_claim', { p_player: w.p.pedro }), 'rate_limited');
  });
});

describe('decidir', () => {
  it('aprobar junta el jugador propio con el reclamado (juegos, felicitaciones, «voy») y avisa', async () => {
    await phone(w.u.nuevo);
    const { player_id: mine } = await joinPriv(w.u.nuevo);
    const e2 = await event(db, w.priv, 'practica', '2026-09-29');
    const en = await entry(db, w.priv, e2, mine, [201], [null]);
    await db.admin(
      `insert into public.reactions (league_id, entry_id, event_id, player_id, user_id, author_name, type) values ($1, $2, $3, $4, $5, 'luis', 'felicitar')`,
      [w.priv, en, e2, mine, w.u.luis],
    );
    await db.admin('insert into public.event_rsvps (event_id, player_id, league_id, going) values ($1, $2, $3, true)', [w.e.e1, mine, w.priv]);
    const id = await db.rpc<string>(w.u.nuevo, 'request_player_claim', { p_player: w.p.pedro });
    expect(await db.rpc(w.u.sofi, 'player_claim_conflicts', { p_claim: id })).toEqual([]);
    await fails(db.rpc(w.u.luis, 'decide_player_claim', { p_claim: id, p_approve: true }), DENIED);
    await fails(db.rpc(w.u.nuevo, 'player_claim_conflicts', { p_claim: id }), DENIED);

    expect(await db.rpc(w.u.sofi, 'decide_player_claim', { p_claim: id, p_approve: true })).toBe('approved');
    expect(await ownerOf(w.p.pedro)).toBe(w.u.nuevo);
    expect(await exists(mine)).toBe(false);
    expect(await db.admin('select player_id, scores from public.entries where id = $1', [en])).toEqual([{ player_id: w.p.pedro, scores: [201] }]);
    expect(await db.admin('select player_id from public.reactions where entry_id = $1', [en])).toEqual([{ player_id: w.p.pedro }]);
    expect(await db.admin('select player_id from public.event_rsvps where event_id = $1', [w.e.e1])).toEqual([{ player_id: w.p.pedro }]);
    expect(await db.asUser(w.u.nuevo, 'select player_id from public.memberships where league_id = $1 and user_id = $2', [w.priv, w.u.nuevo])).toEqual([
      { player_id: w.p.pedro },
    ]);
    expect(await claim(id)).toMatchObject({ status: 'approved', decided_by: w.u.sofi });
    expect(await outbox()).toEqual([{ user_id: w.u.nuevo, title: 'Te aprobaron: ahora eres Pedro', body: 'En Liga del Banco. Tus juegos quedaron juntos.', url: `/l/${w.priv}` }]);
    // Otro admin a la vez: ya estaba aprobado.
    expect(await db.rpc(w.u.org, 'decide_player_claim', { p_claim: id, p_approve: false })).toBe('approved');
  });

  it('si los dos jugaron el mismo evento: conflicto y no cambia nada hasta que el admin lo arregla', async () => {
    const { player_id: mine } = await joinPriv(w.u.nuevo);
    const a = await entry(db, w.priv, w.e.e1, mine, [180], [null]);
    await entry(db, w.priv, w.e.e1, w.p.pedro, [120], [null]);
    const id = await db.rpc<string>(w.u.nuevo, 'request_player_claim', { p_player: w.p.pedro });
    expect(await db.rpc(w.u.org, 'player_claim_conflicts', { p_claim: id })).toEqual([{ what: 'entries', label: 'Juegos en el mismo evento', count: 1 }]);
    const err = await fails(db.rpc(w.u.org, 'decide_player_claim', { p_claim: id, p_approve: true }), 'P0001');
    expect(err.message).toBe('conflicto: Juegos en el mismo evento (1)');
    expect(await ownerOf(w.p.pedro)).toBeNull();
    expect(await exists(mine)).toBe(true);
    expect((await claim(id)).status).toBe('pending');
    await db.admin('delete from public.entries where id = $1', [a]);
    expect(await db.rpc(w.u.org, 'decide_player_claim', { p_claim: id, p_approve: true })).toBe('approved');
    expect(await ownerOf(w.p.pedro)).toBe(w.u.nuevo);
  });

  it('rechazar deja todo igual y avisa con la nota', async () => {
    await phone(w.u.ana);
    const id = await db.rpc<string>(w.u.ana, 'request_player_claim', { p_player: w.p.pedro });
    await db.admin('delete from public.push_outbox');
    expect(await db.rpc(w.u.org, 'decide_player_claim', { p_claim: id, p_approve: false, p_note: 'Pedro es otro' })).toBe('rejected');
    expect(await claim(id)).toMatchObject({ status: 'rejected', decided_by: w.u.org, decision_note: 'Pedro es otro' });
    expect(await ownerOf(w.p.pedro)).toBeNull();
    expect(await outbox()).toEqual([{ user_id: w.u.ana, title: 'No se aprobó: no quedaste como Pedro', body: 'Pedro es otro', url: `/l/${w.priv}` }]);
    await fails(db.rpc(w.u.ana, 'cancel_player_claim', { p_claim: id }), 'invalido');
  });

  it('el dueño o un admin que lo pide queda aprobado al momento', async () => {
    await phone(w.u.org);
    const own = await db.rpc<string>(w.u.sofi, 'ensure_my_player', { p_league: w.priv });
    const id = await db.rpc<string>(w.u.sofi, 'request_player_claim', { p_player: w.p.pedro });
    expect(await claim(id)).toMatchObject({ status: 'approved', decided_by: w.u.sofi });
    expect(await ownerOf(w.p.pedro)).toBe(w.u.sofi);
    expect(await exists(own)).toBe(false);
    expect(await outbox()).toEqual([]);
  });
});

describe('unirse ya no vincula al momento', () => {
  it('«soy Pedro» al unirse: su propio jugador y el pedido de Pedro', async () => {
    const r = await joinPriv(w.u.nuevo, w.p.pedro);
    expect(r.player_id).not.toBe(w.p.pedro);
    expect(r.claim_id).toBeTruthy();
    expect(await claim(r.claim_id!)).toMatchObject({ status: 'pending', player_id: w.p.pedro, user_id: w.u.nuevo });
    expect(await ownerOf(w.p.pedro)).toBeNull();
    // Unirse otra vez: el mismo jugador y el mismo pedido.
    expect(await joinPriv(w.u.nuevo, w.p.pedro)).toEqual(r);
    // Ya pedido por otro: el siguiente no lo puede elegir (se une sin pedido).
    const r2 = await joinPriv(w.u.extra, w.p.pedro);
    expect(r2.claim_id).toBeNull();
  });

  it('mismo nombre: también queda pedido (no se lo lleva sin el admin)', async () => {
    const jose = await player(db, w.pub, 'José  Peña');
    const u = await db.createUser('jose@x.com', 'jose pena');
    const r = await db.rpc<Json>(u, 'join_league', { p_league: w.pub });
    expect(r.player_id).not.toBe(jose);
    expect(await ownerOf(jose)).toBeNull();
    expect(await db.rpc(w.u.otro, 'decide_player_claim', { p_claim: r.claim_id, p_approve: true })).toBe('approved');
    expect(await ownerOf(jose)).toBe(u);
    expect(await exists(r.player_id as string)).toBe(false);
  });

  it('el dueño que se une a su liga eligiendo un jugador lo toma al momento', async () => {
    await db.admin('delete from public.players where league_id = $1 and user_id = $2', [w.pub, w.u.otro]);
    const r = await db.rpc<Json>(w.u.otro, 'join_league', { p_league: w.pub, p_prefer: w.p.p1 });
    expect(r).toEqual({ league_id: w.pub, player_id: w.p.p1, claim_id: null });
    expect(await ownerOf(w.p.p1)).toBe(w.u.otro);
  });
});

describe('revisión: nadie se salta al admin ni se pierde nada al juntar', () => {
  it('ni de otra liga, ni el de otra cuenta, ni un admin de otra liga, ni por join_league / claim_player', async () => {
    // Un jugador de otra liga por join_league: no queda pedido (se une con el suyo).
    const r = await joinPriv(w.u.nuevo, w.p.p1);
    expect(r.claim_id).toBeNull();
    expect(await ownerOf(w.p.p1)).toBeNull();
    // El de otra cuenta: ni pidiéndolo ni eligiéndolo al unirse.
    await fails(db.rpc(w.u.nuevo, 'claim_player', { p_player: w.p.luis }), 'duplicado');
    expect((await joinPriv(w.u.extra, w.p.luis)).claim_id).toBeNull();
    expect(await ownerOf(w.p.luis)).toBe(w.u.luis);
    // Un menor tampoco al unirse.
    const kids = await league(db, w.u.org, { name: 'Infantil', visibility: 'private', hasMinors: true, requirePhoto: false });
    await member(db, kids, w.u.org, 'owner', 'org');
    await member(db, kids, w.u.ana, 'member', 'ana');
    const [{ id: kid }] = await db.admin<{ id: string }>(`insert into public.players (league_id, name, is_minor) values ($1, 'ana', true) returning id`, [kids]);
    expect(await db.rpc(w.u.ana, 'ensure_my_player', { p_league: kids, p_prefer: kid })).not.toBe(kid);
    expect(await db.count('public.player_claims', 'player_id = $1', [kid])).toBe(0);
    expect(await ownerOf(kid)).toBeNull();
    // El dueño de otra liga no decide aquí; quien pidió tampoco se aprueba solo.
    const id = await db.rpc<string>(w.u.nuevo, 'request_player_claim', { p_player: w.p.pedro });
    await fails(db.rpc(w.u.otro, 'decide_player_claim', { p_claim: id, p_approve: true }), DENIED);
    await fails(db.rpc(w.u.nuevo, 'decide_player_claim', { p_claim: id, p_approve: true }), DENIED);
    // Ni escribiendo directo en la tabla.
    await db.asUser(w.u.nuevo, 'update public.players set user_id = $1 where id = $2', [w.u.nuevo, w.p.pedro]).catch(() => null);
    expect(await ownerOf(w.p.pedro)).toBeNull();
    // Si el admin lo vincula con otra cuenta por otro camino: el pedido queda rechazado (no cuelga en la lista).
    await db.rpc(w.u.org, 'link_account_to_player', { p_player: w.p.pedro, p_user: w.u.ana });
    expect(await claim(id)).toMatchObject({ status: 'rejected', decision_note: 'Ese jugador ya quedó con otra cuenta.' });
    expect(await db.rpc(w.u.org, 'decide_player_claim', { p_claim: id, p_approve: true })).toBe('rejected');
    // Y si lo vincula con la misma cuenta que lo pidió, queda aprobado.
    const pepe = await player(db, w.priv, 'Pepe');
    const mineToo = await db.rpc<string>(w.u.nuevo, 'request_player_claim', { p_player: pepe });
    await db.rpc(w.u.org, 'link_account_to_player', { p_player: pepe, p_user: w.u.nuevo });
    expect((await claim(mineToo)).status).toBe('approved');
  });

  it('una cuenta que ya reclamó a uno puede juntar un duplicado que el admin anotó dos veces', async () => {
    const first = await db.rpc<string>(w.u.ana, 'request_player_claim', { p_player: w.p.pedro });
    await db.rpc(w.u.org, 'decide_player_claim', { p_claim: first, p_approve: true });
    const e2 = await event(db, w.priv, 'practica', '2026-09-29');
    const en = await entry(db, w.priv, e2, w.p.pedro, [190], [null]);
    const dup = await player(db, w.priv, 'Pedro Pérez');
    const second = await db.rpc<string>(w.u.ana, 'request_player_claim', { p_player: dup });
    expect(await db.rpc(w.u.org, 'decide_player_claim', { p_claim: second, p_approve: true })).toBe('approved');
    expect(await ownerOf(dup)).toBe(w.u.ana);
    expect(await exists(w.p.pedro)).toBe(false);
    expect(await db.admin('select player_id from public.entries where id = $1', [en])).toEqual([{ player_id: dup }]);
  });

  it('fútbol: partidos (con el anotador), plantilla y «voy» pasan al reclamado; dos equipos distintos chocan', async () => {
    const fut = await league(db, w.u.org, { name: 'Fútbol', visibility: 'private', sport: 'football', requirePhoto: false });
    await member(db, fut, w.u.org, 'owner', 'org');
    await member(db, fut, w.u.ana, 'member', 'ana');
    const guest = await player(db, fut, 'Ana G.');
    const mine = await db.rpc<string>(w.u.ana, 'ensure_my_player', { p_league: fut });
    const team = async (name: string) => (await db.admin<{ id: string }>('insert into public.teams (league_id, name) values ($1, $2) returning id', [fut, name]))[0].id;
    const [ta, tb] = [await team('Rojos'), await team('Azules')];
    await db.admin('insert into public.team_players (team_id, player_id, league_id) values ($1, $2, $3)', [ta, mine, fut]);
    await db.admin('insert into public.team_players (team_id, player_id, league_id) values ($1, $2, $3)', [tb, guest, fut]);
    const [{ id: m }] = await db.admin<{ id: string }>(`insert into public.matches (league_id, state) values ($1, $2) returning id`, [
      fut,
      { goals: [{ player_id: mine, min: 3 }] },
    ]);
    await db.admin(`insert into public.match_sides (match_id, side, league_id, team_id, label) values ($1, 1, $2, $3, 'Rojos'), ($1, 2, $2, null, 'Otros')`, [m, fut, ta]);
    await db.admin('insert into public.match_players (match_id, player_id, league_id, side) values ($1, $2, $3, 1)', [m, mine, fut]);
    await db.admin(`insert into public.match_rsvps (match_id, player_id, league_id, side, status) values ($1, $2, $3, 1, 'yes')`, [m, mine, fut]);
    const id = await db.rpc<string>(w.u.ana, 'request_player_claim', { p_player: guest });
    expect(await db.rpc(w.u.org, 'player_claim_conflicts', { p_claim: id })).toEqual([
      { what: 'team_players', label: 'Equipos distintos de la temporada', count: 1 },
    ]);
    expect((await fails(db.rpc(w.u.org, 'decide_player_claim', { p_claim: id, p_approve: true }), 'P0001')).message).toBe('conflicto: Equipos distintos de la temporada (1)');
    await db.admin('delete from public.team_players where team_id = $1', [tb]);
    expect(await db.rpc(w.u.org, 'decide_player_claim', { p_claim: id, p_approve: true })).toBe('approved');
    expect(await exists(mine)).toBe(false);
    expect(await db.admin('select player_id from public.match_players where match_id = $1', [m])).toEqual([{ player_id: guest }]);
    expect(await db.admin('select player_id from public.team_players where team_id = $1', [ta])).toEqual([{ player_id: guest }]);
    expect(await db.admin('select player_id, status from public.match_rsvps where match_id = $1', [m])).toEqual([{ player_id: guest, status: 'yes' }]);
    expect((await db.admin<{ state: unknown }>('select state from public.matches where id = $1', [m]))[0].state).toEqual({ goals: [{ player_id: guest, min: 3 }] });
  });
});
