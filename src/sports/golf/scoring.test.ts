import { describe, expect, it } from 'vitest';
import { teeHoles } from './course';
import { DEMO_COURSE } from './demo';
import {
  emptyCard,
  maxScoreFor,
  nextHole,
  playOrder,
  roundValue,
  scoreRound,
  setHole,
  stablefordPoints,
  validateCard,
  type GolfCompetition,
  type GolfRound,
} from './scoring';

const holes = teeHoles(DEMO_COURSE, DEMO_COURSE.tees[0]);

/** Tarjeta a partir de golpes contra el par de cada hoyo. */
const round = (diffs: number[], playingHcp: number, pickups: number[] = []): GolfRound => ({
  holes,
  playingHcp,
  card: {
    strokes: holes.map((h, i) => (pickups.includes(i) ? null : h.par + (diffs[i] ?? 0))),
    pickedUp: holes.map((_, i) => pickups.includes(i)),
  },
});

const stroke: GolfCompetition = { format: 'stroke', basis: 'net' };
const stableford: GolfCompetition = { format: 'stableford', basis: 'net' };
const maxScore: GolfCompetition = { format: 'maxScore', basis: 'net' };

describe('Stableford por hoyo', () => {
  it('0 doble bogey o peor, 1 bogey, 2 par, 3 birdie, 4 eagle, 5 albatros', () => {
    expect(stablefordPoints(7, 4)).toBe(0);
    expect(stablefordPoints(6, 4)).toBe(0);
    expect(stablefordPoints(5, 4)).toBe(1);
    expect(stablefordPoints(4, 4)).toBe(2);
    expect(stablefordPoints(3, 4)).toBe(3);
    expect(stablefordPoints(2, 4)).toBe(4);
    expect(stablefordPoints(2, 5)).toBe(5);
  });

  it('contra el par neto: con golpes de ventaja o devolviendo (plus)', () => {
    expect(stablefordPoints(6, 5, 1)).toBe(2); // bogey bruto = par neto
    expect(stablefordPoints(7, 4, 2)).toBe(1);
    expect(stablefordPoints(4, 4, -1)).toBe(1); // par bruto con plus = bogey neto
  });
});

