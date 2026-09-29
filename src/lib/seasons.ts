/**
 * Temporadas de una liga (20260929000700_temporadas.sql): public.seasons, leídas con league_seasons. Como mucho
 * una activa por liga; las cerradas guardan su tabla final y sus premios.
 *
 * De qué temporada es un juego: la que contiene su día (evento: events.date; partido: scheduledAt, o createdAt si
 * no tiene hora, en la zona de la liga): starts_on <= día y (está activa, no tiene fin, o día <= ends_on). La activa
 * no tiene fin para contar juegos: su ends_on es solo el fin previsto. Si dos cumplen, la que empezó más tarde.
 */

export type SeasonStatus = 'active' | 'closed';

export type AwardKind = 'campeon' | 'subcampeon' | 'tercero' | 'mvp' | 'mas_mejorado' | 'fair_play' | 'otro';

export interface SeasonAward {
  id: string;
  kind: AwardKind;
  /** Lo que se muestra: «Campeón», «MVP»… o el nombre del premio 'otro'. */
  label: string;
  /** Nombre del jugador o equipo (copiado al cerrar). */
  name: string;
  playerId: string | null;
  teamId: string | null;
  note: string | null;
}

export interface SeasonTeamRef {
  teamId: string;
  name: string;
}

export interface SeasonPlayoff {
  id: string;
  name: string;
  status: 'active' | 'finished';
  champion: SeasonTeamRef | null;
  runnerUp: SeasonTeamRef | null;
  semifinalists: SeasonTeamRef[];
}

export interface Season {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  startsOn: string;
  /** Fin previsto (activa) o día del cierre (cerrada); null = sin fecha. */
  endsOn: string | null;
  status: SeasonStatus;
  closedAt: string | null;
  closedBy: string | null;
  /** Tabla final que guardó el teléfono al cerrarla (tal cual; null si sigue activa). */
  standings: unknown;
  awards: SeasonAward[];
  playoffs: SeasonPlayoff[];
}

/** Campeón (y premios) de una temporada cerrada (league_champions). */
export interface SeasonChampion {
  seasonId: string;
  name: string;
  startsOn: string;
  endsOn: string | null;
  closedAt: string | null;
  champion: { label: string; name: string; playerId: string | null; teamId: string | null } | null;
  awards: Omit<SeasonAward, 'id'>[];
}

type SeasonRange = Pick<Season, 'startsOn' | 'endsOn' | 'status'>;

/** El día (YYYY-MM-DD) cae en la temporada. */
export function inSeason(season: SeasonRange, day: string): boolean {
  if (!day || day < season.startsOn) return false;
  return season.status === 'active' || !season.endsOn || day <= season.endsOn;
}

/** De la más nueva a la más vieja (como las manda league_seasons). */
export const sortSeasons = <T extends Pick<Season, 'startsOn'>>(list: readonly T[]): T[] =>
  [...list].sort((a, b) => (a.startsOn < b.startsOn ? 1 : a.startsOn > b.startsOn ? -1 : 0));

/** La temporada de ese día (null si ninguna lo contiene). */
export function seasonOfDay<T extends SeasonRange>(seasons: readonly T[], day: string): T | null {
  return sortSeasons(seasons).find((s) => inSeason(s, day)) ?? null;
}

/** La temporada de ahora: la activa o, entre temporadas, la última. */
export function currentSeason<T extends SeasonRange>(seasons: readonly T[]): T | null {
  return seasons.find((s) => s.status === 'active') ?? sortSeasons(seasons)[0] ?? null;
}

/** La que empezó justo antes de esa (null si es la primera). */
export function previousSeason<T extends SeasonRange & { id: string }>(seasons: readonly T[], season: T | null | undefined): T | null {
  if (!season) return null;
  return sortSeasons(seasons).find((s) => s.id !== season.id && s.startsOn < season.startsOn) ?? null;
}

/** La elegida por id (p. ej. ?temporada= de la dirección) o, si no está, la de ahora. */
export function pickSeason<T extends SeasonRange & { id: string }>(seasons: readonly T[], id: string | null | undefined): T | null {
  return (id ? seasons.find((s) => s.id === id) : undefined) ?? currentSeason(seasons);
}

/** Solo lo de esa temporada, según el día de cada cosa (null = sin temporada: todo). */
export function filterBySeason<T>(items: readonly T[], season: SeasonRange | null | undefined, day: (item: T) => string): T[] {
  return season ? items.filter((it) => inSeason(season, day(it))) : [...items];
}
