import { describe, expect, it } from 'vitest';
import type { Match } from '../../../lib/data/matches';
import { toPlayoffs, type Playoff, type PlayoffSeries, type PlayoffSeriesRow } from '../../../lib/data/playoffs';
import { champion } from '../../../sports/formats/knockout';
import {
  bestOfLabel,
  byesFor,
  defaultBestOf,
  isPlayoffMatch,
  moveSeed,
  nextGame,
  playoffBracket,
  playoffPodium,
  playoffProblem,
  playoffRounds,
  seriesGames,
  seriesKey,
  seriesLine,
  seriesOfKey,
  seriesRoundName,
  seriesScore,
  topSeeds,
  winsNeeded,
} from './playoffs';

const series = (p: Partial<PlayoffSeries> & Pick<PlayoffSeries, 'id' | 'round' | 'slot'>): PlayoffSeries => ({
  playoffId: 'po',
  bestOf: 3,
  teamA: null,
  teamB: null,
  seedA: null,
  seedB: null,
  labelA: null,
  labelB: null,
  winsA: 0,
  winsB: 0,
  winner: null,
  bye: false,
  nextSeries: null,
  nextSide: null,
  ...p,
});

/** Playoff de 3 equipos: el 1.º pasa directo; semifinal 2 vs 3; final. */
const three: Playoff = {
  id: 'po',
  leagueId: 'L',
  seasonId: 's',
  name: 'Playoffs',
  status: 'active',
  bestOf: [3, 5],
  seeds: ['T1', 'T2', 'T3'],
  winner: null,
  createdAt: '2026-09-01T00:00:00Z',
  series: [
    series({ id: 'r1s1', round: 1, slot: 1, teamA: 'T1', seedA: 1, labelA: 'Tigres', bye: true, winner: 'T1', nextSeries: 'fin', nextSide: 'a' }),
    series({ id: 'r1s2', round: 1, slot: 2, teamA: 'T2', seedA: 2, labelA: 'Leones', teamB: 'T3', seedB: 3, labelB: 'Águilas', winsA: 1, winsB: 1, nextSeries: 'fin', nextSide: 'b' }),
    series({ id: 'fin', round: 2, slot: 1, bestOf: 5, teamA: 'T1', seedA: 1, labelA: 'Tigres' }),
  ],
};

const game = (id: string, p: Partial<Match> & { seriesId?: string | null }): Match =>
  ({
    id,
    leagueId: 'L',
    eventId: null,
    round: 1,
    stage: '',
    bracketKey: 'PO1-2',
    court: '',
    scheduledAt: null,
    status: 'scheduled',
    format: 'fiba',
    requireConfirm: true,
    score: null,
    winner: null,
    walkoverSide: null,
    scorerId: null,
    leaseUntil: null,
    seq: 0,
    version: 0,
    proposedBy: null,
    proposedAt: null,
    proposedSide: null,
    confirmedBy: null,
    confirmedAt: null,
    disputedBy: null,
    disputedAt: null,
    disputeNote: null,
    note: null,
    createdBy: null,
    sides: [
      { side: 1, teamId: 'T2', label: 'Leones', seed: 2, players: [] },
      { side: 2, teamId: 'T3', label: 'Águilas', seed: 3, players: [] },
    ],
    createdAt: null,
    updatedAt: null,
    ...p,
  }) as Match;

