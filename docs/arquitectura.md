# Arquitectura de MatchMate

MatchMate es la versión multideporte de BowlingX. Nació como copia de BowlingX (29334d1) y pasa de Firebase
a **Supabase** (plan gratis). BowlingX sigue aparte para su liga; sus datos se migran al final.

Plan completo y decisiones: `docs/plan/` (plan.json, investigación y crítica).

## Capas

```
Pantallas (src/pages, src/components)          ← casi sin cambios respecto a BowlingX
   │  usan hooks y funciones de src/lib/data.ts (mismos nombres que en BowlingX)
Capa de datos (src/lib/data/*.ts, reexportada por src/lib/data.ts)
   │  lecturas: caché de consultas persistida (src/lib/db/query.ts)
   │  escrituras: rpc; las de cancha pasan por la cola sin conexión (src/lib/db/outbox.ts)
Backend (src/lib/backend/types.ts)             ← contrato único
   ├─ supabase.ts  producción (supabase-js)
   └─ local.ts     PGlite con las mismas migraciones y RLS (desarrollo, pruebas, demo)
Base de datos (supabase/migrations/*.sql)      ← fuente de verdad: esquema, RLS, RPC, triggers
Motores de deporte (src/sports/<familia>/*.ts) ← funciones puras con pruebas, sin React ni backend
```

## Base de datos (Postgres)

- Todo en `public` con **RLS activada en todas las tablas**. Funciones de ayuda en el esquema `private`
  (no expuesto por la API), `security definer`, `stable`, `set search_path = ''`, usadas como `(select private.x())`.
- Primera migración: `alter default privileges ... revoke execute on functions from public, anon, authenticated`
  y `revoke all on tables` por defecto; cada RPC recibe `grant execute ... to authenticated` (o `anon` si es pública)
  de forma explícita. Una prueba recorre `pg_proc`/`pg_class` y falla si hay una tabla sin RLS o una función
  `security definer` ejecutable por `anon` que no esté en la lista permitida.
- **Escrituras solo por RPC** (`public.<verbo>_<cosa>(p_...)`), atómicas, que validan permisos con los helpers.
  Las RPC de cancha y envíos reciben `p_op_id uuid` y lo guardan en `private.op_log` para que reintentar no duplique.
- Ids `uuid` (el cliente puede generarlos para crear sin conexión). Tablas sincronizadas con `updated_at`
  (trigger) e índice `(league_id, updated_at)`.
- `league_id` copiado en tablas hijas **siempre verificado**: FK compuesta `(event_id, league_id) → events(id, league_id)`
  (con `unique (id, league_id)` en el padre) o trigger BEFORE que lo copia del padre. Nunca se confía en el cliente.
- Deporte: `leagues.sport text references sport_status(id)` (no enum), fijo después de crear (trigger).
- `profiles` nunca legible por `anon` (tiene correos). El superadmin se siembra por SQL; nadie puede ponerse
  `is_superadmin` (sin UPDATE directo de esa columna).
- Errores: `raise exception '<codigo>' using errcode = 'P0001'` con códigos en español corto:
  `no_permitido`, `rate_limited`, `invalido`, `no_existe`, `duplicado`, `cerrado`, `conflicto: <qué choca>` (aprobar
  un reclamo de jugador), `reservado` (un @usuario que la app no deja usar). `42501` para permisos.
- Tiempo real: triggers llaman `private.emit(topic text, event text, payload jsonb)`. Si existe `realtime.send`
  (Supabase) lo usa con canal privado; si no (PGlite), `pg_notify('mm', json)`. Temas: `event:<id>`,
  `league:<id>`, `user:<id>`.
- Auth: en Supabase existe `auth.users` y `auth.uid()`. Para PGlite hay un **shim** (`supabase/local/shim.sql`)
  que crea el esquema `auth` (tabla `users`, `uid()`, `jwt()`, `role()`), los roles `anon`, `authenticated`,
  `service_role`, y un esquema `storage` mínimo. Las pruebas SQL y el backend local cargan el shim y luego
  las migraciones en orden. Para actuar como un usuario: `set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);` dentro de una transacción.

