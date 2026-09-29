import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AFTER_LOGIN_KEY,
  AFTER_LOGIN_MS,
  afterLoginPath,
  clearAfterLogin,
  isEmailNotConfirmed,
  loginWithGoogle,
  readAfterLogin,
  resendConfirmation,
  saveAfterLogin,
  signUp,
  syncAfterLogin,
  takeAfterLogin,
} from './auth';
import { setBackendForTests } from './backend';
import { mapAuthError } from './backend/errors';
import { createSupabaseBackend, returnUrl } from './backend/supabase';
import { createFakeBackend } from './db/fakeBackend';

/**
 * Cuentas traídas de BowlingX sin el correo verificado: Supabase las crea sin mandarles nada y al entrar responde
 * `email_not_confirmed`. La pantalla de entrar lo reconoce (isEmailNotConfirmed) y les ofrece mandar el link
 * (resendConfirmation → auth.resend de tipo 'signup').
 */
function client(signInError: { name: string; code: string; status: number; message: string } | null) {
  const resend = vi.fn(async (_x: unknown) => ({ data: {}, error: null }));
  const c = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn(async (_x: unknown) => ({ data: { session: null }, error: signInError })),
      resend,
    },
    realtime: { setAuth: async () => undefined },
  };
  return { c, resend };
}

describe('entrar con una cuenta de BowlingX sin el correo confirmado', () => {
  it('el error de Supabase se reconoce como «correo sin confirmar» (y los demás no)', async () => {
    const { c } = client({ name: 'AuthApiError', code: 'email_not_confirmed', status: 400, message: 'Email not confirmed' });
    const b = createSupabaseBackend({ url: 'https://x.supabase.co', publishableKey: 'sb_publishable_x', client: c as unknown as SupabaseClient });
    const err = await b.auth.signIn('ana@correo.com', 'secreto1').then(
      () => null,
      (e: unknown) => e,
    );
    expect(isEmailNotConfirmed(err)).toBe(true);
    expect(isEmailNotConfirmed(mapAuthError({ code: 'invalid_credentials', status: 400 }))).toBe(false);
    expect(isEmailNotConfirmed(new Error('email_not_confirmed'))).toBe(false);
    expect(isEmailNotConfirmed(null)).toBe(false);
  });

  it('«Mandarme el link» pide a Supabase el correo de confirmación de registro para ese correo', async () => {
    const { c, resend } = client(null);
    const b = createSupabaseBackend({ url: 'https://x.supabase.co', publishableKey: 'sb_publishable_x', client: c as unknown as SupabaseClient });
    await b.auth.resendConfirmation(' ana@correo.com ', 'token-captcha');
    expect(resend).toHaveBeenCalledTimes(1);
    expect(resend.mock.calls[0][0]).toMatchObject({ type: 'signup', email: 'ana@correo.com', options: { captchaToken: 'token-captcha' } });
  });
});

