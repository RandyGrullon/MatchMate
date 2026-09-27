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
  claims: number;
  released: number;
  discarded: number;
  cached: { state: unknown; seq: number } | null;
}

function fake(store: CourtStore, origin = 'tel-A'): Fake {
  const f: Fake = {
    claim: async () => claimOk(),
    publish: async (p) => ({ ok: true, seq: p.seq }),
    finish: async () => ({ ok: true, status: 'finished' }),
    published: [],
    finished: [],
    suspended: [],
    claims: 0,
    released: 0,
    discarded: 0,
    cached: null,
    deps: null as unknown as CourtDeps,
  };
  f.deps = {
    claim: (force) => {
      f.claims++;
      return f.claim(force);
    },
    publish: (p) => {
      f.published.push(p);
      return f.publish(p);
    },
    finish: (r) => {
      f.finished.push(r);
      return f.finish();
    },
    suspend: async (r) => void f.suspended.push(r),
    release: async () => void f.released++,
    discardQueued: async () => void f.discarded++,
    cached: () => f.cached,
    store,
    origin,
  };
  return f;
}

const machines: CourtMachine<PointsConfig, PointsState, PointsEvent>[] = [];
function machine(f: Fake, config: PointsConfig | null = CFG, userId: string | null = 'u1', claimRetryMs?: number) {
  const m = createCourtMachine({ lid: 'L', mid: 'M', userId, adapter: points, config, deps: f.deps, claimRetryMs });
  machines.push(m);
  return m;
}

/** El turno con la lista publicada `state`, el partido en `status` y su seq. */
const claimWith = (state: unknown, status: ClaimResult['status'], seq: number): ClaimResult => ({ ...claimOk(state), status, seq });

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

