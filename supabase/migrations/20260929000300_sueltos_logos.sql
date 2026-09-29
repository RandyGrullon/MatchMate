-- MatchMate · Todos los deportes abiertos, juegos sueltos de boliche y el logo de cada liga o torneo.
--
-- 1. Deportes: los que estaban en 'beta' pasan a 'open' (cualquier cuenta los ve y crea ligas). La consola del
--    superadmin sigue pudiendo ponerlos en beta o cerrarlos (set_sport_status no cambia).
-- 2. Juegos sueltos: public.solo_sessions, los juegos de boliche de una cuenta que no son de ninguna liga ni torneo
--    (fecha, bolera, nota, 1 a 10 juegos de 0 a 300, cuadros opcionales y si sale en el perfil). Cada cuenta lee solo
--    los suyos (el superadmin, todos); nadie escribe directo. Sin tombstone (esos son por liga): el teléfono vuelve a
--    leer con el aviso en tiempo real 'solo' {id, op} de 'user:<dueño>'. Los ids borrados quedan en
--    private.solo_deleted: un guardado viejo de la cola de otro teléfono no revive uno borrado.
--    save_solo_session (crea o cambia, idempotente con p_op_id: la cola sin conexión), delete_solo_session y
--    solo_sessions_of (los míos, todos; los de otra cuenta que se ve, solo los compartidos).
--    Los compartidos (shared) son un juego más del perfil: salen en profile_games y following_games como
--    kind 'solo' (sin liga), cuentan en public_profile (gamesCount, likesReceived, sports) y en el boliche de
--    profile_stats, y se les da me gusta con set_game_like('solo'). Los me gusta van en public.solo_likes
--    (game_likes exige liga y jugador) y salen en social_notices como los de partidos, golf y natación.
-- 3. Logo: leagues.logo_path ('<liga>/<uuid>.webp|jpg|png' en el bucket público 'logos', que crea
--    20260929000310_logos_supabase.sql). Cada subida se reserva antes con begin_logo_upload (admin de la liga, 30 por
--    día): Storage solo acepta rutas reservadas (private.can_upload_logo_path) y set_league_logo solo pone una
--    reservada (o quita el logo) y devuelve el anterior para que el teléfono lo borre de Storage. El archivo que deja
--    de usarse (cambiado, quitado, de una liga borrada o una reserva que no se usó en un día) va a
--    private.storage_purge_queue con bucket 'logos'; mientras está ahí cualquier cuenta sin bloquear lo puede borrar
--    (private.can_remove_logo_path). Lo que ve quien todavía no es de la liga trae el logo: invite_preview (columna
--    logo_path), invite_details, my_league_invites y league_invite_details (logoPath), y la consola (admin_league_row).
--
-- Redefine (create or replace, desde su última versión): private.social_items, social_likes, social_games,
-- forget_user y admin_league_row; public.public_profile (20260929000200_invitaciones.sql), profile_stats,
-- set_game_like, social_notices (20260928000200_social.sql), invite_details (20260927001300_liga.sql),
-- my_league_invites y league_invite_details (20260929000200_invitaciones.sql). invite_preview se borra y se crea
-- de nuevo (devuelve una columna más). Contrato del cliente: src/lib/data/solo.ts y src/lib/logos.ts.

-- =====================================================================
-- 1. Todos los deportes abiertos
-- =====================================================================
update public.sport_status set status = 'open' where status = 'beta';

-- =====================================================================
-- 2. Juegos sueltos
-- =====================================================================
-- id: lo puede poner el teléfono (crear sin señal). scores: los pinos de cada juego, sin huecos. frames: los cuadros
-- de los juegos anotados tiro por tiro, como entries.frames: {"<juego desde 0>": {rolls, masks}}.
-- shared: sale en el perfil y en el inicio de quien lo sigue. El CHECK de scores repite lo de private.series_ok para
-- el boliche (la RPC ya pasa por private.series) sin llamar funciones de private: así vale para quien escriba.
create table public.solo_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  sport text not null default 'bowling' check (sport = 'bowling'),
  played_on date not null,
  venue text not null default '' check (char_length(venue) <= 80),
  note text not null default '' check (char_length(note) <= 300),
  scores smallint[] not null check (
    coalesce(array_ndims(scores), 0) = 1 and cardinality(scores) between 1 and 10 and array_position(scores, null) is null
    and 0 <= all (scores) and 300 >= all (scores)),
  frames jsonb check (frames is null or (jsonb_typeof(frames) = 'object' and pg_column_size(frames) < 16384)),
  shared boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Los de una cuenta, del más nuevo al más viejo (y las páginas de solo_sessions_of).
