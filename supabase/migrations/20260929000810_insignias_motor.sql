-- MatchMate · Insignias: el motor (diseño en docs/insignias.md §3.1–§3.6 y §3.8). Los datos (badge_awards,
-- badge_progress, badge_stats y las RPC del jugador) están en 20260929000800_insignias.sql; lo de temporadas en
-- …0880 (se activa solo cuando existe public.seasons); el cron de Supabase en …0890.
--
-- Cómo corre:
--   cambios en resultados ──trigger──▶ private.badge_queue ◀── private.badges_daily (00:30 de Santo Domingo)
--   pg_cron (…0890) → private.cron_badges() → Edge Function `insignias` (pg_net, private.kick_badges):
--     badge_claim → por trabajo: badge_snapshot → evaluate(job, snapshot) (motor puro, src/badges) → badge_apply
--     (o badge_fail si el motor falló; badge_release si no alcanzó a correr) → badge_finish (avisos y, si queda
--     cola, se vuelve a llamar).
--   El trabajo 'aviso' no pasa por el motor: lo resuelve private.badge_send_notices (push agrupado).
--
-- 1. Cola: private.badge_queue (un trabajo por kind, liga, cuenta y ref mientras no se tome; lo repetido se junta),
--    private.badge_runs (un trabajo de periodo corre una vez: ni se vuelve a encolar ni se aplica dos veces), las
--    corridas en seco del historial (private.badge_dry_holders → private.badge_dry_runs) y los jugadores que un
--    dueño o admin se vinculó a sí mismo (private.badge_self_links: de ellos solo cuenta lo verificado, §1.6).
-- 2. Triggers que encolan (nunca frenan la escritura: si algo falla, solo avisan): entries, matches (y su borrado),
--    match_players, golf_cards, golf_rounds, swim_meets, swim_entries (borrado), ladder_challenges, players
--    (vínculos) y events (cierre del mes de cajas, con la foto del mes antes de podarla).
-- 3. Lo que ve el motor: private.badge_snapshot(job) arma en jsonb las filas que necesita cada trabajo
--    (contrato en src/badges/snapshot.ts y en supabase/README.md, «Motor de insignias»). La actividad válida y las
--    ligas reales se calculan aquí en SQL (private.badge_activity) para los trabajos que suman muchas ligas.
-- 4. private.badge_apply(job, decisiones): da, reactiva (solo las retiradas por evidencia), sube a firme, revoca
--    provisionales, pide avales (push a los revisores), pasa copias de respaldo a la cuenta ('adopt'), escribe el
--    progreso, anota badge_runs, encola el 'aviso' de cada cuenta y borra el trabajo. Todo o nada: si falla, el
--    trabajo vuelve a la cola con espera (2^intentos minutos) y a los 5 intentos queda para el superadmin.
-- 5. private.badge_send_notices: un push agrupado por cuenta ('insignias'), nunca entre 9:00 pm y 8:00 am, como
--    mucho uno cada 6 h; nada de ocultas, ligas con menores, jugadores sin cuenta ni cuentas bloqueadas.
-- 6. private.badges_daily: firmes a los 7 días, podios de boliche (+3 días), noches cerradas, foto de la escalera
--    (día 1), meses (día 3), años (7 de enero), cuentas con algo nuevo de hace 48 h, rareza y limpieza.
-- 7. RPC: badge_notices (la app: insignias sin ver y hazañas por confirmar) y badges_backfill (superadmin); para la
--    Edge Function, solo service_role: badge_claim, badge_snapshot, badge_apply, badge_fail, badge_release y
--    badge_finish.
-- 8. private.badge_signal (de …0800) ahora encola: 'merge' → 'vinculo', 'review' → el aviso del jugador.
-- 9. Tiempo real (private.emit_badges): 'badges' por user:<cuenta> cuando cambia algo de sus insignias (el aviso de
--    desbloqueo sale en segundos) y por league:<liga> cuando cambia algo que se ve en la liga.
-- 10. public.update_entry (misma firma): una marca nueva que valida un juego ('importado' o una foto) tiene que ser
--    una foto de la liga; 'importado' solo lo escribe el importador.

-- =====================================================================
-- Tablas (solo servidor)
-- =====================================================================

-- Trabajos del motor. ref dice qué tocó ('entry:<id>', 'match:<id>', '2026-10'…; ver el README) y payload lo que
-- después no se puede leer (jugadores y cuentas de un borrado, la foto del mes de cajas o de la escalera).
-- attempts sube al probarlo (public.badge_snapshot, o badge_fail si la foto falló), no al tomarlo: un trabajo que
-- tumba la función cinco veces se queda quieto, y lo que se tomó y no alcanzó a correr no pierde intentos.
create table private.badge_queue (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('resultado', 'revisar', 'evento', 'cajas', 'escalera', 'mes', 'anio',
                                     'temporada', 'noche', 'cuenta', 'vinculo', 'historial', 'aviso')),
  league_id uuid,
  user_id uuid,
  ref text not null default '' check (char_length(ref) <= 200),
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) < 262144),
  run_after timestamptz not null default now(),
  attempts smallint not null default 0,
  locked_at timestamptz,
  last_error text check (char_length(last_error) <= 1000),
  created_at timestamptz not null default now()
);
-- Lo mismo sin tomar se junta (badge_enqueue); lo que ya se tomó no, así un cambio durante la corrida se vuelve a ver.
create unique index badge_queue_dedupe on private.badge_queue
  (kind, coalesce(league_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), ref)
  where locked_at is null;
create index badge_queue_due_idx on private.badge_queue (run_after) where locked_at is null;

-- Un trabajo de periodo corre una sola vez: (kind, liga o 'u:<cuenta>', ref).
create table private.badge_runs (
  kind text not null,
  scope text not null,
  period_key text not null,
  done_at timestamptz not null default now(),
  awarded integer not null default 0,
  primary key (kind, scope, period_key)
);

-- Corrida en seco del historial (§3.5): quién la tendría (cuentas) y el resumen contra la base de activos.
create table private.badge_dry_holders (
  run_id uuid not null,
  badge_key text not null,
  sport text not null,
  level smallint not null,
  holder uuid not null,
  created_at timestamptz not null default now(),
  primary key (run_id, badge_key, sport, level, holder)
);

create table private.badge_dry_runs (
  run_id uuid not null,
  badge_key text not null,
  sport text not null,
  level smallint not null,
  holders integer not null,
  base integer not null,
  created_at timestamptz not null default now(),
  primary key (run_id, badge_key, sport, level)
);

-- Jugadores que un dueño o admin se vinculó a sí mismo (private.badge_self_link): para las insignias de cuenta, de
-- ellos solo cuenta el historial verificado (§1.6). Se borra con el jugador; merge_badges la pasa al que queda.
create table private.badge_self_links (
  player_id uuid primary key references public.players (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on private.badge_self_links from public, anon, authenticated;

-- =====================================================================
-- Ayudas
-- =====================================================================

-- Zona de los periodos de cuenta, de las horas tranquilas y de la tarea diaria.
create function private.badge_tz() returns text
language sql immutable set search_path = '' as $$
  select 'America/Santo_Domingo'::text
$$;

-- uuids (sin repetir) de un arreglo jsonb: de strings (p_key null) o de la clave p_key de cada objeto.
create function private.badge_uuids(p jsonb, p_key text default null) returns uuid[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct z.v::uuid), '{}'::uuid[])
    from (select case when p_key is null then x #>> '{}' else x ->> p_key end as v
            from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x) z
   where private.raq_is_uuid(z.v)
$$;

-- Fecha local de un partido: la hora programada, la de la propuesta o la de creación (social:179).
create function private.badge_match_day(p_scheduled timestamptz, p_proposed timestamptz, p_created timestamptz, p_tz text)
returns date
language sql stable set search_path = '' as $$
  select (coalesce(p_scheduled, p_proposed, p_created) at time zone coalesce(nullif(p_tz, ''), private.badge_tz()))::date
$$;

-- Horas tranquilas: entre 9:00 pm y 8:00 am (Santo Domingo) un aviso espera a las 8:00 am.
create function private.badge_quiet_until(p_at timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select case
    when (p_at at time zone private.badge_tz())::time >= time '21:00'
      then (((p_at at time zone private.badge_tz())::date + 1) + time '08:00') at time zone private.badge_tz()
    when (p_at at time zone private.badge_tz())::time < time '08:00'
      then ((p_at at time zone private.badge_tz())::date + time '08:00') at time zone private.badge_tz()
    else p_at
  end
$$;

-- Marca de un juego de boliche que cuenta (B1): el id de su foto del marcador, 'importado' (BowlingX) o 'sin-foto'.
-- Lo mismo que markKind de src/badges/rules/bowling.ts: otra marca (la base acepta cualquier texto de 1 a 64) no
-- cuenta ni para el motor ni para la actividad de aquí (ligas reales).
create function private.badge_mark_ok(p_mark text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_mark in ('importado', 'sin-foto')
                  or p_mark ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false)
$$;

-- Juegos contados (puntaje y marca) de una participación, como texto para comparar antes y después.
create function private.badge_counted(p_scores smallint[], p_photos text[]) returns text
language sql immutable set search_path = '' as $$
  select coalesce(string_agg(g::text || '=' || p_scores[g]::text || ':' || p_photos[g], ',' order by g), '')
    from generate_subscripts(coalesce(p_scores, '{}'::smallint[]), 1) g
   where p_scores[g] is not null and private.badge_mark_ok(p_photos[g])
$$;

-- Jugadores de un partido: su alineación y la plantilla de los equipos o parejas de sus lados.
create function private.badge_match_players(p_match uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct z.x), '{}'::uuid[]) from (
    select mp.player_id as x from public.match_players mp where mp.match_id = p_match
    union
    select tp.player_id from public.match_sides ms join public.team_players tp on tp.team_id = ms.team_id
     where ms.match_id = p_match) z
$$;

-- Jugadores de unos eventos (boliche, partidos con sus plantillas, golf y natación).
create function private.badge_event_players(p_events uuid[]) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct z.x), '{}'::uuid[]) from (
    select x.player_id as x from public.entries x where x.event_id = any (p_events)
    union
    select mp.player_id from public.match_players mp join public.matches m on m.id = mp.match_id where m.event_id = any (p_events)
    union
    select tp.player_id from public.matches m join public.match_sides ms on ms.match_id = m.id
      join public.team_players tp on tp.team_id = ms.team_id
     where m.event_id = any (p_events)
    union
    select c.player_id from public.golf_cards c where c.event_id = any (p_events)
    union
    select se.player_id from public.swim_entries se where se.event_id = any (p_events)) z
$$;

-- {players, users} para el payload de un trabajo (las cuentas se guardan porque el jugador puede desaparecer).
create function private.badge_people(p_players uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'players', to_jsonb(coalesce(p_players, '{}'::uuid[])),
    'users', to_jsonb(coalesce((select array_agg(distinct p.user_id) from public.players p
                                 where p.id = any (p_players) and p.user_id is not null), '{}'::uuid[])))
$$;

-- Tarjeta de golf con todos los hoyos de la vuelta anotados (golpes o «recogió»).
create function private.badge_card_complete(p_strokes smallint[], p_picked boolean[], p_holes smallint) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(cardinality(p_strokes), 0) >= p_holes
     and not exists (select 1 from generate_series(1, p_holes) i
                      where p_strokes[i] is null and not coalesce(p_picked[i], false))
$$;

