-- MatchMate · Temporadas con historia y campeones, playoffs con series y «¿Dónde juego esta semana?».
--
-- Hasta ahora la temporada era solo leagues.season_start/season_end: al cambiar las fechas la temporada anterior
-- desaparecía, y en baloncesto y fútbol los equipos de una temporada se mezclaban con los de la siguiente.
--
-- 1. public.seasons: las temporadas de cada liga ('active' | 'closed'; como mucho una activa). Toda liga nace con
--    la suya ('Temporada <año>', con las fechas de la liga; sin inicio, desde el día que se crea) y las ligas que ya
--    existían reciben una activa desde su season_start (sin inicio: desde lo primero que se jugó). Un juego es de la
--    temporada donde cae su día (evento: events.date; partido: scheduled_at, o created_at si no tiene hora, en la
--    zona de la liga): starts_on <= día y (la temporada está activa, o día <= ends_on). La activa no tiene fin para
--    contar juegos: su ends_on es el fin previsto (lo que se muestra); al cerrarla, ends_on queda en el día del
--    cierre. Las temporadas de una liga nunca se pisan. Lo jugado antes de la primera (juegos viejos, la
--    importación de BowlingX) nunca estira una temporada a otro año: si es del mismo año que la siguiente, esa
--    empieza ese día; si es de un año sin temporada, queda en una cerrada 'Temporada <año>' (1 ene – 31 dic, sin
--    tabla guardada: la calcula cada deporte con sus juegos). Cambiar las fechas de la liga (update_league) cambia
--    las de su temporada activa (el inicio no puede dejar fuera juegos ya jugados en ella); las cerradas no se tocan.
-- 2. teams.season_id: los equipos de temporada de las ligas de equipos (baloncesto, fútbol, sala) son de una
--    temporada (se llena solo al crearlos: la activa, o la última si no hay activa). Así una temporada nueva tiene
--    sus propios equipos. Las parejas de raqueta no llevan temporada (sirven de un año a otro).
-- 3. close_season (admin): guarda la tabla final que calculó el teléfono, los premios (public.season_awards:
--    campeón, subcampeón, tercero, MVP, más mejorado, fair play u otro con su nombre; a un jugador o a un equipo) y
--    manda un aviso a la liga como league_announce: «Terminó <temporada>: campeón <nombre>». Llamarla otra vez con
--    la temporada ya cerrada corrige la tabla y los premios sin volver a avisar.
--    start_season (admin): con la anterior cerrada (si hay una activa: 'invalido'), abre la nueva, pone sus fechas
--    en la liga y, con p_copy_teams, copia los equipos de la temporada anterior con sus plantillas.
--    league_seasons y league_champions: lecturas para quien ve la liga (también sin cuenta en una liga pública).
-- 4. Playoffs (baloncesto, fútbol, sala): public.playoffs (uno activo por temporada) y public.playoff_series (la
--    llave: ronda, lugar, los dos equipos con su siembra, al mejor de 1/3/5/7, victorias, ganador y a qué serie
--    pasa). create_playoffs arma la llave con la siembra estándar (1 contra el último; con pases directos si no es
--    potencia de 2) y programa el primer juego de cada serie (sin fecha ni hora: las pone el admin como en los
--    demás partidos). Los juegos son partidos normales con matches.series_id (y bracket_key 'PO<ronda>-<lugar>',
--    así el fútbol no los cuenta en la tabla). Cuando un juego de la serie queda con resultado que cuenta
--    (confirmado o W.O.; también a las 48 h: lo recoge sync_playoffs), se cuentan las victorias; si nadie ganó la
--    serie todavía, se programa el siguiente juego (local alterno: el mejor sembrado abre); si alguien llegó a
--    las que hacían falta, gana la serie y pasa a la siguiente (con su primer juego cuando se sabe el rival); el
--    ganador de la final queda como campeón del playoff (league_seasons lo propone para close_season).
-- 5. bowling_game_context: lo que hace falta para marcar «Récord personal» y «+15 sobre tu promedio» en tarjetas de
--    juegos de ligas que el teléfono no tiene guardadas (perfil). Las marcas las decide src/lib/stats.ts.
-- 6. public_agenda (con y sin cuenta): lo que viene en las ligas públicas sin menores donde uno se puede apuntar
--    (boliche con «Voy», rondas de golf abiertas, noches y torneos de raqueta con inscripción abierta y cupo).
--
-- Ojo: redefine (create or replace, mismos permisos) private.check_free_players (el jugador solo choca con otro
-- equipo de la MISMA temporada), private.claim_conflicts (igual), private.merge_players (pasa también premios y
-- tablas guardadas) y public.league_announce / public.league_announce_reach (el aviso automático de fin de
-- temporada, league_announcements.automatic, no cuenta para el tope diario). Un cambio a esas funciones en su
-- archivo original queda tapado por este.
--
-- Nadie escribe directo: todo por RPC. Tiempo real por private.emit a league:<liga>:
--   'seasons'  {op, ids: temporadas}   temporadas y sus premios
--   'playoffs' {op, ids: playoffs}     playoffs y sus series (los juegos avisan como cualquier partido)
-- El aviso de fin de temporada sale como los de league_announce ('announcements').

-- =====================================================================
-- Tablas
-- =====================================================================

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60 and btrim(name) <> ''),
  starts_on date not null,
  -- Fin previsto mientras está activa (null = sin fecha); al cerrarla, el día del cierre.
  ends_on date,
  status text not null default 'active' check (status in ('active', 'closed')),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  -- Tabla final (o tablas) que calculó el teléfono al cerrarla. Se guarda tal cual.
  standings jsonb check (standings is null or (jsonb_typeof(standings) in ('object', 'array') and pg_column_size(standings) < 262144)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, league_id),
  check (ends_on is null or ends_on >= starts_on),
  check ((status = 'closed') = (closed_at is not null))
);
create unique index seasons_one_active on public.seasons (league_id) where status = 'active';
create unique index seasons_start_idx on public.seasons (league_id, starts_on);
create index seasons_sync_idx on public.seasons (league_id, updated_at);

-- Premios de una temporada cerrada. El nombre queda copiado (la historia se sigue leyendo si se borra el jugador o
-- el equipo).
create table public.season_awards (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  league_id uuid not null,
  kind text not null check (kind in ('campeon', 'subcampeon', 'tercero', 'mvp', 'mas_mejorado', 'fair_play', 'otro')),
  -- Lo que se muestra: «Campeón», «MVP»… o el nombre del premio 'otro' («Mejor portero»).
  label text not null check (char_length(label) between 1 and 40 and btrim(label) <> ''),
  player_id uuid,
  team_id uuid,
  name text not null check (char_length(name) between 1 and 80),
  note text check (char_length(note) <= 200),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (season_id, league_id) references public.seasons (id, league_id) on delete cascade,
  foreign key (player_id, league_id) references public.players (id, league_id) on delete set null (player_id),
  foreign key (team_id, league_id) references public.teams (id, league_id) on delete set null (team_id),
  check (player_id is null or team_id is null)
);
create index season_awards_season_idx on public.season_awards (season_id);
create index season_awards_player_idx on public.season_awards (player_id);
create index season_awards_team_idx on public.season_awards (team_id);
create index season_awards_sync_idx on public.season_awards (league_id, updated_at);

-- Equipos de temporada de las ligas de equipos: de qué temporada son.
alter table public.teams add column season_id uuid;
alter table public.teams add constraint teams_season_fk
  foreign key (season_id, league_id) references public.seasons (id, league_id) on delete set null (season_id);
alter table public.teams add constraint teams_season_only_season_teams check (season_id is null or event_id is null);
create index teams_season_id_idx on public.teams (season_id) where season_id is not null;

-- Playoffs de una temporada (uno activo a la vez).
create table public.playoffs (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_id uuid not null,
  name text not null default 'Playoffs' check (char_length(name) between 1 and 60 and btrim(name) <> ''),
  status text not null default 'active' check (status in ('active', 'finished')),
  -- Al mejor de cuántos juegos cada ronda (de la primera a la final).
  best_of smallint[] not null check (array_ndims(best_of) = 1 and cardinality(best_of) between 1 and 5),
  -- Equipos en orden de siembra (1.º = el mejor).
  seeds uuid[] not null check (array_ndims(seeds) = 1 and cardinality(seeds) between 2 and 32),
  -- Campeón: el ganador de la final.
  winner uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, league_id),
  foreign key (season_id, league_id) references public.seasons (id, league_id) on delete cascade,
  foreign key (winner, league_id) references public.teams (id, league_id) on delete set null (winner)
);
create unique index playoffs_one_active on public.playoffs (season_id) where status = 'active';
create index playoffs_sync_idx on public.playoffs (league_id, updated_at);

