-- MatchMate · Solo Supabase (el cargador de PGlite salta los archivos que terminan en _supabase.sql).
-- Tareas programadas con pg_cron; las llamadas a la Edge Function send-push van con pg_net. Las funciones que
-- corren están en 20260926001200_push.sql (con pruebas en PGlite); aquí solo se programan.
--
-- - mm-recordatorios, cada 15 minutos: private.cron_reminders() = private.enqueue_due_reminders(now()) y, si hay
--   mensajes por mandar (también reintentos), llama a send-push (private.kick_send_push). send-push manda lotes
--   de 50 y, si queda cola, finish_push_batch pide el siguiente con pg_net.
-- - mm-limpieza, cada día a las 4:30 am de Santo Domingo (08:30 UTC): private.cleanup_old_rows() (tombstones de
--   más de 60 días, op_log, live_states viejos, límites de ritmo, marcas de recordatorios, cola de push e
--   historial de pg_cron).
-- - mm-despierto, cada día a las 10:00 am de Santo Domingo: send-push llama a ping() por la API REST (una
--   escritura real). Es una ayuda: el «mantener despierto» de verdad es la llamada externa diaria (crítica 27),
--   porque las tareas de pg_cron solas probablemente no cuentan como actividad.
--
-- Una sola vez, a mano, en el SQL Editor del proyecto (los secretos nunca van en el repositorio):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<secreto al azar de 32+ letras>', 'cron_secret');
-- y el mismo secreto en la función: `supabase secrets set CRON_SECRET=<el mismo>` (ver
-- supabase/functions/send-push/README.md). Sin esos secretos las tareas corren igual pero no llaman a nadie.
-- Para cambiar un secreto: select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<nuevo>');

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise warning 'Sin pg_cron: no se programan los recordatorios ni la limpieza.';
    return;
  end if;
  create extension if not exists pg_cron with schema pg_catalog;
  -- Como en la documentación de Supabase: el esquema cron es de supabase_admin; postgres programa las tareas y
  -- borra el historial viejo (cleanup_old_rows).
  begin
    grant usage on schema cron to postgres;
    grant all privileges on all tables in schema cron to postgres;
  exception when others then
    raise warning 'No se pudieron dar permisos sobre cron a postgres: %', sqlerrm;
  end;

  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    if to_regnamespace('extensions') is not null then
      create extension if not exists pg_net with schema extensions;
    else
      create extension if not exists pg_net;
    end if;
  else
    raise warning 'Sin pg_net: los recordatorios se encolan pero nadie llama a send-push.';
  end if;

  -- cron.schedule con un nombre que ya existe lo reemplaza: correr esto otra vez no duplica nada.
  perform cron.schedule('mm-recordatorios', '*/15 * * * *', 'select private.cron_reminders()');
  perform cron.schedule('mm-limpieza', '30 8 * * *', 'select private.cleanup_old_rows()');
  perform cron.schedule('mm-despierto', '0 14 * * *', $cmd$select private.kick_send_push('{"ping": true}'::jsonb)$cmd$);
end $$;
