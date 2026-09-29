-- MatchMate · Avisos al teléfono de lo que importa, recordatorios nuevos y el espacio del plan gratis.
--
-- Hasta aquí casi todo esto solo se veía con la app abierta (la campana). Ahora sale por push:
--
-- 1. Preferencias por cuenta: profiles.push_prefs {resultados, social, recordatorios, liga} (todas activas salvo
--    las que están en false) y public.set_push_prefs(p_prefs). El trigger push_outbox_prefs las aplica a TODO lo
--    que entra a la cola por su tag (también a los avisos de antes: seguir, reclamos, recordatorios, avisos de la
--    liga), así no hace falta tocar las funciones que ya encolan. Lo que no es de ninguna categoría (reclamos de
--    jugador, inscripciones, escalera, rondas de la noche, anuncios del superadmin) sale siempre.
-- 2. private.queue_push(): la forma de encolar de aquí en adelante. Salta cuentas bloqueadas, sin teléfonos o con
--    la categoría apagada; no repite un tag que sigue esperando; con p_group_title junta en el que espera («Ana y
--    2 más…»); nunca falla (solo avisa) y llama a send-push.
-- 3. Triggers (después de escribir; ninguna RPC cambia):
--    - envíos del boliche aprobados o rechazados → a la cuenta del jugador (y a quien lo envió, si es otra);
--    - felicitaciones, me gusta y comentarios en juegos del boliche, y me gusta en partidos, golf y natación → a la
--      cuenta del dueño del juego, juntos por juego y como mucho uno nuevo cada 6 horas (comentarios: el último, y uno
--      nuevo cada 30 minutos);
--    - resultado confirmado → al lado que lo propuso. Proponer («Tienes un resultado por confirmar»,
--      push_result_to_confirm) y reclamar («Reclamaron un resultado», push_dispute) ya avisaban: no se repiten.
--    Solo lo que hace alguien en la app (con sesión) avisa: la importación de BowlingX y el SQL a mano no.
-- 4. Recordatorios: private.remind_after_bowling (el día después, a quien marcó «voy» y no subió nada),
--    private.remind_missing_results (partidos sin resultado 3 horas después de empezar) y el «¿Vas?» del día antes
--    (private.enqueue_due_reminders, la única función de antes que se redefine) ya no le llega a quien marcó «voy».
-- 5. Fotos y espacio: la cola private.storage_purge_queue (y los archivos sin fila en photos) los vacía la Edge
--    Function purge-photos con public.purge_queue_take / purge_queue_done / storage_orphans (solo service_role);
--    private.storage_usage() y private.check_storage_alert() avisan a los superadmins al 70 % del plan gratis, y la
--    consola lo lee con public.admin_storage_usage().
--
-- La programación con pg_cron está en 20260929000510_avisos_telefono_supabase.sql (solo Supabase). Todo lo de aquí
-- corre también en PGlite. Pruebas: tests/sql/avisos-telefono.test.ts.

-- =====================================================================
-- 1. Preferencias
-- =====================================================================
-- Solo las claves de private.push_categories() con true o false. Falta una = activa.
alter table public.profiles
  add column push_prefs jsonb not null default '{}' check (jsonb_typeof(push_prefs) = 'object' and pg_column_size(push_prefs) < 512);

create function private.push_categories() returns text[]
language sql immutable set search_path = '' as $$
  select array['resultados', 'social', 'recordatorios', 'liga']
$$;

