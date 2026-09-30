-- MatchMate · Ping pong (tenis de mesa): el deporte nuevo de la familia de raqueta (diseño completo en docs/ping-pong.md).
--
-- 1. public.sport_status: 'table_tennis' (familia racket, abierto para todos, orden 10). Con esa fila ya funcionan sin
--    más cambios: leagues.sport (FK), check_sport y create_league, create_tournament, league_family y los partidos
--    (check_score, check_winner, finish_match, confirmar), match_reminders, public_profile, profile_stats,
--    public_leagues_feed, public_agenda, admin_overview y admin_system.
-- 2. Reglas de la ITTF: juegos a 11 ganando por 2, al mejor de 3, 5 o 7 juegos. Los partidos van en formato '' o
--    'sets' (el que ponen save_box_month y create_challenge); el marcador es el de los deportes a juegos:
--    `sides` = juegos ganados y `totals` {sets, games: juegos ganados; points: puntos}. private.raq_score_ok topa
--    los juegos ganados en 3 y su firma no tiene el deporte: el ping pong usa private.tt_score_ok (nueva, hasta 4
--    para el mejor de 7) y, con ganador, private.tt_result_ok (nueva): un final posible del mejor de 3, 5 o 7 que
--    cuadra con el ganador y con los totales.
-- 3. Eventos: liga, torneo (grupos + cuadro por categorías), cajas (liga por cajas mensual) y escalera. Sin noches de
--    puntos (americano, mexicano, noche): private.night_league, private.event_reminders, badges_daily y el premio
--    racket_night no cambian.
-- 4. Nivel manual en players.attrs: `tt` de 1 a 10 (escala del club, con decimales; null = sin nivel).
-- 5. Individual salvo leagues.rules.match.doubles = true: private.signup_doubles y private.prize_racket_doubles no
--    cambian (sin esa marca solo el pickleball cae en dobles).
-- 6. Insignias: 'table_tennis' en los check de deporte de badge_awards, badge_progress y badge_stats (checks de
--    columna sin nombre: se borran por el nombre que les pone Postgres, sin `if exists`, para que un nombre distinto
--    haga fallar la migración en vez de dejar el check viejo) y el ícono curado 'ping-pong' del editor (53 íconos).
-- 7. Cambian (misma firma, cuerpo copiado de su última versión con el cambio):
--    - private.raq_sport (…0700 raqueta): incluye el ping pong. Con eso le sirven save_box_month, la escalera
--      (ladder_guard, ladder_event, create_challenge, join_ladder) y private.signup_kind ('tourney': inscripciones y
--      la agenda pública).
--    - private.raq_check_event, private.raq_check_match y private.raq_check_player (…0700 raqueta): tipos de evento,
--      formato y marcador de los partidos, y el nivel `tt`. Los triggers siguen colgados de ellas (no se recrean).
--    - private.prize_comp (…1200 premios_torneo): el torneo de ping pong es 'racket_tourney'.
--    - private.badge_activity y private.badge_apply_decisions (…1110 insignias_motor): la actividad del ping pong y
--      su deporte en las decisiones del motor.
--    - private.badge_icon_ok (…1120 insignias_creador): 'ping-pong'.
--    Una migración posterior que redefina alguna tiene que copiar esta.
-- 8. No cambian (revisado): night_league, event_reminders, padel_check_*, check_event del boliche, create_event,
--    create_tournament, social_items, push_*, la escalera y su cron, badge_snapshot, badge_family_rows (van por
--    familia), badges_daily (solo noches) y los playoffs (solo equipos).

-- =====================================================================
-- 1. El deporte
-- =====================================================================

insert into public.sport_status (id, family, status, sort_order) values
  ('table_tennis', 'racket', 'open', 10);

-- =====================================================================
-- 2. Raqueta: deporte, marcador, eventos, partidos y nivel
-- =====================================================================

-- Deporte de raqueta de la liga ('padel' | 'tennis' | 'pickleball' | 'table_tennis'), o null.
create or replace function private.raq_sport(p_league uuid) returns text
language sql stable security definer set search_path = '' as $$
  select l.sport from public.leagues l where l.id = p_league and l.sport in ('padel', 'tennis', 'pickleball', 'table_tennis')
