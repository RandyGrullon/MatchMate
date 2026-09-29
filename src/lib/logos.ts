import { useEffect, useSyncExternalStore } from 'react';
import { BLOCKED_MESSAGE, isBlockedError } from './backend/errors';
import { BackendError } from './backend/types';
import { backend, invalidate, rpc, select } from './data/client';
import { tags } from './data/keys';
import { isUuid, uuidv7 } from './db/ids';
import { compressLogo, type CompressedLogo } from './image';
import type { LeagueKind } from './types';

/**
 * Logo de una liga o torneo (20260929001000_sueltos_logos.sql y 20260929001010_logos_supabase.sql).
 * CONTRATO:
 * - El archivo va en el bucket PÚBLICO `logos`, en '<liga>/<uuid>.webp' (o '.jpg'): cualquiera con el link lo ve
 *   (se muestra también sin cuenta: invitaciones, ligas públicas). La página de privacidad lo dice.
 * - Cada logo nuevo es un archivo nuevo (nunca se reemplaza uno): `begin_logo_upload` reserva la ruta (solo el
 *   dueño o un admin, 30 por día: Storage no acepta nada sin reservar), se sube, `set_league_logo` lo pone en la liga
 *   y devuelve el anterior, que se borra de Storage si se puede. Lo que deja de usarse (el anterior, el de una liga
 *   borrada) queda además en la cola de Storage de la base, que lo borra si el teléfono no pudo.
 * - Las pantallas lo muestran con `useLogo(liga.logoPath)` (LeagueIcon / LeagueLogo en
 *   src/components/home/LeagueCard.tsx), que recuerda la URL en memoria.
 */

export const LOGO_BUCKET = 'logos';
/** El bucket acepta hasta 256 kB (el logo comprimido pesa ≤ 120 kB). */
const MAX_UPLOAD_BYTES = 262_144;

/** Forma de la ruta que exigen el CHECK de leagues.logo_path, set_league_logo y la política de subir. */
const LOGO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg|png)$/;

/** La ruta del logo: '<liga>/<id>.webp' (o '.jpg' si salió en JPEG). */
export function logoPath(lid: string, id: string, contentType: CompressedLogo['contentType']): string {
  return `${lid.toLowerCase()}/${id.toLowerCase()}.${contentType === 'image/jpeg' ? 'jpg' : 'webp'}`;
}

/** La ruta tiene la forma de un logo de esa liga (lo mismo que revisa la base). */
export function isLogoPathOf(lid: string, path: string | null | undefined): boolean {
  return !!path && LOGO_PATH.test(path) && path.startsWith(`${lid.toLowerCase()}/`);
}

const isCompressed = (v: Blob | CompressedLogo): v is CompressedLogo =>
  typeof (v as CompressedLogo).contentType === 'string' && (v as CompressedLogo).blob instanceof Blob;

/** Comprime la imagen elegida (cuadrado de 256 px). Si no se puede abrir: BackendError 'validation' con código 'imagen'. */
export async function prepareLogo(file: Blob): Promise<CompressedLogo> {
  try {
    return await compressLogo(file);
  } catch (e) {
    console.warn('[logo]', e);
    throw new BackendError('No se pudo abrir esa imagen.', 'validation', 'imagen');
  }
}

/**
 * Borra un archivo de logo si se puede: el admin de esa liga, o cualquiera si ya no lo usa nadie (en la cola de
 * Storage). Si no, queda para la cola: no pasa nada.
 */
export async function removeLogoFile(path: string | null | undefined): Promise<void> {
  if (!path) return;
  forgetLogoUrl(path);
  try {
    await backend().storage.remove(LOGO_BUCKET, [path]);
  } catch (e) {
    console.warn('[logo] no se pudo borrar el archivo', e);
  }
}

/** La ruta del logo de la liga (null sin logo o si no se pudo leer). */
export async function leagueLogoPath(lid: string): Promise<string | null> {
  return select<{ logo_path: string | null }>({
    table: 'leagues',
    columns: 'id,logo_path',
    filters: [{ col: 'id', op: 'eq', value: lid }],
    limit: 1,
  }).then(
    (rows) => rows[0]?.logo_path ?? null,
    () => null,
  );
}

/**
 * Borra una liga (`remove`: la RPC) y después el archivo de su logo. La ruta se lee antes (después ya no está) y el
 * archivo se borra solo si la liga se borró: la base lo deja en la cola de Storage y así se puede borrar aunque ya
 * no se sea admin de nada. Si borrar la liga falla, el logo sigue ahí (liga y archivo); si lo que falla es borrar el
 * archivo, queda en la cola.
 */
export async function deleteLeagueWithLogo(lid: string, remove: () => Promise<unknown>): Promise<void> {
  const path = await leagueLogoPath(lid);
  await remove();
  await removeLogoFile(path);
}

const afterChange = (lid: string) => invalidate(tags.league(lid), tags.leagues);

/**
 * Sube el logo (un archivo o uno ya comprimido con `prepareLogo`) y lo pone en la liga; borra el anterior.
 * Devuelve la ruta nueva. Necesita señal (no va por la cola). Solo el dueño o un admin (la base lo impone): primero
 * reserva la ruta (begin_logo_upload, cuenta en el límite de 30 por día), después la sube y la pone.
 */
