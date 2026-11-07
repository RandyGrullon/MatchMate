import { router } from 'expo-router';
import { Settings } from 'lucide-react-native';
import type { League } from '@mm/lib/types';
import { leagueRows } from '@mm/components/organizer/hubLogic';
import { leaguePhotos } from '@mm/components/league/settings';
import { ListRow, RowIcon } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * La fila de los ajustes en Organizar › La liga (leagueRows de la web, la misma fila): «Ajustes de la liga» (o «del
 * torneo») con «Datos, logo, invitar» («Foto del marcador, logo, invitar» en el boliche). Abre Organizar › Ajustes de
 * la liga en la app. Para quien organiza la liga.
 */
export function SettingsRow({ lid, league }: { lid: string; league: League }) {
  const c = useColors();
  const row = leagueRows({
    kind: league.kind,
    photos: leaguePhotos(league),
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
  }).find((r) => r.kind === 'ajustes');
  if (!row) return null;
  return (
    <ListRow
      icon={
        <RowIcon>
          <Settings size={20} color={c.accent} />
        </RowIcon>
      }
      title={row.title}
      subtitle={row.subtitle ?? null}
      onPress={() => router.push({ pathname: '/l/[lid]/ajustes' as never, params: { lid } } as never)}
    />
  );
}
