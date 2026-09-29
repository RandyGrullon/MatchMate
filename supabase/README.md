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
| `migrations/20260929000200_invitaciones.sql` | `@usuario` de cada cuenta (`profiles.username`, `set_username`, `username_status`), buscar personas (`search_people`) e invitaciones a una liga (`league_invites`, `invite_to_league`, `respond_league_invite`, `cancel_league_invite`, `my_league_invites`, `league_invite_details`). Redefine `private.social_can_see` (con sesión se ve cualquier cuenta sin bloquear; sus juegos siguen filtrados por liga), `public_profile` y `follow_list` (con `username`) |
| `migrations/20260929000500_avisos_telefono.sql` · `000510_avisos_telefono_supabase.sql` | Avisos al teléfono (ver «Avisos al teléfono»): preferencias (`profiles.push_prefs`, `set_push_prefs`, filtro `push_outbox_prefs`), `private.queue_push`, push de envíos aprobados o rechazados, felicitaciones, me gusta, comentarios y resultado confirmado; recordatorios de después del juego y de partidos sin resultado; el «¿Vas?» ya no le llega a quien marcó «voy» (redefine `private.enqueue_due_reminders`); cola de fotos por borrar y archivos huérfanos (`purge_queue_take`, `purge_queue_done`, `storage_orphans` para la Edge Function `purge-photos`); espacio del plan gratis y su alerta (`admin_storage_usage`) · pg_cron `mm-despues-del-juego`, `mm-partidos-sin-resultado`, `mm-limpiar-fotos`, `mm-alerta-espacio` (solo Supabase) |
| `migrations/20260929000600_organizador.sql` | Organizador (ver «Organizador»): ligas públicas vivas y más activas primero (`public_leagues_feed`, también sin cuenta) y tope de 5 ligas o torneos por día y 20 cada 30 días por cuenta (trigger `leagues_quota`); pendientes del admin (`league_pending`); juntar jugadores repetidos (`merge_league_players`, `merge_league_players_preview`); menores con tutor, teléfono y permiso en todos los deportes (`create_player` con `p_guardian_phone` y `p_consent`, `set_player_minor`, `player_private.guardian_phone`); suspender un día (`suspend_day_preview`, `suspend_day`); pistas del boliche (`event_lanes`, `assign_lanes`, `set_player_lane`, `clear_lanes`, `publish_lanes`) |
| `migrations/20260929000700_temporadas.sql` | Temporadas con historia y campeones (`seasons`, `season_awards`, `teams.season_id`, `close_season`, `start_season`, `league_seasons`, `league_champions`), playoffs con series al mejor de 1/3/5/7 (`playoffs`, `playoff_series`, `matches.series_id`, `create_playoffs`, `delete_playoffs`, `sync_playoffs`), lo que el boliche necesita para marcar récords (`bowling_game_context`) y «¿Dónde juego esta semana?» (`public_agenda`, también sin cuenta). Redefine `private.check_free_players`, `private.claim_conflicts` y `private.merge_players` (la de `000600`, con las pistas, y además premios y tablas guardadas por temporada), `league_announce` / `league_announce_reach` (el aviso automático de fin de temporada, `league_announcements.automatic`, no cuenta para el tope diario) y `private.push_category` (`temporada:` en `liga`, «Tus ligas») |
| `migrations/20260929000900_legal.sql` | Términos y privacidad con versión y aceptación guardada (`legal_acceptances`, `accept_legal`, el trigger `on_auth_user_legal` del registro, `admin_legal_stats`) y reportes de contenido (`reports`, `report_content`, `resolve_report`, `list_reports`, `my_reports`; push a los superadmins). Ver «Términos, privacidad y reportes» |
| `migrations/20260929001000_sueltos_logos.sql` | Todos los deportes `open`. Juegos sueltos del boliche (`solo_sessions`, `solo_likes`, `save_solo_session`, `delete_solo_session`, `solo_sessions_of`; los compartidos salen en lo social como kind `solo`). Logo de la liga (`leagues.logo_path`, `begin_logo_upload` (la reserva de cada subida, `private.logo_uploads`), `set_league_logo`, `private.can_upload_logo_path`, `private.can_remove_logo_path`, lo que ya no se usa a `storage_purge_queue` con su `bucket`, que `purge-photos` vacía bucket por bucket: `purge_queue_take` y `purge_queue_done` con `p_bucket`; `logoPath` en `invite_details`, `my_league_invites`, `league_invite_details` y la consola; `invite_preview` con `logo_path`). Redefine `private.social_items`, `social_likes`, `social_games`, `forget_user`, `admin_league_row`, `public_profile`, `profile_stats`, `set_game_like`, `social_notices`, `invite_details`, `my_league_invites`, `league_invite_details`, `invite_preview`, `private.photo_unqueue_purge`, `purge_queue_take` y `purge_queue_done` (de `000500`: ahora por bucket), y `public_leagues_feed` (`000600`) y `public_agenda` (`000700`) con `logoPath`. Corre después de `000500`–`000900` |
| `migrations/20260929001010_logos_supabase.sql` | **Solo Supabase**: bucket público `logos` y sus políticas (la prueba `logos.test.ts` corre este archivo en PGlite) |
| `migrations/20260929001100_insignias.sql` | Insignias automáticas, los datos (ver `docs/insignias.md`): `badge_awards`, `badge_progress`, `badge_stats`, `leagues.badges_auto` (una liga con menores nace «sin títulos»), `profiles.featured_badges`, su RLS y las RPC `profile_badges`, `set_featured_badges`, `set_badge_hidden`, `mark_badges_seen`, `set_badges_auto`, `review_badge` (aval) y `super_revoke_badge`. Envuelve `private.merge_players` (la que haya pasa a ser `private.merge_players_base`; la nueva junta antes las insignias de los dos jugadores) y redefine `export_my_data` (las insignias de sus jugadores y `badgesAuto`; de `league_badge_awards`, solo las vigentes y sin quién la dio ni por qué se retiró). El motor que las da va en `…001110_insignias_motor.sql`. Las de insignias corren después de `001010` (las de las entregas 1 a 5) |
| `migrations/20260929001110_insignias_motor.sql` | Insignias, el motor (ver «Motor de insignias»): la cola `private.badge_queue` y los triggers que la llenan (resultados de todos los deportes, vínculos, cierre del mes de cajas), la foto de datos de cada trabajo (`badge_snapshot`, con la actividad válida y las ligas reales en SQL), aplicar las decisiones (`badge_apply`), el push agrupado con horas tranquilas, la tarea diaria (`badges_daily`), la rareza (`badge_stats_refresh`), `kick_badges`/`cron_badges` y las RPC `badge_notices`, `badges_backfill`, `admin_badges_engine` y `admin_badge_jobs` (más seis solo de `service_role` para la Edge Function `insignias`). Redefine `private.badge_signal`, `update_entry` (la de `000500`: una marca que valida un juego tiene que ser una foto de la liga; `importado` solo el importador) y `private.push_category` (la de `000700` más `insignias` e `insignia:` en `social`; `insignia-aval:` sale siempre) |
| `migrations/20260929001120_insignias_creador.sql` | Insignias de la liga, el creador (ver «Insignias de la liga (creador)» en RPC): `leagues.badge_makers`, `league_members.badge_maker`, `league_badges` (diseños), `league_badge_awards` (otorgamientos), el filtro de texto (`private.badge_text_ok` con `private.blocked_terms`), los reportes (`private.badge_reports`), su RLS y 16 RPC. Redefine `private.merge_badges` (también las de liga), `profile_badges` y `badge_notices` (+ las del creador), `remove_member` (un admin no saca a quien diseña insignias) y la vista `memberships` (+ `badge_maker`) |
| `migrations/20260929001180_insignias_temporadas.sql` | Insignias de temporada: solo hace algo si existe `public.seasons` (`…000700_temporadas.sql`, que corre antes: siempre se aplica): redefine `private.badge_season_rows` (temporadas y premios para la foto) y encola `temporada` cuando una temporada queda `closed` |
| `migrations/20260929001190_insignias_cron_supabase.sql` | **Solo Supabase**: pg_cron `mm-insignias` cada 10 min (`private.cron_badges()`: avisos y, si hay cola, la Edge Function `insignias` con pg_net) y `mm-insignias-diario` a las 04:30 UTC (`private.badges_daily(now())`). Quita las dos por nombre antes de programarlas (`tests/sql/insignias-funcion.test.ts` lo corre contra un pg_cron de mentira) |
| `migrations/20260929001200_premios_torneo.sql` | Premios del torneo (ver «Premios del torneo» en RPC y `docs/premios-torneo.md`): `tournament_prizes` (una premiación por competencia: evento, torneo de golf o playoff) y `tournament_prize_slots` (la insignia de cada lugar del podio), `league_badge_awards.prize_slot_id` y `prize_verified` con el índice único `league_badge_awards_once` también por lugar premiado, su RLS, tombstones y tiempo real, y 4 RPC (`set_tournament_prizes`, `tournament_podium`, `deliver_tournament_prizes`, `close_tournament_prizes`). El servidor calcula el podio del boliche (equipos por scratch, individual con handicap: la regla efectiva del evento, como `src/lib/stats.ts`), de los cuadros de raqueta, del torneo relámpago y de los playoffs. Redefine `award_league_badge` (sus cupos y topes no cuentan los premios), `private.merge_badges` (dos premios de lugares distintos se quedan los dos), `private.badge_link_guard` (no retira un premio con el orden verificado), `revoke_league_badge_award` (un premio cerrado solo lo quita el dueño) y `create_event` (un torneo nuevo del boliche nace con `individual_rank_by = 'hcp'` y `team_rank_by = 'scratch'`) |
| `migrations/20260929001300_insignias_perfil.sql` | Insignias en el perfil (ver «Insignias en el perfil» en RPC): las destacadas (`profiles.featured_badges`) pueden ser también de la liga (del creador o premios del torneo), un premio del torneo con el orden verificado (`prize_verified`) de una competencia que jugaron 2+ cuentas (`league_badge_awards.prize_accounts`, columna nueva sin grant que cuenta el trigger `league_badge_awards_accounts` con `private.prize_accounts` al entregar; los ya entregados se cuentan en la migración) sale en el perfil de otra cuenta con solo `social_league_ok` (aunque la liga sea pequeña o nueva), y cada `LeagueBadgeAward` trae `prizeSlotId` y `prize` (lugar, título y competencia). Ayudas `private.league_award_public` y `private.league_award_prize`; triggers `league_badge_awards_unfeature` y `league_badges_unfeature` (ocultar, retirar o esconder el diseño la saca de las destacadas). Redefine `profile_badges` (la de `001120`: + `featuredLeague`, `hasChosen`, `onProfile`), `set_featured_badges` (la de `001100`) y `private.league_award_json` (la de `001120`) |
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
| `P0001` | `duplicado` | Ya es de otra cuenta (reclamar jugador, `@usuario`) o ya lo pidió otra cuenta, op_id de otra cuenta u otra función | `conflict` |
| `P0001` | `reservado` | Ese `@usuario` no se puede usar (`set_username`: `admin`, `soporte`, `matchmate`…) | `validation` |
| `P0001` | `conflicto: <qué choca> (n), …` | Aprobar un reclamo o juntar dos jugadores (`merge_league_players`): los dos jugadores estuvieron en el mismo evento, partido, ronda, prueba, escalera o inscripción (o en equipos distintos de la temporada). No cambia nada; el admin quita lo repetido y aprueba otra vez | `conflict` |
| `P0001` | `cerrado` | Deporte cerrado | `validation` |
| `P0001` | `rate_limited` | Ritmo (comentario 3 s, sugerencia 60 s), demasiados códigos malos, más de 5 ligas o torneos nuevos por día (20 cada 30 días) o demasiados avisos | `rate_limited` |
| `P0001` | `texto_bloqueado` · `a_si_mismo` · `cupo_lleno` · `ya_dada` · `no_activa` · `limite: activas` · `limite: total` · `limite: jugador` · `limite: liga` | Insignias de la liga (ver «Insignias de la liga (creador)») | `validation` |
| `P0001` | `ya_entregado` · `sin_resultado` · `podio_cambio` | Premios del torneo (ver «Premios del torneo»); `cerrado` también: premios cerrados o con más de 14 días, solo el dueño corrige | `validation` |
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
Desde `20260929001000_sueltos_logos.sql` todos están `open`. El superadmin puede poner uno en `beta` (solo él crea
ligas de ese deporte) o `closed` (nadie) con `set_sport_status`.

### `profiles` — con sesión: el propio (el superadmin, todos). Sin cuenta: nunca (tiene el correo)
`id` (= auth.users.id), `email`, `name` (1–60), `is_superadmin`, `adult_confirmed_at`, `firebase_uid`,
`created_at`, `updated_at`. Se crea sola al registrarse (trigger; nombre de `raw_user_meta_data.name`,
o `full_name` de Google, o lo de antes de la @ del correo, recortado a 60; `adult: true` llena
`adult_confirmed_at`). Otros miembros se ven por `league_members.display_name`.
Consola: `last_seen_at` (lo pone `touch_seen`), `blocked_at` y `blocked_reason` (≤ 200; la cuenta ve si está bloqueada).
**`username`** (el `@usuario`, obligatorio y único): 3–20 letras minúsculas, números, `_` y `.` (el punto no va al
principio ni al final, ni dos seguidos: `^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$` sin `..`). Se pone solo al crear el
perfil (trigger `profiles_username`): el nombre sin acentos ni símbolos (`ñ` → `n`, hasta 15); si no llega a 3,
`jugador` (nunca del correo: el `@usuario` lo ve cualquiera con sesión). Si ya está tomado o es reservado (`admin`, `soporte`,
`matchmate`, `buscar`, `invitacion`…: `private.username_reserved`), con 4 números al final. Se cambia con
`set_username` (5 cambios por día, contados con candado: `private.rate_take`). De otras cuentas sale en `public_profile`, `follow_list`, `search_people` y las
invitaciones.
Avisos: `push_prefs` jsonb (`{}` por defecto) con `resultados`, `social`, `recordatorios` y `liga` en `true`/`false`: la que
falta está activa. Se cambia con `set_push_prefs` (la app la lee con el perfil: `select …, username, push_prefs`).
Insignias: `featured_badges` uuid[] (hasta 3 ids de `badge_awards` o de `league_badge_awards` (…1300), en orden; se
cambia con `set_featured_badges`; los demás las ven por `profile_badges`).

### `leagues` — liga visible
`id`, `sport` (fijo), `kind` (`liga`|`torneo`), `visibility` (`public`|`private`), `name` (1–60), `owner_id`,
`venue` (≤80), `schedule` (≤80), `season_start` date|null, `season_end` date|null (en la app `''` = null),
`contact_name` (≤60), `contact_phone` (`^[0-9+]{0,20}$`), `require_photo`, `has_minors`,
`tz` (zona IANA, por defecto `America/Santo_Domingo`), `rules` jsonb (reglas del deporte), `created_at`, `updated_at`,
`logo_path` (null o `'<id de la liga>/<uuid>.webp|.jpg|.png'` en el bucket público `logos`; CHECK: solo rutas de su
propia liga; se cambia con `set_league_logo`), `badges_auto` (`todas`|`sin_titulos`|`ninguna`: insignias automáticas
de la liga; con menores nace o pasa a `sin_titulos`; lo cambia el dueño con `set_badges_auto`), `badge_makers`
(`owner`|`admins`|`chosen`, por defecto `admins`: quién diseña y da insignias de la liga; lo cambia el dueño con
`set_badge_policy`).
`League.ownerUid` = `owner_id`, `requirePhoto` = `require_photo`, `logoPath` = `logo_path`, etc.

### `league_secrets` — admins de esa liga
`league_id`, `invite_code` (8 caracteres de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), `updated_at`. = `getInviteCode`.

### `league_members` — con sesión: las propias, las de sus ligas; el superadmin todas
`league_id`, `user_id`, `role` (`owner`|`admin`|`member`), `is_scorer`, `display_name` (nombre al unirse),
`joined_at`, `updated_at`, `badge_maker` («Diseña insignias»: vale con `leagues.badge_makers = 'chosen'`; lo cambia
el dueño con `set_member_badge_maker`). Clave `(league_id, user_id)`. El jugador de la cuenta NO está aquí.

### `memberships` (vista, `security_invoker`) — igual que `league_members`
`league_id`, `user_id`, `role`, `is_scorer`, `display_name`, `joined_at`, `updated_at`, **`player_id`** (su
jugador en esa liga o null), `badge_maker`. Es el `Member` de hoy: `{ id: league_id+'_'+user_id, leagueId, uid, name:
display_name, role, playerId: player_id, scorer: is_scorer }`. Úsala para `useMembership`, `useMyMemberships`
y `useLeagueMembers`. Quién diseña y da insignias en una liga (`can_badges`): el dueño; con `badge_makers = 'admins'`,
también los `admin`; con `'chosen'`, también los que tienen `badge_maker` (sean admin o no); el superadmin siempre.

### `players` — liga visible
`id`, `league_id`, `user_id` (cuenta vinculada o null), `name` (1–60), `average_override` (0–300 o null),
`is_minor`, `attrs` jsonb, `created_at`, `updated_at`. `Player.uid` = `user_id`. Un jugador por cuenta y liga.

### `player_private` — admins
`player_id`, `league_id`, `birth_year`, `sex` (`F`|`M`|`X`), `guardian_name`, `guardian_phone` (dígitos y `+`, ≤ 20),
`consent_by`, `consent_at`, `updated_at`.

