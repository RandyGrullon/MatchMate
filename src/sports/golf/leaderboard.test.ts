import { describe, expect, it } from 'vitest';
import { teeHoles, type PlayedHole } from './course';
import { DEMO_COURSE } from './demo';
import { countbackSegments, golfLeaderboard, orderOfMerit, sharedPoints, type GolfPlayerRounds } from './leaderboard';
import type { GolfCompetition, GolfRound } from './scoring';

const holes = teeHoles(DEMO_COURSE, DEMO_COURSE.tees[0]);

/** Ronda con golpes contra el par por NÚMERO de hoyo: { 2: +1, 12: -1 }. */
const round = (playingHcp: number, diffs: Record<number, number> = {}, list: PlayedHole[] = holes, pickups: number[] = []): GolfRound => ({
  holes: list,
  playingHcp,
  card: {
    strokes: list.map((h) => (pickups.includes(h.number) ? null : h.par + (diffs[h.number] ?? 0))),
    pickedUp: list.map((h) => pickups.includes(h.number)),
  },
});

const player = (id: string, ...rounds: (GolfRound | null)[]): GolfPlayerRounds => ({ id, rounds });

const netStroke: GolfCompetition = { format: 'stroke', basis: 'net' };
const grossStroke: GolfCompetition = { format: 'stroke', basis: 'gross' };
const stableford: GolfCompetition = { format: 'stableford', basis: 'net' };

const byId = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('leaderboard', () => {
  it('stroke play neto: menor neto contra el par primero', () => {
    const rows = golfLeaderboard([player('a', round(10, { 1: 2 })), player('b', round(5)), player('c', round(20, { 3: 1 }))], netStroke);
    expect(byId(rows)).toEqual(['c', 'a', 'b']);
    expect(rows.map((r) => r.value)).toEqual([-19, -8, -5]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows[0].gross).toBe(73);
    expect(rows[0].net).toBe(53);
  });

  it('stroke play bruto: ignora el handicap', () => {
    const rows = golfLeaderboard([player('a', round(10, { 1: 2 })), player('b', round(0, { 1: 1 }))], grossStroke);
    expect(byId(rows)).toEqual(['b', 'a']);
  });

  it('Stableford: más puntos primero', () => {
    const rows = golfLeaderboard([player('a', round(0)), player('b', round(18, { 1: 1 }))], stableford);
    expect(byId(rows)).toEqual(['b', 'a']);
    expect(rows[0].points).toBe(53); // 17 hoyos × 3 + 2
    expect(rows[1].points).toBe(36);
  });

  it('salidas de par distinto: ordena contra el par de cada uno', () => {
    const rojas = teeHoles(DEMO_COURSE, DEMO_COURSE.tees[1]); // par 71
    const rows = golfLeaderboard([player('azul', round(0, { 1: 1 })), player('roja', round(0, {}, rojas))], grossStroke);
    expect(byId(rows)).toEqual(['roja', 'azul']);
    expect(rows[0].gross).toBe(71);
    expect(rows[1].gross).toBe(73);
  });

  it('en vivo: ordena por lo jugado y muestra el hoyo en que va', () => {
    const partial = round(0, { 1: -1, 2: -1 });
    partial.card.strokes = partial.card.strokes.map((s, i) => (i < 5 ? s : null));
    const rows = golfLeaderboard([player('a', round(0, { 1: -1 })), player('b', partial)], grossStroke);
    expect(byId(rows)).toEqual(['b', 'a']);
    expect(rows[0].thru).toBe(5);
    expect(rows[0].complete).toBe(false);
    expect(rows[1].thru).toBe(18);
  });

  it('descalificados al final y sin puesto; los que no han empezado antes de ellos', () => {
    const rows = golfLeaderboard(
      [player('dq', round(0, {}, holes, [5])), player('nada', null), player('ok', round(0, { 1: 3 })), { ...player('firma', round(0)), dq: true }],
      netStroke,
    );
    expect(byId(rows)).toEqual(['ok', 'nada', 'dq', 'firma']);
    expect(rows.map((r) => r.rank)).toEqual([1, null, null, null]);
    expect(rows[2].dq).toBe(true);
  });

  it('en Stableford recoger no descalifica', () => {
    const rows = golfLeaderboard([player('a', round(0, {}, holes, [5])), player('b', round(0, { 1: 4 }))], stableford);
    expect(rows.map((r) => r.dq)).toEqual([false, false]);
    expect(rows.map((r) => [r.points, r.rank])).toEqual([
      [34, 1],
      [34, 1],
    ]); // empatan hasta el último hoyo y comparten puesto
  });
});

