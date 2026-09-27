-- MatchMate · 0C · Solo Supabase (el cargador local de PGlite salta los archivos que terminan en _supabase.sql).
-- Storage de las fotos del marcador: bucket `scoreboards`. Reemplaza la parte de Storage de
-- 20260926000700_realtime_storage_supabase.sql (mismos nombres de política: aquí se borran y se crean de nuevo),
-- así esta es la versión que vale. Se prueba con pgTAP (`supabase test db`) y en staging.
--
-- Cómo lo usa la app (src/lib/photos.ts):
-- - sube el archivo a '<liga>/<foto>.webp' (o '.jpg' con image/jpeg si el navegador no sabe hacer WebP, como
--   Safari) ANTES de la RPC que registra la foto (submit_games, save_verified_games, add_photo) con el mismo id;
-- - la ve con una URL firmada de 1 h (createSignedUrl), que pide la política de lectura;
-- - nunca reemplaza un archivo (sin UPDATE; un reintento con el mismo id da 409 y cuenta como ya subido);
-- - borrar: delete_old_photos devuelve las rutas y el admin las quita, o la Edge Function purge-photos
--   (service_role, salta las políticas) vacía private.storage_purge_queue. Nunca por SQL.

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Sin esquema storage: se saltan las políticas del bucket scoreboards';
    return;
  end if;

  -- Bucket privado, 1 MB por archivo, solo WebP o JPEG (la foto guardada pesa ~110 kB).
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('scoreboards', 'scoreboards', false, 1048576, array['image/webp', 'image/jpeg'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                                 allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists mm_scoreboards_read on storage.objects';
  execute 'drop policy if exists mm_scoreboards_upload on storage.objects';
  execute 'drop policy if exists mm_scoreboards_delete on storage.objects';

  -- Ver (y firmar URLs): quien ve la liga (pública: cualquiera; privada: sus miembros; el superadmin).
  -- La carpeta es el id de la liga: '<liga>/<foto>.webp'.
  execute $p$
    create policy mm_scoreboards_read on storage.objects for select to anon, authenticated using (
      bucket_id = 'scoreboards'
      and (storage.foldername(name))[1] in (select l::text from private.readable_leagues() l))
  $p$;

  -- Subir: admin, anotador o miembro con jugador, en una liga sin menores (private.can_upload_photo), y solo con
  -- la forma de ruta que registran las RPC ('<liga>/<uuid>.webp|.jpg', private.can_upload_photo_path).
  execute $p$
    create policy mm_scoreboards_upload on storage.objects for insert to authenticated with check (
      bucket_id = 'scoreboards' and private.can_upload_photo_path(name))
  $p$;

  -- Borrar: los admins de la liga (delete_old_photos devuelve las rutas). Sin UPDATE: no se reemplaza nada.
  execute $p$
    create policy mm_scoreboards_delete on storage.objects for delete to authenticated using (
      bucket_id = 'scoreboards'
      and (storage.foldername(name))[1] in (select l::text from private.admin_leagues() l))
  $p$;
end $$;
