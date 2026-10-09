import { useMemo } from 'react';
import { BackendError } from '../backend/types';
import { uuidv7 } from '../db/ids';
import { imageBlob, storedType, type CompressedImage } from '../image';
import { POST_BUCKET } from '../publicImages';
import { backend, getUserId, invalidate, queryClient, remember, rpc, updateCached, type Live, type QueryDesc } from './client';
import { patchPaged, peopleKeys, peopleTags, usePaged, type PageData, type Paged } from './follows';

/**
 * Publicaciones de la red social (docs/red-social.md, 20261009000100_red_social.sql): el feed (Siguiendo y
 * Descubrir), las de una persona y las de una liga, una sola con sus comentarios, publicar (texto y una foto), borrar,
 * me gusta y comentar. Todo por RPC: la base decide qué se ve (quién publicó, a quién, bloqueos y ligas con menores).
 *
 * Publicar necesita señal (no va por la cola sin conexión): la foto se sube primero a su carpeta del bucket público
 * `posts` y la RPC la enlaza.
 *
 * RPC: social_feed, user_posts, league_posts, post_detail, create_post, delete_post, set_post_like, post_comments,
 * add_post_comment, delete_post_comment.
 */

// ---------- Tipos ----------

/** Una cuenta como sale en una publicación o un comentario. `avatar` = ruta de su foto en el bucket `avatars`. */
export interface PersonLite {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
}

export type PostVisibility = 'public' | 'followers' | 'league';
export type FeedScope = 'following' | 'discover';

export interface Post {
  id: string;
  author: PersonLite;
  text: string;
  /** Ruta en el bucket `posts` y su tamaño (para reservar el hueco antes de que llegue). */
  photo: { path: string; w: number | null; h: number | null } | null;
  league: { id: string; name: string; sport: string } | null;
  sport: string | null;
  visibility: PostVisibility;
  /** Cuándo se publicó (ISO; sirve de cursor con el id). */
  at: string;
  likes: number;
  likedByMe: boolean;
  comments: number;
  isMine: boolean;
  canDelete: boolean;
}

export interface PostComment {
  id: string;
  postId: string;
  author: PersonLite;
  text: string;
  at: string;
  isMine: boolean;
  canDelete: boolean;
}

// ---------- Límites (los mismos de la base) ----------

export const POST_TEXT_MAX = 1000;
export const COMMENT_MAX = 500;
/** El bucket `posts` acepta hasta 512 kB (la foto comprimida pesa ≤ 110 kB). */
const MAX_PHOTO_BYTES = 524_288;
const POSTS_PAGE = 15;
const COMMENTS_PAGE = 50;

// ---------- Claves y etiquetas ----------

export const postTags = {
  /** Todo lo de publicaciones. */
  all: 'posts',
  feed: 'posts:feed',
  user: (uid: string) => `posts:u:${uid}`,
  league: (lid: string) => `posts:l:${lid}`,
  post: (id: string) => `posts:p:${id}`,
};

export const postKeys = {
  feed: (scope: FeedScope) => `posts:feed:${scope}`,
  user: (uid: string) => `posts:user:${uid}`,
  league: (lid: string) => `posts:league:${lid}`,
  detail: (id: string) => `posts:detail:${id}`,
  comments: (id: string) => `posts:comments:${id}`,
};

/** Qué lista es (para poner una publicación nueva arriba solo donde toca). */
type PostListDesc = QueryDesc & { kind: 'posts' };

const cursor = (after: Pick<Post, 'at' | 'id'> | null) => ({ p_before: after?.at ?? null, p_before_id: after?.id ?? null });

// ---------- Leer ----------

export const fetchFeed = (scope: FeedScope, after: Pick<Post, 'at' | 'id'> | null = null, limit = POSTS_PAGE) =>
  rpc<Post[]>('social_feed', { p_scope: scope, p_limit: limit, ...cursor(after) });

export const fetchUserPosts = (uid: string, after: Pick<Post, 'at' | 'id'> | null = null, limit = POSTS_PAGE) =>
  rpc<Post[]>('user_posts', { p_user: uid, p_limit: limit, ...cursor(after) });

export const fetchLeaguePosts = (lid: string, after: Pick<Post, 'at' | 'id'> | null = null, limit = POSTS_PAGE) =>
  rpc<Post[]>('league_posts', { p_league: lid, p_limit: limit, ...cursor(after) });

export const fetchPost = (id: string) => rpc<Post | null>('post_detail', { p_post: id });

