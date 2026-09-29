# Configurar Supabase, Vercel, Google y GitHub para MatchMate

Esta guía es para **ti, el dueño**. Son pasos de hacer clic y copiar/pegar; ninguno pide programar.
Cada paso dice **quién lo hace** y **cómo comprobar** que quedó bien. Ve marcando las casillas.

**Regla de oro de las claves:** las claves secretas (las que empiezan con `sb_secret_`, contraseñas de la base,
la clave de Gemini, la VAPID privada, el CRON_SECRET, la contraseña de Gmail y la clave privada de age) las pegas
**tú** directo en Supabase, Vercel o GitHub, y las guardas en tu gestor de contraseñas. No se las pases a Claude
ni las pegues en el chat, en un correo o en el repo. Lo público sí se puede compartir: la URL del proyecto, la
clave `sb_publishable_`, la VAPID pública y la site key de Turnstile.

## Qué ya está hecho y qué falta

| Parte | Quién | Estado |
|---|---|---|
| Base de datos: tablas, seguridad (RLS), funciones RPC, tiempo real, bucket de fotos (`supabase/migrations`) | Claude | Hecho |
| Configuración local de Supabase (`supabase/config.toml`): máx. 500 filas, confirmar correo, funciones sin `verify_jwt` | Claude | Hecho |
| Variables de la app (`.env.example`) | Claude | Hecho |
| GitHub Actions: pruebas (`ci.yml`), mantener despierto (`keepalive.yml`), respaldo diario (`backup.yml`) | Claude | Hecho |
| Edge Functions `scan-bowling` (lectura de fotos), `send-push` (notificaciones) y `delete-account` («Borrar mi cuenta»), cron de recordatorios y limpieza | Claude | Hecho |
| Privacidad y términos (`/privacidad`, `/terminos`), «Tengo 18 años o más», «Descargar mis datos» y «Borrar mi cuenta» | Claude | Hecho; el texto es un **borrador** que revisa un abogado (paso 13) |
| Turnstile (casilla anti-robots) en registro, entrar con correo y «Olvidé mi contraseña» | Claude | Hecho (se enciende con el paso 12) |
| Cuentas, proyectos, claves, Google, correo, secretos | **Tú** | Pasos 1 a 13 |

Necesitas: tu gestor de contraseñas, el repo **privado** `matchmate` en GitHub, el proyecto de Vercel ligado a
ese repo, una Gmail para los correos de la app (paso 6) y, para los pasos 4, 9 y 11, una terminal (PowerShell)
abierta en la carpeta del repo (`C:\Users\rgrullon\code\matchmate`).

---

## Paso 1. Cuenta y proyectos de Supabase

**Quién: tú.** Gratis y sin tarjeta.

- [ ] Entra a https://supabase.com › *Start your project* y crea la cuenta (con GitHub o con correo).
- [ ] Crea la organización **MatchMate** (tipo *Personal*, plan **Free**) y dentro el proyecto **matchmate-prod**:
  - *Database password*: toca *Generate a password* y guárdala en tu gestor como «MatchMate prod · base».
    Si trae símbolos (`@ # / ? %`…), cámbiala por una de **solo letras y números** (24 o más): el respaldo la
    usa dentro de una dirección y los símbolos la rompen.
  - *Region*: **East US (North Virginia)** (si primero pide una zona general, elige *Americas* y después esa).
    Es la que sirve para la lectura gratis de Gemini y la más cerca de RD.
  - Las demás opciones, como vienen.
- [ ] Crea una **segunda organización**, **MatchMate Staging** (plan **Free**), y dentro el proyecto
  **matchmate-staging**, con otra contraseña y la misma región.

¿Por qué dos organizaciones? Las cuotas gratis (tráfico, fotos, tiempo real) se cuentan por organización: si
staging se pasa, se bloquearía también producción. El plan gratis deja tener 2 proyectos gratis activos en total:
justo estos dos.

