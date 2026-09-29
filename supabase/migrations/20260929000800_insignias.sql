-- MatchMate · Insignias: los datos (diseño completo en docs/insignias.md, §3.2, §3.7 y §3.9). El motor va en
-- 20260929000810_insignias_motor.sql, el creador de insignias de liga en …0820 y lo de temporadas en …0880.
--
-- 1. public.badge_awards: las insignias automáticas otorgadas. Una fila por dueño, key, deporte, nivel y periodo
--    (la clave única incluye las revocadas, que el motor reactiva). Ámbito `liga` (y copia de respaldo de un jugador
--    sin cuenta): player_id + league_id. Ámbito `cuenta`: user_id y league_id null. holder = el que la tiene.
--    Estados 'provisional' (7 días, firm_at), 'firme', 'en_revision' (aval) y 'revocada' ('evidencia', 'aval',
--    'fraude'). context guarda la evidencia (con el nombre de la liga copiado). Solo escribe el motor
--    (20260929000810_insignias_motor.sql) y las RPC de aquí; la app solo lee.
-- 2. public.badge_progress: cuánto le falta a cada dueño para el siguiente nivel (solo lo ve el dueño).
-- 3. public.badge_stats: la rareza medida cada noche (la leen todos, también sin cuenta).
-- 4. leagues.badges_auto: 'todas' | 'sin_titulos' | 'ninguna'. Una liga con menores nace (o pasa a ser) 'sin_titulos';
--    el dueño la cambia con set_badges_auto. profiles.featured_badges: hasta 3 insignias destacadas del perfil.
-- 5. Quién ve qué (RLS, solo lectura): las propias (de la cuenta o de sus jugadores) en cualquier estado; las de una
--    liga visible, provisionales o firmes y no ocultas (los admins de la liga ven también las ocultas); el
--    superadmin, todas. Las de cuenta de otra persona solo salen por profile_badges.
-- 6. RPC: profile_badges, set_featured_badges, set_badge_hidden, mark_badges_seen, set_badges_auto, review_badge
--    (aval) y super_revoke_badge. report_badge va con el creador (20260929000820), badges_backfill con el motor y
--    el cierre de temporada lo hace public.close_season (20260929000700_temporadas.sql).
-- 7. Cambian (misma firma): private.merge_players (junta también las insignias de los dos jugadores al aprobar un
--    reclamo, con private.merge_badges) y public.export_my_data (las tablas con `holder` salen por la cuenta y por
--    sus jugadores, y las ligas llevan badgesAuto).
--
-- private.badge_signal(evento, liga, jugador, insignia) no hace nada aquí: el motor la redefine para encolar lo que
-- corresponde ('merge' después de juntar dos jugadores, 'review' al confirmar un aval).

-- =====================================================================
-- Tablas
-- =====================================================================

-- players ya tiene unique (id, league_id) (20260926000200_schema.sql): las FK compuestas de abajo lo usan.

