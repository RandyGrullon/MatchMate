import { useLocalSearchParams } from 'expo-router';
import { invalidate } from '@mm/lib/data/client';
import { reportTags } from '@mm/lib/data/reports';
import { useLeagueCtx } from '@mm/lib/league';
import { adminScreenTitle } from '@mm/components/organizer/hubLogic';
import { LeagueScope } from '@/components/league/LeagueScope';
import { LeagueReportsPanel } from '@/components/reports/LeagueReportsPanel';
import { BackBar, LoadError, Screen, Txt } from '@/components/ui';

/**
 * Organizar › Reportes (`/l/<liga>/admin?tab=reportes` en la web): lo que se reportó en la liga y cómo quedó; revisar y
 * decidir. Dueño, admins y superadmin; quien no lo es ve «No tienes permiso», como en la web.
 */
export default function ReportsScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  return (
    <LeagueScope lid={lid}>
      <ReportsScreenBody />
    </LeagueScope>
  );
}

function ReportsScreenBody() {
  const { lid, league, isAdmin } = useLeagueCtx();
  return (
    <Screen onRefresh={() => invalidate(reportTags.all, reportTags.league(lid))}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      {!isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : (
        <>
          <Txt variant="title">{adminScreenTitle('reportes', league.kind) ?? ''}</Txt>
          <LeagueReportsPanel />
        </>
      )}
    </Screen>
  );
}