**Comprobar:** en https://supabase.com/dashboard ves las dos organizaciones y cada proyecto en verde (*Healthy*).

## Paso 2. Copiar la dirección y las claves de cada proyecto

**Quién: tú.** Haz esto en los dos proyectos y guárdalo en tu gestor, una nota por proyecto
(«MatchMate prod» y «MatchMate staging»).

- [ ] **Project URL** (pública): *Project Settings › Data API › Project URL*. Se ve así:
  `https://abcdefghijklmnopqrst.supabase.co`. Las 20 letras del medio son el **ref** del proyecto; anótalo aparte.
- [ ] **Publishable key** (pública): *Project Settings › API Keys* › pestaña *Publishable and secret API keys* ›
  *Publishable key*. Empieza con `sb_publishable_`.
- [ ] **Secret key** (SECRETA): en la misma página, *Secret keys* › la clave `default` › *Reveal* y copiar.
  Empieza con `sb_secret_`. Nunca va en Vercel ni en la app.
- [ ] Solo producción: **Session pooler** (SECRETO, lleva la contraseña): botón **Connect** arriba › *Connection
  String* › *Method: Session pooler* › copia la dirección y cambia `[YOUR-PASSWORD]` por la contraseña de la base.
  Se ve así: `postgresql://postgres.abcdefghijklmnopqrst:TuClave@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
  (el puerto tiene que ser **5432**).

No uses las *Legacy API keys* (`anon` y `service_role`): Supabase las retira a fines de 2026.

**Comprobar:** tienes 2 notas con URL, ref, publishable, secret y contraseña de la base; la de prod, además,
con la dirección del Session pooler.

## Paso 3. Ajustes de cada proyecto

**Quién: tú.** En los dos proyectos, salvo donde dice otra cosa.

- [ ] **Máximo de filas:** *Project Settings › Data API* › *Max rows* = **500** › *Save*. (Evita que alguien
  baje lo público de un tirón.)
- [ ] **Correo:** *Authentication › Sign In / Providers › Email*: *Enable email provider* activado, **Confirm email
  activado**, *Minimum password length* = **6**. En *Authentication › Sign In / Providers* arriba, *Allow new users
  to sign up* activado.
- [ ] **Direcciones permitidas:** *Authentication › URL Configuration*:
  - Producción: *Site URL* = `https://matchmate-oficial.vercel.app`. *Redirect URLs*: `https://matchmate-oficial.vercel.app` y
    `https://matchmate-oficial.vercel.app/**`.
  - Staging: *Site URL* = `http://localhost:5173`. *Redirect URLs*: `http://localhost:5173`,
    `http://localhost:5173/**` y `https://*-TU-USUARIO-DE-VERCEL.vercel.app/**` (las direcciones de *Preview* de
    Vercel; tu usuario sale al final de esas direcciones).
- [ ] **Tiempo real:** *Realtime › Settings* › *Allow public access* **desactivado** (solo canales privados).

**Comprobar:** vuelve a abrir cada página y mira que los valores se guardaron.

## Paso 4. Crear las tablas (migraciones)

**Quién: tú, en la terminal** (Claude te puede acompañar; la contraseña la escribes tú cuando la pida).
Primero staging, y cuando staging esté bien, producción.

- [ ] Una sola vez, entra a Supabase desde la terminal (abre el navegador para aprobar):
  ```powershell
  npx -y supabase@2 login
  ```
- [ ] Staging (cambia `REF_STAGING` por el ref del paso 2; pide la contraseña de la base de staging):
  ```powershell
  npx -y supabase@2 link --project-ref REF_STAGING
  npx -y supabase@2 db push
  ```
  `db push` muestra la lista de migraciones y pregunta si seguir: responde `Y`.
- [ ] Producción, igual con `REF_PROD` y su contraseña. **Nunca** agregues `--include-seed`: el seed trae
  cuentas de prueba con contraseña conocida.
- [ ] Antes de cada `db push`, confirma a cuál proyecto estás ligado: `npx -y supabase@2 projects list` marca el
  ligado con `●`.

