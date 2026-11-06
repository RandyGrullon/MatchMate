import { balancedTeams, category, entryHandicap } from '../../lib/stats';
import type { BowlingEvent, Entry, Player, Team } from '../../lib/types';

/**
 * Torneo › Equipos (quien organiza) sin dibujar nada: los equipos del torneo en su orden, quiénes están en cada uno y
 * quiénes no tienen, sus sumas y el reparto de «Armar equipos parejos». Lo usan la web (src/components/event/TeamsTab
 * y AutoTeamsModal) y la app del teléfono.
 */

/** El nombre del jugador de cada inscripción («(jugador borrado)» si ya no está en la liga). */
export function entryNames(players: readonly Pick<Player, 'id' | 'name'>[]): (e: Pick<Entry, 'playerId'>) => string {
  const byId = new Map(players.map((p) => [p.id, p]));
  return (e) => byId.get(e.playerId)?.name ?? '(jugador borrado)';
}

/** Los equipos del torneo en su orden: [id, equipo]. */
export const eventTeamList = (event: Pick<BowlingEvent, 'teams'>): [string, Team][] => Object.entries(event.teams ?? {}).sort(([, a], [, b]) => a.order - b.order);

/** El nombre que se propone al crear uno («Equipo 3» si ya hay 2). */
export const nextTeamName = (count: number) => `Equipo ${count + 1}`;

/** Los inscritos sin equipo (o con uno que ya no está), por nombre. */
export const unassignedEntries = <E extends Pick<Entry, 'teamId' | 'playerId'>>(event: Pick<BowlingEvent, 'teams'>, entries: readonly E[], nameOf: (e: E) => string): E[] =>
  entries.filter((e) => !e.teamId || !event.teams?.[e.teamId]).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

/** Los de un equipo, por nombre. */
export const teamMembers = <E extends Pick<Entry, 'teamId' | 'playerId'>>(entries: readonly E[], teamId: string, nameOf: (e: E) => string): E[] =>
  entries.filter((e) => e.teamId === teamId).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

/** «Suma promedios» y «Hcp equipo» de un equipo. */
export function teamTotals(members: readonly Entry[], event: BowlingEvent): { avg: number; hcp: number } {
  return {
    avg: members.reduce((a, m) => a + (m.average || 0), 0),
    hcp: members.reduce((a, m) => a + entryHandicap(m, event), 0),
  };
}

/** El equipo ya tiene los jugadores que pide el torneo. */
export const teamFull = (event: Pick<BowlingEvent, 'teamSize'>, members: number) => !!event.teamSize && members >= event.teamSize;

// ---------- Armar equipos parejos ----------

/** Cuántos equipos salen de los inscritos de a `size` (al menos 1). */
export const autoTeamCount = (entries: number, size: number) => Math.max(1, Math.ceil(entries / Math.max(1, size)));

/** «Jugadores por equipo» como lo deja el campo: de 1 a 10 (vacío o raro, 1). */
export const autoTeamSize = (value: string) => Math.min(10, Math.max(1, +value || 1));

export interface AutoTeam {
  /** El equipo que ya existe en ese lugar (se reutiliza), o null. */
  teamId: string | null;
  name: string;
  members: Entry[];
  sum: number;
}

/**
 * Equipos parejos por promedio (reparto en serpiente, con categorías distintas cuando se puede). Reutiliza en orden los
 * equipos que ya hay (su id y su nombre); los nuevos, «Equipo N».
 */
export function autoTeamsProposal(entries: Entry[], count: number, event: Pick<BowlingEvent, 'teams' | 'categoryCuts'>): AutoTeam[] {
  const existing = eventTeamList(event);
  return balancedTeams(entries, count, (e) => e.average || 0, (e) => category(e.average, event.categoryCuts)).map((members, i) => ({
    teamId: existing[i]?.[0] ?? null,
    name: existing[i]?.[1].name ?? `Equipo ${i + 1}`,
    members,
    sum: members.reduce((a, m) => a + (m.average || 0), 0),
  }));
}

/** Diferencia entre el equipo de mayor suma y el de menor. */
export const autoTeamsSpread = (proposal: readonly Pick<AutoTeam, 'sum'>[]) =>
  proposal.length > 1 ? Math.max(...proposal.map((t) => t.sum)) - Math.min(...proposal.map((t) => t.sum)) : 0;

/** Cuántos de los equipos de ahora se borran por sobrar. */
export const autoTeamsRemoved = (existing: number, count: number) => existing - Math.min(existing, count);

/** El nombre que se guarda: el que se escribió (hasta 40 letras) o el de siempre. */
export const autoTeamName = (names: Readonly<Record<number, string>>, i: number, fallback: string) => (names[i] ?? fallback).trim().slice(0, 40) || fallback;
