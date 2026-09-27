import { describe, expect, it } from 'vitest';
import { centerOutLanes, heatSizes, seedHeats, type Heat, type SeedEntry } from './seeding';

/** n nadadores con tiempos crecientes: s1 el más rápido. */
const swimmers = (n: number, nt = 0): SeedEntry[] => [
  ...Array.from({ length: n }, (_, k) => ({ id: `s${k + 1}`, seed: 3000 + k * 10 })),
  ...Array.from({ length: nt }, (_, k) => ({ id: `nt${k + 1}`, seed: null })),
];

const laneOf = (heats: Heat[], id: string) => {
  for (const h of heats) {
    const l = h.lanes.find((x) => x.entryId === id);
    if (l) return { heat: h.n, lane: l.lane };
  }
  return null;
};

const ids = (h: Heat) => h.lanes.map((l) => l.entryId);

describe('orden de carriles', () => {
  it('del centro hacia afuera', () => {
    expect(centerOutLanes(8)).toEqual([4, 5, 3, 6, 2, 7, 1, 8]);
    expect(centerOutLanes(6)).toEqual([3, 4, 2, 5, 1, 6]);
    expect(centerOutLanes(10)).toEqual([5, 6, 4, 7, 3, 8, 2, 9, 1, 10]);
    expect(centerOutLanes(5)).toEqual([3, 2, 4, 1, 5]);
    expect(centerOutLanes(0)).toEqual([]);
  });
});

describe('tamaño de las series', () => {
  it('llenas desde la última y mínimo 3 en la primera', () => {
    expect(heatSizes(5, 8)).toEqual([5]);
    expect(heatSizes(8, 8)).toEqual([8]);
    expect(heatSizes(9, 8)).toEqual([3, 6]);
    expect(heatSizes(10, 8)).toEqual([3, 7]);
    expect(heatSizes(11, 8)).toEqual([3, 8]);
    expect(heatSizes(13, 8)).toEqual([5, 8]);
    expect(heatSizes(16, 8)).toEqual([8, 8]);
    expect(heatSizes(17, 8)).toEqual([3, 6, 8]);
    expect(heatSizes(7, 6)).toEqual([3, 4]);
    expect(heatSizes(0, 8)).toEqual([]);
  });

  it('el mínimo es configurable', () => {
    expect(heatSizes(9, 8, 1)).toEqual([1, 8]);
    expect(heatSizes(9, 8, 2)).toEqual([2, 7]);
  });
});

describe('siembra', () => {
  it('5 nadadores: una serie, el mejor en el 4 y el NT afuera', () => {
    const heats = seedHeats([
      { id: 'a', seed: 3000 },
      { id: 'b', seed: 2900 },
      { id: 'c', seed: 3100 },
      { id: 'd', seed: null },
      { id: 'e', seed: 2800 },
    ]);
    expect(heats).toHaveLength(1);
    expect(heats[0].lanes.map((l) => [l.lane, l.entryId])).toEqual([
      [2, 'd'],
      [3, 'a'],
      [4, 'e'],
      [5, 'b'],
      [6, 'c'],
    ]);
  });

  it('8 nadadores: una serie llena', () => {
    const heats = seedHeats(swimmers(8));
    expect(heats).toHaveLength(1);
    expect(laneOf(heats, 's1')).toEqual({ heat: 1, lane: 4 });
    expect(laneOf(heats, 's8')).toEqual({ heat: 1, lane: 8 });
  });

  it('13 nadadores: la serie más rápida al final', () => {
    const heats = seedHeats(swimmers(13));
    expect(heats.map((h) => h.lanes.length)).toEqual([5, 8]);
    expect(ids(heats[1]).sort()).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']);
    expect(laneOf(heats, 's1')).toEqual({ heat: 2, lane: 4 });
    expect(laneOf(heats, 's2')).toEqual({ heat: 2, lane: 5 });
    expect(laneOf(heats, 's9')).toEqual({ heat: 1, lane: 4 });
    expect(heats.map((h) => h.n)).toEqual([1, 2]);
  });

  it('17 nadadores: la primera serie se completa a 3 con los más lentos de la segunda', () => {
    const heats = seedHeats(swimmers(17));
    expect(heats.map((h) => h.lanes.length)).toEqual([3, 6, 8]);
    expect(ids(heats[0]).sort()).toEqual(['s15', 's16', 's17']);
    expect(laneOf(heats, 's15')).toEqual({ heat: 1, lane: 4 });
    expect(laneOf(heats, 's9')).toEqual({ heat: 2, lane: 4 });
    expect(laneOf(heats, 's14')).toEqual({ heat: 2, lane: 7 });
    expect(heats.flatMap(ids)).toHaveLength(17);
    expect(new Set(heats.flatMap(ids)).size).toBe(17);
  });

  it('los sin tiempo (NT) van en las primeras series', () => {
    const heats = seedHeats(swimmers(9, 4));
    expect(heats.map((h) => h.lanes.length)).toEqual([5, 8]);
    expect(ids(heats[0]).sort()).toEqual(['nt1', 'nt2', 'nt3', 'nt4', 's9']);
    expect(laneOf(heats, 's9')).toEqual({ heat: 1, lane: 4 });
    expect(heats[0].lanes.filter((l) => l.seed == null).map((l) => l.lane)).toEqual([2, 3, 5, 6]);
  });

  it('todos sin tiempo: se reparten igual', () => {
    const heats = seedHeats(swimmers(0, 10));
    expect(heats.map((h) => h.lanes.length)).toEqual([3, 7]);
  });

  it('piscina de 6 carriles', () => {
    const heats = seedHeats(swimmers(7), { lanes: 6 });
    expect(heats.map((h) => h.lanes.length)).toEqual([3, 4]);
    expect(heats[1].lanes.map((l) => [l.lane, l.entryId])).toEqual([
      [2, 's3'],
      [3, 's1'],
      [4, 's2'],
      [5, 's4'],
    ]);
  });

  it('orden de carriles propio (piscina de 8 usando solo 6)', () => {
    const heats = seedHeats(swimmers(6), { laneOrder: [4, 5, 3, 6, 2, 7] });
    expect(heats[0].lanes.map((l) => l.lane)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('empates de siembra: queda el orden de inscripción', () => {
    const heats = seedHeats([
      { id: 'x', seed: 3000 },
      { id: 'y', seed: 3000 },
    ]);
    expect(laneOf(heats, 'x')?.lane).toBe(4);
    expect(laneOf(heats, 'y')?.lane).toBe(5);
  });

  it('sin inscritos no hay series', () => {
    expect(seedHeats([])).toEqual([]);
  });
});
