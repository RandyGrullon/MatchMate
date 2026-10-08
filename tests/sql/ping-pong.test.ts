/**
 * Ping pong (20260930000200_ping_pong.sql, docs/ping-pong.md): el deporte abierto en sport_status, sus eventos
 * (liga, torneo, cajas y escalera; sin noches), el formato y el marcador de sus partidos (hasta el mejor de 7, con
 * private.tt_score_ok; con ganador, un final posible que cuadra con él, con private.tt_result_ok), el nivel `tt` de 1 a 10, lo que abre private.raq_sport (cajas, escalera, inscripciones y la
 * agenda), el premio del torneo (private.prize_comp) y las insignias (checks de deporte, badge_activity,
 * badge_apply_decisions y el ícono 'ping-pong'). Cada prueba en su transacción.
 *
 * Mundo: el de fixture.ts más la liga privada «Ping Pong Club» (dueño org, admin sofi; luis, ana, otra, nuevo y extra
 * con cuenta; pedro y rosa sin cuenta).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';
import { racketResultParser } from '../../src/components/match/parsers';
import { resolveRules } from '../../src/sports/racket';

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

interface Club {
  lid: string;
  p: { luis: string; ana: string; otra: string; nuevo: string; extra: string; pedro: string; rosa: string };
}

async function club(sport = 'table_tennis', opts: { name?: string; visibility?: 'public' | 'private' } = {}): Promise<Club> {
  const lid = await league(db, w.u.org, { name: opts.name ?? 'Ping Pong Club', visibility: opts.visibility ?? 'private', sport, requirePhoto: false });
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
    luis: await player(db, lid, 'Luis', w.u.luis),
    ana: await player(db, lid, 'Ana', w.u.ana),
    otra: await player(db, lid, 'Otra', w.u.otra),
    nuevo: await player(db, lid, 'Nuevo', w.u.nuevo),
    extra: await player(db, lid, 'Extra', w.u.extra),
    pedro: await player(db, lid, 'Pedro'),
    rosa: await player(db, lid, 'Rosa'),
  };
  return { lid, p };
}

const createEvent = (c: Club, type: string, config: Json = {}, who = w.u.sofi, date = '2026-10-01') =>
  db.rpc<string>(who, 'create_event', { p_league: c.lid, p_type: type, p_date: date, p_name: type, p_config: config });
const createMatch = async (c: Club, a: string, b: string, extra: Json = {}) =>
  (await db.rpc<string[]>(w.u.sofi, 'create_matches', { p_league: c.lid, p_matches: [{ sides: singles(a, b), ...extra }] }))[0];
const matchRow = async (id: string) => (await db.admin<Json>('select * from public.matches where id = $1', [id]))[0];
const one = (a: string) => ({ player_id: a });
const singles = (a: string, b: string) => [
  { side: 1, players: [one(a)] },
  { side: 2, players: [one(b)] },
];
/**
 * Marcador de un partido de ping pong como lo manda el teléfono («Solo el resultado»): texto, juegos ganados y puntos,
 * sacados del motor para que no se separen del texto.
 */
const score = (text: string, bestOf: 3 | 5 | 7 = 5) => racketResultParser(resolveRules('table_tennis', { bestOf }))(text).score;
const BO5 = score('11-7 9-11 11-5 11-8');
const BO7 = score('11-9 8-11 12-10 6-11 11-7 5-11 15-13', 7);
/** Marcador armado a mano (lo que mandaría una llamada hecha a mano a la RPC). */
const raw = (text: string, games: [number, number], points: [number, number] = [0, 0]) => ({ text, sides: games, totals: { sets: games, games, points } });