**Comprobar**, en cada proyecto:
- *Table Editor* muestra `leagues`, `players`, `events`, `entries`, `submissions`… (unas 20 tablas).
- *SQL Editor* › `select id, status from public.sport_status order by sort_order;` › todos salen `open` (desde
  `20260929000300_sueltos_logos.sql`; la consola del superadmin puede volver a poner uno en `beta` o cerrarlo).
- *Storage* muestra el bucket privado `scoreboards` y el público `logos` (los logos de las ligas).
- *Advisors › Security Advisor* › *Rerun*: puede avisar «security definer function executable by authenticated»
  en las RPC. Es a propósito (cada una valida permisos por dentro). Cualquier otro aviso, pásaselo a Claude.

**Tu cuenta de superadmin** (después del paso 5, cuando ya puedas crear cuentas en la app):
- [ ] Crea tu cuenta en la app de producción y confirma el correo.
- [ ] En producción, *SQL Editor* (cambia el correo):
  ```sql
  update public.profiles set is_superadmin = true where email = 'tu-correo@gmail.com';
  select email, is_superadmin from public.profiles where is_superadmin;
  ```
  La segunda línea tiene que mostrar tu correo. Repite en staging si quieres ser superadmin allí.

## Paso 5. Variables en Vercel

**Quién: tú.** Vercel › proyecto **matchmate** › *Settings › Environment Variables*. Cada variable se agrega dos
veces: el valor de producción marcado solo en **Production** y el de staging marcado en **Preview** (y
*Development* si quieres).

| Variable | Production | Preview |
|---|---|---|
| `VITE_SUPABASE_URL` | Project URL de prod | Project URL de staging |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key de prod | Publishable key de staging |
| `VITE_VAPID_PUBLIC_KEY` | la VAPID pública del paso 9 | la misma |
| `VITE_TURNSTILE_SITE_KEY` | opcional, paso 12 | opcional |

- [ ] Nada que empiece con `sb_secret_`, ninguna contraseña ni la clave de Gemini: todo lo `VITE_` lo puede ver
  cualquiera que abra la app.
- [ ] *Settings › Domains*: que esté `matchmate-oficial.vercel.app` (si está ocupado, elige otro `.vercel.app` y avísale
  a Claude, porque cambia los pasos 3 y 7).
- [ ] Las variables se leen al construir la app: después de cambiarlas, *Deployments* › el último › *…* ›
  **Redeploy**.

**Comprobar:** abre https://matchmate-oficial.vercel.app y crea una cuenta. Si te dice que revises el correo para
confirmar, ya está usando Supabase (en modo local no pide confirmar). En Supabase › *Authentication › Users*
aparece la cuenta. (El correo en sí llega después del paso 6.)

## Paso 6. Correo de la app (Gmail con contraseña de aplicación)

**Quién: tú.** El correo incluido en Supabase solo manda 2 por hora; con Gmail son unos 500 al día, gratis.

- [ ] Usa una Gmail para MatchMate (puede ser nueva, p. ej. `matchmate.app@gmail.com`).
- [ ] En esa cuenta: https://myaccount.google.com › *Seguridad* › activa la **verificación en 2 pasos**.
- [ ] https://myaccount.google.com/apppasswords › crea una contraseña de aplicación llamada «Supabase MatchMate».
  Son 16 letras: guárdalas en tu gestor **sin espacios**.
- [ ] En **los dos** proyectos: *Authentication › Emails › SMTP Settings* › *Enable custom SMTP*:
  - *Sender email*: la Gmail · *Sender name*: `MatchMate`
  - *Host*: `smtp.gmail.com` · *Port*: `587`
  - *Username*: la Gmail completa · *Password*: la contraseña de aplicación
  - *Save*.
- [ ] *Authentication › Rate Limits* › correos por hora: deja 30 (o el que ponga Supabase al activar el SMTP).

