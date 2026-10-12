-- MatchMate · Equipos (fuera de una liga) y transmisiones en vivo. Contrato completo: docs/equipos-y-en-vivo.md.
-- Pruebas: tests/sql/equipos-en-vivo.test.ts.
--
-- 1. Equipos («squads» en la base: `teams` ya son los equipos de cada liga). Tablas (RLS y sin lectura directa: todo
--    por RPC): public.squads, public.squad_members (un capitán, hasta 40), public.squad_secrets (el código para unirse),
--    public.squad_follows y public.squad_league_requests (una pendiente por equipo y liga). teams.squad_id: el equipo de
--    la liga que salió de un equipo; posts.squad_id: el muro del equipo (siempre 'public', sin liga).
--    - Contadores (member_count, follower_count) por triggers. Si el capitán borra su cuenta, la capitanía pasa al
--      miembro más antiguo; sin miembros el equipo se borra (como los equipos de esports). El logo va en el bucket
--      'logos' con la carpeta = id del equipo (la misma reserva private.logo_uploads, league_id = el equipo, y la misma
--      cola de Storage con private.queue_logo_purge).
--    - Inscribirse en una liga: el capitán pide (request_squad_league), los admins de la liga deciden. Al aprobar
--      (private.squad_materialize) se crea el equipo de temporada de la liga (la temporada de ahora, como
--      create_season_team) con el nombre, el color y squad_id del equipo; cada miembro entra a la liga (miembro y
--      jugador, como private.esp_ensure_player) y a la plantilla (el capitán como 'captain', con su posición y número);
--      quien ya está en otro equipo de esa temporada se salta. sync_squad_roster vuelve a pasar a los nuevos (en una
--      temporada nueva sin el equipo, lo crea). Si la liga borra el equipo, la solicitud aprobada queda 'withdrawn'.
--    - Récord: partidos 'finished' o 'confirmed' (y W.O. con ganador) de los equipos de liga con su squad_id.
--    - Avisos (categoría 'liga', prefijo 'equipo:'): «X se unió a tu equipo» al capitán ('equipo:miembro:<equipo>'),
--      «<equipo> quiere entrar a <liga>» a los admins ('equipo:solicitud:<solicitud>'), «<liga> aceptó/rechazó a
--      <equipo>» al capitán ('equipo:liga:<solicitud>').
-- 2. Transmisiones en vivo: leagues.live_enabled (set_league_live, admins) y public.live_streams (activa = sin ended_at
--    y empezada hace menos de 12 horas; una activa por partido o evento y hasta 5 por liga). Las ponen y quitan los
--    admins y anotadores de la liga (en el boliche, solo los admins) con un link https de YouTube, Twitch, Facebook,
--    Kick, Instagram o TikTok (private.stream_platform). 20 por día por liga. Aviso (categoría 'liga', tag
--    'envivo:<liga>') a los miembros y seguidores de la liga (sin quien la empezó, sin cuentas bloqueadas ni con un
--    bloqueo con quien la empezó), uno por liga cada 30 minutos. Tiempo real: 'league:<liga>' evento 'streams'
--    {op: 'insert' | 'end' | 'live', ids?, enabled?}.
--
-- Redefine (desde su última versión): public.create_post (20261009000100_red_social.sql: se borra y se crea con
-- p_squad), private.post_json y public.social_feed (…red_social: 'squad' en el Post y el muro de los equipos que sigo
-- o de los que soy miembro en Siguiendo), private.can_upload_logo_path y private.can_remove_logo_path
-- (20261008000100_esports.sql: la carpeta también puede ser un equipo), public.purge_queue_take (…red_social: el logo
-- de un equipo en uso no se borra), private.push_category (…esports: 'equipo' y 'envivo' en 'liga') y
-- public.start_season (20260929000700_temporadas.sql: copiar los equipos de la temporada anterior copia también su
-- squad_id). Una migración posterior que redefina alguna tiene que copiar esta.

-- =====================================================================
-- 1. Tablas
-- =====================================================================

create table public.squads (
  id uuid primary key default gen_random_uuid(),
  sport text not null references public.sport_status (id) check (sport <> 'esports'),
  name text not null check (char_length(name) between 2 and 40 and btrim(name) = name),
  tag text not null check (tag ~ '^[A-Z0-9]{2,5}$'),
  description text not null default '' check (char_length(description) <= 200),
  city text check (city is null or (char_length(city) between 1 and 40 and btrim(city) = city)),
  color text check (color is null or color ~ '^#[0-9a-f]{6}$'),
  logo_path text,
  recruiting boolean not null default false,
  captain_id uuid references public.profiles (id) on delete set null,
  member_count smallint not null default 0 check (member_count between 0 and 40),
  follower_count integer not null default 0 check (follower_count >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default date_trunc('milliseconds', now()),
  updated_at timestamptz not null default now(),
  check (logo_path is null or logo_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$'))
);
create unique index squads_name on public.squads (sport, private.normalize_name(name));
create index squads_captain on public.squads (captain_id);

create table public.squad_members (
  squad_id uuid not null references public.squads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('captain', 'member')),
  position text check (position is null or (char_length(position) between 1 and 20 and btrim(position) = position)),
  jersey smallint check (jersey between 0 and 99),
  joined_at timestamptz not null default now(),
  primary key (squad_id, user_id)
);
create unique index squad_members_captain on public.squad_members (squad_id) where role = 'captain';
create unique index squad_members_jersey on public.squad_members (squad_id, jersey) where jersey is not null;
create index squad_members_user on public.squad_members (user_id, joined_at);

-- El código para unirse: solo lo ve el capitán (y el superadmin), por squad_code.
create table public.squad_secrets (
  squad_id uuid primary key references public.squads (id) on delete cascade,
  invite_code text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  updated_at timestamptz not null default now()
);

create table public.squad_follows (
  squad_id uuid not null references public.squads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (squad_id, user_id)
);
create index squad_follows_user on public.squad_follows (user_id, created_at desc);

create table public.squad_league_requests (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads (id) on delete cascade,
  league_id uuid not null references public.leagues (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_by uuid references public.profiles (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  note text check (note is null or char_length(note) between 1 and 200),
  created_at timestamptz not null default date_trunc('milliseconds', now()),
  decided_at timestamptz
);
create unique index squad_league_requests_pending on public.squad_league_requests (squad_id, league_id) where status = 'pending';
create index squad_league_requests_league on public.squad_league_requests (league_id, created_at desc);
create index squad_league_requests_squad on public.squad_league_requests (squad_id, league_id, created_at desc);

-- El equipo de la liga que salió de un equipo (solo equipos de temporada). Borrar el equipo no borra el de la liga.
alter table public.teams add column squad_id uuid references public.squads (id) on delete set null,
  add constraint teams_squad_only_season check (squad_id is null or event_id is null);
create index teams_squad_idx on public.teams (squad_id) where squad_id is not null;

-- El muro del equipo: siempre 'public' y sin liga. Borrar el equipo borra su muro (las fotos van a la cola).
alter table public.posts add column squad_id uuid references public.squads (id) on delete cascade,
  add constraint posts_squad_check check (squad_id is null or (league_id is null and visibility = 'public'));
create index posts_squad_idx on public.posts (squad_id, created_at desc, id desc) where squad_id is not null;

-- Transmisiones en vivo (lo lee la app con la liga: columna nueva de leagues).
alter table public.leagues add column live_enabled boolean not null default false;

create table public.live_streams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  match_id uuid,
  event_id uuid,
  url text not null check (char_length(url) between 12 and 300),
  platform text not null check (platform in ('youtube', 'twitch', 'facebook', 'kick', 'instagram', 'tiktok')),
  title text check (title is null or char_length(title) between 1 and 80),
  started_by uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default date_trunc('milliseconds', now()),
  ended_at timestamptz,
  foreign key (match_id, league_id) references public.matches (id, league_id) on delete cascade,
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  check (match_id is null or event_id is null),
  check (ended_at is null or ended_at >= started_at)
);
create unique index live_streams_match_active on public.live_streams (match_id) where ended_at is null and match_id is not null;
create unique index live_streams_event_active on public.live_streams (event_id) where ended_at is null and event_id is not null;
create index live_streams_league_active on public.live_streams (league_id, started_at desc) where ended_at is null;
create index live_streams_started_by on public.live_streams (started_by);

alter table public.squads enable row level security;
alter table public.squad_members enable row level security;
alter table public.squad_secrets enable row level security;
alter table public.squad_follows enable row level security;
alter table public.squad_league_requests enable row level security;
alter table public.live_streams enable row level security;
revoke all on public.squads, public.squad_members, public.squad_secrets, public.squad_follows, public.squad_league_requests,
  public.live_streams from public, anon, authenticated;

-- =====================================================================
-- 2. Ayudas
-- =====================================================================

-- Un equipo en una lista (el SquadLite de docs/equipos-y-en-vivo.md).
create function private.squad_lite(s public.squads) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'sport', s.sport, 'name', s.name, 'tag', s.tag, 'logo', s.logo_path, 'color', s.color,
                            'city', s.city, 'recruiting', s.recruiting, 'members', s.member_count, 'followers', s.follower_count)
$$;

-- Nombre, ciudad o posición de una línea: los espacios seguidos (y saltos) quedan en uno, sin espacios alrededor.
create function private.squad_line(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(coalesce(p, ''), '[\x01-\x08\x0e-\x1f\x7f]', '', 'g'), '\s+', ' ', 'g'))
$$;

