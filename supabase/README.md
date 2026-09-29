# Base de datos de MatchMate: contrato de la API

Fase 0 (boliche igual que BowlingX + base multideporte). La capa de datos (`src/lib/data/*.ts`) se escribe
desde este documento. Fuente de verdad: `supabase/migrations/*.sql`.

- **Lecturas**: `select` sobre las tablas y la vista de abajo. La RLS decide qué filas ve cada quien.
- **Escrituras**: SOLO por RPC (`backend.rpc('<nombre>', { p_…: … })`). Nadie tiene `INSERT`, `UPDATE` ni
  `DELETE` sobre ninguna tabla (ni la cuenta, ni el superadmin: una prueba lo intenta en todas).
- Ids `uuid`. Donde la RPC acepta `p_id` (o `p_event_id`), el teléfono puede generar el id (crear sin señal).
- Nombres de columnas en `snake_case`. Los valores de texto son los de la app de hoy (`types.ts`):
  `kind` `'liga' | 'torneo'`, `type` `'torneo' | 'practica'`, `status` `'pendiente' | 'aprobado' | 'rechazado'`,
  marcas de foto `'importado'`, `'sin-foto'`. Así `stats.ts`, `bowling.ts`, etc. siguen sin cambios.

## Archivos

| Archivo | Qué es |
|---|---|
| `migrations/20260926000100_base.sql` | Privilegios por defecto cerrados, esquema `private`, errores, `emit`, `op_log`, límites de intentos, validaciones |
| `migrations/20260926000200_schema.sql` | Tablas (con FK compuestas para `league_id`) y la vista `memberships` |
| `migrations/20260926000300_triggers.sql` | `updated_at`, tombstones, perfil desde `auth.users`, deporte fijo, menores, validación por deporte, `player_count`, cola de fotos |
| `migrations/20260926000400_rls.sql` | Helpers (`is_admin`, `readable_leagues`, …), RLS en todas las tablas, `GRANT SELECT` |
| `migrations/20260926000500_rpc.sql` | Todas las RPC y la lista explícita de permisos |
| `migrations/20260926000600_realtime.sql` | Triggers que avisan por `private.emit` |
| `migrations/20260926000700_realtime_storage_supabase.sql` | **Solo Supabase**: políticas de `realtime.messages` y del bucket `scoreboards` |
| `migrations/20260926001000_scan.sql` · `001100_storage_supabase.sql` | Cupos de la lectura de fotos (`scan_*`) · bucket y políticas de Storage (solo Supabase) |
| `migrations/20260926001200_push.sql` · `001300_cron_supabase.sql` | Cola de push y recordatorios del boliche · pg_cron `mm-recordatorios`, `mm-limpieza`, `mm-despierto` (solo Supabase) |
| `migrations/20260927000100_partidos.sql` | Partidos de raqueta y equipos: lados, alineaciones, anotador con turno, confirmación del rival (48 h), W.O., equipos de temporada (ver `docs/partidos.md`) |
| `migrations/20260927000400_golf.sql` · `000500_natacion.sql` | Golf (campos, rondas, tarjetas) · natación (clubes, nadadores, encuentros, series y tiempos) |
| `migrations/20260927000600_padel.sql` · `000700_raqueta.sql` · `000800_baloncesto.sql` · `000900_futbol.sql` | Reglas de cada deporte (noches de puntos, cajas y escalera, convocatoria y mesa, sanciones) |
| `migrations/20260927000690_padel_cron_supabase.sql` · `000790_raqueta_cron_supabase.sql` | **Solo Supabase**: quita el cron viejo del pádel · plazos vencidos de la escalera |
| `migrations/20260927001100_consola.sql` | Consola del superadmin: visto por última vez, bloqueo de cuentas, auditoría, RPC `admin_*` y anuncios (ver «Consola del superadmin») |
| `migrations/20260927001200_avisos.sql` · `001290_avisos_supabase.sql` | Recordatorios de partidos de todos los deportes (`private.match_reminders`, `match_reminders_sent`), de rondas de golf, encuentros de natación y noches; push de reclamos · pg_cron `mm-partidos` cada 15 min (solo Supabase) |
| `migrations/20260927001300_liga.sql` | Avisos del admin a su liga (`league_announcements`, `league_announce`, `league_announce_reach`) e `invite_details` (lo que muestra la invitación) |
| `migrations/20260927001400_inscripciones.sql` | «Me apunto» con cupo y lista de espera en noches y torneos de raqueta (`event_signups`, `join_signup`, `leave_signup`, `set_signup`) |
| `migrations/20260927001500_cuenta.sql` | Mayores de 18 (`confirm_adult`), descargar mis datos (`export_my_data`), borrar la cuenta (`prepare_delete_account` + Edge Function `delete-account`) y errores de los teléfonos (`log_client_error`, `admin_client_errors`) |
| `migrations/20260927001190_consola_supabase.sql` | **Solo Supabase**: pg_cron `mm-consola-limpieza` (días vistos → números por día) y la política de Storage para borrar fotos sin cuentas bloqueadas (la prueba `consola.test.ts` corre este archivo en PGlite) |
| `migrations/20260928000200_social.sql` | Seguir cuentas (`follows`), me gusta en partidos, golf y natación (`game_likes`; en el boliche son `reactions`), perfil público, juegos y números por deporte, «Siguiendo» del Home y avisos sociales de la campana. Nada de ligas privadas que no ves ni de ligas con menores |
| `migrations/20260929000100_reclamos.sql` | Reclamos «ese jugador sin cuenta soy yo» (`player_claims`, `request_player_claim`, `cancel_player_claim`, `decide_player_claim`, `player_claim_conflicts`): el dueño o un admin aprueba y los dos jugadores se juntan. `claim_player`, `join_league` (`p_prefer`) y `ensure_my_player` (`p_prefer` o el mismo nombre) ya no vinculan al momento: dejan el pedido. Los menores nunca se reclaman |
| `migrations/20260929000900_legal.sql` | Términos y privacidad con versión y aceptación guardada (`legal_acceptances`, `accept_legal`, el trigger `on_auth_user_legal` del registro, `admin_legal_stats`) y reportes de contenido (`reports`, `report_content`, `resolve_report`, `list_reports`, `my_reports`; push a los superadmins). Ver «Términos, privacidad y reportes» |
| `local/shim.sql` | Para PGlite: roles `anon`/`authenticated`/`service_role`, `auth.users`, `auth.uid()/jwt()/role()`, `storage` mínimo |
| `seed.sql` | Cuentas de desarrollo y el caso de referencia del boliche (con las RPC de verdad) |

**Cargar en PGlite** (backend local y pruebas): `shim.sql`, luego cada archivo de `migrations/` en orden de nombre
**saltando los que terminan en `_supabase.sql`**, y opcionalmente `seed.sql`. Ver `tests/sql/harness.ts`.

**Pruebas**: `pnpm test:sql` (Vitest + PGlite, `tests/sql/*.test.ts`, 119 casos: las 72 de `tests/reglas.test.ts`
una por una, más seguridad, menores, deporte, `op_id`, `league_id`, tiempo real y el seed).

## Cómo actuar como alguien (backend local)

PGlite corre como superusuario (sin RLS). Cada consulta o RPC va en una transacción:

```sql
begin;
set local role authenticated;            -- o anon (sin sesión) o service_role
select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
select public.create_league(p_name => $1, p_visibility => $2) as r;   -- o: select * from public.invite_preview(p_code => $1)
commit;                                  -- rollback si falló
```