### `events` — liga visible
`id`, `league_id`, `type` (boliche: `torneo`|`practica`), `name` (≤80), `date` date, `start_time` time|null,
`games` (1–10), `hcp_base` (0–300), `hcp_percent` (0–100), `individual_rank_by` / `team_rank_by`
(`hcp`|`scratch`|null), `category_cuts` smallint[3]|null, `team_size` (0–20), `announcement` (≤1000),
`player_count` (lo mantiene la base), `config` jsonb, `created_by`, `created_at`, `updated_at`.
El `BowlingEvent` de la app se arma con dos lecturas más: `teams` (→ `event.teams[id] = { name, order: sort_order }`)
y `event_rsvps` (→ `event.rsvp[player_id] = true`).

### `teams` — liga visible
`id`, `league_id`, `event_id`, `name` (1–60), `sort_order`, `color` (`#rrggbb`|null), `season_id`|null, `created_at`,
`updated_at`. `season_id`: temporada de un equipo de temporada (`event_id` null) de una liga de equipos (baloncesto,
fútbol, sala); se llena sola al crearlo (la activa, o la última). Las parejas de raqueta y los equipos del boliche: null.

### `event_rsvps` — liga visible
`event_id`, `player_id`, `league_id`, `going` (siempre true hoy: quitar el «voy» borra la fila), `created_at`, `updated_at`.

### `event_lanes` — liga visible (pistas del boliche)
`event_id`, `player_id`, `league_id`, `lane` (1–999), `position` (1 = tira primero), `published_at`|null (último aviso;
null = cambió sin avisar), `created_at`, `updated_at`. Una fila por jugador con pista en el evento. Se escribe con
`assign_lanes`, `set_player_lane`, `clear_lanes` y `publish_lanes`.

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
`event_rsvps` y `event_lanes` `'<event_id>:<player_id>'`, `league_members` `'<league_id>:<user_id>'`, `live_states`
`'<event_id>:<subject_key>'`. Al borrar una liga solo queda `{tbl:'leagues', row_key: <league_id>}`: purgar todo lo local de esa liga.
`badge_awards` deja tombstone solo si es de una liga (`league_id` no null: las fusiones de jugadores).
`league_badges` y `league_badge_awards` dejan tombstone al borrarse (un diseño que nunca se dio, o en cascada al
borrar el jugador). `tournament_prizes` y `tournament_prize_slots` también (quitar los premios, o en cascada al borrar
el evento, el torneo de golf, el playoff o el diseño que nunca se dio).

### `badge_awards` — las propias; de la liga visible, provisionales o firmes y no ocultas (admins: también ocultas); superadmin todas
Insignias automáticas otorgadas (las escribe el motor). `id`, `badge_key` (`^[a-z][a-z0-9_]{1,39}$`, del catálogo
`src/badges/catalog.ts`), `sport` (`all` o un deporte), `level` (0 único, 1 bronce … 5 diamante), `period_key`
(`-`, `e:<evento>`, `g:<participación>:<juego>`, `2026-10`, `s:<temporada>`…), `player_id` + `league_id` (ámbito
liga, o copia de respaldo de un jugador sin cuenta) **o** `user_id` (ámbito cuenta, `league_id` null), `holder`
(= `coalesce(player_id, user_id)`), `status` (`provisional`|`firme`|`en_revision`|`revocada`), `awarded_at`,
`firm_at`, `refs` text[] (`'entry:<id>:<juego>'`, `'match:<id>'`, `'card:<id>'`), `context` jsonb (evidencia, < 4 KB),
`hidden`, `seen_at`, `notified_at`, `revoked_at`, `revoke_reason` (`evidencia`|`aval`|`fraude`), `revoked_by`,
`updated_at`. Única por `(holder, badge_key, sport, level, period_key)`. «Las propias» = `user_id` = yo o `player_id`
de un jugador mío, en cualquier estado. Las de cuenta de otra persona solo salen por `profile_badges`. Ligas con
menores: solo sus miembros (son privadas). Sincroniza por `(league_id, updated_at)`.

### `badge_progress` — solo su dueño
`player_id` + `league_id` o `user_id`, `holder`, `badge_key`, `sport`, `value`, `target` (double), `next_level`
(0–5; 0 = única con meta, como «Arranque con todo»), `updated_at`. Clave `(holder, badge_key, sport)`. Lo escribe el
motor.

### `badge_stats` — todos (también sin cuenta)
Rareza medida cada noche: `badge_key`, `sport`, `level`, `holders`, `base`, `pct` (0–100, double), `rarity`
(`nueva`|`comun`|`poco_comun`|`rara`|`epica`|`legendaria`), `computed_at`. Clave `(badge_key, sport, level)`.

### `league_badges` — liga visible, menos las escondidas por el superadmin (admins de la liga y superadmin: todas)
Diseños del creador de insignias de la liga (§5 de `docs/insignias.md`). `id`, `league_id`, `template`
(`^[a-z_]{1,32}$`|null: `champion`, `mvp`…), `name` (3–28), `description` (≤140), `shape`
(`hex`|`shield`|`circle`|`star`|`medal`|`medal_laurel`|`square`), `palette`
(`bronce`|`plata`|`oro`|`platino`|`diamante`|`liga`|`color`), `color` (`#rrggbb` en minúsculas, solo con `color`),
`icon` (uno de los 52 de `src/badges/visual/icons.ts`), `top_text` (≤14), `period_text` (≤10), `limit_kind`
(`unica`|`selecta`|`abierta`), `by_team`, `status` (`activa`|`archivada`|`oculta` = escondida por el superadmin),
`created_by`, `created_at`, `updated_at`. Sincroniza por `(league_id, updated_at)`.

### `league_badge_awards` — liga visible: vigentes y no ocultas; el jugador: también las suyas ocultas; admins de la liga y superadmin: todas (también retiradas)
Otorgamientos del creador. Se leen **solo estas columnas** (permiso por columna; pedir otra o `*` da `42501`):
`id`, `badge_id`, `league_id`, `player_id`, `team_id` (con `by_team`; null si se borró el equipo), `period` (≤10),
`division` (≤16), `awarded_at`, `revoked_at` (retirada: deshacer, el dueño o una fusión), `hidden`, `updated_at`,
`prize_slot_id` (…1200: el lugar premiado de un torneo del que salió; null = la dio una persona; sin FK: si el torneo
se borra, la insignia se queda), `prize_verified` (…1200: el servidor comprobó el orden; no se lee desde la app),
`prize_accounts` (…1300: cuántas cuentas jugaron la competencia de un premio verificado, contadas al entregar; no se lee
desde la app). `note`, `awarded_by`, `revoked_by`, `revoke_reason` y `seen_at` salen por
`league_badge_holders` (nota: el jugador y los admins; lo demás, admins), `profile_badges` y `badge_notices` (lo
propio). Única vigente por `(badge_id, player_id, period, division, prize_slot_id)` (el mismo «Campeón · OCT 2026» se
gana en dos torneos, o por equipos y en individual del mismo). Nunca cuentan en las oficiales ni la rareza; el total del
perfil las suma aparte (…1300). Sincroniza por `(league_id, updated_at)`.

### `tournament_prizes` — liga visible (también sin cuenta en una pública)
Premios del torneo (…1200): una premiación por competencia. `id`, `league_id`, `scope` (`evento`|`golf_torneo`|
`playoff`) con exactamente una de `event_id`, `golf_tournament_id`, `playoff_id` (única por competencia; borrar la
competencia la borra), `period` (≤10: la cinta de las insignias que se entregan; por defecto el mes, «OCT 2026»),
`closed_at`, `closed_by` («Cerrar premios»: desde ahí solo el dueño corrige), `created_by`, `created_at`, `updated_at`.
Sincroniza por `(league_id, updated_at)`.

### `tournament_prize_slots` — liga visible (también sin cuenta en una pública)
Un lugar premiado. `id`, `prize_id`, `league_id`, `category` (`equipo`|`individual`|`pareja`), `division` (`''`; raqueta:
id de la categoría del torneo; natación `F`|`M`; golf `gross`|`neto`), `label` (≤16: lo que se copia a
`league_badge_awards.division`, p. ej. «Categoría A», «Femenino», «Gross»), `place` (1–3), `badge_id` (un diseño de
`league_badges` de la liga; si el diseño se borra antes de darse, el lugar se va con él), `winners` (foto para mostrar,
`[{ref, name, teamId, players: [id]}]`), `verified` (el servidor comprobó el orden al entregar), `delivered_at` (la
primera entrega: de ahí corren los 14 días), `delivered_by`, `updated_at`. Único por `(prize_id, category, division,
place)`. Sin FK a `players`. Sincroniza por `(league_id, updated_at)`.

### `league_invites` — la cuenta invitada, quien invitó y los admins de la liga (el superadmin, todas)
`id`, `league_id`, `user_id` (la cuenta invitada), `invited_by` (null si se borró su cuenta), `status`
(`pending`|`accepted`|`declined`|`cancelled`), `created_at`, `updated_at`, `decided_at` (null mientras está pendiente).
Una pendiente por liga y cuenta. Se escribe solo con las RPC de invitaciones (abajo). Unirse por otro camino (código,
liga pública) la deja `accepted`; salir de la liga (o que lo saquen) deja `cancelled` las que mandó esa cuenta.

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

### `seasons` — liga visible
`id`, `league_id`, `name` (1–60), `starts_on` date, `ends_on` date|null, `status` (`active`|`closed`; una activa como
mucho), `closed_at`|null, `closed_by`|null, `standings` jsonb|null (la tabla final que guardó `close_season`),
`created_at`, `updated_at`. **Un juego es de la temporada donde cae su día** (evento: `events.date`; partido:
`scheduled_at`, o `created_at` sin hora, en la zona de la liga): `starts_on <= día` y (`status = 'active'` o
`ends_on` null o `día <= ends_on`). La activa no tiene fin para contar juegos (su `ends_on` es el fin previsto); al
cerrarla, `ends_on` = el día del cierre. Nunca se pisan ni se estiran a otro año: un evento o partido de antes de la
primera temporada (juegos viejos, la importación de BowlingX) la hace empezar ese día si es del mismo año; si es de un
año sin temporada, queda en una **cerrada `'Temporada <año>'`** (1 ene – 31 dic, `standings` null, `closed_by` null:
cada tabla la calcula con sus juegos). Un día entre dos temporadas del mismo año queda sin temporada. Las ligas que ya
existían recibieron una activa desde `season_start` (sin inicio: lo primero que se jugó) y lo de años anteriores en
cerradas así. `update_league` con `season_start`/`season_end` mueve la activa (`invalido: temporada` si empieza antes
de que termine la anterior o después de un juego que ya es de ella). Toda liga nace con la suya (`'Temporada <año>'`).

### `season_awards` — liga visible
`id`, `season_id`, `league_id`, `kind` (`campeon`|`subcampeon`|`tercero`|`mvp`|`mas_mejorado`|`fair_play`|`otro`),
`label` (1–40, lo que se muestra), `player_id`|null, `team_id`|null (a uno de los dos; null si se borró), `name`
(copiado), `note` (≤200)|null, `sort_order`, `created_at`, `updated_at`.

### `playoffs` / `playoff_series` — liga visible
`playoffs`: `id`, `league_id`, `season_id`, `name`, `status` (`active`|`finished`; uno activo por temporada),
`best_of` smallint[] (por ronda), `seeds` uuid[] (equipos en orden de siembra), `winner`|null (campeón),
`created_by`, `created_at`, `updated_at`. `playoff_series`: `id`, `playoff_id`, `league_id`, `round` (1 = primera),
`slot` (desde 1), `best_of` (1|3|5|7), `team_a`/`team_b`|null, `seed_a`/`seed_b`, `label_a`/`label_b` (nombres
copiados), `wins_a`/`wins_b`, `winner`|null, `bye` (pase directo), `next_series`|null + `next_side` (`a`|`b`),
`created_at`, `updated_at`. Los juegos son `matches` con **`series_id`** (y `bracket_key` `'PO<ronda>-<lugar>'`,
`stage` «Semifinal · Juego 2», sin `scheduled_at` al crearse): no cuentan en la tabla de la temporada. Una corrección
que cambia quién ganó una serie cuando la serie siguiente ya empezó (un juego no anulado con resultado o anotador)
falla con `cerrado: serie` y no cambia nada: el admin anula primero esos juegos. Reabrir una final (anular su último
juego) con otro playoff en curso en la temporada: `invalido: playoff`.
### `solo_sessions` — con sesión: las propias (el superadmin, todas)
Juegos sueltos del boliche (fuera de una liga o torneo). `id` (lo puede poner el teléfono), `user_id`, `sport`
(`bowling`), `played_on` date, `venue` (≤ 80), `note` (≤ 300), `scores` smallint[] (1–10 juegos de 0 a 300, sin null),
`frames` jsonb|null (como `entries.frames`: `{"<juego desde 0>": {rolls, masks}}`, < 16 KB), `shared` (sale en el
perfil y en el inicio de quien lo sigue; por defecto true), `created_at`, `updated_at`. Índice `(user_id, played_on
desc, id desc)`. Sin tombstones (no son de una liga): el tiempo real `user:<uid>` `solo` avisa qué cambió. Los de otra
cuenta se leen con `solo_sessions_of`. Salen en `export_my_data` (tabla `solo_sessions`).

### `solo_likes` — con sesión: los que di y los de mis juegos sueltos (el superadmin, todos)
`session_id`, `user_id`, `created_at`; clave `(session_id, user_id)`. Se escribe con `set_game_like('solo', …)`. Se
borran con el juego o con la cuenta (cascada).

### Solo servidor (sin lectura para la app)
`reminders_sent` (`event_id`, `kind` = `'<slot>@<YYYY-MM-DD>'`, p. ej. `'dia-antes@2026-10-03'`: un recordatorio por
evento, turno y fecha, aunque el cron corra otra vez) y `push_outbox` (un mensaje por teléfono: `subscription_id`,
`urgency`, `claimed_at`, `attempts`, `last_status`, `sent_at`). Esquema `private` (no expuesto): `op_log`, `paces`,
`rate_limits`, `storage_purge_queue` (`path`, `bucket`: `scoreboards` o `logos`, `queued_at`, `claimed_at`,
`attempts`), `heartbeat`, `scan_usage`, `scan_days`, `scan_minutes`, `scan_cache`, `push_once` (recordatorios que ya
salieron), `storage_alerts` (alertas de espacio), `league_creations` (ligas y torneos creados por cada cuenta en los
últimos 30 días, para el tope), `solo_deleted` (ids de juegos sueltos borrados), `logo_uploads` (subidas de logo
reservadas), los del motor de insignias (`badge_queue`, `badge_runs`, `badge_dry_holders`, `badge_dry_runs`: ver
«Motor de insignias»), `blocked_terms` (palabras bloqueadas del creador, normalizadas; `whole` = solo como palabra
entera) y `badge_reports` (reportes de diseños y de insignias automáticas; `resolution` `oculta`|`retirada`|`descartado`).

**Sincronización por cambios**: `select … where league_id = $1 and updated_at > $cursor` + tombstones desde
el cursor. `updated_at` es la hora de inicio de la transacción: usar como cursor el máximo `updated_at`
recibido **menos ~2 minutos** y hacer merge sin duplicar. Para ver si perdió acceso a una liga (lo sacaron,
se volvió privada o se borró): comparar `select id from leagues` / `select league_id from league_members
where user_id = <yo>` con lo local y purgar lo que ya no está.

## RPC

Formato: `nombre(argumentos) → retorno` · **quién** · errores propios. Todas exigen sesión salvo
`invite_preview` y `public_leagues_feed`; sin sesión dan `42501`. `p_patch` = objeto solo con las claves que cambian (una clave
desconocida da `invalido`). Las que llevan `p_op_id` son las de la cola sin conexión: reintentar con el
mismo `p_op_id` devuelve lo mismo que la primera vez y no repite nada.

### Cuentas y deportes

| RPC | Quién | Qué hace |
|---|---|---|
| `ensure_profile() → void` | la cuenta | Crea su perfil si el trigger no pudo (idempotente). |
| `rename_profile(p_name text) → void` | la cuenta | Nombre 1–60 (recortado). `invalido`. |
| `set_username(p_username text) → text` | la cuenta | Su `@usuario` (sin espacios alrededor, en minúsculas y sin una `@` al principio); devuelve cómo quedó. El mismo que ya tiene: nada. `invalido` (formato), `reservado`, `duplicado` (lo tiene otra cuenta), `rate_limited` (5 cambios por día). |
| `username_status(p_username text) → text` | la cuenta | Mientras se escribe: `mine` (el suyo), `ok`, `taken`, `invalid` o `reserved`, normalizado igual. 600 por hora (`rate_limited`). |
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
| `begin_logo_upload(p_league, p_path text) → void` | admin | Reserva la ruta `'<p_league>/<uuid>.webp\|.jpg\|.png'` antes de subirla al bucket `logos` (Storage no acepta nada sin reservar). Nueva: ni reservada, ni en la cola de Storage, ni el logo de ahora. Vale un día. `no_existe`, `no_permitido`, `invalido`, `rate_limited` (30 por día, se use o no). |
| `set_league_logo(p_league, p_path text) → text` | admin | Pone el logo (una ruta que reservó esa cuenta con `begin_logo_upload` hace menos de un día; se usa una vez) o lo quita (`p_path` null). Devuelve la ruta anterior para borrarla de Storage (null si no había o si es la misma: no cambia nada); la anterior ya queda en `private.storage_purge_queue`. `no_existe`, `no_permitido`, `invalido` (otra liga, otra forma o sin reservar), `rate_limited` (quitarlo cuenta en los mismos 30 por día). |
| `invite_preview(p_code text) → setof {league_id, name, sport, kind, visibility, logo_path}` | **cualquiera, también sin cuenta** | = `getInvite`. Código malo: ninguna fila. Más de 30 códigos malos por hora (por cuenta o IP): `rate_limited`. Mayúsculas/espacios no importan. Llamar con `select * from`. |
| `join_league(p_league uuid=null, p_code text=null, p_prefer uuid=null) → {league_id, player_id, claim_id} \| null` | con sesión | Pública: sin código. Privada: con su código (o solo `p_code`, desde el link). Ya miembro: igual (idempotente). Deja listo su jugador (ver `ensure_my_player`; `p_prefer` = «¿eres tú?» deja un reclamo; `claim_id` = su reclamo pendiente en la liga, o null). Código malo: **devuelve null** (cuenta el intento). Privada sin código: `no_permitido`. 10 códigos malos por hora: `rate_limited`. |