-- El color '#rrggbb' en minúsculas; null o '' = sin color; otra cosa: 'invalido'.
create function private.squad_color(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text := nullif(btrim(coalesce(p, '')), '');
begin
  if v is null then
    return null;
  end if;
  if v !~ '^#[0-9a-fA-F]{6}$' then
    perform private.fail('invalido');
  end if;
  return lower(v);
end $$;

-- Código nuevo para un equipo (8 caracteres como los de las ligas), sin repetir.
create function private.squad_new_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v text;
begin
  for i in 1..10 loop
    v := private.new_invite_code();
    if not exists (select 1 from public.squad_secrets s where s.invite_code = v) then
      return v;
    end if;
  end loop;
  perform private.fail('duplicado');
  return null;
end $$;

-- El equipo bloqueado y la cuenta es su capitán (o superadmin). 'no_existe', 'no_permitido'.
create function private.squad_as_captain(p_squad uuid) returns public.squads
language plpgsql security definer set search_path = '' as $$
declare
  v_sq public.squads;
begin
  select * into v_sq from public.squads x where x.id = p_squad for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  if v_sq.captain_id is distinct from auth.uid() and not private.is_super() then
    perform private.deny();
  end if;
  return v_sq;
end $$;

-- De cuántos equipos es miembro la cuenta (p_captain: de cuántos es capitán).
create function private.squad_count(p_user uuid, p_captain boolean default false) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.squad_members m where m.user_id = p_user and (not p_captain or m.role = 'captain')
$$;

-- Récord de los equipos de liga que salieron del equipo (en una liga, o en todas con p_league null): partidos
-- terminados o confirmados (y W.O. con ganador). {played, won, drawn, lost}.
create function private.squad_record(p_squad uuid, p_league uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'played', count(*)::integer,
    'won', (count(*) filter (where m.winner_side = s.side))::integer,
    'drawn', (count(*) filter (where m.winner_side is null))::integer,
    'lost', (count(*) filter (where m.winner_side is not null and m.winner_side <> s.side))::integer)
    from public.match_sides s
    join public.teams t on t.id = s.team_id
    join public.matches m on m.id = s.match_id
   where t.squad_id = p_squad
     and (p_league is null or m.league_id = p_league)
     and (m.status in ('finished', 'confirmed') or (m.status = 'walkover' and m.winner_side is not null))
$$;

-- Las ligas del equipo (SquadLeague[]): la última solicitud de cada liga que la cuenta de la sesión ve (pública, o es
-- miembro, o superadmin). p_all (miembros del equipo): todas; si no, solo las aprobadas.
create function private.squad_leagues_json(p_squad uuid, p_all boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'leagueId', l.id, 'name', l.name, 'sport', l.sport, 'logo', l.logo_path, 'status', r.status, 'requestId', r.id,
           'record', private.squad_record(p_squad, l.id))
           order by (r.status = 'approved') desc, (r.status = 'pending') desc, l.name, l.id), '[]'::jsonb)
    from (select distinct on (x.league_id) x.*
            from public.squad_league_requests x
           where x.squad_id = p_squad
           order by x.league_id, x.created_at desc, x.id desc) r
    join public.leagues l on l.id = r.league_id
   where (p_all or r.status = 'approved')
     and (l.visibility = 'public' or private.is_member(l.id) or private.is_super())
$$;

