-- MatchMate · Inscripciones de raqueta («Me apunto»): americanos (noches de puntos) y torneos con cupo, fecha
-- límite y lista de espera que sube sola. Pádel, tenis y pickleball.
--
-- Hoy los americanos se llenan con una lista de «16 cupos» en WhatsApp. Aquí la app lleva esa lista:
--
-- - Ajustes en events.config.signup (los escribe el admin con create_event / update_event, como el resto de la
--   configuración): {open: boolean, cap: 2–64 | null (sin tope), until: fecha y hora ISO | null, rev: número}.
--   En el torneo el cupo es por categoría. `rev` lo lleva la base (ver «La lista y los cambios del admin»).
--   Una vez puestos no se pueden quitar (se cierran con open = false); así la lista de espera nunca se pierde.
-- - La lista de inscritos es la de siempre y el admin la sigue armando a mano: config.players en la noche;
--   config.categories[].pairs en el torneo (parejas de la temporada en dobles, jugadores en individual). El cupo
--   cuenta a todos los de la lista (también los que el admin agregó a mano, gente sin la app).
-- - public.event_signups: quién se apuntó (status 'in', está en la lista) y la lista de espera ('wait', en orden de
--   queue_no: un número que sube siempre, así el orden no depende de la hora). Se lee como el resto de la liga; se
--   escribe solo por RPC.
-- - join_signup («Me apunto»): con la inscripción abierta, antes de la fecha límite y antes de empezar. En una liga
--   pública, quien no es miembro entra a la liga en el mismo paso. Si hay cupo entra a la lista; si no, a la espera.
--   En un torneo de dobles se apunta con su pareja (la que tiene, o eligiendo compañero: si esa pareja no existe,
--   se crea) y al compañero le llega un push «Te apuntaron». leave_signup («Ya no puedo»): el propio (de la lista
--   antes de empezar; de la espera, siempre) o el admin. set_signup (admin): meter a alguien a la lista (aunque
--   pase el cupo), ponerlo en espera o sacarlo. Sin cupo, la lista llega hasta 64 (lo que aguanta la noche; en el
--   torneo, por categoría) y lo demás va a la espera.
-- - Cuando se libera un cupo (alguien se baja, el admin saca a alguien o sube el cupo), el primero de la espera
--   entra solo y le llega un push «Entraste». No sube nadie si ya empezó (la noche publicó una ronda o se cerró; el
--   torneo armó grupos, cuadro o partidos) o si la fecha ya pasó.
--
-- La lista y los cambios del admin (trigger events_fill_signups, antes de los de cada deporte):
-- - Si el admin guarda la configuración con la lista al día (el mismo `rev`): quien estaba apuntado y ya no está
--   en la lista salió (se borra su inscripción); quien estaba en espera y el admin puso en la lista, entró (con push).
-- - Si guarda una configuración vieja (otro `rev`: alguien se apuntó mientras tanto), no se pierde a nadie: los
--   apuntados que falten vuelven a la lista.
-- - Después se llenan los cupos libres con la lista de espera y `rev` sube si la lista cambió.
--
-- Tiempo real: event:<evento> y league:<liga> con el evento 'signups' {op} (una vez por sentencia). La lista vive
-- en events.config: su cambio llega con el aviso 'events' de siempre.

-- =====================================================================
-- Tabla
-- =====================================================================

-- Orden de llegada (a la lista o a la espera): sube siempre, también dentro de una misma transacción.
create sequence private.signup_queue;

-- Una fila por inscrito (entrant_id = el jugador o la pareja de la temporada).
create table public.event_signups (
  event_id uuid not null,
  league_id uuid not null,
  entrant_id uuid not null,
  player_id uuid,
  team_id uuid,
  -- Categoría del torneo (id de config.categories); null en la noche.
  category text check (category ~ '^[A-Za-z0-9]{1,6}$'),
  status text not null check (status in ('in', 'wait')),
  -- Cuándo entró a la espera (o a la lista) y su turno: la espera va por queue_no.
  queued_at timestamptz not null default now(),
  queue_no bigint not null default nextval('private.signup_queue'),
  promoted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, entrant_id),
  check (num_nonnulls(player_id, team_id) = 1 and entrant_id = coalesce(player_id, team_id)),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade,
  foreign key (team_id, league_id) references public.teams (id, league_id) on delete cascade
);
create index event_signups_wait_idx on public.event_signups (event_id, status, queue_no);
create index event_signups_player_idx on public.event_signups (player_id);
create index event_signups_team_idx on public.event_signups (team_id);
create index event_signups_sync_idx on public.event_signups (league_id, updated_at);

create trigger event_signups_touch before update on public.event_signups for each row execute function private.touch_updated_at();
create trigger event_signups_tombstone after delete on public.event_signups for each row execute function private.tombstone('event_id', 'entrant_id');

alter table public.event_signups enable row level security;
create policy event_signups_read on public.event_signups for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
revoke all on public.event_signups from public, anon, authenticated;
grant select on public.event_signups to anon, authenticated;

