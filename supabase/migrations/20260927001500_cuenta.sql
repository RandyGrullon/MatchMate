-- MatchMate · La cuenta y sus datos (Ley 172-13) y los errores de los teléfonos.
--
-- 1. Mayores de 18: confirm_adult() llena profiles.adult_confirmed_at a quien no lo tiene (entró con Google o
--    viene de BowlingX). El registro con correo ya lo llenaba (triggers.sql). La app muestra una pantalla una
--    sola vez (src/components/AdultGate.tsx).
-- 2. Bajar mis datos: export_my_data() → un JSON con todo lo de la cuenta (perfil, ligas, jugadores y todo lo
--    que cuelga de sus jugadores o de su cuenta en cualquier tabla). Tope: 5 por hora.
-- 3. Borrar la cuenta: prepare_delete_account() dice si se puede (sin ligas a su nombre y sin ser el último
--    superadmin) y qué ligas tiene que pasar a otro miembro o borrar. El borrado lo hace la Edge Function
--    delete-account con la API de administración (en local, el manejador de src/lib/backend/local.ts): borra
--    auth.users y la base borra en cascada perfil, membresías, comentarios, reacciones, teléfonos… Sus jugadores
--    quedan en la liga como jugadores sin cuenta (con sus resultados). private.forget_user() (trigger) borra lo
--    que no cuelga con FK (op_log, paces, límites) y quita nombre y correo de la auditoría;
--    private.release_storage_owner() (trigger en auth.users) les quita el dueño a sus fotos de Storage, que
--    siguen en su liga (si no, Supabase no deja borrar la cuenta).
-- 4. Errores de los teléfonos: log_client_error() guarda lo que falla en la app (window.onerror, promesas y las
--    pantallas que no se pudieron dibujar) en public.client_errors, que solo lee el superadmin. Topes: 20 por
--    hora por cuenta, 1000 reportes nuevos al día entre todos, textos recortados, el mismo error de la misma
--    cuenta en 24 h suma en la misma fila, y al guardar se borra lo de más de 30 días y lo que pase de 5000
--    filas. La consola los agrupa
--    (admin_client_errors) y los puede borrar cuando se arreglan (admin_clear_client_errors, con auditoría).
--
-- Todo corre igual en PGlite (no hay parte solo de Supabase).

-- =====================================================================
-- 1. Mayores de 18
-- =====================================================================

-- «Tengo 18 años o más»: guarda la primera vez que lo dijo (llamarla otra vez no cambia la hora).
create function public.confirm_adult() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  update public.profiles set adult_confirmed_at = coalesce(adult_confirmed_at, now()) where id = v_uid;
  if not found then
    perform private.fail('no_existe');
  end if;
end $$;

-- =====================================================================
-- 2. Bajar mis datos
-- =====================================================================

-- Columnas que nunca salen en el archivo (las claves del teléfono para los avisos push).
create function private.export_hidden_columns() returns text[]
language sql immutable set search_path = '' as $$
  select array['endpoint', 'p256dh', 'auth']::text[]
$$;

