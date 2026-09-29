-- MatchMate · Organizador: lo que le ahorra trabajo (y sustos) al dueño y a los admins de una liga.
--
-- 1. Ligas públicas que invitan a entrar (C8). public_leagues_feed(p_sport, p_query, p_limit, p_offset): las ligas
--    públicas sin menores que siguen vivas (una liga cuya temporada ya terminó o un torneo cuyo último evento o
--    partido fue hace más de 7 días no sale), las más activas primero (juegos, resultados y eventos de los últimos
--    30 días; después más miembros; después las más nuevas). También sin cuenta: 120 llamadas cada 10 minutos por IP.
--    Tope de creación: una cuenta (no el superadmin) crea hasta 5 ligas o torneos por día y 20 cada 30 días
--    (trigger leagues_quota: 'rate_limited' el del día y 'rate_limited: mes' el de 30 días). Sin sesión
--    (service_role: el importador de BowlingX, SQL) no cuenta.
-- 2. Pendientes del organizador (C9). league_pending(p_league): envíos por aprobar, partidos reclamados, partidos
--    cuya hora pasó sin resultado, reclamos de jugadores y listas de espera, cada uno con su enlace, y los
--    «primeros pasos» de una liga nueva.
-- 3. Menos jugadores repetidos (C12). merge_league_players(p_league, p_keep, p_drop): el admin junta dos jugadores
--    de su liga con private.merge_players (la misma unión de los reclamos: 'conflicto: …' si chocan). Si solo el que
--    se va tiene cuenta, la cuenta pasa al que queda. merge_league_players_preview: lo mismo sin cambiar nada.
-- 4. Menores en todos los deportes (C13). create_player pide, para un menor, el nombre del padre, madre o tutor, su
--    teléfono (opcional) y su permiso (p_consent): sin permiso o sin tutor, 'invalido'. Todo va a player_private
--    (solo lo leen los admins; columna nueva guardian_phone), como en natación. set_player_minor lo cambia después
--    (update_player ya no marca a nadie como menor). Al quedar como menor, su reclamo pendiente se rechaza.
-- 5. Suspender un día (C14). suspend_day_preview(p_league, p_date) y suspend_day(p_league, p_date, p_reason,
--    p_new_date): los partidos de ese día (en la zona de la liga) pasan a la nueva fecha a la misma hora, o quedan
--    aplazados; los eventos (boliche, rondas de golf, encuentros de natación, noches) pasan a la nueva fecha o, sin
--    fecha, se cancelan (se borran) si no tienen nada adentro (ni inscritos, «voy», juegos enviados, fotos, en vivo,
--    equipos, programa de natación, escalera ni pistas). Lo que ya tiene resultados (o juegos por aprobar) no se
--    toca. Los retos de la escalera de ese día no vencen por la suspensión (su plazo se alarga). Después, UN aviso a
--    la liga con league_announce («Se suspende el martes 29 de septiembre: lluvia. Nueva fecha: …»), si algo cambió.
-- 6. Pistas del boliche (C15). public.event_lanes: la pista (y el orden) de cada jugador en un evento. assign_lanes
--    las arma (por promedio, por equipo o al azar), set_player_lane mueve a uno, clear_lanes las borra y
--    publish_lanes avisa por push a cada jugador con cuenta «Tu pista: 7 · <evento>».
--
-- Contrato completo: supabase/README.md («Organizador»).

-- =====================================================================
-- Ayudas comunes
-- =====================================================================

-- 'martes 29 de septiembre' (para los avisos).
create function private.org_day(p date) returns text
language sql immutable set search_path = '' as $$
  select (array['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'])[extract(dow from p)::integer + 1]
      || ' ' || extract(day from p)::integer || ' de '
      || (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre',
                'diciembre'])[extract(month from p)::integer]
$$;

-- Nombre de un evento para un aviso: el suyo, o 'Práctica del martes 29 de septiembre'.
create function private.org_event_label(p_event uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(e.name), ''),
                  case e.type when 'practica' then 'Práctica' when 'torneo' then 'Torneo' when 'encuentro' then 'Encuentro'
                              else initcap(replace(e.type, '_', ' ')) end || ' del ' || private.org_day(e.date))
    from public.events e where e.id = p_event
$$;

-- 'Los Tigres vs Las Águilas' (los dos lados del partido).
create function private.org_match_label(p_match uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(string_agg(s.label, ' vs ' order by s.side), 'Partido') from public.match_sides s where s.match_id = p_match
$$;

-- =====================================================================
-- 1. Ligas públicas (C8)
-- =====================================================================

-- Llamadas sin cuenta al listado cada 10 minutos (por IP).
create function private.feed_anon_limit() returns integer
language sql immutable set search_path = '' as $$
  select 120
$$;

-- Lo hecho en la liga en los últimos 30 días: juegos (participaciones y envíos), resultados de partidos, tarjetas de
-- golf, tiempos de natación y eventos del mes. Cada conteo usa el índice de su tabla.
create function private.league_activity30(p_league uuid, p_today date) returns integer
language sql stable security definer set search_path = '' as $$
  select ((select count(*) from public.entries x where x.league_id = p_league and x.updated_at > now() - interval '30 days')
        + (select count(*) from public.submissions x where x.league_id = p_league and x.created_at > now() - interval '30 days')
        + (select count(*) from public.matches x
            where x.league_id = p_league and x.status in ('finished', 'confirmed', 'walkover') and x.updated_at > now() - interval '30 days')
        + (select count(*) from public.golf_cards x where x.league_id = p_league and x.scored_at > now() - interval '30 days')
        + (select count(*) from public.swim_entries x where x.league_id = p_league and x.result_at > now() - interval '30 days')
        + (select count(*) from public.events x where x.league_id = p_league and x.date between p_today - 30 and p_today))::integer
$$;

-- Ligas públicas vivas, las más activas primero. Ver el encabezado. Devuelve una lista (vacía si no hay):
-- [{id, name, sport, kind, venue, schedule, members, players, activity, nextEventAt, nextEventDate, lastActivityAt,
--   seasonEnd, createdAt}]. nextEventAt: el próximo evento (a su hora, o a las 00:00 de la liga si no tiene) o
-- partido programado; nextEventDate: ese día en la zona de la liga ('YYYY-MM-DD'). p_query busca en el nombre y el
-- lugar (sin acentos). p_limit 1–50 (30), p_offset 0–5000. La línea «24 jugadores · juega el martes» la arma el
-- teléfono con estos datos.
create function public.public_leagues_feed(p_sport text default null, p_query text default null, p_limit integer default 30,
                                           p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
  v_q text := private.normalize_name(left(coalesce(p_query, ''), 60));
  v_limit integer := private.clamp_int(p_limit, 1, 50, 30);
  v_offset integer := private.clamp_int(p_offset, 0, 5000, 0);
begin
  if auth.uid() is null then
    v_key := private.rate_key('feed');
    if private.rate_blocked(v_key, private.feed_anon_limit(), interval '10 minutes') then
      perform private.fail('rate_limited');
    end if;
    perform private.rate_hit(v_key, interval '10 minutes');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'name', s.name, 'sport', s.sport, 'kind', s.kind, 'venue', s.venue, 'schedule', s.schedule,
             'members', s.members, 'players', (select count(*) from public.players p where p.league_id = s.id)::integer,
             'activity', s.activity, 'nextEventAt', private.iso(s.next_at), 'nextEventDate', (s.next_at at time zone s.tz)::date,
             'lastActivityAt', private.iso(private.league_last_activity(s.id)), 'seasonEnd', s.season_end,
             'createdAt', private.iso(s.created_at))
           order by s.activity desc, s.members desc, s.created_at desc, s.id)
      from (
        -- Solo la página pedida lleva jugadores y última actividad (lo demás hace falta para ordenar).
        select a.*
          from (
            select l.id, l.name, l.sport, l.kind, l.venue, l.schedule, l.season_end, l.tz, l.created_at,
                   (select count(*) from public.league_members m where m.league_id = l.id)::integer as members,
                   private.league_activity30(l.id, t.today) as activity,
                   least(
                     (select min((e.date + coalesce(e.start_time, time '00:00')) at time zone l.tz) from public.events e
                       where e.league_id = l.id and e.date >= t.today),
                     (select min(m.scheduled_at) from public.matches m
                       where m.league_id = l.id and m.status in ('scheduled', 'live')
                         and m.scheduled_at >= (t.today::timestamp at time zone l.tz))) as next_at,
                   -- Terminada: la temporada ya pasó; un torneo, 7 días después de su último evento o partido.
                   coalesce(case when l.kind = 'torneo'
                                 then coalesce(greatest(
                                        (select max(e.date) from public.events e where e.league_id = l.id),
                                        (select max((m.scheduled_at at time zone l.tz)::date) from public.matches m
                                          where m.league_id = l.id and m.status <> 'void')),
                                      l.season_end) < t.today - 7
                                 else l.season_end < t.today end, false) as finished
              from public.leagues l
             cross join lateral (select (now() at time zone l.tz)::date as today) t
             where l.visibility = 'public' and not l.has_minors
               and (p_sport is null or l.sport = p_sport)
               and (v_q = '' or private.normalize_name(l.name || ' ' || l.venue) like '%' || v_q || '%')
          ) a
         where not a.finished
         order by a.activity desc, a.members desc, a.created_at desc, a.id
         offset v_offset limit v_limit
      ) s), '[]'::jsonb);