describe('el deporte', () => {
  it('table_tennis: familia racket, abierto para todos (orden 10, antes de esports)', async () => {
    expect(await db.admin(`select id, family, status, sort_order from public.sport_status where id = 'table_tennis'`)).toEqual([
      { id: 'table_tennis', family: 'racket', status: 'open', sort_order: 10 },
    ]);
    const all = await db.asAnon<{ id: string }>('select id from public.sport_status order by sort_order');
    expect(all).toHaveLength(11);
    // Ya no es el último: esports (20261008000100_esports.sql) va después, con orden 11.
    expect(all.findIndex((s) => s.id === 'table_tennis')).toBe(9);
    expect(all.at(-1)).toEqual({ id: 'esports' });
  });

  it('una cuenta normal crea la liga de ping pong y el torneo suelto', async () => {
    const r = await db.rpc<{ league_id: string }>(w.u.nuevo, 'create_league', {
      p_name: 'Ping pong del barrio',
      p_sport: 'table_tennis',
      p_rules: { match: { sport: 'table_tennis', bestOf: 5 } },
    });
    expect(await db.admin('select sport, kind from public.leagues where id = $1', [r.league_id])).toEqual([{ sport: 'table_tennis', kind: 'liga' }]);
    expect((await db.admin<{ f: string }>('select private.league_family($1) as f', [r.league_id]))[0].f).toBe('racket');
    const t = await db.rpc<{ league_id: string; event_id: string }>(w.u.nuevo, 'create_tournament', { p_name: 'Abierto de ping pong', p_date: '2026-11-01', p_sport: 'table_tennis' });
    expect(await db.admin('select type from public.events where id = $1', [t.event_id])).toEqual([{ type: 'torneo' }]);
    expect((await db.admin<{ k: string }>(`select private.prize_comp($1, 'evento', $2) as k`, [t.league_id, t.event_id]))[0].k).toBe('racket_tourney');
    // Cerrado por el superadmin: nadie crea ligas.
    await db.rpc(w.u.dios, 'set_sport_status', { p_sport: 'table_tennis', p_status: 'closed' });
    await fails(db.rpc(w.u.nuevo, 'create_league', { p_name: 'Otra', p_sport: 'table_tennis' }), 'cerrado');
  });
});

describe('eventos de ping pong', () => {
  it('liga, torneo, cajas y escalera; sin noches de puntos ni otros tipos', async () => {
    const c = await club();
    for (const t of ['liga', 'torneo', 'cajas', 'escalera']) await createEvent(c, t);
    for (const t of ['americano', 'mexicano', 'noche', 'practica', 'ronda']) await fails(createEvent(c, t), INVALID);
    // El tipo tampoco se cambia a uno de noche después.
    const liga = await createEvent(c, 'liga');
    await fails(db.admin(`update public.events set type = 'americano' where id = $1`, [liga]), INVALID);
  });

  it('configuración chica y player_count como el resto de la raqueta', async () => {
    const c = await club();
    const liga = await createEvent(c, 'liga', { players: [c.p.luis, c.p.ana, c.p.otra] });
    expect((await db.admin<{ n: number }>('select player_count as n from public.events where id = $1', [liga]))[0].n).toBe(3);
    await fails(createEvent(c, 'liga', { players: 'todos' }), INVALID);
    await fails(createEvent(c, 'liga', { big: 'x'.repeat(40000) }), INVALID);
  });

  it('las noches de puntos no se abren: save_night_round no sirve y signup_kind no da «night»', async () => {
    const c = await club();
    const liga = await createEvent(c, 'liga');
    await fails(
      db.rpc(w.u.sofi, 'save_night_round', {
        p_event: liga,
        p_round: 1,
        p_matches: [{ sides: [{ side: 1, players: [one(c.p.luis), one(c.p.ana)] }, { side: 2, players: [one(c.p.otra), one(c.p.nuevo)] }] }],
      }),
      INVALID,
    );
    expect(await db.admin(`select private.signup_kind($1, 'americano') as n, private.signup_kind($1, 'torneo') as t, private.night_league($1) as night`, [c.lid])).toEqual([
      { n: null, t: 'tourney', night: false },
    ]);
  });
});

