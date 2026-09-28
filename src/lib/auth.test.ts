import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { isEmailNotConfirmed } from './auth';
import { mapAuthError } from './backend/errors';
import { createSupabaseBackend } from './backend/supabase';

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
