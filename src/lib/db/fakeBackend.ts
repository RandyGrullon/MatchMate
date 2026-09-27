import type { Backend, RealtimeMessage } from '../backend/types';

/**
 * Backend falso para las pruebas de src/lib/db (la app no lo usa). `rpc` responde con `onRpc` y anota cada
 * llamada; `subscribe` guarda las escuchas por tema para mandarles mensajes con `push`.
 */
export interface FakeBackend extends Backend {
  isOnline: boolean;
  calls: { fn: string; args: Record<string, unknown> }[];
  onRpc: (fn: string, args: Record<string, unknown>) => unknown;
  listeners: Map<string, Set<(msg: RealtimeMessage) => void>>;
  /** Si no es null, `subscribe` lanza este error. */
  subscribeError: Error | null;
  subscribeCalls: string[];
  push(topic: string, msg: RealtimeMessage): void;
}

export function createFakeBackend(): FakeBackend {
  const unsupported = () => {
    throw new Error('No disponible en el backend de prueba');
  };
  const fake: FakeBackend = {
    mode: 'local',
    isOnline: true,
    calls: [],
    onRpc: () => ({ ok: true }),
    listeners: new Map(),
    subscribeError: null,
    subscribeCalls: [],
    auth: {
      getSession: async () => null,
      onChange: () => () => {},
      signUp: unsupported,
      signIn: unsupported,
      signInWithGoogle: unsupported,
      signOut: async () => {},
      resetPassword: unsupported,
      resendConfirmation: unsupported,
      updatePassword: unsupported,
    },
    storage: { upload: unsupported, signedUrl: unsupported, remove: unsupported },
    select: async () => [],
    invoke: unsupported,
    async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
      fake.calls.push({ fn, args });
      return (await fake.onRpc(fn, args)) as T;
    },
    subscribe(topic, onMessage) {
      fake.subscribeCalls.push(topic);
      if (fake.subscribeError) throw fake.subscribeError;
      let set = fake.listeners.get(topic);
      if (!set) fake.listeners.set(topic, (set = new Set()));
      set.add(onMessage);
      return () => {
        set.delete(onMessage);
      };
    },
    push(topic, msg) {
      for (const l of [...(fake.listeners.get(topic) ?? [])]) l(msg);
    },
    online: () => fake.isOnline,
  };
  return fake;
}

/**
 * Servidor que imita private.op_log: la misma `p_op_id` aplica una sola vez y devuelve la misma respuesta.
 * `apply` hace el cambio (cuenta cuántas veces se aplicó de verdad).
 */
export function opLogServer(apply: (fn: string, args: Record<string, unknown>) => unknown = (fn) => ({ fn })) {
  const log = new Map<string, unknown>();
  const server = {
    applied: [] as { fn: string; args: Record<string, unknown> }[],
    handle(fn: string, args: Record<string, unknown>): unknown {
      const opId = args.p_op_id as string | undefined;
      if (opId && log.has(opId)) return log.get(opId);
      const result = apply(fn, args);
      server.applied.push({ fn, args });
      if (opId) log.set(opId, result);
      return result;
    },
  };
  return server;
}
