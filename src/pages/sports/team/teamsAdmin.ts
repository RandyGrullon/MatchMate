import { asBackendError } from '../../../lib/db/errors';
import type { RosterEntry, SeasonTeam, TeamRole } from '../../../lib/data/seasonTeams';
import { saveErrorMessage } from '../../../lib/errorText';
import type { Player } from '../../../lib/types';

/**
 * Lo que decide Organizar › Equipos de los deportes de equipo sin pantalla (lo comparten la web, TeamsManager.tsx, y la
 * app del teléfono): los roles, la línea de cada equipo, el error al guardar la plantilla, lo que cambió en la hoja de un
 * jugador y a quién se puede agregar a la plantilla.
 */

export const ROLE_LABEL: Record<TeamRole, string> = { player: 'Jugador', captain: 'Capitán', delegate: 'Delegado' };
export const ROLES: readonly TeamRole[] = ['player', 'captain', 'delegate'];

/** Mensaje de un error al guardar la plantilla (dorsal repetido, sin permiso…). */
export function rosterError(e: unknown): string {
  if (asBackendError(e)?.kind === 'conflict') return 'Ese dorsal ya lo usa otro jugador del equipo.';
  return saveErrorMessage(e);
}

/** «4 jugadores · Capitán: Ana Pérez». */
export const teamLine = (tl: { nameOf: (playerId: string) => string }, t: Pick<SeasonTeam, 'roster'>) =>
  `${t.roster.length} ${t.roster.length === 1 ? 'jugador' : 'jugadores'}${t.roster
    .filter((r) => r.role !== 'player')
    .map((r) => ` · ${ROLE_LABEL[r.role]}: ${tl.nameOf(r.playerId)}`)
    .join('')}`;

/** La línea de un jugador en la plantilla: la posición y su rol (si no es jugador). */
export const rosterSubtitle = (r: Pick<RosterEntry, 'position' | 'role'>) => [r.position, r.role !== 'player' ? ROLE_LABEL[r.role] : null].filter(Boolean).join(' · ');

export type RosterPatch = Partial<Pick<RosterEntry, 'jersey' | 'position' | 'role'>>;

/**
 * La hoja de un jugador de la plantilla: lo que cambió (dorsal de 0 a 99, posición, rol si es admin), si el dorsal está
 * mal y las posiciones para elegir (con la suya aunque no sea del deporte).
 */
export function rosterEdit(entry: Pick<RosterEntry, 'jersey' | 'position' | 'role'>, form: { jersey: string; position: string; role: TeamRole }, canRoles: boolean, positions: readonly string[]) {
  const n = form.jersey.trim() === '' ? null : Number(form.jersey);
  const badJersey = n !== null && (!Number.isInteger(n) || n < 0 || n > 99);
  const posOptions = entry.position && !positions.includes(entry.position) ? [...positions, entry.position] : [...positions];
  const patch: RosterPatch = {};
  if (!badJersey && n !== entry.jersey) patch.jersey = n;
  if ((form.position || null) !== (entry.position ?? null)) patch.position = form.position || null;
  if (canRoles && form.role !== entry.role) patch.role = form.role;
  return { patch, badJersey, posOptions, changed: Object.keys(patch).length > 0 };
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * «Agregar a <equipo>»: los jugadores de la liga que no están en el equipo y coinciden con la búsqueda, primero los que
 * no tienen equipo y por nombre; `teamOf` dice en qué otro equipo está cada uno.
 */
export function addablePlayers(players: readonly Pick<Player, 'id' | 'name' | 'uid'>[], team: Pick<SeasonTeam, 'id' | 'roster'>, teams: readonly Pick<SeasonTeam, 'id' | 'name' | 'roster'>[], q: string) {
  const inTeam = new Set(team.roster.map((r) => r.playerId));
  const teamOf = new Map<string, string>();
  for (const t of teams) for (const r of t.roster) if (t.id !== team.id) teamOf.set(r.playerId, t.name);
  const query = norm(q.trim());
  const list = players
    .filter((p) => !inTeam.has(p.id) && (!query || norm(p.name).includes(query)))
    .sort((a, b) => Number(teamOf.has(a.id)) - Number(teamOf.has(b.id)) || a.name.localeCompare(b.name, 'es'));
  return { list, teamOf };
}

/** La línea de un jugador al agregarlo: «En Tigres · Sin cuenta» (vacía si no tiene equipo y tiene cuenta). */
export const addableLine = (p: Pick<Player, 'id' | 'uid'>, teamOf: ReadonlyMap<string, string>) =>
  [teamOf.has(p.id) ? `En ${teamOf.get(p.id)}` : null, !p.uid ? 'Sin cuenta' : null].filter(Boolean).join(' · ');

/** El nombre de un equipo es válido: de 1 a 60 letras. */
export const validTeamName = (name: string) => name.trim().length > 0 && name.trim().length <= 60;
