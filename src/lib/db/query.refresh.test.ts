/**
 * refreshActive (deslizar para actualizar): vuelve a pedir lo que está en pantalla sin quitar lo que se ve y termina
 * cuando eso llegó (o falló), con 8 s como mucho.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackendError } from '../backend/types';
import { createQueryClient, type QueryClient, type QueryOptions } from './query';

const nextTask = (globalThis as unknown as { setImmediate: (cb: () => void) => void }).setImmediate;
const clients: QueryClient[] = [];
const make = () => {
  const c = createQueryClient({ persistence: 'none', listenWindow: false });
  clients.push(c);
  return c;
};

/** Deja correr promesas sin mover los relojes falsos. */
async function tick(times = 5) {
  for (let i = 0; i < times; i++) await new Promise<void>((r) => nextTask(r));
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

/** Una pantalla sin React. */
function screen<T>(client: QueryClient, key: string, fetcher: () => Promise<T>, opts: QueryOptions<T> = {}) {
  const stop = client.observe(key, fetcher, opts, () => {});
  return { stop, state: () => client.getState<T>(key) };
}

/** Para saber si una promesa ya terminó. */
function track(p: Promise<unknown>) {
  const s = { done: false };
  void p.then(() => (s.done = true));
  return s;
}

afterEach(() => {
  for (const c of clients.splice(0)) c.dispose();
  vi.useRealTimers();
});

describe('refreshActive (deslizar para actualizar)', () => {
  it('vuelve a pedir lo que está en pantalla y termina cuando todo llegó, sin quitar lo que se ve', async () => {
    const c = make();
    const answers: Record<string, ReturnType<typeof deferred<string>>[]> = { a: [], b: [] };
    const fetcher = (k: 'a' | 'b') =>
      vi.fn(() => {
        const d = deferred<string>();
        answers[k].push(d);
        return d.promise;
      });
    const fa = fetcher('a');
    const fb = fetcher('b');
    const a = screen(c, 'a', fa, { staleMs: 60_000 });
    const b = screen(c, 'b', fb, { staleMs: 60_000 });
    answers.a[0].resolve('a1');
    answers.b[0].resolve('b1');
    await tick();

    const run = track(c.refreshActive());
    expect(fa).toHaveBeenCalledTimes(2); // aunque estaba fresco
    expect(fb).toHaveBeenCalledTimes(2);
    // Mientras llega lo nuevo se sigue viendo lo de antes (no se vacía la pantalla).
    expect(a.state()).toEqual({ data: 'a1', loading: false, error: null, fromCache: false });

    answers.a[1].resolve('a2');
    await tick();
    expect(run.done).toBe(false); // falta b
    answers.b[1].resolve('b2');
    await tick();
    expect(run.done).toBe(true);
    expect(a.state().data).toBe('a2');
    expect(b.state().data).toBe('b2');
  });

  it('si ya se estaba pidiendo, espera también la repetición (la respuesta en vuelo podía ser vieja)', async () => {
    const c = make();
    const ds: ReturnType<typeof deferred<number>>[] = [];
    const fetcher = vi.fn(() => {
      const d = deferred<number>();
      ds.push(d);
      return d.promise;
    });
    const s = screen(c, 'k', fetcher);
    const run = track(c.refreshActive());
    expect(fetcher).toHaveBeenCalledTimes(1); // la que estaba en vuelo no se duplica

    ds[0].resolve(1);
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(run.done).toBe(false);
    ds[1].resolve(2);
    await tick();
    expect(run.done).toBe(true);
    expect(s.state().data).toBe(2);
  });

  it('sin señal termina igual y deja lo que había, sin error', async () => {
    const c = make();
    let fail = false;
    const fetcher = vi.fn(async () => {
      if (fail) throw new BackendError('Sin señal', 'network');
      return 'viejo';
    });
    const s = screen(c, 'k', fetcher);
    await tick();
    fail = true;
    await expect(c.refreshActive()).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(s.state()).toEqual({ data: 'viejo', loading: false, error: null, fromCache: false });
  });

  it('lo que no está en pantalla no se espera: queda invalidado y se pide al volver a abrirse', async () => {
    const c = make();
    const fetcher = vi.fn(async () => 'x');
    await c.fetchQuery('fuera', fetcher, { staleMs: 60_000 });
    await expect(c.refreshActive()).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await c.fetchQuery('fuera', fetcher, { staleMs: 60_000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('no espera más de 8 s (con mala señal lo que falte llega después)', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const c = make();
    const fetcher = vi.fn(() => new Promise<string>(() => {}));
    screen(c, 'colgada', fetcher);
    const run = track(c.refreshActive());
    await vi.advanceTimersByTimeAsync(7_900);
    expect(run.done).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(run.done).toBe(true);

    const quick = track(c.refreshActive({ timeoutMs: 1_000 }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(quick.done).toBe(true);
  });

  it('sin nada en pantalla, o con el cliente cerrado, termina enseguida', async () => {
    const c = make();
    await expect(c.refreshActive()).resolves.toBeUndefined();
    const fetcher = vi.fn(() => new Promise<string>(() => {}));
    screen(c, 'k', fetcher);
    c.dispose();
    await expect(c.refreshActive()).resolves.toBeUndefined();
  });
});
