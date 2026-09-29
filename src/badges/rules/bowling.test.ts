import { describe, expect, it } from 'vitest';
import { ALL_PINS, scoreGame } from '../../lib/bowling';
import type { GameFrames } from '../../lib/types';
import { photoId, snapEntry, snapEvent, snapSubmission } from '../testkit';
import { bowlingActivity, bowlingGames, framesMatch, gameRef, isJudge, isSplit, longestStrikeRun, markKind, rackLeaves, SEVEN_TEN, splitConversions } from './bowling';

/** Máscara de pinos (bit 0 = pin 1). */
const pins = (...n: number[]) => n.reduce((m, p) => m | (1 << (p - 1)), 0);
/** Lo que tumbó la primera bola si quedaron parados esos pinos. */
const knockedAllBut = (...standing: number[]) => ALL_PINS & ~pins(...standing);

describe('isSplit: grafo de pinos vecinos', () => {
  it('splits clásicos', () => {
    for (const leave of [[7, 10], [4, 6], [5, 6], [7, 8], [2, 7], [3, 10], [4, 6, 7, 10], [5, 7], [8, 10], [4, 5]]) {
      expect(isSplit(pins(...leave)), leave.join('-')).toBe(true);
    }
  });

  it('no son split: con el pino 1 parado, un solo pino, grupos unidos y «dormidos»', () => {
    for (const leave of [[1, 2, 4, 10], [10], [6, 10], [2, 4, 5, 8], [3, 6, 10], [2, 8], [3, 9], [4, 7]]) {
      expect(isSplit(pins(...leave)), leave.join('-')).toBe(false);
    }
  });
});

describe('juegos contados (B1, B2, B3, BM)', () => {
  const events = [snapEvent('e1', { date: '2026-10-06', type: 'torneo' }), snapEvent('e2', { date: '2026-10-13', type: 'practica', start_time: null })];
  const nines = Array.from({ length: 10 }, () => [9, 0]).flat();

  it('marca de cada juego', () => {
    expect([markKind(photoId(1)), markKind('importado'), markKind('sin-foto'), markKind(null), markKind('otra cosa')]).toEqual(['foto', 'importado', 'sin-foto', null, null]);
  });

  it('cuentan los que tienen puntaje y marca; B2 con foto o importado; B3 si los cuadros suman', () => {
    const games = bowlingGames({
      events,
      entries: [
        snapEntry('x2', 'e2', 'p1', [150, 151], ['importado', photoId(3)]),
        snapEntry('x1', 'e1', 'p1', [90, 200, 180, 170], [photoId(1), 'sin-foto', null, 'cualquiera'], {
          frames: { '0': { rolls: nines }, '1': { rolls: nines } },
        }),
      ],
    });
    expect(games.map((g) => [g.entry_id, g.index, g.score, g.mark, g.verified, g.official, g.frames !== null])).toEqual([
      ['x1', 0, 90, 'foto', true, true, true],
      ['x1', 1, 200, 'sin-foto', false, true, false],
      ['x2', 0, 150, 'importado', true, false, false],
      ['x2', 1, 151, 'foto', true, false, false],
    ]);
    expect(gameRef(games[1])).toBe('entry:x1:1');
    expect(framesMatch({ rolls: [10, 10] }, 20)).toBe(false);
  });

  it('juez y parte: sin foto solo cuenta si otra cuenta aprobó el envío', () => {
    const entries = [snapEntry('x1', 'e1', 'p1', [201, 180], ['sin-foto', 'sin-foto'])];
    const userOf = () => 'u-admin';
    const judge = () => true;
    const approvedByOther = snapSubmission('s1', 'p1', [201], { event_id: 'e1', created_by: 'u-admin', reviewed_by: 'u-other' });
    const approvedByMe = snapSubmission('s2', 'p1', [180], { created_by: 'u-x', reviewed_by: 'u-admin' });
    const selfReview = snapSubmission('s3', 'p1', [180], { created_by: 'u-y', reviewed_by: 'u-y' });
    const games = bowlingGames({ events, entries, judge, userOf, submissions: [approvedByOther, approvedByMe, selfReview] });
    expect(games.map((g) => g.score)).toEqual([201]);
    // Si no es juez y parte, sin foto cuenta (liga sin foto obligatoria).
    expect(bowlingGames({ events, entries }).map((g) => g.score)).toEqual([201, 180]);
    expect([isJudge({ role: 'member', is_scorer: true }), isJudge({ role: 'admin', is_scorer: false }), isJudge({ role: 'member', is_scorer: false }), isJudge(null)]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('actividad: un día por jugador y fecha, oficial si hubo torneo', () => {
    const games = bowlingGames({ events, entries: [snapEntry('x1', 'e1', 'p1', [150], [photoId(1)]), snapEntry('x2', 'e2', 'p1', [150], [photoId(2)])] });
    expect(bowlingActivity(games, () => 'u1')).toEqual([
      { sport: 'bowling', league_id: 'L', player_id: 'p1', user_id: 'u1', date: '2026-10-06', official: true },
      { sport: 'bowling', league_id: 'L', player_id: 'p1', user_id: 'u1', date: '2026-10-13', official: false },
    ]);
  });
});

describe('lo que se lee de los cuadros', () => {
  it('racha más larga de strikes, con las bolas extra del cuadro 10', () => {
    const rolls = [10, 10, 10, 9, 0, 10, 10, 10, 10, 10, 10, 10, 10];
    expect(scoreGame(rolls).complete).toBe(true);
    expect(longestStrikeRun(rolls)).toBe(8);
    expect(longestStrikeRun(Array(12).fill(10))).toBe(12);
    expect(longestStrikeRun([9, 1, 9, 1])).toBe(0);
  });

  it('splits y 7-10 convertidos; una máscara que no cuadra con los pinos no cuenta', () => {
    // Cuadro 1: queda 7-10 y lo convierte. Cuadro 2: queda 4-6 y lo convierte. Cuadro 3: queda el 10 y lo falla.
    // Cuadro 4: dice 7 pinos pero la máscara deja 2 parados (no cuadra). Luego abiertos hasta el final.
    const rolls = [8, 2, 8, 2, 9, 0, 7, 3, ...Array.from({ length: 6 }, () => [9, 0]).flat()];
    const masks: (number | null)[] = rolls.map(() => null);
    masks[0] = knockedAllBut(7, 10);
    masks[2] = knockedAllBut(4, 6);
    masks[4] = knockedAllBut(10);
    masks[6] = knockedAllBut(4, 6);
    const frames: GameFrames = { rolls, masks };
    expect(rackLeaves(rolls, masks).map((r) => [r.roll, r.converted])).toEqual([
      [0, true],
      [2, true],
      [4, false],
    ]);
    const { splits, sevenTen } = splitConversions(frames);
    expect(sevenTen.map((r) => r.leave)).toEqual([SEVEN_TEN]);
    expect(splits.map((r) => r.leave)).toEqual([pins(4, 6)]);
  });

  it('en el cuadro 10, después de un strike, la bola 2 y la 3 son un rack nuevo', () => {
    const rolls = [...Array.from({ length: 9 }, () => [9, 0]).flat(), 10, 8, 2];
    const masks: (number | null)[] = rolls.map(() => null);
    masks[19] = knockedAllBut(7, 10);
    expect(splitConversions({ rolls, masks }).sevenTen).toHaveLength(1);
  });
});
