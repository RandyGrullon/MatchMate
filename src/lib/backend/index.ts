/**
 * Punto de entrada del backend. Supabase si hay VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY;
 * si no, el local (PGlite), que se carga aparte para que su WASM no vaya en el paquete inicial.
 *
 *   const b = getBackend();           // se puede usar de una vez
 *   await backendReady();             // opcional: esperar a que el local termine de abrir (y ver si falló)
 */
import { createLazyBackend, type LazyBackend } from './lazy';
import { createSupabaseBackend } from './supabase';
import type { Backend } from './types';

export * from './types';

let instance: Backend | null = null;
let lazy: LazyBackend | null = null;

export function backendMode(): Backend['mode'] {
  const env = import.meta.env;
  return env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY ? 'supabase' : 'local';
}

export function getBackend(): Backend {
  if (instance) return instance;
  if (backendMode() === 'supabase') {
    instance = createSupabaseBackend({
      url: String(import.meta.env.VITE_SUPABASE_URL),
      publishableKey: String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
    });
  } else {
    lazy = createLazyBackend('local', async () => {
      const [{ createLocalBackend }, { loadLocalSql }] = await Promise.all([import('./local'), import('./migrations')]);
      return createLocalBackend({ sql: loadLocalSql() });
    });
    instance = lazy;
  }
  return instance;
}

/** Espera a que el backend esté listo (Supabase lo está de una vez; el local abre PGlite y corre las migraciones). */
export async function backendReady(): Promise<Backend> {
  const b = getBackend();
  return b === lazy && lazy ? lazy.ready() : b;
}

/** Solo pruebas: usar otro backend (p. ej. uno local en memoria); null vuelve a elegirlo solo. */
export function setBackendForTests(b: Backend | null): void {
  instance = b;
  lazy = null;
}
