# Migración a la app del teléfono: pantalla por pantalla

Cómo está hecha la app: [movil.md](movil.md). Aquí, lo que falta. Lo que todavía no está en la app abre la web dentro
de la app («Abrir en la web», `movil/src/lib/web.ts`), así se puede usar entera mientras llega cada parte.

✅ en la app · 🟡 en la app a medias · 🌐 abre la web · ⏳ falta

## 0. Base (hecho)

- ✅ Proyecto Expo 58 en `movil/` (Expo Router, React Compiler, EAS, `com.grullonb.matchmate`).
- ✅ Lógica compartida con la web por `@mm/…` (Metro + TypeScript), un solo React, `lucide-react` → `lucide-react-native`.
- ✅ `localStorage` del teléfono (AsyncStorage + llavero), señal (NetInfo/AppState), backend Supabase del teléfono,
  variables `EXPO_PUBLIC_*` (`src/lib/env.native.ts`).
- ✅ Tema claro/oscuro con los colores de la web y el acento del deporte; Inter; logo y carga animados.
- ✅ Íconos y splash desde la marca (`movil/scripts/generar-iconos.mjs`).

## 1. Cuenta

- ✅ Entrar, crear cuenta (18+ y Términos), contraseña nueva, reenviar el correo de confirmar.
- ✅ «Entrar con Google» (pestaña segura que vuelve por `matchmate://auth`) y «Iniciar sesión con Apple» en el iPhone
  (botón del sistema, `signInWithIdToken`): `movil/src/platform/backend.ts`, `login.tsx`. Al crear cuenta piden lo
  mismo que la web (18+ y Términos). Falta configurarlos en Supabase y Apple (docs/movil.md › Publicar).
- ✅ Puertas de la cuenta, como la web: «¿Tienes 18 años o más?» (AdultGate) y aceptar los Términos vigentes
  (LegalGate), sobre toda la app (`movil/src/components/account/Gates.tsx`).
- ✅ Borrar la cuenta desde la app (regla 5.1.1(v) de Apple): Yo › Borrar mi cuenta (`movil/src/app/cuenta/borrar.tsx`,
  la misma Edge Function y las mismas trabas que la web: ligas a tu nombre, último superadmin).
- ✅ Descargar mis datos (el mismo JSON de la web, con la hoja de compartir del teléfono).
- ✅ Notificaciones: activar en este teléfono y qué te avisamos (las cuatro categorías de la web), en Yo.
- ✅ Ver mi perfil (como lo ven los demás), desde Yo.
- 🌐 Configuración: nombre, usuario, contraseña, perfil público (foto, biografía), personas bloqueadas.
- ✅ Apariencia (Auto / Claro / Oscuro) y salir (quita los avisos de la cuenta en este teléfono).

## 2. Hoy y Ligas

- ✅ Portada sin cuenta; Hoy con tus ligas; «Únete a tu liga» con el código.
- ✅ `/unirse/<código>`: a qué liga lleva y «Unirme» (sin «¿Quién eres?» todavía: ⏳).
- ⏳ Escanear el QR (expo-camera).
- ⏳ En juego ahora, lo próximo, la semana (useActivity de la web: necesita la campana, `useNotifications`).
- ⏳ Campana de avisos e invitaciones (`/avisos`, `/invitacion/<id>`).
- ✅ Ligas: las tuyas y las abiertas, con búsqueda; «Crear liga» y «Crear torneo».
- 🟡 La liga: nombre, deporte, lugar, horario, temporada y fechas (boliche; raqueta y equipos: secciones 4 y 5); ✅ muro (`/l/<liga>/muro`), invitar
  (`/l/<liga>/invitar`: QR, código, compartir el link y copiar; un miembro de una liga pública comparte su link) y
  seguir una liga pública. ⏳ tabla, jugadores, anuncios, temporadas, admin (🌐 «Tabla, jugadores y más en la web»).

## 3. Boliche (deporte activo)