-- Todo lo de la cuenta en un JSON (camelCase arriba; las filas de cada tabla, tal cual con sus columnas).
-- - account: el perfil y lo que sabe Auth (cómo entra, cuándo se registró y entró por última vez).
-- - leagues: sus membresías con el nombre y deporte de la liga. players: sus jugadores.
-- - tables: cada tabla de public con user_id (filas de su cuenta) o, si no tiene, con player_id (filas de sus
--   jugadores), hasta 5000 filas por tabla (las que pasan salen en `truncated`). Se busca en el catálogo: una
--   tabla nueva con esas columnas sale sola.
-- - matches: los partidos donde jugó. daysSeen y scanUsage: días que abrió la app y fotos leídas con IA.
create function public.export_my_data() returns jsonb
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
           case when bool_or(a.attname = 'user_id') then 'user_id' else 'player_id' end as col
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and a.attname in ('user_id', 'player_id')
       and c.relname not in ('players', 'league_members', 'push_outbox')
     group by c.relname
     order by c.relname
  loop
    if r.col = 'player_id' and cardinality(v_players) = 0 then
      continue;
    end if;
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x) - $2), ''[]''::jsonb), count(*)::integer
         from (select * from public.%I t where t.%I = any ($1) limit %s) x',
      r.t, r.col, c_max + 1)
      using case when r.col = 'user_id' then array[v_uid] else v_players end, private.export_hidden_columns()
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
        'provider', nullif(a.raw_app_meta_data ->> 'provider', ''),
        'emailConfirmedAt', private.iso(a.email_confirmed_at),
        'lastSignInAt', private.iso(a.last_sign_in_at))
        from public.profiles p left join auth.users a on a.id = p.id
       where p.id = v_uid),
    'leagues', coalesce((
      select jsonb_agg(jsonb_build_object(
               'leagueId', m.league_id, 'name', l.name, 'sport', l.sport, 'kind', l.kind, 'visibility', l.visibility,
               'role', m.role, 'scorer', m.is_scorer, 'displayName', m.display_name, 'joinedAt', private.iso(m.joined_at))
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
    'tables', v_tables,
    'daysSeen', coalesce((
      select jsonb_agg(to_char(s.day, 'YYYY-MM-DD') order by s.day) from private.daily_seen s where s.user_id = v_uid), '[]'::jsonb),
    'scanUsage', coalesce((
      select jsonb_agg(jsonb_build_object('day', to_char(s.day, 'YYYY-MM-DD'), 'photos', s.n) order by s.day)
        from private.scan_usage s where s.user_id = v_uid), '[]'::jsonb),
    'truncated', to_jsonb(v_truncated));
end $$;

-- =====================================================================
-- 3. Borrar la cuenta
-- =====================================================================

-- ¿Se puede borrar la cuenta ya? Si no, por qué y qué hacer:
-- - owned_leagues: tiene ligas a su nombre (leagues.owner_id no deja borrar la cuenta). Cada una con sus otros
--   miembros (hasta 200: admins primero) para pasársela con transfer_ownership, o borrarla con delete_league.
-- - last_superadmin: es el único superadmin (la app se quedaría sin dueño): primero nombrar a otro.
-- summary: lo que se borra con la cuenta (para mostrarlo antes de confirmar).
create function public.prepare_delete_account() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_owned jsonb;
  v_blockers text[] := '{}';
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id,
           'name', l.name,
           'sport', l.sport,
           'kind', l.kind,
           'memberCount', (select count(*) from public.league_members m where m.league_id = l.id and m.user_id <> v_uid)::integer,
           'members', coalesce((
             select jsonb_agg(jsonb_build_object('userId', x.user_id, 'name', x.display_name, 'role', x.role)
                              order by (x.role = 'admin') desc, lower(x.display_name), x.user_id)
               from (select m.user_id, m.display_name, m.role from public.league_members m
                      where m.league_id = l.id and m.user_id <> v_uid
                      order by (m.role = 'admin') desc, lower(m.display_name), m.user_id limit 200) x), '[]'::jsonb))
           order by lower(l.name), l.id), '[]'::jsonb)
    into v_owned
    from public.leagues l
   where l.owner_id = v_uid;

  if jsonb_array_length(v_owned) > 0 then
    v_blockers := v_blockers || 'owned_leagues'::text;
  end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and p.is_superadmin)
     and not exists (select 1 from public.profiles p where p.is_superadmin and p.id <> v_uid) then
    v_blockers := v_blockers || 'last_superadmin'::text;
  end if;

  return jsonb_build_object(
    'canDelete', cardinality(v_blockers) = 0,
    'blockers', to_jsonb(v_blockers),
    'ownedLeagues', v_owned,
    'summary', jsonb_build_object(
      'leagues', (select count(*) from public.league_members m where m.user_id = v_uid)::integer,
      'players', (select count(*) from public.players p where p.user_id = v_uid)::integer,
      'comments', (select count(*) from public.comments c where c.user_id = v_uid)::integer,
      'reactions', (select count(*) from public.reactions r where r.user_id = v_uid)::integer,
      'devices', (select count(*) from public.push_subscriptions s where s.user_id = v_uid)::integer));
