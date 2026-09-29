/**
 * Pistas del boliche (20260929000600_organizador.sql): el admin (o el anotador de un torneo sin liga) arma las pistas
 * de un evento con quien dijo «voy» o está inscrito, mueve a alguien, las borra y avisa a cada jugador su pista.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { event, league, makeWorld, member, player, withCopa, type World } from './fixture';

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

interface Lanes {
  eventId: string;
  count: number;
  unpublished: number;
  publishedAt: string | null;
  lanes: { lane: number; players: { playerId: string; name: string; position: number; userId: string | null }[] }[];
  text: string;
}

/** Nombres por pista: {5: ['Ana', 'Beto'], …}. */
const byLane = (r: Lanes) => Object.fromEntries(r.lanes.map((l) => [l.lane, l.players.map((p) => p.name)]));
const assign = (uid: string, ev: string, lanes: number[], perLane: number, mode: string, order: string[] | null = null) =>
  db.rpc<Lanes>(uid, 'assign_lanes', { p_event: ev, p_lanes: lanes, p_per_lane: perLane, p_mode: mode, p_order: order });
const phone = (uid: string) =>
  db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'BPclave', 'secreto')`, [
    uid,
    `https://fcm.googleapis.com/fcm/send/${uid}`,
  ]);

/**
 * Torneo «Copa» de la liga privada con 6 inscritos (promedios 200 a 150) en dos equipos, y Pedro que solo dijo «voy».
 * Ana tiene su jugador con cuenta.
 */
async function copa() {
  const ev = await event(db, w.priv, 'torneo', '2026-10-06', 3, 'Copa');
  const ana = await player(db, w.priv, 'Ana', w.u.ana);
  const p = {
    luis: w.p.luis,
    ana,
    beto: await player(db, w.priv, 'Beto'),
    caro: await player(db, w.priv, 'Caro'),
    dani: await player(db, w.priv, 'Dani'),
    eva: await player(db, w.priv, 'Eva'),
    pedro: w.p.pedro,
  };
  const avg: [string, number][] = [
    [p.luis, 150],
    [p.ana, 200],
    [p.beto, 190],
    [p.caro, 180],
    [p.dani, 170],
    [p.eva, 160],
  ];
  for (const [pid, a] of avg) {
    await db.admin('insert into public.entries (league_id, event_id, player_id, average) values ($1, $2, $3, $4)', [w.priv, ev, pid, a]);
  }
  await db.admin('insert into public.event_rsvps (event_id, player_id, league_id) values ($1, $2, $3)', [ev, p.pedro, w.priv]);
  return { ev, p };
}

