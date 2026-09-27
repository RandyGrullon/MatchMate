/**
 * Escalera (20260927000700_raqueta.sql): puestos, retos hasta K puestos arriba, aceptar, cancelar, el partido del
 * reto, la escalera que se mueve sola al contar el resultado (confirmado, W.O. o 48 h), plazos vencidos (W.O. a
 * favor del retador), salir, dobles con parejas, quién ve qué y los push. El tiempo real va en
 * raqueta-tiempo-real.test.ts. Cada prueba en su transacción.
 *
 * Mundo: liga pública «Tenis Club» (dueño org, admin sofi); jugadores con cuenta luis, ana, otra, nuevo, extra;
 * pedro sin cuenta. otro no es de la liga. Escalera: pedro, ana, otra, nuevo, luis (1.º a 5.º); extra afuera.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
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

interface Club {
  lid: string;
  ev: string;
  p: { pedro: string; ana: string; otra: string; nuevo: string; luis: string; extra: string };
}

async function club(opts: { visibility?: 'public' | 'private'; config?: Record<string, unknown>; sport?: string } = {}): Promise<Club> {
  const sport = opts.sport ?? 'tennis';
  const lid = await league(db, w.u.org, { name: 'Tenis Club', visibility: opts.visibility ?? 'public', sport, requirePhoto: false });
  await db.admin(`update public.leagues set rules = $2 where id = $1`, [lid, { match: { sport } }]);
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  for (const [uid, n] of [
    [w.u.luis, 'luis'],
    [w.u.ana, 'ana'],
    [w.u.otra, 'otra'],
    [w.u.nuevo, 'nuevo'],
    [w.u.extra, 'extra'],
  ] as const)
    await member(db, lid, uid, 'member', n);
  const p = {
    pedro: await player(db, lid, 'Pedro'),
    ana: await player(db, lid, 'Ana', w.u.ana),
    otra: await player(db, lid, 'Otra', w.u.otra),
    nuevo: await player(db, lid, 'Nuevo', w.u.nuevo),
    luis: await player(db, lid, 'Luis', w.u.luis),
    extra: await player(db, lid, 'Extra', w.u.extra),
  };
  const ev = await db.rpc<string>(w.u.sofi, 'create_event', {
    p_league: lid,
    p_type: 'escalera',
    p_date: '2026-10-01',
    p_name: 'Escalera',
    p_config: { format: 'escalera', maxUp: 3, acceptDays: 3, playDays: 7, ...opts.config },
  });
  if (opts.config?.doubles !== true) await db.rpc(w.u.sofi, 'set_ladder', { p_event: ev, p_entrants: [p.pedro, p.ana, p.otra, p.nuevo, p.luis] });
  return { lid, ev, p };
}

const order = async (ev: string) =>
  (await db.admin<{ entrant_id: string }>('select entrant_id from public.ladder_rungs where event_id = $1 order by position', [ev])).map((r) => r.entrant_id);
const challenge = async (id: string) => (await db.admin<Record<string, unknown>>('select * from public.ladder_challenges where id = $1', [id]))[0];
const matchRow = async (id: string) => (await db.admin<Record<string, unknown>>('select * from public.matches where id = $1', [id]))[0];
const SCORE = { text: '6-4 6-4', sides: [2, 0], totals: { sets: [2, 0], games: [12, 8] } };

describe('puestos', () => {
  it('set_ladder: el orden, player_count y solo el admin', async () => {
    const c = await club();
    expect(await order(c.ev)).toEqual([c.p.pedro, c.p.ana, c.p.otra, c.p.nuevo, c.p.luis]);
    expect((await db.admin<{ player_count: number }>('select player_count from public.events where id = $1', [c.ev]))[0].player_count).toBe(5);
    await fails(db.rpc(w.u.luis, 'set_ladder', { p_event: c.ev, p_entrants: [c.p.luis] }), DENIED);
    // Reordenar y sacar a uno en una sola llamada.
    expect(await db.rpc(w.u.sofi, 'set_ladder', { p_event: c.ev, p_entrants: [c.p.luis, c.p.pedro, c.p.ana, c.p.otra] })).toBe(4);
    expect(await order(c.ev)).toEqual([c.p.luis, c.p.pedro, c.p.ana, c.p.otra]);
    const pos = await db.admin<{ position: number }>('select position from public.ladder_rungs where event_id = $1 order by position', [c.ev]);
    expect(pos.map((r) => r.position)).toEqual([1, 2, 3, 4]);
  });

  it('datos que no sirven: repetidos, de otra liga, una pareja en individual', async () => {
    const c = await club();
    await fails(db.rpc(w.u.sofi, 'set_ladder', { p_event: c.ev, p_entrants: [c.p.luis, c.p.luis] }), INVALID);
    await fails(db.rpc(w.u.sofi, 'set_ladder', { p_event: c.ev, p_entrants: [w.p.pedro] }), INVALID);
    await fails(db.rpc(w.u.sofi, 'set_ladder', { p_event: c.ev, p_entrants: ['x'] }), INVALID);
    const team = await db.rpc<string>(w.u.sofi, 'create_season_team', { p_league: c.lid, p_name: 'A', p_players: [{ player_id: c.p.luis }] });
    await fails(db.rpc(w.u.sofi, 'set_ladder', { p_event: c.ev, p_entrants: [team] }), INVALID);
    const liga = await db.rpc<string>(w.u.sofi, 'create_event', { p_league: c.lid, p_type: 'liga', p_date: '2026-10-01' });
    await fails(db.rpc(w.u.sofi, 'set_ladder', { p_event: liga, p_entrants: [] }), INVALID);
  });

  it('join_ladder: abierta, uno entra solo al final (una vez); cerrada, solo el admin', async () => {
    const c = await club({ config: { open: true } });
    expect(await db.rpc(w.u.extra, 'join_ladder', { p_event: c.ev })).toBe(6);
    expect(await db.rpc(w.u.extra, 'join_ladder', { p_event: c.ev })).toBe(6);
    await fails(db.rpc(w.u.extra, 'join_ladder', { p_event: c.ev, p_entrant: c.p.pedro }), DENIED);
    await fails(db.rpc(w.u.otro, 'join_ladder', { p_event: c.ev }), INVALID);
    const closed = await club({ config: { open: false } });
    await db.rpc(w.u.sofi, 'set_ladder', { p_event: closed.ev, p_entrants: [closed.p.pedro] });
    await fails(db.rpc(w.u.extra, 'join_ladder', { p_event: closed.ev }), DENIED);
    expect(await db.rpc(w.u.sofi, 'join_ladder', { p_event: closed.ev, p_entrant: closed.p.extra })).toBe(2);
  });

  it('leave_ladder: el propio o el admin; los de abajo suben y sus retos se cancelan', async () => {
    const c = await club();
    const id = await db.rpc<string>(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.otra });
    await fails(db.rpc(w.u.ana, 'leave_ladder', { p_event: c.ev, p_entrant: c.p.luis }), DENIED);
    expect(await db.rpc(w.u.luis, 'leave_ladder', { p_event: c.ev, p_entrant: c.p.luis })).toBe(true);
    expect(await db.rpc(w.u.luis, 'leave_ladder', { p_event: c.ev, p_entrant: c.p.luis })).toBe(false);
    expect((await challenge(id)).status).toBe('cancelled');
    expect((await matchRow((await challenge(id)).match_id as string)).status).toBe('void');
    expect(await db.rpc(w.u.sofi, 'leave_ladder', { p_event: c.ev, p_entrant: c.p.ana })).toBe(true);
    expect(await order(c.ev)).toEqual([c.p.pedro, c.p.otra, c.p.nuevo]);
  });
});

describe('retos', () => {
  it('hasta 3 puestos arriba; ni abajo, ni a sí mismo, ni más lejos; uno abierto por participante', async () => {
    const c = await club();
    // luis es 5.º: puede retar a ana (2.º), otra (3.º) y nuevo (4.º), no a pedro (1.º).
    await fails(db.rpc(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.pedro }), INVALID);
    await fails(db.rpc(w.u.ana, 'create_challenge', { p_event: c.ev, p_challenged: c.p.luis }), INVALID);
    await fails(db.rpc(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.luis }), INVALID);
    const id = await db.rpc<string>(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.ana, p_id: randomUUID() });
    const ch = await challenge(id);
    expect(ch).toMatchObject({ status: 'pending', challenger: c.p.luis, challenged: c.p.ana, challenger_pos: 5, challenged_pos: 2, created_by: w.u.luis });
    const m = await matchRow(ch.match_id as string);
    expect(m).toMatchObject({ event_id: c.ev, stage: 'Reto', format: 'sets', status: 'scheduled', require_confirm: true });
    const sides = await db.admin<{ side: number; label: string }>('select side, label from public.match_sides where match_id = $1 order by side', [m.id]);
    expect(sides).toEqual([
      { side: 1, label: 'Luis' },
      { side: 2, label: 'Ana' },
    ]);
    // Ninguno de los dos puede tener otro reto abierto.
    await fails(db.rpc(w.u.nuevo, 'create_challenge', { p_event: c.ev, p_challenged: c.p.ana }), 'duplicado');
    await fails(db.rpc(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.otra }), 'duplicado');
    // Otro par sí.
    await db.rpc(w.u.nuevo, 'create_challenge', { p_event: c.ev, p_challenged: c.p.otra });
  });

  it('quién reta: el propio participante o el admin por otro; de fuera, no', async () => {
    const c = await club();
    await fails(db.rpc(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.ana, p_challenger: c.p.nuevo }), DENIED);
    await fails(db.rpc(w.u.otro, 'create_challenge', { p_event: c.ev, p_challenged: c.p.ana, p_challenger: c.p.luis }), DENIED);
    await fails(db.rpc(w.u.extra, 'create_challenge', { p_event: c.ev, p_challenged: c.p.ana }), INVALID);
    await fails(db.rpc(ANON, 'create_challenge', { p_event: c.ev, p_challenged: c.p.ana }), DENIED);
    const id = await db.rpc<string>(w.u.sofi, 'create_challenge', { p_event: c.ev, p_challenged: c.p.ana, p_challenger: c.p.nuevo });
    expect((await challenge(id)).challenger).toBe(c.p.nuevo);
  });

  it('maxUp de la configuración', async () => {
    const c = await club({ config: { maxUp: 1 } });
    await fails(db.rpc(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.otra }), INVALID);
    await db.rpc(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.nuevo });
  });

  it('aceptar: el retado (con hora y cancha) o el admin; el retador no', async () => {
    const c = await club();
    const id = await db.rpc<string>(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.ana });
    await fails(db.rpc(w.u.luis, 'accept_challenge', { p_challenge: id }), DENIED);
    expect(await db.rpc(w.u.ana, 'accept_challenge', { p_challenge: id, p_scheduled_at: '2026-10-03T23:00:00Z', p_court: 'Cancha 2' })).toBe('accepted');
    const ch = await challenge(id);
    expect(ch).toMatchObject({ status: 'accepted', accepted_by: w.u.ana });
    const m = await matchRow(ch.match_id as string);
    expect(m.court).toBe('Cancha 2');
    expect(new Date(m.scheduled_at as string).toISOString()).toBe('2026-10-03T23:00:00.000Z');
    // Aceptar otra vez: nada.
    expect(await db.rpc(w.u.ana, 'accept_challenge', { p_challenge: id })).toBe('accepted');
    await fails(db.rpc(w.u.ana, 'accept_challenge', { p_challenge: randomUUID() }), 'no_existe');
  });

  it('cancelar: el retador mientras está pendiente; después solo el admin', async () => {
    const c = await club();
    const a = await db.rpc<string>(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.ana });
    await fails(db.rpc(w.u.ana, 'cancel_challenge', { p_challenge: a }), DENIED);
    expect(await db.rpc(w.u.luis, 'cancel_challenge', { p_challenge: a, p_note: 'Me lesioné' })).toBe(true);
    expect(await challenge(a)).toMatchObject({ status: 'cancelled', note: 'Me lesioné' });
    expect(await db.rpc(w.u.luis, 'cancel_challenge', { p_challenge: a })).toBe(false);
    const b = await db.rpc<string>(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.ana });
    await db.rpc(w.u.ana, 'accept_challenge', { p_challenge: b });
    await fails(db.rpc(w.u.luis, 'cancel_challenge', { p_challenge: b }), DENIED);
    expect(await db.rpc(w.u.sofi, 'cancel_challenge', { p_challenge: b })).toBe(true);
    expect((await challenge(b)).status).toBe('cancelled');
    expect(await order(c.ev)).toEqual([c.p.pedro, c.p.ana, c.p.otra, c.p.nuevo, c.p.luis]);
  });
});

describe('la escalera se mueve con el resultado', () => {
  it('gana el retador (anota él y el retado confirma): toma el puesto y los del medio bajan uno', async () => {
    const c = await club();
    const id = await db.rpc<string>(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.ana });
    await db.rpc(w.u.ana, 'accept_challenge', { p_challenge: id });
    const mid = (await challenge(id)).match_id as string;
    await db.rpc(w.u.luis, 'finish_match', { p_match: mid, p_score: SCORE, p_winner: 1 });
    // Propuesto: todavía no se mueve.
    expect(await order(c.ev)).toEqual([c.p.pedro, c.p.ana, c.p.otra, c.p.nuevo, c.p.luis]);
    await db.rpc(w.u.ana, 'confirm_result', { p_match: mid });
    expect(await challenge(id)).toMatchObject({ status: 'played', winner: c.p.luis });
    expect(await order(c.ev)).toEqual([c.p.pedro, c.p.luis, c.p.ana, c.p.otra, c.p.nuevo]);
  });

  it('gana el retado: nada cambia', async () => {
    const c = await club();
    const id = await db.rpc<string>(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.otra });
    await db.rpc(w.u.sofi, 'finish_match', { p_match: (await challenge(id)).match_id, p_score: { text: '4-6 4-6', sides: [0, 2] }, p_winner: 2 });
    expect(await challenge(id)).toMatchObject({ status: 'played', winner: c.p.otra });
    expect(await order(c.ev)).toEqual([c.p.pedro, c.p.ana, c.p.otra, c.p.nuevo, c.p.luis]);
  });

  it('W.O. del admin (no vino el retado) y partido anulado', async () => {
    const c = await club();
    const a = await db.rpc<string>(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.nuevo });
    await db.rpc(w.u.sofi, 'set_walkover', { p_match: (await challenge(a)).match_id, p_absent: 2 });
    expect(await challenge(a)).toMatchObject({ status: 'walkover', winner: c.p.luis });
    expect(await order(c.ev)).toEqual([c.p.pedro, c.p.ana, c.p.otra, c.p.luis, c.p.nuevo]);
    const b = await db.rpc<string>(w.u.otra, 'create_challenge', { p_event: c.ev, p_challenged: c.p.pedro });
    await db.rpc(w.u.sofi, 'void_match', { p_match: (await challenge(b)).match_id });
    expect((await challenge(b)).status).toBe('cancelled');
  });

  it('a las 48 h el resultado propuesto cuenta: sync_ladder mueve la escalera', async () => {
    const c = await club();
    const id = await db.rpc<string>(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.nuevo });
    const mid = (await challenge(id)).match_id as string;
    await db.rpc(w.u.luis, 'finish_match', { p_match: mid, p_score: SCORE, p_winner: 1 });
    expect(await db.rpc(w.u.otra, 'sync_ladder', { p_event: c.ev })).toBe(0);
    await db.admin(`update public.matches set proposed_at = now() - interval '49 hours' where id = $1`, [mid]);
    expect(await db.rpc(w.u.otra, 'sync_ladder', { p_event: c.ev })).toBe(1);
    expect(await challenge(id)).toMatchObject({ status: 'played', winner: c.p.luis });
    expect(await order(c.ev)).toEqual([c.p.pedro, c.p.ana, c.p.otra, c.p.luis, c.p.nuevo]);
  });

  it('plazo para aceptar vencido: W.O. a favor del retador (el partido también)', async () => {
    const c = await club();
    const id = await db.rpc<string>(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.otra });
    await db.admin(`update public.ladder_challenges set accept_by = now() - interval '1 minute' where id = $1`, [id]);
    // Aceptar tarde no se puede: se aplica el plazo primero (y queda guardado: no es un error).
    expect(await db.rpc(w.u.otra, 'accept_challenge', { p_challenge: id })).toBe('walkover');
    expect(await challenge(id)).toMatchObject({ status: 'walkover', winner: c.p.luis });
    const m = await matchRow((await challenge(id)).match_id as string);
    expect(m).toMatchObject({ status: 'walkover', walkover_side: 2, winner_side: 1, note: 'No aceptó el reto a tiempo' });
    expect(await order(c.ev)).toEqual([c.p.pedro, c.p.ana, c.p.luis, c.p.otra, c.p.nuevo]);
  });

  it('plazo para jugar vencido: W.O.; con un resultado esperando confirmación no vence', async () => {
    const c = await club();
    const a = await db.rpc<string>(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.nuevo });
    await db.rpc(w.u.nuevo, 'accept_challenge', { p_challenge: a });
    const b = await db.rpc<string>(w.u.otra, 'create_challenge', { p_event: c.ev, p_challenged: c.p.pedro });
    await db.rpc(w.u.sofi, 'accept_challenge', { p_challenge: b });
    await db.rpc(w.u.otra, 'finish_match', { p_match: (await challenge(b)).match_id, p_score: SCORE, p_winner: 1 });
    await db.admin(`update public.ladder_challenges set play_by = now() - interval '1 minute' where id = any ($1)`, [[a, b]]);
    // El cron de Supabase hace lo mismo con todas las escaleras.
    expect(await db.admin<{ n: number }>('select private.ladder_expire_all() as n')).toEqual([{ n: 1 }]);
    expect((await challenge(a)).status).toBe('walkover');
    expect((await challenge(b)).status).toBe('accepted');
    expect(await order(c.ev)).toEqual([c.p.pedro, c.p.ana, c.p.otra, c.p.luis, c.p.nuevo]);
  });

  it('sync_ladder: con sesión y viendo la liga', async () => {
    const c = await club({ visibility: 'private' });
    await fails(db.rpc(w.u.otro, 'sync_ladder', { p_event: c.ev }), 'no_existe');
    await fails(db.rpc(ANON, 'sync_ladder', { p_event: c.ev }), DENIED);
    expect(await db.rpc(w.u.luis, 'sync_ladder', { p_event: c.ev })).toBe(0);
  });
});

describe('dobles, lectura y tiempo real', () => {
  it('dobles: parejas de temporada; retan y aceptan sus jugadores', async () => {
    const c = await club({ sport: 'pickleball', config: { doubles: true, open: true } });
    const team = (name: string, a: string, b: string) => db.rpc<string>(w.u.sofi, 'create_season_team', { p_league: c.lid, p_name: name, p_players: [{ player_id: a }, { player_id: b }] });
    const t1 = await team('Pedro / Ana', c.p.pedro, c.p.ana);
    const t2 = await team('Otra / Nuevo', c.p.otra, c.p.nuevo);
    const t3 = await team('Luis / Extra', c.p.luis, c.p.extra);
    await fails(db.rpc(w.u.sofi, 'set_ladder', { p_event: c.ev, p_entrants: [c.p.luis] }), INVALID);
    await db.rpc(w.u.sofi, 'set_ladder', { p_event: c.ev, p_entrants: [t1, t2] });
    expect(await db.rpc(w.u.extra, 'join_ladder', { p_event: c.ev })).toBe(3);
    const id = await db.rpc<string>(w.u.extra, 'create_challenge', { p_event: c.ev, p_challenged: t1 });
    await db.rpc(w.u.ana, 'accept_challenge', { p_challenge: id });
    const mid = (await challenge(id)).match_id as string;
    const sides = await db.admin<{ side: number; team_id: string }>('select side, team_id from public.match_sides where match_id = $1 order by side', [mid]);
    expect(sides.map((s) => s.team_id)).toEqual([t3, t1]);
    await db.rpc(w.u.luis, 'finish_match', { p_match: mid, p_score: { text: '11-7', sides: [1, 0] }, p_winner: 1 });
    await db.rpc(w.u.ana, 'confirm_result', { p_match: mid });
    expect(await order(c.ev)).toEqual([t3, t1, t2]);
  });

  it('lectura: pública para todos; privada solo miembros', async () => {
    const pub = await club();
    expect(await db.asAnon('select entrant_id from public.ladder_rungs where event_id = $1', [pub.ev])).toHaveLength(5);
    const priv = await club({ visibility: 'private' });
    await db.rpc<string>(w.u.luis, 'create_challenge', { p_event: priv.ev, p_challenged: priv.p.ana });
    expect(await db.asUser(w.u.otro, 'select id from public.ladder_challenges where event_id = $1', [priv.ev])).toHaveLength(0);
    expect(await db.asUser(w.u.otra, 'select id from public.ladder_challenges where event_id = $1', [priv.ev])).toHaveLength(1);
    // Nadie escribe directo.
    await fails(db.asUser(w.u.sofi, `update public.ladder_rungs set position = 1 where event_id = $1`, [priv.ev]), '42501');
  });

  it('avisos: push al retado y al retador cuando aceptan', async () => {
    const c = await club();
    for (const [uid, n] of [
      [w.u.ana, 1],
      [w.u.luis, 2],
    ] as const)
      await db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [uid, `https://fcm.googleapis.com/fcm/send/reto-${n}`]);
    const id = await db.rpc<string>(w.u.luis, 'create_challenge', { p_event: c.ev, p_challenged: c.p.ana });
    const pushes = await db.admin<{ user_id: string; title: string; url: string }>(`select user_id, title, url from public.push_outbox where tag = $1 order by id`, [`reto:${id}`]);
    expect(pushes).toEqual([{ user_id: w.u.ana, title: 'Te retaron en la escalera', url: `/l/${c.lid}/e/${c.ev}` }]);
    await db.rpc(w.u.ana, 'accept_challenge', { p_challenge: id });
    const after = await db.admin<{ user_id: string }>(`select user_id from public.push_outbox where tag = $1 and title = 'Aceptaron tu reto'`, [`reto:${id}`]);
    expect(after).toEqual([{ user_id: w.u.luis }]);
  });
});
