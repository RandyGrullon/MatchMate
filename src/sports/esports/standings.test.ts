import { describe, expect, it } from 'vitest';
import {
  BR_TIEBREAK_TEXT,
  brPointsOf,
  brStandings,
  buildSeriesScore,
  ESPORTS_POINTS,
  esportsStandings,
  esportsTable,
  FC_POINTS,
  GAMES,
  seriesMatchResult,
  tiebreakText,
  walkoverScore,
  type BestOf,
  type BrGameInput,
  type GameId,
  type GameRecord,
  type SeriesRules,
} from '.';

const rules = (game: GameId, bestOf: BestOf, draws = false): SeriesRules => ({ game, bestOf, draws });
let n = 0;
/** Una serie terminada entre a y b con esos mapas. */
function series(game: GameId, bestOf: BestOf, a: string, b: string, games: GameRecord[], draws = false) {
  const r = rules(game, bestOf, draws);
  const score = buildSeriesScore(r, games);
  const winner = score.sides[0] > score.sides[1] ? 1 : score.sides[1] > score.sides[0] ? 2 : null;
  return seriesMatchResult({ id: `m${++n}`, side1: a, side2: b, winner, score });
}
const V = (a: number, b: number): GameRecord => ({ a, b });

describe('seriesMatchResult', () => {
  it('totales maps y points desde el marcador', () => {
    const m = series('valorant', 3, 'A', 'B', [V(13, 9), V(7, 13), V(13, 11)]);
    expect(m).toEqual({ id: m.id, side1: 'A', side2: 'B', winner: 1, totals: { maps: [2, 1], points: [33, 33] } });
  });

  it('W.O. da maps [need, 0], points [0, 0] y marca al que no vino', () => {
    const r = rules('valorant', 3);
    const m = seriesMatchResult({ id: 'wo', side1: 'A', side2: 'B', winner: 1, walkover: 2, score: walkoverScore(r, 2) });
    expect(m).toEqual({ id: 'wo', side1: 'A', side2: 'B', winner: 1, walkover: 2, totals: { maps: [2, 0], points: [0, 0] } });
    const m1 = seriesMatchResult({ id: 'wo1', side1: 'A', side2: 'B', winner: 2, walkover: 1, score: walkoverScore(rules('rocket_league', 7), 1) });
    expect(m1.totals).toEqual({ maps: [0, 4], points: [0, 0] });
    expect(m1.winner).toBe(2);
    // Sin marcador: al mejor de 1.
    expect(seriesMatchResult({ id: 'x', side1: 'A', side2: 'B', winner: 1, walkover: 2, score: null }).totals.maps).toEqual([1, 0]);
  });

  it('W.O. da 3 y 0 en la tabla', () => {
    const r = rules('valorant', 3);
    const m = seriesMatchResult({ id: 'wo', side1: 'A', side2: 'B', winner: 1, walkover: 2, score: walkoverScore(r, 2) });
    const t = esportsStandings('valorant', ['A', 'B'], [m]);
    expect(t.map((x) => [x.id, x.points, x.played, x.won, x.lost, x.for, x.against])).toEqual([
      ['A', 3, 1, 1, 0, 2, 0],
      ['B', 0, 1, 0, 1, 0, 2],
    ]);
    expect(t[1].extra.walkovers).toBe(1);
    expect(t[0].extra.walkoverWins).toBe(1);
  });

  it('W.O. doble: los dos pierden con 0 (no es un empate, tampoco en FC)', () => {
    const m = seriesMatchResult({ id: 'wo0', side1: 'A', side2: 'B', winner: null, walkover: 0, score: walkoverScore(rules('ea_fc', 1), 0) });
    const t = esportsStandings('ea_fc', ['A', 'B', 'C'], [m, series('ea_fc', 1, 'C', 'A', [V(1, 0)])]);
    const a = t.find((x) => x.id === 'A')!;
    const b = t.find((x) => x.id === 'B')!;
    expect([a.played, a.won, a.drawn, a.lost, a.points]).toEqual([2, 0, 0, 2, 0]);
    expect([b.played, b.won, b.drawn, b.lost, b.points]).toEqual([1, 0, 0, 1, 0]);
    expect(b.extra.walkovers).toBe(1);
    expect(t[0].id).toBe('C');
  });

  it('marcador sin totales: usa sides', () => {
    const m = seriesMatchResult({
      id: 's',
      side1: 'A',
      side2: 'B',
      winner: 2,
      score: { text: '0-2', sides: [0, 2], games: [], bestOf: 3 } as unknown as ReturnType<typeof walkoverScore>,
    });
    expect(m.totals).toEqual({ maps: [0, 2], points: [0, 0] });
  });
});