-- ¿La liga se está borrando (delete_league) o ya no existe? Entonces los borrados en cascada no encolan nada.
create function private.badge_league_gone(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_league::text = coalesce(current_setting('mm.deleting_league', true), '')
      or not exists (select 1 from public.leagues l where l.id = p_league)
$$;

-- =====================================================================
-- Marcas que verifican un juego (B2): nadie de la app las inventa
-- =====================================================================

-- Igual que en 20260926000500_rpc.sql, y además revisa las marcas de p_patch.photos (§1.7.5: la foto o 'importado'
-- validan el juego, B2, y saltan juez y parte). 'importado' solo lo escribe el importador de BowlingX (service_role,
-- directo a la tabla), y una foto es una fila de public.photos de esa liga (la suben save_photo_scores y los envíos).
-- Por juego: la marca que ya tenía se puede dejar; una nueva tiene que ser null, 'sin-foto' o el id de una foto de la
-- liga ('invalido' si no). Si cambia el puntaje de un juego importado o con foto y no llega otra foto, la marca vuelve
-- a 'sin-foto' (o a borrador si la liga pide foto), como en save_game: ese puntaje ya no es el de la foto.
create or replace function public.update_entry(p_entry uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.entries;
  v_admin boolean;
  v_sport text;
  v_require boolean;
  v_scores smallint[];
  v_photos text[];
  v_mark text;
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
  select l.sport, l.require_photo into v_sport, v_require from public.leagues l where l.id = e.league_id;
  v_scores := case when p_patch ? 'scores' then coalesce(private.series(p_patch -> 'scores', v_sport), '{}') else e.scores end;
  v_photos := case when p_patch ? 'photos' then coalesce(private.marks(p_patch -> 'photos'), '{}') else e.photos end;
  for g in 1 .. coalesce(cardinality(v_photos), 0) loop
    v_mark := v_photos[g];
    continue when v_mark is null or v_mark = 'sin-foto';
    if v_mark is distinct from e.photos[g] then
      if not private.raq_is_uuid(v_mark)
         or not exists (select 1 from public.photos ph where ph.id = v_mark::uuid and ph.league_id = e.league_id) then
        perform private.fail('invalido');
      end if;
    elsif v_scores[g] is distinct from e.scores[g] then
      v_photos[g] := case when v_scores[g] is not null and not coalesce(v_require, false) then 'sin-foto' end;
    end if;
  end loop;
  update public.entries x set
    team_id = case when p_patch ? 'team_id' then nullif(p_patch ->> 'team_id', '')::uuid else x.team_id end,
    average = case when p_patch ? 'average' then (p_patch ->> 'average')::double precision else x.average end,
    handicap_override = case when p_patch ? 'handicap_override' then (p_patch ->> 'handicap_override')::smallint else x.handicap_override end,
    scores = v_scores,
    photos = v_photos,
    frames = case when p_patch ? 'frames' then nullif(p_patch -> 'frames', 'null'::jsonb) else x.frames end
  where x.id = p_entry;
end $$;

-- =====================================================================
-- Cola
-- =====================================================================

-- Junta dos payloads: players y users se suman sin repetir; lo demás, manda el nuevo.
create function private.badge_merge_payload(a jsonb, b jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select (coalesce(a, '{}'::jsonb) || coalesce(b, '{}'::jsonb))
      || case when coalesce(a, '{}'::jsonb) ? 'players' or coalesce(b, '{}'::jsonb) ? 'players'
              then jsonb_build_object('players', to_jsonb(private.badge_uuids(coalesce(a -> 'players', '[]'::jsonb)
                                                                           || coalesce(b -> 'players', '[]'::jsonb))))
              else '{}'::jsonb end
      || case when coalesce(a, '{}'::jsonb) ? 'users' or coalesce(b, '{}'::jsonb) ? 'users'
              then jsonb_build_object('users', to_jsonb(private.badge_uuids(coalesce(a -> 'users', '[]'::jsonb)
                                                                         || coalesce(b -> 'users', '[]'::jsonb))))
              else '{}'::jsonb end
$$;

-- Trabajos de periodo (evento, noche, cajas, escalera, mes, año, temporada): corren una sola vez (§3.4: se dan
-- después de su gracia, quedan firmes y una corrección posterior no los cambia). El historial no entra: se puede
-- volver a correr.
create function private.badge_period_kind(p_kind text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_kind in ('evento', 'noche', 'cajas', 'escalera', 'mes', 'anio', 'temporada'), false)
$$;

-- ¿Ese trabajo de periodo ya corrió? (private.badge_runs: kind, liga o 'u:<cuenta>', ref).
create function private.badge_period_done(p_kind text, p_league uuid, p_user uuid, p_ref text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.badge_period_kind(p_kind)
     and exists (select 1 from private.badge_runs r
                  where r.kind = p_kind and r.scope = coalesce(p_league::text, 'u:' || p_user::text)
                    and r.period_key = coalesce(p_ref, ''))
$$;

-- Encola sin duplicar: si ya hay uno igual sin tomar, se juntan los payloads y la hora queda en la más temprana
-- ('evento': la más tardía, así corre después del último partido; 'aviso': la que tenía, salvo el del historial,
-- que espera al último trabajo del historial). Un trabajo de periodo que ya corrió no se vuelve a encolar (corregir
-- la final, reabrir la ronda o el encuentro, cerrar otra vez la temporada: lo que se dio no cambia, §3.4).
create function private.badge_enqueue(p_kind text, p_league uuid, p_user uuid, p_ref text,
                                      p_payload jsonb default '{}', p_run_after timestamptz default now()) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.badge_period_done(p_kind, p_league, p_user, p_ref) then
    return;
  end if;
  insert into private.badge_queue as q (kind, league_id, user_id, ref, payload, run_after)
  values (p_kind, p_league, p_user, coalesce(p_ref, ''), coalesce(p_payload, '{}'::jsonb), coalesce(p_run_after, now()))
  on conflict (kind, coalesce(league_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), ref) where locked_at is null
  do update set
    payload = private.badge_merge_payload(q.payload, excluded.payload),
    run_after = case
      when q.kind = 'evento' or (q.kind = 'aviso' and q.ref = 'historial') then greatest(q.run_after, excluded.run_after)
      when q.kind = 'aviso' then q.run_after
      else least(q.run_after, excluded.run_after)
    end;
end $$;

-- =====================================================================
-- Triggers: lo que cambia en los resultados encola un trabajo
-- =====================================================================

-- Boliche: una participación con juegos contados que aparece, cambia (puntaje, marca o cuadros) o se borra. Mover
-- participaciones de jugador (merge_players) no encola: eso lo avisa badge_signal('merge').
create function private.badges_on_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old text := '';
  v_new text := '';
begin
  if tg_op <> 'INSERT' then
    v_old := private.badge_counted(old.scores, old.photos);
  end if;
  if tg_op = 'DELETE' then
    if v_old = '' or private.badge_league_gone(old.league_id) then
      return null;
    end if;
    -- Se borró el evento o el jugador entero: un solo trabajo por evento o por jugador.
    perform private.badge_enqueue('revisar', old.league_id, null,
      case when not exists (select 1 from public.events e where e.id = old.event_id) then 'event:' || old.event_id::text
           when not exists (select 1 from public.players p where p.id = old.player_id) then 'player:' || old.player_id::text
           else 'entry:' || old.id::text end,
      private.badge_people(array[old.player_id]));
    return null;
  end if;
  v_new := private.badge_counted(new.scores, new.photos);
  if (tg_op = 'UPDATE' and v_old = v_new and old.frames is not distinct from new.frames) or (v_old = '' and v_new = '') then
    return null;
  end if;
  perform private.badge_enqueue(case when v_new = '' then 'revisar' else 'resultado' end, new.league_id, null,
                                'entry:' || new.id::text, jsonb_build_object('players', jsonb_build_array(new.player_id)));
  return null;
exception when others then
  raise warning 'insignias (participación): %', sqlerrm;
  return null;
end $$;
create trigger entries_badges after insert or update of scores, photos, frames or delete on public.entries
  for each row execute function private.badges_on_entry();

-- Partidos: queda final (confirmado o W.O.: ya; propuesto: a las 48 h, cuando cuenta solo) o deja de serlo
-- (anulado, reclamado, corregido). La final de un cuadro encola además el podio del evento con 48 h de gracia.
create function private.badges_on_match() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_final constant text[] := array['confirmed', 'walkover', 'finished'];
  v_at timestamptz;
begin
  if new.status = any (v_final) then
    if old.status is not distinct from new.status and old.score is not distinct from new.score
       and old.winner_side is not distinct from new.winner_side and old.walkover_side is not distinct from new.walkover_side
       and old.proposed_at is not distinct from new.proposed_at then
      return null;
    end if;
    v_at := case when new.status = 'finished' then coalesce(new.proposed_at, now()) + private.match_auto_confirm() else now() end;
    perform private.badge_enqueue('resultado', new.league_id, null, 'match:' || new.id::text, '{}'::jsonb, v_at);
    if new.bracket_key is not null and new.event_id is not null then
      perform private.badge_enqueue('evento', new.league_id, null, 'event:' || new.event_id::text, '{}'::jsonb,
                                    v_at + interval '48 hours');
    end if;
  elsif old.status = any (v_final) then
    perform private.badge_enqueue('revisar', new.league_id, null, 'match:' || new.id::text,
                                  private.badge_people(private.badge_match_players(new.id)));
  end if;
  return null;
exception when others then
  raise warning 'insignias (partido %): %', new.id, sqlerrm;
  return null;
end $$;
create trigger matches_badges after update of status, score, winner_side, walkover_side, proposed_at on public.matches
  for each row
  when (old.status in ('confirmed', 'walkover', 'finished') or new.status in ('confirmed', 'walkover', 'finished'))
  execute function private.badges_on_match();

-- Borrar un partido que contaba: antes de borrarlo (después ya no están sus jugadores).
create function private.badges_on_match_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status in ('confirmed', 'walkover', 'finished') and not private.badge_league_gone(old.league_id) then
    perform private.badge_enqueue('revisar', old.league_id, null, 'match:' || old.id::text,
                                  private.badge_people(private.badge_match_players(old.id)));
  end if;
  return old;
exception when others then
  raise warning 'insignias (borrar partido %): %', old.id, sqlerrm;
  return old;
end $$;
create trigger matches_badges_delete before delete on public.matches
  for each row execute function private.badges_on_match_delete();

-- Cambia la alineación de un partido que ya cuenta (alguien entra, sale o cambia de lado). Juntar jugadores
-- (merge_players cambia player_id) no encola: lo avisa badge_signal('merge').
create function private.badges_on_match_player() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_match uuid;
  v_players uuid[];
  m record;
begin
  if tg_op = 'DELETE' then
    v_match := old.match_id;
    v_players := array[old.player_id];
  elsif tg_op = 'INSERT' then
    v_match := new.match_id;
    v_players := array[new.player_id];
  else
    v_match := new.match_id;
    v_players := array[new.player_id];
  end if;
  select x.league_id, x.status into m from public.matches x where x.id = v_match;
  if not found or m.status not in ('confirmed', 'walkover', 'finished') then
    return null;
  end if;
  perform private.badge_enqueue('revisar', m.league_id, null, 'match:' || v_match::text, private.badge_people(v_players));
  return null;
exception when others then
  raise warning 'insignias (alineación): %', sqlerrm;
  return null;
end $$;
create trigger match_players_badges after insert or update of side or delete on public.match_players
  for each row execute function private.badges_on_match_player();

-- Golf: una tarjeta de una ronda cerrada que cambia o se borra (si se borró la ronda entera, un trabajo por ronda).
create function private.badges_on_golf_card() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
begin
  if tg_op = 'DELETE' then
    if private.badge_league_gone(old.league_id) then
      return null;
    end if;
    select r.status into v_status from public.golf_rounds r where r.event_id = old.event_id;
    if not found then
      perform private.badge_enqueue('revisar', old.league_id, null, 'round:' || old.event_id::text, private.badge_people(array[old.player_id]));
    elsif v_status = 'cerrada' then
      perform private.badge_enqueue('revisar', old.league_id, null, 'card:' || old.id::text, private.badge_people(array[old.player_id]));
    end if;
    return null;
  end if;
  if (select r.status from public.golf_rounds r where r.event_id = new.event_id) = 'cerrada' then
    perform private.badge_enqueue('revisar', new.league_id, null, 'card:' || new.id::text, private.badge_people(array[new.player_id]));
  end if;
  return null;
exception when others then
  raise warning 'insignias (tarjeta de golf): %', sqlerrm;
  return null;
end $$;
create trigger golf_cards_badges after update of status, strokes, picked_up, dq or delete on public.golf_cards
  for each row execute function private.badges_on_golf_card();

-- Golf: al cerrar la ronda cuentan sus tarjetas; el podio espera 24 h (y el del torneo, cuando cierra la última).
-- Reabrirla revisa lo que se dio.
create function private.badges_on_golf_round() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_players uuid[] := array(select c.player_id from public.golf_cards c where c.event_id = new.event_id);
begin
  if new.status = 'cerrada' and old.status is distinct from 'cerrada' then
    perform private.badge_enqueue('resultado', new.league_id, null, 'round:' || new.event_id::text,
                                  jsonb_build_object('players', to_jsonb(v_players)));
    perform private.badge_enqueue('evento', new.league_id, null, 'event:' || new.event_id::text, '{}'::jsonb, now() + interval '24 hours');
    if new.tournament_id is not null
       and not exists (select 1 from public.golf_rounds r where r.tournament_id = new.tournament_id and r.status <> 'cerrada') then
      perform private.badge_enqueue('evento', new.league_id, null, 'gt:' || new.tournament_id::text, '{}'::jsonb, now() + interval '24 hours');
    end if;
  elsif old.status = 'cerrada' and new.status is distinct from 'cerrada' then
    perform private.badge_enqueue('revisar', new.league_id, null, 'round:' || new.event_id::text, private.badge_people(v_players));
  end if;
  return null;
exception when others then
  raise warning 'insignias (ronda de golf %): %', new.event_id, sqlerrm;
  return null;
end $$;
create trigger golf_rounds_badges after update of status on public.golf_rounds
  for each row when (old.status is distinct from new.status) execute function private.badges_on_golf_round();

-- Natación: al finalizar el encuentro cuentan sus resultados y se dan medallas y récords; reabrirlo revisa.
create function private.badges_on_swim_meet() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_players uuid[] := array(select distinct se.player_id from public.swim_entries se
                             where se.event_id = new.event_id and se.status <> 'dns');
begin
  if new.finalized_at is not null and old.finalized_at is null then
    perform private.badge_enqueue('resultado', new.league_id, null, 'meet:' || new.event_id::text,
                                  jsonb_build_object('players', to_jsonb(v_players)));
    perform private.badge_enqueue('evento', new.league_id, null, 'event:' || new.event_id::text);
  elsif new.finalized_at is null and old.finalized_at is not null then
    perform private.badge_enqueue('revisar', new.league_id, null, 'meet:' || new.event_id::text, private.badge_people(v_players));
  end if;
  return null;
exception when others then
  raise warning 'insignias (encuentro %): %', new.event_id, sqlerrm;
  return null;
end $$;
create trigger swim_meets_badges after update of finalized_at on public.swim_meets
  for each row when (old.finalized_at is distinct from new.finalized_at) execute function private.badges_on_swim_meet();

-- Natación: borrar un resultado de un encuentro finalizado (o el encuentro entero).
create function private.badges_on_swim_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'dns' or private.badge_league_gone(old.league_id)
     or exists (select 1 from public.swim_meets m where m.event_id = old.event_id and m.finalized_at is null) then
    return null;
  end if;
  perform private.badge_enqueue('revisar', old.league_id, null, 'meet:' || old.event_id::text, private.badge_people(array[old.player_id]));
  return null;
exception when others then
  raise warning 'insignias (resultado de natación): %', sqlerrm;
  return null;
end $$;
create trigger swim_entries_badges after delete on public.swim_entries
  for each row execute function private.badges_on_swim_entry();

-- Escalera: un reto que queda jugado (Escalando cuenta los retos ganados subiendo).
create function private.badges_on_ladder() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.badge_enqueue('resultado', new.league_id, null, 'match:' || new.match_id::text);
  return null;
exception when others then
  raise warning 'insignias (reto %): %', new.id, sqlerrm;
  return null;
end $$;
create trigger ladder_challenges_badges after update of status on public.ladder_challenges
  for each row when (new.status = 'played' and old.status is distinct from 'played' and new.match_id is not null)
  execute function private.badges_on_ladder();

-- Vincular, reclamar o desvincular: la cuenta nueva recalcula con el historial nuevo y la vieja, su progreso.
create function private.badges_on_player_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null then
    perform private.badge_enqueue('vinculo', new.league_id, new.user_id, 'player:' || new.id::text,
                                  jsonb_build_object('players', jsonb_build_array(new.id)));
  end if;
  -- La cuenta que se borra se lleva lo suyo (cascada): nada que recalcular.
  if old.user_id is not null and exists (select 1 from public.profiles p where p.id = old.user_id) then
    perform private.badge_enqueue('vinculo', new.league_id, old.user_id, 'player:' || new.id::text,
                                  jsonb_build_object('players', jsonb_build_array(new.id), 'unlinked', true));
  end if;
  return null;
exception when others then
  raise warning 'insignias (vínculo %): %', new.id, sqlerrm;
  return null;
end $$;
create trigger players_badges after update of user_id on public.players
  for each row when (old.user_id is distinct from new.user_id) execute function private.badges_on_player_link();

-- Un dueño o admin que se vincula él mismo con un jugador (su reclamo aprobado al instante, link_account_to_player
-- con su propia cuenta, el reclamo automático de ensure_player): de ese jugador solo cuenta lo verificado para las
-- insignias de cuenta (§1.6), en todos los trabajos (badge_snapshot lo marca en players[].verified_only). Quien hace
-- el cambio es la sesión (auth.uid()). La marca se va si el jugador queda con otra cuenta o sin cuenta; si otro
-- admin lo vincula con la misma cuenta, se queda (el historial sigue siendo el mismo). No se traga errores: sin la
-- marca, el vínculo no se hace.
create function private.badge_self_link() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_by uuid := auth.uid();
begin
  delete from private.badge_self_links s where s.player_id = new.id and s.user_id is distinct from new.user_id;
  if new.user_id is not null and v_by = new.user_id and private.user_is_admin(new.league_id, new.user_id) then
    insert into private.badge_self_links (player_id, user_id) values (new.id, new.user_id) on conflict (player_id) do nothing;
  end if;
  return null;
end $$;
create trigger players_badges_self_link after update of user_id on public.players
  for each row when (old.user_id is distinct from new.user_id) execute function private.badge_self_link();

-- ¿De este jugador (con esta cuenta) solo cuenta lo verificado? Se vinculó él mismo (arriba) o su reclamo lo aprobó
-- la misma cuenta que reclamaba (player_claims.decided_by = user_id).
create function private.badge_verified_only(p_player uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and (
    exists (select 1 from private.badge_self_links s where s.player_id = p_player and s.user_id = p_user)
    or exists (select 1 from public.player_claims c
                where c.player_id = p_player and c.user_id = p_user and c.status = 'approved' and c.decided_by = c.user_id))
$$;

-- Liga por cajas: save_box_month cierra un mes (closed = true) y en la misma escritura poda los viejos. Se encola
-- 'cajas' con el mes completo: el de antes (con sus cajas) más lo del cierre (closed, closedAt, moves).
create function private.badges_on_box_month() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when jsonb_typeof(old.config -> 'months') = 'array' then old.config -> 'months' else '[]'::jsonb end;
  v_new jsonb := case when jsonb_typeof(new.config -> 'months') = 'array' then new.config -> 'months' else '[]'::jsonb end;
  v_month jsonb;
  v_prev jsonb;
  v_n text;
begin
  for i in 0 .. jsonb_array_length(v_new) - 1 loop
    v_month := v_new -> i;
    continue when jsonb_typeof(v_month) is distinct from 'object' or v_month -> 'closed' is distinct from 'true'::jsonb
               or v_month -> 'archived' = 'true'::jsonb;
    v_prev := v_old -> i;
    continue when jsonb_typeof(v_prev) = 'object' and v_prev -> 'closed' = 'true'::jsonb;
    v_n := coalesce(v_month ->> 'n', (i + 1)::text);
    perform private.badge_enqueue('cajas', new.league_id, null, 'box:' || new.id::text || ':' || v_n,
      jsonb_build_object('n', v_n::integer,
                         'month', (case when jsonb_typeof(v_prev) = 'object' then v_prev else '{}'::jsonb end) || v_month));
  end loop;
  return null;
exception when others then
  raise warning 'insignias (mes de cajas %): %', new.id, sqlerrm;
  return null;
end $$;
create trigger events_badges_box after update of config on public.events
  for each row when (new.type = 'cajas' and old.config is distinct from new.config)
  execute function private.badges_on_box_month();

-- Aviso al motor desde 20260929000800_insignias.sql (misma firma): después de juntar dos jugadores se recalcula el
-- que quedó ('vinculo'); un aval confirmado avisa al jugador (su insignia ya está firme y sin avisar).
create or replace function private.badge_signal(p_event text, p_league uuid, p_player uuid, p_award uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if p_event = 'merge' and p_player is not null then
    select p.user_id into v_user from public.players p where p.id = p_player;
    perform private.badge_enqueue('vinculo', p_league, v_user, 'player:' || p_player::text,
                                  jsonb_build_object('players', jsonb_build_array(p_player), 'merged', true));
  elsif p_event = 'review' and p_award is not null then
    select coalesce(a.user_id, p.user_id) into v_user
      from public.badge_awards a left join public.players p on p.id = a.player_id where a.id = p_award;
    if v_user is not null then
      perform private.badge_enqueue('aviso', null, v_user, 'push', '{}'::jsonb, private.badge_quiet_until(now()));
    end if;
  end if;
exception when others then
  raise warning 'badge_signal %: %', p_event, sqlerrm;
end $$;

-- =====================================================================
-- Actividad válida (§1.7.2) y ligas reales (§1.7.4), en SQL
-- =====================================================================
-- Lo mismo que bowlingActivity, racketActivity, teamActivity, golfActivity y swimActivity de src/badges/rules, para
-- los trabajos que suman muchas ligas (cuenta, meses de cuenta, ligas reales). Un (deporte, liga, jugador, fecha
-- local) por fila; official = hubo algo oficial que no fue solo por plantilla; roster = ese día solo contó por la
-- plantilla (equipos sin alineación). p_players null = todos los jugadores (con p_from/p_to para acotar).
create function private.badge_activity(p_players uuid[], p_from date default null, p_to date default null)
returns table (sport text, league_id uuid, player_id uuid, user_id uuid, date date, official boolean, roster boolean)
language sql stable security definer set search_path = '' as $$
  with bowl as (
    -- Boliche: una participación con al menos un juego B1. Juez y parte (owner, admin o anotador de esa liga):
    -- solo fotos, importados o juegos de un envío que aprobó otra cuenta (mismo jugador, evento o fecha y puntaje).
    select e.league_id, e.player_id, ev.date as day, bool_or(ev.type = 'torneo') as official
      from public.entries e
      join public.events ev on ev.id = e.event_id
      join public.players p on p.id = e.player_id
      left join public.league_members m on m.league_id = e.league_id and m.user_id = p.user_id
     where (p_players is null or e.player_id = any (p_players))
       and (p_from is null or ev.date >= p_from) and (p_to is null or ev.date <= p_to)
       and exists (
         select 1 from generate_subscripts(e.scores, 1) g
          where e.scores[g] is not null and private.badge_mark_ok(e.photos[g])
            and (e.photos[g] <> 'sin-foto'
                 or m.user_id is null or not (m.role in ('owner', 'admin') or m.is_scorer)
                 or exists (select 1 from public.submissions s
                             where s.player_id = e.player_id and s.status = 'aprobado'
                               and (s.event_id = e.event_id or (s.event_id is null and s.date = ev.date))
                               and e.scores[g] = any (s.scores)
                               and s.reviewed_by is not null and s.reviewed_by is distinct from s.created_by
                               and s.reviewed_by is distinct from p.user_id)))
     group by e.league_id, e.player_id, ev.date
  ),
  cand as (
    -- Partidos candidatos: los de esos jugadores (alineación, plantilla o líneas) o, sin jugadores, los de las fechas.
    select mp.match_id as id from public.match_players mp where p_players is not null and mp.player_id = any (p_players)
    union
    select ms.match_id from public.team_players tp join public.match_sides ms on ms.team_id = tp.team_id
     where p_players is not null and tp.player_id = any (p_players)
    union
    select m.id from public.matches m
     where p_players is not null and m.score ? 'lines'
       and m.league_id in (select p.league_id from public.players p where p.id = any (p_players))
       and exists (select 1 from unnest(p_players) x where strpos(m.score ->> 'lines', x::text) > 0)
    union
    select m.id from public.matches m
     where p_players is null
       and (p_from is null or coalesce(m.scheduled_at, m.proposed_at, m.created_at) >= p_from::timestamp - interval '2 days')
       and (p_to is null or coalesce(m.scheduled_at, m.proposed_at, m.created_at) < p_to::timestamp + interval '3 days')
  ),
  mt as (
    select m.id, m.league_id, m.event_id, m.status, m.format, m.require_confirm, m.walkover_side, m.score,
           l.sport as l_sport, l.tz, ev.type as ev_type,
           private.badge_match_day(m.scheduled_at, m.proposed_at, m.created_at, l.tz) as day
      from cand c
      join public.matches m on m.id = c.id
      join public.leagues l on l.id = m.league_id
      left join public.events ev on ev.id = m.event_id
     where private.match_final(m.status, m.proposed_at) and m.status <> 'void'
  ),
  racket as (
    -- Raqueta: estar en un lado de un partido R1, o de un W.O. a favor (el otro lado no vino). Oficial: se confirma,
    -- no es de puntos (americano, mexicano) y es suelto o de liga, torneo, cajas o escalera.
    select m.l_sport as sport, m.league_id, sp.player_id, m.day,
           bool_or(m.require_confirm and m.format not in ('americano', 'mexicano')
                   and (m.event_id is null or m.ev_type in ('liga', 'torneo', 'cajas', 'escalera'))) as official
      from mt m
      cross join lateral (
        select x.player_id, x.side from public.match_players x where x.match_id = m.id
        union all
        select tp.player_id, s.side from public.match_sides s join public.team_players tp on tp.team_id = s.team_id
         where s.match_id = m.id and not exists (select 1 from public.match_players y where y.match_id = m.id and y.side = s.side)
      ) sp
     where m.l_sport in ('padel', 'tennis', 'pickleball')
       and (m.status <> 'walkover' or (m.walkover_side in (1, 2) and sp.side <> m.walkover_side))
     group by m.l_sport, m.league_id, sp.player_id, m.day
  ),
  team as (
    -- Equipos: aparecer en un partido T1 (alineación, línea de baloncesto o línea de fútbol y sala con «jugó»). Sin
    -- ningún dato de alineación, la plantilla de ese día (roster).
    select m.l_sport as sport, m.league_id, a.player_id, m.day, a.roster
      from mt m
      cross join lateral (
        select array(
          select x.player_id from public.match_players x where x.match_id = m.id
          union
          select split_part(ln, ':', 1)::uuid
            from regexp_split_to_table(coalesce(m.score ->> 'lines', ''), ';') ln
           where private.raq_is_uuid(split_part(ln, ':', 1)) and split_part(ln, ':', 2) in ('1', '2')
             and (m.l_sport = 'basketball' or split_part(ln, ':', 3) = '1')
        ) as seen
      ) s
      cross join lateral (
        select unnest(s.seen) as player_id, false as roster
        union all
        select tp.player_id, true
          from public.match_sides ms join public.team_players tp on tp.team_id = ms.team_id
         where cardinality(s.seen) = 0 and ms.match_id = m.id and (tp.created_at at time zone m.tz)::date <= m.day
      ) a
     where m.l_sport in ('basketball', 'football', 'futsal') and m.status <> 'walkover'
       and coalesce(m.score -> 'ending', 'null'::jsonb) = 'null'::jsonb
  ),
  golf as (
    -- Golf: una tarjeta G1 (firmada, sin DQ, ronda cerrada y todos los hoyos). Oficial con 3+ tarjetas G1.
    select c.league_id, c.player_id, ev.date as day,
           (select count(*) from public.golf_cards c2
             where c2.event_id = c.event_id and c2.status = 'firmada' and not c2.dq
               and private.badge_card_complete(c2.strokes, c2.picked_up, r.holes)) >= 3 as official
      from public.golf_cards c
      join public.golf_rounds r on r.event_id = c.event_id
      join public.events ev on ev.id = c.event_id
     where (p_players is null or c.player_id = any (p_players))
       and (p_from is null or ev.date >= p_from) and (p_to is null or ev.date <= p_to)
       and c.status = 'firmada' and not c.dq and r.status = 'cerrada'
       and private.badge_card_complete(c.strokes, c.picked_up, r.holes)
  ),
  swim as (
    -- Natación: un resultado (ok con tiempo, dq o dnf; no dns) en un encuentro finalizado. Oficial: encuentro o torneo.
    select se.league_id, se.player_id, ev.date as day, bool_or(ev.type in ('encuentro', 'torneo')) as official
      from public.swim_entries se
      join public.swim_meets sm on sm.event_id = se.event_id
      join public.events ev on ev.id = se.event_id
     where (p_players is null or se.player_id = any (p_players))
       and (p_from is null or ev.date >= p_from) and (p_to is null or ev.date <= p_to)
       and sm.finalized_at is not null
       and ((se.status = 'ok' and se.time_cs is not null) or se.status in ('dq', 'dnf'))
     group by se.league_id, se.player_id, ev.date
  ),
  raw as (
    select 'bowling'::text as sport, b.league_id, b.player_id, b.day, b.official, false as roster from bowl b
    union all
    select r.sport, r.league_id, r.player_id, r.day, r.official, false from racket r
    union all
    select t.sport, t.league_id, t.player_id, t.day, true, t.roster from team t
    union all
    select 'golf', g.league_id, g.player_id, g.day, g.official, false from golf g
    union all
    select 'swimming', w.league_id, w.player_id, w.day, w.official, false from swim w
  )
  select r.sport, r.league_id, r.player_id, p.user_id, r.day,
         bool_or(r.official and not r.roster), bool_and(r.roster)
    from raw r
    join public.players p on p.id = r.player_id and p.league_id = r.league_id
   where (p_players is null or r.player_id = any (p_players))
     and (p_from is null or r.day >= p_from) and (p_to is null or r.day <= p_to)
   group by r.sport, r.league_id, r.player_id, p.user_id, r.day
$$;

-- ActivityDay[] (src/badges/snapshot.ts) de p_players entera y, de p_capped, solo los primeros p_cap días por
-- (jugador, liga): lo justo para «3+ días activos» o «1+ día activo» de otros.
create function private.badge_activity_json(p_players uuid[], p_capped uuid[] default '{}', p_cap integer default 3,
                                            p_to date default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with a as (
    select x.*, row_number() over (partition by x.player_id, x.league_id order by x.date) as n
      from private.badge_activity(coalesce(p_players, '{}'::uuid[]) || coalesce(p_capped, '{}'::uuid[]), null, p_to) x
  )
  select coalesce(jsonb_agg(jsonb_build_object('sport', a.sport, 'league_id', a.league_id, 'player_id', a.player_id,
                                               'user_id', a.user_id, 'date', a.date, 'official', a.official, 'roster', a.roster)
                            order by a.date, a.sport, a.league_id, a.player_id), '[]'::jsonb)
    from a
   where a.player_id = any (coalesce(p_players, '{}'::uuid[])) or a.n <= p_cap
$$;

-- LeagueMonthActivity[]: por liga y mes, las cuentas y los jugadores con actividad válida (base de «liga real»).
create function private.badge_league_months(p_leagues uuid[], p_to date default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('league_id', m.league_id, 'month', m.month, 'users', to_jsonb(m.users),
                                               'players', to_jsonb(m.players))
                            order by m.league_id, m.month), '[]'::jsonb)
    from (
      select a.league_id, to_char(a.date, 'YYYY-MM') as month,
             coalesce(array_agg(distinct a.user_id) filter (where a.user_id is not null), '{}'::uuid[]) as users,
             array_agg(distinct a.player_id) as players
        from private.badge_activity(array(select p.id from public.players p where p.league_id = any (p_leagues)), null, p_to) a
       where a.league_id = any (p_leagues)
       group by a.league_id, to_char(a.date, 'YYYY-MM')
    ) m
$$;

-- =====================================================================
-- Lo que ve el motor
-- =====================================================================

-- Filas del deporte (to_jsonb de cada fila, snake_case) para un trabajo:
-- - de p_players, toda su carrera en ese deporte hasta p_until (null = hasta hoy), con lo que hace falta alrededor
--   (el evento, el partido con sus lados, las tarjetas de su grupo, las pruebas de su encuentro);
-- - de p_leagues, todo lo de la ventana [p_from, p_to];
-- - de p_events, los eventos enteros.
-- p_state: en baloncesto, cada partido lleva has_state y las faltas técnicas, antideportivas y descalificantes
-- sacadas de matches.state (fouls: [{side, kind, player}]) para «Juego limpio».
create function private.badge_family_rows(p_sport text, p_players uuid[], p_until date, p_leagues uuid[],
                                          p_from date, p_to date, p_events uuid[], p_state boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_family text := (select s.family from public.sport_status s where s.id = p_sport);
  v_players uuid[] := coalesce(p_players, '{}'::uuid[]);
  v_leagues uuid[] := coalesce(p_leagues, '{}'::uuid[]);
  v_events uuid[] := coalesce(p_events, '{}'::uuid[]);
  v_ev uuid[];
  v_ids uuid[];
  v_teams uuid[];
  v_foul constant jsonpath := 'strict $.** ? (@.type == "foul" && (@.kind == "technical" || @.kind == "unsportsmanlike" || @.kind == "disqualifying"))';
begin
  if p_sport = 'bowling' then
    v_ev := array(select e.id from public.events e
                   where (e.league_id = any (v_leagues) and (p_from is null or e.date >= p_from) and (p_to is null or e.date <= p_to))
                      or e.id = any (v_events));
    v_ids := array(select x.id from public.entries x join public.events e on e.id = x.event_id
                    where (x.player_id = any (v_players) and (p_until is null or e.date <= p_until))
                       or x.event_id = any (v_ev));
    v_ev := array(select distinct u from unnest(v_ev || array(select x.event_id from public.entries x where x.id = any (v_ids))) u);
    return jsonb_build_object(
      'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.date, e.start_time nulls first, e.id)
                            from public.events e where e.id = any (v_ev)), '[]'::jsonb),
      'entries', coalesce((select jsonb_agg(to_jsonb(x) order by x.event_id, x.id)
                             from public.entries x where x.id = any (v_ids)), '[]'::jsonb),
      -- Solo los envíos aprobados de jugadores que son juez y parte (lo único que los lee: juez y parte).
      'submissions', coalesce((
        select jsonb_agg(to_jsonb(s) order by s.created_at, s.id)
          from public.submissions s
          join public.players p on p.id = s.player_id
          join public.league_members m on m.league_id = s.league_id and m.user_id = p.user_id
         where s.status = 'aprobado' and (m.role in ('owner', 'admin') or m.is_scorer)
           and s.player_id in (select x.player_id from public.entries x where x.id = any (v_ids))), '[]'::jsonb),
      'teams', coalesce((select jsonb_agg(to_jsonb(t) order by t.event_id, t.sort_order, t.id)
                           from public.teams t where t.event_id = any (v_ev)), '[]'::jsonb));
  end if;

  if v_family in ('racket', 'team') then
    v_ids := array(
      select mp.match_id from public.match_players mp
        join public.matches m on m.id = mp.match_id join public.leagues l on l.id = m.league_id
       where mp.player_id = any (v_players)
         and (p_until is null or private.badge_match_day(m.scheduled_at, m.proposed_at, m.created_at, l.tz) <= p_until)
      union
      select ms.match_id from public.team_players tp
        join public.match_sides ms on ms.team_id = tp.team_id
        join public.matches m on m.id = ms.match_id join public.leagues l on l.id = m.league_id
       where tp.player_id = any (v_players)
         and (p_until is null or private.badge_match_day(m.scheduled_at, m.proposed_at, m.created_at, l.tz) <= p_until)
      union
      select m.id from public.matches m join public.leagues l on l.id = m.league_id
       where v_family = 'team' and cardinality(v_players) > 0 and m.score ? 'lines'
         and m.league_id in (select p.league_id from public.players p where p.id = any (v_players))
         and exists (select 1 from unnest(v_players) x where strpos(m.score ->> 'lines', x::text) > 0)
         and (p_until is null or private.badge_match_day(m.scheduled_at, m.proposed_at, m.created_at, l.tz) <= p_until)
      union
      select m.id from public.matches m join public.leagues l on l.id = m.league_id
       where m.league_id = any (v_leagues)
         and (p_from is null or private.badge_match_day(m.scheduled_at, m.proposed_at, m.created_at, l.tz) >= p_from)
         and (p_to is null or private.badge_match_day(m.scheduled_at, m.proposed_at, m.created_at, l.tz) <= p_to)
      union
      select m.id from public.matches m where m.event_id = any (v_events));
    v_ev := array(select distinct u from unnest(v_events || array(select m.event_id from public.matches m
                                                                   where m.id = any (v_ids) and m.event_id is not null)) u);
    v_teams := array(select ms.team_id from public.match_sides ms where ms.match_id = any (v_ids) and ms.team_id is not null
                     union
                     select tp.team_id from public.team_players tp where tp.player_id = any (v_players));
    return jsonb_build_object(
      'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.date, e.id) from public.events e where e.id = any (v_ev)), '[]'::jsonb),
      'matches', coalesce((
        select jsonb_agg((to_jsonb(m) - 'state')
                         || case when p_state and p_sport = 'basketball' then jsonb_build_object(
                              'has_state', m.state is not null,
                              'fouls', coalesce((select jsonb_agg(jsonb_build_object('side', f -> 'side', 'kind', f -> 'kind', 'player', f -> 'player'))
                                                   from jsonb_path_query(coalesce(m.state, '{}'::jsonb), v_foul) f), '[]'::jsonb))
                                 else '{}'::jsonb end
                         order by coalesce(m.scheduled_at, m.proposed_at, m.created_at), m.id)
          from public.matches m where m.id = any (v_ids)), '[]'::jsonb),
      'match_sides', coalesce((select jsonb_agg(to_jsonb(s) order by s.match_id, s.side)
                                 from public.match_sides s where s.match_id = any (v_ids)), '[]'::jsonb),
      'match_players', coalesce((select jsonb_agg(to_jsonb(x) order by x.match_id, x.side, x.player_id)
                                   from public.match_players x where x.match_id = any (v_ids)), '[]'::jsonb),
      'match_officials', coalesce((select jsonb_agg(to_jsonb(o) order by o.match_id)
                                     from public.match_officials o where o.match_id = any (v_ids)), '[]'::jsonb),
      'teams', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order, t.id) from public.teams t where t.id = any (v_teams)), '[]'::jsonb),
      'team_players', coalesce((select jsonb_agg(to_jsonb(tp) order by tp.team_id, tp.player_id)
                                  from public.team_players tp where tp.team_id = any (v_teams)), '[]'::jsonb),
      'sanctions', case when v_family = 'team' then coalesce((
        select jsonb_agg(to_jsonb(s) order by s.created_at, s.id) from public.football_sanctions s
         where s.match_id = any (v_ids) or s.player_id = any (v_players)), '[]'::jsonb) else '[]'::jsonb end,
      'ladder_challenges', case when v_family = 'racket' then coalesce((
        select jsonb_agg(to_jsonb(c) order by c.created_at, c.id) from public.ladder_challenges c
         where c.match_id = any (v_ids) or c.event_id = any (v_events)
            or c.challenger = any (v_players || v_teams) or c.challenged = any (v_players || v_teams)), '[]'::jsonb)
        else '[]'::jsonb end);
  end if;

  if p_sport = 'golf' then
    v_ev := array(select c.event_id from public.golf_cards c join public.events e on e.id = c.event_id
                   where c.player_id = any (v_players) and (p_until is null or e.date <= p_until)
                  union
                  select r.event_id from public.golf_rounds r join public.events e on e.id = r.event_id
                   where r.league_id = any (v_leagues) and (p_from is null or e.date >= p_from) and (p_to is null or e.date <= p_to)
                  union
                  select r.event_id from public.golf_rounds r where r.event_id = any (v_events));
    return jsonb_build_object(
      'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.date, e.id) from public.events e where e.id = any (v_ev)), '[]'::jsonb),
      'golf_rounds', coalesce((select jsonb_agg(to_jsonb(r) order by r.event_id) from public.golf_rounds r where r.event_id = any (v_ev)), '[]'::jsonb),
      -- Todas las tarjetas de esas rondas: los marcadores y la tabla del evento.
      'golf_cards', coalesce((select jsonb_agg(to_jsonb(c) order by c.event_id, c.group_no nulls last, c.id)
                                from public.golf_cards c where c.event_id = any (v_ev)), '[]'::jsonb));
  end if;

  if p_sport = 'swimming' then
    v_ev := array(select se.event_id from public.swim_entries se join public.events e on e.id = se.event_id
                   where se.player_id = any (v_players) and (p_until is null or e.date <= p_until)
                  union
                  select m.event_id from public.swim_meets m join public.events e on e.id = m.event_id
                   where m.league_id = any (v_leagues) and (p_from is null or e.date >= p_from) and (p_to is null or e.date <= p_to)
                  union
                  select m.event_id from public.swim_meets m where m.event_id = any (v_events));
    return jsonb_build_object(
      'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.date, e.id) from public.events e where e.id = any (v_ev)), '[]'::jsonb),
      'swim_meets', coalesce((select jsonb_agg(to_jsonb(m) order by m.event_id) from public.swim_meets m where m.event_id = any (v_ev)), '[]'::jsonb),
      'swim_events', coalesce((select jsonb_agg(to_jsonb(x) order by x.event_id, x.num) from public.swim_events x where x.event_id = any (v_ev)), '[]'::jsonb),
      -- Todos los resultados de esos encuentros: el tamaño de cada grupo (W2), los lugares y los récords.
      'swim_entries', coalesce((select jsonb_agg(to_jsonb(se) order by se.event_id, se.swim_event_id, se.id)
                                  from public.swim_entries se where se.event_id = any (v_ev)), '[]'::jsonb),
      'swim_clubs', coalesce((select jsonb_agg(to_jsonb(c) order by c.name, c.id) from public.swim_clubs c
                               where c.league_id in (select e.league_id from public.events e where e.id = any (v_ev))
                                  or c.league_id = any (v_leagues)), '[]'::jsonb));
  end if;
  return '{}'::jsonb;
end $$;

-- Temporadas de una liga ({seasons, season_awards}) con el contrato de public.seasons. Aquí no hay temporadas:
-- 20260929000880_insignias_temporadas.sql la redefine cuando existe public.seasons.
create function private.badge_season_rows(p_league uuid, p_season uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return '{}'::jsonb;
end $$;

-- Felicitaciones y me gusta que dieron esas cuentas a juegos de otros (Buena vibra): {by, league_id, player_id,
-- user_id (del jugador felicitado), at, kind}.
create function private.badge_cheers(p_users uuid[], p_to date default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('by', c.by, 'league_id', c.league_id, 'player_id', c.player_id,
                                               'user_id', c.user_id, 'at', c.at, 'kind', c.kind)
                            order by c.at, c.player_id), '[]'::jsonb)
    from (
      select r.user_id as by, r.league_id, r.player_id, p.user_id, r.created_at as at, 'reaction'::text as kind
        from public.reactions r join public.players p on p.id = r.player_id
       where r.user_id = any (p_users) and r.type in ('felicitar', 'like') and p.user_id is distinct from r.user_id
         and (p_to is null or r.created_at < (p_to + 1)::timestamp at time zone private.badge_tz())
      union all
      select g.user_id, g.league_id, g.player_id, p.user_id, g.created_at, 'like'
        from public.game_likes g join public.players p on p.id = g.player_id
       where g.user_id = any (p_users) and p.user_id is distinct from g.user_id
         and (p_to is null or g.created_at < (p_to + 1)::timestamp at time zone private.badge_tz())
    ) c
$$;

-- Actos de servicio de esas cuentas (Mesa técnica, §2.12), ya con su fecha local: {user_id, league_id, date, kind,
-- ref}. Partidos que dejaron finales (confirmó, o propuso y quedó final, u oficial de mesa) sin jugadores propios
-- en ningún lado; envíos de otro aprobados; resultados de natación de otros en encuentros finalizados; rondas de
-- golf cerradas con 4+ tarjetas.
create function private.badge_service(p_users uuid[], p_from date default null, p_to date default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', z.user_id, 'league_id', z.league_id, 'date', z.date,
                                               'kind', z.kind, 'ref', z.ref)
                            order by z.date, z.kind, z.ref), '[]'::jsonb)
    from (
      select u.user_id, m.league_id, (u.at at time zone l.tz)::date as date, 'match'::text as kind, 'match:' || m.id::text as ref
        from public.matches m
        join public.leagues l on l.id = m.league_id
        cross join lateral (values (m.confirmed_by, m.confirmed_at), (m.proposed_by, m.proposed_at)) as u (user_id, at)
       where u.user_id = any (p_users) and u.at is not null
         and private.match_final(m.status, m.proposed_at) and m.status <> 'void'
         and not exists (select 1 from unnest(private.badge_match_players(m.id)) x join public.players p on p.id = x
                          where p.user_id = u.user_id)
      union
      select o.user_id, m.league_id, private.badge_match_day(m.scheduled_at, m.proposed_at, m.created_at, l.tz), 'match',
             'match:' || m.id::text
        from public.match_officials o
        join public.matches m on m.id = o.match_id
        join public.leagues l on l.id = m.league_id
       where o.user_id = any (p_users) and private.match_final(m.status, m.proposed_at) and m.status <> 'void'
         and not exists (select 1 from unnest(private.badge_match_players(m.id)) x join public.players p on p.id = x
                          where p.user_id = o.user_id)
      union
      select s.reviewed_by, s.league_id, (s.reviewed_at at time zone l.tz)::date, 'submission', 'submission:' || s.id::text
        from public.submissions s
        join public.leagues l on l.id = s.league_id
        join public.players p on p.id = s.player_id
       where s.reviewed_by = any (p_users) and s.status = 'aprobado' and s.reviewed_at is not null
         and s.reviewed_by is distinct from s.created_by and p.user_id is distinct from s.reviewed_by
      union
      select se.recorded_by, se.league_id, (se.result_at at time zone l.tz)::date, 'swim', 'meet:' || se.event_id::text
        from public.swim_entries se
        join public.swim_meets sm on sm.event_id = se.event_id
        join public.leagues l on l.id = se.league_id
        join public.players p on p.id = se.player_id
       where se.recorded_by = any (p_users) and sm.finalized_at is not null and se.result_at is not null
         and p.user_id is distinct from se.recorded_by
      union
      select r.closed_by, r.league_id, (r.closed_at at time zone l.tz)::date, 'golf', 'round:' || r.event_id::text
        from public.golf_rounds r
        join public.leagues l on l.id = r.league_id
       where r.closed_by = any (p_users) and r.status = 'cerrada' and r.closed_at is not null
         and (select count(*) from public.golf_cards c where c.event_id = r.event_id) >= 4
         -- Sin jugadores propios en la ronda (quien jugó y la cerró no hizo servicio).
         and not exists (select 1 from public.golf_cards c join public.players p on p.id = c.player_id
                          where c.event_id = r.event_id and p.user_id = r.closed_by)
    ) z
   where (p_from is null or z.date >= p_from) and (p_to is null or z.date <= p_to)