$$;

-- Marcador de un partido de ping pong: `sides` = juegos ganados (0–4, hasta el mejor de 7); `totals` (si viene) con
-- sets y juegos 0–4 (los dos son juegos ganados) y puntos 0–9999 por lado.
create function private.tt_score_ok(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  k text;
  v_lim integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return true;
  end if;
  if jsonb_typeof(p -> 'sides') = 'array' and exists (
       select 1 from jsonb_array_elements(p -> 'sides') x where not private.raq_num_between(x, 0, 4)) then
    return false;
  end if;
  if jsonb_typeof(p -> 'totals') = 'object' then
    for k, v_lim in select * from (values ('sets', 4), ('games', 4), ('points', 9999)) as t (k, lim) loop
      if (p -> 'totals') ? k and not (
           jsonb_typeof(p -> 'totals' -> k) = 'array' and jsonb_array_length(p -> 'totals' -> k) = 2
           and not exists (select 1 from jsonb_array_elements(p -> 'totals' -> k) x where not private.raq_num_between(x, 0, v_lim))) then
        return false;
      end if;
    end loop;
  end if;
  return true;
end $$;

-- Resultado de un partido de ping pong con ganador (terminado, confirmado, en disputa o W.O.). Con `sides` (juegos
-- ganados), tiene que ser un final posible del mejor de 3, 5 o 7: el ganador llegó a 2, 3 o 4 juegos y tiene más que
-- el otro; y totals.sets y totals.games, si vienen, son los mismos juegos. Un retiro y un W.O. llegan completados a
-- favor del ganador (3-0 al mejor de 5), así que también cumplen. Sin `sides` (el W.O. de la escalera solo trae el
-- texto) no hay con qué comparar. La forma la revisa antes private.tt_score_ok.
create function private.tt_result_ok(p jsonb, p_winner smallint) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_win numeric;
  v_lose numeric;
  k text;
begin
  if p_winner is null or p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'sides') <> 'array' then
    return true;
  end if;
  if p_winner not in (1, 2) or jsonb_array_length(p -> 'sides') <> 2
     or jsonb_typeof(p -> 'sides' -> 0) <> 'number' or jsonb_typeof(p -> 'sides' -> 1) <> 'number' then
    return false;
  end if;
  v_win := (p -> 'sides' ->> (p_winner - 1))::numeric;
  v_lose := (p -> 'sides' ->> (2 - p_winner))::numeric;
  if not (v_win between 2 and 4 and v_lose >= 0 and v_lose < v_win) then
    return false;
  end if;
  foreach k in array array['sets', 'games'] loop
    if jsonb_typeof(p -> 'totals') = 'object' and (p -> 'totals') ? k and (p -> 'totals' -> k) <> (p -> 'sides') then
      return false;
    end if;
  end loop;
  return true;
end $$;

-- Eventos: tipos del deporte, configuración chica (< 32 KB) y player_count (jugadores del round robin, parejas o
-- jugadores de la liga y del torneo, o los de las cajas del último mes). Ping pong: liga, torneo, cajas o escalera.
create or replace function private.raq_check_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sport text := (select l.sport from public.leagues l where l.id = new.league_id);
  v_config jsonb := coalesce(new.config, '{}'::jsonb);
  v_count integer;
  v_last jsonb;
