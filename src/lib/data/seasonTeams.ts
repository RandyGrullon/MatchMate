import { uuidv7 } from '../db/ids';
import type { Stamp } from '../types';
import { invalidate, rpc, select, useLive, type Live } from './client';
import { tags } from './keys';
import { matchTags, seasonTeamTag, useMatchTopic } from './matches';
import type { Wire } from './stamp';

/**
 * Equipos y parejas de temporada (tabla teams con event_id null + team_players). En raqueta son las parejas
 * con id estable (los puntos van a la pareja; las estadísticas, a quien jugó); en equipos, la plantilla con
 * dorsal, posición y capitán o delegado. Contrato: docs/partidos.md.
 */

export type TeamRole = 'player' | 'captain' | 'delegate';

export interface RosterEntry {
  playerId: string;
  jersey: number | null;
  position: string | null;
  role: TeamRole;
}

export interface SeasonTeam {
  id: string;
  leagueId: string;
  name: string;
  color: string | null;
  order: number;
  /** Ordenada: capitán, delegado, luego por dorsal. */
  roster: RosterEntry[];
  createdAt: Stamp | null;
  updatedAt: Stamp | null;
}

export interface SeasonTeamRow {
  id: string;
  league_id: string;
  name: string;
  sort_order: number;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamPlayerRow {
  team_id: string;
  player_id: string;
  jersey: number | null;
  position: string | null;
  role: TeamRole;
}

const ROLE_ORDER: Record<TeamRole, number> = { captain: 0, delegate: 1, player: 2 };

export function compareRoster(a: RosterEntry, b: RosterEntry): number {
  return ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || (a.jersey ?? 1000) - (b.jersey ?? 1000) || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0);
}

