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
- ✅ `/unirse/<código>`: a qué liga lleva, «¿Quién eres?» si el admin ya anotó jugadores sin cuenta (queda pendiente de
  que lo apruebe) y «Unirme a la liga» o «Unirme como …».
- ✅ Escanear el QR (`movil/src/app/escanear.tsx`, expo-camera; «o escanea el QR» en Hoy): la misma lógica de la web
  (`routeFromScan`), «Ese QR no es de MatchMate» con Copiar y Escanear otro, «Escribir el código» y la linterna.
  Hace falta un build nuevo de la app (módulo nativo). 🌐 Leer el QR de una foto.
- ✅ Lo de hoy, como la web: la práctica o el torneo de boliche en juego con su botón (anotar, seguir, enviar; la del
  horario se abre al tocar), los partidos en vivo, tu próximo partido o lo próximo con «Voy», «Nada programado» y «Lo
  que viene» (`movil/src/components/home/Activity.tsx`; los datos son `useActivity` de `src/components/home/activity.ts`,
  el mismo de la web). Con datos de prueba: `/dev/hoy`. 🌐 El calendario completo y «¿Dónde jugaste?».
- ✅ Campana de avisos en Hoy (con el número de lo nuevo) y Avisos (`/avisos`): los mismos avisos de la web (el
  proveedor `src/components/notifications/provider.tsx` es el mismo en las dos; la vista de la app sale de
  `src/lib/visibility(.native).ts`), por Hoy, Esta semana y Antes, filtros por tipo y por deporte, «Marcar todo como
  leído» y las invitaciones sin responder con Aceptar y Rechazar. Tocar un aviso abre lo suyo (en la app si la tiene).
- ✅ Una invitación (`/invitacion/<id>`): quién invitó, la liga con sus datos, «¿Quién eres?»
  (`movil/src/components/league/WhoAreYou.tsx`) y Aceptar / Rechazar; la de anotador lleva al torneo. Las de equipos
  abren la web (no hay `/equipos` en la app todavía).
- ✅ Ligas: las tuyas y las abiertas, con búsqueda; «Crear liga» y «Crear torneo».
- 🟡 La liga: nombre, deporte, lugar, horario, temporada y fechas (boliche; raqueta y equipos: secciones 4 y 5); ✅ muro (`/l/<liga>/muro`), invitar
  (`/l/<liga>/invitar`: QR, código, compartir el link y copiar; un miembro de una liga pública comparte su link) y
  seguir una liga pública. ⏳ tabla, jugadores, anuncios, temporadas, admin (🌐 «Tabla, jugadores y más en la web»).

## 3. Boliche (deporte activo)

- ✅ Evento (`/l/<liga>/e/<evento>`): «Tus juegos» (en la tabla, en el teléfono, enviado, a medias, por anotar), la
  serie, el botón que sigue (`nextGame` de `src/lib/useNextGame.ts`) y la práctica cerrada.
- ✅ Anotar un juego (`movil/src/components/bowling/ScoreEditor.tsx`): pines, teclado (solo las teclas que valen), total con
  0–300, la hoja de 10 cuadros, «Llevas» y «Máx. posible», deshacer, cada tiro guardado en el teléfono y «Seguimos
  donde lo dejaste» (`src/components/frames/editorLogic.ts` y `draftMemory.ts`, los mismos de la web). Al guardar va a
  «Tus juegos» y se publica en vivo (`saveDraft`).
- ✅ Enviar mis juegos (`submitGames`, por la cola sin conexión): sale del teléfono al enviarse; si falla después,
  vuelve al teléfono con el aviso. Sin foto: pregunta si la liga la pide.
- ✅ Pines (tocar los pinos que cayeron, con Fallo, Strike o Spare y Anotar), corregir un tiro tocándolo en la hoja
  (dejarlo presionado lo borra; «Listo», «Deshacer» o «Dejar en −») y la bola de cada juego arriba del editor (la
  misma lógica de la web: `editorLogic.ts`, `replaceRoll`, `src/components/balls/choice.ts`). Agregar una bola nueva
  todavía es en la web. Se prueba sin cuenta en `/dev/anotar`.
- ✅ Enviar mis juegos con la foto del marcador (cámara o galería) y la lectura con IA en segundo plano (`scanJobs`,
  como la web: se puede enviar sin esperar; si la foto dice otra cosa, avisa y deja «Usar lo de la foto»), con la bola
  de cada juego (`movil/src/app/l/[lid]/e/[eventId]/enviar.tsx`).
