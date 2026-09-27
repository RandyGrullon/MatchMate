/**
 * Golf (fase 6): campos con validación, copia del campo en cada ronda, torneos de varias rondas, inscripción
 * con Index congelado y handicap WHS (igual que el motor src/sports/golf), grupos, tarjeta por grupo con la
 * cola (p_op_id), firma, cierre, RLS y league_id verificado.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';
import { DEMO_COURSE } from '../../src/sports/golf/demo';
import { handicapFor, type GolfCourse } from '../../src/sports/golf/course';

let db: TestDb;
let w: World;

/** Liga de golf privada: dueño org, admin sofi, miembros luis, ana y extra (con jugador), pedro sin cuenta. */
interface Golf {
  lid: string;
  pub: string;
  course: string;
  p: { luis: string; ana: string; pedro: string; extra: string; org: string };
}
let g: Golf;

const holesOf = (c: GolfCourse) => c.holes.map((h) => ({ par: h.par, si: h.si }));
const teesOf = (c: GolfCourse) => JSON.parse(JSON.stringify(c.tees));

async function makeGolf(): Promise<Golf> {
  const lid = await league(db, w.u.org, { name: 'Golf del Club', visibility: 'private', sport: 'golf', requirePhoto: false });
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  await member(db, lid, w.u.luis, 'member', 'luis');
  await member(db, lid, w.u.ana, 'member', 'ana');
  await member(db, lid, w.u.extra, 'member', 'extra');
  const p = {
    org: await player(db, lid, 'Org', w.u.org),
    luis: await player(db, lid, 'Luis', w.u.luis),
    ana: await player(db, lid, 'Ana', w.u.ana),
    extra: await player(db, lid, 'Extra', w.u.extra),
    pedro: await player(db, lid, 'Pedro'),
  };
  const pub = await league(db, w.u.otro, { name: 'Golf Abierto', visibility: 'public', sport: 'golf', requirePhoto: false });
  await member(db, pub, w.u.otro, 'owner', 'otro');
  const course = await db.rpc<string>(w.u.sofi, 'golf_save_course', {
    p_league: lid,
    p_name: 'Campo de ejemplo',
    p_holes: holesOf(DEMO_COURSE),
    p_tees: teesOf(DEMO_COURSE),
  });
  return { lid, pub, course, p };
}

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
  g = await makeGolf();
});
afterEach(async () => {
  await db.rollback();
});

const round = (who: string, extra: Record<string, unknown> = {}) =>
  db.rpc<string>(who, 'golf_create_round', { p_league: g.lid, p_date: '2026-10-10', p_course: g.course, ...extra });

async function card(eventId: string, playerId: string) {
  const rows = await db.admin<{
    id: string;
    tee_id: string;
    hcp_index: number | null;
    course_hcp: number;
    playing_hcp: number;
    group_no: number | null;
    start_hole: number;
    strokes: (number | null)[];
    putts: (number | null)[];
    picked_up: boolean[];
    status: string;
    dq: boolean;
    scored_at: string | null;
  }>('select * from public.golf_cards where event_id = $1 and player_id = $2', [eventId, playerId]);
  return rows[0];
}

const save = (who: string, eventId: string, cards: unknown[], op = randomUUID()) =>
  db.rpc<number>(who, 'golf_save_hole_scores', { p_op_id: op, p_event: eventId, p_cards: cards });

/** Todos los hoyos con golpes = par (y 2 putts). */
const parHoles = (n = 18, pars = DEMO_COURSE.holes.map((h) => h.par)) => Array.from({ length: n }, (_, i) => ({ i, s: pars[i], p: 2 }));