describe('partidos y marcador', () => {
  it('formato "" o "sets"; round robin u otro, no', async () => {
    const c = await club();
    const a = await createMatch(c, c.p.luis, c.p.ana);
    expect((await matchRow(a)).format).toBe('');
    const b = await createMatch(c, c.p.otra, c.p.nuevo, { format: 'sets' });
    expect((await matchRow(b)).format).toBe('sets');
    for (const format of ['americano', 'mexicano', 'fiba']) await fails(createMatch(c, c.p.otra, c.p.nuevo, { format }), INVALID);
  });

  it('al mejor de 5: anota un jugador y el rival confirma', async () => {
    const c = await club();
    const id = await createMatch(c, c.p.luis, c.p.ana);
    await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: BO5, p_winner: 1 });
    expect((await matchRow(id)).status).toBe('finished');
    await db.rpc(w.u.ana, 'confirm_result', { p_match: id });
    expect(await matchRow(id)).toMatchObject({ status: 'confirmed', winner_side: 1, score: BO5 });
  });

  it('al mejor de 7: 4-3 en juegos pasa; más de 4 juegos, no', async () => {
    const c = await club();
    const id = await createMatch(c, c.p.luis, c.p.ana, { format: 'sets' });
    await fails(db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: { text: '11-0', sides: [5, 0] }, p_winner: 1 }), INVALID);
    await fails(db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: { ...BO7, totals: { ...BO7.totals, games: [5, 0] } }, p_winner: 1 }), INVALID);
    await fails(db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: { ...BO7, totals: { ...BO7.totals, sets: [5, 3] } }, p_winner: 1 }), INVALID);
    await fails(db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: { ...BO7, totals: { ...BO7.totals, points: [10000, 3] } }, p_winner: 1 }), INVALID);
    await fails(db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: { ...BO7, totals: { ...BO7.totals, points: [68] } }, p_winner: 1 }), INVALID);
    await db.rpc(w.u.sofi, 'admin_correct_result', { p_match: id, p_score: BO7, p_winner: 1 });
    expect(await matchRow(id)).toMatchObject({ status: 'confirmed', score: BO7 });
  });

  it('el tenis y el pickleball siguen topados en 3', async () => {
    for (const sport of ['tennis', 'pickleball']) {
      const c = await club(sport, { name: `Club ${sport}` });
      const id = await createMatch(c, c.p.luis, c.p.ana, { format: 'sets' });
      await fails(db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: { text: '6-4', sides: [4, 3] }, p_winner: 1 }), INVALID);
    }
  });

  it('private.tt_score_ok: la forma del marcador', async () => {
    const ok = async (p: unknown) => (await db.admin<{ ok: boolean }>('select private.tt_score_ok($1::jsonb) as ok', [p === null ? null : JSON.stringify(p)]))[0].ok;
    expect(await ok(null)).toBe(true);
    expect(await ok({ text: 'W.O.' })).toBe(true);
    expect(await ok(BO5)).toBe(true);
    expect(await ok(BO7)).toBe(true);
    expect(await ok({ sides: [4, 0], totals: { sets: [4, 0], games: [4, 0], points: [44, 0] } })).toBe(true);
    expect(await ok({ sides: [4.5, 0] })).toBe(false);
    expect(await ok({ sides: [-1, 0] })).toBe(false);
    expect(await ok({ sides: ['3', 1] })).toBe(false);
    expect(await ok({ sides: [3, 1], totals: { sets: [3, 1], games: [3, 1], points: [42, 31, 0] } })).toBe(false);
    expect(await ok({ sides: [3, 1], totals: { sets: 3 } })).toBe(false);
    // Los puntos salen del texto: 11+8+12+6+11+5+15 y 9+11+10+11+7+11+13.
    expect(BO7.totals?.points).toEqual([68, 72]);
  });

  it('con ganador: un final posible del mejor de 3, 5 o 7 que cuadra con el ganador y con los totales', async () => {
    const c = await club();
    const id = await createMatch(c, c.p.luis, c.p.ana);
    // Empatados, sin llegar a 2 juegos o el ganador al revés: finish_match, admin_correct_result y set_walkover.
    for (const bad of [raw('x', [4, 4]), raw('11-5', [1, 0]), raw('11-5 5-11 11-5 5-11', [2, 2]), score('5-11 5-11 5-11')])
      await fails(db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: bad, p_winner: 1 }), INVALID);
    await fails(db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: { ...BO5, totals: { ...BO5.totals, games: [3, 0] } }, p_winner: 1 }), INVALID);
    await fails(db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: { ...BO5, totals: { ...BO5.totals, sets: [1, 3] } }, p_winner: 1 }), INVALID);
    await fails(db.rpc(w.u.sofi, 'admin_correct_result', { p_match: id, p_score: BO5, p_winner: 2 }), INVALID);
    await fails(db.rpc(w.u.sofi, 'set_walkover', { p_match: id, p_absent: 2, p_score: raw('W.O.', [0, 3], [0, 33]) }), INVALID);
    expect((await matchRow(id)).status).toBe('scheduled');
    // Los finales de verdad: 2-0 y 2-1 al mejor de 3, 3-2 al de 5, 4-0 al de 7 (gana el lado 2) y un retiro completado.
    const finals = [
      [score('11-7 11-9', 3), 1],
      [score('7-11 11-9 9-11', 3), 2],
      [score('11-7 9-11 11-5 5-11 13-11'), 1],
      [score('7-11 7-11 7-11 7-11', 7), 2],
      [raw('11-7 3-5 ret.', [3, 0], [33, 12]), 1],
    ] as const;
    for (const [s, winner] of finals) {
      await db.rpc(w.u.sofi, 'admin_correct_result', { p_match: id, p_score: s, p_winner: winner });
      expect(await matchRow(id)).toMatchObject({ status: 'confirmed', winner_side: winner, score: s });
    }
    // W.O. completado; sin `sides` (el de la escalera) o sin ganador (faltaron los dos) no hay con qué comparar.
    await db.rpc(w.u.sofi, 'set_walkover', { p_match: id, p_absent: 2, p_score: raw('W.O.', [3, 0], [33, 0]) });
    await db.rpc(w.u.sofi, 'set_walkover', { p_match: id, p_absent: 1, p_score: { text: 'W.O.' } });
    await db.rpc(w.u.sofi, 'set_walkover', { p_match: id, p_absent: 0, p_score: raw('W.O.', [0, 0]) });
    // En juego (sin ganador) los juegos van como vayan.
    const live = await createMatch(c, c.p.otra, c.p.nuevo);
    await db.admin(`update public.matches set status = 'live', score = $2 where id = $1`, [live, raw('11-7 5-11', [1, 1], [16, 18])]);
    expect((await matchRow(live)).status).toBe('live');
  });

  it('private.tt_result_ok: el ganador, los juegos y los totales', async () => {
    const ok = async (p: unknown, winner: number | null) =>
      (await db.admin<{ ok: boolean }>('select private.tt_result_ok($1::jsonb, $2::smallint) as ok', [JSON.stringify(p), winner]))[0].ok;
    expect(await ok(BO5, 1)).toBe(true);
    expect(await ok(BO7, 1)).toBe(true);
    expect(await ok(BO5, 2)).toBe(false);
    expect(await ok(BO5, null)).toBe(true);
    expect(await ok({ text: 'W.O.' }, 1)).toBe(true);
    expect(await ok({ sides: [2, 0] }, 1)).toBe(true);
    expect(await ok({ sides: [0, 4] }, 2)).toBe(true);
    for (const sides of [
      [4, 4],
      [1, 0],
      [5, 0],
      [0, 0],
    ])
      expect(await ok({ sides }, 1), JSON.stringify(sides)).toBe(false);
    expect(await ok({ sides: [3, 1], totals: { games: [3, 0] } }, 1)).toBe(false);
    expect(await ok({ sides: [3, 1], totals: { sets: [3, 1], games: [3, 1], points: [30, 44] } }, 1)).toBe(true);
  });
});

