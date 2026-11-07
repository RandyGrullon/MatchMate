import { useMemo } from 'react';
import { useEvents } from '../../../lib/data';
import type { Playoff } from '../../../lib/data/playoffs';
import { useNow } from '../../../lib/useNow';
import { koEventOf, playoffComp, playoffDate, playoffProvider, teamKoComp, teamKoFinished, teamKoProvider, type TeamNames } from '../../../prizes/sports';
import { KO_WAIT_TEXT, PLAYOFF_WAIT_TEXT, teamNamesOf } from '../../../components/prizes/screens';
import { TournamentPrizes } from '../../../components/prizes/TournamentPrizes';
import type { TeamLeague } from './useTeamLeague';

// La lógica vive en src/components/prizes/screens.ts (la comparte la app); PlayoffsPage y TournamentHub la leen de aquí.
export { teamReportNames } from '../../../components/prizes/screens';

/**
 * «Premios del torneo» de los deportes de equipo (docs/premios-torneo.md §5.3): el equipo campeón (y si se quiere el
 * 2.º y el 3.º) del torneo relámpago y de cada playoff. El podio lo calcula y lo comprueba el servidor; el de aquí (la
 * misma cuenta con los partidos de la pantalla) es para «Por ahora» y el aviso «El podio cambió». Un premio de equipo
 * le llega a cada jugador de la plantilla y a quien jugó con el equipo en esos partidos.
 */

/** Un evento como lo necesita la competencia. */
export interface KoEvent {
  id: string;
  name: string;
  date: string;
}

/** Nombres de jugadores y equipos (con su plantilla) de la liga. */
function useTeamNames(tl: TeamLeague): TeamNames {
  const { nameOf, teamOf } = tl;
  return useMemo(() => teamNamesOf({ nameOf, teamOf }), [nameOf, teamOf]);
}

/**
 * El evento del torneo relámpago del «torneo sin liga»: el que creó `create_tournament` (`koEventOf`: el primero de
 * tipo torneo), se entre por el inicio o por la ruta de cualquier evento (/e/:eventId). Es el único con premio, como en
 * la base. null en una liga normal.
 */
export function useKoEvent(tl: TeamLeague): KoEvent | null {
  const standalone = tl.league.kind === 'torneo';
  const events = useEvents(standalone ? tl.lid : undefined);
  const found = standalone ? koEventOf(events.data) : null;
  const id = found?.id ?? null;
  const name = found?.name ?? '';
  const date = found?.date ?? '';
  return useMemo(() => (id ? { id, name, date } : null), [id, name, date]);
}

/** Los premios del torneo relámpago: se entregan cuando cuenta la final. */
export function KnockoutPrizes({ tl, event }: { tl: TeamLeague; event: KoEvent | null }) {
  const now = useNow(30_000).getTime();
  const names = useTeamNames(tl);
  const matches = tl.matches.data;
  const sport = tl.league.sport ?? 'football';
  const comp = useMemo(() => teamKoComp(tl.lid, { kind: tl.league.kind ?? 'liga', sport, event, leagueName: tl.league.name }), [tl.lid, tl.league.kind, sport, event, tl.league.name]);
  const podium = useMemo(() => teamKoProvider(matches, names, now), [matches, names, now]);
  if (!comp) return null;
  return <TournamentPrizes comp={comp} ready={teamKoFinished(matches, now)} waitText={KO_WAIT_TEXT} podium={podium} />;
}

/** Los premios de un playoff: se entregan cuando termina. */
export function PlayoffPrizes({ tl, playoff }: { tl: TeamLeague; playoff: Playoff }) {
  const now = useNow(60_000).getTime();
  const names = useTeamNames(tl);
  const matches = tl.matches.data;
  const sport = tl.league.sport ?? 'football';
  const date = playoffDate(playoff, matches, tl.tz, now);
  const comp = useMemo(() => playoffComp(tl.lid, playoff, sport, date), [tl.lid, playoff, sport, date]);
  const podium = useMemo(() => playoffProvider(playoff, matches, names), [playoff, matches, names]);
  return <TournamentPrizes comp={comp} ready={playoff.status === 'finished'} waitText={PLAYOFF_WAIT_TEXT} podium={podium} />;
}
