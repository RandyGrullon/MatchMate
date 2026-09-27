import { afterEach, describe, expect, it, vi } from 'vitest';
import { backendMode, backendReady, getBackend, setBackendForTests } from './index';
import { createLazyBackend } from './lazy';
import { BackendError, type Backend, type RealtimeMessage } from './types';

/** Backend falso: guarda los suscriptores para poder mandarles mensajes. */
function fakeBackend() {
  const subs = new Set<(m: RealtimeMessage) => void>();
  const authSubs = new Set<() => void>();
  const b = {
    mode: 'local',
    auth: {
      getSession: vi.fn(async () => ({ userId: 'u', email: null, name: 'N' })),
      onChange: (cb: () => void) => {
        authSubs.add(cb);
        return () => void authSubs.delete(cb);
      },
      signUp: vi.fn(async () => null),
      signIn: vi.fn(async () => ({ userId: 'u', email: null, name: null })),
      signInWithGoogle: vi.fn(async () => undefined),
      signOut: vi.fn(async () => undefined),
      resetPassword: vi.fn(async () => undefined),
      updatePassword: vi.fn(async () => undefined),
    },
    storage: { upload: vi.fn(async () => undefined), signedUrl: vi.fn(async () => 'data:x'), remove: vi.fn(async () => undefined) },
    select: vi.fn(async () => [{ a: 1 }]),
    rpc: vi.fn(async () => 7),
    subscribe: (_t: string, cb: (m: RealtimeMessage) => void) => {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
    invoke: vi.fn(async () => 'ok'),
    online: () => true,
  } as unknown as Backend;
  return { b, subs, authSubs };
}

describe('backend perezoso', () => {
  it('carga una sola vez y pasa cada llamada', async () => {
    const f = fakeBackend();
    const load = vi.fn(async () => f.b);
    const lazy = createLazyBackend('local', load);
    expect(lazy.mode).toBe('local');
    expect(lazy.online()).toBe(true);
    const [rows, n] = await Promise.all([lazy.select({ table: 't' }), lazy.rpc('f', { p: 1 })]);
    expect(rows).toEqual([{ a: 1 }]);
    expect(n).toBe(7);
    expect(await lazy.auth.getSession()).toMatchObject({ userId: 'u' });
    expect(await lazy.storage.signedUrl('b', 'p')).toBe('data:x');
    expect(await lazy.invoke('fn', {})).toBe('ok');
    expect(f.b.rpc).toHaveBeenCalledWith('f', { p: 1 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('subscribe y onChange se enganchan al cargar, y se pueden cancelar antes', async () => {
    const f = fakeBackend();
    let release!: (b: Backend) => void;
    const lazy = createLazyBackend('local', () => new Promise<Backend>((r) => (release = r)));
    const got: RealtimeMessage[] = [];
    lazy.subscribe('event:1', (m) => got.push(m));
    const cancelled = lazy.subscribe('event:1', () => got.push({ event: 'nunca', payload: null }));
    cancelled();
    const offAuth = lazy.auth.onChange(() => undefined);
    release(f.b);
    await lazy.ready();
    expect(f.subs.size).toBe(1);
    expect(f.authSubs.size).toBe(1);
    [...f.subs].forEach((cb) => cb({ event: 'live', payload: 1 }));
    expect(got).toEqual([{ event: 'live', payload: 1 }]);
    offAuth();
    expect(f.authSubs.size).toBe(0);
  });

  it('si falla al cargar, lo dice como BackendError y reintenta la próxima vez', async () => {
    const f = fakeBackend();
    const load = vi.fn<() => Promise<Backend>>().mockRejectedValueOnce(new Error('sin WASM')).mockResolvedValueOnce(f.b);
    const lazy = createLazyBackend('local', load);
    const e = await lazy.select({ table: 't' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(BackendError);
    expect((e as BackendError).message).toMatch(/sin WASM/);
    expect(await lazy.select({ table: 't' })).toEqual([{ a: 1 }]);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('getBackend', () => {
  afterEach(() => {
    setBackendForTests(null);
    vi.unstubAllEnvs();
  });

  it('elige Supabase solo con URL y clave publicable', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    expect(backendMode()).toBe('local');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    expect(backendMode()).toBe('local');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_x');
    expect(backendMode()).toBe('supabase');
  });

  it('en local devuelve el perezoso de una vez, siempre el mismo', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    const b = getBackend();
    expect(b.mode).toBe('local');
    expect(getBackend()).toBe(b);
  });

  it('setBackendForTests reemplaza el backend', async () => {
    const f = fakeBackend();
    setBackendForTests(f.b);
    expect(getBackend()).toBe(f.b);
    expect(await backendReady()).toBe(f.b);
  });
});
