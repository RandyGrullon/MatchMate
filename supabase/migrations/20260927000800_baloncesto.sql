-- MatchMate · Fase 4 · Baloncesto (y lo común de los deportes de equipo: convocatoria y anotador de mesa).
--
-- Va encima de la base de partidos (20260927000100_partidos.sql, docs/partidos.md) sin tocarla:
--
-- - match_rsvps: convocatoria por partido (Voy / No voy / Tal vez) de los jugadores de la plantilla de cada lado.
--   La marca el propio jugador, el capitán o delegado de su equipo, o el admin. Vale para toda liga de
--   equipos (baloncesto, fútbol, sala): el fútbol la reutiliza, no crea otra.
-- - match_officials: anotador de mesa designado para un partido (lo pone el admin; tiene que poder anotar ese
--   partido: admin, anotador de la liga o capitán/delegado de uno de los dos equipos). Si quien termina el
--   partido es el designado, el resultado queda confirmado sin esperar al rival (trigger sobre matches).
-- - Refuerzos (solo baloncesto): jugadores de la liga que no son de la plantilla del equipo del lado. Como mucho
--   matches.rules.teams.reinforcements por lado (por defecto 2).
-- - Marcador de baloncesto: cada lado de 0 a 300 y sin empates en un resultado.
-- - server_now(): hora del servidor, para que el reloj de referencia de la mesa y de los espectadores no
--   dependa del reloj de cada teléfono.
--
-- Nadie escribe directo: todo por RPC. Tiempo real por private.emit a league:<liga> (y event:<evento> si el
-- partido es de un evento):
--   'match_rsvps'     {op, ids: partidos}   convocatoria
--   'match_officials' {op, ids: partidos}   anotador designado

-- =====================================================================
-- Tablas
-- =====================================================================

-- Convocatoria por partido. El lado sale de la plantilla (team_players) del equipo de ese lado.
create table public.match_rsvps (
  match_id uuid not null,
  player_id uuid not null,
  league_id uuid not null,
  side smallint not null check (side in (1, 2)),
  -- yes = Voy, no = No voy, maybe = Tal vez.
  status text not null check (status in ('yes', 'no', 'maybe')),
  set_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id),
  foreign key (match_id, league_id) references public.matches (id, league_id) on delete cascade,
  foreign key (match_id, side) references public.match_sides (match_id, side) on delete cascade,
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade
);
create index match_rsvps_player_idx on public.match_rsvps (player_id);
create index match_rsvps_sync_idx on public.match_rsvps (league_id, updated_at);

-- Anotador de mesa designado (uno por partido).
create table public.match_officials (
  match_id uuid primary key,
  league_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Nombre copiado de la liga (display_name) para mostrarlo también a quien no es miembro.
  name text not null default '' check (char_length(name) <= 60),
  set_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (match_id, league_id) references public.matches (id, league_id) on delete cascade
);
create index match_officials_user_idx on public.match_officials (user_id);
create index match_officials_sync_idx on public.match_officials (league_id, updated_at);

-- =====================================================================
-- Funciones de ayuda
-- =====================================================================

-- Refuerzos permitidos por lado (rules.teams.reinforcements, 0–30; por defecto 2).
create function private.bb_reinforcement_limit(p_rules jsonb) returns integer
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_rules -> 'teams' -> 'reinforcements') = 'number'
              then greatest(0, least(30, floor((p_rules -> 'teams' ->> 'reinforcements')::numeric)::integer))
              else 2 end
$$;

-- =====================================================================
-- Triggers
-- =====================================================================

create trigger match_rsvps_touch before update on public.match_rsvps for each row execute function private.touch_updated_at();
create trigger match_officials_touch before update on public.match_officials for each row execute function private.touch_updated_at();
create trigger match_rsvps_tombstone after delete on public.match_rsvps for each row execute function private.tombstone('match_id', 'player_id');
create trigger match_officials_tombstone after delete on public.match_officials for each row execute function private.tombstone('match_id');

