import { describe, expect, it } from 'vitest';
import { ALL_PINS, frameStats, scoreGame } from './bowling';
import {
  CONVERT_CUTS,
  LEFT_CUTS,
  byDate,
  countedFrames,
  entryStatGames,
  frameRates,
  hasPins,
  heatLevel,
  leaveName,
  leaveStats,
  monthlyAverages,
  movingAverage,
  percent,
  pinInsights,
  pinReport,
  pinsOf,
  racksOf,
  recentTrend,
  soloStatGames,
  spareSummary,
  splitRolls,
  trendText,
  type PinReport,
  type SpareSummary,
} from './bowlingStats';
import type { GameFrames } from './types';

/** Máscara de unos pinos (1 a 10). */
const mask = (...pins: number[]) => pins.reduce((m, p) => m | (1 << (p - 1)), 0);

type Spec = 'X' | { leave: number[]; spare: boolean };

/** Un rack anotado pino por pino: strike, o lo que quedó y si se hizo el spare. */
function rack(spec: Spec): { rolls: number[]; masks: number[] } {
  if (spec === 'X') return { rolls: [10], masks: [ALL_PINS] };
  const left = mask(...spec.leave);
  const first = 10 - spec.leave.length;
  return {
    rolls: [first, spec.spare ? spec.leave.length : 0],
    masks: [ALL_PINS & ~left, spec.spare ? left : 0],
  };
}

/** Un juego pino por pino con los racks en orden (en el 10 se siguen poniendo racks: X, X, X o 9 /, X…). */
function pinGame(...specs: (Spec | { bonus: number; mask: number })[]): GameFrames {
  const rolls: number[] = [];
  const masks: number[] = [];
  for (const s of specs) {
    if (typeof s === 'object' && 'bonus' in s) {
      rolls.push(s.bonus);
      masks.push(s.mask);
      continue;
    }
    const r = rack(s);
    rolls.push(...r.rolls);
    masks.push(...r.masks);
  }
  return { rolls, masks };
}

const L = (leave: number[], spare: boolean) => ({ leave, spare });

/**
 * X · 9/ (10) · 8- (7-10 split) · 9- (10) · X · X · 8/ (4-7) · 6/ (2-4-5-8) · 8/ (6-10) · X 9/ (10)
 */
const GAME_A = pinGame('X', L([10], true), L([7, 10], false), L([10], false), 'X', 'X', L([4, 7], true), L([2, 4, 5, 8], true), L([6, 10], true), 'X', L([10], true));
const SCORE_A = scoreGame(GAME_A.rolls).score;

/** Juego perfecto por teclado (sin pines). */
const PERFECT: GameFrames = { rolls: Array.from({ length: 12 }, () => 10) };

describe('juegos para las estadísticas', () => {
  it('de una participación: solo los que cuentan (con foto o marca), con sus cuadros', () => {
    const games = entryStatGames(
      { scores: [200, null, 150, 180], photos: ['foto', null, null, 'sin-foto'], frames: { '0': PERFECT, '2': GAME_A } },
      '2026-09-01',
      (i) => `J${i + 1}`,
    );
    expect(games).toEqual([
      { score: 200, date: '2026-09-01', frames: PERFECT, label: 'J1' },
      { score: 180, date: '2026-09-01', frames: null, label: 'J4' },
    ]);
  });

  it('de juegos sueltos: todos, con sus cuadros', () => {
    const games = soloStatGames({ playedOn: '2026-08-02', scores: [150, 300], frames: { '1': PERFECT } });
    expect(games).toEqual([
      { score: 150, date: '2026-08-02', frames: null },
      { score: 300, date: '2026-08-02', frames: PERFECT },
    ]);
  });

  it('del más viejo al más nuevo, estable', () => {
    const list = [
      { date: '2026-09-02', score: 1 },
      { date: '2026-01-01', score: 2 },
      { date: '2026-09-02', score: 3 },
    ];
    expect(byDate(list).map((g) => g.score)).toEqual([2, 1, 3]);
  });

  it('solo cuentan los cuadros completos que suman lo anotado', () => {
    const frames = countedFrames([
      { score: 300, frames: PERFECT },
      { score: 290, frames: PERFECT }, // el admin cambió el total después
      { score: 20, frames: { rolls: [10, 5] } }, // incompleto
      { score: 100, frames: null },
      { score: 100, frames: {} as GameFrames }, // roto
      { score: SCORE_A, frames: GAME_A },
    ]);
    expect(frames).toEqual([PERFECT, GAME_A]);
    expect(hasPins(GAME_A)).toBe(true);
    expect(hasPins(PERFECT)).toBe(false);
    expect(hasPins({ rolls: [1], masks: [null] })).toBe(false);
  });
});

