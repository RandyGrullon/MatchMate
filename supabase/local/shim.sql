-- Shim de Supabase para PGlite (pruebas SQL y backend local). NO se corre en Supabase: allá esto ya existe.
--
-- Crea lo mínimo que las migraciones esperan encontrar:
-- - los roles anon, authenticated y service_role (service_role salta la RLS, como en Supabase);
-- - los privilegios por defecto que Supabase da en `public` (todo abierto para anon y authenticated):
--   así la primera migración, que los quita, se prueba igual que en producción;
-- - el esquema `auth` con la tabla `users` y las funciones uid(), role() y jwt(), que leen
--   `request.jwt.claims` como lo hace PostgREST;
-- - un esquema `storage` mínimo (buckets y objects) para el backend local.
--
-- PGlite corre como superusuario: para que la RLS aplique hay que actuar como un rol, dentro de una transacción:
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
--   ... ;
--   commit;

-- ---------- Roles ----------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- Lo que Supabase deja por defecto en public (las migraciones de MatchMate lo quitan para anon y authenticated).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ---------- Auth ----------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Las columnas que usan seed.sql y las pruebas (las de texto van con '' como en GoTrue, nunca null).
create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  confirmation_token varchar(255) default '',
  recovery_token varchar(255) default '',
  email_change_token_new varchar(255) default '',
  email_change varchar(255) default '',
  is_anonymous boolean not null default false
);
create unique index if not exists users_email_key on auth.users (email);

-- Como en Supabase: el sub del JWT que PostgREST deja en request.jwt.claims.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

-- ---------- Storage (mínimo) ----------
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);

-- Carpetas de la ruta ('liga/foto.webp' -> {liga}), como storage.foldername de Supabase.
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

grant all on storage.buckets, storage.objects to service_role;
