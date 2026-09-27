import { describe, expect, it } from 'vitest';
import { teeHoles, type PlayedHole } from './course';
import { DEMO_COURSE } from './demo';
import type { GolfRound } from './scoring';
import { golfStats } from './stats';

const holes = teeHoles(DEMO_COURSE, DEMO_COURSE.tees[0]);
const front = teeHoles(DEMO_COURSE, DEMO_COURSE.tees[0], 'front');

const round = (playingHcp: number, diffs: Record<number, number> = {}, list: PlayedHole[] = holes, pickups: number[] = []): GolfRound => ({
  holes: list,
  playingHcp,
  card: {
    strokes: list.map((h) => (pickups.includes(h.number) ? null : h.par + (diffs[h.number] ?? 0))),
    pickedUp: list.map((h) => pickups.includes(h.number)),
  },
});

describe('estadísticas del jugador', () => {
  // Ronda 1: eagle en el 1, birdie en el 2, hoyo en uno en el 3 (par 3), doble bogey en el 4, bogey en el 5 → 70.
  const r1 = round(10, { 1: -2, 2: -1, 3: -2, 4: 2, 5: 1 });
  r1.card.putts = holes.map((h) => (h.number === 3 ? 0 : h.number === 1 ? 1 : 2));
  // Ronda 2: todo bogey y recogió en el 7 (sin total bruto).
  const bogeys = Object.fromEntries(holes.map((h) => [h.number, 1]));
  const r2 = round(10, bogeys, holes, [7]);
  // Ronda 3: 9 hoyos a par.
  const r3 = round(4, {}, front);
  // Ronda 4: a medias (no cuenta para promedios pero sí sus hoyos).
  const r4 = round(10, { 1: -1 });
  r4.card.strokes = r4.card.strokes.map((s, i) => (i < 2 ? s : null));
  const s = golfStats([r1, r2, r3, r4]);

  it('mejor ronda y promedios por separado para 18 y 9 hoyos', () => {
    expect(s.rounds).toBe(3);
    expect(s.eighteen).toEqual({ rounds: 2, bestGross: 70, bestNet: 60, avgGross: 70, avgNet: 60, avgPoints: 37.5 });
    expect(s.nine).toEqual({ rounds: 1, bestGross: 36, bestNet: 32, avgGross: 36, avgNet: 32, avgPoints: 22 });
  });

  it('cuenta eagles, birdies, pares, bogeys, dobles y hoyos en uno', () => {
    expect(s.holes).toBe(18 + 17 + 9 + 2);
    expect(s.eagles).toBe(2);
    expect(s.albatrosses).toBe(0);
    expect(s.birdies).toBe(2);
    expect(s.pars).toBe(13 + 9 + 1);
    expect(s.bogeys).toBe(1 + 17);
    expect(s.doubleBogeys).toBe(1);
    expect(s.holesInOne).toBe(1);
    expect(s.pickups).toBe(1);
  });

  it('putts por ronda y por hoyo', () => {
    expect(s.putts).toBe(33);
    expect(s.puttHoles).toBe(18);
    expect(s.avgPutts).toBe(33);
    expect(s.puttsPerHole).toBe(1.83);
  });

  it('sin rondas: todo en cero o null', () => {
    const empty = golfStats([]);
    expect(empty.rounds).toBe(0);
    expect(empty.eighteen.bestGross).toBeNull();
    expect(empty.avgPutts).toBeNull();
    expect(empty.puttsPerHole).toBeNull();
  });
});