$$;

-- Junta dos fotos: las listas con la misma clave se suman.
create function private.badge_merge_rows(a jsonb, b jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(a, '{}'::jsonb) || coalesce(jsonb_object_agg(k.key,
           case when jsonb_typeof(a -> k.key) = 'array' and jsonb_typeof(k.value) = 'array' then (a -> k.key) || k.value
                else k.value end), '{}'::jsonb)
    from jsonb_each(coalesce(b, '{}'::jsonb)) k
$$;

-- La foto de datos de un trabajo (BadgeSnapshot, src/badges/snapshot.ts). Qué trae cada tipo de trabajo: ver
-- supabase/README.md, «Motor de insignias». null si el trabajo ya no existe.
create function private.badge_snapshot(p_job bigint, p_now timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  j private.badge_queue;
  lg public.leagues;
  v_today date := (p_now at time zone private.badge_tz())::date;
  v_payload jsonb;
  v_rkind text;
  v_rid text;
  v_id uuid;
  v_sport text;
  v_seeds uuid[] := '{}';      -- jugadores del trabajo
  v_users uuid[] := '{}';      -- cuentas del trabajo
  v_expand boolean := true;    -- sumar los demás jugadores de esas cuentas en el deporte
  v_career boolean := true;    -- traer la carrera de los jugadores (no solo el evento)
  v_until date;                -- la carrera, hasta esa fecha
  v_leagues uuid[] := '{}';    -- ligas con todo lo de la ventana [v_from, v_to]
  v_from date;
  v_to date;
  v_pfrom date;                -- el periodo evaluado (mes, año, temporada)
  v_pto date;
  v_events uuid[] := '{}';
  v_state boolean := false;
  v_accounts uuid[] := '{}';   -- cuentas cuya actividad (todos los deportes) va entera
  v_capped uuid[] := '{}';     -- jugadores de otros: solo sus primeros días
  v_cap integer := 3;
  v_cheers boolean := false;
  v_service boolean := false;
  v_staff uuid[] := '{}';
  v_rows jsonb := '{}'::jsonb;
  v_extra jsonb := '{}'::jsonb;
  v_activity jsonb := null;
  v_months jsonb;
  v_players uuid[];
  v_all_leagues uuid[];
  v_all_users uuid[];
  v_holders uuid[];
  v_season jsonb;
  v_ids uuid[];
begin
  select * into j from private.badge_queue q where q.id = p_job;
  if not found then
    return null;
  end if;
  v_payload := j.payload;
  if j.league_id is not null then
    select * into lg from public.leagues l where l.id = j.league_id;
    v_sport := lg.sport;
  end if;
  v_seeds := private.badge_uuids(v_payload -> 'players');
  v_users := private.badge_uuids(v_payload -> 'users');
  v_rkind := split_part(j.ref, ':', 1);
  v_rid := split_part(j.ref, ':', 2);
  if private.raq_is_uuid(v_rid) then
    v_id := v_rid::uuid;
  end if;

  case j.kind
  when 'resultado', 'revisar' then
    -- Los jugadores que tocó el cambio (y los demás jugadores de sus cuentas en el deporte): toda su carrera.
    v_seeds := v_seeds || case v_rkind
      when 'entry' then array(select x.player_id from public.entries x where x.id = v_id)
      when 'match' then private.badge_match_players(v_id)
      when 'card' then array(select c.player_id from public.golf_cards c where c.id = v_id)
      when 'round' then array(select c.player_id from public.golf_cards c where c.event_id = v_id)
      when 'meet' then array(select se.player_id from public.swim_entries se where se.event_id = v_id)
      when 'event' then private.badge_event_players(array[v_id])
      else '{}'::uuid[] end;

  when 'vinculo' then
    v_seeds := v_seeds || case when v_rkind = 'player' and v_id is not null then array[v_id] else '{}'::uuid[] end;
    if j.user_id is not null then
      v_users := v_users || j.user_id;
      v_accounts := array[j.user_id];
      -- Si se vinculó él mismo (owner o admin), players[].verified_only lo dice (como en todos los trabajos, §1.6).
    end if;

  when 'evento' then
    v_events := case when v_rkind = 'gt' then array(select r.event_id from public.golf_rounds r where r.tournament_id = v_id)
                     when v_id is not null then array[v_id] else '{}'::uuid[] end;
    v_seeds := v_seeds || private.badge_event_players(v_events);
    v_until := (select max(e.date) from public.events e where e.id = any (v_events));
    -- Natación: los récords comparan con todo lo anterior de la liga.
    if v_sport = 'swimming' then
      v_leagues := array[j.league_id];
      v_to := v_until;
    end if;

  when 'noche' then
    v_events := case when v_id is not null then array[v_id] else '{}'::uuid[] end;
    v_seeds := v_seeds || private.badge_event_players(v_events);
    v_expand := false;
    v_career := false;

  when 'cajas' then
    -- El evento de cajas entero y los de la foto del mes (jugadores o parejas).
    v_events := case when v_id is not null then array[v_id] else '{}'::uuid[] end;
    v_ids := private.badge_uuids((select jsonb_agg(x) from jsonb_array_elements(
                                   case when jsonb_typeof(v_payload -> 'month' -> 'boxes') = 'array' then v_payload -> 'month' -> 'boxes' else '[]'::jsonb end) b,
                                   jsonb_array_elements(case when jsonb_typeof(b) = 'array' then b else '[]'::jsonb end) x));
    v_seeds := v_seeds || array(select p.id from public.players p where p.id = any (v_ids)
                                union select tp.player_id from public.team_players tp where tp.team_id = any (v_ids));
    v_expand := false;
    v_career := false;

  when 'escalera' then
    v_events := case when v_id is not null then array[v_id] else '{}'::uuid[] end;
    v_ids := private.badge_uuids(v_payload -> 'rungs', 'entrant_id');
    v_seeds := v_seeds || array(select p.id from public.players p where p.id = any (v_ids)
                                union select tp.player_id from public.team_players tp where tp.team_id = any (v_ids));
    v_expand := false;
    v_career := false;
    if v_payload ->> 'month' ~ '^[0-9]{4}-[0-9]{2}$' then
      v_pfrom := to_date(v_payload ->> 'month' || '-01', 'YYYY-MM-DD');
      v_pto := (v_pfrom + interval '1 month' - interval '1 day')::date;
    end if;
    v_extra := jsonb_build_object('ladder_rungs', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', v_id, 'league_id', j.league_id) || r order by (r ->> 'position')::integer)
        from jsonb_array_elements(case when jsonb_typeof(v_payload -> 'rungs') = 'array' then v_payload -> 'rungs' else '[]'::jsonb end) r
       where jsonb_typeof(r) = 'object'), '[]'::jsonb));

  when 'mes', 'anio' then
    if j.kind = 'mes' then
      v_from := to_date(j.ref || '-01', 'YYYY-MM-DD');
      v_to := (v_from + interval '1 month' - interval '1 day')::date;
    else
      v_from := make_date(j.ref::integer, 1, 1);
      v_to := make_date(j.ref::integer, 12, 31);
    end if;
    v_pfrom := v_from;
    v_pto := v_to;
    v_until := v_to;
    if j.league_id is not null then
      -- La liga: quién jugó ese periodo (con la historia de sus cuentas para las líneas base) y lo de la liga desde
      -- 400 días antes.
      v_seeds := v_seeds || array(select distinct a.player_id
                                    from private.badge_activity(array(select p.id from public.players p where p.league_id = j.league_id), v_from, v_to) a
                                   where a.league_id = j.league_id);
      v_leagues := array[j.league_id];
      if j.kind = 'anio' then
        v_season := private.badge_season_rows(j.league_id, null, v_from, v_to);
      end if;
      v_from := v_from - 400;
    elsif j.user_id is not null then
      -- La cuenta: su actividad de todos los deportes y sus juegos de boliche y tarjetas de golf (Tu mejor mes).
      v_accounts := array[j.user_id];
      v_users := v_users || j.user_id;
      v_rows := private.badge_merge_rows(
        private.badge_family_rows('bowling', array(select p.id from public.players p join public.leagues l on l.id = p.league_id
                                                    where p.user_id = j.user_id and l.sport = 'bowling'), v_to, null, null, null, null),
        private.badge_family_rows('golf', array(select p.id from public.players p join public.leagues l on l.id = p.league_id
                                                 where p.user_id = j.user_id and l.sport = 'golf'), v_to, null, null, null, null));
      v_expand := false;
    end if;

  when 'temporada' then
    v_season := private.badge_season_rows(j.league_id, v_id, null, null);
    v_from := coalesce((v_season -> 'seasons' -> 0 ->> 'starts_on')::date, lg.season_start, v_today - 365);
    v_to := coalesce((v_season -> 'seasons' -> 0 ->> 'ends_on')::date, lg.season_end, v_today);
    v_pfrom := v_from;
    v_pto := v_to;
    v_until := v_to;
    v_seeds := v_seeds
      || array(select distinct a.player_id
                 from private.badge_activity(array(select p.id from public.players p where p.league_id = j.league_id), v_from, v_to) a
                where a.league_id = j.league_id)
      || private.badge_uuids(v_season -> 'season_awards', 'player_id');
    v_leagues := array[j.league_id];
    -- Temporada organizada: los días de servicio del dueño y los admins en la temporada.
    v_service := true;
    v_staff := array(select m.user_id from public.league_members m
                      where m.league_id = j.league_id and m.role in ('owner', 'admin'));
    v_users := v_users || v_staff;
    v_state := v_sport = 'basketball';
    v_from := v_from - 400;

  when 'cuenta' then
    v_accounts := array[j.user_id];
    v_users := v_users || j.user_id;
    -- Ligas que es dueño (Liga en marcha): sus jugadores, con sus primeros 3 días en la liga.
    v_capped := array(select p.id from public.players p join public.leagues l on l.id = p.league_id where l.owner_id = j.user_id);
    -- Jugadores felicitados (Buena vibra): su primer día activo basta.
    v_capped := v_capped || array(select distinct r.player_id from public.reactions r where r.user_id = j.user_id
                                  union select distinct g.player_id from public.game_likes g where g.user_id = j.user_id);
    v_cheers := true;
    v_service := true;
    v_expand := false;

  when 'historial' then
    if j.league_id is null and j.user_id is not null then
      -- El historial de una cuenta (badges_backfill encola uno por cuenta): lo de cuenta y comunidad como en 'cuenta'
      -- (kilometraje, constancia, fijo del mes, tu año, liga en marcha…) en todos sus meses y años, más sus juegos de
      -- boliche y tarjetas de golf (Tu mejor mes). Las carreras y lo de cada liga van en el historial de la liga:
      -- targets vacío.
      v_accounts := array[j.user_id];
      v_users := v_users || j.user_id;
      v_capped := array(select p.id from public.players p join public.leagues l on l.id = p.league_id where l.owner_id = j.user_id);
      v_capped := v_capped || array(select distinct r.player_id from public.reactions r where r.user_id = j.user_id
                                    union select distinct g.player_id from public.game_likes g where g.user_id = j.user_id);
      v_rows := private.badge_merge_rows(
        private.badge_family_rows('bowling', array(select p.id from public.players p join public.leagues l on l.id = p.league_id
                                                    where p.user_id = j.user_id and l.sport = 'bowling'), null, null, null, null, null),
        private.badge_family_rows('golf', array(select p.id from public.players p join public.leagues l on l.id = p.league_id
                                                 where p.user_id = j.user_id and l.sport = 'golf'), null, null, null, null, null));
      v_extra := jsonb_build_object('targets', '[]'::jsonb);
      v_cheers := true;
      v_service := true;
      v_expand := false;
    else
      -- La liga entera (o la ventana del payload) y la historia de sus cuentas; lo de cuenta y comunidad solo de sus
      -- jugadores sin cuenta (las cuentas tienen su propio historial).
      v_leagues := array[j.league_id];
      v_from := nullif(v_payload ->> 'from', '')::date;
      v_to := nullif(v_payload ->> 'to', '')::date;
      v_until := v_to;
      v_seeds := v_seeds || array(select p.id from public.players p where p.league_id = j.league_id);
      v_accounts := array(select distinct p.user_id from public.players p where p.league_id = j.league_id and p.user_id is not null);
      v_users := v_users || v_accounts;
      v_cheers := true;
      v_service := true;
    end if;

  else
    null;
  end case;

  v_seeds := array(select distinct x from unnest(v_seeds) x where x is not null);
  v_users := array(select distinct x from unnest(v_users) x where x is not null);

  -- Los demás jugadores de esas cuentas en el deporte (las insignias de cuenta suman todas sus ligas).
  if v_expand and v_sport is not null then
    v_users := array(select distinct x from unnest(v_users || array(select p.user_id from public.players p
                                                                     where p.id = any (v_seeds) and p.user_id is not null)) x);
    v_seeds := array(select distinct x from unnest(v_seeds || array(
                       select p.id from public.players p join public.leagues l on l.id = p.league_id
                        where p.user_id = any (v_users) and l.sport = v_sport)) x);
  end if;

  if v_sport is not null and j.kind <> 'cuenta' then
    v_rows := private.badge_merge_rows(v_rows,
      private.badge_family_rows(v_sport, case when v_career then v_seeds else '{}'::uuid[] end, v_until, v_leagues,
                                v_from, v_to, v_events, v_state));
  end if;

  if cardinality(v_accounts) > 0 then
    v_activity := private.badge_activity_json(
      array(select p.id from public.players p where p.user_id = any (v_accounts)
            union select x from unnest(case when j.kind = 'historial' then v_seeds else '{}'::uuid[] end) x),
      v_capped, v_cap, case when j.kind in ('mes', 'anio') then v_to end);
  elsif j.kind = 'temporada' then
    -- Revelación: el primer día activo de cada cuenta en el deporte (en cualquier liga).
    v_activity := coalesce((
      select jsonb_agg(x order by x ->> 'date')
        from (select distinct on (a.user_id) jsonb_build_object('sport', a.sport, 'league_id', a.league_id, 'player_id', a.player_id,
                                                               'user_id', a.user_id, 'date', a.date, 'official', a.official, 'roster', a.roster) as x
                from private.badge_activity(array(select p.id from public.players p join public.leagues l on l.id = p.league_id
                                                   where p.user_id in (select p2.user_id from public.players p2 where p2.id = any (v_seeds))
                                                     and l.sport = v_sport), null, null) a
               where a.user_id is not null
               order by a.user_id, a.date) z), '[]'::jsonb);
  end if;

  if v_cheers then
    v_extra := v_extra || jsonb_build_object('cheers', private.badge_cheers(v_accounts, null));
  end if;
  if v_service then
    v_extra := v_extra || jsonb_build_object('service',
      private.badge_service(case when j.kind = 'temporada' then v_staff else v_accounts end,
                            case when j.kind = 'temporada' then v_pfrom end,
                            case when j.kind = 'temporada' then v_pto end));
  end if;
  if v_season is not null then
    v_extra := v_extra || jsonb_build_object('seasons', coalesce(v_season -> 'seasons', '[]'::jsonb),
                                             'season_awards', coalesce(v_season -> 'season_awards', '[]'::jsonb));
  end if;

  -- Todos los jugadores que aparecen.
  v_players := array(select distinct x from unnest(
      v_seeds
      || private.badge_uuids(v_rows -> 'entries', 'player_id')
      || private.badge_uuids(v_rows -> 'submissions', 'player_id')
      || private.badge_uuids(v_rows -> 'match_players', 'player_id')
      || private.badge_uuids(v_rows -> 'team_players', 'player_id')
      || private.badge_uuids(v_rows -> 'sanctions', 'player_id')
      || private.badge_uuids(v_rows -> 'golf_cards', 'player_id')
      || private.badge_uuids(v_rows -> 'swim_entries', 'player_id')
      || private.badge_uuids(v_activity, 'player_id')
      || private.badge_uuids(v_extra -> 'cheers', 'player_id')
      || private.badge_uuids(v_extra -> 'ladder_rungs', 'player_id')
      || private.badge_uuids(v_extra -> 'season_awards', 'player_id')) x
    where x is not null);

  v_all_leagues := array(select distinct x from unnest(
      array[j.league_id] || v_leagues
      || array(select p.league_id from public.players p where p.id = any (v_players))
      || private.badge_uuids(v_rows -> 'events', 'league_id')
      || private.badge_uuids(v_activity, 'league_id')
      || private.badge_uuids(v_extra -> 'service', 'league_id')
      || array(select l.id from public.leagues l
                where l.owner_id = any (case when j.kind = 'cuenta' or (j.kind = 'historial' and j.league_id is null) then v_accounts
                                             else '{}'::uuid[] end))) x
    where x is not null and exists (select 1 from public.leagues l where l.id = x));

  v_months := private.badge_league_months(v_all_leagues, case when j.kind in ('mes', 'anio', 'temporada') then v_to end);

  v_all_users := array(select distinct x from unnest(
      v_users || array[j.user_id]
      || array(select p.user_id from public.players p where p.id = any (v_players))
      || array(select m.user_id from public.league_members m
                where m.league_id = any (v_all_leagues) and (m.role in ('owner', 'admin') or m.is_scorer))
      || array(select distinct u::uuid from jsonb_array_elements(v_months) mm, jsonb_array_elements_text(mm -> 'users') u)
      || private.badge_uuids(v_extra -> 'cheers', 'user_id')) x
    where x is not null);

  v_holders := v_seeds || v_users || array(select p.id from public.players p where p.user_id = any (v_accounts));

  return jsonb_build_object(
      'v', 1,
      'now', private.iso(p_now),
      'job', jsonb_build_object('id', j.id, 'kind', j.kind, 'league_id', j.league_id, 'user_id', j.user_id, 'ref', j.ref,
                                'payload', v_payload, 'run_after', private.iso(j.run_after), 'attempts', j.attempts,
                                'created_at', private.iso(j.created_at)),
      'sport', v_sport,
      'period', case when v_pfrom is not null then jsonb_build_object('from', v_pfrom, 'to', v_pto) end,
      'leagues', coalesce((
        select jsonb_agg(jsonb_build_object('id', l.id, 'sport', l.sport, 'kind', l.kind, 'name', l.name, 'tz', l.tz,
                                            'has_minors', l.has_minors, 'badges_auto', l.badges_auto, 'owner_id', l.owner_id,
                                            'season_start', l.season_start, 'season_end', l.season_end,
                                            'require_photo', l.require_photo, 'rules', l.rules, 'created_at', l.created_at)
                         order by l.id)
          from public.leagues l where l.id = any (v_all_leagues)), '[]'::jsonb),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('league_id', m.league_id, 'user_id', m.user_id, 'role', m.role,
                                            'is_scorer', m.is_scorer, 'joined_at', m.joined_at)
                         order by m.league_id, m.user_id)
          from public.league_members m
         where (m.league_id = any (v_all_leagues) and (m.role in ('owner', 'admin') or m.is_scorer))
            or m.user_id = any (v_accounts)), '[]'::jsonb),
      'profiles', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', p.id, 'created_at', p.created_at, 'blocked_at', p.blocked_at, 'bowlingx', p.firebase_uid is not null,
                 'first_import_on', case when p.firebase_uid is not null then (
                    select min(e.date) from public.entries x
                      join public.events e on e.id = x.event_id
                      join public.players pl on pl.id = x.player_id
                     where pl.user_id = p.id and 'importado' = any (x.photos)) end)
                 order by p.id)
          from public.profiles p where p.id = any (v_all_users)), '[]'::jsonb),
      'players', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'league_id', p.league_id, 'user_id', p.user_id, 'name', p.name,
                                            'is_minor', p.is_minor, 'created_at', p.created_at,
                                            -- Se vinculó él mismo (§1.6): en todo trabajo, de él solo cuenta lo verificado.
                                            'verified_only', private.badge_verified_only(p.id, p.user_id))
                         order by p.id)
          from public.players p where p.id = any (v_players)), '[]'::jsonb),
      'league_months', v_months,
      'awards', coalesce((select jsonb_agg(to_jsonb(a) order by a.awarded_at, a.id)
                            from public.badge_awards a where a.holder = any (v_holders)), '[]'::jsonb),
      'progress', coalesce((select jsonb_agg(to_jsonb(x) order by x.badge_key, x.sport)
                              from public.badge_progress x where x.holder = any (v_holders)), '[]'::jsonb))
    || v_rows
    || v_extra
    || case when v_activity is not null then jsonb_build_object('activity', v_activity) else '{}'::jsonb end;
