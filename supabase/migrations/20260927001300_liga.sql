-- MatchMate · Liga: avisos del admin a toda su liga («Se suspende por lluvia») y «¿Quién eres?» al unirse.
--
-- 1. public.league_announcements: el historial de avisos de cada liga. Lo ve quien ve la liga (así el aviso sale
--    también en la portada para quien no activó las notificaciones); nadie escribe directo.
-- 2. league_announce(p_league, p_body): el admin de la liga (dueño, admin o superadmin) manda un push a los
--    miembros con avisos activados (sin bloquear, sin contarse a sí mismo). Texto 1–180. Máximo 3 por día de la
--    liga (su zona horaria): 'rate_limited'. Queda en el historial con quién, cuándo y a cuántas cuentas llegó,
--    aunque no le llegue a nadie. Devuelve a cuántas cuentas se encoló.
-- 3. league_announce_reach(p_league): antes de mandar, cuántos miembros hay, a cuántos les llegaría y cuántos
--    avisos quedan hoy.
-- 4. invite_details(p_code): con el código de invitación (link o QR), lo que hace falta para decidir unirse
--    (deporte, lugar, horario, temporada, miembros) y los jugadores libres que ya creó el admin, para elegir
--    «¿Quién eres?» y unirse con join_league(p_prefer). Solo con sesión; un código malo cuenta en el mismo
--    límite de join_league (10 por hora) y devuelve null.
--
-- Contrato del cliente: src/lib/data/leagues.ts (LeagueAnnouncement, AnnounceReach, InviteDetails).

-- =====================================================================
-- Historial de avisos
-- =====================================================================
-- sent_by sin FK estricta a la cuenta (on delete set null): el aviso queda aunque se borre quien lo mandó.
-- local_day: el día de la liga cuando se mandó (el tope diario se cuenta por él, en la zona de la liga).
create table public.league_announcements (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 180),
  sent_by uuid references public.profiles (id) on delete set null,
  author_name text not null default '' check (char_length(author_name) <= 60),
  recipients integer not null default 0 check (recipients >= 0),
  local_day date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index league_announcements_recent_idx on public.league_announcements (league_id, created_at desc);
create index league_announcements_day_idx on public.league_announcements (league_id, local_day);
create index league_announcements_sync_idx on public.league_announcements (league_id, updated_at);

create trigger league_announcements_touch before update on public.league_announcements
  for each row execute function private.touch_updated_at();

alter table public.league_announcements enable row level security;
create policy league_announcements_read on public.league_announcements for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
grant select on public.league_announcements to anon, authenticated;

-- Tope de avisos por liga y día (en la zona de la liga).
create function private.announce_daily_limit() returns integer
language sql immutable set search_path = '' as $$
  select 3
$$;

-- Cuentas de la liga que reciben el aviso: miembros sin bloquear, con al menos un teléfono con avisos, menos
-- quien lo manda.
create function private.league_announce_users(p_league uuid, p_sender uuid) returns setof uuid
language sql stable set search_path = '' as $$
  select m.user_id
    from public.league_members m
    join public.profiles p on p.id = m.user_id
   where m.league_id = p_league
     and m.user_id is distinct from p_sender
     and p.blocked_at is null
     and exists (select 1 from public.push_subscriptions s where s.user_id = m.user_id)
$$;

-- =====================================================================
-- RPC
-- =====================================================================

-- Admin: aviso push a toda la liga. Ver el encabezado.
create function public.league_announce(p_league uuid, p_body text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_body text := btrim(replace(coalesce(p_body, ''), E'\r\n', E'\n'), E' \t\n');
  l public.leagues;
  v_day date;
  v_users uuid[];
  v_n integer;
  v_id uuid := gen_random_uuid();
  v_author text;
begin
  perform private.require_admin(p_league);
  select * into l from public.leagues x where x.id = p_league;
  if l.id is null then
    perform private.fail('no_existe');
  end if;
  -- Texto de una línea o varias, sin caracteres de control (salvo el salto de línea).
  if char_length(v_body) not between 1 and 180 or replace(v_body, E'\n', '') ~ '[[:cntrl:]]' then
    perform private.fail('invalido');
  end if;
  -- Dos avisos a la vez de la misma liga esperan uno al otro: la cuenta del día es exacta.
  perform pg_advisory_xact_lock(hashtext('mm:league_announce:' || p_league::text));
  v_day := (now() at time zone l.tz)::date;
  if (select count(*) from public.league_announcements a where a.league_id = p_league and a.local_day = v_day)
     >= private.announce_daily_limit() then
    perform private.fail('rate_limited');
  end if;
  v_author := coalesce(
    (select m.display_name from public.league_members m where m.league_id = p_league and m.user_id = v_uid),
    (select p.name from public.profiles p where p.id = v_uid),
    '');
  v_users := array(select u from private.league_announce_users(p_league, v_uid) u);
  v_n := coalesce(cardinality(v_users), 0);
  -- Una fila por cuenta; el trigger push_outbox_fanout la reparte a sus teléfonos. Urgente y vale 12 horas
  -- («se suspende hoy» no sirve al día siguiente). El tag es del aviso: dos avisos no se pisan en el teléfono.
  insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
  select u, l.name, v_body, '/l/' || p_league::text, 'aviso:' || v_id::text, 43200, 'high'
    from unnest(v_users) u;
  insert into public.league_announcements (id, league_id, body, sent_by, author_name, recipients, local_day)
  values (v_id, p_league, v_body, v_uid, left(v_author, 60), v_n, v_day);
  perform private.emit('league:' || p_league::text, 'announcements', jsonb_build_object('op', 'insert', 'ids', jsonb_build_array(v_id)));
  -- Que salga ya (sin esperar la vuelta del cron). En PGlite no hace nada.
  if v_n > 0 then
    perform private.kick_send_push();
  end if;
  return v_n;
end $$;

-- Admin: antes de mandar, a cuántos llega y cuántos avisos quedan hoy.
-- {members, reach, sentToday, dailyLimit}
create function public.league_announce_reach(p_league uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  l public.leagues;
begin
  perform private.require_admin(p_league);
  select * into l from public.leagues x where x.id = p_league;
  if l.id is null then
    perform private.fail('no_existe');
  end if;
  return jsonb_build_object(
    'members', (select count(*) from public.league_members m where m.league_id = p_league)::integer,
    'reach', (select count(*) from private.league_announce_users(p_league, v_uid))::integer,
    'sentToday', (select count(*) from public.league_announcements a
                   where a.league_id = p_league and a.local_day = (now() at time zone l.tz)::date)::integer,
    'dailyLimit', private.announce_daily_limit());
end $$;

-- Con el código de invitación: la liga y los jugadores libres («¿Quién eres?»). Ver el encabezado.
-- {leagueId, name, sport, kind, visibility, venue, schedule, seasonStart, seasonEnd, hasMinors, members, member,
--  players: [{id, name}]} o null si el código no sirve. Los jugadores: sin cuenta y no menores (los que
--  join_league puede vincular con p_prefer), por nombre, hasta 500.
create function public.invite_details(p_code text) returns jsonb
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

-- =====================================================================
-- Permisos: las RPC solo con sesión; las ayudas, nadie de la app
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array['league_announce', 'league_announce_reach', 'invite_details'];
  v_private constant text[] := array['announce_daily_limit', 'league_announce_users'];
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
