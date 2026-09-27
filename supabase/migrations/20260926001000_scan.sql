-- MatchMate · 0C · Lectura de fotos con IA (Edge Function scan-bowling): permisos, cupos y caché.
--
-- Todo vive en `private` (la API no lo expone), con search_path vacío. La Edge Function entra con la clave
-- secreta (service_role) por tres RPC de `public` que SOLO puede ejecutar service_role (como `ping`):
--
--   scan_begin(p_user, p_league, p_event, p_key, p_models, p_per_minute) → jsonb
--     {status: 'cached', result, model}        la misma foto ya se leyó en las últimas 24 h (no gasta cupo)
--     {status: 'ok', model, left}              se puede leer con `model` (ya se contó la lectura y el minuto)
--     {status: 'limit', reason, retry_after, limit}
--        reason: 'espera' (8 s entre fotos), 'usuario' (40 al día), 'global' (900 al día), 'ocupado' (todos los
--        modelos llenos en este minuto). retry_after en segundos.
--   scan_next_model(p_models, p_per_minute) → text   otro modelo con cupo en este minuto, o null
--   scan_finish(p_user, p_key, p_model, p_result, p_refund) → void   guarda la respuesta en la caché y/o
--     devuelve la lectura a la cuenta (ningún modelo respondió)
--
-- Errores (antes de gastar nada): 'no_permitido' (42501) si la cuenta no está en la liga, la liga no es de
-- boliche o tiene menores; 'no_existe' si la liga o el evento no existen o el evento es de otra liga;
-- 'cerrado' si el evento no está abierto (de hace más de 14 días o de más de 1 día en el futuro); 'invalido'.
--
-- El «día» es el de Google: su cupo gratis se reinicia a medianoche del Pacífico (3–4 am en RD), así una noche
-- de liga nunca queda partida en dos días.

-- ---------- Tablas ----------

-- Lecturas por cuenta y día (y la última, para los 8 s entre fotos).
create table private.scan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  n integer not null default 0 check (n >= 0),
  last_at timestamptz,
  primary key (user_id, day)
);
create index scan_usage_day_idx on private.scan_usage (day);

-- Lecturas del día sumando todas las cuentas (tope global, por debajo del cupo gratis de Google).
create table private.scan_days (
  day date primary key,
  n integer not null default 0 check (n >= 0)
);

-- Llamadas a cada modelo por minuto (tope por minuto y modelo). Se guardan 3 días: el panel de uso del
-- superadmin suma las lecturas del día por modelo de aquí.
create table private.scan_minutes (
  model text not null check (model ~ '^[a-z0-9][a-z0-9.-]{0,79}$'),
  minute timestamptz not null,
  n integer not null default 0 check (n >= 0),
  primary key (model, minute)
);
create index scan_minutes_minute_idx on private.scan_minutes (minute);

