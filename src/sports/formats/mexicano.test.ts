import { describe, expect, it } from 'vitest';
import { mexicanoRound } from './mexicano';
import { socialStandings, type ScoredRound, type SocialRound } from './social';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

/** Juega una ronda con marcadores fijos (suman 24) para simular la noche. */
function play(r: SocialRound, k: number): ScoredRound {
  return {
    rests: r.rests,
    matches: r.matches.map((m, i) => {
      const s1 = 6 + ((k * 7 + i * 5) % 13);
      return { side1: m.side1, side2: m.side2, score1: s1, score2: 24 - s1 };
    }),
  };
}

function simulate(players: string[], courts: number, rounds: number, seed = 1) {
  const history: ScoredRound[] = [];
  const out: SocialRound[] = [];
  for (let i = 0; i < rounds; i++) {
    const r = mexicanoRound(players, history, { courts, seed });
    out.push(r);
    history.push(play(r, i));
  }
  return { history, out };
}

describe('mexicano', () => {
  it('ronda 1 al azar: determinista con la semilla y todos juegan una vez', () => {
    const a = mexicanoRound(ids(8), [], { courts: 2, seed: 'x' });
    expect(a).toEqual(mexicanoRound(ids(8), [], { courts: 2, seed: 'x' }));
    expect(a).not.toEqual(mexicanoRound(ids(8), [], { courts: 2, seed: 'y' }));
    const all = a.matches.flatMap((m) => [...m.side1, ...m.side2]);
    expect(new Set(all).size).toBe(8);
    expect(a.rests).toEqual([]);
    expect(a.round).toBe(1);
  });

  it('ronda 1 por nivel: cancha 1 = 1+4 contra 2+3 de los mejores', () => {
    const levels = { p1: 2, p2: 5.5, p3: 4, p4: 3, p5: 6, p6: 1, p7: 3.5, p8: 2.5 };
    const r = mexicanoRound(ids(8), [], { courts: 2, firstRound: 'level', levels });
    // Por nivel: p5 6, p2 5.5, p3 4, p7 3.5, p4 3, p8 2.5, p1 2, p6 1.
    expect(r.matches[0]).toEqual({ court: 1, side1: ['p5', 'p7'], side2: ['p2', 'p3'] });
    expect(r.matches[1]).toEqual({ court: 2, side1: ['p4', 'p6'], side2: ['p8', 'p1'] });
  });

  it('las rondas siguientes salen de la tabla: 1+4 vs 2+3, 5+8 vs 6+7', () => {
    const players = ids(8);
    const history: ScoredRound[] = [
      {
        rests: [],
        matches: [
          { side1: ['p1', 'p2'], side2: ['p3', 'p4'], score1: 20, score2: 4 },
          { side1: ['p5', 'p6'], side2: ['p7', 'p8'], score1: 10, score2: 14 },
        ],
      },
    ];
    const order = socialStandings(players, history).map((r) => r.id);
    expect(order).toEqual(['p1', 'p2', 'p7', 'p8', 'p5', 'p6', 'p3', 'p4']);
    const r = mexicanoRound(players, history, { courts: 2 });
    expect(r.round).toBe(2);
    expect(r.matches).toEqual([
      { court: 1, side1: ['p1', 'p8'], side2: ['p2', 'p7'] },
      { court: 2, side1: ['p5', 'p4'], side2: ['p6', 'p3'] },
    ]);
  });

  it('10 jugadores y 2 canchas: descansan los que menos han descansado (cada uno 1 vez en 5 rondas)', () => {
    const players = ids(10);
    const { out } = simulate(players, 2, 5);
    const rests = out.flatMap((r) => r.rests);
    expect(rests).toHaveLength(10);
    expect(new Set(rests).size).toBe(10);
    for (const r of out) expect(r.matches).toHaveLength(2);
  });

  it('9 jugadores: uno descansa por ronda y nadie repite descanso antes que todos descansen', () => {
    const players = ids(9);
    const { out } = simulate(players, 2, 12, 4);
    const count: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
    for (const r of out) {
      expect(r.rests).toHaveLength(1);
      const [p] = r.rests;
      expect(count[p]).toBe(Math.min(...Object.values(count)));
      count[p]++;
    }
  });

  it('a igualdad de descansos, descansa el que va más abajo en la tabla', () => {
    const players = ids(5);
    const history: ScoredRound[] = [{ rests: ['p5'], matches: [{ side1: ['p1', 'p2'], side2: ['p3', 'p4'], score1: 15, score2: 9 }] }];
    // Tabla: p1 y p2 15, p3 y p4 9, p5 0 (no ha jugado). p5 ya descansó: entre los demás baja el último, p4.
    const r = mexicanoRound(players, history, { courts: 1 });
    expect(r.rests).toEqual(['p4']);
  });

  it('errores en español', () => {
    expect(() => mexicanoRound(ids(3), [], { courts: 1 })).toThrow('El mexicano necesita al menos 4 jugadores.');
    expect(() => mexicanoRound(['a', 'a', 'b', 'c'], [], { courts: 1 })).toThrow('Hay jugadores repetidos.');
    expect(() => mexicanoRound(ids(8), [], { courts: 0 })).toThrow('Hace falta al menos una cancha.');
  });
});
