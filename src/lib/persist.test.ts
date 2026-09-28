import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthEvent, Session } from './backend/types';
import {
  PERSIST_KEY,
  PERSIST_RETRY_MS,
  readPersistRecord,
  requestPersistentStorage,
  resetPersistForTests,
  shouldAsk,
  startPersistence,
  watchSessionUser,
  type PersistEnv,
} from './persist';

/** Un navegador de mentira: `persisted` (lo tiene ya), `answer` (qué dice al pedirlo) y un localStorage. */
function fakeEnv(o: { persisted?: boolean; answer?: boolean | 'throws'; noApi?: boolean; noKv?: boolean; standalone?: boolean; now?: number } = {}) {
  const store = new Map<string, string>();
  const calls = { persist: 0, persisted: 0 };
  const state = { persisted: o.persisted ?? false, answer: o.answer ?? true, standalone: o.standalone ?? false, now: o.now ?? 1_000_000 };
  const env: PersistEnv = {
    storage: o.noApi
      ? {}
      : {
          persisted: async () => {
            calls.persisted++;
            return state.persisted;
          },
          persist: async () => {
            calls.persist++;
            if (state.answer === 'throws') throw new Error('no');
            if (state.answer) state.persisted = true;
            return state.answer;
          },
        },
    kv: o.noKv
      ? null
      : {
          getItem: (k) => store.get(k) ?? null,
          setItem: (k, v) => void store.set(k, v),
        },
    now: () => state.now,
    standalone: () => state.standalone,
  };
  return { env, calls, state, store };
}

afterEach(() => resetPersistForTests());

describe('que el teléfono no borre lo guardado', () => {
  it('se pide una vez y se recuerda que se concedió', async () => {
    const f = fakeEnv();
    expect(await requestPersistentStorage({ env: f.env })).toBe('granted');
    expect(f.calls.persist).toBe(1);
    expect(readPersistRecord(f.env)).toMatchObject({ state: 'granted' });
    // Ya lo tiene: no se vuelve a pedir.
    expect(await requestPersistentStorage({ env: f.env })).toBe('granted');
    expect(f.calls.persist).toBe(1);
  });

  it('si el navegador ya lo tiene (app instalada), no se pide nada', async () => {
    const f = fakeEnv({ persisted: true });
    expect(await requestPersistentStorage({ env: f.env })).toBe('granted');
    expect(f.calls.persist).toBe(0);
  });

  it('si dijo que no, no se insiste en cada apertura: a las 2 semanas o al abrirla instalada', async () => {
    const f = fakeEnv({ answer: false });
    expect(await requestPersistentStorage({ env: f.env })).toBe('denied');
    expect(await requestPersistentStorage({ env: f.env })).toBe('denied');
    expect(f.calls.persist).toBe(1);
    f.state.standalone = true;
    expect(await requestPersistentStorage({ env: f.env })).toBe('denied');
    expect(f.calls.persist).toBe(2);
    expect(readPersistRecord(f.env)).toMatchObject({ state: 'denied', standalone: true });
    f.state.now += PERSIST_RETRY_MS;
    f.state.answer = true;
    expect(await requestPersistentStorage({ env: f.env })).toBe('granted');
    expect(f.calls.persist).toBe(3);
  });

  it('«force» lo pide aunque haya dicho que no hace poco (cambió algo: se instaló la app, se permitieron los avisos)', async () => {
    const f = fakeEnv({ answer: false });
    await requestPersistentStorage({ env: f.env });
    f.state.answer = true;
    expect(await requestPersistentStorage({ env: f.env, force: true })).toBe('granted');
    expect(f.calls.persist).toBe(2);
  });

  it('lo había concedido y ya no lo tiene (se borraron los datos del sitio): se vuelve a pedir de una', async () => {
    const f = fakeEnv();
    await requestPersistentStorage({ env: f.env });
    f.state.persisted = false;
    expect(await requestPersistentStorage({ env: f.env })).toBe('granted');
    expect(f.calls.persist).toBe(2);
  });

  it('dos pedidos a la vez esperan la misma respuesta', async () => {
    const f = fakeEnv();
    const [a, b] = await Promise.all([requestPersistentStorage({ env: f.env }), requestPersistentStorage({ env: f.env })]);
    expect([a, b]).toEqual(['granted', 'granted']);
    expect(f.calls.persist).toBe(1);
  });

  it('sin la API no se hace nada; si falla, cuenta como que no', async () => {
    expect(await requestPersistentStorage({ env: fakeEnv({ noApi: true }).env })).toBe('unsupported');
    expect(await requestPersistentStorage({ env: { ...fakeEnv().env, storage: null } })).toBe('unsupported');
    const f = fakeEnv({ answer: 'throws' });
    expect(await requestPersistentStorage({ env: f.env })).toBe('denied');
  });

  it('sin localStorage se recuerda en la sesión', async () => {
    const f = fakeEnv({ answer: false, noKv: true });
    await requestPersistentStorage({ env: f.env });
    await requestPersistentStorage({ env: f.env });
    expect(f.calls.persist).toBe(1);
  });

  it('lo guardado dañado no rompe nada', async () => {
    const f = fakeEnv();
    f.store.set(PERSIST_KEY, '{no es json');
    expect(readPersistRecord(f.env)).toBeNull();
    expect(await requestPersistentStorage({ env: f.env })).toBe('granted');
  });

  it('cuándo toca pedirlo', () => {
    expect(shouldAsk(null, 0, false)).toBe(true);
    expect(shouldAsk({ state: 'granted', at: 0, standalone: false }, 10 * PERSIST_RETRY_MS, true)).toBe(false);
    expect(shouldAsk({ state: 'denied', at: 0, standalone: false }, 1, false)).toBe(false);
    expect(shouldAsk({ state: 'denied', at: 0, standalone: false }, 1, true)).toBe(true);
    expect(shouldAsk({ state: 'denied', at: 0, standalone: true }, 1, true)).toBe(false);
    expect(shouldAsk({ state: 'denied', at: 0, standalone: true }, PERSIST_RETRY_MS, true)).toBe(true);
  });
});

