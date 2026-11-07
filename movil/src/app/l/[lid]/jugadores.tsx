import { Redirect, useLocalSearchParams } from 'expo-router';
import { invalidate } from '@mm/lib/data/client';
import { tags } from '@mm/lib/data/keys';
import { useLeagueCtx } from '@mm/lib/league';
import { adminScreenTitle } from '@mm/components/organizer/hubLogic';
import { peopleInOwnTab } from '@mm/components/players/list';
import { leagueSport } from '@mm/sports/registry';
import { LeagueScope } from '@/components/league/LeagueScope';
import { PeopleTabs } from '@/components/players/PeopleTabs';
import { PlayersPanel } from '@/components/players/PlayersPanel';
import { BackBar, LoadError, Screen, Txt } from '@/components/ui';

/**
 * Organizar › Jugadores (`/l/<liga>/admin?tab=jugadores` en la web): la lista de jugadores de la liga con agregar,
 * editar, vincular o separar la cuenta, juntar, compartir y eliminar. Dueño, admins y superadmin; quien no lo es ve
 * «No tienes permiso», como en la web. Donde el deporte lleva a su gente en su propia pestaña (natación, raqueta), la
 * web manda a Miembros: eso todavía es en la web.
 */
export default function PlayersScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  return (
    <LeagueScope lid={lid}>
      <PlayersScreenBody />
    </LeagueScope>
  );
}

function PlayersScreenBody() {
  const { lid, league, isAdmin } = useLeagueCtx();
  const merged = peopleInOwnTab(leagueSport(league));
  return (
    <Screen onRefresh={() => invalidate(tags.players(lid), tags.leagueMembers(lid), tags.entries(lid), `claims:${lid}`)}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      {!isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : (
        <>
          <Txt variant="title">{adminScreenTitle('jugadores', league.kind) ?? ''}</Txt>
          {merged ? (
            // Donde el deporte lleva a su gente en su pestaña, lo de las cuentas está en Miembros (como la web).
            <Redirect href={`/l/${lid}/miembros` as never} />
          ) : (
            <>
              <PeopleTabs active="jugadores" />
              <PlayersPanel />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
