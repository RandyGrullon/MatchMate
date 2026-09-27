-- MatchMate · Fase 7 · Natación: encuentros de club (finales por tiempo), clubes, nadadores, series y carriles,
-- resultados por serie y marcas.
--
-- Modelo:
-- - El encuentro es un `events` de una liga de natación (type 'encuentro' o 'control' = «Control de marcas»).
--   Un trigger le crea su fila en `swim_meets` (piscina, carriles, puntos, categorías) con las reglas de la liga.
-- - `swim_events`: las pruebas del encuentro (distancia × estilo × piscina × sexo × categorías).
-- - `swim_entries`: un nadador en una prueba: tiempo de siembra (o NT), serie y carril, y su resultado
--   (tiempo en centésimas y estado ok | dq | dns | dnf). Guarda el club y la categoría del momento del encuentro.
-- - `swim_clubs`: clubes (para los puntos), cada uno con un entrenador opcional (miembro de la liga).
-- - `swim_swimmers`: club del nadador y su categoría YA calculada (lo único de la edad que se ve en público).
--   El año de nacimiento y el sexo van SOLO en `player_private` (lo leen los admins).
--
-- Menores: sin cuenta (players.is_minor + CHECK), solo en ligas con menores (trigger), que son privadas y sin
-- fotos ni social (reglas de la Fase 0). Los registra el admin o el entrenador de su club, con el
-- consentimiento del padre, madre o tutor (quién y cuándo, en player_private). Con año de nacimiento de menor
-- el jugador es menor sí o sí (triggers de players y player_private, en todas las ligas).
--
-- Puestos, puntos por club y medallero los calcula el teléfono con el motor (src/sports/swimming): la base
-- guarda los tiempos crudos y cierra el encuentro al finalizar (después no se cambian resultados).
--
-- Tiempo real: `event:<id>` 'swim' {t: 'entries' | 'events' | 'meet', op} y `league:<id>` 'swim'
-- {t: 'meets' | 'clubs' | 'swimmers', op}. Solo dicen qué cambió: el teléfono vuelve a leer.

-- =====================================================================
-- Validaciones (puras)
-- =====================================================================