Las RPC se llaman con argumentos **por nombre** (como PostgREST). No hay sobrecargas en `public`.

Tipos para que local se vea igual que PostgREST (configurar los `parsers` de PGlite):
- `date` → texto `'YYYY-MM-DD'` (PGlite da un `Date`); `timestamptz` → texto ISO (`new Date(v).toISOString()`).
- `double precision`, `integer`, `smallint`, `bigint` → número. `jsonb` → objeto. `int2[]`/`text[]` → arreglo.
- No se usa `numeric` (PGlite lo devuelve como texto).

## Errores

Toda RPC falla con uno de estos (el `message` del error es el código corto):

| SQLSTATE | message | Significa | `BackendErrorKind` |
|---|---|---|---|
| `42501` | `no_permitido` | No tiene permiso (o no hay sesión). También `permission denied` de Postgres | `permission` |
| `42501` | `bloqueada` | La cuenta está bloqueada por el superadmin: no escribe nada (leer sí). El cliente la muestra como «Tu cuenta está bloqueada. Escríbele al equipo de MatchMate.» (código `bloqueada`) | `permission` |
| `P0001` | `invalido` | Dato que no sirve (nombre vacío, pinos fuera de 0–300, clave de patch desconocida…) | `validation` |
| `P0001` | `no_existe` | La liga, evento, jugador, envío… no existe (o no es de esa liga) | `not_found` |
| `P0001` | `duplicado` | Ya es de otra cuenta (reclamar jugador) o ya lo pidió otra cuenta, op_id de otra cuenta u otra función | `conflict` |
| `P0001` | `conflicto: <qué choca> (n), …` | Aprobar un reclamo: los dos jugadores estuvieron en el mismo evento, partido, ronda, prueba, escalera o inscripción (o en equipos distintos de la temporada). No cambia nada; el admin quita lo repetido y aprueba otra vez | `conflict` |
| `P0001` | `cerrado` | Deporte cerrado | `validation` |
| `P0001` | `rate_limited` | Ritmo (comentario 3 s, sugerencia 60 s) o demasiados códigos malos | `rate_limited` |
| `23514` `23502` `22P02` `22023` `22003` | (texto de Postgres) | CHECK, falta un dato, tipo mal escrito | `validation` |
| `23503` | | FK: el id no existe o es de otra liga | `validation` |
| `23505` | | Único repetido (p. ej. un `p_id` que ya existe) | `conflict` |
| `23001` | | Borrar la cuenta de un dueño (hay que traspasar la liga antes) | `conflict` |
| `42883` | | Argumento que no existe (error de programación) | `unknown` |

Todos son **definitivos** (no se reintentan); en la cola van a «no se pudo enviar».

## Tablas y vista (lo que el cliente puede leer)

«Quién ve»: **liga visible** = liga pública (cualquiera, también sin cuenta), o privada de la que es miembro,
o superadmin. **Admin** = dueño o admin de la liga, o superadmin. Toda tabla que se sincroniza tiene
`updated_at` e índice `(league_id, updated_at)`.

### `sport_status` — todos (también sin cuenta)
`id` text (`bowling`, `padel`, `tennis`, `pickleball`, `basketball`, `football`, `futsal`, `golf`, `swimming`),
`family` (`series`|`racket`|`team`), `status` (`open`|`beta`|`closed`), `sort_order`, `updated_at`.
Hoy solo `bowling` está `open`; los demás `beta` (solo el superadmin crea ligas de ellos).

### `profiles` — con sesión: el propio (el superadmin, todos). Sin cuenta: nunca (tiene el correo)
`id` (= auth.users.id), `email`, `name` (1–60), `is_superadmin`, `adult_confirmed_at`, `firebase_uid`,
`created_at`, `updated_at`. Se crea sola al registrarse (trigger; nombre de `raw_user_meta_data.name`,
o `full_name` de Google, o lo de antes de la @ del correo, recortado a 60; `adult: true` llena
`adult_confirmed_at`). Otros miembros se ven por `league_members.display_name`.
Consola: `last_seen_at` (lo pone `touch_seen`), `blocked_at` y `blocked_reason` (≤ 200; la cuenta ve si está bloqueada).

### `leagues` — liga visible
`id`, `sport` (fijo), `kind` (`liga`|`torneo`), `visibility` (`public`|`private`), `name` (1–60), `owner_id`,
`venue` (≤80), `schedule` (≤80), `season_start` date|null, `season_end` date|null (en la app `''` = null),
`contact_name` (≤60), `contact_phone` (`^[0-9+]{0,20}$`), `require_photo`, `has_minors`,
`tz` (zona IANA, por defecto `America/Santo_Domingo`), `rules` jsonb (reglas del deporte), `created_at`, `updated_at`.
`League.ownerUid` = `owner_id`, `requirePhoto` = `require_photo`, etc.

### `league_secrets` — admins de esa liga
`league_id`, `invite_code` (8 caracteres de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), `updated_at`. = `getInviteCode`.

### `league_members` — con sesión: las propias, las de sus ligas; el superadmin todas
`league_id`, `user_id`, `role` (`owner`|`admin`|`member`), `is_scorer`, `display_name` (nombre al unirse),
`joined_at`, `updated_at`. Clave `(league_id, user_id)`. El jugador de la cuenta NO está aquí.

### `memberships` (vista, `security_invoker`) — igual que `league_members`
`league_id`, `user_id`, `role`, `is_scorer`, `display_name`, `joined_at`, `updated_at`, **`player_id`** (su
jugador en esa liga o null). Es el `Member` de hoy: `{ id: league_id+'_'+user_id, leagueId, uid, name:
display_name, role, playerId: player_id, scorer: is_scorer }`. Úsala para `useMembership`, `useMyMemberships`
y `useLeagueMembers`.

### `players` — liga visible
`id`, `league_id`, `user_id` (cuenta vinculada o null), `name` (1–60), `average_override` (0–300 o null),
`is_minor`, `attrs` jsonb, `created_at`, `updated_at`. `Player.uid` = `user_id`. Un jugador por cuenta y liga.

### `player_private` — admins
`player_id`, `league_id`, `birth_year`, `sex` (`F`|`M`|`X`), `guardian_name`, `consent_by`, `consent_at`, `updated_at`.

### `events` — liga visible
`id`, `league_id`, `type` (boliche: `torneo`|`practica`), `name` (≤80), `date` date, `start_time` time|null,
`games` (1–10), `hcp_base` (0–300), `hcp_percent` (0–100), `individual_rank_by` / `team_rank_by`
(`hcp`|`scratch`|null), `category_cuts` smallint[3]|null, `team_size` (0–20), `announcement` (≤1000),
`player_count` (lo mantiene la base), `config` jsonb, `created_by`, `created_at`, `updated_at`.
El `BowlingEvent` de la app se arma con dos lecturas más: `teams` (→ `event.teams[id] = { name, order: sort_order }`)
y `event_rsvps` (→ `event.rsvp[player_id] = true`).

### `teams` — liga visible
`id`, `league_id`, `event_id`, `name` (1–60), `sort_order`, `color` (`#rrggbb`|null), `created_at`, `updated_at`.

### `event_rsvps` — liga visible
`event_id`, `player_id`, `league_id`, `going` (siempre true hoy: quitar el «voy» borra la fila), `created_at`, `updated_at`.