end $$;

-- Al borrarse un perfil (se borró la cuenta en auth.users): borra lo suyo que no cuelga con FK, quita su nombre y
-- correo de la auditoría (el rastro queda, sin datos personales) y anota que la cuenta se borró.
create function private.forget_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id text := old.id::text;
begin
  delete from private.op_log where user_id = old.id;
  delete from private.paces where user_id = old.id;
  delete from private.rate_limits where right(key, char_length(v_id) + 3) = ':u:' || v_id;
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

create trigger profiles_forget after delete on public.profiles for each row execute function private.forget_user();

-- Supabase no deja borrar en auth.users una cuenta que es dueña (storage.objects.owner) de archivos de Storage
-- («Database error deleting user»). Las fotos del marcador son de la liga (el comprobante de sus juegos), no de
-- quien las subió: antes de borrar la cuenta se les quita el dueño (owner y, en Supabase, owner_id) y siguen en
-- su liga. Si algo falla aquí solo avisa (el borrado sigue; si la base no lo deja, delete-account lo dice).
-- En PGlite storage.objects es el mínimo del shim (sin owner_id): se revisa al correr.
create function private.release_storage_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if to_regclass('storage.objects') is null then
    return old;
  end if;
  begin
    if exists (select 1 from pg_catalog.pg_attribute a
                where a.attrelid = to_regclass('storage.objects') and a.attname = 'owner_id' and not a.attisdropped) then
      execute 'update storage.objects set owner = null, owner_id = null where owner = $1 or owner_id = $2' using old.id, old.id::text;
    else
      execute 'update storage.objects set owner = null where owner = $1' using old.id;
    end if;
  exception when others then
    raise warning 'release_storage_owner: % (%)', sqlerrm, sqlstate;
  end;
  return old;
end $$;

create trigger on_auth_user_delete_storage before delete on auth.users for each row execute function private.release_storage_owner();

-- =====================================================================
-- 4. Errores de los teléfonos
-- =====================================================================

-- Un reporte (o varios iguales de la misma cuenta en 24 h: `hits`). Solo lo lee el superadmin; nadie escribe
-- directo (log_client_error). Se borra con la cuenta.
create table public.client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  hits integer not null default 1 check (hits >= 1),
  user_id uuid references public.profiles (id) on delete cascade,
  -- md5 de tipo + mensaje (sin números ni ids) + pantalla: los reportes del mismo error van juntos.
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{32}$'),
  kind text not null check (kind in ('error', 'promise', 'render', 'chunk')),
  message text not null check (char_length(message) between 1 and 500),
  stack text check (char_length(stack) <= 4000),
  route text check (char_length(route) <= 200),
  component text check (char_length(component) <= 100),
  ua text check (char_length(ua) <= 300),
  app_version text check (char_length(app_version) <= 40)
);
create index client_errors_last_idx on public.client_errors (last_at desc, id desc);
create index client_errors_fp_idx on public.client_errors (fingerprint, last_at desc);
create index client_errors_user_idx on public.client_errors (user_id, fingerprint, last_at desc);

alter table public.client_errors enable row level security;
create policy client_errors_read on public.client_errors for select to authenticated using ((select private.is_super()));
grant select on public.client_errors to authenticated;

-- Texto de una línea: los caracteres de control y los espacios seguidos quedan en un espacio, sin espacios a los
-- lados, recortado a p_max. '' → null.
create function private.clean_line(p text, p_max integer) returns text
language sql immutable set search_path = '' as $$
  select nullif(btrim(left(btrim(regexp_replace(coalesce(p, ''), '[[:cntrl:][:space:]]+', ' ', 'g')), p_max)), '')
$$;

-- Huella del error: el mismo error con otro id o número en el mensaje cae en el mismo grupo.
create function private.error_fingerprint(p_kind text, p_message text, p_component text) returns text
language sql immutable set search_path = '' as $$
  select md5(p_kind || '|' || left(regexp_replace(regexp_replace(lower(coalesce(p_message, '')),
      '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<id>', 'g'), '[0-9]+', '0', 'g'), 300)
    || '|' || coalesce(p_component, ''))
