/**
 * Los datos de las pantallas del torneo de esports (hooks sin pantallas, para la web y la app del teléfono): el torneo
 * con sus inscritos, enlaces, series y partidas (useTournament), mis equipos de temporada (para saber mi lado en cada
 * serie) y los nombres de los inscritos.
 */
import { useMemo } from 'react';
import { useAuth } from '../../../lib/auth';
import { useMatches, type Match } from '../../../lib/data/matches';
import { myTeamRoles, useSeasonTeams } from '../../../lib/data/seasonTeams';
import {
  useBrGames,
  useEntries,
  useEsportsTournament,
  useStageLinks,
  type BrGame,
  type EsportsEntry,
  type EsportsTournament,
  type StageLink,
} from '../../../lib/data/esports';
import { useLeagueCtx } from '../../../lib/league';
import { entryBySideTeam, myEntryOf, speaksFor } from './logic';

/** Todo lo del torneo que leen sus pantallas (cada lectura con su tiempo real). */
export interface TournamentData {
  t: EsportsTournament | null;
  entries: EsportsEntry[];
  links: StageLink[];
  matches: Match[];
  br: BrGame[];
  /** Equipo de temporada → inscrito. */
  entryOf: Map<string, string>;
  byId: Map<string, EsportsEntry>;
  loading: boolean;
  error: Error | null;
}

export function useTournament(lid: string | undefined, eventId: string | undefined): TournamentData {
  const t = useEsportsTournament(eventId);
  const entries = useEntries(eventId);
  const links = useStageLinks(eventId);
  const matches = useMatches({ lid, eventId: eventId ?? null });
  const isBr = t.data?.format === 'br';
  const br = useBrGames(isBr ? eventId : undefined);
  const entryOf = useMemo(() => entryBySideTeam(entries.data), [entries.data]);
  const byId = useMemo(() => new Map(entries.data.map((e) => [e.id, e])), [entries.data]);
  return {
    t: t.data,
    entries: entries.data,
    links: links.data,
    matches: matches.data,
    br: isBr ? br.data : [],
    entryOf,
    byId,
    loading: (t.loading && !t.data) || (entries.loading && !entries.data.length),
    error: t.error ?? entries.error ?? null,
  };
}

/**
 * Mis equipos de temporada en la liga: `all` (juego en ellos) y `act` (hablo por ellos: capitán; es lo que decide la base
 * para anotar y confirmar). Por la plantilla de la liga y, en el torneo, también por la inscripción.
 */
export function useMyTeams(entries: readonly EsportsEntry[] = []): { all: Set<string>; act: Set<string> } {
  const { lid, myPlayerId } = useLeagueCtx();
  const uid = useAuth().user?.uid ?? null;
  const teams = useSeasonTeams(lid);
  return useMemo(() => {
    const roles = myTeamRoles(teams.data, myPlayerId);
    const all = new Set(roles.keys());
    const act = new Set([...roles].filter(([, r]) => r !== 'player').map(([id]) => id));
    const mine = myEntryOf(entries, uid);
    if (mine?.sideTeamId) {
      all.add(mine.sideTeamId);
      if (speaksFor(mine, uid)) act.add(mine.sideTeamId);
    }
    return { all, act };
  }, [teams.data, myPlayerId, entries, uid]);
}

/** El nombre de un inscrito por su id («Por definir» si no está). */
export function useEntryNames(entries: readonly EsportsEntry[]): (id: string | null | undefined) => string {
  return useMemo(() => {
    const names = new Map(entries.map((e) => [e.id, e.tag ? `${e.name} [${e.tag}]` : e.name]));
    return (id) => (id ? (names.get(id) ?? 'Por definir') : 'Por definir');
  }, [entries]);
}
