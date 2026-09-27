import { describe, expect, it } from 'vitest';
import { assignSlots, findClashes, homeAwayBreaks, roundRobin } from './roundRobin';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);
const key = (a: string, b: string) => [a, b].sort().join('-');

describe('todos contra todos (método del círculo)', () => {
  it.each(Array.from({ length: 13 }, (_, i) => i + 2))('%i participantes: cada par una vez, nadie dos veces por jornada', (n) => {
    const teams = ids(n);
    const rounds = roundRobin(teams);
    expect(rounds).toHaveLength(n % 2 === 0 ? n - 1 : n);
    const pairs = new Map<string, number>();
    const byes: string[] = [];
    for (const r of rounds) {
      const inRound = r.matches.flatMap((f) => [f.home, f.away]);
      expect(new Set(inRound).size).toBe(inRound.length);
      expect(r.matches).toHaveLength(Math.floor(n / 2));
      if (n % 2 === 1) {
        expect(r.bye).not.toBeNull();
        expect(inRound).not.toContain(r.bye);
        byes.push(r.bye!);
      } else expect(r.bye).toBeNull();
      for (const f of r.matches) pairs.set(key(f.home, f.away), (pairs.get(key(f.home, f.away)) ?? 0) + 1);
    }
    expect(pairs.size).toBe((n * (n - 1)) / 2);
    expect([...pairs.values()].every((c) => c === 1)).toBe(true);
    // Con N impar cada uno descansa exactamente una vez.
    if (n % 2 === 1) expect(byes.slice().sort()).toEqual(teams.slice().sort());
  });

  it.each(Array.from({ length: 13 }, (_, i) => i + 2))('%i participantes: local y visita parejos y a lo sumo una racha', (n) => {
    const rounds = roundRobin(ids(n));
    const home: Record<string, number> = {};
    const away: Record<string, number> = {};
    for (const r of rounds) {
      for (const f of r.matches) {
        home[f.home] = (home[f.home] ?? 0) + 1;
        away[f.away] = (away[f.away] ?? 0) + 1;
      }
    }
    for (const t of ids(n)) expect(Math.abs((home[t] ?? 0) - (away[t] ?? 0))).toBeLessThanOrEqual(1);
    const breaks = homeAwayBreaks(rounds);
    expect(Math.max(0, ...Object.values(breaks))).toBeLessThanOrEqual(1);
    // Mínimo teórico con N par: N − 2 rachas en total; con N impar, ninguna.
    expect(Object.values(breaks).reduce((a, b) => a + b, 0)).toBe(n % 2 === 0 ? n - 2 : 0);
  });

  it.each([4, 5, 6, 7, 10])('ida y vuelta con %i: cada par dos veces con la localía cambiada y sin revancha seguida', (n) => {
    const teams = ids(n);
    const rounds = roundRobin(teams, { double: true });
    const single = n % 2 === 0 ? n - 1 : n;
    expect(rounds).toHaveLength(single * 2);
    expect(rounds.map((r) => r.round)).toEqual(Array.from({ length: single * 2 }, (_, i) => i + 1));
    const seen = new Map<string, string[]>();
    for (const r of rounds) for (const f of r.matches) seen.set(key(f.home, f.away), [...(seen.get(key(f.home, f.away)) ?? []), f.home]);
    for (const homes of seen.values()) {
      expect(homes).toHaveLength(2);
      expect(homes[0]).not.toBe(homes[1]);
    }
    for (const t of teams) {
      const h = rounds.flatMap((r) => r.matches).filter((f) => f.home === t).length;
      expect(h).toBe(n - 1);
    }
    const last = rounds[single - 1].matches.map((f) => key(f.home, f.away)).sort();
    const next = rounds[single].matches.map((f) => key(f.home, f.away)).sort();
    expect(next).not.toEqual(last);
    expect(Math.max(...Object.values(homeAwayBreaks(rounds)))).toBeLessThanOrEqual(3);
  });

  it('determinista, con 0 o 1 participante no hay jornadas, y rechaza repetidos', () => {
    expect(roundRobin(ids(6))).toEqual(roundRobin(ids(6)));
    expect(roundRobin(['a'])).toEqual([]);
    expect(() => roundRobin(['a', 'a'])).toThrow('Hay participantes repetidos.');
  });
});

describe('canchas y horas', () => {
  it('llena canchas por hora y deja fuera lo que no cabe', () => {
    const rounds = roundRobin(ids(6));
    const { fixtures, unassigned } = assignSlots(rounds, { courts: ['Cancha 1', 'Cancha 2'], times: ['19:00', '20:00'], dates: ['2026-10-05', '2026-10-12'] });
    expect(fixtures).toHaveLength(15);
    const r1 = fixtures.filter((f) => f.round === 1);
    expect(r1.map((f) => [f.time, f.court])).toEqual([
      ['19:00', 'Cancha 1'],
      ['19:00', 'Cancha 2'],
      ['20:00', 'Cancha 1'],
    ]);
    expect(r1.every((f) => f.date === '2026-10-05')).toBe(true);
    expect(fixtures.filter((f) => f.round === 3).every((f) => f.date === null)).toBe(true);
    expect(unassigned).toEqual([]);
    // Sin choques dentro de una jornada.
    const clashes = findClashes(
      r1.map((f, i) => ({ id: `m${i}`, date: f.date!, time: f.time!, court: f.court, participants: [f.home, f.away] })),
    );
    expect(clashes).toEqual([]);

    const tight = assignSlots(rounds, { courts: ['C1'], times: ['19:00', '20:00'] });
    expect(tight.unassigned).toHaveLength(5);
    expect(tight.unassigned.every((f) => f.time === null && f.court === null)).toBe(true);
  });

  it('rota el orden para que la última hora no le toque siempre al mismo partido', () => {
    const rounds = roundRobin(ids(4));
    const { fixtures } = assignSlots(rounds, { courts: ['C1'], times: ['19:00', '20:00'] });
    const late = fixtures.filter((f) => f.time === '20:00').map((f) => rounds[f.round - 1].matches.indexOf(rounds[f.round - 1].matches.find((m) => m.home === f.home)!));
    expect(new Set(late).size).toBeGreaterThan(1);
  });

  it('avisa choques de cancha y de participante', () => {
    const clashes = findClashes([
      { id: 'a', date: '2026-10-05', time: '19:00', court: 'C1', participants: ['t1', 't2'] },
      { id: 'b', date: '2026-10-05', time: '19:30', court: 'C1', participants: ['t3', 't4'] },
      { id: 'c', date: '2026-10-05', time: '19:45', court: 'C2', participants: ['t1', 't5'] },
      { id: 'd', date: '2026-10-05', time: '20:00', court: 'C1', participants: ['t6', 't7'] },
      { id: 'e', date: '2026-10-06', time: '19:00', court: 'C1', participants: ['t1', 't2'] },
    ]);
    expect(clashes.map((c) => [c.kind, c.a, c.b, c.who])).toEqual([
      ['court', 'a', 'b', 'C1'],
      ['participant', 'a', 'c', 't1'],
      ['court', 'b', 'd', 'C1'],
    ]);
    expect(clashes[0].message).toBe('Dos partidos en C1 a la misma hora.');
    expect(findClashes([{ id: 'x', date: '2026-10-05', time: '19:00', minutes: 30, participants: ['t1'] }, { id: 'y', date: '2026-10-05', time: '19:30', participants: ['t1'] }])).toEqual([]);
  });
});
