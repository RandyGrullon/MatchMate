import { hasResult, isOpen, type Match } from '../../../lib/data/matchCore';

/**
 * Lo puro del partido de equipos (MatchAdminPanel.tsx y los detalles de cada deporte): qué sale en el «•••» del admin,
 * lo que se pregunta antes de aplazar, anular o borrar, las filas del W.O. y los avisos de la convocatoria. Lo usan la
 * web y la app del teléfono.
 */

/** Lo del admin en «•••» de un partido. */
export type AdminMenuKey = 'anotador' | 'reprogramar' | 'aplazar' | 'wo' | 'resolver' | 'corregir' | 'anular' | 'borrar';

/**
 * Qué puede hacer el admin con el partido según cómo está (puro, se prueba solo): el anotador de mesa y reprogramar
 * mientras no se juega, aplazar, W.O. si no tiene resultado, decidir un reclamo, poner o corregir el resultado, anular y
 * borrar (al final, en rojo). `official`: el nombre del anotador designado (o null); `first`: el equipo local.
 */
export function adminMenuEntries(
  m: Pick<Match, 'status' | 'scheduledAt'>,
  { official, first }: { official: string | null; first: string },
): { key: AdminMenuKey; label: string; hint?: string; danger?: boolean }[] {
  const open = isOpen(m) || m.status === 'postponed';
  return [
    ...(open ? [{ key: 'anotador' as const, label: 'Anotador de mesa', hint: official ?? 'Sin designar' }] : []),
    ...(m.status === 'scheduled' || m.status === 'postponed' || m.status === 'suspended'
      ? [{ key: 'reprogramar' as const, label: m.scheduledAt ? 'Reprogramar' : 'Poner fecha', hint: 'Fecha, hora y cancha' }]
      : []),
    ...(m.status === 'scheduled' || m.status === 'suspended' ? [{ key: 'aplazar' as const, label: 'Aplazar', hint: 'Queda sin fecha' }] : []),
    ...(!hasResult(m) && m.status !== 'void' ? [{ key: 'wo' as const, label: 'W.O.', hint: 'Quién no se presentó' }] : []),
    ...(m.status === 'disputed' ? [{ key: 'resolver' as const, label: 'Decidir el reclamo', hint: 'Queda confirmado' }] : []),
    { key: 'corregir' as const, label: hasResult(m) ? 'Corregir resultado' : 'Poner resultado', hint: `Primero ${first}` },
    ...(m.status !== 'void' ? [{ key: 'anular' as const, label: 'Anular', hint: 'No cuenta para la tabla' }] : []),
    { key: 'borrar' as const, label: 'Borrar el partido', danger: true },
  ];
}

/** Lo que se pregunta antes de aplazar, anular o borrar un partido. */
export const POSTPONE_ASK = { title: 'Aplazar el partido', message: 'Queda sin fecha hasta que lo reprogrames. Se avisa a los equipos al abrir la app.', confirmText: 'Aplazar' };
export const VOID_ASK = { title: 'Anular el partido', message: 'No cuenta para la tabla ni para las estadísticas. Se puede deshacer corrigiendo el resultado.', confirmText: 'Anular', danger: true };
export const DELETE_ASK = { title: 'Borrar el partido', message: 'Se borra con su convocatoria y su marcador. Esto no se puede deshacer.', confirmText: 'Borrar', danger: true };

/** La línea de abajo de «Poner resultado» / «Decidir el reclamo»: en qué orden va el marcador. */
export const resultHint = (names: readonly [string, string]) => `Primero ${names[0]}, después ${names[1]}. Queda confirmado.`;

/** «¿Quién no se presentó?»: las tres filas, en el orden de la web (`absent`: 1, 2 o 0 = ninguno). */
export function walkoverRows(names: readonly [string, string]): { absent: 0 | 1 | 2; label: string }[] {
  return [
    { absent: 1, label: `No vino ${names[0]}` },
    { absent: 2, label: `No vino ${names[1]}` },
    { absent: 0, label: 'No vino ninguno' },
  ];
}

/**
 * Los convocados («Voy» o «Tal vez») que tienen un aviso (p. ej. «Suspendido»): salen arriba de su equipo en la
 * convocatoria (la app avisa, no bloquea).
 */
export function flaggedCalled(sum: { yes: readonly string[]; maybe: readonly string[] }, flags: ReadonlyMap<string, string> | undefined): string[] {
  return flags ? [...sum.yes, ...sum.maybe].filter((pid) => flags.has(pid)) : [];
}

/** «3 van · faltan 2 · 1 no va»: la línea de cada equipo en la convocatoria (`line` = rsvpLine). */
export function convocatoriaLine(line: string, noCount: number): string {
  return noCount > 0 ? `${line} · ${noCount} no ${noCount === 1 ? 'va' : 'van'}` : line;
}
