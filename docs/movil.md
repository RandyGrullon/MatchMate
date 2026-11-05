# MatchMate en el teléfono (React Native · Expo)

La app de las tiendas vive en `movil/` (Expo SDK 58, Expo Router, como El Play). **No copia la lógica de la web: la
comparte.** Los motores de los deportes, las insignias, los premios, la capa de datos (Supabase, caché, cola sin
conexión), la sesión (`src/lib/auth.tsx`) y los textos de error son los mismos archivos de `src/`. La app solo pone
las pantallas (React Native) y lo que el teléfono hace distinto.

Qué está hecho y qué falta, pantalla por pantalla: [movil-migracion.md](movil-migracion.md).

## Cómo comparte el código

```
movil/src/app/…            pantallas (Expo Router: cada archivo es una ruta, como /l/[lid], /unirse/[code])
movil/src/components/…     piezas de la app (ui.tsx, Logo, LeagueCard…) con las medidas del rediseño de la web
movil/src/theme/…          colores de src/index.css, Inter, y el acento del deporte (brandColors de src/lib/theme.ts)
movil/src/platform/…       lo del teléfono: localStorage sobre AsyncStorage + llavero, señal (NetInfo), backend
        │  @mm/…  (= ../src/…)
src/sports, src/badges, src/prizes, src/lib/…   la misma lógica de la web
```

- **`@mm/…`** importa de `../src` (la web) y **`@movil/…`** de `movil/src` (lo usan los `.native.ts` compartidos para
  llegar al código de la app). Lo resuelven `movil/metro.config.js` y `movil/tsconfig.json`.
- **Un solo React:** lo que el código compartido importa de `node_modules` sale siempre de `movil/node_modules`
  (metro.config.js). `lucide-react` es `lucide-react-native` (mismos íconos, también los de `createLucideIcon`).
- **Archivos `.native.ts`** junto a uno de la web: el teléfono usa el `.native` (Metro y TypeScript con
  `moduleSuffixes`; la vista previa web de la app también, por metro.config.js). La web nunca los ve (`tsconfig.json`
  de la raíz los excluye). Hoy son:
  - `src/lib/backend/index.native.ts` → `movil/src/platform/backend.ts`: siempre Supabase, cliente con la sesión en el
    teléfono, sin leer la URL, renovación de la sesión solo con la app a la vista, y la señal de NetInfo.
  - `src/lib/env.native.ts`: las variables (`EXPO_PUBLIC_*`) con los nombres `VITE_*` que lee la lógica compartida
    (`src/lib/env.ts` en la web). Por eso la lógica compartida no usa `import.meta.env` directo.
  - `src/lib/db/outboxStorage.native.ts`, `src/lib/db/queryStore.native.ts` y `src/lib/data/photoStore.native.ts`:
    dónde se guardan en el teléfono la cola sin conexión, la caché de consultas y las fotos que esperan subir (abajo).
  - `src/lib/push.native.ts` → `movil/src/platform/notifications.ts`: las notificaciones con expo-notifications, con
    las mismas funciones que `src/lib/push.ts` (abajo).
  - `src/lib/bytesBlob.native.ts`: los bytes de una foto para subirla (React Native no arma `new Blob([bytes])`); el
    `storage.upload` del teléfono manda a Storage el ArrayBuffer.
- **`localStorage` en el teléfono** (`movil/src/platform/storage.ts`, el mismo patrón de El Play): al abrir la app se
  cargan en memoria todas las claves `mm:` (AsyncStorage) y la sesión de Supabase (`mm:auth`, en el llavero con
  SecureStore, en trozos); después se lee de memoria y se escribe en segundo plano. `movil/index.ts` lo instala antes de
  cargar cualquier módulo compartido y `_layout.tsx` espera a `hydrateStorage()` con el splash puesto.
- **Señal y vuelta a la app** (`movil/src/platform/network.ts`): `navigator.onLine` y los avisos que en la web dan
  `online`, `focus` y `visibilitychange` (la caché vuelve a pedir lo que falló; la cola sin conexión se manda).
