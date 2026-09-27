-- MatchMate · Solo Supabase (el cargador local de PGlite salta los archivos que terminan en _supabase.sql).
-- Políticas de Realtime (canales privados) y de Storage (bucket scoreboards). Aquí no hay pruebas de PGlite:
-- se prueban con pgTAP (`supabase test db`) y en staging. Cada parte revisa que exista lo que usa.

-- ---------- Realtime: quién escucha cada canal privado ----------
-- event:<id> y league:<id>: quien ve la liga (readable_leagues). user:<id>: solo esa cuenta.
-- Sin política de INSERT: los teléfonos no pueden mandar mensajes falsos; solo los triggers (realtime.send).
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists mm_realtime_read on realtime.messages';
    execute $p$
      create policy mm_realtime_read on realtime.messages for select to anon, authenticated using (
        realtime.messages.extension = 'broadcast'
        and (
          (split_part((select realtime.topic()), ':', 1) = 'event'
            and exists (select 1 from public.events e
                         where e.id::text = split_part((select realtime.topic()), ':', 2)
                           and e.league_id in (select private.readable_leagues())))
          or (split_part((select realtime.topic()), ':', 1) = 'league'
            and split_part((select realtime.topic()), ':', 2) in (select l::text from private.readable_leagues() l))
          or ((select realtime.topic()) = 'user:' || (select auth.uid())::text)
        ))
    $p$;
  end if;
end $$;

-- ---------- Storage: fotos de los marcadores ----------
-- Bucket privado, 1 MB por archivo, solo WebP o JPEG. Ruta '<liga>/<foto>.webp|.jpg' (la misma de photos.path).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('scoreboards', 'scoreboards', false, 1048576, array['image/webp', 'image/jpeg'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                                   allowed_mime_types = excluded.allowed_mime_types;
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists mm_scoreboards_read on storage.objects';
    execute 'drop policy if exists mm_scoreboards_upload on storage.objects';
    execute 'drop policy if exists mm_scoreboards_delete on storage.objects';
    -- Ver: quien ve la liga.
    execute $p$
      create policy mm_scoreboards_read on storage.objects for select to anon, authenticated using (
        bucket_id = 'scoreboards'
        and (storage.foldername(name))[1] in (select l::text from private.readable_leagues() l))
    $p$;
    -- Subir: admin, anotador o miembro con jugador, en una liga sin menores (can_upload_photo_path).
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
  end if;
end $$;
