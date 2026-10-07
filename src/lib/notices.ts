import type { ReactNode } from 'react';

/**
 * Un solo aviso por pantalla (NoticeSlot, rediseño «Calma y foco»): ya no se apilan carteles de instalar, permisos,
 * tours ni «primeros pasos». Cada parte de la app propone su aviso (registerNotice / useNotice) mientras aplica; la
 * pantalla muestra solo el más importante que la cuenta no haya cerrado, y al cerrarlo se recuerda en el teléfono (por
 * cuenta). Aquí va lo que no es de React: el orden, cuál gana y qué se cerró. La pieza visual está en
 * src/components/NoticeSlot.tsx.
 */

/**
 * De qué es el aviso, de lo más a lo menos importante: lo que el admin tiene pendiente (juegos por aprobar) > instalar
 * la app > permitir los avisos del teléfono > sugerir el modo Pro > una pista suelta.
 */
export type NoticeKind = 'admin' | 'install' | 'push' | 'pro' | 'tip';

export const NOTICE_PRIORITY: readonly NoticeKind[] = ['admin', 'install', 'push', 'pro', 'tip'];

/** El botón del aviso: «Probar Pro», «Instalar», «Permitir». Con `to` es un link de la app; si no, `onClick`. */
export interface NoticeAction {
  label: string;
  to?: string;
  /** Si devuelve una promesa, el botón muestra la ruedita hasta que termine (y no se toca dos veces). */
  onClick?: () => unknown;
}

export interface Notice {
  /**
   * Fijo para lo mismo: con él se recuerda que se cerró ('instalar', 'avisos', 'pro:<liga>'). Si lo que dice cambia y
   * debe volver a salir aunque lo hayan cerrado (otros juegos por aprobar), el id cambia con eso ('pendientes:<liga>:3').
   */
  id: string;
  kind: NoticeKind;
  /** Una línea: «Organizas esta liga». */
  title: string;
  /** Opcional, debajo: «Aprueba juegos en Pro». */
  text?: string;
  icon?: ReactNode;
  action?: NoticeAction;
  /** false = no tiene X (no se puede cerrar). Por defecto se puede. */
  dismissible?: boolean;
  /** Al cerrarlo vuelve después de estos días. Sin esto, cerrado no vuelve más (en este teléfono y esta cuenta). */
  snoozeDays?: number;
  /** Además de recordarlo, quien lo propuso se entera (p. ej. para su propia marca de «descartado»). */
  onDismiss?: () => void;
}

/** Un aviso propuesto: `seq` es el orden de llegada (entre dos del mismo tipo gana el primero). */
export interface NoticeEntry {
  notice: Notice;
  seq: number;
  /** Lo último que dice (quien lo propuso puede cambiar sus funciones sin volver a proponerlo). */
  get?: () => Notice;
}

/** id del aviso → cuándo se cerró (ms). */
export type DismissedMap = Record<string, number>;

const DAY_MS = 86_400_000;

export const priorityOf = (kind: NoticeKind): number => {
  const i = NOTICE_PRIORITY.indexOf(kind);
  return i < 0 ? NOTICE_PRIORITY.length : i;
};

/** ¿Lo cerró y todavía no le toca volver? */
export function isDismissed(notice: Pick<Notice, 'id' | 'snoozeDays' | 'dismissible'>, dismissed: DismissedMap, now = Date.now()): boolean {
  if (notice.dismissible === false) return false;
  const at = dismissed[notice.id];
  if (typeof at !== 'number') return false;
  if (notice.snoozeDays != null && notice.snoozeDays > 0) return now - at < notice.snoozeDays * DAY_MS;
  return true;
}

/** El que se muestra: el más importante que no esté cerrado; entre dos del mismo tipo, el que llegó primero. */
export function pickNotice(entries: readonly NoticeEntry[], dismissed: DismissedMap, now = Date.now()): Notice | null {
  return pickEntry(entries, dismissed, now)?.notice ?? null;
}

/** Lo mismo que pickNotice, con su lugar en la fila. */
export function pickEntry(entries: readonly NoticeEntry[], dismissed: DismissedMap, now = Date.now()): NoticeEntry | null {
  let best: NoticeEntry | null = null;
  for (const e of entries) {
    if (isDismissed(e.notice, dismissed, now)) continue;
    if (!best) {
      best = e;
      continue;
    }
    const d = priorityOf(e.notice.kind) - priorityOf(best.notice.kind);
    if (d < 0 || (d === 0 && e.seq < best.seq)) best = e;
  }
  return best;
}

// ---------- Lo cerrado, en el teléfono (por cuenta) ----------

type KV = Pick<Storage, 'getItem' | 'setItem'>;

/** Más de esto no se guarda: los cerrados más viejos se olvidan (y lo de hace más de un año también). */
const MAX_DISMISSED = 100;
const KEEP_MS = 365 * DAY_MS;

export const dismissedKey = (uid: string | null | undefined) => (uid ? `mm:avisos-cerrados:${uid}` : 'mm:avisos-cerrados');