### `entries` — liga visible
`id`, `league_id`, `event_id`, `player_id`, `team_id`|null, `average` (0–300), `handicap_override`|null,
`scores` smallint[] (null = juego sin anotar), `photos` text[] (id de foto | `importado` | `sin-foto` | null = borrador),
`frames` jsonb|null (`{"<juego>": {"rolls": [...], "masks": [...]}}`), `created_at`, `updated_at`.
Único `(event_id, player_id)`. El id ya no es `evento_jugador`: buscar por `(event_id, player_id)`.

### `submissions` — liga visible (igual que hoy: se ven los envíos del evento)
`id`, `league_id`, `player_id`, `event_id`|null, `date`|null (envío por fecha; al aprobar se llena `event_id`
y la fecha se queda), `scores` smallint[] (1–10), `scanned` smallint[]|null, `scanned_name`|null,
`frames` jsonb|null, `photo_id`|null, `status`, `note`|null, `created_by` (cuenta que lo envió), `created_at`,
`reviewed_at`|null, `reviewed_by`|null, `updated_at`.

### `photos` — liga visible
`id`, `league_id`, `event_id`|null, `path` (= `'<league_id>/<id>.webp'` o `.jpg`), `content_type`
(`image/webp`|`image/jpeg`), `width`, `height`, `bytes` (≤1 MB), `uploaded_by`, `created_at`, `expires_at`,
`purged_at`, `updated_at`. La imagen se ve con `storage.signedUrl('scoreboards', path)`.

### `live_states` — liga visible
`event_id`, `subject_key` (`'p:<player_id>'`), `league_id`, `player_id`, `state` jsonb (boliche:
`{"scores": [190, null, 210]}`), `version` (sube en cada publicación), `updated_by`, `created_at`, `updated_at`.
`LiveScore` = `{ id: event_id+'_'+player_id, eventId, playerId, scores: state.scores }`. Para consultar cada
15–20 s sin gastar egress: `select subject_key, version from live_states where event_id = …` y bajar el
estado solo de lo que cambió.

### `reactions` / `comments` — liga visible
Ambas: `id`, `league_id`, `entry_id`, `event_id`, `player_id` (dueño del juego), `user_id` (autor),
`author_name` (su `display_name`), `created_at`, `updated_at`. `reactions.type` (`like`|`felicitar`), una por
`(entry_id, user_id)`; `comments.text` (1–500). `uid` de hoy = `user_id`, `name` = `author_name`.

### `suggestions` — admins
`id`, `league_id`, `text` (1–1000), `read`, `created_at`, `updated_at`. Sin autor (anónima).

### `push_subscriptions` — con sesión: las propias
`id`, `user_id`, `endpoint`, `p256dh`, `auth`, `ua`, `fail_count`, `created_at`, `updated_at`.

### `tombstones` — liga visible (los de `league_members`: miembros; los de `suggestions`: admins)
`id` bigint, `tbl` (tabla), `row_key`, `league_id`, `deleted_at`. `row_key` = el `id`; en claves dobles:
`event_rsvps` `'<event_id>:<player_id>'`, `league_members` `'<league_id>:<user_id>'`, `live_states`
`'<event_id>:<subject_key>'`. Al borrar una liga solo queda `{tbl:'leagues', row_key: <league_id>}`: purgar todo lo local de esa liga.

### `legal_acceptances` — con sesión: las propias (el superadmin, todas)
`user_id`, `doc` (`terminos`|`privacidad`), `version` (`'YYYY-MM-DD'`), `accepted_at`, `user_agent` (≤ 300, de la
cabecera; null en el registro y en PGlite). Clave `(user_id, doc, version)`. Se borra con la cuenta; sale en
`export_my_data`.

### `reports` — quien reportó (las suyas), el superadmin (todas), admins de la liga (comentarios, avisos y juegos de su liga que no son suyos)
`id`, `target_kind` (`comment`|`league`|`user`|`game`|`announcement`), `target_id`, `league_id` (de lo reportado;
null en una cuenta), `reason` (`spam`|`ofensivo`|`acoso`|`falso`|`menores`|`otro`), `note` (≤ 500), `status`
(`open`|`dismissed`|`actioned`), `created_at`, `handled_at`, `action_note` (≤ 500). `reporter_id`, `handled_by` y
`target_owner_id` (de quién era lo reportado al reportarlo: ese admin no ve el reporte, porque la nota y la hora le
dirían quién fue) existen pero **no se leen directo** (el `GRANT SELECT` es por columnas): un admin de liga no sabe
quién reportó; la lista va por `list_reports`. Uno abierto por cuenta y cosa. No tiene `user_id`: «Descargar mis
datos» trae los de la cuenta con `my_reports`.

### Solo servidor (sin lectura para la app)
`reminders_sent` (`event_id`, `kind` = `'<slot>@<YYYY-MM-DD>'`, p. ej. `'dia-antes@2026-10-03'`: un recordatorio por
evento, turno y fecha, aunque el cron corra otra vez) y `push_outbox` (un mensaje por teléfono: `subscription_id`,
`urgency`, `claimed_at`, `attempts`, `last_status`, `sent_at`). Esquema `private` (no expuesto): `op_log`, `paces`,
`rate_limits`, `storage_purge_queue`, `heartbeat`, `scan_usage`, `scan_days`, `scan_minutes`, `scan_cache`.

**Sincronización por cambios**: `select … where league_id = $1 and updated_at > $cursor` + tombstones desde
el cursor. `updated_at` es la hora de inicio de la transacción: usar como cursor el máximo `updated_at`
recibido **menos ~2 minutos** y hacer merge sin duplicar. Para ver si perdió acceso a una liga (lo sacaron,
se volvió privada o se borró): comparar `select id from leagues` / `select league_id from league_members
where user_id = <yo>` con lo local y purgar lo que ya no está.

## RPC

Formato: `nombre(argumentos) → retorno` · **quién** · errores propios. Todas exigen sesión salvo
`invite_preview`; sin sesión dan `42501`. `p_patch` = objeto solo con las claves que cambian (una clave
desconocida da `invalido`). Las que llevan `p_op_id` son las de la cola sin conexión: reintentar con el
mismo `p_op_id` devuelve lo mismo que la primera vez y no repite nada.

### Cuentas y deportes

| RPC | Quién | Qué hace |
|---|---|---|
| `ensure_profile() → void` | la cuenta | Crea su perfil si el trigger no pudo (idempotente). |
| `rename_profile(p_name text) → void` | la cuenta | Nombre 1–60 (recortado). `invalido`. |
| `set_superadmin(p_user uuid, p_value boolean) → void` | superadmin | `no_existe`. El primero se siembra por SQL. |
| `set_sport_status(p_sport text, p_status text) → void` | superadmin | `open`\|`beta`\|`closed`. `no_existe`. |

### Ligas e invitaciones