-- Cada serie de la llave. Lugar (slot) desde 1 dentro de la ronda; el ganador pasa a next_series por el lado
-- next_side ('a' desde un lugar impar, 'b' desde uno par).
create table public.playoff_series (
  id uuid primary key default gen_random_uuid(),
  playoff_id uuid not null,
  league_id uuid not null,
  round smallint not null check (round between 1 and 5),
  slot smallint not null check (slot between 1 and 16),
  best_of smallint not null check (best_of in (1, 3, 5, 7)),
  team_a uuid,
  team_b uuid,
  seed_a smallint check (seed_a between 1 and 32),
  seed_b smallint check (seed_b between 1 and 32),
  -- Nombres copiados (la llave se sigue leyendo si se borra un equipo).
  label_a text check (char_length(label_a) <= 80),
  label_b text check (char_length(label_b) <= 80),
  wins_a smallint not null default 0 check (wins_a >= 0),
  wins_b smallint not null default 0 check (wins_b >= 0),
  winner uuid,
  -- Pase directo (primera ronda sin rival): gana sin jugar.
  bye boolean not null default false,
  next_series uuid,
  next_side text check (next_side in ('a', 'b')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, league_id),
  unique (playoff_id, round, slot),
  foreign key (playoff_id, league_id) references public.playoffs (id, league_id) on delete cascade,
  foreign key (team_a, league_id) references public.teams (id, league_id) on delete set null (team_a),
  foreign key (team_b, league_id) references public.teams (id, league_id) on delete set null (team_b),
  foreign key (winner, league_id) references public.teams (id, league_id) on delete set null (winner)
);
create index playoff_series_playoff_idx on public.playoff_series (playoff_id);
create index playoff_series_team_a_idx on public.playoff_series (team_a);
create index playoff_series_team_b_idx on public.playoff_series (team_b);
create index playoff_series_sync_idx on public.playoff_series (league_id, updated_at);

-- Avisos que manda la app sola (fin de temporada): salen en el historial como los demás pero no cuentan para el
-- tope diario del admin (league_announce).
alter table public.league_announcements add column automatic boolean not null default false;

-- Juegos de una serie. Si se borra el playoff, los juegos ya jugados se quedan (sin serie).
alter table public.matches add column series_id uuid;
alter table public.matches add constraint matches_series_fk
  foreign key (series_id, league_id) references public.playoff_series (id, league_id) on delete set null (series_id);
create index matches_series_idx on public.matches (series_id) where series_id is not null;

-- =====================================================================
-- Temporada de las ligas que ya existen (antes de los triggers)
-- =====================================================================
-- Una activa por liga, con sus fechas: empieza en season_start (sin inicio: lo primero que se jugó; sin nada, el día
-- que se creó la liga) y termina (previsto) en season_end. Lo jugado antes de ese día se acomoda más abajo, cuando
-- ya existe private.season_cover (el mismo año: en la activa; otro año: en una cerrada de ese año).
insert into public.seasons (league_id, name, starts_on, ends_on)
select l.id, 'Temporada ' || to_char(x.d, 'YYYY'), x.d, case when l.season_end >= x.d then l.season_end end
  from public.leagues l
  cross join lateral (
    select coalesce(
             l.season_start,
             least((select min(e.date) from public.events e where e.league_id = l.id),
                   (select min((coalesce(m.scheduled_at, m.created_at) at time zone l.tz)::date) from public.matches m where m.league_id = l.id)),
             (l.created_at at time zone l.tz)::date) as d
  ) x
 where not exists (select 1 from public.seasons s where s.league_id = l.id);

-- Los equipos de temporada de las ligas de equipos que ya existen son de esa temporada.
update public.teams t set season_id = s.id
  from public.seasons s
 where s.league_id = t.league_id and s.status = 'active'
   and t.event_id is null and t.season_id is null
   and private.league_family(t.league_id) = 'team';

-- =====================================================================
-- Funciones de ayuda
-- =====================================================================

