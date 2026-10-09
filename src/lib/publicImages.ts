import { useEffect, useSyncExternalStore } from 'react';
import { backend } from './data/client';

/**
 * URLs de las imágenes de los buckets públicos de la red social (docs/red-social.md): la foto de perfil (`avatars`) y
 * la de cada publicación (`posts`). Como el logo de una liga (src/lib/logos.ts): la URL se pide una vez por ruta y
 * queda en memoria; cada foto nueva es un archivo nuevo (la ruta lleva un uuid), así que la URL de una ruta nunca cambia.
 */

export const AVATAR_BUCKET = 'avatars';
export const POST_BUCKET = 'posts';
export type PublicBucket = typeof AVATAR_BUCKET | typeof POST_BUCKET;

const urls = new Map<string, string>();
const failed = new Set<string>();
const loading = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

const keyOf = (bucket: PublicBucket, path: string) => `${bucket}/${path}`;
const notify = () => listeners.forEach((l) => l());

/** Recuerda la URL de una imagen (pruebas, o la que se acaba de subir). */
export function primePublicUrl(bucket: PublicBucket, path: string, url: string) {
  const k = keyOf(bucket, path);
  failed.delete(k);
  if (urls.get(k) !== url) {
    urls.set(k, url);
    notify();
  }
}

function load(bucket: PublicBucket, path: string): Promise<void> {
  const k = keyOf(bucket, path);
  let p = loading.get(k);
  if (!p) {
    p = backend()
      .storage.publicUrl(bucket, path)
      .then(
        (url) => {
          urls.set(k, url);
          failed.delete(k);
          notify();
        },
        (e: unknown) => {
          console.warn('[imagen]', e);
          failed.add(k);
          notify();
        },
      )
      .finally(() => loading.delete(k));
    loading.set(k, p);
  }
  return p;
}

/** La URL pública (la pide si hace falta). null si no se pudo pedir. */
export async function publicUrl(bucket: PublicBucket, path: string): Promise<string | null> {
  const k = keyOf(bucket, path);
  if (!urls.has(k)) await load(bucket, path);
  return urls.get(k) ?? null;
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

/**
 * La URL de una imagen pública: null sin ruta, mientras llega o si no se pudo pedir; `pending` mientras se pide (va un
 * hueco del mismo tamaño para que la pantalla no salte).
 */
export function usePublicImage(bucket: PublicBucket, path: string | null | undefined): { url: string | null; pending: boolean } {
  const k = path ? keyOf(bucket, path) : null;
  const readUrl = () => (k ? (urls.get(k) ?? null) : null);
  const readFailed = () => !!k && failed.has(k);
  const url = useSyncExternalStore(subscribe, readUrl, readUrl);
  const broken = useSyncExternalStore(subscribe, readFailed, readFailed);
  useEffect(() => {
    if (path && k && !urls.has(k)) void load(bucket, path);
  }, [bucket, path, k]);
  return { url, pending: !!k && !url && !broken };
}
