# Formatos, funciones y operación en cancha para BowlingX multideporte (boliche + pádel, pickleball, tenis, baloncesto, fútbol de campo y sala, golf, natación)

## 0. Resumen

1. **No hacer 7 apps.** Conviene hacer una sola "base de competencias" que sirva a todos los deportes. Cada deporte agrega un módulo de reglas: funciones puras de TypeScript con pruebas, como `src/lib/bowling.ts`. Los formatos se reutilizan entre deportes: tabla con jornadas, round robin, grupos + eliminatoria, cuadro de eliminación, americano/mexicano, escalera, leaderboard de golf y competencia de natación.
2. **Orden recomendado:**
   - Fase 0: base común.
   - Fase 1: raqueta (pádel + pickleball + tenis, que comparten motor de puntos, juegos y sets).
   - Fase 2: deportes de equipo (fútbol campo/sala + baloncesto).
   - Fase 3: golf.
   - Fase 4: natación.

   El boliche no cambia y sigue siendo el deporte por defecto.
3. **"Modo cancha" común para todos:**
   - Pantalla completa con 2 botones gigantes.
   - Deshacer siempre visible.
   - Pantalla siempre encendida.
   - Primero se guarda en el teléfono y después se sincroniza.
   - Un solo anotador por partido.
   - **No escribir cada punto en Firestore.** Se escribe el resumen del partido cada ~15–30 s y al cerrar cada juego o set. Hoy ya se usan 42–52K lecturas al día de 50K.
4. **Qué no construir:**
   - Reserva de canchas y pagos (solo una marca manual de "pagó").
   - Ratings globales tipo DUPR.
   - Handicap oficial de golf (lo lleva FEDOGOLF con la USGA).
   - Software federado de natación (tipo Meet Manager).
   - Doble eliminación y formato suizo en la primera versión.
5. **Marca:** el deporte se elige por liga, al crearla, y no se cambia después. La app cambia sus palabras, colores e ícono según el deporte de la liga. Recomiendo una marca paraguas neutra antes de lanzar la Fase 1 y dejar "BowlingX" como nombre de la sección de boliche. Hay que mantener el mismo dominio y el mismo `id` del manifest para que las PWA ya instaladas no se rompan.
6. **Arranque rápido de una liga nueva:** asistente de 3 pasos (deporte → plantilla → nombre, cancha y día), con plantillas ya configuradas por deporte (lista en la sección 6).

## 1. Formatos de competencia (piezas comunes)

