/**
 * Golf: estadísticas de un jugador a partir de sus rondas (aprobadas).
 * Las rondas de 9 y de 18 hoyos van por separado para mejor ronda y promedios.
 * El Handicap Index oficial NO se calcula aquí (lo lleva FEDOGOLF/GHIN).
 */

import { scoreRound, type GolfRound } from './scoring';

export interface GolfRoundAgg {
  /** Rondas completas. */
  rounds: number;
  /** Mejor bruto y neto (solo rondas sin «recogió», que tienen total). */
  bestGross: number | null;
  bestNet: number | null;
  avgGross: number | null;
  avgNet: number | null;
  /** Stableford medio (neto; recoger vale 0). */
  avgPoints: number | null;
}

export interface GolfStats {
  /** Rondas completas (de 9 o de 18). */
  rounds: number;
  eighteen: GolfRoundAgg;
  nine: GolfRoundAgg;
  /** Hoyos jugados con golpes (sin contar los que recogió). */
  holes: number;
  /** Tres o más bajo par (incluye hoyo en uno en par 4). */
  albatrosses: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  /** Doble bogey o peor. */
  doubleBogeys: number;
  holesInOne: number;
  pickups: number;
  /** Putts anotados y en cuántos hoyos. */
  putts: number;
  puttHoles: number;
  /** Putts por ronda de 18 (solo rondas de 18 con los putts de todos los hoyos). */
  avgPutts: number | null;
  puttsPerHole: number | null;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
const avg = (xs: number[], r = round1) => (xs.length ? r(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const min = (xs: number[]) => (xs.length ? Math.min(...xs) : null);

export function golfStats(rounds: readonly GolfRound[]): GolfStats {
  const scores = rounds.map((r) => scoreRound(r, { format: 'stableford', basis: 'net' }));
  const agg = (n: number): GolfRoundAgg => {
    const done = scores.filter((s) => s.complete && s.holes.length === n);
    const gross = done.filter((s) => s.gross != null).map((s) => s.gross!);
    const net = done.filter((s) => s.net != null).map((s) => s.net!);
    return { rounds: done.length, bestGross: min(gross), bestNet: min(net), avgGross: avg(gross), avgNet: avg(net), avgPoints: avg(done.map((s) => s.points)) };
  };
  const out: GolfStats = {
    rounds: scores.filter((s) => s.complete).length,
    eighteen: agg(18),
    nine: agg(9),
    holes: 0,
    albatrosses: 0,
    eagles: 0,
    birdies: 0,
    pars: 0,
    bogeys: 0,
    doubleBogeys: 0,
    holesInOne: 0,
    pickups: 0,
    putts: 0,
    puttHoles: 0,
    avgPutts: null,
    puttsPerHole: null,
  };
  const puttRounds: number[] = [];
  scores.forEach((s) => {
    s.holes.forEach((h) => {
      if (h.pickedUp) out.pickups++;
      if (h.putts != null) {
        out.putts += h.putts;
        out.puttHoles++;
      }
      if (h.strokes == null) return;
      out.holes++;
      if (h.strokes === 1) out.holesInOne++;
      const d = h.strokes - h.par;
      if (d <= -3) out.albatrosses++;
      else if (d === -2) out.eagles++;
      else if (d === -1) out.birdies++;
      else if (d === 0) out.pars++;
      else if (d === 1) out.bogeys++;
      else out.doubleBogeys++;
    });
    if (s.complete && s.holes.length === 18 && s.holes.every((h) => h.putts != null)) puttRounds.push(s.putts!);
  });
  out.avgPutts = avg(puttRounds);
  out.puttsPerHole = out.puttHoles ? round2(out.putts / out.puttHoles) : null;
  return out;
}
