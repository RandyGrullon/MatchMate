# Migrar BowlingX (Firebase) a MatchMate (Supabase)

Esta guía es para **ti, el dueño**. Son comandos de copiar y pegar en PowerShell, abierta en la carpeta del repo
(`C:\Users\rgrullon\code\matchmate`). Cada paso dice cuánto tarda y cómo comprobar que salió bien.
La parte técnica (para el equipo) está al final.

## Qué pasa y qué no

**Pasa todo el historial:** las cuentas (cada quien entra **con su contraseña de siempre**; los de Google, con
Google), las ligas y torneos con su código de invitación, miembros, admins y anotadores, jugadores, eventos,
equipos, «voy», todos los juegos con sus marcas (foto, `importado`, `sin-foto`), las fotos de los últimos meses,
los envíos pendientes, aprobados y rechazados, los me gusta, los comentarios y el buzón (sigue anónimo). Todo queda
como **boliche**, en la hora de **Santo Domingo**.

**No pasa:** lo que se está anotando «en vivo» en ese momento, los borradores guardados en el teléfono (hay que
enviarlos antes del corte), y las notificaciones: están atadas al dominio viejo y cada quien las vuelve a activar
en MatchMate.

**Números idénticos:** al final la herramienta calcula promedios, rankings por temporada, clasificación de cada
evento (individual y por equipos) y lo global de cada cuenta **con el mismo código de la app** en BowlingX y en
MatchMate, y los compara uno por uno. Si algo no cuadra, te dice qué, de quién y por qué.

**Hay un solo proyecto de Supabase (no hay staging).** Por eso el ensayo es así:
1. **Ensayo en seco** en tu computadora (un Postgres de mentira con las mismas reglas de MatchMate), las veces que
   quieras. No toca internet.
2. **Primera carga en el proyecto de verdad**, antes del corte, con BowlingX todavía funcionando. Revisas en la app
   que todo esté bien. Nadie más la ve todavía (tus jugadores siguen en BowlingX).
3. **El corte:** BowlingX en solo lectura, exportas otra vez y **vuelves a correr la misma carga**. Los ids nuevos
   salen siempre iguales de los viejos, así que actualiza en vez de duplicar, y además **borra lo que se borró en
   BowlingX** entre una carga y otra (una reacción que quitaron, alguien que salió de la liga, un juego borrado),
   pone al día las cuentas (la contraseña que alguien cambió en BowlingX, el correo que verificó) y te dice qué hay
   hecho en MatchMate en esas ligas (tus pruebas). Antes de escribir nada te muestra la lista y pregunta.

Si prefieres, 2 y 3 pueden ser el mismo día: congelas BowlingX, exportas, ensayas en seco y cargas una sola vez.

| Paso | Qué | Tiempo aproximado |
|---|---|---|
| 0 | Preparar el proyecto (una migración nueva) y probar la clave | 5 min, una vez |
| 1–3 | Parámetros del hash, exportar cuentas y probar tu contraseña | 10 min (una vez, y se repite el 2 en el corte) |
| 4 | Exportar los datos y las fotos de Firestore | 5–15 min (casi todo son las fotos) |
| 5 | Ensayo en seco en tu computadora | 1–3 min |
| 6 | Primera carga en MatchMate y revisión | 10–30 min |
| 7 | El corte: exportar otra vez y volver a cargar | 1–2 horas con las revisiones, un día sin liga |

La carga a Supabase tarda más o menos: 1 minuto por cada 200 cuentas, unos segundos por las tablas, y las fotos
lo que tarde tu internet en subirlas (500 MB con 10 Mbps de subida son unos 7 minutos). Al volver a cargar, las
fotos que ya subieron no se suben otra vez.

## Las contraseñas: cómo se pasan (y por qué así)

Firebase guarda las contraseñas con su propio «scrypt modificado». Se miraron tres caminos (septiembre 2026):

