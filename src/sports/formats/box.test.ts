import { describe, expect, it } from 'vitest';
import type { MatchResult, StandingRow } from '../types';
import { boxSizes, closeBoxMonth, makeBoxes } from './box';
import { roundRobin } from './roundRobin';
import { racketMatchResult, racketStandings } from './standings';

const row = (id: string, played = 4): StandingRow => ({ id, played, won: 0, drawn: 0, lost: 0, points: 0, for: 0, against: 0, diff: 0, extra: {}, rank: 0 });
const box = (p: string) => [1, 2, 3, 4, 5].map((i) => `${p}${i}`);
const boxes = [box('a'), box('b'), box('c')];
const tables = (played: Record<string, number> = {}) => boxes.map((b) => b.map((id) => row(id, played[id] ?? 4)));

describe('tamaños de caja', () => {
  it('lo más parejo, de 4 a 6, las de arriba con uno más', () => {
    expect(boxSizes(13)).toEqual([5, 4, 4]);
    expect(boxSizes(12)).toEqual([6, 6]);
    expect(boxSizes(12, { target: 4 })).toEqual([4, 4, 4]);
    expect(boxSizes(19)).toEqual([5, 5, 5, 4]);
    expect(boxSizes(18)).toEqual([6, 6, 6]);
    expect(boxSizes(5)).toEqual([5]);
    expect(boxSizes(0)).toEqual([]);
  });

  it('arma las cajas por nivel', () => {
    expect(makeBoxes(['1', '2', '3', '4', '5', '6', '7', '8', '9'], { target: 4 })).toEqual([
      ['1', '2', '3', '4', '5'],
      ['6', '7', '8', '9'],
    ]);
  });
});

describe('cierre del mes', () => {
  it('suben 2 y bajan 2; la de arriba no sube y la de abajo no baja', () => {
    const { boxes: next, moves } = closeBoxMonth(boxes, tables());
    expect(next).toEqual([
      ['a1', 'a2', 'a3', 'b1', 'b2'],
      ['b3', 'a4', 'a5', 'c1', 'c2'],
      ['c3', 'c4', 'c5', 'b4', 'b5'],
    ]);
    const m = Object.fromEntries(moves.map((x) => [x.id, x.move]));
    expect([m.a1, m.a4, m.b1, m.b3, m.b5, m.c1, m.c5]).toEqual(['queda', 'baja', 'sube', 'queda', 'baja', 'sube', 'queda']);
  });

  it('mínimo de partidos: el 1.º con 1 partido no sube, baja; y sube el siguiente que sí jugó', () => {
    const { boxes: next, moves } = closeBoxMonth(boxes, tables({ b1: 1 }));
    // Caja b: bajan b1 (pocos partidos), b4 y b5; suben b2 y b3. La caja del medio queda corta y sube c3.
    expect(next).toEqual([
      ['a1', 'a2', 'a3', 'b2', 'b3'],
      ['a4', 'a5', 'c1', 'c2', 'c3'],
      ['c4', 'c5', 'b1', 'b4', 'b5'],
    ]);
    expect(moves.find((x) => x.id === 'b1')).toEqual({ id: 'b1', from: 1, to: 2, move: 'baja', reason: 'pocos-partidos' });
    expect(moves.find((x) => x.id === 'c3')!.move).toBe('sube');
  });

  it('para subir hace falta el mínimo: con 1 partido se salta al siguiente', () => {
    const { boxes: next } = closeBoxMonth(boxes, tables({ c1: 1 }), { minToPromote: 2, minToStay: 0 });
    // c1 no puede subir (y en la última caja nadie baja): suben c2 y c3.
    expect(next[1]).toEqual(['b3', 'a4', 'a5', 'c2', 'c3']);
    expect(next[2]).toContain('c1');
  });

  it('configurable: sube 1 y baja 1', () => {
    const { boxes: next } = closeBoxMonth(boxes, tables(), { up: 1, down: 1 });
    expect(next[0]).toEqual(['a1', 'a2', 'a3', 'a4', 'b1']);
    expect(next[2]).toEqual(['c2', 'c3', 'c4', 'c5', 'b5']);
  });

  it('bajas y nuevos: los nuevos entran abajo y se recalculan los tamaños', () => {
    const { boxes: next, moves } = closeBoxMonth(boxes, tables(), { withdrawn: ['a2'], newcomers: ['n1'] });
    expect(next.map((b) => b.length)).toEqual([5, 5, 5]);
    expect(next.flat()).not.toContain('a2');
    expect(next[2]).toContain('n1');
    expect(moves.find((x) => x.id === 'n1')).toEqual({ id: 'n1', from: null, to: 2, move: 'nuevo' });

    const fewer = closeBoxMonth(boxes, tables(), { withdrawn: ['a2', 'b2', 'c2'] });
    expect(fewer.boxes.map((b) => b.length)).toEqual([6, 6]);
  });

  it('con tablas de verdad (pádel): cierra con racketStandings', () => {
    const players = box('p');
    const results: MatchResult[] = roundRobin(players).flatMap((r, i) =>
      r.matches.map((f, k) =>
        // Gana siempre el de número menor.
        racketMatchResult({ id: `${i}-${k}`, side1: f.home, side2: f.away, sets: [[6, 3], [6, 3]].map((s) => (f.home < f.away ? s : [s[1], s[0]])) as [number, number][], winner: f.home < f.away ? 1 : 2 }),
      ),
    );
    const t = racketStandings(players, results);
    expect(t.map((x) => x.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    const upper = box('u');
    const { boxes: next } = closeBoxMonth([upper, players], [upper.map((id) => row(id)), t]);
    expect(next[0]).toEqual(['u1', 'u2', 'u3', 'p1', 'p2']);
    expect(next[1]).toEqual(['p3', 'p4', 'p5', 'u4', 'u5']);
  });
});