describe('armar las pistas', () => {
  it('por promedio (el orden del teléfono): pistas parejas, las que hacen falta, en el orden pedido', async () => {
    const { ev, p } = await copa();
    // 7 jugadores de a 3 en las pistas 5 a 9: se usan 3 pistas (3, 2 y 2).
    const order = [p.ana, p.beto, p.caro, p.dani, p.eva, p.luis, p.pedro];
    const r = await assign(w.u.org, ev, [5, 6, 7, 8, 9], 3, 'promedio', order);
    expect(byLane(r)).toEqual({ 5: ['Ana', 'Beto', 'Caro'], 6: ['Dani', 'Eva'], 7: ['Luis', 'Pedro'] });
    expect(r).toMatchObject({ eventId: ev, count: 7, unpublished: 7, publishedAt: null });
    expect(r.text).toBe('Pista 5: Ana, Beto, Caro\nPista 6: Dani, Eva\nPista 7: Luis, Pedro');
    expect(r.lanes[0].players.map((x) => [x.position, x.userId])).toEqual([
      [1, w.u.ana],
      [2, null],
      [3, null],
    ]);
    // Lo mismo en la tabla (la lee quien ve la liga).
    expect(await db.asUser(w.u.luis, 'select lane, position from public.event_lanes where event_id = $1 and player_id = $2', [ev, p.luis])).toEqual([
      { lane: 7, position: 1 },
    ]);
  });

  it('sin el orden del teléfono: el promedio fijo o el de su inscripción, de mayor a menor; los números de pista en el orden dado', async () => {
    const { ev, p } = await copa();
    await db.admin('update public.players set average_override = 210 where id = $1', [p.eva]);
    const r = await assign(w.u.sofi, ev, [9, 3, 9], 4, 'promedio');
    expect(byLane(r)).toEqual({ 9: ['Eva', 'Ana', 'Beto', 'Caro'], 3: ['Dani', 'Luis', 'Pedro'] });
    expect(r.lanes.map((l) => l.lane)).toEqual([3, 9]);
  });

  it('por equipo: los del mismo equipo juntos; al azar: todos, sin repetir; volver a armar reemplaza', async () => {
    const { ev, p } = await copa();
    const teams = await db.rpc<string[]>(w.u.org, 'apply_teams', {
      p_event: ev,
      p_groups: [
        { name: 'Rojos', entry_ids: [] },
        { name: 'Azules', entry_ids: [] },
      ],
    });
    const team = async (pids: string[], t: string) => {
      await db.admin('update public.entries set team_id = $1 where event_id = $2 and player_id = any ($3)', [t, ev, pids]);
    };
    await team([p.luis, p.caro, p.eva], teams[1]);
    await team([p.ana, p.beto, p.dani], teams[0]);
    let r = await assign(w.u.org, ev, [1, 2, 3], 3, 'equipo', [p.ana, p.beto, p.caro, p.dani, p.eva, p.luis]);
    expect(byLane(r)).toEqual({ 1: ['Ana', 'Beto', 'Dani'], 2: ['Caro', 'Eva', 'Luis'], 3: ['Pedro'] });
    r = await assign(w.u.org, ev, [1, 2, 3, 4], 2, 'azar');
    expect(r.count).toBe(7);
    expect(r.lanes.map((l) => l.players.length)).toEqual([2, 2, 2, 1]);
    expect(new Set(r.lanes.flatMap((l) => l.players.map((x) => x.playerId))).size).toBe(7);
    for (const l of r.lanes) expect(l.players.map((x) => x.position)).toEqual(l.players.map((_, i) => i + 1));
    expect(await db.count('public.event_lanes', 'event_id = $1', [ev])).toBe(7);
    // Sin equipos, «equipo» es al azar (todos igual).
    const other = await event(db, w.priv, 'practica', '2026-10-07');
    await db.admin('insert into public.event_rsvps (event_id, player_id, league_id) values ($1, $2, $3), ($1, $4, $3)', [other, p.luis, w.priv, p.pedro]);
    expect((await assign(w.u.org, other, [1], 2, 'equipo')).count).toBe(2);
  });

  it('valida pistas, jugadores por pista, modo y cupo; sin nadie, no hay pistas', async () => {
    const { ev } = await copa();
    await fails(assign(w.u.org, ev, [], 3, 'azar'), INVALID);
    await fails(assign(w.u.org, ev, [0, 1], 3, 'azar'), INVALID);
    await fails(assign(w.u.org, ev, [1000], 30, 'azar'), INVALID);
    await fails(assign(w.u.org, ev, [1, 2], 0, 'azar'), INVALID);
    await fails(assign(w.u.org, ev, [1, 2], 21, 'azar'), INVALID);
    await fails(assign(w.u.org, ev, [1, 2], 3, 'parejas'), INVALID);
    // 7 jugadores no caben en 2 pistas de 3.
    await fails(assign(w.u.org, ev, [1, 2], 3, 'azar'), INVALID);
    const empty = await event(db, w.priv, 'practica', '2026-10-08');
    expect(await assign(w.u.org, empty, [1, 2], 3, 'azar')).toMatchObject({ count: 0, lanes: [], text: '' });
  });

  it('quién: el admin, o el anotador en un torneo sin liga; solo boliche', async () => {
    const { ev } = await copa();
    await fails(assign(w.u.luis, ev, [1, 2, 3], 3, 'azar'), DENIED);
    await fails(assign(w.u.otro, ev, [1, 2, 3], 3, 'azar'), DENIED);
    await fails(db.rpc(ANON, 'assign_lanes', { p_event: ev, p_lanes: [1], p_per_lane: 8, p_mode: 'azar' }), '42501');
    const c = await withCopa(db, w);
    // Luis es anotador de la copa (torneo sin liga): sí.
    expect((await assign(w.u.luis, c.t1, [1], 4, 'azar')).count).toBe(1);
    // La marca de anotador en una liga normal no vale.
    await fails(assign(w.u.ana, ev, [1, 2, 3], 3, 'azar'), DENIED);
    // El superadmin sí.
    await assign(w.u.dios, ev, [1, 2, 3], 3, 'azar');
    const padel = await league(db, w.u.org, { name: 'Pádel', visibility: 'private', sport: 'padel' });
    await member(db, padel, w.u.org, 'owner', 'org');
    const night = (await db.admin<{ id: string }>(`insert into public.events (league_id, type, date) values ($1, 'americano', '2026-10-06') returning id`, [padel]))[0].id;
    await fails(assign(w.u.org, night, [1], 4, 'azar'), INVALID);
    await fails(db.admin('insert into public.event_lanes (event_id, player_id, league_id, lane) values ($1, $2, $3, 1)', [night, w.p.p1, padel]), [
      'invalido',
      '23503',
    ]);
  });
});