1. **El elegido: Supabase las entiende de fábrica.** Supabase Auth (su servidor, GoTrue) acepta al crear una
   cuenta un `password_hash` con el formato de Firebase (`$fbscrypt$…`, ver `internal/crypto/password.go` de
   supabase/auth y la documentación de `auth.admin.createUser`: «Supports bcrypt, scrypt (firebase), and argon2»).
   Con los 4 parámetros del hash de tu proyecto, cada cuenta se crea con su hash de siempre y la persona entra con
   su contraseña, sin enterarse. No hay función nueva, ni contraseñas pasando por nuestro código, ni correos.
   Antes de importar, `probar-clave` verifica **tu** contraseña contra la exportación con el mismo cálculo que hace
   Supabase: si los parámetros se copiaron mal, lo sabes ahí y no el día del corte.
   Esa API no deja **cambiar** el hash de una cuenta que ya existe. Para el corte (volver a cargar) está la función
   `migration_sync_passwords` (paso 0): a las cuentas de BowlingX que **todavía no han entrado a MatchMate** les
   pone el hash de la exportación final; a las que ya entraron no las toca (manda su contraseña de MatchMate).
2. **Plan B: «¿Olvidaste tu contraseña?».** Crear las cuentas sin contraseña y que cada quien ponga una nueva
   con el correo de recuperación. Es lo más simple, pero todos tienen que hacer algo y gasta el cupo de correos.
   Queda disponible con `--sin-claves` por si Supabase rechazara los hashes en la primera carga.
3. **Descartado: una Edge Function «firebase-login»** que verifique el scrypt en el primer inicio de sesión y
   después ponga la contraseña con la API de admin. Funciona, pero mete contraseñas en texto claro por código
   nuestro, otro secreto (la signer key) en las funciones y un login especial en la app, para hacer lo que
   Supabase ya hace solo.

**Correos sin verificar.** BowlingX nunca pidió verificar el correo, así que casi todas las cuentas con contraseña
vienen sin verificar. Por seguridad las cuentas se crean con el correo verificado **solo si Firebase lo tenía
verificado** (las de Google siempre). Las demás, la primera vez que entren, tienen que confirmar su correo: al
entrar la app dice que falta confirmarlo y les muestra el botón «Mandarme el link para confirmar» (Supabase no les
manda nada al crearlas). Así nadie que se registró con un correo ajeno en BowlingX se queda con la cuenta del dueño
real cuando este entra con Google. Si prefieres que nadie tenga que confirmar, existe `--confiar-correos`, pero ese
riesgo queda abierto. **Decídelo antes del paso 6** (el reporte del ensayo en seco te dice cuántas son). Ojo con el
cupo de correos (paso 6 de CONFIGURAR-SUPABASE.md: 30 por hora; en *Authentication › Rate Limits* revisa que no
diga 2): si toda la liga entra la misma noche, algunos tendrán que esperar al link.

**18 años.** BowlingX nunca preguntó la edad, así que las cuentas migradas llegan **sin** «tengo 18 años o más»
(`adult_confirmed_at` vacío, a propósito: no se inventa un sí que nadie dio). La primera vez que entran, la app les
pregunta una sola vez (pantalla «Antes de seguir») y listo. Volver a cargar no lo borra.

**Superadmin.** `admin@admin.com` **no** pasa como superadmin. Los que nombraste superadmin desde BowlingX sí.
Tu cuenta: si ya la creaste en MatchMate con el mismo correo (paso 4 de CONFIGURAR-SUPABASE.md), la migración usa
esa misma cuenta y le pega tu historial (y no le quita el superadmin). También puedes forzarlo con
`--superadmin tu@correo.com`.

**Cuentas deshabilitadas en Firebase** (si hay): se crean bloqueadas en Auth (no entran) y salen bloqueadas en la
consola con el motivo «Deshabilitada en BowlingX». Para dejar entrar a una: Supabase › *Authentication* › la cuenta
› quitar el bloqueo (*Unban*), y en la consola, *Desbloquear*.

## Antes de empezar (una vez)

- [ ] Node 22 o más nuevo (`node --version`). Con Node 20 funciona, pero Supabase ya avisa que lo va a dejar.
- [ ] Crea una carpeta **fuera del repo**, por ejemplo `C:\migracion-bowlingx`. Todo lo de esta guía va ahí:
  correos, hashes, fotos y claves. **Nunca** va a git, al chat ni a un correo. Al terminar los 90 días, bórrala.