- **Lo guardado en el teléfono** (sin IndexedDB): la cola sin conexión va a `localStorage` (AsyncStorage); la caché de
  consultas, a AsyncStorage con claves `mmq:<cuenta>:<clave>` (`movil/src/platform/queryStore.ts`; no empiezan con
  `mm:` para no cargarlas todas en memoria al abrir); las fotos de los envíos sin señal, a archivos de la app
  (`movil/src/platform/photoStore.ts`, carpeta `mm-uploads`). Así, sin señal, la app muestra lo último que se vio y lo
  anotado sale al volver la señal aunque se haya cerrado.
- **Notificaciones** (`movil/src/platform/notifications.ts` + `src/lib/push.native.ts`): con permiso, el teléfono da
  un token de Expo que se guarda con la RPC `upsert_app_push` (migración `20261020000100_push_app_telefono.sql`: es un
  teléfono más en `push_subscriptions`, `kind = 'expo'`) y se quita al salir de la cuenta. La Edge Function `send-push`
  manda esos avisos por el servicio de push de Expo (`sendExpo` en `core.ts`) y los de la web con Web Push, con las
  mismas preferencias, el mismo reparto y la misma limpieza. Tocar un aviso abre su pantalla (`movil/src/lib/links.ts`).
- **Links** (`movil/src/lib/links.ts`, `movil/src/app/+native-intent.tsx`): un link de la web abre la pantalla de la
  app que le toca (`/l/<liga>/ranking` va a la liga) y lo que la app no tiene se abre en la web.

Reglas para el código compartido (para que siga sirviendo en los dos lados):
- Nada de `document`, `window.addEventListener` ni `import.meta` sin revisar antes `typeof …` (o detrás de
  `src/lib/env.ts`). Se arreglaron así `hideSplash` (`src/lib/splash.ts`) y `origin()` (`src/lib/backend/supabase.ts`).
- La lógica nueva va en módulos sin React ni pantallas (como `src/lib/errorText.ts`, que salió de
  `src/components/feedback.tsx` para que la app pueda decir los mismos mensajes de error).

## Correr la app

```bash
pnpm install                    # en la raíz (para los tipos de la lógica compartida y los íconos)
cd movil
npm install                     # la app usa npm, como El Play
npx expo start                  # Expo Go en el teléfono (QR) o «w» para la vista previa web
npx tsc --noEmit                # tipos de la app y de toda la lógica compartida que usa
node scripts/generar-iconos.mjs # (desde la raíz: node movil/scripts/generar-iconos.mjs) íconos desde la marca
```

`movil/.env.local` (no se sube) lleva `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, los mismos
valores públicos de la web. Sin modo local: PGlite no corre en el teléfono.

Node: Expo 58 pide 22.13 o más; con Node 20 avisa pero arranca (como El Play).

**Probar sin cuenta** (en el Supabase real no se crean cuentas de prueba): rutas solo de desarrollo en `src/app/dev/`
(con `__DEV__` falso llevan a Hoy). `/dev/anotar` (el editor de boliche) y `/dev/social` pintan con datos fijos.
`/dev/empresa` prende, en la vista previa web, una demostración en memoria (`src/platform/demoBackend.ts`): una
cuenta de prueba con canchas de ejemplo que contesta las RPC de las empresas. Ahí se registra la empresa, se agregan
canchas con fotos, se cambia de modo y se busca en Dónde jugar; el mismo `/dev/empresa` la aprueba o la rechaza (lo
del superadmin) y la apaga.

## Publicar (cuando esté la cuenta de Apple)

Identificadores: `com.grullonb.matchmate` (iOS y Android), esquema `matchmate://`, links universales de
`matchmate.grullonb.com` solo para `/unirse/…`, `/l/…`, `/p/…` y `/u/…` (`APP_LINK_PATHS` en `movil/src/lib/appLinkPaths.ts`, que
tiene que coincidir con `associatedDomains` e `intentFilters` de `movil/app.json`).

Lo que pide cada tienda y ya está en la app: entrar con Google **y** con Apple (regla 4.8), borrar la cuenta desde la
app (5.1.1(v): Yo › Borrar mi cuenta, con la Edge Function `delete-account`), descargar los datos, «¿Tienes 18 años o
más?» y aceptar los Términos vigentes (las mismas puertas de la web), y avisos con la app cerrada.

### Una vez (cuentas y servicios)

