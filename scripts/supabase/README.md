# Prueba de humo de la base real (`smoke.sql`)

`smoke.sql` recorre lo que usa la app contra la base **de verdad** de Supabase (proyecto `jbismsdjgjxutfvwnlmf`)
sin dejar nada guardado: empieza con `BEGIN`, termina con `ROLLBACK` y no tiene ningún `COMMIT`.

## Correrla contra Supabase

Desde la raíz del repo (el proyecto ya está enlazado: `supabase/.temp/project-ref`; si no, primero
`npx -y supabase@2 link --project-ref jbismsdjgjxutfvwnlmf`, y `npx -y supabase@2 login` si pide sesión):

```sh
npx -y supabase@2 db query --linked -f scripts/supabase/smoke.sql
```

La CLI manda el archivo entero en **una sola** llamada a la Management API (`POST /v1/projects/{ref}/database/query`),
así que todo corre en la misma transacción y el `ROLLBACK` del final la deshace. Tarda un par de segundos y se puede
correr con la app en uso: solo toca filas que ella misma crea (y `lock_timeout` de 10 s por si acaso).

**Qué se ve**

- **Pasó**: sale sin error (código 0) y muestra la tabla del resumen, `paso | ok`, con unas 110 filas
  (`boliche: …`, `pádel: …`, `permisos: … [falla como debe: no_permitido]`, …). Con `--linked` los `NOTICE`
  («OK …») no se muestran; con un cliente que sí los muestra (psql, abajo) sale además `SMOKE OK: N pasos`.
- **Falló**: la CLI muestra el error de la API (`unexpected status 400: …`) con el mensaje `FAIL <paso>: <qué>`
  (o el error de Postgres del paso que se cayó) y sale con código distinto de 0. Tampoco queda nada guardado: sin
  `COMMIT` la transacción se descarta al cerrar la conexión.

Con psql (muestra cada `OK …` mientras avanza), usando la cadena de conexión de *Project Settings → Database*:

```sh
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/supabase/smoke.sql
```

(sin `-1`/`--single-transaction`: el archivo ya maneja su transacción).

## Qué recorre

Cuentas propias dentro de la transacción: 6 filas en `auth.users` con correo `smoke-<uuid>@example.invalid` (el
perfil lo crea el trigger `on_auth_user_created`) y una de ellas pasa a superadmin por SQL. Cada paso actúa **como
esa cuenta bajo la RLS**, igual que PostgREST y `tests/sql/harness.ts`: `set local role authenticated` (o `anon`) +
`set_config('request.jwt.claims', …)`, y `reset role` al terminar el paso. Cada paso es un bloque `DO` con `ASSERT`.