-- ¿La cuenta quiere los avisos de esa categoría? Sí, salvo que la tenga en false (null = sin categoría: siempre).
create function private.push_pref(p_user uuid, p_category text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_category is null
      or coalesce((select p.push_prefs -> p_category from public.profiles p where p.id = p_user), 'true'::jsonb) <> 'false'::jsonb
$$;

-- Las cuatro, con su valor: {resultados, social, recordatorios, liga}.
create function private.push_prefs_of(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_object_agg(c, private.push_pref(p_user, c)) from unnest(private.push_categories()) c
$$;

-- La cuenta cambia sus avisos: p_prefs = {categoría: true|false} solo con las que cambian. Otra clave, otro tipo o
-- algo que no sea un objeto: 'invalido'. Devuelve las cuatro como quedaron.
create function public.set_push_prefs(p_prefs jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  k text;
begin
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then
    perform private.fail('invalido');
  end if;
  for k in select jsonb_object_keys(p_prefs) loop
    if not (k = any (private.push_categories())) or jsonb_typeof(p_prefs -> k) <> 'boolean' then
      perform private.fail('invalido');
    end if;
  end loop;
  update public.profiles p set push_prefs = p.push_prefs || p_prefs where p.id = v_uid;
  return private.push_prefs_of(v_uid);
end $$;

-- Categoría de un aviso por el principio de su tag (null = no se puede apagar).
create function private.push_category(p_tag text) returns text
language sql immutable set search_path = '' as $$
  select case split_part(coalesce(p_tag, ''), ':', 1)
    when 'envio' then 'resultados'
    when 'confirmar' then 'resultados'
    when 'resultado' then 'resultados'
    when 'reclamo' then 'resultados'
    when 'reaccion' then 'social'
    when 'comentario' then 'social'
    when 'seguir' then 'social'
    when 'recordatorio' then 'recordatorios'
    when 'partido' then 'recordatorios'
    when 'despues' then 'recordatorios'
    when 'sinresultado' then 'recordatorios'
    when 'aviso' then 'liga'
  end
$$;

-- Trigger: la fila de cada teléfono (la que deja push_outbox_fanout) no entra si la cuenta apagó esa categoría.
-- Corre después de push_outbox_fanout (los triggers van por orden de nombre).
create function private.push_outbox_prefs() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.push_pref(new.user_id, private.push_category(new.tag)) then
    return null;
  end if;
  return new;
end $$;

create trigger push_outbox_prefs before insert on public.push_outbox for each row
  when (new.subscription_id is not null)
  execute function private.push_outbox_prefs();

-- =====================================================================
-- 2. Encolar
-- =====================================================================
-- Un aviso para una cuenta (el trigger push_outbox_fanout lo reparte a sus teléfonos). No encola nada (false) si la
-- cuenta está bloqueada, no tiene teléfonos o apagó p_category (null = sin categoría). Con el mismo tag:
-- - p_group_title y uno que todavía espera (sin mandar ni tomar): se le cambia el texto (título p_group_title) en vez
--   de encolar otro («Ana y 2 más les gustó tu juego»);
-- - si no, mientras haya uno sin mandar con ese tag, no se encola otro.
-- Llama a send-push, salvo dentro de un lote (mm.push_batch = 'on': quien encola varios llama una vez al final).
-- Nunca falla: si algo sale mal, solo avisa (warning) y devuelve false.
create function private.queue_push(p_user uuid, p_category text, p_title text, p_body text, p_url text, p_tag text,
                                   p_ttl integer, p_group_title text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_tag text := left(p_tag, 100);
  v_n integer := 0;
begin
  if p_user is null or nullif(btrim(coalesce(p_title, '')), '') is null
     or not exists (select 1 from public.push_subscriptions s where s.user_id = p_user)
     or private.is_blocked(p_user)
     or not private.push_pref(p_user, p_category) then
    return false;
  end if;
  if p_group_title is not null and v_tag is not null then
    update public.push_outbox o set title = left(p_group_title, 200), body = left(p_body, 1000), url = left(p_url, 500)
     where o.user_id = p_user and o.tag = v_tag and o.sent_at is null and o.claimed_at is null and o.attempts < 5;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      return true;
    end if;
  end if;
  if v_tag is not null and exists (select 1 from public.push_outbox o
                                    where o.user_id = p_user and o.tag = v_tag and o.sent_at is null and o.attempts < 5) then
    return false;
  end if;
  insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
  values (p_user, left(p_title, 200), left(p_body, 1000), left(p_url, 500), v_tag, p_ttl, 'normal');
  if coalesce(current_setting('mm.push_batch', true), '') <> 'on' then
    perform private.kick_send_push();
  end if;
  return true;
exception when others then
  raise warning 'queue_push % para %: %', p_tag, p_user, sqlerrm;
  return false;
end $$;

-- ¿Toca avisar con ese tag? Sí si hay uno esperando (se le cambia el texto) o si no salió ninguno en p_every.
create function private.push_due(p_user uuid, p_tag text, p_every interval) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.push_outbox o
                  where o.user_id = p_user and o.tag = p_tag and o.sent_at is null and o.claimed_at is null and o.attempts < 5)
      or not exists (select 1 from public.push_outbox o
                      where o.user_id = p_user and o.tag = p_tag and o.created_at > now() - p_every)
$$;

-- '22 de septiembre'.
create function private.push_day(p date) returns text
language sql immutable set search_path = '' as $$
  select extract(day from p)::integer || ' de '
         || (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre',
                   'noviembre', 'diciembre'])[extract(month from p)::integer]
$$;

-- Evento del boliche para los textos: 'Práctica del 22 de septiembre', 'Torneo del 1 de octubre' o 'Copa del 1 de octubre'.
create function private.push_event_label(p_type text, p_name text, p_date date) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(btrim(coalesce(p_name, '')), ''), case p_type when 'torneo' then 'Torneo' else 'Práctica' end)
         || coalesce(' del ' || private.push_day(p_date), '')
$$;

-- 'Ana' o 'Ana y 2 más' (p_count: cuántas personas en total).
create function private.push_who(p_name text, p_count integer) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(btrim(coalesce(p_name, '')), ''), 'Alguien') || case when p_count > 1 then ' y ' || (p_count - 1) || ' más' else '' end
$$;

-- 'tu juego de 210', 'tu serie de 650' o 'tu juego' (sin pinos).
create function private.push_score(p_scores smallint[]) returns text
language sql immutable set search_path = '' as $$
  select case (select count(*) from unnest(p_scores) s where s is not null)
    when 0 then 'tu juego'
    when 1 then 'tu juego de ' || (select max(s) from unnest(p_scores) s)
    else 'tu serie de ' || (select sum(s) from unnest(p_scores) s)
  end
$$;

