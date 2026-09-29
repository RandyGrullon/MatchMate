-- MatchMate · Usuarios (@usuario), buscar personas e invitaciones a una liga.
--
-- 1. profiles.username: 3 a 20 letras minúsculas, números, '_' y puntos solo por dentro (sin '..'), único. Toda
--    cuenta tiene uno: un trigger lo pone al crear el perfil (handle_new_user, ensure_profile, el importador de
--    BowlingX y las pruebas no lo mandan) a partir del nombre (sin acentos ni símbolos, hasta 15) o, si no da
--    para 3 letras, 'jugador' (nunca del correo: el @usuario lo ve cualquiera con sesión y el correo no); si ya
--    está tomado o reservado, con 4 números al final. Las cuentas que ya había lo reciben aquí, en orden de registro.
--    set_username(p_username) lo cambia (5 cambios por día: 'rate_limited'; 'invalido', 'reservado',
--    'duplicado') y username_status(p_username) dice cómo está uno mientras se escribe: 'mine' | 'ok' | 'taken' |
--    'invalid' | 'reserved'. public_profile y follow_list devuelven también 'username'.
-- 2. Quién se ve: además de lo de antes (20260928000200_social.sql), con sesión se ve cualquier cuenta sin bloquear
--    (se busca y se abre su perfil). Los juegos, me gusta y números siguen saliendo solo de las ligas que quien
--    mira puede leer y sin menores (private.social_players / social_league_ok): ninguna RPC cambia en eso.
-- 3. search_people(p_query, p_league, p_limit): personas por @usuario (empieza con) o nombre (contiene, sin
--    acentos, con 2 letras o más). Vacío: las cuentas que sigo. Con p_league (miembro o superadmin): si ya están
--    en la liga o ya tienen invitación pendiente.
-- 4. public.league_invites: invitaciones a una liga. 'pending' → 'accepted' | 'declined' | 'cancelled'; una
--    pendiente por liga y cuenta. La leen la cuenta invitada, quien invitó y los admins de la liga; nadie escribe
--    directo. Tiempo real 'invites' en 'user:<invitada>', 'user:<quien invitó>' y 'league:<liga>'.
--    invite_to_league(p_league, p_users): invita a varias (hasta 50). Un miembro invita a una liga pública; a una
--    privada (también las de menores), solo el dueño o un admin. Push «<nombre> te invitó a <liga>» (uno por
--    persona y día de quien invita). 100 por día (se mira con cada una).
--    respond_league_invite(p_invite, p_accept, p_prefer): aceptar une a la liga (con su jugador y, si eligió uno
--    libre, el reclamo, como join_league) y le avisa a quien invitó; rechazar la cierra (no se puede volver a
--    invitar en 7 días). cancel_league_invite(p_invite): quien invitó o un admin la retira.
--    my_league_invites() y league_invite_details(p_invite): lo que muestra la app.
--    Una pendiente deja de valer (private.invite_ok) si quien invitó está bloqueado o si la liga es privada y ya no
--    es admin de ella: no se muestra ni deja entrar. Unirse por otro camino (código, liga pública) acepta la
--    invitación pendiente; salir de la liga cancela las que mandó esa cuenta.
--
-- Contrato del cliente: src/lib/data/people.ts y src/lib/data/invites.ts.

-- =====================================================================
-- 1. @usuario
-- =====================================================================
alter table public.profiles add column username text;
alter table public.profiles add constraint profiles_username_format
  check (username ~ '^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$' and position('..' in username) = 0);
create unique index profiles_username_key on public.profiles (username);

-- Nombres que nadie usa (parecen de la app o chocan con sus rutas).
create function private.username_reserved(p text) returns boolean
language sql immutable security definer set search_path = '' as $$
  select coalesce(p = any (array[
    'admin', 'administrador', 'matchmate', 'soporte', 'support', 'root', 'api', 'sistema', 'system', 'superadmin',
    'moderador', 'oficial', 'perfil', 'cuenta', 'avisos', 'ligas', 'eventos', 'buscar', 'invitacion', 'login', 'ayuda',
    'help', 'staff', 'null', 'undefined', 'www']), false)
