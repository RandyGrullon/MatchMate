-- MatchMate · Perfiles (dónde juega cada persona), compartir un partido como publicación, los equipos como perfil
-- (muro, seguidores, partidos, números e invitar dentro de la app) y las plataformas de esports. Contrato completo:
-- docs/perfiles-equipos-esports.md. Pruebas: tests/sql/perfiles-equipos-esports.test.ts.
--
-- 1. public.player_places (también sin sesión): las ligas que el que mira ve (private.social_players, sin menores) con
--    el resumen de cada una (lo mismo que profile_stats, por liga), los equipos (squads) y los equipos de esports.
-- 2. Compartir un juego: posts.game_kind / game_id / game_player (los tres o ninguno; game_player null en 'solo').
--    private.social_game_json arma un juego con la forma de profile_games (private.social_games lo usa ahora para cada
--    elemento, así hay una sola copia) y private.social_game_one(kind, id, player) da uno solo, o null si el que mira no
--    lo ve. public.create_post se borra y se crea con p_game_kind, p_game_id y p_game_player. private.post_json suma
--    'game' y 'hasGame' (y isMine / canDelete en false sin sesión: squad_posts ahora también sin sesión).
-- 3. Equipos como perfil: squad_page suma posts y likes; squad_followers (también sin sesión), squad_games,
--    squad_stats; squad_posts también sin sesión (lo público). Invitar dentro de la app: public.squad_invites (una
--    pendiente por equipo y persona; RLS sin lectura directa), invite_to_squad (el capitán, 50 por día), respond_squad_invite,
--    cancel_squad_invite, my_squad_invites, squad_pending_invites; entrar al equipo por cualquier camino (join_squad o
--    la invitación) deja aceptada la pendiente (trigger en squad_members). search_people se borra y se crea con p_squad.
--    Aviso (categoría 'liga', tag 'equipo:invitacion:<id>', url /equipos/<equipo>) y tiempo real 'invites' en
--    user:<invitado> (y user:<quien invitó>) {id, status, squad_id}.
-- 4. Esports: private.esp_game_platforms (la tabla del contrato), settings.platform para todos los juegos (una de las
--    plataformas del juego o 'crossplay' si tiene varias; sin la clave = la única o 'crossplay'), NBA 2K viejo
--    convertido (psn → playstation, steam → pc; un trigger hace lo mismo con lo que llegue de una app vieja y quita
--    platform '' en los demás juegos), esports_game_ids.platforms (derivada en los de una plataforma y en NBA 2K),
--    esports_save_game_id con p_platforms, esports_set_game_platforms, los códigos 'otra_plataforma' y
--    'sin_plataforma' de private.esp_member_ok, esports_refresh_entry_ids, esports_link_account con 'cerrado' y el
--    'volver' de esports-auth (private.esports_link_states.volver, esports_link_begin con p_volver y esports_link_take).
--
-- Redefine (desde su última versión): private.social_games (20260929001000_sueltos_logos.sql: cada elemento con
-- private.social_game_json, sin cambiar la forma), public.create_post y private.post_json, public.squad_page y
-- public.squad_posts (20261011000100_equipos_en_vivo.sql), public.search_people (20261009000100_red_social.sql),
-- private.esp_settings_ok, private.esp_member_ok, private.esp_snapshot, private.esp_game_id_json,
-- public.esports_save_game_id, public.esports_link_begin, public.esports_link_take y public.esports_link_account
-- (20261008000100_esports.sql). Una migración posterior que redefina alguna tiene que copiar esta.

-- =====================================================================
-- 1. Tablas y columnas
-- =====================================================================

-- Una publicación puede llevar un juego (de liga o suelto). Sin juego, igual que antes.
alter table public.posts
  add column game_kind text check (game_kind in ('bowling', 'match', 'golf', 'swim', 'solo')),
  add column game_id uuid,
  add column game_player uuid,
  add constraint posts_game_check check (
    (game_kind is null and game_id is null and game_player is null)
    or (game_kind = 'solo' and game_id is not null and game_player is null)
    or (game_kind in ('bowling', 'match', 'golf', 'swim') and game_id is not null and game_player is not null));

-- Con juego puede ir sin texto ni foto: el check de «texto o foto» se cambia por «texto, foto o juego».
do $$
declare
  c record;
begin
  for c in select x.conname from pg_constraint x
            where x.conrelid = 'public.posts'::regclass and x.contype = 'c'
              and pg_get_constraintdef(x.oid) like '%text <> %' and pg_get_constraintdef(x.oid) like '%photo_path IS NOT NULL%' loop
    execute format('alter table public.posts drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.posts add constraint posts_content_check check (text <> '' or photo_path is not null or game_kind is not null);

-- Invitaciones a un equipo. user_id: la cuenta invitada; invited_by: el capitán que invitó (null si se borró su cuenta);
-- decided_at: cuándo se aceptó, rechazó o canceló.
create table public.squad_invites (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default date_trunc('milliseconds', now()),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  check ((status = 'pending') = (decided_at is null)),
  check (invited_by is null or invited_by <> user_id)
);
create unique index squad_invites_pending on public.squad_invites (squad_id, user_id) where status = 'pending';
create index squad_invites_user on public.squad_invites (user_id, created_at desc);
create index squad_invites_sender on public.squad_invites (invited_by, created_at desc);
create index squad_invites_squad on public.squad_invites (squad_id, created_at desc);

alter table public.squad_invites enable row level security;
revoke all on public.squad_invites from public, anon, authenticated;

-- Esports: dónde juega cada persona con su ID ('pc', 'playstation', 'xbox', 'switch', 'mobile').
alter table public.esports_game_ids add column platforms text[] not null default '{}'
  check (platforms <@ array['pc', 'playstation', 'xbox', 'switch', 'mobile']::text[] and array_position(platforms, null) is null);
grant select (platforms) on public.esports_game_ids to authenticated;

-- «Conectar con…»: a qué pantalla de la app vuelve (una ruta de la app).
alter table private.esports_link_states add column volver text
  check (volver is null or (char_length(volver) between 1 and 200 and volver ~ '^/' and volver !~ '^//'
                            and volver !~ '[[:space:][:cntrl:]\\]'));

-- =====================================================================
-- 2. Perfil global: dónde juega cada persona
-- =====================================================================

-- Las ligas (las que el que mira ve, sin menores), los equipos y los equipos de esports de una cuenta (PlayerPlaces de
-- docs/perfiles-equipos-esports.md). También sin sesión. null si no existe, no se ve (private.social_can_see, como
-- public_profile) o esa cuenta bloqueó a la que mira (salvo al superadmin).
-- El resumen de cada liga agrupa lo de profile_stats: boliche (los juegos verificados: cuántos, promedio con un
-- decimal y el más alto), partidos ya firmes (raqueta, equipos y esports), golf (rondas y el mejor bruto de 18 hoyos
-- completos, o de 9 si no hay de 18) y natación (resultados). Primero las ligas y después los torneos; dentro, la de
-- actividad más reciente primero (sin juegos, al final, por nombre).
create function public.player_places(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
begin
  -- Sin sesión, private.social_can_see puede dar null: cuenta como «no se ve».
  if p_user is null or not exists (select 1 from public.profiles p where p.id = p_user)
     or not coalesce(private.social_can_see(p_user), false) then
    return null;
  end if;
  if v_me is not null and not private.is_super()
     and exists (select 1 from public.user_blocks b where b.blocker_id = p_user and b.blocked_id = v_me) then
    return null;
  end if;
  return (
    with sp as materialized (
      select * from private.social_players(array[p_user], null)
    ),
    items as materialized (
      select * from private.social_items(array[p_user], null, null, null, null) i where i.league_id is not null
    ),
    bowl as (
      select i.league_id, s.v
        from items i
        join public.entries x on x.id = i.target
        cross join lateral unnest(x.scores) with ordinality as s (v, n)
       where i.kind = 'bowling' and s.v is not null and x.photos[s.n::integer] is not null
    ),
    res as (
      select i.league_id, private.social_match_result(m.status, m.winner_side, m.walkover_side, i.side) as r
        from items i join public.matches m on m.id = i.target
       where i.kind = 'match' and private.match_final(m.status, m.proposed_at)
    ),
    golf as (
      select i.league_id,
             case when rd.nine in ('front', 'back') then 9 else rd.holes end as holes,
             (select count(*) from unnest(c.strokes) s where s is not null)::integer as played,
             (select coalesce(sum(s), 0) from unnest(c.strokes) s)::integer as gross,
             c.dq
        from items i
        join public.golf_cards c on c.id = i.target
        join public.golf_rounds rd on rd.event_id = c.event_id
       where i.kind = 'golf'
    ),
    places as (
      select l.id, l.name, l.kind, l.sport, l.rules ->> 'game' as game, l.logo_path, l.visibility, sp.player_id, st.family,
             (select max(i.at) from items i where i.league_id = l.id) as last_at
        from sp
        join public.leagues l on l.id = sp.league_id
        left join public.sport_status st on st.id = l.sport
    )
    select jsonb_build_object(
      'leagues', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'leagueId', x.id,
                 'name', x.name,
                 'kind', x.kind,
                 'sport', x.sport,
                 'game', case when x.sport = 'esports' then x.game end,
                 'logo', x.logo_path,
                 'visibility', x.visibility,
                 'playerId', x.player_id,
                 'summary', case
                   when x.sport = 'bowling' then
                     (select jsonb_build_object('kind', 'bowling', 'games', count(*)::integer,
                                                'average', round(avg(b.v)::numeric, 1), 'high', max(b.v))
                        from bowl b where b.league_id = x.id)
                   when x.sport = 'golf' then
                     (select jsonb_build_object('kind', 'golf', 'rounds', count(*)::integer,
                                                'best', coalesce(min(g.gross) filter (where g.holes = 18 and g.played = 18 and not g.dq),
                                                                 min(g.gross) filter (where g.holes = 9 and g.played = 9 and not g.dq)))
                        from golf g where g.league_id = x.id)
                   when x.sport = 'swimming' then
                     jsonb_build_object('kind', 'swim',
                                        'results', (select count(*) from items i where i.league_id = x.id and i.kind = 'swim')::integer)
                   when x.family in ('racket', 'team', 'esports') then
                     (select jsonb_build_object('kind', 'matches',
                                                'played', (count(*) filter (where r.r is not null))::integer,
                                                'won', (count(*) filter (where r.r = 'win'))::integer,
                                                'drawn', (count(*) filter (where r.r = 'draw'))::integer,
                                                'lost', (count(*) filter (where r.r = 'loss'))::integer)
                        from res r where r.league_id = x.id)
                   else jsonb_build_object('kind', 'none')
                 end)
                 order by (x.kind = 'torneo'), x.last_at desc nulls last, x.name, x.id)
          from places x), '[]'::jsonb),
      'squads', coalesce((
        select jsonb_agg(private.squad_lite(s) || jsonb_build_object('role', m.role) order by (m.role = 'captain') desc, s.name, s.id)
          from public.squad_members m join public.squads s on s.id = m.squad_id
         where m.user_id = p_user), '[]'::jsonb),
      'esportsTeams', coalesce((
        select jsonb_agg(jsonb_build_object('id', t.id, 'game', t.game, 'name', t.name, 'tag', t.tag, 'logo', t.logo_path, 'role', m.role)
                         order by private.esp_game_order(t.game), t.name, t.id)
          from public.esports_team_members m join public.esports_teams t on t.id = m.team_id
         where m.user_id = p_user), '[]'::jsonb))
  );