## Cliente

- `src/lib/backend/index.ts` elige el backend: Supabase si hay `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_PUBLISHABLE_KEY`; si no, local (PGlite con persistencia en IndexedDB `idb://matchmate`).
- Claves de `localStorage`/IndexedDB con prefijo `mm:` (nunca `bowlingx:`/`bowlinx:`).
- **Deporte activo** (`src/lib/sportContext.ts`, clave `mm:deporte`): el chip de arriba (`SportSwitcher`) lo elige y
  siempre dice en qué deporte estás; entrar a una liga lo cambia al de la liga. Con deporte, Home, Eventos y Avisos
  son de ese deporte y la app toma su color. Rutas: `/` Home de todos (si hay deporte activo manda a `/d/:sport`;
  volver atrás hasta `/` sí quita el deporte), `/d/:sport` Home del deporte, `/ligas` Eventos, `/avisos` página de
  avisos, `/u/:userId` perfil público, `/perfil` el propio, `/buscar` buscar personas (nombre o @usuario),
  `/invitacion/:inviteId` una invitación a una liga (ahí llevan el push y el aviso de la campana),
  `/juegos-sueltos` los juegos de boliche sin liga ni torneo, `/acerca` qué es MatchMate y `/contacto` cómo
  escribirnos. «Home» de la barra: fuera del Home del deporte va a él; en él, quita el deporte y va a `/`. Para ir
  al Home de todos: `setActiveSport(null)` y luego `/`.
- **Barra** (`navSections` en `src/components/Shell.tsx`): con cuenta Home · Eventos · (Crear) · Avisos · Perfil;
  sin cuenta Home · Contáctanos · (Crear) · Entrar · Acerca de (mientras se lee la sesión guardada se quedan las de
  con cuenta). Con cuenta, /acerca y /contacto están al final de /cuenta. Las dos páginas no guardan nada:
  «Escribir el correo» abre un `mailto:` con el asunto y el mensaje listos.
- **Volver a donde iba** (`src/lib/auth.tsx`, clave `mm:despues-de-entrar`): quien abre /login?next=<ruta> sin
  cuenta (una invitación, una liga) deja la ruta guardada 24 h (solo rutas de la app: `afterLoginPath`); viaja en
  el `redirectTo` de Google y en el `emailRedirectTo` del correo de confirmar, y `ResumeAfterLogin` (dentro del
  router) va ahí una sola vez al abrirse la sesión (también en otra pestaña) y la borra. Con el link de recuperar
  la contraseña no se mueve.
- Cola sin conexión solo para lo de cancha: anotar juegos/puntos, en vivo, «Voy», +1 juego, envíos.
  El resto lee en línea con copia persistida para ver sin señal.
- Textos en español dominicano sencillo, comentarios en español (como BowlingX); identificadores en inglés.

## Motores de deporte

`src/sports/types.ts` define `SportId`, `SportFamily`, `MatchEngine` (init/apply/isOver/result + `replay`),
`StandingRow` y `MatchResult`. Cada familia vive en su carpeta con pruebas (`*.test.ts`) y no importa React
ni el backend:

- `src/sports/racket/`  tenis, pádel y pickleball (puntos, juegos, sets, tie-breaks, saque y lados).
- `src/sports/formats/` americano/mexicano, round robin, grupos + cuadro, liga por cajas, escalera, tablas.
- `src/sports/team/`    baloncesto y fútbol/futsal (mesa anotadora, faltas, tarjetas, tablas, disciplina).
- `src/sports/golf/` y `src/sports/swimming/`.

## Pantallas por deporte

- `src/sports/registry.ts`: datos de cada deporte (nombre, familia, ícono, cancha/pista, reglas por defecto y su
  validación, tipos de evento, si usa fotos). `src/sports/status.ts` lee `sport_status` (abierto, beta o cerrado).
  Desde `20260929000300_sueltos_logos.sql` todos están abiertos (y `DEFAULT_SPORT_STATUS` también); la consola del
  superadmin puede volver a poner uno en beta (solo él lo ve y crea ligas) o cerrarlo.
