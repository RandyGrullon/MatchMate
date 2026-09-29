-- MatchMate · Logo de ligas y torneos · Solo Supabase (el cargador de PGlite salta los archivos que terminan en
-- _supabase.sql). Storage del logo: bucket `logos`, en el mismo estilo que 20260926001100_storage_supabase.sql.
-- tests/sql/logos.test.ts corre este archivo en PGlite con un storage.objects de mentira para probar las políticas.
--
-- Cómo lo usa la app (src/lib/logos.ts):
-- - comprime el logo (cuadrado de 256 px sobre blanco, WebP o JPEG, ≤ 120 kB), reserva la ruta '<liga>/<uuid>.webp'
--   (o '.jpg') con begin_logo_upload (20260929001000_sueltos_logos.sql: admin de la liga, 30 por día) y la sube;
--   después llama set_league_logo con esa ruta y borra el anterior que devuelve;
-- - lo muestra con la URL pública (getPublicUrl): el bucket es público, cualquiera con el link lo ve (un logo no es un
--   dato privado; la página de privacidad lo dice);
-- - nunca reemplaza un archivo (sin UPDATE: cada logo nuevo es un archivo nuevo, así no hay caché vieja).
--
-- Políticas:
-- - subir: dueño o admin de la liga (o superadmin), sin bloquear, solo en una ruta '<liga>/<uuid>.webp|.jpg|.png' que
--   reservó con begin_logo_upload (private.can_upload_logo_path): nadie sube archivos sin pasar por ese límite;
-- - borrar: los admins de la liga sin bloquear (private.photo_admin_leagues, como mm_scoreboards_delete) y, de lo que
--   ya no usa nadie (en private.storage_purge_queue: un logo cambiado o quitado, el de una liga borrada, una reserva
--   vencida), cualquier cuenta sin bloquear: así el teléfono borra el logo después de borrar la liga
--   (private.can_remove_logo_path);
-- - leer por la API: lo mismo que borrar. La URL pública no la necesita, pero Storage pide poder leer la fila para
--   borrarla (remove) y para devolverla al subir; nadie más lista la carpeta.
-- Lo que queda en la cola sin borrar lo vacía después el servidor (service_role), como las fotos.

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Sin esquema storage: se saltan el bucket logos y sus políticas';
    return;
  end if;

  -- Bucket público, 256 kB por archivo, solo WebP, JPEG o PNG (el logo guardado pesa ≤ 120 kB).
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('logos', 'logos', true, 262144, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                                 allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists mm_logos_read on storage.objects';
  execute 'drop policy if exists mm_logos_upload on storage.objects';
  execute 'drop policy if exists mm_logos_delete on storage.objects';

  -- Leer por la API (listar, borrar, la fila que devuelve la subida): lo mismo que borrar. La carpeta es el id de la
  -- liga: '<liga>/<uuid>.webp'.
  execute $p$
    create policy mm_logos_read on storage.objects for select to authenticated using (
      bucket_id = 'logos' and private.can_remove_logo_path(name))
  $p$;

  -- Subir: dueño o admin de la liga sin bloquear, solo en una ruta que reservó (begin_logo_upload).
  execute $p$
    create policy mm_logos_upload on storage.objects for insert to authenticated with check (
      bucket_id = 'logos' and private.can_upload_logo_path(name))
  $p$;

  -- Borrar: los admins de la liga, si su cuenta no está bloqueada, y lo que ya está en la cola de Storage. Sin UPDATE:
  -- no se reemplaza nada.
  execute $p$
    create policy mm_logos_delete on storage.objects for delete to authenticated using (
      bucket_id = 'logos' and private.can_remove_logo_path(name))
  $p$;
end $$;

-- Limpieza diaria de las reservas de subida que no se usaron (private.logo_uploads_cleanup: van a la cola de
-- Storage). A las 4:50 am de Santo Domingo (08:50 UTC), después de mm-consola-limpieza.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise warning 'Sin pg_cron: no se programa la limpieza de las reservas de logos.';
    return;
  end if;
  -- Ya la crea 20260926001300_cron_supabase.sql. Volver a correr «create extension» en Supabase dispara sus scripts de
  -- permisos y falla con 2BP01 (dependent privileges exist): solo se crea si falta.
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension pg_cron with schema pg_catalog;
  end if;
  -- cron.schedule con un nombre que ya existe lo reemplaza: correr esto otra vez no duplica nada.
  perform cron.schedule('mm-logos-limpieza', '50 8 * * *', 'select private.logo_uploads_cleanup()');
end $$;