$$;

-- Lo que escribe la persona: sin espacios alrededor, en minúsculas y sin una '@' al principio.
create function private.username_clean(p text) returns text
language sql immutable security definer set search_path = '' as $$
  select case when left(v, 1) = '@' then substr(v, 2) else v end
    from (select lower(btrim(coalesce(p, ''))) as v) x
$$;

-- ¿Cumple el formato? (el mismo CHECK de la tabla y USERNAME_RE de src/lib/data/people.ts)
create function private.username_ok(p text) returns boolean
language sql immutable security definer set search_path = '' as $$
  select coalesce(p ~ '^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$' and position('..' in p) = 0, false)
$$;

-- Base para un usuario nuevo: el nombre sin acentos ni símbolos (hasta 15); si no llega a 3 ('Al', 'JR', un
-- nombre en otro alfabeto), 'jugador'. Nunca lo de antes de la @ del correo: el @usuario lo ve y lo busca
-- cualquiera con sesión, y el correo solo su dueño (profiles_read). Un nombre vacío ya llega aquí como lo de
-- antes de la @ (private.profile_name), que es también el nombre que ven los demás.
create function private.username_base(p_name text) returns text
language plpgsql immutable security definer set search_path = '' as $$
declare
  v text := left(regexp_replace(replace(private.normalize_name(p_name), 'ñ', 'n'), '[^a-z0-9]', '', 'g'), 15);
begin
  if char_length(v) < 3 then
    v := 'jugador';
  end if;
  return v;
end $$;

