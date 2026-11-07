import type { PlayerDraft } from '../../../lib/data/matches';
import type { RosterEntry } from '../../../lib/data/seasonTeams';
import type { MatchRsvp } from '../../../lib/data/teamSports';
import type { Side } from '../../../sports/types';

/**
 * La alineación del acta de fútbol y sala (LineupModal.tsx de la web y la hoja de la app del teléfono): con qué arranca,
 * marcar titulares y el portero, y lo que se guarda. Sin React ni pantallas.
 */

export interface LineupSide {
  /** Titulares (los que arrancan en la cancha). */
  starters: string[];
  goalkeeper: string | null;
}

type Roster = readonly Pick<RosterEntry, 'playerId' | 'jersey' | 'position'>[];

/**
 * Al abrir: lo que ya tiene el acta; si no hay, los que dijeron «Voy» (hasta los que caben) y el portero de la
 * plantilla. Con los refuerzos que ya vienen en la alineación.
 */
export function lineupStart(
  current: readonly [LineupSide, LineupSide],
  rsvps: readonly MatchRsvp[],
  matchId: string,
  rosters: readonly [Roster, Roster],
  players: number,
): { picked: [LineupSide, LineupSide]; extras: [string[], string[]] } {
  const picked = ([0, 1] as const).map((i): LineupSide => {
    if (current[i].starters.length) return { starters: [...current[i].starters], goalkeeper: current[i].goalkeeper };
    const yes = rsvps.filter((r) => r.matchId === matchId && r.side === i + 1 && r.status === 'yes').map((r) => r.playerId);
    const gk = rosters[i].find((r) => /^(gk|portero|arquero)$/i.test(r.position ?? '') && yes.includes(r.playerId))?.playerId ?? null;
    return { starters: yes.slice(0, players), goalkeeper: gk };
  }) as [LineupSide, LineupSide];
  const extras: [string[], string[]] = [
    picked[0].starters.filter((id) => !rosters[0].some((r) => r.playerId === id)),
    picked[1].starters.filter((id) => !rosters[1].some((r) => r.playerId === id)),
  ];
  return { picked, extras };
}

/** Tocar a un jugador: entra de titular (si cabe) o sale (y deja de ser el portero). */
export function toggleStarter(mine: LineupSide, id: string, players: number): LineupSide {
  if (mine.starters.includes(id)) return { starters: mine.starters.filter((x) => x !== id), goalkeeper: mine.goalkeeper === id ? null : mine.goalkeeper };
  if (mine.starters.length >= players) return mine;
  return { ...mine, starters: [...mine.starters, id] };
}

/** Tocar el guante: es el portero (y titular, si cabe) o deja de serlo. */
export function toggleKeeper(mine: LineupSide, id: string, players: number): LineupSide {
  const full = mine.starters.length >= players;
  const starters = mine.starters.includes(id) ? mine.starters : full ? mine.starters : [...mine.starters, id];
  if (!starters.includes(id)) return mine;
  return { starters, goalkeeper: mine.goalkeeper === id ? null : id };
}

/** Lo que se guarda de un lado (matches.sides.players): dorsal, «GK» o «titular» y si es refuerzo. */
export function lineupEntries(lu: LineupSide, roster: Roster): PlayerDraft[] {
  const ids = new Set(roster.map((r) => r.playerId));
  return lu.starters.map((pid) => ({
    playerId: pid,
    jersey: roster.find((r) => r.playerId === pid)?.jersey ?? null,
    position: pid === lu.goalkeeper ? 'GK' : 'titular',
    sub: !ids.has(pid),
  }));
}

/** Los lados que cambiaron (solo esos se guardan). */
export function changedSides(picked: readonly [LineupSide, LineupSide], current: readonly [LineupSide, LineupSide]): Side[] {
  return ([0, 1] as const).filter((k) => JSON.stringify(picked[k]) !== JSON.stringify(current[k])).map((k) => (k + 1) as Side);
}