| RPC | Quién | Qué hace |
|---|---|---|
| `create_league(p_name, p_visibility='private', p_kind='liga', p_sport='bowling', p_venue='', p_schedule='', p_season_start date=null, p_season_end date=null, p_contact_name='', p_contact_phone='', p_require_photo=false, p_has_minors=false, p_tz='America/Santo_Domingo', p_rules jsonb='{}', p_id uuid=null) → {league_id, player_id, invite_code}` | con sesión (deporte `beta`: superadmin; `closed`: nadie) | En una transacción: liga, membresía de dueño, código y **el jugador del dueño**. `no_permitido` (beta), `cerrado`, `invalido` (deporte o zona). |
| `create_tournament(p_name, p_date date, p_visibility='private', p_sport='bowling', p_venue='', p_contact_name='', p_contact_phone='', p_require_photo=false, p_id=null, p_event_id=null) → {league_id, player_id, invite_code, event_id}` | con sesión | `createTournament`: liga `torneo` + el torneo (3 juegos, 230/80 %, hcp/scratch, cortes 200/175/160, equipos de 3). |
| `update_league(p_league, p_patch jsonb) → void` | admin | Claves: `name, kind, visibility, venue, schedule, season_start, season_end, contact_name, contact_phone, require_photo, has_minors, tz, rules`. `sport` y `owner_id` no. `has_minors`: el admin solo lo sube; bajarlo es del superadmin y sin menores (`invalido`). Con menores: privada y sin foto obligatoria (23514). |
| `delete_league(p_league) → void` | dueño o superadmin | Borra todo (cascada). Deja un tombstone de la liga; los archivos de fotos van a la cola de Storage. `no_existe`. |
| `transfer_ownership(p_league, p_user) → void` | dueño o superadmin | Otro miembro pasa a dueño; el anterior queda admin. `no_existe` si no es miembro. Es el camino para poder borrar la cuenta de un dueño. |
| `renew_invite_code(p_league) → text` | admin | Código nuevo; el anterior deja de servir. |
| `invite_preview(p_code text) → setof {league_id, name, sport, kind, visibility}` | **cualquiera, también sin cuenta** | = `getInvite`. Código malo: ninguna fila. Más de 30 códigos malos por hora (por cuenta o IP): `rate_limited`. Mayúsculas/espacios no importan. Llamar con `select * from`. |
| `join_league(p_league uuid=null, p_code text=null, p_prefer uuid=null) → {league_id, player_id, claim_id} \| null` | con sesión | Pública: sin código. Privada: con su código (o solo `p_code`, desde el link). Ya miembro: igual (idempotente). Deja listo su jugador (ver `ensure_my_player`; `p_prefer` = «¿eres tú?» deja un reclamo; `claim_id` = su reclamo pendiente en la liga, o null). Código malo: **devuelve null** (cuenta el intento). Privada sin código: `no_permitido`. 10 códigos malos por hora: `rate_limited`. |

### Miembros y roles

| RPC | Quién | Qué hace |
|---|---|---|
| `set_member_role(p_league, p_user, p_role) → void` | dueño o superadmin; **un admin consigo mismo a `member`** | `p_role` `admin`\|`member` (`invalido`). Al dueño no se le toca el rol (`no_permitido`). |
| `set_member_scorer(p_league, p_user, p_scorer boolean) → void` | dueño o superadmin | Anotador (en boliche solo vale en torneos sin liga). |
| `step_down_admin(p_league) → void` | un admin | Deja de ser admin (sigue como jugador). |
| `remove_member(p_league, p_user) → void` | uno mismo (salvo el dueño); admin: solo miembros sin permisos (ni admin ni anotador); dueño o superadmin: cualquiera menos el dueño | Su jugador queda sin cuenta y se quitan sus juegos en vivo. `no_existe`. |
| `leave_league(p_league) → void` | miembro (no el dueño) | = `remove_member(p_league, yo)`. |

### Jugadores

| RPC | Quién | Qué hace |
|---|---|---|
| `ensure_my_player(p_league, p_prefer uuid=null) → uuid` | miembro | Su jugador: el que tiene; si no, uno nuevo con su `display_name`. Si eligió un jugador libre (`p_prefer`, no menor, sin otro pedido) o hay un único libre con su mismo nombre normalizado (sin acentos, como `normalizeName`), además deja el **reclamo** de ese jugador (10 por día); un dueño o admin lo toma al momento (y se devuelve ese). Nunca crea dos (bloquea la membresía). Reemplaza `ensurePlayer` y `createOwnPlayer`. |
| `claim_player(p_player) → uuid` | miembro | Igual que `request_player_claim(p_player)`: devuelve el id del **reclamo** (null si el jugador ya era suyo). Antes vinculaba al momento. |
| `request_player_claim(p_player, p_note text=null) → uuid` | miembro de la liga del jugador | «Ese jugador soy yo»: pide un jugador libre de su liga (aunque ya tenga el suyo). Queda `pending` y les llega un push a los admins («<nombre> dice que es <jugador>», a `/l/<liga>/admin?tab=reclamos`). Pedirlo otra vez = el mismo; pedir otro cancela el anterior. Dueño o admin: aprobado al momento. `duplicado` (tiene cuenta o ya lo pidió otra), `invalido` (menor, nota > 300), `no_permitido` (otra liga), `rate_limited` (10 por día). |
| `cancel_player_claim(p_claim) → void` | quien lo pidió | Lo retira (`cancelled`). Ya decidido: `invalido`. Salir de la liga también lo cancela. |
| `decide_player_claim(p_claim, p_approve boolean, p_note text=null) → text` | dueño, admin o superadmin | Aprobar: el jugador queda con la cuenta y todo lo del jugador propio de la cuenta en la liga (juegos con felicitaciones y comentarios, envíos, «voy», en vivo, datos privados, nadador, partidos, plantillas, sanciones, golf, natación, escalera, inscripciones, me gusta y los ids dentro de partidos, eventos y rondas) pasa al reclamado; el propio se borra. Rechazar: queda igual, con la nota. Push a quien pidió. Devuelve el estado (ya decidido: cómo quedó). `conflicto: …` si chocan. |
| `player_claim_conflicts(p_claim) → [{what, label, count}]` | dueño, admin o superadmin | Lo que chocaría al aprobar (vacío = se pueden juntar). |
| `create_player(p_league, p_name, p_average_override double=null, p_is_minor=false, p_guardian_name=null, p_id=null) → uuid` | admin | Jugador sin cuenta. Menor: solo en liga con menores (`invalido`) y guarda el consentimiento (quién y cuándo). |
| `update_player(p_player, p_patch) → void` | admin | Claves: `name, average_override, is_minor, attrs`. |
| `set_player_private(p_player, p_birth_year=null, p_sex=null, p_guardian_name=null) → void` | admin | Datos que solo ven los admins. |
| `delete_player(p_player) → void` | admin | Con sus participaciones, envíos, «voy», en vivo y social (cascada). |
| `link_account_to_player(p_player, p_user) → {removed_old, old_player_id}` | admin | Une la cuenta (miembro) con un jugador libre. Del jugador anterior de la cuenta: envíos pendientes y «voy» pasan al nuevo; si nunca jugó un evento se borra (y pasan todos sus envíos), si jugó queda libre. `duplicado`, `invalido` (menor), `no_existe`. |
| `unlink_account(p_player) → uuid` | admin, o la cuenta de ese jugador | Separa la cuenta y le da su jugador nuevo en el mismo momento (devuelve su id). Quita lo que publicó en vivo a nombre del jugador. `invalido` si no tenía cuenta. Nota: `ensure_my_player` ya no lo vuelve a vincular solo por el nombre (deja un reclamo). Si el admin vincula un jugador con `link_account_to_player`, su reclamo pendiente se cierra solo (aprobado si era de esa cuenta, rechazado si no). |

### Eventos, «voy» y equipos