-- =====================================================================
-- 3a. Envíos del boliche: «Aprobaron tus juegos: serie de 650 en <liga>»
-- =====================================================================
-- A la cuenta del jugador y a quien lo envió (un admin o el anotador por otro), nunca a quien lo revisó ni a quien ya
-- no está en la liga.
-- Aprobado: los pinos que quedaron en la participación con la foto de este envío (el admin pudo corregirlos); sin
-- foto, los enviados. Rechazado: con la nota del admin.
create function private.push_submission_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_owner uuid;
  v_player text;
  v_league text;
  e public.events;
  v_scores smallint[];
  v_n integer;
  v_sum integer;
  v_url text := '/l/' || new.league_id::text || coalesce('/e/' || new.event_id::text, '');
  v_to uuid;
  v_title text;
  v_body text;
begin
  if v_me is null then
    return null;
  end if;
  select p.user_id, p.name into v_owner, v_player from public.players p where p.id = new.player_id;
  select l.name into v_league from public.leagues l where l.id = new.league_id;
  select * into e from public.events x where x.id = new.event_id;
  if new.status = 'aprobado' and new.photo_id is not null and e.id is not null then
    select array_agg(s.v order by s.i) into v_scores
      from public.entries x
      cross join lateral unnest(x.scores, x.photos) with ordinality as s (v, ph, i)
     where x.event_id = e.id and x.player_id = new.player_id and s.ph = new.photo_id::text and s.v is not null;
  end if;
  v_scores := coalesce(v_scores, new.scores);
  select count(*)::integer, sum(s)::integer into v_n, v_sum from unnest(v_scores) s where s is not null;

  -- Solo las cuentas que siguen en la liga (quien lo envió por otro y se salió ya no recibe; el jugador siempre está:
  -- players.user_id se vacía al salir).
  for v_to in select distinct u from unnest(array[v_owner, new.created_by]) u
               where u is not null and u <> v_me
                 and exists (select 1 from public.league_members m where m.league_id = new.league_id and m.user_id = u) loop
    if new.status = 'aprobado' then
      v_title := case
        when v_to = v_owner and v_n = 1 then 'Aprobaron tu juego de ' || v_sum
        when v_to = v_owner then 'Aprobaron tus juegos: serie de ' || v_sum
        when v_n = 1 then 'Aprobaron el juego de ' || v_player || ': ' || v_sum
        else 'Aprobaron los juegos de ' || v_player || ': serie de ' || v_sum
      end || ' en ' || v_league;
      v_body := private.push_event_label(e.type, e.name, coalesce(e.date, new.date)) || '.';
    else
      v_title := 'No aprobaron '
        || case when v_to = v_owner then case when v_n = 1 then 'tu juego' else 'tus juegos' end
                else case when v_n = 1 then 'el juego' else 'los juegos' end || ' de ' || v_player end
        || coalesce(' del ' || private.push_day(coalesce(e.date, new.date)), '');
      v_body := v_league || '. '
        || coalesce('Motivo: «' || nullif(btrim(coalesce(new.note, '')), '') || '»', 'Si crees que es un error, habla con el admin.');
    end if;
    perform private.queue_push(v_to, 'resultados', v_title, v_body, v_url, 'envio:' || new.id::text, 172800);
  end loop;
  return null;
exception when others then
  raise warning 'push del envío %: %', new.id, sqlerrm;
  return null;
end $$;

create trigger submissions_push_review after update of status on public.submissions for each row
  when (old.status = 'pendiente' and new.status in ('aprobado', 'rechazado'))
  execute function private.push_submission_review();

-- =====================================================================
-- 3b. Social del boliche: felicitaciones, me gusta y comentarios
-- =====================================================================
-- «Ana te felicitó por tu serie de 650», «A Ana le gustó tu juego»; juntos por juego (tag 'reaccion:<participación>'):
-- «Ana y 3 más te felicitaron…», «A Ana y 3 más les gustó tu juego» o, mezclados, «Ana y 3 más reaccionaron a…».
-- Si el aviso anterior todavía espera, se le cambia el texto; si ya salió, el siguiente sale después de 6 horas.
-- Nunca a uno mismo ni por reacciones que no hizo la cuenta de la sesión.
create function private.push_reaction() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_tag text := 'reaccion:' || new.entry_id::text;
  v_n integer;
  v_types text[];
  v_what text;
  v_who text;
  v_title text;
  x public.entries;
  e public.events;
begin
  if auth.uid() is distinct from new.user_id then
    return null;
  end if;
  select p.user_id into v_owner from public.players p where p.id = new.player_id;
  if v_owner is null or v_owner = new.user_id or not private.push_due(v_owner, v_tag, interval '6 hours') then
    return null;
  end if;
  select count(*)::integer, array_agg(distinct r.type) into v_n, v_types
    from public.reactions r where r.entry_id = new.entry_id and r.user_id <> v_owner;
  select * into x from public.entries y where y.id = new.entry_id;
  select * into e from public.events y where y.id = new.event_id;
  v_what := private.push_score(x.scores);
  v_who := private.push_who(new.author_name, v_n);
  v_title := case
    when cardinality(v_types) > 1 then v_who || ' reaccionaron a ' || v_what
    when new.type = 'felicitar' then v_who || case when v_n > 1 then ' te felicitaron por ' else ' te felicitó por ' end || v_what
    else 'A ' || v_who || case when v_n > 1 then ' les gustó tu juego' else ' le gustó tu juego' end
  end;
  perform private.queue_push(v_owner, 'social', v_title,
                             private.push_event_label(e.type, e.name, e.date) || ' · ' || (select l.name from public.leagues l where l.id = new.league_id),
                             '/l/' || new.league_id::text || '/juegos?juego=' || new.entry_id::text, v_tag, 86400, v_title);
  return null;