export async function uploadLeagueLogo(lid: string, file: Blob | CompressedLogo): Promise<string> {
  if (!isUuid(lid)) throw new BackendError('Liga inválida.', 'validation', 'invalido');
  const logo = isCompressed(file) ? file : await prepareLogo(file);
  if (!logo.blob.size || logo.blob.size > MAX_UPLOAD_BYTES) throw new BackendError('El logo es muy grande.', 'validation', 'imagen');
  const league = lid.toLowerCase();
  const path = logoPath(league, uuidv7(), logo.contentType);
  await rpc('begin_logo_upload', { p_league: league, p_path: path });
  await backend().storage.upload(LOGO_BUCKET, path, logo.blob, logo.contentType);
  let old: string | null;
  try {
    old = await rpc<string | null>('set_league_logo', { p_league: league, p_path: path });
  } catch (e) {
    // No quedó puesto: el archivo que se acaba de subir sobra.
    await removeLogoFile(path);
    throw e;
  }
  if (old && old !== path) await removeLogoFile(old);
  afterChange(lid);
  return path;
}

/** Quita el logo de la liga (vuelve el ícono del deporte) y borra el archivo. */
export async function removeLeagueLogo(lid: string): Promise<void> {
  const old = await rpc<string | null>('set_league_logo', { p_league: lid, p_path: null });
  if (old) await removeLogoFile(old);
  afterChange(lid);
}

/** El error de subir o quitar el logo en palabras simples. */
export function logoErrorText(e: unknown, kind: LeagueKind = 'liga'): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  const be = e instanceof BackendError ? e : null;
  const code = (e instanceof Error ? e.message : '').trim().split(/[\s:]/)[0];
  if (be?.code === 'imagen') return 'No se pudo abrir esa imagen. Prueba con otra (JPG, PNG o WebP).';
  if (be?.kind === 'rate_limited' || code === 'rate_limited') return 'Cambiaste el logo muchas veces hoy. Prueba mañana.';
  if (be?.kind === 'permission' || code === 'no_permitido') return `Solo el dueño o un admin puede cambiar el logo ${kind === 'torneo' ? 'del torneo' : 'de la liga'}.`;
  if (be?.kind === 'not_found' || code === 'no_existe') return kind === 'torneo' ? 'Ese torneo ya no existe.' : 'Esa liga ya no existe.';
  if (be?.kind === 'network') return 'Sin conexión. Prueba otra vez cuando tengas señal.';
  if (be?.kind === 'auth') return 'Entra a tu cuenta para eso.';
  return 'No se pudo cambiar el logo. Prueba otra vez.';
}

// ---------- Ver el logo ----------

/** URL de cada logo ya pedida (la ruta nunca cambia de archivo: no vence). Pocas: las de las ligas que se ven. */
const urls = new Map<string, string>();
const loading = new Map<string, Promise<void>>();
/** Las que no se pudieron pedir: se muestra el ícono (y se vuelven a pedir la próxima vez que se muestre el logo). */
const failed = new Set<string>();
const listeners = new Set<() => void>();
const MAX_URLS = 300;

const notify = () => listeners.forEach((l) => l());

function setUrl(path: string, url: string) {
  failed.delete(path);
  urls.delete(path);
  urls.set(path, url);
  // La más vieja sale primero (el Map guarda el orden en que entraron).
  while (urls.size > MAX_URLS) urls.delete(urls.keys().next().value!);
  notify();
}

function forgetLogoUrl(path: string) {
  if (urls.delete(path)) notify();
}

/** Recuerda la URL de un logo (pruebas, o una que ya se sabe). */
export function primeLogoUrl(path: string, url: string) {
  setUrl(path, url);
}

/** Pide la URL una vez (las que fallan se vuelven a pedir la próxima vez que se muestre el logo). */
function loadLogoUrl(path: string): Promise<void> {
  let p = loading.get(path);
  if (!p) {
    p = backend()
      .storage.publicUrl(LOGO_BUCKET, path)
      .then(
        (url) => setUrl(path, url),
        (e: unknown) => {
          console.warn('[logo]', e);
          failed.add(path);
          notify();
        },
      )
      .finally(() => loading.delete(path));
    loading.set(path, p);
  }
  return p;
}

/** La URL pública del logo (la misma que muestra `useLogo`; la pide si hace falta). null si no se pudo pedir. */
export async function logoUrl(path: string): Promise<string | null> {
  if (!urls.has(path)) await loadLogoUrl(path);
  return urls.get(path) ?? null;
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

/**
 * El logo: su URL (null sin logo, mientras llega o si no se pudo pedir) y si todavía se está pidiendo (`pending`:
 * mientras tanto va un cuadro vacío del mismo tamaño, así la pantalla no salta cuando llega). Si no se pudo pedir,
 * `pending` es false y se muestra el ícono de siempre.
 */
export function useLogo(path: string | null | undefined): { url: string | null; pending: boolean } {
  const p = path || null;
  const readUrl = () => (p ? (urls.get(p) ?? null) : null);
  const readFailed = () => !!p && failed.has(p);
  const url = useSyncExternalStore(subscribe, readUrl, readUrl);
  const broken = useSyncExternalStore(subscribe, readFailed, readFailed);
  useEffect(() => {
    if (p && !urls.has(p)) void loadLogoUrl(p);
  }, [p]);
  return { url, pending: !!p && !url && !broken };
}
