import { invalidate, rpc, select, useLive, type Live } from './client';
import { tags } from './keys';
import { matchTags } from './matches';
import { useTopic } from './topics';

/**
 * Playoffs de las ligas de equipos (baloncesto, fútbol y sala; 20260929000700_temporadas.sql): public.playoffs (uno
 * activo por temporada) y public.playoff_series (la llave: ronda, lugar, los dos equipos con su siembra, al mejor
 * de 1/3/5/7, victorias, ganador y a qué serie pasa). Los juegos son partidos normales con `seriesId`; la base
 * cuenta las victorias, programa el siguiente juego y pasa al ganador cuando un juego queda con resultado que
 * cuenta. Tiempo real: 'playoffs' en 'league:<liga>' (src/lib/data/topics.ts invalida `playoffs:<liga>`).
 */

export type PlayoffStatus = 'active' | 'finished';

export interface PlayoffSeries {
  id: string;
  playoffId: string;
  round: number;
  /** Lugar dentro de la ronda, desde 1. */
  slot: number;
  bestOf: number;
  teamA: string | null;
  teamB: string | null;
  seedA: number | null;
  seedB: number | null;
  /** Nombres copiados (la llave se sigue leyendo si se borra un equipo). */
  labelA: string | null;
  labelB: string | null;
  winsA: number;
  winsB: number;
  winner: string | null;
  /** Pase directo: gana sin jugar. */
  bye: boolean;
  nextSeries: string | null;
  nextSide: 'a' | 'b' | null;
}

export interface Playoff {
  id: string;
  leagueId: string;
  seasonId: string;
  name: string;
  status: PlayoffStatus;
  /** Al mejor de cuántos juegos cada ronda (de la primera a la final). */
  bestOf: number[];
  /** Equipos en orden de siembra (1.º = el mejor). */
  seeds: string[];
  /** Campeón: el ganador de la final. */
  winner: string | null;
  createdAt: string | null;
  /** Por ronda y lugar. */
  series: PlayoffSeries[];
}

export interface PlayoffRow {
  id: string;
  league_id: string;
  season_id: string;
  name: string;
  status: PlayoffStatus;
  best_of: number[] | null;
  seeds: string[] | null;
  winner: string | null;
  created_at: string | null;
}

export interface PlayoffSeriesRow {
  id: string;
  playoff_id: string;
  round: number;
  slot: number;
  best_of: number;
  team_a: string | null;
  team_b: string | null;
  seed_a: number | null;
  seed_b: number | null;
  label_a: string | null;
  label_b: string | null;
  wins_a: number;
  wins_b: number;
  winner: string | null;
  bye: boolean;
  next_series: string | null;
  next_side: 'a' | 'b' | null;
}

const nums = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : []);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export const toPlayoffSeries = (r: PlayoffSeriesRow): PlayoffSeries => ({
  id: r.id,
  playoffId: r.playoff_id,
  round: Number(r.round),
  slot: Number(r.slot),
  bestOf: Number(r.best_of),
  teamA: r.team_a ?? null,
  teamB: r.team_b ?? null,
  seedA: r.seed_a ?? null,
  seedB: r.seed_b ?? null,
  labelA: r.label_a ?? null,
  labelB: r.label_b ?? null,
  winsA: Number(r.wins_a) || 0,
  winsB: Number(r.wins_b) || 0,
  winner: r.winner ?? null,
  bye: !!r.bye,
  nextSeries: r.next_series ?? null,
  nextSide: r.next_side === 'a' || r.next_side === 'b' ? r.next_side : null,
});

/** Filas de la base → playoffs de la app (el más nuevo primero; sus series por ronda y lugar). */
export function toPlayoffs(rows: readonly PlayoffRow[], series: readonly PlayoffSeriesRow[]): Playoff[] {
  return rows
    .map(
      (r): Playoff => ({
        id: r.id,
        leagueId: r.league_id,
        seasonId: r.season_id,
        name: r.name,
        status: r.status === 'finished' ? 'finished' : 'active',
        bestOf: nums(r.best_of),
        seeds: strs(r.seeds),
        winner: r.winner ?? null,
        createdAt: r.created_at ?? null,
        series: series
          .filter((s) => s.playoff_id === r.id)
          .map(toPlayoffSeries)
          .sort((a, b) => a.round - b.round || a.slot - b.slot),
      }),
    )
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.id.localeCompare(b.id));
}

export const playoffTags = {
  league: (lid: string) => `playoffs:${lid}`,
};

export const playoffKeys = {
  league: (lid: string) => `playoffs:l:${lid}`,
};

export async function fetchPlayoffs(lid: string): Promise<Playoff[]> {
  const byLeague = { col: 'league_id', op: 'eq' as const, value: lid };
  const [rows, series] = await Promise.all([
    select<PlayoffRow>({ table: 'playoffs', columns: 'id,league_id,season_id,name,status,best_of,seeds,winner,created_at', filters: [byLeague] }),
    select<PlayoffSeriesRow>({
      table: 'playoff_series',
      columns: 'id,playoff_id,round,slot,best_of,team_a,team_b,seed_a,seed_b,label_a,label_b,wins_a,wins_b,winner,bye,next_series,next_side',
      filters: [byLeague],
    }),
  ]);
  return toPlayoffs(rows, series);
}

/** Los playoffs de la liga con sus llaves (en vivo mientras la pantalla está abierta). */
export function usePlayoffs(lid: string | null | undefined): Live<Playoff[]> {
  useTopic(lid ? `league:${lid}` : null, lid ?? null);
  return useLive<Playoff[]>(lid ? playoffKeys.league(lid) : null, lid ? { kind: 'playoffs', lid } : null, () => fetchPlayoffs(lid as string), {
    initial: [],
    tags: lid ? [playoffTags.league(lid), tags.league(lid)] : [],
  });
}

// ---------- Escrituras (admin, con señal) ----------

const afterPlayoffs = (lid: string) => invalidate(playoffTags.league(lid), matchTags.league(lid), matchTags.mine);

/**
 * Admin: arma el playoff de la temporada activa. `teams` en orden de siembra (el mejor primero, de 2 a 32);
 * `bestOf` = al mejor de 1, 3, 5 o 7, uno por ronda (de la primera a la final). Programa el juego 1 de cada serie
 * (sin fecha: la pone el admin). Devuelve el id.
 */
export async function createPlayoffs(lid: string, seasonId: string, teams: readonly string[], bestOf: readonly number[]): Promise<string> {
  const id = await rpc<string>('create_playoffs', { p_league: lid, p_season: seasonId, p_teams: [...teams], p_best_of: [...bestOf] });
  afterPlayoffs(lid);
  return id;
}

/** Admin: borra el playoff (los juegos sin empezar se borran; los jugados se quedan sin serie). */
export async function deletePlayoffs(lid: string, id: string) {
  await rpc('delete_playoffs', { p_playoff: id });
  afterPlayoffs(lid);
}

/**
 * Pone al día la llave con lo que pasó sin escritura (un resultado propuesto que a las 48 h ya cuenta, un juego
 * borrado). Cualquiera que ve la liga, con sesión. Devuelve cuántas series cambiaron.
 */
export async function syncPlayoffs(lid: string, id: string): Promise<number> {
  const n = Number(await rpc<number>('sync_playoffs', { p_playoff: id })) || 0;
  if (n > 0) afterPlayoffs(lid);
  return n;
}
