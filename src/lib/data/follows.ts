import { useCallback, useMemo, useRef, useState } from 'react';
import { BackendError } from '../backend/types';
import { getUserId, invalidate, queryClient, remember, rpc, updateCached, type Live, type QueryDesc } from './client';
import { tags } from './keys';
import { useTopic } from './topics';

/**
 * Social de las cuentas (20260928000200_social.sql): el perfil público, seguir y dejar de seguir, las listas de
 * seguidores y seguidos y los avisos sociales de la campana. Todo pasa por RPC (la base decide qué se ve: solo
 * lo de ligas que la cuenta que mira puede leer y nunca lo de ligas con menores).
 *
 * También vive aquí la lista por páginas (`usePaged`) que usan los juegos del perfil (profileGames.ts).
 *
 * RPC: public_profile, follow_user, unfollow_user, follow_list, social_notices (y en profileGames.ts:
 * profile_games, following_games, profile_stats, set_game_like).
 */

// ---------- Claves y etiquetas ----------

/** Etiquetas de lo social de las cuentas (no chocan con `social:<liga>`: esas llevan el id de una liga). */
export const peopleTags = {
  /** Todo lo social de las cuentas. */
  all: 'people',
  /** Lo de una cuenta: su perfil, sus listas, sus juegos y sus números. */
  user: (uid: string) => `people:${uid}`,
  /** Juegos de las cuentas que sigo (el inicio). */
  feed: 'people:feed',
  /** Avisos sociales de la campana. */
  notices: 'people:notices',
  /** Búsqueda de personas y la lista de a quién sigo (src/lib/data/people.ts). */
  search: 'people:search',
};

export type FollowKind = 'followers' | 'following';

export const peopleKeys = {
  profile: (uid: string) => `people:profile:${uid}`,
  list: (uid: string, kind: FollowKind) => `people:list:${kind}:${uid}`,
  notices: 'people:notices',
};

// ---------- Tipos ----------

/** Perfil de una cuenta con lo que ve la cuenta que mira. Horas en ISO. */
export interface PublicProfile {
  id: string;
  name: string;
  /** @usuario, sin la @ (falta en una copia vieja del teléfono hasta que se vuelve a leer). */
  username: string;
  /** Desde cuándo tiene cuenta (ISO). */
  since: string | null;
  /** Deportes donde juega (solo de ligas que se ven y sin menores), en el orden de la app. */
  sports: string[];
  followers: number;
  following: number;
  /** Me gusta recibidos en sus juegos (una felicitación del boliche también cuenta). */
  likesReceived: number;
  gamesCount: number;
  /** La cuenta que mira lo sigue. */
  isFollowing: boolean;
  /** Él sigue a la cuenta que mira. */
  followsYou: boolean;
  isMe: boolean;
  /** Biografía (≤ 160; falta en una copia vieja del teléfono hasta que se vuelve a leer). */
  bio?: string | null;
  /** Ruta de su foto en el bucket `avatars` (src/lib/publicImages.ts). */
  avatar?: string | null;
  /** Publicaciones suyas que la cuenta que mira puede ver. */
  posts?: number;
  /** La cuenta que mira lo bloqueó. */
  blockedByMe?: boolean;
}

/** Una cuenta en la lista de seguidores o seguidos. `at` = cuándo empezó a seguir (ISO, sirve de cursor). */
export interface FollowPerson {
  id: string;
  name: string;
  /** @usuario, sin la @ (falta en una copia vieja del teléfono hasta que se vuelve a leer). */
  username: string;
  at: string;
  isFollowing: boolean;
  followsYou: boolean;
  isMe: boolean;
  /** Ruta de su foto en el bucket `avatars`. */
  avatar?: string | null;
}

export interface FollowResult {
  following: boolean;
  followers: number;
}

// ---------- Lista por páginas ----------

/** La base da hasta 50 por página. */
export const PAGE_MAX = 50;
/** Al volver a leer una lista se piden otra vez las que ya se veían, hasta tantas. */
const KEEP_MAX = 200;

/** Lo que se guarda en la caché de una lista por páginas. */
export interface PageData<T> {
  items: T[];
  /** Ya no hay más (la última página vino incompleta). */
  done: boolean;
}

export interface Paged<T> extends Live<T[]> {
  hasMore: boolean;
  /** Cargando la página siguiente. */
  loadingMore: boolean;
  /** Error de la página siguiente (la lista de antes se sigue viendo). */
  moreError: Error | null;
  loadMore: () => Promise<void>;
  /** Volver a leer desde el servidor. */
  refresh: () => void;
}

