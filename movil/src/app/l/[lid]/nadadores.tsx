import { Redirect, useLocalSearchParams } from 'expo-router';
import { invalidate } from '@mm/lib/data/client';
import { tags } from '@mm/lib/data/keys';
import { swimTags } from '@mm/lib/data/swimming';
import { useLeagueCtx } from '@mm/lib/league';
import { SWIM_ADMIN_TABS } from '@mm/sports/adminTabs';
import { leagueSport } from '@mm/sports/registry';
import { LeagueScope } from '@/components/league/LeagueScope';
import { SwimmersAdmin } from '@/components/swimming/SwimmersAdmin';
import { BackBar, LoadError, Screen, Txt } from '@/components/ui';

/**
 * Organizar › Nadadores (`/l/<liga>/admin?tab=nadadores` en la web): buscar y filtrar por club, registrar nadadores sin
 * cuenta (los menores, con el permiso del tutor) y cambiar su club, año y sexo. Dueño, admins y superadmin; quien no lo
 * es ve «No tienes permiso», como en la web. En otro deporte (la web no tiene esa pantalla) va a la liga.
 */
export default function SwimmersScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  return (
    <LeagueScope lid={lid}>
      <SwimmersScreenBody />
    </LeagueScope>
  );
}

function SwimmersScreenBody() {
  const { lid, league, isAdmin } = useLeagueCtx();
  if (isAdmin && leagueSport(league) !== 'swimming') return <Redirect href={{ pathname: '/l/[lid]', params: { lid } }} />;
  return (
    <Screen onRefresh={() => invalidate(tags.players(lid), swimTags.swimmers(lid), swimTags.clubs(lid))}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      {!isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : (
        <>
          <Txt variant="title">{SWIM_ADMIN_TABS[0].label}</Txt>
          <SwimmersAdmin />
        </>
      )}
    </Screen>
  );
}