-- Temporada activa de la liga (null entre temporadas: se cerró y no ha empezado la siguiente).
create function private.active_season(p_league uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.seasons s where s.league_id = p_league and s.status = 'active'
$$;

-- La temporada de ahora: la activa o, entre temporadas, la última.
create function private.current_season(p_league uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.seasons s where s.league_id = p_league order by (s.status = 'active') desc, s.starts_on desc limit 1
$$;

-- Un juego del día p_day que no cae en ninguna temporada: si es del mismo año que la temporada siguiente (y ese año
-- no tiene otra antes), esa empieza ese día; si su año no tiene temporada, queda en una cerrada 'Temporada <año>'
-- (1 ene – 31 dic, sin tabla guardada). Nunca estira una temporada a otro año. Un día entre dos temporadas del
-- mismo año (se cerró una y la otra empezó después), o después de la última cerrada, queda sin temporada: esas
-- fechas las eligió el admin.
create function private.season_cover(p_league uuid, p_day date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_jan date := make_date(extract(year from p_day)::integer, 1, 1);
  v_dec date := make_date(extract(year from p_day)::integer, 12, 31);
  v_next public.seasons;
begin
  if p_league is null or p_day is null then
    return;
  end if;
  if exists (select 1 from public.seasons s
              where s.league_id = p_league and s.starts_on <= p_day and (s.status = 'active' or s.ends_on is null or p_day <= s.ends_on)) then
    return;
  end if;
  -- Dos juegos viejos a la vez de la misma liga esperan uno al otro (no arman dos veces la misma temporada).
  perform pg_advisory_xact_lock(hashtext('mm:season_cover:' || p_league::text));
  if exists (select 1 from public.seasons s
              where s.league_id = p_league and s.starts_on <= p_day and coalesce(s.ends_on, p_day) >= v_jan) then
    return;
  end if;
  select * into v_next from public.seasons s where s.league_id = p_league and s.starts_on > p_day order by s.starts_on limit 1;
  if not found then
    return;
  end if;
  if v_next.starts_on <= v_dec then
    update public.seasons s set starts_on = p_day where s.id = v_next.id;
  else
    insert into public.seasons (league_id, name, starts_on, ends_on, status, closed_at)
    values (p_league, 'Temporada ' || to_char(p_day, 'YYYY'), v_jan, v_dec, 'closed', now());
  end if;
end $$;

-- Nombre de la ronda del playoff (como roundName de src/sports/formats/knockout.ts).
create function private.playoff_round_name(p_round integer, p_rounds integer) returns text
language sql immutable set search_path = '' as $$
  select case p_rounds - p_round
    when 0 then 'Final'
    when 1 then 'Semifinal'
    when 2 then 'Cuartos de final'
    when 3 then 'Octavos de final'
    else 'Ronda de ' || (2 ^ (p_rounds - p_round + 1))::integer::text
  end
$$;

-- Orden estándar de siembra en la llave (seedOrder de knockout.ts): 8 → {1, 8, 4, 5, 2, 7, 3, 6}.
create function private.seed_order(p_size integer) returns integer[]
language plpgsql immutable set search_path = '' as $$
declare
  v integer[] := array[1];
  n integer;
begin
  while cardinality(v) < p_size loop
    n := cardinality(v) * 2;
    v := array(select b.y from unnest(v) with ordinality as a (s, i), lateral (values (a.s, 1), (n + 1 - a.s, 2)) as b (y, k)
                order by a.i, b.k);
  end loop;
  return v;
end $$;

-- Formato de los juegos del playoff: el del último partido de la liga (o el de su deporte).
create function private.playoff_format(p_league uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select m.format from public.matches m
      where m.league_id = p_league and m.series_id is null and m.format <> ''
      order by m.created_at desc, m.id limit 1),
    (select case when l.sport = 'basketball'
                 then case when l.rules #>> '{match,variant}' = '3x3' then '3x3' else 'fiba' end
                 else l.sport end
       from public.leagues l where l.id = p_league))
$$;

-- Lo que las ligas que ya existían jugaron antes de su temporada activa (arriba): el primer día de cada año, como
-- si se anotara ahora (antes de los triggers de tiempo real: no avisa nada).
do $$
declare
  r record;
begin
  for r in
    select x.league_id, min(x.d) as d
      from (select e.league_id, e.date as d from public.events e
            union all
            select m.league_id, (coalesce(m.scheduled_at, m.created_at) at time zone l.tz)::date
              from public.matches m join public.leagues l on l.id = m.league_id) x
     group by x.league_id, extract(year from x.d)
     order by x.league_id, min(x.d)
  loop
    perform private.season_cover(r.league_id, r.d);
  end loop;
end $$;

-- =====================================================================
-- Triggers
-- =====================================================================

create trigger seasons_touch before update on public.seasons for each row execute function private.touch_updated_at();
create trigger season_awards_touch before update on public.season_awards for each row execute function private.touch_updated_at();
create trigger playoffs_touch before update on public.playoffs for each row execute function private.touch_updated_at();
create trigger playoff_series_touch before update on public.playoff_series for each row execute function private.touch_updated_at();

create trigger seasons_tombstone after delete on public.seasons for each row execute function private.tombstone('id');
create trigger season_awards_tombstone after delete on public.season_awards for each row execute function private.tombstone('id');
create trigger playoffs_tombstone after delete on public.playoffs for each row execute function private.tombstone('id');
create trigger playoff_series_tombstone after delete on public.playoff_series for each row execute function private.tombstone('id');

-- Liga nueva: su primera temporada, activa, con las fechas de la liga (sin inicio: desde el día que se crea).
create function private.season_on_league() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_day date := coalesce(new.season_start, (new.created_at at time zone new.tz)::date);
begin
  insert into public.seasons (league_id, name, starts_on, ends_on)
  values (new.id, 'Temporada ' || to_char(v_day, 'YYYY'), v_day, case when new.season_end >= v_day then new.season_end end);
  return null;
end $$;

create trigger leagues_first_season after insert on public.leagues for each row execute function private.season_on_league();

-- Cambiar las fechas de la liga (update_league) cambia las de su temporada activa. Sin inicio: se queda el que
-- tenía; un fin antes del inicio no sirve (queda sin fin). No puede empezar antes de que termine la anterior, ni
-- después de un juego que ya es de ella (quedaría sin temporada: para eso se cierra y se empieza otra). Los dos
-- fallan con 'invalido: temporada'. start_season ya las deja iguales (mm.season_sync = 'off').
create function private.season_follow_league() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s public.seasons;
  v_start date;
  v_end date;
begin
  if coalesce(current_setting('mm.season_sync', true), '') = 'off' then
    return null;
  end if;
  select * into s from public.seasons x where x.league_id = new.id and x.status = 'active' for update;
  if not found then
    return null;
  end if;
  v_start := case when new.season_start is distinct from old.season_start then coalesce(new.season_start, s.starts_on) else s.starts_on end;
  v_end := case when new.season_end is distinct from old.season_end then new.season_end else s.ends_on end;
  if v_end < v_start then
    v_end := null;
  end if;
  if exists (select 1 from public.seasons p
              where p.league_id = new.id and p.id <> s.id and (p.starts_on >= v_start or p.ends_on >= v_start)) then
    raise exception 'invalido: temporada' using errcode = 'P0001', detail = 'La temporada no puede empezar antes de que termine la anterior.';
  end if;
  if v_start > s.starts_on
     and (exists (select 1 from public.events e where e.league_id = new.id and e.date >= s.starts_on and e.date < v_start)
          or exists (select 1 from public.matches m
                      where m.league_id = new.id
                        and (coalesce(m.scheduled_at, m.created_at) at time zone new.tz)::date >= s.starts_on
                        and (coalesce(m.scheduled_at, m.created_at) at time zone new.tz)::date < v_start)) then
    raise exception 'invalido: temporada' using errcode = 'P0001',
      detail = 'Ya hay juegos de la temporada antes de esa fecha. Para empezar otra: Cerrar temporada y Nueva temporada.';
  end if;
  update public.seasons x set starts_on = v_start, ends_on = v_end
   where x.id = s.id and (x.starts_on, x.ends_on) is distinct from (v_start, v_end);
  return null;
end $$;

create trigger leagues_season_dates after update of season_start, season_end on public.leagues for each row
  when (new.season_start is distinct from old.season_start or new.season_end is distinct from old.season_end)
  execute function private.season_follow_league();

-- Eventos y partidos con fecha fuera de las temporadas (private.season_cover): el primer día de cada año de lo que
-- se anotó (con él, los demás días de ese año quedan donde les toca).
create function private.season_cover_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in select n.league_id, min(n.date) as d from new_rows n group by n.league_id, extract(year from n.date) order by 1, 2 loop
    perform private.season_cover(r.league_id, r.d);
  end loop;
  return null;
end $$;

create function private.season_cover_matches() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in select x.league_id, min(x.d) as d
             from (select n.league_id, (coalesce(n.scheduled_at, n.created_at) at time zone l.tz)::date as d
                     from new_rows n join public.leagues l on l.id = n.league_id) x
            group by x.league_id, extract(year from x.d) order by 1, 2 loop
    perform private.season_cover(r.league_id, r.d);
  end loop;
  return null;
end $$;

create function private.season_cover_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'events' then
    perform private.season_cover(new.league_id, new.date);
  else
    perform private.season_cover(new.league_id,
      (new.scheduled_at at time zone (select l.tz from public.leagues l where l.id = new.league_id))::date);
  end if;
  return null;
end $$;

create trigger events_season_cover after insert on public.events referencing new table as new_rows
  for each statement execute function private.season_cover_events();
create trigger events_season_cover_date after update of date on public.events for each row
  when (new.date is distinct from old.date)
  execute function private.season_cover_row();
create trigger matches_season_cover after insert on public.matches referencing new table as new_rows
  for each statement execute function private.season_cover_matches();
create trigger matches_season_cover_date after update of scheduled_at on public.matches for each row
  when (new.scheduled_at is not null and new.scheduled_at is distinct from old.scheduled_at)
  execute function private.season_cover_row();

-- Equipo de temporada nuevo en una liga de equipos: de la temporada de ahora (si no dice otra).
create function private.team_season_fill() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.event_id is null and new.season_id is null and private.league_family(new.league_id) = 'team' then
    new.season_id := private.current_season(new.league_id);
  end if;
  return new;
end $$;

create trigger teams_season_fill before insert on public.teams for each row execute function private.team_season_fill();

-- Tiempo real: league:<liga> tg_argv[0] {op, ids} con los ids de la columna tg_argv[1] (una vez por sentencia).
-- tg_argv[2]: la operación que se avisa siempre (los premios cambian la temporada: 'update').
create function private.emit_league_rows() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_event text := tg_argv[0];
  v_col text := tg_argv[1];
  v_op text := coalesce(tg_argv[2], lower(tg_op));
begin
  if tg_op = 'DELETE' then
    for r in select o.league_id, jsonb_agg(distinct to_jsonb(o) -> v_col) as ids from old_rows o group by o.league_id loop
      if not private.deleting(r.league_id) then
        perform private.emit('league:' || r.league_id::text, v_event, jsonb_build_object('op', v_op, 'ids', r.ids));
      end if;
    end loop;
  else
    for r in select n.league_id, jsonb_agg(distinct to_jsonb(n) -> v_col) as ids from new_rows n group by n.league_id loop
      perform private.emit('league:' || r.league_id::text, v_event, jsonb_build_object('op', v_op, 'ids', r.ids));
    end loop;
  end if;
  return null;
end $$;

create trigger seasons_emit_insert after insert on public.seasons referencing new table as new_rows
  for each statement execute function private.emit_league_rows('seasons', 'id');
create trigger seasons_emit_update after update on public.seasons referencing new table as new_rows
  for each statement execute function private.emit_league_rows('seasons', 'id');
create trigger seasons_emit_delete after delete on public.seasons referencing old table as old_rows
  for each statement execute function private.emit_league_rows('seasons', 'id');
create trigger season_awards_emit_insert after insert on public.season_awards referencing new table as new_rows
  for each statement execute function private.emit_league_rows('seasons', 'season_id', 'update');
create trigger season_awards_emit_update after update on public.season_awards referencing new table as new_rows
  for each statement execute function private.emit_league_rows('seasons', 'season_id', 'update');
create trigger season_awards_emit_delete after delete on public.season_awards referencing old table as old_rows
  for each statement execute function private.emit_league_rows('seasons', 'season_id', 'update');
create trigger playoffs_emit_insert after insert on public.playoffs referencing new table as new_rows
  for each statement execute function private.emit_league_rows('playoffs', 'id');
create trigger playoffs_emit_update after update on public.playoffs referencing new table as new_rows
  for each statement execute function private.emit_league_rows('playoffs', 'id');
create trigger playoffs_emit_delete after delete on public.playoffs referencing old table as old_rows
  for each statement execute function private.emit_league_rows('playoffs', 'id');
create trigger playoff_series_emit_insert after insert on public.playoff_series referencing new table as new_rows
  for each statement execute function private.emit_league_rows('playoffs', 'playoff_id', 'update');
create trigger playoff_series_emit_update after update on public.playoff_series referencing new table as new_rows
  for each statement execute function private.emit_league_rows('playoffs', 'playoff_id', 'update');

-- =====================================================================
-- RLS: lo ve quien ve la liga (solo lectura; se escribe por RPC)
-- =====================================================================

alter table public.seasons enable row level security;
alter table public.season_awards enable row level security;
alter table public.playoffs enable row level security;
alter table public.playoff_series enable row level security;

create policy seasons_read on public.seasons for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy season_awards_read on public.season_awards for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy playoffs_read on public.playoffs for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy playoff_series_read on public.playoff_series for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));

revoke all on public.seasons, public.season_awards, public.playoffs, public.playoff_series from public, anon, authenticated;
grant select on public.seasons, public.season_awards, public.playoffs, public.playoff_series to anon, authenticated;

-- =====================================================================
-- Equipos por temporada y reclamos (redefinidas: la última versión, con la temporada)
-- =====================================================================

-- Capitán o delegado: no suma a la plantilla a quien ya está en otro equipo de temporada de la liga EN LA MISMA
-- TEMPORADA (le rompería la convocatoria y su lado en los partidos de los dos, y se saltaría el tope de refuerzos).
-- Lo cambia el admin. Los que ya están en este equipo no cuentan (se les puede cambiar dorsal o posición).
create or replace function private.check_free_players(p_team uuid, p_league uuid, p_players uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from unnest(p_players) as n (player_id)
               join public.team_players tp on tp.player_id = n.player_id and tp.league_id = p_league and tp.team_id <> p_team
               join public.teams t on t.id = tp.team_id and t.event_id is null
                and t.season_id is not distinct from (select x.season_id from public.teams x where x.id = p_team)
              where not exists (select 1 from public.team_players x where x.team_id = p_team and x.player_id = n.player_id)) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Ese jugador ya está en otro equipo de la liga. Lo cambia el admin.';
  end if;