exception when others then
  raise warning 'push de la reacción %: %', new.id, sqlerrm;
  return null;
end $$;

create trigger reactions_push after insert on public.reactions for each row execute function private.push_reaction();
-- Cambiar de «me gusta» a felicitar (set_reaction) también avisa.
create trigger reactions_push_type after update of type on public.reactions for each row
  when (new.type is distinct from old.type)
  execute function private.push_reaction();

-- «Ana comentó tu juego: «<los primeros 80>»». Tag 'comentario:<participación>': si el anterior todavía espera, sale
-- el último comentario en su lugar; si ya salió, el siguiente sale después de 30 minutos (add_comment deja comentar
-- cada 3 segundos: sin esto, una conversación sería un push por comentario). Los de en medio se ven en la app.
create function private.push_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_tag text := 'comentario:' || new.entry_id::text;
  v_text text := btrim(regexp_replace(new.text, '\s+', ' ', 'g'));
  v_title text;
  e public.events;
begin
  if auth.uid() is distinct from new.user_id then
    return null;
  end if;
  select p.user_id into v_owner from public.players p where p.id = new.player_id;
  if v_owner is null or v_owner = new.user_id or not private.push_due(v_owner, v_tag, interval '30 minutes') then
    return null;
  end if;
  select * into e from public.events y where y.id = new.event_id;
  v_title := private.push_who(new.author_name, 1) || ' comentó tu juego: «'
             || case when char_length(v_text) > 80 then rtrim(left(v_text, 80)) || '…' else v_text end || '»';
  perform private.queue_push(v_owner, 'social', v_title,
                             private.push_event_label(e.type, e.name, e.date) || ' · ' || (select l.name from public.leagues l where l.id = new.league_id),
                             '/l/' || new.league_id::text || '/juegos?juego=' || new.entry_id::text, v_tag, 86400, v_title);
  return null;
exception when others then
  raise warning 'push del comentario %: %', new.id, sqlerrm;
  return null;
end $$;

create trigger comments_push after insert on public.comments for each row execute function private.push_comment();

-- =====================================================================
-- 3c. Me gusta en partidos, golf y natación
-- =====================================================================
-- «A Ana le gustó tu partido» (ronda, prueba), juntos por juego como los del boliche (tag 'reaccion:<juego>' y, en un
-- partido, ':<jugador>'), a la cuenta del jugador cuyo juego es.
create function private.push_game_like() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_target uuid := coalesce(new.match_id, new.golf_card_id, new.swim_entry_id);
  v_tag text;
  v_n integer;
  v_name text;
  v_title text;
  v_url text;
begin
  if auth.uid() is distinct from new.user_id then
    return null;
  end if;
  select p.user_id into v_owner from public.players p where p.id = new.player_id;
  v_tag := 'reaccion:' || v_target::text || case when new.kind = 'match' then ':' || new.player_id::text else '' end;
  if v_owner is null or v_owner = new.user_id or not private.push_due(v_owner, v_tag, interval '6 hours') then
    return null;
  end if;
  select count(*)::integer into v_n
    from public.game_likes g
   where g.user_id <> v_owner
     and case new.kind when 'match' then g.match_id = new.match_id and g.player_id = new.player_id
                       when 'golf' then g.golf_card_id = new.golf_card_id
                       else g.swim_entry_id = new.swim_entry_id end;
  v_name := coalesce((select m.display_name from public.league_members m where m.league_id = new.league_id and m.user_id = new.user_id),
                     (select p.name from public.profiles p where p.id = new.user_id));
  v_title := 'A ' || private.push_who(v_name, v_n) || case when v_n > 1 then ' les gustó ' else ' le gustó ' end
             || case new.kind when 'match' then 'tu partido' when 'golf' then 'tu ronda' else 'tu prueba' end;
  v_url := '/l/' || new.league_id::text || case
    when new.kind = 'match' then '/juegos?partido=' || new.match_id::text
    when new.kind = 'golf' then '/e/' || (select c.event_id from public.golf_cards c where c.id = new.golf_card_id)::text
    else '/e/' || (select s.event_id from public.swim_entries s where s.id = new.swim_entry_id)::text end;
  perform private.queue_push(v_owner, 'social', v_title, (select l.name from public.leagues l where l.id = new.league_id),
                             v_url, v_tag, 86400, v_title);
  return null;
exception when others then
  raise warning 'push del me gusta %: %', new.id, sqlerrm;
  return null;
end $$;

create trigger game_likes_push after insert on public.game_likes for each row execute function private.push_game_like();

-- =====================================================================
-- 3d. Partidos: «Confirmaron el resultado» al lado que lo propuso
-- =====================================================================
-- Cuando el rival confirma (o el organizador resuelve el reclamo o corrige el resultado propuesto), las cuentas del
-- lado que lo anotó (raqueta: sus jugadores o su pareja; equipos: capitán y delegado) y quien lo anotó, si siguen en la
-- liga. Nunca a quien confirmó. Tag 'resultado:<partido>'.
create function private.push_result_confirmed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_side smallint := old.proposed_side;
  v_family text := private.league_family(new.league_id);
  v_body text;
  v_to uuid;
