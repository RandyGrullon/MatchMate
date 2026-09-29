import { describe, expect, it } from 'vitest';
import { DEMO_PARS } from '../../sports/golf/demo';
import { evaluate } from '../engine';
import type { SnapGolfCard, SnapGolfRound } from '../snapshot';
import { snapCard, snapEvent, snapLeague, snapRound } from '../testkit';
import type { AwardDecision, ReviewDecision } from '../types';
import { cappedHcp, cardInfos } from './golf';
import { apply, gives, job, NOW, of, player, revokes, row, snap, world } from './fixtures';
import { kitOf } from './kit';

// ---------------------------------------------------------------------------------------------------------
// Datos: la liga 'L' de golf, con el campo de ejemplo (par 72; hoyo 3 par 3, hoyo 4 par 5).
// g1 (u1) y g2 (u2) salen juntos en el grupo 1 (se marcan uno al otro); g3 (u3) y g4 (u4) en el grupo 2.

const PLAYERS = [player('g1', 'L', 'u1'), player('g2', 'L', 'u2'), player('g3', 'L', 'u3'), player('g4', 'L', 'u4')];

/** Golpes: par en todo, más `plus` en cada hoyo, con cambios por hoyo (índice 0 = hoyo 1). */
function strokes(plus = 0, holes: Record<number, number | null> = {}): (number | null)[] {
  return DEMO_PARS.map((p, i) => (i + 1 in holes ? holes[i + 1] : p + plus));
}

interface RoundSpec {
  id: string;
  date: string;
  cards: [player: string, strokes: (number | null)[], over?: Partial<SnapGolfCard>][];
  round?: Partial<SnapGolfRound>;
}

/** Rondas cerradas con sus tarjetas firmadas (grupo 1 para g1 y g2, grupo 2 para los demás). */
function rounds(...specs: RoundSpec[]) {
  const events = specs.map((s) => snapEvent(s.id, { type: 'ronda', date: s.date, name: `Ronda ${s.id}` }));
  const golf_rounds = specs.map((s) => snapRound(s.id, s.round));
  const golf_cards = specs.flatMap((s) =>
    s.cards.map(([p, st, over]) =>
      snapCard(`${s.id}-${p}`, s.id, p, st, {
        group_no: p === 'g1' || p === 'g2' ? 1 : 2,
        picked_up: st.map((x) => x === null),
        ...over,
      }),
    ),
  );
  return { events, golf_rounds, golf_cards };
}

/** Una ronda por día desde el 1 de octubre, g1 con `st(i)` y g2 de marcador con bogey en todo. */
const series = (n: number, st: (i: number) => (number | null)[], from = 1) =>
  Array.from({ length: n }, (_, i): RoundSpec => ({
    id: `r${from + i}`,
    date: `2026-10-${String(from + i).padStart(2, '0')}`,
    cards: [
      ['g1', st(i)],
      ['g2', strokes(1)],
    ],
  }));

const resultado = (ref: string) => job('resultado', { ref });
const run = (ref: string, parts: ReturnType<typeof rounds>, extra: Parameters<typeof world>[1] = {}) => {
  const j = ref === 'historial' ? job('historial') : resultado(ref);
  return evaluate(j, snap(j, world('golf', { players: PLAYERS, ...parts, ...extra })), NOW);
};

// ---------------------------------------------------------------------------------------------------------

