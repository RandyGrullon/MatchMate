import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendError } from '../backend/types';
import { createFakeBackend, opLogServer, type FakeBackend } from './fakeBackend';
import { createOutbox, pendingByUser, resetMemoryOutbox, type Outbox, type OutboxOptions } from './outbox';

/** setImmediate de Node (los relojes falsos de estas pruebas no lo tocan; IndexedDB falso lo usa). */
const nextTask = (globalThis as unknown as { setImmediate: (cb: () => void) => void }).setImmediate;
const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let n = 0;
const newUser = () => `usuario-${++n}`;
const boxes: Outbox[] = [];

function make(backend: FakeBackend, userId: string, extra: Partial<OutboxOptions> = {}): Outbox {
  // random 0 = la espera más corta posible: base 2 s → 1 s, 2 s, 4 s…
  const box = createOutbox({ backend, userId, listenWindow: false, random: () => 0, ...extra });
  boxes.push(box);
  return box;
}

/** Espera (con tareas reales, sirve con relojes falsos) hasta que se cumpla la condición. */
async function until(cond: () => boolean, what = 'la condición') {
  for (let i = 0; i < 2000; i++) {
    if (cond()) return;
    await new Promise<void>((r) => nextTask(r));
  }
  throw new Error(`No se cumplió ${what}`);
}

const netError = () => new BackendError('Sin señal', 'network');

