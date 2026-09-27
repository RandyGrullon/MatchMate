-- MatchMate · Pádel (fases 1 y 2): noche de americano y mexicano, liga de parejas y torneo por categorías.
--
-- Va sobre la base de partidos (20260927000100_partidos.sql, docs/partidos.md): los partidos, sus lados, el
-- modo cancha, la confirmación del rival, el W.O. y la regla de las 48 h ya están ahí. Aquí solo lo propio
-- del pádel:
--
-- - Eventos de una liga de pádel: 'americano' y 'mexicano' (noches de puntos), 'liga' (liga de parejas) y
--   'torneo' (torneo por categorías). La configuración de cada uno va en events.config (la escribe el admin
--   con create_event / update_event; ver src/lib/data/racket.ts). player_count = jugadores de la noche o parejas.
-- - Partidos de una liga de pádel: formato '' o 'sets' (partido a sets) o 'americano' / 'mexicano' (a puntos).
--   Marcador con forma de pádel: a sets, `sides` = sets ganados (0–3); a puntos, 0–99.
-- - save_night_round: el admin publica una ronda de la noche (atómica): borra la que no ha empezado, crea los
--   partidos (create_matches), guarda quién descansa y avisa por push «Ronda 3: te toca la Cancha 2».
-- - save_points_result: termina (o corrige, el admin) un partido del americano o el mexicano con los puntos de
--   cada lado. A diferencia de finish_match, admite empate (12-12 a 24) y revisa el total de la noche.
-- - private.padel_match_reminders: aviso «Partido hoy a las 8:00 pm, Cancha 2» unas horas antes (lo programa
--   20260927000690_padel_cron_supabase.sql cada 15 minutos).
--
-- Tenis y pickleball pueden usar lo mismo (noches de puntos) agregando su deporte en private.night_league.

-- =====================================================================
-- Funciones de ayuda
-- =====================================================================

-- La liga es de pádel.
create function private.is_padel(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.leagues l where l.id = p_league and l.sport = 'padel')
$$;

-- La liga puede tener noches de puntos (americano y mexicano).
create function private.night_league(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.leagues l where l.id = p_league and l.sport in ('padel'))
$$;

-- =====================================================================
-- Eventos de pádel: tipos y configuración
-- =====================================================================
-- Tipos: americano, mexicano, liga (liga de parejas), torneo (torneo por categorías; también el que crea
-- create_tournament). 'noche' y 'jornada' quedan por compatibilidad (noche = americano o mexicano según config).
-- La configuración es un objeto chico (< 32 KB). player_count = jugadores de la noche, o parejas de la liga
-- o del torneo (para las listas).
create function private.padel_check_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if not private.is_padel(new.league_id) then
    return new;
  end if;
  if new.type not in ('americano', 'mexicano', 'liga', 'torneo', 'noche', 'jornada') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Tipo de evento de pádel: americano, mexicano, liga o torneo.';
  end if;
  if jsonb_typeof(coalesce(new.config, '{}'::jsonb)) <> 'object' or pg_column_size(new.config) >= 32768 then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Configuración del evento no válida.';
  end if;
  if new.type in ('americano', 'mexicano') and new.config ? 'format' and new.config ->> 'format' <> new.type then
    raise exception 'invalido' using errcode = 'P0001', detail = 'El formato de la noche no coincide con el tipo.';
  end if;
  if new.config ? 'players' and (jsonb_typeof(new.config -> 'players') <> 'array' or jsonb_array_length(new.config -> 'players') > 64) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Jugadores de la noche no válidos.';
  end if;
  v_count := case
    when jsonb_typeof(new.config -> 'players') = 'array' then jsonb_array_length(new.config -> 'players')
    when jsonb_typeof(new.config -> 'pairs') = 'array' then jsonb_array_length(new.config -> 'pairs')
    when jsonb_typeof(new.config -> 'categories') = 'array' then
      (select coalesce(sum(jsonb_array_length(c -> 'pairs')), 0)::integer
         from jsonb_array_elements(new.config -> 'categories') c where jsonb_typeof(c -> 'pairs') = 'array')
  end;
  if v_count is not null then
    new.player_count := v_count;
  end if;
  return new;