begin
  -- El pádel pasa por aquí solo con la liga por cajas y la escalera (lo demás lo revisa padel_check_event).
  if v_sport is null or (v_sport not in ('tennis', 'pickleball', 'table_tennis') and not (v_sport = 'padel' and new.type in ('cajas', 'escalera'))) then
    return new;
  end if;
  if v_sport = 'tennis' and new.type not in ('liga', 'torneo', 'cajas', 'escalera') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Tipo de evento de tenis: liga, torneo, cajas o escalera.';
  end if;
  if v_sport = 'pickleball' and new.type not in ('americano', 'mexicano', 'noche', 'liga', 'torneo', 'cajas', 'escalera') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Tipo de evento de pickleball: round robin, liga, torneo, cajas o escalera.';
  end if;
  -- Ping pong: sin noches de puntos (las parejas que rotan no son de ping pong).
  if v_sport = 'table_tennis' and new.type not in ('liga', 'torneo', 'cajas', 'escalera') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Tipo de evento de ping pong: liga, torneo, cajas o escalera.';
  end if;
  if jsonb_typeof(v_config) <> 'object' or pg_column_size(v_config) >= 32768 then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Configuración del evento no válida.';
  end if;
  if new.type in ('americano', 'mexicano') and v_config ? 'format' and v_config ->> 'format' <> new.type then
    raise exception 'invalido' using errcode = 'P0001', detail = 'El formato de la noche no coincide con el tipo.';
  end if;
  if v_config ? 'players' and (jsonb_typeof(v_config -> 'players') <> 'array' or jsonb_array_length(v_config -> 'players') > 64) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Jugadores no válidos.';
  end if;
  if v_config ? 'game' and jsonb_typeof(v_config -> 'game') <> 'null' and not private.raq_game_ok(v_config -> 'game') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'El juego del round robin va de 5 a 25 puntos, ganando por 1 o por 2.';
  end if;
  if v_config ? 'months' and jsonb_typeof(v_config -> 'months') <> 'array' then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Meses de la liga por cajas no válidos.';
  end if;
  if new.type = 'cajas' and jsonb_typeof(v_config -> 'months') = 'array' and jsonb_array_length(v_config -> 'months') > 0 then
    v_last := v_config -> 'months' -> (jsonb_array_length(v_config -> 'months') - 1);
    if jsonb_typeof(v_last -> 'boxes') = 'array' then
      v_count := (select coalesce(sum(jsonb_array_length(b)), 0)::integer
                    from jsonb_array_elements(v_last -> 'boxes') b where jsonb_typeof(b) = 'array');
    end if;
  elsif new.type <> 'escalera' then
    v_count := case
      when jsonb_typeof(v_config -> 'players') = 'array' then jsonb_array_length(v_config -> 'players')
      when jsonb_typeof(v_config -> 'pairs') = 'array' then jsonb_array_length(v_config -> 'pairs')
      when jsonb_typeof(v_config -> 'categories') = 'array' then
        (select coalesce(sum(jsonb_array_length(c -> 'pairs')), 0)::integer
           from jsonb_array_elements(v_config -> 'categories') c where jsonb_typeof(c -> 'pairs') = 'array')
    end;
  end if;
  if v_count is not null then
    new.player_count := v_count;
  end if;
  return new;
end $$;

-- Partidos de tenis ('' o 'sets'), de pickleball (además 'americano' / 'mexicano' del round robin) y de ping pong
-- ('' o 'sets', con su marcador hasta el mejor de 7), con marcador de su forma.
create or replace function private.raq_check_match() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sport text := (select l.sport from public.leagues l where l.id = new.league_id);
begin
  if v_sport is null or v_sport not in ('tennis', 'pickleball', 'table_tennis') then
    return new;
  end if;
  if v_sport = 'tennis' and new.format not in ('', 'sets') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Formato de partido de tenis: sets.';
  end if;
  if v_sport = 'pickleball' and new.format not in ('', 'sets', 'americano', 'mexicano') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Formato de partido de pickleball: juegos o round robin.';
  end if;
  -- 'sets' también: lo pone el servidor en save_box_month y en create_challenge.
  if v_sport = 'table_tennis' and new.format not in ('', 'sets') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Formato de partido de ping pong: juegos.';
  end if;
  if (v_sport = 'table_tennis' and not private.tt_score_ok(new.score))
     or (v_sport <> 'table_tennis' and not private.raq_score_ok(new.format, new.score)) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Marcador no válido.';
  end if;
  -- Ping pong con ganador: un final del mejor de 3, 5 o 7 que cuadra con el ganador y los totales. finish_match,
  -- admin_correct_result, resolve_dispute y set_walkover escriben el marcador junto con el ganador (el trigger salta).
  if v_sport = 'table_tennis' and new.winner_side is not null and new.status in ('finished', 'confirmed', 'disputed', 'walkover') then
    if not private.tt_result_ok(new.score, new.winner_side) then
      raise exception 'invalido' using errcode = 'P0001', detail = 'Ese marcador no termina el partido o no cuadra con el ganador.';
    end if;
  end if;
  return new;
