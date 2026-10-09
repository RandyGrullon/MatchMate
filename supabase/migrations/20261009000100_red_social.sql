-- MatchMate · Red social: publicaciones (texto y una foto), comentarios, «me gusta» en publicaciones, foto de perfil y
-- biografía, seguir ligas, bloquear personas y buscar ligas. Contrato completo: docs/red-social.md.
--
-- 1. Tablas (todas con RLS y sin lectura directa: se leen por RPC): public.posts, public.post_likes,
--    public.post_comments, public.league_follows, public.user_blocks; profiles.bio (≤ 160) y profiles.avatar_path. Las
--    publicaciones borradas con delete_post quedan en private.posts_deleted (90 días): un reintento viejo de create_post
--    con ese id no la revive ('no_existe'). Los contadores posts.likes / posts.comments los llevan triggers (también
--    cuando una cuenta se borra y se van sus me gusta y comentarios en cascada).
-- 2. Quién ve una publicación (private.can_see_post): el superadmin, todas; si no, su autor no está bloqueado por el
--    superadmin, no hay bloqueo entre las dos cuentas (user_blocks, en cualquier dirección) y: 'public' cualquiera,
--    'followers' el autor o quien lo sigue, 'league' los miembros. Con liga: la liga sin menores y, si ya no es pública,
--    una 'public' de esa liga es solo para sus miembros (en el JSON sale como 'league').
-- 3. RPC nuevas (solo con sesión, pasan por private.require_uid): create_post, delete_post, set_post_like, post_detail,
--    post_comments, add_post_comment, delete_post_comment, social_feed, user_posts, league_posts, league_social,
--    follow_league, unfollow_league, followed_leagues, search_leagues, set_bio, set_avatar, block_user, unblock_user y
--    my_blocked_users. Palabras prohibidas (private.blocked_terms) en publicaciones, comentarios y biografía: 'palabras'
--    (P0001, como private.fail). Páginas de hasta 50, por (created_at, id); las horas se guardan en milisegundos para
--    que el cursor vuelva exacto desde el texto ISO.
-- 4. Avisos: push al autor por me gusta ('reaccion:post:<id>', cada 6 h juntos) y comentarios ('comentario:post:<id>',
--    cada 30 min), categoría 'social' (private.push_category ya mapea esos prefijos); nunca a uno mismo. Tiempo real:
--    'user:<autor>' recibe 'post_like' {op, postId, userId} y 'post_comment' {op, postId, commentId, userId}.
-- 5. Fotos (buckets públicos 'avatars' y 'posts' de 20261009000110_red_social_supabase.sql): '<uid>/<uuid>.webp|jpg' y
--    '<uid>/<post>.webp|jpg'. La foto que deja de usarse (publicación borrada, también por la liga o la cuenta; foto de
--    perfil cambiada, quitada o de una cuenta borrada) va a private.storage_purge_queue con su bucket y la borra
--    purge-photos (purge_queue_take / purge_queue_done aceptan 'avatars' y 'posts').
--
-- Redefine (create or replace, desde su última versión): public.public_profile (20260929001000_sueltos_logos.sql: bio,
-- avatar, posts, blockedByMe; null si esa cuenta bloqueó a la que mira), private.people_item
-- (20260929001400_anotadores.sql: avatar), public.search_people (20260929000200_invitaciones.sql: sin bloqueos en
-- ninguna dirección), public.follow_list (20260929000200_invitaciones.sql: avatar; vacía si esa cuenta bloqueó a la que
-- mira), public.follow_user (20260928000200_social.sql: no con un bloqueo de por medio), public.social_notices
-- (20260929001000_sueltos_logos.sql: post_like y post_comment), los reportes de 20260929000900_legal.sql (tipos 'post' y
-- 'post_comment': el check de reports.target_kind, la política reports_read, private.report_kind_label,
-- private.report_target, report_content, resolve_report y list_reports), public.export_my_data
-- (20261008000100_esports.sql: bio, avatarPath, posts y postComments), public.purge_queue_take
-- (20261008000100_esports.sql) y public.purge_queue_done (20260929001000_sueltos_logos.sql).

-- =====================================================================
-- 1. Tablas
-- =====================================================================

alter table public.profiles
  add column bio text check (bio is null or char_length(bio) between 1 and 160),
  add column avatar_path text
    check (avatar_path is null
           or avatar_path ~ ('^' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'));

-- Publicaciones. text puede ser '' si hay foto. photo_path: '<autor>/<id>.webp|jpg' en el bucket 'posts'. sport: el de la
-- liga (si tiene) o el que eligió el autor. 'followers' no lleva liga; 'league' sí.
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  text text not null default '' check (char_length(text) <= 1000),
  photo_path text unique check (photo_path is null or photo_path ~ ('^' || author_id::text || '/' || id::text || '\.(webp|jpg)$')),
  photo_w integer check (photo_w is null or photo_w between 1 and 10000),
  photo_h integer check (photo_h is null or photo_h between 1 and 10000),
  league_id uuid references public.leagues (id) on delete cascade,
  sport text check (sport is null or sport ~ '^[a-z_]{2,20}$'),
  visibility text not null default 'public' check (visibility in ('public', 'followers', 'league')),
  likes integer not null default 0 check (likes >= 0),
  comments integer not null default 0 check (comments >= 0),
  created_at timestamptz not null default date_trunc('milliseconds', now()),
  updated_at timestamptz not null default now(),
  check (text <> '' or photo_path is not null),
  check (visibility <> 'followers' or league_id is null),
  check (visibility <> 'league' or league_id is not null)
);
create index posts_author_idx on public.posts (author_id, created_at desc, id desc);
create index posts_league_idx on public.posts (league_id, created_at desc, id desc) where league_id is not null;
create index posts_public_idx on public.posts (created_at desc, id desc) where visibility = 'public';
create index posts_feed_idx on public.posts (created_at desc, id desc);

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_likes_user_idx on public.post_likes (user_id);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  created_at timestamptz not null default date_trunc('milliseconds', now())
);
create index post_comments_post_idx on public.post_comments (post_id, created_at, id);
create index post_comments_author_idx on public.post_comments (author_id);

create table public.league_follows (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index league_follows_user_idx on public.league_follows (user_id, created_at desc);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- Publicaciones borradas con delete_post (el id y de quién era): create_post no las vuelve a crear. Se van con la cuenta
-- y a los 90 días.
create table private.posts_deleted (
  id uuid primary key,
  author_id uuid not null references public.profiles (id) on delete cascade,
  deleted_at timestamptz not null default now()
);
create index posts_deleted_author_idx on private.posts_deleted (author_id);
create index posts_deleted_at_idx on private.posts_deleted (deleted_at);

alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.league_follows enable row level security;
alter table public.user_blocks enable row level security;
revoke all on public.posts, public.post_likes, public.post_comments, public.league_follows, public.user_blocks
  from public, anon, authenticated;
revoke all on private.posts_deleted from public, anon, authenticated;

-- La cola de Storage lleva también las fotos de perfil y las de las publicaciones.
do $$
declare
  c record;
begin
  for c in select x.conname from pg_constraint x
            where x.conrelid = 'private.storage_purge_queue'::regclass and x.contype = 'c'
              and pg_get_constraintdef(x.oid) like '%bucket%' loop
    execute format('alter table private.storage_purge_queue drop constraint %I', c.conname);
  end loop;
end $$;
alter table private.storage_purge_queue add constraint storage_purge_queue_bucket_check
  check (bucket in ('scoreboards', 'logos', 'avatars', 'posts'));

-- =====================================================================
-- 2. Ayudas
-- =====================================================================

-- ¿Hay un bloqueo entre estas dos cuentas (cualquiera de las dos bloqueó a la otra)?
create function private.blocked_between(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_blocks b
                  where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a))
$$;

-- Texto libre de varias líneas como lo guarda la base (igual que cleanPostText del teléfono): saltos de línea \n, sin
-- caracteres de control (salvo tab y salto), sin espacios antes de un salto, a lo más una línea en blanco seguida y sin
-- espacios alrededor.
create function private.social_clean_text(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(replace(replace(coalesce(p, ''), E'\r\n', E'\n'), E'\r', E'\n'), '[\x01-\x08\x0b-\x1f\x7f]', '', 'g'),
               '[ \t]+\n', E'\n', 'g'),
             '\n{3,}', E'\n\n', 'g'),
           '^\s+|\s+$', '', 'g')
$$;

