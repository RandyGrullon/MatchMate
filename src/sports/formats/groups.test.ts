import { describe, expect, it } from 'vitest';
import { crossGroups, groupLetter, snakeGroups, sortByLevel } from './groups';
import { createBracket, seedOrder, type Bracket } from './knockout';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `e${i + 1}`);

describe('grupos en zigzag', () => {
  it('reparte 12 en 3 grupos: 1-6-7-12, 2-5-8-11, 3-4-9-10', () => {
    expect(snakeGroups(ids(12), 3)).toEqual([
      ['e1', 'e6', 'e7', 'e12'],
      ['e2', 'e5', 'e8', 'e11'],
      ['e3', 'e4', 'e9', 'e10'],
    ]);
  });

  it('11 en 4 grupos: tamaños 3-3-3-2', () => {
    const g = snakeGroups(ids(11), 4);
    expect(g.map((x) => x.length)).toEqual([3, 3, 3, 2]);
    expect(g[3]).toEqual(['e4', 'e5']);
  });

  it('ordena por nivel con sorteo determinista en los empates', () => {
    const lv = { a: 3, b: 5, c: 3, d: 1 };
    const one = sortByLevel(['a', 'b', 'c', 'd'], lv, 'x');
    expect(one[0]).toBe('b');
    expect(one[3]).toBe('d');
    expect(sortByLevel(['c', 'a', 'd', 'b'], lv, 'x')).toEqual(one);
  });

  it('letras', () => {
    expect([0, 1, 25, 26, 27].map(groupLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB']);
  });
});

/** Ronda en que se pueden cruzar dos participantes del cuadro. */
function meetRound(b: Bracket, x: string, y: string): number {
  const order = seedOrder(b.size);
  const leaf = (id: string) => order.indexOf(b.seeds.indexOf(id) + 1);
  return Math.floor(Math.log2(leaf(x) ^ leaf(y))) + 1;
}

describe('cruces de grupos al cuadro', () => {
  it('2 grupos, pasan 2: 1A–2B y 1B–2A; los del mismo grupo solo en la final', () => {
    const q = crossGroups(
      [
        ['a1', 'a2', 'a3'],
        ['b1', 'b2', 'b3'],
      ],
      2,
    );
    expect(q.map((x) => x.label)).toEqual(['1A', '1B', '2A', '2B']);
    const b = createBracket(q.map((x) => x.id));
    expect(b.matches.filter((m) => m.round === 1).map((m) => [m.side1, m.side2])).toEqual([
      ['a1', 'b2'],
      ['b1', 'a2'],
    ]);
  });

  it('4 grupos, pasan 2: 1A–2B, 1B–2A, 1C–2D, 1D–2C y mismos grupos en mitades opuestas', () => {
    const groups = ['a', 'b', 'c', 'd'].map((g) => [`${g}1`, `${g}2`, `${g}3`]);
    const q = crossGroups(groups, 2);
    const b = createBracket(q.map((x) => x.id));
    const r1 = b.matches.filter((m) => m.round === 1).map((m) => [m.side1, m.side2].sort().join('-'));
    expect(r1.sort()).toEqual(['a1-b2', 'a2-b1', 'c1-d2', 'c2-d1']);
    for (const g of ['a', 'b', 'c', 'd']) expect(meetRound(b, `${g}1`, `${g}2`)).toBe(3);
  });

  it('3 grupos, pasan 2: byes para 1A y 1B, nadie repite rival de grupo en la primera ronda', () => {
    const groups = ['a', 'b', 'c'].map((g) => [`${g}1`, `${g}2`, `${g}3`, `${g}4`]);
    const q = crossGroups(groups, 2);
    const b = createBracket(q.map((x) => x.id));
    expect(b.matches.filter((m) => m.round === 1 && m.bye).map((m) => m.winner)).toEqual(['a1', 'b1']);
    for (const m of b.matches.filter((x) => x.round === 1 && !x.bye)) expect(m.side1![0]).not.toBe(m.side2![0]);
    for (const g of ['a', 'b', 'c']) expect(meetRound(b, `${g}1`, `${g}2`)).toBeGreaterThanOrEqual(2);
    // a y b tienen a sus dos en mitades opuestas (solo se cruzan en la final).
    expect(meetRound(b, 'a1', 'a2')).toBe(3);
    expect(meetRound(b, 'b1', 'b2')).toBe(3);
  });

  it('grupo con menos clasificados de los pedidos: pasan los que hay', () => {
    const q = crossGroups([['a1', 'a2'], ['b1']], 2);
    expect(q.map((x) => x.id)).toEqual(['a1', 'b1', 'a2']);
  });
});
