-- MatchMate · 3/6 · Triggers: updated_at, borrados, invariantes que valen para todos (también service_role).
-- Los permisos de cada persona NO van aquí: van en las RPC (20260926000500_rpc.sql).

-- ---------- updated_at ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'sport_status', 'profiles', 'leagues', 'league_secrets', 'league_members', 'players', 'player_private', 'events',
    'teams', 'event_rsvps', 'photos', 'entries', 'submissions', 'live_states', 'reactions', 'comments', 'suggestions',
    'push_subscriptions'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ---------- Borrados (tombstones) ----------
-- tg_argv: columnas de la clave (se unen con ':'). Al borrar una liga (delete_league pone mm.deleting_league)
-- solo queda la fila de la liga: el teléfono purga todo lo de esa liga.
create function private.tombstone() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := to_jsonb(old);
  v_league uuid := coalesce((v_row ->> 'league_id')::uuid, (v_row ->> 'id')::uuid);
  v_key text;
begin
  if tg_table_name <> 'leagues' and v_league::text = current_setting('mm.deleting_league', true) then
    return null;
  end if;
  select string_agg(v_row ->> k, ':' order by n) into v_key from unnest(tg_argv) with ordinality as a (k, n);
  insert into public.tombstones (tbl, row_key, league_id) values (tg_table_name, v_key, v_league);
  return null;
end $$;

create trigger leagues_tombstone after delete on public.leagues for each row execute function private.tombstone('id');
create trigger league_members_tombstone after delete on public.league_members for each row execute function private.tombstone('league_id', 'user_id');
create trigger players_tombstone after delete on public.players for each row execute function private.tombstone('id');
create trigger events_tombstone after delete on public.events for each row execute function private.tombstone('id');
create trigger teams_tombstone after delete on public.teams for each row execute function private.tombstone('id');
create trigger event_rsvps_tombstone after delete on public.event_rsvps for each row execute function private.tombstone('event_id', 'player_id');
create trigger photos_tombstone after delete on public.photos for each row execute function private.tombstone('id');
create trigger entries_tombstone after delete on public.entries for each row execute function private.tombstone('id');
create trigger submissions_tombstone after delete on public.submissions for each row execute function private.tombstone('id');
create trigger live_states_tombstone after delete on public.live_states for each row execute function private.tombstone('event_id', 'subject_key');
create trigger reactions_tombstone after delete on public.reactions for each row execute function private.tombstone('id');
create trigger comments_tombstone after delete on public.comments for each row execute function private.tombstone('id');
create trigger suggestions_tombstone after delete on public.suggestions for each row execute function private.tombstone('id');

