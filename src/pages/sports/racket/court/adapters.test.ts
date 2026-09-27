import { describe, expect, it } from 'vitest';
import { replay, type Side } from '../../../../sports/types';
import type { PointsEvent } from '../../../../sports/formats';
import type { RacketEvent } from '../../../../sports/racket';
import { engineRules, pointsAdapter, racketAdapter, walkoverScore } from './adapters';

const P = (side: Side): RacketEvent => ({ type: 'point', side });

describe('partido a sets en la cancha', () => {
  it('reglas del partido (o de la liga); si no sirven, las de por defecto', () => {
    expect(engineRules('padel', { match: { deuce: 'star' } })).toMatchObject({ sport: 'padel', deuce: 'star', doubles: true });
    expect(engineRules('padel', { match: { deuce: 'noad', bestOf: 7 } })).toMatchObject({ deuce: 'golden', bestOf: 3 });
    expect(engineRules('tennis', null)).toMatchObject({ sport: 'tennis', deuce: 'ad' });
  });

  it('pádel: marcador con sets, totales y foto en vivo; publica al terminar cada juego', () => {
    const a = racketAdapter('padel', { match: { sport: 'padel' } });
    const s3 = replay(a.engine, {}, [P(1), P(1), P(1)]);
    const s4 = a.engine.apply(s3, P(1));
    expect(a.milestone!(s3, a.engine.apply(s3, P(2)), P(2))).toBe(false);
    expect(a.milestone!(s3, s4, P(1))).toBe(true);
    expect(a.score(s4)).toMatchObject({ text: '1-0', sides: [0, 0], totals: { sets: [0, 0], games: [1, 0], points: [4, 0] }, live: { now: [1, 0] } });
  });

  it('W.O. con el motor: 6-0 6-0 al que vino', () => {
    expect(walkoverScore('padel', {}, 1)).toMatchObject({ text: '0-6 0-6', sides: [0, 2], totals: { sets: [0, 2], games: [0, 12] } });
    expect(walkoverScore('pickleball', { match: { sport: 'pickleball' } }, 2)).toMatchObject({ text: '11-0', sides: [1, 0] });
  });
});

describe('partido a puntos (americano)', () => {
  it('suma hasta el total; publica cuando cambia el saque y al terminar', () => {
    const a = pointsAdapter();
    const cfg = { mode: 'total' as const, target: 8, serveEvery: 4 };
    const pts = (seq: string): PointsEvent[] => [...seq].map((c) => ({ type: 'point', side: Number(c) as Side }));
    const s3 = replay(a.engine, cfg, pts('121'));
    const s4 = a.engine.apply(s3, { type: 'point', side: 2 });
    expect(a.milestone!(replay(a.engine, cfg, pts('12')), s3, { type: 'point', side: 1 })).toBe(false);
    expect(a.milestone!(s3, s4, { type: 'point', side: 2 })).toBe(true);
    const end = replay(a.engine, cfg, pts('12121111'));
    expect(a.engine.isOver(end)).toBe(true);
    expect(a.score(end)).toEqual({ text: '6-2', sides: [6, 2] });
    expect(a.engine.result(replay(a.engine, cfg, pts('12121212'))).winner).toBeNull();
  });
});