-- =====================================================================
-- Funciones de ayuda
-- =====================================================================

-- Qué inscripción tiene el evento: 'night' (americano, mexicano o noche de una liga con noches de puntos: pádel y
-- el round robin del pickleball), 'tourney' (torneo de cualquier raqueta) o null (ninguna).
create function private.signup_kind(p_league uuid, p_type text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_type in ('americano', 'mexicano', 'noche') and private.night_league(p_league) then 'night'
    when p_type = 'torneo' and private.raq_sport(p_league) is not null then 'tourney'
  end
$$;

-- El torneo de la liga es de parejas: el pádel siempre; tenis y pickleball según leagues.rules.match.doubles (si
-- no lo dice, el tenis es individual y el pickleball en dobles). Igual que engineRules() en el teléfono.
create function private.signup_doubles(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when l.sport = 'padel' then true
    when jsonb_typeof(l.rules #> '{match,doubles}') = 'boolean' then (l.rules #>> '{match,doubles}')::boolean
    else l.sport = 'pickleball'
  end
  from public.leagues l where l.id = p_league
$$;

-- Tope de la lista: el cupo, o 64 sin cupo (lo que aguanta una noche; en el torneo, por categoría).
create function private.signup_cap(p jsonb) returns integer
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p -> 'cap') = 'number' then least(64, greatest(2, (p ->> 'cap')::numeric))::integer else 64 end
$$;

-- Ajustes de la inscripción saneados: {open, cap, until, rev}. 'invalido' si algo no sirve.
create function private.signup_clean(p jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_cap integer;
  v_until timestamptz;
  v_rev integer := 0;
begin
  if jsonb_typeof(p) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p) k where k not in ('open', 'cap', 'until', 'rev'))
     or coalesce(jsonb_typeof(p -> 'open'), 'null') not in ('boolean', 'null')
     or coalesce(jsonb_typeof(p -> 'cap'), 'null') not in ('number', 'null')
     or coalesce(jsonb_typeof(p -> 'until'), 'null') not in ('string', 'null')
     or coalesce(jsonb_typeof(p -> 'rev'), 'null') not in ('number', 'null') then
    perform private.fail('invalido');
  end if;
  if jsonb_typeof(p -> 'cap') = 'number' then
    if (p ->> 'cap')::numeric <> trunc((p ->> 'cap')::numeric) or (p ->> 'cap')::numeric not between 2 and 64 then
      perform private.fail('invalido');
    end if;
    v_cap := (p ->> 'cap')::integer;
  end if;
  if jsonb_typeof(p -> 'until') = 'string' then
    begin
      v_until := (p ->> 'until')::timestamptz;
    exception when others then
      v_until := null;
    end;
    if v_until is null or v_until not between '2000-01-01'::timestamptz and '2200-01-01'::timestamptz then
      perform private.fail('invalido');
    end if;
  end if;
  if jsonb_typeof(p -> 'rev') = 'number' then
    v_rev := least(2000000000, greatest(0, trunc((p ->> 'rev')::numeric)))::integer;
  end if;
  return jsonb_build_object('open', coalesce((p ->> 'open')::boolean, false), 'cap', v_cap, 'until', private.iso(v_until), 'rev', v_rev);
end $$;

-- La lista de inscritos del evento: (inscrito, categoría, puesto). Noche: config.players; torneo: las parejas (o
-- jugadores) de cada categoría. Los ids van como texto (una configuración vieja con algo raro no rompe nada).
create function private.signup_roster(p_kind text, p_config jsonb) returns table (entrant text, category text, pos integer)
language sql immutable set search_path = '' as $$
  select x #>> '{}', null::text, n::integer
    from jsonb_array_elements(case when p_kind = 'night' and jsonb_typeof(p_config -> 'players') = 'array' then p_config -> 'players' else '[]'::jsonb end)
         with ordinality as a (x, n)
  union all
  select y #>> '{}', c ->> 'id', m::integer
    from jsonb_array_elements(case when p_kind = 'tourney' and jsonb_typeof(p_config -> 'categories') = 'array' then p_config -> 'categories' else '[]'::jsonb end) c,
         jsonb_array_elements(case when jsonb_typeof(c) = 'object' and jsonb_typeof(c -> 'pairs') = 'array' then c -> 'pairs' else '[]'::jsonb end)
         with ordinality as b (y, m)
$$;

-- Huella de la lista (para saber si cambió): los inscritos en orden, con su categoría.
create function private.signup_roster_key(p_kind text, p_config jsonb) returns text
language sql immutable set search_path = '' as $$
  select coalesce(string_agg(coalesce(r.category, '') || ':' || r.entrant, ',' order by r.category nulls first, r.pos), '')
    from private.signup_roster(p_kind, p_config) r
$$;

-- La categoría que sirve: la pedida si existe; si no, la primera del torneo; null si no hay ninguna (o en la noche).
create function private.signup_category(p_kind text, p_config jsonb, p_category text) returns text
language sql immutable set search_path = '' as $$
  select case when p_kind <> 'tourney' or jsonb_typeof(p_config -> 'categories') is distinct from 'array' then null
    else coalesce(
      (select c ->> 'id' from jsonb_array_elements(p_config -> 'categories') c
        where jsonb_typeof(c) = 'object' and c ->> 'id' = p_category limit 1),
      (select c ->> 'id' from jsonb_array_elements(p_config -> 'categories') with ordinality as a (c, n)
        where jsonb_typeof(c) = 'object' and c ->> 'id' is not null order by n limit 1))
  end
$$;

-- Agrega al inscrito al final de la lista (en el torneo, al final de su categoría). Sin categoría: igual.
create function private.signup_add(p_kind text, p_config jsonb, p_entrant uuid, p_category text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_i integer;
begin
  if p_kind = 'night' then
    return jsonb_set(p_config, '{players}',
      (case when jsonb_typeof(p_config -> 'players') = 'array' then p_config -> 'players' else '[]'::jsonb end) || to_jsonb(p_entrant::text));
  end if;
  select n - 1 into v_i from jsonb_array_elements(case when jsonb_typeof(p_config -> 'categories') = 'array' then p_config -> 'categories' else '[]'::jsonb end)
         with ordinality as a (c, n)
   where jsonb_typeof(c) = 'object' and c ->> 'id' = private.signup_category(p_kind, p_config, p_category)
   order by n limit 1;
  if v_i is null then
    return p_config;
  end if;
  return jsonb_set(p_config, array['categories', v_i::text, 'pairs'],
    (case when jsonb_typeof(p_config #> array['categories', v_i::text, 'pairs']) = 'array' then p_config #> array['categories', v_i::text, 'pairs'] else '[]'::jsonb end)
    || to_jsonb(p_entrant::text));
end $$;

-- Saca al inscrito de la lista (de todas las categorías), sin cambiar el orden de los demás.
create function private.signup_remove(p_kind text, p_config jsonb, p_entrant uuid) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when p_kind = 'night' and jsonb_typeof(p_config -> 'players') = 'array' then
      jsonb_set(p_config, '{players}', (select coalesce(jsonb_agg(x order by n), '[]'::jsonb)
                                          from jsonb_array_elements(p_config -> 'players') with ordinality as a (x, n)
                                         where x #>> '{}' is distinct from p_entrant::text))
    when p_kind = 'tourney' and jsonb_typeof(p_config -> 'categories') = 'array' then
      jsonb_set(p_config, '{categories}', (select coalesce(jsonb_agg(
          case when jsonb_typeof(c) = 'object' and jsonb_typeof(c -> 'pairs') = 'array' then
            jsonb_set(c, '{pairs}', (select coalesce(jsonb_agg(y order by m), '[]'::jsonb)
                                       from jsonb_array_elements(c -> 'pairs') with ordinality as b (y, m)
                                      where y #>> '{}' is distinct from p_entrant::text))
          else c end order by n), '[]'::jsonb)
        from jsonb_array_elements(p_config -> 'categories') with ordinality as a (c, n)))
    else p_config
  end
$$;

-- Ya empezó: la noche publicó una ronda o se cerró; el torneo armó grupos o cuadro; o el evento ya tiene partidos.
create function private.signup_started(p_event uuid, p_kind text, p_config jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    exists (select 1 from public.matches m where m.event_id = p_event)
    or (p_kind = 'night' and (coalesce(p_config -> 'closed' = 'true'::jsonb, false)
                              or (jsonb_typeof(p_config -> 'round') = 'number' and (p_config ->> 'round')::numeric > 0)))
    or (p_kind = 'tourney' and jsonb_typeof(p_config -> 'categories') = 'array' and exists (
          select 1 from jsonb_array_elements(p_config -> 'categories') c
           where jsonb_typeof(c) = 'object'
             and ((jsonb_typeof(c -> 'groupsOf') = 'array' and jsonb_array_length(c -> 'groupsOf') > 0)
                  or (jsonb_typeof(c -> 'seeds') = 'array' and jsonb_array_length(c -> 'seeds') > 0)))),
    false)
$$;

-- Hoy en la zona de la liga.
create function private.signup_today(p_league uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce((select l.tz from public.leagues l where l.id = p_league), 'America/Santo_Domingo'))::date
$$;

-- Cuentas de un inscrito (su jugador o los de la pareja).
create function private.signup_users(p_entrant uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.user_id from public.players p where p.id = p_entrant and p.user_id is not null
  union
  select p.user_id from public.team_players tp join public.players p on p.id = tp.player_id
   where tp.team_id = p_entrant and p.user_id is not null
$$;

-- La cuenta es ese inscrito (su jugador) o juega en esa pareja.
create function private.signup_mine(p_entrant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (select auth.uid()) in (select private.signup_users(p_entrant))
$$;

-- Jugadores de un inscrito (él mismo, o los de la pareja).
create function private.signup_players(p_entrant uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.players p where p.id = p_entrant
  union
  select tp.player_id from public.team_players tp where tp.team_id = p_entrant
$$;

-- Nombre del evento para los avisos: el suyo, o «el torneo» / «la noche».
create function private.signup_title(e public.events) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(btrim(e.name), ''), case e.type when 'torneo' then 'el torneo' else 'la noche' end)
$$;

-- Push a las cuentas de un inscrito (menos la que hizo el cambio), con el link al evento. Nunca frena la escritura.
create function private.signup_send(e public.events, p_entrant uuid, p_title text, p_body text, p_tag text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tag text := left(p_tag || ':' || e.id::text || ':' || p_entrant::text, 100);
begin
  insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
  select u, left(p_title, 200), left(p_body, 1000), '/l/' || e.league_id::text || '/e/' || e.id::text, v_tag, 172800, 'high'
    from private.signup_users(p_entrant) u
   where u is distinct from (select auth.uid());
  if exists (select 1 from public.push_outbox o where o.tag = v_tag and o.sent_at is null) then
    perform private.kick_send_push();
  end if;
exception when others then
  raise warning 'push de la inscripción % de %: %', p_entrant, e.id, sqlerrm;
end $$;

-- Push a quien entró desde la lista de espera.
create function private.signup_push(e public.events, p_entrant uuid) returns void
language sql security definer set search_path = '' as $$
  select private.signup_send(e, p_entrant,
    'Entraste: ' || private.signup_title(e),
    'Se liberó un cupo y ya estás en la lista (' || to_char(e.date, 'DD/MM') || '). Si al final no puedes, bájate en la app para que entre otro.',
    'cupo')
$$;

-- =====================================================================
-- La lista y los cambios del admin (trigger en events)
-- =====================================================================
-- Se llama events_fill_signups para correr antes que events_padel_check / events_raq_check (van por orden
-- alfabético): así player_count se cuenta con la lista ya llena.
create function private.signup_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := private.signup_kind(new.league_id, new.type);
  v_s jsonb;
  v_old_rev integer := 0;
  v_fresh boolean := true;
  v_cap integer;
  v_next uuid;
  v_cat text;
  v_promoted uuid[] := '{}';
  r record;
begin
  if v_kind is null then
    return new;
  end if;
  if jsonb_typeof(new.config -> 'signup') is distinct from 'object' then
    if tg_op = 'UPDATE' and jsonb_typeof(old.config -> 'signup') = 'object' then
      -- Los ajustes no se quitan (se cierran con open = false): la lista de espera nunca se pierde. Quien guardó
      -- sin ellos no sabía de la inscripción: su lista se trata como vieja (nadie apuntado se pierde).
      new.config := jsonb_set(new.config, '{signup}', old.config -> 'signup');
      v_fresh := false;
    elsif coalesce(jsonb_typeof(new.config -> 'signup'), 'null') = 'null' then
      new.config := new.config - 'signup';
      return new;
    else
      perform private.fail('invalido');
    end if;
  end if;
  v_s := private.signup_clean(new.config -> 'signup');
  if tg_op = 'INSERT' then
    new.config := jsonb_set(new.config, '{signup}', v_s || jsonb_build_object('rev', 0));
    return new;
  end if;
  if jsonb_typeof(old.config -> 'signup') = 'object' then
    v_old_rev := coalesce((old.config #>> '{signup,rev}')::integer, 0);
    v_fresh := v_fresh and (v_s ->> 'rev')::integer = v_old_rev;
  end if;

  if v_fresh then
    -- Lista al día: quien estaba apuntado y el admin sacó, salió.
    delete from public.event_signups s
     where s.event_id = new.id and s.status = 'in'
       and not exists (select 1 from private.signup_roster(v_kind, new.config) x where x.entrant = s.entrant_id::text);
  else
    -- Lista vieja: nadie apuntado se pierde.
    for r in select s.entrant_id, s.category from public.event_signups s
              where s.event_id = new.id and s.status = 'in'
                and not exists (select 1 from private.signup_roster(v_kind, new.config) x where x.entrant = s.entrant_id::text)
              order by s.queue_no loop
      new.config := private.signup_add(v_kind, new.config, r.entrant_id, r.category);
    end loop;
  end if;

  -- Quien estaba en espera y el admin puso en la lista: entró.
  with up as (
    update public.event_signups s set status = 'in', promoted_at = now(), queue_no = nextval('private.signup_queue')
     where s.event_id = new.id and s.status = 'wait'
       and exists (select 1 from private.signup_roster(v_kind, new.config) x where x.entrant = s.entrant_id::text)
    returning s.entrant_id
  )
  select coalesce(array_agg(up.entrant_id), '{}') into v_promoted from up;

  -- Torneo: la categoría de cada inscrito es donde está en la lista.
  if v_kind = 'tourney' then
    update public.event_signups s set category = x.category
      from private.signup_roster(v_kind, new.config) x
     where s.event_id = new.id and x.entrant = s.entrant_id::text and s.status = 'in' and s.category is distinct from x.category;
  end if;

  -- Cupos libres: entra el primero de la espera (en el torneo, por categoría).
  v_cap := private.signup_cap(v_s);
  if not private.signup_started(new.id, v_kind, new.config) and new.date >= private.signup_today(new.league_id) then
    loop
      v_next := null;
      select s.entrant_id, private.signup_category(v_kind, new.config, s.category) into v_next, v_cat
        from public.event_signups s
       where s.event_id = new.id and s.status = 'wait'
         and (v_kind = 'night' or private.signup_category(v_kind, new.config, s.category) is not null)
         and (select count(*) from private.signup_roster(v_kind, new.config) x
               where v_kind = 'night' or x.category = private.signup_category(v_kind, new.config, s.category)) < v_cap
       order by s.queue_no
       limit 1;
      exit when v_next is null;
      update public.event_signups s set status = 'in', promoted_at = now(), category = v_cat, queue_no = nextval('private.signup_queue')
       where s.event_id = new.id and s.entrant_id = v_next;
      new.config := private.signup_add(v_kind, new.config, v_next, v_cat);
      v_promoted := v_promoted || v_next;
    end loop;
  end if;

  new.config := jsonb_set(new.config, '{signup}', v_s || jsonb_build_object('rev',
    case when private.signup_roster_key(v_kind, new.config) is distinct from private.signup_roster_key(v_kind, old.config) then v_old_rev + 1 else v_old_rev end));
  foreach v_next in array v_promoted loop
    perform private.signup_push(new, v_next);
  end loop;
  return new;
end $$;

create trigger events_fill_signups before insert or update of config, date on public.events
  for each row execute function private.signup_sync();

-- La inscripción solo existe en una noche o un torneo de raqueta; en la noche es de jugadores; en el torneo, de
-- parejas de la temporada (dobles) o de jugadores (individual). También para service_role.
create function private.signup_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := private.signup_kind(new.league_id, (select e.type from public.events e where e.id = new.event_id));
begin
  if v_kind is null then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Solo en un americano o un torneo de raqueta.';
  end if;
  if (v_kind = 'night' or not private.signup_doubles(new.league_id)) and new.player_id is null then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Aquí se apunta cada jugador.';
  end if;
  if v_kind = 'tourney' and private.signup_doubles(new.league_id)
     and (new.team_id is null or exists (select 1 from public.teams t where t.id = new.team_id and t.event_id is not null)) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'En dobles se apunta la pareja.';
  end if;
  return new;
end $$;

create trigger event_signups_guard before insert or update of event_id, league_id, player_id, team_id on public.event_signups
  for each row execute function private.signup_guard();

-- =====================================================================
-- RPC
-- =====================================================================

-- «Me apunto». Con sesión; en una liga pública quien no es miembro entra a la liga en el mismo paso (privada:
-- 'no_permitido'). La inscripción tiene que estar abierta, antes de la fecha límite, del evento que no ha pasado
-- ni empezado ('cerrado'). Noche y torneo individual: se apunta su jugador. Torneo de dobles: su pareja (p_team, o
-- la única que tiene) o con p_partner (un jugador de la liga): si esa pareja no existe, se crea. p_category: la
-- categoría del torneo (con una sola, no hace falta). Alguien de ese inscrito ya está en otro: 'duplicado'.
-- Si hay cupo entra a la lista; si no, a la espera. Ya apuntado: lo mismo (no repite).
-- Devuelve {status: 'in' | 'wait', position (en la lista o en la espera), entrant_id, category}.
create function public.join_signup(p_event uuid, p_category text default null, p_partner uuid default null, p_team uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  e public.events;
  v_kind text;
  v_s jsonb;
  v_me uuid;
  v_entrant uuid;
  v_doubles boolean := false;
  v_players uuid[];
  v_cat text;
  v_status text;
  v_count integer;
  v_row public.event_signups;
  v_name text;
begin
  select * into e from public.events x where x.id = p_event for update;
  if not found or e.league_id not in (select private.readable_leagues()) then
    perform private.fail('no_existe');
  end if;
  v_kind := private.signup_kind(e.league_id, e.type);
  if v_kind is null or jsonb_typeof(e.config -> 'signup') is distinct from 'object' then
    perform private.fail('invalido');
  end if;
  v_s := e.config -> 'signup';
  if not private.is_member(e.league_id) then
    if not exists (select 1 from public.leagues l where l.id = e.league_id and l.visibility = 'public') then
      perform private.deny();
    end if;
    perform public.join_league(p_league => e.league_id);
  end if;
  v_me := private.ensure_player(e.league_id, v_uid, null);

  -- Quién se apunta.
  if v_kind = 'tourney' and private.signup_doubles(e.league_id) then
    v_doubles := true;
    if p_team is not null then
      if not exists (select 1 from public.teams t join public.team_players tp on tp.team_id = t.id
                      where t.id = p_team and t.league_id = e.league_id and t.event_id is null and tp.player_id = v_me) then
        perform private.fail('invalido');
      end if;
      v_entrant := p_team;
    elsif p_partner is not null then
      if p_partner = v_me or not exists (select 1 from public.players p where p.id = p_partner and p.league_id = e.league_id) then
        perform private.fail('invalido');
      end if;
      select t.id into v_entrant from public.teams t
       where t.league_id = e.league_id and t.event_id is null
         and exists (select 1 from public.team_players tp where tp.team_id = t.id and tp.player_id = v_me)
         and exists (select 1 from public.team_players tp where tp.team_id = t.id and tp.player_id = p_partner)
         and (select count(*) from public.team_players tp where tp.team_id = t.id) = 2
       order by t.sort_order, t.created_at, t.id
       limit 1;
    else
      select case when count(*) = 1 then min(t.id::text)::uuid end into v_entrant
        from public.teams t join public.team_players tp on tp.team_id = t.id
       where t.league_id = e.league_id and t.event_id is null and tp.player_id = v_me;
      if v_entrant is null then
        perform private.fail('invalido');
      end if;
    end if;
  elsif p_team is not null or p_partner is not null then
    perform private.fail('invalido');
  else
    v_entrant := v_me;
  end if;

  -- Ya apuntado: lo mismo de antes.
  if v_entrant is not null then
    select * into v_row from public.event_signups s where s.event_id = p_event and s.entrant_id = v_entrant;
  end if;
  if v_row.entrant_id is null then
    if not coalesce((v_s ->> 'open')::boolean, false)
       or (v_s ->> 'until') is not null and (v_s ->> 'until')::timestamptz <= now()
       or private.signup_started(e.id, v_kind, e.config)
       or e.date < private.signup_today(e.league_id) then
      perform private.fail('cerrado');
    end if;
    v_cat := null;
    if v_kind = 'tourney' then
      if p_category is null then
        if (select count(*) from jsonb_array_elements(case when jsonb_typeof(e.config -> 'categories') = 'array' then e.config -> 'categories' else '[]'::jsonb end) c
             where jsonb_typeof(c) = 'object' and c ->> 'id' is not null) = 1 then
          v_cat := private.signup_category(v_kind, e.config, null);
        end if;
      elsif exists (select 1 from jsonb_array_elements(case when jsonb_typeof(e.config -> 'categories') = 'array' then e.config -> 'categories' else '[]'::jsonb end) c
                     where jsonb_typeof(c) = 'object' and c ->> 'id' = p_category) then
        v_cat := p_category;
      end if;
      if v_cat is null then
        perform private.fail('invalido');
      end if;
    end if;
    -- La pareja nueva (con el compañero elegido).
    if v_entrant is null then
      perform private.check_pace(e.league_id, 'pareja', 10);
      select left(me.name || ' / ' || pa.name, 60) into v_name
        from public.players me, public.players pa where me.id = v_me and pa.id = p_partner;
      insert into public.teams (league_id, event_id, name, sort_order)
      values (e.league_id, null, private.clean_name(v_name),
              coalesce((select max(t.sort_order) from public.teams t where t.league_id = e.league_id and t.event_id is null), 0) + 1)
      returning id into v_entrant;
      insert into public.team_players (team_id, player_id, league_id, role)
      values (v_entrant, v_me, e.league_id, 'player'), (v_entrant, p_partner, e.league_id, 'player');
    end if;
    -- Nadie del inscrito puede estar dos veces en el evento.
    v_players := array(select private.signup_players(v_entrant));
    if exists (
      select 1 from (
        select s.entrant_id::text as id from public.event_signups s where s.event_id = p_event
        union
        select x.entrant from private.signup_roster(v_kind, e.config) x
      ) o
      where o.id <> v_entrant::text
        and (o.id = any (array(select a::text from unnest(v_players) a))
             or exists (select 1 from public.team_players tp where tp.team_id::text = o.id and tp.player_id = any (v_players)))) then
      perform private.fail('duplicado');
    end if;
    -- El admin ya lo tenía en la lista: queda apuntado, sin tocar la lista.
    if exists (select 1 from private.signup_roster(v_kind, e.config) x where x.entrant = v_entrant::text) then
      v_status := 'in';
      v_cat := coalesce((select x.category from private.signup_roster(v_kind, e.config) x where x.entrant = v_entrant::text limit 1), v_cat);
    else
      select count(*) into v_count from private.signup_roster(v_kind, e.config) x where v_kind = 'night' or x.category = v_cat;
      v_status := case when v_count < private.signup_cap(v_s) then 'in' else 'wait' end;
    end if;
    insert into public.event_signups (event_id, league_id, entrant_id, player_id, team_id, category, status, created_by)
    values (p_event, e.league_id, v_entrant, case when v_doubles then null else v_entrant end, case when v_doubles then v_entrant end,
            v_cat, v_status, v_uid)
    returning * into v_row;
    if v_status = 'in' and not exists (select 1 from private.signup_roster(v_kind, e.config) x where x.entrant = v_entrant::text) then
      update public.events x set config = private.signup_add(v_kind, x.config, v_entrant, v_cat) where x.id = p_event
      returning * into e;
    end if;
    -- Dobles: al compañero le llega que lo apuntaron (y si quedaron en la lista o en la espera).
    if v_doubles then
      perform private.signup_send(e, v_entrant,
        'Te apuntaron: ' || private.signup_title(e),
        coalesce((select p.name from public.players p where p.id = v_me), 'Tu pareja') || ' los apuntó como pareja' ||
          case when v_status = 'in' then '.' else ' (en la lista de espera: si se libera un cupo, entran solos).' end ||
          ' Si no pueden, bájense en la app.',
        'pareja');
    end if;
  end if;

  return jsonb_build_object(
    'status', v_row.status,
    'entrant_id', v_row.entrant_id,
    'category', v_row.category,
    'position', case when v_row.status = 'in'
      then (select min(x.pos) from private.signup_roster(v_kind, e.config) x where x.entrant = v_row.entrant_id::text)
      else (select count(*) from public.event_signups s
             where s.event_id = p_event and s.status = 'wait' and s.category is not distinct from v_row.category
               and s.queue_no <= v_row.queue_no) end);
end $$;

-- «Ya no puedo»: el propio inscrito (de la lista, antes de empezar; de la espera, siempre) o el admin (siempre).
-- Sin p_entrant: el de la cuenta en ese evento (su jugador o su pareja). Sale de la lista o de la espera; si deja
-- un cupo, entra el primero de la espera. false si no estaba.
create function public.leave_signup(p_event uuid, p_entrant uuid default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v_kind text;
  v_admin boolean;
  v_entrant uuid := p_entrant;
  v_row boolean;
  v_listed boolean;
begin
  perform private.require_uid();
  select * into e from public.events x where x.id = p_event for update;
  if not found or e.league_id not in (select private.readable_leagues()) then
    perform private.fail('no_existe');
  end if;
  v_kind := private.signup_kind(e.league_id, e.type);
  if v_kind is null then
    perform private.fail('invalido');
  end if;
  v_admin := private.is_admin(e.league_id);
  if v_entrant is null then
    select case when count(*) = 1 then min(o.id)::uuid end into v_entrant from (
      select s.entrant_id::text as id from public.event_signups s where s.event_id = p_event
      union
      select x.entrant from private.signup_roster(v_kind, e.config) x
    ) o
    where o.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and private.signup_mine(o.id::uuid);
    if v_entrant is null then
      return false;
    end if;
  end if;
  if not v_admin then
    if not private.signup_mine(v_entrant) then
      perform private.deny();
    end if;
    -- Ya empezado, de la lista solo saca el admin; de la espera se puede salir siempre.
    if private.signup_started(e.id, v_kind, e.config)
       and exists (select 1 from private.signup_roster(v_kind, e.config) x where x.entrant = v_entrant::text) then
      perform private.fail('cerrado');
    end if;
  end if;
  delete from public.event_signups s where s.event_id = p_event and s.entrant_id = v_entrant;
  v_row := found;
  v_listed := exists (select 1 from private.signup_roster(v_kind, e.config) x where x.entrant = v_entrant::text);
  if v_listed then
    update public.events x set config = private.signup_remove(v_kind, x.config, v_entrant) where x.id = p_event;
  end if;
  return v_row or v_listed;
end $$;

-- Admin: p_status 'in' mete al inscrito a la lista (aunque pase el cupo; si estaba en espera, le llega el push),
-- 'wait' lo pone al final de la espera (si estaba en la lista, sale de ella) y null lo saca. En el torneo,
-- p_category lo pone (o lo cambia) de categoría. El inscrito: jugador de la liga (noche o torneo individual) o
-- pareja de la temporada (torneo de dobles). Devuelve cómo quedó: 'in', 'wait' o null.
create function public.set_signup(p_event uuid, p_entrant uuid, p_status text, p_category text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  e public.events;
  v_kind text;
  v_doubles boolean := false;
  v_row public.event_signups;
  v_listed boolean;
  v_where text;
  v_cat text;
  v_config jsonb;
begin
  select * into e from public.events x where x.id = p_event for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(e.league_id);
  v_kind := private.signup_kind(e.league_id, e.type);
  if v_kind is null or jsonb_typeof(e.config -> 'signup') is distinct from 'object' or p_entrant is null
     or (p_status is not null and p_status not in ('in', 'wait')) then
    perform private.fail('invalido');
  end if;
  v_doubles := v_kind = 'tourney' and private.signup_doubles(e.league_id);
  if not (case when v_doubles
               then exists (select 1 from public.teams t where t.id = p_entrant and t.league_id = e.league_id and t.event_id is null)
               else exists (select 1 from public.players p where p.id = p_entrant and p.league_id = e.league_id) end) then
    perform private.fail('invalido');
  end if;
  select * into v_row from public.event_signups s where s.event_id = p_event and s.entrant_id = p_entrant;
  v_listed := exists (select 1 from private.signup_roster(v_kind, e.config) x where x.entrant = p_entrant::text);
  select x.category into v_where from private.signup_roster(v_kind, e.config) x where x.entrant = p_entrant::text order by x.category nulls first, x.pos limit 1;
  if v_kind = 'tourney' then
    if p_category is not null and private.signup_category(v_kind, e.config, p_category) is distinct from p_category then
      perform private.fail('invalido');
    end if;
    v_cat := private.signup_category(v_kind, e.config, coalesce(p_category, v_where, v_row.category));
    if v_cat is null and p_status is not null then
      perform private.fail('invalido');
    end if;
  end if;
  v_config := e.config;
  if p_status is null then
    delete from public.event_signups s where s.event_id = p_event and s.entrant_id = p_entrant;
    v_config := private.signup_remove(v_kind, v_config, p_entrant);
  elsif p_status = 'wait' then
    insert into public.event_signups as s (event_id, league_id, entrant_id, player_id, team_id, category, status, created_by)
    values (p_event, e.league_id, p_entrant, case when v_doubles then null else p_entrant end, case when v_doubles then p_entrant end,
            v_cat, 'wait', v_uid)
    on conflict (event_id, entrant_id) do update set
      status = 'wait',
      category = excluded.category,
      queued_at = case when s.status = 'wait' then s.queued_at else now() end,
      queue_no = case when s.status = 'wait' then s.queue_no else nextval('private.signup_queue') end,
      promoted_at = case when s.status = 'wait' then s.promoted_at end;
    v_config := private.signup_remove(v_kind, v_config, p_entrant);
  else
    -- Estaba en espera: se queda así hasta que entra a la lista (el trigger lo pasa a la lista y le avisa).
    if v_row.entrant_id is null then
      insert into public.event_signups (event_id, league_id, entrant_id, player_id, team_id, category, status, created_by)
      values (p_event, e.league_id, p_entrant, case when v_doubles then null else p_entrant end, case when v_doubles then p_entrant end,
              v_cat, 'in', v_uid);
    elsif v_row.status = 'wait' and v_listed and v_where is not distinct from v_cat then
      -- Ya estaba en la lista (a mano) y quedó en espera: se arregla sin tocar la lista.
      update public.event_signups s set status = 'in', promoted_at = now(), category = v_cat, queue_no = nextval('private.signup_queue')
       where s.event_id = p_event and s.entrant_id = p_entrant;
    elsif v_row.status = 'in' then
      update public.event_signups s set category = v_cat where s.event_id = p_event and s.entrant_id = p_entrant and s.category is distinct from v_cat;
    end if;
    if not v_listed or v_where is distinct from v_cat then
      v_config := private.signup_add(v_kind, private.signup_remove(v_kind, v_config, p_entrant), p_entrant, v_cat);
    end if;
  end if;
  if v_config is distinct from e.config then
    update public.events x set config = v_config where x.id = p_event;
  end if;
  return (select s.status from public.event_signups s where s.event_id = p_event and s.entrant_id = p_entrant);
end $$;

-- =====================================================================
-- Tiempo real: event:<evento> y league:<liga> 'signups' {op} (una vez por sentencia)
-- =====================================================================
create function private.signup_emit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then
    for r in select distinct o.event_id, o.league_id from old_rows o loop
      if not private.deleting(r.league_id) then
        perform private.emit('event:' || r.event_id::text, 'signups', jsonb_build_object('op', 'delete'));
        perform private.emit('league:' || r.league_id::text, 'signups', jsonb_build_object('op', 'delete', 'event_id', r.event_id));
      end if;
    end loop;
  else
    for r in select distinct n.event_id, n.league_id from new_rows n loop
      perform private.emit('event:' || r.event_id::text, 'signups', jsonb_build_object('op', lower(tg_op)));
      perform private.emit('league:' || r.league_id::text, 'signups', jsonb_build_object('op', lower(tg_op), 'event_id', r.event_id));
    end loop;
  end if;
  return null;
end $$;

create trigger event_signups_emit_insert after insert on public.event_signups referencing new table as new_rows
  for each statement execute function private.signup_emit();
create trigger event_signups_emit_update after update on public.event_signups referencing new table as new_rows
  for each statement execute function private.signup_emit();
create trigger event_signups_emit_delete after delete on public.event_signups referencing old table as old_rows
  for each statement execute function private.signup_emit();

-- =====================================================================
-- Permisos: cerrado todo lo de esta migración; las RPC, solo con sesión
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array['join_signup', 'leave_signup', 'set_signup'];
  v_private constant text[] := array[
    'signup_kind', 'signup_doubles', 'signup_cap', 'signup_clean', 'signup_roster', 'signup_roster_key', 'signup_category', 'signup_add',
    'signup_remove', 'signup_started', 'signup_today', 'signup_users', 'signup_mine', 'signup_players', 'signup_title', 'signup_send', 'signup_push',
    'signup_sync', 'signup_guard', 'signup_emit'
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