describe('campos', () => {
  it('el admin guarda un campo limpio (sin claves de más); un miembro no', async () => {
    const [c] = await db.admin<{ holes: unknown[]; tees: Record<string, unknown>[] }>('select holes, tees from public.golf_courses where id = $1', [g.course]);
    expect(c.holes).toHaveLength(18);
    expect(c.tees.map((t) => t.id)).toEqual(['azul', 'roja']);
    expect(c.tees[0]).toMatchObject({ rating: 71.2, slope: 128, par: 72, front9: { rating: 35.8, slope: 130, par: 36 } });
    const tees = teesOf(DEMO_COURSE);
    tees[0].color = 'azul';
    await db.rpc(w.u.sofi, 'golf_save_course', { p_league: g.lid, p_id: g.course, p_name: 'Otro nombre', p_holes: holesOf(DEMO_COURSE), p_tees: tees });
    const [d] = await db.admin<{ name: string; tees: Record<string, unknown>[] }>('select name, tees from public.golf_courses where id = $1', [g.course]);
    expect(d.name).toBe('Otro nombre');
    expect(d.tees[0].color).toBeUndefined();
    await fails(
      db.rpc(w.u.luis, 'golf_save_course', { p_league: g.lid, p_name: 'X', p_holes: holesOf(DEMO_COURSE), p_tees: teesOf(DEMO_COURSE) }),
      DENIED,
    );
  });

  it('valida hoyos, SI, par, slope, rating y el par de cada salida', async () => {
    const bad = async (holes: unknown, tees: unknown) =>
      fails(db.rpc(w.u.sofi, 'golf_save_course', { p_league: g.lid, p_name: 'Malo', p_holes: holes, p_tees: tees }), INVALID);
    const h = holesOf(DEMO_COURSE);
    const t = teesOf(DEMO_COURSE);
    await bad(h.slice(0, 10), t); // 10 hoyos
    await bad(h.map((x, i) => (i === 1 ? { ...x, si: h[0].si } : x)), t); // SI repetido
    await bad(h.map((x, i) => (i === 0 ? { ...x, par: 7 } : x)), t); // par 7
    await bad(h, [{ ...t[0], slope: 200 }]); // slope fuera de 55–155
    await bad(h, [{ ...t[0], par: 71 }]); // el par no es la suma de los hoyos
    await bad(h, [{ ...t[0], rating: 99 }]); // rating que no cuadra con el par
    await bad(h, [t[0], t[0]]); // salida repetida
    await bad(h, []); // sin salidas
    await bad(h, [{ ...t[0], front9: { rating: 35.8, slope: 130, par: 35 } }]); // par de la ida mal
    await bad(h, [{ ...t[0], sis: [1, 2, 3] }]); // SI de damas incompletos
    await bad(h.map((x) => ({ ...x, par: `${x.par}` })), t); // texto en vez de número
    // 9 hoyos con SI impares vale; con rating por vuelta no.
    const nine = h.slice(0, 9).map((x, i) => ({ par: x.par, si: i * 2 + 1 }));
    const par9 = nine.reduce((a, x) => a + x.par, 0);
    expect(await db.rpc(w.u.sofi, 'golf_save_course', { p_league: g.lid, p_name: 'Nueve', p_holes: nine, p_tees: [{ id: 'b', name: 'Blancas', rating: 35.1, slope: 120, par: par9 }] })).toBeTruthy();
    await bad(nine, [{ id: 'b', name: 'Blancas', rating: 35.1, slope: 120, par: par9, front9: { rating: 35, slope: 120, par: par9 } }]);
  });

  it('solo en ligas de golf', async () => {
    await fails(
      db.rpc(w.u.org, 'golf_save_course', { p_league: w.priv, p_name: 'X', p_holes: holesOf(DEMO_COURSE), p_tees: teesOf(DEMO_COURSE) }),
      'invalido',
    );
    await fails(db.rpc(w.u.org, 'create_event', { p_league: g.lid, p_type: 'practica', p_date: '2026-10-01' }), 'invalido');
  });

  it('borrar el campo no toca las rondas: guardan su copia', async () => {
    const e = await round(w.u.sofi);
    await db.rpc(w.u.sofi, 'golf_delete_course', { p_course: g.course });
    const [r] = await db.admin<{ course_id: string | null; course_name: string; holes: number }>('select course_id, course_name, holes from public.golf_rounds where event_id = $1', [e]);
    expect(r).toEqual({ course_id: null, course_name: 'Campo de ejemplo', holes: 18 });
  });
});

