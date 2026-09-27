/**
 * Pádel (20260927000600_padel.sql): tipos y configuración de los eventos, forma del marcador, la ronda de la noche
 * (save_night_round), el resultado a puntos del americano/mexicano (save_points_result) y el aviso de partido
 * (padel_match_reminders). Cada prueba en su transacción (se deshace al final).
 *
 * Mundo: liga privada «Pádel Club» (dueño org, admin sofi); jugadores con cuenta luis, ana, otra, nuevo, mia;
 * extra es anotador de la liga; pedro, rosa y juan sin cuenta. otro no es de la liga.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DENIED, INVALID, TestDb, fails } from './harness';
import { event, league, makeWorld, member, player, type World } from './fixture';

let db: TestDb;
let w: World;
let mia: string;

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
  mia = await db.createUser('mia@x.com', 'mia');
});
afterEach(async () => {
  await db.rollback();
});

interface Club {
  lid: string;
  p: { luis: string; ana: string; otra: string; nuevo: string; mia: string; extra: string; pedro: string; rosa: string; juan: string };
}

async function club(): Promise<Club> {
  const lid = await league(db, w.u.org, { name: 'Pádel Club', visibility: 'private', sport: 'padel', requirePhoto: false });
  await db.admin(`update public.leagues set rules = '{"match": {"sport": "padel", "deuce": "golden"}}', tz = 'America/Santo_Domingo' where id = $1`, [lid]);
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  for (const [uid, name] of [
    [w.u.luis, 'luis'],
    [w.u.ana, 'ana'],
    [w.u.otra, 'otra'],
    [w.u.nuevo, 'nuevo'],
    [mia, 'mia'],
  ] as const)
    await member(db, lid, uid, 'member', name);
  await member(db, lid, w.u.extra, 'member', 'extra', true);
  const p = {
    luis: await player(db, lid, 'Luis', w.u.luis),
    ana: await player(db, lid, 'Ana', w.u.ana),
    otra: await player(db, lid, 'Otra', w.u.otra),
    nuevo: await player(db, lid, 'Nuevo', w.u.nuevo),
    mia: await player(db, lid, 'Mia', mia),
    extra: await player(db, lid, 'Extra', w.u.extra),
    pedro: await player(db, lid, 'Pedro'),
    rosa: await player(db, lid, 'Rosa'),
    juan: await player(db, lid, 'Juan'),
  };
  return { lid, p };
}

async function night(c: Club, type = 'americano', config: Record<string, unknown> = {}): Promise<string> {
  return db.rpc<string>(w.u.sofi, 'create_event', {
    p_league: c.lid,
    p_type: type,
    p_date: '2026-10-08',
    p_name: 'Americano del jueves',
    p_config: { format: type, players: Object.values(c.p).slice(0, 8), courts: ['Cancha 1', 'Cancha 2'], points: { mode: 'total', target: 24 }, ...config },
  });
}

const side = (n: 1 | 2, a: string, b: string) => ({ side: n, players: [{ player_id: a }, { player_id: b }] });

/** Ronda con dos canchas: luis+ana vs otra+nuevo en la 1, mia+extra vs pedro+rosa en la 2; juan descansa. */
function round1(c: Club) {
  return {
    matches: [
      { court: 'Cancha 1', sides: [side(1, c.p.luis, c.p.ana), side(2, c.p.otra, c.p.nuevo)] },
      { court: 'Cancha 2', sides: [side(1, c.p.mia, c.p.extra), side(2, c.p.pedro, c.p.rosa)] },
    ],
    rests: [c.p.juan],
  };
}

async function saveRound(c: Club, ev: string, round = 1, r = round1(c), who = w.u.sofi): Promise<string[]> {
  return db.rpc<string[]>(who, 'save_night_round', { p_event: ev, p_round: round, p_matches: r.matches, p_rests: r.rests });
}

const matchRow = async (id: string) => (await db.admin<Record<string, unknown>>('select * from public.matches where id = $1', [id]))[0];
const eventRow = async (id: string) => (await db.admin<Record<string, unknown>>('select * from public.events where id = $1', [id]))[0];

async function subscribe(...uids: string[]) {
  let n = 0;
  for (const uid of uids) {
    await db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [
      uid,
      `https://fcm.googleapis.com/fcm/send/padel-${uid}-${n++}`,
    ]);
  }
}

