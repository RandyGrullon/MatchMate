import { useMemo } from 'react';
import { seededRandom, shuffle, type Seed } from '../../sports/formats/random';
import { DEFAULT_CUTS, balancedTeams, category } from '../stats';
import type { Player } from '../types';
import { invalidate, queryClient, rpc, select, useLive, type Live } from './client';
import { tags } from './keys';
import { usePlayers } from './players';

/**
 * Equipos fijos de una liga de boliche (docs/boliche-equipos-practicas-bolas.md §1): filas de `teams` con
 * `event_id null` (y sin temporada) y su plantilla en `team_players`, leídas por tabla con la RLS de la liga. Un
 * jugador está en un solo equipo fijo. En cada torneo de la liga, quien se inscribe entra solo a la copia de su equipo
 * (la base); `apply_league_teams` los vuelve a aplicar a un torneo que ya tiene inscritos.
 */

export interface BowlingTeamMember {
  playerId: string;
  name: string;
}

export interface BowlingTeam {
  id: string;
  name: string;
  /** '#rrggbb'; null = el de la paleta por su lugar (teamColorAt). */
  color: string | null;
  order: number;
  /** Ordenados por nombre. */
  players: BowlingTeamMember[];
}

/** Lo que se guarda en la caché: sin los nombres (salen de la lista de jugadores, siempre al día). */
export interface BowlingTeamWire {
  id: string;
  name: string;
  color: string | null;
  order: number;
  playerIds: string[];
}

interface TeamRow {
  id: string;
  name: string;
  sort_order: number | null;
  color: string | null;
}

interface TeamPlayerRow {
  team_id: string;
  player_id: string;
}

export const bowlingTeamKeys = {
  league: (lid: string) => `bteams:l:${lid}`,
};

/** Lo que cambia cuando cambian los equipos fijos de la liga. */
export const bowlingTeamsTag = (lid: string) => `bteams:${lid}`;

export async function fetchBowlingTeams(lid: string): Promise<BowlingTeamWire[]> {
  const byLeague = { col: 'league_id', op: 'eq' as const, value: lid };
  const [teams, players] = await Promise.all([
    select<TeamRow>({
      table: 'teams',
      columns: 'id,name,sort_order,color',
      filters: [byLeague, { col: 'event_id', op: 'is', value: null }],
      order: [{ col: 'sort_order' }, { col: 'name' }],
    }),
    select<TeamPlayerRow>({ table: 'team_players', columns: 'team_id,player_id', filters: [byLeague] }),
  ]);
  return toBowlingTeamWires(teams, players);
}

/** Las filas de la base como equipos (por orden y nombre), cada uno con sus jugadores. */
export function toBowlingTeamWires(teams: readonly TeamRow[], players: readonly TeamPlayerRow[]): BowlingTeamWire[] {
  return teams
    .map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color ?? null,
      order: t.sort_order ?? 0,
      playerIds: players.filter((p) => p.team_id === t.id).map((p) => p.player_id),
    }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es'));
}

/**
 * Los equipos con los nombres de sus jugadores. Quien ya no está en la lista de jugadores (salió de la liga) no sale;
 * mientras la lista carga, los nombres van como «Jugador».
 */
export function withNames(teams: readonly BowlingTeamWire[], players: readonly Pick<Player, 'id' | 'name'>[], playersLoaded = true): BowlingTeam[] {
  const names = new Map(players.map((p) => [p.id, p.name]));
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    order: t.order,
    players: t.playerIds
      .filter((id) => !playersLoaded || names.has(id))
      .map((id) => ({ playerId: id, name: names.get(id) ?? 'Jugador' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
  }));
}

/** Equipos fijos de la liga con sus jugadores (por nombre). `lid` undefined: no lee nada. */
export function useBowlingTeams(lid: string | null | undefined): Live<BowlingTeam[]> {
  const raw = useLive<BowlingTeamWire[]>(lid ? bowlingTeamKeys.league(lid) : null, lid ? { kind: 'bowlingTeams', lid } : null, () => fetchBowlingTeams(lid!), {
    initial: [],
    tags: lid ? [tags.league(lid), bowlingTeamsTag(lid)] : [],
  });
  // Solo si hay equipos hace falta la lista de jugadores (casi siempre ya está en la caché).
  const players = usePlayers(lid && raw.data.length ? lid : undefined);
  const loaded = !players.loading || players.data.length > 0;
  const data = useMemo(() => withNames(raw.data, players.data, loaded), [raw.data, players.data, loaded]);
  return useMemo(() => ({ data, loading: raw.loading, error: raw.error }), [data, raw.loading, raw.error]);
}

// ---------- Escrituras (admins, con señal) ----------

