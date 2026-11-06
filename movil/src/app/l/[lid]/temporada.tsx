import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { invalidate } from '@mm/lib/data/client';
import { tags } from '@mm/lib/data/keys';
import { organizerTags } from '@mm/lib/data/organizer';
import { seasonTags } from '@mm/lib/data/seasons';
import { useLeagueCtx } from '@mm/lib/league';
import { adminScreenTitle } from '@mm/components/organizer/hubLogic';
import { LeagueScope } from '@/components/league/LeagueScope';
import { SeasonAdmin } from '@/components/seasonAdmin/SeasonAdmin';
import { SuspendDayRow } from '@/components/seasonAdmin/SuspendDay';
import { BackBar, LoadError, Screen, Txt } from '@/components/ui';

/**
 * Organizar › Temporada y fechas (`/l/<liga>/admin?tab=temporada` en la web; «Fechas» en un torneo suelto):
 * «Suspender un día» (lluvia, la bolera cerrada) y, en una liga, la temporada (cerrarla con sus premios, corregirlos y
 * empezar otra). Dueño, admins y superadmin; quien no lo es ve «No tienes permiso», como en la web.
 */
export default function SeasonScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  return (
    <LeagueScope lid={lid}>
      <SeasonScreenBody />
    </LeagueScope>
  );
}

function SeasonScreenBody() {
  const { lid, league, isAdmin } = useLeagueCtx();
  return (
    <Screen onRefresh={() => invalidate(seasonTags.league(lid), tags.league(lid), tags.events(lid), organizerTags.suspend(lid))}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      {!isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : (
        <>
          <Txt variant="title">{adminScreenTitle('temporada', league.kind) ?? ''}</Txt>
          <View style={{ gap: 24 }}>
            <SuspendDayRow />
            {/* Un torneo suelto no tiene temporadas. */}
            {league.kind !== 'torneo' && <SeasonAdmin />}
          </View>
        </>
      )}
    </Screen>
  );
}