create index solo_sessions_user_idx on public.solo_sessions (user_id, played_on desc, id desc);

create trigger solo_sessions_touch before update on public.solo_sessions
  for each row execute function private.touch_updated_at();

alter table public.solo_sessions enable row level security;
create policy solo_sessions_read on public.solo_sessions for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_super()));
revoke all on public.solo_sessions from public, anon, authenticated;
grant select on public.solo_sessions to authenticated;

-- Me gusta en un juego suelto compartido (uno por cuenta). Directo los lee quien lo dio y el dueño del juego (el
-- superadmin, todos); los números de los demás salen por las RPC. Se escribe solo con set_game_like.
create table public.solo_likes (
  session_id uuid not null references public.solo_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
create index solo_likes_user_idx on public.solo_likes (user_id);

alter table public.solo_likes enable row level security;
create policy solo_likes_read on public.solo_likes for select to authenticated
  using (user_id = (select auth.uid())
         or session_id in (select s.id from public.solo_sessions s where s.user_id = (select auth.uid()))
         or (select private.is_super()));
revoke all on public.solo_likes from public, anon, authenticated;
grant select on public.solo_likes to authenticated;

-- Juegos sueltos borrados (el id y de quién era). La cola sin conexión de otro teléfono puede mandar después un
-- guardado viejo con ese id: save_solo_session no lo vuelve a crear ('no_existe'). Se van con la cuenta.
create table private.solo_deleted (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  deleted_at timestamptz not null default now()
);
create index solo_deleted_user_idx on private.solo_deleted (user_id);

-- Tiempo real: solo dice cuál cambió (la pantalla vuelve a leer). Lo escucha solo el dueño ('user:<uid>').
create function private.emit_solo_sessions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.solo_sessions;
begin
  if tg_op = 'DELETE' then
    r := old;
  else
    r := new;
  end if;
  perform private.emit('user:' || r.user_id::text, 'solo', jsonb_build_object('id', r.id, 'op', lower(tg_op)));
  return null;
end $$;
create trigger solo_sessions_emit after insert or update or delete on public.solo_sessions
  for each row execute function private.emit_solo_sessions();

-- Crea o cambia un juego suelto de la cuenta (p_id: el del teléfono, o null para uno nuevo). Devuelve su id.
-- p_played_on: de hace 10 años hasta mañana (hora de RD). p_scores: 1 a 10 juegos de 0 a 300 (enteros, sin null).
-- p_frames: null o {"<juego desde 0>": {…}} solo con juegos que existen (vacío = null). Bolera ≤ 80 y nota ≤ 300,
-- recortadas. Un id de otra cuenta: 'no_permitido'; uno que ya se borró: 'no_existe' (no revive). 200 por día
-- ('rate_limited'). Con p_op_id, reintentar devuelve el mismo id sin repetir nada.
create function public.save_solo_session(p_id uuid, p_played_on date, p_scores jsonb, p_frames jsonb default null,
                                         p_venue text default '', p_note text default '', p_shared boolean default true,
                                         p_op_id uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_done jsonb;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_today date := (now() at time zone 'America/Santo_Domingo')::date;
  v_scores smallint[];
  v_frames jsonb := nullif(p_frames, 'null'::jsonb);
  v_venue text := btrim(coalesce(p_venue, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_owner uuid;
begin
  v_done := private.op_begin(p_op_id, 'save_solo_session');
  if v_done is not null then
    return (v_done #>> '{}')::uuid;
  end if;
  if p_played_on is null or p_played_on < (v_today - interval '10 years')::date or p_played_on > v_today + 1 then
    perform private.fail('invalido');
  end if;
  v_scores := private.series(p_scores, 'bowling', 1);
  if v_scores is null or cardinality(v_scores) > 10 or array_position(v_scores, null) is not null then
    perform private.fail('invalido');
  end if;
  if v_frames is not null then
    if jsonb_typeof(v_frames) <> 'object' or pg_column_size(v_frames) >= 16384
       or exists (select 1 from jsonb_each(v_frames) f
                   where jsonb_typeof(f.value) <> 'object'
                      or case when f.key ~ '^[0-9]$' then f.key::integer >= cardinality(v_scores) else true end) then
      perform private.fail('invalido');
    end if;
    if v_frames = '{}'::jsonb then
      v_frames := null;
    end if;
  end if;
  if char_length(v_venue) > 80 or char_length(v_note) > 300 then
    perform private.fail('invalido');
  end if;

  select s.user_id into v_owner from public.solo_sessions s where s.id = v_id for update;
  if v_owner is not null and v_owner <> v_uid then
    perform private.deny();
  end if;
  -- Un cambio viejo que llega después de borrarlo (desde otro teléfono) no lo crea otra vez.
  if v_owner is null and exists (select 1 from private.solo_deleted d where d.id = v_id) then
    perform private.fail('no_existe');
  end if;
  if not private.rate_take('solo:' || v_uid::text, 200, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  if v_owner is null then
    insert into public.solo_sessions (id, user_id, played_on, venue, note, scores, frames, shared)
    values (v_id, v_uid, p_played_on, v_venue, v_note, v_scores, v_frames, coalesce(p_shared, true));
  else
    update public.solo_sessions s set
      played_on = p_played_on, venue = v_venue, note = v_note, scores = v_scores, frames = v_frames, shared = coalesce(p_shared, true)
    where s.id = v_id;
  end if;
  perform private.op_end(p_op_id, to_jsonb(v_id));
  return v_id;
end $$;

-- Borra un juego suelto (con sus me gusta). Solo el suyo (el superadmin, cualquiera). 'no_existe' si no está. El id
-- queda en private.solo_deleted: no se puede volver a crear.
create function public.delete_solo_session(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_owner uuid;
begin
  select s.user_id into v_owner from public.solo_sessions s where s.id = p_id for update;
  if v_owner is null then
    perform private.fail('no_existe');
  end if;
  if v_owner <> v_uid and not private.is_super() then
    perform private.deny();
  end if;
  insert into private.solo_deleted (id, user_id) values (p_id, v_owner) on conflict (id) do nothing;
  delete from public.solo_sessions s where s.id = p_id;
end $$;

-- Juegos sueltos de una cuenta (null = la mía), del más nuevo al más viejo (played_on y id), hasta 500 por página
-- (50 si no se dice): [{id, userId, playedOn, venue, note, scores, frames, shared, createdAt, updatedAt, likes,
-- likedByMe}]. Los míos, todos; los de otra cuenta, solo los compartidos y si se ve (private.social_can_see; si no,
-- []). Página siguiente: p_before = playedOn y p_before_id = id del último.
create function public.solo_sessions_of(p_user uuid default null, p_limit integer default 50, p_before date default null,
                                        p_before_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_user uuid := coalesce(p_user, v_me);
  v_mine boolean := coalesce(p_user, v_me) = v_me;
  v_limit integer := private.clamp_int(p_limit, 1, 500, 50);
begin
  if not v_mine and not private.social_can_see(v_user) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id,
             'userId', x.user_id,
             'playedOn', to_char(x.played_on, 'YYYY-MM-DD'),
             'venue', x.venue,
             'note', x.note,
             'scores', to_jsonb(x.scores),
             'frames', x.frames,
             'shared', x.shared,
             'createdAt', private.iso(x.created_at),
             'updatedAt', private.iso(x.updated_at),
             'likes', (select count(*) from public.solo_likes l where l.session_id = x.id)::integer,
             'likedByMe', exists (select 1 from public.solo_likes l where l.session_id = x.id and l.user_id = v_me))
             order by x.played_on desc, x.id desc)
      from (select s.* from public.solo_sessions s
             where s.user_id = v_user and (v_mine or s.shared)
               and (p_before is null
                    or s.played_on < p_before
                    or (s.played_on = p_before and p_before_id is not null and s.id < p_before_id))
             order by s.played_on desc, s.id desc
             limit v_limit) x), '[]'::jsonb);
end $$;

-- =====================================================================
-- 2b. Juegos sueltos en lo social
-- =====================================================================

-- Igual que en 20260928000200_social.sql y además los juegos sueltos compartidos ('solo', clave 'j:<id>') de las
-- cuentas que ve quien mira (no son de ninguna liga: se mira private.social_can_see), a mediodía de su día en hora
-- de RD. Con p_sport, solo si es 'bowling'.
create or replace function private.social_items(p_users uuid[], p_sport text, p_before timestamptz, p_before_key text, p_limit integer)
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
  -- Juegos sueltos: las cuentas que ve quien mira (una vez por cuenta) y sus juegos compartidos.
  seen as materialized (
    select u.id from unnest(p_users) as u (id)
     where (p_sport is null or p_sport = 'bowling') and private.social_can_see(u.id)
  ),
  solo as (
    select 'j:' || s.id::text as key, 'solo'::text as kind, s.id as target, null::uuid as player_id, s.user_id, null::uuid as league_id,
           s.sport, null::text as league_name, null::uuid as event_id, private.social_event_at(s.played_on, null, null) as at,
           null::smallint as side
      from seen
      join public.solo_sessions s on s.user_id = seen.id
     where s.shared
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
    union all
    (select * from solo b where p_before is null or b.at < p_before or (b.at = p_before and b.key < p_before_key)
      order by b.at desc, b.key desc limit p_limit)
  )
  select * from everything u order by u.at desc, u.key desc limit p_limit
$$;

-- Igual que en 20260928000200_social.sql y además 'solo' (public.solo_likes).
create or replace function private.social_likes(p_kind text, p_target uuid, p_player uuid, out likes integer, out liked boolean)
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
  elsif p_kind = 'solo' then
    select count(*)::integer, coalesce(bool_or(l.user_id = v_me), false) into likes, liked
      from public.solo_likes l where l.session_id = p_target;
  else
    select count(*)::integer, coalesce(bool_or(g.user_id = v_me), false) into likes, liked
      from public.game_likes g where g.swim_entry_id = p_target;
  end if;
end $$;

-- Igual que en 20260928000200_social.sql y además 'solo': sin liga, jugador ni evento (playerId, leagueId,
-- leagueName, eventId y eventType null), eventName 'Juego suelto', eventDate = el día que jugó, detail {title:
-- 'Juego suelto', venue (null si no dijo), scores, series, high} y url '/juegos-sueltos?juego=<id>' solo para su
-- dueño (null para los demás).
create or replace function private.social_games(p_users uuid[], p_sport text, p_limit integer, p_before timestamptz, p_before_key text)
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
           pr.name as uname, e.type as etype,
           case when i.kind = 'solo' then 'Juego suelto' else e.name end as ename,
           coalesce(e.date, so.played_on) as edate
      from private.social_items(p_users, p_sport, p_before, p_before_key, p_limit) i
      join public.profiles pr on pr.id = i.user_id
      left join public.events e on e.id = i.event_id
      left join public.solo_sessions so on i.kind = 'solo' and so.id = i.target
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
    elsif r.kd = 'solo' then
      select jsonb_build_object(
               'title', 'Juego suelto',
               'venue', nullif(so.venue, ''),
               'scores', to_jsonb(so.scores),
               'series', (select coalesce(sum(v), 0) from unnest(so.scores) v),
               'high', (select coalesce(max(v), 0) from unnest(so.scores) v))
        into v_detail
        from public.solo_sessions so
       where so.id = r.tg;
      v_url := case when r.uid = auth.uid() then '/juegos-sueltos?juego=' || r.tg::text end;
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

-- Igual que en 20260929000200_invitaciones.sql y además los juegos sueltos compartidos: el boliche en 'sports' y
-- sus me gusta en 'likesReceived' ('gamesCount' ya los cuenta con private.social_items).
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
    'isMe', p_user = v_me);
end $$;

-- Igual que en 20260928000200_social.sql y además los juegos sueltos compartidos en el boliche: cada uno es una
-- sesión más y todos sus juegos cuentan en 'series' (no llevan foto: los anota su dueño).
create or replace function public.profile_stats(p_user uuid) returns jsonb
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
    -- Boliche: los pinos que cuentan (verificados) de cada participación y los de cada juego suelto, las 500 más nuevas.
    bowling as (
      select z.at, z.sc
        from (
          select i.at,
                 case when i.kind = 'solo' then to_jsonb(so.scores)
                      else to_jsonb(array(select s.v from unnest(x.scores) with ordinality as s (v, n)
                                           where s.v is not null and x.photos[s.n::integer] is not null order by s.n)) end as sc
            from items i
            left join public.entries x on i.kind = 'bowling' and x.id = i.target
            left join public.solo_sessions so on i.kind = 'solo' and so.id = i.target
           where i.kind in ('bowling', 'solo')
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

-- Igual que en 20260928000200_social.sql y además 'solo' (p_id = el juego suelto): darle me gusta exige que sea
-- compartido y que quien mira vea a su dueño (private.social_can_see; también el propio); quitarlo se puede siempre,
-- pero si ya no lo ve (dejó de ser compartido o ya no ve a su dueño) la respuesta es {likes: 0, liked: false}: no
-- cuenta los me gusta de un juego que no ve. Va en public.solo_likes y avisa en tiempo real al dueño
-- ('like' {op, kind: 'solo', id}), como los demás.
create or replace function public.set_game_like(p_kind text, p_id uuid, p_liked boolean, p_player uuid default null) returns jsonb
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
  so public.solo_sessions;
  v_likes integer;
  v_liked boolean;
begin
  if p_kind is null or p_kind not in ('bowling', 'match', 'golf', 'swim', 'solo') or p_id is null or p_liked is null then
    perform private.fail('invalido');
  end if;

  -- Juego suelto: no es de ninguna liga.
  if p_kind = 'solo' then
    select * into so from public.solo_sessions x where x.id = p_id;
    if so.id is null then
      perform private.fail('no_existe');
    end if;
    if p_liked then
      if not so.shared or not private.social_can_see(so.user_id) then
        perform private.deny();
      end if;
      if not exists (select 1 from public.solo_likes l where l.session_id = p_id and l.user_id = v_me) then
        perform private.social_pace('like', 300);
        insert into public.solo_likes (session_id, user_id) values (p_id, v_me) on conflict do nothing;
        v_changed := found;
      end if;
    else
      delete from public.solo_likes l where l.session_id = p_id and l.user_id = v_me;
      v_changed := found;
    end if;
    if v_changed and so.user_id <> v_me then
      perform private.emit('user:' || so.user_id::text, 'like',
                           jsonb_build_object('op', case when p_liked then 'insert' else 'delete' end, 'kind', p_kind, 'id', p_id));
    end if;
    -- Quitó el suyo de uno que ya no ve: sin los números de los demás.
    if so.user_id <> v_me and not (so.shared and private.social_can_see(so.user_id)) then
      return jsonb_build_object('likes', 0, 'liked', false);
    end if;
    select l.likes, l.liked into v_likes, v_liked from private.social_likes(p_kind, p_id, null) l;
    return jsonb_build_object('likes', v_likes, 'liked', v_liked);
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

-- Igual que en 20260928000200_social.sql y además los me gusta de otras cuentas en mis juegos sueltos:
-- {kind: 'like', at, userId, name, gameKind: 'solo', id, playerId: null, leagueId: null, leagueName: null,
--  sport: 'bowling', url: '/juegos-sueltos?juego=<id>'}.
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
       ) u
       order by u.at desc, u.k desc
       limit v_limit
      ) z
    ), '[]'::jsonb);
end $$;

-- Igual que en 20260927001500_cuenta.sql, pero los límites que se borran con la cuenta son todos los que terminan en
-- ':<uid>' (los de siempre, ':u:<uid>', y los que se cuentan por cuenta sin la 'u': 'solo:', 'logo:', 'invite:',
-- 'username:'…). Ninguna otra clave termina con el id de esta cuenta.
create or replace function private.forget_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id text := old.id::text;
begin
  delete from private.op_log where user_id = old.id;
  delete from private.paces where user_id = old.id;
  delete from private.rate_limits where right(key, char_length(v_id) + 1) = ':' || v_id;
  update public.admin_audit set detail = detail - 'name' - 'email'
   where target_type = 'user' and target_id = v_id and (detail ? 'name' or detail ? 'email');
  update public.admin_audit set detail = detail - 'fromName'
   where action = 'transfer_league' and detail ->> 'from' = v_id;
  update public.admin_audit set detail = detail - 'toName'
   where action = 'transfer_league' and detail ->> 'to' = v_id;
  update public.admin_audit set detail = detail - 'ownerName'
   where action = 'delete_league' and detail ->> 'ownerId' = v_id;
  perform private.audit('delete_account', 'user', v_id, jsonb_build_object('createdAt', private.iso(old.created_at)));
  return old;
end $$;

-- =====================================================================
-- 3. Logo de la liga o torneo
-- =====================================================================
-- El archivo va en el bucket público 'logos' (20260929000310_logos_supabase.sql) en '<liga>/<uuid>.webp|.jpg|.png':
-- cada logo nuevo es un archivo nuevo (nunca se reemplaza uno). null = sin logo.
alter table public.leagues add column logo_path text
  check (logo_path is null or logo_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$'));

-- Subidas reservadas (begin_logo_upload): la única forma de meter un archivo al bucket 'logos'. Cada reserva deja
-- subir un archivo a esa ruta, por quien la pidió y durante un día; set_league_logo la usa (y la borra). Las que no
-- se usan van a la cola de Storage (private.logo_uploads_cleanup, a diario, o al borrar la liga).
create table private.logo_uploads (
  path text primary key,
  league_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index logo_uploads_league_idx on private.logo_uploads (league_id);
create index logo_uploads_created_idx on private.logo_uploads (created_at);

-- La cola de Storage (20260926000200_schema.sql) lleva también logos: de qué bucket es cada archivo. Las fotos del
-- marcador (private.queue_photo_purge) siguen entrando sin decirlo.
alter table private.storage_purge_queue
  add column bucket text not null default 'scoreboards' check (bucket in ('scoreboards', 'logos'));

-- Política de subir del bucket 'logos': la ruta es '<liga>/<uuid>.webp|.jpg|.png' de una liga que existe, la cuenta
-- (sin bloquear) es su dueño o admin (o superadmin) y la reservó con begin_logo_upload hace menos de un día (y
-- todavía no se usó). false si la ruta no sirve.
create function private.can_upload_logo_path(p_path text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_league uuid;
begin
  begin
    v_league := split_part(p_path, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return p_path ~ ('^' || v_league::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$')
     and exists (select 1 from public.leagues l where l.id = v_league)
     and not private.is_blocked((select auth.uid()))
     and private.is_admin(v_league)
     and exists (select 1 from private.logo_uploads u
                  where u.path = p_path and u.league_id = v_league and u.user_id = (select auth.uid())
                    and u.created_at > now() - interval '1 day');
end $$;

-- Políticas de leer y borrar del bucket 'logos' (la cuenta sin bloquear): los de las ligas que administra y los que
-- ya no usa nadie (en la cola de Storage: un logo cambiado o quitado, el de una liga borrada, una reserva vencida).
create function private.can_remove_logo_path(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
     and not private.is_blocked((select auth.uid()))
     and (split_part(p_path, '/', 1) in (select l::text from private.photo_admin_leagues() l)
          or exists (select 1 from private.storage_purge_queue q where q.path = p_path and q.bucket = 'logos'))
$$;

-- Admin de la liga, antes de subir el logo: reserva la ruta '<p_league>/<uuid>.webp|.jpg|.png' (nueva: ni reservada,
-- ni en la cola de Storage, ni el logo de ahora). Después se sube a esa ruta y se pone con set_league_logo, antes de
-- un día. 'no_existe', 'no_permitido', 'invalido', 'rate_limited' (30 por día: cada subida cuenta, se use o no).
create function public.begin_logo_upload(p_league uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not exists (select 1 from public.leagues l where l.id = p_league) then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(p_league);
  if p_path is null or p_path !~ ('^' || p_league::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$')
     or exists (select 1 from private.logo_uploads u where u.path = p_path)
     or exists (select 1 from private.storage_purge_queue q where q.path = p_path)
     or exists (select 1 from public.leagues l where l.id = p_league and l.logo_path = p_path) then
    perform private.fail('invalido');
  end if;
  if not private.rate_take('logo:' || v_uid::text, 30, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  insert into private.logo_uploads (path, league_id, user_id) values (p_path, p_league, v_uid);
end $$;

-- Admin de la liga: pone el logo (una ruta que reservó con begin_logo_upload hace menos de un día y ya subió) o lo
-- quita (p_path null). Devuelve la ruta anterior (para borrarla de Storage; ya quedó en la cola) o null si no había o
-- no cambió. 'no_existe', 'no_permitido', 'invalido' (la ruta no es de esa liga, no tiene la forma o no está
-- reservada), 'rate_limited' (quitarlo: 30 por día, los mismos de begin_logo_upload; poner uno ya contó al reservar).
create function public.set_league_logo(p_league uuid, p_path text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_old text;
begin
  if not exists (select 1 from public.leagues l where l.id = p_league) then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(p_league);
  if p_path is not null and p_path !~ ('^' || p_league::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$') then
    perform private.fail('invalido');
  end if;
  select l.logo_path into v_old from public.leagues l where l.id = p_league for update;
  if p_path is not distinct from v_old then
    return null;
  end if;
  if p_path is null then
    if not private.rate_take('logo:' || v_uid::text, 30, interval '1 day') then
      perform private.fail('rate_limited');
    end if;
  else
    -- La reserva se usa una sola vez: después ya no se puede subir otro archivo a esa ruta.
    delete from private.logo_uploads u
     where u.path = p_path and u.league_id = p_league and u.user_id = v_uid and u.created_at > now() - interval '1 day';
    if not found then
      perform private.fail('invalido');
    end if;
  end if;
  update public.leagues l set logo_path = p_path where l.id = p_league;
  return v_old;
end $$;

-- El logo que deja de usarse (se cambió, se quitó o se borró la liga) y las reservas sin usar de una liga borrada van
-- a la cola de Storage (bucket 'logos'): nunca queda un archivo sin nadie que lo borre.
create function private.queue_logo_purge() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.logo_path is not null and (tg_op = 'DELETE' or new.logo_path is distinct from old.logo_path) then
    insert into private.storage_purge_queue (path, bucket) values (old.logo_path, 'logos') on conflict (path) do nothing;
  end if;
  if tg_op = 'DELETE' then
    with gone as (delete from private.logo_uploads u where u.league_id = old.id returning u.path)
    insert into private.storage_purge_queue (path, bucket) select g.path, 'logos' from gone g on conflict (path) do nothing;
  end if;
  return null;
end $$;

create trigger leagues_logo_purge after update of logo_path or delete on public.leagues
  for each row execute function private.queue_logo_purge();

-- Limpieza diaria (la programa 20260929000310_logos_supabase.sql): las reservas de hace más de un día que no se usaron
-- van a la cola de Storage (si se subió algo, sobra). Devuelve cuántas.
create function private.logo_uploads_cleanup(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  with gone as (delete from private.logo_uploads u where u.created_at <= p_now - interval '1 day' returning u.path),
  queued as (insert into private.storage_purge_queue (path, bucket) select g.path, 'logos' from gone g on conflict (path) do nothing)
  select count(*)::integer into n from gone;
  return n;
end $$;

-- Igual que en 20260926000500_rpc.sql y además logo_path. Cambia lo que devuelve: se borra y se crea de nuevo.
drop function public.invite_preview(text);
create function public.invite_preview(p_code text)
returns table (league_id uuid, name text, sport text, kind text, visibility text, logo_path text)
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := private.rate_key('preview');
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if private.rate_blocked(v_key, 30, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  return query
    select l.id, l.name, l.sport, l.kind, l.visibility, l.logo_path
      from public.league_secrets s join public.leagues l on l.id = s.league_id
     where s.invite_code = v_code;
  if not found then
    perform private.rate_hit(v_key, interval '1 hour');
  end if;
end $$;

-- Igual que en 20260927001300_liga.sql y además 'logoPath'.
create or replace function public.invite_details(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_key text := 'join:' || v_uid::text;
  v_code text := upper(btrim(coalesce(p_code, '')));
  l public.leagues;
begin
  if private.rate_blocked(v_key, 10, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  if v_code <> '' then
    select x.* into l from public.league_secrets s join public.leagues x on x.id = s.league_id where s.invite_code = v_code;
  end if;
  if l.id is null then
    perform private.rate_hit(v_key, interval '1 hour');
    return null;
  end if;
  return jsonb_build_object(
    'leagueId', l.id,
    'name', l.name,
    'sport', l.sport,
    'kind', l.kind,
    'visibility', l.visibility,
    'logoPath', l.logo_path,
    'venue', l.venue,
    'schedule', l.schedule,
    'seasonStart', l.season_start,
    'seasonEnd', l.season_end,
    'hasMinors', l.has_minors,
    'members', (select count(*) from public.league_members m where m.league_id = l.id)::integer,
    'member', exists (select 1 from public.league_members m where m.league_id = l.id and m.user_id = v_uid),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.name, f.id)
        from (select p.id, p.name from public.players p
               where p.league_id = l.id and p.user_id is null and not p.is_minor
               order by p.name, p.id
               limit 500) f), '[]'::jsonb));
end $$;

-- Igual que en 20260929000200_invitaciones.sql y además 'logoPath' (de la liga) en cada una.
create or replace function public.my_league_invites() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id,
             'leagueId', x.league_id,
             'leagueName', x.league_name,
             'logoPath', x.logo_path,
             'sport', x.sport,
             'kind', x.kind,
             'visibility', x.visibility,
             'members', x.members,
             'invitedBy', case when x.invited_by is null then null
                               else jsonb_build_object('id', x.invited_by, 'name', x.from_name, 'username', x.from_username) end,
             'createdAt', private.iso(x.created_at))
             order by x.created_at desc, x.id desc)
      from (select i.id, i.league_id, i.invited_by, i.created_at, l.name as league_name, l.logo_path, l.sport, l.kind, l.visibility,
                   (select count(*) from public.league_members m where m.league_id = l.id)::integer as members,
                   p.name as from_name, p.username as from_username
              from public.league_invites i
              join public.leagues l on l.id = i.league_id
              left join public.profiles p on p.id = i.invited_by
             where i.user_id = v_uid and i.status = 'pending' and private.invite_ok(i.league_id, i.invited_by)
             order by i.created_at desc, i.id desc
             limit 50) x), '[]'::jsonb);
end $$;

-- Igual que en 20260929000200_invitaciones.sql y además 'logoPath' en league (siempre: el logo es una imagen pública).
create or replace function public.league_invite_details(p_invite uuid) returns jsonb
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
      'logoPath', l.logo_path,
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

-- Igual que en 20260927001100_consola.sql y además 'logoPath'.
create or replace function private.admin_league_row(p_league uuid, p_activity timestamptz default null) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', l.id,
    'name', l.name,
    'sport', l.sport,
    'kind', l.kind,
    'visibility', l.visibility,
    'logoPath', l.logo_path,
    'hasMinors', l.has_minors,
    'ownerId', l.owner_id,
    'ownerName', coalesce(o.name, ''),
    'ownerEmail', o.email,
    'members', (select count(*) from public.league_members m where m.league_id = l.id)::integer,
    'players', (select count(*) from public.players x where x.league_id = l.id)::integer,
    'events', (select count(*) from public.events x where x.league_id = l.id)::integer,
    'lastActivityAt', private.iso(coalesce(p_activity, private.league_last_activity(l.id))),
    'createdAt', private.iso(l.created_at))
  from public.leagues l
  left join public.profiles o on o.id = l.owner_id
  where l.id = p_league
$$;

-- =====================================================================
-- Permisos: las RPC solo con sesión (invite_preview también sin cuenta); las ayudas, nadie de la app salvo las de
-- las políticas del bucket de logos
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array['save_solo_session', 'delete_solo_session', 'solo_sessions_of', 'begin_logo_upload', 'set_league_logo',
                                 'public_profile', 'profile_stats', 'set_game_like', 'social_notices', 'invite_details',
                                 'my_league_invites', 'league_invite_details', 'invite_preview'];
  v_private constant text[] := array['emit_solo_sessions', 'social_items', 'social_likes', 'social_games', 'forget_user',
                                     'can_upload_logo_path', 'can_remove_logo_path', 'queue_logo_purge', 'logo_uploads_cleanup',
                                     'admin_league_row'];
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

-- Con el código se ve a qué liga invita, también sin cuenta.
grant execute on function public.invite_preview(text) to anon;
-- Las políticas de Storage del bucket 'logos' las llaman como la cuenta que sube, lee o borra.
grant execute on function private.can_upload_logo_path(text) to authenticated;
grant execute on function private.can_remove_logo_path(text) to authenticated;