-- ¿Se puede publicar este texto? Solo mira las palabras bloqueadas (private.blocked_terms) después de normalizar
-- (private.badge_fold): emoji, saltos de línea, enlaces y números sí pasan. whole = false: dentro de cualquier palabra
-- («comemierda»); true: solo la palabra entera o su plural («disputa» pasa). Como el texto es largo, no se junta entero
-- (badge_text_ok sí: «hijo de Rafael» tendría «joder»): se juntan solo las letras sueltas seguidas («p u t a», «p.u.t.a»)
-- y, para las enteras, también el texto entero sin separadores («pu-ta»).
create function private.social_text_ok(p_text text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fold text := private.badge_fold(p_text);
  v_joined text;
  v_words text[];
  v_cands text[] := '{}';
  v_run text := '';
  w text;
begin
  if v_fold = '' then
    return true;
  end if;
  v_joined := replace(v_fold, ' ', '');
  v_words := string_to_array(v_fold, ' ');
  foreach w in array v_words loop
    if char_length(w) = 1 then
      v_run := v_run || w;
    else
      if char_length(v_run) >= 2 then
        v_cands := v_cands || v_run;
      end if;
      v_run := '';
    end if;
  end loop;
  if char_length(v_run) >= 2 then
    v_cands := v_cands || v_run;
  end if;
  v_cands := v_cands || v_words;
  return not exists (
    select 1 from private.blocked_terms t
     where (not t.whole and exists (select 1 from unnest(v_cands) c where strpos(c, t.term) > 0))
        or (t.whole and (t.term = any (v_cands) or t.term || 's' = any (v_cands) or t.term || 'es' = any (v_cands)
                         or v_joined = t.term)));
end $$;

-- Lo primero de un texto en una línea, para un aviso: hasta p_max letras (con … si sigue).
create function private.social_snippet(p text, p_max integer default 80) returns text
language sql immutable set search_path = '' as $$
  select case when char_length(x.t) > p_max then rtrim(left(x.t, p_max)) || '…' else x.t end
    from (select btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')) as t) x
$$;

-- Una cuenta como sale en una publicación, un comentario o una lista: {id, name, username, avatar}.
create function private.person_lite(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', x.id, 'name', x.name, 'username', x.username, 'avatar', x.avatar_path)
    from public.profiles x where x.id = p_user
$$;

-- ¿La cuenta de la sesión ve esta publicación? Ver el encabezado (2).
create function private.can_see_post(p_author uuid, p_league uuid, p_visibility text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_super())
      or ((select auth.uid()) is not null
          and not private.is_blocked(p_author)
          and not private.blocked_between((select auth.uid()), p_author)
          and case
                when p_league is null then
                  p_visibility = 'public'
                  or (p_visibility = 'followers'
                      and (p_author = (select auth.uid())
                           or exists (select 1 from public.follows f
                                       where f.follower_id = (select auth.uid()) and f.followee_id = p_author)))
                else exists (select 1 from public.leagues l
                              where l.id = p_league and not l.has_minors
                                and ((p_visibility = 'public' and l.visibility = 'public') or private.is_member(l.id)))
              end)
$$;

-- Una publicación en JSON (camelCase) para la cuenta de la sesión (el Post de docs/red-social.md).
create function private.post_json(p public.posts) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'author', private.person_lite(p.author_id),
    'text', p.text,
    'photo', case when p.photo_path is null then null
                  else jsonb_build_object('path', p.photo_path, 'w', p.photo_w, 'h', p.photo_h) end,
    'league', (select jsonb_build_object('id', l.id, 'name', l.name, 'sport', l.sport) from public.leagues l where l.id = p.league_id),
    'sport', p.sport,
    'visibility', case when p.visibility = 'public' and p.league_id is not null
                            and not exists (select 1 from public.leagues l where l.id = p.league_id and l.visibility = 'public')
                       then 'league' else p.visibility end,
    'at', private.iso(p.created_at),
    'likes', p.likes,
    'likedByMe', exists (select 1 from public.post_likes k where k.post_id = p.id and k.user_id = (select auth.uid())),
    'comments', p.comments,
    'isMine', p.author_id = (select auth.uid()),
    'canDelete', p.author_id = (select auth.uid()) or (select private.is_super())
                 or (p.league_id is not null and private.is_admin(p.league_id)))
$$;

-- Un comentario en JSON (el PostComment de docs/red-social.md). Lo borra su autor, el de la publicación, un admin de la
-- liga de la publicación o el superadmin.
create function private.post_comment_json(c public.post_comments, p public.posts) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id,
    'postId', c.post_id,
    'author', private.person_lite(c.author_id),
    'text', c.text,
    'at', private.iso(c.created_at),
    'isMine', c.author_id = (select auth.uid()),
    'canDelete', c.author_id = (select auth.uid()) or p.author_id = (select auth.uid()) or (select private.is_super())
                 or (p.league_id is not null and private.is_admin(p.league_id)))
$$;

-- Una liga en la búsqueda o en las que sigo (el LeagueHit de docs/red-social.md).
create function private.league_hit(l public.leagues) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', l.id,
    'name', l.name,
    'sport', l.sport,
    'kind', l.kind,
    'visibility', l.visibility,
    'venue', nullif(btrim(l.venue), ''),
    'logo', l.logo_path,
    'members', (select count(*) from public.league_members m where m.league_id = l.id)::integer,
    'followers', (select count(*) from public.league_follows f where f.league_id = l.id)::integer,
    'isMember', exists (select 1 from public.league_members m where m.league_id = l.id and m.user_id = (select auth.uid())),
    'isFollowing', exists (select 1 from public.league_follows f where f.league_id = l.id and f.user_id = (select auth.uid())))
$$;

-- El texto del aviso al autor: lo primero de su publicación o, si es solo foto, «Toca para verla.».
create function private.post_push_body(p public.posts) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(private.social_snippet(p.text, 80), ''), 'Toca para verla.')
$$;

-- ---------- Triggers ----------

-- Contadores de la publicación (también con los borrados en cascada de una cuenta). Al borrar la publicación, sus me
-- gusta y comentarios se van con ella y la fila ya no está: no pasa nada.
create function private.post_likes_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.posts x set likes = x.likes + 1 where x.id = new.post_id;
  else
    update public.posts x set likes = greatest(x.likes - 1, 0) where x.id = old.post_id;
  end if;
  return null;
end $$;

create trigger post_likes_count after insert or delete on public.post_likes
  for each row execute function private.post_likes_count();

create function private.post_comments_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.posts x set comments = x.comments + 1 where x.id = new.post_id;
  else
    update public.posts x set comments = greatest(x.comments - 1, 0) where x.id = old.post_id;
  end if;
  return null;
end $$;

create trigger post_comments_count after insert or delete on public.post_comments
  for each row execute function private.post_comments_count();

-- La foto de una publicación borrada (con delete_post, con su liga o con la cuenta) va a la cola de Storage.
create function private.queue_post_photo_purge() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.photo_path is not null and (tg_op = 'DELETE' or new.photo_path is distinct from old.photo_path) then
    insert into private.storage_purge_queue (path, bucket) values (old.photo_path, 'posts') on conflict (path) do nothing;
  end if;
  return null;
end $$;

create trigger posts_photo_purge after update of photo_path or delete on public.posts
  for each row execute function private.queue_post_photo_purge();

-- La foto de perfil que deja de usarse (cambiada, quitada o de una cuenta borrada) va a la cola de Storage.
create function private.queue_avatar_purge() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.avatar_path is not null and (tg_op = 'DELETE' or new.avatar_path is distinct from old.avatar_path) then
    insert into private.storage_purge_queue (path, bucket) values (old.avatar_path, 'avatars') on conflict (path) do nothing;
  end if;
  return null;
end $$;

create trigger profiles_avatar_purge after update of avatar_path or delete on public.profiles
  for each row execute function private.queue_avatar_purge();

-- =====================================================================
-- 3. Publicaciones
-- =====================================================================