end $$;

-- =====================================================================
-- Tomar, aplicar y fallar (la Edge Function, por las RPC de service_role de abajo)
-- =====================================================================

-- Toma hasta p_limit (1–50) trabajos vencidos (no 'aviso': ese lo resuelve SQL), sin tomar o tomados hace más de
-- 10 minutos (la función se cayó), con menos de 5 intentos. No sube attempts: un intento se cuenta cuando de verdad
-- se prueba (public.badge_snapshot, o badge_fail con p_charge si la foto falló), así lo que se tomó y no alcanzó a
-- correr (badge_release, o la función que se cayó con la tanda tomada) no pierde intentos. Devuelve [BadgeJob].
create function private.badge_claim(p_limit integer default 25, p_now timestamptz default now()) returns jsonb
language sql security definer set search_path = '' as $$
  with picked as (
    select q.id from private.badge_queue q
     where q.kind <> 'aviso' and q.run_after <= p_now and q.attempts < 5
       and (q.locked_at is null or q.locked_at < p_now - interval '10 minutes')
     order by q.run_after, q.id
     limit least(greatest(coalesce(p_limit, 25), 1), 50)
       for update skip locked
  ), taken as (
    update private.badge_queue q set locked_at = p_now
      from picked p where q.id = p.id
    returning q.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'league_id', t.league_id, 'user_id', t.user_id,
                                               'ref', t.ref, 'payload', t.payload, 'run_after', private.iso(t.run_after),
                                               'attempts', t.attempts, 'created_at', private.iso(t.created_at))
                            order by t.run_after, t.id), '[]'::jsonb)
    from taken t
