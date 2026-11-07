import type { RosterEntry } from '../../../lib/data/seasonTeams';
import type { MatchRsvp } from '../../../lib/data/teamSports';
import type { Side } from '../../../sports/types';

/**
 * La lista de presentes de la mesa anotadora (PresentesModal.tsx de la web y la hoja de la app del teléfono): con qué
 * arranca, los refuerzos que se pueden agregar y lo que se guarda. Sin React ni pantallas.
 */

export interface PresentEntry {
  playerId: string;
  jersey: number | null;
  /** Refuerzo: no es de la plantilla del equipo. */
  sub: boolean;
}

type Rosters = readonly [readonly Pick<RosterEntry, 'playerId' | 'jersey'>[], readonly Pick<RosterEntry, 'playerId' | 'jersey'>[]];

/** Al abrir: la lista que ya tiene la mesa; si no hay, los que dijeron «Voy». */
export function presentStart(current: readonly [readonly string[], readonly string[]], rsvps: readonly MatchRsvp[], matchId: string): [string[], string[]] {
  return ([0, 1] as const).map((i) => {
    if (current[i].length) return [...current[i]];
    return rsvps.filter((r) => r.matchId === matchId && r.side === i + 1 && r.status === 'yes').map((r) => r.playerId);
  }) as [string[], string[]];
}

/** Marcar o desmarcar a uno en el lado `i`. */
export function togglePresent(picked: readonly [readonly string[], readonly string[]], i: 0 | 1, id: string): [string[], string[]] {
  const next: [string[], string[]] = [[...picked[0]], [...picked[1]]];
  next[i] = next[i].includes(id) ? next[i].filter((x) => x !== id) : [...next[i], id];
  return next;
}

/** Los refuerzos que se pueden agregar: jugadores de la liga que no son de ningún equipo de este partido ni están marcados. */
export function reinforcementCandidates<P extends { id: string; name: string }>(players: readonly P[], picked: readonly [readonly string[], readonly string[]], rosters: Rosters): P[] {
  const taken = new Set([...picked[0], ...picked[1], ...rosters[0].map((r) => r.playerId), ...rosters[1].map((r) => r.playerId)]);
  return players.filter((p) => !taken.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Lo que se guarda de cada lado: el dorsal de la plantilla y si es refuerzo. */
export function presentEntries(picked: readonly [readonly string[], readonly string[]], rosters: Rosters): [Side, PresentEntry[]][] {
  return ([0, 1] as const).map((k) => {
    const ids = new Set(rosters[k].map((r) => r.playerId));
    return [(k + 1) as Side, picked[k].map((pid) => ({ playerId: pid, jersey: rosters[k].find((r) => r.playerId === pid)?.jersey ?? null, sub: !ids.has(pid) }))];
  });
}
