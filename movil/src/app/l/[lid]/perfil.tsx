import { Redirect, useLocalSearchParams } from 'expo-router';
import { useLeague } from '@mm/lib/data';
import { leagueSport } from '@mm/sports/registry';
import { LeagueScope } from '@/components/league/LeagueScope';
import { SwimMyProfile } from '@/components/swimming/SwimProfile';
import { EsportsMine } from '@/components/esports/EsportsLeague';
import { BackBar, Loading, Screen } from '@/components/ui';

/** Lo mío en la liga (la pestaña de perfil de la web: «Mis marcas» en natación, «Lo mío» en esports). Lo que la app no tiene: la liga. */
export default function LeagueMineScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  const league = useLeague(lid);
  if (league.loading && !league.data) return <Loading label="Cargando la liga" />;
  const sport = league.data ? leagueSport(league.data) : null;
  if (sport === 'swimming') {
    return (
      <Screen>
        <BackBar label={league.data?.name ?? 'Liga'} fallback={`/l/${lid}`} />
        <LeagueScope lid={lid}>
          <SwimMyProfile />
        </LeagueScope>
      </Screen>
    );
  }
  if (sport === 'esports') {
    return (
      <Screen>
        <BackBar label={league.data?.name ?? 'Liga'} fallback={`/l/${lid}`} />
        <LeagueScope lid={lid}>
          <EsportsMine />
        </LeagueScope>
      </Screen>
    );
  }
  return <Redirect href={{ pathname: '/l/[lid]', params: { lid } }} />;
}
