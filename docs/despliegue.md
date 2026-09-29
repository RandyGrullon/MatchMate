# Publicar una versión de MatchMate

Esta guía es para quien publica una versión nueva (el dueño, o Claude con él). Una versión puede traer tres
cosas y cada una se publica aparte:

| Parte | Dónde vive | Cómo se publica |
|---|---|---|
| Base de datos: tablas, RPC, cron | `supabase/migrations/*.sql` | `npx -y supabase@2 db push` (o pegando en el *SQL Editor*, abajo) |
| Edge Functions | `supabase/functions/*` | `npx -y supabase@2 functions deploy <nombre> --project-ref REF` |
| App | `src/` | `git push` a `main`: Vercel la publica sola en unos minutos |

## El orden: 1 pruebas, 2 base de datos, 3 app

Siempre en este orden, primero en staging y después en producción:

1. **Pruebas**, en tu computadora, antes de subir nada:
   ```powershell
   pnpm typecheck
   pnpm test
   pnpm test:sql
   pnpm test:migrar
   pnpm build
   ```
   Todas tienen que pasar. GitHub Actions las repite en cada push a `main`, pero Vercel publica la app al mismo
   tiempo, sin esperar a que terminen: el CI avisa, no frena.
2. **Base de datos**: las migraciones nuevas (`db push`). Después, las Edge Functions que cambiaron (usan las RPC
   de esas migraciones) y la prueba de humo (`scripts/supabase/README.md`).
3. **App**: `git push` a `main`. Vercel la publica y los teléfonos la reciben (ver «Qué pasa en los teléfonos»).

### Por qué en ese orden

- **Los teléfonos no se actualizan todos a la vez.** La app queda guardada en el teléfono (service worker) y la
  versión nueva entra cuando la persona toca «Actualizar». Durante horas o días, la versión vieja y la nueva
  usan la misma base. Por eso la base va primero y tiene que servirles a las dos.
- **Base antes que app.** Si la app nueva llega antes que sus migraciones, llama a funciones o columnas que el
  servidor todavía no tiene: lo que la persona anota no se pierde (queda en la cola del teléfono con el aviso «Hay
  una versión nueva. Actualiza para enviar lo que tienes pendiente.»), pero no sale hasta que la base se ponga al
  día, y las pantallas que leen algo nuevo muestran error.
- **Pruebas antes que la base.** Una migración aplicada no se deshace fácil: nunca se edita (el arreglo es otra
  migración nueva) y la base es la misma para todas las versiones de la app. Las pruebas SQL corren todas las
  migraciones en PGlite, así que un error sale ahí y no en producción.
- **Las migraciones solo agregan.** En la misma versión no se borra ni se cambia de nombre una RPC, un parámetro
  o una columna que usa la versión anterior de la app. Un parámetro nuevo lleva `default` (la app vieja lo manda
  sin él). Lo viejo se quita en una versión posterior, cuando ya nadie la usa (la consola del superadmin ›
  *Errores* muestra la versión de la app de cada teléfono que reporta).

### Si algo sale mal

- **La app nueva tiene un error:** Vercel › *Deployments* › la versión anterior › *…* › **Promote to Production**
  (o *Instant Rollback*). La base se queda como está: como las migraciones solo agregan, la versión anterior
  sigue funcionando con ella. Lo que la cola de un teléfono guardó esperando la versión nueva queda, para la versión
  anterior, como un pendiente más: lo reintenta al abrir (o unas horas después) y, si su servidor tampoco lo
  reconoce, lo pasa a «No se pudo enviar», donde se puede copiar o descartar. No se traba ni se borra solo
  (`src/lib/db/outbox.ts`, `StoredItem`).
- **Una migración quedó mal:** no la edites. Escribe una migración nueva que lo arregle y publícala con el mismo
  orden (pruebas, base, app).
- **Un teléfono con la app vieja llama a algo que ya no existe:** su cola lo guarda como «espera la versión
  nueva», deja de reintentar ese grupo y muestra el aviso para actualizar. Al actualizar se vuelve a intentar; si
  la versión nueva tampoco lo reconoce, pasa a «No se pudo enviar», donde se puede copiar o descartar
  (`src/lib/db/outbox.ts`).

## Paso a paso

- [ ] `git pull` y las pruebas del paso 1, todas en verde.
- [ ] Staging: `npx -y supabase@2 link --project-ref REF_STAGING` y `npx -y supabase@2 db push` (responde `Y`).
      Si cambió alguna Edge Function: `npx -y supabase@2 functions deploy <nombre> --project-ref REF_STAGING`.
