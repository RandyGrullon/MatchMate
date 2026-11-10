import { Redirect, useLocalSearchParams } from 'expo-router';
import { useLeague } from '@mm/lib/data';
import { leagueSport } from '@mm/sports/registry';
import { LeagueScope, sportFamily } from '@/components/league/LeagueScope';
import { RacketMyProfile } from '@/components/racket/RacketProfile';
import { GolfMyProfile } from '@/components/golf/GolfProfile';
import { TeamMine } from '@/components/team/TeamScreens';
import { SwimMyProfile } from '@/components/swimming/SwimProfile';
import { EsportsMine } from '@/components/esports/EsportsLeague';
import { BowlingMine } from '@/components/bowling/BowlingMine';
import { BackBar, Loading, Screen } from '@/components/ui';

/**
 * Lo mío en la liga (la pestaña de perfil de la web: «Mis juegos» en boliche, «Mis marcas» en natación, «Lo mío» en
 * esports, «Mis partidos» en raqueta). Un deporte que la app no conoce: la liga.
 */
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
  if (sport === 'basketball' || sport === 'football' || sport === 'futsal') {
    return (
      <Screen>
        <BackBar label={league.data?.name ?? 'Liga'} fallback={`/l/${lid}`} />
        <LeagueScope lid={lid}>
          <TeamMine />
        </LeagueScope>
      </Screen>
    );
  }
  if (sport === 'golf') {
    return (
      <Screen>
        <BackBar label={league.data?.name ?? 'Liga'} fallback={`/l/${lid}`} />
        <LeagueScope lid={lid}>
          <GolfMyProfile />
        </LeagueScope>
      </Screen>
    );
  }
  if (league.data && sportFamily(league.data) === 'racket') {
    return (
      <Screen>
        <BackBar label={league.data.name} fallback={`/l/${lid}`} />
        <LeagueScope lid={lid}>
          <RacketMyProfile />
        </LeagueScope>
      </Screen>
    );
  }
  if (sport === 'bowling') {
    return (
      <Screen>
        <BackBar label={league.data?.name ?? 'Liga'} fallback={`/l/${lid}`} />
        <LeagueScope lid={lid}>
          <BowlingMine />
        </LeagueScope>
      </Screen>
    );
  }
  return <Redirect href={{ pathname: '/l/[lid]', params: { lid } }} />;
}