### Miembros y roles

| RPC | Quién | Qué hace |
|---|---|---|
| `set_member_role(p_league, p_user, p_role) → void` | dueño o superadmin; **un admin consigo mismo a `member`** | `p_role` `admin`\|`member` (`invalido`). Al dueño no se le toca el rol (`no_permitido`). |
| `set_member_scorer(p_league, p_user, p_scorer boolean) → void` | dueño o superadmin | Anotador (en boliche solo vale en torneos sin liga). |
| `step_down_admin(p_league) → void` | un admin | Deja de ser admin (sigue como jugador). |
| `remove_member(p_league, p_user) → void` | uno mismo (salvo el dueño); admin: solo miembros sin permisos (ni admin, ni anotador, ni «Diseña insignias»); dueño o superadmin: cualquiera menos el dueño | Su jugador queda sin cuenta y se quitan sus juegos en vivo. `no_existe`. |
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
| `create_player(p_league, p_name, p_average_override double=null, p_is_minor=false, p_guardian_name=null, p_id=null, p_guardian_phone=null, p_consent=false) → uuid` | admin | Jugador sin cuenta. Menor (todos los deportes): solo en liga con menores, con el nombre del padre, madre o tutor (1–60), su teléfono (opcional; se quitan espacios, guiones, puntos y paréntesis; queda con dígitos y `+`, ≤ 20) y su permiso (`p_consent = true`); si falta algo, `invalido`. Va a `player_private` con quién lo registró y cuándo. A quien no es menor no se le guarda el tutor. |
| `set_player_minor(p_player, p_is_minor boolean, p_guardian_name=null, p_guardian_phone=null, p_consent=false) → void` | admin | Marcarlo menor después: lo mismo que `create_player` (tutor, teléfono, permiso) y sin cuenta (`invalido`). Desmarcarlo deja los datos del tutor (un año de nacimiento de menor no lo deja). Es el único camino para marcar a un menor (`update_player` con `is_minor: true` da `invalido`). Al quedar como menor por cualquier camino, su reclamo pendiente se rechaza (trigger `players_minor_claims`: «Es menor de edad: un menor no queda con una cuenta.»). |
| `merge_league_players_preview(p_league, p_keep, p_drop) → {canMerge, reason, conflicts, moveAccount, keep, drop}` | admin | Lo que pasaría al juntar (no cambia nada). `reason` null \| `'dos_cuentas'` \| `'menor_con_cuenta'`; `conflicts` = `[{what, label, count}]` (como `player_claim_conflicts`); `moveAccount` = la cuenta del que se va pasa al que queda; `keep`/`drop` = `{id, name, userId, isMinor}`. `no_existe` (no son de esa liga), `invalido` (el mismo). |
| `merge_league_players(p_league, p_keep, p_drop) → {playerId, removedId, userId}` | admin | «Juntar con…»: todo lo de `p_drop` (juegos, envíos, «voy», pistas, partidos, golf, natación, inscripciones, me gusta, datos privados…) pasa a `p_keep` y `p_drop` se borra (`private.merge_players`, la misma unión de los reclamos). Si solo `p_drop` tiene cuenta, la cuenta pasa a `p_keep` (y un reclamo pendiente de `p_keep` se cierra solo). Si uno era menor, el que queda es menor y se completan sus datos privados con los del otro. El promedio fijo y los `attrs` (Index, nivel…) que le falten al que queda salen del otro (lo suyo gana). El reclamo pendiente de `p_drop` pasa a `p_keep` (si nadie lo pidió y ninguno tiene cuenta); si el que queda es menor, los reclamos pendientes quedan rechazados. Los dos con cuenta, o un menor con cuenta: `invalido`. `conflicto: …` si los dos jugaron el mismo evento o partido (no cambia nada). Queda en la auditoría (`merge_players`). |
| `update_player(p_player, p_patch) → void` | admin | Claves: `name, average_override, is_minor, attrs`. Desde el organizador `is_minor: true` a quien no es menor da `invalido` (marcar a un menor pide el tutor: `set_player_minor`); `is_minor: false` sigue igual. |
| `set_player_private(p_player, p_birth_year=null, p_sex=null, p_guardian_name=null) → void` | admin | Datos que solo ven los admins. |
| `delete_player(p_player) → void` | admin | Con sus participaciones, envíos, «voy», en vivo y social (cascada). |
| `link_account_to_player(p_player, p_user) → {removed_old, old_player_id}` | admin | Une la cuenta (miembro) con un jugador libre. Del jugador anterior de la cuenta: envíos pendientes y «voy» pasan al nuevo; si nunca jugó un evento se borra (y pasan todos sus envíos), si jugó queda libre. `duplicado`, `invalido` (menor), `no_existe`. |
| `unlink_account(p_player) → uuid` | admin, o la cuenta de ese jugador | Separa la cuenta y le da su jugador nuevo en el mismo momento (devuelve su id). Quita lo que publicó en vivo a nombre del jugador. `invalido` si no tenía cuenta. Nota: `ensure_my_player` ya no lo vuelve a vincular solo por el nombre (deja un reclamo). Si el admin vincula un jugador con `link_account_to_player`, su reclamo pendiente se cierra solo (aprobado si era de esa cuenta, rechazado si no). |

### Eventos, «voy» y equipos

| RPC | Quién | Qué hace |
|---|---|---|
| `create_event(p_league, p_type, p_date date, p_name='', p_games=3, p_hcp_base=0, p_hcp_percent=0, p_individual_rank_by=null, p_team_rank_by=null, p_category_cuts int[]={200,175,160}, p_team_size=0, p_announcement='', p_start_time time=null, p_config jsonb='{}', p_id=null) → uuid` | admin | Boliche: tipo `torneo`\|`practica`, 1–10 juegos, cortes 0–300. Un torneo del boliche sin regla escrita nace con `individual_rank_by = 'hcp'` y `team_rank_by = 'scratch'` (…1200: la regla del dueño, lo mismo que ya se leía con null; se cambia con `update_event`). |
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
gusta). Una cuenta «se ve» si es la propia, comparte una liga, es miembro de una liga pública, una de las dos sigue
a la otra o, desde `20260929000200_invitaciones.sql`, si no está bloqueada (con sesión se busca y se abre cualquier
cuenta sin bloquear; el superadmin ve todas). De lo que se ve solo sale lo de ligas que quien mira puede leer y **sin
menores** (juegos, me gusta recibidos, deportes y números). `follows` directo: cada cuenta lee solo sus filas.

| RPC | Quién | Qué hace |
|---|---|---|
| `follow_user(p_user) → {following, followers}` | con sesión | Idempotente. No a uno mismo (`invalido`), ni a quien no existe (`no_existe`), bloqueado o que no se ve (`no_permitido`). 60 cambios por hora (`rate_limited`). Push «te empezó a seguir» uno por persona y día. |
| `unfollow_user(p_user) → {following, followers}` | con sesión | Idempotente; cuenta en el mismo ritmo. |
| `follow_list(p_user, p_kind 'followers'\|'following', p_limit=30, p_before, p_before_id) → [{id, name, username, at, isFollowing, followsYou, isMe}]` | con sesión | Vacía si no se ve; solo lista a quien ve quien mira. Hasta 50. |
| `public_profile(p_user) → {id, name, username, since, sports, followers, following, likesReceived, gamesCount, isFollowing, followsYou, isMe}` | con sesión | `null` si no existe o no se ve. Los juegos sueltos compartidos cuentan en `gamesCount`, sus me gusta en `likesReceived` y ponen `bowling` en `sports`. |
| `profile_games(p_user, p_limit=20, p_before, p_before_key, p_sport) → [juego]` · `following_games(p_sport, p_limit, p_before, p_before_key)` | con sesión | Juegos (boliche, partidos, golf, natación y juegos sueltos compartidos) más nuevos primero, con `likes`, `likedByMe` y `detail`. Juego suelto: `kind` `solo`, `key` `j:<id>`, `playerId`/`leagueId`/`leagueName`/`eventId`/`eventType` null, `sport` `bowling`, `eventName` `'Juego suelto'`, `eventDate` = el día que jugó, `at` = ese día a mediodía (hora de RD), `url` `'/juegos-sueltos?juego=<id>'` solo para su dueño (null para los demás), `detail` `{title: 'Juego suelto', venue (null si no dijo), scores, series, high}`. Con `p_sport`, solo si es `bowling`. |
| `profile_stats(p_user) → {bowling, matches, golf, swim}` | con sesión | Números por deporte (boliche: solo juegos verificados de las ligas, y cada juego suelto compartido como una sesión más con todos sus juegos). |
| `set_game_like(p_kind, p_id, p_liked, p_player=null) → {likes, liked}` | ve la liga (sin menores); `solo`: el juego es compartido y se ve a su dueño | `bowling` = reacción `like`; `match` (con `p_player`: de quién es el juego; hay que haberlo jugado con resultado), `golf`, `swim`, `solo` (juego suelto: `public.solo_likes`; también el propio; quitarlo se puede siempre, pero de uno que ya no se ve devuelve `{likes: 0, liked: false}`). 300 cambios por hora. |
| `social_notices(p_limit=30) → [{kind: 'follow'\|'like', …}]` | con sesión | Lo de los últimos 30 días (los me gusta del boliche llegan por las reacciones de la liga). Me gusta en un juego suelto mío: `{kind: 'like', …, gameKind: 'solo', id, playerId: null, leagueId: null, leagueName: null, sport: 'bowling', url: '/juegos-sueltos?juego=<id>'}`. |

**Juegos sueltos** (`20260929001000_sueltos_logos.sql`) — boliche fuera de una liga o torneo. Todas con sesión y
`require_uid`. Contrato del cliente: `src/lib/data/solo.ts`. Juego suelto = `{id, userId, playedOn, venue, note,
scores, frames, shared, createdAt, updatedAt, likes, likedByMe}`.

| RPC | Quién | Qué hace |
|---|---|---|
| `save_solo_session(p_id uuid, p_played_on date, p_scores jsonb, p_frames jsonb=null, p_venue text='', p_note text='', p_shared boolean=true, p_op_id uuid=null) → uuid` | la cuenta | Crea (con el id del teléfono, o uno nuevo si `p_id` es null) o cambia uno suyo (lo reemplaza todo); devuelve el id. `p_played_on` de hace 10 años hasta mañana (hora de RD); `p_scores` 1–10 enteros de 0 a 300 (sin null, textos ni decimales); `p_frames` null o `{"<juego desde 0>": {…}}` solo con juegos que existen (`{}` = null); bolera ≤ 80 y nota ≤ 300, recortadas. `invalido`, `no_permitido` (el id es de otra cuenta, también para el superadmin), `no_existe` (ese id ya se borró: un guardado viejo de la cola no lo revive), `rate_limited` (200 por día). Con `p_op_id`: reintentar devuelve el mismo id sin repetir nada (la cola sin conexión). |
| `delete_solo_session(p_id) → void` | su dueño o el superadmin | Con sus me gusta; el id queda en `private.solo_deleted` (no se vuelve a crear). `no_existe`, `no_permitido`. |
| `solo_sessions_of(p_user=null, p_limit=50, p_before date=null, p_before_id uuid=null) → [juego suelto]` | con sesión | `p_user` null = los míos (todos). De otra cuenta: solo los compartidos y si se ve (si no, `[]`). Del más nuevo al más viejo (`playedOn` y `id`), hasta 500 por página; la siguiente con `p_before` = `playedOn` y `p_before_id` = `id` del último. |

**Personas e invitaciones** (`20260929000200_invitaciones.sql`) — todas con sesión y `require_uid`. Contrato del
cliente: `src/lib/data/people.ts` y `src/lib/data/invites.ts`. Persona = `{id, name, username, isFollowing,
followsYou, inLeague, invited}`.

| RPC | Quién | Qué hace |
|---|---|---|
| `search_people(p_query=null, p_league uuid=null, p_limit=30) → [persona]` | con sesión; con `p_league`: miembro de esa liga o superadmin (`no_permitido`) | Hasta 50, nunca la propia ni bloqueadas. Consulta (recortada a 60, en minúsculas, sin una `@` al principio) vacía: las cuentas que sigo, la más reciente primero. 1 letra: `[]`. Si no: `@usuario` que empieza con lo escrito o nombre que lo contiene (sin acentos; por nombre solo con 2 letras o números o más), en este orden: `@usuario` exacto, cuentas que sigo, `@usuario` que empieza así, nombre que empieza así y el resto por nombre. `inLeague` / `invited` (invitación pendiente a `p_league`): false sin `p_league`. 600 búsquedas por hora (`rate_limited`; la lista de quienes sigo no cuenta). |
| `invite_to_league(p_league, p_users uuid[]) → {sent, results: [{userId, status}]}` | miembro de una liga pública; en una privada (también con menores) dueño, admin o superadmin | Hasta 50 cuentas distintas (en su orden; `invalido` si ninguna o más). Cada una: `unavailable` (uno mismo, no existe o bloqueada), `member`, `pending` (ya tiene una que vale; la que ya no vale se cancela y se manda la nueva), `declined` (la rechazó hace menos de 7 días), `rate_limited` (no cupo en el límite de hoy) o `sent` (push «<nombre> te invitó a <liga>» a `/invitacion/<id>`, tag `invitacion:<id>`, vale 7 días; uno por persona y día de quien invita: invitar, retirar y volver a invitar, o a otra liga, no manda otro). `no_existe`, `no_permitido`, `rate_limited` (100 enviadas por día; se mira con cada una, con candado). |
| `respond_league_invite(p_invite, p_accept boolean, p_prefer uuid=null) → {status, leagueId[, playerId, claimId]}` | la cuenta invitada | Aceptar: entra de miembro con su jugador (`p_prefer` = «¿Quién eres?»: deja el reclamo, como `join_league`; `claimId` = su reclamo pendiente o null) y push a quien invitó («<nombre> aceptó tu invitación»). Si ya no vale (quien invitó está bloqueado, o la liga no es pública y quien invitó ya no es admin de ella: `private.invite_ok`), queda `cancelled` sin entrar. Rechazar: `declined`. Ya decidida: `{status, leagueId}` sin cambiar nada (sin `playerId`). `no_existe` (no es suya), `invalido` (`p_accept` null). |
| `cancel_league_invite(p_invite) → void` | quien invitó o admin de la liga | La deja `cancelled`. Ya decidida: nada. `no_existe`, `no_permitido`. |
| `my_league_invites() → [{id, leagueId, leagueName, logoPath, sport, kind, visibility, members, invitedBy: {id, name, username} \| null, createdAt}]` | con sesión | Mis invitaciones pendientes que todavía valen, la más nueva primero (hasta 50). |
| `league_invite_details(p_invite) → {id, status, createdAt, invitedBy, mine, member, league: {id, name, sport, kind, visibility, logoPath, venue, schedule, seasonStart, seasonEnd, members}, players: [{id, name}]} \| null` | la cuenta invitada (o el superadmin); cualquier otra: `null` | Para `/invitacion/<id>`. `mine`: es de la cuenta de la sesión (el superadmin la ve pero no la responde). `member`: si la cuenta invitada está en la liga. Pendiente que ya no vale: `status` = `cancelled`. `players`: los libres (sin cuenta, no menores, sin reclamo pendiente), por nombre, hasta 500, solo mientras está pendiente y vale. `venue`, `schedule`, `seasonStart`, `seasonEnd` y `members`: `null` si ya no vale y quien mira no puede leer la liga. |

### Temporadas, playoffs y agenda

