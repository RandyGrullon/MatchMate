import type { SeasonSnapshot } from '../../components/season/logic';
import { invalidate, rpc } from './client';
import { tags } from './keys';
import { seasonTeamTag } from './matches';
import { seasonTags } from './seasons';

/**
 * Admin de las temporadas (20260929000700_temporadas.sql): cerrar la temporada con su tabla final y sus premios
 * (close_season, que también avisa a la liga) y empezar la siguiente (start_season). Con señal: son pocas y las
 * decide el admin. Las lecturas están en ./seasons.
 */

/** Premio para close_season: a un jugador o a un equipo de la liga; `label` solo para 'otro'. */
export interface AwardArg {
  kind: string;
  label?: string;
  player_id?: string;
  team_id?: string;
  note?: string;
}

/**
 * Cierra la temporada con la tabla final que se ve en el teléfono y los premios. La primera vez avisa a la liga
 * («Terminó <temporada>: campeón <nombre>»); si ya estaba cerrada, solo cambia la tabla y los premios.
 */
export async function closeSeason(lid: string, seasonId: string, standings: SeasonSnapshot, awards: readonly AwardArg[]) {
  await rpc('close_season', { p_season: seasonId, p_standings: standings, p_awards: [...awards] });
  invalidate(seasonTags.league(lid), `announcements:${lid}`);
}

export interface StartSeasonInput {
  name: string;
  /** 'YYYY-MM-DD' */
  startsOn: string;
  /** Fin previsto ('' o null = sin fecha). */
  endsOn?: string | null;
  /** Ligas de equipos: copia los equipos de la temporada anterior con su plantilla. */
  copyTeams?: boolean;
}

/**
 * Empieza la temporada nueva (la anterior tiene que estar cerrada). Pone sus fechas en la liga y, si se pide, copia
 * los equipos. Devuelve el id.
 */
export async function startSeason(lid: string, input: StartSeasonInput): Promise<string> {
  const id = await rpc<string>('start_season', {
    p_league: lid,
    p_name: input.name.trim(),
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn || null,
    p_copy_teams: !!input.copyTeams,
  });
  // La liga cambia de fechas (y de equipos si se copiaron).
  invalidate(seasonTags.league(lid), tags.league(lid), tags.leagues, seasonTeamTag(lid));
  return id;
}
