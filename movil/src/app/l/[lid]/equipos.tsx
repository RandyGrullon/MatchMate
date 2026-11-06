import { Redirect, useLocalSearchParams } from 'expo-router';
import { bowlingTeamsTag } from '@mm/lib/data/bowlingTeams';
import { invalidate } from '@mm/lib/data/client';
import { tags } from '@mm/lib/data/keys';
import { useLeagueCtx } from '@mm/lib/league';
import { BOWLING_TEAMS_TAB } from '@mm/components/bowlingTeams/logic';
import { leagueSport } from '@mm/sports/registry';
import { TeamsAdmin } from '@/components/bowlingTeams/TeamsAdmin';
import { LeagueScope } from '@/components/league/LeagueScope';
import { BackBar, LoadError, Screen, Txt } from '@/components/ui';

/**
 * Organizar › Equipos (`/l/<liga>/admin?tab=equipos` en la web): los equipos fijos de una liga de boliche, con
 * generarlos, crear, nombre y color, agregar, mover o sacar jugadores y borrar. Dueño, admins y superadmin; quien no lo
 * es ve «No tienes permiso», como en la web. En otro deporte o en un torneo suelto (la web no tiene esa pantalla y
 * manda a Organizar) va a la liga.
 */
export default function TeamsScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  return (
    <LeagueScope lid={lid}>
      <TeamsScreenBody />
    </LeagueScope>
  );
}

function TeamsScreenBody() {
  const { lid, league, isAdmin } = useLeagueCtx();
  if (isAdmin && (leagueSport(league) !== 'bowling' || league.kind === 'torneo')) return <Redirect href={{ pathname: '/l/[lid]', params: { lid } }} />;
  return (
    <Screen onRefresh={() => invalidate(tags.league(lid), bowlingTeamsTag(lid))}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      {!isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : (
        <>
          <Txt variant="title">{BOWLING_TEAMS_TAB.label}</Txt>
          <TeamsAdmin />
        </>
      )}
    </Screen>
  );
}
