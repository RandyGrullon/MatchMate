-- MatchMate · Avisos por push de todos los deportes (el boliche sigue igual).
--
-- Casi todos los W.O. pasan porque la gente se olvida. Aquí salen los recordatorios de lo que no es boliche:
--
-- - private.match_reminders(now): «Partido hoy a las 8:00 pm, Cancha 2» para los partidos programados de todos los
--   deportes de partidos (pádel, tenis, pickleball, baloncesto, fútbol y sala). Dos turnos por partido:
--   'dia-antes' (el día antes, de 12:00 pm a 9:00 pm en la hora de la liga) y 'hoy' (de 3 horas a 10 minutos
--   antes, nunca antes de las 7:00 am). Raqueta: a los jugadores del partido y a los de su pareja (como el aviso
--   del pádel, con los mismos textos). Equipos: a toda la plantilla de los dos equipos (y a los refuerzos del
--   partido), con la convocatoria: a quien no ha marcado «¿Vas? Márcalo en la convocatoria», a quien marcó «Voy»
--   «¡Nos vemos en la cancha!» y a quien marcó «No voy», nada. El reto de la escalera sale como «Reto hoy…».
--   Si reprograman el partido, sus recordatorios vuelven a salir para la hora nueva. Las rondas de las noches de
--   puntos (americano, mexicano, round robin) no: esas las avisa save_night_round («Ronda 3: te toca…»).
-- - private.event_reminders(now): los eventos que no son partidos, con sus textos, en los mismos dos turnos
--   (con la hora del evento o, si no tiene, la del horario de la liga como en el boliche):
--   · golf, rondas abiertas: el día antes a todos los miembros (inscrito: «Mañana juegas a las 7:30 am», con su
--     grupo y hoyo de salida; sin inscribirse: «¿Juegas? Inscríbete en la app.») y el mismo día solo a los inscritos;
--   · natación, encuentros sin cerrar: a todos los miembros (padres, entrenadores y nadadores con cuenta);
--   · noches de americano y mexicano del pádel y el round robin del pickleball: a los jugadores de la noche.
--   Una vez por evento, turno y fecha (reminders_sent, como el boliche: si mueven la fecha, vuelve a salir).
-- - private.cron_match_reminders(now): las dos y, si encolaron algo, llama a send-push. La programa
--   20260927001290_avisos_supabase.sql cada 15 minutos (tarea 'mm-partidos', que reemplaza 'mm-padel-partidos').
-- - private.padel_match_reminders(now) queda como match_reminders solo del pádel (mismos textos y marcas).
-- - Reclamos: cuando el rival reclama un resultado, los organizadores de la liga reciben «Reclamaron un
--   resultado» y quien lo anotó «Reclamaron tu resultado» (trigger matches_push_dispute). Antes nadie se enteraba.
--
-- Solo reciben las cuentas que siguen en la liga (quien se salió conserva su jugador, pero ya no se le avisa).
-- Todo es solo del servidor: nadie de la app lo ejecuta. Pruebas: tests/sql/avisos.test.ts.

-- =====================================================================
-- Marcas: un recordatorio por partido, turno y hora
-- =====================================================================
-- scheduled_at: la hora para la que salió. Si el partido cambia de hora, el turno vuelve a salir.
create table private.match_reminders_sent (
  match_id uuid not null references public.matches (id) on delete cascade,
  slot text not null check (slot in ('dia-antes', 'hoy')),
  scheduled_at timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (match_id, slot)
);
revoke all on private.match_reminders_sent from public, anon, authenticated;

-- El cron busca los partidos programados de las próximas 48 horas de todas las ligas.
create index matches_upcoming_idx on public.matches (scheduled_at) where status = 'scheduled';

