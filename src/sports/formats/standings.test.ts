import { describe, expect, it } from 'vitest';
import type { MatchResult } from '../types';
import {
  buildRows,
  gamesMatchResult,
  pickleballMatchResult,
  pickleballStandings,
  racketMatchResult,
  racketStandings,
  RACKET_POINTS_2_0,
  resolveTies,
  standings,
  tableTennisStandings,
  TABLE_TENNIS_POINTS,
  tiebreak,
  type TableConfig,
} from './standings';

let seq = 0;
/** Partido de raqueta: el ganador sale de los sets. */
const r = (side1: string, side2: string, ...sets: [number, number][]): MatchResult => {
  const won1 = sets.filter(([a, b]) => a > b).length;
  const won2 = sets.length - won1;
  return racketMatchResult({ id: `m${++seq}`, side1, side2, sets, winner: won1 > won2 ? 1 : 2 });
};
const order = (rows: { id: string }[]) => rows.map((x) => x.id);

describe('filas de tabla', () => {
  it('suma puntos 3/1/0, sets y juegos; el W.O. da 0 y 6-0 6-0', () => {
    const rows = buildRows(
      ['A', 'B', 'C'],
      [
        r('A', 'B', [6, 4], [3, 6], [6, 2]),
        racketMatchResult({ id: 'wo', side1: 'C', side2: 'A', sets: [], winner: 2, status: 'walkover' }),
      ],
      { win: 3, draw: 0, loss: 1, walkoverLoss: 0 },
      'games',
    );
    const [a, b, c] = rows;
    expect(a).toMatchObject({ played: 2, won: 2, lost: 0, points: 6, for: 15 + 12, against: 12 });
    expect(a.extra).toMatchObject({ setsFor: 4, setsAgainst: 1, setsDiff: 3, gamesFor: 27, walkoverWins: 1 });
    expect(b).toMatchObject({ played: 1, won: 0, lost: 1, points: 1, for: 12, against: 15, diff: -3 });
    expect(c).toMatchObject({ played: 1, lost: 1, points: 0, for: 0, against: 12 });
    expect(c.extra.walkovers).toBe(1);
  });

  it('ignora partidos con alguien de fuera y deja las mismas claves en todas las filas', () => {
    const rows = buildRows(['A', 'B', 'Z'], [r('A', 'B', [6, 0], [6, 0]), r('A', 'X', [6, 0], [6, 0])], RACKET_POINTS_2_0, 'games');
    expect(rows.find((x) => x.id === 'A')!.played).toBe(1);
    expect(rows.find((x) => x.id === 'Z')!.extra).toMatchObject({ setsFor: 0, gamesDiff: 0, walkovers: 0 });
  });
});