end $$;

-- ---------- Tope de ligas y torneos nuevos por cuenta ----------
-- Registro de lo que creó cada cuenta (los últimos 30 días). No se borra con la liga: crear y borrar también cuenta.
create table private.league_creations (
  user_id uuid not null references public.profiles (id) on delete cascade,
  league_id uuid not null,
  created_at timestamptz not null default now()
);
create index league_creations_user_idx on private.league_creations (user_id, created_at);

create function private.league_day_limit() returns integer
language sql immutable set search_path = '' as $$
  select 5
$$;

create function private.league_month_limit() returns integer
language sql immutable set search_path = '' as $$
  select 20
$$;

-- Con sesión (y sin ser superadmin): hasta 5 por día y 20 cada 30 días. Sin sesión (service_role, SQL) no cuenta.
-- El de 30 días sale como 'rate_limited: mes' (el teléfono no dice «prueba mañana»: puede tardar días).
create function private.league_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or private.is_super() then
    return new;
  end if;
  -- Dos ligas a la vez de la misma cuenta esperan una a la otra: la cuenta es exacta.
  perform pg_advisory_xact_lock(hashtext('mm:league_quota:' || v_uid::text));
  delete from private.league_creations c where c.user_id = v_uid and c.created_at <= now() - interval '30 days';
  if (select count(*) from private.league_creations c where c.user_id = v_uid) >= private.league_month_limit() then
    raise exception 'rate_limited: mes' using errcode = 'P0001', detail = 'Hasta 20 ligas o torneos cada 30 días.';
  end if;
  if (select count(*) from private.league_creations c where c.user_id = v_uid and c.created_at > now() - interval '1 day')
       >= private.league_day_limit() then
    raise exception 'rate_limited' using errcode = 'P0001', detail = 'Hasta 5 ligas o torneos por día.';
  end if;
  insert into private.league_creations (user_id, league_id)
  select v_uid, new.id where exists (select 1 from public.profiles p where p.id = v_uid);
  return new;
end $$;

create trigger leagues_quota before insert on public.leagues for each row execute function private.league_quota();

-- =====================================================================
-- 2. Pendientes del organizador (C9)
-- =====================================================================

-- Una liga es nueva (muestra los «primeros pasos») sus primeros 30 días.
create function private.young_league_days() returns integer
language sql immutable set search_path = '' as $$
  select 30
$$;

-- La liga ya tiene un resultado anotado (un juego, un partido terminado, una tarjeta de golf o un tiempo).
create function private.league_has_result(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.entries x where x.league_id = p_league and exists (select 1 from unnest(x.scores) s where s is not null))
      or exists (select 1 from public.matches x where x.league_id = p_league and x.status in ('finished', 'confirmed', 'walkover'))
      or exists (select 1 from public.golf_cards x where x.league_id = p_league and x.scored_at is not null)
      or exists (select 1 from public.swim_entries x where x.league_id = p_league and x.result_at is not null)
$$;

-- Admin: lo que espera por él en su liga. Cada sección: {count, url, items: [hasta 5, lo más viejo primero]}.
-- {total,
--  submissions: {count, url, items: [{id, playerId, playerName, eventId, eventName, date, games, hasPhoto, createdAt}]},
--  disputes:    {count, url, items: [{id, label, sides, scheduledAt, disputedAt, note, url}]},
--  overdue:     {count, url, items: [{id, label, sides, status, scheduledAt, url}]}   (programado, en juego o suspendido
--                y su hora pasó hace más de 3 horas, sin anotador activo),
--  claims:      {count, url, items: [{id, playerId, playerName, claimantName, note, createdAt}]},
--  waitlists:   {count, url, items: [{eventId, name, date, waiting, url}]}   (eventos de hoy en adelante con lista de espera),
--  checklist:   null | {complete, done, total, steps: [{key: 'invite'|'players'|'schedule'|'result', label, done, url}]}}
-- total = la suma de los count (el número de la pestaña Admin). checklist solo en los primeros 30 días de la liga.
create function public.league_pending(p_league uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.leagues;
  v_today date;
  v_base text := '/l/' || p_league::text;
  v_subs jsonb;
  v_disputes jsonb;
  v_overdue jsonb;
  v_claims jsonb;
  v_waits jsonb;
  v_steps jsonb;
  v_checklist jsonb;
begin
  perform private.require_uid();
  perform private.require_admin(p_league);
  select * into l from public.leagues x where x.id = p_league;
  if l.id is null then
    perform private.fail('no_existe');
  end if;
  v_today := (now() at time zone l.tz)::date;

  select jsonb_build_object('count', count(*), 'url', v_base || '/admin?tab=aprobar',
           'items', coalesce(jsonb_agg(jsonb_build_object(
             'id', x.id, 'playerId', x.player_id, 'playerName', x.player_name, 'eventId', x.event_id, 'eventName', x.event_name,
             'date', x.day, 'games', x.games, 'hasPhoto', x.photo_id is not null, 'createdAt', private.iso(x.created_at))
             order by x.created_at, x.id) filter (where x.rn <= 5), '[]'::jsonb))
    into v_subs
    from (select s.id, s.player_id, p.name as player_name, s.event_id, e.name as event_name, coalesce(e.date, s.date) as day,
                 cardinality(s.scores) as games, s.photo_id, s.created_at,
                 row_number() over (order by s.created_at, s.id) as rn
            from public.submissions s
            join public.players p on p.id = s.player_id
            left join public.events e on e.id = s.event_id
           where s.league_id = p_league and s.status = 'pendiente') x;

  select jsonb_build_object('count', count(*), 'url', v_base || '/juegos',
           'items', coalesce(jsonb_agg(jsonb_build_object(
             'id', x.id, 'label', private.org_match_label(x.id),
             'sides', (select coalesce(jsonb_agg(s.label order by s.side), '[]'::jsonb) from public.match_sides s where s.match_id = x.id),
             'scheduledAt', private.iso(x.scheduled_at), 'disputedAt', private.iso(x.disputed_at), 'note', x.dispute_note,
             'url', v_base || '/juegos?partido=' || x.id::text)
             order by x.disputed_at nulls last, x.id) filter (where x.rn <= 5), '[]'::jsonb))
    into v_disputes
    from (select m.id, m.scheduled_at, m.disputed_at, m.dispute_note,
                 row_number() over (order by m.disputed_at nulls last, m.id) as rn
            from public.matches m
           where m.league_id = p_league and m.status = 'disputed') x;

  select jsonb_build_object('count', count(*), 'url', v_base || '/juegos',
           'items', coalesce(jsonb_agg(jsonb_build_object(
             'id', x.id, 'label', private.org_match_label(x.id),
             'sides', (select coalesce(jsonb_agg(s.label order by s.side), '[]'::jsonb) from public.match_sides s where s.match_id = x.id),
             'status', x.status, 'scheduledAt', private.iso(x.scheduled_at), 'url', v_base || '/juegos?partido=' || x.id::text)
             order by x.scheduled_at, x.id) filter (where x.rn <= 5), '[]'::jsonb))
    into v_overdue
    from (select m.id, m.status, m.scheduled_at, row_number() over (order by m.scheduled_at, m.id) as rn
            from public.matches m
           where m.league_id = p_league and m.status in ('scheduled', 'live', 'suspended')
             and m.scheduled_at < now() - interval '3 hours'
             and (m.lease_until is null or m.lease_until < now())) x;

  select jsonb_build_object('count', count(*), 'url', v_base || '/admin?tab=reclamos',
           'items', coalesce(jsonb_agg(jsonb_build_object(
             'id', x.id, 'playerId', x.player_id, 'playerName', x.player_name, 'claimantName', x.claimant_name, 'note', x.note,
             'createdAt', private.iso(x.created_at))
             order by x.created_at, x.id) filter (where x.rn <= 5), '[]'::jsonb))
    into v_claims
    from (select c.id, c.player_id, coalesce(p.name, c.player_name) as player_name, c.claimant_name, c.note, c.created_at,
                 row_number() over (order by c.created_at, c.id) as rn
            from public.player_claims c
            left join public.players p on p.id = c.player_id
           where c.league_id = p_league and c.status = 'pending') x;

  select jsonb_build_object('count', count(*), 'url', v_base,
           'items', coalesce(jsonb_agg(jsonb_build_object(
             'eventId', x.id, 'name', private.org_event_label(x.id), 'date', x.date, 'waiting', x.waiting,
             'url', v_base || '/e/' || x.id::text)
             order by x.date, x.id) filter (where x.rn <= 5), '[]'::jsonb))
    into v_waits
    from (select e.id, e.date, w.waiting, row_number() over (order by e.date, e.id) as rn
            from public.events e
            cross join lateral (select count(*)::integer as waiting from public.event_signups s
                                 where s.event_id = e.id and s.status = 'wait') w
           where e.league_id = p_league and e.date >= v_today and w.waiting > 0) x;

  if l.created_at > now() - make_interval(days => private.young_league_days()) then
    v_steps := jsonb_build_array(
      jsonb_build_object('key', 'invite', 'label', 'Invita a alguien a la liga', 'url', v_base || '/admin?tab=miembros',
        'done', (select count(*) from public.league_members m where m.league_id = p_league) > 1),
      jsonb_build_object('key', 'players', 'label', 'Agrega a los jugadores', 'url', v_base || '/admin?tab=jugadores',
        'done', (select count(*) from public.players p where p.league_id = p_league) > 1),
      jsonb_build_object('key', 'schedule', 'label', 'Crea el primer evento o partido', 'url', v_base,
        'done', exists (select 1 from public.events e where e.league_id = p_league)
             or exists (select 1 from public.matches m where m.league_id = p_league)),
      jsonb_build_object('key', 'result', 'label', 'Anota el primer resultado', 'url', v_base,
        'done', private.league_has_result(p_league)));
    v_checklist := jsonb_build_object(
      'done', (select count(*) from jsonb_array_elements(v_steps) s where (s ->> 'done')::boolean)::integer,
      'total', jsonb_array_length(v_steps),
      'steps', v_steps);
    v_checklist := v_checklist || jsonb_build_object('complete', (v_checklist ->> 'done')::integer = jsonb_array_length(v_steps));
  end if;

  return jsonb_build_object(
    'total', (v_subs ->> 'count')::integer + (v_disputes ->> 'count')::integer + (v_overdue ->> 'count')::integer
           + (v_claims ->> 'count')::integer + (v_waits ->> 'count')::integer,
    'submissions', v_subs,
    'disputes', v_disputes,
    'overdue', v_overdue,
    'claims', v_claims,
    'waitlists', v_waits,
    'checklist', v_checklist);
end $$;

-- =====================================================================
-- 3. Juntar jugadores repetidos (C12)
-- =====================================================================

-- Pistas del boliche (sección 6): la tabla va antes porque private.merge_players la mueve.
create table public.event_lanes (
  event_id uuid not null,
  player_id uuid not null,
  league_id uuid not null,
  lane smallint not null check (lane between 1 and 999),
  -- Orden en la pista (1 = tira primero).
  position smallint not null default 1 check (position between 1 and 99),
  -- Cuándo se avisó por última vez (publish_lanes). null = cambió y no se ha avisado.
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, player_id),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade
);
create index event_lanes_lane_idx on public.event_lanes (event_id, lane, position);
create index event_lanes_player_idx on public.event_lanes (player_id);
create index event_lanes_sync_idx on public.event_lanes (league_id, updated_at);

