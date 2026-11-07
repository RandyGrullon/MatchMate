import { Redirect, useLocalSearchParams } from 'expo-router';
import { useLeague } from '@mm/lib/data';
import { LeagueScope, sportFamily } from '@/components/league/LeagueScope';
import { TeamPlayoffs } from '@/components/team/playoffs/TeamPlayoffs';
import { Loading, Screen } from '@/components/ui';

/**
 * Los playoffs de la temporada (`/l/<liga>/playoffs` en la web; baloncesto, fútbol y sala): la llave, sus series y,
 * para el admin, armarlos. En otro deporte o en un torneo suelto (la web no tiene playoffs ahí), la liga. La pantalla
 * trae su barra de atrás con «•••».
 */
export default function PlayoffsScreen() {
  const { lid, temporada } = useLocalSearchParams<{ lid: string; temporada?: string }>();
  const league = useLeague(lid);
  if (league.loading && !league.data) return <Loading label="Cargando la liga" />;
  if (!league.data || sportFamily(league.data) !== 'team' || league.data.kind === 'torneo') return <Redirect href={{ pathname: '/l/[lid]', params: { lid } }} />;
  return (
    <Screen>
      <LeagueScope lid={lid}>
        <TeamPlayoffs temporada={temporada ?? null} />
      </LeagueScope>
    </Screen>
  );
}