describe('nivel del jugador: `tt` de 1 a 10', () => {
  it('entero o decimal; null lo quita; fuera de rango o texto, no', async () => {
    const c = await club();
    await db.rpc(w.u.sofi, 'update_player', { p_player: c.p.luis, p_patch: { attrs: { tt: 5.5 } } });
    await db.rpc(w.u.sofi, 'update_player', { p_player: c.p.ana, p_patch: { attrs: { tt: 10 } } });
    await db.rpc(w.u.sofi, 'update_player', { p_player: c.p.otra, p_patch: { attrs: { tt: 1 } } });
    await db.rpc(w.u.sofi, 'update_player', { p_player: c.p.otra, p_patch: { attrs: { tt: null } } });
    for (const bad of [11, 0.5, 0, '5', true]) await fails(db.rpc(w.u.sofi, 'update_player', { p_player: c.p.nuevo, p_patch: { attrs: { tt: bad } } }), INVALID);
    expect((await db.admin<{ attrs: Json }>('select attrs from public.players where id = $1', [c.p.luis]))[0].attrs).toEqual({ tt: 5.5 });
    await fails(db.rpc(w.u.luis, 'update_player', { p_player: c.p.luis, p_patch: { attrs: { tt: 9 } } }), DENIED);
  });

  it('en una liga de otro deporte `tt` no se revisa', async () => {
    const t = await club('tennis', { name: 'Tenis Club' });
    await db.rpc(w.u.sofi, 'update_player', { p_player: t.p.luis, p_patch: { attrs: { tt: 11, ntrp: 4 } } });
    await fails(db.rpc(w.u.sofi, 'update_player', { p_player: t.p.ana, p_patch: { attrs: { ntrp: 9 } } }), INVALID);
  });
});