-- Igual que en 20260929000100_reclamos.sql y además mueve las pistas del boliche (si los dos tienen pista en el mismo
-- evento, queda la del que se queda).
create or replace function private.merge_players(p_from uuid, p_into uuid, p_league uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_conf jsonb := private.claim_conflicts(p_from, p_into);
  v_list text;
  v_from text := p_from::text;
  v_into text := p_into::text;
  v_left boolean;
  f record;
begin
  if jsonb_array_length(v_conf) > 0 then
    select string_agg((x ->> 'label') || ' (' || (x ->> 'count') || ')', ', ') into v_list from jsonb_array_elements(v_conf) x;
    raise exception 'conflicto: %', v_list using errcode = 'P0001';
  end if;

  -- Boliche: participaciones con sus felicitaciones y comentarios en UNA sentencia (la FK compuesta de
  -- reactions/comments a entries se revisa al final de la sentencia).
  with r as (update public.reactions x set player_id = p_into where x.player_id = p_from returning 1),
       c as (update public.comments x set player_id = p_into where x.player_id = p_from returning 1)
  update public.entries e set player_id = p_into where e.player_id = p_from;
  update public.submissions s set player_id = p_into where s.player_id = p_from;
  -- «Voy», en vivo y pistas: si los dos tienen, queda el del reclamado.
  delete from public.event_rsvps a where a.player_id = p_from
     and exists (select 1 from public.event_rsvps c where c.event_id = a.event_id and c.player_id = p_into);
  update public.event_rsvps r set player_id = p_into where r.player_id = p_from;
  delete from public.live_states a where a.player_id = p_from
     and exists (select 1 from public.live_states c where c.event_id = a.event_id and c.player_id = p_into);
  update public.live_states s set player_id = p_into, subject_key = 'p:' || v_into where s.player_id = p_from;
  delete from public.event_lanes a where a.player_id = p_from
     and exists (select 1 from public.event_lanes c where c.event_id = a.event_id and c.player_id = p_into);
  update public.event_lanes x set player_id = p_into where x.player_id = p_from;
  -- Datos privados (año, sexo, tutor) y ficha de nadador: se queda la del reclamado si tiene.
  if exists (select 1 from public.player_private x where x.player_id = p_into) then
    delete from public.player_private x where x.player_id = p_from;
  else
    update public.player_private x set player_id = p_into where x.player_id = p_from;
  end if;
  if exists (select 1 from public.swim_swimmers x where x.player_id = p_into) then
    delete from public.swim_swimmers x where x.player_id = p_from;
  else
    update public.swim_swimmers x set player_id = p_into where x.player_id = p_from;
  end if;
  -- Partidos y equipos (las plantillas antes que las sanciones: su trigger mira la plantilla).
  update public.match_players x set player_id = p_into where x.player_id = p_from;
  delete from public.match_rsvps a where a.player_id = p_from
     and exists (select 1 from public.match_rsvps c where c.match_id = a.match_id and c.player_id = p_into);
  update public.match_rsvps x set player_id = p_into where x.player_id = p_from;
  delete from public.team_players a where a.player_id = p_from
     and exists (select 1 from public.team_players c where c.team_id = a.team_id and c.player_id = p_into);
  update public.team_players x set player_id = p_into where x.player_id = p_from;
  update public.football_sanctions x set player_id = p_into where x.player_id = p_from;
  -- Golf, natación, escalera e inscripciones (entrant_id = el jugador).
  update public.golf_cards x set player_id = p_into where x.player_id = p_from;
  update public.swim_entries x set player_id = p_into where x.player_id = p_from;
  update public.ladder_rungs x set player_id = p_into, entrant_id = p_into where x.player_id = p_from;
  update public.ladder_challenges x set
    challenger = case when x.challenger = p_from then p_into else x.challenger end,
    challenged = case when x.challenged = p_from then p_into else x.challenged end,
    winner = case when x.winner = p_from then p_into else x.winner end
   where x.league_id = p_league and p_from in (x.challenger, x.challenged, x.winner);
  update public.event_signups x set player_id = p_into, entrant_id = p_into where x.player_id = p_from;
  update public.game_likes x set player_id = p_into where x.player_id = p_from;
  -- Ids dentro de jsonb (anotador, historial, rondas de las noches, competencia del golf).
  update public.matches m set state = replace(m.state::text, v_from, v_into)::jsonb,
                              history = replace(m.history::text, v_from, v_into)::jsonb,
                              score = replace(m.score::text, v_from, v_into)::jsonb
   where m.league_id = p_league
     and (coalesce(m.state::text, '') || m.history::text || coalesce(m.score::text, '')) like '%' || v_from || '%';
  update public.events e set config = replace(e.config::text, v_from, v_into)::jsonb
   where e.league_id = p_league and e.config::text like '%' || v_from || '%';
  update public.golf_rounds g set competition = replace(g.competition::text, v_from, v_into)::jsonb
   where g.league_id = p_league and g.competition::text like '%' || v_from || '%';
  -- Pedidos viejos del jugador propio (p. ej. la cuenta ya había reclamado otro jugador y ahora junta un
  -- duplicado que el admin anotó dos veces): son historia de un jugador que se borra.
  delete from public.player_claims x where x.player_id = p_from;

  for f in
    select c.conrelid::regclass as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute pid on pid.attrelid = c.confrelid and pid.attname = 'id'
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[array_position(c.confkey, pid.attnum)]
     where c.contype = 'f' and c.confrelid = 'public.players'::regclass
  loop
    execute format('select exists (select 1 from %s where %I = $1)', f.tbl, f.col) into v_left using p_from;
    if v_left then
      raise exception 'conflicto: %', f.tbl::text using errcode = 'P0001';
    end if;
  end loop;
  delete from public.players p where p.id = p_from;
end $$;

-- Por qué no se pueden juntar (null = sí se puede): 'dos_cuentas' (los dos tienen cuenta) o 'menor_con_cuenta'
-- (uno es menor y el otro tiene cuenta: un menor nunca queda con una cuenta).
create function private.merge_block(k public.players, d public.players) returns text
language sql immutable set search_path = '' as $$
  select case
    when k.user_id is not null and d.user_id is not null then 'dos_cuentas'
    when (k.is_minor or d.is_minor) and coalesce(k.user_id, d.user_id) is not null then 'menor_con_cuenta'
  end
$$;

-- Admin: antes de juntar, lo que pasaría. {canMerge, reason: null | 'dos_cuentas' | 'menor_con_cuenta',
-- conflicts: [{what, label, count}], moveAccount (la cuenta del que se va pasa al que queda),
-- keep: {id, name, userId, isMinor}, drop: {id, name, userId, isMinor}}. Los dos de la liga ('no_existe' si no) y
-- distintos ('invalido').
create function public.merge_league_players_preview(p_league uuid, p_keep uuid, p_drop uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  k public.players;
  d public.players;
  v_reason text;
  v_conf jsonb;
begin
  perform private.require_uid();
  perform private.require_admin(p_league);
  if p_keep is null or p_drop is null or p_keep = p_drop then
    perform private.fail('invalido');
  end if;
  select * into k from public.players p where p.id = p_keep and p.league_id = p_league;
  select * into d from public.players p where p.id = p_drop and p.league_id = p_league;
  if k.id is null or d.id is null then
    perform private.fail('no_existe');
  end if;
  v_reason := private.merge_block(k, d);
  v_conf := private.claim_conflicts(p_drop, p_keep);
  return jsonb_build_object(
    'canMerge', v_reason is null and jsonb_array_length(v_conf) = 0,
    'reason', v_reason,
    'conflicts', v_conf,
    'moveAccount', v_reason is null and d.user_id is not null,
    'keep', jsonb_build_object('id', k.id, 'name', k.name, 'userId', k.user_id, 'isMinor', k.is_minor),
    'drop', jsonb_build_object('id', d.id, 'name', d.name, 'userId', d.user_id, 'isMinor', d.is_minor));
end $$;

-- Admin: junta p_drop en p_keep (el que queda). Todo lo de p_drop pasa a p_keep y p_drop se borra (private.merge_players:
-- 'conflicto: <qué choca> (n), …' si los dos jugaron el mismo evento o partido, y no cambia nada). Si solo p_drop tiene
-- cuenta, la cuenta pasa a p_keep. Los dos con cuenta, o un menor con una cuenta: 'invalido'. Si uno era menor, el que
-- queda es menor, con los datos privados (tutor, permiso) de los dos. Lo que le falte al que queda (promedio fijo,
-- atributos del deporte como el Index o el nivel) sale del otro. Su reclamo pendiente pasa al que queda; si el que
-- queda es menor, los reclamos pendientes se rechazan (un menor no se reclama). Queda en la auditoría
-- ('merge_players'). Devuelve {playerId (el que queda), removedId, userId (su cuenta o null)}.
create function public.merge_league_players(p_league uuid, p_keep uuid, p_drop uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k public.players;
  d public.players;
begin
  perform private.require_uid();
  perform private.require_admin(p_league);
  if p_keep is null or p_drop is null or p_keep = p_drop then
    perform private.fail('invalido');
  end if;
  -- Los dos bloqueados en orden de id (dos admins a la vez no se traban).
  perform 1 from public.players p where p.id in (p_keep, p_drop) order by p.id for update;
  select * into k from public.players p where p.id = p_keep and p.league_id = p_league;
  select * into d from public.players p where p.id = p_drop and p.league_id = p_league;
  if k.id is null or d.id is null then
    perform private.fail('no_existe');
  end if;
  if private.merge_block(k, d) is not null then
    perform private.fail('invalido');
  end if;
  -- Menor si alguno lo era (antes de juntar los datos privados: un año de menor solo va en un menor). El trigger
  -- players_minor_claims rechaza su reclamo pendiente.
  if d.is_minor and not k.is_minor then
    update public.players p set is_minor = true where p.id = p_keep;
  end if;
  -- Promedio fijo y atributos del deporte: lo que le falte al que queda, del otro (lo suyo gana).
  update public.players p set average_override = coalesce(p.average_override, d.average_override), attrs = d.attrs || p.attrs
   where p.id = p_keep and ((p.average_override is null and d.average_override is not null) or d.attrs <> '{}'::jsonb);
  -- Datos privados: lo que le falte al que queda, del otro.
  update public.player_private x set
    birth_year = coalesce(x.birth_year, o.birth_year),
    sex = coalesce(x.sex, o.sex),
    guardian_name = coalesce(x.guardian_name, o.guardian_name),
    guardian_phone = coalesce(x.guardian_phone, o.guardian_phone),
    consent_by = case when x.consent_at is null then o.consent_by else x.consent_by end,
    consent_at = coalesce(x.consent_at, o.consent_at)
   from public.player_private o
   where x.player_id = p_keep and o.player_id = p_drop;
  -- Quien había pedido ser el que se va, ahora pide ser el que queda (si nadie más lo pidió y no tiene cuenta).
  if k.user_id is null and d.user_id is null
     and not exists (select 1 from public.player_claims c where c.player_id = p_keep and c.status = 'pending') then
    update public.player_claims c set player_id = p_keep, player_name = left(k.name, 60)
     where c.player_id = p_drop and c.status = 'pending';
  end if;
  -- Un menor no se reclama: lo pendiente del que queda (también lo que venía del otro) queda rechazado.
  if k.is_minor or d.is_minor then
    perform private.reject_minor_claims(p_keep);
  end if;
  perform private.merge_players(p_drop, p_keep, p_league);
  if d.user_id is not null then
    update public.players p set user_id = d.user_id where p.id = p_keep;
  end if;
  perform private.audit('merge_players', 'league', p_league::text, jsonb_build_object(
    'keep', p_keep, 'drop', p_drop, 'keepName', k.name, 'dropName', d.name, 'userId', d.user_id));
  return jsonb_build_object('playerId', p_keep, 'removedId', p_drop, 'userId', coalesce(k.user_id, d.user_id));
end $$;

-- =====================================================================
-- 4. Menores en todos los deportes (C13)
-- =====================================================================
-- Teléfono del padre, madre o tutor (solo lo ven los admins, como el resto de player_private). Dígitos y +.
alter table public.player_private
  add column guardian_phone text check (guardian_phone ~ '^[0-9+]{1,20}$');

-- Tutor de un menor, validado: nombre 1–60 (obligatorio), teléfono con dígitos y + (opcional; se quitan espacios,
-- guiones, puntos y paréntesis) y el permiso (obligatorio). Devuelve {name, phone}. Si algo falta: 'invalido'.
create function private.guardian(p_name text, p_phone text, p_consent boolean) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g'), '');
begin
  if not coalesce(p_consent, false) or char_length(v_name) not between 1 and 60
     or (v_phone is not null and v_phone !~ '^[0-9+]{1,20}$') then
    perform private.fail('invalido');
  end if;
  return jsonb_build_object('name', v_name, 'phone', v_phone);
end $$;

-- Ahora pide, para un menor, el tutor y su permiso (antes el permiso se daba por hecho). Mismos parámetros que en
-- 20260926000500_rpc.sql y, al final, p_guardian_phone y p_consent.
drop function public.create_player(uuid, text, double precision, boolean, text, uuid);

-- Admin: jugador de la lista, sin cuenta. Menor (p_is_minor): solo en ligas con menores ('invalido' si no), con el
-- nombre del padre, madre o tutor, su teléfono (opcional) y su permiso (p_consent = true); queda quién lo registró y
-- cuándo. Todo eso va a player_private (solo lo leen los admins). Para quien no es menor, los datos del tutor no se
-- guardan.
create function public.create_player(
  p_league uuid,
  p_name text,
  p_average_override double precision default null,
  p_is_minor boolean default false,
  p_guardian_name text default null,
  p_id uuid default null,
  p_guardian_phone text default null,
  p_consent boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_guardian jsonb;
begin
  perform private.require_uid();
  perform private.require_admin(p_league);
  if coalesce(p_is_minor, false) then
    v_guardian := private.guardian(p_guardian_name, p_guardian_phone, p_consent);
  end if;
  insert into public.players (id, league_id, name, average_override, is_minor)
  values (coalesce(p_id, gen_random_uuid()), p_league, private.clean_name(p_name), p_average_override, coalesce(p_is_minor, false))
  returning id into v_id;
  if v_guardian is not null then
    insert into public.player_private (player_id, league_id, guardian_name, guardian_phone, consent_by, consent_at)
    values (v_id, p_league, v_guardian ->> 'name', v_guardian ->> 'phone', auth.uid(), now());
  end if;
  return v_id;
end $$;

-- Admin: marca (o desmarca) a un jugador de la lista como menor, con su tutor y el permiso (igual que create_player).
-- Menor: sin cuenta y en una liga con menores ('invalido' si no). Desmarcarlo deja los datos del tutor (y un año de
-- nacimiento de menor no lo deja: 'invalido').
create function public.set_player_minor(p_player uuid, p_is_minor boolean, p_guardian_name text default null,
                                        p_guardian_phone text default null, p_consent boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  p public.players;
  v_guardian jsonb;
begin
  select * into p from public.players x where x.id = p_player for update;
  if p.id is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(p.league_id);
  if p_is_minor is null then
    perform private.fail('invalido');
  end if;
  if not p_is_minor then
    update public.players x set is_minor = false where x.id = p_player and x.is_minor;
    return;
  end if;
  v_guardian := private.guardian(p_guardian_name, p_guardian_phone, p_consent);
  if p.user_id is not null then
    perform private.fail('invalido');
  end if;
  update public.players x set is_minor = true where x.id = p_player and not x.is_minor;
  insert into public.player_private as x (player_id, league_id, guardian_name, guardian_phone, consent_by, consent_at)
  values (p_player, p.league_id, v_guardian ->> 'name', v_guardian ->> 'phone', v_uid, now())
  on conflict (player_id) do update set guardian_name = excluded.guardian_name, guardian_phone = excluded.guardian_phone,
                                        consent_by = excluded.consent_by, consent_at = excluded.consent_at;
end $$;

-- Un menor no se reclama (approve_claim diría 'invalido' para siempre): los pedidos pendientes de ese jugador quedan
-- rechazados, así quien lo pidió lo ve decidido y no queda colgado en los pendientes del admin.
create function private.reject_minor_claims(p_player uuid) returns void
language sql security definer set search_path = '' as $$
  update public.player_claims c set status = 'rejected', decided_at = now(),
         decision_note = 'Es menor de edad: un menor no queda con una cuenta.'
   where c.player_id = p_player and c.status = 'pending'
$$;

-- Al quedar como menor por cualquier camino (set_player_minor, juntar jugadores o por debajo de las RPC).
create function private.players_minor_claims() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.reject_minor_claims(new.id);
  return null;
end $$;

create trigger players_minor_claims after update of is_minor on public.players
  for each row when (new.is_minor and not old.is_minor) execute function private.players_minor_claims();

-- Igual que en 20260926000500_rpc.sql, pero ya no marca a nadie como menor: eso pide el tutor y su permiso y va por
-- set_player_minor ('invalido' aquí). Tampoco escribe un permiso del tutor que nadie dio. Quitar la marca sigue igual.
create or replace function public.update_player(p_player uuid, p_patch jsonb) returns void
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
  if (p_patch -> 'is_minor') = 'true'::jsonb and not (select p.is_minor from public.players p where p.id = p_player) then
    perform private.fail('invalido');
  end if;
  update public.players p set
    name = case when p_patch ? 'name' then private.clean_name(p_patch ->> 'name') else p.name end,
    average_override = case when p_patch ? 'average_override' then (p_patch ->> 'average_override')::double precision else p.average_override end,
    is_minor = case when p_patch ? 'is_minor' then (p_patch -> 'is_minor')::boolean else p.is_minor end,
    attrs = case when p_patch ? 'attrs' then p_patch -> 'attrs' else p.attrs end
  where p.id = p_player;
end $$;

-- =====================================================================
-- 5. Suspender un día (C14)
-- =====================================================================

-- El evento ya tiene resultados (juegos, juegos enviados por aprobar, tarjetas de golf, tiempos, partidos jugados) o
-- está cerrado.
create function private.event_has_results(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.entries x where x.event_id = p_event and exists (select 1 from unnest(x.scores) s where s is not null))
      or exists (select 1 from public.submissions x where x.event_id = p_event and x.status = 'pendiente')
      or exists (select 1 from public.golf_cards x where x.event_id = p_event and x.scored_at is not null)
      or exists (select 1 from public.golf_rounds x where x.event_id = p_event and x.status = 'cerrada')
      or exists (select 1 from public.swim_entries x where x.event_id = p_event and x.result_at is not null)
      or exists (select 1 from public.swim_meets x where x.event_id = p_event and x.finalized_at is not null)
      or exists (select 1 from public.matches x where x.event_id = p_event and x.status not in ('scheduled', 'postponed', 'void'))
$$;

-- El evento tiene algo que se perdería al borrarlo (todo lo que cuelga de events con on delete cascade): inscritos,
-- envíos (con su foto), fotos, juegos en vivo, quien dijo «voy», equipos del evento, tarjetas de golf, el programa y
-- los nadadores de natación, la escalera (puestos y retos), partidos, apuntados o pistas.
create function private.event_has_content(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.entries x where x.event_id = p_event)
      or exists (select 1 from public.submissions x where x.event_id = p_event)
      or exists (select 1 from public.photos x where x.event_id = p_event)
      or exists (select 1 from public.live_states x where x.event_id = p_event)
      or exists (select 1 from public.event_rsvps x where x.event_id = p_event and x.going)
      or exists (select 1 from public.teams x where x.event_id = p_event)
      or exists (select 1 from public.golf_cards x where x.event_id = p_event)
      or exists (select 1 from public.swim_events x where x.event_id = p_event)
      or exists (select 1 from public.swim_entries x where x.event_id = p_event)
      or exists (select 1 from public.ladder_rungs x where x.event_id = p_event)
      or exists (select 1 from public.ladder_challenges x where x.event_id = p_event)
      or exists (select 1 from public.matches x where x.event_id = p_event)
      or exists (select 1 from public.event_signups x where x.event_id = p_event)
      or exists (select 1 from public.event_lanes x where x.event_id = p_event)
$$;

-- Lo de ese día en la liga (partidos por su hora en la zona de la liga; eventos por su fecha). Los anulados no salen.
-- kind 'match' | 'event'; sub: la familia del partido ('racket' | 'team') o el tipo de evento ('bowling' | 'golf' |
-- 'swim' | 'event'). locked: no se toca (reason 'en_juego' o 'con_resultado'). content: el evento tiene inscritos
-- u otra cosa que se perdería al cancelarlo.
create function private.suspend_plan(p_league uuid, p_date date)
returns table (kind text, id uuid, label text, sub text, status text, at timestamptz, start_time time, locked boolean,
               reason text, content boolean)
language sql stable security definer set search_path = '' as $$
  select 'match', m.id, private.org_match_label(m.id), private.league_family(m.league_id), m.status, m.scheduled_at, null::time,
         m.status not in ('scheduled', 'postponed', 'suspended'),
         case when m.status = 'live' then 'en_juego' when m.status not in ('scheduled', 'postponed', 'suspended') then 'con_resultado' end,
         true
    from public.matches m join public.leagues l on l.id = m.league_id
   where m.league_id = p_league and m.status <> 'void'
     and m.scheduled_at >= (p_date::timestamp at time zone l.tz) and m.scheduled_at < ((p_date + 1)::timestamp at time zone l.tz)
  union all
  select 'event', e.id, private.org_event_label(e.id),
         case when l.sport = 'bowling' then 'bowling'
              when exists (select 1 from public.golf_rounds g where g.event_id = e.id) then 'golf'
              when exists (select 1 from public.swim_meets s where s.event_id = e.id) then 'swim'
              else 'event' end,
         null, (e.date + coalesce(e.start_time, time '00:00')) at time zone l.tz, e.start_time,
         r.has, case when r.has then 'con_resultado' end, private.event_has_content(e.id)
    from public.events e join public.leagues l on l.id = e.league_id
   cross join lateral (select private.event_has_results(e.id) as has) r
   where e.league_id = p_league and e.date = p_date
$$;

-- Admin: lo que cambiaría al suspender ese día (no cambia nada).
-- {date,
--  matches: [{id, label, sub, status, scheduledAt, locked, reason}],
--  events:  [{id, label, sub, startTime, locked, reason, content}],
--  counts:  {matches, bowlingEvents, golfRounds, swimMeets, otherEvents, locked}   (lo que se puede cambiar, por tipo),
--  withNewDate: {matches, events}   (lo que pasa a la nueva fecha),
--  withoutDate: {postponed, cancelled, kept}}   (partidos que quedan aplazados; eventos que se cancelan porque no tienen
--                nada adentro, y los que se quedan porque tienen algo adentro (inscritos, «voy», partidos…) y
--                necesitan una fecha)
create function public.suspend_day_preview(p_league uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_uid();
  perform private.require_admin(p_league);
  if not exists (select 1 from public.leagues l where l.id = p_league) then
    perform private.fail('no_existe');
  end if;
  if p_date is null then
    perform private.fail('invalido');
  end if;
  return (
    with p as (select * from private.suspend_plan(p_league, p_date))
    select jsonb_build_object(
      'date', p_date,
      'matches', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'label', p.label, 'sub', p.sub, 'status', p.status,
                                                              'scheduledAt', private.iso(p.at), 'locked', p.locked, 'reason', p.reason)
                                            order by p.at, p.id) from p where p.kind = 'match'), '[]'::jsonb),
      'events', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'label', p.label, 'sub', p.sub,
                                                             'startTime', left(p.start_time::text, 5), 'locked', p.locked,
                                                             'reason', p.reason, 'content', p.content)
                                           order by p.at, p.id) from p where p.kind = 'event'), '[]'::jsonb),
      'counts', jsonb_build_object(
        'matches', (select count(*) from p where p.kind = 'match' and not p.locked),
        'bowlingEvents', (select count(*) from p where p.kind = 'event' and not p.locked and p.sub = 'bowling'),
        'golfRounds', (select count(*) from p where p.kind = 'event' and not p.locked and p.sub = 'golf'),
        'swimMeets', (select count(*) from p where p.kind = 'event' and not p.locked and p.sub = 'swim'),
        'otherEvents', (select count(*) from p where p.kind = 'event' and not p.locked and p.sub = 'event'),
        'locked', (select count(*) from p where p.locked)),
      'withNewDate', jsonb_build_object(
        'matches', (select count(*) from p where p.kind = 'match' and not p.locked),
        'events', (select count(*) from p where p.kind = 'event' and not p.locked)),
      'withoutDate', jsonb_build_object(
        'postponed', (select count(*) from p where p.kind = 'match' and p.status in ('scheduled', 'suspended')),
        'cancelled', (select count(*) from p where p.kind = 'event' and not p.locked and not p.content),
        'kept', (select count(*) from p where p.kind = 'event' and not p.locked and p.content))));