- ✅ «Por aprobar» en el evento (owner y admin): Aprobar, Rechazar con motivo y Aprobar todo, con la foto en grande
  (`approvalLogic.ts`, la misma de la web); lo que hay que revisar a fondo abre Organizar › Aprobar en la web.
- ✅ «Cómo van todos» / «Resultados» del evento (`boardRows` de la web). 🌐 Anotarle a otro en la Planilla, la
  clasificación del torneo y Organizar › Aprobar completo.
- ✅ La Tabla del boliche por temporada (`/l/<liga>/tabla`, Lite de la web: Promedio, Mejor juego, Mejor serie,
  Asistencia, tu lugar con su barra y «Tú»; `movil/src/components/bowling/BowlingRanking.tsx`). 🌐 La tabla completa
  de Pro (columnas, con hcp, récords, el más mejorado) y el historial de temporadas.
- ✅ Un jugador y «Mis números» (`/l/<liga>/j/<jugador>`): sus números, sus envíos, torneos con su lugar, prácticas y
  por temporada. 🌐 La tendencia y el análisis por cuadros (gráficas).
- ✅ «Tu pista: 7 · con …» en el evento y «Pista 7» en Hoy, cuando el admin ya las publicó (`myLaneText`, ahora en
  `src/lib/lanes.ts`). 🌐 Armar y publicar las pistas.
- ⏳ Equipos fijos y de torneo; bolas (catálogo, diseño, layout); juegos sueltos.
- Para probar sin cuenta: `/dev/empresa` › Entrar a la demostración trae una liga de boliche ficticia
  (`movil/src/platform/demoLeague.ts`: práctica hoy con pistas, dos pasadas, un envío por aprobar y una planilla).

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

- ✅ Golf, inicio de la liga (`movil/src/components/golf/GolfHome.tsx`, Lite de la web): la ronda de hoy con lo tuyo en
  una línea y UN botón («Seguir en el hoyo 7», «Inscribirme»; `golfNow`), los 3 de arriba del orden de mérito con
  «Ver toda», «Próximas rondas» y «Resultados». Un torneo sin liga con una sola ronda abre la ronda.
- ✅ Golf, la ronda (`/l/<liga>/e/<evento>`, `GolfEvent.tsx`): Tarjeta · Leaderboard · Jugadores, como la web.
  - Tarjeta (`GolfCourt.tsx`): hoyo por hoyo con − / + (par de un toque), «Recogió», putts, «Hoyo listo → hoyo N», tu
    grupo o solo tu tarjeta; los golpes se guardan en el teléfono y se publican cada 3 hoyos por la cola sin conexión
    (`courtLog.ts` de la web). La pantalla no se apaga mientras se anota.
  - Revisar y firmar la tarjeta (hoja con los 9 de ida y vuelta, bruto, neto y Stableford; `queueGolfSign`).
  - Leaderboard (`roundBoard` de la web) y Jugadores: inscribirme con salida e Index (sale tu handicap de juego), mi
    tarjeta (cambiar la salida antes de anotar, salirme) y los grupos.
- ✅ Golf, orden de mérito de la temporada (`/l/<liga>/tabla`, `GolfStandings.tsx`, `useGolfMerit`): tu lugar con su
  barra, la lista con «Tú» y las rondas que cuentan.
- 🌐 Golf: crear rondas y torneos, campos y formato, armar los grupos, inscribir a otros, la tabla de Pro y otras
  temporadas, el perfil de golf del jugador y lo del admin en la tarjeta.
- Para probar golf sin cuenta: la demostración (`/dev/empresa`) trae «Golf de Ejemplo» (ronda en juego hoy y una
  cerrada; `demoLeague.ts`).
- ✅ Natación, inicio de la liga (`movil/src/components/swimming/SwimHome.tsx`, Lite de la web): el próximo encuentro
  con su aviso y «Cronometrar» (quien cronometra), tus marcas con «Ver todas», próximos encuentros y anteriores; arriba,
  Puntos y Mis marcas.