describe('golf_career: hitos y marcas de la cuenta', () => {
  it('Rondas jugadas: la quinta da el bronce; 9 hoyos valen media y una tarjeta por día', () => {
    let ds = run('card:r5-g1', rounds(...series(5, () => strokes(1))));
    expect(of(ds, 'golf_rounds', 'award')).toEqual([expect.objectContaining({ user_id: 'u1', level: 1, period_key: '-', status: 'provisional', refs: ['card:r5-g1'] })]);
    expect(of(ds, 'golf_rounds', 'progress').find((p) => p.user_id === 'u1')).toMatchObject({ value: 5, target: 20, next_level: 2 });
    const specs = series(5, () => strokes(1));
    specs[4].round = { nine: 'front', holes: 9 };
    specs[4].cards = specs[4].cards.map(([p, st]) => [p, st.slice(0, 9)]);
    ds = run('card:r5-g1', rounds(...specs));
    expect(of(ds, 'golf_rounds', 'award')).toEqual([]);
    expect(of(ds, 'golf_rounds', 'progress').find((p) => p.user_id === 'u1')).toMatchObject({ value: 4.5, target: 5 });
    const sameDay = series(5, () => strokes(1));
    sameDay[4].date = sameDay[3].date;
    ds = run('card:r5-g1', rounds(...sameDay));
    expect(of(ds, 'golf_rounds', 'progress').find((p) => p.user_id === 'u1')).toMatchObject({ value: 4 });
  });

  it('Birdies: el primero pide marcador (G2); los siguientes cuentan en G1', () => {
    const alone: RoundSpec = { id: 'r1', date: '2026-10-01', cards: [['g1', strokes(1, { 1: 3 })]] };
    let ds = run('card:r1-g1', rounds(alone));
    expect(of(ds, 'golf_birdies', 'award')).toEqual([]);
    expect(of(ds, 'golf_birdies', 'progress')[0]).toMatchObject({ next_level: 1, target: 1, value: 0 });
    const marked: RoundSpec = { id: 'r2', date: '2026-10-02', cards: [['g1', strokes(1, { 2: 3 })], ['g2', strokes(1)]] };
    ds = run('card:r2-g1', rounds(alone, marked));
    expect(of(ds, 'golf_birdies', 'award').filter((d) => d.user_id === 'u1')).toEqual([expect.objectContaining({ level: 1, refs: ['card:r2-g1'] })]);
    expect(of(ds, 'golf_birdies', 'progress').find((p) => p.user_id === 'u1')).toMatchObject({ value: 2, target: 10 });
  });

  it('Rompiste la barrera: bruto por debajo del umbral, sin levantar; 9 hoyos con los suyos', () => {
    let ds = run('card:r1-g1', rounds(...series(1, () => strokes(1, { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 4, 7: 3, 8: 4, 9: 5 }))));
    // Ida en par (36) y vuelta con bogey en todo (45): 81.
    expect(of(ds, 'golf_break_barrier', 'award').filter((d) => d.user_id === 'u1').map((d) => [d.level, d.context.values])).toEqual([
      [1, { n: 110, hoyos: 18, gross: 81 }],
      [2, { n: 100, hoyos: 18, gross: 81 }],
      [3, { n: 90, hoyos: 18, gross: 81 }],
    ]);
    ds = run('card:r1-g1', rounds(...series(1, () => strokes(0, { 1: null }))));
    expect(of(ds, 'golf_break_barrier', 'award').filter((d) => d.user_id === 'u1')).toEqual([]);
    const nine = series(1, () => strokes(1).slice(9));
    nine[0].round = { nine: 'back', holes: 9 };
    nine[0].cards[1][1] = strokes(2).slice(9);
    ds = run('card:r1-g1', rounds(...nine));
    // Vuelta de 36 + 9 = 45 → por debajo de 55 y de 50, no de 45.
    expect(of(ds, 'golf_break_barrier', 'award').filter((d) => d.user_id === 'u1').map((d) => [d.level, d.context.values?.n, d.context.values?.hoyos])).toEqual([
      [1, 55, 9],
      [2, 50, 9],
    ]);
    expect(of(ds, 'golf_break_barrier', 'progress').find((p) => p.user_id === 'u1')).toMatchObject({ value: 45, target: 45, next_level: 3 });
  });

  it('Stableford neto con el índice topado', () => {
    let ds = run('card:r1-g1', rounds({ id: 'r1', date: '2026-10-01', cards: [['g1', strokes(0), { hcp_index: 10 }], ['g2', strokes(1)]] }));
    expect(of(ds, 'golf_stableford', 'award').filter((d) => d.user_id === 'u1').map((d) => d.level)).toEqual([1, 2, 3]);
    ds = run('card:r1-g1', rounds({ id: 'r1', date: '2026-10-01', cards: [['g1', strokes(0)], ['g2', strokes(1)]] }));
    // Sin índice juega con 0 (hándicap de juego −1 en este campo): 35 puntos.
    expect(of(ds, 'golf_stableford', 'award').filter((d) => d.user_id === 'u1').map((d) => [d.level, d.context.values?.n])).toEqual([[1, 35]]);
  });

  it('el índice topado baja un índice escrito alto con 5+ rondas G2 de 18 hoyos', () => {
    const specs = series(6, () => strokes(0));
    specs[5].cards[0][2] = { hcp_index: 30 };
    const parts = rounds(...specs);
    const j = resultado('card:r6-g1');
    const kit = kitOf(j, snap(j, world('golf', { players: PLAYERS, ...parts })), Date.parse(NOW));
    const last = cardInfos(kit).find((i) => i.card.id === 'r6-g1')!;
    expect(cappedHcp(kit, last)).toBe(0);
    const first = cardInfos(kit).find((i) => i.card.id === 'r1-g1')!;
    expect(cappedHcp(kit, { ...first, card: { ...first.card, hcp_index: 30 } })).toBeGreaterThan(25);
  });

  it('Colección de birdies: par 3, par 4 y par 5 en la carrera', () => {
    const specs = series(2, (i) => (i === 0 ? strokes(1, { 3: 2, 1: 3 }) : strokes(1, { 4: 4 })));
    const ds = run('card:r2-g1', rounds(...specs));
    expect(of(ds, 'golf_birdie_collection', 'award')).toEqual([expect.objectContaining({ user_id: 'u1', level: 0 })]);
    expect(of(ds, 'golf_birdie_collection', 'award')[0].refs.sort()).toEqual(['card:r1-g1', 'card:r2-g1']);
    expect(of(run('card:r1-g1', rounds(specs[0])), 'golf_birdie_collection', 'award')).toEqual([]);
  });
});

