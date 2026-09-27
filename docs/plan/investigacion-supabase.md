# MatchMate en Supabase Free: diseño del backend (26-09-2026)

Revisé el repositorio de BowlingX sin modificar nada: `firestore.rules` (407 líneas), `src/lib/types.ts`, `data.ts` (1.353 líneas), `scan.ts`, `scanJobs.ts`, el workflow `recordatorios.yml` y `scripts/push/recordatorios.ts`. En total son unas 14.400 líneas de TS/TSX y 763 líneas de pruebas de reglas. Los datos de límites salen de la documentación oficial de 2026 (fuentes al final).

---

## 1) Límites del plan Free y lo que significan para anotar en vivo

| Recurso | Free (2026) | Consecuencia para MatchMate |
|---|---|---|
| Base de datos | 500 MB (CPU compartida, 500 MB de RAM) | Las fotos van a Storage y no a la base (hoy BowlingX las guarda en base64 dentro de Firestore). El registro punto por punto se compacta al cerrar el partido. |
| Storage | 1 GB, 50 MB por archivo. Sin transformación de imágenes | La compresión se hace en el teléfono (WebP de 150–300 KB) y las fotos se borran pasado un tiempo. |
| Egress (datos que salen) | 5 GB normal + 5 GB en caché (CDN) | La app no puede descargar la liga completa cada vez que abre (como hace hoy con `onSnapshot`). Solo pide lo que cambió desde la última vez y guarda una copia local. |
| Usuarios activos al mes | 50.000 (también los que entran con Google) | Sobra. |
| Edge Functions | 500.000 llamadas/mes. Por llamada: 2 s de CPU, 150 s de reloj y 256 MB. Máximo 100 funciones | Alcanza para los recordatorios, la lectura de fotos y el borrado de fotos viejas. |
| Realtime | 200 conexiones simultáneas en todo el proyecto. 2 M mensajes/mes. 100 mensajes/s (promedio del último minuto; cuentan los enviados y los entregados). 100 canales por conexión. Presence: 20 mensajes/s. Mensaje máximo de 256 KB | Es el límite que más aprieta (ver abajo). En Free no se puede subir el límite de mensajes por segundo ni el tamaño. |
| Cómo se cuentan los mensajes | Broadcast = 1 + N receptores. Postgres Changes = N | Hay que calcular un presupuesto por evento. |
| Programar tareas (Cron) | La documentación no pone restricción de plan. Recomienda un máximo de 8 tareas a la vez y 10 minutos por tarea | Sustituye al cron de GitHub Actions. |
| Pausa por inactividad | Pausa tras 1 semana de "poca actividad de base de datos", con aviso por correo una semana antes. Se reanuda desde el panel | Hace falta un "mantener despierto" (ver abajo). |
| Copias de seguridad | Ninguna (tampoco PITR). La recomendación oficial es `supabase db dump` hacia otro lugar | Copia diaria con GitHub Actions a un repositorio privado. |
| Correos de Auth | 2 correos por hora con el servidor de correo incluido | Hace falta SMTP propio: Resend Free da 100/día y 3.000/mes. |
| Otros | 2 proyectos activos. Logs de 1 día. Sin dominio propio en Supabase. La conexión directa a Postgres es solo IPv6 (el pooler sí tiene IPv4) | Un proyecto `matchmate-prod` y otro `matchmate-staging`. Para desarrollo local, `supabase start` (Docker). Los respaldos se hacen por el pooler en modo sesión. |

**Pausa y "mantener despierto":**
- No está publicado qué cuenta exactamente como "suficiente actividad". Hay reportes de proyectos que se pausaron aunque recibían un SELECT diario por la API. Hay que hacer una escritura real.
- Una vez al día, el workflow de respaldo (GitHub Actions en repo privado) llama a `rpc/ping`, que hace `insert … on conflict update private.heartbeat`.
- Además, cada 15 minutos corre el cron de recordatorios, que también escribe en `reminders_sent`.
- Hay que vigilar el correo de aviso de pausa.
- Sobre cuánto tiempo se puede recuperar un proyecto pausado: la documentación actual dice 1 año y un changelog de 2024 decía 90 días. No hay que depender de eso: la protección real son los respaldos externos.

**Aviso de seguridad:** el repositorio de BowlingX es público (lo dice el propio `recordatorios.ts`). Los respaldos de MatchMate nunca pueden ir ahí.

**Presupuesto de Realtime para anotar en vivo:**
- Límite por segundo: actualizaciones por segundo × (espectadores + 1) ≤ 80 en todo el proyecto (dejo un 20 % de margen sobre 100).
- Límite mensual: suma de actualizaciones × (espectadores + 1) ≤ 2 M.

| Escenario | Carga por segundo | Carga al mes |
|---|---|---|
| Noche de liga de boliche: 40 jugadores, actualización por cuadro (unas 0,5/s en total), 40 espectadores | ≈ 22 mensajes/s | 1.200 actualizaciones × 41 ≈ 49.000 por noche, unos 200.000 al mes por liga. Unas 10 ligas así llenan los 2 M. |
| Club de pádel: 6 canchas punto a punto (0,22/s), 15 espectadores por partido | ≈ 3,6 mensajes/s | ≈ 2.400 por partido |
| Baloncesto con 150 espectadores conectados | Los mensajes caben | Casi llega al tope de **200 conexiones de todo el proyecto** |

**Reglas que salen de estos números:**
- Se usa Broadcast y no Postgres Changes.
- Cada anotador envía como máximo una actualización cada 2–3 s, siempre con el estado completo más reciente.
- Solo se conecta a Realtime quien tiene abierta la pantalla "En vivo". Se desconecta si la pantalla lleva más de 60 s oculta.
- No se usa Presence.
- Los espectadores sin cuenta en ligas públicas consultan cada 15–20 s en lugar de conectarse.
- Si Realtime responde `too_many_connections`, la app pasa sola a consultar cada cierto tiempo.

---

## 2) Esquema de Postgres para varios deportes

