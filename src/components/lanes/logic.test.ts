/** Evento › Pistas sin pantalla (logic.ts): lo último que usó el admin, las formas de repartir y los avisos. */
import { beforeEach, describe, expect, it } from 'vitest';
import { clearLanesConfirm, laneCandidatesText, laneModeHint, laneModes, lanesDontFitText, lanesPublishedText, lanesStatus, publishLanesConfirm, readLanePrefs, saveLanePrefs } from './logic';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

describe('lanes/logic', () => {
  it('recuerda las pistas y los jugadores por pista de cada liga (lo que no vale, con lo de siempre)', () => {
    expect(readLanePrefs('liga-1')).toEqual({ lanes: '', perLane: 4 });
    saveLanePrefs('liga-1', { lanes: '5-9', perLane: 3 });
    expect(readLanePrefs('liga-1')).toEqual({ lanes: '5-9', perLane: 3 });
    expect(readLanePrefs('liga-2')).toEqual({ lanes: '', perLane: 4 });
    store.set('mm:pistas:liga-3', JSON.stringify({ lanes: 'abc', perLane: 40 }));
    expect(readLanePrefs('liga-3')).toEqual({ lanes: '', perLane: 4 });
  });

  it('«Por equipo» solo con equipos; si no, vuelve a «Por promedio»', () => {
    expect(laneModes('equipo', false)).toEqual({ modes: [{ key: 'promedio', label: 'Por promedio' }, { key: 'azar', label: 'Al azar' }], active: 'promedio' });
    expect(laneModes('equipo', true).active).toBe('equipo');
    expect(laneModes('azar', false).active).toBe('azar');
  });

  it('los textos', () => {
    expect(laneModeHint('promedio', 7, 2, 4)).toBe('Los de promedios parecidos juntos. Hacen falta 2 pistas de 4.');
    expect(laneModeHint('azar', 0, 0, 4)).toBe('Al azar, cada vez distinto.');
    expect(laneModeHint('equipo', 3, 1, 4)).toBe('Los de un mismo equipo juntos. Hacen falta 1 pista de 4.');
    expect(laneCandidatesText(1)).toBe('1 jugador: los que dijeron «voy» o están inscritos.');
    expect(laneCandidatesText(0)).toBe('Todavía nadie dijo «voy» ni está inscrito.');
    expect(lanesDontFitText(9, 8)).toBe('No caben: son 9 y hay 8 lugares. Agrega pistas o sube los jugadores por pista.');
    expect(lanesStatus(false, 3)).toEqual({ tone: 'warn', text: 'Sin publicar' });
    expect(lanesStatus(true, 1)).toEqual({ tone: 'warn', text: '1 cambio sin avisar' });
    expect(lanesStatus(true, 0)).toEqual({ tone: 'ok', text: 'Publicadas' });
    expect(lanesPublishedText(2)).toBe('Pistas publicadas: le avisamos a 2 jugadores');
    expect(lanesPublishedText(0)).toBe('Pistas publicadas (nadie de la lista tiene cuenta)');
    expect(publishLanesConfirm(true).title).toBe('¿Avisar las pistas otra vez?');
    expect(clearLanesConfirm(false).message).toBe('Puedes armarlas otra vez cuando quieras.');
  });
});
