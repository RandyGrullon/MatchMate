-- MatchMate · Boliche: equipos fijos de la liga, la práctica abierta para todos el día que toca y las bolas con catálogo
-- y layout del taladrado. Contrato completo: docs/boliche-equipos-practicas-bolas.md. Pruebas:
-- tests/sql/boliche-equipos-practicas-bolas.test.ts.
--
-- 1. Equipos fijos: una liga de boliche tiene equipos sin evento (teams.event_id null, sin temporada) con su plantilla en
--    team_players, como los de temporada de las ligas de partidos. private.check_season_team los acepta en una liga de
--    boliche (y en las de partidos, como antes). Un jugador está en un solo equipo fijo de la liga (lo cuidan las RPC:
--    set_bowling_teams no deja repetirlo y save_bowling_team lo saca del otro). Se manejan solo con set_bowling_teams, save_bowling_team y
--    delete_bowling_team: private.season_team_for_update no los encuentra ('no_existe' en update_season_team,
--    set_team_player, set_roster, remove_team_player y delete_season_team). Se leen por tabla (RLS de la liga).
--    teams.league_team_id: el equipo fijo del que salió cada equipo de un torneo (FK compuesta con la liga, on delete set
--    null; una copia por equipo fijo y torneo, índice único). Al entrar un jugador a un torneo de boliche (cualquier
--    insert en entries de un evento 'torneo' sin team_id), si el jugador está en un equipo fijo se usa la copia de su
--    equipo en ese torneo (se crea si falta, con el mismo nombre y color): trigger entries_auto_team, antes de
--    entries_check. apply_league_teams vuelve a aplicarlos a un torneo con inscritos (ver la función).
--    Tiempo real: los equipos fijos y sus plantillas ya avisan 'teams' a league:<liga> (private.emit_season_teams y
--    private.emit_team_players); las copias, como los equipos de apply_teams, llegan con el aviso 'entries' del torneo.
-- 2. Práctica abierta: open_practice abre (o encuentra) la práctica de hoy o de ayer (zona de la liga) para cualquier
--    jugador o admin; hoy, desde la hora del horario de la liga (private.event_start). Se crea con los datos de las
--    prácticas automáticas de approve_submission. Se cierra al otro día: en una práctica de antes de ayer,
--    submit_games, add_practice_game y publish_live responden 'cerrado' a quien no es admin
--    (private.practice_locked); un envío por fecha (submit_games con p_date, sin evento) también, si la fecha es de
--    antes de ayer en la zona de la liga. Reintentar un envío que ya se hizo (mismo p_op_id) devuelve el mismo. Los
--    torneos no cambian.
-- 3. Bolas: bowling_balls.catalog (la clave 'marca:modelo' de src/lib/ballCatalog.ts, hasta 80) y bowling_balls.layout
--    (jsonb con CHECK private.ball_layout_ok). set_ball_details pone las dos; my_balls suma catalog y layout.
--
-- Redefine (desde su última versión): private.check_season_team (20261008000100_esports.sql),
-- private.season_team_for_update (20260927000100_partidos.sql), public.submit_games, public.add_practice_game y
-- public.publish_live (20260926000500_rpc.sql) y public.my_balls (20260930000300_diseno_bolas.sql). Una migración
-- posterior que redefina alguna tiene que copiar esta.

-- =====================================================================
-- 1. Equipos fijos de la liga
-- =====================================================================

alter table public.teams
  add column league_team_id uuid,
  add constraint teams_league_team_fk foreign key (league_team_id, league_id)
    references public.teams (id, league_id) on delete set null (league_team_id),
  add constraint teams_league_team_copy check (league_team_id is null or event_id is not null);
create unique index teams_league_copy_idx on public.teams (event_id, league_team_id) where league_team_id is not null;
create index teams_league_team_idx on public.teams (league_team_id) where league_team_id is not null;

-- Igual que en 20261008000100_esports.sql y además las ligas de boliche (sus equipos fijos, sin temporada).
create or replace function private.check_season_team() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.event_id is null and coalesce(private.league_family(new.league_id), '') not in ('racket', 'team', 'esports')
     and not exists (select 1 from public.leagues l where l.id = new.league_id and l.sport = 'bowling') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Los equipos de temporada son de ligas de partidos.';
  end if;
  return new;
