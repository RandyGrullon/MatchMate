-- MatchMate · Premios del torneo: la insignia que se lleva el campeón (diseño completo en docs/premios-torneo.md).
--
-- Una persona de la liga elige qué diseño del creador (league_badges) se lleva cada lugar del podio de una competencia
-- (campeón por equipos y campeón individual, y si quiere el 2.º y el 3.º) y, cuando termina, un admin lo entrega. Las
-- insignias se dan en league_badge_awards (la tabla del creador) con prize_slot_id: el perfil, los avisos, el push,
-- ocultar, reportar, las fusiones y «Descargar mis datos» ya funcionan igual.
--
-- 1. Tablas: public.tournament_prizes (una por competencia: un evento, un torneo de golf de varias rondas o un
--    playoff) y public.tournament_prize_slots (un lugar premiado: categoría, división, lugar 1–3 y el diseño). Ninguna
--    tiene FK a players (no frena la unión de jugadores). Las lee quien ve la liga; se escriben solo por RPC.
-- 2. league_badge_awards.prize_slot_id (sin FK: si el torneo se borra, la insignia se queda), prize_verified (el
--    servidor comprobó el orden: va en el otorgamiento para que siga valiendo aunque el torneo se borre) y el índice
--    único league_badge_awards_once también por lugar premiado: el mismo «Campeón · OCT 2026» se gana en dos torneos
--    del mes, o por equipos y en individual del mismo torneo.
-- 3. Un premio de torneo no es un regalo (§1 D4): no usa el cupo del diseño (Única, Selecta, Abierta) ni los topes del
--    creador (15 por jugador al año, 60 por liga en 30 días, 60 por cuenta por hora). Sus topes: 24 lugares por
--    competencia, 3 unidades empatadas por lugar, 100 jugadores por unidad (un club de natación o un equipo con sus
--    refuerzos pasa de 30), 300 por llamada y 30 llamadas por hora por cuenta (private.rate_take('premios'),
--    compartido entre guardar y entregar).
-- 4. Quién: elegir es de quien diseña insignias (private.can_badges); entregar, de un admin o de quien diseña. El
--    podio lo calcula el servidor donde puede (boliche, cuadros de raqueta, torneo relámpago y playoffs: el admin que
--    ganó se entrega su premio); en golf, natación y noches de raqueta lo arma el teléfono y el servidor solo revisa
--    que quien recibe haya jugado (y ahí nadie se lo entrega a sí mismo: 'a_si_mismo'). La plantilla de un equipo
--    (o de una pareja sin alineación) cuenta solo con quien ya estaba cuando quedó el resultado de su último partido:
--    entrar al equipo campeón después de la final no da el premio.
-- 5. Boliche: equipos por scratch e individual con handicap. Ya era lo que se leía con las reglas en null; ahora
--    public.create_event además lo deja escrito en todo torneo nuevo del boliche (se sigue cambiando con update_event).
-- 6. Cambian (misma firma, cuerpo copiado de su última versión con el cambio): public.award_league_badge (sus cuentas de
--    duplicado, cupo y topes no cuentan los premios), private.merge_badges (dos premios de lugares distintos se quedan
--    los dos; la foto de los ganadores sigue al jugador que queda), private.badge_link_guard (no retira un premio con el
--    orden verificado), public.revoke_league_badge_award (un premio de una premiación cerrada, o de un lugar entregado
--    hace más de 14 días, solo lo quita el dueño: 'cerrado', como al entregar) y public.create_event (…0500_rpc.sql: el
--    punto 5).
-- 7. Tiempo real: las dos tablas avisan 'badges' {op, ids, kind: 'premio'} por league:<liga> (src/lib/data/topics.ts
--    ya invalida las insignias de la liga con cualquier 'badges'). Los otorgamientos avisan solos (emit_league_badges).

-- =====================================================================
-- Tablas
-- =====================================================================

-- La premiación de una competencia. scope dice de cuál: un evento (boliche, raqueta, golf de una ronda, natación, el
-- evento del torneo relámpago), un torneo de golf de varias rondas o un playoff. Exactamente una referencia.
create table public.tournament_prizes (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  scope text not null check (scope in ('evento', 'golf_torneo', 'playoff')),
  event_id uuid,
  golf_tournament_id uuid,
  playoff_id uuid,
  -- La cinta de las insignias que se entregan (≤ 10, como league_badge_awards.period). Por defecto, el mes de la
  -- competencia («OCT 2026»); cambia mientras no haya nada entregado.
  period text not null default '' check (char_length(period) <= 10),
  -- «Cerrar premios»: desde aquí solo el dueño corrige.
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  foreign key (golf_tournament_id, league_id) references public.golf_tournaments (id, league_id) on delete cascade,
  foreign key (playoff_id, league_id) references public.playoffs (id, league_id) on delete cascade,
  check ((scope = 'evento') = (event_id is not null)),
  check ((scope = 'golf_torneo') = (golf_tournament_id is not null)),
  check ((scope = 'playoff') = (playoff_id is not null)),
  unique (id, league_id)
);
-- Una premiación por competencia.
create unique index tournament_prizes_one on public.tournament_prizes ((coalesce(event_id, golf_tournament_id, playoff_id)));
create index tournament_prizes_sync_idx on public.tournament_prizes (league_id, updated_at);
create index tournament_prizes_golf_idx on public.tournament_prizes (golf_tournament_id) where golf_tournament_id is not null;
create index tournament_prizes_playoff_idx on public.tournament_prizes (playoff_id) where playoff_id is not null;

-- Un lugar premiado.
create table public.tournament_prize_slots (
  id uuid primary key default gen_random_uuid(),
  prize_id uuid not null,
  league_id uuid not null,
  category text not null check (category in ('equipo', 'individual', 'pareja')),
  -- Subdivisión: '' general; raqueta = id de la categoría del torneo ('A'…'H'); natación individual 'F' | 'M'; golf
  -- '' (la competencia oficial de la ronda) | 'gross' | 'neto'.
  division text not null default '' check (division ~ '^[A-Za-z0-9_]{0,24}$'),
  -- Lo que se copia a league_badge_awards.division (≤ 16): «Categoría A», «Femenino», «Gross»…
  label text not null default '' check (char_length(label) <= 16),
  place smallint not null check (place between 1 and 3),
  badge_id uuid not null,
  -- Foto de quién lo ganó (para mostrarlo sin leer los otorgamientos): [{ref, name, teamId, players: [id]}] (≤ 3
  -- unidades: empates o los dos semifinalistas). Solo para mostrar: nada se decide con ella.
  winners jsonb not null default '[]' check (jsonb_typeof(winners) = 'array' and pg_column_size(winners) < 16384),
  -- true = el servidor comprobó el orden al entregar (boliche, cuadros, relámpago y playoffs). Para mostrar; lo que lee
  -- badge_link_guard es league_badge_awards.prize_verified (este lugar se borra con la competencia).
  verified boolean not null default false,
  -- Primera entrega: desde aquí corren los 14 días para corregir.
  delivered_at timestamptz,
  delivered_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (prize_id, league_id) references public.tournament_prizes (id, league_id) on delete cascade,
  -- Un diseño solo se borra si nunca se dio; si se borra antes de entregar, el lugar se va con él.
  foreign key (badge_id, league_id) references public.league_badges (id, league_id) on delete cascade,
  unique (prize_id, category, division, place)
);
create index tournament_prize_slots_sync_idx on public.tournament_prize_slots (league_id, updated_at);
create index tournament_prize_slots_badge_idx on public.tournament_prize_slots (badge_id);

-- De qué lugar premiado salió (null = la dio una persona con award_league_badge). Sin FK: si el torneo se borra, la
-- insignia se queda (es historia) y la columna conserva el id para que el índice único siga igual.
alter table public.league_badge_awards add column prize_slot_id uuid;
-- true = un premio con el orden verificado por el servidor (boliche, cuadros, relámpago y playoffs): quién lo recibe lo
-- decidió el resultado, así que badge_link_guard no lo retira. Va en el otorgamiento y no en el lugar premiado porque
-- el lugar se borra con la competencia y la insignia se queda.
alter table public.league_badge_awards add column prize_verified boolean not null default false;
create index league_badge_awards_prize_idx on public.league_badge_awards (prize_slot_id) where prize_slot_id is not null;

-- Una vigente por insignia, jugador, periodo, división… y lugar premiado. Con prize_slot_id null, la clave es la de
-- antes (nada del repo nombra el índice: no hay on conflict on constraint).
drop index public.league_badge_awards_once;
create unique index league_badge_awards_once on public.league_badge_awards
  (badge_id, player_id, private.badge_slot_key(period), private.badge_slot_key(division),
   coalesce(prize_slot_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;

grant select (prize_slot_id) on public.league_badge_awards to anon, authenticated;

-- =====================================================================
-- Triggers: updated_at, tombstones y tiempo real
-- =====================================================================

create trigger tournament_prizes_touch before update on public.tournament_prizes
  for each row execute function private.touch_updated_at();
create trigger tournament_prize_slots_touch before update on public.tournament_prize_slots
  for each row execute function private.touch_updated_at();
create trigger tournament_prizes_tombstone after delete on public.tournament_prizes
  for each row execute function private.tombstone('id');
create trigger tournament_prize_slots_tombstone after delete on public.tournament_prize_slots
  for each row execute function private.tombstone('id');

-- Por sentencia, solo con los ids: el mismo aviso 'badges' de las insignias de la liga, con kind 'premio'. Al borrar
-- una liga no se avisa nada.
create function private.emit_tournament_prizes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then
    for r in select o.league_id, jsonb_agg(o.id) as ids from old_rows o group by o.league_id loop
      if not private.deleting(r.league_id) then
        perform private.emit('league:' || r.league_id::text, 'badges', jsonb_build_object('op', 'delete', 'ids', r.ids, 'kind', 'premio'));
      end if;
    end loop;
  else
    for r in select n.league_id, jsonb_agg(n.id) as ids from new_rows n group by n.league_id loop
      perform private.emit('league:' || r.league_id::text, 'badges', jsonb_build_object('op', lower(tg_op), 'ids', r.ids, 'kind', 'premio'));
    end loop;
  end if;
  return null;
end $$;

create trigger tournament_prizes_emit_insert after insert on public.tournament_prizes referencing new table as new_rows
  for each statement execute function private.emit_tournament_prizes();
create trigger tournament_prizes_emit_update after update on public.tournament_prizes referencing new table as new_rows
  for each statement execute function private.emit_tournament_prizes();
create trigger tournament_prizes_emit_delete after delete on public.tournament_prizes referencing old table as old_rows
  for each statement execute function private.emit_tournament_prizes();
create trigger tournament_prize_slots_emit_insert after insert on public.tournament_prize_slots referencing new table as new_rows
  for each statement execute function private.emit_tournament_prizes();
create trigger tournament_prize_slots_emit_update after update on public.tournament_prize_slots referencing new table as new_rows
  for each statement execute function private.emit_tournament_prizes();
create trigger tournament_prize_slots_emit_delete after delete on public.tournament_prize_slots referencing old table as old_rows
  for each statement execute function private.emit_tournament_prizes();

-- =====================================================================
-- Quién ve qué (solo lectura): quien ve la liga, también sin cuenta en una liga pública
-- =====================================================================

alter table public.tournament_prizes enable row level security;
alter table public.tournament_prize_slots enable row level security;

create policy tournament_prizes_read on public.tournament_prizes for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy tournament_prize_slots_read on public.tournament_prize_slots for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));

