/** La página En vivo sin pantalla (la web y la app): cuál se ve, la línea de abajo y sus textos. */
import { describe, expect, it } from 'vitest';
import { activateLiveText, endStreamConfirm, noLiveText, notEmbeddableText, pickStream, startedText, streamLine } from './logic';

describe('En vivo', () => {
  it('se ve la pedida (?s=) o la primera; las otras debajo', () => {
    const list = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    expect(pickStream(list, 'B')).toEqual({ current: { id: 'B' }, others: [{ id: 'A' }, { id: 'C' }] });
    expect(pickStream(list, 'NO').current).toEqual({ id: 'A' });
    expect(pickStream([], null)).toEqual({ current: null, others: [] });
  });

  it('la línea: el partido si el título es otro, y la plataforma', () => {
    expect(streamLine({ title: 'Final de Ejemplo', label: 'Equipo Uno vs Equipo Dos', platform: 'youtube' })).toBe('Equipo Uno vs Equipo Dos · YouTube');
    expect(streamLine({ title: 'Equipo Uno vs. Equipo Dos', label: 'Equipo Uno vs Equipo Dos', platform: 'twitch' })).toBe('Twitch');
  });

  it('los textos de la página', () => {
    expect(noLiveText({ kind: 'liga', liveEnabled: true })).toBe('Cuando la liga transmita un partido, se ve aquí.');
    expect(noLiveText({ kind: 'torneo', liveEnabled: false })).toBe('Este torneo no tiene activadas las transmisiones en vivo.');
    expect(activateLiveText({ kind: 'liga' })).toBe('Actívalas en Ajustes de la liga');
    expect(notEmbeddableText('instagram')).toBe('Instagram no deja ver la transmisión dentro de otra app: se abre allá.');
    expect(endStreamConfirm('youtube').message).toBe('Deja de salir en la liga y en Hoy. El video sigue en YouTube.');
    expect(startedText({ title: null, label: null })).toContain('«Transmisión de la liga» sale arriba en la liga');
  });
});
