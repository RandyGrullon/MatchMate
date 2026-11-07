import type { Entry } from '../../lib/types';

/**
 * Lo de «•••» de un evento del boliche sin pantalla (EventPage de la web y el evento de la app): los nombres de Ajustes y
 * Eliminar, la pregunta antes de borrarlo y si tus juegos se pueden publicar en Social. Pruebas en eventActions.test.ts.
 */

/** «Ajustes del torneo» o «Ajustes de la práctica» (con «Fecha, juegos y más» debajo). */
export const eventSettingsLabel = (isTorneo: boolean) => (isTorneo ? 'Ajustes del torneo' : 'Ajustes de la práctica');
export const EVENT_SETTINGS_HINT = 'Fecha, juegos y más';

/** «Eliminar torneo» o «Eliminar práctica». */
export const deleteEventLabel = (isTorneo: boolean) => `Eliminar ${isTorneo ? 'torneo' : 'práctica'}`;

/** La pregunta antes de eliminar el evento (`label`: su nombre, eventLabel). */
export const deleteEventConfirm = (label: string) => ({
  title: `¿Eliminar ${label}?`,
  message: 'Se borran sus inscritos, equipos, juegos, fotos y envíos pendientes. No se puede deshacer.',
  confirmText: 'Eliminar',
  danger: true,
});

export const EVENT_DELETED = 'Evento eliminado';

/** Tus juegos anotados en el evento (los que salen en la publicación). */
export const publishableScores = (mine: Pick<Entry, 'scores'> | null | undefined): number[] => (mine ? mine.scores.filter((s): s is number => s != null) : []);

/** Tus juegos de este evento se publican si eres miembro de una liga sin menores (`target`) y ya anotaste alguno. */
export const canPublishEvent = (target: unknown, mine: Pick<Entry, 'scores'> | null | undefined) => !!target && !!mine && publishableScores(mine).length > 0;
