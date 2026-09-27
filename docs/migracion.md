# Migrar BowlingX (Firebase) a MatchMate (Supabase)

Esta guía es para **ti, el dueño**. Son comandos de copiar y pegar en PowerShell, abierta en la carpeta del repo
(`C:\Users\rgrullon\code\matchmate`). Cada paso dice cuánto tarda y cómo comprobar que salió bien.
La parte técnica (para el equipo) está al final.

## Qué pasa y qué no

**Pasa todo el historial:** las cuentas (cada quien entra **con su contraseña de siempre**; los de Google, con
Google), las ligas y torneos con su código de invitación, miembros, admins y anotadores, jugadores, eventos,
equipos, «voy», todos los juegos con sus marcas (foto, `importado`, `sin-foto`), las fotos de los últimos meses,
los envíos pendientes, aprobados y rechazados, los me gusta, los comentarios y el buzón (sigue anónimo).

**No pasa:** lo que se está anotando «en vivo» en ese momento, los borradores guardados en el teléfono (hay que
enviarlos antes del corte), y las notificaciones: están atadas al dominio viejo y cada quien las vuelve a activar
en MatchMate.

**Números idénticos:** al final la herramienta calcula promedios, rankings por temporada, clasificación de cada
evento (individual y por equipos) y lo global de cada cuenta **con el mismo código de la app** en BowlingX y en
MatchMate, y los compara uno por uno. Si algo no cuadra, te dice qué, de quién y por qué.

**Se puede repetir:** los ids nuevos salen siempre iguales de los viejos, así que correrla otra vez actualiza en
vez de duplicar. Por eso se ensaya en staging las veces que haga falta.

| Paso | Qué | Tiempo aproximado |
|---|---|---|
| 1–3 | Parámetros del hash, exportar cuentas y probar tu contraseña | 10 min (una vez, y se repite el 2 en el corte) |
| 4 | Exportar los datos y las fotos de Firestore | 5–15 min (casi todo son las fotos) |
| 5 | Ensayo en seco en tu computadora | 1–3 min |
| 6 | Ensayo en staging (2 veces) | 10–30 min cada uno |
| 7 | Corte en producción | 1–2 horas con las revisiones, un día sin liga |

La carga a Supabase tarda más o menos: 1 minuto por cada 200 cuentas, unos segundos por las tablas, y las fotos
lo que tarde tu internet en subirlas (500 MB con 10 Mbps de subida son unos 7 minutos).

## Las contraseñas: cómo se pasan (y por qué así)

Firebase guarda las contraseñas con su propio «scrypt modificado». Se miraron tres caminos (septiembre 2026):

1. **El elegido: Supabase las entiende de fábrica.** Supabase Auth (su servidor, GoTrue) acepta al crear una
   cuenta un `password_hash` con el formato de Firebase (`$fbscrypt$…`, ver `internal/crypto/password.go` de
   supabase/auth y la documentación de `auth.admin.createUser`: «Supports bcrypt, scrypt (firebase), and argon2»).
   Con los 4 parámetros del hash de tu proyecto, cada cuenta se crea con su hash de siempre y la persona entra con
   su contraseña, sin enterarse. No hay función nueva, ni contraseñas pasando por nuestro código, ni correos.
   Antes de importar, `probar-clave` verifica **tu** contraseña contra la exportación con el mismo cálculo que hace
   Supabase: si los parámetros se copiaron mal, lo sabes ahí y no el día del corte.
2. **Plan B: «¿Olvidaste tu contraseña?».** Crear las cuentas sin contraseña y que cada quien ponga una nueva
   con el correo de recuperación. Es lo más simple, pero todos tienen que hacer algo y gasta el cupo de correos
   (Resend gratis: 100 al día). Queda disponible con `--sin-claves` por si Supabase rechazara los hashes en staging.
3. **Descartado: una Edge Function «firebase-login»** que verifique el scrypt en el primer inicio de sesión y
   después ponga la contraseña con la API de admin. Funciona, pero mete contraseñas en texto claro por código
   nuestro, otro secreto (la signer key) en las funciones y un login especial en la app, para hacer lo que
   Supabase ya hace solo.

**Correos sin verificar.** BowlingX nunca pidió verificar el correo. Por seguridad las cuentas se crean con el
correo verificado **solo si Firebase lo tenía verificado** (las de Google siempre). Las demás, la primera vez que
entren, tienen que confirmar su correo (la app les manda el enlace). Así nadie que se registró con un correo ajeno
en BowlingX se queda con la cuenta del dueño real cuando este entra con Google. Si prefieres que nadie tenga que
confirmar, existe `--confiar-correos`, pero ese riesgo queda abierto.

