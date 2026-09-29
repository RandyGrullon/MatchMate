import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Backend, SelectQuery } from '../backend/types';
import type { OutboxItem } from '../db/outbox';
import { uuidv7 } from '../db/ids';
import type { CompressedImage } from '../image';
import { uploadScoreboardPhoto, type UploadedPhoto } from '../photos';

/**
 * Fotos de los envíos que esperan en la cola sin conexión.
 *
 * La RPC `submit_games` registra la foto, pero el archivo tiene que estar en Storage antes. Sin señal no se
 * puede subir, así que la foto se guarda en el teléfono (IndexedDB `mm-uploads`) y la operación de la cola lleva
 * `p_photo = { mm_pending_photo: <clave> }`. Al enviarla, `withPhotoUploads` sube la foto (una sola vez: si la
 * RPC falla después, el reintento usa la misma foto subida) y manda la RPC con los datos reales de la foto.
 */

export const PENDING_PHOTO = 'mm_pending_photo';

/**
 * Una foto subida hace más de esto se vuelve a subir antes de su RPC. Un archivo sin fila en photos se borra a los
 * 30 días (storage_orphans en purge-photos), y la RPC puede esperar semanas en la cola (sin señal, o esperando la
 * versión nueva de la app). Si el archivo sigue ahí, Storage dice que ya existe (misma ruta) y cuenta como subido.
 */
export const REUPLOAD_AFTER_MS = 7 * 86400_000;

interface StashedPhoto {
  key: string;
  /** Cuenta que la envió (la cola es por cuenta). */
  uid: string;
  lid: string;
  /** Id de la foto, fijo desde que se guarda: si se sube dos veces (se cortó la señal), es el mismo archivo. */
  photoId: string;
  img: CompressedImage;
  uploaded?: UploadedPhoto;
  /** Cuándo se subió (ms). Las guardadas antes no lo tienen: cuenta `at`. */
  uploadedAt?: number;
  at: number;
}

interface UploadsDB extends DBSchema {
  photos: { key: string; value: StashedPhoto };
}

interface PhotoStore {
  get(key: string): Promise<StashedPhoto | undefined>;
  put(v: StashedPhoto): Promise<void>;
  delete(key: string): Promise<void>;
  all(): Promise<StashedPhoto[]>;
}

const memory = new Map<string, StashedPhoto>();
const memoryStore: PhotoStore = {
  get: async (k) => memory.get(k),
  put: async (v) => void memory.set(v.key, v),
  delete: async (k) => void memory.delete(k),
  all: async () => [...memory.values()],
};

let storePromise: Promise<PhotoStore> | null = null;

function store(): Promise<PhotoStore> {
  return (storePromise ??= (async () => {
    if (typeof indexedDB === 'undefined') return memoryStore;
    try {
      const db: IDBPDatabase<UploadsDB> = await openDB<UploadsDB>('mm-uploads', 1, {
        upgrade(d) {
          d.createObjectStore('photos', { keyPath: 'key' });
        },
      });
      db.addEventListener('versionchange', () => db.close());
      return {
        get: (k) => db.get('photos', k),
        put: async (v) => void (await db.put('photos', v)),
        delete: (k) => db.delete('photos', k),
        all: () => db.getAll('photos'),
      };
    } catch (e) {
      console.warn('Sin IndexedDB: las fotos pendientes quedan solo en memoria', e);
      return memoryStore;
    }
  })());
}

/** Guarda la foto en el teléfono hasta que se pueda subir. Devuelve lo que va en `p_photo`. */
export async function stashPhoto(uid: string, lid: string, img: CompressedImage): Promise<{ [PENDING_PHOTO]: string }> {
  const key = uuidv7();
  await (await store()).put({ key, uid, lid, photoId: uuidv7(), img, at: Date.now() });
  return { [PENDING_PHOTO]: key };
}

export const pendingPhotoKey = (p: unknown): string | null => {
  const v = p && typeof p === 'object' ? (p as Record<string, unknown>)[PENDING_PHOTO] : null;
  return typeof v === 'string' ? v : null;
};

/** Lo que espera la RPC en `p_photo`. */
export const photoArg = (up: UploadedPhoto) => ({ id: up.photoId, width: up.width, height: up.height, bytes: up.bytes, content_type: up.contentType });

/** Sube la foto guardada (si no se subió ya, o si se subió hace más de REUPLOAD_AFTER_MS) y devuelve el `p_photo` de verdad. */
async function uploadStashed(key: string): Promise<ReturnType<typeof photoArg> | null> {
  const s = await store();
  const stashed = await s.get(key);
  // Ya no está (se envió en otra pestaña o se borró): se manda sin foto antes que perder los juegos.
  if (!stashed) return null;
  const now = Date.now();
  if (!stashed.uploaded || now - (stashed.uploadedAt ?? stashed.at) > REUPLOAD_AFTER_MS) {
    stashed.uploaded = await uploadScoreboardPhoto(stashed.lid, stashed.img, stashed.photoId);
    stashed.uploadedAt = now;
    await s.put(stashed);
  }
  return photoArg(stashed.uploaded);
}

/** El backend que usa la cola: igual al de la app, pero sube las fotos pendientes antes de su RPC. */
export function withPhotoUploads(get: () => Backend): Backend {
  return {
    get mode() {
      return get().mode;
    },
    get auth() {
      return get().auth;
    },
    get storage() {
      return get().storage;
    },
    select: <T = Record<string, unknown>>(q: SelectQuery) => get().select<T>(q),
    subscribe: (topic, cb) => get().subscribe(topic, cb),
    invoke: <T = unknown>(fn: string, body: unknown) => get().invoke<T>(fn, body),
    online: () => get().online(),
    async rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
      const key = pendingPhotoKey(args?.p_photo);
      if (!key) return get().rpc<T>(fn, args);
      const photo = await uploadStashed(key);
      const result = await get().rpc<T>(fn, { ...args, p_photo: photo });
      await (await store()).delete(key).catch(() => undefined);
      return result;
    },
  };
}

/** Borra las fotos guardadas de la cuenta que ya ninguna operación de su cola usa (más de un día). */
export async function sweepPhotos(uid: string, items: OutboxItem[]): Promise<void> {
  try {
    const used = new Set(items.map((i) => pendingPhotoKey(i.args.p_photo)).filter(Boolean));
    const s = await store();
    const old = Date.now() - 86400_000;
    for (const p of await s.all()) if (p.uid === uid && !used.has(p.key) && p.at < old) await s.delete(p.key);
  } catch (e) {
    console.warn('No se pudieron limpiar las fotos pendientes', e);
  }
}
