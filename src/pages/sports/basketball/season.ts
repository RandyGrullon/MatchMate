import { useMemo } from 'react';
import { finalMatches, type Match } from '../../../lib/data/matches';
import { useNow } from '../../../lib/useNow';
import { basketballStandings, type TeamMatchResult } from '../../../sports/team/standings';
import { basketballTotals, type BasketballTotals } from '../../../sports/team/stats';
import type { StandingRow } from '../../../sports/types';
import type { TeamLeague } from '../team/useTeamLeague';
import { matchResultOf, seasonLines, type SeasonLine } from './adapter';
import { basketballTableFrom } from './rules';

export interface BasketballSeason {
  /** Tabla FIBA (ganar 2, perder 1, forfeit 0, default 1; desempates del Apéndice D). */
  standings: StandingRow[];
  /** Anotadores: puntos, promedio, máximo, triples, tiros libres, faltas y partidos jugados (presentes). */
  leaders: BasketballTotals[];
  /** Cada jugador en cada partido que cuenta. */
  lines: SeasonLine[];
  results: TeamMatchResult[];
}

/**
 * La temporada calculada en el teléfono con los partidos que cuentan (confirmados, W.O. o propuestos hace 48 h):
 * la tabla con src/sports/team/standings y los anotadores con src/sports/team/stats. Solo partidos entre equipos
 * de la temporada.
 */
export function basketballSeason(matches: readonly Match[], teamIds: readonly string[], rules: unknown, now: number): BasketballSeason {
  const known = new Set(teamIds);
  const between = matches.filter((m) => m.sides.every((s) => s.teamId && known.has(s.teamId)));
  const results = finalMatches(between, now)
    .map(matchResultOf)
    .filter((r): r is TeamMatchResult => r !== null);
  const lines = seasonLines(between, now);
  return {
    standings: basketballStandings(teamIds, results, basketballTableFrom(rules)),
    leaders: basketballTotals(lines),
    lines,
    results,
  };
}

export function useBasketballSeason(tl: TeamLeague): BasketballSeason {
  const now = useNow(5 * 60_000).getTime();
  const teamIds = tl.teams.data.map((t) => t.id);
  const key = teamIds.join();
  return useMemo(
    () => basketballSeason(tl.matches.data, key ? key.split(',') : [], tl.rules.data, now),
    [tl.matches.data, key, tl.rules.data, now],
  );
}