create table public.badge_awards (
  id uuid primary key default gen_random_uuid(),
  -- Validada contra el catálogo (src/badges/catalog.ts) por el motor.
  badge_key text not null check (badge_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  sport text not null check (sport in ('all', 'bowling', 'padel', 'tennis', 'pickleball',
                                       'basketball', 'football', 'futsal', 'golf', 'swimming')),
  -- 0 único, 1 bronce, 2 plata, 3 oro, 4 platino, 5 diamante.
  level smallint not null check (level between 0 and 5),
  -- '-' (siempre), 'e:<evento>', 'g:<participación>:<juego>', '2026-10', 's:<temporada>'… (§1.7.1).
  period_key text not null check (period_key ~ '^[A-Za-z0-9:_-]{1,120}$'),
  player_id uuid,
  user_id uuid references public.profiles (id) on delete cascade,
  league_id uuid references public.leagues (id) on delete cascade,
  holder uuid generated always as (coalesce(player_id, user_id)) stored,
  status text not null default 'provisional' check (status in ('provisional', 'firme', 'en_revision', 'revocada')),
  awarded_at timestamptz not null default now(),
  -- Provisional: cuándo queda firme.
  firm_at timestamptz,
  -- 'entry:<id>:<juego>', 'match:<id>', 'card:<id>'… (lo que revisa un 'revisar' y quién puede dar el aval).
  refs text[] not null default '{}',
  context jsonb not null default '{}' check (jsonb_typeof(context) = 'object' and pg_column_size(context) < 4096),
  -- Privada por defecto: el motor la inserta con hidden = true.
  hidden boolean not null default false,
  seen_at timestamptz,
  notified_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text check (revoke_reason in ('evidencia', 'aval', 'fraude')),
  revoked_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade,
  check (num_nonnulls(player_id, user_id) = 1),
  check (player_id is null or league_id is not null),
  -- Las de cuenta no son de ninguna liga (así la RLS de la liga nunca las destapa).
  check (user_id is null or league_id is null),
  check ((status = 'revocada') = (revoked_at is not null))
);
-- Idempotencia: una fila por dueño, key, deporte, nivel y periodo (las revocadas también: se reactivan).
create unique index badge_awards_once on public.badge_awards (holder, badge_key, sport, level, period_key);
create index badge_awards_user_idx on public.badge_awards (user_id) where user_id is not null;
create index badge_awards_player_idx on public.badge_awards (player_id) where player_id is not null;
create index badge_awards_sync_idx on public.badge_awards (league_id, updated_at);
create index badge_awards_refs_idx on public.badge_awards using gin (refs) where status in ('provisional', 'en_revision');
create index badge_awards_firm_idx on public.badge_awards (firm_at) where status = 'provisional';

-- Progreso hacia el siguiente nivel. Lo escribe el motor; lo ve solo su dueño.
create table public.badge_progress (
  player_id uuid,
  user_id uuid references public.profiles (id) on delete cascade,
  league_id uuid,
  holder uuid generated always as (coalesce(player_id, user_id)) stored,
  badge_key text not null check (badge_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  sport text not null check (sport in ('all', 'bowling', 'padel', 'tennis', 'pickleball',
                                       'basketball', 'football', 'futsal', 'golf', 'swimming')),
  value double precision not null,
  target double precision not null,
  next_level smallint not null check (next_level between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (holder, badge_key, sport),
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade,
  check (num_nonnulls(player_id, user_id) = 1),
  check (player_id is null or league_id is not null),
  check (user_id is null or league_id is null)
);
create index badge_progress_user_idx on public.badge_progress (user_id) where user_id is not null;
create index badge_progress_player_idx on public.badge_progress (player_id) where player_id is not null;

-- Rareza medida cada noche (§3.8): holders de base (cuentas activas del deporte en 365 días). Con base < 50, 'nueva'.
create table public.badge_stats (
  badge_key text not null check (badge_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  sport text not null check (sport in ('all', 'bowling', 'padel', 'tennis', 'pickleball',
                                       'basketball', 'football', 'futsal', 'golf', 'swimming')),
  level smallint not null check (level between 0 and 5),
  holders integer not null check (holders >= 0),
  base integer not null check (base >= 0),
  pct double precision not null check (pct between 0 and 100),
  rarity text not null check (rarity in ('nueva', 'comun', 'poco_comun', 'rara', 'epica', 'legendaria')),
  computed_at timestamptz not null,
  primary key (badge_key, sport, level)
);

-- Insignias automáticas de la liga: 'todas', 'sin_titulos' (se apagan las que comparan con otros) o 'ninguna'.
alter table public.leagues add column badges_auto text not null default 'todas'
  check (badges_auto in ('todas', 'sin_titulos', 'ninguna'));
update public.leagues set badges_auto = 'sin_titulos' where has_minors;

-- Hasta 3 insignias destacadas debajo del nombre (ids de badge_awards; profile_badges filtra las que ya no se ven).
alter table public.profiles add column featured_badges uuid[] not null default '{}'
  check (coalesce(array_ndims(featured_badges), 1) = 1 and cardinality(featured_badges) <= 3);

-- =====================================================================
-- Triggers
-- =====================================================================

create trigger badge_awards_touch before update on public.badge_awards
  for each row execute function private.touch_updated_at();
create trigger badge_progress_touch before update on public.badge_progress
  for each row execute function private.touch_updated_at();
-- Solo las de una liga dejan tombstone (las de cuenta no se sincronizan por liga).
create trigger badge_awards_tombstone after delete on public.badge_awards
  for each row when (old.league_id is not null) execute function private.tombstone('id');

-- Liga con menores: nace sin títulos (o pasa a sin títulos al subir has_minors). El dueño los puede encender.
create function private.badges_auto_minors() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.has_minors and new.badges_auto = 'todas' and (tg_op = 'INSERT' or not old.has_minors) then
    new.badges_auto := 'sin_titulos';
  end if;
  return new;
end $$;
create trigger leagues_badges_auto before insert or update of has_minors on public.leagues
  for each row execute function private.badges_auto_minors();

-- =====================================================================
-- Quién ve qué (solo lectura)
-- =====================================================================

alter table public.badge_awards enable row level security;
alter table public.badge_progress enable row level security;
alter table public.badge_stats enable row level security;

-- Las propias (de la cuenta o de sus jugadores), en cualquier estado: así ve «en revisión» y un retiro que ya vio.
create policy badge_awards_own on public.badge_awards for select to authenticated
  using (user_id = (select auth.uid())
         or player_id in (select p.id from public.players p where p.user_id = (select auth.uid())));
-- Las de una liga visible: provisionales o firmes y no ocultas.
create policy badge_awards_league on public.badge_awards for select to anon, authenticated
  using (league_id in (select private.readable_leagues()) and status in ('provisional', 'firme') and not hidden);
-- Los admins de la liga ven también las ocultas.
create policy badge_awards_league_admin on public.badge_awards for select to authenticated
  using (league_id in (select private.admin_leagues()) and status in ('provisional', 'firme'));
-- El superadmin, todas (avales vencidos, reportes).
create policy badge_awards_super on public.badge_awards for select to authenticated
  using ((select private.is_super()));

create policy badge_progress_own on public.badge_progress for select to authenticated
  using (user_id = (select auth.uid())
         or player_id in (select p.id from public.players p where p.user_id = (select auth.uid())));

create policy badge_stats_read on public.badge_stats for select to anon, authenticated using (true);

revoke all on public.badge_awards, public.badge_progress, public.badge_stats from public, anon, authenticated;
grant select on public.badge_awards, public.badge_stats to anon, authenticated;
grant select on public.badge_progress to authenticated;

-- =====================================================================
-- Ayudas
-- =====================================================================

-- Aviso al motor: aquí no hace nada. 20260929000810_insignias_motor.sql la redefine (misma firma) para encolar el
-- trabajo que toca: 'merge' (p_player = el jugador que quedó al juntar dos) o 'review' (p_award confirmada).
create function private.badge_signal(p_event text, p_league uuid, p_player uuid, p_award uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  return;
end $$;

-- Pasa las insignias de p_from a p_into (los dos de p_league) al juntar dos jugadores. Si chocan (misma key,
-- deporte, nivel y periodo) queda una: la firme gana a la provisional, que gana a la que está en revisión (y
-- cualquiera a una revocada); a igual estado, la más vieja. La que queda se lleva el awarded_at más viejo, el
-- primer seen_at y notified_at, y queda oculta solo si las dos lo estaban; la otra se borra (con su tombstone) y
-- sale de las destacadas. El progreso de los dos se borra: el motor lo recalcula.
create function private.merge_badges(p_from uuid, p_into uuid, p_league uuid) returns void
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
           f.hidden and i.hidden as hidden,
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
  perform private.badge_signal('merge', p_league, p_into, null);
end $$;

-- ¿p_user puede dar el aval de esa insignia (§1.7.5)? Dueño o admin de su liga que no es el jugador ni compite en
-- la evidencia: nadie del mismo evento (boliche: 'entry:<id>…'; golf: 'card:<id>', todo el evento, grupo incluido)
-- ni del mismo partido ('match:<id>', alineación y plantillas de los dos lados). El superadmin va aparte.
create function private.badge_can_review(p_award uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  with a as materialized (
    select x.id, x.league_id, x.player_id, x.refs from public.badge_awards x where x.id = p_award and x.league_id is not null
  ),
  refs as materialized (
    select split_part(r.v, ':', 1) as kind, split_part(r.v, ':', 2)::uuid as id
      from a cross join lateral unnest(a.refs) as r (v)
     where split_part(r.v, ':', 1) in ('entry', 'card', 'match')
       and split_part(r.v, ':', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  rivals as (
    select p.user_id from refs r
      join public.entries e on r.kind = 'entry' and e.id = r.id
      join public.entries o on o.event_id = e.event_id
      join public.players p on p.id = o.player_id
    union
    select p.user_id from refs r
      join public.golf_cards c on r.kind = 'card' and c.id = r.id
      join public.golf_cards o on o.event_id = c.event_id
      join public.players p on p.id = o.player_id
    union
    select p.user_id from refs r
      join public.match_players mp on r.kind = 'match' and mp.match_id = r.id
      join public.players p on p.id = mp.player_id
    union
    select p.user_id from refs r
      join public.match_sides s on r.kind = 'match' and s.match_id = r.id
      join public.team_players tp on tp.team_id = s.team_id
      join public.players p on p.id = tp.player_id
  )
  select p_user is not null and exists (
    select 1 from a
      join public.league_members m on m.league_id = a.league_id and m.user_id = p_user and m.role in ('owner', 'admin')
     where p_user is distinct from (select p.user_id from public.players p where p.id = a.player_id)
       and not exists (select 1 from rivals rv where rv.user_id = p_user))
$$;

-- =====================================================================
-- Juntar jugadores (reclamos): también sus insignias
-- =====================================================================

-- Igual que en 20260929000100_reclamos.sql, y además private.merge_badges antes del guardia del catálogo (sin
-- eso, un jugador con insignias frena toda aprobación con 'conflicto: badge_awards').
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
  -- Insignias (badge_awards y badge_progress).
  perform private.merge_badges(p_from, p_into, p_league);

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
-- Bajar mis datos: también las insignias de sus jugadores
-- =====================================================================

-- Igual que en 20260927001500_cuenta.sql, con dos cambios: una tabla con `holder` (badge_awards, badge_progress)
-- sale por la cuenta Y por sus jugadores (holder = el jugador o la cuenta), y cada liga dice su badgesAuto. El
-- perfil lleva sus destacadas.
create or replace function public.export_my_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_key text := 'export:u:' || v_uid::text;
  v_players uuid[];
  v_tables jsonb := '{}'::jsonb;
  v_truncated text[] := '{}';
  v_rows jsonb;
  v_n integer;
  r record;
  c_max constant integer := 5000;
begin
  if private.rate_blocked(v_key, 5, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  perform private.rate_hit(v_key, interval '1 hour');

  v_players := array(select p.id from public.players p where p.user_id = v_uid order by p.created_at, p.id);

  for r in
    select c.relname as t,
           case when bool_or(a.attname = 'holder') then 'holder'
                when bool_or(a.attname = 'user_id') then 'user_id'
                else 'player_id' end as col
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and a.attname in ('user_id', 'player_id', 'holder')
       and c.relname not in ('players', 'league_members', 'push_outbox')
     group by c.relname
     order by c.relname
  loop
    if r.col = 'player_id' and cardinality(v_players) = 0 then
      continue;
    end if;
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x) - $2), ''[]''::jsonb), count(*)::integer
         from (select * from public.%I t where t.%I = any ($1) limit %s) x',
      r.t, r.col, c_max + 1)
      using case r.col when 'user_id' then array[v_uid] when 'holder' then v_uid || v_players else v_players end,
            private.export_hidden_columns()
      into v_rows, v_n;
    if v_n > c_max then
      v_rows := v_rows - c_max;
      v_truncated := v_truncated || r.t::text;
    end if;
    if v_n > 0 then
      v_tables := v_tables || jsonb_build_object(r.t::text, v_rows);
    end if;
  end loop;

  return jsonb_build_object(
    'format', 'matchmate-mis-datos',
    'version', 1,
    'generatedAt', private.iso(now()),
    'account', (
      select jsonb_build_object(
        'id', p.id,
        'email', p.email,
        'name', p.name,
        'createdAt', private.iso(p.created_at),
        'adultConfirmedAt', private.iso(p.adult_confirmed_at),
        'lastSeenAt', private.iso(p.last_seen_at),
        'superadmin', p.is_superadmin,
        'blockedAt', private.iso(p.blocked_at),
        'blockedReason', p.blocked_reason,
        'bowlingxId', p.firebase_uid,
        'featuredBadges', to_jsonb(p.featured_badges),
        'provider', nullif(a.raw_app_meta_data ->> 'provider', ''),
        'emailConfirmedAt', private.iso(a.email_confirmed_at),
        'lastSignInAt', private.iso(a.last_sign_in_at))
        from public.profiles p left join auth.users a on a.id = p.id
       where p.id = v_uid),
    'leagues', coalesce((
      select jsonb_agg(jsonb_build_object(
               'leagueId', m.league_id, 'name', l.name, 'sport', l.sport, 'kind', l.kind, 'visibility', l.visibility,
               'role', m.role, 'scorer', m.is_scorer, 'displayName', m.display_name, 'joinedAt', private.iso(m.joined_at),
               'badgesAuto', l.badges_auto)
               order by m.joined_at, m.league_id)
        from public.league_members m join public.leagues l on l.id = m.league_id
       where m.user_id = v_uid), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'leagueId', p.league_id, 'leagueName', l.name, 'name', p.name,
               'averageOverride', p.average_override, 'attrs', p.attrs, 'createdAt', private.iso(p.created_at))
               order by p.created_at, p.id)
        from public.players p join public.leagues l on l.id = p.league_id
       where p.id = any (v_players)), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'leagueId', m.league_id, 'eventId', m.event_id, 'scheduledAt', private.iso(m.scheduled_at),
               'status', m.status, 'format', m.format, 'score', m.score, 'winnerSide', m.winner_side,
               'side', mp.side, 'playerId', mp.player_id)
               order by m.scheduled_at nulls last, m.id)
        from public.match_players mp join public.matches m on m.id = mp.match_id
       where mp.player_id = any (v_players)), '[]'::jsonb),
    'tables', v_tables,
    'daysSeen', coalesce((
      select jsonb_agg(to_char(s.day, 'YYYY-MM-DD') order by s.day) from private.daily_seen s where s.user_id = v_uid), '[]'::jsonb),
    'scanUsage', coalesce((
      select jsonb_agg(jsonb_build_object('day', to_char(s.day, 'YYYY-MM-DD'), 'photos', s.n) order by s.day)
        from private.scan_usage s where s.user_id = v_uid), '[]'::jsonb),
    'truncated', to_jsonb(v_truncated));
