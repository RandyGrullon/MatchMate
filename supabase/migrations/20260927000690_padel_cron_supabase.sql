-- MatchMate · Pádel · Solo Supabase (el cargador de PGlite salta los archivos que terminan en _supabase.sql).
-- Programa el aviso «Partido hoy a las 8:00 pm, Cancha 2» (private.padel_match_reminders, en
-- 20260927000600_padel.sql, con pruebas en PGlite) cada 15 minutos. La función llama a send-push si encoló algo.
-- Usa pg_cron y pg_net como 20260926001300_cron_supabase.sql (mismos secretos de Vault).

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise warning 'Sin pg_cron: no se programan los avisos de partidos de pádel.';
    return;
  end if;
  create extension if not exists pg_cron with schema pg_catalog;
  -- cron.schedule con un nombre que ya existe lo reemplaza: correr esto otra vez no duplica nada.
  perform cron.schedule('mm-padel-partidos', '*/15 * * * *', 'select private.padel_match_reminders()');
end $$;
