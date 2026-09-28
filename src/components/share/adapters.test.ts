import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { StandingRow } from '../../sports/types';
import { leadersShare, medalPointsShare, plain, pointsText, standingsShare, type LeaderColumnLike, type TableColumnLike } from './adapters';

const row = (id: string, rank: number, points: number, over: Partial<StandingRow> = {}): StandingRow => ({
  id,
  rank,
  points,
  played: 5,
  won: 3,
  drawn: 0,
  lost: 2,
  for: 40,
  against: 30,
  diff: 10,
  extra: {},
  ...over,
});

describe('de las tablas de la app a la imagen', () => {
  it('solo sirve lo que es texto o número', () => {
    expect(plain('+3')).toBe('+3');
    expect(plain(7)).toBe('7');
    expect(plain(0)).toBe('0');
    expect(plain(null)).toBe('');
    expect(plain(undefined)).toBe('');
    expect(plain(true)).toBe('');
    expect(plain(createElement('b', null, 'x'))).toBe('');
  });

  it('puntos con coma decimal, como en la app', () => {
    expect(pointsText(12)).toBe('12');
    expect(pointsText(7.5)).toBe('7,5');
    expect(pointsText(3.333)).toBe('3,3');
  });

  it('tabla de posiciones: las columnas de la app (las de la computadora, opcionales) y los puntos al final', () => {
    const columns: TableColumnLike<StandingRow>[] = [
      { label: 'PJ', value: (r) => r.played },
      { label: 'GF', value: (r) => r.for, wide: true },
      { label: 'Dif.', value: (r) => (r.diff > 0 ? `+${r.diff}` : r.diff) },
    ];
    const spec = standingsShare({
      title: 'Liga de fútbol',
      subtitle: 'Tabla de posiciones',
      sections: [{ heading: 'Grupo A', rows: [row('t1', 1, 9), row('t2', 2, 6, { diff: -4 })] }],
      columns,
      nameOf: (id) => (id === 't1' ? 'Tigres' : 'Leones'),
      rowExtra: (id) => ({ dot: id === 't1' ? '#f59e0b' : null }),
      nameLabel: 'Equipo',
    });
    expect(spec.kind).toBe('table');
    expect(spec.nameLabel).toBe('Equipo');
    expect(spec.columns).toEqual([
      { label: 'PJ', optional: false },
      { label: 'GF', optional: true },
      { label: 'Dif.', optional: false },
      { label: 'Pts', strong: true },
    ]);
    expect(spec.sections[0].heading).toBe('Grupo A');
    expect(spec.sections[0].rows).toEqual([
      { rank: 1, name: 'Tigres', dot: '#f59e0b', values: ['5', '40', '+10', 9] },
      { rank: 2, name: 'Leones', dot: null, values: ['5', '40', '-4', 6] },
    ]);
  });

  it('líderes: el orden de LeadersTable (primera columna, luego el nombre), puesto compartido y tope', () => {
    type R = { player: string; team: string; goals: number; games: number };
    const columns: LeaderColumnLike<R>[] = [
      { label: 'G', value: (r) => r.goals },
      { label: 'Prom', value: (r) => r.goals / r.games, show: (r) => (r.goals / r.games).toFixed(2), wide: true },
    ];
    const names: Record<string, string> = { a: 'Zoe', b: 'Ana', c: 'Luis', d: 'Pedro' };
    const spec = leadersShare<R>({
      title: 'Liga',
      subtitle: 'Goleadores',
      rows: [
        { player: 'a', team: 't1', goals: 5, games: 5 },
        { player: 'b', team: 't2', goals: 5, games: 2 },
        { player: 'c', team: 't1', goals: 7, games: 4 },
        { player: 'd', team: 'x', goals: 1, games: 1 },
      ],
      columns,
      nameOf: (id) => names[id],
      teamOf: (key) => (key === 't1' ? { name: 'Tigres', color: '#f59e0b' } : key === 't2' ? { name: 'Leones' } : null),
      limit: 3,
    });
    expect(spec.nameLabel).toBe('Jugador');
    expect(spec.columns).toEqual([
      { label: 'G', strong: true, optional: false },
      { label: 'Prom', strong: false, optional: true },
    ]);
    const rows = spec.sections[0].rows;
    expect(rows.map((r) => [r.rank, r.name])).toEqual([
      [1, 'Luis'],
      [2, 'Ana'],
      [2, 'Zoe'],
    ]);
    expect(rows[0]).toMatchObject({ sub: 'Tigres', dot: '#f59e0b', values: ['7', '1.75'] });
    expect(rows[1]).toMatchObject({ sub: 'Leones', dot: null });
  });

  it('puntos con medallas (natación): medallas opcionales, puntos en negrita, club borrado', () => {
    const spec = medalPointsShare({
      title: 'Copa Delfín',
      subtitle: 'Puntos por club',
      rows: [
        { id: 'c1', rank: 1, points: 42.5, gold: 3, silver: 1, bronze: 0 },
        { id: 'c2', rank: 2, points: 30, gold: 1, silver: 2, bronze: 4 },
      ],
      who: (id) => (id === 'c1' ? { name: 'Delfines', color: '#0ea5e9' } : null),
      note: 'Puntos por puesto: 6-4-3-2-1.',
    });
    expect(spec.nameLabel).toBe('Club');
    expect(spec.columns.map((c) => [c.label, !!c.optional, !!c.strong])).toEqual([
      ['Oro', true, false],
      ['Plata', true, false],
      ['Bronce', true, false],
      ['Pts', false, true],
    ]);
    expect(spec.sections[0].rows).toEqual([
      { rank: 1, name: 'Delfines', dot: '#0ea5e9', values: [3, 1, 0, '42,5'] },
      { rank: 2, name: '(borrado)', dot: null, values: [1, 2, 4, '30'] },
    ]);
    expect(spec.note).toBe('Puntos por puesto: 6-4-3-2-1.');
  });
});
