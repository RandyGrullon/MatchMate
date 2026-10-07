import { useMemo } from 'react';
import { rankingRows, seasonEvents } from '../../lib/bowlingSeason';
import { useEntriesOfEvents, useEvents, usePlayers } from '../../lib/data';
import { useLeagueSeasons } from '../../lib/data/seasons';
import { currentSeason } from '../../lib/seasons';
import { Skeleton, StatDuo } from '../ui';
import { myStanding, standingLabel, type Standing } from './logic';

/**
 * Tu promedio y tu lugar en la tabla de la temporada de una liga de boliche, como los calcula la Tabla (solo juegos
 * aprobados, mínimo de juegos para entrar). Lee lo mismo que la Tabla (eventos, jugadores, temporadas y participaciones
 * de la temporada): al abrirla ya está en el teléfono.
 */
export function useMyStanding(lid: string | null, playerId: string | null): { standing: Standing | null; loading: boolean } {
  const events = useEvents(lid ?? undefined);
  const players = usePlayers(lid ?? undefined);
  const seasons = useLeagueSeasons(lid);
  const season = currentSeason(seasons.data);
  const ids = useMemo(() => seasonEvents(events.data, season).map((e) => e.id), [events.data, season]);
  const entries = useEntriesOfEvents(lid ?? undefined, ids);
  const standing = useMemo(() => {
    if (!lid || !playerId) return null;
    const inSeason = new Set(ids);
    return myStanding(rankingRows(entries.data.filter((e) => inSeason.has(e.eventId)), players.data), playerId);
  }, [lid, playerId, ids, entries.data, players.data]);
  const loading = !!lid && (events.loading || players.loading || (seasons.loading && !seasons.data.length) || (entries.loading && !entries.data.length));
  return { standing, loading };
}

/**
 * «195 Tu promedio | 2.º en la tabla, de 6 ›»: la mitad del lugar abre la Tabla de la liga (1 toque). Sin juegos todavía,
 * «—»; si aún no entra en la tabla, cuántos juegos le faltan.
 */
export function HomeStats({ lid, playerId, leagueName, className }: { lid: string; playerId: string; leagueName: string; className?: string }) {
  const { standing, loading } = useMyStanding(lid, playerId);
  if (loading && !standing?.average) return <Skeleton className={`h-[112px] rounded-3xl ${className ?? ''}`} />;
  if (!standing) return null;
  const pos = standing.pos != null ? `${standing.pos}.º` : '—';
  return (
    <StatDuo
      className={className}
      left={{ value: standing.average ?? '—', label: 'Tu promedio' }}
      right={{
        value: pos,
        label: standingLabel(standing),
        to: `/l/${lid}/ranking`,
        ariaLabel:
          standing.pos != null
            ? `Tabla de ${leagueName}: vas ${standing.pos}.º de ${standing.of}`
            : `Tabla de ${leagueName}: ${standingLabel(standing)} para entrar`,
      }}
    />
  );
}
