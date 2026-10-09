-- MatchMate · Red social · Solo Supabase (el cargador de PGlite salta los archivos que terminan en _supabase.sql).
-- Storage de las fotos de la red social (docs/red-social.md), en el mismo estilo que 20260929001010_logos_supabase.sql.
-- tests/sql/red-social.test.ts corre este archivo en PGlite con el storage.objects mínimo del shim para probar las
-- políticas.
--
-- Buckets públicos (cualquiera con el link ve la foto; las rutas llevan uuid: no se adivinan), solo WebP o JPEG:
-- - 'avatars' (256 kB): la foto de perfil, '<cuenta>/<uuid>.webp|jpg'. set_avatar la enlaza
--   (20261009000100_red_social.sql);
-- - 'posts' (512 kB): la foto de una publicación, '<cuenta>/<publicación>.webp|jpg'. create_post la enlaza.
-- La app sube la foto ANTES de la RPC y nunca reemplaza un archivo (sin UPDATE: cada foto nueva es un archivo nuevo).
--
-- Políticas (la cuenta sin bloquear por el superadmin, solo dentro de su carpeta '<su uid>/' y con la forma de la ruta):
-- - subir: '<uid>/<uuid>.webp|jpg';
-- - borrar: lo de su carpeta (la app borra la foto que acaba de subir si la RPC falló, o la de una publicación suya);
-- - leer por la API: lo de su carpeta. La URL pública no la necesita, pero Storage pide poder leer la fila para
--   devolverla al subir y para borrarla (remove); nadie más lista las carpetas.
-- Lo que deja de usarse (publicación borrada, foto de perfil cambiada o quitada, cuenta borrada) lo encola la base en
-- private.storage_purge_queue ('avatars' o 'posts') y lo borra la Edge Function purge-photos (service_role).

do $$
declare
  v_bucket text;
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Sin esquema storage: se saltan los buckets avatars y posts y sus políticas';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 262144, array['image/webp', 'image/jpeg'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                                 allowed_mime_types = excluded.allowed_mime_types;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('posts', 'posts', true, 524288, array['image/webp', 'image/jpeg'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                                 allowed_mime_types = excluded.allowed_mime_types;

  foreach v_bucket in array array['avatars', 'posts'] loop
    execute format('drop policy if exists %I on storage.objects', 'mm_' || v_bucket || '_read');
    execute format('drop policy if exists %I on storage.objects', 'mm_' || v_bucket || '_upload');
    execute format('drop policy if exists %I on storage.objects', 'mm_' || v_bucket || '_delete');

    -- Leer por la API: lo de su carpeta, con la cuenta sin bloquear.
    execute format($p$
      create policy %I on storage.objects for select to authenticated using (
        bucket_id = %L
        and (storage.foldername(name))[1] = (select auth.uid())::text
        and exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.blocked_at is null))
    $p$, 'mm_' || v_bucket || '_read', v_bucket);

    -- Subir: solo '<uid>/<uuid>.webp|jpg' en su carpeta, con la cuenta sin bloquear.
    execute format($p$
      create policy %I on storage.objects for insert to authenticated with check (
        bucket_id = %L
        and (storage.foldername(name))[1] = (select auth.uid())::text
        and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$')
        and exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.blocked_at is null))
    $p$, 'mm_' || v_bucket || '_upload', v_bucket);

    -- Borrar: lo de su carpeta, con la cuenta sin bloquear. Sin UPDATE: no se reemplaza nada.
    execute format($p$
      create policy %I on storage.objects for delete to authenticated using (
        bucket_id = %L
        and (storage.foldername(name))[1] = (select auth.uid())::text
        and exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.blocked_at is null))
    $p$, 'mm_' || v_bucket || '_delete', v_bucket);
  end loop;
end $$;
