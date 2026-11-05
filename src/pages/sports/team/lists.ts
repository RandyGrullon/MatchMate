import { compareMatches, hasResult, isOpen, type Match } from '../../../lib/data/matches';
import { roundLabel } from '../../../components/match/format';
import { upcomingFor } from './logic';
import type { TeamLeague } from './useTeamLeague';

/** Las listas de partidos de una liga de equipos (TeamHome.tsx y GamesList.tsx en la web; la app del teléfono). */

/** Lo que se muestra de los partidos en el inicio (puro): el mío que sigue, lo en vivo, los próximos y los últimos resultados. */
export function homeMatches(matches: readonly Match[], myTeamIds: readonly string[], now: number, opts: { upcoming?: number; results?: number } = {}) {
  const live = matches.filter((m) => m.status === 'live' || m.status === 'suspended');
  const next = upcomingFor(matches, myTeamIds, now).find((m) => m.status === 'scheduled' || m.status === 'postponed') ?? null;
  const upcoming = matches
    .filter((m) => (isOpen(m) || m.status === 'postponed') && m.status !== 'live' && m.status !== 'suspended' && m.id !== next?.id)
    .sort(compareMatches)
    .slice(0, opts.upcoming ?? 4);
  const results = matches
    .filter((m) => hasResult(m))
    .sort((a, b) => compareMatches(b, a))
    .slice(0, opts.results ?? 3);
  return { live, next, upcoming, results };
}

export type GamesFilter = 'proximos' | 'resultados' | 'mios';

/** Qué partidos van en cada opción: por jugar (programados y aplazados), lo ya jugado (con resultado o anulado) y los de mi equipo. */
export function filterGames(all: readonly Match[], filter: GamesFilter, myTeamIds: readonly string[]): Match[] {
  switch (filter) {
    case 'proximos':
      return all.filter((m) => m.status === 'scheduled' || m.status === 'postponed');
    case 'resultados':
      return all.filter((m) => hasResult(m) || m.status === 'void');
    case 'mios':
      return all.filter((m) => m.sides.some((s) => s.teamId && myTeamIds.includes(s.teamId)));
  }
}

/** La opción de entrada: lo que viene; si ya no queda nada por jugar, los resultados. */
export function defaultGamesFilter(all: readonly Match[]): GamesFilter {
  return all.some((m) => m.status === 'scheduled' || m.status === 'postponed') ? 'proximos' : 'resultados';
}

/** Los nombres de los dos lados (el equipo de ahora; si se borró, el que se copió en el partido). */
export function sideNames(tl: Pick<TeamLeague, 'teamOf'>, m: Pick<Match, 'sides'>): [string, string] {
  return [tl.teamOf(m.sides[0].teamId)?.name ?? (m.sides[0].label || 'Por definir'), tl.teamOf(m.sides[1].teamId)?.name ?? (m.sides[1].label || 'Por definir')];
}

/** El título de la pantalla de un partido: «Jornada 3», la fase («Final», «Amistoso») o «Partido». */
export const matchHeading = (m: Pick<Match, 'stage' | 'round'>, roundWord = 'Jornada') => m.stage || roundLabel(m.round, roundWord) || 'Partido';

/** ¿Todavía se puede cambiar la convocatoria? (programado, aplazado, en vivo o suspendido) */
export const editableRsvp = (m: Pick<Match, 'status'>) => m.status === 'scheduled' || m.status === 'postponed' || m.status === 'live' || m.status === 'suspended';
