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
- ✅ Yo (`movil/src/app/(tabs)/yo.tsx` y `movil/src/components/yo/`, ProfilePage de la web en Lite, con la lógica de
  `src/pages/yoParts.ts`, `src/components/bowlingNumbers.ts` y `stats/yoTrend.ts`): la lupa y el engranaje, tu foto,
  nombre, «@usuario · tu liga» y biografía, «Tu promedio» con la gráfica corta y cómo vas (o cómo empezar), Mis bolas,
  Insignias, Dónde juego y las filas (Mis juegos, Anotar un juego suelto, Mis publicaciones, Mis equipos, Amigos y
  seguidores); las partes en `/yo/juegos`, `/yo/publicaciones` y `/yo/insignias` con «‹ Yo» (`/perfil?tab=` lleva ahí).
  Sin cuenta, «Tu perfil de jugador». La demo: `movil/src/platform/demoYo.ts`.
  - En «Dónde juego», las ligas de golf, raqueta y equipos llevan a la liga (la app no tiene su página de jugador).
- ✅ Configuración (`/cuenta`, `movil/src/app/cuenta/index.tsx` y `movil/src/components/account/`, AccountPage de la
  web con la lógica de `src/components/cuenta/logic.ts`): tu nombre, tu usuario (revisa si está libre mientras escribes),
  la contraseña (también al volver de «Olvidé mi contraseña», `?recuperar=1`), el perfil público (foto con `?foto=1`,
  biografía de 160 y personas bloqueadas), Apariencia, Notificaciones, Mis ligas, Tus datos, MatchMate (Organizar con lo
  que espera, Mi empresa) y Cerrar sesión. Como en la web, Yo lleva ahí con el engranaje y la foto. 🌐 Términos,
  privacidad, Acerca de, Contáctanos y el panel del superadmin. La foto sale en JPEG (el teléfono no hace WebP).
  La demo trae la cuenta de prueba editable (`movil/src/platform/demoAccount.ts`).
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
  el mismo de la web). Con datos de prueba: `/dev/hoy`.
- ✅ El Calendario (la hoja de «Lo que viene»), «Anotar un juego» con «¿Dónde jugaste?» y «Seguir mi juego N»
  (`movil/src/components/agenda/HomeSheets.tsx`, la lógica de `src/components/home/where.ts`, la misma de la web).
  - ⏳ Las filas de «¿Dónde jugaste?» abren el evento con `?anotar=1`; el evento de la app todavía no abre la hoja de
    anotar con ese parámetro. ⏳ En «Enviar mis juegos», el selector del evento («Otro día (elegir fecha)»).
- ✅ Campana de avisos en Hoy (con el número de lo nuevo) y Avisos (`/avisos`): los mismos avisos de la web (el
  proveedor `src/components/notifications/provider.tsx` es el mismo en las dos; la vista de la app sale de
  `src/lib/visibility(.native).ts`), por Hoy, Esta semana y Antes, filtros por tipo y por deporte, «Marcar todo como
  leído» y las invitaciones sin responder con Aceptar y Rechazar. Tocar un aviso abre lo suyo (en la app si la tiene).
- ✅ Una invitación (`/invitacion/<id>`): quién invitó, la liga con sus datos, «¿Quién eres?»
  (`movil/src/components/league/WhoAreYou.tsx`) y Aceptar / Rechazar; la de anotador lleva al torneo. Las de equipos
  llevan al equipo (`/equipos/<equipo>`).
- ✅ Ligas: las tuyas y las abiertas, con búsqueda; «Crear liga» y «Crear torneo».
- 🟡 La liga: nombre, deporte, lugar, horario, temporada y fechas (boliche; raqueta y equipos: secciones 4 y 5); ✅ muro (`/l/<liga>/muro`), invitar
  (`/l/<liga>/invitar`: QR, código, compartir el link y copiar; un miembro de una liga pública comparte su link) y
  seguir una liga pública. La tabla de cada deporte está en sus secciones (3 a 6).
- ✅ Avisos de la liga (`movil/src/components/league/Announce.tsx`, los mismos de la web): el aviso del admin de los
  últimos 2 días arriba en el inicio de la liga (cerrarlo; quien no organiza lo puede reportar) y, para quien la
  organiza, Organizar › «Avisar a toda la liga» (`/l/<liga>/avisar`: avisos listos, a cuántos les llega, cuántos
  quedan hoy, confirmar antes de enviar y los últimos enviados).
