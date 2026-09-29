import { useMemo, useSyncExternalStore } from 'react';
import { getBackend } from '../backend';
import { BackendError, type Backend, type SelectQuery } from '../backend/types';
import { createOutbox, useOutbox, type EnqueueOptions, type Outbox, type OutboxItem, type OutboxSnapshot, type SettleOutcome } from '../db/outbox';
import { createQueryClient, type QueryOptions } from '../db/query';
import { appVersion } from '../errorReport';
import { stamped, type Wire } from './stamp';
import { sweepPhotos, withPhotoUploads } from './uploads';

/**
 * Lo único que la capa de datos comparte entre pantallas:
 * - la caché de consultas (una por app; su copia en el teléfono va por cuenta);
 * - la cola sin conexión de la cuenta que entró (una por cuenta: al cambiar de cuenta se cierra la anterior,
 *   que queda guardada y se envía cuando esa cuenta vuelva a entrar);
 * - qué consultas hay (para aplicar encima los cambios que todavía no llegan al servidor).
 *
 * auth.tsx avisa quién entró con `setDataUser` antes de mostrarlo en pantalla.
 */

/** Lectura de siempre (la misma forma de BowlingX): lo que hay, si todavía no hay nada y el error. */
export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

export const backend = (): Backend => getBackend();

/** Leer una tabla o vista (la RLS decide qué filas). */
export const select = <T>(q: SelectQuery) => backend().select<T>(q);

/** Escritura directa (necesita señal). */
export const rpc = <T = unknown>(fn: string, args?: Record<string, unknown>) => backend().rpc<T>(fn, args);

let currentUser: string | null = null;

/** Cuenta que está usando la app (null = sin sesión). */
export const getUserId = () => currentUser;

export const queryClient = createQueryClient({ userKey: () => currentUser, backend: () => backend() });

// ---------- Qué consultas hay ----------

/** Qué pide una consulta (para saber si un cambio pendiente le toca). */
export interface QueryDesc {
  kind: string;
  lid?: string;
  eventId?: string;
  eventIds?: string[];
  playerId?: string;
  status?: string;
  id?: string;
}

const known = new Map<string, QueryDesc>();

/** Anota la consulta (clave → qué pide). Las claves no se olvidan: son pocas y la caché puede tener sus datos. */
export function remember(key: string, desc: QueryDesc) {
  if (!known.has(key)) known.set(key, desc);
}

/** Consultas de ese tipo que tienen datos en la caché. */
export function cachedQueries(kind: string): { key: string; desc: QueryDesc }[] {
  const out: { key: string; desc: QueryDesc }[] = [];
  for (const [key, desc] of known) if (desc.kind === kind && queryClient.getQueryData(key) !== undefined) out.push({ key, desc });
  return out;
}

/** Cambia en la caché todas las consultas de ese tipo que tienen datos. */
export function updateCached<T>(kind: string, fn: (data: T, desc: QueryDesc) => T) {
  for (const { key, desc } of cachedQueries(kind)) {
    const old = queryClient.getQueryData<T>(key);
    if (old === undefined) continue;
    const next = fn(old, desc);
    if (next !== old) queryClient.setQueryData<T>(key, next);
  }
}

export interface LiveOptions<T> extends Omit<QueryOptions<T>, 'initial'> {
  initial: T;
}

/** useQuery de la caché con la forma `Live<T>` de BowlingX (y las horas como `Stamp`). */
export function useLive<T>(key: string | null, desc: QueryDesc | null, fetcher: () => Promise<Wire<T>>, opts: LiveOptions<Wire<T>>): Live<T> {
  if (key && desc) remember(key, desc);
  const st = queryClient.useQuery<Wire<T>>(key, fetcher, opts);
  return useMemo(() => ({ data: stamped<T>(st.data), loading: st.loading, error: st.error }), [st]);
}

/** Lo mismo sin pantalla: reutiliza lo fresco o lo que ya se está pidiendo. */
export function fetchLive<T>(key: string, desc: QueryDesc, fetcher: () => Promise<Wire<T>>, opts: LiveOptions<Wire<T>>): Promise<T> {
  remember(key, desc);
  return queryClient.fetchQuery<Wire<T>>(key, fetcher, opts).then((d) => stamped<T>(d));
}

export const invalidate = (...tags: string[]) => {
  for (const t of tags) queryClient.invalidate(t);
};

// ---------- Cola sin conexión ----------

