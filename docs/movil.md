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
- **`localStorage` en el teléfono** (`movil/src/platform/storage.ts`, el mismo patrón de El Play): al abrir la app se
  cargan en memoria todas las claves `mm:` (AsyncStorage) y la sesión de Supabase (`mm:auth`, en el llavero con
  SecureStore, en trozos); después se lee de memoria y se escribe en segundo plano. `movil/index.ts` lo instala antes de
  cargar cualquier módulo compartido y `_layout.tsx` espera a `hydrateStorage()` con el splash puesto.
- **Señal y vuelta a la app** (`movil/src/platform/network.ts`): `navigator.onLine` y los avisos que en la web dan
  `online`, `focus` y `visibilitychange` (la caché vuelve a pedir lo que falló; la cola sin conexión se manda).
- Sin IndexedDB, la caché de consultas (`src/lib/db/query.ts`) queda en memoria y la cola sin conexión
  (`src/lib/db/outbox.ts`) también: **pendiente** guardarlas en el teléfono (ver la lista de migración).

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

## Publicar (cuando esté la cuenta de Apple)

Identificadores: `com.grullonb.matchmate` (iOS y Android), esquema `matchmate://`, links universales de
`matchmate.grullonb.com` (`associatedDomains` y `intentFilters` en `movil/app.json`).

1. **Apple Developer (99 US$ al año)** y **Google Play Console (25 US$ una vez)**.
2. `npx eas-cli@latest login`, `npx eas-cli@latest init` (crea el proyecto en Expo y pone su id en app.json).
3. Variables en EAS (Project › Environment variables): `EXPO_PUBLIC_SUPABASE_URL` y
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en development, preview y production.
4. Links universales: subir a la web `/.well-known/apple-app-site-association` (con el Team ID de Apple) y
   `/.well-known/assetlinks.json` (con la huella del certificado de Android que da EAS).
5. `npx eas-cli@latest build --profile preview --platform android` (APK para probar) y luego
   `--profile production --platform all`; `npx eas-cli@latest submit` para mandarlas a las tiendas.
6. Antes de mandar a Apple:
   - Si hay «Entrar con Google», tiene que estar también «Iniciar sesión con Apple» (regla 4.8). Por eso la app
     todavía no tiene Google.
   - Borrar la cuenta desde la app (regla 5.1.1(v)): ya existe en la web (Edge Function `delete-account`); falta la
     pantalla en la app.
   - La política de privacidad con lo que pide la ficha («App Privacy»).
   - Notificaciones con la app cerrada: expo-notifications + el envío desde Supabase (como El Play,
     `el-play-app/docs/SEGUNDO-PLANO.md`).