| Formato | Reglas clave para implementar | Deportes | Fase |
|---|---|---|---|
| **Tabla de liga / jornadas** | Puntos por ganar/empatar/perder configurables. Fútbol 3-1-0. Baloncesto FIBA: ganar 2, perder 1, forfeit 0 [FIBA]. Raqueta: partidos ganados, luego diferencia de sets, luego de juegos. Pickleball: juegos ganados, luego diferencia de puntos. Lista de desempates configurable: puntos → enfrentamiento directo (si empatan 2) o diferencia de goles general (si empatan 3 o más) → victorias → goles a favor → partido de desempate [myTMAN, StatsUltra]. | Todos menos golf y natación | 0 |
| **Generador round robin** | Método del círculo (tablas de Berger): un equipo queda fijo y los demás rotan. Salen N(N−1)/2 partidos. Si el número es impar, alguien descansa cada jornada. Hace falta una segunda pasada para balancear local/visita. Opción ida y vuelta [dev.to, flmsystem]. Después se asigna cada partido a fecha, cancha y hora, avisando si hay choques (mismo equipo en dos sitios, misma cancha a la misma hora). | Todos los de partido | 0 |
| **Grupos + eliminatoria** | Reparto en grupos "en zigzag" según nivel. Pasan los N primeros de cada grupo y se cruzan (1A vs 2B). | Todos los de partido | 0 |
| **Eliminación simple** | El cuadro se lleva a la siguiente potencia de 2. Los "byes" van a los mejores cabezas de serie. Orden de siembra estándar. Partido por el 3.º lugar opcional [Bye (sports), squid]. | Todos | 0 |
| **Doble eliminación** | Los byes solo en el cuadro de ganadores. La final puede repetirse (reset) si gana el que viene del cuadro de perdedores: es el error más común al organizar [BracketDraw, squid]. | Pickleball, pádel | Más adelante |
| **Americano** | Siempre dobles, pero el puntaje es individual. Calendario fijo donde todos juegan con todos y contra todos. Partidos a 24 o 32 puntos (24 dura unos 9–10 min). Gana quien más puntos suma [padelfast, 12kpadel]. | Pádel, pickleball | 1 |
| **Mexicano** | Primera ronda al azar. Después, según la tabla: 1+4 vs 2+3 en la cancha 1, 5+8 vs 6+7 en la cancha 2, etc. Si son impares, descansa el último y recibe el promedio de puntos de la ronda. Mínimo 8 jugadores y 2 canchas; 1 cancha por cada 4 jugadores; de 6 a 8 rondas [padelmake, liveforpadel]. | Pádel, pickleball | 1 |
| **Rey de la cancha** | Los ganadores suben a la cancha del "rey" y los perdedores bajan [playpickleball, pickleplus]. | Pickleball | Más adelante |
| **Escalera (ladder)** | Se puede retar hasta 3 puestos más arriba (a veces más). El que gana toma el puesto del otro y el perdedor baja uno. Plazo para aceptar y jugar; si no se juega, W.O. Se usa la posición del rival al momento de jugar [tenniscreative, globaltennisnetwork]. | Tenis, pádel | 1 (más tarde dentro de la fase) |
| **Liga por cajas (box league)** | Cajas de 4 a 6 jugadores o parejas por nivel, todos contra todos durante un mes, fechas acordadas por ellos mismos. Suben 2 y bajan 2. Hay que jugar al menos 2 partidos para subir o para salvarse [paddlepals, padellevels]. Encaja muy bien con clubes de pádel. | Pádel, tenis, pickleball | 1 |
| **Leaderboard stroke play (golf)** | Golpes hoyo por hoyo; total bruto y neto; columna de hoyos jugados; categorías neto por nivel; Stableford [golfleaguetracker, SCGA]. | Golf | 3 |
| **Competencia de natación** | Pruebas (distancia + estilo + categoría de edad y sexo), inscripciones con tiempo de siembra, series y carriles. Mejores tiempos en el centro: orden de carriles 4,5,3,6,2,7,1,8 en piscina de 8 (3,4,2,5,1,6 en piscina de 6). Serie más rápida al final. "Siembra circular" solo cuando hay eliminatorias y final [swimstandards, gomotion]. | Natación | 4 |
| **Forfeit / W.O.** | Resultado configurable por deporte: fútbol 3-0; baloncesto FIBA 20-0 con 0 puntos de tabla. Si un equipo se queda sin jugadores ("default"), se mantiene el marcador si el ganador iba arriba, si no queda 2-0, y el perdedor recibe 1 punto. Raqueta: W.O. sin juegos o 6-0 6-0 (configurable). | Todos | 0 |
| **Reprogramación** | Estado del partido: programado → aplazado → reprogramado. Guarda el historial y tiene fecha límite. | Todos | 0 |
| **Árbitros y anotadores** | Se reutiliza el rol `scorer` que ya existe, ahora por partido. Árbitro como campo simple. | Todos | 0 (evaluar árbitros, más adelante) |
| **Sedes, canchas y horarios** | Sede con varias canchas y franjas de hora; el generador asigna. **No es un sistema de reservas.** | Todos | 0 |
| **Asistencia / RSVP** | Se extiende el RSVP de las prácticas a los partidos: Voy / No voy / Tal vez, en un toque. Alerta de mínimo de jugadores (fútbol 11: 7; futsal: 3). Spond lo da gratis; TeamSnap lo cobra y los usuarios se quejan [teamlinkt, spond]. | Todos | 0–2 |
| **Plantillas de equipo con suplentes** | Plantilla del equipo, "refuerzos" invitados con límite y convocatoria por partido. | Fútbol, baloncesto | 2 |
| **Pagos** | Solo anotar "pagó sí/no". No se diseña ahora. | — | Fuera de alcance |

## 2. Reglas por deporte y anotación en vivo

- **Pádel** (motor de raqueta):
  - Puntos 15-30-40. Tres formas de resolver el empate a 40, que se eligen antes del partido: ventaja, punto de oro, o el "star point" de FIP (vigente desde el 1-ene-2026: hasta 2 ventajas y luego punto decisivo).
  - Tie-break a 7 en 6-6. Tercer set opcional como súper tie-break a 10 [ukpadelguide, padelusa].
  - En vivo: tocar la mitad de la pareja que ganó el punto. El cambio de lado se muestra solo.