- `src/sports/screens.tsx` es el contrato: cada deporte exporta por defecto un `SportScreens`
  (`Home`, `Event`, `Standings?`, `Feed?`, `MyProfile?`, `Player?`, `adminTabs?`, `tabs?`) desde
  `src/pages/sports/<sportId>/screens.tsx`. La app lo encuentra sola con `import.meta.glob`: las rutas de la liga
  (`SportRoute`), `EventPage`, las pestañas de `LeagueShell` y las del Admin usan las del deporte de la liga.
  El boliche usa sus pantallas de siempre. Un deporte sin `screens.tsx` muestra «Pronto»; uno que esta versión
  no conoce, «Actualiza la app».
- Lo común de los partidos (raqueta y equipos: anotador, confirmación del rival, W.O., modo cancha) está en
  `docs/partidos.md`, `src/court/` y `src/components/match/`.

## Datos por módulo (`src/lib/data/`)

`client` (select/rpc con errores normalizados), `keys`/`topics` (claves de caché y temas de tiempo real),
`rows` (filas → tipos de la app), `leagues`, `members`, `players`, `events`, `teams`, `entries`,
`submissions`, `social`, `follows`/`profileGames` (seguir, perfil público, juegos con me gusta), `claims` (reclamos de jugadores), `people` (@usuario y buscar personas), `invites` (invitaciones a una liga), `solo` (juegos sueltos de boliche), `suggestions`, `liveScores`, `feeds`, `uploads`/`pending` (fotos y cola), y los de
cada deporte (`matches`, `seasonTeams`, `racket`, `teamSports`, `golf`, `swimming`). Fuera de la carpeta,
`src/lib/logos.ts` (logo de ligas y torneos).

## Jugadores sin cuenta y reclamos

- El admin agrega personas que no tienen cuenta desde Admin › Jugadores («Agregar jugador», uno o varios por nombre)
  con el dato de su deporte: promedio (boliche), nivel (pádel 0–7, tenis NTRP, pickleball DUPR), Handicap Index
  (golf), posición y dorsal (baloncesto y fútbol, en `players.attrs.team`); los nadadores, en Nadadores. Pantalla:
  `src/components/players/`. RPC existentes: `create_player`, `update_player` (`attrs`), `golf_set_index`.
- Si esa persona se crea una cuenta, dice «ese jugador soy yo» (al unirse en «¿Quién eres?», en la página del
  jugador o en el aviso del Home de la liga) y queda un **reclamo** (`player_claims`, `pending`). Mientras, juega con
  su propio jugador. El dueño o un admin lo aprueba en Admin › Reclamos (`?tab=reclamos`); al aprobar, el jugador
  propio se junta con el reclamado (todo su historial) y se borra. Si los dos jugaron lo mismo: `conflicto`.
  Un dueño o admin que reclama queda aprobado al momento. Los menores nunca se reclaman.
- Migración `20260929000100_reclamos.sql`; cliente `src/lib/data/claims.ts` y `src/components/claims/`. Tiempo
  real `claims` en `league:<id>` y `user:<id>`; push al admin y a quien pidió; avisos en la campana.

## Usuarios, buscar personas e invitaciones

- **@usuario** (`profiles.username`, obligatorio y único): 3 a 20 minúsculas, números, `_` y puntos solo por
  dentro (sin `..`); el mismo formato en el CHECK de la tabla y en `USERNAME_RE` (`src/lib/data/people.ts`). Un
  trigger se lo pone a toda cuenta nueva a partir del nombre (sin acentos ni símbolos, hasta 15) o, si no da, del
  correo o «jugador»; si está tomado o reservado (admin, soporte, buscar, invitacion…), con 4 números al final.
  Se cambia en /cuenta («Tu usuario», con `set_username`: 5 cambios por día) y mientras se escribe
  `username_status` dice si está libre. Sale debajo del nombre en el perfil, en las listas de seguidores y en la
  búsqueda.
- **Quién se ve**: con sesión, cualquier cuenta sin bloquear (se busca y se abre su perfil); sus juegos, me gusta
  y números siguen saliendo solo de las ligas que quien mira puede leer y sin menores (`private.social_players`).
