# MatchMate

Ligas y torneos de varios deportes desde el celular, en español. *Match* = partida, *mate* = compañero.
Es una app web instalable (PWA): abre sin conexión, anota en la cancha aunque no haya señal y avisa con
notificaciones.

> **Estado: Fase 0.** MatchMate nació como copia de BowlingX (29334d1) y está pasando de Firebase a
> **Supabase** (plan gratis). Primero sale el boliche igual que hoy; los demás deportes se abren por fases.
> BowlingX sigue aparte para su liga y sus datos se migran aquí al final (Fase 8).

## Deportes

| Deporte | Fase | Qué trae |
|---|---|---|
| Boliche | 0 (activo) | Todo lo de BowlingX: prácticas y torneos, handicap, categorías A–D, cuadros, fotos del marcador leídas con IA, ranking y Excel |
| Pádel | 1 y 2 | Noche de americano y mexicano, modo cancha, liga de parejas y torneo por categorías |
| Tenis y pickleball | 3 | El mismo motor de raqueta, liga por cajas y escalera |
| Baloncesto | 4 | Equipos de temporada y mesa anotadora |
| Fútbol de campo y sala | 5 | Tablas, tarjetas y disciplina |
| Golf | 6 | Tarjeta por hoyos, índice de dificultad y ventajas |
| Natación | 7 | Series y tiempos |
| Ping pong (tenis de mesa) | 3 | Motor propio de juegos a 11 (saque cada 2, dobles con rotación), liga por cajas y escalera |

Todos los deportes están abiertos. El superadmin puede poner uno en **beta** (existe en la base, pero solo él
crea ligas de él) o cerrarlo: lo decide la tabla `sport_status`, no la pantalla.

Lo que ya hace (heredado de BowlingX): cuentas con correo o Google; ligas públicas o privadas con invitación
por link, QR o código; torneos sueltos; roles de dueño, admin, anotador y superadmin; cada cuenta juega como su
propio jugador; «Voy», anuncios con cuenta regresiva y WhatsApp; anotar por pinos, teclado o total; envíos con
foto que un admin aprueba; pizarra en vivo, reacciones, comentarios y buzón anónimo; ranking por temporada,
estadísticas y Excel; modo claro/oscuro con color, tours y aviso de versión nueva.

## Arquitectura (resumen)

```
Pantallas (src/pages, src/components)
   │  hooks y funciones de src/lib/data.ts (los mismos nombres que en BowlingX)
Capa de datos (src/lib/data/*.ts)
   │  lecturas con caché persistida (src/lib/db/query.ts) · escrituras por RPC;
   │  las de cancha pasan por la cola sin conexión (src/lib/db/outbox.ts)
Backend (src/lib/backend/types.ts, un solo contrato)
   ├─ supabase.ts  producción: Postgres + RLS, Auth, Realtime Broadcast, Storage, Edge Functions
   └─ local.ts     PGlite (Postgres en el navegador) con las mismas migraciones y RLS
Base de datos (supabase/migrations/*.sql)  ← fuente de verdad: esquema, RLS, RPC y triggers
Motores de deporte (src/sports/<familia>)  ← funciones puras con pruebas, sin React ni backend
```

- Todas las tablas con RLS; el teléfono solo lee con `select` y **escribe solo por RPC** que validan permisos.
- React 19 + Vite + Tailwind 4 · Supabase Free · Vercel Hobby. Todo gratis.
- Detalle: [docs/arquitectura.md](docs/arquitectura.md). Contrato de la base (tablas, RPC, errores, tiempo real):
  [supabase/README.md](supabase/README.md).

## Correr en local (sin cuentas de nada)

```bash
pnpm install
pnpm dev
```

Abre http://localhost:5173. Sin variables de entorno la app usa el **modo local**: Postgres (PGlite) dentro
del navegador con las mismas migraciones y RLS que producción. Crea una cuenta ahí mismo: existe solo en ese
navegador (para empezar de cero: DevTools › Application › IndexedDB › borrar `matchmate`). En modo local no
hay Google, correos ni lectura de fotos con IA.

**Contra un Supabase de verdad:** copia `.env.example` a `.env.local` y llena `VITE_SUPABASE_URL` y
`VITE_SUPABASE_PUBLISHABLE_KEY`.

**Supabase completo en tu PC** (necesita Docker):

```bash
pnpm supabase:start   # la primera vez baja las imágenes; al final muestra la URL y la Publishable key
pnpm supabase:reset   # vuelve a crear la base: migraciones + supabase/seed.sql
pnpm db:types         # tipos de la base en src/lib/db.types.ts
pnpm supabase:stop
```

Pon la URL (`http://127.0.0.1:54321`) y la Publishable key en `.env.local`. El seed trae cuentas de prueba
(`admin@matchmate.local` superadmin, `org@`, `luis@`, `ana@`; contraseña `matchmate123`) y el caso de referencia
del boliche. Los correos no salen: se ven en Mailpit, http://127.0.0.1:54324.

## Pruebas

```bash
pnpm typecheck   # TypeScript
pnpm test        # unitarias: cálculos del boliche, motores de deporte, capa de datos, backend local
pnpm test:sql    # SQL: esquema, RLS, RPC y tiempo real con PGlite (sin Docker)
```

En GitHub Actions, [ci.yml](.github/workflows/ci.yml) corre las tres más el build en cada push a `main` y en
cada PR. pgTAP con `supabase start` va de noche y está apagado hasta que haga falta (ver el archivo).

## Scripts

| Script | Qué hace |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm preview` | Vite: desarrollo, paquete de producción (con chequeo de tipos) y probar el paquete |
| `pnpm typecheck` · `pnpm test` · `pnpm test:sql` | Tipos, unitarias y SQL |
| `pnpm marca` | Vuelve a generar los iconos (`public/`) y la animación de apertura (`index.html`) desde el código de la marca |
| `pnpm supabase:start` · `supabase:stop` · `supabase:reset` | Supabase en Docker (CLI por `npx`) |
| `pnpm db:types` | Tipos de TypeScript de la base local |

## Publicar y configurar Supabase

Paso a paso para el dueño (cuentas, claves, Vercel, Google, correo, IA, push, respaldos):
[docs/CONFIGURAR-SUPABASE.md](docs/CONFIGURAR-SUPABASE.md). Las variables de la app están en
[.env.example](.env.example); ningún secreto va en el repo ni en variables `VITE_*`.

Cada versión nueva se publica en orden (pruebas, base de datos, app) y, si la CLI no llega a la base, las
migraciones se pegan en el *SQL Editor*: [docs/despliegue.md](docs/despliegue.md).

Tareas automáticas en GitHub Actions:

- [keepalive.yml](.github/workflows/keepalive.yml): cada día llama a la RPC `ping` para que Supabase no pause
  los proyectos. Si falla, abre un issue.
- [backup.yml](.github/workflows/backup.yml): cada día respalda la base de producción (con las cuentas), la
  cifra con age y la guarda 14 días como archivo de la release «respaldos» (nunca en el historial de git).

## Dónde está el plan

- [docs/plan/plan.json](docs/plan/plan.json): fases, entregables, criterios de salida y lo que le toca al dueño.
- [docs/plan/critica.md](docs/plan/critica.md): correcciones al plan (seguridad, cuotas, respaldos, CI).
- `docs/plan/investigacion-*.md`: Supabase, deportes y reglas, formatos, marca, demanda en RD.
- [docs/arquitectura.md](docs/arquitectura.md) y [supabase/README.md](supabase/README.md): cómo está hecho.
- `docs/marca/`: las opciones de logo.
