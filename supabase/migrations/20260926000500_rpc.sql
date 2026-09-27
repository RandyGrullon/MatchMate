-- MatchMate · 5/6 · Escrituras: una RPC por cada operación de la app (src/lib/data.ts de BowlingX).
--
-- Todas: security definer, search_path vacío, atómicas (una transacción), validan permisos con los helpers
-- de private y nunca confían en el league_id del cliente (sale del evento, jugador o participación).
-- Errores: 'no_permitido' (42501) y 'invalido' | 'no_existe' | 'duplicado' | 'cerrado' | 'rate_limited' (P0001).
-- Las restricciones de las tablas también pueden responder 23514 (CHECK), 23505 (único), 23503 (FK),
-- 23502 (falta un dato) o 22xxx (dato mal escrito): todo eso es «dato inválido» para el cliente.
-- El contrato completo está en supabase/README.md.

-- =====================================================================
-- Cuentas
-- =====================================================================

-- Crea el perfil si el trigger de auth.users no pudo (idempotente).
create function public.ensure_profile() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_email text;
  v_meta jsonb;
begin
  if exists (select 1 from public.profiles p where p.id = v_uid) then
    return;
  end if;
  select a.email, coalesce(a.raw_user_meta_data, '{}'::jsonb) into v_email, v_meta from auth.users a where a.id = v_uid;
  if not found then
    perform private.fail('no_existe');
  end if;
  insert into public.profiles (id, email, name) values (v_uid, v_email, private.profile_name(v_meta, v_email))
  on conflict (id) do nothing;
end $$;

