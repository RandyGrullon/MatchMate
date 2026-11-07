import { useLocalSearchParams } from 'expo-router';
import { invalidate } from '@mm/lib/data/client';
import { tags } from '@mm/lib/data/keys';
import { useLeagueCtx } from '@mm/lib/league';
import { adminScreenTitle } from '@mm/components/organizer/hubLogic';
import { LeagueScope } from '@/components/league/LeagueScope';
import { SuggestionsPanel } from '@/components/suggestions/SuggestionsPanel';
import { BackBar, LoadError, Screen, Txt } from '@/components/ui';

/**
 * Organizar › Buzón (`/l/<liga>/admin?tab=buzon` en la web): las notas anónimas que dejan los jugadores, para leerlas,
 * marcarlas y borrarlas. Dueño, admins y superadmin; quien no lo es ve «No tienes permiso», como en la web.
 */
export default function SuggestionsScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  return (
    <LeagueScope lid={lid}>
      <SuggestionsScreenBody />
    </LeagueScope>
  );
}

function SuggestionsScreenBody() {
  const { lid, league, isAdmin } = useLeagueCtx();
  return (
    <Screen onRefresh={() => invalidate(tags.suggestions(lid), tags.feeds)}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      {!isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : (
        <>
          <Txt variant="title">{adminScreenTitle('buzon', league.kind) ?? ''}</Txt>
          <SuggestionsPanel />
        </>
      )}
    </Screen>
  );
}
