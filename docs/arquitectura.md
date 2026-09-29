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
Motor de insignias (src/badges/*.ts)           ← puro; corre en el servidor (Edge Function `insignias`)
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
  Desde `20260929001000_sueltos_logos.sql` todos están abiertos (y `DEFAULT_SPORT_STATUS` también); la consola del
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
`submissions`, `social`, `follows`/`profileGames` (seguir, perfil público, juegos con me gusta), `claims` (reclamos de jugadores), `people` (@usuario y buscar personas), `invites` (invitaciones a una liga), `organizer` (pendientes y suspender un día), `lanes` (pistas del boliche), `legal` (aceptación de los términos), `reports` (reportes de contenido), `solo` (juegos sueltos de boliche), `suggestions`, `liveScores`, `feeds`, `uploads`/`pending` (fotos y cola), los de
cada deporte (`matches`, `seasonTeams`, `racket`, `teamSports`, `golf`, `swimming`) y los de las insignias
(`badges`: vitrina, avisos, progreso, rareza, la liga, el evento y el título vigente; `leagueBadges`: el creador;
`badgeAdmin`: la consola). Fuera de la carpeta, `src/lib/logos.ts` (logo de ligas y torneos).

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

## Organizador: la base (`20260929000600_organizador.sql`)

Contrato completo en `supabase/README.md` («Organizador»); pruebas en `tests/sql/organizador.test.ts` y
`tests/sql/pistas.test.ts`.

- **Ligas públicas**: `public_leagues_feed` (también sin cuenta, con un límite suave por IP) da solo las públicas sin
  menores que siguen vivas, las más activas de los últimos 30 días primero, con miembros, jugadores y el próximo
  evento o partido; el teléfono arma la línea «24 jugadores · juega el martes». Crear ligas tiene tope por cuenta
  (5 por día, `rate_limited`; 20 cada 30 días, `rate_limited: mes`; trigger `leagues_quota` en `leagues`, registro en
  `private.league_creations`); sin sesión (importador de BowlingX, SQL) no cuenta.
- **Pendientes**: `league_pending` junta para el admin envíos por aprobar, partidos reclamados o sin resultado,
  reclamos y listas de espera (con enlaces), y los «primeros pasos» de una liga de menos de 30 días.
- **Juntar jugadores**: `merge_league_players` usa `private.merge_players` (la misma unión de los reclamos, que
  ahora también mueve las pistas); la cuenta del que se va pasa al que queda, y el promedio fijo y los `attrs` que le
  falten al que queda salen del otro; queda en `admin_audit`.
- **Menores**: en cualquier deporte, `create_player` / `set_player_minor` piden el tutor, su teléfono y su permiso;
  todo va a `player_private` (solo admins), como natación. `update_player` ya no marca menores. Un jugador que pasa
  a menor (por cualquier camino, también al juntar) rechaza su reclamo pendiente (trigger `players_minor_claims`).
- **Suspender un día**: `suspend_day` mueve o aplaza los partidos del día (zona de la liga), mueve o cancela los
  eventos sin resultados (cancela solo los que no tienen nada adentro: `private.event_has_content` revisa todo lo
  que se borraría en cascada), alarga el plazo de los retos de la escalera afectados y manda UN aviso con
  `league_announce` si algo cambió (`skipped` dice por qué no salió).
- **Pistas del boliche**: tabla `event_lanes` (se lee como la liga; borrados en tombstones; tiempo real `lanes` en
  `event:<id>`). El promedio para armar por promedio lo calcula el teléfono y lo manda como `p_order`. El aviso
  «Tu pista» (tag `pista:`) es de «Recordatorios»: esta migración redefine `private.push_category` para sumarlo.

## Organizador en el teléfono: ligas públicas, unirse, juntar y menores

- **Ligas públicas** (`usePublicLeagues` / `fetchPublicLeagues` en `src/lib/data/leagues.ts`, tipo `PublicLeague`):
  el Home, el Home del deporte (ya filtrado por deporte), Eventos y el selector de deporte leen
  `public_leagues_feed` (fresco 2 minutos; en el orden de la base, ya no por nombre). `PublicLeagues` muestra la
  línea `publicLeagueLine` («24 jugadores · juega el martes», «activa esta semana», un torneo «activo»;
  `src/components/home/logic.ts`) y el buscador filtra lo cargado y, desde 2 letras, también pregunta a la base
  (`p_query`). Si el listado o la búsqueda fallan (sin señal, o el límite sin cuenta), se dice eso (`LoadError`) y no
  «no hay ligas». El tope de ligas nuevas sale con su mensaje, el del día o el de 30 días (`leagueQuotaError`,
  código `league_quota`).
- **Unirse**: todo «Unirme» (la tarjeta de la liga, el aviso del boliche, «Mis juegos», las listas de públicas y
  «Me apunto» de la agenda en una liga de la que todavía no es miembro: `agendaJoinStep`) pasa
  por `useJoinFlow` (`src/components/league/WhoAreYou.tsx`): sin cuenta, a entrar; con jugadores sin cuenta en la
  liga, «¿Quién eres?»; después `join_league` con el pedido. La decisión es `joinStep` (`src/components/league/logic.ts`,
  con pruebas). El link de invitación (`JoinPage`) ya lo preguntaba.
- **Juntar con…**: en Admin › Jugadores (y en Miembros), la ficha del jugador abre `MergePlayerModal`
  (`src/components/players/`): elegir al otro, con qué nombre queda, el adelanto
  (`merge_league_players_preview`: dos cuentas, un menor con cuenta o lo que choca) y juntar
  (`mergePlayers` en `src/lib/data/players.ts`, error legible con `mergeErrorText`).
- **Menores**: en una liga con menores, «Agregar jugador» (uno o varios: «Nombre, tutor, teléfono» por línea) y la
  ficha del jugador preguntan «Es menor de edad» con el tutor, su teléfono y «El tutor dio permiso»
  (`createPlayer(…, minor)`, `setPlayerMinor`; `useGuardians` lee `player_private`, solo admins, sin guardarlo en el
  teléfono). Lo que crea jugadores al vuelo (inscribir en un evento del boliche, niveles de raqueta, jugadores de una
  noche, plantilla de un equipo) pregunta lo mismo debajo del nombre con `useQuickMinor`
  (`src/components/players/GuardianFields.tsx`); al inscribir en un evento, donde el mismo campo busca, sale después
  de tocar «Crear…» (no mientras se busca). Natación sigue en Nadadores.

## Organizador en el teléfono: pendientes, suspender un día y pistas

- **Pendientes** (`src/lib/data/organizer.ts`: `useLeaguePending`, `pendingTotal`; pantallas en
  `src/components/organizer/`): Admin › Pendientes es la primera pestaña en todos los deportes y el Admin abre ahí
  (`arrangeAdminTabs` pone primero lo de `FIRST_TABS`). Secciones con sus enlaces (`pendingSections`), «Todo al día»
  sin nada, y los «primeros pasos» mientras la liga es nueva (invitar lleva a «Liga», donde está la invitación; los
  jugadores, a la pestaña de gente del deporte). En el inicio de la liga, los admins ven una tarjeta con lo pendiente
  (`PendingHomeCard`). El número de «Admin» (LeagueShell) y el de «Pendientes» son `pendingTotal`: envíos y reclamos
  contados en vivo, más los partidos reclamados o sin resultado y las listas de espera de `league_pending` (se lee
  al volver a la pantalla y cada 2 minutos), más las sugerencias nuevas en «Admin».
- **Suspender un día** (`SuspendDayModal`): día (hoy en la zona de la liga), motivo con opciones listas, nueva fecha
  opcional; muestra lo que va a pasar (`suspend_day_preview`, `suspendLines`) y el aviso que sale, y confirma. Si sin
  nueva fecha no cambiaría nada (solo eventos con gente anotada), pide la fecha en vez de dejar suspender
  (`suspendChanges`); el aviso de listo dice por qué no salió el aviso (`skipped`). Está en
  Admin › Pendientes y, en el inicio de la liga, solo cuando hoy hay algo que suspender (`SuspendTodayCard`).
- **Pistas del boliche** (`src/lib/data/lanes.ts`, `src/lib/lanes.ts`, `src/components/lanes/`): pestaña «Pistas» del
  evento para el admin y el anotador (números como «5-9», «5 a 9» o «3, 5 y 7» con el teclado de texto, que en el
  iPhone sí tiene guion y coma; jugadores por pista, por promedio / por equipo / al azar;
  «Mover a…» por jugador, «Copiar para WhatsApp», «Publicar y avisar», «Borrar pistas»). El promedio es el del handicap
  de ese evento (`fetchEffectiveAverages` con su fecha: el de su temporada) y va como `p_order`. El jugador ve
  «Tu pista: 7 · con Ana y Luis» (`MyLane`) en el evento, en el tablero en vivo y la próxima práctica de la liga (una sola vez si esa práctica ya está en vivo), y en
  las tarjetas del Home (en juego y tu próximo evento), solo después de la primera publicación. Tiempo real `lanes` en `event:<id>` (`topics.ts`).

## Temporadas, playoffs y agenda

- Cada liga tiene sus temporadas (`seasons`: una activa como mucho; las cerradas guardan la tabla final y sus premios en
  `season_awards`). Un juego es de la temporada donde cae su día (evento: `date`; partido: `scheduled_at` o
  `created_at`, en la zona de la liga); la activa cuenta todo desde su inicio (su `ends_on` es el fin previsto). La base
  cuida que no se pisen ni se estiren a otro año: lo jugado antes de la primera entra en ella si es del mismo año; si
  no, en una cerrada «Temporada <año>» sin tabla guardada (así quedaron también los años viejos de las ligas que ya
  existían). Las tablas y rankings de TODOS los deportes se calculan en el teléfono con la temporada elegida (selector
  «Temporada 2026 ▾»); la base no calcula tablas. Una cerrada sin tabla guardada se calcula como la activa (en las
  ligas de equipos, con los equipos que jugaron sus partidos: `pastSeasonTeams`).
- En baloncesto y fútbol los equipos de temporada son de una temporada (`teams.season_id`): la tabla usa los equipos de
  la temporada elegida y sus partidos. `start_season` puede copiarlos con sus plantillas.
- Playoffs (equipos): `playoffs` + `playoff_series`; los juegos son partidos con `matches.series_id` (y `bracket_key`
  `PO<ronda>-<lugar>`), que no cuentan en la tabla. La base avanza la llave con el flujo del resultado de siempre
  (trigger en `matches`; lo que pasa sin escritura, como las 48 h, lo recoge `sync_playoffs` al abrir la llave).
- `public_agenda` («¿Dónde juego esta semana?», también sin cuenta) lista lo que viene en ligas públicas donde uno se
  puede apuntar; «Me apunto» usa el flujo de siempre (`set_rsvp`, `golf_register`, `join_signup`). Cliente:
  `src/lib/data/agenda.ts` y la página `/agenda` (`src/pages/AgendaPage.tsx`, con la entrada en el Home y en el Home de
  boliche, golf y raqueta); sin cuenta, «Me apunto» pasa por el login y vuelve con `?apuntar=<evento>`; si todavía
  no es de esa liga, primero se une con `useJoinFlow` («¿Quién eres?» si hay jugadores sin cuenta) y después se apunta
  (`agendaJoinStep` en `src/components/agenda/logic.ts`).
- Temporadas en el teléfono: `src/lib/seasons.ts` (de qué temporada es un día), `src/lib/data/seasons.ts`
  (`league_seasons`, `league_champions`; tiempo real `seasons`) y `src/components/season/SeasonSelect.tsx` (el selector
  y los premios de una cerrada).
- Cerrar y empezar (Admin › Temporada, `src/components/season/SeasonAdmin.tsx`; escrituras en
  `src/lib/data/seasonAdmin.ts`): al cerrar se guarda la «foto» de las tablas (`SeasonSnapshot` de
  `src/components/season/logic.ts`: `{v: 1, sport, at, tables: [{key, title, nameLabel, columns, rows}]}`, igual para
  todos los deportes) y se proponen campeón, subcampeón y tercero de la primera tabla (o de la final del playoff, o del
  cuadro del torneo relámpago: `podium`; con grupos y sin cuadro terminado, los elige el admin) y, en el boliche, el más
  mejorado (`suggested`). Con un playoff a medias se avisa y se pide confirmar. Cada
  deporte arma su foto con `SportScreens.useSeasonTable` (baloncesto, fútbol, raqueta, golf, natación; el boliche con
  `src/components/season/bowlingTable.ts`). Las tablas de cada deporte ponen el selector con
  `src/components/season/SeasonView.tsx` (`?temporada=`): la activa se calcula con sus juegos; una cerrada muestra sus
  premios y la foto. El historial está en `/l/:lid/temporadas` y «Campeones» en el inicio de toda liga.
- En las ligas de equipos `useTeamLeague` da los equipos de la temporada de ahora (`teams`) y todos (`allTeams`, para
  los partidos viejos); `seasonMatches` toma los partidos de una temporada. Playoffs en el teléfono:
  `src/lib/data/playoffs.ts` (tiempo real `playoffs`), la lógica en `src/pages/sports/team/playoffs.ts` y la pestaña
  «Playoffs» (`SportScreens.Playoffs`, `/l/:lid/playoffs`, la llave con `BracketView`).
- Boliche por temporada (`src/lib/bowlingSeason.ts`): el ranking de la temporada elegida, el promedio del handicap (el
  de la temporada con el mínimo de juegos; si no, el de la anterior, el fijo o el de su última entrada; la lista de
  jugadores del admin muestra ese mismo número y de dónde sale), el más
  mejorado, «Tú: 14.º · te faltan 2 juegos para entrar» y las marcas «Récord personal» y «+15 sobre tu promedio». Donde
  el teléfono no tiene toda la historia (el evento, las tarjetas del perfil) las marcas salen de `bowling_game_context`
  (`src/lib/data/bowlingContext.ts`). Una temporada cerrada muestra el promedio y el mejor juego de la tabla que se
  guardó al cerrarla (`readBowlingSnapshot`).
- Migración `20260929000700_temporadas.sql`; contrato en `supabase/README.md`; pruebas `tests/sql/temporadas.test.ts`,
  `playoffs.test.ts` y `agenda.test.ts`. Va después de la del organizador y tapa dos de sus funciones: `private.merge_players`
  (la de `000600`, con las pistas, más los premios y las tablas guardadas) y `private.push_category` (más `temporada:`,
  el push del cierre, en «Tus ligas»). El aviso del cierre es automático (no gasta el tope de avisos del admin);
  «Suspender un día» sigue siendo un aviso del admin y sí lo gasta.

## Términos, privacidad y reportes

- **Versiones**: `src/lib/legal.ts` es el único lugar de `TERMS_VERSION` y `PRIVACY_VERSION` (fechas
  `'YYYY-MM-DD'`, con desde cuándo rigen), la lista corta de lo que cambió (`LEGAL_CHANGES`), los datos del titular
  (`LEGAL_CONTACT`; lo que falta va entre corchetes y la consola › Legal lo lista) y `LEGAL_DRAFT`. La base tiene las
  mismas fechas en `private.legal_versions()` y `tests/sql/legal.test.ts` revisa que coincidan. Cambiar un texto:
  la página (`src/pages/legal`), la fecha y los cambios en `legal.ts`, y una migración nueva que redefine
  `private.legal_versions()`. Se publica primero la migración y después la app; si la app sale antes,
  `accept_legal` dice `invalido` (o todavía no existe: PGRST202 / 42883) y `LegalGate` deja seguir sin guardar por
  esa vez (queda en Errores de la consola).
- **Aceptación** (`legal_acceptances`, una fila por cuenta, documento y versión, con fecha y navegador): al crear la
  cuenta con correo, la casilla obligatoria «Acepto los Términos y la Política de privacidad»
  (`src/components/AcceptTermsBox.tsx`) viaja en la metadata (`{legal: {terms, privacy}}`) y la base la guarda al
  crear la cuenta; con Google se recuerda (`mm:acepto-legal`, 1 hora) y se acepta al volver, solo si la cuenta se
  creó después de marcarla (y se olvida al salir de la cuenta; igual la de 18 años, `mm:mayor-de-edad`). El perfil de
  `auth.tsx` trae la última versión aceptada (`profile.legal`) y `needsLegal`: quien tiene una vieja (o ninguna,
  si su cuenta es de antes de `LEGAL_TRACKED_SINCE`) ve `src/components/LegalGate.tsx` («Actualizamos los términos»
  con lo nuevo, los links, «Acepto», salir o borrar la cuenta) después de la pantalla de 18 años; una cuenta nueva
  sin nada aceptado (Google sin la casilla) ve la misma pantalla como «Antes de seguir». Las páginas legales se leen
  igual. Arriba de cada página: «Versión … · vigente desde …»; el aviso de borrador (falta un abogado dominicano)
  solo lo ve el superadmin.
- **Reportes** (`reports`): «Reportar» (`src/components/report/`) en los comentarios del boliche, los juegos de los
  perfiles y el inicio (`GameCard`), los avisos de la liga, el inicio de una liga pública para quien no es miembro y
  el perfil de otra cuenta. Motivo y nota; uno abierto por cuenta y cosa; 10 por día. Push a los superadmins (uno
  por cosa reportada). Consola › Reportes (todo, con quién reportó y las herramientas: borrar el comentario,
  bloquear la cuenta, borrar la liga) y Admin › Reportes en cada liga (comentarios, avisos y juegos de su liga, sin
  saber quién reportó y sin los de lo suyo; sale solo si la liga tuvo alguno). Un reporte cerrado no se vuelve a
  decidir (`cerrado`). «Descargar mis datos» trae también los reportes que hizo la cuenta (`my_reports`).
  Migración `20260929000900_legal.sql`.

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
  JPEG o PNG; `20260929001010_logos_supabase.sql`, solo Supabase): cualquiera con el link lo ve (la página de
  privacidad lo dice). Cada subida se reserva antes con `begin_logo_upload` (admin de la liga, 30 por día) y Storage
  solo acepta rutas reservadas, por quien las reservó, sin bloquear y por un día (`private.can_upload_logo_path`):
  nadie guarda archivos en el bucket sin pasar por el límite. Cada logo es un archivo nuevo (sin UPDATE).
- `set_league_logo` (admin; solo una ruta reservada, que se usa una vez; null lo quita, y eso cuenta en los mismos
  30 por día) devuelve el anterior para borrarlo de Storage. Lo que deja de usarse (el anterior, el de una liga
  borrada, las reservas sin usar de un día: `private.logo_uploads_cleanup`, a diario con pg_cron) va a
  `private.storage_purge_queue` con bucket `logos`, y mientras está ahí cualquier cuenta sin bloquear lo puede borrar
  (`private.can_remove_logo_path`); si nadie lo borra, lo borra la Edge Function `purge-photos` al otro día (la cola
  es por bucket: `purge_queue_take` / `purge_queue_done` con `p_bucket`, las fotos si no se dice). Lo que ve quien
  todavía no es de la liga trae el logo: `invite_preview` (columna `logo_path`), `invite_details`,
  `my_league_invites`, `league_invite_details` y la consola (`admin_league_row`); también las ligas públicas y la
  agenda, con y sin cuenta (`public_leagues_feed` y `public_agenda` traen `logoPath`).
- Cliente `src/lib/logos.ts`: `compressLogo` (en `src/lib/image.ts`: el cuadrado del centro a 256 px, WebP o JPEG,
  siempre sobre blanco para que un logo transparente se vea en claro y en oscuro, ≤ 120 kB), `uploadLeagueLogo`
  (reserva, sube, `set_league_logo`, borra el anterior), `removeLeagueLogo` y `useLogo` (URL pública con
  `storage.publicUrl`, recordada en memoria; mientras llega, un cuadro vacío del mismo tamaño). Borrar la liga borra
  su archivo después, solo si la liga se borró (`deleteLeagueWithLogo`).
- `LeagueIcon` / `LeagueLogo` (`src/components/home/LeagueCard.tsx`) lo muestran en las filas de ligas, el
  encabezado y el cambiador de liga de `LeagueShell`, la portada, el Home de la liga de boliche, /unirse,
  /invitacion, la tarjeta de invitaciones de /avisos, «Seguir en» del Home, «Por liga» de Mis estadísticas, las
  ligas públicas y «¿Dónde juego esta semana?» (/agenda); sin
  logo (o si no carga), el ícono de siempre. Se pone en Admin › Liga (en un torneo, › Datos) y, opcional, al crear.
- Migración `20260929001000_sueltos_logos.sql` (también abre todos los deportes y trae los juegos sueltos).

## Insignias

Diseño completo: `docs/insignias.md`. Contratos de la base: `supabase/README.md` («Insignias», «Motor de insignias» e
«Insignias de la liga (creador)»).

```
resultados, vínculos, cierres ──trigger──▶ private.badge_queue ◀── private.badges_daily (04:30 UTC) · badges_backfill
                                                  │
              pg_cron mm-insignias (cada 10 min) → private.cron_badges() → pg_net → Edge Function `insignias`
                                                  ▼
   badge_claim → por trabajo: badge_snapshot (jsonb) → evaluateJob (motor empaquetado) → badge_apply | badge_fail
                                                  ▼
          badge_awards · badge_progress · push agrupado (push_outbox) · tiempo real `badges` (user: y league:)
```

- **Catálogo y reglas en código, una sola fuente:** `src/badges/catalog.ts` (100 keys, 197 niveles, 9 deportes) y
  `src/badges/rules/` (actividad válida, ligas reales, juez y parte, líneas base). Los usan la app (textos, progreso,
  galería) y el motor.
- **El servidor decide, nunca el teléfono:** `src/badges/engine.ts` (`evaluate(job, snapshot, now)` corre los
  evaluadores de `src/badges/evaluators/` y asienta lo que ya existe; `decide` suma las adopciones: las copias de
  respaldo de un jugador sin cuenta pasan a la cuenta que lo reclama). `src/badges/edge.ts` pone los nombres del
  push. `pnpm badges:bundle` (rolldown de Vite 8) lo empaqueta en `supabase/functions/_shared/badges-engine.gen.js`,
  un solo ESM sin imports con el hash de sus 66 archivos; `src/badges/bundle.test.ts` falla si está viejo. **Después
  de cambiar algo de `src/badges`, `src/lib/types.ts`, `src/lib/data/rows.ts` o los helpers de deportes que usa el
  motor, `pnpm badges:bundle` antes de hacer commit.**
- **Edge Function `supabase/functions/insignias/`** (`core.ts` sin imports, como `send-push`): valida `CRON_SECRET`,
  toma hasta 25 trabajos de a 5, corta a los 100 s o ~1,2 s de CPU del motor y termina con `badge_finish` (avisos y,
  si queda cola, se vuelve a llamar). Cron: `20260929001190_insignias_cron_supabase.sql` (solo Supabase).
- **Migraciones:** `…1100_insignias.sql` (premios, progreso, rareza, vitrina, aval, fusiones), `…1110_insignias_motor.sql`
  (cola, triggers, foto de datos, aplicar, avisos, tarea diaria, historial y la consola del motor),
  `…1120_insignias_creador.sql` (insignias que diseña y da la liga, reportes y palabras bloqueadas) y
  `…1180_insignias_temporadas.sql` (solo si existe `public.seasons`, de la migración de temporadas).
- **Pantallas:** `src/badges/visual/` (el dibujo: `<Insignia>`, 5 metales, 7 formas, animación), `src/components/badges/`
  (vitrina del perfil, detalle, aviso al ganar y resumen del año, portada de la liga, página del evento, título
  vigente en la tabla, «Por confirmar», ajustes) y `src/components/badges/maker/` (el creador). Lo pesado (catálogo y
  dibujo) se carga aparte (`kit.ts`, `lazy`) solo cuando hay algo que mostrar.
- **Consola › Insignias** (`src/pages/superadmin/BadgesSection.tsx`): hazañas vencidas, reportes, palabras
  bloqueadas, la cola del motor y sus trabajos muertos, la primera corrida del historial (en seco y de verdad) contra
  la rareza estimada, la rareza real y la galería del catálogo.

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
  `tests/sql/insignias-funcion.test.ts` corre la Edge Function con el motor empaquetado contra la base de verdad.
- `pnpm test:migrar` y `pnpm exec tsc --noEmit -p scripts/migrar/tsconfig.json`: la migración desde BowlingX.
- Cuando haya Docker: `supabase start` + `supabase test db` (pgTAP) como verificación final.