-- =====================================================================
-- Partidos: «Partido hoy a las 8:00 pm, Cancha 2»
-- =====================================================================
-- p_sports: solo esos deportes (null = todos los de partidos). Devuelve cuántos partidos avisó.
create function private.match_reminders(p_now timestamptz default now(), p_sports text[] default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_sent integer := 0;
  v_local timestamp;
  v_now timestamp;
  v_minutes integer;
  v_slot text;
  v_title text;
  v_body text;
begin
  for r in
    select m.id, m.league_id, m.court, m.stage, m.scheduled_at, l.tz, l.name as league_name, s.family,
           coalesce((select x.label from public.match_sides x where x.match_id = m.id and x.side = 1), 'Por definir') as a,
           coalesce((select x.label from public.match_sides x where x.match_id = m.id and x.side = 2), 'Por definir') as b
      from public.matches m
      join public.leagues l on l.id = m.league_id
      join public.sport_status s on s.id = l.sport
     where m.status = 'scheduled'
       and m.scheduled_at > p_now + interval '10 minutes'
       and m.scheduled_at < p_now + interval '2 days'
       and s.family in ('racket', 'team')
       and (p_sports is null or l.sport = any (p_sports))
       and m.format not in ('americano', 'mexicano')
     order by m.scheduled_at, m.id
  loop
    v_local := r.scheduled_at at time zone r.tz;
    v_now := p_now at time zone r.tz;
    v_minutes := extract(hour from v_now)::integer * 60 + extract(minute from v_now)::integer;
    v_slot := case
      when v_local::date = v_now::date and v_now >= greatest(v_local - interval '3 hours', v_local::date + time '07:00') then 'hoy'
      when v_local::date = v_now::date + 1 and v_minutes >= 12 * 60 and v_minutes < 21 * 60 then 'dia-antes'
    end;
    continue when v_slot is null;

    -- Dos corridas a la vez no mandan dos veces (la clave); con la misma hora no se repite.
    insert into private.match_reminders_sent as x (match_id, slot, scheduled_at, sent_at)
    values (r.id, v_slot, r.scheduled_at, p_now)
    on conflict (match_id, slot) do update set scheduled_at = excluded.scheduled_at, sent_at = excluded.sent_at
      where x.scheduled_at is distinct from excluded.scheduled_at;
    continue when not found;

    v_title := left(case when r.stage = 'Reto' then 'Reto ' else 'Partido ' end
                    || case when v_slot = 'hoy' then 'hoy' else 'mañana' end
                    || ' a las ' || private.format_time(to_char(v_local, 'HH24:MI'))
                    || coalesce(', ' || nullif(btrim(r.court), ''), ''), 200);
    v_body := case when btrim(r.stage) not in ('', 'Reto') then btrim(r.stage) || ' · ' else '' end
              || r.a || ' contra ' || r.b || ' · ' || r.league_name;

    insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
    select u.user_id,
           v_title,
           left(v_body || case when r.family <> 'team' then ''
                               when u.rsvp = 'yes' then '. ¡Nos vemos en la cancha!'
                               else '. ¿Vas? Márcalo en la convocatoria.' end, 1000),
           '/l/' || r.league_id::text || '/juegos?partido=' || r.id::text,
           'partido:' || r.id::text,
           greatest(60, least(6 * 3600, extract(epoch from (r.scheduled_at - p_now))::integer)),
           'high'
      from (
        select a.user_id,
               (select v.status from public.match_rsvps v join public.players p on p.id = v.player_id
                 where v.match_id = r.id and p.user_id = a.user_id limit 1) as rsvp
          from (
            select p.user_id from public.match_players mp join public.players p on p.id = mp.player_id
             where mp.match_id = r.id and p.user_id is not null
            union
            select p.user_id from public.match_sides ms
              join public.team_players tp on tp.team_id = ms.team_id
              join public.players p on p.id = tp.player_id
             where ms.match_id = r.id and p.user_id is not null
          ) a
         where exists (select 1 from public.league_members lm where lm.league_id = r.league_id and lm.user_id = a.user_id)
      ) u
     where u.rsvp is distinct from 'no';
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;

-- El aviso del pádel de antes (20260927000600_padel.sql) es ahora el de todos, solo del pádel.
create or replace function private.padel_match_reminders(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v integer := private.match_reminders(p_now, array['padel']);
begin
  if v > 0 then
    perform private.kick_send_push();
  end if;
  return v;
end $$;

-- =====================================================================
-- Eventos: rondas de golf, encuentros de natación y noches de puntos
-- =====================================================================
-- Devuelve cuántos eventos avisó.
create function private.event_reminders(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_weekdays constant text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  r record;
  v_sent integer := 0;
  v_start integer;
  v_label text;
  v_slot text;
  v_from integer;
  v_until integer;
  v_at text;
  v_day text;
  v_ttl integer;
  v_url text;
  v_tag text;
  v_what text;
  v_place text;
begin
  for r in
    select e.id, e.league_id, e.type, btrim(coalesce(e.name, '')) as name, e.date, e.start_time, e.config,
           l.sport, l.name as league_name, l.schedule,
           g.course_name, g.shotgun, t.name as tournament_name, g.round_no,
           x.local_now::date as today,
           (extract(hour from x.local_now) * 60 + extract(minute from x.local_now))::integer as minutes
      from public.events e
      join public.leagues l on l.id = e.league_id
      left join public.golf_rounds g on g.event_id = e.id
      left join public.golf_tournaments t on t.id = g.tournament_id
      left join public.swim_meets sm on sm.event_id = e.id
     cross join lateral (select p_now at time zone l.tz as local_now) x
     where ((l.sport = 'golf' and g.status = 'abierta')
         or (l.sport = 'swimming' and sm.event_id is not null and sm.finalized_at is null)
         or (l.sport in ('padel', 'pickleball') and e.type in ('americano', 'mexicano', 'noche')))
       -- Primero por la fecha en UTC (usa el índice; ninguna zona se aleja más de un día) y luego la de la liga.
       and e.date between (p_now at time zone 'UTC')::date - 1 and (p_now at time zone 'UTC')::date + 2
       and e.date in (x.local_now::date, x.local_now::date + 1)
     order by e.date, e.id
  loop
    -- Hora del evento; si no tiene, la del horario de la liga (como el boliche).
    if r.start_time is not null then
      v_start := extract(hour from r.start_time)::integer * 60 + extract(minute from r.start_time)::integer;
      v_label := private.format_time(substr(r.start_time::text, 1, 5));
    else
      select s.minutes, s.label into v_start, v_label from private.event_start(r.date, r.schedule) s;
    end if;

    v_slot := null;
    if r.date = r.today + 1 and r.minutes >= 12 * 60 and r.minutes < 21 * 60 then
      v_slot := 'dia-antes';
    elsif r.date = r.today then
      v_from := case when v_start is not null then greatest(7 * 60, least(12 * 60, v_start - 180)) else 12 * 60 end;
      v_until := case when v_start is not null then v_start - 10 else 18 * 60 end;
      if r.minutes >= v_from and r.minutes < v_until then
        v_slot := 'hoy';
      end if;
    end if;
    continue when v_slot is null;

    insert into public.reminders_sent (event_id, kind) values (r.id, v_slot || '@' || to_char(r.date, 'YYYY-MM-DD'))
    on conflict do nothing;
    continue when not found;

    v_at := coalesce(' a las ' || v_label, '');
    v_day := v_weekdays[extract(isodow from r.date)::integer];
    v_ttl := greatest(60, least(6 * 3600, ((case when v_slot = 'hoy' then 0 else 1440 end) + coalesce(v_start, 1440) - r.minutes) * 60));
    v_url := '/l/' || r.league_id::text || '/e/' || r.id::text;
    v_tag := 'recordatorio:' || r.id::text;

    if r.sport = 'golf' then
      v_place := concat_ws(' · ',
        coalesce(nullif(r.name, ''), r.tournament_name || coalesce(' · ronda ' || r.round_no, '')),
        nullif(btrim(coalesce(r.course_name, '')), ''),
        r.league_name);
      insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
      select u.user_id,
             left(case when u.card then (case when v_slot = 'hoy' then 'Hoy juegas' else 'Mañana juegas' end) || v_at
                       else 'Mañana hay ronda' || v_at end, 200),
             left(v_place || '. ' || case
               when not u.card then '¿Juegas? Inscríbete en la app.'
               else coalesce(u.grp, '') || case when v_slot = 'hoy' then 'Anota hoyo por hoyo en la app.' else '¡Buen juego!' end
             end, 1000),
             v_url, v_tag, v_ttl, 'high'
        from (
          select p.user_id, true as card,
                 case when c.group_no is not null
                      then 'Grupo ' || c.group_no || case when r.shotgun then ', sales por el hoyo ' || c.start_hole else '' end || '. '
                 end as grp
            from public.golf_cards c join public.players p on p.id = c.player_id
           where c.event_id = r.id and p.user_id is not null and not c.dq
             and exists (select 1 from public.league_members lm where lm.league_id = r.league_id and lm.user_id = p.user_id)
          union all
          select m.user_id, false, null
            from public.league_members m
           where m.league_id = r.league_id and v_slot = 'dia-antes'
             and not exists (select 1 from public.golf_cards c join public.players p on p.id = c.player_id
                              where c.event_id = r.id and p.user_id = m.user_id)
        ) u;

    elsif r.sport = 'swimming' then
      v_what := case r.type when 'control' then 'el control de marcas' when 'torneo' then 'el torneo' else 'el encuentro' end
                || case when r.name <> '' then ' ' || r.name else '' end;
      insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
      select m.user_id,
             left(case when v_slot = 'hoy' then 'Hoy es ' else 'Mañana es ' end || v_what, 200),
             left(case when v_slot = 'hoy'
                       then r.league_name || v_at || '. Llega temprano para el calentamiento. ¡Suerte!'
                       else r.league_name || ' · ' || v_day || v_at || '. Mira las pruebas y las series en la app.' end, 1000),
             v_url, v_tag, v_ttl, 'high'
        from public.league_members m
       where m.league_id = r.league_id;

    else
      -- Noche de puntos: a los jugadores de la noche (config.players) que tienen cuenta y siguen en la liga.
      v_what := case
        when coalesce(r.config ->> 'format', r.type) = 'mexicano' then 'mexicano'
        when r.sport = 'pickleball' then 'round robin'
        else 'americano' end;
      v_place := concat_ws(' · ', nullif(r.name, ''), r.league_name);
      insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
      select distinct p.user_id,
             left(case when v_slot = 'hoy' then 'Hoy hay ' else 'Mañana hay ' end || v_what || v_at, 200),
             left(v_place || case when v_slot = 'hoy'
                                  then '. En cada ronda te avisamos tu cancha.'
                                  else ' · ' || v_day || '. Si no puedes ir, avísale al organizador.' end, 1000),
             v_url, v_tag, v_ttl, 'high'
        from jsonb_array_elements_text(case when jsonb_typeof(r.config -> 'players') = 'array' then r.config -> 'players' else '[]'::jsonb end) j (pid)
        join public.players p on p.id::text = j.pid and p.league_id = r.league_id
       where p.user_id is not null
         and exists (select 1 from public.league_members lm where lm.league_id = r.league_id and lm.user_id = p.user_id);
    end if;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;

-- =====================================================================
-- La tarea de cada 15 minutos (la programa 20260927001290_avisos_supabase.sql)
-- =====================================================================
-- Encola los recordatorios de partidos y eventos, borra las marcas viejas (esos partidos ya pasaron) y, si
-- encoló algo, llama a send-push. Devuelve cuántos partidos y eventos avisó.
create function private.cron_match_reminders(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v integer := private.match_reminders(p_now) + private.event_reminders(p_now);
begin
  delete from private.match_reminders_sent where sent_at < p_now - interval '30 days';
  if v > 0 then
    perform private.kick_send_push();
  end if;
  return v;
end $$;

-- =====================================================================
-- Reclamos: «Reclamaron un resultado» a los organizadores
-- =====================================================================
-- Cuando el rival reclama (status → 'disputed'), los dueños y admins de la liga reciben el aviso con el link al
-- partido para resolverlo, y quien anotó el resultado (si no es organizador) sabe que se lo reclamaron. Nunca
-- a quien reclamó. Tag 'reclamo:<partido>'. Nunca frena el reclamo: si algo falla, solo avisa.
create function private.push_dispute() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_what text;
  v_note text := nullif(btrim(coalesce(new.dispute_note, '')), '');
  v_url text := '/l/' || new.league_id::text || '/juegos?partido=' || new.id::text;
  v_tag text := 'reclamo:' || new.id::text;
begin
  v_what := coalesce((select s.label from public.match_sides s where s.match_id = new.id and s.side = 1), 'Por definir')
            || ' contra '
            || coalesce((select s.label from public.match_sides s where s.match_id = new.id and s.side = 2), 'Por definir')
            || coalesce(': ' || nullif(btrim(coalesce(new.score ->> 'text', '')), ''), '')
            || '.' || coalesce(' «' || v_note || '».', '');
  insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
  select m.user_id, 'Reclamaron un resultado', left(v_what || ' Resuélvelo en la app.', 1000), v_url, v_tag, 259200, 'normal'
    from public.league_members m
   where m.league_id = new.league_id and m.role in ('owner', 'admin') and m.user_id is distinct from new.disputed_by;
  insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
  select m.user_id, 'Reclamaron tu resultado', left(v_what || ' El organizador lo va a revisar.', 1000), v_url, v_tag, 259200, 'normal'
    from public.league_members m
   where m.league_id = new.league_id and m.user_id = new.proposed_by and m.role = 'member'
     and m.user_id is distinct from new.disputed_by;
  if exists (select 1 from public.push_outbox o where o.tag = v_tag and o.sent_at is null) then
    perform private.kick_send_push();
  end if;
  return null;
exception when others then
  raise warning 'push del reclamo %: %', new.id, sqlerrm;
  return null;
end $$;

create trigger matches_push_dispute after update of status on public.matches for each row
  when (new.status = 'disputed' and old.status is distinct from 'disputed')
  execute function private.push_dispute();

-- =====================================================================
-- Permisos: nadie de la app ejecuta nada de esto
-- =====================================================================
revoke execute on function
  private.match_reminders(timestamptz, text[]),
  private.padel_match_reminders(timestamptz),
  private.event_reminders(timestamptz),
  private.cron_match_reminders(timestamptz),
  private.push_dispute()
from public, anon, authenticated;
