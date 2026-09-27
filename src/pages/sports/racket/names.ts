import { useMemo } from 'react';
import { usePlayers } from '../../../lib/data';
import { useSeasonTeams, type SeasonTeam } from '../../../lib/data/seasonTeams';
import { useLeagueCtx } from '../../../lib/league';
import type { Player } from '../../../lib/types';
import type { ScheduleEntrant } from './logic/league';

/**
 * Nombres de jugadores y parejas de la liga para las pantallas de raqueta (una sola lectura de cada lista).
 * Un id de lado puede ser una pareja (equipo de temporada), un jugador o `p:<id>+<id>` (lado sin pareja).
 */
export interface Names {
  players: Player[];
  teams: SeasonTeam[];
  loading: boolean;
  nameOf: (playerId: string) => string;
  /** Pareja, jugador o `p:a+b` → nombre. */
  entrantName: (id: string) => string;
  team: (id: string) => SeasonTeam | undefined;
  rosterOf: (teamId: string) => string[];
  /** Pareja o jugador → lo que va en el calendario (jugadores de la pareja). */
  entrant: (id: string) => ScheduleEntrant;
  entrants: (ids: readonly string[]) => Map<string, ScheduleEntrant>;
  /** Parejas donde juega el jugador. */
  teamsOf: (playerId: string | null | undefined) => string[];
}

export function useNames(): Names {
  const { lid } = useLeagueCtx();
  const players = usePlayers(lid);
  const teams = useSeasonTeams(lid);
  return useMemo(() => {
    const pm = new Map(players.data.map((p) => [p.id, p] as const));
    const tm = new Map(teams.data.map((t) => [t.id, t] as const));
    const nameOf = (id: string) => pm.get(id)?.name ?? '(jugador borrado)';
    const rosterOf = (teamId: string) => (tm.get(teamId)?.roster ?? []).map((r) => r.playerId);
    const entrantName = (id: string) => {
      const t = tm.get(id);
      if (t) return t.name;
      if (id.startsWith('p:')) return id.slice(2).split('+').map(nameOf).join(' / ');
      return pm.has(id) ? nameOf(id) : '(borrado)';
    };
    const entrant = (id: string): ScheduleEntrant => (tm.has(id) ? { id, players: rosterOf(id).slice(0, 2), team: true } : { id, players: [id], team: false });
    return {
      players: players.data,
      teams: teams.data,
      loading: players.loading || teams.loading,
      nameOf,
      entrantName,
      team: (id) => tm.get(id),
      rosterOf,
      entrant,
      entrants: (ids) => new Map(ids.map((id) => [id, entrant(id)] as const)),
      teamsOf: (pid) => (pid ? teams.data.filter((t) => t.roster.some((r) => r.playerId === pid)).map((t) => t.id) : []),
    };
  }, [players.data, players.loading, teams.data, teams.loading]);
}
