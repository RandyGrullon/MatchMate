import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Backend, RealtimeMessage } from '../backend/types';
import { classifyError, isAccessLoss, toError } from './errors';

/**
 * Caché de consultas del cliente (lo que antes hacía onSnapshot de Firestore):
 * - varias pantallas que piden lo mismo comparten una sola consulta (en vuelo y ya cargada);
 * - se muestra lo que ya se tenía mientras se vuelve a pedir (stale-while-revalidate);
 * - se vuelve a pedir al volver a la app, al recuperar la señal, al invalidar una etiqueta o cada `pollMs`;
 * - lo que llega bien se guarda en IndexedDB (`mm-query`, por cuenta) y se carga al abrir la app,
 *   así las pantallas muestran lo último que se vio aunque no haya señal (`fromCache` = true).
 *
 * El resultado tiene la misma forma que `Live<T>` de data.ts (data, loading, error) más `fromCache`.
 */

export interface QueryState<T> {
  data: T;
  /** Todavía no hay nada que mostrar (ni guardado ni del servidor). Si hay algo viejo, es false mientras se actualiza. */
  loading: boolean;
  error: Error | null;
  /** Lo que se muestra es la copia guardada en el teléfono y el servidor todavía no la confirmó. */
  fromCache: boolean;
}

export interface QueryOptions<T> {
  /** Etiquetas para invalidar juntas (p. ej. `league:<id>`, `event:<id>`). */
  tags?: string[];
  /** Cuánto tiempo (ms) se considera fresco lo cargado; mientras tanto no se vuelve a pedir al montar o volver. */
  staleMs?: number;
  /** Qué mostrar mientras no hay nada (p. ej. [] o null, como las lecturas de BowlingX). */
  initial?: T;
  /** Volver a pedir cada tantos ms mientras la pantalla esté abierta y visible. */
  pollMs?: number;
  /** false = no guardar en el teléfono (datos delicados). Por defecto se guarda. */
  persist?: boolean;
}

export interface QueryClientOptions {
  /** 'idb' guarda lo cargado en IndexedDB (por defecto si existe); 'none' solo en memoria. */
  persistence?: 'idb' | 'none';
  /** De quién es la caché (id de la cuenta). null = sin sesión. */
  userKey?: () => string | null;
  /** Para useTopic (tiempo real). Se puede pasar después con setBackend. */
  backend?: Backend | (() => Backend | null);
  /** Frescura por defecto (ms). */
  defaultStaleMs?: number;
  /** Lo guardado más viejo que esto no se carga (y se borra). Por defecto 30 días. */
  maxAgeMs?: number;
  /** Al salir de la cuenta, borrar su copia guardada (por defecto no: se ve sin señal si vuelve a entrar). */
  clearOnSignOut?: boolean;
  /** Escuchar focus / online / visibilitychange de la ventana (por defecto sí, si hay ventana). */
  listenWindow?: boolean;
}

export type TopicMode = 'off' | 'realtime' | 'polling';

export interface TopicOptions {
  /** Lo que hace la pantalla para ponerse al día sin tiempo real (normalmente invalidar sus etiquetas). */
  onPoll?: () => void;
  /** Cada cuánto consultar sin tiempo real: [mínimo, máximo] en ms (al azar entre los dos). Por defecto 15–20 s. */
  pollMs?: [number, number];
  /** No conectarse a tiempo real: solo consultar (visitantes sin cuenta, o live_mode = consulta). */
  pollOnly?: boolean;
  /** Tras un fallo, cuándo volver a probar tiempo real (ms). Con too_many_connections se espera 5 veces más. */
  retryRealtimeMs?: number;
  /** Desconectarse si la pantalla pasa oculta más de esto (ms). Por defecto 60 s. */
  hiddenMs?: number;
  random?: () => number;
}

export interface WatchTopicOptions extends TopicOptions {
  onMode?: (mode: TopicMode) => void;
}

export interface TopicWatch {
  mode(): TopicMode;
  stop(): void;
}

