import { useSyncExternalStore } from 'react';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { BackendError, type Backend, type BackendErrorKind } from '../backend/types';
import { asBackendError, classifyError, toError } from './errors';
import { uuidv7 } from './ids';

/**
 * Cola de pendientes sin conexión (lo de cancha: anotar, en vivo, «Voy», +1 juego, envíos).
 *
 * - Cada operación es una RPC con `p_op_id` = su opId (UUID v7): el servidor la guarda en private.op_log,
 *   así que reenviarla (se cortó la señal a mitad) no duplica nada.
 * - Se guarda en IndexedDB (`mm-outbox`) por cuenta: aguanta recargar, cerrar la app y cerrar sesión.
 *   Se envía cuando vuelve a entrar la misma cuenta.
 * - Un solo emisor entre pestañas (navigator.locks; si no hay, un candado en memoria).
 * - En orden dentro de cada grupo (p. ej. la liga); los grupos no se esperan entre sí.
 * - `collapseKey`: una operación nueva reemplaza las pendientes con la misma clave (en vivo: solo el último estado).
 * - Sin señal o servidor caído: se reintenta con esperas crecientes (con algo de azar).
 * - Si el servidor dice que no (evento cerrado, sin permiso, datos malos): pasa a «no se pudo enviar»,
 *   visible para copiar o descartar, y no frena el resto.
 * - Se reanuda al volver la señal, al volver a la app y al abrirla (en iPhone no hay Background Sync).
 *
 * `done` se cumple cuando el servidor confirma y falla con el error si el servidor dijo que no: lo mismo que
 * las escrituras de Firestore que la app ya espera con Promise.race y un tiempo límite.
 */

export type OutboxStatus = 'pending' | 'sending' | 'failed';

export interface OutboxItem {
  opId: string;
  userId: string;
  /** Nombre de la RPC. */
  fn: string;
  /** Argumentos de la RPC; siempre incluyen `p_op_id` = opId. */
  args: Record<string, unknown> & { p_op_id: string };
  collapseKey?: string;
  /** Orden independiente por grupo (p. ej. id de la liga). */
  group: string;
  createdAt: number;
  /** Orden de envío (sube siempre, aunque el reloj del teléfono se atrase). */
  seq: number;
  attempts: number;
  status: OutboxStatus;
  lastError?: string;
  errorKind?: BackendErrorKind;
  errorCode?: string | null;
  /** No reintentar antes de esta hora (ms). */
  nextAttemptAt?: number;
  /** Texto corto para la lista de «no se pudo enviar» (p. ej. «Juegos del martes»). */
  label?: string;
}

export interface EnqueueOptions {
  group?: string;
  collapseKey?: string;
  label?: string;
  /** Se llama enseguida (antes de guardar y de enviar): para el cambio optimista en pantalla. */
  onEnqueue?: (item: OutboxItem) => void;
}

export type SettleOutcome = { ok: true; result: unknown } | { ok: false; error: Error };

export interface OutboxSnapshot {
  /** «N por enviar»: pendientes + la que se está enviando. */
  pendingCount: number;
  /** «No se pudo enviar»: el servidor las rechazó. */
  failed: readonly OutboxItem[];
  sending: boolean;
  /** La sesión venció: hay que entrar de nuevo (o esperar a que se renueve) para enviar. */
  needsAuth: boolean;
}

export interface OutboxOptions {
  backend: Backend;
  userId: string;
  /** Para todas las operaciones: cambio optimista al encolar. */
  onEnqueue?: (item: OutboxItem) => void;
  /** Cuando el servidor confirma o rechaza (p. ej. invalidar etiquetas de la caché). También llega de otras pestañas. */
  onSettled?: (item: OutboxItem, outcome: SettleOutcome) => void;
  /** 'idb' (por defecto si existe) o 'memory' (se pierde al recargar). */
  storage?: 'idb' | 'memory';
  /** Cargar y enviar al crear (por defecto sí). */
  autoStart?: boolean;
  /** Escuchar online / focus / visibilitychange (por defecto sí, si hay ventana). */
  listenWindow?: boolean;
  backoff?: { baseMs?: number; maxMs?: number };
  /** Una RPC que no responde en este tiempo se trata como sin señal (se reintenta con el mismo opId). */
  sendTimeoutMs?: number;
  random?: () => number;
}