end $$;

-- Lo que chocaría al juntar p_from con p_into: los dos en el mismo evento, partido, ronda, prueba o escalera, o
-- (baloncesto y fútbol) en equipos distintos de la misma temporada, donde cada jugador es de un solo equipo.
-- [{what, label, count}] (vacío = se pueden juntar).
create or replace function private.claim_conflicts(p_from uuid, p_into uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('what', x.what, 'label', x.label, 'count', x.n) order by x.ord), '[]'::jsonb)
    from (
      select 1 as ord, 'entries' as what, 'Juegos en el mismo evento' as label, count(*) as n
        from public.entries a join public.entries c on c.event_id = a.event_id
       where a.player_id = p_from and c.player_id = p_into
      union all
      select 2, 'matches', 'Partidos donde juegan los dos', count(*)
        from public.match_players a join public.match_players c on c.match_id = a.match_id
       where a.player_id = p_from and c.player_id = p_into
      union all
      select 3, 'golf_cards', 'Tarjetas de golf de la misma ronda', count(*)
        from public.golf_cards a join public.golf_cards c on c.event_id = a.event_id
       where a.player_id = p_from and c.player_id = p_into
      union all
      select 4, 'swim_entries', 'La misma prueba de natación', count(*)
        from public.swim_entries a join public.swim_entries c on c.swim_event_id = a.swim_event_id
       where a.player_id = p_from and c.player_id = p_into
      union all
      select 5, 'ladder_rungs', 'La misma escalera', count(*)
        from public.ladder_rungs a join public.ladder_rungs c on c.event_id = a.event_id
       where a.player_id = p_from and c.player_id = p_into
      union all
      select 6, 'event_signups', 'Inscritos en el mismo evento', count(*)
        from public.event_signups a join public.event_signups c on c.event_id = a.event_id
       where a.player_id = p_from and c.player_id = p_into
      union all
      select 7, 'team_players', 'Equipos distintos de la temporada', count(*)
        from public.team_players a
        join public.teams ta on ta.id = a.team_id and ta.event_id is null
        join public.team_players c on c.league_id = a.league_id and c.team_id <> a.team_id and c.player_id = p_into
        join public.teams tc on tc.id = c.team_id and tc.event_id is null and tc.season_id is not distinct from ta.season_id
       where a.player_id = p_from
         and not exists (select 1 from public.team_players x where x.team_id = a.team_id and x.player_id = p_into)
         and private.league_family(a.league_id) = 'team'
    ) x
   where x.n > 0
$$;

-- Pasa todo lo de p_from (el jugador propio de la cuenta) a p_into (el reclamado) y borra p_from. Si algo choca,
-- 'conflicto: <qué>' y no cambia nada. Al final revisa en el catálogo que ninguna tabla con FK a players quede
-- apuntando a p_from (una tabla nueva que no esté aquí frena la unión en vez de perder datos al borrarlo).
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
  -- «Voy» y en vivo: si los dos tienen, queda el del reclamado.
  delete from public.event_rsvps a where a.player_id = p_from
     and exists (select 1 from public.event_rsvps c where c.event_id = a.event_id and c.player_id = p_into);
  update public.event_rsvps r set player_id = p_into where r.player_id = p_from;
  delete from public.live_states a where a.player_id = p_from
     and exists (select 1 from public.live_states c where c.event_id = a.event_id and c.player_id = p_into);
  update public.live_states s set player_id = p_into, subject_key = 'p:' || v_into where s.player_id = p_from;
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
  -- Temporadas: premios y las tablas guardadas al cerrar.
  update public.season_awards x set player_id = p_into where x.player_id = p_from;
  update public.seasons s set standings = replace(s.standings::text, v_from, v_into)::jsonb
   where s.league_id = p_league and s.standings::text like '%' || v_from || '%';
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

-- =====================================================================
-- Avisos (redefinidas: la última versión, sin contar los automáticos para el tope diario)
-- =====================================================================

-- Admin: aviso push a toda la liga. Ver el encabezado de 20260927001300_liga.sql.
create or replace function public.league_announce(p_league uuid, p_body text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_body text := btrim(replace(coalesce(p_body, ''), E'\r\n', E'\n'), E' \t\n');
  l public.leagues;
  v_day date;
  v_users uuid[];
  v_n integer;
  v_id uuid := gen_random_uuid();
  v_author text;
begin
  perform private.require_admin(p_league);
  select * into l from public.leagues x where x.id = p_league;
  if l.id is null then
    perform private.fail('no_existe');
  end if;
  -- Texto de una línea o varias, sin caracteres de control (salvo el salto de línea).
  if char_length(v_body) not between 1 and 180 or replace(v_body, E'\n', '') ~ '[[:cntrl:]]' then
    perform private.fail('invalido');
  end if;
  -- Dos avisos a la vez de la misma liga esperan uno al otro: la cuenta del día es exacta.
  perform pg_advisory_xact_lock(hashtext('mm:league_announce:' || p_league::text));
  v_day := (now() at time zone l.tz)::date;
  if (select count(*) from public.league_announcements a where a.league_id = p_league and a.local_day = v_day and not a.automatic)
     >= private.announce_daily_limit() then
    perform private.fail('rate_limited');
  end if;
  v_author := coalesce(
    (select m.display_name from public.league_members m where m.league_id = p_league and m.user_id = v_uid),
    (select p.name from public.profiles p where p.id = v_uid),
    '');
  v_users := array(select u from private.league_announce_users(p_league, v_uid) u);
  v_n := coalesce(cardinality(v_users), 0);
  -- Una fila por cuenta; el trigger push_outbox_fanout la reparte a sus teléfonos. Urgente y vale 12 horas
  -- («se suspende hoy» no sirve al día siguiente). El tag es del aviso: dos avisos no se pisan en el teléfono.
  insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
  select u, l.name, v_body, '/l/' || p_league::text, 'aviso:' || v_id::text, 43200, 'high'
    from unnest(v_users) u;
  insert into public.league_announcements (id, league_id, body, sent_by, author_name, recipients, local_day)
  values (v_id, p_league, v_body, v_uid, left(v_author, 60), v_n, v_day);
  perform private.emit('league:' || p_league::text, 'announcements', jsonb_build_object('op', 'insert', 'ids', jsonb_build_array(v_id)));
  -- Que salga ya (sin esperar la vuelta del cron). En PGlite no hace nada.
  if v_n > 0 then
    perform private.kick_send_push();
  end if;
  return v_n;
end $$;

-- Admin: antes de mandar, a cuántos llega y cuántos avisos quedan hoy (sin los automáticos).
-- {members, reach, sentToday, dailyLimit}
create or replace function public.league_announce_reach(p_league uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  l public.leagues;
begin
  perform private.require_admin(p_league);
  select * into l from public.leagues x where x.id = p_league;
  if l.id is null then
    perform private.fail('no_existe');
  end if;
  return jsonb_build_object(
    'members', (select count(*) from public.league_members m where m.league_id = p_league)::integer,
    'reach', (select count(*) from private.league_announce_users(p_league, v_uid))::integer,
    'sentToday', (select count(*) from public.league_announcements a
                   where a.league_id = p_league and a.local_day = (now() at time zone l.tz)::date and not a.automatic)::integer,
    'dailyLimit', private.announce_daily_limit());
end $$;

-- =====================================================================
-- RPC: temporadas
-- =====================================================================

-- Admin: cierra la temporada. p_standings = la tabla final que calculó el teléfono (objeto o lista, tal cual).
-- p_awards = [{kind, label?, player_id? | team_id?, note?}] (hasta 30; uno solo 'campeon'): kind 'campeon' |
-- 'subcampeon' | 'tercero' | 'mvp' | 'mas_mejorado' | 'fair_play' | 'otro' (este con label, 1–40); label cambia el
-- nombre del premio (si no, «Campeón», «Subcampeón», «Tercer lugar», «MVP», «Más mejorado», «Fair play»); a un
-- jugador o a un equipo de la liga (uno de los dos); note hasta 200. Estaba activa: queda cerrada (ends_on = el día
-- del cierre en la zona de la liga) y sale el aviso a la liga («Terminó <temporada>: campeón <nombre>», con push a
-- los miembros con avisos, como league_announce; automático: no cuenta para su tope). Ya cerrada: reemplaza la
-- tabla y los premios, sin avisar otra vez.
create function public.close_season(p_season uuid, p_standings jsonb, p_awards jsonb default '[]') returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  s public.seasons;
  l public.leagues;
  a jsonb;
  n bigint;
  v_awards jsonb := coalesce(nullif(p_awards, 'null'::jsonb), '[]'::jsonb);
  v_kind text;
  v_player uuid;
  v_team uuid;
  v_name text;
  v_label text;
  v_note text;
  v_champion text;
  v_rows jsonb := '[]'::jsonb;
  v_today date;
  v_body text;
  v_users uuid[];
  v_n integer;
  v_id uuid := gen_random_uuid();
begin
  select * into s from public.seasons x where x.id = p_season for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(s.league_id);
  select * into l from public.leagues x where x.id = s.league_id;
  if p_standings is null or jsonb_typeof(p_standings) not in ('object', 'array') then
    perform private.fail('invalido');
  end if;
  if jsonb_typeof(v_awards) <> 'array' or jsonb_array_length(v_awards) > 30 then
    perform private.fail('invalido');
  end if;
  -- Primero se revisa todo (nada se escribe con un premio malo).
  for a, n in select x, i from jsonb_array_elements(v_awards) with ordinality as t (x, i) loop
    if jsonb_typeof(a) <> 'object' then
      perform private.fail('invalido');
    end if;
    v_kind := a ->> 'kind';
    if v_kind is null or v_kind not in ('campeon', 'subcampeon', 'tercero', 'mvp', 'mas_mejorado', 'fair_play', 'otro') then
      perform private.fail('invalido');
    end if;
    v_player := nullif(a ->> 'player_id', '')::uuid;
    v_team := nullif(a ->> 'team_id', '')::uuid;
    if num_nonnulls(v_player, v_team) <> 1 then
      perform private.fail('invalido');
    end if;
    if v_player is not null then
      v_name := (select p.name from public.players p where p.id = v_player and p.league_id = s.league_id);
    else
      v_name := (select t.name from public.teams t where t.id = v_team and t.league_id = s.league_id);
    end if;
    if v_name is null then
      perform private.fail('invalido');
    end if;
    v_label := coalesce(nullif(btrim(coalesce(a ->> 'label', '')), ''), case v_kind
      when 'campeon' then 'Campeón' when 'subcampeon' then 'Subcampeón' when 'tercero' then 'Tercer lugar'
      when 'mvp' then 'MVP' when 'mas_mejorado' then 'Más mejorado' when 'fair_play' then 'Fair play' end);
    v_note := nullif(btrim(coalesce(a ->> 'note', '')), '');
    if v_label is null or char_length(v_label) > 40 or char_length(v_note) > 200 then
      perform private.fail('invalido');
    end if;
    if v_kind = 'campeon' then
      if v_champion is not null then
        perform private.fail('invalido');
      end if;
      v_champion := v_name;
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'kind', v_kind, 'label', v_label, 'player_id', v_player, 'team_id', v_team, 'name', left(v_name, 80), 'note', v_note, 'n', n));
  end loop;

  v_today := private.signup_today(s.league_id);
  update public.seasons x set
    status = 'closed',
    closed_at = coalesce(x.closed_at, now()),
    closed_by = case when x.status = 'active' then v_uid else x.closed_by end,
    ends_on = case when x.status = 'active' then greatest(x.starts_on, v_today) else x.ends_on end,
    standings = p_standings
  where x.id = p_season;
  delete from public.season_awards x where x.season_id = p_season;
  insert into public.season_awards (season_id, league_id, kind, label, player_id, team_id, name, note, sort_order)
  select p_season, s.league_id, r ->> 'kind', r ->> 'label', (r ->> 'player_id')::uuid, (r ->> 'team_id')::uuid, r ->> 'name',
         r ->> 'note', (r ->> 'n')::smallint
    from jsonb_array_elements(v_rows) r;

  if s.status = 'active' then
    -- El aviso a la liga, como league_announce (historial, push a los miembros con avisos y tiempo real).
    v_body := left('Terminó ' || s.name || coalesce(': campeón ' || v_champion, ''), 180);
    v_users := array(select u from private.league_announce_users(s.league_id, v_uid) u);
    v_n := coalesce(cardinality(v_users), 0);
    insert into public.push_outbox (user_id, title, body, url, tag, ttl)
    select u, l.name, v_body, '/l/' || s.league_id::text || '/temporadas', 'temporada:' || p_season::text, 86400
      from unnest(v_users) u;
    insert into public.league_announcements (id, league_id, body, sent_by, author_name, recipients, local_day, automatic)
    values (v_id, s.league_id, v_body, v_uid,
            left(coalesce((select m.display_name from public.league_members m where m.league_id = s.league_id and m.user_id = v_uid),
                          (select p.name from public.profiles p where p.id = v_uid), ''), 60),
            v_n, v_today, true);
    perform private.emit('league:' || s.league_id::text, 'announcements', jsonb_build_object('op', 'insert', 'ids', jsonb_build_array(v_id)));
    if v_n > 0 then
      perform private.kick_send_push();
    end if;
  end if;