describe('arreglar, borrar y avisar', () => {
  it('mover a un jugador lo pone al final de la otra pista; su pista vieja queda sin huecos; null lo quita', async () => {
    const { ev, p } = await copa();
    await assign(w.u.org, ev, [5, 6, 7], 3, 'promedio', [p.ana, p.beto, p.caro, p.dani, p.eva, p.luis, p.pedro]);
    let r = await db.rpc<Lanes>(w.u.org, 'set_player_lane', { p_event: ev, p_player: p.ana, p_lane: 7 });
    expect(byLane(r)).toEqual({ 5: ['Beto', 'Caro'], 6: ['Dani', 'Eva'], 7: ['Luis', 'Pedro', 'Ana'] });
    expect(r.lanes[0].players.map((x) => x.position)).toEqual([1, 2]);
    // Alguien que no estaba (un jugador de la liga) y una pista nueva.
    const nuevo = await player(db, w.priv, 'Zoe');
    r = await db.rpc<Lanes>(w.u.org, 'set_player_lane', { p_event: ev, p_player: nuevo, p_lane: 12 });
    expect(byLane(r)[12]).toEqual(['Zoe']);
    r = await db.rpc<Lanes>(w.u.org, 'set_player_lane', { p_event: ev, p_player: p.beto, p_lane: null });
    expect(byLane(r)[5]).toEqual(['Caro']);
    expect(r.lanes[0].players[0].position).toBe(1);
    // A la misma pista: nada cambia.
    await db.rpc(w.u.org, 'set_player_lane', { p_event: ev, p_player: p.caro, p_lane: 5 });
    expect(await db.admin('select position from public.event_lanes where event_id = $1 and player_id = $2', [ev, p.caro])).toEqual([{ position: 1 }]);
    await fails(db.rpc(w.u.org, 'set_player_lane', { p_event: ev, p_player: w.p.p1, p_lane: 1 }), 'no_existe');
    await fails(db.rpc(w.u.org, 'set_player_lane', { p_event: ev, p_player: p.caro, p_lane: 0 }), INVALID);
    await fails(db.rpc(w.u.luis, 'set_player_lane', { p_event: ev, p_player: p.caro, p_lane: 2 }), DENIED);
  });

  it('borrar las pistas deja sus borrados para la sincronización', async () => {
    const { ev, p } = await copa();
    await assign(w.u.org, ev, [1, 2, 3], 3, 'azar');
    expect(await db.rpc(w.u.org, 'clear_lanes', { p_event: ev })).toBe(7);
    expect(await db.count('public.event_lanes', 'event_id = $1', [ev])).toBe(0);
    expect(await db.count('public.tombstones', `tbl = 'event_lanes' and row_key = $1`, [`${ev}:${p.luis}`])).toBe(1);
    expect(await db.rpc(w.u.org, 'clear_lanes', { p_event: ev })).toBe(0);
    await fails(db.rpc(w.u.luis, 'clear_lanes', { p_event: ev }), DENIED);
  });

  it('publicar avisa a cada jugador con cuenta su pista (un aviso por jugador) y las marca avisadas', async () => {
    const { ev, p } = await copa();
    await phone(w.u.luis);
    await phone(w.u.ana);
    await assign(w.u.org, ev, [5, 6, 7], 3, 'promedio', [p.ana, p.beto, p.caro, p.dani, p.eva, p.luis, p.pedro]);
    expect(await db.rpc(w.u.org, 'publish_lanes', { p_event: ev })).toEqual({ players: 7, pushed: 2 });
    expect(await db.admin('select user_id, title, body, url, tag from public.push_outbox order by title')).toEqual([
      { user_id: w.u.ana, title: 'Tu pista: 5 · Copa', body: 'Pista 5: Ana, Beto, Caro', url: `/l/${w.priv}/e/${ev}`, tag: `pista:${ev}:${p.ana}` },
      { user_id: w.u.luis, title: 'Tu pista: 7 · Copa', body: 'Pista 7: Luis, Pedro', url: `/l/${w.priv}/e/${ev}`, tag: `pista:${ev}:${p.luis}` },
    ]);
    let r = await db.rpc<Lanes>(w.u.org, 'set_player_lane', { p_event: ev, p_player: p.luis, p_lane: 6 });
    expect(r.unpublished).toBe(1);
    expect(r.publishedAt).not.toBeNull();
    // Una práctica sin nombre lleva la fecha; quien salió de la liga ya no recibe.
    const prac = await event(db, w.priv, 'practica', '2026-09-29');
    await db.admin('insert into public.event_rsvps (event_id, player_id, league_id) values ($1, $2, $3), ($1, $4, $3)', [prac, p.luis, w.priv, p.ana]);
    await assign(w.u.org, prac, [1], 2, 'promedio', [p.luis, p.ana]);
    await db.rpc(w.u.ana, 'leave_league', { p_league: w.priv });
    await db.admin('delete from public.push_outbox');
    expect(await db.rpc(w.u.org, 'publish_lanes', { p_event: prac })).toEqual({ players: 2, pushed: 1 });
    expect(await db.admin('select user_id, title from public.push_outbox')).toEqual([
      { user_id: w.u.luis, title: 'Tu pista: 1 · Práctica del martes 29 de septiembre' },
    ]);
    r = await db.rpc<Lanes>(w.u.org, 'assign_lanes', { p_event: prac, p_lanes: [1], p_per_lane: 2, p_mode: 'azar' });
    expect(r.unpublished).toBe(2);
    await fails(db.rpc(w.u.luis, 'publish_lanes', { p_event: prac }), DENIED);
  });

  it('el aviso de la pista es de «Recordatorios» (push_category): con esa categoría apagada no llega; con otra apagada, sí', async () => {
    const { ev, p } = await copa();
    expect(await db.admin(`select private.push_category($1) as c`, [`pista:${ev}:${p.ana}`])).toEqual([{ c: 'recordatorios' }]);
    await phone(w.u.luis);
    await phone(w.u.ana);
    await db.rpc(w.u.ana, 'set_push_prefs', { p_prefs: { recordatorios: false } });
    await db.rpc(w.u.luis, 'set_push_prefs', { p_prefs: { liga: false, social: false } });
    await assign(w.u.org, ev, [5, 6, 7], 3, 'promedio', [p.ana, p.beto, p.caro, p.dani, p.eva, p.luis, p.pedro]);
    // pushed cuenta a quién se le mandó (las dos cuentas); el filtro del teléfono de Ana lo descarta.
    expect(await db.rpc(w.u.org, 'publish_lanes', { p_event: ev })).toEqual({ players: 7, pushed: 2 });
    expect(await db.admin(`select user_id, tag from public.push_outbox where tag like 'pista:%'`)).toEqual([
      { user_id: w.u.luis, tag: `pista:${ev}:${p.luis}` },
    ]);
    // Vuelve a prender «Recordatorios»: el siguiente aviso sí le llega.
    await db.rpc(w.u.ana, 'set_push_prefs', { p_prefs: { recordatorios: true } });
    await db.admin('delete from public.push_outbox');
    await db.rpc(w.u.org, 'publish_lanes', { p_event: ev });
    const again = await db.admin<{ user_id: string }>(`select user_id from public.push_outbox where tag like 'pista:%' order by title`);
    expect(again.map((r) => r.user_id)).toEqual([w.u.ana, w.u.luis]);
  });

  it('publicar: 6 veces por hora y evento; sin pistas no hace nada', async () => {
    const { ev } = await copa();
    expect(await db.rpc(w.u.org, 'publish_lanes', { p_event: ev })).toEqual({ players: 0, pushed: 0 });
    await assign(w.u.org, ev, [1, 2, 3], 3, 'azar');
    for (let i = 0; i < 6; i++) await db.rpc(w.u.org, 'publish_lanes', { p_event: ev });
    await fails(db.rpc(w.u.org, 'publish_lanes', { p_event: ev }), 'rate_limited');
  });
});