| RPC | Quién | Qué hace |
|---|---|---|
| `close_season(p_season, p_standings jsonb, p_awards jsonb='[]') → void` | admin | Guarda la tabla (objeto o lista, < 256 KB) y los premios `[{kind, label?, player_id? \| team_id?, note?}]` (hasta 30, un solo `campeon`; `otro` con `label` 1–40; si no, «Campeón», «Subcampeón», «Tercer lugar», «MVP», «Más mejorado», «Fair play»; jugador o equipo de la liga). Activa: queda `closed` (`ends_on` = hoy en la liga) y sale un aviso como `league_announce` («Terminó <temporada>: campeón <nombre>», push a los miembros con avisos, url `/l/<liga>/temporadas`; `automatic`: no cuenta en el tope diario del admin). Ya cerrada: reemplaza tabla y premios sin avisar. |
| `start_season(p_league, p_name, p_starts_on, p_ends_on=null, p_copy_teams=false) → uuid` | admin | Con una activa: `invalido`. Empieza después de que terminó la anterior (si no: `invalido`; la cerrada no se toca, sus juegos siguen siendo suyos). Pone las fechas en la liga. `p_copy_teams` (ligas de equipos): copia los equipos de la anterior con plantilla (dorsal, posición, rol). |
| `league_seasons(p_league) → [{id, name, startsOn, endsOn, status, closedAt, closedBy, standings, awards: [{id, kind, label, name, playerId, teamId, note}], playoffs: [{id, name, status, champion: {teamId, name}\|null, runnerUp, semifinalists: [{teamId, name}]}]}]` | quien ve la liga (también sin cuenta) | Más nueva primero. Lee con la RLS de quien llama (no es security definer): `null` si no ve la liga. El `champion` del playoff es lo que se propone al cerrar. |
| `league_champions(p_league) → [{seasonId, name, startsOn, endsOn, closedAt, champion: {label, name, playerId, teamId}\|null, awards}]` | quien ve la liga (también sin cuenta) | Solo temporadas cerradas, más nueva primero. `null` si no ve la liga. |
| `create_playoffs(p_league, p_season, p_teams uuid[], p_best_of integer[]) → uuid` | admin (liga de equipos) | Temporada activa (si no: `cerrado`); 2–32 equipos de esa temporada en orden de siembra; `p_best_of` uno por ronda (1, 3, 5 o 7; con 5 equipos, 3 rondas). Siembra estándar (1 contra el último); pases directos a los mejores si no es potencia de 2. Programa el primer juego de cada serie (el mejor sembrado de local, sin fecha). Otro activo en la temporada: `duplicado`. |
| `delete_playoffs(p_playoff) → void` | admin | Borra la llave y los juegos sin empezar; los jugados se quedan sin serie. |
| `sync_playoffs(p_playoff) → int` | con sesión y ve la liga | Pone al día las series (un resultado propuesto que a las 48 h ya cuenta, un juego borrado). Una serie cuyo cambio ya no se puede aplicar se queda como estaba (las demás sí). Devuelve cuántas series cambiaron. Llamarla al abrir la llave. |
| `bowling_game_context(p_entries uuid[]) → [{entryId, playerId, leagueId, seasonId, averageOverride, average, before: {games, high}, season: {games, pins}, prevSeason: {id, games, pins}\|null}]` | quien ve la liga (también sin cuenta) | Hasta 100 participaciones de boliche. Juegos verificados del jugador en la liga antes de ese evento (orden fecha, id del evento), los de su temporada antes del evento, los de la temporada anterior entera y `average` (el promedio congelado de la participación): con eso `stats.ts` marca «Récord personal» y «+15 sobre tu promedio». Lee con la RLS de quien llama. |
| `public_agenda(p_sport=null, p_from=null, p_days=14) → {from, days, items: [{eventId, leagueId, leagueName, sport, leagueKind, logoPath, type, name, date, time, timeLabel, venue, join, cap, taken, spotsLeft, waitlist, until, categories, mine, url}]}` | cualquiera (también sin cuenta) | Ligas públicas sin menores de deportes no cerrados, de `p_from` (hoy en RD) a `p_days` (1–31) días, por día y hora, hasta 100: boliche (`join` `rsvp`: `join_league` + `set_rsvp`), rondas de golf abiertas (`golf`: `join_league` + `golf_register`) y noches o torneos de raqueta con inscripción abierta, antes de la fecha límite, sin empezar y con lugar (`signup`: `join_signup`; `cap`/`taken`/`spotsLeft`, por categoría en el torneo; `waitlist`). `mine`: ya va o ya está apuntado. `logoPath`: el logo de la liga (desde `20260929001000_sueltos_logos.sql`) o null. Sin cuenta: 60 cada 10 min por IP (`rate_limited`). |

Cuando un juego de una serie queda con resultado que cuenta (confirmado o W.O.; propuesto de hace 48 h con
`sync_playoffs`), la base cuenta las victorias; si nadie ganó la serie programa el siguiente juego (local alterno, el
mejor sembrado abre); un empate o un W.O. doble no suma y se juega otro; un anulado se reemplaza. Quien llega a las
victorias que hacían falta pasa a la serie siguiente (con su primer juego cuando se sabe el rival); el ganador de la
final queda en `playoffs.winner` (`finished`). Una corrección cambia quién pasa mientras la serie siguiente no haya
empezado.

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

### Insignias

Las da el motor (`…001110_insignias_motor.sql`); la app lee `badge_awards`, `badge_progress` y `badge_stats` directo
(RLS) y usa estas RPC. Todas con sesión y `require_uid` (una cuenta bloqueada no escribe ni lee perfiles).

| RPC | Quién | Qué hace |
|---|---|---|
| `profile_badges(p_user) → {userId, isMe, featured: [id], awards: [insignia], truncated} \| null` | con sesión | La pestaña «Insignias» del perfil. `null` si no existe o no se ve (como `public_profile`). Insignia: `{id, key, sport, level, periodKey, scope: 'cuenta'\|'liga', status, awardedAt, firmAt, leagueId, leagueName, playerId, context, hidden, seenAt}`, más nuevas primero, hasta 1000 (`truncated`). **Otra cuenta:** las de cuenta y las de sus jugadores en ligas que pasan `social_league_ok` (la ve quien mira, sin menores), `provisional` o `firme` y no ocultas; en las de cuenta, `context` pierde `league` y `event` si esa liga no la ve quien mira; `seenAt` null; una cuenta bloqueada sale vacía (salvo al superadmin). **La propia:** todas (ocultas, en revisión, de ligas con menores) menos las revocadas que nunca vio. `featured`: las destacadas que hoy se ven en público, en su orden. **Del creador** (…1120): además `leagueAwards: [LeagueBadgeAward]` y `leagueTruncated` (hasta 500), ver «Insignias de la liga (creador)». **Destacadas de la liga** (…1300): `featured` trae también ids de `league_badge_awards`, `featuredLeague: [id]` dice cuáles (mismo orden) y `hasChosen` si la cuenta eligió alguna que todavía vale (aunque quien mira no vea ninguna); ver «Insignias en el perfil». |
| `set_featured_badges(p_ids uuid[]) → uuid[]` | la cuenta | Hasta 3 (repetidas cuentan una), en ese orden; `null` o `[]` las quita. Ids de `badge_awards` o (…1300) de `league_badge_awards`. Cada una suya (`no_permitido`); automática: `provisional` o `firme`, no oculta y no de una liga con menores; de la liga: vigente, no oculta, de un diseño no escondido y de una liga sin menores (`invalido`); `no_existe`. Devuelve cómo quedaron. |
| `set_badge_hidden(p_award, p_hidden boolean) → boolean` | su dueño (la cuenta o la de su jugador) | Ocultar del perfil o «Mostrar en mi perfil» (las privadas por defecto nacen ocultas). Oculta, sale de las destacadas. `no_existe`, `no_permitido`, `invalido` (null). |
| `mark_badges_seen(p_ids uuid[]) → int` | su dueño | Ya vio el aviso de desbloqueo (no vuelve a salir en ningún teléfono). Hasta 50 (`invalido`); las ajenas o ya vistas se ignoran. Devuelve cuántas marcó. |
| `set_badges_auto(p_league, p_mode text) → text` | dueño o superadmin | `todas`\|`sin_titulos`\|`ninguna` (`invalido`); `no_existe`. En ligas con menores también (nace `sin_titulos`). |
| `review_badge(p_award, p_ok boolean, p_note text=null) → text` | dueño o admin de la liga que no es el jugador ni compite en la evidencia (mismo evento de boliche o golf, mismo partido), o superadmin | Aval de una hazaña `en_revision`: `firme` (el motor avisa al jugador) o `revocada` con `aval` (sin rastro público). Queda `context.review {ok, at, by}`; la nota (≤ 140, `invalido`) solo al rechazar (`note`: la ve el jugador); al aprobar no se guarda (la fila firme es pública). `profile_badges` nunca muestra `context.review` a otros. Si después quien confirmó se vincula con ese jugador, vuelve a revisión (…1120). Ya decidida: devuelve cómo quedó. El superadmin que no administra la liga queda en la auditoría (`review_badge`). |
| `super_revoke_badge(p_award, p_note text=null) → void` | superadmin | Retira por fraude (también una firme): `revocada` con `fraude`, sin push, fuera de las destacadas. Auditoría `revoke_badge` {award, key, sport, level, periodKey, playerId, userId, status, note} (target la cuenta o la liga). Nota ≤ 200. Ya revocada: nada. |
| `badge_notices(p_limit=50) → {awards, unseen, reviews}` | con sesión | El aviso de desbloqueo y la página de Avisos. `awards`: las suyas (cuenta o sus jugadores) `provisional` o `firme` sin ver, más nuevas primero, hasta `p_limit` (1–50): `{id, key, sport, level, periodKey, scope, status, awardedAt, firmAt, leagueId, leagueName, playerId, context, hidden, history}` (`hidden` = privada por defecto: «Solo tú la ves»; `history` = del historial: un solo modal «Te dimos {n} insignias por tu historial»). `unseen` = cuántas hay. `reviews` («Por confirmar»): las `en_revision` que puede confirmar (dueño o admin elegible, `private.badge_can_review`) y, al superadmin, además las de 14+ días o sin nadie que pueda: `{id, key, sport, level, periodKey, leagueId, leagueName, playerId, playerName, refs, context, awardedAt, overdue}`. Se confirman con `review_badge`. **Del creador** (…1120): además `leagueAwards: [LeagueBadgeAward]` (de sus jugadores, vigentes, sin ver: el aviso «Liga Los Pinos te dio una insignia»; hasta `p_limit`) y `leagueUnseen`; se marcan con `mark_league_badges_seen`. |
| `badges_backfill(p_league=null, p_dry_run=true) → {runId, dryRun, jobs, leagues, accounts}` | superadmin | Primera corrida del historial (§3.5): un trabajo `historial` por liga (todas o `p_league`; `no_existe`) y uno por cada cuenta con jugadores en esas ligas (lo de cuenta y comunidad: kilometraje, constancia, fijo del mes, tu año, liga en marcha…; el de la liga solo hace eso para sus jugadores sin cuenta). En seco no escribe insignias: `private.badge_dry_runs` (`run_id`) queda con cuántas cuentas tendrían cada key, deporte y nivel sobre la base de activos. De verdad: sin push por insignia y un solo push por cuenta al final. Auditoría `badges_backfill`. La consola lo corre desde Insignias › Motor. |
| `admin_badges_engine(p_run uuid=null) → jsonb` | superadmin | Consola › Insignias › Motor: `{queue: {pending, due, locked, dead, notices, oldestDue}, byKind: [{kind, pending, dead}], dead: [{id, kind, leagueId, leagueName, userId, userName, ref, attempts, lastError, runAfter, createdAt}] (5+ intentos, los 50 más viejos), backfill: [{runId, dryRun, pending, dead}] (corridas del historial en la cola), runs: [{runId, at, badges, holders}] (las 10 últimas en seco), dryRun: {runId, rows: [{key, sport, level, holders, base, pct}]} \| null (la de `p_run` o la última), periods: [{kind, scope, periodKey, doneAt, awarded}] (los 20 últimos)}`. La app compara `dryRun` con la rareza estimada del catálogo. |
| `admin_badge_jobs(p_ids bigint[], p_action text='retry') → integer` | superadmin | Trabajos con 5+ intentos (los demás no se tocan; hasta 200): `'retry'` los vuelve a la cola (intentos en 0, sin error, ya; si entró otro igual se queda ese) y llama al motor; `'drop'` los borra. `invalido`. Auditoría `badge_jobs {action, ids}`. |

Al aprobar un reclamo, `private.merge_players` junta también las insignias de los dos jugadores
(`private.merge_badges`): si chocan (misma key, deporte, nivel y periodo) queda la firme sobre la provisional sobre la
que está en revisión (sobre la revocada) y, a igual estado, la más vieja; se lleva el `awarded_at` más viejo, el
primer `seen_at` y `notified_at`, y queda oculta si alguna lo estaba (no destapa lo que el dueño ocultó). La otra se
borra (tombstone) y sale de las destacadas; el progreso de los dos se borra (el motor lo recalcula). `export_my_data`
saca `badge_awards` y `badge_progress` por la cuenta y por sus jugadores. **Ojo:** `private.merge_players` la
redefinen otras migraciones (…0100 reclamos y, al juntar las ramas, …0600 organizador y …0700 temporadas, que corren
antes): esta no copia su cuerpo, la renombra a `private.merge_players_base` y pone delante `merge_badges`. Un cambio a
la unión de jugadores va en `merge_players_base` (en una migración posterior); una tabla nueva con FK a `players` se
junta ahí (o en `private.merge_badges`), o frena la aprobación con `conflicto`. `public.export_my_data` (misma firma)
se cambia aquí o en una migración posterior.

### Insignias de la liga (creador)

`20260929001120_insignias_creador.sql` (pruebas: `tests/sql/insignias-creador.test.ts`; diseño: `docs/insignias.md` §5).
Las diseña y las da una persona de la liga; nunca cuentan en las oficiales. **Quién** = `can_badges` (ver
`memberships`). Nadie se da una a sí mismo (ni el dueño ni el superadmin). Todas con sesión y `require_uid`.

Formas JSON:
- **`LeagueBadge`** (un diseño): `{id, leagueId, name, description, shape, palette, color, icon, topText, periodText,
  template, limitKind, byTeam, status, createdBy, createdAt, updatedAt, given, active, locked}` (`given` = veces que se
  dio, también las retiradas; `active` = vigentes; `locked` = `given > 0`: solo cambian `description` y `status`).
- **`LeagueBadgeAward`** (en el perfil y los avisos): `{id, badgeId, leagueId, leagueName, sport, playerId, teamId,
  teamName, period, division, awardedAt, hidden, note, seenAt, badge: {id, name, description, shape, palette, color,
  icon, topText, periodText, template, limitKind, byTeam, status}, prizeSlotId, prize}` (`note` y `seenAt` solo si es
  de un jugador de quien mira; si no, null). `prizeSlotId` y `prize` desde …1300: `prize` es null si la dio una
  persona; si es un premio del torneo, `{slotId, verified, place, placeLabel, category, title, competition}` (ver
  «Insignias en el perfil»). En `profile_badges` cada una trae además `onProfile`.

Filtro de texto (`private.badge_text_ok`, en nombre, descripción, textos de arriba y abajo, periodo, división y nota;
los textos se recortan y quedan con un solo espacio entre palabras): solo letras (con `áéíóúüñ`), números, espacio y
`. , : ; ! ¡ ? ¿ ' " & # / ( ) + -` (sin emoji); nada de `http`, `www.` ni `.com`/`.net`/`.org`/`.do` al final de una
palabra; ni 7+ dígitos seguidos ni `ddd dddd` (con espacio, punto o guion en medio) sin más dígitos al lado; ni el mismo
carácter 4+ veces seguidas; ni una palabra de `private.blocked_terms` después de normalizar (minúsculas, sin tildes,
`ñ`→`n`, `0→o 1→i 3→e 4→a 5→s @→a`; `whole = false`: en el texto junto, sin separadores; `true`: palabra entera o su
plural). Error: `texto_bloqueado` («Ese texto no se puede usar.»). El teléfono repite todo menos las palabras.