describe('lo que abre private.raq_sport', () => {
  it('liga por cajas: save_box_month abre el mes con partidos a juegos', async () => {
    const c = await club();
    expect((await db.admin<{ s: string }>('select private.raq_sport($1) as s', [c.lid]))[0].s).toBe('table_tennis');
    const ev = await createEvent(c, 'cajas', { format: 'cajas' });
    const ids = await db.rpc<string[]>(w.u.sofi, 'save_box_month', {
      p_event: ev,
      p_month: 1,
      p_boxes: [
        [c.p.luis, c.p.ana, c.p.otra],
        [c.p.nuevo, c.p.pedro, c.p.rosa],
      ],
      p_matches: [
        { stage: 'Caja 1', sides: singles(c.p.luis, c.p.ana) },
        { stage: 'Caja 2', sides: singles(c.p.nuevo, c.p.pedro) },
      ],
      p_label: 'Octubre',
    });
    expect(ids).toHaveLength(2);
    expect(await matchRow(ids[0])).toMatchObject({ event_id: ev, round: 1, format: 'sets', stage: 'Caja 1', status: 'scheduled' });
    expect((await db.admin<{ n: number }>('select player_count as n from public.events where id = $1', [ev]))[0].n).toBe(6);
    await db.rpc(w.u.sofi, 'admin_correct_result', { p_match: ids[0], p_score: BO7, p_winner: 1 });
    expect((await matchRow(ids[0])).status).toBe('confirmed');
  });

  it('escalera: entrar, retar con partido a juegos y moverse con el resultado confirmado', async () => {
    const c = await club();
    const ev = await createEvent(c, 'escalera', { format: 'escalera', open: true, maxUp: 3, acceptDays: 3, playDays: 7 });
    await db.rpc(w.u.sofi, 'set_ladder', { p_event: ev, p_entrants: [c.p.pedro, c.p.ana, c.p.otra, c.p.nuevo, c.p.luis] });
    expect(await db.rpc(w.u.extra, 'join_ladder', { p_event: ev })).toBe(6);
    const id = await db.rpc<string>(w.u.luis, 'create_challenge', { p_event: ev, p_challenged: c.p.ana, p_id: randomUUID() });
    const ch = (await db.admin<Json>('select * from public.ladder_challenges where id = $1', [id]))[0];
    expect(await matchRow(ch.match_id as string)).toMatchObject({ event_id: ev, stage: 'Reto', format: 'sets', require_confirm: true });
    await db.rpc(w.u.ana, 'accept_challenge', { p_challenge: id, p_court: 'Mesa 2' });
    await db.rpc(w.u.luis, 'finish_match', { p_match: ch.match_id, p_score: BO5, p_winner: 1 });
    await db.rpc(w.u.ana, 'confirm_result', { p_match: ch.match_id });
    const order = await db.admin<{ entrant_id: string }>('select entrant_id from public.ladder_rungs where event_id = $1 order by position', [ev]);
    expect(order.map((r) => r.entrant_id)).toEqual([c.p.pedro, c.p.luis, c.p.ana, c.p.otra, c.p.nuevo, c.p.extra]);
  });

  it('torneo con inscripción: «tourney» y sale en la agenda pública (también sin cuenta)', async () => {
    const c = await club('table_tennis', { visibility: 'public', name: 'Ping Pong Abierto' });
    const [{ d }] = await db.admin<{ d: string }>(`select to_char((now() at time zone 'America/Santo_Domingo')::date + 42, 'YYYY-MM-DD') as d`);
    const [{ from }] = await db.admin<{ from: string }>(`select to_char((now() at time zone 'America/Santo_Domingo')::date + 40, 'YYYY-MM-DD') as from`);
    const t = await createEvent(
      c,
      'torneo',
      {
        v: 1,
        format: 'torneo',
        categories: [{ id: 'A', name: 'Primera', pairs: [c.p.luis], groups: 0, perGroup: 3, thirdPlace: true }],
        courts: [],
        points: 'standard',
        signup: { open: true, cap: 8 },
      },
      w.u.org,
      d,
    );
    for (const who of [w.u.nuevo, ANON]) {
      const a = await db.rpc<{ items: Json[] }>(who, 'public_agenda', { p_from: from, p_sport: 'table_tennis' });
      expect(a.items.find((i) => i.eventId === t)).toMatchObject({ sport: 'table_tennis', type: 'torneo', join: 'signup', categories: [{ id: 'A', taken: 1 }] });
    }
    expect((await db.admin<{ k: string }>(`select private.prize_comp($1, 'evento', $2) as k`, [c.lid, t]))[0].k).toBe('racket_tourney');
    // Individual salvo que la liga diga dobles.
    expect((await db.admin<{ d: boolean }>('select private.prize_racket_doubles($1) as d, private.signup_doubles($1) as s', [c.lid]))[0]).toEqual({ d: false, s: false });
  });

  it('una liga (no torneo) no tiene premio de torneo', async () => {
    const c = await club();
    const liga = await createEvent(c, 'liga');
    expect((await db.admin<{ k: string | null }>(`select private.prize_comp($1, 'evento', $2) as k`, [c.lid, liga]))[0].k).toBeNull();
  });
});

