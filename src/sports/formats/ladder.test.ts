import { describe, expect, it } from 'vitest';
import {
  acceptChallenge,
  addToLadder,
  applyLadderResult,
  challengeError,
  challengeTargets,
  createChallenge,
  expireChallenges,
  playChallenge,
  type Challenge,
} from './ladder';

const ladder = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const now = '2026-10-01T20:00:00.000Z';

describe('escalera', () => {
  it('se puede retar hasta 3 puestos arriba', () => {
    expect(challengeTargets(ladder, 'p5')).toEqual(['p2', 'p3', 'p4']);
    expect(challengeTargets(ladder, 'p2')).toEqual(['p1']);
    expect(challengeTargets(ladder, 'p1')).toEqual([]);
    expect(challengeTargets(ladder, 'p6', 5)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(challengeError(ladder, 'p5', 'p1')).toBe('Solo puedes retar hasta 3 puestos más arriba.');
    expect(challengeError(ladder, 'p3', 'p4')).toBe('Solo puedes retar a alguien que esté más arriba.');
    expect(challengeError(ladder, 'p3', 'x')).toBe('Los dos tienen que estar en la escalera.');
    expect(challengeError(ladder, 'p5', 'p2')).toBeNull();
  });

  it('si gana el retador toma el puesto y el retado (y los del medio) bajan uno', () => {
    expect(applyLadderResult(ladder, 'p5', 'p2')).toEqual(['p1', 'p5', 'p2', 'p3', 'p4', 'p6']);
    expect(applyLadderResult(ladder, 'p2', 'p1')).toEqual(['p2', 'p1', 'p3', 'p4', 'p5', 'p6']);
  });

  it('si pierde el retador no cambia nada', () => {
    const c = createChallenge(ladder, { id: 'c1', challenger: 'p4', challenged: 'p3', now });
    const res = playChallenge(ladder, c, 'p3');
    expect(res.ladder).toEqual(ladder);
    expect(res.challenge).toMatchObject({ status: 'played', winner: 'p3' });
  });

  it('se usan los puestos del momento en que se juega', () => {
    const c = createChallenge(ladder, { id: 'c1', challenger: 'p5', challenged: 'p3', now });
    // Mientras tanto p5 subió por otro reto y ya está arriba de p3: ganar no lo mueve.
    const moved = applyLadderResult(ladder, 'p5', 'p2');
    expect(playChallenge(moved, c, 'p5').ladder).toEqual(moved);
    // Y si pierde estando arriba, el retado toma su puesto.
    expect(playChallenge(moved, c, 'p3').ladder).toEqual(['p1', 'p3', 'p5', 'p2', 'p4', 'p6']);
  });

  it('plazos: crear, aceptar y un reto a la vez', () => {
    const c = createChallenge(ladder, { id: 'c1', challenger: 'p4', challenged: 'p2', now });
    expect(c).toMatchObject({ status: 'pending', acceptBy: '2026-10-04T20:00:00.000Z', playBy: '2026-10-08T20:00:00.000Z' });
    const custom = createChallenge(ladder, { id: 'c2', challenger: 'p4', challenged: 'p2', now }, [], { acceptDays: 1, playDays: 2 });
    expect(custom.playBy).toBe('2026-10-03T20:00:00.000Z');
    expect(() => createChallenge(ladder, { id: 'c3', challenger: 'p3', challenged: 'p2', now }, [c])).toThrow('Uno de los dos ya tiene un reto pendiente.');
    const a = acceptChallenge(c, '2026-10-02T10:00:00.000Z');
    expect(a.status).toBe('accepted');
    expect(() => acceptChallenge(c, '2026-10-05T10:00:00.000Z')).toThrow('Se venció el plazo para aceptar.');
    expect(() => acceptChallenge(a, '2026-10-02T11:00:00.000Z')).toThrow('Ese reto ya no está pendiente.');
  });

  it('vencido el plazo, W.O. para el retador (en orden de vencimiento)', () => {
    const pending = createChallenge(ladder, { id: 'c1', challenger: 'p4', challenged: 'p2', now });
    const accepted = acceptChallenge(createChallenge(ladder, { id: 'c2', challenger: 'p6', challenged: 'p5', now }), '2026-10-02T00:00:00.000Z');
    const early = expireChallenges(ladder, [pending, accepted], '2026-10-03T00:00:00.000Z');
    expect(early.ladder).toEqual(ladder);
    expect(early.challenges.map((c) => c.status)).toEqual(['pending', 'accepted']);

    const late = expireChallenges(ladder, [pending, accepted], '2026-10-05T00:00:00.000Z');
    // Solo venció aceptar (c1): p4 sube al puesto de p2.
    expect(late.ladder).toEqual(['p1', 'p4', 'p2', 'p3', 'p5', 'p6']);
    expect(late.challenges.map((c) => [c.status, c.winner])).toEqual([
      ['walkover', 'p4'],
      ['accepted', undefined],
    ]);

    const later = expireChallenges(late.ladder, late.challenges, '2026-10-09T00:00:00.000Z');
    expect(later.ladder).toEqual(['p1', 'p4', 'p2', 'p3', 'p6', 'p5']);
    expect(later.challenges[1]).toMatchObject({ status: 'walkover', winner: 'p6' });
  });

  it('un reto cerrado no se vuelve a jugar; los nuevos entran abajo', () => {
    const c: Challenge = { ...createChallenge(ladder, { id: 'c1', challenger: 'p2', challenged: 'p1', now }), status: 'played', winner: 'p2' };
    expect(() => playChallenge(ladder, c, 'p2')).toThrow('Ese reto ya se cerró.');
    expect(addToLadder(ladder, 'p7')).toEqual([...ladder, 'p7']);
    expect(addToLadder(ladder, 'p3')).toEqual(ladder);
  });
});
