import { describe, expect, it } from 'vitest';
import { replay } from '../types';
import { basketball, basketballConfig, basketballLines } from './basketball';
import { football, footballConfig, footballLines } from './football';
import { basketballTotals, footballTotals } from './stats';

describe('estadísticas de la temporada', () => {
  it('anotadores de baloncesto con partidos jugados según los presentes', () => {
    const g1 = replay(basketball, basketballConfig('fiba'), [
      { type: 'present', side: 1, players: ['a', 'b'] },
      { type: 'score', side: 1, points: 3, player: 'a' },
      { type: 'score', side: 1, points: 1, player: 'a' },
    ]);
    const g2 = replay(basketball, basketballConfig('fiba'), [
      { type: 'present', side: 2, players: ['a'] },
      { type: 'score', side: 2, points: 2, player: 'a' },
      { type: 'foul', side: 2, kind: 'personal', player: 'a' },
    ]);
    const t = basketballTotals([...basketballLines(g1, ['T1', 'T2']), ...basketballLines(g2, ['T3', 'T1'])]);
    expect(t[0]).toEqual({ player: 'a', team: 'T1', games: 2, points: 6, avg: 3, high: 4, threes: 1, ftm: 1, fouls: 1 });
    expect(t[1]).toMatchObject({ player: 'b', games: 1, points: 0 });
  });

  it('goleadores y vallas invictas', () => {
    const g = replay(football, footballConfig('football'), [
      { type: 'lineup', side: 1, players: ['gk', 'x'], goalkeeper: 'gk' },
      { type: 'goal', side: 1, player: 'x', assist: 'gk' },
      { type: 'period_end' },
      { type: 'period_end' },
    ]);
    const t = footballTotals(footballLines(g, ['A', 'B']));
    expect(t[0]).toMatchObject({ player: 'x', goals: 1, games: 1 });
    expect(t[1]).toMatchObject({ player: 'gk', assists: 1, keeperGames: 1, cleanSheets: 1, conceded: 0 });
  });
});
