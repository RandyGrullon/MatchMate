/**
 * `localStorage` en el teléfono, con lectura al momento: al abrir la app se cargan en memoria todas las claves de
 * MatchMate (`mm:…`, AsyncStorage) y la sesión de Supabase (llavero del teléfono, SecureStore); después se lee de la
 * memoria y se escribe en segundo plano. Así la lógica compartida con la web (borradores, modo, tema, deporte activo,
 * avisos…) funciona igual. En la vista previa web de la app existe el `localStorage` de verdad y no se toca.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const PREFIX = 'mm:';
/** Lo que va cifrado en el llavero (los tokens de la sesión y el verificador PKCE de Supabase), no en AsyncStorage. */
const SECURE = ['mm:auth', 'mm:auth-code-verifier'];
const secureKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');
const isSecure = (key: string) => Platform.OS !== 'web' && SECURE.includes(key);

/**
 * El llavero puede rechazar valores grandes (algunos iPhone, desde ~2048 B) y una sesión de Supabase pasa de 1,5 KB:
 * se guarda en trozos de 600 caracteres en «<clave>», «<clave>_1»… y la cuenta en «<clave>_n» (sin «_n», uno solo).
 */
const PIECE = 600;
const pieces = new Map<string, number>();

function splitPieces(value: string): string[] {
  const parts: string[] = [];
  let part = '';
  for (const char of value) {
    if (part.length + char.length > PIECE) {
      parts.push(part);
      part = '';
    }
    part += char;
  }
  parts.push(part);
  return parts;
}

async function readSecure(key: string): Promise<string | null> {
  const base = secureKey(key);
  const first = await SecureStore.getItemAsync(base);
  if (first === null) return null;
  const count = Number(await SecureStore.getItemAsync(`${base}_n`)) || 1;
  pieces.set(key, count);
  let value = first;
  for (let n = 1; n < count; n++) {
    const piece = await SecureStore.getItemAsync(`${base}_${n}`);
    // Incompleta no sirve: mejor sin sesión que con una rota.
    if (piece === null) return null;
    value += piece;
  }
  return value;
}

async function writeSecure(key: string, value: string | null): Promise<void> {
  const base = secureKey(key);
  const parts = value === null ? [] : splitPieces(value);
  const before = pieces.get(key) ?? 1;
  pieces.set(key, Math.max(before, parts.length));
  for (let n = 1; n < parts.length; n++) await SecureStore.setItemAsync(`${base}_${n}`, parts[n]);
  if (parts.length) await SecureStore.setItemAsync(base, parts[0]);
  else await SecureStore.deleteItemAsync(base);
  if (parts.length > 1) await SecureStore.setItemAsync(`${base}_n`, String(parts.length));
  else await SecureStore.deleteItemAsync(`${base}_n`);
  for (let n = Math.max(parts.length, 1); n < before; n++) await SecureStore.deleteItemAsync(`${base}_${n}`);
  pieces.set(key, Math.max(parts.length, 1));
}

// Una escritura cifrada a la vez: al renovar la sesión llegan dos seguidas y los trozos no se pueden mezclar.
let secureWrites = Promise.resolve();
function queueSecure(key: string, value: string | null) {
  secureWrites = secureWrites
    .then(() => writeSecure(key, value))
    .catch((error) => {
      if (__DEV__) console.warn(`MatchMate: no se pudo guardar ${key} en el llavero`, error);
    });
}

const cache = new Map<string, string>();
let ready = false;

/** Carga lo guardado en el teléfono. La raíz de la app la espera antes de pintar (con el splash puesto). */
export async function hydrateStorage(): Promise<void> {
  if (ready || Platform.OS === 'web') {
    ready = true;
    return;
  }
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX) && !SECURE.includes(key));
    for (const [key, value] of await AsyncStorage.multiGet(keys)) if (value !== null) cache.set(key, value);
  } catch {
    // Sin almacenamiento: la app arranca vacía.
  }
  for (const key of SECURE) {
    try {
      const value = await readSecure(key);
      if (value !== null) cache.set(key, value);
    } catch {
      // Llavero no disponible: sin sesión guardada.
    }
  }
  ready = true;
}

function setItem(key: string, value: string) {
  const text = String(value);
  cache.set(key, text);
  if (isSecure(key)) queueSecure(key, text);
  else AsyncStorage.setItem(key, text).catch(() => undefined);
}

function removeItem(key: string) {
  cache.delete(key);
  if (isSecure(key)) queueSecure(key, null);
  else AsyncStorage.removeItem(key).catch(() => undefined);
}

/** Un `Storage` como el del navegador, sobre la memoria de arriba. */
const phoneStorage: Storage = {
  get length() {
    return cache.size;
  },
  key: (index: number) => [...cache.keys()][index] ?? null,
  getItem: (key: string) => cache.get(key) ?? null,
  setItem,
  removeItem,
  clear() {
    for (const key of [...cache.keys()]) removeItem(key);
  },
};

/** Instala `localStorage` en el teléfono (en la web ya existe). Va antes que cualquier módulo compartido. */
export function installLocalStorage() {
  if (Platform.OS === 'web' || typeof globalThis.localStorage !== 'undefined') return;
  Object.defineProperty(globalThis, 'localStorage', { value: phoneStorage, configurable: true, enumerable: true });
}

/** Para Supabase: su `storage` lee y escribe aquí (la sesión queda en el llavero). */
export const authStorage = {
  getItem: (key: string) => (Platform.OS === 'web' ? globalThis.localStorage.getItem(key) : (cache.get(key) ?? null)),
  setItem: (key: string, value: string) => (Platform.OS === 'web' ? globalThis.localStorage.setItem(key, value) : setItem(key, value)),
  removeItem: (key: string) => (Platform.OS === 'web' ? globalThis.localStorage.removeItem(key) : removeItem(key)),
};