| RPC | Quién | Qué hace |
|---|---|---|
| `create_event(p_league, p_type, p_date date, p_name='', p_games=3, p_hcp_base=0, p_hcp_percent=0, p_individual_rank_by=null, p_team_rank_by=null, p_category_cuts int[]={200,175,160}, p_team_size=0, p_announcement='', p_start_time time=null, p_config jsonb='{}', p_id=null) → uuid` | admin | Boliche: tipo `torneo`\|`practica`, 1–10 juegos, cortes 0–300. |
| `update_event(p_event, p_patch) → void` | admin | Claves: `type, name, date, start_time, games, hcp_base, hcp_percent, individual_rank_by, team_rank_by, category_cuts, team_size, announcement, config`. |
| `delete_event(p_event) → void` | admin | Con participaciones, envíos, fotos, equipos, «voy», en vivo y social. |
| `add_practice_game(p_event, p_expected int=null, p_op_id=null) → int` | jugador de la liga o admin; solo prácticas | +1 juego (hasta 10: `invalido`). `p_expected` = los juegos que veía el teléfono: si otro ya sumó, no suma otra vez. Devuelve los juegos. Torneo: `no_permitido`. |
| `set_rsvp(p_event, p_going boolean, p_player=null, p_op_id=null) → void` | su jugador; admin para otro | Marca o quita «voy». |
| `add_team(p_event, p_name, p_id=null) → uuid` | admin | Al final del orden. |
| `rename_team(p_team, p_name) → void` | admin | |
| `delete_team(p_team) → void` | admin | Sus integrantes quedan sin equipo. |
| `apply_teams(p_event, p_groups jsonb) → uuid[]` | admin | `p_groups = [{team_id \| null, name, entry_ids: [...]}]` en orden: reutiliza (y renombra) los existentes, crea los que faltan, borra los que sobran, asigna. Devuelve los ids en ese orden. |

### Participaciones y juegos

| RPC | Quién | Qué hace |
|---|---|---|
| `add_entries(p_event, p_players jsonb) → int` | admin | `[{player_id, average}]`, con `scores`/`photos` vacíos del tamaño del evento. Quien ya estaba no se toca. Devuelve cuántos entraron. Jugador de otra liga: 23503. |
| `save_game(p_entry, p_game int, p_score int=null, p_frames jsonb=null, p_op_id=null) → void` | admin; anotador (torneo sin liga) | `saveGame`: juego `p_game` (desde 0). La base decide la marca: `'sin-foto'` si la liga no exige foto, si no `null` (borrador). `p_score` null borra el juego; `p_frames` null quita sus cuadros. |
| `update_entry(p_entry, p_patch) → void` | admin: `team_id, average, handicap_override, scores, photos, frames`; anotador: solo `scores, photos, frames` | El equipo tiene que ser del mismo evento (`invalido`). |
| `update_entries(p_patches jsonb) → void` | como `update_entry` | `[{id, patch}]`, todo o nada. |
| `remove_entry(p_entry) → void` | admin | Con su social (cascada) y lo que anotaba en vivo. |
| `save_verified_games(p_event, p_photo jsonb, p_writes jsonb) → uuid` | admin; anotador si todos ya están inscritos | `p_photo = {id, width, height, bytes, content_type}` (ya subida); `p_writes = [{player_id, average, values: {"<juego>": pinos}}]`. Marca esos juegos con la foto; inscribe a quien falte (solo admin). Devuelve el id de la foto. |

### Fotos

Subir primero el archivo a Storage, bucket `scoreboards`, ruta `'<league_id>/<photo_id>.webp'` (o `.jpg` con
`image/jpeg`), y después llamar la RPC con el mismo `id`. Liga con menores: sin fotos (`no_permitido`).

| RPC | Quién | Qué hace |
|---|---|---|
| `add_photo(p_league, p_id=null, p_event=null, p_width=null, p_height=null, p_bytes=null, p_content_type='image/webp') → {id, path}` | admin, anotador o miembro con jugador | Registra una foto suelta. |
| `delete_old_photos(p_league, p_months int) → text[]` | admin | Borra las filas de más de N meses (los juegos siguen verificados) y devuelve las rutas: quitarlas de Storage (también quedan en la cola de purga). `deleteOldPhotos` devuelve `paths.length`. |

### Envíos

| RPC | Quién | Qué hace |
|---|---|---|
| `submit_games(p_op_id uuid, p_league, p_scores jsonb, p_event=null, p_date date=null, p_scanned jsonb=null, p_frames jsonb=null, p_photo jsonb=null, p_player=null, p_id=null) → uuid` | miembro con jugador (admin: `p_player` de otro) | **`p_op_id` obligatorio.** Evento **o** fecha (`invalido`). `p_scores`: 1–10 enteros 0–300 o null (textos y decimales no). Foto opcional (`{id, width, height, bytes, content_type}`), en la misma transacción. Quita su fila de en vivo. Queda `pendiente`. Devuelve el id (`p_id` si lo generó el teléfono). |
| `set_submission_scan(p_submission, p_scanned jsonb, p_scanned_name text=null) → void` | el jugador: una vez, su envío pendiente con foto; admin: siempre | Lo que leyó la IA (1–10 números válidos) y la fila (≤60). |
| `approve_submission(p_submission, p_values jsonb, p_frames jsonb=null, p_event=null, p_average double=null, p_games int=null) → {entry_id, event_id}` | admin | `p_values = {"<juego del evento>": pinos}`; `p_frames = {"<juego>": frames}` solo con los que dan el mismo total (el teléfono lo mira con `scoreGame`); a los demás juegos aprobados se les quitan los cuadros. Marca con la foto o `'sin-foto'`. Inscribe con `p_average` si no estaba. `p_event` null: el del envío, o **la práctica de esa fecha (la crea con `greatest(3, p_games)` juegos)** — reemplaza `practiceForDate`. Guarda `reviewed_by`. Juego fuera del evento: `invalido`. |
| `reject_submission(p_submission, p_note text=null) → void` | admin | Nota ≤500. Guarda `reviewed_by`. |

### En vivo

| RPC | Quién | Qué hace |
|---|---|---|
| `publish_live(p_event, p_scores jsonb, p_op_id=null) → void` | su jugador (en torneo: solo si está inscrito) | `publishLiveScores`: guarda `{scores}` sin los null del final; si no queda ninguno, lo quita. Hasta 10 de 0–300. La cola manda solo el último (collapse key). |
| `delete_live(p_event, p_player=null) → boolean` | su jugador; admin cualquiera | Si no había nada: `false`, sin error. |

### Social y buzón

| RPC | Quién | Qué hace |
|---|---|---|
| `set_reaction(p_entry, p_type text) → void` | miembro (liga sin menores) | `like`\|`felicitar`; cambiarla la vuelve a avisar (`created_at`); `null` la quita (sin error si no había). |
| `delete_reaction(p_reaction) → boolean` | su autor o admin | `false` si ya no existe. |
| `add_comment(p_entry, p_text, p_id=null) → uuid` | miembro (liga sin menores) | 1–500 (recortado). Uno cada 3 s por cuenta y liga: `rate_limited`. |
| `delete_comment(p_comment) → boolean` | su autor o admin | `false` si ya no existe. No hay editar. |
| `send_suggestion(p_league, p_text) → uuid` | miembro | Anónima (no se guarda el autor). 1–1000. Una por minuto: `rate_limited`. |
| `mark_suggestions_read(p_ids uuid[], p_read boolean=true) → int` | admin de sus ligas | = `markSuggestions`. |
| `delete_suggestion(p_suggestion) → boolean` | admin | |


