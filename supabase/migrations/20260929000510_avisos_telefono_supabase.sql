-- MatchMate · Avisos al teléfono · Solo Supabase (el cargador de PGlite salta los archivos que terminan en _supabase.sql).
-- Programa con pg_cron lo de 20260929000500_avisos_telefono.sql (las funciones y sus pruebas están allá, en PGlite):
--
-- - mm-despues-del-juego, cada día a las 9:00 am de Santo Domingo (13:00 UTC): private.remind_after_bowling()
--   («¿Cómo te fue anoche?» a quien marcó «voy» ayer y no subió sus juegos).
-- - mm-partidos-sin-resultado, cada hora al minuto 17: private.remind_missing_results() («¿Cómo quedó A vs B?»; de
--   10:00 pm a 8:00 am en la hora de la liga no avisa: espera a la mañana).
-- - mm-limpiar-fotos, cada día a las 4:30 am de Santo Domingo (08:30 UTC): llama a la Edge Function purge-photos con
--   pg_net y el secreto compartido (private.kick_function, los mismos secretos de Vault que send-push): borra del
--   bucket lo que está en private.storage_purge_queue y los archivos sin fila en photos.
-- - mm-alerta-espacio, cada día a las 8:00 am de Santo Domingo (12:00 UTC): private.check_storage_alert() (push a los
--   superadmins si la base o los archivos van por el 70 % del plan gratis; una vez cada 3 días).
--
-- Se puede correr otra vez: cada tarea se quita por su nombre antes de programarla. Los secretos (project_url y
-- cron_secret en Vault, CRON_SECRET en las funciones) son los de 20260926001300_cron_supabase.sql: sin ellos las
-- tareas corren igual pero no llaman a ninguna función.

do $$
declare
  v_job text;
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise warning 'Sin pg_cron: no se programan los recordatorios de después del juego, los partidos sin resultado, la limpieza de fotos ni la alerta de espacio.';
    return;
  end if;
  -- Ya las crea 20260926001300_cron_supabase.sql. Volver a correr «create extension» en Supabase dispara sus scripts de
  -- permisos y falla con 2BP01 (dependent privileges exist): solo se crean si faltan.
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension pg_cron with schema pg_catalog;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    if exists (select 1 from pg_available_extensions where name = 'pg_net') then
      if to_regnamespace('extensions') is not null then
        create extension pg_net with schema extensions;
      else
        create extension pg_net;
      end if;
    else
      raise warning 'Sin pg_net: la limpieza de fotos se programa pero no llama a purge-photos.';
    end if;
  end if;

  foreach v_job in array array['mm-despues-del-juego', 'mm-partidos-sin-resultado', 'mm-limpiar-fotos', 'mm-alerta-espacio'] loop
    if exists (select 1 from cron.job where jobname = v_job) then
      perform cron.unschedule(v_job);
    end if;
  end loop;

  perform cron.schedule('mm-despues-del-juego', '0 13 * * *', 'select private.remind_after_bowling()');
  perform cron.schedule('mm-partidos-sin-resultado', '17 * * * *', 'select private.remind_missing_results()');
  -- 150 s: lo más que dura una Edge Function en el plan gratis.
  perform cron.schedule('mm-limpiar-fotos', '30 8 * * *', $cmd$select private.kick_function('purge-photos', '{}'::jsonb, 150000)$cmd$);
  perform cron.schedule('mm-alerta-espacio', '0 12 * * *', 'select private.check_storage_alert()');
end $$;