-- Un usuario libre a partir de la base: ella misma si está libre y no es reservada; si no, hasta 15 letras + 4
-- números (30 intentos) y, al final, 12 + 8 letras al azar. Siempre cumple el formato (la base se limpia aquí
-- también). Volatile: dentro del trigger ve las filas que ya insertó la misma sentencia.
create function private.pick_username(p_base text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_base text := left(regexp_replace(lower(coalesce(p_base, '')), '[^a-z0-9]', '', 'g'), 15);
  v text;
begin
  if char_length(v_base) < 3 then
    v_base := 'jugador';
  end if;
  if not private.username_reserved(v_base) and not exists (select 1 from public.profiles p where p.username = v_base) then
    return v_base;
  end if;
  for i in 1..30 loop
    v := left(v_base, 15) || lpad(floor(random() * 10000)::integer::text, 4, '0');
    if not private.username_reserved(v) and not exists (select 1 from public.profiles p where p.username = v) then
      return v;
    end if;
  end loop;
  return left(v_base, 12) || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
end $$;

-- Perfil nuevo sin usuario: se le pone uno.
create function private.profiles_username() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.username is null then
    new.username := private.pick_username(private.username_base(new.name));
  end if;
  return new;
end $$;

create trigger profiles_username before insert on public.profiles
  for each row execute function private.profiles_username();

-- Las cuentas que ya había, en orden de registro (cada una ve las de antes).
do $$
declare
  r record;
begin
  for r in select p.id, p.name from public.profiles p where p.username is null order by p.created_at, p.id loop
    update public.profiles set username = private.pick_username(private.username_base(r.name)) where id = r.id;
  end loop;
end $$;

alter table public.profiles alter column username set not null;

-- Cuenta uno en el límite solo si todavía cabe (p_max en la ventana) y dice si contó. Con el candado de la fila, dos
-- llamadas a la vez no se pasan (rate_blocked + rate_hit leen antes de contar y las dos ven lugar). Si la RPC falla
-- después, lo contado se deshace con ella.
create function private.rate_take(p_key text, p_max integer, p_window interval) returns boolean
language sql security definer set search_path = '' as $$
  with t as (
    insert into private.rate_limits as r (key, window_start, hits) values (p_key, now(), 1)
    on conflict (key) do update set
      hits = case when r.window_start > now() - p_window then r.hits + 1 else 1 end,
      window_start = case when r.window_start > now() - p_window then r.window_start else now() end
    where r.window_start <= now() - p_window or r.hits < p_max
    returning 1)
  select exists (select 1 from t)
$$;

-- Cambiar el @usuario propio. Devuelve cómo quedó. El mismo que ya tiene: nada (no cuenta en el límite).
create function public.set_username(p_username text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v text := private.username_clean(p_username);
  v_key text := 'username:' || v_uid::text;
begin
  if not private.username_ok(v) then
    perform private.fail('invalido');
  end if;
  if private.username_reserved(v) then
    perform private.fail('reservado');
  end if;
  if v = (select p.username from public.profiles p where p.id = v_uid) then
    return v;
  end if;
  -- Cuenta aquí (y se deshace si después falla con 'duplicado').
  if not private.rate_take(v_key, 5, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  if exists (select 1 from public.profiles p where p.username = v and p.id <> v_uid) then
    perform private.fail('duplicado');
  end if;
  begin
    update public.profiles set username = v where id = v_uid;
    if not found then
      perform private.fail('no_existe');
    end if;
  exception when unique_violation then
    -- Otra cuenta lo tomó en el mismo momento.
    perform private.fail('duplicado');
  end;
  return v;
end $$;

-- Cómo está un @usuario mientras se escribe: 'invalid' (formato), 'reserved', 'mine' (el que ya tengo), 'taken'
-- u 'ok'. 600 consultas por hora.
create function public.username_status(p_username text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v text := private.username_clean(p_username);
begin
  perform private.social_pace('username_check', 600);
  if not private.username_ok(v) then
    return 'invalid';
  end if;
  if private.username_reserved(v) then
    return 'reserved';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and p.username = v) then
    return 'mine';
  end if;
  if exists (select 1 from public.profiles p where p.username = v) then
    return 'taken';
  end if;
  return 'ok';
end $$;

-- =====================================================================
-- 2. Quién se ve
-- =====================================================================

-- Igual que en 20260928000200_social.sql y además: con sesión, cualquier cuenta sin bloquear. Lo que sale de esa
-- cuenta sigue filtrado por liga (social_players, social_league_ok): public_profile (sports, likesReceived,
-- gamesCount), profile_games, following_games y profile_stats solo cuentan ligas que quien mira puede leer y sin
-- menores; follow_list solo lista cuentas; set_game_like y social_notices no usan esta función.
create or replace function private.social_can_see(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (select 1 from public.profiles p where p.id = p_user) and (
    p_user = (select auth.uid())
    or (select private.is_super())
    or exists (select 1 from public.league_members m join public.leagues l on l.id = m.league_id
                where m.user_id = p_user and (l.visibility = 'public' or l.id in (select private.my_leagues())))
    or exists (select 1 from public.follows f
                where (f.follower_id = (select auth.uid()) and f.followee_id = p_user)
                   or (f.follower_id = p_user and f.followee_id = (select auth.uid())))
    or ((select auth.uid()) is not null and not private.is_blocked(p_user)))
$$;

-- Igual que en 20260928000200_social.sql y además 'username' en cada fila.
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
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.uid,
             'name', x.name,
             'username', x.username,
             'at', private.iso(x.at),
             'isFollowing', exists (select 1 from public.follows f where f.follower_id = v_me and f.followee_id = x.uid),
             'followsYou', exists (select 1 from public.follows f where f.follower_id = x.uid and f.followee_id = v_me),
             'isMe', x.uid = v_me)
             order by x.at desc, x.uid desc)
      from (
        select case when p_kind = 'followers' then f.follower_id else f.followee_id end as uid,
               date_trunc('milliseconds', f.created_at) as at, p.name, p.username
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

-- Igual que en 20260928000200_social.sql y además 'username'.
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
  v_players := array(select sp.player_id from private.social_players(array[p_user], null) sp);
  select coalesce(jsonb_agg(s.id order by s.sort_order, s.id), '[]'::jsonb) into v_sports
    from public.sport_status s
   where s.id in (select sp.sport from private.social_players(array[p_user], null) sp);
  return jsonb_build_object(
    'id', pr.id,
    'name', pr.name,
    'username', pr.username,
    'since', private.iso(pr.created_at),
    'sports', v_sports,
    'followers', (select count(*) from public.follows f where f.followee_id = p_user)::integer,
    'following', (select count(*) from public.follows f where f.follower_id = p_user)::integer,
    'likesReceived', ((select count(*) from public.reactions r where r.player_id = any (v_players))
                      + (select count(*) from public.game_likes g where g.player_id = any (v_players)))::integer,
    'gamesCount', (select count(*) from private.social_items(array[p_user], null, null, null, null))::integer,
    'isFollowing', exists (select 1 from public.follows f where f.follower_id = v_me and f.followee_id = p_user),
    'followsYou', exists (select 1 from public.follows f where f.follower_id = p_user and f.followee_id = v_me),
    'isMe', p_user = v_me);
end $$;

-- =====================================================================
-- 4. Invitaciones (la tabla va antes de la búsqueda: search_people dice quién ya tiene una)
-- =====================================================================
-- user_id: la cuenta invitada. invited_by: quien invitó (null si se borró su cuenta). decided_at: cuándo se
-- aceptó, rechazó o canceló.
create table public.league_invites (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  check ((status = 'pending') = (decided_at is null)),
  check (invited_by is null or invited_by <> user_id)
);
create unique index league_invites_pending_key on public.league_invites (league_id, user_id) where status = 'pending';
create index league_invites_user_idx on public.league_invites (user_id, created_at desc);
create index league_invites_sender_idx on public.league_invites (invited_by, created_at desc);
create index league_invites_sync_idx on public.league_invites (league_id, updated_at);

create trigger league_invites_touch before update on public.league_invites
  for each row execute function private.touch_updated_at();
create trigger league_invites_tombstone after delete on public.league_invites
  for each row execute function private.tombstone('id');

alter table public.league_invites enable row level security;
create policy league_invites_read on public.league_invites for select to authenticated
  using (user_id = (select auth.uid()) or invited_by = (select auth.uid()) or league_id in (select private.admin_leagues()));
revoke all on public.league_invites from public, anon, authenticated;
grant select on public.league_invites to authenticated;

-- Tiempo real: solo dice cuál cambió (la pantalla vuelve a leer). Al borrar una liga no se avisa nada.
create function private.emit_league_invites() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.league_invites;
begin
  if tg_op = 'DELETE' then
    r := old;
    if private.deleting(r.league_id) then
      return null;
    end if;
  else
    r := new;
  end if;
  perform private.emit('user:' || r.user_id::text, 'invites', jsonb_build_object('id', r.id, 'status', r.status, 'league_id', r.league_id));
  if r.invited_by is not null then
    perform private.emit('user:' || r.invited_by::text, 'invites', jsonb_build_object('id', r.id, 'status', r.status, 'league_id', r.league_id));
  end if;
  perform private.emit('league:' || r.league_id::text, 'invites', jsonb_build_object('id', r.id, 'status', r.status));
  return null;
end $$;
create trigger league_invites_emit after insert or update or delete on public.league_invites
  for each row execute function private.emit_league_invites();

-- Se unió por otro camino (código, liga pública, join_signup…): su invitación pendiente queda aceptada.
create function private.accept_invites_on_join() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.league_invites i set status = 'accepted', decided_at = now()
   where i.league_id = new.league_id and i.user_id = new.user_id and i.status = 'pending';
  return null;
end $$;
create trigger league_members_accept_invites after insert on public.league_members
  for each row execute function private.accept_invites_on_join();

-- Salir de la liga (o que lo saquen) cancela las invitaciones pendientes que mandó a esa liga.
create function private.cancel_invites_on_leave() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Se borra la liga o la cuenta: las invitaciones se van (o quedan sin quien invitó) por la FK.
  if not exists (select 1 from public.leagues l where l.id = old.league_id)
     or not exists (select 1 from public.profiles p where p.id = old.user_id) then
    return null;
  end if;
  update public.league_invites i set status = 'cancelled', decided_at = now()
   where i.league_id = old.league_id and i.invited_by = old.user_id and i.status = 'pending';
  return null;
end $$;
create trigger league_members_cancel_invites after delete on public.league_members
  for each row execute function private.cancel_invites_on_leave();

-- ¿Una invitación pendiente de p_invited_by a p_league todavía vale? Nunca si quien invitó está bloqueado. En una
-- liga pública, sí (también si ya no tiene cuenta: cualquiera puede unirse). En una privada (o que dejó de ser
-- pública), solo si quien invitó sigue siendo dueño o admin de ella. La que no vale no se muestra (my_league_invites,
-- league_invite_details, search_people), no deja entrar (respond_league_invite la cancela) y no impide invitar de nuevo.
create function private.invite_ok(p_league uuid, p_invited_by uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (p_invited_by is null or not private.is_blocked(p_invited_by))
     and exists (select 1 from public.leagues l
                  where l.id = p_league
                    and (l.visibility = 'public'
                         or (p_invited_by is not null and private.user_is_admin(p_league, p_invited_by))))
$$;

-- =====================================================================
-- 3. Buscar personas
-- =====================================================================

-- Una persona en la búsqueda, vista por la cuenta de la sesión (y la liga, si se pide).
create function private.people_item(p_user uuid, p_name text, p_username text, p_league uuid) returns jsonb
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
                              and private.invite_ok(i.league_id, i.invited_by)))
$$;

-- Personas: [{id, name, username, isFollowing, followsYou, inLeague, invited}] (hasta 50). p_query vacío (o solo
-- '@'): las cuentas que sigo, la más reciente primero. 1 letra: nada. Si no: @usuario que empieza con lo escrito o
-- nombre que lo contiene (sin acentos), primero el @usuario exacto, luego a quien sigo, luego los @usuario que
-- empiezan así, los nombres que empiezan así y el resto por nombre (600 búsquedas por hora). Nunca yo ni las
-- cuentas bloqueadas. p_league: miembro de esa liga o superadmin (si no, 'no_permitido').
create function public.search_people(p_query text default null, p_league uuid default null, p_limit integer default 30)
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
               where f.follower_id = v_me and p.blocked_at is null
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
               and (p.username like private.like_escape(v_q) || '%'
                    or (v_norm <> '' and private.normalize_name(p.name) like '%' || private.like_escape(v_norm) || '%'))
             order by n
             limit v_limit) x), '[]'::jsonb);
