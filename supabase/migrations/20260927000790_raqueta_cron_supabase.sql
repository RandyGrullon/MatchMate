-- MatchMate · Tenis y pickleball · Solo Supabase (el cargador de PGlite salta los archivos que terminan en _supabase.sql).
-- Aplica cada 15 minutos los plazos vencidos de las escaleras (W.O. a favor del retador) y los resultados que ya
-- cuentan a las 48 h: private.ladder_expire_all (20260927000700_raqueta.sql, con pruebas en PGlite). Bloquea cada
-- escalera antes de moverla, como las RPC, para no cruzarse con ellas ni con los resultados que llegan a la vez. Los avisos
-- de los retos salen al crear y al aceptar (send-push). Usa pg_cron como 20260926001300_cron_supabase.sql.

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise warning 'Sin pg_cron: los plazos de las escaleras se aplican solo al abrir la pantalla.';
    return;
  end if;
  create extension if not exists pg_cron with schema pg_catalog;
  -- cron.schedule con un nombre que ya existe lo reemplaza: correr esto otra vez no duplica nada.
  perform cron.schedule('mm-escaleras', '*/15 * * * *', 'select private.ladder_expire_all()');
end $$;