Principios del diseño:
- Todo vive en `public` con RLS activado. Las funciones de ayuda van en el esquema `private`, que la API no expone.
- Los ids son `uuid`. El cliente puede generarlos (UUID v7) para poder crear cosas sin conexión.
- Todas las tablas que se sincronizan llevan `updated_at` (actualizado por trigger).
- Los borrados se registran en `tombstones` con un trigger AFTER DELETE. Así los borrados en cascada también quedan registrados y la sincronización por cambios los ve.
- No se agrega ninguna tabla a la publicación `supabase_realtime`.

```sql
create type sport as enum ('bowling','padel','tennis','pickleball','basketball','football','futsal','golf','swimming');
create type league_kind as enum ('league','tournament');      -- liga | torneo
create type visibility  as enum ('public','private');
create type league_role as enum ('owner','admin','member');
create type submission_status as enum ('pending','approved','rejected');
create function public.sport_family(s sport) returns text language sql immutable as $$
  select case when s in ('bowling','golf','swimming') then 'series'
              when s in ('padel','tennis','pickleball') then 'racket' else 'team' end $$;

-- Cuentas
create table profiles (id uuid primary key references auth.users on delete cascade,
  email text not null, name text not null check (char_length(name) between 1 and 60),
  is_superadmin boolean not null default false, firebase_uid text unique,
  created_at timestamptz not null default now());      -- se crea con un trigger en auth.users

-- Ligas: el deporte se fija al crearla (un trigger impide cambiar sport u owner_id)
create table leagues (id uuid primary key default gen_random_uuid(),
  sport sport not null, kind league_kind not null default 'league', visibility visibility not null,
  name text not null check (char_length(name) between 1 and 60),
  owner_id uuid not null references profiles,
  venue text check (char_length(venue) <= 80), schedule text check (char_length(schedule) <= 80),
  season_start date, season_end date,
  contact_name text check (char_length(contact_name) <= 60), contact_phone text check (contact_phone ~ '^[0-9]{0,20}$'),
  require_photo boolean not null default false,
  has_minors boolean not null default false,
  tz text not null default 'America/Santo_Domingo',
  rules jsonb not null default '{}',                   -- reglas del deporte (punto de oro, sets, WHS…)
  created_at timestamptz default now(), updated_at timestamptz default now(),
  check (not has_minors or (visibility = 'private' and not require_photo)));
create table league_secrets (league_id uuid primary key references leagues on delete cascade,
  invite_code text not null unique check (char_length(invite_code) >= 8));   -- solo lo ven los admins
create table league_members (league_id uuid references leagues on delete cascade,
  user_id uuid references profiles on delete cascade, role league_role not null default 'member',
  is_scorer boolean not null default false, display_name text not null,
  joined_at timestamptz default now(), updated_at timestamptz default now(),
  primary key (league_id, user_id));
create unique index one_owner on league_members (league_id) where role = 'owner';

-- Jugadores: la cuenta es el jugador. Un admin puede crear jugadores sin cuenta y luego vincularlos.
create table players (id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues on delete cascade,
  user_id uuid references profiles on delete set null,
  name text not null check (char_length(name) between 1 and 60),
  average_override numeric(5,2), handicap_index numeric(4,1),      -- promedio de boliche / índice WHS de golf
  is_minor boolean not null default false, attrs jsonb not null default '{}',
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (league_id, user_id),                  -- un jugador por cuenta y liga (sustituye la lógica con getAfter)
  check (not is_minor or user_id is null));     -- los menores no tienen cuenta

-- Equipos: event_id null = equipo de temporada (baloncesto/fútbol); con evento = equipos del torneo de boliche
create table teams (id uuid primary key default gen_random_uuid(), league_id uuid not null references leagues on delete cascade,
  event_id uuid, name text not null, sort_order int not null default 0, color text, updated_at timestamptz default now());
create table team_players (team_id uuid references teams on delete cascade, player_id uuid references players on delete cascade,
  jersey smallint, primary key (team_id, player_id));

create table events (id uuid primary key default gen_random_uuid(), league_id uuid not null references leagues on delete cascade,
  type text not null,           -- boliche: tournament|practice; pádel: americano|mexicano|match_day|tournament…; se valida por deporte con trigger
  name text, date date not null, start_time time,
  status text not null default 'scheduled' check (status in ('scheduled','live','finished','cancelled')),
  games smallint not null default 3 check (games between 1 and 10),
  hcp_base smallint, hcp_percent smallint, individual_rank_by text, team_rank_by text,
  category_cuts smallint[], team_size smallint, announcement text check (char_length(announcement) <= 1000),
  config jsonb not null default '{}', created_at timestamptz default now(), updated_at timestamptz default now());
alter table teams add foreign key (event_id) references events on delete cascade;
create table event_rsvps (event_id uuid references events on delete cascade, player_id uuid references players on delete cascade,
  league_id uuid not null, going boolean not null, updated_at timestamptz default now(), primary key (event_id, player_id));

-- Familia "series" (boliche 1:1, golf; en natación sirve de inscripción)
create table entries (id uuid primary key default gen_random_uuid(), league_id uuid not null,
  event_id uuid not null references events on delete cascade, player_id uuid not null references players on delete cascade,
  team_id uuid references teams on delete set null, average numeric(5,2) not null default 0, handicap_override smallint,
  scores smallint[] not null default '{}',   -- pinos por juego (boliche) / golpes por hoyo (golf); validado por deporte con trigger
  photos text[] not null default '{}',       -- id de foto | 'importado' | 'sin-foto' | null (borrador)
  frames jsonb, category text, data jsonb not null default '{}',
  updated_at timestamptz default now(), unique (event_id, player_id));
create table swim_races (id uuid primary key default gen_random_uuid(), event_id uuid not null references events on delete cascade,
  league_id uuid not null, stroke text, distance_m smallint, gender text, age_group text, sort_order int);
create table swim_results (race_id uuid references swim_races on delete cascade, player_id uuid references players on delete cascade,
  league_id uuid not null, heat smallint, lane smallint, time_ms int,
  status text not null default 'ok' check (status in ('ok','dq','dns','dnf')), primary key (race_id, player_id));

-- Familias "racket" y "team": partidos con dos lados
create table matches (id uuid primary key default gen_random_uuid(), league_id uuid not null references leagues on delete cascade,
  event_id uuid references events on delete cascade, format text not null, rules jsonb not null default '{}',
  round smallint, court text,
  status text not null default 'scheduled' check (status in ('scheduled','live','finished','confirmed','disputed','void')),
  scorer_id uuid references profiles, score jsonb not null default '{}',   -- sets/juegos o marcador por periodo
  winner_side smallint check (winner_side in (1,2)), log_seq int not null default 0, log_archive jsonb,
  finished_by_side smallint, confirmed_by uuid, confirmed_at timestamptz,
  started_at timestamptz, finished_at timestamptz, updated_at timestamptz default now());
create table match_sides (match_id uuid references matches on delete cascade, side smallint check (side in (1,2)),
  team_id uuid references teams, label text, primary key (match_id, side));
create table match_players (match_id uuid references matches on delete cascade, player_id uuid references players on delete cascade,
  side smallint not null, position smallint, league_id uuid not null, primary key (match_id, player_id));
create index on match_players (player_id);
-- Registro solo de agregar: puntos de raqueta, y goles/puntos/faltas/cambios de equipo. "Deshacer" es otra fila.
create table match_log (match_id uuid references matches on delete cascade, seq int not null,
  type text not null, side smallint, player_id uuid, period smallint, clock_ms int, value smallint, ref_seq int,
  created_by uuid not null, created_at timestamptz default now(), primary key (match_id, seq));

-- En vivo (foto instantánea duradera para quien llega tarde o consulta periódicamente; se envía por Broadcast)
create table live_states (event_id uuid references events on delete cascade, subject_key text,  -- 'p:<player>' | 'm:<match>'
  league_id uuid not null, player_id uuid, match_id uuid, state jsonb not null, version int not null default 0,
  updated_by uuid, updated_at timestamptz default now(), primary key (event_id, subject_key));

create table photos (id uuid primary key default gen_random_uuid(), league_id uuid not null references leagues on delete cascade,
  event_id uuid, path text not null unique, width int, height int, bytes int,
  uploaded_by uuid not null, created_at timestamptz default now(), expires_at timestamptz, purged_at timestamptz);
create table submissions (id uuid primary key default gen_random_uuid(), league_id uuid not null references leagues on delete cascade,
  event_id uuid references events on delete cascade, date date, player_id uuid not null references players on delete cascade,
  scores smallint[] not null, scanned smallint[], scanned_name text check (char_length(scanned_name) <= 60),
  frames jsonb, photo_id uuid references photos on delete set null, payload jsonb,   -- payload: otros deportes
  status submission_status not null default 'pending', note text, created_at timestamptz default now(),
  reviewed_at timestamptz, reviewed_by uuid,
  check ((event_id is not null and date is null) or (event_id is null and date is not null)));

-- Social: reacciones y comentarios sobre una participación (entry) o un partido (match); un trigger rellena league/event/player/author_name
create table reactions (id uuid primary key default gen_random_uuid(), league_id uuid not null,
  entry_id uuid references entries on delete cascade, match_id uuid references matches on delete cascade,
  event_id uuid, player_id uuid, user_id uuid not null, author_name text not null,
  type text not null check (type in ('like','felicitar')), created_at timestamptz default now(),
  check (num_nonnulls(entry_id, match_id) = 1));
create unique index on reactions (entry_id, user_id) where entry_id is not null;
create unique index on reactions (match_id, user_id) where match_id is not null;
create table comments (like reactions including defaults excluding constraints);   -- mismas columnas…
alter table comments drop column type, add column text text not null check (char_length(text) between 1 and 500);
create table suggestions (id uuid primary key default gen_random_uuid(), league_id uuid not null references leagues on delete cascade,
  text text not null check (char_length(text) between 1 and 1000), read boolean not null default false,
  created_at timestamptz default now());                    -- sin columna de autor: es anónima

create table notifications (id bigint generated always as identity primary key, user_id uuid not null references profiles on delete cascade,
  league_id uuid, kind text not null, title text not null, body text, url text,
  created_at timestamptz default now(), read_at timestamptz);   -- la llenan triggers; se borran a los 60 días
create table push_subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles on delete cascade,
  endpoint text not null unique check (char_length(endpoint) < 1000 and endpoint ~ '^https://(fcm\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/'),
  p256dh text not null check (char_length(p256dh) < 200), auth text not null check (char_length(auth) < 100),
  ua text check (char_length(ua) <= 200), fail_count smallint default 0, updated_at timestamptz default now());
create table reminders_sent (event_id uuid references events on delete cascade, kind text, sent_at timestamptz default now(),
  primary key (event_id, kind));                             -- cada recordatorio se manda una sola vez
create table push_outbox (id bigint generated always as identity primary key, user_id uuid not null, title text, body text,
  url text, tag text, ttl int, created_at timestamptz default now(), sent_at timestamptz, attempts smallint default 0);
create table tombstones (tbl text, row_id uuid, league_id uuid, deleted_at timestamptz default now());
-- Esquema private (no expuesto): paces (ritmo), heartbeat, storage_purge_queue
```

