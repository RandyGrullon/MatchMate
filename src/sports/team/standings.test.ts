import { describe, expect, it } from 'vitest';
import type { StandingRow } from '../types';
import { football, footballConfig, footballMatchResult, type FootballEvent } from './football';
import { basketballStandings, footballStandings, type TeamMatchResult } from './standings';

let seq = 0;
/** Partido de baloncesto terminado: A 80-70 B. */
const bb = (a: string, pa: number, pb: number, b: string, extra: Partial<TeamMatchResult> = {}): TeamMatchResult => ({
  id: `b${++seq}`,
  side1: a,
  side2: b,
  winner: pa > pb ? 1 : pa < pb ? 2 : null,
  totals: { points: [pa, pb] },
  ...extra,
});
/** Partido de fútbol terminado: A 2-1 B. */
const fb = (a: string, ga: number, gb: number, b: string, totals: Record<string, [number, number]> = {}, extra: Partial<TeamMatchResult> = {}): TeamMatchResult => ({
  id: `f${++seq}`,
  side1: a,
  side2: b,
  winner: ga > gb ? 1 : ga < gb ? 2 : null,
  totals: { goals: [ga, gb], ...totals },
  ...extra,
});
const order = (rows: StandingRow[]) => rows.map((r) => r.id);
const by = (rows: StandingRow[]) => Object.fromEntries(rows.map((r) => [r.id, r]));