/** Una sesión de mentira: `emit` cambia quién entró; `saved` es la sesión guardada al abrir. */
function fakeAuth(saved: string | null) {
  let listener: ((e: AuthEvent, s: Session | null) => void) | null = null;
  const session = (uid: string | null) => (uid ? ({ userId: uid } as Session) : null);
  return {
    b: {
      auth: {
        getSession: async () => session(saved),
        onChange: (cb: (e: AuthEvent, s: Session | null) => void) => {
          listener = cb;
          return () => {
            listener = null;
          };
        },
      },
    } as unknown as Parameters<typeof watchSessionUser>[0],
    emit: (event: AuthEvent, uid: string | null) => listener?.(event, session(uid)),
    listening: () => listener !== null,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('quién entró', () => {
  it('avisa la sesión guardada al abrir y cada entrada o salida, sin repetir', async () => {
    const a = fakeAuth('u1');
    const seen: (string | null)[] = [];
    const off = watchSessionUser(a.b, (uid) => seen.push(uid));
    await flush();
    a.emit('TOKEN_REFRESHED', 'u1');
    a.emit('SIGNED_OUT', null);
    a.emit('SIGNED_IN', 'u2');
    expect(seen).toEqual(['u1', null, 'u2']);
    off();
    expect(a.listening()).toBe(false);
  });

  it('si llega un cambio antes de leer la sesión guardada, manda el cambio', async () => {
    const a = fakeAuth(null);
    const seen: (string | null)[] = [];
    watchSessionUser(a.b, (uid) => seen.push(uid));
    a.emit('SIGNED_IN', 'u9');
    await flush();
    expect(seen).toEqual(['u9']);
  });
});

describe('al entrar a la cuenta', () => {
  it('se pide después de entrar (no antes) y, si dijo que no, otra vez al instalar la app', async () => {
    const f = fakeEnv({ answer: false });
    const a = fakeAuth(null);
    let retry: () => void = () => undefined;
    const triggers = vi.fn((r: () => void) => {
      retry = r;
      return () => undefined;
    });
    const stop = startPersistence(a.b, { env: f.env, triggers });
    await flush();
    expect(f.calls.persist).toBe(0);
    // Sin cuenta, instalar la app no pide nada.
    retry();
    await flush();
    expect(f.calls.persist).toBe(0);

    a.emit('SIGNED_IN', 'u1');
    await flush();
    expect(f.calls.persist).toBe(1);
    a.emit('TOKEN_REFRESHED', 'u1');
    await flush();
    expect(f.calls.persist).toBe(1);

    f.state.answer = true;
    retry();
    await flush();
    expect(f.calls.persist).toBe(2);
    expect(readPersistRecord(f.env)?.state).toBe('granted');
    // Ya concedido: instalar de nuevo no pide nada.
    retry();
    await flush();
    expect(f.calls.persist).toBe(2);
    stop();
  });
});
