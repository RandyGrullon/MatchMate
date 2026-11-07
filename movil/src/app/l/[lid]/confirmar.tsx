import { useLocalSearchParams } from 'expo-router';
import { invalidate } from '@mm/lib/data/client';
import { badgeTags } from '@mm/lib/data/badges';
import { useLeagueCtx } from '@mm/lib/league';
import { adminScreenTitle } from '@mm/components/organizer/hubLogic';
import { ReviewsPanel } from '@/components/badges/ReviewsPanel';
import { LeagueScope } from '@/components/league/LeagueScope';
import { BackBar, LoadError, Screen, Txt } from '@/components/ui';

/**
 * Organizar › Insignias por confirmar (`/l/<liga>/admin?tab=confirmar` en la web): las hazañas de la liga que piden que
 * las confirme alguien que no jugó, con «Confirmar» y «No se pudo confirmar». Dueño, admins y superadmin; quien no lo
 * es ve «No tienes permiso», como en la web.
 */
export default function ReviewsScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  return (
    <LeagueScope lid={lid}>
      <ReviewsScreenBody />
    </LeagueScope>
  );
}

function ReviewsScreenBody() {
  const { lid, league, isAdmin } = useLeagueCtx();
  return (
    <Screen onRefresh={() => invalidate(badgeTags.mine, badgeTags.league(lid))}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      {!isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : (
        <>
          <Txt variant="title">{adminScreenTitle('confirmar', league.kind) ?? ''}</Txt>
          <ReviewsPanel />
        </>
      )}
    </Screen>
  );
}