end $$;

-- Admin: empieza una temporada. Si hay una activa: 'invalido' (primero se cierra con close_season). p_name 1–60;
-- p_starts_on obligatorio y después de que terminó la anterior (la cerrada no se toca: sus juegos siguen siendo
-- suyos); p_ends_on (fin previsto) null o desde p_starts_on. Pone las fechas en la liga (season_start/season_end).
-- p_copy_teams (ligas de equipos): copia los equipos de la temporada anterior con su plantilla (dorsal, posición y
-- rol). Devuelve el id de la temporada.
create function public.start_season(p_league uuid, p_name text, p_starts_on date, p_ends_on date default null, p_copy_teams boolean default false)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_prev public.seasons;
  v_id uuid := gen_random_uuid();
  v_old uuid[];
  v_new uuid[];
begin
  perform private.require_admin(p_league);
  -- La liga bloqueada: dos temporadas a la vez de la misma liga esperan una a la otra.
  perform 1 from public.leagues l where l.id = p_league for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  if private.active_season(p_league) is not null then
    perform private.fail('invalido');
  end if;
  if p_starts_on is null or (p_ends_on is not null and p_ends_on < p_starts_on) then
    perform private.fail('invalido');
  end if;
  select * into v_prev from public.seasons s where s.league_id = p_league order by s.starts_on desc limit 1 for update;
  if v_prev.id is not null and p_starts_on <= coalesce(v_prev.ends_on, v_prev.starts_on) then
    perform private.fail('invalido');
  end if;
  insert into public.seasons (id, league_id, name, starts_on, ends_on)
  values (v_id, p_league, private.clean_name(p_name), p_starts_on, p_ends_on);
  perform set_config('mm.season_sync', 'off', true);
  update public.leagues l set season_start = p_starts_on, season_end = p_ends_on where l.id = p_league;
  perform set_config('mm.season_sync', '', true);

  if coalesce(p_copy_teams, false) and v_prev.id is not null and private.league_family(p_league) = 'team' then
    v_old := array(select t.id from public.teams t
                    where t.league_id = p_league and t.event_id is null and t.season_id = v_prev.id
                    order by t.sort_order, t.created_at, t.id);
    v_new := array(select gen_random_uuid() from unnest(v_old));
    insert into public.teams (id, league_id, event_id, season_id, name, sort_order, color)
    select v_new[u.i], p_league, null, v_id, t.name, t.sort_order, t.color
      from unnest(v_old) with ordinality as u (id, i) join public.teams t on t.id = u.id;
    insert into public.team_players (team_id, player_id, league_id, jersey, position, role)
    select v_new[u.i], tp.player_id, tp.league_id, tp.jersey, tp.position, tp.role
      from unnest(v_old) with ordinality as u (id, i) join public.team_players tp on tp.team_id = u.id;
  end if;
  return v_id;
end $$;

-- Las temporadas de la liga, de la más nueva a la más vieja (lee con la RLS de quien llama: null si no ve la liga).
-- [{id, name, startsOn, endsOn, status, closedAt, closedBy, standings, awards: [{id, kind, label, name, playerId,
--   teamId, note}], playoffs: [{id, name, status, champion: {teamId, name} | null, runnerUp: {teamId, name} | null,
--   semifinalists: [{teamId, name}]}]}]. El campeón del último playoff terminado es el que close_season propone.
create function public.league_seasons(p_league uuid) returns jsonb
language sql stable set search_path = '' as $$
  select case when exists (select 1 from public.leagues l where l.id = p_league) then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'startsOn', s.starts_on,
      'endsOn', s.ends_on,
      'status', s.status,
      'closedAt', to_char(s.closed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'closedBy', s.closed_by,
      'standings', s.standings,
      'awards', coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'label', a.label, 'name', a.name,
                                            'playerId', a.player_id, 'teamId', a.team_id, 'note', a.note)
                         order by a.sort_order, a.created_at, a.id)
          from public.season_awards a where a.season_id = s.id), '[]'::jsonb),
      'playoffs', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'status', p.status,
          'champion', case when f.winner is not null then jsonb_build_object('teamId', f.winner,
                             'name', case when f.winner = f.team_a then f.label_a else f.label_b end) end,
          'runnerUp', case when f.winner is not null and f.team_a is not null and f.team_b is not null then jsonb_build_object(
                             'teamId', case when f.winner = f.team_a then f.team_b else f.team_a end,
                             'name', case when f.winner = f.team_a then f.label_b else f.label_a end) end,
          'semifinalists', coalesce((
            select jsonb_agg(jsonb_build_object('teamId', case when x.winner = x.team_a then x.team_b else x.team_a end,
                                                'name', case when x.winner = x.team_a then x.label_b else x.label_a end)
                             order by x.slot)
              from public.playoff_series x
             where x.playoff_id = p.id and x.round = f.round - 1 and x.winner is not null and not x.bye), '[]'::jsonb))
          order by p.created_at desc, p.id)
          from public.playoffs p
          left join lateral (select y.* from public.playoff_series y where y.playoff_id = p.id and y.next_series is null
                              order by y.round desc limit 1) f on true
         where p.season_id = s.id), '[]'::jsonb))
      order by s.starts_on desc)
      from public.seasons s where s.league_id = p_league), '[]'::jsonb) end