$$;

-- El motor (o badge_apply) falló con este trabajo: vuelve a la cola en 2^intentos minutos con el error. Si mientras
-- tanto se encoló uno igual, se juntan. A los 5 intentos ya no se toma (queda para la consola del superadmin).
-- p_charge: el intento todavía no se contó (falló la foto, que es la que lo cuenta) y se cuenta aquí.
create function private.badge_fail(p_job bigint, p_error text, p_now timestamptz default now(), p_charge boolean default false)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  j private.badge_queue;
  v_dup bigint;
begin
  select * into j from private.badge_queue q where q.id = p_job for update;
  if not found then
    return;
  end if;
  if coalesce(p_charge, false) then
    j.attempts := j.attempts + 1;
  end if;
  select q.id into v_dup from private.badge_queue q
   where q.id <> j.id and q.locked_at is null and q.kind = j.kind and q.ref = j.ref
     and q.league_id is not distinct from j.league_id and q.user_id is not distinct from j.user_id
     for update;
  if v_dup is not null then
    update private.badge_queue q
       set payload = private.badge_merge_payload(j.payload, q.payload), attempts = greatest(q.attempts, j.attempts),
           last_error = left(coalesce(p_error, ''), 1000)
     where q.id = v_dup;
    delete from private.badge_queue q where q.id = j.id;
    return;
  end if;
  update private.badge_queue q
     set locked_at = null, attempts = j.attempts, last_error = left(coalesce(p_error, ''), 1000),
         run_after = p_now + make_interval(mins => power(2, least(greatest(j.attempts, 1), 10))::integer)
   where q.id = j.id;
end $$;