end $$;

-- Admin: suspende el día. p_reason: 1–90 letras (va en el aviso). p_new_date: desde hoy (zona de la liga) y distinta
-- de p_date; null = sin fecha todavía.
-- - Partidos programados, aplazados o suspendidos de ese día: con fecha, a la nueva fecha a la misma hora (un aplazado
--   vuelve a programado; un suspendido sigue suspendido, con su marcador); sin fecha, aplazados. Los que están en
--   juego o ya tienen resultado no se tocan. Queda en su historial ('reschedule' / 'postpone') con el motivo.
-- - Eventos de ese día sin resultados: con fecha, a la nueva fecha; sin fecha, se cancelan (se borran) si no tienen
--   nada adentro (private.event_has_content), y se quedan si tienen algo (sus partidos quedan aplazados).
-- - Retos abiertos de la escalera cuyo partido se movió o quedó aplazado: su plazo para jugar (play_by) se alarga
--   hasta un día después de la nueva hora o, sin fecha, lo que da la escalera para jugar (playDays) desde hoy. Así
--   el cron no le da W.O. al retado por un día que suspendió el admin.
-- - Un aviso a la liga con league_announce: «Se suspende el <día>: <motivo>. Nueva fecha: <día>.» (o «La nueva fecha
--   se avisará.»), solo si algo cambió. Si no sale, se suspende igual: announced = false y skipped dice por qué:
--   'nada' (no cambió nada), 'duplicado' (el mismo aviso salió hace menos de 10 minutos) o 'limite' (ya se mandaron
--   los avisos del día).
-- Devuelve {date, newDate, matches: {moved, postponed}, events: {moved, cancelled, kept}, locked, announced,
-- skipped, recipients, body}.
create function public.suspend_day(p_league uuid, p_date date, p_reason text, p_new_date date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  l public.leagues;
  v_reason text := rtrim(btrim(replace(coalesce(p_reason, ''), E'\n', ' ')), '. ');
  v_body text;
  v_today date;
  v_moved integer := 0;
  v_postponed integer := 0;
  v_ev_moved integer := 0;
  v_ev_cancelled integer := 0;
  v_ev_kept integer := 0;
  v_locked integer;
  v_matches uuid[];
  v_to_postpone uuid[];
  v_events uuid[];
  v_to_cancel uuid[];
  v_kept integer;
  v_announced boolean := false;
  v_skipped text;
  v_recipients integer := 0;
begin
  perform private.require_admin(p_league);
  select * into l from public.leagues x where x.id = p_league for update;
  if l.id is null then
    perform private.fail('no_existe');
  end if;
  v_today := (now() at time zone l.tz)::date;
  if p_date is null or char_length(v_reason) not between 1 and 90 or v_reason ~ '[[:cntrl:]]'
     or (p_new_date is not null and (p_new_date = p_date or p_new_date < v_today)) then
    perform private.fail('invalido');
  end if;

  select coalesce(array_agg(p.id) filter (where p.kind = 'match' and not p.locked), '{}'),
         coalesce(array_agg(p.id) filter (where p.kind = 'match' and not p.locked and p.status in ('scheduled', 'suspended')), '{}'),
         coalesce(array_agg(p.id) filter (where p.kind = 'event' and not p.locked), '{}'),
         coalesce(array_agg(p.id) filter (where p.kind = 'event' and not p.locked and not p.content), '{}'),
         count(*) filter (where p.kind = 'event' and not p.locked and p.content),
         count(*) filter (where p.locked)
    into v_matches, v_to_postpone, v_events, v_to_cancel, v_kept, v_locked
    from private.suspend_plan(p_league, p_date) p;

  if p_new_date is not null then
    with u as (
      update public.matches m set
        scheduled_at = (p_new_date + (m.scheduled_at at time zone l.tz)::time) at time zone l.tz,
        status = case when m.status = 'postponed' then 'scheduled' else m.status end,
        note = v_reason,
        history = private.match_history(m.history, 'reschedule', v_reason,
                    jsonb_build_object('from', jsonb_build_object('at', m.scheduled_at, 'court', m.court),
                                       'to', jsonb_build_object('at', (p_new_date + (m.scheduled_at at time zone l.tz)::time) at time zone l.tz,
                                                                'court', m.court)))
       where m.id = any (v_matches)
      returning 1)
    select count(*) into v_moved from u;
    -- Retos de la escalera: se juegan hasta un día después de la nueva hora (por lo menos).
    update public.ladder_challenges c set play_by = greatest(c.play_by, m.scheduled_at + interval '1 day')
      from public.matches m
     where m.id = any (v_matches) and c.match_id = m.id and c.status in ('pending', 'accepted');
    with u as (update public.events e set date = p_new_date where e.id = any (v_events) returning 1)
    select count(*) into v_ev_moved from u;
  else
    with u as (
      update public.matches m set
        status = 'postponed',
        scorer_id = null,
        lease_until = null,
        note = v_reason,
        history = private.match_history(m.history, 'postpone', v_reason, jsonb_build_object('from', m.status))
       where m.id = any (v_to_postpone)
      returning 1)
    select count(*) into v_postponed from u;
    -- Retos de la escalera aplazados sin fecha: otra vez el plazo de la escalera para jugar, desde hoy.
    update public.ladder_challenges c
       set play_by = greatest(c.play_by, now() + make_interval(days => private.ladder_opt(e.config, 'playDays', 7, 1, 60)))
      from public.events e
     where c.match_id = any (v_to_postpone) and e.id = c.event_id and c.status in ('pending', 'accepted');
    with d as (delete from public.events e where e.id = any (v_to_cancel) returning 1)
    select count(*) into v_ev_cancelled from d;
    v_ev_kept := v_kept;
  end if;

  v_body := 'Se suspende el ' || private.org_day(p_date) || ': ' || v_reason || '. '
         || case when p_new_date is not null then 'Nueva fecha: ' || private.org_day(p_new_date) || '.'
                 else 'La nueva fecha se avisará.' end;
  -- Si nada cambió (p. ej. solo hay eventos con inscritos y no hay fecha nueva), el aviso diría algo que no pasó.
  if v_moved + v_postponed + v_ev_moved + v_ev_cancelled = 0 then
    v_skipped := 'nada';
  elsif exists (select 1 from public.league_announcements a
                 where a.league_id = p_league and a.body = v_body and a.created_at > now() - interval '10 minutes') then
    v_skipped := 'duplicado';
  else
    begin
      v_recipients := public.league_announce(p_league, v_body);
      v_announced := true;
    exception when others then
      if sqlerrm <> 'rate_limited' then
        raise;
      end if;
      v_skipped := 'limite';
    end;
  end if;

  return jsonb_build_object(
    'date', p_date,
    'newDate', p_new_date,
    'matches', jsonb_build_object('moved', v_moved, 'postponed', v_postponed),
    'events', jsonb_build_object('moved', v_ev_moved, 'cancelled', v_ev_cancelled, 'kept', v_ev_kept),
    'locked', v_locked,
    'announced', v_announced,
    'skipped', v_skipped,
    'recipients', v_recipients,
    'body', v_body);
end $$;

-- =====================================================================
-- 6. Pistas del boliche (C15)
-- =====================================================================
-- public.event_lanes (creada arriba): una fila por jugador con pista en el evento. La lee quien ve la liga; se escribe
-- solo por RPC. Tiempo real: event:<id> 'lanes' {op}. Borrados en tombstones ('<evento>:<jugador>').

create trigger event_lanes_touch before update on public.event_lanes for each row execute function private.touch_updated_at();
create trigger event_lanes_tombstone after delete on public.event_lanes for each row execute function private.tombstone('event_id', 'player_id');

-- Solo en ligas de boliche (también para service_role).
create function private.check_event_lane() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select l.sport from public.leagues l where l.id = new.league_id), '') <> 'bowling' then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Las pistas son del boliche.';
  end if;
  return new;
