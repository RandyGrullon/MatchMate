-- MatchMate · 1/6 · Base: todo cerrado por defecto, esquema private y utilidades comunes.
--
-- Supabase nace con todo abierto en `public`: cada tabla con GRANT ALL para anon y authenticated, y cada
-- función ejecutable por anon. Aquí se cierra de entrada; cada tabla y cada RPC recibe después su GRANT
-- explícito (ver 20260926000400_rpc.sql, al final). Las pruebas SQL recorren pg_proc y pg_class para
-- confirmar que no quedó nada abierto por accidente.

-- ---------- Privilegios por defecto ----------
-- Global (sin esquema): quita el EXECUTE a PUBLIC que Postgres da a toda función nueva. Por esquema no se
-- puede quitar lo global (la documentación de ALTER DEFAULT PRIVILEGES lo explica).
alter default privileges revoke execute on functions from public;
alter default privileges revoke all on tables from anon, authenticated;
alter default privileges revoke all on sequences from anon, authenticated;
alter default privileges revoke execute on functions from anon, authenticated;
-- Lo que Supabase concede en public para lo que crea postgres.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- ---------- Esquema private (no lo expone la API) ----------
create schema if not exists private;
revoke all on schema private from public;
-- Las políticas RLS llaman a funciones de aquí como el rol que consulta: necesitan USAGE (y EXECUTE en
-- esas funciones, nada más).
grant usage on schema private to anon, authenticated, service_role;

-- ---------- Errores ----------
-- Códigos cortos en español: 'no_permitido' (42501), y con P0001: 'invalido', 'no_existe', 'duplicado',
-- 'cerrado', 'rate_limited'. El cliente los traduce a un mensaje.

create function private.deny() returns void
language plpgsql set search_path = '' as $$
begin
  raise exception 'no_permitido' using errcode = '42501';
end $$;

create function private.fail(p_code text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception '%', p_code using errcode = 'P0001';
end $$;

-- Exige sesión (un visitante sin cuenta no escribe nada) y devuelve el uid.
create function private.require_uid() returns uuid
language plpgsql stable set search_path = '' as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'no_permitido' using errcode = '42501';
  end if;
  return v;
end $$;

-- ---------- Triggers comunes ----------

create function private.touch_updated_at() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Tiempo real ----------
-- En Supabase usa Broadcast (realtime.send, canal privado); en PGlite, NOTIFY en el canal 'mm' con
-- {topic, event, payload}. Nunca frena una escritura: si falla, solo avisa.
create function private.emit(p_topic text, p_event text, p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_msg text;
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    execute 'select realtime.send($1, $2, $3, true)' using p_payload, p_event, p_topic;
  else
    v_msg := jsonb_build_object('topic', p_topic, 'event', p_event, 'payload', p_payload)::text;
    -- NOTIFY admite hasta 8000 bytes: si no cabe, solo se avisa que cambió.
    if octet_length(v_msg) > 7900 then
      v_msg := jsonb_build_object('topic', p_topic, 'event', p_event, 'payload', jsonb_build_object('truncated', true))::text;
    end if;
    perform pg_notify('mm', v_msg);
  end if;
exception when others then
  raise warning 'emit % %: %', p_topic, p_event, sqlerrm;
end $$;

-- ---------- Idempotencia de la cola del teléfono ----------
-- Cada RPC de cancha y envíos recibe p_op_id. Reintentar la misma operación devuelve lo que dio la
-- primera vez y no la repite. El registro se borra por cron (fase 0C).
create table private.op_log (
  op_id uuid primary key,
  user_id uuid,
  fn text not null,
  result jsonb,
  created_at timestamptz not null default now()
);

-- null = operación nueva (queda reservada en esta transacción). Si ya se hizo, devuelve su resultado
-- (jsonb 'null' si no devolvía nada). Si el op_id es de otra cuenta u otra función: 'duplicado'.
-- Dos reintentos a la vez: el segundo espera al primero por la clave primaria.
create function private.op_begin(p_op uuid, p_fn text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v private.op_log;
begin
  if p_op is null then
    return null;
  end if;
  insert into private.op_log (op_id, user_id, fn) values (p_op, auth.uid(), p_fn) on conflict (op_id) do nothing;
  if found then
    return null;
  end if;
  select * into v from private.op_log where op_id = p_op;
  if v.user_id is distinct from auth.uid() or v.fn <> p_fn then
    perform private.fail('duplicado');
  end if;
  return coalesce(v.result, 'null'::jsonb);
end $$;

create function private.op_end(p_op uuid, p_result jsonb) returns void
language sql security definer set search_path = '' as $$
  update private.op_log set result = coalesce(p_result, 'null'::jsonb) where op_id = p_op;
$$;

-- ---------- Límite de intentos (códigos de invitación) ----------
-- Solo cuentan los intentos fallidos. Ojo: una excepción deshace todo, así que la RPC que cuenta un fallo
-- tiene que terminar sin excepción (devuelve null) para que el intento quede guardado.
create table private.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);

create function private.rate_blocked(p_key text, p_max integer, p_window interval) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select r.hits >= p_max from private.rate_limits r where r.key = p_key and r.window_start > now() - p_window), false)
$$;

