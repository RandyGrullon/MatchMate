import { describe, expect, it } from 'vitest';
import {
  newNightConfig,
  nextNightRound,
  nightConfigJson,
  nightInfo,
  nightRounds,
  nightShareText,
  nightTable,
  parseNightConfig,
  planAmericano,
  redoNightRound,
  roundDrafts,
  roundFromPlan,
  suggestRounds,
  type NightConfig,
} from './night';
import { pts } from './testMatch';

const P = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe('configuración de la noche', () => {
  it('lo que falte se pone (datos viejos o a medias no rompen)', () => {
    const c = parseNightConfig({ players: ['a', 'b', 'a', 7], courts: [], points: { mode: 'total', target: 500 } }, 'mexicano');
    expect(c).toMatchObject({ format: 'mexicano', players: ['a', 'b'], courts: ['Cancha 1'], points: { mode: 'total', target: 99 }, rounds: 6, rest: 'own-average', round: 0, closed: false });
    expect(parseNightConfig(null).format).toBe('americano');
    expect(parseNightConfig({ points: { mode: 'time' } }).points).toEqual({ mode: 'time', minutes: 15, serveEvery: 4 });
  });

  it('ida y vuelta al JSON de events.config', () => {
    const c = planAmericano(newNightConfig('americano', { players: P(8), courts: ['C1', 'C2'], seed: 's' }), 1);
    expect(parseNightConfig(nightConfigJson(c))).toEqual(c);
  });

  it('rondas recomendadas y lo que se ve al armarla', () => {
    expect(suggestRounds('americano', 8, 2)).toBe(7);
    expect(suggestRounds('americano', 12, 3)).toBe(7);
    expect(suggestRounds('mexicano', 16, 4)).toBe(6);
    // 10 jugadores y 2 canchas: descansan 2 por ronda; con 5 o 10 rondas todos descansan igual.
    expect(nightInfo(10, 2)).toMatchObject({ perRound: 2, resting: 2, idleCourts: 0, tooFew: false, equalRests: [5, 10] });
    expect(nightInfo(8, 3)).toMatchObject({ perRound: 2, resting: 0, idleCourts: 1 });
    expect(nightInfo(3, 1).tooFew).toBe(true);
  });
});

describe('americano', () => {
  it('8 jugadores, 2 canchas: 7 rondas sin repetir compañero; la ronda sale del plan guardado', () => {
    const c = planAmericano(newNightConfig('americano', { players: P(8), courts: ['Cancha 1', 'Cancha 2'], seed: 'x' }), 1);
    const seen = new Set<string>();
    for (let r = 1; r <= 7; r++) {
      const round = roundFromPlan(c, r)!;
      expect(round.matches).toHaveLength(2);
      expect(new Set(round.matches.flatMap((m) => [...m.side1, ...m.side2])).size).toBe(8);
      for (const m of round.matches)
        for (const [x, y] of [m.side1, m.side2]) {
          const key = [x, y].sort().join('+');
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
    }
    expect(roundFromPlan(c, 8)).toBeNull();
  });

  it('la siguiente ronda: la 1 planea todo; si cambian los jugadores, se vuelve a planear desde esa ronda', () => {
    let c = newNightConfig('americano', { players: P(8), courts: ['C1', 'C2'], rounds: 4, seed: 's' });
    const first = nextNightRound(c, []);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.round).toBe(1);
    expect(first.config?.plan).toHaveLength(4);
    c = { ...first.config!, round: 1 };
    const r1 = first.social.matches.map((m) => pts(1, `C${m.court}`, m.side1, m.side2, 14, 10));
    const second = nextNightRound(c, nightRounds(c, r1));
    expect(second.ok && second.round === 2 && !second.config).toBe(true);
    // Se va uno y entra otro: el plan se rehace desde la ronda 2.
    c = { ...c, players: [...P(7), 'nuevo'] };
    const third = nextNightRound(c, nightRounds(c, r1));
    expect(third.ok && third.config?.planFrom).toBe(2);
    if (third.ok) expect(third.social.matches.flatMap((m) => [...m.side1, ...m.side2])).toContain('nuevo');
  });

  it('avisa si falta terminar la ronda anterior (el americano deja seguir)', () => {
    const c = { ...newNightConfig('americano', { players: P(4), courts: ['C1'], rounds: 3, seed: 's' }), round: 1 };
    const r1 = [pts(1, 'C1', ['p1', 'p2'], ['p3', 'p4'], null, null)];
    const next = nextNightRound(c, nightRounds(c, r1));
    expect(next).toMatchObject({ ok: true, round: 2, pendingPrev: 1 });
  });

  it('no pasa de las rondas previstas ni sigue con la noche cerrada', () => {
    const c = { ...newNightConfig('americano', { players: P(4), courts: ['C1'], rounds: 1 }), round: 1 };
    expect(nextNightRound(c, [])).toMatchObject({ ok: false });
    expect(nextNightRound({ ...c, rounds: 3, closed: true }, [])).toMatchObject({ ok: false, reason: 'La noche ya terminó.' });
    expect(nextNightRound(newNightConfig('americano', { players: P(3), courts: ['C1'] }), [])).toMatchObject({ ok: false });
  });
});