| Parte | Qué comprueba |
|---|---|
| 0. Previo | Las 38 migraciones del repo están en `supabase_migrations.schema_migrations`; el boliche está `open`; lista el estado de cada deporte |
| 1. Cuentas | Alta en `auth.users` → perfil por trigger (nombre, correo, mayor de 18), superadmin sembrado |
| 2. Boliche | `create_league` (código, membresía, jugador del dueño), `create_player`, `invite_preview`/`invite_details`, `join_league` con código (minúsculas, repetido, código malo), práctica y torneo (handicap, categorías, equipos de 2), `add_entries`, `apply_teams`, `save_game` (sin foto obligatoria = `sin-foto`), `set_rsvp`, `add_practice_game` (no suma dos veces), `publish_live`, `submit_games` sin foto por evento y por fecha (idempotente con `p_op_id`, sale de «en vivo»), `approve_submission` (por fecha crea la práctica), `reject_submission` con nota, reacción y comentario |
| Ranking | Como un miembro: las mismas lecturas que la app (`events`, `teams`, `event_rsvps`, `players`, `memberships`, `entries`, `submissions`, `reactions`, `comments`, `league_announcements`); promedio de juegos verificados (7 juegos = 180), primero del torneo, promedio global por `memberships`, `export_my_data` |
| Avisos | `league_announce` llega a la única cuenta con teléfono (`upsert_push_subscription`), `league_announce_reach`, la fila en `push_outbox` repartida al teléfono (pg_net no manda nada sin `COMMIT`) |
| 2.13 Organizador | El dueño: `league_pending` (envíos, reclamos, lista de pasos), `assign_lanes` del torneo por equipo (cada equipo en una sola pista), `publish_lanes` (un push «Tu pista» por jugador con cuenta), `suspend_day_preview` de hoy. Sin cuenta: `public_leagues_feed` responde y no trae ligas privadas |
| Pádel | El superadmin crea la liga, 4 cuentas se unen, `create_matches` (parejas, posiciones, reglas copiadas), `my_matches`, `finish_match` de un lado → `finished`, el rival `confirm_result` → `confirmed`, el rival `dispute_result` → `disputed`, `resolve_dispute` del admin |
| Fútbol | `create_season_team` con capitán, la capitana `set_team_player` (dorsal, posición), plantillas legibles |
| Golf | `golf_save_course` (9 hoyos), `golf_create_round`, `golf_register`, `golf_save_hole_scores`, `golf_sign_card` |
| Natación | `swim_create_meet`, `swim_save_events`, `swim_save_club`, `swim_register_swimmer`, `swim_enter` (admin y la propia nadadora), `swim_publish_heats`, `swim_record_heat` |
| Bloqueo | `admin_block_user` (superadmin) → `submit_games`, `set_rsvp`, `join_league`, `add_comment` fallan con `bloqueada`; leer sigue; `admin_unblock_user` y los dos quedan en `admin_audit_log`; vuelve a escribir |
| 9c. Usuarios e invitaciones | El perfil nuevo trae un `@usuario` válido; el dueño se pone otro (`username_status` `ok` → `set_username` → `mine`, lo ve en `public_profile`; uno reservado falla con `reservado`); Ana lo ve `taken` y lo encuentra con `search_people('@…')`. El dueño invita a Beto a la liga del boliche (`invite_to_league`): como ya está, `member`; Beto sale (`leave_league`), el dueño lo invita otra vez (`sent`, y `search_people` con la liga lo marca `invited`); Luis (miembro de la privada) no la lee, `league_invite_details` le da null e invitar le da `no_permitido`. Beto la ve (`my_league_invites`, `league_invite_details`), la acepta (`respond_league_invite`) y queda de miembro con su jugador; responder otra vez no cambia nada |
| 9d. Legal | `accept_legal` (idempotente; otra versión: `invalido`), `report_content` de un comentario (dos veces = el mismo), un juego y una cuenta (`my_reports` los trae); el de fuera no reporta la liga privada ni lee la lista; el dueño ve los de su liga sin quién reportó (no el de su propio juego), descarta el del comentario y no decide el de su propio juego; el superadmin ve quién reportó, atiende la cuenta (auditoría) y `admin_legal_stats`, y no vuelve a decidir lo que descartó el dueño (`cerrado`); nadie lee `reporter_id` directo |
| 9e. Juegos sueltos y logo | Ana anota un juego suelto (`save_solo_session`; el reintento con el mismo `p_op_id` devuelve el mismo id y no crea otro), lo corrige y anota otro que no es compartido (`solo_sessions_of` los trae los dos); 301 pinos → `invalido`. El dueño solo ve el compartido (`solo_sessions_of`, `profile_games` con kind `solo`, sin liga ni url), no lee la tabla directo, le da me gusta (`set_game_like('solo')`) y no lo cambia, no lo borra ni le da me gusta al que no es compartido (`no_permitido`). Ana ve el aviso (`social_notices`, `gameKind` `solo`) y borra los dos (`delete_solo_session`, con sus me gusta); un guardado viejo con ese id → `no_existe` (no lo revive). El dueño reserva (`begin_logo_upload`; sin reservar `private.can_upload_logo_path` dice que no), pone y cambia el logo de su liga (`set_league_logo` devuelve el anterior, que ya se puede borrar de Storage: `private.can_remove_logo_path`; sale en `invite_preview` e `invite_details`); una ruta de otra liga o sin reservar → `invalido`; Ana (miembro) lo ve, no lo puede subir ni reservar y `set_league_logo` le da `no_permitido` |
| Consola | `admin_overview`, `admin_system` (backend, migraciones, cron), `admin_users`, `admin_leagues` |
| **Tiene que fallar** | Alguien de fuera: no ve la liga privada (ni jugadores, miembros, código, partidos), no entra sin código, no confirma resultados. Un miembro: `approve_submission`, `create_event`, `save_game`, `renew_invite_code`, `league_announce`, `delete_league`, todos los `admin_*`, `set_superadmin`, `set_sport_status`, crear liga de un deporte en beta (si hay alguno; desde `20260929001000` todos están `open`) → `no_permitido`; `insert`/`update`/`delete` directo → `42501`; no lee perfiles ajenos ni la auditoría. Quien propone no confirma ni reclama lo suyo; la capitana no nombra capitanes ni se lleva a alguien de otro equipo; un jugador no maneja la plantilla; una nadadora no inscribe a otro. Sin cuenta (`anon`): no ve ligas privadas; `create_league`, `join_league`, `submit_games`, `publish_live`, `admin_overview`, `insert` directo y leer `profiles` → `42501` |

