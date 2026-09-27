-- MatchMate · Consola del superadmin · Solo Supabase (el cargador de PGlite salta los archivos que terminan en
-- _supabase.sql). Dos cosas, cada una revisa primero que exista lo que usa:
--
-- 1. pg_cron: la limpieza de la consola (private.console_cleanup, en 20260927001100_consola.sql, con pruebas en
--    PGlite) pasa los días vistos de hace más de 35 días a números por día y borra los de hace más de 400.
--    Corre a diario a las 4:40 am de Santo Domingo (08:40 UTC), después de mm-limpieza.
-- 2. Storage: una cuenta bloqueada tampoco borra archivos de fotos. La política mm_scoreboards_delete (de
--    20260926001100_storage_supabase.sql) se crea de nuevo con private.photo_admin_leagues() en vez de
--    private.admin_leagues(): las mismas ligas, ninguna si está bloqueada. tests/sql/consola.test.ts corre este
--    archivo en PGlite para probarla.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise warning 'Sin pg_cron: no se programa la limpieza de la consola.';
    return;
  end if;
  create extension if not exists pg_cron with schema pg_catalog;
  -- cron.schedule con un nombre que ya existe lo reemplaza: correr esto otra vez no duplica nada.
  perform cron.schedule('mm-consola-limpieza', '40 8 * * *', 'select private.console_cleanup()');
end $$;

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Sin esquema storage: no se cambia la política para borrar fotos';
    return;
  end if;
  execute 'drop policy if exists mm_scoreboards_delete on storage.objects';
  -- Borrar: los admins de la liga (delete_old_photos devuelve las rutas), si su cuenta no está bloqueada.
  execute $p$
    create policy mm_scoreboards_delete on storage.objects for delete to authenticated using (
      bucket_id = 'scoreboards'
      and (storage.foldername(name))[1] in (select l::text from private.photo_admin_leagues() l))
  $p$;
end $$;
