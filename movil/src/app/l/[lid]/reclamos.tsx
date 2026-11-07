import { useLocalSearchParams } from 'expo-router';
import { invalidate } from '@mm/lib/data/client';
import { claimTags } from '@mm/lib/data/claims';
import { tags } from '@mm/lib/data/keys';
import { useLeagueCtx } from '@mm/lib/league';
import { adminScreenTitle } from '@mm/components/organizer/hubLogic';
import { ClaimsPanel } from '@/components/claims/ClaimsPanel';
import { LeagueScope } from '@/components/league/LeagueScope';
import { PeopleTabs } from '@/components/players/PeopleTabs';
import { BackBar, LoadError, Screen, Txt } from '@/components/ui';

/**
 * Organizar › Jugadores y miembros › Reclamos (`/l/<liga>/admin?tab=reclamos` en la web, a donde lleva el aviso de la
 * campana): aprobar o rechazar el «ese soy yo» de quien pide ser un jugador que se anotó sin cuenta. Dueño, admins y
 * superadmin; quien no lo es ve «No tienes permiso», como en la web.
 */
export default function ClaimsScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  return (
    <LeagueScope lid={lid}>
      <ClaimsScreenBody />
    </LeagueScope>
  );
}

function ClaimsScreenBody() {
  const { lid, league, isAdmin } = useLeagueCtx();
  return (
    <Screen onRefresh={() => invalidate(claimTags.league(lid), tags.leagueMembers(lid), tags.players(lid))}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      {!isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : (
        <>
          <Txt variant="title">{adminScreenTitle('reclamos', league.kind) ?? ''}</Txt>
          <PeopleTabs active="reclamos" />
          <ClaimsPanel />
        </>
      )}
    </Screen>
  );
}