/** Lo que manda la app por cada equipo al reemplazarlos todos. */
export interface BowlingTeamDraft {
  /** null o sin valor: equipo nuevo. Un id que ya existe se conserva (sus copias en los torneos siguen ligadas). */
  id?: string | null;
  name: string;
  color?: string | null;
  players: readonly string[];
}

const afterTeams = (lid: string) => invalidate(bowlingTeamsTag(lid));

/**
 * Lo guardado se ve de una vez (la caché, antes de volver a leer): así el siguiente cambio parte de lo último, aunque
 * la lectura todavía no llegue (guardar un equipo manda su plantilla completa).
 */
function patchCache(lid: string, fn: (list: BowlingTeamWire[]) => BowlingTeamWire[]) {
  const key = bowlingTeamKeys.league(lid);
  const old = queryClient.getQueryData<BowlingTeamWire[]>(key);
  if (old) queryClient.setQueryData<BowlingTeamWire[]>(key, fn(old));
}

/** Cómo queda la lista después de guardar un equipo: sus jugadores salen de los otros (como en la base). */
export function withSavedTeam(list: readonly BowlingTeamWire[], team: BowlingTeamWire): BowlingTeamWire[] {
  const taken = new Set(team.playerIds);
  const others = list
    .filter((t) => t.id !== team.id)
    .map((t) => (t.playerIds.some((id) => taken.has(id)) ? { ...t, playerIds: t.playerIds.filter((id) => !taken.has(id)) } : t));
  const at = list.findIndex((t) => t.id === team.id);
  return at < 0 ? [...others, team] : [...others.slice(0, at), team, ...others.slice(at)];
}

/** El nombre como lo guarda la base (1 a 60 letras). */
const cleanName = (name: string, fallback: string) => name.trim().slice(0, 60) || fallback;

/** Reemplaza todos los equipos fijos de una vez (generar al azar o parejos). Devuelve los ids en el mismo orden. */
export async function setBowlingTeams(lid: string, teams: readonly BowlingTeamDraft[]): Promise<string[]> {
  const ids = await rpc<string[]>('set_bowling_teams', {
    p_league: lid,
    p_teams: teams.map((t, i) => ({
      ...(t.id ? { id: t.id } : {}),
      name: cleanName(t.name, defaultTeamName(i)),
      ...(t.color ? { color: t.color } : {}),
      players: [...t.players],
    })),
  });
  const out = Array.isArray(ids) ? ids : [];
  patchCache(lid, () =>
    teams.map((t, i) => ({ id: out[i] ?? t.id ?? '', name: cleanName(t.name, defaultTeamName(i)), color: t.color ?? null, order: i, playerIds: [...t.players] })),
  );
  afterTeams(lid);
  return out;
}

/**
 * Crea (`id` null) o cambia un equipo con su plantilla completa (`players` null: la plantilla no se toca, solo el
 * nombre y el color). Si un jugador estaba en otro equipo fijo, la base lo saca de ese (así se mueve). Devuelve el id.
 */
export async function saveBowlingTeam(
  lid: string,
  team: { id: string | null; name: string; color: string | null; players: readonly string[] | null },
): Promise<string> {
  const id = await rpc<string>('save_bowling_team', {
    p_league: lid,
    p_id: team.id,
    p_name: cleanName(team.name, 'Equipo'),
    p_color: team.color,
    p_players: team.players ? [...team.players] : null,
  });
  const saved = id ?? team.id ?? '';
  patchCache(lid, (list) => {
    const before = list.find((t) => t.id === saved);
    return withSavedTeam(list, {
      id: saved,
      name: cleanName(team.name, 'Equipo'),
      color: team.color,
      order: before?.order ?? Math.max(-1, ...list.map((t) => t.order)) + 1,
      playerIds: team.players ? [...team.players] : (before?.playerIds ?? []),
    });
  });
  afterTeams(lid);
  return saved;
}

/** Borra un equipo fijo (sus copias en los torneos se quedan, sin el vínculo). */
export async function deleteBowlingTeam(lid: string, teamId: string): Promise<void> {
  await rpc('delete_bowling_team', { p_team: teamId });
  patchCache(lid, (list) => list.filter((t) => t.id !== teamId));
  afterTeams(lid);
}

/** Pone los equipos fijos en un torneo que ya tiene inscritos. Devuelve cuántos quedaron con equipo. */
export async function applyLeagueTeams(lid: string, eventId: string): Promise<number> {
  const n = await rpc<number>('apply_league_teams', { p_event: eventId });
  invalidate(tags.event(eventId), tags.events(lid), tags.eventEntries(eventId), tags.entries(lid));
  return typeof n === 'number' ? n : 0;
}

// ---------- Mover jugadores (lo que queda después de cada cambio) ----------

