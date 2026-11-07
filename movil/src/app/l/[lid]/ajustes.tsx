import { useLocalSearchParams } from 'expo-router';
import { invalidate } from '@mm/lib/data/client';
import { tags } from '@mm/lib/data/keys';
import { useLeagueCtx } from '@mm/lib/league';
import { adminScreenTitle } from '@mm/components/organizer/hubLogic';
import { LeagueScope } from '@/components/league/LeagueScope';
import { SettingsPanel } from '@/components/leagueSettings/SettingsPanel';
import { BackBar, LoadError, Screen, Txt } from '@/components/ui';

/**
 * Organizar › Ajustes de la liga (`/l/<liga>/admin?tab=liga` en la web; «Ajustes del torneo» en un torneo suelto): los
 * datos y editarlos, el logo, las transmisiones en vivo, la invitación y el respaldo, las fotos viejas y borrar la liga.
 * Dueño, admins y superadmin; quien no lo es ve «No tienes permiso», como en la web.
 */
export default function SettingsScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  return (
    <LeagueScope lid={lid}>
      <SettingsScreenBody />
    </LeagueScope>
  );
}

function SettingsScreenBody() {
  const { lid, league, isAdmin } = useLeagueCtx();
  return (
    <Screen onRefresh={() => invalidate(tags.league(lid), tags.leagues)}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      {!isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : (
        <>
          <Txt variant="title">{adminScreenTitle('liga', league.kind) ?? ''}</Txt>
          <SettingsPanel />
        </>
      )}
    </Screen>
  );
}