end $$;

-- =====================================================================
-- 3. Compartir un juego como publicación
-- =====================================================================

-- Un juego con la forma de cada elemento de profile_games (ProfileGame de src/lib/data/profileGames.ts), para la
-- cuenta de la sesión. Lo mismo que hacía private.social_games con cada elemento (copiado de
-- 20260929001000_sueltos_logos.sql). null si la cuenta del juego ya no existe.
create function private.social_game_json(p_key text, p_kind text, p_target uuid, p_player uuid, p_user uuid, p_league uuid,
                                         p_sport text, p_league_name text, p_event uuid, p_at timestamptz, p_side smallint)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_detail jsonb := '{}'::jsonb;
  v_url text;
  v_likes integer;
  v_liked boolean;
  v_uname text;
  v_etype text;
  v_ename text;
  v_edate date;
begin
  select pr.name into v_uname from public.profiles pr where pr.id = p_user;
  if not found then
    return null;
  end if;
  if p_kind = 'solo' then
    v_ename := 'Juego suelto';
    select so.played_on into v_edate from public.solo_sessions so where so.id = p_target;
  else
    select e.type, e.name, e.date into v_etype, v_ename, v_edate from public.events e where e.id = p_event;
  end if;

  if p_kind = 'bowling' then
    select jsonb_build_object(
             'scores', coalesce(jsonb_agg(s.v order by s.i), '[]'::jsonb),
             'verified', coalesce(jsonb_agg(x.photos[s.i::integer] is not null order by s.i), '[]'::jsonb),
             'series', coalesce(sum(s.v), 0),
             'high', coalesce(max(s.v), 0))
      into v_detail
      from public.entries x
      cross join lateral unnest(x.scores) with ordinality as s (v, i)
     where x.id = p_target and s.v is not null;
    v_url := '/l/' || p_league::text || '/juegos?juego=' || p_target::text || '&evento=' || p_event::text;
  elsif p_kind = 'solo' then
    select jsonb_build_object(
             'title', 'Juego suelto',
             'venue', nullif(so.venue, ''),
             'scores', to_jsonb(so.scores),
             'series', (select coalesce(sum(v), 0) from unnest(so.scores) v),
             'high', (select coalesce(max(v), 0) from unnest(so.scores) v))
      into v_detail
      from public.solo_sessions so
     where so.id = p_target;
    v_url := case when p_user = auth.uid() then '/juegos-sueltos?juego=' || p_target::text end;
  elsif p_kind = 'match' then
    select jsonb_build_object(
             'side', p_side,
             'mine', (select s.label from public.match_sides s where s.match_id = m.id and s.side = p_side),
             'opponent', (select s.label from public.match_sides s where s.match_id = m.id and s.side = 3 - p_side),
             'score', nullif(btrim(coalesce(m.score ->> 'text', '')), ''),
             'result', private.social_match_result(m.status, m.winner_side, m.walkover_side, p_side),
             'walkover', m.status = 'walkover',
             'final', private.match_final(m.status, m.proposed_at),
             'status', m.status,
             'stage', nullif(m.stage, ''),
             'round', m.round)
      into v_detail
      from public.matches m where m.id = p_target;
    v_url := '/l/' || p_league::text || '/juegos?partido=' || p_target::text;
  elsif p_kind = 'golf' then
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
     where c.id = p_target;
    v_url := '/l/' || p_league::text || '/e/' || p_event::text;
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
     where se.id = p_target;
    v_url := '/l/' || p_league::text || '/e/' || p_event::text;
  end if;

  select l.likes, l.liked into v_likes, v_liked from private.social_likes(p_kind, p_target, p_player) l;

  return jsonb_build_object(
    'key', p_key,
    'kind', p_kind,
    'id', p_target,
    'playerId', p_player,
    'userId', p_user,
    'userName', v_uname,
    'leagueId', p_league,
    'leagueName', p_league_name,
    'sport', p_sport,
    'eventId', p_event,
    'eventName', coalesce(v_ename, ''),
    'eventType', v_etype,
    'eventDate', case when v_edate is null then null else to_char(v_edate, 'YYYY-MM-DD') end,
    'at', private.iso(p_at),
    'url', v_url,
    'likes', v_likes,
    'likedByMe', v_liked,
    'detail', coalesce(v_detail, '{}'::jsonb));
end $$;