describe('racks', () => {
  it('cada tiro con los 10 parados, con las bolas extra del 10 y lo que quedó', () => {
    const racks = racksOf(GAME_A.rolls, GAME_A.masks);
    expect(racks).toHaveLength(11);
    expect(racks.map((r) => r.frame)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9]);
    expect(racks[0]).toEqual({ roll: 0, frame: 0, first: 10, second: null, strike: true, spare: false, leave: 0 });
    expect(racks[2]).toEqual({ roll: 3, frame: 2, first: 8, second: 0, strike: false, spare: false, leave: mask(7, 10) });
    expect(racks[10]).toEqual({ roll: 16, frame: 9, first: 9, second: 1, strike: false, spare: true, leave: mask(10) });
  });

  it('por teclado no se sabe qué quedó; la bola extra tras un spare no tiene segunda', () => {
    const rolls = [...Array.from({ length: 18 }, () => 0), 7, 3, 8];
    const racks = racksOf(rolls);
    expect(racks).toHaveLength(11);
    expect(racks.every((r) => r.leave == null)).toBe(true);
    expect(racks[10]).toMatchObject({ first: 8, second: null, strike: false, spare: false });
  });

  it('una máscara que no cuadra con los pinos del tiro no dice qué quedó', () => {
    const racks = racksOf([7, 3, ...Array.from({ length: 18 }, () => 0)], [mask(1, 2, 3), mask(4, 5, 6)]);
    expect(racks[0].leave).toBeNull();
  });

  it('los splits de la hoja: la primera bola que dejó un split', () => {
    expect(splitRolls(GAME_A.rolls, GAME_A.masks)).toEqual([3]);
    // Sin pines no hay círculos.
    expect(splitRolls(GAME_A.rolls)).toEqual([]);
    expect(splitRolls(GAME_A.rolls, GAME_A.rolls.map(() => null))).toEqual([]);
    // Un split en el 10 (tras un strike) también.
    const g = pinGame(...Array.from({ length: 9 }, () => 'X' as const), 'X', L([4, 6], false));
    expect(splitRolls(g.rolls, g.masks)).toEqual([10]);
  });
});

