import { MIN_RANK_GAMES } from '../../lib/stats';
import type { BowlingEvent, Entry } from '../../lib/types';

/**
 * Torneo › Inscritos (RosterTab de la web y la de la app del teléfono), sin React: los inscritos por nombre, el equipo
 * de cada uno (con cupo), sacar a uno, actualizar los promedios y la regla del handicap.
 */

/** Los inscritos por nombre (los borrados, sin nombre, al principio como en la web). */
export function rosterOrder(entries: readonly Entry[], nameOf: (playerId: string) => string | undefined): Entry[] {
  return [...entries].sort((a, b) => (nameOf(a.playerId) ?? '').localeCompare(nameOf(b.playerId) ?? ''));
}

/** Una opción del equipo de un inscrito: «Sin equipo» y cada equipo con su cupo («Los Pinos (2/4)», «· lleno»). */
export interface TeamOption {
  key: string;
  label: string;
  disabled: boolean;
}

/** Los equipos para elegir en la fila de un inscrito (`current`: el suyo, que nunca sale lleno). */
export function rosterTeamOptions(event: Pick<BowlingEvent, 'teams' | 'teamSize'>, entries: readonly Pick<Entry, 'teamId'>[], current: string | null): TeamOption[] {
  const teams = Object.entries(event.teams ?? {}).sort(([, a], [, b]) => a.order - b.order);
  return [
    { key: '', label: 'Sin equipo', disabled: false },
    ...teams.map(([id, t]) => {
      const size = entries.filter((x) => x.teamId === id).length;
      const full = !!event.teamSize && size >= event.teamSize && current !== id;
      return { key: id, label: `${t.name}${event.teamSize ? ` (${size}/${event.teamSize})` : ''}${full ? ' · lleno' : ''}`, disabled: full };
    }),
  ];
}

/** «¿Sacar a Ana del torneo?» (si tiene juegos anotados, se borran también). */
export function removeFromTourneyConfirm(name: string, played: boolean) {
  return {
    title: `¿Sacar a ${name} del torneo?`,
    message: played ? 'Tiene juegos anotados en este torneo; se borran también.' : undefined,
    confirmText: 'Sacar',
    danger: true,
  };
}

/** Lo que dice el aviso al sacar a alguien. */
export const removedFromTourneyText = (name: string) => `${name} fuera del torneo`;

/** La pregunta de «Actualizar promedios» (el de la temporada de cada inscrito, antes de empezar). */
export const SYNC_AVERAGES_CONFIRM = {
  title: 'Actualizar promedios',
  message: `Se toma el promedio de la temporada de cada inscrito (con menos de ${MIN_RANK_GAMES} juegos: el de la temporada anterior o el fijo). Úsalo antes de empezar el torneo; el handicap se recalcula.`,
  confirmText: 'Actualizar',
};
export const SYNC_AVERAGES_DONE = 'Promedios actualizados';

/** Cuántos inscritos (al lado de los botones). */
export const enrolledCount = (n: number) => `${n} inscritos`;

/** Sin inscritos todavía. */
export const ROSTER_EMPTY = { title: 'Nadie inscrito todavía', text: 'Inscribe a los jugadores; entran con su promedio actual para calcular el handicap.' };

/** La regla del handicap, debajo de la lista. */
export const hcpRuleText = (event: Pick<BowlingEvent, 'hcpBase' | 'hcpPercent'>) =>
  `El handicap vacío se calcula solo: (${event.hcpBase} − promedio) × ${event.hcpPercent}%. Escribe un número para fijarlo a mano.`;

/**
 * Lo escrito en una casilla de número (NumberCell de la web) al salir: null = no cambia nada (vacío sin permitirlo, no es
 * número o se sale de min–max, o es el mismo); `{ value }` = guardar (null = dejarla vacía).
 */
export function numberCellCommit(text: string, value: number | null, { min = 0, max = 300, allowEmpty = false }: { min?: number; max?: number; allowEmpty?: boolean } = {}): { value: number | null } | null {
  const t = text.trim();
  if (t === '') return allowEmpty && value != null ? { value: null } : null;
  const n = Math.round(Number(t));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n !== value ? { value: n } : null;
}
