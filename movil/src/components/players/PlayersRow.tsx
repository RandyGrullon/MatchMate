import { router } from 'expo-router';
import { Users } from 'lucide-react-native';
import { useLeagueMembers, usePlayers } from '@mm/lib/data';
import type { League } from '@mm/lib/types';
import { leagueRows } from '@mm/components/organizer/hubLogic';
import { peopleInOwnTab } from '@mm/components/players/list';
import { leagueSport, sportMeta } from '@mm/sports/registry';
import { ListRow, RowIcon } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * La fila de la gente de la liga en Organizar › La liga (leagueRows de la web, la misma fila): «Jugadores y miembros»
 * con «12 jugadores · 9 con cuenta», que abre Jugadores en la app. Donde el deporte lleva a su gente en su propia
 * pestaña (natación, raqueta) la web la llama «Miembros» («3 miembros · permisos y cuentas») y abre Miembros: eso
 * todavía va a la web. Para quien organiza la liga (dueño, admins y superadmin).
 */
export function PlayersRow({ lid, league }: { lid: string; league: League }) {
  const c = useColors();
  const players = usePlayers(lid);
  const members = useLeagueMembers(lid);
  const ids = new Set(players.data.map((p) => p.id));
  const sport = leagueSport(league);
  const row = leagueRows({
    kind: league.kind,
    photos: sportMeta(sport)?.photos ?? false,
    schedule: league.schedule,
    seasonStart: league.seasonStart,
    seasonEnd: league.seasonEnd,
    players: players.loading ? null : players.data.length,
    accounts: members.loading || players.loading ? null : members.data.filter((m) => m.playerId && ids.has(m.playerId)).length,
    members: members.loading ? null : members.data.length,
    own: [],
    playersMerged: peopleInOwnTab(sport),
    buzonInToDo: false,
    reportsTab: false,
  }).find((r) => r.kind === 'gente');
  if (!row) return null;
  return (
    <ListRow
      icon={
        <RowIcon>
          <Users size={20} color={c.accent} />
        </RowIcon>
      }
      title={row.title}
      subtitle={row.subtitle ?? null}
      onPress={() => (row.tab === 'jugadores' ? router.push({ pathname: '/l/[lid]/jugadores', params: { lid } }) : router.push(`/l/${lid}/miembros` as never))}
    />
  );
}