-- Respuesta de la IA por SHA-256 de la foto (24 h): reintentar la misma foto, o que varios del equipo
-- manden la misma foto del grupo, no gasta cupo.
create table private.scan_cache (
  key text primary key check (key ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (jsonb_typeof(result) = 'object' and pg_column_size(result) < 65536),
  model text check (char_length(model) <= 80),
  created_at timestamptz not null default now()
);
create index scan_cache_created_idx on private.scan_cache (created_at);

-- ---------- Ayudas ----------

-- Día del cupo de Google.
create function private.scan_day() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Los_Angeles')::date
$$;

-- Segundos hasta que Google reinicia el cupo del día.
create function private.scan_reset_in() returns integer
language sql stable set search_path = '' as $$
  select greatest(1, ceil(extract(epoch from (((private.scan_day() + 1)::timestamp at time zone 'America/Los_Angeles') - now())))::integer)
$$;

-- Quién puede leer fotos con IA y de qué evento. Lanza el error; si todo está bien no devuelve nada.
-- p_event null: envío por fecha (sin evento todavía), basta con la liga.
create function private.can_scan(p_user uuid, p_league uuid, p_event uuid) returns void
language plpgsql set search_path = '' as $$
declare
  l public.leagues;
  e public.events;
  v_today date;
begin
  if p_user is null or p_league is null then
    perform private.fail('invalido');
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

-- Toma un lugar en el minuto de algún modelo, en el orden de p_models. Devuelve el modelo o null si todos
-- están llenos en este minuto.
create function private.take_model_slot(p_models text[], p_per_minute integer) returns text
language plpgsql set search_path = '' as $$
declare
  m text;
  v integer;
  v_minute timestamptz := date_trunc('minute', now());
begin
  foreach m in array coalesce(p_models, '{}'::text[]) loop
    if m is null or m !~ '^[a-z0-9][a-z0-9.-]{0,79}$' then
      perform private.fail('invalido');
    end if;
    v := null;
    insert into private.scan_minutes as s (model, minute, n) values (m, v_minute, 1)
    on conflict (model, minute) do update set n = s.n + 1 where s.n < greatest(coalesce(p_per_minute, 12), 1)
    returning s.n into v;
    if v is not null then
      return m;
    end if;
  end loop;
  return null;
end $$;

-- Gasta una lectura de la cuenta: permisos (can_scan), 8 s entre fotos, tope diario por cuenta y global, y un
-- lugar en el minuto del primer modelo con cupo. Devuelve {ok: true, model, left} o {ok: false, reason,
-- retry_after, limit} (sin gastar nada).
create function private.consume_scan(
  p_user uuid,
  p_league uuid,
  p_event uuid,
  p_models text[] default array['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  p_per_minute integer default 12,
  p_daily integer default 40,
  p_gap_s integer default 8,
  p_global integer default 900
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_day date := private.scan_day();
  v_models text[] := coalesce(nullif(p_models, '{}'::text[]), array['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
  u private.scan_usage;
  v_total integer;
  v_model text;
begin
  perform private.can_scan(p_user, p_league, p_event);
  -- La fila del día de la cuenta, bloqueada: dos fotos a la vez de la misma cuenta van en fila.
  insert into private.scan_usage (user_id, day) values (p_user, v_day) on conflict (user_id, day) do nothing;
  select * into u from private.scan_usage s where s.user_id = p_user and s.day = v_day for update;
  if u.last_at is not null and u.last_at > now() - make_interval(secs => p_gap_s) then
    return jsonb_build_object('ok', false, 'reason', 'espera', 'limit', p_gap_s,
      'retry_after', greatest(1, ceil(extract(epoch from (u.last_at + make_interval(secs => p_gap_s)) - now()))::integer));
  end if;
  if u.n >= p_daily then
    return jsonb_build_object('ok', false, 'reason', 'usuario', 'limit', p_daily, 'retry_after', private.scan_reset_in());
  end if;
  -- Tope del día para todos: solo sube si no se ha llegado.
  v_total := null;
  insert into private.scan_days as d (day, n) values (v_day, 1)
  on conflict (day) do update set n = d.n + 1 where d.n < p_global
  returning d.n into v_total;
  if v_total is null or v_total > p_global then
    return jsonb_build_object('ok', false, 'reason', 'global', 'limit', p_global, 'retry_after', private.scan_reset_in());
  end if;
  v_model := private.take_model_slot(v_models, p_per_minute);
  if v_model is null then
    -- Todos los modelos llenos en este minuto: se devuelve lo del día y se prueba en el minuto siguiente.
    update private.scan_days set n = greatest(n - 1, 0) where day = v_day;
    return jsonb_build_object('ok', false, 'reason', 'ocupado', 'limit', p_per_minute,
      'retry_after', greatest(1, 60 - floor(extract(second from now()))::integer));
  end if;
  update private.scan_usage set n = n + 1, last_at = now() where user_id = p_user and day = v_day;
  return jsonb_build_object('ok', true, 'model', v_model, 'left', greatest(p_daily - u.n - 1, 0));
end $$;

-- Lo viejo se borra solo (tablas chicas, índices por fecha). También lo puede llamar el cron de limpieza.
create function private.scan_cleanup() returns void
language sql set search_path = '' as $$
  delete from private.scan_cache where created_at < now() - interval '24 hours';
  delete from private.scan_minutes where minute < now() - interval '3 days';
  delete from private.scan_usage where day < private.scan_day() - 7;
  delete from private.scan_days where day < private.scan_day() - 90;
$$;

-- ---------- Lo que llama la Edge Function (solo service_role) ----------

create function public.scan_begin(
  p_user uuid,
  p_league uuid,
  p_event uuid,
  p_key text,
  p_models text[] default null,
  p_per_minute integer default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c private.scan_cache;
  v jsonb;
begin
  perform private.can_scan(p_user, p_league, p_event);
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    perform private.fail('invalido');
  end if;
  select * into c from private.scan_cache x where x.key = p_key and x.created_at > now() - interval '24 hours';
  if c.key is not null then
    return jsonb_build_object('status', 'cached', 'result', c.result, 'model', c.model);
  end if;
  v := private.consume_scan(p_user, p_league, p_event, p_models, coalesce(p_per_minute, 12));
  if (v ->> 'ok')::boolean then
    return jsonb_build_object('status', 'ok', 'model', v -> 'model', 'left', v -> 'left');
  end if;
  return jsonb_build_object('status', 'limit', 'reason', v -> 'reason', 'retry_after', v -> 'retry_after', 'limit', v -> 'limit');
end $$;

create function public.scan_next_model(p_models text[], p_per_minute integer default null) returns text
language sql security definer set search_path = '' as $$
  select private.take_model_slot(p_models, coalesce(p_per_minute, 12))
$$;

create function public.scan_finish(
  p_user uuid,
  p_key text,
  p_model text default null,
  p_result jsonb default null,
  p_refund boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_result is not null and jsonb_typeof(p_result) <> 'null' then
    if p_key is null or p_key !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_result) <> 'object' then
      perform private.fail('invalido');
    end if;
    insert into private.scan_cache (key, result, model) values (p_key, p_result, p_model)
    on conflict (key) do update set result = excluded.result, model = excluded.model, created_at = now();
  end if;
  -- Ningún modelo respondió: la lectura no cuenta para la cuenta (sí queda la espera de 8 s y el total del día,
  -- porque Google pudo haberla contado).
  if p_refund and p_user is not null then
    update private.scan_usage set n = greatest(n - 1, 0) where user_id = p_user and day = private.scan_day();
  end if;
  perform private.scan_cleanup();
end $$;

-- ---------- Permisos ----------
-- Nada para anon ni authenticated (la app nunca llama esto); las tres RPC, solo service_role.
revoke execute on function
  private.scan_day(), private.scan_reset_in(), private.can_scan(uuid, uuid, uuid), private.take_model_slot(text[], integer),
  private.consume_scan(uuid, uuid, uuid, text[], integer, integer, integer, integer), private.scan_cleanup(),
  public.scan_begin(uuid, uuid, uuid, text, text[], integer), public.scan_next_model(text[], integer),
  public.scan_finish(uuid, text, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function
  public.scan_begin(uuid, uuid, uuid, text, text[], integer), public.scan_next_model(text[], integer),
  public.scan_finish(uuid, text, text, jsonb, boolean)
  to service_role;
