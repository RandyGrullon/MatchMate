import { useMemo } from 'react';
import { useEvents, usePlayers } from '../../../lib/data';
import { useGolfRounds, useGolfRules, useGolfSeason } from '../../../lib/data/golf';
import { useLeagueCtx } from '../../../lib/league';
import { inSeason, type Season } from '../../../lib/seasons';
import { awardees, makeSnapshot, snapshotTable, type SeasonSnapshot, type SeasonTableResult } from '../../../components/season/logic';
import type { MeritRow } from '../../../sports/golf/leaderboard';
import { meritEvents, seasonMerit } from './logic';

/** Dentro de las fechas de la liga (sin fechas = todo): lo de antes de las temporadas. */
export const inSeasonDate = (league: { seasonStart?: string; seasonEnd?: string }, date: string | undefined) =>
  !!date && (!league.seasonStart || date >= league.seasonStart) && (!league.seasonEnd || date <= league.seasonEnd);

/**
 * Qué rondas (por evento) entran en el orden de mérito: las de las fechas de la temporada (`dates`: evento → día);
 * sin temporada, las de las fechas de la liga.
 */
export function golfSeasonFilter(
  season: Pick<Season, 'startsOn' | 'endsOn' | 'status'> | null,
  league: { seasonStart?: string; seasonEnd?: string },
  dates: ReadonlyMap<string, string>,
): (eventId: string) => boolean {
  return (id) => {
    const day = dates.get(id);
    return season ? !!day && inSeason(season, day) : inSeasonDate(league, day);
  };
}

/**
 * El orden de mérito de una temporada del golf: las rondas cerradas de sus fechas (sin temporadas, las fechas de la
 * liga, como siempre). Lo usan la pantalla Orden de mérito y Admin › Temporada.
 */
export function useGolfMerit(season: Season | null) {
  const { lid, league } = useLeagueCtx();
  const data = useGolfSeason(lid);
  const rounds = useGolfRounds(lid);
  const rules = useGolfRules(lid);
  const events = useEvents(lid);
  const players = usePlayers(lid);
  const { merit, counted } = useMemo(() => {
    const within = golfSeasonFilter(season, league, new Map(events.data.map((e) => [e.id, e.date] as const)));
    const evs = meritEvents(data.data, rounds.data, within);
    return { merit: seasonMerit(evs, rules.data.meritPoints), counted: evs };
  }, [data.data, rounds.data, rules.data, events.data, league, season]);
  return { season: data, rounds, rules, events, players, merit, counted };
}

/** La foto del orden de mérito (puro, para probar). */
export function golfSnapshot(merit: readonly MeritRow[], nameOf: (id: string) => string, events: number, now?: number): SeasonSnapshot {
  return makeSnapshot(
    'golf',
    [
      snapshotTable(
        { key: 'merito', title: 'Orden de mérito', nameLabel: 'Jugador', note: `Puntos por puesto en cada ronda cerrada (${events} ${events === 1 ? 'evento' : 'eventos'}).` },
        merit,
        [
          { label: 'Jugó', title: 'Eventos jugados', value: (r) => r.events },
          { label: 'Ganó', title: 'Eventos ganados', value: (r) => r.wins },
          { label: 'Mejor', title: 'Mejor puesto', wide: true, value: (r) => r.best ?? '–' },
          { label: 'Puntos', title: 'Puntos del orden de mérito', value: (r) => r.points },
        ],
        (r) => ({ name: nameOf(r.id), playerId: r.id }),
      ),
    ],
    now,
  );
}

/** Admin › Temporada del golf (SportScreens.useSeasonTable). */
export function useGolfSeasonTable(season: Season): SeasonTableResult {
  const m = useGolfMerit(season);
  const loading = (m.season.loading && !m.season.data.rounds.length) || (m.players.loading && !m.players.data.length);
  return useMemo(() => {
    const names = new Map(m.players.data.map((p) => [p.id, p.name] as const));
    return {
      loading,
      snapshot: golfSnapshot(m.merit, (id) => names.get(id) ?? '(jugador borrado)', m.counted.length),
      teams: [],
      players: awardees(m.players.data.map((p) => ({ id: p.id, name: p.name }))),
    };
  }, [loading, m.merit, m.counted, m.players.data]);
}