- ✅ Organizar › Jugadores (`/l/<liga>/jugadores`, `movil/src/components/players/`, la lógica de
  `src/components/players/list.ts` y `logic.ts`, la misma de la web): buscar, la lista con su línea, agregar uno o
  varios (menores con tutor), editar (nombre, promedio fijo, Index, posición y dorsal, menor y tutor), vincular o
  desvincular la cuenta, juntar con…, compartir su link y eliminar. En el inicio de la liga, «Jugadores y miembros»
  con cuántos y cuántos con cuenta.
  - ✅ Miembros (`/l/<liga>/miembros`, `movil/src/components/members/`, la lógica de `src/components/league/members.ts`,
    la misma de la web) y Reclamos (`/l/<liga>/reclamos`, `movil/src/components/claims/`, `src/components/claims/panel.ts`
    y `logic.ts`): el papel de cada cuenta, hacer o quitar admin, dejar de ser admin, anotador, «Diseña insignias», su
    jugador y sacar de la liga; aprobar o rechazar un «ese soy yo» con nota, lo que jugó cada uno, lo que choca y «Ya
    decididos». El segmentado Jugadores · Miembros · Reclamos cambia de pantalla; donde el deporte lleva a su gente en
    su pestaña (natación: Nadadores; raqueta: Parejas y niveles) no sale «Jugadores» y debajo de Miembros van
    «<su gente> y sus cuentas». La demo trae cinco cuentas más y dos reclamos (`movil/src/platform/demoMembers.ts`).
  - 🌐 «Ver su página» de quien no es de boliche.
- ✅ Temporadas (`/l/<liga>/temporadas`, `movil/src/components/season/Seasons.tsx`, SeasonsPage de la web): cada
  temporada con sus fechas, el campeón y los demás premios, el campeón del playoff y la tabla final guardada; la en
  curso lleva a su tabla («?temporada=» abre esa temporada en la Tabla del boliche). «Campeones» abajo en el inicio de
  cualquier liga.
- ✅ Organizar › Temporada y fechas (`/l/<liga>/temporada`, `movil/src/components/seasonAdmin/`, la lógica de
  `src/components/organizer/suspendForm.ts` y `src/components/season/adminLogic.ts`, la misma de la web): «Suspender
  un día» (el día, el motivo con los motivos listos, la nueva fecha opcional, lo que va a pasar y confirmar antes del
  aviso) y, en una liga, «Cerrar temporada» (la tabla final, los premios propuestos que se pueden cambiar, otros
  premios con nota y el aviso), «Corregir premios», «Nueva temporada» (el nombre sigue al año, las fechas y, en las
  ligas de equipos, copiar los equipos) y el historial. En un torneo suelto, «Fechas». En el inicio, la fila.
  - 🌐 Cerrar y corregir la temporada en raqueta (su tabla usa lo que cada deporte agrega en la web).
  - «Hoy · Suspender» en el inicio de la liga (SuspendTodayCard) es de Pro en la web; la app es Lite: no va.
- La demostración trae en «Liga de Ejemplo» la «Temporada de Ejemplo 1» cerrada (tabla final y premios) y la
  «Temporada de Ejemplo 2» en curso (`movil/src/platform/demoSeasons.ts`).
- ✅ Ajustes de la liga (`/l/<liga>/ajustes`, `movil/src/components/leagueSettings/`, la lógica de
  `src/components/league/settings.ts`): los datos (y cambiarlos), el logo, las transmisiones en vivo, la invitación con
  su código y QR, y «Respaldo y borrar la liga» (fotos viejas, borrar). 🌐 «Invitar personas», «Ir a En vivo» y
  descargar el respaldo en el teléfono. El logo sale en JPEG.
- ✅ Buzón (`/l/<liga>/buzon`, `movil/src/components/suggestions/`, `src/components/suggestions.ts`): las notas de los
  jugadores, marcarlas y borrarlas; y del lado del jugador, «Escribir» (anónimo o con tu nombre) como última fila de la
  liga o en su tarjeta.
- ✅ Anotadores (la hoja de Organizar › La liga, `movil/src/components/scorers/`, la lógica de
  `src/components/scorers/logic.ts`): los que anotan ahora, de la liga, por @usuario y el link para anotar (crear,
  compartir, cambiar y quitar); y el link `/anotar/<código>` (`movil/src/app/anotar/[code].tsx`, también como enlace
  universal; al entrar vuelve a él).