describe('porcentajes por cuadros', () => {
  it('percent redondea y sin intentos es null', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(0, 0)).toBeNull();
  });

  it('un juego con de todo', () => {
    const r = frameRates([GAME_A]);
    expect(r).toEqual({
      games: 1,
      strikes: 4,
      strikeChances: 11,
      // Cuadros sin strike: 2, 3, 4, 7, 8 y 9 (el 10 empezó con strike: su 9/ no es un cuadro sin strike).
      spares: 4,
      spareChances: 6,
      opens: 2,
      frames: 10,
      strikePct: 36,
      sparePct: 67,
      openPct: 20,
      firstBall: 8.8,
      bestStrikeRun: 2,
      cleanGames: 0,
    });
    // Strikes y abiertos cuentan igual que frameStats; los spares, sin las bolas extra del 10.
    const s = frameStats(GAME_A.rolls);
    expect([r.strikes, r.opens]).toEqual([s.strikes, s.opens]);
    expect(s.spares).toBe(r.spares + 1);
  });

  it('el perfecto: 12 de 12, sin spares que intentar, limpio y racha de 12', () => {
    const r = frameRates([PERFECT]);
    expect(r.strikePct).toBe(100);
    expect(r.strikeChances).toBe(12);
    expect(r.sparePct).toBeNull();
    expect(r.openPct).toBe(0);
    expect(r.firstBall).toBe(10);
    expect(r.bestStrikeRun).toBe(12);
    expect(r.cleanGames).toBe(1);
  });

  it('varios juegos se suman; X 7 2 en el 10 no es abierto ni un cuadro sin strike', () => {
    const tenth = { rolls: [...Array.from({ length: 18 }, () => 0), 10, 7, 2] };
    const r = frameRates([PERFECT, tenth]);
    expect(r.games).toBe(2);
    expect(r.frames).toBe(20);
    // 9 cuadros abiertos (0 0) del segundo juego.
    expect(r.opens).toBe(9);
    expect(r.strikes).toBe(13);
    expect(r.strikeChances).toBe(12 + 11);
    expect(r.spareChances).toBe(9);
    expect(r.sparePct).toBe(0);
    expect(r.cleanGames).toBe(1);
  });

  it('spares sobre los cuadros sin strike: el 10 cuenta solo si empezó sin strike', () => {
    const nine = Array.from({ length: 9 }, () => 10);
    // 9 strikes y X 7 2 / X 7 / en el 10: ningún cuadro sin strike (no hay spares que medir).
    for (const tenth of [[10, 7, 2], [10, 7, 3]]) {
      const r = frameRates([{ rolls: [...nine, ...tenth] }]);
      expect([r.spares, r.spareChances, r.sparePct]).toEqual([0, 0, null]);
      expect(r.cleanGames).toBe(1);
    }
    // 7 / X en el 10: un cuadro sin strike, convertido (la X de después es de strikes).
    const spared = frameRates([{ rolls: [...nine, 7, 3, 10] }]);
    expect([spared.spares, spared.spareChances, spared.sparePct]).toEqual([1, 1, 100]);
    expect(spared.strikes).toBe(10);
    // 7 2 en el 10: fallado.
    expect(frameRates([{ rolls: [...nine, 7, 2] }]).sparePct).toBe(0);
  });

  it('sin juegos: todo en cero o null', () => {
    const r = frameRates([]);
    expect(r.games).toBe(0);
    expect(r.strikePct).toBeNull();
    expect(r.firstBall).toBeNull();
  });
});

describe('tendencia', () => {
  it('promedio por mes, hacia abajo y en orden', () => {
    const months = monthlyAverages([
      { date: '2026-09-02', score: 201 },
      { date: '2026-08-15', score: 150 },
      { date: '2026-09-20', score: 180 },
    ]);
    expect(months).toEqual([
      { month: '2026-08', games: 1, pins: 150, average: 150, high: 150 },
      { month: '2026-09', games: 2, pins: 381, average: 190, high: 201 },
    ]);
  });

  it('media móvil con los que haya al principio', () => {
    expect(movingAverage([100, 200, 150, 250], 2)).toEqual([100, 150, 175, 200]);
    expect(movingAverage([100, 200, 150, 250], 3)).toEqual([100, 150, 150, 200]);
    expect(movingAverage([100, 101], 5)).toEqual([100, 100.5]);
    expect(movingAverage([], 5)).toEqual([]);
  });

  it('los últimos contra los de antes', () => {
    expect(recentTrend([100, 120, 130, 140, 150])).toBeNull();
    const up = recentTrend([100, 100, 100, 130, 130, 131]);
    expect(up).toEqual({ size: 3, recent: 130, before: 100, delta: 30 });
    expect(trendText(up!)).toBe('Vas subiendo: tus últimos 3 juegos promedian 130, 30 más que los 3 anteriores.');
    const down = recentTrend([...Array.from({ length: 10 }, () => 200), ...Array.from({ length: 10 }, () => 180)]);
    expect(down).toEqual({ size: 10, recent: 180, before: 200, delta: -20 });
    expect(trendText(down!)).toContain('Vas bajando');
    expect(trendText(down!)).toContain('20 menos');
    // Solo los 20 últimos cuentan con size 10.
    expect(recentTrend([0, 0, 0, ...Array.from({ length: 20 }, () => 150)])?.delta).toBe(0);
    expect(trendText({ size: 5, recent: 151, before: 150, delta: 1 })).toBe('Vas parejo: tus últimos 5 juegos promedian 151 (los 5 anteriores, 150).');
    // De otro jugador.
    expect(trendText(up!, false)).toBe('Va subiendo: sus últimos 3 juegos promedian 130, 30 más que los 3 anteriores.');
  });
});