-- Convocatoria y anotador designado solo en ligas de equipos.
create function private.team_check_family() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(private.league_family(new.league_id), '') <> 'team' then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Solo las ligas de deportes de equipo.';
  end if;
  return new;
end $$;

create trigger match_rsvps_check before insert or update of league_id on public.match_rsvps
  for each row execute function private.team_check_family();
create trigger match_officials_check before insert or update of league_id on public.match_officials
  for each row execute function private.team_check_family();

-- Si el anotador designado termina (o corrige su propuesta), el resultado queda confirmado: no espera al rival.
-- finish_match ya puso proposed_by = quien terminó; aquí solo se completa la confirmación.
create function private.team_designated_final() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.proposed_by is not null
     and (old.status is distinct from 'finished' or new.proposed_at is distinct from old.proposed_at)
     and exists (select 1 from public.match_officials o where o.match_id = new.id and o.user_id = new.proposed_by) then
    new.status := 'confirmed';
    new.confirmed_by := new.proposed_by;
    new.confirmed_at := now();
    new.proposed_side := null;
    new.history := private.match_history(new.history, 'confirm', 'Anotador de mesa designado');
  end if;
  return new;
end $$;

create trigger matches_designated_final before update of status on public.matches for each row
  when (new.status = 'finished')
  execute function private.team_designated_final();

-- Si cambia el equipo de un lado, la convocatoria de ese lado ya no sirve.
create function private.team_clear_side_rsvps() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.match_rsvps r
   using new_rows n join old_rows o on o.match_id = n.match_id and o.side = n.side
   where r.match_id = n.match_id and r.side = n.side and n.team_id is distinct from o.team_id;
  return null;
end $$;

create trigger match_sides_clear_rsvps after update on public.match_sides
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.team_clear_side_rsvps();

-- Baloncesto: refuerzos (jugadores fuera de la plantilla del equipo del lado) hasta el límite del partido.
create function private.bb_check_reinforcements() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    select mp.match_id, mp.side, count(*) as n, max(private.bb_reinforcement_limit(m.rules)) as max_n
      from (select distinct x.match_id, x.side from new_rows x) t
      join public.matches m on m.id = t.match_id
      join public.leagues l on l.id = m.league_id and l.sport = 'basketball'
      join public.match_sides ms on ms.match_id = t.match_id and ms.side = t.side and ms.team_id is not null
      join public.match_players mp on mp.match_id = t.match_id and mp.side = t.side
     where not exists (select 1 from public.team_players tp where tp.team_id = ms.team_id and tp.player_id = mp.player_id)
     group by mp.match_id, mp.side
  loop
    if r.n > r.max_n then
      raise exception 'invalido' using errcode = 'P0001', detail = format('Como mucho %s refuerzos por equipo en un partido.', r.max_n);
    end if;
  end loop;
  return null;
end $$;

create trigger match_players_bb_insert after insert on public.match_players referencing new table as new_rows
  for each statement execute function private.bb_check_reinforcements();
create trigger match_players_bb_update after update on public.match_players referencing new table as new_rows
  for each statement execute function private.bb_check_reinforcements();

-- Baloncesto: cada lado de 0 a 300. (Los empates los evita el motor y el lector de «solo resultado»; la base
-- de partidos los admite en equipos y no se cambia aquí.)
create function private.bb_check_score() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.score is null or jsonb_typeof(new.score -> 'sides') is distinct from 'array' then
    return new;
  end if;
  if (select l.sport from public.leagues l where l.id = new.league_id) is distinct from 'basketball' then
    return new;
  end if;
  if exists (select 1 from jsonb_array_elements(new.score -> 'sides') x
              where jsonb_typeof(x) <> 'number' or (x #>> '{}')::numeric > 300) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'En baloncesto cada equipo anota de 0 a 300.';
  end if;
  return new;
end $$;

create trigger matches_bb_score before insert or update of score on public.matches
  for each row execute function private.bb_check_score();

-- =====================================================================
-- RLS: lo ve quien ve la liga (solo lectura; se escribe por RPC)
-- =====================================================================

alter table public.match_rsvps enable row level security;
alter table public.match_officials enable row level security;

create policy match_rsvps_read on public.match_rsvps for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy match_officials_read on public.match_officials for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));