describe('lectura, borrados y jugadores que se juntan', () => {
  it('las lee quien ve la liga; nadie escribe directo', async () => {
    const { ev } = await copa();
    await assign(w.u.org, ev, [1, 2, 3], 3, 'azar');
    expect(await db.asUser(w.u.luis, 'select player_id from public.event_lanes where event_id = $1', [ev])).toHaveLength(7);
    expect(await db.asUser(w.u.otro, 'select player_id from public.event_lanes where event_id = $1', [ev])).toHaveLength(0);
    expect(await db.asAnon('select player_id from public.event_lanes where event_id = $1', [ev])).toHaveLength(0);
    await fails(db.asUser(w.u.org, `update public.event_lanes set lane = 1 where event_id = $1`, [ev]), '42501');
    await fails(db.asUser(w.u.org, `delete from public.event_lanes where event_id = $1`, [ev]), '42501');
    // Liga pública: también sin cuenta.
    const pub = await event(db, w.pub, 'practica', '2026-10-06');
    await db.admin('insert into public.event_rsvps (event_id, player_id, league_id) values ($1, $2, $3)', [pub, w.p.p1, w.pub]);
    await assign(w.u.otro, pub, [3], 4, 'azar');
    expect(await db.asAnon('select lane from public.event_lanes where event_id = $1', [pub])).toEqual([{ lane: 3 }]);
  });

  it('borrar el evento o el jugador se lleva sus pistas', async () => {
    const { ev, p } = await copa();
    await assign(w.u.org, ev, [1, 2, 3], 3, 'azar');
    await db.rpc(w.u.org, 'delete_player', { p_player: p.eva });
    expect(await db.count('public.event_lanes', 'event_id = $1', [ev])).toBe(6);
    await db.rpc(w.u.org, 'delete_event', { p_event: ev });
    expect(await db.count('public.event_lanes', 'event_id = $1', [ev])).toBe(0);
  });

  it('juntar dos jugadores (o aprobar un reclamo) pasa la pista al que queda', async () => {
    const { ev, p } = await copa();
    const dup = await player(db, w.priv, 'Pedro P.');
    await db.admin('insert into public.event_rsvps (event_id, player_id, league_id) values ($1, $2, $3)', [ev, dup, w.priv]);
    await assign(w.u.org, ev, [1, 2, 3, 4], 2, 'promedio', [p.ana, p.beto, p.caro, p.dani, p.eva, p.luis, p.pedro, dup]);
    // Los dos tenían pista: queda la del que se queda.
    await db.rpc(w.u.org, 'merge_league_players', { p_league: w.priv, p_keep: p.pedro, p_drop: dup });
    expect(await db.admin('select lane from public.event_lanes where event_id = $1 and player_id = $2', [ev, p.pedro])).toEqual([{ lane: 4 }]);
    expect(await db.count('public.event_lanes', 'event_id = $1', [ev])).toBe(7);
    // Solo el que se va tenía pista: pasa al que queda.
    const other = await player(db, w.priv, 'Beto B.');
    await db.rpc(w.u.org, 'set_player_lane', { p_event: ev, p_player: p.beto, p_lane: null });
    const other2 = await player(db, w.priv, 'Beto C.');
    await db.rpc(w.u.org, 'set_player_lane', { p_event: ev, p_player: other2, p_lane: 9 });
    await db.rpc(w.u.org, 'merge_league_players', { p_league: w.priv, p_keep: other, p_drop: other2 });
    expect(await db.admin('select lane from public.event_lanes where event_id = $1 and player_id = $2', [ev, other])).toEqual([{ lane: 9 }]);
    // Reclamo aprobado: el jugador propio de Ana (con pista) se junta con Beto (sin pista).
    await db.rpc(w.u.ana, 'request_player_claim', { p_player: p.beto });
    const claim = (await db.admin<{ id: string }>(`select id from public.player_claims where user_id = $1 and status = 'pending'`, [w.u.ana]))[0].id;
    await db.admin('delete from public.entries where event_id = $1 and player_id = $2', [ev, p.beto]);
    expect(await db.rpc(w.u.org, 'decide_player_claim', { p_claim: claim, p_approve: true })).toBe('approved');
    expect(await db.admin('select lane, player_id from public.event_lanes where event_id = $1 and player_id = $2', [ev, p.beto])).toEqual([
      { lane: 1, player_id: p.beto },
    ]);
  });
});