-- Igual que en 20260929001000_sueltos_logos.sql: los mismos elementos en el mismo orden, cada uno con
-- private.social_game_json.
create or replace function private.social_games(p_users uuid[], p_sport text, p_limit integer, p_before timestamptz, p_before_key text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  r record;
begin
  for r in
    select i.key as k, i.kind as kd, i.target as tg, i.player_id as pid, i.user_id as uid, i.league_id as lid, i.sport as sp,
           i.league_name as lname, i.event_id as eid, i.at as t, i.side as sd
      from private.social_items(p_users, p_sport, p_before, p_before_key, p_limit) i
     order by i.at desc, i.key desc
  loop
    v_item := private.social_game_json(r.k, r.kd, r.tg, r.pid, r.uid, r.lid, r.sp, r.lname, r.eid, r.t, r.sd);
    if v_item is not null then
      v_out := v_out || jsonb_build_array(v_item);
    end if;
  end loop;
  return v_out;
end $$;

-- Un juego (ProfileGame) para la cuenta de la sesión, o null si no lo ve: con las reglas de private.social_items (la
-- liga sin menores y pública, de la que es miembro o el superadmin; el jugador con cuenta; el juego terminado; el
-- suelto compartido y su dueño visible con private.social_can_see) y sin un bloqueo entre quien mira y la cuenta del
-- juego (salvo el superadmin). p_player: el jugador del juego (null en 'solo').
create function private.social_game_one(p_kind text, p_id uuid, p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_super boolean := private.is_super();
  v_pl public.players;
  v_l public.leagues;
  so public.solo_sessions;
  v_at timestamptz;
  v_event uuid;
  v_side smallint;
  v_key text;
begin
  if p_id is null or p_kind is null then
    return null;
  end if;
  if p_kind = 'solo' then
    select * into so from public.solo_sessions s where s.id = p_id;
    if so.id is null or not so.shared or not coalesce(private.social_can_see(so.user_id), false)
       or (not v_super and private.blocked_between(v_me, so.user_id)) then
      return null;
    end if;
    return private.social_game_json('j:' || so.id::text, 'solo', so.id, null, so.user_id, null, so.sport, null, null,
                                    private.social_event_at(so.played_on, null, null), null);
  end if;
  select * into v_pl from public.players p where p.id = p_player;
  if v_pl.id is null or v_pl.user_id is null then
    return null;
  end if;
  select * into v_l from public.leagues l where l.id = v_pl.league_id;
  if v_l.id is null or v_l.has_minors
     or not (v_l.visibility = 'public' or v_super or v_l.id in (select private.my_leagues())) then
    return null;
  end if;
  if not v_super and private.blocked_between(v_me, v_pl.user_id) then
    return null;
  end if;
  if p_kind = 'bowling' then
    select x.event_id, private.social_event_at(e.date, e.start_time, v_l.tz) into v_event, v_at
      from public.entries x join public.events e on e.id = x.event_id
     where x.id = p_id and x.player_id = v_pl.id and exists (select 1 from unnest(x.scores) s where s is not null);
    v_key := 'b:' || p_id::text;
  elsif p_kind = 'match' then
    v_side := private.social_match_side(p_id, v_pl.id);
    select m.event_id, date_trunc('milliseconds', coalesce(m.scheduled_at, m.proposed_at, m.created_at)) into v_event, v_at
      from public.matches m
     where m.id = p_id and m.league_id = v_l.id and m.status in ('finished', 'confirmed', 'walkover') and v_side is not null;
    v_key := 'm:' || p_id::text || ':' || v_pl.id::text;
  elsif p_kind = 'golf' then
    select c.event_id, private.social_event_at(e.date, e.start_time, v_l.tz) into v_event, v_at
      from public.golf_cards c join public.events e on e.id = c.event_id
     where c.id = p_id and c.player_id = v_pl.id and c.scored_at is not null
       and exists (select 1 from unnest(c.strokes) s where s is not null);
    v_key := 'g:' || p_id::text;
  elsif p_kind = 'swim' then
    select se.event_id, date_trunc('milliseconds', se.result_at) into v_event, v_at
      from public.swim_entries se
     where se.id = p_id and se.player_id = v_pl.id and se.result_at is not null;
    v_key := 's:' || p_id::text;
  else
    return null;
  end if;
  if v_at is null then
    return null;
  end if;
  return private.social_game_json(v_key, p_kind, p_id, v_pl.id, v_pl.user_id, v_l.id, v_l.sport, v_l.name, v_event, v_at, v_side);
end $$;

-- La liga de un juego de liga (participación, partido, tarjeta o resultado), o null si no existe.
create function private.social_game_league(p_kind text, p_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'bowling' then (select x.league_id from public.entries x where x.id = p_id)
    when 'match' then (select m.league_id from public.matches m where m.id = p_id)
    when 'golf' then (select c.league_id from public.golf_cards c where c.id = p_id)
    when 'swim' then (select se.league_id from public.swim_entries se where se.id = p_id)
  end
$$;

-- ¿Ese jugador está en ese juego de liga y el juego ya terminó (las reglas de private.social_items)?
create function private.social_game_done(p_kind text, p_id uuid, p_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case p_kind
    when 'bowling' then exists (select 1 from public.entries x
                                 where x.id = p_id and x.player_id = p_player and exists (select 1 from unnest(x.scores) s where s is not null))
    when 'match' then exists (select 1 from public.matches m
                               where m.id = p_id and m.status in ('finished', 'confirmed', 'walkover')
                                 and private.social_match_side(m.id, p_player) is not null)
    when 'golf' then exists (select 1 from public.golf_cards c
                              where c.id = p_id and c.player_id = p_player and c.scored_at is not null
                                and exists (select 1 from unnest(c.strokes) s where s is not null))
    when 'swim' then exists (select 1 from public.swim_entries se where se.id = p_id and se.player_id = p_player and se.result_at is not null)
  end, false)
$$;

-- Igual que en 20261011000100_equipos_en_vivo.sql y además el juego (p_game_kind, p_game_id, p_game_player: los tres o
-- ninguno; en 'solo' sin jugador; si no, 'invalido'). Con juego, la publicación puede ir sin texto ni foto.
-- - De liga: p_league tiene que ser la liga del juego ('invalido'; con las reglas de siempre de publicar en una liga:
--   ser miembro, sin menores); el jugador tiene que estar en el juego y el juego terminado ('invalido'); quien publica
--   tiene que verlo (private.social_game_one; si no, 'no_existe'). No hace falta que sea su juego.
-- - Suelto ('solo'): solo su dueño ('no_permitido'), sin liga y compartido ('invalido').
-- - No existe: 'no_existe'.
drop function public.create_post(uuid, text, text, integer, integer, uuid, text, text, uuid);
create function public.create_post(p_id uuid, p_text text default '', p_photo text default null, p_photo_w integer default null,
                                   p_photo_h integer default null, p_league uuid default null, p_visibility text default 'public',
                                   p_sport text default null, p_squad uuid default null, p_game_kind text default null,
                                   p_game_id uuid default null, p_game_player uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_text text := private.social_clean_text(p_text);
  v_photo text := nullif(btrim(coalesce(p_photo, '')), '');
  v_vis text := lower(btrim(coalesce(p_visibility, 'public')));
  v_sport text := nullif(lower(btrim(coalesce(p_sport, ''))), '');
  v_gkind text := nullif(lower(btrim(coalesce(p_game_kind, ''))), '');
  v_glid uuid;
  v_author uuid;
  v_league public.leagues;
  v_squad public.squads;
  v_solo public.solo_sessions;
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

  if (v_gkind is not null or p_game_id is not null or p_game_player is not null)
     and (v_gkind is null or p_game_id is null or v_gkind not in ('bowling', 'match', 'golf', 'swim', 'solo')
          or (v_gkind = 'solo') <> (p_game_player is null)) then
    perform private.fail('invalido');
  end if;
  if char_length(v_text) > 1000 or (v_text = '' and v_photo is null and v_gkind is null) or v_vis not in ('public', 'followers', 'league') then
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
  if p_squad is not null then
    if p_league is not null or v_vis <> 'public' then
      perform private.fail('invalido');
    end if;
    select * into v_squad from public.squads x where x.id = p_squad;
    if v_squad.id is null then
      perform private.fail('no_existe');
    end if;
    if not exists (select 1 from public.squad_members m where m.squad_id = v_squad.id and m.user_id = v_me) then
      perform private.deny();
    end if;
    v_sport := v_squad.sport;
  elsif p_league is not null then
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

  -- El juego.
  if v_gkind = 'solo' then
    select * into v_solo from public.solo_sessions s where s.id = p_game_id;
    if v_solo.id is null then
      perform private.fail('no_existe');
    end if;
    if v_solo.user_id <> v_me then
      perform private.deny();
    end if;
    if p_league is not null or not v_solo.shared then
      perform private.fail('invalido');
    end if;
    v_sport := coalesce(v_sport, v_solo.sport);
  elsif v_gkind is not null then
    v_glid := private.social_game_league(v_gkind, p_game_id);
    if v_glid is null then
      perform private.fail('no_existe');
    end if;
    if p_league is distinct from v_glid or not private.social_game_done(v_gkind, p_game_id, p_game_player)
       or not exists (select 1 from public.players p where p.id = p_game_player and p.league_id = v_glid) then
      perform private.fail('invalido');
    end if;
  end if;
  if v_gkind is not null and private.social_game_one(v_gkind, p_game_id, p_game_player) is null then
    perform private.fail('no_existe');
  end if;

  if not private.social_text_ok(v_text) then
    perform private.fail('palabras');
  end if;
  if not private.rate_take('post:h:' || v_me::text, 10, interval '1 hour')
     or not private.rate_take('post:d:' || v_me::text, 40, interval '1 day') then
    perform private.fail('rate_limited');
  end if;

  insert into public.posts (id, author_id, text, photo_path, photo_w, photo_h, league_id, sport, visibility, squad_id,
                            game_kind, game_id, game_player)
  values (p_id, v_me, v_text, v_photo,
          case when v_photo is not null then p_photo_w end, case when v_photo is not null then p_photo_h end,
          p_league, v_sport, v_vis, p_squad, v_gkind, p_game_id, p_game_player)
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

-- Igual que en 20261011000100_equipos_en_vivo.sql y además 'game' (el ProfileGame que comparte, o null si no lleva o
-- quien mira no lo ve) y 'hasGame' (lleva un juego, aunque quien mira no lo vea: «Juego no disponible»). Sin sesión
-- (squad_posts), isMine y canDelete van en false.
create or replace function private.post_json(p public.posts) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'author', private.person_lite(p.author_id),
    'text', p.text,
    'photo', case when p.photo_path is null then null
                  else jsonb_build_object('path', p.photo_path, 'w', p.photo_w, 'h', p.photo_h) end,
    'league', (select jsonb_build_object('id', l.id, 'name', l.name, 'sport', l.sport) from public.leagues l where l.id = p.league_id),
    'squad', (select private.squad_lite(s) from public.squads s where s.id = p.squad_id),
    'sport', p.sport,
    'visibility', case when p.visibility = 'public' and p.league_id is not null
                            and not exists (select 1 from public.leagues l where l.id = p.league_id and l.visibility = 'public')
                       then 'league' else p.visibility end,
    'at', private.iso(p.created_at),
    'likes', p.likes,
    'likedByMe', exists (select 1 from public.post_likes k where k.post_id = p.id and k.user_id = (select auth.uid())),
    'comments', p.comments,
    'isMine', coalesce(p.author_id = (select auth.uid()), false),
    'canDelete', coalesce(p.author_id = (select auth.uid()), false) or (select private.is_super())
                 or (p.league_id is not null and coalesce(private.is_admin(p.league_id), false)),
    'game', case when p.game_kind is null then null else private.social_game_one(p.game_kind, p.game_id, p.game_player) end,
    'hasGame', p.game_kind is not null)
$$;

-- =====================================================================
-- 4. Equipos como perfil
-- =====================================================================

-- ¿La cuenta de la sesión ve esta publicación del muro de un equipo? Con sesión, private.can_see_post; sin sesión, las
-- públicas sin liga de una cuenta sin bloquear (el muro de un equipo siempre es así).
create function private.squad_post_ok(p_author uuid, p_league uuid, p_visibility text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when (select auth.uid()) is null
              then p_visibility = 'public' and p_league is null and not private.is_blocked(p_author)
              else private.can_see_post(p_author, p_league, p_visibility) end
$$;

-- ¿La cuenta de la sesión ve los partidos del equipo en esa liga? Sin menores y pública, de la que es miembro, o el
-- superadmin (como las ligas de squad_page).
create function private.squad_league_ok(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.leagues l
                  where l.id = p_league and not l.has_minors
                    and (l.visibility = 'public' or private.is_member(l.id) or private.is_super()))
$$;

-- Igual que en 20261011000100_equipos_en_vivo.sql y además 'posts' (las del muro que ve quien mira) y 'likes' (los me
-- gusta de esas publicaciones más los de los partidos de sus jugadores en los equipos de liga del equipo, en las ligas
-- que ve quien mira y sin menores).
create or replace function public.squad_page(p_squad uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_sq public.squads;
  v_role text;
  v_posts integer;
  v_post_likes integer;
begin
  select * into v_sq from public.squads x where x.id = p_squad;
  if v_sq.id is null then
    return null;
  end if;
  if v_me is not null then
    select m.role into v_role from public.squad_members m where m.squad_id = v_sq.id and m.user_id = v_me;
  end if;
  select count(*)::integer, coalesce(sum(x.likes), 0)::integer into v_posts, v_post_likes
    from public.posts x
   where x.squad_id = v_sq.id and private.squad_post_ok(x.author_id, x.league_id, x.visibility);
  return private.squad_lite(v_sq) || jsonb_build_object(
    'description', v_sq.description,
    'captainId', v_sq.captain_id,
    'isMember', v_role is not null,
    'myRole', v_role,
    'isFollowing', v_me is not null and exists (select 1 from public.squad_follows f where f.squad_id = v_sq.id and f.user_id = v_me),
    'createdAt', private.iso(v_sq.created_at),
    'roster', case when v_me is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.user_id, 'name', p.name, 'username', p.username, 'avatar', p.avatar_path, 'role', m.role,
               'position', m.position, 'jersey', m.jersey, 'isMe', m.user_id = v_me)
               order by (m.role = 'captain') desc, m.joined_at, m.user_id)
        from public.squad_members m join public.profiles p on p.id = m.user_id
       where m.squad_id = v_sq.id), '[]'::jsonb) end,
    'leagues', private.squad_leagues_json(v_sq.id, v_role is not null),
    'record', private.squad_record(v_sq.id, null),
    'posts', v_posts,
    'likes', v_post_likes + (
      select count(*)::integer from public.game_likes g
       where g.match_id in (select s.match_id from public.match_sides s join public.teams t on t.id = s.team_id
                             where t.squad_id = v_sq.id)
         and g.player_id in (select tp.player_id from public.team_players tp join public.teams t on t.id = tp.team_id
                              where t.squad_id = v_sq.id)
         and private.squad_league_ok(g.league_id)));
end $$;

-- Igual que en 20261011000100_equipos_en_vivo.sql, y también sin sesión: entonces solo lo público
-- (private.squad_post_ok).
create or replace function public.squad_posts(p_squad uuid, p_limit integer default 20, p_before timestamptz default null,
                                              p_before_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit integer := private.clamp_int(p_limit, 1, 50, 20);
begin
  return coalesce((
    select jsonb_agg(private.post_json(z.p) order by z.at desc, z.id desc)
      from (select x as p, x.created_at as at, x.id
              from public.posts x
             where x.squad_id = p_squad
               and (p_before is null
                    or (x.created_at, x.id) < (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)))
               and private.squad_post_ok(x.author_id, x.league_id, x.visibility)
             order by x.created_at desc, x.id desc
             limit v_limit) z), '[]'::jsonb);
end $$;

-- Los seguidores de un equipo, el más reciente primero (hasta 50; página siguiente: los de antes de (p_before,
-- p_before_id)), con la forma de follow_list. También sin sesión (isFollowing, followsYou e isMe en false). Sin las
-- cuentas bloqueadas por el superadmin ni las que tienen un bloqueo con quien mira (el superadmin ve todas). [] si el
-- equipo no existe.
create function public.squad_followers(p_squad uuid, p_limit integer default 30, p_before timestamptz default null,
                                       p_before_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_super boolean := private.is_super();
  v_limit integer := private.clamp_int(p_limit, 1, 50, 30);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.uid,
             'name', x.name,
             'username', x.username,
             'avatar', x.avatar_path,
             'at', private.iso(x.at),
             'isFollowing', v_me is not null and exists (select 1 from public.follows f where f.follower_id = v_me and f.followee_id = x.uid),
             'followsYou', v_me is not null and exists (select 1 from public.follows f where f.follower_id = x.uid and f.followee_id = v_me),
             'isMe', v_me is not null and x.uid = v_me)
             order by x.at desc, x.uid desc)
      from (select f.user_id as uid, date_trunc('milliseconds', f.created_at) as at, p.name, p.username, p.avatar_path
              from public.squad_follows f
              join public.profiles p on p.id = f.user_id
             where f.squad_id = p_squad
               and (v_super or (p.blocked_at is null and not private.blocked_between(v_me, f.user_id)))
               and (p_before is null
                    or date_trunc('milliseconds', f.created_at) < p_before
                    or (date_trunc('milliseconds', f.created_at) = p_before and f.user_id < p_before_id))
             order by date_trunc('milliseconds', f.created_at) desc, f.user_id desc
             limit v_limit) x), '[]'::jsonb);
