import { describe, expect, it } from 'vitest';
import { defaultPoints, medalTable, placeResults, POINTS_6_LANES, POINTS_8_LANES, splitPoints, teamPoints, type SwimResult } from './results';

const r = (entryId: string, time: number | null, over: Partial<SwimResult> = {}): SwimResult => ({
  entryId,
  time,
  status: 'ok',
  gender: 'F',
  ageGroup: '11-12',
  teamId: 'club-a',
  ...over,
});

const view = (rows: ReturnType<typeof placeResults>) => rows.map((x) => [x.entryId, x.place, x.points]);

describe('puestos y puntos', () => {
  it('por tiempo; DQ, DNS y DNF sin puesto ni puntos', () => {
    const rows = placeResults([
      r('a', 3000),
      r('b', 2900),
      r('c', 3100),
      r('d', 2800, { status: 'dq' }),
      r('e', null, { status: 'dns' }),
      r('f', 3500, { status: 'dnf' }),
    ]);
    expect(view(rows)).toEqual([
      ['b', 1, 6],
      ['a', 2, 4],
      ['c', 3, 3],
      ['d', null, 0],
      ['e', null, 0],
      ['f', null, 0],
    ]);
  });

  it('las series mezclan categorías, pero el puesto es por categoría y sexo', () => {
    const rows = placeResults([
      r('a', 3000),
      r('b', 2900, { ageGroup: '13-14' }),
      r('c', 3100),
      r('d', 3050, { ageGroup: '13-14' }),
      r('e', 2950, { gender: 'M' }),
    ]);
    expect(view(rows)).toEqual([
      ['a', 1, 6],
      ['c', 2, 4],
      ['b', 1, 6],
      ['d', 2, 4],
      ['e', 1, 6],
    ]);
  });

  it('empate: comparten puesto y se reparten los puntos', () => {
    const rows = placeResults([r('a', 2900), r('b', 2900), r('c', 3000), r('d', 3100)]);
    expect(view(rows)).toEqual([
      ['a', 1, 5],
      ['b', 1, 5],
      ['c', 3, 3],
      ['d', 4, 2],
    ]);
    expect(rows.map((x) => x.tied)).toEqual([true, true, false, false]);
  });

  it('triple empate con la tabla de 8 carriles', () => {
    const rows = placeResults([r('a', 2800), r('b', 2900), r('c', 2900), r('d', 2900), r('e', 3000)], POINTS_8_LANES);
    expect(view(rows)).toEqual([
      ['a', 1, 9],
      ['b', 2, 6],
      ['c', 2, 6],
      ['d', 2, 6],
      ['e', 5, 4],
    ]);
  });

  it('empate en el último puesto con puntos: se reparte con el que no da puntos', () => {
    expect(splitPoints(5, 2, POINTS_6_LANES)).toBe(0.5);
    expect(splitPoints(6, 1, POINTS_6_LANES)).toBe(0);
    expect(splitPoints(2, 3, [9, 7, 6, 5])).toBe(6);
  });

  it('tabla por defecto según los carriles', () => {
    expect(defaultPoints(8)).toEqual([9, 7, 6, 5, 4, 3, 2, 1]);
    expect(defaultPoints(6)).toEqual([6, 4, 3, 2, 1]);
  });
});

describe('puntos por club y medallero', () => {
  const ev1 = placeResults([
    r('a1', 2900, { teamId: 'club-a' }),
    r('b1', 2900, { teamId: 'club-b' }),
    r('c1', 3000, { teamId: 'club-c' }),
    r('a2', 3100, { teamId: 'club-a' }),
  ]);
  const ev2 = placeResults([
    r('b2', 6000, { teamId: 'club-b' }),
    r('c2', 6100, { teamId: 'club-c' }),
    r('a3', 6200, { teamId: 'club-a', status: 'dq' }),
    r('x', 6300, { teamId: null }),
  ]);

  it('suma los puntos de todas las pruebas', () => {
    // ev1: a1 y b1 empatan en el 1.º → 5 y 5; c1 3.º → 3; a2 4.º → 2. ev2: b2 6, c2 4, x 3 (sin club).
    expect(teamPoints([...ev1, ...ev2]).map((t) => [t.teamId, t.points, t.rank])).toEqual([
      ['club-b', 11, 1],
      ['club-a', 7, 2],
      ['club-c', 7, 2],
    ]);
  });

  it('puntos repartidos en tercios no dejan decimales sueltos', () => {
    const rows = placeResults([r('a', 2900, { teamId: 't' }), r('b', 2900, { teamId: 't' }), r('c', 2900, { teamId: 't' })], POINTS_8_LANES);
    expect(rows[0].points).toBeCloseTo(22 / 3, 10);
    expect(teamPoints(rows)[0].points).toBe(22);
  });

  it('medallero: oro, plata, bronce; empate en el 1.º son dos oros y no hay plata', () => {
    const medals = medalTable([...ev1, ...ev2]);
    expect(medals.map((m) => [m.id, m.gold, m.silver, m.bronze, m.rank])).toEqual([
      ['club-b', 2, 0, 0, 1],
      ['club-a', 1, 0, 0, 2],
      ['club-c', 0, 1, 1, 3],
    ]);
  });

  it('medallero por nadador', () => {
    const medals = medalTable(ev1, (x) => x.entryId);
    expect(medals.map((m) => m.id)).toEqual(['a1', 'b1', 'c1']);
    expect(medals.map((m) => m.rank)).toEqual([1, 1, 3]);
  });
});
