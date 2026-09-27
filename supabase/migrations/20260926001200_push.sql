-- MatchMate · Push: recordatorios de prácticas y torneos, cola de envío (Edge Function send-push) y limpieza.
--
-- Reemplaza a GitHub Actions de BowlingX (recordatorios.yml + scripts/push/recordatorios.ts):
-- - private.enqueue_due_reminders(now) es src/lib/reminders.ts (y parseSchedule de schedule.ts) pasado a SQL, con
--   los mismos textos. tests/sql/push.test.ts corre las dos versiones con las mismas fechas, horas y horarios y
--   compara: si se cambia una, hay que cambiar la otra.
-- - Llena push_outbox con un mensaje por teléfono (los 5 más recientes de cada miembro de la liga).
-- - La Edge Function send-push toma lotes (claim_push_batch), los manda y avisa (finish_push_batch). Las dos son
--   solo de service_role (la clave secreta). Si queda cola, finish encadena el siguiente lote con pg_net.
-- - La programación con pg_cron está en 20260926001300_cron_supabase.sql (solo Supabase). Todo lo de aquí corre
--   también en PGlite: lo que usa Vault, pg_net o pg_cron revisa primero que exista y, si no, no hace nada.

-- =====================================================================
-- Cola de envío: un mensaje por teléfono
-- =====================================================================
-- subscription_id: el teléfono. urgency: cabecera Urgency de Web Push. claimed_at: send-push lo tomó (nadie más lo
-- toma en 3 minutos; si la función se cae a mitad, se vuelve a tomar después). last_status: la última respuesta
-- del servicio de push (null = sin respuesta).
alter table public.push_outbox
  add column subscription_id uuid references public.push_subscriptions (id) on delete cascade,
  add column urgency text not null default 'normal' check (urgency in ('very-low', 'low', 'normal', 'high')),
  add column claimed_at timestamptz,
  add column last_status smallint;
create index push_outbox_subscription_idx on public.push_outbox (subscription_id);
create index push_outbox_user_idx on public.push_outbox (user_id);
-- Los recordatorios buscan los eventos de hoy y mañana de todas las ligas.
create index if not exists events_date_idx on public.events (date);

-- Quien encola puede poner solo la cuenta (user_id): la fila se reparte en una por teléfono de esa cuenta, los 5
-- más recientes (como BowlingX). Sin teléfonos no queda nada. Con subscription_id, entra tal cual.
create function private.push_outbox_fanout() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.subscription_id is not null then
    return new;
  end if;
  insert into public.push_outbox (user_id, subscription_id, title, body, url, tag, ttl, urgency, created_at)
  select new.user_id, s.id, new.title, new.body, new.url, new.tag, new.ttl, new.urgency, new.created_at
    from public.push_subscriptions s
   where s.user_id = new.user_id
   order by s.updated_at desc, s.id
   limit 5;
  return null;
end $$;

create trigger push_outbox_fanout before insert on public.push_outbox
  for each row execute function private.push_outbox_fanout();

-- =====================================================================
-- Recordatorios: src/lib/reminders.ts y parseSchedule() de src/lib/schedule.ts, en SQL
-- =====================================================================
-- Detalles para que dé lo mismo que JavaScript:
-- - \s de JavaScript reconoce espacios que el de Postgres no (sin corte, finos…): se ponen en las clases a mano.
-- - \b de JavaScript (sin la bandera u) es el borde entre [A-Za-z0-9_] y lo demás: se escribe así, no con \y.
-- - \d de JavaScript es solo [0-9].