type EnqueueHook = (item: OutboxItem) => void;
type SettledHook = (item: OutboxItem, outcome: SettleOutcome) => void;
const enqueueHooks = new Set<EnqueueHook>();
const settledHooks = new Set<SettledHook>();

/** Lo que hace la capa de datos al encolar (cambio optimista) y al confirmarse (volver a leer). */
export function onOutbox(hooks: { enqueue?: EnqueueHook; settled?: SettledHook }) {
  if (hooks.enqueue) enqueueHooks.add(hooks.enqueue);
  if (hooks.settled) settledHooks.add(hooks.settled);
}

const run = <A extends unknown[]>(set: Set<(...a: A) => void>, ...args: A) => {
  for (const h of set) {
    try {
      h(...args);
    } catch (e) {
      console.error(e);
    }
  }
};

let outbox: Outbox | null = null;
const outboxListeners = new Set<() => void>();

function openOutbox(userId: string): Outbox {
  const ob = createOutbox({
    // Antes de enviar un envío con foto se sube la foto (guardada en el teléfono mientras no haya señal).
    backend: withPhotoUploads(backend),
    userId,
    onEnqueue: (item) => run(enqueueHooks, item),
    onSettled: (item, outcome) => run(settledHooks, item, outcome),
    // Lo que el servidor no reconoció espera la versión nueva; si con otra versión sigue igual, es un rechazo.
    appVersion: appVersion(),
  });
  // Las fotos guardadas que ya ninguna operación usa (se enviaron o se descartaron) se borran.
  void ob.ready.then(() => sweepPhotos(userId, [...ob.listPending(), ...ob.listFailed()]));
  return ob;
}

/** La cola de la cuenta que entró (null sin sesión). */
export const currentOutbox = () => outbox;

/**
 * Cambió la cuenta: nueva cola (la de la anterior queda guardada para cuando vuelva) y la caché se pone al día
 * (vacía la memoria, carga la copia de la nueva cuenta y vuelve a pedir lo que está en pantalla).
 */
export function setDataUser(userId: string | null): Promise<void> {
  if (userId === currentUser) return Promise.resolve();
  currentUser = userId;
  outbox?.dispose();
  outbox = userId ? openOutbox(userId) : null;
  for (const l of [...outboxListeners]) l();
  return queryClient.userChanged();
}

const subscribeOutbox = (cb: () => void) => {
  outboxListeners.add(cb);
  return () => void outboxListeners.delete(cb);
};

/** La cola de la cuenta (cambia al entrar o salir). */
export function useCurrentOutbox(): Outbox | null {
  return useSyncExternalStore(subscribeOutbox, currentOutbox, currentOutbox);
}

/** «N por enviar», «no se pudo enviar» y «entra de nuevo» para la pantalla. */
export function useOutboxSnapshot(): OutboxSnapshot {
  return useOutbox(useCurrentOutbox());
}

/** Hay señal (en local siempre). */
export function isOnline(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    return backend().online();
  } catch {
    return true;
  }
}

/** Encola una RPC de cancha (lleva `p_op_id`). Sin sesión no hay cola: no se puede guardar. */
export function enqueue<T = unknown>(fn: string, args: Record<string, unknown>, opts: EnqueueOptions & { group: string }): { opId: string; done: Promise<T> } {
  if (!outbox) throw new BackendError('Entra a tu cuenta para guardar.', 'auth', 'session_not_found');
  return outbox.enqueue<T>(fn, args, opts);
}

/** Cuánto se espera al servidor antes de dar una escritura de cancha por guardada (queda en la cola). */
const QUEUED_AFTER_MS = 6000;

/**
 * Escrituras de cancha: con señal se espera al servidor (y sale su error si dice que no); sin señal, o si el
 * servidor tarda más de 6 s (señal mala en la bolera), se da por guardado: queda en la cola, ya se ve en
 * pantalla y sale solo. Si al final el servidor lo rechaza, queda en «no se pudo enviar».
 */
export function sentOrQueued<T>(done: Promise<T>, waitMs = QUEUED_AFTER_MS): Promise<T | undefined> {
  if (!isOnline()) return Promise.resolve(undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const queued = new Promise<undefined>((resolve) => (timer = setTimeout(() => resolve(undefined), waitMs)));
  return Promise.race([done, queued]).finally(() => clearTimeout(timer));
}

/** Solo pruebas: vuelve a empezar sin cuenta ni caché. */
export async function resetDataClientForTests(): Promise<void> {
  await setDataUser(null);
  known.clear();
}