| RPC | Quién | Qué hace |
|---|---|---|
| `set_badge_policy(p_league, p_policy text) → text` | dueño o superadmin | `owner`\|`admins`\|`chosen` (`invalido`); `no_existe`. |
| `set_member_badge_maker(p_league, p_user, p_on boolean) → void` | dueño o superadmin | «Diseña insignias» (como `set_member_scorer`). `no_existe`. |
| `save_league_badge(p_league, p_id uuid\|null, p_design jsonb) → LeagueBadge` | `can_badges` | Crea (`p_id` null o un id nuevo del teléfono) o cambia (solo las claves que vienen). Claves (snake_case): `template` (string\|null), `name`, `description`, `shape`, `palette`, `color` (string\|null; solo con `palette: 'color'`, `#rrggbb`), `icon`, `top_text`, `period_text`, `limit_kind`, `by_team` (boolean; solo en raqueta y equipos), `status` (`activa`\|`archivada`). Al crear hacen falta `name`, `shape`, `palette`, `icon`. `invalido` (clave, tipo, largo, valor, ícono fuera de la lista), `texto_bloqueado`, `ya_dada` (ya se dio: solo `description` y `status`), `limite: activas` (30), `limite: total` (100 con archivadas y escondidas), `rate_limited` (20 guardados por hora por cuenta), `no_existe` (liga, o `p_id` de otra liga), `no_permitido` (sin permiso, o escondida por el superadmin). |
| `archive_league_badge(p_id, p_archived boolean) → text` | `can_badges` | `archivada` o `activa` (`limite: activas`). Escondida: `no_permitido`. |
| `delete_league_badge(p_id) → void` | `can_badges` | Solo si nunca se dio (`ya_dada`: se archiva). Deja tombstone. |
| `award_league_badge(p_badge, p_players uuid[], p_team uuid=null, p_period text=null, p_division text=null, p_note text=null, p_notify boolean=true) → {awards, notified}` | `can_badges` | Da un diseño `activa` (`no_activa`) a 1–30 jugadores de la liga (`no_existe`; repetidos cuentan uno). `by_team`: `p_team` obligatorio (equipo de la liga) y los jugadores de su plantilla (`team_players`); sin `by_team`, `p_team` null (`invalido`). `p_period` null = el `period_text` del diseño (`''` = sin periodo; ≤10), `p_division` ≤16, `p_note` ≤140. Su propio jugador: `a_si_mismo` («No puedes darte insignias a ti mismo. Pídele a otro admin o al dueño.»). Ya la tiene vigente con ese periodo y división: `duplicado`. Cupo por insignia, periodo y división: Única 1, Selecta 3, Abierta 20 jugadores (con `by_team`, equipos): `cupo_lleno`. 15 vigentes por jugador, liga y año (zona de la liga): `limite: jugador`. 60 por liga en 30 días: `limite: liga`; 60 por cuenta por hora: `rate_limited` (esos dos cuentan también las retiradas). `p_notify`: push a cada jugador con cuenta no bloqueada, nunca en ligas con menores: «¡Tienes una insignia nueva!» · «Liga Los Pinos te dio “Campeón · TEMP 2026”. Tócala para verla.», `url` `/u/<cuenta>?tab=insignias`, `tag` `insignia:<otorgamiento>`. `awards`: `[{id, badgeId, leagueId, playerId, teamId, period, division, note, awardedBy, awardedAt, hidden, revokedAt}]` en el orden de `p_players`; `notified` = jugadores avisados. |
| `revoke_league_badge_award(p_award, p_reason text=null) → void` | dueño o superadmin, cuando sea; quien la dio, en 24 h y con `can_badges` | «Deshacer» y «Quitar»: `revoked_at`, `revoked_by`, motivo privado ≤140. Sin push (si el push aún no salió, se quita de la cola). Ya retirada: nada. El superadmin que no es el dueño: auditoría `revoke_league_badge`. Un premio del torneo con la premiación cerrada o el lugar entregado hace más de 14 días: solo el dueño (`cerrado`, …1200). |
| `set_league_badge_hidden(p_award, p_hidden boolean) → boolean` | el jugador (su cuenta) o superadmin (auditoría `hide_league_badge_award`) | Ocultar o mostrar en su perfil. `invalido` (null). |
| `mark_league_badges_seen(p_ids uuid[]) → int` | el jugador | Hasta 50 (`invalido`); las ajenas, retiradas o vistas se ignoran. |
| `league_badge_holders(p_badge) → {badge, canGive, awards}` | quien ve la liga (una escondida: solo sus admins; si no, `no_existe`) | «Quién la tiene». `badge`: `LeagueBadge` (+ `openReports` para los admins). `canGive`: puede darla ahora. `awards`: `[{id, playerId, playerName, userId, teamId, teamName, period, division, awardedAt, hidden, revokedAt, note, awardedBy, awardedByName, revokedBy, revokeReason, canUndo}]`, más nuevas primero. Admins y superadmin: todas (ocultas y retiradas) con todo. Los demás: vigentes y no ocultas (y las suyas ocultas); `note` solo en las suyas; `awardedBy`, `awardedByName`, `revokedBy` y `revokeReason` null. `canUndo`: puede deshacerla o retirarla. |
| `report_league_badge(p_badge, p_reason text=null) → void` | miembro de la liga | A la cola del superadmin. Motivo ≤140. Uno abierto por cuenta y diseño (repetir no hace nada). 5 reportes por día por cuenta (con `report_badge`): `rate_limited`. Escondido: `no_existe`. |
| `report_badge(p_award, p_reason text=null) → void` | de una liga: sus miembros; de cuenta: quien ve ese perfil | Reportar una insignia automática `provisional` o `firme` y no oculta (si no, `no_existe`). Mismas reglas. Retirarla (motor, aval o fraude) cierra sus reportes. |
| `hide_league_badge(p_id, p_hidden boolean, p_note text=null) → text` | superadmin | Esconder (`oculta`: fuera de perfiles y de la liga, salvo sus admins; cierra sus reportes) o dejar de esconder (`archivada`). Nota ≤200. Auditoría `hide_league_badge`. |
| `admin_badge_reports(p_open boolean=true, p_limit int=50) → {open, rows}` | superadmin | La cola (abiertos o cerrados), más nuevos primero (1–200): `{id, kind: 'diseno'\|'insignia', reason, createdAt, resolvedAt, resolution, reporterId, reporterName, leagueId, leagueName, sameTarget, design: LeagueBadge\|null, award: {id, key, sport, level, periodKey, status, playerId, playerName, userId, context}\|null}`. |
| `admin_resolve_badge_reports(p_ids bigint[], p_note text=null) → int` | superadmin | Cierra sin hacer nada (`descartado`). Auditoría `resolve_badge_reports`. |
| `admin_blocked_terms(p_add text[]=null, p_remove text[]=null, p_whole boolean=false) → [{term, whole, createdAt}]` | superadmin | Palabras bloqueadas (se normalizan como el filtro; 2–40 letras, `invalido`; hasta 200). Sin argumentos: la lista. Auditoría `blocked_terms`. Empieza con una lista base (insultos de aquí y de otros países; las cortas o que salen dentro de palabras sanas, enteras). |

En el perfil de otra cuenta (`profile_badges`) salen solo las de ligas que pasan `private.league_badges_public`: la ve
quien mira y sin menores (`social_league_ok`), 6+ cuentas miembro no bloqueadas y 14+ días de creada; vigentes y no
ocultas (un premio del torneo con el orden verificado de una competencia que jugaron 2+ cuentas, desde …1300, solo
pide `social_league_ok`: ver «Insignias en el perfil»). La propia: todas las vigentes. Nunca las de un diseño escondido. Al juntar dos jugadores
(`private.merge_badges`), si los dos tienen vigente la misma insignia, periodo y división, queda la más vieja y la otra
se retira con motivo `fusión` (sin push); todas pasan al jugador que queda. `export_my_data` saca `league_badge_awards`
de sus jugadores (la encuentra sola por `player_id`). **Ojo:** esta migración redefine `profile_badges`, `badge_notices`,
`remove_member`, `private.merge_badges` y la vista `memberships` (misma firma): un cambio a esas va aquí o después.

### Premios del torneo

`20260929001200_premios_torneo.sql` (pruebas: `tests/sql/premios-torneo.test.ts`; diseño: `docs/premios-torneo.md`).
Alguien de la liga elige qué diseño del creador (`league_badges`) se lleva cada lugar del podio de una competencia y,
cuando termina, un admin lo entrega: las insignias van a `league_badge_awards` con `prize_slot_id` (perfil, avisos,
push, ocultar, fusiones y «Descargar mis datos» como cualquier insignia de la liga). Un premio no es un regalo: no usa
el cupo del diseño (Única/Selecta/Abierta) ni los topes del creador (15, 60, 60). **Elegir** = `can_badges`;
**entregar**, ver el podio y cerrar = admin de la liga o `can_badges`. Todas con sesión y `require_uid`. Topes: 24
lugares por competencia, 3 unidades por lugar, 100 jugadores por unidad, 300 por llamada; 30 llamadas por hora por cuenta
entre guardar y entregar (`rate_limited`).

Qué premia cada competencia (`private.prize_allowed`; `kind` de `tournament_podium`):

| Competencia (`scope`, ref) | `kind` | Categorías (`division`) | Orden |
|---|---|---|---|
| Boliche, evento `torneo` (`evento`) | `bowling` | `equipo` (si el evento tiene equipos o `team_size > 0`) e `individual` | servidor: equipos por la suma del scratch (o del total con handicap si `team_rank_by = 'hcp'`), individual por el total con handicap (o scratch si `individual_rank_by = 'scratch'`); con `hcp_percent = 0`, todo scratch. Solo juegos con foto (como `entryLine`); en un equipo reciben los que jugaron. Desde el día del torneo |
| Raqueta, torneo por categorías (`evento`, type `torneo`) | `racket_tourney` | por categoría de `config.categories` (`division` = su id): `pareja` si la liga juega en dobles (pádel siempre; si no, `rules.match.doubles`, y sin eso pickleball sí y tenis no), si no `individual` | servidor: la final `<cat>-R<rondas>-1` (rondas de `seeds`), 2.º quien la perdió (por W.O.: vacío), 3.º el ganador de `<cat>-P3` o, sin P3, los dos semifinalistas |
| Noches de americano o mexicano y social de pickleball (`evento`) | `racket_night` | `individual` | teléfono; desde el día de la noche |
| Torneo relámpago de baloncesto, fútbol o sala (`evento` de una liga `kind = 'torneo'`: solo el del torneo, el primero de tipo `torneo` de la liga) | `team_ko` | `equipo` | servidor: la final (único partido de la ronda `R<n>` más alta de la liga, sin playoff ni anulados) y el ganador de `P3` |
| Playoff (`playoff`, `playoffs.id`) | `playoff` | `equipo` | servidor: campeón, rival de la final y los que perdieron la ronda anterior; con `status = 'finished'` |
| Golf, ronda suelta (`evento`) o torneo de varias rondas (`golf_torneo`, `golf_tournaments.id`) | `golf` | `individual` con `''` (la competencia de la ronda), `gross` y `neto` | teléfono; todas las rondas `cerrada` |
| Natación, encuentro o torneo (`evento`; `control` no) | `swim` | `equipo` (club) e `individual` con `''`, `F` y `M` | teléfono; encuentro finalizado |

Unidades (`ref`, texto): `t:<teams.id>` (equipo del evento de boliche, equipo o pareja de temporada; el otorgamiento
lleva ese `team_id`), `p:<players.id>`, `c:<swim_clubs.id>` y `s:<match_id>:<lado>` (lado de raqueta sin pareja y con
más de un jugador). Un equipo de temporada (relámpago, playoffs) son quienes jugaron de su lado en partidos que cuentan
más su plantilla, pero solo quien ya estaba cuando quedó el resultado de su último partido (`team_players.created_at` ≤
propuesto o confirmado, lo primero): entrar al campeón después de la final no da el premio. Un lado de raqueta sin
alineación usa la plantilla de su pareja con la misma regla.

Formas JSON:
- **`TournamentPrize`** (`private.prize_json`): `{id, leagueId, scope, refId, period, closedAt, closedBy, createdAt,
  updatedAt, slots: [{id, category, division, label, place, badgeId, title, winners: [{ref, name, teamId, players:
  [id]}], verified, deliveredAt, deliveredBy, editableUntil, updatedAt}]}` (lugares: equipos, parejas, individual;
  división; lugar). `title` = «Equipos (scratch)», «Individual (handicap)», «Parejas · Categoría A», «Individual ·
  Gross», «Clubes», «Individual · Femenino»… (el boliche con la regla efectiva del evento). `editableUntil` = primera
  entrega + 14 días.
- **Podio** (`tournament_podium`): `{prizeId, kind, verified, slots: [{slotId, verified, status, finished, units:
  [{ref, name, teamId, players: [{id, name, played?}]}], holders: [{awardId, playerId, teamId}], withdrawn: [playerId]}]}`
  (`played` en equipos y lados de raqueta: si apareció en la alineación; con alineaciones, la pantalla marca por
  defecto solo a quienes jugaron).
  `status`: `listo` · `vacio` (nadie en ese lugar: empate en el anterior, final por W.O.) · `sin_resultado` (todavía no
  cuenta) · `empate_multiple` (más de 3 empatados: no se entrega sola) · `telefono` (golf, natación, noches: lo arma
  el teléfono). `finished` = ya se puede entregar. `holders` = quién lo tiene vigente; `withdrawn` = a quién se lo
  quitaron a mano y hoy no lo tiene (la pantalla lo deja desmarcado).

| RPC | Quién | Qué hace |
|---|---|---|
| `set_tournament_prizes(p_league, p_scope text, p_ref uuid, p_period text, p_slots jsonb) → TournamentPrize \| null` | `can_badges` | Guarda el **conjunto completo** de lugares (crea la premiación si no existe: una por competencia, reintentar no duplica). `p_slots = [{category, division?, label?, place, badge_id}]` (0–24; `label` null o sin la clave: el de la división). Lo que no viene se borra; `[]` borra la premiación (devuelve null). `p_period` null = la que tiene (al crear: el mes de la competencia). `no_existe` (liga, competencia o diseño de otra liga), `invalido` (competencia sin premios, clave, tipo, categoría o división que no admite, lugar repetido), `no_activa` (diseño nuevo o cambiado que no está activo), `texto_bloqueado`, `ya_entregado` (un lugar con insignias vigentes no cambia de diseño ni de `label` ni se borra, y la cinta no cambia: primero se quita con `deliver_tournament_prizes`), `rate_limited`. |
| `tournament_podium(p_prize) → podio` | admin o `can_badges` | La vista previa de «Entregar premios» (la misma cuenta que usa la entrega). `no_existe`, `no_permitido`. |
| `deliver_tournament_prizes(p_prize, p_podium jsonb, p_notify boolean=true) → {added, revoked, unchanged, notified, prize: TournamentPrize}` | admin o `can_badges` | Entrega o corrige por **estado deseado** de los lugares que vienen: `p_podium = [{slot_id, units: [{ref, players: [uuid]}]}]` (`name` y `teamId` se aceptan y se ignoran). `units: []` quita. Otra vez lo mismo: nada. Lo que sobra se retira (`revoke_reason` «Corrección del podio», sin aviso; su push pendiente sale de la cola) y lo que falta se da (`team_id`, `period` = la cinta, `division` = `label`, `note` «1.er lugar · Individual (handicap) · Copa», `awarded_by`, `prize_slot_id`, `prize_verified`). Orden verificado (boliche, cuadros, relámpago, playoffs): los `ref` = los del podio del servidor y los jugadores un subconjunto de los suyos (desmarcar sí, agregar no), si no `podio_cambio`; quien entrega puede estar en el podio. Sin orden verificado (golf, natación, noches): `p:` solo con ese jugador, `c:` con nadadores de ese club, todos que jugaron (golf: tarjeta con golpes y sin DQ; natación: prueba con tiempo y sin DQ/DNS/DNF; noches: partido no anulado), si no `invalido`; su propio jugador: `a_si_mismo`. Dar: `sin_resultado` si todavía no se puede, `no_activa` si el diseño no está activo. Cambiar un lugar entregado hace más de 14 días o una premiación cerrada: solo el dueño (`cerrado`). Push a los que reciben con cuenta no bloqueada (nunca en ligas con menores): «¡Tienes una insignia nueva!» · «Liga del Banco: te llevas “Campeón” por el 1.er lugar en Copa. Tócala para verla.», `tag` `insignia:<otorgamiento>`. `no_existe` (premiación o lugar), `invalido`, `rate_limited`. |
| `close_tournament_prizes(p_prize) → void` | admin o `can_badges` | «Cerrar premios»: desde ahí solo el dueño corrige. Ya cerrada: nada. No se reabre. |

Tiempo real: las dos tablas avisan `badges` `{op, ids, kind: 'premio'}` por `league:<liga>` (el cliente invalida las
insignias de la liga con cualquier `badges`); los otorgamientos avisan como siempre. Las insignias automáticas
(`event_podium`, `bowling_team_win`…) no cambian y conviven con el premio. **Ojo:** esta migración redefine
`award_league_badge`, `private.merge_badges` (chocan solo dos del mismo lugar premiado; la foto `winners` pasa al
jugador que queda), `private.badge_link_guard` (no retira un premio con `league_badge_awards.prize_verified`: la marca va
en el otorgamiento y sigue aunque se borre la competencia), `revoke_league_badge_award` (un premio de una premiación
cerrada, o de un lugar entregado hace más de 14 días, solo lo quita el dueño: `cerrado`) y `create_event` (misma
firma).

### Insignias en el perfil

`20260929001300_insignias_perfil.sql` (pruebas: `tests/sql/insignias-perfil.test.ts`). Las insignias de la liga (las
que da una persona y los premios del torneo) se destacan y salen en el perfil como las automáticas. El total del perfil
y el orden de las destacadas automáticas los arma el teléfono con lo que devuelve `profile_badges`.

- **Destacadas** (`profiles.featured_badges`, hasta 3): ids de `badge_awards` o de `league_badge_awards`.
  `set_featured_badges` acepta una de la liga si es de un jugador de la cuenta (`no_permitido`), vigente, no oculta,
  de un diseño que el superadmin no escondió y de una liga sin menores (`invalido`); una de una liga pequeña o nueva se
  puede destacar (otra cuenta la ve cuando la liga pase la regla de abajo). `profile_badges.featured` = las de las dos
  tablas que quien mira puede ver hoy, en su orden; `featuredLeague` = cuáles de esas son de la liga (mismo orden; el
  teléfono las busca en `leagueAwards`, las otras en `awards`). En el propio perfil, las de la liga destacadas salen si
  siguen valiendo (sin la regla de abajo). `hasChosen`: la cuenta eligió alguna que todavía vale (la regla de
  `set_featured_badges`), la vea o no quien mira; `false` = no eligió y el teléfono arma las que salen solas; `true`
  con `featured` vacío = eligió, pero quien mira no ve ninguna (no sale nada).
