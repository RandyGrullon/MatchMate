import { describe, expect, it } from 'vitest';
import { evaluate } from '../engine';
import type { BadgeSnapshot, SnapLadderChallenge, SnapLadderRung } from '../snapshot';
import { snapEvent } from '../testkit';
import { gives, job, NOW, of, player, snap, world } from './fixtures';
import { boxPhoto } from './boxes';
import { day, merge, racketMatch, type Parts } from './sportFixtures';

const R = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'];
const PLAYERS = R.map((p) => player(p, 'L', `u-${p}`));
const userOf = (p: string) => `u-${p}`;

describe('box_month: cima de la caja y subir de caja', () => {
  const boxes = [
    ['r1', 'r2', 'r3', 'r4'],
    ['r5', 'r6', 'r7', 'r8'],
  ];
  // Todos contra todos en cada caja: gana el de menor número.
  const matches: Parts[] = [];
  boxes.forEach((box, b) => {
    for (let i = 0; i < box.length; i++)
      for (let j = i + 1; j < box.length; j++) {
        matches.push(racketMatch(`b${b}-${i}${j}`, day(10, 2 + i * 4 + j), [box[i]], [box[j]], '6-3 6-3', userOf, { event_id: 'BOX', round: 1, stage: `Caja ${b + 1}` }));
      }
  });
  const data = merge({ events: [snapEvent('BOX', { type: 'cajas', date: '2026-10-01' })] }, ...matches);
  const moves = [
    { id: 'r1', from: 0, to: 0, move: 'queda' },
    { id: 'r2', from: 0, to: 0, move: 'queda' },
    { id: 'r3', from: 0, to: 1, move: 'baja' },
    { id: 'r4', from: 0, to: 1, move: 'baja' },
    { id: 'r5', from: 1, to: 0, move: 'sube' },
    { id: 'r6', from: 1, to: 0, move: 'sube' },
    { id: 'r7', from: 1, to: 1, move: 'queda' },
    { id: 'r8', from: 1, to: 1, move: 'queda' },
  ];
  const payload = (m = moves) => ({
    month: { n: 1, label: 'Octubre 2026', start: '2026-10-01', end: '2026-10-31', boxes, moves: m, closed: true },
    rules: { min: 4, max: 6, up: 2, down: 2, minToPromote: 2, minToStay: 2 },
    points: 'standard',
  });
  const runBox = (p = payload(), over: Partial<BadgeSnapshot> = {}) => {
    const j = job('cajas', { ref: 'box:BOX:1', payload: p });
    return evaluate(j, snap(j, world('tennis', { players: PLAYERS, ...data, ...over })), NOW);
  };

  it('lee la foto del mes que guarda el trabajo', () => {
    expect(boxPhoto('box:BOX:1', payload())).toMatchObject({ eventId: 'BOX', n: 1, end: '2026-10-31', boxes, rules: { up: 2, minToPromote: 2 } });
    expect(boxPhoto('event:BOX', payload())).toBeNull();
  });

  it('el primero de cada caja (3+ con 2+ partidos) y los que suben según la foto y el servidor', () => {
    const ds = runBox();
    expect(gives(ds)).toEqual(['box_promoted:0:b:BOX:1@r5', 'box_promoted:0:b:BOX:1@r6', 'box_top_month:0:b:BOX:1@r1', 'box_top_month:0:b:BOX:1@r5']);
    expect(of(ds, 'box_top_month').find((d) => d.player_id === 'r5')).toMatchObject({ status: 'firme', context: { event: { id: 'BOX' }, values: { caja: 2, n: 3 } } });
    expect(of(ds, 'box_promoted')[0].context.values).toEqual({ caja: 1 });
  });

  it('si el teléfono dice que subió pero el servidor no, no se da', () => {
    const lie = moves.map((m) => (m.id === 'r7' ? { ...m, to: 0, move: 'sube' } : m));
    expect(of(runBox(payload(lie)), 'box_promoted').map((d) => d.player_id)).toEqual(['r5', 'r6']);
  });
});

