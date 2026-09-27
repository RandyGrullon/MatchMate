/**
 * Archivos del modo local (lo que en Supabase va a Storage). En el navegador, IndexedDB `mm-local-files`;
 * en Node (pruebas), un Map en memoria. Se guardan como ArrayBuffer (no Blob) para que funcione igual en todos lados.
 */
import { openDB, type IDBPDatabase } from 'idb';

export interface StoredFile {
  data: ArrayBuffer;
  contentType: string;
}

export interface FileStore {
  put(key: string, file: StoredFile): Promise<void>;
  get(key: string): Promise<StoredFile | undefined>;
  delete(keys: string[]): Promise<void>;
}

export function createMemoryFileStore(): FileStore {
  const files = new Map<string, StoredFile>();
  return {
    async put(key, file) {
      files.set(key, file);
    },
    async get(key) {
      return files.get(key);
    },
    async delete(keys) {
      for (const k of keys) files.delete(k);
    },
  };
}

const STORE = 'files';

export function createIdbFileStore(dbName = 'mm-local-files'): FileStore {
  let db: Promise<IDBPDatabase> | null = null;
  const open = () =>
    (db ??= openDB(dbName, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      },
    }));
  return {
    async put(key, file) {
      await (await open()).put(STORE, file, key);
    },
    async get(key) {
      return (await (await open()).get(STORE, key)) as StoredFile | undefined;
    },
    async delete(keys) {
      const tx = (await open()).transaction(STORE, 'readwrite');
      await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
    },
  };
}

/** data: URL (Node no muestra blob: URLs a nadie, y en pruebas se puede leer de vuelta). */
export function toDataUrl(file: StoredFile): string {
  const bytes = new Uint8Array(file.data);
  let binary = '';
  // Por pedazos, para no pasar el límite de argumentos de String.fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${file.contentType || 'application/octet-stream'};base64,${btoa(binary)}`;
}