-- Puntos por puesto: lista de 1 a 50 números de 0 a 100 (6-4-3-2-1, 9-7-6-5-4-3-2-1…).
create function private.swim_points_ok(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select p is not null and jsonb_typeof(p) = 'array' and jsonb_array_length(p) between 1 and 50
     and not exists (select 1 from jsonb_array_elements(p) x
                      where jsonb_typeof(x) <> 'number' or (x #>> '{}')::numeric < 0 or (x #>> '{}')::numeric > 100)
$$;

-- Prueba que existe y se puede nadar en esa piscina (igual que validateSwimEvent de src/sports/swimming/events.ts):
-- largos enteros; espalda, pecho y mariposa hasta 200; combinado 100/200/400 con los 4 estilos iguales
-- (el de 100 solo en piscina de 25).
create function private.swim_event_ok(p_distance integer, p_stroke text, p_pool integer) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_pool in (25, 50) and p_distance > 0 and p_distance % p_pool = 0 and case p_stroke
    when 'libre' then p_distance in (25, 50, 100, 200, 400, 800, 1500)
    when 'espalda' then p_distance in (25, 50, 100, 200)
    when 'pecho' then p_distance in (25, 50, 100, 200)
    when 'mariposa' then p_distance in (25, 50, 100, 200)
    when 'combinado' then p_distance in (100, 200, 400) and (p_distance / p_pool) % 4 = 0
    else false
  end, false)
$$;

-- Categoría de una edad (igual que ageGroupOf con CCCAN_AGE_GROUPS o mastersAgeGroups()).
-- 'cccan': 8 y menos, 9-10, 11-12, 13-14, 15-17, 18 y más. 'masters': de 5 en 5 desde 25-29 (m25-29 … m95-99,
-- m100+; menos de 25 = ninguna). 'none': sin categorías.
create function private.swim_age_group(p_age integer, p_scheme text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_age is null or p_scheme is null or p_scheme = 'none' then null
    when p_scheme = 'masters' then
      case when p_age < 25 then null
           when p_age >= 100 then 'm100+'
           else 'm' || (25 + ((p_age - 25) / 5) * 5)::text || '-' || (29 + ((p_age - 25) / 5) * 5)::text end
    when p_scheme = 'cccan' then
      case when p_age <= 8 then '8-' when p_age <= 10 then '9-10' when p_age <= 12 then '11-12'
           when p_age <= 14 then '13-14' when p_age <= 17 then '15-17' else '18+' end
    else null
  end
$$;

-- Ids de las categorías de un esquema (para validar las de cada prueba).
create function private.swim_age_group_ids(p_scheme text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_scheme
    when 'cccan' then array['8-', '9-10', '11-12', '13-14', '15-17', '18+']
    when 'masters' then array(select 'm' || a::text || '-' || (a + 4)::text from generate_series(25, 95, 5) a) || array['m100+']
    else '{}'::text[]
  end
$$;

-- =====================================================================
-- Tablas
-- =====================================================================

-- Clubes de la liga (los puntos del encuentro son por club). coach_id: miembro que inscribe a los suyos.
create table public.swim_clubs (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60 and btrim(name) <> ''),
  short text not null default '' check (char_length(short) <= 8),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  coach_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, league_id),
  foreign key (league_id, coach_id) references public.league_members (league_id, user_id) on delete set null (coach_id)
);
create unique index swim_clubs_name_idx on public.swim_clubs (league_id, lower(name));
create index swim_clubs_coach_idx on public.swim_clubs (coach_id);
create index swim_clubs_sync_idx on public.swim_clubs (league_id, updated_at);

-- El nadador en natación: su club y la categoría ya calculada (nunca el año de nacimiento ni el sexo).
create table public.swim_swimmers (
  player_id uuid primary key,
  league_id uuid not null,
  club_id uuid,
  category text check (char_length(category) <= 12),
  -- Año al que corresponde la categoría (cambia cada 1 de enero).
  category_year smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade,
  foreign key (club_id, league_id) references public.swim_clubs (id, league_id) on delete set null (club_id)
);
create index swim_swimmers_club_idx on public.swim_swimmers (club_id);
create index swim_swimmers_sync_idx on public.swim_swimmers (league_id, updated_at);

-- Configuración del encuentro (1:1 con events). La crea el trigger de events con las reglas de la liga.
create table public.swim_meets (
  event_id uuid primary key,
  league_id uuid not null,
  pool smallint not null default 25 check (pool in (25, 50)),
  lanes smallint not null default 6 check (lanes between 1 and 10),
  points jsonb not null default '[6, 4, 3, 2, 1]' check (private.swim_points_ok(points)),
  age_groups text not null default 'cccan' check (age_groups in ('cccan', 'masters', 'none')),
  -- Hoja de series publicada (la última vez).
  heats_published_at timestamptz,
  -- Encuentro cerrado: ya no se cambian inscripciones, series ni resultados.
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, league_id),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade
);
create index swim_meets_sync_idx on public.swim_meets (league_id, updated_at);

-- Pruebas del encuentro. num: orden en el programa (1, 2, 3…).
create table public.swim_events (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null,
  event_id uuid not null,
  num smallint not null check (num between 1 and 99),
  distance smallint not null,
  stroke text not null check (stroke in ('libre', 'espalda', 'pecho', 'mariposa', 'combinado')),
  pool smallint not null check (pool in (25, 50)),
  gender text not null check (gender in ('F', 'M', 'X')),
  -- Categorías que nadan esta prueba (vacía = abierta). En finales por tiempo se mezclan en las series.
  age_groups text[] not null default '{}'
    check (coalesce(array_ndims(age_groups), 1) = 1 and coalesce(cardinality(age_groups), 0) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, league_id, event_id),
  -- Diferida: reordenar el programa intercambia números en varias sentencias.
  constraint swim_events_num_key unique (event_id, num) deferrable initially deferred,
  check (private.swim_event_ok(distance, stroke, pool)),
  foreign key (event_id, league_id) references public.swim_meets (event_id, league_id) on delete cascade
);
create index swim_events_sync_idx on public.swim_events (league_id, updated_at);

-- Un nadador en una prueba: siembra, serie y carril, y su resultado.
create table public.swim_entries (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null,
  event_id uuid not null,
  swim_event_id uuid not null,
  player_id uuid not null,
  -- Club y categoría del nadador cuando se inscribió (para los puntos de ese encuentro).
  club_id uuid,
  age_group text check (char_length(age_group) <= 12),
  -- Tiempo de siembra en centésimas; null = sin tiempo (NT).
  seed_cs integer check (seed_cs between 1 and 599999),
  heat smallint check (heat between 1 and 99),
  lane smallint check (lane between 1 and 10),
  -- Resultado: centésimas (null = sin tiempo) y estado. DNS y DNF no llevan tiempo; DQ puede llevarlo (no cuenta).
  time_cs integer check (time_cs between 1 and 599999),
  status text not null default 'ok' check (status in ('ok', 'dq', 'dns', 'dnf')),
  result_at timestamptz,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (swim_event_id, player_id),
  check ((heat is null) = (lane is null)),
  check (status not in ('dns', 'dnf') or time_cs is null),
  foreign key (swim_event_id, league_id, event_id) references public.swim_events (id, league_id, event_id) on delete cascade,
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade,
  foreign key (club_id, league_id) references public.swim_clubs (id, league_id) on delete set null (club_id)
);
create unique index swim_entries_lane_idx on public.swim_entries (swim_event_id, heat, lane) where heat is not null;
create index swim_entries_event_idx on public.swim_entries (event_id);
create index swim_entries_player_idx on public.swim_entries (player_id);
create index swim_entries_club_idx on public.swim_entries (club_id);
create index swim_entries_sync_idx on public.swim_entries (league_id, updated_at);

-- =====================================================================
-- Triggers: updated_at, borrados, solo ligas de natación, encuentro al crear el evento
-- =====================================================================

create trigger swim_clubs_touch before update on public.swim_clubs for each row execute function private.touch_updated_at();
create trigger swim_swimmers_touch before update on public.swim_swimmers for each row execute function private.touch_updated_at();
create trigger swim_meets_touch before update on public.swim_meets for each row execute function private.touch_updated_at();
create trigger swim_events_touch before update on public.swim_events for each row execute function private.touch_updated_at();
create trigger swim_entries_touch before update on public.swim_entries for each row execute function private.touch_updated_at();

create trigger swim_clubs_tombstone after delete on public.swim_clubs for each row execute function private.tombstone('id');
create trigger swim_swimmers_tombstone after delete on public.swim_swimmers for each row execute function private.tombstone('player_id');
create trigger swim_meets_tombstone after delete on public.swim_meets for each row execute function private.tombstone('event_id');
create trigger swim_events_tombstone after delete on public.swim_events for each row execute function private.tombstone('id');
create trigger swim_entries_tombstone after delete on public.swim_entries for each row execute function private.tombstone('id');

-- Lo de natación solo existe en ligas de natación (también para service_role).
create function private.swim_guard_league() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select l.sport from public.leagues l where l.id = new.league_id) is distinct from 'swimming' then
    raise exception 'invalido' using errcode = 'P0001', detail = 'La liga no es de natación.';
  end if;
  return new;
end $$;

create trigger swim_clubs_guard before insert or update of league_id on public.swim_clubs
  for each row execute function private.swim_guard_league();
create trigger swim_swimmers_guard before insert or update of league_id on public.swim_swimmers
  for each row execute function private.swim_guard_league();
create trigger swim_meets_guard before insert or update of league_id on public.swim_meets
  for each row execute function private.swim_guard_league();

-- Eventos de una liga de natación: encuentro, control de marcas o torneo (el encuentro de un torneo sin liga,
-- que crea create_tournament).
create function private.swim_check_event_type() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select l.sport from public.leagues l where l.id = new.league_id) = 'swimming' and new.type not in ('encuentro', 'control', 'torneo') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Tipo de evento de natación: encuentro, control o torneo.';
  end if;
  return new;
end $$;

