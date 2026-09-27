-- MatchMate · Partidos (base común de raqueta y deportes de equipo).
--
-- Contrato completo para las pantallas y las otras migraciones: docs/partidos.md.
--
-- - matches: un partido entre dos lados (liga, evento opcional, ronda o jornada, cancha, hora), con estado,
--   reglas copiadas al crearlo, marcador resumido (score), estado completo del motor para retomar en otro
--   teléfono (state), un solo anotador a la vez (scorer_id + lease_until) y el flujo del resultado:
--   propuesto (finished) → confirmado por el rival, disputado (lo resuelve el admin), W.O., aplazado,
--   suspendido con marcador parcial, anulado. A las 48 h un resultado propuesto cuenta como final: eso se
--   CALCULA AL LEER (private.match_final y isFinal en el teléfono), no hay escritura.
-- - match_sides: los dos lados (1 y 2): equipo o pareja de temporada (teams sin evento) o solo un nombre.
-- - match_players: quién jugó en cada lado (la pareja suma puntos; las estadísticas van al jugador, también
--   al suplente).
-- - team_players: plantilla de los equipos y parejas de temporada (teams con event_id null), con dorsal,
--   posición y rol (jugador, capitán o delegado).
--
-- Solo ligas de partidos (familia racket o team en sport_status). Nadie escribe directo: todo por RPC.
-- Tiempo real por private.emit en league:<id> (y event:<id> si el partido es de un evento):
--   'match'   la fila del partido sin state/rules/history (cada cambio del partido: marcador, estado…);
--   'matches' {op, ids} altas y bajas de partidos, y cambios de sus lados o jugadores;
--   'teams'   {op, ids} equipos y parejas de temporada y sus plantillas.
-- Push: al proponer un resultado, «Tienes un resultado por confirmar» a las cuentas del otro lado.

-- =====================================================================
-- Tablas
-- =====================================================================

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  -- Jornada, noche de americano o torneo (opcional: una liga larga puede tener partidos sueltos).
  event_id uuid,
  -- Ronda o jornada (1, 2, 3…). null = sin ronda.
  round smallint check (round between 0 and 999),
  -- Fase que se muestra: «Grupo A», «Semifinal»… (libre).
  stage text not null default '' check (char_length(stage) <= 40),
  -- Partido del cuadro (src/sports/formats/knockout: 'R1-1', 'P3').
  bracket_key text check (bracket_key ~ '^[A-Za-z0-9_-]{1,20}$'),
  court text not null default '' check (char_length(court) <= 40),
  scheduled_at timestamptz,
  status text not null default 'scheduled' check (status in (
    'scheduled', 'live', 'suspended', 'finished', 'confirmed', 'disputed', 'walkover', 'void', 'postponed')),
  -- Formato o motor del partido (lo define cada deporte: 'americano', 'sets', 'fiba'…).
  format text not null default '' check (char_length(format) <= 40),
  -- Reglas copiadas de la liga al crear el partido (cambiar la liga no cambia los partidos ya creados).
  rules jsonb not null default '{}' check (jsonb_typeof(rules) = 'object' and pg_column_size(rules) < 8192),
  -- false = el resultado de un jugador queda final sin que el rival confirme (p. ej. americano).
  require_confirm boolean not null default true,
  -- Marcador resumido para tarjetas y tablas: {"text": "6-4 3-6 10-7", "sides": [2, 1], ...}.
  score jsonb check (score is null or (jsonb_typeof(score) = 'object' and pg_column_size(score) < 4096)),
  -- Estado completo del anotador para retomar en otro teléfono (lista de jugadas y configuración).
  state jsonb check (state is null or (jsonb_typeof(state) = 'object' and pg_column_size(state) < 131072)),
  -- Número de la última publicación del anotador (sube siempre, también al deshacer).
  seq integer not null default 0 check (seq >= 0),
  -- Sube en cada cambio de la fila (para consultar solo lo que cambió).
  version integer not null default 0,
  winner_side smallint check (winner_side in (1, 2)),
  -- W.O.: el lado que no se presentó (0 = ninguno de los dos).
  walkover_side smallint check (walkover_side in (0, 1, 2)),
  -- Un solo anotador. El turno se renueva al publicar; solo el admin se lo quita a otro.
  scorer_id uuid references public.profiles (id) on delete set null,
  lease_until timestamptz,
  proposed_by uuid references public.profiles (id) on delete set null,
  proposed_at timestamptz,
  -- Lado de quien propuso (confirma el otro). null = lo anotó el admin o el anotador de la liga.
  proposed_side smallint check (proposed_side in (1, 2)),
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  disputed_by uuid references public.profiles (id) on delete set null,
  disputed_at timestamptz,
  dispute_note text check (char_length(dispute_note) <= 500),
  -- Último aviso del admin (aplazado por lluvia, W.O., anulado…).
  note text check (char_length(note) <= 500),
  -- Historial: [{at, by, a: acción, note?, …}] (los últimos 50).
  history jsonb not null default '[]' check (jsonb_typeof(history) = 'array' and pg_column_size(history) < 32768),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, league_id),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  check (status <> 'walkover' or walkover_side is not null)
);
create index matches_event_idx on public.matches (event_id);
create index matches_when_idx on public.matches (league_id, scheduled_at);
create index matches_sync_idx on public.matches (league_id, updated_at);
create index matches_scorer_idx on public.matches (scorer_id) where scorer_id is not null;

-- Los dos lados del partido. El nombre queda copiado (si se borra el equipo o el jugador, el partido se sigue leyendo).
create table public.match_sides (
  match_id uuid not null,
  side smallint not null check (side in (1, 2)),
  league_id uuid not null,
  -- Equipo o pareja de temporada (teams con event_id null). null = lado armado solo con jugadores (americano).
  team_id uuid,
  label text not null check (char_length(label) between 1 and 80),
  -- Siembra en el cuadro o nivel (opcional).
  seed smallint check (seed between 0 and 999),
  updated_at timestamptz not null default now(),
  primary key (match_id, side),
  foreign key (match_id, league_id) references public.matches (id, league_id) on delete cascade,
  foreign key (team_id, league_id) references public.teams (id, league_id) on delete set null (team_id)
);
create index match_sides_team_idx on public.match_sides (team_id);
create index match_sides_sync_idx on public.match_sides (league_id, updated_at);

-- Quién jugó en cada lado. La pareja o el equipo suma en la tabla; las estadísticas van a cada jugador.
create table public.match_players (
  match_id uuid not null,
  player_id uuid not null,
  league_id uuid not null,
  side smallint not null check (side in (1, 2)),
  -- 'drive' / 'reves', 'GK', 'titular'… (lo define cada deporte).
  position text check (char_length(position) <= 20),
  jersey smallint check (jersey between 0 and 99),
  -- Suplente o refuerzo.
  sub boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id),
  foreign key (match_id, side) references public.match_sides (match_id, side) on delete cascade,
  foreign key (match_id, league_id) references public.matches (id, league_id) on delete cascade,
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade
);
create index match_players_player_idx on public.match_players (player_id);
create index match_players_sync_idx on public.match_players (league_id, updated_at);

-- Plantilla de equipos y parejas de temporada.
create table public.team_players (
  team_id uuid not null,
  player_id uuid not null,
  league_id uuid not null,
  jersey smallint check (jersey between 0 and 99),
  position text check (char_length(position) <= 20),
  -- captain y delegate manejan la plantilla y confirman el resultado de su lado.
  role text not null default 'player' check (role in ('player', 'captain', 'delegate')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, player_id),
  foreign key (team_id, league_id) references public.teams (id, league_id) on delete cascade,
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade
);
create unique index team_players_jersey_idx on public.team_players (team_id, jersey) where jersey is not null;
create index team_players_player_idx on public.team_players (player_id);
create index team_players_sync_idx on public.team_players (league_id, updated_at);
create index teams_season_idx on public.teams (league_id) where event_id is null;

-- =====================================================================
-- Funciones de ayuda
-- =====================================================================