- ✅ Evento (`/l/<liga>/e/<evento>`): «Tus juegos» (en la tabla, en el teléfono, enviado, a medias, por anotar), la
  serie, el botón que sigue (`nextGame` de `src/lib/useNextGame.ts`) y la práctica cerrada.
- ✅ Anotar un juego (`movil/src/components/bowling/ScoreEditor.tsx`): teclado (solo las teclas que valen), total con
  0–300, la hoja de 10 cuadros, «Llevas» y «Máx. posible», deshacer, cada tiro guardado en el teléfono y «Seguimos
  donde lo dejaste» (`src/components/frames/editorLogic.ts` y `draftMemory.ts`, los mismos de la web). Al guardar va a
  «Tus juegos» y se publica en vivo (`saveDraft`).
- ✅ Enviar mis juegos (`submitGames`, por la cola sin conexión): sale del teléfono al enviarse; si falla después,
  vuelve al teléfono con el aviso. Sin foto: pregunta si la liga la pide.
- ⏳ Pines (tocar los pinos que cayeron), corregir un tiro tocando su cuadro, la bola de cada juego.
- ⏳ Foto del marcador (cámara) y lectura con IA; aprobar envíos (admin); planilla y resultados; pistas; equipos fijos
  y de torneo; temporadas y ranking; bolas (catálogo, diseño, layout); juegos sueltos; jugador y «Mis números».

## 4. Raqueta: pádel, tenis, pickleball, ping pong

- ✅ Inicio de la liga (`movil/src/components/racket/RacketHome.tsx`): en vivo, mis próximos partidos, próximas fechas y
  anteriores; un torneo con un solo evento abre directo. Arriba, Partidos, Tabla y Mis partidos (`SportLinks`).
- ✅ Evento (`RacketEvent.tsx`): liga de parejas (tu próximo partido, jornadas, tabla y parejas), noche de americano o
  mexicano (te toca o descansas, canchas de la ronda, tabla y rondas) y torneo (categorías, grupos, cuadro y partidos).
- ✅ Partidos (`/l/<liga>/partidos`): en vivo, por confirmar, próximos y resultados; Todos · Míos (· liga y torneos ·
  noches). Tabla (`/l/<liga>/tabla`): ligas y grupos, ranking individual (por modalidad) y noches de la temporada.
- ✅ Partido (`/l/<liga>/partido/<id>`, también desde `?partido=` de los links y avisos): marcador, confirmar o «No es
  así», «Solo el resultado» (el mismo lector de la web: `racketResultParser`), decidir un reclamo (admin), compartir e
  historial.
- ✅ Modo cancha (`/l/<liga>/partido/<id>/cancha`, `RacketCourt.tsx` + `court/CourtShell.tsx`): la misma máquina de la
  web (`src/court/machine.ts`, `useCourt`, `usePointsCourt`), sets (quién saca y de qué lado, 15/30/40/AD, cambio de
  lado, retiro) y puntos del americano (a cuántos o por tiempo); deshacer, terminar, suspender, otro anotador y sin
  señal. La pantalla no se apaga mientras se anota.
- 🌐 Crear eventos y lo de organizar (armar jornadas, la siguiente ronda, grupos y cuadro), liga por cajas, escalera,
  las opciones del admin en un partido (corregir, W.O., aplazar), el perfil del jugador y las temporadas cerradas.

## 5. Equipos: baloncesto, fútbol, futsal

- ✅ Inicio (`movil/src/components/team/TeamScreens.tsx`): en vivo, «Tu próximo partido» con la convocatoria (Voy / Tal
  vez / No voy y cómo va tu equipo), próximos, resultados y la tabla corta con el máximo anotador o el goleador.
- ✅ Partidos (Por jugar · Resultados · Mi equipo, por jornada), el partido (marcador, confirmar o reclamar, compartir) y
  la tabla con anotadores (baloncesto) o goleadores (fútbol y sala).