- **Tenis** (mismo motor):
  - Con ventaja o sin ventaja; sets a 6 o sets cortos a 4 (Fast4: tie-break en 3-3); tercer set como tie-break a 10 [Fast4, rallyhub].
  - Individual y dobles.
- **Pickleball:**
  - Juegos a 11 (o 15/21), ganando por 2.
  - Conteo tradicional (solo puntúa quien saca), con número de sacador "0-0-2", o conteo por rally (provisional desde 2025: el punto que gana el juego solo vale sacando) [selkirk, playpickleball].
  - Se configura por liga. Los datos DUPR van como texto manual (no hay API gratis).
- **Baloncesto:**
  - 4×10 FIBA, o 2 mitades con reloj corrido (común en ligas amateur).
  - Faltas de equipo por cuarto: desde la 5.ª hay tiros libres. 5 faltas personales = expulsión. Tiempos muertos.
  - Variante 3x3: a 21 o 10 min, canastas de 1 y 2 puntos [FIBA 3x3].
  - En vivo, desde la mesa: +1 / +2 / +3 por equipo; tocar el número del jugador es opcional. Contador de faltas con aviso de "bonus".
- **Fútbol campo / sala:**
  - En vivo: "Gol local / Gol visita" y luego, opcional, quién anotó. Tarjetas y cambios. Reloj con pausa.
  - Sala: faltas acumuladas por mitad; desde la 6.ª, tiro libre directo sin barrera. 1 tiempo muerto por mitad. Cambios ilimitados [futsal.com, judgemate].
  - Roja = suspensión automática el partido siguiente. Amarillas acumuladas: reporte.
- **Golf:**
  - Tarjeta hoyo por hoyo. **Un anotador por grupo desde un solo teléfono**, con leaderboard en vivo para espectadores (patrón de 18Birdies, Golf GameBook y Buddies on the Green) [18birdies, buddiesonthegreen].
  - El admin crea el campo una vez: par e índice de dificultad por hoyo, y rating/slope por salida.
  - El jugador escribe su Handicap Index (FEDOGOLF lo lleva con la USGA [fedogolf]).
  - La app calcula el handicap de campo = Index × Slope/113 + (Rating − Par), y el de juego = ese número × el porcentaje de la competencia [USGA].
  - Resultados bruto, neto y Stableford.
  - Sin conexión es obligatorio: los campos tienen hoyos sin señal (Cleek promociona justo eso).
- **Natación:**
  - Finales por tiempo en la primera versión.
  - Captura por serie y carril, igual que la entrada por hoja de cronometrista de Meet Maestro [swimtopia].
  - Hasta 3 cronómetros por carril: cuenta el tiempo del medio [pacswim].
  - DQ, DNS, NT. Puntos por puesto: 6-4-3-2-1 individual y 8-4-2 en relevos, configurable [gomotion].
  - Marcas personales.
  - Más adelante: eliminatorias + final con siembra circular, relevos con parciales, récords.

## 3. Qué copiar y qué evitar de otros productos

| Producto | Copiar | Evitar |
|---|---|---|
| Playtomic | Nivel de 0 a 7 en pasos de 0.25, tipo Elo, con "fiabilidad" que baja con pocos partidos. Partidos abiertos filtrados por nivel ("faltan 1–2") [playtomic help]. Ya es multideporte (pádel, pickleball, tenis). | Reservas de cancha y cobros: es el negocio de los clubes. |
| DUPR | **El rival confirma el resultado.** Los partidos verificados de liga pesan más [dupr.com]. Sirve como alternativa a la aprobación del admin en raqueta, con auto-aceptación a las 24–48 h si nadie reclama. | Un rating global. |
| PickleballBrackets | Formatos round robin, eliminación simple, doble eliminación y grupos + eliminatoria. Panel del director con **cola de próximos partidos por cancha**. Los jugadores ven su hora de partido en vivo [pickleballbrackets.org]. | Integraciones con ratings externos. |
| GameChanger | Anotar sin conexión y sincronizar después. "Configurar el partido" antes de empezar (mitades o cuartos, tiempos muertos). Paso de "finalizar partido" [help.gc.com]. | Estadísticas profundas y transmisión de video. |
| Referi / Padel Watch / ScoreBot | Un toque en el equipo que ganó el punto; mantener presionado = deshacer [referi.io, padel watch]. | Controles Bluetooth: una PWA no recibe de forma fiable las teclas de volumen del control remoto. |
| Spond / TeamSnap / SportsEngine | Confirmar asistencia en un toque y gratis; calendario; tabla de posiciones [spond, getapp]. | Registro e inscripción pesados, pagos, poner el RSVP detrás de un pago (el error de TeamSnap). |
| Challonge | Vista de cuadro y fase de grupos → fase final [challonge kb]. | Formato suizo (ninguno de estos deportes lo necesita). |
| GolfLeagueTracker / 18Birdies | Neto, categorías, leaderboard "hoyos jugados". | GPS, seguimiento de golpes, juegos de apuestas (skins, wolf) en la primera versión. |
| Meet Maestro / Meet Manager | Publicar la hoja de series como paso explícito. Captura por carril. Ajuste de tiempos. | Competir con Hy-Tek en competencias federadas. Apuntar solo a encuentros de club y amistosos. |

