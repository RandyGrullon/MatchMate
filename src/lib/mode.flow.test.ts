/**
 * El modo de la app de punta a punta con la base de verdad (PGlite con las migraciones, 20261007000100_modo_app.sql):
 * el perfil lo trae (null = automático), elegirlo lo guarda en la cuenta y pone al día el perfil guardado, y con una
 * base que todavía no tiene set_ui_mode (la app salió antes que la migración) se queda en el teléfono sin lanzar nada
 * y se manda cuando la base ya lo tiene.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProfile, type AccountProfile } from './auth';
import { BackendError, type Backend } from './backend/types';
import { queryClient } from './data/client';
import { keys } from './data/keys';
import { openWorld, type TestWorld } from './data/testkit';
import { chooseMode, localModeOf, reconcileMode, resetModeForTests, resolveMode } from './mode';

describe('modo de la app con la base de verdad', () => {
  let w: TestWorld;
  let ana: string;
  let beto: string;

  beforeAll(async () => {
    // El teléfono: lo elegido queda guardado entre sesiones de la app.
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => void saved.set(k, v),
      removeItem: (k: string) => void saved.delete(k),
    });
    w = await openWorld();
    beto = await w.signUp('beto@x.com', 'Beto');
    ana = await w.signUp('ana@x.com', 'Ana');
  }, 120_000);

  afterAll(async () => {
    await w.close();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    resetModeForTests();
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  const uiModeIn = async (uid: string) =>
    (await w.b.db.query<{ ui_mode: string | null }>('select ui_mode from public.profiles where id = $1', [uid])).rows[0]?.ui_mode;

  it('el perfil lo trae: null al principio (automático: Lite)', async () => {
    await w.as('ana@x.com');
    const profile = await fetchProfile(ana);
    expect(profile).toMatchObject({ id: ana, uiMode: null });
    expect(resolveMode(localModeOf(ana), profile?.uiMode)).toBe('lite');
  });

  it('elegir Pro lo guarda en la cuenta (solo la suya) y pone al día el perfil guardado', async () => {
    await w.as('ana@x.com');
    queryClient.setQueryData<AccountProfile | null>(keys.profile(ana), await fetchProfile(ana));
    expect(await chooseMode(ana, 'pro')).toBe('saved');
    expect(await uiModeIn(ana)).toBe('pro');
    expect(await uiModeIn(beto)).toBeNull();
    expect(queryClient.getQueryData<AccountProfile | null>(keys.profile(ana))?.uiMode).toBe('pro');
    expect(localModeOf(ana)?.synced).toBe(true);
    expect((await fetchProfile(ana))?.uiMode).toBe('pro');
  });

  it('base sin set_ui_mode: queda en el teléfono sin lanzar; cuando la base lo tiene, se manda', async () => {
    await w.as('ana@x.com');
    const base = w.b as Backend;
    const calls: string[] = [];
    const old = new Proxy(base, {
      get(target, prop) {
        if (prop === 'rpc')
          return async (fn: string, args?: Record<string, unknown>) => {
            calls.push(fn);
            if (fn === 'set_ui_mode') throw new BackendError('Could not find the function public.set_ui_mode(p_mode) in the schema cache', 'not_found', 'PGRST202');
            return target.rpc(fn, args);
          };
        const v = Reflect.get(target, prop);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    w.use(old);
    try {
      expect(await chooseMode(ana, 'lite')).toBe('local');
    } finally {
      w.use(base);
    }
    expect(calls).toEqual(['set_ui_mode']);
    // La cuenta sigue en Pro, pero en este teléfono manda lo elegido.
    expect(await uiModeIn(ana)).toBe('pro');
    expect(resolveMode(localModeOf(ana), 'pro')).toBe('lite');

    // En esta sesión ya se intentó: no se insiste. La próxima vez que se abre la app (con la base al día), al leer el
    // perfil se manda.
    reconcileMode(ana, 'pro');
    expect(calls).toEqual(['set_ui_mode']);
    expect(await uiModeIn(ana)).toBe('pro');
    resetModeForTests();
    expect(localModeOf(ana)).toMatchObject({ mode: 'lite', synced: false });
    reconcileMode(ana, 'pro');
    await vi.waitFor(async () => expect(await uiModeIn(ana)).toBe('lite'));
    await vi.waitFor(() => expect(localModeOf(ana)?.synced).toBe(true));
  });

  it('un valor raro no se guarda: la base lo rechaza', async () => {
    await w.as('ana@x.com');
    await expect(w.b.rpc('set_ui_mode', { p_mode: 'Pro' })).rejects.toBeTruthy();
    expect(await uiModeIn(ana)).toBe('lite');
  });
});
