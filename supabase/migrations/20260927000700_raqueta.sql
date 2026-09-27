-- MatchMate · Fase 3 · Tenis y pickleball, más la liga por cajas y la escalera (para toda la raqueta).
--
-- Va sobre la base de partidos (20260927000100_partidos.sql, docs/partidos.md) y lo del pádel
-- (20260927000600_padel.sql). Aquí:
--
-- - Eventos de tenis: 'liga' (liga de jugadores o de parejas), 'torneo', 'cajas' (liga por cajas mensual) y
--   'escalera'. De pickleball, además, 'americano' = round robin social con compañeros que rotan (el calendario
--   del americano con juegos a 11; config.game = {to, winBy, scoring}), y 'mexicano' / 'noche' por compatibilidad.
--   La configuración va en events.config (la escribe el admin con create_event / update_event).
-- - Partidos de tenis: '' o 'sets'. De pickleball: '' / 'sets' o 'americano' / 'mexicano' (un juego del round
--   robin). Forma del marcador: `sides` = sets (o juegos) ganados 0–3; en el round robin, puntos 0–99.
-- - Nivel manual en players.attrs: tenis `ntrp` (1.0–7.0), pickleball `dupr` (2.0–8.0). Números (12.0 = 12).
-- - private.night_league ahora incluye pickleball: save_night_round y save_points_result (del pádel) sirven para
--   el round robin social. Los juegos a 11 no tienen total fijo: rules.points.mode = 'game' (no 'total').
-- - Liga por cajas (tenis, pickleball y pádel): save_box_month (admin, atómica) abre el mes con sus cajas y sus
--   partidos; si había un mes abierto, lo cierra (anula lo que no se jugó y guarda quién sube y quién baja). Las
--   cajas y la tabla de cada caja las calcula el teléfono con src/sports/formats (box.ts); la base las guarda.
-- - Escalera (tenis, pickleball y pádel): ladder_rungs (puestos) y ladder_challenges (retos). El reto crea su
--   partido (lado 1 = retador, lado 2 = retado) y cuando el resultado cuenta (confirmado, W.O. o a las 48 h) la
--   escalera se mueve sola: si gana el retador toma el puesto del retado y los del medio bajan uno. Plazos: para
--   aceptar y para jugar; si se vencen, W.O. a favor del retador. Los plazos se aplican en sync_ladder (al abrir
--   la pantalla), en cada RPC de la escalera y por cron en Supabase (20260927000790_raqueta_cron_supabase.sql).
--   Corregir un resultado después de que la escalera se movió no la mueve otra vez: el admin la ordena con set_ladder.
--
-- Tiempo real: event:<escalera> y league:<liga> con el evento 'ladder' {t: 'rungs' | 'challenges', op}. Las cajas
-- usan los avisos de siempre (events y matches).

-- =====================================================================
-- Funciones de ayuda
-- =====================================================================

-- Deporte de raqueta de la liga ('padel' | 'tennis' | 'pickleball'), o null.
create function private.raq_sport(p_league uuid) returns text
language sql stable security definer set search_path = '' as $$
  select l.sport from public.leagues l where l.id = p_league and l.sport in ('padel', 'tennis', 'pickleball')
$$;

-- La liga puede tener noches de puntos (americano y mexicano del pádel; round robin social del pickleball).
create or replace function private.night_league(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.leagues l where l.id = p_league and l.sport in ('padel', 'pickleball'))
$$;

-- Texto con forma de uuid (antes de convertirlo).
create function private.raq_is_uuid(p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false)
$$;