export interface Outbox {
  readonly userId: string;
  /** Ya se cargó lo guardado (el conteo es el real). */
  readonly ready: Promise<void>;
  enqueue<T = unknown>(fn: string, args?: Record<string, unknown>, opts?: EnqueueOptions): { opId: string; done: Promise<T> };
  getSnapshot(): OutboxSnapshot;
  subscribe(listener: () => void): () => void;
  /** Avisa el número de pendientes ahora y cada vez que cambia. */
  onPendingCount(cb: (count: number) => void): () => void;
  /** Pendientes (en orden), para que la capa de datos las muestre encima de lo que llega del servidor. */
  listPending(group?: string): OutboxItem[];
  listFailed(): OutboxItem[];
  /** Quita una operación sin enviarla (la de «no se pudo enviar», o una pendiente). */
  discard(opId: string): Promise<void>;
  /** Vuelve a intentar una que falló. */
  retry(opId: string): Promise<void>;
  /** Envía ya lo pendiente (sin esperar los reintentos programados). Se cumple al terminar la vuelta. */
  flush(): Promise<void>;
  /** Se cumple cuando no hay una vuelta de envío en curso. */
  idle(): Promise<void>;
  /** Suelta todo (cerrar sesión o cambiar de cuenta). Lo pendiente queda guardado para esa cuenta. */
  dispose(): void;
}

const OUTBOX_DB = 'mm-outbox';
const DEFAULT_GROUP = 'general';
const DEFAULT_BASE_MS = 2_000;
const DEFAULT_MAX_MS = 5 * 60_000;
const DEFAULT_SEND_TIMEOUT_MS = 30_000;
/** Con la sesión vencida no vale la pena insistir seguido. */
const AUTH_MIN_WAIT_MS = 30_000;

// ---------- Dónde se guarda ----------

interface OutboxDB extends DBSchema {
  ops: { key: string; value: OutboxItem; indexes: { user: string } };
}

interface Store {
  all(userId: string): Promise<OutboxItem[]>;
  /** Guarda `item` y borra `remove` en una sola transacción. */
  replace(remove: string[], item: OutboxItem | null): Promise<void>;
  /** Cambia una operación solo si todavía existe (otra pestaña pudo enviarla o descartarla). */
  patch(opId: string, patch: Partial<OutboxItem>): Promise<void>;
  close(): void;
}

const merge = (item: OutboxItem, patch: Partial<OutboxItem>): OutboxItem => {
  const next = { ...item, ...patch } as OutboxItem & Record<string, unknown>;
  for (const k of Object.keys(patch)) if (next[k] === undefined) delete next[k];
  return next;
};

async function openOutboxDB(): Promise<IDBPDatabase<OutboxDB>> {
  const db = await openDB<OutboxDB>(OUTBOX_DB, 1, {
    upgrade(d) {
      d.createObjectStore('ops', { keyPath: 'opId' }).createIndex('user', 'userId');
    },
  });
  db.addEventListener('versionchange', () => db.close());
  return db;
}

function idbStore(db: IDBPDatabase<OutboxDB>): Store {
  return {
    all: (userId) => db.getAllFromIndex('ops', 'user', userId),
    async replace(remove, item) {
      const tx = db.transaction('ops', 'readwrite');
      await Promise.all([...remove.map((id) => tx.store.delete(id)), ...(item ? [tx.store.put(item)] : []), tx.done]);
    },
    async patch(opId, patch) {
      const tx = db.transaction('ops', 'readwrite');
      const old = await tx.store.get(opId);
      if (old) await tx.store.put(merge(old, patch));
      await tx.done;
    },
    close: () => db.close(),
  };
}

/** Sin IndexedDB (o si falla): en memoria, compartido por las colas de esta pestaña. */
const memoryOps = new Map<string, OutboxItem>();
const memoryStore: Store = {
  all: async (userId) => [...memoryOps.values()].filter((i) => i.userId === userId).map((i) => ({ ...i })),
  async replace(remove, item) {
    for (const id of remove) memoryOps.delete(id);
    if (item) memoryOps.set(item.opId, { ...item });
  },
  async patch(opId, patch) {
    const old = memoryOps.get(opId);
    if (old) memoryOps.set(opId, merge(old, patch));
  },
  close: () => {},
};