Índices: uno en cada FK, más `(league_id, updated_at)` en cada tabla que se sincroniza, `submissions (league_id, status)` y `notifications (user_id, created_at desc)`.

**Tamaño estimado:**
- Una temporada de boliche (30 eventos × 40 jugadores) ocupa menos de 1 MB.
- Un partido punto a punto ocupa unos 18 KB en `match_log`. Al confirmarse se compacta en `log_archive` (jsonb comprimido, unos 4 KB) y se borran las filas.
- 10.000 partidos ocupan unos 50 MB.

**Estadísticas, rankings y Excel en la fase 0:** se siguen calculando en el cliente (se reutilizan `stats.ts` y sus pruebas) con las participaciones sincronizadas por cambios. Más adelante se pueden pasar a una RPC si el egress lo pide.

---

## 3) RLS: equivalencias con las reglas de Firestore

**Funciones de ayuda.** Son `security definer`, `stable` y con `set search_path = ''`. Se da `grant usage on schema private to anon, authenticated` y `execute` solo sobre ellas; como el esquema no está expuesto, no se pueden llamar por REST. Las que devuelven conjuntos se usan dentro de `(select …)` para que se evalúen una sola vez por consulta y no una por fila.

```sql
create function private.is_super() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and is_superadmin) $$;
-- Se quita la lista fija 'admin@admin.com': si no hay confirmación de correo, cualquiera podría registrarse con ese email.
-- El superadmin se siembra por SQL.
create function private.my_leagues() returns setof uuid language sql stable security definer set search_path = '' as $$
  select league_id from public.league_members where user_id = (select auth.uid()) $$;
create function private.admin_leagues() returns setof uuid language sql stable security definer set search_path = '' as $$
  select league_id from public.league_members where user_id = (select auth.uid()) and role in ('owner','admin')
  union select id from public.leagues where private.is_super() $$;
create function private.owner_leagues() returns setof uuid ...;   -- igual, pero solo role = 'owner'
create function private.readable_leagues() returns setof uuid language sql stable security definer set search_path = '' as $$
  select id from public.leagues where visibility = 'public' or private.is_super()
  union select private.my_leagues() $$;
create function private.my_player(lid uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.players where league_id = lid and user_id = (select auth.uid()) $$;
create function private.is_scorer(lid uuid) returns boolean ...;  -- is_scorer y (deporte <> boliche o kind = 'tournament'), igual que hoy
create function public.ok_pins(a smallint[]) returns boolean language sql immutable as $$
  select cardinality(a) <= 10 and coalesce(bool_and(x is null or x between 0 and 300), true) from unnest(a) x $$;
```

