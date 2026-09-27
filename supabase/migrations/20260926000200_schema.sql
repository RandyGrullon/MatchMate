-- MatchMate · 2/6 · Tablas.
--
-- Reglas del esquema:
-- - Ids uuid (el teléfono puede generarlos para crear sin señal).
-- - Toda tabla que se sincroniza lleva league_id, updated_at (trigger) e índice (league_id, updated_at).
--   Los borrados quedan en tombstones (trigger AFTER DELETE, también los de cascada).
-- - El league_id copiado en las tablas hijas SIEMPRE se verifica con FK compuestas
--   (evento, liga) -> events(id, league_id) y (jugador, liga) -> players(id, league_id): nadie mete su
--   liga con el evento o el jugador de otra.
-- - Textos en valores de la app de hoy (kind 'liga'|'torneo', type 'torneo'|'practica',
--   status 'pendiente'|'aprobado'|'rechazado'), para que stats.ts siga igual.
-- - Nada de matches, match_* ni swim_*: cada fase trae su migración.

-- ---------- Deportes ----------
-- Qué deportes existen y si están abiertos. En beta solo los crea el superadmin (lo impone create_league).
create table public.sport_status (
  id text primary key check (id ~ '^[a-z][a-z_]{1,19}$'),
  family text not null check (family in ('series', 'racket', 'team')),
  status text not null default 'beta' check (status in ('open', 'beta', 'closed')),
  sort_order smallint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.sport_status (id, family, status, sort_order) values
  ('bowling', 'series', 'open', 1),
  ('padel', 'racket', 'beta', 2),
  ('tennis', 'racket', 'beta', 3),
  ('pickleball', 'racket', 'beta', 4),
  ('basketball', 'team', 'beta', 5),
  ('football', 'team', 'beta', 6),
  ('futsal', 'team', 'beta', 7),
  ('golf', 'series', 'beta', 8),
  ('swimming', 'series', 'beta', 9);

-- ---------- Cuentas ----------
-- Se crea sola con un trigger en auth.users. Nunca la lee un visitante sin cuenta (tiene el correo).
-- is_superadmin: solo por SQL o con set_superadmin (otro superadmin).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text not null check (char_length(name) between 1 and 60 and btrim(name) <> ''),
  is_superadmin boolean not null default false,
  -- Marcó «tengo 18 años o más» al registrarse (metadata adult = true).
  adult_confirmed_at timestamptz,
  -- Cuenta de BowlingX de donde viene (migración final).
  firebase_uid text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Ligas ----------
-- Un torneo sin liga es una "liga" de un solo torneo (kind = 'torneo'), como en BowlingX.
create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  sport text not null default 'bowling' references public.sport_status (id),
  kind text not null default 'liga' check (kind in ('liga', 'torneo')),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  name text not null check (char_length(name) between 1 and 60 and btrim(name) <> ''),
  -- Sin ON DELETE: para borrar la cuenta de un dueño primero se traspasa la liga (transfer_ownership) o se borra.
  owner_id uuid not null references public.profiles (id) on delete restrict,
  venue text not null default '' check (char_length(venue) <= 80),
  schedule text not null default '' check (char_length(schedule) <= 80),
  season_start date,
  season_end date,
  contact_name text not null default '' check (char_length(contact_name) <= 60),
  -- WhatsApp: dígitos (y +), como deja LeagueFormModal.
  contact_phone text not null default '' check (contact_phone ~ '^[0-9+]{0,20}$'),
  require_photo boolean not null default false,
  -- Liga con menores: siempre privada, sin fotos ni social.
  has_minors boolean not null default false,
  tz text not null default 'America/Santo_Domingo' check (char_length(tz) between 1 and 64),
  -- Reglas del deporte (punto de oro, sets, WHS…): cada fase define sus claves.
  rules jsonb not null default '{}' check (jsonb_typeof(rules) = 'object' and pg_column_size(rules) < 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not has_minors or (visibility = 'private' and not require_photo))
);
create index leagues_visibility_idx on public.leagues (visibility);
create index leagues_owner_idx on public.leagues (owner_id);

-- Código de invitación vigente: solo lo ven los admins de la liga. Se ve a qué liga invita con invite_preview.
create table public.league_secrets (
  league_id uuid primary key references public.leagues (id) on delete cascade,
  invite_code text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  updated_at timestamptz not null default now()
);