/** Solo para pruebas: vacía la cola en memoria. */
export function resetMemoryOutbox() {
  memoryOps.clear();
}

/** Cuántas operaciones guardadas tiene cada cuenta (para «entra de nuevo para enviar N pendientes»). */
export async function pendingByUser(): Promise<Record<string, { pending: number; failed: number }>> {
  const out: Record<string, { pending: number; failed: number }> = {};
  let items: OutboxItem[] = [...memoryOps.values()];
  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await openOutboxDB();
      items = items.concat(await db.getAll('ops'));
      db.close();
    } catch {
      // sin IndexedDB solo cuenta la memoria
    }
  }
  for (const i of items) {
    const row = (out[i.userId] ??= { pending: 0, failed: 0 });
    if (i.status === 'failed') row.failed++;
    else row.pending++;
  }
  return out;
}

// ---------- Candado entre pestañas ----------

const localLocks = new Map<string, Promise<void>>();

/** Un solo emisor: navigator.locks entre pestañas; si no existe, un candado en memoria (esta pestaña). */
async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (locks && typeof locks.request === 'function') return locks.request(name, () => fn()) as Promise<T>;
  const prev = localLocks.get(name) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const tail = prev.then(() => mine);
  localLocks.set(name, tail);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (localLocks.get(name) === tail) localLocks.delete(name);
  }
}

// ---------- Mensajes entre pestañas ----------

type ChannelMessage =
  | { type: 'changed' }
  | { type: 'settled'; opId: string; ok: true; result: unknown }
  | { type: 'settled'; opId: string; ok: false; error: { message: string; kind: BackendErrorKind; code: string | null }; removed: boolean };