create trigger events_swim_check before insert or update of type, league_id on public.events
  for each row execute function private.swim_check_event_type();

-- Todo evento de natación trae su configuración (con las reglas de la liga: pool, lanes, points, ageGroups).
create function private.swim_new_meet() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sport text;
  r jsonb;
begin
  select l.sport, l.rules into v_sport, r from public.leagues l where l.id = new.league_id;
  if v_sport is distinct from 'swimming' then
    return null;
  end if;
  insert into public.swim_meets (event_id, league_id, pool, lanes, points, age_groups)
  values (
    new.id, new.league_id,
    case when r ->> 'pool' in ('25', '50') then (r ->> 'pool')::smallint else 25 end,
    case when jsonb_typeof(r -> 'lanes') = 'number' and (r ->> 'lanes') ~ '^([1-9]|10)$' then (r ->> 'lanes')::smallint else 6 end,
    case when private.swim_points_ok(r -> 'points') then r -> 'points' else '[6, 4, 3, 2, 1]'::jsonb end,
    case when r ->> 'ageGroups' in ('cccan', 'masters', 'none') then r ->> 'ageGroups' else 'cccan' end)
  on conflict (event_id) do nothing;
  return null;
end $$;

create trigger events_swim_meet after insert on public.events for each row execute function private.swim_new_meet();

-- =====================================================================
-- RLS: lectura para quien ve la liga (el año de nacimiento y el sexo no están en estas tablas)
-- =====================================================================
alter table public.swim_clubs enable row level security;
alter table public.swim_swimmers enable row level security;
alter table public.swim_meets enable row level security;
alter table public.swim_events enable row level security;
alter table public.swim_entries enable row level security;

create policy swim_clubs_read on public.swim_clubs for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy swim_swimmers_read on public.swim_swimmers for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy swim_meets_read on public.swim_meets for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy swim_events_read on public.swim_events for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy swim_entries_read on public.swim_entries for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));

revoke all on public.swim_clubs, public.swim_swimmers, public.swim_meets, public.swim_events, public.swim_entries
  from public, anon, authenticated;
grant select on public.swim_clubs, public.swim_swimmers, public.swim_meets, public.swim_events, public.swim_entries
  to anon, authenticated;

-- =====================================================================
-- Ayudas de las RPC
-- =====================================================================

