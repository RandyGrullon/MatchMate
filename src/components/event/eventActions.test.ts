/** Lo de «•••» del evento sin pantalla (eventActions.ts): nombres, la pregunta de eliminar y publicar tus juegos. */
import { describe, expect, it } from 'vitest';
import { canPublishEvent, deleteEventConfirm, deleteEventLabel, eventSettingsLabel, publishableScores } from './eventActions';

describe('event/eventActions', () => {
  it('los nombres de Ajustes y Eliminar, y la pregunta', () => {
    expect(eventSettingsLabel(true)).toBe('Ajustes del torneo');
    expect(eventSettingsLabel(false)).toBe('Ajustes de la práctica');
    expect(deleteEventLabel(true)).toBe('Eliminar torneo');
    expect(deleteEventLabel(false)).toBe('Eliminar práctica');
    expect(deleteEventConfirm('Torneo de Ejemplo')).toEqual({
      title: '¿Eliminar Torneo de Ejemplo?',
      message: 'Se borran sus inscritos, equipos, juegos, fotos y envíos pendientes. No se puede deshacer.',
      confirmText: 'Eliminar',
      danger: true,
    });
  });

  it('tus juegos se publican si la liga deja y ya anotaste alguno', () => {
    const target = { id: 'liga-1', name: 'Liga de Ejemplo' };
    expect(publishableScores({ scores: [180, null, 201] })).toEqual([180, 201]);
    expect(canPublishEvent(target, { scores: [180, null] })).toBe(true);
    expect(canPublishEvent(target, { scores: [null, null] })).toBe(false);
    expect(canPublishEvent(null, { scores: [180] })).toBe(false);
    expect(canPublishEvent(target, null)).toBe(false);
  });
});