describe('spares según lo que quedó', () => {
  it('nombres de lo que quedó', () => {
    expect(pinsOf(mask(10, 3, 6))).toEqual([3, 6, 10]);
    expect(leaveName(mask(10))).toBe('Pino 10');
    expect(leaveName(mask(7, 10))).toBe('7-10');
    expect(leaveName(ALL_PINS)).toBe('Los 10 pinos');
  });

  it('cuántas veces te queda cada cosa y cuántas la conviertes, del que más al que menos', () => {
    const leaves = leaveStats([GAME_A]);
    expect(leaves.map((l) => [leaveName(l.leave), l.faced, l.converted, l.split])).toEqual([
      ['Pino 10', 3, 2, false],
      ['4-7', 1, 1, false],
      ['6-10', 1, 1, false],
      ['7-10', 1, 0, true],
      ['2-4-5-8', 1, 1, false],
    ]);
    // Sin pines no hay nada.
    expect(leaveStats([PERFECT, { rolls: GAME_A.rolls }])).toEqual([]);
  });

  it('resumen: un pino, varios, sin splits y splits', () => {
    const s = spareSummary(leaveStats([GAME_A, GAME_A]));
    expect(s.all).toEqual({ faced: 14, converted: 10, pct: 71 });
    expect(s.single).toEqual({ faced: 6, converted: 4, pct: 67 });
    expect(s.multi).toEqual({ faced: 6, converted: 6, pct: 100 });
    expect(s.noSplits).toEqual({ faced: 12, converted: 10, pct: 83 });
    expect(s.splits).toEqual({ faced: 2, converted: 0, pct: 0 });
    expect(spareSummary([]).all).toEqual({ faced: 0, converted: 0, pct: null });
  });
});

describe('pino por pino', () => {
  it('cuánto te queda cada pino y cuánto lo conviertes', () => {
    const r = pinReport([GAME_A, PERFECT]);
    expect(r.games).toBe(1);
    expect(r.racks).toBe(11);
    const pin = (n: number) => r.pins[n - 1];
    expect(pin(10)).toEqual({ pin: 10, left: 5, leftPct: 45, inLeave: 5, converted: 3, convertedPct: 60 });
    expect(pin(7)).toEqual({ pin: 7, left: 2, leftPct: 18, inLeave: 2, converted: 1, convertedPct: 50 });
    expect(pin(1)).toEqual({ pin: 1, left: 0, leftPct: 0, inLeave: 0, converted: 0, convertedPct: null });
    expect(r.pins).toHaveLength(10);
  });

  it('la bola extra del 10 cuenta como primera bola, pero no como spare intentado', () => {
    const g = pinGame(...Array.from({ length: 9 }, () => 'X' as const), L([10], true), { bonus: 9, mask: ALL_PINS & ~mask(7) });
    const r = pinReport([g]);
    expect(r.racks).toBe(11);
    expect(r.pins[6]).toMatchObject({ left: 1, inLeave: 0, convertedPct: null });
    expect(r.pins[9]).toMatchObject({ left: 1, inLeave: 1, converted: 1 });
  });

  it('sin juegos con pines: nada', () => {
    const r = pinReport([PERFECT]);
    expect(r).toMatchObject({ games: 0, racks: 0 });
    expect(r.pins.every((p) => p.leftPct == null)).toBe(true);
  });

  it('niveles del mapa de calor', () => {
    expect(heatLevel(null, LEFT_CUTS)).toBe(0);
    expect(heatLevel(0, LEFT_CUTS)).toBe(0);
    expect(heatLevel(5, LEFT_CUTS)).toBe(1);
    expect(heatLevel(29, LEFT_CUTS)).toBe(2);
    expect(heatLevel(49, LEFT_CUTS)).toBe(3);
    expect(heatLevel(50, LEFT_CUTS)).toBe(4);
    expect(heatLevel(100, CONVERT_CUTS)).toBe(4);
    expect(heatLevel(39, CONVERT_CUTS)).toBe(0);
  });
});