$$;

-- Campeones de las temporadas cerradas, de la más nueva a la más vieja (lee con la RLS de quien llama: null si no
-- ve la liga). [{seasonId, name, startsOn, endsOn, closedAt, champion: {label, name, playerId, teamId} | null,
--  awards: [{kind, label, name, playerId, teamId, note}]}].
create function public.league_champions(p_league uuid) returns jsonb
language sql stable set search_path = '' as $$
  select case when exists (select 1 from public.leagues l where l.id = p_league) then coalesce((
    select jsonb_agg(jsonb_build_object(
      'seasonId', s.id,
      'name', s.name,
      'startsOn', s.starts_on,
      'endsOn', s.ends_on,
      'closedAt', to_char(s.closed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'champion', (select jsonb_build_object('label', a.label, 'name', a.name, 'playerId', a.player_id, 'teamId', a.team_id)
                     from public.season_awards a where a.season_id = s.id and a.kind = 'campeon' limit 1),
      'awards', coalesce((
        select jsonb_agg(jsonb_build_object('kind', a.kind, 'label', a.label, 'name', a.name, 'playerId', a.player_id,
                                            'teamId', a.team_id, 'note', a.note)
                         order by a.sort_order, a.created_at, a.id)
          from public.season_awards a where a.season_id = s.id), '[]'::jsonb))
      order by s.starts_on desc)
      from public.seasons s where s.league_id = p_league and s.status = 'closed'), '[]'::jsonb) end
$$;

-- =====================================================================
-- Playoffs
-- =====================================================================

-- Programa el siguiente juego de la serie (sin fecha ni hora). El mejor sembrado es local en los juegos impares.
-- Con empates (fútbol sin penales) se juega otro; como mucho 2 × best_of + 1 juegos.
create function private.playoff_new_game(s public.playoff_series) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer := (select count(*) from public.matches m where m.series_id = s.id and m.status <> 'void') + 1;
  v_rounds integer := (select cardinality(p.best_of) from public.playoffs p where p.id = s.playoff_id);
  v_a_home boolean := coalesce(s.seed_a, 99) <= coalesce(s.seed_b, 99);
  v_stage text;
  v_id uuid := gen_random_uuid();
begin
  if v_n > 2 * s.best_of + 1 or s.team_a is null or s.team_b is null then
    return null;
  end if;
  if v_n % 2 = 0 then
    v_a_home := not v_a_home;
  end if;
  v_stage := private.playoff_round_name(s.round, v_rounds) || case when s.best_of > 1 or v_n > 1 then ' · Juego ' || v_n else '' end;
  insert into public.matches (id, league_id, round, stage, bracket_key, format, rules, created_by, series_id)
  select v_id, s.league_id, s.round, left(v_stage, 40), 'PO' || s.round || '-' || s.slot, private.playoff_format(s.league_id),
         l.rules, auth.uid(), s.id
    from public.leagues l where l.id = s.league_id;
  perform private.write_sides(v_id, s.league_id, jsonb_build_array(
    jsonb_build_object('side', 1, 'team_id', case when v_a_home then s.team_a else s.team_b end,
                       'label', case when v_a_home then s.label_a else s.label_b end,
                       'seed', case when v_a_home then s.seed_a else s.seed_b end),
    jsonb_build_object('side', 2, 'team_id', case when v_a_home then s.team_b else s.team_a end,
                       'label', case when v_a_home then s.label_b else s.label_a end,
                       'seed', case when v_a_home then s.seed_b else s.seed_a end)));
  return v_id;
end $$;

-- Vuelve a contar la serie con sus juegos que cuentan (confirmados, W.O. o propuestos hace 48 h): victorias,
-- ganador, el siguiente juego si nadie ha ganado y no hay uno pendiente, y el ganador a la serie siguiente (o
-- campeón si es la final). Si cambia el ganador (una corrección), la serie siguiente cambia de equipo mientras no
-- haya empezado (un juego suyo no anulado con resultado o anotador); si ya empezó, la corrección falla con
-- 'cerrado: serie' y no cambia nada (el admin anula primero esos juegos y vuelve a corregir). Una final que se
-- queda sin ganador vuelve a estar en curso; si la temporada ya tiene otro playoff en curso: 'invalido: playoff'.
create function private.playoff_refresh(p_series uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.playoff_series;
  nx public.playoff_series;
  v_need integer;
  v_wa integer := 0;
  v_wb integer := 0;
  v_winner uuid;
  v_old uuid;
begin
  select * into s from public.playoff_series x where x.id = p_series for update;
  if not found then
    return;
  end if;
  if s.bye then
    v_winner := coalesce(s.team_a, s.team_b);
  else
    v_need := s.best_of / 2 + 1;
    select count(*) filter (where ms.team_id = s.team_a), count(*) filter (where ms.team_id = s.team_b) into v_wa, v_wb
      from public.matches m
      join public.match_sides ms on ms.match_id = m.id and ms.side = m.winner_side
     where m.series_id = s.id and m.winner_side in (1, 2) and private.match_final(m.status, m.proposed_at);
    v_winner := case when s.team_a is not null and v_wa >= v_need then s.team_a
                     when s.team_b is not null and v_wb >= v_need then s.team_b end;
  end if;
  update public.playoff_series x set wins_a = v_wa, wins_b = v_wb, winner = v_winner
   where x.id = s.id and (x.wins_a, x.wins_b, x.winner) is distinct from (v_wa, v_wb, v_winner);

  if v_winner is not null then
    -- Ya hay ganador: sobran los juegos programados que no empezaron.
    delete from public.matches m where m.series_id = s.id and m.status in ('scheduled', 'postponed') and m.seq = 0;
  elsif s.team_a is not null and s.team_b is not null
        and not exists (select 1 from public.matches m
                         where m.series_id = s.id and m.status <> 'void' and not private.match_final(m.status, m.proposed_at)) then
    perform private.playoff_new_game(s);
  end if;

  if v_winner is not distinct from s.winner then
    return;
  end if;
  if s.next_series is null then
    if v_winner is null and exists (select 1 from public.playoffs p join public.playoffs o on o.season_id = p.season_id
                                     where p.id = s.playoff_id and o.id <> p.id and o.status = 'active') then
      raise exception 'invalido: playoff' using errcode = 'P0001',
        detail = 'La temporada ya tiene otro playoff en curso: bórralo antes de reabrir esta final.';
    end if;
    update public.playoffs p set winner = v_winner, status = case when v_winner is null then 'active' else 'finished' end
     where p.id = s.playoff_id and (p.winner, p.status) is distinct from (v_winner, case when v_winner is null then 'active' else 'finished' end);
    return;
  end if;
  select * into nx from public.playoff_series x where x.id = s.next_series for update;
  v_old := case s.next_side when 'a' then nx.team_a else nx.team_b end;
  if v_old is not distinct from v_winner then
    return;
  end if;
  if v_old is not null and exists (select 1 from public.matches m
                                    where m.series_id = nx.id and m.status <> 'void'
                                      and (m.seq > 0 or m.status not in ('scheduled', 'postponed'))) then
    raise exception 'cerrado: serie' using errcode = 'P0001',
      detail = 'La serie siguiente ya empezó con ese equipo: anula primero sus juegos y vuelve a corregir.';
  end if;
  delete from public.matches m where m.series_id = nx.id and m.status in ('scheduled', 'postponed') and m.seq = 0;
  update public.playoff_series x set
    team_a = case when s.next_side = 'a' then v_winner else x.team_a end,
    seed_a = case when s.next_side = 'a' then case when v_winner = s.team_a then s.seed_a when v_winner = s.team_b then s.seed_b end else x.seed_a end,
    label_a = case when s.next_side = 'a' then case when v_winner = s.team_a then s.label_a when v_winner = s.team_b then s.label_b end else x.label_a end,
    team_b = case when s.next_side = 'b' then v_winner else x.team_b end,
    seed_b = case when s.next_side = 'b' then case when v_winner = s.team_a then s.seed_a when v_winner = s.team_b then s.seed_b end else x.seed_b end,
    label_b = case when s.next_side = 'b' then case when v_winner = s.team_a then s.label_a when v_winner = s.team_b then s.label_b end else x.label_b end
  where x.id = nx.id;
  perform private.playoff_refresh(nx.id);
end $$;

-- Un juego de una serie cambió de estado o de ganador: la serie se vuelve a contar.
create function private.playoff_on_match() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.playoff_refresh(new.series_id);
  return null;
end $$;

create trigger matches_playoff after update of status, winner_side, walkover_side on public.matches for each row
  when (new.series_id is not null
        and (new.status, new.winner_side, new.walkover_side) is distinct from (old.status, old.winner_side, old.walkover_side))
  execute function private.playoff_on_match();

-- Admin: arma el playoff de la temporada (activa; si no, 'cerrado') de una liga de equipos. p_teams: de 2 a 32
-- equipos de esa temporada, en orden de siembra (el mejor primero). p_best_of: al mejor de 1, 3, 5 o 7, uno por
-- ronda (de la primera a la final; con 5 equipos, 3 rondas). Siembra estándar: 1 contra el último, 2 contra el
-- penúltimo…; si no son potencia de 2, los mejores pasan directo a la segunda ronda. Programa el primer juego de
-- cada serie con los dos equipos (sin fecha: la pone el admin). Ya hay un playoff activo en esa temporada:
-- 'duplicado'. Devuelve el id del playoff.
create function public.create_playoffs(p_league uuid, p_season uuid, p_teams uuid[], p_best_of integer[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  s public.seasons;
  v_n integer := coalesce(cardinality(p_teams), 0);
  v_size integer := 1;
  v_rounds integer := 0;
  v_order integer[];
  v_id uuid := gen_random_uuid();
  r record;
begin
  perform private.require_admin(p_league);
  if private.league_family(p_league) is null then
    perform private.fail('no_existe');
  end if;
  if private.league_family(p_league) <> 'team' then
    perform private.fail('invalido');
  end if;
  select * into s from public.seasons x where x.id = p_season and x.league_id = p_league for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  if s.status <> 'active' then
    perform private.fail('cerrado');
  end if;
  if v_n not between 2 and 32 or array_ndims(p_teams) <> 1 or array_position(p_teams, null) is not null
     or (select count(distinct t) from unnest(p_teams) t) <> v_n then
    perform private.fail('invalido');
  end if;
  if (select count(*) from public.teams t
       where t.id = any (p_teams) and t.league_id = p_league and t.event_id is null and t.season_id = p_season) <> v_n then
    perform private.fail('invalido');
  end if;
  while v_size < v_n loop
    v_size := v_size * 2;
    v_rounds := v_rounds + 1;
  end loop;
  if coalesce(cardinality(p_best_of), 0) <> v_rounds or array_ndims(p_best_of) <> 1
     or exists (select 1 from unnest(p_best_of) b where b is null or b not in (1, 3, 5, 7)) then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from public.playoffs p where p.season_id = p_season and p.status = 'active') then
    perform private.fail('duplicado');
  end if;

  insert into public.playoffs (id, league_id, season_id, best_of, seeds, created_by)
  values (v_id, p_league, p_season, p_best_of::smallint[], p_teams, v_uid);
  insert into public.playoff_series (playoff_id, league_id, round, slot, best_of)
  select v_id, p_league, rd, sl, p_best_of[rd]
    from generate_series(1, v_rounds) rd
    cross join lateral generate_series(1, v_size / (2 ^ rd)::integer) sl;
  update public.playoff_series x set next_series = y.id, next_side = case when x.slot % 2 = 1 then 'a' else 'b' end
    from public.playoff_series y
   where x.playoff_id = v_id and y.playoff_id = v_id and y.round = x.round + 1 and y.slot = (x.slot + 1) / 2;
  -- Primera ronda: lugar i = siembras v_order[2i-1] contra v_order[2i]; la que pasa de v_n es pase directo.
  v_order := private.seed_order(v_size);
  update public.playoff_series x set
    team_a = case when o.sa <= v_n then p_teams[o.sa] end,
    seed_a = case when o.sa <= v_n then o.sa end,
    label_a = case when o.sa <= v_n then (select t.name from public.teams t where t.id = p_teams[o.sa]) end,
    team_b = case when o.sb <= v_n then p_teams[o.sb] end,
    seed_b = case when o.sb <= v_n then o.sb end,
    label_b = case when o.sb <= v_n then (select t.name from public.teams t where t.id = p_teams[o.sb]) end,
    bye = o.sa > v_n or o.sb > v_n
    from (select i, v_order[2 * i - 1] as sa, v_order[2 * i] as sb from generate_series(1, v_size / 2) i) o
   where x.playoff_id = v_id and x.round = 1 and x.slot = o.i;
  for r in select x.id from public.playoff_series x where x.playoff_id = v_id and x.round = 1 order by x.slot loop
    perform private.playoff_refresh(r.id);
  end loop;
  return v_id;
end $$;

-- Admin: borra el playoff con su llave. Los juegos que no empezaron se borran; los jugados se quedan sin serie.
create function public.delete_playoffs(p_playoff uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
begin
  perform private.require_uid();
  select p.league_id into v_league from public.playoffs p where p.id = p_playoff for update;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  delete from public.matches m
   where m.series_id in (select x.id from public.playoff_series x where x.playoff_id = p_playoff)
     and m.status in ('scheduled', 'postponed') and m.seq = 0;
  delete from public.playoffs p where p.id = p_playoff;
end $$;

-- Pone al día el playoff (se llama al abrirlo): lo que pasó sin escritura, como un resultado propuesto que a las
-- 48 h ya cuenta, o un juego que se borró. Cualquiera que ve la liga (con sesión). Devuelve cuántas series cambiaron.
create function public.sync_playoffs(p_playoff uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
  v_before jsonb;
  v_after jsonb;
  r record;
begin
  if auth.uid() is null then
    perform private.deny();
  end if;
  select p.league_id into v_league from public.playoffs p where p.id = p_playoff for update;
  if v_league is null or v_league not in (select private.readable_leagues()) then
    perform private.fail('no_existe');
  end if;
  v_before := (select jsonb_object_agg(x.id, jsonb_build_array(x.team_a, x.team_b, x.wins_a, x.wins_b, x.winner))
                 from public.playoff_series x where x.playoff_id = p_playoff);
  for r in select x.id from public.playoff_series x where x.playoff_id = p_playoff order by x.round, x.slot loop
    begin
      perform private.playoff_refresh(r.id);
    exception when sqlstate 'P0001' then
      -- Un cambio que ya no se puede aplicar (p. ej. se borró un juego jugado y la serie siguiente ya empezó): esa
      -- serie se queda como estaba y las demás se ponen al día.
      null;
    end;
  end loop;
  v_after := (select jsonb_object_agg(x.id, jsonb_build_array(x.team_a, x.team_b, x.wins_a, x.wins_b, x.winner))
                from public.playoff_series x where x.playoff_id = p_playoff);
  return (select count(*) from jsonb_each(v_after) a where a.value is distinct from v_before -> a.key)::integer;
end $$;

-- =====================================================================
-- Boliche: lo que hace falta para las marcas de un juego
-- =====================================================================

-- Para cada participación de boliche (hasta 100, de ligas que ve quien llama: lee con su RLS), los juegos que
-- cuentan (verificados: con foto o marca, como playerStats de stats.ts) de ese jugador en esa liga ANTES de ese
-- evento (orden: fecha del evento y su id): cuántos y el más alto; los de la temporada del evento antes de él
-- (cuántos y pinos), y los de la temporada anterior entera. Con eso y sus propios juegos el teléfono decide
-- «Récord personal» y «+15 sobre tu promedio» (con el promedio congelado de la participación, `average`, como en
-- la pantalla del evento).
-- [{entryId, playerId, leagueId, seasonId, averageOverride, average, before: {games, high}, season: {games, pins},
--   prevSeason: {id, games, pins} | null}] en el orden pedido.
create function public.bowling_game_context(p_entries uuid[]) returns jsonb
language sql stable set search_path = '' as $$
  with x as (
    select en.id, en.player_id, en.league_id, en.event_id, en.average, e.date, p.average_override,
           (select s.id from public.seasons s
             where s.league_id = en.league_id and s.starts_on <= e.date
               and (s.status = 'active' or s.ends_on is null or e.date <= s.ends_on)
             order by s.starts_on desc limit 1) as season_id
      from public.entries en
      join public.events e on e.id = en.event_id
      join public.leagues l on l.id = en.league_id and l.sport = 'bowling'
      join public.players p on p.id = en.player_id
     where en.id = any (p_entries[1:100])
  ),
  games as (
    select o.player_id, e.date, e.id as event_id, g.score
      from public.entries o
      join public.events e on e.id = o.event_id
      cross join lateral unnest(o.scores, o.photos) as g (score, photo)
     where o.player_id in (select x.player_id from x) and g.score is not null and g.photo is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'entryId', x.id,
    'playerId', x.player_id,
    'leagueId', x.league_id,
    'seasonId', x.season_id,
    'averageOverride', x.average_override,
    'average', x.average,
    'before', (select jsonb_build_object('games', count(*), 'high', coalesce(max(g.score), 0)) from games g
                where g.player_id = x.player_id and (g.date, g.event_id) < (x.date, x.event_id)),
    'season', (select jsonb_build_object('games', count(g.score), 'pins', coalesce(sum(g.score), 0))
                 from public.seasons s
                 left join games g on g.player_id = x.player_id and g.date >= s.starts_on and (g.date, g.event_id) < (x.date, x.event_id)
                where s.id = x.season_id),
    'prevSeason', (select jsonb_build_object('id', ps.id, 'games', count(g.score), 'pins', coalesce(sum(g.score), 0))
                     from (select s2.id, s2.starts_on, s2.ends_on
                             from public.seasons s2 join public.seasons s on s.id = x.season_id
                            where s2.league_id = x.league_id and s2.starts_on < s.starts_on
                            order by s2.starts_on desc limit 1) ps
                     left join games g on g.player_id = x.player_id and g.date >= ps.starts_on
                                      and (ps.ends_on is null or g.date <= ps.ends_on)
                    group by ps.id))
    order by array_position(p_entries, x.id)), '[]'::jsonb)
    from x
$$;

-- =====================================================================
-- «¿Dónde juego esta semana?»
-- =====================================================================

-- Lo que viene (de p_from, por defecto hoy en RD, hasta p_days días: 1–31, por defecto 14) en las ligas públicas
-- sin menores de deportes que no están cerrados, donde uno se puede apuntar y hay lugar. p_sport: solo ese deporte.
-- - boliche: torneos y prácticas (join 'rsvp': join_league y set_rsvp; taken = cuántos van);
-- - golf: rondas abiertas (join 'golf': join_league y golf_register; taken = inscritos);
-- - raqueta: noches y torneos con inscripción abierta, antes de la fecha límite y sin empezar (join 'signup':
--   join_signup, que ya entra a la liga), con cupo libre o sin tope (con tope, cap, taken en la lista, spotsLeft;
--   en el torneo por categoría: categories [{id, name, cap, taken, spotsLeft}]); waitlist = en espera.
-- Nada de datos de personas. Sin cuenta: 60 consultas cada 10 minutos por IP ('rate_limited').
-- {from, days, items: [{eventId, leagueId, leagueName, sport, leagueKind, type, name, date, time ('HH:MM' | null),
--  timeLabel ('7:00 pm' | null), venue, join, cap, taken, spotsLeft, waitlist, until, categories, mine, url}]}, por
-- día y hora, hasta 100. mine: la cuenta ya va, está inscrita o apuntada (en la lista o en espera).
create function public.public_agenda(p_sport text default null, p_from date default null, p_days integer default 14) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_from date := coalesce(p_from, (now() at time zone 'America/Santo_Domingo')::date);
  v_days integer := coalesce(p_days, 14);
  v_key text;
  v_items jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_kind text;
  v_cap integer;
  v_taken integer;
  v_left integer;
  v_wait integer;
  v_cats jsonb;
  v_mine boolean;
  e record;
begin
  if v_days not between 1 and 31 or v_from not between '2000-01-01'::date and '2200-01-01'::date then
    perform private.fail('invalido');
  end if;
  if p_sport is not null and not exists (select 1 from public.sport_status s where s.id = p_sport) then
    perform private.fail('invalido');
  end if;
  if v_uid is null then
    v_key := private.rate_key('agenda');
    if private.rate_blocked(v_key, 60, interval '10 minutes') then
      perform private.fail('rate_limited');
    end if;
    perform private.rate_hit(v_key, interval '10 minutes');
  end if;

  for e in
    select ev.id, ev.league_id, ev.type, ev.name, ev.date, ev.start_time, ev.config, lg.name as league_name, lg.sport,
           lg.kind, lg.venue, st.minutes as sched_minutes, st.label as sched_label,
           case
             when lg.sport = 'bowling' and ev.type in ('torneo', 'practica') then 'rsvp'
             when lg.sport = 'golf' and exists (select 1 from public.golf_rounds r where r.event_id = ev.id and r.status = 'abierta') then 'golf'
             when private.signup_kind(ev.league_id, ev.type) is not null and jsonb_typeof(ev.config -> 'signup') = 'object' then 'signup'
           end as how
      from public.events ev
      join public.leagues lg on lg.id = ev.league_id
      join public.sport_status ss on ss.id = lg.sport
      left join lateral private.event_start(ev.date, lg.schedule) st on ev.start_time is null
     where lg.visibility = 'public' and not lg.has_minors and ss.status <> 'closed'
       and (p_sport is null or lg.sport = p_sport)
       and ev.date >= greatest(v_from, (now() at time zone lg.tz)::date) and ev.date < v_from + v_days
     order by ev.date,
              coalesce(extract(hour from ev.start_time)::integer * 60 + extract(minute from ev.start_time)::integer, st.minutes) nulls last,
              lg.name, ev.id
  loop
    continue when e.how is null;
    v_cap := null;
    v_taken := null;
    v_left := null;
    v_wait := null;
    v_cats := null;
    if e.how = 'rsvp' then
      v_taken := (select count(*) from public.event_rsvps r where r.event_id = e.id and r.going);
      v_mine := v_uid is not null and exists (select 1 from public.event_rsvps r join public.players p on p.id = r.player_id
                                               where r.event_id = e.id and r.going and p.user_id = v_uid);
    elsif e.how = 'golf' then
      v_taken := (select count(*) from public.golf_cards c where c.event_id = e.id);
      v_mine := v_uid is not null and exists (select 1 from public.golf_cards c join public.players p on p.id = c.player_id
                                               where c.event_id = e.id and p.user_id = v_uid);
    else
      v_kind := private.signup_kind(e.league_id, e.type);
      continue when not coalesce((e.config #>> '{signup,open}')::boolean, false)
                 or (e.config #>> '{signup,until}' is not null and (e.config #>> '{signup,until}')::timestamptz <= now())
                 or private.signup_started(e.id, v_kind, e.config);
      if jsonb_typeof(e.config #> '{signup,cap}') = 'number' then
        v_cap := private.signup_cap(e.config -> 'signup');
      end if;
      v_wait := (select count(*) from public.event_signups s where s.event_id = e.id and s.status = 'wait');
      -- Sin tope no se sabe cuántos lugares quedan (null); con tope, nunca menos de 0.
      if v_kind = 'night' then
        v_taken := (select count(*) from private.signup_roster(v_kind, e.config) x);
        v_left := case when v_cap is not null then greatest(v_cap - v_taken, 0) end;
      else
        select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'cap', v_cap, 'taken', c.taken,
                                            'spotsLeft', case when v_cap is not null then greatest(v_cap - c.taken, 0) end) order by c.n),
               sum(c.taken), case when v_cap is not null then sum(greatest(v_cap - c.taken, 0)) end
          into v_cats, v_taken, v_left
          from (select y ->> 'id' as id, coalesce(nullif(y ->> 'name', ''), y ->> 'id') as name, n,
                       (select count(*) from private.signup_roster(v_kind, e.config) x where x.category = y ->> 'id')::integer as taken
                  from jsonb_array_elements(case when jsonb_typeof(e.config -> 'categories') = 'array' then e.config -> 'categories' else '[]'::jsonb end)
                       with ordinality as a (y, n)
                 where jsonb_typeof(y) = 'object' and y ->> 'id' is not null) c;
        continue when v_cats is null;
      end if;
      continue when v_cap is not null and v_left <= 0;
      v_mine := v_uid is not null and (
        exists (select 1 from public.event_signups s where s.event_id = e.id and private.signup_mine(s.entrant_id))
        or exists (select 1 from private.signup_roster(v_kind, e.config) x
                    where x.entrant ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and private.signup_mine(x.entrant::uuid)));
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'eventId', e.id,
      'leagueId', e.league_id,
      'leagueName', e.league_name,
      'sport', e.sport,
      'leagueKind', e.kind,
      'type', e.type,
      'name', e.name,
      'date', to_char(e.date, 'YYYY-MM-DD'),
      'time', coalesce(to_char(e.start_time, 'HH24:MI'),
                       case when e.sched_minutes is not null
                            then lpad((e.sched_minutes / 60)::text, 2, '0') || ':' || lpad((e.sched_minutes % 60)::text, 2, '0') end),
      'timeLabel', coalesce(nullif(private.format_time(to_char(e.start_time, 'HH24:MI')), ''), e.sched_label),
      'venue', e.venue,
      'join', e.how,
      'cap', v_cap,
      'taken', v_taken,
      'spotsLeft', v_left,
      'waitlist', v_wait,
      'until', case when e.how = 'signup' then e.config #>> '{signup,until}' end,
      'categories', v_cats,
      'mine', coalesce(v_mine, false),
      'url', '/l/' || e.league_id::text || '/e/' || e.id::text));
    v_count := v_count + 1;
    exit when v_count >= 100;
  end loop;
  return jsonb_build_object('from', to_char(v_from, 'YYYY-MM-DD'), 'days', v_days, 'items', v_items);
end $$;

-- =====================================================================
-- Permisos: cerrado todo lo de esta migración; las RPC, solo con sesión (public_agenda también sin cuenta); las
-- lecturas que corren con la RLS de quien llama (no son security definer), con y sin cuenta
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array['close_season', 'start_season', 'create_playoffs', 'delete_playoffs', 'sync_playoffs', 'public_agenda'];
  v_read constant text[] := array['league_seasons', 'league_champions', 'bowling_game_context'];
  v_private constant text[] := array[
    'active_season', 'current_season', 'season_cover', 'playoff_round_name', 'seed_order', 'playoff_format',
    'season_on_league', 'season_follow_league', 'season_cover_events', 'season_cover_matches', 'season_cover_row',
    'team_season_fill', 'emit_league_rows', 'check_free_players', 'claim_conflicts', 'merge_players',
    'playoff_new_game', 'playoff_refresh', 'playoff_on_match'
  ];
begin
  for f in select p.oid::regprocedure as sig, n.nspname, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and (p.proname = any (v_rpc) or p.proname = any (v_read)))
               or (n.nspname = 'private' and p.proname = any (v_private)) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' then
      execute format('grant execute on function %s to authenticated', f.sig);
      if f.proname = 'public_agenda' or f.proname = any (v_read) then
        execute format('grant execute on function %s to anon', f.sig);
      end if;
    end if;
  end loop;
end $$;
