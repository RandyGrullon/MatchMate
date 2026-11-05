-- MatchMate · Empresas: los que tienen canchas o espacios deportivos (docs/empresas.md).
--
-- Una cuenta puede registrar su empresa (una por cuenta) sin perder su cuenta de jugador: elige en qué modo ve la app
-- (profiles.account_mode: 'player' o 'business') y cambia cuando quiera. La empresa tiene sus espacios (venues: una
-- cancha, una bolera, una piscina…), cada uno de un deporte con sus datos (details: lo que pide ese deporte, ver
-- src/lib/venues/fields.ts), y sus fotos (bucket público 'venues', 20261105000110_empresas_supabase.sql).
--
-- 1. Tablas: businesses (user_id = la cuenta dueña: así «Descargar mis datos» la trae sola), venues, venue_photos,
--    venue_promotions (destacar un espacio: la empresa lo pide y el superadmin lo activa con lo que pagó y hasta
--    cuándo) y leagues.venue_id (el torneo o la liga que se juega en ese espacio: para la comisión de la app).
--    Nada se lee directo: RLS activada sin políticas, todo por RPC (como los equipos).
-- 2. Lo público (también sin cuenta): search_venues y venue_detail. Solo empresas aprobadas, espacios activos y dueños
--    sin bloquear. Los destacados salen primero.
-- 3. La empresa: register_business, update_business, delete_business, my_business, save_venue, delete_venue,
--    add_venue_photo, delete_venue_photo, set_venue_cover, request_promotion, cancel_promotion, set_league_venue.
-- 4. El modo: set_account_mode (y la app lo lee con el perfil, como ui_mode).
-- 5. La consola (superadmin): admin_businesses, admin_business, admin_set_business_status, admin_set_commission,
--    admin_decide_promotion, admin_grant_promotion, admin_end_promotion. Todo queda en la auditoría ('business').
-- 6. Las fotos que dejan de usarse van a la cola de Storage ('venues') y las borra purge-photos.
-- Una empresa nueva queda 'pending' hasta que el superadmin la aprueba: así no aparecen canchas falsas.
-- Cobros: todavía no hay. El superadmin anota lo que pagó cada promoción (amount) y la comisión de cada empresa
-- (commission_pct); el cobro automático llega cuando se elija con quién cobrar.
-- Pruebas: tests/sql/empresas.test.ts.

-- =====================================================================
-- 1. Tablas
-- =====================================================================
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  -- La cuenta dueña (una empresa por cuenta). Se llama user_id para que export_my_data la traiga sola.
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  -- RNC (9 dígitos) o cédula (11), solo dígitos.
  tax_id text check (tax_id ~ '^([0-9]{9}|[0-9]{11})$'),
  phone text check (phone ~ '^\+?[0-9]{7,15}$'),
  email text check (char_length(email) <= 120 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  city text not null check (char_length(city) between 2 and 60),
  address text check (char_length(address) <= 160),
  description text check (char_length(description) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended')),
  status_note text check (char_length(status_note) <= 300),
  -- Lo que se queda la app de lo que la empresa cobre por la app (torneos, reservas): por ahora solo se anota.
  commission_pct numeric(5, 2) not null default 10 check (commission_pct between 0 and 50),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index businesses_status_idx on public.businesses (status, created_at desc);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  sport text not null references public.sport_status (id),
  name text not null check (char_length(name) between 2 and 80),
  city text not null check (char_length(city) between 2 and 60),
  address text check (char_length(address) <= 160),
  -- Lo que pide su deporte (canchas, superficie, techada…): src/lib/venues/fields.ts. Aquí solo la forma y el tamaño.
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 2000),
  -- Precio por hora en pesos (opcional).
  price_hour integer check (price_hour between 0 and 500000),
  hours text check (char_length(hours) <= 120),
  phone text check (phone ~ '^\+?[0-9]{7,15}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index venues_business_idx on public.venues (business_id);
create index venues_sport_idx on public.venues (sport, city) where active;

create table public.venue_photos (
  -- El id es el nombre del archivo: '<cuenta>/<id>.webp|jpg' en el bucket 'venues'.
  id uuid primary key,
  venue_id uuid not null references public.venues (id) on delete cascade,
  path text not null unique check (char_length(path) <= 100),
  width integer check (width between 1 and 10000),
  height integer check (height between 1 and 10000),
  -- 0 = la portada.
  position smallint not null default 0 check (position between 0 and 99),
  created_at timestamptz not null default now()
);
create index venue_photos_venue_idx on public.venue_photos (venue_id, position, created_at);

create table public.venue_promotions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'active', 'rejected', 'cancelled')),
  -- Los días que pidió la empresa (o que dio el superadmin).
  days smallint not null check (days between 1 and 365),
  starts_at timestamptz,
  ends_at timestamptz,
  -- Lo que pagó (lo anota el superadmin al activarla), en pesos.
  amount numeric(12, 2) check (amount >= 0),
  note text check (char_length(note) <= 300),
  requested_by uuid references public.profiles (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  -- La hora real (no la de la transacción): ordena bien lo que pasó con un espacio aunque sea en la misma.
  created_at timestamptz not null default clock_timestamp(),
  check (status <> 'active' or (starts_at is not null and ends_at is not null and ends_at > starts_at))
);
create index venue_promotions_venue_idx on public.venue_promotions (venue_id, status);
create index venue_promotions_active_idx on public.venue_promotions (ends_at) where status = 'active';