**Comprobar:** crea cuentas de prueba con un correo de Gmail, uno de Outlook/Hotmail y uno de iCloud: a los tres
les llega el correo de confirmación (mira en *Spam*) y al tocar el enlace entran a la app. Prueba también
«Olvidé mi contraseña». En la carpeta *Enviados* de la Gmail se ven los correos que salieron.

## Paso 7. Entrar con Google

**Quién: tú.** Un solo cliente de Google sirve para los dos proyectos.

- [ ] https://console.cloud.google.com › crea un proyecto **nuevo** llamado **MatchMate** (no uses
  `bowlinx-12368`, el de BowlingX).
- [ ] *Google Auth Platform* (antes *OAuth consent screen*) › *Get started*: nombre **MatchMate**, tu correo de
  soporte, público **External**, tu correo de contacto.
  - *Branding* › *Authorized domains*: `matchmate-oficial.vercel.app`, `REF_PROD.supabase.co` y `REF_STAGING.supabase.co`.
  - *Branding* › *Application privacy policy link*: `https://matchmate-oficial.vercel.app/privacidad` y *Application terms of
    service link*: `https://matchmate-oficial.vercel.app/terminos` (Google los pide para verificar la app).
  - *Audience* › **Publish app** (si se queda en *Testing*, solo entran los correos de prueba).
- [ ] *Clients* › *Create client* › *Web application*, nombre «MatchMate web»:
  - *Authorized JavaScript origins*: `https://matchmate-oficial.vercel.app` y `http://localhost:5173`.
  - *Authorized redirect URIs*: `https://REF_PROD.supabase.co/auth/v1/callback` y
    `https://REF_STAGING.supabase.co/auth/v1/callback` (Supabase te muestra esa dirección exacta en la página de
    Google, como *Callback URL*).
  - Copia el **Client ID** (público) y el **Client secret** (SECRETO) a tu gestor.
- [ ] En **los dos** proyectos de Supabase: *Authentication › Sign In / Providers › Google* › activar, pegar el
  *Client ID* y el *Client Secret* › *Save*.

**Comprobar:** en la app, «Entrar con Google» › eliges tu cuenta › vuelves a la app ya adentro. En Supabase ›
*Authentication › Users* la cuenta sale con proveedor `google`. (Google muestra «continuar a …supabase.co»: es
normal por ahora; más adelante se cambia al botón de Google con tu dominio.)

## Paso 8. Clave de Gemini para leer las fotos

**Quién: tú.**

- [ ] https://aistudio.google.com con tu Google › *Get API key* › *Create API key* › elige el proyecto de Google
  **MatchMate** del paso 7 (o *Create API key in new project*; nunca el de BowlingX).
- [ ] **No actives la facturación** en ese proyecto de Google: con facturación la clave deja de ser gratis y cobra.
- [ ] No crees varios proyectos para sumar cupo gratis: lo prohíben los términos de Google.
- [ ] Guarda la clave (SECRETA) en tu gestor como `GEMINI_API_KEY`. Se pega en el paso 9.

**Comprobar:** en AI Studio › *API keys* la clave sale en el proyecto MatchMate con plan **Free**.

## Paso 9. Secretos de las Edge Functions y publicarlas

**Quién: tú.** `scan-bowling`, `send-push`, `delete-account` y `purge-photos` ya están en el repo (`supabase/functions`).

- [ ] **Claves VAPID** (notificaciones). En la terminal:
  ```powershell
  npx -y web-push generate-vapid-keys
  ```
  Salen dos: *Public Key* y *Private Key*. Guárdalas en tu gestor. La pública va también en Vercel
  (`VITE_VAPID_PUBLIC_KEY`, paso 5, y *Redeploy*). Las mismas sirven para los dos proyectos.