describe('cola sin conexión', () => {
  let be: FakeBackend;

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    be = createFakeBackend();
  });

  afterEach(() => {
    for (const b of boxes.splice(0)) b.dispose();
    resetMemoryOutbox();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('envía la RPC con p_op_id = opId y done se cumple con la respuesta del servidor', async () => {
    be.onRpc = (_fn, args) => ({ saved: args.score });
    const box = make(be, newUser());
    await box.ready;
    const counts: number[] = [];
    box.onPendingCount((c) => counts.push(c));
    const { opId, done } = box.enqueue<{ saved: number }>('submit_games', { score: 200 }, { group: 'liga-1' });
    expect(opId).toMatch(V7);
    expect(box.getSnapshot().pendingCount).toBe(1);
    await expect(done).resolves.toEqual({ saved: 200 });
    expect(be.calls).toEqual([{ fn: 'submit_games', args: { score: 200, p_op_id: opId } }]);
    await box.idle();
    expect(box.getSnapshot().pendingCount).toBe(0);
    expect(counts).toEqual([0, 1, 0]);
  });

  it('avisa al encolar (cambio optimista) y cuando el servidor confirma', async () => {
    const seen: string[] = [];
    const box = make(be, newUser(), {
      onEnqueue: (i) => seen.push(`cola:${i.fn}`),
      onSettled: (i, o) => seen.push(`listo:${i.fn}:${o.ok}`),
    });
    const { done } = box.enqueue('rsvp_event', { going: true }, { onEnqueue: (i) => seen.push(`pantalla:${i.args.going}`) });
    expect(seen).toEqual(['pantalla:true', 'cola:rsvp_event']); // enseguida, antes de guardar o enviar
    await done;
    expect(seen).toEqual(['pantalla:true', 'cola:rsvp_event', 'listo:rsvp_event:true']);
  });

  it('en orden dentro de cada grupo', async () => {
    const box = make(be, newUser());
    await box.ready;
    const ops = [
      box.enqueue('op', { id: 'a1' }, { group: 'A' }),
      box.enqueue('op', { id: 'a2' }, { group: 'A' }),
      box.enqueue('op', { id: 'b1' }, { group: 'B' }),
      box.enqueue('op', { id: 'a3' }, { group: 'A' }),
      box.enqueue('op', { id: 'b2' }, { group: 'B' }),
    ];
    await Promise.all(ops.map((o) => o.done));
    const sent = be.calls.map((c) => c.args.id as string);
    expect(sent.filter((id) => id.startsWith('a'))).toEqual(['a1', 'a2', 'a3']);
    expect(sent.filter((id) => id.startsWith('b'))).toEqual(['b1', 'b2']);
    expect(sent).toHaveLength(5);
  });

  it('un grupo sin señal espera sin frenar a los otros, y su segunda operación no se adelanta', async () => {
    be.onRpc = (_fn, args) => {
      if (args.g === 'A') throw netError();
      return 'ok';
    };
    const box = make(be, newUser());
    box.enqueue('op', { g: 'A', i: 1 }, { group: 'A' });
    box.enqueue('op', { g: 'A', i: 2 }, { group: 'A' });
    const b = box.enqueue('op', { g: 'B', i: 1 }, { group: 'B' });
    await expect(b.done).resolves.toBe('ok');
    await box.idle();
    expect(be.calls.filter((c) => c.args.g === 'A').map((c) => c.args.i)).toEqual([1]);
    expect(box.getSnapshot().pendingCount).toBe(2);
    expect(box.listPending('A').map((i) => [i.args.i, i.attempts, i.status])).toEqual([
      [1, 1, 'pending'],
      [2, 0, 'pending'],
    ]);
    expect(box.listFailed()).toEqual([]);
  });

  it('un rechazo definitivo va a «no se pudo enviar», no frena lo que sigue y se puede reintentar o descartar', async () => {
    be.onRpc = (_fn, args) => {
      if (args.i === 1) throw new BackendError('El evento está cerrado', 'validation', 'cerrado');
      return args.i;
    };
    const box = make(be, newUser());
    const a = box.enqueue('submit_games', { i: 1 }, { group: 'L', label: 'Juegos del martes' });
    const b = box.enqueue('submit_games', { i: 2 }, { group: 'L' });
    await expect(a.done).rejects.toMatchObject({ kind: 'validation', code: 'cerrado', message: 'El evento está cerrado' });
    await expect(b.done).resolves.toBe(2);
    await box.idle();
    expect(box.getSnapshot().pendingCount).toBe(0);
    expect(box.listFailed()).toEqual([
      expect.objectContaining({
        opId: a.opId,
        status: 'failed',
        attempts: 1,
        lastError: 'El evento está cerrado',
        errorKind: 'validation',
        errorCode: 'cerrado',
        label: 'Juegos del martes',
      }),
    ]);
    expect(be.calls).toHaveLength(2); // no se reintenta sola

    // Reintentar: ahora el servidor la acepta (mismo opId).
    be.onRpc = () => 'ok';
    await box.retry(a.opId);
    expect(box.listFailed()).toEqual([]);
    expect(be.calls.map((c) => c.args.p_op_id)).toEqual([a.opId, b.opId, a.opId]);

    // Descartar otra que falló: sale de la lista y de lo guardado.
    be.onRpc = () => {
      throw new BackendError('No tienes permiso', 'permission', '42501');
    };
    const c = box.enqueue('submit_games', { i: 3 }, { group: 'L' });
    await expect(c.done).rejects.toMatchObject({ kind: 'permission' });
    await box.idle();
    expect(box.getSnapshot().failed).toHaveLength(1);
    await box.discard(c.opId);
    expect(box.getSnapshot().failed).toHaveLength(0);
    const again = make(be, box.userId);
    await again.ready;
    expect(again.getSnapshot()).toMatchObject({ pendingCount: 0, failed: [] });
  });

  it('reintenta con esperas crecientes (con azar) y el mismo opId', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    let fails = 3;
    be.onRpc = () => {
      if (fails-- > 0) throw netError();
      return 'ok';
    };
    const box = make(be, newUser());
    await box.ready;
    const { opId, done } = box.enqueue('publish_live', { score: 7 });
    await until(() => be.calls.length === 1, 'el primer envío');
    await box.idle();

    // Esperas: 1 s, 2 s, 4 s (base 2 s con el azar en 0 = la mitad de la exponencial).
    for (const [wait, calls] of [
      [1_000, 2],
      [2_000, 3],
      [4_000, 4],
    ] as const) {
      await vi.advanceTimersByTimeAsync(wait - 1);
      await box.idle();
      expect(be.calls).toHaveLength(calls - 1);
      await vi.advanceTimersByTimeAsync(1);
      await until(() => be.calls.length === calls, `el envío ${calls}`);
      await box.idle();
    }
    await expect(done).resolves.toBe('ok');
    expect(new Set(be.calls.map((c) => c.args.p_op_id))).toEqual(new Set([opId]));
    expect(box.getSnapshot().pendingCount).toBe(0);
  });

  it('el azar alarga la espera entre la mitad y el total de la exponencial', async () => {
    be.onRpc = () => {
      throw netError();
    };
    const box = make(be, newUser(), { random: () => 0.5, backoff: { baseMs: 8_000 } });
    const before = Date.now();
    box.enqueue('op', {});
    await until(() => be.calls.length === 1);
    await box.idle();
    const [item] = box.listPending();
    const wait = item.nextAttemptAt! - before;
    expect(wait).toBeGreaterThanOrEqual(6_000); // 4 s + 0,5 × 4 s
    expect(wait).toBeLessThan(6_000 + 1_000);
    expect(item.lastError).toBe('Sin señal');
  });

  it('una RPC que no responde se da por sin señal y se reintenta', async () => {
    let first = true;
    be.onRpc = () => {
      if (first) {
        first = false;
        return new Promise(() => {}); // nunca contesta
      }
      return 'ok';
    };
    const box = make(be, newUser(), { sendTimeoutMs: 30, backoff: { baseMs: 20 } });
    const { done } = box.enqueue('op', {});
    await expect(done).resolves.toBe('ok');
    expect(be.calls).toHaveLength(2);
  });

  it('si se pierde la respuesta, reenviar con el mismo opId no duplica en el servidor', async () => {
    const server = opLogServer((_fn, args) => ({ total: args.score }));
    let loseResponse = true;
    be.onRpc = (fn, args) => {
      const r = server.handle(fn, args); // el servidor sí lo guardó…
      if (loseResponse) {
        loseResponse = false;
        throw netError(); // …pero la respuesta no llegó
      }
      return r;
    };
    const box = make(be, newUser());
    const { opId, done } = box.enqueue('submit_games', { score: 180 });
    await until(() => be.calls.length === 1);
    await box.idle();
    await box.flush(); // flush no espera el reintento programado
    await expect(done).resolves.toEqual({ total: 180 });
    expect(be.calls.map((c) => c.args.p_op_id)).toEqual([opId, opId]);
    expect(server.applied).toHaveLength(1);
  });

  it('colapso: el en vivo nuevo reemplaza a los pendientes con la misma clave', async () => {
    be.isOnline = false;
    const box = make(be, newUser());
    await box.ready;
    const v1 = box.enqueue('publish_live', { score: 10 }, { collapseKey: 'live:e1:p1', group: 'e1' });
    const rsvp = box.enqueue('rsvp_event', { going: true }, { group: 'e1' });
    const v2 = box.enqueue('publish_live', { score: 20 }, { collapseKey: 'live:e1:p1', group: 'e1' });
    const v3 = box.enqueue('publish_live', { score: 30 }, { collapseKey: 'live:e1:p1', group: 'e1' });
    expect(box.getSnapshot().pendingCount).toBe(2);
    expect(box.listPending().map((i) => i.opId)).toEqual([rsvp.opId, v3.opId]);

    be.isOnline = true;
    be.onRpc = (_fn, args) => args.score ?? 'ok';
    await box.flush();
    expect(be.calls.map((c) => [c.fn, c.args.score])).toEqual([
      ['rsvp_event', undefined],
      ['publish_live', 30],
    ]);
    // Quien esperaba un estado viejo se entera cuando llega el último.
    await expect(v1.done).resolves.toBe(30);
    await expect(v2.done).resolves.toBe(30);
    await expect(v3.done).resolves.toBe(30);
  });

  it('colapso: no reemplaza a la que ya se está enviando', async () => {
    let release!: () => void;
    be.onRpc = (_fn, args) => (args.score === 1 ? new Promise((r) => (release = () => r(1))) : args.score);
    const box = make(be, newUser());
    const v1 = box.enqueue('publish_live', { score: 1 }, { collapseKey: 'live:x' });
    await until(() => be.calls.length === 1);
    const v2 = box.enqueue('publish_live', { score: 2 }, { collapseKey: 'live:x' });
    const v3 = box.enqueue('publish_live', { score: 3 }, { collapseKey: 'live:x' });
    release();
    await expect(v1.done).resolves.toBe(1);
    await expect(v2.done).resolves.toBe(3);
    await expect(v3.done).resolves.toBe(3);
    expect(be.calls.map((c) => c.args.score)).toEqual([1, 3]);
  });

  it('aguanta recargar: lo pendiente se guarda por cuenta y se envía al volver a abrir', async () => {
    be.isOnline = false;
    const user = newUser();
    const first = make(be, user);
    const op = first.enqueue('submit_games', { score: 150 }, { group: 'L' });
    await first.flush(); // sin señal: no envía, pero ya quedó guardado
    first.dispose(); // se recargó la página (o cerró sesión)

    const second = make(be, user);
    await second.ready;
    expect(second.getSnapshot().pendingCount).toBe(1);
    expect(second.listPending()[0]).toMatchObject({ opId: op.opId, fn: 'submit_games', args: { score: 150, p_op_id: op.opId }, group: 'L' });

    // Otra cuenta en el mismo teléfono no la ve ni la envía.
    const other = make(be, newUser());
    await other.ready;
    expect(other.getSnapshot().pendingCount).toBe(0);
    expect(await pendingByUser()).toEqual({ [user]: { pending: 1, failed: 0 } });

    be.isOnline = true;
    await second.flush();
    expect(be.calls.map((c) => c.args.p_op_id)).toEqual([op.opId]);
    expect(second.getSnapshot().pendingCount).toBe(0);
    const third = make(be, user);
    await third.ready;
    expect(third.getSnapshot().pendingCount).toBe(0);
  });

  it('sin IndexedDB queda en memoria: aguanta cerrar sesión y volver a entrar en la misma pestaña', async () => {
    be.isOnline = false;
    const user = newUser();
    const first = make(be, user, { storage: 'memory' });
    const op = first.enqueue('rsvp_event', { going: true });
    await first.flush();
    first.dispose(); // cerró sesión

    const again = make(be, user, { storage: 'memory' });
    await again.ready;
    expect(again.listPending().map((i) => i.opId)).toEqual([op.opId]);
    expect((await pendingByUser())[user]).toEqual({ pending: 1, failed: 0 });
    be.isOnline = true;
    await again.flush();
    expect(be.calls.map((c) => c.args.p_op_id)).toEqual([op.opId]);
    expect(again.getSnapshot().pendingCount).toBe(0);
  });

  it('corte a mitad del envío: al volver a abrir se reenvía con el mismo opId y el servidor no duplica', async () => {
    const server = opLogServer();
    let hang = true;
    be.onRpc = (fn, args) => {
      const r = server.handle(fn, args);
      return hang ? new Promise(() => {}) : r; // el servidor lo aplicó, pero la página se recargó antes de la respuesta
    };
    const user = newUser();
    const first = make(be, user);
    const op = first.enqueue('submit_games', { score: 99 });
    await until(() => be.calls.length === 1);
    first.dispose();
    await first.idle();

    hang = false;
    const second = make(be, user, { autoStart: false });
    await second.ready;
    expect(second.listPending()[0]).toMatchObject({ opId: op.opId, status: 'sending' });
    await second.flush();
    expect(be.calls.map((c) => c.args.p_op_id)).toEqual([op.opId, op.opId]);
    expect(server.applied).toHaveLength(1);
    expect(second.getSnapshot().pendingCount).toBe(0);
  });

  it('con la sesión vencida no envía nada más hasta que se renueva', async () => {
    let expired = true;
    be.onRpc = () => {
      if (expired) throw new BackendError('JWT expired', 'auth');
      return 'ok';
    };
    const box = make(be, newUser());
    const a = box.enqueue('op', {}, { group: 'A' });
    const b = box.enqueue('op', {}, { group: 'B' });
    await until(() => be.calls.length === 1);
    await box.idle();
    expect(be.calls).toHaveLength(1); // B ni se intentó
    expect(box.getSnapshot()).toMatchObject({ pendingCount: 2, needsAuth: true, failed: [] });

    expired = false;
    await box.flush(); // la app lo llama al renovar la sesión (TOKEN_REFRESHED / SIGNED_IN)
    await expect(a.done).resolves.toBe('ok');
    await expect(b.done).resolves.toBe('ok');
    expect(box.getSnapshot()).toMatchObject({ pendingCount: 0, needsAuth: false });
  });

  it('sin señal espera y envía solo cuando vuelve la conexión (evento online)', async () => {
    const win = new EventTarget();
    vi.stubGlobal('window', win);
    be.isOnline = false;
    const box = createOutbox({ backend: be, userId: newUser(), random: () => 0 });
    boxes.push(box);
    const { done } = box.enqueue('rsvp_event', {});
    await box.flush();
    expect(be.calls).toHaveLength(0);
    be.isOnline = true;
    win.dispatchEvent(new Event('online'));
    await expect(done).resolves.toEqual({ ok: true });
    expect(be.calls).toHaveLength(1);
  });

  it('respeta navigator.onLine = false aunque el backend diga que hay conexión', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const box = make(be, newUser());
    box.enqueue('op', {});
    await box.flush();
    expect(be.calls).toHaveLength(0);
    expect(box.getSnapshot().pendingCount).toBe(1);
  });

  it('usa navigator.locks cuando existe (un solo emisor entre pestañas)', async () => {
    const requests: string[] = [];
    vi.stubGlobal('navigator', {
      onLine: true,
      locks: { request: async (name: string, cb: () => Promise<unknown>) => (requests.push(name), cb()) },
    });
    const user = newUser();
    const box = make(be, user);
    await box.enqueue('op', {}).done;
    expect(requests.length).toBeGreaterThan(0);
    expect(new Set(requests)).toEqual(new Set([`mm-outbox:${user}`]));
  });

  it('si otra pestaña ya la envió (sin aviso), al releer no se reenvía y done se cumple', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    // El candado lo tiene «otra pestaña» hasta abrir la compuerta.
    vi.stubGlobal('navigator', { onLine: true, locks: { request: async (_name: string, cb: () => Promise<unknown>) => (await gate, cb()) } });
    const box = make(be, newUser(), { autoStart: false });
    await box.ready;
    const op = box.enqueue('op', { n: 1 });
    const db = await openDB('mm-outbox', 1);
    for (let i = 0; i < 100 && !(await db.get('ops', op.opId)); i++) await new Promise<void>((r) => nextTask(r));
    expect(await db.get('ops', op.opId)).toBeTruthy(); // ya quedó guardada…
    await db.delete('ops', op.opId); // …y la otra pestaña la envió y la borró
    db.close();
    open();
    await expect(op.done).resolves.toBeUndefined();
    await box.idle();
    expect(be.calls).toHaveLength(0);
    expect(box.getSnapshot().pendingCount).toBe(0);
  });

  for (const channel of [true, false]) {
    it(`dos pestañas de la misma cuenta: un envío a la vez y cada operación una sola vez${channel ? '' : ' (sin BroadcastChannel)'}`, async () => {
      if (!channel) vi.stubGlobal('BroadcastChannel', undefined);
      const server = opLogServer((_fn, args) => args.n);
      let active = 0;
      let maxActive = 0;
      be.onRpc = async (fn, args) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 3));
        active--;
        return server.handle(fn, args);
      };
      const user = newUser();
      const tab1 = make(be, user);
      const tab2 = make(be, user);
      await Promise.all([tab1.ready, tab2.ready]);
      const ops = [tab1.enqueue('op', { n: 1 }), tab2.enqueue('op', { n: 2 }), tab1.enqueue('op', { n: 3 }), tab2.enqueue('op', { n: 4 })];
      await Promise.all(ops.map((o) => o.done));
      await Promise.all([tab1.idle(), tab2.idle()]);
      expect(maxActive).toBe(1);
      expect(server.applied.map((a) => a.args.n).sort()).toEqual([1, 2, 3, 4]);
      expect(be.calls).toHaveLength(4); // nadie reenvió lo que ya envió la otra
      expect(tab1.getSnapshot().pendingCount + tab2.getSnapshot().pendingCount).toBe(0);
    });
  }
});
