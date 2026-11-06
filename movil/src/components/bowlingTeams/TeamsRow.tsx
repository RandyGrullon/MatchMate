import { router } from 'expo-router';
import { Shield } from 'lucide-react-native';
import type { League } from '@mm/lib/types';
import { leagueRows } from '@mm/components/organizer/hubLogic';
import { BOWLING_TEAMS_TAB } from '@mm/components/bowlingTeams/logic';
import { leagueSport, sportMeta } from '@mm/sports/registry';
import { ListRow, RowIcon } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * La fila de los equipos fijos en Organizar › La liga (leagueRows de la web con la pantalla propia del boliche, la
 * misma fila): «Equipos» con «Fijos de la liga: al azar, parejos o a mano» y el escudo, que abre Organizar › Equipos
 * en la app. Solo en una liga de boliche (un torneo suelto arma los suyos en el torneo). Para quien organiza la liga.
 */
export function TeamsRow({ lid, league }: { lid: string; league: League }) {
  const c = useColors();
  const sport = leagueSport(league);
  if (sport !== 'bowling' || league.kind === 'torneo') return null;
  const row = leagueRows({
    kind: league.kind,
    photos: sportMeta(sport)?.photos ?? false,
    schedule: league.schedule,
    seasonStart: league.seasonStart,
    seasonEnd: league.seasonEnd,
    players: null,
    accounts: null,
    members: null,
    own: [BOWLING_TEAMS_TAB],
    playersMerged: false,
    buzonInToDo: false,
    reportsTab: false,
  }).find((r) => r.key === `own:${BOWLING_TEAMS_TAB.key}`);
  if (!row) return null;
  return (
    <ListRow
      icon={
        <RowIcon>
          <Shield size={20} color={c.accent} />
        </RowIcon>
      }
      title={row.title}
      subtitle={row.subtitle ?? null}
      onPress={() => router.push({ pathname: '/l/[lid]/equipos', params: { lid } })}
    />
  );
}