revoke all on public.tournament_prizes, public.tournament_prize_slots from public, anon, authenticated;
grant select on public.tournament_prizes, public.tournament_prize_slots to anon, authenticated;

-- =====================================================================
-- Boliche: equipos por scratch, individual con handicap (la regla del dueño) en todo torneo nuevo
-- =====================================================================

-- Igual que en 20260926000500_rpc.sql, más: un torneo del boliche sin regla escrita nace con individual por handicap
-- ('hcp') y equipos por scratch ('scratch'), lo mismo que ya se leía con null (src/lib/stats.ts individualValue y
-- teamValue) y lo que pone create_tournament. Se cambia en cada evento con update_event.
create or replace function public.create_event(
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
  v_bowling_torneo boolean;
begin
  perform private.require_uid();
  perform private.require_admin(p_league);
  v_bowling_torneo := p_type = 'torneo'
                      and exists (select 1 from public.leagues l where l.id = p_league and l.sport = 'bowling');
  insert into public.events (id, league_id, type, name, date, start_time, games, hcp_base, hcp_percent, individual_rank_by,
                             team_rank_by, category_cuts, team_size, announcement, config, created_by)
  values (coalesce(p_id, gen_random_uuid()), p_league, p_type, btrim(coalesce(p_name, '')), p_date, p_start_time, p_games,
          p_hcp_base, p_hcp_percent,
          case when v_bowling_torneo then coalesce(p_individual_rank_by, 'hcp') else p_individual_rank_by end,
          case when v_bowling_torneo then coalesce(p_team_rank_by, 'scratch') else p_team_rank_by end,
          p_category_cuts::smallint[], p_team_size, coalesce(p_announcement, ''), coalesce(p_config, '{}'::jsonb), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- =====================================================================
-- Ayudas: qué competencia es y qué premia
-- =====================================================================

-- Texto con forma de uuid → uuid; si no, null.
create function private.prize_uuid(p text) returns uuid
language sql immutable set search_path = '' as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end
$$;

-- Orden de las categorías en las listas: equipos, parejas, individual.
create function private.prize_category_order(p text) returns integer
language sql immutable set search_path = '' as $$
  select case p when 'equipo' then 0 when 'pareja' then 1 else 2 end
$$;

-- «1.er lugar», «2.º lugar», «3.er lugar» (PLACE_LABEL en el teléfono).
create function private.prize_place_label(p integer) returns text
language sql immutable set search_path = '' as $$
  select case p when 1 then '1.er lugar' when 2 then '2.º lugar' else '3.er lugar' end
$$;

-- ¿La competencia existe en esa liga? (el evento, el torneo de golf o el playoff).
create function private.prize_ref_exists(p_league uuid, p_scope text, p_ref uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case p_scope
    when 'evento' then exists (select 1 from public.events e where e.id = p_ref and e.league_id = p_league)
    when 'golf_torneo' then exists (select 1 from public.golf_tournaments t where t.id = p_ref and t.league_id = p_league)
    when 'playoff' then exists (select 1 from public.playoffs p where p.id = p_ref and p.league_id = p_league)
  end, false)
$$;

-- Qué competencia es (la tabla de §5 de docs/premios-torneo.md), o null si no admite premios:
-- 'bowling'        torneo del boliche (type 'torneo', en una liga o suelto);
-- 'racket_tourney' torneo por categorías de raqueta (type 'torneo');
-- 'racket_night'   noche de americano o mexicano del pádel y social del pickleball (americano, mexicano, noche);
-- 'team_ko'        el evento de un torneo relámpago (liga kind 'torneo' de baloncesto, fútbol o sala): solo el del
--                  torneo (el primero de tipo 'torneo' de la liga, el que crea create_tournament), porque el podio sale
--                  de los partidos de toda la liga y otro evento premiaría al mismo campeón otra vez;
-- 'golf'           ronda suelta (sin torneo de varias rondas) o torneo de golf de varias rondas (scope golf_torneo);
-- 'swim'           encuentro o torneo de natación (no el control de marcas);
-- 'playoff'        un playoff (scope playoff).
create function private.prize_comp(p_league uuid, p_scope text, p_ref uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case p_scope
    when 'evento' then (
      select case
               when l.sport = 'bowling' then case when e.type = 'torneo' then 'bowling' end
               when l.sport in ('padel', 'tennis', 'pickleball') then
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

-- ¿La liga de raqueta juega en dobles? Como useRacket().doubles (engineRules): el pádel siempre; si no, lo que diga
-- leagues.rules.match.doubles, y sin eso lo del deporte (tenis individual, pickleball dobles).
create function private.prize_racket_doubles(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when l.sport = 'padel' then true
              when jsonb_typeof(l.rules -> 'match' -> 'doubles') = 'boolean' then (l.rules -> 'match' ->> 'doubles')::boolean
              else l.sport = 'pickleball' end
    from public.leagues l where l.id = p_league
$$;

-- Las categorías (y divisiones) que admite cada competencia (§5). Es la gemela de prizeCategories en
-- src/prizes/catalog.ts. Boliche: equipo (si el evento tiene equipos o jugadores por equipo) e individual. Raqueta
-- torneo: una por categoría de events.config.categories (division = su id), pareja en dobles e individual si no.
-- Noches: individual. Relámpago y playoffs: equipo. Golf: individual '' (la competencia oficial), 'gross' y 'neto'.
-- Natación: equipo (club) e individual '', 'F' y 'M'.
create function private.prize_allowed(p_league uuid, p_scope text, p_ref uuid) returns table (category text, division text)
language sql stable security definer set search_path = '' as $$
  with k as (select private.prize_comp(p_league, p_scope, p_ref) as kind)
  select distinct x.category, x.division
    from k cross join lateral (
      select 'equipo'::text, ''::text
       where k.kind = 'bowling'
         and exists (select 1 from public.events e
                      where e.id = p_ref and (e.team_size > 0 or exists (select 1 from public.teams t where t.event_id = e.id)))
      union all
      select 'individual', '' where k.kind in ('bowling', 'racket_night', 'golf', 'swim')
      union all
      select case when private.prize_racket_doubles(p_league) then 'pareja' else 'individual' end, c ->> 'id'
        from public.events e
        cross join lateral jsonb_array_elements(case when jsonb_typeof(e.config -> 'categories') = 'array'
                                                     then e.config -> 'categories' else '[]'::jsonb end) c
       where k.kind = 'racket_tourney' and e.id = p_ref
         and jsonb_typeof(c -> 'id') = 'string' and (c ->> 'id') ~ '^[A-Za-z0-9]{1,6}$'
      union all
      select 'equipo', '' where k.kind in ('team_ko', 'playoff', 'swim')
      union all
      select 'individual', d from unnest(array['gross', 'neto']) d where k.kind = 'golf'
      union all
      select 'individual', d from unnest(array['F', 'M']) d where k.kind = 'swim'
    ) x (category, division)
$$;

-- La división que se copia a los otorgamientos si el teléfono no manda una: el nombre de la categoría del torneo de
-- raqueta (≤ 16; si no pasa el filtro, «Cat. <id>»), «Femenino»/«Masculino», «Gross»/«Neto»; si no, ''.
create function private.prize_default_label(p_kind text, p_ref uuid, p_division text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v text;
begin
  if p_kind = 'racket_tourney' then
    select left(private.badge_clean(c ->> 'name'), 16) into v
      from public.events e
      cross join lateral jsonb_array_elements(case when jsonb_typeof(e.config -> 'categories') = 'array'
                                                   then e.config -> 'categories' else '[]'::jsonb end) c
     where e.id = p_ref and c ->> 'id' = p_division and jsonb_typeof(c -> 'name') = 'string'
     limit 1;
    v := private.badge_clean(v);
    if coalesce(v, '') = '' or not private.badge_text_ok(v) then
      v := left('Cat. ' || p_division, 16);
    end if;
    return v;
  elsif p_kind = 'swim' then
    return case p_division when 'F' then 'Femenino' when 'M' then 'Masculino' else '' end;
  elsif p_kind = 'golf' then
    return case p_division when 'gross' then 'Gross' when 'neto' then 'Neto' else '' end;
  end if;
  return '';
end $$;

-- La cinta por defecto: el mes de la competencia en mayúsculas («OCT 2026», como periodRibbon({kind: 'month'})). Evento:
-- su día; torneo de golf: el día de la última ronda; playoff: el último juego con hora (sin eso, hoy en la liga).
create function private.prize_default_period(p_league uuid, p_scope text, p_ref uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((array['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'])[extract(month from x.d)::integer]
                  || ' ' || extract(year from x.d)::integer, '')
    from (select case p_scope
                   when 'evento' then (select e.date from public.events e where e.id = p_ref)
                   when 'golf_torneo' then (select max(e.date) from public.golf_rounds r join public.events e on e.id = r.event_id
                                             where r.tournament_id = p_ref)
                   when 'playoff' then (select (coalesce(max(m.scheduled_at), now()) at time zone l.tz)::date
                                          from public.leagues l
                                          left join public.playoff_series y on y.playoff_id = p_ref
                                          left join public.matches m on m.series_id = y.id and m.status <> 'void'
                                         where l.id = p_league
                                         group by l.tz)
                 end as d) x
$$;

-- El nombre de la competencia para la nota y el push: el del evento (vacío: «Torneo del 12 oct», «Noche del…»,
-- «Encuentro del…», «Ronda del…»), el del torneo de golf o el del playoff.
create function private.prize_comp_name(p_prize uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
           case z.scope
             when 'evento' then nullif(btrim(e.name), '')
             when 'golf_torneo' then (select t.name from public.golf_tournaments t where t.id = z.golf_tournament_id)
             when 'playoff' then (select p.name from public.playoffs p where p.id = z.playoff_id)
           end,
           case when e.type in ('americano', 'mexicano', 'noche') then 'Noche'
                when e.type = 'encuentro' then 'Encuentro'
                when e.type = 'ronda' then 'Ronda'
                else 'Torneo' end
             || ' del ' || extract(day from e.date)::integer || ' '
             || (array['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'])[extract(month from e.date)::integer],
           'Torneo')
    from public.tournament_prizes z
    left join public.events e on e.id = z.event_id
   where z.id = p_prize
$$;

-- El título de un lugar (prizeTitle en el teléfono, con una prueba que los compara):
-- boliche «Equipos (scratch)»/«Equipos (handicap)» e «Individual (handicap)»/«Individual (scratch)» según la regla
-- EFECTIVA del evento (con 0 % de handicap, scratch aunque la regla diga handicap); raqueta «Parejas · <categoría>» o
-- «Individual · <categoría>»; noches «Individual»; relámpago y playoffs «Equipos»; golf «Individual», «Individual ·
-- Gross», «Individual · Neto»; natación «Clubes», «Individual», «Individual · Femenino», «Individual · Masculino».
create function private.prize_slot_title(s public.tournament_prize_slots) returns text
language sql stable security definer set search_path = '' as $$
  select case k.kind
           when 'bowling' then
             case when s.category = 'equipo'
                  then 'Equipos (' || case when e.type = 'torneo' and e.hcp_percent > 0 and coalesce(e.team_rank_by, 'scratch') = 'hcp'
                                           then 'handicap' else 'scratch' end || ')'
                  else 'Individual (' || case when e.type = 'torneo' and e.hcp_percent > 0 and coalesce(e.individual_rank_by, 'hcp') = 'hcp'
                                              then 'handicap' else 'scratch' end || ')' end
           when 'racket_tourney' then
             case s.category when 'pareja' then 'Parejas' else 'Individual' end || ' · ' || coalesce(nullif(s.label, ''), 'Cat. ' || s.division)
           when 'racket_night' then 'Individual'
           when 'team_ko' then 'Equipos'
           when 'playoff' then 'Equipos'
           when 'golf' then case s.division when 'gross' then 'Individual · Gross' when 'neto' then 'Individual · Neto' else 'Individual' end
           when 'swim' then case when s.category = 'equipo' then 'Clubes'
                                 when s.division = 'F' then 'Individual · Femenino'
                                 when s.division = 'M' then 'Individual · Masculino'
                                 else 'Individual' end
           else case s.category when 'equipo' then 'Equipos' when 'pareja' then 'Parejas' else 'Individual' end
         end
    from public.tournament_prizes z
    cross join lateral (select private.prize_comp(z.league_id, z.scope, coalesce(z.event_id, z.golf_tournament_id, z.playoff_id)) as kind) k
    left join public.events e on e.id = z.event_id
   where z.id = s.prize_id
$$;

-- =====================================================================
-- Ayudas: el podio que calcula el servidor
-- =====================================================================

-- entryLine de src/lib/stats.ts en SQL: por jugador del evento, los juegos que cuentan (con puntaje Y foto: los
-- borradores no), el scratch y el total con handicap (el handicap por juego, en el mismo orden de cuentas que el JS
-- para que el redondeo dé igual). Solo los que tienen al menos un juego que cuenta.
create function private.prize_bowling_lines(p_event uuid)
returns table (player_id uuid, team_id uuid, games integer, scratch integer, total integer)
language sql stable security definer set search_path = '' as $$
  select en.player_id, en.team_id, c.games, c.scratch, c.scratch + c.games * h.hcp
    from public.entries en
    join public.events ev on ev.id = en.event_id
    cross join lateral (select case when ev.type <> 'torneo' then 0
                                    when en.handicap_override is not null then en.handicap_override::integer
                                    when coalesce(en.average, 0) = 0 or ev.hcp_percent <= 0 then 0
                                    else greatest(0, floor(((ev.hcp_base - en.average) * ev.hcp_percent) / 100::float8))::integer
                               end as hcp) h
    cross join lateral (select count(*)::integer as games, coalesce(sum(en.scores[i]), 0)::integer as scratch
                          from generate_series(1, ev.games) i
                         where en.scores[i] is not null and en.photos[i] is not null) c
   where en.event_id = p_event and c.games > 0
$$;

-- Jugadores como [{id, name}], por nombre. Con p_played (equipos y lados de raqueta), cada uno lleva además played:
-- si apareció en la alineación de esos partidos (la pantalla marca por defecto solo a esos cuando la unidad tiene
-- alineaciones; si no, a todos).
create function private.prize_players_json(p_ids uuid[], p_played uuid[] default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name)
                            || case when p_played is null then '{}'::jsonb
                                    else jsonb_build_object('played', p.id = any (p_played)) end
                            order by lower(p.name), p.id), '[]'::jsonb)
    from public.players p where p.id = any (p_ids)
$$;

-- La clasificación del boliche con la que se premia (como StandingsTab con juegos verificados y rank(): 1, 2, 2, 4):
-- individual por total con handicap si el evento es torneo con handicap y su regla es 'hcp' (null = 'hcp'), si no por
-- scratch; equipos (los del evento con al menos un jugador que jugó: los inscritos que no jugaron no reciben) por la
-- suma de los totales si la regla de equipos es 'hcp' (null = 'scratch') y hay handicap, si no por la suma del scratch.
-- Una fila por unidad: {pos, unit: {ref ('p:<jugador>' | 't:<equipo>'), name, teamId, players: [{id, name}]}}.
create function private.prize_bowling_rank(p_event uuid, p_category text) returns table (pos integer, unit jsonb)
language sql stable security definer set search_path = '' as $$
  with ev as (select e.* from public.events e where e.id = p_event),
  l as (select x.* from private.prize_bowling_lines(p_event) x),
  ind as (
    select (rank() over (order by case when ev.type = 'torneo' and ev.hcp_percent > 0 and coalesce(ev.individual_rank_by, 'hcp') = 'hcp'
                                       then l.total else l.scratch end desc))::integer as pos,
           jsonb_build_object('ref', 'p:' || p.id, 'name', p.name, 'teamId', null,
                              'players', jsonb_build_array(jsonb_build_object('id', p.id, 'name', p.name))) as unit
      from l cross join ev join public.players p on p.id = l.player_id
     where p_category = 'individual'),
  tm as (
    select t.id, t.name, sum(l.scratch) as scratch, sum(l.total) as total, array_agg(l.player_id) as players
      from public.teams t join l on l.team_id = t.id
     where t.event_id = p_event and p_category = 'equipo'
     group by t.id, t.name),
  teq as (
    select (rank() over (order by case when ev.type = 'torneo' and ev.hcp_percent > 0 and coalesce(ev.team_rank_by, 'scratch') = 'hcp'
                                       then tm.total else tm.scratch end desc))::integer as pos,
           jsonb_build_object('ref', 't:' || tm.id, 'name', tm.name, 'teamId', tm.id,
                              'players', private.prize_players_json(tm.players)) as unit
      from tm cross join ev)
  select ind.pos, ind.unit from ind
  union all
  select teq.pos, teq.unit from teq
$$;

-- El partido de un lugar del cuadro de un evento (sin los anulados; si hubiera dos, el que se creó primero).
create function private.prize_match_at(p_event uuid, p_key text) returns public.matches
language sql stable security definer set search_path = '' as $$
  select m.* from public.matches m
   where m.event_id = p_event and m.bracket_key = p_key and m.status <> 'void'
   order by m.created_at, m.id
   limit 1
$$;

-- El lado que ganó un partido cuyo resultado cuenta (private.match_final: confirmado, W.O. o 48 h), o null.
create function private.prize_match_winner(m public.matches) returns smallint
language sql stable set search_path = '' as $$
  select case when m.id is not null and private.match_final(m.status, m.proposed_at)
              then coalesce(m.winner_side, case m.walkover_side when 1 then 2 when 2 then 1 end)::smallint end
$$;

-- Cuándo quedó el resultado de un partido: al proponerlo o al confirmarlo (lo que pasó primero; un W.O. del admin
-- solo tiene confirmación). Sin ninguno de los dos (filas viejas), su hora o su creación. La plantilla de un equipo
-- cuenta solo con quien ya estaba en ese momento.
create function private.prize_decided_at(p_proposed timestamptz, p_confirmed timestamptz, p_scheduled timestamptz,
                                         p_created timestamptz) returns timestamptz
language sql immutable set search_path = '' as $$
  select coalesce(least(p_proposed, p_confirmed), p_scheduled, p_created)
$$;

-- Un lado de raqueta como unidad: jugadores de match_players de ese lado (played); si no hay, la plantilla de su
-- pareja que ya estaba cuando quedó el resultado de ese partido (played: false). ref 't:<pareja>' con pareja de
-- temporada, 'p:<jugador>' con un solo jugador, si no 's:<partido>:<lado>'.
create function private.prize_side_unit(p_match uuid, p_side smallint) returns jsonb
language sql stable security definer set search_path = '' as $$
  with s as (select ms.* from public.match_sides ms where ms.match_id = p_match and ms.side = p_side),
  played as (
    select array(select mp.player_id from public.match_players mp
                  where mp.match_id = p_match and mp.side = p_side order by mp.player_id) as ids),
  pl as (
    select coalesce(
             nullif(played.ids, '{}'::uuid[]),
             array(select tp.player_id
                     from public.team_players tp
                     join s on tp.team_id = s.team_id
                     join public.matches m on m.id = p_match
                    where tp.created_at <= private.prize_decided_at(m.proposed_at, m.confirmed_at, m.scheduled_at, m.created_at)
                    order by tp.player_id)) as ids
      from played)
  select jsonb_build_object(
           'ref', case when s.team_id is not null then 't:' || s.team_id
                       when cardinality(pl.ids) = 1 then 'p:' || pl.ids[1]
                       else 's:' || p_match || ':' || p_side end,
           'name', s.label, 'teamId', s.team_id, 'players', private.prize_players_json(pl.ids, played.ids))
    from s cross join played cross join pl
$$;

-- Un equipo de temporada como unidad: quienes jugaron de su lado en esos partidos que cuentan (played; un refuerzo que
-- apareció en un partido también recibe) más su plantilla, pero solo quien ya estaba cuando quedó el resultado del
-- último partido del equipo que cuenta (played: false). Entrar al equipo campeón después de la final no da el premio
-- (ni a un admin que se agrega a sí mismo, ni al amigo que agrega un capitán). Sin partidos que cuenten (una serie
-- decidida sin juegos), la plantilla de hoy.
create function private.prize_team_unit(p_team uuid, p_matches uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ms as (
    select m.id, private.prize_decided_at(m.proposed_at, m.confirmed_at, m.scheduled_at, m.created_at) as decided
      from public.matches m
     where m.id = any (p_matches) and private.match_final(m.status, m.proposed_at)
       and exists (select 1 from public.match_sides x where x.match_id = m.id and x.team_id = p_team)),
  played as (
    select array(select distinct mp.player_id
                   from public.match_players mp
                   join public.match_sides x on x.match_id = mp.match_id and x.side = mp.side
                  where x.team_id = p_team and mp.match_id in (select ms.id from ms)) as ids),
  until as (select coalesce(max(ms.decided), 'infinity'::timestamptz) as t from ms)
  select jsonb_build_object('ref', 't:' || t.id, 'name', t.name, 'teamId', t.id,
           'players', private.prize_players_json(array(
             select u.x from unnest(played.ids) u (x)
             union
             select tp.player_id from public.team_players tp where tp.team_id = t.id and tp.created_at <= until.t), played.ids))
    from public.teams t cross join played cross join until
   where t.id = p_team
$$;

-- Un lugar del torneo de raqueta por categorías (p_cat = la categoría de events.config). Las rondas salen de la siembra
-- del cuadro (cat.seeds: log2 de la potencia de 2 siguiente, como createBracket). 1.º el que ganó la final
-- '<cat>-R<rondas>-1', 2.º el que la perdió (final por W.O.: 'vacio'), 3.º el ganador de '<cat>-P3' (por W.O.:
-- 'vacio'; configurado y sin crear: 'sin_resultado') o, sin P3, los dos que perdieron las semifinales (no por W.O.).
-- Sin cuadro o sin final que cuente: 'sin_resultado'.
create function private.prize_racket_place(p_event uuid, p_cat jsonb, p_place integer, out status text, out units jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cat text := p_cat ->> 'id';
  v_n integer;
  v_rounds integer := 0;
  v_size integer := 1;
  f public.matches;
  x public.matches;
  v_w smallint;
  v_x smallint;
begin
  status := 'sin_resultado';
  units := '[]'::jsonb;
  v_n := (select count(distinct t.v)::integer
            from jsonb_array_elements_text(case when jsonb_typeof(p_cat -> 'seeds') = 'array' then p_cat -> 'seeds' else '[]'::jsonb end) t (v)
           where t.v <> '');
  if v_cat is null or v_n < 2 then
    return;
  end if;
  while v_size < v_n loop
    v_size := v_size * 2;
    v_rounds := v_rounds + 1;
  end loop;
  f := private.prize_match_at(p_event, v_cat || '-R' || v_rounds || '-1');
  v_w := private.prize_match_winner(f);
  if v_w is null then
    return;
  end if;
  if p_place = 1 then
    units := jsonb_build_array(private.prize_side_unit(f.id, v_w));
  elsif p_place = 2 then
    if f.status <> 'walkover' then
      units := jsonb_build_array(private.prize_side_unit(f.id, (3 - v_w)::smallint));
    end if;
  else
    x := private.prize_match_at(p_event, v_cat || '-P3');
    if x.id is not null then
      v_x := private.prize_match_winner(x);
      if v_x is null then
        return;
      end if;
      if x.status <> 'walkover' then
        units := jsonb_build_array(private.prize_side_unit(x.id, v_x));
      end if;
    elsif p_cat -> 'thirdPlace' = 'true'::jsonb and v_n >= 4 then
      -- Falta el partido por el 3.er lugar.
      return;
    elsif v_rounds >= 2 then
      for i in 1..2 loop
        x := private.prize_match_at(p_event, v_cat || '-R' || (v_rounds - 1) || '-' || i);
        v_x := private.prize_match_winner(x);
        if v_x is not null and x.status <> 'walkover' then
          units := units || jsonb_build_array(private.prize_side_unit(x.id, (3 - v_x)::smallint));
        end if;
      end loop;
    end if;
  end if;
  units := coalesce((select jsonb_agg(u.v) from jsonb_array_elements(units) u (v) where jsonb_typeof(u.v) = 'object'), '[]'::jsonb);
  status := case when jsonb_array_length(units) = 0 then 'vacio' else 'listo' end;
end $$;

-- Un lugar del torneo relámpago (knockoutPodium de src/pages/sports/football/seasonTable.ts): los partidos de la liga
-- que no son de un playoff ni están anulados, con bracket_key 'R<ronda>-<n>'; la final es el único partido de la ronda
-- más alta (1.º quien ganó, 2.º quien perdió) y el 3.º el ganador de 'P3' (sin P3: 'vacio'). Jugadores: quienes
-- jugaron de ese lado en los partidos del torneo más la plantilla que ya estaba (private.prize_team_unit).
create function private.prize_team_ko_place(p_league uuid, p_place integer, out status text, out units jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ms uuid[];
  v_top integer;
  f public.matches;
  x public.matches;
  v_w smallint;
  v_team uuid;
begin
  status := 'sin_resultado';
  units := '[]'::jsonb;
  v_ms := array(select m.id from public.matches m where m.league_id = p_league and m.series_id is null and m.status <> 'void');
  select max((substring(m.bracket_key from '^R([0-9]+)-[0-9]+$'))::integer) into v_top
    from public.matches m where m.id = any (v_ms) and m.bracket_key ~ '^R[0-9]+-[0-9]+$';
  if v_top is null
     or (select count(*) from public.matches m where m.id = any (v_ms) and m.bracket_key ~ ('^R' || v_top || '-[0-9]+$')) <> 1 then
    return;
  end if;
  select m.* into f from public.matches m where m.id = any (v_ms) and m.bracket_key ~ ('^R' || v_top || '-[0-9]+$');
  v_w := private.prize_match_winner(f);
  if v_w is null then
    return;
  end if;
  if p_place in (1, 2) then
    v_team := (select ms.team_id from public.match_sides ms
                where ms.match_id = f.id and ms.side = case when p_place = 1 then v_w else 3 - v_w end);
  else
    select m.* into x from public.matches m where m.id = any (v_ms) and m.bracket_key = 'P3' order by m.created_at, m.id limit 1;
    if x.id is not null then
      v_w := private.prize_match_winner(x);
      if v_w is null then
        return;
      end if;
      v_team := (select ms.team_id from public.match_sides ms where ms.match_id = x.id and ms.side = v_w);
    end if;
  end if;
  if v_team is not null then
    units := jsonb_build_array(private.prize_team_unit(v_team, v_ms));
  end if;
  status := case when v_team is null then 'vacio' else 'listo' end;
end $$;

-- Un lugar de un playoff terminado (status 'finished'; si no, 'sin_resultado'): 1.º el campeón, 2.º el rival en la
-- serie final y 3.º los que perdieron las series de la ronda anterior (sin pases directos; hasta 2, como
-- league_seasons.semifinalists). Jugadores: quienes jugaron de su lado en los juegos del playoff más la plantilla que
-- ya estaba (private.prize_team_unit).
create function private.prize_playoff_place(p_playoff uuid, p_place integer, out status text, out units jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  po public.playoffs;
  f public.playoff_series;
  v_ms uuid[];
  v_teams uuid[];
begin
  status := 'sin_resultado';
  units := '[]'::jsonb;
  select * into po from public.playoffs p where p.id = p_playoff;
  if po.id is null or po.status <> 'finished' then
    return;
  end if;
  select * into f from public.playoff_series y where y.playoff_id = po.id and y.next_series is null order by y.round desc limit 1;
  v_ms := array(select m.id from public.matches m join public.playoff_series y on y.id = m.series_id
                 where y.playoff_id = po.id and m.status <> 'void');
  if p_place = 1 then
    v_teams := array_remove(array[coalesce(po.winner, f.winner)], null);
  elsif p_place = 2 then
    v_teams := array_remove(array[case when f.winner = f.team_a then f.team_b when f.winner = f.team_b then f.team_a end], null);
  else
    v_teams := array(select case when y.winner = y.team_a then y.team_b else y.team_a end
                       from public.playoff_series y
                      where y.playoff_id = po.id and y.round = f.round - 1 and y.winner is not null and not y.bye
                        and (case when y.winner = y.team_a then y.team_b else y.team_a end) is not null
                      order by y.slot
                      limit 2);
  end if;
  units := coalesce((select jsonb_agg(private.prize_team_unit(u.t, v_ms) order by u.n)
                       from unnest(v_teams) with ordinality as u (t, n)), '[]'::jsonb);
  status := case when jsonb_array_length(units) = 0 then 'vacio' else 'listo' end;
end $$;

-- Los podios que calcula el servidor, un renglón por lugar premiado de la premiación (en el orden de prize_json):
-- status 'listo' | 'vacio' (nadie en ese lugar: empate en el anterior, final por W.O.…) | 'sin_resultado' (todavía no
-- cuenta) | 'empate_multiple' (más de 3 empatados: no se entrega sola) | 'telefono' (golf, natación y noches: lo arma
-- el teléfono). units: [{ref, name, teamId, players: [{id, name, played?}]}] (empatados, por nombre; played en equipos y
-- lados de raqueta: si apareció en la alineación). La vista previa (tournament_podium) y la entrega usan esta misma
-- función: lo que se ve es lo que se entrega.
create function private.prize_server_podium(p_prize uuid) returns table (slot_id uuid, status text, units jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  z public.tournament_prizes;
  ev public.events;
  s public.tournament_prize_slots;
  v_kind text;
  v_ready boolean;
  v_ranks jsonb := '{}'::jsonb;
  v_rank jsonb;
  v_cat jsonb;
begin
  select * into z from public.tournament_prizes x where x.id = p_prize;
  if z.id is null then
    return;
  end if;
  v_kind := private.prize_comp(z.league_id, z.scope, coalesce(z.event_id, z.golf_tournament_id, z.playoff_id));
  select * into ev from public.events e where e.id = z.event_id;
  -- Boliche: se entrega desde el día del torneo (en la zona de la liga).
  v_ready := ev.id is not null and ev.date <= private.signup_today(z.league_id);
  for s in select * from public.tournament_prize_slots x where x.prize_id = p_prize
            order by private.prize_category_order(x.category), x.division, x.place loop
    slot_id := s.id;
    status := 'sin_resultado';
    units := '[]'::jsonb;
    if v_kind in ('golf', 'swim', 'racket_night') then
      status := 'telefono';
    elsif v_kind = 'bowling' then
      if v_ready then
        if not v_ranks ? s.category then
          v_ranks := v_ranks || jsonb_build_object(s.category, coalesce((
            select jsonb_agg(jsonb_build_object('pos', b.pos, 'unit', b.unit)) from private.prize_bowling_rank(ev.id, s.category) b), '[]'::jsonb));
        end if;
        v_rank := v_ranks -> s.category;
        if jsonb_array_length(v_rank) > 0 then
          units := coalesce((select jsonb_agg(r.v -> 'unit' order by r.v -> 'unit' ->> 'name', r.v -> 'unit' ->> 'ref')
                               from jsonb_array_elements(v_rank) r (v) where (r.v ->> 'pos')::integer = s.place), '[]'::jsonb);
          status := case when jsonb_array_length(units) = 0 then 'vacio'
                         when jsonb_array_length(units) > 3 then 'empate_multiple'
                         else 'listo' end;
        end if;
      end if;
    elsif v_kind = 'racket_tourney' then
      v_cat := (select c from jsonb_array_elements(case when jsonb_typeof(ev.config -> 'categories') = 'array'
                                                        then ev.config -> 'categories' else '[]'::jsonb end) c
                 where c ->> 'id' = s.division limit 1);
      if v_cat is not null then
        select q.status, q.units into status, units from private.prize_racket_place(ev.id, v_cat, s.place) q;
      end if;
    elsif v_kind = 'team_ko' then
      select q.status, q.units into status, units from private.prize_team_ko_place(z.league_id, s.place) q;
    elsif v_kind = 'playoff' then
      select q.status, q.units into status, units from private.prize_playoff_place(z.playoff_id, s.place) q;
    end if;
    return next;
  end loop;
end $$;

-- Donde el orden lo arma el teléfono (golf, natación y noches), quiénes de una unidad pueden recibir, es decir, jugaron:
-- 'p:<jugador>' → [él] si jugó (golf: tarjeta con golpes y sin descalificar, en la ronda o en cualquier ronda del
-- torneo; natación: una prueba del encuentro con tiempo y sin DQ/DNS/DNF; noches: un partido no anulado del evento);
-- 'c:<club>' (natación) → los nadadores de ese club que nadaron el encuentro. Si no, [].
create function private.prize_unit_players(p_prize uuid, p_ref text) returns uuid[]
language plpgsql stable security definer set search_path = '' as $$
declare
  z public.tournament_prizes;
  v_kind text;
  v_type text := left(coalesce(p_ref, ''), 2);
  v_id uuid := private.prize_uuid(substr(coalesce(p_ref, ''), 3));
begin
  select * into z from public.tournament_prizes x where x.id = p_prize;
  if z.id is null or v_id is null then
    return '{}'::uuid[];
  end if;
  v_kind := private.prize_comp(z.league_id, z.scope, coalesce(z.event_id, z.golf_tournament_id, z.playoff_id));
  if v_kind = 'golf' and v_type = 'p:' then
    return array(select distinct c.player_id from public.golf_cards c
                  where c.player_id = v_id and not c.dq and c.scored_at is not null
                    and (c.event_id = z.event_id
                         or c.event_id in (select r.event_id from public.golf_rounds r where r.tournament_id = z.golf_tournament_id)));
  elsif v_kind = 'swim' and v_type in ('p:', 'c:') then
    return array(select distinct e.player_id from public.swim_entries e
                  where e.event_id = z.event_id and e.status = 'ok' and e.time_cs is not null
                    and case when v_type = 'p:' then e.player_id = v_id else e.club_id = v_id end
                  order by 1);
  elsif v_kind = 'racket_night' and v_type = 'p:' then
    return array(select distinct mp.player_id from public.match_players mp join public.matches m on m.id = mp.match_id
                  where m.event_id = z.event_id and m.status <> 'void' and mp.player_id = v_id);
  end if;
  return '{}'::uuid[];
end $$;

-- ¿Ese lugar ya se puede entregar? Golf: todas las rondas 'cerrada'; natación: encuentro finalizado; noches: el día ya
-- llegó (en la zona de la liga); donde calcula el servidor: su podio ya no está 'sin_resultado' (boliche: desde el día
-- del torneo y con algún juego verificado; raqueta y relámpago: la final cuenta; playoffs: terminado).
create function private.prize_finished(p_prize uuid, p_slot uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  z public.tournament_prizes;
  v_kind text;
begin
  select * into z from public.tournament_prizes x where x.id = p_prize;
  if z.id is null then
    return false;
  end if;
  v_kind := private.prize_comp(z.league_id, z.scope, coalesce(z.event_id, z.golf_tournament_id, z.playoff_id));
  if v_kind is null then
    return false;
  elsif v_kind = 'golf' then
    return exists (select 1 from public.golf_rounds r where r.event_id = z.event_id or r.tournament_id = z.golf_tournament_id)
       and not exists (select 1 from public.golf_rounds r
                        where (r.event_id = z.event_id or r.tournament_id = z.golf_tournament_id) and r.status <> 'cerrada');
  elsif v_kind = 'swim' then
    return exists (select 1 from public.swim_meets m where m.event_id = z.event_id and m.finalized_at is not null);
  elsif v_kind = 'racket_night' then
    return exists (select 1 from public.events e where e.id = z.event_id and e.date <= private.signup_today(z.league_id));
  end if;
  return coalesce((select q.status <> 'sin_resultado' from private.prize_server_podium(p_prize) q where q.slot_id = p_slot), false);
end $$;

-- Una premiación (TournamentPrize): {id, leagueId, scope, refId, period, closedAt, closedBy, createdAt, updatedAt,
-- slots: [{id, category, division, label, place, badgeId, title, winners, verified, deliveredAt, deliveredBy,
-- editableUntil, updatedAt}]} (equipos, parejas, individual; división; lugar). editableUntil = la primera entrega + 14
-- días (null sin entregar); con closedAt, solo el dueño corrige.
create function private.prize_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'id', z.id, 'leagueId', z.league_id, 'scope', z.scope,
           'refId', coalesce(z.event_id, z.golf_tournament_id, z.playoff_id),
           'period', z.period, 'closedAt', private.iso(z.closed_at), 'closedBy', z.closed_by,
           'createdAt', private.iso(z.created_at), 'updatedAt', private.iso(z.updated_at),
           'slots', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', s.id, 'category', s.category, 'division', s.division, 'label', s.label, 'place', s.place,
                      'badgeId', s.badge_id, 'title', private.prize_slot_title(s), 'winners', s.winners,
                      'verified', s.verified, 'deliveredAt', private.iso(s.delivered_at), 'deliveredBy', s.delivered_by,
                      'editableUntil', private.iso(s.delivered_at + interval '14 days'), 'updatedAt', private.iso(s.updated_at))
                      order by private.prize_category_order(s.category), s.division, s.place)
               from public.tournament_prize_slots s where s.prize_id = z.id), '[]'::jsonb))
    from public.tournament_prizes z
   where z.id = p_id
$$;

-- =====================================================================
-- Insignias de la liga: los premios no chocan con los regalos
-- =====================================================================

-- Igual que en 20260929001120_insignias_creador.sql, pero las cuentas de 'duplicado', 'cupo_lleno', 'limite: jugador',
-- 'limite: liga' y 'rate_limited' suman solo lo que dio una persona (prize_slot_id null): un premio de torneo no le
-- quita cupo a los regalos, y un regalo no choca con un premio.
create or replace function public.award_league_badge(p_badge uuid, p_players uuid[], p_team uuid default null,
                                                     p_period text default null, p_division text default null,
                                                     p_note text default null, p_notify boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  b public.league_badges;
  l public.leagues;
  v_players uuid[];
  v_period text;
  v_division text;
  v_note text;
  v_limit integer;
  v_units integer;
  v_year timestamptz;
  v_ids uuid[];
  v_sent integer := 0;
  r record;
begin
  select * into b from public.league_badges x where x.id = p_badge;
  if b.id is null then
    perform private.fail('no_existe');
  end if;
  if not private.can_badges(b.league_id) then
    perform private.deny();
  end if;
  -- Una escritura por liga a la vez: los cupos se cuentan sin carreras.
  select * into l from public.leagues x where x.id = b.league_id for no key update;
  select * into b from public.league_badges x where x.id = p_badge for share;
  if b.status <> 'activa' then
    perform private.fail('no_activa');
  end if;
  if p_players is null or coalesce(array_ndims(p_players), 1) <> 1 or array_position(p_players, null) is not null then
    perform private.fail('invalido');
  end if;
  v_players := array(select u.x from unnest(p_players) with ordinality as u (x, n) group by u.x order by min(u.n));
  if cardinality(v_players) not between 1 and 30 then
    perform private.fail('invalido');
  end if;
  if (select count(*) from public.players p where p.id = any (v_players) and p.league_id = b.league_id)
     <> cardinality(v_players) then
    perform private.fail('no_existe');
  end if;
  if b.by_team then
    if p_team is null then
      perform private.fail('invalido');
    end if;
    if not exists (select 1 from public.teams t where t.id = p_team and t.league_id = b.league_id) then
      perform private.fail('no_existe');
    end if;
    if exists (select 1 from unnest(v_players) u (x)
                where not exists (select 1 from public.team_players tp where tp.team_id = p_team and tp.player_id = u.x)) then
      perform private.fail('invalido');
    end if;
  elsif p_team is not null then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from public.players p where p.id = any (v_players) and p.user_id = v_uid) then
    perform private.fail('a_si_mismo');
  end if;
  v_period := private.badge_clean(coalesce(p_period, b.period_text));
  v_division := private.badge_clean(p_division);
  v_note := private.badge_clean(p_note);
  if char_length(v_period) > 10 or char_length(v_division) > 16 or char_length(v_note) > 140 then
    perform private.fail('invalido');
  end if;
  if not (private.badge_text_ok(v_period) and private.badge_text_ok(v_division) and private.badge_text_ok(v_note)) then
    perform private.fail('texto_bloqueado');
  end if;
  if exists (select 1 from public.league_badge_awards a
              where a.badge_id = b.id and a.player_id = any (v_players) and a.revoked_at is null and a.prize_slot_id is null
                and private.badge_slot_key(a.period) = private.badge_slot_key(v_period)
                and private.badge_slot_key(a.division) = private.badge_slot_key(v_division)) then
    perform private.fail('duplicado');
  end if;
  -- Cupo por insignia, periodo y división (con by_team, un equipo cuenta 1). Los premios de torneo no cuentan.
  v_limit := case b.limit_kind when 'unica' then 1 when 'selecta' then 3 else 20 end;
  select count(distinct case when b.by_team then coalesce(a.team_id, a.player_id) else a.player_id end)::integer
    into v_units
    from public.league_badge_awards a
   where a.badge_id = b.id and private.badge_slot_key(a.period) = private.badge_slot_key(v_period)
     and private.badge_slot_key(a.division) = private.badge_slot_key(v_division) and a.revoked_at is null
     and a.prize_slot_id is null;
  if v_units + (case when not b.by_team then cardinality(v_players)
                     when exists (select 1 from public.league_badge_awards a
                                   where a.badge_id = b.id and private.badge_slot_key(a.period) = private.badge_slot_key(v_period)
                                     and private.badge_slot_key(a.division) = private.badge_slot_key(v_division)
                                     and a.revoked_at is null and a.prize_slot_id is null and a.team_id = p_team) then 0
                     else 1 end) > v_limit then
    perform private.fail('cupo_lleno');
  end if;
  -- 15 vigentes por jugador, liga y año (el año de la zona de la liga), sin contar los premios de torneo.
  v_year := date_trunc('year', now() at time zone l.tz) at time zone l.tz;
  if exists (select 1 from unnest(v_players) u (x)
              where (select count(*) from public.league_badge_awards a
                      where a.player_id = u.x and a.revoked_at is null and a.prize_slot_id is null
                        and a.awarded_at >= v_year) >= 15) then
    perform private.fail('limite: jugador');
  end if;
  if (select count(*) from public.league_badge_awards a
       where a.league_id = b.league_id and a.prize_slot_id is null
         and a.awarded_at > now() - interval '30 days') + cardinality(v_players) > 60 then
    perform private.fail('limite: liga');
  end if;
  if (select count(*) from public.league_badge_awards a
       where a.awarded_by = v_uid and a.prize_slot_id is null
         and a.awarded_at > now() - interval '1 hour') + cardinality(v_players) > 60 then
    perform private.fail('rate_limited');
  end if;

  with ins as (
    insert into public.league_badge_awards (badge_id, league_id, player_id, team_id, period, division, note, awarded_by)
    select b.id, b.league_id, u.x, p_team, v_period, v_division, v_note, v_uid
      from unnest(v_players) with ordinality as u (x, n)
     order by u.n
    returning id, player_id)
  select array_agg(i.id order by array_position(v_players, i.player_id)) into v_ids from ins i;

  if coalesce(p_notify, true) and not l.has_minors then
    for r in
      select a.id, p.user_id
        from public.league_badge_awards a
        join public.players p on p.id = a.player_id
        join public.profiles pr on pr.id = p.user_id
       where a.id = any (v_ids) and pr.blocked_at is null
       order by array_position(v_ids, a.id)
    loop
      insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
      values (r.user_id, '¡Tienes una insignia nueva!',
              left(l.name || ' te dio “' || b.name || coalesce(' · ' || nullif(v_period, ''), '') || '”. Tócala para verla.', 1000),
              '/u/' || r.user_id::text || '?tab=insignias', 'insignia:' || r.id::text, 86400, 'normal');
      v_sent := v_sent + 1;
    end loop;
    if v_sent > 0 then
      perform private.kick_send_push();
    end if;
  end if;

  return jsonb_build_object(
    'awards', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'badgeId', a.badge_id, 'leagueId', a.league_id, 'playerId', a.player_id, 'teamId', a.team_id,
               'period', a.period, 'division', a.division, 'note', a.note, 'awardedBy', a.awarded_by,
               'awardedAt', private.iso(a.awarded_at), 'hidden', a.hidden, 'revokedAt', private.iso(a.revoked_at))
               order by array_position(v_ids, a.id))
        from public.league_badge_awards a where a.id = any (v_ids)), '[]'::jsonb),
    'notified', v_sent);
end $$;

-- Igual que en 20260929001120_insignias_creador.sql, más: dos otorgamientos de la liga solo chocan si además son del
-- mismo lugar premiado (prize_slot_id; los dos null = regalos, como antes). Dos premios de lugares distintos (dos
-- torneos, o equipos e individual del mismo) se quedan los dos. Y la foto de los ganadores de los premios de la liga
-- (tournament_prize_slots.winners, solo para mostrar) pasa al jugador que queda.
create or replace function private.merge_badges(p_from uuid, p_into uuid, p_league uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_rank constant text[] := array['revocada', 'en_revision', 'provisional', 'firme'];
  v_gone uuid[] := '{}';
  v_keep uuid;
  v_drop uuid;
  r record;
begin
  for r in
    select f.id as f_id, i.id as i_id,
           array_position(v_rank, f.status) > array_position(v_rank, i.status)
             or (f.status = i.status and f.awarded_at < i.awarded_at) as from_wins,
           f.hidden or i.hidden as hidden,
           least(f.seen_at, i.seen_at) as seen_at,
           least(f.notified_at, i.notified_at) as notified_at,
           least(f.awarded_at, i.awarded_at) as awarded_at
      from public.badge_awards f
      join public.badge_awards i on i.player_id = p_into and i.badge_key = f.badge_key and i.sport = f.sport
                                and i.level = f.level and i.period_key = f.period_key
     where f.player_id = p_from
  loop
    v_keep := case when r.from_wins then r.f_id else r.i_id end;
    v_drop := case when r.from_wins then r.i_id else r.f_id end;
    delete from public.badge_awards a where a.id = v_drop;
    update public.badge_awards a
       set hidden = r.hidden, seen_at = r.seen_at, notified_at = r.notified_at, awarded_at = r.awarded_at
     where a.id = v_keep;
    v_gone := v_gone || v_drop;
  end loop;
  update public.badge_awards a set player_id = p_into where a.player_id = p_from and a.league_id = p_league;
  if cardinality(v_gone) > 0 then
    update public.profiles p
       set featured_badges = array(select u.x from unnest(p.featured_badges) with ordinality as u (x, n)
                                    where u.x <> all (v_gone) order by u.n)
     where p.featured_badges && v_gone;
  end if;
  delete from public.badge_progress x where x.player_id in (p_from, p_into);

  -- Insignias del creador: la más nueva de cada choque se retira (la subconsulta ve la tabla de antes del cambio).
  -- Chocan la misma insignia, periodo y división del mismo lugar premiado (o las dos sin lugar: regalos).
  update public.league_badge_awards f set revoked_at = now(), revoked_by = null, revoke_reason = 'fusión'
   where f.player_id in (p_from, p_into) and f.revoked_at is null
     and exists (select 1 from public.league_badge_awards o
                  where o.player_id in (p_from, p_into) and o.player_id <> f.player_id and o.revoked_at is null
                    and o.badge_id = f.badge_id and private.badge_slot_key(o.period) = private.badge_slot_key(f.period)
                    and private.badge_slot_key(o.division) = private.badge_slot_key(f.division)
                    and o.prize_slot_id is not distinct from f.prize_slot_id
                    and (o.awarded_at, o.id) < (f.awarded_at, f.id));
  update public.league_badge_awards x set player_id = p_into where x.player_id = p_from;
  -- La foto de los ganadores de los premios del torneo (solo para mostrar) sigue al que queda.
  update public.tournament_prize_slots s
     set winners = replace(s.winners::text, p_from::text, p_into::text)::jsonb
   where s.league_id = p_league and s.winners::text like '%' || p_from::text || '%';

  -- «Se vinculó él mismo» (…1110, §1.6) pasa al que queda: ese historial ahora está ahí. La fila del que se va se
  -- borra aquí (tiene FK a players: si quedara, el guardia del catálogo de merge_players_base frenaría toda unión de
  -- un jugador marcado con 'conflicto: private.badge_self_links').
  insert into private.badge_self_links (player_id, user_id, created_at)
  select p_into, s.user_id, s.created_at from private.badge_self_links s where s.player_id = p_from
  on conflict (player_id) do nothing;
  delete from private.badge_self_links s where s.player_id = p_from;
  -- Si el que queda ya es de una cuenta (juntar un jugador sin cuenta con el de un admin), lo que esa cuenta le dio o
  -- le confirmó se va (nadie se da insignias a sí mismo).
  perform private.badge_link_guard(p_into);

  perform private.badge_signal('merge', p_league, p_into, null);
end $$;

-- Igual que en 20260929001120_insignias_creador.sql, pero no retira un premio del torneo con el orden verificado por el
-- servidor (league_badge_awards.prize_verified: boliche, cuadros, relámpago y playoffs): ahí quién recibe lo decide el
-- resultado, no quien entregó, y juntar el jugador de un admin con un invitado duplicado no le quita lo que ganó. La
-- marca va en el otorgamiento: sigue valiendo aunque después se borre la competencia (y con ella su lugar premiado).
-- En golf, natación y noches (el orden lo armó el teléfono) sigue la regla de siempre.
create or replace function private.badge_link_guard(p_player uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select p.user_id from public.players p where p.id = p_player);
  v_back uuid[];
begin
  if v_user is null then
    return;
  end if;
  update public.league_badge_awards a
     set revoked_at = now(), revoked_by = null, revoke_reason = 'Se la dio la misma cuenta'
   where a.player_id = p_player and a.awarded_by = v_user and a.revoked_at is null
     and not a.prize_verified;
  with back as (
    update public.badge_awards a
       set status = 'en_revision', firm_at = null, context = a.context - 'review'
     where a.player_id = p_player and a.status in ('provisional', 'firme')
       and a.context -> 'review' ->> 'by' = v_user::text and a.context -> 'review' ->> 'ok' = 'true'
    returning a.id)
  select coalesce(array_agg(b.id), '{}'::uuid[]) into v_back from back b;
  if cardinality(v_back) > 0 then
    update public.profiles pr
       set featured_badges = array(select u.x from unnest(pr.featured_badges) with ordinality as u (x, n)
                                    where u.x <> all (v_back) order by u.n)
     where pr.featured_badges && v_back;
    perform private.badge_push_reviewers(v_back);
  end if;
end $$;

-- Igual que en 20260929001120_insignias_creador.sql, más: un premio del torneo de una premiación cerrada («Cerrar
-- premios»), o de un lugar entregado hace más de 14 días, solo lo quita el dueño (o el superadmin): 'cerrado', la
-- misma regla que deliver_tournament_prizes. Si no, «Deshacer» dejaría a quien lo entregó corregir en silencio lo que
-- ya se cerró. Si la competencia se borró, el premio es un otorgamiento más (sus reglas de siempre).
create or replace function public.revoke_league_badge_award(p_award uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_reason text := nullif(private.badge_clean(p_reason), '');
  a public.league_badge_awards;
begin
  select * into a from public.league_badge_awards x where x.id = p_award for update;
  if a.id is null then
    perform private.fail('no_existe');
  end if;
  if not (private.is_owner(a.league_id)
          or (a.awarded_by = v_uid and a.awarded_at > now() - interval '24 hours' and private.can_badges(a.league_id))) then
    perform private.deny();
  end if;
  if a.prize_slot_id is not null and not private.is_owner(a.league_id)
     and exists (select 1 from public.tournament_prize_slots s join public.tournament_prizes z on z.id = s.prize_id
                  where s.id = a.prize_slot_id
                    and (z.closed_at is not null or s.delivered_at < now() - interval '14 days')) then
    perform private.fail('cerrado');
  end if;
  if char_length(v_reason) > 140 then
    perform private.fail('invalido');
  end if;
  if a.revoked_at is not null then
    return;
  end if;
  update public.league_badge_awards x set revoked_at = now(), revoked_by = v_uid, revoke_reason = v_reason
   where x.id = p_award;
  delete from public.push_outbox o
   where o.tag = 'insignia:' || p_award::text and o.sent_at is null and o.claimed_at is null;
  if private.is_super() and not exists (select 1 from public.league_members m
                                         where m.league_id = a.league_id and m.user_id = v_uid and m.role = 'owner') then
    perform private.audit('revoke_league_badge', 'league', a.league_id::text,
                          jsonb_build_object('award', a.id, 'badge', a.badge_id, 'playerId', a.player_id,
                                             'period', a.period, 'division', a.division, 'reason', v_reason));
  end if;
end $$;

-- =====================================================================
-- RPC
-- =====================================================================

-- Guarda EL CONJUNTO COMPLETO de lugares premiados de una competencia (crea la premiación si no existe: una por
-- competencia, así que reintentar no duplica nada). p_scope 'evento' | 'golf_torneo' | 'playoff', p_ref = el id del
-- evento, del torneo de golf o del playoff. p_period = la cinta (≤ 10; null = la que tiene, o el mes de la competencia
-- al crearla). p_slots = [{category, division?, label?, place, badge_id}] (0–24): category/division de las que admite
-- la competencia (private.prize_allowed), place 1–3, label ≤ 16 (null o sin la clave: el de la división, p. ej. el
-- nombre de la categoría del torneo de raqueta). Un lugar que no viene se borra; [] borra la premiación. Un lugar
-- entregado (con insignias vigentes) no cambia de diseño ni de división ni se borra, y la cinta no cambia si hay algo
-- entregado: 'ya_entregado' (primero se quita con deliver_tournament_prizes).
-- Quién: private.can_badges. Errores: 'no_existe' (liga, competencia o diseño de otra liga), 'no_permitido',
-- 'invalido' (competencia sin premios, clave, tipo, categoría, lugar repetido, más de 24, largos), 'no_activa' (un
-- diseño nuevo o cambiado que no está activo), 'texto_bloqueado' (cinta o división), 'ya_entregado', 'rate_limited'
-- (30 por hora por cuenta, con la entrega). Devuelve la premiación (private.prize_json), o null si quedó sin lugares.
create function public.set_tournament_prizes(p_league uuid, p_scope text, p_ref uuid, p_period text, p_slots jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_kind text;
  v_period text;
  v_want jsonb := '[]'::jsonb;
  v_keys text[] := '{}';
  v_key text;
  v_cat text;
  v_div text;
  v_label text;
  v_place integer;
  v_badge uuid;
  x jsonb;
  k text;
  b public.league_badges;
  z public.tournament_prizes;
  o public.tournament_prize_slots;
begin
  if p_league is null or not exists (select 1 from public.leagues l where l.id = p_league) then
    perform private.fail('no_existe');
  end if;
  if not private.can_badges(p_league) then
    perform private.deny();
  end if;
  if p_scope is null or p_scope not in ('evento', 'golf_torneo', 'playoff') then
    perform private.fail('invalido');
  end if;
  if p_ref is null or not private.prize_ref_exists(p_league, p_scope, p_ref) then
    perform private.fail('no_existe');
  end if;
  v_kind := private.prize_comp(p_league, p_scope, p_ref);
  if v_kind is null then
    perform private.fail('invalido');
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) > 24 then
    perform private.fail('invalido');
  end if;
  if p_period is not null then
    v_period := private.badge_clean(p_period);
    if char_length(v_period) > 10 then
      perform private.fail('invalido');
    end if;
    if not private.badge_text_ok(v_period) then
      perform private.fail('texto_bloqueado');
    end if;
  end if;

  -- Cada lugar: forma, que la competencia lo admita, textos y que el diseño sea de la liga.
  for x in select value from jsonb_array_elements(p_slots) loop
    if jsonb_typeof(x) <> 'object' then
      perform private.fail('invalido');
    end if;
    for k in select jsonb_object_keys(x) loop
      if k <> all (array['category', 'division', 'label', 'place', 'badge_id']) then
        perform private.fail('invalido');
      end if;
    end loop;
    if jsonb_typeof(x -> 'category') is distinct from 'string'
       or coalesce(jsonb_typeof(x -> 'division'), 'null') not in ('string', 'null')
       or coalesce(jsonb_typeof(x -> 'label'), 'null') not in ('string', 'null')
       or jsonb_typeof(x -> 'place') is distinct from 'number' or (x ->> 'place') !~ '^[123]$'
       or jsonb_typeof(x -> 'badge_id') is distinct from 'string' or private.prize_uuid(x ->> 'badge_id') is null then
      perform private.fail('invalido');
    end if;
    v_cat := x ->> 'category';
    v_div := coalesce(x ->> 'division', '');
    v_place := (x ->> 'place')::integer;
    v_badge := (x ->> 'badge_id')::uuid;
    if not exists (select 1 from private.prize_allowed(p_league, p_scope, p_ref) a where a.category = v_cat and a.division = v_div) then
      perform private.fail('invalido');
    end if;
    v_key := v_cat || '|' || v_div || '|' || v_place;
    if v_key = any (v_keys) then
      perform private.fail('invalido');
    end if;
    v_keys := v_keys || v_key;
    v_label := case when jsonb_typeof(x -> 'label') = 'string' then private.badge_clean(x ->> 'label')
                    else private.prize_default_label(v_kind, p_ref, v_div) end;
    if char_length(v_label) > 16 then
      perform private.fail('invalido');
    end if;
    if not private.badge_text_ok(v_label) then
      perform private.fail('texto_bloqueado');
    end if;
    if not exists (select 1 from public.league_badges d where d.id = v_badge and d.league_id = p_league) then
      perform private.fail('no_existe');
    end if;
    v_want := v_want || jsonb_build_array(jsonb_build_object('category', v_cat, 'division', v_div, 'label', v_label,
                                                             'place', v_place, 'badge_id', v_badge));
  end loop;

  -- Una escritura por liga a la vez (crear la premiación sin carreras).
  perform 1 from public.leagues l where l.id = p_league for no key update;
  if not private.rate_take(private.rate_key('premios'), 30, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  select * into z from public.tournament_prizes t
   where t.league_id = p_league and coalesce(t.event_id, t.golf_tournament_id, t.playoff_id) = p_ref for update;

  if z.id is null then
    if jsonb_array_length(v_want) = 0 then
      return null;
    end if;
    insert into public.tournament_prizes (league_id, scope, event_id, golf_tournament_id, playoff_id, period, created_by)
    values (p_league, p_scope, case when p_scope = 'evento' then p_ref end, case when p_scope = 'golf_torneo' then p_ref end,
            case when p_scope = 'playoff' then p_ref end,
            coalesce(v_period, private.prize_default_period(p_league, p_scope, p_ref), ''), v_uid)
    returning * into z;
  elsif v_period is not null and v_period is distinct from z.period then
    if exists (select 1 from public.league_badge_awards a join public.tournament_prize_slots s on s.id = a.prize_slot_id
                where s.prize_id = z.id and a.revoked_at is null) then
      perform private.fail('ya_entregado');
    end if;
    update public.tournament_prizes t set period = v_period where t.id = z.id;
  end if;

  -- Los lugares que ya no vienen se borran (si no se entregaron).
  for o in select * from public.tournament_prize_slots s
            where s.prize_id = z.id
              and not exists (select 1 from jsonb_array_elements(v_want) w
                               where w ->> 'category' = s.category and w ->> 'division' = s.division
                                 and (w ->> 'place')::integer = s.place)
            for update loop
    if exists (select 1 from public.league_badge_awards a where a.prize_slot_id = o.id and a.revoked_at is null) then
      perform private.fail('ya_entregado');
    end if;
    delete from public.tournament_prize_slots s where s.id = o.id;
  end loop;

  -- Los que vienen: se crean o se cambian (diseño y división solo si no se entregaron).
  for x in select value from jsonb_array_elements(v_want) loop
    v_badge := (x ->> 'badge_id')::uuid;
    select * into o from public.tournament_prize_slots s
     where s.prize_id = z.id and s.category = x ->> 'category' and s.division = x ->> 'division'
       and s.place = (x ->> 'place')::integer
       for update;
    if o.id is not null and o.badge_id = v_badge and o.label = x ->> 'label' then
      continue;
    end if;
    if o.id is not null and exists (select 1 from public.league_badge_awards a where a.prize_slot_id = o.id and a.revoked_at is null) then
      perform private.fail('ya_entregado');
    end if;
    if o.id is null or o.badge_id <> v_badge then
      select * into b from public.league_badges d where d.id = v_badge;
      if b.status <> 'activa' then
        perform private.fail('no_activa');
      end if;
    end if;
    if o.id is null then
      insert into public.tournament_prize_slots (prize_id, league_id, category, division, label, place, badge_id)
      values (z.id, p_league, x ->> 'category', x ->> 'division', x ->> 'label', (x ->> 'place')::smallint, v_badge);
    else
      update public.tournament_prize_slots s set badge_id = v_badge, label = x ->> 'label' where s.id = o.id;
    end if;
  end loop;

  if jsonb_array_length(v_want) = 0 then
    delete from public.tournament_prizes t where t.id = z.id;
    return null;
  end if;
  return private.prize_json(z.id);
end $$;

-- La vista previa de «Entregar premios» (admin de la liga o quien diseña insignias). {prizeId, kind, verified, slots:
-- [{slotId, verified, status, finished, units: [{ref, name, teamId, players: [{id, name, played?}]}], holders:
-- [{awardId, playerId, teamId}], withdrawn: [playerId]}]}. kind = private.prize_comp ('bowling' | 'racket_tourney' |
-- 'racket_night' | 'team_ko' | 'playoff' | 'golf' | 'swim'); status de private.prize_server_podium ('telefono': lo
-- arma el teléfono); finished = private.prize_finished; holders = quién lo tiene vigente; withdrawn = a quién se lo
-- quitaron a mano (el dueño; o el guardia del vínculo) y hoy no lo tiene: la pantalla lo deja desmarcado.
-- 'no_existe', 'no_permitido'.
create function public.tournament_podium(p_prize uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  z public.tournament_prizes;
  v_kind text;
  v_verified boolean;
begin
  perform private.require_uid();
  select * into z from public.tournament_prizes t where t.id = p_prize;
  if z.id is null then
    perform private.fail('no_existe');
  end if;
  if not (private.is_admin(z.league_id) or private.can_badges(z.league_id)) then
    perform private.deny();
  end if;
  v_kind := private.prize_comp(z.league_id, z.scope, coalesce(z.event_id, z.golf_tournament_id, z.playoff_id));
  v_verified := coalesce(v_kind in ('bowling', 'racket_tourney', 'team_ko', 'playoff'), false);
  return jsonb_build_object(
    'prizeId', z.id,
    'kind', v_kind,
    'verified', v_verified,
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slotId', q.slot_id,
               'verified', v_verified,
               'status', q.status,
               'finished', case when q.status = 'telefono' then private.prize_finished(z.id, q.slot_id)
                                else q.status <> 'sin_resultado' end,
               'units', q.units,
               'holders', coalesce((
                 select jsonb_agg(jsonb_build_object('awardId', a.id, 'playerId', a.player_id, 'teamId', a.team_id)
                                  order by a.awarded_at, a.id)
                   from public.league_badge_awards a where a.prize_slot_id = q.slot_id and a.revoked_at is null), '[]'::jsonb),
               'withdrawn', coalesce((
                 select jsonb_agg(distinct a.player_id)
                   from public.league_badge_awards a
                  where a.prize_slot_id = q.slot_id and a.revoked_at is not null
                    and coalesce(a.revoke_reason, '') not in ('Corrección del podio', 'fusión')
                    and not exists (select 1 from public.league_badge_awards c
                                     where c.prize_slot_id = q.slot_id and c.player_id = a.player_id and c.revoked_at is null)), '[]'::jsonb))
             order by q.ord)
        from private.prize_server_podium(z.id) with ordinality as q (slot_id, status, units, ord)), '[]'::jsonb));
end $$;

-- Entrega o corrige (admin de la liga o quien diseña insignias). Trabaja con el ESTADO DESEADO de cada lugar que viene:
-- p_podium = [{slot_id, units: [{ref, players: [uuid]}]}] (0–3 unidades; name y teamId se aceptan y se ignoran: el
-- nombre y el equipo los pone el servidor). units [] le quita el premio a quien lo tenga. Correrla otra vez con lo mismo
-- no cambia nada; lo que sobra se retira ('Corrección del podio', sin aviso, y su push pendiente sale de la cola) y lo
-- que falta se da (league_badge_awards con prize_slot_id, prize_verified, team_id del equipo, period = la cinta,
-- division = el label del lugar y la nota «1.er lugar · Individual (handicap) · Torneo Aniversario»).
-- - Orden verificado (boliche, cuadros, relámpago, playoffs): los ref tienen que ser exactamente los del podio del
--   servidor para ese lugar, y los jugadores de cada unidad un subconjunto de los suyos (se puede desmarcar, nunca
--   agregar): si no, 'podio_cambio'. Quien entrega puede estar en el podio.
-- - Sin orden verificado (golf, natación, noches): 'p:<jugador>' solo con ese jugador y 'c:<club>' (natación, por
--   clubes) con nadadores de ese club, todos que hayan jugado (private.prize_unit_players): si no, 'invalido'. Darle
--   el premio al jugador de quien entrega: 'a_si_mismo'.
-- - Para dar hace falta que el lugar ya se pueda entregar ('sin_resultado') y que el diseño siga activo ('no_activa');
--   quitar se puede siempre.
-- - Un cambio en un lugar entregado hace más de 14 días, o en una premiación cerrada, solo lo hace el dueño (o el
--   superadmin): 'cerrado'.
-- Hasta 24 lugares, 1–100 jugadores de la liga por unidad, sin repetir en el lugar, y 300 por llamada ('invalido');
-- 'no_existe' (premiación o lugar), 'no_permitido', 'rate_limited' (30 por hora por cuenta, con set_tournament_prizes).
-- p_notify: push a cada jugador con cuenta no bloqueada que recibe (nunca en ligas con menores; los que pierden un
-- premio no reciben aviso): «¡Tienes una insignia nueva!» · «<Liga>: te llevas “<insignia>” por el 1.er lugar en
-- <torneo>. Tócala para verla.», tag 'insignia:<otorgamiento>'. Devuelve {added, revoked, unchanged, notified, prize}
-- (jugadores a los que se dio, a los que se quitó, que ya lo tenían, avisados; prize = private.prize_json).
create function public.deliver_tournament_prizes(p_prize uuid, p_podium jsonb, p_notify boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  z public.tournament_prizes;
  l public.leagues;
  s public.tournament_prize_slots;
  b public.league_badges;
  v_kind text;
  v_verified boolean;
  v_owner boolean;
  v_server jsonb := '{}'::jsonb;
  v_srv jsonb;
  v_srv_unit jsonb;
  v_seen uuid[] := '{}';
  v_total integer := 0;
  v_slot uuid;
  v_refs text[];
  v_ref text;
  v_ids uuid[];
  v_want uuid[];
  v_teams jsonb;
  v_tid uuid;
  v_name text;
  v_winners jsonb;
  v_have uuid[];
  v_add uuid[];
  v_drop uuid[];
  v_gone uuid[];
  v_new uuid[] := '{}';
  v_added integer := 0;
  v_revoked integer := 0;
  v_unchanged integer := 0;
  v_sent integer := 0;
  v_comp text;
  v_note text;
  x jsonb;
  u jsonb;
  k text;
  r record;
begin
  select * into z from public.tournament_prizes t where t.id = p_prize;
  if z.id is null then
    perform private.fail('no_existe');
  end if;
  if not (private.is_admin(z.league_id) or private.can_badges(z.league_id)) then
    perform private.deny();
  end if;
  if p_podium is null or jsonb_typeof(p_podium) <> 'array' or jsonb_array_length(p_podium) > 24 then
    perform private.fail('invalido');
  end if;
  select * into z from public.tournament_prizes t where t.id = p_prize for update;
  select * into l from public.leagues x2 where x2.id = z.league_id;
  if not private.rate_take(private.rate_key('premios'), 30, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  -- Una competencia que dejó de admitir premios (p. ej. el torneo pasó a práctica): solo se puede quitar.
  v_kind := private.prize_comp(z.league_id, z.scope, coalesce(z.event_id, z.golf_tournament_id, z.playoff_id));
  v_verified := coalesce(v_kind in ('bowling', 'racket_tourney', 'team_ko', 'playoff'), false);
  v_owner := private.is_owner(z.league_id);
  if v_verified then
    select coalesce(jsonb_object_agg(q.slot_id::text, jsonb_build_object('status', q.status, 'units', q.units)), '{}'::jsonb)
      into v_server from private.prize_server_podium(p_prize) q;
  end if;
  v_comp := private.prize_comp_name(p_prize);

  for x in select value from jsonb_array_elements(p_podium) loop
    -- Forma del lugar.
    if jsonb_typeof(x) <> 'object' or jsonb_typeof(x -> 'slot_id') is distinct from 'string'
       or jsonb_typeof(x -> 'units') is distinct from 'array' or jsonb_array_length(x -> 'units') > 3 then
      perform private.fail('invalido');
    end if;
    for k in select jsonb_object_keys(x) loop
      if k <> all (array['slot_id', 'units']) then
        perform private.fail('invalido');
      end if;
    end loop;
    v_slot := private.prize_uuid(x ->> 'slot_id');
    if v_slot is null or v_slot = any (v_seen) then
      perform private.fail('invalido');
    end if;
    v_seen := v_seen || v_slot;
    select * into s from public.tournament_prize_slots t where t.id = v_slot and t.prize_id = z.id for update;
    if s.id is null then
      perform private.fail('no_existe');
    end if;
    v_srv := v_server -> v_slot::text;
    -- Para dar hace falta que el lugar ya se pueda entregar (quitar se puede siempre).
    if jsonb_array_length(x -> 'units') > 0
       and ((v_verified and v_srv ->> 'status' is not distinct from 'sin_resultado')
            or (not v_verified and not private.prize_finished(p_prize, s.id))) then
      perform private.fail('sin_resultado');
    end if;

    -- Lo que se quiere: las unidades con sus jugadores.
    v_refs := '{}';
    v_want := '{}';
    v_teams := '{}'::jsonb;
    v_winners := '[]'::jsonb;
    for u in select value from jsonb_array_elements(x -> 'units') loop
      if jsonb_typeof(u) <> 'object' or jsonb_typeof(u -> 'ref') is distinct from 'string' or char_length(u ->> 'ref') > 80
         or jsonb_typeof(u -> 'players') is distinct from 'array' or jsonb_array_length(u -> 'players') not between 1 and 100
         or exists (select 1 from jsonb_array_elements(u -> 'players') e (v)
                     where jsonb_typeof(e.v) <> 'string' or private.prize_uuid(e.v #>> '{}') is null) then
        perform private.fail('invalido');
      end if;
      for k in select jsonb_object_keys(u) loop
        if k <> all (array['ref', 'name', 'teamId', 'players']) then
          perform private.fail('invalido');
        end if;
      end loop;
      v_ref := u ->> 'ref';
      if v_ref = any (v_refs) then
        perform private.fail('invalido');
      end if;
      v_refs := v_refs || v_ref;
      v_ids := array(select distinct (e.v #>> '{}')::uuid from jsonb_array_elements(u -> 'players') e (v));
      if cardinality(v_ids) <> jsonb_array_length(u -> 'players') or v_ids && v_want
         or (select count(*) from public.players p where p.id = any (v_ids) and p.league_id = z.league_id) <> cardinality(v_ids) then
        perform private.fail('invalido');
      end if;
      if v_verified then
        v_srv_unit := (select e.v from jsonb_array_elements(coalesce(v_srv -> 'units', '[]'::jsonb)) e (v) where e.v ->> 'ref' = v_ref limit 1);
        if v_srv_unit is null
           or not (v_ids <@ array(select (e.v ->> 'id')::uuid from jsonb_array_elements(v_srv_unit -> 'players') e (v))) then
          perform private.fail('podio_cambio');
        end if;
        v_tid := (v_srv_unit ->> 'teamId')::uuid;
        v_name := v_srv_unit ->> 'name';
      else
        if (s.category = 'equipo') <> (left(v_ref, 2) = 'c:')
           or (left(v_ref, 2) = 'p:' and v_ids <> array[private.prize_uuid(substr(v_ref, 3))])
           or not (v_ids <@ private.prize_unit_players(p_prize, v_ref)) then
          perform private.fail('invalido');
        end if;
        v_tid := null;
        v_name := case when left(v_ref, 2) = 'c:'
                       then (select c.name from public.swim_clubs c where c.id = private.prize_uuid(substr(v_ref, 3)))
                       else (select p.name from public.players p where p.id = v_ids[1]) end;
      end if;
      v_want := v_want || v_ids;
      if v_tid is not null then
        v_teams := v_teams || (select jsonb_object_agg(i::text, v_tid) from unnest(v_ids) i);
      end if;
      v_winners := v_winners || jsonb_build_array(jsonb_build_object('ref', v_ref, 'name', v_name, 'teamId', v_tid,
                                                                     'players', to_jsonb(v_ids)));
    end loop;
    v_total := v_total + cardinality(v_want);
    if v_total > 300 then
      perform private.fail('invalido');
    end if;
    if v_verified and cardinality(v_refs) > 0
       and (v_srv ->> 'status' is distinct from 'listo'
            or (select array_agg(e.v ->> 'ref' order by e.v ->> 'ref') from jsonb_array_elements(v_srv -> 'units') e (v))
               is distinct from (select array_agg(t.r order by t.r) from unnest(v_refs) t (r))) then
      perform private.fail('podio_cambio');
    end if;

    -- Lo que cambia (por jugadores, no por ref: un ref de jugador cambia con una fusión).
    v_have := array(select a.player_id from public.league_badge_awards a where a.prize_slot_id = s.id and a.revoked_at is null);
    v_add := array(select unnest(v_want) except select unnest(v_have));
    v_drop := array(select unnest(v_have) except select unnest(v_want));
    v_unchanged := v_unchanged + cardinality(v_want) - cardinality(v_add);
    if cardinality(v_add) + cardinality(v_drop) > 0 then
      if not v_owner and (z.closed_at is not null or s.delivered_at < now() - interval '14 days') then
        perform private.fail('cerrado');
      end if;
      if cardinality(v_add) > 0 then
        select * into b from public.league_badges d where d.id = s.badge_id for share;
        if b.status <> 'activa' then
          perform private.fail('no_activa');
        end if;
        if not v_verified and exists (select 1 from public.players p where p.id = any (v_add) and p.user_id = v_uid) then
          perform private.fail('a_si_mismo');
        end if;
      end if;
      if cardinality(v_drop) > 0 then
        with gone as (
          update public.league_badge_awards a
             set revoked_at = now(), revoked_by = v_uid, revoke_reason = 'Corrección del podio'
           where a.prize_slot_id = s.id and a.player_id = any (v_drop) and a.revoked_at is null
          returning a.id)
        select coalesce(array_agg(g.id), '{}'::uuid[]) into v_gone from gone g;
        delete from public.push_outbox o
         where o.tag = any (array(select 'insignia:' || g::text from unnest(v_gone) g))
           and o.sent_at is null and o.claimed_at is null;
        v_revoked := v_revoked + cardinality(v_gone);
      end if;
      if cardinality(v_add) > 0 then
        v_note := left(private.prize_place_label(s.place) || ' · ' || private.prize_slot_title(s) || ' · ' || v_comp, 140);
        with ins as (
          insert into public.league_badge_awards (badge_id, league_id, player_id, team_id, period, division, note, awarded_by,
                                                  prize_slot_id, prize_verified)
          select s.badge_id, z.league_id, a.pid, (v_teams ->> a.pid::text)::uuid, z.period, s.label, v_note, v_uid, s.id,
                 v_verified
            from unnest(v_add) a (pid)
          returning id)
        select v_new || coalesce(array_agg(i.id), '{}'::uuid[]) into v_new from ins i;
        v_added := v_added + cardinality(v_add);
      end if;
    end if;
    update public.tournament_prize_slots t
       set winners = v_winners,
           verified = v_verified,
           delivered_at = case when t.delivered_at is null and cardinality(v_want) > 0 then now() else t.delivered_at end,
           delivered_by = case when t.delivered_at is null and cardinality(v_want) > 0 then v_uid else t.delivered_by end
     where t.id = s.id
       and (t.winners is distinct from v_winners or t.verified is distinct from v_verified
            or (t.delivered_at is null and cardinality(v_want) > 0));
  end loop;

  if coalesce(p_notify, true) and not l.has_minors and cardinality(v_new) > 0 then
    for r in
      select a.id, p.user_id, d.name as badge, t.place
        from public.league_badge_awards a
        join public.players p on p.id = a.player_id
        join public.profiles pr on pr.id = p.user_id
        join public.league_badges d on d.id = a.badge_id
        join public.tournament_prize_slots t on t.id = a.prize_slot_id
       where a.id = any (v_new) and pr.blocked_at is null
       order by t.place, a.id
    loop
      insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
      values (r.user_id, '¡Tienes una insignia nueva!',
              left(l.name || ': te llevas “' || r.badge || '” por el ' || private.prize_place_label(r.place) || ' en '
                   || v_comp || '. Tócala para verla.', 1000),
              '/u/' || r.user_id::text || '?tab=insignias', 'insignia:' || r.id::text, 86400, 'normal');
      v_sent := v_sent + 1;
    end loop;
    if v_sent > 0 then
      perform private.kick_send_push();
    end if;
  end if;

  return jsonb_build_object('added', v_added, 'revoked', v_revoked, 'unchanged', v_unchanged, 'notified', v_sent,
                            'prize', private.prize_json(z.id));
end $$;

-- «Cerrar premios» antes de los 14 días (admin de la liga o quien diseña insignias): desde ahí solo el dueño corrige.
-- Ya cerrada: nada. No se reabre. 'no_existe', 'no_permitido'.
create function public.close_tournament_prizes(p_prize uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  z public.tournament_prizes;
begin
  select * into z from public.tournament_prizes t where t.id = p_prize;
  if z.id is null then
    perform private.fail('no_existe');
  end if;
  if not (private.is_admin(z.league_id) or private.can_badges(z.league_id)) then
    perform private.deny();
  end if;
  update public.tournament_prizes t set closed_at = now(), closed_by = v_uid where t.id = p_prize and t.closed_at is null;
end $$;

-- =====================================================================
-- Permisos: las RPC solo con sesión; las ayudas, nadie de la app
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array['set_tournament_prizes', 'tournament_podium', 'deliver_tournament_prizes', 'close_tournament_prizes'];
  v_private constant text[] := array[
    'emit_tournament_prizes', 'prize_uuid', 'prize_category_order', 'prize_place_label', 'prize_ref_exists', 'prize_comp',
    'prize_racket_doubles', 'prize_allowed', 'prize_default_label', 'prize_default_period', 'prize_comp_name',
    'prize_slot_title', 'prize_bowling_lines', 'prize_players_json', 'prize_bowling_rank', 'prize_match_at',
    'prize_match_winner', 'prize_decided_at', 'prize_side_unit', 'prize_team_unit', 'prize_racket_place',
    'prize_team_ko_place', 'prize_playoff_place', 'prize_server_podium', 'prize_unit_players', 'prize_finished', 'prize_json'];
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