describe('countback', () => {
  it('tramos: últimos 9, 6, 3 y 1 con 18 hoyos; 6, 3 y 1 con 9', () => {
    expect(countbackSegments(18)).toEqual([9, 6, 3, 1]);
    expect(countbackSegments(9)).toEqual([6, 3, 1]);
  });

  it('neto con la parte proporcional del handicap (1/2, 1/3…)', () => {
    // Los tres terminan en −10 neto.
    const a = player('a', round(10)); // todo par
    const b = player('b', round(10, { 2: 1, 12: -1 })); // vuelta en −1
    const c = player('c', round(12, { 3: 1, 10: 1 })); // vuelta +1 − 6 = −5 (igual que a); últimos 6: 0 − 4 contra 0 − 3,33
    const rows = golfLeaderboard([a, b, c], netStroke);
    expect(rows.map((r) => r.value)).toEqual([-10, -10, -10]);
    expect(byId(rows)).toEqual(['b', 'c', 'a']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows[1].decidedBy).toBe('últimos 9');
    expect(rows[2].decidedBy).toBe('últimos 6');
  });

  it('en bruto no se resta handicap', () => {
    const rows = golfLeaderboard([player('a', round(0, { 1: 1, 17: -1 })), player('b', round(30, { 18: 1, 1: -1 }))], grossStroke);
    expect(byId(rows)).toEqual(['a', 'b']);
    expect(rows[1].decidedBy).toBe('últimos 9');
  });

  it('llega hasta el último hoyo (1/18)', () => {
    const rows = golfLeaderboard([player('f', round(10, { 17: -1, 18: 1 })), player('a', round(10))], netStroke);
    expect(byId(rows)).toEqual(['a', 'f']);
    expect(rows[1].decidedBy).toBe('último hoyo');
  });

  it('shotgun: cuentan los hoyos 10–18 aunque haya salido por el 10', () => {
    // q salió por el 10: su tarjeta está en orden de juego y sus «últimos 9 jugados» son el 1–9.
    const shotgun = [...holes.slice(9), ...holes.slice(0, 9)];
    const p = player('p', round(0, { 5: -1, 15: 1 }));
    const q = player('q', round(0, { 16: -1, 3: 1 }, shotgun));
    const rows = golfLeaderboard([p, q], grossStroke);
    expect(byId(rows)).toEqual(['q', 'p']);
    expect(rows[1].decidedBy).toBe('últimos 9');
  });

  it('Stableford: puntos de los últimos hoyos', () => {
    const rows = golfLeaderboard([player('a', round(0, { 1: 1, 18: -1 })), player('b', round(0))], stableford);
    expect(rows.map((r) => r.points)).toEqual([36, 36]);
    expect(byId(rows)).toEqual(['a', 'b']);
    expect(rows[1].decidedBy).toBe('últimos 9');
  });

  it('9 hoyos: últimos 6 son el 13–18 en la vuelta', () => {
    const back = teeHoles(DEMO_COURSE, DEMO_COURSE.tees[0], 'back');
    const rows = golfLeaderboard([player('a', round(0, { 10: 1, 13: -1 }, back)), player('b', round(0, {}, back))], grossStroke);
    expect(byId(rows)).toEqual(['a', 'b']);
    expect(rows[1].decidedBy).toBe('últimos 6');
  });

  it('si nada desempata, comparten el puesto', () => {
    const rows = golfLeaderboard([player('a', round(10)), player('b', round(10)), player('c', round(10, { 1: 1 }))], netStroke);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(rows[1].decidedBy).toBeUndefined();
  });

  it('sin countback si alguno de los empatados no ha terminado', () => {
    const partial = round(0, { 1: -1 });
    partial.card.strokes = partial.card.strokes.map((s, i) => (i < 9 ? s : null));
    const rows = golfLeaderboard([player('a', round(0, { 18: -1 })), player('b', partial)], grossStroke);
    expect(rows.map((r) => r.rank)).toEqual([1, 1]);
  });

  it('se puede apagar', () => {
    const rows = golfLeaderboard([player('a', round(10)), player('b', round(10, { 2: 1, 12: -1 }))], netStroke, { countback: false });
    expect(rows.map((r) => r.rank)).toEqual([1, 1]);
  });
});