end $$;

-- =====================================================================
-- RPC
-- =====================================================================

-- Insignias de una cuenta para su perfil (/u/:id, pestaña «Insignias»). null si no existe o no se ve
-- (private.social_can_see). {userId, isMe, featured: [id], awards: [insignia], truncated}; cada insignia:
-- {id, key, sport, level, periodKey, scope: 'cuenta'|'liga', status, awardedAt, firmAt, leagueId, leagueName,
--  playerId, context, hidden, seenAt}. Más nuevas primero, hasta 1000 (truncated = había más).
-- - Otra cuenta: las de cuenta y las de sus jugadores en ligas que pasan private.social_league_ok (la ve quien mira
--   y sin menores), provisionales o firmes y no ocultas; en las de cuenta, context pierde 'league' y 'event' si
--   esa liga no pasa. Una cuenta bloqueada no muestra nada (salvo al superadmin). seenAt siempre null.
-- - La propia: todas las suyas (ocultas, en revisión, de ligas con menores), menos las revocadas que nunca vio.
-- featured: las destacadas que hoy se ven en público (y quien mira puede ver), en su orden.
create function public.profile_badges(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_self boolean := p_user = v_me;
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_awards jsonb;
  v_featured jsonb;
  v_n integer;
  c_max constant integer := 1000;
begin
  if p_user is null or not private.social_can_see(p_user) then
    return null;
  end if;
  if not v_self and private.is_blocked(p_user) and not private.is_super() then
    return jsonb_build_object('userId', p_user, 'isMe', false, 'featured', '[]'::jsonb, 'awards', '[]'::jsonb, 'truncated', false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id,
           'key', x.badge_key,
           'sport', x.sport,
           'level', x.level,
           'periodKey', x.period_key,
           'scope', case when x.user_id is not null then 'cuenta' else 'liga' end,
           'status', x.status,
           'awardedAt', private.iso(x.awarded_at),
           'firmAt', private.iso(x.firm_at),
           'leagueId', x.league_id,
           'leagueName', x.league_name,
           'playerId', x.player_id,
           'context', x.ctx,
           'hidden', x.hidden,
           'seenAt', case when v_self then private.iso(x.seen_at) end)
           order by x.awarded_at desc, x.id desc), '[]'::jsonb),
         count(*)::integer
    into v_awards, v_n
    from (
      select a.*, l.name as league_name,
             case
               when v_self or a.league_id is not null or not (a.context ? 'league') then a.context
               when coalesce(a.context -> 'league' ->> 'id', '') !~ v_uuid then a.context - 'league' - 'event'
               when private.social_league_ok((a.context -> 'league' ->> 'id')::uuid) then a.context
               else a.context - 'league' - 'event'
             end as ctx
        from public.badge_awards a
        left join public.players p on p.id = a.player_id
        left join public.leagues l on l.id = a.league_id
       where (a.user_id = p_user or p.user_id = p_user)
         and case when v_self then a.status <> 'revocada' or a.seen_at is not null
                  else a.status in ('provisional', 'firme') and not a.hidden
                       and (a.league_id is null or private.social_league_ok(a.league_id)) end
       order by a.awarded_at desc, a.id desc
       limit c_max + 1
    ) x;
  if v_n > c_max then
    v_awards := v_awards - c_max;
  end if;

  select coalesce(jsonb_agg(u.x order by u.n), '[]'::jsonb) into v_featured
    from public.profiles pr
    cross join lateral unnest(pr.featured_badges) with ordinality as u (x, n)
   where pr.id = p_user
     and exists (select 1 from public.badge_awards a left join public.players p on p.id = a.player_id
                  where a.id = u.x and (a.user_id = p_user or p.user_id = p_user)
                    and a.status in ('provisional', 'firme') and not a.hidden
                    and (a.league_id is null or private.social_league_ok(a.league_id)));

  return jsonb_build_object('userId', p_user, 'isMe', v_self, 'featured', v_featured, 'awards', v_awards,
                            'truncated', v_n > c_max);