export interface PagedSpec<T> {
  /** null = no leer (p. ej. sin sesión o sin id). */
  key: string | null;
  /** Qué pide (el `kind` sirve para los cambios optimistas con `patchPaged`). */
  desc: QueryDesc;
  tags: string[];
  pageSize: number;
  /** Una página: las de después de `after` (null = desde el principio), hasta `limit`. */
  fetchPage: (after: T | null, limit: number) => Promise<T[]>;
  itemKey: (item: T) => string;
  staleMs?: number;
  pollMs?: number;
}

const EMPTY_PAGE: PageData<never> = { items: [], done: false };

/** Junta sin repetir (lo nuevo de una página que ya estaba se reemplaza en su lugar). */
export function mergeUnique<T>(base: readonly T[], more: readonly T[], keyOf: (t: T) => string): T[] {
  const at = new Map(base.map((t, i) => [keyOf(t), i]));
  const out = [...base];
  for (const t of more) {
    const i = at.get(keyOf(t));
    if (i === undefined) {
      at.set(keyOf(t), out.length);
      out.push(t);
    } else out[i] = t;
  }
  return out;
}

/** Lee páginas seguidas hasta tener `want` (o hasta que no haya más). */
export async function loadUpTo<T>(
  fetchPage: (after: T | null, limit: number) => Promise<T[]>,
  want: number,
  pageSize: number,
  keyOf: (t: T) => string,
): Promise<PageData<T>> {
  let items: T[] = [];
  const size = Math.max(1, Math.min(PAGE_MAX, pageSize));
  for (;;) {
    const limit = Math.min(size, Math.max(1, want - items.length));
    const page = await fetchPage(items.at(-1) ?? null, limit);
    items = mergeUnique(items, page, keyOf);
    if (page.length < limit) return { items, done: true };
    if (items.length >= want) return { items, done: false };
  }
}

/** Cambia en la caché los elementos de todas las listas por páginas de ese tipo (cambio optimista). */
export function patchPaged<T>(kind: string, fn: (item: T, desc: QueryDesc) => T) {
  updateCached<PageData<T>>(kind, (page, desc) => {
    let changed = false;
    const items = page.items.map((it) => {
      const next = fn(it, desc);
      if (next !== it) changed = true;
      return next;
    });
    return changed ? { ...page, items } : page;
  });
}

/**
 * Lista por páginas sobre la caché de consultas: la primera página se lee sola (y se vuelve a leer con sus
 * etiquetas, con tantas como ya se veían); `loadMore` agrega la siguiente.
 */
export function usePaged<T>(spec: PagedSpec<T>): Paged<T> {
  const { key } = spec;
  const specRef = useRef(spec);
  specRef.current = spec;
  if (key) remember(key, spec.desc);

  const st = queryClient.useQuery<PageData<T>>(
    key,
    () => {
      const s = specRef.current;
      const have = key ? (queryClient.getQueryData<PageData<T>>(key)?.items.length ?? 0) : 0;
      return loadUpTo(s.fetchPage, Math.min(KEEP_MAX, Math.max(s.pageSize, have)), s.pageSize, s.itemKey);
    },
    { initial: EMPTY_PAGE as PageData<T>, tags: spec.tags, staleMs: spec.staleMs ?? 30_000, pollMs: spec.pollMs },
  );

  const [more, setMore] = useState<{ key: string | null; loading: boolean; error: Error | null }>({ key, loading: false, error: null });
  const busy = useRef<string | null>(null);

  const loadMore = useCallback(async () => {
    const k = key;
    const s = specRef.current;
    const cur = k ? queryClient.getQueryData<PageData<T>>(k) : undefined;
    if (!k || !cur || cur.done || busy.current === k) return;
    busy.current = k;
    setMore({ key: k, loading: true, error: null });
    try {
      const page = await s.fetchPage(cur.items.at(-1) ?? null, s.pageSize);
      queryClient.setQueryData<PageData<T>>(k, (old) => ({
        items: mergeUnique((old ?? cur).items, page, s.itemKey),
        done: page.length < s.pageSize,
      }));
      setMore({ key: k, loading: false, error: null });
    } catch (e) {
      setMore({ key: k, loading: false, error: e instanceof Error ? e : new Error(String(e)) });
    } finally {
      if (busy.current === k) busy.current = null;
    }
  }, [key]);

  const refresh = useCallback(() => {
    if (key) queryClient.invalidateKey(key);
  }, [key]);

  // Otra lista: lo de «cargar más» de la anterior no cuenta.
  const mine = more.key === key;
  return useMemo(
    () => ({
      data: st.data.items,
      loading: st.loading,
      error: st.error,
      hasMore: !!key && !st.loading && !st.data.done,
      loadingMore: mine && more.loading,
      moreError: mine ? more.error : null,
      loadMore,
      refresh,
    }),
    [st, key, mine, more, loadMore, refresh],
  );
}