describe('mexicano', () => {
  const base = (): NightConfig => newNightConfig('mexicano', { players: P(8), courts: ['C1', 'C2'], rounds: 6, seed: 'm', firstRound: 'level', levels: { p1: 7, p2: 6, p3: 5, p4: 4, p5: 3, p6: 2, p7: 1, p8: 0 } });

  it('la ronda 1 por nivel: 1+4 contra 2+3 en la cancha 1', () => {
    const r = nextNightRound(base(), []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.social.matches[0]).toMatchObject({ court: 1, side1: ['p1', 'p4'], side2: ['p2', 'p3'] });
    expect(r.social.matches[1]).toMatchObject({ court: 2, side1: ['p5', 'p8'], side2: ['p6', 'p7'] });
  });

  it('la siguiente con la tabla; no se arma con partidos sin terminar', () => {
    const c = { ...base(), round: 1 };
    const done = [pts(1, 'C1', ['p1', 'p4'], ['p2', 'p3'], 10, 14), pts(1, 'C2', ['p5', 'p8'], ['p6', 'p7'], 20, 4)];
    const r2 = nextNightRound(c, nightRounds(c, done));
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      // Tabla: p5 y p8 (20), p2 y p3 (14), p1 y p4 (10), p6 y p7 (4).
      expect(new Set([...r2.social.matches[0].side1, ...r2.social.matches[0].side2])).toEqual(new Set(['p5', 'p8', 'p2', 'p3']));
    }
    const half = [done[0], pts(1, 'C2', ['p5', 'p8'], ['p6', 'p7'], null, null)];
    expect(nextNightRound(c, nightRounds(c, half))).toMatchObject({ ok: false });
  });
});