begin
  v_body := coalesce((select s.label from public.match_sides s where s.match_id = new.id and s.side = 1), 'Por definir')
            || ' contra '
            || coalesce((select s.label from public.match_sides s where s.match_id = new.id and s.side = 2), 'Por definir')
            || coalesce(': ' || nullif(btrim(coalesce(new.score ->> 'text', '')), ''), '') || '. '
            || case when old.status = 'disputed' then 'El organizador resolvió el reclamo.' else 'Ya cuenta en la tabla.' end;
  for v_to in
    select distinct u.user_id
      from (
        select p.user_id from public.match_players mp join public.players p on p.id = mp.player_id
         where mp.match_id = new.id and mp.side = v_side and v_family = 'racket'
        union
        select p.user_id from public.match_sides ms
          join public.team_players tp on tp.team_id = ms.team_id
          join public.players p on p.id = tp.player_id
         where ms.match_id = new.id and ms.side = v_side and (v_family = 'racket' or tp.role in ('captain', 'delegate'))
        union
        select old.proposed_by
      ) u
     where u.user_id is not null and u.user_id is distinct from new.confirmed_by and u.user_id is distinct from auth.uid()
       -- Quien lo anotó y se salió de la liga ya no recibe (los jugadores sí están: players.user_id se vacía al salir).
       and exists (select 1 from public.league_members m where m.league_id = new.league_id and m.user_id = u.user_id)
  loop
    perform private.queue_push(v_to, 'resultados', 'Confirmaron el resultado', v_body,
                               '/l/' || new.league_id::text || '/juegos?partido=' || new.id::text, 'resultado:' || new.id::text, 172800);
  end loop;
  return null;
exception when others then
  raise warning 'push del resultado confirmado %: %', new.id, sqlerrm;
  return null;
end $$;

create trigger matches_push_confirmed after update of status on public.matches for each row
  when (new.status = 'confirmed' and old.status in ('finished', 'disputed') and old.proposed_side is not null)
  execute function private.push_result_confirmed();

-- =====================================================================
-- 4. Recordatorios
-- =====================================================================
-- Marcas de «ya se avisó» de los recordatorios de aquí (una vez por clave, aunque el cron corra otra vez). Se borran
-- a los 30 días.
create table private.push_once (
  key text primary key check (char_length(key) <= 120),
  sent_at timestamptz not null default now()
);
revoke all on private.push_once from public, anon, authenticated;