-- La liga existe y es de natación.
create function private.swim_check_league(p_league uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sport text := (select l.sport from public.leagues l where l.id = p_league);
begin
  if v_sport is null then
    perform private.fail('no_existe');
  elsif v_sport <> 'swimming' then
    perform private.fail('invalido');
  end if;
end $$;

-- La cuenta es la entrenadora de ese club (de esa liga).
create function private.swim_is_coach(p_club uuid, p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_club is not null and exists (
    select 1 from public.swim_clubs c
     where c.id = p_club and c.league_id = p_league and c.coach_id = (select auth.uid()))
$$;

-- Esquema de categorías de la liga (reglas: ageGroups) y el año de hoy en su zona horaria.
create function private.swim_league_scheme(p_league uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when l.rules ->> 'ageGroups' in ('cccan', 'masters', 'none') then l.rules ->> 'ageGroups' else 'cccan' end
    from public.leagues l where l.id = p_league
$$;

create function private.swim_league_year(p_league uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select extract(year from (now() at time zone coalesce((select l.tz from public.leagues l where l.id = p_league), 'UTC')))::integer
$$;

-- Categoría del nadador en ese año (con su año de nacimiento privado); null si no se sabe.
create function private.swim_player_group(p_player uuid, p_year integer, p_scheme text) returns text
language sql stable security definer set search_path = '' as $$
  select private.swim_age_group(p_year - pp.birth_year, p_scheme)
    from public.player_private pp where pp.player_id = p_player
$$;

-- Pone al día la categoría pública del nadador (crea su fila de natación si no la tenía).
create function private.swim_refresh_category(p_player uuid, p_league uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_year integer := private.swim_league_year(p_league);
begin
  insert into public.swim_swimmers (player_id, league_id) values (p_player, p_league) on conflict (player_id) do nothing;
  update public.swim_swimmers s
     set category = private.swim_player_group(p_player, v_year, private.swim_league_scheme(p_league)), category_year = v_year
   where s.player_id = p_player;
end $$;

-- Tiempo que manda el teléfono (jsonb): null o entero de 1 a 599999 centésimas. Si no sirve: 'invalido'.
create function private.swim_time(p jsonb) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  n numeric;
begin
  if p is null or jsonb_typeof(p) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p) <> 'number' then
    perform private.fail('invalido');
  end if;
  n := (p #>> '{}')::numeric;
  if n <> trunc(n) or n < 1 or n > 599999 then
    perform private.fail('invalido');
  end if;
  return n::integer;
end $$;

-- =====================================================================
-- Menores por su año de nacimiento (todas las ligas)
-- =====================================================================
-- Quien tiene año de nacimiento de menor (año de hoy en la zona de la liga − año < 18, la misma cuenta que el
-- formulario) es menor: players.is_minor y sin cuenta. Así le aplican el trigger de ligas con menores (privadas,
-- sin fotos ni social), el CHECK sin cuenta y las RPC que no dejan reclamar ni vincular a un menor.
-- Va en triggers y no solo en las RPC de natación porque el año también se escribe con set_player_private, y
-- is_minor y la cuenta cambian con update_player, claim_player, join_league (ensure_player) y
-- link_account_to_player. Solo se revisa lo que cambia: la edad solo sube (lo que estaba bien sigue bien) y
-- quitar una cuenta (p. ej. al salir de la liga) nunca falla.

-- ¿Menor por ese año de nacimiento en esa liga? (null = no se sabe = no).
create function private.minor_by_birth_year(p_league uuid, p_birth_year integer) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.swim_league_year(p_league) - p_birth_year < 18, false)
$$;

-- player_private: un año de menor solo en un jugador menor y sin cuenta.
create function private.check_minor_birth_year() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.birth_year is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.birth_year is not distinct from old.birth_year then
      return new;
    end if;
  end if;
  if exists (select 1 from public.players p
              where p.id = new.player_id and (not p.is_minor or p.user_id is not null)
                and private.minor_by_birth_year(p.league_id, new.birth_year)) then
    raise exception 'invalido' using errcode = 'P0001',
      detail = 'Por el año de nacimiento es menor de edad: tiene que estar registrado como menor y sin cuenta.';
  end if;
  return new;
end $$;

create trigger player_private_minor_age before insert or update of birth_year on public.player_private
  for each row execute function private.check_minor_birth_year();

-- players: con año de menor no se le quita is_minor ni se le pone una cuenta.
create function private.check_minor_player() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not ((old.is_minor and not new.is_minor) or (new.user_id is not null and new.user_id is distinct from old.user_id)) then
    return new;
  end if;
  if private.minor_by_birth_year(new.league_id, (select pp.birth_year from public.player_private pp where pp.player_id = new.id)) then
    raise exception 'invalido' using errcode = 'P0001',
      detail = 'Por el año de nacimiento es menor de edad: tiene que estar registrado como menor y sin cuenta.';
  end if;
  return new;
end $$;

create trigger players_minor_age before update of is_minor, user_id on public.players
  for each row execute function private.check_minor_player();

-- =====================================================================
-- RPC: encuentros y pruebas (admin)
-- =====================================================================

-- Admin: encuentro nuevo. Sin piscina, carriles, puntos o categorías, los de las reglas de la liga.
create function public.swim_create_meet(
  p_league uuid,
  p_date date,
  p_name text default '',
  p_type text default 'encuentro',
  p_pool integer default null,
  p_lanes integer default null,
  p_points jsonb default null,
  p_age_groups text default null,
  p_start_time time default null,
  p_announcement text default '',
  p_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  perform private.require_uid();
  perform private.require_admin(p_league);
  perform private.swim_check_league(p_league);
  if p_date is null or p_type is null or p_type not in ('encuentro', 'control') then
    perform private.fail('invalido');
  end if;
  insert into public.events (id, league_id, type, name, date, start_time, games, announcement, created_by)
  values (v_id, p_league, p_type, btrim(coalesce(p_name, '')), p_date, p_start_time, 1, coalesce(p_announcement, ''), auth.uid());
  update public.swim_meets m set
    pool = coalesce(p_pool, m.pool),
    lanes = coalesce(p_lanes, m.lanes),
    points = coalesce(p_points, m.points),
    age_groups = coalesce(p_age_groups, m.age_groups)
  where m.event_id = v_id;
  return v_id;
end $$;

-- Admin: piscina, carriles, puntos o categorías del encuentro (nombre y fecha: update_event).
create function public.swim_update_meet(p_meet uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.swim_meets;
  k text;
  v_pool smallint;
  v_lanes smallint;
  v_scheme text;
  v_year integer;
begin
  perform private.require_uid();
  select * into m from public.swim_meets x where x.event_id = p_meet for update;
  if m.event_id is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(m.league_id);
  if m.finalized_at is not null then
    perform private.fail('cerrado');
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then
    perform private.fail('invalido');
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k <> all (array['pool', 'lanes', 'points', 'age_groups']) then
      perform private.fail('invalido');
    end if;
  end loop;
  v_pool := case when p_patch ? 'pool' then (p_patch ->> 'pool')::smallint else m.pool end;
  v_lanes := case when p_patch ? 'lanes' then (p_patch ->> 'lanes')::smallint else m.lanes end;
  v_scheme := case when p_patch ? 'age_groups' then p_patch ->> 'age_groups' else m.age_groups end;
  if v_pool is distinct from m.pool then
    -- Con tiempos ya nadados no se cambia la piscina (las marcas de 25 y 50 m van separadas).
    if exists (select 1 from public.swim_entries e where e.event_id = p_meet and (e.time_cs is not null or e.result_at is not null)) then
      perform private.fail('invalido');
    end if;
  end if;
  if v_lanes is distinct from m.lanes and exists (select 1 from public.swim_entries e where e.event_id = p_meet and e.lane > v_lanes) then
    perform private.fail('invalido');
  end if;
  if v_scheme is distinct from m.age_groups and exists (
       select 1 from public.swim_events se, unnest(se.age_groups) g
        where se.event_id = p_meet and not g = any (private.swim_age_group_ids(v_scheme))) then
    perform private.fail('invalido');
  end if;
  update public.swim_meets x set
    pool = v_pool,
    lanes = v_lanes,
    points = case when p_patch ? 'points' then p_patch -> 'points' else x.points end,
    age_groups = v_scheme
  where x.event_id = p_meet;
  if v_pool is distinct from m.pool then
    update public.swim_events se set pool = v_pool where se.event_id = p_meet;
  end if;
  if v_scheme is distinct from m.age_groups then
    v_year := extract(year from (select e.date from public.events e where e.id = p_meet))::integer;
    update public.swim_entries e set age_group = private.swim_player_group(e.player_id, v_year, v_scheme) where e.event_id = p_meet;
  end if;
end $$;

-- Admin: agrega o cambia pruebas del encuentro (una o varias, p. ej. de una plantilla).
-- p_events = [{id?, num?, distance, stroke, gender, age_groups: [...]}]. Devuelve los ids en ese orden.
-- Una prueba con tiempos ya nadados no cambia de distancia ni de estilo.
create function public.swim_save_events(p_meet uuid, p_events jsonb) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  m public.swim_meets;
  e jsonb;
  k text;
  v_old public.swim_events;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_num smallint;
  v_distance smallint;
  v_groups text[];
begin
  perform private.require_uid();
  select * into m from public.swim_meets x where x.event_id = p_meet for update;
  if m.event_id is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(m.league_id);
  if m.finalized_at is not null then
    perform private.fail('cerrado');
  end if;
  if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events) > 60 then
    perform private.fail('invalido');
  end if;
  -- Se pueden intercambiar números de prueba dentro de la lista; al final se revisa que no se repitan.
  set constraints public.swim_events_num_key deferred;
  for e in select value from jsonb_array_elements(p_events) loop
    if jsonb_typeof(e) <> 'object' then
      perform private.fail('invalido');
    end if;
    for k in select jsonb_object_keys(e) loop
      if k <> all (array['id', 'num', 'distance', 'stroke', 'gender', 'age_groups']) then
        perform private.fail('invalido');
      end if;
    end loop;
    if e ? 'age_groups' and jsonb_typeof(e -> 'age_groups') not in ('array', 'null') then
      perform private.fail('invalido');
    end if;
    v_groups := coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(e -> 'age_groups') = 'array' then e -> 'age_groups' else '[]'::jsonb end)), '{}');
    if exists (select 1 from unnest(v_groups) g where not g = any (private.swim_age_group_ids(m.age_groups)))
       or cardinality(v_groups) <> (select count(distinct g) from unnest(v_groups) g) then
      perform private.fail('invalido');
    end if;
    v_id := coalesce(nullif(e ->> 'id', '')::uuid, gen_random_uuid());
    v_distance := (e ->> 'distance')::smallint;
    select * into v_old from public.swim_events se where se.id = v_id for update;
    if v_old.id is not null then
      if v_old.event_id <> p_meet then
        perform private.fail('no_existe');
      end if;
      if (v_distance is distinct from v_old.distance or (e ->> 'stroke') is distinct from v_old.stroke)
         and exists (select 1 from public.swim_entries x where x.swim_event_id = v_id and (x.time_cs is not null or x.result_at is not null)) then
        perform private.fail('invalido');
      end if;
      v_num := coalesce((e ->> 'num')::smallint, v_old.num);
      update public.swim_events se set
        num = v_num, distance = v_distance, stroke = e ->> 'stroke', gender = e ->> 'gender', age_groups = v_groups
      where se.id = v_id;
    else
      v_num := coalesce((e ->> 'num')::smallint, (select coalesce(max(se.num), 0) + 1 from public.swim_events se where se.event_id = p_meet));
      insert into public.swim_events (id, league_id, event_id, num, distance, stroke, pool, gender, age_groups)
      values (v_id, m.league_id, p_meet, v_num, v_distance, e ->> 'stroke', m.pool, e ->> 'gender', v_groups);
    end if;
    v_ids := v_ids || v_id;
  end loop;
  if (select count(*) from public.swim_events se where se.event_id = p_meet) > 40 then
    perform private.fail('invalido');
  end if;
  -- Números repetidos en el programa: se avisa aquí (no al final de la transacción).
  set constraints public.swim_events_num_key immediate;
  return v_ids;
end $$;

-- Admin: quita una prueba (con sus inscripciones y resultados).
create function public.swim_delete_event(p_swim_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
  v_final timestamptz;
begin
  perform private.require_uid();
  select se.league_id, m.finalized_at into v_league, v_final
    from public.swim_events se join public.swim_meets m on m.event_id = se.event_id where se.id = p_swim_event;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  if v_final is not null then
    perform private.fail('cerrado');
  end if;
  delete from public.swim_events where id = p_swim_event;
end $$;

-- Admin: cierra el encuentro (p_final = false lo vuelve a abrir).
create function public.swim_finalize_meet(p_meet uuid, p_final boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select m.league_id from public.swim_meets m where m.event_id = p_meet);
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  update public.swim_meets m set finalized_at = case when coalesce(p_final, true) then coalesce(m.finalized_at, now()) end
   where m.event_id = p_meet;
end $$;

-- =====================================================================
-- RPC: clubes y nadadores
-- =====================================================================

-- Admin: crea o cambia un club. p_coach: miembro de la liga que inscribe a los nadadores del club (o null).
create function public.swim_save_club(
  p_league uuid,
  p_name text,
  p_short text default '',
  p_color text default null,
  p_coach uuid default null,
  p_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_old uuid;
begin
  perform private.require_uid();
  perform private.require_admin(p_league);
  perform private.swim_check_league(p_league);
  select c.league_id into v_old from public.swim_clubs c where c.id = v_id;
  if v_old is not null and v_old <> p_league then
    perform private.fail('no_existe');
  end if;
  if v_old is null then
    insert into public.swim_clubs (id, league_id, name, short, color, coach_id)
    values (v_id, p_league, private.clean_name(p_name), btrim(coalesce(p_short, '')), p_color, p_coach);
  else
    update public.swim_clubs c set name = private.clean_name(p_name), short = btrim(coalesce(p_short, '')), color = p_color, coach_id = p_coach
     where c.id = v_id;
  end if;
  return v_id;
end $$;

-- Admin: borra el club (sus nadadores e inscripciones quedan sin club).
create function public.swim_delete_club(p_club uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select c.league_id from public.swim_clubs c where c.id = p_club);
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  delete from public.swim_clubs where id = p_club;
end $$;

-- Admin, o el entrenador en su propio club: registra un nadador sin cuenta.
-- Menor: solo en ligas con menores, con año de nacimiento, sexo y el consentimiento del padre, madre o tutor
-- (p_consent = true; queda quién lo registró y cuándo). El año y el sexo van solo a player_private.
-- Con año de nacimiento de menor es menor aunque venga p_is_minor = false (y en una liga sin menores no entra).
create function public.swim_register_swimmer(
  p_league uuid,
  p_name text,
  p_club uuid default null,
  p_is_minor boolean default false,
  p_birth_year integer default null,
  p_sex text default null,
  p_consent boolean default false,
  p_guardian_name text default null,
  p_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_minor boolean := coalesce(p_is_minor, false);
begin
  if not private.is_admin(p_league) and not private.swim_is_coach(p_club, p_league) then
    perform private.deny();
  end if;
  perform private.swim_check_league(p_league);
  if p_sex is not null and p_sex not in ('F', 'M', 'X') then
    perform private.fail('invalido');
  end if;
  if p_birth_year is not null and (p_birth_year < 1900 or p_birth_year > private.swim_league_year(p_league)) then
    perform private.fail('invalido');
  end if;
  v_minor := v_minor or private.minor_by_birth_year(p_league, p_birth_year);
  if v_minor and (not coalesce(p_consent, false) or p_birth_year is null or p_sex is null) then
    perform private.fail('invalido');
  end if;
  insert into public.players (id, league_id, name, is_minor) values (v_id, p_league, private.clean_name(p_name), v_minor);
  if v_minor or p_birth_year is not null or p_sex is not null or nullif(btrim(p_guardian_name), '') is not null then
    insert into public.player_private (player_id, league_id, birth_year, sex, guardian_name, consent_by, consent_at)
    values (v_id, p_league, p_birth_year, p_sex, nullif(btrim(p_guardian_name), ''),
            case when v_minor then v_uid end, case when v_minor then now() end);
  end if;
  insert into public.swim_swimmers (player_id, league_id, club_id) values (v_id, p_league, p_club);
  perform private.swim_refresh_category(v_id, p_league);
  return v_id;
end $$;

-- Admin: cambia al nadador (también a uno con cuenta). Claves: name, club_id, birth_year, sex, guardian_name,
-- consent (true = el tutor dio su permiso ahora). Un menor no se queda sin año, sexo ni consentimiento, y un año
-- de menor no se le pone a quien no está registrado como menor o tiene cuenta ('invalido', trigger de player_private).
create function public.swim_update_swimmer(p_player uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_league uuid;
  v_minor boolean;
  k text;
  v_year integer;
  pp public.player_private;
begin
  select p.league_id, p.is_minor into v_league, v_minor from public.players p where p.id = p_player for update;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  perform private.swim_check_league(v_league);
  if jsonb_typeof(p_patch) is distinct from 'object' then
    perform private.fail('invalido');
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k <> all (array['name', 'club_id', 'birth_year', 'sex', 'guardian_name', 'consent']) then
      perform private.fail('invalido');
    end if;
  end loop;
  if p_patch ? 'consent' and jsonb_typeof(p_patch -> 'consent') <> 'boolean' then
    perform private.fail('invalido');
  end if;
  v_year := private.swim_league_year(v_league);
  if p_patch ? 'birth_year' and (p_patch ->> 'birth_year')::integer not between 1900 and v_year then
    perform private.fail('invalido');
  end if;
  if p_patch ? 'sex' and (p_patch ->> 'sex') not in ('F', 'M', 'X') then
    perform private.fail('invalido');
  end if;
  if p_patch ? 'name' then
    update public.players p set name = private.clean_name(p_patch ->> 'name') where p.id = p_player;
  end if;
  if p_patch ?| array['birth_year', 'sex', 'guardian_name', 'consent'] then
    insert into public.player_private as x (player_id, league_id, birth_year, sex, guardian_name, consent_by, consent_at)
    values (p_player, v_league, (p_patch ->> 'birth_year')::smallint, p_patch ->> 'sex', nullif(btrim(p_patch ->> 'guardian_name'), ''),
            case when (p_patch -> 'consent') = 'true'::jsonb then v_uid end,
            case when (p_patch -> 'consent') = 'true'::jsonb then now() end)
    on conflict (player_id) do update set
      birth_year = case when p_patch ? 'birth_year' then excluded.birth_year else x.birth_year end,
      sex = case when p_patch ? 'sex' then excluded.sex else x.sex end,
      guardian_name = case when p_patch ? 'guardian_name' then excluded.guardian_name else x.guardian_name end,
      consent_by = case when (p_patch -> 'consent') = 'true'::jsonb then excluded.consent_by else x.consent_by end,
      consent_at = case when (p_patch -> 'consent') = 'true'::jsonb then excluded.consent_at else x.consent_at end;
  end if;
  if v_minor then
    select * into pp from public.player_private x where x.player_id = p_player;
    if pp.birth_year is null or pp.sex is null or pp.consent_at is null then
      perform private.fail('invalido');
    end if;
  end if;
  insert into public.swim_swimmers (player_id, league_id) values (p_player, v_league) on conflict (player_id) do nothing;
  if p_patch ? 'club_id' then
    update public.swim_swimmers s set club_id = nullif(p_patch ->> 'club_id', '')::uuid where s.player_id = p_player;
  end if;
  perform private.swim_refresh_category(p_player, v_league);
end $$;

-- =====================================================================
-- RPC: inscripciones, series y resultados
-- =====================================================================

-- Inscribe nadadores en una prueba (o cambia su tiempo de siembra si ya estaban y todavía no nadaron).
-- p_entries = [{player_id, seed_cs: centésimas | null (NT)}]. Quién: admin; el entrenador, a los de su club;
-- el nadador con cuenta, a sí mismo. Sexo (privado) y categoría tienen que ser los de la prueba.
-- Devuelve cuántos entraron o cambiaron.
create function public.swim_enter(p_swim_event uuid, p_entries jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  se public.swim_events;
  m public.swim_meets;
  e jsonb;
  v_admin boolean;
  v_mine uuid;
  v_year integer;
  v_player uuid;
  v_seed integer;
  v_club uuid;
  v_sex text;
  v_birth smallint;
  v_group text;
  v_n integer;
  v_count integer := 0;
begin
  perform private.require_uid();
  select * into se from public.swim_events x where x.id = p_swim_event;
  if se.id is null then
    perform private.fail('no_existe');
  end if;
  -- El encuentro queda bloqueado mientras tanto: nadie lo cierra a mitad.
  select * into m from public.swim_meets x where x.event_id = se.event_id for update;
  if m.finalized_at is not null then
    perform private.fail('cerrado');
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) > 200 then
    perform private.fail('invalido');
  end if;
  v_admin := private.is_admin(se.league_id);
  v_mine := private.my_player(se.league_id);
  v_year := extract(year from (select ev.date from public.events ev where ev.id = se.event_id))::integer;
  for e in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'player_id') is distinct from 'string' then
      perform private.fail('invalido');
    end if;
    v_player := (e ->> 'player_id')::uuid;
    v_seed := private.swim_time(e -> 'seed_cs');
    if not exists (select 1 from public.players p where p.id = v_player and p.league_id = se.league_id) then
      perform private.fail('no_existe');
    end if;
    select s.club_id into v_club from public.swim_swimmers s where s.player_id = v_player;
    if not v_admin and v_player is distinct from v_mine and not private.swim_is_coach(v_club, se.league_id) then
      perform private.deny();
    end if;
    select pp.sex, pp.birth_year into v_sex, v_birth from public.player_private pp where pp.player_id = v_player;
    if se.gender in ('F', 'M') and v_sex in ('F', 'M') and v_sex <> se.gender then
      perform private.fail('invalido');
    end if;
    v_group := private.swim_age_group(v_year - v_birth, m.age_groups);
    if cardinality(se.age_groups) > 0 and (v_group is null or not v_group = any (se.age_groups)) then
      perform private.fail('invalido');
    end if;
    insert into public.swim_entries as x (league_id, event_id, swim_event_id, player_id, club_id, age_group, seed_cs)
    values (se.league_id, se.event_id, se.id, v_player, v_club, v_group, v_seed)
    on conflict (swim_event_id, player_id) do update set seed_cs = excluded.seed_cs, club_id = excluded.club_id, age_group = excluded.age_group
      where x.time_cs is null and x.result_at is null;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
    -- La categoría pública sigue la del encuentro más nuevo.
    insert into public.swim_swimmers (player_id, league_id) values (v_player, se.league_id) on conflict (player_id) do nothing;
    if v_birth is not null then
      update public.swim_swimmers s set category = private.swim_age_group(v_year - v_birth, private.swim_league_scheme(se.league_id)), category_year = v_year
       where s.player_id = v_player and (s.category_year is null or s.category_year <= v_year);
    end if;
  end loop;
  return v_count;
end $$;

-- Saca a un nadador de la prueba (antes de nadarla). Quién: como swim_enter. false si ya no estaba.
create function public.swim_unenter(p_entry uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  x public.swim_entries;
  v_final timestamptz;
begin
  perform private.require_uid();
  select * into x from public.swim_entries e where e.id = p_entry for update;
  if x.id is null then
    return false;
  end if;
  if not private.is_admin(x.league_id) and x.player_id is distinct from private.my_player(x.league_id)
     and not private.swim_is_coach(x.club_id, x.league_id) then
    perform private.deny();
  end if;
  select m.finalized_at into v_final from public.swim_meets m where m.event_id = x.event_id;
  if v_final is not null then
    perform private.fail('cerrado');
  end if;
  if x.time_cs is not null or x.result_at is not null then
    perform private.fail('invalido');
  end if;
  delete from public.swim_entries where id = p_entry;
  return true;
end $$;

-- Admin: publica la hoja de series (la arma el teléfono con el motor: seedHeats; el admin puede mover carriles).
-- p_heats = [{swim_event_id, lanes: [{entry_id, heat, lane}]}]. Cada prueba listada se vuelve a armar entera
-- (quien no está en la lista queda sin serie). Una prueba que ya tiene tiempos no se vuelve a armar: 'cerrado'.
-- Devuelve cuántos nadadores quedaron con carril.
create function public.swim_publish_heats(p_meet uuid, p_heats jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  m public.swim_meets;
  ev jsonb;
  l jsonb;
  v_se uuid;
  v_heat integer;
  v_lane integer;
  v_count integer := 0;
begin
  perform private.require_uid();
  select * into m from public.swim_meets x where x.event_id = p_meet for update;
  if m.event_id is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(m.league_id);
  if m.finalized_at is not null then
    perform private.fail('cerrado');
  end if;
  if jsonb_typeof(p_heats) is distinct from 'array' then
    perform private.fail('invalido');
  end if;
  for ev in select value from jsonb_array_elements(p_heats) loop
    if jsonb_typeof(ev) <> 'object' or jsonb_typeof(ev -> 'lanes') is distinct from 'array' then
      perform private.fail('invalido');
    end if;
    v_se := (ev ->> 'swim_event_id')::uuid;
    if not exists (select 1 from public.swim_events se where se.id = v_se and se.event_id = p_meet) then
      perform private.fail('no_existe');
    end if;
    if exists (select 1 from public.swim_entries x where x.swim_event_id = v_se and (x.time_cs is not null or x.result_at is not null)) then
      perform private.fail('cerrado');
    end if;
    -- Carril repetido en la misma serie o nadador repetido: dato malo.
    if (select count(*) from jsonb_array_elements(ev -> 'lanes') a)
         <> (select count(distinct (a ->> 'heat', a ->> 'lane')) from jsonb_array_elements(ev -> 'lanes') a)
       or (select count(*) from jsonb_array_elements(ev -> 'lanes') a)
         <> (select count(distinct a ->> 'entry_id') from jsonb_array_elements(ev -> 'lanes') a) then
      perform private.fail('invalido');
    end if;
    update public.swim_entries x set heat = null, lane = null where x.swim_event_id = v_se and x.heat is not null;
    for l in select value from jsonb_array_elements(ev -> 'lanes') loop
      v_heat := (l ->> 'heat')::integer;
      v_lane := (l ->> 'lane')::integer;
      if v_heat is null or v_lane is null or v_heat not between 1 and 99 or v_lane not between 1 and m.lanes then
        perform private.fail('invalido');
      end if;
      update public.swim_entries x set heat = v_heat, lane = v_lane where x.id = (l ->> 'entry_id')::uuid and x.swim_event_id = v_se;
      if not found then
        perform private.fail('invalido');
      end if;
      v_count := v_count + 1;
    end loop;
  end loop;
  update public.swim_meets x set heats_published_at = now() where x.event_id = p_meet;
  return v_count;
end $$;

-- Admin o cronometrista (anotador de la liga): publica los resultados de UNA serie de una vez (la cola del
-- teléfono los manda juntos al tocar «Publicar serie»). p_results = [{entry_id, time_cs | null, status}].
-- ok sin tiempo = borrar el resultado de ese carril. dns/dnf sin tiempo. Con p_op_id, reintentar no repite.
-- Devuelve cuántos carriles se guardaron.
create function public.swim_record_heat(p_swim_event uuid, p_heat integer, p_results jsonb, p_op_id uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_prev jsonb;
  v_league uuid;
  v_meet uuid;
  v_final timestamptz;
  r jsonb;
  v_status text;
  v_time integer;
  v_count integer := 0;
begin
  v_prev := private.op_begin(p_op_id, 'swim_record_heat');
  if v_prev is not null then
    return (v_prev #>> '{}')::integer;
  end if;
  select se.league_id, se.event_id into v_league, v_meet from public.swim_events se where se.id = p_swim_event;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  if not private.is_admin(v_league) and not private.is_scorer(v_league) then
    perform private.deny();
  end if;
  select m.finalized_at into v_final from public.swim_meets m where m.event_id = v_meet for share;
  if v_final is not null then
    perform private.fail('cerrado');
  end if;
  if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) > 10 then
    perform private.fail('invalido');
  end if;
  for r in select value from jsonb_array_elements(p_results) loop
    if jsonb_typeof(r) <> 'object' then
      perform private.fail('invalido');
    end if;
    v_status := coalesce(r ->> 'status', 'ok');
    if v_status not in ('ok', 'dq', 'dns', 'dnf') then
      perform private.fail('invalido');
    end if;
    v_time := private.swim_time(r -> 'time_cs');
    if v_status in ('dns', 'dnf') and v_time is not null then
      perform private.fail('invalido');
    end if;
    update public.swim_entries x set
      time_cs = v_time,
      status = v_status,
      result_at = case when v_status = 'ok' and v_time is null then null else now() end,
      recorded_by = v_uid
    where x.id = (r ->> 'entry_id')::uuid and x.swim_event_id = p_swim_event and x.heat = p_heat;
    if not found then
      perform private.fail('invalido');
    end if;
    v_count := v_count + 1;
  end loop;
  perform private.op_end(p_op_id, to_jsonb(v_count));
  return v_count;
end $$;

-- =====================================================================
-- Tiempo real (un aviso por sentencia; al borrar una liga no se avisa)
-- =====================================================================

-- Del encuentro: event:<id> 'swim' {t, op}. swim_meets también avisa a la liga (lista de encuentros).
create function private.swim_emit_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_t text := tg_argv[0];
begin
  if tg_op = 'DELETE' then
    for r in select distinct o.event_id, o.league_id from old_rows o loop
      if not private.deleting(r.league_id) then
        perform private.emit('event:' || r.event_id::text, 'swim', jsonb_build_object('t', v_t, 'op', 'delete'));
        if v_t = 'meet' then
          perform private.emit('league:' || r.league_id::text, 'swim', jsonb_build_object('t', 'meets', 'op', 'delete'));
        end if;
      end if;
    end loop;
  else
    for r in select distinct n.event_id, n.league_id from new_rows n loop
      perform private.emit('event:' || r.event_id::text, 'swim', jsonb_build_object('t', v_t, 'op', lower(tg_op)));
      if v_t = 'meet' then
        perform private.emit('league:' || r.league_id::text, 'swim', jsonb_build_object('t', 'meets', 'op', lower(tg_op)));
      end if;
    end loop;
  end if;
  return null;
end $$;

-- De la liga: league:<id> 'swim' {t: 'clubs' | 'swimmers', op}.
create function private.swim_emit_league() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_t text := tg_argv[0];
begin
  if tg_op = 'DELETE' then
    for r in select distinct o.league_id from old_rows o loop
      if not private.deleting(r.league_id) then
        perform private.emit('league:' || r.league_id::text, 'swim', jsonb_build_object('t', v_t, 'op', 'delete'));
      end if;
    end loop;
  else
    for r in select distinct n.league_id from new_rows n loop
      perform private.emit('league:' || r.league_id::text, 'swim', jsonb_build_object('t', v_t, 'op', lower(tg_op)));
    end loop;
  end if;
  return null;
end $$;

create trigger swim_entries_emit_insert after insert on public.swim_entries referencing new table as new_rows
  for each statement execute function private.swim_emit_event('entries');
create trigger swim_entries_emit_update after update on public.swim_entries referencing new table as new_rows
  for each statement execute function private.swim_emit_event('entries');
create trigger swim_entries_emit_delete after delete on public.swim_entries referencing old table as old_rows
  for each statement execute function private.swim_emit_event('entries');

create trigger swim_events_emit_insert after insert on public.swim_events referencing new table as new_rows
  for each statement execute function private.swim_emit_event('events');
create trigger swim_events_emit_update after update on public.swim_events referencing new table as new_rows
  for each statement execute function private.swim_emit_event('events');
create trigger swim_events_emit_delete after delete on public.swim_events referencing old table as old_rows
  for each statement execute function private.swim_emit_event('events');

create trigger swim_meets_emit_update after update on public.swim_meets referencing new table as new_rows
  for each statement execute function private.swim_emit_event('meet');

create trigger swim_clubs_emit_insert after insert on public.swim_clubs referencing new table as new_rows
  for each statement execute function private.swim_emit_league('clubs');
create trigger swim_clubs_emit_update after update on public.swim_clubs referencing new table as new_rows
  for each statement execute function private.swim_emit_league('clubs');
create trigger swim_clubs_emit_delete after delete on public.swim_clubs referencing old table as old_rows
  for each statement execute function private.swim_emit_league('clubs');

create trigger swim_swimmers_emit_insert after insert on public.swim_swimmers referencing new table as new_rows
  for each statement execute function private.swim_emit_league('swimmers');
create trigger swim_swimmers_emit_update after update on public.swim_swimmers referencing new table as new_rows
  for each statement execute function private.swim_emit_league('swimmers');
create trigger swim_swimmers_emit_delete after delete on public.swim_swimmers referencing old table as old_rows
  for each statement execute function private.swim_emit_league('swimmers');

-- =====================================================================
-- Permisos: todo lo de natación cerrado; las RPC de la app, solo con sesión
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array[
    'swim_create_meet', 'swim_update_meet', 'swim_save_events', 'swim_delete_event', 'swim_finalize_meet',
    'swim_save_club', 'swim_delete_club', 'swim_register_swimmer', 'swim_update_swimmer',
    'swim_enter', 'swim_unenter', 'swim_publish_heats', 'swim_record_heat'
  ];
begin
  for f in select p.oid::regprocedure as sig, n.nspname, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'private') and p.prokind = 'f' and p.proname like 'swim\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' and f.proname = any (v_rpc) then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
