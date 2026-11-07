/**
 * Las opciones del admin en «•••» de un partido de raqueta, sin pantallas (puro): cuáles salen según el estado del
 * partido y qué dice cada una. Las usan MatchAdmin.tsx de la web y la app del teléfono (movil/).
 */
import { hasResult, type Match } from '../../../../lib/data/matches';

export type MatchAdminKey = 'wo' | 'aplazar' | 'fecha' | 'quien' | 'corregir' | 'anular' | 'borrar';

/** El partido todavía se puede jugar (por jugar, en juego, suspendido o aplazado). */
export const matchStillOpen = (m: Pick<Match, 'status'>) => m.status === 'scheduled' || m.status === 'live' || m.status === 'suspended' || m.status === 'postponed';

/**
 * Las opciones del admin, en el orden de «•••»: W.O. (no en las noches de puntos), aplazar, reprogramar o poner fecha,
 * quién juega, corregir el resultado (si la pantalla lo permite y no está en disputa), anular y borrar. Lo de todos
 * (compartir, historial) va entre «Corregir» y «Anular».
 */
export function matchAdminKeys(m: Pick<Match, 'status' | 'score' | 'winner'>, o: { isAdmin: boolean; points: boolean; canCorrect: boolean }): MatchAdminKey[] {
  if (!o.isAdmin) return [];
  const out: MatchAdminKey[] = [];
  if (matchStillOpen(m) && !o.points) out.push('wo');
  if (m.status === 'scheduled' || m.status === 'suspended') out.push('aplazar');
  if (m.status === 'scheduled' || m.status === 'postponed' || m.status === 'suspended') out.push('fecha');
  out.push('quien');
  if (o.canCorrect && (hasResult(m as Match) || m.status === 'void') && m.status !== 'disputed') out.push('corregir');
  if (m.status !== 'void') out.push('anular');
  out.push('borrar');
  return out;
}

/** Lo que dice cada opción (con «cancha» o «mesa»). */
export function matchAdminText(key: MatchAdminKey, m: Pick<Match, 'scheduledAt'>, court: string): { label: string; hint?: string } {
  switch (key) {
    case 'wo':
      return { label: 'W.O.', hint: 'Quién no se presentó' };
    case 'aplazar':
      return { label: 'Aplazar', hint: 'Queda sin fecha hasta reprogramarlo' };
    case 'fecha':
      return { label: m.scheduledAt ? 'Reprogramar' : `Poner fecha y ${court}`, hint: `Fecha, hora y ${court}` };
    case 'quien':
      return { label: 'Quién juega', hint: 'Suplentes' };
    case 'corregir':
      return { label: 'Corregir el resultado', hint: 'Queda confirmado' };
    case 'anular':
      return { label: 'Anular', hint: 'No cuenta para la tabla' };
    case 'borrar':
      return { label: 'Borrar el partido' };
  }
}

/**
 * Quién puede jugar en un lado («Quién juega»): primero los de la pareja y los ya elegidos, luego los demás, por
 * nombre.
 */
export function playerOptions<P extends { id: string; name: string }>(players: readonly P[], first: readonly string[]): P[] {
  const top = new Set(first);
  return [...players].sort((a, b) => Number(top.has(b.id)) - Number(top.has(a.id)) || a.name.localeCompare(b.name, 'es'));
}
