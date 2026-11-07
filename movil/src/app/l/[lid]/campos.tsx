import { Redirect, useLocalSearchParams } from 'expo-router';
import { invalidate } from '@mm/lib/data/client';
import { golfKeys } from '@mm/lib/data/golf';
import { tags } from '@mm/lib/data/keys';
import { useLeagueCtx } from '@mm/lib/league';
import { GOLF_ADMIN_TAB } from '@mm/sports/adminTabs';
import { leagueSport } from '@mm/sports/registry';
import { GolfAdmin } from '@/components/golf/GolfAdmin';
import { LeagueScope } from '@/components/league/LeagueScope';
import { BackBar, LoadError, Screen, Txt } from '@/components/ui';

/**
 * Organizar › Campos de una liga de golf (`/l/<liga>/admin?tab=campos` en la web): los campos del club (agregar, cambiar
 * y borrar) y el formato por defecto con los puntos del orden de mérito. Dueño, admins y superadmin; quien no lo es ve
 * «No tienes permiso», como en la web. En una liga que no es de golf, la liga.
 */
export default function CoursesScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  return (
    <LeagueScope lid={lid}>
      <CoursesScreenBody />
    </LeagueScope>
  );
}

function CoursesScreenBody() {
  const { lid, league, isAdmin } = useLeagueCtx();
  if (leagueSport(league) !== 'golf') return <Redirect href={{ pathname: '/l/[lid]', params: { lid } }} />;
  return (
    <Screen onRefresh={() => invalidate(golfKeys.courses(lid), tags.league(lid))}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      {!isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : (
        <>
          <Txt variant="title">{GOLF_ADMIN_TAB.label}</Txt>
          <GolfAdmin />
        </>
      )}
    </Screen>
  );
}
