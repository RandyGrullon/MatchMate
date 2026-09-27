import { setBackendForTests } from '../backend';
import { createLocalBackend, type LocalBackend } from '../backend/local';
import { loadLocalSql } from '../backend/migrations';
import { BackendError, type Backend } from '../backend/types';
import { currentOutbox, resetDataClientForTests, setDataUser } from './client';

/**
 * Solo pruebas: la base de verdad (shim + migraciones + RLS) en PGlite, en memoria, con cuentas locales.
 * La capa de datos usa este backend (setBackendForTests) y la cuenta que entra con `as`.
 */

export const PASSWORD = 'secreto1';

export interface TestWorld {
  b: LocalBackend;
  /** Crea la cuenta (con su perfil) y entra con ella. Devuelve su id. */
  signUp(email: string, name: string): Promise<string>;
  /** Entra con esa cuenta (la capa de datos cambia de cuenta: caché y cola). */
  as(email: string): Promise<string>;
  makeSuper(uid: string): Promise<void>;
  /** Usar otro backend encima del local (p. ej. uno que se queda sin señal). */
  use(backend: Backend): void;
  close(): Promise<void>;
}

export async function openWorld(): Promise<TestWorld> {
  const b = await createLocalBackend({ sql: loadLocalSql() });
  setBackendForTests(b);
  const ids = new Map<string, string>();
  return {
    b,
    async signUp(email, name) {
      const s = await b.auth.signUp(email, PASSWORD, name);
      if (!s) throw new Error('sin sesión');
      ids.set(email, s.userId);
      await setDataUser(s.userId);
      return s.userId;
    },
    async as(email) {
      const s = await b.auth.signIn(email, PASSWORD);
      await currentOutbox()?.idle();
      await setDataUser(s.userId);
      return s.userId;
    },
    async makeSuper(uid) {
      await b.db.query('update public.profiles set is_superadmin = true where id = $1', [uid]);
    },
    use(backend) {
      setBackendForTests(backend);
    },
    async close() {
      await resetDataClientForTests();
      setBackendForTests(null);
      await b.close();
    },
  };
}

/** Un backend que se queda sin señal a pedido (y opcionalmente pierde la respuesta después de que el servidor hizo el cambio). */
export interface FlakyBackend extends Backend {
  offline: boolean;
  /** Las RPC fallan por red pero las lecturas funcionan (la cola reintenta y las pantallas leen). */
  rpcDown: boolean;
  /** Las próximas N RPC llegan al servidor pero la respuesta se pierde (error de red). */
  dropReplies: number;
  calls: { fn: string; args: Record<string, unknown> }[];
}

export function flaky(base: Backend): FlakyBackend {
  const net = () => new BackendError('Sin conexión (prueba)', 'network');
  const f: FlakyBackend = {
    offline: false,
    rpcDown: false,
    dropReplies: 0,
    calls: [],
    get mode() {
      return base.mode;
    },
    get auth() {
      return base.auth;
    },
    get storage() {
      return base.storage;
    },
    select: async <T = Record<string, unknown>>(q: Parameters<Backend['select']>[0]) => {
      if (f.offline) throw net();
      return base.select<T>(q);
    },
    async rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
      f.calls.push({ fn, args: args ?? {} });
      if (f.offline || f.rpcDown) throw net();
      const r = await base.rpc<T>(fn, args);
      if (f.dropReplies > 0) {
        f.dropReplies--;
        throw net();
      }
      return r;
    },
    subscribe: (topic, cb) => base.subscribe(topic, cb),
    invoke: <T = unknown>(fn: string, body: unknown) => base.invoke<T>(fn, body),
    online: () => !f.offline,
  };
  return f;
}
