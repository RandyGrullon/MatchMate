import { describe, expect, it } from 'vitest';
import type { MatchRsvp } from '../../../lib/data/teamSports';
import { presentEntries, presentStart, reinforcementCandidates, togglePresent } from './presentes';

const rsvp = (playerId: string, side: 1 | 2, status: MatchRsvp['status'] = 'yes'): MatchRsvp => ({ matchId: 'm1', playerId, side, status, setBy: null, at: null });

describe('presentes de la mesa', () => {
  it('arranca con lo que tiene la mesa o con los que dijeron «Voy»', () => {
    expect(presentStart([['a'], []], [rsvp('b', 1), rsvp('c', 2), rsvp('d', 2, 'maybe')], 'm1')).toEqual([['a'], ['c']]);
  });

  it('marcar, refuerzos y lo que se guarda', () => {
    const picked = togglePresent([['a'], []], 0, 'r');
    expect(picked).toEqual([['a', 'r'], []]);
    expect(togglePresent(picked, 0, 'a')).toEqual([['r'], []]);
    const rosters = [[{ playerId: 'a', jersey: 7 }], [{ playerId: 'b', jersey: null }]] as const;
    const players = [
      { id: 'z', name: 'Jugador Zeta' },
      { id: 'r', name: 'Jugador Refuerzo' },
      { id: 'y', name: 'Jugador Ye' },
      { id: 'a', name: 'Jugador Uno' },
    ];
    expect(reinforcementCandidates(players, picked, rosters).map((p) => p.id)).toEqual(['y', 'z']);
    expect(presentEntries(picked, rosters)).toEqual([
      [
        1,
        [
          { playerId: 'a', jersey: 7, sub: false },
          { playerId: 'r', jersey: null, sub: true },
        ],
      ],
      [2, []],
    ]);
  });
});
