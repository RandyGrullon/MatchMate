import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { isSnapshot } from './session';
import type { CourtSnapshot } from './types';

/**
 * La lista de jugadas de cada partido guardada en el teléfono (IndexedDB `mm-cancha`, clave
 * `mm:cancha:<liga>:<partido>`). Se guarda después de CADA jugada: recargar, quedarse sin señal o sin batería no
 * pierde ningún punto. Si IndexedDB no está (modo privado viejo), usa localStorage con la misma clave; si
 * tampoco, memoria.
 */

export interface CourtRecord {
  key: string;
  lid: string;
  mid: string;
  /** Cuenta que anotaba (otra cuenta en el mismo teléfono no la usa). */
  uid: string | null;
  snap: CourtSnapshot;
  /** Última `seq` que el servidor confirmó de esta lista. */
  published: number;
  /** Se mandó el final (puede estar en la cola todavía). */
  finished?: boolean;
  /** Lista que perdió contra la del servidor (otro anotador siguió): se guarda por si hay que revisarla. */
  orphan?: CourtSnapshot | null;
  savedAt: number;
}

export const courtKey = (lid: string, mid: string) => `mm:cancha:${lid}:${mid}`;

export interface CourtStore {
  load(lid: string, mid: string): Promise<CourtRecord | null>;
  /** Guarda (en orden: la última escritura gana). */
  save(rec: Omit<CourtRecord, 'key' | 'savedAt'>): Promise<void>;
  /** Cambia solo esos campos si el registro existe. */
  patch(lid: string, mid: string, patch: Partial<Pick<CourtRecord, 'published' | 'finished' | 'orphan' | 'uid'>>): Promise<void>;
  remove(lid: string, mid: string): Promise<void>;
  list(): Promise<CourtRecord[]>;
  close(): void;
}

interface CourtDB extends DBSchema {
  logs: { key: string; value: CourtRecord };
}

const DB = 'mm-cancha';

interface Backing {
  get(key: string): Promise<CourtRecord | undefined>;
  put(rec: CourtRecord): Promise<void>;
  del(key: string): Promise<void>;
  all(): Promise<CourtRecord[]>;
  close(): void;
}

function idbBacking(db: IDBPDatabase<CourtDB>): Backing {
  return {
    get: (key) => db.get('logs', key),
    put: async (rec) => void (await db.put('logs', rec)),
    del: (key) => db.delete('logs', key),
    all: () => db.getAll('logs'),
    close: () => db.close(),
  };
}

function localBacking(ls: Storage): Backing {
  const prefix = 'mm:cancha:';
  return {
    async get(key) {
      const raw = ls.getItem(key);
      return raw ? (JSON.parse(raw) as CourtRecord) : undefined;
    },
    async put(rec) {
      ls.setItem(rec.key, JSON.stringify(rec));
    },
    async del(key) {
      ls.removeItem(key);
    },
    async all() {
      const out: CourtRecord[] = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (!k?.startsWith(prefix) || k.split(':').length !== 4) continue;
        try {
          out.push(JSON.parse(ls.getItem(k) ?? '') as CourtRecord);
        } catch {
          // dañado: se ignora
        }
      }
      return out;
    },
    close: () => {},
  };
}

function memoryBacking(map: Map<string, CourtRecord>): Backing {
  return {
    get: async (key) => {
      const r = map.get(key);
      return r ? structuredClone(r) : undefined;
    },
    put: async (rec) => void map.set(rec.key, structuredClone(rec)),
    del: async (key) => void map.delete(key),
    all: async () => [...map.values()].map((r) => structuredClone(r)),
    close: () => {},
  };
}

/** Sin IndexedDB ni localStorage: en memoria, compartido por la pestaña. */
const tabMemory = new Map<string, CourtRecord>();

/** Solo pruebas: vacía lo guardado en la memoria de la pestaña. */
export function resetMemoryCourtStore() {
  tabMemory.clear();
}

