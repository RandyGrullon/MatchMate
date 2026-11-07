import { Redirect, useLocalSearchParams } from 'expo-router';
import { invalidate } from '@mm/lib/data/client';
import { tags } from '@mm/lib/data/keys';
import { seasonTeamTag } from '@mm/lib/data/matches';
import { useLeagueCtx } from '@mm/lib/league';
import { racketAdminTab } from '@mm/sports/adminTabs';
import type { RacketSport } from '@mm/sports/racket';
import { leagueSport } from '@mm/sports/registry';
import { LeagueScope, sportFamily } from '@/components/league/LeagueScope';
import { PairsAdmin } from '@/components/racket/PairsAdmin';
import { BackBar, LoadError, Screen, Txt } from '@/components/ui';

/**
 * Organizar › Parejas y niveles (o «Jugadores y niveles» en tenis y ping pong; `/l/<liga>/admin?tab=parejas` en la
 * web): las reglas del partido, las parejas y el nivel de cada jugador. Dueño, admins y superadmin; quien no lo es ve
 * «No tienes permiso», como en la web. Solo en las ligas de raqueta.
 */
export default function PairsScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  return (
    <LeagueScope lid={lid}>
      <PairsScreenBody />
    </LeagueScope>
  );
}

function PairsScreenBody() {
  const { lid, league, isAdmin } = useLeagueCtx();
  const racket = sportFamily(league) === 'racket';
  return (
    <Screen onRefresh={() => invalidate(tags.players(lid), tags.league(lid), seasonTeamTag(lid))}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      {!isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : !racket ? (
        // Lo que no es de raqueta: la liga.
        <Redirect href={{ pathname: '/l/[lid]', params: { lid } }} />
      ) : (
        <>
          <Txt variant="title">{racketAdminTab(leagueSport(league) as RacketSport).label}</Txt>
          <PairsAdmin />
        </>
      )}
    </Screen>
  );
}