-- «¿Cómo te fue anoche? Sube tus juegos de <liga>»: eventos del boliche de ayer (en la hora de la liga) a cada jugador
-- con cuenta que marcó «voy» y no tiene ningún juego anotado en ese evento ni un envío de ese evento o esa fecha.
-- Una vez por jugador y evento. Lo programa 20260929000510_avisos_telefono_supabase.sql a las 9:00 am de Santo
-- Domingo. Devuelve cuántos avisos encoló.
create function private.remind_after_bowling(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_tag text;
  v_sent integer := 0;
begin
  perform set_config('mm.push_batch', 'on', true);
  for r in
    select e.id as event_id, e.league_id, l.name as league_name, p.id as player_id, p.user_id
      from public.events e
      join public.leagues l on l.id = e.league_id
      join public.event_rsvps v on v.event_id = e.id and v.going
      join public.players p on p.id = v.player_id
     where l.sport = 'bowling'
       -- Primero por la fecha en UTC (usa el índice; ninguna zona se aleja más de un día) y luego la de la liga.
       and e.date between (p_now at time zone 'UTC')::date - 2 and (p_now at time zone 'UTC')::date
       and e.date = (p_now at time zone l.tz)::date - 1
       and p.user_id is not null
       and not exists (select 1 from public.entries x
                        where x.event_id = e.id and x.player_id = p.id and exists (select 1 from unnest(x.scores) s where s is not null))
       and not exists (select 1 from public.submissions s where s.player_id = p.id and (s.event_id = e.id or s.date = e.date))
     order by e.id, p.id
  loop
    v_tag := 'despues:' || r.event_id::text || ':' || r.player_id::text;
    insert into private.push_once (key, sent_at) values (v_tag, p_now) on conflict do nothing;
    continue when not found;
    if private.queue_push(r.user_id, 'recordatorios', '¿Cómo te fue anoche? Sube tus juegos de ' || r.league_name,
                          'Anótalos o sube la foto del marcador para que cuenten en tu promedio.',
                          '/l/' || r.league_id::text || '/e/' || r.event_id::text || '?anotar=1', v_tag, 43200) then
      v_sent := v_sent + 1;
    end if;
  end loop;
  perform set_config('mm.push_batch', '', true);
  delete from private.push_once where sent_at < p_now - interval '30 days';
  if v_sent > 0 then
    perform private.kick_send_push();
  end if;
  return v_sent;
end $$;

-- «¿Cómo quedó <A> vs <B>?»: partidos programados (o en vivo sin nadie anotando) de los últimos 3 días que empezaron
-- hace 3 horas o más y siguen sin resultado. A quienes lo pueden anotar desde un lado (raqueta: los jugadores y su
-- pareja; equipos: capitán y delegado) y al anotador que tenía el turno. Una vez por partido; no las noches de
-- americano o mexicano (esas las anota el organizador). De noche (de 10:00 pm a 8:00 am en la hora de la liga) no
-- avisa ni deja la marca: el partido de las 9:00 pm sale en la corrida de las 8 de la mañana. Lo programa
-- 20260929000510_avisos_telefono_supabase.sql cada hora. Devuelve a cuántos partidos avisó.
create function private.remind_missing_results(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_to uuid;
  v_tag text;
  v_any boolean;
  v_sent integer := 0;
begin
  perform set_config('mm.push_batch', 'on', true);
  for r in
    select m.id, m.league_id, m.scorer_id, l.name as league_name, s.family,
           coalesce((select x.label from public.match_sides x where x.match_id = m.id and x.side = 1), 'Por definir') as a,
           coalesce((select x.label from public.match_sides x where x.match_id = m.id and x.side = 2), 'Por definir') as b
      from public.matches m
      join public.leagues l on l.id = m.league_id
      join public.sport_status s on s.id = l.sport
     where m.scheduled_at <= p_now - interval '3 hours'
       and m.scheduled_at > p_now - interval '3 days'
       and (m.status = 'scheduled' or (m.status = 'live' and (m.lease_until is null or m.lease_until < p_now)))
       and m.format not in ('americano', 'mexicano')
       and extract(hour from p_now at time zone l.tz) between 8 and 21
     order by m.scheduled_at, m.id
  loop
    v_tag := 'sinresultado:' || r.id::text;
    insert into private.push_once (key, sent_at) values (v_tag, p_now) on conflict do nothing;
    continue when not found;
    v_any := false;
    for v_to in
      select distinct u.user_id
        from (
          select p.user_id from public.match_players mp join public.players p on p.id = mp.player_id
           where mp.match_id = r.id and r.family = 'racket'
          union
          select p.user_id from public.match_sides ms
            join public.team_players tp on tp.team_id = ms.team_id
            join public.players p on p.id = tp.player_id
           where ms.match_id = r.id and (r.family = 'racket' or tp.role in ('captain', 'delegate'))
          union
          select r.scorer_id
        ) u
       where u.user_id is not null
         and exists (select 1 from public.league_members lm where lm.league_id = r.league_id and lm.user_id = u.user_id)
    loop
      if private.queue_push(v_to, 'recordatorios', '¿Cómo quedó ' || r.a || ' vs ' || r.b || '?',
                            r.league_name || '. Anota el resultado en la app.',
                            '/l/' || r.league_id::text || '/juegos?partido=' || r.id::text, v_tag, 43200) then
        v_any := true;
      end if;
    end loop;
    if v_any then
      v_sent := v_sent + 1;
    end if;
  end loop;
  perform set_config('mm.push_batch', '', true);
  if v_sent > 0 then
    perform private.kick_send_push();
  end if;
  return v_sent;
end $$;

-- El recordatorio del boliche de 20260926001200_push.sql, igual, salvo una cosa: el del día antes («¿Vas? Confírmalo
-- en la app.») ya no le llega a quien ya marcó «voy» en ese evento (los del mismo día sí, a todos). Las preferencias
-- (recordatorios) las aplica el trigger push_outbox_prefs.
create or replace function private.enqueue_due_reminders(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_last record;
  v_sent integer := 0;
begin
  for r in
    select e.id, e.league_id, e.date, e.type, e.name, l.name as league_name, l.schedule,
           x.local_now::date as today,
           (extract(hour from x.local_now) * 60 + extract(minute from x.local_now))::integer as minutes
      from public.events e
      join public.leagues l on l.id = e.league_id
     cross join lateral (select p_now at time zone l.tz as local_now) x
     -- Primero por la fecha en UTC (usa el índice; ninguna zona se aleja más de un día) y luego la de la liga.
     -- Solo boliche: los textos son de prácticas y torneos en la bolera. Los deportes de partidos avisan cada
     -- partido (private.padel_match_reminders y los de cada deporte).
     where l.sport = 'bowling'
       and e.date between (p_now at time zone 'UTC')::date - 1 and (p_now at time zone 'UTC')::date + 2
       and e.date in (x.local_now::date, x.local_now::date + 1)
     order by e.date, e.id
  loop
    with due as (
      select d.ord, d.slot, d.title, d.body
        from private.due_reminders(r.date, r.type, r.name, r.league_name, r.schedule, r.today, r.minutes) d
    ), fresh as (
      insert into public.reminders_sent (event_id, kind)
      select r.id, d.slot || '@' || to_char(r.date, 'YYYY-MM-DD') from due d
      on conflict do nothing
      returning kind
    )
    select d.slot, d.title, d.body into v_last
      from due d join fresh f on f.kind = d.slot || '@' || to_char(r.date, 'YYYY-MM-DD')
     order by d.ord desc
     limit 1;
    continue when not found;
    -- Una fila por miembro; el trigger push_outbox_fanout la reparte a sus teléfonos.
    insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
    select m.user_id, v_last.title, v_last.body, '/l/' || r.league_id::text || '/e/' || r.id::text,
           'recordatorio:' || r.id::text, private.reminder_ttl(r.date, r.schedule, r.today, r.minutes), 'high'
      from public.league_members m
     where m.league_id = r.league_id
       and not (v_last.slot = 'dia-antes'
                and exists (select 1 from public.event_rsvps v join public.players p on p.id = v.player_id
                             where v.event_id = r.id and p.user_id = m.user_id));
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;

-- =====================================================================
-- 5. Fotos: cola de borrado, archivos huérfanos y espacio del plan gratis
-- =====================================================================
-- claimed_at: purge-photos lo tomó (nadie más lo toma en 10 minutos; si la función se cae, se vuelve a tomar).
-- attempts: cuántas veces se tomó (a las 10 se deja de intentar; queda para revisarlo a mano).
alter table private.storage_purge_queue
  add column claimed_at timestamptz,
  add column attempts smallint not null default 0;

-- Una foto que se vuelve a registrar con la misma ruta (el mismo id: la importación de BowlingX corrida otra vez, una
-- operación vieja de la cola del teléfono) sale de la cola: su archivo vuelve a estar en uso.
create function private.photo_unqueue_purge() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.storage_purge_queue q where q.path = new.path;
  return null;
end $$;

create trigger photos_unqueue_purge after insert on public.photos for each row execute function private.photo_unqueue_purge();

-- Toma hasta p_limit rutas de la cola (1–1000; 500 por defecto) para borrarlas del bucket 'scoreboards'. Antes saca
-- las que tienen otra vez fila en public.photos (encoladas antes de photos_unqueue_purge): esas no se borran nunca.
create function public.purge_queue_take(p_limit integer default 500) returns table (path text)
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.storage_purge_queue q where exists (select 1 from public.photos p where p.path = q.path);
  return query
  with picked as (
    select q.path
      from private.storage_purge_queue q
     where q.attempts < 10 and (q.claimed_at is null or q.claimed_at < now() - interval '10 minutes')
     order by q.queued_at, q.path
     limit private.clamp_int(p_limit, 1, 1000, 500)
       for update of q skip locked
  )
  update private.storage_purge_queue q set claimed_at = now(), attempts = q.attempts + 1
    from picked x
   where q.path = x.path
  returning q.path;
end $$;

-- Las rutas ya borradas del bucket salen de la cola. Devuelve cuántas.
create function public.purge_queue_done(p_paths text[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  delete from private.storage_purge_queue q where q.path = any (coalesce(p_paths, '{}'));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Archivos del bucket 'scoreboards' sin fila en public.photos, subidos hace más de 30 días (hasta p_limit, 1–1000). La
-- app sube el archivo ANTES de la RPC que registra la foto, y esa RPC puede esperar semanas en la cola del teléfono
-- (sin señal, o esperando la versión nueva de la app): 30 días es lo que private.op_log recuerda una operación, y la
-- app vuelve a subir la foto si la subió hace más de 7 (src/lib/data/uploads.ts). Sin esquema storage (PGlite sin
-- shim): ninguno.
create function public.storage_orphans(p_limit integer default 500) returns table (path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;
  return query execute $q$
    select o.name::text
      from storage.objects o
     where o.bucket_id = 'scoreboards'
       and o.created_at < now() - interval '30 days'
       and not exists (select 1 from public.photos p where p.path = o.name)
     order by o.created_at, o.name
     limit $1
  $q$ using private.clamp_int(p_limit, 1, 1000, 500);
end $$;

-- Espacio usado contra los topes del plan gratis de Supabase: {dbBytes, dbLimit, storageBytes, storageLimit, dbPct,
-- storagePct} (porcentajes con un decimal). La base: pg_database_size; los archivos: metadata.size de
-- storage.objects (todos los buckets; 0 si no existe o no se puede leer).
create function private.storage_usage() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c_db_limit constant bigint := 524288000;
  c_storage_limit constant bigint := 1073741824;
  v_db bigint := 0;
  v_storage bigint := 0;
begin
  begin
    v_db := coalesce(pg_database_size(current_database()), 0);
  exception when others then
    v_db := 0;
  end;
  if to_regclass('storage.objects') is not null then
    begin
      execute $q$select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint from storage.objects o
                  where o.metadata ->> 'size' ~ '^[0-9]{1,18}$'$q$
        into v_storage;
    exception when others then
      v_storage := 0;
    end;
  end if;
  return jsonb_build_object(
    'dbBytes', v_db,
    'dbLimit', c_db_limit,
    'storageBytes', v_storage,
    'storageLimit', c_storage_limit,
    'dbPct', round(v_db * 100.0 / c_db_limit, 1),
    'storagePct', round(v_storage * 100.0 / c_storage_limit, 1));
end $$;

-- Alertas de espacio que ya salieron (una cada 3 días como mucho).
create table private.storage_alerts (
  at timestamptz primary key,
  pct numeric not null,
  usage jsonb not null
);
revoke all on private.storage_alerts from public, anon, authenticated;

-- Si la base o los archivos van por el 70 % o más del plan gratis y no se avisó en los últimos 3 días: push a cada
-- superadmin «El espacio de MatchMate va por 72 %» con el link a la consola (Sistema). Devuelve si avisó. Solo cuenta
-- como aviso (y solo entonces se esperan 3 días) si se encoló al menos un push: sin ningún superadmin con teléfono, o
-- con el anterior todavía sin salir, devuelve false y la corrida del día siguiente lo intenta otra vez. La programa
-- 20260929000510_avisos_telefono_supabase.sql a diario.
create function private.check_storage_alert(p_now timestamptz default now()) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb := private.storage_usage();
  v_pct numeric := greatest((v ->> 'dbPct')::numeric, (v ->> 'storagePct')::numeric);
  v_body text;
  v_to uuid;
  v_queued integer := 0;
begin
  if v_pct < 70 then
    return false;
  end if;
  -- Dos corridas a la vez esperan una a la otra: sale una sola.
  perform pg_advisory_xact_lock(hashtext('mm:storage_alert'));
  if exists (select 1 from private.storage_alerts a where a.at > p_now - interval '3 days') then
    return false;
  end if;
  v_body := 'Base de datos: ' || round((v ->> 'dbPct')::numeric) || ' % de 500 MB. Fotos: '
            || round((v ->> 'storagePct')::numeric) || ' % de 1 GB. Toca para ver el detalle.';
  -- TODO: mandar también un correo a los superadmins cuando haya SMTP configurado (hoy solo sale el push).
  perform set_config('mm.push_batch', 'on', true);
  for v_to in select p.id from public.profiles p where p.is_superadmin and p.blocked_at is null order by p.id loop
    if private.queue_push(v_to, null, 'El espacio de MatchMate va por ' || round(v_pct) || ' %', v_body,
                          '/superadmin/sistema', 'espacio', 86400) then
      v_queued := v_queued + 1;
    end if;
  end loop;
  perform set_config('mm.push_batch', '', true);
  if v_queued = 0 then
    return false;
  end if;
  insert into private.storage_alerts (at, pct, usage) values (p_now, v_pct, v) on conflict (at) do nothing;
  delete from private.storage_alerts a where a.at < p_now - interval '400 days';
  perform private.kick_send_push();
  return true;
end $$;

-- Consola (Sistema): el uso del plan gratis, la última alerta y lo que falta borrar del bucket.
-- {dbBytes, dbLimit, storageBytes, storageLimit, dbPct, storagePct, lastAlertAt, purgePending}.
create function public.admin_storage_usage() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_super();
  return private.storage_usage() || jsonb_build_object(
    'lastAlertAt', private.iso((select max(a.at) from private.storage_alerts a)),
    'purgePending', (select count(*) from private.storage_purge_queue q where q.attempts < 10)::integer);
end $$;

-- Llama a una Edge Function con pg_net y el secreto compartido (x-cron-secret), igual que private.kick_send_push:
-- 'project_url' y 'cron_secret' en Vault. Sin pg_net, Vault o esos secretos (PGlite) no hace nada y devuelve false.
-- Nunca frena a quien la llama.
create function private.kick_function(p_function text, p_body jsonb default '{}', p_timeout_ms integer default 60000) returns boolean
language plpgsql set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  if coalesce(p_function, '') !~ '^[a-z0-9-]{1,40}$'
     or to_regclass('vault.decrypted_secrets') is null
     or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return false;
  end if;
  execute $q$
    select btrim(max(decrypted_secret) filter (where name = 'project_url'), E' \t\r\n'),
           btrim(max(decrypted_secret) filter (where name = 'cron_secret'), E' \t\r\n')
      from vault.decrypted_secrets
     where name in ('project_url', 'cron_secret')
  $q$ into v_url, v_secret;
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return false;
  end if;
  execute 'select net.http_post(url => $1, body => $2, headers => $3, timeout_milliseconds => $4)'
    using rtrim(v_url, '/') || '/functions/v1/' || p_function, coalesce(p_body, '{}'::jsonb),
          jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
          least(greatest(coalesce(p_timeout_ms, 60000), 1000), 300000);
  return true;
exception when others then
  raise warning 'kick_function %: %', p_function, sqlerrm;
  return false;
end $$;

-- =====================================================================
-- Permisos: set_push_prefs y admin_storage_usage con sesión; la cola de fotos solo service_role (purge-photos);
-- lo demás, nadie de la app. enqueue_due_reminders conserva los suyos (create or replace).
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array['set_push_prefs', 'admin_storage_usage'];
  v_service constant text[] := array['purge_queue_take', 'purge_queue_done', 'storage_orphans'];
  v_private constant text[] := array[
    'push_categories', 'push_pref', 'push_prefs_of', 'push_category', 'push_outbox_prefs', 'queue_push', 'push_due',
    'push_day', 'push_event_label', 'push_who', 'push_score', 'push_submission_review', 'push_reaction', 'push_comment',
    'push_game_like', 'push_result_confirmed', 'remind_after_bowling', 'remind_missing_results', 'photo_unqueue_purge',
    'storage_usage', 'check_storage_alert', 'kick_function'
  ];
begin
  for f in select p.oid::regprocedure as sig, n.nspname, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and p.proname = any (v_rpc || v_service))
               or (n.nspname = 'private' and p.proname = any (v_private)) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' and f.proname = any (v_rpc) then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.nspname = 'public' then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;
