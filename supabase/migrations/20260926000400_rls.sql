-- MatchMate · 4/6 · Quién ve qué (RLS) y funciones de ayuda.
--
-- Las tablas solo se LEEN directo (select). Nadie tiene INSERT, UPDATE ni DELETE sobre ninguna tabla:
-- todas las escrituras son RPC (20260926000500_rpc.sql). Así la RLS solo tiene políticas de lectura.
--
-- Funciones de ayuda: security definer, stable, search_path vacío y usadas como (select private.x()) para
-- que se evalúen una vez por consulta. Solo las que usan las políticas se pueden ejecutar desde anon o
-- authenticated (la API no expone el esquema private, así que no se llaman por REST).

-- ---------- Funciones de ayuda ----------

create function private.is_super() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_superadmin from public.profiles p where p.id = (select auth.uid())), false)
$$;

create function private.member_role(p_league uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.league_members m where m.league_id = p_league and m.user_id = (select auth.uid())
$$;

create function private.is_member(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.member_role(p_league) is not null
$$;

-- Dueño o admin de la liga (o superadmin): administra todo lo de esa liga.
create function private.is_admin(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_super() or coalesce(private.member_role(p_league) in ('owner', 'admin'), false)
$$;

-- Dueño (o superadmin): el único que da o quita permisos.
create function private.is_owner(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_super() or coalesce(private.member_role(p_league) = 'owner', false)
$$;

-- Jugador de la cuenta en la liga (null si no tiene).
create function private.my_player(p_league uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.players p where p.league_id = p_league and p.user_id = (select auth.uid())
$$;

-- Anotador: en boliche solo vale en un torneo sin liga (kind = 'torneo'); en los demás deportes, siempre.
create function private.is_scorer(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.league_members m join public.leagues l on l.id = m.league_id
     where m.league_id = p_league and m.user_id = (select auth.uid()) and m.is_scorer
       and (l.kind = 'torneo' or l.sport <> 'bowling'))
$$;

-- Sube fotos: admin, anotador o miembro con jugador, y la liga sin menores.
create function private.can_upload_photo(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.leagues l where l.id = p_league and not l.has_minors)
     and (private.is_admin(p_league) or private.is_scorer(p_league) or private.my_player(p_league) is not null)
$$;

-- Lo mismo a partir de la ruta de Storage ('<liga>/<foto>.webp'); false si la ruta no sirve.
create function private.can_upload_photo_path(p_path text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_league uuid;
begin
  begin
    v_league := split_part(p_path, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return p_path ~ ('^' || v_league::text || '/[0-9a-f-]{36}\.(webp|jpg)$') and private.can_upload_photo(v_league);
end $$;

-- Conjuntos (para `league_id in (select …)`).
create function private.my_leagues() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.league_id from public.league_members m where m.user_id = (select auth.uid())
$$;

create function private.admin_leagues() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.league_id from public.league_members m where m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')
  union
  select l.id from public.leagues l where (select private.is_super())
$$;

-- Liga pública: la ve cualquiera, sin cuenta. Privada: sus miembros (y el superadmin).
create function private.readable_leagues() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select l.id from public.leagues l where l.visibility = 'public'
  union
  select m.league_id from public.league_members m where m.user_id = (select auth.uid())
  union
  select l.id from public.leagues l where (select private.is_super())
$$;

-- Exige ser admin de la liga.
create function private.require_admin(p_league uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin(p_league) then
    raise exception 'no_permitido' using errcode = '42501';
  end if;
end $$;

-- ---------- RLS activada en TODAS las tablas de public ----------
do $$
declare
  t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

-- ---------- Políticas (solo lectura) ----------

create policy sport_status_read on public.sport_status for select to anon, authenticated using (true);

-- Perfil: solo el propio (y el superadmin todos). Un visitante sin cuenta no tiene ni el GRANT.
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_super()));

create policy leagues_read on public.leagues for select to anon, authenticated
  using (id in (select private.readable_leagues()));

create policy league_secrets_read on public.league_secrets for select to authenticated
  using (league_id in (select private.admin_leagues()));

-- Miembros: la lista la ven los miembros de la liga; cada quien sus membresías; el superadmin todo.
create policy league_members_read on public.league_members for select to authenticated
  using (user_id = (select auth.uid()) or league_id in (select private.my_leagues()) or (select private.is_super()));

create policy player_private_read on public.player_private for select to authenticated
  using (league_id in (select private.admin_leagues()));

create policy suggestions_read on public.suggestions for select to authenticated
  using (league_id in (select private.admin_leagues()));

create policy push_subscriptions_read on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- Contenido de la liga: lo ve quien ve la liga.
do $$
declare
  t text;
begin
  foreach t in array array[
    'players', 'events', 'teams', 'event_rsvps', 'photos', 'entries', 'submissions', 'live_states', 'reactions', 'comments'
  ] loop
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (league_id in (select private.readable_leagues()))',
      t || '_read', t);
  end loop;
end $$;

-- Borrados: como la tabla de donde salen. Los de miembros solo los ven los miembros y los del buzón los admins.
create policy tombstones_read on public.tombstones for select to anon, authenticated
  using (tbl not in ('league_members', 'suggestions') and league_id in (select private.readable_leagues()));
create policy tombstones_read_private on public.tombstones for select to authenticated
  using ((tbl = 'league_members' and (league_id in (select private.my_leagues()) or (select private.is_super())))
      or (tbl = 'suggestions' and league_id in (select private.admin_leagues())));

-- reminders_sent y push_outbox: solo service_role (salta la RLS). Política explícita de «nadie» para la app.
create policy reminders_sent_none on public.reminders_sent for select to authenticated using (false);
create policy push_outbox_none on public.push_outbox for select to authenticated using (false);

-- ---------- GRANT de lectura ----------
grant select on
  public.sport_status, public.leagues, public.players, public.events, public.teams, public.event_rsvps, public.photos,
  public.entries, public.submissions, public.live_states, public.reactions, public.comments, public.tombstones
  to anon, authenticated;

grant select on
  public.profiles, public.league_secrets, public.league_members, public.player_private, public.suggestions,
  public.push_subscriptions, public.memberships
  to authenticated;

-- Lo que las políticas (y las de Storage y Realtime en Supabase) llaman como el rol que consulta.
grant execute on function private.readable_leagues() to anon, authenticated;
grant execute on function private.my_leagues(), private.admin_leagues(), private.is_super(), private.can_upload_photo_path(text)
  to authenticated;
