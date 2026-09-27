import { afterEach, describe, expect, it } from 'vitest';
import { BackendError } from '../lib/backend/types';
import type { ClaimResult, FinishResult, PublishResult } from '../lib/data/matches';
import { pointsEngine, type PointsConfig, type PointsEvent, type PointsState } from '../sports/formats/social';
import { createCourtStore, resetMemoryCourtStore, type CourtStore } from './log';
import { createCourtMachine, type CourtDeps, type CourtMachine } from './machine';
import { applyEvent, startSnapshot, withOrigin } from './session';
import type { CourtAdapter, CourtSnapshot } from './types';

const points: CourtAdapter<PointsConfig, PointsState, PointsEvent> = {
  engine: pointsEngine,
  score: (s) => ({ text: `${s.score[0]}-${s.score[1]}`, sides: [s.score[0], s.score[1]] }),
};
const CFG: PointsConfig = { mode: 'total', target: 8 };
const p1: PointsEvent = { type: 'point', side: 1 };
const p2: PointsEvent = { type: 'point', side: 2 };

const claimOk = (state: unknown = null): ClaimResult => ({
  ok: true,
  scorerId: 'u1',
  scorerName: 'Ana',
  leaseUntil: null,
  expired: false,
  status: 'live',
  seq: 0,
  version: 1,
  state: state as Record<string, unknown> | null,
});

const net = () => new BackendError('Sin conexión (prueba)', 'network');
const never = <T>() => new Promise<T>(() => {});

interface Fake {
  deps: CourtDeps;
  claim: (force: boolean) => Promise<ClaimResult>;
  publish: (p: { seq: number }) => Promise<PublishResult>;
  finish: () => Promise<FinishResult | undefined>;
  published: { seq: number; state: Record<string, unknown>; score: unknown }[];
  finished: unknown[];
  suspended: unknown[];
}

function fake(store: CourtStore, origin = 'tel-A'): Fake {
  const f: Fake = {
    claim: async () => claimOk(),
    publish: async (p) => ({ ok: true, seq: p.seq }),
    finish: async () => ({ ok: true, status: 'finished' }),
    published: [],
    finished: [],
    suspended: [],
    deps: null as unknown as CourtDeps,
  };
  f.deps = {
    claim: (force) => f.claim(force),
    publish: (p) => {
      f.published.push(p);
      return f.publish(p);
    },
    finish: (r) => {
      f.finished.push(r);
      return f.finish();
    },
    suspend: async (r) => void f.suspended.push(r),
    store,
    origin,
  };
  return f;
}

const machines: CourtMachine<PointsConfig, PointsState, PointsEvent>[] = [];
function machine(f: Fake, config: PointsConfig | null = CFG, userId: string | null = 'u1') {
  const m = createCourtMachine({ lid: 'L', mid: 'M', userId, adapter: points, config, deps: f.deps });
  machines.push(m);
  return m;
}

afterEach(async () => {
  for (const m of machines.splice(0)) m.close();
  await new Promise((r) => setTimeout(r, 0));
  resetMemoryCourtStore();
});

/** Espera a que terminen las escrituras y respuestas pendientes. */
const settle = () => new Promise((r) => setTimeout(r, 0));

function remote(origin: string, evs: PointsEvent[], from?: CourtSnapshot<PointsConfig, PointsState, PointsEvent>) {
  let s = withOrigin(from ?? startSnapshot<PointsConfig, PointsState, PointsEvent>(CFG, 0), origin);
  for (const ev of evs) s = applyEvent(points, s, ev).snap;
  return s;
}