create function public.rename_profile(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  update public.profiles set name = private.clean_name(p_name) where id = v_uid;
  if not found then
    perform private.fail('no_existe');
  end if;
end $$;

-- Solo otro superadmin nombra o quita superadmins (el primero se siembra por SQL).
create function public.set_superadmin(p_user uuid, p_value boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_uid();
  if not private.is_super() then
    perform private.deny();
  end if;
  update public.profiles set is_superadmin = coalesce(p_value, false) where id = p_user;
  if not found then
    perform private.fail('no_existe');
  end if;
end $$;

-- Superadmin: abre, pone en beta o cierra un deporte.
create function public.set_sport_status(p_sport text, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_uid();
  if not private.is_super() then
    perform private.deny();
  end if;
  update public.sport_status set status = p_status where id = p_sport;
  if not found then
    perform private.fail('no_existe');
  end if;
end $$;

-- =====================================================================
-- Ligas
-- =====================================================================

-- Deporte abierto: cualquiera. En beta: solo el superadmin. Cerrado: nadie.
create function private.check_sport(p_sport text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_status text := (select s.status from public.sport_status s where s.id = p_sport);
begin
  if v_status is null then
    perform private.fail('invalido');
  elsif v_status = 'closed' then
    perform private.fail('cerrado');
  elsif v_status = 'beta' and not private.is_super() then
    perform private.deny();
  end if;
end $$;

create function private.check_tz(p_tz text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_tz) then
    perform private.fail('invalido');
  end if;
end $$;

-- Código nuevo para la liga (el anterior deja de servir).
create function private.set_invite_code(p_league uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v text;
begin
  for i in 1..10 loop
    v := private.new_invite_code();
    begin
      insert into public.league_secrets (league_id, invite_code) values (p_league, v)
      on conflict (league_id) do update set invite_code = excluded.invite_code;
      return v;
    exception when unique_violation then
      -- Otra liga ya tiene ese código: se prueba otro.
      null;
    end;
  end loop;
  perform private.fail('duplicado');
  return null;
end $$;

-- Crea la liga y deja a quien la crea como dueño, con su código de invitación y su jugador (el dueño
-- también juega), todo en la misma transacción.
create function public.create_league(
  p_name text,
  p_visibility text default 'private',
  p_kind text default 'liga',
  p_sport text default 'bowling',
  p_venue text default '',
  p_schedule text default '',
  p_season_start date default null,
  p_season_end date default null,
  p_contact_name text default '',
  p_contact_phone text default '',
  p_require_photo boolean default false,
  p_has_minors boolean default false,
  p_tz text default 'America/Santo_Domingo',
  p_rules jsonb default '{}',
  p_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_sport text := coalesce(p_sport, 'bowling');
  v_me text := (select p.name from public.profiles p where p.id = v_uid);
  v_code text;
  v_player uuid;
begin
  if v_me is null then
    perform private.fail('no_existe');
  end if;
  perform private.check_sport(v_sport);
  perform private.check_tz(p_tz);
  insert into public.leagues (id, sport, kind, visibility, name, owner_id, venue, schedule, season_start, season_end,
                              contact_name, contact_phone, require_photo, has_minors, tz, rules)
  values (v_id, v_sport, p_kind, p_visibility, private.clean_name(p_name), v_uid, btrim(coalesce(p_venue, '')),
          btrim(coalesce(p_schedule, '')), p_season_start, p_season_end, btrim(coalesce(p_contact_name, '')),
          coalesce(p_contact_phone, ''), coalesce(p_require_photo, false), coalesce(p_has_minors, false), p_tz,
          coalesce(p_rules, '{}'::jsonb));
  insert into public.league_members (league_id, user_id, role, display_name) values (v_id, v_uid, 'owner', v_me);
  v_code := private.set_invite_code(v_id);
  insert into public.players (league_id, user_id, name) values (v_id, v_uid, v_me) returning id into v_player;
  return jsonb_build_object('league_id', v_id, 'player_id', v_player, 'invite_code', v_code);
end $$;

-- Torneo sin liga: su "liga" de un solo torneo (dueño, invitación, jugador) y el torneo adentro, juntos.
-- Valores del torneo como createTournament de BowlingX: 3 juegos, handicap 230/80 %, individual con
-- handicap, equipos por scratch, cortes 200/175/160 y equipos de 3.
create function public.create_tournament(
  p_name text,
  p_date date,
  p_visibility text default 'private',
  p_sport text default 'bowling',
  p_venue text default '',
  p_contact_name text default '',
  p_contact_phone text default '',
  p_require_photo boolean default false,
  p_id uuid default null,
  p_event_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
  v_event uuid;
begin
  perform private.require_uid();
  if p_date is null then
    perform private.fail('invalido');
  end if;
  v := public.create_league(p_name => p_name, p_visibility => p_visibility, p_kind => 'torneo', p_sport => p_sport,
                            p_venue => p_venue, p_schedule => '', p_season_start => p_date, p_season_end => p_date,
                            p_contact_name => p_contact_name, p_contact_phone => p_contact_phone,
                            p_require_photo => p_require_photo, p_id => p_id);
  v_event := public.create_event(p_league => (v ->> 'league_id')::uuid, p_type => 'torneo', p_date => p_date, p_name => p_name,
                                 p_games => 3, p_hcp_base => 230, p_hcp_percent => 80, p_individual_rank_by => 'hcp',
                                 p_team_rank_by => 'scratch', p_category_cuts => array[200, 175, 160], p_team_size => 3,
                                 p_id => p_event_id);
  return v || jsonb_build_object('event_id', v_event);
end $$;

-- Admin: cambia datos de la liga. p_patch solo con las claves que cambian. El deporte y el dueño no se
-- cambian aquí. has_minors: el admin solo lo enciende; apagarlo es del superadmin y sin menores en la liga.
create function public.update_league(p_league uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.leagues;
  k text;
begin
  perform private.require_uid();
  perform private.require_admin(p_league);
  select * into v from public.leagues l where l.id = p_league for update;
  if v.id is null then
    perform private.fail('no_existe');
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then
    perform private.fail('invalido');
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k <> all (array['name', 'kind', 'visibility', 'venue', 'schedule', 'season_start', 'season_end', 'contact_name',
                       'contact_phone', 'require_photo', 'has_minors', 'tz', 'rules']) then
      perform private.fail('invalido');
    end if;
  end loop;
  if p_patch ? 'has_minors' and v.has_minors and not (p_patch -> 'has_minors')::boolean and not private.is_super() then
    perform private.deny();
  end if;
  if p_patch ? 'tz' then
    perform private.check_tz(p_patch ->> 'tz');
  end if;
  update public.leagues l set
    name = case when p_patch ? 'name' then private.clean_name(p_patch ->> 'name') else l.name end,
    kind = case when p_patch ? 'kind' then p_patch ->> 'kind' else l.kind end,
    visibility = case when p_patch ? 'visibility' then p_patch ->> 'visibility' else l.visibility end,
    venue = case when p_patch ? 'venue' then btrim(coalesce(p_patch ->> 'venue', '')) else l.venue end,
    schedule = case when p_patch ? 'schedule' then btrim(coalesce(p_patch ->> 'schedule', '')) else l.schedule end,
    season_start = case when p_patch ? 'season_start' then nullif(p_patch ->> 'season_start', '')::date else l.season_start end,
    season_end = case when p_patch ? 'season_end' then nullif(p_patch ->> 'season_end', '')::date else l.season_end end,
    contact_name = case when p_patch ? 'contact_name' then btrim(coalesce(p_patch ->> 'contact_name', '')) else l.contact_name end,
    contact_phone = case when p_patch ? 'contact_phone' then coalesce(p_patch ->> 'contact_phone', '') else l.contact_phone end,
    require_photo = case when p_patch ? 'require_photo' then (p_patch -> 'require_photo')::boolean else l.require_photo end,
    has_minors = case when p_patch ? 'has_minors' then (p_patch -> 'has_minors')::boolean else l.has_minors end,
    tz = case when p_patch ? 'tz' then p_patch ->> 'tz' else l.tz end,
    rules = case when p_patch ? 'rules' then p_patch -> 'rules' else l.rules end
  where l.id = p_league;
end $$;

-- Dueño (o superadmin): borra la liga con todo su contenido (cascada). Solo queda su tombstone; los
-- archivos de fotos van a la cola de Storage.
create function public.delete_league(p_league uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_uid();
  if not private.is_owner(p_league) then
    perform private.deny();
  end if;
  perform set_config('mm.deleting_league', p_league::text, true);
  delete from public.leagues where id = p_league;
  if not found then
    perform private.fail('no_existe');
  end if;
  perform set_config('mm.deleting_league', '', true);
end $$;

-- Dueño (o superadmin): pasa la liga a otro miembro; el dueño anterior queda como admin. Es el camino
-- para poder borrar la cuenta de un dueño (leagues.owner_id no deja borrarla).
create function public.transfer_ownership(p_league uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_uid();
  if not private.is_owner(p_league) then
    perform private.deny();
  end if;
  if not exists (select 1 from public.league_members m where m.league_id = p_league and m.user_id = p_user and m.role <> 'owner') then
    perform private.fail('no_existe');
  end if;
  perform set_config('mm.transfer', p_league::text, true);
  update public.league_members set role = 'admin' where league_id = p_league and role = 'owner';
  update public.league_members set role = 'owner' where league_id = p_league and user_id = p_user;
  update public.leagues set owner_id = p_user where id = p_league;
  perform set_config('mm.transfer', '', true);
end $$;

-- Admin: código nuevo (el anterior deja de servir). El vigente se lee en league_secrets.
create function public.renew_invite_code(p_league uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_uid();
  perform private.require_admin(p_league);
  if not exists (select 1 from public.leagues l where l.id = p_league) then
    perform private.fail('no_existe');
  end if;
  return private.set_invite_code(p_league);
end $$;

-- Con el código (link o QR) se ve a qué liga invita, también sin cuenta. Los códigos no se listan.
-- Límite: 30 códigos malos por hora por cuenta (o por IP sin cuenta); pasado eso, 'rate_limited'.
-- Código malo = ninguna fila (así el intento queda contado).
create function public.invite_preview(p_code text)
returns table (league_id uuid, name text, sport text, kind text, visibility text)
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := private.rate_key('preview');
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if private.rate_blocked(v_key, 30, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  return query
    select l.id, l.name, l.sport, l.kind, l.visibility
      from public.league_secrets s join public.leagues l on l.id = s.league_id
     where s.invite_code = v_code;
  if not found then
    perform private.rate_hit(v_key, interval '1 hour');
  end if;
end $$;

-- Deja listo el jugador de la cuenta en la liga (el trabajo de ensure_my_player y join_league):
-- 1) si ya tiene, ese; 2) el preferido (p_prefer) si sigue libre; 3) un único jugador libre con el mismo
-- nombre normalizado (lo creó el admin, p. ej. de un torneo importado: conserva sus juegos); 4) uno nuevo.
-- Bloquea la membresía: dos teléfonos a la vez no crean dos jugadores.
create function private.ensure_player(p_league uuid, p_user uuid, p_prefer uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_player uuid;
  v_same uuid[];
begin
  select m.display_name into v_name from public.league_members m where m.league_id = p_league and m.user_id = p_user for update;
  if v_name is null then
    perform private.deny();
  end if;
  select p.id into v_player from public.players p where p.league_id = p_league and p.user_id = p_user;
  if v_player is not null then
    return v_player;
  end if;
  if p_prefer is not null then
    update public.players p set user_id = p_user
     where p.id = p_prefer and p.league_id = p_league and p.user_id is null and not p.is_minor
    returning p.id into v_player;
    if v_player is not null then
      return v_player;
    end if;
  end if;
  select array_agg(p.id) into v_same from public.players p
   where p.league_id = p_league and p.user_id is null and not p.is_minor
     and private.normalize_name(p.name) = private.normalize_name(v_name);
  if cardinality(v_same) = 1 then
    update public.players p set user_id = p_user where p.id = v_same[1] and p.user_id is null returning p.id into v_player;
    if v_player is not null then
      return v_player;
    end if;
  end if;
  insert into public.players (league_id, user_id, name) values (p_league, p_user, v_name) returning id into v_player;
  return v_player;
end $$;

-- Unirse: liga pública sin más; privada con su código (p_league opcional si viene el código).
-- Entrar es participar: devuelve {league_id, player_id} con su jugador listo. Ya miembro: lo mismo (idempotente).
-- Código malo o de otra liga: devuelve null (y cuenta el intento). 10 códigos malos por hora: 'rate_limited'.
create function public.join_league(p_league uuid default null, p_code text default null, p_prefer uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_league uuid := p_league;
  v_code text := nullif(upper(btrim(coalesce(p_code, ''))), '');
  v_key text := 'join:' || v_uid::text;
  v_visibility text;
  v_found uuid;
  v_name text := (select p.name from public.profiles p where p.id = v_uid);
begin
  if v_league is null and v_code is null then
    perform private.fail('invalido');
  end if;
  if v_name is null then
    perform private.fail('no_existe');
  end if;
  if v_league is not null then
    select l.visibility into v_visibility from public.leagues l where l.id = v_league;
    if v_visibility is null then
      perform private.fail('no_existe');
    end if;
  end if;
  if v_league is null or (v_visibility <> 'public' and not exists (
        select 1 from public.league_members m where m.league_id = v_league and m.user_id = v_uid)) then
    if v_code is null then
      perform private.deny();
    end if;
    if private.rate_blocked(v_key, 10, interval '1 hour') then
      perform private.fail('rate_limited');
    end if;
    select s.league_id into v_found from public.league_secrets s where s.invite_code = v_code;
    if v_found is null or (v_league is not null and v_found <> v_league) then
      perform private.rate_hit(v_key, interval '1 hour');
      return null;
    end if;
    v_league := v_found;
  end if;
  insert into public.league_members (league_id, user_id, role, display_name) values (v_league, v_uid, 'member', v_name)
  on conflict (league_id, user_id) do nothing;
  return jsonb_build_object('league_id', v_league, 'player_id', private.ensure_player(v_league, v_uid, p_prefer));
end $$;

-- =====================================================================
-- Miembros y roles
-- =====================================================================

-- Dueño (o superadmin): da o quita admin. Un admin también se lo quita a sí mismo (como step_down_admin).
-- Nadie toca el rol del dueño ni nombra otro dueño aquí (eso es transfer_ownership).
create function public.set_member_role(p_league uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_role text;
begin
  if p_role is null or p_role not in ('admin', 'member') then
    perform private.fail('invalido');
  end if;
  select m.role into v_role from public.league_members m where m.league_id = p_league and m.user_id = p_user for update;
  if not private.is_owner(p_league) and not (p_user = v_uid and v_role = 'admin' and p_role = 'member') then
    perform private.deny();
  end if;
  if v_role is null then
    perform private.fail('no_existe');
  elsif v_role = 'owner' then
    perform private.deny();
  end if;
  update public.league_members set role = p_role where league_id = p_league and user_id = p_user and role <> p_role;
end $$;

-- Dueño (o superadmin): nombra o quita anotadores.
create function public.set_member_scorer(p_league uuid, p_user uuid, p_scorer boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_uid();
  if not private.is_owner(p_league) then
    perform private.deny();
  end if;
  update public.league_members set is_scorer = coalesce(p_scorer, false) where league_id = p_league and user_id = p_user;
  if not found then
    perform private.fail('no_existe');
  end if;
end $$;

-- Un admin deja de serlo por su cuenta (sigue como jugador).
create function public.step_down_admin(p_league uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  update public.league_members set role = 'member' where league_id = p_league and user_id = v_uid and role = 'admin';
  if not found then
    perform private.deny();
  end if;
end $$;

-- Sacar a alguien (o salir): uno mismo sale (salvo el dueño); un admin saca solo a miembros sin permisos
-- (ni admin ni anotador: sacarlo sería quitarle el permiso); el dueño o el superadmin sacan a cualquiera
-- menos al dueño. Su jugador queda sin cuenta (FK) y sus juegos en vivo se quitan.
create function public.remove_member(p_league uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_role text;
  v_scorer boolean;
begin
  select m.role, m.is_scorer into v_role, v_scorer from public.league_members m
   where m.league_id = p_league and m.user_id = p_user for update;
  if v_role is null then
    perform private.fail('no_existe');
  end if;
  if v_role = 'owner' then
    perform private.deny();
  end if;
  if not (p_user = v_uid or private.is_owner(p_league) or (private.is_admin(p_league) and v_role = 'member' and not v_scorer)) then
    perform private.deny();
  end if;
  delete from public.live_states s using public.players p
   where p.league_id = p_league and p.user_id = p_user and s.player_id = p.id;
  delete from public.league_members where league_id = p_league and user_id = p_user;
end $$;

-- Salir de la liga (el dueño no: traspasa o borra la liga).
create function public.leave_league(p_league uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.remove_member(p_league, private.require_uid());
end $$;

-- =====================================================================
-- Jugadores y vínculo con la cuenta
-- =====================================================================

-- Miembro: su jugador en la liga (lo vincula o lo crea). Ver private.ensure_player.
create function public.ensure_my_player(p_league uuid, p_prefer uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  return private.ensure_player(p_league, private.require_uid(), p_prefer);
end $$;

-- Miembro sin jugador: reclama un jugador libre de su liga (conserva sus juegos).
create function public.claim_player(p_player uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_league uuid;
  v_owner uuid;
  v_minor boolean;
  v_mine uuid;
begin
  select p.league_id, p.user_id, p.is_minor into v_league, v_owner, v_minor from public.players p where p.id = p_player for update;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform 1 from public.league_members m where m.league_id = v_league and m.user_id = v_uid for update;
  if not found then
    perform private.deny();
  end if;
  v_mine := private.my_player(v_league);
  if v_mine = p_player then
    return p_player;
  end if;
  if v_mine is not null or v_owner is not null then
    perform private.fail('duplicado');
  end if;
  if v_minor then
    perform private.fail('invalido');
  end if;
  update public.players set user_id = v_uid where id = p_player;
  return p_player;
end $$;

-- Admin: jugador de la lista, sin cuenta. Menor: solo en ligas con menores; queda registrado quién dio el
-- consentimiento del padre o tutor y cuándo.
create function public.create_player(
  p_league uuid,
  p_name text,
  p_average_override double precision default null,
  p_is_minor boolean default false,
  p_guardian_name text default null,
  p_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.require_uid();
  perform private.require_admin(p_league);
  insert into public.players (id, league_id, name, average_override, is_minor)
  values (coalesce(p_id, gen_random_uuid()), p_league, private.clean_name(p_name), p_average_override, coalesce(p_is_minor, false))
  returning id into v_id;
  if coalesce(p_is_minor, false) then
    insert into public.player_private (player_id, league_id, guardian_name, consent_by, consent_at)
    values (v_id, p_league, nullif(btrim(p_guardian_name), ''), auth.uid(), now());
  end if;
  return v_id;
end $$;

-- Admin: cambia nombre, promedio fijo, menor o atributos. La cuenta no se cambia aquí (claim, link, unlink).
create function public.update_player(p_player uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select p.league_id from public.players p where p.id = p_player);
  k text;
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  if jsonb_typeof(p_patch) is distinct from 'object' then
    perform private.fail('invalido');
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k <> all (array['name', 'average_override', 'is_minor', 'attrs']) then
      perform private.fail('invalido');
    end if;
  end loop;
  update public.players p set
    name = case when p_patch ? 'name' then private.clean_name(p_patch ->> 'name') else p.name end,
    average_override = case when p_patch ? 'average_override' then (p_patch ->> 'average_override')::double precision else p.average_override end,
    is_minor = case when p_patch ? 'is_minor' then (p_patch -> 'is_minor')::boolean else p.is_minor end,
    attrs = case when p_patch ? 'attrs' then p_patch -> 'attrs' else p.attrs end
  where p.id = p_player;
  if coalesce((p_patch -> 'is_minor')::boolean, false) then
    insert into public.player_private (player_id, league_id, consent_by, consent_at) values (p_player, v_league, auth.uid(), now())
    on conflict (player_id) do update set consent_by = coalesce(public.player_private.consent_by, excluded.consent_by),
                                          consent_at = coalesce(public.player_private.consent_at, excluded.consent_at);
  end if;
end $$;

-- Admin: año de nacimiento, sexo y tutor (solo lo ven los admins).
create function public.set_player_private(p_player uuid, p_birth_year integer default null, p_sex text default null, p_guardian_name text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select p.league_id from public.players p where p.id = p_player);
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  insert into public.player_private (player_id, league_id, birth_year, sex, guardian_name)
  values (p_player, v_league, p_birth_year, p_sex, nullif(btrim(p_guardian_name), ''))
  on conflict (player_id) do update set birth_year = excluded.birth_year, sex = excluded.sex, guardian_name = excluded.guardian_name;
end $$;

-- Admin: borra el jugador con sus participaciones, envíos, «voy» y en vivo (cascada); su cuenta, si tiene,
-- queda sin jugador en la liga.
create function public.delete_player(p_player uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select p.league_id from public.players p where p.id = p_player);
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  delete from public.players where id = p_player;
end $$;

-- Admin: une la cuenta de un miembro con un jugador de la lista sin cuenta (sus juegos pasan a la cuenta).
-- Del jugador que tenía la cuenta, lo pendiente (envíos por aprobar, «voy») pasa al nuevo; si nunca
-- participó en un evento se borra (y pasan todos sus envíos), y si participó queda en la lista sin cuenta.
create function public.link_account_to_player(p_player uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
  v_owner uuid;
  v_minor boolean;
  v_old uuid;
  v_removed boolean := false;
begin
  perform private.require_uid();
  select p.league_id, p.user_id, p.is_minor into v_league, v_owner, v_minor from public.players p where p.id = p_player for update;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  if v_minor then
    perform private.fail('invalido');
  end if;
  if v_owner is not null and v_owner <> p_user then
    perform private.fail('duplicado');
  end if;
  perform 1 from public.league_members m where m.league_id = v_league and m.user_id = p_user for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  select p.id into v_old from public.players p where p.league_id = v_league and p.user_id = p_user and p.id <> p_player;
  if v_old is not null then
    v_removed := not exists (select 1 from public.entries e where e.player_id = v_old);
    update public.submissions s set player_id = p_player where s.player_id = v_old and (v_removed or s.status = 'pendiente');
    insert into public.event_rsvps (event_id, player_id, league_id, going)
      select r.event_id, p_player, r.league_id, r.going from public.event_rsvps r where r.player_id = v_old
    on conflict (event_id, player_id) do nothing;
    delete from public.event_rsvps r where r.player_id = v_old;
    delete from public.live_states s where s.player_id = v_old;
    if v_removed then
      delete from public.players where id = v_old;
    else
      update public.players set user_id = null where id = v_old;
    end if;
  end if;
  update public.players set user_id = p_user where id = p_player;
  return jsonb_build_object('removed_old', v_removed, 'old_player_id', v_old);
end $$;

-- Admin (o la propia cuenta): separa la cuenta del jugador (se vinculó al equivocado) y le da en el mismo
-- momento su jugador nuevo; si quedara sin jugador, al abrir la liga se volvería a vincular sola con este
-- por el nombre. Lo que la cuenta publicó en vivo a nombre del jugador se quita. Devuelve el jugador nuevo.
create function public.unlink_account(p_player uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_league uuid;
  v_account uuid;
  v_name text;
  v_new uuid;
begin
  select p.league_id, p.user_id into v_league, v_account from public.players p where p.id = p_player for update;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  if v_account is null then
    perform private.fail('invalido');
  end if;
  if v_account <> v_uid and not private.is_admin(v_league) then
    perform private.deny();
  end if;
  select m.display_name into v_name from public.league_members m where m.league_id = v_league and m.user_id = v_account for update;
  delete from public.live_states s where s.player_id = p_player;
  update public.players set user_id = null where id = p_player;
  insert into public.players (league_id, user_id, name) values (v_league, v_account, v_name) returning id into v_new;
  return v_new;
end $$;

-- =====================================================================
-- Eventos
-- =====================================================================

create function public.create_event(
  p_league uuid,
  p_type text,
  p_date date,
  p_name text default '',
  p_games integer default 3,
  p_hcp_base integer default 0,
  p_hcp_percent integer default 0,
  p_individual_rank_by text default null,
  p_team_rank_by text default null,
  p_category_cuts integer[] default array[200, 175, 160],
  p_team_size integer default 0,
  p_announcement text default '',
  p_start_time time default null,
  p_config jsonb default '{}',
  p_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.require_uid();
  perform private.require_admin(p_league);
  insert into public.events (id, league_id, type, name, date, start_time, games, hcp_base, hcp_percent, individual_rank_by,
                             team_rank_by, category_cuts, team_size, announcement, config, created_by)
  values (coalesce(p_id, gen_random_uuid()), p_league, p_type, btrim(coalesce(p_name, '')), p_date, p_start_time, p_games,
          p_hcp_base, p_hcp_percent, p_individual_rank_by, p_team_rank_by, p_category_cuts::smallint[], p_team_size,
          coalesce(p_announcement, ''), coalesce(p_config, '{}'::jsonb), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Admin: cambia el evento. p_patch solo con las claves que cambian.
create function public.update_event(p_event uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select e.league_id from public.events e where e.id = p_event);
  k text;
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  if jsonb_typeof(p_patch) is distinct from 'object' then
    perform private.fail('invalido');
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k <> all (array['type', 'name', 'date', 'start_time', 'games', 'hcp_base', 'hcp_percent', 'individual_rank_by',
                       'team_rank_by', 'category_cuts', 'team_size', 'announcement', 'config']) then
      perform private.fail('invalido');
    end if;
  end loop;
  update public.events e set
    type = case when p_patch ? 'type' then p_patch ->> 'type' else e.type end,
    name = case when p_patch ? 'name' then btrim(coalesce(p_patch ->> 'name', '')) else e.name end,
    date = case when p_patch ? 'date' then (p_patch ->> 'date')::date else e.date end,
    start_time = case when p_patch ? 'start_time' then (p_patch ->> 'start_time')::time else e.start_time end,
    games = case when p_patch ? 'games' then (p_patch ->> 'games')::smallint else e.games end,
    hcp_base = case when p_patch ? 'hcp_base' then (p_patch ->> 'hcp_base')::smallint else e.hcp_base end,
    hcp_percent = case when p_patch ? 'hcp_percent' then (p_patch ->> 'hcp_percent')::smallint else e.hcp_percent end,
    individual_rank_by = case when p_patch ? 'individual_rank_by' then p_patch ->> 'individual_rank_by' else e.individual_rank_by end,
    team_rank_by = case when p_patch ? 'team_rank_by' then p_patch ->> 'team_rank_by' else e.team_rank_by end,
    category_cuts = case when p_patch ? 'category_cuts'
                         then (select array_agg((x #>> '{}')::smallint order by n) from jsonb_array_elements(p_patch -> 'category_cuts') with ordinality as a (x, n))
                         else e.category_cuts end,
    team_size = case when p_patch ? 'team_size' then (p_patch ->> 'team_size')::smallint else e.team_size end,
    announcement = case when p_patch ? 'announcement' then coalesce(p_patch ->> 'announcement', '') else e.announcement end,
    config = case when p_patch ? 'config' then p_patch -> 'config' else e.config end
  where e.id = p_event;
end $$;

-- Admin: borra el evento con sus participaciones, envíos, fotos, equipos, «voy», en vivo y social (cascada).
create function public.delete_event(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select e.league_id from public.events e where e.id = p_event);
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  delete from public.events where id = p_event;
end $$;

-- En una práctica, cualquier jugador (o admin) suma un juego a la sesión: de uno en uno, hasta 10.
-- p_expected: los juegos que veía el teléfono; si otro ya lo sumó (hay más), no suma otra vez.
-- Devuelve los juegos que quedan. Con p_op_id, reintentar no suma dos veces.
create function public.add_practice_game(p_event uuid, p_expected integer default null, p_op_id uuid default null) returns integer
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
  if p_expected is null or v_games <= p_expected then
    if v_games >= 10 then
      perform private.fail('invalido');
    end if;
    update public.events set games = games + 1 where id = p_event returning games into v_games;
  end if;
  perform private.op_end(p_op_id, to_jsonb(v_games));
  return v_games;
end $$;

-- «Voy»: cada quien marca o quita el suyo (p_player null = mi jugador). Un admin puede marcar el de otro.
create function public.set_rsvp(p_event uuid, p_going boolean, p_player uuid default null, p_op_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
  v_mine uuid;
  v_player uuid;
begin
  perform private.require_uid();
  if private.op_begin(p_op_id, 'set_rsvp') is not null then
    return;
  end if;
  select e.league_id into v_league from public.events e where e.id = p_event;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  v_mine := private.my_player(v_league);
  v_player := coalesce(p_player, v_mine);
  if v_player is null or (v_player is distinct from v_mine and not private.is_admin(v_league)) then
    perform private.deny();
  end if;
  if coalesce(p_going, false) then
    insert into public.event_rsvps (event_id, player_id, league_id) values (p_event, v_player, v_league)
    on conflict (event_id, player_id) do update set going = true where not public.event_rsvps.going;
  else
    delete from public.event_rsvps where event_id = p_event and player_id = v_player;
  end if;
  perform private.op_end(p_op_id, null);
end $$;

-- =====================================================================
-- Equipos (del evento)
-- =====================================================================

create function public.add_team(p_event uuid, p_name text, p_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select e.league_id from public.events e where e.id = p_event);
  v_id uuid;
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  insert into public.teams (id, league_id, event_id, name, sort_order)
  values (coalesce(p_id, gen_random_uuid()), v_league, p_event, private.clean_name(p_name),
          coalesce((select max(t.sort_order) from public.teams t where t.event_id = p_event), 0) + 1)
  returning id into v_id;
  return v_id;
end $$;

create function public.rename_team(p_team uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select t.league_id from public.teams t where t.id = p_team);
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  update public.teams set name = private.clean_name(p_name) where id = p_team;
end $$;

-- Admin: borra el equipo; sus integrantes quedan sin equipo (FK).
create function public.delete_team(p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select t.league_id from public.teams t where t.id = p_team);
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  delete from public.teams where id = p_team;
end $$;

-- Admin: arma los equipos de una vez. p_groups = [{team_id|null, name, entry_ids: [...]}, ...] en orden.
-- Reutiliza los equipos existentes (y les pone el nombre nuevo si cambió), crea los que falten, borra los que
-- sobren y asigna a cada inscrito. Devuelve los ids de los equipos en el orden de p_groups.
create function public.apply_teams(p_event uuid, p_groups jsonb) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
  v_base integer;
  v_used uuid[] := '{}';
  v_team uuid;
  v_name text;
  g jsonb;
  i bigint;
begin
  perform private.require_uid();
  select e.league_id into v_league from public.events e where e.id = p_event for update;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  if jsonb_typeof(p_groups) is distinct from 'array' then
    perform private.fail('invalido');
  end if;
  v_base := coalesce((select max(t.sort_order) from public.teams t where t.event_id = p_event), 0);
  for g, i in select x, n from jsonb_array_elements(p_groups) with ordinality as a (x, n) loop
    v_name := private.clean_name(g ->> 'name');
    v_team := nullif(g ->> 'team_id', '')::uuid;
    if v_team is not null then
      if not exists (select 1 from public.teams t where t.id = v_team and t.event_id = p_event) then
        perform private.fail('invalido');
      end if;
      update public.teams set name = v_name where id = v_team and name <> v_name;
    else
      insert into public.teams (league_id, event_id, name, sort_order) values (v_league, p_event, v_name, v_base + i::integer)
      returning id into v_team;
    end if;
    v_used := v_used || v_team;
    update public.entries e set team_id = v_team
     where e.event_id = p_event and e.team_id is distinct from v_team
       and e.id in (select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(g -> 'entry_ids', '[]'::jsonb)) x);
  end loop;
  delete from public.teams t where t.event_id = p_event and t.id <> all (v_used);
  return v_used;
end $$;

-- =====================================================================
-- Participaciones
-- =====================================================================

-- Admin: inscribe jugadores con el promedio que tienen hoy. p_players = [{player_id, average}].
-- Quien ya estaba inscrito no se toca. Devuelve cuántos se inscribieron.
create function public.add_entries(p_event uuid, p_players jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
  v_games integer;
  v_count integer;
begin
  perform private.require_uid();
  select e.league_id, e.games into v_league, v_games from public.events e where e.id = p_event;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  if jsonb_typeof(p_players) is distinct from 'array' then
    perform private.fail('invalido');
  end if;
  insert into public.entries (league_id, event_id, player_id, average, scores, photos)
  select v_league, p_event, (x ->> 'player_id')::uuid, coalesce((x ->> 'average')::double precision, 0),
         array_fill(null::smallint, array[v_games]), array_fill(null::text, array[v_games])
    from jsonb_array_elements(p_players) x
  on conflict (event_id, player_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Un número de un juego (jsonb) según el deporte; null no vale.
create function private.one_score(p jsonb, p_sport text) returns smallint
language plpgsql immutable set search_path = '' as $$
declare
  v smallint := (private.series(jsonb_build_array(p), p_sport, 1))[1];
begin
  if v is null then
    perform private.fail('invalido');
  end if;
  return v;
end $$;

-- Admin o anotador: guarda un juego (índice p_game, desde 0): pinos, cuadros (si se anotó tiro por tiro)
-- y si cuenta sin foto. Sin foto obligatoria el juego cuenta de una ('sin-foto'); con foto, queda en
-- borrador hasta verificarlo. p_score null = borrar el juego. p_frames null = sin cuadros.
create function public.save_game(p_entry uuid, p_game integer, p_score integer default null, p_frames jsonb default null, p_op_id uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.entries;
  v_games integer;
  v_require boolean;
  v_sport text;
  v_scores smallint[];
  v_photos text[];
  v_frames jsonb;
begin
  perform private.require_uid();
  if private.op_begin(p_op_id, 'save_game') is not null then
    return;
  end if;
  select * into e from public.entries x where x.id = p_entry for update;
  if e.id is null then
    perform private.fail('no_existe');
  end if;
  if not private.is_admin(e.league_id) and not private.is_scorer(e.league_id) then
    perform private.deny();
  end if;
  select ev.games into v_games from public.events ev where ev.id = e.event_id;
  select l.require_photo, l.sport into v_require, v_sport from public.leagues l where l.id = e.league_id;
  if p_game is null or p_game < 0 or p_game >= v_games then
    perform private.fail('invalido');
  end if;
  if p_frames is not null and jsonb_typeof(p_frames) not in ('object', 'null') then
    perform private.fail('invalido');
  end if;
  v_scores := private.slots(e.scores, v_games);
  v_photos := private.slots(e.photos, v_games);
  v_scores[p_game + 1] := case when p_score is null then null else private.one_score(to_jsonb(p_score), v_sport) end;
  v_photos[p_game + 1] := case when p_score is not null and not v_require then 'sin-foto' end;
  v_frames := coalesce(e.frames, '{}'::jsonb);
  v_frames := case when p_frames is null or jsonb_typeof(p_frames) = 'null' then v_frames - p_game::text
                   else jsonb_set(v_frames, array[p_game::text], p_frames) end;
  update public.entries set scores = v_scores, photos = v_photos, frames = v_frames where id = p_entry;
  perform private.op_end(p_op_id, null);
end $$;

-- Admin: cambia la participación (team_id, average, handicap_override, scores, photos, frames).
-- Anotador (torneo sin liga): solo scores, photos y frames.
create function public.update_entry(p_entry uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.entries;
  v_admin boolean;
  v_sport text;
  k text;
begin
  perform private.require_uid();
  select * into e from public.entries x where x.id = p_entry for update;
  if e.id is null then
    perform private.fail('no_existe');
  end if;
  v_admin := private.is_admin(e.league_id);
  if not v_admin and not private.is_scorer(e.league_id) then
    perform private.deny();
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then
    perform private.fail('invalido');
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k <> all (array['team_id', 'average', 'handicap_override', 'scores', 'photos', 'frames']) then
      perform private.fail('invalido');
    end if;
    if not v_admin and k <> all (array['scores', 'photos', 'frames']) then
      perform private.deny();
    end if;
  end loop;
  if p_patch ? 'frames' and jsonb_typeof(p_patch -> 'frames') not in ('object', 'null') then
    perform private.fail('invalido');
  end if;
  v_sport := (select l.sport from public.leagues l where l.id = e.league_id);
  update public.entries x set
    team_id = case when p_patch ? 'team_id' then nullif(p_patch ->> 'team_id', '')::uuid else x.team_id end,
    average = case when p_patch ? 'average' then (p_patch ->> 'average')::double precision else x.average end,
    handicap_override = case when p_patch ? 'handicap_override' then (p_patch ->> 'handicap_override')::smallint else x.handicap_override end,
    scores = case when p_patch ? 'scores' then coalesce(private.series(p_patch -> 'scores', v_sport), '{}') else x.scores end,
    photos = case when p_patch ? 'photos' then coalesce(private.marks(p_patch -> 'photos'), '{}') else x.photos end,
    frames = case when p_patch ? 'frames' then nullif(p_patch -> 'frames', 'null'::jsonb) else x.frames end
  where x.id = p_entry;
end $$;

-- Varias a la vez (p_patches = [{id, patch}]), todo o nada.
create function public.update_entries(p_patches jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  x jsonb;
begin
  perform private.require_uid();
  if jsonb_typeof(p_patches) is distinct from 'array' then
    perform private.fail('invalido');
  end if;
  for x in select value from jsonb_array_elements(p_patches) loop
    perform public.update_entry((x ->> 'id')::uuid, x -> 'patch');
  end loop;
end $$;

-- Admin: saca al jugador del evento, con sus me gusta y comentarios (cascada) y lo que anotaba en vivo.
create function public.remove_entry(p_entry uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.entries;
begin
  perform private.require_uid();
  select * into e from public.entries x where x.id = p_entry;
  if e.id is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(e.league_id);
  delete from public.live_states s where s.event_id = e.event_id and s.player_id = e.player_id;
  delete from public.entries where id = p_entry;
end $$;

-- =====================================================================
-- Fotos (el archivo va a Storage en '<liga>/<foto>.webp|.jpg'; aquí solo sus datos)
-- =====================================================================

-- p_photo = {id?, width, height, bytes, content_type ('image/webp' por defecto | 'image/jpeg')}.
create function private.insert_photo(p_league uuid, p_event uuid, p_photo jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_type text;
begin
  if jsonb_typeof(p_photo) is distinct from 'object' then
    perform private.fail('invalido');
  end if;
  if not private.can_upload_photo(p_league) then
    perform private.deny();
  end if;
  v_id := coalesce(nullif(p_photo ->> 'id', '')::uuid, gen_random_uuid());
  v_type := coalesce(nullif(p_photo ->> 'content_type', ''), 'image/webp');
  insert into public.photos (id, league_id, event_id, path, content_type, width, height, bytes, uploaded_by)
  values (v_id, p_league, p_event,
          p_league::text || '/' || v_id::text || case v_type when 'image/jpeg' then '.jpg' else '.webp' end,
          v_type, (p_photo ->> 'width')::integer, (p_photo ->> 'height')::integer, (p_photo ->> 'bytes')::integer, auth.uid());
  return v_id;
end $$;

-- Admin, anotador o miembro con jugador (liga sin menores): registra una foto ya subida. Devuelve {id, path}.
create function public.add_photo(
  p_league uuid,
  p_id uuid default null,
  p_event uuid default null,
  p_width integer default null,
  p_height integer default null,
  p_bytes integer default null,
  p_content_type text default 'image/webp'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.require_uid();
  v_id := private.insert_photo(p_league, p_event, jsonb_build_object('id', p_id, 'width', p_width, 'height', p_height,
                                                                      'bytes', p_bytes, 'content_type', p_content_type));
  return jsonb_build_object('id', v_id, 'path', (select p.path from public.photos p where p.id = v_id));
end $$;

-- Admin: libera espacio borrando las fotos de hace más de p_months meses. Los juegos siguen verificados.
-- Devuelve las rutas para quitar los archivos de Storage (también quedan en la cola de purga).
create function public.delete_old_photos(p_league uuid, p_months integer) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_paths text[];
begin
  perform private.require_uid();
  perform private.require_admin(p_league);
  if p_months is null or p_months < 0 then
    perform private.fail('invalido');
  end if;
  with d as (
    delete from public.photos p where p.league_id = p_league and p.created_at < now() - make_interval(months => p_months)
    returning p.path
  )
  select coalesce(array_agg(d.path), '{}') into v_paths from d;
  return v_paths;
end $$;

-- Admin (o anotador si todos ya están inscritos): la foto del marcador y los juegos que se leyeron de ella,
-- ya verificados. p_writes = [{player_id, average, values: {"<juego>": pinos}}]. Inscribe (solo el admin)
-- a quien no estaba. Devuelve el id de la foto.
create function public.save_verified_games(p_event uuid, p_photo jsonb, p_writes jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
  v_games integer;
  v_sport text;
  v_admin boolean;
  v_photo uuid;
  w jsonb;
  k text;
  e public.entries;
  v_scores smallint[];
  v_photos text[];
begin
  perform private.require_uid();
  select ev.league_id, ev.games into v_league, v_games from public.events ev where ev.id = p_event;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  v_admin := private.is_admin(v_league);
  if not v_admin and not private.is_scorer(v_league) then
    perform private.deny();
  end if;
  if jsonb_typeof(p_writes) is distinct from 'array' then
    perform private.fail('invalido');
  end if;
  v_sport := (select l.sport from public.leagues l where l.id = v_league);
  v_photo := private.insert_photo(v_league, p_event, p_photo);
  for w in select value from jsonb_array_elements(p_writes) loop
    select * into e from public.entries x where x.event_id = p_event and x.player_id = (w ->> 'player_id')::uuid for update;
    if e.id is null and not v_admin then
      perform private.deny();
    end if;
    if jsonb_typeof(w -> 'values') is distinct from 'object' then
      perform private.fail('invalido');
    end if;
    v_scores := private.slots(e.scores, v_games);
    v_photos := private.slots(e.photos, v_games);
    for k in select jsonb_object_keys(w -> 'values') loop
      if k::integer < 0 or k::integer >= v_games then
        perform private.fail('invalido');
      end if;
      v_scores[k::integer + 1] := private.one_score(w -> 'values' -> k, v_sport);
      v_photos[k::integer + 1] := v_photo::text;
    end loop;
    if e.id is null then
      insert into public.entries (league_id, event_id, player_id, average, scores, photos)
      values (v_league, p_event, (w ->> 'player_id')::uuid, coalesce((w ->> 'average')::double precision, 0), v_scores, v_photos);
    else
      update public.entries set scores = v_scores, photos = v_photos where id = e.id;
    end if;
  end loop;
  return v_photo;
end $$;

-- =====================================================================
-- Envíos (juegos que un jugador sube; esperan aprobación)
-- =====================================================================

-- Miembro con jugador: envía sus juegos (de un evento o de una fecha), con foto o sin ella (el admin
-- decide). La foto (ya subida a Storage) y el envío se guardan juntos; lo enviado sale de «en vivo».
-- p_op_id obligatorio: reintentar devuelve el mismo envío y no duplica. Un admin puede enviar por otro
-- jugador (p_player). Devuelve el id del envío (p_id si el teléfono lo generó).
create function public.submit_games(
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

-- Lo que leyó la IA en la foto y de qué fila (la foto se lee en segundo plano, después de enviar).
-- El jugador: una sola vez, a su envío con foto que sigue pendiente. El admin: siempre (lee la foto él
-- mismo o cambia la fila). p_scanned: 1 a 10 números válidos.
create function public.set_submission_scan(p_submission uuid, p_scanned jsonb, p_scanned_name text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.submissions;
  v_scanned smallint[];
begin
  perform private.require_uid();
  select * into s from public.submissions x where x.id = p_submission for update;
  if s.id is null then
    perform private.fail('no_existe');
  end if;
  if not private.is_admin(s.league_id)
     and (s.player_id is distinct from private.my_player(s.league_id) or s.status <> 'pendiente' or s.photo_id is null or s.scanned is not null) then
    perform private.deny();
  end if;
  if char_length(p_scanned_name) > 60 then
    perform private.fail('invalido');
  end if;
  v_scanned := private.series(p_scanned, (select l.sport from public.leagues l where l.id = s.league_id), 1);
  if v_scanned is null then
    perform private.fail('invalido');
  end if;
  update public.submissions set scanned = v_scanned, scanned_name = nullif(btrim(p_scanned_name), '') where id = p_submission;
end $$;

-- Admin: aprueba el envío. Copia los juegos a la participación del jugador como verificados (foto o
-- 'sin-foto'), inscribe al jugador si no estaba (con p_average), marca el envío y quién lo revisó.
-- p_values = {"<juego del evento>": pinos}; p_frames = {"<juego>": {rolls, masks}} solo con los cuadros que
-- dan el mismo total (el teléfono lo comprueba con scoreGame); los demás juegos aprobados quedan sin cuadros.
-- p_event: por defecto el del envío; si el envío es por fecha, la práctica de ese día (se crea si no hay,
-- con greatest(3, p_games) juegos). Devuelve {entry_id, event_id}.
create function public.approve_submission(
  p_submission uuid,
  p_values jsonb,
  p_frames jsonb default null,
  p_event uuid default null,
  p_average double precision default null,
  p_games integer default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  s public.submissions;
  v_event uuid;
  v_games integer;
  v_sport text;
  v_max integer;
  e public.entries;
  v_scores smallint[];
  v_photos text[];
  v_frames jsonb;
  v_mark text;
  v_entry uuid;
  k text;
begin
  select * into s from public.submissions x where x.id = p_submission for update;
  if s.id is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(s.league_id);
  if jsonb_typeof(p_values) is distinct from 'object' or (p_frames is not null and jsonb_typeof(p_frames) not in ('object', 'null')) then
    perform private.fail('invalido');
  end if;
  v_max := (select max(k2::integer) from jsonb_object_keys(p_values) k2);
  v_sport := (select l.sport from public.leagues l where l.id = s.league_id);
  v_event := coalesce(p_event, s.event_id);
  if v_event is null then
    select ev.id into v_event from public.events ev
     where ev.league_id = s.league_id and ev.type = 'practica' and ev.date = s.date order by ev.created_at limit 1;
    if v_event is null then
      insert into public.events (league_id, type, name, date, games, hcp_base, hcp_percent, individual_rank_by, team_rank_by,
                                 category_cuts, team_size, created_by)
      values (s.league_id, 'practica', '', s.date, least(10, greatest(3, coalesce(p_games, cardinality(s.scores)), coalesce(v_max + 1, 0))),
              0, 0, 'scratch', 'scratch', array[200, 175, 160], 0, v_uid)
      returning id into v_event;
    end if;
  end if;
  select ev.games into v_games from public.events ev where ev.id = v_event and ev.league_id = s.league_id for update;
  if v_games is null then
    perform private.fail('no_existe');
  end if;
  select * into e from public.entries x where x.event_id = v_event and x.player_id = s.player_id for update;
  v_scores := private.slots(e.scores, v_games);
  v_photos := private.slots(e.photos, v_games);
  v_frames := coalesce(e.frames, '{}'::jsonb);
  v_mark := coalesce(s.photo_id::text, 'sin-foto');
  for k in select jsonb_object_keys(p_values) loop
    if k::integer < 0 or k::integer >= v_games then
      perform private.fail('invalido');
    end if;
    v_scores[k::integer + 1] := private.one_score(p_values -> k, v_sport);
    v_photos[k::integer + 1] := v_mark;
    v_frames := case when jsonb_typeof(p_frames -> k) = 'object' then jsonb_set(v_frames, array[k], p_frames -> k) else v_frames - k end;
  end loop;
  if e.id is null then
    insert into public.entries (league_id, event_id, player_id, average, scores, photos, frames)
    values (s.league_id, v_event, s.player_id, coalesce(p_average, 0), v_scores, v_photos, v_frames)
    returning id into v_entry;
  else
    update public.entries set scores = v_scores, photos = v_photos, frames = v_frames where id = e.id;
    v_entry := e.id;
  end if;
  update public.submissions set status = 'aprobado', event_id = v_event, reviewed_at = now(), reviewed_by = v_uid where id = s.id;
  -- La foto de un envío por fecha queda con el evento (se borra con él).
  if s.photo_id is not null then
    update public.photos set event_id = v_event where id = s.photo_id and event_id is null;
  end if;
  return jsonb_build_object('entry_id', v_entry, 'event_id', v_event);
end $$;

-- Admin: rechaza el envío, con una nota opcional para el jugador.
create function public.reject_submission(p_submission uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_league uuid := (select s.league_id from public.submissions s where s.id = p_submission);
begin
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  update public.submissions set status = 'rechazado', note = nullif(btrim(p_note), ''), reviewed_at = now(), reviewed_by = v_uid
   where id = p_submission;
end $$;

-- =====================================================================
-- En vivo
-- =====================================================================

-- El jugador publica los juegos que lleva anotados en el evento (o los quita, si no hay ninguno).
-- En un torneo solo publica quien está inscrito; en una práctica, cualquier jugador de la liga.
-- No cuentan hasta que se envían y se aprueban. p_op_id opcional (la cola manda solo el último).
create function public.publish_live(p_event uuid, p_scores jsonb, p_op_id uuid default null) returns void
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

-- Quita lo publicado en vivo: el propio jugador (p_player null) o un admin. Si no había nada, no es error.
create function public.delete_live(p_event uuid, p_player uuid default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
  v_mine uuid;
  v_player uuid;
begin
  perform private.require_uid();
  v_league := (select e.league_id from public.events e where e.id = p_event);
  if v_league is null then
    return false;
  end if;
  v_mine := private.my_player(v_league);
  v_player := coalesce(p_player, v_mine);
  if v_player is null or (v_player is distinct from v_mine and not private.is_admin(v_league)) then
    perform private.deny();
  end if;
  delete from public.live_states where event_id = p_event and subject_key = 'p:' || v_player::text;
  return found;
end $$;

-- =====================================================================
-- Social: me gusta, felicitar y comentarios (miembros; ligas sin menores)
-- =====================================================================

create function private.social_entry(p_entry uuid) returns public.entries
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.entries;
begin
  select * into e from public.entries x where x.id = p_entry;
  if e.id is null then
    perform private.fail('no_existe');
  end if;
  if not private.is_member(e.league_id) or (select l.has_minors from public.leagues l where l.id = e.league_id) then
    perform private.deny();
  end if;
  return e;
end $$;

create function private.my_display_name(p_league uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.display_name from public.league_members m where m.league_id = p_league and m.user_id = (select auth.uid())
$$;

-- Una reacción por persona y juego: 'like' o 'felicitar'; cambiarla la vuelve a avisar; null la quita.
create function public.set_reaction(p_entry uuid, p_type text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  e public.entries;
begin
  if p_type is null then
    delete from public.reactions where entry_id = p_entry and user_id = v_uid;
    return;
  end if;
  e := private.social_entry(p_entry);
  if p_type not in ('like', 'felicitar') then
    perform private.fail('invalido');
  end if;
  insert into public.reactions as r (league_id, entry_id, event_id, player_id, user_id, author_name, type)
  values (e.league_id, e.id, e.event_id, e.player_id, v_uid, private.my_display_name(e.league_id), p_type)
  on conflict (entry_id, user_id) do update set type = excluded.type, author_name = excluded.author_name, created_at = now();
end $$;

-- Quitar una reacción: su autor o un admin (al limpiar). Si ya no existe, devuelve false.
create function public.delete_reaction(p_reaction uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_league uuid;
  v_user uuid;
begin
  select r.league_id, r.user_id into v_league, v_user from public.reactions r where r.id = p_reaction;
  if v_league is null then
    return false;
  end if;
  if v_user <> v_uid and not private.is_admin(v_league) then
    perform private.deny();
  end if;
  delete from public.reactions where id = p_reaction;
  return true;
end $$;

-- Comentar el juego de alguien: de 1 a 500 letras, uno cada 3 s por persona y liga. No se editan.
create function public.add_comment(p_entry uuid, p_text text, p_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  e public.entries := private.social_entry(p_entry);
  v_text text := btrim(coalesce(p_text, ''));
  v_id uuid;
begin
  if char_length(v_text) not between 1 and 500 then
    perform private.fail('invalido');
  end if;
  perform private.check_pace(e.league_id, 'comment', 3);
  insert into public.comments (id, league_id, entry_id, event_id, player_id, user_id, author_name, text)
  values (coalesce(p_id, gen_random_uuid()), e.league_id, e.id, e.event_id, e.player_id, v_uid, private.my_display_name(e.league_id), v_text)
  returning id into v_id;
  return v_id;
end $$;

-- Borrar un comentario: su autor o un admin. Si ya no existe, devuelve false.
create function public.delete_comment(p_comment uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_league uuid;
  v_user uuid;
begin
  select c.league_id, c.user_id into v_league, v_user from public.comments c where c.id = p_comment;
  if v_league is null then
    return false;
  end if;
  if v_user <> v_uid and not private.is_admin(v_league) then
    perform private.deny();
  end if;
  delete from public.comments where id = p_comment;
  return true;
end $$;

-- Ritmo: una acción de este tipo cada p_secs segundos por cuenta y liga (si no, 'rate_limited').
create function private.check_pace(p_league uuid, p_kind text, p_secs integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.paces as p (user_id, league_id, kind, last_at) values (auth.uid(), p_league, p_kind, now())
  on conflict (user_id, league_id, kind) do update set last_at = excluded.last_at
   where p.last_at < now() - make_interval(secs => p_secs);
  if not found then
    perform private.fail('rate_limited');
  end if;
end $$;

-- =====================================================================
-- Buzón de sugerencias (anónimo)
-- =====================================================================

-- Miembro: deja una nota. No se guarda quién la escribió; el ritmo (una por minuto) va aparte, en private.
create function public.send_suggestion(p_league uuid, p_text text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_text text := btrim(coalesce(p_text, ''));
  v_id uuid;
begin
  perform private.require_uid();
  if not private.is_member(p_league) then
    perform private.deny();
  end if;
  if char_length(v_text) not between 1 and 1000 then
    perform private.fail('invalido');
  end if;
  perform private.check_pace(p_league, 'suggestion', 60);
  insert into public.suggestions (league_id, text) values (p_league, v_text) returning id into v_id;
  return v_id;
end $$;

-- Organizadores: marca notas como leídas (o no). Devuelve cuántas cambiaron.
create function public.mark_suggestions_read(p_ids uuid[], p_read boolean default true) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  perform private.require_uid();
  if exists (select 1 from public.suggestions s where s.id = any (p_ids) and not private.is_admin(s.league_id)) then
    perform private.deny();
  end if;
  update public.suggestions set read = coalesce(p_read, true) where id = any (p_ids) and read is distinct from coalesce(p_read, true);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create function public.delete_suggestion(p_suggestion uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select s.league_id from public.suggestions s where s.id = p_suggestion);
begin
  perform private.require_uid();
  if v_league is null then
    return false;
  end if;
  perform private.require_admin(v_league);
  delete from public.suggestions where id = p_suggestion;
  return true;
end $$;

-- =====================================================================
-- Push: los teléfonos de la cuenta suscritos a los recordatorios
-- =====================================================================

-- Guarda (o actualiza) este teléfono para la cuenta. Si el endpoint era de otra cuenta en el mismo
-- teléfono, pasa a esta (es quien tiene la sesión abierta). Solo servicios de push conocidos (CHECK).
create function public.upsert_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_id uuid;
begin
  insert into public.push_subscriptions as s (user_id, endpoint, p256dh, auth, ua)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(coalesce(p_ua, ''), 200))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
                                       ua = excluded.ua, fail_count = 0
  returning s.id into v_id;
  return v_id;
end $$;

-- Sin require_uid a propósito: una cuenta bloqueada también puede quitar las notificaciones de su teléfono.
create function public.delete_push_subscription(p_endpoint text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'no_permitido' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = v_uid;
  return found;
end $$;

-- =====================================================================
-- Servicio (solo service_role)
-- =====================================================================

-- «Mantener despierto» (fase 0C): una escritura real. La llama el respaldo diario con la clave secreta.
create function public.ping() returns timestamptz
language sql security definer set search_path = '' as $$
  insert into private.heartbeat (id, at) values (1, now()) on conflict (id) do update set at = excluded.at returning at;
$$;

-- =====================================================================
-- Permisos: nada abierto salvo lo que está en estas listas
-- =====================================================================
do $$
declare
  f record;
  v_authenticated constant text[] := array[
    'ensure_profile', 'rename_profile', 'set_superadmin', 'set_sport_status',
    'create_league', 'create_tournament', 'update_league', 'delete_league', 'transfer_ownership', 'renew_invite_code', 'join_league',
    'set_member_role', 'set_member_scorer', 'step_down_admin', 'remove_member', 'leave_league',
    'ensure_my_player', 'claim_player', 'create_player', 'update_player', 'set_player_private', 'delete_player',
    'link_account_to_player', 'unlink_account',
    'create_event', 'update_event', 'delete_event', 'add_practice_game', 'set_rsvp',
    'add_team', 'rename_team', 'delete_team', 'apply_teams',
    'add_entries', 'save_game', 'update_entry', 'update_entries', 'remove_entry', 'save_verified_games',
    'add_photo', 'delete_old_photos',
    'submit_games', 'set_submission_scan', 'approve_submission', 'reject_submission',
    'publish_live', 'delete_live',
    'set_reaction', 'delete_reaction', 'add_comment', 'delete_comment',
    'send_suggestion', 'mark_suggestions_read', 'delete_suggestion',
    'upsert_push_subscription', 'delete_push_subscription'
  ];
  -- Sin cuenta: solo ver a qué liga invita un código.
  v_anon constant text[] := array['invite_preview'];
  -- Helpers de private que usan las políticas (como el rol que consulta).
  v_policy_anon constant text[] := array['readable_leagues'];
  v_policy_auth constant text[] := array['readable_leagues', 'my_leagues', 'admin_leagues', 'is_super', 'can_upload_photo_path'];
begin
  for f in select p.oid::regprocedure as sig, n.nspname, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'private') and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' and f.proname = any (v_authenticated) then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.nspname = 'public' and f.proname = any (v_anon) then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    elsif f.nspname = 'private' and f.proname = any (v_policy_anon) then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    elsif f.nspname = 'private' and f.proname = any (v_policy_auth) then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