**Social (perfiles, seguir y me gusta)** — todas con sesión y `require_uid` (una cuenta bloqueada no sigue ni da me
gusta). Una cuenta «se ve» si es la propia, comparte una liga, es miembro de una liga pública o una de las dos sigue
a la otra (el superadmin, todas). De lo que se ve solo sale lo de ligas que quien mira puede leer y **sin menores**.
`follows` directo: cada cuenta lee solo sus filas.

| RPC | Quién | Qué hace |
|---|---|---|
| `follow_user(p_user) → {following, followers}` | con sesión | Idempotente. No a uno mismo (`invalido`), ni a quien no existe (`no_existe`), bloqueado o que no se ve (`no_permitido`). 60 cambios por hora (`rate_limited`). Push «te empezó a seguir» uno por persona y día. |
| `unfollow_user(p_user) → {following, followers}` | con sesión | Idempotente; cuenta en el mismo ritmo. |
| `follow_list(p_user, p_kind 'followers'\|'following', p_limit=30, p_before, p_before_id) → [{id, name, at, isFollowing, followsYou, isMe}]` | con sesión | Vacía si no se ve; solo lista a quien ve quien mira. Hasta 50. |
| `public_profile(p_user) → {id, name, since, sports, followers, following, likesReceived, gamesCount, isFollowing, followsYou, isMe}` | con sesión | `null` si no existe o no se ve. |
| `profile_games(p_user, p_limit=20, p_before, p_before_key, p_sport) → [juego]` · `following_games(p_sport, p_limit, p_before, p_before_key)` | con sesión | Juegos (boliche, partidos, golf, natación) más nuevos primero, con `likes`, `likedByMe` y `detail`. |
| `profile_stats(p_user) → {bowling, matches, golf, swim}` | con sesión | Números por deporte (boliche: solo juegos verificados). |
| `set_game_like(p_kind, p_id, p_liked, p_player=null) → {likes, liked}` | ve la liga (sin menores) | `bowling` = reacción `like`; `match` (con `p_player`: de quién es el juego; hay que haberlo jugado con resultado), `golf`, `swim`. 300 cambios por hora. |
| `social_notices(p_limit=30) → [{kind: 'follow'\|'like', …}]` | con sesión | Lo de los últimos 30 días (los me gusta del boliche llegan por las reacciones de la liga). |

### Términos, privacidad y reportes

`20260929000900_legal.sql` (pruebas: `tests/sql/legal.test.ts`; cliente: `src/lib/legal.ts`,
`src/lib/data/legal.ts`, `src/lib/data/reports.ts`). Las versiones vigentes están en `private.legal_versions()` →
`{terms, privacy}` y en `src/lib/legal.ts` (una prueba revisa que sean iguales). Registro con correo: la metadata
`{legal: {terms, privacy}}` con las versiones vigentes (la casilla «Acepto…») queda guardada al crear la cuenta
(trigger `on_auth_user_legal`, después de `on_auth_user_created`; nunca hace fallar el registro).

| RPC | Quién | Qué hace |
|---|---|---|
| `accept_legal(p_terms, p_privacy) → void` | con sesión (también bloqueada) | Tienen que ser las vigentes (si no, `invalido`). Guarda los dos documentos con el `user-agent` de la cabecera. Idempotente. |
| `admin_legal_stats() → {terms, privacy, accounts, accepted, acceptedTerms, acceptedPrivacy, never, last7d, byVersion}` | superadmin | Cuántas cuentas aceptaron lo vigente, cuántas nunca aceptaron nada y por versión. |
| `report_content(p_kind, p_target, p_reason, p_note=null) → uuid` | con sesión (`require_uid`) | Lo reportado tiene que existir y verse (liga legible; una cuenta: `social_can_see`), si no `no_existe`; lo propio (comentario, aviso, juego de su jugador, liga que es suya, su cuenta): `invalido`. Uno abierto por cuenta y cosa (devuelve el mismo id). 10 nuevos por día (`report:<cuenta>`, `rate_limited`). Push a los superadmins «Nuevo reporte: <motivo>» → `/superadmin/reportes`, tag `reporte:<tipo>:<id>` (lo que no salió de lo mismo se reemplaza). |
| `resolve_report(p_report, p_status 'dismissed'\|'actioned', p_note=null) → void` | superadmin (queda en la auditoría: `resolve_report`); admin de la liga para comentarios, avisos y juegos de su liga que no sean suyos | Solo un reporte abierto: si ya lo cerró alguien (otro admin o el superadmin), `cerrado` y su decisión y su nota se quedan. Cierra también los demás abiertos de lo mismo. `invalido`, `no_existe`, `no_permitido`, `cerrado`. |
| `list_reports(p_status='open', p_league=null, p_kind=null, p_limit=50, p_offset=0) → {rows, total, open, all}` | superadmin (todo); admin de liga (con `p_league`) | `p_status` `open\|closed\|dismissed\|actioned\|all`. Un admin de liga no recibe los de lo suyo. Cada fila con `target` (título, texto, autor, liga, link; null si se borró), `sameTarget` y, solo para el superadmin, `reporterId`/`reporterName`. |
| `my_reports() → [{id, kind, targetId, leagueId, leagueName, reason, note, status, createdAt, handledAt, actionNote}]` | con sesión (`require_uid`) | Los reportes que hizo la cuenta (hasta 5000), sin quién los atendió. La app los junta con `export_my_data` en «Descargar mis datos» (`reports` no tiene `user_id`, así que el export no los encuentra solo). |

### Push

| RPC | Quién | Qué hace |
|---|---|---|
| `upsert_push_subscription(p_endpoint, p_p256dh, p_auth, p_ua='') → uuid` | la cuenta | Solo `https://` de FCM, Apple, Mozilla o `*.notify.windows.com` (23514). El mismo teléfono con otra cuenta pasa a la cuenta nueva. |
| `delete_push_subscription(p_endpoint) → boolean` | la cuenta | Solo las suyas. |

### Servicio (solo `service_role`, la clave secreta: Edge Functions, cron y GitHub Actions)

| RPC | Quién la llama | Qué hace |
|---|---|---|
| `ping() → timestamptz` | keepalive.yml | Escritura real para «mantener despierto» el proyecto gratis. |
| `scan_begin(p_user, p_league, p_event, p_key, p_models=null, p_per_minute=null) → jsonb` | `scan-bowling` | Revisa que la cuenta pueda leer fotos en esa liga, busca `p_key` (sha256 de la foto) en la caché de 24 h y cobra el cupo: `{status:'cached', result, model}`, `{status:'ok', model, left}` o `{status:'limit', reason, retry_after, limit}`. |
| `scan_next_model(p_models, p_per_minute=null) → text` | `scan-bowling` | El siguiente modelo de la cadena con cupo en este minuto (null = ninguno). |
| `scan_finish(p_user, p_key, p_model=null, p_result=null, p_refund=false) → void` | `scan-bowling` | Guarda el resultado en la caché; `p_refund` devuelve el cupo del día si ningún modelo respondió. |
| `claim_push_batch(p_limit=50) → setof (id, endpoint, p256dh, auth, title, body, url, tag, urgency, ttl)` | `send-push` | Toma hasta 100 mensajes (los aparta 3 min y sube `attempts`); `ttl` = lo que le queda al aviso. |
| `finish_push_batch(p_results jsonb) → jsonb` | `send-push` | `[{id, outcome, status}]` con `sent`/`expired` (listo), `gone` (borra el teléfono), `retry` (otra vez en 3 min), `failed` (no se reintenta; 3 seguidos borran el teléfono). Devuelve `{remaining, chained}`; si queda cola pide el siguiente lote con pg_net. |