describe('tablas de series', () => {
  it('ganar 3, perder 0; primario mapas; FC 3/1/0 con goles', () => {
    expect(ESPORTS_POINTS).toEqual({ win: 3, draw: 0, loss: 0, walkoverLoss: 0 });
    expect(FC_POINTS).toEqual({ win: 3, draw: 1, loss: 0, walkoverLoss: 0 });
    const val = esportsTable('valorant', 'seed');
    expect(val.primary).toBe('maps');
    expect(val.restart).toBe('h2h');
    expect(val.criteria.map((c) => (typeof c.label === 'string' ? c.label : c.label(2)))).toEqual([
      'puntos',
      'dif. de mapas',
      'dif. de rondas',
      'enfrentamiento directo',
      'sorteo',
    ]);
    const rl = esportsTable('rocket_league');
    expect(rl.criteria.map((c) => (typeof c.label === 'string' ? c.label : c.label(2)))).toEqual([
      'puntos',
      'dif. de juegos',
      'dif. de goles',
      'enfrentamiento directo',
      'sorteo',
    ]);
    const fc = esportsTable('ea_fc');
    expect(fc.primary).toBe('points');
    expect(fc.points).toBe(FC_POINTS);
    expect(fc.criteria.map((c) => (typeof c.label === 'string' ? c.label : c.label(2)))).toEqual([
      'puntos',
      'dif. de goles',
      'goles a favor',
      'enfrentamiento directo',
      'sorteo',
    ]);
  });

  it('3 empatados a puntos se separan por dif. de mapas', () => {
    const results = [
      series('valorant', 3, 'A', 'B', [V(13, 5), V(13, 5)]),
      series('valorant', 3, 'B', 'C', [V(13, 5), V(5, 13), V(13, 5)]),
      series('valorant', 3, 'C', 'A', [V(13, 5), V(5, 13), V(13, 5)]),
      series('valorant', 3, 'A', 'D', [V(13, 5), V(13, 5)]),
      series('valorant', 3, 'B', 'D', [V(13, 5), V(13, 5)]),
      series('valorant', 3, 'C', 'D', [V(13, 5), V(13, 5)]),
    ];
    const t = esportsStandings('valorant', ['D', 'C', 'B', 'A'], results);
    expect(t.map((r) => r.id)).toEqual(['A', 'C', 'B', 'D']);
    expect(t.map((r) => r.points)).toEqual([6, 6, 6, 0]);
    expect(t.map((r) => r.diff)).toEqual([3, 2, 1, -6]);
    expect(t[1].decidedBy).toBe('dif. de mapas');
    expect(t[2].decidedBy).toBe('dif. de mapas');
    expect(t.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('empatados en mapas: dif. de rondas', () => {
    const results = [series('cs2', 1, 'A', 'C', [V(13, 2)]), series('cs2', 1, 'B', 'C', [V(13, 11)]), series('cs2', 1, 'C', 'D', [V(13, 0)])];
    const t = esportsStandings('cs2', ['A', 'B', 'C', 'D'], results);
    // A, B y C con 3 puntos y dif. de mapas 1 (C: +1 −2 = −1, no). A +11 rondas, B +2.
    expect(t.slice(0, 2).map((r) => r.id)).toEqual(['A', 'B']);
    expect(t[1].decidedBy).toBe('dif. de rondas');
  });

  it('dos empatados en todo: decide el enfrentamiento directo', () => {
    const results = [
      series('valorant', 3, 'A', 'B', [V(13, 11), V(11, 13), V(13, 11)]),
      series('valorant', 3, 'A', 'C', [V(11, 13), V(13, 11), V(11, 13)]),
      series('valorant', 3, 'B', 'D', [V(13, 11), V(11, 13), V(13, 11)]),
      series('valorant', 3, 'C', 'D', [V(13, 0), V(13, 0)]),
    ];
    const t = esportsStandings('valorant', ['B', 'A', 'C', 'D'], results);
    expect(t.map((r) => r.id)).toEqual(['C', 'A', 'B', 'D']);
    const a = t[1];
    const b = t[2];
    expect([a.points, a.extra.mapsDiff, a.extra.pointsDiff]).toEqual([3, 0, 0]);
    expect([b.points, b.extra.mapsDiff, b.extra.pointsDiff]).toEqual([3, 0, 0]);
    expect(b.decidedBy).toBe('enfrentamiento directo');
  });

  it('sin enfrentamiento que decida: sorteo con la semilla', () => {
    const results = [series('lol', 1, 'A', 'C', [{ w: 1 }]), series('lol', 1, 'B', 'D', [{ w: 1 }])];
    const t1 = esportsStandings('lol', ['A', 'B', 'C', 'D'], results, 'liga-1');
    const t2 = esportsStandings('lol', ['A', 'B', 'C', 'D'], results, 'liga-1');
    expect(t1.map((r) => r.id)).toEqual(t2.map((r) => r.id));
    expect(t1[1].decidedBy).toBe('sorteo');
    expect(new Set(t1.map((r) => r.rank)).size).toBe(4);
  });

  it('FC: empates 3-1-0 y dif. de goles', () => {
    const results = [
      series('ea_fc', 1, 'A', 'B', [V(1, 1)], true),
      series('ea_fc', 1, 'A', 'C', [V(2, 0)], true),
      series('ea_fc', 1, 'B', 'C', [V(1, 0)], true),
    ];
    const t = esportsStandings('ea_fc', ['C', 'B', 'A'], results);
    expect(t.map((r) => [r.id, r.points, r.won, r.drawn, r.lost, r.for, r.against])).toEqual([
      ['A', 4, 1, 1, 0, 3, 1],
      ['B', 4, 1, 1, 0, 2, 1],
      ['C', 0, 0, 0, 2, 0, 3],
    ]);
    expect(t[1].decidedBy).toBe('dif. de goles');
  });

  it('FC: misma dif. de goles, decide goles a favor', () => {
    const results = [series('ea_fc', 1, 'A', 'C', [V(3, 2)], true), series('ea_fc', 1, 'B', 'C', [V(1, 0)], true)];
    const t = esportsStandings('ea_fc', ['B', 'A', 'C'], results);
    expect(t.map((r) => r.id)).toEqual(['A', 'B', 'C']);
    expect(t[1].decidedBy).toBe('goles a favor');
  });

  it('tiebreakText con las palabras del juego', () => {
    expect(tiebreakText('valorant')).toBe('Orden: ganar la serie 3, perder 0 → dif. de mapas → dif. de rondas → enfrentamiento directo → sorteo.');
    expect(tiebreakText('rocket_league')).toBe('Orden: ganar la serie 3, perder 0 → dif. de juegos → dif. de goles → enfrentamiento directo → sorteo.');
    expect(tiebreakText('lol')).toBe('Orden: ganar la serie 3, perder 0 → dif. de juegos → dif. de kills → enfrentamiento directo → sorteo.');
    expect(tiebreakText('ea_fc')).toBe(
      'Orden (como el fútbol): ganar 3, empatar 1, perder 0 → dif. de goles → goles a favor → enfrentamiento directo → sorteo.',
    );
  });
});

describe('battle royale', () => {
  const FF = GAMES.free_fire.br!;
  const game = (id: string, round: number, gameNo: number, results: [string, number | null, number][], status: BrGameInput['status'] = 'finished'): BrGameInput => ({
    id,
    round,
    gameNo,
    status,
    results: results.map(([entryId, placement, kills]) => ({ entryId, placement, kills })),
  });

  it('brPointsOf: puesto + kills × puntos', () => {
    expect(brPointsOf(FF, 1, 3)).toBe(15);
    expect(brPointsOf(FF, 10, 0)).toBe(1);
    expect(brPointsOf(FF, 11, 2)).toBe(2);
    expect(brPointsOf(FF, null, 0)).toBe(0);
    expect(brPointsOf({ placementPoints: [10], killPoints: 2 }, 1, 4)).toBe(18);
  });

  it('el ejemplo de Free Fire: 1.º con 3 kills = 15', () => {
    const t = brStandings(['A', 'B', 'C'], [game('g1', 1, 1, [['A', 1, 3], ['B', 2, 0], ['C', 3, 5]])], FF);
    expect(t.map((r) => [r.entryId, r.rank, r.points, r.placementPoints, r.killPoints, r.kills, r.wins, r.played, r.lastPlacement])).toEqual([
      ['A', 1, 15, 12, 3, 3, 1, 1, 1],
      ['C', 2, 13, 8, 5, 5, 0, 1, 3],
      ['B', 3, 9, 9, 0, 0, 0, 1, 2],
    ]);
    expect(t.every((r) => r.decidedBy === undefined)).toBe(true);
  });

  it('desempate por victorias', () => {
    const t = brStandings(['A', 'B'], [game('g1', 1, 1, [['B', 2, 3], ['A', 1, 0]])], FF);
    expect(t.map((r) => [r.entryId, r.points])).toEqual([
      ['A', 12],
      ['B', 12],
    ]);
    expect(t[1].decidedBy).toBe('victorias');
  });

  it('desempate por kills', () => {
    const t = brStandings(['A', 'B'], [game('g1', 1, 1, [['A', 2, 1], ['B', 3, 2]])], FF);
    expect(t.map((r) => [r.entryId, r.points, r.kills])).toEqual([
      ['B', 10, 2],
      ['A', 10, 1],
    ]);
    expect(t[1].decidedBy).toBe('kills');
  });

  it('desempate por la última partida (menor puesto es mejor; sin jugarla, al final)', () => {
    const games = [game('g2', 1, 2, [['A', 4, 0], ['B', 3, 0]]), game('g1', 1, 1, [['A', 3, 0], ['B', 4, 0]])];
    const t = brStandings(['A', 'B'], games, FF);
    expect(t.map((r) => [r.entryId, r.points, r.lastPlacement])).toEqual([
      ['B', 15, 3],
      ['A', 15, 4],
    ]);
    expect(t[1].decidedBy).toBe('última partida');

    // C no jugó la última: queda detrás de D con los mismos puntos.
    const games2 = [game('h1', 1, 1, [['C', 5, 0], ['D', 9, 0]]), game('h2', 2, 1, [['C', null, 0], ['D', 9, 0]])];
    const t2 = brStandings(['C', 'D'], games2, { placementPoints: [12, 9, 8, 7, 6, 5, 4, 3, 3], killPoints: 1 });
    expect(t2.map((r) => [r.entryId, r.points, r.played, r.lastPlacement])).toEqual([
      ['D', 6, 2, 9],
      ['C', 6, 1, null],
    ]);
    expect(t2[1].decidedBy).toBe('última partida');
  });

  it('sorteo cuando todo empata, estable con la semilla', () => {
    const games = [game('g1', 1, 1, [['A', null, 0], ['B', null, 0], ['C', null, 0]])];
    const t1 = brStandings(['A', 'B', 'C'], games, FF, 'evento-1');
    const t2 = brStandings(['C', 'B', 'A'], games, FF, 'evento-1');
    expect(t1.map((r) => r.entryId)).toEqual(t2.map((r) => r.entryId));
    expect(t1.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(t1[1].decidedBy).toBe('sorteo');
    expect(t1[2].decidedBy).toBe('sorteo');
  });

  it('las partidas anuladas o por jugar no cuentan; los que no están en la lista se ignoran', () => {
    const games = [
      game('g1', 1, 1, [['A', 2, 0], ['B', 1, 0]]),
      game('g2', 1, 2, [['A', 1, 20], ['B', 2, 0]], 'void'),
      game('g3', 1, 3, [['A', 1, 20], ['B', 2, 0]], 'scheduled'),
      game('g4', 1, 4, [['Z', 1, 50]]),
    ];
    const t = brStandings(['A', 'B'], games, FF);
    expect(t.map((r) => [r.entryId, r.points, r.wins, r.played])).toEqual([
      ['B', 12, 1, 1],
      ['A', 9, 0, 1],
    ]);
    // La última terminada es g4 (donde no jugaron): nadie tiene puesto ahí.
    expect(t.map((r) => r.lastPlacement)).toEqual([null, null]);
  });

  it('varias rondas acumulan', () => {
    const games = [game('a', 1, 1, [['A', 1, 2], ['B', 2, 1]]), game('b', 2, 1, [['A', 2, 0], ['B', 1, 4]])];
    const t = brStandings(['A', 'B'], games, FF);
    expect(t.map((r) => [r.entryId, r.points, r.wins, r.kills, r.played, r.lastPlacement])).toEqual([
      ['B', 26, 1, 5, 2, 1],
      ['A', 23, 1, 2, 2, 2],
    ]);
  });

  it('texto del orden', () => {
    expect(BR_TIEBREAK_TEXT).toContain('victorias');
  });
});
