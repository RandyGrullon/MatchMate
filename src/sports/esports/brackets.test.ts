import { describe, expect, it } from 'vitest';
import { seededRandom } from '../formats/random';
import {
  champion,
  doubleEliminationPlan,
  groupOf,
  groupsPlan,
  partTitle,
  playoffSeeds,
  podium,
  resolvePlan,
  roundRobinPlan,
  singleEliminationPlan,
  slotLabel,
  type KeyResult,
  type PlannedMatch,
  type StagePlan,
} from '.';

const seeds = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);
const byKey = (plan: StagePlan) => new Map(plan.matches.map((m) => [m.key, m]));
const src = (m: PlannedMatch, side: 1 | 2) => m.sides[side - 1];
const DE = (n: number, bracketReset = true) => doubleEliminationPlan(seeds(n), { bracketReset, bestOf: 3, finalBestOf: 5 });

/** Revisa que los enlaces cuadren con las fuentes y apunten a partidos que existen. */
function checkLinks(plan: StagePlan) {
  const map = byKey(plan);
  expect(map.size).toBe(plan.matches.length);
  for (const m of plan.matches) {
    for (const s of m.sides) expect(s.kind).not.toBe('bye');
    for (const [link, kind] of [
      [m.winnerTo, 'winner'],
      [m.loserTo, 'loser'],
    ] as const) {
      if (!link) continue;
      const to = map.get(link.key);
      expect(to, `${m.key} → ${link.key}`).toBeDefined();
      expect(src(to!, link.side)).toEqual({ kind, key: m.key });
    }
    m.sides.forEach((s, i) => {
      if (s.kind === 'winner') expect(map.get(s.key)?.winnerTo).toEqual({ key: m.key, side: i + 1 });
      if (s.kind === 'loser') expect(map.get(s.key)?.loserTo).toEqual({ key: m.key, side: i + 1 });
    });
  }
}

/** Juega el cuadro con resultados al azar hasta que no quede nada por jugar. */
function simulate(plan: StagePlan, seed: number) {
  const rand = seededRandom(seed);
  const results: Record<string, KeyResult> = {};
  for (let guard = 0; guard < 500; guard++) {
    let progress = false;
    for (const m of resolvePlan(plan, results)) {
      if (results[m.key]) continue;
      const [a, b] = m.known;
      if (!a || !b) continue;
      expect(a).not.toBe(b);
      const winner = rand() < 0.5 ? a : b;
      results[m.key] = { winner, loser: winner === a ? b : a };
      progress = true;
    }
    if (!progress) break;
  }
  return results;
}