- [ ] Prueba en staging (el *Preview* de Vercel de tu rama usa staging, o `pnpm dev` con las variables de staging).
- [ ] Producción: `npx -y supabase@2 projects list` (el ligado sale con `●`), `npx -y supabase@2 link --project-ref
      REF_PROD`, `npx -y supabase@2 db push`, las Edge Functions que cambiaron y la prueba de humo:
      `npx -y supabase@2 db query --linked -f scripts/supabase/smoke.sql`.
- [ ] `git push` a `main`. En Vercel › *Deployments* la versión nueva sale *Ready* en unos minutos.
- [ ] Abre https://matchmate.vercel.app: sale «Hay una versión nueva» (o recarga). Mira la consola del superadmin
      › *Sistema* (migraciones y cron) y *Errores* durante el día.

Nunca uses `--include-seed` en `db push`: el seed trae cuentas de prueba con contraseña conocida.

## Si la CLI no se conecta: pegar la migración en el SQL Editor

`db push` entra directo a la base (puertos 5432 o 6543). A veces no puede: la red de la oficina bloquea esos
puertos, la dirección de la base es solo IPv6, o la contraseña cambió. Sale algo como `failed to connect`,
`connection refused`, `timeout` o `password authentication failed`. En ese caso las migraciones se aplican a mano
desde el navegador:

1. **Qué falta.** Supabase › el proyecto › *SQL Editor* › *New query*:
   ```sql
   select version from supabase_migrations.schema_migrations order by version desc limit 10;
   ```
   Cada archivo de `supabase/migrations` empieza con su versión (`20260929000500_avisos_telefono.sql` →
   `20260929000500`). Faltan los archivos cuya versión no sale en la lista.
2. **Una por una, en orden** (de la versión más baja a la más alta), **incluidos los que terminan en
   `_supabase.sql`** (cron, Storage, Realtime: en producción sí van). Por cada archivo, en una *New query*:
   - escribe `begin;` en la primera línea;
   - abre el archivo en el repo, copia **todo** y pégalo debajo;
   - al final agrega el registro de la migración y `commit;` (cambia la versión por la del archivo):
     ```sql
     insert into supabase_migrations.schema_migrations (version) values ('20260929000500')
     on conflict (version) do nothing;
     commit;
     ```
   - *Run*. Con `begin;` y `commit;` va todo o nada: si sale un error, no quedó nada a medias. Copia el error,
     no sigas con el siguiente archivo y pásaselo a Claude.
3. **Registrar es obligatorio.** Sin el `insert`, el próximo `db push` intentaría aplicar esa migración otra vez
   y la prueba de humo dice `faltan migraciones`.
4. **Comprobar:** repite la consulta del punto 1 (salen las versiones nuevas) y corre la prueba de humo. Si la
   CLI tampoco llega por la Management API, pega `scripts/supabase/smoke.sql` entero en el *SQL Editor*: termina
   en `ROLLBACK` y no guarda nada.

Notas:

- Los archivos `_supabase.sql` programan el cron con `pg_cron` y llaman funciones con `pg_net`. Si esas extensiones
  no están activadas (*Database › Extensions*), solo avisan y no programan nada: actívalas y vuelve a correr ese
  archivo (se puede repetir sin problema).
- `npx -y supabase@2 db query --linked -f supabase/migrations/<archivo>.sql` hace lo mismo desde la terminal por
  HTTPS (la Management API, la que usa la prueba de humo) y suele pasar donde `db push` no; el registro del punto 2
  igual hay que hacerlo.
- Las Edge Functions (`functions deploy`) también van por HTTPS: no dependen de que `db push` conecte.

## Qué pasa en los teléfonos

- La app pregunta si hay una versión nueva al volver a ella, al volver la señal y cada 30 minutos si sigue abierta
  (`src/lib/appUpdate.ts`). Cuando la encuentra, muestra «Hay una versión nueva» con el botón *Actualizar*; nunca
  recarga sola si hay algo por enviar.
- Lo que se anotó sin señal queda guardado en el teléfono y sale después de actualizar: la cola aguanta recargar.
- Si el servidor no reconoce una operación de la cola (la app es vieja o la base todavía no se puso al día),
  la barra de arriba dice «N por enviar: actualiza la app» y sale el aviso «Hay una versión nueva. Actualiza para
  enviar lo que tienes pendiente.».