-- Membresías. El jugador de la cuenta NO va aquí: es players.user_id (vista public.memberships los junta).
create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  -- Anotador (en boliche solo vale en torneos sin liga): anota los juegos de todos.
  is_scorer boolean not null default false,
  -- Nombre de la cuenta al unirse (listas de miembros y autor de reacciones y comentarios).
  display_name text not null check (char_length(display_name) between 1 and 60 and btrim(display_name) <> ''),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create unique index league_members_one_owner on public.league_members (league_id) where role = 'owner';
create index league_members_user_idx on public.league_members (user_id);
create index league_members_sync_idx on public.league_members (league_id, updated_at);

-- ---------- Jugadores ----------
-- La cuenta es el jugador (uno por cuenta y liga). El admin crea jugadores sin cuenta que luego se reclaman.
-- user_id solo apunta a un miembro de ESA liga (FK compuesta); si deja la liga, el jugador queda sin cuenta.
create table public.players (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid,
  name text not null check (char_length(name) between 1 and 60 and btrim(name) <> ''),
  -- Promedio fijado a mano; null = se calcula con sus juegos verificados.
  average_override double precision check (average_override between 0 and 300),
  -- Los menores no tienen cuenta y solo existen en ligas con has_minors (trigger).
  is_minor boolean not null default false,
  attrs jsonb not null default '{}' check (jsonb_typeof(attrs) = 'object' and pg_column_size(attrs) < 4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, league_id),
  unique (league_id, user_id),
  foreign key (league_id, user_id) references public.league_members (league_id, user_id) on delete set null (user_id),
  check (not is_minor or user_id is null)
);
create index players_user_idx on public.players (user_id);
create index players_sync_idx on public.players (league_id, updated_at);

-- Datos privados del jugador (solo admins): año de nacimiento, sexo y el consentimiento del padre o tutor.
create table public.player_private (
  player_id uuid primary key,
  league_id uuid not null,
  birth_year smallint check (birth_year between 1900 and 2100),
  sex text check (sex in ('F', 'M', 'X')),
  guardian_name text check (char_length(guardian_name) <= 60),
  -- Quién registró el consentimiento del padre o tutor y cuándo.
  consent_by uuid references public.profiles (id) on delete set null,
  consent_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade
);
create index player_private_league_idx on public.player_private (league_id);

-- ---------- Eventos ----------
-- Boliche: type 'torneo' | 'practica' (trigger por deporte). Los equipos van en teams y el «voy» en event_rsvps.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  type text not null check (type ~ '^[a-z_]{1,30}$'),
  name text not null default '' check (char_length(name) <= 80),
  date date not null,
  start_time time,
  games smallint not null default 3 check (games between 1 and 10),
  -- Handicap = (hcp_base - promedio) * hcp_percent / 100. Solo torneos.
  hcp_base smallint not null default 0 check (hcp_base between 0 and 300),
  hcp_percent smallint not null default 0 check (hcp_percent between 0 and 100),
  individual_rank_by text check (individual_rank_by in ('hcp', 'scratch')),
  team_rank_by text check (team_rank_by in ('hcp', 'scratch')),
  -- Promedio mínimo para categoría A, B y C (debajo es D).
  category_cuts smallint[] check (category_cuts is null or (array_ndims(category_cuts) = 1 and cardinality(category_cuts) = 3)),
  team_size smallint not null default 0 check (team_size between 0 and 20),
  announcement text not null default '' check (char_length(announcement) <= 1000),
  -- Inscritos (lo mantiene un trigger en entries).
  player_count integer not null default 0,
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object' and pg_column_size(config) < 8192),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, league_id)
);
create index events_date_idx on public.events (league_id, date);
create index events_sync_idx on public.events (league_id, updated_at);

-- Equipos del evento (boliche: los arma el admin en el torneo). event_id null = equipo de temporada
-- (baloncesto, fútbol: lo agrega su fase con sus RPC).
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  event_id uuid,
  name text not null check (char_length(name) between 1 and 60 and btrim(name) <> ''),
  sort_order integer not null default 0,
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, league_id),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade
);
create index teams_event_idx on public.teams (event_id);
create index teams_sync_idx on public.teams (league_id, updated_at);