describe('modo cancha sin React', () => {
  it('sin señal: anota igual; al recargar sigue igual y al volver la señal publica lo pendiente', async () => {
    const store = createCourtStore('memory');
    const a = fake(store);
    a.claim = async () => {
      throw net();
    };
    a.publish = () => never();
    const m = machine(a);
    await m.open();
    expect(m.getView()).toMatchObject({ ready: true, lease: { kind: 'offline' }, readOnly: false });
    expect(m.apply(p1)).toBeNull();
    expect(m.apply(p1)).toBeNull();
    expect(m.apply(p2)).toBeNull();
    expect(m.getView()).toMatchObject({ summary: '2-1', score: { text: '2-1', sides: [2, 1] }, unsent: 3, canUndo: true });
    await settle();

    // Recarga: otra máquina con el mismo almacén; ahora hay señal y nadie más anotó.
    const b = fake(store);
    b.claim = async () => claimOk(null);
    const m2 = machine(b);
    await m2.open();
    expect(m2.getView()).toMatchObject({ lease: { kind: 'mine' }, summary: '2-1' });
    // Las jugadas hechas sin señal se publican enseguida (con el estado completo para retomar).
    expect(b.published).toHaveLength(1);
    expect(b.published[0]).toMatchObject({ seq: 3, score: { text: '2-1' }, state: { v: 1, seq: 3, origin: 'tel-A' } });
    await settle();
    expect((await store.load('L', 'M'))?.published).toBe(3);
    expect(m2.getView().unsent).toBe(0);
  });

  it('deshacer y una jugada que el motor rechaza', async () => {
    const f = fake(createCourtStore('memory'));
    const m = machine(f, { mode: 'total', target: 2 });
    await m.open();
    m.apply(p1);
    m.apply(p2);
    expect(m.getView().over).toBe(true);
    expect(m.apply(p1)).toBe('El partido ya terminó.');
    expect(m.getView()).toMatchObject({ error: 'El partido ya terminó.', summary: '1-1' });
    expect(m.undo()).toBe(true);
    expect(m.getView()).toMatchObject({ summary: '1-0', over: false, error: null });
    expect(m.getView().snapshot?.seq).toBe(3);
  });

  it('otro anotador tomó el control: solo lectura y la lista del teléfono queda guardada', async () => {
    const store = createCourtStore('memory');
    const f = fake(store);
    f.publish = async () => ({ ok: false, reason: 'lease', scorerId: 'u2', scorerName: 'Luis' });
    const m = machine(f);
    await m.open();
    m.apply(p1);
    await settle();
    expect(m.getView()).toMatchObject({ lease: { kind: 'other', scorerName: 'Luis' }, readOnly: true, canUndo: false });
    expect(m.apply(p2)).toBe('Otro anotador tiene el control.');
    expect(m.undo()).toBe(false);
    expect((await store.load('L', 'M'))?.snap.seq).toBe(1);
    // Pedir el turno: el servidor dice que sigue siendo de otro.
    f.claim = async () => ({ ...claimOk(), ok: false, scorerId: 'u2', scorerName: 'Luis', expired: true });
    await m.claim();
    expect(m.getView().lease).toEqual({ kind: 'other', scorerId: 'u2', scorerName: 'Luis', expired: true });
  });

  it('retomar en otro teléfono desde lo publicado', async () => {
    const f = fake(createCourtStore('memory'), 'tel-B');
    const fromA = remote('tel-A', [p1, p1, p2, p1]);
    f.claim = async () => claimOk(fromA);
    const m = machine(f, null);
    await m.open();
    expect(m.getView()).toMatchObject({ ready: true, summary: '3-1', unsent: 0, conflict: false });
    expect(f.published).toHaveLength(0);
    m.apply(p2);
    expect(f.published.at(-1)).toMatchObject({ seq: 5, score: { text: '3-2' }, state: { origin: 'tel-B' } });
  });

  it('conflicto: el teléfono tenía jugadas sin enviar pero otro siguió después → gana el servidor', async () => {
    const store = createCourtStore('memory');
    const mine = remote('tel-A', [p1, p1, p1, p1, p1]);
    await store.save({ lid: 'L', mid: 'M', uid: 'u1', snap: mine, published: 2 });
    const byB = remote('tel-B', [p2, p2], remote('tel-A', [p1, p1]));
    const f = fake(store);
    f.claim = async () => claimOk(byB);
    const m = machine(f);
    await m.open();
    expect(m.getView()).toMatchObject({ summary: '2-2', conflict: true });
    await settle();
    const rec = await store.load('L', 'M');
    expect(rec?.orphan?.seq).toBe(5);
    expect(rec?.snap.seq).toBe(4);
  });

  it('otra cuenta en el mismo teléfono no usa la lista de la anterior', async () => {
    const store = createCourtStore('memory');
    await store.save({ lid: 'L', mid: 'M', uid: 'otra', snap: remote('tel-A', [p1]), published: 0 });
    const m = machine(fake(store));
    await m.open();
    expect(m.getView()).toMatchObject({ summary: '0-0' });
  });

  it('terminar: enviado borra la lista; sin señal queda marcada y sale sola', async () => {
    const store = createCourtStore('memory');
    const f = fake(store);
    const m = machine(f, { mode: 'total', target: 3 });
    await m.open();
    m.apply(p1);
    m.apply(p1);
    m.apply(p2);
    expect(await m.finish()).toBe('sent');
    expect(f.finished[0]).toMatchObject({ winner: 1, seq: 3, score: { text: '2-1' }, state: { seq: 3 } });
    expect(await store.load('L', 'M')).toBeNull();
    expect(m.getView()).toMatchObject({ lease: { kind: 'closed', status: 'finished' }, readOnly: true });

    const g = fake(store);
    g.finish = async () => undefined;
    const q = machine(g, { mode: 'total', target: 3 });
    await q.open();
    q.apply(p2);
    expect(await q.finish()).toBe('queued');
    expect((await store.load('L', 'M'))?.finished).toBe(true);
    // Cuando el servidor ya tiene el final (llega el partido cerrado), la lista se borra.
    q.setStatus('finished');
    await settle();
    expect(await store.load('L', 'M')).toBeNull();
  });

  it('suspender guarda el marcador parcial; el servidor cierra el partido: deja de anotar', async () => {
    const f = fake(createCourtStore('memory'));
    const m = machine(f);
    await m.open();
    m.apply(p1);
    await m.suspend('Lluvia');
    expect(f.suspended[0]).toMatchObject({ note: 'Lluvia', seq: 1, score: { text: '1-0' } });
    expect(m.getView().lease).toEqual({ kind: 'closed', status: 'suspended' });

    const g = fake(createCourtStore('memory'));
    const n = machine(g);
    await n.open();
    n.setStatus('postponed');
    expect(n.getView()).toMatchObject({ readOnly: true, lease: { kind: 'closed', status: 'postponed' } });
    expect(n.apply(p1)).toBe('El partido ya no se anota.');
  });

  it('sin permiso para anotar', async () => {
    const f = fake(createCourtStore('memory'));
    f.claim = async () => {
      throw new BackendError('no_permitido', 'permission', '42501');
    };
    const m = machine(f);
    await m.open();
    expect(m.getView()).toMatchObject({ lease: { kind: 'denied' }, readOnly: true });
  });
});
