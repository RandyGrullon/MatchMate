import { Redirect, useLocalSearchParams } from 'expo-router';
import { useLeague } from '@mm/lib/data';
import { LeagueScope, sportFamily } from '@/components/league/LeagueScope';
import { RacketStandings } from '@/components/racket/RacketStandings';
import { TeamStandings } from '@/components/team/TeamScreens';
import { BackBar, Loading, Screen } from '@/components/ui';

/** La tabla de la liga (la pestaña Tabla de la web). */
export default function LeagueTableScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  const league = useLeague(lid);
  if (league.loading && !league.data) return <Loading label="Cargando la liga" />;
  const family = league.data ? sportFamily(league.data) : null;
  // Lo que la app todavía no tiene de ese deporte: la liga.
  if (family !== 'racket' && family !== 'team') return <Redirect href={{ pathname: '/l/[lid]', params: { lid } }} />;
  return (
    <Screen>
      <BackBar label={league.data?.name ?? 'Liga'} fallback={`/l/${lid}`} />
      <LeagueScope lid={lid}>{family === 'racket' ? <RacketStandings /> : <TeamStandings />}</LeagueScope>
    </Screen>
  );
}