-- trim() de JavaScript.
create function private.js_trim(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(p,
    '^[\s   -     　﻿]+|[\s   -     　﻿]+$',
    '', 'g')
$$;

-- Los espacios de JavaScript pasan a espacio normal (para usar \s de Postgres en las expresiones de abajo).
create function private.js_spaces(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(p, '[   -     　﻿]', ' ', 'g')
$$;

-- plain() de schedule.ts: sin acentos y en minúsculas.
create function private.js_plain(p text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(normalize(private.js_spaces(p), NFD), '[̀-ͯ]', '', 'g'))
$$;

-- parseSchedule() de schedule.ts: días (0 = lunes) y la primera hora 'HH:MM' ('' si no hay).
-- "sábados", "7pm", "7:30 p. m.", rangos ("7:00 a 9:00 pm": la primera hora toma el am/pm de la siguiente).
create function private.parse_schedule(p text, out days integer[], out hhmm text)
language plpgsql immutable set search_path = '' as $$
declare
  v_s text := private.js_plain(coalesce(p, ''));
  v_names constant text[] := array['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  v_m text[];
  v_h integer;
  v_min text;
  v_ampm text;
  v_next text;
begin
  days := array(select i - 1 from generate_series(1, 7) i
                 where v_s ~ ('(^|[^A-Za-z0-9_])' || v_names[i] || 's?($|[^A-Za-z0-9_])') order by i);
  -- Horas: "7:30", "7:30 pm", "7 pm". Un número suelto (sin ":" ni am/pm) no es una hora.
  for v_m in select m from regexp_matches(v_s, '([0-9]{1,2})(?::([0-9]{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?', 'g') as m loop
    continue when v_m[2] is null and v_m[3] is null;
    if v_h is null then
      v_h := v_m[1]::integer;
      v_min := coalesce(v_m[2], '00');
      v_ampm := regexp_replace(v_m[3], '[\s.]', '', 'g');
    elsif v_next is null and v_m[3] is not null then
      v_next := regexp_replace(v_m[3], '[\s.]', '', 'g');
    end if;
  end loop;
  hhmm := '';
  if v_h is not null then
    v_ampm := coalesce(v_ampm, v_next);
    if v_ampm = 'pm' and v_h < 12 then
      v_h := v_h + 12;
    end if;
    if v_ampm = 'am' and v_h = 12 then
      v_h := 0;
    end if;
    if v_h <= 23 and v_min::integer <= 59 then
      hhmm := lpad(v_h::text, 2, '0') || ':' || v_min;
    end if;
  end if;
end $$;

-- formatTime() de schedule.ts: '19:00' -> '7:00 pm'. '' si no es una hora válida.
create function private.format_time(p_hhmm text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_m text[] := regexp_match(private.js_trim(coalesce(p_hhmm, '')), '^([0-9]{1,2}):([0-9]{2})$');
  v_h integer;
begin
  if v_m is null then
    return '';
  end if;
  v_h := v_m[1]::integer;
  if v_h > 23 or v_m[2]::integer > 59 then
    return '';
  end if;
  return (case when v_h % 12 = 0 then 12 else v_h % 12 end)::text || ':' || v_m[2] || case when v_h < 12 then ' am' else ' pm' end;
end $$;

-- eventStart() de reminders.ts: minuto del día en que empieza el evento según el horario de la liga (y cómo se
-- escribe). Nada (nulls) si no tiene hora, si el evento cae en otro día que los de la liga, o si la hora no dice
-- am/pm ("7:00" no se sabe si es de mañana o de noche; de 13:00 en adelante no hay duda).
create function private.event_start(p_date date, p_schedule text, out minutes integer, out label text)
language plpgsql immutable set search_path = '' as $$
declare
  v record;
  v_h integer;
  v_m integer;
begin
  select * into v from private.parse_schedule(p_schedule);
  if v.hhmm = '' then
    return;
  end if;
  if cardinality(v.days) > 0 and not ((extract(isodow from p_date)::integer - 1) = any (v.days)) then
    return;
  end if;
  v_h := split_part(v.hhmm, ':', 1)::integer;
  v_m := split_part(v.hhmm, ':', 2)::integer;
  if v_h < 13 and not (private.js_spaces(coalesce(p_schedule, '')) ~* '[0-9]\s*[ap]\.?\s*m($|[^A-Za-z0-9_])') then
    return;
  end if;
  minutes := v_h * 60 + v_m;
  label := private.format_time(v.hhmm);
end $$;

-- dueReminders() de reminders.ts: los que tocan ahora para este evento, del más viejo al más nuevo (ord).
-- p_today y p_minutes: la fecha y el minuto del día en la zona de la liga.
-- - 'dia-antes': el día antes, de 12:00 pm a 9:00 pm (de noche no se molesta);
-- - 'mismo-dia': el mismo día desde las 12:00 pm (o 3 horas antes si la liga juega temprano, no antes de las
--   7 am) hasta 1¼ hora antes; sin hora, hasta las 6 pm;
-- - 'una-hora': entre 1¼ hora y 10 minutos antes (solo si la liga tiene hora). La ventana es ancha porque el cron
--   corre cada 15 minutos y a veces se atrasa.
create function private.due_reminders(p_date date, p_type text, p_name text, p_league_name text, p_schedule text,
                                      p_today date, p_minutes integer)
returns table (ord integer, slot text, title text, body text)
language plpgsql immutable set search_path = '' as $$
declare
  v_weekdays constant text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  v_start record;
  v_name text := private.js_trim(coalesce(p_name, ''));
  v_what text;
  v_at text := '';
  v_same_at integer;
  v_same_until integer;
begin
  select * into v_start from private.event_start(p_date, p_schedule);
  v_what := case when p_type = 'torneo' then 'el torneo' || case when v_name <> '' then ' ' || v_name else '' end
                 else 'la práctica' end;
  if v_start.minutes is not null then
    v_at := ' a las ' || v_start.label;
  end if;

  if p_date = p_today + 1 and p_minutes >= 12 * 60 and p_minutes < 21 * 60 then
    return query select 1, 'dia-antes'::text, 'Recuerda: mañana es ' || v_what,
      p_league_name || ' · ' || v_weekdays[extract(isodow from p_date)::integer] || v_at || '. ¿Vas? Confírmalo en la app.';
  end if;

  if p_date = p_today then
    v_same_at := case when v_start.minutes is not null then greatest(7 * 60, least(12 * 60, v_start.minutes - 180)) else 12 * 60 end;
    v_same_until := case when v_start.minutes is not null then v_start.minutes - 75 else 18 * 60 end;
    if p_minutes >= v_same_at and p_minutes < v_same_until then
      return query select 2, 'mismo-dia'::text, 'Hoy es ' || v_what, p_league_name || v_at || '. ¡Nos vemos en la bolera!';
    end if;
    if v_start.minutes is not null and p_minutes >= v_start.minutes - 75 and p_minutes < v_start.minutes - 10 then
      return query select 3, 'una-hora'::text, 'A las ' || v_start.label || ' empieza ' || v_what,
        p_league_name || '. Anota tus juegos en la app mientras juegas.';
    end if;
  end if;
end $$;

-- reminderTtl() de reminders.ts: segundos que el servicio de push guarda el aviso si el teléfono está apagado:
-- hasta que empieza el evento (o se acaba su día, si no tiene hora), máximo 6 horas y mínimo 1 minuto.
create function private.reminder_ttl(p_date date, p_schedule text, p_today date, p_minutes integer) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  v_start integer := (select s.minutes from private.event_start(p_date, p_schedule) s);
  v_offset integer := case when p_date = p_today then 0 when p_date = p_today + 1 then 1440 else -1 end;
begin
  if v_offset < 0 then
    return 60;
  end if;
  return greatest(60, least(6 * 3600, (v_offset + coalesce(v_start, 1440) - p_minutes) * 60));
end $$;

-- Lo que hacía el cron de BowlingX cada 15 minutos, con la hora de cada liga (leagues.tz): por cada práctica o
-- torneo de hoy y mañana, los recordatorios que tocan y todavía no salieron se marcan todos en reminders_sent y
-- sale solo el último (el más cercano a empezar), a los teléfonos de todos los miembros de la liga. La marca
-- lleva la fecha ('dia-antes@2026-09-29'): si mueven el evento a otro día, sus recordatorios vuelven a salir.
-- Dos corridas a la vez no mandan dos veces (la clave de reminders_sent). Devuelve cuántos recordatorios salieron.
create function private.enqueue_due_reminders(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_last record;
  v_sent integer := 0;
begin
  for r in
    select e.id, e.league_id, e.date, e.type, e.name, l.name as league_name, l.schedule,
           x.local_now::date as today,
           (extract(hour from x.local_now) * 60 + extract(minute from x.local_now))::integer as minutes
      from public.events e
      join public.leagues l on l.id = e.league_id
     cross join lateral (select p_now at time zone l.tz as local_now) x
     -- Primero por la fecha en UTC (usa el índice; ninguna zona se aleja más de un día) y luego la de la liga.
     -- Solo boliche: los textos son de prácticas y torneos en la bolera. Los deportes de partidos avisan cada
     -- partido (private.padel_match_reminders y los de cada deporte).
     where l.sport = 'bowling'
       and e.date between (p_now at time zone 'UTC')::date - 1 and (p_now at time zone 'UTC')::date + 2
       and e.date in (x.local_now::date, x.local_now::date + 1)
     order by e.date, e.id
  loop
    with due as (
      select d.ord, d.slot, d.title, d.body
        from private.due_reminders(r.date, r.type, r.name, r.league_name, r.schedule, r.today, r.minutes) d
    ), fresh as (
      insert into public.reminders_sent (event_id, kind)
      select r.id, d.slot || '@' || to_char(r.date, 'YYYY-MM-DD') from due d
      on conflict do nothing
      returning kind
    )
    select d.title, d.body into v_last
      from due d join fresh f on f.kind = d.slot || '@' || to_char(r.date, 'YYYY-MM-DD')
     order by d.ord desc
     limit 1;
    continue when not found;
    -- Una fila por miembro; el trigger push_outbox_fanout la reparte a sus teléfonos.
    insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
    select m.user_id, v_last.title, v_last.body, '/l/' || r.league_id::text || '/e/' || r.id::text,
           'recordatorio:' || r.id::text, private.reminder_ttl(r.date, r.schedule, r.today, r.minutes), 'high'
      from public.league_members m
     where m.league_id = r.league_id;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;

-- =====================================================================
-- Envío: la Edge Function send-push (clave secreta = service_role)
-- =====================================================================

-- Mensajes que se pueden tomar ahora: sin enviar, de un teléfono que sigue siendo de esa cuenta, con menos de 5
-- intentos y sin tomar (o tomados hace más de 3 minutos: la función se cayó a mitad o es un reintento).
create function private.push_pending() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer
    from public.push_outbox o
    join public.push_subscriptions s on s.id = o.subscription_id and s.user_id = o.user_id
   where o.sent_at is null and o.attempts < 5
     and (o.claimed_at is null or o.claimed_at < now() - interval '3 minutes')
$$;

-- Toma un lote (lo que va a mandar esta llamada de send-push): sube los intentos y lo aparta 3 minutos. ttl = los
-- segundos que le quedan al aviso (el ttl original menos lo que lleva en la cola; 0 o menos = ya no sirve).
create function public.claim_push_batch(p_limit integer default 50)
returns table (id bigint, endpoint text, p256dh text, auth text, title text, body text, url text, tag text, urgency text, ttl integer)
language sql security definer set search_path = '' as $$
  with picked as (
    select o.id
      from public.push_outbox o
      join public.push_subscriptions s on s.id = o.subscription_id and s.user_id = o.user_id
     where o.sent_at is null and o.attempts < 5
       and (o.claimed_at is null or o.claimed_at < now() - interval '3 minutes')
     order by o.id
     limit least(greatest(coalesce(p_limit, 50), 1), 100)
       for update of o skip locked
  ), taken as (
    update public.push_outbox o set claimed_at = now(), attempts = o.attempts + 1
      from picked p
     where o.id = p.id
    returning o.id, o.user_id, o.subscription_id, o.title, o.body, o.url, o.tag, o.urgency, o.ttl, o.created_at
  )
  select t.id, s.endpoint, s.p256dh, s.auth, t.title, t.body, t.url, t.tag, t.urgency,
         floor(coalesce(t.ttl, 86400) - extract(epoch from now() - t.created_at))::integer
    from taken t
    join public.push_subscriptions s on s.id = t.subscription_id and s.user_id = t.user_id
   order by t.id
$$;

-- Lo que pasó con cada mensaje del lote: p_results = [{id, outcome, status}] con outcome
-- - 'sent': el servicio de push lo recibió; 'expired': ya no servía (no se mandó). Los dos quedan listos.
-- - 'gone': 404/410 o una suscripción que no sirve: se borra el teléfono (y lo que tenía en la cola).
-- - 'retry': sin respuesta, 429 o 5xx: queda apartado 3 minutos (esa es la espera) y se reintenta después.
-- - 'failed': otro 4xx (clave VAPID que no es, mensaje muy largo…): no se reintenta; 3 seguidos borran el teléfono.
-- Devuelve {remaining, chained}: lo que queda por tomar y si ya se pidió el siguiente lote (pg_net).
create function public.finish_push_batch(p_results jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_remaining integer;
  v_chained boolean := false;
begin
  if p_results is null or jsonb_typeof(p_results) <> 'array' then
    perform private.fail('invalido');
  end if;

  update public.push_outbox o set sent_at = now(), claimed_at = null, last_status = r.status
    from jsonb_to_recordset(p_results) as r (id bigint, outcome text, status smallint)
   where o.id = r.id and r.outcome in ('sent', 'expired') and o.sent_at is null;

  update public.push_subscriptions s set fail_count = 0
    from public.push_outbox o, jsonb_to_recordset(p_results) as r (id bigint, outcome text)
   where r.outcome = 'sent' and o.id = r.id and s.id = o.subscription_id and s.fail_count <> 0;

  update public.push_outbox o set last_status = r.status
    from jsonb_to_recordset(p_results) as r (id bigint, outcome text, status smallint)
   where o.id = r.id and r.outcome = 'retry' and o.sent_at is null;

  update public.push_outbox o set attempts = greatest(o.attempts, 5), claimed_at = null, last_status = r.status
    from jsonb_to_recordset(p_results) as r (id bigint, outcome text, status smallint)
   where o.id = r.id and r.outcome = 'failed' and o.sent_at is null;

  update public.push_subscriptions s set fail_count = s.fail_count + 1
    from (select distinct o.subscription_id
            from public.push_outbox o
            join jsonb_to_recordset(p_results) as r (id bigint, outcome text) on r.id = o.id
           where r.outcome = 'failed') f
   where s.id = f.subscription_id;

  delete from public.push_subscriptions s
   using public.push_outbox o, jsonb_to_recordset(p_results) as r (id bigint, outcome text)
   where o.id = r.id and s.id = o.subscription_id
     and (r.outcome = 'gone' or (r.outcome = 'failed' and s.fail_count >= 3));

  v_remaining := private.push_pending();
  if v_remaining > 0 then
    v_chained := private.kick_send_push();
  end if;
  return jsonb_build_object('remaining', v_remaining, 'chained', v_chained);
end $$;

-- Llama a la Edge Function send-push con pg_net (solo Supabase; la respuesta no se espera). La dirección del
-- proyecto y el secreto compartido están en Vault ('project_url' y 'cron_secret'); el mismo secreto es
-- CRON_SECRET en los secretos de la función. Sin pg_net, sin Vault o sin esos secretos (PGlite, o antes de
-- configurarlo) no hace nada y devuelve false. Nunca frena a quien la llama.
create function private.kick_send_push(p_body jsonb default '{}') returns boolean
language plpgsql set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null
     or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return false;
  end if;
  execute $q$
    select btrim(max(decrypted_secret) filter (where name = 'project_url'), E' \t\r\n'),
           btrim(max(decrypted_secret) filter (where name = 'cron_secret'), E' \t\r\n')
      from vault.decrypted_secrets
     where name in ('project_url', 'cron_secret')
  $q$ into v_url, v_secret;
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return false;
  end if;
  -- 60 s: un lote de 50 con 10 a la vez tarda, como mucho, unos 40 s.
  execute 'select net.http_post(url => $1, body => $2, headers => $3, timeout_milliseconds => $4)'
    using rtrim(v_url, '/') || '/functions/v1/send-push', coalesce(p_body, '{}'::jsonb),
          jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret), 60000;
  return true;
exception when others then
  raise warning 'kick_send_push: %', sqlerrm;
  return false;
end $$;

-- La tarea de cada 15 minutos: encola los recordatorios y, si hay algo por mandar (también reintentos), llama a
-- send-push. Devuelve cuántos recordatorios salieron.
create function private.cron_reminders(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_sent integer := private.enqueue_due_reminders(p_now);
begin
  if private.push_pending() > 0 then
    perform private.kick_send_push();
  end if;
  return v_sent;
end $$;

-- =====================================================================
-- Limpieza diaria (la programa 20260926001300_cron_supabase.sql)
-- =====================================================================
-- - tombstones de más de 60 días (un teléfono con el cursor más viejo que eso recarga todo);
-- - op_log de más de 30 días (la cola del teléfono no guarda tanto);
-- - live_states sin cambios en 2 días (el evento ya pasó);
-- - rate_limits y paces de más de un día (las ventanas son de minutos u horas);
-- - reminders_sent de más de 8 días (solo cuentan hoy y mañana);
-- - push_outbox enviados hace más de 2 días o sin enviar de hace más de un día (ya vencieron);
-- - el historial de pg_cron de más de 7 días (solo Supabase).
-- Devuelve cuántas filas borró de cada una.
create function private.cleanup_old_rows(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb := '{}';
  n integer;
begin
  delete from public.tombstones where deleted_at < p_now - interval '60 days';
  get diagnostics n = row_count;
  v := v || jsonb_build_object('tombstones', n);

  delete from private.op_log where created_at < p_now - interval '30 days';
  get diagnostics n = row_count;
  v := v || jsonb_build_object('op_log', n);

  delete from public.live_states where updated_at < p_now - interval '2 days';
  get diagnostics n = row_count;
  v := v || jsonb_build_object('live_states', n);

  delete from private.rate_limits where window_start < p_now - interval '1 day';
  get diagnostics n = row_count;
  v := v || jsonb_build_object('rate_limits', n);

  delete from private.paces where last_at < p_now - interval '1 day';
  get diagnostics n = row_count;
  v := v || jsonb_build_object('paces', n);

  delete from public.reminders_sent where sent_at < p_now - interval '8 days';
  get diagnostics n = row_count;
  v := v || jsonb_build_object('reminders_sent', n);

  delete from public.push_outbox
   where (sent_at is not null and sent_at < p_now - interval '2 days')
      or (sent_at is null and created_at < p_now - interval '1 day');
  get diagnostics n = row_count;
  v := v || jsonb_build_object('push_outbox', n);

  if to_regclass('cron.job_run_details') is not null then
    begin
      execute 'delete from cron.job_run_details where end_time < $1' using p_now - interval '7 days';
      get diagnostics n = row_count;
      v := v || jsonb_build_object('cron_history', n);
    exception when others then
      raise warning 'cleanup_old_rows (historial del cron): %', sqlerrm;
    end;
  end if;
  return v;
end $$;

-- =====================================================================
-- Permisos: nadie de la app ejecuta nada de esto. claim/finish solo service_role (send-push).
-- =====================================================================
revoke execute on function
  private.push_outbox_fanout(),
  private.js_trim(text),
  private.js_spaces(text),
  private.js_plain(text),
  private.parse_schedule(text),
  private.format_time(text),
  private.event_start(date, text),
  private.due_reminders(date, text, text, text, text, date, integer),
  private.reminder_ttl(date, text, date, integer),
  private.enqueue_due_reminders(timestamptz),
  private.push_pending(),
  private.kick_send_push(jsonb),
  private.cron_reminders(timestamptz),
  private.cleanup_old_rows(timestamptz),
  public.claim_push_batch(integer),
  public.finish_push_batch(jsonb)
from public, anon, authenticated;
grant execute on function public.claim_push_batch(integer), public.finish_push_batch(jsonb) to service_role;