- ✅ Reportes (`/l/<liga>/reportes`, `movil/src/components/reports/`, `src/components/report/logic.ts`): abiertos y
  cerrados, borrar el comentario, marcar como atendido o descartar.
- La demo trae en «Liga de Ejemplo» un anotador invitado, el link `ANTE234567` (y `VENC234567`, vencido), dos reportes
  abiertos y uno cerrado, dos notas en el buzón y los ajustes editables (`demoScorers.ts`, `demoReports.ts`,
  `demoSettings.ts`).

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
  (`approvalLogic.ts`, la misma de la web); «Revisar» abre Organizar › Aprobar juegos.
- ✅ Organizar › Aprobar juegos (`/l/<liga>/aprobar`, `movil/src/components/approvals/`, la lógica de
  `src/pages/approvals.ts`, la misma de la web): todos los envíos de la liga, el más viejo primero, con su foto (acercar
  y alejar), de qué evento es, la lectura con IA (leer, volver a leer, elegir la fila, «Usar lo leído»), los cuadros
  que anotó, corregir los juegos y desde qué juego, quien se inscribe al aprobar, Rechazar con motivo, Aprobar,
  «Aprobar todo» y descartar el envío de un jugador o evento que ya no existe. La demo trae tres envíos más
  (`movil/src/platform/demoApprovals.ts`).
- ✅ «Cómo van todos» / «Resultados» del evento (`boardRows` de la web). 🌐 Anotarle a otro en la Planilla.
- ✅ La clasificación de un torneo ya jugado (`movil/src/components/bowling/Standings.tsx`, StandingsTab de la web en
  solo mirar): mejor juego y jugadores, los equipos (con sus jugadores) y lo individual, cada tabla con «Con
  handicap · Scratch» y el aviso si no es el criterio oficial. El anuncio de un torneo que viene con «Escribir a…»
  por WhatsApp (`TourneyAnnouncement.tsx`; en un torneo sin liga, con cuánto falta).
- ✅ La Tabla del boliche por temporada (`/l/<liga>/tabla`, Lite de la web: Promedio, Mejor juego, Mejor serie,
  Asistencia, tu lugar con su barra y «Tú»; `movil/src/components/bowling/BowlingRanking.tsx`). 🌐 La tabla completa
  de Pro (columnas, con hcp, récords, el más mejorado) y el historial de temporadas.
- ✅ Un jugador y «Mis números» (`/l/<liga>/j/<jugador>`): sus números, sus envíos, torneos con su lugar, prácticas y
  por temporada. 🌐 La tendencia y el análisis por cuadros (gráficas).
- ✅ «Tu pista: 7 · con …» en el evento y «Pista 7» en Hoy, cuando el admin ya las publicó (`myLaneText`, ahora en
  `src/lib/lanes.ts`). 🌐 Armar y publicar las pistas.
- ✅ Juegos sueltos (`/juegos-sueltos`, `movil/src/app/juegos-sueltos.tsx`, Lite de la web): tu promedio y tu mejor
  juego, «Anotar juego suelto» y la lista por mes (el candado si no sale en tu perfil, la nube si falta enviarlo).
  La hoja (`movil/src/components/solo/SoloGameSheet.tsx`, la lógica de `src/components/solo/logic.ts`, la misma de
  la web): la fecha, la bolera (con las que ya pusiste), de 1 a 10 juegos con su total o tiro por tiro («cuadros» o
  «pines» abre el editor de la app con «Listo»), la bola de cada juego o de todos, la nota y «Que salga en mi perfil»;
  guardar va por la cola (sin señal sale solo) y borrar pregunta antes. En Yo: «Anotar un juego suelto» y «Juegos
  sueltos». 🌐 Las estadísticas de Pro (tendencia y tiros).