-- Publica. p_id lo pone el teléfono: el mismo p_id otra vez (reintento) devuelve la que ya está si es mía
-- ('duplicado' si es de otra cuenta; 'no_existe' si la borré). Texto (limpio, ≤ 1000) o foto, al menos uno. p_photo:
-- exactamente '<yo>/<p_id>.webp' o '.jpg' (ya subida al bucket 'posts'); p_photo_w / p_photo_h de 1 a 10000. Con liga:
-- miembro y liga sin menores ('no_permitido'); en una pública 'public' o 'league', en una privada solo 'league'; el
-- deporte es el de la liga. Sin liga: 'public' o 'followers' y p_sport null o '^[a-z_]{2,20}$'. 'invalido',
-- 'palabras', 'rate_limited' (10 por hora y 40 por día). Devuelve el Post.
create function public.create_post(p_id uuid, p_text text default '', p_photo text default null, p_photo_w integer default null,
                                   p_photo_h integer default null, p_league uuid default null, p_visibility text default 'public',
                                   p_sport text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_text text := private.social_clean_text(p_text);
  v_photo text := nullif(btrim(coalesce(p_photo, '')), '');
  v_vis text := lower(btrim(coalesce(p_visibility, 'public')));
  v_sport text := nullif(lower(btrim(coalesce(p_sport, ''))), '');
  v_author uuid;
  v_league public.leagues;
  v_post public.posts;
begin
  if p_id is null then
    perform private.fail('invalido');
  end if;
  -- Reintento de la cola: la que ya está.
  select x.author_id into v_author from public.posts x where x.id = p_id;
  if v_author is not null then
    if v_author <> v_me then
      perform private.fail('duplicado');
    end if;
    select * into v_post from public.posts x where x.id = p_id;
    return private.post_json(v_post);
  end if;
  if exists (select 1 from private.posts_deleted d where d.id = p_id) then
    perform private.fail('no_existe');
  end if;

  if char_length(v_text) > 1000 or (v_text = '' and v_photo is null) or v_vis not in ('public', 'followers', 'league') then
    perform private.fail('invalido');
  end if;
  if v_photo is not null then
    if v_photo not in (v_me::text || '/' || p_id::text || '.webp', v_me::text || '/' || p_id::text || '.jpg')
       or (p_photo_w is not null and p_photo_w not between 1 and 10000)
       or (p_photo_h is not null and p_photo_h not between 1 and 10000)
       or exists (select 1 from private.storage_purge_queue q where q.path = v_photo) then
      perform private.fail('invalido');
    end if;
  end if;
  if p_league is not null then
    select * into v_league from public.leagues x where x.id = p_league;
    if v_league.id is null then
      perform private.fail('no_existe');
    end if;
    if v_league.has_minors or not private.is_member(v_league.id) then
      perform private.deny();
    end if;
    if v_vis = 'followers' or (v_league.visibility <> 'public' and v_vis <> 'league') then
      perform private.fail('invalido');
    end if;
    v_sport := v_league.sport;
  else
    if v_vis = 'league' or (v_sport is not null and v_sport !~ '^[a-z_]{2,20}$') then
      perform private.fail('invalido');
    end if;
  end if;
  if not private.social_text_ok(v_text) then
    perform private.fail('palabras');
  end if;
  if not private.rate_take('post:h:' || v_me::text, 10, interval '1 hour')
     or not private.rate_take('post:d:' || v_me::text, 40, interval '1 day') then
    perform private.fail('rate_limited');
  end if;

  insert into public.posts (id, author_id, text, photo_path, photo_w, photo_h, league_id, sport, visibility)
  values (p_id, v_me, v_text, v_photo,
          case when v_photo is not null then p_photo_w end, case when v_photo is not null then p_photo_h end,
          p_league, v_sport, v_vis)
  on conflict (id) do nothing
  returning * into v_post;
  if v_post.id is null then
    -- Dos reintentos a la vez: el otro ya la guardó.
    select * into v_post from public.posts x where x.id = p_id;
    if v_post.author_id is distinct from v_me then
      perform private.fail('duplicado');
    end if;
  end if;
  return private.post_json(v_post);
end $$;

-- Borra una publicación (con sus me gusta y comentarios; la foto va a la cola de Storage): su autor, un admin de su liga
-- o el superadmin ('no_permitido'). false si ya no existe. El id queda en private.posts_deleted (no se vuelve a crear).
create function public.delete_post(p_post uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_post public.posts;
  v_admin boolean;
begin
  select * into v_post from public.posts x where x.id = p_post for update;
  if v_post.id is null then
    return false;
  end if;
  v_admin := private.is_super() or (v_post.league_id is not null and private.is_admin(v_post.league_id));
  if v_post.author_id <> v_me and not v_admin then
    perform private.deny();
  end if;
  insert into private.posts_deleted (id, author_id) values (v_post.id, v_post.author_id) on conflict (id) do nothing;
  delete from private.posts_deleted d where d.deleted_at < now() - interval '90 days';
  delete from public.posts x where x.id = v_post.id;
  -- El superadmin borrando lo de otra cuenta (fuera de las ligas que administra): queda en la auditoría.
  if v_post.author_id <> v_me and private.is_super()
     and not (v_post.league_id is not null and coalesce(private.member_role(v_post.league_id) in ('owner', 'admin'), false)) then
    perform private.audit('delete_post', 'user', v_post.author_id::text,
                          jsonb_build_object('postId', v_post.id, 'leagueId', v_post.league_id));
  end if;
  return true;
end $$;

-- Me gusta (true) o quitarlo (false). Dar me gusta exige ver la publicación ('no_existe'); quitarlo, solo que exista.
-- 300 cambios por hora (los mismos de set_game_like). Aviso al autor (juntos, cada 6 h por publicación) y tiempo real.
-- Devuelve {likes, liked}.
create function public.set_post_like(p_post uuid, p_liked boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_post public.posts;
  v_changed boolean := false;
  v_tag text;
  v_n integer;
  v_title text;
begin
  if p_post is null or p_liked is null then
    perform private.fail('invalido');
  end if;
  select * into v_post from public.posts x where x.id = p_post;
  if v_post.id is null then
    perform private.fail('no_existe');
  end if;

  if p_liked then
    if not private.can_see_post(v_post.author_id, v_post.league_id, v_post.visibility) then
      perform private.fail('no_existe');
    end if;
    if not exists (select 1 from public.post_likes k where k.post_id = p_post and k.user_id = v_me) then
      perform private.social_pace('like', 300);
      insert into public.post_likes (post_id, user_id) values (p_post, v_me) on conflict do nothing;
      v_changed := found;
    end if;
  else
    delete from public.post_likes k where k.post_id = p_post and k.user_id = v_me;
    v_changed := found;
  end if;

  if v_changed and v_post.author_id <> v_me then
    perform private.emit('user:' || v_post.author_id::text, 'post_like',
                         jsonb_build_object('op', case when p_liked then 'insert' else 'delete' end, 'postId', p_post, 'userId', v_me));
    if p_liked then
      begin
        v_tag := 'reaccion:post:' || p_post::text;
        if private.push_due(v_post.author_id, v_tag, interval '6 hours') then
          v_n := (select count(*) from public.post_likes k where k.post_id = p_post and k.user_id <> v_post.author_id)::integer;
          v_title := 'A ' || private.push_who((select x.name from public.profiles x where x.id = v_me), v_n)
                     || case when v_n > 1 then ' les gustó tu publicación' else ' le gustó tu publicación' end;
          perform private.queue_push(v_post.author_id, 'social', v_title, private.post_push_body(v_post), '/p/' || p_post::text,
                                     v_tag, 86400, v_title);
        end if;
      exception when others then
        raise warning 'push del me gusta de la publicación %: %', p_post, sqlerrm;
      end;
    end if;
  end if;

  return jsonb_build_object(
    'likes', (select x.likes from public.posts x where x.id = p_post),
    'liked', exists (select 1 from public.post_likes k where k.post_id = p_post and k.user_id = v_me));
end $$;

-- Una publicación (Post) o null si no existe o no se ve.
create function public.post_detail(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_post public.posts;
begin
  select * into v_post from public.posts x where x.id = p_post;
  if v_post.id is null or not private.can_see_post(v_post.author_id, v_post.league_id, v_post.visibility) then
    return null;
  end if;
  return private.post_json(v_post);
end $$;

-- Comentarios de una publicación que se ve, del más viejo al más nuevo (hasta 50; página siguiente: los de después de
-- (p_after, p_after_id)). Sin los de cuentas bloqueadas por el superadmin ni los de un bloqueo con quien mira (el
-- superadmin ve todos). [] si la publicación no existe o no se ve.
create function public.post_comments(p_post uuid, p_limit integer default 50, p_after timestamptz default null,
                                     p_after_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_limit integer := private.clamp_int(p_limit, 1, 50, 50);
  v_super boolean := private.is_super();
  v_post public.posts;
begin
  select * into v_post from public.posts x where x.id = p_post;
  if v_post.id is null or not private.can_see_post(v_post.author_id, v_post.league_id, v_post.visibility) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(private.post_comment_json(z.c, v_post) order by z.at, z.id)
      from (select c, c.created_at as at, c.id
              from public.post_comments c
              join public.profiles a on a.id = c.author_id
             where c.post_id = v_post.id
               and (v_super or (a.blocked_at is null and not private.blocked_between(v_me, c.author_id)))
               and (p_after is null
                    or (c.created_at, c.id) > (p_after, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
             order by c.created_at, c.id
             limit v_limit) z), '[]'::jsonb);
end $$;

-- Comenta una publicación que se ve ('no_existe'; con un bloqueo entre las dos cuentas, 'no_permitido'). Texto limpio de
-- 1 a 500 ('invalido'), sin palabras prohibidas ('palabras'). Uno cada 3 s y 120 por hora ('rate_limited'). p_id lo
-- puede poner el teléfono: el mismo otra vez devuelve el que ya está (si es mío y de esa publicación; si no,
-- 'duplicado'). Aviso al autor (el último comentario, cada 30 min por publicación) y tiempo real. Devuelve el PostComment.
create function public.add_post_comment(p_post uuid, p_text text, p_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_text text := private.social_clean_text(p_text);
  v_post public.posts;
  v_comment public.post_comments;
  v_tag text;
  v_title text;
begin
  if p_post is null then
    perform private.fail('invalido');
  end if;
  if p_id is not null then
    select * into v_comment from public.post_comments c where c.id = p_id;
    if v_comment.id is not null then
      if v_comment.author_id <> v_me or v_comment.post_id <> p_post then
        perform private.fail('duplicado');
      end if;
      select * into v_post from public.posts x where x.id = v_comment.post_id;
      return private.post_comment_json(v_comment, v_post);
    end if;
  end if;
  if char_length(v_text) not between 1 and 500 then
    perform private.fail('invalido');
  end if;
  select * into v_post from public.posts x where x.id = p_post;
  if v_post.id is null then
    perform private.fail('no_existe');
  end if;
  if private.blocked_between(v_me, v_post.author_id) then
    perform private.deny();
  end if;
  if not private.can_see_post(v_post.author_id, v_post.league_id, v_post.visibility) then
    perform private.fail('no_existe');
  end if;
  if not private.social_text_ok(v_text) then
    perform private.fail('palabras');
  end if;
  if not private.rate_take('post_comment:s:' || v_me::text, 1, interval '3 seconds')
     or not private.rate_take('post_comment:h:' || v_me::text, 120, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;

  insert into public.post_comments (id, post_id, author_id, text)
  values (coalesce(p_id, gen_random_uuid()), v_post.id, v_me, v_text)
  returning * into v_comment;
  select * into v_post from public.posts x where x.id = p_post;

  if v_post.author_id <> v_me then
    perform private.emit('user:' || v_post.author_id::text, 'post_comment',
                         jsonb_build_object('op', 'insert', 'postId', v_post.id, 'commentId', v_comment.id, 'userId', v_me));
    begin
      v_tag := 'comentario:post:' || v_post.id::text;
      if private.push_due(v_post.author_id, v_tag, interval '30 minutes') then
        v_title := private.push_who((select x.name from public.profiles x where x.id = v_me), 1) || ' comentó tu publicación: «'
                   || private.social_snippet(v_text, 80) || '»';
        perform private.queue_push(v_post.author_id, 'social', v_title, private.post_push_body(v_post), '/p/' || v_post.id::text,
                                   v_tag, 86400, v_title);
      end if;
    exception when others then
      raise warning 'push del comentario de la publicación %: %', v_post.id, sqlerrm;
    end;
  end if;
  return private.post_comment_json(v_comment, v_post);
end $$;

-- Borra un comentario: su autor, el de la publicación, un admin de la liga de la publicación o el superadmin
-- ('no_permitido'). false si ya no existe.
create function public.delete_post_comment(p_comment uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_comment public.post_comments;
  v_post public.posts;
  v_admin boolean;
begin
  select * into v_comment from public.post_comments c where c.id = p_comment for update;
  if v_comment.id is null then
    return false;
  end if;
  select * into v_post from public.posts x where x.id = v_comment.post_id;
  v_admin := private.is_super() or (v_post.league_id is not null and private.is_admin(v_post.league_id));
  if v_comment.author_id <> v_me and v_post.author_id <> v_me and not v_admin then
    perform private.deny();
  end if;
  delete from public.post_comments c where c.id = p_comment;
  if v_post.author_id <> v_me then
    perform private.emit('user:' || v_post.author_id::text, 'post_comment',
                         jsonb_build_object('op', 'delete', 'postId', v_post.id, 'commentId', p_comment, 'userId', v_me));
  end if;
  if v_comment.author_id <> v_me and v_post.author_id <> v_me and private.is_super()
     and not (v_post.league_id is not null and coalesce(private.member_role(v_post.league_id) in ('owner', 'admin'), false)) then
    perform private.audit('delete_post_comment', 'user', v_comment.author_id::text,
                          jsonb_build_object('postId', v_post.id, 'commentId', p_comment, 'leagueId', v_post.league_id));
  end if;
  return true;
end $$;

-- El feed, más nuevo primero (hasta 50; página siguiente: las de antes de (p_before, p_before_id)). 'following': las
-- mías, las de quien sigo, las de mis ligas y las de las ligas que sigo; 'discover': las públicas de todos (sin liga o de
-- una liga pública sin menores). Siempre solo las que se ven. Otro p_scope: 'invalido'.
create function public.social_feed(p_scope text default 'following', p_limit integer default 20, p_before timestamptz default null,
                                   p_before_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_scope text := lower(btrim(coalesce(p_scope, 'following')));
  v_limit integer := private.clamp_int(p_limit, 1, 50, 20);
begin
  if v_scope not in ('following', 'discover') then
    perform private.fail('invalido');
  end if;
  return coalesce((
    select jsonb_agg(private.post_json(z.p) order by z.at desc, z.id desc)
      from (select x as p, x.created_at as at, x.id
              from public.posts x
             where case when v_scope = 'discover' then
                          x.visibility = 'public'
                          and (x.league_id is null
                               or exists (select 1 from public.leagues l
                                           where l.id = x.league_id and l.visibility = 'public' and not l.has_minors))
                        else
                          x.author_id = v_me
                          or x.author_id in (select f.followee_id from public.follows f where f.follower_id = v_me)
                          or x.league_id in (select m.league_id from public.league_members m where m.user_id = v_me)
                          or x.league_id in (select lf.league_id from public.league_follows lf where lf.user_id = v_me)
                   end
               and (p_before is null
                    or (x.created_at, x.id) < (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)))
               and private.can_see_post(x.author_id, x.league_id, x.visibility)
             order by x.created_at desc, x.id desc
             limit v_limit) z), '[]'::jsonb);
end $$;

-- Las publicaciones de una cuenta que la que mira puede ver, más nuevas primero (como social_feed).
create function public.user_posts(p_user uuid, p_limit integer default 20, p_before timestamptz default null,
                                  p_before_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_limit integer := private.clamp_int(p_limit, 1, 50, 20);
begin
  return coalesce((
    select jsonb_agg(private.post_json(z.p) order by z.at desc, z.id desc)
      from (select x as p, x.created_at as at, x.id
              from public.posts x
             where x.author_id = p_user
               and (p_before is null
                    or (x.created_at, x.id) < (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)))
               and private.can_see_post(x.author_id, x.league_id, x.visibility)
             order by x.created_at desc, x.id desc
             limit v_limit) z), '[]'::jsonb);
end $$;

-- El muro de una liga: sus publicaciones que la cuenta que mira puede ver, más nuevas primero (como social_feed).
create function public.league_posts(p_league uuid, p_limit integer default 20, p_before timestamptz default null,
                                    p_before_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_limit integer := private.clamp_int(p_limit, 1, 50, 20);
begin
  return coalesce((
    select jsonb_agg(private.post_json(z.p) order by z.at desc, z.id desc)
      from (select x as p, x.created_at as at, x.id
              from public.posts x
             where x.league_id = p_league
               and (p_before is null
                    or (x.created_at, x.id) < (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)))
               and private.can_see_post(x.author_id, x.league_id, x.visibility)
             order by x.created_at desc, x.id desc
             limit v_limit) z), '[]'::jsonb);
end $$;

-- =====================================================================
-- 4. Seguir ligas y buscar ligas
-- =====================================================================

-- Lo social de una liga para la cuenta de la sesión: {following, followers, isMember, canPost (miembro y sin menores),
-- canFollow (pública, sin menores y no soy miembro)}. null si no existe o no la ve (privada y no soy miembro).
create function public.league_social(p_league uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_league public.leagues;
  v_member boolean;
begin
  select * into v_league from public.leagues x where x.id = p_league;
  if v_league.id is null or not (v_league.visibility = 'public' or private.is_member(v_league.id) or private.is_super()) then
    return null;
  end if;
  v_member := private.is_member(v_league.id);
  return jsonb_build_object(
    'following', exists (select 1 from public.league_follows f where f.league_id = v_league.id and f.user_id = v_me),
    'followers', (select count(*) from public.league_follows f where f.league_id = v_league.id)::integer,
    'isMember', v_member,
    'canPost', v_member and not v_league.has_minors,
    'canFollow', v_league.visibility = 'public' and not v_league.has_minors and not v_member);
end $$;

-- Seguir una liga: pública, sin menores y sin ser miembro ('no_permitido'; 'no_existe' si no existe o no la ve).
-- Idempotente. 60 cambios por hora. Devuelve {following, followers}.
create function public.follow_league(p_league uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_league public.leagues;
begin
  select * into v_league from public.leagues x where x.id = p_league;
  if v_league.id is null or not (v_league.visibility = 'public' or private.is_member(v_league.id) or private.is_super()) then
    perform private.fail('no_existe');
  end if;
  if v_league.visibility <> 'public' or v_league.has_minors or private.is_member(v_league.id) then
    perform private.deny();
  end if;
  if not exists (select 1 from public.league_follows f where f.league_id = p_league and f.user_id = v_me) then
    perform private.social_pace('follow_league', 60);
    insert into public.league_follows (league_id, user_id) values (p_league, v_me) on conflict do nothing;
  end if;
  return jsonb_build_object('following', true,
                            'followers', (select count(*) from public.league_follows f where f.league_id = p_league)::integer);
end $$;

-- Dejar de seguir una liga. Idempotente (también si ya no la ve). 60 cambios por hora. Devuelve {following, followers}.
create function public.unfollow_league(p_league uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
begin
  if p_league is null then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from public.league_follows f where f.league_id = p_league and f.user_id = v_me) then
    perform private.social_pace('follow_league', 60);
    delete from public.league_follows f where f.league_id = p_league and f.user_id = v_me;
  end if;
  return jsonb_build_object('following', false,
                            'followers', (select count(*) from public.league_follows f where f.league_id = p_league)::integer);
end $$;

-- Las ligas que sigo (LeagueHit[]), la que seguí más reciente primero (hasta 50). Solo las que todavía veo (públicas sin
-- menores, o soy miembro).
create function public.followed_leagues(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_limit integer := private.clamp_int(p_limit, 1, 50, 50);
begin
  return coalesce((
    select jsonb_agg(private.league_hit(z.l) order by z.at desc, z.id desc)
      from (select l, f.created_at as at, l.id
              from public.league_follows f
              join public.leagues l on l.id = f.league_id
             where f.user_id = v_me
               and ((l.visibility = 'public' and not l.has_minors) or private.is_member(l.id))
             order by f.created_at desc, l.id desc
             limit v_limit) z), '[]'::jsonb);
end $$;

-- Buscar ligas (LeagueHit[], hasta 50): mis ligas (cualquiera) y las públicas sin menores, por nombre o lugar, sin
-- acentos y cada palabra en cualquier orden; menos de 2 letras o números: []. Primero las mías, luego las que empiezan así y el resto por nombre. 600
-- búsquedas por hora.
create function public.search_leagues(p_query text, p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_limit integer := private.clamp_int(p_limit, 1, 50, 20);
  v_q text := private.normalize_name(left(coalesce(p_query, ''), 60));
begin
  if char_length(v_q) < 2 then
    return '[]'::jsonb;
  end if;
  perform private.social_pace('search_leagues', 600);
  return coalesce((
    select jsonb_agg(private.league_hit(z.l) order by z.n)
      from (select l,
                   row_number() over (
                     order by (m.user_id is not null) desc,
                              private.normalize_name(l.name) like private.like_escape(v_q) || '%' desc,
                              l.name, l.id) as n
              from public.leagues l
              left join public.league_members m on m.league_id = l.id and m.user_id = v_me
             where (m.user_id is not null or (l.visibility = 'public' and not l.has_minors))
               -- Cada palabra en el nombre o el lugar, en cualquier orden («padel este» encuentra «Pádel del Este»).
               and not exists (
                 select 1 from unnest(string_to_array(v_q, ' ')) w(word)
                  where w.word <> ''
                    and private.normalize_name(l.name || ' ' || coalesce(l.venue, '')) not like '%' || private.like_escape(w.word) || '%')
             order by n
             limit v_limit) z), '[]'::jsonb);
end $$;

-- =====================================================================
-- 5. Perfil: biografía, foto y bloquear
-- =====================================================================

-- Cambia la biografía: una línea (los espacios y saltos seguidos quedan en un espacio), ≤ 160 ('invalido'), sin
-- palabras prohibidas ('palabras'). Vacía o null la quita. Devuelve cómo quedó (null sin biografía).
create function public.set_bio(p_bio text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v text := nullif(btrim(regexp_replace(regexp_replace(coalesce(p_bio, ''), '[\x01-\x08\x0e-\x1f\x7f]', '', 'g'), '\s+', ' ', 'g')), '');
begin
  if char_length(v) > 160 then
    perform private.fail('invalido');
  end if;
  if v is not null and not private.social_text_ok(v) then
    perform private.fail('palabras');
  end if;
  update public.profiles x set bio = v where x.id = v_me;
  return v;
end $$;

-- Pone la foto de perfil (p_path '<yo>/<uuid>.webp|jpg', ya subida al bucket 'avatars') o la quita (null). La anterior
-- va a la cola de Storage. 'invalido' (otra forma de ruta o una que ya está en la cola), 'rate_limited' (20 cambios por
-- día; la misma que ya tiene no cuenta). Devuelve {avatar}.
create function public.set_avatar(p_path text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_path text := nullif(btrim(coalesce(p_path, '')), '');
  v_old text;
begin
  if v_path is not null
     and v_path !~ ('^' || v_me::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$') then
    perform private.fail('invalido');
  end if;
  select x.avatar_path into v_old from public.profiles x where x.id = v_me for update;
  if v_path is not distinct from v_old then
    return jsonb_build_object('avatar', v_old);
  end if;
  if v_path is not null and exists (select 1 from private.storage_purge_queue q where q.path = v_path) then
    perform private.fail('invalido');
  end if;
  if not private.rate_take('avatar:' || v_me::text, 20, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  update public.profiles x set avatar_path = v_path where x.id = v_me;
  return jsonb_build_object('avatar', v_path);
end $$;

-- Bloquear a una cuenta: no se ven sus publicaciones ni comentarios (ni ella las mías), no se encuentran en la búsqueda,
-- no ve mi perfil y no se pueden seguir; deja de seguirse en las dos direcciones. Idempotente. 'invalido' (yo o null),
-- 'no_existe'. Devuelve {blocked: true}.
create function public.block_user(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
begin
  if p_user is null or p_user = v_me then
    perform private.fail('invalido');
  end if;
  if not exists (select 1 from public.profiles x where x.id = p_user) then
    perform private.fail('no_existe');
  end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (v_me, p_user) on conflict do nothing;
  delete from public.follows f
   where (f.follower_id = v_me and f.followee_id = p_user) or (f.follower_id = p_user and f.followee_id = v_me);
  return jsonb_build_object('blocked', true);
end $$;

-- Desbloquear (no vuelve a seguir a nadie). Idempotente. Devuelve {blocked: false}.
create function public.unblock_user(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
begin
  if p_user is null or p_user = v_me then
    perform private.fail('invalido');
  end if;
  delete from public.user_blocks b where b.blocker_id = v_me and b.blocked_id = p_user;
  return jsonb_build_object('blocked', false);
end $$;

-- Las cuentas que bloqueé, la más reciente primero (hasta 500): [{id, name, username, avatar, at}].
create function public.my_blocked_users() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
begin
  return coalesce((
    select jsonb_agg(private.person_lite(z.blocked_id) || jsonb_build_object('at', private.iso(z.created_at))
                     order by z.created_at desc, z.blocked_id desc)
      from (select b.blocked_id, b.created_at
              from public.user_blocks b join public.profiles x on x.id = b.blocked_id
             where b.blocker_id = v_me
             order by b.created_at desc, b.blocked_id desc
             limit 500) z), '[]'::jsonb);
end $$;

-- =====================================================================
-- 6. Redefinidas: perfil, personas, seguir y avisos
-- =====================================================================

-- Igual que en 20260929001000_sueltos_logos.sql y además bio, avatar, posts (las suyas que ve quien mira) y
-- blockedByMe. null también si esa cuenta bloqueó a la que mira (salvo al superadmin).
create or replace function public.public_profile(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_players uuid[];
  v_sports jsonb;
  pr public.profiles;
begin
  select * into pr from public.profiles p where p.id = p_user;
  if pr.id is null or not private.social_can_see(p_user) then
    return null;
  end if;
  if not private.is_super() and exists (select 1 from public.user_blocks b where b.blocker_id = p_user and b.blocked_id = v_me) then
    return null;
  end if;
  v_players := array(select sp.player_id from private.social_players(array[p_user], null) sp);
  select coalesce(jsonb_agg(s.id order by s.sort_order, s.id), '[]'::jsonb) into v_sports
    from public.sport_status s
   where s.id in (select sp.sport from private.social_players(array[p_user], null) sp)
      or (s.id = 'bowling' and exists (select 1 from public.solo_sessions x where x.user_id = p_user and x.shared));
  return jsonb_build_object(
    'id', pr.id,
    'name', pr.name,
    'username', pr.username,
    'since', private.iso(pr.created_at),
    'sports', v_sports,
    'followers', (select count(*) from public.follows f where f.followee_id = p_user)::integer,
    'following', (select count(*) from public.follows f where f.follower_id = p_user)::integer,
    'likesReceived', ((select count(*) from public.reactions r where r.player_id = any (v_players))
                      + (select count(*) from public.game_likes g where g.player_id = any (v_players))
                      + (select count(*) from public.solo_likes l join public.solo_sessions x on x.id = l.session_id
                          where x.user_id = p_user and x.shared))::integer,
    'gamesCount', (select count(*) from private.social_items(array[p_user], null, null, null, null))::integer,
    'isFollowing', exists (select 1 from public.follows f where f.follower_id = v_me and f.followee_id = p_user),
    'followsYou', exists (select 1 from public.follows f where f.follower_id = p_user and f.followee_id = v_me),
    'isMe', p_user = v_me,
    'bio', pr.bio,
    'avatar', pr.avatar_path,
    'posts', (select count(*) from public.posts x
               where x.author_id = p_user and private.can_see_post(x.author_id, x.league_id, x.visibility))::integer,
    'blockedByMe', exists (select 1 from public.user_blocks b where b.blocker_id = v_me and b.blocked_id = p_user));
end $$;

-- Igual que en 20260929001400_anotadores.sql y además 'avatar' (la ruta de su foto en el bucket 'avatars').
create or replace function private.people_item(p_user uuid, p_name text, p_username text, p_league uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p_user,
    'name', p_name,
    'username', p_username,
    'isFollowing', exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.followee_id = p_user),
    'followsYou', exists (select 1 from public.follows f where f.follower_id = p_user and f.followee_id = (select auth.uid())),
    'inLeague', p_league is not null
                and exists (select 1 from public.league_members m where m.league_id = p_league and m.user_id = p_user),
    'invited', p_league is not null
               and exists (select 1 from public.league_invites i
                            where i.league_id = p_league and i.user_id = p_user and i.status = 'pending'
                              and private.league_invite_valid(i)),
    'avatar', (select x.avatar_path from public.profiles x where x.id = p_user))
$$;

-- Igual que en 20260929000200_invitaciones.sql, y nunca las cuentas con un bloqueo con la mía (en ninguna dirección).
create or replace function public.search_people(p_query text default null, p_league uuid default null, p_limit integer default 30)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_limit integer := private.clamp_int(p_limit, 1, 50, 30);
  v_q text := lower(btrim(left(coalesce(p_query, ''), 60)));
  v_norm text;
begin
  if p_league is not null and not (private.is_member(p_league) or private.is_super()) then
    perform private.deny();
  end if;
  if left(v_q, 1) = '@' then
    v_q := substr(v_q, 2);
  end if;

  if v_q = '' then
    return coalesce((
      select jsonb_agg(private.people_item(x.id, x.name, x.username, p_league) order by x.at desc, x.id desc)
        from (select p.id, p.name, p.username, f.created_at as at
                from public.follows f join public.profiles p on p.id = f.followee_id
               where f.follower_id = v_me and p.blocked_at is null and not private.blocked_between(v_me, p.id)
               order by f.created_at desc, p.id desc
               limit v_limit) x), '[]'::jsonb);
  end if;
  if char_length(v_q) < 2 then
    return '[]'::jsonb;
  end if;

  perform private.social_pace('search', 600);
  -- Por nombre, con al menos 2 letras o números después de limpiar ('__' daría '%%': todas las cuentas; 'c%', 'c').
  v_norm := private.normalize_name(v_q);
  if char_length(v_norm) < 2 then
    v_norm := '';
  end if;
  return coalesce((
    select jsonb_agg(private.people_item(x.id, x.name, x.username, p_league) order by x.n)
      from (select p.id, p.name, p.username,
                   row_number() over (
                     order by p.username = v_q desc,
                              exists (select 1 from public.follows f where f.follower_id = v_me and f.followee_id = p.id) desc,
                              p.username like private.like_escape(v_q) || '%' desc,
                              (v_norm <> '' and private.normalize_name(p.name) like private.like_escape(v_norm) || '%') desc,
                              p.name, p.id) as n
              from public.profiles p
             where p.id <> v_me and p.blocked_at is null
               and not private.blocked_between(v_me, p.id)
               and (p.username like private.like_escape(v_q) || '%'
                    or (v_norm <> '' and private.normalize_name(p.name) like '%' || private.like_escape(v_norm) || '%'))
             order by n
             limit v_limit) x), '[]'::jsonb);
end $$;

-- Igual que en 20260929000200_invitaciones.sql y además 'avatar' en cada fila. Vacía si esa cuenta bloqueó a la que mira
-- (salvo al superadmin), como public_profile.
create or replace function public.follow_list(p_user uuid, p_kind text, p_limit integer default 30, p_before timestamptz default null, p_before_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_limit integer := private.clamp_int(p_limit, 1, 50, 30);
begin
  if p_kind is null or p_kind not in ('followers', 'following') then
    perform private.fail('invalido');
  end if;
  if not private.social_can_see(p_user) then
    return '[]'::jsonb;
  end if;
  if not private.is_super() and exists (select 1 from public.user_blocks b where b.blocker_id = p_user and b.blocked_id = v_me) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.uid,
             'name', x.name,
             'username', x.username,
             'avatar', x.avatar_path,
             'at', private.iso(x.at),
             'isFollowing', exists (select 1 from public.follows f where f.follower_id = v_me and f.followee_id = x.uid),
             'followsYou', exists (select 1 from public.follows f where f.follower_id = x.uid and f.followee_id = v_me),
             'isMe', x.uid = v_me)
             order by x.at desc, x.uid desc)
      from (
        select case when p_kind = 'followers' then f.follower_id else f.followee_id end as uid,
               date_trunc('milliseconds', f.created_at) as at, p.name, p.username, p.avatar_path
          from public.follows f
          join public.profiles p on p.id = case when p_kind = 'followers' then f.follower_id else f.followee_id end
         where (case when p_kind = 'followers' then f.followee_id else f.follower_id end) = p_user
           and ((case when p_kind = 'followers' then f.follower_id else f.followee_id end) = v_me
                or private.social_can_see(case when p_kind = 'followers' then f.follower_id else f.followee_id end))
           and (p_before is null
                or date_trunc('milliseconds', f.created_at) < p_before
                or (date_trunc('milliseconds', f.created_at) = p_before
                    and (case when p_kind = 'followers' then f.follower_id else f.followee_id end) < p_before_id))
         order by date_trunc('milliseconds', f.created_at) desc, 1 desc
         limit v_limit
      ) x), '[]'::jsonb);
end $$;

-- Igual que en 20260928000200_social.sql y además: con un bloqueo entre las dos cuentas (cualquiera de las dos
-- bloqueó a la otra), 'no_permitido'.
create or replace function public.follow_user(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_name text;
  v_tag text;
begin
  if p_user is null or p_user = v_me then
    perform private.fail('invalido');
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    perform private.fail('no_existe');
  end if;
  if private.is_blocked(p_user) or not private.social_can_see(p_user) or private.blocked_between(v_me, p_user) then
    perform private.deny();
  end if;

  if not exists (select 1 from public.follows f where f.follower_id = v_me and f.followee_id = p_user) then
    perform private.social_pace('follow', 60);
    insert into public.follows (follower_id, followee_id) values (v_me, p_user) on conflict do nothing;
    if found then
      perform private.emit('user:' || p_user::text, 'follow', jsonb_build_object('op', 'insert', 'user', v_me));
      -- Push al seguido: uno por persona y día (seguir, dejar de seguir y volver no manda otro).
      v_tag := 'seguir:' || v_me::text;
      if not exists (select 1 from public.push_outbox o where o.user_id = p_user and o.tag = v_tag and o.created_at > now() - interval '1 day') then
        select p.name into v_name from public.profiles p where p.id = v_me;
        begin
          insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
          values (p_user, left(coalesce(v_name, 'Alguien') || ' te empezó a seguir', 200), 'Toca para ver su perfil y sus juegos.',
                  '/u/' || v_me::text, v_tag, 86400, 'normal');
          if exists (select 1 from public.push_outbox o where o.user_id = p_user and o.tag = v_tag and o.sent_at is null) then
            perform private.kick_send_push();
          end if;
        exception when others then
          raise warning 'push de seguir %: %', p_user, sqlerrm;
        end;
      end if;
    end if;
  end if;

  return jsonb_build_object('following', true, 'followers', (select count(*) from public.follows f where f.followee_id = p_user)::integer);
end $$;

-- Igual que en 20260929001000_sueltos_logos.sql y además los me gusta y comentarios de otras cuentas en mis
-- publicaciones (sin las de una cuenta con un bloqueo con la mía, ni las bloqueadas por el superadmin):
-- {kind: 'post_like', at, userId, name, postId} y {kind: 'post_comment', at, userId, name, postId, text} (el texto en
-- una línea, hasta 80 letras).
create or replace function public.social_notices(p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_limit integer := private.clamp_int(p_limit, 1, 50, 30);
begin
  return coalesce((
    select jsonb_agg(z.item order by z.at desc, z.k desc)
      from (
       select u.* from (
        (select date_trunc('milliseconds', f.created_at) as at, 'f:' || f.follower_id::text as k,
                jsonb_build_object('kind', 'follow', 'at', private.iso(f.created_at), 'userId', f.follower_id, 'name', p.name) as item
           from public.follows f join public.profiles p on p.id = f.follower_id
          where f.followee_id = v_me and f.created_at > now() - interval '30 days'
          order by f.created_at desc
          limit v_limit)
        union all
        (select date_trunc('milliseconds', g.created_at), 'l:' || g.id::text,
                jsonb_build_object(
                  'kind', 'like', 'at', private.iso(g.created_at), 'userId', g.user_id, 'name', p.name,
                  'gameKind', g.kind, 'id', coalesce(g.match_id, g.golf_card_id, g.swim_entry_id), 'playerId', g.player_id,
                  'leagueId', g.league_id, 'leagueName', l.name, 'sport', l.sport,
                  'url', case when g.kind = 'match' then '/l/' || g.league_id::text || '/juegos?partido=' || g.match_id::text
                              when g.kind = 'golf' then '/l/' || g.league_id::text || '/e/' || c.event_id::text
                              else '/l/' || g.league_id::text || '/e/' || s.event_id::text end)
           from public.game_likes g
           join public.players pl on pl.id = g.player_id
           join public.profiles p on p.id = g.user_id
           join public.leagues l on l.id = g.league_id
           left join public.golf_cards c on c.id = g.golf_card_id
           left join public.swim_entries s on s.id = g.swim_entry_id
          where pl.user_id = v_me and g.user_id <> v_me and g.created_at > now() - interval '30 days' and not l.has_minors
          order by g.created_at desc
          limit v_limit)
        union all
        (select date_trunc('milliseconds', sl.created_at), 'j:' || sl.session_id::text || ':' || sl.user_id::text,
                jsonb_build_object(
                  'kind', 'like', 'at', private.iso(sl.created_at), 'userId', sl.user_id, 'name', p.name,
                  'gameKind', 'solo', 'id', sl.session_id, 'playerId', null,
                  'leagueId', null, 'leagueName', null, 'sport', so.sport,
                  'url', '/juegos-sueltos?juego=' || sl.session_id::text)
           from public.solo_likes sl
           join public.solo_sessions so on so.id = sl.session_id
           join public.profiles p on p.id = sl.user_id
          where so.user_id = v_me and sl.user_id <> v_me and sl.created_at > now() - interval '30 days'
          order by sl.created_at desc
          limit v_limit)
        union all
        (select date_trunc('milliseconds', k.created_at), 'pl:' || k.post_id::text || ':' || k.user_id::text,
                jsonb_build_object('kind', 'post_like', 'at', private.iso(k.created_at), 'userId', k.user_id, 'name', p.name,
                                   'postId', k.post_id)
           from public.post_likes k
           join public.posts x on x.id = k.post_id
           join public.profiles p on p.id = k.user_id
           left join public.leagues l on l.id = x.league_id
          where x.author_id = v_me and k.user_id <> v_me and k.created_at > now() - interval '30 days'
            and p.blocked_at is null and not coalesce(l.has_minors, false)
            and not private.blocked_between(v_me, k.user_id)
          order by k.created_at desc
          limit v_limit)
        union all
        (select date_trunc('milliseconds', cm.created_at), 'pc:' || cm.id::text,
                jsonb_build_object('kind', 'post_comment', 'at', private.iso(cm.created_at), 'userId', cm.author_id, 'name', p.name,
                                   'postId', cm.post_id, 'text', left(btrim(regexp_replace(cm.text, '\s+', ' ', 'g')), 80))
           from public.post_comments cm
           join public.posts x on x.id = cm.post_id
           join public.profiles p on p.id = cm.author_id
           left join public.leagues l on l.id = x.league_id
          where x.author_id = v_me and cm.author_id <> v_me and cm.created_at > now() - interval '30 days'
            and p.blocked_at is null and not coalesce(l.has_minors, false)
            and not private.blocked_between(v_me, cm.author_id)
          order by cm.created_at desc
          limit v_limit)
       ) u
       order by u.at desc, u.k desc
       limit v_limit
      ) z
    ), '[]'::jsonb);
end $$;

-- =====================================================================
-- 7. Reportes: publicaciones y comentarios de publicaciones
-- =====================================================================

alter table public.reports drop constraint reports_target_kind_check;
alter table public.reports add constraint reports_target_kind_check
  check (target_kind in ('comment', 'league', 'user', 'game', 'announcement', 'post', 'post_comment'));

-- Igual que en 20260929000900_legal.sql y además los admins de la liga ven los reportes de publicaciones y comentarios de
-- publicaciones de su liga (league_id: la liga de la publicación).
drop policy reports_read on public.reports;
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = (select auth.uid())
         or (select private.is_super())
         or (target_kind in ('comment', 'announcement', 'game', 'post', 'post_comment')
             and league_id in (select private.admin_leagues())
             and target_owner_id is distinct from (select auth.uid())));

-- Igual que en 20260929000900_legal.sql y además 'post' y 'post_comment'.
create or replace function private.report_kind_label(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'comment' then 'Un comentario'
    when 'league' then 'Una liga'
    when 'user' then 'Una cuenta'
    when 'game' then 'Un juego'
    when 'announcement' then 'Un aviso de liga'
    when 'post' then 'Una publicación'
    when 'post_comment' then 'Un comentario de una publicación'
    else 'Algo'
  end
$$;

-- Igual que en 20260929000900_legal.sql y además 'post' ({title, text, photo, userId, userName, leagueId, url}) y
-- 'post_comment' ({title, text, userId, userName, leagueId (la de la publicación), postId, url}).
create or replace function private.report_target(p_kind text, p_target uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v jsonb;
begin
  if p_kind = 'comment' then
    select jsonb_build_object(
             'title', 'Comentario de ' || c.author_name, 'text', c.text, 'userId', c.user_id, 'userName', c.author_name,
             'leagueId', c.league_id,
             'url', '/l/' || c.league_id::text || '/juegos?juego=' || c.entry_id::text || '&evento=' || c.event_id::text)
      into v from public.comments c where c.id = p_target;
  elsif p_kind = 'announcement' then
    select jsonb_build_object(
             'title', 'Aviso' || coalesce(' de ' || nullif(a.author_name, ''), ''), 'text', a.body, 'userId', a.sent_by,
             'userName', nullif(a.author_name, ''), 'leagueId', a.league_id, 'url', '/l/' || a.league_id::text)
      into v from public.league_announcements a where a.id = p_target;
  elsif p_kind = 'league' then
    select jsonb_build_object(
             'title', l.name, 'text', null, 'userId', l.owner_id, 'userName', o.name, 'leagueId', l.id,
             'url', '/l/' || l.id::text, 'kind', l.kind, 'visibility', l.visibility,
             'members', (select count(*) from public.league_members m where m.league_id = l.id)::integer,
             'events', (select count(*) from public.events e where e.league_id = l.id)::integer)
      into v from public.leagues l left join public.profiles o on o.id = l.owner_id where l.id = p_target;
  elsif p_kind = 'user' then
    select jsonb_build_object(
             'title', p.name, 'text', null, 'userId', p.id, 'userName', p.name, 'leagueId', null,
             'url', '/u/' || p.id::text, 'blocked', p.blocked_at is not null)
      into v from public.profiles p where p.id = p_target;
  elsif p_kind = 'game' then
    -- Boliche (participación), partido, tarjeta de golf o resultado de natación: el id es de una sola.
    select jsonb_build_object(
             'title', 'Juego de ' || p.name, 'text', nullif(array_to_string(e.scores, ' · '), ''), 'userId', p.user_id,
             'userName', p.name, 'leagueId', e.league_id,
             'url', '/l/' || e.league_id::text || '/juegos?juego=' || e.id::text || '&evento=' || e.event_id::text)
      into v from public.entries e join public.players p on p.id = e.player_id where e.id = p_target;
    if v is null then
      select jsonb_build_object(
               'title', 'Partido',
               'text', nullif(concat_ws(' · ',
                          (select string_agg(s.label, ' vs ' order by s.side) from public.match_sides s where s.match_id = m.id),
                          nullif(btrim(coalesce(m.score ->> 'text', '')), '')), ''),
               'userId', null, 'userName', null, 'leagueId', m.league_id,
               'url', '/l/' || m.league_id::text || '/juegos?partido=' || m.id::text)
        into v from public.matches m where m.id = p_target;
    end if;
    if v is null then
      select jsonb_build_object(
               'title', 'Tarjeta de golf de ' || p.name, 'text', null, 'userId', p.user_id, 'userName', p.name,
               'leagueId', c.league_id, 'url', '/l/' || c.league_id::text || '/e/' || c.event_id::text)
        into v from public.golf_cards c join public.players p on p.id = c.player_id where c.id = p_target;
    end if;
    if v is null then
      select jsonb_build_object(
               'title', 'Resultado de natación de ' || p.name, 'text', null, 'userId', p.user_id, 'userName', p.name,
               'leagueId', s.league_id, 'url', '/l/' || s.league_id::text || '/e/' || s.event_id::text)
        into v from public.swim_entries s join public.players p on p.id = s.player_id where s.id = p_target;
    end if;
  elsif p_kind = 'post' then
    select jsonb_build_object(
             'title', 'Publicación de ' || a.name, 'text', nullif(x.text, ''), 'photo', x.photo_path, 'userId', x.author_id,
             'userName', a.name, 'leagueId', x.league_id, 'url', '/p/' || x.id::text)
      into v from public.posts x join public.profiles a on a.id = x.author_id where x.id = p_target;
  elsif p_kind = 'post_comment' then
    select jsonb_build_object(
             'title', 'Comentario de ' || a.name, 'text', c.text, 'userId', c.author_id, 'userName', a.name,
             'leagueId', x.league_id, 'postId', x.id, 'url', '/p/' || x.id::text)
      into v from public.post_comments c join public.posts x on x.id = c.post_id join public.profiles a on a.id = c.author_id
     where c.id = p_target;
  end if;
  if v is not null and v ->> 'leagueId' is not null then
    v := v || coalesce((select jsonb_build_object('leagueName', l.name, 'sport', l.sport)
                          from public.leagues l where l.id = (v ->> 'leagueId')::uuid), '{}'::jsonb);
  end if;
  return v;
end $$;

-- Igual que en 20260929000900_legal.sql y además 'post' (de su autor; la liga, la de la publicación si tiene) y
-- 'post_comment' (de su autor; la liga, la de la publicación). Tienen que verse (private.can_see_post de la
-- publicación; si no, 'no_existe').
create or replace function public.report_content(p_kind text, p_target uuid, p_reason text, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_reason text := lower(btrim(coalesce(p_reason, '')));
  -- Varias líneas sí; los demás caracteres de control, no.
  v_note text := nullif(btrim(regexp_replace(replace(coalesce(p_note, ''), E'\r\n', E'\n'), '[\x01-\x09\x0b-\x1f\x7f]', ' ', 'g')), '');
  v_key text := 'report:' || v_uid::text;
  v_league uuid;
  v_owner uuid;
  v_seen boolean;
  v_id uuid;
begin
  if v_kind not in ('comment', 'league', 'user', 'game', 'announcement', 'post', 'post_comment')
     or v_reason not in ('spam', 'ofensivo', 'acoso', 'falso', 'menores', 'otro')
     or p_target is null or char_length(v_note) > 500 then
    perform private.fail('invalido');
  end if;

  -- De qué liga es y de quién; tiene que existir y verse (si no se ve, es como si no existiera).
  if v_kind = 'comment' then
    select c.league_id, c.user_id into v_league, v_owner from public.comments c where c.id = p_target;
  elsif v_kind = 'announcement' then
    select a.league_id, a.sent_by into v_league, v_owner from public.league_announcements a where a.id = p_target;
  elsif v_kind = 'league' then
    select l.id, l.owner_id into v_league, v_owner from public.leagues l where l.id = p_target;
  elsif v_kind = 'game' then
    -- Boliche, partido (sin un solo dueño), tarjeta de golf o resultado de natación: de quién es, su jugador.
    select e.league_id, p.user_id into v_league, v_owner
      from public.entries e join public.players p on p.id = e.player_id where e.id = p_target;
    if v_league is null then
      select m.league_id into v_league from public.matches m where m.id = p_target;
    end if;
    if v_league is null then
      select c.league_id, p.user_id into v_league, v_owner
        from public.golf_cards c join public.players p on p.id = c.player_id where c.id = p_target;
    end if;
    if v_league is null then
      select s.league_id, p.user_id into v_league, v_owner
        from public.swim_entries s join public.players p on p.id = s.player_id where s.id = p_target;
    end if;
  elsif v_kind = 'post' then
    select x.league_id, x.author_id, private.can_see_post(x.author_id, x.league_id, x.visibility) into v_league, v_owner, v_seen
      from public.posts x where x.id = p_target;
  elsif v_kind = 'post_comment' then
    select x.league_id, c.author_id, private.can_see_post(x.author_id, x.league_id, x.visibility) into v_league, v_owner, v_seen
      from public.post_comments c join public.posts x on x.id = c.post_id where c.id = p_target;
  end if;
  if v_kind = 'user' then
    v_owner := p_target;
    v_seen := private.social_can_see(p_target);
  elsif v_kind in ('post', 'post_comment') then
    v_seen := coalesce(v_seen, false);
  else
    v_seen := v_league is not null and exists (select 1 from private.readable_leagues() l where l = v_league);
  end if;
  if not v_seen then
    perform private.fail('no_existe');
  end if;
  if v_owner = v_uid then
    perform private.fail('invalido');
  end if;

  select r.id into v_id from public.reports r
   where r.reporter_id = v_uid and r.target_kind = v_kind and r.target_id = p_target and r.status = 'open';
  if v_id is not null then
    return v_id;
  end if;
  if private.rate_blocked(v_key, 10, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  perform private.rate_hit(v_key, interval '1 day');
  insert into public.reports (reporter_id, target_kind, target_id, league_id, target_owner_id, reason, note)
  values (v_uid, v_kind, p_target, v_league, v_owner, v_reason, v_note)
  on conflict (reporter_id, target_kind, target_id) where status = 'open' do nothing
  returning id into v_id;
  -- Dos toques a la vez: el otro ya lo guardó.
  if v_id is null then
    select r.id into v_id from public.reports r
     where r.reporter_id = v_uid and r.target_kind = v_kind and r.target_id = p_target and r.status = 'open';
    return v_id;
  end if;
  perform private.report_push(v_id);
  return v_id;
end $$;

-- Igual que en 20260929000900_legal.sql y además un admin de la liga decide los de 'post' y 'post_comment' de su liga
-- (nunca los de lo suyo).
create or replace function public.resolve_report(p_report uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_note text := nullif(btrim(regexp_replace(replace(coalesce(p_note, ''), E'\r\n', E'\n'), '[\x01-\x09\x0b-\x1f\x7f]', ' ', 'g')), '');
  v_super boolean := private.is_super();
  r public.reports;
  n integer;
begin
  if v_status not in ('dismissed', 'actioned') or char_length(v_note) > 500 then
    perform private.fail('invalido');
  end if;
  select * into r from public.reports x where x.id = p_report for update;
  if r.id is null then
    perform private.fail('no_existe');
  end if;
  if not v_super then
    -- Un admin de liga: solo comentarios, avisos, juegos y publicaciones de su liga, y nunca lo que es suyo (al
    -- reportarlo o ahora).
    if r.league_id is null or r.target_kind not in ('comment', 'announcement', 'game', 'post', 'post_comment')
       or not private.is_admin(r.league_id)
       or r.target_owner_id = v_uid
       or coalesce(private.report_target(r.target_kind, r.target_id) ->> 'userId', '') = v_uid::text then
      perform private.deny();
    end if;
  end if;
  -- Ya lo decidió alguien (otro admin o el superadmin): su decisión y su nota se quedan. El for update de arriba
  -- espera al que lo estaba cerrando a la vez y ve cómo quedó.
  if r.status <> 'open' then
    perform private.fail('cerrado');
  end if;
  -- Este y los demás abiertos de lo mismo.
  update public.reports x
     set status = v_status, handled_by = v_uid, handled_at = now(), action_note = v_note
   where x.target_kind = r.target_kind and x.target_id = r.target_id and x.status = 'open';
  get diagnostics n = row_count;
  if v_super then
    perform private.audit('resolve_report', 'app', p_report::text, jsonb_build_object(
      'kind', r.target_kind, 'targetId', r.target_id, 'leagueId', r.league_id, 'reason', r.reason, 'status', v_status,
      'note', v_note, 'closed', n));
  end if;
end $$;

-- Igual que en 20260929000900_legal.sql y además p_kind 'post' y 'post_comment', que un admin de liga también ve.
create or replace function public.list_reports(
  p_status text default 'open',
  p_league uuid default null,
  p_kind text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_super boolean := private.is_super();
  v_status text := coalesce(nullif(lower(btrim(coalesce(p_status, ''))), ''), 'open');
  v_kind text := nullif(lower(btrim(coalesce(p_kind, ''))), '');
  v_limit integer := private.clamp_int(p_limit, 1, 100, 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_open integer;
  v_all integer;
  v_rows jsonb;
begin
  if v_uid is null then
    perform private.deny();
  end if;
  if v_status not in ('open', 'closed', 'dismissed', 'actioned', 'all')
     or (v_kind is not null and v_kind not in ('comment', 'league', 'user', 'game', 'announcement', 'post', 'post_comment')) then
    perform private.fail('invalido');
  end if;
  if not v_super and (p_league is null or not private.is_admin(p_league)) then
    perform private.deny();
  end if;

  with f as (
    select r.* from public.reports r
     where (p_league is null or r.league_id = p_league)
       and (v_super or (r.target_kind in ('comment', 'announcement', 'game', 'post', 'post_comment')
                        and r.target_owner_id is distinct from v_uid))
       and (v_kind is null or r.target_kind = v_kind)
  ), s as (
    select f.* from f
     where case v_status
             when 'open' then f.status = 'open'
             when 'closed' then f.status <> 'open'
             when 'all' then true
             else f.status = v_status
           end
  ), page as (
    select s.*, row_number() over (order by s.created_at desc, s.id desc) as rn
      from s order by s.created_at desc, s.id desc limit v_limit offset v_offset
  )
  select (select count(*) from s)::integer,
         (select count(*) from f where f.status = 'open')::integer,
         (select count(*) from f)::integer,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', pg.id,
                    'kind', pg.target_kind,
                    'targetId', pg.target_id,
                    'leagueId', pg.league_id,
                    'leagueName', l.name,
                    'reason', pg.reason,
                    'note', pg.note,
                    'status', pg.status,
                    'createdAt', private.iso(pg.created_at),
                    'handledAt', private.iso(pg.handled_at),
                    'handledByName', hb.name,
                    'actionNote', pg.action_note,
                    'reporterId', case when v_super then pg.reporter_id end,
                    'reporterName', case when v_super then rp.name end,
                    'sameTarget', (select count(*) from public.reports x
                                    where x.target_kind = pg.target_kind and x.target_id = pg.target_id and x.status = 'open')::integer,
                    'target', private.report_target(pg.target_kind, pg.target_id))
                    order by pg.rn)
             from page pg
             left join public.leagues l on l.id = pg.league_id
             left join public.profiles hb on hb.id = pg.handled_by
             left join public.profiles rp on rp.id = pg.reporter_id), '[]'::jsonb)
    into v_total, v_open, v_all, v_rows;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'open', v_open, 'all', v_all);
end $$;

-- =====================================================================
-- 8. Bajar mis datos: con lo de la red social
-- =====================================================================

-- Igual que en 20261008000100_esports.sql y además bio y avatarPath en account, posts (sus publicaciones) y postComments
-- (los comentarios que escribió). post_likes y league_follows ya salen en tables (tienen user_id).
create or replace function public.export_my_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_key text := 'export:u:' || v_uid::text;
  v_players uuid[];
  v_tables jsonb := '{}'::jsonb;
  v_truncated text[] := '{}';
  v_rows jsonb;
  v_n integer;
  r record;
  c_max constant integer := 5000;
begin
  if private.rate_blocked(v_key, 5, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  perform private.rate_hit(v_key, interval '1 hour');

  v_players := array(select p.id from public.players p where p.user_id = v_uid order by p.created_at, p.id);

  for r in
    select c.relname as t,
           case when bool_or(a.attname = 'holder') then 'holder'
                when bool_or(a.attname = 'user_id') then 'user_id'
                else 'player_id' end as col
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and a.attname in ('user_id', 'player_id', 'holder')
       and c.relname not in ('players', 'league_members', 'push_outbox')
     group by c.relname
     order by c.relname
  loop
    if r.col = 'player_id' and cardinality(v_players) = 0 then
      continue;
    end if;
    -- Las insignias de la liga (…1120): el jugador ve las vigentes y su nota, nunca quién la dio ni por qué se la
    -- quitaron (eso es del dueño y los admins, §5.2), ni las retiradas.
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x) - $2), ''[]''::jsonb), count(*)::integer
         from (select * from public.%I t where t.%I = any ($1)%s limit %s) x',
      r.t, r.col, case when r.t = 'league_badge_awards' then ' and t.revoked_at is null' else '' end, c_max + 1)
      using case r.col when 'user_id' then array[v_uid] when 'holder' then v_uid || v_players else v_players end,
            private.export_hidden_columns()
              || case when r.t = 'league_badge_awards' then array['awarded_by', 'revoked_by', 'revoke_reason', 'revoked_at']
                      else '{}'::text[] end
      into v_rows, v_n;
    if v_n > c_max then
      v_rows := v_rows - c_max;
      v_truncated := v_truncated || r.t::text;
    end if;
    if v_n > 0 then
      v_tables := v_tables || jsonb_build_object(r.t::text, v_rows);
    end if;
  end loop;

  return jsonb_build_object(
    'format', 'matchmate-mis-datos',
    'version', 1,
    'generatedAt', private.iso(now()),
    'account', (
      select jsonb_build_object(
        'id', p.id,
        'email', p.email,
        'name', p.name,
        'createdAt', private.iso(p.created_at),
        'adultConfirmedAt', private.iso(p.adult_confirmed_at),
        'lastSeenAt', private.iso(p.last_seen_at),
        'superadmin', p.is_superadmin,
        'blockedAt', private.iso(p.blocked_at),
        'blockedReason', p.blocked_reason,
        'bowlingxId', p.firebase_uid,
        'username', p.username,
        'pushPrefs', p.push_prefs,
        'uiMode', p.ui_mode,
        'featuredBadges', to_jsonb(p.featured_badges),
        'bio', p.bio,
        'avatarPath', p.avatar_path,
        'provider', nullif(a.raw_app_meta_data ->> 'provider', ''),
        'emailConfirmedAt', private.iso(a.email_confirmed_at),
        'lastSignInAt', private.iso(a.last_sign_in_at))
        from public.profiles p left join auth.users a on a.id = p.id
       where p.id = v_uid),
    'leagues', coalesce((
      select jsonb_agg(jsonb_build_object(
               'leagueId', m.league_id, 'name', l.name, 'sport', l.sport, 'kind', l.kind, 'visibility', l.visibility,
               'role', m.role, 'scorer', m.is_scorer, 'displayName', m.display_name, 'joinedAt', private.iso(m.joined_at),
               'badgesAuto', l.badges_auto)
               order by m.joined_at, m.league_id)
        from public.league_members m join public.leagues l on l.id = m.league_id
       where m.user_id = v_uid), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'leagueId', p.league_id, 'leagueName', l.name, 'name', p.name,
               'averageOverride', p.average_override, 'attrs', p.attrs, 'createdAt', private.iso(p.created_at))
               order by p.created_at, p.id)
        from public.players p join public.leagues l on l.id = p.league_id
       where p.id = any (v_players)), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'leagueId', m.league_id, 'eventId', m.event_id, 'scheduledAt', private.iso(m.scheduled_at),
               'status', m.status, 'format', m.format, 'score', m.score, 'winnerSide', m.winner_side,
               'side', mp.side, 'playerId', mp.player_id)
               order by m.scheduled_at nulls last, m.id)
        from public.match_players mp join public.matches m on m.id = mp.match_id
       where mp.player_id = any (v_players)), '[]'::jsonb),
    'esportsIds', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.game, g.platform)
        from public.esports_game_ids g where g.user_id = v_uid), '[]'::jsonb),
    'esportsTeams', coalesce((
      select jsonb_agg(jsonb_build_object(
               'teamId', t.id, 'game', t.game, 'name', t.name, 'tag', t.tag, 'role', m.role, 'displayName', m.display_name,
               'joinedAt', private.iso(m.joined_at))
               order by m.joined_at, t.id)
        from public.esports_team_members m join public.esports_teams t on t.id = m.team_id
       where m.user_id = v_uid), '[]'::jsonb),
    'esportsEntries', coalesce((
      select jsonb_agg(to_jsonb(m) || jsonb_build_object('entryName', e.name, 'entryStatus', e.status,
                                                         'tournament', private.esp_tournament_name(e.event_id))
               order by m.created_at, m.entry_id)
        from public.esports_entry_members m join public.esports_entries e on e.id = m.entry_id
       where m.user_id = v_uid), '[]'::jsonb),
    'esportsIdMoves', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'game', m.game, 'platform', m.platform, 'idDisplay', m.id_display, 'provider', m.provider,
               'createdAt', private.iso(m.created_at), 'seenAt', private.iso(m.seen_at))
               order by m.created_at, m.id)
        from public.esports_id_moves m where m.user_id = v_uid), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'text', x.text, 'photoPath', x.photo_path, 'photoW', x.photo_w, 'photoH', x.photo_h,
               'leagueId', x.league_id, 'sport', x.sport, 'visibility', x.visibility, 'likes', x.likes,
               'comments', x.comments, 'createdAt', private.iso(x.created_at))
               order by x.created_at, x.id)
        from (select * from public.posts y where y.author_id = v_uid order by y.created_at, y.id limit c_max) x), '[]'::jsonb),
    'postComments', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'postId', x.post_id, 'text', x.text, 'createdAt', private.iso(x.created_at))
               order by x.created_at, x.id)
        from (select * from public.post_comments y where y.author_id = v_uid order by y.created_at, y.id limit c_max) x), '[]'::jsonb),
    'tables', v_tables,
    'daysSeen', coalesce((
      select jsonb_agg(to_char(s.day, 'YYYY-MM-DD') order by s.day) from private.daily_seen s where s.user_id = v_uid), '[]'::jsonb),
    'scanUsage', coalesce((
      select jsonb_agg(jsonb_build_object('day', to_char(s.day, 'YYYY-MM-DD'), 'photos', s.n) order by s.day)
        from private.scan_usage s where s.user_id = v_uid), '[]'::jsonb),
    'badgeReports', private.my_badge_reports(v_uid),
    'truncated', to_jsonb(v_truncated));