/** El feed: Siguiendo (lo mío, de quien sigo y de mis ligas y las que sigo) o Descubrir (lo público de todos). */
export function useSocialFeed(scope: FeedScope): Paged<Post> {
  return usePaged<Post>({
    key: getUserId() ? postKeys.feed(scope) : null,
    desc: { kind: 'posts', status: `feed:${scope}` } satisfies PostListDesc,
    tags: [postTags.all, postTags.feed],
    pageSize: POSTS_PAGE,
    fetchPage: (after, limit) => fetchFeed(scope, after, limit),
    itemKey: (p) => p.id,
    pollMs: 120_000,
  });
}

/** Las publicaciones de una persona que la cuenta que mira puede ver. */
export function useUserPosts(uid: string | null | undefined): Paged<Post> {
  return usePaged<Post>({
    key: uid && getUserId() ? postKeys.user(uid) : null,
    desc: { kind: 'posts', status: 'user', id: uid ?? undefined } satisfies PostListDesc,
    tags: uid ? [postTags.all, postTags.user(uid), peopleTags.user(uid)] : [],
    pageSize: POSTS_PAGE,
    fetchPage: (after, limit) => fetchUserPosts(uid!, after, limit),
    itemKey: (p) => p.id,
  });
}

/** El muro de una liga. */
export function useLeaguePosts(lid: string | null | undefined): Paged<Post> {
  return usePaged<Post>({
    key: lid && getUserId() ? postKeys.league(lid) : null,
    desc: { kind: 'posts', status: 'league', lid: lid ?? undefined } satisfies PostListDesc,
    tags: lid ? [postTags.all, postTags.league(lid)] : [],
    pageSize: POSTS_PAGE,
    fetchPage: (after, limit) => fetchLeaguePosts(lid!, after, limit),
    itemKey: (p) => p.id,
    pollMs: 120_000,
  });
}