## 4. En cancha y sin conexión (realidad de República Dominicana)

- **Señal:** hay 4G casi en todo el país y 5G fuerte en Santo Domingo, Santiago y Punta Cana. Pero hay huecos en zonas rurales y de montaña; Claro tiene mejor cobertura rural que Altice [elnuevodiario, roafly]. Gimnasios con techo de zinc, piscinas y campos de golf tienen mala señal. Por eso sin conexión es obligatorio, no un extra.
- **Diseño "primero en el teléfono":**
  - El partido es un **registro de eventos** (punto, gol, falta…) guardado en el teléfono. El marcador se calcula a partir de ese registro, así que deshacer es simplemente quitar el último evento, y queda la auditoría.
  - La cola sin conexión de Firestore está pensada para cortes cortos. Las transacciones fallan sin conexión y gana la última escritura [firebase docs].
  - Por eso: **un solo anotador activo por partido**, con un "tomar el control" que expira. No usar transacciones en el flujo en vivo. Escribir un documento de estado compacto con pausas (debounce).
- **Costo en Spark:** un partido de pádel tiene unos 150 puntos. Si cada punto se escribe y 10 personas lo siguen, son unas 1.500 lecturas. Recomendaciones:
  - Actualizar a los espectadores por juego o set, o cada 15–30 s.
  - Un documento-resumen por evento o jornada para la pantalla "En vivo", en lugar de un listener por partido.
- **Pantalla:**
  - Wake Lock para que no se apague.
  - Botones en la mitad de abajo para usar con una mano.
  - Modo "sol" de alto contraste para canchas al aire libre.
  - Vibración solo en Android (Safari de iOS no la soporta).
  - Horizontal y vertical.
  - Reutilizar lo que ya existe: `GestureGuards` y `noZoom`.
- **Compartir:** WhatsApp es el canal principal. Tarjeta de resultado o tabla compartible (ya existe `share.ts`) y enlaces directos a cada partido.
- **Demanda local:**
  - Pádel en auge en Santo Domingo, Santiago y Punta Cana, con ligas amateur [hoy.com.do].
  - Pickleball: existe FedoPickleball, RD quedó 4.ª en el Mundial 2025, y hubo un torneo local en **formato Americano** ("Americano Rosa", 50 atletas) [elnuevodiario, robertocavada].
  - Baloncesto: torneos superiores de barrio y club, como el de Abadina [colimdo].
  - Hay una plataforma local de pádel, Vola (do.vola.plus). No pude verla: su página respondió error 503.

## 5. Marca y navegación

- Agregar el campo `league.sport`, que no cambia después de crear la liga (las ligas actuales quedan como `'boliche'`). Además, un registro de deportes con:
  - vocabulario (pinos/goles/golpes, juego/partido/hoyo/prueba, jornada/ronda),
  - color e ícono,
  - lista de formatos permitidos,
  - módulo de reglas con una interfaz común: `initState`, `applyEvent`, `isFinished`, `summary`, `standingsDelta`.
