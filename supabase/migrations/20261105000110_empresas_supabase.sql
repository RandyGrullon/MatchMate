-- MatchMate · Empresas · Solo Supabase (el cargador de PGlite salta los archivos que terminan en _supabase.sql).
-- Storage de las fotos de los espacios deportivos (20261105000100_empresas.sql), en el mismo estilo que los buckets de
-- la red social (20261009000110_red_social_supabase.sql). tests/sql/empresas.test.ts corre este archivo en PGlite con
-- el storage.objects mínimo del shim para probar las políticas.
--
-- Bucket público 'venues' (cualquiera con el link ve la foto: es para mostrar la cancha), 512 kB, solo WebP o JPEG:
-- '<cuenta>/<uuid>.webp|jpg'. add_venue_photo la enlaza a su espacio. La app sube la foto ANTES de la RPC y nunca
-- reemplaza un archivo (sin UPDATE: cada foto nueva es un archivo nuevo).
--
-- Políticas (la cuenta sin bloquear por el superadmin, dueña de una empresa que no esté suspendida, solo dentro de su
-- carpeta '<su uid>/' y con la forma de la ruta):
-- - subir: '<uid>/<uuid>.webp|jpg';
-- - borrar: lo de su carpeta (la app borra la foto que acaba de subir si la RPC falló);
-- - leer por la API: lo de su carpeta (Storage lo pide para devolver la fila al subir y para borrar).
-- Lo que deja de usarse (foto quitada, espacio, empresa o cuenta borrados) lo encola la base en
-- private.storage_purge_queue ('venues') y lo borra la Edge Function purge-photos (service_role).

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Sin esquema storage: se salta el bucket venues y sus políticas';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('venues', 'venues', true, 524288, array['image/webp', 'image/jpeg'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                                 allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists mm_venues_read on storage.objects;
  drop policy if exists mm_venues_upload on storage.objects;
  drop policy if exists mm_venues_delete on storage.objects;

  create policy mm_venues_read on storage.objects for select to authenticated using (
    bucket_id = 'venues'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.blocked_at is null));

  create policy mm_venues_upload on storage.objects for insert to authenticated with check (
    bucket_id = 'venues'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$')
    and exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.blocked_at is null)
    and (select private.can_upload_venue_photo()));

  create policy mm_venues_delete on storage.objects for delete to authenticated using (
    bucket_id = 'venues'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.blocked_at is null));
end $$;
