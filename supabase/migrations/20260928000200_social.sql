-- MatchMate · Social: seguir cuentas, «me gusta» en los juegos de todos los deportes y el perfil público.
--
-- - public.follows: quién sigue a quién (follower_id → followee_id). Directo, cada cuenta lee solo sus filas (a
--   quién sigue y quién la sigue; el superadmin, todas): lo demás (números y listas de otros) va por las RPC, que
--   miran quién se ve. Se escribe solo con follow_user / unfollow_user (idempotentes, con ritmo: 60 cambios
--   por hora). Seguir manda un push «<nombre> te empezó a seguir» (uno por persona y día) y avisa en tiempo real
--   a 'user:<seguido>' ('follow'). No se sigue a una cuenta bloqueada ni a alguien que no se ve (ver abajo).
-- - Me gusta: el boliche ya tiene `reactions` (una por persona y juego: 'like' o 'felicitar'); un «me gusta»
--   del perfil es una reacción 'like' y cualquier reacción cuenta como me gusta. Para los partidos (raqueta y
--   equipos), las tarjetas de golf y los resultados de natación está public.game_likes: un me gusta por persona
--   y juego (en un partido, el juego es de cada jugador: «le gustó tu partido»). Se escribe solo con
--   set_game_like, que exige ver la liga (pública, o privada siendo miembro) y que la liga no tenga menores.
-- - Qué se ve de otra cuenta (public_profile, profile_games, profile_stats, follow_list): solo lo de ligas que
--   la cuenta que mira puede leer y sin menores (en esas no hay nada social). Una cuenta «se ve» si es la propia,
--   si comparte una liga, si es miembro de una liga pública, o si una de las dos sigue a la otra (el superadmin, a
--   todas). Si no se ve, public_profile da null y las listas salen vacías.
-- - Avisos de la campana (social_notices): «te empezó a seguir» y «le gustó tu juego» (partidos, golf y natación;
--   los del boliche ya llegan por las reacciones de la liga).
--
-- Todas las RPC pasan por private.require_uid() (una cuenta bloqueada no sigue ni da me gusta) y se ejecutan solo
-- con sesión. Páginas de hasta 50. Tiempo real: 'user:<id>' con 'follow' {op, user} y 'like' {op, kind, id}.

-- =====================================================================
-- Tablas
-- =====================================================================

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
-- Seguidores de alguien (más nuevos primero) y a quién sigue (la clave primaria ya empieza por follower_id).
create index follows_followee_idx on public.follows (followee_id, created_at desc);
create index follows_follower_idx on public.follows (follower_id, created_at desc);

alter table public.follows enable row level security;
create policy follows_read on public.follows for select to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()) or (select private.is_super()));
revoke all on public.follows from public, anon, authenticated;
grant select on public.follows to authenticated;

