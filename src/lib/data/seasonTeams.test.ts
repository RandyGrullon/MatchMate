import { describe, expect, it } from 'vitest';
import { compareRoster, myTeamRoles, nextFreeJersey, pairName, rosterArg, teamsICanSpeakFor, toSeasonTeam } from './seasonTeams';

describe('equipos y parejas de temporada', () => {
  it('de la base a la app: plantilla ordenada (capitán, delegado, dorsal)', () => {
    const t = toSeasonTeam(
      { id: 't1', league_id: 'L', name: 'Tigres', sort_order: 2, color: '#ff8800', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-02T00:00:00Z' },
      [
        { team_id: 't1', player_id: 'p9', jersey: 9, position: null, role: 'player' },
        { team_id: 't1', player_id: 'pD', jersey: null, position: null, role: 'delegate' },
        { team_id: 't1', player_id: 'p4', jersey: 4, position: 'base', role: 'player' },
        { team_id: 't1', player_id: 'pC', jersey: 23, position: null, role: 'captain' },
        { team_id: 'otro', player_id: 'px', jersey: 1, position: null, role: 'player' },
      ],
    );
    expect(t).toMatchObject({ id: 't1', leagueId: 'L', name: 'Tigres', order: 2, color: '#ff8800', updatedAt: '2026-09-02T00:00:00Z' });
    expect(t.roster.map((r) => r.playerId)).toEqual(['pC', 'pD', 'p4', 'p9']);
    expect(compareRoster({ playerId: 'a', jersey: null, position: null, role: 'player' }, { playerId: 'b', jersey: 3, position: null, role: 'player' })).toBeGreaterThan(0);
  });

  it('mis roles y por qué equipos puedo hablar (raqueta: todas mis parejas; equipos: capitán o delegado)', () => {
    const teams = [
      { id: 'a', roster: [{ playerId: 'me', jersey: null, position: null, role: 'player' as const }] },
      { id: 'b', roster: [{ playerId: 'me', jersey: 5, position: null, role: 'captain' as const }] },
      { id: 'c', roster: [{ playerId: 'otro', jersey: 5, position: null, role: 'captain' as const }] },
    ];
    const roles = myTeamRoles(teams, 'me');
    expect([...roles]).toEqual([
      ['a', 'player'],
      ['b', 'captain'],
    ]);
    expect(teamsICanSpeakFor(roles, 'racket')).toEqual(['a', 'b']);
    expect(teamsICanSpeakFor(roles, 'team')).toEqual(['b']);
    expect(myTeamRoles(teams, null).size).toBe(0);
  });

  it('nombre de pareja, dorsal libre y argumentos', () => {
    expect(pairName([' Ana ', '', 'Luis'])).toBe('Ana / Luis');
    expect(nextFreeJersey([{ jersey: 1 }, { jersey: 2 }, { jersey: null }])).toBe(3);
    expect(nextFreeJersey(Array.from({ length: 99 }, (_, i) => ({ jersey: i + 1 })))).toBe(0);
    expect(nextFreeJersey(Array.from({ length: 100 }, (_, i) => ({ jersey: i })))).toBeNull();
    expect(rosterArg({ playerId: 'p', jersey: 7 })).toEqual({ player_id: 'p', jersey: 7, position: null });
    expect(rosterArg({ playerId: 'p', role: 'captain' })).toEqual({ player_id: 'p', jersey: null, position: null, role: 'captain' });
  });
});
