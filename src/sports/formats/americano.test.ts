import { describe, expect, it } from 'vitest';
import { americanoRoundsForAll, americanoSchedule, matchesPerRound, roundsWithEqualRests, scheduleStats } from './americano';
import type { SocialRound } from './social';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

/** Casos N = 4..16 con todas las canchas posibles. */
const cases: { n: number; courts: number }[] = [];
for (let n = 4; n <= 16; n++) for (let c = 1; c <= Math.floor(n / 4); c++) cases.push({ n, courts: c });

function checkValid(players: string[], courts: number, rounds: SocialRound[]) {
  const m = matchesPerRound(players.length, courts);
  rounds.forEach((r, i) => {
    expect(r.round).toBe(i + 1);
    expect(r.matches).toHaveLength(m);
    expect(r.matches.map((x) => x.court)).toEqual(Array.from({ length: m }, (_, k) => k + 1));
    const seen = [...r.matches.flatMap((x) => [...x.side1, ...x.side2]), ...r.rests];
    // Nadie juega dos veces ni juega y descansa en la misma ronda; están todos.
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.slice().sort()).toEqual(players.slice().sort());
    expect(r.rests).toHaveLength(players.length - 4 * m);
  });
}

/** Descansa quien menos ha descansado: nadie descansa teniendo más descansos que alguien que juega. */
function checkFairRests(players: string[], rounds: SocialRound[]) {
  const rests = Object.fromEntries(players.map((p) => [p, 0])) as Record<string, number>;
  for (const r of rounds) {
    const resting = new Set(r.rests);
    const maxResting = Math.max(-Infinity, ...r.rests.map((p) => rests[p]));
    const minPlaying = Math.min(Infinity, ...players.filter((p) => !resting.has(p)).map((p) => rests[p]));
    expect(maxResting).toBeLessThanOrEqual(minPlaying);
    for (const p of r.rests) rests[p]++;
    const counts = Object.values(rests);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  }
}

describe('americano: validez y descansos', () => {
  it.each(cases)('N=$n con $courts cancha(s): nadie juega dos veces y los descansos rotan', ({ n, courts }) => {
    const players = ids(n);
    const full = Math.min(30, americanoRoundsForAll(n, courts) + 3);
    const rounds = americanoSchedule(players, { courts, rounds: full, seed: 7 });
    expect(rounds).toHaveLength(full);
    checkValid(players, courts, rounds);
    checkFairRests(players, rounds);
  });

  it('N ≡ 2 mod 4 (10 jugadores, 2 canchas): en 5 rondas cada uno descansa una vez', () => {
    const r = americanoSchedule(ids(10), { courts: 2, rounds: 5, seed: 1 });
    const st = scheduleStats(ids(10), r);
    expect(Object.values(st.rests)).toEqual(Array(10).fill(1));
    expect(Object.values(st.played)).toEqual(Array(10).fill(4));
    expect(st.maxPartner).toBe(1);
  });

  it('6 jugadores y 1 cancha (2 descansan): cada 3 rondas todos descansan una vez', () => {
    const r = americanoSchedule(ids(6), { courts: 1, rounds: 6, seed: 3 });
    expect(Object.values(scheduleStats(ids(6), r).rests)).toEqual(Array(6).fill(2));
  });

  it('más canchas de las que hacen falta: se usa una por cada 4', () => {
    const r = americanoSchedule(ids(9), { courts: 5, rounds: 3 });
    expect(r[0].matches).toHaveLength(2);
    expect(r[0].rests).toHaveLength(1);
  });
});

