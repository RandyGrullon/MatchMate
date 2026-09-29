import { useCallback, useMemo } from 'react';
import { useAuth } from '../../../lib/auth';
import { useLeagueMembers, usePlayers } from '../../../lib/data';
import { useMatches, type Match } from '../../../lib/data/matches';
import { useSeasonTeams, type SeasonTeam } from '../../../lib/data/seasonTeams';
import { useLeagueSeasons } from '../../../lib/data/seasons';
import { useLeagueRules, useMatchOfficials, type MatchOfficial } from '../../../lib/data/teamSports';
import { useLeagueCtx } from '../../../lib/league';
import { currentSeason, type Season } from '../../../lib/seasons';
import { pastSeasonTeams, seasonMatches, teamsOfSeason } from '../../../components/season/logic';
import { myTeams, speakerSide } from './logic';

/**
 * Todo lo que usan las pantallas de una liga de equipos, leído una vez: la liga y la cuenta, los equipos con su
 * plantilla, los jugadores, los miembros (solo si es miembro), los partidos, los anotadores designados y las
 * reglas. Todo sale de la caché (se ve sin señal con lo último que llegó) y se pone al día por tiempo real.
 *
 * Temporadas: `teams` son los equipos de la temporada de ahora (la activa o, entre temporadas, la última); los de
 * temporadas pasadas siguen en `allTeams` y `teamOf` los encuentra (sus partidos viejos los nombran). Los partidos
 * son todos: cada tabla toma los de su temporada (src/components/season/logic.ts › seasonMatches).
 */
export function useTeamLeague() {
  const ctx = useLeagueCtx();
  const { user, isSuper } = useAuth();
  const allTeams = useSeasonTeams(ctx.lid);
  const seasons = useLeagueSeasons(ctx.lid);
  const season = useMemo(() => currentSeason(seasons.data), [seasons.data]);
  const teams = useMemo(() => ({ ...allTeams, data: teamsOfSeason(allTeams.data, season, true) }), [allTeams, season]);
  const players = usePlayers(ctx.lid);
  const matches = useMatches({ lid: ctx.lid });
  const officials = useMatchOfficials(ctx.lid);
  const rules = useLeagueRules(ctx.lid);
  // Los miembros (con sus nombres y permisos) solo los ve quien es de la liga.
  const members = useLeagueMembers(ctx.member || isSuper ? ctx.lid : undefined);
  // La membresía es de la cuenta que entró: sirve igual si la sesión todavía no termina de cargar.
  const userId = user?.uid ?? ctx.member?.uid ?? null;
  const tz = ctx.league.tz || 'America/Santo_Domingo';

  const playerById = useMemo(() => new Map(players.data.map((p) => [p.id, p] as const)), [players.data]);
  const teamById = useMemo(() => new Map(allTeams.data.map((t) => [t.id, t] as const)), [allTeams.data]);
  const officialByMatch = useMemo(() => new Map(officials.data.map((o) => [o.matchId, o] as const)), [officials.data]);
  const mine = useMemo(() => myTeams(teams.data, ctx.myPlayerId), [teams.data, ctx.myPlayerId]);

  const nameOf = useCallback((playerId: string) => playerById.get(playerId)?.name ?? '(jugador borrado)', [playerById]);
  const teamOf = useCallback((teamId: string | null | undefined): SeasonTeam | null => (teamId ? (teamById.get(teamId) ?? null) : null), [teamById]);
  const officialOf = useCallback((matchId: string): MatchOfficial | null => officialByMatch.get(matchId) ?? null, [officialByMatch]);
  /** Los equipos de esa temporada: los de ahora, o los de una pasada (los suyos y los que jugaron sus partidos). */
  const teamsFor = useCallback(
    (s: Season | null | undefined): SeasonTeam[] =>
      !s || s.id === season?.id ? teams.data : pastSeasonTeams(allTeams.data, s, seasonMatches(matches.data, s, tz)),
    [teams.data, allTeams.data, matches.data, season, tz],
  );
  // Por los equipos de todas las temporadas: el capitán de un partido viejo sigue hablando por su lado.
  const speakerOf = useCallback((m: Pick<Match, 'sides'>) => speakerSide(m, allTeams.data, ctx.myPlayerId), [allTeams.data, ctx.myPlayerId]);
  /** Jersey del jugador en su equipo (o el del partido). */
  const jerseyOf = useCallback(
    (playerId: string, teamId?: string | null): number | null => {
      const t = teamId ? teamById.get(teamId) : teams.data.find((x) => x.roster.some((r) => r.playerId === playerId));
      return t?.roster.find((r) => r.playerId === playerId)?.jersey ?? null;
    },
    [teamById, teams.data],
  );

  return {
    ...ctx,
    userId,
    isSuper,
    tz,
    teams,
    allTeams,
    seasons,
    season,
    players,
    matches,
    officials,
    rules,
    members,
    myTeams: mine,
    nameOf,
    teamOf,
    teamsFor,
    officialOf,
    speakerOf,
    jerseyOf,
  };
}

export type TeamLeague = ReturnType<typeof useTeamLeague>;