-- Número de jsonb entre dos valores (12 y 12.0 valen igual).
create function private.raq_num_between(p jsonb, p_min numeric, p_max numeric) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'number' then coalesce((p #>> '{}')::numeric between p_min and p_max, false) else false end
$$;

-- Juego del round robin de pickleball: {to: 5–25, winBy: 1|2, scoring?: 'sideout'|'rally'}.
create function private.raq_game_ok(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'object' and jsonb_typeof(p -> 'to') = 'number'
              then coalesce((p ->> 'to')::numeric between 5 and 25 and (p ->> 'to')::numeric = trunc((p ->> 'to')::numeric)
                            and (not p ? 'winBy' or (p ->> 'winBy') in ('1', '2'))
                            and (not p ? 'scoring' or (p ->> 'scoring') in ('sideout', 'rally')), false)
              else false end
$$;

-- Marcador de un partido de tenis o pickleball: `sides` = sets o juegos ganados (0–3) o puntos del round robin
-- (0–99); `totals` (si viene) con sets 0–3, juegos 0–99 y puntos 0–9999 por lado.
create function private.raq_score_ok(p_format text, p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_max integer := case when p_format in ('americano', 'mexicano') then 99 else 3 end;
  k text;
  v_lim integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return true;
  end if;
  if jsonb_typeof(p -> 'sides') = 'array' and exists (
       select 1 from jsonb_array_elements(p -> 'sides') x where not private.raq_num_between(x, 0, v_max)) then
    return false;
  end if;
  if p_format not in ('americano', 'mexicano') and jsonb_typeof(p -> 'totals') = 'object' then
    for k, v_lim in select * from (values ('sets', 3), ('games', 99), ('points', 9999)) as t (k, lim) loop
      if (p -> 'totals') ? k and not (
           jsonb_typeof(p -> 'totals' -> k) = 'array' and jsonb_array_length(p -> 'totals' -> k) = 2
           and not exists (select 1 from jsonb_array_elements(p -> 'totals' -> k) x where not private.raq_num_between(x, 0, v_lim))) then
        return false;
      end if;
    end loop;
  end if;
  return true;
end $$;

-- =====================================================================
-- Tenis y pickleball: eventos, partidos y nivel
-- =====================================================================

-- Eventos: tipos del deporte, configuración chica (< 32 KB) y player_count (jugadores del round robin, parejas o
-- jugadores de la liga y del torneo, o los de las cajas del último mes).
create function private.raq_check_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sport text := (select l.sport from public.leagues l where l.id = new.league_id);
  v_config jsonb := coalesce(new.config, '{}'::jsonb);
  v_count integer;
  v_last jsonb;
begin
  if v_sport is null or v_sport not in ('tennis', 'pickleball') then
    return new;
  end if;
  if v_sport = 'tennis' and new.type not in ('liga', 'torneo', 'cajas', 'escalera') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Tipo de evento de tenis: liga, torneo, cajas o escalera.';
  end if;
  if v_sport = 'pickleball' and new.type not in ('americano', 'mexicano', 'noche', 'liga', 'torneo', 'cajas', 'escalera') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Tipo de evento de pickleball: round robin, liga, torneo, cajas o escalera.';
  end if;
  if jsonb_typeof(v_config) <> 'object' or pg_column_size(v_config) >= 32768 then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Configuración del evento no válida.';
  end if;
  if new.type in ('americano', 'mexicano') and v_config ? 'format' and v_config ->> 'format' <> new.type then
    raise exception 'invalido' using errcode = 'P0001', detail = 'El formato de la noche no coincide con el tipo.';
  end if;
  if v_config ? 'players' and (jsonb_typeof(v_config -> 'players') <> 'array' or jsonb_array_length(v_config -> 'players') > 64) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Jugadores no válidos.';
  end if;
  if v_config ? 'game' and jsonb_typeof(v_config -> 'game') <> 'null' and not private.raq_game_ok(v_config -> 'game') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'El juego del round robin va de 5 a 25 puntos, ganando por 1 o por 2.';
  end if;
  if v_config ? 'months' and jsonb_typeof(v_config -> 'months') <> 'array' then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Meses de la liga por cajas no válidos.';
  end if;
  if new.type = 'cajas' and jsonb_typeof(v_config -> 'months') = 'array' and jsonb_array_length(v_config -> 'months') > 0 then
    v_last := v_config -> 'months' -> (jsonb_array_length(v_config -> 'months') - 1);
    if jsonb_typeof(v_last -> 'boxes') = 'array' then
      v_count := (select coalesce(sum(jsonb_array_length(b)), 0)::integer
                    from jsonb_array_elements(v_last -> 'boxes') b where jsonb_typeof(b) = 'array');
    end if;
  elsif new.type <> 'escalera' then
    v_count := case
      when jsonb_typeof(v_config -> 'players') = 'array' then jsonb_array_length(v_config -> 'players')
      when jsonb_typeof(v_config -> 'pairs') = 'array' then jsonb_array_length(v_config -> 'pairs')
      when jsonb_typeof(v_config -> 'categories') = 'array' then
        (select coalesce(sum(jsonb_array_length(c -> 'pairs')), 0)::integer
           from jsonb_array_elements(v_config -> 'categories') c where jsonb_typeof(c -> 'pairs') = 'array')
    end;
  end if;
  if v_count is not null then
    new.player_count := v_count;
  end if;
  return new;
end $$;

create trigger events_raq_check before insert or update of type, league_id, config on public.events
  for each row execute function private.raq_check_event();

-- Partidos de tenis ('' o 'sets') y de pickleball (además 'americano' / 'mexicano' del round robin), con marcador
-- de su forma.
create function private.raq_check_match() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sport text := (select l.sport from public.leagues l where l.id = new.league_id);
begin
  if v_sport is null or v_sport not in ('tennis', 'pickleball') then
    return new;
  end if;
  if v_sport = 'tennis' and new.format not in ('', 'sets') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Formato de partido de tenis: sets.';
  end if;
  if v_sport = 'pickleball' and new.format not in ('', 'sets', 'americano', 'mexicano') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Formato de partido de pickleball: juegos o round robin.';
  end if;
  if not private.raq_score_ok(new.format, new.score) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Marcador no válido.';
  end if;
  return new;
end $$;

create trigger matches_raq_check before insert or update of format, score, league_id on public.matches
  for each row execute function private.raq_check_match();

-- Nivel manual: tenis `ntrp` de 1.0 a 7.0; pickleball `dupr` de 2.0 a 8.0 (null = sin nivel).
create function private.raq_check_player() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sport text;
  v_attrs jsonb := coalesce(new.attrs, '{}'::jsonb);
begin
  if jsonb_typeof(v_attrs) <> 'object' or not (v_attrs ? 'ntrp' or v_attrs ? 'dupr') then
    return new;
  end if;
  v_sport := (select l.sport from public.leagues l where l.id = new.league_id);
  if v_sport = 'tennis' and v_attrs ? 'ntrp' and jsonb_typeof(v_attrs -> 'ntrp') <> 'null'
     and not private.raq_num_between(v_attrs -> 'ntrp', 1, 7) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'El NTRP va de 1.0 a 7.0.';
  end if;
  if v_sport = 'pickleball' and v_attrs ? 'dupr' and jsonb_typeof(v_attrs -> 'dupr') <> 'null'
     and not private.raq_num_between(v_attrs -> 'dupr', 2, 8) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'El DUPR va de 2.0 a 8.0.';
  end if;
  return new;
end $$;

create trigger players_raq_check before insert or update of attrs, league_id on public.players
  for each row execute function private.raq_check_player();

-- =====================================================================
-- Liga por cajas: abrir (y cerrar) el mes
-- =====================================================================
-- Admin. p_month = el mes que se abre: el siguiente (cierra el que estaba abierto) o el mismo (lo rehace si
-- ninguno de sus partidos empezó). p_boxes = [[id, id, …], …] de arriba abajo (jugadores en individual o parejas
-- de temporada en dobles; cada uno una sola vez; cajas de 2 a 12). p_matches = partidos del mes como en
-- create_matches (quedan del evento, con round = mes y formato 'sets'). p_moves = quién subió y quién bajó al
-- cerrar el mes anterior ([{id, from, to, move, reason?}], lo calcula closeBoxMonth). Devuelve los ids de los
-- partidos en el mismo orden.
create function public.save_box_month(
  p_event uuid,
  p_month integer,
  p_boxes jsonb,
  p_matches jsonb default '[]',
  p_label text default null,
  p_start date default null,
  p_end date default null,
  p_moves jsonb default null
) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v_months jsonb;
  v_n integer;
  v_ids uuid[] := '{}';
  v_all text[];
  v_month jsonb;
  v_prev jsonb;
begin
  perform private.require_uid();
  select * into e from public.events x where x.id = p_event for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(e.league_id);
  if private.raq_sport(e.league_id) is null or e.type <> 'cajas' then
    perform private.fail('invalido');
  end if;
  v_months := case when jsonb_typeof(e.config -> 'months') = 'array' then e.config -> 'months' else '[]'::jsonb end;
  v_n := jsonb_array_length(v_months);
  if p_month is null or p_month < 1 or p_month > 120 or p_month not in (v_n, v_n + 1) then
    perform private.fail('invalido');
  end if;
  -- Cajas: lista de listas de ids, sin repetir, de la liga.
  if jsonb_typeof(p_boxes) is distinct from 'array' or jsonb_array_length(p_boxes) not between 1 and 50
     or exists (select 1 from jsonb_array_elements(p_boxes) b
                 where jsonb_typeof(b) <> 'array' or jsonb_array_length(b) not between 2 and 12
                    or exists (select 1 from jsonb_array_elements(b) x where jsonb_typeof(x) <> 'string' or not private.raq_is_uuid(x #>> '{}'))) then
    perform private.fail('invalido');
  end if;
  select array_agg(x #>> '{}') into v_all from jsonb_array_elements(p_boxes) b, jsonb_array_elements(b) x;
  if (select count(distinct a) from unnest(v_all) a) <> cardinality(v_all)
     or exists (select 1 from unnest(v_all) a
                 where not exists (select 1 from public.players p where p.id = a::uuid and p.league_id = e.league_id)
                   and not exists (select 1 from public.teams t where t.id = a::uuid and t.league_id = e.league_id and t.event_id is null)) then
    perform private.fail('invalido');
  end if;
  if jsonb_typeof(coalesce(p_matches, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_matches, '[]'::jsonb)) > 500
     or exists (select 1 from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) x where jsonb_typeof(x) <> 'object')
     or (p_moves is not null and (jsonb_typeof(p_moves) <> 'array' or jsonb_array_length(p_moves) > 600))
     or char_length(coalesce(p_label, '')) > 40 or (p_start is not null and p_end is not null and p_end < p_start) then
    perform private.fail('invalido');
  end if;

  if p_month = v_n then
    -- Rehacer el mes abierto: solo si no está cerrado y nadie empezó a jugar.
    v_prev := v_months -> (v_n - 1);
    if coalesce((v_prev ->> 'closed')::boolean, false) then
      perform private.fail('cerrado');
    end if;
    if exists (select 1 from public.matches m where m.event_id = p_event and m.round = p_month and (m.status <> 'scheduled' or m.seq > 0)) then
      perform private.fail('cerrado');
    end if;
    delete from public.matches m where m.event_id = p_event and m.round = p_month;
  elsif v_n > 0 then
    -- Cerrar el mes anterior: lo que no se jugó queda anulado; se guardan las subidas y bajadas.
    update public.matches x set
      status = 'void',
      scorer_id = null,
      lease_until = null,
      note = 'Mes cerrado sin jugar',
      history = private.match_history(x.history, 'void', 'Mes cerrado sin jugar')
    where x.event_id = p_event and x.round = v_n and x.status in ('scheduled', 'postponed');
    v_prev := (v_months -> (v_n - 1)) || jsonb_build_object('closed', true, 'closedAt', now(), 'moves', coalesce(p_moves, '[]'::jsonb));
    v_months := jsonb_set(v_months, array[(v_n - 1)::text], v_prev);
  end if;

  v_month := jsonb_strip_nulls(jsonb_build_object(
    'n', p_month,
    'label', nullif(btrim(coalesce(p_label, '')), ''),
    'start', p_start,
    'end', p_end,
    'boxes', p_boxes,
    'closed', false));
  if p_month = v_n then
    v_months := jsonb_set(v_months, array[(v_n - 1)::text], v_month);
  else
    v_months := v_months || jsonb_build_array(v_month);
  end if;
  update public.events x set config = coalesce(x.config, '{}'::jsonb) || jsonb_build_object('months', v_months, 'round', p_month)
   where x.id = p_event;

  if jsonb_array_length(coalesce(p_matches, '[]'::jsonb)) > 0 then
    v_ids := public.create_matches(e.league_id, (
      select jsonb_agg((x - 'event_id' - 'round' - 'bracket_key') || jsonb_build_object('event_id', p_event, 'round', p_month, 'format', 'sets')
                       order by n)
        from jsonb_array_elements(p_matches) with ordinality as a (x, n)));
  end if;
  return v_ids;
end $$;

-- =====================================================================
-- Escalera: tablas
-- =====================================================================

-- Puestos de la escalera (1 = arriba). En individual el participante es un jugador; en dobles, una pareja de
-- temporada (teams sin evento). entrant_id = player_id o team_id.
create table public.ladder_rungs (
  event_id uuid not null,
  league_id uuid not null,
  entrant_id uuid not null,
  player_id uuid,
  team_id uuid,
  position smallint not null check (position between 1 and 999),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, entrant_id),
  -- Se revisa al final de cada sentencia: mover a varios de puesto en una sola sentencia no choca.
  constraint ladder_rungs_position_key unique (event_id, position) deferrable initially immediate,
  check (num_nonnulls(player_id, team_id) = 1 and entrant_id = coalesce(player_id, team_id)),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade,
  foreign key (team_id, league_id) references public.teams (id, league_id) on delete cascade
);
create index ladder_rungs_player_idx on public.ladder_rungs (player_id);
create index ladder_rungs_team_idx on public.ladder_rungs (team_id);
create index ladder_rungs_sync_idx on public.ladder_rungs (league_id, updated_at);

-- Retos. Abiertos: 'pending' (falta que el retado acepte) y 'accepted'. Cerrados: 'played', 'walkover'
-- (no se presentó, o se venció el plazo) y 'cancelled'. winner = participante que ganó.
create table public.ladder_challenges (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null,
  event_id uuid not null,
  challenger uuid not null,
  challenged uuid not null,
  -- Puestos de los dos cuando se creó el reto (para mostrar).
  challenger_pos smallint,
  challenged_pos smallint,
  match_id uuid,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'played', 'walkover', 'cancelled')),
  accept_by timestamptz not null,
  play_by timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  winner uuid,
  note text check (char_length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, league_id),
  check (challenger <> challenged),
  check (winner is null or winner in (challenger, challenged)),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  foreign key (match_id, league_id) references public.matches (id, league_id) on delete set null (match_id)
);
create index ladder_challenges_event_idx on public.ladder_challenges (event_id, status);
create index ladder_challenges_match_idx on public.ladder_challenges (match_id);
create index ladder_challenges_sync_idx on public.ladder_challenges (league_id, updated_at);

create trigger ladder_rungs_touch before update on public.ladder_rungs for each row execute function private.touch_updated_at();
create trigger ladder_challenges_touch before update on public.ladder_challenges for each row execute function private.touch_updated_at();
create trigger ladder_rungs_tombstone after delete on public.ladder_rungs for each row execute function private.tombstone('event_id', 'entrant_id');
create trigger ladder_challenges_tombstone after delete on public.ladder_challenges for each row execute function private.tombstone('id');

-- La escalera solo existe en eventos 'escalera' de ligas de raqueta (también para service_role).
create function private.ladder_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.events e where e.id = new.event_id and e.type = 'escalera')
     or private.raq_sport(new.league_id) is null then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Solo en una escalera de una liga de raqueta.';
  end if;
  if new.team_id is not null and exists (select 1 from public.teams t where t.id = new.team_id and t.event_id is not null) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'En dobles, la escalera es de parejas de la temporada.';
  end if;
  return new;
end $$;

create trigger ladder_rungs_guard before insert or update of event_id, league_id, team_id on public.ladder_rungs
  for each row execute function private.ladder_guard();

-- RLS: los ve quien ve la liga.
alter table public.ladder_rungs enable row level security;
alter table public.ladder_challenges enable row level security;
create policy ladder_rungs_read on public.ladder_rungs for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy ladder_challenges_read on public.ladder_challenges for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
revoke all on public.ladder_rungs, public.ladder_challenges from public, anon, authenticated;
grant select on public.ladder_rungs, public.ladder_challenges to anon, authenticated;

-- =====================================================================
-- Escalera: ayudas
-- =====================================================================

-- Opción entera de la configuración, dentro de sus límites (o la de por defecto).
create function private.ladder_opt(p_config jsonb, p_key text, p_default integer, p_min integer, p_max integer) returns integer
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_config -> p_key) = 'number'
              then least(p_max, greatest(p_min, round((p_config ->> p_key)::numeric)::integer))
              else p_default end
$$;

-- La escalera es de parejas (config.doubles = true) o de jugadores.
create function private.ladder_doubles(p_config jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(p_config -> 'doubles') = 'boolean' and (p_config ->> 'doubles')::boolean, false)
$$;

-- El evento 'escalera' bloqueado (para que dos retos a la vez no choquen). 'no_existe' / 'invalido'.
create function private.ladder_event(p_event uuid) returns public.events
language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
begin
  select * into e from public.events x where x.id = p_event for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  if e.type <> 'escalera' or private.raq_sport(e.league_id) is null then
    perform private.fail('invalido');
  end if;
  return e;
end $$;

-- El participante sirve para esa escalera: jugador de la liga (individual) o pareja de temporada (dobles).
create function private.ladder_entrant_ok(p_league uuid, p_doubles boolean, p_entrant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_doubles
              then exists (select 1 from public.teams t where t.id = p_entrant and t.league_id = p_league and t.event_id is null)
              else exists (select 1 from public.players p where p.id = p_entrant and p.league_id = p_league) end
$$;

-- La cuenta es ese participante (su jugador) o juega en esa pareja.
create function private.ladder_mine(p_entrant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.players p where p.id = p_entrant and p.user_id = (select auth.uid()))
      or exists (select 1 from public.team_players tp join public.players p on p.id = tp.player_id
                  where tp.team_id = p_entrant and p.user_id = (select auth.uid()))
$$;

-- El participante de la cuenta en esa escalera (el que está en ella); null si no tiene o si tiene varios.
create function private.ladder_my_entrant(p_event uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when count(*) = 1 then min(r.entrant_id::text)::uuid end
    from public.ladder_rungs r where r.event_id = p_event and private.ladder_mine(r.entrant_id)
$$;

-- Cuentas de un participante (para los avisos).
create function private.ladder_users(p_entrant uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.user_id from public.players p where p.id = p_entrant and p.user_id is not null
  union
  select p.user_id from public.team_players tp join public.players p on p.id = tp.player_id
   where tp.team_id = p_entrant and p.user_id is not null
$$;

-- Nombre del participante (jugador o pareja).
create function private.ladder_name(p_entrant uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select t.name from public.teams t where t.id = p_entrant), (select p.name from public.players p where p.id = p_entrant), 'Alguien')
$$;

-- Puestos seguidos (1, 2, 3…) sin huecos, y player_count del evento.
create function private.ladder_compact(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.ladder_rungs r set position = t.rn
    from (select x.entrant_id, row_number() over (order by x.position, x.joined_at, x.entrant_id) as rn
            from public.ladder_rungs x where x.event_id = p_event) t
   where r.event_id = p_event and r.entrant_id = t.entrant_id and r.position <> t.rn;
  update public.events e set player_count = (select count(*) from public.ladder_rungs r where r.event_id = p_event)
   where e.id = p_event and e.player_count is distinct from (select count(*) from public.ladder_rungs r where r.event_id = p_event);
end $$;

-- Mueve la escalera con un resultado: si el ganador estaba más abajo, toma el puesto del perdedor y este (y los
-- del medio) bajan uno. Devuelve true si cambió algo.
create function private.ladder_move(p_event uuid, p_winner uuid, p_loser uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  w integer := (select r.position from public.ladder_rungs r where r.event_id = p_event and r.entrant_id = p_winner);
  l integer := (select r.position from public.ladder_rungs r where r.event_id = p_event and r.entrant_id = p_loser);
begin
  if w is null or l is null or w < l then
    return false;
  end if;
  update public.ladder_rungs r
     set position = case when r.entrant_id = p_winner then l else r.position + 1 end
   where r.event_id = p_event and r.position between l and w;
  return true;
end $$;

-- Cierra un reto abierto: 'played' / 'walkover' con su ganador (mueve la escalera) o 'cancelled'.
create function private.ladder_resolve(p_challenge uuid, p_status text, p_winner uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.ladder_challenges;
begin
  select * into c from public.ladder_challenges x where x.id = p_challenge for update;
  if not found or c.status not in ('pending', 'accepted') then
    return;
  end if;
  if p_status in ('played', 'walkover') and p_winner in (c.challenger, c.challenged) then
    perform private.ladder_move(c.event_id, p_winner, case when p_winner = c.challenger then c.challenged else c.challenger end);
    update public.ladder_challenges x set status = p_status, winner = p_winner, resolved_at = now(), note = coalesce(p_note, x.note)
     where x.id = c.id;
  else
    update public.ladder_challenges x set status = 'cancelled', winner = null, resolved_at = now(), note = coalesce(p_note, x.note)
     where x.id = c.id;
  end if;
end $$;

-- El partido del reto terminó, se anuló o quedó en W.O.: cierra el reto (lado 1 = retador, lado 2 = retado).
create function private.ladder_from_match(c public.ladder_challenges, m public.matches) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if m.status = 'void' then
    perform private.ladder_resolve(c.id, 'cancelled', null, 'Partido anulado');
    return true;
  end if;
  if m.status = 'walkover' then
    if m.walkover_side in (1, 2) then
      perform private.ladder_resolve(c.id, 'walkover', case m.walkover_side when 1 then c.challenged else c.challenger end);
    else
      perform private.ladder_resolve(c.id, 'cancelled', null, 'Ninguno se presentó');
    end if;
    return true;
  end if;
  if private.match_final(m.status, m.proposed_at) and m.winner_side in (1, 2) then
    perform private.ladder_resolve(c.id, 'played', case m.winner_side when 1 then c.challenger else c.challenged end);
    return true;
  end if;
  return false;
end $$;

-- Aplica lo que toca en la escalera: resultados que ya cuentan (también a las 48 h), partidos anulados o borrados,
-- y plazos vencidos (W.O. a favor del retador: el retado no aceptó a tiempo, o no se jugó a tiempo). Un resultado
-- anotado esperando confirmación, en disputa, en vivo o suspendido no vence (decide el admin). Devuelve cuántos
-- retos cerró.
create function private.ladder_sync(p_event uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c public.ladder_challenges;
  m public.matches;
  v_n integer := 0;
  v_due timestamptz;
  v_why text;
begin
  for c in
    select * from public.ladder_challenges x
     where x.event_id = p_event and x.status in ('pending', 'accepted')
     order by case when x.status = 'pending' then x.accept_by else x.play_by end, x.created_at, x.id
  loop
    v_due := case when c.status = 'pending' then c.accept_by else c.play_by end;
    v_why := case when c.status = 'pending' then 'No aceptó el reto a tiempo' else 'No se jugó a tiempo' end;
    select * into m from public.matches x where x.id = c.match_id;
    if not found then
      perform private.ladder_resolve(c.id, 'cancelled', null, 'Partido borrado');
      v_n := v_n + 1;
    elsif private.ladder_from_match(c, m) then
      v_n := v_n + 1;
    elsif m.status in ('scheduled', 'postponed') and now() > v_due then
      -- El partido pasa a W.O. (no vino el retado) y el trigger de partidos cierra el reto.
      update public.matches x set
        status = 'walkover',
        walkover_side = 2,
        winner_side = 1,
        score = jsonb_build_object('text', 'W.O.'),
        scorer_id = null,
        lease_until = null,
        confirmed_at = now(),
        note = v_why,
        history = private.match_history(x.history, 'walkover', v_why, jsonb_build_object('absent', 2))
      where x.id = m.id;
      -- Por si el trigger no lo cerró.
      perform private.ladder_resolve(c.id, 'walkover', c.challenger, v_why);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- Todas las escaleras con retos abiertos (cron cada 15 minutos en Supabase).
create function private.ladder_expire_all() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in select distinct c.event_id from public.ladder_challenges c where c.status in ('pending', 'accepted') loop
    v_n := v_n + private.ladder_sync(r.event_id);
  end loop;
  return v_n;
end $$;

-- Cuando el partido de un reto queda confirmado, en W.O. o anulado, el reto se cierra y la escalera se mueve.
create function private.ladder_on_match() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.ladder_challenges;
begin
  for c in select * from public.ladder_challenges x where x.match_id = new.id and x.status in ('pending', 'accepted') loop
    perform private.ladder_from_match(c, new);
  end loop;
  return null;
end $$;

create trigger matches_ladder after update of status on public.matches for each row
  when (new.status in ('confirmed', 'walkover', 'void') and new.status is distinct from old.status)
  execute function private.ladder_on_match();

-- Cancela un reto abierto y anula su partido si no ha empezado.
create function private.ladder_cancel(p_challenge uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_match uuid := (select c.match_id from public.ladder_challenges c where c.id = p_challenge);
begin
  perform private.ladder_resolve(p_challenge, 'cancelled', null, p_note);
  update public.matches x set
    status = 'void',
    scorer_id = null,
    lease_until = null,
    note = left(coalesce(p_note, 'Reto cancelado'), 500),
    history = private.match_history(x.history, 'void', left(coalesce(p_note, 'Reto cancelado'), 500))
  where x.id = v_match and x.status in ('scheduled', 'postponed') and x.seq = 0;
end $$;

-- Aviso a las cuentas de un participante (nunca frena la escritura).
create function private.ladder_push(p_entrant uuid, p_league uuid, p_event uuid, p_title text, p_body text, p_tag text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
  select u, left(p_title, 200), left(p_body, 1000), '/l/' || p_league::text || '/e/' || p_event::text, left(p_tag, 100), 259200, 'high'
    from private.ladder_users(p_entrant) u
   where u is distinct from (select auth.uid());
  if exists (select 1 from public.push_outbox o where o.tag = left(p_tag, 100) and o.sent_at is null) then
    perform private.kick_send_push();
  end if;
exception when others then
  raise warning 'push de la escalera %: %', p_event, sqlerrm;
end $$;

-- =====================================================================
-- Escalera: RPC
-- =====================================================================

-- Admin: la escalera completa en orden (arriba primero). Quien no esté en la lista sale (sus retos abiertos se
-- cancelan). En individual, jugadores de la liga; en dobles, parejas de temporada. Devuelve cuántos quedaron.
create function public.set_ladder(p_event uuid, p_entrants jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v_doubles boolean;
  v_ids uuid[];
  c record;
begin
  perform private.require_uid();
  e := private.ladder_event(p_event);
  perform private.require_admin(e.league_id);
  v_doubles := private.ladder_doubles(e.config);
  if jsonb_typeof(p_entrants) is distinct from 'array' or jsonb_array_length(p_entrants) > 200
     or exists (select 1 from jsonb_array_elements(p_entrants) x where jsonb_typeof(x) <> 'string' or not private.raq_is_uuid(x #>> '{}')) then
    perform private.fail('invalido');
  end if;
  select coalesce(array_agg((x #>> '{}')::uuid order by n), '{}') into v_ids from jsonb_array_elements(p_entrants) with ordinality as a (x, n);
  if (select count(distinct a) from unnest(v_ids) a) <> cardinality(v_ids)
     or exists (select 1 from unnest(v_ids) a where not private.ladder_entrant_ok(e.league_id, v_doubles, a)) then
    perform private.fail('invalido');
  end if;
  perform private.ladder_sync(p_event);
  for c in select x.id from public.ladder_challenges x
            where x.event_id = p_event and x.status in ('pending', 'accepted')
              and (x.challenger <> all (v_ids) or x.challenged <> all (v_ids)) loop
    perform private.ladder_cancel(c.id, 'Salió de la escalera');
  end loop;
  delete from public.ladder_rungs r where r.event_id = p_event and r.entrant_id <> all (v_ids);
  insert into public.ladder_rungs as r (event_id, league_id, entrant_id, player_id, team_id, position)
  select p_event, e.league_id, a.id, case when v_doubles then null else a.id end, case when v_doubles then a.id end, a.n
    from unnest(v_ids) with ordinality as a (id, n)
  on conflict (event_id, entrant_id) do update set position = excluded.position
    where r.position is distinct from excluded.position;
  perform private.ladder_compact(p_event);
  return cardinality(v_ids);
end $$;

-- Entrar a la escalera (abajo del todo). Un jugador entra con su jugador (o su pareja en dobles) si la escalera
-- está abierta (config.open); el admin mete a cualquiera. Ya estaba: nada. Devuelve el puesto.
create function public.join_ladder(p_event uuid, p_entrant uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v_doubles boolean;
  v_admin boolean;
  v_entrant uuid := p_entrant;
  v_pos integer;
begin
  perform private.require_uid();
  e := private.ladder_event(p_event);
  v_doubles := private.ladder_doubles(e.config);
  v_admin := private.is_admin(e.league_id);
  if v_entrant is null then
    if v_doubles then
      select case when count(*) = 1 then min(tp.team_id::text)::uuid end into v_entrant
        from public.team_players tp
        join public.players p on p.id = tp.player_id
        join public.teams t on t.id = tp.team_id and t.event_id is null
       where p.user_id = (select auth.uid()) and p.league_id = e.league_id;
    else
      v_entrant := private.my_player(e.league_id);
    end if;
    if v_entrant is null then
      perform private.fail('invalido');
    end if;
  end if;
  if not v_admin then
    if not private.is_member(e.league_id) or not private.ladder_mine(v_entrant) then
      perform private.deny();
    end if;
    if not coalesce((e.config ->> 'open')::boolean, false) then
      perform private.deny();
    end if;
  end if;
  if not private.ladder_entrant_ok(e.league_id, v_doubles, v_entrant) then
    perform private.fail('invalido');
  end if;
  select r.position into v_pos from public.ladder_rungs r where r.event_id = p_event and r.entrant_id = v_entrant;
  if v_pos is not null then
    return v_pos;
  end if;
  v_pos := coalesce((select max(r.position) from public.ladder_rungs r where r.event_id = p_event), 0) + 1;
  if v_pos > 999 then
    perform private.fail('invalido');
  end if;
  insert into public.ladder_rungs (event_id, league_id, entrant_id, player_id, team_id, position)
  values (p_event, e.league_id, v_entrant, case when v_doubles then null else v_entrant end, case when v_doubles then v_entrant end, v_pos);
  perform private.ladder_compact(p_event);
  return v_pos;
end $$;

-- Salir de la escalera: el propio participante o el admin. Sus retos abiertos se cancelan y los de abajo suben
-- uno. false si no estaba.
create function public.leave_ladder(p_event uuid, p_entrant uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  c record;
begin
  perform private.require_uid();
  e := private.ladder_event(p_event);
  if not (private.is_admin(e.league_id) or (private.is_member(e.league_id) and private.ladder_mine(p_entrant))) then
    perform private.deny();
  end if;
  if not exists (select 1 from public.ladder_rungs r where r.event_id = p_event and r.entrant_id = p_entrant) then
    return false;
  end if;
  perform private.ladder_sync(p_event);
  for c in select x.id from public.ladder_challenges x
            where x.event_id = p_event and x.status in ('pending', 'accepted') and p_entrant in (x.challenger, x.challenged) loop
    perform private.ladder_cancel(c.id, 'Salió de la escalera');
  end loop;
  delete from public.ladder_rungs r where r.event_id = p_event and r.entrant_id = p_entrant;
  perform private.ladder_compact(p_event);
  return true;
end $$;

-- Retar: el retador (su jugador o su pareja; el admin, cualquiera) reta a alguien hasta config.maxUp puestos más
-- arriba (3 por defecto). Ninguno de los dos puede tener otro reto abierto ('duplicado'). Crea el partido (lado 1
-- retador, lado 2 retado; reglas de config.rules o de la liga) y el reto con sus plazos (config.acceptDays 3 y
-- config.playDays 7 por defecto). Avisa al retado. Devuelve el id del reto (p_id si lo generó el teléfono).
create function public.create_challenge(p_event uuid, p_challenged uuid, p_challenger uuid default null, p_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  e public.events;
  v_admin boolean;
  v_doubles boolean;
  v_challenger uuid := p_challenger;
  v_pc integer;
  v_pd integer;
  v_match uuid := gen_random_uuid();
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_rules jsonb;
  v_side jsonb;
begin
  e := private.ladder_event(p_event);
  v_admin := private.is_admin(e.league_id);
  v_doubles := private.ladder_doubles(e.config);
  if not (v_admin or private.is_member(e.league_id)) then
    perform private.deny();
  end if;
  perform private.ladder_sync(p_event);
  if v_challenger is null then
    v_challenger := private.ladder_my_entrant(p_event);
    if v_challenger is null then
      perform private.fail('invalido');
    end if;
  end if;
  if not v_admin and not private.ladder_mine(v_challenger) then
    perform private.deny();
  end if;
  if p_challenged is null or p_challenged = v_challenger then
    perform private.fail('invalido');
  end if;
  select r.position into v_pc from public.ladder_rungs r where r.event_id = p_event and r.entrant_id = v_challenger;
  select r.position into v_pd from public.ladder_rungs r where r.event_id = p_event and r.entrant_id = p_challenged;
  if v_pc is null or v_pd is null or v_pd >= v_pc or v_pc - v_pd > private.ladder_opt(e.config, 'maxUp', 3, 1, 20) then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from public.ladder_challenges x
              where x.event_id = p_event and x.status in ('pending', 'accepted')
                and (x.challenger in (v_challenger, p_challenged) or x.challenged in (v_challenger, p_challenged))) then
    perform private.fail('duplicado');
  end if;
  v_rules := case when jsonb_typeof(e.config -> 'rules') = 'object' then e.config -> 'rules'
                  else (select l.rules from public.leagues l where l.id = e.league_id) end;
  insert into public.matches (id, league_id, event_id, stage, format, rules, require_confirm, created_by)
  values (v_match, e.league_id, p_event, 'Reto', 'sets', coalesce(v_rules, '{}'::jsonb), true, v_uid);
  v_side := case when v_doubles
    then jsonb_build_array(jsonb_build_object('side', 1, 'team_id', v_challenger), jsonb_build_object('side', 2, 'team_id', p_challenged))
    else jsonb_build_array(jsonb_build_object('side', 1, 'players', jsonb_build_array(jsonb_build_object('player_id', v_challenger))),
                           jsonb_build_object('side', 2, 'players', jsonb_build_array(jsonb_build_object('player_id', p_challenged)))) end;
  perform private.write_sides(v_match, e.league_id, v_side);
  insert into public.ladder_challenges (id, league_id, event_id, challenger, challenged, challenger_pos, challenged_pos, match_id,
                                        accept_by, play_by, created_by)
  values (v_id, e.league_id, p_event, v_challenger, p_challenged, v_pc, v_pd, v_match,
          now() + make_interval(days => private.ladder_opt(e.config, 'acceptDays', 3, 1, 30)),
          now() + make_interval(days => private.ladder_opt(e.config, 'playDays', 7, 1, 60)),
          v_uid);
  perform private.ladder_push(p_challenged, e.league_id, p_event, 'Te retaron en la escalera',
    private.ladder_name(v_challenger) || ' (puesto ' || v_pc || ') te retó. Acepta el reto antes de '
      || private.ladder_opt(e.config, 'acceptDays', 3, 1, 30) || ' días.', 'reto:' || v_id::text);
  return v_id;
end $$;

-- El retado (o el admin) acepta el reto antes del plazo. Puede poner cuándo y dónde juegan. Devuelve el estado del
-- reto: 'accepted', o el que quedó si ya estaba cerrado (p. ej. 'walkover' si se venció el plazo al aceptar tarde;
-- no es un error, así el W.O. queda guardado).
create function public.accept_challenge(p_challenge uuid, p_scheduled_at timestamptz default null, p_court text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  c public.ladder_challenges;
  e public.events;
  v_court text := nullif(btrim(coalesce(p_court, '')), '');
begin
  select * into c from public.ladder_challenges x where x.id = p_challenge;
  if not found then
    perform private.fail('no_existe');
  end if;
  e := private.ladder_event(c.event_id);
  if not (private.is_admin(c.league_id) or (private.is_member(c.league_id) and private.ladder_mine(c.challenged))) then
    perform private.deny();
  end if;
  if char_length(coalesce(v_court, '')) > 40 then
    perform private.fail('invalido');
  end if;
  perform private.ladder_sync(c.event_id);
  select * into c from public.ladder_challenges x where x.id = p_challenge for update;
  if c.status not in ('pending', 'accepted') then
    return c.status;
  end if;
  if c.status = 'accepted' and p_scheduled_at is null and v_court is null then
    return c.status;
  end if;
  update public.ladder_challenges x set
    status = 'accepted',
    accepted_at = coalesce(x.accepted_at, now()),
    accepted_by = coalesce(x.accepted_by, v_uid)
  where x.id = c.id;
  if p_scheduled_at is not null or v_court is not null then
    update public.matches x set
      scheduled_at = coalesce(p_scheduled_at, x.scheduled_at),
      court = coalesce(v_court, x.court),
      history = private.match_history(x.history, 'schedule', null,
                  jsonb_build_object('to', jsonb_build_object('at', coalesce(p_scheduled_at, x.scheduled_at), 'court', coalesce(v_court, x.court))))
    where x.id = c.match_id and x.status in ('scheduled', 'postponed');
  end if;
  if c.status = 'pending' then
    perform private.ladder_push(c.challenger, c.league_id, c.event_id, 'Aceptaron tu reto',
      private.ladder_name(c.challenged) || ' aceptó el reto. A jugar antes del plazo.', 'reto:' || c.id::text);
  end if;
  return 'accepted';
end $$;

-- Cancelar un reto abierto: el retador mientras no lo acepten, o el admin siempre. Su partido se anula (si no
-- empezó). false si el reto ya estaba cerrado.
create function public.cancel_challenge(p_challenge uuid, p_note text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  c public.ladder_challenges;
  e public.events;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.require_uid();
  select * into c from public.ladder_challenges x where x.id = p_challenge;
  if not found then
    perform private.fail('no_existe');
  end if;
  e := private.ladder_event(c.event_id);
  if char_length(coalesce(v_note, '')) > 500 then
    perform private.fail('invalido');
  end if;
  if not (private.is_admin(c.league_id) or (private.is_member(c.league_id) and private.ladder_mine(c.challenger))) then
    perform private.deny();
  end if;
  if c.status not in ('pending', 'accepted') then
    return false;
  end if;
  if c.status <> 'pending' and not private.is_admin(c.league_id) then
    perform private.deny();
  end if;
  perform private.ladder_cancel(c.id, coalesce(v_note, 'Reto cancelado'));
  return true;
end $$;

-- Aplica lo vencido y los resultados que ya cuentan (la pantalla lo llama al abrir). Cualquiera que vea la liga
-- con sesión. Devuelve cuántos retos cerró.
create function public.sync_ladder(p_event uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
begin
  perform private.require_uid();
  v_league := (select e.league_id from public.events e where e.id = p_event);
  if v_league is null or v_league not in (select private.readable_leagues()) then
    perform private.fail('no_existe');
  end if;
  if not exists (select 1 from public.ladder_challenges c where c.event_id = p_event and c.status in ('pending', 'accepted')) then
    return 0;
  end if;
  perform private.ladder_event(p_event);
  return private.ladder_sync(p_event);
end $$;

-- =====================================================================
-- Tiempo real: event:<escalera> y league:<liga> 'ladder' {t, op} (una vez por sentencia)
-- =====================================================================
create function private.ladder_emit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_t text := tg_argv[0];
begin
  if tg_op = 'DELETE' then
    for r in select distinct o.event_id, o.league_id from old_rows o loop
      if not private.deleting(r.league_id) then
        perform private.emit('event:' || r.event_id::text, 'ladder', jsonb_build_object('t', v_t, 'op', 'delete'));
        perform private.emit('league:' || r.league_id::text, 'ladder', jsonb_build_object('t', v_t, 'op', 'delete', 'event_id', r.event_id));
      end if;
    end loop;
  else
    for r in select distinct n.event_id, n.league_id from new_rows n loop
      perform private.emit('event:' || r.event_id::text, 'ladder', jsonb_build_object('t', v_t, 'op', lower(tg_op)));
      perform private.emit('league:' || r.league_id::text, 'ladder', jsonb_build_object('t', v_t, 'op', lower(tg_op), 'event_id', r.event_id));
    end loop;
  end if;
  return null;
end $$;

create trigger ladder_rungs_emit_insert after insert on public.ladder_rungs referencing new table as new_rows
  for each statement execute function private.ladder_emit('rungs');
create trigger ladder_rungs_emit_update after update on public.ladder_rungs referencing new table as new_rows
  for each statement execute function private.ladder_emit('rungs');
create trigger ladder_rungs_emit_delete after delete on public.ladder_rungs referencing old table as old_rows
  for each statement execute function private.ladder_emit('rungs');
create trigger ladder_challenges_emit_insert after insert on public.ladder_challenges referencing new table as new_rows
  for each statement execute function private.ladder_emit('challenges');
create trigger ladder_challenges_emit_update after update on public.ladder_challenges referencing new table as new_rows
  for each statement execute function private.ladder_emit('challenges');
create trigger ladder_challenges_emit_delete after delete on public.ladder_challenges referencing old table as old_rows
  for each statement execute function private.ladder_emit('challenges');

-- =====================================================================
-- Permisos: cerrado todo lo de esta migración; las RPC, solo con sesión
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array[
    'save_box_month', 'set_ladder', 'join_ladder', 'leave_ladder', 'create_challenge', 'accept_challenge', 'cancel_challenge', 'sync_ladder'
  ];
  v_private constant text[] := array[
    'raq_sport', 'night_league', 'raq_is_uuid', 'raq_num_between', 'raq_game_ok', 'raq_score_ok', 'raq_check_event', 'raq_check_match',
    'raq_check_player', 'ladder_guard', 'ladder_opt', 'ladder_doubles', 'ladder_event', 'ladder_entrant_ok', 'ladder_mine',
    'ladder_my_entrant', 'ladder_users', 'ladder_name', 'ladder_compact', 'ladder_move', 'ladder_resolve', 'ladder_from_match',
    'ladder_sync', 'ladder_expire_all', 'ladder_on_match', 'ladder_cancel', 'ladder_push', 'ladder_emit'
  ];
begin
  for f in select p.oid::regprocedure as sig, n.nspname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and p.proname = any (v_rpc))
               or (n.nspname = 'private' and p.proname = any (v_private)) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