- ✅ Mis bolas (`/bolas`, `movil/src/app/bolas.tsx`): con cuál tiras mejor, cada bola en su tarjeta dibujada con su
  diseño (la misma geometría de la web, `src/components/balls/art.ts`, con react-native-svg), sus números, «La pulí
  hoy», Editar y Retirar o Volver a usarla en su «•••», «Agregar bola» (hasta 30) y las retiradas aparte; «Buscar
  bolas» en el catálogo con «Agregar a mi arsenal» (la hoja ya llena con el modelo y sus colores).
  - La hoja de una bola (`BallSheet.tsx`, con `sheet.ts` y `layout.ts` de la web): catálogo, nombre, marca, peso,
    color, cubierta, fechas, perforación Dual Angle y Borrar. Las fechas van con «‹ ›» y «−7/+7» (`DateStepper`).
  - La bola de cada juego al anotar (`GameBall.tsx`): dibujada, con «Agregar bola» encima de la hoja (queda elegida).
  - Yo › «Mis bolas» (`MyBalls.tsx`, Lite).
  - ✅ El creador de la bola («Diseñar», `movil/src/components/balls/BallDesigner.tsx`, con `designer.ts` y
    `controls.ts` de la web; `/bolas?disenar=<bola>`): colores (con «Otro color» en un tablero de tono y brillo y una
    tira de grises: en el teléfono no hay selector del sistema), dibujo con tamaño, suavidad y ángulo, brillo y huecos,
    y figuras (agregar, tocar la bola para ponerlas, flechas, tamaño, giro); la bola se queda arriba al bajar.
  - 🌐 Yo › Pro › «Por bola» (es de Pro).
- ✅ Equipos fijos en el inicio de la liga (`movil/src/components/bowling/LeagueTeams.tsx`): cada equipo con su color,
  sus jugadores y la suma de sus promedios, tu equipo con «Tú» y «Editar» para quien organiza.
- ✅ Organizar › Equipos (`/l/<liga>/equipos`, `movil/src/components/bowlingTeams/`, la lógica de
  `src/lib/data/bowlingTeams.ts` y `src/components/bowlingTeams/logic.ts`, la misma de la web): generar al azar o
  parejos por promedio (de a 2 a 6, quiénes entran, cómo quedan, mezclar otra vez, reemplazar con aviso), crear,
  nombre y color, borrar, agregar jugadores, mover o sacar a uno y «Sin equipo». En el inicio, la fila «Equipos».
  - 🌐 «Otro color» del equipo (cualquier color con el selector del navegador): en el teléfono, los 10 de la paleta
    (el tablero de «Otro color» de las bolas, `ColorBoard`, se puede usar aquí más adelante).
- ✅ Torneo › Equipos (`/l/<liga>/e/<evento>/equipos`, quien organiza un torneo; `movil/src/components/event/`, la
  lógica de `src/components/bowlingTeams/eventTeams.ts`): «Usar los equipos fijos de la liga», crear, «Armar
  automáticamente», renombrar, eliminar, quitar a uno, agregar de los sin equipo y «Sin equipo».
- La demostración trae dos equipos fijos en «Liga de Ejemplo» (`movil/src/platform/demoTeams.ts`), la «Copa de
  Ejemplo» ya jugada (su clasificación) y el «Torneo de Ejemplo» que viene, con sus equipos y su anuncio.
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
- ✅ Esports, la liga o el torneo (`movil/src/components/esports/EsportsLeague.tsx`, Lite de la web): los torneos de la
  liga (un torneo suelto abre su página); arriba, Partidos, Tabla y Lo mío.
- ✅ Esports, un torneo (`/l/<liga>/e/<evento>`, `Tournament.tsx`): fecha, juego y formato, premio, «Anotar
  resultado» o lo que te toca, tu inscripción, Cuadro (eliminación, `Bracket.tsx`), grupos y todos contra todos,
  battle royale (tabla y partidas con sus fotos, `Br.tsx`), Equipos e Info.
- ✅ Esports, la serie (`/l/<liga>/partido/<id>`, `EsportsMatch.tsx`): el marcador mapa por mapa, anotar con la regla
  del juego (rondas, goles, vidas…) y hasta 3 fotos, confirmar o «No es así» (el mismo `ConfirmResult` de raqueta).
- ✅ Esports, inscribirse (`RegisterSheet.tsx`): solo, como agente libre o con tu equipo, con tu ID de juego; mi
  inscripción, la plantilla y salirme. Partidos (Todos · Míos), Tabla (`?torneo=`) y Lo mío (`/l/<liga>/perfil`).
- ✅ Esports fuera de la liga (`movil/src/app/esports/`): el índice (`/esports`: mis torneos, mis equipos y los juegos),
  Mi ID de juego (agregar, rango, plataformas, borrar), un equipo (miembros, invitar con el link o el código, roles,
  salirme), unirse a un equipo con el código (`/esports/unirse/<código>`, también desde un link) y la página de cada
  juego (torneos abiertos y equipos). La fila «Esports» en Hoy y «Torneos de esports» en Ligas (`esportsPresence.ts`,
  la misma lógica de la web).
