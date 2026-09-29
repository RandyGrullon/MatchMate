import { useMemo } from 'react';
import type { Season } from '../../../lib/seasons';
import { awardees, makeSnapshot, snapshotTable, withRank, type SeasonSnapshot, type SeasonTableResult } from '../../../components/season/logic';
import type { BasketballTotals } from '../../../sports/team/stats';
import type { StandingRow } from '../../../sports/types';
import { useTeamLeague } from '../team/useTeamLeague';
import { useBasketballSeason, type BasketballSeason } from './season';

/** Cuántos anotadores se guardan al cerrar. */
const TOP_SCORERS = 20;

const signed = (n: number) => (n > 0 ? `+${n}` : n);

/** La foto de la temporada de baloncesto: la tabla FIBA y los anotadores (puro, para probar). */
export function basketballSnapshot(
  season: Pick<BasketballSeason, 'standings' | 'leaders'>,
  teamName: (id: string) => string,
  playerName: (id: string) => string,
  now?: number,
): SeasonSnapshot {
  const table = snapshotTable<StandingRow>(
    { key: 'tabla', title: 'Tabla', nameLabel: 'Equipo' },
    season.standings,
    [
      { label: 'PJ', title: 'Partidos jugados', value: (r) => r.played },
      { label: 'G', title: 'Ganados', value: (r) => r.won },
      { label: 'P', title: 'Perdidos', value: (r) => r.lost },
      { label: 'PF', title: 'Puntos a favor', wide: true, value: (r) => r.for },
      { label: 'PC', title: 'Puntos en contra', wide: true, value: (r) => r.against },
      { label: 'Dif.', title: 'Diferencia', value: (r) => signed(r.diff) },
      { label: 'Pts', title: 'Puntos de la tabla', value: (r) => r.points },
    ],
    (r) => ({ name: teamName(r.id), teamId: r.id }),
  );
  const scorers = snapshotTable<BasketballTotals & { rank: number }>(
    { key: 'anotadores', title: 'Anotadores', nameLabel: 'Jugador' },
    withRank(
      season.leaders.filter((l) => l.points > 0).slice(0, TOP_SCORERS),
      (l) => l.points,
    ),
    [
      { label: 'PJ', title: 'Partidos jugados', value: (r) => r.games },
      { label: 'Prom', title: 'Promedio de puntos por partido', value: (r) => r.avg },
      { label: 'Máx', title: 'Máximo en un partido', wide: true, value: (r) => r.high },
      { label: '3P', title: 'Triples anotados', wide: true, value: (r) => r.threes },
      { label: 'PTS', title: 'Puntos', value: (r) => r.points },
    ],
    (r) => ({ name: playerName(r.player), playerId: r.player }),
  );
  return makeSnapshot('basketball', [table, scorers], now);
}

/** Admin › Temporada: la tabla de esa temporada para cerrarla (SportScreens.useSeasonTable). */
export function useBasketballSeasonTable(season: Season): SeasonTableResult {
  const tl = useTeamLeague();
  const data = useBasketballSeason(tl, season);
  const loading = (tl.matches.loading && !tl.matches.data.length) || (tl.allTeams.loading && !tl.allTeams.data.length);
  return useMemo(() => {
    const teams = tl.teamsFor(season);
    const teamName = (id: string) => tl.teamOf(id)?.name ?? '(equipo borrado)';
    return {
      loading,
      snapshot: basketballSnapshot(data, teamName, tl.nameOf),
      teams: awardees(teams.map((t) => ({ id: t.id, name: t.name }))),
      players: awardees(teams.flatMap((t) => t.roster.map((r) => ({ id: r.playerId, name: tl.nameOf(r.playerId) })))),
    };
  }, [data, season, loading, tl]);
}