describe('eventos de pádel', () => {
  it('tipos: americano, mexicano, liga y torneo; otro tipo no', async () => {
    const c = await club();
    for (const type of ['americano', 'mexicano', 'liga', 'torneo']) {
      await db.rpc(w.u.sofi, 'create_event', { p_league: c.lid, p_type: type, p_date: '2026-10-08' });
    }
    await fails(db.rpc(w.u.sofi, 'create_event', { p_league: c.lid, p_type: 'practica', p_date: '2026-10-08' }), INVALID);
    await fails(db.rpc(w.u.sofi, 'create_event', { p_league: c.lid, p_type: 'ronda', p_date: '2026-10-08' }), INVALID);
    // El torneo sin liga de pádel también sirve.
    const t = await db.rpc<{ event_id: string }>(w.u.dios, 'create_tournament', { p_name: 'Copa', p_date: '2026-11-01', p_sport: 'padel' });
    expect((await eventRow(t.event_id)).type).toBe('torneo');
  });

  it('la configuración: objeto chico, formato igual al tipo; player_count = jugadores o parejas', async () => {
    const c = await club();
    const ev = await night(c);
    expect((await eventRow(ev)).player_count).toBe(8);
    await fails(night(c, 'americano', { format: 'mexicano' }), INVALID);
    await fails(night(c, 'mexicano', { players: 'todos' }), INVALID);
    await fails(night(c, 'americano', { blob: 'x'.repeat(40_000) }), INVALID);
    const liga = await db.rpc<string>(w.u.sofi, 'create_event', {
      p_league: c.lid,
      p_type: 'liga',
      p_date: '2026-10-08',
      p_config: { format: 'liga', pairs: [randomUUID(), randomUUID(), randomUUID()] },
    });
    expect((await eventRow(liga)).player_count).toBe(3);
    const torneo = await db.rpc<string>(w.u.sofi, 'create_event', {
      p_league: c.lid,
      p_type: 'torneo',
      p_date: '2026-10-08',
      p_config: { format: 'torneo', categories: [{ id: 'A', pairs: ['a', 'b'] }, { id: 'B', pairs: ['c', 'd', 'e'] }] },
    });
    expect((await eventRow(torneo)).player_count).toBe(5);
    // Cambiar la configuración también la cuenta de nuevo.
    await db.rpc(w.u.sofi, 'update_event', { p_event: ev, p_patch: { config: { format: 'americano', players: [c.p.luis, c.p.ana, c.p.otra, c.p.nuevo] } } });
    expect((await eventRow(ev)).player_count).toBe(4);
  });

  it('las otras ligas no se tocan: el boliche sigue con sus tipos', async () => {
    const e = await event(db, w.priv, 'practica', '2026-10-08');
    expect((await eventRow(e)).type).toBe('practica');
  });
});

describe('forma del marcador de pádel', () => {
  it('formato: sets, americano o mexicano; a sets, 0–3 por lado; a puntos, 0–99', async () => {
    const c = await club();
    const mk = (extra: Record<string, unknown>) =>
      db.rpc<string[]>(w.u.sofi, 'create_matches', { p_league: c.lid, p_matches: [{ sides: [side(1, c.p.luis, c.p.ana), side(2, c.p.otra, c.p.nuevo)], ...extra }] });
    await mk({ format: 'sets' });
    await mk({});
    await fails(mk({ format: 'fiba' }), INVALID);
    const [id] = await mk({ format: 'sets' });
    await db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: { text: '6-4 6-3', sides: [2, 0], totals: { sets: [2, 0], games: [12, 7], points: [60, 44] } }, p_winner: 1 });
    await fails(db.rpc(w.u.sofi, 'admin_correct_result', { p_match: id, p_score: { text: '6-4 6-3', sides: [4, 0] }, p_winner: 1 }), INVALID);
    await fails(db.rpc(w.u.sofi, 'admin_correct_result', { p_match: id, p_score: { text: '6-4', sides: [1, 0], totals: { sets: [9, 0] } }, p_winner: 1 }), INVALID);
    await fails(db.rpc(w.u.sofi, 'admin_correct_result', { p_match: id, p_score: { text: '6-4', sides: [1, 0], totals: { games: [6] } }, p_winner: 1 }), INVALID);
    const [pts] = await mk({ format: 'americano', require_confirm: false });
    await db.rpc(w.u.sofi, 'publish_match', { p_op_id: randomUUID(), p_match: pts, p_seq: 1, p_state: { v: 1 }, p_score: { text: '14-8', sides: [14, 8] } });
    await fails(
      db.rpc(w.u.sofi, 'publish_match', { p_op_id: randomUUID(), p_match: pts, p_seq: 2, p_state: { v: 1 }, p_score: { text: '140-8', sides: [140, 8] } }),
      INVALID,
    );
  });

  it('en otra liga de partidos (baloncesto) el marcador no tiene el límite del pádel', async () => {
    const lid = await league(db, w.u.otro, { name: 'Basket', visibility: 'public', sport: 'basketball', requirePhoto: false });
    await member(db, lid, w.u.otro, 'owner', 'otro');
    const [id] = await db.rpc<string[]>(w.u.otro, 'create_matches', {
      p_league: lid,
      p_matches: [{ format: 'fiba', sides: [{ side: 1, label: 'A' }, { side: 2, label: 'B' }] }],
    });
    await db.rpc(w.u.otro, 'finish_match', { p_match: id, p_score: { text: '78-72', sides: [78, 72] }, p_winner: 1 });
    expect((await matchRow(id)).status).toBe('confirmed');
  });
});