**Tabla de equivalencias:**

| Regla en Firestore | En Supabase |
|---|---|
| `canRead` (liga pública o miembro) | `for select to anon, authenticated using (league_id in (select private.readable_leagues()))` en todas las tablas de la liga. |
| Admin de la liga escribe todo | `for all to authenticated using/with check (league_id in (select private.admin_leagues()))` |
| Crear liga y quedar como dueño en el mismo lote (`getAfter`) | Policy de insert `with check (owner_id = (select auth.uid()))` más un trigger AFTER INSERT que crea la membresía de dueño y el código de invitación. Todo ocurre en la misma transacción. |
| Invitaciones (`invites/{code}` se lee pero no se lista) | `league_secrets` solo para admins. `invite_preview(code)` es security definer y devuelve solo id, nombre y deporte. `join_league(lid, code)` valida el código e inserta la membresía, con límite de intentos para frenar la fuerza bruta. `renew_invite_code(lid)` es solo para admins. |
| Un jugador por cuenta; reclamar un jugador una sola vez; soltarlo al salir | Restricción `unique(league_id, user_id)` más RPCs: `ensure_my_player(lid)`, `claim_player(pid)` (`update … where user_id is null`; si no afecta filas, error) y `leave_league(lid)`. Desaparece el doble dato `member.playerId`/`player.uid`. |
| Roles (el dueño da y quita admin y anotador; un admin se baja solo; el rol de dueño es intocable) | RPCs `set_member_role`, `set_member_scorer` (solo dueño) y `step_down_admin()`. Sin UPDATE directo sobre `league_members` (revoke). Policy de DELETE con las mismas reglas de hoy: salir uno mismo (salvo el dueño); un admin saca solo a miembros sin permisos; el dueño o el superadmin sacan a cualquiera. |
| `onlyChanged([...])` | Opción 1: permisos por columna (`revoke update … ; grant update (read) on suggestions to authenticated`). Opción 2: un trigger BEFORE UPDATE que falla si `private.changed_keys(to_jsonb(old), to_jsonb(new))` no está dentro de lo permitido para el rol (por ejemplo, el anotador solo cambia `scores`, `photos`, `frames` en `entries`). |
| Asistencia "voy" (solo la propia) | Tabla `event_rsvps` con `with check (player_id = private.my_player(league_id))`. |
| Práctica: +1 juego (de uno en uno, hasta 10) | RPC `add_practice_game(eid)`: `update events set games = games + 1 where id = eid and type = 'practice' and games < 10` y el que llama tiene jugador. |
| `live/{event_player}` (solo el propio; en un torneo, solo si está inscrito) | Policy de insert/update: `subject_key = 'p:' \|\| private.my_player(league_id)`, el evento existe y es práctica o existe la participación. En partidos: `match_id` con `scorer_id = auth.uid()`. |
| Envíos pendientes | RPC `submit_games(op_id, …)` que inserta la foto y el envío de forma atómica y no se duplica si se reintenta. Valida `ok_pins`, evento o fecha, y foto de la misma liga. |
| "Una sola vez": agregar lo que leyó la IA | Ver la RPC `set_submission_scan` más abajo. |
| Aprobar o rechazar | RPCs `approve_submission` y `reject_submission` (solo admin, una transacción). Actualizan o crean la participación, cambian el estado, notifican y fijan `photos.expires_at`. |
| Social (miembro, el juego existe, nombre correcto) | La FK a `entries`/`matches` sustituye `exists()`. Un trigger BEFORE INSERT rellena `league_id`, `event_id`, `player_id` y `author_name` desde la base de datos, sin fiarse del cliente. La policy exige `user_id = auth.uid()`, liga en `my_leagues()` y liga sin menores. Sin UPDATE en comentarios. Borran el autor o un admin. |
| Ritmo (`limits` + `paced()`) | Un trigger en `private.paces`, que nadie puede leer por la API (ver abajo). |
| Buzón anónimo | `suggestions` no tiene autor. Insertan los miembros; leen, marcan y borran los admins. Opcional: redondear `created_at` a la hora para que no se pueda cruzar con `paces`. |
| Push | Cada cuenta ve y cambia solo sus propias suscripciones. El CHECK sobre la URL (endpoint) se copia de las reglas. |
| Menores | `players.is_minor` sin cuenta. Si `leagues.has_minors` es verdadero, las policies de social, fotos y Storage niegan. Esas ligas son siempre privadas. |
| Storage | Ver la sección 7. |

**Ritmo y "una sola vez":**

