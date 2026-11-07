import { Redirect, useLocalSearchParams } from 'expo-router';
import { useLeagueCtx } from '@mm/lib/league';
import { LeagueScope, sportFamily } from '@/components/league/LeagueScope';
import { EventWizard } from '@/components/racket/EventWizard';
import { BackBar, LoadError, Screen } from '@/components/ui';

/**
 * «Nuevo» de una liga de raqueta (en la web, la hoja que abre «Nuevo» en el inicio de la liga): elegir qué organizar
 * y crearlo. Solo quien organiza; quien no, ve «No tienes permiso».
 */
export default function RacketNewScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  return (
    <LeagueScope lid={lid}>
      <RacketNewBody />
    </LeagueScope>
  );
}

function RacketNewBody() {
  const { lid, league, isAdmin } = useLeagueCtx();
  if (sportFamily(league) !== 'racket') return <Redirect href={{ pathname: '/l/[lid]', params: { lid } }} />;
  return (
    <Screen>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      {isAdmin ? <EventWizard /> : <LoadError error={new Error('permission-denied')} />}
    </Screen>
  );
}