El cron (`20260926001300_cron_supabase.sql`, solo Supabase) corre `private.cron_reminders()` cada 15 min
(`private.enqueue_due_reminders(now)` + `send-push`), `private.cleanup_old_rows()` a diario y un ping a `send-push`.

## De `data.ts` a la base

| Hoy (Firestore) | Ahora |
|---|---|
| `createLeague` / `createTournament` | `create_league` / `create_tournament` (el jugador del dueño ya viene) |
| `updateLeague` (y el nombre de la invitación) | `update_league` (la invitación lee el nombre de la liga) |
| `deleteLeague` | `delete_league` |
| `renewInviteCode` / `getInviteCode` / `getInvite` | `renew_invite_code` / `select league_secrets` / `invite_preview` |
| `joinLeague(lid, user, code, prefer)` / `joinLeagueClaim` (también `claimId`) | `join_league(p_league, p_code, p_prefer)` |
| `ensurePlayer`, `createOwnPlayer`, `claimPlayer` | `ensure_my_player`, `claim_player` |
| `requestClaim` / `cancelClaim` / `decideClaim` / `fetchClaimConflicts` (`src/lib/data/claims.ts`) | `request_player_claim` / `cancel_player_claim` / `decide_player_claim` / `player_claim_conflicts` |
| `removeMember` / `setMemberRole` / `setMemberScorer` / `setSuperadmin` | `remove_member` (o `leave_league`) / `set_member_role` / `set_member_scorer` / `set_superadmin` |
| `createPlayer` / `updatePlayer` / `deletePlayer` | `create_player` / `update_player` (`averageOverride` → `average_override`) / `delete_player` |
| `linkAccountToPlayer` / `unlinkAccount` | `link_account_to_player` / `unlink_account` |
| `createEvent` / `updateEvent` / `deleteEvent` | `create_event` / `update_event` / `delete_event` |
| `addEventGame(lid, event)` | `add_practice_game(p_event, p_expected: event.games, p_op_id)` |
| `setRsvp` | `set_rsvp` |
| `addEntries` / `updateEntry` / `updateEntries` / `saveGame` / `removeEntry` | `add_entries` / `update_entry` / `update_entries` / `save_game` / `remove_entry` |
| `addTeam` / `renameTeam` / `applyTeams` / `deleteTeam` | `add_team` / `rename_team` / `apply_teams` / `delete_team` |
| `saveVerifiedGames` / `submitGames` | subir a Storage + `save_verified_games` / `submit_games` |
| `setSubmissionScan` / `approveSubmission` + `practiceForDate` / `rejectSubmission` | `set_submission_scan` / `approve_submission` (p_event null = práctica del día) / `reject_submission` |
| `deleteOldPhotos` | `delete_old_photos` + `storage.remove(paths)` |
| `publishLiveScores` | `publish_live` |
| `setReaction` / `addComment` / `deleteComment` | `set_reaction` / `add_comment` / `delete_comment` (y `delete_reaction` para admins) |
| `sendSuggestion` / `markSuggestions` / `deleteSuggestion` | `send_suggestion` / `mark_suggestions_read` / `delete_suggestion` |
| `createProfile` / `renameProfile` / `ensureProfile` (auth.tsx) | trigger en `auth.users` (pasar `name` en la metadata del registro) / `rename_profile` / `ensure_profile` |
| `subscribePush` / `unsubscribePush` (push.ts) | `upsert_push_subscription` / `delete_push_subscription` |

## Tiempo real

Los triggers llaman `private.emit(topic, event, payload)`: en Supabase, `realtime.send` a un **canal privado**
(`supabase.channel(topic, { config: { private: true } })`, antes `await supabase.realtime.setAuth()`); en
PGlite, `NOTIFY` en el canal `mm` con `{"topic", "event", "payload"}` (`pg.listen('mm', …)`).

| Tema | Evento | Payload | Cuándo |
|---|---|---|---|
| `event:<id>` | `live` | `{k, player_id, s: state, v: version, at}` o `{k, player_id, deleted: true}` | cada cambio de `live_states` (estado completo) |
| `event:<id>` | `entries` | `{op, ids}` | participaciones del evento (una vez por sentencia) |
| `event:<id>` | `submissions` | `{op, ids}` | envíos del evento |
| `event:<id>` | `rsvps` | `{op, player_ids}` | «voy» |
| `league:<id>` | `events` | `{op, ids}` | eventos de la liga (no cuando solo cambia `player_count`) |
| `league:<id>` | `submissions` | `{op, ids}` | envíos de la liga (aprobaciones) |
| `user:<uid>` | `submission` | `{id, status}` | su envío fue aprobado o rechazado |
| `user:<uid>` | `follow` | `{op, user}` | alguien lo empezó a seguir o lo dejó de seguir |
| `user:<uid>` | `like` | `{op, kind, id}` | me gusta (o quitarlo) en un juego suyo |
| `league:<id>` | `claims` | `{id, status}` | reclamos de jugadores de la liga (pedido, aprobado, rechazado, cancelado) |
| `user:<uid>` | `claims` | `{id, status, league_id}` | su reclamo cambió |

`op` = `insert` \| `update` \| `delete`. Salvo `live`, el mensaje solo dice qué cambió: volver a leer esas filas.
Quién escucha (Supabase, `realtime.messages`): `event:`/`league:` quien ve la liga; `user:<uid>` solo esa
cuenta. Nadie puede enviar (no hay política de INSERT). Borrar una liga no manda avisos.

## Storage (solo Supabase)

Bucket privado `scoreboards`, 1 MB, `image/webp` o `image/jpeg`. Leer: quien ve la liga. Subir: admin,
anotador o miembro con jugador en una liga sin menores (`private.can_upload_photo_path`). Borrar: admins
de la liga. Sin actualizar. En local, `BackendStorage` guarda el archivo por su cuenta; `photos.path` es la clave.

## Consola del superadmin

`20260927001100_consola.sql` (pruebas: `tests/sql/consola.test.ts`; cliente: `src/lib/data/admin.ts`). La
administración de cada liga (dueño + admins de esa liga) no cambia: esto es de toda la app y solo para el
superadmin (`profiles.is_superadmin`). Las lecturas devuelven `jsonb` en camelCase (los tipos de `admin.ts`), con
horas en texto ISO (`'2026-09-27T16:03:11.123Z'`) y días `'YYYY-MM-DD'` en hora de RD (`private.console_tz()`).
Páginas: `p_limit` 1–100 (se corrige), `p_offset` ≥ 0, orden estable, `{rows, total}`.

**Bloqueo.** `private.require_uid()` (la usan todas las RPC que escriben; una prueba lo revisa) falla con
`bloqueada` (42501) si `profiles.blocked_at` no es null. Leer sigue igual (RLS). Tampoco borra archivos de fotos
(`mm_scoreboards_delete` usa `private.photo_admin_leagues()`: las de `admin_leagues`, ninguna si está bloqueada), ni sube fotos a Storage
(`can_upload_photo`) ni gasta lecturas con IA (`can_scan`). `sync_ladder` (se llama al abrir la escalera) y
`touch_seen` no la exigen. Un superadmin nunca está bloqueado (nombrarlo superadmin lo desbloquea); nadie se
bloquea a sí mismo. Bloquear no borra nada.