- [ ] **CRON_SECRET** (una contraseña larga al azar que solo usan el cron, `send-push` y `purge-photos`). En la terminal:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  Genera uno para prod y otro para staging, y guárdalos.
- [ ] En **cada** proyecto, los secretos de abajo. Dos formas (elige una):
  - Rápida: copia `supabase/functions/.env.example` a `supabase/functions/.env` (no se sube a GitHub), llénalo y
    corre `npx -y supabase@2 secrets set --env-file supabase/functions/.env --project-ref REF`. Después borra el `.env`.
  - A mano: *Edge Functions › Secrets* › *Add new secret*, uno por uno:

  | Nombre | Valor |
  |---|---|
  | `GEMINI_API_KEY` | la del paso 8 |
  | `VAPID_PUBLIC_KEY` | la pública |
  | `VAPID_PRIVATE_KEY` | la privada |
  | `VAPID_SUBJECT` | `mailto:` + la Gmail del paso 6 (p. ej. `mailto:matchmate.app@gmail.com`) |
  | `CRON_SECRET` | el de ese proyecto |
  | `SCAN_ALLOWED_ORIGINS` | prod: `https://matchmate-oficial.vercel.app` · staging: `http://localhost:5173` y tu dirección de Preview de Vercel, separadas por coma. Lo usan `scan-bowling` y `delete-account` (desde qué páginas se puede pedir) |

  No agregues nada que empiece con `SUPABASE_`: esos los pone Supabase solo (`delete-account` usa la clave
  secreta, `SUPABASE_SECRET_KEYS`, para borrar la cuenta con la API de administración).
- [ ] Publicar las funciones (primero staging; `REF` es el del proyecto). Publica las cuatro:
  ```powershell
  npx -y supabase@2 functions deploy --project-ref REF
  ```
  Si ya tenías las otras y solo falta una: `npx -y supabase@2 functions deploy purge-photos --project-ref REF` (o
  `delete-account`).

**Comprobar:** *Edge Functions* muestra `scan-bowling`, `send-push`, `delete-account` y `purge-photos`, las cuatro con *Verify JWT*
**apagado** (es a propósito: cada función revisa por dentro quién la llama). En la app, envía un juego con foto: a
los segundos aparece la lectura; en *Edge Functions › scan-bowling › Logs* se ve la llamada sin errores.

**Comprobar el borrado de cuentas** (en staging, con una cuenta de prueba, nunca la tuya):
1. Crea la cuenta, crea una liga y únete a ella con otra cuenta.
2. Con la primera: *Configuración › Tus datos › Descargar mis datos* baja `matchmate-mis-datos-AAAA-MM-DD.json`.
3. *Borrar mi cuenta*: primero pide pasar la liga a la otra cuenta (o borrarla); después, escribir BORRAR.
4. La app vuelve a Home sin sesión; en *Authentication › Users* la cuenta ya no está; la liga sigue, ahora de la
   otra cuenta; en *Edge Functions › delete-account › Logs* sale «cuenta borrada». Si dice «El borrado de cuentas
   no está configurado», falta publicar la función o la clave secreta del proyecto.

## Paso 10. Secretos del cron en Vault

**Quién: tú.** El cron de recordatorios ya viene en las migraciones. El cron de la base usa estos dos valores
para llamar a `send-push`.

- [ ] En **cada** proyecto: *Database › Extensions*: que `pg_cron` y `pg_net` estén activadas.
- [ ] *Integrations › Vault › Secrets* › *Add new secret* (dos veces):
  - Nombre `project_url`, valor: la Project URL de ese proyecto.
  - Nombre `cron_secret`, valor: el **mismo** `CRON_SECRET` que pusiste en el paso 9 para ese proyecto.

**Comprobar:** *SQL Editor* › `select name from vault.secrets order by name;` muestra `cron_secret` y
`project_url`. *Integrations › Cron* muestra las tareas (recordatorios, limpieza) y, al rato, corridas en verde.
Con la app instalada y las notificaciones activadas, llega el recordatorio de un evento de prueba.

## Paso 11. GitHub: mantener despierto y respaldos

**Quién: tú.** Supabase gratis **pausa** un proyecto después de 1 semana sin uso y **no guarda respaldos**. Dos
tareas diarias de GitHub lo cubren; necesitan estos secretos.