- **Quién las ve en el perfil de otra cuenta** (`private.league_award_public(otorgamiento)`): un premio del torneo con
  `prize_verified` (el servidor comprobó el orden: boliche, cuadros, relámpago y playoffs) y `prize_accounts >= 2`
  sale si la liga pasa `social_league_ok` (la ve quien mira y no tiene menores), aunque sea pequeña o nueva. El orden
  verificado solo dice que el servidor ordenó lo que le dieron: el dueño de una liga de uno que arma un torneo con
  jugadores sin cuenta no se fabrica un «Campeón» público. `prize_accounts` (`private.prize_accounts`, con el trigger
  `league_badge_awards_accounts` al entregar; sin grant) = cuántas cuentas distintas no bloqueadas jugaron: en el
  boliche, las que tienen un juego que cuenta; en cuadros, relámpago y playoffs, la alineación y la plantilla de los
  lados de los partidos no anulados (en el playoff, también las plantillas de sus series). Se guarda en el otorgamiento:
  sigue aunque se borre la competencia. Con menos de 2 cuentas, los premios sin orden verificado (golf, natación,
  noches) y las que da una persona siguen con `private.league_badges_public` (6+ cuentas y 14+ días). Nunca las
  ocultas, las retiradas ni las de un diseño escondido; una cuenta bloqueada sale vacía (salvo al superadmin).
- **`LeagueBadgeAward`** (perfil y avisos) trae `prizeSlotId` y `prize` (`private.league_award_prize`): null si la dio
  una persona; si es un premio, `{slotId, verified, place, placeLabel ('1.er lugar'), category ('equipo'|'individual'|
  'pareja'), title ('Individual (handicap)', 'Parejas · Categoría A'…), competition ('Copa Aniversario', 'Torneo del 12
  oct'…)}`. Si la competencia se borró, todo menos `slotId` y `verified` va null (la insignia se queda con su `period`
  y su liga). En `profile_badges` cada una trae además `onProfile`: para otra cuenta, `true`; en el propio, si otra
  cuenta que ve la liga la ve en el perfil (no oculta y pasa la regla de arriba).
- **Salen solas de las destacadas** (triggers `league_badge_awards_unfeature` y `league_badges_unfeature`): al ocultarse
  (`set_league_badge_hidden`), retirarse (deshacer, quitar, corrección del podio, fusión, el guardia del vínculo) o
  esconderse su diseño (`hide_league_badge`). Si después vuelve a verse, no vuelve sola a las destacadas.

**Ojo:** esta migración redefine `profile_badges` (la de `001120`), `set_featured_badges` (la de `001100`) y
`private.league_award_json` (la de `001120`), misma firma: un cambio a esas va aquí o después.

### Push

| RPC | Quién | Qué hace |
|---|---|---|
| `upsert_push_subscription(p_endpoint, p_p256dh, p_auth, p_ua='') → uuid` | la cuenta | Solo `https://` de FCM, Apple, Mozilla o `*.notify.windows.com` (23514). El mismo teléfono con otra cuenta pasa a la cuenta nueva. |
| `delete_push_subscription(p_endpoint) → boolean` | la cuenta | Solo las suyas. |
| `set_push_prefs(p_prefs jsonb) → {resultados, social, recordatorios, liga}` | la cuenta | Solo las que cambian, con `true`/`false` (otra clave, otro tipo o algo que no sea objeto: `invalido`). Devuelve las cuatro como quedaron. Ver «Avisos al teléfono». |

### Servicio (solo `service_role`, la clave secreta: Edge Functions, cron y GitHub Actions)

| RPC | Quién la llama | Qué hace |
|---|---|---|
| `ping() → timestamptz` | keepalive.yml | Escritura real para «mantener despierto» el proyecto gratis. |
| `scan_begin(p_user, p_league, p_event, p_key, p_models=null, p_per_minute=null) → jsonb` | `scan-bowling` | Revisa que la cuenta pueda leer fotos en esa liga, busca `p_key` (sha256 de la foto) en la caché de 24 h y cobra el cupo: `{status:'cached', result, model}`, `{status:'ok', model, left}` o `{status:'limit', reason, retry_after, limit}`. |
| `scan_next_model(p_models, p_per_minute=null) → text` | `scan-bowling` | El siguiente modelo de la cadena con cupo en este minuto (null = ninguno). |
| `scan_finish(p_user, p_key, p_model=null, p_result=null, p_refund=false) → void` | `scan-bowling` | Guarda el resultado en la caché; `p_refund` devuelve el cupo del día si ningún modelo respondió. |
| `claim_push_batch(p_limit=50) → setof (id, endpoint, p256dh, auth, title, body, url, tag, urgency, ttl)` | `send-push` | Toma hasta 100 mensajes (los aparta 3 min y sube `attempts`); `ttl` = lo que le queda al aviso. |
| `finish_push_batch(p_results jsonb) → jsonb` | `send-push` | `[{id, outcome, status}]` con `sent`/`expired` (listo), `gone` (borra el teléfono), `retry` (otra vez en 3 min), `failed` (no se reintenta; 3 seguidos borran el teléfono). Devuelve `{remaining, chained}`; si queda cola pide el siguiente lote con pg_net. |
| `purge_queue_take(p_limit=500, p_bucket='scoreboards') → setof (path)` | `purge-photos` | Toma hasta `p_limit` (1–1000) rutas del bucket `p_bucket` (`scoreboards`: fotos borradas, también por borrar un evento o una liga; `logos`: el logo cambiado o quitado, el de una liga borrada, las reservas sin usar; otro: `invalido`) de `private.storage_purge_queue` y las aparta 10 min (sube `attempts`; a los 10 intentos ya no se toman). Antes saca de la cola lo que se volvió a usar, que no se borra: en `scoreboards`, las rutas que otra vez tienen fila en `photos` (la misma foto registrada de nuevo; el trigger `photos_unqueue_purge` también las saca al registrarla); en `logos`, el que es otra vez el logo de una liga. Sin `p_bucket`, solo fotos (así era antes de `20260929001000_sueltos_logos.sql`). |
| `purge_queue_done(p_paths text[], p_bucket='scoreboards') → int` | `purge-photos` | Las rutas ya borradas de ese bucket salen de la cola (las de otro bucket se quedan). Devuelve cuántas. |
| `storage_orphans(p_limit=500) → setof (path)` | `purge-photos` | Archivos de `scoreboards` sin fila en `photos` y subidos hace más de 30 días, lo que `private.op_log` recuerda una operación (la app sube el archivo antes de la RPC que registra la foto, y esa RPC puede esperar semanas en la cola del teléfono; si la subió hace más de 7 días, la vuelve a subir antes de la RPC). Sin esquema `storage`: ninguno. |
| `badge_claim(p_limit=25) → [BadgeJob]` | `insignias` | Toma hasta 50 trabajos vencidos (no `aviso`), sin tomar o tomados hace 10+ min, con menos de 5 intentos. No sube `attempts` (lo sube la foto: lo tomado que no alcanzó a correr no gasta intentos). `BadgeJob` = `{id, kind, league_id, user_id, ref, payload, run_after, attempts, created_at}`. |
| `badge_snapshot(p_job bigint) → BadgeSnapshot \| null` | `insignias` | La foto de datos del trabajo (ver «Motor de insignias»); pedirla es probar el trabajo: sube `attempts`. null si ya no existe. |
| `badge_apply(p_job bigint, p_decisions jsonb) → jsonb` | `insignias` | Aplica `BadgeDecision[]` en una transacción y borra el trabajo: `{ok: true, awarded, reactivated, upgraded, updated, revoked, reviews, adopted, progress, skipped, notices}`. Si algo no sirve, nada se aplica y el trabajo vuelve a la cola: `{ok: false, error}`. |
| `badge_fail(p_job bigint, p_error text, p_charge boolean=false) → void` | `insignias` | El motor no pudo con ese trabajo: vuelve en 2^intentos minutos con el error (a los 5 intentos ya no se toma). `p_charge`: falló la foto (que es la que cuenta el intento): se cuenta aquí. |
| `badge_release(p_job bigint) → void` | `insignias` | Se tomó y no alcanzó a correr (sin tiempo o sin CPU): vuelve ya, sin espera, sin error y sin gastar un intento. |
| `badge_finish() → {remaining, chained, notices}` | `insignias` | Al terminar la corrida: manda los avisos que tocan y, si queda cola vencida, se vuelve a llamar con pg_net. |

**Tareas de pg_cron** (solo Supabase; las funciones corren también en PGlite y tienen pruebas):

| Tarea | Cuándo (UTC) | Qué corre | Archivo |
|---|---|---|---|
| `mm-recordatorios` | cada 15 min | `private.cron_reminders()` = `enqueue_due_reminders(now)` + `send-push` | `20260926001300_cron_supabase.sql` |
| `mm-limpieza` | 08:30 | `private.cleanup_old_rows()` | `20260926001300_cron_supabase.sql` |
| `mm-despierto` | 14:00 | ping a `send-push` | `20260926001300_cron_supabase.sql` |
| `mm-escaleras` | cada 15 min | `private.ladder_expire_all()` (plazos vencidos de la escalera) | `20260927000790_raqueta_cron_supabase.sql` |
| `mm-consola-limpieza` | 08:40 | `private.console_cleanup()` | `20260927001190_consola_supabase.sql` |
| `mm-partidos` | cada 15 min | `private.cron_match_reminders()` | `20260927001290_avisos_supabase.sql` |
| `mm-despues-del-juego` | 13:00 (9:00 am en RD) | `private.remind_after_bowling()` | `20260929000510_avisos_telefono_supabase.sql` |
| `mm-partidos-sin-resultado` | cada hora, minuto 17 | `private.remind_missing_results()` | `20260929000510_avisos_telefono_supabase.sql` |
| `mm-limpiar-fotos` | 08:30 | `private.kick_function('purge-photos')`: la Edge Function `purge-photos` por pg_net | `20260929000510_avisos_telefono_supabase.sql` |
| `mm-alerta-espacio` | 12:00 | `private.check_storage_alert()` | `20260929000510_avisos_telefono_supabase.sql` |
| `mm-logos-limpieza` | 08:50 | `private.logo_uploads_cleanup()` (reservas de logo sin usar de hace más de un día → cola de Storage) | `20260929001010_logos_supabase.sql` |
| `mm-insignias` | cada 10 min | `private.cron_badges()`: los avisos de insignias y, si hay trabajos vencidos, la Edge Function `insignias` por pg_net (`private.kick_badges()`) | `20260929001190_insignias_cron_supabase.sql` |
| `mm-insignias-diario` | 04:30 (00:30 en RD) | `private.badges_daily(now())` (ver «Motor de insignias») | `20260929001190_insignias_cron_supabase.sql` |

Las que llaman Edge Functions usan pg_net y los secretos de Vault `project_url` y `cron_secret` (el mismo secreto es
`CRON_SECRET` en las funciones y va en la cabecera `x-cron-secret`).

**Edge Functions**: `send-push` (cola de push), `scan-bowling` (lectura de fotos), `delete-account` (borrar la cuenta),
`insignias` (el motor de las insignias, ver «Motor de insignias») y `purge-photos` (cada día, bucket por bucket: `purge_queue_take` → borra de ese bucket → `purge_queue_done`, primero
las fotos de `scoreboards` sin `p_bucket` y después los logos con `p_bucket` `logos`; al final `storage_orphans` y
los borra también; lógica en `functions/purge-photos/core.ts`, pruebas en `src/lib/purgePhotosFunction.test.ts`). Las
que llama el cron revisan `x-cron-secret`.

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
| Insignias (`src/lib/data/badges.ts`): `useProfileBadges` / `useBadgeNotices` / `useBadgeProgress` / `useBadgeStats` / `useLeagueAwards` / `usePlayerAwards` | `profile_badges` / `badge_notices` / `select badge_progress` / `select badge_stats` / `select badge_awards` (liga o jugador) |
| `setFeaturedBadges` / `setBadgeHidden` / `markBadgesSeen` / `setBadgesAuto` / `reviewBadge` / `reportBadge` | `set_featured_badges` / `set_badge_hidden` / `mark_badges_seen` (de 50 en 50) / `set_badges_auto` / `review_badge` / `report_badge` |
| `markLeagueBadgesSeen` / `setLeagueBadgeHidden` (las del creador) | `mark_league_badges_seen` / `set_league_badge_hidden` |

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
| `user:<uid>` | `like` | `{op, kind, id}` | me gusta (o quitarlo) en un juego suyo (`kind` `solo`: un juego suelto) |
| `user:<uid>` | `solo` | `{id, op}` | uno de sus juegos sueltos se creó, cambió o se borró |
| `league:<id>` | `claims` | `{id, status}` | reclamos de jugadores de la liga (pedido, aprobado, rechazado, cancelado) |
| `user:<uid>` | `claims` | `{id, status, league_id}` | su reclamo cambió |
| `user:<uid>` | `invites` | `{id, status, league_id}` | una invitación a una liga que recibió o que mandó (nueva, aceptada, rechazada, cancelada) |
| `league:<id>` | `invites` | `{id, status}` | invitaciones a la liga |
| `event:<id>` | `lanes` | `{op}` | pistas del boliche del evento (una vez por sentencia) |
| `league:<id>` | `seasons` | `{op, ids}` | temporadas de la liga y sus premios (los premios avisan `update` de su temporada) |
| `league:<id>` | `playoffs` | `{op, ids}` | playoffs y sus series (las series avisan `update` de su playoff); los juegos, como cualquier partido |
| `league:<id>` | `badges` | `{op, ids, kind: 'app'}` | insignias automáticas que se ven en la liga (…1110, `private.emit_badges`): nuevas provisionales o firmes, y cambios de estado, de oculta o de nivel (que el dueño la vea no avisa) |
| `user:<uid>` | `badges` | `{op, ids, kind: 'app'}` | cualquier cambio de sus insignias automáticas (de la cuenta o de sus jugadores): nuevas, firmes, vistas, ocultas, retiradas |
| `league:<id>` | `badges` | `{op, ids, kind: 'diseno'\|'liga'}` | insignias del creador (…1120): un diseño que se crea, cambia o borra (`diseno`); un otorgamiento que se da, se retira, se oculta o se muestra (`liga`) |
| `user:<uid>` | `badges` | `{op, ids, kind: 'liga'}` | cualquier cambio de los otorgamientos del creador a sus jugadores (también verlos) |

`op` = `insert` \| `update` \| `delete`. Salvo `live`, el mensaje solo dice qué cambió: volver a leer esas filas.
Quién escucha (Supabase, `realtime.messages`): `event:`/`league:` quien ve la liga; `user:<uid>` solo esa
cuenta. Nadie puede enviar (no hay política de INSERT). Borrar una liga no manda avisos.

## Storage (solo Supabase)

Bucket privado `scoreboards`, 1 MB, `image/webp` o `image/jpeg`. Leer: quien ve la liga. Subir: admin,
anotador o miembro con jugador en una liga sin menores (`private.can_upload_photo_path`). Borrar: admins
de la liga. Sin actualizar. En local, `BackendStorage` guarda el archivo por su cuenta; `photos.path` es la clave.

Bucket **público** `logos` (`20260929001010_logos_supabase.sql`), 256 kB, `image/webp`, `image/jpeg` o `image/png`:
el logo de cada liga o torneo en `'<liga>/<uuid>.webp|.jpg'` (cada logo nuevo es un archivo nuevo). Se muestra con la
URL pública (cualquiera con el link lo ve). Subir: dueño o admin de la liga sin bloquear, solo en una ruta que
reservó con `begin_logo_upload` (30 por día; `private.can_upload_logo_path`): nadie guarda archivos sin pasar por ese
límite. Leer por la API (listar, y lo que Storage pide para borrar) y borrar: los admins de la liga sin bloquear y,
de lo que ya no usa nadie (en `private.storage_purge_queue` con bucket `logos`), cualquier cuenta sin bloquear
(`private.can_remove_logo_path`). Sin actualizar. Después de subir, `set_league_logo`; la ruta anterior que devuelve se
borra de Storage. Lo que deja de usarse (el anterior, el de una liga borrada y las reservas sin usar de un día, que
pasa a diario `private.logo_uploads_cleanup` con pg_cron) queda en la cola; al borrar la liga, el teléfono borra su
logo justo después. Lo que nadie borró lo borra `purge-photos` al otro día (`purge_queue_take` con `p_bucket` `logos`).

## Motor de insignias

`20260929001110_insignias_motor.sql` (pruebas: `tests/sql/insignias-motor.test.ts`; diseño: `docs/insignias.md` §3)
y `…001180_insignias_temporadas.sql` (solo si existe `public.seasons`). El cron va en
`…001190_insignias_cron_supabase.sql`: `mm-insignias` cada 10 min → `private.cron_badges()` (avisos y, si hay
trabajos vencidos, `private.kick_badges()` llama a la Edge Function `insignias` con pg_net, como `kick_send_push`)
y `mm-insignias-diario` a las 04:30 UTC (00:30 de Santo Domingo) → `private.badges_daily(now())`.

**Una corrida de la Edge Function** (`supabase/functions/insignias`, clave secreta): `badge_claim(5)` de a 5 hasta 25
(`{"limit": n}` en el cuerpo: 1 a 50); por trabajo `badge_snapshot(id)` → `evaluateJob(job, snapshot, snapshot.now)`
(el motor puro de `src/badges` empaquetado en `supabase/functions/_shared/badges-engine.gen.js`) →
`badge_apply(id, decisiones)`; si la foto, el motor o aplicar fallan, `badge_fail(id, motivo)` (`foto: HTTP 500
(57014)` con `p_charge`, `motor: TypeError: …`, `aplicar: …`). Corta a los 100 s o con ~1,2 s de CPU del motor
(Supabase corta a los 2 s de CPU): lo tomado que no alcanzó vuelve con `badge_release(id)`. Al final `badge_finish()`. Las
funciones de `private` llevan además `p_now` (las pruebas fijan la hora). De punta a punta con el motor empaquetado:
`tests/sql/insignias-funcion.test.ts`.

