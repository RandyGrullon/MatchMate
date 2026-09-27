import { useEffect, useSyncExternalStore } from 'react';
import { BackendError, getBackend, type Backend } from './backend';
import { isUuid, uuidv7 } from './db/ids';
import { imageBlob, storedType, type CompressedImage, type StoredImageType } from './image';

/**
 * Fotos del marcador en Supabase Storage (bucket privado `scoreboards`, ruta `<liga>/<foto>.<ext>`).
 * CONTRATO entre la capa de datos y el módulo de fotos:
 * - La capa de datos sube la foto con `uploadScoreboardPhoto` ANTES de llamar a la RPC que la registra
 *   (submit_games, save_verified_games, add_photo) con el mismo `photoId` y `path`.
 * - Las pantallas muestran la foto con `usePhoto(lid, photoId)`, que devuelve la URL firmada.
 *
 * URLs firmadas: duran 1 h y aquí se reutilizan 50 min. La última de cada foto se recuerda en el teléfono
 * (`mm:photo-urls`) para verla sin señal: el service worker guarda la imagen con la ruta SIN el token como clave
 * (el token cambia cada hora), así una URL vieja igual sale de la caché.
 */

export const PHOTO_BUCKET = 'scoreboards';
/** Lo que dura una URL firmada (s) y cuánto se reutiliza (ms): se renueva antes de que venza. */
export const SIGNED_URL_SECONDS = 3600;
export const URL_FRESH_MS = 50 * 60_000;
/** El bucket acepta hasta 1 MB. */
const MAX_UPLOAD_BYTES = 1_048_576;

export interface UploadedPhoto {
  photoId: string;
  /** Ruta dentro del bucket: `<liga>/<foto>.webp` (o .jpg). */
  path: string;
  width: number;
  height: number;
  bytes: number;
  contentType: string;
}

/** La ruta que exigen la política de Storage y el CHECK de photos.path. */
export function photoPath(lid: string, photoId: string, contentType: StoredImageType): string {
  return `${lid.toLowerCase()}/${photoId.toLowerCase()}.${contentType === 'image/jpeg' ? 'jpg' : 'webp'}`;
}

/**
 * Sube la foto comprimida. Sin señal falla con BackendError de red (quien llama decide si la encola).
 * `photoId`: para reintentar con el mismo id (si ya estaba subida cuenta como subida); por defecto uno nuevo.
 */
export async function uploadScoreboardPhoto(lid: string, img: CompressedImage, photoId: string = uuidv7()): Promise<UploadedPhoto> {
  if (!isUuid(lid) || !isUuid(photoId)) throw new BackendError('Liga o foto inválida.', 'validation');
  const contentType = storedType(img);
  const blob = imageBlob(img);
  if (!blob.size || blob.size > MAX_UPLOAD_BYTES) throw new BackendError('La foto es muy grande (máximo 1 MB).', 'validation');
  const path = photoPath(lid, photoId, contentType);
  await getBackend().storage.upload(PHOTO_BUCKET, path, blob, contentType);
  return { photoId: photoId.toLowerCase(), path, width: img.width, height: img.height, bytes: blob.size, contentType };
}

// ---------- Ver la foto ----------

export interface PhotoView {
  id: string;
  /** URL firmada (en local, blob: o data:). */
  url: string;
  width: number | null;
  height: number | null;
}

interface PhotoRow {
  id: string;
  path: string;
  width: number | null;
  height: number | null;
  purged_at: string | null;
}

/** La foto (fila de photos + URL firmada). null si no existe, ya se borró o es de otra liga. */
export async function fetchPhoto(lid: string, photoId: string, backend: Backend = getBackend()): Promise<PhotoView | null> {
  const rows = await backend.select<PhotoRow>({
    table: 'photos',
    columns: 'id,path,width,height,purged_at',
    filters: [
      { col: 'id', op: 'eq', value: photoId },
      { col: 'league_id', op: 'eq', value: lid },
    ],
    limit: 1,
  });
  const row = rows[0];
  if (!row || row.purged_at) return null;
  let url: string;
  try {
    url = await backend.storage.signedUrl(PHOTO_BUCKET, row.path, SIGNED_URL_SECONDS);
  } catch (e) {
    // La fila quedó pero el archivo ya no está.
    if (e instanceof BackendError && e.kind === 'not_found') return null;
    throw e;
  }
  return { id: row.id, url, width: row.width, height: row.height };
}

interface CacheEntry {
  view: PhotoView | null;
  /** Cuándo llegó bien (ms). 0 = nunca. */
  at: number;
  error: Error | null;
  loading: boolean;
  promise: Promise<void> | null;
  /** La última URL que se vio (guardada en el teléfono): se usa solo si no se puede pedir una nueva. */
  fallback: PhotoView | null;
  snapshot: PhotoState;
}

export interface PhotoState {
  data: PhotoView | null;
  loading: boolean;
  error: Error | null;
}

/** Lo que usa el caché (se cambia en las pruebas). */
export const photoDeps = {
  now: () => Date.now(),
  fetch: (lid: string, photoId: string) => fetchPhoto(lid, photoId),
};

