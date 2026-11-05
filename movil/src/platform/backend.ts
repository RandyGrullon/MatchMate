/**
 * El backend de la app del teléfono: el mismo de la web contra Supabase (src/lib/backend/supabase.ts), con un cliente
 * hecho para React Native (la sesión en el teléfono, sin leer la URL) y la señal de NetInfo. Lo usa la capa de datos
 * compartida por src/lib/backend/index.native.ts. Sin modo local (PGlite no corre en el teléfono).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { mapAuthError } from '@mm/lib/backend/errors';
import { AUTH_STORAGE_KEY, createSupabaseBackend } from '@mm/lib/backend/supabase';
import type { Backend } from '@mm/lib/backend/types';
import { env } from '@mm/lib/env';
import { isDeviceOnline } from './network';
import { authStorage } from './storage';

let instance: Backend | null = null;
let supabase: SupabaseClient | null = null;

/** A dónde vuelve Google o Apple: `matchmate://auth` (en Expo Go, `exp://…/--/auth`). Va en las «Redirect URLs» de Supabase. */
export const authRedirect = () => Linking.createURL('auth');

/**
 * «Entrar con Google» en el teléfono: la pantalla de Google en el navegador seguro de la app (ASWebAuthenticationSession
 * en iPhone, Custom Tabs en Android) con PKCE, y el código que vuelve se cambia por la sesión. Cancelar no es error.
 */
async function signInWithGoogleNative(client: SupabaseClient): Promise<void> {
  const redirectTo = authRedirect();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw mapAuthError(error);
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return;
  const back = new URL(result.url);
  const problem = back.searchParams.get('error_description') ?? back.searchParams.get('error');
  if (problem) throw mapAuthError({ message: problem, status: 400 });
  const code = back.searchParams.get('code');
  if (!code) return;
  const { error: exchange } = await client.auth.exchangeCodeForSession(code);
  if (exchange) throw mapAuthError(exchange);
}

/**
 * «Iniciar sesión con Apple» (solo iPhone): la hoja nativa de Apple y su token a Supabase (signInWithIdToken). Necesita
 * el proveedor Apple activado en Supabase y la capacidad «Sign in with Apple» del App ID (docs/movil.md). Cancelar no
 * es error.
 */
export async function signInWithApple(): Promise<void> {
  const Apple = await import('expo-apple-authentication');
  getBackend();
  let credential;
  try {
    credential = await Apple.signInAsync({ requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL] });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
    throw e;
  }
  if (!credential.identityToken) throw mapAuthError({ message: 'Apple no devolvió el token.', status: 400 });
  const { error } = await supabase!.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
  if (error) throw mapAuthError(error);
  // Apple da el nombre solo la primera vez: queda en la cuenta (la base lo usa si el perfil no tiene nombre).
  const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ').trim();
  if (name) await supabase!.auth.updateUser({ data: { name } }).catch(() => undefined);
}

/** ¿Hay «Iniciar sesión con Apple» en este teléfono? (iPhone con iOS 13 o más.) */
export async function appleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  const Apple = await import('expo-apple-authentication');
  return Apple.isAvailableAsync().catch(() => false);
}

export function backendMode(): Backend['mode'] {
  return 'supabase';
}

export function getBackend(): Backend {
  if (instance) return instance;
  // Solo en desarrollo y en la vista previa web: la demostración en memoria de /dev/empresa (sin Supabase). Con
  // require dentro del `if`, la app publicada (__DEV__ falso) no la lleva.
  if (__DEV__ && Platform.OS === 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const demo = require('./demoBackend') as typeof import('./demoBackend');
    if (demo.demoOn()) return (instance = demo.createDemoBackend());
  }
  const url = String(env().VITE_SUPABASE_URL ?? '').trim();
  const key = String(env().VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  if (!url || !key) {
    throw new Error('Faltan EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (movil/.env.local o eas.json).');
  }
  const client = createClient(url, key, {
    auth: {
      storage: authStorage,
      storageKey: AUTH_STORAGE_KEY,
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      // En el teléfono la sesión no llega por la URL (los links vuelven a la app con expo-linking).
      detectSessionInUrl: Platform.OS === 'web',
    },
  });
  // Supabase en React Native: renovar la sesión solo mientras la app está a la vista.
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (status) => {
      if (status === 'active') void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    });
  }
  // TypeScript ve dos copias de supabase-js (la de la web en ../node_modules y la de la app); al correr es una sola:
  // metro.config.js resuelve el código compartido con los node_modules de la app.
  type SharedClient = NonNullable<Parameters<typeof createSupabaseBackend>[0]['client']>;
  const base = createSupabaseBackend({ url, publishableKey: key, client: client as unknown as SharedClient });
  supabase = client;
  instance = {
    ...base,
    // En el teléfono, Google va por el navegador seguro de la app (en la vista previa web, como la web).
    auth: Platform.OS === 'web' ? base.auth : { ...base.auth, signInWithGoogle: () => signInWithGoogleNative(client) },
    // En el teléfono las fotos llegan como bytes (src/lib/bytesBlob.native.ts): se suben así (supabase-js acepta un
    // ArrayBuffer; un Blob de React Native subiría vacío).
    storage:
      Platform.OS === 'web'
        ? base.storage
        : {
            ...base.storage,
            upload: async (bucket, path, data, contentType) => base.storage.upload(bucket, path, (await uploadBytes(data)) as unknown as Blob, contentType),
          },
    online: () => isDeviceOnline(),
  };
  return instance;
}

/** Los bytes de lo que se sube (lo que da bytesBlob.native.ts, o un Blob que sepa darlos). */
async function uploadBytes(data: Blob): Promise<Blob | ArrayBuffer> {
  return typeof data.arrayBuffer === 'function' ? data.arrayBuffer() : data;
}

/** Supabase está listo de una vez (no hay base local que abrir). */
export async function backendReady(): Promise<Backend> {
  return getBackend();
}

/** Solo pruebas: usar otro backend; null vuelve a crearlo. */
export function setBackendForTests(b: Backend | null): void {
  instance = b;
}
