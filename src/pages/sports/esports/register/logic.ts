/**
 * Lo puro de inscribirse en un torneo de esports (§12.8, RegisterSheet): el ID que cuenta para el torneo, dónde juega,
 * el botón que lleva a Mi ID de juego según lo que falta, la plantilla que se arma al abrir y lo que cambia al tocar a
 * alguien, y las frases de los avisos. Sin React: lo usan la hoja de la web y la del teléfono.
 */
import type { EsportsEntry, EsportsTeamMember, EsportsTournament } from '../../../../lib/data/esports';
import type { GameIdRecord } from '../../../../lib/data/esportsIds';
import { isIndividualMode, type GameId } from '../../../../sports/esports';
import { gamePlatforms, platformsText } from '../../../../sports/esports/platforms';
import { MEMBER_PROBLEM, playsOnOf, tournamentIdFor, type MemberProblem, type RosterPick } from '../logic';

/**
 * La fila de su ID de juego para el torneo: en NBA 2K, la de la plataforma del torneo (en crossplay, cualquiera; si solo
 * tiene de otra plataforma, esa: así dice «Otra plataforma»); en los demás juegos, la única.
 */
export function idFor(records: readonly GameIdRecord[], t: Pick<EsportsTournament, 'game' | 'settings'>, userId?: string): GameIdRecord | null {
  return tournamentIdFor(records, t, userId);
}

/** Dónde juega un ID, escrito: «PC y PlayStation»; «Sin plataforma» si el juego tiene varias y no lo dijo; '' si es una sola. */
export function playsOnText(game: GameId, rec: Pick<GameIdRecord, 'platform' | 'platforms'> | null): string {
  if (!rec || gamePlatforms(game).length < 2) return '';
  const list = playsOnOf(game, rec);
  return list.length ? platformsText(list) : 'Sin plataforma';
}

/** El botón que lleva a Mi ID de juego según lo que falta. */
export const FIX_LABEL: Readonly<Record<MemberProblem, string>> = {
  [MEMBER_PROBLEM.noId]: 'Poner mi ID',
  [MEMBER_PROBLEM.otherPlatform]: 'Cambiar mi ID',
  [MEMBER_PROBLEM.noPlatform]: 'Decir dónde juego',
  [MEMBER_PROBLEM.unchecked]: 'Ir a Mi ID de juego',
  [MEMBER_PROBLEM.noRank]: 'Ir a Mi ID de juego',
};

/** Lo que dice la fila de un miembro que no cumple: «Otra plataforma (PC)», «Sin plataforma», «Sin ID»… */
export function memberProblemLabel(problem: MemberProblem, game: GameId, rec: Pick<GameIdRecord, 'platform' | 'platforms'> | null): string {
  if (problem !== MEMBER_PROBLEM.otherPlatform || !rec) return problem;
  const list = playsOnOf(game, rec);
  return list.length ? `${problem} (${platformsText(list)})` : problem;
}

/** El título de la hoja: «Tu inscripción», «Inscribir mi equipo» o «Inscribirme». */
export const registerSheetTitle = (t: Pick<EsportsTournament, 'entryType' | 'mode'>, entry: unknown) =>
  entry ? 'Tu inscripción' : t.entryType === 'teams' && !isIndividualMode(t.mode) ? 'Inscribir mi equipo' : 'Inscribirme';

/**
 * La plantilla al abrir: el capitán de titular y, en el orden del equipo, los que cumplen (los suplentes del equipo de
 * suplentes si caben; los demás de titulares hasta llenar y después de suplentes).
 */
export function initialRosterPicks(
  members: readonly Pick<EsportsTeamMember, 'userId' | 'role'>[],
  captainId: string,
  problems: ReadonlyMap<string, string | null>,
  size: number,
  subsMax: number,
): RosterPick[] {
  const out: RosterPick[] = [{ userId: captainId, role: 'captain' }];
  for (const m of members) {
    if (m.userId === captainId || problems.get(m.userId)) continue;
    const starters = out.filter((p) => p.role !== 'sub').length;
    const subs = out.length - starters;
    if (m.role === 'sub' ? subs < subsMax : starters < size) out.push({ userId: m.userId, role: m.role === 'sub' ? 'sub' : 'member' });
    else if (subs < subsMax) out.push({ userId: m.userId, role: 'sub' });
  }
  return out;
}

/** Tocar a alguien: sale si estaba; si no, entra de titular (si falta) o de suplente. Al capitán no se le quita. */
export function toggleRosterPick(list: readonly RosterPick[], userId: string, captainId: string, size: number): RosterPick[] {
  if (userId === captainId) return [...list];
  if (list.some((p) => p.userId === userId)) return list.filter((p) => p.userId !== userId);
  return [...list, { userId, role: list.filter((p) => p.role !== 'sub').length < size ? 'member' : 'sub' }];
}

/** «Plantilla: 5 titulares y hasta 2 suplentes». */
export function rosterHeading(size: number, subsMax: number): string {
  return `Plantilla: ${size} ${size === 1 ? 'titular' : 'titulares'}${subsMax ? ` y hasta ${subsMax} ${subsMax === 1 ? 'suplente' : 'suplentes'}` : ''}`;
}

/** Lo que dice el aviso al inscribirse solo (o como agente libre). */
export const soloRegisteredText = (autoApprove: boolean) => (autoApprove ? 'Listo: quedaste inscrito' : 'Inscripción enviada: falta que la aprueben');

/** Lo que dice el aviso al inscribir el equipo. */
export const teamRegisteredText = (autoApprove: boolean, teamName: string) => (autoApprove ? `Listo: ${teamName} quedó inscrito` : 'Inscripción enviada: falta que la aprueben');

/**
 * «Actualizar mi ID en la inscripción»: su ID de ahora no es el que quedó al inscribirse (el capitán, también el de
 * cualquiera de la plantilla). `canRefresh`, la frase de arriba y el botón.
 */
export function refreshInfo(o: {
  open: boolean;
  live: boolean;
  stale: readonly string[];
  uid: string | null;
  captain: boolean;
  myGamerTag: string | null;
  myIdNow: string | null;
}): { canRefresh: boolean; text: string; label: string } {
  const mine = !!o.uid && o.stale.includes(o.uid);
  const others = o.captain ? o.stale.filter((u) => u !== o.uid).length : 0;
  const text =
    mine && o.myGamerTag != null && o.myIdNow
      ? `Ahora tu ID es ${o.myIdNow}; en la inscripción quedó ${o.myGamerTag}.`
      : `${others === 1 ? 'Alguien de la plantilla cambió su ID' : `${others} de la plantilla cambiaron su ID`} después de inscribirse.`;
  return { canRefresh: o.open && o.live && (mine || others > 0), text, label: others > 0 ? 'Actualizar los IDs en la inscripción' : 'Actualizar mi ID en la inscripción' };
}

/** «¿Retirarte del torneo?»: lo que dice la pregunta. */
export const withdrawMessage = (entry: Pick<EsportsEntry, 'kind' | 'name'>) => (entry.kind === 'team' ? `${entry.name} sale de la inscripción.` : 'Sales de la inscripción.');