```sql
create table private.paces (user_id uuid, league_id uuid, kind text, last_at timestamptz, primary key (user_id, league_id, kind));
create function private.enforce_pace() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.paces as p values ((select auth.uid()), new.league_id, tg_argv[0], now())
  on conflict (user_id, league_id, kind) do update set last_at = excluded.last_at
    where p.last_at < now() - make_interval(secs => tg_argv[1]::int);
  if not found then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger comments_pace    before insert on comments    for each row execute function private.enforce_pace('comment','3');
create trigger suggestions_pace before insert on suggestions for each row execute function private.enforce_pace('suggestion','60');

create function public.set_submission_scan(p_id uuid, p_scanned smallint[], p_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.submissions s set scanned = p_scanned, scanned_name = left(p_name, 60)
   where s.id = p_id and s.player_id = private.my_player(s.league_id)
     and s.status = 'pending' and s.photo_id is not null and s.scanned is null
     and cardinality(p_scanned) between 1 and 10 and public.ok_pins(p_scanned);
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
end $$;
revoke execute on function public.set_submission_scan from public, anon;
grant  execute on function public.set_submission_scan to authenticated;
```

**Criterio general:** donde Firestore usaba `getAfter`/`existsAfter` (lotes que tenían que ser coherentes), aquí va una RPC `security definer` en plpgsql, que es atómica por naturaleza, o un trigger.

**Pruebas:** las 763 líneas de `reglas.test.ts` se pasan a pgTAP con `supabase test db`. Mejores prácticas de RLS que aplico: `(select auth.uid())`, índice en cada columna que filtra una policy, `to authenticated` explícito y pocos JOIN (en su lugar, funciones security definer).

---

## 4) Realtime: Broadcast frente a Postgres Changes

**Postgres Changes: no usarlo para el marcador en vivo.**
- Revisa RLS una vez por cada suscriptor en cada cambio.
- Procesa todo en un solo hilo.
- Cuenta un mensaje por cada cliente.
- En la instancia pequeña, con RLS y 500 clientes, aguanta unos 30 cambios por segundo.

**Broadcast: es lo recomendado.**
- Reparte el mensaje una vez a todos.
- La autorización se revisa al unirse al canal y queda en caché durante la conexión.
- Enviado desde la base de datos con trigger aguanta unos 10.000 mensajes/s en las pruebas oficiales.

**Patrón recomendado:**
1. El anotador escribe `live_states` (o `match_log` + `live_states`) por RPC desde su cola de pendientes (sección 5).
2. Un trigger AFTER INSERT/UPDATE en `live_states` publica el estado autoritativo en un canal privado por evento:

```sql
create function private.broadcast_live() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('k', new.subject_key, 's', new.state, 'v', new.version),
                        'live', 'event:' || new.event_id, true);
  return null;
end $$;
create trigger live_broadcast after insert or update on live_states for each row execute function private.broadcast_live();

create policy live_read on realtime.messages for select to anon, authenticated using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) like 'event:%'
  and exists (select 1 from public.events e where e.id = split_part((select realtime.topic()), ':', 2)::uuid
              and e.league_id in (select private.readable_leagues())));
-- No hay policy de INSERT: los clientes no pueden enviar mensajes falsos al canal.
```

3. En el cliente: `await supabase.realtime.setAuth()` y luego `supabase.channel('event:'+id, { config: { private: true } }).on('broadcast', { event: 'live' }, apply).subscribe()`. Primero se lee el estado de `live_states` (quien llega tarde queda al día sin usar replay) y luego se suscribe.
4. En Ajustes de Realtime, desactivar "Allow public access" para que solo existan canales privados.

**Pendiente de verificar en staging:** si el rol `anon` puede unirse a canales privados. Si no puede, los espectadores sin cuenta consultan periódicamente.

**Patrones para no pasarse del gratis:**
- Un canal por evento, no por jugador.
- Estado completo menor de 2 KB y no cambios sueltos.
- El cliente agrupa cambios: como máximo un envío cada 2–3 s por anotador. En boliche se puede enviar por juego en lugar de por cuadro.
- Suscribirse solo en las pantallas "En vivo" y darse de baja con `visibilitychange` (oculta más de 60 s). supabase-js solo abre el WebSocket al suscribirse a un canal.
- Sin Presence.
- Espectadores anónimos o de ligas públicas: `GET live_states?event_id=eq.X` cada 15–20 s.
- Si Realtime devuelve `too_many_connections` o `tenant_events`, todos pasan a consultar cada cierto tiempo.
- Revisar cada semana el uso en Realtime Reports.
- Fase futura, si un partido tiene cientos de espectadores: una Edge Function escribe `live/{event}.json` en un bucket público con `cache-control: max-age=10`. Eso gasta el egress de caché (el CDN) y no conexiones.

---

## 5) Sin conexión en canchas y boleras con mala señal

| Opción | Gratis de verdad | Problemas para un solo desarrollador |
|---|---|---|
| **Cola propia en IndexedDB + TanStack Query persistido** | Sí, sin servicio extra | Hay que escribirla (unos 5–7 días). Todo es de código propio y se puede probar con las pruebas existentes. |
| PowerSync Cloud Free | Hasta 50 clientes simultáneos, 2 GB sincronizados/mes, 500 MB | Se desactiva tras 1 semana sin actividad (un segundo servicio que mantener despierto). Una sola noche de boliche (40 jugadores) llega casi al tope. Exige replicación lógica, y su documentación avisa del crecimiento del WAL en instancias inactivas (el disco es de 500 MB). Hay que repetir la seguridad en "sync streams". Pro cuesta desde 49 USD/mes. Instalarlo por cuenta propia requiere un servidor. Técnicamente es el mejor (SQLite WASM + OPFS). |
| RxDB + plugin de Supabase | Solo con el almacenamiento Dexie | IndexedDB y OPFS son de pago (desde 99 USD/mes, anual). Exige `_modified`/`_deleted` en cada tabla y copia tablas enteras por RLS. El "pull" en vivo usa Realtime y gasta conexiones y mensajes. |
| ElectricSQL | Tiene un plan con consumo gratis por debajo de 5 USD | Solo sincroniza lecturas: las escrituras sin conexión siguen siendo trabajo propio. Otro servicio más y replicación lógica. |
| Zero (Rocicorp) | No | Su documentación dice que no admite escrituras sin conexión. Necesita el servidor `zero-cache` y choca con funciones de Supabase. |