interface Waiter {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

const bySeq = (a: OutboxItem, b: OutboxItem) => a.seq - b.seq || (a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0);

export function createOutbox(options: OutboxOptions): Outbox {
  const { backend, userId } = options;
  if (!userId) throw new Error('La cola necesita la cuenta (userId).');
  const baseMs = options.backoff?.baseMs ?? DEFAULT_BASE_MS;
  const maxMs = options.backoff?.maxMs ?? DEFAULT_MAX_MS;
  const sendTimeoutMs = options.sendTimeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
  const random = options.random ?? Math.random;
  const lockName = `mm-outbox:${userId}`;

  const useIdb = (options.storage ?? (typeof indexedDB === 'undefined' ? 'memory' : 'idb')) === 'idb';
  const storePromise: Promise<Store> = useIdb
    ? openOutboxDB().then(idbStore, (e) => {
        console.warn('Sin IndexedDB: la cola queda solo en memoria', e);
        return memoryStore;
      })
    : Promise.resolve(memoryStore);

  /** Copia en memoria de lo guardado (de esta cuenta). */
  let items = new Map<string, OutboxItem>();
  const waiters = new Map<string, Waiter[]>();
  /** Creadas aquí que todavía no se vieron al releer la base, y cuáles de esas ya se terminaron de guardar. */
  const unsaved = new Set<string>();
  const savedLocal = new Set<string>();
  const forgetLocal = (id: string) => {
    unsaved.delete(id);
    savedLocal.delete(id);
  };
  const listeners = new Set<() => void>();
  let writes: Promise<void> = Promise.resolve();
  let lastSeq = 0;
  let needsAuth = false;
  /** Con la sesión vencida, antes de esta hora solo se intenta si alguien fuerza (flush, online, volver a la app). */
  let authRetryAt = 0;
  let disposed = false;
  let closed = false;
  let running: Promise<void> | null = null;
  let rerun = false;
  let forceNext = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Se cumple al cerrar la cola: una RPC que no responde no deja el candado tomado. */
  let stopSending!: () => void;
  const stopped = new Promise<'stopped'>((resolve) => (stopSending = () => resolve('stopped')));

  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(lockName) : null;
  const post = (msg: ChannelMessage) => {
    try {
      channel?.postMessage(msg);
    } catch {
      // la otra pestaña se enterará al releer
    }
  };

  /** Escrituras en fila (en orden). Se cumple con true si se guardó. */
  const queueWrite = (fn: (s: Store) => Promise<unknown>): Promise<boolean> => {
    const run = writes
      .then(async () => {
        if (closed) return false;
        await fn(await storePromise);
        return true;
      })
      .catch((e) => {
        console.error('No se pudo guardar la cola', e);
        return false;
      });
    writes = run.then(() => {});
    return run;
  };

  // ---------- Estado para la pantalla ----------

  const computeSnapshot = (): OutboxSnapshot => {
    const all = [...items.values()];
    return {
      pendingCount: all.filter((i) => i.status !== 'failed').length,
      failed: all.filter((i) => i.status === 'failed').sort(bySeq),
      sending: all.some((i) => i.status === 'sending'),
      needsAuth,
    };
  };
  let snapshot = computeSnapshot();
  const emit = () => {
    const next = computeSnapshot();
    const same =
      next.pendingCount === snapshot.pendingCount &&
      next.sending === snapshot.sending &&
      next.needsAuth === snapshot.needsAuth &&
      next.failed.length === snapshot.failed.length &&
      next.failed.every((f, i) => f === snapshot.failed[i]);
    if (same) return;
    snapshot = next;
    for (const l of [...listeners]) l();
  };

  function update(opId: string, patch: Partial<OutboxItem>) {
    const it = items.get(opId);
    if (!it) return;
    items.set(opId, merge(it, patch));
    void queueWrite((s) => s.patch(opId, patch));
  }

  function settleWaiters(opId: string, outcome: SettleOutcome) {
    const list = waiters.get(opId);
    if (!list) return;
    waiters.delete(opId);
    for (const w of list) {
      if (outcome.ok) w.resolve(outcome.result);
      else w.reject(outcome.error);
    }
  }

  function notifySettled(item: OutboxItem, outcome: SettleOutcome) {
    try {
      options.onSettled?.(item, outcome);
    } catch (e) {
      console.error(e);
    }
  }

  // ---------- Leer lo guardado ----------

  /** Cada lectura lleva un número: solo se aplica la más nueva, y durante una vuelta de envío solo la de la vuelta. */
  let reloadToken = 0;
  let inPass = false;

  async function reload(fromPass = false) {
    const token = ++reloadToken;
    const savedAtStart = new Set(savedLocal);
    const store = await storePromise;
    if (closed) return;
    const list = await store.all(userId);
    if (closed || token !== reloadToken || (inPass && !fromPass)) return;
    const fresh = new Map(list.map((i) => [i.opId, i] as const));
    for (const id of [...unsaved]) {
      const mine = items.get(id);
      // Ya estaba guardada antes de leer y no apareció: otra pestaña la envió o la descartó.
      if (fresh.has(id) || !mine || savedAtStart.has(id)) forgetLocal(id);
      // Todavía se está guardando: se queda la de memoria.
      else fresh.set(id, mine);
    }
    for (const id of [...waiters.keys()]) {
      const it = fresh.get(id);
      if (!it) {
        // Ya no está: otra pestaña la envió (o la descartó) y el aviso no llegó. Se da por enviada.
        settleWaiters(id, { ok: true, result: undefined });
      } else if (it.status === 'failed') {
        settleWaiters(id, { ok: false, error: new BackendError(it.lastError ?? 'No se pudo enviar.', it.errorKind ?? 'unknown', it.errorCode ?? null) });
      }
    }
    items = fresh;
    for (const i of items.values()) lastSeq = Math.max(lastSeq, i.seq);
    emit();
  }

  // ---------- Encolar ----------

  function enqueue<T = unknown>(fn: string, args: Record<string, unknown> = {}, opts: EnqueueOptions = {}): { opId: string; done: Promise<T> } {
    if (disposed) throw new Error('La cola de esta cuenta ya se cerró.');
    const opId = uuidv7();
    const now = Date.now();
    lastSeq = Math.max(now, lastSeq + 1);
    const item: OutboxItem = {
      opId,
      userId,
      fn,
      args: { ...args, p_op_id: opId },
      group: opts.group ?? DEFAULT_GROUP,
      createdAt: now,
      seq: lastSeq,
      attempts: 0,
      status: 'pending',
    };
    if (opts.collapseKey) item.collapseKey = opts.collapseKey;
    if (opts.label) item.label = opts.label;

    let waiter!: Waiter;
    const done = new Promise<T>((resolve, reject) => (waiter = { resolve: resolve as (v: unknown) => void, reject }));
    done.catch(() => {}); // si la pantalla no espera el resultado, no es un error sin atrapar
    const mine: Waiter[] = [waiter];

    // Colapso: la nueva reemplaza a las de la misma clave que no se están enviando; quien esperaba la vieja
    // espera ahora la nueva (se cumple cuando el servidor tiene el último estado).
    const replaced: string[] = [];
    if (opts.collapseKey) {
      for (const old of [...items.values()]) {
        if (old.collapseKey !== opts.collapseKey || old.status === 'sending') continue;
        replaced.push(old.opId);
        items.delete(old.opId);
        forgetLocal(old.opId);
        mine.push(...(waiters.get(old.opId) ?? []));
        waiters.delete(old.opId);
      }
    }
    waiters.set(opId, mine);
    items.set(opId, item);
    unsaved.add(opId);
    emit();
    for (const hook of [opts.onEnqueue, options.onEnqueue]) {
      try {
        hook?.(item);
      } catch (e) {
        console.error(e);
      }
    }
    void queueWrite((s) => s.replace(replaced, item)).then((saved) => {
      // Si no se pudo guardar (sin espacio), sigue en memoria y se envía igual.
      if (saved && unsaved.has(opId)) savedLocal.add(opId);
      post({ type: 'changed' });
      if (!disposed) void kick(false);
    });
    return { opId, done };
  }

  // ---------- Enviar ----------

  const isOnline = () => backend.online() && !(typeof navigator !== 'undefined' && navigator.onLine === false);

  function backoffDelay(attempts: number) {
    const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempts - 1));
    return Math.round(exp / 2 + (random() * exp) / 2);
  }

  function withTimeout<T>(p: Promise<T>): Promise<T> {
    let t: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      t = setTimeout(() => reject(new BackendError('El servidor tardó demasiado en responder.', 'network')), sendTimeoutMs);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(t));
  }

  /** La primera de cada grupo (las fallidas no frenan). */
  function heads(): OutboxItem[] {
    const first = new Map<string, OutboxItem>();
    for (const it of items.values()) {
      if (it.status === 'failed') continue;
      const cur = first.get(it.group);
      if (!cur || bySeq(it, cur) < 0) first.set(it.group, it);
    }
    return [...first.values()].sort(bySeq);
  }

  async function sendOne(item: OutboxItem): Promise<'ok' | 'retry' | 'auth' | 'final' | 'stopped'> {
    update(item.opId, { status: 'sending' });
    emit();
    try {
      const sent = withTimeout(Promise.resolve().then(() => backend.rpc(item.fn, item.args)));
      const res = await Promise.race([sent.then((result) => ({ result })), stopped]);
      if (res === 'stopped') {
        // Se cerró la cola a mitad del envío: queda «enviando» guardada y la próxima vez se reenvía con el
        // mismo opId (el servidor no la duplica). Si el servidor contesta, quien esperaba se entera igual.
        sent.then((result) => settleWaiters(item.opId, { ok: true, result }), () => {});
        return 'stopped';
      }
      const { result } = res;
      needsAuth = false;
      items.delete(item.opId);
      forgetLocal(item.opId);
      void queueWrite((s) => s.replace([item.opId], null));
      emit();
      const outcome: SettleOutcome = { ok: true, result };
      settleWaiters(item.opId, outcome);
      notifySettled(item, outcome);
      post({ type: 'settled', opId: item.opId, ok: true, result });
      return 'ok';
    } catch (err) {
      const error = toError(err);
      const be = asBackendError(err);
      const cls = classifyError(err);
      const attempts = item.attempts + 1;
      const info = { attempts, lastError: error.message, errorKind: be?.kind ?? 'unknown', errorCode: be?.code ?? null } as const;
      if (cls === 'final') {
        update(item.opId, { ...info, status: 'failed', nextAttemptAt: undefined });
        emit();
        const outcome: SettleOutcome = { ok: false, error };
        settleWaiters(item.opId, outcome);
        notifySettled(items.get(item.opId) ?? item, outcome);
        post({ type: 'settled', opId: item.opId, ok: false, error: { message: error.message, kind: info.errorKind, code: info.errorCode }, removed: false });
        return 'final';
      }
      let wait = backoffDelay(attempts);
      if (cls === 'auth') {
        wait = Math.max(wait, AUTH_MIN_WAIT_MS);
        needsAuth = true;
        authRetryAt = Date.now() + wait;
      }
      update(item.opId, { ...info, status: 'pending', nextAttemptAt: Date.now() + wait });
      emit();
      return cls;
    }
  }

  /** Junta pendientes con la misma clave de colapso (p. ej. una de otra pestaña o de antes de recargar). */
  function collapseStored() {
    const newest = new Map<string, OutboxItem>();
    for (const it of [...items.values()].sort(bySeq)) {
      if (!it.collapseKey || it.status === 'sending') continue;
      const prev = newest.get(it.collapseKey);
      if (prev) {
        items.delete(prev.opId);
        forgetLocal(prev.opId);
        const moved = waiters.get(prev.opId);
        if (moved) {
          waiters.delete(prev.opId);
          waiters.set(it.opId, [...(waiters.get(it.opId) ?? []), ...moved]);
        }
        void queueWrite((s) => s.replace([prev.opId], null));
      }
      newest.set(it.collapseKey, it);
    }
  }

  async function pass(force: boolean) {
    inPass = true;
    try {
      await sendPass(force);
    } finally {
      inPass = false;
      // Todo guardado antes de soltar el candado: la próxima pestaña lee la cola al día (no reenvía lo enviado).
      await writes;
    }
  }

  async function sendPass(force: boolean) {
    await writes; // lo de esta pestaña ya está guardado
    if (disposed) return;
    await reload(true); // y lo que dejaron otras pestañas
    if (disposed) return;
    // Tenemos el candado: nadie más está enviando. Lo que quedó «enviando» es de un envío que se cortó
    // (recarga o pestaña cerrada): vuelve a pendiente y se reenvía con el mismo opId (el servidor no duplica).
    for (const it of [...items.values()]) {
      if (it.status === 'sending') update(it.opId, { status: 'pending' });
      if (force && it.nextAttemptAt != null && it.status !== 'failed') update(it.opId, { nextAttemptAt: undefined });
    }
    collapseStored();
    emit();
    for (;;) {
      if (disposed || !isOnline()) return;
      if (needsAuth && !force && Date.now() < authRetryAt) return;
      const now = Date.now();
      const ready = heads().filter((h) => (h.nextAttemptAt ?? 0) <= now);
      if (!ready.length) return;
      for (const head of ready) {
        const current = items.get(head.opId);
        if (!current || current.status !== 'pending') continue;
        const r = await sendOne(current);
        // Con la sesión vencida nada va a pasar: se para todo hasta que se renueve.
        if (r === 'auth' || r === 'stopped' || disposed) return;
      }
    }
  }

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  /** Programa la próxima vuelta: ya si algo quedó listo mientras terminaba, o para el primer reintento que toque. */
  function scheduleNext() {
    clearTimer();
    if (disposed || !isOnline()) return;
    const now = Date.now();
    let next = Infinity;
    for (const h of heads()) next = Math.min(next, h.nextAttemptAt ?? now);
    if (!Number.isFinite(next)) return;
    if (needsAuth) next = Math.max(next, authRetryAt);
    timer = setTimeout(
      () => {
        timer = null;
        void kick(false);
      },
      Math.max(0, next - now),
    );
  }

  function kick(force: boolean): Promise<void> {
    if (disposed) return Promise.resolve();
    if (force) forceNext = true;
    if (running) {
      // La vuelta en curso da otra vuelta (o la siguiente, si ya iba saliendo): se espera hasta esa.
      rerun = true;
      return running.then(() => running ?? undefined);
    }
    clearTimer();
    running = (async () => {
      do {
        rerun = false;
        const f = forceNext;
        forceNext = false;
        await withLock(lockName, () => pass(f));
      } while (rerun && !disposed);
    })()
      .catch((e) => console.error('Falló la vuelta de envío de la cola', e))
      .finally(() => {
        running = null;
        if (rerun && !disposed) void kick(false);
        else scheduleNext();
      });
    return running;
  }

  // ---------- Otras pestañas ----------

  if (channel) {
    channel.onmessage = (ev: MessageEvent<ChannelMessage>) => {
      if (disposed) return;
      const m = ev.data;
      if (m.type === 'settled') {
        const it = items.get(m.opId);
        const outcome: SettleOutcome = m.ok ? { ok: true, result: m.result } : { ok: false, error: new BackendError(m.error.message, m.error.kind, m.error.code) };
        settleWaiters(m.opId, outcome);
        if (m.ok || m.removed) {
          items.delete(m.opId);
          forgetLocal(m.opId);
        } else if (it) items.set(m.opId, merge(it, { status: 'failed', lastError: m.error.message, errorKind: m.error.kind, errorCode: m.error.code }));
        if (it && !(!m.ok && m.removed)) notifySettled(it, outcome);
        emit();
        return;
      }
      // Otra pestaña encoló o cambió algo: releer (si hay una vuelta en curso, la siguiente relee).
      if (running) rerun = true;
      else void writes.then(() => reload()).catch(() => {});
    };
  }

  // ---------- Ventana ----------

  const onWake = () => void kick(true);
  const onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') onWake();
  };
  const listen = options.listenWindow ?? true;
  const hasWindow = listen && typeof window !== 'undefined' && typeof window.addEventListener === 'function';
  if (hasWindow) {
    window.addEventListener('online', onWake);
    window.addEventListener('focus', onWake);
  }
  if (listen && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

  const ready = reload().catch((e) => console.error('No se pudo leer la cola', e));
  if (options.autoStart ?? true) void ready.then(() => kick(true));

  return {
    userId,
    ready,
    enqueue,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onPendingCount(cb) {
      let last = snapshot.pendingCount;
      cb(last);
      const l = () => {
        if (snapshot.pendingCount === last) return;
        last = snapshot.pendingCount;
        cb(last);
      };
      listeners.add(l);
      return () => listeners.delete(l);
    },
    listPending: (group?: string) =>
      [...items.values()].filter((i) => i.status !== 'failed' && (group == null || i.group === group)).sort(bySeq),
    listFailed: () => [...snapshot.failed],
    async discard(opId) {
      const it = items.get(opId);
      if (!it) return;
      if (it.status === 'sending') throw new Error('Se está enviando: espera un momento.');
      items.delete(opId);
      forgetLocal(opId);
      emit();
      const error = new BackendError('Se descartó sin enviar.', 'unknown');
      settleWaiters(opId, { ok: false, error });
      await queueWrite((s) => s.replace([opId], null));
      post({ type: 'settled', opId, ok: false, error: { message: error.message, kind: error.kind, code: null }, removed: true });
    },
    async retry(opId) {
      const it = items.get(opId);
      if (!it || it.status !== 'failed') return;
      update(opId, { status: 'pending', attempts: 0, lastError: undefined, errorKind: undefined, errorCode: undefined, nextAttemptAt: undefined });
      emit();
      await writes;
      post({ type: 'changed' });
      await kick(true);
    },
    flush: () => kick(true),
    idle: async () => {
      while (running) await running;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopSending();
      clearTimer();
      if (hasWindow) {
        window.removeEventListener('online', onWake);
        window.removeEventListener('focus', onWake);
      }
      if (listen && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      channel?.close();
      listeners.clear();
      void writes.then(async () => {
        closed = true;
        (await storePromise).close();
      });
    },
  };
}

const EMPTY: OutboxSnapshot = { pendingCount: 0, failed: [], sending: false, needsAuth: false };
const noopSubscribe = () => () => {};

/** Estado de la cola para la pantalla («N por enviar», «no se pudo enviar», «entra de nuevo»). */
export function useOutbox(outbox: Outbox | null): OutboxSnapshot {
  return useSyncExternalStore(
    outbox ? outbox.subscribe : noopSubscribe,
    outbox ? outbox.getSnapshot : () => EMPTY,
    outbox ? outbox.getSnapshot : () => EMPTY,
  );
}