- **Buscar personas** (`search_people`, pantalla `/buscar`): por @usuario (empieza con) o nombre (lo contiene, sin
  acentos), desde 2 letras; vacío, las cuentas que sigo. Primero el @usuario exacto y luego a quien sigo. Con una
  liga (hay que ser miembro), dice quién ya está en ella y quién ya tiene invitación.
- **Invitaciones** (`league_invites`: `pending` → `accepted` | `declined` | `cancelled`, una pendiente por liga y
  cuenta): un miembro invita a una liga pública; a una privada (también las de menores), solo el dueño o un
  admin. `invite_to_league` (hasta 50 por vez, 100 por día) manda un push «Ana te invitó a <liga>»; la cuenta
  invitada lo ve en la campana, en la tarjeta «Invitaciones» de /avisos y en `/invitacion/<id>`, donde acepta
  (`respond_league_invite`: entra con su jugador y, si eligió uno en «¿Quién eres?», queda el reclamo, como con el
  código) o rechaza (no se le vuelve a invitar en 7 días). Quien invitó o un admin la retira
  (`cancel_league_invite`). Entrar por otro camino acepta la pendiente; salir de la liga cancela las que mandó
  esa cuenta. Si la liga ya no es pública y quien invitó ya no es admin, aceptar la deja `cancelled`.
- **Hoja de invitar** (`src/components/invite/`, sobre `Sheet` de `src/components/ui.tsx`: en el teléfono sube
  desde abajo, en la computadora es un cuadro en el centro): buscador, las personas que sigues en tarjetas para
  elegir y, abajo, el link (copiar, WhatsApp, «Más»): el admin, el de invitación con código; un miembro de una
  liga pública, el de la liga. Se abre desde el ícono al lado del nombre de la liga, «Invitar» de la portada y
  «Invitar personas» en Admin › Liga, solo si la cuenta puede invitar.
- Migración `20260929000200_invitaciones.sql`; cliente `src/lib/data/people.ts` y `src/lib/data/invites.ts`.
  Tiempo real `invites` en `user:<invitada>`, `user:<quien invitó>` y `league:<id>`; push a la invitada y, al
  aceptar, a quien invitó.

## Juegos sueltos (boliche sin liga)

- `solo_sessions`: los juegos de boliche de una cuenta fuera de una liga o torneo (fecha, bolera, nota, de 1 a 10
  juegos de 0 a 300, cuadros opcionales con el formato de `entries.frames` y `shared`: si sale en el perfil). Cada
  cuenta lee los suyos. `save_solo_session` crea o cambia (idempotente con `p_op_id`, 200 por día),
  `delete_solo_session` borra y `solo_sessions_of` lee (de otra cuenta, solo los compartidos y si se ve). Sin
  tombstone: el tiempo real `solo` en `user:<dueño>` hace volver a leer. Los ids borrados quedan en
  `private.solo_deleted`: un guardado viejo de la cola de otro teléfono no revive uno borrado (`no_existe`).
- Lo social: los compartidos salen en el perfil y en el inicio de quien sigue como juego `solo` (sin liga; «Ver»
  solo para su dueño), cuentan en `public_profile` y en el boliche de `profile_stats`, y reciben me gusta
  (`set_game_like('solo')`, tabla `solo_likes`: `game_likes` exige liga y jugador) con su aviso en la campana.
- Cliente `src/lib/data/solo.ts`: guardar va por la cola sin conexión (grupo `solo`, una clave de colapso por
  juego) y se ve de una, encima de lo del servidor; borrar necesita señal salvo uno que no ha salido del teléfono.
  `soloSummary` usa las cuentas de `src/lib/stats.ts` (todos los juegos cuentan: no hay foto que verificar).
- Pantalla `/juegos-sueltos` (`src/pages/SoloGamesPage.tsx`: números y lista por mes; `?juego=<id>` abre uno,
  `?nuevo=1` uno nuevo) con la hoja `src/components/solo/SoloGameSheet.tsx` (cuadros con `ScoreEntryModal`). Se
  llega desde Crear (sin deporte o en el boliche), la portada del Home del boliche y /perfil. Mis estadísticas
  (`GlobalStats`) los suman al total, a la gráfica y a cada año, con su fila «Juegos sueltos» en «Por liga»; el
  promedio y el ranking de cada liga siguen siendo solo de la liga.