- Inicio: las ligas de todos los deportes van mezcladas, con una insignia de deporte. Si la persona está en más de un deporte, aparecen chips para filtrar. El selector de deporte solo sale en "Crear".
- Estadísticas globales separadas por deporte: un promedio de boliche no se mezcla con goles.
- Marca: recomiendo un nombre paraguas neutro (por decidir; conviene conservar la "X" por continuidad) y "BowlingX" como sección de boliche. Es decisión del dueño.

## 6. Arranque rápido: plantillas

El asistente trae estas plantillas ya configuradas. Después se reutilizan los códigos de invitación y el QR que ya existen, y se pueden importar miembros de otra liga del mismo dueño.

- **Pádel:** Americano de la noche; Mexicano; Liga de parejas por cajas mensual; Torneo por categorías (grupos + cuadro).
- **Pickleball:** Round robin social; Liga de dobles; Torneo grupos + eliminatoria; Rey de la cancha (más adelante).
- **Tenis:** Escalera; Liga por cajas; Torneo con cuadro.
- **Baloncesto:** Liga 5x5 FIBA 4×10; Liga de barrio con 2 mitades y reloj corrido; Torneo 3x3 a 21.
- **Fútbol:** Liga de campo ida y vuelta; Liga de sala; Torneo relámpago (grupos + final).
- **Golf:** Torneo stroke play neto a 1 ronda; Liga mensual Stableford.
- **Natación:** Encuentro de club con finales por tiempo; Control de marcas.

## 7. Qué entra en cada fase

**Fase 0 – Base (nada visible para el usuario, el boliche intacto)**
- Imprescindible:
  - `sport` en la liga.
  - Entidad genérica de partido: lados, participantes, estado, resultado y registro de eventos.
  - Generador round robin.
  - Tabla con desempates configurables.
  - Eliminación simple y grupos + eliminatoria.
  - W.O. y reprogramación.
  - Sedes, canchas y horarios.
  - Estructura del "modo cancha": sin conexión, deshacer, un solo anotador, pantalla encendida.
  - Asistente de plantillas.
  - Pruebas de regresión de boliche y reglas de Firestore para las colecciones nuevas.
- Más adelante: nada.

**Fase 1 – Raqueta (pádel, pickleball, tenis)**
- Imprescindible:
  - Motor de puntos, juegos y sets con sus variantes (ventaja, punto de oro, star point, Fast4, conteo tradicional o por rally).
  - Anotador en vivo.
  - Americano y Mexicano.
  - Liga round robin por parejas.
  - Torneo grupos + eliminatoria.
  - Confirmación del rival.
  - Box league.
- Más adelante: nivel tipo Elo, escalera, doble eliminación, rey de la cancha, partidos abiertos.

**Fase 2 – Equipos (fútbol campo/sala, baloncesto)**
- Imprescindible:
  - Plantillas de equipo con refuerzos.
  - Calendario ida/vuelta con canchas y horas.
  - Anotación en vivo: goles/puntos, faltas de equipo, tarjetas.
  - Suspensiones automáticas.
  - Goleadores y anotadores.
  - Asistencia con alerta de mínimo.
  - Puntos de tabla 3-1-0 / 2-1-0.
- Más adelante: estadísticas por jugador completas (box score), asistencias de gol, playoffs al mejor de 3, asignación y evaluación de árbitros, alineaciones.

**Fase 3 – Golf**
- Imprescindible:
  - Campo con par, índice de dificultad por hoyo, rating y slope.
  - Handicap Index escrito a mano.
  - Resultados bruto, neto y Stableford.
  - Anotador por grupo.
  - Leaderboard en vivo sin conexión.
- Más adelante: skins, best ball, scramble, cuadros de match play, categorías automáticas.

**Fase 4 – Natación**
- Imprescindible:
  - Pruebas e inscripciones con tiempo de siembra.
  - Series y carriles automáticos.
  - Captura por serie y carril.
  - DQ/DNS.
  - Puestos, puntos y marcas personales.
- Más adelante: eliminatorias + final con siembra circular, relevos con parciales, tiempo del medio con 3 cronómetros, récords.

**Fuera de alcance en todas las fases:** reservas, pagos, ratings globales, handicap oficial de golf, formatos federados de natación (Hy-Tek).

