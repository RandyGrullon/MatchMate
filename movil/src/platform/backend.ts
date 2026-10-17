/**
 * El backend de la app del teléfono: el mismo de la web contra Supabase (src/lib/backend/supabase.ts), con un cliente
 * hecho para React Native (la sesión en el teléfono, sin leer la URL) y la señal de NetInfo. Lo usa la capa de datos
 * compartida por src/lib/backend/index.native.ts. Sin modo local (PGlite no corre en el teléfono).
 */
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { AUTH_STORAGE_KEY, createSupabaseBackend } from '@mm/lib/backend/supabase';
import type { Backend } from '@mm/lib/backend/types';
import { env } from '@mm/lib/env';
import { isDeviceOnline } from './network';
import { authStorage } from './storage';

let instance: Backend | null = null;

export function backendMode(): Backend['mode'] {
  return 'supabase';
}

export function getBackend(): Backend {
  if (instance) return instance;
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
  instance = { ...base, online: () => isDeviceOnline() };
  return instance;
}

/** Supabase está listo de una vez (no hay base local que abrir). */
export async function backendReady(): Promise<Backend> {
  return getBackend();
}

/** Solo pruebas: usar otro backend; null vuelve a crearlo. */
export function setBackendForTests(b: Backend | null): void {
  instance = b;
}
