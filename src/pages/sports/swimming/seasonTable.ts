import { useMemo } from 'react';
import { usePlayers } from '../../../lib/data';
import { useSwimClubs, useSwimSeason } from '../../../lib/data/swimming';
import { useLeagueCtx } from '../../../lib/league';
import { inSeason, type Season } from '../../../lib/seasons';
import { awardees, makeSnapshot, snapshotTable, type SeasonSnapshot, type SeasonTableResult } from '../../../components/season/logic';
import { seasonTable, type SeasonClub, type SeasonTable } from './logic';

/**
 * La foto de los puntos por club de una temporada de natación (puro, para probar). Los clubes no son equipos de la
 * liga: los premios van a nadadores.
 */
export function swimSnapshot(table: Pick<SeasonTable, 'clubs' | 'meets'>, clubName: (id: string) => string, now?: number): SeasonSnapshot {
  const n = table.meets.length;
  return makeSnapshot(
    'swimming',
    [
      snapshotTable<SeasonClub>(
        { key: 'clubes', title: 'Clubes', nameLabel: 'Club', note: `Suma de ${n} ${n === 1 ? 'encuentro' : 'encuentros'}. El control de marcas no cuenta.` },
        table.clubs,
        [
          { label: 'Oro', title: 'Medallas de oro', value: (r) => r.gold },
          { label: 'Plata', title: 'Medallas de plata', value: (r) => r.silver },
          { label: 'Bronce', title: 'Medallas de bronce', wide: true, value: (r) => r.bronze },
          { label: 'Pts', title: 'Puntos', value: (r) => r.points },
        ],
        (r) => ({ name: clubName(r.clubId) }),
      ),
    ],
    now,
  );
}

/** Admin › Temporada de la natación (SportScreens.useSeasonTable). */
export function useSwimSeasonTable(season: Season): SeasonTableResult {
  const { lid } = useLeagueCtx();
  const data = useSwimSeason(lid);
  const clubs = useSwimClubs(lid);
  const players = usePlayers(lid);
  const loading = (data.loading && !data.data.meets.length) || (players.loading && !players.data.length);
  return useMemo(() => {
    const names = new Map(clubs.data.map((c) => [c.id, c.name] as const));
    const table = seasonTable(data.data, undefined, (d) => inSeason(season, d));
    return {
      loading,
      snapshot: swimSnapshot(table, (id) => names.get(id) ?? '(club borrado)'),
      teams: [],
      players: awardees(players.data.map((p) => ({ id: p.id, name: p.name }))),
    };
  }, [loading, data.data, clubs.data, players.data, season]);
}