- [ ] Entra a Firebase desde la terminal (abre el navegador): `npx -y firebase-tools@13 login`
- [ ] Crea `C:\migracion-bowlingx\supabase.env` con estas dos líneas (la Secret key: Supabase › *Project Settings*
  › *API Keys* › *Secret keys* › `default` › *Reveal*):
  ```
  SUPABASE_URL=https://jbismsdjgjxutfvwnlmf.supabase.co
  SUPABASE_SECRET_KEY=sb_secret_...
  ```
  Tiene que ser la **Secret key nueva** (`sb_secret_…`). Las claves viejas (`service_role`, las que empiezan con
  `eyJ`) están desactivadas en el proyecto: la herramienta las rechaza con un mensaje claro.

## Paso 0. Preparar el proyecto (5 min, una vez)

- [ ] Sube la migración nueva `supabase/migrations/20260928000100_migracion_claves.sql` (la función
  `migration_sync_passwords`; solo la puede usar la clave secreta):
  ```powershell
  npx -y supabase@2 link --project-ref jbismsdjgjxutfvwnlmf
  npx -y supabase@2 db push
  ```
  `link` pide la contraseña de la base. `db push` debe listar **solo** `20260928000100_migracion_claves.sql` (las
  demás ya están); si lista otras, para y avísale al equipo. Responde `Y`.
- [ ] Prueba la clave y el proyecto (solo lee, no escribe nada):
  ```powershell
  node scripts/migrar/cli.mjs probar-destino --env C:\migracion-bowlingx\supabase.env
  ```
  **Tiene que terminar con `Todo listo para importar.`**: la API de admin responde, las 14 tablas se leen, la
  función `migration_sync_passwords` está y el bucket `scoreboards` es privado, de 1 MB, JPEG y WebP.

## Paso 1. Parámetros del hash (2 min)

- [ ] Consola de Firebase › proyecto **bowlinx-12368** › *Authentication* › *Users* › el menú **⋮** arriba de la
  lista › *Password hash parameters*.
- [ ] Copia todo el bloque (`hash_config { algorithm: SCRYPT, base64_signer_key: …, base64_salt_separator: …,
  rounds: 8, mem_cost: 14 }`) y pégalo tal cual en `C:\migracion-bowlingx\hash.txt`.

Es secreto: con eso y la exportación se pueden probar contraseñas.

## Paso 2. Exportar las cuentas (1 min)

```powershell
npx -y firebase-tools@13 auth:export C:\migracion-bowlingx\users.json --format=json --project bowlinx-12368
```

**Comprobar:** dice `Exported N account(s)` con el número de cuentas que ves en la consola.

## Paso 3. Probar tu contraseña (1 min)

```powershell
node scripts/migrar/cli.mjs probar-clave --auth C:\migracion-bowlingx\users.json --hash C:\migracion-bowlingx\hash.txt --correo tu@correo.com
```

Escribe tu contraseña de BowlingX (no se ve mientras escribes). **Tiene que decir `BIEN`.** Si dice `NO coincide`
y la contraseña está bien, vuelve a copiar el paso 1.

## Paso 4. Exportar los datos y las fotos (5–15 min)

- [ ] Consola de Firebase › ⚙ *Configuración del proyecto* › *Cuentas de servicio* › *Generar nueva clave privada*.
  Guarda el archivo como `C:\migracion-bowlingx\cuenta-servicio.json`. Es la llave de toda la base: al terminar la
  migración, bórrala desde esa misma pantalla (*Administrar permisos de la cuenta de servicio* › *Claves*).
- [ ] Exporta:
  ```powershell
  node scripts/migrar/cli.mjs exportar --cuenta-servicio C:\migracion-bowlingx\cuenta-servicio.json --salida C:\migracion-bowlingx\export
  ```

