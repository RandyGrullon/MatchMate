import { rpc, useLive, type Live } from './client';
import { tags } from './keys';
import { useTopic } from './topics';
import { sortSeasons, type Season, type SeasonChampion } from '../seasons';

/**
 * Temporadas de la liga (20260929000700_temporadas.sql). Lecturas con la RLS de quien llama (también sin cuenta en
 * una liga pública): league_seasons (todas, con su tabla guardada, premios y playoffs) y league_champions (las
 * cerradas con su campeón). Las dos devuelven null si no se ve la liga (aquí: lista vacía).
 * Tiempo real: 'seasons' en 'league:<liga>' (src/lib/data/topics.ts invalida `seasons:<liga>`).
 */

export const seasonTags = {
  league: (lid: string) => `seasons:${lid}`,
};

export const seasonKeys = {
  list: (lid: string) => `seasons:l:${lid}`,
  champions: (lid: string) => `seasons:c:${lid}`,
};

const list = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);

export async function fetchLeagueSeasons(lid: string): Promise<Season[]> {
  const rows = list(await rpc<Season[] | null>('league_seasons', { p_league: lid }));
  return sortSeasons(rows.map((s) => ({ ...s, endsOn: s.endsOn ?? null, awards: list(s.awards), playoffs: list(s.playoffs) })));
}

export async function fetchLeagueChampions(lid: string): Promise<SeasonChampion[]> {
  return list(await rpc<SeasonChampion[] | null>('league_champions', { p_league: lid })).map((c) => ({ ...c, awards: list(c.awards) }));
}

/** Temporadas de la liga, de la más nueva a la más vieja. */
export function useLeagueSeasons(lid: string | null | undefined): Live<Season[]> {
  useTopic(lid ? `league:${lid}` : null, lid ?? null);
  return useLive<Season[]>(lid ? seasonKeys.list(lid) : null, lid ? { kind: 'seasons', lid } : null, () => fetchLeagueSeasons(lid as string), {
    initial: [],
    tags: lid ? [seasonTags.league(lid), tags.league(lid)] : [],
    staleMs: 60_000,
  });
}

/** Campeones de las temporadas cerradas, de la más nueva a la más vieja. */
export function useLeagueChampions(lid: string | null | undefined): Live<SeasonChampion[]> {
  useTopic(lid ? `league:${lid}` : null, lid ?? null);
  return useLive<SeasonChampion[]>(
    lid ? seasonKeys.champions(lid) : null,
    lid ? { kind: 'season-champions', lid } : null,
    () => fetchLeagueChampions(lid as string),
    { initial: [], tags: lid ? [seasonTags.league(lid), tags.league(lid)] : [], staleMs: 60_000 },
  );
}
