import { useLocalSearchParams } from 'expo-router';
import { useLeague } from '@mm/lib/data';
import { leagueSport } from '@mm/sports/registry';
import { EsportsMatch } from '@/components/esports/EsportsMatch';
import { LeagueScope, sportFamily } from '@/components/league/LeagueScope';
import { RacketMatch } from '@/components/racket/RacketMatch';
import { TeamMatch } from '@/components/team/TeamScreens';
import { BackBar, Loading, Screen } from '@/components/ui';
import { OnWeb } from '@/components/match/OnWeb';

/** Un partido o una serie de esports (el `?partido=` de la web). */
export default function MatchScreen() {
  const { lid, matchId } = useLocalSearchParams<{ lid: string; matchId: string }>();
  const league = useLeague(lid);
  if (league.loading && !league.data) return <Loading label="Cargando la liga" />;
  const family = league.data ? sportFamily(league.data) : null;
  const esports = !!league.data && leagueSport(league.data) === 'esports';
  return (
    <Screen>
      <BackBar label={league.data?.name ?? 'Liga'} fallback={`/l/${lid}`} />
      <LeagueScope lid={lid}>{esports ? <EsportsMatch matchId={matchId} /> : family === 'racket' ? <RacketMatch matchId={matchId} /> : family === 'team' ? <TeamMatch matchId={matchId} /> : <OnWeb lid={lid} matchId={matchId} />}</LeagueScope>
    </Screen>
  );
}