- [ ] **Clave de age** (cifra los respaldos). En la terminal:
  ```powershell
  winget install --id FiloSottile.age
  age-keygen -o matchmate-respaldos.key
  ```
  (Cierra y abre la terminal si `age-keygen` no se encuentra.) Muestra `Public key: age1…`: esa es la pública.
  El archivo `matchmate-respaldos.key` es la **privada**: guárdalo en tu gestor (como adjunto) y en una memoria
  USB, y bórralo de la carpeta. **Sin ese archivo nadie puede abrir los respaldos, tampoco tú.**
- [ ] Repo `matchmate` en GitHub › *Settings › Secrets and variables › Actions* › *New repository secret*:

  | Nombre | Valor |
  |---|---|
  | `SUPABASE_URL` | Project URL de prod |
  | `SUPABASE_SECRET_KEY` | Secret key (`sb_secret_…`) de prod |
  | `SUPABASE_URL_STAGING` | Project URL de staging |
  | `SUPABASE_SECRET_KEY_STAGING` | Secret key de staging |
  | `SUPABASE_DB_URL` | la dirección del Session pooler de prod (paso 2, con la contraseña) |
  | `AGE_PUBLIC_KEY` | la línea `age1…` |

- [ ] Confirma que el repo es **privado** (*Settings › General*, abajo): el respaldo se niega a correr en un repo
  público.

**Comprobar:**
- *Actions › Mantener despierto › Run workflow*: sale en verde y el paso «Llamar a ping» dice
  `OK produccion: "2026-…"` y `OK staging: "2026-…"`. Si un día falla, GitHub te manda un correo y se abre un
  issue «Mantener despierto falló» que dice cuántos días seguidos van; se cierra solo cuando vuelve a funcionar.
- *Actions › Respaldo › Run workflow*: sale en verde (tarda unos minutos). En *Releases* aparece **respaldos**
  con un archivo `matchmate-prod-AAAA-MM-DD-HHMM.tar.gz.age`. Se guardan los de los últimos 14 días.
- Prueba que lo puedes abrir (en la carpeta donde bajaste el archivo):
  ```powershell
  age -d -i matchmate-respaldos.key -o respaldo.tar.gz matchmate-prod-AAAA-MM-DD-HHMM.tar.gz.age
  tar -xzf respaldo.tar.gz
  ```
  Sale la carpeta `respaldo` con `LEEME.txt`, `roles.sql`, `schema.sql`, `data.sql` y `migrations`. Después
  borra lo que sacaste (tiene datos de todos).
- *Actions › CI*: cada push a `main` sale en verde. No necesita secretos.

## Paso 12. Opcional: Turnstile contra registros falsos

**Quién: tú.** La app ya muestra la casilla cuando tiene la site key. Haz los dos lados juntos: si activas el
captcha en Supabase sin poner la site key en Vercel, nadie puede entrar con correo ni registrarse.

- [ ] https://dash.cloudflare.com (cuenta gratis) › *Turnstile* › *Add widget*: nombre MatchMate, *Hostnames*
  `matchmate-oficial.vercel.app` (y `localhost` para staging), modo *Managed*. Copia la *Site Key* (pública) y la
  *Secret Key* (SECRETA).
- [ ] Vercel: `VITE_TURNSTILE_SITE_KEY` = la site key (Production y Preview) › *Redeploy*.
- [ ] Supabase, en los dos proyectos: *Authentication › Attack Protection* › *Enable Captcha protection* ›
  *Turnstile by Cloudflare* › la *Secret Key* › *Save*.

**Comprobar:** en la app, entrar con correo, el registro y «Olvidé mi contraseña» muestran la casilla de
Cloudflare y funcionan (entrar con Google no la necesita).

## Paso 13. Privacidad y términos: revisión del abogado

**Quién: tú, con un abogado de RD.** Las páginas `/privacidad` y `/terminos` (código en `src/pages/legal/`) dicen
arriba que son un **borrador**. Antes de abrir la app a otros clubes:

- [ ] Que un abogado revise los dos textos (Ley 172-13 de datos personales, Ley 136-03 de menores, fotos leídas
  por la capa gratis de Google, datos guardados en Estados Unidos, borrar la cuenta y bajar los datos).
- [ ] En `src/pages/legal/legal.ts`: el nombre del responsable (`responsible`) y el correo de contacto (`email`),
  la fecha (`LEGAL_UPDATED`) y `LEGAL_DRAFT = false`. Se lo puedes pedir a Claude con los datos.
- [ ] Poner los dos links en Google (paso 7, *Branding*).

**Comprobar:** abre https://matchmate-oficial.vercel.app/privacidad sin entrar: ya no sale el aviso de borrador ni nada
marcado en amarillo.

---

## Revisión final

- [ ] Registro con correo: llega la confirmación (Gmail, Outlook e iCloud) y se entra.
- [ ] Entrar con Google funciona en producción y en una Preview de Vercel.
- [ ] «Olvidé mi contraseña»: llega el correo y se puede poner una nueva.
- [ ] Tu cuenta es superadmin en producción.
- [ ] *Mantener despierto* y *Respaldo* en verde varios días seguidos; sabes dónde está la clave privada de age.
- [ ] Fase 0C: lectura de fotos y notificaciones funcionando (pasos 9 y 10).
- [ ] «Borrar mi cuenta» probado en staging (paso 9) y la privacidad y los términos revisados (paso 13).

**De ahí en adelante:**
- Vigila el correo de la cuenta de Supabase: avisa antes de pausar un proyecto o si una organización se acerca
  al límite gratis. El uso se ve en *Organization › Usage*.
- Si una clave secreta se filtra: en *Project Settings › API Keys* crea otra secret key, borra la vieja y
  cambia el secreto en GitHub (y en donde más esté).
- Si cambias la contraseña de la base de prod, actualiza `SUPABASE_DB_URL` en GitHub.
- No actives nada de pago en Supabase ni en Google sin hablarlo antes.

---

## Apéndice técnico: restaurar un respaldo

Lo hace Claude contigo (o quien te ayude); aquí queda para no perderlo. La prueba de restauración de la fase 0C
sigue estos mismos pasos en un proyecto de prueba y termina entrando a la app con una cuenta restaurada.

1. Descifrar: `age -d -i matchmate-respaldos.key -o respaldo.tar.gz <archivo>.tar.gz.age` y `tar -xzf respaldo.tar.gz`.
2. Proyecto destino **nuevo y vacío** (sin `db push`), en East US. Activar antes `pg_cron` y `pg_net` en
   *Database › Extensions* (los datos traen las tareas del cron).
3. Cargar, con la dirección del Session pooler del proyecto nuevo:
   ```bash
   psql "$DESTINO" --single-transaction --variable ON_ERROR_STOP=1 \
     --file respaldo/roles.sql --file respaldo/schema.sql \
     --command 'SET session_replication_role = replica' --file respaldo/data.sql
   ```
   `data.sql` trae también las cuentas (`auth.users` e `auth.identities`, con las contraseñas cifradas) y las
   filas de Storage (no los archivos de las fotos).
4. El esquema del respaldo no trae las políticas de Storage ni de Realtime (viven en esquemas de Supabase):
   volver a correr `respaldo/migrations/*_supabase.sql` (se puede repetir sin problema).
5. Marcar las migraciones como aplicadas para que un `db push` futuro no las repita:
   `npx -y supabase@2 migration repair --status applied <versión>` por cada archivo de `respaldo/migrations`
   (la versión es el número del principio del nombre).
6. Vault no va en el respaldo: volver a crear `project_url` y `cron_secret` (paso 10) y los secretos de las
   Edge Functions (paso 9); publicar las funciones.
7. Cambiar la URL y la publishable key en Vercel (paso 5), *Redeploy*, y entrar con una cuenta restaurada.