describe('rondas y torneos', () => {
  it('la ronda copia el campo: editarlo después no cambia la ronda', async () => {
    const e = await round(w.u.sofi, { p_name: 'Mensual', p_competition: { format: 'stableford', basis: 'net', allowance: 95 } });
    const [ev] = await db.admin<{ type: string; name: string }>('select type, name from public.events where id = $1', [e]);
    expect(ev).toEqual({ type: 'ronda', name: 'Mensual' });
    const holes = holesOf(DEMO_COURSE).map((h, i) => (i === 0 ? { ...h, par: 5 } : h));
    const tees = teesOf(DEMO_COURSE).map((t: { par: number; front9?: { par: number } }) => ({ ...t, par: t.par + 1, ...(t.front9 ? { front9: { ...t.front9, par: t.front9.par + 1 } } : {}) }));
    tees[1].pars[0] = 5;
    await db.rpc(w.u.sofi, 'golf_save_course', { p_league: g.lid, p_id: g.course, p_name: 'Campo nuevo', p_holes: holes, p_tees: tees });
    const [r] = await db.admin<{ course: GolfCourse; competition: Record<string, unknown> }>('select course, competition from public.golf_rounds where event_id = $1', [e]);
    expect(r.course.holes[0].par).toBe(4);
    expect(r.course.name).toBe('Campo de ejemplo');
    expect(r.competition).toEqual({ format: 'stableford', basis: 'net', allowance: 95 });
  });

  it('competencia por defecto: la de la liga, o stroke neto al 95 %', async () => {
    const e1 = await round(w.u.sofi);
    await db.admin(`update public.leagues set rules = '{"competition": {"format": "stableford", "basis": "gross", "allowance": 100}}' where id = $1`, [g.lid]);
    const e2 = await round(w.u.sofi);
    const rows = await db.admin<{ event_id: string; competition: unknown }>('select event_id, competition from public.golf_rounds where event_id = any ($1)', [[e1, e2]]);
    const byId = Object.fromEntries(rows.map((r) => [r.event_id, r.competition]));
    expect(byId[e1]).toEqual({ format: 'stroke', basis: 'net', allowance: 95 });
    expect(byId[e2]).toEqual({ format: 'stableford', basis: 'gross', allowance: 100 });
    await fails(round(w.u.sofi, { p_competition: { format: 'matchplay' } }), INVALID);
    await fails(round(w.u.luis), DENIED);
    await fails(round(w.u.sofi, { p_nine: 'medio' }), INVALID);
  });

  it('torneo de 2 rondas: numeradas y agrupadas; borrarlo borra sus rondas', async () => {
    const ids = [randomUUID(), randomUUID()];
    const r = await db.rpc<{ tournament_id: string; event_ids: string[] }>(w.u.sofi, 'golf_create_tournament', {
      p_league: g.lid,
      p_name: 'Copa del Club',
      p_dates: ['2026-11-07', '2026-11-08'],
      p_course: g.course,
      p_event_ids: ids,
    });
    expect(r.event_ids).toEqual(ids);
    const rounds = await db.admin<{ event_id: string; round_no: number; tournament_id: string; name: string }>(
      'select r.event_id, r.round_no, r.tournament_id, e.name from public.golf_rounds r join public.events e on e.id = r.event_id where r.tournament_id = $1 order by r.round_no',
      [r.tournament_id],
    );
    expect(rounds.map((x) => [x.event_id, x.round_no, x.name])).toEqual([
      [ids[0], 1, 'Copa del Club · Ronda 1'],
      [ids[1], 2, 'Copa del Club · Ronda 2'],
    ]);
    await fails(db.rpc(w.u.sofi, 'golf_create_tournament', { p_league: g.lid, p_name: 'X', p_dates: [], p_course: g.course }), INVALID);
    await db.rpc(w.u.sofi, 'golf_delete_tournament', { p_tournament: r.tournament_id });
    expect(await db.count('public.events', 'id = any ($1)', [ids])).toBe(0);
  });

  it('un evento de golf creado sin campo lo recibe con golf_update_round; el campo no cambia con tarjetas anotadas', async () => {
    const e = await db.rpc<string>(w.u.sofi, 'create_event', { p_league: g.lid, p_type: 'ronda', p_date: '2026-10-03' });
    await fails(db.rpc(w.u.sofi, 'golf_register', { p_event: e }), INVALID);
    await fails(db.rpc(w.u.sofi, 'golf_update_round', { p_event: e, p_patch: { nine: 'front' } }), INVALID);
    await db.rpc(w.u.sofi, 'golf_update_round', { p_event: e, p_patch: { course: g.course, nine: 'front' } });
    const c = await db.rpc<string>(w.u.luis, 'golf_register', { p_event: e, p_tee: 'azul', p_index: 14.1 });
    expect((await card(e, g.p.luis)).strokes).toHaveLength(9);
    // Cambiar a los 18 mientras nadie anotó: la tarjeta se ajusta.
    await db.rpc(w.u.sofi, 'golf_update_round', { p_event: e, p_patch: { nine: 'all' } });
    expect((await card(e, g.p.luis)).strokes).toHaveLength(18);
    await save(w.u.luis, e, [{ card_id: c, holes: [{ i: 0, s: 5 }] }]);
    await fails(db.rpc(w.u.sofi, 'golf_update_round', { p_event: e, p_patch: { nine: 'back' } }), INVALID);
    // La competencia sí cambia (y el handicap de juego con el %).
    await db.rpc(w.u.sofi, 'golf_update_round', { p_event: e, p_patch: { competition: { format: 'stroke', basis: 'net', allowance: 100 } } });
    expect((await card(e, g.p.luis)).playing_hcp).toBe(handicapFor(14.1, DEMO_COURSE, 'azul', { allowance: 100 }).playingHcp);
  });
});