-- ---------- Perfil: creado por trigger en auth.users ----------
-- Nombre del perfil sacado de la metadata de Auth: name (correo) o full_name (Google); si viene vacío,
-- la parte del correo antes de la @; recortado a 60; si todo falla, 'Jugador'. Nunca devuelve algo inválido.
create function private.profile_name(p_meta jsonb, p_email text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text := btrim(left(btrim(coalesce(
    nullif(btrim(p_meta ->> 'name'), ''),
    nullif(btrim(p_meta ->> 'full_name'), ''),
    nullif(btrim(split_part(coalesce(p_email, ''), '@', 1)), ''),
    'Jugador')), 60));
begin
  return case when v = '' then 'Jugador' else v end;
end $$;

-- Nunca hace fallar el registro («Database error saving new user»): si aun así falla, avisa y
-- ensure_profile() lo crea después.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  -- El superadmin nunca sale de la metadata (la escribe quien se registra): solo por SQL.
  insert into public.profiles (id, email, name, adult_confirmed_at)
  values (new.id, new.email, private.profile_name(v_meta, new.email), case when v_meta ->> 'adult' = 'true' then now() end)
  on conflict (id) do nothing;
  return new;
exception when others then
  raise warning 'perfil de %: %', new.id, sqlerrm;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create function private.sync_user_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
exception when others then
  raise warning 'correo de %: %', new.id, sqlerrm;
  return new;
end $$;

create trigger on_auth_user_email after update of email on auth.users for each row execute function private.sync_user_email();

-- Defensa extra (no hay UPDATE directo sobre profiles): con sesión de usuario, nadie se pone superadmin ni
-- cambia su correo aquí; sin sesión (SQL, service_role, GoTrue) sí.
create function private.guard_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    if new.is_superadmin is distinct from old.is_superadmin
       and not coalesce((select p.is_superadmin from public.profiles p where p.id = auth.uid()), false) then
      raise exception 'no_permitido' using errcode = '42501';
    end if;
    if new.email is distinct from old.email or new.firebase_uid is distinct from old.firebase_uid then
      raise exception 'no_permitido' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles for each row execute function private.guard_profile();

-- ---------- Ligas ----------
-- El deporte es fijo. El dueño solo cambia por transfer_ownership. has_minors no se apaga con menores adentro.
create function private.guard_league() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.sport is distinct from old.sport then
    raise exception 'invalido' using errcode = 'P0001', detail = 'El deporte de una liga no cambia.';
  end if;
  if new.owner_id is distinct from old.owner_id and coalesce(current_setting('mm.transfer', true), '') <> old.id::text then
    raise exception 'no_permitido' using errcode = '42501', detail = 'El dueño solo cambia con transfer_ownership.';
  end if;
  if old.has_minors and not new.has_minors and exists (select 1 from public.players p where p.league_id = new.id and p.is_minor) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'La liga todavía tiene menores.';
  end if;
  return new;
end $$;

create trigger leagues_guard before update on public.leagues for each row execute function private.guard_league();

-- ---------- Menores ----------
-- Un jugador menor solo existe en una liga con has_minors (y, por el CHECK, sin cuenta).
create function private.check_player() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_minor and not coalesce((select l.has_minors from public.leagues l where l.id = new.league_id), false) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'La liga no admite menores.';
  end if;
  return new;
end $$;

create trigger players_check before insert or update of is_minor, league_id on public.players
  for each row execute function private.check_player();

-- ---------- Eventos: tipo según el deporte ----------
create function private.check_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sport text := (select l.sport from public.leagues l where l.id = new.league_id);
begin
  if v_sport = 'bowling' and new.type not in ('torneo', 'practica') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Tipo de evento de boliche: torneo o practica.';
  end if;
  if new.category_cuts is not null and exists (select 1 from unnest(new.category_cuts) c where c is null or c not between 0 and 300) then
    raise exception 'invalido' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger events_check before insert or update of type, league_id, category_cuts on public.events
  for each row execute function private.check_event();

-- ---------- Números según el deporte (boliche: hasta 10 juegos de 0 a 300) ----------
create function private.check_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sport text := (select l.sport from public.leagues l where l.id = new.league_id);
begin
  if not private.series_ok(new.scores, v_sport) or not private.marks_ok(new.photos) then
    raise exception 'invalido' using errcode = 'P0001';
  end if;
  -- El equipo tiene que ser de este mismo evento.
  if new.team_id is not null and not exists (select 1 from public.teams t where t.id = new.team_id and t.event_id = new.event_id) then
    raise exception 'invalido' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger entries_check before insert or update of scores, photos, team_id on public.entries
  for each row execute function private.check_entry();

create function private.check_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sport text := (select l.sport from public.leagues l where l.id = new.league_id);
begin
  if not private.series_ok(new.scores, v_sport) or not private.series_ok(new.scanned, v_sport) then
    raise exception 'invalido' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger submissions_check before insert or update of scores, scanned on public.submissions
  for each row execute function private.check_submission();

create function private.check_live() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sport text := (select l.sport from public.leagues l where l.id = new.league_id);
begin
  if v_sport = 'bowling' then
    perform private.series(new.state -> 'scores', v_sport);
  end if;
  return new;
end $$;

create trigger live_states_check before insert or update of state on public.live_states
  for each row execute function private.check_live();

-- ---------- Inscritos por evento (events.player_count) ----------
create function private.count_players() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
begin
  update public.events e set player_count = (select count(*) from public.entries x where x.event_id = v_event)
   where e.id = v_event;
  return null;
end $$;

create trigger entries_count after insert or delete on public.entries for each row execute function private.count_players();

-- ---------- Fotos borradas: el archivo va a la cola de Storage ----------
create function private.queue_photo_purge() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.storage_purge_queue (path) values (old.path) on conflict (path) do nothing;
  return null;
end $$;

create trigger photos_purge after delete on public.photos for each row execute function private.queue_photo_purge();
