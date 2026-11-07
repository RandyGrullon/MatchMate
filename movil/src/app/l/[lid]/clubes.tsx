import { Redirect, useLocalSearchParams } from 'expo-router';
import { invalidate } from '@mm/lib/data/client';
import { tags } from '@mm/lib/data/keys';
import { swimTags } from '@mm/lib/data/swimming';
import { useLeagueCtx } from '@mm/lib/league';
import { SWIM_ADMIN_TABS } from '@mm/sports/adminTabs';
import { leagueSport } from '@mm/sports/registry';
import { LeagueScope } from '@/components/league/LeagueScope';
import { ClubsAdmin } from '@/components/swimming/ClubsAdmin';
import { BackBar, LoadError, Screen, Txt } from '@/components/ui';

/**
 * Organizar › Clubes (`/l/<liga>/admin?tab=clubes` en la web): los clubes (nombre, sigla, color y entrenador; borrar),
 * los cronometristas y lo que la liga pone a cada encuentro nuevo. Dueño, admins y superadmin; quien no lo es ve «No
 * tienes permiso», como en la web. En otro deporte (la web no tiene esa pantalla) va a la liga.
 */
export default function ClubsScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  return (
    <LeagueScope lid={lid}>
      <ClubsScreenBody />
    </LeagueScope>
  );
}

function ClubsScreenBody() {
  const { lid, league, isAdmin } = useLeagueCtx();
  if (isAdmin && leagueSport(league) !== 'swimming') return <Redirect href={{ pathname: '/l/[lid]', params: { lid } }} />;
  return (
    <Screen onRefresh={() => invalidate(tags.league(lid), tags.leagueMembers(lid), swimTags.clubs(lid), swimTags.swimmers(lid))}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      {!isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : (
        <>
          <Txt variant="title">{SWIM_ADMIN_TABS[1].label}</Txt>
          <ClubsAdmin />
        </>
      )}
    </Screen>
  );
}