describe('inscripción y handicap (igual que el motor)', () => {
  it('cada quien se inscribe con su salida e Index; el handicap sale como en course.ts', async () => {
    const e = await round(w.u.sofi);
    await db.rpc(w.u.luis, 'golf_register', { p_event: e, p_tee: 'azul', p_index: 10.4 });
    await db.rpc(w.u.ana, 'golf_register', { p_event: e, p_tee: 'roja', p_index: -2.1 });
    const l = await card(e, g.p.luis);
    const a = await card(e, g.p.ana);
    const hl = handicapFor(10.4, DEMO_COURSE, 'azul');
    const ha = handicapFor(-2.1, DEMO_COURSE, 'roja');
    expect(l.course_hcp).toBeCloseTo(hl.courseHcp, 9);
    expect(l.playing_hcp).toBe(hl.playingHcp);
    expect(a.course_hcp).toBeCloseTo(ha.courseHcp, 9);
    expect(a.playing_hcp).toBe(ha.playingHcp);
    expect(l.strokes).toEqual(Array(18).fill(null));
    expect(l.picked_up).toEqual(Array(18).fill(false));
    expect(l.start_hole).toBe(1);
  });

  it('9 hoyos: rating de la vuelta o estimado, como el motor', async () => {
    for (const [nine, tee, index] of [
      ['front', 'azul', 14.1],
      ['back', 'azul', 22.7],
      ['front', 'roja', 18.3],
      ['back', 'roja', 5],
    ] as const) {
      const e = await round(w.u.sofi, { p_nine: nine });
      await db.rpc(w.u.sofi, 'golf_register', { p_event: e, p_player: g.p.pedro, p_tee: tee, p_index: index });
      const c = await card(e, g.p.pedro);
      const h = handicapFor(index, DEMO_COURSE, tee, { nine });
      expect(c.course_hcp, `${nine} ${tee}`).toBeCloseTo(h.courseHcp, 9);
      expect(c.playing_hcp, `${nine} ${tee}`).toBe(h.playingHcp);
      expect(c.strokes).toHaveLength(9);
      expect(c.start_hole).toBe(nine === 'back' ? 10 : 1);
    }
  });

  it('el Index queda congelado: cambiar el del perfil no toca la tarjeta; sin Index sale el del perfil', async () => {
    await db.rpc(w.u.luis, 'golf_set_index', { p_player: g.p.luis, p_index: 12.34 });
    const [p] = await db.admin<{ attrs: { golf: { index: number } } }>('select attrs from public.players where id = $1', [g.p.luis]);
    expect(p.attrs.golf.index).toBe(12.3);
    const e = await round(w.u.sofi);
    await db.rpc(w.u.luis, 'golf_register', { p_event: e });
    expect((await card(e, g.p.luis)).hcp_index).toBe(12.3);
    expect((await card(e, g.p.luis)).tee_id).toBe('azul');
    await db.rpc(w.u.luis, 'golf_set_index', { p_player: g.p.luis, p_index: 20 });
    expect((await card(e, g.p.luis)).hcp_index).toBe(12.3);
    // Otro miembro no cambia el Index de nadie; el admin sí.
    await fails(db.rpc(w.u.ana, 'golf_set_index', { p_player: g.p.luis, p_index: 3 }), DENIED);
    await db.rpc(w.u.sofi, 'golf_set_index', { p_player: g.p.pedro, p_index: 30 });
    await fails(db.rpc(w.u.luis, 'golf_set_index', { p_player: g.p.luis, p_index: 60 }), INVALID);
    await db.rpc(w.u.luis, 'golf_set_index', { p_player: g.p.luis, p_index: null });
    const [q] = await db.admin<{ attrs: Record<string, unknown> }>('select attrs from public.players where id = $1', [g.p.luis]);
    expect(q.attrs.golf).toBeUndefined();
  });

  it('permisos y datos: a otro solo el admin; Index y salida válidos; ronda cerrada', async () => {
    const e = await round(w.u.sofi);
    await fails(db.rpc(w.u.luis, 'golf_register', { p_event: e, p_player: g.p.pedro }), DENIED);
    await fails(db.rpc(w.u.nuevo, 'golf_register', { p_event: e }), DENIED);
    await fails(db.rpc(w.u.luis, 'golf_register', { p_event: e, p_index: 55 }), INVALID);
    await fails(db.rpc(w.u.luis, 'golf_register', { p_event: e, p_tee: 'verde' }), INVALID);
    expect(await db.rpc<number>(w.u.sofi, 'golf_add_players', { p_event: e, p_players: [{ player_id: g.p.pedro, tee_id: 'roja', index: 20 }, { player_id: g.p.ana }] })).toBe(2);
    expect(await db.rpc<number>(w.u.sofi, 'golf_add_players', { p_event: e, p_players: [{ player_id: g.p.pedro }] })).toBe(0);
    expect((await card(e, g.p.pedro)).tee_id).toBe('roja');
    // Jugador de otra liga: no existe aquí.
    await fails(db.rpc(w.u.sofi, 'golf_register', { p_event: e, p_player: w.p.luis }), 'no_existe');
    await db.rpc(w.u.sofi, 'golf_close_round', { p_event: e });
    await fails(db.rpc(w.u.luis, 'golf_register', { p_event: e }), 'cerrado');
  });

  it('salirse: el jugador sin anotar; con golpes solo el admin', async () => {
    const e = await round(w.u.sofi);
    const c = await db.rpc<string>(w.u.luis, 'golf_register', { p_event: e });
    expect((await db.admin<{ player_count: number }>('select player_count from public.events where id = $1', [e]))[0].player_count).toBe(1);
    await fails(db.rpc(w.u.ana, 'golf_unregister', { p_card: c }), DENIED);
    await save(w.u.luis, e, [{ card_id: c, holes: [{ i: 0, s: 4 }] }]);
    await fails(db.rpc(w.u.luis, 'golf_unregister', { p_card: c }), 'cerrado');
    await fails(db.rpc(w.u.luis, 'golf_register', { p_event: e, p_tee: 'roja' }), 'cerrado');
    await db.rpc(w.u.sofi, 'golf_unregister', { p_card: c });
    expect(await card(e, g.p.luis)).toBeUndefined();
    expect((await db.admin<{ player_count: number }>('select player_count from public.events where id = $1', [e]))[0].player_count).toBe(0);
  });

  it('el Index congelado no se cambia vaciando la tarjeta y volviéndose a inscribir (scored_at)', async () => {
    const e = await round(w.u.sofi);
    const c = await db.rpc<string>(w.u.luis, 'golf_register', { p_event: e, p_index: 5 });
    expect((await card(e, g.p.luis)).scored_at).toBeNull();
    await save(w.u.luis, e, [{ card_id: c, holes: Array.from({ length: 9 }, (_, i) => ({ i, s: 6 })) }]);
    await fails(db.rpc(w.u.luis, 'golf_register', { p_event: e, p_index: 30 }), 'cerrado');
    // Borra todos los hoyos (golpes null): la tarjeta queda vacía, pero ya se anotó en ella.
    await save(w.u.luis, e, [{ card_id: c, holes: Array.from({ length: 18 }, (_, i) => ({ i, s: null })) }]);
    const blank = await card(e, g.p.luis);
    expect(blank.strokes).toEqual(Array(18).fill(null));
    expect(blank.scored_at).not.toBeNull();
    await fails(db.rpc(w.u.luis, 'golf_register', { p_event: e, p_index: 30 }), 'cerrado');
    await fails(db.rpc(w.u.luis, 'golf_register', { p_event: e, p_tee: 'roja' }), 'cerrado');
    // Salirse y volver a entrar tampoco sirve: no se puede salir.
    await fails(db.rpc(w.u.luis, 'golf_unregister', { p_card: c }), 'cerrado');
    expect(await card(e, g.p.luis)).toMatchObject({ hcp_index: 5, tee_id: 'azul', playing_hcp: handicapFor(5, DEMO_COURSE, 'azul').playingHcp });
    // «Recogió» también cuenta como anotar, aunque después se deshaga.
    const a = await db.rpc<string>(w.u.ana, 'golf_register', { p_event: e, p_index: 10 });
    await save(w.u.ana, e, [{ card_id: a, holes: [{ i: 0, u: true }] }]);
    await save(w.u.ana, e, [{ card_id: a, holes: [{ i: 0, u: false }] }]);
    await fails(db.rpc(w.u.ana, 'golf_register', { p_event: e, p_index: 30 }), 'cerrado');
    // El admin sí la cambia.
    await db.rpc(w.u.sofi, 'golf_register', { p_event: e, p_player: g.p.luis, p_index: 30 });
    expect((await card(e, g.p.luis)).hcp_index).toBe(30);
    // El admin cambia los hoyos de la ronda (tarjetas nuevas, vacías): vuelven a estar sin anotar.
    await db.rpc(w.u.sofi, 'golf_update_round', { p_event: e, p_patch: { nine: 'front' } });
    expect((await card(e, g.p.luis)).scored_at).toBeNull();
    await db.rpc(w.u.luis, 'golf_register', { p_event: e, p_tee: 'roja' });
    expect((await card(e, g.p.luis)).tee_id).toBe('roja');
  });
});