describe('save_night_round: la ronda de la noche', () => {
  it('el admin publica la ronda: partidos del evento, formato de la noche, sin confirmación, descansos guardados', async () => {
    const c = await club();
    const ev = await night(c);
    const ids = await saveRound(c, ev);
    expect(ids).toHaveLength(2);
    const m1 = await matchRow(ids[0]);
    expect(m1).toMatchObject({ event_id: ev, round: 1, court: 'Cancha 1', format: 'americano', require_confirm: false, status: 'scheduled' });
    expect(m1.rules).toMatchObject({ match: { sport: 'padel' } });
    const labels = await db.admin<{ side: number; label: string }>('select side, label from public.match_sides where match_id = $1 order by side', [ids[0]]);
    expect(labels).toEqual([
      { side: 1, label: 'Luis / Ana' },
      { side: 2, label: 'Otra / Nuevo' },
    ]);
    const cfg = (await eventRow(ev)).config as Record<string, unknown>;
    expect(cfg).toMatchObject({ round: 1, rests: { '1': [c.p.juan] }, format: 'americano' });
    // La ronda 2 no borra la 1 y sube config.round.
    await saveRound(c, ev, 2, {
      matches: [{ court: 'Cancha 1', sides: [side(1, c.p.luis, c.p.otra), side(2, c.p.ana, c.p.juan)] }],
      rests: [c.p.nuevo, c.p.mia, c.p.extra, c.p.pedro, c.p.rosa],
    });
    expect(await db.count('public.matches', 'event_id = $1', [ev])).toBe(3);
    expect(((await eventRow(ev)).config as { round: number }).round).toBe(2);
  });

  it('las reglas de puntos de la noche van en el partido (las pone el teléfono)', async () => {
    const c = await club();
    const ev = await night(c);
    const r = round1(c);
    const [id] = await saveRound(c, ev, 1, { ...r, matches: r.matches.map((m) => ({ ...m, rules: { match: { sport: 'padel' }, points: { mode: 'total', target: 16 } } })) });
    expect((await matchRow(id)).rules).toEqual({ match: { sport: 'padel' }, points: { mode: 'total', target: 16 } });
  });

  it('rehacer una ronda que no empezó la reemplaza; si ya empezó: cerrado', async () => {
    const c = await club();
    const ev = await night(c);
    const first = await saveRound(c, ev);
    const again = await saveRound(c, ev);
    expect(again.some((id) => first.includes(id))).toBe(false);
    expect(await db.count('public.matches', 'event_id = $1', [ev])).toBe(2);
    await db.rpc(w.u.luis, 'publish_match', { p_op_id: randomUUID(), p_match: again[0], p_seq: 1, p_state: { v: 1 }, p_score: { text: '1-0', sides: [1, 0] } });
    await fails(saveRound(c, ev), 'cerrado');
  });

  it('solo el admin; nadie dos veces en la ronda; solo jugadores de la liga; solo noches de puntos', async () => {
    const c = await club();
    const ev = await night(c);
    await fails(saveRound(c, ev, 1, round1(c), w.u.luis), DENIED);
    await fails(saveRound(c, ev, 1, round1(c), w.u.extra), DENIED);
    const dup = round1(c);
    dup.rests = [c.p.luis];
    await fails(saveRound(c, ev, 1, dup), INVALID);
    const foreign = round1(c);
    foreign.rests = [w.p.pedro];
    await fails(saveRound(c, ev, 1, foreign), INVALID);
    await fails(saveRound(c, ev, 0), INVALID);
    const three = round1(c);
    three.matches[0].sides[0].players.push({ player_id: c.p.juan });
    three.rests = [];
    await fails(saveRound(c, ev, 1, three), INVALID);
    const liga = await db.rpc<string>(w.u.sofi, 'create_event', { p_league: c.lid, p_type: 'liga', p_date: '2026-10-08' });
    await fails(saveRound(c, liga), INVALID);
    await fails(saveRound(c, randomUUID()), 'no_existe');
  });

  it('push: a cada jugador con cuenta su cancha, compañero y rivales; a quien descansa, que descansa', async () => {
    const c = await club();
    await db.admin('update public.players set user_id = $1 where id = $2', [w.u.extra, c.p.extra]);
    const juanUid = await db.createUser('juan@x.com', 'juan');
    await member(db, c.lid, juanUid, 'member', 'juan');
    await db.admin('update public.players set user_id = $1 where id = $2', [juanUid, c.p.juan]);
    await subscribe(w.u.luis, w.u.otra, juanUid);
    const ev = await night(c);
    const ids = await saveRound(c, ev);
    const rows = await db.admin<{ user_id: string; title: string; body: string; url: string; tag: string }>(
      'select user_id, title, body, url, tag from public.push_outbox where tag = $1 order by title',
      [`ronda:${ev}`],
    );
    expect(rows.map((r) => r.user_id).sort()).toEqual([w.u.luis, w.u.otra, juanUid].sort());
    const luis = rows.find((r) => r.user_id === w.u.luis)!;
    expect(luis).toMatchObject({
      title: 'Ronda 1: te toca Cancha 1',
      body: 'Con Ana contra Otra / Nuevo. Americano del jueves.',
      url: `/l/${c.lid}/e/${ev}?partido=${ids[0]}`,
    });
    expect(rows.find((r) => r.user_id === juanUid)).toMatchObject({ title: 'Ronda 1: descansas' });
  });
});