describe('fuertes y débiles', () => {
  const tally = (faced: number, converted: number) => ({ faced, converted, pct: percent(converted, faced) });
  const spares = (over: Partial<SpareSummary> = {}): SpareSummary => ({
    all: tally(0, 0),
    single: tally(0, 0),
    multi: tally(0, 0),
    noSplits: tally(0, 0),
    splits: tally(0, 0),
    ...over,
  });
  const report = (racks: number, pins: Record<number, { left?: number; inLeave?: number; converted?: number }>): PinReport => ({
    racks,
    games: 3,
    pins: Array.from({ length: 10 }, (_, i) => {
      const p = pins[i + 1] ?? {};
      const left = p.left ?? 0;
      const inLeave = p.inLeave ?? 0;
      const converted = p.converted ?? 0;
      return { pin: i + 1, left, leftPct: percent(left, racks), inLeave, converted, convertedPct: percent(converted, inLeave) };
    }),
  });

  it('con pocas primeras bolas no dice nada', () => {
    expect(pinInsights(report(9, { 10: { left: 9, inLeave: 9, converted: 0 } }), spares())).toEqual({ strengths: [], weaknesses: [] });
  });

  it('el pino que más te queda, el que más te cuesta y el que mejor conviertes', () => {
    const r = report(40, {
      7: { left: 14, inLeave: 12, converted: 11 },
      10: { left: 10, inLeave: 10, converted: 3 },
      1: { left: 20 },
    });
    const out = pinInsights(r, spares());
    expect(out.weaknesses).toEqual([
      'Te queda mucho el pino 7: en el 35% de tus primeras bolas.',
      'Te cuesta el pino 10: cuando te queda, haces el spare 3 de 10 veces (30%).',
    ]);
    expect(out.strengths).toEqual(['Fuerte con el pino 7: cuando te queda, haces el spare 11 de 12 veces (92%).']);
  });

  it('un pino con pocas veces no cuenta para convertir; si todo va bien no hay débiles', () => {
    const r = report(40, { 10: { left: 4, inLeave: 4, converted: 4 }, 7: { left: 2, inLeave: 2, converted: 0 } });
    const out = pinInsights(r, spares());
    expect(out.weaknesses).toEqual([]);
    expect(out.strengths).toEqual(['Fuerte con el pino 10: cuando te queda, haces el spare 4 de 4 veces (100%).']);
  });

  it('spares de un pino y splits', () => {
    const r = report(30, {});
    expect(pinInsights(r, spares({ single: tally(20, 18), splits: tally(4, 1) })).strengths).toEqual([
      'Casi no fallas los spares de un pino: 18 de 20 (90%).',
      'Convertiste 1 split de 4.',
    ]);
    expect(pinInsights(r, spares({ single: tally(10, 6), splits: tally(3, 0) })).weaknesses).toEqual([
      'Se te escapan spares de un pino: haces 6 de 10 (60%).',
      'Te quedan muchos splits: 3 en 30 primeras bolas.',
    ]);
    // Pocos splits para la cantidad de bolas: no es un débil.
    expect(pinInsights(report(50, {}), spares({ splits: tally(3, 0) })).weaknesses).toEqual([]);
  });

  it('con un juego real: el 10 te queda mucho', () => {
    const games = Array.from({ length: 1 }, () => GAME_A);
    const out = pinInsights(pinReport(games), spareSummary(leaveStats(games)));
    expect(out.weaknesses).toEqual(['Te queda mucho el pino 10: en el 45% de tus primeras bolas.']);
    expect(out.strengths).toEqual([]);
  });
});