describe('americano: compañeros', () => {
  it.each(cases)('N=$n con $courts cancha(s): no repite compañero en un calendario parcial', ({ n, courts }) => {
    const m = matchesPerRound(n, courts);
    const partial = Math.max(1, Math.min(20, Math.floor((0.75 * (n * (n - 1))) / 2 / (2 * m))));
    const r = americanoSchedule(ids(n), { courts, rounds: partial, seed: 11 });
    expect(scheduleStats(ids(n), r).maxPartner).toBe(1);
  });

  it.each([
    { n: 4, courts: 1, rounds: 3 },
    { n: 5, courts: 1, rounds: 5 },
    { n: 8, courts: 2, rounds: 7 },
    { n: 8, courts: 1, rounds: 14 },
    { n: 9, courts: 2, rounds: 9 },
    { n: 12, courts: 3, rounds: 11 },
    { n: 12, courts: 1, rounds: 33 },
    { n: 13, courts: 3, rounds: 13 },
    { n: 16, courts: 4, rounds: 15 },
    { n: 16, courts: 2, rounds: 30 },
  ])('N=$n, $courts cancha(s), $rounds rondas: todos con todos exactamente una vez', ({ n, courts, rounds }) => {
    expect(americanoRoundsForAll(n, courts)).toBe(rounds);
    const players = ids(n);
    const r = americanoSchedule(players, { courts, rounds, seed: 5 });
    const st = scheduleStats(players, r);
    for (const a of players) for (const b of players) if (a !== b) expect(st.partners[a][b]).toBe(1);
    // Con N impar, cada uno descansa lo mismo; con múltiplo de 4 y menos canchas, también.
    const rests = Object.values(st.rests);
    expect(Math.max(...rests) - Math.min(...rests)).toBe(0);
  });

  it('calendario más largo que «todos con todos»: las repeticiones se reparten', () => {
    for (const { n, courts } of cases) {
      const m = matchesPerRound(n, courts);
      const rounds = Math.min(30, americanoRoundsForAll(n, courts) + 3);
      const players = ids(n);
      const st = scheduleStats(players, americanoSchedule(players, { courts, rounds, seed: 2 }));
      const pairs = (n * (n - 1)) / 2;
      expect(st.maxPartner).toBeLessThanOrEqual(Math.ceil((rounds * 2 * m) / pairs) + 1);
      for (const a of players) {
        const v = players.filter((b) => b !== a).map((b) => st.partners[a][b]);
        expect(Math.max(...v) - Math.min(...v)).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe('americano: determinismo y ayudas', () => {
  it('misma semilla, mismo calendario; otra semilla, otro sorteo', () => {
    const a = americanoSchedule(ids(10), { courts: 2, rounds: 6, seed: 'noche-1' });
    const b = americanoSchedule(ids(10), { courts: 2, rounds: 6, seed: 'noche-1' });
    const c = americanoSchedule(ids(10), { courts: 2, rounds: 6, seed: 'noche-2' });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('sin semilla también es determinista; con 4 jugadores salen los 3 repartos posibles', () => {
    const r = americanoSchedule(['A', 'B', 'C', 'D'], { courts: 1, rounds: 3 });
    expect(r).toEqual(americanoSchedule(['A', 'B', 'C', 'D'], { courts: 1, rounds: 3 }));
    const partners = r.map((x) => [x.matches[0].side1.slice().sort().join(''), x.matches[0].side2.slice().sort().join('')].sort().join('|'));
    expect(partners.sort()).toEqual(['AB|CD', 'AC|BD', 'AD|BC']);
  });

  it('rondas sugeridas', () => {
    expect(americanoRoundsForAll(10, 2)).toBe(12);
    expect(roundsWithEqualRests(10, 2, 12)).toEqual([5, 10]);
    expect(roundsWithEqualRests(8, 2, 3)).toEqual([1, 2, 3]);
    expect(roundsWithEqualRests(9, 2, 18)).toEqual([9, 18]);
  });

  it('errores en español', () => {
    expect(() => americanoSchedule(ids(3), { courts: 1, rounds: 3 })).toThrow('El americano necesita de 4 a 32 jugadores.');
    expect(() => americanoSchedule(ids(33), { courts: 8, rounds: 3 })).toThrow('de 4 a 32');
    expect(() => americanoSchedule(['a', 'a', 'b', 'c'], { courts: 1, rounds: 3 })).toThrow('Hay jugadores repetidos.');
    expect(() => americanoSchedule(ids(8), { courts: 0, rounds: 3 })).toThrow('Hace falta al menos una cancha.');
    expect(() => americanoSchedule(ids(8), { courts: 2, rounds: 0 })).toThrow('El número de rondas no es válido.');
  });

  it('32 jugadores en 8 canchas, 31 rondas, sin repetir compañero', () => {
    const st = scheduleStats(ids(32), americanoSchedule(ids(32), { courts: 8, rounds: 31, seed: 9 }));
    expect(st.maxPartner).toBe(1);
  });
});