end $$;

create trigger event_lanes_check before insert or update of league_id on public.event_lanes
  for each row execute function private.check_event_lane();

create function private.emit_event_lanes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then
    for r in select distinct o.event_id, o.league_id from old_rows o loop
      if not private.deleting(r.league_id) then
        perform private.emit('event:' || r.event_id::text, 'lanes', jsonb_build_object('op', 'delete'));
      end if;
    end loop;
  else
    for r in select distinct n.event_id from new_rows n loop
      perform private.emit('event:' || r.event_id::text, 'lanes', jsonb_build_object('op', lower(tg_op)));
    end loop;
  end if;
  return null;
end $$;

create trigger event_lanes_emit_insert after insert on public.event_lanes referencing new table as new_rows
  for each statement execute function private.emit_event_lanes();
create trigger event_lanes_emit_update after update on public.event_lanes referencing new table as new_rows
  for each statement execute function private.emit_event_lanes();
create trigger event_lanes_emit_delete after delete on public.event_lanes referencing old table as old_rows
  for each statement execute function private.emit_event_lanes();

alter table public.event_lanes enable row level security;
create policy event_lanes_read on public.event_lanes for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
revoke all on public.event_lanes from public, anon, authenticated;
grant select on public.event_lanes to anon, authenticated;

-- Evento de boliche bloqueado y permiso (admin o anotador). Devuelve su liga.
create function private.lanes_event(p_event uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
begin
  select e.league_id into v_league from public.events e where e.id = p_event for update;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  if not private.is_admin(v_league) and not private.is_scorer(v_league) then
    perform private.deny();
  end if;
  if (select l.sport from public.leagues l where l.id = v_league) <> 'bowling' then
    perform private.fail('invalido');
  end if;
  return v_league;
end $$;

-- Las pistas del evento: {eventId, count, unpublished (cuántos cambiaron sin avisar), publishedAt (el último aviso),
-- lanes: [{lane, players: [{playerId, name, position, userId}]}], text: 'Pista 7: Juan, Ana, Luis' (una línea por pista)}.
create function private.lanes_json(p_event uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with r as (
    select x.lane, x.position, x.player_id, x.published_at, p.name, p.user_id
      from public.event_lanes x join public.players p on p.id = x.player_id
     where x.event_id = p_event
  ), g as (
    select r.lane,
           jsonb_agg(jsonb_build_object('playerId', r.player_id, 'name', r.name, 'position', r.position, 'userId', r.user_id)
                     order by r.position, r.name, r.player_id) as players,
           'Pista ' || r.lane || ': ' || string_agg(r.name, ', ' order by r.position, r.name, r.player_id) as line
      from r group by r.lane
  )
  select jsonb_build_object(
    'eventId', p_event,
    'count', (select count(*) from r)::integer,
    'unpublished', (select count(*) from r where r.published_at is null)::integer,
    'publishedAt', private.iso((select max(r.published_at) from r)),
    'lanes', coalesce((select jsonb_agg(jsonb_build_object('lane', g.lane, 'players', g.players) order by g.lane) from g), '[]'::jsonb),
    'text', coalesce((select string_agg(g.line, E'\n' order by g.lane) from g), ''))
$$;

-- Admin o anotador: arma las pistas del evento de boliche con quien dijo «voy» o está inscrito (reemplaza las que
-- había). p_lanes: los números de pista (1–999, hasta 100; se usan en ese orden), p_per_lane: jugadores por pista
-- (1–20). Más jugadores que lugares: 'invalido'. p_mode:
-- - 'promedio': promedios parecidos juntos. El promedio lo calcula el teléfono (average_override o los juegos
--   verificados con las reglas de la liga, src/lib/stats.ts): manda p_order = los jugadores de mayor a menor promedio.
--   Sin p_order (o quien no esté en la lista), el promedio fijo del jugador o el de su inscripción, de mayor a menor.
-- - 'equipo': los del mismo equipo del evento juntos (en el orden de los equipos; dentro, por p_order): un equipo
--   empieza pista nueva si no cabe entero en lo que queda de la anterior; los que no tienen equipo, al final. Si así
--   no alcanzan las pistas, se llenan de corrido. Sin equipos, como 'azar'.
-- - 'azar': al azar.
-- En 'promedio' y 'azar' se usan las pistas que hagan falta y se reparten parejo (10 jugadores de a 4: 4, 3 y 3).
-- Devuelve las pistas (private.lanes_json).
create function public.assign_lanes(p_event uuid, p_lanes integer[], p_per_lane integer, p_mode text, p_order uuid[] default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
  v_lanes integer[];
  v_order uuid[];
  v_groups text[];
  v_slots integer[] := '{}';
  v_pos integer[] := '{}';
  v_n integer;
  v_used integer;
  v_big integer;
  v_extra integer;
  v_teams boolean;
  v_slot integer := 0;
  v_at integer := 0;
  v_size integer;
  i integer;
begin
  perform private.require_uid();
  v_league := private.lanes_event(p_event);
  v_lanes := array(select x from unnest(p_lanes) with ordinality as a (x, n) group by x order by min(n));
  if coalesce(cardinality(v_lanes), 0) not between 1 and 100
     or exists (select 1 from unnest(v_lanes) x where x is null or x not between 1 and 999)
     or p_per_lane is null or p_per_lane not between 1 and 20
     or p_mode is null or p_mode not in ('promedio', 'equipo', 'azar')
     or cardinality(p_order) > 1000 then
    perform private.fail('invalido');
  end if;

  -- Quién va, en el orden en que se llenan las pistas, y su grupo (el equipo, o él solo).
  v_teams := p_mode = 'equipo' and exists (select 1 from public.entries x where x.event_id = p_event and x.team_id is not null);
  select coalesce(array_agg(o.player_id order by o.n), '{}'), coalesce(array_agg(o.grp order by o.n), '{}')
    into v_order, v_groups
    from (
      select c.player_id, coalesce(t.id::text, c.player_id::text) as grp,
             row_number() over (order by
               case when v_teams then coalesce(t.sort_order, 2147483647) end,
               case when v_teams then t.id::text end,
               case when p_mode = 'azar' or (p_mode = 'equipo' and not v_teams) then random() end,
               array_position(p_order, c.player_id) nulls last,
               coalesce(p.average_override, en.average, 0) desc,
               p.name, c.player_id) as n
        from (select x.player_id from public.entries x where x.event_id = p_event
              union
              select r.player_id from public.event_rsvps r where r.event_id = p_event and r.going) c
        join public.players p on p.id = c.player_id
        left join public.entries en on en.event_id = p_event and en.player_id = c.player_id
        left join public.teams t on t.id = en.team_id
    ) o;
  v_n := cardinality(v_order);
  if v_n > cardinality(v_lanes) * p_per_lane then
    perform private.fail('invalido');
  end if;

  if v_n > 0 and v_teams then
    -- Por equipo: cada equipo empieza pista nueva si no cabe entero en lo que queda.
    for i in 1 .. v_n loop
      if i = 1 or v_groups[i] <> v_groups[i - 1] then
        v_size := least(p_per_lane, (select count(*) from unnest(v_groups) g where g = v_groups[i])::integer);
        if v_at > 0 and v_at + v_size > p_per_lane then
          v_slot := v_slot + 1;
          v_at := 0;
        end if;
      end if;
      if v_at >= p_per_lane then
        v_slot := v_slot + 1;
        v_at := 0;
      end if;
      v_slots := v_slots || v_slot;
      v_pos := v_pos || v_at;
      v_at := v_at + 1;
    end loop;
    -- No alcanzan las pistas así: de corrido.
    if v_slot >= cardinality(v_lanes) then
      v_slots := array(select (g - 1) / p_per_lane from generate_series(1, v_n) g order by g);
      v_pos := array(select (g - 1) % p_per_lane from generate_series(1, v_n) g order by g);
    end if;
  elsif v_n > 0 then
    -- Las pistas que hacen falta, parejas: las primeras v_extra llevan v_big + 1 y las demás v_big.
    v_used := least(cardinality(v_lanes), ceil(v_n::numeric / p_per_lane)::integer);
    v_big := v_n / v_used;
    v_extra := v_n % v_used;
    v_slots := array(select case when g - 1 < (v_big + 1) * v_extra then (g - 1) / (v_big + 1)
                                 else v_extra + (g - 1 - (v_big + 1) * v_extra) / v_big end
                       from generate_series(1, v_n) g order by g);
    v_pos := array(select case when g - 1 < (v_big + 1) * v_extra then (g - 1) % (v_big + 1)
                               else (g - 1 - (v_big + 1) * v_extra) % v_big end
                     from generate_series(1, v_n) g order by g);
  end if;

  delete from public.event_lanes x where x.event_id = p_event;
  insert into public.event_lanes (event_id, player_id, league_id, lane, position)
  select p_event, o.player_id, v_league, v_lanes[o.slot + 1], o.pos + 1
    from unnest(v_order, v_slots, v_pos) as o (player_id, slot, pos);
  return private.lanes_json(p_event);
end $$;

-- Admin o anotador: pone a un jugador de la liga en otra pista (al final de esa pista) o, con p_lane null, lo quita.
-- Queda sin avisar (published_at null). Devuelve las pistas.
create function public.set_player_lane(p_event uuid, p_player uuid, p_lane integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
  v_old smallint;
begin
  perform private.require_uid();
  v_league := private.lanes_event(p_event);
  if not exists (select 1 from public.players p where p.id = p_player and p.league_id = v_league) then
    perform private.fail('no_existe');
  end if;
  if p_lane is not null and p_lane not between 1 and 999 then
    perform private.fail('invalido');
  end if;
  select x.lane into v_old from public.event_lanes x where x.event_id = p_event and x.player_id = p_player;
  if p_lane is null then
    delete from public.event_lanes x where x.event_id = p_event and x.player_id = p_player;
  elsif v_old is distinct from p_lane then
    insert into public.event_lanes as x (event_id, player_id, league_id, lane, position)
    values (p_event, p_player, v_league, p_lane,
            coalesce((select max(y.position) from public.event_lanes y where y.event_id = p_event and y.lane = p_lane), 0) + 1)
    on conflict (event_id, player_id) do update set lane = excluded.lane, position = excluded.position, published_at = null;
  end if;
  -- La pista de donde salió queda sin huecos (1, 2, 3…).
  if v_old is not null and v_old is distinct from p_lane then
    update public.event_lanes x set position = o.pos
      from (select y.player_id, row_number() over (order by y.position, y.player_id)::smallint as pos
              from public.event_lanes y where y.event_id = p_event and y.lane = v_old) o
     where x.event_id = p_event and x.player_id = o.player_id and x.position <> o.pos;
  end if;
  return private.lanes_json(p_event);
end $$;

-- Admin o anotador: borra las pistas del evento. Devuelve cuántas filas había.
create function public.clear_lanes(p_event uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  perform private.require_uid();
  perform private.lanes_event(p_event);
  delete from public.event_lanes x where x.event_id = p_event;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Veces que se puede avisar de las pistas de un evento por hora.
create function private.lanes_publish_limit() returns integer
language sql immutable set search_path = '' as $$
  select 6
$$;

-- Admin o anotador: avisa a cada jugador con cuenta (sin bloquear y que sigue en la liga) su pista: «Tu pista: 7 ·
-- <evento>», con los de su pista en el texto («Pista 7: Juan, Ana, Luis»). Un aviso por jugador (tag por evento y
-- jugador: el nuevo reemplaza al anterior en el teléfono). Marca todas como avisadas. 6 veces por hora y evento
-- ('rate_limited'). Sin pistas no hace nada. Devuelve {players (con pista), pushed (cuentas avisadas)}.
create function public.publish_lanes(p_event uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
  v_key text := 'lanes:' || p_event::text;
  v_label text;
  v_players integer;
  v_pushed integer;
begin
  perform private.require_uid();
  v_league := private.lanes_event(p_event);
  v_players := (select count(*) from public.event_lanes x where x.event_id = p_event);
  if v_players = 0 then
    return jsonb_build_object('players', 0, 'pushed', 0);
  end if;
  if private.rate_blocked(v_key, private.lanes_publish_limit(), interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  perform private.rate_hit(v_key, interval '1 hour');
  v_label := private.org_event_label(p_event);
  with mine as (
    select x.lane, p.user_id, x.player_id,
           (select 'Pista ' || x.lane || ': ' || string_agg(q.name, ', ' order by y.position, q.name, q.id)
              from public.event_lanes y join public.players q on q.id = y.player_id
             where y.event_id = p_event and y.lane = x.lane) as line
      from public.event_lanes x
      join public.players p on p.id = x.player_id
      join public.profiles pr on pr.id = p.user_id
     where x.event_id = p_event and p.user_id is not null and pr.blocked_at is null
       and exists (select 1 from public.league_members m where m.league_id = v_league and m.user_id = p.user_id)
  ), q as (
    insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
    select m.user_id, left('Tu pista: ' || m.lane || ' · ' || v_label, 200), left(m.line, 1000),
           '/l/' || v_league::text || '/e/' || p_event::text, 'pista:' || p_event::text || ':' || m.player_id::text, 86400, 'high'
      from mine m
    returning 1)
  select count(distinct m.user_id) into v_pushed from mine m;
  update public.event_lanes x set published_at = now() where x.event_id = p_event;
  if v_pushed > 0 then
    perform private.kick_send_push();
  end if;
  return jsonb_build_object('players', v_players, 'pushed', v_pushed);
end $$;

-- =====================================================================
-- Permisos: las RPC solo con sesión (el listado de ligas públicas, también sin cuenta); las ayudas, nadie de la app
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array['league_pending', 'merge_league_players', 'merge_league_players_preview', 'create_player',
                                 'set_player_minor', 'suspend_day_preview', 'suspend_day', 'assign_lanes', 'set_player_lane',
                                 'clear_lanes', 'publish_lanes'];
  v_anon constant text[] := array['public_leagues_feed'];
  v_private constant text[] := array['org_day', 'org_event_label', 'org_match_label', 'feed_anon_limit', 'league_activity30',
                                     'league_day_limit', 'league_month_limit', 'league_quota', 'young_league_days',
                                     'league_has_result', 'merge_players', 'merge_block', 'guardian', 'reject_minor_claims',
                                     'players_minor_claims',
                                     'event_has_results', 'event_has_content', 'suspend_plan', 'check_event_lane',
                                     'emit_event_lanes', 'lanes_event', 'lanes_json', 'lanes_publish_limit'];
begin
  for f in select p.oid::regprocedure as sig, n.nspname, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and p.proname = any (v_rpc || v_anon))
               or (n.nspname = 'private' and p.proname = any (v_private)) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' and f.proname = any (v_anon) then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    elsif f.nspname = 'public' then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
