/**
 * Backend que se carga cuando hace falta (el local trae PGlite, unos megas de WASM, y no va en el paquete inicial).
 * Se puede usar de una vez: cada llamada espera a que termine de cargar; `subscribe` y `onChange` se enganchan al estar listo.
 */
import { BackendError, type Backend } from './types';

export interface LazyBackend extends Backend {
  /** Espera a que cargue (y lo reintenta si la vez anterior falló). */
  ready(): Promise<Backend>;
}

export function createLazyBackend(mode: Backend['mode'], load: () => Promise<Backend>): LazyBackend {
  let loading: Promise<Backend> | null = null;
  let loaded: Backend | null = null;

  const ready = () =>
    (loading ??= load().then(
      (b) => (loaded = b),
      (e: unknown) => {
        // Si falló (p. ej. sin señal al bajar el WASM la primera vez), la próxima llamada lo intenta de nuevo.
        loading = null;
        const message = e instanceof Error ? e.message : String(e);
        throw e instanceof BackendError ? e : new BackendError(`No se pudo abrir la base local: ${message}`, 'unknown');
      },
    ));

  /** Para lo que devuelve una función de cancelar al instante: se engancha cuando cargue. */
  const later = (attach: (b: Backend) => () => void): (() => void) => {
    if (loaded) return attach(loaded);
    let off: (() => void) | null = null;
    let cancelled = false;
    ready()
      .then((b) => {
        if (!cancelled) off = attach(b);
      })
      .catch(() => {
        // El error ya lo verá quien llame a select/rpc.
      });
    return () => {
      cancelled = true;
      off?.();
      off = null;
    };
  };

  return {
    mode,
    ready,
    auth: {
      getSession: async () => (await ready()).auth.getSession(),
      onChange: (cb) => later((b) => b.auth.onChange(cb)),
      signUp: async (email, password, name, meta) => (await ready()).auth.signUp(email, password, name, meta),
      signIn: async (email, password) => (await ready()).auth.signIn(email, password),
      signInWithGoogle: async () => (await ready()).auth.signInWithGoogle(),
      signOut: async () => (await ready()).auth.signOut(),
      resetPassword: async (email) => (await ready()).auth.resetPassword(email),
      resendConfirmation: async (email) => (await ready()).auth.resendConfirmation(email),
      updatePassword: async (password) => (await ready()).auth.updatePassword(password),
    },
    storage: {
      upload: async (bucket, path, data, contentType) => (await ready()).storage.upload(bucket, path, data, contentType),
      signedUrl: async (bucket, path, expires) => (await ready()).storage.signedUrl(bucket, path, expires),
      remove: async (bucket, paths) => (await ready()).storage.remove(bucket, paths),
    },
    select: async <T = Record<string, unknown>>(q: Parameters<Backend['select']>[0]) => (await ready()).select<T>(q),
    rpc: async <T = unknown>(fn: string, args?: Record<string, unknown>) => (await ready()).rpc<T>(fn, args),
    subscribe: (topic, onMessage) => later((b) => b.subscribe(topic, onMessage)),
    invoke: async <T = unknown>(fn: string, body: unknown) => (await ready()).invoke<T>(fn, body),
    online: () => (loaded ? loaded.online() : mode === 'local' || typeof navigator === 'undefined' || navigator.onLine),
  };
}
