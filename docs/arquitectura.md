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
  un reclamo de jugador). `42501` para permisos.
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
  avisos, `/u/:userId` perfil público, `/perfil` el propio. «Home» de la barra: fuera del Home del deporte va a él;
  en él, quita el deporte y va a `/`. Para ir al Home de todos: `setActiveSport(null)` y luego `/`.
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
  validación, tipos de evento, si usa fotos). `src/sports/status.ts` lee `sport_status` (abierto o beta).
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
`submissions`, `social`, `follows`/`profileGames` (seguir, perfil público, juegos con me gusta), `claims` (reclamos de jugadores), `suggestions`, `liveScores`, `feeds`, `uploads`/`pending` (fotos y cola), y los de
cada deporte (`matches`, `seasonTeams`, `racket`, `teamSports`, `golf`, `swimming`).

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
  boliche, golf y raqueta); sin cuenta, «Me apunto» pasa por el login y vuelve con `?apuntar=<evento>`.
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
  `playoffs.test.ts` y `agenda.test.ts`.

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