Si un deporte que usa la prueba estuviera `closed`, el superadmin de la prueba lo pone en `beta` solo dentro de la
transacción (sale un `AVISO`); el `ROLLBACK` lo deja como estaba.

## Por qué no deja rastro

- Todo va en una transacción que termina en `ROLLBACK` (cuentas, ligas, partidos, avisos, auditoría, límites).
- `pg_net` encola sus pedidos (`send-push`) en una tabla y solo salen después de un `COMMIT`; `realtime.send`
  escribe en `realtime.messages`: las dos cosas se deshacen. Ningún teléfono recibe nada.
- Las ayudas (`pg_temp.ok`, `pg_temp.must_fail`, …) viven en el esquema temporal de la sesión.
- Si algún cliente mandara las sentencias por separado (cada una con su `COMMIT`), el paso 0 corta con
  `SMOKE ABORTADO: no corre dentro de una sola transacción` antes de crear la primera cuenta (lo prueba
  `tests/sql/smoke.test.ts`).
- Lo único que no vuelve atrás son las secuencias (ids de `push_outbox`, `tombstones`, `admin_audit`): quedan
  huecos en la numeración, sin efecto.

## Correrla en local (PGlite)

`tests/sql/smoke.test.ts` carga `supabase/local/shim.sql` + las migraciones (igual que `tests/sql/harness.ts`),
corre el archivo entero y comprueba que pasa, que la base queda igual que antes, que se puede repetir, que detecta
una base rota (bloqueo que no bloquea, cualquiera admin, liga privada visible) y lo de las sentencias sueltas.
Entra también en `pnpm test:sql`.

```sh
npx vitest run -c vitest.sql.config.ts tests/sql/smoke.test.ts
# con la lista de pasos:
SMOKE_VERBOSE=1 npx vitest run -c vitest.sql.config.ts tests/sql/smoke.test.ts -t "pasa entera" --silent=false
```

## Si falla en Supabase

- `FAIL previo: faltan migraciones …`: falta aplicar esas migraciones (`npx -y supabase@2 db push`).
- `FAIL previo: el boliche no está abierto`: alguien cambió `sport_status`; nadie podría crear ligas de boliche.
- Error en `cuentas` (`permission denied for table users`): el rol de la Management API no puede escribir en
  `auth.users`; correrla con psql y la cadena de conexión de `postgres` (arriba).
- Cualquier otro `FAIL <paso>`: ese paso de la app no funciona en la base real igual que en PGlite. Como la prueba
  local pasa, la diferencia está en la base (una migración a medias, un permiso o una política cambiada a mano).

## Mantenimiento

Al agregar una migración, sumar su versión a `v_expected` del paso 0. Si cambia una RPC que se usa aquí, correr la
prueba local (`tests/sql/smoke.test.ts`) antes de correrla contra Supabase.
