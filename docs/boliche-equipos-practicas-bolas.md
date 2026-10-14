# Boliche: equipos fijos, práctica abierta y bolas con catálogo y layout

Migración: `supabase/migrations/20261013000100_boliche_equipos_practicas_bolas.sql`. Pruebas:
`tests/sql/boliche-equipos-practicas-bolas.test.ts`.

## 1. Equipos fijos de la liga

Hasta ahora el boliche solo tenía equipos por torneo (`teams.event_id` = el torneo, `apply_teams`). Ahora una liga de
boliche también tiene **equipos fijos**: `teams` con `event_id null` y su plantilla en `team_players`, como los
equipos de temporada de fútbol o baloncesto, pero sin temporada (`season_id null`).

- **La base deja de bloquearlos:** `private.check_season_team` acepta equipos sin evento en una liga de boliche. Un
  jugador está en un solo equipo fijo de la liga.
- **Las copias en cada torneo:** `teams.league_team_id uuid null references teams(id) on delete set null` es el equipo
  fijo del que salió cada equipo de un torneo.
- **Se aplican solos:** al entrar un jugador a un torneo de una liga con equipos fijos (cualquier `insert` en `entries`
  de un evento `torneo`), si el jugador está en un equipo fijo y la entrada no trae equipo, se usa la copia de su
  equipo en ese torneo (creándola si falta, con el mismo nombre y color) y se pone en `entries.team_id`.
- **`apply_league_teams(p_event uuid) returns integer`** (admins): vuelve a aplicar los equipos fijos a un torneo que
  ya tiene inscritos. Devuelve cuántas entradas quedaron con equipo.
- **`set_bowling_teams(p_league uuid, p_teams jsonb) returns uuid[]`** (admins) reemplaza todos los equipos fijos de una
  vez. Recibe `[{ id?: uuid, name: text 1–60, color?: '#rrggbb', players: uuid[] }]` y devuelve los ids en ese orden.
  - Un `id` que ya existe se conserva (nombre, color y plantilla nuevos).
  - Los que no vienen se borran; sus copias en torneos quedan con `league_team_id` null.
  - Sirve para «Generar al azar» y «Generar parejos» (la app arma los grupos) y para editar.
  - Errores: `invalido` (un jugador repetido, uno que no es de la liga o más de 40 equipos).
- **`save_bowling_team(p_league uuid, p_id uuid, p_name text, p_color text, p_players uuid[]) returns uuid`**
  (admins) crea o cambia un equipo; `p_id` null crea. Si un jugador estaba en otro equipo fijo, sale de ese.
- **`delete_bowling_team(p_team uuid) returns void`** (admins).
- **Lectura:** la de siempre por tabla (RLS de la liga): `teams` con `event_id is null` y `team_players`.

## 2. La práctica abierta para todos el día que toca

- **`open_practice(p_league uuid, p_date date default null) returns uuid`**: cualquier jugador o admin de una liga de
  boliche abre (o encuentra) la práctica de ese día y devuelve su evento.
  - Fecha por defecto: hoy en la zona de la liga (`leagues.tz`).
  - Solo se puede abrir hoy o ayer (en la zona de la liga).
  - Si es hoy y el horario de la liga tiene hora (`private.event_start` con `schedule`), solo desde esa hora.
  - Si ya hay un evento `practica` ese día en la liga, devuelve ese. Si no, lo crea con los datos de las prácticas
    automáticas de `approve_submission`.
  - Errores: `cerrado` (antes de la hora, o una fecha fuera de hoy y ayer) y `no_permitido` (no es de la liga).
- **Se cierra al otro día:** en una práctica, `submit_games`, `add_practice_game` y `publish_live` responden `cerrado`
  a quien no es admin si la fecha de la práctica es anterior a ayer (en la zona de la liga). Los admins siempre
  pueden. Los torneos no cambian.
  - **Envío por fecha** (`submit_games` con `p_date` y sin evento): la misma regla. Un jugador solo envía juegos de
    hoy o de ayer; para un día anterior, `cerrado` (el admin sí puede enviarlos por él).
  - **Reintentos:** reenviar lo que ya entró (el mismo `p_op_id`) devuelve el resultado de la primera vez aunque la
    práctica ya haya cerrado, así la cola sin conexión no se queda trabada.

## 3. Bolas: catálogo y layout del taladrado

- **`bowling_balls.catalog text null`** (≤ 80): la clave del modelo en el catálogo de la app
  (`src/lib/ballCatalog.ts`, por ejemplo `storm:phaze-ii`). Solo es una referencia; la marca y el nombre siguen en
  `brand` y `name`.
- **`bowling_balls.layout jsonb null`**: el layout del taladrado. Todos los campos son opcionales; con todos vacíos es
  null.
  - `drillingAngle`: grados, 0–90.
  - `pinToPap`: pulgadas, 0–7, de a 1/8.
  - `valAngle`: grados, 0–90.
  - `pinBuffer`: pulgadas, 0–7, opcional.
  - `notes`: texto de hasta 60 caracteres, por ejemplo «Dual Angle, mano derecha».
  - La base lo valida con `private.ball_layout_ok`.
- **`set_ball_details(p_ball uuid, p_catalog text, p_layout jsonb) returns void`** (el dueño) pone las dos cosas: null
  quita y `{}` también quita el layout. Los límites de siempre de las bolas aplican.
- **`my_balls`** suma `catalog` y `layout` a cada bola.