end $$;

-- =====================================================================
-- 4. Invitaciones: RPC
-- =====================================================================

-- Invita a esas cuentas (en su orden, sin repetidas; hasta 50) a la liga. Cada una sale con su estado:
-- 'unavailable' (yo, no existe o bloqueada), 'member' (ya está), 'pending' (ya tiene una que vale), 'declined' (la
-- rechazó hace menos de 7 días), 'rate_limited' (se llenó el límite de 100 por día en esta misma llamada) o 'sent'
-- (nueva). Devuelve {sent, results: [{userId, status}]}. Push: uno por persona y día de quien invita (invitar,
-- retirar y volver a invitar, o a otra liga, no manda otro; la invitación igual sale en su campana).
create function public.invite_to_league(p_league uuid, p_users uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_key text := 'invite:' || v_uid::text;
  l public.leagues;
  v_users uuid[];
  v_user uuid;
  v_from text;
  v_status text;
  v_id uuid;
  v_tag text;
  v_sent integer := 0;
  v_queued boolean := false;
  v_results jsonb := '[]'::jsonb;
begin
  select * into l from public.leagues x where x.id = p_league;
  if l.id is null then
    perform private.fail('no_existe');
  end if;
  if not (private.is_member(p_league) or private.is_super()) then
    perform private.deny();
  end if;
  -- Privada (también las de menores): solo el dueño o un admin.
  if l.visibility <> 'public' and not private.is_admin(p_league) then
    perform private.deny();
  end if;
  v_users := array(select a.u from unnest(p_users) with ordinality as a (u, n)
                    where a.u is not null group by a.u order by min(a.n));
  if coalesce(cardinality(v_users), 0) = 0 or cardinality(v_users) > 50 then
    perform private.fail('invalido');
  end if;
  if private.rate_blocked(v_key, 100, interval '1 day') then
    perform private.fail('rate_limited');
  end if;

  v_from := (select p.name from public.profiles p where p.id = v_uid);
  foreach v_user in array v_users loop
    if v_user <> v_uid then
      -- La pendiente que ya no vale (la liga pasó a privada, quien invitó dejó de ser admin o está bloqueado) no
      -- cuenta como 'pending': se cancela y esta la reemplaza.
      update public.league_invites i set status = 'cancelled', decided_at = now()
       where i.league_id = p_league and i.user_id = v_user and i.status = 'pending'
         and not private.invite_ok(i.league_id, i.invited_by);
    end if;
    if v_user = v_uid or not exists (select 1 from public.profiles p where p.id = v_user and p.blocked_at is null) then
      v_status := 'unavailable';
    elsif exists (select 1 from public.league_members m where m.league_id = p_league and m.user_id = v_user) then
      v_status := 'member';
    elsif exists (select 1 from public.league_invites i where i.league_id = p_league and i.user_id = v_user and i.status = 'pending') then
      v_status := 'pending';
    elsif exists (select 1 from public.league_invites i
                   where i.league_id = p_league and i.user_id = v_user and i.status = 'declined'
                     and i.decided_at > now() - interval '7 days') then
      v_status := 'declined';
    elsif not private.rate_take(v_key, 100, interval '1 day') then
      -- El límite se mira con cada una (y con el candado de la fila, también con llamadas a la vez).
      v_status := 'rate_limited';
    else
      v_id := null;
      insert into public.league_invites (league_id, user_id, invited_by) values (p_league, v_user, v_uid)
      on conflict (league_id, user_id) where status = 'pending' do nothing
      returning id into v_id;
      if v_id is null then
        -- Otro admin la mandó en el mismo momento.
        v_status := 'pending';
      else
        v_status := 'sent';
        v_sent := v_sent + 1;
        -- Push: uno por persona y día de quien invita (como seguir en follow_user). Invitar, retirar y volver a
        -- invitar no le llena el teléfono, y así tampoco se salta los 7 días de «rechazar».
        if not exists (select 1 from public.league_invites i
                        where i.user_id = v_user and i.invited_by = v_uid and i.id <> v_id
                          and i.created_at > now() - interval '1 day') then
          v_tag := 'invitacion:' || v_id::text;
          begin
            insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
            values (v_user, left(coalesce(v_from, 'Alguien') || ' te invitó a ' || l.name, 200), 'Toca para ver la invitación y unirte.',
                    '/invitacion/' || v_id::text, v_tag, 604800, 'normal');
            if exists (select 1 from public.push_outbox o where o.user_id = v_user and o.tag = v_tag and o.sent_at is null) then
              v_queued := true;
            end if;
          exception when others then
            raise warning 'push de invitación %: %', v_user, sqlerrm;
          end;
        end if;
      end if;
    end if;
    v_results := v_results || jsonb_build_array(jsonb_build_object('userId', v_user, 'status', v_status));
  end loop;

  if v_queued then
    perform private.kick_send_push();
  end if;
  return jsonb_build_object('sent', v_sent, 'results', v_results);
end $$;

-- La cuenta invitada acepta o rechaza. Ya decidida: devuelve cómo quedó {status, leagueId}.
-- Aceptar: miembro, su jugador (p_prefer = «¿Quién eres?»: deja el reclamo, como join_league) y push a quien
-- invitó → {status: 'accepted', leagueId, playerId, claimId}. Si ya no vale (private.invite_ok: la liga ya no es
-- pública y quien invitó ya no es admin de ella, o quien invitó está bloqueado): queda 'cancelled' → {status:
-- 'cancelled', leagueId}. Rechazar → {status: 'declined', leagueId}.
create function public.respond_league_invite(p_invite uuid, p_accept boolean, p_prefer uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  i public.league_invites;
  l public.leagues;
  v_name text;
  v_player uuid;
  v_tag text;
begin
  select * into i from public.league_invites x where x.id = p_invite and x.user_id = v_uid for update;
  if i.id is null then
    perform private.fail('no_existe');
  end if;
  if p_accept is null then
    perform private.fail('invalido');
  end if;
  if i.status <> 'pending' then
    return jsonb_build_object('status', i.status, 'leagueId', i.league_id);
  end if;

  if not p_accept then
    update public.league_invites x set status = 'declined', decided_at = now() where x.id = p_invite;
    return jsonb_build_object('status', 'declined', 'leagueId', i.league_id);
  end if;

  select * into l from public.leagues x where x.id = i.league_id;
  if not private.invite_ok(i.league_id, i.invited_by) then
    update public.league_invites x set status = 'cancelled', decided_at = now() where x.id = p_invite;
    return jsonb_build_object('status', 'cancelled', 'leagueId', i.league_id);
  end if;
  select p.name into v_name from public.profiles p where p.id = v_uid;
  if v_name is null then
    perform private.fail('no_existe');
  end if;
  insert into public.league_members (league_id, user_id, role, display_name) values (i.league_id, v_uid, 'member', v_name)
  on conflict (league_id, user_id) do nothing;
  v_player := private.ensure_player(i.league_id, v_uid, p_prefer);
  -- El trigger de league_members ya la dejó aceptada si entró ahora; si ya era miembro, aquí.
  update public.league_invites x set status = 'accepted', decided_at = now() where x.id = p_invite and x.status = 'pending';

  if i.invited_by is not null and exists (select 1 from public.profiles p where p.id = i.invited_by and p.blocked_at is null) then
    v_tag := 'invitacion-ok:' || i.id::text;
    begin
      insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
      values (i.invited_by, left(v_name || ' aceptó tu invitación', 200), left('Ya está en ' || l.name || '.', 1000),
              '/l/' || i.league_id::text, v_tag, 86400, 'normal');
      if exists (select 1 from public.push_outbox o where o.user_id = i.invited_by and o.tag = v_tag and o.sent_at is null) then
        perform private.kick_send_push();
      end if;
    exception when others then
      raise warning 'push de invitación aceptada %: %', i.invited_by, sqlerrm;
    end;
  end if;

  return jsonb_build_object('status', 'accepted', 'leagueId', i.league_id, 'playerId', v_player,
    'claimId', (select c.id from public.player_claims c where c.league_id = i.league_id and c.user_id = v_uid and c.status = 'pending'));
end $$;

-- Quien invitó o un admin de la liga la retira. Ya decidida: nada.
create function public.cancel_league_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  i public.league_invites;
begin
  select * into i from public.league_invites x where x.id = p_invite for update;
  if i.id is null then
    perform private.fail('no_existe');
  end if;
  if i.invited_by is distinct from v_uid and not private.is_admin(i.league_id) then
    perform private.deny();
  end if;
  if i.status <> 'pending' then
    return;
  end if;
  update public.league_invites x set status = 'cancelled', decided_at = now() where x.id = p_invite;
end $$;

-- Mis invitaciones pendientes que todavía valen (private.invite_ok), la más nueva primero (hasta 50): [{id,
-- leagueId, leagueName, sport, kind, visibility, members, invitedBy: {id, name, username} | null, createdAt}].
create function public.my_league_invites() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id,
             'leagueId', x.league_id,
             'leagueName', x.league_name,
             'sport', x.sport,
             'kind', x.kind,
             'visibility', x.visibility,
             'members', x.members,
             'invitedBy', case when x.invited_by is null then null
                               else jsonb_build_object('id', x.invited_by, 'name', x.from_name, 'username', x.from_username) end,
             'createdAt', private.iso(x.created_at))
             order by x.created_at desc, x.id desc)
      from (select i.id, i.league_id, i.invited_by, i.created_at, l.name as league_name, l.sport, l.kind, l.visibility,
                   (select count(*) from public.league_members m where m.league_id = l.id)::integer as members,
                   p.name as from_name, p.username as from_username
              from public.league_invites i
              join public.leagues l on l.id = i.league_id
              left join public.profiles p on p.id = i.invited_by
             where i.user_id = v_uid and i.status = 'pending' and private.invite_ok(i.league_id, i.invited_by)
             order by i.created_at desc, i.id desc
             limit 50) x), '[]'::jsonb);