**Auditoría.** `public.admin_audit` (`id`, `at`, `actor_id`, `action`, `target_type` `user|league|sport|app`,
`target_id`, `detail` jsonb): la lee solo el superadmin; nadie escribe directo (`private.audit`). Acciones:
`set_superadmin` {value, before, name, email, unblocked?}, `set_sport_status` {from, to}, `block_user`
{name, email, reason, already}, `unblock_user` {name, email, wasBlocked, reason}, `announce` {title, body, url,
audience, recipients}, y cuando un superadmin actúa sobre una liga que no es suya: `delete_league` {name, sport,
kind, ownerId, ownerName, members, players, events} y `transfer_league` {name, sport, from, to, fromName, toName}.

| RPC | Quién | Qué hace |
|---|---|---|
| `touch_seen() → void` | cualquier cuenta (también bloqueada) | `last_seen_at` = ahora si está vacío o tiene más de 6 h; agrega el día a `private.daily_seen` (una fila por cuenta y día; la limpieza diaria pasa los días de hace más de 35 a `private.daily_active`, un número por día, y guarda 400 días). Nunca falla. La app la llama una vez al día por teléfono (`mm:visto:<uid>`). |
| `admin_overview() → AdminOverview` | superadmin | Cuentas (nuevas, activas por `last_seen_at`, superadmins, bloqueadas, sin confirmar), ligas (por deporte, activas = algo cambió en 7 días), actividad de 7 días, tamaño de la base y de las fotos (null si no se sabe), lecturas de hoy y topes (900/40), push. |
| `admin_series(p_days=30) → AdminSeriesPoint[]` | superadmin | Un día por fila (1–366), con ceros: registros, activos (`daily_seen`), eventos, partidos y juegos creados, lecturas (`scan_days`, día de Google). |
| `admin_users(p_search, p_filter='all', p_limit=50, p_offset=0) → {rows: AdminUser[], total}` | superadmin | Más nuevas primero. Busca en nombre y correo (sin comodines) o por id. Filtro `all\|super\|blocked\|unconfirmed\|inactive` (30 días sin abrir o nunca); otro: `invalido`. |
| `admin_user(p_user) → AdminUserDetail \| null` | superadmin | Con sus ligas (hasta 200), teléfonos, lecturas de hoy y si marcó mayor de edad. |
| `admin_leagues(p_search, p_sport, p_kind, p_visibility, p_sort='activity', p_limit=50, p_offset=0) → {rows: AdminLeague[], total}` | superadmin | Busca en nombre de la liga, nombre o correo del dueño, o id. `p_sort` `activity\|name\|created\|members`. `lastActivityAt` = lo último cambiado en eventos, juegos, partidos, envíos, golf o natación. |
| `admin_audit_log(p_action=null, p_limit=50, p_offset=0) → {rows: AdminAuditEntry[], total}` | superadmin | Lo más nuevo primero, con el nombre de quién lo hizo. |
| `admin_system() → AdminSystem` | superadmin | Migraciones (`supabase_migrations`), último `ping`, tareas de pg_cron con su última corrida, cola de push, deportes con sus ligas. Lo que no existe (PGlite) sale null. |
| `admin_scan_stats(p_days=30) → AdminScanStats` | superadmin | Lecturas por día (1–90), por modelo (`scan_minutes`, 3 días) y las 10 cuentas que más leen (`scan_usage`, 7 días). |
| `admin_block_user(p_user, p_reason=null) → void` | superadmin | Motivo ≤ 200. `invalido` (a sí mismo o motivo largo), `no_permitido` (superadmin), `no_existe`. Otra vez: cambia el motivo, no la hora. |
| `admin_unblock_user(p_user) → void` | superadmin | `no_existe`. |
| `admin_count_recipients(p_audience jsonb) → int` | superadmin | Cuántas cuentas recibirían el anuncio. |
| `admin_announce(p_title, p_body, p_url='/', p_audience='{"kind":"all"}') → int` | superadmin | Título 1–60, texto 1–180, ruta de la app (empieza con una sola `/`, sin espacios ni `\`, ≤ 200). Público `{kind: 'all'}`, `{kind: 'sport', sport}`, `{kind: 'league', leagueId}` o `{kind: 'admins'}` (dueños y admins de cualquier liga). Reciben las cuentas **sin bloquear y con avisos activados** en algún teléfono: una fila de `push_outbox` por cuenta (el trigger la reparte a sus teléfonos, ttl 24 h, tag `anuncio:<ms>`) y llama a send-push. Máximo 5 por hora entre todos los superadmins: `rate_limited`. Devuelve cuántas cuentas. |

Traspasar y borrar ligas de cualquiera: `transfer_ownership` y `delete_league` de siempre (el superadmin ya podía).
Deportes: `set_sport_status`. Índices nuevos: `profiles` por fecha de registro, visto, bloqueadas y superadmins;
`created_at` de `events`, `entries`, `matches`, `submissions` y `photos`; envíos pendientes.

**Ojo al cambiar migraciones viejas:** esta redefine (create or replace, mismos permisos) `private.require_uid`,
`private.can_upload_photo`, `private.can_scan`, `public.sync_ladder`, `set_superadmin`, `set_sport_status`,
`delete_league` y `transfer_ownership`. Un cambio a esas funciones en su archivo original queda tapado por esta:
hay que hacerlo aquí (o en una migración nueva después).

## Seguridad (lo que prueban `tests/sql/seguridad.test.ts` y `nuevas.test.ts`)

- RLS en todas las tablas de `public`; la vista con `security_invoker`.
- Primera migración: `alter default privileges` quita EXECUTE a PUBLIC y todo a anon/authenticated; al final de
  `…_rpc.sql` se quitan otra vez en todas las funciones de `public` y `private` y se dan explícitos
  (lista `v_authenticated`, `v_anon`). Una fase nueva agrega sus RPC a su propia lista de GRANT.
- Solo `public.invite_preview` y `private.readable_leagues` son security definer ejecutables por `anon`.
- Nadie tiene INSERT/UPDATE/DELETE en ninguna tabla; `profiles` sin UPDATE directo (más estricto que permisos por
  columna) y un trigger impide que una sesión de usuario cambie `is_superadmin`, `email` o `firebase_uid`.
- `league_id` de las tablas hijas verificado con FK compuestas; `photos.path` atado a su liga e id.
- Deporte fijo (trigger); dueño solo por `transfer_ownership` (trigger); `leagues.owner_id` ON DELETE RESTRICT.
- Menores: `is_minor` exige `has_minors` (trigger), sin cuenta (CHECK), liga privada sin foto obligatoria (CHECK),
  sin social ni fotos (RPC), `has_minors` solo sube (salvo superadmin y sin menores).
- Supabase Security Advisor: puede marcar «security definer function executable by authenticated» en las RPC:
  es a propósito (todas validan permisos adentro).

## Pendiente para otras fases

- Hecho en 0C: cron de recordatorios y limpieza, cupos de lectura de fotos (`scan_*`), cola de push y las Edge
  Functions `scan-bowling` y `send-push`. `max_rows` = 500 en `config.toml`.
- Cada deporte trae su migración (partidos, `match_*`, `swim_*`, equipos de temporada) y agrega su caso a
  `private.series_ok`, `private.check_event` y `private.check_live`.
