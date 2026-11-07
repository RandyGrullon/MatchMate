import { Redirect, useLocalSearchParams } from 'expo-router';
import { bowlingTeamsTag } from '@mm/lib/data/bowlingTeams';
import { invalidate } from '@mm/lib/data/client';
import { tags } from '@mm/lib/data/keys';
import { matchTags, seasonTeamTag } from '@mm/lib/data/matches';
import { teamSportTags } from '@mm/lib/data/teamSports';
import { useLeagueCtx } from '@mm/lib/league';
import { BOWLING_TEAMS_TAB } from '@mm/components/bowlingTeams/logic';
import { sanctionTag } from '@mm/pages/sports/football/data';
import { TEAM_ADMIN_TAB } from '@mm/sports/adminTabs';
import { leagueSport } from '@mm/sports/registry';
import { TeamsAdmin } from '@/components/bowlingTeams/TeamsAdmin';
import { LeagueScope, sportFamily } from '@/components/league/LeagueScope';
import { TeamAdmin } from '@/components/team/admin/TeamAdmin';
import { BackBar, LoadError, Screen, Txt } from '@/components/ui';

/**
 * Organizar › Equipos (`/l/<liga>/admin?tab=equipos` en la web). En el boliche, los equipos fijos de la liga, con
 * generarlos, crear, nombre y color, agregar, mover o sacar jugadores y borrar. En baloncesto, fútbol y sala (también en
 * un torneo suelto, como la web), la pantalla propia del deporte: Equipos · Partidos · Reglas (· Comité), `?parte=`.
 * Dueño, admins y superadmin; quien no lo es ve «No tienes permiso», como en la web. En otro deporte o en un torneo
 * suelto de boliche (la web no tiene esa pantalla y manda a Organizar) va a la liga.
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
  if (sportFamily(league) === 'team') return <TeamSportsBody />;
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

/** Baloncesto, fútbol y sala: los equipos, los partidos, las reglas y el comité. */
function TeamSportsBody() {
  const { lid, league, isAdmin } = useLeagueCtx();
  return (
    <Screen onRefresh={() => invalidate(tags.league(lid), seasonTeamTag(lid), matchTags.league(lid), teamSportTags.rules(lid), teamSportTags.officials(lid), sanctionTag(lid), tags.players(lid))}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      {!isAdmin ? (
        <LoadError error={new Error('permission-denied')} />
      ) : (
        <>
          <Txt variant="title">{TEAM_ADMIN_TAB.label}</Txt>
          <TeamAdmin />
        </>
      )}
    </Screen>
  );
}