## Fuentes
- Pádel americano/mexicano: https://www.padelfast.com/formats/americano · https://www.padelmake.com/padel-classic-mexicano · https://www.liveforpadel.com/blog/padel-mexicano-rules
- Puntaje de pádel y star point: https://ukpadelguide.co.uk/blog/padel-scoring/ · https://padelusa.org/wp-content/uploads/2025/06/USPA-Competition-Structure-June-2025.pdf
- Niveles de Playtomic: https://playerhelp.playtomic.com/hc/en-gb/articles/43310980754193-How-the-Playtomic-level-system-works
- DUPR: https://www.dupr.com/how-it-works
- Conteo por rally en pickleball: https://www.selkirk.com/blogs/pickleball-education/2025-usa-pickleball-rules-rally-scoring
- Rotaciones en pickleball: https://www.playpickleball.com/types-of-pickleball-rec-play/
- PickleballBrackets: https://pickleballbrackets.org/
- Round robin: https://dev.to/viktor777/building-a-round-robin-tournament-generator-the-math-behind-nn-12-33jm · https://www.flmsystem.com/us/blog/round-robin-scheduling
- Byes y doble eliminación: https://en.wikipedia.org/wiki/Bye_(sports) · https://github.com/hnai-787/squid · https://bracketdraw.com/double-elimination
- Challonge: https://kb.challonge.com/en/article/learn-about-challonge-competition-formats-1f8j1cf/
- Desempates: https://mytman.io/en/placement-rules/ · https://statsultra.com/goal-difference-vs-head-to-head-tiebreaker/
- Escalera y box league: https://tenniscreative.com/tennis-ladder/ · https://paddlepals.co.uk/games/box-league-padel
- Fast4: https://en.wikipedia.org/wiki/Fast4_Tennis
- Futsal: https://futsal.com/rules-of-the-game-summary/ · https://www.judgemate.com/en/guides/how-futsal-scoring-works
- Baloncesto FIBA y 3x3: https://en.wikipedia.org/wiki/Bonus_(basketball) · https://fiba3x3.com/en/rules.html
- Handicap de golf (WHS): https://www.usga.org/content/usga/home-page/handicapping/world-handicap-system/topics/course-handicap.html · https://fedogolf.org.do/
- Apps de golf: https://www.golfleaguetracker.com/glthome/about/features · https://buddiesonthegreen.com/features/golf-scoring-app · https://18birdies.com/
- Natación: https://www.swimtopia.com/products/meet-maestro/ · https://community.swimstandards.com/topic/243/seeding-lane-assignments-swim-offs-order-of-heats · https://www.pacswim.org/userfiles/cms/documents/1320/more-than-you-ever-wanted-to-know-about-timing-at-swim-meets.pdf · https://www.gomotionapp.com/team/rechsgst/page/parent-info/dual-meet-scoring
- GameChanger sin conexión: https://help.gc.com/hc/en-us/articles/360030864752-Offline-Scorekeeping
- Anotadores de raqueta: https://www.referi.io/en/padel/ · https://apps.apple.com/us/app/padel-watch-padel-scorekeeper/id6443518532
- Spond: https://www.spond.com/news-and-blog/spond-best-free-club-app-your-sports/
- Alternativas a TeamSnap: https://teamlinkt.com/blog/best-teamsnap-alternatives
- Firestore sin conexión: https://firebase.google.com/docs/firestore/manage-data/enable-offline
- Cobertura móvil en RD: https://elnuevodiario.com.do/el-estado-de-la-cobertura-movil-en-la-republica-dominicana/ · https://www.roafly.com/blog/which-mobile-network-is-best-in-the-dominican-republic
- Pádel en RD: https://hoy.com.do/deportes/el-padel-un-deporte-en-auge-en-la-republica-dominicana-2_1046967.html
- Pickleball en RD: https://elnuevodiario.com.do/rd-logra-historico-cuarto-lugar-en-el-mundial-de-pickleball-2025-2/ · https://robertocavada.com/deportes/2025/08/26/celebran-en-santo-domingo-el-primer-torneo-femenino-de-pickleball/
- Baloncesto en RD: https://colimdo.org/noticias/abadina-da-a-conocer-calendario-juego-torneo-basket-superior-distrital/

Las reglas de forfeit y default de FIBA (20-0) salen de conocimiento propio: hay que verificarlas contra el reglamento oficial.

Archivos del repo leídos para el contexto (sin modificar ninguno): C:\Users\rgrullon\code\bowlinx\src\lib\types.ts y C:\Users\rgrullon\code\bowlinx\src\lib\live.ts.