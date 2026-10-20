/**
 * La copia de las consultas en el teléfono (lo que en la web va a IndexedDB, src/lib/db/query.ts): una clave de
 * AsyncStorage por consulta, «mmq:<cuenta>:<clave>», con lo que trajo en JSON (las lecturas son filas de Supabase: no
 * llevan fechas ni mapas). No empieza con «mm:» para que storage.ts no la cargue entera en memoria al abrir la app: se
 * lee cuando la caché la pide (hydrate).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersistedQuery, QueryStore } from '@mm/lib/db/query';

const PREFIX = 'mmq:';
/** Android lee cada valor de AsyncStorage de una vez (~2 MB como mucho): lo más grande no se guarda, se vuelve a pedir. */
const MAX_CHARS = 512 * 1024;

const userPrefix = (user: string) => `${PREFIX}${user}:`;
const keyOf = (user: string, key: string) => userPrefix(user) + key;

async function keysOf(user: string): Promise<string[]> {
  const prefix = userPrefix(user);
  return (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix));
}

function parse(user: string, key: string, raw: string | null): PersistedQuery | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<PersistedQuery>;
    if (typeof r?.at !== 'number' || !('data' in r)) return null;
    return { u: user, k: key.slice(userPrefix(user).length), data: r.data, at: r.at, tags: Array.isArray(r.tags) ? r.tags : [] };
  } catch {
    return null;
  }
}

export function asyncQueryStore(): QueryStore {
  return {
    async all(user) {
      const keys = await keysOf(user);
      if (!keys.length) return [];
      const rows: PersistedQuery[] = [];
      const broken: string[] = [];
      for (const [key, raw] of await AsyncStorage.multiGet(keys)) {
        const row = parse(user, key, raw);
        if (row) rows.push(row);
        else broken.push(key);
      }
      // Una copia que no se puede leer (app cerrada a mitad de escribir) no sirve: se borra.
      if (broken.length) await AsyncStorage.multiRemove(broken);
      return rows;
    },
    async put(row) {
      const value = JSON.stringify({ data: row.data, at: row.at, tags: row.tags });
      if (value.length > MAX_CHARS) await AsyncStorage.removeItem(keyOf(row.u, row.k));
      else await AsyncStorage.setItem(keyOf(row.u, row.k), value);
    },
    delete: (user, key) => AsyncStorage.removeItem(keyOf(user, key)),
    async clear(user) {
      const keys = await keysOf(user);
      if (keys.length) await AsyncStorage.multiRemove(keys);
    },
    close() {},
  };
}