describe('partido suspendido, sin señal y listas de otros teléfonos', () => {
  it('abrir un partido suspendido solo para mirar: no publica nada (no lo pone en vivo) y al salir suelta el turno', async () => {
    const f = fake(createCourtStore('memory'), 'tel-B');
    const fromA = remote('tel-A', [p1, p2, p1]);
    f.claim = async () => claimWith(fromA, 'suspended', 3);
    const m = machine(f);
    m.setStatus('suspended');
    await m.open();
    expect(m.getView()).toMatchObject({ lease: { kind: 'mine' }, summary: '2-1', unsent: 0 });
    // Bloquear el teléfono (visibilitychange) y salir con la X.
    m.flush();
    m.close();
    await settle();
    expect(f.published).toHaveLength(0);
    expect(f.released).toBe(1);
  });

  it('retomar un suspendido: lo nuevo se publica sobre la lista de quien lo dejó (y el turno sigue siendo suyo)', async () => {
    const f = fake(createCourtStore('memory'), 'tel-B');
    const fromA = remote('tel-A', [p1, p2, p1]);
    f.claim = async () => claimWith(fromA, 'suspended', 3);
    const m = machine(f);
    m.setStatus('suspended');
    await m.open();
    expect(m.apply(p2)).toBeNull();
    expect(f.published).toHaveLength(1);
    expect(f.published[0]).toMatchObject({ seq: 4, score: { text: '2-2' }, state: { seq: 4, origin: 'tel-B', parent: { origin: 'tel-A', seq: 3 } } });
    m.close();
    expect(f.released).toBe(0);
  });

  it('sin señal y sin lista en este teléfono: sigue desde lo que ya había visto (no desde 0-0) y pide el turno antes de publicar', async () => {
    const f = fake(createCourtStore('memory'), 'tel-B');
    const fromA = remote('tel-A', [p1, p1, p2]);
    f.cached = { state: fromA, seq: 3 };
    f.claim = async () => {
      throw net();
    };
    const m = machine(f);
    await m.open();
    expect(m.getView()).toMatchObject({ lease: { kind: 'offline' }, summary: '2-1', unsent: 0, readOnly: false });
    expect(m.apply(p1)).toBeNull();
    m.flush();
    // Todavía no sabe si otro siguió el partido: no publica nada.
    expect(f.published).toHaveLength(0);
    expect(m.getView()).toMatchObject({ summary: '3-1', unsent: 1 });
    // Vuelve la señal: nadie siguió después; pide el turno y recién ahí publica, sobre lo de A.
    f.claim = async () => claimWith(fromA, 'suspended', 3);
    await m.claim();
    expect(m.getView()).toMatchObject({ lease: { kind: 'mine' }, summary: '3-1', conflict: false });
    expect(f.published).toHaveLength(1);
    expect(f.published[0]).toMatchObject({ seq: 4, score: { text: '3-1' }, state: { seq: 4, origin: 'tel-B', parent: { origin: 'tel-A', seq: 3 } } });
  });

  it('sin señal y sin lista: si otro siguió el partido mientras tanto, gana el servidor y lo de este teléfono queda aparte', async () => {
    const f = fake(createCourtStore('memory'), 'tel-B');
    const fromA = remote('tel-A', [p1, p1, p2]);
    f.cached = { state: fromA, seq: 3 };
    f.claim = async () => {
      throw net();
    };
    const m = machine(f);
    await m.open();
    m.apply(p1);
    const byC = remote('tel-C', [p2, p2], fromA);
    f.claim = async () => claimWith(byC, 'live', 5);
    await m.claim();
    expect(m.getView()).toMatchObject({ lease: { kind: 'mine' }, summary: '2-3', conflict: true, unsent: 0 });
    expect(f.published).toHaveLength(0);
    expect(f.discarded).toBe(1);
  });

  it('sin señal: vuelve a pedir el turno solo, y al tenerlo publica lo anotado', async () => {
    const f = fake(createCourtStore('memory'));
    let down = true;
    f.claim = async () => {
      if (down) throw net();
      return claimOk();
    };
    const m = machine(f, CFG, 'u1', 5);
    await m.open();
    expect(m.getView().lease.kind).toBe('offline');
    m.apply(p1);
    expect(f.published).toHaveLength(0);
    down = false;
    await new Promise((r) => setTimeout(r, 40));
    expect(m.getView().lease.kind).toBe('mine');
    expect(f.published.at(-1)).toMatchObject({ seq: 1, score: { text: '1-0' } });
    expect(f.claims).toBeGreaterThan(1);
  });

  it('el admin suspende mientras este teléfono anota: deja de anotar, quita lo suyo de la cola y se retoma pidiendo el turno', async () => {
    const f = fake(createCourtStore('memory'));
    const m = machine(f);
    await m.open();
    m.setStatus('live');
    m.apply(p1);
    await settle();
    expect(f.published).toHaveLength(1);
    m.setStatus('suspended');
    expect(m.getView()).toMatchObject({ lease: { kind: 'closed', status: 'suspended' }, readOnly: true });
    expect(f.discarded).toBe(1);
    expect(m.apply(p1)).toBe('El partido ya no se anota.');
    m.flush();
    m.close();
    expect(f.published).toHaveLength(1);
    expect(f.released).toBe(0);

    // Otro día: «Retomar» (pide el turno) y sigue.
    const g = fake(createCourtStore('memory'));
    g.claim = async () => claimWith(f.published[0].state, 'suspended', 1);
    const n = machine(g);
    n.setStatus('suspended');
    await n.open();
    expect(n.getView()).toMatchObject({ lease: { kind: 'mine' }, summary: '1-0' });
    expect(n.apply(p2)).toBeNull();
    expect(g.published.at(-1)).toMatchObject({ seq: 2, score: { text: '1-1' } });
  });

  it('lo que llega de la cola a un partido suspendido sin turno: queda suspendido (no «otro anotador») y se retoma', async () => {
    const f = fake(createCourtStore('memory'));
    f.publish = async () => ({ ok: false, reason: 'lease', status: 'suspended', scorerId: null, scorerName: null });
    const m = machine(f);
    await m.open();
    m.apply(p1);
    await settle();
    expect(m.getView()).toMatchObject({ lease: { kind: 'closed', status: 'suspended' }, readOnly: true });
    expect(f.discarded).toBe(1);
    f.publish = async (p) => ({ ok: true, seq: p.seq });
    f.claim = async () => claimWith(null, 'suspended', 0);
    await m.claim();
    expect(m.getView().lease.kind).toBe('mine');
    expect(f.published.at(-1)).toMatchObject({ seq: 1 });
  });

  it('otro teléfono de la misma cuenta va más adelante: deja de publicar y quita lo suyo de la cola', async () => {
    const f = fake(createCourtStore('memory'));
    f.publish = async () => ({ ok: false, reason: 'stale', seq: 15 });
    const m = machine(f);
    await m.open();
    m.apply(p1);
    await settle();
    expect(m.getView()).toMatchObject({ lease: { kind: 'stale' }, readOnly: true });
    expect(f.discarded).toBe(1);
  });

  it('al tomar la lista del servidor, lo que la lista vieja tenía en camino ya no cuenta y lo nuevo sí se publica', async () => {
    const f = fake(createCourtStore('memory'));
    let answer: (r: PublishResult) => void = () => {};
    f.publish = () => new Promise<PublishResult>((r) => (answer = r));
    const m = machine(f);
    await m.open();
    for (let i = 0; i < 4; i++) m.apply(p1);
    m.flush();
    expect(f.published.at(-1)).toMatchObject({ seq: 4 });
    // Otro teléfono siguió el partido: al pedir el turno gana el servidor.
    const byC = remote('tel-C', [p2, p2, p2]);
    f.claim = async () => claimWith(byC, 'live', 3);
    await m.claim();
    expect(m.getView()).toMatchObject({ conflict: true, summary: '0-3', lease: { kind: 'mine' }, unsent: 0 });
    expect(f.discarded).toBe(1);
    // Llega la respuesta de lo que iba en camino (la lista vieja): no cambia nada.
    answer({ ok: false, reason: 'stale', seq: 3 });
    await settle();
    expect(m.getView().lease).toEqual({ kind: 'mine' });
    // Lo nuevo sale sobre la lista del servidor (aunque ese número ya se había mandado con la vieja).
    f.publish = async (p) => ({ ok: true, seq: p.seq });
    m.apply(p1);
    m.flush();
    expect(f.published.at(-1)).toMatchObject({ seq: 4, score: { text: '1-3' }, state: { origin: 'tel-A', parent: { origin: 'tel-C', seq: 3 } } });
  });

  it('el servidor va más adelante que lo que se puede leer de su estado: la lista sigue desde su número (no queda «vieja»)', async () => {
    const f = fake(createCourtStore('memory'), 'tel-B');
    f.claim = async () => claimWith({ v: 1 }, 'live', 9000);
    const m = machine(f);
    await m.open();
    expect(m.getView()).toMatchObject({ summary: '0-0', unsent: 0 });
    m.apply(p1);
    expect(f.published.at(-1)).toMatchObject({ seq: 9001, state: { seq: 9001, parent: { origin: null, seq: 9000 } } });
  });
});