- 🌐 Esports: crear torneo o liga, lo del organizador (revisar inscripciones, sembrar, armar el cuadro, playoffs,
  agentes libres, editar, cerrar o cancelar, anotadores), anotar una partida de battle royale, corregir una serie,
  W.O., cambiar la hora, anular o decidir un reclamo, transmitir, «Conectar con Epic/Steam/Riot» y el logo del equipo.
- ✅ Esports: las pantallas de `/esports` van en el violeta de los esports (`SportColors` de
  `movil/src/theme/theme.tsx`, el EsportsTint de la web) y el aviso «Tu ID pasó a otra cuenta» sale también en Hoy (la
  demo trae uno).
- Para probar esports sin cuenta: la demostración trae «Esports de Ejemplo» (`movil/src/platform/demoEsports.ts`: un
  torneo de eliminación con tu semifinal por anotar, una copa de todos contra todos con una serie por confirmar, un
  abierto con inscripción, tu equipo y tu ID; el código `UNIR2345` lleva a otro equipo).

## 7. Social

- ✅ Social: «¿Qué jugaste hoy?» (texto, foto de la galería o la cámara, en tu perfil o en una de tus ligas, para
  todos o tus seguidores) y «Siguiendo · Descubrir · Juegos» (`movil/src/components/social/`).
- ✅ Publicación (`/p/<id>`): me gusta, comentarios, compartir y «⋯» (reportar, bloquear, borrar).
- ✅ Perfil (`/u/<id>`): Seguir, «Te sigue», biografía, contadores, publicaciones y juegos; seguidores y seguidos
  (`/u/<id>/seguidores`); reportar la cuenta, bloquear y desbloquear; sus insignias (§9). 🌐 Estadísticas.
- ✅ Buscar (`/buscar`): personas y ligas (Todo · Personas · Ligas), seguir desde la lista; sin cuenta, ligas públicas.
- ✅ La publicación con un juego compartido lleva la tarjeta del juego (`movil/src/components/social/GameCard.tsx`, la
  de la web), y los juegos (Social › Juegos y el perfil) tienen me gusta, «Compartir en Social», «Reportar juego» y
  «Ver» (el detalle de un juego de boliche, en la web). Compartir un partido de raqueta o de equipos: la imagen (sin el
  texto en Android), WhatsApp, texto o «Publicar en Social» (`movil/src/components/match/ShareResult.tsx`). Los avisos
  sociales en la campana. La demo trae publicaciones con juego, me gusta y avisos sociales (`demoSocial.ts`).
  - ⏳ «Publicar en Social» en el evento de boliche y de golf (`PublishButton` ya está en `ShareToSocial.tsx`).
- ✅ Equipos (`/equipos`, `/equipos/<equipo>` y `/equipos/unirse/<código>`, `movil/src/components/squads/`, la lógica de
  `src/components/squads/logic.ts` y `src/pages/squads/squadForm.ts`): mis equipos, los que sigo, buscar, unirme con
  código, crear (deporte, datos y logo), y en cada equipo sus publicaciones (publicar en el equipo), juegos, torneos,
  estadísticas y plantilla (posición, número, pasar la capitanía, sacar), invitar (personas que sigues, @usuario,
  código y QR), editar, salir, borrar e inscribirlo en una liga; aceptar o rechazar una invitación. «Tus equipos» en
  Ligas, «Mis equipos» en Yo, y para quien organiza una liga de fútbol, futsal o baloncesto, «Equipos que quieren
  entrar» (en el inicio de la liga y en Organizar). `/equipos/unirse/` abre la app. Diferencias: compartir el link con
  la hoja del teléfono, el logo en JPEG y el color del equipo solo en la cabecera. La demo trae «Equipo de Ejemplo»,
  «Fútbol de Ejemplo» y el código `EQUI2345` (`movil/src/platform/demoSquads.ts`).

## 8. Organizar y crear

- ✅ Crear liga o torneo (`/crear`, el asistente de la web con su misma lógica: Nombre · Día y lugar · Temporada ·
  Invitar). 🌐 El logo al crear y los esports (llevan a la web).
