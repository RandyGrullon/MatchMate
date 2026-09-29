-- MatchMate · Insignias · Solo Supabase (el cargador de PGlite salta los archivos que terminan en _supabase.sql).
-- Programa el motor de las insignias (docs/insignias.md §3.1). Las funciones que corren están en
-- 20260929001110_insignias_motor.sql (con pruebas en PGlite); aquí solo se programan, con pg_cron como
-- 20260926001300_cron_supabase.sql:
--
-- - mm-insignias, cada 10 minutos: private.cron_badges() manda los avisos agrupados que ya tocan
--   (private.badge_send_notices) y, si hay trabajos vencidos en private.badge_queue, llama a la Edge Function
--   `insignias` con pg_net (private.kick_badges). La función toma hasta 25, corre el motor y, si queda cola, la base
--   la vuelve a llamar (public.badge_finish).
-- - mm-insignias-diario, cada día a las 04:30 UTC (00:30 de Santo Domingo): private.badges_daily(now()) sube a
--   firmes las provisionales de 7 días, encola los podios de boliche, las noches cerradas, la foto de las escaleras,
--   los meses, los años y las cuentas con algo nuevo, recalcula la rareza, limpia y llama a la función si quedó cola.
--
-- Usa los mismos secretos de Vault que send-push ('project_url' y 'cron_secret') y la función el mismo CRON_SECRET
-- (supabase/functions/insignias/README.md). Sin esos secretos las tareas corren igual (los avisos salen, la rareza
-- se calcula) pero nadie corre el motor. Correr esto otra vez no duplica nada: primero se quitan las tareas por nombre.

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise warning 'Sin pg_cron: no se programa el motor de las insignias (la cola se llena pero nadie la corre).';
    return;
  end if;
  -- Ya la crea 20260926001300_cron_supabase.sql. Volver a correr «create extension» en Supabase dispara sus scripts de
  -- permisos y falla con 2BP01 (dependent privileges exist): solo se crea si falta.
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension pg_cron with schema pg_catalog;
  end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise warning 'Sin pg_net: las insignias se encolan pero nadie llama a la Edge Function insignias.';
  end if;

  if exists (select 1 from cron.job where jobname = 'mm-insignias') then
    perform cron.unschedule('mm-insignias');
  end if;
  if exists (select 1 from cron.job where jobname = 'mm-insignias-diario') then
    perform cron.unschedule('mm-insignias-diario');
  end if;
  perform cron.schedule('mm-insignias', '*/10 * * * *', 'select private.cron_badges()');
  perform cron.schedule('mm-insignias-diario', '30 4 * * *', 'select private.badges_daily(now())');
end $$;