$$;

-- Guarda un error de la app. true = guardado (o sumado al mismo de las últimas 24 h); false = descartado por los
-- topes (20 por hora por cuenta, 1000 reportes nuevos al día entre todos). Nunca falla por los topes (así el
-- conteo queda guardado). Tipo que no existe: 'invalido'.
create function public.log_client_error(
  p_kind text,
  p_message text,
  p_stack text default null,
  p_route text default null,
  p_component text default null,
  p_ua text default null,
  p_app_version text default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_key text := 'err:u:' || v_uid::text;
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_message text := coalesce(private.clean_line(p_message, 500), '(sin mensaje)');
  v_stack text := nullif(left(btrim(regexp_replace(coalesce(p_stack, ''), '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]', '', 'g')), 4000), '');
  v_route text := private.clean_line(p_route, 200);
  v_component text := private.clean_line(p_component, 100);
  v_ua text := private.clean_line(p_ua, 300);
  v_version text := private.clean_line(p_app_version, 40);
  v_fp text;
begin
  if v_kind not in ('error', 'promise', 'render', 'chunk') then
    perform private.fail('invalido');
  end if;
  if private.rate_blocked(v_key, 20, interval '1 hour') then
    return false;
  end if;
  perform private.rate_hit(v_key, interval '1 hour');
  v_fp := private.error_fingerprint(v_kind, v_message, v_component);

  -- El mismo error de la misma cuenta en las últimas 24 h: suma y guarda lo último (ruta, teléfono, versión).
  update public.client_errors e
     set hits = e.hits + 1, last_at = now(),
         stack = coalesce(v_stack, e.stack), route = coalesce(v_route, e.route),
         ua = coalesce(v_ua, e.ua), app_version = coalesce(v_version, e.app_version)
   where e.id = (select x.id from public.client_errors x
                  where x.user_id = v_uid and x.fingerprint = v_fp and x.last_at > now() - interval '24 hours'
                  order by x.last_at desc limit 1);
  if found then
    return true;
  end if;

  if private.rate_blocked('err:all', 1000, interval '1 day') then
    return false;
  end if;
  perform private.rate_hit('err:all', interval '1 day');
  insert into public.client_errors (user_id, fingerprint, kind, message, stack, route, component, ua, app_version)
  values (v_uid, v_fp, v_kind, v_message, v_stack, v_route, v_component, v_ua, v_version);

  -- Lo de más de 30 días se va (de a poco: sin cron, también en PGlite), y nunca quedan más de 5000 filas (lo
  -- más viejo sale primero): con los textos al tope son unos 25 MB, lejos de los 500 MB del plan gratis.
  delete from public.client_errors
   where id in (select x.id from public.client_errors x where x.last_at < now() - interval '30 days' order by x.last_at limit 50);
  delete from public.client_errors
   where id in (select x.id from public.client_errors x order by x.last_at desc, x.id desc offset 5000 limit 50);
  return true;
end $$;

-- Errores agrupados por huella (lo más reciente primero) de los últimos p_days días (1–90). Busca en el mensaje, la
-- pantalla y la ruta (sin comodines) o por huella exacta. p_kind: solo ese tipo. → {rows, total, hits, users}
-- (hits y users: de todo lo filtrado). Cada grupo trae el último reporte completo y hasta 5 rutas y versiones.
create function public.admin_client_errors(
  p_days integer default 7,
  p_search text default null,
  p_kind text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_since timestamptz := now() - make_interval(days => private.clamp_int(p_days, 1, 90, 7));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_like text;
  v_kind text := nullif(lower(btrim(coalesce(p_kind, ''))), '');
  v_limit integer := private.clamp_int(p_limit, 1, 100, 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_hits integer;
  v_users integer;
  v_rows jsonb;
begin
  perform private.require_super();
  if v_kind is not null and v_kind not in ('error', 'promise', 'render', 'chunk') then
    perform private.fail('invalido');
  end if;
  v_like := '%' || private.like_escape(left(v_search, 100)) || '%';

  with f as (
    select e.* from public.client_errors e
     where e.last_at >= v_since
       and (v_kind is null or e.kind = v_kind)
       and (v_search is null or e.fingerprint = lower(v_search) or e.message ilike v_like
            or e.component ilike v_like or e.route ilike v_like)
  ), g as (
    select f.fingerprint, sum(f.hits)::integer as hits, count(*)::integer as reports,
           count(distinct f.user_id)::integer as users, min(f.at) as first_at, max(f.last_at) as last_at
      from f group by f.fingerprint
  ), page as (
    select g.*, row_number() over (order by g.last_at desc, g.fingerprint) as rn
      from g order by g.last_at desc, g.fingerprint limit v_limit offset v_offset
  )
  select (select count(*) from g)::integer,
         (select coalesce(sum(f.hits), 0) from f)::integer,
         (select count(distinct f.user_id) from f)::integer,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'fingerprint', pg.fingerprint,
                    'hits', pg.hits,
                    'reports', pg.reports,
                    'users', pg.users,
                    'firstAt', private.iso(pg.first_at),
                    'lastAt', private.iso(pg.last_at),
                    'kind', s.kind,
                    'message', s.message,
                    'component', s.component,
                    'stack', s.stack,
                    'route', s.route,
                    'ua', s.ua,
                    'appVersion', s.app_version,
                    'userId', s.user_id,
                    'userName', pr.name,
                    'routes', coalesce((select jsonb_agg(x.route order by x.n desc, x.route) from (
                        select f.route, count(*) as n from f where f.fingerprint = pg.fingerprint and f.route is not null
                         group by f.route order by count(*) desc, f.route limit 5) x), '[]'::jsonb),
                    'versions', coalesce((select jsonb_agg(x.v order by x.last desc) from (
                        select f.app_version as v, max(f.last_at) as last from f
                         where f.fingerprint = pg.fingerprint and f.app_version is not null
                         group by f.app_version order by max(f.last_at) desc limit 5) x), '[]'::jsonb))
                    order by pg.rn)
             from page pg
             cross join lateral (select f.* from f where f.fingerprint = pg.fingerprint order by f.last_at desc, f.id desc limit 1) s
             left join public.profiles pr on pr.id = s.user_id), '[]'::jsonb)
    into v_total, v_hits, v_users, v_rows;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'hits', v_hits, 'users', v_users);