describe('save_points_result: resultado a puntos', () => {
  async function started(): Promise<{ c: Club; ev: string; ids: string[] }> {
    const c = await club();
    const ev = await night(c);
    const r = round1(c);
    const ids = await saveRound(c, ev, 1, { ...r, matches: r.matches.map((m) => ({ ...m, rules: { match: { sport: 'padel' }, points: { mode: 'total', target: 24 } } })) });
    return { c, ev, ids };
  }

  it('un jugador del partido lo termina: queda final (sin confirmación), con empate si toca', async () => {
    const { ids } = await started();
    const op = randomUUID();
    expect(await db.rpc(w.u.luis, 'save_points_result', { p_match: ids[0], p_score1: 12, p_score2: 12, p_op_id: op })).toEqual({ ok: true, status: 'confirmed' });
    const m = await matchRow(ids[0]);
    expect(m).toMatchObject({ status: 'confirmed', winner_side: null, score: { text: '12-12', sides: [12, 12] }, confirmed_by: w.u.luis });
    // Reintento de la cola: lo mismo, sin repetir.
    expect(await db.rpc(w.u.luis, 'save_points_result', { p_match: ids[0], p_score1: 12, p_score2: 12, p_op_id: op })).toEqual({ ok: true, status: 'confirmed' });
    // Ya terminado: el jugador no lo cambia.
    await fails(db.rpc(w.u.otra, 'save_points_result', { p_match: ids[0], p_score1: 10, p_score2: 14 }), 'cerrado');
    // El admin lo corrige (con historial).
    await db.rpc(w.u.sofi, 'save_points_result', { p_match: ids[0], p_score1: 10, p_score2: 14, p_note: 'Se anotó mal' });
    const fixed = await matchRow(ids[0]);
    expect(fixed).toMatchObject({ status: 'confirmed', winner_side: 2, score: { text: '10-14' }, note: 'Se anotó mal' });
    expect((fixed.history as { a: string; from?: string }[]).at(-1)).toMatchObject({ a: 'correct', from: '12-12' });
  });

  it('el organizador pone el marcador con dos números; no pasa del total; se puede terminar antes (tiempo)', async () => {
    const { ids } = await started();
    await fails(db.rpc(w.u.sofi, 'save_points_result', { p_match: ids[1], p_score1: 20, p_score2: 10 }), INVALID);
    await fails(db.rpc(w.u.sofi, 'save_points_result', { p_match: ids[1], p_score1: -1, p_score2: 10 }), INVALID);
    expect(await db.rpc(w.u.extra, 'save_points_result', { p_match: ids[1], p_score1: 11, p_score2: 9 })).toEqual({ ok: true, status: 'confirmed' });
    expect(await matchRow(ids[1])).toMatchObject({ winner_side: 1, score: { text: '11-9', sides: [11, 9] }, proposed_side: null });
  });

  it('quien no juega ni organiza no puede; tampoco un partido a sets', async () => {
    const { c, ids } = await started();
    await fails(db.rpc(w.u.mia, 'save_points_result', { p_match: ids[0], p_score1: 14, p_score2: 10 }), DENIED);
    await fails(db.rpc(w.u.otro, 'save_points_result', { p_match: ids[0], p_score1: 14, p_score2: 10 }), DENIED);
    const [sets] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: c.lid,
      p_matches: [{ format: 'sets', sides: [side(1, c.p.luis, c.p.ana), side(2, c.p.otra, c.p.nuevo)] }],
    });
    await fails(db.rpc(w.u.sofi, 'save_points_result', { p_match: sets, p_score1: 6, p_score2: 4 }), INVALID);
  });

  it('otro anota en vivo con el turno: solo el admin cierra; lo viejo de otro teléfono vuelve como stale', async () => {
    const { ids } = await started();
    await db.rpc(w.u.luis, 'claim_scorer', { p_match: ids[0] });
    await db.rpc(w.u.luis, 'publish_match', { p_op_id: randomUUID(), p_match: ids[0], p_seq: 5, p_state: { v: 1 }, p_score: { text: '3-2', sides: [3, 2] } });
    await fails(db.rpc(w.u.otra, 'save_points_result', { p_match: ids[0], p_score1: 14, p_score2: 10 }), DENIED);
    expect(await db.rpc(w.u.luis, 'save_points_result', { p_match: ids[0], p_score1: 14, p_score2: 10, p_seq: 3 })).toMatchObject({
      ok: false,
      reason: 'stale',
      seq: 5,
    });
    expect(await db.rpc(w.u.luis, 'save_points_result', { p_match: ids[0], p_score1: 14, p_score2: 10, p_seq: 9, p_state: { v: 1, seq: 9 } })).toEqual({
      ok: true,
      status: 'confirmed',
    });
    expect(await matchRow(ids[0])).toMatchObject({ seq: 9, scorer_id: null, state: { v: 1, seq: 9 } });
  });
});