end $$;

-- Los partidos de los equipos de liga con ese squad_id (terminados o confirmados, y W.O. con ganador: lo mismo que el
-- récord), de las ligas que ve quien mira (private.squad_league_ok), del más nuevo al más viejo (hasta 50; página
-- siguiente: los de antes de (p_before, p_before_key)). SquadGame[] de docs/perfiles-equipos-esports.md; key =
-- 'm:<partido>:<lado>'.
create function public.squad_games(p_squad uuid, p_limit integer default 20, p_before timestamptz default null,
                                   p_before_key text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit integer := private.clamp_int(p_limit, 1, 50, 20);
begin
  perform private.require_uid();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'key', z.key,
             'matchId', z.mid,
             'leagueId', z.lid,
             'leagueName', z.lname,
             'sport', z.sport,
             'at', private.iso(z.at),
             'side', z.side,
             'mine', z.mine,
             'opponent', z.opp,
             'score', z.score,
             'result', z.result,
             'walkover', z.wo,
             'stage', z.stage,
             'round', z.round,
             'url', '/l/' || z.lid::text || '/juegos?partido=' || z.mid::text)
             order by z.at desc, z.key desc)
      from (select g.*
              from (select 'm:' || m.id::text || ':' || s.side::text as key, m.id as mid, l.id as lid, l.name as lname, l.sport,
                           date_trunc('milliseconds', coalesce(m.scheduled_at, m.proposed_at, m.created_at)) as at, s.side,
                           s.label as mine,
                           (select o.label from public.match_sides o where o.match_id = m.id and o.side = 3 - s.side) as opp,
                           nullif(btrim(coalesce(m.score ->> 'text', '')), '') as score,
                           private.social_match_result(m.status, m.winner_side, m.walkover_side, s.side) as result,
                           m.status = 'walkover' as wo, nullif(m.stage, '') as stage, m.round::text as round
                      from public.teams t
                      join public.match_sides s on s.team_id = t.id
                      join public.matches m on m.id = s.match_id
                      join public.leagues l on l.id = m.league_id
                     where t.squad_id = p_squad
                       and (m.status in ('finished', 'confirmed') or (m.status = 'walkover' and m.winner_side is not null))
                       and private.squad_league_ok(l.id)) g
             where p_before is null or g.at < p_before or (g.at = p_before and g.key < coalesce(p_before_key, ''))
             order by g.at desc, g.key desc
             limit v_limit) z), '[]'::jsonb);
end $$;

-- Los números del equipo en las ligas que ve quien mira (private.squad_league_ok), con los mismos partidos que el
-- récord: {record, leagues, tournaments} (docs/perfiles-equipos-esports.md). leagues: las ligas (kind 'liga') donde
-- tiene un equipo, con el récord de la liga y el de cada temporada donde tuvo equipo (la más nueva primero); las de
-- más partidos primero. tournaments: las ligas tipo torneo donde tiene equipo (eventId: su primer evento 'torneo', o
-- null; date: la de ese evento o el inicio de la liga) y los eventos tipo torneo de las ligas donde jugó (date: la del
-- evento); el más nuevo primero. null si el equipo no existe.
create function public.squad_stats(p_squad uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_uid();
  if not exists (select 1 from public.squads s where s.id = p_squad) then
    return null;
  end if;
  return (
    with games as materialized (
      select m.id as mid, m.league_id as lid, t.season_id, m.event_id, s.side, m.winner_side
        from public.teams t
        join public.match_sides s on s.team_id = t.id
        join public.matches m on m.id = s.match_id
       where t.squad_id = p_squad
         and (m.status in ('finished', 'confirmed') or (m.status = 'walkover' and m.winner_side is not null))
         and private.squad_league_ok(m.league_id)
    ),
    lg as materialized (
      select l.* from public.leagues l
       where exists (select 1 from public.teams t where t.league_id = l.id and t.squad_id = p_squad)
         and private.squad_league_ok(l.id)
    ),
    tours as (
      select l.id as lid, (select e.id from public.events e where e.league_id = l.id and e.type = 'torneo' order by e.date, e.id limit 1) as eid,
             l.name, l.sport, null::date as edate, l.season_start, true as whole
        from lg l where l.kind = 'torneo'
      union all
      select l.id, e.id, coalesce(nullif(btrim(e.name), ''), l.name), l.sport, e.date, l.season_start, false
        from lg l join public.events e on e.league_id = l.id
       where l.kind = 'liga' and e.type = 'torneo' and exists (select 1 from games g where g.event_id = e.id)
    )
    select jsonb_build_object(
      'record', (select jsonb_build_object(
                          'played', count(*)::integer,
                          'won', (count(*) filter (where g.winner_side = g.side))::integer,
                          'drawn', (count(*) filter (where g.winner_side is null))::integer,
                          'lost', (count(*) filter (where g.winner_side is not null and g.winner_side <> g.side))::integer)
                   from games g),
      'leagues', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'leagueId', l.id,
                 'name', l.name,
                 'kind', l.kind,
                 'sport', l.sport,
                 'logo', l.logo_path,
                 'record', (select jsonb_build_object(
                                     'played', count(*)::integer,
                                     'won', (count(*) filter (where g.winner_side = g.side))::integer,
                                     'drawn', (count(*) filter (where g.winner_side is null))::integer,
                                     'lost', (count(*) filter (where g.winner_side is not null and g.winner_side <> g.side))::integer)
                              from games g where g.lid = l.id),
                 'seasons', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'seasonId', se.id,
                            'name', se.name,
                            'record', (select jsonb_build_object(
                                                'played', count(*)::integer,
                                                'won', (count(*) filter (where g.winner_side = g.side))::integer,
                                                'drawn', (count(*) filter (where g.winner_side is null))::integer,
                                                'lost', (count(*) filter (where g.winner_side is not null and g.winner_side <> g.side))::integer)
                                         from games g where g.lid = l.id and g.season_id = se.id))
                            order by se.starts_on desc, se.id)
                     from public.seasons se
                    where se.league_id = l.id
                      and exists (select 1 from public.teams t where t.league_id = l.id and t.squad_id = p_squad and t.season_id = se.id)),
                   '[]'::jsonb))
                 order by (select count(*) from games g where g.lid = l.id) desc, l.name, l.id)
          from lg l where l.kind = 'liga'), '[]'::jsonb),
      'tournaments', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'leagueId', x.lid,
                 'eventId', x.eid,
                 'name', x.name,
                 'sport', x.sport,
                 'date', to_char(coalesce(x.edate, (select e.date from public.events e where e.id = x.eid), x.season_start), 'YYYY-MM-DD'),
                 'record', (select jsonb_build_object(
                                     'played', count(*)::integer,
                                     'won', (count(*) filter (where g.winner_side = g.side))::integer,
                                     'drawn', (count(*) filter (where g.winner_side is null))::integer,
                                     'lost', (count(*) filter (where g.winner_side is not null and g.winner_side <> g.side))::integer)
                              from games g where g.lid = x.lid and (x.whole or g.event_id = x.eid)))
                 order by coalesce(x.edate, (select e.date from public.events e where e.id = x.eid), x.season_start) desc nulls last,
                          x.name, x.lid, x.eid)
          from tours x), '[]'::jsonb))
  );
end $$;

-- ---------- Invitar dentro de la app ----------

create trigger squad_invites_touch before update on public.squad_invites
  for each row execute function private.touch_updated_at();