-- El torneo o la liga que se juega en un espacio (para la comisión de la app). Si el espacio se borra, se suelta.
alter table public.leagues add column venue_id uuid references public.venues (id) on delete set null;
create index leagues_venue_idx on public.leagues (venue_id) where venue_id is not null;

-- El modo en que la cuenta ve la app: null o 'player' (jugador, lo de siempre) o 'business' (su empresa y lo social).
alter table public.profiles
  add column account_mode text constraint profiles_account_mode_check check (account_mode in ('player', 'business'));

do $$
declare
  t text;
begin
  foreach t in array array['businesses', 'venues'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- Nada se lee directo (ni con sesión): todo por las RPC de abajo.
alter table public.businesses enable row level security;
alter table public.venues enable row level security;
alter table public.venue_photos enable row level security;
alter table public.venue_promotions enable row level security;
revoke all on public.businesses, public.venues, public.venue_photos, public.venue_promotions from anon, authenticated;

-- La auditoría de la consola lleva también las empresas.
do $$
declare
  c record;
begin
  for c in select x.conname from pg_constraint x
            where x.conrelid = 'public.admin_audit'::regclass and x.contype = 'c'
              and pg_get_constraintdef(x.oid) like '%target_type%' loop
    execute format('alter table public.admin_audit drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.admin_audit add constraint admin_audit_target_type_check
  check (target_type in ('user', 'league', 'sport', 'app', 'business'));

-- La cola de Storage lleva también las fotos de los espacios.
do $$
declare
  c record;
begin
  for c in select x.conname from pg_constraint x
            where x.conrelid = 'private.storage_purge_queue'::regclass and x.contype = 'c'
              and pg_get_constraintdef(x.oid) like '%bucket%' loop
    execute format('alter table private.storage_purge_queue drop constraint %I', c.conname);
  end loop;
end $$;
alter table private.storage_purge_queue add constraint storage_purge_queue_bucket_check
  check (bucket in ('scoreboards', 'logos', 'avatars', 'posts', 'venues'));

-- La foto de un espacio que se borra (sola, con su espacio, con la empresa o con la cuenta) va a la cola de Storage.
create function private.queue_venue_photo_purge() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.storage_purge_queue (path, bucket) values (old.path, 'venues') on conflict (path) do nothing;
  return null;
end $$;

create trigger venue_photos_purge after delete on public.venue_photos
  for each row execute function private.queue_venue_photo_purge();

-- =====================================================================
-- Ayudas
-- =====================================================================

-- Límites (los mismos de src/lib/data/business.ts).
create function private.biz_max(p_what text) returns integer
language sql immutable set search_path = '' as $$
  select case p_what when 'venues' then 30 when 'photos' then 8 when 'business_photos' then 120 else 0 end
$$;

-- Texto opcional: sin espacios alrededor, null si queda vacío; 'invalido' si pasa de p_max.
create function private.biz_text(p text, p_max integer) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text := nullif(btrim(coalesce(p, '')), '');
begin
  if v is not null and char_length(v) > p_max then
    perform private.fail('invalido');
  end if;
  return v;
end $$;

-- Teléfono: solo dígitos (y un + adelante). null si queda vacío; 'invalido' si no tiene de 7 a 15 dígitos.
create function private.biz_phone(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text := regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g');
begin
  if v = '' then
    return null;
  end if;
  if v !~ '^\+?[0-9]{7,15}$' then
    perform private.fail('invalido');
  end if;
  return v;
end $$;

-- La empresa de la cuenta de la sesión (null si no tiene).
create function private.my_business_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select b.id from public.businesses b where b.user_id = (select auth.uid())
$$;

-- El espacio está destacado ahora.
create function private.venue_featured_until(p_venue uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(p.ends_at) from public.venue_promotions p
   where p.venue_id = p_venue and p.status = 'active' and p.starts_at <= now() and p.ends_at > now()
$$;

-- Lo público de una empresa aprobada con dueño sin bloquear.
create function private.business_public(p_business uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.businesses b join public.profiles pr on pr.id = b.user_id
                  where b.id = p_business and b.status = 'approved' and pr.blocked_at is null)
$$;

create function private.venue_photos_json(p_venue uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'path', f.path, 'width', f.width, 'height', f.height)
                            order by f.position, f.created_at, f.id), '[]'::jsonb)
    from public.venue_photos f where f.venue_id = p_venue
$$;

-- Un espacio. p_private: lo que ve la empresa y el superadmin (activo, la última promoción y cuántos torneos).
create function private.venue_json(p_venue uuid, p_private boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'id', v.id, 'businessId', v.business_id, 'sport', v.sport, 'name', v.name, 'city', v.city,
           'address', v.address, 'details', v.details, 'priceHour', v.price_hour, 'hours', v.hours,
           'phone', coalesce(v.phone, b.phone), 'featuredUntil', private.venue_featured_until(v.id),
           'photos', private.venue_photos_json(v.id),
           'business', jsonb_build_object('id', b.id, 'name', b.name, 'description', b.description,
                                          'email', case when p_private then b.email end))
         || case when p_private then jsonb_build_object(
              'active', v.active,
              'leagues', (select count(*) from public.leagues l where l.venue_id = v.id)::integer,
              'promotion', (select jsonb_build_object('id', p.id, 'status', p.status, 'days', p.days,
                                                      'startsAt', p.starts_at, 'endsAt', p.ends_at, 'note', p.note,
                                                      'createdAt', p.created_at)
                              from public.venue_promotions p where p.venue_id = v.id
                             -- La pedida (esperando al superadmin), si no la activa ahora, si no la última.
                             order by (p.status = 'requested') desc, (p.status = 'active' and p.ends_at > now()) desc,
                                      greatest(p.created_at, p.decided_at) desc, p.id desc limit 1))
            else '{}'::jsonb end
    from public.venues v join public.businesses b on b.id = v.business_id
   where v.id = p_venue
$$;

-- La empresa con sus espacios (lo que ve la empresa y el superadmin).
create function private.business_json(p_business uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'id', b.id, 'name', b.name, 'taxId', b.tax_id, 'phone', b.phone, 'email', b.email, 'city', b.city,
           'address', b.address, 'description', b.description, 'status', b.status, 'statusNote', b.status_note,
           'commissionPct', b.commission_pct, 'createdAt', b.created_at, 'reviewedAt', b.reviewed_at,
           'venues', coalesce((select jsonb_agg(private.venue_json(v.id, true) order by v.created_at, v.id)
                                 from public.venues v where v.business_id = b.id), '[]'::jsonb))
    from public.businesses b where b.id = p_business
$$;

-- La cuenta de la sesión puede subir fotos al bucket 'venues': tiene empresa y no está suspendida. La llama la política
-- de Storage (20261105000110_empresas_supabase.sql) como authenticated, que no lee businesses.
create function private.can_upload_venue_photo() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.businesses b where b.user_id = (select auth.uid()) and b.status <> 'suspended')
$$;

-- =====================================================================
-- 2. Lo público
-- =====================================================================

-- Buscar espacios: por deporte, ciudad y texto (nombre del espacio o de la empresa). Destacados primero.
-- → {rows: [venue], total}.
create function public.search_venues(p_sport text default null, p_city text default null, p_search text default null,
                                     p_limit integer default 30, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sport text := nullif(btrim(coalesce(p_sport, '')), '');
  v_city text := nullif(lower(btrim(left(coalesce(p_city, ''), 60))), '');
  v_q text := nullif(lower(btrim(left(coalesce(p_search, ''), 60))), '');
  v_limit integer := private.clamp_int(p_limit, 1, 60, 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_rows jsonb;
begin
  with f as (
    select v.id, v.name, private.venue_featured_until(v.id) as featured
      from public.venues v
      join public.businesses b on b.id = v.business_id
      join public.profiles pr on pr.id = b.user_id
     where v.active and b.status = 'approved' and pr.blocked_at is null
       and (v_sport is null or v.sport = v_sport)
       and (v_city is null or lower(v.city) like '%' || private.like_escape(v_city) || '%')
       and (v_q is null or lower(v.name || ' ' || b.name) like '%' || private.like_escape(v_q) || '%')
  ), page as (
    select f.id, row_number() over (order by (f.featured is not null) desc, lower(f.name), f.id) as rn
      from f
     order by (f.featured is not null) desc, lower(f.name), f.id
     limit v_limit offset v_offset
  )
  select (select count(*) from f)::integer,
         coalesce((select jsonb_agg(private.venue_json(pg.id, false) order by pg.rn) from page pg), '[]'::jsonb)
    into v_total, v_rows;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

-- Un espacio público con los torneos y ligas públicas que se juegan ahí. null si no existe o no es público (la dueña y
-- el superadmin lo ven aunque la empresa no esté aprobada).
create function public.venue_detail(p_venue uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_business uuid;
  v_active boolean;
  v_own boolean;
begin
  select v.business_id, v.active into v_business, v_active from public.venues v where v.id = p_venue;
  if not found then
    return null;
  end if;
  v_own := coalesce(v_business = private.my_business_id(), false) or coalesce(private.is_super(), false);
  if not v_own and not (v_active and private.business_public(v_business)) then
    return null;
  end if;
  return private.venue_json(p_venue, false) || jsonb_build_object(
    'mine', v_own,
    'leagues', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'kind', l.kind, 'sport', l.sport)
                                          order by l.created_at desc)
                           from public.leagues l where l.venue_id = p_venue and l.visibility = 'public'), '[]'::jsonb));
