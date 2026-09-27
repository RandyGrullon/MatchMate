import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { pointsEngine, type PointsConfig, type PointsEvent, type PointsState } from '../sports/formats/social';
import { courtKey, createCourtStore, pruneCourtLogs, resetMemoryCourtStore } from './log';
import { applyEvent, snapshotState, startSnapshot } from './session';
import type { CourtAdapter, CourtSnapshot } from './types';

const points: CourtAdapter<PointsConfig, PointsState, PointsEvent> = {
  engine: pointsEngine,
  score: (s) => ({ text: `${s.score[0]}-${s.score[1]}`, sides: [s.score[0], s.score[1]] }),
};

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetMemoryCourtStore();
});

describe('lista guardada en el teléfono', () => {
  it('clave mm:cancha:<liga>:<partido>', () => {
    expect(courtKey('L', 'M')).toBe('mm:cancha:L:M');
  });

  it('se guarda después de cada toque: recargar la app no pierde ningún punto', async () => {
    const a = createCourtStore('idb');
    let snap: CourtSnapshot<PointsConfig, PointsState, PointsEvent> = startSnapshot({ mode: 'total', target: 21 }, 0, 'tel');
    const taps: PointsEvent[] = [
      { type: 'point', side: 1 },
      { type: 'point', side: 2 },
      { type: 'point', side: 1 },
      { type: 'point', side: 1 },
    ];
    let last: Promise<void> = Promise.resolve();
    for (const ev of taps) {
      snap = applyEvent(points, snap, ev).snap;
      // Sin esperar cada una: como la pantalla, que no espera a IndexedDB. Se guardan en orden.
      last = a.save({ lid: 'L', mid: 'M', uid: 'u1', snap, published: 0 });
    }
    await last;
    // «Recargar»: otra conexión a la misma base.
    const b = createCourtStore('idb');
    const rec = await b.load('L', 'M');
    expect(rec).toMatchObject({ key: 'mm:cancha:L:M', lid: 'L', mid: 'M', uid: 'u1', published: 0 });
    expect(rec!.snap.seq).toBe(4);
    expect(snapshotState(points, rec!.snap as typeof snap).score).toEqual([3, 1]);
    a.close();
    b.close();
  });

  it('patch, remove y list', async () => {
    const s = createCourtStore('idb');
    const snap = startSnapshot({ mode: 'time' });
    await s.save({ lid: 'L', mid: 'M1', uid: null, snap, published: 0 });
    await s.save({ lid: 'L', mid: 'M2', uid: null, snap, published: 0 });
    await s.patch('L', 'M1', { published: 7, finished: true });
    await s.patch('L', 'no-existe', { published: 1 });
    expect((await s.load('L', 'M1'))?.published).toBe(7);
    expect(await s.load('L', 'no-existe')).toBeNull();
    expect((await s.list()).map((r) => r.mid).sort()).toEqual(['M1', 'M2']);
    await s.remove('L', 'M2');
    expect((await s.list()).map((r) => r.mid)).toEqual(['M1']);
    s.close();
  });

  it('limpieza: las terminadas que el servidor ya cerró y las muy viejas', async () => {
    const s = createCourtStore('memory');
    const snap = startSnapshot({ mode: 'time' });
    await s.save({ lid: 'L', mid: 'enviado', uid: null, snap, published: 3, finished: true });
    await s.save({ lid: 'L', mid: 'en-cola', uid: null, snap, published: 3, finished: true });
    await s.save({ lid: 'L', mid: 'abierto', uid: null, snap, published: 3 });
    const n = await pruneCourtLogs(s, new Set(['enviado']));
    expect(n).toBe(1);
    expect((await s.list()).map((r) => r.mid).sort()).toEqual(['abierto', 'en-cola']);
    // Treinta y un días después: todo fuera.
    expect(await pruneCourtLogs(s, new Set(), 30 * 24 * 3600 * 1000, Date.now() + 31 * 24 * 3600 * 1000)).toBe(2);
  });

  it('un registro dañado no se carga', async () => {
    const s = createCourtStore('memory');
    await s.save({ lid: 'L', mid: 'M', uid: null, snap: { v: 9 } as unknown as CourtSnapshot, published: 0 });
    expect(await s.load('L', 'M')).toBeNull();
  });
});