**Recomendación:** cola propia (patrón outbox) + `@tanstack/react-query` v5 persistido. `@tanstack/offline-transactions` es una opción a considerar más adelante: trae cola, elección de pestaña líder y reintentos, pero TanStack DB todavía está en versión 0.x.

**Cómo funciona en concreto:**

1. **Lecturas.** `PersistQueryClientProvider` guarda la caché en IndexedDB (`idb-keyval`) por 7 días, con `networkMode: 'offlineFirst'`. La sincronización por cambios pide solo lo nuevo de cada liga: `select … where league_id = $1 and updated_at > $cursor`, más los borrados de `tombstones` desde el cursor. Si el cursor tiene más de 60 días, se recarga todo. El service worker (vite-plugin-pwa) ya cubre el esqueleto de la app. Se llama a `navigator.storage.persist()` para que el navegador no borre los datos.

2. **Cola de pendientes (Dexie).** Guarda cada operación con `{op_id uuidv7, kind, args, collapse_key?, created_at, attempts}`.
   - La interfaz aplica el cambio en la caché de inmediato y, en la misma transacción de Dexie, agrega la operación a la cola.
   - Las operaciones con `collapse_key`, como `live:<event>:<player>`, se sustituyen: solo queda la última.
   - Un único proceso de envío (`navigator.locks`, una sola pestaña) manda la cola en orden (FIFO) por RPC.
   - Se dispara con: `online`, `visibilitychange` visible, al abrir la app y cada 30 s con espera creciente. iOS no tiene Background Sync, así que en iPhone se envía al abrir.

3. **Reintentos sin duplicados.**
   - Las RPCs reciben `p_op_id`. Guardan un registro en `private.op_log(op_id pk)` con `on conflict do nothing` y devuelven el resultado ya guardado.
   - Los registros de partido usan la secuencia: un solo anotador por partido (`matches.scorer_id`) hace que no haya que mezclar cambios.

```sql
-- push_match_log(p_match, p_events): con lock sobre matches.log_seq; omite seq <= último (reintento);
-- exige seq = último + 1 (sin huecos); inserta en match_log; actualiza log_seq.
```

   - Pasar el anotador a otra persona: `take_over_scoring(match_id, expected_seq)`.
   - Las ediciones de admin usan `expected_updated_at`. Si hay conflicto, se muestra "cambió en otro teléfono".

4. **Modo cancha (pádel y demás).** El marcador es una función pura `replay(log)` en TypeScript, que ya sirve para deshacer. El anotador envía el registro por lotes y el estado resumido a `live_states`. Al terminar, un jugador del otro lado confirma (`confirm_match`). Al confirmar, el registro se compacta.

5. **Fotos sin conexión.** El Blob se guarda en Dexie. Se ejecuta primero la operación `photo.upload` y después `submit_games`. La lectura con IA (`scanJobs.ts`) espera a que haya conexión.

6. **Sesión sin conexión.** El token de acceso de Supabase caduca (1 h) y no se puede renovar sin red. Si falla la renovación por falta de red, la app no debe cerrar la sesión: sigue trabajando local y renueva antes de enviar.

---

## 6) Auth

**Configuración:**
- Correo y contraseña, más Google. Para Google se usa `signInWithOAuth({ provider: 'google' })`, y opcionalmente One Tap con `signInWithIdToken`.
- SMTP propio con Resend Free (100/día). El correo incluido solo permite 2 por hora.
- Site URL y URLs de redirección para Vercel y localhost.
- Un trigger en `auth.users` crea `profiles`.

**Migrar las cuentas de BowlingX (hashes scrypt de Firebase).** Supabase Auth ya verifica hashes de Firebase de forma nativa. Su código fuente (`internal/crypto/password.go`) acepta:

`$fbscrypt$v=1,n=<mem_cost>,r=<rounds>,p=1,ss=<base64_salt_separator>,sk=<base64_signer_key>$<salt b64>$<passwordHash b64>`

Aquí `n` es el exponente (la memoria es 2^n). La API de admin acepta `password_hash`, `id` y `email_confirm`.

Pasos:
1. `firebase auth:export users.json --format=json --project bowlinx-12368`.
2. Copiar los parámetros del hash de la consola de Firebase: signer key, salt separator, rounds y mem_cost.
3. Crear cada usuario con `auth.admin.createUser({ id: uuidv5(firebaseUid, NS), email, email_confirm: true, password_hash, user_metadata: { name } })`. Guardar `profiles.firebase_uid`.

Qué pasa después:
- Los usuarios entran con su contraseña de siempre.
- No se convierte sola a bcrypt, pero se puede hacer opcionalmente con `updateUser({ password })` justo después de iniciar sesión.
- Los usuarios de Google se crean sin contraseña y con `email_confirm: true`. Al darle a "Continuar con Google", Supabase une las identidades con el mismo correo verificado.
- Si alguien ya creó una cuenta en MatchMate con el mismo correo antes de la migración, se reutiliza ese uuid.
- El UUID v5 determinista permite reescribir todas las referencias a uid y repetir la importación sin duplicar.
- La herramienta comunitaria `firebase-to-supabase` (con middleware) ya no hace falta.

---

## 7) Push desde Supabase, fotos y lectura con IA gratis

**Recordatorios push.** Sustituyen a GitHub Actions, al que GitHub apaga tras 60 días sin cambios en el repositorio.

1. **Cron cada 15 minutos:**
   ```sql
   select cron.schedule('recordatorios', '*/15 * * * *', $$ select private.enqueue_due_reminders() $$);
   ```
   `enqueue_due_reminders` traslada a SQL la lógica de `reminders.ts` (el día antes a las 12 pm, el mismo día y poco antes de empezar). Usa `now() at time zone leagues.tz`. Inserta en `reminders_sent … on conflict do nothing` para que cada uno salga una sola vez, y llena `push_outbox`.