-- Familia del deporte de la liga ('series' | 'racket' | 'team'); null si no existe.
create function private.league_family(p_league uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.family from public.leagues l join public.sport_status s on s.id = l.sport where l.id = p_league
$$;

-- Liga de partidos (raqueta o equipos). Si no existe: 'no_existe'; si es de otra familia: 'invalido'.
create function private.require_match_league(p_league uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v text := private.league_family(p_league);
begin
  if v is null then
    perform private.fail('no_existe');
  end if;
  if v not in ('racket', 'team') then
    perform private.fail('invalido');
  end if;
  return v;
end $$;

-- Cuánto dura el turno del anotador sin publicar (se renueva con cada publicación).
create function private.match_lease() returns interval
language sql immutable set search_path = '' as $$
  select interval '5 minutes'
$$;

-- A las 48 h un resultado propuesto sin reclamo cuenta como final (se calcula al leer).
create function private.match_auto_confirm() returns interval
language sql immutable set search_path = '' as $$
  select interval '48 hours'
$$;

-- El resultado cuenta (tablas, estadísticas): confirmado, W.O., o propuesto hace 48 h o más.
create function private.match_final(p_status text, p_proposed_at timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select p_status in ('confirmed', 'walkover')
      or (p_status = 'finished' and p_proposed_at is not null and p_proposed_at <= now() - private.match_auto_confirm())
$$;

-- Lado del partido de esa cuenta (1 o 2), o null si no juega en él (o si aparece en los dos).
-- Raqueta: jugador del partido o de la pareja. Equipos: capitán o delegado del equipo de ese lado.
create function private.match_side_of(p_match uuid, p_user uuid) returns smallint
language sql stable security definer set search_path = '' as $$
  with fam as (
    select private.league_family(m.league_id) as f from public.matches m where m.id = p_match
  ), s as (
    select mp.side from public.match_players mp join public.players p on p.id = mp.player_id
     where mp.match_id = p_match and p.user_id = p_user and (select f from fam) = 'racket'
    union
    select ms.side from public.match_sides ms
      join public.team_players tp on tp.team_id = ms.team_id
      join public.players p on p.id = tp.player_id
     where ms.match_id = p_match and p.user_id = p_user
       and ((select f from fam) = 'racket' or tp.role in ('captain', 'delegate'))
  )
  select case when count(*) = 1 then min(s.side) end from s
$$;

create function private.match_side(p_match uuid) returns smallint
language sql stable security definer set search_path = '' as $$
  select private.match_side_of(p_match, (select auth.uid()))
$$;

-- Puede anotar el partido: admin de la liga (o superadmin), anotador de la liga o alguien de uno de los lados.
create function private.can_score_as(p_match uuid, p_league uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and (
    coalesce((select p.is_superadmin from public.profiles p where p.id = p_user), false)
    or exists (select 1 from public.league_members m
                where m.league_id = p_league and m.user_id = p_user and (m.role in ('owner', 'admin') or m.is_scorer))
    or private.match_side_of(p_match, p_user) is not null)
$$;

-- Admin o anotador de la liga: lo que anotan queda final.
create function private.is_match_official(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin(p_league) or private.is_scorer(p_league)
$$;

-- Rol de la cuenta en un equipo de temporada ('player' | 'captain' | 'delegate'), o null.
create function private.team_role(p_team uuid) returns text
language sql stable security definer set search_path = '' as $$
  select tp.role from public.team_players tp join public.players p on p.id = tp.player_id
   where tp.team_id = p_team and p.user_id = (select auth.uid())
$$;

-- Partido bloqueado para cambiarlo ('no_existe' si no está).
create function private.match_for_update(p_match uuid) returns public.matches
language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
begin
  select * into m from public.matches x where x.id = p_match for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  return m;
end $$;

-- Equipo de temporada (event_id null) de la liga, bloqueado. 'no_existe' si no es uno.
create function private.season_team_for_update(p_team uuid) returns public.teams
language plpgsql security definer set search_path = '' as $$
declare
  t public.teams;
begin
  select * into t from public.teams x where x.id = p_team and x.event_id is null for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  return t;
end $$;

-- Agrega una línea al historial (se quedan las últimas 50).
create function private.match_history(p_hist jsonb, p_action text, p_note text default null, p_extra jsonb default null)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by n), '[]'::jsonb) from (
    select x, n from jsonb_array_elements(
      coalesce(p_hist, '[]'::jsonb)
      || jsonb_build_array(jsonb_strip_nulls(
           jsonb_build_object('at', now(), 'by', auth.uid(), 'a', p_action, 'note', p_note) || coalesce(p_extra, '{}'::jsonb)))
    ) with ordinality as t (x, n)
    order by n desc
    limit 50
  ) s
$$;

-- Marcador que manda el teléfono: objeto chico; `sides` = [n, n] (enteros 0–9999); `text` ≤ 80. null → null.
create function private.check_score(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p) <> 'object' or pg_column_size(p) >= 4096 then
    perform private.fail('invalido');
  end if;
  if p ? 'sides' and not (
    jsonb_typeof(p -> 'sides') = 'array' and jsonb_array_length(p -> 'sides') = 2
    and (select bool_and(case when jsonb_typeof(x) = 'number'
                              then (x #>> '{}')::numeric between 0 and 9999 and (x #>> '{}')::numeric = trunc((x #>> '{}')::numeric)
                              else false end)
           from jsonb_array_elements(p -> 'sides') x)) then
    perform private.fail('invalido');
  end if;
  if p ? 'text' and (jsonb_typeof(p -> 'text') <> 'string' or char_length(p ->> 'text') > 80) then
    perform private.fail('invalido');
  end if;
  return p;
end $$;

-- Estado del anotador: objeto (o null). El tamaño lo limita la tabla.
create function private.check_state(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p) <> 'object' then
    perform private.fail('invalido');
  end if;
  return p;
end $$;

-- Cuánto puede adelantarse el seq que manda el teléfono al que ya tiene el partido. Un partido de verdad no
-- llega ni cerca (cada jugada o deshacer suma 1); sin tope, un anotador publicaba 2^31-1 y el que seguía
-- después quedaba siempre «viejo» (o se pasaba del entero).
create function private.match_seq_step() returns integer
language sql immutable set search_path = '' as $$
  select 10000
$$;

-- p_seq que manda el teléfono (publicar, terminar, suspender): null (solo al terminar o suspender sin cancha),
-- o de 0 a seq del partido + match_seq_step(), y el mismo que el `seq` del estado si el estado lo trae.
-- Si no: 'invalido'.
create function private.check_seq(p_seq integer, p_state jsonb, p_have integer) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_seq is null then
    return;
  end if;
  if p_seq < 0 or p_seq::bigint > coalesce(p_have, 0)::bigint + private.match_seq_step() then
    perform private.fail('invalido');
  end if;
  if jsonb_typeof(p_state) = 'object' and p_state ? 'seq'
     and (jsonb_typeof(p_state -> 'seq') <> 'number' or (p_state ->> 'seq')::numeric <> p_seq) then
    perform private.fail('invalido');
  end if;
end $$;

-- La lista que manda el teléfono sigue a la que tiene el partido: la publicó el mismo teléfono (mismo `origin`),
-- o este teléfono la tomó de ella al pedir el turno (`parent` = {origin, seq} de lo que había) y después no
-- llegó nada más nuevo. Si falta el origin de un lado o del otro (nada publicado, o un estado que no viene del
-- modo cancha) solo cuenta seq. Así la lista vieja de otro teléfono de la misma cuenta (sin señal, en la cola)
-- no pisa la que se siguió en otro lado, aunque su seq sea más alto: seq solo compara jugadas de una misma lista.
create function private.state_follows(p_state jsonb, m public.matches) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(
    nullif(p_state ->> 'origin', '') is null
    or nullif(m.state ->> 'origin', '') is null
    or p_state ->> 'origin' = m.state ->> 'origin'
    or (jsonb_typeof(p_state -> 'parent') = 'object'
        and p_state -> 'parent' ->> 'origin' = m.state ->> 'origin'
        and jsonb_typeof(p_state -> 'parent' -> 'seq') = 'number'
        and (p_state -> 'parent' ->> 'seq')::numeric >= m.seq),
    false)
$$;

-- Capitán o delegado: no suma a la plantilla a quien ya está en otro equipo de temporada de la liga (le rompería
-- la convocatoria y su lado en los partidos de los dos, y se saltaría el tope de refuerzos). Lo cambia el admin.
-- Los que ya están en este equipo no cuentan (se les puede cambiar dorsal o posición).
create function private.check_free_players(p_team uuid, p_league uuid, p_players uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from unnest(p_players) as n (player_id)
               join public.team_players tp on tp.player_id = n.player_id and tp.league_id = p_league and tp.team_id <> p_team
               join public.teams t on t.id = tp.team_id and t.event_id is null
              where not exists (select 1 from public.team_players x where x.team_id = p_team and x.player_id = n.player_id)) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Ese jugador ya está en otro equipo de la liga. Lo cambia el admin.';
  end if;
end $$;

-- Ganador según la familia: 1, 2 o null (empate). En raqueta no hay empates (salvo W.O. doble).
create function private.check_winner(p_league uuid, p_winner integer, p_required boolean) returns smallint
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_winner is not null and p_winner not in (1, 2) then
    perform private.fail('invalido');
  end if;
  if p_winner is null and p_required and private.league_family(p_league) = 'racket' then
    perform private.fail('invalido');
  end if;
  return p_winner::smallint;
end $$;

-- Quién tiene el turno de anotar y cómo está (lo que ve el teléfono al pedirlo).
create function private.claim_result(m public.matches, p_ok boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'ok', p_ok,
    'scorer_id', m.scorer_id,
    'scorer_name', (select lm.display_name from public.league_members lm where lm.league_id = m.league_id and lm.user_id = m.scorer_id),
    'lease_until', m.lease_until,
    'expired', m.lease_until is null or m.lease_until < now(),
    'status', m.status,
    'seq', m.seq,
    'version', m.version,
    'state', case when p_ok then m.state end)
$$;

-- Lista de jugadores de un lado: [{player_id, position?, jersey?, sub?}] (reemplaza la que había).
create function private.write_players(p_match uuid, p_league uuid, p_side smallint, p_players jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(p_players) is distinct from 'array' or jsonb_array_length(p_players) > 30 then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from jsonb_array_elements(p_players) x
              where jsonb_typeof(x) <> 'object' or nullif(x ->> 'player_id', '') is null) then
    perform private.fail('invalido');
  end if;
  delete from public.match_players mp
   where mp.match_id = p_match and mp.side = p_side
     and mp.player_id not in (select (x ->> 'player_id')::uuid from jsonb_array_elements(p_players) x);
  insert into public.match_players as mp (match_id, player_id, league_id, side, position, jersey, sub)
  select distinct on ((x ->> 'player_id')::uuid)
         p_match, (x ->> 'player_id')::uuid, p_league, p_side, nullif(btrim(x ->> 'position'), ''), (x ->> 'jersey')::smallint,
         coalesce((x ->> 'sub')::boolean, false)
    from jsonb_array_elements(p_players) x
  on conflict (match_id, player_id) do update
    set side = excluded.side, position = excluded.position, jersey = excluded.jersey, sub = excluded.sub
    where (mp.side, mp.position, mp.jersey, mp.sub) is distinct from (excluded.side, excluded.position, excluded.jersey, excluded.sub);
end $$;

-- Los dos lados: [{side: 1|2, team_id?, label?, seed?, players?: [...]}, {...}]. Sin nombre: el del equipo,
-- o los jugadores («Ana / Luis»), o «Por definir» (cuadro sin rival todavía).
create function private.write_sides(p_match uuid, p_league uuid, p_sides jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s jsonb;
  v_side smallint;
  v_team uuid;
  v_label text;
  v_done smallint[] := '{}';
begin
  if jsonb_typeof(p_sides) is distinct from 'array' or jsonb_array_length(p_sides) <> 2 then
    perform private.fail('invalido');
  end if;
  for s in select x from jsonb_array_elements(p_sides) x loop
    if jsonb_typeof(s) <> 'object' then
      perform private.fail('invalido');
    end if;
    v_side := (s ->> 'side')::smallint;
    if v_side is null or v_side not in (1, 2) or v_side = any (v_done) then
      perform private.fail('invalido');
    end if;
    v_done := v_done || v_side;
    v_team := nullif(s ->> 'team_id', '')::uuid;
    v_label := nullif(btrim(coalesce(s ->> 'label', '')), '');
    if v_label is null and v_team is not null then
      v_label := (select t.name from public.teams t where t.id = v_team and t.league_id = p_league);
    end if;
    if v_label is null and jsonb_typeof(s -> 'players') = 'array' then
      v_label := (select string_agg(p.name, ' / ' order by a.n)
                    from jsonb_array_elements(s -> 'players') with ordinality as a (x, n)
                    join public.players p on p.id = nullif(a.x ->> 'player_id', '')::uuid and p.league_id = p_league);
    end if;
    insert into public.match_sides as ms (match_id, side, league_id, team_id, label, seed)
    values (p_match, v_side, p_league, v_team, left(coalesce(v_label, 'Por definir'), 80), (s ->> 'seed')::smallint)
    on conflict (match_id, side) do update
      set team_id = excluded.team_id, label = excluded.label, seed = excluded.seed
      where (ms.team_id, ms.label, ms.seed) is distinct from (excluded.team_id, excluded.label, excluded.seed);
    if s ? 'players' then
      perform private.write_players(p_match, p_league, v_side, s -> 'players');
    end if;
  end loop;
end $$;

-- Plantilla de un equipo: [{player_id, jersey?, position?, role?}]. p_roles = false (capitán o delegado): el rol
-- no se toca (los nuevos entran como 'player'), los capitanes y delegados no se pueden quitar y no entra quien
-- ya está en otro equipo de la liga (eso lo hace el admin).
create function private.write_roster(p_team uuid, p_league uuid, p_players jsonb, p_roles boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(p_players) is distinct from 'array' or jsonb_array_length(p_players) > 60 then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from jsonb_array_elements(p_players) x
              where jsonb_typeof(x) <> 'object' or nullif(x ->> 'player_id', '') is null
                 or (p_roles and x ? 'role' and coalesce(x ->> 'role', '') not in ('player', 'captain', 'delegate'))) then
    perform private.fail('invalido');
  end if;
  if not p_roles then
    perform private.check_free_players(p_team, p_league,
      array(select distinct (x ->> 'player_id')::uuid from jsonb_array_elements(p_players) x));
  end if;
  delete from public.team_players tp
   where tp.team_id = p_team
     and tp.player_id not in (select (x ->> 'player_id')::uuid from jsonb_array_elements(p_players) x)
     and (p_roles or tp.role = 'player');
  insert into public.team_players as tp (team_id, player_id, league_id, jersey, position, role)
  select distinct on ((x ->> 'player_id')::uuid)
         p_team, (x ->> 'player_id')::uuid, p_league, (x ->> 'jersey')::smallint, nullif(btrim(x ->> 'position'), ''),
         case when p_roles then coalesce(x ->> 'role', 'player') else 'player' end
    from jsonb_array_elements(p_players) x
  on conflict (team_id, player_id) do update
    set jersey = excluded.jersey, position = excluded.position,
        role = case when p_roles then excluded.role else tp.role end
    where (tp.jersey, tp.position, tp.role) is distinct from
          (excluded.jersey, excluded.position, case when p_roles then excluded.role else tp.role end);
end $$;

-- =====================================================================
-- Triggers: updated_at, versión, borrados y reglas que valen para todos
-- =====================================================================

create trigger matches_touch before update on public.matches for each row execute function private.touch_updated_at();
create trigger match_sides_touch before update on public.match_sides for each row execute function private.touch_updated_at();
create trigger match_players_touch before update on public.match_players for each row execute function private.touch_updated_at();
create trigger team_players_touch before update on public.team_players for each row execute function private.touch_updated_at();

create function private.bump_match_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end $$;

create trigger matches_version before update on public.matches for each row execute function private.bump_match_version();

create trigger matches_tombstone after delete on public.matches for each row execute function private.tombstone('id');
create trigger match_sides_tombstone after delete on public.match_sides for each row execute function private.tombstone('match_id', 'side');
create trigger match_players_tombstone after delete on public.match_players for each row execute function private.tombstone('match_id', 'player_id');
create trigger team_players_tombstone after delete on public.team_players for each row execute function private.tombstone('team_id', 'player_id');

-- Partidos solo en ligas de raqueta o de equipos.
create function private.check_match() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(private.league_family(new.league_id), '') not in ('racket', 'team') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Solo las ligas de raqueta o de equipos tienen partidos.';
  end if;
  return new;
end $$;

create trigger matches_check before insert or update of league_id on public.matches for each row execute function private.check_match();

-- Equipos de temporada (sin evento) solo en ligas de partidos. Los del boliche siempre son de un evento.
create function private.check_season_team() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.event_id is null and coalesce(private.league_family(new.league_id), '') not in ('racket', 'team') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Los equipos de temporada son de ligas de partidos.';
  end if;
  return new;
end $$;

create trigger teams_season_check before insert or update of event_id, league_id on public.teams
  for each row execute function private.check_season_team();

-- El equipo de un lado y el de una plantilla es de temporada (no de un evento).
create function private.check_team_is_season() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.team_id is not null and exists (select 1 from public.teams t where t.id = new.team_id and t.event_id is not null) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'El equipo tiene que ser de temporada.';
  end if;
  return new;
end $$;

create trigger match_sides_team_check before insert or update of team_id on public.match_sides
  for each row execute function private.check_team_is_season();
create trigger team_players_team_check before insert or update of team_id on public.team_players
  for each row execute function private.check_team_is_season();

-- =====================================================================
-- RLS: lo ve quien ve la liga (solo lectura; se escribe por RPC)
-- =====================================================================

alter table public.matches enable row level security;
alter table public.match_sides enable row level security;
alter table public.match_players enable row level security;
alter table public.team_players enable row level security;

create policy matches_read on public.matches for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy match_sides_read on public.match_sides for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy match_players_read on public.match_players for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy team_players_read on public.team_players for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));

grant select on public.matches, public.match_sides, public.match_players, public.team_players to anon, authenticated;

-- =====================================================================
-- RPC: partidos
-- =====================================================================

-- Admin: crea partidos de una vez (calendario, ronda del americano, cuadro). Devuelve los ids en el mismo orden.
-- p_matches = [{id?, event_id?, round?, stage?, bracket_key?, court?, scheduled_at?, format?, rules?,
--               require_confirm?, sides: [{side, team_id?, label?, seed?, players?: [{player_id, position?, jersey?, sub?}]}, …]}]
-- Sin `rules`, copia las de la liga.
create function public.create_matches(p_league uuid, p_matches jsonb) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_rules jsonb;
  v_ids uuid[];
  g jsonb;
  i bigint;
begin
  perform private.require_uid();
  perform private.require_match_league(p_league);
  perform private.require_admin(p_league);
  if jsonb_typeof(p_matches) is distinct from 'array' or jsonb_array_length(p_matches) not between 1 and 500 then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from jsonb_array_elements(p_matches) x
              where jsonb_typeof(x) <> 'object' or (x ? 'rules' and jsonb_typeof(x -> 'rules') not in ('object', 'null'))) then
    perform private.fail('invalido');
  end if;
  v_rules := (select l.rules from public.leagues l where l.id = p_league);
  select array_agg(coalesce(nullif(x ->> 'id', '')::uuid, gen_random_uuid()) order by n) into v_ids
    from jsonb_array_elements(p_matches) with ordinality as a (x, n);
  -- Una sola sentencia: un solo aviso de tiempo real para todo el lote.
  insert into public.matches (id, league_id, event_id, round, stage, bracket_key, court, scheduled_at, format, rules, require_confirm, created_by)
  select v_ids[n], p_league, nullif(x ->> 'event_id', '')::uuid, (x ->> 'round')::smallint, btrim(coalesce(x ->> 'stage', '')),
         nullif(btrim(coalesce(x ->> 'bracket_key', '')), ''), btrim(coalesce(x ->> 'court', '')), (x ->> 'scheduled_at')::timestamptz,
         btrim(coalesce(x ->> 'format', '')), case when jsonb_typeof(x -> 'rules') = 'object' then x -> 'rules' else v_rules end,
         coalesce((x ->> 'require_confirm')::boolean, true), auth.uid()
    from jsonb_array_elements(p_matches) with ordinality as a (x, n);
  -- Los lados no avisan uno por uno (ya avisó el alta).
  perform set_config('mm.quiet_sides', 'on', true);
  for g, i in select x, n from jsonb_array_elements(p_matches) with ordinality as a (x, n) loop
    perform private.write_sides(v_ids[i], p_league, g -> 'sides');
  end loop;
  perform set_config('mm.quiet_sides', '', true);
  return v_ids;
end $$;

-- Admin: cambia datos del partido. Claves: scheduled_at, court, round, stage, bracket_key, event_id, format,
-- require_confirm, rules (esta solo antes de empezar).
create function public.update_match_schedule(p_match uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
  k text;
  v_when timestamptz;
  v_court text;
begin
  perform private.require_uid();
  m := private.match_for_update(p_match);
  perform private.require_admin(m.league_id);
  if jsonb_typeof(p_patch) is distinct from 'object' then
    perform private.fail('invalido');
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k <> all (array['scheduled_at', 'court', 'round', 'stage', 'bracket_key', 'event_id', 'format', 'require_confirm', 'rules']) then
      perform private.fail('invalido');
    end if;
  end loop;
  if p_patch ? 'rules' and (jsonb_typeof(p_patch -> 'rules') <> 'object' or m.seq > 0 or m.status not in ('scheduled', 'postponed')) then
    perform private.fail('invalido');
  end if;
  v_when := case when p_patch ? 'scheduled_at' then (p_patch ->> 'scheduled_at')::timestamptz else m.scheduled_at end;
  v_court := case when p_patch ? 'court' then btrim(coalesce(p_patch ->> 'court', '')) else m.court end;
  update public.matches x set
    scheduled_at = v_when,
    court = v_court,
    round = case when p_patch ? 'round' then (p_patch ->> 'round')::smallint else x.round end,
    stage = case when p_patch ? 'stage' then btrim(coalesce(p_patch ->> 'stage', '')) else x.stage end,
    bracket_key = case when p_patch ? 'bracket_key' then nullif(btrim(coalesce(p_patch ->> 'bracket_key', '')), '') else x.bracket_key end,
    event_id = case when p_patch ? 'event_id' then nullif(p_patch ->> 'event_id', '')::uuid else x.event_id end,
    format = case when p_patch ? 'format' then btrim(coalesce(p_patch ->> 'format', '')) else x.format end,
    require_confirm = case when p_patch ? 'require_confirm' then coalesce((p_patch ->> 'require_confirm')::boolean, true) else x.require_confirm end,
    rules = case when p_patch ? 'rules' then p_patch -> 'rules' else x.rules end,
    history = case when v_when is distinct from m.scheduled_at or v_court is distinct from m.court
                   then private.match_history(x.history, 'schedule', null,
                          jsonb_build_object('from', jsonb_build_object('at', m.scheduled_at, 'court', m.court),
                                             'to', jsonb_build_object('at', v_when, 'court', v_court)))
                   else x.history end
  where x.id = p_match;
end $$;

-- Admin: cambia los lados (p. ej. el cuadro ya sabe quién pasa). Mismo formato que en create_matches.
-- No con resultado ya anotado ('cerrado').
create function public.set_match_sides(p_match uuid, p_sides jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
begin
  perform private.require_uid();
  m := private.match_for_update(p_match);
  perform private.require_admin(m.league_id);
  if m.status in ('finished', 'confirmed', 'disputed', 'walkover') then
    perform private.fail('cerrado');
  end if;
  perform private.write_sides(p_match, m.league_id, p_sides);
  -- Sube la versión (quien consulta solo lo que cambió se entera); no avisa dos veces (ya avisaron los lados).
  update public.matches x set seq = x.seq where x.id = p_match;
end $$;

-- Quién juega en un lado (alineación, presentes, suplente): admin, anotador de la liga, quien tiene el turno
-- de anotar, o el capitán/delegado (raqueta: un jugador) de ese lado. p_players = [{player_id, position?, jersey?, sub?}].
-- Quien no es admin ni anotador de la liga (el lado de una cuenta sale de aquí: no se puede usar para quitárselo
-- al rival y que no confirme ni reclame):
-- - con el resultado ya propuesto (finished, disputed) no cambia nada: 'cerrado';
-- - no pone en su lado a nadie del otro lado (su alineación o su pareja/equipo): 'invalido';
-- - en raqueta, con el turno, del lado rival solo cambia posición, dorsal o suplente de los que ya están (no
--   quita ni agrega: en raqueta el lado ES quién juega). En equipos la mesa sí anota los presentes de los dos
--   lados (ahí el lado es del capitán o delegado del equipo, no de la alineación).
create function public.set_match_players(p_match uuid, p_side smallint, p_players jsonb, p_op_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  m public.matches;
  v_official boolean;
  v_side smallint;
  v_ids uuid[];
begin
  if private.op_begin(p_op_id, 'set_match_players') is not null then
    return;
  end if;
  m := private.match_for_update(p_match);
  if p_side is null or p_side not in (1, 2) then
    perform private.fail('invalido');
  end if;
  v_official := private.is_match_official(m.league_id);
  v_side := private.match_side(p_match);
  if not (v_official or coalesce(m.scorer_id = v_uid, false) or coalesce(v_side = p_side, false)) then
    perform private.deny();
  end if;
  if m.status in ('confirmed', 'walkover', 'void') and not private.is_admin(m.league_id) then
    perform private.fail('cerrado');
  end if;
  if not v_official then
    if m.status in ('finished', 'disputed') then
      perform private.fail('cerrado');
    end if;
    if jsonb_typeof(p_players) is distinct from 'array'
       or exists (select 1 from jsonb_array_elements(p_players) x
                   where jsonb_typeof(x) <> 'object' or nullif(x ->> 'player_id', '') is null) then
      perform private.fail('invalido');
    end if;
    v_ids := array(select distinct (x ->> 'player_id')::uuid from jsonb_array_elements(p_players) x);
    if exists (select 1 from public.match_players mp
                where mp.match_id = p_match and mp.side <> p_side and mp.player_id = any (v_ids))
       or exists (select 1 from public.match_sides ms join public.team_players tp on tp.team_id = ms.team_id
                   where ms.match_id = p_match and ms.side <> p_side and tp.player_id = any (v_ids)) then
      raise exception 'invalido' using errcode = 'P0001', detail = 'Ese jugador es del otro lado del partido.';
    end if;
    if v_side is distinct from p_side and private.league_family(m.league_id) = 'racket'
       and (exists (select unnest(v_ids)
                    except select mp.player_id from public.match_players mp where mp.match_id = p_match and mp.side = p_side)
            or exists (select mp.player_id from public.match_players mp where mp.match_id = p_match and mp.side = p_side
                       except select unnest(v_ids))) then
      raise exception 'invalido' using errcode = 'P0001', detail = 'Los jugadores del otro lado los cambia el admin.';
    end if;
  end if;
  perform private.write_players(p_match, m.league_id, p_side, p_players);
  update public.matches x set seq = x.seq where x.id = p_match;
  perform private.op_end(p_op_id, null);
end $$;

-- Pide el turno de anotar. Lo da si nadie lo tiene, si ya es suyo, o si es admin y p_force (quitárselo a
-- otro, con confirmación en la pantalla). Nunca lo quita solo porque venció el tiempo. Devuelve
-- {ok, scorer_id, scorer_name, lease_until, expired, status, seq, version, state (si ok)}.
create function public.claim_scorer(p_match uuid, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  m public.matches;
  v_admin boolean;
begin
  m := private.match_for_update(p_match);
  v_admin := private.is_admin(m.league_id);
  if not (v_admin or private.can_score_as(p_match, m.league_id, v_uid)) then
    perform private.deny();
  end if;
  if m.status not in ('scheduled', 'live', 'suspended') then
    perform private.fail('cerrado');
  end if;
  if m.scorer_id is null or m.scorer_id = v_uid or (v_admin and coalesce(p_force, false)) then
    update public.matches x set
      scorer_id = v_uid,
      lease_until = now() + private.match_lease(),
      history = case when m.scorer_id is not null and m.scorer_id <> v_uid
                     then private.match_history(x.history, 'takeover', null, jsonb_build_object('from', m.scorer_id))
                     else x.history end
    where x.id = p_match
    returning * into m;
    return private.claim_result(m, true);
  end if;
  return private.claim_result(m, false);
end $$;

-- Suelta el turno (p_to null) o se lo pasa a otra cuenta que puede anotar (entregar el control).
-- Quien lo tiene, o el admin (el admin también se lo da a quien quiera).
create function public.release_scorer(p_match uuid, p_to uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  m public.matches;
begin
  m := private.match_for_update(p_match);
  if not (coalesce(m.scorer_id = v_uid, false) or private.is_admin(m.league_id)) then
    if m.scorer_id is null and p_to is null and private.can_score_as(p_match, m.league_id, v_uid) then
      return;
    end if;
    perform private.deny();
  end if;
  if p_to is not null and not private.can_score_as(p_match, m.league_id, p_to) then
    perform private.fail('invalido');
  end if;
  if p_to is not null and m.status not in ('scheduled', 'live', 'suspended') then
    perform private.fail('cerrado');
  end if;
  if m.scorer_id is not distinct from p_to then
    return;
  end if;
  update public.matches x set
    scorer_id = p_to,
    lease_until = case when p_to is null then null else now() + private.match_lease() end,
    history = private.match_history(x.history, case when p_to is null then 'release' else 'handoff' end, null,
                                    jsonb_build_object('from', m.scorer_id, 'to', p_to))
  where x.id = p_match;
end $$;

-- Publica el estado del anotador (lo manda la cola; el teléfono colapsa y solo sale el último). Renueva el
-- turno (no hay escrituras aparte). Nunca falla por el turno: devuelve {ok: false, reason} y el teléfono
-- avisa. reason: 'lease' (otro tiene el turno: scorer_id, scorer_name; o el partido está suspendido y no lo
-- retomó quien publica), 'stale' (llegó una publicación más nueva, o de otra lista: seq) o 'cerrado' (el
-- partido ya terminó o se aplazó). Si nadie tiene el turno, lo toma (salvo suspendido: se retoma solo pidiendo
-- el turno con claim_scorer). Pasa a en vivo solo con algo nuevo (p_seq mayor que el del partido): publicar lo
-- mismo que ya estaba (abrir la cancha para mirar y salir) solo renueva el turno.
-- p_seq: de 0 a seq + match_seq_step(), y el mismo que p_state.seq si viene ('invalido' si no).
create function public.publish_match(p_op_id uuid, p_match uuid, p_seq integer, p_state jsonb, p_score jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_prev jsonb;
  m public.matches;
  v jsonb;
begin
  v_prev := private.op_begin(p_op_id, 'publish_match');
  if v_prev is not null then
    return v_prev;
  end if;
  m := private.match_for_update(p_match);
  if not private.can_score_as(p_match, m.league_id, v_uid) then
    perform private.deny();
  end if;
  if p_seq is null then
    perform private.fail('invalido');
  end if;
  if private.check_state(p_state) is null then
    perform private.fail('invalido');
  end if;
  perform private.check_seq(p_seq, p_state, m.seq);
  p_score := private.check_score(p_score);
  if m.status not in ('scheduled', 'live', 'suspended') then
    v := jsonb_build_object('ok', false, 'reason', 'cerrado', 'status', m.status, 'seq', m.seq);
  elsif m.status = 'suspended' and m.scorer_id is distinct from v_uid then
    -- Suspendido (por el admin, o por quien anotaba): lo que llega de la cola de un teléfono que no lo retomó no
    -- toma el turno libre ni lo pone en vivo.
    v := private.claim_result(m, false) || jsonb_build_object('reason', 'lease');
  elsif m.scorer_id is not null and m.scorer_id <> v_uid then
    v := private.claim_result(m, false) || jsonb_build_object('reason', 'lease');
  elsif p_seq < m.seq or not private.state_follows(p_state, m) then
    v := jsonb_build_object('ok', false, 'reason', 'stale', 'status', m.status, 'seq', m.seq);
  else
    update public.matches x set
      state = p_state,
      score = p_score,
      seq = p_seq,
      scorer_id = v_uid,
      lease_until = now() + private.match_lease(),
      status = case when x.status in ('scheduled', 'suspended') and p_seq > x.seq then 'live' else x.status end
    where x.id = p_match
    returning * into m;
    v := jsonb_build_object('ok', true, 'status', m.status, 'seq', m.seq, 'version', m.version, 'lease_until', m.lease_until);
  end if;
  perform private.op_end(p_op_id, v);
  return v;
end $$;

-- Termina el partido con su resultado. Admin o anotador de la liga (o partido sin confirmación): queda
-- confirmado. Alguien de un lado: queda propuesto ('finished') y confirma el otro lado; a las 48 h cuenta
-- solo. Quien propuso (o el admin) puede corregir su propuesta dentro de las 48 h.
-- p_score = {text, sides, …}; p_winner 1|2 (null = empate, no en raqueta); p_state = estado final (opcional).
-- Devuelve {ok, status} o {ok: false, reason: 'stale'} si ya llegó una publicación más nueva de otro teléfono
-- (seq más alto, o la lista del partido es otra que la que termina: ver state_follows). El admin cierra igual.
create function public.finish_match(
  p_match uuid,
  p_score jsonb,
  p_winner smallint default null,
  p_state jsonb default null,
  p_seq integer default null,
  p_op_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_prev jsonb;
  m public.matches;
  v_admin boolean;
  v_official boolean;
  v_side smallint;
  v_final boolean;
  v jsonb;
begin
  v_prev := private.op_begin(p_op_id, 'finish_match');
  if v_prev is not null then
    return v_prev;
  end if;
  m := private.match_for_update(p_match);
  v_admin := private.is_admin(m.league_id);
  v_official := private.is_match_official(m.league_id);
  v_side := private.match_side(p_match);
  if not (v_official or v_side is not null) then
    perform private.deny();
  end if;
  if m.status = 'finished' then
    if not (v_official or coalesce(v_side = m.proposed_side, false)) then
      perform private.deny();
    end if;
    if not v_official and m.proposed_at <= now() - private.match_auto_confirm() then
      perform private.fail('cerrado');
    end if;
  elsif m.status not in ('scheduled', 'live', 'suspended') then
    perform private.fail('cerrado');
  end if;
  -- Otro teléfono está anotando en vivo: solo el admin lo puede cerrar desde aquí.
  if m.scorer_id is not null and m.scorer_id <> v_uid and m.lease_until > now() and not v_admin then
    perform private.deny();
  end if;
  p_winner := private.check_winner(m.league_id, p_winner, true);
  p_score := private.check_score(p_score);
  if p_score is null then
    perform private.fail('invalido');
  end if;
  p_state := private.check_state(p_state);
  perform private.check_seq(p_seq, p_state, m.seq);
  if not v_admin and ((p_seq is not null and p_seq < m.seq) or (p_state is not null and not private.state_follows(p_state, m))) then
    v := jsonb_build_object('ok', false, 'reason', 'stale', 'status', m.status, 'seq', m.seq);
    perform private.op_end(p_op_id, v);
    return v;
  end if;
  v_final := v_official or not m.require_confirm;
  update public.matches x set
    score = p_score,
    winner_side = p_winner,
    walkover_side = null,
    state = coalesce(p_state, x.state),
    seq = greatest(x.seq, coalesce(p_seq, x.seq)),
    scorer_id = null,
    lease_until = null,
    status = case when v_final then 'confirmed' else 'finished' end,
    proposed_by = v_uid,
    proposed_at = now(),
    proposed_side = case when v_official then null else v_side end,
    confirmed_by = case when v_final then v_uid end,
    confirmed_at = case when v_final then now() end,
    disputed_by = null,
    disputed_at = null,
    dispute_note = null,
    history = private.match_history(x.history, 'finish', null, jsonb_build_object('score', p_score -> 'text', 'winner', p_winner))
  where x.id = p_match
  returning * into m;
  v := jsonb_build_object('ok', true, 'status', m.status);
  perform private.op_end(p_op_id, v);
  return v;
end $$;

-- El otro lado (o el admin) confirma el resultado propuesto. También después de las 48 h (cierre formal).
-- Si ya estaba confirmado, no hace nada.
create function public.confirm_result(p_match uuid, p_op_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  m public.matches;
  v_side smallint;
begin
  if private.op_begin(p_op_id, 'confirm_result') is not null then
    return;
  end if;
  m := private.match_for_update(p_match);
  v_side := private.match_side(p_match);
  if not (private.is_admin(m.league_id) or (v_side is not null and v_side is distinct from m.proposed_side)) then
    perform private.deny();
  end if;
  if m.status = 'confirmed' then
    perform private.op_end(p_op_id, null);
    return;
  end if;
  if m.status <> 'finished' then
    perform private.fail('cerrado');
  end if;
  update public.matches x set
    status = 'confirmed',
    confirmed_by = v_uid,
    confirmed_at = now(),
    history = private.match_history(x.history, 'confirm')
  where x.id = p_match;
  perform private.op_end(p_op_id, null);
end $$;

-- El otro lado no está de acuerdo (dentro de las 48 h): queda en disputa y decide el admin.
create function public.dispute_result(p_match uuid, p_note text default null, p_op_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  m public.matches;
  v_side smallint;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if private.op_begin(p_op_id, 'dispute_result') is not null then
    return;
  end if;
  m := private.match_for_update(p_match);
  v_side := private.match_side(p_match);
  if v_side is null or v_side is not distinct from m.proposed_side then
    perform private.deny();
  end if;
  if m.status = 'disputed' then
    perform private.op_end(p_op_id, null);
    return;
  end if;
  if m.status <> 'finished' or coalesce(m.proposed_at <= now() - private.match_auto_confirm(), true) then
    perform private.fail('cerrado');
  end if;
  if char_length(v_note) > 500 then
    perform private.fail('invalido');
  end if;
  update public.matches x set
    status = 'disputed',
    disputed_by = v_uid,
    disputed_at = now(),
    dispute_note = v_note,
    history = private.match_history(x.history, 'dispute', v_note)
  where x.id = p_match;
  perform private.op_end(p_op_id, null);
end $$;

-- Admin: decide una disputa. Sin p_score queda el resultado propuesto; con p_score, el que diga el admin.
create function public.resolve_dispute(
  p_match uuid,
  p_score jsonb default null,
  p_winner smallint default null,
  p_state jsonb default null,
  p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  m public.matches;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  m := private.match_for_update(p_match);
  perform private.require_admin(m.league_id);
  if m.status <> 'disputed' then
    perform private.fail('cerrado');
  end if;
  p_score := private.check_score(p_score);
  if p_score is not null then
    p_winner := private.check_winner(m.league_id, p_winner, true);
  end if;
  p_state := private.check_state(p_state);
  update public.matches x set
    status = 'confirmed',
    score = coalesce(p_score, x.score),
    winner_side = case when p_score is not null then p_winner else x.winner_side end,
    state = coalesce(p_state, x.state),
    confirmed_by = v_uid,
    confirmed_at = now(),
    note = coalesce(v_note, x.note),
    history = private.match_history(x.history, 'resolve', v_note,
                                    case when p_score is not null then jsonb_build_object('score', p_score -> 'text', 'winner', p_winner) end)
  where x.id = p_match;
end $$;

-- Admin: corrige el resultado en cualquier momento (queda confirmado). Suelta el turno y borra la disputa.
create function public.admin_correct_result(
  p_match uuid,
  p_score jsonb,
  p_winner smallint default null,
  p_state jsonb default null,
  p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  m public.matches;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  m := private.match_for_update(p_match);
  perform private.require_admin(m.league_id);
  p_score := private.check_score(p_score);
  if p_score is null then
    perform private.fail('invalido');
  end if;
  p_winner := private.check_winner(m.league_id, p_winner, true);
  p_state := private.check_state(p_state);
  update public.matches x set
    status = 'confirmed',
    score = p_score,
    winner_side = p_winner,
    walkover_side = null,
    state = coalesce(p_state, x.state),
    scorer_id = null,
    lease_until = null,
    proposed_by = coalesce(x.proposed_by, v_uid),
    proposed_at = coalesce(x.proposed_at, now()),
    confirmed_by = v_uid,
    confirmed_at = now(),
    disputed_by = null,
    disputed_at = null,
    dispute_note = null,
    note = coalesce(v_note, x.note),
    history = private.match_history(x.history, 'correct', v_note,
                                    jsonb_build_object('from', m.score -> 'text', 'score', p_score -> 'text', 'winner', p_winner))
  where x.id = p_match;
end $$;

-- Admin: W.O. p_absent = lado que no se presentó (0 = ninguno de los dos). p_score = el marcador del W.O. del
-- deporte (6-0 6-0, 20-0…), lo calcula el teléfono con el motor.
create function public.set_walkover(p_match uuid, p_absent smallint, p_score jsonb default null, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  m public.matches;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  m := private.match_for_update(p_match);
  perform private.require_admin(m.league_id);
  if p_absent is null or p_absent not in (0, 1, 2) then
    perform private.fail('invalido');
  end if;
  p_score := private.check_score(p_score);
  update public.matches x set
    status = 'walkover',
    walkover_side = p_absent,
    winner_side = case p_absent when 1 then 2 when 2 then 1 end,
    score = p_score,
    scorer_id = null,
    lease_until = null,
    confirmed_by = v_uid,
    confirmed_at = now(),
    disputed_by = null,
    disputed_at = null,
    dispute_note = null,
    note = coalesce(v_note, x.note),
    history = private.match_history(x.history, 'walkover', v_note, jsonb_build_object('absent', p_absent))
  where x.id = p_match;
end $$;

-- Admin: aplaza un partido que no ha empezado (o suspendido). Se vuelve a poner con reschedule_match.
create function public.postpone_match(p_match uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.require_uid();
  m := private.match_for_update(p_match);
  perform private.require_admin(m.league_id);
  if m.status not in ('scheduled', 'suspended', 'postponed') then
    perform private.fail('cerrado');
  end if;
  update public.matches x set
    status = 'postponed',
    scorer_id = null,
    lease_until = null,
    note = coalesce(v_note, x.note),
    history = private.match_history(x.history, 'postpone', v_note, jsonb_build_object('from', m.status))
  where x.id = p_match;
end $$;

-- Admin: nueva fecha (y cancha). Aplazado vuelve a programado; suspendido sigue suspendido (con su marcador).
create function public.reschedule_match(p_match uuid, p_scheduled_at timestamptz, p_court text default null, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_court text;
begin
  perform private.require_uid();
  m := private.match_for_update(p_match);
  perform private.require_admin(m.league_id);
  if m.status not in ('scheduled', 'postponed', 'suspended') then
    perform private.fail('cerrado');
  end if;
  v_court := coalesce(btrim(p_court), m.court);
  update public.matches x set
    scheduled_at = p_scheduled_at,
    court = v_court,
    status = case when x.status = 'postponed' then 'scheduled' else x.status end,
    note = coalesce(v_note, x.note),
    history = private.match_history(x.history, 'reschedule', v_note,
                jsonb_build_object('from', jsonb_build_object('at', m.scheduled_at, 'court', m.court),
                                   'to', jsonb_build_object('at', p_scheduled_at, 'court', v_court)))
  where x.id = p_match;
end $$;

-- Suspender con marcador parcial (lluvia, falta de luz): quien tiene el turno, el anotador de la liga o el
-- admin. Se guarda el estado (si viene, no es viejo y sigue a la lista del partido) y se suelta el turno; se
-- retoma pidiendo el turno.
create function public.suspend_match(
  p_match uuid,
  p_state jsonb default null,
  p_score jsonb default null,
  p_seq integer default null,
  p_note text default null,
  p_op_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  m public.matches;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_fresh boolean;
begin
  if private.op_begin(p_op_id, 'suspend_match') is not null then
    return;
  end if;
  m := private.match_for_update(p_match);
  if not (coalesce(m.scorer_id = v_uid, false) or private.is_match_official(m.league_id)) then
    perform private.deny();
  end if;
  if m.status = 'suspended' then
    perform private.op_end(p_op_id, null);
    return;
  end if;
  if m.status not in ('scheduled', 'live') then
    perform private.fail('cerrado');
  end if;
  p_state := private.check_state(p_state);
  p_score := private.check_score(p_score);
  perform private.check_seq(p_seq, p_state, m.seq);
  v_fresh := (p_seq is null or p_seq >= m.seq) and (p_state is null or private.state_follows(p_state, m));
  update public.matches x set
    status = 'suspended',
    state = case when v_fresh then coalesce(p_state, x.state) else x.state end,
    score = case when v_fresh then coalesce(p_score, x.score) else x.score end,
    seq = case when v_fresh then greatest(x.seq, coalesce(p_seq, x.seq)) else x.seq end,
    scorer_id = null,
    lease_until = null,
    note = coalesce(v_note, x.note),
    history = private.match_history(x.history, 'suspend', v_note, jsonb_build_object('score', coalesce(p_score, m.score) -> 'text'))
  where x.id = p_match;
  perform private.op_end(p_op_id, null);
end $$;

-- Admin: anula el partido (no cuenta). Se deshace corrigiendo el resultado o reprogramando.
create function public.void_match(p_match uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.require_uid();
  m := private.match_for_update(p_match);
  perform private.require_admin(m.league_id);
  update public.matches x set
    status = 'void',
    scorer_id = null,
    lease_until = null,
    note = coalesce(v_note, x.note),
    history = private.match_history(x.history, 'void', v_note, jsonb_build_object('from', m.status))
  where x.id = p_match;
end $$;

-- Admin: borra el partido (con sus lados y jugadores).
create function public.delete_match(p_match uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select m.league_id from public.matches m where m.id = p_match);
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  delete from public.matches where id = p_match;
end $$;

-- Mis partidos en todas mis ligas: donde juego (match_players) o donde juega mi equipo o pareja
-- (team_players). Con p_since: los de esa fecha en adelante, más los que siguen abiertos. Lee con la RLS
-- de quien llama (no es security definer).
create function public.my_matches(p_since timestamptz default null)
returns table (match_id uuid, league_id uuid, side smallint)
language sql stable set search_path = '' as $$
  select distinct on (x.match_id) x.match_id, x.league_id, x.side
    from (
      select mp.match_id, mp.league_id, mp.side
        from public.match_players mp join public.players p on p.id = mp.player_id
       where p.user_id = (select auth.uid())
      union all
      select ms.match_id, ms.league_id, ms.side
        from public.match_sides ms
        join public.team_players tp on tp.team_id = ms.team_id
        join public.players p on p.id = tp.player_id
       where p.user_id = (select auth.uid())
    ) x
    join public.matches m on m.id = x.match_id
   where p_since is null
      or coalesce(m.scheduled_at, m.created_at) >= p_since
      or m.status in ('live', 'suspended', 'finished', 'disputed')
   order by x.match_id, x.side
$$;

-- =====================================================================
-- RPC: equipos y parejas de temporada
-- =====================================================================

-- Admin: equipo o pareja de temporada (sin evento). p_players = [{player_id, jersey?, position?, role?}].
create function public.create_season_team(
  p_league uuid,
  p_name text,
  p_color text default null,
  p_players jsonb default null,
  p_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.require_uid();
  perform private.require_match_league(p_league);
  perform private.require_admin(p_league);
  insert into public.teams (id, league_id, event_id, name, sort_order, color)
  values (coalesce(p_id, gen_random_uuid()), p_league, null, private.clean_name(p_name),
          coalesce((select max(t.sort_order) from public.teams t where t.league_id = p_league and t.event_id is null), 0) + 1,
          nullif(btrim(coalesce(p_color, '')), ''))
  returning id into v_id;
  if p_players is not null and jsonb_typeof(p_players) <> 'null' then
    perform private.write_roster(v_id, p_league, p_players, true);
  end if;
  return v_id;
end $$;

-- Admin: cambia nombre, color u orden. Claves: name, color, sort_order.
create function public.update_season_team(p_team uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.teams;
  k text;
begin
  perform private.require_uid();
  t := private.season_team_for_update(p_team);
  perform private.require_admin(t.league_id);
  if jsonb_typeof(p_patch) is distinct from 'object' then
    perform private.fail('invalido');
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k <> all (array['name', 'color', 'sort_order']) then
      perform private.fail('invalido');
    end if;
  end loop;
  update public.teams x set
    name = case when p_patch ? 'name' then private.clean_name(p_patch ->> 'name') else x.name end,
    color = case when p_patch ? 'color' then nullif(btrim(coalesce(p_patch ->> 'color', '')), '') else x.color end,
    sort_order = case when p_patch ? 'sort_order' then (p_patch ->> 'sort_order')::integer else x.sort_order end
  where x.id = p_team;
end $$;

-- Admin: borra el equipo. Sus partidos se quedan con el nombre copiado (match_sides.label).
create function public.delete_season_team(p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.teams;
begin
  perform private.require_uid();
  t := private.season_team_for_update(p_team);
  perform private.require_admin(t.league_id);
  delete from public.teams where id = p_team;
end $$;

-- Pone (o cambia) un jugador en la plantilla. Admin: todo, también el rol. Capitán o delegado del equipo:
-- dorsal y posición; los nuevos entran como 'player' y no cambia roles (p_role distinto de null/'player': no);
-- no suma a quien ya está en otro equipo de la liga ('invalido': lo cambia el admin).
create function public.set_team_player(
  p_team uuid,
  p_player uuid,
  p_jersey integer default null,
  p_position text default null,
  p_role text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.teams;
  v_admin boolean;
begin
  perform private.require_uid();
  t := private.season_team_for_update(p_team);
  v_admin := private.is_admin(t.league_id);
  if not (v_admin or coalesce(private.team_role(p_team) in ('captain', 'delegate'), false)) then
    perform private.deny();
  end if;
  if p_role is not null and p_role not in ('player', 'captain', 'delegate') then
    perform private.fail('invalido');
  end if;
  if not v_admin and p_role is not null and (
       p_role <> 'player'
       or coalesce((select tp.role from public.team_players tp where tp.team_id = p_team and tp.player_id = p_player), 'player') <> 'player') then
    perform private.deny();
  end if;
  if not v_admin then
    perform private.check_free_players(p_team, t.league_id, array[p_player]);
  end if;
  insert into public.team_players as tp (team_id, player_id, league_id, jersey, position, role)
  values (p_team, p_player, t.league_id, p_jersey::smallint, nullif(btrim(coalesce(p_position, '')), ''), coalesce(p_role, 'player'))
  on conflict (team_id, player_id) do update
    set jersey = excluded.jersey, position = excluded.position, role = coalesce(p_role, tp.role);
end $$;

-- Saca a un jugador de la plantilla: admin; capitán o delegado (solo a jugadores, no a otro capitán o
-- delegado); o el propio jugador. false si no estaba.
create function public.remove_team_player(p_team uuid, p_player uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  t public.teams;
  v_role text;
  v_self boolean;
begin
  perform private.require_uid();
  t := private.season_team_for_update(p_team);
  select tp.role into v_role from public.team_players tp where tp.team_id = p_team and tp.player_id = p_player;
  v_self := coalesce(p_player = private.my_player(t.league_id), false);
  if not (private.is_admin(t.league_id) or v_self
          or (coalesce(private.team_role(p_team) in ('captain', 'delegate'), false) and coalesce(v_role, 'player') = 'player')) then
    perform private.deny();
  end if;
  delete from public.team_players where team_id = p_team and player_id = p_player;
  return found;
end $$;

-- Plantilla completa de una vez (reemplaza la que había). Admin: con roles. Capitán o delegado: los roles no
-- cambian, los capitanes y delegados se quedan y no entra quien ya está en otro equipo de la liga.
create function public.set_roster(p_team uuid, p_players jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.teams;
  v_admin boolean;
begin
  perform private.require_uid();
  t := private.season_team_for_update(p_team);
  v_admin := private.is_admin(t.league_id);
  if not (v_admin or coalesce(private.team_role(p_team) in ('captain', 'delegate'), false)) then
    perform private.deny();
  end if;
  perform private.write_roster(p_team, t.league_id, p_players, v_admin);
end $$;

-- =====================================================================
-- Tiempo real
-- =====================================================================

-- La fila del partido que ven las listas (sin state, rules ni history, que son grandes).
create function private.match_row(m public.matches) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(m) - 'state' - 'rules' - 'history'
$$;

-- Cada cambio del partido: la fila entera a la liga y al evento (quien mira no vuelve a leer).
create function private.emit_match_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if to_jsonb(new) - 'updated_at' - 'version' = to_jsonb(old) - 'updated_at' - 'version' then
    return null;
  end if;
  v := private.match_row(new);
  perform private.emit('league:' || new.league_id::text, 'match', v);
  if new.event_id is not null then
    perform private.emit('event:' || new.event_id::text, 'match', v);
  end if;
  if old.event_id is not null and old.event_id is distinct from new.event_id then
    perform private.emit('event:' || old.event_id::text, 'matches', jsonb_build_object('op', 'delete', 'ids', jsonb_build_array(new.id)));
  end if;
  return null;
end $$;

create trigger matches_emit_update after update on public.matches for each row execute function private.emit_match_update();

-- Altas y bajas: {op, ids} (una vez por sentencia).
create function private.emit_matches() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then
    for r in select o.league_id, jsonb_agg(o.id) as ids from old_rows o group by o.league_id loop
      if not private.deleting(r.league_id) then
        perform private.emit('league:' || r.league_id::text, 'matches', jsonb_build_object('op', 'delete', 'ids', r.ids));
      end if;
    end loop;
    for r in select o.league_id, o.event_id, jsonb_agg(o.id) as ids from old_rows o where o.event_id is not null group by o.league_id, o.event_id loop
      if not private.deleting(r.league_id) then
        perform private.emit('event:' || r.event_id::text, 'matches', jsonb_build_object('op', 'delete', 'ids', r.ids));
      end if;
    end loop;
    return null;
  end if;
  for r in select n.league_id, jsonb_agg(n.id) as ids from new_rows n group by n.league_id loop
    perform private.emit('league:' || r.league_id::text, 'matches', jsonb_build_object('op', 'insert', 'ids', r.ids));
  end loop;
  for r in select n.event_id, jsonb_agg(n.id) as ids from new_rows n where n.event_id is not null group by n.event_id loop
    perform private.emit('event:' || r.event_id::text, 'matches', jsonb_build_object('op', 'insert', 'ids', r.ids));
  end loop;
  return null;
end $$;

create trigger matches_emit_insert after insert on public.matches referencing new table as new_rows
  for each statement execute function private.emit_matches();
create trigger matches_emit_delete after delete on public.matches referencing old table as old_rows
  for each statement execute function private.emit_matches();

-- Lados y jugadores: el partido cambió ({op: 'update', ids}). No avisa mientras create_matches arma los lados
-- ni cuando el partido se está borrando.
create function private.emit_match_children() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_ids uuid[];
begin
  if coalesce(current_setting('mm.quiet_sides', true), '') = 'on' then
    return null;
  end if;
  -- Los partidos que siguen existiendo (si se borró el partido, ya avisó su propio trigger).
  if tg_op = 'DELETE' then
    select array_agg(distinct o.match_id) into v_ids from old_rows o;
  else
    select array_agg(distinct n.match_id) into v_ids from new_rows n;
  end if;
  for r in select m.league_id, m.event_id, jsonb_agg(m.id) as ids from public.matches m
            where m.id = any (v_ids) group by m.league_id, m.event_id loop
    if not private.deleting(r.league_id) then
      perform private.emit('league:' || r.league_id::text, 'matches', jsonb_build_object('op', 'update', 'ids', r.ids));
      if r.event_id is not null then
        perform private.emit('event:' || r.event_id::text, 'matches', jsonb_build_object('op', 'update', 'ids', r.ids));
      end if;
    end if;
  end loop;
  return null;
end $$;

create trigger match_sides_emit_insert after insert on public.match_sides referencing new table as new_rows
  for each statement execute function private.emit_match_children();
create trigger match_sides_emit_update after update on public.match_sides referencing new table as new_rows
  for each statement execute function private.emit_match_children();
create trigger match_sides_emit_delete after delete on public.match_sides referencing old table as old_rows
  for each statement execute function private.emit_match_children();
create trigger match_players_emit_insert after insert on public.match_players referencing new table as new_rows
  for each statement execute function private.emit_match_children();
create trigger match_players_emit_update after update on public.match_players referencing new table as new_rows
  for each statement execute function private.emit_match_children();
create trigger match_players_emit_delete after delete on public.match_players referencing old table as old_rows
  for each statement execute function private.emit_match_children();

-- Equipos de temporada y plantillas: league:<id> 'teams' {op, ids: equipos}.
create function private.emit_season_teams() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then
    for r in select o.league_id, jsonb_agg(distinct o.id) as ids from old_rows o where o.event_id is null group by o.league_id loop
      if not private.deleting(r.league_id) then
        perform private.emit('league:' || r.league_id::text, 'teams', jsonb_build_object('op', 'delete', 'ids', r.ids));
      end if;
    end loop;
  else
    for r in select n.league_id, jsonb_agg(distinct n.id) as ids from new_rows n where n.event_id is null group by n.league_id loop
      perform private.emit('league:' || r.league_id::text, 'teams', jsonb_build_object('op', lower(tg_op), 'ids', r.ids));
    end loop;
  end if;
  return null;
end $$;

create trigger teams_emit_season_insert after insert on public.teams referencing new table as new_rows
  for each statement execute function private.emit_season_teams();
create trigger teams_emit_season_update after update on public.teams referencing new table as new_rows
  for each statement execute function private.emit_season_teams();
create trigger teams_emit_season_delete after delete on public.teams referencing old table as old_rows
  for each statement execute function private.emit_season_teams();

create function private.emit_team_players() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then
    for r in select o.league_id, jsonb_agg(distinct o.team_id) as ids from old_rows o group by o.league_id loop
      if not private.deleting(r.league_id) then
        perform private.emit('league:' || r.league_id::text, 'teams', jsonb_build_object('op', 'update', 'ids', r.ids));
      end if;
    end loop;
  else
    for r in select n.league_id, jsonb_agg(distinct n.team_id) as ids from new_rows n group by n.league_id loop
      perform private.emit('league:' || r.league_id::text, 'teams', jsonb_build_object('op', 'update', 'ids', r.ids));
    end loop;
  end if;
  return null;
end $$;

create trigger team_players_emit_insert after insert on public.team_players referencing new table as new_rows
  for each statement execute function private.emit_team_players();
create trigger team_players_emit_update after update on public.team_players referencing new table as new_rows
  for each statement execute function private.emit_team_players();
create trigger team_players_emit_delete after delete on public.team_players referencing old table as old_rows
  for each statement execute function private.emit_team_players();

-- =====================================================================
-- Push: «Tienes un resultado por confirmar» al otro lado
-- =====================================================================
-- Cuando un jugador propone el resultado, las cuentas del otro lado (raqueta: sus jugadores o su pareja; equipos:
-- capitán y delegado) reciben un push con el link al partido. push_outbox lo reparte por teléfono (fanout) y
-- send-push lo manda (en PGlite no sale nada). Nunca frena el resultado: si algo falla, solo avisa.
create function private.push_result_to_confirm() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_rival smallint := case new.proposed_side when 1 then 2 when 2 then 1 end;
  v_family text;
  v_from text;
begin
  if v_rival is null then
    return null;
  end if;
  v_family := private.league_family(new.league_id);
  v_from := (select s.label from public.match_sides s where s.match_id = new.id and s.side = new.proposed_side);
  insert into public.push_outbox (user_id, title, body, url, tag, ttl)
  select u.user_id,
         'Tienes un resultado por confirmar',
         left(coalesce(v_from, 'El rival') || ' anotó ' || coalesce(nullif(new.score ->> 'text', ''), 'el resultado')
              || '. Confírmalo o reclama antes de 48 horas.', 1000),
         '/l/' || new.league_id::text || '/juegos?partido=' || new.id::text,
         'confirmar:' || new.id::text,
         172800
    from (
      select p.user_id from public.match_players mp join public.players p on p.id = mp.player_id
       where mp.match_id = new.id and mp.side = v_rival and p.user_id is not null and v_family = 'racket'
      union
      select p.user_id from public.match_sides ms
        join public.team_players tp on tp.team_id = ms.team_id
        join public.players p on p.id = tp.player_id
       where ms.match_id = new.id and ms.side = v_rival and p.user_id is not null
         and (v_family = 'racket' or tp.role in ('captain', 'delegate'))
    ) u
   where u.user_id is distinct from new.proposed_by;
  if exists (select 1 from public.push_outbox o where o.tag = 'confirmar:' || new.id::text and o.sent_at is null) then
    perform private.kick_send_push();
  end if;
  return null;
exception when others then
  raise warning 'push del resultado %: %', new.id, sqlerrm;
  return null;
end $$;

create trigger matches_push_confirm after update of status on public.matches for each row
  when (new.status = 'finished' and old.status is distinct from 'finished')
  execute function private.push_result_to_confirm();

-- =====================================================================
-- Permisos: cerrado todo lo de esta migración; las RPC, solo con sesión
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array[
    'create_matches', 'update_match_schedule', 'set_match_sides', 'set_match_players',
    'claim_scorer', 'release_scorer', 'publish_match', 'finish_match',
    'confirm_result', 'dispute_result', 'resolve_dispute', 'admin_correct_result',
    'set_walkover', 'postpone_match', 'reschedule_match', 'suspend_match', 'void_match', 'delete_match',
    'my_matches',
    'create_season_team', 'update_season_team', 'delete_season_team', 'set_team_player', 'remove_team_player', 'set_roster'
  ];
  v_private constant text[] := array[
    'league_family', 'require_match_league', 'match_lease', 'match_auto_confirm', 'match_final', 'match_side_of', 'match_side',
    'can_score_as', 'is_match_official', 'team_role', 'match_for_update', 'season_team_for_update', 'match_history',
    'check_score', 'check_state', 'check_winner', 'claim_result', 'write_players', 'write_sides', 'write_roster',
    'match_seq_step', 'check_seq', 'state_follows', 'check_free_players',
    'bump_match_version', 'check_match', 'check_season_team', 'check_team_is_season',
    'match_row', 'emit_match_update', 'emit_matches', 'emit_match_children', 'emit_season_teams', 'emit_team_players',
    'push_result_to_confirm'
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