create function private.rate_hit(p_key text, p_window interval) returns void
language sql security definer set search_path = '' as $$
  insert into private.rate_limits as r (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start > now() - p_window then r.hits + 1 else 1 end,
    window_start = case when r.window_start > now() - p_window then r.window_start else now() end;
$$;

-- Quién intenta: la cuenta, o la IP que deja PostgREST en request.headers (visitante sin cuenta).
create function private.rate_key(p_kind text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_headers jsonb;
  v_ip text;
begin
  if auth.uid() is not null then
    return p_kind || ':u:' || auth.uid()::text;
  end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  v_ip := coalesce(v_headers ->> 'cf-connecting-ip', v_headers ->> 'x-real-ip', btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)));
  return p_kind || ':ip:' || coalesce(nullif(v_ip, ''), 'anon');
end $$;

-- ---------- Validaciones ----------

-- Igual que normalizeName de src/lib/stats.ts: sin acentos, minúsculas, solo letras, números y espacios.
create function private.normalize_name(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
    regexp_replace(lower(regexp_replace(normalize(coalesce(p, ''), NFD), '[̀-ͯ]', '', 'g')), '[^a-z0-9ñ ]', ' ', 'g'),
    '\s+', ' ', 'g'))
$$;

-- Límites por deporte de una lista de números (pinos, golpes…). Boliche: hasta 10 juegos de 0 a 300,
-- igual que MAX_SCORE e isValidScore de stats.ts. Cada fase agrega su deporte.
create function private.series_ok(a smallint[], p_sport text) returns boolean
language sql immutable set search_path = '' as $$
  select a is null or (
    coalesce(array_ndims(a), 1) = 1
    and case p_sport
      when 'bowling' then coalesce(cardinality(a), 0) <= 10 and not exists (select 1 from unnest(a) x where x < 0 or x > 300)
      else coalesce(cardinality(a), 0) <= 36 and not exists (select 1 from unnest(a) x where x < 0)
    end)
$$;

-- Lista que manda el teléfono (jsonb) -> smallint[], estricta: solo números enteros o null (nada de
-- textos ni decimales), con los límites del deporte. null -> null. Si no sirve: 'invalido'.
create function private.series(p jsonb, p_sport text, p_min_len integer default 0) returns smallint[]
language plpgsql immutable set search_path = '' as $$
declare
  v smallint[] := '{}';
  e jsonb;
  n numeric;
begin
  if p is null or jsonb_typeof(p) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) < p_min_len or jsonb_array_length(p) > 36 then
    perform private.fail('invalido');
  end if;
  for e in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(e) = 'null' then
      v := v || null::smallint;
    elsif jsonb_typeof(e) = 'number' then
      n := (e #>> '{}')::numeric;
      if n <> trunc(n) or n < 0 or n > 32767 then
        perform private.fail('invalido');
      end if;
      v := v || n::smallint;
    else
      perform private.fail('invalido');
    end if;
  end loop;
  if not private.series_ok(v, p_sport) then
    perform private.fail('invalido');
  end if;
  return v;
end $$;

-- Marcas de verificación de una participación: id de foto, 'importado', 'sin-foto' o null (borrador).
create function private.marks_ok(a text[]) returns boolean
language sql immutable set search_path = '' as $$
  select a is null or (
    coalesce(array_ndims(a), 1) = 1
    and coalesce(cardinality(a), 0) <= 36
    and not exists (select 1 from unnest(a) x where char_length(x) not between 1 and 64))
$$;

create function private.marks(p jsonb) returns text[]
language plpgsql immutable set search_path = '' as $$
declare
  v text[] := '{}';
  e jsonb;
begin
  if p is null or jsonb_typeof(p) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p) <> 'array' then
    perform private.fail('invalido');
  end if;
  for e in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(e) = 'null' then
      v := v || null::text;
    elsif jsonb_typeof(e) = 'string' then
      v := v || (e #>> '{}');
    else
      perform private.fail('invalido');
    end if;
  end loop;
  if not private.marks_ok(v) then
    perform private.fail('invalido');
  end if;
  return v;
end $$;

-- Ajusta una lista al número de juegos del evento (como slots() de stats.ts: corta o rellena con null).
create function private.slots(a smallint[], n integer) returns smallint[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(a[i] order by i), '{}') from generate_series(1, greatest(n, 0)) i
$$;

create function private.slots(a text[], n integer) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(a[i] order by i), '{}') from generate_series(1, greatest(n, 0)) i
$$;

-- Nombre visible (liga, jugador, equipo, cuenta): recortado, de 1 a 60 letras.
create function private.clean_name(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text := btrim(coalesce(p, ''));
begin
  if char_length(v) not between 1 and 60 then
    perform private.fail('invalido');
  end if;
  return v;
end $$;

-- Código de invitación: 8 caracteres sin letras que se confundan (O/0, I/1), como randomCode() de BowlingX.
-- Sale de gen_random_uuid (aleatorio fuerte, sin pgcrypto): bytes 0-5, 9 y 10, que no llevan versión ni variante.
create function private.new_invite_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  b bytea := uuid_send(gen_random_uuid());
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v text := '';
  i integer;
begin
  foreach i in array array[0, 1, 2, 3, 4, 5, 9, 10] loop
    v := v || substr(chars, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return v;
end $$;

-- «Mantener despierto» (fase 0C): una escritura real al día.
create table private.heartbeat (
  id integer primary key default 1 check (id = 1),
  at timestamptz not null default now()
);