end $$;

-- Igual que en 20260927000100_partidos.sql, pero los equipos fijos del boliche no son de temporada: esos se manejan con
-- set_bowling_teams, save_bowling_team y delete_bowling_team ('no_existe' aquí).
create or replace function private.season_team_for_update(p_team uuid) returns public.teams
language plpgsql security definer set search_path = '' as $$
declare
  t public.teams;
begin
  select * into t from public.teams x
   where x.id = p_team and x.event_id is null
     and not exists (select 1 from public.leagues l where l.id = x.league_id and l.sport = 'bowling')
  for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  return t;
end $$;

-- Liga de boliche: 'no_existe' si no está, 'invalido' si es de otro deporte.
create function private.require_bowling_league(p_league uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v text := (select l.sport from public.leagues l where l.id = p_league);
begin
  if v is null then
    perform private.fail('no_existe');
  end if;
  if v <> 'bowling' then
    perform private.fail('invalido');
  end if;
end $$;

-- Color de un equipo: '#rrggbb' (en minúsculas) o null (vacío). 'invalido' si no.
create function private.bowling_team_color(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text := lower(nullif(btrim(coalesce(p, '')), ''));
begin
  if v is not null and v !~ '^#[0-9a-f]{6}$' then
    perform private.fail('invalido');
  end if;
  return v;
end $$;

-- El equipo fijo del jugador en su liga (null si no tiene). Si por algo quedó en dos, el primero en el orden de la liga.
create function private.player_league_team(p_league uuid, p_player uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select t.id from public.team_players tp
    join public.teams t on t.id = tp.team_id and t.event_id is null and t.league_id = p_league
   where tp.player_id = p_player
   order by t.sort_order, t.created_at, t.id
   limit 1
$$;

-- La copia del equipo fijo p_team en el evento p_event: la que hay o una nueva (mismo nombre y color, al final del orden
-- del evento). Dos inscripciones a la vez: el índice único deja una sola.
create function private.league_team_copy(p_event uuid, p_team uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
begin
  select x.id into v from public.teams x where x.event_id = p_event and x.league_team_id = p_team;
  if v is not null then
    return v;
  end if;
  insert into public.teams (league_id, event_id, name, color, sort_order, league_team_id)
  select t.league_id, p_event, t.name, t.color,
         coalesce((select max(x.sort_order) from public.teams x where x.event_id = p_event), 0) + 1, t.id
    from public.teams t where t.id = p_team
  on conflict (event_id, league_team_id) where league_team_id is not null do nothing
  returning id into v;
  if v is null then
    select x.id into v from public.teams x where x.event_id = p_event and x.league_team_id = p_team;
  end if;
  return v;
end $$;

-- Antes de guardar una inscripción nueva sin equipo en un torneo de boliche: el equipo de su equipo fijo en ese torneo.
-- Si ya estaba inscrito (el insert va a chocar: add_entries hace on conflict do nothing) no crea nada.
create function private.entry_league_team() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_fixed uuid;
begin
  if new.team_id is not null then
    return new;
  end if;
  v_fixed := private.player_league_team(new.league_id, new.player_id);
  if v_fixed is null
     or not exists (select 1 from public.events e join public.leagues l on l.id = e.league_id
                     where e.id = new.event_id and e.type = 'torneo' and l.sport = 'bowling')
     or exists (select 1 from public.entries x where x.event_id = new.event_id and x.player_id = new.player_id) then
    return new;
  end if;
  new.team_id := private.league_team_copy(new.event_id, v_fixed);
  return new;
end $$;

-- 'entries_auto_team' < 'entries_check': el equipo ya está puesto cuando se revisa que sea del mismo evento.
create trigger entries_auto_team before insert on public.entries
  for each row execute function private.entry_league_team();

-- Admin: reemplaza todos los equipos fijos de la liga de una vez («Generar al azar», «Generar parejos» y editar).
-- p_teams = [{id?, name (1–60), color? ('#rrggbb' | null), players: [uuid]}] en orden (ese es su orden en la liga).
-- Un id que ya es de un equipo fijo de esta liga se conserva (nombre, color y plantilla nuevos); un id nuevo (el teléfono
-- lo puede generar) o sin id, se crea. Los equipos fijos que no vienen se borran (sus copias en los torneos quedan con
-- league_team_id null). Devuelve los ids en el orden de p_teams. 'invalido': no es una lista de objetos, más de 40
-- equipos, un nombre o color que no vale, un id repetido o de otro equipo (de un evento o de otra liga), un jugador
-- repetido (en uno o en dos equipos) o que no es de la liga.
create function public.set_bowling_teams(p_league uuid, p_teams jsonb) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_ids uuid[] := '{}';
  v_names text[] := '{}';
  v_colors text[] := '{}';
  v_pteam uuid[] := '{}';
  v_pplayer uuid[] := '{}';
  v_id uuid;
  g jsonb;
  y jsonb;
begin
  perform private.require_uid();
  perform private.require_bowling_league(p_league);
  perform private.require_admin(p_league);
  if jsonb_typeof(p_teams) is distinct from 'array' or jsonb_array_length(p_teams) > 40 then
    perform private.fail('invalido');
  end if;
  for g in select x from jsonb_array_elements(p_teams) x loop
    if jsonb_typeof(g) <> 'object'
       or coalesce(jsonb_typeof(g -> 'id'), 'null') not in ('string', 'null')
       or coalesce(jsonb_typeof(g -> 'color'), 'null') not in ('string', 'null')
       or coalesce(jsonb_typeof(g -> 'players'), 'null') not in ('array', 'null')
       or jsonb_typeof(g -> 'name') is distinct from 'string' then
      perform private.fail('invalido');
    end if;
    if coalesce(g ->> 'id', '') = '' then
      v_id := gen_random_uuid();
    elsif (g ->> 'id') ~* v_uuid then
      v_id := (g ->> 'id')::uuid;
    else
      perform private.fail('invalido');
    end if;
    v_ids := array_append(v_ids, v_id);
    v_names := array_append(v_names, private.clean_name(g ->> 'name'));
    v_colors := array_append(v_colors, private.bowling_team_color(g ->> 'color'));
    for y in select x from jsonb_array_elements(case when jsonb_typeof(g -> 'players') = 'array' then g -> 'players' else '[]'::jsonb end) x loop
      if jsonb_typeof(y) <> 'string' or (y #>> '{}') !~* v_uuid then
        perform private.fail('invalido');
      end if;
      v_pteam := array_append(v_pteam, v_id);
      v_pplayer := array_append(v_pplayer, (y #>> '{}')::uuid);
    end loop;
  end loop;
  if (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids)
     or (select count(distinct x) from unnest(v_pplayer) x) <> cardinality(v_pplayer)
     or exists (select 1 from unnest(v_pplayer) x
                 where not exists (select 1 from public.players p where p.id = x and p.league_id = p_league)) then
    perform private.fail('invalido');
  end if;
  -- Dos admins guardando a la vez: uno después del otro.
  perform pg_advisory_xact_lock(hashtext('mm:bowling_teams:' || p_league::text));
  if exists (select 1 from public.teams t where t.id = any (v_ids) and (t.league_id <> p_league or t.event_id is not null)) then
    perform private.fail('invalido');
  end if;
  delete from public.teams t where t.league_id = p_league and t.event_id is null and t.id <> all (v_ids);
  insert into public.teams as t (id, league_id, event_id, name, color, sort_order)
  select v_ids[i], p_league, null, v_names[i], v_colors[i], i from generate_subscripts(v_ids, 1) i
  on conflict (id) do update set name = excluded.name, color = excluded.color, sort_order = excluded.sort_order
    where (t.name, t.color, t.sort_order) is distinct from (excluded.name, excluded.color, excluded.sort_order);
  delete from public.team_players tp
   where tp.league_id = p_league
     and tp.team_id in (select t.id from public.teams t where t.league_id = p_league and t.event_id is null)
     and not exists (select 1 from unnest(v_pteam, v_pplayer) as d (team_id, player_id)
                      where d.team_id = tp.team_id and d.player_id = tp.player_id);
  insert into public.team_players (team_id, player_id, league_id)
  select d.team_id, d.player_id, p_league from unnest(v_pteam, v_pplayer) as d (team_id, player_id)
  on conflict (team_id, player_id) do nothing;
  return v_ids;
end $$;

-- Admin: crea (p_id null, o un id nuevo del teléfono) o cambia un equipo fijo de la liga y devuelve su id. p_players: la
-- plantilla completa (reemplaza la que tenía; null = no la toca); quien estaba en otro equipo fijo de la liga sale de
-- ese. 'invalido': nombre o color que no vale, un jugador repetido o que no es de la liga, un id de otro equipo (de un
-- evento o de otra liga) o el equipo 41.
create function public.save_bowling_team(p_league uuid, p_id uuid, p_name text, p_color text, p_players uuid[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_name text;
  v_color text;
  t public.teams;
begin
  perform private.require_uid();
  perform private.require_bowling_league(p_league);
  perform private.require_admin(p_league);
  v_name := private.clean_name(p_name);
  v_color := private.bowling_team_color(p_color);
  if p_players is not null and (
       coalesce(array_ndims(p_players), 1) <> 1 or array_position(p_players, null) is not null
       or (select count(distinct x) from unnest(p_players) x) <> cardinality(p_players)
       or exists (select 1 from unnest(p_players) x
                   where not exists (select 1 from public.players p where p.id = x and p.league_id = p_league))) then
    perform private.fail('invalido');
  end if;
  perform pg_advisory_xact_lock(hashtext('mm:bowling_teams:' || p_league::text));
  select * into t from public.teams x where x.id = v_id for update;
  if t.id is not null and (t.league_id <> p_league or t.event_id is not null) then
    perform private.fail('invalido');
  end if;
  if t.id is null then
    if (select count(*) from public.teams x where x.league_id = p_league and x.event_id is null) >= 40 then
      perform private.fail('invalido');
    end if;
    insert into public.teams (id, league_id, event_id, name, color, sort_order)
    values (v_id, p_league, null, v_name, v_color,
            coalesce((select max(x.sort_order) from public.teams x where x.league_id = p_league and x.event_id is null), 0) + 1);
  else
    update public.teams x set name = v_name, color = v_color
     where x.id = v_id and (x.name, x.color) is distinct from (v_name, v_color);
  end if;
  if p_players is not null then
    delete from public.team_players tp where tp.team_id = v_id and tp.player_id <> all (p_players);
    delete from public.team_players tp
     using public.teams x
     where tp.team_id = x.id and x.league_id = p_league and x.event_id is null and x.id <> v_id
       and tp.player_id = any (p_players);
    insert into public.team_players (team_id, player_id, league_id)
    select v_id, x, p_league from unnest(p_players) x
    on conflict (team_id, player_id) do nothing;
  end if;
  return v_id;
end $$;

-- Admin: borra un equipo fijo (su plantilla con él; sus copias en los torneos quedan con league_team_id null).
-- 'no_existe' si no es un equipo fijo de una liga de boliche.
create function public.delete_bowling_team(p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.teams;
begin
  perform private.require_uid();
  select * into t from public.teams x
   where x.id = p_team and x.event_id is null
     and exists (select 1 from public.leagues l where l.id = x.league_id and l.sport = 'bowling');
  if t.id is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(t.league_id);
  perform pg_advisory_xact_lock(hashtext('mm:bowling_teams:' || t.league_id::text));
  delete from public.teams x where x.id = p_team;
end $$;

-- Admin: vuelve a aplicar los equipos fijos a un torneo de boliche que ya tiene inscritos. Cada inscrito que está en un
-- equipo fijo queda en la copia de su equipo (se crea si falta); el que ya no está en ninguno y estaba en una copia
-- queda sin equipo; los demás (equipos armados a mano) no se tocan. Las copias toman el nombre y el color de hoy de su
-- equipo fijo y las que quedan vacías se borran. Devuelve cuántas inscripciones del torneo quedaron con equipo.
-- 'no_existe'; 'invalido' si no es un torneo de boliche (una práctica, por ejemplo).
create function public.apply_league_teams(p_event uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
  v_type text;
  r record;
begin
  perform private.require_uid();
  select e.league_id, e.type into v_league, v_type from public.events e where e.id = p_event for update;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  if v_type <> 'torneo' or (select l.sport from public.leagues l where l.id = v_league) <> 'bowling' then
    perform private.fail('invalido');
  end if;
  update public.teams c set name = f.name, color = f.color
    from public.teams f
   where c.event_id = p_event and c.league_team_id = f.id and (c.name, c.color) is distinct from (f.name, f.color);
  -- Las copias que hacen falta, en el orden de los equipos fijos.
  for r in select f.id from public.teams f
            where f.id in (select private.player_league_team(v_league, x.player_id) from public.entries x where x.event_id = p_event)
            order by f.sort_order, f.created_at, f.id loop
    perform private.league_team_copy(p_event, r.id);
  end loop;
  -- Una sola sentencia: un solo aviso de tiempo real.
  update public.entries e set team_id = m.team
    from (select x.id,
                 (select c.id from public.teams c
                   where c.event_id = p_event and c.league_team_id = private.player_league_team(v_league, x.player_id)) as team
            from public.entries x where x.event_id = p_event) m
   where e.id = m.id
     and e.team_id is distinct from m.team
     and (m.team is not null
          or exists (select 1 from public.teams c where c.id = e.team_id and c.league_team_id is not null));
  delete from public.teams c
   where c.event_id = p_event and c.league_team_id is not null
     and not exists (select 1 from public.entries x where x.team_id = c.id);
  return (select count(*)::integer from public.entries x where x.event_id = p_event and x.team_id is not null);
end $$;

-- =====================================================================
-- 2. La práctica abierta para todos el día que toca
-- =====================================================================

-- La práctica p_event está cerrada para la cuenta: es una práctica de antes de ayer (en la zona de su liga) y la cuenta
-- no es admin de la liga. false si no existe o no es una práctica.
create function private.practice_locked(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select e.date < (now() at time zone l.tz)::date - 1 and not private.is_admin(e.league_id)
      from public.events e join public.leagues l on l.id = e.league_id
     where e.id = p_event and e.type = 'practica'), false)
$$;

-- Un jugador o admin de una liga de boliche abre (o encuentra) la práctica de ese día y devuelve su evento. p_date: hoy
-- (null) o ayer, en la zona de la liga; hoy, solo desde la hora del horario de la liga si la tiene
-- (private.event_start: sin hora, o si hoy no es uno de sus días, a cualquier hora). Si ya hay una práctica ese día en
-- la liga, devuelve esa (la primera); si no, la crea como las automáticas de approve_submission (3 juegos, scratch,
-- categorías 200/175/160). 'no_existe'; 'no_permitido' (no es jugador ni admin de la liga); 'invalido' (otro deporte);
-- 'cerrado' (antes de la hora, o una fecha que no es hoy ni ayer).
create function public.open_practice(p_league uuid, p_date date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  l public.leagues;
  v_now timestamp;
  v_today date;
  v_date date;
  v_start integer;
  v_id uuid;
begin
  select * into l from public.leagues x where x.id = p_league;
  if l.id is null then
    perform private.fail('no_existe');
  end if;
  if private.my_player(p_league) is null and not private.is_admin(p_league) then
    perform private.deny();
  end if;
  if l.sport <> 'bowling' then
    perform private.fail('invalido');
  end if;
  v_now := now() at time zone l.tz;
  v_today := v_now::date;
  v_date := coalesce(p_date, v_today);
  if v_date <> v_today and v_date <> v_today - 1 then
    perform private.fail('cerrado');
  end if;
  if v_date = v_today then
    v_start := (select s.minutes from private.event_start(v_today, l.schedule) s);
    if v_start is not null and (extract(hour from v_now)::integer * 60 + extract(minute from v_now)::integer) < v_start then
      perform private.fail('cerrado');
    end if;
  end if;
  -- Dos jugadores abriendo la misma práctica a la vez: una sola.
  perform pg_advisory_xact_lock(hashtext('mm:open_practice:' || p_league::text || ':' || v_date::text));
  select ev.id into v_id from public.events ev
   where ev.league_id = p_league and ev.type = 'practica' and ev.date = v_date
   order by ev.created_at, ev.id limit 1;
  if v_id is null then
    insert into public.events (league_id, type, name, date, games, hcp_base, hcp_percent, individual_rank_by, team_rank_by,
                               category_cuts, team_size, created_by)
    values (p_league, 'practica', '', v_date, 3, 0, 0, 'scratch', 'scratch', array[200, 175, 160], 0, v_uid)
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- La de 20260926000500_rpc.sql y además 'cerrado' a quien no es admin si p_event es una práctica cerrada
-- (private.practice_locked) o si p_date es de antes de ayer en la zona de la liga. Reintentar (mismo p_op_id) devuelve
-- el envío que ya se hizo.
create or replace function public.submit_games(
  p_op_id uuid,
  p_league uuid,
  p_scores jsonb,
  p_event uuid default null,
  p_date date default null,
  p_scanned jsonb default null,
  p_frames jsonb default null,
  p_photo jsonb default null,
  p_player uuid default null,
  p_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_prev jsonb;
  v_sport text;
  v_mine uuid;
  v_player uuid;
  v_photo uuid;
  v_id uuid;
begin
  if p_op_id is null then
    perform private.fail('invalido');
  end if;
  v_prev := private.op_begin(p_op_id, 'submit_games');
  if v_prev is not null then
    return (v_prev #>> '{}')::uuid;
  end if;
  v_sport := (select l.sport from public.leagues l where l.id = p_league);
  if v_sport is null then
    perform private.fail('no_existe');
  end if;
  v_mine := private.my_player(p_league);
  v_player := coalesce(p_player, v_mine);
  if v_player is null or (v_player is distinct from v_mine and not private.is_admin(p_league)) then
    perform private.deny();
  end if;
  if (p_event is null) = (p_date is null) then
    perform private.fail('invalido');
  end if;
  if p_event is not null and not exists (select 1 from public.events e where e.id = p_event and e.league_id = p_league) then
    perform private.fail('no_existe');
  end if;
  if p_event is not null and private.practice_locked(p_event) then
    perform private.fail('cerrado');
  end if;
  -- Por fecha (va a la práctica de ese día): la misma regla, una fecha de antes de ayer en la zona de la liga.
  if p_date is not null and not private.is_admin(p_league)
     and p_date < (select (now() at time zone l.tz)::date - 1 from public.leagues l where l.id = p_league) then
    perform private.fail('cerrado');
  end if;
  if p_frames is not null and jsonb_typeof(p_frames) not in ('object', 'null') then
    perform private.fail('invalido');
  end if;
  if p_photo is not null and jsonb_typeof(p_photo) <> 'null' then
    v_photo := private.insert_photo(p_league, p_event, p_photo);
  end if;
  if p_event is not null then
    delete from public.live_states s where s.event_id = p_event and s.subject_key = 'p:' || v_player::text;
  end if;
  insert into public.submissions (id, league_id, player_id, event_id, date, scores, scanned, frames, photo_id, created_by)
  values (coalesce(p_id, gen_random_uuid()), p_league, v_player, p_event, p_date, private.series(p_scores, v_sport, 1),
          private.series(p_scanned, v_sport), nullif(p_frames, 'null'::jsonb), v_photo, v_uid)
  returning id into v_id;
  perform private.op_end(p_op_id, to_jsonb(v_id));
  return v_id;
end $$;

-- La de 20260926000500_rpc.sql y además 'cerrado' si la práctica está cerrada (private.practice_locked).
create or replace function public.add_practice_game(p_event uuid, p_expected integer default null, p_op_id uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_prev jsonb;
  v_league uuid;
  v_type text;
  v_games integer;
begin
  perform private.require_uid();
  v_prev := private.op_begin(p_op_id, 'add_practice_game');
  if v_prev is not null then
    return (v_prev #>> '{}')::integer;
  end if;
  select e.league_id, e.type, e.games into v_league, v_type, v_games from public.events e where e.id = p_event for update;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  if private.my_player(v_league) is null and not private.is_admin(v_league) then
    perform private.deny();
  end if;
  if v_type <> 'practica' then
    perform private.deny();
  end if;
  if private.practice_locked(p_event) then
    perform private.fail('cerrado');
  end if;
  if p_expected is null or v_games <= p_expected then
    if v_games >= 10 then
      perform private.fail('invalido');
    end if;
    update public.events set games = games + 1 where id = p_event returning games into v_games;
  end if;
  perform private.op_end(p_op_id, to_jsonb(v_games));
  return v_games;
end $$;

-- La de 20260926000500_rpc.sql y además 'cerrado' si es una práctica cerrada (private.practice_locked).
create or replace function public.publish_live(p_event uuid, p_scores jsonb, p_op_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_league uuid;
  v_type text;
  v_sport text;
  v_player uuid;
  v_scores smallint[];
  v_last integer;
begin
  if private.op_begin(p_op_id, 'publish_live') is not null then
    return;
  end if;
  select e.league_id, e.type into v_league, v_type from public.events e where e.id = p_event;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  v_player := private.my_player(v_league);
  if v_player is null then
    perform private.deny();
  end if;
  if v_type = 'torneo' and not exists (select 1 from public.entries x where x.event_id = p_event and x.player_id = v_player) then
    perform private.deny();
  end if;
  if private.practice_locked(p_event) then
    perform private.fail('cerrado');
  end if;
  v_sport := (select l.sport from public.leagues l where l.id = v_league);
  v_scores := coalesce(private.series(p_scores, v_sport), '{}');
  v_last := (select max(i) from generate_subscripts(v_scores, 1) i where v_scores[i] is not null);
  if v_last is null then
    delete from public.live_states where event_id = p_event and subject_key = 'p:' || v_player::text;
  else
    insert into public.live_states as s (event_id, subject_key, league_id, player_id, state, updated_by)
    values (p_event, 'p:' || v_player::text, v_league, v_player, jsonb_build_object('scores', to_jsonb(v_scores[1:v_last])), v_uid)
    on conflict (event_id, subject_key) do update set state = excluded.state, version = s.version + 1, updated_by = excluded.updated_by;
  end if;
  perform private.op_end(p_op_id, null);
end $$;

-- =====================================================================
-- 3. Bolas: catálogo y layout del taladrado
-- =====================================================================

-- Un número (jsonb number) de p_lo a p_hi en pasos de p_step. Nunca falla: cualquier otra cosa es false.
create function private.ball_step_ok(p jsonb, p_lo numeric, p_hi numeric, p_step numeric) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'number'
              then (p #>> '{}')::numeric between p_lo and p_hi and mod((p #>> '{}')::numeric, p_step) = 0
              else false end
$$;

-- ¿Se puede guardar este layout? Un objeto con al menos una de estas claves y ninguna otra (sin nulls):
-- drillingAngle y valAngle (grados, 0–90), pinToPap (pulgadas, 0–7, de a 1/8), pinBuffer (pulgadas, 0–7) y notes
-- (texto recortado de 1 a 60). Nunca falla: lo que no vale es false.
create function private.ball_layout_ok(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_n integer;
  v_known integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) >= 1024 then
    return false;
  end if;
  select count(*), count(*) filter (where k in ('drillingAngle', 'pinToPap', 'valAngle', 'pinBuffer', 'notes'))
    into v_n, v_known from jsonb_object_keys(p) k;
  if v_n = 0 or v_n <> v_known then
    return false;
  end if;
  if p ? 'drillingAngle' and not private.ball_num_ok(p -> 'drillingAngle', 0, 90) then
    return false;
  end if;
  if p ? 'valAngle' and not private.ball_num_ok(p -> 'valAngle', 0, 90) then
    return false;
  end if;
  if p ? 'pinToPap' and not private.ball_step_ok(p -> 'pinToPap', 0, 7, 0.125) then
    return false;
  end if;
  if p ? 'pinBuffer' and not private.ball_num_ok(p -> 'pinBuffer', 0, 7) then
    return false;
  end if;
  if p ? 'notes' then
    if jsonb_typeof(p -> 'notes') <> 'string' then
      return false;
    end if;
    if char_length(p ->> 'notes') not between 1 and 60 or (p ->> 'notes') <> btrim(p ->> 'notes') then
      return false;
    end if;
  end if;
  return true;
end $$;

alter table public.bowling_balls
  add column catalog text constraint bowling_balls_catalog_check check (char_length(catalog) between 1 and 80),
  add column layout jsonb constraint bowling_balls_layout_check check (layout is null or private.ball_layout_ok(layout));

-- El dueño pone el modelo del catálogo y el layout de una bola suya. p_catalog: la clave 'marca:modelo' de
-- src/lib/ballCatalog.ts (se recorta y pasa a minúsculas; hasta 80; null o vacío la quita). p_layout: null, el null de
-- JSON o {} lo quitan; las claves en null y las notas vacías se quitan (y las notas se recortan), y si no queda nada
-- también se quita; lo demás con private.ball_layout_ok. 'invalido'; 'no_existe'; 'no_permitido' (de otra cuenta,
-- también para el superadmin); 'rate_limited' (el límite de save_ball: 100 por día en balls:<uid>). Lo mismo que ya
-- tiene no cambia nada ni cuenta en el límite.
create function public.set_ball_details(p_ball uuid, p_catalog text, p_layout jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_catalog text := lower(nullif(btrim(coalesce(p_catalog, '')), ''));
  v_layout jsonb := nullif(p_layout, 'null'::jsonb);
  b public.bowling_balls;
begin
  if v_catalog is not null
     and (char_length(v_catalog) > 80 or v_catalog !~ '^[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*$') then
    perform private.fail('invalido');
  end if;
  if v_layout is not null then
    if jsonb_typeof(v_layout) <> 'object' then
      perform private.fail('invalido');
    end if;
    v_layout := jsonb_strip_nulls(v_layout);
    if jsonb_typeof(v_layout -> 'notes') = 'string' then
      v_layout := case when btrim(v_layout ->> 'notes') = '' then v_layout - 'notes'
                       else jsonb_set(v_layout, '{notes}', to_jsonb(btrim(v_layout ->> 'notes'))) end;
    end if;
    if v_layout = '{}'::jsonb then
      v_layout := null;
    elsif not private.ball_layout_ok(v_layout) then
      perform private.fail('invalido');
    end if;
  end if;
  b := private.my_ball(p_ball);
  if b.catalog is not distinct from v_catalog and b.layout is not distinct from v_layout then
    return;
  end if;
  if not private.rate_take('balls:' || v_uid::text, 100, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  update public.bowling_balls x set catalog = v_catalog, layout = v_layout where x.id = b.id;
end $$;

-- Mis bolas: {balls: [{id, name, brand, weight, color, cover, drilledOn, resurfacedOn, retired, createdAt, updatedAt,
-- design, catalog, layout}], lastUsed: la bola del último juego que marqué (null si ninguno)}. design, catalog y layout:
-- null si no tiene. Las que uso primero, cada grupo de la más vieja a la más nueva. (La de 20260930000300_diseno_bolas.sql
-- con catalog y layout.)
create or replace function public.my_balls() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  return jsonb_build_object(
    'balls', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id,
               'name', b.name,
               'brand', b.brand,
               'weight', b.weight,
               'color', b.color,
               'cover', b.cover,
               'drilledOn', to_char(b.drilled_on, 'YYYY-MM-DD'),
               'resurfacedOn', to_char(b.resurfaced_on, 'YYYY-MM-DD'),
               'retired', b.retired,
               'createdAt', private.iso(b.created_at),
               'updatedAt', private.iso(b.updated_at),
               'design', b.design,
               'catalog', b.catalog,
               'layout', b.layout)
               order by b.retired, b.created_at, b.id)
        from public.bowling_balls b where b.user_id = v_uid), '[]'::jsonb),
    'lastUsed', (select g.ball_id from public.ball_games g where g.user_id = v_uid order by g.created_at desc, g.game desc limit 1));
end $$;

-- =====================================================================
-- Permisos: las RPC solo con sesión; las ayudas y triggers, nadie de la app (la revisión del layout también la ejecuta
-- service_role: la usa el CHECK de la columna, como private.ball_design_ok)
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array[
    'set_bowling_teams', 'save_bowling_team', 'delete_bowling_team', 'apply_league_teams', 'open_practice', 'set_ball_details',
    -- Redefinidas (conservan sus permisos; se dejan igual para asegurarlo).
    'submit_games', 'add_practice_game', 'publish_live', 'my_balls'];
  v_private constant text[] := array[
    'require_bowling_league', 'bowling_team_color', 'player_league_team', 'league_team_copy', 'entry_league_team',
    'practice_locked', 'ball_step_ok', 'ball_layout_ok',
    -- Redefinidas.
    'check_season_team', 'season_team_for_update'];
  v_service constant text[] := array['ball_step_ok', 'ball_layout_ok'];
begin
  for f in select p.oid::regprocedure as sig, n.nspname, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and p.proname = any (v_rpc))
               or (n.nspname = 'private' and p.proname = any (v_private)) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.proname = any (v_service) then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;
