# MatchMate

Ligas y torneos de varios deportes (boliche, pádel, tenis, pickleball, baloncesto, fútbol, golf y natación),
desde el celular. *Match* = partida, *mate* = compañero.

> **Estado:** copia inicial de BowlingX (29334d1). En la Fase 0 pasa a Supabase y se agregan los demás
> deportes por fases. BowlingX sigue aparte para su liga; sus datos se migran aquí al terminar.
> Mientras tanto, lo de abajo describe lo heredado de BowlingX.

Ligas y torneos de boliche: jugadores, equipos, promedio, handicap y pinos por juego, desde el celular.

- **Cuentas**: registro y entrada con correo + contraseña (repetida) o con **Google**; la primera vez
  que alguien entra con Google su cuenta se crea sola.
- **Ligas** públicas o privadas. Cualquiera con cuenta crea la suya y queda como **dueño**; invita con
  **link, QR o código** (cambiar el código invalida el anterior). Las públicas se ven sin login.
  Cada liga tiene bolera, horario, temporada, contacto (WhatsApp) y si **exige foto** del marcador.
- **Torneos sin liga**: un torneo suelto con sus propios jugadores, equipos, invitación y admins.
- **Roles**: el dueño y los **admins** de la liga lo manejan todo (eventos, juegos, aprobaciones,
  jugadores, miembros, nombrar admins). El **superadmin** ve y administra todas las ligas y las cuentas
  (fijos en `src/lib/admins.ts` + `isFixedSuper()` de las reglas, o nombrados desde /superadmin).
- **Observador** (Eventos · Ranking · Perfil): los torneos y prácticas de la liga, pasados y por venir,
  si participó y su posición, la clasificación en vivo y el detalle de cada juego (cuadros y foto).
- **Anuncios**: el torneo que viene sale arriba para toda la liga (también para quien entra después),
  con cuenta regresiva, el mensaje del admin y botón de WhatsApp al contacto.
- **Torneo** (equipos + handicap; regla 2025: (230 − promedio) × 80 %, individual con handicap y equipos
  por scratch; todo configurable) con **límite de jugadores por equipo** y **equipos automáticos** parejos
  que mezclan categorías A–D. **Práctica** (pinos individuales) con asistencia ("Voy").
- **Anotar por cuadros**, de 3 formas: tocando los **pines** que cayeron en cada tiro, con un **teclado**
  que bloquea lo imposible (tras un 8 solo 0, 1 o spare) o solo el **total** (barra o número). La hoja
  calcula strikes, spares y el acumulado; se ven strikes/spares en el perfil.
- **Fotos**: si la liga exige foto, un juego cuenta solo verificado con la foto (leída por IA); si no,
  cuenta de una. Los jugadores suben sus juegos (con cuadros) y un admin los aprueba.
- **Ranking** de la liga por temporada, **Excel** del torneo, **respaldo** JSON por liga (y completo para
  el superadmin) y borrado de fotos viejas para no llenar el espacio gratis.
- **App instalable** (PWA): animación de apertura, abre sin conexión, avisa cuando hay versión nueva.

React 19 + Vite + Tailwind 4 · Firebase Auth + Firestore (tiempo real, caché sin conexión) ·
Firebase AI Logic (Gemini, capa gratuita) · Vercel.

## Correr en local

```bash
pnpm install
cp .env.example .env.local   # y completa las variables VITE_FIREBASE_*
pnpm dev
```

Contra los emuladores (no toca datos reales; necesita Java 11+):

```bash
pnpm emulators   # en otra terminal
pnpm dev:emu
```

`pnpm test` corre las pruebas de los cálculos (handicap, totales, ranking, equipos, cuadros, lectura de fotos).
`pnpm test:reglas` prueba `firestore.rules` contra el emulador (necesita Java 11+).

## Configurar Firebase (una sola vez)

1. **Reglas de Firestore**: publica `firestore.rules`, ya sea pegándolo en
   Consola → Firestore → Reglas, o con `npx firebase-tools login` y después `pnpm reglas`.
   Los superadmins fijos están en `isFixedSuper()` de las reglas y en `src/lib/admins.ts` (deben coincidir).
2. **Authentication → Método de acceso**: activa **Correo/contraseña** y **Google** (este pide el
   nombre público del proyecto y un correo de asistencia). En Configuración → Acciones del usuario deja
   **"Crear cuentas" activado** (sin verificación de correo). En Configuración → **Dominios autorizados**
   agrega el dominio de Vercel (sin eso Google no deja entrar desde la app).
3. **AI Logic** (escaneo de fotos): Consola → AI Services → AI Logic → *Get started* →
   **Gemini Developer API**. No hay que copiar ninguna API key.
4. **App Check** (AI Logic lo exige): Consola → Security → App Check → registra la app web con
   **reCAPTCHA Enterprise** y pon la *site key* en `VITE_RECAPTCHA_SITE_KEY`. Para probar en
   localhost registra el valor de `VITE_APPCHECK_DEBUG_TOKEN` en *Manage debug tokens*.

Si la IA no puede leer una foto, la app lo avisa y se pueden anotar los juegos a mano mirando la
foto; la foto queda igual como comprobante.

## Desplegar en Vercel

Importa el repo en Vercel (detecta Vite solo) y agrega en *Settings → Environment Variables*
las mismas variables de `.env.example` (`VITE_FIREBASE_*` y `VITE_RECAPTCHA_SITE_KEY`).
`vercel.json` ya redirige las rutas de la app a `index.html`. Agrega también el dominio de Vercel
en el registro de reCAPTCHA Enterprise.

## Importar un torneo pasado

```bash
pnpm importar mi-torneo.json --liga <id-de-la-liga>
```

El id de la liga es el del link (`/l/<id>`). Pide el correo y la contraseña de un admin de esa liga en la terminal. Los juegos importados cuentan como
verificados (resultado auditado del Excel, sin foto). `--reemplazar` vuelve a cargar un torneo que
ya existe. Los archivos de `scripts/datos/` no se suben al repo.

Formato del JSON:

```json
{
  "event": { "id": "torneo-2025", "type": "torneo", "name": "Torneo 2025", "date": "2025-10-25",
             "games": 3, "hcpBase": 230, "hcpPercent": 80, "individualRankBy": "hcp", "teamRankBy": "scratch" },
  "teams": ["Equipo 1"],
  "players": [{ "name": "Nombre", "average": 165, "handicap": 52, "team": "Equipo 1", "scores": [173, 159, 159] }]
}
```

## Datos (Firestore)

| Colección | Qué guarda |
|---|---|
| `users` | cuentas: correo, nombre y `superadmin` |
| `leagues/{liga}` | liga o torneo suelto (`kind`): visibilidad, dueño, bolera, horario, temporada, contacto, `requirePhoto` |
| `leagues/{liga}/players` | jugadores de la liga, promedio fijo opcional y cuenta vinculada (`uid`) |
| `leagues/{liga}/events` | torneo o práctica: fecha, juegos, handicap, equipos, límite por equipo, anuncio, asistencia |
| `leagues/{liga}/entries` | participación `evento_jugador`: promedio de entrada, pinos, foto y cuadros de cada juego |
| `leagues/{liga}/photos` | fotos comprimidas (~100 kB) de los marcadores |
| `leagues/{liga}/submissions` | juegos subidos por jugadores, pendientes de aprobación |
| `leagues/{liga}/private/invite` | código de invitación vigente (solo admins) |
| `members/{liga}_{uid}` | quién está en qué liga, su rol (`owner`/`admin`/`member`) y su jugador |
| `invites/{código}` | a qué liga lleva cada código de invitación |