end $$;

-- Borra un grupo de errores (ya se arregló) o todos (p_fingerprint null). Devuelve cuántas filas. Queda en la
-- auditoría. Huella mal escrita: 'invalido'.
create function public.admin_clear_client_errors(p_fingerprint text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_fp text := nullif(lower(btrim(coalesce(p_fingerprint, ''))), '');
  v_message text;
  n integer;
begin
  perform private.require_super();
  if v_fp is not null and v_fp !~ '^[0-9a-f]{32}$' then
    perform private.fail('invalido');
  end if;
  if v_fp is not null then
    select e.message into v_message from public.client_errors e where e.fingerprint = v_fp order by e.last_at desc limit 1;
  end if;
  delete from public.client_errors where v_fp is null or fingerprint = v_fp;
  get diagnostics n = row_count;
  perform private.audit('clear_errors', 'app', v_fp, jsonb_build_object('deleted', n, 'all', v_fp is null)
    || case when v_message is not null then jsonb_build_object('message', left(v_message, 200)) else '{}'::jsonb end);
  return n;
end $$;

-- =====================================================================
-- Permisos: las RPC nuevas solo con sesión; las ayudas, nadie de la app
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array[
    'confirm_adult', 'export_my_data', 'prepare_delete_account', 'log_client_error', 'admin_client_errors',
    'admin_clear_client_errors'
  ];
  v_private constant text[] := array['export_hidden_columns', 'forget_user', 'release_storage_owner', 'clean_line', 'error_fingerprint'];
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
