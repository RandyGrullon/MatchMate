import { uuidv7 } from '../db/ids';
import type { BowlingEvent } from '../types';
import { invalidate, rpc } from './client';
import { tags } from './keys';

// Equipos del evento (tabla teams). El evento de la app los sigue viendo en `event.teams[id] = {name, order}`.

const afterTeams = (lid: string, eventId: string, entries = false) =>
  invalidate(tags.event(eventId), tags.events(lid), ...(entries ? [tags.eventEntries(eventId), tags.entries(lid)] : []));

export async function addTeam(lid: string, eventId: string, name: string): Promise<string> {
  const id = uuidv7();
  await rpc('add_team', { p_event: eventId, p_name: name.trim(), p_id: id });
  afterTeams(lid, eventId);
  return id;
}

export async function renameTeam(lid: string, eventId: string, teamId: string, name: string) {
  await rpc('rename_team', { p_team: teamId, p_name: name.trim() });
  afterTeams(lid, eventId);
}

/**
 * Arma los equipos de una vez: reutiliza los equipos existentes en orden (con el nombre que se les dio),
 * crea los que falten, borra los que sobren y asigna a cada inscrito. Todo en una sola RPC.
 */
export async function applyTeams(lid: string, event: Pick<BowlingEvent, 'id'>, groups: { teamId: string | null; name: string; entryIds: string[] }[]) {
  await rpc<string[]>('apply_teams', {
    p_event: event.id,
    p_groups: groups.map((g) => ({ team_id: g.teamId, name: g.name.trim(), entry_ids: g.entryIds })),
  });
  afterTeams(lid, event.id, true);
}

/** Borra el equipo; sus integrantes quedan sin equipo (lo hace la base). */
export async function deleteTeam(lid: string, eventId: string, teamId: string, _memberEntryIds: string[]) {
  await rpc('delete_team', { p_team: teamId });
  afterTeams(lid, eventId, true);
}