describe('pádel y tenis: desempates', () => {
  it('2 empatados: manda el enfrentamiento directo aunque el otro tenga mejor diferencia', () => {
    const t = racketStandings(
      ['A', 'B', 'C', 'D'],
      [
        r('A', 'B', [7, 6], [7, 6]),
        r('A', 'C', [7, 5], [7, 5]),
        r('D', 'A', [6, 0], [6, 0]),
        r('B', 'C', [6, 0], [6, 0]),
        r('B', 'D', [6, 0], [6, 0]),
        r('C', 'D', [6, 4], [6, 4]),
      ],
    );
    expect(t.find((x) => x.id === 'B')!.extra.gamesDiff).toBeGreaterThan(t.find((x) => x.id === 'A')!.extra.gamesDiff);
    expect(order(t)).toEqual(['A', 'B', 'C', 'D']);
    expect(t.map((x) => x.points)).toEqual([7, 7, 5, 5]);
    expect(t.map((x) => x.decidedBy)).toEqual([undefined, 'enfrentamiento directo', 'puntos', 'enfrentamiento directo']);
  });

  it('3 empatados en ciclo: minitabla igual, decide la diferencia', () => {
    const t = racketStandings(['A', 'B', 'C'], [r('A', 'B', [7, 6], [7, 6]), r('B', 'C', [6, 0], [6, 0]), r('C', 'A', [6, 4], [6, 4])]);
    expect(t.every((x) => x.points === 4 && x.extra.setsDiff === 0)).toBe(true);
    // Dif. de juegos: B +10, A −2, C −8.
    expect(order(t)).toEqual(['B', 'A', 'C']);
    expect(t.map((x) => x.decidedBy)).toEqual([undefined, 'dif. de juegos', 'dif. de juegos']);
  });

  it('empate de 3 que se reduce a 2: esos 2 se deciden por su partido (recursivo)', () => {
    const results = [
      r('A', 'B', [6, 4], [6, 4]),
      r('B', 'C', [6, 3], [6, 3]),
      r('C', 'A', [6, 2], [6, 2]),
      r('A', 'D', [6, 0], [6, 0]),
      r('B', 'D', [6, 4], [4, 6], [6, 4]),
      r('C', 'D', [6, 1], [4, 6], [6, 1]),
    ];
    const t = racketStandings(['A', 'B', 'C', 'D'], results);
    // A, B y C con 7 puntos; minitabla igual (4 cada uno); dif. de sets: A +2, B +1, C +1 → A.
    // B y C siguen empatados → vuelven a empezar solo entre ellos → B le ganó a C.
    expect(order(t)).toEqual(['A', 'B', 'C', 'D']);
    expect(t.map((x) => x.decidedBy)).toEqual([undefined, 'dif. de sets', 'enfrentamiento directo', 'puntos']);
    expect(t.map((x) => x.rank)).toEqual([1, 2, 3, 4]);

    // Estilo FIFA (sin volver al directo tras un criterio general): C pasa a B por dif. de juegos.
    const fifa: TableConfig = {
      points: { win: 3, draw: 0, loss: 1, walkoverLoss: 0 },
      primary: 'games',
      criteria: [tiebreak.points(), tiebreak.h2h(), tiebreak.stat('setsDiff', 'dif. de sets'), tiebreak.stat('gamesDiff', 'dif. de juegos')],
      restart: 'h2h',
    };
    expect(order(standings(['A', 'B', 'C', 'D'], results, fifa))).toEqual(['A', 'C', 'B', 'D']);
  });

  it('minitabla de 4 que parte en 2+2 y se repite en cada mitad', () => {
    const results = [
      r('A', 'B', [6, 4], [4, 6], [6, 4]),
      r('B', 'C', [6, 0], [6, 0]),
      r('B', 'D', [6, 0], [6, 0]),
      r('A', 'C', [7, 6], [3, 6], [7, 6]),
      r('D', 'A', [6, 4], [6, 4]),
      r('C', 'D', [6, 4], [6, 4]),
      r('A', 'E', [6, 4], [4, 6], [6, 4]),
      r('F', 'A', [6, 4], [6, 4]),
      r('B', 'E', [6, 0], [6, 0]),
      r('F', 'B', [6, 4], [4, 6], [6, 4]),
      r('C', 'E', [6, 0], [6, 0]),
      r('C', 'F', [6, 0], [6, 0]),
      r('D', 'E', [6, 0], [6, 0]),
      r('D', 'F', [6, 0], [6, 0]),
      r('E', 'F', [6, 0], [6, 0]),
    ];
    const t = racketStandings(['A', 'B', 'C', 'D', 'E', 'F'], results);
    expect(t.slice(0, 4).every((x) => x.points === 11)).toBe(true);
    // B tiene mejor dif. de sets que A, pero en la minitabla A y B quedan arriba (7) y entre ellos ganó A.
    expect(t.find((x) => x.id === 'B')!.extra.setsDiff).toBeGreaterThan(t.find((x) => x.id === 'A')!.extra.setsDiff);
    expect(order(t)).toEqual(['A', 'B', 'C', 'D', 'F', 'E']);
    expect(t.map((x) => x.decidedBy)).toEqual([undefined, 'enfrentamiento directo', 'minitabla', 'enfrentamiento directo', 'puntos', 'puntos']);
  });

  it('empate que nada rompe: sorteo determinista, o puesto compartido sin sorteo', () => {
    const results = [r('A', 'X', [6, 3], [6, 3]), r('B', 'Y', [6, 3], [6, 3])];
    const t1 = racketStandings(['A', 'B', 'X', 'Y'], results);
    const t2 = racketStandings(['B', 'A', 'Y', 'X'], results);
    expect(order(t1).slice(0, 2)).toEqual(order(t2).slice(0, 2));
    expect(t1[1].decidedBy).toBe('sorteo');
    expect(t1.map((x) => x.rank)).toEqual([1, 2, 3, 4]);

    const shared = resolveTies(buildRows(['A', 'B', 'X', 'Y'], results, RACKET_POINTS_2_0, 'games'), results, [tiebreak.points(), tiebreak.h2h()]);
    expect(shared.map((x) => x.rank)).toEqual([1, 1, 3, 3]);
    expect(order(shared)).toEqual(['A', 'B', 'X', 'Y']);
  });

  it('el sorteo cambia con la semilla pero siempre igual con la misma', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `p${i}`);
    const a = racketStandings(ids, [], { lotSeed: 'liga-1' });
    const b = racketStandings(ids, [], { lotSeed: 'liga-1' });
    const c = racketStandings(ids, [], { lotSeed: 'liga-2' });
    expect(order(a)).toEqual(order(b));
    expect(order(a)).not.toEqual(order(c));
  });

  it('W.O.: el ausente no suma y el presente gana 6-0 6-0 (tabla 2/0 también)', () => {
    const wo = racketMatchResult({ id: 'w', side1: 'A', side2: 'B', sets: [], winner: 1, status: 'walkover' });
    expect(wo).toMatchObject({ winner: 1, walkover: 2, totals: { sets: [2, 0], games: [12, 0] } });
    const t = racketStandings(['A', 'B', 'C'], [wo, r('C', 'B', [6, 0], [6, 0])]);
    expect(t.find((x) => x.id === 'B')).toMatchObject({ points: 1, played: 2 });
    const t2 = racketStandings(['A', 'B'], [wo], { points: RACKET_POINTS_2_0 });
    expect(t2.map((x) => x.points)).toEqual([2, 0]);
    const empty = racketMatchResult({ id: 'w2', side1: 'A', side2: 'B', sets: [], winner: 2, status: 'walkover', walkoverSets: [] });
    expect(empty).toMatchObject({ walkover: 1, totals: { sets: [0, 0], games: [0, 0] } });
  });
});