end $$;

-- =====================================================================
-- 9. La cola de Storage con cuatro buckets (la vacía la Edge Function purge-photos)
-- =====================================================================

-- Igual que en 20261008000100_esports.sql y además 'avatars' y 'posts': antes de tomar, se sacan las que se volvieron a
-- usar (la foto de perfil de alguien, la foto de una publicación). Sigue solo de service_role.
create or replace function public.purge_queue_take(p_limit integer default 500, p_bucket text default 'scoreboards')
returns table (path text)
language plpgsql security definer set search_path = '' as $$
begin
  if p_bucket is null or p_bucket not in ('scoreboards', 'logos', 'avatars', 'posts') then
    perform private.fail('invalido');
  end if;
  if p_bucket = 'scoreboards' then
    delete from private.storage_purge_queue q
     where q.bucket = 'scoreboards' and exists (select 1 from public.photos p where p.path = q.path);
  elsif p_bucket = 'logos' then
    delete from private.storage_purge_queue q
     where q.bucket = 'logos'
       and (exists (select 1 from public.leagues l where l.logo_path = q.path)
            or exists (select 1 from public.esports_teams t where t.logo_path = q.path));
  elsif p_bucket = 'avatars' then
    delete from private.storage_purge_queue q
     where q.bucket = 'avatars' and exists (select 1 from public.profiles p where p.avatar_path = q.path);
  else
    delete from private.storage_purge_queue q
     where q.bucket = 'posts' and exists (select 1 from public.posts p where p.photo_path = q.path);
  end if;
  return query
  with picked as (
    select q.path
      from private.storage_purge_queue q
     where q.bucket = p_bucket and q.attempts < 10 and (q.claimed_at is null or q.claimed_at < now() - interval '10 minutes')
     order by q.queued_at, q.path
     limit private.clamp_int(p_limit, 1, 1000, 500)
       for update of q skip locked
  )
  update private.storage_purge_queue q set claimed_at = now(), attempts = q.attempts + 1
    from picked x
   where q.path = x.path
  returning q.path;
