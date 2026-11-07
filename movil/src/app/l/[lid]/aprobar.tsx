import { Redirect, useLocalSearchParams } from 'expo-router';
import { invalidate } from '@mm/lib/data/client';
import { tags } from '@mm/lib/data/keys';
import { useLeagueCtx } from '@mm/lib/league';
import { adminScreenTitle } from '@mm/components/organizer/hubLogic';
import { leagueSport } from '@mm/sports/registry';
import { ApprovalsPanel } from '@/components/approvals/ApprovalsPanel';
import { LeagueScope } from '@/components/league/LeagueScope';
import { BackBar, LoadError, Screen, Txt } from '@/components/ui';

/**
 * Organizar › Aprobar juegos (`/l/<liga>/admin?tab=aprobar` en la web): todos los envíos por aprobar de la liga, el más
 * viejo primero, cada uno con su foto, corregir los juegos, la lectura de la foto con IA, Rechazar con motivo y Aprobar;
 * arriba, «Aprobar todo». Dueño, admins y superadmin; quien no lo es ve «No tienes permiso», como en la web. Aprobar
 * envíos es del boliche: en otro deporte (la web manda a Organizar) va a Organizar de la liga.
 */
export default function ApprovalsScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  return (
    <LeagueScope lid={lid}>
      <ApprovalsScreenBody />
    </LeagueScope>
  );
}

function ApprovalsScreenBody() {
  const { lid, league, isAdmin } = useLeagueCtx();
  if (isAdmin && leagueSport(league) !== 'bowling') return <Redirect href={{ pathname: '/organizar', params: { liga: lid } }} />;
  return (
    <Screen onRefresh={() => invalidate(tags.subs(lid), tags.events(lid), tags.players(lid), tags.entries(lid))}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      {!isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : (
        <>
          <Txt variant="title">{adminScreenTitle('aprobar', league.kind) ?? ''}</Txt>
          <ApprovalsPanel />
        </>
      )}
    </Screen>
  );
}