describe('retiro: se completa el set a favor del ganador', () => {
  it('6-4 2-3 y se retira el lado 1: 6-4 2-6 0-6', () => {
    const m = racketMatchResult({ id: 'x', side1: 'A', side2: 'B', sets: [[6, 4], [2, 3]], winner: 2, status: 'retired' });
    expect(m.totals).toEqual({ sets: [1, 2], games: [8, 16] });
    expect(m.walkover).toBeUndefined();
  });

  it('5-5 pasa a 7-5, 6-6 pasa a 7-6 y 6-5 del que se retira pasa a 6-7', () => {
    const at = (s: [number, number]) => racketMatchResult({ id: 'x', side1: 'A', side2: 'B', sets: [[6, 1], s], winner: 1, status: 'retired' }).totals;
    expect(at([5, 5])).toEqual({ sets: [2, 0], games: [13, 6] });
    expect(at([6, 6])).toEqual({ sets: [2, 0], games: [13, 7] });
    expect(racketMatchResult({ id: 'x', side1: 'A', side2: 'B', sets: [[6, 5]], winner: 2, status: 'retired' }).totals).toEqual({
      sets: [0, 2],
      games: [6, 13],
    });
  });

  it('súper tie-break: se completa a 10 (o por 2) y cuenta como un juego', () => {
    const m = racketMatchResult({ id: 'x', side1: 'A', side2: 'B', sets: [[6, 4], [4, 6], [8, 9]], winner: 2, status: 'retired', superTiebreak: true });
    expect(m.totals).toEqual({ sets: [1, 2], games: [10, 11] });
    const played = racketMatchResult({ id: 'y', side1: 'A', side2: 'B', sets: [[6, 4], [4, 6], [10, 7]], winner: 1, superTiebreak: true });
    expect(played.totals).toEqual({ sets: [2, 1], games: [11, 10] });
  });

  it('retiro antes de empezar: el ganador suma 6-0 6-0 pero el que se retira no es W.O.', () => {
    const m = racketMatchResult({ id: 'x', side1: 'A', side2: 'B', sets: [], winner: 1, status: 'retired' });
    expect(m.totals).toEqual({ sets: [2, 0], games: [12, 0] });
    expect(racketStandings(['A', 'B'], [m]).map((x) => x.points)).toEqual([3, 1]);
  });
});