-- Tiempo real: solo dice cuál cambió (la pantalla vuelve a leer): 'invites' {id, status, squad_id} en user:<invitado>
-- y user:<quien invitó>.
create function private.emit_squad_invites() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.squad_invites;
begin
  if tg_op = 'DELETE' then
    r := old;
  else
    r := new;
  end if;
  perform private.emit('user:' || r.user_id::text, 'invites', jsonb_build_object('id', r.id, 'status', r.status, 'squad_id', r.squad_id));
  if r.invited_by is not null then
    perform private.emit('user:' || r.invited_by::text, 'invites', jsonb_build_object('id', r.id, 'status', r.status, 'squad_id', r.squad_id));
  end if;
  return null;
end $$;
create trigger squad_invites_emit after insert or update or delete on public.squad_invites
  for each row execute function private.emit_squad_invites();

-- Entró al equipo por cualquier camino (join_squad con el código o la invitación): su pendiente queda aceptada.
create function private.squad_invites_on_join() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.squad_invites i set status = 'accepted', decided_at = now()
   where i.squad_id = new.squad_id and i.user_id = new.user_id and i.status = 'pending';
  return null;
end $$;
create trigger squad_members_accept_invites after insert on public.squad_members
  for each row execute function private.squad_invites_on_join();

-- inSquad e invited (pendiente) de una persona para un equipo (search_people con p_squad); {} sin equipo.
create function private.squad_person_flags(p_user uuid, p_squad uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when p_squad is null then '{}'::jsonb else jsonb_build_object(
    'inSquad', exists (select 1 from public.squad_members m where m.squad_id = p_squad and m.user_id = p_user),
    'invited', exists (select 1 from public.squad_invites i where i.squad_id = p_squad and i.user_id = p_user and i.status = 'pending'))
  end
$$;

-- El capitán (o el superadmin) invita a cuentas a su equipo (1 a 50, sin repetir; si no, 'invalido'). Cada una:
-- 'unavailable' (la propia, no existe, bloqueada por el superadmin, un bloqueo con el capitán o con quien invita en
-- cualquier dirección, o rechazó una de este equipo hace menos de 7 días), 'member', 'pending' (ya tiene una), 'full'
-- (40 miembros), 'rate_limited' (50 por día por cuenta que invita; si ya llegó, toda la llamada: 'rate_limited') o
-- 'sent'. Aviso a la invitada (uno por día de quien invita a esa persona). Devuelve {sent, results: [{userId, status}]}.
create function public.invite_to_squad(p_squad uuid, p_users uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_key text := 'squad_invite:' || v_me::text;
  v_sq public.squads;
  v_users uuid[];
  v_user uuid;
  v_from text;
  v_status text;
  v_id uuid;
  v_title text;
  v_sent integer := 0;
  v_queued boolean := false;
  v_results jsonb := '[]'::jsonb;
begin
  v_sq := private.squad_as_captain(p_squad);
  v_users := array(select a.u from unnest(p_users) with ordinality as a (u, n)
                    where a.u is not null group by a.u order by min(a.n));
  if coalesce(cardinality(v_users), 0) = 0 or cardinality(v_users) > 50 then
    perform private.fail('invalido');
  end if;
  if private.rate_blocked(v_key, 50, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  v_from := (select p.name from public.profiles p where p.id = v_me);
  perform set_config('mm.push_batch', 'on', true);
  foreach v_user in array v_users loop
    if v_user = v_me
       or not exists (select 1 from public.profiles p where p.id = v_user and p.blocked_at is null)
       or private.blocked_between(v_me, v_user)
       or (v_sq.captain_id is not null and private.blocked_between(v_sq.captain_id, v_user))
       or exists (select 1 from public.squad_invites i
                   where i.squad_id = v_sq.id and i.user_id = v_user and i.status = 'declined'
                     and i.decided_at > now() - interval '7 days') then
      v_status := 'unavailable';
    elsif exists (select 1 from public.squad_members m where m.squad_id = v_sq.id and m.user_id = v_user) then
      v_status := 'member';
    elsif exists (select 1 from public.squad_invites i where i.squad_id = v_sq.id and i.user_id = v_user and i.status = 'pending') then
      v_status := 'pending';
    elsif (select count(*) from public.squad_members m where m.squad_id = v_sq.id) >= 40 then
      v_status := 'full';
    elsif not private.rate_take(v_key, 50, interval '1 day') then
      v_status := 'rate_limited';
    else
      v_id := null;
      insert into public.squad_invites (squad_id, user_id, invited_by) values (v_sq.id, v_user, v_me)
      on conflict (squad_id, user_id) where status = 'pending' do nothing
      returning id into v_id;
      if v_id is null then
        v_status := 'pending';
      else
        v_status := 'sent';
        v_sent := v_sent + 1;
        if not exists (select 1 from public.squad_invites i
                        where i.user_id = v_user and i.invited_by = v_me and i.id <> v_id
                          and i.created_at > now() - interval '1 day') then
          v_title := left(private.push_who(v_from, 1) || ' te invitó a ' || v_sq.name, 200);
          if private.queue_push(v_user, 'liga', v_title, 'Toca para ver el equipo y unirte.', '/equipos/' || v_sq.id::text,
                                'equipo:invitacion:' || v_id::text, 604800) then
            v_queued := true;
          end if;
        end if;
      end if;
    end if;
    v_results := v_results || jsonb_build_array(jsonb_build_object('userId', v_user, 'status', v_status));
  end loop;
  perform set_config('mm.push_batch', '', true);
  if v_queued then
    perform private.kick_send_push();
  end if;
  return jsonb_build_object('sent', v_sent, 'results', v_results);
end $$;

-- La invitada acepta (true) o rechaza (false) su invitación ('no_existe' si no es suya; p_accept null: 'invalido').
-- Rechazar: {}. Aceptar hace lo mismo que join_squad: 'cupo_lleno' (40), 'limite' (ya es de 20 equipos), entra como
-- 'member', deja de seguirlo y avisa al capitán; con un bloqueo con quien invitó: 'no_permitido'. Ya es miembro:
-- {squadId}. Ya decidida: {squadId} si se aceptó, {} si no. Devuelve {squadId}.
create function public.respond_squad_invite(p_invite uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  i public.squad_invites;
  v_sq public.squads;
  v_title text;
begin
  if p_accept is null then
    perform private.fail('invalido');
  end if;
  select * into i from public.squad_invites x where x.id = p_invite and x.user_id = v_me for update;
  if i.id is null then
    perform private.fail('no_existe');
  end if;
  if i.status <> 'pending' then
    return case when i.status = 'accepted' then jsonb_build_object('squadId', i.squad_id) else '{}'::jsonb end;
  end if;
  if not p_accept then
    update public.squad_invites x set status = 'declined', decided_at = now() where x.id = i.id;
    return '{}'::jsonb;
  end if;
  select * into v_sq from public.squads x where x.id = i.squad_id for update;
  if i.invited_by is not null and private.blocked_between(v_me, i.invited_by) then
    perform private.deny();
  end if;
  if exists (select 1 from public.squad_members m where m.squad_id = v_sq.id and m.user_id = v_me) then
    update public.squad_invites x set status = 'accepted', decided_at = now() where x.id = i.id;
    return jsonb_build_object('squadId', v_sq.id);
  end if;
  if (select count(*) from public.squad_members m where m.squad_id = v_sq.id) >= 40 then
    perform private.fail('cupo_lleno');
  end if;
  if private.squad_count(v_me) >= 20 then
    perform private.fail('limite');
  end if;
  -- El trigger de squad_members deja la invitación aceptada.
  insert into public.squad_members (squad_id, user_id, role) values (v_sq.id, v_me, 'member');
  delete from public.squad_follows f where f.squad_id = v_sq.id and f.user_id = v_me;
  update public.squad_invites x set status = 'accepted', decided_at = now() where x.id = i.id and x.status = 'pending';
  if v_sq.captain_id is not null and v_sq.captain_id <> v_me then
    begin
      v_title := left(private.push_who((select p.name from public.profiles p where p.id = v_me), 1) || ' se unió a tu equipo', 200);
      perform private.queue_push(v_sq.captain_id, 'liga', v_title, v_sq.name, '/equipos/' || v_sq.id::text,
                                 'equipo:miembro:' || v_sq.id::text, 86400, v_title);
    exception when others then
      raise warning 'push de la invitación al equipo %: %', v_sq.id, sqlerrm;
    end;
  end if;
  return jsonb_build_object('squadId', v_sq.id);
end $$;

-- El capitán (o el superadmin) retira una invitación pendiente de su equipo ('no_existe'; ya decidida: nada).
create function public.cancel_squad_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  i public.squad_invites;
begin
  perform private.require_uid();
  select * into i from public.squad_invites x where x.id = p_invite for update;
  if i.id is null then
    perform private.fail('no_existe');
  end if;
  perform private.squad_as_captain(i.squad_id);
  if i.status = 'pending' then
    update public.squad_invites x set status = 'cancelled', decided_at = now() where x.id = i.id;
  end if;
end $$;

-- Mis invitaciones pendientes a equipos, la más nueva primero (hasta 50), sin las de una cuenta con un bloqueo con la
-- mía: [{id, squad: SquadLite, invitedBy: {id, name, username} | null, createdAt}].
create function public.my_squad_invites() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', z.id,
             'squad', private.squad_lite(z.s),
             'invitedBy', case when z.invited_by is null then null
                               else jsonb_build_object('id', z.invited_by, 'name', z.from_name, 'username', z.from_username) end,
             'createdAt', private.iso(z.created_at))
             order by z.created_at desc, z.id desc)
      from (select i.id, i.invited_by, i.created_at, s, p.name as from_name, p.username as from_username
              from public.squad_invites i
              join public.squads s on s.id = i.squad_id
              left join public.profiles p on p.id = i.invited_by
             where i.user_id = v_me and i.status = 'pending'
               and (i.invited_by is null or not private.blocked_between(v_me, i.invited_by))
             order by i.created_at desc, i.id desc
             limit 50) z), '[]'::jsonb);
end $$;