async function openBacking(kind: 'idb' | 'local' | 'memory' | 'auto'): Promise<Backing> {
  // 'memory' pedido a propósito (pruebas): una memoria propia de este almacén.
  if (kind === 'memory') return memoryBacking(new Map());
  if ((kind === 'idb' || kind === 'auto') && typeof indexedDB !== 'undefined') {
    try {
      const db = await openDB<CourtDB>(DB, 1, {
        upgrade(d) {
          d.createObjectStore('logs', { keyPath: 'key' });
        },
      });
      db.addEventListener('versionchange', () => db.close());
      return idbBacking(db);
    } catch {
      // cae a localStorage
    }
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.getItem('mm:cancha:prueba');
      return localBacking(localStorage);
    }
  } catch {
    // bloqueado
  }
  return memoryBacking(tabMemory);
}

const valid = (r: CourtRecord | undefined | null): CourtRecord | null => (r && isSnapshot(r.snap) ? r : null);

/** Abre el almacén (por defecto IndexedDB → localStorage → memoria de la pestaña; 'memory' = memoria propia). */
export function createCourtStore(kind: 'idb' | 'local' | 'memory' | 'auto' = 'auto'): CourtStore {
  const backing = openBacking(kind);
  // Una escritura a la vez y en orden: la última jugada siempre queda encima.
  let chain: Promise<unknown> = Promise.resolve();
  const queue = <T>(fn: (b: Backing) => Promise<T>): Promise<T> => {
    const p = chain.then(() => backing).then(fn);
    chain = p.catch((e) => console.error('mm-cancha', e));
    return p;
  };
  return {
    load: (lid, mid) => queue(async (b) => valid(await b.get(courtKey(lid, mid)))),
    save: (rec) => queue((b) => b.put({ ...rec, key: courtKey(rec.lid, rec.mid), savedAt: Date.now() })),
    patch: (lid, mid, patch) =>
      queue(async (b) => {
        const old = await b.get(courtKey(lid, mid));
        if (old) await b.put({ ...old, ...patch, savedAt: Date.now() });
      }),
    remove: (lid, mid) => queue((b) => b.del(courtKey(lid, mid))),
    list: () => queue(async (b) => (await b.all()).map(valid).filter((r): r is CourtRecord => !!r)),
    close: () => void backing.then((b) => b.close()),
  };
}

let shared: CourtStore | null = null;

/** El almacén de la app (uno por pestaña). */
export function courtStore(): CourtStore {
  return (shared ??= createCourtStore());
}

/** Solo pruebas: usar otro almacén como el de la app. */
export function setCourtStoreForTests(store: CourtStore | null) {
  shared = store;
}

/**
 * Borra las listas que ya no hacen falta: las que mandaron el final de un partido que el servidor ya tiene
 * cerrado (`closed` = ids de esos partidos) y las de más de `maxAgeMs` (30 días) sin tocar.
 */
export async function pruneCourtLogs(store: CourtStore, closed: ReadonlySet<string>, maxAgeMs = 30 * 24 * 3600 * 1000, now = Date.now()): Promise<number> {
  let n = 0;
  for (const r of await store.list()) {
    if ((r.finished && closed.has(r.mid)) || now - r.savedAt > maxAgeMs) {
      await store.remove(r.lid, r.mid);
      n++;
    }
  }
  return n;
}

const DEVICE_KEY = 'mm:cancha:telefono';
let device: string | null = null;

/** Id al azar de este teléfono para las listas (origin). Se guarda en localStorage. */
export function courtDeviceId(): string {
  if (device) return device;
  try {
    device = localStorage.getItem(DEVICE_KEY);
  } catch {
    device = null;
  }
  if (!device) {
    device = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `t-${Math.random().toString(36).slice(2)}${Date.now()}`;
    try {
      localStorage.setItem(DEVICE_KEY, device);
    } catch {
      // sin almacenamiento: vale para esta pestaña
    }
  }
  return device;
}
