/**
 * El detalle de un juego de boliche (gameDetail.ts, lo comparten la web y la app): el puesto, los pinos y su etiqueta,
 * los strikes, spares y abiertos, y cada juego con si cuenta, sus cuadros y su foto. Datos de mentira.
 */
import { describe, expect, it } from 'vitest';
import { scoreGame } from '../../lib/bowling';
import { IMPORTED, NO_PHOTO, type BowlingEvent, type Entry } from '../../lib/types';
import { gameDetail } from './gameDetail';

const event = (extra: Partial<BowlingEvent> = {}): BowlingEvent =>
  ({ id: 'e1', type: 'practica', name: '', date: '2026-10-06', games: 3, hcpBase: 220, hcpPercent: 0, teams: {}, playerCount: 0, ...extra }) as BowlingEvent;
const entry = (playerId: string, scores: (number | null)[], photos: (string | null)[], extra: Partial<Entry> = {}): Entry => ({
  id: `e1_${playerId}`,
  eventId: 'e1',
  playerId,
  teamId: null,
  average: 180,
  handicapOverride: null,
  scores,
  photos,
  ...extra,
});

// 201: X X 9/ X X X 9/ 7 1 X 8 1 (6 strikes, 2 spares y 2 abiertos).
const ROLLS = [10, 10, 9, 1, 10, 10, 10, 9, 1, 7, 1, 10, 8, 1];

describe('detalle de un juego', () => {
  it('práctica: el puesto, los pinos y cada juego (cuenta, falta foto, sin jugar)', () => {
    const mine = entry('p1', [201, 190, null], ['foto-1', null, null], { frames: { 0: { rolls: ROLLS } } });
    const other = entry('p2', [150, 160, 170], [NO_PHOTO, NO_PHOTO, IMPORTED]);
    const d = gameDetail(event(), [mine, other], mine);
    expect(d.placeLabel).toBe('Puesto');
    // El puesto solo cuenta lo verificado (el 201; el 190 no tiene foto): promedio 201 contra 160 del otro.
    expect(d.pos).toEqual({ pos: 1, of: 2 });
    expect(d.pinsLabel).toBe('Pinos');
    expect(d.pins).toBe(391);
    expect(scoreGame(ROLLS).score).toBe(201);
    expect(d.totals).toEqual({ strikes: 6, spares: 2, opens: 2 });
    expect(d.games.map((g) => [g.score, g.verified, !!g.frames, g.photo])).toEqual([
      [201, true, true, 'foto-1'],
      [190, false, false, null],
      [null, false, false, null],
    ]);
    // «Sin foto» e importado cuentan pero no se ven en grande.
    expect(gameDetail(event(), [mine, other], other).games.map((g) => [g.verified, g.photo])).toEqual([
      [true, null],
      [true, null],
      [true, null],
    ]);
    expect(gameDetail(event(), [other], other).totals).toBeNull();
  });

  it('torneo con handicap: «Posición» y «Total c/hcp»', () => {
    const ev = event({ type: 'torneo', hcpPercent: 80 });
    const e = entry('p1', [180, 190, 200], ['a', 'b', 'c']);
    const d = gameDetail(ev, [e], e);
    expect(d.placeLabel).toBe('Posición');
    expect(d.line.hcp).toBeGreaterThan(0);
    expect(d.pinsLabel).toBe('Total c/hcp');
    expect(d.pins).toBe(d.line.total);
    expect(gameDetail(event({ type: 'torneo' }), [e], e).pinsLabel).toBe('Pinos');
  });
});
