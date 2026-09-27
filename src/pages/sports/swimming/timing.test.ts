import { afterEach, describe, expect, it } from 'vitest';
import {
  applyTiming,
  emptyTiming,
  heatOrder,
  laneDone,
  laneValue,
  loadTiming,
  replayTiming,
  saveTiming,
  sweepTimings,
  timingKey,
  type TimingEvent,
} from './timing';

const T0 = 1_000_000;

describe('cronometraje de una serie', () => {
  it('SALIDA y STOP por carril dan centésimas', () => {
    const s = replayTiming([
      { t: 'start', at: T0 },
      { t: 'stop', lane: 3, at: T0 + 28_454 },
      { t: 'stop', lane: 4, at: T0 + 65_320 },
    ]);
    expect(s.startedAt).toBe(T0);
    expect(s.lanes[3]).toEqual({ time: 2845, source: 'watch' });
    expect(s.lanes[4].time).toBe(6532);
  });

  it('sin SALIDA el STOP no vale; dos SALIDAS tampoco', () => {
    expect(() => applyTiming(emptyTiming(), { t: 'stop', lane: 1, at: T0 })).toThrow('SALIDA');
    const s = applyTiming(emptyTiming(), { t: 'start', at: T0 });
    expect(() => applyTiming(s, { t: 'start', at: T0 + 5 })).toThrow('corriendo');
    // Al recalcular, los toques que no valen se saltan.
    expect(replayTiming([{ t: 'stop', lane: 1, at: T0 }, { t: 'start', at: T0 }]).lanes).toEqual({});
  });

  it('el teclado manda sobre el cronómetro; con 3 cronómetros vale el del medio', () => {
    const log: TimingEvent[] = [
      { t: 'start', at: T0 },
      { t: 'stop', lane: 2, at: T0 + 30_000 },
      { t: 'time', lane: 2, cs: 2999 },
      { t: 'time', lane: 5, cs: null, watches: [3010, 3002, 3020] },
    ];
    const s = replayTiming(log);
    expect(s.lanes[2]).toEqual({ time: 2999, source: 'manual' });
    expect(s.lanes[5].time).toBe(3010);
  });

  it('DQ conserva el tiempo; DNS y DNF lo borran; un tiempo nuevo quita el DNS', () => {
    let s = replayTiming([
      { t: 'start', at: T0 },
      { t: 'stop', lane: 1, at: T0 + 31_000 },
      { t: 'status', lane: 1, status: 'dq' },
    ]);
    expect(laneValue(undefined, s.lanes[1])).toEqual({ time: 3100, status: 'dq' });
    s = applyTiming(s, { t: 'status', lane: 1, status: 'dns' });
    expect(laneValue(undefined, s.lanes[1])).toEqual({ time: null, status: 'dns' });
    s = applyTiming(s, { t: 'stop', lane: 1, at: T0 + 32_000 });
    expect(laneValue(undefined, s.lanes[1])).toEqual({ time: 3200, status: 'ok' });
    s = applyTiming(s, { t: 'status', lane: 1, status: 'dnf' });
    s = applyTiming(s, { t: 'time', lane: 1, cs: 3300 });
    expect(laneValue(undefined, s.lanes[1])).toEqual({ time: 3300, status: 'ok' });
  });

  it('reiniciar el cronómetro borra solo los tiempos del cronómetro', () => {
    const s = replayTiming([
      { t: 'start', at: T0 },
      { t: 'stop', lane: 1, at: T0 + 31_000 },
      { t: 'time', lane: 2, cs: 3000 },
      { t: 'status', lane: 3, status: 'dns' },
      { t: 'stop', lane: 4, at: T0 + 33_000 },
      { t: 'status', lane: 4, status: 'dq' },
      { t: 'reset' },
    ]);
    expect(s.startedAt).toBeNull();
    expect(s.lanes).toEqual({ 2: { time: 3000, source: 'manual' }, 3: { status: 'dns', time: null }, 4: { status: 'dq' } });
  });

  it('deshacer = recalcular sin el último toque', () => {
    const log: TimingEvent[] = [
      { t: 'start', at: T0 },
      { t: 'stop', lane: 1, at: T0 + 31_000 },
      { t: 'stop', lane: 1, at: T0 + 35_000 },
    ];
    expect(replayTiming(log.slice(0, -1)).lanes[1].time).toBe(3100);
  });

  it('lo del servidor vale mientras no se toque el carril', () => {
    expect(laneValue({ time: 3000, status: 'ok' }, undefined)).toEqual({ time: 3000, status: 'ok' });
    expect(laneValue({ time: 3000, status: 'ok' }, { time: null, source: 'manual' })).toEqual({ time: null, status: 'ok' });
    expect(laneValue({ time: 3000, status: 'dq' }, { time: 2900, source: 'manual' })).toEqual({ time: 2900, status: 'dq' });
    expect(laneDone({ time: null, status: 'ok' })).toBe(false);
    expect(laneDone({ time: null, status: 'dns' })).toBe(true);
  });

  it('orden de llegada en la serie (empates comparten; DQ y sin tiempo no)', () => {
    expect(
      heatOrder({
        1: { time: 3100, status: 'ok' },
        2: { time: 3000, status: 'ok' },
        3: { time: 3000, status: 'ok' },
        4: { time: 2900, status: 'dq' },
        5: { time: null, status: 'ok' },
        6: { time: 3200, status: 'ok' },
      }),
    ).toEqual({ 2: 1, 3: 1, 1: 3, 6: 4 });
  });
});

describe('guardado en el teléfono', () => {
  const mem = new Map<string, string>();
  const fake = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
    clear: () => mem.clear(),
  } as Storage;
  const g = globalThis as { localStorage?: Storage };
  const before = g.localStorage;
  g.localStorage = fake;
  afterEach(() => mem.clear());

  it('guarda y recupera la lista de toques por prueba y serie (con prefijo mm:)', () => {
    const key = timingKey('ev1', 2);
    expect(key).toBe('mm:swim:t:ev1:2');
    expect(loadTiming(key)).toEqual({ log: [], publishedAt: null });
    saveTiming(key, [{ t: 'start', at: T0 }], null, T0);
    expect(loadTiming(key)).toEqual({ log: [{ t: 'start', at: T0 }], publishedAt: null });
    saveTiming(key, [{ t: 'start', at: T0 }], T0 + 5, T0);
    expect(loadTiming(key).publishedAt).toBe(T0 + 5);
    saveTiming(key, [], null);
    expect(mem.has(key)).toBe(false);
  });

  it('lo viejo (más de 3 días) o dañado se borra; lo demás no se toca', () => {
    saveTiming(timingKey('a', 1), [{ t: 'start', at: T0 }], null, T0);
    saveTiming(timingKey('b', 1), [{ t: 'start', at: T0 }], null, T0 + 4 * 86_400_000);
    mem.set('mm:swim:t:c:1', '{roto');
    mem.set('mm:liga', 'x');
    sweepTimings(T0 + 4 * 86_400_000 + 1);
    expect([...mem.keys()].sort()).toEqual(['mm:liga', 'mm:swim:t:b:1']);
  });

  it('sin almacenamiento no falla', () => {
    g.localStorage = undefined;
    expect(loadTiming('x')).toEqual({ log: [], publishedAt: null });
    expect(() => saveTiming('x', [], 1)).not.toThrow();
    expect(() => sweepTimings()).not.toThrow();
    g.localStorage = before ?? fake;
  });
});
