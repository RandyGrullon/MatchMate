import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@mm/lib/auth';
import { useLeague } from '@mm/lib/data';
import { useMembership } from '@mm/lib/data/members';
import { BowlingRanking } from '@/components/bowling/BowlingRanking';
import { LeagueScope, sportFamily } from '@/components/league/LeagueScope';
import { RacketStandings } from '@/components/racket/RacketStandings';
import { TeamStandings } from '@/components/team/TeamScreens';
import { BackBar, Loading, Screen } from '@/components/ui';

/** La tabla de la liga (la pestaña Tabla de la web). */
export default function LeagueTableScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  const auth = useAuth();
  const league = useLeague(lid);
  const member = useMembership(lid, auth.user?.uid);
  if (league.loading && !league.data) return <Loading label="Cargando la liga" />;
  const family = league.data ? sportFamily(league.data) : null;
  // El boliche: su tabla por temporada (promedios).
  if (family === 'series') {
    return (
      <Screen>
        <BackBar label={league.data?.name ?? 'Liga'} fallback={`/l/${lid}`} />
        <BowlingRanking lid={lid} myPlayerId={member.data?.playerId ?? null} />
      </Screen>
    );
  }
  // Lo que la app todavía no tiene de ese deporte: la liga.
  if (family !== 'racket' && family !== 'team') return <Redirect href={{ pathname: '/l/[lid]', params: { lid } }} />;
  return (
    <Screen>
      <BackBar label={league.data?.name ?? 'Liga'} fallback={`/l/${lid}`} />
      <LeagueScope lid={lid}>{family === 'racket' ? <RacketStandings /> : <TeamStandings />}</LeagueScope>
    </Screen>
  );
}
