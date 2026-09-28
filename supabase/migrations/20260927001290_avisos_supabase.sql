-- MatchMate · Avisos · Solo Supabase (el cargador de PGlite salta los archivos que terminan en _supabase.sql).
-- Programa cada 15 minutos private.cron_match_reminders() (20260927001200_avisos.sql, con pruebas en PGlite):
-- los recordatorios de los partidos de todos los deportes, de las rondas de golf, los encuentros de natación y las
-- noches de americano. Reemplaza la tarea 'mm-padel-partidos' (solo pádel) que programaba antes
-- 20260927000690_padel_cron_supabase.sql: si quedó de antes, se quita. Usa pg_cron y pg_net como
-- 20260926001300_cron_supabase.sql (mismos secretos de Vault para llamar a send-push).

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise warning 'Sin pg_cron: no se programan los recordatorios de partidos, golf, natación ni noches.';
    return;
  end if;
  -- Ya la crea 20260926001300_cron_supabase.sql. Volver a correr «create extension» en Supabase dispara sus scripts de
  -- permisos y falla con 2BP01 (dependent privileges exist): solo se crea si falta.
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension pg_cron with schema pg_catalog;
  end if;
  if exists (select 1 from cron.job where jobname = 'mm-padel-partidos') then
    perform cron.unschedule('mm-padel-partidos');
  end if;
  -- cron.schedule con un nombre que ya existe lo reemplaza: correr esto otra vez no duplica nada.
  perform cron.schedule('mm-partidos', '*/15 * * * *', 'select private.cron_match_reminders()');
end $$;
