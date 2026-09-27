-- MatchMate · Consola del superadmin (el dueño de la app): métricas, cuentas, ligas, anuncios, sistema y auditoría.
--
-- La administración de cada liga (dueño + admins de esa liga) NO cambia. Esto es para toda la app y solo para el
-- superadmin (profiles.is_superadmin). Contrato del cliente: src/lib/data/admin.ts. Resumen: supabase/README.md
-- («Consola del superadmin»).
--
-- 1. Perfiles: last_seen_at (touch_seen, como mucho cada 6 h), blocked_at y blocked_reason.
-- 2. Bloqueo: private.require_uid() (la usan TODAS las RPC que escriben) falla con 'bloqueada' (42501) si la
--    cuenta está bloqueada. Leer sigue funcionando. Un superadmin no se bloquea; nadie se bloquea a sí mismo.
--    También: no sube fotos a Storage (can_upload_photo) ni lee fotos con IA (can_scan). Bloquear no borra nada.
-- 3. Auditoría: public.admin_audit (solo la lee el superadmin; nadie escribe directo) con private.audit().
--    Dejan rastro: set_superadmin, set_sport_status, bloquear/desbloquear, anuncios, y delete_league /
--    transfer_ownership cuando un superadmin actúa sobre una liga que no es suya.
-- 4. Lecturas admin_* (security definer, solo superadmin, jsonb en camelCase como src/lib/data/admin.ts).
-- 5. Acciones: admin_block_user, admin_unblock_user, admin_announce, admin_count_recipients.
--
-- Todo corre también en PGlite: lo que solo existe en Supabase (supabase_migrations, pg_cron, storage con
-- metadata, pg_database_size…) se busca primero con to_regclass/to_regprocedure y, si no está, sale null.
-- Días de las series: hora de República Dominicana (private.console_tz), como el horario de las ligas.

-- =====================================================================
-- Perfiles: visto por última vez y bloqueo
-- =====================================================================
alter table public.profiles
  add column last_seen_at timestamptz,
  add column blocked_at timestamptz,
  add column blocked_reason text check (blocked_reason is null or char_length(blocked_reason) <= 200);

-- Lista de cuentas (más nuevas primero), activas, bloqueadas y superadmins: rápido con 50 000 cuentas.
create index profiles_created_idx on public.profiles (created_at desc, id desc);
create index profiles_seen_idx on public.profiles (last_seen_at) where last_seen_at is not null;
create index profiles_blocked_idx on public.profiles (blocked_at) where blocked_at is not null;
create index profiles_super_idx on public.profiles (id) where is_superadmin;

-- Lo creado por día (series y «últimos 7 días») sin recorrer las tablas enteras.
create index events_created_idx on public.events (created_at);
create index entries_created_idx on public.entries (created_at);
create index matches_created_idx on public.matches (created_at);
create index submissions_created_idx on public.submissions (created_at);
create index submissions_pending_idx on public.submissions (league_id) where status = 'pendiente';
create index photos_created_at_idx on public.photos (created_at);

-- Quién abrió la app cada día (usuarios activos por día). touch_seen agrega una fila por cuenta y día. Para no
-- gastar la base del plan gratis (una fila por cuenta y día), la limpieza diaria (private.console_cleanup,
-- programada en 20260927001190_consola_supabase.sql) pasa los días de hace más de 35 a private.daily_active
-- (un número por día, 400 días) y borra sus filas.
create table private.daily_seen (
  day date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (day, user_id)
);
create index daily_seen_user_idx on private.daily_seen (user_id);

create table private.daily_active (
  day date primary key,
  users integer not null check (users >= 0)
);

-- =====================================================================
-- Auditoría: lo que se hizo desde la consola
-- =====================================================================
-- actor_id sin FK a propósito: el rastro queda aunque la cuenta del superadmin se borre.
create table public.admin_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  action text not null check (action ~ '^[a-z][a-z_]{1,39}$'),
  target_type text not null check (target_type in ('user', 'league', 'sport', 'app')),
  target_id text check (char_length(target_id) <= 100),
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) < 8192)
);
create index admin_audit_at_idx on public.admin_audit (at desc, id desc);
create index admin_audit_action_idx on public.admin_audit (action, at desc, id desc);

alter table public.admin_audit enable row level security;
create policy admin_audit_read on public.admin_audit for select to authenticated using ((select private.is_super()));
grant select on public.admin_audit to authenticated;

-- =====================================================================
-- Ayudas
-- =====================================================================

-- Zona de las series y de «hoy» en la consola.
create function private.console_tz() returns text
language sql immutable set search_path = '' as $$
  select 'America/Santo_Domingo'::text
$$;

create function private.console_day(p_at timestamptz default now()) returns date
language sql stable set search_path = '' as $$
  select (p_at at time zone private.console_tz())::date
$$;