## Logo de ligas y torneos

- `leagues.logo_path` ('<liga>/<uuid>.webp|jpg|png', con CHECK) en el bucket **público** `logos` (256 kB, WebP,
  JPEG o PNG; `20260929000310_logos_supabase.sql`, solo Supabase): cualquiera con el link lo ve (la página de
  privacidad lo dice). Cada subida se reserva antes con `begin_logo_upload` (admin de la liga, 30 por día) y Storage
  solo acepta rutas reservadas, por quien las reservó, sin bloquear y por un día (`private.can_upload_logo_path`):
  nadie guarda archivos en el bucket sin pasar por el límite. Cada logo es un archivo nuevo (sin UPDATE).
- `set_league_logo` (admin; solo una ruta reservada, que se usa una vez; null lo quita, y eso cuenta en los mismos
  30 por día) devuelve el anterior para borrarlo de Storage. Lo que deja de usarse (el anterior, el de una liga
  borrada, las reservas sin usar de un día: `private.logo_uploads_cleanup`, a diario con pg_cron) va a
  `private.storage_purge_queue` con bucket `logos`, y mientras está ahí cualquier cuenta sin bloquear lo puede borrar
  (`private.can_remove_logo_path`). Lo que ve quien todavía no es de la liga trae el logo: `invite_preview` (columna
  `logo_path`), `invite_details`, `my_league_invites`, `league_invite_details` y la consola (`admin_league_row`).
- Cliente `src/lib/logos.ts`: `compressLogo` (en `src/lib/image.ts`: el cuadrado del centro a 256 px, WebP o JPEG,
  siempre sobre blanco para que un logo transparente se vea en claro y en oscuro, ≤ 120 kB), `uploadLeagueLogo`
  (reserva, sube, `set_league_logo`, borra el anterior), `removeLeagueLogo` y `useLogo` (URL pública con
  `storage.publicUrl`, recordada en memoria; mientras llega, un cuadro vacío del mismo tamaño). Borrar la liga borra
  su archivo después, solo si la liga se borró (`deleteLeagueWithLogo`).
- `LeagueIcon` / `LeagueLogo` (`src/components/home/LeagueCard.tsx`) lo muestran en las filas de ligas, el
  encabezado y el cambiador de liga de `LeagueShell`, la portada, el Home de la liga de boliche, /unirse,
  /invitacion, la tarjeta de invitaciones de /avisos, «Seguir en» del Home y «Por liga» de Mis estadísticas; sin
  logo (o si no carga), el ícono de siempre. Se pone en Admin › Liga (en un torneo, › Datos) y, opcional, al crear.
- Migración `20260929000300_sueltos_logos.sql` (también abre todos los deportes y trae los juegos sueltos).

## Sin señal y errores

- `src/lib/persist.ts`: pide al navegador que no borre lo guardado (lo que falta por enviar) cuando haya poco espacio.
- `src/lib/prefetch.ts`: con señal, deja en el teléfono los partidos y eventos de hoy y mañana de mis ligas.
- `src/lib/errorReport.ts`: los errores de los teléfonos llegan a la consola (sección Errores) con tope y sin datos
  personales; cada ruta tiene su ErrorBoundary para que un fallo no tumbe la barra de navegación.
- Cuenta bloqueada: todas las RPC que escriben pasan por `private.require_uid()`, que falla con `bloqueada`
  (el teléfono lo muestra con `BLOCKED_MESSAGE` de `src/lib/backend/errors.ts`).

## Pruebas

- `pnpm test`: unitarias (`src/**/*.test.ts`).
- `pnpm test:sql`: SQL y RLS con PGlite (`tests/sql/*.test.ts`, configuración `vitest.sql.config.ts`).
- Cuando haya Docker: `supabase start` + `supabase test db` (pgTAP) como verificación final.
