import { describe, expect, it } from 'vitest';
import { replay } from '../types';
import { pointsEngine, serveInfo, socialStandings, validatePointsScore, type PointsEvent, type ScoredRound } from './social';

const five = ['A', 'B', 'C', 'D', 'E'];
const night: ScoredRound[] = [
  { matches: [{ side1: ['A', 'B'], side2: ['C', 'D'], score1: 15, score2: 9 }], rests: ['E'] },
  { matches: [{ side1: ['A', 'E'], side2: ['B', 'C'], score1: 10, score2: 14 }], rests: ['D'] },
];
const pts = (rows: { id: string; points: number }[]) => Object.fromEntries(rows.map((r) => [r.id, r.points]));

describe('tabla individual del americano/mexicano', () => {
  it('cada quien suma los puntos de su pareja; ganados, perdidos y diferencia', () => {
    const t = socialStandings(five, night, { rest: 'none' });
    const a = t.find((r) => r.id === 'A')!;
    expect(a).toMatchObject({ played: 2, won: 1, lost: 1, for: 25, against: 23, diff: 2, points: 25 });
    expect(t.find((r) => r.id === 'B')).toMatchObject({ won: 2, for: 29 });
    expect(pts(t)).toEqual({ A: 25, B: 29, C: 23, D: 9, E: 10 });
    expect(t.map((r) => r.id)).toEqual(['B', 'A', 'C', 'E', 'D']);
  });

  it('descanso con su propio promedio (por defecto)', () => {
    const t = socialStandings(five, night);
    expect(pts(t)).toEqual({ A: 25, B: 29, C: 23, D: 18, E: 20 });
    expect(t.find((r) => r.id === 'D')!.extra).toMatchObject({ rests: 1, avg: 9, bonus: 9 });
  });

  it('descanso con el promedio de la ronda', () => {
    // Promedio por jugador de cada ronda: (15·2 + 9·2) / 4 = 12 y (10·2 + 14·2) / 4 = 12.
    expect(pts(socialStandings(five, night, { rest: 'round-average' }))).toEqual({ A: 25, B: 29, C: 23, D: 21, E: 22 });
  });

  it('normalizar: puntos por partido jugado', () => {
    expect(pts(socialStandings(five, night, { rest: 'normalize' }))).toEqual({ A: 12.5, B: 14.5, C: 11.5, D: 9, E: 10 });
  });

  it('una ronda sin marcadores no cuenta, ni su descanso', () => {
    const t = socialStandings(five, [...night, { matches: [{ side1: ['B', 'D'], side2: ['C', 'E'] }], rests: ['A'] }]);
    expect(t.find((r) => r.id === 'A')!.extra.rests).toBe(0);
    expect(t.find((r) => r.id === 'B')!.played).toBe(2);
  });

  it('orden: puntos → partidos ganados → diferencia; si sigue igual, comparten puesto', () => {
    const t = socialStandings(
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      [
        {
          matches: [
            { side1: ['A', 'B'], side2: ['C', 'D'], score1: 13, score2: 11 },
            { side1: ['E', 'F'], side2: ['G', 'H'], score1: 13, score2: 15 },
          ],
          rests: [],
        },
      ],
    );
    expect(t.map((r) => r.id)).toEqual(['G', 'H', 'A', 'B', 'E', 'F', 'C', 'D']);
    expect(t.map((r) => r.rank)).toEqual([1, 1, 3, 3, 5, 5, 7, 7]);
    expect(t.map((r) => r.decidedBy)).toEqual([undefined, undefined, 'puntos', undefined, 'partidos ganados', undefined, 'puntos', undefined]);
  });
});

describe('motor de suma de puntos', () => {
  const cfg = { mode: 'total' as const, target: 24 };

  it('termina cuando la suma llega al total y no deja anotar más', () => {
    const log: PointsEvent[] = [...Array(13).fill({ type: 'point', side: 1 }), ...Array(11).fill({ type: 'point', side: 2 })];
    const s = replay(pointsEngine, cfg, log);
    expect(pointsEngine.isOver(s)).toBe(true);
    expect(pointsEngine.result(s)).toEqual({ winner: 1, summary: '13-11' });
    expect(() => pointsEngine.apply(s, { type: 'point', side: 2 })).toThrow('El partido ya terminó.');
  });

  it('deshacer = repetir la lista sin la última jugada', () => {
    const log: PointsEvent[] = [
      { type: 'point', side: 1 },
      { type: 'point', side: 2 },
      { type: 'point', side: 2 },
    ];
    expect(replay(pointsEngine, cfg, log.slice(0, -1)).score).toEqual([1, 1]);
    expect(pointsEngine.result(replay(pointsEngine, cfg, log)).winner).toBeNull();
  });

  it('por tiempo: sigue hasta «Terminar»; empate sin ganador', () => {
    const t = { mode: 'time' as const, minutes: 12 };
    let s = pointsEngine.init(t);
    for (let i = 0; i < 40; i++) s = pointsEngine.apply(s, { type: 'point', side: i % 2 === 0 ? 1 : 2 });
    expect(pointsEngine.isOver(s)).toBe(false);
    s = pointsEngine.apply(s, { type: 'end' });
    expect(pointsEngine.result(s)).toEqual({ winner: null, summary: '20-20' });
  });

  it('cambio de saque cada 4 puntos', () => {
    let s = pointsEngine.init({ ...cfg, serveEvery: 4 });
    expect(serveInfo(s)).toEqual({ side: 1, turn: 0, changed: false });
    for (let i = 0; i < 4; i++) s = pointsEngine.apply(s, { type: 'point', side: 1 });
    expect(serveInfo(s)).toEqual({ side: 2, turn: 1, changed: true });
  });

  it('valida un marcador escrito a mano', () => {
    expect(validatePointsScore(cfg, 13, 11)).toBeNull();
    expect(validatePointsScore(cfg, 13, 10)).toBe('Los puntos de los dos lados deben sumar 24.');
    expect(validatePointsScore(cfg, -1, 25)).toMatch(/enteros/);
    expect(validatePointsScore({ mode: 'time' }, 9, 7)).toBeNull();
  });
});
