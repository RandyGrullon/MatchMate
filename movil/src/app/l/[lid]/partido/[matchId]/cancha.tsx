import { router, useLocalSearchParams } from 'expo-router';
import { useLeague } from '@mm/lib/data';
import { LeagueScope, sportFamily } from '@/components/league/LeagueScope';
import { RacketMatchCourt } from '@/components/racket/RacketMatch';
import { Loading, Screen } from '@/components/ui';
import { OnWeb } from '@/components/match/OnWeb';

/** El modo cancha de un partido (pantalla completa). */
export default function CourtScreen() {
  const { lid, matchId } = useLocalSearchParams<{ lid: string; matchId: string }>();
  const league = useLeague(lid);
  const exit = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/l/[lid]/partido/[matchId]', params: { lid, matchId } }));
  if (league.loading && !league.data) return <Loading label="Preparando la cancha" />;
  const family = league.data ? sportFamily(league.data) : null;
  if (family !== 'racket') {
    return (
      <Screen>
        <OnWeb lid={lid} matchId={matchId} />
      </Screen>
    );
  }
  return (
    <LeagueScope lid={lid}>
      <RacketMatchCourt matchId={matchId} onExit={exit} />
    </LeagueScope>
  );
}
