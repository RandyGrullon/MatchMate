-- MatchMate · 6/6 · Tiempo real: los triggers avisan por private.emit (Broadcast en Supabase, NOTIFY 'mm' en PGlite).
--
-- Temas:
-- - event:<id>   'live' (estado completo de un jugador), 'entries', 'submissions', 'rsvps'
-- - league:<id>  'events', 'submissions'
-- - user:<id>    'submission' (su envío fue aprobado o rechazado)
-- Salvo 'live', el mensaje solo dice qué filas cambiaron ({op, ids}): el teléfono vuelve a leer lo suyo.
-- Un mensaje por sentencia (no por fila) para cuidar el cupo de Realtime. Al borrar una liga no se avisa nada.

create function private.deleting(p_league uuid) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(p_league::text = current_setting('mm.deleting_league', true), false)
$$;

-- ---------- En vivo: el estado completo (quien mira no tiene que volver a leer) ----------
create function private.emit_live() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if not private.deleting(old.league_id) then
      perform private.emit('event:' || old.event_id::text, 'live',
        jsonb_build_object('k', old.subject_key, 'player_id', old.player_id, 'deleted', true));
    end if;
    return null;
  end if;
  perform private.emit('event:' || new.event_id::text, 'live',
    jsonb_build_object('k', new.subject_key, 'player_id', new.player_id, 's', new.state, 'v', new.version, 'at', new.updated_at));
  return null;
end $$;

create trigger live_states_emit after insert or update or delete on public.live_states
  for each row execute function private.emit_live();

-- ---------- Participaciones: event:<id> 'entries' ----------
create function private.emit_entries() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then
    for r in select o.event_id, o.league_id, jsonb_agg(o.id) as ids from old_rows o group by o.event_id, o.league_id loop
      if not private.deleting(r.league_id) then
        perform private.emit('event:' || r.event_id::text, 'entries', jsonb_build_object('op', 'delete', 'ids', r.ids));
      end if;
    end loop;
  else
    for r in select n.event_id, jsonb_agg(n.id) as ids from new_rows n group by n.event_id loop
      perform private.emit('event:' || r.event_id::text, 'entries', jsonb_build_object('op', lower(tg_op), 'ids', r.ids));
    end loop;
  end if;
  return null;
end $$;

create trigger entries_emit_insert after insert on public.entries referencing new table as new_rows
  for each statement execute function private.emit_entries();
create trigger entries_emit_update after update on public.entries referencing new table as new_rows
  for each statement execute function private.emit_entries();
create trigger entries_emit_delete after delete on public.entries referencing old table as old_rows
  for each statement execute function private.emit_entries();

-- ---------- Envíos: league:<id> y event:<id> 'submissions'; user:<quien envió> 'submission' al revisarlo ----------
create function private.emit_submissions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then
    for r in select o.league_id, o.event_id, jsonb_agg(o.id) as ids from old_rows o group by o.league_id, o.event_id loop
      if not private.deleting(r.league_id) then
        perform private.emit('league:' || r.league_id::text, 'submissions', jsonb_build_object('op', 'delete', 'ids', r.ids));
        if r.event_id is not null then
          perform private.emit('event:' || r.event_id::text, 'submissions', jsonb_build_object('op', 'delete', 'ids', r.ids));
        end if;
      end if;
    end loop;
    return null;
  end if;
  for r in select n.league_id, n.event_id, jsonb_agg(n.id) as ids from new_rows n group by n.league_id, n.event_id loop
    perform private.emit('league:' || r.league_id::text, 'submissions', jsonb_build_object('op', lower(tg_op), 'ids', r.ids));
    if r.event_id is not null then
      perform private.emit('event:' || r.event_id::text, 'submissions', jsonb_build_object('op', lower(tg_op), 'ids', r.ids));
    end if;
  end loop;
  if tg_op = 'UPDATE' then
    for r in select n.created_by, n.id, n.status from new_rows n join old_rows o on o.id = n.id
              where n.status is distinct from o.status and n.created_by is not null loop
      perform private.emit('user:' || r.created_by::text, 'submission', jsonb_build_object('id', r.id, 'status', r.status));
    end loop;
  end if;
  return null;
end $$;

create trigger submissions_emit_insert after insert on public.submissions referencing new table as new_rows
  for each statement execute function private.emit_submissions();
create trigger submissions_emit_update after update on public.submissions referencing old table as old_rows new table as new_rows
  for each statement execute function private.emit_submissions();
create trigger submissions_emit_delete after delete on public.submissions referencing old table as old_rows
  for each statement execute function private.emit_submissions();

-- ---------- Eventos: league:<id> 'events' (no avisa si solo cambió el número de inscritos) ----------
create function private.emit_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then
    for r in select o.league_id, jsonb_agg(o.id) as ids from old_rows o group by o.league_id loop
      if not private.deleting(r.league_id) then
        perform private.emit('league:' || r.league_id::text, 'events', jsonb_build_object('op', 'delete', 'ids', r.ids));
      end if;
    end loop;
  elsif tg_op = 'INSERT' then
    for r in select n.league_id, jsonb_agg(n.id) as ids from new_rows n group by n.league_id loop
      perform private.emit('league:' || r.league_id::text, 'events', jsonb_build_object('op', 'insert', 'ids', r.ids));
    end loop;
  else
    for r in select n.league_id, jsonb_agg(n.id) as ids from new_rows n join old_rows o on o.id = n.id
              where to_jsonb(n) - array['player_count', 'updated_at'] is distinct from to_jsonb(o) - array['player_count', 'updated_at']
              group by n.league_id loop
      perform private.emit('league:' || r.league_id::text, 'events', jsonb_build_object('op', 'update', 'ids', r.ids));
    end loop;
  end if;
  return null;
end $$;

create trigger events_emit_insert after insert on public.events referencing new table as new_rows
  for each statement execute function private.emit_events();
create trigger events_emit_update after update on public.events referencing old table as old_rows new table as new_rows
  for each statement execute function private.emit_events();
create trigger events_emit_delete after delete on public.events referencing old table as old_rows
  for each statement execute function private.emit_events();

-- ---------- «Voy»: event:<id> 'rsvps' ----------
create function private.emit_rsvps() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then
    for r in select o.event_id, o.league_id, jsonb_agg(o.player_id) as ids from old_rows o group by o.event_id, o.league_id loop
      if not private.deleting(r.league_id) then
        perform private.emit('event:' || r.event_id::text, 'rsvps', jsonb_build_object('op', 'delete', 'player_ids', r.ids));
      end if;
    end loop;
  else
    for r in select n.event_id, jsonb_agg(n.player_id) as ids from new_rows n group by n.event_id loop
      perform private.emit('event:' || r.event_id::text, 'rsvps', jsonb_build_object('op', lower(tg_op), 'player_ids', r.ids));
    end loop;
  end if;
  return null;
end $$;

create trigger event_rsvps_emit_insert after insert on public.event_rsvps referencing new table as new_rows
  for each statement execute function private.emit_rsvps();
create trigger event_rsvps_emit_update after update on public.event_rsvps referencing new table as new_rows
  for each statement execute function private.emit_rsvps();
create trigger event_rsvps_emit_delete after delete on public.event_rsvps referencing old table as old_rows
  for each statement execute function private.emit_rsvps();

-- Estas funciones nuevas también quedan cerradas (la lista de permisos está en 20260926000500_rpc.sql).
revoke execute on function private.deleting(uuid), private.emit_live(), private.emit_entries(), private.emit_submissions(),
  private.emit_events(), private.emit_rsvps() from public, anon, authenticated;