describe('rondas, tabla y compartir', () => {
  it('la tabla cuenta solo lo terminado; quien descansa recibe su promedio; el empate cuenta como empate', () => {
    const c: NightConfig = { ...newNightConfig('americano', { players: P(5), courts: ['C1'] }), rests: { '1': ['p5'], '2': ['p1'] }, round: 2 };
    const matches = [
      pts(1, 'C1', ['p1', 'p2'], ['p3', 'p4'], 12, 12),
      pts(2, 'C1', ['p2', 'p5'], ['p3', 'p4'], 16, 8),
      pts(3, 'C1', ['p1', 'p5'], ['p2', 'p3'], null, null),
    ];
    const rounds = nightRounds(c, matches);
    expect(rounds.map((r) => [r.round, r.done, r.pending, r.rests])).toEqual([
      [1, true, 0, ['p5']],
      [2, true, 0, ['p1']],
      [3, false, 1, []],
    ]);
    const table = nightTable(c, rounds);
    const p2 = table.find((r) => r.id === 'p2')!;
    expect(p2).toMatchObject({ played: 2, won: 1, drawn: 1, points: 28 });
    // p5: jugó 1 (16 puntos) y descansó 1: suma su promedio (16).
    expect(table.find((r) => r.id === 'p5')).toMatchObject({ played: 1, points: 32, extra: { rests: 1 } });
    expect(table[0].id).toBe('p5');
    const text = nightShareText({ title: 'Americano del jueves', date: '8 oct', rows: table, nameOf: (id) => id.toUpperCase(), points: c.points, final: true, url: 'https://x/e/1' });
    expect(text.split('\n')[0]).toBe('Americano del jueves · 8 oct');
    expect(text).toContain('Tabla final (a 24 puntos):');
    expect(text).toContain('1. P5: 32 pts (1 G, 0 P)');
    expect(text).toContain('P2: 28 pts (1 G, 1 E, 0 P)');
    expect(text.split('\n').at(-1)).toBe('https://x/e/1');
  });

  it('los partidos de la ronda para la base: cancha con nombre, formato y reglas de puntos', () => {
    const c = newNightConfig('americano', { players: P(8), courts: ['Central', 'Cristal'], points: { target: 16 } });
    const { drafts, rests } = roundDrafts(c, { round: 1, matches: [{ court: 2, side1: ['p1', 'p2'], side2: ['p3', 'p4'] }], rests: ['p5'] }, { match: { sport: 'padel' } });
    expect(rests).toEqual(['p5']);
    expect(drafts[0]).toMatchObject({
      court: 'Cristal',
      format: 'americano',
      requireConfirm: false,
      rules: { match: { sport: 'padel' }, points: { mode: 'total', target: 16 } },
      sides: [{ side: 1, players: [{ playerId: 'p1' }, { playerId: 'p2' }] }, { side: 2, players: [{ playerId: 'p3' }, { playerId: 'p4' }] }],
    });
  });
});

describe('rehacer la ronda', () => {
  it('americano: otro sorteo con los jugadores de ahora; si ya empezó, no', () => {
    const base = { ...newNightConfig('americano', { players: P(8), courts: ['C1', 'C2'], rounds: 4, seed: 's' }), round: 1 };
    const first = nextNightRound(base, []);
    if (!first.ok) throw new Error(first.reason);
    const cfg = { ...first.config!, round: 1 };
    const r1 = first.social.matches.map((m) => pts(1, `C${m.court}`, m.side1, m.side2, null, null));
    const redo = redoNightRound({ ...cfg, players: [...P(7), 'nuevo'] }, nightRounds(cfg, r1), 'x');
    expect(redo.ok).toBe(true);
    if (redo.ok) {
      expect(redo.round).toBe(1);
      expect(redo.config?.planFrom).toBe(1);
      expect(redo.social.matches.flatMap((m) => [...m.side1, ...m.side2])).toContain('nuevo');
    }
    const started = [{ ...r1[0], status: 'live' as const }, r1[1]];
    expect(redoNightRound(cfg, nightRounds(cfg, started), 'x')).toMatchObject({ ok: false });
    expect(redoNightRound(cfg, [], 'x')).toMatchObject({ ok: false });
  });

  it('mexicano: la ronda 2 se vuelve a armar con la tabla de la 1', () => {
    const cfg = { ...newNightConfig('mexicano', { players: P(8), courts: ['C1', 'C2'], rounds: 6, seed: 'm' }), round: 2 };
    const r1 = [pts(1, 'C1', ['p1', 'p2'], ['p3', 'p4'], 20, 4), pts(1, 'C2', ['p5', 'p6'], ['p7', 'p8'], 12, 12)];
    const r2 = [pts(2, 'C1', ['p1', 'p3'], ['p2', 'p4'], null, null), pts(2, 'C2', ['p5', 'p7'], ['p6', 'p8'], null, null)];
    const redo = redoNightRound(cfg, nightRounds(cfg, [...r1, ...r2]), 'y');
    expect(redo).toMatchObject({ ok: true, round: 2 });
    if (redo.ok) expect(new Set([...redo.social.matches[0].side1, ...redo.social.matches[0].side2])).toEqual(new Set(['p1', 'p2', 'p5', 'p6']));
  });
});