describe('climbing (golf)', () => {
  it('diferencial de las primeras 5 menos el de las últimas 5, con 10+ rondas G2 de 18 hoyos', () => {
    const specs = series(10, (i) => (i < 5 ? strokes(1) : strokes(1, { 1: 4, 2: 4, 3: 3, 4: 5 })));
    const ds = run('card:r10-g1', rounds(...specs));
    const got = of(ds, 'climbing', 'award').filter((d) => d.user_id === 'u1');
    // 4 golpes menos: (4 × 113 / 128) = 3,5.
    expect(got.map((d) => [d.level, d.sport, d.context.values?.n, d.refs[0]])).toEqual([[1, 'golf', 3.5, 'card:r10-g1']]);
    expect(of(run('card:r9-g1', rounds(...specs.slice(0, 9))), 'climbing', 'award').filter((d) => d.user_id === 'u1')).toEqual([]);
  });
});

describe('debut (golf)', () => {
  it('la primera tarjeta G1 en una liga real', () => {
    const ds = run('card:r1-g1', rounds({ id: 'r1', date: '2026-10-01', cards: [['g1', strokes(2)]] }));
    expect(of(ds, 'debut', 'award')).toEqual([expect.objectContaining({ user_id: 'u1', sport: 'golf', refs: ['card:r1-g1'] })]);
    expect(of(run('card:r1-g1', rounds({ id: 'r1', date: '2026-10-01', cards: [['g1', strokes(2)]] }), { real: [] }), 'debut')).toEqual([]);
  });
});