function storage(): KV | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Lo que cerró esa cuenta en este teléfono. Sin almacenamiento o con algo dañado: nada. */
export function readDismissed(uid: string | null | undefined, store: KV | null = storage()): DismissedMap {
  if (!store) return {};
  try {
    const raw = store.getItem(dismissedKey(uid));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: DismissedMap = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) if (typeof at === 'number' && Number.isFinite(at)) out[id] = at;
    return out;
  } catch {
    return {};
  }
}

/** Lo cerrado más lo nuevo, sin lo vencido y con tope (quedan los más recientes). */
export function withDismissed(map: DismissedMap, id: string, now = Date.now()): DismissedMap {
  const entries = Object.entries({ ...map, [id]: now })
    .filter(([, at]) => now - at < KEEP_MS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_DISMISSED);
  return Object.fromEntries(entries);
}

/** Lo guarda (si no se puede, igual queda cerrado mientras la app esté abierta). Devuelve cómo quedó. */
export function saveDismissed(uid: string | null | undefined, id: string, now = Date.now(), store: KV | null = storage()): DismissedMap {
  const next = withDismissed(readDismissed(uid, store), id, now);
  try {
    store?.setItem(dismissedKey(uid), JSON.stringify(next));
  } catch {
    // sin almacenamiento o lleno: vale solo en esta sesión (ver dismissNotice)
  }
  return next;
}

// ---------- Los avisos propuestos (lo comparten todas las pantallas) ----------

interface Registered {
  token: number;
  seq: number;
  /** Se lee al dibujar: quien lo propuso puede cambiar textos o funciones sin volver a proponerlo. */
  get: () => Notice;
}

const registered = new Map<string, Registered>();
const listeners = new Set<() => void>();
let nextSeq = 0;
let nextToken = 0;
let snapshot: readonly NoticeEntry[] = [];
/** Lo cerrado, por cuenta, en memoria (lo de localStorage se lee una vez). */
const dismissedByUser = new Map<string, DismissedMap>();
let dismissedVersion = 0;

function emit() {
  snapshot = [...registered.values()].map((r) => ({ notice: r.get(), seq: r.seq, get: r.get }));
  for (const l of listeners) l();
}

export function subscribeNotices(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Los avisos propuestos ahora (el mismo arreglo mientras no cambie nada). */
export const noticesSnapshot = (): readonly NoticeEntry[] => snapshot;

/** Cambia cada vez que se cierra un aviso (para volver a dibujar). */
export const dismissedSnapshot = (): number => dismissedVersion;

/**
 * Propone un aviso hasta que se llame lo que devuelve. Con el mismo id que otro ya propuesto, lo reemplaza (conserva
 * su lugar en la fila); quitar el viejo después no borra el nuevo. `notice` puede ser una función: se lee al dibujar.
 */
export function registerNotice(notice: Notice | (() => Notice)): () => void {
  const get = typeof notice === 'function' ? notice : () => notice;
  const id = get().id;
  const token = ++nextToken;
  const prev = registered.get(id);
  registered.set(id, { token, seq: prev?.seq ?? ++nextSeq, get });
  emit();
  return () => {
    if (registered.get(id)?.token !== token) return;
    registered.delete(id);
    emit();
  };
}

/** Vuelve a leer los avisos propuestos (cuando cambió lo que dicen sin cambiar el id). */
export const refreshNotices = () => emit();

/** Lo cerrado por esa cuenta (en memoria; la primera vez, del teléfono). */
export function dismissedFor(uid: string | null | undefined, store: KV | null = storage()): DismissedMap {
  const key = uid ?? '';
  let map = dismissedByUser.get(key);
  if (!map) {
    map = readDismissed(uid, store);
    dismissedByUser.set(key, map);
  }
  return map;
}

/** Cierra el aviso para esa cuenta: se recuerda en el teléfono y deja de verse en todas las pantallas. */
export function dismissNotice(uid: string | null | undefined, notice: Pick<Notice, 'id'>, now = Date.now(), store: KV | null = storage()): void {
  const saved = saveDismissed(uid, notice.id, now, store);
  // Si no se pudo guardar, igual queda cerrado en memoria.
  dismissedByUser.set(uid ?? '', { ...dismissedFor(uid, store), ...saved, [notice.id]: now });
  dismissedVersion++;
  for (const l of listeners) l();
}

// ---------- Un solo lugar a la vez ----------

const slots: number[] = [];
let nextSlot = 0;

/**
 * Marca un NoticeSlot como montado. Si por error hay dos en pantalla (uno de la barra y otro de la página), solo el
 * último montado muestra el aviso: nunca salen dos.
 */
export function claimSlot(): { id: number; release: () => void } {
  const id = ++nextSlot;
  slots.push(id);
  for (const l of listeners) l();
  return {
    id,
    release: () => {
      const i = slots.indexOf(id);
      if (i >= 0) slots.splice(i, 1);
      for (const l of listeners) l();
    },
  };
}

/** El lugar que muestra el aviso ahora (null = ninguno montado todavía). */
export const activeSlot = (): number | null => (slots.length ? slots[slots.length - 1] : null);

/** Solo para las pruebas: vuelve todo a cero. */
export function resetNoticesForTests(): void {
  registered.clear();
  dismissedByUser.clear();
  slots.length = 0;
  snapshot = [];
  nextSeq = 0;
  dismissedVersion = 0;
}