-- Se tomó y no alcanzó a correr (la corrida se quedó sin tiempo o sin CPU): vuelve a la cola ya, sin espera, sin
-- error y sin gastar un intento. Si mientras tanto se encoló uno igual, se juntan.
create function private.badge_release(p_job bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  j private.badge_queue;
  v_dup bigint;
begin
  select * into j from private.badge_queue q where q.id = p_job for update;
  if not found then
    return;
  end if;
  select q.id into v_dup from private.badge_queue q
   where q.id <> j.id and q.locked_at is null and q.kind = j.kind and q.ref = j.ref
     and q.league_id is not distinct from j.league_id and q.user_id is not distinct from j.user_id
     for update;
  if v_dup is not null then
    update private.badge_queue q
       set payload = private.badge_merge_payload(j.payload, q.payload), attempts = greatest(q.attempts, j.attempts),
           run_after = least(q.run_after, j.run_after)
     where q.id = v_dup;
    delete from private.badge_queue q where q.id = j.id;
    return;
  end if;
  update private.badge_queue q set locked_at = null where q.id = j.id;
end $$;

-- Aplica las decisiones del motor para un trabajo (BadgeDecision[] de src/badges/types.ts, planas) en una sola
-- transacción y borra el trabajo. Si algo falla, nada queda aplicado y el trabajo vuelve a la cola (badge_fail).
-- Devuelve {ok, awarded, reactivated, upgraded, updated, revoked, reviews, adopted, progress, skipped, notices}.
--
-- - award {badge_key, sport, level, period_key, player_id | user_id, league_id, status 'provisional'|'firme', refs,
--   context, hidden?}: nueva (provisional: firme en 7 días); si existe revocada por evidencia, se reactiva (con
--   aviso otra vez); una provisional se actualiza (refs y context) o sube a firme; una en revisión que ya no pide
--   aval sale de revisión (provisional o firme, con aviso); una firme no cambia; una retirada por aval o por fraude no
--   vuelve.
-- - review {…, refs, context, reviewers}: nace en_revision (solo la ve el jugador) y avisa a los revisores elegibles
--   (private.badge_can_review, no los que diga el motor), salvo en ligas con menores. Una provisional que ahora pide
--   aval pasa a en_revision (sin firm_at, fuera de las destacadas) y también avisa a los revisores.
-- - revoke {…, reason 'evidencia'}: retira una provisional o en revisión (las firmes no); sale de las destacadas.
-- - progress {badge_key, sport, holder, value, target, next_level | null}: next_level null borra la fila.
-- - adopt {badge_key, sport, level, period_key, player_id, league_id, user_id}: la copia de respaldo del jugador pasa a
--   su cuenta (§1.6); si la cuenta ya la tenía, queda una (la mejor, con el awarded_at más viejo, oculta si alguna lo
--   estaba) sin aviso nuevo.
-- Un jugador que ya no existe (o de otra liga) o una cuenta que ya no existe: la decisión se salta (skipped). Un
-- trabajo de periodo que ya corrió (private.badge_runs) no aplica nada: {ok, done: true}.
-- context: se le pone v = 1. Para el push, el motor pone context.name (nombre ya resuelto, «Constancia») y
-- context.level_name («oro»); sin eso el aviso dice «Insignia». Trabajo 'historial': todas con context.historial =
-- true y notified_at (un solo push por cuenta al final); en seco (payload.dry_run) no escribe insignias: anota en
-- badge_dry_holders y badge_dry_runs (payload.run_id).
create function private.badge_apply(p_job bigint, p_decisions jsonb, p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  j private.badge_queue;
  v_err text;
  v_result jsonb;
begin
  select * into j from private.badge_queue q where q.id = p_job;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  begin
    v_result := private.badge_apply_decisions(j, p_decisions, p_now);
  exception when others then
    get stacked diagnostics v_err = message_text;
    perform private.badge_fail(p_job, v_err, p_now);
    return jsonb_build_object('ok', false, 'error', v_err);
  end;
  return v_result;
end $$;

create function private.badge_apply_decisions(j private.badge_queue, p_decisions jsonb, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_keys constant text := '^[a-z][a-z0-9_]{1,39}$';
  v_rank constant text[] := array['revocada', 'en_revision', 'provisional', 'firme'];
  v_hist boolean := j.kind = 'historial';
  v_dry boolean := j.kind = 'historial' and coalesce((j.payload ->> 'dry_run')::boolean, false);
  v_run uuid;
  d jsonb;
  v_kind text;
  v_key text;
  v_sport text;
  v_level smallint;
  v_period text;
  v_player uuid;
  v_user uuid;
  v_league uuid;
  v_holder uuid;
  v_status text;
  v_refs text[];
  v_ctx jsonb;
  v_hidden boolean;
  v_owner uuid;
  v_id uuid;
  a public.badge_awards;
  b public.badge_awards;
  v_new uuid[] := '{}';
  v_reviews uuid[] := '{}';
  v_dry_keys text[] := '{}';
  n_awarded integer := 0;
  n_reactivated integer := 0;
  n_upgraded integer := 0;
  n_updated integer := 0;
  n_revoked integer := 0;
  n_reviews integer := 0;
  n_adopted integer := 0;
  n_progress integer := 0;
  n_skipped integer := 0;
  n_notices integer := 0;
  r record;
begin
  if p_decisions is null or jsonb_typeof(p_decisions) <> 'array' or jsonb_array_length(p_decisions) > 20000 then
    raise exception 'invalido: decisiones' using errcode = 'P0001';
  end if;
  if v_dry then
    v_run := nullif(j.payload ->> 'run_id', '')::uuid;
    if v_run is null then
      raise exception 'invalido: run_id' using errcode = 'P0001';
    end if;
  end if;
  -- Un periodo que ya corrió (otro trabajo igual entró mientras este corría): no se da nada otra vez (§3.4).
  if private.badge_period_done(j.kind, j.league_id, j.user_id, j.ref) then
    delete from private.badge_queue q where q.id = j.id;
    return jsonb_build_object('ok', true, 'awarded', 0, 'reactivated', 0, 'upgraded', 0, 'updated', 0, 'revoked', 0,
                              'reviews', 0, 'adopted', 0, 'progress', 0, 'skipped', jsonb_array_length(p_decisions),
                              'notices', 0, 'done', true);
  end if;

  for d in select x from jsonb_array_elements(p_decisions) x loop
    if jsonb_typeof(d) <> 'object' then
      raise exception 'invalido: decisión' using errcode = 'P0001';
    end if;
    v_kind := d ->> 'kind';
    v_key := d ->> 'badge_key';
    v_sport := d ->> 'sport';
    v_player := nullif(d ->> 'player_id', '')::uuid;
    v_user := nullif(d ->> 'user_id', '')::uuid;
    v_league := nullif(d ->> 'league_id', '')::uuid;
    if v_kind is null or v_kind not in ('award', 'review', 'revoke', 'progress', 'adopt')
       or coalesce(v_key, '') !~ v_keys
       or v_sport is null or v_sport not in ('all', 'bowling', 'padel', 'tennis', 'pickleball', 'basketball', 'football', 'futsal', 'golf', 'swimming') then
      raise exception 'invalido: % % %', v_kind, v_key, v_sport using errcode = 'P0001';
    end if;
    if v_kind in ('award', 'review', 'revoke', 'adopt') then
      v_level := (d ->> 'level')::smallint;
      v_period := d ->> 'period_key';
      if v_level is null or v_level not between 0 and 5 or coalesce(v_period, '') !~ '^[A-Za-z0-9:_-]{1,120}$' then
        raise exception 'invalido: nivel o periodo de %', v_key using errcode = 'P0001';
      end if;
    end if;
    if v_kind = 'adopt' then
      if v_player is null or v_user is null or v_league is null then
        raise exception 'invalido: adopt de %', v_key using errcode = 'P0001';
      end if;
    elsif num_nonnulls(v_player, v_user) <> 1 or (v_player is not null and v_league is null) or (v_user is not null and v_league is not null) then
      raise exception 'invalido: dueño de %', v_key using errcode = 'P0001';
    end if;
    -- Jugador que ya no existe o no es de esa liga, cuenta que ya no existe: se salta.
    if v_player is not null and not exists (select 1 from public.players p where p.id = v_player and p.league_id = v_league
                                              and (v_kind <> 'adopt' or p.user_id = v_user)) then
      n_skipped := n_skipped + 1;
      continue;
    end if;
    if v_user is not null and not exists (select 1 from public.profiles p where p.id = v_user) then
      n_skipped := n_skipped + 1;
      continue;
    end if;
    v_holder := coalesce(v_player, v_user);

    if v_kind = 'progress' then
      continue when v_dry;
      if nullif(d ->> 'next_level', '') is null then
        delete from public.badge_progress x where x.holder = v_holder and x.badge_key = v_key and x.sport = v_sport;
      else
        insert into public.badge_progress as x (player_id, user_id, league_id, badge_key, sport, value, target, next_level)
        values (v_player, v_user, v_league, v_key, v_sport, (d ->> 'value')::double precision, (d ->> 'target')::double precision,
                (d ->> 'next_level')::smallint)
        on conflict (holder, badge_key, sport) do update
          set value = excluded.value, target = excluded.target, next_level = excluded.next_level
          where (x.value, x.target, x.next_level) is distinct from (excluded.value, excluded.target, excluded.next_level);
      end if;
      n_progress := n_progress + 1;
      continue;
    end if;

    if v_kind = 'revoke' then
      continue when v_dry;
      for r in
        update public.badge_awards x
           set status = 'revocada', revoked_at = p_now, revoke_reason = 'evidencia', revoked_by = null
         where x.holder = v_holder and x.badge_key = v_key and x.sport = v_sport and x.level = v_level
           and x.period_key = v_period and x.status in ('provisional', 'en_revision')
        returning x.id, coalesce(x.user_id, (select p.user_id from public.players p where p.id = x.player_id)) as owner
      loop
        update public.profiles p set featured_badges = array_remove(p.featured_badges, r.id)
         where p.id = r.owner and r.id = any (p.featured_badges);
        n_revoked := n_revoked + 1;
      end loop;
      continue;
    end if;

    if v_kind = 'adopt' then
      continue when v_dry;
      select * into a from public.badge_awards x
       where x.holder = v_player and x.badge_key = v_key and x.sport = v_sport and x.level = v_level and x.period_key = v_period
       for update;
      if a.id is null then
        n_skipped := n_skipped + 1;
        continue;
      end if;
      select * into b from public.badge_awards x
       where x.holder = v_user and x.badge_key = v_key and x.sport = v_sport and x.level = v_level and x.period_key = v_period
       for update;
      if b.id is not null then
        -- Queda la de la cuenta con lo mejor de las dos; la del jugador se borra (tombstone) y sale de las destacadas.
        -- Oculta si alguna lo estaba: la copia de respaldo nace visible sin que nadie lo eligiera, y no destapa lo que
        -- la cuenta ocultó (§1.4).
        delete from public.badge_awards x where x.id = a.id;
        update public.badge_awards x
           set status = case when array_position(v_rank, a.status) > array_position(v_rank, b.status) then a.status else b.status end,
               firm_at = case when array_position(v_rank, a.status) > array_position(v_rank, b.status) then a.firm_at else b.firm_at end,
               revoked_at = case when array_position(v_rank, a.status) > array_position(v_rank, b.status) then a.revoked_at else b.revoked_at end,
               revoke_reason = case when array_position(v_rank, a.status) > array_position(v_rank, b.status) then a.revoke_reason else b.revoke_reason end,
               revoked_by = case when array_position(v_rank, a.status) > array_position(v_rank, b.status) then a.revoked_by else b.revoked_by end,
               awarded_at = least(a.awarded_at, b.awarded_at),
               seen_at = least(a.seen_at, b.seen_at),
               notified_at = least(a.notified_at, b.notified_at),
               hidden = a.hidden or b.hidden
         where x.id = b.id;
        update public.profiles p set featured_badges = array_remove(p.featured_badges, a.id)
         where p.id = v_user and a.id = any (p.featured_badges);
      else
        update public.badge_awards x set player_id = null, league_id = null, user_id = v_user where x.id = a.id;
        -- Deja de ser de la liga: los teléfonos que la sincronizaron por liga la quitan.
        insert into public.tombstones (tbl, row_key, league_id) values ('badge_awards', a.id::text, a.league_id);
      end if;
      n_adopted := n_adopted + 1;
      continue;
    end if;

    -- award o review
    v_refs := coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(d -> 'refs') = 'array' then d -> 'refs' else '[]'::jsonb end)), '{}'::text[]);
    v_ctx := jsonb_build_object('v', 1)
          || case when jsonb_typeof(d -> 'context') = 'object' then d -> 'context' else '{}'::jsonb end
          || case when v_hist then jsonb_build_object('historial', true) else '{}'::jsonb end;
    if v_kind = 'award' then
      v_status := coalesce(d ->> 'status', 'provisional');
      if v_status not in ('provisional', 'firme') then
        raise exception 'invalido: estado de %', v_key using errcode = 'P0001';
      end if;
      v_hidden := coalesce((d ->> 'hidden')::boolean, false);
    else
      v_status := 'en_revision';
      v_hidden := false;
    end if;

    if v_dry then
      v_owner := coalesce(v_user, (select p.user_id from public.players p where p.id = v_player));
      if v_owner is not null then
        insert into private.badge_dry_holders (run_id, badge_key, sport, level, holder)
        values (v_run, v_key, v_sport, v_level, v_owner) on conflict do nothing;
        v_dry_keys := v_dry_keys || (v_key || '|' || v_sport || '|' || v_level::text);
      end if;
      n_awarded := n_awarded + 1;
      continue;
    end if;

    v_id := null;
    insert into public.badge_awards as x (badge_key, sport, level, period_key, player_id, user_id, league_id, status,
                                          awarded_at, firm_at, refs, context, hidden, notified_at)
    values (v_key, v_sport, v_level, v_period, v_player, v_user, v_league, v_status, p_now,
            case v_status when 'provisional' then p_now + interval '7 days' when 'firme' then p_now end,
            v_refs, v_ctx, v_hidden, case when v_hist then p_now end)
    on conflict (holder, badge_key, sport, level, period_key) do nothing
    returning x.id into v_id;
    if v_id is not null then
      if v_status = 'en_revision' then
        n_reviews := n_reviews + 1;
        v_reviews := v_reviews || v_id;
      else
        n_awarded := n_awarded + 1;
        v_new := v_new || v_id;
      end if;
      continue;
    end if;

    select * into a from public.badge_awards x
     where x.holder = v_holder and x.badge_key = v_key and x.sport = v_sport and x.level = v_level and x.period_key = v_period
     for update;
    if a.status = 'revocada' then
      -- Solo vuelve lo que se retiró por evidencia; lo que rechazó un aval o el superadmin no.
      if a.revoke_reason is distinct from 'evidencia' then
        n_skipped := n_skipped + 1;
        continue;
      end if;
      update public.badge_awards x
         set status = v_status, revoked_at = null, revoke_reason = null, revoked_by = null, awarded_at = p_now,
             firm_at = case v_status when 'provisional' then p_now + interval '7 days' when 'firme' then p_now end,
             refs = v_refs, context = v_ctx, seen_at = null, notified_at = case when v_hist then p_now end
       where x.id = a.id;
      if v_status = 'en_revision' then
        n_reviews := n_reviews + 1;
        v_reviews := v_reviews || a.id;
      else
        n_reactivated := n_reactivated + 1;
        v_new := v_new || a.id;
      end if;
    elsif a.status = 'provisional' and v_status = 'firme' then
      update public.badge_awards x set status = 'firme', firm_at = p_now, refs = v_refs, context = v_ctx where x.id = a.id;
      n_upgraded := n_upgraded + 1;
    elsif a.status = 'provisional' and v_status = 'en_revision' then
      -- Ahora pide aval (el águila corregida que resultó albatros): vuelve a revisión, sin fecha de firme, sale de las
      -- destacadas y se avisa a los revisores.
      update public.badge_awards x set status = 'en_revision', firm_at = null, refs = v_refs, context = v_ctx where x.id = a.id;
      update public.profiles p set featured_badges = array_remove(p.featured_badges, a.id)
       where a.id = any (p.featured_badges);
      n_reviews := n_reviews + 1;
      v_reviews := v_reviews || a.id;
    elsif a.status = 'en_revision' and v_status in ('provisional', 'firme')
          and (a.context ->> 'alt') is distinct from (v_ctx ->> 'alt') then
      -- Ya no pide aval (el albatros corregido a águila: cambió la cara, context.alt): sale de revisión con su
      -- evidencia y se avisa como nueva. Con la misma cara, un «award» no se salta el aval.
      update public.badge_awards x
         set status = v_status, awarded_at = p_now,
             firm_at = case v_status when 'provisional' then p_now + interval '7 days' else p_now end,
             refs = v_refs, context = v_ctx, seen_at = null, notified_at = case when v_hist then p_now end
       where x.id = a.id;
      n_awarded := n_awarded + 1;
      v_new := v_new || a.id;
    elsif a.status = v_status and a.status in ('provisional', 'en_revision')
          and (a.refs is distinct from v_refs or a.context is distinct from v_ctx) then
      -- Se sigue cumpliendo con otra evidencia: se actualiza y se queda.
      update public.badge_awards x set refs = v_refs, context = v_ctx where x.id = a.id;
      n_updated := n_updated + 1;
    end if;
  end loop;

  -- En seco: el resumen de la corrida para cada key, deporte y nivel que tocó este trabajo.
  if v_dry and cardinality(v_dry_keys) > 0 then
    insert into private.badge_dry_runs as x (run_id, badge_key, sport, level, holders, base)
    select v_run, h.badge_key, h.sport, h.level, count(*)::integer,
           (select count(distinct a2.user_id)::integer
              from private.badge_activity(null, (p_now at time zone private.badge_tz())::date - 365, (p_now at time zone private.badge_tz())::date) a2
             where a2.user_id is not null and (h.sport = 'all' or a2.sport = h.sport))
      from private.badge_dry_holders h
     where h.run_id = v_run and (h.badge_key || '|' || h.sport || '|' || h.level::text) = any (v_dry_keys)
     group by h.badge_key, h.sport, h.level
    on conflict (run_id, badge_key, sport, level) do update set holders = excluded.holders, base = excluded.base;
  end if;

  -- Periodos: una sola vez.
  if j.kind in ('evento', 'noche', 'cajas', 'escalera', 'mes', 'anio', 'temporada', 'historial') then
    insert into private.badge_runs as x (kind, scope, period_key, done_at, awarded)
    values (j.kind, coalesce(j.league_id::text, 'u:' || j.user_id::text), j.ref, p_now, n_awarded + n_reactivated)
    on conflict (kind, scope, period_key) do update set done_at = excluded.done_at, awarded = excluded.awarded;
  end if;

  if not v_dry then
    -- Avisos: una fila 'aviso' por cuenta con algo nuevo que se puede avisar (el push sale agrupado después).
    for r in
      select distinct coalesce(x.user_id, p.user_id) as u
        from public.badge_awards x
        left join public.players p on p.id = x.player_id
        left join public.leagues l on l.id = x.league_id
        join public.profiles pr on pr.id = coalesce(x.user_id, p.user_id)
       where x.id = any (v_new) and x.status in ('provisional', 'firme') and not x.hidden
         and not coalesce(l.has_minors, false) and pr.blocked_at is null
    loop
      perform private.badge_enqueue('aviso', null, r.u, case when v_hist then 'historial' else 'push' end, '{}'::jsonb,
        private.badge_quiet_until(p_now + case when v_hist then interval '30 minutes' else interval '0 minutes' end));
      n_notices := n_notices + 1;
    end loop;
    if not v_hist and cardinality(v_reviews) > 0 then
      perform private.badge_push_reviewers(v_reviews);
    end if;
  end if;

  delete from private.badge_queue q where q.id = j.id;
  return jsonb_build_object('ok', true, 'awarded', n_awarded, 'reactivated', n_reactivated, 'upgraded', n_upgraded,
                            'updated', n_updated, 'revoked', n_revoked, 'reviews', n_reviews, 'adopted', n_adopted,
                            'progress', n_progress, 'skipped', n_skipped, 'notices', n_notices);
end $$;

-- =====================================================================
-- Avisos (push agrupado, §3.6)
-- =====================================================================

-- Cómo se nombra una insignia en un push: context.name y, con nivel, context.level_name.
create function private.badge_push_label(p_ctx jsonb, p_level smallint, p_style text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(btrim(p_ctx ->> 'name'), ''), 'Insignia')
      || case when p_level > 0 and nullif(btrim(p_ctx ->> 'level_name'), '') is not null
              then case p_style when 'dot' then ' · ' || btrim(p_ctx ->> 'level_name') else ' (' || btrim(p_ctx ->> 'level_name') || ')' end
              else '' end
$$;