-- «Voy»: una fila por jugador que confirmó (quitarlo borra la fila).
create table public.event_rsvps (
  event_id uuid not null,
  player_id uuid not null,
  league_id uuid not null,
  going boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, player_id),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade
);
create index event_rsvps_player_idx on public.event_rsvps (player_id);
create index event_rsvps_sync_idx on public.event_rsvps (league_id, updated_at);

-- ---------- Fotos ----------
-- El archivo va en Storage (bucket scoreboards) en `path` = '<liga>/<foto>.webp|.jpg'. Aquí solo los datos.
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  event_id uuid,
  path text not null unique,
  content_type text not null default 'image/webp' check (content_type in ('image/webp', 'image/jpeg')),
  width integer check (width between 1 and 20000),
  height integer check (height between 1 and 20000),
  bytes integer check (bytes between 0 and 1048576),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Fase 0C: cuándo se borra el archivo y cuándo se borró.
  expires_at timestamptz,
  purged_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id, league_id),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  -- La ruta sale del id y la liga: nadie apunta a un archivo de otra liga.
  check (path = league_id::text || '/' || id::text || case content_type when 'image/jpeg' then '.jpg' else '.webp' end)
);
create index photos_event_idx on public.photos (event_id);
create index photos_created_idx on public.photos (league_id, created_at);
create index photos_sync_idx on public.photos (league_id, updated_at);

-- ---------- Participaciones (familia "series": boliche) ----------
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null,
  event_id uuid not null,
  player_id uuid not null,
  team_id uuid,
  -- Promedio con el que entró al evento (congelado para el handicap del torneo).
  average double precision not null default 0 check (average between 0 and 300),
  handicap_override smallint check (handicap_override between -300 and 300),
  -- Pinos por juego (índice = juego - 1); validados por deporte con trigger.
  scores smallint[] not null default '{}',
  -- Foto que verifica cada juego: id de foto | 'importado' | 'sin-foto' | null (borrador, no cuenta).
  photos text[] not null default '{}',
  -- Cuadros de los juegos anotados tiro por tiro: {"<juego>": {"rolls": [...], "masks": [...]}}.
  frames jsonb check (frames is null or (jsonb_typeof(frames) = 'object' and pg_column_size(frames) < 16384)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, player_id),
  unique (id, league_id, event_id, player_id),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade,
  foreign key (team_id, league_id) references public.teams (id, league_id) on delete set null (team_id)
);
create index entries_player_idx on public.entries (player_id);
create index entries_team_idx on public.entries (team_id);
create index entries_sync_idx on public.entries (league_id, updated_at);

-- ---------- Envíos de juegos (esperan aprobación del admin) ----------
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  player_id uuid not null,
  -- Evento donde jugó, o la fecha (se aprueba en la práctica de ese día). Al aprobar se llena event_id.
  event_id uuid,
  date date,
  scores smallint[] not null check (cardinality(scores) >= 1),
  -- Lo que leyó la IA de la foto (una sola vez el jugador; el admin siempre) y de qué fila.
  scanned smallint[],
  scanned_name text check (char_length(scanned_name) <= 60),
  frames jsonb check (frames is null or (jsonb_typeof(frames) = 'object' and pg_column_size(frames) < 16384)),
  photo_id uuid,
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobado', 'rechazado')),
  note text check (char_length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade,
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  foreign key (photo_id, league_id) references public.photos (id, league_id) on delete set null (photo_id),
  check (event_id is not null or date is not null)
);
create index submissions_status_idx on public.submissions (league_id, status);
create index submissions_player_idx on public.submissions (player_id);
create index submissions_event_idx on public.submissions (event_id);
create index submissions_photo_idx on public.submissions (photo_id);
create index submissions_sync_idx on public.submissions (league_id, updated_at);

-- ---------- En vivo ----------
-- Última foto del marcador de cada jugador en el evento (para quien llega tarde o consulta cada 15-20 s).
-- subject_key 'p:<jugador>' (boliche); las fases de partidos agregan 'm:<partido>'. Se reparte por Broadcast.
create table public.live_states (
  event_id uuid not null,
  subject_key text not null check (subject_key ~ '^[a-z]:[0-9a-f-]{36}$'),
  league_id uuid not null,
  player_id uuid,
  -- Boliche: {"scores": [190, null, 210]}.
  state jsonb not null check (jsonb_typeof(state) = 'object' and pg_column_size(state) < 4096),
  version integer not null default 1,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, subject_key),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade,
  check (player_id is null or subject_key = 'p:' || player_id::text)
);
create index live_states_player_idx on public.live_states (player_id);
create index live_states_sync_idx on public.live_states (league_id, updated_at);