**El motor empaquetado**: Deno no acepta los imports de `src` (sin extensión), así que `pnpm badges:bundle`
(`scripts/badges/bundle.mjs`, rolldown de Vite) arma un solo ESM sin imports desde `src/badges/edge.ts`, con el hash
del código fuente en la cabecera. `src/badges/bundle.test.ts` falla si quedó viejo: cada cambio del motor (catálogo,
reglas, evaluadores o los helpers de `src/lib` y `src/sports` que usan) va con el archivo generado de nuevo.

### Trabajos (`private.badge_queue`)

Uno por `(kind, league_id, user_id, ref)` mientras no se tome: lo repetido se junta (`payload.players` y
`payload.users` se suman; la hora queda en la más temprana, salvo `evento`: la más tardía). `payload.players` /
`payload.users`: jugadores y cuentas que tocó el cambio (los borrados los guardan porque la fila ya no existe).

| kind | Lo encola | ref | Liga · cuenta |
|---|---|---|---|
| `resultado` | participación con juegos contados nueva o cambiada (puntaje, marca, cuadros); partido que queda final (confirmado o W.O.: ya; propuesto: `run_after` = `proposed_at` + 48 h); reto de escalera jugado; ronda de golf cerrada; encuentro finalizado | `entry:<id>`, `match:<id>`, `round:<evento>`, `meet:<evento>` | liga |
| `revisar` | participación que pierde sus juegos contados o se borra; partido que deja de contar (anulado, reclamado, borrado) o cambia su alineación; tarjeta de una ronda cerrada que cambia o se borra; ronda reabierta; encuentro reabierto o resultado borrado | igual, más `card:<id>`, `event:<id>` (se borró el evento) y `player:<id>` (se borró el jugador) | liga |
| `evento` | torneo de boliche (`badges_daily`, 3+ días después); final de un cuadro de raqueta o equipos (+48 h desde que cuenta); ronda de golf cerrada (+24 h; y el torneo de varias rondas al cerrar la última: `gt:<id>`); encuentro de natación finalizado | `event:<id>`, `gt:<torneo de golf>` | liga |
| `noche` | americano o mexicano cerrado (`badges_daily`: fecha pasada, todo final, 24 h desde el último resultado) | `event:<id>` | liga |
| `cajas` | `save_box_month` cierra un mes (trigger en `events.config`) | `box:<evento>:<n>` · payload `{n, month}` = el mes completo (cajas y `moves`) antes de podarlo | liga |
| `escalera` | `badges_daily` los días 1 y 2: la foto de los puestos; corre el día 3 a las 00:05 | `ladder:<evento>:<YYYY-MM>` · payload `{month, rungs: [{entrant_id, player_id, team_id, position}]}` | liga |
| `mes` | `badges_daily` el día 3 (hasta el 10 recupera lo que no corrió), por el mes anterior: ligas `kind='liga'` y cuentas con actividad ese mes | `YYYY-MM` | liga o cuenta |
| `anio` | `badges_daily` el 7 de enero (hasta el 31 recupera), por el año anterior | `YYYY` | liga o cuenta |
| `temporada` | una temporada queda `closed` (…1180) | `season:<id>` | liga |
| `cuenta` | `badges_daily`: cuentas con actividad, felicitaciones o servicio de hace 2 días, dueños de esas ligas y aniversarios | `YYYY-MM-DD` (el día de la corrida) | cuenta |
| `vinculo` | `players.user_id` cambia (reclamo, `link_account_to_player`, `unlink_account`, salir de la liga) y `merge_players` (`badge_signal('merge')`) | `player:<id>` · payload `{players, unlinked?, merged?}` | liga · cuenta (la nueva y la vieja) |
| `historial` | `badges_backfill` | `league:<id>` · payload `{dry_run, run_id, from?, to?}`; o `user:<id>` (lo de cuenta y comunidad de esa cuenta). En seco, con `:seco` al final: nunca se junta con una corrida de verdad que siga en la cola | liga o cuenta |
| `aviso` | `badge_apply` y `review_badge` (vía `badge_signal`); lo resuelve SQL (`badge_send_notices`), nunca el motor | `push` o `historial` | cuenta |

Los triggers nunca frenan la escritura (si algo falla, un `warning`) y no encolan nada al borrar una liga. Juntar
jugadores (`merge_players`) no encola por cada fila movida: avisa una vez con `badge_signal('merge')`.
`private.badge_runs` anota los periodos hechos (`kind`, liga o `u:<cuenta>`, `ref`): un periodo (`evento`, `noche`,
`cajas`, `escalera`, `mes`, `anio`, `temporada`) corre una sola vez (§3.4: lo que se dio no cambia si después se
corrige la final, se reabre la ronda o el encuentro o se cierra otra vez la temporada). `badge_enqueue` no lo vuelve
a encolar y, si igual entró otro mientras corría, `badge_apply` no aplica nada (`{ok, done: true}`). Un periodo que
quedó muerto (5 intentos) vuelve a tener chance cuando `badges_daily` lo pide otra vez (intentos en 0).

### La foto (`badge_snapshot`, contrato en `src/badges/snapshot.ts`)

Siempre: `{v: 1, now, job, sport, period, leagues, members, profiles, players, league_months, awards, progress}`.
- `job`: el trabajo (`BadgeJob`). `sport`: el de la liga del trabajo (null en los de cuenta). `period`: `{from, to}` del mes, año, temporada o mes de la escalera (null en los demás).
- `leagues`: `SnapLeague` de toda liga que aparece. `members`: owner, admins y anotadores de esas ligas, más todas
  las membresías de las cuentas del trabajo. `profiles`: `SnapProfile` (`bowlingx`, `first_import_on`) de toda cuenta
  que aparece (jugadores, staff, `league_months`). `players`: `SnapPlayer` de todo jugador que aparece, con
  `verified_only` (`private.badge_verified_only`): la cuenta se vinculó ella misma (dueño o admin: su reclamo al
  instante, `link_account_to_player` con su cuenta, `ensure_player`; `private.badge_self_links`) o su reclamo lo aprobó
  ella misma. En todo trabajo, para las de cuenta, de ese jugador solo cuenta lo verificado (§1.6).
- `league_months`: `LeagueMonthActivity` de cada liga que aparece, todos sus meses (hasta el fin del periodo): la base
  de «liga real». Sale de `private.badge_activity`.
- `awards` y `progress`: las filas (`to_jsonb`) de los dueños del trabajo (sus jugadores y sus cuentas), en cualquier
  estado.
- Marcas de boliche que cuentan (`private.badge_mark_ok`, lo mismo que `markKind` del motor): el id (uuid) de la foto,
  `'importado'` o `'sin-foto'`. Otra marca (la base acepta cualquier texto de 1 a 64) no es actividad ni encola.
- Filas del deporte (`to_jsonb` de cada fila, snake_case; solo las listas del deporte de la liga):
  boliche `events`, `entries`, `submissions` (solo aprobadas de jugadores que son juez y parte), `teams`; raqueta y
  equipos `events` (con `config`), `matches` (sin `state`), `match_sides`, `match_players`, `match_officials`,
  `teams`, `team_players`, `sanctions` (fútbol y sala), `ladder_challenges` (raqueta); golf `events`, `golf_rounds`,
  `golf_cards` (todas las de esas rondas: marcadores y tabla); natación `events`, `swim_meets`, `swim_events`,
  `swim_entries` (todas las de esos encuentros: grupos, lugares, récords), `swim_clubs`.

Qué filas trae cada tipo («carrera» = todo lo de esos jugadores y de los demás jugadores de sus cuentas en el
deporte, en todas sus ligas):

| kind | Filas del deporte | Además |
|---|---|---|
| `resultado`, `revisar` | carrera de los jugadores que tocó (del partido: los dos lados y sus plantillas) | — |
| `vinculo` | carrera del jugador y de la cuenta | `activity` de la cuenta (todos los deportes) |
| `evento` | el evento entero (`gt:` todas sus rondas) y la carrera de quienes jugaron hasta esa fecha; natación: todo lo de la liga hasta esa fecha (récords) | — |
| `noche`, `cajas`, `escalera` | solo el evento (sin carreras) | `escalera`: `ladder_rungs` (la foto del día 1 con `event_id` y `league_id`) |
| `mes`, `anio` (liga) | lo de la liga desde 400 días antes del periodo hasta su fin, y la carrera (hasta el fin) de quienes jugaron en el periodo | `anio`: `seasons`, `season_awards` de la liga en el año |
| `mes`, `anio` (cuenta) | boliche y golf de sus jugadores hasta el fin del periodo (Tu mejor mes) | `activity` de la cuenta hasta el fin del periodo |
| `temporada` | lo de la liga desde 400 días antes de `starts_on` hasta `ends_on` y la carrera de quienes jugaron en la temporada o tienen un premio; baloncesto: cada partido con `has_state` y `fouls: [{side, kind, player}]` (técnicas, antideportivas y descalificantes de `matches.state`) | `seasons`, `season_awards`; `activity`: el primer día activo de cada cuenta en el deporte (Revelación); `service` del dueño y los admins en la temporada |
| `cuenta` | — | `activity` de la cuenta (todos los deportes) y, de los jugadores de sus ligas (dueño) y de los que felicitó, sus primeros 3 días por liga; `cheers`; `service` |
| `historial` (liga) | la liga entera (o `payload.from`–`to`) y la carrera de sus jugadores | `activity` de sus cuentas y jugadores; `cheers`; `service` |
| `historial` (cuenta) | boliche y golf de sus jugadores (Tu mejor mes) | como `cuenta` (`activity`, primeros días de los jugadores de sus ligas y de los que felicitó, `cheers`, `service`, sus ligas) y `targets: []` (las carreras van en el de la liga) |

- `activity`: `ActivityDay[]` `{sport, league_id, player_id, user_id, date, official, roster}` calculado en SQL
  (`private.badge_activity`, lo mismo que `bowlingActivity` … `swimActivity`): boliche B1 con juez y parte (sin foto
  del owner, admin o anotador solo si otra cuenta aprobó el envío); raqueta R1 o W.O. a favor (oficial: se confirma,
  no es de puntos, suelto o de liga, torneo, cajas o escalera); equipos T1 por alineación, línea de baloncesto o
  línea de fútbol con «jugó», o la plantilla si el partido no tiene ningún dato (`roster: true`); golf G1 (oficial
  con 3+ tarjetas G1); natación ok con tiempo, dq o dnf en encuentros finalizados (oficial: encuentro o torneo).
- `cheers`: `{by, league_id, player_id, user_id, at, kind: 'reaction'|'like'}` (felicitaciones y me gusta que dieron
  esas cuentas a juegos de otros). `service`: `{user_id, league_id, date, kind: 'match'|'submission'|'swim'|'golf',
  ref}` (Mesa técnica: partidos que dejó finales o de los que fue oficial sin jugadores propios, envíos de otros que
  aprobó, resultados de natación de otros, rondas de golf de 4+ tarjetas que cerró). `by` y `user_id` van además del
  contrato de `snapshot.ts` (en `historial` hay muchas cuentas).

### Decisiones (`badge_apply`)

`BadgeDecision[]` planas (`src/badges/types.ts`), más `adopt`:
- `award {badge_key, sport, level, period_key, player_id+league_id | user_id, status 'provisional'|'firme', refs,
  context, hidden?}`: nueva (provisional: `firm_at` = +7 días; `hidden` = privada por defecto, nunca avisa). Si ya
  existe: revocada por `evidencia` → se reactiva (avisa otra vez); por `aval` o `fraude` → no vuelve; provisional →
  se actualizan `refs` y `context`, o sube a firme; firme → no cambia; en revisión → no cambia (un `award` no se salta
  un aval), salvo que cambie la cara (`context.alt`: el albatros corregido a águila): sale de revisión y avisa.
- `review {…, refs, context, reviewers}`: nace `en_revision`; push «Hay una hazaña por confirmar» (tag
  `insignia-aval:<id>`) a los dueños y admins que pasan `private.badge_can_review` (no a los que diga el motor), nunca
  en ligas con menores ni a cuentas bloqueadas. Confirmada con `review_badge`, avisa al jugador. Sobre una provisional
  (el águila corregida que resultó albatros): pasa a `en_revision`, sin `firm_at` y fuera de las destacadas.
- `revoke {…, reason 'evidencia'}`: solo provisionales y en revisión (las firmes no); sale de las destacadas; sin push.
- `progress {badge_key, sport, dueño, value, target, next_level | null}`: null borra la fila.
- `adopt {badge_key, sport, level, period_key, player_id, league_id, user_id}`: la copia de respaldo del jugador
  (insignia de cuenta ganada sin cuenta, §1.6) pasa a su cuenta (`players.user_id` tiene que ser esa) con tombstone
  en la liga; si la cuenta ya la tenía, queda una (el mejor estado, el `awarded_at` más viejo) sin aviso nuevo. La
  arma el motor (`decide` en `src/badges/engine.ts`) para toda copia de respaldo de la foto cuyo jugador ya tiene
  cuenta, antes que lo demás; con `players[].verified_only` solo junta lo que la cuenta ya tiene o gana en esa
  corrida (lo provisional que no, se retira; lo firme se queda en el jugador). Queda oculta si alguna de las dos lo
  estaba. También borra el progreso del jugador.
- Jugador que ya no existe o no es de esa liga, cuenta que ya no existe: se salta. Cualquier otra cosa que no sirva
  (kind, key, deporte, nivel, periodo, dueño, estado): nada se aplica y el trabajo vuelve a la cola.
- `context` queda con `v: 1`. **Para los push**, el motor pone `context.name` (el nombre ya resuelto por deporte y
  nivel, «Constancia», «Club 225») y `context.level_name` (el propio del nivel o el metal: «oro»); sin eso el push dice
  «Insignia». Los pone `src/badges/edge.ts` (`withPushLabels`) en todo `award` y `review`, si el evaluador no los puso.
- `historial`: todas con `context.historial = true` y `notified_at` (sin push por cada una); en seco
  (`payload.dry_run`) no escribe insignias: `private.badge_dry_holders` y `private.badge_dry_runs` (`run_id`).

### Avisos y la tarea diaria

- `badge_apply` encola un `aviso` por cuenta con algo nuevo que se puede avisar (provisional o firme, no oculta, no de
  una liga con menores, jugador con cuenta no bloqueada). `badge_send_notices` (lo llaman `cron_badges` y
  `badge_finish`) arma un push por cuenta con todo lo no avisado: «¡Te ganaste una insignia!» / «Constancia · oro en
  Liga Los Pinos. Tócala para verla.» o «¡Te ganaste 3 insignias!» / «Club 225 (plata), Kilometraje (bronce) y 1
  más.», tag `insignias`, url `/u/<cuenta>?tab=insignias`. Nunca entre 9:00 pm y 8:00 am (Santo Domingo): espera a
  las 8:00; como mucho uno cada 6 h por cuenta (lo que llega en medio sale junto en el siguiente). Del historial:
  «¡Tus insignias llegaron!» / «Te dimos {n} insignias por tu historial. ¡Míralas!», 30 min después del último trabajo.
- `badges_daily(p_now)`: provisionales con 7 días → firmes (salvo las de quien tiene un `resultado` o `revisar` sin
  aplicar: vencido, tomado, con espera o muerto; no los que esperan sus 48 h); podios de boliche; noches cerradas; foto de las
  escaleras (días 1 y 2); meses (días 3 a 10); años (7 al 31 de enero); cuentas; rareza
  (`badge_stats_refresh`: cuentas con la insignia sobre cuentas con un día activo en el deporte en 365 días, sin
  ligas con menores ni cuentas bloqueadas; base < 50 = `nueva`); limpieza del motor (`badge_cleanup`: trabajos de 5
  intentos de 30+ días, periodos de 400+, corridas en seco de 90+). No cierra temporadas. Idempotente.
- Trabajos con 5 intentos: se quedan en `private.badge_queue` con `last_error` para la consola del superadmin.

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
También lo que un admin de liga no puede deshacer: `merge_players` {keep, drop, keepName, dropName, userId}
(target `league`).

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
| `admin_storage_usage() → {dbBytes, dbLimit, storageBytes, storageLimit, dbPct, storagePct, lastAlertAt, purgePending}` | superadmin | Uso del plan gratis (`private.storage_usage()`: base 500 MB con `pg_database_size`, archivos 1 GB con `metadata.size` de `storage.objects`; porcentajes con un decimal), la última alerta de espacio (ISO o null) y cuántas rutas faltan por borrar de Storage (fotos y logos: toda la cola de `purge-photos`). `admin_overview` no cambia. |
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

## Avisos al teléfono

`20260929000500_avisos_telefono.sql` (pruebas: `tests/sql/avisos-telefono.test.ts`). Todo entra por `push_outbox` (una
fila por cuenta que `push_outbox_fanout` reparte a sus 5 teléfonos más nuevos) y sale con `send-push`.

**Preferencias.** `profiles.push_prefs` (`set_push_prefs`). El trigger `push_outbox_prefs` descarta la fila de cada
teléfono si la cuenta apagó la categoría de su tag, también en los avisos que ya existían:

| Categoría | Tags |
|---|---|
| `resultados` | `envio:` (envíos del boliche), `confirmar:` (resultado por confirmar), `resultado:` (confirmado), `reclamo:` |
| `social` | `reaccion:` (felicitaciones y me gusta), `comentario:`, `seguir:`, `insignias` (te ganaste insignias, agrupadas) e `insignia:` (una insignia que te dio la liga): `20260929001110_insignias_motor.sql` |
| `recordatorios` | `recordatorio:` (boliche, golf, natación, noches), `partido:`, `despues:`, `sinresultado:`, `pista:` (tu pista en el boliche: `20260929000600_organizador.sql`) |
| `liga` | `aviso:` (avisos del admin a su liga), `temporada:` (terminó la temporada: `20260929000700_temporadas.sql`), `invitacion:` (te invitaron a una liga), `invitacion-ok:` (aceptaron tu invitación) |

Sin categoría (salen siempre): `claim:`, inscripciones, escalera, `ronda:`, `anuncio:` (superadmin), `espacio`,
`reporte:` (reportes nuevos para moderar, a los superadmins: `20260929000900_legal.sql`) e `insignia-aval:` («Hay una
hazaña por confirmar», al dueño o admin que puede dar el aval: solo él la resuelve, como un `claim:`).

**Encolar**: `private.queue_push(p_user, p_category, p_title, p_body, p_url, p_tag, p_ttl, p_group_title=null) → boolean`.
No encola si la cuenta está bloqueada, no tiene teléfonos o apagó la categoría; no repite un tag que sigue sin
mandar; con `p_group_title` le cambia el texto al que todavía espera («Ana y 2 más…»). Nunca falla (warning) y llama a
`send-push` (salvo dentro de un lote: `mm.push_batch = 'on'`, y se llama una vez al final). Urgencia `normal`.

**Qué avisa** (solo lo que hace una cuenta con sesión: la importación de BowlingX y el SQL a mano no avisan; nunca a
uno mismo):

| Cuándo | A quién | Texto | Tag · link |
|---|---|---|---|
| Envío del boliche aprobado | cuenta del jugador y quien lo envió, si sigue en la liga (no quien lo revisa) | «Aprobaron tus juegos: serie de 650 en <liga>» · «Aprobaron tu juego de 210 en <liga>» (quien lo envió por otro: «Aprobaron los juegos de <jugador>: …»); texto: «Práctica del 22 de septiembre.» | `envio:<envío>` · `/l/<liga>/e/<evento>` |
| Envío rechazado | igual | «No aprobaron tus juegos del 22 de septiembre» (un juego: «tu juego»); texto: «<liga>. Motivo: «<nota>»» o «<liga>. Si crees que es un error, habla con el admin.» | `envio:<envío>` · evento o `/l/<liga>` |
| Felicitación o me gusta (boliche) | cuenta del jugador | «Ana te felicitó por tu serie de 650» · «A Ana le gustó tu juego»; juntos: «Ana y 3 más te felicitaron…», «A Ana y 3 más les gustó tu juego», mezclados «Ana y 3 más reaccionaron a…» | `reaccion:<participación>` · `/l/<liga>/juegos?juego=<participación>` |
| Comentario (boliche) | cuenta del jugador | «Ana comentó tu juego: «<los primeros 80>»» (si el anterior espera, sale el último; si ya salió, el siguiente después de 30 minutos) | `comentario:<participación>` |
| Me gusta en partido, golf o natación | cuenta del jugador | «A Ana le gustó tu partido» (ronda, prueba), juntos igual | `reaccion:<juego>[:<jugador>]` |
| Resultado confirmado (o reclamo resuelto) | lado que lo anotó (raqueta: jugadores y pareja; equipos: capitán y delegado) y quien lo anotó, si sigue en la liga; no quien confirma | «Confirmaron el resultado»; texto «A contra B: 6-4 6-3. Ya cuenta en la tabla.» (o «El organizador resolvió el reclamo.») | `resultado:<partido>` · `/l/<liga>/juegos?partido=<partido>` |

Me gusta y felicitaciones: como mucho un aviso nuevo por juego cada 6 horas (mientras el anterior espera, se le cambia
el texto). Proponer un resultado («Tienes un resultado por confirmar», `confirmar:`) y reclamarlo («Reclamaron un
resultado», `reclamo:`) ya avisaban desde `partidos.sql` y `avisos.sql`.

**Recordatorios** (funciones de `private`, las corre pg_cron; `p_now` para las pruebas; devuelven cuántos salieron):

- `remind_after_bowling(p_now)`: eventos del boliche de ayer (hora de la liga), a cada jugador con cuenta que marcó
  «voy» y no tiene ningún juego anotado en el evento ni un envío de ese evento o fecha: «¿Cómo te fue anoche? Sube tus
  juegos de <liga>», link `/l/<liga>/e/<evento>?anotar=1`, tag `despues:<evento>:<jugador>`. Una vez (`private.push_once`).
- `remind_missing_results(p_now)`: partidos programados (o en vivo sin anotador activo) de los últimos 3 días que
  empezaron hace 3 horas o más, sin resultado y que no son noches de americano o mexicano: «¿Cómo quedó A vs B?» a
  quienes lo pueden anotar desde un lado (raqueta: jugadores y pareja; equipos: capitán y delegado) y al anotador;
  tag `sinresultado:<partido>`. Una vez por partido. De 10:00 pm a 8:00 am (hora de la liga) no avisa ni deja la marca:
  el partido de las 9:00 pm sale en la corrida de las 8 de la mañana.
- `enqueue_due_reminders(p_now)` (el de siempre del boliche): el del día antes («¿Vas? Confírmalo en la app.») ya no
  le llega a quien marcó «voy» en ese evento.

**Espacio.** `private.storage_usage()` y `private.check_storage_alert(p_now)`: si la base o los archivos van por el 70 %
o más del plan gratis y no se avisó en 3 días (`private.storage_alerts`), push a cada superadmin «El espacio de
MatchMate va por 72 %» con el link `/superadmin/sistema`. Solo cuenta como aviso si se encoló al menos un push (sin
ningún superadmin con teléfono, lo intenta otra vez al día siguiente). El correo queda para cuando haya SMTP.

## Organizador

`20260929000600_organizador.sql` (pruebas: `tests/sql/organizador.test.ts` y `tests/sql/pistas.test.ts`). Todo en
`jsonb` camelCase; horas en texto ISO (`private.iso`), días `'YYYY-MM-DD'` en la zona de la liga.

**Ligas públicas.** `public_leagues_feed(p_sport text=null, p_query text=null, p_limit=30, p_offset=0) → Item[]`
(también sin cuenta; sin cuenta, 120 llamadas cada 10 minutos por IP: `rate_limited`). Solo ligas públicas sin
menores que siguen vivas: fuera la liga cuya `season_end` ya pasó y el torneo cuyo último evento o partido (o, si no
tiene, su `season_end`) fue hace más de 7 días. Orden: actividad de los últimos 30 días (participaciones y envíos,
partidos terminados, tarjetas de golf, tiempos de natación y eventos del mes), después más miembros, después las más
nuevas. `p_query` busca en nombre y lugar sin acentos; `p_limit` 1–50, `p_offset` 0–5000. `Item` = `{id, name,
sport, kind, logoPath, venue, schedule, members, players, activity, nextEventAt, nextEventDate, lastActivityAt,
seasonEnd, createdAt}` (`logoPath`: el logo de la liga, desde `20260929001000_sueltos_logos.sql`, o null):
`nextEventAt` = el próximo evento (a su `start_time`, o a las 00:00 de la liga si no tiene) o partido
programado, lo que venga antes; `nextEventDate` = ese día en la zona de la liga. La línea «24 jugadores · juega el
martes» la arma el teléfono con `players` y `nextEventDate`.

**Tope de ligas nuevas.** Trigger `leagues_quota` (BEFORE INSERT en `leagues`): con sesión y sin ser superadmin,
hasta 5 ligas o torneos por día (`rate_limited`) y 20 cada 30 días (`rate_limited: mes`: el teléfono no dice
«prueba mañana»). Cuenta lo creado (borrar la liga no lo devuelve), en `private.league_creations`. Sin sesión
(`service_role`: el importador de BowlingX, `scripts/migrar`; SQL) no cuenta.

**Pendientes.** `league_pending(p_league) → {total, submissions, disputes, overdue, claims, waitlists, checklist}` ·
admin. Cada sección es `{count, url, items}` con hasta 5 (lo más viejo primero):
- `submissions`: envíos por aprobar `{id, playerId, playerName, eventId, eventName, date, games, hasPhoto,
  createdAt}`; `url` `/l/<liga>/admin?tab=aprobar`.
- `disputes`: partidos reclamados `{id, label ('Rojos vs Azules'), sides, scheduledAt, disputedAt, note, url
  ('/l/<liga>/juegos?partido=<id>')}`.
- `overdue`: partidos programados, en juego o suspendidos cuya hora pasó hace más de 3 horas, sin anotador activo
  `{id, label, sides, status, scheduledAt, url}`.
- `claims`: reclamos pendientes `{id, playerId, playerName, claimantName, note, createdAt}`; `url`
  `/l/<liga>/admin?tab=reclamos`.
- `waitlists`: eventos de hoy en adelante con lista de espera `{eventId, name, date, waiting, url ('/l/<liga>/e/<id>')}`.
- `checklist`: solo los primeros 30 días de la liga (después, null): `{complete, done, total, steps: [{key, label,
  done, url}]}` con `invite` (más de un miembro), `players` (más de un jugador), `schedule` (un evento o partido) y
  `result` (un juego, partido terminado, tarjeta de golf o tiempo).

`total` = la suma de los `count` (el número de la pestaña Admin).

**Suspender un día.** Los dos · admin.
- `suspend_day_preview(p_league, p_date) → {date, matches, events, counts, withNewDate, withoutDate}` (no cambia
  nada): `matches` = `[{id, label, sub ('racket'|'team'), status, scheduledAt, locked, reason}]` (los partidos de ese
  día en la zona de la liga, sin los anulados); `events` = `[{id, label, sub ('bowling'|'golf'|'swim'|'event'),
  startTime, locked, reason, content}]`; `locked` = no se toca (`reason` `'en_juego'` o `'con_resultado'`);
  `content` = el evento tiene algo que se perdería al borrarlo (inscritos, envíos, fotos, en vivo, «voy», equipos del
  evento, tarjetas, programa o nadadores de natación, escalera, partidos, apuntados o pistas); un evento con juegos
  enviados por aprobar cuenta como `con_resultado`. `counts` = `{matches,
  bowlingEvents, golfRounds, swimMeets, otherEvents, locked}` (lo que se puede cambiar); `withNewDate` = `{matches,
  events}` (lo que pasa a la nueva fecha); `withoutDate` = `{postponed, cancelled, kept}`.
- `suspend_day(p_league, p_date, p_reason, p_new_date date=null) → {date, newDate, matches: {moved, postponed},
  events: {moved, cancelled, kept}, locked, announced, skipped, recipients, body}`. `p_reason` 1–90 (sin el punto final);
  `p_new_date` desde hoy y distinta de `p_date` (si no, `invalido`). Con fecha: cada partido programado, aplazado o
  suspendido pasa a ese día a la misma hora (aplazado → programado; suspendido sigue suspendido) y los eventos sin
  resultados pasan a esa fecha. Sin fecha: los partidos programados o suspendidos quedan aplazados (`postponed`); los
  eventos sin nada adentro se cancelan (se borran) y los que tienen algo (`content`) se quedan. En el historial
  del partido queda `reschedule` / `postpone` con el motivo (y en `note`). Los retos abiertos de la escalera cuyo
  partido se movió o quedó aplazado alargan su `play_by` (hasta un día después de la nueva hora, o `playDays` desde
  hoy sin fecha), para que el cron no dé W.O. por el día suspendido. Después, UN aviso con `league_announce`:
  «Se suspende el martes 29 de septiembre: <motivo>. Nueva fecha: martes 6 de octubre.» (o «La nueva fecha se
  avisará.»), solo si algo cambió. Si no sale, suspende igual con `announced: false` y `skipped` dice por qué:
  `'nada'` (no cambió nada), `'duplicado'` (el mismo aviso salió hace menos de 10 minutos: doble toque) o `'limite'`
  (ya salieron los 3 avisos del día); `null` si salió.

**Pistas del boliche** (tabla `event_lanes`). Admin, o anotador en un torneo sin liga; solo eventos de boliche
(`invalido`). Las que devuelven las pistas dan `{eventId, count, unpublished, publishedAt, lanes: [{lane, players:
[{playerId, name, position, userId}]}], text}` (`text` = `'Pista 5: Ana, Beto, Caro'`, una línea por pista, para
WhatsApp).
- `assign_lanes(p_event, p_lanes int[], p_per_lane int, p_mode text, p_order uuid[]=null) → pistas`: con quien dijo
  «voy» o está inscrito; reemplaza las que había. `p_lanes` 1–999 (hasta 100, en ese orden; las repetidas cuentan una
  vez), `p_per_lane` 1–20; más jugadores que lugares: `invalido`. `p_mode` `'promedio'` (el promedio es del
  teléfono: `p_order` = jugadores de mayor a menor promedio; sin él, `average_override` o el promedio de la
  inscripción), `'equipo'` (los del mismo equipo del evento juntos: un equipo empieza pista nueva si no cabe entero;
  sin equipos, al azar) o `'azar'`. En `promedio` y `azar` se usan las pistas que hagan falta, parejas (10 de a 4: 4,
  3 y 3).
- `set_player_lane(p_event, p_player, p_lane int|null) → pistas`: lo pone al final de esa pista (cualquier jugador
  de la liga); la pista de donde salió queda sin huecos; `null` lo quita.
- `clear_lanes(p_event) → int` (cuántas había).
- `publish_lanes(p_event) → {players, pushed}`: push a cada jugador con cuenta (sin bloquear y en la liga) «Tu pista:
  7 · <evento>» con el texto de su pista, `url` `/l/<liga>/e/<evento>`, `tag` `pista:<evento>:<jugador>` (el nuevo
  reemplaza al anterior en el teléfono; categoría `recordatorios`: no le llega a quien la apagó, aunque cuenta en
  `pushed`); marca todas como avisadas. 6 veces por hora y evento (`rate_limited`). Sin
  pistas: `{players: 0, pushed: 0}`.

Al juntar dos jugadores (reclamo o `merge_league_players`) la pista pasa al que queda (si los dos tenían, queda la
suya).

**Ojo al cambiar migraciones viejas:** esta redefine `private.merge_players` (mueve también las pistas) y
`private.push_category` (la de `20260929000500_avisos_telefono.sql` más `pista:` en `recordatorios`: un tag nuevo que
se pueda apagar se agrega aquí o en una migración después) y cambia la firma de `public.create_player` (drop + create
con `p_guardian_phone` y `p_consent` al final). `20260929000700_temporadas.sql` vuelve a redefinir las dos (y es la que
vale): `merge_players` con lo mismo más los premios y las tablas guardadas, y `push_category` con `temporada:` en `liga`.

## Seguridad (lo que prueban `tests/sql/seguridad.test.ts` y `nuevas.test.ts`)

- RLS en todas las tablas de `public`; la vista con `security_invoker`.
- Primera migración: `alter default privileges` quita EXECUTE a PUBLIC y todo a anon/authenticated; al final de
  `…_rpc.sql` se quitan otra vez en todas las funciones de `public` y `private` y se dan explícitos
  (lista `v_authenticated`, `v_anon`). Una fase nueva agrega sus RPC a su propia lista de GRANT.
- Solo `public.invite_preview`, `public.public_leagues_feed`, `public.public_agenda` y `private.readable_leagues` son
  security definer ejecutables por `anon`. `league_seasons`, `league_champions` y `bowling_game_context` también las
  llama `anon`, pero leen con la RLS de quien llama (no son security definer).
- Nadie tiene INSERT/UPDATE/DELETE en ninguna tabla; `profiles` sin UPDATE directo (más estricto que permisos por
  columna) y un trigger impide que una sesión de usuario cambie `is_superadmin`, `email` o `firebase_uid`.
- De `private`, `authenticated` solo ejecuta lo que llaman las políticas de RLS y Storage (`admin_leagues`,
  `can_remove_logo_path`, `can_upload_logo_path`, `can_upload_photo_path`, `is_super`, `my_leagues`,
  `photo_admin_leagues`, `readable_leagues`); `anon`, solo `readable_leagues`.
- `league_id` de las tablas hijas verificado con FK compuestas; `photos.path` atado a su liga e id;
  `leagues.logo_path` solo con rutas de su propia liga (CHECK).
- Deporte fijo (trigger); dueño solo por `transfer_ownership` (trigger); `leagues.owner_id` ON DELETE RESTRICT.
- Menores: `is_minor` exige `has_minors` (trigger), sin cuenta (CHECK), liga privada sin foto obligatoria (CHECK),
  sin social ni fotos (RPC), `has_minors` solo sube (salvo superadmin y sin menores).
- `league_badge_awards` con SELECT por columna: `note`, `awarded_by`, `revoked_by`, `revoke_reason` y `seen_at` no se
  leen directo (solo por `league_badge_holders`, `profile_badges` y `badge_notices`, que miran quién pregunta).
- Supabase Security Advisor: puede marcar «security definer function executable by authenticated» en las RPC:
  es a propósito (todas validan permisos adentro).

## Pendiente para otras fases

- Hecho en 0C: cron de recordatorios y limpieza, cupos de lectura de fotos (`scan_*`), cola de push y las Edge
  Functions `scan-bowling` y `send-push`. `max_rows` = 500 en `config.toml`. Después: `delete-account` e `insignias`.
- Cada deporte trae su migración (partidos, `match_*`, `swim_*`, equipos de temporada) y agrega su caso a
  `private.series_ok`, `private.check_event` y `private.check_live`.