/** El equipo donde está el jugador (null = sin equipo). */
export const teamOf = <T extends { id: string; players: readonly { playerId: string }[] }>(teams: readonly T[], playerId: string): T | null =>
  teams.find((t) => t.players.some((p) => p.playerId === playerId)) ?? null;

/** La plantilla del equipo con el jugador (sin repetirlo). */
export function rosterWith(team: { players: readonly { playerId: string }[] }, playerId: string): string[] {
  const ids = team.players.map((p) => p.playerId);
  return ids.includes(playerId) ? ids : [...ids, playerId];
}

/** La plantilla del equipo sin el jugador. */
export const rosterWithout = (team: { players: readonly { playerId: string }[] }, playerId: string): string[] =>
  team.players.map((p) => p.playerId).filter((id) => id !== playerId);

// ---------- Generar (la app arma los grupos; la base los guarda con set_bowling_teams) ----------

/** Tamaños de equipo que se pueden elegir al generar. */
export const TEAM_SIZES = [2, 3, 4, 5, 6] as const;

/** Colores de los equipos (en orden). */
export const TEAM_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#475569'] as const;

/** «Equipo 1», «Equipo 2»… (`i` desde 0). */
export const defaultTeamName = (i: number) => `Equipo ${i + 1}`;

/** El color de la paleta para el equipo en ese lugar (`i` desde 0). */
export const teamColorAt = (i: number): string => TEAM_COLORS[((i % TEAM_COLORS.length) + TEAM_COLORS.length) % TEAM_COLORS.length];

/** El color del equipo (el suyo, o el de la paleta por su lugar en la lista). */
export const colorOf = (team: { color: string | null }, index: number) => team.color || teamColorAt(index);

/** Cuántos equipos salen con `n` jugadores de a `size` (0 sin jugadores). */
export const teamCount = (n: number, size: number) => (n > 0 ? Math.max(1, Math.ceil(n / Math.max(1, size))) : 0);

/**
 * El tamaño que se propone al generar: el de los equipos de ahora (redondeado, entre 2 y 6); si no hay, 4 cuando
 * salen grupos de 4 justos o no salen de 3, y 3 si no.
 */
export function defaultTeamSize(players: number, existing: readonly { players: readonly unknown[] }[] = []): number {
  const sizes = existing.map((t) => t.players.length).filter((n) => n > 0);
  if (sizes.length) return Math.min(6, Math.max(2, Math.round(sizes.reduce((a, n) => a + n, 0) / sizes.length)));
  return players % 4 === 0 || players % 3 !== 0 ? 4 : 3;
}

/**
 * Al azar: baraja (con `rand`; con semilla, siempre lo mismo) y reparte de a uno, así los equipos quedan del mismo
 * tamaño o con uno menos. Con 10 jugadores de a 4: 4, 3 y 3.
 */
export function randomTeams<T>(players: readonly T[], size: number, rand: () => number = Math.random): T[][] {
  const count = teamCount(players.length, size);
  const out = Array.from({ length: count }, () => [] as T[]);
  shuffle(players, rand).forEach((p, i) => out[i % count].push(p));
  return out;
}

/** El generador con semilla para randomTeams (la misma semilla, los mismos equipos). */
export const seededTeams = <T>(players: readonly T[], size: number, seed: Seed) => randomTeams(players, size, seededRandom(seed));

/**
 * Parejos por promedio (balancedTeams: en serpiente y con intercambios), sin repetir categoría en un equipo cuando se
 * puede. Cada equipo, del mejor promedio al menor.
 */
export function balancedLeagueTeams<T extends { average: number }>(players: readonly T[], size: number, cuts: [number, number, number] = DEFAULT_CUTS): T[][] {
  const count = teamCount(players.length, size);
  if (!count) return [];
  return balancedTeams([...players], count, (p) => p.average || 0, (p) => category(p.average || 0, cuts));
}

/** Suma de los promedios del equipo (sin promedio cuenta 0). */
export const teamAverageSum = (playerIds: readonly string[], averages: ReadonlyMap<string, number>) =>
  playerIds.reduce((a, id) => a + (averages.get(id) ?? 0), 0);

/**
 * Lo que se manda al usar los grupos generados: los equipos que ya existen se reutilizan en orden (su id, nombre y
 * color: sus copias en los torneos siguen ligadas); los que faltan, con nombre y color nuevos; los que sobran se borran.
 */
export function draftsFromGroups(
  groups: readonly (readonly { id: string }[])[],
  existing: readonly Pick<BowlingTeam, 'id' | 'name' | 'color'>[] = [],
): (BowlingTeamDraft & { name: string; color: string })[] {
  return groups.map((g, i) => ({
    id: existing[i]?.id ?? null,
    name: existing[i]?.name ?? defaultTeamName(i),
    color: existing[i] ? colorOf(existing[i], i) : teamColorAt(i),
    players: g.map((p) => p.id),
  }));
}