const MAX_ENTRIES = 300;
const PERSIST_KEY = 'mm:photo-urls';
const MAX_PERSISTED = 200;
/** Después de un error, no se vuelve a pedir enseguida al volver a montar. */
const ERROR_RETRY_MS = 10_000;

const cache = new Map<string, CacheEntry>();
const listeners = new Set<() => void>();
const IDLE: PhotoState = { data: null, loading: false, error: null };
const LOADING: PhotoState = { data: null, loading: true, error: null };
const emit = () => listeners.forEach((l) => l());

// Lo recordado en el teléfono: solo URLs http(s) (las blob: de local no sirven después de recargar).
type Persisted = Record<string, { url: string; width: number | null; height: number | null; at: number }>;

function readPersisted(): Persisted {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PERSIST_KEY) : null;
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Persisted) : {};
  } catch {
    return {};
  }
}

function persist(key: string, view: PhotoView | null, at: number) {
  try {
    if (typeof localStorage === 'undefined') return;
    const all = readPersisted();
    if (view && /^https?:/i.test(view.url)) all[key] = { url: view.url, width: view.width, height: view.height, at };
    else delete all[key];
    const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
    for (const k of keys.slice(MAX_PERSISTED)) delete all[k];
    localStorage.setItem(PERSIST_KEY, JSON.stringify(all));
  } catch {
    // Sin almacenamiento: solo se pierde verla sin señal.
  }
}

function setEntry(key: string, patch: Partial<Omit<CacheEntry, 'snapshot'>>) {
  const old = cache.get(key);
  const next = { view: null, at: 0, error: null, loading: false, promise: null, fallback: null, ...old, ...patch } as CacheEntry;
  next.snapshot = { data: next.view, loading: next.loading && !next.view, error: next.view ? null : next.error };
  cache.set(key, next);
  if (cache.size > MAX_ENTRIES) {
    for (const [k, e] of cache) {
      if (cache.size <= MAX_ENTRIES) break;
      if (k !== key && !e.promise) cache.delete(k);
    }
  }
  emit();
}

const keyOf = (lid: string | undefined, photoId: string | null | undefined) =>
  lid && photoId && isUuid(lid) && isUuid(photoId) ? `${lid.toLowerCase()}/${photoId.toLowerCase()}` : null;

/**
 * Carga la foto si hace falta (lo que no está, o la URL tiene más de 50 min). Sin señal usa la última URL que
 * se vio (el service worker la puede tener guardada). Devuelve lo que quedó.
 */
export function loadPhoto(lid: string, photoId: string): Promise<PhotoState> {
  const key = keyOf(lid, photoId);
  if (!key) return Promise.resolve(IDLE);
  const now = photoDeps.now();
  let entry = cache.get(key);
  if (!entry) {
    // Lo que se vio antes en este teléfono: si la URL todavía sirve se usa de una vez; si no, queda de respaldo.
    const saved = readPersisted()[key];
    const view = saved ? { id: photoId.toLowerCase(), url: saved.url, width: saved.width, height: saved.height } : null;
    if (view && now - saved!.at < URL_FRESH_MS) setEntry(key, { view, at: saved!.at, fallback: view });
    else if (view) setEntry(key, { fallback: view });
    entry = cache.get(key);
  }
  if (entry?.promise) return entry.promise.then(() => cache.get(key)!.snapshot);
  if (entry?.at && !entry.error && now - entry.at < URL_FRESH_MS) return Promise.resolve(entry.snapshot);
  if (entry?.error && now - entry.at < ERROR_RETRY_MS) return Promise.resolve(entry.snapshot);

  const promise = photoDeps
    .fetch(lid, photoId)
    .then((view) => {
      const at = photoDeps.now();
      setEntry(key, { view, at, error: null, loading: false, promise: null, fallback: view });
      persist(key, view, at);
    })
    .catch((e: unknown) => {
      // Sin señal: la última URL que se vio (el service worker puede tener la imagen); si no hay, el error.
      // El error queda guardado (se vuelve a probar en 10 s) aunque no se muestre si hay URL.
      const old = cache.get(key);
      const had = old?.view ?? old?.fallback ?? null;
      setEntry(key, { view: had, error: e instanceof Error ? e : new Error(String(e)), loading: false, promise: null, at: photoDeps.now() });
    });
  setEntry(key, { loading: true, promise });
  return promise.then(() => cache.get(key)!.snapshot);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Foto para mostrar: `data.url` es la URL firmada (o null mientras carga o si no hay foto). */
export function usePhoto(lid: string | undefined, photoId: string | null | undefined): {
  data: { id: string; url: string; width: number | null; height: number | null } | null;
  loading: boolean;
  error: Error | null;
} {
  const key = keyOf(lid, photoId);
  const state = useSyncExternalStore(subscribe, () => (key ? cache.get(key)?.snapshot : undefined) ?? (key ? LOADING : IDLE));
  useEffect(() => {
    if (key) void loadPhoto(lid!, photoId!);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

/** Olvida una foto (p. ej. se borró) o todas (cambio de cuenta). */
export function forgetPhoto(lid?: string, photoId?: string) {
  const key = keyOf(lid, photoId);
  if (key) {
    cache.delete(key);
    persist(key, null, 0);
  } else {
    cache.clear();
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(PERSIST_KEY);
    } catch {
      // nada
    }
  }
  emit();
}