end $$;

-- Nivel manual: tenis `ntrp` de 1.0 a 7.0; pickleball `dupr` de 2.0 a 8.0; ping pong `tt` de 1 a 10 (null = sin
-- nivel).
create or replace function private.raq_check_player() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sport text;
  v_attrs jsonb := coalesce(new.attrs, '{}'::jsonb);
begin
  if jsonb_typeof(v_attrs) <> 'object' or not (v_attrs ? 'ntrp' or v_attrs ? 'dupr' or v_attrs ? 'tt') then
    return new;
  end if;
  v_sport := (select l.sport from public.leagues l where l.id = new.league_id);
  if v_sport = 'tennis' and v_attrs ? 'ntrp' and jsonb_typeof(v_attrs -> 'ntrp') <> 'null'
     and not private.raq_num_between(v_attrs -> 'ntrp', 1, 7) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'El NTRP va de 1.0 a 7.0.';
  end if;
  if v_sport = 'pickleball' and v_attrs ? 'dupr' and jsonb_typeof(v_attrs -> 'dupr') <> 'null'
     and not private.raq_num_between(v_attrs -> 'dupr', 2, 8) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'El DUPR va de 2.0 a 8.0.';
  end if;
  if v_sport = 'table_tennis' and v_attrs ? 'tt' and jsonb_typeof(v_attrs -> 'tt') <> 'null'
     and not private.raq_num_between(v_attrs -> 'tt', 1, 10) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'El nivel va de 1 a 10.';
  end if;
  return new;
end $$;

-- =====================================================================
-- 3. Premios del torneo
-- =====================================================================