describe('aviso de partido: «Partido hoy a las 8:00 pm, Cancha 2»', () => {
  it('un aviso por partido entre 3 horas y 10 minutos antes; si lo reprograman, otra vez', async () => {
    const c = await club();
    const pair = await db.rpc<string>(w.u.sofi, 'create_season_team', {
      p_league: c.lid,
      p_name: 'Otra / Nuevo',
      p_players: [{ player_id: c.p.otra }, { player_id: c.p.nuevo }],
    });
    await subscribe(w.u.luis, w.u.otra);
    const now = new Date('2026-10-08T21:00:00Z'); // 5:00 pm en Santo Domingo
    const at = '2026-10-09T00:00:00Z'; // 8:00 pm
    const [id] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: c.lid,
      p_matches: [
        { format: 'sets', court: 'Cancha 2', scheduled_at: at, sides: [side(1, c.p.luis, c.p.ana), { side: 2, team_id: pair }] },
        { format: 'sets', court: 'Cancha 3', scheduled_at: '2026-10-09T03:00:00Z', sides: [side(1, c.p.luis, c.p.ana), { side: 2, team_id: pair }] },
      ],
    });
    const run = () => db.admin<{ n: number }>('select private.padel_match_reminders($1) as n', [now.toISOString()]);
    expect((await run())[0].n).toBe(1);
    const rows = await db.admin<{ user_id: string; title: string; body: string; url: string }>(
      'select user_id, title, body, url from public.push_outbox where tag = $1 order by user_id',
      [`partido:${id}`],
    );
    expect(rows.map((r) => r.user_id).sort()).toEqual([w.u.luis, w.u.otra].sort());
    expect(rows[0]).toMatchObject({ title: 'Partido hoy a las 8:00 pm, Cancha 2', body: 'Luis / Ana contra Otra / Nuevo · Pádel Club', url: `/l/${c.lid}/juegos?partido=${id}` });
    expect((await run())[0].n).toBe(0);
    await db.rpc(w.u.sofi, 'reschedule_match', { p_match: id, p_scheduled_at: '2026-10-08T23:30:00Z' });
    expect((await run())[0].n).toBe(1);
    // Terminado o de otra liga: nada.
    await db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: { text: '6-4 6-4', sides: [2, 0] }, p_winner: 1 });
    await db.rpc(w.u.sofi, 'reschedule_match', { p_match: id, p_scheduled_at: '2026-10-08T23:45:00Z' }).catch(() => undefined);
    expect((await run())[0].n).toBe(0);
  });

  it('nadie lo llama desde la app', async () => {
    await fails(db.as(w.u.sofi, 'select private.padel_match_reminders()'), DENIED);
    await fails(db.as(w.u.sofi, 'select * from private.padel_reminders'), DENIED);
  });
});