// ---------- Perfil público ----------

export const fetchPublicProfile = (uid: string) => rpc<PublicProfile | null>('public_profile', { p_user: uid });

/** Perfil de una cuenta (null mientras carga, si no existe o si no se ve: mirar `loading`). */
export function usePublicProfile(uid: string | null | undefined): Live<PublicProfile | null> {
  const key = uid && getUserId() ? peopleKeys.profile(uid) : null;
  if (key) remember(key, { kind: 'publicProfile', id: uid! });
  const st = queryClient.useQuery<PublicProfile | null>(key, () => fetchPublicProfile(uid!), {
    initial: null,
    tags: uid ? [peopleTags.all, peopleTags.user(uid)] : [],
    staleMs: 30_000,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

// ---------- Seguidores y seguidos ----------

const FOLLOW_PAGE = 30;

export const fetchFollowList = (uid: string, kind: FollowKind, after: Pick<FollowPerson, 'at' | 'id'> | null = null, limit = FOLLOW_PAGE) =>
  rpc<FollowPerson[]>('follow_list', {
    p_user: uid,
    p_kind: kind,
    p_limit: limit,
    p_before: after?.at ?? null,
    p_before_id: after?.id ?? null,
  });

/** Seguidores o seguidos de una cuenta (más nuevos primero, por páginas de 30). */
export function useFollowList(uid: string | null | undefined, kind: FollowKind): Paged<FollowPerson> {
  return usePaged<FollowPerson>({
    key: uid && getUserId() ? peopleKeys.list(uid, kind) : null,
    desc: { kind: 'followList', id: uid ?? undefined, status: kind },
    tags: uid ? [peopleTags.all, peopleTags.user(uid)] : [],
    pageSize: FOLLOW_PAGE,
    fetchPage: (after, limit) => fetchFollowList(uid!, kind, after, limit),
    itemKey: (p) => p.id,
  });
}

export const useFollowers = (uid: string | null | undefined) => useFollowList(uid, 'followers');
export const useFollowing = (uid: string | null | undefined) => useFollowList(uid, 'following');

// ---------- Seguir y dejar de seguir ----------

/** El perfil guardado de una cuenta (o undefined si no está en la caché). */
const cachedProfile = (uid: string) => queryClient.getQueryData<PublicProfile | null>(peopleKeys.profile(uid)) ?? undefined;

function patchProfile(uid: string, fn: (p: PublicProfile) => PublicProfile) {
  updateCached<PublicProfile | null>('publicProfile', (p, d) => (p && d.id === uid ? fn(p) : p));
}

/** ¿La cuenta ya sigue a `target`? Del perfil o de alguna lista en la caché; undefined si no se sabe. */
function knownFollowing(target: string): boolean | undefined {
  const p = cachedProfile(target);
  if (p) return p.isFollowing;
  let found: boolean | undefined;
  patchPaged<FollowPerson>('followList', (it) => {
    if (it.id === target && found === undefined) found = it.isFollowing;
    return it;
  });
  return found;
}

/**
 * Seguir (true) o dejar de seguir (false) a una cuenta. Cambia en pantalla al momento (el botón, los números y
 * las listas) y después pone lo que dice el servidor; si falla, se vuelve a leer y sale el error.
 */
export async function setFollowing(target: string, follow: boolean): Promise<FollowResult> {
  const me = getUserId();
  if (!me) throw new BackendError('Entra a tu cuenta para seguir a alguien.', 'auth', 'session_not_found');
  if (target === me) throw new BackendError('No te puedes seguir a ti mismo.', 'validation', 'invalido');
  const before = knownFollowing(target);
  const delta = before === undefined || before === follow ? 0 : follow ? 1 : -1;

  patchProfile(target, (p) => ({ ...p, isFollowing: follow, followers: Math.max(0, p.followers + delta) }));
  if (delta) patchProfile(me, (p) => ({ ...p, following: Math.max(0, p.following + delta) }));
  patchPaged<FollowPerson>('followList', (it) => (it.id === target && it.isFollowing !== follow ? { ...it, isFollowing: follow } : it));
  // La búsqueda de personas (src/lib/data/people.ts) también lleva el botón.
  updateCached<{ id: string; isFollowing: boolean }[]>('peopleSearch', (list) =>
    list.some((it) => it.id === target && it.isFollowing !== follow) ? list.map((it) => (it.id === target ? { ...it, isFollowing: follow } : it)) : list,
  );

  try {
    const res = await rpc<FollowResult>(follow ? 'follow_user' : 'unfollow_user', { p_user: target });
    patchProfile(target, (p) => ({ ...p, isFollowing: res.following, followers: res.followers }));
    return res;
  } finally {
    // Lo de las dos cuentas (listas, números), los juegos de quienes sigo, la búsqueda (a quién sigo) y las
    // publicaciones de Siguiendo (postTags.feed de ./posts: ese archivo importa este).
    invalidate(peopleTags.user(target), peopleTags.user(me), peopleTags.feed, peopleTags.search, 'posts:feed');
  }
}

export const followUser = (target: string) => setFollowing(target, true);
export const unfollowUser = (target: string) => setFollowing(target, false);

// ---------- Avisos sociales de la campana ----------

/** Lo que manda social_notices (horas en ISO). */
export type SocialNoticeRow =
  | { kind: 'follow'; at: string; userId: string; name: string }
  | {
      kind: 'like';
      at: string;
      userId: string;
      name: string;
      gameKind: 'bowling' | 'match' | 'golf' | 'swim' | 'solo';
      id: string;
      /** null en un juego suelto (no es de ninguna liga). */
      playerId: string | null;
      leagueId: string | null;
      leagueName: string | null;
      sport: string | null;
      url: string;
    }
  | { kind: 'post_like'; at: string; userId: string; name: string; postId: string }
  | { kind: 'post_comment'; at: string; userId: string; name: string; postId: string; text: string };

/** Aviso social listo para la campana (la misma forma que `GenericNotice` de src/lib/notifications.ts). */
export interface SocialNotice {
  id: string;
  kind: 'social';
  title: string;
  body: string;
  url: string;
  /** ISO. */
  at: string;
  icon: 'follow' | 'like' | 'comment';
  lid: string | null;
  sport: string | null;
}

const GAME_NOUN: Record<string, string> = { bowling: 'tu juego', match: 'tu partido', golf: 'tu ronda', swim: 'tu prueba', solo: 'tu juego suelto' };

const cleanName = (name: unknown) => (typeof name === 'string' && name.trim() ? name.trim() : 'Alguien');

/** «ana», «ana y otra», «ana y 2 más» (el más nuevo primero). */
export function peopleText(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? 'Alguien';
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names[0]} y ${names.length - 1} más`;
}

/**
 * Los avisos de la campana: uno por cada cuenta que empezó a seguir («ana te empezó a seguir»), uno por juego con
 * todos sus me gusta («A ana y 2 más les gustó tu partido»), uno por publicación con sus me gusta («A ana le gustó tu
 * publicación») y uno por publicación con sus comentarios («ana comentó tu publicación», con el último). El id cambia
 * con el más nuevo: uno nuevo en el mismo juego o publicación vuelve a salir como nuevo. Más nuevos primero.
 */
export function buildSocialNotices(rows: readonly SocialNoticeRow[] | null | undefined): SocialNotice[] {
  const out: SocialNotice[] = [];
  const likes = new Map<string, { row: Extract<SocialNoticeRow, { kind: 'like' }>; names: string[]; users: Set<string>; at: string }>();
  // Me gusta y comentarios de cada publicación: los nombres (el más nuevo primero) y lo último que dijeron.
  type PostGroup = { postId: string; names: string[]; users: Set<string>; at: string; text: string };
  const postLikes = new Map<string, PostGroup>();
  const postComments = new Map<string, PostGroup>();
  const addTo = (groups: Map<string, PostGroup>, postId: string, userId: string, name: string, at: string, text = '') => {
    const g = groups.get(postId);
    if (!g) groups.set(postId, { postId, names: [name], users: new Set([userId]), at, text });
    else {
      const newer = Date.parse(at) > Date.parse(g.at);
      if (!g.users.has(userId)) {
        g.users.add(userId);
        if (newer) g.names.unshift(name);
        else g.names.push(name);
      }
      if (newer) {
        g.at = at;
        g.text = text;
      }
    }
  };
  for (const r of rows ?? []) {
    if (!r || typeof r.at !== 'string' || !r.userId) continue;
    if (r.kind === 'follow') {
      out.push({
        id: `seguir:${r.userId}:${Date.parse(r.at)}`,
        kind: 'social',
        title: `${cleanName(r.name)} te empezó a seguir`,
        body: 'Toca para ver su perfil.',
        url: `/u/${r.userId}`,
        at: r.at,
        icon: 'follow',
        lid: null,
        sport: null,
      });
    } else if (r.kind === 'post_like' && r.postId) {
      addTo(postLikes, r.postId, r.userId, cleanName(r.name), r.at);
    } else if (r.kind === 'post_comment' && r.postId) {
      addTo(postComments, r.postId, r.userId, cleanName(r.name), r.at, typeof r.text === 'string' ? r.text.trim() : '');
    } else if (r.kind === 'like' && r.id) {
      const k = `${r.gameKind}:${r.id}:${r.playerId ?? ''}`;
      const g = likes.get(k);
      if (!g) likes.set(k, { row: r, names: [cleanName(r.name)], users: new Set([r.userId]), at: r.at });
      else if (!g.users.has(r.userId)) {
        g.users.add(r.userId);
        // La base los manda del más nuevo al más viejo; por si acaso, el más nuevo va primero.
        if (Date.parse(r.at) > Date.parse(g.at)) {
          g.names.unshift(cleanName(r.name));
          g.at = r.at;
          g.row = r;
        } else g.names.push(cleanName(r.name));
      }
    }
  }
  for (const [k, g] of likes) {
    const many = g.names.length > 1;
    out.push({
      id: `megusta:${k}:${Date.parse(g.at)}`,
      kind: 'social',
      title: `A ${peopleText(g.names)} ${many ? 'les' : 'le'} gustó ${GAME_NOUN[g.row.gameKind] ?? 'tu juego'}`,
      body: g.row.leagueName?.trim() || 'Toca para ver el juego.',
      url: g.row.url || `/l/${g.row.leagueId}`,
      at: g.at,
      icon: 'like',
      lid: g.row.leagueId || null,
      sport: g.row.sport ?? null,
    });
  }
  for (const g of postLikes.values()) {
    const many = g.names.length > 1;
    out.push({
      id: `megusta:post:${g.postId}:${Date.parse(g.at)}`,
      kind: 'social',
      title: `A ${peopleText(g.names)} ${many ? 'les' : 'le'} gustó tu publicación`,
      body: 'Toca para verla.',
      url: `/p/${g.postId}`,
      at: g.at,
      icon: 'like',
      lid: null,
      sport: null,
    });
  }
  for (const g of postComments.values()) {
    out.push({
      id: `comentario:post:${g.postId}:${Date.parse(g.at)}`,
      kind: 'social',
      title: `${peopleText(g.names)} ${g.names.length > 1 ? 'comentaron' : 'comentó'} tu publicación`,
      body: g.text ? `«${g.text.length > 80 ? `${g.text.slice(0, 79)}…` : g.text}»` : 'Toca para verla.',
      url: `/p/${g.postId}`,
      at: g.at,
      icon: 'comment',
      lid: null,
      sport: null,
    });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (a.id < b.id ? 1 : -1));
}

export async function fetchSocialNotices(limit = 30): Promise<SocialNotice[]> {
  return buildSocialNotices(await rpc<SocialNoticeRow[]>('social_notices', { p_limit: limit }));
}

/**
 * Avisos sociales de los últimos 30 días (para la página de avisos). Se vuelven a leer cada minuto, al volver a
 * la app y con el tiempo real de la cuenta (`user:<id>`).
 */
export function useSocialNotices(): Live<SocialNotice[]> {
  const uid = getUserId();
  useTopic(uid ? `user:${uid}` : null);
  const key = uid ? peopleKeys.notices : null;
  if (key) remember(key, { kind: 'socialNotices' });
  const st = queryClient.useQuery<SocialNoticeRow[]>(key, () => rpc<SocialNoticeRow[]>('social_notices', { p_limit: 50 }), {
    initial: [],
    tags: [peopleTags.all, peopleTags.notices, tags.feeds],
    staleMs: 20_000,
    pollMs: 60_000,
  });
  const data = useMemo(() => buildSocialNotices(st.data), [st.data]);
  return useMemo(() => ({ data, loading: st.loading, error: st.error }), [data, st.loading, st.error]);
}