describe('playoffs: rondas y series', () => {
  it('juegos del playoff: por su serie o por la clave PO<ronda>-<lugar> (no los del torneo relámpago)', () => {
    expect(isPlayoffMatch({ bracketKey: null, seriesId: 'x' })).toBe(true);
    expect(isPlayoffMatch({ bracketKey: 'PO2-1', seriesId: null })).toBe(true);
    expect(isPlayoffMatch({ bracketKey: 'R1-1' })).toBe(false);
    expect(isPlayoffMatch({ bracketKey: null })).toBe(false);
  });

  it('rondas, al mejor de cuántos y pases directos', () => {
    expect([2, 3, 4, 5, 8, 9].map(playoffRounds)).toEqual([1, 2, 2, 3, 3, 4]);
    expect(playoffRounds(1)).toBe(0);
    expect(defaultBestOf(2)).toEqual([5]);
    expect(defaultBestOf(8)).toEqual([3, 3, 5]);
    expect([1, 3, 5, 7].map(winsNeeded)).toEqual([1, 2, 3, 4]);
    expect(bestOfLabel(1)).toBe('A un juego');
    expect(bestOfLabel(7)).toBe('Al mejor de 7');
    expect([3, 4, 6, 8].map(byesFor)).toEqual([1, 0, 2, 0]);
  });

  it('el marcador y cómo va la serie en palabras', () => {
    const nameOf = (id: string | null, label: string | null) => label ?? id ?? '?';
    const [bye, semi] = three.series;
    expect(seriesScore(semi)).toBe('1–1');
    expect(seriesLine(bye, nameOf)).toBe('Pase directo');
    expect(seriesLine(three.series[2], nameOf)).toBe('Esperando rival');
    expect(seriesLine(semi, nameOf)).toBe('Empatada 1–1');
    expect(seriesLine({ ...semi, winsA: 0, winsB: 0 }, nameOf)).toBe('Por empezar');
    expect(seriesLine({ ...semi, winsB: 2, winsA: 1 }, nameOf)).toBe('Águilas gana 2–1');
    expect(seriesLine({ ...semi, winsA: 1, winsB: 2, winner: 'T3' }, nameOf)).toBe('Águilas ganó 2–1');
    expect(seriesRoundName(semi, three)).toBe('Semifinal');
    expect(seriesRoundName(three.series[2], three)).toBe('Final');
  });

  it('la llave como el cuadro del torneo relámpago (claves PO<ronda>-<lugar>, a dónde pasa el ganador)', () => {
    const b = playoffBracket(three);
    expect(b.rounds).toBe(2);
    expect(b.size).toBe(4);
    expect(b.matches.map((m) => m.key)).toEqual(['PO1-1', 'PO1-2', 'PO2-1']);
    expect(b.matches[0]).toMatchObject({ bye: true, side1: 'T1', side2: null, winner: 'T1', next: { key: 'PO2-1', side: 1 } });
    expect(b.matches[1]).toMatchObject({ index: 1, seed1: 2, seed2: 3, next: { key: 'PO2-1', side: 2 } });
    // Los pases directos no son ganadores anotados.
    expect(b.winners).toEqual({});
    expect(champion(b)).toBeNull();
    expect(seriesOfKey(three, 'PO1-2')?.id).toBe('r1s2');
    expect(seriesKey(three.series[2])).toBe('PO2-1');
    const done = { ...three, series: three.series.map((s) => (s.id === 'fin' ? { ...s, teamB: 'T3', winner: 'T3' } : s)) };
    expect(champion(playoffBracket(done))).toBe('T3');
    expect(playoffPodium(done)).toEqual({ champion: 'T3', runnerUp: 'T1' });
    expect(playoffPodium(three)).toEqual({ champion: null, runnerUp: null });
  });

  it('los juegos de la serie (sin anulados, en orden) y cuál sigue', () => {
    const at = (ms: number) => ({ toMillis: () => ms });
    const now = Date.parse('2026-09-10T00:00:00Z');
    const g1 = game('g1', { seriesId: 'r1s2', status: 'confirmed', winner: 1, createdAt: at(1) });
    const g2 = game('g2', { seriesId: 'r1s2', status: 'void', createdAt: at(2) });
    const g3 = game('g3', { seriesId: 'r1s2', status: 'finished', winner: 2, proposedAt: '2026-09-09T12:00:00Z', createdAt: at(3) });
    const g4 = game('g4', { seriesId: 'otra', createdAt: at(0) });
    expect(seriesGames('r1s2', [g3, g4, g2, g1]).map((m) => m.id)).toEqual(['g1', 'g3']);
    // Propuesto hace menos de 48 h: todavía no cuenta, es el que sigue.
    expect(nextGame('r1s2', [g1, g3], now)?.id).toBe('g3');
    // A las 48 h ya cuenta: no hay otro todavía (lo programa la base).
    expect(nextGame('r1s2', [g1, g3], Date.parse('2026-09-12T00:00:00Z'))).toBeNull();
  });
});

describe('playoffs: armarlos', () => {
  it('los primeros de la tabla, sin repetir; subir y bajar en la siembra', () => {
    expect(topSeeds(['a', 'b', 'a', 'c', 'd'], 3)).toEqual(['a', 'b', 'c']);
    expect(moveSeed(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveSeed(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('lo que falta: equipos, repetidos, una por ronda y 1/3/5/7', () => {
    expect(playoffProblem(['a'], [])).toMatch(/al menos 2/);
    expect(playoffProblem(['a', 'a'], [3])).toMatch(/repetido/);
    expect(playoffProblem(['a', 'b', 'c'], [3])).toMatch(/cada ronda/);
    expect(playoffProblem(['a', 'b'], [4])).toMatch(/1, 3, 5 o 7/);
    expect(playoffProblem(['a', 'b', 'c', 'd'], [3, 5])).toBeNull();
  });
});

describe('playoffs: de la base a la app', () => {
  it('toPlayoffs: el más nuevo primero, sus series por ronda y lugar, arreglos y números', () => {
    const row = (id: string, created: string) => ({ id, league_id: 'L', season_id: 's', name: 'Playoffs', status: 'active' as const, best_of: [3, 5], seeds: ['T1', 'T2'], winner: null, created_at: created });
    const s = (id: string, playoff: string, round: number, slot: number): PlayoffSeriesRow => ({
      id,
      playoff_id: playoff,
      round,
      slot,
      best_of: 3,
      team_a: 'T1',
      team_b: null,
      seed_a: 1,
      seed_b: null,
      label_a: 'Tigres',
      label_b: null,
      wins_a: 0,
      wins_b: 0,
      winner: null,
      bye: false,
      next_series: null,
      next_side: 'x' as 'a',
    });
    const list = toPlayoffs([row('viejo', '2025-01-01'), { ...row('nuevo', '2026-01-01'), status: 'finished', best_of: null, winner: 'T1' }], [s('b', 'nuevo', 2, 1), s('a', 'nuevo', 1, 2), s('c', 'viejo', 1, 1)]);
    expect(list.map((p) => p.id)).toEqual(['nuevo', 'viejo']);
    expect(list[0]).toMatchObject({ status: 'finished', bestOf: [], winner: 'T1' });
    expect(list[0].series.map((x) => x.id)).toEqual(['a', 'b']);
    expect(list[0].series[0]).toMatchObject({ teamA: 'T1', labelA: 'Tigres', nextSide: null, bye: false });
    expect(list[1].bestOf).toEqual([3, 5]);
  });
});