**Superadmin.** `admin@admin.com` **no** pasa como superadmin. Los que nombraste superadmin desde BowlingX sí.
Tu cuenta: si ya la creaste en MatchMate con el mismo correo (paso 4 de CONFIGURAR-SUPABASE.md), la migración usa
esa misma cuenta y le pega tu historial. También puedes forzarlo con `--superadmin tu@correo.com`.

## Antes de empezar (una vez)

- [ ] Node 22 o más nuevo (`node --version`). Con Node 20 funciona, pero Supabase ya avisa que lo va a dejar.
- [ ] Crea una carpeta **fuera del repo**, por ejemplo `C:\migracion-bowlingx`. Todo lo de esta guía va ahí:
  correos, hashes, fotos y claves. **Nunca** va a git, al chat ni a un correo. Al terminar los 90 días, bórrala.
- [ ] Entra a Firebase desde la terminal (abre el navegador): `npx -y firebase-tools@13 login`

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
node scripts/migrar/cli.mjs importar --datos C:\migracion-bowlingx\export --auth C:\migracion-bowlingx\users.json --hash C:\migracion-bowlingx\hash.txt --fotos-meses 6
```

Lee el reporte (también queda completo en `C:\migracion-bowlingx\export\reporte-seco.json`):

- **Cuentas:** cuántas entran con su contraseña, cuántas con Google, cuántas tienen que confirmar el correo.
- **Filas por tabla:** todas con `ok`.
- **Fotos:** cuántos MB. El plan gratis tiene 1 GB para fotos (y hay que dejar espacio para las nuevas); si pasa de unos 700 MB, baja `--fotos-meses`
  (3 meses suele sobrar). Las fotos viejas no se suben, pero sus juegos **siguen verificados** (igual que cuando
  en BowlingX se borran fotos viejas).
- **Correcciones:** datos que no caben en las reglas nuevas y se arreglaron solos (teléfono con guiones →
  solo números, nombres de más de 60 letras, un 301 que alguien anotó…). Revísalas: si algo no te gusta, lo
  corriges en BowlingX y vuelves a exportar.
- **No se migran:** cosas huérfanas (juegos de un jugador que ya borraron, cuentas borradas, reacciones repetidas).
- **Paridad:** idealmente `IDÉNTICO`. Si hay diferencias, cada una es por algo de las dos listas de arriba.

Termina con código 0 si todo cuadra, o 2 si hay algo que mirar.

## Paso 6. Ensayo en staging (2 veces)

Con la dirección y la **Secret key** de **staging** (paso 2 de CONFIGURAR-SUPABASE.md):

```powershell
$env:SUPABASE_URL = "https://REF_STAGING.supabase.co"
$env:SUPABASE_SECRET_KEY = "sb_secret_..."
node scripts/migrar/cli.mjs importar --datos C:\migracion-bowlingx\export --auth C:\migracion-bowlingx\users.json --hash C:\migracion-bowlingx\hash.txt --fotos-meses 6 --destino supabase
```

Te muestra el plan y pregunta; escribe `SI`. Al final repite el reporte con los conteos **leídos de Supabase** y la
paridad calculada con lo que quedó allá (`reporte-supabase.json`). Anota cuánto tardó: es lo que va a durar el corte.

**Comprobar en staging** (con la app de staging):
- [ ] Entras con **tu correo y tu contraseña de BowlingX**.
- [ ] Una cuenta de Google entra con «Continuar con Google» y ve su historial.
- [ ] Una cuenta sin verificar recibe el correo para confirmar y después entra con su contraseña de siempre.
- [ ] El ranking de tu liga y la clasificación de un torneo se ven igual que en BowlingX.
- [ ] Las fotos recientes se ven; un link de invitación viejo (`/unirse/CODIGO`) abre la liga.

Correrlo otra vez es seguro: actualiza lo que cambió y no duplica. (Lo que se borró en BowlingX entre un ensayo y
otro se queda en staging; en producción no pasa porque se carga una sola vez, al final.)

**Si Supabase no aceptara los hashes** (ninguna cuenta con contraseña puede entrar en staging): vuelve a correr
con `--sin-claves` y todos usan «¿Olvidaste tu contraseña?». Avísale al equipo antes de hacerlo en producción.

## Paso 7. El corte (un día sin liga)

1. [ ] Unos días antes: avisa a los jugadores que envíen lo que tengan guardado en el teléfono, que el día X
   BowlingX pasa a MatchMate (mismo correo y contraseña) y que ahí vuelvan a activar las notificaciones.
2. [ ] El día del corte: BowlingX en **solo lectura** con un aviso (cambio mínimo en BowlingX que apruebas tú).
3. [ ] Exporta de nuevo: pasos 2 y 4 (a una carpeta nueva, p. ej. `C:\migracion-bowlingx\final`).
4. [ ] Ensayo en seco con la exportación final (paso 5): mismo resultado que en staging.
5. [ ] Carga a **producción**: el comando del paso 6 con la dirección y la Secret key de **producción**.
6. [ ] Revisa lo mismo del paso 6 en producción, con 5 cuentas de correo y 5 de Google.
7. [ ] Redirige el dominio de BowlingX a MatchMate (Vercel).
8. [ ] Deja Firebase en solo lectura **90 días** como respaldo. Borrarlo después lo decides y lo haces tú.
9. [ ] Borra la clave de la cuenta de servicio (paso 4) y, pasados los 90 días, la carpeta `C:\migracion-bowlingx`.

## Opciones de `importar`

| Opción | Qué hace |
|---|---|
| `--datos <carpeta o archivo>` | La exportación (carpeta con `bowlingx.json`) o un respaldo de la app (`.json`). |
| `--auth <users.json>` | La exportación de cuentas del paso 2. Sin ella las cuentas salen del respaldo y sin contraseña. |
| `--hash <hash.txt>` | Los parámetros del paso 1. Sin ellos las cuentas se crean sin contraseña. |
| `--destino supabase` | Cargar en Supabase (`SUPABASE_URL` y `SUPABASE_SECRET_KEY`). Sin esto es ensayo en seco. |
| `--seco` | Ensayo en seco aunque diga `--destino supabase`. |
| `--fotos-meses N` / `--fotos-desde AAAA-MM-DD` | Subir solo las fotos más nuevas. |
| `--superadmin correo` | Esa cuenta queda superadmin (se puede repetir). |
| `--dueno-reemplazo correo` | Quién se queda con una liga cuyo dueño ya no tiene cuenta (si no, esa liga no pasa). |
| `--confiar-correos` | Dar todos los correos por verificados (ver arriba el riesgo). |
| `--sin-claves` | Crear las cuentas sin contraseña (plan B). |
| `--env archivo` | Leer `SUPABASE_URL` y `SUPABASE_SECRET_KEY` de un archivo (fuera del repo). |
| `--reporte archivo.json` | Dónde guardar el reporte completo. |
| `--si` | No preguntar antes de cargar en Supabase. |

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
- Los juegos quedan verificados como `importado`. El handicap se guarda fijo solo si no es el de la fórmula.
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
| `target.ts` | Destinos: PGlite (shim + migraciones de verdad, como `service_role`) y Supabase (Auth admin, upsert, Storage). |
| `importar.ts` | Carga en orden, conteos y reporte. |
| `parity.ts` | Paridad con `src/lib/stats.ts` de los dos lados. |
| `exportar.ts` | Firestore REST con la cuenta de servicio (JWT RS256 con `node:crypto`), fotos a archivos. |
| `torneo.ts` | Importador de torneos con las RPC (`create_event`, `create_player`, `add_entries`, `apply_teams`, `update_entries`). |
| `fixture.ts` | Respaldo de prueba realista (y sus errores típicos). |

**Ids.** `user/<uid>`, `league/<liga>`, `player/<liga>/<jugador>`, `event/<liga>/<evento>`,
`team/<liga>/<evento>/<equipo>`, `entry/<liga>/<evento>/<jugador>` (por los campos, no por el id del documento),
`photo/<liga>/<foto>`, `submission|reaction|comment|suggestion/<liga>/<id>`. Para redirigir links viejos
(`/l/<liga>/…`) basta `leagueUuid(id)`, `playerUuid(liga, id)`, `eventUuid(liga, id)` de `ids.ts`. Una cuenta
que ya existía en MatchMate con el mismo correo conserva su uuid (`existing`); el reporte JSON trae `map` con
ligas y cuentas viejas → nuevas.

**Reglas del transformador.** `member.playerId` manda sobre `player.uid` (un jugador por cuenta y liga); un solo
dueño por liga (`ownerUid`); las marcas de foto con id pasan al uuid de la foto aunque la foto no se suba (el juego
sigue verificado, como en BowlingX); `submissions.created_by` = la cuenta del jugador (BowlingX no lo guardaba);
`live` y `limits` no se migran; `created_at` sale del documento (o de la hora de creación de Firestore en la
exportación). Toda fila de una tabla lleva las mismas columnas (el upsert de PostgREST por lotes lo necesita).

**Límites conocidos.** Correr otra vez no borra en el destino lo que se borró en BowlingX. Si entre dos corridas
cambió el dueño de una liga, el upsert de esa liga falla (`no_permitido`: el dueño solo cambia con
`transfer_ownership`); en producción no pasa porque se carga una vez. Las cuentas migradas quedan con
`adult_confirmed_at` vacío.