2. **Llamada a la Edge Function.** Solo si hubo filas nuevas, hace `net.http_post` a la Edge Function `send-push`. La URL del proyecto y un secreto compartido están en Vault. La función tiene `verify_jwt = false` y comprueba la cabecera `x-cron-secret`.

3. **La Edge Function `send-push`:**
   - Usa `npm:web-push`: solo `generateRequestDetails` (el cifrado RFC 8291 y la firma VAPID) y envía con `fetch`, porque `sendNotification` usa `node:https`. La alternativa es `jsr:@negrel/webpush`.
   - Envía por lotes de 200 dentro de los 2 s de CPU.
   - Borra las suscripciones que responden 404/410.
   - Guarda `sent_at`.

4. **Otras tareas del cron:**
   - Borrar `notifications` de más de 60 días.
   - Borrar `tombstones` y `op_log`.
   - Borrar `cron.job_run_details` viejos.
   - Borrar `live_states` de eventos terminados hace más de 24 h.

5. **Suscripciones.** Las de BowlingX están atadas a su dominio. En MatchMate cada usuario vuelve a activar las notificaciones (hace falta un aviso en la interfaz). Las claves VAPID pueden ser nuevas.

**Fotos en Storage:**
- Bucket privado `scoreboards`: `file_size_limit` de 1 MB, `allowed_mime_types` `image/webp` e `image/jpeg`. Ruta `{league_id}/{photo_id}.webp`.
- Compresión en el teléfono: `createImageBitmap` + canvas, lado largo de 1600 px, WebP con calidad 0,72. Se reutiliza `image.ts`.
- Se muestran con `createSignedUrl` (1 h) y se guardan en la caché del service worker para ahorrar egress.

Policies de Storage:

```sql
create policy sb_read on storage.objects for select to anon, authenticated using (
  bucket_id = 'scoreboards' and ((storage.foldername(name))[1])::uuid in (select private.readable_leagues()));
create policy sb_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'scoreboards' and private.can_upload_photo(((storage.foldername(name))[1])::uuid));
  -- can_upload_photo: admin, anotador o miembro con jugador, y liga sin menores
```

**Cuánto tiempo se guardan las fotos:**
- Al aprobar: `expires_at = now() + interval '90 days'` (configurable por liga).
- Envíos rechazados: 7 días.
- Un cron diario llama a la Edge Function `purge-photos`, que borra con `storage.from('scoreboards').remove(paths)`. Nunca se borra con SQL: lo impide el trigger `protect_delete`, y además dejaría archivos huérfanos.
- Luego marca `purged_at`. La participación mantiene la marca de "verificado", así que las estadísticas no cambian.
- Al borrar una liga, un trigger manda las rutas a `private.storage_purge_queue`.
- Capacidad: 1 GB alcanza para unas 5.000 fotos vivas a la vez.

**Lectura de fotos con IA (solo boliche, gratis):**
- Edge Function `scan-scoreboard`: comprueba que `league.sport = 'bowling'`, descarga la foto de Storage y llama a la API de Gemini con una clave gratuita de AI Studio.
- Modelos: Gemini 3.5 Flash-Lite, y 3.8 Flash como respaldo cuando da 429. Los dos son gratis en la capa gratuita.
- Se mantienen el `responseSchema` y el prompt actuales. Desaparecen App Check y reCAPTCHA.
- Límite propio por usuario y por día en la base (por ejemplo 30), más un tope global por debajo del cupo diario de AI Studio. La espera de la red cuenta como tiempo de reloj, no de CPU.
- Aviso de privacidad: en la capa gratuita Google puede usar los datos "para mejorar sus productos". Hay que decirlo en la política de privacidad; en ligas con menores no hay fotos.
- Si se acaba el cupo, se anota a mano. Tesseract en el teléfono no sirve para pantallas LCD fotografiadas en ángulo.

---

## 8) Estimación de esfuerzo (días-persona, un solo desarrollador)

**Fase 0: pasar BowlingX a Supabase en el repositorio nuevo de MatchMate** (solo boliche, con el esquema ya listo para varios deportes):

| Bloque | Días |
|---|---|
| Copia del repo, cambio de marca a MatchMate y logo, entorno, CLI, `supabase start`, migraciones, CI | 2–3 |
| Esquema y migraciones (base + boliche + tablas genéricas) | 3–4 |
| RLS, unas 25 RPCs y triggers (sustituyen las 407 líneas de reglas) | 5–7 |
| Pruebas pgTAP (sustituyen las 763 líneas de pruebas) | 3–4 |
| Auth (correo, Google, SMTP, recuperar contraseña, perfiles) | 2–3 |
| Reescribir la capa de datos (`data.ts`, unas 60 funciones/hooks de `onSnapshot` a TanStack Query + sincronización por cambios) | 7–9 |
| Cola sin conexión + persistencia + fotos en cola + sesión sin red | 5–7 |
| En vivo por Broadcast, con consulta periódica de respaldo | 2–3 |
| Fotos en Storage, compresión, borrado programado, URLs firmadas | 2–3 |
| Lectura con Gemini desde Edge Function | 1–2 |
| Push (cron + Edge Function + VAPID + interfaz de suscripción) | 2–3 |
| Bandeja de notificaciones con triggers y cambios de interfaz | 2–3 |
| Estadísticas, ranking y Excel sobre los datos nuevos | 2 |
| Respaldos, mantener despierto, monitoreo de uso | 1 |
| Pruebas en iPhone y Android como app instalada, correcciones | 4–6 |
| **Total Fase 0** | **≈ 43–60 (valor probable ~50)** |

- Sustituye la antigua "Fase 0 base".
- Las fases 1–7 por deporte (antes unas 85–110 en total) suben aproximadamente un 10 %, por las migraciones SQL, la RLS y las pruebas pgTAP de cada deporte.

**Fase de migración de datos (Firestore → Supabase, al terminar MatchMate):**

