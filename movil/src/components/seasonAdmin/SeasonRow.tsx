import { router } from 'expo-router';
import { Calendar } from 'lucide-react-native';
import type { League } from '@mm/lib/types';
import { leagueRows } from '@mm/components/organizer/hubLogic';
import { leagueSport, sportMeta } from '@mm/sports/registry';
import { ListRow, RowIcon } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * La fila de la temporada en Organizar › La liga (leagueRows de la web, la misma fila, con el calendario):
 * «Temporada y fechas» con las fechas de la temporada y el horario («1 feb – 30 jun · martes 7:00 p. m.», o «Cerrar la
 * temporada o suspender un día»); en un torneo suelto, «Fechas» con «Suspender o mover un día». Abre Organizar ›
 * Temporada y fechas en la app. Para quien organiza la liga.
 */
export function SeasonRow({ lid, league }: { lid: string; league: League }) {
  const c = useColors();
  const row = leagueRows({
    kind: league.kind,
    photos: sportMeta(leagueSport(league))?.photos ?? false,
    schedule: league.schedule,
    seasonStart: league.seasonStart,
    seasonEnd: league.seasonEnd,
    players: null,
    accounts: null,
    members: null,
    own: [],
    playersMerged: false,
    buzonInToDo: false,
    reportsTab: false,
  }).find((r) => r.kind === 'temporada');
  if (!row) return null;
  return (
    <ListRow
      icon={
        <RowIcon>
          <Calendar size={20} color={c.accent} />
        </RowIcon>
      }
      title={row.title}
      subtitle={row.subtitle ?? null}
      onPress={() => router.push({ pathname: '/l/[lid]/temporada', params: { lid } })}
    />
  );
}