1. **Apple Developer (99 US$ al año)** y **Google Play Console (25 US$ una vez)**.
2. `npx eas-cli@latest login` y, en `movil/`, `npx eas-cli@latest init`: crea el proyecto en Expo y pone
   `extra.eas.projectId` en `app.json` (sin él no hay token de avisos).
3. Variables en EAS (Project › Environment variables): `EXPO_PUBLIC_SUPABASE_URL` y
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en development, preview y production.
4. **Supabase › Authentication › URL Configuration › Redirect URLs**: agregar `matchmate://**` (la app) y, para probar
   con Expo Go, `exp://**`. Sin eso, Google vuelve a la web en vez de a la app.
5. **Iniciar sesión con Apple**: en developer.apple.com, al App ID `com.grullonb.matchmate` activarle «Sign In with
   Apple» (EAS lo hace al firmar si se lo pide). En **Supabase › Authentication › Providers › Apple**, activar Apple y
   poner `com.grullonb.matchmate` en «Client IDs» (la app entra con el token del iPhone: `signInWithIdToken`; la llave
   secreta solo hace falta si un día se usa Apple en la web).
6. **Google**: el proveedor de Google de Supabase ya sirve (la app abre el mismo inicio de sesión que la web en una
   pestaña segura y vuelve por `matchmate://auth`).
7. **Avisos**:
   - iPhone: `npx eas-cli@latest credentials -p ios` › Push Notifications › crear la llave de APNs (EAS la guarda).
   - Android: un proyecto de Firebase con la app `com.grullonb.matchmate`, bajar `google-services.json` a `movil/`
     (agregar `"googleServicesFile": "./google-services.json"` en `android` de `app.json`) y subir la llave de cuenta de
     servicio de FCM v1 a EAS (`npx eas-cli@latest credentials -p android` › Google Service Account › FCM V1).
   - Supabase: aplicar la migración `20261020000100_push_app_telefono.sql` y desplegar `send-push`
     (`supabase functions deploy send-push`). Si se activa «Enhanced security for push» en Expo, poner su token como
     secreto `EXPO_ACCESS_TOKEN` de la función.
8. **Links universales**: con el Team ID de Apple y las huellas de Android (la de EAS y la de «Firma de apps de Google
   Play»), correr desde la raíz `node movil/scripts/enlaces-universales.mjs --team <TEAM ID> --sha256 <huella>,<huella>`
   y desplegar la web: quedan `/.well-known/apple-app-site-association` y `/.well-known/assetlinks.json`
   (`vercel.json` ya le pone `Content-Type: application/json` al de Apple).

### Cada versión

1. `npx eas-cli@latest build --profile preview --platform android` (APK para probar en un teléfono) y luego
   `--profile production --platform all`; `npx eas-cli@latest submit` las manda a las tiendas.
2. Probar en un teléfono de verdad (no en Expo Go): entrar con Google y con Apple, un aviso de prueba con la app
   cerrada, abrir un link de invitación desde WhatsApp y anotar sin señal (cerrar la app y volver a abrirla).

### Fichas de las tiendas

- **App Store › App Privacy** y **Google Play › Seguridad de los datos**: lo que dice `/privacidad` (correo, nombre,
  foto, juegos y resultados, token de avisos; nada se vende ni se usa para anuncios). Google pide además el link para
  borrar la cuenta sin la app: `https://matchmate.grullonb.com/cuenta` (Configuración › Borrar mi cuenta).
- **Revisión de Apple (2.1)**: una cuenta de prueba con correo y contraseña, ya con «18 años o más» y los Términos
  aceptados, miembro de una liga con juegos (si no, el revisor ve la app vacía). Va en «App Review Information».
- **Contenido de usuarios (1.2)**: la app tiene que poder reportar y bloquear donde se ve lo que publican otros (llega
  con la parte Social de la app, con las mismas RPC de la web); decirlo en las notas para el revisor.
- **Google Play, cuenta personal nueva**: antes de publicar pide una prueba cerrada con 12 personas durante 14 días.
- Los textos legales tienen que estar en su versión final antes de mandar a las tiendas: `LEGAL_DRAFT` en false y los
  datos de `LEGAL_CONTACT` que todavía son marcadores (responsable, RNC y dirección: `LEGAL_PLACEHOLDERS` en
  `src/lib/legal.ts`).