end $$;

-- Una invitación para la pantalla /invitacion/<id>: solo la cuenta invitada (o el superadmin); cualquier otra, null.
-- {id, status, createdAt, invitedBy: {id, name, username} | null, mine, member, league: {id, name, sport, kind,
--  visibility, venue, schedule, seasonStart, seasonEnd, members}, players: [{id, name}]}. mine: es para la cuenta
-- de la sesión (el superadmin la ve, pero no la responde); member: la cuenta invitada ya está en la liga. Una
-- pendiente que ya no vale (private.invite_ok) sale como 'cancelled'. players: los libres («¿Quién eres?»: sin
-- cuenta, no menores y sin reclamo pendiente), por nombre, hasta 500, solo mientras está pendiente y vale. Lugar,
-- horario, temporada y cuántos son: solo mientras vale o si la cuenta puede ver la liga (si no, null: una liga que
-- pasó a privada no se muestra a quien ya no tiene cómo entrar).
create function public.league_invite_details(p_invite uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  i public.league_invites;
  l public.leagues;
  v_open boolean;
  v_show boolean;
begin
  select * into i from public.league_invites x where x.id = p_invite;
  if i.id is null or not (i.user_id = v_uid or private.is_super()) then
    return null;
  end if;
  select * into l from public.leagues x where x.id = i.league_id;
  v_open := i.status = 'pending' and private.invite_ok(i.league_id, i.invited_by);
  v_show := v_open or l.id in (select private.readable_leagues());
  return jsonb_build_object(
    'id', i.id,
    'status', case when i.status = 'pending' and not v_open then 'cancelled' else i.status end,
    'createdAt', private.iso(i.created_at),
    'invitedBy', (select jsonb_build_object('id', p.id, 'name', p.name, 'username', p.username)
                    from public.profiles p where p.id = i.invited_by),
    'mine', i.user_id = v_uid,
    'member', exists (select 1 from public.league_members m where m.league_id = l.id and m.user_id = i.user_id),
    'league', jsonb_build_object(
      'id', l.id,
      'name', l.name,
      'sport', l.sport,
      'kind', l.kind,
      'visibility', l.visibility,
      'venue', case when v_show then l.venue end,
      'schedule', case when v_show then l.schedule end,
      'seasonStart', case when v_show then l.season_start end,
      'seasonEnd', case when v_show then l.season_end end,
      'members', case when v_show then (select count(*) from public.league_members m where m.league_id = l.id)::integer end),
    'players', case when not v_open then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.name, f.id)
        from (select p.id, p.name from public.players p
               where p.league_id = l.id and p.user_id is null and not p.is_minor
                 and not exists (select 1 from public.player_claims c where c.player_id = p.id and c.status = 'pending')
               order by p.name, p.id
               limit 500) f), '[]'::jsonb) end);
end $$;

-- =====================================================================
-- Permisos: las RPC solo con sesión; las ayudas, nadie de la app
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array['set_username', 'username_status', 'search_people', 'invite_to_league', 'respond_league_invite',
                                 'cancel_league_invite', 'my_league_invites', 'league_invite_details', 'public_profile', 'follow_list'];
  v_private constant text[] := array['username_reserved', 'username_clean', 'username_ok', 'username_base', 'pick_username',
                                     'profiles_username', 'rate_take', 'social_can_see', 'emit_league_invites',
                                     'accept_invites_on_join', 'cancel_invites_on_leave', 'invite_ok', 'people_item'];
begin
  for f in select p.oid::regprocedure as sig, n.nspname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and p.proname = any (v_rpc))
               or (n.nspname = 'private' and p.proname = any (v_private)) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