end $$;

-- Igual que en 20260929001000_sueltos_logos.sql y además 'avatars' y 'posts'.
create or replace function public.purge_queue_done(p_paths text[], p_bucket text default 'scoreboards') returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  if p_bucket is null or p_bucket not in ('scoreboards', 'logos', 'avatars', 'posts') then
    perform private.fail('invalido');
  end if;
  delete from private.storage_purge_queue q where q.path = any (coalesce(p_paths, '{}')) and q.bucket = p_bucket;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- =====================================================================
-- 10. Permisos: las RPC solo con sesión; la cola de Storage, solo service_role; las ayudas, nadie de la app
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array[
    'create_post', 'delete_post', 'set_post_like', 'post_detail', 'post_comments', 'add_post_comment', 'delete_post_comment',
    'social_feed', 'user_posts', 'league_posts', 'league_social', 'follow_league', 'unfollow_league', 'followed_leagues',
    'search_leagues', 'set_bio', 'set_avatar', 'block_user', 'unblock_user', 'my_blocked_users',
    -- Redefinidas (create or replace conserva sus permisos; se dejan igual para asegurarlo).
    'public_profile', 'search_people', 'follow_list', 'follow_user', 'social_notices', 'report_content', 'resolve_report',
    'list_reports', 'export_my_data'];
  v_service constant text[] := array['purge_queue_take', 'purge_queue_done'];
  v_private constant text[] := array[
    'blocked_between', 'social_clean_text', 'social_text_ok', 'social_snippet', 'person_lite', 'can_see_post', 'post_json',
    'post_comment_json', 'league_hit', 'post_push_body', 'post_likes_count', 'post_comments_count', 'queue_post_photo_purge',
    'queue_avatar_purge',
    -- Redefinidas.
    'people_item', 'report_kind_label', 'report_target'];
begin
  for f in select p.oid::regprocedure as sig, n.nspname, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and (p.proname = any (v_rpc) or p.proname = any (v_service)))
               or (n.nspname = 'private' and p.proname = any (v_private)) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' and f.proname = any (v_rpc) then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.nspname = 'public' then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;