- ✅ Organizar (`/organizar`, `?liga=` elige la liga; `movil/src/app/organizar.tsx` y
  `movil/src/components/organizer/Organize.tsx`, con los datos de `src/components/organizer/hubData.ts`, los mismos de
  la web): la ficha de la liga con «Lo que organizas» (cada liga con lo que espera y su número), «Por hacer» (solo lo
  que tiene algo) y «La liga» (o «El torneo»), cada fila a su pantalla de la app o, si todavía no la tiene, a la web.
  Las pantallas propias de cada deporte salen de `src/sports/adminTabs.ts` (también las usa la web). En el inicio de la
  liga, «Organizas esta liga» con lo que espera (`useLeagueToDo`, el de la web). `/l/<liga>/admin` sin pestaña abre
  Organizar de esa liga.
- ✅ Agenda (`/agenda`, `movil/src/components/agenda/`, la lógica de `src/components/agenda/logic.ts` y `week.ts`): «Tus
  ligas» semana por semana (con «Voy») y «Abiertas» (las ligas públicas con lugar, por deporte, con «Me apunto», «¿Quién
  eres?» y al volver de entrar, `?apuntar=`). Se llega desde Ligas, el Calendario de Hoy y la portada sin cuenta. La demo
  trae ligas públicas de boliche, golf y pádel (`movil/src/platform/demoAgenda.ts`).

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

- ✅ Insignias (`movil/src/components/badges/`, la lógica de `src/components/badges/*.ts`, la misma de la web; el
  dibujo de la web con react-native-svg, `paint.ts` y `motion.ts`): la vitrina del perfil (`/u/<id>?tab=insignias`,
  `&insignia=` abre una): las ganadas, las próximas con lo que falta, las bloqueadas, destacar (el lápiz), ocultar y el
  detalle; los premios del mes en el inicio de la liga y sus insignias en la página del jugador; el aviso al ganar
  (encima de la app; espera mientras se anota en la cancha, el campo o la piscina); Organizar › Insignias (las
  automáticas y quién diseña y da) y Organizar › Insignias por confirmar (`/l/<liga>/confirmar`). La demo trae nueve
  ganadas, tres en el aviso, los premios de octubre y una hazaña por confirmar (`movil/src/platform/demoBadges.ts`).
  - ✅ El creador de insignias (`movil/src/components/badges/maker/`, la lógica de
    `src/components/badges/maker/{design,view,give,look,templates,suggest}.ts`): Organizar › Insignias › «Insignias de
    la liga» (activas, las últimas que se dieron, archivadas, escondidas), nueva insignia (plantillas, forma, color,
    ícono, textos, cupo, por equipo, vista previa clara y oscura), cambiar, duplicar, archivar, borrar, «Dar insignia»
    (sugerencias, periodo, división, nota, «Así la verá», deshacer), el detalle con «Quién la tiene» (deshacer, quitar,
    ocultar de mi perfil, reportar), el estante del inicio y «De la liga» en la página del jugador. «Otro color»: los
    8 colores y el código (en el teléfono no hay selector del sistema). La demo: `movil/src/platform/demoMaker.ts`.
  - 🌐 Compartir la imagen de una insignia (en la web se arma con canvas).
- ✅ Premios del torneo (`movil/src/components/prizes/`, la lógica de `src/prizes/*` y
  `src/components/prizes/{gate,view,screens}.ts`, la misma de la web): la tarjeta «Premios del torneo» (la insignia de
  cada lugar, «Por ahora: …», quién ganó, «El podio cambió»), «Elegir premios» (la cinta, «Usar Campeón, Subcampeón y
  Tercer lugar», crear uno), «Entregar premios» / «Revisar premios» (marcar jugadores, antes → ahora, avisar a los
  ganadores) y «Cerrar premios», en el torneo del boliche, la ronda o el torneo de golf, la noche y el torneo de raqueta
  («Se lleva: …» de cada categoría) y el encuentro de natación. La demo trae la Copa de Ejemplo y la ronda cerrada de
  «Golf de Ejemplo», cada una con un premio dado y otro por dar (`movil/src/platform/demoPrizes.ts`).
  - 🌐 Los premios del relámpago y de los playoffs de equipos (sus pantallas siguen en la web).
- ⏳ Reportes en PDF y Excel (compartir con expo-sharing).

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
  (expo-image-picker), vibración (expo-haptics) y escanear un QR (expo-camera, `movil/src/app/escanear.tsx`).
