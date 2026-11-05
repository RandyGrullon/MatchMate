import { useMemo } from 'react';
import { sideOf, type Match } from '../../../../lib/data/matches';
import { useLeagueCtx } from '../../../../lib/league';
import { useNames } from '../names';

/** Mi lado en el partido (por mi jugador o mis parejas). */
export function useMySide() {
  const { myPlayerId } = useLeagueCtx();
  const names = useNames();
  return useMemo(() => {
    const teamIds = names.teamsOf(myPlayerId);
    return (m: Pick<Match, 'sides'>) => (myPlayerId ? sideOf(m, { playerIds: [myPlayerId], teamIds }) : null);
  }, [myPlayerId, names]);
}