/** Qué etiquetas invalida cada evento de tiempo real (lista fija o calculada del payload). `*` = cualquier evento. */
export type MessageTagMap = Record<string, string[] | ((payload: unknown) => string[])>;

export interface QueryClient {
  /** La copia guardada ya se cargó (se puede esperar antes de pintar, o no). */
  readonly ready: Promise<void>;
  useQuery<T>(key: string | null, fetcher: () => Promise<T>, opts?: QueryOptions<T>): QueryState<T>;
  /** Tiempo real de un tema; si falla o hay demasiadas conexiones, consulta cada 15–20 s con `opts.onPoll`. */
  useTopic(topic: string | null, onMessage: (msg: RealtimeMessage) => void, opts?: TopicOptions): TopicMode;
  /** Lo mismo que useQuery sin React: registra una pantalla y avisa con `listener` cuando cambia. */
  observe<T>(key: string, fetcher: () => Promise<T>, opts: QueryOptions<T>, listener: () => void): () => void;
  getState<T>(key: string, initial?: T): QueryState<T>;
  /** Pide (o reutiliza si está fresco o en vuelo) sin montar una pantalla. */
  fetchQuery<T>(key: string, fetcher: () => Promise<T>, opts?: QueryOptions<T>): Promise<T>;
  getQueryData<T>(key: string): T | undefined;
  /** Cambio optimista. Devuelve lo que había (para deshacer). Una consulta en vuelo de antes no lo pisa. */
  setQueryData<T>(key: string, updater: T | ((old: T | undefined) => T)): T | undefined;
  invalidate(tag: string): void;
  invalidateKey(key: string): void;
  invalidateAll(): void;
  /** Etiquetas de un mensaje de tiempo real (payload.tags y/o el mapa por evento), ya invalidadas. */
  invalidateFromMessage(msg: RealtimeMessage, map?: MessageTagMap): string[];
  messageInvalidator(map?: MessageTagMap): (msg: RealtimeMessage) => void;
  /** Lo que hace la app al volver a primer plano / al recuperar señal (también se llama solo con la ventana). */
  onWindowFocus(): void;
  onReconnect(): void;
  /**
   * Cambió la cuenta (entró otra o salió): vacía la memoria, carga la copia de la nueva y vuelve a pedir lo
   * que está en pantalla. `clearPrevious` borra la copia guardada de la cuenta anterior.
   */
  userChanged(opts?: { clearPrevious?: boolean }): Promise<void>;
  /** Borra la copia guardada de una cuenta (por defecto la actual). */
  clearPersisted(userKey?: string | null): Promise<void>;
  /** Espera a que se terminen de guardar las copias pendientes. */
  whenPersisted(): Promise<void>;
  setBackend(backend: Backend | null): void;
  dispose(): void;
}

// ---------- Tiempo real con consulta de respaldo ----------

/** Evento de estado que el backend manda por `subscribe` (no viene de la base): payload `{ status, message? }`. */
export const REALTIME_STATUS_EVENT = 'mm:status';

const DEFAULT_POLL: [number, number] = [15_000, 20_000];
const DEFAULT_RETRY_REALTIME_MS = 60_000;
const DEFAULT_HIDDEN_MS = 60_000;

const TOO_MANY = /too.?many/i;

/**
 * Lee un mensaje de estado del canal. Convención con el backend:
 * `{ event: 'mm:status', payload: { status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED', message? } }`
 * (los estados de supabase-js tal cual) y `message: 'too_many_connections'` cuando el plan está lleno.
 * También se entienden los mensajes `system` de Supabase Realtime.
 */
export function realtimeStatus(msg: RealtimeMessage): 'ok' | 'failed' | 'too_many' | 'ignore' | null {
  if (msg.event !== REALTIME_STATUS_EVENT && msg.event !== 'system') return null;
  const p = (msg.payload ?? {}) as { status?: unknown; message?: unknown; code?: unknown; extension?: unknown };
  const text = [p.status, p.message, p.code].map((v) => (v == null ? '' : String(v))).join(' ');
  if (TOO_MANY.test(text)) return 'too_many';
  const status = String(p.status ?? '').toUpperCase();
  if (status === 'SUBSCRIBED' || status === 'OK') return 'ok';
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED' || status === 'ERROR') return 'failed';
  return 'ignore';
}

const pageHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/**
 * Se suscribe a un tema. Si el canal falla (error, tiempo agotado, too_many_connections o `subscribe` lanza),
 * pasa a consultar cada 15–20 s con `onPoll` y vuelve a probar tiempo real más tarde. Si la pantalla pasa oculta
 * más de 60 s se desconecta (ahorra conexiones del plan gratis) y al volver se pone al día.
 */
export function watchTopic(backend: Backend | null, topic: string, onMessage: (msg: RealtimeMessage) => void, opts: WatchTopicOptions = {}): TopicWatch {
  const [minPoll, maxPoll] = opts.pollMs ?? DEFAULT_POLL;
  const random = opts.random ?? Math.random;
  const retryMs = opts.retryRealtimeMs ?? DEFAULT_RETRY_REALTIME_MS;
  const hiddenMs = opts.hiddenMs ?? DEFAULT_HIDDEN_MS;
  let mode: TopicMode = 'off';
  let stopped = false;
  let paused = false;
  let unsub: (() => void) | null = null;
  let attempt = 0;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let hiddenTimer: ReturnType<typeof setTimeout> | null = null;

  const setMode = (m: TopicMode) => {
    if (m === mode) return;
    mode = m;
    opts.onMode?.(m);
  };
  const poll = () => {
    try {
      opts.onPoll?.();
    } catch (e) {
      console.error(e);
    }
  };
  const stopPolling = () => {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  };
  const schedulePoll = () => {
    stopPolling();
    pollTimer = setTimeout(() => {
      pollTimer = null;
      if (stopped || paused) return;
      poll();
      schedulePoll();
    }, minPoll + random() * (maxPoll - minPoll));
  };
  const disconnect = () => {
    attempt++;
    const u = unsub;
    unsub = null;
    if (u) {
      try {
        u();
      } catch {
        // ya estaba cerrado
      }
    }
  };
  const clearRetry = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  };

  const fallback = (tooMany: boolean) => {
    disconnect();
    const wasPolling = mode === 'polling';
    setMode('polling');
    if (!wasPolling) {
      poll(); // se perdieron mensajes: ponerse al día de una vez
      schedulePoll();
    }
    clearRetry();
    if (!opts.pollOnly && backend) retryTimer = setTimeout(connect, retryMs * (tooMany ? 5 : 1));
  };

  function connect() {
    retryTimer = null;
    if (stopped || paused) return;
    const my = ++attempt;
    let u: () => void;
    try {
      u = backend!.subscribe(topic, (msg) => {
        if (my !== attempt || stopped) return;
        const status = realtimeStatus(msg);
        if (status === 'too_many' || status === 'failed') return fallback(status === 'too_many');
        if (status === 'ok' || status === 'ignore') return;
        onMessage(msg);
      });
    } catch (e) {
      fallback(TOO_MANY.test(e instanceof Error ? e.message : String(e)));
      return;
    }
    if (my !== attempt) {
      // El canal avisó el fallo antes de terminar de suscribirse: se cierra.
      try {
        u();
      } catch {
        // nada
      }
      return;
    }
    unsub = u;
    // Sin aviso de fallo se da por conectado. Si venía consultando, se pone al día una vez.
    const wasPolling = mode === 'polling';
    stopPolling();
    setMode('realtime');
    if (wasPolling) poll();
  }

  const start = () => {
    if (opts.pollOnly || !backend) {
      setMode('polling');
      schedulePoll();
    } else connect();
  };

  const onVisibility = () => {
    if (stopped) return;
    if (pageHidden()) {
      if (hiddenTimer || paused) return;
      hiddenTimer = setTimeout(() => {
        hiddenTimer = null;
        paused = true;
        disconnect();
        stopPolling();
        clearRetry();
        setMode('off');
      }, hiddenMs);
    } else {
      if (hiddenTimer) clearTimeout(hiddenTimer);
      hiddenTimer = null;
      if (paused) {
        paused = false;
        start();
        poll();
      }
    }
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

  start();

  return {
    mode: () => mode,
    stop() {
      if (stopped) return;
      stopped = true;
      disconnect();
      stopPolling();
      clearRetry();
      if (hiddenTimer) clearTimeout(hiddenTimer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

/** Etiquetas que invalida un mensaje: `payload.tags` (si el trigger las manda) y las del mapa por nombre de evento. */
export function tagsForMessage(msg: RealtimeMessage, map: MessageTagMap = {}): string[] {
  const out = new Set<string>();
  const p = msg.payload as { tags?: unknown } | null | undefined;
  if (p && typeof p === 'object' && Array.isArray(p.tags)) for (const t of p.tags) if (typeof t === 'string') out.add(t);
  for (const rule of [map[msg.event], map['*']]) {
    if (!rule) continue;
    for (const t of typeof rule === 'function' ? rule(msg.payload) : rule) out.add(t);
  }
  return [...out];
}

// ---------- Copia en IndexedDB ----------

interface QueryDB extends DBSchema {
  q: {
    key: [string, string];
    value: { u: string; k: string; data: unknown; at: number; tags: string[] };
    indexes: { u: string };
  };
}

const QUERY_DB = 'mm-query';
const ANON = 'anon';

async function openQueryDB(): Promise<IDBPDatabase<QueryDB> | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openDB<QueryDB>(QUERY_DB, 1, {
      upgrade(d) {
        const s = d.createObjectStore('q', { keyPath: ['u', 'k'] });
        s.createIndex('u', 'u');
      },
    });
    // Otra pestaña con una versión nueva de la app necesita actualizar la base: se suelta.
    db.addEventListener('versionchange', () => db.close());
    return db;
  } catch (e) {
    console.warn('No se pudo abrir la copia de consultas', e);
    return null;
  }
}

// ---------- Caché ----------

interface Observer {
  fetcher: () => Promise<unknown>;
  staleMs: number;
  pollMs?: number;
  listener: () => void;
}

interface Entry {
  key: string;
  initial: unknown;
  data: unknown;
  hasData: boolean;
  /** Cuándo llegó bien del servidor (o cuándo se guardó la copia). 0 = nunca. */
  updatedAt: number;
  error: Error | null;
  fromCache: boolean;
  /** Hay que volver a pedirlo (invalidado, o falló sin señal). */
  invalidated: boolean;
  /** Se invalidó mientras había una consulta en vuelo: al terminar se pide otra vez. */
  refetchAfter: boolean;
  promise: Promise<unknown> | null;
  /** Sube con cada setQueryData: una consulta que salió antes no pisa el cambio optimista. */
  writeVersion: number;
  tags: Set<string>;
  observers: Set<Observer>;
  lastFetcher: (() => Promise<unknown>) | null;
  persist: boolean;
  retries: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  pollEvery: number;
  lastUsed: number;
  snapshot: QueryState<unknown>;
}

const DEFAULT_STALE_MS = 10_000;
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Reintentos de una lectura que falló sin señal mientras la pantalla está abierta. */
const RETRY_DELAYS_MS = [1_000, 4_000];
/** Lo que nadie mira hace rato se suelta de la memoria (sigue guardado en el teléfono). */
const GC_MS = 10 * 60_000;

const sameState = (a: QueryState<unknown>, b: QueryState<unknown>) =>
  a.data === b.data && a.loading === b.loading && a.error === b.error && a.fromCache === b.fromCache;

export function createQueryClient(options: QueryClientOptions = {}): QueryClient {
  const defaultStaleMs = options.defaultStaleMs ?? DEFAULT_STALE_MS;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const persistence = options.persistence ?? (typeof indexedDB === 'undefined' ? 'none' : 'idb');
  const userKeyOf = () => options.userKey?.() ?? ANON;
  let backendRef: Backend | (() => Backend | null) | null = options.backend ?? null;
  const getBackend = (): Backend | null => (typeof backendRef === 'function' ? backendRef() : backendRef);

  const entries = new Map<string, Entry>();
  let generation = 0;
  let currentUser = userKeyOf();
  let disposed = false;
  /** La base ya se cerró (después de dispose y de terminar lo pendiente). */
  let closed = false;
  const dbPromise: Promise<IDBPDatabase<QueryDB> | null> = persistence === 'idb' ? openQueryDB() : Promise.resolve(null);
  let writes: Promise<void> = Promise.resolve();

  const queueWrite = (fn: (db: IDBPDatabase<QueryDB>) => Promise<unknown>) => {
    writes = writes
      .then(async () => {
        const db = await dbPromise;
        if (db && !closed) await fn(db);
      })
      .catch((e) => console.warn('No se pudo guardar la copia de la consulta', e));
    return writes;
  };

  function build(e: Entry): QueryState<unknown> {
    return {
      data: e.hasData ? e.data : e.initial,
      loading: !e.hasData && (e.promise != null || e.error == null),
      error: e.error,
      fromCache: e.hasData && e.fromCache,
    };
  }

  function notify(e: Entry) {
    const next = build(e);
    if (sameState(next, e.snapshot)) return;
    e.snapshot = next;
    for (const o of [...e.observers]) o.listener();
  }

  function ensure(key: string, initial?: unknown): Entry {
    let e = entries.get(key);
    if (!e) {
      e = {
        key,
        initial,
        data: undefined,
        hasData: false,
        updatedAt: 0,
        error: null,
        fromCache: false,
        invalidated: false,
        refetchAfter: false,
        promise: null,
        writeVersion: 0,
        tags: new Set(),
        observers: new Set(),
        lastFetcher: null,
        persist: true,
        retries: 0,
        retryTimer: null,
        pollTimer: null,
        pollEvery: 0,
        lastUsed: Date.now(),
        snapshot: { data: initial, loading: true, error: null, fromCache: false },
      };
      entries.set(key, e);
    } else if (e.initial === undefined && initial !== undefined) {
      // La copia guardada creó la entrada antes que la pantalla: ahora se sabe qué mostrar si no hay nada.
      e.initial = initial;
      e.snapshot = build(e);
    }
    return e;
  }

  const minStale = (e: Entry) => (e.observers.size ? Math.min(...[...e.observers].map((o) => o.staleMs)) : defaultStaleMs);
  const isStale = (e: Entry, staleMs: number) => !e.hasData || e.invalidated || e.fromCache || Date.now() - e.updatedAt >= staleMs;

  function clearRetry(e: Entry) {
    if (e.retryTimer) clearTimeout(e.retryTimer);
    e.retryTimer = null;
  }

  function scheduleRetry(e: Entry) {
    if (!e.observers.size || e.retryTimer || e.retries >= RETRY_DELAYS_MS.length) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return; // al volver la señal se pide solo
    e.retryTimer = setTimeout(() => {
      e.retryTimer = null;
      if (e.observers.size && !disposed) void fetchEntry(e).catch(() => {});
    }, RETRY_DELAYS_MS[e.retries++]);
  }

  function persistEntry(e: Entry) {
    const user = currentUser;
    // Si la cuenta cambió y todavía no se llamó userChanged, no se guarda bajo la cuenta equivocada.
    if (userKeyOf() !== user) return;
    const row = { u: user, k: e.key, data: e.data, at: e.updatedAt, tags: [...e.tags] };
    void queueWrite((db) => db.put('q', row));
  }

  function removePersisted(key: string) {
    const user = currentUser;
    void queueWrite((db) => db.delete('q', [user, key]));
  }

  function afterFetch(e: Entry) {
    if (e.refetchAfter && e.observers.size && !disposed) {
      e.refetchAfter = false;
      void fetchEntry(e).catch(() => {});
    }
  }

  function fetchEntry(e: Entry, fetcher?: () => Promise<unknown>): Promise<unknown> {
    if (e.promise) return e.promise;
    const f = fetcher ?? e.lastFetcher;
    if (!f) return Promise.resolve(e.hasData ? e.data : e.initial);
    e.lastFetcher = f;
    clearRetry(e);
    const gen = generation;
    const version = e.writeVersion;
    e.invalidated = false;
    e.refetchAfter = false;
    let started: Promise<unknown>;
    try {
      started = Promise.resolve(f());
    } catch (err) {
      started = Promise.reject(err);
    }
    const run: Promise<unknown> = started.then(
      (data) => {
        if (gen !== generation) return data;
        e.promise = null;
        if (e.writeVersion !== version) {
          // Hubo un cambio optimista mientras tanto: esta respuesta ya es vieja.
          e.invalidated = true;
          notify(e);
          afterFetch(e);
          return e.hasData ? e.data : data;
        }
        e.data = data;
        e.hasData = true;
        e.updatedAt = Date.now();
        e.error = null;
        e.fromCache = false;
        e.retries = 0;
        if (e.persist) persistEntry(e);
        notify(e);
        afterFetch(e);
        return data;
      },
      (err: unknown) => {
        const error = toError(err);
        if (gen !== generation) throw error;
        e.promise = null;
        if (classifyError(err) === 'final') {
          // El servidor dijo que no: se muestra el error (como hacía onSnapshot) y no se muestra lo viejo.
          e.error = error;
          e.hasData = false;
          e.data = undefined;
          e.fromCache = false;
          e.updatedAt = 0;
          if (isAccessLoss(err)) removePersisted(e.key);
        } else {
          // Sin señal o sesión vencida: se sigue mostrando lo que había, y se vuelve a pedir después.
          if (!e.hasData) e.error = error;
          e.invalidated = true;
          scheduleRetry(e);
        }
        notify(e);
        afterFetch(e);
        throw error;
      },
    );
    e.promise = run;
    run.catch(() => {}); // una actualización en segundo plano que falla no es un error sin atrapar
    notify(e);
    return run;
  }

  function updatePolling(e: Entry) {
    const every = Math.min(...[...e.observers].map((o) => o.pollMs ?? Infinity));
    const want = Number.isFinite(every) && every > 0 ? every : 0;
    if (want === e.pollEvery) return;
    if (e.pollTimer) clearInterval(e.pollTimer);
    e.pollTimer = null;
    e.pollEvery = want;
    if (want)
      e.pollTimer = setInterval(() => {
        if (!pageHidden() && e.observers.size) void fetchEntry(e).catch(() => {});
      }, want);
  }

  function sweep() {
    const old = Date.now() - GC_MS;
    for (const [key, e] of entries) {
      if (!e.observers.size && !e.promise && e.lastUsed < old) {
        clearRetry(e);
        entries.delete(key);
      }
    }
  }

  function observe<T>(key: string, fetcher: () => Promise<T>, opts: QueryOptions<T>, listener: () => void): () => void {
    sweep();
    const e = ensure(key, opts.initial);
    const obs: Observer = { fetcher, staleMs: opts.staleMs ?? defaultStaleMs, pollMs: opts.pollMs, listener };
    e.observers.add(obs);
    e.lastFetcher = fetcher;
    for (const t of opts.tags ?? []) e.tags.add(t);
    if (opts.persist === false) e.persist = false;
    updatePolling(e);
    if (!e.promise && isStale(e, obs.staleMs)) void fetchEntry(e, fetcher).catch(() => {});
    return () => {
      if (!e.observers.delete(obs)) return;
      e.lastUsed = Date.now();
      updatePolling(e);
      if (!e.observers.size) clearRetry(e);
    };
  }

  const getState = <T>(key: string, initial?: T) => ensure(key, initial).snapshot as QueryState<T>;

  async function fetchQuery<T>(key: string, fetcher: () => Promise<T>, opts: QueryOptions<T> = {}): Promise<T> {
    const e = ensure(key, opts.initial);
    for (const t of opts.tags ?? []) e.tags.add(t);
    if (opts.persist === false) e.persist = false;
    e.lastUsed = Date.now();
    if (!e.promise && !isStale(e, opts.staleMs ?? defaultStaleMs)) return e.data as T;
    return (await fetchEntry(e, e.promise ? undefined : fetcher)) as T;
  }

  function invalidateEntry(e: Entry) {
    e.invalidated = true;
    if (e.promise) e.refetchAfter = true;
    else if (e.observers.size) void fetchEntry(e).catch(() => {});
  }

  function refetchActive(reconnect: boolean) {
    if (disposed) return;
    for (const e of entries.values()) {
      if (!e.observers.size || e.promise) continue;
      if (reconnect) e.retries = 0;
      if (isStale(e, minStale(e)) || (reconnect && e.error)) void fetchEntry(e).catch(() => {});
    }
  }

  async function hydrate(): Promise<void> {
    const gen = generation;
    const user = currentUser;
    const db = await dbPromise;
    if (!db || disposed) return;
    let rows: QueryDB['q']['value'][];
    try {
      rows = await db.getAllFromIndex('q', 'u', user);
    } catch (e) {
      console.warn('No se pudo leer la copia de consultas', e);
      return;
    }
    if (gen !== generation || disposed) return;
    const oldest = Date.now() - maxAgeMs;
    for (const r of rows) {
      if (r.at < oldest) {
        void queueWrite((d) => d.delete('q', [r.u, r.k]));
        continue;
      }
      const e = ensure(r.k);
      // Lo que ya llegó del servidor (o un cambio optimista) manda sobre la copia.
      if (e.hasData) continue;
      e.data = r.data;
      e.hasData = true;
      e.updatedAt = r.at;
      e.fromCache = true;
      if (e.error && classifyError(e.error) !== 'final') e.error = null;
      for (const t of r.tags) e.tags.add(t);
      notify(e);
    }
  }

  async function clearPersisted(userKey?: string | null): Promise<void> {
    const user = userKey === undefined ? currentUser : (userKey ?? ANON);
    await queueWrite(async (db) => {
      const tx = db.transaction('q', 'readwrite');
      const keys = await tx.store.index('u').getAllKeys(user);
      await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
    });
  }

  async function userChanged(opts: { clearPrevious?: boolean } = {}): Promise<void> {
    const prev = currentUser;
    const next = userKeyOf();
    generation++;
    for (const [key, e] of entries) {
      clearRetry(e);
      e.promise = null;
      e.data = undefined;
      e.hasData = false;
      e.error = null;
      e.fromCache = false;
      e.updatedAt = 0;
      e.invalidated = false;
      e.refetchAfter = false;
      e.writeVersion++;
      if (!e.observers.size) entries.delete(key);
      else notify(e);
    }
    currentUser = next;
    const clear = opts.clearPrevious ?? (next === ANON && options.clearOnSignOut === true);
    if (clear && prev !== next) void clearPersisted(prev);
    for (const e of entries.values()) if (e.observers.size) void fetchEntry(e).catch(() => {});
    await hydrate();
  }

  function invalidateFromMessage(msg: RealtimeMessage, map?: MessageTagMap): string[] {
    const tags = tagsForMessage(msg, map);
    for (const t of tags) client.invalidate(t);
    return tags;
  }

  // ---------- Ventana ----------

  const onFocus = () => refetchActive(false);
  const onOnline = () => refetchActive(true);
  const onVisible = () => {
    if (!pageHidden()) refetchActive(false);
  };
  const listen = options.listenWindow ?? true;
  if (listen && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
  }
  if (listen && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

  // ---------- Hooks de React ----------

  function useQuery<T>(key: string | null, fetcher: () => Promise<T>, opts: QueryOptions<T> = {}): QueryState<T> {
    const fetcherRef = useRef(fetcher);
    useEffect(() => {
      fetcherRef.current = fetcher;
    });
    const initialRef = useRef(opts.initial);
    const idleRef = useRef<QueryState<T>>({ data: opts.initial as T, loading: false, error: null, fromCache: false });
    const tagsKey = opts.tags?.join('\n') ?? '';
    const { staleMs, pollMs, persist } = opts;
    const subscribe = useCallback(
      (onChange: () => void) => {
        if (key == null) return () => {};
        const tags = tagsKey ? tagsKey.split('\n') : undefined;
        return observe<T>(key, () => fetcherRef.current(), { tags, staleMs, pollMs, persist, initial: initialRef.current }, onChange);
      },
      [key, tagsKey, staleMs, pollMs, persist],
    );
    const getSnapshot = useCallback(() => (key == null ? idleRef.current : getState<T>(key, initialRef.current)), [key]);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  }

  function useTopic(topic: string | null, onMessage: (msg: RealtimeMessage) => void, opts: TopicOptions = {}): TopicMode {
    const [mode, setMode] = useState<TopicMode>('off');
    const messageRef = useRef(onMessage);
    const pollRef = useRef(opts.onPoll);
    useEffect(() => {
      messageRef.current = onMessage;
      pollRef.current = opts.onPoll;
    });
    const { pollOnly, retryRealtimeMs, hiddenMs } = opts;
    const [minPoll, maxPoll] = opts.pollMs ?? DEFAULT_POLL;
    useEffect(() => {
      if (topic == null) {
        setMode('off');
        return;
      }
      const w = watchTopic(getBackend(), topic, (m) => messageRef.current(m), {
        onPoll: () => pollRef.current?.(),
        pollMs: [minPoll, maxPoll],
        pollOnly,
        retryRealtimeMs,
        hiddenMs,
        onMode: setMode,
      });
      setMode(w.mode());
      return () => w.stop();
    }, [topic, pollOnly, retryRealtimeMs, hiddenMs, minPoll, maxPoll]);
    return topic == null ? 'off' : mode;
  }

  const client: QueryClient = {
    ready: hydrate(),
    useQuery,
    useTopic,
    observe,
    getState,
    fetchQuery,
    getQueryData: <T>(key: string) => {
      const e = entries.get(key);
      return e?.hasData ? (e.data as T) : undefined;
    },
    setQueryData<T>(key: string, updater: T | ((old: T | undefined) => T)): T | undefined {
      const e = ensure(key);
      const prev = e.hasData ? (e.data as T) : undefined;
      e.data = typeof updater === 'function' ? (updater as (old: T | undefined) => T)(prev) : updater;
      e.hasData = true;
      e.error = null;
      e.writeVersion++;
      e.lastUsed = Date.now();
      notify(e);
      return prev;
    },
    invalidate(tag: string) {
      for (const e of entries.values()) if (e.tags.has(tag)) invalidateEntry(e);
    },
    invalidateKey(key: string) {
      const e = entries.get(key);
      if (e) invalidateEntry(e);
    },
    invalidateAll() {
      for (const e of entries.values()) invalidateEntry(e);
    },
    invalidateFromMessage,
    messageInvalidator: (map?: MessageTagMap) => (msg: RealtimeMessage) => void invalidateFromMessage(msg, map),
    onWindowFocus: onFocus,
    onReconnect: onOnline,
    userChanged,
    clearPersisted,
    whenPersisted: async () => {
      await writes;
    },
    setBackend(b: Backend | null) {
      backendRef = b;
    },
    dispose() {
      if (disposed) return;
      for (const e of entries.values()) {
        clearRetry(e);
        if (e.pollTimer) clearInterval(e.pollTimer);
        e.pollTimer = null;
      }
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('online', onOnline);
      }
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      disposed = true;
      void writes.then(async () => {
        closed = true;
        (await dbPromise)?.close();
      });
    },
  };
  return client;
}
