-- MatchMate · Fase 5 · Fútbol de campo (football) y fútbol sala (futsal).
--
-- Va encima de la base de partidos (20260927000100_partidos.sql, docs/partidos.md) y de lo común de los deportes
-- de equipo (20260927000800_baloncesto.sql: convocatoria match_rsvps y anotador de mesa match_officials, que el
-- fútbol reutiliza tal cual). Sin tocarlas; aquí solo lo propio del fútbol:
--
-- - Marcador: goles de 0 a 99 por lado. Los penales van aparte (score.pens = [a, b], de 0 a 99): no cuentan en los
--   goles ni en la tabla.
-- - Reglas del partido: si traen variante (rules.match.variant), tiene que ser la de la liga. Una liga de campo no
--   guarda partidos de sala (y al revés): las estadísticas de las dos modalidades nunca se mezclan.
-- - football_sanctions: partidos de suspensión que pone el admin (o el comité) a un jugador de un equipo, a partir
--   de un partido de ese equipo. Las suspensiones automáticas (rojas, amarillas acumuladas) no se guardan: las
--   calcula el teléfono con las actas de la temporada (src/sports/team/discipline.ts). La app avisa, no bloquea.
--
-- Nadie escribe directo: todo por RPC. Tiempo real por private.emit a league:<liga>:
--   'football_sanctions' {op, ids}   sanciones del comité

-- =====================================================================
-- Tablas
-- =====================================================================

create table public.football_sanctions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  -- Equipo de temporada del jugador (la suspensión se cumple en los partidos de ese equipo).
  team_id uuid not null,
  player_id uuid not null,
  -- Partido desde el que cuenta (el de la expulsión o el último jugado): se cumple en los siguientes del equipo.
  match_id uuid not null,
  -- Partidos de suspensión.
  matches smallint not null check (matches between 1 and 50),
  note text not null default '' check (char_length(note) <= 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, league_id) references public.teams (id, league_id) on delete cascade,
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade,
  foreign key (match_id, league_id) references public.matches (id, league_id) on delete cascade
);
create index football_sanctions_match_idx on public.football_sanctions (match_id);
create index football_sanctions_team_idx on public.football_sanctions (team_id);
create index football_sanctions_player_idx on public.football_sanctions (player_id);
create index football_sanctions_sync_idx on public.football_sanctions (league_id, updated_at);

-- =====================================================================
-- Funciones de ayuda
-- =====================================================================

-- La liga es de fútbol (campo o sala): devuelve su deporte ('football' | 'futsal') o null.
create function private.fb_sport(p_league uuid) returns text
language sql stable security definer set search_path = '' as $$
  select l.sport from public.leagues l where l.id = p_league and l.sport in ('football', 'futsal')
$$;

-- Un número de goles válido: entero de 0 a 99.
create function private.fb_goals_ok(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'number'
              then (p #>> '{}')::numeric between 0 and 99 and (p #>> '{}')::numeric = trunc((p #>> '{}')::numeric)
              else false end
$$;

-- =====================================================================
-- Triggers
-- =====================================================================

-- Fútbol: goles de 0 a 99 por lado, penales aparte ([a, b] de 0 a 99) y reglas de la misma modalidad que la liga.
create function private.fb_check_match() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sport text := private.fb_sport(new.league_id);
begin
  if v_sport is null then
    return new;
  end if;
  if new.score is not null and jsonb_typeof(new.score) = 'object' then
    if new.score ? 'sides' and jsonb_typeof(new.score -> 'sides') = 'array'
       and exists (select 1 from jsonb_array_elements(new.score -> 'sides') x where not private.fb_goals_ok(x)) then
      raise exception 'invalido' using errcode = 'P0001', detail = 'En fútbol cada equipo marca de 0 a 99 goles.';
    end if;
    if new.score ? 'pens' and jsonb_typeof(new.score -> 'pens') <> 'null' and not (
         jsonb_typeof(new.score -> 'pens') = 'array' and jsonb_array_length(new.score -> 'pens') = 2
         and not exists (select 1 from jsonb_array_elements(new.score -> 'pens') x where not private.fb_goals_ok(x))) then
      raise exception 'invalido' using errcode = 'P0001', detail = 'Los penales son dos números de 0 a 99.';
    end if;
  end if;
  if (tg_op = 'INSERT' or new.rules is distinct from old.rules)
     and jsonb_typeof(new.rules -> 'match') = 'object'
     and (new.rules -> 'match') ? 'variant'
     and (new.rules -> 'match' ->> 'variant') is distinct from v_sport then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Las reglas del partido son de la otra modalidad (campo o sala).';
  end if;
  return new;
end $$;

create trigger matches_fb_check before insert or update of score, rules on public.matches
  for each row execute function private.fb_check_match();

create trigger football_sanctions_touch before update on public.football_sanctions for each row execute function private.touch_updated_at();
create trigger football_sanctions_tombstone after delete on public.football_sanctions for each row execute function private.tombstone('id');

-- Sanción: liga de fútbol, equipo de temporada que juega ese partido, y el jugador es de ese equipo (plantilla) o
-- jugó ese partido por ese lado. La liga del renglón es siempre la del partido (FK compuestas).
create function private.fb_check_sanction() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.fb_sport(new.league_id) is null then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Solo las ligas de fútbol o fútbol sala.';
  end if;
  if exists (select 1 from public.teams t where t.id = new.team_id and t.event_id is not null) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'El equipo tiene que ser de temporada.';
  end if;
  if not exists (select 1 from public.match_sides ms where ms.match_id = new.match_id and ms.team_id = new.team_id) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Ese equipo no juega ese partido.';
  end if;
  if not exists (select 1 from public.team_players tp where tp.team_id = new.team_id and tp.player_id = new.player_id)
     and not exists (select 1 from public.match_players mp join public.match_sides ms on ms.match_id = mp.match_id and ms.side = mp.side
                      where mp.match_id = new.match_id and mp.player_id = new.player_id and ms.team_id = new.team_id) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'El jugador no es de ese equipo.';
  end if;
  return new;
end $$;

create trigger football_sanctions_check before insert or update on public.football_sanctions
  for each row execute function private.fb_check_sanction();

-- =====================================================================
-- RLS: lo ve quien ve la liga (solo lectura; se escribe por RPC)
-- =====================================================================

alter table public.football_sanctions enable row level security;

create policy football_sanctions_read on public.football_sanctions for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));