describe('grupos y tarjeta por grupo', () => {
  let e: string;
  let c: { luis: string; ana: string; pedro: string; extra: string };

  beforeEach(async () => {
    e = await round(w.u.sofi, { p_competition: { format: 'stableford', basis: 'net' } });
    c = {
      luis: await db.rpc<string>(w.u.luis, 'golf_register', { p_event: e, p_index: 10 }),
      ana: await db.rpc<string>(w.u.ana, 'golf_register', { p_event: e, p_index: 20 }),
      pedro: await db.rpc<string>(w.u.sofi, 'golf_register', { p_event: e, p_player: g.p.pedro }),
      extra: await db.rpc<string>(w.u.extra, 'golf_register', { p_event: e }),
    };
    await db.rpc(w.u.sofi, 'golf_set_groups', {
      p_event: e,
      p_groups: [
        { card_id: c.luis, group_no: 1 },
        { card_id: c.ana, group_no: 1 },
        { card_id: c.pedro, group_no: 2, start_hole: 10 },
      ],
    });
  });

  it('grupos: solo el admin, hasta 4 por grupo, hoyo de salida de la ronda', async () => {
    expect((await card(e, g.p.pedro)).start_hole).toBe(10);
    await fails(db.rpc(w.u.luis, 'golf_set_groups', { p_event: e, p_groups: [{ card_id: c.luis, group_no: 2 }] }), DENIED);
    const extraCards = [g.p.org].map((pid) => db.rpc<string>(w.u.sofi, 'golf_register', { p_event: e, p_player: pid }));
    const org = await extraCards[0];
    await fails(
      db.rpc(w.u.sofi, 'golf_set_groups', { p_event: e, p_groups: [c.luis, c.ana, c.pedro, c.extra, org].map((id) => ({ card_id: id, group_no: 3 })) }),
      'invalido',
    );
    await fails(db.rpc(w.u.sofi, 'golf_set_groups', { p_event: e, p_groups: [{ card_id: c.luis, start_hole: 19 }] }), INVALID);
    await fails(db.rpc(w.u.sofi, 'golf_set_groups', { p_event: e, p_groups: [{ card_id: randomUUID(), group_no: 1 }] }), 'invalido');
  });

  it('un inscrito anota su tarjeta y las de su grupo, no las de otro grupo', async () => {
    const n = await save(w.u.luis, e, [
      { card_id: c.luis, holes: [{ i: 0, s: 5, p: 2 }, { i: 1, s: 4 }] },
      { card_id: c.ana, holes: [{ i: 0, s: 6 }, { i: 1, u: true }] },
    ]);
    expect(n).toBe(4);
    const l = await card(e, g.p.luis);
    expect(l.strokes.slice(0, 3)).toEqual([5, 4, null]);
    expect(l.putts.slice(0, 2)).toEqual([2, null]);
    const a = await card(e, g.p.ana);
    expect(a.strokes.slice(0, 2)).toEqual([6, null]);
    expect(a.picked_up.slice(0, 2)).toEqual([false, true]);
    // Solo cambia los hoyos que manda.
    await save(w.u.ana, e, [{ card_id: c.luis, holes: [{ i: 2, s: 3 }] }]);
    expect((await card(e, g.p.luis)).strokes.slice(0, 3)).toEqual([5, 4, 3]);
    await fails(save(w.u.luis, e, [{ card_id: c.pedro, holes: [{ i: 0, s: 4 }] }]), DENIED);
    // Sin grupo: solo la suya.
    await fails(save(w.u.extra, e, [{ card_id: c.luis, holes: [{ i: 0, s: 4 }] }]), DENIED);
    expect(await save(w.u.extra, e, [{ card_id: c.extra, holes: [{ i: 0, s: 4 }] }])).toBe(1);
    // Alguien de la liga sin tarjeta en la ronda, o de fuera: no.
    await member(db, g.lid, w.u.otra, 'member', 'otra');
    await player(db, g.lid, 'Otra', w.u.otra);
    await fails(save(w.u.otra, e, [{ card_id: c.luis, holes: [{ i: 0, s: 4 }] }]), DENIED);
    await fails(save(w.u.nuevo, e, [{ card_id: c.luis, holes: [{ i: 0, s: 4 }] }]), DENIED);
    await fails(save(ANON, e, [{ card_id: c.luis, holes: [{ i: 0, s: 4 }] }]), DENIED);
  });

  it('el admin y el anotador de la liga anotan cualquier tarjeta', async () => {
    await db.admin('update public.league_members set is_scorer = true where league_id = $1 and user_id = $2', [g.lid, w.u.org]);
    expect(await save(w.u.org, e, [{ card_id: c.pedro, holes: [{ i: 9, s: 4 }] }])).toBe(1);
    expect(await save(w.u.sofi, e, [{ card_id: c.extra, holes: [{ i: 17, s: 4 }] }])).toBe(1);
  });

  it('golpes 1–20, putts 0–10 y menos que los golpes, recoger sin golpes, hoyo de la ronda', async () => {
    const bad = (holes: unknown[]) => fails(save(w.u.luis, e, [{ card_id: c.luis, holes }]), INVALID);
    await bad([{ i: 0, s: 0 }]);
    await bad([{ i: 0, s: 21 }]);
    await bad([{ i: 0, s: 4.5 }]);
    await bad([{ i: 0, s: '4' }]);
    await bad([{ i: 0, s: 4, p: 4 }]);
    await bad([{ i: 0, s: 4, p: 11 }]);
    await bad([{ i: 0, s: 4, u: true }]);
    await bad([{ i: 18, s: 4 }]);
    await bad([{ i: 0, u: 'sí' }]);
    await fails(save(w.u.luis, randomUUID(), [{ card_id: c.luis, holes: [{ i: 0, s: 4 }] }]), 'no_existe');
    // Tarjeta de otra ronda.
    const e2 = await round(w.u.sofi);
    await fails(save(w.u.sofi, e2, [{ card_id: c.luis, holes: [{ i: 0, s: 4 }] }]), 'invalido');
    // Sin p_op_id no (es de la cola).
    await fails(db.rpc(w.u.luis, 'golf_save_hole_scores', { p_op_id: null, p_event: e, p_cards: [] }), 'invalido');
    // Borrar un hoyo: golpes null.
    await save(w.u.luis, e, [{ card_id: c.luis, holes: [{ i: 0, s: 5 }] }]);
    await save(w.u.luis, e, [{ card_id: c.luis, holes: [{ i: 0, s: null }] }]);
    expect((await card(e, g.p.luis)).strokes[0]).toBeNull();
  });

  it('reintentar con el mismo p_op_id no repite; con otra función es duplicado', async () => {
    const op = randomUUID();
    expect(await save(w.u.luis, e, [{ card_id: c.luis, holes: [{ i: 0, s: 5 }] }], op)).toBe(1);
    // Otro teléfono corrige el hoyo; el reintento del primero no lo pisa.
    await save(w.u.ana, e, [{ card_id: c.luis, holes: [{ i: 0, s: 6 }] }]);
    expect(await save(w.u.luis, e, [{ card_id: c.luis, holes: [{ i: 0, s: 5 }] }], op)).toBe(1);
    expect((await card(e, g.p.luis)).strokes[0]).toBe(6);
    await fails(db.rpc(w.u.luis, 'golf_sign_card', { p_card: c.luis, p_op_id: op }), 'duplicado');
    await fails(save(w.u.ana, e, [{ card_id: c.ana, holes: [{ i: 0, s: 5 }] }], op), 'duplicado');
  });

  it('firmar: completa, el jugador o el admin; firmada solo la cambia el admin', async () => {
    await fails(db.rpc(w.u.luis, 'golf_sign_card', { p_card: c.luis }), 'invalido');
    await save(w.u.ana, e, [{ card_id: c.luis, holes: parHoles() }]);
    await fails(db.rpc(w.u.ana, 'golf_sign_card', { p_card: c.luis }), DENIED);
    await db.rpc(w.u.luis, 'golf_sign_card', { p_card: c.luis, p_op_id: randomUUID() });
    const l = await card(e, g.p.luis);
    expect(l.status).toBe('firmada');
    await fails(save(w.u.ana, e, [{ card_id: c.luis, holes: [{ i: 0, s: 3 }] }]), 'cerrado');
    await fails(save(w.u.luis, e, [{ card_id: c.luis, holes: [{ i: 0, s: 3 }] }]), 'cerrado');
    await fails(db.rpc(w.u.luis, 'golf_sign_card', { p_card: c.luis, p_signed: false }), DENIED);
    expect(await save(w.u.sofi, e, [{ card_id: c.luis, holes: [{ i: 0, s: 3 }] }])).toBe(1);
    await db.rpc(w.u.sofi, 'golf_sign_card', { p_card: c.luis, p_signed: false });
    expect((await card(e, g.p.luis)).status).toBe('abierta');
    // Recoger cuenta como hoyo terminado para firmar.
    await save(w.u.luis, e, [{ card_id: c.ana, holes: parHoles().map((h, i) => (i === 5 ? { i, u: true } : h)) }]);
    await db.rpc(w.u.ana, 'golf_sign_card', { p_card: c.ana });
  });

  it('la firma lleva los hoyos revisados: firma aunque los hoyos de la cola no hayan llegado antes', async () => {
    const pars = DEMO_COURSE.holes.map((h) => h.par);
    // Luis firma su tarjeta vacía en el servidor con los 18 hoyos que revisó en el teléfono.
    await db.rpc(w.u.luis, 'golf_sign_card', { p_card: c.luis, p_op_id: randomUUID(), p_holes: parHoles() });
    const l = await card(e, g.p.luis);
    expect(l.status).toBe('firmada');
    expect(l.strokes).toEqual(pars);
    expect(l.putts).toEqual(Array(18).fill(2));
    expect(l.scored_at).not.toBeNull();
    // Los hoyos que llegan después por la cola ya no la cambian.
    await fails(save(w.u.luis, e, [{ card_id: c.luis, holes: [{ i: 0, s: 9 }] }]), 'cerrado');
    // Ya firmada: otra firma con otros hoyos no los toca.
    await db.rpc(w.u.luis, 'golf_sign_card', { p_card: c.luis, p_holes: parHoles().map((h) => ({ ...h, s: h.s + 1 })) });
    expect((await card(e, g.p.luis)).strokes).toEqual(pars);
    // Solo el jugador o el admin firman: otro del grupo no escribe la tarjeta por aquí.
    await fails(db.rpc(w.u.luis, 'golf_sign_card', { p_card: c.ana, p_holes: parHoles() }), DENIED);
    // Incompleta o con hoyos malos: no firma ni guarda nada.
    await fails(db.rpc(w.u.ana, 'golf_sign_card', { p_card: c.ana, p_holes: parHoles(17) }), 'invalido');
    await fails(db.rpc(w.u.ana, 'golf_sign_card', { p_card: c.ana, p_holes: [{ i: 0, s: 0 }] }), INVALID);
    await fails(db.rpc(w.u.ana, 'golf_sign_card', { p_card: c.ana, p_holes: parHoles().concat([{ i: 0, s: 4, p: 2 }]) }), INVALID);
    const a = await card(e, g.p.ana);
    expect([a.status, a.strokes, a.scored_at]).toEqual(['abierta', Array(18).fill(null), null]);
    // El admin firma la de Pedro (sin cuenta) con sus hoyos.
    await db.rpc(w.u.sofi, 'golf_sign_card', { p_card: c.pedro, p_holes: parHoles() });
    expect((await card(e, g.p.pedro)).status).toBe('firmada');
  });

  it('cerrar la ronda: nadie anota ni firma; se puede volver a abrir; descalificar es del admin', async () => {
    await fails(db.rpc(w.u.luis, 'golf_close_round', { p_event: e }), DENIED);
    await fails(db.rpc(w.u.luis, 'golf_set_dq', { p_card: c.ana, p_dq: true }), DENIED);
    await db.rpc(w.u.sofi, 'golf_set_dq', { p_card: c.ana, p_dq: true });
    expect((await card(e, g.p.ana)).dq).toBe(true);
    await db.rpc(w.u.sofi, 'golf_close_round', { p_event: e });
    await fails(save(w.u.luis, e, [{ card_id: c.luis, holes: [{ i: 0, s: 4 }] }]), 'cerrado');
    await fails(save(w.u.sofi, e, [{ card_id: c.luis, holes: [{ i: 0, s: 4 }] }]), 'cerrado');
    await fails(db.rpc(w.u.sofi, 'golf_set_groups', { p_event: e, p_groups: [] }), 'cerrado');
    await fails(db.rpc(w.u.sofi, 'golf_set_dq', { p_card: c.ana, p_dq: false }), 'cerrado');
    const [r] = await db.admin<{ status: string; closed_by: string }>('select status, closed_by from public.golf_rounds where event_id = $1', [e]);
    expect(r).toEqual({ status: 'cerrada', closed_by: w.u.sofi });
    await db.rpc(w.u.sofi, 'golf_close_round', { p_event: e, p_closed: false });
    expect(await save(w.u.luis, e, [{ card_id: c.luis, holes: [{ i: 0, s: 4 }] }])).toBe(1);
  });
});