-- Hazañas por confirmar: push a los dueños y admins de la liga que pueden dar el aval (private.badge_can_review),
-- sin cuentas bloqueadas, nunca en ligas con menores. «Hay una hazaña por confirmar» · «En {liga}: {Juego perfecto}
-- de {Ana}.» Tag 'insignia-aval:<id>' (una vez por insignia y cuenta). Nunca frena al motor.
create function private.badge_push_reviewers(p_awards uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select a.id, a.league_id, l.name as league_name, pl.name as player_name, a.context, a.level, m.user_id
      from public.badge_awards a
      join public.leagues l on l.id = a.league_id
      join public.players pl on pl.id = a.player_id
      join public.league_members m on m.league_id = a.league_id and m.role in ('owner', 'admin')
      join public.profiles pr on pr.id = m.user_id
     where a.id = any (p_awards) and a.status = 'en_revision' and not l.has_minors and pr.blocked_at is null
       and private.badge_can_review(a.id, m.user_id)
  loop
    begin
      if not exists (select 1 from public.push_outbox o where o.user_id = r.user_id and o.tag = 'insignia-aval:' || r.id::text) then
        insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
        values (r.user_id, 'Hay una hazaña por confirmar',
                left('En ' || r.league_name || ': ' || private.badge_push_label(r.context, r.level, 'paren') || ' de ' || r.player_name
                     || '. Confírmala si la viste.', 1000),
                '/l/' || r.league_id::text || '/admin?tab=confirmar', 'insignia-aval:' || r.id::text, 259200, 'normal');
        n := n + 1;
      end if;
    exception when others then
      raise warning 'push de aval %: %', r.id, sqlerrm;
    end;
  end loop;
  if n > 0 then
    perform private.kick_send_push();
  end if;
  return n;
exception when others then
  raise warning 'push de avales: %', sqlerrm;
  return n;
end $$;

-- Resuelve los trabajos 'aviso' vencidos: un push por cuenta con todo lo que no se le avisó (provisional o firme,
-- no oculta, no de ligas con menores). Nunca entre 9:00 pm y 8:00 am; como mucho uno cada 6 h por cuenta (lo demás
-- espera y sale junto). Cuenta bloqueada o borrada: no se avisa (queda marcado). 'historial': «Te dimos {n}
-- insignias por tu historial». Tag 'insignias' (la nueva reemplaza la anterior en el teléfono). Devuelve cuántos
-- push salieron.
create function private.badge_send_notices(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  j record;
  v_quiet timestamptz := private.badge_quiet_until(p_now);
  v_last timestamptz;
  v_ids uuid[];
  v_labels text[];
  v_n integer;
  v_first record;
  v_title text;
  v_body text;
  v_sent integer := 0;
begin
  for j in
    select q.* from private.badge_queue q
     where q.kind = 'aviso' and q.run_after <= p_now and q.locked_at is null
     order by q.run_after, q.id
     for update skip locked
  loop
    if v_quiet > p_now then
      update private.badge_queue q set run_after = v_quiet where q.id = j.id;
      continue;
    end if;
    -- Lo que se le puede avisar (las ocultas, de ligas con menores y en revisión nunca avisan): lo más nuevo y el
    -- nivel más alto primero (el push nombra las dos primeras).
    select coalesce(array_agg(x.id order by x.awarded_at desc, x.level desc, x.badge_key, x.id), '{}'::uuid[]),
           coalesce(array_agg(private.badge_push_label(x.context, x.level, 'paren')
                              order by x.awarded_at desc, x.level desc, x.badge_key, x.id), '{}'::text[])
      into v_ids, v_labels
      from public.badge_awards x
      left join public.players p on p.id = x.player_id
      left join public.leagues l on l.id = x.league_id
     where (x.user_id = j.user_id or p.user_id = j.user_id)
       and x.status in ('provisional', 'firme') and not x.hidden and not coalesce(l.has_minors, false)
       and case when j.ref = 'historial' then x.context ? 'historial' and x.seen_at is null else x.notified_at is null end;
    v_n := cardinality(v_ids);
    if v_n = 0 or not exists (select 1 from public.profiles pr where pr.id = j.user_id and pr.blocked_at is null) then
      if j.ref <> 'historial' and v_n > 0 then
        update public.badge_awards x set notified_at = p_now where x.id = any (v_ids);
      end if;
      delete from private.badge_queue q where q.id = j.id;
      continue;
    end if;
    if j.ref <> 'historial' then
      select max(o.created_at) into v_last from public.push_outbox o where o.user_id = j.user_id and o.tag = 'insignias';
      if v_last is not null and v_last > p_now - interval '6 hours' then
        update private.badge_queue q set run_after = private.badge_quiet_until(v_last + interval '6 hours') where q.id = j.id;
        continue;
      end if;
    end if;
    if j.ref = 'historial' then
      v_title := '¡Tus insignias llegaron!';
      v_body := 'Te dimos ' || v_n || case when v_n = 1 then ' insignia' else ' insignias' end || ' por tu historial. ¡Míralas!';
    elsif v_n = 1 then
      select x.context, x.level, coalesce(l.name, x.context -> 'league' ->> 'name') as league_name into v_first
        from public.badge_awards x left join public.leagues l on l.id = x.league_id where x.id = v_ids[1];
      v_title := '¡Te ganaste una insignia!';
      v_body := private.badge_push_label(v_first.context, v_first.level, 'dot')
             || coalesce(' en ' || nullif(btrim(v_first.league_name), ''), '') || '. Tócala para verla.';
    else
      v_title := '¡Te ganaste ' || v_n || ' insignias!';
      v_body := case when v_n = 2 then v_labels[1] || ' y ' || v_labels[2] || '.'
                     else v_labels[1] || ', ' || v_labels[2] || ' y ' || (v_n - 2) || ' más.' end;
    end if;
    begin
      -- created_at = la hora de la corrida: con ella se mide «uno cada 6 h».
      insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency, created_at)
      values (j.user_id, left(v_title, 200), left(v_body, 1000), '/u/' || j.user_id::text || '?tab=insignias', 'insignias',
              86400, 'normal', p_now);
      v_sent := v_sent + 1;
    exception when others then
      raise warning 'push de insignias %: %', j.user_id, sqlerrm;
    end;
    if j.ref <> 'historial' then
      update public.badge_awards x set notified_at = p_now where x.id = any (v_ids);
    end if;
    delete from private.badge_queue q where q.id = j.id;
  end loop;
  if v_sent > 0 then
    perform private.kick_send_push();
  end if;
  return v_sent;
end $$;

-- =====================================================================
-- Rareza (§3.8), limpieza y la tarea diaria
-- =====================================================================

-- Por (key, deporte, nivel): cuentas distintas con la insignia provisional o firme (las de liga por la cuenta de su
-- jugador; nunca ligas con menores ni cuentas bloqueadas) sobre las cuentas con un día activo en ese deporte en los
-- últimos 365 días ('all': en cualquiera). Con base < 50, 'nueva'. Reemplaza badge_stats. Devuelve cuántas filas.
create function private.badge_stats_refresh(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (p_now at time zone private.badge_tz())::date;
  n integer;
begin
  with base as (
    select coalesce(a.sport, 'all') as sport, count(distinct a.user_id)::integer as n
      from private.badge_activity(null, v_today - 365, v_today) a
      join public.profiles pr on pr.id = a.user_id and pr.blocked_at is null
     group by grouping sets ((a.sport), ())
  ), h as (
    select x.badge_key, x.sport, x.level, count(distinct coalesce(x.user_id, p.user_id))::integer as holders
      from public.badge_awards x
      left join public.players p on p.id = x.player_id
      left join public.leagues l on l.id = x.league_id
      join public.profiles pr on pr.id = coalesce(x.user_id, p.user_id) and pr.blocked_at is null
     where x.status in ('provisional', 'firme') and not coalesce(l.has_minors, false)
     group by x.badge_key, x.sport, x.level
  ), s as (
    select h.badge_key, h.sport, h.level, h.holders, coalesce(b.n, 0) as base,
           case when coalesce(b.n, 0) = 0 then 0::double precision
                else least(100, round((100.0 * h.holders / b.n)::numeric, 2)::double precision) end as pct
      from h left join base b on b.sport = h.sport
  ), up as (
    insert into public.badge_stats as x (badge_key, sport, level, holders, base, pct, rarity, computed_at)
    select s.badge_key, s.sport, s.level, s.holders, s.base, s.pct,
           case when s.base < 50 then 'nueva' when s.pct >= 40 then 'comun' when s.pct >= 15 then 'poco_comun'
                when s.pct >= 5 then 'rara' when s.pct >= 1 then 'epica' else 'legendaria' end,
           p_now
      from s
    on conflict (badge_key, sport, level) do update
      set holders = excluded.holders, base = excluded.base, pct = excluded.pct, rarity = excluded.rarity, computed_at = excluded.computed_at
    returning 1
  )
  select count(*)::integer into n from up;
  delete from public.badge_stats x where x.computed_at < p_now;
  return n;
end $$;

-- Limpieza del motor (la llama badges_daily): trabajos que ya no se van a tomar (5 intentos) de más de 30 días,
-- marcas de periodo de más de 400 días (los meses y años ya no vuelven) y corridas en seco de más de 90 días.
create function private.badge_cleanup(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb := '{}'::jsonb;
  n integer;
begin
  delete from private.badge_queue q where q.attempts >= 5 and q.created_at < p_now - interval '30 days';
  get diagnostics n = row_count;
  v := v || jsonb_build_object('badge_queue', n);
  delete from private.badge_runs r where r.done_at < p_now - interval '400 days';
  get diagnostics n = row_count;
  v := v || jsonb_build_object('badge_runs', n);
  delete from private.badge_dry_holders h where h.created_at < p_now - interval '90 days';
  delete from private.badge_dry_runs r where r.created_at < p_now - interval '90 days';
  get diagnostics n = row_count;
  v := v || jsonb_build_object('badge_dry_runs', n);
  return v;
end $$;

-- Jugadores y cuentas que toca un trabajo 'resultado' o 'revisar': los de su payload y los de su ref (la
-- participación, el partido, la tarjeta, la ronda, el encuentro, el evento o el jugador), con sus cuentas.
create function private.badge_job_people(p_ref text, p_payload jsonb) returns uuid[]
language plpgsql stable security definer set search_path = '' as $$
declare
  v_kind text := split_part(coalesce(p_ref, ''), ':', 1);
  v_id uuid;
  v_players uuid[] := private.badge_uuids(p_payload -> 'players');
begin
  if private.raq_is_uuid(split_part(coalesce(p_ref, ''), ':', 2)) then
    v_id := split_part(p_ref, ':', 2)::uuid;
    v_players := v_players || case v_kind
      when 'entry' then array(select x.player_id from public.entries x where x.id = v_id)
      when 'match' then private.badge_match_players(v_id)
      when 'card' then array(select c.player_id from public.golf_cards c where c.id = v_id)
      when 'round' then array(select c.player_id from public.golf_cards c where c.event_id = v_id)
      when 'meet' then array(select se.player_id from public.swim_entries se where se.event_id = v_id)
      when 'event' then private.badge_event_players(array[v_id])
      when 'player' then array[v_id]
      else '{}'::uuid[] end;
  end if;
  return array(select distinct x from unnest(v_players || private.badge_uuids(p_payload -> 'users')
                 || array(select p.user_id from public.players p where p.id = any (v_players) and p.user_id is not null)) x
               where x is not null);
end $$;

-- Encola un trabajo de periodo si no corrió ni está vivo en la cola. Uno que quedó muerto (5 intentos) tiene otra
-- oportunidad: vuelve con los intentos en 0 (así un mes que no alcanzó a correr no se pierde; se recupera del día 3
-- al 10).
create function private.badge_enqueue_period(p_kind text, p_league uuid, p_user uuid, p_ref text,
                                             p_payload jsonb default '{}', p_run_after timestamptz default now()) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from private.badge_runs r
              where r.kind = p_kind and r.scope = coalesce(p_league::text, 'u:' || p_user::text) and r.period_key = p_ref)
     or exists (select 1 from private.badge_queue q
                 where q.kind = p_kind and q.ref = p_ref and q.league_id is not distinct from p_league
                   and q.user_id is not distinct from p_user and q.attempts < 5) then
    return false;
  end if;
  update private.badge_queue q
     set attempts = 0, payload = private.badge_merge_payload(q.payload, p_payload), run_after = coalesce(p_run_after, now())
   where q.kind = p_kind and q.ref = p_ref and q.league_id is not distinct from p_league
     and q.user_id is not distinct from p_user and q.attempts >= 5 and q.locked_at is null;
  if not found then
    perform private.badge_enqueue(p_kind, p_league, p_user, p_ref, p_payload, p_run_after);
  end if;
  return true;
end $$;

-- Las tareas de la noche (00:30 de Santo Domingo; §3.3). Idempotente: correrla otra vez el mismo día no repite nada.
-- 1. Provisionales con 7 días → firmes. 2. Torneos de boliche de hace 3+ días → 'evento'. 3. Noches de americano o
-- mexicano cerradas (fecha pasada, todo final, 24 h desde el último resultado) → 'noche'. 4. Días 1 y 2: la foto de
-- cada escalera (puesto de cada uno) → 'escalera' del mes que cerró, para el día 3. 5. Días 3 a 10: 'mes' del mes
-- anterior por liga (kind 'liga') y por cuenta con actividad. 6. Del 7 al 31 de enero: 'anio' del año anterior. 7.
-- 'cuenta' para las cuentas con actividad, felicitaciones o servicio de hace 2 días (así solo cuenta lo de 48 h o
-- más), dueños de esas ligas y aniversarios. 8. Rareza. 9. Limpieza. Si quedó trabajo, llama a la Edge Function.
-- No cierra temporadas (lo hace el admin con close_season). Devuelve cuántos de cada cosa.
create function private.badges_daily(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (p_now at time zone private.badge_tz())::date;
  v_day date := v_today - 2;
  v_prev_month date := (date_trunc('month', v_today) - interval '1 month')::date;
  v_month_key text := to_char(v_prev_month, 'YYYY-MM');
  v_year integer := extract(year from v_today)::integer - 1;
  v_firm integer;
  v_events integer := 0;
  v_nights integer := 0;
  v_ladders integer := 0;
  v_months integer := 0;
  v_years integer := 0;
  v_accounts integer := 0;
  v_stats integer;
  v_cleanup jsonb;
  v_held uuid[];
  r record;
begin
  -- Provisionales con 7 días → firmes, salvo las de quien tiene una corrección sin aplicar en la cola ('resultado' o
  -- 'revisar' vencido, tomado, con espera o muerto; no los que esperan sus 48 h): siguen provisionales hasta que se
  -- aplique, así la corrección todavía las puede retirar.
  v_held := array(select distinct u from private.badge_queue q
                   cross join lateral unnest(private.badge_job_people(q.ref, q.payload)) u
                   where q.kind in ('resultado', 'revisar')
                     and (q.run_after <= p_now or q.attempts > 0 or q.last_error is not null or q.locked_at is not null));
  update public.badge_awards x set status = 'firme'
   where x.status = 'provisional' and x.firm_at <= p_now and not (x.holder = any (v_held));
  get diagnostics v_firm = row_count;

  -- Podios de boliche (event_podium, bowling_category_win, bowling_team_win): torneos de hace 3 a 30 días.
  for r in
    select e.id, e.league_id from public.events e join public.leagues l on l.id = e.league_id
     where l.sport = 'bowling' and e.type = 'torneo' and e.date between v_today - 30 and v_today - 3
  loop
    if private.badge_enqueue_period('evento', r.league_id, null, 'event:' || r.id::text) then
      v_events := v_events + 1;
    end if;
  end loop;

  -- Noches cerradas (Figura de la noche).
  for r in
    select e.id, e.league_id from public.events e join public.leagues l on l.id = e.league_id
     where l.sport in ('padel', 'pickleball') and e.type in ('americano', 'mexicano')
       and e.date between v_today - 30 and v_today - 1
       and exists (select 1 from public.matches m where m.event_id = e.id)
       and not exists (select 1 from public.matches m where m.event_id = e.id and m.status <> 'void'
                         and not private.match_final(m.status, m.proposed_at))
       and (select max(coalesce(m.confirmed_at, m.proposed_at, m.updated_at)) from public.matches m where m.event_id = e.id)
           <= p_now - interval '24 hours'
  loop
    if private.badge_enqueue_period('noche', r.league_id, null, 'event:' || r.id::text) then
      v_nights := v_nights + 1;
    end if;
  end loop;

  -- La foto de las escaleras al cerrar el mes (no hay historial de puestos): se evalúa el día 3.
  if extract(day from v_today) <= 2 then
    for r in
      select e.id, e.league_id,
             jsonb_agg(jsonb_build_object('entrant_id', x.entrant_id, 'player_id', x.player_id, 'team_id', x.team_id,
                                          'position', x.position) order by x.position) as rungs
        from public.events e
        join public.ladder_rungs x on x.event_id = e.id
       where e.type = 'escalera'
       group by e.id, e.league_id
    loop
      if private.badge_enqueue_period('escalera', r.league_id, null, 'ladder:' || r.id::text || ':' || v_month_key,
                                      jsonb_build_object('month', v_month_key, 'rungs', r.rungs),
                                      ((date_trunc('month', v_today)::date + 2) + time '00:05') at time zone private.badge_tz()) then
        v_ladders := v_ladders + 1;
      end if;
    end loop;
  end if;

  -- El mes anterior (el día 3; hasta el 10 se recupera lo que no corrió): por liga y por cuenta con actividad ese mes.
  if extract(day from v_today) between 3 and 10 then
    for r in
      select distinct a.league_id, a.user_id
        from private.badge_activity(null, v_prev_month, (v_prev_month + interval '1 month' - interval '1 day')::date) a
    loop
      if exists (select 1 from public.leagues l where l.id = r.league_id and l.kind = 'liga')
         and private.badge_enqueue_period('mes', r.league_id, null, v_month_key) then
        v_months := v_months + 1;
      end if;
      if r.user_id is not null and private.badge_enqueue_period('mes', null, r.user_id, v_month_key) then
        v_months := v_months + 1;
      end if;
    end loop;
  end if;

  -- El año anterior (el 7 de enero; hasta el 31 se recupera lo que no corrió).
  if v_today between make_date(v_year + 1, 1, 7) and make_date(v_year + 1, 1, 31) then
    for r in
      select distinct a.league_id, a.user_id from private.badge_activity(null, make_date(v_year, 1, 1), make_date(v_year, 12, 31)) a
    loop
      if exists (select 1 from public.leagues l where l.id = r.league_id and l.kind = 'liga')
         and private.badge_enqueue_period('anio', r.league_id, null, v_year::text) then
        v_years := v_years + 1;
      end if;
      if r.user_id is not null and private.badge_enqueue_period('anio', null, r.user_id, v_year::text) then
        v_years := v_years + 1;
      end if;
    end loop;
  end if;

  -- Cuentas con algo nuevo de hace 2 días (actividad, felicitaciones, servicio), dueños de esas ligas y aniversarios.
  for r in
    with w as (
      select v_day::timestamp at time zone private.badge_tz() as t0, (v_day + 1)::timestamp at time zone private.badge_tz() as t1
    )
    select distinct z.u from (
      select a.user_id as u from private.badge_activity(null, v_day, v_day) a
      union
      select l.owner_id from private.badge_activity(null, v_day, v_day) a join public.leagues l on l.id = a.league_id
      union
      select x.user_id from public.reactions x, w where x.created_at >= w.t0 and x.created_at < w.t1
      union
      select g.user_id from public.game_likes g, w where g.created_at >= w.t0 and g.created_at < w.t1
      union
      select m.confirmed_by from public.matches m, w where m.confirmed_at >= w.t0 and m.confirmed_at < w.t1
      union
      select m.proposed_by from public.matches m, w where m.proposed_at >= w.t0 and m.proposed_at < w.t1
      union
      select o.user_id from public.match_officials o join public.matches m on m.id = o.match_id, w
       where coalesce(m.scheduled_at, m.proposed_at, m.created_at) >= w.t0 and coalesce(m.scheduled_at, m.proposed_at, m.created_at) < w.t1
      union
      select s.reviewed_by from public.submissions s, w where s.reviewed_at >= w.t0 and s.reviewed_at < w.t1
      union
      select se.recorded_by from public.swim_entries se, w where se.result_at >= w.t0 and se.result_at < w.t1
      union
      select gr.closed_by from public.golf_rounds gr, w where gr.closed_at >= w.t0 and gr.closed_at < w.t1
      union
      select p.id from public.profiles p
       where p.created_at < p_now - interval '300 days'
         and to_char(p.created_at at time zone private.badge_tz(), 'MM-DD') = to_char(v_today, 'MM-DD')
    ) z
    join public.profiles p on p.id = z.u and p.blocked_at is null
  loop
    perform private.badge_enqueue('cuenta', null, r.u, to_char(v_today, 'YYYY-MM-DD'));
    v_accounts := v_accounts + 1;
  end loop;

  v_stats := private.badge_stats_refresh(p_now);
  v_cleanup := private.badge_cleanup(p_now);

  if exists (select 1 from private.badge_queue q where q.kind <> 'aviso' and q.run_after <= p_now and q.attempts < 5) then
    perform private.kick_badges();
  end if;
  return jsonb_build_object('firm', v_firm, 'events', v_events, 'nights', v_nights, 'ladders', v_ladders,
                            'months', v_months, 'years', v_years, 'accounts', v_accounts, 'stats', v_stats,
                            'cleanup', v_cleanup);
end $$;

-- Llama a la Edge Function `insignias` con pg_net (solo Supabase; no espera la respuesta), como kick_send_push:
-- 'project_url' y 'cron_secret' de Vault. Sin pg_net o sin secretos (PGlite) no hace nada y devuelve false.
create function private.kick_badges(p_body jsonb default '{}') returns boolean
language plpgsql set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null
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
  -- La función corta a los 100 s.
  execute 'select net.http_post(url => $1, body => $2, headers => $3, timeout_milliseconds => $4)'
    using rtrim(v_url, '/') || '/functions/v1/insignias', coalesce(p_body, '{}'::jsonb),
          jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret), 120000;
  return true;
exception when others then
  raise warning 'kick_badges: %', sqlerrm;
  return false;
end $$;

-- La tarea de cada 10 minutos (…0890): manda los avisos que tocan y, si hay trabajos vencidos, llama al motor.
create function private.cron_badges(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_notices integer := private.badge_send_notices(p_now);
  v_due integer := (select count(*)::integer from private.badge_queue q
                     where q.kind <> 'aviso' and q.run_after <= p_now and q.attempts < 5
                       and (q.locked_at is null or q.locked_at < p_now - interval '10 minutes'));
  v_kicked boolean := false;
begin
  if v_due > 0 then
    v_kicked := private.kick_badges();
  end if;
  return jsonb_build_object('notices', v_notices, 'due', v_due, 'kicked', v_kicked);
end $$;

-- =====================================================================
-- RPC de la Edge Function `insignias` (solo service_role)
-- =====================================================================

create function public.badge_claim(p_limit integer default 25) returns jsonb
language sql security definer set search_path = '' as $$
  select private.badge_claim(p_limit, now())
$$;

-- Pedir la foto es probar el trabajo: aquí se cuenta el intento (badge_claim no lo cuenta).
create function public.badge_snapshot(p_job bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update private.badge_queue q set attempts = q.attempts + 1 where q.id = p_job;
  return private.badge_snapshot(p_job, now());
end $$;

create function public.badge_apply(p_job bigint, p_decisions jsonb) returns jsonb
language sql security definer set search_path = '' as $$
  select private.badge_apply(p_job, p_decisions, now())
$$;

create function public.badge_fail(p_job bigint, p_error text, p_charge boolean default false) returns void
language sql security definer set search_path = '' as $$
  select private.badge_fail(p_job, p_error, now(), p_charge)
$$;

create function public.badge_release(p_job bigint) returns void
language sql security definer set search_path = '' as $$
  select private.badge_release(p_job)
$$;

-- Al terminar una corrida: manda los avisos y, si queda cola vencida, se vuelve a llamar. {remaining, chained, notices}.
create function public.badge_finish() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_notices integer := private.badge_send_notices(now());
  v_remaining integer := (select count(*)::integer from private.badge_queue q
                           where q.kind <> 'aviso' and q.run_after <= now() and q.attempts < 5
                             and (q.locked_at is null or q.locked_at < now() - interval '10 minutes'));
  v_chained boolean := false;
begin
  if v_remaining > 0 then
    v_chained := private.kick_badges();
  end if;
  return jsonb_build_object('remaining', v_remaining, 'chained', v_chained, 'notices', v_notices);
end $$;

-- =====================================================================
-- RPC de la app
-- =====================================================================

-- Avisos de insignias de la cuenta (aviso de desbloqueo, §6.4, y la página de Avisos) y hazañas por confirmar
-- (§6.5): {awards: [insignia sin ver], unseen, reviews: [aval]}.
-- - awards: las suyas (de la cuenta o de sus jugadores) provisionales o firmes que no vio, más nuevas primero, hasta
--   p_limit (1–50): {id, key, sport, level, periodKey, scope, status, awardedAt, firmAt, leagueId, leagueName,
--   playerId, context, hidden, history} (hidden = privada por defecto: «Solo tú la ves»; history = del historial).
--   unseen = cuántas hay en total.
-- - reviews: en revisión que puede confirmar (dueño o admin elegible, private.badge_can_review) y, al superadmin,
--   además las que llevan 14+ días o no tienen quién las confirme: {id, key, sport, level, periodKey, leagueId,
--   leagueName, playerId, playerName, refs, context, awardedAt, overdue}.
create function public.badge_notices(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_limit integer := private.clamp_int(p_limit, 1, 50, 50);
  v_super boolean := private.is_super();
begin
  return jsonb_build_object(
    'awards', coalesce((
      select jsonb_agg(z.item order by z.at desc, z.id desc)
        from (
          select a.awarded_at as at, a.id, jsonb_build_object(
                   'id', a.id, 'key', a.badge_key, 'sport', a.sport, 'level', a.level, 'periodKey', a.period_key,
                   'scope', case when a.user_id is not null then 'cuenta' else 'liga' end,
                   'status', a.status, 'awardedAt', private.iso(a.awarded_at), 'firmAt', private.iso(a.firm_at),
                   'leagueId', a.league_id, 'leagueName', l.name, 'playerId', a.player_id, 'context', a.context,
                   'hidden', a.hidden, 'history', a.context ? 'historial') as item
            from public.badge_awards a
            left join public.players p on p.id = a.player_id
            left join public.leagues l on l.id = a.league_id
           where (a.user_id = v_me or p.user_id = v_me) and a.status in ('provisional', 'firme') and a.seen_at is null
           order by a.awarded_at desc, a.id desc
           limit v_limit) z), '[]'::jsonb),
    'unseen', (select count(*)::integer from public.badge_awards a left join public.players p on p.id = a.player_id
                where (a.user_id = v_me or p.user_id = v_me) and a.status in ('provisional', 'firme') and a.seen_at is null),
    'reviews', coalesce((
      select jsonb_agg(z.item order by z.at, z.id)
        from (
          select a.awarded_at as at, a.id, jsonb_build_object(
                   'id', a.id, 'key', a.badge_key, 'sport', a.sport, 'level', a.level, 'periodKey', a.period_key,
                   'leagueId', a.league_id, 'leagueName', l.name, 'playerId', a.player_id, 'playerName', p.name,
                   'refs', to_jsonb(a.refs), 'context', a.context, 'awardedAt', private.iso(a.awarded_at),
                   'overdue', a.awarded_at < now() - interval '14 days') as item
            from public.badge_awards a
            join public.leagues l on l.id = a.league_id
            join public.players p on p.id = a.player_id
           where a.status = 'en_revision'
             and ((a.league_id in (select m.league_id from public.league_members m where m.user_id = v_me and m.role in ('owner', 'admin'))
                   and private.badge_can_review(a.id, v_me))
                  or (v_super and (a.awarded_at < now() - interval '14 days'
                                   or not exists (select 1 from public.league_members m join public.profiles pr on pr.id = m.user_id
                                                   where m.league_id = a.league_id and m.role in ('owner', 'admin')
                                                     and pr.blocked_at is null and private.badge_can_review(a.id, m.user_id)))))
           order by a.awarded_at, a.id
           limit v_limit) z), '[]'::jsonb));
end $$;

-- Superadmin: primera corrida del historial (§3.5). Encola un trabajo 'historial' por liga (todas, o p_league) y
-- uno por cada cuenta con jugadores en esas ligas (lo de cuenta y comunidad: kilometraje, constancia, tu año…);
-- en seco (por defecto) no escribe insignias: badge_dry_runs queda con cuántas cuentas tendrían cada key, deporte y
-- nivel (run_id) sobre la base de activos. Auditoría 'badges_backfill'. 'no_existe'. {runId, dryRun, jobs,
-- leagues, accounts}.
create function public.badges_backfill(p_league uuid default null, p_dry_run boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_super();
  v_run uuid := gen_random_uuid();
  v_dry boolean := coalesce(p_dry_run, true);
  v_payload jsonb := jsonb_build_object('dry_run', v_dry, 'run_id', v_run);
  n_leagues integer := 0;
  n_accounts integer := 0;
  r record;
begin
  if p_league is not null and not exists (select 1 from public.leagues l where l.id = p_league) then
    perform private.fail('no_existe');
  end if;
  -- En seco, otra ref ('…:seco'): una corrida en seco nunca se junta con una de verdad que sigue en la cola (el
  -- payload nuevo mandaría y la de verdad no escribiría nada).
  for r in select l.id from public.leagues l where p_league is null or l.id = p_league order by l.created_at, l.id loop
    perform private.badge_enqueue('historial', r.id, null, 'league:' || r.id::text || case when v_dry then ':seco' else '' end, v_payload);
    n_leagues := n_leagues + 1;
  end loop;
  for r in select distinct p.user_id as id from public.players p join public.profiles pr on pr.id = p.user_id
            where p.user_id is not null and (p_league is null or p.league_id = p_league) order by 1 loop
    perform private.badge_enqueue('historial', null, r.id, 'user:' || r.id::text || case when v_dry then ':seco' else '' end, v_payload);
    n_accounts := n_accounts + 1;
  end loop;
  perform private.audit('badges_backfill', case when p_league is null then 'app' else 'league' end,
                        coalesce(p_league::text, 'all'),
                        jsonb_build_object('runId', v_run, 'dryRun', v_dry, 'jobs', n_leagues + n_accounts, 'by', v_uid));
  perform private.kick_badges();
  return jsonb_build_object('runId', v_run, 'dryRun', v_dry, 'jobs', n_leagues + n_accounts, 'leagues', n_leagues,
                            'accounts', n_accounts);
end $$;

-- Superadmin: cómo va el motor (consola › Insignias › Motor, §6.6).
-- {queue: {pending, due, locked, dead, notices, oldestDue}, byKind: [{kind, pending, dead}],
--  dead: [{id, kind, leagueId, leagueName, userId, userName, ref, attempts, lastError, runAfter, createdAt}] (5+
--  intentos: el motor ya no los toma; los 50 más viejos),
--  backfill: [{runId, dryRun, pending, dead}] (corridas del historial que siguen en la cola),
--  runs: [{runId, at, badges, holders}] (las 10 últimas corridas en seco),
--  dryRun: {runId, rows: [{key, sport, level, holders, base, pct}]} | null (la de p_run o la última en seco; pct con
--  un decimal, null sin base: la app la compara con la rareza objetivo del catálogo),
--  periods: [{kind, scope, periodKey, doneAt, awarded}] (los 20 últimos periodos que corrieron)}.
create function public.admin_badges_engine(p_run uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_run uuid;
begin
  perform private.require_super();
  v_run := coalesce(p_run, (select r.run_id from private.badge_dry_runs r order by r.created_at desc, r.run_id limit 1));
  return jsonb_build_object(
    'queue', (select jsonb_build_object(
                'pending', count(*) filter (where q.kind <> 'aviso' and q.attempts < 5),
                'due', count(*) filter (where q.kind <> 'aviso' and q.attempts < 5 and q.run_after <= now()),
                'locked', count(*) filter (where q.locked_at >= now() - interval '10 minutes' and q.attempts < 5),
                'dead', count(*) filter (where q.attempts >= 5),
                'notices', count(*) filter (where q.kind = 'aviso'),
                'oldestDue', private.iso(min(q.run_after) filter (where q.kind <> 'aviso' and q.attempts < 5 and q.run_after <= now())))
                from private.badge_queue q),
    'byKind', coalesce((
      select jsonb_agg(jsonb_build_object('kind', z.kind, 'pending', z.pending, 'dead', z.dead) order by z.kind)
        from (select q.kind, count(*) filter (where q.attempts < 5) as pending, count(*) filter (where q.attempts >= 5) as dead
                from private.badge_queue q where q.kind <> 'aviso' group by q.kind) z), '[]'::jsonb),
    'dead', coalesce((
      select jsonb_agg(z.item order by z.created_at, z.id)
        from (select q.id, q.created_at, jsonb_build_object(
                       'id', q.id, 'kind', q.kind, 'leagueId', q.league_id, 'leagueName', l.name, 'userId', q.user_id,
                       'userName', pr.name, 'ref', q.ref, 'attempts', q.attempts, 'lastError', q.last_error,
                       'runAfter', private.iso(q.run_after), 'createdAt', private.iso(q.created_at)) as item
                from private.badge_queue q
                left join public.leagues l on l.id = q.league_id
                left join public.profiles pr on pr.id = q.user_id
               where q.attempts >= 5
               order by q.created_at, q.id
               limit 50) z), '[]'::jsonb),
    'backfill', coalesce((
      select jsonb_agg(jsonb_build_object('runId', z.run_id, 'dryRun', z.dry, 'pending', z.pending, 'dead', z.dead) order by z.first_at desc)
        from (select q.payload ->> 'run_id' as run_id, bool_or(coalesce((q.payload ->> 'dry_run')::boolean, false)) as dry,
                     count(*) filter (where q.attempts < 5) as pending, count(*) filter (where q.attempts >= 5) as dead,
                     min(q.created_at) as first_at
                from private.badge_queue q
               where q.kind = 'historial' and q.payload ? 'run_id'
               group by 1) z), '[]'::jsonb),
    'runs', coalesce((
      select jsonb_agg(jsonb_build_object('runId', z.run_id, 'at', private.iso(z.at), 'badges', z.badges, 'holders', z.holders) order by z.at desc)
        from (select r.run_id, min(r.created_at) as at, count(*) as badges, sum(r.holders) as holders
                from private.badge_dry_runs r group by r.run_id order by min(r.created_at) desc limit 10) z), '[]'::jsonb),
    'dryRun', case when v_run is not null then jsonb_build_object('runId', v_run, 'rows', coalesce((
      select jsonb_agg(jsonb_build_object('key', r.badge_key, 'sport', r.sport, 'level', r.level, 'holders', r.holders, 'base', r.base,
                                          'pct', case when r.base > 0 then round(100.0 * r.holders / r.base, 1)::double precision end)
                       order by r.badge_key, r.sport, r.level)
        from private.badge_dry_runs r where r.run_id = v_run), '[]'::jsonb)) end,
    'periods', coalesce((
      select jsonb_agg(jsonb_build_object('kind', z.kind, 'scope', z.scope, 'periodKey', z.period_key, 'doneAt', private.iso(z.done_at),
                                          'awarded', z.awarded) order by z.done_at desc)
        from (select * from private.badge_runs r order by r.done_at desc limit 20) z), '[]'::jsonb));
end $$;

-- Superadmin: trabajos que el motor ya no toma (5+ intentos). 'retry' los vuelve a la cola (intentos en 0, sin
-- error, ya; si entró otro igual mientras tanto, se queda ese) y llama al motor; 'drop' los borra. Hasta 200 ids;
-- solo toca los de 5+ intentos. Auditoría 'badge_jobs' {action, ids}. Devuelve cuántos tocó.
create function public.admin_badge_jobs(p_ids bigint[], p_action text default 'retry') returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_ids bigint[];
  v_zero constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  perform private.require_super();
  if p_ids is null or coalesce(array_ndims(p_ids), 1) <> 1 or cardinality(p_ids) > 200 or p_action is null or p_action not in ('retry', 'drop') then
    perform private.fail('invalido');
  end if;
  v_ids := array(select q.id from private.badge_queue q where q.id = any (p_ids) and q.attempts >= 5 order by q.id);
  if cardinality(v_ids) = 0 then
    return 0;
  end if;
  if p_action = 'drop' then
    delete from private.badge_queue q where q.id = any (v_ids);
  else
    delete from private.badge_queue d
     where d.id = any (v_ids)
       and exists (select 1 from private.badge_queue o
                    where o.id <> d.id and o.locked_at is null and o.kind = d.kind and o.ref = d.ref
                      and coalesce(o.league_id, v_zero) = coalesce(d.league_id, v_zero)
                      and coalesce(o.user_id, v_zero) = coalesce(d.user_id, v_zero));
    update private.badge_queue q set attempts = 0, locked_at = null, last_error = null, run_after = now()
     where q.id = any (v_ids);
    perform private.kick_badges();
  end if;
  perform private.audit('badge_jobs', 'app', null, jsonb_build_object('action', p_action, 'ids', to_jsonb(v_ids)));
  return cardinality(v_ids);
end $$;

-- =====================================================================
-- Tiempo real: la app vuelve a leer (src/lib/data/topics.ts → src/lib/data/badges.ts)
-- =====================================================================

-- Por sentencia (una corrida del motor da muchas de una vez): un aviso por cuenta dueña ('user:<id>', cualquier
-- cambio: nueva, firme, vista, oculta, retirada) y uno por liga ('league:<id>', solo lo que cambia lo que se ve en la
-- liga: nuevas provisionales o firmes y cambios de estado, de oculta o de nivel; que el dueño la vea no avisa). El
-- payload solo lleva los ids y kind 'app' (las del creador, …0820, avisan 'diseno' o 'liga'): las pantallas vuelven a
-- leer con sus permisos.
create function private.emit_badges() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in select coalesce(n.user_id, p.user_id) as uid, jsonb_agg(n.id) as ids
             from new_rows n left join public.players p on p.id = n.player_id
            where coalesce(n.user_id, p.user_id) is not null
            group by 1 loop
    perform private.emit('user:' || r.uid::text, 'badges', jsonb_build_object('op', lower(tg_op), 'ids', r.ids, 'kind', 'app'));
  end loop;
  if tg_op = 'INSERT' then
    for r in select n.league_id, jsonb_agg(n.id) as ids from new_rows n
              where n.league_id is not null and n.status in ('provisional', 'firme') and not n.hidden
              group by n.league_id loop
      perform private.emit('league:' || r.league_id::text, 'badges', jsonb_build_object('op', 'insert', 'ids', r.ids, 'kind', 'app'));
    end loop;
  else
    for r in select n.league_id, jsonb_agg(n.id) as ids
               from new_rows n join old_rows o on o.id = n.id
              where n.league_id is not null
                and (n.status is distinct from o.status or n.hidden is distinct from o.hidden or n.level is distinct from o.level)
              group by n.league_id loop
      perform private.emit('league:' || r.league_id::text, 'badges', jsonb_build_object('op', 'update', 'ids', r.ids, 'kind', 'app'));
    end loop;
  end if;
  return null;
end $$;

create trigger badge_awards_emit_insert after insert on public.badge_awards referencing new table as new_rows
  for each statement execute function private.emit_badges();
create trigger badge_awards_emit_update after update on public.badge_awards referencing old table as old_rows new table as new_rows
  for each statement execute function private.emit_badges();

-- =====================================================================
-- Permisos: la app solo badge_notices, badges_backfill y las dos de la consola; la Edge Function solo sus seis; lo
-- demás, nadie
-- =====================================================================
do $$
declare
  f record;
  v_app constant text[] := array['badge_notices', 'badges_backfill', 'admin_badges_engine', 'admin_badge_jobs'];
  v_service constant text[] := array['badge_claim', 'badge_snapshot', 'badge_apply', 'badge_fail', 'badge_release', 'badge_finish'];
  v_private constant text[] := array[
    'badge_tz', 'badge_uuids', 'badge_match_day', 'badge_quiet_until', 'badge_mark_ok', 'badge_counted', 'badge_match_players',
    'badge_event_players', 'badge_people', 'badge_card_complete', 'badge_league_gone', 'badge_merge_payload',
    'badge_period_kind', 'badge_period_done', 'badge_self_link', 'badge_verified_only', 'badge_job_people',
    'badge_enqueue', 'badges_on_entry', 'badges_on_match', 'badges_on_match_delete', 'badges_on_match_player',
    'badges_on_golf_card', 'badges_on_golf_round', 'badges_on_swim_meet', 'badges_on_swim_entry', 'badges_on_ladder',
    'badges_on_player_link', 'badges_on_box_month', 'badge_signal', 'badge_activity', 'badge_activity_json',
    'badge_league_months', 'badge_family_rows', 'badge_season_rows', 'badge_cheers', 'badge_service', 'badge_merge_rows',
    'badge_snapshot', 'badge_claim', 'badge_fail', 'badge_release', 'badge_apply', 'badge_apply_decisions', 'badge_push_label',
    'badge_push_reviewers', 'badge_send_notices', 'badge_stats_refresh', 'badge_cleanup', 'badge_enqueue_period',
    'badges_daily', 'kick_badges', 'cron_badges', 'emit_badges'];
begin
  for f in select p.oid::regprocedure as sig, n.nspname, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and p.proname = any (v_app || v_service))
               or (n.nspname = 'private' and p.proname = any (v_private)) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' and f.proname = any (v_app) then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.nspname = 'public' then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;