describe('pickleball (USA Pickleball 15.B.4)', () => {
  let n = 0;
  const g = (side1: string, side2: string, ...games: [number, number][]) => pickleballMatchResult({ id: `g${++n}`, side1, side2, games });

  it('3 empatados en ciclo: ganados entre ellos iguales → diferencia de puntos total', () => {
    const t = pickleballStandings(['A', 'B', 'C'], [g('A', 'B', [11, 9]), g('B', 'C', [11, 0]), g('C', 'A', [11, 3])]);
    // Todos 1-1. Dif. total: B +9, C −3, A −6.
    expect(order(t)).toEqual(['B', 'C', 'A']);
    expect(t.map((x) => x.decidedBy)).toEqual([undefined, 'dif. de puntos', 'dif. de puntos']);
  });

  it('3 empatados que se reducen a 2 por diferencia total: vuelve al directo entre esos 2', () => {
    const t = pickleballStandings(
      ['A', 'B', 'C', 'D'],
      [g('A', 'B', [11, 5]), g('B', 'C', [11, 9]), g('C', 'A', [11, 9]), g('A', 'D', [11, 0]), g('B', 'D', [11, 1]), g('C', 'D', [11, 5])],
    );
    // A, B y C con 2 victorias; dif. total A +15, B +6, C +6 → A; B y C: B le ganó a C.
    expect(order(t)).toEqual(['A', 'B', 'C', 'D']);
    expect(t.map((x) => x.decidedBy)).toEqual([undefined, 'dif. de puntos', 'enfrentamiento directo', 'partidos ganados']);
  });

  it('empate a 3 por el 2.º lugar: decide la diferencia contra el de arriba antes que los puntos a favor', () => {
    const t = pickleballStandings(
      ['X', 'A', 'B', 'C', 'Y'],
      [
        g('A', 'B', [11, 5]),
        g('B', 'C', [11, 5]),
        g('C', 'A', [11, 5]),
        g('X', 'A', [11, 5]),
        g('X', 'B', [11, 3]),
        g('X', 'C', [11, 9]),
        g('A', 'Y', [11, 3]),
        g('B', 'Y', [15, 5]),
        g('C', 'Y', [11, 7]),
        g('X', 'Y', [11, 0]),
      ],
    );
    const row = (id: string) => t.find((x) => x.id === id)!;
    expect(['A', 'B', 'C'].map((id) => row(id).extra.pointsDiff)).toEqual([2, 2, 2]);
    // Contra X: C −2, A −6, B −8. Por puntos a favor sería C 36, B 34, A 32.
    expect(order(t)).toEqual(['X', 'C', 'A', 'B', 'Y']);
    expect(t.map((x) => x.decidedBy)).toEqual([undefined, 'partidos ganados', 'dif. de puntos contra el de arriba', 'dif. de puntos contra el de arriba', 'partidos ganados']);
  });

  it('juegos, puntos y W.O.', () => {
    expect(g('A', 'B', [11, 7], [9, 11], [11, 4]).totals).toEqual({ games: [2, 1], points: [31, 22] });
    const wo = pickleballMatchResult({ id: 'w', side1: 'A', side2: 'B', games: [], walkover: 1 });
    expect(wo).toMatchObject({ winner: 2, walkover: 1, totals: { games: [0, 1], points: [0, 11] } });
    expect(pickleballStandings(['A', 'B'], [wo]).map((x) => [x.id, x.points])).toEqual([
      ['B', 1],
      ['A', 0],
    ]);
  });
});