describe('eliminación simple', () => {
  it('con 8: 7 partidos (+1 con 3.er lugar), llaves W y textos', () => {
    const plan = singleEliminationPlan(seeds(8), { thirdPlace: false, bestOf: 3, finalBestOf: 5 });
    expect(plan.kind).toBe('bracket');
    expect(plan.matches.map((m) => m.key)).toEqual(['W1-1', 'W1-2', 'W1-3', 'W1-4', 'W2-1', 'W2-2', 'W3-1']);
    const m = byKey(plan);
    expect(m.get('W1-1')!.sides).toEqual([
      { kind: 'entry', entryId: 's1' },
      { kind: 'entry', entryId: 's8' },
    ]);
    expect(m.get('W1-1')!.labels).toEqual(['', '']);
    expect(m.get('W1-1')!.stage).toBe('Cuartos de final');
    expect(m.get('W1-1')!.winnerTo).toEqual({ key: 'W2-1', side: 1 });
    expect(m.get('W2-1')!.labels).toEqual(['Ganador W1-1', 'Ganador W1-2']);
    expect(m.get('W2-2')!.stage).toBe('Semifinal');
    expect(m.get('W3-1')!.stage).toBe('Final');
    expect(m.get('W3-1')!.bestOf).toBe(5);
    expect(m.get('W2-1')!.bestOf).toBe(3);
    expect(m.get('W3-1')!.winnerTo).toBeNull();
    for (const x of plan.matches) expect(x.group).toBeNull(), expect(x.part).toBe('W');
    checkLinks(plan);

    const p3 = singleEliminationPlan(seeds(8), { thirdPlace: true, bestOf: 3, finalBestOf: 5, kind: 'playoffs' });
    expect(p3.kind).toBe('playoffs');
    expect(p3.matches).toHaveLength(8);
    const third = byKey(p3).get('P3')!;
    expect(third.part).toBe('P3');
    expect(third.stage).toBe('3.er lugar');
    expect(third.bestOf).toBe(3);
    expect(third.sides).toEqual([
      { kind: 'loser', key: 'W2-1' },
      { kind: 'loser', key: 'W2-2' },
    ]);
    expect(third.labels).toEqual(['Perdedor W2-1', 'Perdedor W2-2']);
    expect(byKey(p3).get('W2-1')!.loserTo).toEqual({ key: 'P3', side: 1 });
    checkLinks(p3);
  });

  it('con 5: los 3 mejores pasan solos y se crean 4 partidos (sin byes)', () => {
    const plan = singleEliminationPlan(seeds(5), { thirdPlace: false, bestOf: 1, finalBestOf: 3 });
    expect(plan.matches.map((m) => m.key)).toEqual(['W1-2', 'W2-1', 'W2-2', 'W3-1']);
    const m = byKey(plan);
    expect(m.get('W1-2')!.sides).toEqual([
      { kind: 'entry', entryId: 's4' },
      { kind: 'entry', entryId: 's5' },
    ]);
    expect(m.get('W2-1')!.sides).toEqual([
      { kind: 'entry', entryId: 's1' },
      { kind: 'winner', key: 'W1-2' },
    ]);
    expect(m.get('W2-1')!.labels).toEqual(['', 'Ganador W1-2']);
    expect(m.get('W2-2')!.sides).toEqual([
      { kind: 'entry', entryId: 's2' },
      { kind: 'entry', entryId: 's3' },
    ]);
    checkLinks(plan);
  });

  it('con 2: solo la final; con 3, el 3.er lugar no aplica', () => {
    const two = singleEliminationPlan(['a', 'b'], { thirdPlace: true, bestOf: 1, finalBestOf: 3 });
    expect(two.matches.map((m) => [m.key, m.stage, m.bestOf])).toEqual([['W1-1', 'Final', 3]]);
    const three = singleEliminationPlan(seeds(3), { thirdPlace: true, bestOf: 1, finalBestOf: 3 });
    expect(three.matches.map((m) => m.key)).toEqual(['W1-2', 'W2-1']);
  });

  it('errores', () => {
    expect(() => singleEliminationPlan(['a'], { thirdPlace: false, bestOf: 1, finalBestOf: 1 })).toThrow('El cuadro necesita al menos 2 inscritos.');
    expect(() => singleEliminationPlan(['a', 'a'], { thirdPlace: false, bestOf: 1, finalBestOf: 1 })).toThrow('Hay inscritos repetidos.');
  });

  it('campeón y podio', () => {
    const plan = singleEliminationPlan(seeds(4), { thirdPlace: true, bestOf: 1, finalBestOf: 1 });
    const r: Record<string, KeyResult> = {
      'W1-1': { winner: 's1', loser: 's4' },
      'W1-2': { winner: 's3', loser: 's2' },
    };
    expect(resolvePlan(plan, r).find((m) => m.key === 'W2-1')!.known).toEqual(['s1', 's3']);
    expect(resolvePlan(plan, r).find((m) => m.key === 'P3')!.known).toEqual(['s4', 's2']);
    expect(champion(plan, r)).toBeNull();
    r['W2-1'] = { winner: 's3', loser: 's1' };
    r.P3 = { winner: 's2', loser: 's4' };
    expect(champion(plan, r)).toBe('s3');
    expect(podium(plan, r)).toEqual(['s3', 's1', 's2', 's4']);
    const noP3 = singleEliminationPlan(seeds(4), { thirdPlace: false, bestOf: 1, finalBestOf: 1 });
    expect(podium(noP3, r)).toEqual(['s3', 's1', null, null]);
  });
});