end $$;

create trigger events_padel_check before insert or update of type, league_id, config on public.events
  for each row execute function private.padel_check_event();

-- =====================================================================
-- Partidos de pádel: formato y forma del marcador
-- =====================================================================
-- Formato: '' o 'sets' (a sets) o 'americano' / 'mexicano' (a puntos). Marcador: `sides` = sets ganados (0–3)
-- o puntos (0–99); `totals` (si viene) con sets 0–3, juegos 0–99 y puntos 0–9999 por lado.
create function private.padel_score_ok(p_format text, p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_max integer := case when p_format in ('americano', 'mexicano') then 99 else 3 end;
  k text;
  v_lim integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return true;
  end if;
  if jsonb_typeof(p -> 'sides') = 'array' and exists (
       select 1 from jsonb_array_elements(p -> 'sides') x
        where jsonb_typeof(x) <> 'number' or (x #>> '{}')::numeric not between 0 and v_max) then
    return false;
  end if;
  if p_format not in ('americano', 'mexicano') and jsonb_typeof(p -> 'totals') = 'object' then
    for k, v_lim in select * from (values ('sets', 3), ('games', 99), ('points', 9999)) as t (k, lim) loop
      if (p -> 'totals') ? k and not (
           jsonb_typeof(p -> 'totals' -> k) = 'array' and jsonb_array_length(p -> 'totals' -> k) = 2
           and not exists (select 1 from jsonb_array_elements(p -> 'totals' -> k) x
                            where jsonb_typeof(x) <> 'number' or (x #>> '{}')::numeric not between 0 and v_lim)) then
        return false;
      end if;
    end loop;
  end if;
  return true;
end $$;

create function private.padel_check_match() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_padel(new.league_id) then
    return new;
  end if;
  if new.format not in ('', 'sets', 'americano', 'mexicano') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Formato de partido de pádel: sets, americano o mexicano.';
  end if;
  if not private.padel_score_ok(new.format, new.score) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Marcador de pádel no válido.';
  end if;
  return new;
end $$;

create trigger matches_padel_check before insert or update of format, score, league_id on public.matches
  for each row execute function private.padel_check_match();

-- =====================================================================
-- RPC: ronda de la noche (americano o mexicano)
-- =====================================================================
-- Admin: publica la ronda p_round de la noche p_event. p_matches = partidos de la ronda como en create_matches
-- ([{id?, court, sides: [{side: 1, players: [{player_id}, {player_id}]}, {side: 2, …}]}]); cada uno queda del
-- evento, con esa ronda, el formato de la noche y sin confirmación del rival. p_rests = ids de quienes descansan.
-- Si la ronda ya existía y ningún partido empezó, se rehace (se borran y se crean de nuevo); si alguno empezó:
-- 'cerrado'. Nadie puede estar dos veces en la ronda. Guarda los descansos en config.rests['<ronda>'] y
-- config.round. Avisa por push a cada jugador con cuenta: su cancha, compañero y rivales (o que descansa).
-- Devuelve los ids de los partidos en el mismo orden.
create function public.save_night_round(p_event uuid, p_round integer, p_matches jsonb, p_rests jsonb default '[]') returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v_format text;
  v_ids uuid[];
  v_all jsonb;
begin
  perform private.require_uid();
  select * into e from public.events x where x.id = p_event for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(e.league_id);
  v_format := coalesce(nullif(e.config ->> 'format', ''), e.type);
  if not private.night_league(e.league_id) or e.type not in ('americano', 'mexicano', 'noche') or v_format not in ('americano', 'mexicano') then
    perform private.fail('invalido');
  end if;
  if p_round is null or p_round not between 1 and 99 then
    perform private.fail('invalido');
  end if;
  if jsonb_typeof(p_matches) is distinct from 'array' or jsonb_array_length(p_matches) not between 1 and 16
     or jsonb_typeof(coalesce(p_rests, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_rests, '[]'::jsonb)) > 64 then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from jsonb_array_elements(p_matches) x
              where jsonb_typeof(x) <> 'object' or jsonb_typeof(x -> 'sides') is distinct from 'array'
                 or jsonb_array_length(x -> 'sides') <> 2
                 or exists (select 1 from jsonb_array_elements(x -> 'sides') s
                             where jsonb_typeof(s -> 'players') is distinct from 'array'
                                or jsonb_array_length(s -> 'players') not between 1 and 2)) then
    perform private.fail('invalido');
  end if;
  -- Todos los de la ronda (jugando y descansando): jugadores de la liga, sin repetir.
  select coalesce(jsonb_agg(v), '[]'::jsonb) into v_all from (
    select pl ->> 'player_id' as v
      from jsonb_array_elements(p_matches) x, jsonb_array_elements(x -> 'sides') s, jsonb_array_elements(s -> 'players') pl
    union all
    select r #>> '{}' from jsonb_array_elements(coalesce(p_rests, '[]'::jsonb)) r
  ) t;
  if exists (select 1 from jsonb_array_elements_text(v_all) a group by a having count(*) > 1)
     or exists (select 1 from jsonb_array_elements_text(v_all) a
                 where not exists (select 1 from public.players p where p.id = a::uuid and p.league_id = e.league_id)) then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from public.matches m where m.event_id = p_event and m.round = p_round and (m.status <> 'scheduled' or m.seq > 0)) then
    perform private.fail('cerrado');
  end if;
  delete from public.matches m where m.event_id = p_event and m.round = p_round;
  v_ids := public.create_matches(e.league_id, (
    select jsonb_agg((x - 'bracket_key') || jsonb_build_object('event_id', p_event, 'round', p_round, 'format', v_format, 'require_confirm', false)
                     order by n)
      from jsonb_array_elements(p_matches) with ordinality as a (x, n)));
  update public.events x set config =
    coalesce(x.config, '{}'::jsonb)
    || jsonb_build_object(
         'rests', (case when jsonb_typeof(x.config -> 'rests') = 'object' then x.config -> 'rests' else '{}'::jsonb end)
                  || jsonb_build_object(p_round::text, coalesce(p_rests, '[]'::jsonb)),
         'round', greatest(coalesce((x.config ->> 'round')::integer, 0), p_round))
  where x.id = p_event;
  perform private.push_night_round(e, p_round, v_ids, coalesce(p_rests, '[]'::jsonb));
  return v_ids;
end $$;

-- Push de la ronda: a cada jugador con cuenta, su cancha, compañero y rivales; a quien descansa, que descansa.
-- Un aviso por noche (tag): el de la ronda nueva reemplaza al anterior en el teléfono. Nunca frena la ronda.
create function private.push_night_round(e public.events, p_round integer, p_ids uuid[], p_rests jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := '/l/' || e.league_id::text || '/e/' || e.id::text;
  v_title text := coalesce(nullif(btrim(e.name), ''), initcap(e.type));
begin
  insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
  select p.user_id,
         'Ronda ' || p_round || ': te toca ' || coalesce(nullif(m.court, ''), 'jugar'),
         left(coalesce('Con ' || (select string_agg(q.name, ' / ') from public.match_players o join public.players q on q.id = o.player_id
                                   where o.match_id = m.id and o.side = mp.side and o.player_id <> mp.player_id) || ' ', '')
              || 'contra ' || coalesce((select s.label from public.match_sides s where s.match_id = m.id and s.side <> mp.side), 'el rival')
              || '. ' || v_title || '.', 1000),
         v_url || '?partido=' || m.id::text,
         'ronda:' || e.id::text,
         5400,
         'high'
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    join public.players p on p.id = mp.player_id
   where m.id = any (p_ids) and p.user_id is not null;
  insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
  select p.user_id, 'Ronda ' || p_round || ': descansas', left('Te toca descansar esta ronda. ' || v_title || '.', 1000), v_url,
         'ronda:' || e.id::text, 5400, 'normal'
    from jsonb_array_elements_text(p_rests) r
    join public.players p on p.id = r::uuid and p.league_id = e.league_id
   where p.user_id is not null;
  if exists (select 1 from public.push_outbox o where o.tag = 'ronda:' || e.id::text and o.sent_at is null) then
    perform private.kick_send_push();
  end if;
exception when others then
  raise warning 'push de la ronda % de %: %', p_round, e.id, sqlerrm;
end $$;

-- =====================================================================
-- RPC: resultado a puntos (americano o mexicano)
-- =====================================================================
-- Termina el partido con los puntos de cada lado (0–99): admin, anotador de la liga o alguien del partido. Si
-- la noche es por total (rules.points.mode = 'total'), entre los dos no pasan del total (se puede terminar
-- antes: se acabó el tiempo). Empate = sin ganador. Queda confirmado (las noches no piden confirmación del
-- rival); con require_confirm y un jugador, queda propuesto como en finish_match.
-- Un partido ya terminado solo lo cambia el admin (corrección, con historial). Si otro teléfono anota en vivo
-- con el turno vigente, solo el admin lo cierra. Lleva p_op_id (la cola). Devuelve {ok, status} o
-- {ok: false, reason: 'stale'} si ya llegó algo más nuevo de otro teléfono.
create function public.save_points_result(
  p_match uuid,
  p_score1 integer,
  p_score2 integer,
  p_state jsonb default null,
  p_seq integer default null,
  p_note text default null,
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
  v_correct boolean;
  v_final boolean;
  v_target integer;
  v_winner smallint;
  v_score jsonb;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v jsonb;
begin
  v_prev := private.op_begin(p_op_id, 'save_points_result');
  if v_prev is not null then
    return v_prev;
  end if;
  m := private.match_for_update(p_match);
  if not private.night_league(m.league_id) or m.format not in ('americano', 'mexicano') then
    perform private.fail('invalido');
  end if;
  v_admin := private.is_admin(m.league_id);
  v_official := private.is_match_official(m.league_id);
  v_side := private.match_side(p_match);
  if not (v_official or v_side is not null) then
    perform private.deny();
  end if;
  v_correct := m.status not in ('scheduled', 'live', 'suspended');
  if v_correct and not v_admin then
    perform private.fail('cerrado');
  end if;
  if not v_correct and m.scorer_id is not null and m.scorer_id <> v_uid and m.lease_until > now() and not v_admin then
    perform private.deny();
  end if;
  if p_score1 is null or p_score2 is null or p_score1 not between 0 and 99 or p_score2 not between 0 and 99
     or char_length(v_note) > 500 then
    perform private.fail('invalido');
  end if;
  if coalesce(m.rules #>> '{points,mode}', 'total') = 'total' and jsonb_typeof(m.rules #> '{points,target}') = 'number' then
    v_target := (m.rules #>> '{points,target}')::numeric::integer;
    if p_score1 + p_score2 > v_target then
      perform private.fail('invalido');
    end if;
  end if;
  p_state := private.check_state(p_state);
  if not v_correct and p_seq is not null and p_seq < m.seq and not v_admin then
    v := jsonb_build_object('ok', false, 'reason', 'stale', 'status', m.status, 'seq', m.seq);
    perform private.op_end(p_op_id, v);
    return v;
  end if;
  v_winner := case when p_score1 > p_score2 then 1 when p_score2 > p_score1 then 2 end;
  v_score := jsonb_build_object('text', p_score1 || '-' || p_score2, 'sides', jsonb_build_array(p_score1, p_score2));
  v_final := v_official or not m.require_confirm or v_correct;
  update public.matches x set
    score = v_score,
    winner_side = v_winner,
    walkover_side = null,
    state = coalesce(p_state, x.state),
    seq = greatest(x.seq, coalesce(p_seq, x.seq)),
    scorer_id = null,
    lease_until = null,
    status = case when v_final then 'confirmed' else 'finished' end,
    proposed_by = case when v_correct then coalesce(x.proposed_by, v_uid) else v_uid end,
    proposed_at = case when v_correct then coalesce(x.proposed_at, now()) else now() end,
    proposed_side = case when v_correct then x.proposed_side when v_official then null else v_side end,
    confirmed_by = case when v_final then v_uid end,
    confirmed_at = case when v_final then now() end,
    disputed_by = null,
    disputed_at = null,
    dispute_note = null,
    note = coalesce(v_note, x.note),
    history = private.match_history(x.history, case when v_correct then 'correct' else 'finish' end, v_note,
                case when v_correct then jsonb_build_object('from', m.score -> 'text', 'score', v_score -> 'text', 'winner', v_winner)
                     else jsonb_build_object('score', v_score -> 'text', 'winner', v_winner) end)
  where x.id = p_match
  returning * into m;
  v := jsonb_build_object('ok', true, 'status', m.status);
  perform private.op_end(p_op_id, v);
  return v;
end $$;

-- =====================================================================
-- Aviso «Partido hoy a las 8:00 pm, Cancha 2»
-- =====================================================================
-- Un aviso por partido programado de una liga de pádel, entre 3 horas y 10 minutos antes de empezar, a las
-- cuentas de los dos lados (jugadores del partido o de la pareja). Si lo reprograman, vuelve a salir para la
-- hora nueva. Lo corre el cron cada 15 minutos (20260927000690_padel_cron_supabase.sql). Devuelve cuántos
-- partidos avisó.
create table private.padel_reminders (
  match_id uuid primary key references public.matches (id) on delete cascade,
  scheduled_at timestamptz not null,
  sent_at timestamptz not null default now()
);
revoke all on private.padel_reminders from public, anon, authenticated;

create function private.padel_match_reminders(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_sent integer := 0;
  v_when text;
begin
  for r in
    select m.id, m.league_id, m.court, m.scheduled_at, l.tz, l.name as league_name,
           coalesce((select s.label from public.match_sides s where s.match_id = m.id and s.side = 1), 'Por definir') as a,
           coalesce((select s.label from public.match_sides s where s.match_id = m.id and s.side = 2), 'Por definir') as b
      from public.matches m
      join public.leagues l on l.id = m.league_id
     where l.sport = 'padel' and m.status = 'scheduled' and m.format in ('', 'sets')
       and m.scheduled_at > p_now + interval '10 minutes' and m.scheduled_at <= p_now + interval '3 hours'
       and not exists (select 1 from private.padel_reminders x where x.match_id = m.id and x.scheduled_at = m.scheduled_at)
     order by m.scheduled_at, m.id
  loop
    insert into private.padel_reminders as x (match_id, scheduled_at) values (r.id, r.scheduled_at)
    on conflict (match_id) do update set scheduled_at = excluded.scheduled_at, sent_at = now();
    v_when := case when (r.scheduled_at at time zone r.tz)::date = (p_now at time zone r.tz)::date then 'hoy' else 'mañana' end
              || ' a las ' || private.format_time(to_char(r.scheduled_at at time zone r.tz, 'HH24:MI'));
    insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
    select u.user_id,
           left('Partido ' || v_when || coalesce(', ' || nullif(r.court, ''), ''), 200),
           left(r.a || ' contra ' || r.b || ' · ' || r.league_name, 1000),
           '/l/' || r.league_id::text || '/juegos?partido=' || r.id::text,
           'partido:' || r.id::text,
           greatest(60, extract(epoch from (r.scheduled_at - p_now))::integer),
           'high'
      from (
        select p.user_id from public.match_players mp join public.players p on p.id = mp.player_id
         where mp.match_id = r.id and p.user_id is not null
        union
        select p.user_id from public.match_sides ms
          join public.team_players tp on tp.team_id = ms.team_id
          join public.players p on p.id = tp.player_id
         where ms.match_id = r.id and p.user_id is not null
      ) u;
    v_sent := v_sent + 1;
  end loop;
  if v_sent > 0 then
    perform private.kick_send_push();
  end if;
  return v_sent;
end $$;

-- =====================================================================
-- Permisos: cerrado todo lo de esta migración; las RPC, solo con sesión
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array['save_night_round', 'save_points_result'];
  v_private constant text[] := array[
    'is_padel', 'night_league', 'padel_check_event', 'padel_score_ok', 'padel_check_match', 'push_night_round',
    'padel_match_reminders'
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
