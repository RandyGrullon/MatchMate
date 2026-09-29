import { useMemo } from 'react';
import { mostImproved, totalsByPlayer } from '../../lib/bowlingSeason';
import { useEntriesOfEvents, useEvents, usePlayers } from '../../lib/data';
import { useLeagueSeasons } from '../../lib/data/seasons';
import { useLeagueCtx } from '../../lib/league';
import { inSeason, previousSeason, type Season } from '../../lib/seasons';
import { MIN_RANK_GAMES, playerStats, rank } from '../../lib/stats';
import type { Entry, Player } from '../../lib/types';
import { awardees, makeSnapshot, playerRef, snapshotTable, type SeasonSnapshot, type SeasonTableResult, type SuggestedAwards } from './logic';

/** Cuántos se guardan en «Mejor juego». */
const TOP_GAMES = 20;

interface BowlingRow {
  playerId: string;
  name: string;
  games: number;
  average: number;
  high: number;
  series: number;
}

/**
 * La foto de una temporada de boliche para cerrarla (puro, para probar): el promedio de los que llegaron al mínimo
 * de juegos de la liga y el mejor juego, con los juegos verificados de esa temporada (como el ranking).
 */
export function bowlingSnapshot(entries: readonly Entry[], players: readonly Pick<Player, 'id' | 'name'>[], now?: number, minGames = MIN_RANK_GAMES): SeasonSnapshot {
  const names = new Map(players.map((p) => [p.id, p.name] as const));
  const byPlayer = new Map<string, Entry[]>();
  for (const e of entries) if (names.has(e.playerId)) byPlayer.set(e.playerId, [...(byPlayer.get(e.playerId) ?? []), e]);
  const rows: BowlingRow[] = [...byPlayer.entries()]
    .map(([id, list]) => {
      const s = playerStats(list);
      return { playerId: id, name: names.get(id)!, games: s.games, average: s.autoAverage ?? 0, high: s.high, series: s.highSeries };
    })
    .filter((r) => r.games > 0);
  const byAverage = rank(
    rows.filter((r) => r.games >= minGames),
    (r) => r.average,
  ).map(({ row, pos }) => ({ ...row, rank: pos }));
  const byHigh = rank(rows, (r) => r.high)
    .slice(0, TOP_GAMES)
    .map(({ row, pos }) => ({ ...row, rank: pos }));
  const who = (r: BowlingRow) => ({ name: r.name, playerId: r.playerId });
  return makeSnapshot(
    'bowling',
    [
      snapshotTable(
        { key: 'promedio', title: 'Promedio', nameLabel: 'Jugador', note: `Con ${minGames} juegos verificados o más en la temporada.` },
        byAverage,
        [
          { label: 'Juegos', title: 'Juegos verificados', value: (r) => r.games },
          { label: 'Máx', title: 'Mejor juego', wide: true, value: (r) => r.high },
          { label: 'Prom.', title: 'Promedio', value: (r) => r.average },
        ],
        who,
      ),
      snapshotTable(
        { key: 'juego', title: 'Mejor juego', nameLabel: 'Jugador' },
        byHigh,
        [
          { label: 'Juegos', title: 'Juegos verificados', value: (r) => r.games },
          { label: 'Serie', title: 'Mejor serie de 3', wide: true, value: (r) => r.series },
          { label: 'Juego', title: 'Mejor juego', value: (r) => r.high },
        ],
        who,
      ),
    ],
    now,
  );
}

/**
 * Premios que se proponen al cerrar la temporada de boliche (puro, para probar): el más mejorado (el que más subió
 * su promedio contra la temporada anterior, con el mínimo de juegos en las dos; como la tarjeta del ranking).
 */
export function bowlingSuggested(
  current: readonly Entry[],
  previous: readonly Entry[],
  players: readonly Pick<Player, 'id'>[],
  minGames = MIN_RANK_GAMES,
): SuggestedAwards {
  const known = new Set(players.map((p) => p.id));
  const best = mostImproved(totalsByPlayer(current), totalsByPlayer(previous), minGames).find((u) => known.has(u.playerId));
  return best ? { mas_mejorado: playerRef(best.playerId) } : {};
}

/**
 * Admin › Temporada del boliche: la tabla de esa temporada (sus eventos por fecha) para cerrarla, y el más mejorado
 * contra la temporada anterior.
 */
export function useBowlingSeasonTable(season: Season): SeasonTableResult {
  const { lid } = useLeagueCtx();
  const events = useEvents(lid);
  const players = usePlayers(lid);
  const seasons = useLeagueSeasons(lid);
  const prev = useMemo(() => previousSeason(seasons.data, season), [seasons.data, season]);
  const ids = useMemo(() => events.data.filter((e) => inSeason(season, e.date)).map((e) => e.id), [events.data, season]);
  const prevIds = useMemo(() => (prev ? events.data.filter((e) => inSeason(prev, e.date)).map((e) => e.id) : []), [events.data, prev]);
  const entries = useEntriesOfEvents(lid, useMemo(() => [...ids, ...prevIds], [ids, prevIds]));
  const loading =
    (events.loading && !events.data.length) ||
    (players.loading && !players.data.length) ||
    (seasons.loading && !seasons.data.length) ||
    (entries.loading && !entries.data.length && ids.length + prevIds.length > 0);
  return useMemo(() => {
    const inCurrent = new Set(ids);
    const inPrev = new Set(prevIds);
    const current = entries.data.filter((e) => inCurrent.has(e.eventId));
    return {
      loading,
      snapshot: bowlingSnapshot(current, players.data),
      teams: [],
      players: awardees(players.data.map((p) => ({ id: p.id, name: p.name }))),
      suggested: prev ? bowlingSuggested(current, entries.data.filter((e) => inPrev.has(e.eventId)), players.data) : {},
    };
  }, [loading, entries.data, players.data, ids, prevIds, prev]);
}
