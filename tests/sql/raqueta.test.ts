/**
 * Tenis y pickleball (20260927000700_raqueta.sql): tipos y configuración de los eventos, forma del marcador,
 * nivel NTRP / DUPR en players.attrs, el round robin social de pickleball (noche del pádel con juegos a 11) y la
 * liga por cajas (save_box_month). La escalera va en raqueta-escalera.test.ts. Cada prueba en su transacción.
 *
 * Mundo: liga privada «Tenis Club» (dueño org, admin sofi; luis, ana, otra, nuevo con cuenta; pedro y rosa sin
 * cuenta) y liga privada «Pickleball Club» igual. otro no es de ninguna.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DENIED, INVALID, TestDb, fails } from './harness';
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
  p: { luis: string; ana: string; otra: string; nuevo: string; pedro: string; rosa: string };
}

async function club(sport: 'tennis' | 'pickleball' | 'padel', name = sport === 'tennis' ? 'Tenis Club' : 'Pickleball Club'): Promise<Club> {
  const lid = await league(db, w.u.org, { name, visibility: 'private', sport, requirePhoto: false });
  const rules = sport === 'tennis' ? { match: { sport: 'tennis' } } : sport === 'pickleball' ? { match: { sport: 'pickleball' } } : { match: { sport: 'padel' } };
  await db.admin(`update public.leagues set rules = $2 where id = $1`, [lid, rules]);
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  for (const [uid, n] of [
    [w.u.luis, 'luis'],
    [w.u.ana, 'ana'],
    [w.u.otra, 'otra'],
    [w.u.nuevo, 'nuevo'],
  ] as const)
    await member(db, lid, uid, 'member', n);
  const p = {
    luis: await player(db, lid, 'Luis', w.u.luis),
    ana: await player(db, lid, 'Ana', w.u.ana),
    otra: await player(db, lid, 'Otra', w.u.otra),
    nuevo: await player(db, lid, 'Nuevo', w.u.nuevo),
    pedro: await player(db, lid, 'Pedro'),
    rosa: await player(db, lid, 'Rosa'),
  };
  return { lid, p };
}

const createEvent = (c: Club, type: string, config: Record<string, unknown> = {}, who = w.u.sofi) =>
  db.rpc<string>(who, 'create_event', { p_league: c.lid, p_type: type, p_date: '2026-10-01', p_name: type, p_config: config });

const eventRow = async (id: string) => (await db.admin<Record<string, unknown>>('select * from public.events where id = $1', [id]))[0];
const matchRow = async (id: string) => (await db.admin<Record<string, unknown>>('select * from public.matches where id = $1', [id]))[0];
const one = (a: string) => ({ player_id: a });
const singles = (a: string, b: string) => [
  { side: 1, players: [one(a)] },
  { side: 2, players: [one(b)] },
];

describe('eventos de tenis y pickleball', () => {
  it('tenis: liga, torneo, cajas y escalera; sin noches de puntos ni otros tipos', async () => {
    const c = await club('tennis');
    for (const t of ['liga', 'torneo', 'cajas', 'escalera']) await createEvent(c, t);
    for (const t of ['americano', 'mexicano', 'practica', 'ronda']) await fails(createEvent(c, t), INVALID);
    // El torneo sin liga de tenis también sirve.
    const t = await db.rpc<{ event_id: string }>(w.u.dios, 'create_tournament', { p_name: 'Copa', p_date: '2026-11-01', p_sport: 'tennis' });
    expect((await eventRow(t.event_id)).type).toBe('torneo');
  });

  it('pickleball: round robin (americano), liga, torneo, cajas y escalera', async () => {
    const c = await club('pickleball');
    for (const t of ['americano', 'mexicano', 'liga', 'torneo', 'cajas', 'escalera']) await createEvent(c, t);
    await fails(createEvent(c, 'practica'), INVALID);
  });

  it('configuración: objeto chico, formato igual al tipo, juego del round robin; player_count', async () => {
    const c = await club('pickleball');
    const rr = await createEvent(c, 'americano', { format: 'americano', players: Object.values(c.p), game: { to: 11, winBy: 2, scoring: 'sideout' } });
    expect((await eventRow(rr)).player_count).toBe(6);
    await fails(createEvent(c, 'americano', { format: 'mexicano' }), INVALID);
    await fails(createEvent(c, 'americano', { game: { to: 40 } }), INVALID);
    await fails(createEvent(c, 'americano', { game: { to: 11, winBy: 3 } }), INVALID);
    await fails(createEvent(c, 'americano', { game: { to: 'once' } }), INVALID);
    await fails(createEvent(c, 'liga', { players: 'todos' }), INVALID);
    await fails(createEvent(c, 'liga', { big: 'x'.repeat(40000) }), INVALID);
    const liga = await createEvent(c, 'liga', { pairs: [c.p.luis, c.p.ana, c.p.otra] });
    expect((await eventRow(liga)).player_count).toBe(3);
    const cajas = await createEvent(c, 'cajas', { months: [{ n: 1, boxes: [[c.p.luis, c.p.ana], [c.p.otra, c.p.nuevo, c.p.pedro]] }] });
    expect((await eventRow(cajas)).player_count).toBe(5);
    await fails(createEvent(c, 'cajas', { months: 'enero' }), INVALID);
  });

  it('un tipo de otro deporte no pasa, y el pádel sigue con los suyos', async () => {
    const padel = await club('padel', 'Pádel Club');
    await createEvent(padel, 'americano');
    await fails(createEvent(padel, 'escalera'), INVALID);
  });
});

describe('partidos de tenis y pickleball', () => {
  it('tenis: solo a sets; el marcador de sets va de 0 a 3', async () => {
    const c = await club('tennis');
    const [id] = await db.rpc<string[]>(w.u.sofi, 'create_matches', { p_league: c.lid, p_matches: [{ format: 'sets', sides: singles(c.p.luis, c.p.ana) }] });
    await fails(db.rpc(w.u.sofi, 'create_matches', { p_league: c.lid, p_matches: [{ format: 'americano', sides: singles(c.p.luis, c.p.ana) }] }), INVALID);
    await fails(db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: { text: '6-4 6-4', sides: [6, 4] }, p_winner: 1 }), INVALID);
    await fails(db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: { text: '6-4 6-4', sides: [2, 0], totals: { sets: [2, 0], games: [120, 8] } }, p_winner: 1 }), INVALID);
    await fails(db.rpc(w.u.sofi, 'finish_match', { p_match: id, p_score: { text: '6-4 6-4', sides: [2, 0], totals: { sets: [4, 0], games: [12, 8] } }, p_winner: 1 }), INVALID);
    await db.rpc(w.u.sofi, 'admin_correct_result', { p_match: id, p_score: { text: '6-4 6-4', sides: [2, 0], totals: { sets: [2, 0], games: [12, 8], points: [60, 44] } }, p_winner: 1 });
    expect((await matchRow(id)).status).toBe('confirmed');
  });

  it('pickleball: juegos (0–3) o el juego del round robin (puntos 0–99)', async () => {
    const c = await club('pickleball');
    const [a] = await db.rpc<string[]>(w.u.sofi, 'create_matches', { p_league: c.lid, p_matches: [{ format: 'sets', sides: singles(c.p.luis, c.p.ana) }] });
    await db.rpc(w.u.sofi, 'finish_match', { p_match: a, p_score: { text: '11-7 11-9', sides: [2, 0], totals: { sets: [2, 0], games: [2, 0], points: [22, 16] } }, p_winner: 1 });
    expect((await matchRow(a)).status).toBe('confirmed');
    await db.rpc(w.u.sofi, 'create_matches', { p_league: c.lid, p_matches: [{ format: 'americano', sides: singles(c.p.otra, c.p.nuevo) }] });
    await fails(db.rpc(w.u.sofi, 'create_matches', { p_league: c.lid, p_matches: [{ format: 'fiba', sides: singles(c.p.otra, c.p.nuevo) }] }), INVALID);
  });

  it('las ligas de boliche y de pádel no cambian', async () => {
    const padel = await club('padel', 'Pádel Club');
    const [id] = await db.rpc<string[]>(w.u.sofi, 'create_matches', { p_league: padel.lid, p_matches: [{ format: 'americano', sides: singles(padel.p.luis, padel.p.ana) }] });
    expect((await matchRow(id)).format).toBe('americano');
  });
});

describe('nivel NTRP y DUPR', () => {
  it('tenis: NTRP de 1.0 a 7.0 (entero o decimal); null lo quita', async () => {
    const c = await club('tennis');
    await db.rpc(w.u.sofi, 'update_player', { p_player: c.p.luis, p_patch: { attrs: { ntrp: 4.5 } } });
    await db.rpc(w.u.sofi, 'update_player', { p_player: c.p.ana, p_patch: { attrs: { ntrp: 3 } } });
    await db.rpc(w.u.sofi, 'update_player', { p_player: c.p.ana, p_patch: { attrs: { ntrp: null } } });
    for (const bad of [7.5, 0.5, '4.5', true]) await fails(db.rpc(w.u.sofi, 'update_player', { p_player: c.p.otra, p_patch: { attrs: { ntrp: bad } } }), INVALID);
    const rows = await db.admin<{ attrs: Record<string, unknown> }>('select attrs from public.players where id = $1', [c.p.luis]);
    expect(rows[0].attrs).toEqual({ ntrp: 4.5 });
    // Solo el admin cambia el nivel.
    await fails(db.rpc(w.u.luis, 'update_player', { p_player: c.p.luis, p_patch: { attrs: { ntrp: 7 } } }), DENIED);
  });

  it('pickleball: DUPR de 2.0 a 8.0; en otro deporte no se revisa', async () => {
    const c = await club('pickleball');
    await db.rpc(w.u.sofi, 'update_player', { p_player: c.p.luis, p_patch: { attrs: { dupr: 3.752 } } });
    for (const bad of [8.5, 1.9, 'alto']) await fails(db.rpc(w.u.sofi, 'update_player', { p_player: c.p.ana, p_patch: { attrs: { dupr: bad } } }), INVALID);
    const padel = await club('padel', 'Pádel Club');
    await db.rpc(w.u.sofi, 'update_player', { p_player: padel.p.luis, p_patch: { attrs: { dupr: 99, level: 4 } } });
  });
});

describe('round robin social de pickleball', () => {
  const side = (n: 1 | 2, a: string, b: string) => ({ side: n, players: [one(a), one(b)] });

  it('la ronda con save_night_round y los juegos a 11 sin total fijo', async () => {
    const c = await club('pickleball');
    const rr = await createEvent(c, 'americano', {
      format: 'americano',
      players: Object.values(c.p),
      courts: ['Cancha 1'],
      points: { mode: 'game', target: 11 },
      game: { to: 11, winBy: 2 },
    });
    const rules = { match: { sport: 'pickleball', gameTo: 11, bestOf: 1 }, points: { mode: 'game', target: 11 } };
    const ids = await db.rpc<string[]>(w.u.sofi, 'save_night_round', {
      p_event: rr,
      p_round: 1,
      p_matches: [{ court: 'Cancha 1', rules, sides: [side(1, c.p.luis, c.p.ana), side(2, c.p.otra, c.p.nuevo)] }],
      p_rests: [c.p.pedro, c.p.rosa],
    });
    expect(ids).toHaveLength(1);
    const m = await matchRow(ids[0]);
    expect(m).toMatchObject({ format: 'americano', round: 1, require_confirm: false });
    // Un jugador del partido anota 15-13 (suma 28: no hay total fijo).
    expect(await db.rpc(w.u.luis, 'save_points_result', { p_match: ids[0], p_score1: 15, p_score2: 13, p_op_id: randomUUID() })).toEqual({ ok: true, status: 'confirmed' });
    expect((await matchRow(ids[0])).score).toEqual({ text: '15-13', sides: [15, 13] });
    expect((await eventRow(rr)).config).toMatchObject({ round: 1, rests: { '1': [c.p.pedro, c.p.rosa] } });
  });

  it('tenis no tiene noches de puntos', async () => {
    const c = await club('tennis');
    const liga = await createEvent(c, 'liga');
    await fails(
      db.rpc(w.u.sofi, 'save_night_round', { p_event: liga, p_round: 1, p_matches: [{ sides: [side(1, c.p.luis, c.p.ana), side(2, c.p.otra, c.p.nuevo)] }] }),
      INVALID,
    );
  });
});

describe('liga por cajas', () => {
  async function cajas(c: Club, config: Record<string, unknown> = {}) {
    return createEvent(c, 'cajas', { format: 'cajas', ...config });
  }
  const month1 = (c: Club) => ({
    boxes: [
      [c.p.luis, c.p.ana, c.p.otra],
      [c.p.nuevo, c.p.pedro, c.p.rosa],
    ],
    matches: [
      { stage: 'Caja 1', sides: singles(c.p.luis, c.p.ana) },
      { stage: 'Caja 1', sides: singles(c.p.luis, c.p.otra) },
      { stage: 'Caja 1', sides: singles(c.p.ana, c.p.otra) },
      { stage: 'Caja 2', sides: singles(c.p.nuevo, c.p.pedro) },
      { stage: 'Caja 2', sides: singles(c.p.nuevo, c.p.rosa) },
      { stage: 'Caja 2', sides: singles(c.p.pedro, c.p.rosa) },
    ],
  });
  const save = (ev: string, month: number, data: { boxes: unknown; matches: unknown }, extra: Record<string, unknown> = {}, who = w.u.sofi) =>
    db.rpc<string[]>(who, 'save_box_month', { p_event: ev, p_month: month, p_boxes: data.boxes, p_matches: data.matches, p_label: 'Octubre', ...extra });

  it('abre el mes 1: cajas en la configuración y los partidos del mes (evento, ronda, formato sets)', async () => {
    const c = await club('tennis');
    const ev = await cajas(c);
    const ids = await save(ev, 1, month1(c), { p_start: '2026-10-01', p_end: '2026-10-31' });
    expect(ids).toHaveLength(6);
    const e = await eventRow(ev);
    expect(e.player_count).toBe(6);
    expect(e.config).toMatchObject({ format: 'cajas', round: 1, months: [{ n: 1, label: 'Octubre', start: '2026-10-01', end: '2026-10-31', closed: false }] });
    const m = await matchRow(ids[0]);
    expect(m).toMatchObject({ event_id: ev, round: 1, format: 'sets', stage: 'Caja 1', status: 'scheduled', require_confirm: true });
  });

  it('solo el admin; datos que no sirven: invalido', async () => {
    const c = await club('tennis');
    const ev = await cajas(c);
    await fails(save(ev, 1, month1(c), {}, w.u.luis), DENIED);
    await fails(save(ev, 2, month1(c)), INVALID);
    await fails(save(ev, 1, { boxes: [[c.p.luis, c.p.luis]], matches: [] }), INVALID);
    await fails(save(ev, 1, { boxes: [[c.p.luis]], matches: [] }), INVALID);
    await fails(save(ev, 1, { boxes: [[c.p.luis, 'x']], matches: [] }), INVALID);
    await fails(save(ev, 1, { boxes: [[c.p.luis, w.p.pedro]], matches: [] }), INVALID);
    await fails(save(ev, 1, { boxes: 'todos', matches: [] }), INVALID);
    const liga = await createEvent(c, 'liga');
    await fails(save(liga, 1, month1(c)), INVALID);
    await fails(db.rpc(w.u.sofi, 'save_box_month', { p_event: randomUUID(), p_month: 1, p_boxes: [] }), 'no_existe');
  });

  it('rehacer el mes abierto si nadie empezó; empezado: cerrado', async () => {
    const c = await club('tennis');
    const ev = await cajas(c);
    const first = await save(ev, 1, month1(c));
    const again = await save(ev, 1, month1(c));
    expect(await db.count('public.matches', 'event_id = $1', [ev])).toBe(6);
    expect(await db.count('public.matches', 'id = any ($1)', [first])).toBe(0);
    await db.rpc(w.u.sofi, 'admin_correct_result', { p_match: again[0], p_score: { text: '6-4 6-4', sides: [2, 0] }, p_winner: 1 });
    await fails(save(ev, 1, month1(c)), 'cerrado');
  });

  it('cerrar el mes: lo no jugado queda anulado, se guardan subidas y bajadas y se abre el mes 2', async () => {
    const c = await club('tennis');
    const ev = await cajas(c);
    const ids = await save(ev, 1, month1(c));
    await db.rpc(w.u.sofi, 'admin_correct_result', { p_match: ids[0], p_score: { text: '6-4 6-4', sides: [2, 0] }, p_winner: 1 });
    const moves = [
      { id: c.p.otra, from: 0, to: 1, move: 'baja' },
      { id: c.p.nuevo, from: 1, to: 0, move: 'sube' },
    ];
    const next = {
      boxes: [
        [c.p.luis, c.p.ana, c.p.nuevo],
        [c.p.otra, c.p.pedro, c.p.rosa],
      ],
      matches: [{ stage: 'Caja 1', sides: singles(c.p.luis, c.p.nuevo) }],
    };
    const ids2 = await save(ev, 2, next, { p_moves: moves, p_label: 'Noviembre' });
    expect(ids2).toHaveLength(1);
    expect((await matchRow(ids[0])).status).toBe('confirmed');
    expect((await matchRow(ids[1])).status).toBe('void');
    expect((await matchRow(ids2[0])).round).toBe(2);
    const e = await eventRow(ev);
    const months = (e.config as { months: Record<string, unknown>[] }).months;
    expect(months).toHaveLength(2);
    expect(months[0]).toMatchObject({ n: 1, closed: true, moves });
    expect(months[1]).toMatchObject({ n: 2, label: 'Noviembre', closed: false });
    // El mes 1 ya cerró: no se rehace.
    await fails(save(ev, 1, month1(c)), INVALID);
  });

  it('dobles: cajas de parejas de temporada', async () => {
    const c = await club('pickleball');
    const team = (name: string, a: string, b: string) => db.rpc<string>(w.u.sofi, 'create_season_team', { p_league: c.lid, p_name: name, p_players: [one(a), one(b)] });
    const t1 = await team('A', c.p.luis, c.p.ana);
    const t2 = await team('B', c.p.otra, c.p.nuevo);
    const ev = await cajas(c, { doubles: true });
    const ids = await save(ev, 1, { boxes: [[t1, t2]], matches: [{ stage: 'Caja 1', sides: [{ side: 1, team_id: t1 }, { side: 2, team_id: t2 }] }] });
    expect(ids).toHaveLength(1);
    // Un jugador de la pareja anota; el rival confirma.
    await db.rpc(w.u.luis, 'finish_match', { p_match: ids[0], p_score: { text: '11-7', sides: [1, 0] }, p_winner: 1 });
    await db.rpc(w.u.otra, 'confirm_result', { p_match: ids[0] });
    expect((await matchRow(ids[0])).status).toBe('confirmed');
  });
});