describe('ping pong (grupos de la ITTF 3.7.5)', () => {
  let n = 0;
  const g = (side1: string, side2: string, ...games: [number, number][]) => gamesMatchResult({ id: `t${++n}`, side1, side2, games });
  const x3 = (a: number, b: number): [number, number][] => [
    [a, b],
    [a, b],
    [a, b],
  ];

  it('ganar 2, perder jugando 1, W.O. 0 (y el presente gana 11-0 en cada juego que hacía falta)', () => {
    expect(TABLE_TENNIS_POINTS).toEqual({ win: 2, draw: 0, loss: 1, walkoverLoss: 0, retiredLoss: 0 });
    const wo = gamesMatchResult({ id: 'w', side1: 'C', side2: 'A', games: [], walkover: 1, walkoverGames: x3(11, 0) });
    expect(wo).toMatchObject({ winner: 2, walkover: 1, totals: { games: [0, 3], points: [0, 33] } });
    const t = tableTennisStandings(['A', 'B', 'C'], [g('A', 'B', [11, 7], [9, 11], [11, 5], [11, 8]), wo]);
    expect(t.map((x) => [x.id, x.points, x.played])).toEqual([
      ['A', 4, 2],
      ['B', 1, 1],
      ['C', 0, 1],
    ]);
    // PF, PC y Dif. son puntos; «Jue.» lee la dif. de juegos.
    expect(t[0]).toMatchObject({ for: 42 + 33, against: 31, diff: 44 });
    expect(t[0].extra.gamesDiff).toBe(2 + 3);
  });

  it('retiro: el que no terminó suma 0 como en el W.O. (ITTF 3.7.5.1); sus juegos y puntos siguen contando', () => {
    // A le gana a B «11-7 3-5 ret.» (se retira B): los totales vienen completados, 11-7 11-5 11-0.
    const ret: MatchResult = { ...g('A', 'B', [11, 7], [11, 5], [11, 0]), retired: 2 };
    const list = [ret, g('C', 'A', ...x3(11, 9)), g('B', 'C', ...x3(11, 5))];
    const t = tableTennisStandings(['A', 'B', 'C'], list);
    // A 2 + 1 = 3, C 2 + 1 = 3, B 0 + 2 = 2. Con 1 por el retiro, B tendría 3 y serían tres empatados.
    expect(t.map((x) => [x.id, x.points, x.won, x.lost])).toEqual([
      ['C', 3, 1, 1],
      ['A', 3, 1, 1],
      ['B', 2, 1, 1],
    ]);
    expect(t.find((x) => x.id === 'B')).toMatchObject({ for: 12 + 33, against: 33 + 15, extra: { gamesDiff: 0 } });
    // Entre A y C decide el directo (C le ganó a A).
    expect(t[1].decidedBy).toBe('enfrentamiento directo');
    // Una tabla sin `retiredLoss`: el retiro es una derrota más (pádel y tenis dan 1 al que pierde).
    const padel = racketStandings(['A', 'B'], [{ ...r('A', 'B', [6, 4], [6, 0]), retired: 2 }]);
    expect(padel.map((x) => [x.id, x.points])).toEqual([
      ['A', 3],
      ['B', 1],
    ]);
  });

  it('2 empatados: gana el enfrentamiento directo aunque el otro tenga mejor diferencia', () => {
    const t = tableTennisStandings(
      ['A', 'B', 'C', 'D'],
      [
        g('A', 'B', [11, 9], [9, 11], [11, 9], [9, 11], [11, 9]),
        g('B', 'C', ...x3(11, 1)),
        g('C', 'A', [11, 9], [9, 11], [11, 9], [9, 11], [11, 9]),
        g('A', 'D', ...x3(11, 9)),
        g('B', 'D', ...x3(11, 2)),
        g('D', 'C', ...x3(11, 9)),
      ],
    );
    const row = (id: string) => t.find((x) => x.id === id)!;
    expect([row('A').points, row('B').points]).toEqual([5, 5]);
    expect(row('B').extra.gamesDiff).toBeGreaterThan(row('A').extra.gamesDiff);
    expect(order(t)).toEqual(['A', 'B', 'D', 'C']);
    expect(row('B').decidedBy).toBe('enfrentamiento directo');
  });

  it('3 empatados en círculo: dif. de juegos entre ellos y, si sigue, vuelve a empezar solo con los que quedan', () => {
    const t = tableTennisStandings(['A', 'B', 'C'], [g('A', 'B', ...x3(11, 5)), g('B', 'C', [11, 5], [5, 11], [11, 5], [9, 11], [11, 5]), g('C', 'A', [11, 5], [5, 11], [11, 5], [11, 5])]);
    // Todos 3 puntos. Juegos entre ellos: A +3 −2 = +1, B −3 +1 = −2, C −1 +2 = +1 → B abajo; A y C: C le ganó a A.
    expect(order(t)).toEqual(['C', 'A', 'B']);
    expect(t.map((x) => x.decidedBy)).toEqual([undefined, 'enfrentamiento directo', 'dif. de juegos entre empatados']);
  });

  it('3 empatados en círculo con la misma dif. de juegos: decide la dif. de puntos entre ellos', () => {
    const t = tableTennisStandings(
      ['A', 'B', 'C'],
      [
        g('A', 'B', [11, 5], [11, 5], [5, 11], [11, 5]),
        g('B', 'C', [11, 9], [11, 9], [9, 11], [11, 9]),
        g('C', 'A', [11, 8], [11, 8], [8, 11], [11, 8]),
      ],
    );
    // Juegos: todos +2 −2 = 0. Puntos: A +12 −6 = +6, B −12 +4 = −8, C −4 +6 = +2.
    expect(t.map((x) => x.extra.gamesDiff)).toEqual([0, 0, 0]);
    expect(order(t)).toEqual(['A', 'C', 'B']);
    expect(t.map((x) => x.decidedBy)).toEqual([undefined, 'dif. de puntos entre empatados', 'dif. de puntos entre empatados']);
  });

  it('sin haberse enfrentado: dif. de juegos de toda la tabla y después el sorteo', () => {
    const t = tableTennisStandings(['A', 'B', 'C', 'D'], [g('A', 'C', ...x3(11, 4)), g('B', 'D', [11, 4], [4, 11], [11, 4], [11, 4])]);
    expect(order(t)).toEqual(['A', 'B', 'D', 'C']);
    expect(t.map((x) => x.decidedBy)).toEqual([undefined, 'dif. de juegos', 'puntos', 'dif. de juegos']);
    // Todo igual: sorteo (siempre el mismo con la misma semilla).
    const same = [g('A', 'C', ...x3(11, 4)), g('B', 'D', ...x3(11, 4))];
    const a = tableTennisStandings(['A', 'B', 'C', 'D'], same, { lotSeed: 'liga-1' });
    expect(a[1].decidedBy).toBe('sorteo');
    expect(order(tableTennisStandings(['A', 'B', 'C', 'D'], same, { lotSeed: 'liga-1' }))).toEqual(order(a));
  });
});