-- ---------- Social ----------
-- Sobre una participación. league/event/player salen de la participación (FK compuesta) y el autor de la
-- membresía: la RPC los llena desde la base, nunca del cliente.
create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null,
  entry_id uuid not null,
  event_id uuid not null,
  player_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  type text not null check (type in ('like', 'felicitar')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_id, user_id),
  foreign key (entry_id, league_id, event_id, player_id)
    references public.entries (id, league_id, event_id, player_id) on delete cascade
);
create index reactions_player_idx on public.reactions (player_id, created_at);
create index reactions_event_idx on public.reactions (event_id);
create index reactions_user_idx on public.reactions (user_id);
create index reactions_sync_idx on public.reactions (league_id, updated_at);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null,
  entry_id uuid not null,
  event_id uuid not null,
  player_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  text text not null check (char_length(text) between 1 and 500 and btrim(text) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (entry_id, league_id, event_id, player_id)
    references public.entries (id, league_id, event_id, player_id) on delete cascade
);
create index comments_entry_idx on public.comments (entry_id);
create index comments_player_idx on public.comments (player_id, created_at);
create index comments_event_idx on public.comments (event_id);
create index comments_user_idx on public.comments (user_id);
create index comments_sync_idx on public.comments (league_id, updated_at);

-- Buzón anónimo: no hay columna de autor. El ritmo se lleva aparte en private.paces (nadie lo lee).
create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 1000 and btrim(text) <> ''),
  read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index suggestions_league_idx on public.suggestions (league_id, created_at desc);
create index suggestions_sync_idx on public.suggestions (league_id, updated_at);

-- ---------- Push ----------
-- Solo servicios de push conocidos (el envío no le escribe a cualquier dirección), como en firestore.rules.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (
    char_length(endpoint) < 1000
    and endpoint ~ '^https://(fcm\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/'),
  p256dh text not null check (char_length(p256dh) between 1 and 199),
  auth text not null check (char_length(auth) between 1 and 99),
  ua text not null default '' check (char_length(ua) <= 200),
  fail_count smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Fase 0C (cron y Edge Functions con service_role): RLS activada y ninguna política para la app.
create table public.reminders_sent (
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (char_length(kind) <= 40),
  sent_at timestamptz not null default now(),
  primary key (event_id, kind)
);

create table public.push_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  body text check (char_length(body) <= 1000),
  url text check (char_length(url) <= 500),
  tag text check (char_length(tag) <= 100),
  ttl integer,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts smallint not null default 0
);
create index push_outbox_pending_idx on public.push_outbox (created_at) where sent_at is null;

-- ---------- Borrados (para la sincronización por cambios) ----------
-- row_key: el id; en tablas de clave doble, las dos partes con ':' (event_rsvps '<evento>:<jugador>',
-- league_members '<liga>:<cuenta>', live_states '<evento>:<subject_key>'). Borrar una liga deja solo la
-- fila de la liga (tbl = 'leagues'), no la de cada hija.
create table public.tombstones (
  id bigint generated always as identity primary key,
  tbl text not null,
  row_key text not null,
  league_id uuid not null,
  deleted_at timestamptz not null default now()
);
create index tombstones_league_idx on public.tombstones (league_id, deleted_at);

-- ---------- Private ----------
-- Ritmo por cuenta, liga y tipo (comentario 3 s, sugerencia 60 s). Nadie lo lee por la API.
create table private.paces (
  user_id uuid not null,
  league_id uuid not null references public.leagues (id) on delete cascade,
  kind text not null,
  last_at timestamptz not null,
  primary key (user_id, league_id, kind)
);

-- Archivos de Storage por borrar (fotos borradas, ligas borradas). Lo vacía la Edge Function purge-photos.
create table private.storage_purge_queue (
  path text primary key,
  queued_at timestamptz not null default now()
);

-- ---------- Vista: membresías con su jugador ----------
-- security_invoker: aplica la RLS de quien consulta (league_members y players).
create view public.memberships with (security_invoker = true) as
  select m.league_id, m.user_id, m.role, m.is_scorer, m.display_name, m.joined_at, m.updated_at, p.id as player_id
  from public.league_members m
  left join public.players p on p.league_id = m.league_id and p.user_id = m.user_id;