-- Las invitaciones pendientes de un equipo (el capitán o el superadmin; 'no_existe', 'no_permitido'), la más nueva
-- primero (hasta 200): [{id, user: PersonLite, createdAt}].
create function public.squad_pending_invites(p_squad uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_sq public.squads;
begin
  select * into v_sq from public.squads x where x.id = p_squad;
  if v_sq.id is null then
    perform private.fail('no_existe');
  end if;
  if v_sq.captain_id is distinct from v_me and not private.is_super() then
    perform private.deny();
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', z.id, 'user', private.person_lite(z.user_id), 'createdAt', private.iso(z.created_at))
                     order by z.created_at desc, z.id desc)
      from (select i.id, i.user_id, i.created_at from public.squad_invites i
             where i.squad_id = v_sq.id and i.status = 'pending'
             order by i.created_at desc, i.id desc
             limit 200) z), '[]'::jsonb);
end $$;

-- Igual que en 20261009000100_red_social.sql y además p_squad: cada persona trae inSquad e invited de ese equipo
-- (private.squad_person_flags; 'invited' es el del equipo). Solo el capitán (o el superadmin): 'no_permitido';
-- 'no_existe'. Con p_league y p_squad a la vez: 'invalido'.
drop function public.search_people(text, uuid, integer);
create function public.search_people(p_query text default null, p_league uuid default null, p_limit integer default 30,
                                     p_squad uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_limit integer := private.clamp_int(p_limit, 1, 50, 30);
  v_q text := lower(btrim(left(coalesce(p_query, ''), 60)));
  v_norm text;
begin
  if p_squad is not null and p_league is not null then
    perform private.fail('invalido');
  end if;
  if p_league is not null and not (private.is_member(p_league) or private.is_super()) then
    perform private.deny();
  end if;
  if p_squad is not null then
    if not exists (select 1 from public.squads s where s.id = p_squad) then
      perform private.fail('no_existe');
    end if;
    if not exists (select 1 from public.squads s where s.id = p_squad and s.captain_id = v_me) and not private.is_super() then
      perform private.deny();
    end if;
  end if;
  if left(v_q, 1) = '@' then
    v_q := substr(v_q, 2);
  end if;

  if v_q = '' then
    return coalesce((
      select jsonb_agg(private.people_item(x.id, x.name, x.username, p_league) || private.squad_person_flags(x.id, p_squad)
                       order by x.at desc, x.id desc)
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
    select jsonb_agg(private.people_item(x.id, x.name, x.username, p_league) || private.squad_person_flags(x.id, p_squad) order by x.n)
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

-- =====================================================================
-- 5. Esports: plataformas
-- =====================================================================

-- Las plataformas de cada juego (platforms de src/sports/esports/catalog.ts), en el orden pc, playstation, xbox,
-- switch, mobile. '{}' si el juego no existe.
create function private.esp_game_platforms(p_game text) returns text[]
language sql immutable set search_path = '' as $$
  select case
    when p_game in ('valorant', 'cs2', 'lol') then array['pc']
    when p_game in ('mlbb', 'clash_royale', 'free_fire', 'pubg_mobile') then array['mobile']
    when p_game = 'smash' then array['switch']
    when p_game in ('rocket_league', 'ea_fc', 'nba_2k') then array['pc', 'playstation', 'xbox', 'switch']
    when p_game in ('sf6', 'tekken8', 'warzone') then array['pc', 'playstation', 'xbox']
    when p_game = 'fortnite' then array['pc', 'playstation', 'xbox', 'switch', 'mobile']
    else '{}'::text[]
  end
$$;

-- NBA 2K: la plataforma del ID (psn, xbox, steam, switch) en la del juego, y al revés. null si no es una de esas.
create function private.esp_nba_platform(p_id_platform text) returns text
language sql immutable set search_path = '' as $$
  select case p_id_platform when 'psn' then 'playstation' when 'steam' then 'pc' when 'xbox' then 'xbox' when 'switch' then 'switch' end
$$;

create function private.esp_nba_id_platform(p_platform text) returns text
language sql immutable set search_path = '' as $$
  select case p_platform when 'playstation' then 'psn' when 'pc' then 'steam' when 'xbox' then 'xbox' when 'switch' then 'switch' end
$$;

-- Las plataformas que sí son del juego, sin repetir y en el orden de siempre.
create function private.esp_platforms_clean(p_game text, p text[]) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array(select u.x from unnest(array['pc', 'playstation', 'xbox', 'switch', 'mobile']) with ordinality as u (x, n)
                         where u.x = any (coalesce(p, '{}'::text[])) and u.x = any (private.esp_game_platforms(p_game))
                         order by u.n), '{}'::text[])
$$;

-- ¿p_platforms sirve para ese juego? (no null, sin nulls y todas del juego; {} sí).
create function private.esp_platforms_ok(p_game text, p text[]) returns boolean
language sql immutable set search_path = '' as $$
  select p is not null and coalesce(array_ndims(p), 1) = 1 and array_position(p, null) is null
     and p <@ private.esp_game_platforms(p_game)
$$;

-- La plataforma del torneo: settings.platform si sirve para el juego (una de las suyas, o 'crossplay' si tiene varias;
-- en NBA 2K también la vieja psn / steam); si no viene, la única del juego o 'crossplay'.
create function private.esp_tournament_platform(p_game text, p_settings jsonb) returns text
language sql immutable set search_path = '' as $$
  select case
    when x.v = any (private.esp_game_platforms(p_game)) then x.v
    when x.v = 'crossplay' and cardinality(private.esp_game_platforms(p_game)) > 1 then 'crossplay'
    when cardinality(private.esp_game_platforms(p_game)) = 1 then (private.esp_game_platforms(p_game))[1]
    else 'crossplay'
  end
    from (select case when p_game = 'nba_2k' then coalesce(private.esp_nba_platform(p_settings ->> 'platform'), p_settings ->> 'platform')
                      else p_settings ->> 'platform' end as v) x
$$;

-- El ID de juego que cuenta para un torneo: en NBA 2K, el de la plataforma del torneo (en 'crossplay', cualquiera de
-- los suyos: primero uno comprobado, luego el más viejo); en los demás, el de plataforma ''. Fila vacía si no tiene.
create function private.esp_tournament_game_id(p_user uuid, p_game text, p_settings jsonb) returns public.esports_game_ids
language sql stable security definer set search_path = '' as $$
  select g.* from public.esports_game_ids g
   where g.user_id = p_user and g.game = p_game
     and case when p_game = 'nba_2k' then
                private.esp_tournament_platform(p_game, p_settings) = 'crossplay'
                or private.esp_nba_platform(g.platform) = private.esp_tournament_platform(p_game, p_settings)
              else g.platform = '' end
   order by (g.status = 'confirmado') desc, g.created_at, g.platform
   limit 1
$$;

-- Igual que en 20261008000100_esports.sql, con la plataforma para todos los juegos: 'platform' es una de las
-- plataformas del juego o 'crossplay' (si tiene más de una); sin la clave vale la única del juego o 'crossplay' (NBA 2K
-- ya no la exige).
create or replace function private.esp_settings_ok(p_game text, p_mode text, p_format text, p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  k text;
  v jsonb;
  v_br boolean := private.esp_game_kind(p_game) = 'br';
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return false;
  end if;
  for k, v in select * from jsonb_each(p) loop
    case k
      when 'subs' then
        if not private.esp_int(v, 0, least(2, private.esp_subs_max(p_game, p_mode))) then
          return false;
        end if;
      when 'autoApprove', 'requireConfirmedId', 'requireVerifiedRank', 'thirdPlace', 'bracketReset', 'doubleRoundRobin', 'draws' then
        if jsonb_typeof(v) <> 'boolean' then
          return false;
        end if;
      when 'seeding' then
        if not (jsonb_typeof(v) = 'string' and (v #>> '{}') in ('manual', 'random', 'rank')) then
          return false;
        end if;
      when 'bestOf' then
        -- {groups, playoffs, final}, cada uno un mejor de del juego (en BR, 1, 3, 5 o 7: no se usa).
        if jsonb_typeof(v) <> 'object' or (select count(*) from jsonb_object_keys(v)) <> 3
           or not (v ? 'groups' and v ? 'playoffs' and v ? 'final')
           or exists (select 1 from jsonb_each(v) x
                       where not private.esp_int(x.value, 1, 7)
                          or (v_br and (x.value #>> '{}')::numeric not in (1, 3, 5, 7))
                          or (not v_br and not private.esp_best_of_ok(p_game, (x.value #>> '{}')::numeric::integer))) then
          return false;
        end if;
      when 'groups' then
        if not private.esp_int(v, 1, 8) then
          return false;
        end if;
      when 'perGroup' then
        if not private.esp_int(v, 1, 4) then
          return false;
        end if;
      when 'playoffs' then
        if not (jsonb_typeof(v) = 'string' and (v #>> '{}') in ('single', 'double')) then
          return false;
        end if;
      when 'platform' then
        if jsonb_typeof(v) <> 'string'
           or not ((v #>> '{}') = any (private.esp_game_platforms(p_game))
                   or ((v #>> '{}') = 'crossplay' and cardinality(private.esp_game_platforms(p_game)) > 1)) then
          return false;
        end if;
      when 'roundsToWin' then
        if private.esp_scoring(p_game) is distinct from 'fight' or not private.esp_int(v, 2, 3)
           or (p_game = 'sf6' and (v #>> '{}')::numeric <> 2) then
          return false;
        end if;
      when 'stocks' then
        if p_game <> 'smash' or not private.esp_int(v, 1, 5) then
          return false;
        end if;
      when 'br' then
        if not v_br or jsonb_typeof(v) <> 'object'
           or exists (select 1 from jsonb_object_keys(v) x where x not in ('placementPoints', 'killPoints', 'rounds', 'gamesPerRound'))
           or jsonb_typeof(v -> 'placementPoints') is distinct from 'array'
           or jsonb_array_length(v -> 'placementPoints') not between 1 and 100
           or exists (select 1 from jsonb_array_elements(v -> 'placementPoints') x where not private.esp_int(x, 0, 100))
           or not private.esp_int(v -> 'killPoints', 0, 10)
           or not private.esp_int(v -> 'rounds', 1, 10)
           or not private.esp_int(v -> 'gamesPerRound', 1, 12) then
          return false;
        end if;
      else
        return false;
    end case;
  end loop;
  return true;
end $$;

-- Lo que manda una app vieja: en NBA 2K la plataforma del ID (psn → playstation, steam → pc); en los demás juegos
-- platform '' (antes «sin plataforma») se quita (vale la de siempre). Antes del check de la tabla.
create function private.esp_settings_compat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(new.settings) = 'object' and jsonb_typeof(new.settings -> 'platform') = 'string' then
    if new.game = 'nba_2k' and new.settings ->> 'platform' in ('psn', 'steam') then
      new.settings := jsonb_set(new.settings, '{platform}', to_jsonb(private.esp_nba_platform(new.settings ->> 'platform')));
    elsif new.game <> 'nba_2k' and new.settings ->> 'platform' = '' then
      new.settings := new.settings - 'platform';
    end if;
  end if;
  return new;
end $$;
create trigger esports_tournaments_platform before insert or update of settings on public.esports_tournaments
  for each row execute function private.esp_settings_compat();

-- Los torneos que ya existen.
update public.esports_tournaments t
   set settings = case when t.game = 'nba_2k' then jsonb_set(t.settings, '{platform}', to_jsonb(private.esp_nba_platform(t.settings ->> 'platform')))
                       else t.settings - 'platform' end
 where (t.game = 'nba_2k' and t.settings ->> 'platform' in ('psn', 'steam'))
    or (t.game <> 'nba_2k' and t.settings ->> 'platform' = '');

-- Las plataformas de cada ID: en NBA 2K, la de su clave platform; en un juego de una sola plataforma, esa; en los
-- demás, las que dijo la persona (solo las del juego, sin repetir).
create function private.esp_game_id_platforms() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.game = 'nba_2k' then
    new.platforms := case when private.esp_nba_platform(new.platform) is null then '{}'::text[]
                          else array[private.esp_nba_platform(new.platform)] end;
  elsif cardinality(private.esp_game_platforms(new.game)) = 1 then
    new.platforms := private.esp_game_platforms(new.game);
  else
    new.platforms := private.esp_platforms_clean(new.game, new.platforms);
  end if;
  return new;
end $$;
create trigger esports_game_ids_platforms before insert or update on public.esports_game_ids
  for each row execute function private.esp_game_id_platforms();

-- Los IDs que ya existen.
update public.esports_game_ids g set platforms = g.platforms
 where g.game = 'nba_2k' or cardinality(private.esp_game_platforms(g.game)) = 1;

-- Igual que en 20261008000100_esports.sql y además 'platforms'.
create or replace function private.esp_game_id_json(g public.esports_game_ids) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'userId', g.user_id, 'game', g.game, 'platform', g.platform, 'region', g.region, 'idDisplay', g.id_display,
    'idNormalized', g.id_normalized, 'status', g.status, 'ownership', g.ownership, 'externalId', g.external_id,
    'ranks', g.ranks, 'rankSource', g.rank_source, 'lookupName', g.lookup_name, 'verifiedAt', private.iso(g.verified_at),
    'confirmedAt', private.iso(g.confirmed_at), 'createdAt', private.iso(g.created_at), 'updatedAt', private.iso(g.updated_at),
    'platforms', to_jsonb(g.platforms))
$$;

-- Igual que en 20261008000100_esports.sql, con el ID del torneo (private.esp_tournament_game_id) y la plataforma:
-- - NBA 2K sin un ID de la plataforma del torneo pero con otro: 'otra_plataforma' (sin ninguno: 'sin_id');
-- - torneo que no es 'crossplay' de un juego de varias plataformas: 'sin_plataforma' (el ID todavía no dice dónde juega)
--   u 'otra_plataforma' (ninguna de las suyas es la del torneo).
-- Después, como antes: 'id_sin_comprobar' y 'sin_rango'.
create or replace function private.esp_member_ok(p_user uuid, p_game text, p_settings jsonb, p_mode text default null) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  g public.esports_game_ids;
  v_platform text := private.esp_tournament_platform(p_game, p_settings);
begin
  g := private.esp_tournament_game_id(p_user, p_game, p_settings);
  if g.user_id is null then
    if exists (select 1 from public.esports_game_ids x where x.user_id = p_user and x.game = p_game) then
      return 'otra_plataforma';
    end if;
    return 'sin_id';
  end if;
  if v_platform <> 'crossplay' and cardinality(private.esp_game_platforms(p_game)) > 1 then
    if coalesce(cardinality(g.platforms), 0) = 0 then
      return 'sin_plataforma';
    end if;
    if not (v_platform = any (g.platforms)) then
      return 'otra_plataforma';
    end if;
  end if;
  if private.esp_verify_kind(p_game) is distinct from 'none'
     and coalesce(p_settings -> 'requireConfirmedId', 'false'::jsonb) = 'true'::jsonb and g.status <> 'confirmado' then
    return 'id_sin_comprobar';
  end if;
  if private.esp_rank_verifiable(p_game)
     and coalesce(p_settings -> 'requireVerifiedRank', 'false'::jsonb) = 'true'::jsonb
     and (g.rank_source <> 'verificado' or not (g.ranks ? private.esp_rank_key(p_game, p_mode))) then
    return 'sin_rango';
  end if;
  return null;
end $$;

-- Igual que en 20261008000100_esports.sql, con el ID del torneo (private.esp_tournament_game_id).
create or replace function private.esp_snapshot(p_entry uuid, p_user uuid, p_role text, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.esports_entries;
  t public.esports_tournaments;
  g public.esports_game_ids;
begin
  select * into e from public.esports_entries x where x.id = p_entry;
  select * into t from public.esports_tournaments x where x.event_id = e.event_id;
  g := private.esp_tournament_game_id(p_user, t.game, t.settings);
  if g.user_id is null then
    raise exception 'sin_id' using errcode = 'P0001', detail = coalesce((select p.name from public.profiles p where p.id = p_user), '');
  end if;
  insert into public.esports_entry_members (entry_id, event_id, league_id, user_id, role, display_name, gamer_tag, ranks, rank_source)
  values (p_entry, e.event_id, e.league_id, p_user, p_role,
          left(coalesce(nullif(btrim(p_name), ''), (select p.name from public.profiles p where p.id = p_user), 'Jugador'), 60),
          g.id_display, g.ranks, g.rank_source);
end $$;

-- Igual que en 20261008000100_esports.sql y además p_platforms: dónde juega con ese ID (solo plataformas del juego;
-- otra cosa: 'invalido'). null deja las que tenía (uno nuevo: ninguna); en NBA 2K y en los juegos de una sola
-- plataforma salen solas (private.esp_game_id_platforms). Solo cambiar las plataformas (el mismo ID) no cuenta en el
-- límite ni lo frena un torneo en curso. Devuelve lo mismo que antes.
drop function public.esports_save_game_id(text, text, text, text);
create function public.esports_save_game_id(p_game text, p_id text, p_platform text default '', p_region text default '',
                                            p_platforms text[] default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_platform text := coalesce(p_platform, '');
  v_region text := coalesce(p_region, '');
  v_n jsonb;
  v_display text;
  v_norm text;
  g public.esports_game_ids;
begin
  if not private.esp_game_ok(p_game) or not private.esp_platform_ok(p_game, v_platform) or not private.esp_region_ok(p_game, v_region)
     or (p_platforms is not null and not private.esp_platforms_ok(p_game, p_platforms)) then
    perform private.fail('invalido');
  end if;
  v_n := private.esp_normalize_id(p_game, p_id);
  v_display := v_n ->> 'display';
  v_norm := v_n ->> 'normalized';
  if v_n is null or char_length(v_display) not between 2 and 40 or char_length(v_norm) not between 2 and 40 then
    perform private.fail('invalido');
  end if;
  select * into g from public.esports_game_ids x where x.user_id = v_uid and x.game = p_game and x.platform = v_platform for update;
  if g.user_id is not null and g.ownership = 'login' then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from public.esports_game_ids x
              where x.game = p_game and x.platform = v_platform and x.id_normalized = v_norm and x.ownership = 'login'
                and x.user_id <> v_uid) then
    perform private.fail('id_tomado');
  end if;
  if g.user_id is not null and g.id_normalized = v_norm then
    if g.id_display is distinct from v_display or g.region is distinct from v_region
       or (p_platforms is not null and g.platforms is distinct from private.esp_platforms_clean(p_game, p_platforms)) then
      update public.esports_game_ids x
         set id_display = v_display, region = v_region,
             platforms = case when p_platforms is null then x.platforms else private.esp_platforms_clean(p_game, p_platforms) end
       where x.user_id = v_uid and x.game = p_game and x.platform = v_platform;
    end if;
    return jsonb_build_object('status', g.status, 'idDisplay', v_display, 'idNormalized', v_norm);
  end if;
  if private.esp_id_locked(v_uid, p_game) then
    perform private.fail('cerrado');
  end if;
  if not private.rate_take('esp_id:' || v_uid::text, 20, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  if g.user_id is null then
    insert into public.esports_game_ids (user_id, game, platform, region, id_display, id_normalized, platforms)
    values (v_uid, p_game, v_platform, v_region, v_display, v_norm, private.esp_platforms_clean(p_game, p_platforms));
  else
    update public.esports_game_ids x
       set id_display = v_display, id_normalized = v_norm, region = v_region, status = 'pendiente', ownership = 'declarado',
           rank_source = 'declarado', external_id = null, lookup_name = null, verified_at = null, confirmed_at = null,
           platforms = case when p_platforms is null then x.platforms else private.esp_platforms_clean(p_game, p_platforms) end
     where x.user_id = v_uid and x.game = p_game and x.platform = v_platform;
  end if;
  return jsonb_build_object('status', 'pendiente', 'idDisplay', v_display, 'idNormalized', v_norm);
end $$;

-- Cambia solo dónde juega con su ID de ese juego (también uno conectado con login): plataformas del juego ('invalido'
-- si no, o si falta p_platforms); en NBA 2K y en los juegos de una sola plataforma quedan las de siempre. 'no_existe'
-- (sin ID), 'rate_limited' (60 por hora).
create function public.esports_set_game_platforms(p_game text, p_platforms text[], p_platform text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_platform text := coalesce(p_platform, '');
begin
  if not private.esp_game_ok(p_game) or not private.esp_platform_ok(p_game, v_platform)
     or not private.esp_platforms_ok(p_game, p_platforms) then
    perform private.fail('invalido');
  end if;
  if not exists (select 1 from public.esports_game_ids x where x.user_id = v_uid and x.game = p_game and x.platform = v_platform) then
    perform private.fail('no_existe');
  end if;
  if not private.rate_take('esp_platforms:' || v_uid::text, 60, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  update public.esports_game_ids x set platforms = private.esp_platforms_clean(p_game, p_platforms)
   where x.user_id = v_uid and x.game = p_game and x.platform = v_platform
     and x.platforms is distinct from private.esp_platforms_clean(p_game, p_platforms);
end $$;

-- Vuelve a tomar el ID (gamer_tag) y los rangos de la foto de una inscripción con el ID que cada uno tiene ahora (el
-- del torneo, private.esp_tournament_game_id), pasándolo otra vez por private.esp_member_ok (su código, con el nombre
-- en el detail). El capitán de la inscripción, todos; cada jugador de la foto, el suyo ('no_permitido' si no). Solo
-- con el torneo en inscripción y la inscripción pendiente o aprobada ('cerrado'). 'no_existe'. Devuelve {updated}.
create function public.esports_refresh_entry_ids(p_entry uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_event uuid := (select x.event_id from public.esports_entries x where x.id = p_entry);
  t public.esports_tournaments;
  e public.esports_entries;
  v_users uuid[];
  v_user uuid;
  v_err text;
  g public.esports_game_ids;
  v_n integer := 0;
begin
  if v_event is null then
    perform private.fail('no_existe');
  end if;
  t := private.esp_tournament_for_update(v_event);
  e := private.esp_entry_for_update(p_entry);
  if e.captain_id = v_uid then
    v_users := array(select m.user_id from public.esports_entry_members m where m.entry_id = e.id order by m.created_at, m.user_id);
  elsif exists (select 1 from public.esports_entry_members m where m.entry_id = e.id and m.user_id = v_uid) then
    v_users := array[v_uid];
  else
    perform private.deny();
  end if;
  if t.status <> 'registration' or e.status not in ('pending', 'approved') then
    perform private.fail('cerrado');
  end if;
  foreach v_user in array v_users loop
    v_err := private.esp_member_ok(v_user, t.game, t.settings, t.mode);
    if v_err is not null then
      raise exception '%', v_err using errcode = 'P0001',
        detail = coalesce((select p.name from public.profiles p where p.id = v_user), '');
    end if;
    g := private.esp_tournament_game_id(v_user, t.game, t.settings);
    update public.esports_entry_members m set gamer_tag = g.id_display, ranks = g.ranks, rank_source = g.rank_source
     where m.entry_id = e.id and m.user_id = v_user
       and (m.gamer_tag, m.ranks, m.rank_source) is distinct from (g.id_display, g.ranks, g.rank_source);
    if found then
      v_n := v_n + 1;
    end if;
  end loop;
  return jsonb_build_object('updated', v_n);
end $$;

-- Una ruta de la app para volver ('/…', no '//…', sin espacios, controles ni '\', hasta 200), o null.
create function private.esp_safe_path(p text) returns text
language sql immutable set search_path = '' as $$
  select case when p is not null and char_length(p) between 1 and 200 and p ~ '^/' and p !~ '^//'
                   and p !~ '[[:space:][:cntrl:]\\]' then p end
$$;

-- Igual que en 20261008000100_esports.sql y además p_volver: la ruta de la app a la que vuelve (private.esp_safe_path;
-- otra cosa no se guarda).
drop function public.esports_link_begin(uuid, text, text);
create function public.esports_link_begin(p_user uuid, p_provider text, p_game text, p_volver text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_state uuid;
begin
  if p_user is null or not exists (select 1 from public.profiles p where p.id = p_user)
     or private.esp_link_provider(p_game) is distinct from p_provider then
    perform private.fail('invalido');
  end if;
  if not private.rate_take('esp_link:' || p_user::text, 10, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  delete from private.esports_link_states x where x.created_at < now() - interval '1 day';
  insert into private.esports_link_states (user_id, provider, game, volver)
  values (p_user, p_provider, p_game, private.esp_safe_path(p_volver))
  returning state into v_state;
  return v_state;
end $$;

-- Igual que en 20261008000100_esports.sql y además 'volver' (solo si se guardó).
create or replace function public.esports_link_take(p_state uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s private.esports_link_states;
begin
  update private.esports_link_states x set used_at = now()
   where x.state = p_state and x.used_at is null and x.created_at > now() - interval '10 minutes'
  returning * into s;
  if s.state is null then
    return null;
  end if;
  return jsonb_build_object('userId', s.user_id, 'provider', s.provider, 'game', s.game)
         || case when s.volver is not null then jsonb_build_object('volver', s.volver) else '{}'::jsonb end;
end $$;

-- Igual que en 20261008000100_esports.sql y además: si la cuenta está inscrita y aprobada en un torneo en curso de ese
-- juego (private.esp_id_locked) y el ID conectado sería otro que el suyo, devuelve 'cerrado' sin cambiar nada (el mismo
-- ID sí se puede conectar). Las plataformas del ID se mantienen (una fila nueva toma las del juego si tiene una sola).
create or replace function public.esports_link_account(p_user uuid, p_game text, p_provider text, p_external_id text, p_display text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_ext text := btrim(coalesce(p_external_id, ''));
  v_raw text;
  v_n jsonb;
  v_brand text := case p_provider when 'steam' then 'Steam' when 'epic' then 'Epic' when 'riot' then 'Riot' end;
  o public.esports_game_ids;
begin
  if p_user is null or not exists (select 1 from public.profiles p where p.id = p_user)
     or private.esp_link_provider(p_game) is distinct from p_provider or v_ext = '' or char_length(v_ext) > 100 then
    perform private.fail('invalido');
  end if;
  if p_provider = 'steam' then
    if v_ext !~ '^7656119[0-9]{10}$' then
      perform private.fail('invalido');
    end if;
    v_raw := (v_ext::bigint - 76561197960265728)::text;
  else
    v_raw := btrim(coalesce(p_display, ''));
  end if;
  v_n := private.esp_normalize_id(p_game, v_raw);
  if v_n is null then
    perform private.fail('invalido');
  end if;
  if private.esp_id_locked(p_user, p_game)
     and not exists (select 1 from public.esports_game_ids x
                      where x.user_id = p_user and x.game = p_game and x.platform = '' and x.id_normalized = v_n ->> 'normalized') then
    return 'cerrado';
  end if;
  for o in delete from public.esports_game_ids x
            where x.game = p_game and x.platform = '' and x.user_id <> p_user and x.ownership = 'login'
              and (x.id_normalized = v_n ->> 'normalized' or x.external_id = v_ext)
           returning x.* loop
    insert into public.esports_id_moves (user_id, game, platform, id_display, provider)
    values (o.user_id, o.game, o.platform, o.id_display, p_provider);
    perform private.queue_push(o.user_id, 'liga',
      left('Tu ID ' || o.id_display || ' de ' || private.esp_game_name(p_game) || ' pasó a otra cuenta', 200),
      'Alguien entró con esa cuenta de ' || v_brand || ' en otra cuenta de MatchMate.', '/esports/mi-id?juego=' || p_game,
      'esports-id:login:' || o.user_id::text, 604800);
    perform private.audit('esports_id_login', 'user', o.user_id::text,
      jsonb_build_object('game', p_game, 'idDisplay', o.id_display, 'by', p_user, 'provider', p_provider));
  end loop;
  insert into public.esports_game_ids as x (user_id, game, platform, id_display, id_normalized, status, ownership, external_id,
                                            lookup_name, confirmed_at)
  values (p_user, p_game, '', v_n ->> 'display', v_n ->> 'normalized', 'confirmado', 'login', v_ext,
          left(nullif(btrim(p_display), ''), 60), now())
  on conflict (user_id, game, platform) do update
    set id_display = excluded.id_display, id_normalized = excluded.id_normalized, status = 'confirmado', ownership = 'login',
        external_id = excluded.external_id, lookup_name = excluded.lookup_name, confirmed_at = now(),
        rank_source = case when x.id_normalized = excluded.id_normalized then x.rank_source else 'declarado' end,
        verified_at = case when x.id_normalized = excluded.id_normalized then x.verified_at end;
  return 'ok';
end $$;

-- =====================================================================
-- 6. Permisos: las RPC con sesión (player_places, squad_followers, squad_page y squad_posts también sin cuenta); las de
-- esports-auth solo service_role; las ayudas y triggers, nadie de la app
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array[
    'player_places', 'squad_followers', 'squad_games', 'squad_stats', 'invite_to_squad', 'respond_squad_invite',
    'cancel_squad_invite', 'my_squad_invites', 'squad_pending_invites', 'esports_set_game_platforms', 'esports_refresh_entry_ids',
    -- Redefinidas (create_post, search_people y esports_save_game_id se crearon de nuevo; las otras conservan sus
    -- permisos y se dejan igual para asegurarlo).
    'create_post', 'search_people', 'esports_save_game_id', 'squad_page', 'squad_posts'];
  v_anon constant text[] := array['player_places', 'squad_followers', 'squad_page', 'squad_posts'];
  v_service constant text[] := array[
    -- esports_link_begin se creó de nuevo; las otras se redefinieron.
    'esports_link_begin', 'esports_link_take', 'esports_link_account'];
  v_private constant text[] := array[
    'social_game_json', 'social_game_one', 'social_game_league', 'social_game_done', 'squad_post_ok', 'squad_league_ok',
    'emit_squad_invites', 'squad_invites_on_join', 'squad_person_flags', 'esp_game_platforms', 'esp_nba_platform',
    'esp_nba_id_platform', 'esp_platforms_clean', 'esp_platforms_ok', 'esp_tournament_platform', 'esp_tournament_game_id',
    'esp_settings_compat', 'esp_game_id_platforms', 'esp_safe_path',
    -- Redefinidas.
    'social_games', 'post_json', 'esp_settings_ok', 'esp_member_ok', 'esp_snapshot', 'esp_game_id_json'];
begin
  for f in select p.oid::regprocedure as sig, n.nspname, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and (p.proname = any (v_rpc) or p.proname = any (v_service)))
               or (n.nspname = 'private' and p.proname = any (v_private)) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' and f.proname = any (v_rpc) then
      execute format('grant execute on function %s to authenticated', f.sig);
      if f.proname = any (v_anon) then
        execute format('grant execute on function %s to anon', f.sig);
      end if;
    elsif f.nspname = 'public' then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;