describe('seguridad del golf', () => {
  it('la RLS: la liga privada no la ve alguien de fuera; la pública la ve cualquiera', async () => {
    const e = await round(w.u.sofi);
    await db.rpc(w.u.luis, 'golf_register', { p_event: e });
    for (const t of ['golf_courses', 'golf_rounds', 'golf_cards']) {
      expect(await db.asUser(w.u.luis, `select 1 from public.${t} where league_id = $1`, [g.lid]), t).not.toHaveLength(0);
      expect(await db.asUser(w.u.nuevo, `select 1 from public.${t} where league_id = $1`, [g.lid]), t).toHaveLength(0);
      expect(await db.asAnon(`select 1 from public.${t} where league_id = $1`, [g.lid]), t).toHaveLength(0);
    }
    const course = await db.rpc<string>(w.u.otro, 'golf_save_course', { p_league: g.pub, p_name: 'Público', p_holes: holesOf(DEMO_COURSE), p_tees: teesOf(DEMO_COURSE) });
    expect(await db.asAnon('select id from public.golf_courses where id = $1', [course])).toHaveLength(1);
  });

  it('nadie escribe directo; las RPC piden sesión', async () => {
    for (const t of ['golf_courses', 'golf_tournaments', 'golf_rounds', 'golf_cards']) {
      await fails(db.asUser(w.u.org, `delete from public.${t}`), '42501');
      await fails(db.asUser(w.u.org, `update public.${t} set updated_at = now()`), '42501');
    }
    await fails(db.rpc(ANON, 'golf_create_round', { p_league: g.lid, p_date: '2026-10-10', p_course: g.course }), '42501');
    await fails(db.rpc(ANON, 'golf_set_index', { p_player: g.p.luis, p_index: 3 }), '42501');
  });

  it('league_id verificado: una tarjeta con el evento de una liga y el jugador de otra no entra', async () => {
    const e = await round(w.u.sofi);
    await fails(
      db.admin(
        `insert into public.golf_cards (league_id, event_id, player_id, tee_id, strokes, putts, picked_up)
         values ($1, $2, $3, 'azul', array_fill(null::smallint, array[18]), array_fill(null::smallint, array[18]), array_fill(false, array[18]))`,
        [g.lid, e, w.p.luis],
      ),
      '23503',
    );
    await fails(
      db.admin(
        `insert into public.golf_rounds (event_id, league_id, course) values ($1, $2, '{}')`,
        [w.e.e1, g.lid],
      ),
      ['23503', '23502', 'invalido'],
    );
    // Golpes en 0 (un hoyo recogido va con null) no entran ni como superusuario.
    await db.rpc(w.u.luis, 'golf_register', { p_event: e });
    await fails(db.admin('update public.golf_cards set strokes[1] = 0 where event_id = $1', [e]), ['invalido']);
  });
});

