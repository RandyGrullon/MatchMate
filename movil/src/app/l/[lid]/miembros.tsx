import { useLocalSearchParams } from 'expo-router';
import { invalidate } from '@mm/lib/data/client';
import { claimTags } from '@mm/lib/data/claims';
import { tags } from '@mm/lib/data/keys';
import { useLeagueCtx } from '@mm/lib/league';
import { adminScreenTitle } from '@mm/components/organizer/hubLogic';
import { peopleTabLabel } from '@mm/components/league/members';
import { peopleInOwnTab } from '@mm/components/players/list';
import { leagueSport } from '@mm/sports/registry';
import { LeagueScope } from '@/components/league/LeagueScope';
import { MembersPanel } from '@/components/members/MembersPanel';
import { PeopleTabs } from '@/components/players/PeopleTabs';
import { BackBar, LoadError, Screen, Txt } from '@/components/ui';

/**
 * Organizar › Jugadores y miembros › Miembros (`/l/<liga>/admin?tab=miembros` en la web): las cuentas de la liga con
 * su papel, anotador, su jugador y sacar de la liga. Dueño, admins y superadmin; quien no lo es ve «No tienes
 * permiso», como en la web. Donde el deporte lleva a su gente en su propia pestaña (natación, raqueta), abajo va lo
 * de las cuentas de su gente.
 */
export default function MembersScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  return (
    <LeagueScope lid={lid}>
      <MembersScreenBody />
    </LeagueScope>
  );
}

function MembersScreenBody() {
  const { lid, league, isAdmin } = useLeagueCtx();
  const sport = leagueSport(league);
  // El `accountsOf` de la web: el nombre de la pestaña del deporte donde va su gente.
  const accountsOf = peopleInOwnTab(sport) ? peopleTabLabel(sport) : null;
  return (
    <Screen onRefresh={() => invalidate(tags.leagueMembers(lid), tags.players(lid), claimTags.league(lid))}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      {!isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : (
        <>
          <Txt variant="title">{adminScreenTitle('miembros', league.kind) ?? ''}</Txt>
          <PeopleTabs active="miembros" />
          <MembersPanel accountsOf={accountsOf} />
        </>
      )}
    </Screen>
  );
}
