import { describe, expect, it } from 'vitest';
import { DEMO_COURSE } from '../../sports/golf/demo';
import { snapCard, snapRound } from '../testkit';
import { bowlingBaseline, cappedIndex, cappedPlayingHcp, gamesWonPct, golfDifferential, meanScore } from './baselines';

/** Juegos B1 de un día cada uno, desde el 1 de marzo. */
const games = (scores: number[], from = 1) =>
  scores.map((score, i) => ({ date: `2026-03-${String(from + i).padStart(2, '0')}`, start_time: null, event_id: `e${from + i}`, index: 0, score }));

describe('línea base de boliche (§1.7.6)', () => {
  it('pide 12 juegos antes de la fecha', () => {
    expect(bowlingBaseline(games(Array(11).fill(150)), '2026-04-01')).toBeNull();
    expect(bowlingBaseline(games(Array(12).fill(150)), '2026-04-01')).toEqual({ base: 150, games: 12 });
  });

  it('piso de la media de los últimos 30, sin los juegos de ese día', () => {
    const list = games([...Array(10).fill(100), ...Array(20).fill(160), ...Array(10).fill(170)], 1).map((g, i) => ({ ...g, date: `2026-${String(3 + Math.floor(i / 28)).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}` }));
    // 40 juegos: los últimos 30 son 20 de 160 y 10 de 170 → 163,33 → 163.
    expect(bowlingBaseline(list, '2026-12-01')).toEqual({ base: 163, games: 30 });
    const sameDay = [...games(Array(12).fill(150)), { date: '2026-04-01', start_time: null, event_id: 'x', index: 0, score: 300 }];
    expect(bowlingBaseline(sameDay, '2026-04-01')?.base).toBe(150);
    expect(meanScore([{ score: 150 }, { score: 151 }])).toBe(150.5);
  });
});

describe('raqueta: % de juegos ganados', () => {
  it('juegos ganados sobre jugados', () => {
    expect(gamesWonPct([
      [6, 4],
      [3, 6],
    ])).toBeCloseTo(47.368, 2);
    expect(gamesWonPct([])).toBeNull();
  });
});

describe('golf: diferencial MatchMate e índice topado', () => {
  it('bruto ajustado con par + 3 por hoyo y la salida de la copia del campo', () => {
    expect(golfDifferential(snapCard('c', 'r', 'p'), snapRound('r'))).toEqual({ value: 0.7, holes: 18 });
    // Hoyo 1 levantado (vale 7) y un 10 en el hoyo 2 (cuenta 7): 78 ajustado.
    const strokes = DEMO_COURSE.holes.map((h) => h.par) as (number | null)[];
    strokes[0] = null;
    strokes[1] = 10;
    const picked = strokes.map((_, i) => i === 0);
    expect(golfDifferential(snapCard('c', 'r', 'p', strokes, { picked_up: picked }), snapRound('r'))).toEqual({ value: 6, holes: 18 });
    // Falta un hoyo: no hay diferencial.
    expect(golfDifferential(snapCard('c', 'r', 'p', [...strokes.slice(1), null]), snapRound('r'))).toBeNull();
  });

  it('9 hoyos usan el rating de su vuelta', () => {
    const front = DEMO_COURSE.holes.slice(0, 9).map((h) => h.par);
    expect(golfDifferential(snapCard('c', 'r', 'p', front), snapRound('r', { nine: 'front', holes: 9 }))).toEqual({ value: 0.2, holes: 9 });
  });

  it('índice topado: el escrito topado en 36 con menos de 5 diferenciales; si no, min(escrito, derivado)', () => {
    expect(cappedIndex(20, [1, 2, 3])).toBe(20);
    expect(cappedIndex(40, [])).toBe(36);
    expect(cappedIndex(null, [])).toBe(0);
    const diffs = Array.from({ length: 22 }, (_, i) => 40 - i); // los últimos 20: 38 … 19
    // Mejores 8 de los últimos 20: 19 … 26 → 22,5.
    expect(cappedIndex(30, diffs)).toBe(22.5);
    expect(cappedIndex(10, diffs)).toBe(10);
    expect(cappedIndex(30, [12, 14, 16, 18, 20])).toBe(16);
  });

  it('hándicap de juego con el índice topado y el % de la competencia', () => {
    // 13,5 × 128 / 113 + (71,2 − 72) = 14,49; × 95 % = 13,77 → 14.
    expect(cappedPlayingHcp(snapCard('c', 'r', 'p'), snapRound('r'), 13.5)).toBe(14);
    expect(cappedPlayingHcp(snapCard('c', 'r', 'p', undefined, { tee_id: 'nada' }), snapRound('r'), 13.5)).toBeNull();
  });
});