-- Qué competencia es (la tabla de §5 de docs/premios-torneo.md), o null si no admite premios:
-- 'bowling'        torneo del boliche (type 'torneo', en una liga o suelto);
-- 'racket_tourney' torneo por categorías de raqueta (type 'torneo'; también el de ping pong);
-- 'racket_night'   noche de americano o mexicano del pádel y social del pickleball (americano, mexicano, noche);
-- 'team_ko'        el evento de un torneo relámpago (liga kind 'torneo' de baloncesto, fútbol o sala): solo el del
--                  torneo (el primero de tipo 'torneo' de la liga, el que crea create_tournament), porque el podio sale
--                  de los partidos de toda la liga y otro evento premiaría al mismo campeón otra vez;
-- 'golf'           ronda suelta (sin torneo de varias rondas) o torneo de golf de varias rondas (scope golf_torneo);
-- 'swim'           encuentro o torneo de natación (no el control de marcas);
-- 'playoff'        un playoff (scope playoff).
create or replace function private.prize_comp(p_league uuid, p_scope text, p_ref uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case p_scope
    when 'evento' then (
      select case
               when l.sport = 'bowling' then case when e.type = 'torneo' then 'bowling' end
               when l.sport in ('padel', 'tennis', 'pickleball', 'table_tennis') then
                 case when e.type = 'torneo' then 'racket_tourney'
                      when e.type in ('americano', 'mexicano', 'noche') and l.sport in ('padel', 'pickleball') then 'racket_night' end
               when s.family = 'team' then
                 case when l.kind = 'torneo'
                       and e.id = (select x.id from public.events x where x.league_id = l.id and x.type = 'torneo'
                                    order by x.created_at, x.id limit 1) then 'team_ko' end
               when l.sport = 'golf' then
                 case when exists (select 1 from public.golf_rounds r where r.event_id = e.id and r.tournament_id is null) then 'golf' end
               when l.sport = 'swimming' then case when e.type in ('encuentro', 'torneo') then 'swim' end
             end
        from public.events e
        join public.leagues l on l.id = e.league_id
        join public.sport_status s on s.id = l.sport
       where e.id = p_ref and e.league_id = p_league)
    when 'golf_torneo' then (
      select 'golf' from public.golf_tournaments t join public.leagues l on l.id = t.league_id
       where t.id = p_ref and t.league_id = p_league and l.sport = 'golf')
    when 'playoff' then (select 'playoff' from public.playoffs p where p.id = p_ref and p.league_id = p_league)
  end
$$;

-- =====================================================================
-- 4. Insignias
-- =====================================================================

alter table public.badge_awards drop constraint badge_awards_sport_check,
  add constraint badge_awards_sport_check check (sport in ('all', 'bowling', 'padel', 'tennis', 'pickleball',
    'table_tennis', 'basketball', 'football', 'futsal', 'golf', 'swimming'));
alter table public.badge_progress drop constraint badge_progress_sport_check,
  add constraint badge_progress_sport_check check (sport in ('all', 'bowling', 'padel', 'tennis', 'pickleball',
    'table_tennis', 'basketball', 'football', 'futsal', 'golf', 'swimming'));
alter table public.badge_stats drop constraint badge_stats_sport_check,
  add constraint badge_stats_sport_check check (sport in ('all', 'bowling', 'padel', 'tennis', 'pickleball',
    'table_tennis', 'basketball', 'football', 'futsal', 'golf', 'swimming'));

-- Lo mismo que bowlingActivity, racketActivity, teamActivity, golfActivity y swimActivity de src/badges/rules, para
-- los trabajos que suman muchas ligas (cuenta, meses de cuenta, ligas reales). Un (deporte, liga, jugador, fecha
-- local) por fila; official = hubo algo oficial que no fue solo por plantilla; roster = ese día solo contó por la
-- plantilla (equipos sin alineación). p_players null = todos los jugadores (con p_from/p_to para acotar). La raqueta
-- incluye el ping pong.
create or replace function private.badge_activity(p_players uuid[], p_from date default null, p_to date default null)
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
     where m.l_sport in ('padel', 'tennis', 'pickleball', 'table_tennis')
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

-- Aplica las decisiones del motor a un trabajo (lo llama private.badge_apply dentro de su bloque de errores). El
-- deporte de cada decisión: 'all' o uno de los 10 deportes (con 'table_tennis').
create or replace function private.badge_apply_decisions(j private.badge_queue, p_decisions jsonb, p_now timestamptz) returns jsonb
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
       or v_sport is null or v_sport not in ('all', 'bowling', 'padel', 'tennis', 'pickleball', 'table_tennis', 'basketball', 'football', 'futsal', 'golf', 'swimming') then
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

-- Los 53 íconos curados del editor (BADGE_ICON_KEYS de src/badges/visual/icons.ts; la prueba compara las dos listas).
create or replace function private.badge_icon_ok(p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p = any (array[
    'bowling', 'padel', 'tennis', 'pickleball', 'ping-pong', 'basketball', 'football', 'golf', 'swimming', 'whistle',
    'timer', 'target', 'goal', 'flag-triangle-right', 'trophy', 'medal', 'award', 'crown', 'star', 'gem', 'ribbon',
    'badge-check', 'sparkles', 'flame', 'zap', 'trending-up', 'rocket', 'mountain', 'footprints', 'crosshair',
    'hourglass', 'repeat', 'infinity', 'calendar-check', 'handshake', 'heart-handshake', 'hand-heart', 'users-round',
    'smile', 'thumbs-up', 'megaphone', 'party-popper', 'cake', 'gift', 'sun', 'sunrise', 'tree-palm', 'waves',
    'sprout', 'bird', 'shell', 'anchor', 'moon-star']::text[]), false)
$$;

-- =====================================================================
-- 5. Permisos: las ayudas, nadie de la app
-- =====================================================================
-- tt_score_ok y tt_result_ok son nuevas; las redefinidas conservan sus permisos (create or replace) y se dejan igual
-- para asegurarlo.
-- No hay RPC pública nueva.
do $$
declare
  f record;
  v_private constant text[] := array[
    'tt_score_ok', 'tt_result_ok', 'raq_sport', 'raq_check_event', 'raq_check_match', 'raq_check_player', 'prize_comp',
    'badge_activity', 'badge_apply_decisions', 'badge_icon_ok'];
begin
  for f in select p.oid::regprocedure as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private' and p.proname = any (v_private) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
