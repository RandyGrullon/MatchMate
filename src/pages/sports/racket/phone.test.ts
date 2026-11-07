import { describe, expect, it } from 'vitest';
import type { RacketEvent } from '../../../lib/data/racket';
import { ladderStartOrder } from '../racket-formats/info';
import { builtInTemplates, canRepeatNight, defaultName, wizardConfig } from './create/wizard';
import { extraTemplates, racketPureExt } from './extensions';
import { matchAdminKeys, matchAdminText, playerOptions } from './match/adminMenu';
import { newNightConfig } from './logic/night';
import { mkMatch } from './logic/testMatch';

/** Lo puro que comparten la web y la app del teléfono: «Nuevo», las extensiones del deporte y «•••» del partido. */

const ev = (o: Partial<RacketEvent>): RacketEvent =>
  ({ id: 'E1', leagueId: 'L', type: 'cajas', name: 'Cajas de Ejemplo', date: '2026-10-01', startTime: null, config: {}, playerCount: 4, ...o }) as unknown as RacketEvent;

describe('Nuevo', () => {
  it('el nombre por defecto', () => {
    expect(defaultName('americano', '2026-10-08', true)).toBe('Americano del jueves');
    expect(defaultName('liga', '2026-10-08', false)).toBe('Liga');
    expect(defaultName('torneo', '2026-10-08', true)).toBe('Torneo de octubre');
  });

  it('las plantillas con lo del deporte', () => {
    expect(builtInTemplates(true, racketPureExt('padel')).map((t) => t.k)).toEqual(['americano', 'mexicano', 'liga', 'torneo']);
    const tennis = builtInTemplates(true, racketPureExt('tennis'));
    expect(tennis.map((t) => t.title)).toEqual(['Liga de dobles', 'Torneo con cuadro']);
    expect(builtInTemplates(false, racketPureExt('padel')).map((t) => t.k)).toEqual(['liga', 'torneo']);
    expect(extraTemplates('pickleball').map((t) => t.k)).toEqual(['social', 'cajas', 'escalera']);
    expect(canRepeatNight({ type: 'americano' }, true, racketPureExt('padel'))).toBe(true);
    expect(canRepeatNight({ type: 'americano' }, true, racketPureExt('tennis'))).toBe(false);
  });

  it('la configuración de la liga y del torneo', () => {
    const base = { night: newNightConfig('americano', { players: [], courts: ['Cancha 1'] }), levels: {}, signup: null, pairs: ['A', 'B'], double: true, date: '2026-10-08', time: '20:00', cats: 1, seed: 'noche:prueba' };
    expect(wizardConfig('liga', base)).toMatchObject({ pairs: ['A', 'B'], double: true, startDate: '2026-10-08', times: ['20:00'] });
    const t = wizardConfig('torneo', { ...base, cats: 2 }) as { categories: { id: string; pairs: string[] }[] };
    expect(t.categories.map((c) => [c.id, c.pairs.length])).toEqual([
      ['A', 0],
      ['B', 0],
    ]);
  });
});

describe('las extensiones puras', () => {
  it('la línea de las cajas y la escalera, y las palabras', () => {
    const ext = racketPureExt('tennis');
    expect(ext.eventInfo?.(ev({ config: { entrants: ['a', 'b', 'c'], doubles: false } }), ['jugador', 'jugadores'])).toEqual({ label: 'Liga por cajas', line: '3 jugadores' });
    expect(ext.eventInfo?.(ev({ type: 'escalera', config: { maxUp: 2 } }), ['jugador', 'jugadores'])?.line).toBe('4 jugadores · se reta hasta 2 arriba');
    expect(racketPureExt('table_tennis').words?.court).toEqual(['mesa', 'mesas']);
    expect(racketPureExt('pickleball').words?.nights).toBe('Round robin');
    // Siempre el mismo objeto por deporte.
    expect(racketPureExt('padel')).toBe(racketPureExt('padel'));
  });

  it('el orden de salida de la escalera: por nivel y los sin nivel abajo', () => {
    const lv: Record<string, number> = { b: 4.5, c: 3 };
    expect(ladderStartOrder(['a', 'b', 'c', 'd'], (id) => lv[id] ?? null)).toEqual(['b', 'c', 'a', 'd']);
  });
});

describe('«•••» del partido', () => {
  it('cuáles salen según el estado', () => {
    const open = mkMatch({ a: ['a'], b: ['b'] });
    expect(matchAdminKeys(open, { isAdmin: true, points: false, canCorrect: true })).toEqual(['wo', 'aplazar', 'fecha', 'quien', 'anular', 'borrar']);
    expect(matchAdminKeys(open, { isAdmin: true, points: true, canCorrect: true })).toEqual(['aplazar', 'fecha', 'quien', 'anular', 'borrar']);
    const done = mkMatch({ a: ['a'], b: ['b'], status: 'confirmed', score: { text: '6-4 6-4', sets: [[6, 4], [6, 4]] }, winner: 1 });
    expect(matchAdminKeys(done, { isAdmin: true, points: false, canCorrect: true })).toEqual(['quien', 'corregir', 'anular', 'borrar']);
    expect(matchAdminKeys(done, { isAdmin: false, points: false, canCorrect: true })).toEqual([]);
    expect(matchAdminText('fecha', { scheduledAt: null }, 'mesa').label).toBe('Poner fecha y mesa');
  });

  it('quién juega: los de la pareja primero', () => {
    const players = [
      { id: 'z', name: 'Ana' },
      { id: 'y', name: 'Beto' },
      { id: 'x', name: 'Carla' },
    ];
    expect(playerOptions(players, ['x']).map((p) => p.id)).toEqual(['x', 'z', 'y']);
  });
});