describe('golf_card: marcas de una tarjeta (liga)', () => {
  const one = (st: (number | null)[], marker = true, round: Partial<SnapGolfRound> = {}) =>
    rounds({ id: 'r1', date: '2026-10-01', cards: marker ? [['g1', st], ['g2', strokes(1)]] : [['g1', st]], round });
  const mine = (ds: ReturnType<typeof run>) => ds.filter((d) => d.player_id === 'g1');

  it('Águila (2 bajo par) se da; el albatros y el hoyo en uno piden aval', () => {
    let ds = mine(run('card:r1-g1', one(strokes(1, { 4: 3 }))));
    // Bogey en todo y el águila: también es una ronda sin tropiezos.
    expect(gives(ds)).toEqual(['golf_eagle:0:c:r1-g1@g1', 'golf_no_disaster:0:c:r1-g1@g1']);
    expect((of(ds, 'golf_eagle', 'award')[0] as AwardDecision).context.values).toMatchObject({ hoyo: 4, campo: 'Campo de ejemplo' });
    ds = mine(run('card:r1-g1', one(strokes(1, { 4: 2 }))));
    const [alba] = of(ds, 'golf_eagle', 'review') as ReviewDecision[];
    expect(alba).toMatchObject({ level: 0, period_key: 'c:r1-g1', context: { alt: 'albatross', markers: ['u2'] } });
    // Revisan el dueño y el admin (ninguno jugó la ronda).
    expect(alba.reviewers).toEqual(['u-admin', 'u-owner']);
    ds = mine(run('card:r1-g1', one(strokes(1, { 3: 1 }))));
    expect(gives(ds)).toEqual(['golf_hole_in_one:0:c:r1-g1@g1', 'golf_no_disaster:0:c:r1-g1@g1']);
    expect(of(ds, 'golf_hole_in_one', 'review')[0].context.values).toMatchObject({ hoyo: 3 });
    // Sin marcador (G1) no hay marcas.
    expect(gives(mine(run('card:r1-g1', one(strokes(1, { 4: 3, 3: 1 }), false))))).toEqual([]);
  });

  it('Ronda en par (con aval) y Ronda sin tropiezos', () => {
    let ds = mine(run('card:r1-g1', one(strokes(0))));
    expect(gives(ds)).toEqual(['golf_no_disaster:0:c:r1-g1@g1', 'golf_par_round:0:c:r1-g1@g1']);
    expect(of(ds, 'golf_par_round', 'review')).toHaveLength(1);
    ds = mine(run('card:r1-g1', one(strokes(1, { 5: 7 }))));
    expect(gives(ds)).toEqual([]);
    // Si el admin jugó la ronda, no la puede avalar.
    const withAdmin = rounds({ id: 'r1', date: '2026-10-01', cards: [['g1', strokes(0)], ['g2', strokes(1)], ['ga', strokes(1)]] });
    ds = mine(run('card:r1-g1', withAdmin, { players: [...PLAYERS, player('ga', 'L', 'u-admin')] }));
    expect((of(ds, 'golf_par_round', 'review')[0] as ReviewDecision).reviewers).toEqual(['u-owner']);
  });

  it('Récord personal en el campo: mejora con 2+ rondas anteriores en la misma salida', () => {
    // 90, 88 (una sola ronda antes: no cuenta) y 80.
    const specs = series(3, (i) => strokes(1, i === 2 ? { 1: 3, 2: 3, 3: 2, 4: 4, 5: 3 } : i === 1 ? { 1: 3 } : {}));
    const ds = mine(run('historial', rounds(...specs)));
    expect(of(ds, 'golf_course_best', 'award').map((d) => [d.period_key, d.status, (d as AwardDecision).context.values])).toEqual([
      ['c:r3-g1', 'firme', { n: 80, gain: 8, campo: 'Campo de ejemplo' }],
    ]);
  });

  it('una corrección retira la provisional; una tarjeta borrada también', () => {
    const awards = [
      row({ badge_key: 'golf_eagle', sport: 'golf', level: 0, period_key: 'c:r1-g1', player_id: 'g1', league_id: 'L' }),
      row({ badge_key: 'golf_no_disaster', sport: 'golf', level: 0, period_key: 'c:r9-g1', player_id: 'g1', league_id: 'L' }),
    ];
    const j = job('revisar', { ref: 'card:r1-g1', payload: { refs: ['card:r9-g1'] } });
    const ds = evaluate(j, snap(j, world('golf', { players: PLAYERS, ...one(strokes(1, { 5: 7 })), awards })), NOW);
    expect(revokes(ds)).toEqual(['golf_eagle:0:c:r1-g1@g1', 'golf_no_disaster:0:c:r9-g1@g1']);
  });
});