/** Una publicación (null mientras carga, si no existe o si no se ve: mirar `loading`). */
export function usePost(id: string | null | undefined): Live<Post | null> {
  const key = id && getUserId() ? postKeys.detail(id) : null;
  if (key) remember(key, { kind: 'postDetail', id: id! });
  const st = queryClient.useQuery<Post | null>(key, () => fetchPost(id!), {
    initial: cachedPost(id) ?? null,
    tags: id ? [postTags.all, postTags.post(id)] : [],
    staleMs: 20_000,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

/** La publicación si ya está en alguna lista de la caché (para mostrarla al momento al abrirla). */
function cachedPost(id: string | null | undefined): Post | undefined {
  if (!id) return undefined;
  const detail = queryClient.getQueryData<Post | null>(postKeys.detail(id));
  if (detail) return detail;
  let found: Post | undefined;
  patchPaged<Post>('posts', (p) => {
    if (!found && p.id === id) found = p;
    return p;
  });
  return found;
}

export const fetchComments = (postId: string, after: Pick<PostComment, 'at' | 'id'> | null = null, limit = COMMENTS_PAGE) =>
  rpc<PostComment[]>('post_comments', { p_post: postId, p_limit: limit, p_after: after?.at ?? null, p_after_id: after?.id ?? null });

/** Comentarios de una publicación, del más viejo al más nuevo (por páginas de 50). */
export function usePostComments(postId: string | null | undefined): Paged<PostComment> {
  return usePaged<PostComment>({
    key: postId && getUserId() ? postKeys.comments(postId) : null,
    desc: { kind: 'postComments', id: postId ?? undefined },
    tags: postId ? [postTags.all, postTags.post(postId)] : [],
    pageSize: COMMENTS_PAGE,
    fetchPage: (after, limit) => fetchComments(postId!, after, limit),
    itemKey: (c) => c.id,
    pollMs: 30_000,
  });
}

// ---------- Cambios en la caché ----------

/** Cambia una publicación en todas las listas y en su detalle. */
export function patchPost(id: string, fn: (p: Post) => Post) {
  patchPaged<Post>('posts', (p) => (p.id === id ? fn(p) : p));
  updateCached<Post | null>('postDetail', (p) => (p && p.id === id ? fn(p) : p));
}

/** Saca una publicación de todas las listas (y deja su detalle en null). */
function dropPost(id: string) {
  updateCached<PageData<Post>>('posts', (page) => (page.items.some((p) => p.id === id) ? { ...page, items: page.items.filter((p) => p.id !== id) } : page));
  updateCached<Post | null>('postDetail', (p) => (p && p.id === id ? null : p));
}

/** ¿La publicación nueva va en esa lista? (Siguiendo y mis publicaciones siempre; la liga, si es de ella; Descubrir, si es pública). */
export function belongsTo(post: Post, desc: QueryDesc): boolean {
  if (desc.status === 'feed:following') return true;
  if (desc.status === 'feed:discover') return post.visibility === 'public';
  if (desc.status === 'user') return desc.id === post.author.id;
  if (desc.status === 'league') return !!post.league && desc.lid === post.league.id;
  return false;
}

/** Pone una publicación nueva arriba en las listas donde va. */
function prependPost(post: Post) {
  updateCached<PageData<Post>>('posts', (page, desc) =>
    belongsTo(post, desc) && !page.items.some((p) => p.id === post.id) ? { ...page, items: [post, ...page.items] } : page,
  );
}

// ---------- Publicar y borrar ----------

export interface NewPost {
  text: string;
  photo?: CompressedImage | null;
  leagueId?: string | null;
  visibility: PostVisibility;
  sport?: string | null;
}

/** El texto como lo guarda la base: sin espacios alrededor y sin más de una línea en blanco seguida. */
export function cleanPostText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Qué le falta a una publicación para poder salir (null = lista). */
export function postProblem(input: Pick<NewPost, 'text' | 'photo' | 'leagueId' | 'visibility'>): string | null {
  const text = cleanPostText(input.text);
  if (!text && !input.photo) return 'Escribe algo o agrega una foto.';
  if (text.length > POST_TEXT_MAX) return `Usa ${POST_TEXT_MAX} caracteres o menos.`;
  if (input.visibility === 'league' && !input.leagueId) return 'Elige la liga.';
  if (input.visibility === 'followers' && input.leagueId) return 'Lo de una liga es para todos o solo para la liga.';
  return null;
}

const photoPath = (me: string, id: string, type: 'image/webp' | 'image/jpeg') => `${me}/${id}.${type === 'image/jpeg' ? 'jpg' : 'webp'}`;

async function removePhoto(path: string) {
  try {
    await backend().storage.remove(POST_BUCKET, [path]);
  } catch (e) {
    // La base la deja en la cola de Storage al borrar la publicación; si quedó huérfana, la limpia purge-photos.
    console.warn('[publicacion] no se pudo borrar la foto', e);
  }
}

/**
 * Publica: sube la foto (si hay) y crea la publicación. Sale arriba en el feed y en las listas donde va. Necesita
 * señal. Errores: 'palabras' (texto con palabras que no se permiten), 'rate_limited' (10 por hora, 40 por día).
 */
export async function createPost(input: NewPost): Promise<Post> {
  const me = getUserId();
  if (!me) throw new BackendError('Entra a tu cuenta para publicar.', 'auth', 'session_not_found');
  const problem = postProblem(input);
  if (problem) throw new BackendError(problem, 'validation', 'invalido');
  const id = uuidv7();
  let path: string | null = null;
  if (input.photo) {
    const type = storedType(input.photo);
    const blob = imageBlob(input.photo);
    if (!blob.size || blob.size > MAX_PHOTO_BYTES) throw new BackendError('La foto es muy grande.', 'validation', 'imagen');
    path = photoPath(me, id, type);
    await backend().storage.upload(POST_BUCKET, path, blob, type);
  }
  let post: Post;
  try {
    post = await rpc<Post>('create_post', {
      p_id: id,
      p_text: cleanPostText(input.text),
      p_photo: path,
      p_photo_w: input.photo?.width ?? null,
      p_photo_h: input.photo?.height ?? null,
      p_league: input.leagueId ?? null,
      p_visibility: input.visibility,
      p_sport: input.leagueId ? null : (input.sport ?? null),
    });
  } catch (e) {
    // No quedó publicada: la foto que se acaba de subir sobra.
    if (path) await removePhoto(path);
    throw e;
  }
  prependPost(post);
  queryClient.invalidateKey(peopleKeys.profile(me));
  return post;
}

/** Borra una publicación (el autor, un admin de su liga o el superadmin). Sale de las listas al momento. */
export async function deletePost(post: Pick<Post, 'id' | 'author' | 'league' | 'photo' | 'isMine'>): Promise<void> {
  dropPost(post.id);
  try {
    await rpc<boolean>('delete_post', { p_post: post.id });
    if (post.photo && post.isMine) await removePhoto(post.photo.path);
  } finally {
    invalidate(postTags.user(post.author.id), postTags.feed, ...(post.league ? [postTags.league(post.league.id)] : []));
    queryClient.invalidateKey(peopleKeys.profile(post.author.id));
  }
}

// ---------- Me gusta ----------

export interface PostLikeResult {
  likes: number;
  liked: boolean;
}

/** Cuenta de me gusta después de cambiar el mío (sin bajar de 0). */
export function optimisticPostLikes(p: Pick<Post, 'likes' | 'likedByMe'>, liked: boolean): Pick<Post, 'likes' | 'likedByMe'> {
  if (p.likedByMe === liked) return { likes: p.likes, likedByMe: liked };
  return { likes: Math.max(0, p.likes + (liked ? 1 : -1)), likedByMe: liked };
}

/** Me gusta (true) o quitarlo (false). Se ve al momento en todas las listas; después queda lo del servidor. */
export async function setPostLike(post: Pick<Post, 'id'>, liked: boolean): Promise<PostLikeResult> {
  if (!getUserId()) throw new BackendError('Entra a tu cuenta para dar me gusta.', 'auth', 'session_not_found');
  patchPost(post.id, (p) => ({ ...p, ...optimisticPostLikes(p, liked) }));
  try {
    const res = await rpc<PostLikeResult>('set_post_like', { p_post: post.id, p_liked: liked });
    patchPost(post.id, (p) => ({ ...p, likes: res.likes, likedByMe: res.liked }));
    return res;
  } catch (e) {
    invalidate(postTags.post(post.id), postTags.feed);
    throw e;
  }
}

// ---------- Comentarios ----------

/** Comenta. Sale al final de la lista y suma uno al contador. Errores: 'palabras', 'rate_limited' (uno cada 3 s). */
export async function addPostComment(postId: string, text: string): Promise<PostComment> {
  if (!getUserId()) throw new BackendError('Entra a tu cuenta para comentar.', 'auth', 'session_not_found');
  const clean = text.trim();
  if (!clean) throw new BackendError('Escribe tu comentario.', 'validation', 'invalido');
  if (clean.length > COMMENT_MAX) throw new BackendError(`Usa ${COMMENT_MAX} caracteres o menos.`, 'validation', 'invalido');
  const comment = await rpc<PostComment>('add_post_comment', { p_post: postId, p_text: clean, p_id: uuidv7() });
  updateCached<PageData<PostComment>>('postComments', (page, desc) =>
    desc.id === postId && !page.items.some((c) => c.id === comment.id) ? { ...page, items: [...page.items, comment] } : page,
  );
  patchPost(postId, (p) => ({ ...p, comments: p.comments + 1 }));
  return comment;
}

/** Borra un comentario (su autor, el de la publicación, un admin de la liga o el superadmin). */
export async function deletePostComment(comment: Pick<PostComment, 'id' | 'postId'>): Promise<void> {
  updateCached<PageData<PostComment>>('postComments', (page, desc) =>
    desc.id === comment.postId ? { ...page, items: page.items.filter((c) => c.id !== comment.id) } : page,
  );
  patchPost(comment.postId, (p) => ({ ...p, comments: Math.max(0, p.comments - 1) }));
  try {
    await rpc<boolean>('delete_post_comment', { p_comment: comment.id });
  } finally {
    invalidate(postTags.post(comment.postId));
  }
}

// ---------- Textos ----------

/** El mensaje para un error al publicar o comentar. */
export function socialErrorText(e: unknown, fallback = 'No se pudo enviar. Inténtalo otra vez.'): string {
  const code = e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined;
  const kind = e && typeof e === 'object' ? (e as { kind?: unknown }).kind : undefined;
  const message = e instanceof Error ? e.message : '';
  if (code === 'palabras' || /^palabras\b/.test(message)) return 'Tu texto tiene palabras que no se permiten. Cámbialo y vuelve a intentar.';
  if (kind === 'rate_limited' || code === 'rate_limited') return 'Vas muy rápido. Espera un momento y vuelve a intentar.';
  if (kind === 'network') return 'Sin conexión. Revisa tu señal y vuelve a intentar.';
  if (kind === 'not_found' || code === 'no_existe') return 'Esa publicación ya no está.';
  if (kind === 'permission') return message && !/^[a-z_]+$/.test(message) ? message : 'No tienes permiso para hacer eso.';
  if (kind === 'validation' && message && !/^[a-z_]+(:|$)/.test(message)) return message;
  return fallback;
}

/** A quién le sale: «Todos», «Seguidores» o «Solo la liga». */
export const VISIBILITY_LABEL: Record<PostVisibility, string> = {
  public: 'Todos',
  followers: 'Seguidores',
  league: 'Solo la liga',
};