describe('cuándo se vuelve a empezar el desempate', () => {
  it('FIBA: si un criterio general deja 2 empatados, decide el partido entre ellos', () => {
    // Entre los 3, todo igual. Diferencia general: A +30, B +10, C +10. C tiene más puntos a favor, pero B le ganó.
    const rows = basketballStandings([], [bb('A', 70, 60, 'B'), bb('B', 70, 60, 'C'), bb('C', 70, 60, 'A'), bb('A', 80, 50, 'D'), bb('B', 60, 50, 'D'), bb('C', 80, 70, 'D')]);
    expect(order(rows)).toEqual(['A', 'B', 'C', 'D']);
    expect(by(rows).B.decidedBy).toBe('dif. de puntos');
    expect(by(rows).C.decidedBy).toBe('resultado entre ellos');
  });

  it('FIFA: tras un criterio general se sigue con el siguiente (no se vuelve al directo)', () => {
    // Entre los 3, todo igual. Diferencia general: A +3, B +1, C +1. B le ganó a C, pero C tiene más goles a favor.
    const results = [fb('A', 1, 0, 'B'), fb('B', 1, 0, 'C'), fb('C', 1, 0, 'A'), fb('A', 3, 0, 'D'), fb('B', 2, 1, 'D'), fb('C', 3, 2, 'D')];
    const rows = footballStandings([], results, { tiebreak: ['h2h', 'diff', 'for', 'fair_play', 'lot'] });
    expect(order(rows)).toEqual(['A', 'C', 'B', 'D']);
    expect(by(rows).C.decidedBy).toBe('dif. de goles');
    expect(by(rows).B.decidedBy).toBe('goles a favor');
  });

  it('sorteo automático con semilla', () => {
    const circle = [bb('A', 70, 60, 'B'), bb('B', 70, 60, 'C'), bb('C', 70, 60, 'A')];
    const a = basketballStandings([], circle, { lotSeed: 'liga-1' });
    expect(a.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(a.slice(1).every((r) => r.decidedBy === 'sorteo')).toBe(true);
    // La misma semilla da el mismo orden.
    expect(order(basketballStandings([], circle, { lotSeed: 'liga-1' }))).toEqual(order(a));
  });
});

describe('tabla FIBA', () => {
  it('ganar 2, perder 1, forfeit 0 (20-0) y default 1 (2-0 si el ganador iba abajo)', () => {
    const rows = basketballStandings(
      ['A', 'B', 'C'],
      [
        bb('A', 80, 70, 'B'),
        bb('A', 0, 0, 'C', { walkover: 2, winner: 1 }),
        // C se quedó sin jugadores cuando ganaba 30-20: queda 2-0 para B y C recibe 1 punto.
        bb('B', 20, 30, 'C', { defaulted: 2, winner: 1 }),
      ],
    );
    expect(order(rows)).toEqual(['A', 'B', 'C']);
    const t = by(rows);
    expect(t.A).toMatchObject({ played: 2, won: 2, lost: 0, points: 4, for: 100, against: 70, diff: 30, rank: 1 });
    expect(t.B).toMatchObject({ played: 2, won: 1, lost: 1, points: 3, for: 72, against: 80 });
    expect(t.C).toMatchObject({ played: 2, won: 0, lost: 2, points: 1, for: 0, against: 22, extra: { forfeits: 1, defaults: 1 } });
    expect(t.B.decidedBy).toBe('puntos');
  });

  it('default con el ganador arriba: se queda el marcador', () => {
    const t = by(basketballStandings([], [bb('A', 40, 35, 'B', { defaulted: 2 })]));
    expect(t.A).toMatchObject({ for: 40, against: 35, points: 2 });
    expect(t.B).toMatchObject({ points: 1 });
  });

  it('empate de 2: manda el partido entre ellos aunque el otro tenga mejor diferencia', () => {
    const rows = basketballStandings(
      ['A', 'B', 'C', 'D'],
      [bb('A', 70, 68, 'B'), bb('B', 100, 50, 'C'), bb('B', 100, 50, 'D'), bb('A', 50, 60, 'C'), bb('A', 70, 60, 'D'), bb('C', 50, 60, 'D')],
    );
    expect(order(rows)).toEqual(['A', 'B', 'D', 'C']);
    const t = by(rows);
    expect(t.A.points).toBe(5);
    expect(t.B.points).toBe(5);
    expect(t.B.diff).toBeGreaterThan(t.A.diff);
    expect(t.B.decidedBy).toBe('resultado entre ellos');
    expect(t.D.decidedBy).toBe('puntos');
    expect(t.C.decidedBy).toBe('resultado entre ellos');
  });

  it('empate de 3: diferencia entre ellos', () => {
    const rows = basketballStandings(
      [],
      [bb('A', 80, 70, 'B'), bb('B', 75, 70, 'C'), bb('C', 90, 80, 'A'), bb('A', 60, 50, 'D'), bb('B', 60, 50, 'D'), bb('C', 60, 50, 'D')],
    );
    expect(order(rows)).toEqual(['C', 'A', 'B', 'D']);
    expect(rows.map((r) => r.points)).toEqual([5, 5, 5, 3]);
    expect(rows.map((r) => r.decidedBy)).toEqual([undefined, 'dif. entre ellos', 'dif. entre ellos', 'puntos']);
  });

  it('empate de 3 que queda en 2: se vuelve a empezar entre esos 2', () => {
    // Diferencia entre los 3: A −10, B +5, C +5. Entre B y C, B ganó.
    const rows = basketballStandings([], [bb('A', 80, 75, 'B'), bb('B', 80, 70, 'C'), bb('C', 85, 70, 'A')]);
    expect(order(rows)).toEqual(['B', 'C', 'A']);
    expect(by(rows).C.decidedBy).toBe('resultado entre ellos');
    expect(by(rows).A.decidedBy).toBe('dif. entre ellos');
  });

  it('empate de 3 igual entre ellos: diferencia general; si no, comparten puesto o sorteo', () => {
    const circle = [bb('A', 70, 60, 'B'), bb('B', 70, 60, 'C'), bb('C', 70, 60, 'A')];
    const general = basketballStandings([], [...circle, bb('A', 60, 50, 'D'), bb('B', 70, 50, 'D'), bb('C', 80, 50, 'D')]);
    expect(order(general)).toEqual(['C', 'B', 'A', 'D']);
    expect(by(general).B.decidedBy).toBe('dif. de puntos');
    const flat = basketballStandings([], circle);
    expect(flat.map((r) => r.rank)).toEqual([1, 1, 1]);
    expect(flat.every((r) => r.decidedBy === undefined)).toBe(true);
    const lot = basketballStandings([], circle, { lot: ['C', 'A', 'B'] });
    expect(order(lot)).toEqual(['C', 'A', 'B']);
    expect(lot.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(by(lot).A.decidedBy).toBe('sorteo');
  });

  it('equipos sin partidos salen con 0', () => {
    const rows = basketballStandings(['Z', 'A'], [bb('A', 50, 40, 'B')]);
    expect(order(rows)).toEqual(['A', 'B', 'Z']);
    expect(by(rows).Z).toMatchObject({ played: 0, points: 0, rank: 3 });
    expect(by(rows).B).toMatchObject({ points: 1, rank: 2 });
  });
});

describe('tabla de fútbol y sala', () => {
  it('3-1-0 y W.O. 3-0', () => {
    const rows = footballStandings(['A', 'B', 'C'], [fb('A', 2, 1, 'B'), fb('B', 1, 1, 'C'), fb('A', 0, 0, 'C', {}, { walkover: 2 })]);
    expect(order(rows)).toEqual(['A', 'B', 'C']);
    const t = by(rows);
    expect(t.A).toMatchObject({ played: 2, won: 2, points: 6, for: 5, against: 1 });
    expect(t.B).toMatchObject({ played: 2, drawn: 1, lost: 1, points: 1, diff: -1 });
    expect(t.C).toMatchObject({ played: 2, drawn: 1, lost: 1, points: 1, diff: -3, extra: { walkovers: 1 } });
    expect(t.C.decidedBy).toBe('dif. de goles');
  });

  it('por defecto: diferencia, goles, y después el enfrentamiento directo', () => {
    const rows = footballStandings([], [fb('A', 1, 0, 'B'), fb('C', 1, 0, 'A'), fb('B', 1, 0, 'C'), fb('A', 2, 0, 'D'), fb('B', 2, 0, 'D')]);
    expect(order(rows)).toEqual(['A', 'B', 'C', 'D']);
    expect(by(rows).B.decidedBy).toBe('enfrentamiento directo');
    // Diferencia distinta: manda antes que el enfrentamiento directo.
    const rows2 = footballStandings([], [fb('A', 1, 0, 'B'), fb('A', 1, 2, 'C'), fb('B', 5, 0, 'C')]);
    expect(order(rows2)).toEqual(['B', 'A', 'C']);
    expect(by(rows2).A.decidedBy).toBe('dif. de goles');
  });

  it('goles a favor cuando la diferencia es igual', () => {
    const rows = footballStandings([], [fb('A', 3, 3, 'B'), fb('A', 1, 0, 'C'), fb('B', 1, 0, 'D')]);
    expect(order(rows).slice(0, 2)).toEqual(['A', 'B']);
    // Igual en todo: 4 puntos, +1, 4 goles. Empate entre ellos y juego limpio igual: comparten puesto.
    expect(rows.slice(0, 2).map((r) => r.rank)).toEqual([1, 1]);
    const rows2 = footballStandings([], [fb('A', 3, 3, 'B'), fb('A', 2, 1, 'C'), fb('B', 1, 0, 'D')]);
    expect(order(rows2).slice(0, 2)).toEqual(['A', 'B']);
    expect(by(rows2).B.decidedBy).toBe('goles a favor');
  });

  it('empate de 3 con enfrentamiento directo primero (reaplicado entre los que quedan)', () => {
    const results = [fb('A', 2, 1, 'B'), fb('B', 3, 0, 'C'), fb('C', 2, 0, 'A'), fb('A', 9, 0, 'D'), fb('B', 1, 0, 'D'), fb('C', 1, 0, 'D')];
    const rows = footballStandings([], results, { tiebreak: ['h2h', 'diff', 'for', 'fair_play', 'lot'] });
    // Entre los 3: B +2, A −1, C −1. Entre A y C, ganó C.
    expect(order(rows)).toEqual(['B', 'C', 'A', 'D']);
    expect(by(rows).C.decidedBy).toBe('dif. de goles entre ellos');
    expect(by(rows).A.decidedBy).toBe('enfrentamiento directo');
    // Con el orden por defecto manda la diferencia general (A metió 9 a D).
    expect(order(footballStandings([], results))).toEqual(['A', 'B', 'C', 'D']);
  });

  it('juego limpio FIFA y sorteo', () => {
    const circle = (cards: Record<string, [number, number]>[]) => [fb('A', 1, 0, 'B', cards[0]), fb('B', 1, 0, 'C', cards[1]), fb('C', 1, 0, 'A', cards[2])];
    // A: 1 amarilla (−1). B: roja directa (−4). C: limpio.
    const rows = footballStandings([], circle([{ cardsYellow: [1, 0], yellow: [1, 0] }, { cardsRed: [1, 0], red: [1, 0] }, {}]));
    expect(order(rows)).toEqual(['C', 'A', 'B']);
    expect(rows.map((r) => r.extra.fairPlay)).toEqual([0, -1, -4]);
    expect(by(rows).A.decidedBy).toBe('juego limpio');
    expect(by(rows).A.extra.yellow).toBe(1);
    // Amarilla + roja directa −5 y doble amarilla −3.
    const rows2 = footballStandings([], circle([{ cardsYellowRed: [1, 0] }, { cardsSecondYellow: [1, 0] }, {}]));
    expect(rows2.map((r) => [r.id, r.extra.fairPlay])).toEqual([
      ['C', 0],
      ['B', -3],
      ['A', -5],
    ]);
    // Sin tarjetas: sorteo si ya se hizo; si no, comparten puesto.
    expect(footballStandings([], circle([{}, {}, {}])).map((r) => r.rank)).toEqual([1, 1, 1]);
    const lot = footballStandings([], circle([{}, {}, {}]), { lot: ['B', 'A', 'C'] });
    expect(order(lot)).toEqual(['B', 'A', 'C']);
    expect(by(lot).C.decidedBy).toBe('sorteo');
  });

  it('los penales no cuentan, salvo que la liga dé puntos por la tanda', () => {
    const r = fb('A', 1, 1, 'B', { shootout: [4, 3] }, { winner: 1 });
    expect(by(footballStandings([], [r])).A).toMatchObject({ points: 1, drawn: 1, for: 1 });
    const t = by(footballStandings([], [r], { shootout: { win: 2, loss: 1 } }));
    expect(t.A).toMatchObject({ points: 2, drawn: 1, extra: { shootoutWins: 1 } });
    expect(t.B).toMatchObject({ points: 1, drawn: 1 });
  });

  it('con resultados del motor', () => {
    const cfg = footballConfig('futsal');
    const game = (log: FootballEvent[]) => log.reduce((s, e) => football.apply(s, e), football.init(cfg));
    const m1 = game([
      { type: 'goal', side: 1, player: '9' },
      { type: 'card', side: 2, player: '4', card: 'yellow' },
      { type: 'card', side: 2, player: '4', card: 'yellow' },
      { type: 'period_end' },
      { type: 'period_end' },
    ]);
    const m2 = game([{ type: 'goal', side: 2, ownGoal: true }, { type: 'period_end' }, { type: 'period_end' }]);
    const rows = footballStandings(['X', 'Y', 'Z'], [footballMatchResult(m1, { id: '1', side1: 'X', side2: 'Y' }), footballMatchResult(m2, { id: '2', side1: 'Y', side2: 'Z' })]);
    expect(order(rows)).toEqual(['X', 'Z', 'Y']);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(by(rows).Y.extra).toMatchObject({ yellow: 2, red: 1, fairPlay: -3 });
    expect(by(rows).Y.decidedBy).toBe('puntos');
  });
});
