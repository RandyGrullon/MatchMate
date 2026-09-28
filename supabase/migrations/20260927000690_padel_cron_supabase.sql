-- MatchMate · Pádel · Solo Supabase (el cargador de PGlite salta los archivos que terminan en _supabase.sql).
-- El aviso «Partido hoy a las 8:00 pm, Cancha 2» ya no es solo del pádel: es el de todos los deportes de partidos,
-- private.match_reminders (20260927001200_avisos.sql), y lo programa 20260927001290_avisos_supabase.sql cada
-- 15 minutos con los demás recordatorios (tarea 'mm-partidos', que llama a private.cron_match_reminders()).
-- Aquí ya no se programa nada: la función de esa tarea se crea más adelante. Si una base tenía la tarea vieja
-- 'mm-padel-partidos', se quita (lo hace también 20260927001290 en una base donde esto ya había corrido).

do $$
begin
  if to_regclass('cron.job') is null then
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'mm-padel-partidos') then
    perform cron.unschedule('mm-padel-partidos');
  end if;
end $$;