describe('insignias', () => {
  it('los check de deporte se llaman como los nombra Postgres y aceptan table_tennis', async () => {
    const rows = await db.admin<{ conname: string; def: string }>(
      `select conname, pg_get_constraintdef(oid) as def from pg_constraint
        where conname in ('badge_awards_sport_check', 'badge_progress_sport_check', 'badge_stats_sport_check') order by conname`,
    );
    expect(rows.map((r) => r.conname)).toEqual(['badge_awards_sport_check', 'badge_progress_sport_check', 'badge_stats_sport_check']);
    for (const r of rows) {
      expect(r.def).toContain("'table_tennis'::text");
      expect(r.def).toContain("'swimming'::text");
    }
    await db.admin(`insert into public.badge_awards (badge_key, sport, level, period_key, user_id) values ('racket_wins', 'table_tennis', 1, '-', $1)`, [w.u.luis]);
    await db.admin(`insert into public.badge_progress (user_id, badge_key, sport, value, target, next_level) values ($1, 'racket_wins', 'table_tennis', 3, 5, 1)`, [w.u.luis]);
    await db.admin(
      `insert into public.badge_stats (badge_key, sport, level, holders, base, pct, rarity, computed_at) values ('racket_wins', 'table_tennis', 1, 1, 10, 10, 'nueva', now())`,
    );
    await fails(db.admin(`insert into public.badge_awards (badge_key, sport, level, period_key, user_id) values ('racket_wins', 'squash', 1, '-', $1)`, [w.u.luis]), INVALID);
  });

  it('badge_apply_decisions acepta el deporte (y sigue rechazando uno que no existe)', async () => {
    await db.admin('delete from private.badge_queue');
    const enqueue = async (ref: string) => {
      await db.admin(`select private.badge_enqueue('resultado', null, $1, $2)`, [w.u.luis, ref]);
      return (await db.admin<{ id: number }>('select id from private.badge_queue where ref = $1', [ref]))[0].id;
    };
    const decision = (sport: string) => ({
      kind: 'award',
      badge_key: 'racket_wins',
      sport,
      level: 1,
      period_key: '-',
      player_id: null,
      user_id: w.u.luis,
      league_id: null,
      status: 'provisional',
      refs: [],
      context: { name: 'Victorias', level_name: 'bronce' },
    });
    const apply = async (job: number, sport: string) =>
      (await db.admin<{ r: Json }>('select private.badge_apply($1, $2::jsonb) as r', [job, JSON.stringify([decision(sport)])]))[0].r;
    expect(await apply(await enqueue('match:a'), 'table_tennis')).toMatchObject({ ok: true, awarded: 1 });
    expect(await db.admin(`select badge_key, sport, user_id from public.badge_awards where user_id = $1`, [w.u.luis])).toEqual([
      { badge_key: 'racket_wins', sport: 'table_tennis', user_id: w.u.luis },
    ]);
    expect(await apply(await enqueue('match:b'), 'squash')).toMatchObject({ ok: false, error: 'invalido: award racket_wins squash' });
  });

  it('badge_activity: un partido confirmado de ping pong cuenta como día oficial de raqueta', async () => {
    const c = await club();
    const id = await createMatch(c, c.p.luis, c.p.ana, { scheduled_at: '2026-10-02T23:00:00Z' });
    const days = () =>
      db.admin<Json>('select sport, league_id, player_id, date::text as date, official, roster from private.badge_activity($1, null, null) order by player_id', [
        [c.p.luis, c.p.ana],
      ]);
    expect(await days()).toEqual([]);
    await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: BO5, p_winner: 1 });
    await db.rpc(w.u.ana, 'confirm_result', { p_match: id });
    const got = await days();
    expect(got).toHaveLength(2);
    for (const r of got) expect(r).toMatchObject({ sport: 'table_tennis', league_id: c.lid, date: '2026-10-02', official: true, roster: false });
    expect(new Set(got.map((r) => r.player_id))).toEqual(new Set([c.p.luis, c.p.ana]));
  });

  it("el ícono curado 'ping-pong' (53 en total)", async () => {
    expect(await db.admin(`select private.badge_icon_ok('ping-pong') as a, private.badge_icon_ok('ping_pong') as b, private.badge_icon_ok('pickleball') as c`)).toEqual([
      { a: true, b: false, c: true },
    ]);
    const [{ n }] = await db.admin<{ n: number }>(
      `select count(*)::int as n from pg_proc p, regexp_matches(p.prosrc, '''[a-z0-9-]+''', 'g') where p.proname = 'badge_icon_ok'`,
    );
    expect(n).toBe(53);
  });
});

describe('permisos', () => {
  it('private.tt_score_ok y tt_result_ok no las ejecuta nadie de la app; las redefinidas tampoco', async () => {
    const rows = await db.admin<{ fn: string; anon: boolean; auth: boolean; search_path: boolean }>(
      `select p.proname as fn, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              coalesce('search_path=""' = any (p.proconfig), false) as search_path
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname in ('tt_score_ok', 'tt_result_ok', 'raq_sport', 'raq_check_event', 'raq_check_match', 'raq_check_player',
                                                       'prize_comp', 'badge_activity', 'badge_apply_decisions', 'badge_icon_ok')
        order by 1`,
    );
    expect(rows).toHaveLength(10);
    for (const r of rows) expect(r, r.fn).toMatchObject({ anon: false, auth: false, search_path: true });
    await fails(db.as(w.u.luis, `select private.tt_score_ok('{}'::jsonb)`), DENIED);
    await fails(db.as(w.u.luis, `select private.tt_result_ok('{}'::jsonb, 1::smallint)`), DENIED);
  });
});