describe('ronda en cada formato', () => {
  it('stroke play: bruto, neto y contra el par', () => {
    const s = scoreRound(round([], 10), stroke);
    expect(s.complete).toBe(true);
    expect(s.gross).toBe(72);
    expect(s.net).toBe(62);
    expect(s.toPar).toBe(0);
    expect(s.netToPar).toBe(-10);
    expect(s.dq).toBe(false);
    expect(roundValue(s, stroke)).toBe(-10);
    expect(roundValue(s, { format: 'stroke', basis: 'gross' })).toBe(0);
  });

  it('Stableford: par neto en todos los hoyos = 36 puntos', () => {
    const s = scoreRound(round(Array(18).fill(1), 18), stableford);
    expect(s.points).toBe(36);
    expect(s.gross).toBe(90);
    expect(s.net).toBe(72);
  });

  it('Stableford bruto: sin golpes de ventaja', () => {
    const s = scoreRound(round(Array(18).fill(1), 18), { format: 'stableford', basis: 'gross' });
    expect(s.points).toBe(18);
  });

  it('recogió en stroke play: sin total y descalificado (Regla 3.3c)', () => {
    const s = scoreRound(round(Array(18).fill(1), 18, [4]), stroke);
    expect(s.dq).toBe(true);
    expect(s.gross).toBeNull();
    expect(s.net).toBeNull();
    expect(roundValue(s, stroke)).toBeNull();
  });

  it('recogió en Stableford: 0 puntos en el hoyo y sigue en competencia', () => {
    const s = scoreRound(round(Array(18).fill(1), 18, [4]), stableford);
    expect(s.dq).toBe(false);
    expect(s.points).toBe(34);
    expect(s.holes[4].points).toBe(0);
    expect(s.gross).toBeNull(); // sin total bruto
    expect(s.complete).toBe(true);
  });

  it('máximo por hoyo: recogió cuenta el tope (doble bogey neto) y lo que pase del tope no cuenta', () => {
    // Hoyo 5: par 4, SI 11, recibe 1 golpe con handicap 18 → tope 7.
    const picked = scoreRound(round(Array(18).fill(1), 18, [4]), maxScore);
    expect(picked.dq).toBe(false);
    expect(picked.holes[4].score).toBe(7);
    expect(picked.gross).toBe(92);
    expect(picked.net).toBe(74);
    const diffs = Array(18).fill(1);
    diffs[4] = 6; // 10 golpes
    const capped = scoreRound(round(diffs, 18), maxScore);
    expect(capped.holes[4].strokes).toBe(10);
    expect(capped.holes[4].score).toBe(7);
    expect(capped.gross).toBe(92);
  });

  it('otros topes: doble par, par + n y número fijo', () => {
    expect(maxScoreFor({ kind: 'netDoubleBogey' }, 4, 2)).toBe(8);
    expect(maxScoreFor({ kind: 'netDoubleBogey' }, 4, -1)).toBe(5);
    expect(maxScoreFor({ kind: 'doublePar' }, 4, 1)).toBe(8);
    expect(maxScoreFor({ kind: 'parPlus', n: 3 }, 5, 1)).toBe(8);
    expect(maxScoreFor({ kind: 'fixed', value: 9 }, 3, 0)).toBe(9);
    const s = scoreRound(round([], 0, [0]), { format: 'maxScore', basis: 'gross', maxScore: { kind: 'fixed', value: 9 } });
    expect(s.gross).toBe(72 - 4 + 9);
  });

  it('ronda a medias: cuenta solo los hoyos jugados', () => {
    const r = round([], 18);
    r.card.strokes = r.card.strokes.map((s, i) => (i < 3 ? s! + 1 : null));
    const s = scoreRound(r, stroke);
    expect(s.thru).toBe(3);
    expect(s.complete).toBe(false);
    expect(s.gross).toBe(4 + 4 + 3 + 3);
    expect(s.par).toBe(11);
    expect(s.toPar).toBe(3);
    expect(s.netToPar).toBe(0); // recibe 1 golpe en cada hoyo
  });

  it('ronda sin empezar: sin total', () => {
    const s = scoreRound({ holes, playingHcp: 5, card: emptyCard(18) }, stroke);
    expect(s.thru).toBe(0);
    expect(s.gross).toBeNull();
    expect(roundValue(s, stableford)).toBeNull();
  });

  it('handicap plus: el neto queda por encima del bruto', () => {
    const s = scoreRound(round([], -2), stroke);
    expect(s.net).toBe(74);
    expect(s.holes.filter((h) => h.received === -1).map((h) => h.si).sort()).toEqual([17, 18]);
  });

  it('suma los putts anotados', () => {
    const r = round([], 0);
    r.card.putts = holes.map((_, i) => (i < 2 ? 2 : null));
    expect(scoreRound(r, stroke).putts).toBe(4);
    expect(scoreRound(round([], 0), stroke).putts).toBeNull();
  });
});

describe('tarjeta', () => {
  it('valida golpes 1–20, putts y «recogió» sin golpes', () => {
    const card = emptyCard(18);
    expect(validateCard(card, 18)).toEqual([]);
    card.strokes[0] = 0;
    card.strokes[1] = 21;
    card.strokes[2] = 4;
    card.putts![2] = 4;
    card.pickedUp![3] = true;
    card.strokes[3] = 5;
    const errs = validateCard(card, 18);
    expect(errs).toContain('Hoyo 1: los golpes van de 1 a 20.');
    expect(errs).toContain('Hoyo 2: los golpes van de 1 a 20.');
    expect(errs).toContain('Hoyo 3: no puede tener tantos putts como golpes.');
    expect(errs).toContain('Hoyo 4: si recogió, no lleva golpes.');
    expect(validateCard(emptyCard(9), 18)).toContain('La tarjeta debe tener 18 hoyos.');
  });

  it('setHole: recoger borra los golpes y anotar golpes quita «recogió»', () => {
    let card = setHole(emptyCard(18), 0, { strokes: 5, putts: 2 });
    card = setHole(card, 0, { pickedUp: true });
    expect(card.strokes[0]).toBeNull();
    expect(card.putts![0]).toBeNull();
    expect(card.pickedUp![0]).toBe(true);
    card = setHole(card, 0, { strokes: 6 });
    expect(card.pickedUp![0]).toBe(false);
    expect(card.strokes[0]).toBe(6);
  });

  it('salida simultánea: el orden de juego empieza en el hoyo asignado', () => {
    expect(playOrder(18, 9).slice(0, 10)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 0]);
    let card = emptyCard(18);
    expect(nextHole(card, 9)).toBe(9);
    for (let i = 9; i < 18; i++) card = setHole(card, i, { strokes: 4 });
    expect(nextHole(card, 9)).toBe(0);
    card = setHole(card, 0, { pickedUp: true });
    expect(nextHole(card, 9)).toBe(1);
    for (let i = 1; i < 9; i++) card = setHole(card, i, { strokes: 4 });
    expect(nextHole(card, 9)).toBeNull();
  });
});