end $$;

-- Destacadas del perfil: hasta 3 (repetidas cuentan una vez; null o [] las quita), en ese orden. Cada una suya
-- (de la cuenta o de uno de sus jugadores; si no: 'no_permitido'), provisional o firme, no oculta y no de una liga
-- con menores ('invalido'). Id que no existe: 'no_existe'. Devuelve cómo quedaron.
create function public.set_featured_badges(p_ids uuid[]) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_ids uuid[];
  v_id uuid;
  v_found boolean;
  v_owner uuid;
  v_status text;
  v_hidden boolean;
  v_minors boolean;
begin
  if coalesce(array_ndims(p_ids), 1) <> 1 then
    perform private.fail('invalido');
  end if;
  v_ids := array(select u.x from unnest(coalesce(p_ids, '{}'::uuid[])) with ordinality as u (x, n)
                  where u.x is not null group by u.x order by min(u.n));
  if cardinality(v_ids) > 3 then
    perform private.fail('invalido');
  end if;
  foreach v_id in array v_ids loop
    select true, coalesce(a.user_id, p.user_id), a.status, a.hidden, coalesce(l.has_minors, false)
      into v_found, v_owner, v_status, v_hidden, v_minors
      from public.badge_awards a
      left join public.players p on p.id = a.player_id
      left join public.leagues l on l.id = a.league_id
     where a.id = v_id;
    if v_found is null then
      perform private.fail('no_existe');
    end if;
    if v_owner is distinct from v_uid then
      perform private.deny();
    end if;
    if v_status not in ('provisional', 'firme') or v_hidden or v_minors then
      perform private.fail('invalido');
    end if;
    v_found := null;
  end loop;
  update public.profiles p set featured_badges = v_ids where p.id = v_uid and p.featured_badges is distinct from v_ids;
  return v_ids;