grant select on public.match_rsvps, public.match_officials to anon, authenticated;

-- =====================================================================
-- RPC
-- =====================================================================

-- Convocatoria: Voy (yes), No voy (no), Tal vez (maybe); null la quita. p_player null = mi jugador.
-- Quién: el propio jugador; el capitán o delegado de su equipo; el admin. El jugador tiene que estar en la
-- plantilla de uno (y solo uno) de los dos equipos del partido. Partido cerrado: 'cerrado'. Va por la cola.
create function public.set_match_rsvp(p_match uuid, p_status text default null, p_player uuid default null, p_op_id uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  m public.matches;
  v_player uuid;
  v_side smallint;
  v_team uuid;
  v_hits integer;
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
begin
  if private.op_begin(p_op_id, 'set_match_rsvp') is not null then
    return;
  end if;
  select * into m from public.matches x where x.id = p_match;
  if not found then
    perform private.fail('no_existe');
  end if;
  if private.league_family(m.league_id) is distinct from 'team' then
    perform private.fail('invalido');
  end if;
  v_player := coalesce(p_player, private.my_player(m.league_id));
  if v_player is null then
    perform private.fail('invalido');
  end if;
  select count(*), min(ms.side), (array_agg(ms.team_id))[1] into v_hits, v_side, v_team
    from public.match_sides ms join public.team_players tp on tp.team_id = ms.team_id and tp.player_id = v_player
   where ms.match_id = p_match;
  if not (private.is_admin(m.league_id)
          or v_player is not distinct from private.my_player(m.league_id)
          or (v_team is not null and coalesce(private.team_role(v_team) in ('captain', 'delegate'), false))) then
    perform private.deny();
  end if;
  if v_hits <> 1 then
    perform private.fail('invalido');
  end if;
  if v_status is not null and v_status not in ('yes', 'no', 'maybe') then
    perform private.fail('invalido');
  end if;
  if m.status not in ('scheduled', 'postponed', 'live', 'suspended') then
    perform private.fail('cerrado');
  end if;
  if v_status is null then
    delete from public.match_rsvps r where r.match_id = p_match and r.player_id = v_player;
  else
    insert into public.match_rsvps as r (match_id, player_id, league_id, side, status, set_by)
    values (p_match, v_player, m.league_id, v_side, v_status, v_uid)
    on conflict (match_id, player_id) do update
      set status = excluded.status, side = excluded.side, set_by = excluded.set_by
      where (r.status, r.side) is distinct from (excluded.status, excluded.side);
  end if;
  perform private.op_end(p_op_id, null);
end $$;

-- Admin: anotador de mesa designado del partido (p_user null lo quita). Tiene que ser miembro y poder anotar
-- ese partido (admin, anotador de la liga, o capitán/delegado de uno de los equipos): si no, 'invalido'.
create function public.set_match_official(p_match uuid, p_user uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  m public.matches;
  v_name text;
begin
  select * into m from public.matches x where x.id = p_match;
  if not found then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(m.league_id);
  if private.league_family(m.league_id) is distinct from 'team' then
    perform private.fail('invalido');
  end if;
  if p_user is null then
    delete from public.match_officials o where o.match_id = p_match;
    return;
  end if;
  if m.status not in ('scheduled', 'postponed', 'live', 'suspended') then
    perform private.fail('cerrado');
  end if;
  select lm.display_name into v_name from public.league_members lm where lm.league_id = m.league_id and lm.user_id = p_user;
  if not found then
    perform private.fail('no_existe');
  end if;
  if not private.can_score_as(p_match, m.league_id, p_user) then
    perform private.fail('invalido');
  end if;
  insert into public.match_officials as o (match_id, league_id, user_id, name, set_by)
  values (p_match, m.league_id, p_user, left(coalesce(v_name, ''), 60), v_uid)
  on conflict (match_id) do update
    set user_id = excluded.user_id, name = excluded.name, set_by = excluded.set_by
    where (o.user_id, o.name) is distinct from (excluded.user_id, excluded.name);
end $$;

-- Hora del servidor (ms exactos del momento, no la del inicio de la transacción). Para el reloj de referencia:
-- el teléfono calcula su diferencia con el servidor una vez y la usa al publicar y al mostrar.
create function public.server_now() returns timestamptz
language sql volatile set search_path = '' as $$
  select clock_timestamp()
$$;

-- =====================================================================
-- Tiempo real
-- =====================================================================

-- Convocatoria y anotador designado: {op, ids: partidos} a la liga y al evento (una vez por sentencia).
-- Si el partido se está borrando, ya avisó su propio trigger.
create function private.team_emit_children() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_ids uuid[];
  v_event text := tg_argv[0];
begin
  if tg_op = 'DELETE' then
    select array_agg(distinct o.match_id) into v_ids from old_rows o;
  else
    select array_agg(distinct n.match_id) into v_ids from new_rows n;
  end if;
  for r in select m.league_id, jsonb_agg(m.id) as ids from public.matches m where m.id = any (v_ids) group by m.league_id loop
    if not private.deleting(r.league_id) then
      perform private.emit('league:' || r.league_id::text, v_event, jsonb_build_object('op', lower(tg_op), 'ids', r.ids));
    end if;
  end loop;
  for r in select m.league_id, m.event_id, jsonb_agg(m.id) as ids from public.matches m
            where m.id = any (v_ids) and m.event_id is not null group by m.league_id, m.event_id loop
    if not private.deleting(r.league_id) then
      perform private.emit('event:' || r.event_id::text, v_event, jsonb_build_object('op', lower(tg_op), 'ids', r.ids));
    end if;
  end loop;
  return null;
end $$;

create trigger match_rsvps_emit_insert after insert on public.match_rsvps referencing new table as new_rows
  for each statement execute function private.team_emit_children('match_rsvps');
create trigger match_rsvps_emit_update after update on public.match_rsvps referencing new table as new_rows
  for each statement execute function private.team_emit_children('match_rsvps');
create trigger match_rsvps_emit_delete after delete on public.match_rsvps referencing old table as old_rows
  for each statement execute function private.team_emit_children('match_rsvps');
create trigger match_officials_emit_insert after insert on public.match_officials referencing new table as new_rows
  for each statement execute function private.team_emit_children('match_officials');
create trigger match_officials_emit_update after update on public.match_officials referencing new table as new_rows
  for each statement execute function private.team_emit_children('match_officials');
create trigger match_officials_emit_delete after delete on public.match_officials referencing old table as old_rows
  for each statement execute function private.team_emit_children('match_officials');

-- =====================================================================
-- Permisos: cerrado todo lo de esta migración; las RPC, solo con sesión (server_now también sin cuenta)
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array['set_match_rsvp', 'set_match_official', 'server_now'];
  v_private constant text[] := array[
    'bb_reinforcement_limit', 'team_check_family', 'team_designated_final', 'team_clear_side_rsvps',
    'bb_check_reinforcements', 'bb_check_score', 'team_emit_children'
  ];
begin
  for f in select p.oid::regprocedure as sig, n.nspname, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and p.proname = any (v_rpc))
               or (n.nspname = 'private' and p.proname = any (v_private)) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' then
      execute format('grant execute on function %s to authenticated', f.sig);
      if f.proname = 'server_now' then
        execute format('grant execute on function %s to anon', f.sig);
      end if;
    end if;
  end loop;
end $$;