-- Me gusta en partidos, tarjetas de golf y resultados de natación. `player_id` es de quién es el juego y
-- `league_id` sale del juego (el trigger game_likes_fill lo copia; nunca del cliente).
create table public.game_likes (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  player_id uuid not null,
  kind text not null check (kind in ('match', 'golf', 'swim')),
  match_id uuid,
  golf_card_id uuid,
  swim_entry_id uuid references public.swim_entries (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (case kind
           when 'match' then match_id is not null and golf_card_id is null and swim_entry_id is null
           when 'golf' then golf_card_id is not null and match_id is null and swim_entry_id is null
           else swim_entry_id is not null and match_id is null and golf_card_id is null
         end),
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade,
  foreign key (match_id, league_id) references public.matches (id, league_id) on delete cascade,
  foreign key (golf_card_id, league_id) references public.golf_cards (id, league_id) on delete cascade
);
create unique index game_likes_match_key on public.game_likes (match_id, player_id, user_id) where match_id is not null;
create unique index game_likes_golf_key on public.game_likes (golf_card_id, user_id) where golf_card_id is not null;
create unique index game_likes_swim_key on public.game_likes (swim_entry_id, user_id) where swim_entry_id is not null;
create index game_likes_player_idx on public.game_likes (player_id, created_at desc);
create index game_likes_user_idx on public.game_likes (user_id);
create index game_likes_league_idx on public.game_likes (league_id);

alter table public.game_likes enable row level security;
create policy game_likes_read on public.game_likes for select to authenticated
  using (league_id in (select private.readable_leagues()));
revoke all on public.game_likes from public, anon, authenticated;
grant select on public.game_likes to authenticated;

-- =====================================================================
-- Funciones de ayuda
-- =====================================================================

-- ¿La cuenta que mira ve a p_user? La propia, el superadmin, alguien con quien comparte una liga, un miembro de
-- una liga pública, o si una de las dos sigue a la otra.
create function private.social_can_see(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (select 1 from public.profiles p where p.id = p_user) and (
    p_user = (select auth.uid())
    or (select private.is_super())
    or exists (select 1 from public.league_members m join public.leagues l on l.id = m.league_id
                where m.user_id = p_user and (l.visibility = 'public' or l.id in (select private.my_leagues())))
    or exists (select 1 from public.follows f
                where (f.follower_id = (select auth.uid()) and f.followee_id = p_user)
                   or (f.follower_id = p_user and f.followee_id = (select auth.uid()))))
$$;

-- ¿Lo social de esa liga es para la cuenta que mira? La ve (pública, miembro o superadmin) y no tiene menores.
create function private.social_league_ok(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.leagues l
                  where l.id = p_league and not l.has_minors
                    and (l.visibility = 'public' or private.is_member(l.id) or private.is_super()))
$$;

-- Jugadores de esas cuentas en las ligas cuyo contenido social ve la cuenta que mira (con el deporte, si se pide).
create function private.social_players(p_users uuid[], p_sport text default null)
returns table (player_id uuid, league_id uuid, user_id uuid, sport text, league_name text, tz text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.league_id, p.user_id, l.sport, l.name, l.tz
    from public.players p
    join public.leagues l on l.id = p.league_id
   where p.user_id = any (p_users)
     and not l.has_minors
     and (p_sport is null or l.sport = p_sport)
     and (l.visibility = 'public' or (select private.is_super()) or l.id in (select private.my_leagues()))
$$;

-- Lado del partido de un jugador: el de su alineación (match_players) o, si no está en ella, el del equipo o la
-- pareja de temporada donde juega (plantilla). null = no juega en ese partido.
create function private.social_match_side(p_match uuid, p_player uuid) returns smallint
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select mp.side from public.match_players mp where mp.match_id = p_match and mp.player_id = p_player),
    (select min(s.side) from public.match_sides s join public.team_players tp on tp.team_id = s.team_id
      where s.match_id = p_match and tp.player_id = p_player
     having count(distinct s.side) = 1))
$$;

-- Cómo le fue a ese lado: 'win', 'loss', 'draw' o null (W.O. de los dos, o sin resultado).
create function private.social_match_result(p_status text, p_winner smallint, p_walkover smallint, p_side smallint) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_winner is not null then case when p_winner = p_side then 'win' else 'loss' end
    when p_status = 'walkover' then case when p_walkover = p_side then 'loss' when p_walkover in (1, 2) then 'win' end
    when p_status in ('finished', 'confirmed') then 'draw'
  end
$$;

-- Hora del juego para ordenar: el día del evento a su hora (o al mediodía) en la zona de la liga, en milisegundos
-- (así el cursor de las páginas vuelve exacto desde el texto ISO).
create function private.social_event_at(p_date date, p_time time, p_tz text) returns timestamptz
language sql stable set search_path = '' as $$
  select date_trunc('milliseconds', (p_date + coalesce(p_time, time '12:00')) at time zone coalesce(nullif(p_tz, ''), 'America/Santo_Domingo'))
$$;

-- Los juegos de esas cuentas que ve la cuenta que mira, del más nuevo al más viejo: boliche (participación con al
-- menos un juego anotado), partidos con resultado, tarjetas de golf con golpes y resultados de natación.
-- Página: los de antes de (p_before, p_before_key); p_limit null = todos (para contar).
create function private.social_items(p_users uuid[], p_sport text, p_before timestamptz, p_before_key text, p_limit integer)
returns table (key text, kind text, target uuid, player_id uuid, user_id uuid, league_id uuid, sport text, league_name text,
               event_id uuid, at timestamptz, side smallint)
language sql stable security definer set search_path = '' as $$
  with sp as materialized (
    select * from private.social_players(p_users, p_sport)
  ),
  bowling as (
    select 'b:' || x.id::text as key, 'bowling'::text as kind, x.id as target, sp.player_id, sp.user_id, sp.league_id, sp.sport,
           sp.league_name, x.event_id, private.social_event_at(e.date, e.start_time, sp.tz) as at, null::smallint as side
      from sp
      join public.entries x on x.player_id = sp.player_id
      join public.events e on e.id = x.event_id
     where exists (select 1 from unnest(x.scores) s where s is not null)
  ),
  mine as (
    -- Alineación primero; si no está en ella, la plantilla del equipo o la pareja de ese lado.
    select distinct on (z.match_id, z.player_id) z.match_id, z.player_id, z.side
      from (
        select mp.match_id, mp.player_id, mp.side, 0 as pri
          from sp join public.match_players mp on mp.player_id = sp.player_id
        union all
        select s.match_id, tp.player_id, s.side, 1 as pri
          from sp join public.team_players tp on tp.player_id = sp.player_id
          join public.match_sides s on s.team_id = tp.team_id
      ) z
     order by z.match_id, z.player_id, z.pri
  ),
  matches as (
    select 'm:' || m.id::text || ':' || sp.player_id::text as key, 'match'::text as kind, m.id as target, sp.player_id, sp.user_id,
           sp.league_id, sp.sport, sp.league_name, m.event_id,
           date_trunc('milliseconds', coalesce(m.scheduled_at, m.proposed_at, m.created_at)) as at, mine.side
      from mine
      join sp on sp.player_id = mine.player_id
      join public.matches m on m.id = mine.match_id
     where m.status in ('finished', 'confirmed', 'walkover')
  ),
  golf as (
    select 'g:' || c.id::text as key, 'golf'::text as kind, c.id as target, sp.player_id, sp.user_id, sp.league_id, sp.sport,
           sp.league_name, c.event_id, private.social_event_at(e.date, e.start_time, sp.tz) as at, null::smallint as side
      from sp
      join public.golf_cards c on c.player_id = sp.player_id
      join public.events e on e.id = c.event_id
     where c.scored_at is not null and exists (select 1 from unnest(c.strokes) s where s is not null)
  ),
  swim as (
    select 's:' || se.id::text as key, 'swim'::text as kind, se.id as target, sp.player_id, sp.user_id, sp.league_id, sp.sport,
           sp.league_name, se.event_id, date_trunc('milliseconds', se.result_at) as at, null::smallint as side
      from sp
      join public.swim_entries se on se.player_id = sp.player_id
     where se.result_at is not null
  ),
  everything as (
    (select * from bowling b where p_before is null or b.at < p_before or (b.at = p_before and b.key < p_before_key)
      order by b.at desc, b.key desc limit p_limit)
    union all
    (select * from matches b where p_before is null or b.at < p_before or (b.at = p_before and b.key < p_before_key)
      order by b.at desc, b.key desc limit p_limit)
    union all
    (select * from golf b where p_before is null or b.at < p_before or (b.at = p_before and b.key < p_before_key)
      order by b.at desc, b.key desc limit p_limit)
    union all
    (select * from swim b where p_before is null or b.at < p_before or (b.at = p_before and b.key < p_before_key)
      order by b.at desc, b.key desc limit p_limit)
  )
  select * from everything u order by u.at desc, u.key desc limit p_limit
$$;

-- Me gusta de un juego: cuántos y si la cuenta que mira ya le dio. En el boliche cuenta cualquier reacción.
create function private.social_likes(p_kind text, p_target uuid, p_player uuid, out likes integer, out liked boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
begin
  if p_kind = 'bowling' then
    select count(*)::integer, coalesce(bool_or(r.user_id = v_me), false) into likes, liked
      from public.reactions r where r.entry_id = p_target;
  elsif p_kind = 'match' then
    select count(*)::integer, coalesce(bool_or(g.user_id = v_me), false) into likes, liked
      from public.game_likes g where g.match_id = p_target and g.player_id = p_player;
  elsif p_kind = 'golf' then
    select count(*)::integer, coalesce(bool_or(g.user_id = v_me), false) into likes, liked
      from public.game_likes g where g.golf_card_id = p_target;
  else
    select count(*)::integer, coalesce(bool_or(g.user_id = v_me), false) into likes, liked
      from public.game_likes g where g.swim_entry_id = p_target;
  end if;
end $$;

-- Una página de juegos en JSON (camelCase), con los me gusta de cada uno y el detalle de su deporte.
create function private.social_games(p_users uuid[], p_sport text, p_limit integer, p_before timestamptz, p_before_key text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_detail jsonb;
  v_url text;
  v_likes integer;
  v_liked boolean;
  r record;
begin
  for r in
    select i.key as k, i.kind as kd, i.target as tg, i.player_id as pid, i.user_id as uid, i.league_id as lid, i.sport as sp,
           i.league_name as lname, i.event_id as eid, i.at as t, i.side as sd,
           pr.name as uname, e.type as etype, e.name as ename, e.date as edate
      from private.social_items(p_users, p_sport, p_before, p_before_key, p_limit) i
      join public.profiles pr on pr.id = i.user_id
      left join public.events e on e.id = i.event_id
     order by i.at desc, i.key desc
  loop
    v_detail := '{}'::jsonb;
    if r.kd = 'bowling' then
      select jsonb_build_object(
               'scores', coalesce(jsonb_agg(s.v order by s.i), '[]'::jsonb),
               'verified', coalesce(jsonb_agg(x.photos[s.i::integer] is not null order by s.i), '[]'::jsonb),
               'series', coalesce(sum(s.v), 0),
               'high', coalesce(max(s.v), 0))
        into v_detail
        from public.entries x
        cross join lateral unnest(x.scores) with ordinality as s (v, i)
       where x.id = r.tg and s.v is not null;
      v_url := '/l/' || r.lid::text || '/juegos?juego=' || r.tg::text || '&evento=' || r.eid::text;
    elsif r.kd = 'match' then
      select jsonb_build_object(
               'side', r.sd,
               'mine', (select s.label from public.match_sides s where s.match_id = m.id and s.side = r.sd),
               'opponent', (select s.label from public.match_sides s where s.match_id = m.id and s.side = 3 - r.sd),
               'score', nullif(btrim(coalesce(m.score ->> 'text', '')), ''),
               'result', private.social_match_result(m.status, m.winner_side, m.walkover_side, r.sd),
               'walkover', m.status = 'walkover',
               'final', private.match_final(m.status, m.proposed_at),
               'status', m.status,
               'stage', nullif(m.stage, ''),
               'round', m.round)
        into v_detail
        from public.matches m where m.id = r.tg;
      v_url := '/l/' || r.lid::text || '/juegos?partido=' || r.tg::text;
    elsif r.kd = 'golf' then
      select jsonb_build_object(
               'course', nullif(rd.course_name, ''),
               'holes', case when rd.nine in ('front', 'back') then 9 else rd.holes end,
               'played', (select count(*) from unnest(c.strokes) s where s is not null),
               'gross', (select coalesce(sum(s), 0) from unnest(c.strokes) s),
               'playingHcp', c.playing_hcp,
               'signed', c.status = 'firmada',
               'dq', c.dq)
        into v_detail
        from public.golf_cards c join public.golf_rounds rd on rd.event_id = c.event_id
       where c.id = r.tg;
      v_url := '/l/' || r.lid::text || '/e/' || r.eid::text;
    else
      select jsonb_build_object(
               'distance', ev.distance,
               'stroke', ev.stroke,
               'pool', ev.pool,
               'timeCs', se.time_cs,
               'status', se.status,
               'place', case when se.status = 'ok' and se.time_cs is not null then
                          (select count(*) + 1 from public.swim_entries o
                            where o.swim_event_id = se.swim_event_id and o.status = 'ok' and o.time_cs < se.time_cs)::integer
                        end)
        into v_detail
        from public.swim_entries se join public.swim_events ev on ev.id = se.swim_event_id
       where se.id = r.tg;
      v_url := '/l/' || r.lid::text || '/e/' || r.eid::text;
    end if;

    select l.likes, l.liked into v_likes, v_liked from private.social_likes(r.kd, r.tg, r.pid) l;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'key', r.k,
      'kind', r.kd,
      'id', r.tg,
      'playerId', r.pid,
      'userId', r.uid,
      'userName', r.uname,
      'leagueId', r.lid,
      'leagueName', r.lname,
      'sport', r.sp,
      'eventId', r.eid,
      'eventName', coalesce(r.ename, ''),
      'eventType', r.etype,
      'eventDate', case when r.edate is null then null else to_char(r.edate, 'YYYY-MM-DD') end,
      'at', private.iso(r.t),
      'url', v_url,
      'likes', v_likes,
      'likedByMe', v_liked,
      'detail', coalesce(v_detail, '{}'::jsonb)));
  end loop;
  return v_out;
end $$;

-- Trigger: la liga y el jugador de un me gusta salen del juego (golf y natación); en un partido, el jugador tiene
-- que jugarlo. Nunca se confía en lo que manda quien escribe.
create function private.game_likes_fill() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'golf' then
    select c.league_id, c.player_id into new.league_id, new.player_id from public.golf_cards c where c.id = new.golf_card_id;
  elsif new.kind = 'swim' then
    select s.league_id, s.player_id into new.league_id, new.player_id from public.swim_entries s where s.id = new.swim_entry_id;
  else
    new.league_id := (select m.league_id from public.matches m where m.id = new.match_id);
    if new.league_id is not null and private.social_match_side(new.match_id, new.player_id) is null then
      perform private.fail('invalido');
    end if;
  end if;
  if new.league_id is null or new.player_id is null then
    perform private.fail('no_existe');
  end if;
  return new;
end $$;

create trigger game_likes_fill before insert on public.game_likes for each row execute function private.game_likes_fill();

-- Ritmo de seguir / dar me gusta: p_max cambios por hora y cuenta (solo cuentan los que cambian algo).
create function private.social_pace(p_kind text, p_max integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.rate_blocked(private.rate_key(p_kind), p_max, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  perform private.rate_hit(private.rate_key(p_kind), interval '1 hour');
end $$;

-- =====================================================================
-- Seguir
-- =====================================================================

-- Seguir a una cuenta. Idempotente (seguirla otra vez no cambia nada ni vuelve a avisar). No a uno mismo
-- ('invalido'), ni a una cuenta que no existe ('no_existe'), bloqueada o que no se ve ('no_permitido').
-- Devuelve {following: true, followers}.
create function public.follow_user(p_user uuid) returns jsonb
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
  if private.is_blocked(p_user) or not private.social_can_see(p_user) then
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

-- Dejar de seguir. Idempotente (si no la seguía, no pasa nada). Devuelve {following: false, followers}.
create function public.unfollow_user(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
begin
  if p_user is null or p_user = v_me then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from public.follows f where f.follower_id = v_me and f.followee_id = p_user) then
    perform private.social_pace('follow', 60);
    delete from public.follows f where f.follower_id = v_me and f.followee_id = p_user;
    perform private.emit('user:' || p_user::text, 'follow', jsonb_build_object('op', 'delete', 'user', v_me));
  end if;
  return jsonb_build_object('following', false, 'followers', (select count(*) from public.follows f where f.followee_id = p_user)::integer);
end $$;

-- Seguidores ('followers') o a quién sigue ('following') una cuenta que se ve, más nuevos primero:
-- [{id, name, at, isFollowing, followsYou, isMe}]. Página: los de antes de (p_before, p_before_id); hasta 50.
-- Solo salen las cuentas que ve quien mira (el número del perfil las cuenta todas; la lista no destapa nombres).
create function public.follow_list(p_user uuid, p_kind text, p_limit integer default 30, p_before timestamptz default null, p_before_id uuid default null)
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
             'at', private.iso(x.at),
             'isFollowing', exists (select 1 from public.follows f where f.follower_id = v_me and f.followee_id = x.uid),
             'followsYou', exists (select 1 from public.follows f where f.follower_id = x.uid and f.followee_id = v_me),
             'isMe', x.uid = v_me)
             order by x.at desc, x.uid desc)
      from (
        select case when p_kind = 'followers' then f.follower_id else f.followee_id end as uid,
               date_trunc('milliseconds', f.created_at) as at, p.name
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

-- =====================================================================
-- Perfil
-- =====================================================================

-- Perfil de una cuenta con lo que ve la cuenta que mira: {id, name, since, sports[], followers, following,
-- likesReceived, gamesCount, isFollowing, followsYou, isMe}. null si no existe o no se ve.
create function public.public_profile(p_user uuid) returns jsonb
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

-- Juegos de una cuenta que se ve, más nuevos primero (hasta 50 por página; p_sport filtra por deporte). Cada uno:
-- {key, kind: bowling|match|golf|swim, id, playerId, userId, userName, leagueId, leagueName, sport, eventId,
--  eventName, eventType, eventDate, at, url, likes, likedByMe, detail}. Página siguiente: p_before = at y
-- p_before_key = key del último.
create function public.profile_games(p_user uuid, p_limit integer default 20, p_before timestamptz default null, p_before_key text default null, p_sport text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_uid();
  if not private.social_can_see(p_user) then
    return '[]'::jsonb;
  end if;
  return private.social_games(array[p_user], p_sport, private.clamp_int(p_limit, 1, 50, 20), p_before, coalesce(p_before_key, ''));
end $$;

-- Juegos recientes de las cuentas que sigo (para el inicio), con el mismo formato de profile_games.
create function public.following_games(p_sport text default null, p_limit integer default 20, p_before timestamptz default null, p_before_key text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_users uuid[];
begin
  v_users := array(select f.followee_id from public.follows f where f.follower_id = v_me);
  if cardinality(v_users) = 0 then
    return '[]'::jsonb;
  end if;
  return private.social_games(v_users, p_sport, private.clamp_int(p_limit, 1, 50, 20), p_before, coalesce(p_before_key, ''));
end $$;

-- Números por deporte de una cuenta que se ve (lo que ve la cuenta que mira):
-- {bowling: {sessions, series: [[pinos verificados de cada participación]]} | null,
--  matches: [{sport, played, won, lost, drawn}], golf: {rounds, best18, avg18, best9} | null,
--  swim: {results, bests: [{distance, stroke, pool, timeCs}]} | null}. null si no se ve.
create function public.profile_stats(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_uid();
  if not private.social_can_see(p_user) then
    return null;
  end if;
  return (
    with items as materialized (
      select * from private.social_items(array[p_user], null, null, null, null)
    ),
    -- Boliche: los pinos que cuentan (verificados) de cada participación, las 500 más nuevas.
    bowling as (
      select z.at, z.sc
        from (
          select i.at, to_jsonb(array(select s.v from unnest(x.scores) with ordinality as s (v, n)
                                       where s.v is not null and x.photos[s.n::integer] is not null order by s.n)) as sc
            from items i join public.entries x on x.id = i.target
           where i.kind = 'bowling'
           order by i.at desc
           limit 500
        ) z
       where jsonb_array_length(z.sc) > 0
    ),
    -- Partidos: los que ya son finales (confirmados, W.O. o propuestos hace más de 48 h).
    results as (
      select i.sport, private.social_match_result(m.status, m.winner_side, m.walkover_side, i.side) as r
        from items i join public.matches m on m.id = i.target
       where i.kind = 'match' and private.match_final(m.status, m.proposed_at)
    ),
    by_sport as (
      select x.sport,
             count(*)::integer as played,
             (count(*) filter (where x.r = 'win'))::integer as won,
             (count(*) filter (where x.r = 'loss'))::integer as lost,
             (count(*) filter (where x.r = 'draw'))::integer as drawn
        from results x
       where x.r is not null
       group by x.sport
    ),
    -- Golf: rondas con golpes; mejor y promedio (bruto) de las de 18 hoyos completas, mejor de 9.
    golf as (
      select case when rd.nine in ('front', 'back') then 9 else rd.holes end as holes,
             (select count(*) from unnest(c.strokes) s where s is not null)::integer as played,
             (select coalesce(sum(s), 0) from unnest(c.strokes) s)::integer as gross,
             c.dq
        from items i
        join public.golf_cards c on c.id = i.target
        join public.golf_rounds rd on rd.event_id = c.event_id
       where i.kind = 'golf'
    ),
    -- Natación: mejor tiempo por prueba (distancia, estilo y piscina).
    swim as (
      select ev.distance, ev.stroke, ev.pool, min(se.time_cs) as best
        from items i
        join public.swim_entries se on se.id = i.target
        join public.swim_events ev on ev.id = se.swim_event_id
       where i.kind = 'swim' and se.status = 'ok' and se.time_cs is not null
       group by ev.distance, ev.stroke, ev.pool
    )
    select jsonb_build_object(
      'bowling', (select case when count(*) = 0 then null
                              else jsonb_build_object('sessions', count(*)::integer, 'series', jsonb_agg(b.sc order by b.at desc)) end
                    from bowling b),
      'matches', (select coalesce(jsonb_agg(jsonb_build_object('sport', y.sport, 'played', y.played, 'won', y.won, 'lost', y.lost,
                                                               'drawn', y.drawn)
                                            order by st.sort_order, y.sport), '[]'::jsonb)
                    from by_sport y left join public.sport_status st on st.id = y.sport),
      'golf', (select case when count(*) = 0 then null else jsonb_build_object(
                        'rounds', count(*)::integer,
                        'best18', min(g.gross) filter (where g.holes = 18 and g.played = 18 and not g.dq),
                        'avg18', round(avg(g.gross) filter (where g.holes = 18 and g.played = 18 and not g.dq))::integer,
                        'best9', min(g.gross) filter (where g.holes = 9 and g.played = 9 and not g.dq)) end
                 from golf g),
      'swim', (select case when (select count(*) from items i where i.kind = 'swim') = 0 then null else jsonb_build_object(
                        'results', (select count(*) from items i where i.kind = 'swim')::integer,
                        'bests', coalesce(jsonb_agg(jsonb_build_object('distance', b.distance, 'stroke', b.stroke, 'pool', b.pool,
                                                                       'timeCs', b.best)
                                                    order by b.stroke, b.distance, b.pool), '[]'::jsonb)) end
                 from swim b)));
end $$;

-- =====================================================================
-- Me gusta
-- =====================================================================

-- Me gusta (p_liked true) o quitarlo (false) en un juego: 'bowling' (p_id = participación: reacción 'like'; si ya
-- tenía una reacción, se queda como está), 'match' (p_id = partido y p_player = el jugador cuyo juego es),
-- 'golf' (tarjeta) o 'swim' (resultado). Exige ver la liga y que no tenga menores. Devuelve {likes, liked}.
create function public.set_game_like(p_kind text, p_id uuid, p_liked boolean, p_player uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_league uuid;
  v_player uuid;
  v_owner uuid;
  v_status text;
  v_name text;
  v_changed boolean := false;
  e public.entries;
  v_likes integer;
  v_liked boolean;
begin
  if p_kind is null or p_kind not in ('bowling', 'match', 'golf', 'swim') or p_id is null or p_liked is null then
    perform private.fail('invalido');
  end if;

  if p_kind = 'bowling' then
    select * into e from public.entries x where x.id = p_id;
    v_league := e.league_id;
    v_player := e.player_id;
  elsif p_kind = 'match' then
    select m.league_id, m.status into v_league, v_status from public.matches m where m.id = p_id;
    v_player := p_player;
  elsif p_kind = 'golf' then
    select c.league_id, c.player_id into v_league, v_player from public.golf_cards c where c.id = p_id;
  else
    select s.league_id, s.player_id into v_league, v_player from public.swim_entries s where s.id = p_id;
  end if;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  if not private.social_league_ok(v_league) then
    perform private.deny();
  end if;
  -- Partido: el jugador tiene que ir (de quién es el juego). Para darle me gusta, que lo haya jugado y tenga
  -- resultado; quitarlo se puede siempre.
  if p_kind = 'match' and (v_player is null
                           or (p_liked and (v_status not in ('finished', 'confirmed', 'walkover')
                                            or private.social_match_side(p_id, v_player) is null))) then
    perform private.fail('invalido');
  end if;

  if p_liked then
    if p_kind = 'bowling' then
      if not exists (select 1 from public.reactions r where r.entry_id = p_id and r.user_id = v_me) then
        perform private.social_pace('like', 300);
        v_name := coalesce(private.my_display_name(v_league), (select p.name from public.profiles p where p.id = v_me), 'Jugador');
        insert into public.reactions (league_id, entry_id, event_id, player_id, user_id, author_name, type)
        values (e.league_id, e.id, e.event_id, e.player_id, v_me, left(v_name, 60), 'like')
        on conflict (entry_id, user_id) do nothing;
        v_changed := found;
      end if;
    elsif not exists (select 1 from public.game_likes g
                       where g.user_id = v_me
                         and ((p_kind = 'match' and g.match_id = p_id and g.player_id = v_player)
                           or (p_kind = 'golf' and g.golf_card_id = p_id)
                           or (p_kind = 'swim' and g.swim_entry_id = p_id))) then
      perform private.social_pace('like', 300);
      insert into public.game_likes (league_id, player_id, kind, match_id, golf_card_id, swim_entry_id, user_id)
      values (v_league, v_player, p_kind,
              case when p_kind = 'match' then p_id end,
              case when p_kind = 'golf' then p_id end,
              case when p_kind = 'swim' then p_id end,
              v_me);
      v_changed := true;
    end if;
  else
    if p_kind = 'bowling' then
      delete from public.reactions r where r.entry_id = p_id and r.user_id = v_me;
    elsif p_kind = 'match' then
      delete from public.game_likes g where g.match_id = p_id and g.player_id = v_player and g.user_id = v_me;
    elsif p_kind = 'golf' then
      delete from public.game_likes g where g.golf_card_id = p_id and g.user_id = v_me;
    else
      delete from public.game_likes g where g.swim_entry_id = p_id and g.user_id = v_me;
    end if;
    v_changed := found;
  end if;

  if v_changed then
    v_owner := (select p.user_id from public.players p where p.id = v_player);
    if v_owner is not null and v_owner <> v_me then
      perform private.emit('user:' || v_owner::text, 'like',
                           jsonb_build_object('op', case when p_liked then 'insert' else 'delete' end, 'kind', p_kind, 'id', p_id));
    end if;
  end if;

  select l.likes, l.liked into v_likes, v_liked from private.social_likes(p_kind, p_id, v_player) l;
  return jsonb_build_object('likes', v_likes, 'liked', v_liked);
end $$;

-- =====================================================================
-- Avisos de la campana
-- =====================================================================

-- Lo social de los últimos 30 días para la cuenta, más nuevo primero (hasta 50):
-- {kind: 'follow', at, userId, name} y {kind: 'like', at, userId, name, gameKind, id, playerId, leagueId,
-- leagueName, sport, url}. Los me gusta del boliche no salen aquí: ya llegan por las reacciones de cada liga.
create function public.social_notices(p_limit integer default 30) returns jsonb
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
       ) u
       order by u.at desc, u.k desc
       limit v_limit
      ) z
    ), '[]'::jsonb);
end $$;

-- =====================================================================
-- Permisos: las RPC nuevas solo con sesión; las ayudas, nadie de la app
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array[
    'follow_user', 'unfollow_user', 'follow_list', 'public_profile', 'profile_games', 'following_games', 'profile_stats',
    'set_game_like', 'social_notices'
  ];
  v_private constant text[] := array[
    'social_can_see', 'social_league_ok', 'social_players', 'social_match_side', 'social_match_result', 'social_event_at',
    'social_items', 'social_likes', 'social_games', 'game_likes_fill', 'social_pace'
  ];
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