describe('podio de golf', () => {
  /** Una ronda con g1…gN (g5 y g6 con cuenta), g1 el mejor. */
  function field(n: number, round: Partial<SnapGolfRound> = {}, id = 'R', date = '2026-11-10') {
    const players = Array.from({ length: n }, (_, i) => player(`g${i + 1}`, 'L', `u${i + 1}`));
    const parts = rounds({ id, date, round, cards: players.map((p, i): [string, (number | null)[]] => [p.id, strokes(1, { 1: 5 + i })]) });
    // Todos en el grupo 1 para que se marquen.
    parts.golf_cards.forEach((c) => (c.group_no = 1));
    return { players, parts };
  }
  const evento = (ref = 'event:R') => job('evento', { ref });

  it('4 cuentas: solo oro; 6 jugadores: oro y plata; firmes', () => {
    let f = field(4);
    let ds = evaluate(evento(), snap(evento(), world('golf', { players: f.players, ...f.parts })), NOW);
    expect(of(ds, 'event_podium').map((d) => [d.player_id, d.level, d.period_key, (d as AwardDecision).status])).toEqual([['g1', 3, 'e:R', 'firme']]);
    f = field(6);
    ds = evaluate(evento(), snap(evento(), world('golf', { players: f.players, ...f.parts })), NOW);
    expect(of(ds, 'event_podium').map((d) => [d.player_id, d.level])).toEqual([
      ['g1', 3],
      ['g2', 2],
    ]);
  });

  it('sin 4 cuentas distintas, en torneos sueltos o con la ronda abierta no hay podio', () => {
    const f = field(4);
    f.players[3] = player('g4', 'L', null);
    let ds = evaluate(evento(), snap(evento(), world('golf', { players: f.players, ...f.parts })), NOW);
    expect(of(ds, 'event_podium')).toEqual([]);
    const g = field(4, { status: 'abierta' });
    ds = evaluate(evento(), snap(evento(), world('golf', { players: g.players, ...g.parts })), NOW);
    expect(of(ds, 'event_podium')).toEqual([]);
    const h = field(4);
    ds = evaluate(evento(), snap(evento(), world('golf', { leagues: [snapLeague('L', { sport: 'golf', kind: 'torneo' })], players: h.players, ...h.parts })), NOW);
    expect(of(ds, 'event_podium')).toEqual([]);
  });

  it('el historial de la liga da los podios; el de una cuenta (sin liga) no: su foto no trae la historia de los demás', () => {
    const f = field(6, { closed_at: '2026-11-10T20:00:00.000Z' });
    const w = world('golf', { players: f.players, ...f.parts });
    const league = job('historial');
    expect(of(evaluate(league, snap(league, w), NOW), 'event_podium').map((d) => [d.player_id, d.level])).toEqual([
      ['g1', 3],
      ['g2', 2],
    ]);
    const account = job('historial', { league_id: null, user_id: 'u1', ref: 'user:u1' });
    expect(of(evaluate(account, snap(account, w), NOW), 'event_podium')).toEqual([]);
  });

  it('torneo de varias rondas: tabla acumulada de quienes jugaron todas (`gt:<id>`)', () => {
    const a = field(5, { tournament_id: 'T', round_no: 1 }, 'R1', '2026-11-07');
    const b = field(5, { tournament_id: 'T', round_no: 2 }, 'R2', '2026-11-08');
    // En la segunda, g1 hace 8 más: gana g2.
    b.parts.golf_cards[0].strokes = strokes(1, { 1: 13 });
    const parts = { events: [...a.parts.events, ...b.parts.events], golf_rounds: [...a.parts.golf_rounds, ...b.parts.golf_rounds], golf_cards: [...a.parts.golf_cards, ...b.parts.golf_cards] };
    const ds = evaluate(evento('gt:T'), snap(evento('gt:T'), world('golf', { players: a.players, ...parts })), NOW);
    expect(of(ds, 'event_podium').map((d) => [d.player_id, d.level, d.period_key, d.refs.length])).toEqual([['g2', 3, 'gt:T', 2]]);
  });
});

describe('idempotencia (golf)', () => {
  it('evaluar, aplicar y volver a evaluar no cambia nada', () => {
    const specs = series(10, (i) => (i === 9 ? strokes(0, { 4: 3, 3: 1 }) : strokes(1)));
    const j = resultado('card:r10-g1');
    const first = snap(j, world('golf', { players: PLAYERS, ...rounds(...specs) }));
    const ds = evaluate(j, first, NOW);
    expect(gives(ds).length).toBeGreaterThan(5);
    expect(evaluate(j, apply(first, ds), NOW)).toEqual([]);
  });
});
