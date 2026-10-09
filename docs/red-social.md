# Red social

La app ya tenía lo básico de una red: @usuario, buscar personas, seguir, «me gusta» en los juegos y el feed de los juegos
de quien sigues. Esto le suma publicaciones (texto y foto), comentarios, «me gusta» en publicaciones, foto de perfil y
biografía, seguir ligas, bloquear personas, una lupa siempre a mano (personas con cuenta y ligas) y la pestaña Social.

Migraciones: `supabase/migrations/20261009000100_red_social.sql` (todo) y `20261009000110_red_social_supabase.sql`
(los buckets de Storage y sus políticas; el modo local no la carga).

## Quién ve qué

Solo cuentas con sesión (las RPC son de `authenticated`). Una publicación de A la ve V cuando:

- A no está bloqueada por el superadmin (`profiles.blocked_at`), y ni A bloqueó a V ni V a A (`user_blocks`).
- Según `visibility`:
  - `public`: cualquiera.
  - `followers`: V es A o V sigue a A.
  - `league`: V es miembro de la liga.
- Si tiene liga: la liga no tiene menores (`has_minors`: lo social de esa liga está apagado) y, si la liga ya no es
  pública, una publicación `public` de esa liga se trata como `league` (solo miembros).
- El superadmin ve todo.

Publicar en una liga: solo miembros, liga sin menores. En una liga pública se puede elegir `public` (la ven todos y
sale a quien sigue la liga) o `league` (solo miembros); en una privada, solo `league`. `followers` no lleva liga.

## Tablas (todas con RLS y sin lectura directa: se leen por RPC)

- `posts (id uuid pk, author_id → profiles cascade, text ≤ 1000 (puede ser '' si hay foto), photo_path unique null,
  photo_w, photo_h, league_id → leagues cascade null, sport null, visibility, likes int, comments int, created_at,
  updated_at)`. Texto o foto, al menos uno.
- `post_likes (post_id, user_id, created_at)`, pk (post_id, user_id).
- `post_comments (id, post_id → posts cascade, author_id, text 1–500, created_at)`.
- `league_follows (league_id, user_id, created_at)`, pk (league_id, user_id).
- `user_blocks (blocker_id, blocked_id, created_at)`, pk (blocker_id, blocked_id), distintos.
- `profiles.bio` (≤ 160) y `profiles.avatar_path`.

## Fotos (Storage)

- `avatars` (pública, 256 KB, webp/jpeg): `<uid>/<uuid>.webp|jpg`.
- `posts` (pública, 512 KB, webp/jpeg): `<uid>/<post_id>.webp|jpg`.
- Subir: solo dentro de tu carpeta (`<uid>/…`) y con la cuenta sin bloquear. La foto se sube antes y la RPC la
  enlaza; la ruta tiene que ser exactamente la tuya. Las rutas son uuid: públicas pero no se adivinan.
- Al borrar una publicación, cambiar la foto de perfil o borrar la cuenta, el archivo va a
  `private.storage_purge_queue` y lo borra `purge-photos`.

## Formas (JSON)

```ts
type PersonLite = { id: string; name: string; username: string | null; avatar: string | null }; // avatar = ruta en 'avatars'
type Post = {
  id: string; author: PersonLite; text: string;
  photo: { path: string; w: number | null; h: number | null } | null;   // ruta en 'posts'
  league: { id: string; name: string; sport: string } | null;
  sport: string | null; visibility: 'public' | 'followers' | 'league';
  at: string; likes: number; likedByMe: boolean; comments: number; isMine: boolean; canDelete: boolean;
};
type PostComment = { id: string; postId: string; author: PersonLite; text: string; at: string; isMine: boolean; canDelete: boolean };
type LeagueHit = {
  id: string; name: string; sport: string; kind: 'liga' | 'torneo'; visibility: 'public' | 'private';
  venue: string | null; logo: string | null; members: number; followers: number; isMember: boolean; isFollowing: boolean;
};
```

`canDelete` de una publicación: su autor, el superadmin o un admin de su liga. De un comentario: además, el autor de la
publicación.

## RPC

| RPC | Devuelve | Notas |
| --- | --- | --- |
| `create_post(p_id uuid, p_text text default '', p_photo text default null, p_photo_w integer default null, p_photo_h integer default null, p_league uuid default null, p_visibility text default 'public', p_sport text default null)` | `Post` | Mismo `p_id` otra vez (reintento de la cola) devuelve la que ya está. 10 por hora y 40 por día. Palabras prohibidas: `palabras`. |
| `delete_post(p_post uuid)` | `boolean` | |
| `set_post_like(p_post uuid, p_liked boolean)` | `{ likes, liked }` | 300 por hora (`social_pace('like')`). Aviso al autor (6 h por publicación). |
| `post_detail(p_post uuid)` | `Post \| null` | null si no existe o no la puede ver. |
| `post_comments(p_post uuid, p_limit integer default 50, p_after timestamptz default null, p_after_id uuid default null)` | `PostComment[]` | Del más viejo al más nuevo. |
| `add_post_comment(p_post uuid, p_text text, p_id uuid default null)` | `PostComment` | Uno cada 3 s y 120 por hora. Aviso al autor (30 min por publicación). |
| `delete_post_comment(p_comment uuid)` | `boolean` | |
| `social_feed(p_scope text default 'following', p_limit integer default 20, p_before timestamptz default null, p_before_id uuid default null)` | `Post[]` | `following`: las mías, las de quien sigo y las de mis ligas y las ligas que sigo. `discover`: las públicas de todos. |
| `user_posts(p_user uuid, p_limit integer default 20, p_before timestamptz default null, p_before_id uuid default null)` | `Post[]` | Las que el que mira puede ver. |
| `league_posts(p_league uuid, p_limit integer default 20, p_before timestamptz default null, p_before_id uuid default null)` | `Post[]` | |
| `league_social(p_league uuid)` | `{ following, followers, isMember, canPost, canFollow }` | `canFollow`: liga pública sin menores y no soy miembro. |
| `follow_league(p_league uuid)` / `unfollow_league(p_league uuid)` | `{ following, followers }` | 60 por hora. |
| `followed_leagues(p_limit integer default 50)` | `LeagueHit[]` | |
| `search_leagues(p_query text, p_limit integer default 20)` | `LeagueHit[]` | Mis ligas (cualquiera) y las públicas sin menores; nombre o lugar, sin acentos, al menos 2 letras. |
| `set_bio(p_bio text)` | `text \| null` | ≤ 160, palabras prohibidas: `palabras`. |
| `set_avatar(p_path text)` | `{ avatar }` | null la quita. 20 por día. |
| `block_user(p_user uuid)` / `unblock_user(p_user uuid)` | `{ blocked }` | Bloquear deja de seguirse en las dos direcciones. |
| `my_blocked_users()` | `(PersonLite & { at })[]` | |

Cambian:

- `public_profile`: suma `bio`, `avatar`, `posts` (las que puede ver el que mira) y `blockedByMe`; null si esa persona
  bloqueó al que mira.
- `search_people` y `follow_list` (`private.people_item`): suman `avatar`; la búsqueda no muestra a quien bloqueaste ni
  a quien te bloqueó.
- `follow_user`: no deja seguir con un bloqueo de por medio.
- `social_notices`: suma `{ kind: 'post_like', at, userId, name, postId }` y
  `{ kind: 'post_comment', at, userId, name, postId, text }` (texto recortado a 80).
- Reportes: `post` y `post_comment` como tipos nuevos.
- Tiempo real: `user:<autor>` recibe `post_like` y `post_comment`.