Queda `C:\migracion-bowlingx\export\bowlingx.json` (ligas, cuentas, juegos, códigos de invitación) y la carpeta
`fotos\`. Va diciendo cada liga con sus jugadores, eventos, juegos y fotos.

Sin cuenta de servicio también sirve el botón «Respaldo completo» de BowlingX (superadmin), pero ese no trae las
fotos ni los códigos de invitación (los links viejos de invitación dejarían de servir).

## Paso 5. Ensayo en seco (1–3 min)

Carga todo en un Postgres **dentro de tu computadora** con las mismas reglas de MatchMate. No toca internet.

```powershell
node scripts/migrar/cli.mjs importar --datos C:\migracion-bowlingx\export --auth C:\migracion-bowlingx\users.json --hash C:\migracion-bowlingx\hash.txt --fotos-desde 2026-04-01
```

`--fotos-desde`: las fotos de antes de esa fecha no se suben (sus juegos **siguen verificados**, igual que cuando en
BowlingX se borran fotos viejas). Usa **la misma fecha** en el paso 6 y en el corte, para que al volver a cargar no
se borren fotos que ya subieron. Unos 6 meses antes del corte suele alcanzar.

Lee el reporte (también queda completo en `C:\migracion-bowlingx\export\reporte-seco.json`):

- **Cuentas:** cuántas entran con su contraseña, cuántas con Google, cuántas tienen que confirmar el correo.
- **Filas por tabla:** todas con `ok`.
- **Fotos:** cuántos MB. El plan gratis tiene 1 GB para fotos (y hay que dejar espacio para las nuevas); si pasa
  de unos 700 MB, usa una fecha más reciente en `--fotos-desde` (3 meses suele sobrar).
- **Correcciones:** datos que no caben en las reglas nuevas y se arreglaron solos (teléfono con guiones →
  solo números, nombres de más de 60 letras, un 301 que alguien anotó…). Revísalas: si algo no te gusta, lo
  corriges en BowlingX y vuelves a exportar.
- **No se migran:** cosas huérfanas (juegos de un jugador que ya borraron, cuentas borradas, reacciones repetidas).
- **Paridad:** idealmente `IDÉNTICO`. Si hay diferencias, cada una es por algo de las dos listas de arriba.

Termina con código 0 si todo cuadra, o 2 si hay algo que mirar.

**¿Todavía no tienes la exportación?** Puedes ensayar con una de mentira que tiene la forma exacta de la de verdad
(2 ligas, 32 jugadores, unos 1 700 juegos de dos temporadas, torneos con equipos y handicap, envíos, fotos,
reacciones, cuentas con contraseña y con Google):
```powershell
node scripts/migrar/cli.mjs sintetico --salida C:\migracion-bowlingx\sintetico
node scripts/migrar/cli.mjs importar --datos C:\migracion-bowlingx\sintetico --auth C:\migracion-bowlingx\sintetico\users.json --hash C:\migracion-bowlingx\sintetico\hash.txt --fotos-desde 2026-03-27
```
Tiene que terminar en `IDÉNTICO` y código 0. **Nunca** cargues la sintética en Supabase.

## Paso 6. Primera carga en MatchMate (10–30 min)

Con BowlingX todavía funcionando. Primero el ensayo en seco del paso 5 con la misma exportación.

```powershell
node scripts/migrar/cli.mjs importar --datos C:\migracion-bowlingx\export --auth C:\migracion-bowlingx\users.json --hash C:\migracion-bowlingx\hash.txt --fotos-desde 2026-04-01 --destino supabase --env C:\migracion-bowlingx\supabase.env
```

Te muestra el plan y lo que ya hay en MatchMate (la primera vez: «Nada de una carga anterior») y pregunta; escribe
`SI`. Al final repite el reporte con los conteos **leídos de Supabase** y la paridad calculada con lo que quedó allá
(`reporte-supabase.json`). Anota cuánto tardó: es lo que va a durar el corte.

**Comprobar** (en la app, https://matchmate.vercel.app):
- [ ] Entras con **tu correo y tu contraseña de BowlingX** (y te pregunta una vez lo de los 18 años).
- [ ] Una cuenta de Google entra con «Continuar con Google» y ve su historial.
- [ ] Una cuenta sin verificar entra con su contraseña, ve «Confirma tu correo», toca «Mandarme el link para
  confirmar», recibe el correo y después entra con su contraseña de siempre. (Que la primera vez entre con su correo,
  no con Google.)
- [ ] El ranking de tu liga y la clasificación de un torneo se ven igual que en BowlingX.
- [ ] Las fotos recientes se ven; un link de invitación viejo (`/unirse/CODIGO`) abre la liga.

Mientras BowlingX siga siendo la app de la liga, **mira pero no anotes** en las ligas migradas: lo que se hace en
BowlingX es lo que vale. Si igual pruebas algo (una cuenta de prueba que se une, un juego), no pasa nada: en el
corte la herramienta te lo muestra y con `--limpiar` lo borra.

**Si Supabase no aceptara los hashes** (ninguna cuenta con contraseña puede entrar): vuelve a correr con
`--sin-claves` y todos usan «¿Olvidaste tu contraseña?». Avísale al equipo antes.

## Paso 7. El corte (un día sin liga)

1. [ ] Unos días antes: avisa a los jugadores que envíen lo que tengan guardado en el teléfono, que el día X
   BowlingX pasa a MatchMate (mismo correo y contraseña) y que ahí vuelvan a activar las notificaciones.
2. [ ] El día del corte: BowlingX en **solo lectura** con un aviso (cambio mínimo en BowlingX que apruebas tú).
3. [ ] Exporta de nuevo, a una carpeta nueva:
   ```powershell
   npx -y firebase-tools@13 auth:export C:\migracion-bowlingx\final\users.json --format=json --project bowlinx-12368
   node scripts/migrar/cli.mjs exportar --cuenta-servicio C:\migracion-bowlingx\cuenta-servicio.json --salida C:\migracion-bowlingx\final
   ```
4. [ ] Ensayo en seco con la exportación final (el comando del paso 5 con `--datos C:\migracion-bowlingx\final`
   y `--auth C:\migracion-bowlingx\final\users.json`): código 0.
5. [ ] Vuelve a cargar, con la misma fecha de fotos y `--limpiar`:
   ```powershell
   node scripts/migrar/cli.mjs importar --datos C:\migracion-bowlingx\final --auth C:\migracion-bowlingx\final\users.json --hash C:\migracion-bowlingx\hash.txt --fotos-desde 2026-04-01 --destino supabase --env C:\migracion-bowlingx\supabase.env --limpiar
   ```
   Antes de preguntar te dice qué va a **borrar** (lo que se borró en BowlingX desde la primera carga, y con
   `--limpiar` lo que se hizo en MatchMate en esas ligas: tus pruebas) y qué cuentas pone al día. Léelo y escribe
   `SI`. Tiene que terminar con todas las tablas `ok`, `IDÉNTICO` y código 0. Se puede correr otra vez: si ya está
   todo, no borra ni cambia nada.
6. [ ] Revisa lo mismo del paso 6, con 5 cuentas de correo y 5 de Google.
7. [ ] Redirige el dominio de BowlingX a MatchMate (Vercel) y apaga en GitHub el Action «Recordatorios» de BowlingX
   (si no, a los jugadores les llegan los recordatorios de las dos apps).
8. [ ] Desde aquí MatchMate es la app de la liga: **no vuelvas a correr la importación** (borraría lo nuevo que se
   haga en esas ligas si usas `--limpiar`, y el resto lo pisaría con lo de BowlingX).
9. [ ] Deja Firebase en solo lectura **90 días** como respaldo. Borrarlo después lo decides y lo haces tú.
10. [ ] Borra la clave de la cuenta de servicio (paso 4) y, pasados los 90 días, la carpeta `C:\migracion-bowlingx`.

## Opciones de `importar`

| Opción | Qué hace |
|---|---|
| `--datos <carpeta o archivo>` | La exportación (carpeta con `bowlingx.json`) o un respaldo de la app (`.json`). |
| `--auth <users.json>` | La exportación de cuentas del paso 2. Sin ella las cuentas salen del respaldo y sin contraseña. |
| `--hash <hash.txt>` | Los parámetros del paso 1. Sin ellos las cuentas se crean sin contraseña. |
| `--destino supabase` | Cargar en Supabase (`SUPABASE_URL` y `SUPABASE_SECRET_KEY` nueva, `sb_secret_…`). Sin esto es ensayo en seco. |
| `--seco` | Ensayo en seco aunque diga `--destino supabase`. |
| `--fotos-desde AAAA-MM-DD` / `--fotos-meses N` | Subir solo las fotos más nuevas. Para volver a cargar, mejor la fecha fija. |
| `--superadmin correo` | Esa cuenta queda superadmin (se puede repetir). |
| `--dueno-reemplazo correo` | Quién se queda con una liga cuyo dueño ya no tiene cuenta (si no, esa liga no pasa). |
| `--confiar-correos` | Dar todos los correos por verificados (ver arriba el riesgo). |
| `--sin-claves` | Crear las cuentas sin contraseña (plan B). |
| `--limpiar` | Al volver a cargar, borrar también lo hecho en MatchMate en las ligas migradas (pruebas antes del corte). |
| `--sin-borrar` | Al volver a cargar, no borrar nada (lo que se borró en BowlingX se queda; los conteos dirán `OJO`). |
| `--env archivo` | Leer `SUPABASE_URL` y `SUPABASE_SECRET_KEY` de un archivo (fuera del repo). |
| `--reporte archivo.json` | Dónde guardar el reporte completo. |
| `--si` | No preguntar antes de cargar en Supabase. |

Otros comandos: `probar-destino [--env archivo]` (paso 0, solo lee), `sintetico --salida <carpeta>` (exportación de
mentira para ensayar), `probar-clave` (paso 3), `exportar` (paso 4).

## Torneos del Excel

El importador de torneos históricos de BowlingX ahora carga en MatchMate, con las mismas reglas que la app (como
un admin de la liga). El archivo JSON es el mismo de antes:

```json
{
  "event": { "id": "torneo-2025", "type": "torneo", "name": "Torneo 2025", "date": "2025-11-15", "games": 3,
             "hcpBase": 230, "hcpPercent": 80, "individualRankBy": "hcp", "teamRankBy": "scratch", "teamSize": 3 },
  "teams": ["Los Strikes", "Los Spares"],
  "players": [{ "name": "Ana Pérez", "average": 180, "handicap": 40, "team": "Los Strikes", "scores": [190, 175, 201] }]
}
```

```powershell
node scripts/importar-torneo.mjs scripts/datos/torneo-2025.json --liga <id-de-la-liga>
```

(o `node scripts/migrar/cli.mjs torneo …`, es lo mismo). El id de la liga es el que sale en el link de MatchMate
(`/l/<id>`). Usa el proyecto de `.env.local` y te pide el correo y la contraseña de un admin de esa liga.
- Reusa los jugadores con el mismo nombre (sin importar tildes ni mayúsculas) y crea los que falten.
- Los juegos quedan anotados sin foto (`sin-foto`): cuentan en la tabla y el promedio como siempre. `importado`
  (juego validado para las insignias) solo lo escribe el importador de BowlingX con la clave secreta: desde la sesión
  de un admin la base no lo acepta (un admin no valida lo que él mismo escribe). El handicap se guarda fijo solo si no
  es el de la fórmula.
- Si el torneo ya está (el mismo archivo, o uno con el mismo nombre y fecha, por ejemplo el que vino de
  BowlingX), no lo toca; con `--reemplazar` lo borra con sus juegos y lo carga de nuevo.

---

## Para el equipo (técnico)

Código en `scripts/migrar/` (pruebas: `npx vitest run -c scripts/migrar/vitest.config.ts`; tipos:
`npx tsc --noEmit -p scripts/migrar/tsconfig.json`). `cli.mjs` carga los `.ts` con el ejecutor de módulos de Vite.

| Archivo | Qué hace |
|---|---|
| `ids.ts` | UUID v5 (SHA-1 propio, síncrono, sirve en el navegador) en el espacio fijo `BOWLINGX_NAMESPACE`. |
| `hash.ts` | Parámetros de la consola, armar `$fbscrypt$` y verificarlo igual que GoTrue (probado con su caso de prueba). |
| `transform.ts` | Respaldo + `auth:export` → cuentas, filas por tabla en orden, archivos de fotos y reporte. Puro. |
| `target.ts` | Destinos: PGlite (shim + migraciones de verdad, como `service_role`) y Supabase (Auth admin, upsert, Storage, claves, borrar). |
| `importar.ts` | Qué hay ya en el destino (`scanTarget`), carga en orden, cuentas al día, conteos y reporte. |
| `parity.ts` | Paridad con `src/lib/stats.ts` de los dos lados. |
| `exportar.ts` | Firestore REST con la cuenta de servicio (JWT RS256 con `node:crypto`), fotos a archivos. |
| `torneo.ts` | Importador de torneos con las RPC (`create_event`, `create_player`, `add_entries`, `apply_teams`, `update_entries`). |
| `fixture.ts` | Respaldo de prueba chico (y sus errores típicos). |
| `sintetico.ts` | Exportación realista grande (forma exacta de `exportar` + `auth:export` + `hash.txt`), con semilla. |

**Ids.** `user/<uid>`, `league/<liga>`, `player/<liga>/<jugador>`, `event/<liga>/<evento>`,
`team/<liga>/<evento>/<equipo>`, `entry/<liga>/<evento>/<jugador>` (por los campos, no por el id del documento),
`photo/<liga>/<foto>`, `submission|reaction|comment|suggestion/<liga>/<id>`. Para redirigir links viejos
(`/l/<liga>/…`) basta `leagueUuid(id)`, `playerUuid(liga, id)`, `eventUuid(liga, id)` de `ids.ts`. Una cuenta
que ya existía en MatchMate con el mismo correo conserva su uuid (`existing`); el reporte JSON trae `map` con
ligas y cuentas viejas → nuevas. Todo lo que viene de BowlingX tiene id **v5**; la app hace siempre v4: así se sabe
qué vino de BowlingX al volver a cargar.

**Reglas del transformador.** `member.playerId` manda sobre `player.uid` (un jugador por cuenta y liga); un solo
dueño por liga (`ownerUid`); las marcas de foto con id pasan al uuid de la foto aunque la foto no se suba (el juego
sigue verificado, como en BowlingX); `submissions.created_by` = la cuenta del jugador (BowlingX no lo guardaba);
`live` y `limits` no se migran; `created_at` sale del documento (o de la hora de creación de Firestore en la
exportación); `sport = 'bowling'`, `tz = 'America/Santo_Domingo'`, `has_minors = false`, `is_minor = false`;
`profiles.adult_confirmed_at` vacío (AdultGate pregunta una vez); deshabilitada en Firebase → baneada en Auth y
`profiles.blocked_at` con el motivo. Toda fila de una tabla lleva las mismas columnas (el upsert de PostgREST por
lotes lo necesita).

**Destino Supabase.** Solo con la Secret key nueva (`checkSupabaseEnv` rechaza JWT viejos y la publishable);
supabase-js 2.117 la manda en `apikey` y `Authorization: Bearer` y la puerta de Supabase la cambia por un JWT de
`service_role` (salta la RLS, no los CHECK ni los triggers). Cuentas con `auth.admin.createUser` (id v5,
`password_hash` `$fbscrypt$`, `email_confirm`, `app_metadata.firebase_uid`, `ban_duration`); filas por upsert de
PostgREST de a 500 (el `max_rows` del proyecto); lecturas y claves por páginas de 500 hasta una vacía; borrados de a
100 ids; fotos a Storage `scoreboards/<liga>/<foto>.jpg` (la misma ruta que exigen el CHECK de `photos` y las
políticas), sin reemplazar (409 = ya estaba). La única RPC es `migration_sync_passwords` (solo `service_role`).

**Volver a cargar.** `scanTarget` lee las claves de las tablas de las ligas del plan y separa: lo que está en el
plan (se pone al día por upsert; si un jugador pasa su cuenta a otro, primero `unlinkPlayers`), lo v5 que ya no
está (se borra, hijos primero, y los archivos de sus fotos: nada consume todavía `private.storage_purge_queue`),
lo v4 que ocupa una clave única de BowlingX (`entries (event_id, player_id)`, `reactions (entry_id, user_id)`,
`players (league_id, user_id)`: se borra) y lo demás v4 (se deja y se cuenta; `--limpiar` lo borra). Cuentas de una
carga anterior: `confirmEmail` si Firebase ya lo verificó y `migration_sync_passwords` si nunca entraron a
MatchMate. La paridad solo compara lo v5. Ligas y cuentas v5 que ya no están en BowlingX no se tocan (se avisan).

**Límites conocidos.** Si entre dos corridas cambió el dueño de una liga, el upsert de esa liga falla
(`no_permitido`: el dueño solo cambia con `transfer_ownership`). El nombre del perfil de una cuenta que ya existía
no se actualiza (el de sus membresías y jugadores sí). Una cuenta deshabilitada o habilitada en Firebase después de
la primera carga no cambia en Auth.