end $$;

-- =====================================================================
-- 3. La empresa
-- =====================================================================

-- Registra la empresa de la cuenta (una por cuenta: 'duplicado' si ya tiene) y pone la app en modo empresa. Queda
-- 'pending' hasta que el superadmin la apruebe. Devuelve su id.
create function public.register_business(p_name text, p_city text, p_phone text default null, p_email text default null,
                                         p_tax_id text default null, p_address text default null,
                                         p_description text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_id uuid;
  v_name text := private.biz_text(p_name, 80);
  v_city text := private.biz_text(p_city, 60);
  v_email text := lower(private.biz_text(p_email, 120));
  v_tax text := nullif(regexp_replace(coalesce(p_tax_id, ''), '[^0-9]', '', 'g'), '');
begin
  if v_name is null or char_length(v_name) < 2 or v_city is null or char_length(v_city) < 2
     or (v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
     or (v_tax is not null and v_tax !~ '^([0-9]{9}|[0-9]{11})$') then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from public.businesses b where b.user_id = v_uid) then
    perform private.fail('duplicado');
  end if;
  insert into public.businesses (user_id, name, city, phone, email, tax_id, address, description)
  values (v_uid, v_name, v_city, private.biz_phone(p_phone), v_email, v_tax, private.biz_text(p_address, 160),
          private.biz_text(p_description, 500))
  returning id into v_id;
  update public.profiles set account_mode = 'business' where id = v_uid;
  return v_id;
end $$;

-- Cambia los datos de la empresa. Una rechazada vuelve a revisión al corregirla.
create function public.update_business(p_name text, p_city text, p_phone text default null, p_email text default null,
                                       p_tax_id text default null, p_address text default null,
                                       p_description text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_id uuid;
  v_status text;
  v_name text := private.biz_text(p_name, 80);
  v_city text := private.biz_text(p_city, 60);
  v_email text := lower(private.biz_text(p_email, 120));
  v_tax text := nullif(regexp_replace(coalesce(p_tax_id, ''), '[^0-9]', '', 'g'), '');
begin
  select b.id, b.status into v_id, v_status from public.businesses b where b.user_id = v_uid for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  if v_name is null or char_length(v_name) < 2 or v_city is null or char_length(v_city) < 2
     or (v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
     or (v_tax is not null and v_tax !~ '^([0-9]{9}|[0-9]{11})$') then
    perform private.fail('invalido');
  end if;
  update public.businesses b
     set name = v_name, city = v_city, phone = private.biz_phone(p_phone), email = v_email, tax_id = v_tax,
         address = private.biz_text(p_address, 160), description = private.biz_text(p_description, 500),
         status = case when v_status = 'rejected' then 'pending' else v_status end,
         status_note = case when v_status = 'rejected' then null else b.status_note end
   where b.id = v_id;
  return private.business_json(v_id);
end $$;

-- Borra la empresa con sus espacios y fotos (las fotos van a la cola de Storage) y vuelve la app a modo jugador.
create function public.delete_business() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  delete from public.businesses b where b.user_id = v_uid;
  if not found then
    return false;
  end if;
  update public.profiles set account_mode = null where id = v_uid;
  return true;
end $$;

-- La empresa de la cuenta con sus espacios (null si no tiene).
create function public.my_business() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_id uuid;
begin
  select b.id into v_id from public.businesses b where b.user_id = v_uid;
  if v_id is null then
    return null;
  end if;
  return private.business_json(v_id);
end $$;

-- Crea (p_id null) o cambia un espacio de la empresa de la cuenta. p_details: un objeto con valores número, texto
-- corto o sí/no (lo que pide cada deporte lo revisa la app con src/lib/venues/fields.ts). Hasta 30 espacios.
create function public.save_venue(p_id uuid, p_sport text, p_name text, p_city text, p_details jsonb,
                                  p_address text default null, p_price_hour integer default null,
                                  p_hours text default null, p_phone text default null, p_active boolean default true)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_business uuid;
  v_id uuid := p_id;
  v_name text := private.biz_text(p_name, 80);
  v_city text := private.biz_text(p_city, 60);
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  k text;
  v jsonb;
begin
  select b.id into v_business from public.businesses b where b.user_id = v_uid and b.status <> 'suspended';
  if v_business is null then
    perform private.fail('no_permitido');
  end if;
  if v_name is null or char_length(v_name) < 2 or v_city is null or char_length(v_city) < 2
     or p_sport is null or not exists (select 1 from public.sport_status s where s.id = p_sport)
     or jsonb_typeof(v_details) <> 'object' or pg_column_size(v_details) > 2000
     or (p_price_hour is not null and p_price_hour not between 0 and 500000) then
    perform private.fail('invalido');
  end if;
  for k, v in select * from jsonb_each(v_details) loop
    if k !~ '^[a-zA-Z]{1,20}$' or jsonb_typeof(v) not in ('number', 'string', 'boolean')
       or (jsonb_typeof(v) = 'string' and char_length(v #>> '{}') > 30) then
      perform private.fail('invalido');
    end if;
  end loop;
  if v_id is null then
    if (select count(*) from public.venues x where x.business_id = v_business) >= private.biz_max('venues') then
      perform private.fail('limite');
    end if;
    insert into public.venues (business_id, sport, name, city, address, details, price_hour, hours, phone, active)
    values (v_business, p_sport, v_name, v_city, private.biz_text(p_address, 160), v_details, p_price_hour,
            private.biz_text(p_hours, 120), private.biz_phone(p_phone), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.venues x
       set sport = p_sport, name = v_name, city = v_city, address = private.biz_text(p_address, 160),
           details = v_details, price_hour = p_price_hour, hours = private.biz_text(p_hours, 120),
           phone = private.biz_phone(p_phone), active = coalesce(p_active, true)
     where x.id = v_id and x.business_id = v_business;
    if not found then
      perform private.fail('no_existe');
    end if;
  end if;
  return private.venue_json(v_id, true);
end $$;

-- Borra un espacio de la empresa (sus fotos van a la cola de Storage; sus torneos se quedan, sin espacio).
create function public.delete_venue(p_venue uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  delete from public.venues v
   using public.businesses b
   where v.id = p_venue and b.id = v.business_id and b.user_id = v_uid;
  return found;
end $$;

-- Enlaza una foto ya subida a 'venues' ('<cuenta>/<p_photo>.webp|jpg'). Hasta 8 por espacio y 120 por empresa. Va
-- al final (la primera es la portada).
create function public.add_venue_photo(p_venue uuid, p_photo uuid, p_path text, p_width integer default null,
                                       p_height integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_business uuid;
  v_n integer;
begin
  select v.business_id into v_business
    from public.venues v join public.businesses b on b.id = v.business_id
   where v.id = p_venue and b.user_id = v_uid and b.status <> 'suspended';
  if v_business is null then
    perform private.fail('no_permitido');
  end if;
  if p_photo is null or p_path is null
     or p_path !~ ('^' || v_uid::text || '/' || p_photo::text || '\.(webp|jpg)$')
     or (p_width is not null and p_width not between 1 and 10000)
     or (p_height is not null and p_height not between 1 and 10000) then
    perform private.fail('invalido');
  end if;
  select count(*) into v_n from public.venue_photos f where f.venue_id = p_venue;
  if v_n >= private.biz_max('photos')
     or (select count(*) from public.venue_photos f join public.venues v on v.id = f.venue_id
          where v.business_id = v_business) >= private.biz_max('business_photos') then
    perform private.fail('limite');
  end if;
  insert into public.venue_photos (id, venue_id, path, width, height, position)
  values (p_photo, p_venue, p_path, p_width, p_height,
          coalesce((select max(f.position) + 1 from public.venue_photos f where f.venue_id = p_venue), 0))
  on conflict (id) do nothing;
  return private.venue_photos_json(p_venue);
end $$;

-- Quita una foto de un espacio de la empresa (el archivo va a la cola de Storage).
create function public.delete_venue_photo(p_photo uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_venue uuid;
begin
  select f.venue_id into v_venue
    from public.venue_photos f join public.venues v on v.id = f.venue_id join public.businesses b on b.id = v.business_id
   where f.id = p_photo and b.user_id = v_uid;
  if v_venue is null then
    perform private.fail('no_existe');
  end if;
  delete from public.venue_photos f where f.id = p_photo;
  return private.venue_photos_json(v_venue);
end $$;

-- Pone una foto como portada (la primera); las demás siguen en su orden.
create function public.set_venue_cover(p_photo uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_venue uuid;
begin
  select f.venue_id into v_venue
    from public.venue_photos f join public.venues v on v.id = f.venue_id join public.businesses b on b.id = v.business_id
   where f.id = p_photo and b.user_id = v_uid;
  if v_venue is null then
    perform private.fail('no_existe');
  end if;
  with ordered as (
    select f.id, row_number() over (order by (f.id = p_photo) desc, f.position, f.created_at, f.id) - 1 as pos
      from public.venue_photos f where f.venue_id = v_venue
  )
  update public.venue_photos f set position = o.pos from ordered o where f.id = o.id and f.position <> o.pos;
  return private.venue_photos_json(v_venue);
end $$;

-- Pide destacar un espacio (sale primero en «Dónde jugar») por p_days días. Solo empresas aprobadas; una pedida a
-- la vez por espacio ('duplicado'). La activa el superadmin (admin_decide_promotion) con lo que se pagó.
create function public.request_promotion(p_venue uuid, p_days integer, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not exists (select 1 from public.venues v join public.businesses b on b.id = v.business_id
                  where v.id = p_venue and b.user_id = v_uid and b.status = 'approved') then
    perform private.fail('no_permitido');
  end if;
  if p_days is null or p_days not between 1 and 365 then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from public.venue_promotions p where p.venue_id = p_venue and p.status = 'requested') then
    perform private.fail('duplicado');
  end if;
  insert into public.venue_promotions (venue_id, days, note, requested_by)
  values (p_venue, p_days, private.biz_text(p_note, 300), v_uid);
  return private.venue_json(p_venue, true);
end $$;

-- Retira lo que pidió (todavía sin decidir).
create function public.cancel_promotion(p_promotion uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  update public.venue_promotions p set status = 'cancelled', decided_at = clock_timestamp()
    from public.venues v join public.businesses b on b.id = v.business_id
   where p.id = p_promotion and v.id = p.venue_id and b.user_id = v_uid and p.status = 'requested';
  return found;
end $$;

-- El torneo o la liga se juega en un espacio de la empresa de la cuenta (o se suelta con p_venue null). Hay que ser
-- admin de la liga y dueña del espacio.
create function public.set_league_venue(p_league uuid, p_venue uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform private.require_admin(p_league);
  if p_venue is not null and not exists (select 1 from public.venues v join public.businesses b on b.id = v.business_id
                                          where v.id = p_venue and b.user_id = v_uid and b.status <> 'suspended') then
    perform private.fail('no_permitido');
  end if;
  update public.leagues l set venue_id = p_venue where l.id = p_league and l.venue_id is distinct from p_venue;
  return true;
end $$;

-- =====================================================================
-- 4. El modo
-- =====================================================================

-- La cuenta elige cómo ve la app: 'player' (jugador), 'business' (su empresa; hay que tener una) o null (jugador).
-- Devuelve cómo quedó. El mismo que ya tiene no escribe nada.
create function public.set_account_mode(p_mode text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_now text;
begin
  if p_mode is not null and p_mode not in ('player', 'business') then
    perform private.fail('invalido');
  end if;
  if p_mode = 'business' and not exists (select 1 from public.businesses b where b.user_id = v_uid) then
    perform private.fail('no_existe');
  end if;
  select p.account_mode into v_now from public.profiles p where p.id = v_uid;
  if not found then
    perform private.fail('no_existe');
  end if;
  if v_now is distinct from p_mode then
    update public.profiles p set account_mode = p_mode where p.id = v_uid;
  end if;
  return p_mode;
end $$;

-- =====================================================================
-- 5. La consola (superadmin)
-- =====================================================================

-- Las empresas, las pendientes primero. p_status: solo esas. → {rows, total, counts: {pending, approved, …}}.
create function public.admin_businesses(p_status text default null, p_search text default null,
                                        p_limit integer default 50, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_q text := nullif(lower(btrim(left(coalesce(p_search, ''), 100))), '');
  v_limit integer := private.clamp_int(p_limit, 1, 100, 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_rows jsonb;
begin
  perform private.require_super();
  if v_status is not null and v_status not in ('pending', 'approved', 'rejected', 'suspended') then
    perform private.fail('invalido');
  end if;
  with f as (
    select b.id, b.status, b.created_at, b.name
      from public.businesses b join public.profiles o on o.id = b.user_id
     where (v_status is null or b.status = v_status)
       and (v_q is null or lower(b.name || ' ' || b.city || ' ' || coalesce(o.name, '') || ' ' || coalesce(o.email, ''))
                           like '%' || private.like_escape(v_q) || '%'
            or b.id::text = v_q)
  ), page as (
    select f.id, row_number() over (order by (f.status = 'pending') desc, f.created_at desc, f.id desc) as rn
      from f order by (f.status = 'pending') desc, f.created_at desc, f.id desc
     limit v_limit offset v_offset
  )
  select (select count(*) from f)::integer,
         coalesce((select jsonb_agg(jsonb_build_object(
                    'id', b.id, 'name', b.name, 'city', b.city, 'status', b.status, 'createdAt', b.created_at,
                    'owner', jsonb_build_object('id', o.id, 'name', o.name, 'email', o.email),
                    'venues', (select count(*) from public.venues v where v.business_id = b.id)::integer,
                    'featured', (select count(*) from public.venues v where v.business_id = b.id
                                    and private.venue_featured_until(v.id) is not null)::integer,
                    'requests', (select count(*) from public.venue_promotions p join public.venues v on v.id = p.venue_id
                                  where v.business_id = b.id and p.status = 'requested')::integer)
                    order by pg.rn)
                     from page pg join public.businesses b on b.id = pg.id join public.profiles o on o.id = b.user_id),
                  '[]'::jsonb)
    into v_total, v_rows;
  return jsonb_build_object('rows', v_rows, 'total', v_total,
    'counts', (select jsonb_build_object(
                 'pending', count(*) filter (where b.status = 'pending'),
                 'approved', count(*) filter (where b.status = 'approved'),
                 'rejected', count(*) filter (where b.status = 'rejected'),
                 'suspended', count(*) filter (where b.status = 'suspended'),
                 'requests', (select count(*) from public.venue_promotions p where p.status = 'requested'))
                 from public.businesses b));
end $$;

-- Una empresa con todo: dueña, espacios, promociones (todas), torneos que se juegan en sus espacios y lo cobrado.
create function public.admin_business(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_super();
  if not exists (select 1 from public.businesses b where b.id = p_business) then
    return null;
  end if;
  return private.business_json(p_business) || (
    select jsonb_build_object(
      'owner', jsonb_build_object('id', o.id, 'name', o.name, 'email', o.email, 'blocked', o.blocked_at is not null),
      'promotions', coalesce((select jsonb_agg(jsonb_build_object(
                       'id', p.id, 'venueId', p.venue_id, 'venueName', v.name, 'status', p.status, 'days', p.days,
                       'startsAt', p.starts_at, 'endsAt', p.ends_at, 'amount', p.amount, 'note', p.note,
                       'createdAt', p.created_at, 'decidedAt', p.decided_at) order by p.created_at desc, p.id)
                         from public.venue_promotions p join public.venues v on v.id = p.venue_id
                        where v.business_id = p_business), '[]'::jsonb),
      'leagues', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'kind', l.kind, 'sport', l.sport,
                                                               'venueId', l.venue_id, 'createdAt', l.created_at)
                                            order by l.created_at desc)
                              from public.leagues l join public.venues v on v.id = l.venue_id
                             where v.business_id = p_business), '[]'::jsonb),
      'paid', coalesce((select sum(p.amount) from public.venue_promotions p join public.venues v on v.id = p.venue_id
                         where v.business_id = p_business and p.status in ('active', 'cancelled') and p.amount is not null), 0))
      from public.businesses b join public.profiles o on o.id = b.user_id where b.id = p_business);
end $$;

-- Aprobar, rechazar, suspender o devolver a revisión. Rechazar y suspender piden el motivo (lo ve la empresa).
create function public.admin_set_business_status(p_business uuid, p_status text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_super();
  v_note text := private.biz_text(p_note, 300);
  v_old text;
begin
  if p_status is null or p_status not in ('pending', 'approved', 'rejected', 'suspended')
     or (p_status in ('rejected', 'suspended') and v_note is null) then
    perform private.fail('invalido');
  end if;
  select b.status into v_old from public.businesses b where b.id = p_business for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  update public.businesses b
     set status = p_status, status_note = case when p_status in ('rejected', 'suspended') then v_note end,
         reviewed_at = now(), reviewed_by = v_uid
   where b.id = p_business;
  perform private.audit('business_status', 'business', p_business::text,
                        jsonb_build_object('from', v_old, 'to', p_status, 'note', v_note));
  return private.business_json(p_business);
end $$;

-- La comisión de la app para esa empresa (0 a 50 %).
create function public.admin_set_commission(p_business uuid, p_pct numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_old numeric;
begin
  perform private.require_super();
  if p_pct is null or p_pct < 0 or p_pct > 50 then
    perform private.fail('invalido');
  end if;
  select b.commission_pct into v_old from public.businesses b where b.id = p_business for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  update public.businesses b set commission_pct = round(p_pct, 2) where b.id = p_business;
  perform private.audit('business_commission', 'business', p_business::text, jsonb_build_object('from', v_old, 'to', round(p_pct, 2)));
  return private.business_json(p_business);
end $$;

-- Activa (con lo que pagó y los días, desde ahora) o rechaza lo que pidió una empresa.
create function public.admin_decide_promotion(p_promotion uuid, p_approve boolean, p_days integer default null,
                                              p_amount numeric default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_super();
  v_venue uuid;
  v_days integer;
begin
  select p.venue_id, coalesce(p_days, p.days) into v_venue, v_days
    from public.venue_promotions p where p.id = p_promotion and p.status = 'requested' for update;
  if v_venue is null then
    perform private.fail('no_existe');
  end if;
  if p_approve is null or (p_approve and (v_days not between 1 and 365 or p_amount is null or p_amount < 0)) then
    perform private.fail('invalido');
  end if;
  update public.venue_promotions p
     set status = case when p_approve then 'active' else 'rejected' end,
         days = v_days,
         starts_at = case when p_approve then now() end,
         ends_at = case when p_approve then now() + make_interval(days => v_days) end,
         amount = case when p_approve then round(p_amount, 2) end,
         note = coalesce(private.biz_text(p_note, 300), p.note),
         decided_by = v_uid, decided_at = clock_timestamp()
   where p.id = p_promotion;
  perform private.audit(case when p_approve then 'promotion_on' else 'promotion_no' end, 'business',
                        (select v.business_id::text from public.venues v where v.id = v_venue),
                        jsonb_build_object('venue', v_venue, 'days', v_days, 'amount', p_amount));
  return private.venue_json(v_venue, true);
end $$;

-- Destaca un espacio directamente (sin que lo pida), desde ahora y por p_days días.
create function public.admin_grant_promotion(p_venue uuid, p_days integer, p_amount numeric default 0,
                                             p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_super();
  v_business uuid;
begin
  select v.business_id into v_business from public.venues v where v.id = p_venue;
  if v_business is null then
    perform private.fail('no_existe');
  end if;
  if p_days is null or p_days not between 1 and 365 or coalesce(p_amount, 0) < 0 then
    perform private.fail('invalido');
  end if;
  insert into public.venue_promotions (venue_id, status, days, starts_at, ends_at, amount, note, decided_by, decided_at)
  values (p_venue, 'active', p_days, now(), now() + make_interval(days => p_days), round(coalesce(p_amount, 0), 2),
          private.biz_text(p_note, 300), v_uid, clock_timestamp());
  perform private.audit('promotion_on', 'business', v_business::text,
                        jsonb_build_object('venue', p_venue, 'days', p_days, 'amount', coalesce(p_amount, 0)));
  return private.venue_json(p_venue, true);
end $$;

-- Termina ya una promoción activa.
create function public.admin_end_promotion(p_promotion uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_venue uuid;
begin
  perform private.require_super();
  update public.venue_promotions p set status = 'cancelled', ends_at = least(p.ends_at, now()), decided_at = clock_timestamp()
   where p.id = p_promotion and p.status = 'active'
  returning p.venue_id into v_venue;
  if v_venue is null then
    perform private.fail('no_existe');
  end if;
  perform private.audit('promotion_off', 'business', (select v.business_id::text from public.venues v where v.id = v_venue),
                        jsonb_build_object('venue', v_venue));
  return private.venue_json(v_venue, true);
end $$;

-- =====================================================================
-- 6. La cola de Storage: también 'venues' (lo demás igual que en 20261011000100_equipos_en_vivo.sql)
-- =====================================================================
create or replace function public.purge_queue_take(p_limit integer default 500, p_bucket text default 'scoreboards')
returns table (path text)
language plpgsql security definer set search_path = '' as $$
begin
  if p_bucket is null or p_bucket not in ('scoreboards', 'logos', 'avatars', 'posts', 'venues') then
    perform private.fail('invalido');
  end if;
  if p_bucket = 'scoreboards' then
    delete from private.storage_purge_queue q
     where q.bucket = 'scoreboards' and exists (select 1 from public.photos p where p.path = q.path);
  elsif p_bucket = 'logos' then
    delete from private.storage_purge_queue q
     where q.bucket = 'logos'
       and (exists (select 1 from public.leagues l where l.logo_path = q.path)
            or exists (select 1 from public.esports_teams t where t.logo_path = q.path)
            or exists (select 1 from public.squads s where s.logo_path = q.path));
  elsif p_bucket = 'avatars' then
    delete from private.storage_purge_queue q
     where q.bucket = 'avatars' and exists (select 1 from public.profiles p where p.avatar_path = q.path);
  elsif p_bucket = 'venues' then
    delete from private.storage_purge_queue q
     where q.bucket = 'venues' and exists (select 1 from public.venue_photos f where f.path = q.path);
  else
    delete from private.storage_purge_queue q
     where q.bucket = 'posts' and exists (select 1 from public.posts p where p.photo_path = q.path);
  end if;
  return query
  with picked as (
    select q.path
      from private.storage_purge_queue q
     where q.bucket = p_bucket and q.attempts < 10 and (q.claimed_at is null or q.claimed_at < now() - interval '10 minutes')
     order by q.queued_at, q.path
     limit private.clamp_int(p_limit, 1, 1000, 500)
       for update of q skip locked
  )
  update private.storage_purge_queue q set claimed_at = now(), attempts = q.attempts + 1
    from picked x
   where q.path = x.path
  returning q.path;
end $$;

create or replace function public.purge_queue_done(p_paths text[], p_bucket text default 'scoreboards') returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  if p_bucket is null or p_bucket not in ('scoreboards', 'logos', 'avatars', 'posts', 'venues') then
    perform private.fail('invalido');
  end if;
  delete from private.storage_purge_queue q where q.path = any (coalesce(p_paths, '{}')) and q.bucket = p_bucket;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- =====================================================================
-- Permisos: las RPC con sesión; lo público también sin cuenta; la cola, solo service_role; las ayudas, nadie
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array[
    'search_venues', 'venue_detail', 'register_business', 'update_business', 'delete_business', 'my_business',
    'save_venue', 'delete_venue', 'add_venue_photo', 'delete_venue_photo', 'set_venue_cover', 'request_promotion',
    'cancel_promotion', 'set_league_venue', 'set_account_mode', 'admin_businesses', 'admin_business',
    'admin_set_business_status', 'admin_set_commission', 'admin_decide_promotion', 'admin_grant_promotion',
    'admin_end_promotion'];
  v_service constant text[] := array['purge_queue_take', 'purge_queue_done'];
  v_private constant text[] := array[
    'queue_venue_photo_purge', 'biz_max', 'biz_text', 'biz_phone', 'my_business_id', 'venue_featured_until',
    'business_public', 'venue_photos_json', 'venue_json', 'business_json'];
begin
  for f in select p.oid::regprocedure as sig, n.nspname, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and (p.proname = any (v_rpc) or p.proname = any (v_service)))
               or (n.nspname = 'private' and p.proname = any (v_private)) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' and f.proname = any (v_rpc) then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.nspname = 'public' then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;

-- La política de subir del bucket 'venues' la llama como authenticated.
revoke execute on function private.can_upload_venue_photo() from public, anon;
grant execute on function private.can_upload_venue_photo() to authenticated;

-- «Dónde jugar» también sin cuenta.
grant execute on function public.search_venues(text, text, text, integer, integer) to anon;
grant execute on function public.venue_detail(uuid) to anon;