-- La cuenta como miembro y jugador de la liga (como private.esp_ensure_player: sin reclamos por nombre). Devuelve el
-- jugador.
create function private.squad_ensure_player(p_league uuid, p_user uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := left(coalesce((select nullif(btrim(p.name), '') from public.profiles p where p.id = p_user), 'Jugador'), 60);
  v_player uuid;
begin
  insert into public.league_members (league_id, user_id, role, display_name) values (p_league, p_user, 'member', v_name)
  on conflict (league_id, user_id) do nothing;
  update public.league_members m set scorer_only = false where m.league_id = p_league and m.user_id = p_user and m.scorer_only;
  select p.id into v_player from public.players p where p.league_id = p_league and p.user_id = p_user;
  if v_player is null then
    insert into public.players (league_id, user_id, name) values (p_league, p_user, v_name) returning id into v_player;
  end if;
  return v_player;
end $$;

-- El equipo en la liga: su equipo de temporada (el de la temporada de ahora: la activa o, entre temporadas, la última;
-- si no hay, se crea con el nombre, el color y squad_id, como create_season_team) y la plantilla. Cada miembro entra a
-- la liga y a la plantilla con su posición y su número (si nadie del equipo lo tiene), el capitán como 'captain'; ya
-- en la plantilla, el capitán del equipo queda 'captain' y quien dejó de serlo, 'player'. Se salta (skipped) quien ya
-- está en otro equipo de esa temporada de la liga y las cuentas bloqueadas. Nadie sale de la plantilla. p_create =
-- false (sync): sin ningún equipo de la liga con ese squad_id, 'no_existe'. Devuelve {teamId, added, skipped}.
create function private.squad_materialize(p_squad uuid, p_league uuid, p_create boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sq public.squads;
  v_team public.teams;
  v_season uuid := private.current_season(p_league);
  r record;
  v_player uuid;
  v_added integer := 0;
  v_skipped integer := 0;
begin
  select * into v_sq from public.squads x where x.id = p_squad;
  if v_sq.id is null then
    perform private.fail('no_existe');
  end if;
  select * into v_team from public.teams x
   where x.league_id = p_league and x.squad_id = p_squad and x.event_id is null and x.season_id is not distinct from v_season
   order by x.created_at desc, x.id desc
   limit 1
     for update;
  if v_team.id is null then
    if not p_create and not exists (select 1 from public.teams x where x.league_id = p_league and x.squad_id = p_squad) then
      perform private.fail('no_existe');
    end if;
    insert into public.teams (league_id, event_id, season_id, name, sort_order, color, squad_id)
    values (p_league, null, v_season, left(v_sq.name, 60),
            coalesce((select max(x.sort_order) from public.teams x where x.league_id = p_league and x.event_id is null), 0) + 1,
            v_sq.color, v_sq.id)
    returning * into v_team;
  end if;

  for r in select m.user_id, m.role, m.position, m.jersey, p.blocked_at
             from public.squad_members m join public.profiles p on p.id = m.user_id
            where m.squad_id = p_squad
            order by (m.role = 'captain') desc, m.joined_at, m.user_id loop
    if r.blocked_at is not null
       or exists (select 1 from public.players p
                    join public.team_players tp on tp.player_id = p.id
                    join public.teams t on t.id = tp.team_id
                   where p.league_id = p_league and p.user_id = r.user_id and t.event_id is null and t.id <> v_team.id
                     and t.season_id is not distinct from v_team.season_id) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_player := private.squad_ensure_player(p_league, r.user_id);
    if exists (select 1 from public.team_players tp where tp.team_id = v_team.id and tp.player_id = v_player) then
      if r.role = 'captain' then
        update public.team_players tp set role = 'captain'
         where tp.team_id = v_team.id and tp.player_id = v_player and tp.role <> 'captain';
      end if;
      continue;
    end if;
    insert into public.team_players (team_id, player_id, league_id, jersey, position, role)
    values (v_team.id, v_player, p_league,
            case when r.jersey is not null
                      and not exists (select 1 from public.team_players x where x.team_id = v_team.id and x.jersey = r.jersey)
                 then r.jersey end,
            r.position, case when r.role = 'captain' then 'captain' else 'player' end);
    v_added := v_added + 1;
  end loop;
  -- El capitán del equipo es el único capitán que viene del equipo.
  update public.team_players tp set role = 'player'
   where tp.team_id = v_team.id and tp.role = 'captain'
     and tp.player_id in (select p.id from public.players p
                            join public.squad_members m on m.user_id = p.user_id and m.squad_id = p_squad
                           where p.league_id = p_league and m.role <> 'captain');
  return jsonb_build_object('teamId', v_team.id, 'added', v_added, 'skipped', v_skipped);
end $$;

-- ---------- Transmisiones ----------

-- La plataforma de un link de transmisión, o null si no se acepta: https, sin usuario ni puerto, hasta 300
-- caracteres, sin espacios ni caracteres de control, y el host exacto de una de las seis.
create function private.stream_platform(p_url text) returns text
language sql immutable set search_path = '' as $$
  select case lower(x.host)
           when 'youtube.com' then 'youtube'
           when 'www.youtube.com' then 'youtube'
           when 'm.youtube.com' then 'youtube'
           when 'youtu.be' then 'youtube'
           when 'twitch.tv' then 'twitch'
           when 'www.twitch.tv' then 'twitch'
           when 'm.twitch.tv' then 'twitch'
           when 'facebook.com' then 'facebook'
           when 'www.facebook.com' then 'facebook'
           when 'm.facebook.com' then 'facebook'
           when 'fb.watch' then 'facebook'
           when 'kick.com' then 'kick'
           when 'www.kick.com' then 'kick'
           when 'instagram.com' then 'instagram'
           when 'www.instagram.com' then 'instagram'
           when 'tiktok.com' then 'tiktok'
           when 'www.tiktok.com' then 'tiktok'
           when 'vm.tiktok.com' then 'tiktok'
         end
    from (select substring(p_url from '^[Hh][Tt][Tt][Pp][Ss]://([A-Za-z0-9.-]+)(?:[/?#]|$)') as host) x
   where p_url is not null and char_length(p_url) <= 300 and p_url !~ '[[:space:][:cntrl:]\\]'
$$;

-- ¿La cuenta de la sesión pone y quita transmisiones en la liga? Admins y anotadores (en el boliche, solo admins).
create function private.stream_can(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
     and exists (select 1 from public.leagues l
                  where l.id = p_league and (private.is_admin(l.id) or (l.sport <> 'bowling' and private.is_scorer(l.id))))
$$;

-- «Tigres vs Leones» (partido), el nombre del evento («Torneo del 3 de octubre» si no tiene) o null.
create function private.stream_label(p_match uuid, p_event uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_match is not null then
      coalesce((select x.label from public.match_sides x where x.match_id = p_match and x.side = 1), 'Por definir') || ' vs '
      || coalesce((select x.label from public.match_sides x where x.match_id = p_match and x.side = 2), 'Por definir')
    when p_event is not null then
      (select coalesce(nullif(btrim(e.name), ''),
                       case e.type when 'torneo' then 'Torneo' when 'practica' then 'Práctica'
                                   else initcap(replace(e.type, '_', ' ')) end || ' del ' || private.push_day(e.date))
         from public.events e where e.id = p_event)
  end
$$;

-- Una transmisión (el LiveStream de docs/equipos-y-en-vivo.md) para la cuenta de la sesión (o sin sesión).
create function private.stream_json(s public.live_streams) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id,
    'leagueId', s.league_id,
    'leagueName', l.name,
    'sport', l.sport,
    'matchId', s.match_id,
    'eventId', s.event_id,
    'url', s.url,
    'platform', s.platform,
    'title', s.title,
    'label', private.stream_label(s.match_id, s.event_id),
    'startedAt', private.iso(s.started_at),
    'startedBy', jsonb_build_object(
      'id', s.started_by,
      'name', coalesce((select m.display_name from public.league_members m where m.league_id = s.league_id and m.user_id = s.started_by),
                       (select p.name from public.profiles p where p.id = s.started_by), 'Alguien')),
    'canEnd', private.stream_can(s.league_id))
    from public.leagues l where l.id = s.league_id
$$;

-- Aviso «🔴 En vivo: <título o partido>» a los miembros y seguidores de la liga (los seguidores solo si la liga es
-- pública y sin menores), sin quien la empezó, sin cuentas bloqueadas ni con un bloqueo con quien la empezó. Uno por
-- liga cada 30 minutos ('envivo:<liga>' en private.rate_limits). Nunca falla. Devuelve a cuántas cuentas encoló.
create function private.stream_push(s public.live_streams) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_l public.leagues;
  v_tag text := 'envivo:' || s.league_id::text;
  v_title text;
  v_to uuid;
  v_n integer := 0;
begin
  select * into v_l from public.leagues x where x.id = s.league_id;
  if v_l.id is null or not private.rate_take(v_tag, 1, interval '30 minutes') then
    return 0;
  end if;
  v_title := left('🔴 En vivo: ' || coalesce(s.title, private.stream_label(s.match_id, s.event_id), v_l.name), 200);
  perform set_config('mm.push_batch', 'on', true);
  for v_to in
    select u.user_id
      from (select m.user_id from public.league_members m where m.league_id = v_l.id
            union
            select f.user_id from public.league_follows f
             where f.league_id = v_l.id and v_l.visibility = 'public' and not v_l.has_minors) u
      join public.profiles p on p.id = u.user_id
     where u.user_id <> s.started_by
       and p.blocked_at is null
       and not private.blocked_between(u.user_id, s.started_by)
       and exists (select 1 from public.push_subscriptions x where x.user_id = u.user_id)
     order by u.user_id
  loop
    if private.queue_push(v_to, 'liga', v_title, v_l.name, '/l/' || v_l.id::text || '/vivo', v_tag, 10800, v_title) then
      v_n := v_n + 1;
    end if;
  end loop;
  perform set_config('mm.push_batch', '', true);
  if v_n > 0 then
    perform private.kick_send_push();
  end if;
  return v_n;
exception when others then
  raise warning 'push de la transmisión %: %', s.id, sqlerrm;
  return 0;
end $$;

-- =====================================================================
-- 3. Triggers
-- =====================================================================

create trigger squads_touch before update on public.squads for each row execute function private.touch_updated_at();
create trigger squad_secrets_touch before update on public.squad_secrets for each row execute function private.touch_updated_at();

-- Miembros (una vez por sentencia): member_count al día; si se fue el capitán (borró su cuenta), pasa al miembro más
-- antiguo; sin miembros, el equipo se borra (con su logo a la cola de Storage).
create function private.squad_members_count() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_squads uuid[];
  v_id uuid;
  v_new uuid;
begin
  if tg_op = 'DELETE' then
    select array_agg(distinct o.squad_id) into v_squads from old_rows o;
  else
    select array_agg(distinct n.squad_id) into v_squads from new_rows n;
  end if;
  foreach v_id in array coalesce(v_squads, '{}'::uuid[]) loop
    continue when not exists (select 1 from public.squads x where x.id = v_id);
    if not exists (select 1 from public.squad_members m where m.squad_id = v_id) then
      delete from public.squads x where x.id = v_id;
      continue;
    end if;
    if not exists (select 1 from public.squad_members m where m.squad_id = v_id and m.role = 'captain') then
      select m.user_id into v_new from public.squad_members m where m.squad_id = v_id order by m.joined_at, m.user_id limit 1;
      update public.squad_members m set role = 'captain' where m.squad_id = v_id and m.user_id = v_new;
      update public.squads x set captain_id = v_new where x.id = v_id;
    end if;
    update public.squads x
       set member_count = (select count(*) from public.squad_members m where m.squad_id = v_id)
     where x.id = v_id and x.member_count <> (select count(*) from public.squad_members m where m.squad_id = v_id);
  end loop;
  return null;
end $$;

create trigger squad_members_count_insert after insert on public.squad_members referencing new table as new_rows
  for each statement execute function private.squad_members_count();
create trigger squad_members_count_delete after delete on public.squad_members referencing old table as old_rows
  for each statement execute function private.squad_members_count();

-- Seguidores (también los que se van con una cuenta borrada).
create function private.squad_follows_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.squads x set follower_count = x.follower_count + 1 where x.id = new.squad_id;
  else
    update public.squads x set follower_count = greatest(x.follower_count - 1, 0) where x.id = old.squad_id;
  end if;
  return null;
end $$;

create trigger squad_follows_count after insert or delete on public.squad_follows
  for each row execute function private.squad_follows_count();

-- El logo que deja de usarse (cambiado, quitado o el equipo borrado) y sus reservas van a la cola de Storage: la misma
-- función de los logos de las ligas y de los equipos de esports.
create trigger squads_logo_purge after update of logo_path or delete on public.squads
  for each row execute function private.queue_logo_purge();

-- La liga borró el último equipo que salió del equipo: su solicitud aprobada queda 'withdrawn' (puede volver a pedir).
create function private.squad_team_gone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.teams t where t.league_id = old.league_id and t.squad_id = old.squad_id) then
    update public.squad_league_requests r set status = 'withdrawn', decided_at = now()
     where r.squad_id = old.squad_id and r.league_id = old.league_id and r.status = 'approved';
  end if;
  return null;
end $$;

create trigger teams_squad_gone after delete on public.teams for each row when (old.squad_id is not null)
  execute function private.squad_team_gone();

-- =====================================================================
-- 4. RPC: equipos
-- =====================================================================

-- Crea un equipo de un deporte que no es esports (abierto; en beta, solo el superadmin). Quien lo crea es el capitán.
-- Nombre 2–40 (una línea; repetido en el deporte sin acentos ni mayúsculas: 'duplicado'), tag 2–5 [A-Z0-9] (se pasa a
-- mayúsculas), descripción ≤ 200, ciudad ≤ 40, color '#rrggbb'. 'invalido', 'palabras', 'limite' (capitán de 10 o
-- miembro de 20 equipos), 'rate_limited' (5 por día). p_id lo puede poner el teléfono: el mismo otra vez devuelve el que
-- ya está si sigo siendo su capitán ('duplicado' si no). Devuelve {squadId, inviteCode}.
create function public.create_squad(p_sport text, p_name text, p_tag text, p_description text default '',
                                    p_city text default null, p_color text default null, p_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_sport text := lower(btrim(coalesce(p_sport, '')));
  v_name text := private.squad_line(p_name);
  v_tag text := upper(btrim(coalesce(p_tag, '')));
  v_desc text := private.social_clean_text(p_description);
  v_city text := nullif(private.squad_line(p_city), '');
  v_color text := private.squad_color(p_color);
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_sq public.squads;
  v_code text;
begin
  if p_id is not null then
    select * into v_sq from public.squads x where x.id = p_id;
    if v_sq.id is not null then
      if v_sq.captain_id is distinct from v_me then
        perform private.fail('duplicado');
      end if;
      return jsonb_build_object('squadId', v_sq.id,
                                'inviteCode', (select s.invite_code from public.squad_secrets s where s.squad_id = v_sq.id));
    end if;
  end if;
  if not exists (select 1 from public.sport_status s
                  where s.id = v_sport and s.family <> 'esports' and (s.status = 'open' or private.is_super()))
     or char_length(v_name) not between 2 and 40 or v_tag !~ '^[A-Z0-9]{2,5}$' or char_length(v_desc) > 200
     or char_length(v_city) > 40 then
    perform private.fail('invalido');
  end if;
  if not private.social_text_ok(v_name) or not private.social_text_ok(v_desc) or not private.social_text_ok(coalesce(v_city, ''))
     or not private.social_text_ok(v_tag) then
    perform private.fail('palabras');
  end if;
  if exists (select 1 from public.squads x where x.sport = v_sport and private.normalize_name(x.name) = private.normalize_name(v_name)) then
    perform private.fail('duplicado');
  end if;
  if private.squad_count(v_me, true) >= 10 or private.squad_count(v_me) >= 20 then
    perform private.fail('limite');
  end if;
  if not private.rate_take('squad:' || v_me::text, 5, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  insert into public.squads (id, sport, name, tag, description, city, color, captain_id, created_by)
  values (v_id, v_sport, v_name, v_tag, v_desc, v_city, v_color, v_me, v_me);
  insert into public.squad_members (squad_id, user_id, role) values (v_id, v_me, 'captain');
  v_code := private.squad_new_code();
  insert into public.squad_secrets (squad_id, invite_code) values (v_id, v_code);
  return jsonb_build_object('squadId', v_id, 'inviteCode', v_code);
end $$;

-- El capitán (o el superadmin) cambia name, tag, description, city, color o recruiting (otra clave u otro tipo:
-- 'invalido'). Las mismas reglas que create_squad ('duplicado', 'palabras'). Los equipos que ya están en ligas no
-- cambian (los administra la liga).
create function public.update_squad(p_squad uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_sq public.squads;
  v_name text;
  v_tag text;
  v_desc text;
  v_city text;
  v_color text;
  v_recruiting boolean;
begin
  perform private.require_uid();
  v_sq := private.squad_as_captain(p_squad);
  if jsonb_typeof(p_patch) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_patch) k
                 where k not in ('name', 'tag', 'description', 'city', 'color', 'recruiting'))
     or (p_patch ? 'recruiting' and jsonb_typeof(p_patch -> 'recruiting') <> 'boolean') then
    perform private.fail('invalido');
  end if;
  v_name := case when p_patch ? 'name' then private.squad_line(p_patch ->> 'name') else v_sq.name end;
  v_tag := case when p_patch ? 'tag' then upper(btrim(coalesce(p_patch ->> 'tag', ''))) else v_sq.tag end;
  v_desc := case when p_patch ? 'description' then private.social_clean_text(p_patch ->> 'description') else v_sq.description end;
  v_city := case when p_patch ? 'city' then nullif(private.squad_line(p_patch ->> 'city'), '') else v_sq.city end;
  v_color := case when p_patch ? 'color' then private.squad_color(p_patch ->> 'color') else v_sq.color end;
  v_recruiting := case when p_patch ? 'recruiting' then (p_patch -> 'recruiting')::boolean else v_sq.recruiting end;
  if char_length(v_name) not between 2 and 40 or v_tag !~ '^[A-Z0-9]{2,5}$' or char_length(v_desc) > 200
     or char_length(v_city) > 40 then
    perform private.fail('invalido');
  end if;
  if not private.social_text_ok(v_name) or not private.social_text_ok(v_desc) or not private.social_text_ok(coalesce(v_city, ''))
     or not private.social_text_ok(v_tag) then
    perform private.fail('palabras');
  end if;
  if exists (select 1 from public.squads x where x.sport = v_sq.sport and x.id <> v_sq.id
                and private.normalize_name(x.name) = private.normalize_name(v_name)) then
    perform private.fail('duplicado');
  end if;
  update public.squads x set name = v_name, tag = v_tag, description = v_desc, city = v_city, color = v_color,
                             recruiting = v_recruiting
   where x.id = v_sq.id
     and (x.name, x.tag, x.description, x.city, x.color, x.recruiting)
         is distinct from (v_name, v_tag, v_desc, v_city, v_color, v_recruiting);
end $$;

-- El capitán (o el superadmin) borra el equipo: su muro, sus seguidores y sus solicitudes se van con él; los equipos
-- de liga que salieron de él se quedan en sus ligas (sin squad_id). El logo va a la cola de Storage.
create function public.delete_squad(p_squad uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_sq public.squads;
begin
  perform private.require_uid();
  v_sq := private.squad_as_captain(p_squad);
  delete from public.squads x where x.id = v_sq.id;
end $$;

-- El código para invitar (capitán o superadmin).
create function public.squad_code(p_squad uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sq public.squads;
begin
  perform private.require_uid();
  select * into v_sq from public.squads x where x.id = p_squad;
  if v_sq.id is null then
    perform private.fail('no_existe');
  end if;
  if v_sq.captain_id is distinct from auth.uid() and not private.is_super() then
    perform private.deny();
  end if;
  return (select s.invite_code from public.squad_secrets s where s.squad_id = p_squad);
end $$;

-- Código nuevo (el anterior deja de servir).
create function public.renew_squad_code(p_squad uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_sq public.squads;
  v_code text;
begin
  perform private.require_uid();
  v_sq := private.squad_as_captain(p_squad);
  v_code := private.squad_new_code();
  insert into public.squad_secrets as s (squad_id, invite_code) values (v_sq.id, v_code)
  on conflict (squad_id) do update set invite_code = excluded.invite_code;
  return v_code;
end $$;

-- A qué equipo lleva un código (también sin cuenta): SquadLite o null. Código malo: cuenta el intento (30 por hora
-- por cuenta o IP: 'rate_limited'). Mayúsculas y espacios no importan.
create function public.squad_preview(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := private.rate_key('squad_preview');
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_sq public.squads;
begin
  if private.rate_blocked(v_key, 30, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  select x.* into v_sq from public.squad_secrets s join public.squads x on x.id = s.squad_id where s.invite_code = v_code;
  if v_sq.id is null then
    perform private.rate_hit(v_key, interval '1 hour');
    return null;
  end if;
  return private.squad_lite(v_sq);
end $$;

-- Entrar a un equipo con su código. Código malo: null (cuenta el intento; 10 por hora: 'rate_limited'). Ya es miembro:
-- lo mismo. 'cupo_lleno' (40 miembros), 'limite' (ya es de 20 equipos). Entra como 'member' y deja de seguirlo (los
-- miembros no lo siguen). Aviso al capitán. Devuelve {squadId}.
create function public.join_squad(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_key text := 'squad_join:' || v_me::text;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_sq public.squads;
  v_title text;
begin
  if private.rate_blocked(v_key, 10, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  select x.* into v_sq from public.squad_secrets s join public.squads x on x.id = s.squad_id
   where s.invite_code = v_code for update of x;
  if v_sq.id is null then
    perform private.rate_hit(v_key, interval '1 hour');
    return null;
  end if;
  if exists (select 1 from public.squad_members m where m.squad_id = v_sq.id and m.user_id = v_me) then
    return jsonb_build_object('squadId', v_sq.id);
  end if;
  if (select count(*) from public.squad_members m where m.squad_id = v_sq.id) >= 40 then
    perform private.fail('cupo_lleno');
  end if;
  if private.squad_count(v_me) >= 20 then
    perform private.fail('limite');
  end if;
  insert into public.squad_members (squad_id, user_id, role) values (v_sq.id, v_me, 'member');
  delete from public.squad_follows f where f.squad_id = v_sq.id and f.user_id = v_me;
  if v_sq.captain_id is not null and v_sq.captain_id <> v_me then
    begin
      v_title := left(private.push_who((select p.name from public.profiles p where p.id = v_me), 1) || ' se unió a tu equipo', 200);
      perform private.queue_push(v_sq.captain_id, 'liga', v_title, v_sq.name, '/equipos/' || v_sq.id::text,
                                 'equipo:miembro:' || v_sq.id::text, 86400, v_title);
    exception when others then
      raise warning 'push de unirse al equipo %: %', v_sq.id, sqlerrm;
    end;
  end if;
  return jsonb_build_object('squadId', v_sq.id);
end $$;

-- Salir del equipo. El capitán no sale si quedan otros ('invalido': primero pasa la capitanía); si es el único, el
-- equipo se borra. 'no_existe' si no es miembro.
create function public.leave_squad(p_squad uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_role text;
begin
  perform 1 from public.squads x where x.id = p_squad for update;
  select m.role into v_role from public.squad_members m where m.squad_id = p_squad and m.user_id = v_me;
  if v_role is null then
    perform private.fail('no_existe');
  end if;
  if v_role = 'captain' and exists (select 1 from public.squad_members m where m.squad_id = p_squad and m.user_id <> v_me) then
    perform private.fail('invalido');
  end if;
  -- El último que sale se lleva el equipo (lo borra el trigger de los miembros).
  delete from public.squad_members m where m.squad_id = p_squad and m.user_id = v_me;
end $$;

-- El capitán (o el superadmin) saca a un miembro (no al capitán: 'invalido'). 'no_existe' si no es miembro.
create function public.remove_squad_member(p_squad uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_sq public.squads;
begin
  perform private.require_uid();
  v_sq := private.squad_as_captain(p_squad);
  if p_user is not distinct from v_sq.captain_id then
    perform private.fail('invalido');
  end if;
  delete from public.squad_members m where m.squad_id = v_sq.id and m.user_id = p_user;
  if not found then
    perform private.fail('no_existe');
  end if;
end $$;

-- El capitán (o el superadmin) cambia a un miembro:
-- - p_role null (o el rol que ya tiene): pone la posición (≤ 20, una línea; null o '' la quita) y el número (0–99;
--   null lo quita; repetido en el equipo: 'duplicado');
-- - p_role 'captain' a otro: le pasa la capitanía (el anterior queda 'member'); su posición y número solo cambian si
--   vienen (null = se quedan). Bajarse a sí mismo a 'member' sin pasarla: 'invalido'.
-- 'invalido' (otro rol, posición o número), 'no_existe' (no es miembro).
create function public.set_squad_member(p_squad uuid, p_user uuid, p_role text default null, p_position text default null,
                                        p_jersey integer default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_sq public.squads;
  v_m public.squad_members;
  v_pos text := nullif(private.squad_line(p_position), '');
  v_change boolean;
begin
  perform private.require_uid();
  v_sq := private.squad_as_captain(p_squad);
  if (p_role is not null and p_role not in ('captain', 'member')) or char_length(v_pos) > 20
     or (p_jersey is not null and p_jersey not between 0 and 99) then
    perform private.fail('invalido');
  end if;
  select * into v_m from public.squad_members m where m.squad_id = v_sq.id and m.user_id = p_user for update;
  if v_m.user_id is null then
    perform private.fail('no_existe');
  end if;
  v_change := p_role is not null and p_role <> v_m.role;
  if v_change and v_m.role = 'captain' then
    perform private.fail('invalido');
  end if;
  if p_jersey is not null and exists (select 1 from public.squad_members m
                                       where m.squad_id = v_sq.id and m.jersey = p_jersey and m.user_id <> p_user) then
    perform private.fail('duplicado');
  end if;
  if v_change then
    update public.squad_members m set role = 'member' where m.squad_id = v_sq.id and m.role = 'captain';
    update public.squad_members m
       set role = 'captain', position = coalesce(v_pos, m.position), jersey = coalesce(p_jersey::smallint, m.jersey)
     where m.squad_id = v_sq.id and m.user_id = p_user;
    update public.squads x set captain_id = p_user where x.id = v_sq.id;
  else
    update public.squad_members m set position = v_pos, jersey = p_jersey::smallint
     where m.squad_id = v_sq.id and m.user_id = p_user and (m.position, m.jersey) is distinct from (v_pos, p_jersey::smallint);
  end if;
end $$;

-- El capitán, antes de subir el logo: reserva la ruta '<p_squad>/<uuid>.webp|.jpg|.png' (nueva: ni reservada, ni en la
-- cola de Storage, ni el logo de ahora). Como esports_begin_team_logo: private.logo_uploads con el equipo en league_id
-- y el mismo límite 'logo:<cuenta>' (30 por día). 'no_existe', 'no_permitido', 'invalido', 'rate_limited'.
create function public.begin_squad_logo(p_squad uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_sq public.squads;
begin
  v_sq := private.squad_as_captain(p_squad);
  if p_path is null or p_path !~ ('^' || v_sq.id::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$')
     or exists (select 1 from private.logo_uploads u where u.path = p_path)
     or exists (select 1 from private.storage_purge_queue q where q.path = p_path)
     or v_sq.logo_path is not distinct from p_path then
    perform private.fail('invalido');
  end if;
  if not private.rate_take('logo:' || v_me::text, 30, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  insert into private.logo_uploads (path, league_id, user_id) values (p_path, v_sq.id, v_me);
end $$;

-- El capitán pone el logo (una ruta que reservó hace menos de un día; se usa una vez) o lo quita (null). Devuelve la
-- ruta anterior (ya en la cola de Storage) o null. Como esports_set_team_logo.
create function public.set_squad_logo(p_squad uuid, p_path text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_sq public.squads;
begin
  v_sq := private.squad_as_captain(p_squad);
  if p_path is not null and p_path !~ ('^' || v_sq.id::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$') then
    perform private.fail('invalido');
  end if;
  if p_path is not distinct from v_sq.logo_path then
    return null;
  end if;
  if p_path is null then
    if not private.rate_take('logo:' || v_me::text, 30, interval '1 day') then
      perform private.fail('rate_limited');
    end if;
  else
    delete from private.logo_uploads u
     where u.path = p_path and u.league_id = v_sq.id and u.user_id = v_me and u.created_at > now() - interval '1 day';
    if not found then
      perform private.fail('invalido');
    end if;
  end if;
  update public.squads x set logo_path = p_path where x.id = v_sq.id;
  return v_sq.logo_path;
end $$;

-- La página del equipo (SquadPage) o null si no existe. También sin cuenta: sin la plantilla (roster []), sin ser
-- miembro ni seguirlo. Las ligas: las que la cuenta ve (públicas o de las que es miembro); los miembros del equipo ven
-- todas las solicitudes, los demás solo las aprobadas.
create function public.squad_page(p_squad uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_sq public.squads;
  v_role text;
begin
  select * into v_sq from public.squads x where x.id = p_squad;
  if v_sq.id is null then
    return null;
  end if;
  if v_me is not null then
    select m.role into v_role from public.squad_members m where m.squad_id = v_sq.id and m.user_id = v_me;
  end if;
  return private.squad_lite(v_sq) || jsonb_build_object(
    'description', v_sq.description,
    'captainId', v_sq.captain_id,
    'isMember', v_role is not null,
    'myRole', v_role,
    'isFollowing', v_me is not null and exists (select 1 from public.squad_follows f where f.squad_id = v_sq.id and f.user_id = v_me),
    'createdAt', private.iso(v_sq.created_at),
    'roster', case when v_me is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.user_id, 'name', p.name, 'username', p.username, 'avatar', p.avatar_path, 'role', m.role,
               'position', m.position, 'jersey', m.jersey, 'isMe', m.user_id = v_me)
               order by (m.role = 'captain') desc, m.joined_at, m.user_id)
        from public.squad_members m join public.profiles p on p.id = m.user_id
       where m.squad_id = v_sq.id), '[]'::jsonb) end,
    'leagues', private.squad_leagues_json(v_sq.id, v_role is not null),
    'record', private.squad_record(v_sq.id, null));
end $$;

-- Mis equipos (MySquad[]): de los que soy capitán primero, luego por nombre.
create function public.my_squads() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
begin
  return coalesce((
    select jsonb_agg(private.squad_lite(s) || jsonb_build_object('role', m.role) order by (m.role = 'captain') desc, s.name, s.id)
      from public.squad_members m join public.squads s on s.id = m.squad_id
     where m.user_id = v_me), '[]'::jsonb);
end $$;

-- Seguir un equipo: cualquier cuenta que no es miembro ('no_permitido'; 'no_existe'). Idempotente. 60 cambios por hora.
-- Devuelve {following, followers}.
create function public.follow_squad(p_squad uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
begin
  if not exists (select 1 from public.squads x where x.id = p_squad) then
    perform private.fail('no_existe');
  end if;
  if exists (select 1 from public.squad_members m where m.squad_id = p_squad and m.user_id = v_me) then
    perform private.deny();
  end if;
  if not exists (select 1 from public.squad_follows f where f.squad_id = p_squad and f.user_id = v_me) then
    perform private.social_pace('follow_squad', 60);
    insert into public.squad_follows (squad_id, user_id) values (p_squad, v_me) on conflict do nothing;
  end if;
  return jsonb_build_object('following', true, 'followers', (select x.follower_count from public.squads x where x.id = p_squad));
end $$;

-- Dejar de seguir. Idempotente. 60 cambios por hora. Devuelve {following, followers}.
create function public.unfollow_squad(p_squad uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
begin
  if p_squad is null then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from public.squad_follows f where f.squad_id = p_squad and f.user_id = v_me) then
    perform private.social_pace('follow_squad', 60);
    delete from public.squad_follows f where f.squad_id = p_squad and f.user_id = v_me;
  end if;
  return jsonb_build_object('following', false,
                            'followers', coalesce((select x.follower_count from public.squads x where x.id = p_squad), 0));
end $$;

-- Los equipos que sigo (SquadLite[]), el que seguí más reciente primero (hasta 50).
create function public.followed_squads(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_limit integer := private.clamp_int(p_limit, 1, 50, 50);
begin
  return coalesce((
    select jsonb_agg(private.squad_lite(z.s) order by z.at desc, z.id desc)
      from (select s, f.created_at as at, s.id
              from public.squad_follows f join public.squads s on s.id = f.squad_id
             where f.user_id = v_me
             order by f.created_at desc, s.id desc
             limit v_limit) z), '[]'::jsonb);
end $$;

-- Buscar equipos (SquadLite[], hasta 50) por nombre, tag o ciudad, sin acentos y cada palabra en cualquier orden;
-- p_sport filtra. Menos de 2 letras o números: []. Primero los míos, luego los que empiezan así y el resto por nombre.
-- 600 búsquedas por hora.
create function public.search_squads(p_query text, p_sport text default null, p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_limit integer := private.clamp_int(p_limit, 1, 50, 20);
  v_q text := private.normalize_name(left(coalesce(p_query, ''), 60));
  v_sport text := nullif(lower(btrim(coalesce(p_sport, ''))), '');
begin
  if char_length(v_q) < 2 then
    return '[]'::jsonb;
  end if;
  perform private.social_pace('search_squads', 600);
  return coalesce((
    select jsonb_agg(private.squad_lite(z.s) order by z.n)
      from (select s,
                   row_number() over (
                     order by (m.user_id is not null) desc,
                              private.normalize_name(s.name) like private.like_escape(v_q) || '%' desc,
                              s.name, s.id) as n
              from public.squads s
              left join public.squad_members m on m.squad_id = s.id and m.user_id = v_me
             where (v_sport is null or s.sport = v_sport)
               and not exists (
                 select 1 from unnest(string_to_array(v_q, ' ')) w(word)
                  where w.word <> ''
                    and private.normalize_name(s.name || ' ' || s.tag || ' ' || coalesce(s.city, ''))
                        not like '%' || private.like_escape(w.word) || '%')
             order by n
             limit v_limit) z), '[]'::jsonb);
end $$;

-- El muro de un equipo: sus publicaciones que la cuenta ve, más nuevas primero (como league_posts).
create function public.squad_posts(p_squad uuid, p_limit integer default 20, p_before timestamptz default null,
                                   p_before_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_limit integer := private.clamp_int(p_limit, 1, 50, 20);
begin
  return coalesce((
    select jsonb_agg(private.post_json(z.p) order by z.at desc, z.id desc)
      from (select x as p, x.created_at as at, x.id
              from public.posts x
             where x.squad_id = p_squad
               and (p_before is null
                    or (x.created_at, x.id) < (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)))
               and private.can_see_post(x.author_id, x.league_id, x.visibility)
             order by x.created_at desc, x.id desc
             limit v_limit) z), '[]'::jsonb);
end $$;

-- =====================================================================
-- 5. RPC: el equipo en las ligas
-- =====================================================================

-- El capitán (o el superadmin) pide entrar a una liga del mismo deporte, de la familia de equipos (fútbol, futsal,
-- baloncesto), sin menores ('invalido'), pública o de la que ya es miembro ('no_existe'). Ya pendiente, o aprobada con
-- su equipo en la liga: 'duplicado'. 10 por día ('rate_limited'). Aviso a los admins. Devuelve el id de la solicitud.
create function public.request_squad_league(p_squad uuid, p_league uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_sq public.squads;
  v_l public.leagues;
  v_id uuid;
  v_title text;
  v_to uuid;
begin
  v_sq := private.squad_as_captain(p_squad);
  select * into v_l from public.leagues x where x.id = p_league;
  if v_l.id is null or not (v_l.visibility = 'public' or private.is_member(v_l.id) or private.is_super()) then
    perform private.fail('no_existe');
  end if;
  if v_l.sport <> v_sq.sport or coalesce(private.league_family(v_l.id), '') <> 'team' or v_l.has_minors then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from public.squad_league_requests r
              where r.squad_id = v_sq.id and r.league_id = v_l.id and r.status = 'pending')
     or (exists (select 1 from public.squad_league_requests r
                  where r.squad_id = v_sq.id and r.league_id = v_l.id and r.status = 'approved')
         and exists (select 1 from public.teams t where t.league_id = v_l.id and t.squad_id = v_sq.id)) then
    perform private.fail('duplicado');
  end if;
  if not private.rate_take('squad_req:' || v_me::text, 10, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  insert into public.squad_league_requests (squad_id, league_id, requested_by)
  values (v_sq.id, v_l.id, v_me)
  returning id into v_id;
  begin
    v_title := left(v_sq.name || ' quiere entrar a ' || v_l.name, 200);
    perform set_config('mm.push_batch', 'on', true);
    for v_to in select m.user_id from public.league_members m
                 where m.league_id = v_l.id and m.role in ('owner', 'admin') and m.user_id <> v_me
                 order by m.user_id loop
      perform private.queue_push(v_to, 'liga', v_title, 'Acéptalo o recházalo en la app.', '/l/' || v_l.id::text || '/admin',
                                 'equipo:solicitud:' || v_id::text, 604800);
    end loop;
    perform set_config('mm.push_batch', '', true);
    perform private.kick_send_push();
  exception when others then
    raise warning 'push de la solicitud del equipo %: %', v_id, sqlerrm;
  end;
  return v_id;
end $$;

-- El capitán (o el superadmin) retira una solicitud pendiente ('cerrado' si ya se decidió; 'no_existe').
create function public.withdraw_squad_request(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_r public.squad_league_requests;
begin
  select * into v_r from public.squad_league_requests x where x.id = p_request for update;
  if v_r.id is null then
    perform private.fail('no_existe');
  end if;
  perform private.squad_as_captain(v_r.squad_id);
  if v_r.status <> 'pending' then
    perform private.fail('cerrado');
  end if;
  update public.squad_league_requests x set status = 'withdrawn', decided_by = v_me, decided_at = now() where x.id = v_r.id;
end $$;

-- Las solicitudes de equipos de una liga (SquadRequest[], admins): las pendientes primero, luego las más nuevas
-- (hasta 200).
create function public.league_squad_requests(p_league uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_uid();
  if not exists (select 1 from public.leagues l where l.id = p_league) then
    perform private.fail('no_existe');
  end if;
  if not private.is_admin(p_league) then
    perform private.deny();
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', z.id, 'squad', private.squad_lite(z.s), 'status', z.status, 'note', z.note,
             'createdAt', private.iso(z.created_at),
             -- Con la cuenta borrada: {id: null, name: null}.
             'requestedBy', jsonb_build_object('id', z.requested_by, 'name', z.requester))
             order by (z.status = 'pending') desc, z.created_at desc, z.id desc)
      from (select r.id, r.status, r.note, r.created_at, r.requested_by, s, p.name as requester
              from public.squad_league_requests r
              join public.squads s on s.id = r.squad_id
              left join public.profiles p on p.id = r.requested_by
             where r.league_id = p_league
             order by (r.status = 'pending') desc, r.created_at desc, r.id desc
             limit 200) z), '[]'::jsonb);
end $$;

-- Un admin de la liga acepta o rechaza una solicitud pendiente ('cerrado' si ya se decidió; 'no_existe';
-- 'no_permitido'). Nota ≤ 200 ('invalido'). Aceptar: la liga y el equipo siguen sirviendo ('invalido' si no) y se
-- materializa (private.squad_materialize): devuelve {teamId, added, skipped}. Rechazar: {}. Aviso al capitán.
create function public.decide_squad_request(p_request uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_note text := nullif(private.squad_line(p_note), '');
  v_r public.squad_league_requests;
  v_sq public.squads;
  v_l public.leagues;
  v_res jsonb := '{}'::jsonb;
  v_title text;
begin
  select * into v_r from public.squad_league_requests x where x.id = p_request for update;
  if v_r.id is null then
    perform private.fail('no_existe');
  end if;
  if not private.is_admin(v_r.league_id) then
    perform private.deny();
  end if;
  if p_approve is null or char_length(v_note) > 200 then
    perform private.fail('invalido');
  end if;
  if v_r.status <> 'pending' then
    perform private.fail('cerrado');
  end if;
  select * into v_sq from public.squads x where x.id = v_r.squad_id for update;
  select * into v_l from public.leagues x where x.id = v_r.league_id;
  if p_approve then
    if v_l.sport <> v_sq.sport or coalesce(private.league_family(v_l.id), '') <> 'team' or v_l.has_minors then
      perform private.fail('invalido');
    end if;
    v_res := private.squad_materialize(v_sq.id, v_l.id, true);
  end if;
  update public.squad_league_requests x
     set status = case when p_approve then 'approved' else 'rejected' end, decided_by = v_me, decided_at = now(), note = v_note
   where x.id = v_r.id;
  if v_sq.captain_id is not null and v_sq.captain_id <> v_me then
    begin
      v_title := left(v_l.name || case when p_approve then ' aceptó a ' else ' rechazó a ' end || v_sq.name, 200);
      perform private.queue_push(v_sq.captain_id, 'liga', v_title,
                                 coalesce(v_note, case when p_approve then 'Ya están en la liga: revisa la plantilla.'
                                                       else 'Toca para ver tu equipo.' end),
                                 '/equipos/' || v_sq.id::text, 'equipo:liga:' || v_r.id::text, 604800);
    exception when others then
      raise warning 'push de la decisión del equipo %: %', v_r.id, sqlerrm;
    end;
  end if;
  return v_res;
end $$;

-- Vuelve a pasar a la liga a los miembros nuevos del equipo (private.squad_materialize, sin sacar a nadie). El capitán
-- del equipo (o el superadmin) o un admin de la liga ('no_permitido'), con la solicitud aprobada y su equipo en la liga
-- ('no_existe'). Devuelve {added, skipped}.
create function public.sync_squad_roster(p_squad uuid, p_league uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_sq public.squads;
  v_l public.leagues;
  v_res jsonb;
begin
  select * into v_sq from public.squads x where x.id = p_squad for update;
  select * into v_l from public.leagues x where x.id = p_league;
  if v_sq.id is null or v_l.id is null then
    perform private.fail('no_existe');
  end if;
  if v_sq.captain_id is distinct from v_me and not private.is_admin(v_l.id) then
    perform private.deny();
  end if;
  if not exists (select 1 from public.squad_league_requests r
                  where r.squad_id = v_sq.id and r.league_id = v_l.id and r.status = 'approved') then
    perform private.fail('no_existe');
  end if;
  if v_l.sport <> v_sq.sport or coalesce(private.league_family(v_l.id), '') <> 'team' or v_l.has_minors then
    perform private.fail('invalido');
  end if;
  v_res := private.squad_materialize(v_sq.id, v_l.id, false);
  return jsonb_build_object('added', v_res -> 'added', 'skipped', v_res -> 'skipped');
end $$;

-- =====================================================================
-- 6. RPC: transmisiones en vivo
-- =====================================================================

-- Admins (o superadmin): activa o apaga las transmisiones de la liga. Apagarlas termina las activas. 'no_existe',
-- 'no_permitido', 'invalido' (null).
create function public.set_league_live(p_league uuid, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ids jsonb;
begin
  perform private.require_uid();
  if not exists (select 1 from public.leagues l where l.id = p_league) then
    perform private.fail('no_existe');
  end if;
  if not private.is_admin(p_league) then
    perform private.deny();
  end if;
  if p_enabled is null then
    perform private.fail('invalido');
  end if;
  update public.leagues l set live_enabled = p_enabled where l.id = p_league and l.live_enabled is distinct from p_enabled;
  if not found then
    return;
  end if;
  if not p_enabled then
    with ended as (
      update public.live_streams x set ended_at = greatest(now(), x.started_at)
       where x.league_id = p_league and x.ended_at is null
      returning x.id)
    select jsonb_agg(e.id) into v_ids from ended e;
    if v_ids is not null then
      perform private.emit('league:' || p_league::text, 'streams', jsonb_build_object('op', 'end', 'ids', v_ids));
    end if;
  end if;
  perform private.emit('league:' || p_league::text, 'streams', jsonb_build_object('op', 'live', 'enabled', p_enabled));
end $$;

-- Empieza una transmisión de la liga, de un partido o de un evento de la liga (no los dos: 'invalido'; de otra liga:
-- 'no_existe'). Admins y anotadores (en el boliche, solo admins: 'no_permitido'), con la liga en live_enabled
-- ('cerrado'). Link https de las seis plataformas (private.stream_platform; si no, 'invalido'); título ≤ 80 (una línea;
-- 'invalido', 'palabras'). Una activa por partido o evento ('duplicado'), hasta 5 activas por liga ('limite') y 20 por
-- día por liga ('rate_limited'). Las de hace 12 horas o más sin terminar se terminan solas. Tiempo real y aviso (ver el
-- encabezado). Devuelve el LiveStream.
create function public.start_stream(p_league uuid, p_url text, p_title text default null, p_match uuid default null,
                                    p_event uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_url text := btrim(coalesce(p_url, ''));
  v_title text := nullif(private.squad_line(p_title), '');
  v_platform text;
  v_l public.leagues;
  v_st public.live_streams;
begin
  select * into v_l from public.leagues x where x.id = p_league;
  if v_l.id is null then
    perform private.fail('no_existe');
  end if;
  if not private.stream_can(v_l.id) then
    perform private.deny();
  end if;
  if not v_l.live_enabled then
    perform private.fail('cerrado');
  end if;
  v_platform := private.stream_platform(v_url);
  if v_platform is null or char_length(v_title) > 80 or (p_match is not null and p_event is not null) then
    perform private.fail('invalido');
  end if;
  if v_title is not null and not private.social_text_ok(v_title) then
    perform private.fail('palabras');
  end if;
  if (p_match is not null and not exists (select 1 from public.matches m where m.id = p_match and m.league_id = v_l.id))
     or (p_event is not null and not exists (select 1 from public.events e where e.id = p_event and e.league_id = v_l.id)) then
    perform private.fail('no_existe');
  end if;
  -- Dos a la vez en la misma liga esperan una a la otra: los topes son exactos.
  perform pg_advisory_xact_lock(hashtext('mm:streams:' || v_l.id::text));
  update public.live_streams x set ended_at = x.started_at + interval '12 hours'
   where x.league_id = v_l.id and x.ended_at is null and x.started_at <= now() - interval '12 hours';
  if (p_match is not null and exists (select 1 from public.live_streams x where x.match_id = p_match and x.ended_at is null))
     or (p_event is not null and exists (select 1 from public.live_streams x where x.event_id = p_event and x.ended_at is null)) then
    perform private.fail('duplicado');
  end if;
  if (select count(*) from public.live_streams x where x.league_id = v_l.id and x.ended_at is null) >= 5 then
    perform private.fail('limite');
  end if;
  if not private.rate_take('stream:' || v_l.id::text, 20, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  insert into public.live_streams (league_id, match_id, event_id, url, platform, title, started_by)
  values (v_l.id, p_match, p_event, v_url, v_platform, v_title, v_me)
  returning * into v_st;
  perform private.emit('league:' || v_l.id::text, 'streams', jsonb_build_object('op', 'insert', 'ids', jsonb_build_array(v_st.id)));
  perform private.stream_push(v_st);
  return private.stream_json(v_st);
end $$;

-- Termina una transmisión: admins y anotadores de su liga (en el boliche, admins). 'no_existe', 'no_permitido'. Ya
-- terminada: nada.
create function public.end_stream(p_stream uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_st public.live_streams;
begin
  perform private.require_uid();
  select * into v_st from public.live_streams x where x.id = p_stream for update;
  if v_st.id is null then
    perform private.fail('no_existe');
  end if;
  if not private.stream_can(v_st.league_id) then
    perform private.deny();
  end if;
  if v_st.ended_at is not null then
    return;
  end if;
  update public.live_streams x set ended_at = greatest(now(), x.started_at) where x.id = v_st.id;
  perform private.emit('league:' || v_st.league_id::text, 'streams', jsonb_build_object('op', 'end', 'ids', jsonb_build_array(v_st.id)));
end $$;

-- Las transmisiones activas de una liga (LiveStream[], la más nueva primero). También sin cuenta si la liga es
-- pública; privada: sus miembros (y el superadmin). Si no se ve o no existe: [].
create function public.league_streams(p_league uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.leagues l
                  where l.id = p_league
                    and (l.visibility = 'public' or (auth.uid() is not null and (private.is_member(l.id) or private.is_super())))) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(private.stream_json(x) order by x.started_at desc, x.id desc)
      from public.live_streams x
     where x.league_id = p_league and x.ended_at is null and x.started_at > now() - interval '12 hours'), '[]'::jsonb);
end $$;

-- En vivo ahora (LiveStream[], la más nueva primero, hasta 50): las de mis ligas, las de las ligas que sigo y las de
-- las ligas donde juega un equipo que sigo o del que soy miembro (estas dos, solo ligas públicas sin menores).
create function public.live_now(p_limit integer default 10) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_limit integer := private.clamp_int(p_limit, 1, 50, 10);
begin
  return coalesce((
    select jsonb_agg(private.stream_json(z.s) order by z.at desc, z.id desc)
      from (select x as s, x.started_at as at, x.id
              from public.live_streams x
              join public.leagues l on l.id = x.league_id
             where x.ended_at is null and x.started_at > now() - interval '12 hours'
               and (exists (select 1 from public.league_members m where m.league_id = l.id and m.user_id = v_me)
                    or (l.visibility = 'public' and not l.has_minors
                        and (exists (select 1 from public.league_follows f where f.league_id = l.id and f.user_id = v_me)
                             or exists (select 1 from public.teams t
                                         where t.league_id = l.id and t.squad_id is not null
                                           and (t.squad_id in (select f.squad_id from public.squad_follows f where f.user_id = v_me)
                                                or t.squad_id in (select m.squad_id from public.squad_members m where m.user_id = v_me))))))
             order by x.started_at desc, x.id desc
             limit v_limit) z), '[]'::jsonb);
end $$;

-- =====================================================================
-- 7. Redefinidas
-- =====================================================================

-- Igual que en 20261009000100_red_social.sql y además p_squad: publicar en el muro de un equipo (miembros:
-- 'no_permitido'; 'no_existe'), siempre 'public' y sin liga (otra cosa: 'invalido'); el deporte es el del equipo.
drop function public.create_post(uuid, text, text, integer, integer, uuid, text, text);
create function public.create_post(p_id uuid, p_text text default '', p_photo text default null, p_photo_w integer default null,
                                   p_photo_h integer default null, p_league uuid default null, p_visibility text default 'public',
                                   p_sport text default null, p_squad uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_text text := private.social_clean_text(p_text);
  v_photo text := nullif(btrim(coalesce(p_photo, '')), '');
  v_vis text := lower(btrim(coalesce(p_visibility, 'public')));
  v_sport text := nullif(lower(btrim(coalesce(p_sport, ''))), '');
  v_author uuid;
  v_league public.leagues;
  v_squad public.squads;
  v_post public.posts;
begin
  if p_id is null then
    perform private.fail('invalido');
  end if;
  -- Reintento de la cola: la que ya está.
  select x.author_id into v_author from public.posts x where x.id = p_id;
  if v_author is not null then
    if v_author <> v_me then
      perform private.fail('duplicado');
    end if;
    select * into v_post from public.posts x where x.id = p_id;
    return private.post_json(v_post);
  end if;
  if exists (select 1 from private.posts_deleted d where d.id = p_id) then
    perform private.fail('no_existe');
  end if;

  if char_length(v_text) > 1000 or (v_text = '' and v_photo is null) or v_vis not in ('public', 'followers', 'league') then
    perform private.fail('invalido');
  end if;
  if v_photo is not null then
    if v_photo not in (v_me::text || '/' || p_id::text || '.webp', v_me::text || '/' || p_id::text || '.jpg')
       or (p_photo_w is not null and p_photo_w not between 1 and 10000)
       or (p_photo_h is not null and p_photo_h not between 1 and 10000)
       or exists (select 1 from private.storage_purge_queue q where q.path = v_photo) then
      perform private.fail('invalido');
    end if;
  end if;
  if p_squad is not null then
    if p_league is not null or v_vis <> 'public' then
      perform private.fail('invalido');
    end if;
    select * into v_squad from public.squads x where x.id = p_squad;
    if v_squad.id is null then
      perform private.fail('no_existe');
    end if;
    if not exists (select 1 from public.squad_members m where m.squad_id = v_squad.id and m.user_id = v_me) then
      perform private.deny();
    end if;
    v_sport := v_squad.sport;
  elsif p_league is not null then
    select * into v_league from public.leagues x where x.id = p_league;
    if v_league.id is null then
      perform private.fail('no_existe');
    end if;
    if v_league.has_minors or not private.is_member(v_league.id) then
      perform private.deny();
    end if;
    if v_vis = 'followers' or (v_league.visibility <> 'public' and v_vis <> 'league') then
      perform private.fail('invalido');
    end if;
    v_sport := v_league.sport;
  else
    if v_vis = 'league' or (v_sport is not null and v_sport !~ '^[a-z_]{2,20}$') then
      perform private.fail('invalido');
    end if;
  end if;
  if not private.social_text_ok(v_text) then
    perform private.fail('palabras');
  end if;
  if not private.rate_take('post:h:' || v_me::text, 10, interval '1 hour')
     or not private.rate_take('post:d:' || v_me::text, 40, interval '1 day') then
    perform private.fail('rate_limited');
  end if;

  insert into public.posts (id, author_id, text, photo_path, photo_w, photo_h, league_id, sport, visibility, squad_id)
  values (p_id, v_me, v_text, v_photo,
          case when v_photo is not null then p_photo_w end, case when v_photo is not null then p_photo_h end,
          p_league, v_sport, v_vis, p_squad)
  on conflict (id) do nothing
  returning * into v_post;
  if v_post.id is null then
    -- Dos reintentos a la vez: el otro ya la guardó.
    select * into v_post from public.posts x where x.id = p_id;
    if v_post.author_id is distinct from v_me then
      perform private.fail('duplicado');
    end if;
  end if;
  return private.post_json(v_post);
end $$;

-- Igual que en 20261009000100_red_social.sql y además 'squad': el SquadLite del muro donde salió (o null).
create or replace function private.post_json(p public.posts) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'author', private.person_lite(p.author_id),
    'text', p.text,
    'photo', case when p.photo_path is null then null
                  else jsonb_build_object('path', p.photo_path, 'w', p.photo_w, 'h', p.photo_h) end,
    'league', (select jsonb_build_object('id', l.id, 'name', l.name, 'sport', l.sport) from public.leagues l where l.id = p.league_id),
    'squad', (select private.squad_lite(s) from public.squads s where s.id = p.squad_id),
    'sport', p.sport,
    'visibility', case when p.visibility = 'public' and p.league_id is not null
                            and not exists (select 1 from public.leagues l where l.id = p.league_id and l.visibility = 'public')
                       then 'league' else p.visibility end,
    'at', private.iso(p.created_at),
    'likes', p.likes,
    'likedByMe', exists (select 1 from public.post_likes k where k.post_id = p.id and k.user_id = (select auth.uid())),
    'comments', p.comments,
    'isMine', p.author_id = (select auth.uid()),
    'canDelete', p.author_id = (select auth.uid()) or (select private.is_super())
                 or (p.league_id is not null and private.is_admin(p.league_id)))
$$;

-- Igual que en 20261009000100_red_social.sql y además, en 'following', el muro de los equipos que sigo o de los que
-- soy miembro.
create or replace function public.social_feed(p_scope text default 'following', p_limit integer default 20,
                                              p_before timestamptz default null, p_before_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_scope text := lower(btrim(coalesce(p_scope, 'following')));
  v_limit integer := private.clamp_int(p_limit, 1, 50, 20);
begin
  if v_scope not in ('following', 'discover') then
    perform private.fail('invalido');
  end if;
  return coalesce((
    select jsonb_agg(private.post_json(z.p) order by z.at desc, z.id desc)
      from (select x as p, x.created_at as at, x.id
              from public.posts x
             where case when v_scope = 'discover' then
                          x.visibility = 'public'
                          and (x.league_id is null
                               or exists (select 1 from public.leagues l
                                           where l.id = x.league_id and l.visibility = 'public' and not l.has_minors))
                        else
                          x.author_id = v_me
                          or x.author_id in (select f.followee_id from public.follows f where f.follower_id = v_me)
                          or x.league_id in (select m.league_id from public.league_members m where m.user_id = v_me)
                          or x.league_id in (select lf.league_id from public.league_follows lf where lf.user_id = v_me)
                          or x.squad_id in (select sf.squad_id from public.squad_follows sf where sf.user_id = v_me)
                          or x.squad_id in (select sm.squad_id from public.squad_members sm where sm.user_id = v_me)
                   end
               and (p_before is null
                    or (x.created_at, x.id) < (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)))
               and private.can_see_post(x.author_id, x.league_id, x.visibility)
             order by x.created_at desc, x.id desc
             limit v_limit) z), '[]'::jsonb);
end $$;

-- Igual que en 20261008000100_esports.sql y además el logo de un equipo (squads): si la carpeta no es una liga ni un
-- equipo de esports y es un equipo, la ruta es '<equipo>/<uuid>.webp|.jpg|.png', la cuenta (sin bloquear) es su
-- capitán (o superadmin) y la reservó con begin_squad_logo (en logo_uploads, league_id = el equipo) hace menos de un día.
create or replace function private.can_upload_logo_path(p_path text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_league uuid;
begin
  begin
    v_league := split_part(p_path, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  if not exists (select 1 from public.leagues l where l.id = v_league)
     and exists (select 1 from public.esports_teams t where t.id = v_league) then
    return p_path ~ ('^' || v_league::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$')
       and not private.is_blocked((select auth.uid()))
       and (private.is_super() or exists (select 1 from public.esports_teams t where t.id = v_league and t.captain_id = (select auth.uid())))
       and exists (select 1 from private.logo_uploads u
                    where u.path = p_path and u.league_id = v_league and u.user_id = (select auth.uid())
                      and u.created_at > now() - interval '1 day');
  end if;
  if not exists (select 1 from public.leagues l where l.id = v_league)
     and exists (select 1 from public.squads s where s.id = v_league) then
    return p_path ~ ('^' || v_league::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$')
       and not private.is_blocked((select auth.uid()))
       and (private.is_super() or exists (select 1 from public.squads s where s.id = v_league and s.captain_id = (select auth.uid())))
       and exists (select 1 from private.logo_uploads u
                    where u.path = p_path and u.league_id = v_league and u.user_id = (select auth.uid())
                      and u.created_at > now() - interval '1 day');
  end if;
  return p_path ~ ('^' || v_league::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$')
     and exists (select 1 from public.leagues l where l.id = v_league)
     and not private.is_blocked((select auth.uid()))
     and private.is_admin(v_league)
     and exists (select 1 from private.logo_uploads u
                  where u.path = p_path and u.league_id = v_league and u.user_id = (select auth.uid())
                    and u.created_at > now() - interval '1 day');
end $$;

-- Igual que en 20261008000100_esports.sql y además los logos de los equipos (squads) de los que la cuenta es capitán.
create or replace function private.can_remove_logo_path(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
     and not private.is_blocked((select auth.uid()))
     and (split_part(p_path, '/', 1) in (select l::text from private.photo_admin_leagues() l)
          or split_part(p_path, '/', 1) in (select t.id::text from public.esports_teams t where t.captain_id = (select auth.uid()))
          or split_part(p_path, '/', 1) in (select s.id::text from public.squads s where s.captain_id = (select auth.uid()))
          or exists (select 1 from private.storage_purge_queue q where q.path = p_path and q.bucket = 'logos'))
$$;

-- Igual que en 20261009000100_red_social.sql y además, en 'logos', tampoco se borra el logo de un equipo (squads) en
-- uso. Sigue solo de service_role.
create or replace function public.purge_queue_take(p_limit integer default 500, p_bucket text default 'scoreboards')
returns table (path text)
language plpgsql security definer set search_path = '' as $$
begin
  if p_bucket is null or p_bucket not in ('scoreboards', 'logos', 'avatars', 'posts') then
    perform private.fail('invalido');
  end if;
  if p_bucket = 'scoreboards' then
    delete from private.storage_purge_queue q
     where q.bucket = 'scoreboards' and exists (select 1 from public.photos p where p.path = q.path);
  elsif p_bucket = 'logos' then
    delete from private.storage_purge_queue q
     where q.bucket = 'logos'
       and (exists (select 1 from public.leagues l where l.logo_path = q.path)
            or exists (select 1 from public.esports_teams t where t.logo_path = q.path)
            or exists (select 1 from public.squads s where s.logo_path = q.path));
  elsif p_bucket = 'avatars' then
    delete from private.storage_purge_queue q
     where q.bucket = 'avatars' and exists (select 1 from public.profiles p where p.avatar_path = q.path);
  else
    delete from private.storage_purge_queue q
     where q.bucket = 'posts' and exists (select 1 from public.posts p where p.photo_path = q.path);
  end if;
  return query
  with picked as (
    select q.path
      from private.storage_purge_queue q
     where q.bucket = p_bucket and q.attempts < 10 and (q.claimed_at is null or q.claimed_at < now() - interval '10 minutes')
     order by q.queued_at, q.path
     limit private.clamp_int(p_limit, 1, 1000, 500)
       for update of q skip locked
  )
  update private.storage_purge_queue q set claimed_at = now(), attempts = q.attempts + 1
    from picked x
   where q.path = x.path
  returning q.path;
end $$;

-- Igual que en 20261008000100_esports.sql (la última) y además 'equipo' (equipos: alguien se unió, solicitudes a una
-- liga y la decisión) y 'envivo' (transmisiones en vivo) en 'liga' («Tus ligas»).
create or replace function private.push_category(p_tag text) returns text
language sql immutable set search_path = '' as $$
  select case split_part(coalesce(p_tag, ''), ':', 1)
    when 'envio' then 'resultados'
    when 'confirmar' then 'resultados'
    when 'resultado' then 'resultados'
    when 'reclamo' then 'resultados'
    when 'reaccion' then 'social'
    when 'comentario' then 'social'
    when 'seguir' then 'social'
    when 'insignias' then 'social'
    when 'insignia' then 'social'
    when 'recordatorio' then 'recordatorios'
    when 'partido' then 'recordatorios'
    when 'despues' then 'recordatorios'
    when 'sinresultado' then 'recordatorios'
    when 'pista' then 'recordatorios'
    when 'aviso' then 'liga'
    when 'temporada' then 'liga'
    when 'invitacion' then 'liga'
    when 'invitacion-ok' then 'liga'
    when 'anotador' then 'liga'
    when 'esports' then 'liga'
    when 'esports-id' then 'liga'
    when 'equipo' then 'liga'
    when 'envivo' then 'liga'
  end
$$;

-- Igual que en 20260929000700_temporadas.sql y además, al copiar los equipos de la temporada anterior, cada copia
-- conserva su squad_id (el equipo sigue siendo el mismo en la temporada nueva).
create or replace function public.start_season(p_league uuid, p_name text, p_starts_on date, p_ends_on date default null,
                                               p_copy_teams boolean default false)
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
    insert into public.teams (id, league_id, event_id, season_id, name, sort_order, color, squad_id)
    select v_new[u.i], p_league, null, v_id, t.name, t.sort_order, t.color, t.squad_id
      from unnest(v_old) with ordinality as u (id, i) join public.teams t on t.id = u.id;
    insert into public.team_players (team_id, player_id, league_id, jersey, position, role)
    select v_new[u.i], tp.player_id, tp.league_id, tp.jersey, tp.position, tp.role
      from unnest(v_old) with ordinality as u (id, i) join public.team_players tp on tp.team_id = u.id;
  end if;
  return v_id;
end $$;

-- =====================================================================
-- 8. Permisos: las RPC solo con sesión (squad_preview, squad_page y league_streams también sin cuenta); las ayudas,
-- nadie de la app; private.can_upload_logo_path y private.can_remove_logo_path siguen para authenticated (Storage)
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array[
    'create_squad', 'update_squad', 'delete_squad', 'squad_code', 'renew_squad_code', 'squad_preview', 'join_squad',
    'leave_squad', 'remove_squad_member', 'set_squad_member', 'begin_squad_logo', 'set_squad_logo', 'squad_page', 'my_squads',
    'follow_squad', 'unfollow_squad', 'followed_squads', 'search_squads', 'squad_posts', 'request_squad_league',
    'withdraw_squad_request', 'league_squad_requests', 'decide_squad_request', 'sync_squad_roster', 'set_league_live',
    'start_stream', 'end_stream', 'league_streams', 'live_now',
    -- Redefinidas (create_post se creó de nuevo; las otras conservan sus permisos y se dejan igual para asegurarlo).
    'create_post', 'social_feed', 'start_season'];
  v_service constant text[] := array[
    -- Redefinida.
    'purge_queue_take'];
  v_private constant text[] := array[
    'squad_lite', 'squad_line', 'squad_color', 'squad_new_code', 'squad_as_captain', 'squad_count', 'squad_record',
    'squad_leagues_json', 'squad_ensure_player', 'squad_materialize', 'squad_members_count', 'squad_follows_count',
    'squad_team_gone', 'stream_platform', 'stream_can', 'stream_label', 'stream_json', 'stream_push',
    -- Redefinidas.
    'post_json', 'push_category'];
begin
  for f in select p.oid::regprocedure as sig, n.nspname, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and (p.proname = any (v_rpc) or p.proname = any (v_service)))
               or (n.nspname = 'private' and p.proname = any (v_private)) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' and f.proname = any (v_rpc) then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.nspname = 'public' then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;

-- Ver a qué equipo lleva un código, la página de un equipo y las transmisiones de una liga pública también sin cuenta.
grant execute on function public.squad_preview(text) to anon;
grant execute on function public.squad_page(uuid) to anon;
grant execute on function public.league_streams(uuid) to anon;

-- Las políticas del bucket 'logos' (20260929001010_logos_supabase.sql) las llaman como authenticated.
grant execute on function private.can_upload_logo_path(text), private.can_remove_logo_path(text) to authenticated;
