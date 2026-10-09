import { useMemo } from 'react';
import { BackendError } from '../backend/types';
import { uuidv7 } from '../db/ids';
import { compressLogo, type CompressedLogo } from '../image';
import { AVATAR_BUCKET, primePublicUrl, publicUrl } from '../publicImages';
import { backend, getUserId, invalidate, queryClient, remember, rpc, updateCached, type Live } from './client';
import { peopleKeys, peopleTags, type PublicProfile } from './follows';
import { postTags, type PersonLite } from './posts';

/**
 * El perfil en la red social (docs/red-social.md): la biografía, la foto de perfil y bloquear personas.
 *
 * - La foto va en el bucket PÚBLICO `avatars`, en '<cuenta>/<uuid>.webp' (o '.jpg'): un cuadrado de 256 px como el
 *   logo de una liga (compressLogo). Cada foto nueva es un archivo nuevo; la anterior va a la cola de Storage de la base.
 * - Bloquear a alguien: deja de seguirse en las dos direcciones, no se ven sus publicaciones ni comentarios, no te
 *   encuentra en la búsqueda y no puede ver tu perfil.
 *
 * RPC: set_bio, set_avatar, block_user, unblock_user, my_blocked_users.
 */

export const BIO_MAX = 160;
/** El bucket `avatars` acepta hasta 256 kB (la foto comprimida pesa ≤ 120 kB). */
const MAX_AVATAR_BYTES = 262_144;

function patchMyProfile(fn: (p: PublicProfile) => PublicProfile) {
  const me = getUserId();
  if (!me) return;
  updateCached<PublicProfile | null>('publicProfile', (p, d) => (p && d.id === me ? fn(p) : p));
}

// ---------- Biografía ----------

/** Cambia la biografía (vacía la quita). Errores: 'palabras'. Devuelve cómo quedó. */
export async function setBio(bio: string): Promise<string | null> {
  if (!getUserId()) throw new BackendError('Entra a tu cuenta.', 'auth', 'session_not_found');
  const clean = bio.replace(/\s+/g, ' ').trim();
  if (clean.length > BIO_MAX) throw new BackendError(`Usa ${BIO_MAX} caracteres o menos.`, 'validation', 'invalido');
  const saved = await rpc<string | null>('set_bio', { p_bio: clean || null });
  patchMyProfile((p) => ({ ...p, bio: saved }));
  invalidate(peopleTags.user(getUserId()!));
  return saved;
}

// ---------- Foto de perfil ----------

/** La foto lista para subir (el cuadrado del centro, 256 px). */
export const prepareAvatar = (file: Blob): Promise<CompressedLogo> => compressLogo(file);

/** Sube la foto de perfil y la pone. Devuelve la ruta nueva. Necesita señal. */
export async function uploadAvatar(file: Blob | CompressedLogo): Promise<string> {
  const me = getUserId();
  if (!me) throw new BackendError('Entra a tu cuenta.', 'auth', 'session_not_found');
  const img = 'blob' in file && 'side' in file ? file : await prepareAvatar(file);
  if (!img.blob.size || img.blob.size > MAX_AVATAR_BYTES) throw new BackendError('La foto es muy grande.', 'validation', 'imagen');
  const path = `${me}/${uuidv7()}.${img.contentType === 'image/jpeg' ? 'jpg' : 'webp'}`;
  await backend().storage.upload(AVATAR_BUCKET, path, img.blob, img.contentType);
  try {
    await rpc<{ avatar: string | null }>('set_avatar', { p_path: path });
  } catch (e) {
    try {
      await backend().storage.remove(AVATAR_BUCKET, [path]);
    } catch {
      // queda huérfana: la limpia purge-photos
    }
    throw e;
  }
  // Se ve al momento: la URL de la foto nueva ya se sabe.
  const url = await publicUrl(AVATAR_BUCKET, path);
  if (url) primePublicUrl(AVATAR_BUCKET, path, url);
  afterAvatar(me, path);
  return path;
}

/** Quita la foto de perfil (vuelven las iniciales). */
export async function removeAvatar(): Promise<void> {
  const me = getUserId();
  if (!me) throw new BackendError('Entra a tu cuenta.', 'auth', 'session_not_found');
  await rpc<{ avatar: string | null }>('set_avatar', { p_path: null });
  afterAvatar(me, null);
}

function afterAvatar(me: string, path: string | null) {
  patchMyProfile((p) => ({ ...p, avatar: path }));
  // Mis publicaciones y comentarios llevan la foto: se vuelven a leer.
  invalidate(peopleTags.user(me), postTags.all, peopleTags.search);
  queryClient.invalidateKey(peopleKeys.profile(me));
}

// ---------- Bloquear ----------

export interface BlockedPerson extends PersonLite {
  at: string;
}

export const blockKeys = { mine: 'people:blocks' };

/** Bloquear (true) o desbloquear (false) a alguien. */
export async function setBlocked(target: string, blocked: boolean): Promise<boolean> {
  const me = getUserId();
  if (!me) throw new BackendError('Entra a tu cuenta.', 'auth', 'session_not_found');
  if (target === me) throw new BackendError('No te puedes bloquear a ti mismo.', 'validation', 'invalido');
  const res = await rpc<{ blocked: boolean }>(blocked ? 'block_user' : 'unblock_user', { p_user: target });
  updateCached<PublicProfile | null>('publicProfile', (p, d) =>
    p && d.id === target ? { ...p, blockedByMe: res.blocked, isFollowing: res.blocked ? false : p.isFollowing, followsYou: res.blocked ? false : p.followsYou } : p,
  );
  // Sus publicaciones, la búsqueda, las listas de seguir de las dos cuentas y el feed.
  invalidate(peopleTags.user(target), peopleTags.user(me), peopleTags.search, peopleTags.feed, postTags.all, blockKeys.mine);
  return res.blocked;
}

/** Las personas que bloqueé (la más nueva primero). */
export function useMyBlocks(): Live<BlockedPerson[]> {
  const key = getUserId() ? blockKeys.mine : null;
  if (key) remember(key, { kind: 'myBlocks' });
  const st = queryClient.useQuery<BlockedPerson[]>(key, () => rpc<BlockedPerson[]>('my_blocked_users'), {
    initial: [],
    tags: [peopleTags.all, blockKeys.mine],
    staleMs: 60_000,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}
