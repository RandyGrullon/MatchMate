import { describe, expect, it } from 'vitest';
import { DEMO_COURSE } from '../../sports/golf/demo';
import { snapCard, snapRound } from '../testkit';
import { cardHoles, golfActivity, grossOf, hasMarker, isG1, isG2, isNineHoles, markersOf, saneField } from './golf';

const USERS: Record<string, string | null> = { p1: 'u1', p2: 'u2', p3: null, p4: 'u1' };
const userOf = (p: string) => USERS[p] ?? null;
const round = snapRound('r1');
const pars = () => DEMO_COURSE.holes.map((h) => h.par) as (number | null)[];

describe('G1 y G2 (§1.7.5)', () => {
  it('G1: firmada, sin DQ, ronda cerrada y todos los hoyos con golpes o bola levantada', () => {
    expect(isG1(snapCard('c1', 'r1', 'p1'), round)).toBe(true);
    const picked = pars();
    picked[4] = null;
    expect(isG1(snapCard('c1', 'r1', 'p1', picked, { picked_up: picked.map((s) => s === null) }), round)).toBe(true);
    expect(isG1(snapCard('c1', 'r1', 'p1', picked), round)).toBe(false);
    expect(isG1(snapCard('c1', 'r1', 'p1', undefined, { status: 'abierta' }), round)).toBe(false);
    expect(isG1(snapCard('c1', 'r1', 'p1', undefined, { dq: true }), round)).toBe(false);
    expect(isG1(snapCard('c1', 'r1', 'p1'), snapRound('r1', { status: 'abierta' }))).toBe(false);
    expect(isG1(snapCard('c1', 'r1', 'p1', undefined, { tee_id: 'no-existe' }), round)).toBe(false);
  });

  it('campo sano: pares de 3 a 5, par total, rating y slope razonables', () => {
    expect(saneField(round, 'azul')).toBe(true);
    expect(saneField(round, 'roja')).toBe(true);
    const par6 = { ...DEMO_COURSE, holes: DEMO_COURSE.holes.map((h, i) => (i === 0 ? { ...h, par: 6 } : h)) };
    expect(saneField(snapRound('r1', { course: par6 }), 'azul')).toBe(false);
    const steep = { ...DEMO_COURSE, tees: DEMO_COURSE.tees.map((t) => ({ ...t, rating: 90 })) };
    expect(saneField(snapRound('r1', { course: steep }), 'azul')).toBe(false);
    // Ida de 9 hoyos: par 36, rating 35,8.
    const front = snapRound('r1', { nine: 'front', holes: 9 });
    expect(saneField(front, 'azul')).toBe(true);
    expect(cardHoles(snapCard('c', 'r1', 'p'), front)).toHaveLength(9);
    expect(isNineHoles(snapCard('c', 'r1', 'p'), front)).toBe(true);
  });

  it('marcador: otra tarjeta G1 del mismo grupo, de otra cuenta', () => {
    const mine = snapCard('c1', 'r1', 'p1');
    const cards = [mine, snapCard('c2', 'r1', 'p2'), snapCard('c3', 'r1', 'p3'), snapCard('c4', 'r1', 'p4'), snapCard('c5', 'r1', 'p2', undefined, { group_no: 2 })];
    expect(hasMarker(mine, cards, round, userOf)).toBe(true);
    expect(markersOf(mine, cards, round, userOf)).toEqual(['u2']);
    // Solo con el sin cuenta y con otra tarjeta de la misma cuenta: no hay marcador.
    expect(hasMarker(mine, [mine, cards[2], cards[3]], round, userOf)).toBe(false);
    // El marcador que no firmó no vale.
    expect(hasMarker(mine, [mine, snapCard('c2', 'r1', 'p2', undefined, { status: 'abierta' })], round, userOf)).toBe(false);
    expect(hasMarker({ ...mine, group_no: null }, cards, round, userOf)).toBe(false);
    expect(isG2(mine, round, cards, userOf)).toBe(true);
    expect(isG2(mine, round, [mine], userOf)).toBe(false);
  });

  it('bruto sin hoyos levantados', () => {
    const holes = cardHoles(snapCard('c', 'r1', 'p'), round)!;
    expect(grossOf(snapCard('c', 'r1', 'p'), holes)).toBe(72);
    const picked = pars();
    picked[0] = null;
    expect(grossOf(snapCard('c', 'r1', 'p', picked, { picked_up: picked.map((s) => s === null) }), holes)).toBeNull();
  });
});

describe('actividad de golf', () => {
  it('una tarjeta G1 da el día; oficial con 3 o más tarjetas en la ronda', () => {
    const rounds = [snapRound('r1'), snapRound('r2')];
    const cards = [snapCard('a', 'r1', 'p1'), snapCard('b', 'r1', 'p2'), snapCard('c', 'r1', 'p3'), snapCard('d', 'r2', 'p1'), snapCard('e', 'r2', 'p2'), snapCard('f', 'r2', 'p3', undefined, { dq: true })];
    const dates: Record<string, string> = { r1: '2026-10-03', r2: '2026-10-10' };
    const acts = golfActivity(cards, rounds, { userOf, dateOf: (e) => dates[e] ?? null });
    expect(acts.map((a) => [a.player_id, a.date, a.official])).toEqual([
      ['p1', '2026-10-03', true],
      ['p2', '2026-10-03', true],
      ['p3', '2026-10-03', true],
      ['p1', '2026-10-10', false],
      ['p2', '2026-10-10', false],
    ]);
  });
});