describe('tiempo real', () => {
  let rt: TestDb;
  let msgs: { topic: string; event: string; payload: Record<string, unknown> }[] = [];

  beforeAll(async () => {
    rt = await TestDb.open();
    await rt.pg.listen('mm', (raw) => msgs.push(JSON.parse(raw)));
  });
  afterAll(async () => {
    await rt.pg.close();
  });

  it('la tarjeta avisa al canal del evento (un aviso por llamada) y la ronda a la liga', async () => {
    const world = await makeWorld(rt);
    const lid = await league(rt, world.u.org, { name: 'Golf RT', visibility: 'public', sport: 'golf', requirePhoto: false });
    await member(rt, lid, world.u.org, 'owner', 'org');
    const pid = await player(rt, lid, 'Org', world.u.org);
    const course = await rt.rpc<string>(world.u.org, 'golf_save_course', { p_league: lid, p_name: 'C', p_holes: holesOf(DEMO_COURSE), p_tees: teesOf(DEMO_COURSE) });
    msgs = [];
    const e = await rt.rpc<string>(world.u.org, 'golf_create_round', { p_league: lid, p_date: '2026-10-10', p_course: course });
    await new Promise((r) => setTimeout(r, 50));
    expect(msgs.filter((m) => m.topic === `league:${lid}` && m.event === 'events').length).toBeGreaterThanOrEqual(1);
    const cid = await rt.rpc<string>(world.u.org, 'golf_register', { p_event: e, p_player: pid });
    msgs = [];
    await rt.rpc(world.u.org, 'golf_save_hole_scores', { p_op_id: randomUUID(), p_event: e, p_cards: [{ card_id: cid, holes: [{ i: 0, s: 4 }, { i: 1, s: 5 }] }] });
    await new Promise((r) => setTimeout(r, 50));
    expect(msgs).toEqual([{ topic: `event:${e}`, event: 'entries', payload: { op: 'update', ids: [cid], sport: 'golf' } }]);
  });
});