- 🌐 La mesa anotadora y el acta (el botón abre la web), el detalle por cuarto, goles y tarjetas, la disciplina, los
  playoffs, los eventos especiales, armar el calendario y los equipos.

## 6. Golf, natación, esports

- ⏳ Golf: rondas, tarjeta por hoyos, tabla. Natación: competencias, series, cronómetro, resultados.
- ⏳ Esports: juegos, IDs de juego, equipos, torneos (cuadros, battle royale), inscripciones.

## 7. Social

- ✅ Social: «¿Qué jugaste hoy?» (texto, foto de la galería o la cámara, en tu perfil o en una de tus ligas, para
  todos o tus seguidores) y «Siguiendo · Descubrir · Juegos» (`movil/src/components/social/`).
- ✅ Publicación (`/p/<id>`): me gusta, comentarios, compartir y «⋯» (reportar, bloquear, borrar).
- ✅ Perfil (`/u/<id>`): Seguir, «Te sigue», biografía, contadores, publicaciones y juegos; seguidores y seguidos
  (`/u/<id>/seguidores`); reportar la cuenta, bloquear y desbloquear. 🌐 Estadísticas e insignias.
- ✅ Buscar (`/buscar`): personas y ligas (Todo · Personas · Ligas), seguir desde la lista; sin cuenta, ligas públicas.
- 🟡 Un juego compartido sale resumido (sin la tarjeta del juego) y los juegos de «Juegos» todavía sin me gusta.
- ⏳ Equipos (`/equipos`), compartir un partido desde la app, avisos de lo social (la campana).

## 8. Organizar y crear

- ✅ Crear liga o torneo (`/crear`, el asistente de la web con su misma lógica: Nombre · Día y lugar · Temporada ·
  Invitar). 🌐 El logo al crear y los esports (llevan a la web).
- 🌐 Organizar, Agenda.

## 9. Insignias, premios, reportes

- ⏳ Insignias del perfil y de la liga, el diseñador; premios del torneo; reportes en PDF y Excel (compartir con
  expo-sharing).

## 10. Superadmin

- 🌐 La consola se queda en la web (no hace falta en la app).

## 11. Lo del teléfono

- ✅ La cola sin conexión queda en el teléfono (`storage: 'local'` de `src/lib/db/outbox.ts`, elegido por
  `src/lib/db/outboxStorage.native.ts`): lo anotado sin señal sale al volver a abrir la app.
- ✅ La caché de consultas también (AsyncStorage, `src/lib/db/queryStore.native.ts`): sin señal, al volver a abrir la
  app se ve lo último que se leyó.
- ✅ Las fotos que esperan subir (`src/lib/data/photoStore.native.ts`: archivos de la app con expo-file-system). Falta
  la pantalla que toma la foto del marcador.
- ✅ Avisos con la app cerrada: expo-notifications, token guardado con `upsert_app_push`, envío por Expo desde
  `send-push`; tocar un aviso abre su pantalla. Falta en EAS: llave de APNs y FCM (docs/movil.md › Publicar).
- ✅ Fotos desde el teléfono: elegir o tomar (expo-image-picker), achicar como la web (expo-image-manipulator +
  `fitImage`, `movil/src/lib/pickImage.ts`) y subir los bytes (React Native no arma `new Blob([bytes])`:
  `src/lib/bytesBlob.native.ts` y `storage.upload` de `movil/src/platform/backend.ts`).
- ✅ Links: los de `/unirse/…`, `/l/…`, `/p/…` y `/u/…` abren la app (`app.json`, `+native-intent.tsx`); los archivos de
  `/.well-known/` salen de `movil/scripts/enlaces-universales.mjs` cuando estén el Team ID y las huellas.
- ✅ Compartir (la hoja del teléfono: publicaciones, invitaciones; expo-sharing para archivos), fotos y cámara
  (expo-image-picker), vibración (expo-haptics). ⏳ Escanear un QR (expo-camera).