describe('doble eliminación', () => {
  it('con 8: 7 de ganadores, 6 de perdedores, GF y GF2 = 15', () => {
    const plan = DE(8);
    expect(plan.matches.filter((m) => m.part === 'W')).toHaveLength(7);
    expect(plan.matches.filter((m) => m.part === 'L')).toHaveLength(6);
    expect(plan.matches).toHaveLength(15);
    expect(plan.matches.map((m) => m.key)).toEqual([
      'W1-1',
      'W1-2',
      'W1-3',
      'W1-4',
      'W2-1',
      'W2-2',
      'W3-1',
      'L1-1',
      'L1-2',
      'L2-1',
      'L2-2',
      'L3-1',
      'L4-1',
      'GF',
      'GF2',
    ]);
    const m = byKey(plan);
    expect(src(m.get('L2-1')!, 2)).toEqual({ kind: 'loser', key: 'W2-2' });
    expect(src(m.get('L2-2')!, 2)).toEqual({ kind: 'loser', key: 'W2-1' });
    expect(src(m.get('L2-1')!, 1)).toEqual({ kind: 'winner', key: 'L1-1' });
    expect(m.get('W1-1')!.loserTo).toEqual({ key: 'L1-1', side: 1 });
    expect(m.get('W1-2')!.loserTo).toEqual({ key: 'L1-1', side: 2 });
    expect(src(m.get('L3-1')!, 1)).toEqual({ kind: 'winner', key: 'L2-1' });
    expect(src(m.get('L3-1')!, 2)).toEqual({ kind: 'winner', key: 'L2-2' });
    expect(src(m.get('L4-1')!, 2)).toEqual({ kind: 'loser', key: 'W3-1' });
    expect(src(m.get('GF')!, 1)).toEqual({ kind: 'winner', key: 'W3-1' });
    expect(src(m.get('GF')!, 2)).toEqual({ kind: 'winner', key: 'L4-1' });
    expect(m.get('GF2')!.sides).toEqual([
      { kind: 'reset', side: 1 },
      { kind: 'reset', side: 2 },
    ]);
    expect(m.get('GF2')!.labels).toEqual(['Ganador W3-1', 'Ganador L4-1']);
    expect(m.get('GF')!.winnerTo).toBeNull();
    expect(m.get('GF')!.loserTo).toBeNull();
    expect(m.get('GF2')!.winnerTo).toBeNull();
    expect(m.get('GF2')!.loserTo).toBeNull();
    expect(m.get('L4-1')!.winnerTo).toEqual({ key: 'GF', side: 2 });
    expect(m.get('L4-1')!.loserTo).toBeNull();
    checkLinks(plan);
  });

  it('textos de fase y mejor de', () => {
    const m = byKey(DE(8));
    expect(m.get('W1-1')!.stage).toBe('Ganadores · Cuartos de final');
    expect(m.get('W2-1')!.stage).toBe('Ganadores · Semifinal');
    expect(m.get('W3-1')!.stage).toBe('Final de ganadores');
    expect(m.get('L1-1')!.stage).toBe('Perdedores · Ronda 1');
    expect(m.get('L3-1')!.stage).toBe('Perdedores · Ronda 3');
    expect(m.get('L4-1')!.stage).toBe('Final de perdedores');
    expect(m.get('GF')!.stage).toBe('Gran final');
    expect(m.get('GF2')!.stage).toBe('Gran final · reinicio');
    expect(m.get('W1-1')!.bestOf).toBe(3);
    expect(m.get('L4-1')!.bestOf).toBe(3);
    expect(m.get('GF')!.bestOf).toBe(5);
    expect(m.get('GF2')!.bestOf).toBe(5);
    for (const x of m.values()) expect(x.stage.length).toBeLessThanOrEqual(40);
  });

  it('con 4: W1-1, W1-2, W2-1, L1-1, L2-1, GF (+GF2)', () => {
    expect(DE(4).matches.map((m) => m.key)).toEqual(['W1-1', 'W1-2', 'W2-1', 'L1-1', 'L2-1', 'GF', 'GF2']);
    expect(DE(4, false).matches.map((m) => m.key)).toEqual(['W1-1', 'W1-2', 'W2-1', 'L1-1', 'L2-1', 'GF']);
    const m = byKey(DE(4));
    expect(m.get('L2-1')!.sides).toEqual([
      { kind: 'winner', key: 'L1-1' },
      { kind: 'loser', key: 'W2-1' },
    ]);
    checkLinks(DE(4));
  });

  it('con 5 (S = 8, 3 byes): ningún lado bye, colapso y enlaces a partidos que existen', () => {
    const plan = DE(5);
    expect(plan.matches.map((m) => m.key)).toEqual(['W1-2', 'W2-1', 'W2-2', 'W3-1', 'L2-1', 'L3-1', 'L4-1', 'GF', 'GF2']);
    const m = byKey(plan);
    expect(m.get('W2-1')!.sides).toEqual([
      { kind: 'entry', entryId: 's1' },
      { kind: 'winner', key: 'W1-2' },
    ]);
    // L1-1 desapareció: el perdedor de W1-2 cae directo en L2-1.
    expect(m.get('L2-1')!.sides).toEqual([
      { kind: 'loser', key: 'W1-2' },
      { kind: 'loser', key: 'W2-2' },
    ]);
    // L2-2 desapareció (su lado 1 era bye): el perdedor de W2-1 va a L3-1.
    expect(m.get('L3-1')!.sides).toEqual([
      { kind: 'winner', key: 'L2-1' },
      { kind: 'loser', key: 'W2-1' },
    ]);
    expect(m.get('W1-2')!.loserTo).toEqual({ key: 'L2-1', side: 1 });
    expect(m.get('W2-1')!.loserTo).toEqual({ key: 'L3-1', side: 2 });
    checkLinks(plan);
  });

  for (const n of [5, 6, 7, 8, 12, 16]) {
    it(`con ${n}: nadie queda fuera con una sola derrota (50 cuadros al azar)`, () => {
      const plan = DE(n);
      expect(new Set(plan.matches.map((m) => m.key)).size).toBe(plan.matches.length);
      checkLinks(plan);
      let resetsPlayed = 0;
      for (let s = 1; s <= 50; s++) {
        const results = simulate(plan, s * 7919 + n);
        // Todo partido se juega (el reinicio solo si ganó el de perdedores).
        for (const m of plan.matches) if (m.part !== 'GF2') expect(results[m.key], `${m.key} (semilla ${s})`).toBeDefined();
        if (results.GF2) resetsPlayed++;
        const losses = new Map<string, number>(seeds(n).map((id) => [id, 0]));
        for (const r of Object.values(results)) losses.set(r.loser!, losses.get(r.loser!)! + 1);
        const champ = champion(plan, results);
        expect(champ).not.toBeNull();
        for (const [id, l] of losses) {
          if (id === champ) expect(l).toBeLessThanOrEqual(1);
          else expect(l, `${id} (semilla ${s})`).toBe(2);
        }
        const pod = podium(plan, results);
        expect(pod[0]).toBe(champ);
        expect(new Set(pod.filter(Boolean)).size).toBe(pod.filter(Boolean).length);
        expect(pod[2]).not.toBeNull();
      }
      expect(resetsPlayed).toBeGreaterThan(0);
    });
  }

  it('sin reinicio: el de ganadores puede quedar fuera con una derrota en GF', () => {
    const plan = DE(6, false);
    let oneLossOut = 0;
    for (let s = 1; s <= 50; s++) {
      const results = simulate(plan, s);
      const losses = new Map<string, number>();
      for (const r of Object.values(results)) losses.set(r.loser!, (losses.get(r.loser!) ?? 0) + 1);
      const champ = champion(plan, results);
      expect(champ).toBe(results.GF.winner);
      for (const [id, l] of losses) {
        if (id === champ) continue;
        if (l === 1) {
          expect(id).toBe(results.GF.loser);
          oneLossOut++;
        } else expect(l).toBe(2);
      }
    }
    expect(oneLossOut).toBeGreaterThan(0);
  });

  it('resolvePlan con resultados a medias', () => {
    const plan = DE(4);
    const r: Record<string, KeyResult> = { 'W1-1': { winner: 's1', loser: 's4' } };
    const res = new Map(resolvePlan(plan, r).map((m) => [m.key, m.known]));
    expect(res.get('W1-1')).toEqual(['s1', 's4']);
    expect(res.get('W1-2')).toEqual(['s2', 's3']);
    expect(res.get('W2-1')).toEqual(['s1', null]);
    expect(res.get('L1-1')).toEqual(['s4', null]);
    expect(res.get('L2-1')).toEqual([null, null]);
    expect(res.get('GF')).toEqual([null, null]);
    expect(res.get('GF2')).toEqual([null, null]);
    // Una llave que no está en el plan no cuenta.
    expect(resolvePlan(plan, { ...r, 'W9-9': { winner: 'x', loser: 'y' } }).length).toBe(7);
  });

  it('campeón con y sin reinicio; podio', () => {
    const plan = DE(4);
    const r: Record<string, KeyResult> = {
      'W1-1': { winner: 's1', loser: 's4' },
      'W1-2': { winner: 's2', loser: 's3' },
      'W2-1': { winner: 's1', loser: 's2' },
      'L1-1': { winner: 's3', loser: 's4' },
      'L2-1': { winner: 's3', loser: 's2' },
    };
    expect(resolvePlan(plan, r).find((m) => m.key === 'GF')!.known).toEqual(['s1', 's3']);
    expect(champion(plan, r)).toBeNull();
    expect(podium(plan, r)).toEqual([null, null, 's2', 's4']);

    // Gana el invicto: campeón sin reinicio y GF2 no se juega.
    const invicto = { ...r, GF: { winner: 's1', loser: 's3' } };
    expect(champion(plan, invicto)).toBe('s1');
    expect(podium(plan, invicto)).toEqual(['s1', 's3', 's2', 's4']);
    expect(resolvePlan(plan, invicto).find((m) => m.key === 'GF2')!.known).toEqual([null, null]);

    // Gana el de perdedores: hace falta GF2 con los mismos dos.
    const reset = { ...r, GF: { winner: 's3', loser: 's1' } };
    expect(champion(plan, reset)).toBeNull();
    expect(resolvePlan(plan, reset).find((m) => m.key === 'GF2')!.known).toEqual(['s1', 's3']);
    expect(podium(plan, reset)).toEqual([null, null, 's2', 's4']);
    const done = { ...reset, GF2: { winner: 's1', loser: 's3' } };
    expect(champion(plan, done)).toBe('s1');
    expect(podium(plan, done)).toEqual(['s1', 's3', 's2', 's4']);
    // El perdedor se deduce si no vino en el resultado.
    expect(podium(plan, { ...reset, GF2: { winner: 's3', loser: null } })).toEqual(['s3', 's1', 's2', 's4']);

    // Sin reinicio: gana la GF y listo.
    const plain = DE(4, false);
    expect(champion(plain, reset)).toBe('s3');
    expect(podium(plain, reset)).toEqual(['s3', 's1', 's2', 's4']);
  });

  it('podio con 8: 3.º de L4-1 y 4.º de L3-1', () => {
    const plan = DE(8);
    const results = simulate(plan, 42);
    const pod = podium(plan, results);
    expect(pod[2]).toBe(results['L4-1'].loser);
    expect(pod[3]).toBe(results['L3-1'].loser);
  });

  it('errores', () => {
    expect(() => DE(3)).toThrow('Para doble eliminación hacen falta al menos 4.');
    expect(() => doubleEliminationPlan(['a', 'b', 'c', 'a'], { bracketReset: true, bestOf: 1, finalBestOf: 1 })).toThrow('Hay inscritos repetidos.');
  });

  it('kind playoffs', () => {
    expect(doubleEliminationPlan(seeds(4), { bracketReset: false, bestOf: 1, finalBestOf: 3, kind: 'playoffs' }).kind).toBe('playoffs');
  });
});