end $$;

-- Ocultar una insignia propia del perfil (true) o mostrarla (false; es el «Mostrar en mi perfil» de las privadas
-- por defecto). Oculta, sale de las destacadas. 'no_existe', 'no_permitido' (no es suya). Devuelve p_hidden.
create function public.set_badge_hidden(p_award uuid, p_hidden boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_found boolean;
  v_owner uuid;
begin
  if p_hidden is null then
    perform private.fail('invalido');
  end if;
  select true, coalesce(a.user_id, p.user_id) into v_found, v_owner
    from public.badge_awards a left join public.players p on p.id = a.player_id
   where a.id = p_award
     for update of a;
  if v_found is null then
    perform private.fail('no_existe');
  end if;
  if v_owner is distinct from v_uid then
    perform private.deny();
  end if;
  update public.badge_awards a set hidden = p_hidden where a.id = p_award and a.hidden is distinct from p_hidden;
  if p_hidden then
    update public.profiles p set featured_badges = array_remove(p.featured_badges, p_award)
     where p.id = v_uid and p_award = any (p.featured_badges);
  end if;
  return p_hidden;
end $$;

-- Ya las vio (el aviso de desbloqueo no vuelve a salir en ningún teléfono): hasta 50 ids ('invalido' si más o
-- null). Solo las suyas que no había visto; las demás se ignoran. Devuelve cuántas marcó.
create function public.mark_badges_seen(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  n integer;
begin
  if p_ids is null or coalesce(array_ndims(p_ids), 1) <> 1 or cardinality(p_ids) > 50 then
    perform private.fail('invalido');
  end if;
  update public.badge_awards a set seen_at = now()
   where a.id = any (p_ids) and a.seen_at is null
     and (a.user_id = v_uid or a.player_id in (select p.id from public.players p where p.user_id = v_uid));
  get diagnostics n = row_count;
  return n;
end $$;

-- Dueño (o superadmin): insignias automáticas de la liga 'todas' | 'sin_titulos' | 'ninguna' (también en ligas con
-- menores: el dueño decide). 'no_existe', 'no_permitido', 'invalido'. Devuelve el modo.
create function public.set_badges_auto(p_league uuid, p_mode text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  if not exists (select 1 from public.leagues l where l.id = p_league) then
    perform private.fail('no_existe');
  end if;
  if not private.is_owner(p_league) then
    perform private.deny();
  end if;
  if p_mode is null or p_mode not in ('todas', 'sin_titulos', 'ninguna') then
    perform private.fail('invalido');
  end if;
  update public.leagues l set badges_auto = p_mode where l.id = p_league and l.badges_auto is distinct from p_mode;
  return p_mode;
end $$;

-- Aval de una hazaña (§1.7.5, §3.4): un dueño o admin de la liga que no es el jugador ni compite en la evidencia
-- (private.badge_can_review), o el superadmin. p_ok: pasa a 'firme' (el motor avisa al jugador); si no, 'revocada'
-- con 'aval' (sin rastro público). La nota (≤ 140) queda en context.review {ok, at, note}. Ya decidida: devuelve
-- cómo quedó. Devuelve el estado.
create function public.review_badge(p_award uuid, p_ok boolean, p_note text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  a public.badge_awards;
  v_review jsonb;
begin
  select * into a from public.badge_awards x where x.id = p_award for update;
  if a.id is null then
    perform private.fail('no_existe');
  end if;
  if not private.is_super() and not private.badge_can_review(p_award, v_uid) then
    perform private.deny();
  end if;
  if p_ok is null or char_length(v_note) > 140 then
    perform private.fail('invalido');
  end if;
  if a.status <> 'en_revision' then
    return a.status;
  end if;
  v_review := jsonb_build_object('review', jsonb_build_object('ok', p_ok, 'at', private.iso(now()), 'note', v_note));
  if p_ok then
    update public.badge_awards x set status = 'firme', firm_at = now(), context = x.context || v_review where x.id = p_award;
  else
    update public.badge_awards x
       set status = 'revocada', revoked_at = now(), revoke_reason = 'aval', revoked_by = v_uid, context = x.context || v_review
     where x.id = p_award;
  end if;
  -- El superadmin que decide en una liga que no administra deja rastro en la auditoría.
  if private.is_super() and not exists (select 1 from public.league_members m
                                         where m.league_id = a.league_id and m.user_id = v_uid and m.role in ('owner', 'admin')) then
    perform private.audit('review_badge', 'league', a.league_id::text,
                          jsonb_build_object('award', a.id, 'key', a.badge_key, 'sport', a.sport, 'level', a.level,
                                             'playerId', a.player_id, 'ok', p_ok, 'note', v_note));
  end if;
  if p_ok then
    perform private.badge_signal('review', a.league_id, a.player_id, a.id);
  end if;
  return case when p_ok then 'firme' else 'revocada' end;
end $$;

-- Superadmin: retira una insignia por fraude (también una firme), sin push. Sale de las destacadas y queda en la
-- auditoría ('revoke_badge'). Nota ≤ 200. Ya revocada: nada. 'no_existe', 'invalido'.
create function public.super_revoke_badge(p_award uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_super();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  a public.badge_awards;
  v_owner uuid;
begin
  if char_length(v_note) > 200 then
    perform private.fail('invalido');
  end if;
  select * into a from public.badge_awards x where x.id = p_award for update;
  if a.id is null then
    perform private.fail('no_existe');
  end if;
  if a.status = 'revocada' then
    return;
  end if;
  update public.badge_awards x set status = 'revocada', revoked_at = now(), revoke_reason = 'fraude', revoked_by = v_uid
   where x.id = p_award;
  v_owner := coalesce(a.user_id, (select p.user_id from public.players p where p.id = a.player_id));
  update public.profiles p set featured_badges = array_remove(p.featured_badges, p_award)
   where p.id = v_owner and p_award = any (p.featured_badges);
  perform private.audit('revoke_badge',
                        case when a.user_id is not null then 'user' else 'league' end,
                        coalesce(a.user_id, a.league_id)::text,
                        jsonb_build_object('award', a.id, 'key', a.badge_key, 'sport', a.sport, 'level', a.level,
                                           'periodKey', a.period_key, 'playerId', a.player_id, 'userId', v_owner,
                                           'status', a.status, 'note', v_note));
end $$;

-- =====================================================================
-- Permisos: las RPC solo con sesión; las ayudas, nadie de la app
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array['profile_badges', 'set_featured_badges', 'set_badge_hidden', 'mark_badges_seen',
                                 'set_badges_auto', 'review_badge', 'super_revoke_badge', 'export_my_data'];
  v_private constant text[] := array['badges_auto_minors', 'badge_signal', 'merge_badges', 'badge_can_review',
                                     'merge_players'];
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
