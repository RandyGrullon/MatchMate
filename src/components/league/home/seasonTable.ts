import { useMemo, useRef } from 'react';
import { rankingRows, seasonEvents, type RankingRow } from '../../../lib/bowlingSeason';
import { useEntriesOfEvents, useEvents, usePlayers } from '../../../lib/data';
import { useLeagueSeasons } from '../../../lib/data/seasons';
import { useLeagueCtx } from '../../../lib/league';
import { currentSeason } from '../../../lib/seasons';

/**
 * La tabla de la temporada de ahora (como la Tabla: solo juegos aprobados), para los 3 de arriba. Si cambian los eventos
 * de la temporada (se creó la próxima práctica), sigue la tabla de antes mientras se leen los juegos: no parpadea.
 */
export function useSeasonTable(): { rows: RankingRow[]; loading: boolean } {
  const { lid } = useLeagueCtx();
  const events = useEvents(lid);
  const players = usePlayers(lid);
  const seasons = useLeagueSeasons(lid);
  const season = currentSeason(seasons.data);
  const ids = useMemo(() => seasonEvents(events.data, season).map((e) => e.id), [events.data, season]);
  const entries = useEntriesOfEvents(lid, ids);
  const rows = useMemo(() => {
    const inSeason = new Set(ids);
    return rankingRows(
      entries.data.filter((e) => inSeason.has(e.eventId)),
      players.data,
    );
  }, [ids, entries.data, players.data]);
  const loading = events.loading || players.loading || (seasons.loading && !seasons.data.length) || (entries.loading && !entries.data.length);
  const last = useRef<RankingRow[]>([]);
  if (rows.length || !loading) last.current = rows;
  return { rows: rows.length || !loading ? rows : last.current, loading };
}