describe('ladder_month: número 1 de la escalera', () => {
  const rungs: SnapLadderRung[] = R.map((p, i) => ({ event_id: 'LAD', league_id: 'L', entrant_id: p, player_id: p, team_id: null, position: i + 1 }));
  const m = racketMatch('lc', day(10, 12), ['r1'], ['r2'], '6-4 6-4', userOf, { event_id: 'LAD' });
  const challenge: SnapLadderChallenge = { id: 'c1', league_id: 'L', event_id: 'LAD', challenger: 'r1', challenged: 'r2', match_id: 'lc', status: 'played', winner: 'r1', resolved_at: '2026-10-13T12:00:00.000Z' };
  const fill = merge(...['r3', 'r5', 'r7'].map((p, i) => racketMatch(`f${i}`, day(10, 20 + i), [p], [R[R.indexOf(p) + 1]], '6-1 6-1', userOf)));
  const runLadder = (r: SnapLadderRung[] = rungs, c: SnapLadderChallenge[] = [challenge]) => {
    const j = job('escalera', { ref: 'ladder:LAD:2026-10', payload: { rungs: r } });
    return evaluate(j, snap(j, world('tennis', { players: PLAYERS, events: [snapEvent('LAD', { type: 'escalera', date: '2026-01-10' })], ladder_challenges: c, ...merge(m, fill) })), NOW);
  };

  it('en el puesto 1 de la foto del día 1, después de ganarlo como retador en el mes', () => {
    const ds = runLadder();
    expect(gives(ds)).toEqual(['ladder_top:0:2026-10@r1']);
    expect(of(ds, 'ladder_top')[0].context.values).toEqual({ peldanos: 8, retos: 1 });
  });

  it('sin reto jugado en el mes (el admin lo puso primero) o con menos de 8 peldaños, nada', () => {
    expect(runLadder(rungs, [])).toEqual([]);
    expect(runLadder(rungs.slice(0, 7))).toEqual([]);
    expect(runLadder(rungs, [{ ...challenge, resolved_at: '2026-09-28T12:00:00.000Z' }])).toEqual([]);
  });
});

describe('box_month en los deportes a juegos: la cima desempata por dif. de juegos', () => {
  // Ciclo r1 > r2 > r3 > r1 y los tres le ganan a r4: los tres con 2 victorias. Dif. de juegos: r1 +5, r2 +1, r3 +1;
  // dif. de puntos: r3 +11 (le pasó por encima a r4), r1 +10, r2 +2. Manda la de juegos.
  const box = ['r1', 'r2', 'r3', 'r4'];
  const results: [string, string, string][] = [
    ['r1', 'r2', '11-9 11-9 11-9'],
    ['r2', 'r3', '11-9 9-11 11-9 9-11 11-9'],
    ['r3', 'r1', '11-9 9-11 11-9 9-11 11-9'],
    ['r1', 'r4', '11-9 11-9 11-9'],
    ['r2', 'r4', '11-9 11-9 11-9'],
    ['r3', 'r4', '11-0 0-11 11-0 0-11 11-0'],
  ];
  const pick3 = { match: { bestOf: 5 } };
  const payload = {
    month: { n: 1, label: 'Octubre 2026', start: '2026-10-01', end: '2026-10-31', boxes: [box], moves: [], closed: true },
    rules: { min: 4, max: 6, up: 2, down: 2, minToPromote: 2, minToStay: 2 },
    points: 'standard',
  };
  const runBox = (sport: 'table_tennis' | 'pickleball', rules: Record<string, unknown>, rows: [string, string, string][]) => {
    const ms = rows.map(([a, b, text], i) =>
      racketMatch(`t${i}`, day(10, 2 + i), [a], [b], text, userOf, { event_id: 'BOX', round: 1, stage: 'Caja 1', rules }),
    );
    const data = merge({ events: [snapEvent('BOX', { type: 'cajas', date: '2026-10-01' })] }, ...ms);
    const j = job('cajas', { ref: 'box:BOX:1', payload });
    return evaluate(j, snap(j, world(sport, { players: PLAYERS, ...data })), NOW);
  };

  it('ping pong: gana la caja el de mejor dif. de juegos, aunque otro tenga mejor dif. de puntos', () => {
    expect(of(runBox('table_tennis', pick3, results), 'box_top_month').map((d) => d.player_id)).toEqual(['r1']);
  });

  it('pickleball: igual (antes leía una dif. de sets que sus filas no tienen y daba empate)', () => {
    const pb = { match: { bestOf: 3, gameTo: 11 } };
    const rows: [string, string, string][] = [
      ['r1', 'r2', '11-5 11-5'],
      ['r2', 'r3', '11-9 9-11 11-9'],
      ['r3', 'r1', '11-9 9-11 11-9'],
      ['r1', 'r4', '11-2 11-2'],
      ['r2', 'r4', '11-2 11-2'],
      ['r3', 'r4', '11-2 11-2'],
    ];
    expect(of(runBox('pickleball', pb, rows), 'box_top_month').map((d) => d.player_id)).toEqual(['r1']);
  });
});