describe('torneo de varias rondas', () => {
  it('suma las rondas y desempata por la última ronda', () => {
    const x = player('x', round(0, { 1: 2 }), round(0, { 1: -1 }));
    const y = player('y', round(0, { 1: -1 }), round(0, { 1: 2 }));
    const z = player('z', round(0), null);
    const rows = golfLeaderboard([y, x, z], grossStroke);
    expect(byId(rows)).toEqual(['z', 'x', 'y']);
    expect(rows[0].complete).toBe(false);
    expect(rows[0].roundsDone).toBe(1);
    expect(rows[1].gross).toBe(145);
    expect(rows[1].value).toBe(1);
    expect(rows[1].roundsDone).toBe(2);
    expect(rows[2].rank).toBe(3);
    expect(rows[2].decidedBy).toBe('última ronda');
  });

  it('una ronda descalificada saca del torneo', () => {
    const rows = golfLeaderboard([player('a', round(0), round(0, {}, holes, [3])), player('b', round(0, { 1: 5 }), round(0))], netStroke);
    expect(byId(rows)).toEqual(['b', 'a']);
    expect(rows[1].dq).toBe(true);
    expect(rows[1].rank).toBeNull();
  });

  it('Stableford: suma de puntos', () => {
    const rows = golfLeaderboard([player('a', round(0), round(0)), player('b', round(0), round(18))], stableford);
    expect(rows.map((r) => [r.id, r.points])).toEqual([
      ['b', 90],
      ['a', 72],
    ]);
  });

  it('el número de rondas del torneo puede venir fijo', () => {
    const rows = golfLeaderboard([player('a', round(0))], grossStroke, { rounds: 3 });
    expect(rows[0].rounds).toHaveLength(3);
    expect(rows[0].complete).toBe(false);
  });
});

describe('orden de mérito', () => {
  it('suma puntos por puesto y reparte los empates', () => {
    expect(sharedPoints(2, 2, [25, 20, 16])).toBe(18);
    expect(sharedPoints(3, 2, [25, 20, 16])).toBe(8);
    const merit = orderOfMerit(
      [
        {
          rows: [
            { id: 'a', rank: 1 },
            { id: 'b', rank: 2 },
            { id: 'c', rank: 2 },
            { id: 'd', rank: null },
          ],
        },
        {
          rows: [
            { id: 'b', rank: 1 },
            { id: 'a', rank: 2 },
          ],
        },
      ],
      [10, 6, 4],
    );
    expect(merit.map((m) => [m.id, m.points, m.rank])).toEqual([
      ['a', 16, 1],
      ['b', 15, 2],
      ['c', 5, 3],
      ['d', 0, 4],
    ]);
    expect(merit[0].wins).toBe(1);
    expect(merit[3].events).toBe(1);
    expect(merit[3].best).toBeNull();
  });
});