/** Almacenamiento en memoria (como localStorage). */
function memoryStorage(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

/**
 * La invitación no se pierde al crear la cuenta: /login guarda a dónde iba (?next=), vale 24 horas, viaja en el link
 * de Google y en el del correo, y al abrirse la sesión se usa una sola vez.
 */
describe('a dónde iba antes de entrar', () => {
  const T0 = Date.UTC(2026, 8, 29, 12);

  it('solo rutas de la app: ni otros sitios, ni Home, ni la de entrar', () => {
    expect(afterLoginPath('/unirse/ABC123')).toBe('/unirse/ABC123');
    expect(afterLoginPath('/invitacion/i1')).toBe('/invitacion/i1');
    expect(afterLoginPath('/l/liga-1?tab=tabla#arriba')).toBe('/l/liga-1?tab=tabla#arriba');
    for (const bad of [
      null,
      undefined,
      '',
      'unirse/ABC',
      '//otro.sitio/x',
      '/\\otro.sitio',
      'https://otro.sitio/unirse/ABC',
      'javascript:alert(1)',
      '/unirse/ABC\nx',
      '/a b',
      '/a\\b',
      '/',
      '/?x=1',
      '/login',
      '/login?next=%2Fl%2Fx',
      '/' + 'x'.repeat(400),
    ]) {
      expect(afterLoginPath(bad), String(bad)).toBeNull();
    }
  });

  it('guarda, lee y lo más nuevo gana', () => {
    const store = memoryStorage();
    expect(saveAfterLogin('/unirse/ABC', T0, store)).toBe(true);
    expect(JSON.parse(store.data.get(AFTER_LOGIN_KEY)!)).toEqual({ path: '/unirse/ABC', at: T0 });
    expect(readAfterLogin(T0 + 1000, store)).toBe('/unirse/ABC');
    // Leer no lo borra.
    expect(readAfterLogin(T0 + 2000, store)).toBe('/unirse/ABC');
    expect(saveAfterLogin('/invitacion/i9', T0 + 3000, store)).toBe(true);
    expect(readAfterLogin(T0 + 4000, store)).toBe('/invitacion/i9');
  });

  it('una ruta que no sirve no se guarda ni borra lo que había', () => {
    const store = memoryStorage();
    saveAfterLogin('/l/x', T0, store);
    expect(saveAfterLogin('https://otro.sitio', T0, store)).toBe(false);
    expect(saveAfterLogin('/', T0, store)).toBe(false);
    expect(saveAfterLogin(null, T0, store)).toBe(false);
    expect(readAfterLogin(T0, store)).toBe('/l/x');
    expect(saveAfterLogin('/l/x', T0, null)).toBe(false);
  });

  it('/login sin cuenta: con `next` lo guarda; sin él (o a Home, o de otro sitio) borra lo viejo', () => {
    const store = memoryStorage();
    expect(syncAfterLogin('/unirse/ABC', T0, store)).toBe('/unirse/ABC');
    expect(readAfterLogin(T0 + 1000, store)).toBe('/unirse/ABC');
    // Se fue sin entrar y después entra desde Home, /acerca o «Crear cuenta»: ya no lo lleva a esa invitación.
    for (const next of [null, undefined, '', '/', '/?x=1', '/login', 'https://otro.sitio/unirse/ABC', '//otro.sitio']) {
      syncAfterLogin('/unirse/ABC', T0, store);
      expect(syncAfterLogin(next, T0 + 2000, store), String(next)).toBeNull();
      expect(readAfterLogin(T0 + 3000, store), String(next)).toBeNull();
      expect(store.data.has(AFTER_LOGIN_KEY)).toBe(false);
    }
    // Lo más nuevo gana.
    syncAfterLogin('/unirse/ABC', T0, store);
    expect(syncAfterLogin('/l/otra', T0 + 1000, store)).toBe('/l/otra');
    expect(takeAfterLogin(T0 + 2000, store)).toBe('/l/otra');
    // Sin almacenamiento no rompe nada.
    expect(syncAfterLogin('/l/x', T0, null)).toBeNull();
  });

  it('vale 24 horas: vencido (o del futuro) se borra', () => {
    const store = memoryStorage();
    saveAfterLogin('/unirse/ABC', T0, store);
    expect(readAfterLogin(T0 + AFTER_LOGIN_MS - 1, store)).toBe('/unirse/ABC');
    expect(readAfterLogin(T0 + AFTER_LOGIN_MS, store)).toBeNull();
    expect(store.data.has(AFTER_LOGIN_KEY)).toBe(false);
    saveAfterLogin('/unirse/ABC', T0, store);
    expect(readAfterLogin(T0 - 60_000, store)).toBeNull();
    expect(store.data.has(AFTER_LOGIN_KEY)).toBe(false);
  });

  it('lo dañado o lo que alguien metió a mano se ignora y se borra', () => {
    const bad = ['{no es json', 'null', '"/l/x"', JSON.stringify({ path: '//otro.sitio', at: T0 }), JSON.stringify({ path: '/l/x' }), JSON.stringify({ path: '/l/x', at: 'ayer' })];
    for (const raw of bad) {
      const store = memoryStorage({ [AFTER_LOGIN_KEY]: raw });
      expect(readAfterLogin(T0, store), raw).toBeNull();
      expect(store.data.has(AFTER_LOGIN_KEY), raw).toBe(false);
    }
    expect(readAfterLogin(T0, null)).toBeNull();
  });

  it('se usa una sola vez', () => {
    const store = memoryStorage();
    saveAfterLogin('/invitacion/i1', T0, store);
    expect(takeAfterLogin(T0 + 5000, store)).toBe('/invitacion/i1');
    expect(takeAfterLogin(T0 + 6000, store)).toBeNull();
    saveAfterLogin('/invitacion/i1', T0, store);
    clearAfterLogin(store);
    expect(readAfterLogin(T0, store)).toBeNull();
    // Sin almacenamiento (o si falla) no rompe nada.
    const fails = () => {
      throw new Error('bloqueado');
    };
    const broken = { getItem: fails, setItem: fails, removeItem: fails };
    expect(saveAfterLogin('/l/x', T0, broken)).toBe(false);
    expect(takeAfterLogin(T0, broken)).toBeNull();
    expect(() => clearAfterLogin(broken)).not.toThrow();
  });
});

describe('el link de Google y el del correo vuelven a donde iba', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setBackendForTests(null);
  });

  it('Supabase: origen más la ruta de la app; lo que no es de la app vuelve al origen', () => {
    vi.stubGlobal('window', { location: { origin: 'https://matchmate.test' } });
    expect(returnUrl('/unirse/ABC123')).toBe('https://matchmate.test/unirse/ABC123');
    expect(returnUrl('/l/x?tab=1')).toBe('https://matchmate.test/l/x?tab=1');
    expect(returnUrl(undefined)).toBe('https://matchmate.test');
    for (const bad of ['//otro.sitio', 'https://otro.sitio', '/a b', '/\\x', '']) expect(returnUrl(bad), bad).toBe('https://matchmate.test');
    vi.unstubAllGlobals();
    // Sin ventana (Node): nada (Supabase usa su «Site URL»).
    expect(returnUrl('/unirse/ABC')).toBeUndefined();
  });

  it('Supabase: Google, registrarse y volver a mandar el correo llevan la ruta', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://matchmate.test' } });
    const oauth = vi.fn(async (_x: unknown) => ({ data: {}, error: null }));
    const signUpFn = vi.fn(async (_x: unknown) => ({ data: { user: { id: 'u1', identities: [{}] }, session: null }, error: null }));
    const resend = vi.fn(async (_x: unknown) => ({ data: {}, error: null }));
    const c = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        getSession: async () => ({ data: { session: null }, error: null }),
        signInWithOAuth: oauth,
        signUp: signUpFn,
        resend,
      },
      realtime: { setAuth: async () => undefined },
    };
    const b = createSupabaseBackend({ url: 'https://x.supabase.co', publishableKey: 'sb_publishable_x', client: c as unknown as SupabaseClient });
    await b.auth.signInWithGoogle('/invitacion/i1');
    expect(oauth.mock.calls[0][0]).toMatchObject({ options: { redirectTo: 'https://matchmate.test/invitacion/i1' } });
    expect(await b.auth.signUp('ana@correo.com', 'secreto1', 'Ana', { adult: true }, undefined, '/unirse/ABC')).toBeNull();
    expect(signUpFn.mock.calls[0][0]).toMatchObject({ options: { emailRedirectTo: 'https://matchmate.test/unirse/ABC' } });
    await b.auth.resendConfirmation('ana@correo.com', undefined, '/unirse/ABC');
    expect(resend.mock.calls[0][0]).toMatchObject({ options: { emailRedirectTo: 'https://matchmate.test/unirse/ABC' } });
  });

  it('la app pasa la ruta de /login; si no hay, la guardada; si tampoco, nada', async () => {
    const store = memoryStorage();
    vi.stubGlobal('localStorage', store);
    const fake = createFakeBackend();
    const google = vi.fn(async (_next?: string) => undefined);
    const signUpFn = vi.fn(async (..._a: unknown[]) => null);
    const resend = vi.fn(async (..._a: unknown[]) => undefined);
    fake.auth.signInWithGoogle = google;
    fake.auth.signUp = signUpFn;
    fake.auth.resendConfirmation = resend;
    setBackendForTests(fake);

    await loginWithGoogle();
    expect(google).toHaveBeenLastCalledWith(undefined);
    await loginWithGoogle('/unirse/ABC');
    expect(google).toHaveBeenLastCalledWith('/unirse/ABC');
    // Lo que no es de la app no viaja.
    await loginWithGoogle('https://otro.sitio');
    expect(google).toHaveBeenLastCalledWith(undefined);

    saveAfterLogin('/invitacion/i7');
    await loginWithGoogle();
    expect(google).toHaveBeenLastCalledWith('/invitacion/i7');
    expect(await signUp(' Ana ', ' ana@correo.com ', 'secreto1', true, 'cap')).toEqual({ needsConfirm: true });
    expect(signUpFn).toHaveBeenLastCalledWith('ana@correo.com', 'secreto1', 'Ana', { adult: true }, 'cap', '/invitacion/i7');
    await resendConfirmation('ana@correo.com', undefined, '/l/x');
    expect(resend).toHaveBeenLastCalledWith('ana@correo.com', undefined, '/l/x');
    // Leerlo para el link no lo gasta: se usa al abrirse la sesión.
    expect(store.data.has(AFTER_LOGIN_KEY)).toBe(true);
  });
});
