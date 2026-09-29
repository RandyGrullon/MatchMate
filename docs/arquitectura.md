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
`submissions`, `social`, `follows`/`profileGames` (seguir, perfil público, juegos con me gusta), `claims` (reclamos de jugadores), `suggestions`, `liveScores`, `feeds`, `uploads`/`pending` (fotos y cola), los de
cada deporte (`matches`, `seasonTeams`, `racket`, `teamSports`, `golf`, `swimming`) y los de las insignias
(`badges`: vitrina, avisos, progreso, rareza, la liga, el evento y el título vigente; `leagueBadges`: el creador;
`badgeAdmin`: la consola).

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
  si queda cola, se vuelve a llamar). Cron: `20260929000890_insignias_cron_supabase.sql` (solo Supabase).
- **Migraciones:** `…0800_insignias.sql` (premios, progreso, rareza, vitrina, aval, fusiones), `…0810_insignias_motor.sql`
  (cola, triggers, foto de datos, aplicar, avisos, tarea diaria, historial y la consola del motor),
  `…0820_insignias_creador.sql` (insignias que diseña y da la liga, reportes y palabras bloqueadas) y
  `…0880_insignias_temporadas.sql` (solo si existe `public.seasons`, de la migración de temporadas).
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
