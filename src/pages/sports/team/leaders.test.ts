import { describe, expect, it } from 'vitest';
import { rankLeaders, type LeaderColumn } from './leaders';

type Row = { player: string; goals: number; assists: number };
const cols: LeaderColumn<Row>[] = [
  { key: 'goals', label: 'G', title: 'Goles', value: (r) => r.goals },
  { key: 'assists', label: 'A', title: 'Asistencias', value: (r) => r.assists },
];
const names: Record<string, string> = { a: 'Jugador Uno', b: 'Jugador Dos', c: 'Jugador Tres' };
const nameOf = (id: string) => names[id] ?? '';

describe('rankLeaders', () => {
  const rows: Row[] = [
    { player: 'a', goals: 2, assists: 1 },
    { player: 'b', goals: 5, assists: 0 },
    { player: 'c', goals: 2, assists: 3 },
  ];

  it('ordena por la columna y comparte el puesto si empatan', () => {
    const out = rankLeaders(rows, cols, cols[0], nameOf);
    expect(out.map((x) => [x.r.player, x.rank])).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 2],
    ]);
  });

  it('por otra columna, con el límite', () => {
    const out = rankLeaders(rows, cols, cols[1], nameOf, 2);
    expect(out.map((x) => x.r.player)).toEqual(['c', 'a']);
  });
});
