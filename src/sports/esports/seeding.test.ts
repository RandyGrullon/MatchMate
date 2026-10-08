import { describe, expect, it } from 'vitest';
import { balanceTeams, entryStrength, seedEntries, type FreeAgent, type SeedEntry } from '.';

const agents = (ords: (number | null)[]): FreeAgent[] => ords.map((ordinal, i) => ({ userId: `u${i + 1}`, ordinal }));

describe('entryStrength', () => {
  it('promedio de los mejores con rango', () => {
    expect(entryStrength([10, 20, 30, 40, 50], 5)).toBe(30);
    expect(entryStrength([10, 20, 30, 40, 50, 60, 70], 5)).toBe(50);
    expect(entryStrength([null, 40, null, 20], 5)).toBe(30);
    expect(entryStrength([null, null], 5)).toBeNull();
    expect(entryStrength([], 3)).toBeNull();
    expect(entryStrength([7], 1)).toBe(7);
  });
});

describe('seedEntries', () => {
  const entries: SeedEntry[] = [
    { id: 'a', ordinals: [10, 10] },
    { id: 'b', ordinals: [30, 30] },
    { id: 'c', ordinals: [null] },
    { id: 'd', ordinals: [20, 20] },
    { id: 'e', ordinals: [20, null] },
    { id: 'f', ordinals: [] },
  ];

  it('por rango: mayor primero, sin rango al final, empates por sorteo estable', () => {
    const out = seedEntries(entries, 'rank', { seed: 'ev1', teamSize: 2 });
    expect(out[0]).toBe('b');
    expect(out.slice(1, 3).sort()).toEqual(['d', 'e']);
    expect(out[3]).toBe('a');
    expect(out.slice(4).sort()).toEqual(['c', 'f']);
    expect(seedEntries(entries, 'rank', { seed: 'ev1', teamSize: 2 })).toEqual(out);
    // Los empatados se ordenan por lotValue con la semilla: con otra semilla puede cambiar, pero siempre igual.
    const other = seedEntries(entries, 'rank', { seed: 'otra', teamSize: 2 });
    expect(other[0]).toBe('b');
    expect(other.length).toBe(6);
  });

  it('al azar con la semilla: misma semilla, mismo orden; es una permutación', () => {
    const a = seedEntries(entries, 'random', { seed: 'evento-9', teamSize: 2 });
    expect(seedEntries(entries, 'random', { seed: 'evento-9', teamSize: 2 })).toEqual(a);
    expect(a.slice().sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    const many = new Set(Array.from({ length: 20 }, (_, i) => seedEntries(entries, 'random', { seed: `s${i}`, teamSize: 2 }).join()));
    expect(many.size).toBeGreaterThan(1);
  });

  it('a mano: el orden dado, los que falten al final, sin repetir ni inventar', () => {
    expect(seedEntries(entries, 'manual', { seed: '', teamSize: 2, manual: ['d', 'x', 'a', 'd'] })).toEqual(['d', 'a', 'b', 'c', 'e', 'f']);
    expect(seedEntries(entries, 'manual', { seed: '', teamSize: 2 })).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('ids repetidos en la entrada salen una vez', () => {
    expect(seedEntries([...entries, { id: 'a', ordinals: [99] }], 'rank', { seed: 's', teamSize: 2 }).filter((x) => x === 'a')).toHaveLength(1);
  });
});

describe('balanceTeams', () => {
  it('10 agentes de rango 1…10 en equipos de 5: serpiente, fuerzas 28 y 27', () => {
    const { teams, leftover } = balanceTeams(agents([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), { teamSize: 5, subs: 0, seed: 'x' });
    expect(leftover).toEqual([]);
    expect(teams.map((t) => t.strength)).toEqual([28, 27]);
    expect(teams[0].members.map((m) => m.userId)).toEqual(['u10', 'u7', 'u6', 'u3', 'u2']);
    expect(teams[1].members.map((m) => m.userId)).toEqual(['u9', 'u8', 'u5', 'u4', 'u1']);
    expect(teams[0].members[0].role).toBe('captain');
    expect(teams[1].members[0]).toEqual({ userId: 'u9', role: 'captain' });
    expect(teams.flatMap((t) => t.members.slice(1).map((m) => m.role)).every((r) => r === 'member')).toBe(true);
  });

  it('11 con 1 suplente: el 11.º va al más débil', () => {
    const { teams, leftover } = balanceTeams(agents([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), { teamSize: 5, subs: 1, seed: 'x' });
    expect(leftover).toEqual([]);
    expect(teams.map((t) => t.strength)).toEqual([33, 32]);
    expect(teams[1].members[5]).toEqual({ userId: 'u1', role: 'sub' });
    expect(teams[0].members).toHaveLength(5);
  });

  it('sin lugar de suplente: sobran', () => {
    const { teams, leftover } = balanceTeams(agents([1, 2, 3, 4, 5, 6, 7]), { teamSize: 3, subs: 0, seed: 'x' });
    expect(teams).toHaveLength(2);
    expect(leftover).toEqual(['u1']);
    const more = balanceTeams(agents([1, 2, 3, 4, 5, 6, 7, 8, 9]), { teamSize: 3, subs: 1, seed: 'x' });
    // 3 equipos de 3 (9) sin sobrantes.
    expect(more.teams).toHaveLength(3);
    const subs = balanceTeams(agents([9, 8, 7, 6, 5, 4, 3, 2]), { teamSize: 3, subs: 1, seed: 'x' });
    expect(subs.teams).toHaveLength(2);
    expect(subs.teams.map((t) => t.members.filter((m) => m.role === 'sub').length)).toEqual([1, 1]);
    expect(subs.leftover).toEqual([]);
  });

  it('menos que un equipo: todos sobran', () => {
    expect(balanceTeams(agents([5, null, 3]), { teamSize: 5, subs: 2, seed: 'x' })).toEqual({ teams: [], leftover: ['u1', 'u3', 'u2'] });
  });

  it('sin rangos: reparto por sorteo estable (misma semilla, mismo resultado)', () => {
    const list = agents([null, null, null, null, null, null]);
    const a = balanceTeams(list, { teamSize: 3, subs: 0, seed: 'ev' });
    const b = balanceTeams(list.slice().reverse(), { teamSize: 3, subs: 0, seed: 'ev' });
    expect(a).toEqual(b);
    expect(a.teams.map((t) => t.strength)).toEqual([null, null]);
    expect(a.teams.flatMap((t) => t.members.map((m) => m.userId)).sort()).toEqual(list.map((x) => x.userId).sort());
  });

  it('los sin rango van al final y no suman fuerza', () => {
    const { teams } = balanceTeams(agents([null, 50, 40, null]), { teamSize: 2, subs: 0, seed: 'z' });
    expect(teams.map((t) => t.members[0].userId)).toEqual(['u2', 'u3']);
    expect(teams.map((t) => t.strength)).toEqual([50, 40]);
  });
});
