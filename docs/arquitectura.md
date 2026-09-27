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
  `no_permitido`, `rate_limited`, `invalido`, `no_existe`, `duplicado`, `cerrado`. `42501` para permisos.
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

## Pruebas

- `pnpm test`: unitarias (`src/**/*.test.ts`).
- `pnpm test:sql`: SQL y RLS con PGlite (`tests/sql/*.test.ts`, configuración `vitest.sql.config.ts`).
- Cuando haya Docker: `supabase start` + `supabase test db` (pgTAP) como verificación final.