| Bloque | Días |
|---|---|
| Script de exportación con firebase-admin (colecciones + subcolecciones → NDJSON) | 1 |
| Transformación (detalle debajo) | 3 |
| Importar usuarios con fbscrypt + unión con Google + perfiles | 1 |
| Carga y verificación: conteos, promedios, rankings y totales por jugador idénticos | 2 |
| Ensayos en staging + corte final | 2 |
| Imprevistos | 1–2 |
| **Total** | **≈ 10–11** |

Detalle de la transformación:
- Ids a UUID v5 deterministas.
- Ids compuestos (`evento_jugador`, `liga_uid`).
- Mapa `rsvp` a filas de `event_rsvps`.
- Mapa `teams` a filas de `teams`.
- `member.playerId` a `players.user_id`.
- Fotos base64 a Storage. Solo los últimos N meses si no caben en 1 GB.
- Las marcas `importado`/`sin-foto` se conservan.
- `live` y `limits` no se migran.

Pasos del corte final:
1. Poner BowlingX en solo lectura.
2. Exportación final.
3. Importar a producción.
4. Redirigir el dominio de BowlingX a MatchMate.
5. Pedir a los usuarios que vuelvan a activar las notificaciones.

**Riesgos y decisiones abiertas:**
- Las 200 conexiones de Realtime de todo el proyecto.
- El criterio de pausa no está documentado.
- No hay copias de seguridad en Free (hay que usar el workflow propio).
- El cupo gratis de Gemini se ve solo en AI Studio y puede cambiar.
- Pasar a Pro (25 USD/mes) elimina la pausa y sube Realtime a 500 conexiones; con el tope de gasto desactivado, a 10.000.

---

## Fuentes
- Supabase precios y límites Free: https://supabase.com/pricing
- Realtime, límites: https://supabase.com/docs/guides/realtime/limits
- Realtime, cómo se cuentan los mensajes: https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages
- Realtime, Postgres Changes (limitaciones): https://supabase.com/docs/guides/realtime/postgres-changes
- Realtime, pruebas de rendimiento: https://supabase.com/docs/guides/realtime/benchmarks
- Realtime, Broadcast: https://supabase.com/docs/guides/realtime/broadcast
- Realtime, autorización: https://supabase.com/docs/guides/realtime/authorization
- Realtime, ajustes: https://supabase.com/docs/guides/realtime/settings
- Edge Functions, límites: https://supabase.com/docs/guides/functions/limits
- Programar Edge Functions con cron: https://supabase.com/docs/guides/functions/schedule-functions
- Supabase Cron: https://supabase.com/docs/guides/cron
- Pausa de proyectos Free: https://supabase.com/docs/guides/platform/free-project-pausing
- Changelog, restauración 90 días: https://supabase.com/changelog/27497-paused-free-plan-projects-are-restorable-for-90-days
- Copias de seguridad: https://supabase.com/docs/guides/platform/backups
- Respaldos con GitHub Actions: https://supabase.com/docs/guides/deployment/ci/backups
- Conexión a Postgres (IPv6, pooler): https://supabase.com/docs/guides/database/connecting-to-postgres
- Buenas prácticas de RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Pruebas de base de datos (pgTAP): https://supabase.com/docs/guides/database/testing
- Storage, control de acceso: https://supabase.com/docs/guides/storage/security/access-control
- Storage, borrar objetos: https://supabase.com/docs/guides/storage/management/delete-objects
- Storage, límites de archivo: https://supabase.com/docs/guides/storage/uploads/file-limits
- Auth, límites de correo: https://supabase.com/docs/guides/auth/rate-limits
- Auth, Google: https://supabase.com/docs/guides/auth/social-login/auth-google
- Auth, unión de identidades: https://supabase.com/docs/guides/auth/auth-identity-linking
- Migrar Auth desde Firebase: https://supabase.com/docs/guides/platform/migrating-to-supabase/firebase-auth
- Migrar datos de Firestore: https://supabase.com/docs/guides/platform/migrating-to-supabase/firestore-data
- Código de Supabase Auth, hashes: https://github.com/supabase/auth/blob/master/internal/crypto/password.go
- Código de Supabase Auth, API de admin: https://github.com/supabase/auth/blob/master/internal/api/admin.go
- Reporte de fallo de "mantener despierto" (anecdótico): https://github.com/shogotsuneto/heptapedal-infra/issues/107
- PowerSync, precios: https://www.powersync.com/pricing
- PowerSync + Supabase: https://docs.powersync.com/integration-guides/supabase-+-powersync
- PowerSync, SDK web: https://docs.powersync.com/client-sdks/reference/javascript-web
- RxDB, replicación Supabase: https://rxdb.info/replication-supabase.html
- RxDB, planes de pago: https://rxdb.info/premium/
- ElectricSQL, precios: https://electric-sql.com/blog/2026/04/02/electric-cloud-pricing
- Zero, cuándo usarlo: https://zero.rocicorp.dev/docs/when-to-use
- TanStack Query, mutaciones sin conexión: https://tanstack.com/query/latest/docs/framework/react/guides/mutations
- TanStack offline-transactions: https://www.npmjs.com/package/@tanstack/offline-transactions
- Gemini, precios: https://ai.google.dev/gemini-api/docs/pricing
- Gemini, límites de uso: https://ai.google.dev/gemini-api/docs/rate-limits
- Resend, precios: https://resend.com/pricing
- Vercel, cron: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Web Push en Deno: https://github.com/negrel/webpush

Archivos de BowlingX revisados (solo lectura):
- C:\Users\rgrullon\code\bowlinx\firestore.rules
- C:\Users\rgrullon\code\bowlinx\src\lib\types.ts
- C:\Users\rgrullon\code\bowlinx\src\lib\data.ts
- C:\Users\rgrullon\code\bowlinx\src\lib\scan.ts
- C:\Users\rgrullon\code\bowlinx\src\lib\scanJobs.ts
- C:\Users\rgrullon\code\bowlinx\src\lib\firebase.ts
- C:\Users\rgrullon\code\bowlinx\src\lib\notifications.ts
- C:\Users\rgrullon\code\bowlinx\.github\workflows\recordatorios.yml
- C:\Users\rgrullon\code\bowlinx\scripts\push\recordatorios.ts