-- Hora en texto ISO con milisegundos y Z (la entiende cualquier navegador). null → null.
create function private.iso(p timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char(p at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

create function private.clamp_int(p integer, p_min integer, p_max integer, p_default integer) returns integer
language sql immutable set search_path = '' as $$
  select least(greatest(coalesce(p, p_default), p_min), p_max)
$$;

-- Texto de búsqueda para LIKE (los % y _ que escribe la persona no son comodines).
create function private.like_escape(p text) returns text
language sql immutable set search_path = '' as $$
  select replace(replace(replace(coalesce(p, ''), '\', '\\'), '%', '\%'), '_', '\_')
$$;

-- Ruta dentro de la app para un anuncio: empieza con una sola '/', sin espacios, barras invertidas ni
-- caracteres de control (así nunca manda a otra página: '//otro.com' o '/\otro.com').
create function private.app_path_ok(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p is not null and char_length(p) between 1 and 200 and left(p, 1) = '/' and left(p, 2) <> '//'
     and p !~ '[[:space:][:cntrl:]\\]'
$$;

-- ¿Cuenta bloqueada?
create function private.is_blocked(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = p_user and p.blocked_at is not null)
$$;

-- Exige sesión y que la cuenta no esté bloqueada; devuelve el uid. Misma firma y uso que en
-- 20260926000100_base.sql: todas las RPC que escriben la llaman, así una cuenta bloqueada no escribe nada.
create or replace function private.require_uid() returns uuid
language plpgsql stable set search_path = '' as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'no_permitido' using errcode = '42501';
  end if;
  if private.is_blocked(v) then
    raise exception 'bloqueada' using errcode = '42501';
  end if;
  return v;
end $$;

-- Exige ser superadmin (con sesión y sin bloquear). Devuelve el uid.
create function private.require_super() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v uuid := private.require_uid();
begin
  if not private.is_super() then
    raise exception 'no_permitido' using errcode = '42501';
  end if;
  return v;
end $$;

-- Deja rastro de una acción de la consola (quién = la cuenta de la sesión).
create function private.audit(p_action text, p_target_type text, p_target_id text, p_detail jsonb default '{}')
returns void
language sql security definer set search_path = '' as $$
  insert into public.admin_audit (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb));
$$;

-- Último cambio de algo de la liga (eventos, juegos, partidos, envíos, tarjetas de golf, natación). Cada max()
-- usa el índice (league_id, updated_at) de su tabla: una lectura por tabla.
create function private.league_last_activity(p_league uuid) returns timestamptz
language sql stable set search_path = '' as $$
  select greatest(
    (select max(x.updated_at) from public.events x where x.league_id = p_league),
    (select max(x.updated_at) from public.entries x where x.league_id = p_league),
    (select max(x.updated_at) from public.matches x where x.league_id = p_league),
    (select max(x.updated_at) from public.submissions x where x.league_id = p_league),
    (select max(x.updated_at) from public.golf_cards x where x.league_id = p_league),
    (select max(x.updated_at) from public.swim_entries x where x.league_id = p_league))
$$;

-- Una cuenta como la ve la consola (AdminUser). null si no existe.
create function private.admin_user_row(p_user uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'name', p.name,
    'createdAt', private.iso(p.created_at),
    'lastSeenAt', private.iso(p.last_seen_at),
    'lastSignInAt', private.iso(a.last_sign_in_at),
    'confirmed', a.email_confirmed_at is not null,
    'provider', nullif(a.raw_app_meta_data ->> 'provider', ''),
    'superadmin', p.is_superadmin,
    'blockedAt', private.iso(p.blocked_at),
    'blockedReason', p.blocked_reason,
    'leagues', (select count(*) from public.league_members m where m.user_id = p.id)::integer,
    'ownedLeagues', (select count(*) from public.leagues l where l.owner_id = p.id)::integer)
  from public.profiles p
  left join auth.users a on a.id = p.id
  where p.id = p_user
$$;

-- Una liga como la ve la consola (AdminLeague). p_activity: la última actividad si ya se calculó.
create function private.admin_league_row(p_league uuid, p_activity timestamptz default null) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', l.id,
    'name', l.name,
    'sport', l.sport,
    'kind', l.kind,
    'visibility', l.visibility,
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

-- Público de un anuncio → {kind, sport | leagueId} ya revisado. 'invalido' si no sirve; 'no_existe' si la liga no está.
create function private.announce_audience(p_audience jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_kind text;
  v_sport text;
  v_league text;
begin
  if p_audience is null or jsonb_typeof(p_audience) <> 'object' then
    perform private.fail('invalido');
  end if;
  v_kind := p_audience ->> 'kind';
  if v_kind in ('all', 'admins') then
    return jsonb_build_object('kind', v_kind);
  elsif v_kind = 'sport' then
    v_sport := p_audience ->> 'sport';
    if v_sport is null or not exists (select 1 from public.sport_status s where s.id = v_sport) then
      perform private.fail('invalido');
    end if;
    return jsonb_build_object('kind', v_kind, 'sport', v_sport);
  elsif v_kind = 'league' then
    v_league := coalesce(p_audience ->> 'leagueId', p_audience ->> 'league_id');
    if v_league is null or v_league !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      perform private.fail('invalido');
    end if;
    if not exists (select 1 from public.leagues l where l.id = v_league::uuid) then
      perform private.fail('no_existe');
    end if;
    return jsonb_build_object('kind', v_kind, 'leagueId', lower(v_league));
  end if;
  perform private.fail('invalido');
  return null;
end $$;

-- Cuentas que reciben un anuncio (público ya revisado): sin bloquear y con al menos un teléfono con avisos.
-- 'admins' = dueños y admins de cualquier liga.
create function private.announce_users(p_audience jsonb) returns setof uuid
language sql stable set search_path = '' as $$
  select p.id
    from public.profiles p
   where p.blocked_at is null
     and exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
     and case p_audience ->> 'kind'
           when 'all' then true
           when 'admins' then exists (
             select 1 from public.league_members m where m.user_id = p.id and m.role in ('owner', 'admin'))
           when 'sport' then exists (
             select 1 from public.league_members m join public.leagues l on l.id = m.league_id
              where m.user_id = p.id and l.sport = p_audience ->> 'sport')
           when 'league' then exists (
             select 1 from public.league_members m where m.user_id = p.id and m.league_id = (p_audience ->> 'leagueId')::uuid)
           else false
         end
$$;

-- Limpieza diaria: los días vistos de hace más de 35 días pasan a private.daily_active (cuántas cuentas ese día)
-- y se borran sus filas; los números de hace más de 400 días se borran (la serie más larga es de 365).
-- Devuelve cuántas filas de private.daily_seen borró.
create function private.console_cleanup() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_cut date := private.console_day() - 35;
  n integer;
begin
  insert into private.daily_active (day, users)
  select s.day, count(*)::integer from private.daily_seen s where s.day < v_cut group by s.day
  on conflict (day) do update set users = private.daily_active.users + excluded.users;
  delete from private.daily_seen where day < v_cut;
  get diagnostics n = row_count;
  delete from private.daily_active where day < private.console_day() - 400;
  return n;
end $$;

-- =====================================================================
-- Bloqueo en lo que no pasa por require_uid
-- =====================================================================

-- Subir fotos a Storage (la política del bucket usa can_upload_photo_path → esta): una cuenta bloqueada no sube.
-- Igual que en 20260926000400_rls.sql más la condición del bloqueo.
create or replace function private.can_upload_photo(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.leagues l where l.id = p_league and not l.has_minors)
     and not private.is_blocked((select auth.uid()))
     and (private.is_admin(p_league) or private.is_scorer(p_league) or private.my_player(p_league) is not null)
$$;

-- Borrar archivos de fotos en Storage (política mm_scoreboards_delete, que 20260927001190_consola_supabase.sql
-- crea de nuevo con esta): las ligas que administra, y ninguna si la cuenta está bloqueada. Leer no cambia
-- (private.admin_leagues sigue igual para las demás políticas).
create function private.photo_admin_leagues() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select l from private.admin_leagues() l where not private.is_blocked((select auth.uid()))
$$;

-- Lectura de fotos con IA (scan-bowling entra con service_role y pasa p_user): una cuenta bloqueada no gasta cupo.
-- Igual que en 20260926001000_scan.sql más la condición del bloqueo.
create or replace function private.can_scan(p_user uuid, p_league uuid, p_event uuid) returns void
language plpgsql set search_path = '' as $$
declare
  l public.leagues;
  e public.events;
  v_today date;
begin
  if p_user is null or p_league is null then
    perform private.fail('invalido');
  end if;
  if private.is_blocked(p_user) then
    raise exception 'bloqueada' using errcode = '42501';
  end if;
  select * into l from public.leagues x where x.id = p_league;
  if l.id is null then
    perform private.fail('no_existe');
  end if;
  -- Está en la liga (o es superadmin, que administra todas).
  if not exists (select 1 from public.league_members m where m.league_id = p_league and m.user_id = p_user)
     and not coalesce((select p.is_superadmin from public.profiles p where p.id = p_user), false) then
    perform private.deny();
  end if;
  -- Solo boliche, y nunca en ligas con menores (la capa gratis de Google es solo para mayores de 18).
  if l.sport <> 'bowling' or l.has_minors then
    perform private.deny();
  end if;
  if p_event is not null then
    select * into e from public.events x where x.id = p_event;
    if e.id is null or e.league_id <> p_league then
      perform private.fail('no_existe');
    end if;
    -- Evento abierto: de las últimas 2 semanas (las aprobaciones pueden tardar) hasta mañana (hora de la liga).
    v_today := (now() at time zone l.tz)::date;
    if e.date < v_today - 14 or e.date > v_today + 1 then
      perform private.fail('cerrado');
    end if;
  end if;
end $$;

-- La escalera se pone al día cuando alguien abre la pantalla (es leer, no escribir): una cuenta bloqueada
-- también la ve al día. Igual que en 20260927000700_raqueta.sql pero sin require_uid (basta la sesión).
create or replace function public.sync_ladder(p_event uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
begin
  if auth.uid() is null then
    perform private.deny();
  end if;
  v_league := (select e.league_id from public.events e where e.id = p_event);
  if v_league is null or v_league not in (select private.readable_leagues()) then
    perform private.fail('no_existe');
  end if;
  if not exists (select 1 from public.ladder_challenges c where c.event_id = p_event and c.status in ('pending', 'accepted')) then
    return 0;
  end if;
  perform private.ladder_event(p_event);
  return private.ladder_sync(p_event);
end $$;

-- =====================================================================
-- RPC de siempre, ahora con rastro en la auditoría (mismo comportamiento y permisos)
-- =====================================================================

-- Solo otro superadmin nombra o quita superadmins. Nombrar superadmin a una cuenta bloqueada la desbloquea
-- (un superadmin nunca está bloqueado).
create or replace function public.set_superadmin(p_user uuid, p_value boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.profiles;
  v_value boolean := coalesce(p_value, false);
begin
  perform private.require_uid();
  if not private.is_super() then
    perform private.deny();
  end if;
  select * into v_old from public.profiles x where x.id = p_user;
  update public.profiles set
    is_superadmin = v_value,
    blocked_at = case when v_value then null else blocked_at end,
    blocked_reason = case when v_value then null else blocked_reason end
  where id = p_user;
  if not found then
    perform private.fail('no_existe');
  end if;
  perform private.audit('set_superadmin', 'user', p_user::text,
    jsonb_build_object('value', v_value, 'before', v_old.is_superadmin, 'name', v_old.name, 'email', v_old.email)
    || case when v_value and v_old.blocked_at is not null then jsonb_build_object('unblocked', true) else '{}'::jsonb end);
end $$;

-- Superadmin: abre, pone en beta o cierra un deporte.
create or replace function public.set_sport_status(p_sport text, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old text;
begin
  perform private.require_uid();
  if not private.is_super() then
    perform private.deny();
  end if;
  select s.status into v_old from public.sport_status s where s.id = p_sport;
  update public.sport_status set status = p_status where id = p_sport;
  if not found then
    perform private.fail('no_existe');
  end if;
  perform private.audit('set_sport_status', 'sport', p_sport, jsonb_build_object('from', v_old, 'to', p_status));
end $$;

-- Dueño (o superadmin): borra la liga con todo su contenido (cascada). Solo queda su tombstone; los
-- archivos de fotos van a la cola de Storage. Si la borra un superadmin que no es el dueño, queda en la auditoría.
create or replace function public.delete_league(p_league uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  l public.leagues;
  v_detail jsonb;
begin
  if not private.is_owner(p_league) then
    perform private.deny();
  end if;
  select * into l from public.leagues x where x.id = p_league;
  if l.id is not null and l.owner_id is distinct from v_uid and private.is_super() then
    v_detail := jsonb_build_object(
      'name', l.name, 'sport', l.sport, 'kind', l.kind, 'ownerId', l.owner_id,
      'ownerName', (select p.name from public.profiles p where p.id = l.owner_id),
      'members', (select count(*) from public.league_members m where m.league_id = p_league),
      'players', (select count(*) from public.players x where x.league_id = p_league),
      'events', (select count(*) from public.events x where x.league_id = p_league));
  end if;
  perform set_config('mm.deleting_league', p_league::text, true);
  delete from public.leagues where id = p_league;
  if not found then
    perform private.fail('no_existe');
  end if;
  perform set_config('mm.deleting_league', '', true);
  if v_detail is not null then
    perform private.audit('delete_league', 'league', p_league::text, v_detail);
  end if;
end $$;

-- Dueño (o superadmin): pasa la liga a otro miembro; el dueño anterior queda como admin. Es el camino
-- para poder borrar la cuenta de un dueño (leagues.owner_id no deja borrarla). Si lo hace un superadmin que no
-- es el dueño, queda en la auditoría.
create or replace function public.transfer_ownership(p_league uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  l public.leagues;
begin
  if not private.is_owner(p_league) then
    perform private.deny();
  end if;
  if not exists (select 1 from public.league_members m where m.league_id = p_league and m.user_id = p_user and m.role <> 'owner') then
    perform private.fail('no_existe');
  end if;
  select * into l from public.leagues x where x.id = p_league;
  perform set_config('mm.transfer', p_league::text, true);
  update public.league_members set role = 'admin' where league_id = p_league and role = 'owner';
  update public.league_members set role = 'owner' where league_id = p_league and user_id = p_user;
  update public.leagues set owner_id = p_user where id = p_league;
  perform set_config('mm.transfer', '', true);
  if l.owner_id is distinct from v_uid and private.is_super() then
    perform private.audit('transfer_league', 'league', p_league::text, jsonb_build_object(
      'name', l.name, 'sport', l.sport, 'from', l.owner_id, 'to', p_user,
      'fromName', (select p.name from public.profiles p where p.id = l.owner_id),
      'toName', (select p.name from public.profiles p where p.id = p_user)));
  end if;
end $$;

-- =====================================================================
-- «Estoy usando la app» (cualquier cuenta; la app lo llama una vez al día por teléfono)
-- =====================================================================
-- Barata: last_seen_at solo se escribe si está vacío o tiene más de 6 horas, y el día visto se agrega una vez.
-- Nunca falla (tampoco a una cuenta bloqueada: no usa require_uid).
create function public.touch_seen() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;
  update public.profiles set last_seen_at = now()
   where id = v_uid and (last_seen_at is null or last_seen_at < now() - interval '6 hours');
  insert into private.daily_seen (day, user_id)
  select private.console_day(), v_uid
   where exists (select 1 from public.profiles p where p.id = v_uid)
  on conflict do nothing;
exception when others then
  raise warning 'touch_seen %: %', v_uid, sqlerrm;
end $$;

-- =====================================================================
-- Lecturas de la consola (solo superadmin)
-- =====================================================================

-- Resumen general (AdminOverview).
create function public.admin_overview() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := now();
  v_users jsonb;
  v_leagues jsonb;
  v_activity jsonb;
  v_storage jsonb;
  v_db bigint;
  v_photos_bytes bigint;
  v_push jsonb;
begin
  perform private.require_super();

  select jsonb_build_object(
      'total', count(*)::integer,
      'new7d', (count(*) filter (where p.created_at >= v_now - interval '7 days'))::integer,
      'new30d', (count(*) filter (where p.created_at >= v_now - interval '30 days'))::integer,
      'active7d', (count(*) filter (where p.last_seen_at >= v_now - interval '7 days'))::integer,
      'active30d', (count(*) filter (where p.last_seen_at >= v_now - interval '30 days'))::integer,
      'superadmins', (count(*) filter (where p.is_superadmin))::integer,
      'blocked', (count(*) filter (where p.blocked_at is not null))::integer,
      'unconfirmed', (select count(*) from public.profiles x join auth.users a on a.id = x.id where a.email_confirmed_at is null)::integer)
    into v_users
    from public.profiles p;

  with l as (
    select x.id, x.sport, x.kind, x.visibility, x.has_minors, x.created_at,
           private.league_last_activity(x.id) >= v_now - interval '7 days' as active
      from public.leagues x
  ), players as (
    select x.sport, count(*)::integer as n
      from public.players p join public.leagues x on x.id = p.league_id
     group by x.sport
  ), by_sport as (
    select s.id as sport, s.sort_order,
           (select count(*) from l where l.sport = s.id)::integer as leagues,
           coalesce((select n from players where players.sport = s.id), 0) as players,
           (select count(*) from l where l.sport = s.id and l.active)::integer as active7d
      from public.sport_status s
  )
  select jsonb_build_object(
      'total', (select count(*) from l)::integer,
      'public', (select count(*) from l where l.visibility = 'public')::integer,
      'private', (select count(*) from l where l.visibility = 'private')::integer,
      'tournaments', (select count(*) from l where l.kind = 'torneo')::integer,
      'withMinors', (select count(*) from l where l.has_minors)::integer,
      'new30d', (select count(*) from l where l.created_at >= v_now - interval '30 days')::integer,
      'active7d', (select count(*) from l where l.active)::integer,
      'bySport', coalesce((select jsonb_agg(jsonb_build_object('sport', b.sport, 'leagues', b.leagues, 'players', b.players,
                                                             'active7d', b.active7d) order by b.sort_order, b.sport)
                             from by_sport b), '[]'::jsonb))
    into v_leagues;

  v_activity := jsonb_build_object(
    'events7d', (select count(*) from public.events x where x.created_at >= v_now - interval '7 days')::integer,
    'matches7d', (select count(*) from public.matches x where x.created_at >= v_now - interval '7 days')::integer,
    'entries7d', (select count(*) from public.entries x where x.created_at >= v_now - interval '7 days')::integer,
    'submissionsPending', (select count(*) from public.submissions x where x.status = 'pendiente')::integer,
    'photos7d', (select count(*) from public.photos x where x.created_at >= v_now - interval '7 days')::integer);

  -- Tamaño de la base (null si este backend no lo dice).
  begin
    v_db := pg_database_size(current_database());
  exception when others then
    v_db := null;
  end;
  -- Fotos: lo que dice Storage (metadata.size del bucket scoreboards); si no hay, lo anotado en photos.bytes.
  if to_regclass('storage.objects') is not null then
    begin
      execute $q$select sum((o.metadata ->> 'size')::bigint) from storage.objects o where o.bucket_id = 'scoreboards'$q$
        into v_photos_bytes;
    exception when others then
      v_photos_bytes := null;
    end;
  end if;
  if coalesce(v_photos_bytes, 0) = 0 then
    v_photos_bytes := coalesce((select sum(x.bytes) from public.photos x where x.purged_at is null), v_photos_bytes);
  end if;
  v_storage := jsonb_build_object(
    'dbBytes', v_db,
    'photosBytes', v_photos_bytes,
    'photos', (select count(*) from public.photos x where x.purged_at is null)::integer);

  select jsonb_build_object(
      'subscriptions', (select count(*) from public.push_subscriptions)::integer,
      'queued', (count(*) filter (where o.sent_at is null and o.attempts < 5))::integer,
      'sent24h', (count(*) filter (where o.sent_at >= v_now - interval '24 hours'))::integer,
      'failed24h', (count(*) filter (where o.sent_at is null and o.attempts >= 5 and o.created_at >= v_now - interval '24 hours'))::integer)
    into v_push
    from public.push_outbox o;

  return jsonb_build_object(
    'generatedAt', private.iso(v_now),
    'users', v_users,
    'leagues', v_leagues,
    'activity', v_activity,
    'storage', v_storage,
    -- Topes de private.consume_scan (900 al día para todos, 40 por cuenta).
    'scan', jsonb_build_object(
      'today', coalesce((select d.n from private.scan_days d where d.day = private.scan_day()), 0),
      'dailyLimit', 900,
      'perUserLimit', 40),
    'push', v_push);
end $$;

-- Una fila por día (AdminSeriesPoint[]), de hace p_days - 1 días hasta hoy, con ceros. Días en hora de RD;
-- las lecturas de fotos, por el día de Google (private.scan_days).
create function public.admin_series(p_days integer default 30) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_days integer := private.clamp_int(p_days, 1, 366, 30);
  v_tz text := private.console_tz();
  v_to date := private.console_day();
  v_from date := v_to - (v_days - 1);
  v_since timestamptz := (v_from::timestamp at time zone v_tz);
begin
  perform private.require_super();
  return (
    with days as (
      select v_from + i as day from generate_series(0, v_days - 1) i
    ), signups as (
      select (x.created_at at time zone v_tz)::date as day, count(*)::integer as n
        from public.profiles x where x.created_at >= v_since group by 1
    ), active as (
      -- Los días recientes se cuentan de daily_seen; los viejos ya están sumados en daily_active.
      select a.day, sum(a.n)::integer as n
        from (select x.day, count(*) as n from private.daily_seen x where x.day >= v_from group by 1
              union all
              select y.day, y.users from private.daily_active y where y.day >= v_from) a
       group by 1
    ), evs as (
      select (x.created_at at time zone v_tz)::date as day, count(*)::integer as n
        from public.events x where x.created_at >= v_since group by 1
    ), mts as (
      select (x.created_at at time zone v_tz)::date as day, count(*)::integer as n
        from public.matches x where x.created_at >= v_since group by 1
    ), ens as (
      select (x.created_at at time zone v_tz)::date as day, count(*)::integer as n
        from public.entries x where x.created_at >= v_since group by 1
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'day', to_char(d.day, 'YYYY-MM-DD'),
             'signups', coalesce(su.n, 0),
             'activeUsers', coalesce(ac.n, 0),
             'events', coalesce(ev.n, 0),
             'matches', coalesce(mt.n, 0),
             'entries', coalesce(en.n, 0),
             'scans', coalesce(sc.n, 0)) order by d.day), '[]'::jsonb)
      from days d
      left join signups su on su.day = d.day
      left join active ac on ac.day = d.day
      left join evs ev on ev.day = d.day
      left join mts mt on mt.day = d.day
      left join ens en on en.day = d.day
      left join private.scan_days sc on sc.day = d.day
  );
end $$;

-- Cuentas (AdminUser), más nuevas primero. p_search: nombre, correo o id. p_filter: all | super | blocked |
-- unconfirmed (sin confirmar el correo) | inactive (no abre la app hace 30 días o nunca). → {rows, total}.
create function public.admin_users(p_search text default null, p_filter text default 'all', p_limit integer default 50,
                                   p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_filter text := coalesce(nullif(btrim(p_filter), ''), 'all');
  v_q text := nullif(lower(btrim(left(coalesce(p_search, ''), 100))), '');
  v_pat text;
  v_limit integer := private.clamp_int(p_limit, 1, 100, 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_rows jsonb;
begin
  perform private.require_super();
  if v_filter not in ('all', 'super', 'blocked', 'unconfirmed', 'inactive') then
    perform private.fail('invalido');
  end if;
  v_pat := '%' || private.like_escape(v_q) || '%';
  -- not materialized: la página usa el índice (created_at desc, id desc) y para en cuanto tiene sus filas.
  with f as not materialized (
    select p.id, p.created_at
      from public.profiles p
     where (v_q is null or lower(p.name || ' ' || coalesce(p.email, '')) like v_pat or p.id::text = v_q)
       and case v_filter
             when 'super' then p.is_superadmin
             when 'blocked' then p.blocked_at is not null
             when 'inactive' then p.last_seen_at is null or p.last_seen_at < now() - interval '30 days'
             when 'unconfirmed' then exists (select 1 from auth.users a where a.id = p.id and a.email_confirmed_at is null)
             else true
           end
  ), page as (
    select f.id, f.created_at from f order by f.created_at desc, f.id desc limit v_limit offset v_offset
  )
  select (select count(*) from f)::integer,
         coalesce((select jsonb_agg(private.admin_user_row(pg.id) order by pg.created_at desc, pg.id desc) from page pg), '[]'::jsonb)
    into v_total, v_rows;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

-- Una cuenta con sus ligas, teléfonos y lecturas de hoy (AdminUserDetail). null si no existe.
create function public.admin_user(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
begin
  perform private.require_super();
  v := private.admin_user_row(p_user);
  if v is null then
    return null;
  end if;
  return v || jsonb_build_object(
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
               'leagueId', x.league_id, 'leagueName', x.name, 'sport', x.sport, 'kind', x.kind, 'role', x.role,
               'scorer', x.is_scorer, 'joinedAt', private.iso(x.joined_at)) order by x.joined_at desc, x.league_id)
        from (select m.league_id, l.name, l.sport, l.kind, m.role, m.is_scorer, m.joined_at
                from public.league_members m join public.leagues l on l.id = m.league_id
               where m.user_id = p_user
               order by m.joined_at desc, m.league_id
               limit 200) x), '[]'::jsonb),
    'pushDevices', (select count(*) from public.push_subscriptions s where s.user_id = p_user)::integer,
    'scansToday', coalesce((select u.n from private.scan_usage u where u.user_id = p_user and u.day = private.scan_day()), 0),
    'adult', exists (select 1 from public.profiles p where p.id = p_user and p.adult_confirmed_at is not null));
end $$;

-- Ligas y torneos de todos (AdminLeague). p_search: nombre de la liga, nombre o correo del dueño, o id.
-- p_sort: activity (lo último que se movió) | name | created | members. → {rows, total}.
create function public.admin_leagues(p_search text default null, p_sport text default null, p_kind text default null,
                                     p_visibility text default null, p_sort text default 'activity',
                                     p_limit integer default 50, p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_q text := nullif(lower(btrim(left(coalesce(p_search, ''), 100))), '');
  v_pat text;
  v_sport text := nullif(btrim(coalesce(p_sport, '')), '');
  v_kind text := nullif(btrim(coalesce(p_kind, '')), '');
  v_vis text := nullif(btrim(coalesce(p_visibility, '')), '');
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'activity');
  v_limit integer := private.clamp_int(p_limit, 1, 100, 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_rows jsonb;
begin
  perform private.require_super();
  if v_sort not in ('activity', 'name', 'created', 'members')
     or (v_kind is not null and v_kind not in ('liga', 'torneo'))
     or (v_vis is not null and v_vis not in ('public', 'private')) then
    perform private.fail('invalido');
  end if;
  v_pat := '%' || private.like_escape(v_q) || '%';
  with f as (
    select l.id, l.name, l.created_at,
           case when v_sort = 'activity' then private.league_last_activity(l.id) end as act,
           case when v_sort = 'members' then (select count(*) from public.league_members m where m.league_id = l.id) end as mem
      from public.leagues l
      left join public.profiles o on o.id = l.owner_id
     where (v_q is null or lower(l.name) like v_pat or lower(coalesce(o.name, '') || ' ' || coalesce(o.email, '')) like v_pat
            or l.id::text = v_q)
       and (v_sport is null or l.sport = v_sport)
       and (v_kind is null or l.kind = v_kind)
       and (v_vis is null or l.visibility = v_vis)
  ), page as (
    select f.id, f.act,
           row_number() over (order by f.act desc nulls last, f.mem desc nulls last,
                                       case when v_sort = 'name' then lower(f.name) end, f.created_at desc, f.id desc) as rn
      from f
     order by f.act desc nulls last, f.mem desc nulls last, case when v_sort = 'name' then lower(f.name) end,
              f.created_at desc, f.id desc
     limit v_limit offset v_offset
  )
  select (select count(*) from f)::integer,
         coalesce((select jsonb_agg(private.admin_league_row(pg.id, pg.act) order by pg.rn) from page pg), '[]'::jsonb)
    into v_total, v_rows;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

-- Auditoría (AdminAuditEntry), lo más nuevo primero. p_action: solo esa acción. → {rows, total}.
create function public.admin_audit_log(p_action text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_action text := nullif(btrim(coalesce(p_action, '')), '');
  v_limit integer := private.clamp_int(p_limit, 1, 100, 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_rows jsonb;
begin
  perform private.require_super();
  with f as (
    select a.* from public.admin_audit a where v_action is null or a.action = v_action
  ), page as (
    select f.* from f order by f.at desc, f.id desc limit v_limit offset v_offset
  )
  select (select count(*) from f)::integer,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', pg.id, 'at', private.iso(pg.at), 'actorId', pg.actor_id, 'actorName', p.name,
                     'action', pg.action, 'targetType', pg.target_type, 'targetId', pg.target_id, 'detail', pg.detail)
                     order by pg.at desc, pg.id desc)
                     from page pg left join public.profiles p on p.id = pg.actor_id), '[]'::jsonb)
    into v_total, v_rows;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

-- Estado del sistema (AdminSystem): migraciones, «mantener despierto», pg_cron, cola de push y deportes.
-- Lo que no existe en este backend (PGlite) sale null.
create function public.admin_system() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_migrations jsonb;
  v_cron jsonb;
  v_push jsonb;
begin
  perform private.require_super();

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    begin
      -- La columna name no existe en versiones viejas del CLI; statements (todo el SQL) nunca se lee.
      if exists (select 1 from pg_catalog.pg_attribute a
                  where a.attrelid = to_regclass('supabase_migrations.schema_migrations') and a.attname = 'name'
                    and a.attnum > 0 and not a.attisdropped) then
        execute $q$
          select coalesce(jsonb_agg(jsonb_build_object('version', m.version, 'name', m.name) order by m.version desc), '[]'::jsonb)
            from supabase_migrations.schema_migrations m
        $q$ into v_migrations;
      else
        execute $q$
          select coalesce(jsonb_agg(jsonb_build_object('version', m.version, 'name', null) order by m.version desc), '[]'::jsonb)
            from supabase_migrations.schema_migrations m
        $q$ into v_migrations;
      end if;
    exception when others then
      v_migrations := null;
    end;
  end if;

  if to_regclass('cron.job') is not null then
    begin
      if to_regclass('cron.job_run_details') is not null then
        execute $q$
          select coalesce(jsonb_agg(jsonb_build_object(
                   'job', coalesce(j.jobname, j.jobid::text), 'schedule', j.schedule,
                   'lastRunAt', private.iso(r.start_time), 'lastStatus', r.status) order by coalesce(j.jobname, j.jobid::text)),
                 '[]'::jsonb)
            from cron.job j
            left join lateral (select d.start_time, d.status from cron.job_run_details d
                                where d.jobid = j.jobid order by d.start_time desc nulls last limit 1) r on true
        $q$ into v_cron;
      else
        execute $q$
          select coalesce(jsonb_agg(jsonb_build_object(
                   'job', coalesce(j.jobname, j.jobid::text), 'schedule', j.schedule, 'lastRunAt', null, 'lastStatus', null)
                   order by coalesce(j.jobname, j.jobid::text)), '[]'::jsonb)
            from cron.job j
        $q$ into v_cron;
      end if;
    exception when others then
      v_cron := null;
    end;
  end if;

  select jsonb_build_object(
      'queued', (count(*) filter (where o.sent_at is null and o.attempts < 5))::integer,
      'claimed', (count(*) filter (where o.sent_at is null and o.claimed_at >= now() - interval '3 minutes'))::integer,
      'failed24h', (count(*) filter (where o.sent_at is null and o.attempts >= 5 and o.created_at >= now() - interval '24 hours'))::integer,
      'oldestQueuedAt', private.iso(min(o.created_at) filter (where o.sent_at is null and o.attempts < 5)))
    into v_push
    from public.push_outbox o;

  return jsonb_build_object(
    -- La app pone el suyo (backend().mode); esto es lo que se ve desde la base.
    'backend', case when to_regclass('supabase_migrations.schema_migrations') is not null
                      or to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then 'supabase' else 'local' end,
    'migrations', v_migrations,
    'lastHeartbeat', (select private.iso(h.at) from private.heartbeat h where h.id = 1),
    'cron', v_cron,
    'push', v_push,
    'sportStatus', coalesce((
      select jsonb_agg(jsonb_build_object('sport', s.id, 'status', s.status,
                                          'leagues', (select count(*) from public.leagues l where l.sport = s.id)::integer)
                       order by s.sort_order, s.id)
        from public.sport_status s), '[]'::jsonb));
end $$;

-- Lectura de fotos con IA (AdminScanStats). Días de Google (private.scan_day). Por modelo: lo guardado en
-- private.scan_minutes (3 días). Quién más lee: private.scan_usage (7 días), los 10 primeros.
create function public.admin_scan_stats(p_days integer default 30) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_days integer := private.clamp_int(p_days, 1, 90, 30);
  v_to date := private.scan_day();
  v_from date := v_to - (v_days - 1);
  v_day_start timestamptz := (v_to::timestamp at time zone 'America/Los_Angeles');
begin
  perform private.require_super();
  return jsonb_build_object(
    'days', (select jsonb_agg(jsonb_build_object('day', to_char(v_from + i, 'YYYY-MM-DD'), 'scans', coalesce(d.n, 0)) order by i)
               from generate_series(0, v_days - 1) i
               left join private.scan_days d on d.day = v_from + i),
    'models', coalesce((
      select jsonb_agg(jsonb_build_object('model', x.model, 'today', x.today, 'total', x.total) order by x.total desc, x.model)
        from (select m.model, coalesce(sum(m.n) filter (where m.minute >= v_day_start), 0)::integer as today,
                     sum(m.n)::integer as total
                from private.scan_minutes m group by m.model) x), '[]'::jsonb),
    'topUsers', coalesce((
      select jsonb_agg(jsonb_build_object('userId', t.user_id, 'name', coalesce(p.name, ''), 'email', p.email, 'scans', t.n)
                       order by t.n desc, t.user_id)
        from (select u.user_id, sum(u.n)::integer as n from private.scan_usage u
               where u.day >= v_from group by u.user_id having sum(u.n) > 0 order by 2 desc, 1 limit 10) t
        left join public.profiles p on p.id = t.user_id), '[]'::jsonb),
    'today', coalesce((select d.n from private.scan_days d where d.day = v_to), 0),
    'dailyLimit', 900,
    'perUserLimit', 40);
end $$;

-- =====================================================================
-- Acciones de la consola (solo superadmin; todas quedan en la auditoría)
-- =====================================================================

-- Bloquea una cuenta: no puede escribir nada (require_uid → 'bloqueada'). Motivo opcional (≤ 200).
-- 'invalido' si es la propia cuenta; 'no_permitido' si es superadmin; 'no_existe'.
create function public.admin_block_user(p_user uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_super();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  p public.profiles;
begin
  if p_user is null or char_length(v_reason) > 200 then
    perform private.fail('invalido');
  end if;
  if p_user = v_uid then
    perform private.fail('invalido');
  end if;
  select * into p from public.profiles x where x.id = p_user for update;
  if p.id is null then
    perform private.fail('no_existe');
  end if;
  if p.is_superadmin then
    perform private.deny();
  end if;
  update public.profiles set blocked_at = coalesce(blocked_at, now()), blocked_reason = v_reason where id = p_user;
  perform private.audit('block_user', 'user', p_user::text,
    jsonb_build_object('name', p.name, 'email', p.email, 'reason', v_reason, 'already', p.blocked_at is not null));
end $$;

create function public.admin_unblock_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  perform private.require_super();
  select * into p from public.profiles x where x.id = p_user for update;
  if p.id is null then
    perform private.fail('no_existe');
  end if;
  update public.profiles set blocked_at = null, blocked_reason = null where id = p_user;
  perform private.audit('unblock_user', 'user', p_user::text,
    jsonb_build_object('name', p.name, 'email', p.email, 'wasBlocked', p.blocked_at is not null, 'reason', p.blocked_reason));
end $$;

-- Cuántas cuentas recibirían un anuncio (sin bloquear y con avisos activados en algún teléfono).
create function public.admin_count_recipients(p_audience jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_audience jsonb;
begin
  perform private.require_super();
  v_audience := private.announce_audience(p_audience);
  return (select count(*) from private.announce_users(v_audience))::integer;
end $$;

-- Manda un anuncio push: título 1–60, texto 1–180, ruta de la app ('/' por defecto), público
-- {kind: all | sport (sport) | league (leagueId) | admins}. Una fila de push_outbox por cuenta (el trigger
-- push_outbox_fanout la reparte a sus teléfonos) y avisa a send-push. Máximo 5 anuncios por hora (entre todos
-- los superadmins): 'rate_limited'. Devuelve a cuántas cuentas se encoló.
create function public.admin_announce(p_title text, p_body text, p_url text default '/',
                                      p_audience jsonb default '{"kind": "all"}') returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_url text := coalesce(nullif(btrim(coalesce(p_url, '')), ''), '/');
  v_audience jsonb;
  v_users uuid[];
  v_n integer;
begin
  perform private.require_super();
  if char_length(v_title) not between 1 and 60 or char_length(v_body) not between 1 and 180
     or not private.app_path_ok(v_url) then
    perform private.fail('invalido');
  end if;
  v_audience := private.announce_audience(coalesce(p_audience, '{"kind": "all"}'::jsonb));
  -- Dos anuncios a la vez esperan uno al otro: la cuenta de la última hora es exacta.
  perform pg_advisory_xact_lock(hashtext('mm:admin_announce'));
  if (select count(*) from public.admin_audit a where a.action = 'announce' and a.at > now() - interval '1 hour') >= 5 then
    perform private.fail('rate_limited');
  end if;
  v_users := array(select u from private.announce_users(v_audience) u);
  v_n := coalesce(cardinality(v_users), 0);
  insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
  select u, v_title, v_body, v_url, 'anuncio:' || (extract(epoch from now()) * 1000)::bigint::text, 86400, 'normal'
    from unnest(v_users) u;
  perform private.audit('announce', 'app', null, jsonb_build_object(
    'title', v_title, 'body', v_body, 'url', v_url, 'audience', v_audience, 'recipients', v_n));
  if v_n > 0 and to_regprocedure('private.kick_send_push(jsonb)') is not null then
    perform private.kick_send_push();
  end if;
  return v_n;
end $$;

-- =====================================================================
-- Permisos: las RPC de la consola (y touch_seen) solo con sesión; las ayudas, nadie de la app
-- =====================================================================
-- Las funciones redefinidas con create or replace (require_uid, can_upload_photo, can_scan, sync_ladder,
-- set_superadmin, set_sport_status, delete_league, transfer_ownership) conservan sus permisos.
do $$
declare
  f record;
  v_rpc constant text[] := array[
    'touch_seen', 'admin_overview', 'admin_series', 'admin_users', 'admin_user', 'admin_leagues', 'admin_audit_log',
    'admin_system', 'admin_scan_stats', 'admin_block_user', 'admin_unblock_user', 'admin_announce', 'admin_count_recipients'
  ];
  v_private constant text[] := array[
    'console_tz', 'console_day', 'iso', 'clamp_int', 'like_escape', 'app_path_ok', 'is_blocked', 'require_super', 'audit',
    'league_last_activity', 'admin_user_row', 'admin_league_row', 'announce_audience', 'announce_users', 'console_cleanup'
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

-- La política de Storage para borrar fotos corre como la cuenta: necesita EXECUTE (como private.admin_leagues).
revoke execute on function private.photo_admin_leagues() from public, anon;
grant execute on function private.photo_admin_leagues() to authenticated;
