import { teamRule, type Line } from '../../lib/stats';
import { NO_PHOTO, type BowlingEvent, type Entry } from '../../lib/types';
import type { BoardCell } from './board';

/**
 * La Planilla del evento sin pantalla (GamesTab de la web y la Planilla de la app): los equipos del torneo con su
 * total, lo que dice cada casilla, quiénes confirmaron y faltan, el juego que sigue al guardar y los avisos. Pruebas
 * en sheet.test.ts.
 */

/** Un grupo de la Planilla: un equipo del torneo (con su nombre) o todos (sin título, en la práctica). */
export interface SheetGroup {
  key: string;
  title: string | null;
  lines: Line[];
}

/**
 * Los grupos de la Planilla: en un torneo, cada equipo en su orden y «Sin equipo» al final (solo los que tienen gente);
 * en una práctica, todos juntos.
 */
export function sheetGroups(event: Pick<BowlingEvent, 'type' | 'teams'>, lines: readonly Line[]): SheetGroup[] {
  if (event.type !== 'torneo') return [{ key: '_all', title: null, lines: [...lines] }];
  return [
    ...Object.entries(event.teams ?? {})
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([id, t]) => ({ key: id, title: t.name, lines: lines.filter((l) => l.entry.teamId === id) })),
    { key: '_none', title: 'Sin equipo', lines: lines.filter((l) => !l.entry.teamId || !event.teams?.[l.entry.teamId]) },
  ].filter((g) => g.lines.length);
}

/**
 * El total del encabezado de un equipo con su regla (docs/premios-torneo.md §5.1): con equipos por scratch (la del
 * dueño) el número grande son los pinos y el total con handicap va al lado, en gris; con equipos por handicap, el
 * total con handicap (como antes). `hcp` null = no hay otro número que mostrar.
 */
export function groupTotal(event: BowlingEvent, lines: readonly Line[]): { main: number; hcp: number | null } {
  let scratch = 0;
  let withHcp = 0;
  for (const l of lines) {
    for (const s of l.scores) {
      if (s == null) continue;
      scratch += s;
      withHcp += s + l.hcp;
    }
  }
  if (teamRule(event) === 'hcp' || withHcp === scratch) return { main: withHcp, hcp: null };
  return { main: scratch, hcp: withHcp };
}

/** «Total 1110 · con hcp 1422» (el encabezado del equipo, en palabras). */
export const groupTotalText = (total: { main: number; hcp: number | null }) => `Total ${total.main}${total.hcp != null ? ` · con hcp ${total.hcp}` : ''}`;

/** Foto real (no la marca de "sin foto"). */
export const isRealPhoto = (p: string | null | undefined) => p != null && p !== NO_PHOTO;

/** Lo que dice una casilla al lector de pantalla. */
export function cellSpoken(cell: BoardCell): string {
  if (cell.kind === 'empty') return 'sin anotar';
  if (cell.kind === 'play') return cell.partial ? `jugando, lleva ${cell.score ?? 0}` : `${cell.score}, en su teléfono`;
  return cell.kind === 'pend' ? `${cell.score}, por aprobar` : String(cell.score);
}

/** Lo que se ve en la casilla: el número, «74…» a medias o nada. */
export const cellText = (cell: BoardCell) => (cell.kind === 'empty' ? '' : cell.partial ? `${cell.score ?? ''}…` : String(cell.score));

/** Confirmaron «Voy» y todavía no están en la planilla (solo los jugadores que siguen en la liga). */
export function missingConfirmed(event: Pick<BowlingEvent, 'rsvp'>, entries: readonly Pick<Entry, 'playerId'>[], playerIds: ReadonlySet<string>): string[] {
  return Object.keys(event.rsvp ?? {}).filter((id) => playerIds.has(id) && !entries.some((e) => e.playerId === id));
}

/** «2 confirmaron que van» o «1 confirmó que va». */
export const confirmedText = (n: number) => `${n} ${n === 1 ? 'confirmó que va' : 'confirmaron que van'}`;

/** El juego que sigue al guardar uno (el próximo sin anotar, sin contar ese) o -1 si ya están todos. */
export function nextOpenGame(scores: readonly (number | null)[], saved: number): number {
  return scores.findIndex((s, i) => i !== saved && s == null);
}

/** Lo que dice la Planilla vacía. */
export function emptySheetText(isAdmin: boolean, isTorneo: boolean): { title: string; text: string } {
  return {
    title: isTorneo ? 'Nadie inscrito' : 'Sin asistentes',
    text: !isAdmin
      ? 'El admin todavía no ha inscrito jugadores.'
      : isTorneo
        ? 'Inscribe jugadores en la pestaña Inscritos.'
        : 'Agrega quién vino a practicar, o lee una foto y se agregan solos.',
  };
}

/** La pregunta antes de quitar a alguien de la práctica. */
export const removeEntryConfirm = (name: string) => ({ title: `¿Quitar a ${name}?`, message: 'Se borran sus juegos de esta práctica.', confirmText: 'Quitar', danger: true });

/** Cuántos se agregaron o inscribieron: «3 inscritos», «1 inscrito». */
export const enrolledText = (n: number) => `${n} inscrito${n === 1 ? '' : 's'}`;

/** «Agregar asistentes» (práctica) o «Inscribir jugadores» (torneo). */
export const addPlayersTitle = (type: string | null | undefined) => (type === 'torneo' ? 'Inscribir jugadores' : 'Agregar asistentes');

/**
 * Al agregar asistentes: los jugadores que no están en el evento, los que coinciden con lo escrito y si lo escrito es un
 * nombre nuevo (para «Crear “…” y agregarlo»).
 */
export function addPlayersSearch<P extends { id: string; name: string }>(
  players: readonly P[],
  entries: readonly Pick<Entry, 'playerId'>[],
  q: string,
): { available: P[]; filtered: P[]; canCreate: boolean } {
  const query = q.trim().toLowerCase();
  const available = players.filter((p) => !entries.some((e) => e.playerId === p.id));
  const filtered = available.filter((p) => p.name.toLowerCase().includes(query));
  const exact = players.some((p) => p.name.toLowerCase() === query);
  return { available, filtered, canCreate: !!query && !exact };
}

/** Lo que dice la lista vacía al agregar asistentes. */
export const addPlayersEmptyText = (players: number, available: number) =>
  players === 0 ? 'Todavía no hay jugadores: escribe un nombre arriba para crearlo.' : available === 0 ? 'Todos los jugadores ya están en este evento.' : 'Nadie coincide.';