describe('grupos y todos contra todos', () => {
  it('8 en 2 grupos = 12 partidos, en serpiente', () => {
    const plan = groupsPlan(seeds(8), { groups: 2, double: false, bestOf: 1 });
    expect(plan.kind).toBe('groups');
    expect(plan.matches).toHaveLength(12);
    expect(groupOf(plan).map((g) => g.slice().sort())).toEqual([
      ['s1', 's4', 's5', 's8'],
      ['s2', 's3', 's6', 's7'],
    ]);
    const first = plan.matches[0];
    expect(first.key).toBe('G1-R1-1');
    expect(first.part).toBe('G');
    expect(first.group).toBe(0);
    expect(first.stage).toBe('Grupo A · Jornada 1');
    expect(first.winnerTo).toBeNull();
    const b = plan.matches.find((m) => m.group === 1)!;
    expect(b.key).toBe('G2-R1-1');
    expect(b.stage).toBe('Grupo B · Jornada 1');
    expect(new Set(plan.matches.map((m) => m.key)).size).toBe(12);
    // Ida y vuelta: el doble.
    expect(groupsPlan(seeds(8), { groups: 2, double: true, bestOf: 1 }).matches).toHaveLength(24);
  });

  it('grupos impares y errores', () => {
    const plan = groupsPlan(seeds(7), { groups: 2, double: false, bestOf: 3 });
    expect(plan.matches).toHaveLength(6 + 3);
    expect(groupOf(plan).map((g) => g.length)).toEqual([3, 4]);
    expect(() => groupsPlan(seeds(4), { groups: 3, double: false, bestOf: 1 })).toThrow('Cada grupo necesita al menos 2 inscritos.');
  });

  it('playoffSeeds cruza 1A–2B y 1B–2A', () => {
    const seedsOut = playoffSeeds(
      [
        ['a1', 'a2', 'a3'],
        ['b1', 'b2', 'b3'],
      ],
      2,
    );
    expect(seedsOut).toEqual(['a1', 'b1', 'a2', 'b2']);
    const plan = singleEliminationPlan(seedsOut, { thirdPlace: false, bestOf: 1, finalBestOf: 3, kind: 'playoffs' });
    const m = byKey(plan);
    expect(m.get('W1-1')!.sides).toEqual([
      { kind: 'entry', entryId: 'a1' },
      { kind: 'entry', entryId: 'b2' },
    ]);
    expect(m.get('W1-2')!.sides).toEqual([
      { kind: 'entry', entryId: 'b1' },
      { kind: 'entry', entryId: 'a2' },
    ]);
  });

  it('todos contra todos: liga en jornadas', () => {
    const plan = roundRobinPlan(seeds(4), { double: false, bestOf: 3 });
    expect(plan.kind).toBe('league');
    expect(plan.matches).toHaveLength(6);
    expect(plan.matches.map((m) => m.key)).toEqual(['RR-R1-1', 'RR-R1-2', 'RR-R2-1', 'RR-R2-2', 'RR-R3-1', 'RR-R3-2']);
    expect(plan.matches.every((m) => m.part === 'G' && m.group === 0 && m.bestOf === 3)).toBe(true);
    expect(plan.matches[2].stage).toBe('Jornada 2');
    expect(groupOf(plan)).toHaveLength(1);
    expect(groupOf(plan)[0].slice().sort()).toEqual(seeds(4));
    // Cada par una vez; con ida y vuelta, dos.
    const pairs = new Set(plan.matches.map((m) => [m.sides[0], m.sides[1]].map((s) => (s.kind === 'entry' ? s.entryId : '')).sort().join('-')));
    expect(pairs.size).toBe(6);
    expect(roundRobinPlan(seeds(5), { double: true, bestOf: 1 }).matches).toHaveLength(20);
    expect(() => roundRobinPlan(['a'], { double: false, bestOf: 1 })).toThrow('Hacen falta al menos 2 inscritos.');
  });

  it('grupos y liga no tienen campeón ni podio en el cuadro', () => {
    const plan = roundRobinPlan(seeds(3), { double: false, bestOf: 1 });
    expect(champion(plan, {})).toBeNull();
    expect(podium(plan, {})).toEqual([null, null, null, null]);
  });
});

describe('textos', () => {
  it('partTitle', () => {
    expect(partTitle('W', 1, 3)).toBe('Cuartos de final');
    expect(partTitle('W', 3, 3)).toBe('Final');
    expect(partTitle('L', 2, 4)).toBe('Ronda 2');
    expect(partTitle('L', 4, 4)).toBe('Final de perdedores');
    expect(partTitle('GF', 1, 1)).toBe('Gran final');
    expect(partTitle('GF2', 1, 1)).toBe('Gran final · reinicio');
    expect(partTitle('P3', 3, 3)).toBe('3.er lugar');
    expect(partTitle('G', 2, 5)).toBe('Jornada 2');
  });

  it('slotLabel', () => {
    expect(slotLabel({ kind: 'entry', entryId: 'x' })).toBe('');
    expect(slotLabel({ kind: 'winner', key: 'W1-2' })).toBe('Ganador W1-2');
    expect(slotLabel({ kind: 'loser', key: 'W2-1' })).toBe('Perdedor W2-1');
    expect(slotLabel({ kind: 'group', group: 0, place: 1 })).toBe('1.º Grupo A');
    expect(slotLabel({ kind: 'reset', side: 1 })).toBe('Por definir');
  });
});