- ✅ Natación, el encuentro (`/l/<liga>/e/<evento>`, `SwimEvent.tsx`, `meetTabs` de la web): Pruebas (inscribirse uno
  mismo, o el entrenador a su club; cambiar la siembra o salirse), Series y Resultados; con `?ver=` (un link de Pro para
  quien organiza o cronometra) también Programa, Inscritos, Cronometrar y Puntos, solo para mirar lo del admin.
  - Cronometrar (`SwimTiming.tsx`, la lógica de `timing.ts` de la web): la prueba y la serie, SALIDA, STOP por carril,
    escribir el tiempo con el teclado, DQ/DNS/DNF, deshacer y «Publicar serie»; luego pasa a la serie que sigue. La
    pantalla no se apaga mientras se cronometra.
- ✅ Natación, Puntos de la temporada por club (`/l/<liga>/tabla`, `SwimStandings.tsx`) y Mis marcas
  (`/l/<liga>/perfil`) o un nadador (`/l/<liga>/j/<jugador>`): marcas personales por piscina, cómo fue bajando, lo
  nadado y los nadadores de tu club si lo entrenas.
- 🌐 Natación: crear y cambiar encuentros, Admin › Clubes y Nadadores, registrar un nadador, cronometristas,
  finalizar o volver a abrir, borrar, armar el programa y las series (mover carriles y publicar), inscribir a
  cualquiera, el reporte (PDF o Excel), transmitir y «Ver en vivo», premios del encuentro, compartir las imágenes, el
  modo piscina, la tabla completa de Pro y las temporadas cerradas.
- Para probar natación sin cuenta: la demostración trae «Natación de Ejemplo» (`movil/src/platform/demoSwim.ts`: el
  festival de hoy con la hoja de series, dos encuentros finalizados y uno próximo).
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

## 8b. Empresas (docs/empresas.md)

- ✅ Mi empresa (`/empresa`, `movil/src/app/(tabs)/empresa.tsx`): registrarla (queda en revisión y la app pasa a modo
  empresa), cómo va la revisión (en revisión, aprobada, rechazada o suspendida con el motivo), sus espacios, sus
  datos (hoja), usar la app como jugador y borrarla. La lógica es la de la web (`src/lib/data/business.ts` y
  `src/pages/business/logic.ts`, que salió de BusinessForm/BusinessPage/VenueSheet).
- ✅ Un espacio (`/espacio/nuevo` o `/espacio/<id>`, pantalla propia en vez de la hoja de la web): el deporte, lo que
  pide (`venueFields`: números, fichas para las opciones e interruptores), precio, horario, teléfono y si sale en
  Dónde jugar; las fotos (varias de la galería o la cámara, `showcasePhoto` de `movil/src/lib/pickImage.ts` con
  `SHOWCASE_FIT` de la web: 1600 px y 450 kB), portada y quitar; pedir destacarlo; enlazar un torneo que organizas;
  «Ver cómo la ven los jugadores» y borrarlo.
- ✅ Dónde jugar (`/canchas`, desde Ligas): por deporte (`?deporte=`), ciudad y nombre, las destacadas primero; la
  ficha (`/canchas/<id>`): fotos, deporte y lo que tiene, precio, WhatsApp (`whatsappLink`), llamar, el mapa, horario,
  la empresa, los torneos y, para la dueña, «Cambiar en mi panel».
- ✅ El modo de la cuenta (`profile.accountMode`): en modo empresa la barra es Mi empresa · Social · Yo y el inicio
  lleva a `/empresa`; en modo jugador, Hoy · Social · Ligas · Yo con «Dónde jugar» en Ligas. Se cambia en Yo (y en
  Mi empresa). Las pestañas que no tocan se esconden con `tabBarButton: () => null` (con `href: null` expo-router 58
  ya no deja abrir la pantalla).
- ✅ Links: `/canchas` y `/canchas/<id>` (`links.ts`), `/canchas/` abre la app (`APP_LINK_PATHS` y `app.json`).
- 🌐 La consola del superadmin (aprobar, comisión, promociones) se queda en la web.

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
- ✅ Links: los de `/unirse/…`, `/l/…`, `/p/…`, `/u/…` y `/canchas/…` abren la app (`app.json`, `+native-intent.tsx`); los archivos de
  `/.well-known/` salen de `movil/scripts/enlaces-universales.mjs` cuando estén el Team ID y las huellas.
- ✅ Compartir (la hoja del teléfono: publicaciones, invitaciones; expo-sharing para archivos), fotos y cámara
  (expo-image-picker), vibración (expo-haptics). ⏳ Escanear un QR (expo-camera).