export function toSeasonTeam(row: SeasonTeamRow, players: readonly TeamPlayerRow[]): Wire<SeasonTeam> {
  return {
    id: row.id,
    leagueId: row.league_id,
    name: row.name,
    color: row.color ?? null,
    order: row.sort_order ?? 0,
    roster: players
      .filter((p) => p.team_id === row.id)
      .map((p): RosterEntry => ({ playerId: p.player_id, jersey: p.jersey ?? null, position: p.position ?? null, role: p.role ?? 'player' }))
      .sort(compareRoster),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export const seasonTeamKeys = {
  league: (lid: string) => `steams:l:${lid}`,
};

export async function fetchSeasonTeams(lid: string): Promise<Wire<SeasonTeam>[]> {
  const byLeague = { col: 'league_id', op: 'eq' as const, value: lid };
  const [teams, players] = await Promise.all([
    select<SeasonTeamRow>({
      table: 'teams',
      columns: 'id,league_id,name,sort_order,color,created_at,updated_at',
      filters: [byLeague, { col: 'event_id', op: 'is', value: null }],
      order: [{ col: 'sort_order' }, { col: 'name' }],
    }),
    select<TeamPlayerRow>({ table: 'team_players', columns: 'team_id,player_id,jersey,position,role', filters: [byLeague] }),
  ]);
  return teams.map((t) => toSeasonTeam(t, players)).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es'));
}

/** Equipos o parejas de temporada de la liga, con su plantilla (en vivo mientras la pantalla está abierta). */
export function useSeasonTeams(lid: string | undefined): Live<SeasonTeam[]> {
  useMatchTopic(lid ? `league:${lid}` : null, lid ?? null);
  return useLive<SeasonTeam[]>(lid ? seasonTeamKeys.league(lid) : null, lid ? { kind: 'seasonTeams', lid } : null, () => fetchSeasonTeams(lid!), {
    initial: [],
    tags: lid ? [tags.league(lid), seasonTeamTag(lid)] : [],
  });
}

// ---------- Ayudas ----------

/** Mis roles en los equipos (por mi jugador de la liga): teamId → rol. */
export function myTeamRoles(teams: readonly Pick<SeasonTeam, 'id' | 'roster'>[], myPlayerId: string | null | undefined): Map<string, TeamRole> {
  const out = new Map<string, TeamRole>();
  if (!myPlayerId) return out;
  for (const t of teams) {
    const e = t.roster.find((r) => r.playerId === myPlayerId);
    if (e) out.set(t.id, e.role);
  }
  return out;
}

/**
 * Equipos donde puedo anotar, proponer y confirmar por mi lado (lo mismo que decide la base): en raqueta, todas
 * mis parejas; en equipos, solo donde soy capitán o delegado.
 */
export function teamsICanSpeakFor(roles: ReadonlyMap<string, TeamRole>, family: 'racket' | 'team'): string[] {
  return [...roles].filter(([, role]) => family === 'racket' || role !== 'player').map(([id]) => id);
}

/** Nombre de una pareja con los nombres de sus jugadores: «Ana / Luis». */
export const pairName = (names: readonly string[]) =>
  names
    .map((n) => n.trim())
    .filter(Boolean)
    .join(' / ')
    .slice(0, 60);

/** El siguiente dorsal libre (desde `from`). */
export function nextFreeJersey(roster: readonly Pick<RosterEntry, 'jersey'>[], from = 1): number | null {
  const used = new Set(roster.map((r) => r.jersey));
  for (let n = from; n <= 99; n++) if (!used.has(n)) return n;
  for (let n = 0; n < from; n++) if (!used.has(n)) return n;
  return null;
}

// ---------- Escrituras (con señal) ----------

export interface RosterDraft {
  playerId: string;
  jersey?: number | null;
  position?: string | null;
  /** Solo el admin cambia roles (capitán y delegado). */
  role?: TeamRole;
}

export function rosterArg(r: RosterDraft): Record<string, unknown> {
  const out: Record<string, unknown> = { player_id: r.playerId, jersey: r.jersey ?? null, position: r.position ?? null };
  if (r.role) out.role = r.role;
  return out;
}

const afterTeams = (lid: string) => invalidate(seasonTeamTag(lid), matchTags.mine);

/** Admin: equipo o pareja de temporada con su plantilla. Devuelve el id. */
export async function createSeasonTeam(lid: string, team: { name: string; color?: string | null; players?: readonly RosterDraft[] }): Promise<string> {
  const id = uuidv7();
  const args: Record<string, unknown> = { p_league: lid, p_name: team.name.trim(), p_id: id };
  if (team.color) args.p_color = team.color;
  if (team.players) args.p_players = team.players.map(rosterArg);
  await rpc('create_season_team', args);
  afterTeams(lid);
  return id;
}

/** Admin: nombre, color u orden. */
export async function updateSeasonTeam(lid: string, id: string, patch: { name?: string; color?: string | null; order?: number }) {
  const p: Record<string, unknown> = {};
  if (patch.name !== undefined) p.name = patch.name.trim();
  if (patch.color !== undefined) p.color = patch.color;
  if (patch.order !== undefined) p.sort_order = patch.order;
  await rpc('update_season_team', { p_team: id, p_patch: p });
  afterTeams(lid);
  // Los partidos guardan el nombre copiado: no cambian.
}

/** Admin: borra el equipo (sus partidos se quedan con el nombre copiado). */
export async function deleteSeasonTeam(lid: string, id: string) {
  await rpc('delete_season_team', { p_team: id });
  afterTeams(lid);
  invalidate(matchTags.league(lid));
}

/** Pone o cambia un jugador (admin; capitán o delegado sin cambiar roles). */
export async function setTeamPlayer(lid: string, teamId: string, entry: RosterDraft) {
  const args: Record<string, unknown> = { p_team: teamId, p_player: entry.playerId, p_jersey: entry.jersey ?? null, p_position: entry.position ?? null };
  if (entry.role) args.p_role = entry.role;
  await rpc('set_team_player', args);
  afterTeams(lid);
}

/** Saca a un jugador (admin; capitán o delegado a jugadores; o uno mismo). false si no estaba. */
export async function removeTeamPlayer(lid: string, teamId: string, playerId: string): Promise<boolean> {
  const r = await rpc<boolean>('remove_team_player', { p_team: teamId, p_player: playerId });
  afterTeams(lid);
  return r === true;
}

/** Plantilla completa de una vez (reemplaza la anterior; el capitán no puede quitar capitanes ni delegados). */
export async function setRoster(lid: string, teamId: string, entries: readonly RosterDraft[]) {
  await rpc('set_roster', { p_team: teamId, p_players: entries.map(rosterArg) });
  afterTeams(lid);
}