grant select on public.football_sanctions to anon, authenticated;

-- =====================================================================
-- RPC
-- =====================================================================

-- Admin: pone (o cambia, con el mismo p_id) una sanción del comité. p_matches de 1 a 50; nota ≤ 200.
-- 'no_existe' (partido, o p_id de otra liga), 'invalido' (liga que no es de fútbol, equipo que no juega ese
-- partido, jugador que no es del equipo, partidos fuera de rango). Devuelve el id.
create function public.save_football_sanction(
  p_match uuid,
  p_team uuid,
  p_player uuid,
  p_matches integer,
  p_note text default null,
  p_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_league uuid;
  v_old public.football_sanctions;
  v_note text := left(btrim(coalesce(p_note, '')), 200);
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  select m.league_id into v_league from public.matches m where m.id = p_match;
  if not found then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  if private.fb_sport(v_league) is null then
    perform private.fail('invalido');
  end if;
  if p_matches is null or p_matches < 1 or p_matches > 50 or p_team is null or p_player is null then
    perform private.fail('invalido');
  end if;
  select * into v_old from public.football_sanctions s where s.id = v_id for update;
  if found then
    if v_old.league_id <> v_league then
      perform private.fail('no_existe');
    end if;
    update public.football_sanctions s
       set team_id = p_team, player_id = p_player, match_id = p_match, matches = p_matches, note = v_note
     where s.id = v_id
       and (s.team_id, s.player_id, s.match_id, s.matches, s.note) is distinct from (p_team, p_player, p_match, p_matches::smallint, v_note);
  else
    insert into public.football_sanctions (id, league_id, team_id, player_id, match_id, matches, note, created_by)
    values (v_id, v_league, p_team, p_player, p_match, p_matches, v_note, v_uid);
  end if;
  return v_id;
end $$;

-- Admin: quita una sanción del comité. false si ya no existía (o no es de una liga donde es admin: no dice nada).
create function public.delete_football_sanction(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
begin
  perform private.require_uid();
  select s.league_id into v_league from public.football_sanctions s where s.id = p_id;
  if not found then
    return false;
  end if;
  perform private.require_admin(v_league);
  delete from public.football_sanctions s where s.id = p_id;
  return true;
end $$;

-- =====================================================================
-- Tiempo real
-- =====================================================================

-- Sanciones del comité: {op, ids} a la liga (una vez por sentencia). Al borrar la liga no avisa.
create function private.fb_emit_sanctions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then
    for r in select o.league_id, jsonb_agg(o.id) as ids from old_rows o group by o.league_id loop
      if not private.deleting(r.league_id) then
        perform private.emit('league:' || r.league_id::text, 'football_sanctions', jsonb_build_object('op', 'delete', 'ids', r.ids));
      end if;
    end loop;
  else
    for r in select n.league_id, jsonb_agg(n.id) as ids from new_rows n group by n.league_id loop
      perform private.emit('league:' || r.league_id::text, 'football_sanctions', jsonb_build_object('op', lower(tg_op), 'ids', r.ids));
    end loop;
  end if;
  return null;
end $$;

create trigger football_sanctions_emit_insert after insert on public.football_sanctions referencing new table as new_rows
  for each statement execute function private.fb_emit_sanctions();
create trigger football_sanctions_emit_update after update on public.football_sanctions referencing new table as new_rows
  for each statement execute function private.fb_emit_sanctions();
create trigger football_sanctions_emit_delete after delete on public.football_sanctions referencing old table as old_rows
  for each statement execute function private.fb_emit_sanctions();

-- =====================================================================
-- Permisos: cerrado todo lo de esta migración; las RPC, solo con sesión
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array['save_football_sanction', 'delete_football_sanction'];
  v_private constant text[] := array['fb_sport', 'fb_goals_ok', 'fb_check_match', 'fb_check_sanction', 'fb_emit_sanctions'];
begin
  for f in select p.oid::regprocedure as sig, n.nspname, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and p.proname = any (v_rpc))
               or (n.nspname = 'private' and p.proname = any (v_private)) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
