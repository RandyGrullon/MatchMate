# Insignias: diseño final

> **Estado:** implementado (pasos 1 a 10 de §7; ver «Estado de la implementación» al final de §7). Base: worktree
> `matchmate-insignias` en `9005c6e`.
> Este documento junta en una sola decisión tres propuestas (catálogo por deporte, insignias por tiempo y
> comportamiento, sistema visual y creador) y el mapa de datos. Donde chocaban, se eligió una y se dice por qué
> (§8). Los identificadores (tablas, columnas, keys, funciones, archivos) van en inglés. Los textos que ve el
> jugador van en español dominicano, con tú, y entre comillas «».
>
> Referencias a código: `archivo:línea` del worktree. Alias de migraciones (todas en `supabase/migrations/`):
> base `20260926000100`, schema `…0200`, trig `…0300`, rls `…0400`, rpc `…0500`, part `20260927000100`,
> golf `…0400`, nat `…0500`, padel `…0600`, raq `…0700`, bb `…0800`, fut `…0900`, cons `…1100`, liga `…1300`,
> insc `…1400`, cuenta `…1500`, social `20260928000200`, recl `20260929000100`.

**En números**

| | |
|---|---|
| Insignias automáticas (keys) | **100** |
| Definiciones contando niveles | **197** (una key que existe en varios deportes cuenta una vez) |
| Instanciadas por deporte | boliche 54 · pádel 49 · pickleball 49 · tenis 48 · baloncesto 48 · fútbol 51 · sala 51 · golf 45 · natación 33 · de cuenta, sin deporte 29 · **total 457** |
| Creador de insignias de liga | 11 plantillas, 7 formas, 52 íconos, 3 cupos |
| Niveles | bronce, plata, oro, platino, diamante (más «único») |

**Contenido**

1. [Principios](#1-principios)
2. [Catálogo](#2-catálogo)
3. [Motor de otorgamiento](#3-motor-de-otorgamiento)
4. [Sistema visual](#4-sistema-visual)
5. [Creador de insignias](#5-creador-de-insignias)
6. [Pantallas](#6-pantallas)
7. [Plan de implementación](#7-plan-de-implementación)
8. [Decisiones tomadas al unir las propuestas y preguntas abiertas](#8-decisiones-tomadas-al-unir-las-propuestas-y-preguntas-abiertas)

---

## 1. Principios

### 1.1 Que valgan

- **Nada por nada.** Ninguna insignia se gana por abrir la app, seguir gente, recibir likes, marcar «voy» ni por
  datos que uno mismo escribe: nivel de pádel (`attrs.level`), NTRP, DUPR, índice de golf (`hcp_index`) o tiempo
  de inscripción en natación (`seed_cs`).
- **Umbrales con rareza objetivo** (§1.7.9). Cada nivel tiene su rareza estimada y el servidor mide la real cada
  noche. Si una insignia sale mucho más común de lo previsto, se suben sus umbrales en el catálogo (§3.8).
- **Campo mínimo para todo título** (§1.7.8). Un título ganado en una liga de dos amigos no vale nada.
- **Solo lo que el servidor puede probar** con datos guardados. Lo que no se guarda está en Futuro (§2.14).
- **Cada insignia guarda su evidencia** (ids y valores) en `context`. Siempre se puede explicar por qué se dio,
  aunque la tabla de la liga (que se calcula en el teléfono) diga otra cosa.
- **Los metales significan algo.** Solo los hitos de carrera largos llegan a platino o diamante; las marcas
  llegan como mucho a oro o platino.

### 1.2 Que sean justas para todos los niveles

- **76 de las 100 keys no piden quedar por encima de los demás** en una tabla, un evento o un mes: constancia,
  asistencia, hitos, marcas, mejora contra ti mismo, juego limpio y comunidad. De las 24 que sí comparan, 8
  comparan **mejora**, rachas contra tu propia línea base, solo entre nuevos o dentro de tu misma categoría o caja
  (`most_improved_month`, `streak_month`, `progress_of_year`, `season_most_improved`, `season_rookie`,
  `category_title`, `box_top_month`, `bowling_category_win`).
- **Línea base personal** (§1.7.6). «Por encima de ti», «Racha del mes» y todo lo de progreso se miden contra tu
  propio historial, no contra el de otros. Un jugador de 120 de promedio puede ganarle «Mayor progreso» a uno de
  210.
- **Novatos.** Las insignias de progreso piden una base de al menos 12 juegos (o su equivalente), así nadie
  «mejora» después de tres juegos malos. Para los nuevos están `debut`, `strong_start` y `season_rookie`. La
  asistencia se cuenta desde tu primera fecha, así que entrar a mitad de temporada no castiga.
- **Hándicap.** Los títulos siguen la regla de la liga (scratch o con hándicap). El progreso siempre es scratch
  contra tu propia base, donde el hándicap no importa.
- **Deportes con menos fechas.** Un día de golf o natación vale 2 días para constancia y kilometraje (§1.7.3).
- **Las mejoras muestran la ganancia, nunca el punto de partida:** «+9 pinos», no «de 118 a 127».
- **Privada por defecto.** Los niveles de principiante que dicen un número bajo (por ejemplo «Rompe barreras 125»)
  solo los ve el jugador hasta que decida mostrarlos.

### 1.3 Que no se puedan farmear

Resumen de las defensas. El detalle está en §1.7.

| Riesgo (mapa de datos §12) | Defensa |
|---|---|
| Cualquiera crea una liga de boliche, inventa jugadores y escribe juegos `'sin-foto'` que cuentan al instante (rpc:1028) | Solo cuentan **ligas reales** (§1.7.4): al menos 4 cuentas establecidas (7+ días, no bloqueadas) con actividad válida en una ventana de 3 meses. Una liga que crece después no revive su historial (sin retroactivo). Las marcas altas piden juegos **verificados** (foto o importados). |
| El admin se escribe sus propios juegos o se confirma sus partidos | Regla **juez y parte** (§1.7.5): foto, importado o revisión de otra cuenta en boliche; confirmación del otro lado o de un tercero en partidos. |
| El admin se aprueba al instante su propio reclamo sobre un jugador con historial inflado (recl:350-351) | Para las insignias de cuenta de ese jugador solo cuenta el historial verificado (§1.6). |
| Americano, mexicano y round robin quedan finales sin que el rival confirme (padel:245-248) | Solo dan participación. Nunca victorias, rachas ni títulos, salvo `racket_night_champion`, que pide 6+ cuentas distintas y resultados escritos por 2+ cuentas. |
| Tarjetas de golf firmadas por el mismo jugador, índice escrito a mano | G2 pide un **marcador** de otra cuenta en el mismo grupo y un campo con datos sanos; lo neto usa el **índice topado** (§1.7.6). |
| Estadísticas de equipo (`score.lines`) escritas por quien anota | Solo cuentan partidos confirmados por el otro equipo o por un tercero (T2), y las líneas incoherentes se descartan. |
| Likes a uno mismo o desde cuentas alternas (social:675) | No hay insignias por likes recibidos ni por seguidores. `good_vibes` cuenta personas distintas a las que **tú** felicitaste, solo si eres miembro de su liga y a lo largo de varios meses. |
| Retos de escalera ganados por W.O. de plazo vencido; orden cambiado con `set_ladder` | No cuentan para nada que no sea asistencia. |
| Corregir, anular o borrar resultados después de ganar | Las insignias por resultado quedan **provisionales 7 días** y se retiran solas si la evidencia cambia. Las de periodo se evalúan después de una gracia y quedan firmes. |
| Volumen puro (100 juegos en un día) | Topes diarios y por rival en todos los contadores (§1.7.7). |
| El teléfono calcula tablas y movimientos de cajas | El servidor es la fuente de las insignias: recalcula con los mismos helpers puros y guarda la evidencia. |
| Hazañas legendarias escritas a mano (300, 7-10, hoyo en uno) | **Aval** de un dueño o admin que no esté en el juego (§1.7.5). |

Riesgo que queda: cuentas alternas pueden llenar los mínimos de «cuentas distintas». El aval, los topes por rival
y los mínimos de campo limitan el daño; cerrarlo del todo pediría verificar identidad (teléfono), que queda fuera.

### 1.4 Nunca vergonzosas

- **Prohibidas:** último lugar, peor puntaje, más derrotas, racha perdedora, más goles recibidos, más faltas o
  tarjetas, más W.O., tiempo más lento, «cero», inactividad, edad. Solo existe lo positivo (por ejemplo «Valla
  invicta», nunca «Colador»).
- **Nunca el último del grupo con medalla:** los tamaños mínimos de podio (§1.7.8) evitan «tercero de tres».
- **Nunca se nombra al rival** en una descripción («Batacazo» dice que le ganaste a alguien con mejor récord, no a
  quién).
- **Sin avisos de pérdida:** no hay push por romper una racha ni por faltar. La pantalla dice «¡Arranca una nueva
  racha!».
- **Retirar es silencioso:** una insignia retirada desaparece sin push ni mensaje público. El jugador ve una línea
  discreta solo si él la había visto.
- **Ocultar:** el dueño de una insignia puede ocultarla de su perfil en cualquier momento.
- **Privada por defecto** para niveles bajos que muestran un número (§1.2).
- **Bloqueadas y progreso** solo los ve el dueño de la cuenta (§6.1).

### 1.5 Menores (`leagues.has_minors`)

- Los menores nunca tienen cuenta (schema:123) ni se pueden reclamar (recl:391-393). Sus insignias van a su
  jugador (`player_id`) y **solo las ven los miembros de esa liga**: nunca en `/u/`, en el feed social, en
  tarjetas para compartir ni en push. Se reutiliza `private.social_league_ok` (social:97) para excluirlas.
- **Títulos apagados por defecto:** al crear una liga con menores, `leagues.badges_auto = 'sin_titulos'`. Quedan
  debut, hitos, marcas, asistencia, progreso personal y juego limpio; se apagan podios, figuras, goleadores y
  todo lo que es ganarle a otros. El dueño puede encenderlos.
- **Liga real para menores:** en vez de 4 cuentas de jugadores, al menos 2 cuentas de staff (owner o admin) y 6
  jugadores activos en la ventana.
- **Nunca se compara a un menor fuera de su liga.** No entran en la rareza (que se mide sobre cuentas).
- En `league_builder`, una liga con menores sale como «liga juvenil privada», sin nombre.
- El creador de insignias funciona igual, pero sus insignias nunca salen de la liga.

### 1.6 Jugadores sin cuenta, reclamos y fusiones

La regla: **las insignias van al jugador y siguen a la cuenta cuando lo reclama o se junta.**

- **Ámbito `liga`** (títulos, marcas de un juego o partido, insignias del mes y de temporada): se guardan en el
  jugador (`player_id`, `league_id`). Funcionan igual con o sin cuenta. El perfil de la cuenta las muestra porque
  `players.user_id` apunta a ella.
- **Ámbito `cuenta`** (hitos de carrera, constancia, multideporte): suman todos los jugadores de la cuenta en ese
  deporte, en todas sus ligas, y se guardan en `user_id`. **Un jugador sin cuenta las gana igual, pero solo con lo
  de su liga**, guardadas en su jugador (copia «de respaldo» con `player_id`).
- **Al reclamar o vincular** (reclamo aprobado, reclamo automático de `ensure_player` (recl:498-541), o
  `link_account_to_player` (rpc:625)): el motor recalcula las insignias de cuenta con el historial nuevo. Cada
  copia de respaldo del jugador pasa a la cuenta (`player_id = null`, `user_id` = la cuenta, `league_id = null`),
  o se borra si la cuenta ya tenía la misma key, deporte, nivel y periodo. Se conserva el `awarded_at` más viejo.
  No hay push por niveles que ya tenía; los niveles nuevos que salgan de juntar historiales se avisan normal.
- **Reclamos aprobados al instante porque quien reclama es owner o admin** (recl:350-351): para las insignias de
  cuenta, de ese jugador solo cuenta el historial verificado (boliche B2, partidos R2/T2 con el otro lado
  confirmando por cuenta, golf G2, natación W1). Las de liga ya se ganaron con sus propias reglas y se quedan.
- **`merge_players(from, into)`** (recl:177-263): mueve todas las filas de `badge_awards`, `badge_progress` y
  `league_badge_awards` de `from` a `into`. Si choca con la clave única, se queda la más vieja (y la firme gana a la
  provisional) y la otra se borra. **Sin esto, el guardia del catálogo (recl:250-261) hace fallar todas las
  aprobaciones de reclamos** (§3.7).
- **Salir de la liga, desvincular (`unlink_account`, rpc:672) o borrar la cuenta:** las de liga se quedan en el
  jugador (que sigue existiendo sin cuenta); las de cuenta se quedan en la cuenta, o se borran con ella.
- **Exportar datos:** `export_my_data` encuentra las tablas nuevas solo, porque tienen `user_id` o `player_id`
  (cuenta:54-106).

### 1.7 Reglas comunes (el catálogo se refiere a ellas)

#### 1.7.1 Relojes y claves de periodo

- **Fecha local** de una actividad, en `leagues.tz` (hoy todas `America/Santo_Domingo`, UTC−4 sin horario de
  verano): boliche, golf y natación usan `events.date`; los partidos usan
  `coalesce(scheduled_at, proposed_at, created_at)` (social:179).
- Las insignias de **cuenta** que suman varias ligas cortan sus meses y años en `America/Santo_Domingo`.

| Periodo | Límites | `period_key` | Se evalúa |
|---|---|---|---|
| Siempre (carrera) | ninguno | `-` (una fila por nivel) | con cada resultado o cada noche |
| Evento | un evento, partido, juego, tarjeta o prueba | `e:<event_id>`, `e:<event_id>:<catId>`, `m:<match_id>`, `g:<entry_id>:<i>`, `c:<card_id>`, `r:<swim_entry_id>`, `gt:<golf_tournament_id>` | al quedar contado o al cerrar el evento |
| Mes | día 1 00:00 a último día 23:59 local | `2026-10` | día 3 a las 00:05 |
| Mes de cajas | cierre de un mes de liga por cajas | `b:<event_id>:<n>` | en el cierre (§3.3) |
| Temporada | una fila de `league_seasons` (§3.2) | `s:<season_id>` (con categoría: `s:<season_id>:<catId>`) | al cerrar la temporada |
| Año | 1 de enero a 31 de diciembre | `2026` | 7 de enero a las 00:05 |
| Aniversario | cada año desde el alta | `-` (el nivel es el número de años) | cada noche |
| Liga (organización) | vida de la liga | `l:<league_id>` | cada noche |

- **Una liga `kind='torneo'`** (torneo suelto) es una sola «temporada»: sus fechas son las del torneo y su título
  es `season_podium` («Título del torneo»). En esas ligas no se dan `event_podium` ni insignias del mes o del año.

#### 1.7.2 Actividad válida, oficial y social

**Actividad válida** es lo que cuenta como «jugó ese día». Solo en ligas reales (§1.7.4).

| Deporte | Actividad válida | Oficial (títulos, asistencia, rachas) | Social o práctica (solo actividad, debut, constancia, kilometraje) |
|---|---|---|---|
| Boliche | Una `entry` con al menos un juego B1 | Eventos `type='torneo'` | `'practica'` |
| Pádel, tenis, pickleball | Estar en un lado (`match_players`, o la pareja por `team_players`) de un partido R1, o de un W.O. a favor de tu lado. Una noche de americano o mexicano con al menos un partido final da 1 día. | Partidos de eventos `liga`, `torneo`, `cajas` y `escalera`, y partidos sueltos de la liga, con `require_confirm=true` | `americano`, `mexicano`, `noche`/`jornada` y todo partido con `require_confirm=false` |
| Baloncesto, fútbol, sala | Aparecer (alineación en `match_players`, `played=1` en `score.lines` de fútbol y sala, o una línea en baloncesto) en un partido T1. **Respaldo por plantilla:** si el partido no tiene ningún dato de alineación, cuentan los de la plantilla con `team_players.created_at` ≤ fecha del partido, **solo** para días activos, debut y kilometraje; nunca para asistencia, rachas ni estadísticas. | Todos los partidos de la liga | — |
| Golf | Una tarjeta G1 | Rondas `cerrada` con 3+ tarjetas | Rondas con menos de 3 tarjetas |
| Natación | Un resultado `ok`, `dq` o `dnf` (no `dns`) en un encuentro con `finalized_at` | Encuentros `encuentro` y `torneo` | `control`: cuenta para marcas personales y progreso, no para medallas ni puntos |

#### 1.7.3 Días activos, días ponderados y meses activos

- **Día activo:** un (jugador, fecha local) con al menos una actividad válida. Para insignias de cuenta: un
  (cuenta, fecha local), sin importar cuántas ligas.
- **Día ponderado:** un día de golf (ronda) o de natación (encuentro) vale 2, porque son salidas de medio día y hay
  menos. Máximo **4 días ponderados por semana ISO** por cuenta.
- **Mes activo:** al menos 2 días ponderados en el mes (una ronda de golf o un encuentro de natación bastan).

#### 1.7.4 Cuentas establecidas, ligas reales y ligas con peso

- **Cuenta establecida (CE):** `profiles.created_at` al menos 7 días antes del fin del periodo evaluado y
  `blocked_at` nulo. Las cuentas migradas de BowlingX (`firebase_uid` no nulo) cuentan como establecidas desde su
  primer juego importado.
- **Liga real (LR)** para un (liga, mes): al menos **4 CE** con actividad válida en esa liga en ese mes o en los
  dos anteriores. Para insignias de cuenta, la cuenta evaluada no cuenta entre esas 4. En una liga
  `kind='torneo'`, se cuenta dentro del torneo. Ligas con menores: §1.5. **Sin retroactivo:** un mes que no
  calificó no se reabre si la liga crece después.
- **Liga con peso para el mes:** LR, al menos 6 jugadores activos y al menos 3 CE activas en el mes.
- **Liga con peso para temporada o torneo:** al menos 6 competidores que califican (jugadores o equipos) y al
  menos 4 CE; o al menos 12 competidores cuyos resultados escribieron 2 o más cuentas distintas (`proposed_by`,
  `confirmed_by`, `recorded_by`, `reviewed_by`).
- **Liga con peso para el año:** al menos 8 jugadores activos y 4 CE en el año.
- **`leagues.badges_auto`** (nuevo): `'todas'` (por defecto), `'sin_titulos'` (por defecto con menores) o
  `'ninguna'`. Con `'sin_titulos'` se apagan las 24 keys que comparan con otros (§1.2; en el catálogo llevan
  `title: true`). Con `'ninguna'`, la liga no da insignias de liga; su actividad sigue contando para las de cuenta si
  es liga real.

#### 1.7.5 Validación por deporte, juez y parte, y aval

| Deporte | Contado | Validado | Extra |
|---|---|---|---|
| Boliche | **B1:** `entries.scores[g]` y `photos[g]` no nulos (stats.ts:55-60) y pasa juez y parte | **B2:** B1 y la marca es un uuid de foto o `'importado'`. `'sin-foto'` no. | **B3 (con cuadros):** existe `entries.frames[g]`, `validRolls(rolls)` pasa y `scoreGame(rolls).total === scores[g]` (bowling.ts:67, 127). La base nunca lo revisa (rpc:1022-1031), así que lo revisa el motor. **BM (con máscaras):** B3 y `masks` en las bolas que importan. |
| Pádel, tenis, pickleball | **R1:** `private.match_final(status, proposed_at)` (part:184), estado distinto de `walkover` y `void`, y el jugador en un lado (`playerSide`, results.ts:142) | **R2:** R1 y una de estas: (a) `confirmed_by` es una cuenta del otro lado (`private.match_side_of`, part:192); (b) `proposed_side` nulo (lo anotó admin, anotador u oficial) y `proposed_by` no es cuenta de su lado; (c) quedó final a las 48 h, `disputed_at` nulo y el otro lado tiene al menos una cuenta; (d) hubo reclamo y lo resolvió un owner o admin que no está en ningún lado. En formatos con `require_confirm=false` solo vale (b), o que quien lo propuso sea del otro lado. | — |
| Baloncesto, fútbol, sala | **T1:** final, no `void`, no W.O., sin `score.ending` (sin forfait) | **T2:** T1 y lo anotó un admin, anotador u oficial (`match_officials`) que no está en la plantilla del jugador, o lo confirmó (o quedó a las 48 h sin reclamo) un capitán o delegado con cuenta del otro equipo | **TS (con estadísticas):** T2, `score.lines` no vacío (no «solo resultado»), la línea del jugador existe (fútbol y sala con `played=1`) y es coherente (baloncesto: `pts = ones + 2·twos + 3·threes`; si no, la línea se descarta). |
| Golf | **G1:** tarjeta `firmada`, `dq=false`, ronda `cerrada`, todos los hoyos de la vuelta con `strokes` o `picked_up` | **G2:** G1, más (a) un **marcador**: otra tarjeta G1 del mismo `event_id` y `group_no` de otra cuenta, y (b) **campo sano** en la copia de la ronda: pares 3–5, par total 68–74 (34–37 en 9 hoyos), tee con rating 55–80 y slope 55–155 (para 9 hoyos, la mitad del rating) | — |
| Natación | **W1:** `status='ok'`, `time_cs > 0`, `swim_meets.finalized_at` puesto y `recorded_by` no es la cuenta del nadador | **W2:** W1 y el grupo (sexo de la prueba + grupo de edad, como `placeResults`) tiene al menos N nadadores W1 | Nunca se usa `seed_cs` (el nadador lo escribe, nat:797-800). |

- **Aparición en equipos:** una línea en `score.lines` o una fila en `match_players`. Nunca la plantilla actual
  (social:119-126), salvo el respaldo de §1.7.2.
- **Juez y parte (boliche):** si la cuenta del jugador es owner, admin o `is_scorer` de esa liga cuando se evalúa,
  sus juegos solo son B1 si la marca es una foto o `'importado'`, o si vienen de una `submission` en estado
  `aprobado` con `reviewed_by` distinto de `created_by` y de la cuenta del jugador (se empareja por jugador, fecha
  del evento y puntaje). En los partidos ya lo cubren R2 y T2.
- **Aval (hazañas legendarias):** `bowling_perfect_game`, `bowling_seven_ten`, `golf_hole_in_one`, `golf_par_round`
  y el albatros de `golf_eagle`. La insignia queda `en_revision` y solo la ve el jugador («En revisión: tu liga la
  está confirmando»). La aprueba un owner o admin de la liga que **no** sea el jugador, ni esté en su lado o
  equipo, ni en su grupo de golf, ni en el mismo evento como competidor. Si no hay nadie así, o pasan 14 días, va a
  la cola del superadmin. Un rechazo no deja rastro público.

#### 1.7.6 Líneas base personales

| Deporte | Línea base | Por qué |
|---|---|---|
| Boliche | Piso de la media de los **últimos 30 juegos B1** antes de la fecha *d* (cuenta: todos sus jugadores de boliche; sin cuenta: en su liga). Pide **al menos 12 juegos**. | Nunca `entries.average` ni `average_override`: el admin los edita a mano. |
| Raqueta | **% de juegos ganados** = juegos ganados / jugados, de `score.totals.games` o, si falta, del texto con `stateFromScore(matchRules(sport, m.rules), score.text)` (racket/index.ts:171). Los formatos de puntos no entran. | Mucho menos ruido que victorias y derrotas. |
| Golf | **Diferencial MatchMate (no oficial):** bruto ajustado = Σ min(strokes, par + 3), un hoyo levantado vale par + 3; diferencial = (bruto ajustado − rating) × 113 / slope, con el tee de la copia en `golf_rounds.tees`. Las tarjetas de 9 hoyos usan `front9`/`back9` y solo se comparan con otras de 9. | `hcp_index` lo escribe el jugador, no tiene historial y no es oficial. |
| Golf, neto | **Índice topado** = min(`hcp_index`, índice derivado). Derivado = media de los mejores 8 de los últimos 20 diferenciales de rondas G2 de 18 hoyos. Con menos de 5 diferenciales, se usa `hcp_index` topado en 36. Con él se recalcula el hándicap de juego. | Evita escribir un índice alto para farmear lo neto. |
| Natación | **Marca personal (MP):** mejor `time_cs` W1 del mismo `bestKey` (distancia + estilo + piscina; 25 m y 50 m siempre aparte, bests.ts:1-4, events.ts). La primera vez en una prueba es «primera marca», no MP. | Solo el admin o el anotador escriben tiempos. |

#### 1.7.7 Mínimos, topes y empates

| Mínimo | Boliche | Raqueta | Equipos (por jugador) | Golf | Natación |
|---|---|---|---|---|---|
| Título del mes | 9 juegos oficiales en 3+ fechas (si la liga tuvo 1–2 fechas oficiales: todas y 6+ juegos) | 4 partidos R2 | 2 partidos con `lines` (equipo: 3 partidos) | 2 tarjetas G2 | — |
| Progreso del mes | 9 juegos (oficiales y práctica); base de 12+ | 4 partidos en el mes y 6 en los 90 días anteriores | — | 2 tarjetas; base de 4+ | 2 pruebas con marca anterior |
| Título de temporada | 50 % de las fechas oficiales y 12+ juegos | 50 % de sus partidos programados | 30 % de los partidos del equipo | 50 % de las rondas | 50 % de los encuentros |

- **Topes en todos los contadores:** boliche 10 juegos por día; raqueta 4 partidos por día y 3 victorias contra el
  mismo rival (`entrantKey`, results.ts:30) por mes; equipos 2 victorias contra el mismo equipo por mes; golf 1
  tarjeta por día.
- **Empates:** después de los desempates de cada insignia, los empatados **comparten** la insignia. Si siguen
  empatados **más de 3**, nadie se la lleva ese periodo y la pantalla de la liga dice «Empate múltiple: este mes no
  hubo {figura}».

#### 1.7.8 Tamaño del podio

| Competidores que califican | Se da |
|---|---|
| Menos de 4 | Nada de podio (solo participación y asistencia) |
| 4–5 | Solo oro |
| 6–9 | Oro y plata |
| 10 o más | Oro, plata y bronce |

- En cuadros de eliminación se cuentan inscritos (parejas o equipos). Si no hay partido por el 3.er lugar, los dos
  perdedores de semifinal comparten el bronce.
- **Natación** usa su propia regla por grupo, para que la medalla nunca vaya al último: oro con 3+ nadadores W1,
  plata con 4+, bronce con 5+.

#### 1.7.9 Rareza

Rareza = porcentaje de jugadores activos del deporte (al menos un día activo en los últimos 365 días) que tienen
ese nivel.

| Código | Rareza | Porcentaje |
|---|---|---|
| C | Común | 40 % o más |
| PC | Poco común | 15–40 % |
| R | Rara | 5–15 % |
| E | Épica | 1–5 % |
| L | Legendaria | menos de 1 % |

La columna Rareza del catálogo es la **estimada** al año, por nivel (bronce · plata · oro…). La real la calcula el
servidor cada noche (§3.8).

#### 1.7.10 Niveles, repetibles y privadas

- `level`: `0` único · `1` bronce · `2` plata · `3` oro · `4` platino · `5` diamante. En los podios, oro = 1.º,
  plata = 2.º y bronce = 3.º.
- Cada nivel es una fila propia, así queda cuándo se ganó cada uno. El perfil muestra el más alto.
- **Repetible (×N):** se gana una vez por evento o periodo. Sale una sola vez en el perfil con el contador ×N y la
  lista de veces.
- **Privada por defecto:** solo la ve su dueño hasta que toque «Mostrar en mi perfil».

---

## 2. Catálogo

### 2.0 Cómo leer las tablas

- **key:** identificador en inglés. Si la insignia existe en varios deportes, es una sola key y el deporte va en la
  columna `sport` de la fila otorgada (por ejemplo `racket_wins` para pádel, tenis y pickleball).
- **Niveles y umbrales:** B bronce · P plata · O oro · Pt platino · D diamante. «único» = un solo nivel. «×N» =
  repetible (§1.7.10).
- **Periodo · ámbito:** cuándo se cuenta y a quién va: `cuenta` (suma todas las ligas de la cuenta; sin cuenta,
  cae al jugador en su liga, §1.6) o `liga` (va al jugador en esa liga).
- **Criterio exacto y fuente:** usa los niveles de validación (B1, R2, T2, G2, W1…), la liga real (LR), las líneas
  base y los mínimos de §1.7. Siempre sobre ligas reales, salvo que diga otra cosa.
- **Rareza:** estimada por nivel, en el orden de los niveles (§1.7.9).
- **Def.:** cuántas definiciones aporta (niveles). La suma da el total del catálogo.
- **Forma por defecto** (§4.2): hitos, bienvenida y mejora personal `hex`; podios y temporada `shield`; constancia,
  rachas y asistencia `circle`; marcas `star`; mensual `medal`; anual `medal_laurel`; comunidad y juego limpio
  `square`.

| Grupo | Keys | Definiciones |
|---|---|---|
| 2.1 General y multideporte | 9 | 23 |
| 2.2 Boliche | 12 | 26 |
| 2.3 Raqueta (pádel, tenis, pickleball) | 10 | 23 |
| 2.4 Equipos (baloncesto, fútbol, sala) | 4 | 12 |
| 2.5 Baloncesto | 8 | 14 |
| 2.6 Fútbol y sala | 7 | 15 |
| 2.7 Golf | 10 | 19 |
| 2.8 Natación | 7 | 18 |
| 2.9 Mensual | 12 | 14 |
| 2.10 Anual | 4 | 6 |
| 2.11 Temporada | 10 | 14 |
| 2.12 Comunidad | 7 | 13 |
| **Total** | **100** | **197** |

### 2.1 General y multideporte

| key | Nombre | Descripción | Deporte | Categoría | Niveles y umbrales | Periodo · ámbito | Criterio exacto y fuente | Rareza | Def. |
|---|---|---|---|---|---|---|---|---|---|
| `debut` | Debut. Por deporte: «Primera línea» (boliche), «Debut en la cancha» (raqueta y equipos), «Primera ronda» (golf), «Primera prueba» (natación) | «¡Arrancaste! Tu primer {juego/partido} de {deporte} ya cuenta.» (golf: «Tu primera ronda de golf…»; natación: «Tu primera prueba de natación…») | todos | Bienvenida | único | siempre · cuenta | Primera actividad válida (§1.7.2) del deporte en una LR. Fuente: `entries`; `matches` + `match_players`/`score.lines`; `golf_cards`; `swim_entries`. | C | 1 |
| `month_streak` | Constancia | «{n} meses seguidos jugando. ¡Tú no paras!» | todos (suma deportes) | Constancia | B 3 · P 6 · O 12 · Pt 24 · D 36 meses seguidos | siempre · cuenta | Meses activos consecutivos (§1.7.3) en LR, cualquier deporte, meses de `America/Santo_Domingo`. **Comodín:** un mes inactivo en cualquier ventana de 12 meses no rompe la racha (no suma). Se evalúa el día 3 por el mes anterior. Fuente: días activos (§3.2). | C · PC · R · E · L | 5 |
| `mileage` | Kilometraje | «{n} días jugando en MatchMate.» | todos | Lealtad | B 50 · P 150 · O 300 días ponderados | siempre · cuenta | Suma de días ponderados en LR (golf y natación valen 2; máximo 4 por semana ISO). Solo días de hace 48 h o más. | PC · R · E | 3 |
| `strong_start` | Arranque con todo | «Jugaste {n} días en tu primer mes. ¡Llegaste pa' quedarte!» | todos | Bienvenida | único | primeros 30 días · cuenta | Al menos 4 días activos en LR dentro de los 30 días desde el **primer día activo** de la cuenta (no desde el registro). Se revisa cada noche hasta el día 31. | C | 1 |
| `multisport` | Multideporte. Niveles: Doble vía, Todoterreno, Pentatleta | «Juegas {n} deportes en MatchMate: {boliche, pádel y fútbol}.» | todos | Multideporte | B 2 · P 3 · O 5 deportes | siempre · cuenta | Deportes distintos con al menos 3 días activos en LR cada uno (un día suelto no cuenta). Fútbol y sala cuentan aparte. Fuente: días activos + `leagues.sport`. | PC · R · E | 3 |
| `three_worlds` | Tres mundos | «Juegas de todo: series, raqueta y equipo.» | familias | Multideporte | único | siempre · cuenta | Al menos 3 días activos en LR en un deporte de cada familia: `series`, `racket` y `team` (schema:16-33). | E | 1 |
| `anniversary` | Aniversario | «{n} año(s) jugando en MatchMate. ¡Gracias por estar!» | todos | Lealtad | B 1 · P 2 · O 5 años | aniversario · cuenta | En cada aniversario de la fecha de inicio: `profiles.created_at`, o la fecha del primer juego `'importado'` si es anterior (cuentas de BowlingX). Solo si la cuenta tuvo al menos 12 días ponderados en LR en los 365 días anteriores. Los años 3 y 4 no dan nivel nuevo. | C · PC · R | 3 |
| `climbing` | Subiendo | Boliche: «Tu promedio subió {n} pinos desde que empezaste. ¡Se nota el trabajo!» Golf: «Bajaste {n} golpes desde tus primeras rondas.» | boliche, golf | Mejora | Boliche B +5 · P +10 · O +20 pinos. Golf B 2 · P 4 · O 6 golpes | siempre · cuenta | **Boliche:** media de los últimos 18 juegos B1 menos media de los primeros 18 del deporte (todas las ligas LR de la cuenta; `'importado'` cuenta). Pide 36+ juegos. **Golf:** diferencial medio (§1.7.6) de las primeras 5 tarjetas G2 de 18 hoyos menos el de las últimas 5. Pide 10+ tarjetas. Un nivel ganado se queda. | PC · R · E | 3 |
| `event_podium` | Podio. Niveles: Primer lugar (oro), Segundo lugar (plata), Tercer lugar (bronce) | «Ganaste {evento}{, categoría B}.» / «Quedaste en segundo lugar en {evento}.» / «Te subiste al podio de {evento}.» | boliche, pádel, tenis, pickleball, baloncesto, fútbol, sala, golf | Resultados | O 1.º · P 2.º · B 3.º, ×N | evento · liga | Solo en ligas `kind='liga'` (en `kind='torneo'` va `season_podium`). Tamaño del podio por §1.7.8. Empates comparten.<br>**Boliche:** `events.type='torneo'`, al menos 6 jugadores con juegos B1. Se evalúa a `events.date` + 3 días. Posición por `eventPosition` / `individualValue` (stats.ts:80-105) con la regla del evento (`individual_rank_by`, hándicap solo en torneos, stats.ts:33-37). Si la liga tiene `require_photo`, todos los juegos del jugador deben ser B2.<br>**Raqueta:** evento `torneo`, por categoría (`config.categories[]`). Oro: ganador de `<catId>-R<rounds>-1` por `winnerId` (tourney.ts:187-201). Plata: el que perdió esa final. Bronce: ganador de `<catId>-P3` o, si no hay, los dos perdedores de semifinal. La final debe ser R2; una final ganada por W.O. solo cuenta si la semifinal fue R2.<br>**Equipos:** torneo relámpago (partidos con `bracket_key` del mismo `event_id`, `src/pages/sports/team/tournament.ts`). Oro y plata de la final `R<n>-1` (los penales de `score.pens` desempatan), bronce de `P3`. La final debe ser T2. Va a quien apareció en al menos un partido del torneo (si el torneo no tiene ningún dato de alineación: la plantilla con `team_players.created_at` ≤ fecha).<br>**Golf:** ronda `cerrada` (periodo `e:<event_id>`) o torneo de varias rondas (`golf_tournaments` con todas las rondas cerradas, periodo `gt:<id>`), con 24 h de gracia. `golfLeaderboard` (golf/leaderboard.ts:91) con el formato y la base de la competición y desempate por countback, sobre tarjetas G1 de al menos 4 cuentas distintas. Las competiciones netas usan el índice topado. | O R · P R · B PC | 3 |

### 2.2 Boliche

Solo boliche. Las marcas de un juego se atan al juego (`g:<entry_id>:<i>`), así que corregirlo en 7 días las
retira (§3.4).

| key | Nombre | Descripción | Deporte | Categoría | Niveles y umbrales | Periodo · ámbito | Criterio exacto y fuente | Rareza | Def. |
|---|---|---|---|---|---|---|---|---|---|
| `bowling_games` | Líneas jugadas | «Ya llevas {n} juegos que cuentan.» | boliche | Hitos | B 30 · P 100 · O 300 · Pt 1000 | siempre · cuenta | Juegos B1, máximo 10 por día. Fuente: `entries.scores` y `photos` (`playerStats`, stats.ts:153). | C · PC · R · E | 4 |
| `bowling_breakthrough` | Rompe barreras | «Pasaste los {n} por primera vez. ¡Eso va pa'rriba!» | boliche | Mejora | B 125 · P 150 · O 175 | siempre · cuenta | Primer juego B1 igual o mayor al umbral. **Privada por defecto.** Si al llegar ya tiene un nivel mayor (historial importado), los menores se dan juntos, sin aviso. | C · C · PC | 3 |
| `bowling_club` | Club de los 200. Niveles: Club 200, Club 225, Club 250, Club 275 | «Entraste al club de los {n}.» | boliche | Marcas | B 200 · P 225 · O 250 · Pt 275 | siempre · cuenta | Mejor juego. 200 y 225 con B1; 250 y 275 con **B2**. | PC · R · E · L | 4 |
| `bowling_perfect_game` | Juego perfecto | «300. Doce strikes seguidos. Leyenda.» | boliche | Marcas | único, ×N | evento · liga | `scores[g] = 300`, B2 y **aval**. Si el juego tiene cuadros, deben ser 12 strikes (B3). | L | 1 |
| `bowling_series` | Serie de tres | «Sumaste {n} en tres juegos seguidos.» | boliche | Marcas | B 500 · P 575 · O 650 | siempre · cuenta | Mejor suma de 3 juegos B1 consecutivos de la misma `entry` (la lógica de `highSeries`, stats.ts:171-173). Oro con los tres juegos B2. | PC · R · E | 3 |
| `bowling_over_average` | Por encima de ti | «Tiraste {n} pinos por encima de tu promedio.» | boliche | Mejora | B +25 · P +40 · O +60 | siempre · cuenta | Juego B1 menos la línea base de boliche (§1.7.6) con los juegos anteriores a la fecha del evento (12+). Nunca `entries.average` ni `average_override`. Oro con B2. Justa para todo nivel. | C · PC · R | 3 |
| `bowling_strike_streak` | Racha de strikes. Niveles: Pavo, Six-pack, Nueve seguidos | «Metiste {n} strikes seguidos en un juego.» | boliche | Marcas | B 3 · P 6 · O 9 | siempre · cuenta | Racha más larga de X dentro de un juego B3, con las bolas extra del cuadro 10 (`frameStats` / `marksOf`, bowling.ts:209-235). Oro con B2. Solo juegos anotados bola por bola. | PC · E · L | 3 |
| `bowling_clean_game` | Cero abiertos | «Un juego entero sin dejar cuadro abierto.» | boliche | Marcas | único, ×N | evento · liga | Juego B3 con `frameStats(rolls).opens === 0`. | R | 1 |
| `bowling_split` | Split convertido | «Te paraste frente a un split y lo tumbaste.» | boliche | Marcas | único, ×N | evento · liga | Juego BM: la bola 1 tumbó el pino 1 (bit 0) y quedaron 2+ pinos que no forman un solo grupo conectado en el grafo de pinos vecinos; la bola 2 los tumba todos. Helper nuevo `isSplit(mask)` con la tabla de vecinos (junto a `standingMask`, bowling.ts:247). El 7-10 va aparte. | R | 1 |
| `bowling_seven_ten` | El 7-10 | «Convertiste el 7-10. Casi nadie lo logra.» | boliche | Marcas | único, ×N | evento · liga | Juego BM y B2: tras la bola 1 quedan exactamente los pinos 7 y 10 (bits 6 y 9) y la bola 2 tumba los dos. **Aval** (las máscaras se escriben a mano). | L | 1 |
| `bowling_category_win` | Mejor de tu categoría | «Nadie te ganó en la categoría {A/B/C/D} de {evento}.» | boliche | Resultados | único, ×N | evento · liga | Torneo (`type='torneo'`) con 4+ jugadores con juegos B1 en la categoría. Categoría = `category(entries.average, category_cuts)` (stats.ts:242-246; por defecto 200/175/160). **Anti-sandbagging:** si `entries.average` está más de 15 pinos por debajo de la línea base, se usa la línea base. Gana el mejor `individualValue` de la categoría. Premia también a la D. Se evalúa con `event_podium`. | PC | 1 |
| `bowling_team_win` | Título por equipos | «Tu equipo ganó {evento}.» | boliche | Resultados | único, ×N | evento · liga | Primero en `teamLines` (stats.ts:119-141) según `team_rank_by`. 3+ equipos, cada uno con 2+ jugadores con juegos B1. Va a los miembros con al menos 1 juego B1. Se evalúa con `event_podium`. | R | 1 |

### 2.3 Raqueta: pádel, tenis y pickleball

Una key por insignia; el deporte va en `sport`. Los sets se leen con
`stateFromScore(matchRules(sport, m.rules), score.text)` (racket/index.ts:171; logic/results.ts:41): el texto va
en orden lado 1 – lado 2; en `7-6(5)`, el número entre paréntesis son los puntos del tie-break del que perdió; se
ignora el set cortado por `ret.` y todo marcador de W.O.

| key | Nombre | Descripción | Deporte | Categoría | Niveles y umbrales | Periodo · ámbito | Criterio exacto y fuente | Rareza | Def. |
|---|---|---|---|---|---|---|---|---|---|
| `racket_matches` | Partidos jugados | «Ya llevas {n} partidos de {deporte}.» | pádel, tenis, pickleball | Hitos | B 10 · P 30 · O 75 · Pt 150 | siempre · cuenta | Partidos R1 (gane, pierda o empate), americano incluido. Sin W.O. ni anulados. Máximo 4 por día. | C · PC · R · E | 4 |
| `racket_wins` | Victorias | «Ya llevas {n} victorias.» | pádel, tenis, pickleball | Hitos | B 5 · P 15 · O 40 · Pt 100 | siempre · cuenta | Victorias R2 en formatos de sets (no americano ni mexicano, no W.O.). Máximo 3 contra el mismo rival por mes. Fuente: `winner_side`, `playerSide`. | C · PC · R · E | 4 |
| `racket_win_streak` | Racha ganadora | «Ganaste {n} partidos seguidos.» | pádel, tenis, pickleball | Marcas | B 3 · P 5 · O 8 | siempre · cuenta | Victorias R2 seguidas, ordenadas por `matchTime` (results.ts:149). Una derrota R1 la corta; W.O. y anulados se saltan (ni suman ni cortan). La racha necesita 2+ rivales distintos (oro: 3+). | PC · R · E | 3 |
| `racket_bagel` | Rosco. Pádel y tenis: «Set en blanco». Pickleball: «Juego en blanco» | «Ganaste un set 6-0.» / «Ganaste un juego sin que te anotaran.» | pádel, tenis, pickleball | Marcas | único, ×N | evento · liga | Partido R2. Pádel y tenis: un set completo ganado `gamesPerSet`–0. Pickleball: un juego ganado a `gameTo` (11, 15 o 21) con el rival en 0. | PC (pickleball R) | 1 |
| `racket_comeback` | Remontada | «Perdiste el primer set y le diste la vuelta.» (pickleball: «el primer juego») | pádel, tenis, pickleball | Marcas | único, ×N | evento · liga | Partido R2 a 3+ sets o juegos: tu lado perdió el primero y ganó el partido, jugado hasta el final (sin retiro). | PC | 1 |
| `racket_tiebreaks` | Sangre fría (pickleball: Al filo) | «Ganaste {n} tie-breaks.» / «Ganaste {n} juegos que se fueron más allá de {11}.» | pádel, tenis, pickleball | Marcas | B 3 · P 10 · O 25 | siempre · cuenta | Partidos R2. Pádel y tenis: sets ganados 7-6, más el súper tie-break decisivo ganado cuando `rules.match.finalSet='tiebreak'`. Pickleball: juegos ganados con más puntos que `gameTo` (se fue a ganar por 2). | PC · R · E | 3 |
| `racket_upset` | Batacazo | «Le ganaste a alguien con mucho mejor récord que tú.» | pádel, tenis, pickleball | Marcas | único, ×N | evento · liga | Victoria R2 en la que, antes del partido, el rival tenía 10+ partidos R2 y un % de victorias al menos 25 puntos mayor que el tuyo (en dobles, la media de los dos; `playerRecord`, results.ts:198). Tú con 5+ partidos. No nombra al rival. | R | 1 |
| `racket_partners` | Buena química | «Has ganado con {n} compañeros distintos.» | pádel; tenis y pickleball en dobles | Hitos | B 3 · P 8 | siempre · cuenta | Compañeros distintos (la misma cuenta cuenta una vez) con al menos una victoria R2 juntos, americano incluido si es R2. Solo dobles (`rules.doubles`; el pádel siempre). | PC · R | 2 |
| `racket_ladder_climber` | Escalando | «Ganaste {n} retos subiendo en la escalera.» | pádel, tenis, pickleball | Hitos | B 1 · P 5 · O 15 | siempre · cuenta | `ladder_challenges` (raq:379-405) con `status='played'`, `winner = challenger` = tú y `match_id` R2. No cuentan los W.O. por plazo (raq:629-641) ni los cambios con `set_ladder` (raq:724). | PC · R · E | 3 |
| `racket_night_champion` | Figura de la noche | «Nadie sumó más puntos que tú en la noche de {americano/mexicano/round robin}.» | pádel, pickleball | Resultados | único, ×N | evento · liga | Evento `americano` o `mexicano` **cerrado**: todos sus partidos finales, la fecha pasó y 24+ h desde el último resultado (barrido nocturno). 8+ jugadores, **6+ cuentas distintas**, y resultados escritos por 2+ cuentas (porque no se confirman, padel:245-248). Primero en `nightTable` (night.ts:302), con la compensación por descanso. Empates comparten. | R | 1 |

### 2.4 Equipos: compartidas por baloncesto, fútbol y sala

| key | Nombre | Descripción | Deporte | Categoría | Niveles y umbrales | Periodo · ámbito | Criterio exacto y fuente | Rareza | Def. |
|---|---|---|---|---|---|---|---|---|---|
| `team_matches` | Partidos jugados | «Ya llevas {n} partidos.» | baloncesto, fútbol, sala | Hitos | B 5 · P 15 · O 40 · Pt 100 | siempre · cuenta | Apariciones (§1.7.5) en partidos T1. Nunca la plantilla. | C · PC · R · E | 4 |
| `team_wins` | Victorias | «Tu equipo ha ganado {n} partidos contigo en cancha.» | baloncesto, fútbol, sala | Hitos | B 5 · P 15 · O 40 · Pt 100 | siempre · cuenta | Victorias T2 en las que apareciste. Máximo 2 contra el mismo equipo por mes. | C · PC · R · E | 4 |
| `team_unbeaten` | Invicto (baloncesto: Racha ganadora) | «{n} partidos seguidos sin perder contigo en cancha.» | baloncesto, fútbol, sala | Marcas | B 3 · P 5 · O 8 | siempre · cuenta | Partidos T2 seguidos, entre tus apariciones, ganados o empatados (un empate que se decide por penales es empate). En baloncesto, solo victorias. Los partidos sin datos de alineación o en los que no apareciste ni suman ni cortan. | PC · R · E | 3 |
| `team_comeback` | Remontada | «Tu equipo iba perdiendo y lo ganó.» | baloncesto, fútbol, sala | Marcas | único, ×N | evento · liga | Victoria T2 en la que apareciste. **Fútbol y sala:** `score.periods[0]` muestra a tu lado abajo al medio tiempo, o al reproducir los eventos `g` y `o` de `score.tl` tu lado estuvo abajo por 2+. **Baloncesto** (no 3x3): sumando `score.periods` de la primera mitad reglamentaria (`config.periods / 2`), tu lado iba abajo por 8+. | R | 1 |

### 2.5 Baloncesto

Fuente: `score.lines` = `<player>:<side>:<pts>:<1s>:<2s>:<3s>:<fouls>`, leído con `decodeLines`
(`src/pages/sports/basketball/adapter.ts:22-27`). Solo líneas TS (§1.7.5). Umbrales para 5x5; los de 3x3 van entre
paréntesis.

| key | Nombre | Descripción | Deporte | Categoría | Niveles y umbrales | Periodo · ámbito | Criterio exacto y fuente | Rareza | Def. |
|---|---|---|---|---|---|---|---|---|---|
| `basketball_first_basket` | Tu primera canasta | «¡Anotaste tu primer punto!» | baloncesto | Bienvenida | único | siempre · cuenta | Primera línea TS con `pts ≥ 1`. | C | 1 |
| `basketball_points_game` | Noche de anotación | «Metiste {n} puntos en un partido.» | baloncesto | Marcas | B 10 · P 20 · O 30 (3x3: 6 · 10 · 14) | siempre · cuenta | `pts` de una línea TS. | C · PC · R | 3 |
| `basketball_points` | Punto a punto | «Ya llevas {n} puntos.» | baloncesto | Hitos | B 50 · P 250 · O 1000 | siempre · cuenta | Suma de `pts` de líneas TS (`basketballTotals`, team/stats.ts:27). | C · PC · E | 3 |
| `basketball_threes_game` | Mano caliente | «Metiste {n} triples en un partido.» | baloncesto (5x5) | Marcas | B 3 · P 6 | siempre · cuenta | `threes` de una línea TS. | PC · E | 2 |
| `basketball_threes` | Desde lejos | «Ya llevas {n} triples.» | baloncesto (5x5) | Hitos | B 10 · P 50 | siempre · cuenta | Suma de `threes` de líneas TS. | PC · R | 2 |
| `basketball_triple_threat` | Triple amenaza | «En un mismo partido anotaste de 1, de 2 y de 3, con 15 o más.» | baloncesto (5x5) | Marcas | único, ×N | evento · liga | Una línea TS con `ones ≥ 1`, `twos ≥ 1`, `threes ≥ 1` y `pts ≥ 15`. | PC | 1 |
| `basketball_clean_hands` | Manos limpias | «12 puntos o más sin cometer faltas.» | baloncesto | Juego limpio | único, ×N | evento · liga | Línea TS con `pts ≥ 12` (3x3: 8) y `fouls = 0`, en un partido que registró 4+ faltas en total (prueba de que se anotaban). | PC | 1 |
| `basketball_game_leader` | Líder del partido | «Nadie anotó más que tú en el partido.» | baloncesto | Resultados | único, ×N | evento · liga | El `pts` más alto entre todas las líneas de los dos lados, con 10+ (3x3: 6+), y `lines` sin cortar (menos de 2800 caracteres, adapter.ts:55-76). Empates comparten. | PC | 1 |

### 2.6 Fútbol y sala

Una key por insignia; el deporte (`football` o `futsal`) va en `sport` y cambia los umbrales. Fuente: `score.lines` =
`id:side:played:goals:assists:own_goals:yellows:red:keeper:conceded` y `score.tl` =
`<g|o|y|s|r><side>.<minute>.<player>.<assist>`, leídos con `decodeLines` (`src/pages/sports/football/adapter.ts:23-34`).
Los autogoles nunca cuentan para quien los hizo. La duración sale de `FootballConfig.halfMinutes`
(sports/team/football.ts:35).

| key | Nombre | Descripción | Deporte | Categoría | Niveles y umbrales | Periodo · ámbito | Criterio exacto y fuente | Rareza | Def. |
|---|---|---|---|---|---|---|---|---|---|
| `football_first_goal` | Primer gol | «¡Tu primer gol!» | fútbol, sala | Bienvenida | único | siempre · cuenta | Primera línea TS con `goals ≥ 1`. | PC (sala C) | 1 |
| `football_goals` | Gol a gol | «Ya llevas {n} goles.» | fútbol, sala | Hitos | Fútbol B 5 · P 20 · O 50. Sala B 10 · P 40 · O 100 | siempre · cuenta | Suma de `goals` de líneas TS (`footballTotals`, team/stats.ts:60). | PC · R · E | 3 |
| `football_goals_in_match` | Noche goleadora. Fútbol: Doblete, Hat-trick, Póker, Manita. Sala: Hat-trick, Póker, Manita, Media docena | «¡{Hat-trick}! {n} goles en un partido.» | fútbol, sala | Marcas | Fútbol B 2 · P 3 · O 4 · Pt 5. Sala B 3 · P 4 · O 5 · Pt 6 | siempre · cuenta | Goles de una línea TS. Si hay `tl`, los eventos `g` del jugador deben cuadrar con la línea. | PC · R · E · L | 4 |
| `football_assists` | Pase gol | «Ya llevas {n} asistencias.» | fútbol, sala | Hitos | Fútbol B 5 · P 20. Sala B 10 · P 30 | siempre · cuenta | Suma de `assists` de líneas TS (se quedan cortas cuando el anotador no las pone). | PC · R | 2 |
| `football_clean_sheet` | Valla invicta | «Terminaste {n} partidos sin recibir goles.» | fútbol, sala | Marcas | B 1 · P 5 · O 15 | siempre · cuenta | Línea TS con `keeper=1` y el `score.sides` del rival en 0; ni W.O. ni `score.ending`. Solo si el anotador marcó portero. | PC · R · E (entre porteros) | 3 |
| `football_late_winner` | Gol del triunfo | «Metiste el gol que ganó el partido al final.» | fútbol, sala | Marcas | único, ×N | evento · liga | En `tl`, tu evento `g` es aquel después del cual tu lado se puso arriba y ya no perdió la ventaja; victoria T2 sin penales; minuto ≥ 90 % del tiempo reglamentario (2 × `halfMinutes`) o en prórroga (se leen minutos como `45+2`). Pide reloj (`clock ≠ 'none'`). | E | 1 |
| `football_shootout_win` | Nervios de acero | «Ganaron en penales.» | fútbol, sala | Marcas | único, ×N | evento · liga | Partido T2 con `score.pens` a favor de tu lado y tú con `played=1`. | R | 1 |

### 2.7 Golf

Puntajes con `scoreRound` (golf/scoring.ts), birdies y parecidos con `golfStats` (golf/stats.ts), orden de juego
con `playOrder`. Todo sobre la **copia** del campo en `golf_rounds` (golf:215-285).

| key | Nombre | Descripción | Deporte | Categoría | Niveles y umbrales | Periodo · ámbito | Criterio exacto y fuente | Rareza | Def. |
|---|---|---|---|---|---|---|---|---|---|
| `golf_rounds` | Rondas jugadas | «Ya llevas {n} rondas.» | golf | Hitos | B 5 · P 20 · O 60 | siempre · cuenta | Tarjetas G1: 18 hoyos = 1, 9 hoyos = 0,5. Máximo 1 tarjeta por día. | C · PC · R | 3 |
| `golf_birdies` | Birdies | «Ya llevas {n} birdies.» | golf | Hitos | B 1 · P 10 · O 50 | siempre · cuenta | Hoyos con `strokes = par − 1` en tarjetas G1. El primero (bronce) pide G2. | PC · R · E | 3 |
| `golf_eagle` | Águila (si es albatros: «¡Albatros!») | «Dos bajo par en un hoyo.» / «Tres bajo par en un hoyo.» | golf | Marcas | único, ×N | evento · liga | `strokes ≤ par − 2` y `strokes ≥ 2`, en G2. Si es `par − 3` (albatros) pide **aval**. | E | 1 |
| `golf_hole_in_one` | Hoyo en uno | «¡Hoyo en uno! Esto se celebra.» | golf | Marcas | único, ×N | evento · liga | `strokes = 1`, G2 y **aval**. La evidencia guarda el hoyo y los marcadores. | L | 1 |
| `golf_break_barrier` | Rompiste la barrera | «Hiciste una ronda de {18} por debajo de {n}.» | golf | Marcas | 18 hoyos: B 110 · P 100 · O 90 · Pt 80. 9 hoyos: B 55 · P 50 · O 45 · Pt 40 | siempre · cuenta | Ronda G2 sin `picked_up`, bruto menor que el umbral. 9 hoyos: `nine` = front o back, o campo de 9 con par 34–37. | C · PC · R · E | 4 |
| `golf_par_round` | Ronda en par | «18 hoyos en par o mejor.» | golf | Marcas | único, ×N | evento · liga | G2 de 18 hoyos, bruto ≤ par del tee, sin hoyos levantados, **aval**. | L | 1 |
| `golf_stableford` | Stableford | «Sumaste {n} puntos Stableford netos.» | golf | Marcas | 18 hoyos: B 32 · P 36 · O 40. 9 hoyos: B 16 · P 18 · O 20 | siempre · cuenta | `scoreRound` con `{format:'stableford', basis:'net'}` y el hándicap de juego recalculado con el **índice topado** (§1.7.6). G2. | PC · R · E | 3 |
| `golf_no_disaster` | Ronda sin tropiezos | «18 hoyos sin pasar de doble bogey.» | golf | Constancia | único, ×N | evento · liga | G2 de 18 hoyos, sin hoyos levantados, todos los hoyos en `par + 2` o mejor. | R | 1 |
| `golf_birdie_collection` | Colección de birdies | «Birdie en par 3, par 4 y par 5.» | golf | Marcas | único | siempre · cuenta | En la carrera, al menos un birdie o mejor en un par 3, en un par 4 y en un par 5, todos en tarjetas G1. | R | 1 |
| `golf_course_best` | Récord personal en el campo | «Bajaste tu mejor score en {campo}.» | golf | Mejora | único, ×N | evento · liga | Nuevo bruto más bajo en el mismo `golf_rounds.course_id` y `tee_id` (mismos hoyos), sin hoyos levantados, G1, con 2+ rondas G1 anteriores ahí. | PC | 1 |

### 2.8 Natación

Fuentes: `personalBests` e `improvementPct` (swimming/bests.ts), `placeResults` (swimming/results.ts) y `bestKey`
(swimming/events.ts). 25 m y 50 m siempre aparte.

| key | Nombre | Descripción | Deporte | Categoría | Niveles y umbrales | Periodo · ámbito | Criterio exacto y fuente | Rareza | Def. |
|---|---|---|---|---|---|---|---|---|---|
| `swim_races` | Pruebas nadadas | «Ya llevas {n} pruebas.» | natación | Hitos | B 10 · P 40 · O 100 | siempre · cuenta | Resultados W1. | C · PC · R | 3 |
| `swim_personal_best` | Marca personal | «Bajaste tu marca en {prueba}.» | natación | Mejora | B 1 · P 5 · O 20 marcas | siempre · cuenta | Un tiempo W1 más rápido que tu MP anterior del mismo `bestKey`, con al menos un tiempo W1 anterior (los pasos de la progresión, bests.ts). | C · PC · R | 3 |
| `swim_big_drop` | Bajón de tiempo | «Mejoraste tu marca un {n} % de un golpe.» | natación | Mejora | B 2 % · P 4 % · O 7 % | siempre · cuenta | El `pct` de un paso de la progresión, cuando la MP anterior tiene 21+ días (dos pruebas del mismo encuentro no cuentan). | C · PC · R | 3 |
| `swim_four_strokes` | Los cuatro estilos | «Nadaste libre, espalda, pecho y mariposa en competencia.» | natación | Hitos | único | siempre · cuenta | Al menos un resultado W1 en cada estilo. | PC | 1 |
| `swim_distance` | Fondista | «Completaste {n} m libre en competencia.» | natación | Hitos | B 400 · P 800 · O 1500 m | siempre · cuenta | Un resultado W1 en libre a esa distancia o más. | R · E · L | 3 |
| `swim_medal` | Medalla. Niveles: Oro, Plata, Bronce | «{Oro} en {100 libre}.» | natación | Resultados | O 1.º · P 2.º · B 3.º, ×N | evento · liga | Lugar por `placeResults` entre resultados W1 de tu sexo de prueba y grupo de edad, en encuentros `encuentro` o `torneo` (no `control`). W2 con la regla de natación de §1.7.8 (oro 3+, plata 4+, bronce 5+). Se evalúa al finalizar el encuentro. Empates comparten. | O PC · P PC · B C | 3 |
| `swim_record` | Récord. Niveles: Récord del club (plata), Récord de la liga (oro) | «El tiempo más rápido de {tu club / la liga} en {prueba}.» | natación | Marcas | P club · O liga, ×N | evento · liga | **Una sola vez, al finalizar el encuentro** (los récords no se guardan). Liga: tu W1 es más rápido que todos los W1 anteriores de la liga en el mismo `bestKey` y sexo de la prueba, con 5+ tiempos anteriores de 3+ nadadores. Club: lo mismo dentro de `swim_entries.club_id`, con 3+ tiempos de 2+ nadadores. | P R · O E | 2 |

### 2.9 Mensual

Se evalúan el **día 3 a las 00:05** (hora de la liga) por el mes anterior. Las de liga piden **liga con peso para
el mes** (§1.7.4), `kind='liga'` y, las que comparan con otros, `badges_auto='todas'` (`perfect_attendance_month`,
`personal_best_month` y `monthly_regular` también valen con `'sin_titulos'`). Mínimos y empates en §1.7.7.

| key | Nombre | Descripción | Deporte | Categoría | Niveles y umbrales | Periodo · ámbito | Criterio exacto y fuente | Rareza | Def. |
|---|---|---|---|---|---|---|---|---|---|
| `player_of_month` | Figura del mes | «Fuiste la figura de {liga} en {mes}: {promedio 187 en 12 juegos}.» | boliche, pádel, tenis, pickleball, golf | Resultados | único, ×N | mes · liga | **Boliche:** juegos B1 de eventos `torneo` del mes. Métrica: promedio scratch; si la mayoría de los torneos del mes rankean por hándicap (`individual_rank_by='hcp'` y `hcp_percent > 0`), promedio + hándicap por juego (`calcHandicap(entries.average, hcp_base, hcp_percent)` o `handicap_override`). Desempates: más juegos, juego más alto.<br>**Raqueta:** victorias R2 en formatos oficiales. Desempates: % de victorias, diferencia de sets (`score.sides`), diferencia de juegos.<br>**Golf:** menor diferencial medio en tarjetas G2. Desempate: mejor diferencial suelto. | E | 1 |
| `most_improved_month` | Mayor progreso del mes | «Nadie en {liga} subió tanto como tú en {mes}: +{9} {pinos}.» | boliche, pádel, tenis, pickleball, golf, natación | Mejora | único, ×N | mes · liga | La mayor mejora, si llega al mínimo:<br>**Boliche:** media del mes (oficial y práctica, B1) menos la línea base del día 1. Mínimo +6.<br>**Raqueta:** % de juegos ganados del mes menos el de los 90 días anteriores. Mínimo +8 puntos.<br>**Golf:** línea base (media de las últimas 8 tarjetas G2 antes del mes, 4+) menos la media del mes. Mínimo 2,0 golpes.<br>**Natación:** suma de las mejoras % en pruebas con marca anterior. Mínimo 2,0 %.<br>Quien la ganó el mes anterior no puede repetir: pasa al siguiente. | R | 1 |
| `streak_month` | Racha del mes | «¡Qué racha! {8} juegos seguidos por encima de tu promedio, la mejor de {liga} en {mes}.» / «{5} victorias seguidas…» / «{Equipo} no perdió en {5} partidos seguidos.» | boliche, raqueta, equipos, golf | Constancia | único, ×N | mes · liga | Solo rachas dentro del mes. **Boliche:** juegos B1 seguidos (orden: fecha, `start_time`, número de juego) en o sobre la línea base fijada el día 1. Mínimo 6. Desempate: media de la racha menos la base. **Raqueta:** victorias R2 seguidas en formatos oficiales. Mínimo 4. **Equipos:** partidos T2 seguidos sin perder de un equipo. Mínimo 4. Va a quien jugó 75 %+ de esos partidos. **Golf:** tarjetas G2 seguidas con diferencial igual o menor que la base. Mínimo 3. | R | 1 |
| `perfect_attendance_month` | Asistencia perfecta del mes | «No faltaste a ninguna fecha de {liga} en {mes}. ¡Tú no te pierdes una!» | boliche, raqueta, equipos, golf | Asistencia | único, ×N (todos los que cumplen) | mes · liga | El jugador ya existía (`players.created_at`) antes de la primera fecha del mes. **Fechas:** boliche, eventos `torneo` con 4+ jugadores con juegos B1 (3+ fechas); raqueta, sus partidos oficiales del mes que terminaron finales o por W.O. (3+; los programados, anulados o pospuestos no cuentan); equipos, los partidos finales de su equipo, solo si **todos** tienen alineación (3+); golf, rondas cerradas con 3+ tarjetas (2+). **Presente en el 100 %:** juego B1; partido sin W.O. en contra de su lado; alineación o `played`; tarjeta G1. | PC | 1 |
| `team_of_month` | Equipo del mes | «{Equipo} fue el equipo del mes en {liga}, y tú jugaste {3} de sus {4} partidos.» | baloncesto, fútbol, sala | Resultados | único, ×N | mes · liga | 4+ equipos con 2+ partidos T2 en el mes; cada candidato con 3+. Puntos de `rules.table` (por defecto 3/1/0). Desempates: puntos por partido, diferencia de goles o puntos, a favor. Va a quien apareció en 50 %+ de los partidos del equipo. Si el equipo no registró alineación en todo el mes: la plantilla anterior al primer partido, y la evidencia dice «según plantilla». Fuente: `matches`, `match_sides`, `team_players`, `match_players`, `score.lines`, `leagues.rules`. | R | 1 |
| `top_scorer_month` | Bota de oro del mes (baloncesto: Más puntos del mes) | «Metiste {6} goles en {mes}, lo más de {liga}.» / «Anotaste {58} puntos en {mes}…» | baloncesto, fútbol, sala | Resultados | único, ×N | mes · liga | `goals` (sin autogoles ni penales de tanda) o `pts` de líneas TS, en 2+ partidos. Mínimo: fútbol 3 goles, sala 4. Desempate: por partido. | E | 1 |
| `clean_sheet_month` | Valla menos vencida del mes | «Tu portería fue la menos batida de {liga} en {mes}.» | fútbol, sala | Resultados | único, ×N | mes · liga | Portero (`keeper=1`) en 2+ partidos T2 con al menos una valla invicta (`conceded=0`). Menos goles recibidos por partido. Desempates: más vallas invictas, más partidos. | E | 1 |
| `personal_best_month` | Tu mejor mes | «En {octubre de 2026} tuviste tu mejor mes en {boliche}: +{6} sobre tu mejor mes anterior.» | boliche, golf | Mejora | único, ×N | mes · cuenta | **Boliche:** media del mes (9+ juegos B1) mayor que la de todos tus meses anteriores que calificaron (3+ meses anteriores). **Golf:** diferencial medio del mes (2+ tarjetas G2) menor que el de todos los anteriores (3+). | PC | 1 |
| `box_top_month` | Cima de tu caja | «Terminaste en la cima de la caja {3} en {mes}.» | pádel, tenis, pickleball | Resultados | único, ×N | mes de cajas · liga | Se evalúa **al cerrar el mes** de la liga por cajas (§3.3), con la foto de `config.months[n]` tomada antes de la poda (raq:313-338). Caja con 3+ jugadores, cada uno con 2+ partidos R1 del mes (`round = n`). Primero por victorias; desempate por diferencia de juegos; empates comparten. Tú con al menos `minToPromote` partidos. El servidor recalcula la caja con `src/sports/formats/box.ts`; no usa lo que calculó el teléfono. | PC | 1 |
| `box_promoted` | Subiste de caja | «Subiste a la caja {2} para {noviembre}.» | pádel, tenis, pickleball | Mejora | único, ×N | mes de cajas · liga | En la misma foto hay `{id: tú, move: 'sube'}` y el servidor, recalculando con `box.ts`, también te sube. Solo en ligas con peso para el mes. | PC | 1 |
| `ladder_top` | Número 1 | «Cerraste {mes} en el puesto 1 de la escalera de {liga}.» | pádel, tenis, pickleball | Resultados | único, ×N | mes · liga | Foto de `ladder_rungs` el día 1 (§3.3): `position=1`, **y** durante el mes ganaste como retador al puesto 1 o lo defendiste en un reto jugado, con partido R2. Así no cuenta que el admin te ponga primero con `set_ladder`. Escalera con 8+ peldaños. | E | 1 |
| `monthly_regular` | Fijo del mes | «Jugaste {n} días de {deporte} en {mes}.» | todos | Constancia | B 4 · P 8 · O 12 días ponderados, ×N por mes | mes · cuenta | Días ponderados del deporte en LR en el mes (golf y natación × 2, máximo 4 por semana ISO). Se guarda solo el nivel más alto del mes. | PC · R · E | 3 |

### 2.10 Anual

Se evalúan el **7 de enero a las 00:05** por el año anterior.

| key | Nombre | Descripción | Deporte | Categoría | Niveles y umbrales | Periodo · ámbito | Criterio exacto y fuente | Rareza | Def. |
|---|---|---|---|---|---|---|---|---|---|
| `year_recap` | Tu {2026} | «{2026} en MatchMate: {54} días jugando, {3} deportes, {11} meses activos. ¡Qué año!» | todos | Constancia | B 20 · P 50 · O 100 días ponderados, y en todos los niveles 6+ meses activos | año · cuenta | Días ponderados en LR en el año (`America/Santo_Domingo`). Sale con el resumen del año (§6.4). | C · PC · R | 3 |
| `full_year` | Todo el año | «Jugaste {deporte} {11} de los 12 meses de {2026}.» | todos | Constancia | único, ×N (uno por año) | año · cuenta | 10+ meses activos (§1.7.3) del deporte en el año. | R | 1 |
| `figure_of_year` | Figura del año | «Fuiste la figura de {liga} en {2026}.» | boliche, pádel, tenis, pickleball, golf | Resultados | único, ×N | año · liga | Liga con peso para el año. La métrica de `player_of_month` sobre todo el año. Mínimos: boliche 36 juegos oficiales y 40 %+ de las fechas; raqueta 12 partidos R2 y 40 %+ de los programados; golf 8 tarjetas G2. **No se da si la liga tuvo una temporada igual al año calendario** (ahí ya está `season_podium`). | E | 1 |
| `progress_of_year` | Mayor progreso del año | «Nadie en {liga} progresó tanto como tú en {2026}: +{18} pinos.» | boliche, pádel, tenis, pickleball, golf, natación | Mejora | único, ×N | año · liga | Liga con peso para el año. **Boliche:** media de los últimos 30 juegos B1 del año menos la de los primeros 30 (60+ juegos). Mínimo +8. **Raqueta:** % de juegos ganados del 2.º semestre menos el del 1.º (8+ partidos R2 por semestre). Mínimo +10. **Golf:** diferencial medio de las primeras 6 tarjetas G2 menos el de las últimas 6 (12+). Mínimo 2,5. **Natación:** más marcas personales en el año (4+). | E | 1 |

### 2.11 Temporada

Se evalúan al **cerrar la temporada** (§3.3). Piden **liga con peso para temporada** (§1.7.4); las de título,
además, `badges_auto='todas'`. Tamaño del podio en §1.7.8 y participación mínima en §1.7.7.

| key | Nombre | Descripción | Deporte | Categoría | Niveles y umbrales | Periodo · ámbito | Criterio exacto y fuente | Rareza | Def. |
|---|---|---|---|---|---|---|---|---|---|
| `season_podium` | Título de temporada. Niveles: Título (oro), Segundo lugar (plata), Tercer lugar (bronce). En `kind='torneo'`: «Título del torneo» | «¡Ganaste {temporada} de {liga}!» / «Terminaste en segundo lugar de {temporada}…» | todos menos natación | Resultados | O 1.º · P 2.º · B 3.º, ×N | temporada · liga | Según el deporte y el formato (tabla abajo). En torneos con categorías, un podio por categoría (`s:<id>:<catId>`). | E · E · E | 3 |
| `category_title` | Título de categoría | «Ganaste la categoría {B} de {liga} en {temporada}.» | boliche, natación | Resultados | único, ×N | temporada · liga | **Boliche:** categoría = `category(entries.average de su primer torneo de la temporada, category_cuts ?? DEFAULT_CUTS)`, con la regla anti-sandbagging de `bowling_category_win`. Se ordena con la métrica del título. 4+ jugadores que califican por categoría y 12+ en total.<br>**Natación:** suma de `swim_meets.points` por lugar en pruebas individuales de encuentros finalizados (no `control`), por (`swim_events.gender`, `age_group`). 4+ nadadores con 50 %+ de los encuentros. Se usa el sexo público de la prueba; nunca `player_private`. | R | 1 |
| `season_most_improved` | Mayor progreso de la temporada | «Tu temporada en {liga}: +{14} pinos sobre tu promedio de arranque.» | boliche, pádel, tenis, pickleball, golf, natación | Mejora | único, ×N | temporada · liga | 6+ elegibles. **Boliche:** media de la 2.ª mitad de la temporada (por fecha) menos la línea base al inicio; si la base tiene menos de 12 juegos, la base son los primeros 12 de la temporada y se piden 30+. 24+ juegos, 50 %+ de asistencia. Mínimo +8. **Raqueta:** % de juegos ganados de la 2.ª mitad menos la 1.ª (5+ partidos R2 por mitad). Mínimo +10. **Golf:** diferencial medio de la 1.ª mitad menos la 2.ª (3+ tarjetas por mitad). Mínimo 2,5. **Natación:** más marcas personales (3+); desempate, la suma de %. | E | 1 |
| `season_rookie` | Revelación de la temporada | «Tu primera temporada en {deporte} y fuiste lo mejor entre los nuevos de {liga}.» | boliche, pádel, tenis, pickleball, golf, natación | Resultados | único por deporte | temporada · liga | Nuevo = su primera actividad válida del deporte cae dentro de la temporada (con cuenta: en todas sus ligas; sin cuenta: en esta). 3+ nuevos que califican; 50 %+ de asistencia. El mejor por la métrica del título (natación: puntos). Una sola vez en la vida por deporte. | R | 1 |
| `season_attendance` | Asistencia de temporada | «Fuiste a {15} de las {16} fechas de {temporada}.» | todos | Asistencia | B 75 % · P 90 % · O 100 % | temporada · liga | Las fechas de `perfect_attendance_month`, contadas desde la primera actividad del jugador en la temporada hasta el final. Fechas mínimas en esa ventana: boliche 8, raqueta 6, equipos 6 (solo partidos con alineación, y 80 %+ de los partidos del equipo la tienen), golf 4, natación 3 encuentros (resultado que no es `dns` en encuentros donde estaba inscrito). Se guarda solo el nivel más alto. | C · PC · R | 3 |
| `season_top_scorer` | Bota de oro de la temporada (baloncesto: Más puntos de la temporada) | «{21} goles en {temporada}: nadie metió más en {liga}.» | baloncesto, fútbol, sala | Resultados | único, ×N | temporada · liga | Líneas TS; el jugador con línea en 50 %+ de los partidos T1 de su equipo; 4+ equipos. Fútbol y sala: más goles, mínimo 3. Baloncesto: mejor promedio de puntos por partido, con 6+ apariciones. Empates comparten. | E | 1 |
| `season_best_keeper` | Portero menos vencido | «Tu portería fue la menos batida de {liga} en {temporada}.» | fútbol, sala | Resultados | único, ×N | temporada · liga | `keeper=1` en 50 %+ de los partidos T1 de su equipo y 6+ partidos; 4+ equipos. Menos goles recibidos por partido. | E | 1 |
| `fair_play` | Juego limpio (natación: Estilo limpio) | «Una temporada entera sin roja y casi sin amarillas. ¡Así se juega!» / «{10} pruebas sin una descalificación.» | fútbol, sala, baloncesto, natación | Juego limpio | único, ×N (todos los que cumplen) | temporada · liga | **Fútbol y sala:** 8+ apariciones TS con `played=1`; 0 rojas; como mucho 1 amarilla; ninguna fila de `football_sanctions` (fut:22-39) en la ventana; y la liga registró al menos una tarjeta en la temporada (prueba de que se anotan). **Baloncesto:** 8+ partidos con `state`; 0 faltas `technical`, `unsportsmanlike` o `disqualifying` (basketball.ts:183-200), en una liga que registró faltas de ese tipo en la temporada. **Natación:** 6+ resultados en encuentros finalizados y ningún `dq` ni `dnf` (`dns` no cuenta). | PC | 1 |
| `fair_play_team` | Equipo juego limpio | «{Equipo} fue el equipo más limpio de {liga} en {temporada}.» | baloncesto, fútbol, sala | Juego limpio | único, ×N | temporada · liga | El equipo con menos (amarillas + 3 × rojas) por partido, con 8+ partidos con `lines`; en baloncesto, (técnicas + antideportivas) por partido desde `state`. 4+ equipos, y la liga registró al menos una tarjeta o falta de ese tipo. Va a quien jugó 40 %+ de los partidos. | R | 1 |
| `honor_word` | Palabra de honor | «{12} partidos en {temporada} sin W.O. y sin reclamos perdidos. Contigo se puede contar.» | pádel, tenis, pickleball | Juego limpio | único, ×N | temporada · liga | 8+ partidos oficiales R1 en la temporada; 0 W.O. dados (`walkover_side` = su lado); ningún reclamo perdido: ni un resultado propuesto por su lado corregido por un admin (`history` con `resolve` que trae `score`), ni un reclamo de su cuenta resuelto sin cambio (`dispute` de esa cuenta seguido de `resolve` sin `score`). `history` guarda 50 acciones por partido, que alcanzan. | PC | 1 |

**Quién gana `season_podium`, por deporte y formato**

| Deporte o formato | Oro, plata y bronce |
|---|---|
| Liga de boliche | Promedio de temporada en juegos B1 de torneos; con hándicap si la mayoría de los torneos rankean por hándicap. Mínimo de §1.7.7. |
| Torneo de boliche (`kind='torneo'`) | `individualValue` (stats.ts:90-94) sobre los eventos del torneo; solo compiten quienes tiraron todos los juegos. |
| Liga de raqueta | Tabla calculada en el servidor: victorias, o puntos de `rules.table`; desempates por diferencia de sets y de juegos. Parejas con `pairStandings` (results.ts:114); individual y noches con `seasonPlayerTable` / `seasonNightTable` (results.ts:302, 378). Si hay empates exactos que `rules.table` rompe de otra forma, `close_season(p_order)` acepta el orden del admin **solo entre los empatados en puntos**. |
| Torneo de raqueta (`kind='torneo'`) | Por categoría: oro al ganador de `<catId>-R<rounds>-1`, plata al perdedor, bronce a `<catId>-P3` o a los dos perdedores de semifinal. |
| Liga por cajas | Cima de la caja 1 del último mes cerrado de la temporada. Solo oro. |
| Escalera | Puesto 1 al cierre, con al menos un reto jugado en la temporada. Plata y bronce solo si la escalera tiene 10+ peldaños y el jugador jugó 3+ retos. |
| Liga de equipos | Puntos de `rules.table` (por defecto 3/1/0; `basketballStandings`, `footballStandings` en standings.ts:155 y 270). Desempates: diferencia, a favor. 4+ equipos. Va a quien jugó 30 %+ de los partidos del equipo, o a la plantilla anterior al último partido si la liga nunca registró alineación. |
| Torneo de equipos (`kind='torneo'`) | Final `R<n>-1` (los penales de `score.pens` desempatan) y `P3`. |
| Golf | Orden de mérito: cada ronda cerrada ordena sus tarjetas G1 con su `competition` y los puestos 1–8 ganan 10-8-6-5-4-3-2-1 puntos (los empates reparten). Total de temporada, con 50 %+ de las rondas jugadas (`orderOfMerit`, leaderboard.ts:197). Un torneo de varias rondas usa su tabla acumulada. |

### 2.12 Comunidad

| key | Nombre | Descripción | Deporte | Categoría | Niveles y umbrales | Periodo · ámbito | Criterio exacto y fuente | Rareza | Def. |
|---|---|---|---|---|---|---|---|---|---|
| `league_builder` | Liga en marcha | «Tu liga {liga} ya tiene {25} jugadores activos. ¡Armaste algo bonito!» | todos | Organización | B 10 · P 25 · O 50 jugadores | liga (`l:<league_id>`) · cuenta | La cuenta es `leagues.owner_id` al evaluar. Jugadores distintos en la vida de la liga con 3+ días activos en ella, y 6+ de ellos cuentas establecidas distintas. Cada nivel se da una sola vez por liga, al dueño de ese momento, y se queda aunque la transfiera. Liga con menores: sin nombre. | R · E · L | 3 |
| `season_organizer` | Temporada organizada | «Sacaste adelante {temporada} de {liga}: {16} fechas y {22} jugadores.» | todos | Organización | único, ×N | temporada · cuenta | Temporada cerrada con 8+ fechas oficiales y 8+ jugadores activos (4+ cuentas). Fechas: eventos de boliche, jornadas o rondas con 2+ partidos finales, rondas de golf cerradas, encuentros finalizados. Para el dueño y los admins con 5+ días de servicio (ver `table_crew`) en la temporada. | R | 1 |
| `table_crew` | Mesa técnica | «{20} días anotando y aprobando para que otros jueguen. ¡Gracias!» | todos | Voluntariado | B 5 · P 20 · O 60 días de servicio | siempre · cuenta | **Día de servicio:** un (liga real, fecha local) en que la cuenta, sin jugadores propios en ningún lado, hizo al menos una de estas: dejó final un partido (`confirmed_by`, `proposed_by` cuando quedó final, o `match_officials.user_id`); aprobó la `submission` de otro (`reviewed_by ≠ created_by`, `aprobado`); anotó resultados de natación de otros (`recorded_by`) en un encuentro que se finalizó; cerró una ronda de golf (`closed_by`) con 4+ tarjetas. No se cuenta escribir juegos de boliche porque no se guarda quién los escribe. | PC · R · E | 3 |
| `captain_band` | Brazalete | «Capitaneaste a {equipo} toda la temporada: {10} partidos.» | baloncesto, fútbol, sala | Liderazgo | único, ×N | temporada · liga | `team_players.role` `captain` o `delegate` en un equipo con 8+ partidos T1 en la temporada y como mucho 1 W.O. dado. | R | 1 |
| `coach_board` | Cuerpo técnico | «Tu club {club} compitió con {8} nadadores en {temporada}.» | natación | Liderazgo | único, ×N | temporada · cuenta | `swim_clubs.coach_id` es el jugador de la cuenta; en la temporada, 5+ nadadores distintos del club con un resultado que no es `dns` en encuentros finalizados. | R | 1 |
| `good_vibes` | Buena vibra | «Felicitaste a {30} compañeros distintos por sus juegos.» | todos (no ligas con menores) | Compañerismo | B 10 · P 30 · O 75 personas | siempre · cuenta | Personas distintas T (una persona con cuenta cuenta una vez entre ligas) a las que la cuenta reaccionó (`reactions` `felicitar` o `like`, o `game_likes`), si: T no es un jugador de la propia cuenta; T tiene 1+ día activo; **la cuenta es miembro (`league_members`) de la liga de T**; y las reacciones que cuentan abarcan 2 / 3 / 6 meses distintos según el nivel. Quitar la reacción después no retira la insignia. | C · PC · R | 3 |
| `bowlingx_roots` | Raíces BowlingX | «Estabas desde BowlingX. Aquí empezó todo.» | boliche | Historia | único, conjunto cerrado | una vez · cuenta | `profiles.firebase_uid` no nulo **y** 1+ día activo en MatchMate. Nadie la puede ganar después de la migración. | cerrada | 1 |

### 2.13 Cuántas insignias tiene cada deporte

Contando niveles, con las que se instancian en varios deportes. Todas las ligas suman además las 29 de cuenta que no
son de un deporte (`month_streak`, `mileage`, `strong_start`, `multisport`, `three_worlds`, `anniversary`,
`year_recap`, `league_builder`, `season_organizer`, `table_crew`, `good_vibes`).

| Deporte | Propias | Compartidas (general, mensual, anual, temporada, comunidad) | Total |
|---|---|---|---|
| Boliche | 26 | 28 | 54 |
| Pádel | 23 | 26 | 49 |
| Pickleball | 23 | 26 | 49 |
| Tenis | 22 (sin noches) | 26 | 48 |
| Baloncesto | 26 (14 + 12 de equipos) | 22 | 48 |
| Fútbol | 27 (15 + 12 de equipos) | 24 | 51 |
| Sala | 27 | 24 | 51 |
| Golf | 19 | 26 | 45 |
| Natación | 18 | 15 | 33 |

Rendimiento esperado (se calibra con el historial, §3.5): un jugador casual (6 juegos al mes) desbloquea 1–2 en el
primer mes y 4–6 en el año; uno regular (liga semanal) 2–3, 6–8 en la primera temporada y 10–14 en el año; uno
entusiasta de dos deportes 4–6, 10–13 y 18–25. Si la mediana pasa esos números por más de 50 %, se suben umbrales
antes de añadir insignias. Si menos del 60 % de los regulares tiene alguna al mes 2, se baja `strong_start` a 3
días.

### 2.14 Futuro (no se puede calcular con lo que se guarda hoy)

| Deporte | key | Nombre | Qué falta |
|---|---|---|---|
| Boliche | `bowling_center_explorer` | Trotamundos | Bolera o pista por evento (solo existe `leagues.venue`, texto libre) |
| Boliche | `bowling_oil_master` | Domador del aceite | Patrón de aceite |
| Boliche | `bowling_streaks_all_games` | Rachas en todo | Cuadros de los juegos que no se anotan bola por bola |
| Raqueta | `racket_aces`, `racket_winners` | Ases, Winners | Eventos por punto (`state` solo guarda punto, retiro y W.O.) |
| Raqueta | `racket_level_up` | Subiste de nivel | Historial de nivel (`attrs.level`, `ntrp` y `dupr` guardan solo el último valor y los escribe uno mismo) |
| Raqueta | `racket_king_court` | Rey de la cancha | Ese formato no existe |
| Raqueta | `racket_golden_point` | Rey del punto de oro | Se podría reconstruir desde `state` solo cuando se anotó en cancha; no para la v1 |
| Baloncesto | `basketball_double_double`, `basketball_triple_double` | Doble-doble, Triple-doble | Rebotes, asistencias, robos y tapones |
| Baloncesto | `basketball_ft_pct` | Tirador perfecto | Tiros libres intentados |
| Baloncesto | `basketball_buzzer_beater` | Sobre la bocina | Está en `state` pero no en las líneas compactas; no para la v1 |
| Fútbol y sala | `football_saves`, `football_mvp`, `football_minutes` | Atajadas, Figura del partido, Minutos | Atajadas, votos, minutos |
| Fútbol y sala | `football_penalty_taker` | Cobrador de penales | Tiros de la tanda por jugador (solo en `state`) |
| Golf | `golf_gir`, `golf_fairways` | Green en regulación, Calle | No se registran |
| Golf | `golf_official_index` | Índice oficial | WHS / FEDOGOLF |
| Golf | `golf_longest_drive`, `golf_closest_pin` | Drive más largo, Más cerca | No se registran; la liga los puede dar a mano con el creador (§5) |
| Golf | `golf_putting` | Mago del green | Los putts los escribe el grupo sin testigo independiente; se reconsidera con un año de datos |
| Natación | `swim_relay_*` | Relevos | No existen relevos |
| Natación | `swim_splits`, `swim_reaction` | Parciales, Reacción | No se registran |
| Natación | `swim_qualifier` | Marca mínima | Tabla de marcas de la federación |
| Todos | `perfect_checkin` | Asistencia comprobada | Check-in real (`event_rsvps` es intención y «no voy» no se guarda) |
| Todos | `host` | Buena convocatoria | Quién invitó a quién: `league_members.invited_by` y un enlace de invitación personal (hoy el código es por liga y solo lo ven los admins, rpc:100-110) |
| Todos | `mvp_vote` | Figura por votación | Votos de los jugadores |

### 2.15 Descartadas a propósito

- **Por farmeables o porque los escribe uno mismo:** «más rápido que tu tiempo de inscripción» (natación,
  `seed_cs`); «índice por debajo de X» o «nivel 5+» (golf, raqueta); todo lo basado en likes recibidos o
  seguidores; puntos totales de americano y «más partidos en un día» (volumen puro); `season_workhorse`
  («Incansable», premia volumen).
- **Por vergonzosas:** todo lo del lado que pierde (recibir un 6-0, más descalificaciones, peor puntaje) y la
  barrera del 50 libre por sexo (mostraba tiempos bajos en público y no sirve para ligas infantiles; la liga puede
  hacer la suya con el creador).
- **Por repetidas al unir las propuestas:** `sport_months` y `year_in_sport` (quedan `month_streak`, `full_year` y
  `monthly_regular`), `weekly_streak` (queda `month_streak`), `above_average_run` y `always_on_court` (quedan
  `bowling_over_average`, `streak_month` y la asistencia), `pb_collector` (queda `swim_personal_best`),
  `bowling_season_best_avg` y `bowling_event_win`/`bowling_event_podium` (quedan `season_podium` y
  `event_podium`), `racket_tournament_*` y `golf_podium`/`golf_round_winner` (quedan en `event_podium`),
  `basketball_champion` y `football_champion` (quedan `season_podium` y `event_podium`), `swim_double_gold`,
  `swim_meters`, `swim_medley`, `swim_pb_every_stroke`, `racket_improving` y `basketball_improving` (cubiertas por
  las de progreso), `game_of_month`, `ladder_climb_month` (queda `racket_ladder_climber`), `bowling_dutch_200`,
  `bowling_spares`, `bowling_triplicate` y `golf_par_streak` (se pueden añadir después sin cambiar el motor).

---

## 3. Motor de otorgamiento

### 3.1 Arquitectura

```
cambios en resultados ──trigger──▶ private.badge_queue ◀── private.badges_daily (00:30 Santo Domingo)
                                          │                 close_season, cierre de mes de cajas
                          cron mm-insignias (cada 10 min, pg_net, como send-push)
                                          ▼
                     Edge Function `insignias` ──▶ private.badge_snapshot(job)  (datos que necesita)
                                          │
                              motor puro (bundle)  evaluate(job, snapshot) → decisiones
                                          ▼
                              private.badge_apply(job, decisiones)
                     badge_awards · badge_progress · push_outbox (avisos agrupados)
```

- **El servidor decide, nunca el teléfono.** Las tablas, podios y marcas personales de hoy se calculan en el
  teléfono (mapa §0); para las insignias se recalculan en el servidor con **los mismos helpers puros**.
- **Catálogo en código:** `src/badges/catalog.ts` es la única fuente de keys, nombres, textos, niveles, umbrales,
  rarezas estimadas, forma e ícono. Lo usan la app (textos, progreso, galería) y el motor.
- **Reglas puras:** `src/badges/rules/` (`activity.ts`, `gates.ts`, `baselines.ts`, `bowling.ts`, `racket.ts`,
  `team.ts`, `golf.ts`, `swim.ts`, `periods.ts`, `community.ts`). Reutilizan sin copiar:

  | Área | Helpers (archivo) |
  |---|---|
  | Boliche | `entryLine`, `playerStats`, `eventPosition`, `individualValue`, `teamLines`, `category`, `calcHandicap` (`src/lib/stats.ts`); `scoreGame`, `validRolls`, `frameStats`, `marksOf`, `standingMask` (`src/lib/bowling.ts`) |
  | Raqueta | `stateFromScore`, `matchRules`, `matchTotals` (`src/sports/racket/index.ts`); `racketResultOf`, `playerSide`, `playerRecord`, `entrantKey`, `matchTime`, `pairStandings`, `seasonPlayerTable`, `seasonNightTable` (`src/pages/sports/racket/logic/results.ts`); `nightTable` (`logic/night.ts`); `winnerId` (`logic/tourney.ts`); `src/sports/formats/box.ts`, `ladder.ts` |
  | Equipos | `decodeLines` (`src/pages/sports/{basketball,football}/adapter.ts`); `basketballTotals`, `footballTotals` (`src/sports/team/stats.ts`); `basketballStandings`, `footballStandings` (`standings.ts`); `src/pages/sports/team/tournament.ts` |
  | Golf | `scoreRound`, `playOrder`, `golfStats`, `golfLeaderboard`, `orderOfMerit` (`src/sports/golf/*`) |
  | Natación | `personalBests`, `improvementPct`, `placeResults`, `bestKey` (`src/sports/swimming/*`) |

  Helpers nuevos: `isSplit(mask)` (tabla de pinos vecinos), `golfDifferential(card, round)`, `cappedIndex(...)`,
  `activeDays(...)`, `realLeagueMonths(...)`.
- **Motor:** `src/badges/engine.ts` exporta `evaluate(job, snapshot, now): BadgeDecision[]`, sin E/S. Decisiones:
  `award`, `revoke`, `progress`, `review` (pedir aval). `decide(job, snapshot, now)` (lo que corre la Edge Function)
  suma antes `adopt`: cada copia de respaldo de la foto cuyo jugador ya tiene cuenta pasa a la cuenta (§1.6). Pruebas
  con Vitest y fixtures.
- **Bundle para Deno:** Deno exige `.ts` en los imports y el `tsc` de la app no lo acepta (por eso
  `scan-core.ts` es un solo archivo). `scripts/badges/bundle.mjs` usa rolldown (viene con Vite 8) y genera, desde
  `src/badges/edge.ts`, `supabase/functions/_shared/badges-engine.gen.js`: un solo ESM sin imports, con un hash del
  código fuente en la cabecera. `pnpm badges:bundle`; la prueba `src/badges/bundle.test.ts` falla si el archivo está
  viejo. `edge.ts` pone además `context.name` y `context.level_name` (los nombres del push).
- **Edge Function `supabase/functions/insignias/`** (`index.ts` arma dependencias; `core.ts` hace el trabajo, como
  `send-push`): valida `CRON_SECRET`; toma hasta 25 trabajos con `badge_claim`, de a 5; por cada uno pide
  `badge_snapshot(job)`, corre `evaluate` y llama `badge_apply(job, decisiones)` (si algo falla, `badge_fail`). Corta
  a los 100 s o con ~1,2 s de CPU del motor (Supabase corta a los 2 s de CPU); `badge_finish` avisa y, si queda cola,
  se vuelve a llamar con `private.kick_badges()` (como `finish_push_batch`).
- **Plan gratis de Supabase:** 2 tareas de pg_cron (una cada 10 min, una diaria) y cadenas cortas: unas 4.500
  invocaciones al mes, lejos del límite.

**Definición en código:**

```ts
export type Level = 0 | 1 | 2 | 3 | 4 | 5;            // único, bronce, plata, oro, platino, diamante
export type Rarity = 'C' | 'PC' | 'R' | 'E' | 'L';
export interface BadgeDef {
  key: string;                                         // 'bowling_club'
  group: 'general' | 'bowling' | 'racket' | 'team' | 'basketball' | 'football' | 'golf' | 'swimming'
       | 'mensual' | 'anual' | 'temporada' | 'comunidad';
  sports: SportId[] | 'all';                           // 'all' = de cuenta, sin deporte (sport = 'all')
  scope: 'cuenta' | 'liga';
  period: 'siempre' | 'evento' | 'mes' | 'cajas' | 'temporada' | 'anio' | 'aniversario' | 'liga';
  category: 'bienvenida' | 'hitos' | 'marcas' | 'mejora' | 'constancia' | 'asistencia' | 'resultados'
          | 'juego_limpio' | 'multideporte' | 'lealtad' | 'organizacion' | 'voluntariado' | 'liderazgo'
          | 'companerismo' | 'historia';
  shape: BadgeShape;                                   // §4.2
  icon: BadgeIconKey;                                  // §4.4
  name: string | Partial<Record<SportId, string>>;
  levelNames?: Partial<Record<Level, string | Partial<Record<SportId, string>>>>;  // 'Pavo', 'Hat-trick'…
  description: string;                                 // plantilla: {n}, {liga}, {mes}, {evento}, {deporte}
  levels: { level: Level; threshold?: number | Partial<Record<SportId, number>>; rarity: Rarity }[];
  repeatable?: boolean;                                // ×N
  privateByDefault?: boolean;                          // se inserta con hidden = true
  aval?: boolean;                                      // queda en_revision hasta que alguien la confirme
  title?: boolean;                                     // se apaga con badges_auto = 'sin_titulos'
  evaluator: EvaluatorId;
}
```

### 3.2 Modelo de datos

Convenciones del repo: RLS de solo lectura, toda escritura por RPC o por el motor, `updated_at` para sincronizar y
tombstones al borrar (schema:409-419).

```sql
-- Insignias automáticas otorgadas. Nivel: 0 único, 1 bronce, 2 plata, 3 oro, 4 platino, 5 diamante.
create table public.badge_awards (
  id uuid primary key default gen_random_uuid(),
  badge_key text not null check (badge_key ~ '^[a-z][a-z0-9_]{1,39}$'),      -- validada contra el catálogo por el motor
  sport text not null check (sport in ('all', 'bowling', 'padel', 'tennis', 'pickleball',
                                       'basketball', 'football', 'futsal', 'golf', 'swimming')),
  level smallint not null check (level between 0 and 5),
  period_key text not null check (period_key ~ '^[A-Za-z0-9:_-]{1,120}$'),    -- §1.7.1
  player_id uuid,                                                             -- ámbito liga (y respaldo sin cuenta)
  user_id uuid references public.profiles (id) on delete cascade,             -- ámbito cuenta
  league_id uuid references public.leagues (id) on delete cascade,            -- null en las de cuenta
  holder uuid generated always as (coalesce(player_id, user_id)) stored,
  status text not null default 'provisional'
    check (status in ('provisional', 'firme', 'en_revision', 'revocada')),
  awarded_at timestamptz not null default now(),
  firm_at timestamptz,                                                        -- provisional: cuándo queda firme
  refs text[] not null default '{}',                                         -- 'entry:<id>:<g>', 'match:<id>', 'card:<id>'…
  context jsonb not null default '{}'                                         -- evidencia: valores, ventana, liga, evento
    check (jsonb_typeof(context) = 'object' and pg_column_size(context) < 4096),
  hidden boolean not null default false,                                      -- privada por defecto: true al insertar
  seen_at timestamptz,
  notified_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text check (revoke_reason in ('evidencia', 'aval', 'fraude')),
  revoked_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade,
  check (num_nonnulls(player_id, user_id) = 1),
  check (player_id is null or league_id is not null),
  check ((status = 'revocada') = (revoked_at is not null))
);
-- Idempotencia: una fila por dueño, key, deporte, nivel y periodo (incluidas las revocadas, que se reactivan).
create unique index badge_awards_once on public.badge_awards (holder, badge_key, sport, level, period_key);
create index badge_awards_user_idx on public.badge_awards (user_id) where user_id is not null;
create index badge_awards_player_idx on public.badge_awards (player_id) where player_id is not null;
create index badge_awards_sync_idx on public.badge_awards (league_id, updated_at);
create index badge_awards_refs_idx on public.badge_awards using gin (refs)
  where status in ('provisional', 'en_revision');
create index badge_awards_firm_idx on public.badge_awards (firm_at) where status = 'provisional';

-- Progreso hacia el siguiente nivel (solo lo ve su dueño). Lo escribe el motor.
create table public.badge_progress (
  player_id uuid,
  user_id uuid references public.profiles (id) on delete cascade,
  league_id uuid,
  holder uuid generated always as (coalesce(player_id, user_id)) stored,
  badge_key text not null,
  sport text not null,
  value numeric not null,
  target numeric not null,
  next_level smallint not null check (next_level between 0 and 5),   -- 0: única con meta («Arranque con todo»)
  updated_at timestamptz not null default now(),
  primary key (holder, badge_key, sport),
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade,
  check (num_nonnulls(player_id, user_id) = 1)
);

-- Rareza medida cada noche (§3.8). La leen todos.
create table public.badge_stats (
  badge_key text not null,
  sport text not null,
  level smallint not null,
  holders integer not null,
  base integer not null,
  pct numeric(5, 2) not null,
  rarity text not null check (rarity in ('nueva', 'comun', 'poco_comun', 'rara', 'epica', 'legendaria')),
  computed_at timestamptz not null,
  primary key (badge_key, sport, level)
);

-- Temporadas cerradas: hoy cada liga tiene una sola ventana season_start..season_end y no hay historial.
create table public.league_seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  n smallint not null check (n between 1 and 999),
  label text not null check (char_length(label) between 1 and 40),         -- «Temporada 2026», «TEMP 26/27»
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  auto boolean not null default false,        -- la cerró el cron, o es el año de una liga sin fechas
  closed_at timestamptz not null default now(),
  closed_by uuid references public.profiles (id) on delete set null,
  snapshot jsonb not null default '{}'        -- podio, tablas y evidencia al cerrar
    check (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) < 65536),
  unique (league_id, n),
  unique (league_id, start_date, end_date)
);

alter table public.leagues add column badges_auto text not null default 'todas'
  check (badges_auto in ('todas', 'sin_titulos', 'ninguna'));
alter table public.profiles add column featured_badges uuid[] not null default '{}'
  check (cardinality(featured_badges) <= 3);

-- Cola del motor (solo servidor).
create table private.badge_queue (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('resultado', 'revisar', 'evento', 'cajas', 'escalera', 'mes', 'anio',
                                     'temporada', 'noche', 'cuenta', 'vinculo', 'historial', 'aviso')),
  league_id uuid,
  user_id uuid,
  ref text not null default '',               -- 'entry:<id>', 'match:<id>', 'card:<id>', 'meet:<event>', '2026-10'…
  payload jsonb not null default '{}',        -- fotos que después no se pueden leer y jugadores de un borrado
  run_after timestamptz not null default now(),
  attempts smallint not null default 0,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create unique index badge_queue_dedupe on private.badge_queue
  (kind, coalesce(league_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), ref)
  where locked_at is null;
create index badge_queue_due_idx on private.badge_queue (run_after) where locked_at is null;

-- Un trabajo de periodo corre una sola vez (liga o 'cuenta', periodo).
create table private.badge_runs (
  kind text not null,
  scope text not null,                        -- league_id o 'cuenta'
  period_key text not null,
  done_at timestamptz not null default now(),
  awarded integer not null default 0,
  primary key (kind, scope, period_key)
);

-- Resultado de una corrida en seco del historial (§3.5).
create table private.badge_dry_runs (
  run_id uuid not null,
  badge_key text not null,
  sport text not null,
  level smallint not null,
  holders integer not null,
  base integer not null,
  primary key (run_id, badge_key, sport, level)
);
```

- `players` necesita `unique (id, league_id)` para la FK compuesta; si no lo tiene, se añade en la misma
  migración (es el patrón de las tablas de partidos).
- `context` guarda, por ejemplo: `{"v":1,"values":{"avg":187,"games":12,"base":178},"league":{"id":"…","name":"Liga
  Los Pinos"},"event":{"id":"…","name":"Torneo de octubre"},"window":["2026-10-01","2026-10-31"],"verified_only":false}`.
  El nombre de la liga se copia porque puede cambiar o borrarse.
- Tombstones: los borrados de `badge_awards` con `league_id` (fusiones) dejan tombstone como el resto de la liga.

**Funciones SQL del motor** (todas `private`, `security definer`, probadas en PGlite):

| Función | Qué hace |
|---|---|
| `badge_enqueue(kind, league, user, ref, payload, run_after)` | Inserta en la cola sin duplicar (`on conflict do nothing`). |
| Triggers `*_badges` | `entries` (insert, update de `scores`/`photos`/`frames`, delete), `matches` (update de `status`/`score`/`winner_side`/`walkover_side`, delete), `match_players` (cambios en un partido final), `golf_cards` (update de `status`/`strokes`/`dq`, delete), `golf_rounds` (`status` → `cerrada`), `swim_meets` (`finalized_at`), `ladder_challenges` (`status`), `players` (update de `user_id`). Los de borrado ponen en `payload` los jugadores afectados, porque la fila ya no existe. |
| `badge_claim(p_limit)` | Toma trabajos vencidos con `for update skip locked`; suelta bloqueos de más de 10 min. |
| `badge_snapshot(p_job)` | Devuelve en jsonb solo lo que necesita ese trabajo: la liga, el evento o partido, el historial del jugador o de la cuenta en ese deporte, las cuentas activas para LR, y la foto guardada en `payload`. |
| `badge_apply(p_job, p_decisions)` | Inserta (`on conflict do nothing`), reactiva revocadas, revoca provisionales, escribe progreso, pide avales, anota `badge_runs`, encola el `aviso` de cada cuenta y borra el trabajo. Todo en una transacción. Si falla: `attempts + 1`, `run_after = now() + 2^attempts minutos`; a los 5 intentos queda para la consola del superadmin. |
| `badges_daily(p_now)` | Tareas de la noche (§3.3). |
| `badge_notices()` | Arma los push agrupados (§3.6). Es SQL puro: no necesita el motor. |
| `badge_stats_refresh()` | Rareza (§3.8). |
| `kick_badges()` | Llama a la Edge Function con pg_net, como `kick_send_push` (push:369). |
| `cron_badges()` | Si hay trabajos vencidos, `kick_badges()`. |

### 3.3 Cuándo se evalúa cada familia

Todas las horas son de `America/Santo_Domingo` (UTC−4). Si una liga tiene otra `tz`, sus periodos se cortan en su
hora local; como toda evaluación de periodo tiene 2+ días de gracia, correr una vez al día a las 04:30 UTC alcanza.

| Familia | Qué la dispara | Cuándo corre | Estado al darla |
|---|---|---|---|
| `debut`, hitos de carrera, marcas de un juego, partido, tarjeta o prueba, `climbing`, `bowling_breakthrough` | Trigger → `resultado`: una entrada con juegos contados, un partido que queda final, una tarjeta firmada en ronda cerrada | cola, cada 10 min | provisional 7 días; con aval, `en_revision` |
| Partidos que quedan finales a las 48 h (se calcula al leer, part:184-188) | `badges_daily` encola los `finished` cuyo `proposed_at` cruzó las 48 h desde el barrido anterior | 00:30 | igual que arriba |
| Correcciones, anulaciones y borrados | Trigger → `revisar` con los ids afectados | cola | retira provisionales que ya no cumplen; recalcula contadores y progreso |
| `event_podium` de boliche, `bowling_category_win`, `bowling_team_win` | `badges_daily`: torneos con `events.date` + 3 días | 00:30 | firme |
| `event_podium` de raqueta y equipos | Trigger cuando la final (y el `P3` si existe) quedan finales; `run_after` = +48 h | cola | firme |
| `event_podium` de golf | Trigger al cerrar la ronda (o la última del torneo); `run_after` = +24 h | cola | firme |
| `racket_night_champion` | `badges_daily`: noches cerradas (todos los partidos finales, fecha pasada, 24 h desde el último resultado) | 00:30 | firme |
| `swim_medal`, `swim_record` | Trigger al poner `swim_meets.finalized_at` | cola | firme |
| `box_top_month`, `box_promoted` | La RPC que cierra el mes de cajas (raq:297-311) encola `cajas` con `config.months[n]` completo en `payload`, **en la misma transacción y antes de podar** (raq:313-338) | cola | firme |
| `ladder_top` | El día 1, `badges_daily` guarda la foto de `ladder_rungs` en una fila `escalera` (no hay historial de posiciones) | se evalúa el día 3 | firme |
| Mensual (§2.9) y `month_streak` | `badges_daily` el día 3 encola `mes` por liga y por cuenta | día 3, 00:30 | firme |
| Anual (§2.10) | `badges_daily` el 7 de enero. Para ligas sin fechas de temporada crea antes un `league_seasons` automático con el año anterior | 7 de enero, 00:30 | firme |
| Temporada (§2.11), `season_organizer`, `captain_band`, `coach_board` | `close_season` (owner o admin, desde `season_end` + 3 días) o `badges_daily` en `season_end` + 7 días | cola | firme |
| De cuenta que se acumulan: `strong_start`, `mileage`, `multisport`, `three_worlds`, `anniversary`, `good_vibes`, `table_crew`, `league_builder`, `bowlingx_roots` | `badges_daily` encola `cuenta` para las cuentas con actividad, reacciones o servicio nuevos | 00:30 | firme (solo cuenta actividad de hace 48 h o más) |
| Reclamos, vínculos y fusiones | Trigger en `players.user_id` y `merge_players` → `vinculo` | cola | §1.6 |
| Provisionales que cumplen 7 días | `badges_daily` pasa a `firme` las que tienen `firm_at < now()` | 00:30 | firme |

**`close_season(p_league uuid, p_order jsonb default null)`** (owner o admin): pide `season_start` y `season_end`
puestos y `hoy ≥ season_end + 3 días` (hora de la liga); crea la fila `league_seasons` (n siguiente, copia de las
fechas, `closed_by`) y encola `temporada`. Después el admin pone las fechas nuevas. `p_order` solo se acepta para
ordenar a los empatados en puntos (§2.11). Si la ventana choca con una temporada ya cerrada, responde `conflicto`.
La app muestra «Cerrar temporada» en Ajustes de la liga desde ese día, y un aviso al admin el día `season_end`:
«Cuando todos los resultados estén, cierra la temporada para entregar los premios.»

**pg_cron** (`20260929000990_insignias_cron_supabase.sql`, como `20260926001300_cron_supabase.sql`):

```sql
perform cron.schedule('mm-insignias', '*/10 * * * *', 'select private.cron_badges()');
perform cron.schedule('mm-insignias-diario', '30 4 * * *', 'select private.badges_daily(now())');   -- 00:30 Santo Domingo
```

### 3.4 Provisional, firme, aval y revocación

- **Provisional (7 días):** las insignias por resultado se ven y se avisan en el acto, con `firm_at = awarded_at + 7
  días`. Si en esos días llega un `revisar` que toca uno de sus `refs` y la regla ya no se cumple, pasan a
  `revocada` (`revoke_reason = 'evidencia'`), sin push. Si se sigue cumpliendo con otra evidencia (otro juego de
  200), se actualizan `refs` y `context` y se queda.
- **Contadores:** al revisar se recalculan; un nivel provisional que ya no llega se revoca, uno firme se queda.
- **Firme:** ningún cambio en los resultados la retira. Solo el superadmin, por fraude
  (`super_revoke_badge(p_award, p_note)`, `revoke_reason = 'fraude'`, en `admin_audit`).
- **Insignias de periodo** (mes, año, temporada, eventos cerrados, cajas): se dan después de su gracia y quedan
  firmes. Si después se corrige un resultado, no cambian: la evidencia explica con qué datos se dio.
- **El dueño de la liga no retira insignias automáticas.** Puede corregir el resultado en los 7 días (se retiran
  solas) o reportarla (`report_badge`) al superadmin. Así nadie que sea juez y parte decide.
- **Aval:** la fila nace `en_revision` y solo la ve el jugador. Se avisa a los revisores elegibles (§1.7.5).
  `review_badge(p_award, p_ok, p_note)`: si aprueba, pasa a `firme` y se avisa al jugador; si rechaza, `revocada`
  con `'aval'`, sin rastro público; el jugador ve en su lista «No se pudo confirmar {Juego perfecto}. Si fue un
  error, habla con tu liga.» A los 14 días sin revisión, va a la cola del superadmin.
- **Volver a ganarla:** si una insignia revocada vuelve a cumplirse con el mismo key, deporte, nivel y periodo, la
  fila se reactiva (la clave única no deja otra).

### 3.5 Historial (primera corrida)

1. **En seco primero:** `badges_backfill(p_league uuid default null, p_dry_run boolean default true)` (RPC del
   superadmin, botón «Correr en seco» en Consola › Insignias › Motor) encola un trabajo `historial` por liga (su
   carrera, sus eventos, meses y años, y lo de cuenta de sus jugadores sin cuenta) y uno por cada cuenta con jugadores
   en esas ligas (`user:<id>`: kilometraje, constancia, fijo del mes, tu año, comunidad). En seco no escribe en
   `badge_awards`: deja en `private.badge_dry_runs` cuántos tendrían cada key, deporte y nivel sobre la base de
   jugadores activos. La consola lo compara con la rareza objetivo (§1.7.9: «En su rango», «Sale muy fácil», «Sale muy
   poco») y el superadmin ajusta umbrales en el catálogo antes de la corrida real («Correr de verdad»). Una liga que
   no quepa en el tope de CPU de una llamada se parte con `payload.from`/`to` (por ahora a mano, en SQL).
2. **Orden:** contadores y marcas de carrera en orden cronológico; después los meses pasados desde el primer mes con
   datos, con las mismas reglas de LR con las cuentas de entonces; después los años pasados.
3. **Lo que no se puede reconstruir no se inventa:** no hay temporadas pasadas (no hay historial de temporadas: el
   primer `season_podium` sale del primer `close_season`), ni meses de cajas o escalera anteriores al lanzamiento
   (se podaron o no se guardaron).
4. **BowlingX:** `'importado'` cuenta como B2, y las cuentas con `firebase_uid` cuentan como establecidas desde su
   primer juego importado.
5. **Estado:** `firme` si la evidencia tiene 7+ días; si no, provisional como siempre.
6. **Un solo aviso por cuenta:** todas quedan con `notified_at`, y cada cuenta recibe un push «Te dimos {n} insignias
   por tu historial. ¡Míralas!» y, al abrir la app, una lista (no el carrusel de desbloqueo uno por uno).

### 3.6 Avisos

- **Push agrupado** (`badge_notices()`, por cuenta y por corrida), sobre filas `provisional` o `firme` con
  `notified_at` nulo, que no estén ocultas (las privadas por defecto no avisan) y que no sean de ligas con menores:
  - una: título «¡Te ganaste una insignia!», cuerpo «{Constancia} · {oro} en {Liga Los Pinos}. Tócala para verla.»
  - varias: título «¡Te ganaste {3} insignias!», cuerpo «{Constancia (oro)}, {Figura del mes} y {1} más.»
  - `tag = 'insignias'` (la nueva reemplaza a la anterior en el teléfono), `url = /u/<user_id>?tab=insignias`.
  - Se inserta en `push_outbox` y el fan-out existente la reparte (push.sql:31-47).
- **Horas tranquilas:** entre 9:00 pm y 8:00 am, el trabajo `aviso` queda con `run_after` a las 8:00 am. Como mucho un
  push de insignias cada 6 h por cuenta; lo demás se junta en el siguiente.
- **Aval:** el jugador no recibe push mientras está en revisión. Los revisores reciben «Hay una hazaña por confirmar
  en {liga}: {Juego perfecto} de {Ana}.» (`tag = 'insignia-aval:<id>'`). Al aprobarse, el jugador recibe el push
  normal.
- **En la app:** las filas con `seen_at` nulo abren el aviso de desbloqueo (§6.4) y salen en la página de Avisos.
  `mark_badges_seen` las marca.
- **En la liga:** el día 3 la portada de la liga muestra «Premios de {octubre}» durante 7 días (§6.2), sin push.
- **Sin push nunca:** retiros, jugadores sin cuenta, ligas con menores, niveles privados por defecto.

### 3.7 Cambios en funciones existentes

1. **`merge_players(from, into)`** (recl:177-263):
   - mover `badge_awards.player_id`, `badge_progress.player_id` y (desde la migración del creador)
     `league_badge_awards.player_id`, y añadirlas a la lista del guardia del catálogo (recl:250-261);
   - `badge_awards`: si choca la clave única, se queda la de `awarded_at` más viejo (y `firme` gana a `provisional`,
     que gana a `en_revision`); la otra se borra. `hidden` queda en `true` si alguna lo estaba (una copia visible por
     defecto no destapa lo que el dueño ocultó, §1.4); `seen_at` es el primero no nulo; se limpian de `profiles.featured_badges` los ids borrados;
   - `badge_progress` de los dos se borra y se encola `vinculo`;
   - `league_badge_awards`: §5.2.
   - **Sin esto, cada aprobación de reclamo falla con `conflicto`.** Hay que tener una prueba SQL que apruebe un
     reclamo con insignias en los dos jugadores.
2. **Vincular una cuenta** (`decide_player_claim`, `ensure_player`, `link_account_to_player`): no cambian. El
   trigger de `players.user_id` encola `vinculo`, que hace lo de §1.6. Si la cuenta se vinculó ella misma (dueño o
   admin: su reclamo al instante, `link_account_to_player` con su cuenta, `ensure_player`; o
   `player_claims.decided_by = user_id`), queda anotado (`private.badge_self_links`) y la foto de **todo** trabajo marca
   ese jugador con `verified_only` (no solo el `vinculo`). Lo que esa cuenta le dio con el creador o le confirmó con un
   aval antes de vincularse se retira o vuelve a revisión (§5.8).
3. **`unlink_account`** (rpc:672-696) y salir de la liga: no cambian; el trigger encola `vinculo` solo para
   recalcular progreso.
4. **`export_my_data`** (cuenta:54-106): no cambia (encuentra `user_id` y `player_id` por el catálogo). Se añade una
   prueba.
5. **Borrar la cuenta** (`delete-account`): `user_id` en cascada; las de liga se quedan en el jugador.
6. **Cerrar el mes de cajas** (raq:297-311): encola `cajas` antes de podar.
7. **Crear liga:** `badges_auto = 'sin_titulos'` si `has_minors` (trigger `before insert on leagues`).
8. **`cleanup_old_rows`** (mm-limpieza): borra trabajos hechos de más de 30 días y corridas en seco de más de 90.
9. **`memberships`** (schema:441) y las cargas de membresía (cons:726, cuenta:132): incluir `leagues.badges_auto`
   (y los permisos del creador, §5.1).

### 3.8 Rareza y calibración

- `badge_stats_refresh()` cada noche: por (key, deporte, nivel), `holders` = cuentas distintas con la insignia no
  revocada (las de liga se cuentan por `players.user_id`); `base` = cuentas con al menos un día activo en ese
  deporte en los últimos 365 días (`'all'`: en cualquiera). `pct = holders / base`, etiqueta por §1.7.9.
- Con `base` menor que 50 la etiqueta es `nueva` y la app dice «Nueva» en vez de un porcentaje.
- La tarjeta dice «La tiene el 7 % de los jugadores de boliche». Las insignias de liga del creador nunca tienen
  rareza.
- **Calibrar:** los umbrales viven en el catálogo. Subirlos solo afecta a lo que se gane después: lo ya ganado se
  queda. Cada cambio de umbral se anota en un comentario de historial en `catalog.ts`.

### 3.9 Seguridad y RPC del jugador

**RLS de `badge_awards` (solo `select`; nadie escribe desde la app):**
- **Las propias:** `user_id = auth.uid()` o `player_id` de un jugador con `user_id = auth.uid()`: todas, en
  cualquier estado (así el jugador ve «en revisión» y la línea discreta de un retiro que ya había visto).
- **Las de una liga:** `league_id in (select private.readable_leagues())`, `status in ('provisional', 'firme')` y
  (`not hidden` o `private.is_admin(league_id)`).
- **Las de cuenta de otra persona:** solo por `profile_badges(p_user)`.

`badge_progress`: solo el dueño. `badge_stats`: todos. `league_seasons`: quien ve la liga.

| RPC (public, `security definer`, con `require_uid`) | Quién | Qué revisa |
|---|---|---|
| `profile_badges(p_user)` | quien puede ver el perfil | Devuelve las de cuenta y las de liga visibles: `status` provisional o firme, no ocultas, de ligas que pasan `private.social_league_ok` (sin menores, cuenta no bloqueada), más las del creador de ligas que pasan `league_badges_public` (§5.7) |
| `set_badge_hidden(p_award, p_hidden)` | el dueño | También sirve de «Mostrar en mi perfil» para las privadas por defecto |
| `mark_badges_seen(p_ids uuid[])` | el dueño | Hasta 50 ids |
| `set_featured_badges(p_ids uuid[])` | el dueño | Hasta 3; suyas, visibles, no de ligas con menores |
| `review_badge(p_award, p_ok, p_note)` | revisor elegible (§1.7.5) o superadmin | Nota ≤ 140 |
| `report_badge(p_award, p_reason)` | miembro de la liga | 5 por día por cuenta (`private.rate_*`, base:131-151); va a la consola |
| `set_badges_auto(p_league, p_mode)` | owner | `'todas'`, `'sin_titulos'` o `'ninguna'` |
| `close_season(p_league, p_order)` | owner o admin | §3.3 |
| `super_revoke_badge(p_award, p_note)` | superadmin | Escribe en `admin_audit` |
| `badges_backfill(p_league, p_dry_run)` | superadmin | §3.5 |

---

## 4. Sistema visual

### 4.1 Decisiones

1. **Un modelo de dibujo, tres pintores.** Un módulo puro convierte una insignia en una lista de figuras, como
   `src/components/share/scene.ts` hace hoy. Esa lista la pintan: el SVG en línea de React (la app), el canvas con
   `Path2D` (la imagen para compartir) y un SVG en texto (pruebas, pasado a PNG con resvg). No hay archivos de imagen.
   No se mete SVG en `<img>` porque rompe la exportación a canvas en algunos Safari (`share/paint.ts:6-9`).
2. **La forma dice la categoría, el metal dice el nivel, el color y el emblema dicen el deporte.**
3. **Todo texto va sobre un color sólido**, nunca sobre un degradado: el contraste no depende del modo claro u
   oscuro. El texto de la cinta pasa AAA (7:1 o más) en todos los niveles.
4. **El nivel nunca se dice solo con color:** puntos de nivel (1 a 5) desde 64 px, el nivel en el nombre accesible, y
   facetas en diamante.
5. **Nombre del componente: `Insignia`.** `Badge` ya existe en `src/components/ui.tsx:112` (es una píldora).

### 4.2 Anatomía y formas

Geometría en un `viewBox` de 128 × 128. Capas de atrás hacia adelante:

1. **Borde (rim):** trazo de 2 unidades que cambia con el tema: el tono oscuro del nivel en modo claro (`rimL`) y el
   claro en modo oscuro (`rimD`). Mantiene 3:1 o más contra toda superficie de la app.
2. **Marco:** la forma de la categoría rellena con el degradado del metal a 135°: `hi` 0 %, `mid` 45 %, `lo` 100 %.
   Encima, un brillo: elipse blanca de 35 % a 0 % de opacidad sobre la mitad de arriba.
3. **Bisel:** línea interior de 2 unidades en el `hi` del nivel. Separa metal y campo con 3:1 o más contra todo
   campo de deporte (el peor caso es bronce sobre tenis, 3.25).
4. **Campo:** la misma forma reducida a 0.78 alrededor del centro, relleno sólido del color del deporte, morado de
   marca `#4338ca` para las de varios deportes, o el color de liga ajustado (§4.3).
5. **Emblema:** glifo del deporte o ícono, en blanco, trazo 2 en una grilla de 24, puntas redondas. Caja de 44
   centrada en (64, 58) si hay cinta, o de 52 en (64, 64) sin cinta.
6. **Cinta:** banderín de cola de golondrina de y 88 a 108, de x 4 a 124 (sobresale un poco del marco). Relleno
   sólido `ribbon`, texto blanco en mayúsculas, peso 800.
7. **Adornos (solo 128 px):** banda de texto arriba, puntos de nivel, facetas de diamante, pestaña «LIGA» en las del
   creador o la marquita «Dúo» de MatchMate en las oficiales.

| Forma (`BadgeShape`) | Nombre | Categoría | Geometría (caja de 128) | Cinta |
|---|---|---|---|---|
| `hex` | Hexágono | Hitos, bienvenida, mejora personal | Hexágono con punta arriba, radio 60, esquinas redondeadas 6 | Opcional (los hitos llevan puntos de nivel) |
| `shield` | Escudo | Podios, temporada, torneo | `M64 4 L116 18 V58 C116 94 92 114 64 124 C36 114 12 94 12 58 V18 Z` | Siempre (`TEMP 2026`, `TORNEO`) |
| `circle` | Círculo | Constancia, rachas, asistencia | r 60; el marco lleva hasta 12 muescas que muestran el largo de la racha | Cuenta de la racha (`×10`) |
| `star` | Estrella (sello de 12 puntas) | Marcas | Sol de 12 puntas (exterior 62, interior 54), campo redondo r 44, estrellita de 5 puntas arriba a 128 px | Opcional |
| `medal` | Medalla con cinta | Mensual | Disco r 46 en (64, 74) con dos cintas al cuello: color de cinta del nivel con una raya del color del deporte | Mes (`OCT 2026`) |
| `medal_laurel` | Medalla con laurel | Anual | `medal` más dos ramas de laurel (5 hojas cada una) en la mitad de abajo, en el `lo` del nivel | Año (`2026`) |
| `square` | Cuadrado redondeado | Comunidad y juego limpio | Rect 8,8 a 120,120, rx 26 (la misma proporción del ícono de la app, `DUO_RX` 112/512) | Opcional |

### 4.3 Paletas por nivel (modo claro y oscuro)

Contraste medido contra las superficies de la app (`src/index.css`): claro `#ffffff`, `#f4f5f8`, `#eef0f4`;
oscuro `#161922`, `#0d0f15`, `#1e222d`.

| Nivel | `hi` | `mid` | `lo` | Borde claro `rimL` (peor contraste) | Borde oscuro `rimD` (peor contraste) | Cinta `ribbon` | Blanco sobre la cinta | Adorno | Meta al año |
|---|---|---|---|---|---|---|---|---|---|
| Bronce | `#F3C9A1` | `#C27C44` | `#8A4B22` | `#7A4019` (7.15) | `#E9B084` (8.33) | `#6E3812` | 9.39 | 1 punto | 40–60 % |
| Plata | `#F5F7FA` | `#B7C0CB` | `#768291` | `#5B6675` (5.11) | `#D5DCE5` (11.50) | `#475262` | 7.92 | 2 puntos | 15–30 % |
| Oro | `#FFE8A0` | `#E2B03A` | `#A77412` | `#855A06` (5.32) | `#F6CF63` (10.61) | `#6F4A04` | 7.90 | 3 puntos y 3 tachas en el marco | 5–12 % |
| Platino | `#EFF8F7` | `#A6CEC9` | `#5A8C87` | `#3F6F6A` (4.98) | `#BFE3DE` (11.54) | `#2D5A56` | 7.75 | 4 puntos, bisel doble | 1–4 % |
| Diamante | `#E4F3FF` | `#86C6FF` | `#5A67EE` | `#4338CA` (6.93) | `#A5D8FF` (10.49) | `#312E81` | 11.42 | 5 puntos, 3 facetas `#B197FC` al 35 %, 2 destellos a 128 px | < 1 % |
| Único (sin niveles) | se usa oro | | | | | | | sin puntos | — |

- El degradado del metal es igual en los dos modos; solo cambia el borde, con variables CSS y los mismos selectores
  que `index.css`:

```css
:root {
  --bd-rim-bronce: #7A4019; --bd-rim-plata: #5B6675; --bd-rim-oro: #855A06;
  --bd-rim-platino: #3F6F6A; --bd-rim-diamante: #4338CA;
  --bd-lock-fill: var(--surface-2);   /* #eef0f4 */
  --bd-lock-line: var(--muted);       /* #646b7a: 5.3:1 */
  --bd-glow: color-mix(in srgb, var(--accent) 35%, transparent);   /* acento #4338ca */
  --bd-shadow: drop-shadow(0 1px 1px rgb(0 0 0 / .15));
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bd-rim-bronce: #E9B084; --bd-rim-plata: #D5DCE5; --bd-rim-oro: #F6CF63;
    --bd-rim-platino: #BFE3DE; --bd-rim-diamante: #A5D8FF;
    --bd-shadow: none;                /* el borde claro hace el trabajo; --surface-2 #1e222d, --muted #9aa1b0 (6.1:1), acento #8b8cf6 */
  }
}
:root[data-theme="dark"] { /* los mismos valores oscuros */ }
```

- **Las tarjetas para compartir son siempre claras** (la misma regla de `share/palette.ts`) y usan `rimL`.
- **Emblema blanco sobre el campo:** 4.5:1 o más en todos los deportes; el peor es tenis `#4d7c0f` con 4.99.
- **Colores de liga y colores libres** (solo en el creador): `badgePaletteFrom(hex)`, con `tint`, `shade` y
  `readable` de `src/lib/theme.ts:64` y `share/palette.ts:56-90`: `hi = tint(c, .6)`, `mid = c`, `lo = shade(c,
  .35)`; `field` = el color oscurecido hasta que el blanco dé 4.5:1; `ribbon` = oscurecido hasta 7:1; `rimL` =
  oscurecido hasta 3:1 contra `#eef0f4`; `rimD` = aclarado hasta 3:1 contra `#1e222d`. Ejemplos: `#facc15` da campo
  `#8a700c` y cinta `#645208`; `#22d3ee` da campo `#147f8f` y cinta `#0f5f6b`. Si hubo que cambiarlo, el editor dice
  «Ajustamos el tono para que se lea bien».

### 4.4 Campo y emblema por deporte

| Deporte | Campo (`SPORT_COLORS`, share/palette.ts:25-35) | Ícono de hoy en el registro | Emblema de la insignia |
|---|---|---|---|
| Boliche | `#4338ca` | `CircleDot` (muy genérico) | **Glifo nuevo:** pino y bola, en la grilla de 24 con trazo 2, como `TennisBall` (registry.ts:176-189) |
| Pádel | `#0f766e` | `Grid2x2` | **Glifo nuevo:** pala de pádel con huecos |
| Tenis | `#4d7c0f` | `TennisBall` | el mismo |
| Pickleball | `#0369a1` | `CircleDashed` | **Glifo nuevo:** paleta y pelota con huecos |
| Baloncesto | `#c2410c` | `Basketball` | el mismo |
| Fútbol | `#15803d` | `Goal` | **Glifo nuevo:** balón con pentágonos |
| Sala | `#1d4ed8` | `Goal` | el mismo balón (el color de campo los separa) |
| Golf | `#065f46` | `LandPlot` | `flag-triangle-right` más la elipse del hoyo (compuesto nuevo) |
| Natación | `#0e7490` | `Waves` | `waves-ladder` |
| Varios deportes o cuenta | `#4338ca` (marca) | — | según la categoría: `trophy`, `flame`, `calendar-check`, `footprints`, `infinity`, `handshake`… |

Los glifos viven en `src/components/badges/icons.ts` como arreglos de nodos en formato lucide (se copian de
`lucide-react` 1.47, licencia ISC; no se importan rutas internas porque `__iconData` no se reexporta). React los
pinta como `<g>` y el canvas los convierte a `Path2D`.

### 4.5 Cinta de periodo

| Periodo | Forma larga (≤ 10 letras, 128 px) | Forma corta (≤ 7 letras, 64 px) |
|---|---|---|
| Mes | `OCT 2026` | `OCT 26` |
| Año | `2026` | `2026` |
| Temporada de un año | `TEMP 2026` | `T 2026` |
| Temporada entre dos años | `TEMP 26/27` | `T 26/27` |
| Torneo suelto (`kind='torneo'`) | `OCT 2026` y arriba `TORNEO` | `OCT 26` |
| Racha | `×10` | `×10` |
| Hito de carrera | sin cinta (puntos de nivel) | — |
| Del creador | texto libre ≤ 10, en mayúsculas | la larga si cabe en 7; si no, cinta sin texto |

Meses: ENE FEB MAR ABR MAY JUN JUL AGO SEP OCT NOV DIC, en la `tz` de la liga. La temporada sale de
`league_seasons`. El texto se mide con `estimateWidth` en pruebas y `canvasMeasure` en el teléfono (`scene.ts`,
`paint.ts`): a 64 px la letra es de 20 unidades (10 px reales); siete letras ocupan unas 92 de las 112 unidades.

### 4.6 Tamaños

| Tamaño | Dónde | Qué se pinta | Texto |
|---|---|---|---|
| 24 px | Junto a nombres: fila de destacadas en listas, jugador en la liga, «Título vigente» en la tabla | Borde, marco (3+ px reales), campo, emblema. Sin bisel, brillo ni cinta. | solo `aria-label` |
| 40 px | Avisos, grilla compacta, destacadas del perfil | Añade bisel, brillo y la cinta como franja sin texto | — |
| 64 px | Grilla de insignias: 4 por fila en un teléfono de 375 px (343 / 4 ≈ 85 por celda, con el nombre debajo), fila de vista previa del editor | Añade puntos de nivel (r 4.5) y la cinta corta | nombre y progreso debajo, en HTML |
| 128 px | Detalle, aviso de desbloqueo, vista grande del editor | Todo | sí |
| 240 lógicos | Tarjeta para compartir | Como 128, más grande | sí |

Cada tamaño tiene su propio nivel de detalle (no es solo escalar). Trazo mínimo: 1.5 px reales. Accesibilidad:
`<svg role="img"><title>Constancia, oro, octubre 2026</title>` cuando va sola; `aria-hidden` cuando el nombre está
escrito al lado.

### 4.7 Estados

| Estado | Cómo se ve | Quién lo ve |
|---|---|---|
| `locked` (bloqueada) | Silueta: relleno `--bd-lock-fill`, trazo `--bd-lock-line` de 1.5 px, emblema en `--muted`, sin metal ni cinta, candadito (`lock`) desde 40 px | **Solo el dueño de la cuenta** |
| `progress` | `locked` más un arco de progreso por fuera en `--accent` (3 px a 64), desde las 12 en sentido del reloj. Debajo: «Vas 7 de 10» o «Te faltan 3 juegos» | Solo el dueño |
| `unlocked` | La insignia completa | Quien ve la liga o el perfil, según las reglas sociales |
| `new` | `unlocked` más un anillo fijo `--bd-glow` y un punto «Nueva» por 7 días o hasta abrirla | El dueño |
| `review` (en revisión) | `unlocked` con opacidad 60 % y un reloj (`hourglass`) | Solo el dueño |
| Con niveles | Se muestra el nivel más alto; el detalle lista cuándo llegó cada uno y «Te faltan 12 para oro» | Historial: el dueño. Nivel actual: todos |
| `hidden` | El dueño la ocultó; a él le sale atenuada con `eye-off` | El dueño y los admins de la liga |
| Retirada | Desaparece. Si el dueño ya la había visto, en su lista sale una línea discreta: «Se retiró {nombre}» | El dueño |

### 4.8 Animación de desbloqueo

Unos 1.3 s, CSS puro sobre los grupos del SVG con `animation-fill-mode: both`; el último fotograma es el estado en
reposo, así la regla global de movimiento reducido (`index.css:273-281`) cae sola en el final.

| t (ms) | Capa | Efecto |
|---|---|---|
| 0–250 | toda (aún bloqueada) | escala 1 → 0.92 (preparación) |
| 250–650 | bloqueada → desbloqueada | fundido cruzado; escala 0.92 → 1.10 → 1 con `cubic-bezier(.34,1.56,.64,1)` |
| 450–1050 | brillo | banda blanca a 30° (opacidad .55) de izquierda a derecha, recortada con el `clipPath` de la forma |
| 650–950 | cinta | se despliega desde el centro, `scaleX` 0 → 1 |
| 600–1300 | partículas | 10 puntos en colores del nivel que salen y se apagan (diamante: 14 y 2 destellos) |
| 650 | teléfono | `navigator.vibrate?.([12, 40, 18])`, solo con movimiento permitido y la página visible |

Con `prefers-reduced-motion: reduce` (con `matchMedia`, como `ui.tsx:204`) o `document.hidden`: solo un fundido de
200 ms, sin escala, brillo ni partículas, sin vibrar.

### 4.9 Tarjeta para compartir

- Tipo nuevo `ShareBadgeSpec` en `share/cards.ts`: 540 × 675 lógicos, PNG de 1080 × 1350 (4:5, sirve para WhatsApp
  e Instagram).
- **Cambios en la escena:** nodo `path` nuevo `{t:'path', d, fill: string | {stops, x1, y1, x2, y2}, stroke?,
  width?, x, y, scale}`. `paint.ts` lo pinta con `new Path2D(d)` y `ctx.createLinearGradient` (añadir los dos a
  `Ctx2D`); `svg.ts` emite `<path>` y `<linearGradient>`. Los caminos usan solo M, L, C, A y Z; los nodos de íconos
  (círculo, rect, línea, polilínea) se convierten a camino una vez. Sin `Path2D`: tarjeta solo de texto.

| y (lógico) | Contenido |
|---|---|
| 0–72 | Banda del color del deporte, logo Dúo, «MatchMate · Boliche» |
| 96–336 | La insignia a 240, centrada |
| 380 | Nombre, 30/800, `INK.text` |
| 410 | «Oro · Octubre 2026», 16/700, en el color `ribbon` del nivel (7.75:1 o más sobre blanco) |
| 440–480 | Descripción, 16/500, `INK.muted`, máximo 2 líneas |
| 520 | Jugador, 20/700; liga, 14/500 |
| 560 | Oficial: «Solo el 4 % de los jugadores de boliche la tiene» (si hay rareza). Del creador: «Otorgada por Liga Los Pinos · 12 oct 2026» (siempre) |
| 620 | `linkLabel()` de `/u/<id>`, o de la página del jugador en la liga si no tiene cuenta |

- Texto para compartir: «¡Me gané «Constancia» (oro) en MatchMate! <enlace>».
- Comparte el dueño. Un admin también puede compartir una insignia de su liga (por ejemplo para anunciar campeones en
  el grupo) con una tarjeta que dice «Liga X premió a …». La nota del creador nunca sale en la tarjeta. No existe en
  ligas con menores.

### 4.10 Archivos y tipos

| Archivo nuevo | Contenido |
|---|---|
| `src/components/badges/geometry.ts` | `SHAPES` (camino exterior, campo, cinta y caja del emblema por forma), puntos, laurel, facetas. `badgeModel(look, state, size) → BadgeNode[]`, sin React ni DOM |
| `src/components/badges/palette.ts` | `TIERS`, `badgePaletteFrom(hex)`, `periodLabel(period, 'short' \| 'long')` |
| `src/components/badges/icons.ts` | Nodos curados, `SPORT_EMBLEM`, `iconToPath(node)`, etiquetas en español para buscar |
| `src/components/badges/text.ts` | Filtro de texto del lado del cliente (§5.7) |
| `src/components/badges/Insignia.tsx` | `<Insignia look size={24 \| 40 \| 64 \| 128} state="on \| off \| new \| review" progress={0..1} label animate />` |
| `src/components/badges/BadgeDefs.tsx` | Un `<svg><defs>` oculto montado en `Shell` con los 5 degradados de nivel, el de bloqueada y 7 `clipPath`; las insignias usan `url(#mm-tier-oro)`. Solo los colores de liga añaden sus propios `defs` con `useId` |
| `src/components/badges/UnlockModal.tsx`, `BadgeSheet.tsx`, `BadgeGrid.tsx`, `BadgeShelf.tsx` | Pantallas (§6) |
| `src/components/share/badge.ts` | `badgeShare()` → `ShareBadgeSpec` |
| `src/pages/superadmin/BadgesGallery.tsx` | `/superadmin/insignias` (como `/superadmin/marca`, App.tsx:137): toda forma × nivel × tamaño × estado, en claro y oscuro |
| `src/badges/look.ts` | `lookOf(award, def, league?) → BadgeLook` (une catálogo y visual) |

```ts
type BadgeShape = 'hex' | 'shield' | 'circle' | 'star' | 'medal' | 'medal_laurel' | 'square';
type BadgeTier = 'bronce' | 'plata' | 'oro' | 'platino' | 'diamante';
interface BadgeLook {
  shape: BadgeShape;
  tier: BadgeTier | { custom: string };   // metal o color de liga
  field: string;                          // sportColor(sport), marca o color ajustado
  icon: BadgeIconKey;
  top?: string;                           // ≤ 14, solo a 128 px
  period?: { short: string; long: string } | null;
  pips?: 0 | 1 | 2 | 3 | 4 | 5;
  origin: 'app' | 'liga';                 // marquita Dúo o pestaña «LIGA»
}
```

**Pruebas** (al estilo de `palette.test.ts` y `render.test.ts`): contraste de todo par nivel × deporte (cinta ≥ 7,
emblema ≥ 4.5, bisel ≥ 3, borde ≥ 3 en los dos temas); la geometría no sale de 0–128; el texto cabe a 64 y 128;
PNG de la galería con resvg; el generador de colores probado con 500 colores al azar.

---

## 5. Creador de insignias

Las insignias de liga las diseña y las da una persona. **Nunca cuentan** para las oficiales, la rareza, los rankings
ni el total del perfil; siempre dicen de qué liga son.

### 5.1 Permisos

- **Ajuste de la liga `leagues.badge_makers`** (solo el owner): «¿Quién diseña y da insignias?»
  - `owner`: «Solo yo»
  - `admins`: «Yo y los admins» (por defecto)
  - `chosen`: «Yo y los que yo elija»
- **Por miembro, `league_members.badge_maker`** («Diseña insignias»): lo prende el owner en Miembros, al lado de
  «Hacer anotador» (`AdminPage.tsx:318`), con el ícono `Palette` y la etiqueta `Badge tone="accent"` «Diseña
  insignias». Confirmación: «Podrá crear las insignias de la liga y darlas. Solo tú puedes quitarlas.»

| Acción | owner | admin | miembro con `badge_maker` | miembro | superadmin |
|---|---|---|---|---|---|
| Cambiar la política o el permiso de un miembro | sí | — | — | — | sí |
| Crear, editar o archivar diseños | sí | con `admins` | con `chosen` | — | sí |
| Dar | sí | con `admins` | con `chosen` | — | sí |
| Darse a sí mismo (a su propio jugador) | **nunca** (lo da otra persona con permiso) | nunca | nunca | — | nunca |
| Deshacer lo que dio, en 24 h | sí | sí | sí | — | sí |
| Retirar cualquier otorgamiento | sí | — | — | — | sí |
| Ocultar o mostrar lo propio | dueño | dueño | dueño | dueño | sí |
| Reportar un diseño | sí | sí | sí | sí | — |
| Esconder un diseño (moderación, en `admin_audit`) | — | — | — | — | sí |

```sql
create function private.can_badges(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_owner(p_league) or exists (
    select 1 from public.league_members m join public.leagues l on l.id = m.league_id
     where m.league_id = p_league and m.user_id = (select auth.uid())
       and ((l.badge_makers = 'admins' and m.role = 'admin') or (l.badge_makers = 'chosen' and m.badge_maker)))
$$;
```

### 5.2 Modelo de datos

```sql
alter table public.leagues add column badge_makers text not null default 'admins'
  check (badge_makers in ('owner', 'admins', 'chosen'));
alter table public.league_members add column badge_maker boolean not null default false;

create table public.league_badges (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  template text check (template ~ '^[a-z_]{1,32}$'),
  name text not null check (char_length(name) between 3 and 28),
  description text not null default '' check (char_length(description) <= 140),
  shape text not null check (shape in ('hex', 'shield', 'circle', 'star', 'medal', 'medal_laurel', 'square')),
  palette text not null check (palette in ('bronce', 'plata', 'oro', 'platino', 'diamante', 'liga', 'color')),
  color text check (color ~ '^#[0-9a-f]{6}$'),
  icon text not null check (icon ~ '^[a-z0-9-]{1,32}$'),          -- la RPC lo compara con la lista curada
  top_text text not null default '' check (char_length(top_text) <= 14),
  period_text text not null default '' check (char_length(period_text) <= 10),
  limit_kind text not null default 'abierta' check (limit_kind in ('unica', 'selecta', 'abierta')),
  by_team boolean not null default false,                          -- equipos y parejas: el cupo cuenta equipos
  status text not null default 'activa' check (status in ('activa', 'archivada', 'oculta')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((palette = 'color') = (color is not null)),
  unique (id, league_id)
);

create table public.league_badge_awards (
  id uuid primary key default gen_random_uuid(),
  badge_id uuid not null,
  league_id uuid not null references public.leagues (id) on delete cascade,
  player_id uuid not null,
  team_id uuid references public.teams (id) on delete set null,
  period text not null default '' check (char_length(period) <= 10),
  division text not null default '' check (char_length(division) <= 16),      -- «Cat. A», «Femenino»
  note text not null default '' check (char_length(note) <= 140),
  awarded_by uuid references public.profiles (id) on delete set null,
  awarded_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  revoke_reason text check (char_length(revoke_reason) <= 140),                -- privado: owner y admins
  hidden boolean not null default false,
  seen_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (badge_id, league_id) references public.league_badges (id, league_id),   -- NO ACTION: borrar la liga cascadea limpio
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade
);
create unique index league_badge_awards_once
  on public.league_badge_awards (badge_id, player_id, period, division) where revoked_at is null;
create index league_badge_awards_sync_idx on public.league_badge_awards (league_id, updated_at);
create index league_badge_awards_player_idx on public.league_badge_awards (player_id);
create index league_badges_sync_idx on public.league_badges (league_id, updated_at);
create table private.badge_reports (badge_id uuid, award_id uuid, user_id uuid, reason text,
                                    created_at timestamptz default now());
create table private.blocked_terms (term text primary key);   -- normalizado; se maneja en la consola del superadmin
```

- **RLS:** `league_badges`: `league_id in readable_leagues()` y (`status <> 'oculta'` o superadmin).
  `league_badge_awards`: `league_id in readable_leagues()` y (`revoked_at is null` y (no oculta, o es el dueño, o es
  admin)), o es admin (auditoría).
- **`merge_players`:** mueve `league_badge_awards.player_id`; si chocan (`badge_id`, `period`, `division`), se queda
  el más viejo y el otro se revoca con motivo `'fusión'`.
- Triggers de tombstone en las dos tablas.

### 5.3 RPC

| RPC | Quién | Qué revisa |
|---|---|---|
| `set_badge_policy(p_league, p_policy)` | owner | valor permitido |
| `set_member_badge_maker(p_league, p_user, p_on)` | owner | que el miembro exista; como `set_member_scorer` (rpc:430) |
| `save_league_badge(p_league, p_id, p_design jsonb)` | `can_badges` | largos, caracteres permitidos, `private.badge_text_ok`, ícono de la lista curada. Máximo **30 activos y 100 en total** por liga. **Un diseño con otorgamientos queda bloqueado:** solo cambian `description` y `status` (para más, «Duplicar»). 20 guardados por hora por cuenta. |
| `archive_league_badge(p_id, p_archived)` | `can_badges` | — |
| `delete_league_badge(p_id)` | `can_badges` | solo si nunca se dio; deja tombstone |
| `award_league_badge(p_badge, p_players uuid[], p_team, p_period, p_division, p_note, p_notify)` | `can_badges` | ver abajo |
| `revoke_league_badge_award(p_award, p_reason)` | owner o superadmin; quien la dio, en 24 h | `revoked_at`, `revoked_by`; sin push |
| `set_league_badge_hidden(p_award, p_hidden)` | el dueño (`players.user_id = uid`) | — |
| `mark_league_badges_seen(p_ids uuid[])` | el dueño | hasta 50 |
| `report_league_badge(p_badge, p_reason)` | miembro | 5 por día por cuenta |
| `hide_league_badge(p_id, p_hidden, p_note)` | superadmin | escribe en `admin_audit` |

`award_league_badge` revisa: el diseño está `activa`; los jugadores son de la liga; **el jugador de quien da no está
entre ellos** (`private.my_player`, rls:40) → «No puedes darte insignias a ti mismo. Pídele a otro admin o al
dueño.»; el cupo (§5.7); 15 otorgamientos activos por jugador, liga y año; 60 por liga en 30 días corridos; 60 por
cuenta por hora. Con `p_notify`, inserta en `push_outbox` para cada jugador con cuenta (`tag = 'insignia:<id>'`).

### 5.4 Editor («Admin → Insignias → Nueva insignia»)

`Modal` a pantalla completa en el teléfono. Arriba, la vista previa: la insignia a 128 px **sobre una tarjeta clara y
una oscura lado a lado**, y una fila a 24, 40 y 64 px. Se actualiza con cada letra.

| Campo | Control | Texto |
|---|---|---|
| Plantilla | chips (§5.5), opcional | «Empieza con una plantilla» |
| Nombre | 3–28 letras | «Nombre (sale debajo de la insignia)» |
| Forma | 7 chips con el contorno | «Forma» |
| Color | 5 metales, «Color de la liga», «Otro color» (los 8 `ACCENT_PRESETS` más un campo hex) | «Color» · «Ajustamos el tono para que se lea bien» |
| Ícono | grilla de 52 con pestañas y búsqueda | «Ícono» · «Busca: trofeo, fuego, cigua…» |
| Texto de arriba | ≤ 14, en mayúsculas solo | «Texto de arriba (opcional, solo en grande)» |
| Texto de abajo | chips «Temporada» (`TEMP 2026`), «Año», «Mes», «Torneo», «Sin periodo», o libre ≤ 10 | «Periodo o texto de abajo» |
| Cupo | `unica` / `selecta` / `abierta`, con explicación | «Única: solo 1 por periodo · Selecta: hasta 3 · Abierta: hasta 20» |
| Por equipo | interruptor, solo en deportes de equipo y parejas | «Se da al equipo o la pareja completa (cuenta como 1)» |
| Descripción | ≤ 140 | «¿Qué hay que hacer para ganarla?» |

Botón «Guardar diseño». Después del primer otorgamiento: «Esta insignia ya se dio: solo puedes cambiar la
descripción. Duplícala para hacer otra versión.»

**Íconos curados (52; los de lucide están todos en lucide-react 1.47):**

| Pestaña | Íconos |
|---|---|
| Deporte | los 8 glifos de §4.4 (fútbol y sala comparten balón), `whistle`, `timer`, `target`, `goal`, `flag-triangle-right` |
| Premios | `trophy`, `medal`, `award`, `crown`, `star`, `gem`, `ribbon`, `badge-check`, `sparkles` |
| Esfuerzo | `flame`, `zap`, `trending-up`, `rocket`, `mountain`, `footprints`, `crosshair`, `hourglass`, `repeat`, `infinity`, `calendar-check` |
| Comunidad | `handshake`, `heart-handshake`, `hand-heart`, `users-round`, `smile`, `thumbs-up`, `megaphone`, `party-popper`, `cake`, `gift` |
| Nuestra tierra | `sun`, `sunrise`, `tree-palm`, `waves`, `sprout`, `bird` (cigua palmera), `shell`, `anchor`, `moon-star` |

Fuera: el logo Dúo (es de las oficiales), letras y números, dinero y banderas de otros países. Cada ícono tiene
etiquetas para buscar, por ejemplo `bird: ["ave", "cigua", "pájaro"]`.

### 5.5 Plantillas

El nivel de cada plantilla es fijo. «Sugerencia» es solo una pista que calcula el teléfono con los datos de la liga;
**siempre decide una persona** («La app sugiere; la liga decide»). Las sugerencias usan las mismas fuentes que las
oficiales, pero sin los mínimos de liga real: sirven justo en ligas pequeñas donde las oficiales no se dan.

| key | Nombre | Lo que lee el jugador | Deportes | Forma e ícono | Paleta y cupo | Periodo | Sugerencia |
|---|---|---|---|---|---|---|---|
| `champion` | Campeón (la liga puede cambiarlo, por ejemplo a «Campeona») | «Terminaste de primero en la temporada. ¡El título es tuyo!» | todos (equipo o pareja: `by_team`) | `shield`, `trophy` | oro · Única por periodo y división | TEMP (torneo: `OCT 2026`) | Boliche: primero por `individualValue` con 6+ juegos contados (`MIN_RANK_GAMES`), división por `category_cuts`. Torneo de raqueta: ganador de `<catId>-R<rounds>-1`. Liga de raqueta: primero en `racketStandings` o `pickleballStandings`. Equipos: ganador de `R<n>-1` o primero en `standings.ts`. Golf: primero en `golfLeaderboard` u `orderOfMerit`. Natación: más puntos de `swim_meets.points`. Escalera: puesto 1. Cajas: cima de la caja 1. |
| `runner_up` | Subcampeón | «Segundo en la temporada. ¡Ahí mismito!» | todos | `shield`, `medal` | plata · Única | TEMP | Segundo en las mismas tablas, o quien perdió la final |
| `third_place` | Tercer lugar | «Te subiste al podio: tercero en la temporada.» | todos | `shield`, `award` | bronce · Selecta (2 si no hubo partido por el 3.º) | TEMP | Ganador de `<catId>-P3`, o los dos perdedores de semifinal |
| `mvp` | MVP de la temporada | «Lo más valioso de la temporada, según tu liga.» | todos | `star`, `crown` | oro · Única | TEMP | **No hay MVP guardado.** Pista: baloncesto, puntos por partido (`basketballTotals`); fútbol y sala, goles + asistencias (`footballTotals`). Los demás: «Decide la liga». |
| `best_average` | Por deporte: «Mejor promedio» (boliche), «Mejor promedio neto» (golf), «Más puntos» (baloncesto), «Más goles» (fútbol y sala), «Mejor récord» (raqueta), «Más puntos» (natación) | «Nadie tuvo mejor {promedio/récord/goles} que tú esta temporada.» | todos | `star`, `target` | platino · Única | TEMP | Boliche: mejor promedio de `playerStats` con 6+ juegos y 50 %+ de los eventos. Golf: menor neto medio en 4+ rondas firmadas de 18 hoyos. Baloncesto: puntos por partido en 50 %+ de los partidos del equipo. Fútbol y sala: goles, desempate por partido. Raqueta: % de victorias en 8+ partidos confirmados por el rival. Natación: puntos. |
| `most_improved` | Gran progreso | «Nadie subió tanto su nivel como tú esta temporada. ¡Se nota el trabajo!» | todos (equipos: decide la liga) | `hex`, `trending-up` | oro · Única | TEMP | Las métricas de `season_most_improved` (§2.11) sin sus mínimos de liga. Mide el cambio, no el nivel. |
| `fair_play` | Juego limpio | «Respeto, buena vibra y cero lío. Así se juega.» | todos | `square`, `handshake` | platino · Selecta (3) | TEMP | Fútbol y sala: 0 rojas, ≤ 1 amarilla, sin `football_sanctions`, 50 %+ de los partidos. Baloncesto: menos faltas por partido. Raqueta: sin reclamos de su lado ni W.O. en contra. Boliche, golf y natación: decide la liga. |
| `perfect_attendance` | Asistencia perfecta | «No faltaste ni una vez en toda la temporada.» | todos | `circle`, `calendar-check` | oro · Abierta (20) | TEMP | Participación real (§1.7.2) en el 100 % de las fechas de su lado; en boliche el admin elige si cuentan las prácticas. **No se usan los «voy»** (son intención). |
| `rookie_of_the_year` | Revelación del año | «Tu primera temporada y ya dejaste tu marca.» | todos | `hex`, `sprout` | oro · Única | TEMP | Su primera participación contada en la liga cae en la temporada, sin participación anterior del mismo deporte en otras ligas si tiene cuenta, y 50 %+ de las fechas. Se ordena por `best_average`. |
| `player_of_the_month` | Estrella del mes | «Lo mejor del mes en tu liga.» | todos | `medal`, `flame` | plata · Única | `OCT 2026` | La medida de `best_average` dentro del mes, con 4+ juegos o partidos, o 2+ rondas o encuentros |
| `helping_hand_league` | Mano amiga | «Gracias por ayudar a que la liga funcione.» | todos | `square`, `hand-heart` | bronce · Abierta (20) | TEMP | Días de servicio (`table_crew`, §2.12) sin contar al owner |

En ligas `kind='torneo'` solo se ofrecen `champion`, `runner_up`, `third_place`, `mvp` y `fair_play`.

### 5.6 Dar una insignia («Dar insignia»)

1. **«¿A quién?»** Búsqueda en la lista de jugadores (con la etiqueta «Sin cuenta» donde aplique). Con `by_team`, se
   elige un equipo de temporada y su plantilla sale marcada (se pueden desmarcar los que no jugaron). Arriba,
   **«Sugerencias de la app»**: los 3 primeros con los números («Promedio 187 · 24 juegos»), calculados en el
   teléfono con §5.5. Al pie: «La app sugiere; la liga decide.»
2. **Periodo, división y nota.** El periodo toma el texto del diseño o la temporada de la liga; la división es
   opcional. Nota ≤ 140: «Nota para el jugador (opcional): “Por tu 279 en la final”». Interruptor «Avisarle» (push,
   solo si tiene cuenta).
3. **«Así la verá»:** vista previa a 128 px sobre la tarjeta del jugador, y el botón «Dar insignia».
4. **Aviso:** «Listo: Ana tiene “Campeón · TEMP 2026”», con «Deshacer» (revoca; sirve 24 h).

Push al jugador: título «¡Tienes una insignia nueva!», cuerpo «Liga Los Pinos te dio “Campeón · TEMP 2026”. Tócala
para verla.»

Errores: «“Campeón” es Única: ya se la diste a Ana en TEMP 2026.» · «Llegaste a 30 insignias activas. Archiva una
para crear otra.» · «Ese texto no se puede usar.» (nunca repite la palabra bloqueada).

Retirar (owner, desde el detalle → quién la tiene → «Quitar»): «¿Quitarle “MVP” a Pedro?» / «Se le quita de su
perfil. No se le manda notificación.», con motivo privado opcional.

### 5.7 Límites y moderación

| Límite | Valor |
|---|---|
| Diseños activos por liga | 30 (100 contando archivados) |
| Guardados de diseño | 20 por hora por cuenta |
| Cupo por insignia, periodo y división (con `by_team`, un equipo cuenta 1) | Única 1 · Selecta 3 · Abierta 20, y nunca más que los jugadores de la liga |
| Plantilla para un otorgamiento por equipo | ≤ 30 jugadores |
| Otorgamientos por liga | 60 en 30 días corridos |
| Otorgamientos por cuenta | 60 por hora |
| Otorgamientos activos por jugador, liga y año | 15 |
| Darse a sí mismo | nunca |
| Deshacer quien la dio | 24 h; después, solo el owner |
| Editar después del primer otorgamiento | solo descripción y estado |
| Borrar un diseño | solo si nunca se dio; si no, archivar |
| Reportes | 5 por día por cuenta; van a la cola de la consola del superadmin |
| Sale en el perfil público | solo si la liga pasa `private.league_badges_public(league)`: `social_league_ok`, 6+ cuentas miembro no bloqueadas y 14+ días de creada |
| Largos | nombre 3–28 · arriba ≤ 14 · abajo ≤ 10 · descripción ≤ 140 · nota ≤ 140 · división ≤ 16 · motivo ≤ 140 |
| Caracteres | letras con áéíóúüñ, números, espacio y `. , : ; ! ¡ ? ¿ ' " & # / ( ) + -`. **Sin emoji** (así canvas y SVG pintan igual) |
| Bloqueado | URL, correo o `@` (`http`, `www.`, `.com`, `.do`); 7+ dígitos (teléfonos); el mismo carácter 4+ veces; palabras de `private.blocked_terms` después de normalizar (minúsculas, sin tildes, leetspeak `0→o 1→i 3→e 4→a 5→s @→a`, sin separadores). `src/components/badges/text.ts` da la respuesta al instante en el teléfono; `private.badge_text_ok` decide |
| Cuentas bloqueadas | `require_uid` ya las rechaza (cons:127) |

**Cambios en funciones existentes:** `remove_member` (rpc:458) añade `badge_maker` a los permisos que impiden que un
admin saque a alguien (hoy «ni admin ni anotador»), y se ajusta el texto en `AdminPage.tsx`; `set_member_role` y
`step_down_admin` no cambian (el permiso sale de la política); `memberships` y las cargas de membresía incluyen
`badge_maker` y `leagues.badge_makers` para mostrar u ocultar la pestaña; `export_my_data` encuentra
`league_badge_awards` solo.

### 5.8 Por qué no se puede abusar

- No suman a nada oficial: ni rareza, ni rankings, ni el total del perfil. Siempre dicen «Liga X» y llevan la
  pestaña «LIGA».
- Una liga falsa (menos de 6 cuentas o menos de 14 días) puede dar insignias, pero solo se ven dentro de la liga.
- Nadie se las da a sí mismo, así que el dueño de una liga de uno no puede fabricarse un «Campeón». Tampoco dándoselo
  a un jugador sin cuenta que después reclama (su reclamo se aprueba al instante), vincula o junta con el suyo: al
  quedar el jugador con esa cuenta, lo que ella le dio se retira y los avales que ella le confirmó vuelven a revisión.
- Los cupos los pone el servidor, no son solo etiquetas: periodo y división se comparan sin mayúsculas, tildes ni
  signos («Temp 2026.» es «TEMP 2026»).
- La lista de palabras bloqueadas trae una base desde el primer día.
- Un diseño bloqueado no se puede cambiar después de darlo (no se puede dar «Campeón» y renombrarlo a un insulto).
- Filtro de texto, reportes y escondite por el superadmin con registro.
- Quien la recibe siempre la puede ocultar.

---

## 6. Pantallas

### 6.1 Perfil (`/u/:userId`): la vitrina

- **Pestaña nueva «Insignias»** (ícono `Award`) al lado de Juegos y Estadísticas (`ProfileView.tsx:160-167`). Se
  abre con `?tab=insignias` (lo usan los push).
- **Destacadas:** hasta 3 insignias a 40 px debajo del nombre (`profiles.featured_badges`). Si el dueño no eligió
  ninguna, él ve «Elige hasta 3 para mostrar aquí»; los demás no ven nada.
- **Contador:** «{24} insignias»: solo las oficiales, desbloqueadas y visibles (nunca las de liga).
- **Filtros:** chips «Todas», uno por cada deporte que juega la cuenta, y «Cuenta» (las de varios deportes).
- **Secciones:**
  1. **«Próximas»** (solo el dueño): las 3 bloqueadas más cerca de su siguiente nivel según `badge_progress`, a 64 px
     con el arco de progreso y «Te faltan 3 juegos».
  2. **«MatchMate»:** las oficiales, por deporte y luego por categoría (Resultados, Marcas, Hitos, Constancia,
     Asistencia, Juego limpio, Comunidad), en grilla de 64 px (4 por fila), con el nombre, el nivel y «×N» debajo.
  3. **«De mis ligas»:** las del creador, agrupadas por liga, con la pestaña «LIGA».
- **«Ver bloqueadas»** (solo el dueño): muestra en silueta todas las del catálogo de los deportes que juega, con
  progreso donde lo hay y el criterio en palabras simples al tocarlas. **Nadie más ve bloqueadas ni progreso.**
- **Privadas y ocultas** (solo el dueño): salen atenuadas con «Solo tú la ves · Mostrar».
- **En revisión** (solo el dueño): atenuada con reloj y «Tu liga la está confirmando».
- **Vacío:** los demás ven «Todavía no tiene insignias.»; el dueño, «Juega tu primer {juego} en una liga y te llega
  la primera.»
- Los demás leen con `profile_badges(p_user)`, que aplica las reglas sociales (§3.9).

### 6.2 Liga

- **«Premios de {octubre}»** en la portada de la liga, desde el día 3 y por 7 días: los ganadores de las insignias
  del mes (Figura, Mayor progreso, Racha, Equipo del mes, Bota de oro, Valla menos vencida, Cima de cada caja,
  Número 1) a 40 px, con el nombre y la línea de evidencia («Promedio 187 en 12 juegos»). «Asistencia perfecta: {12}
  jugadores» sale plegada. Si hubo empate múltiple: «Empate múltiple: este mes no hubo {figura}».
- **«Campeones de {TEMP 2026}»** al cerrar la temporada, por 14 días: podio, categorías, mayor progreso,
  revelación, bota de oro y juego limpio.
- **«Insignias de la liga»:** estante con los diseños del creador (64 px) y cuántos la tienen, más los últimos 5
  otorgamientos. Botón «Dar insignia» para quien tiene `can_badges`.
- **Tabla de posiciones:** un escudo de 24 px al lado del campeón de la temporada anterior («Título vigente»).
- **Página del jugador** (`/l/:lid/j/:playerId`): sus insignias de esa liga (ámbito `liga` y, si no tiene cuenta,
  sus copias de respaldo de cuenta) y las del creador. Es la vitrina de los jugadores sin cuenta.
- **Página del evento:** el podio con sus insignias cuando ya se dieron.
- **Ligas con menores:** todo esto solo lo ven los miembros; nada se comparte.

### 6.3 Detalle de una insignia (`BadgeSheet`)

- La insignia a 128 px (la animación solo la primera vez).
- Nombre, nivel («Oro») y descripción con los valores («Tiraste 64 pinos por encima de tu promedio.»).
- **Dónde y cuándo:** liga (enlace), evento o partido (enlace), fecha. Línea de evidencia sacada de `context`
  («Promedio 187 en 12 juegos · base 178»).
- **Rareza:** «La tiene el 7 % de los jugadores de boliche», o «Nueva».
- **Niveles** (solo el dueño): «Bronce · 3 mar 2026», «Plata · 12 ago 2026», «Oro: te faltan 12».
- **Repetibles:** la lista de veces, con fecha y evento.
- **Del creador:** «Otorgada por Liga Los Pinos · 12 oct 2026» y la nota (la ven el dueño y los admins); quién la
  dio (solo admins).
- **Acciones del dueño:** «Compartir», «Destacar en mi perfil» o «Quitar de destacadas», «Ocultar de mi perfil» o
  «Mostrar en mi perfil». Un admin de la liga puede «Compartir» una de su liga para anunciarla. Cualquier miembro
  puede «Reportar» en el menú ⋯.
- **Bloqueada** (solo el dueño): el criterio en palabras simples y el progreso.

### 6.4 Aviso al ganar

- **Modal** «¡Te ganaste una insignia!» (del creador: «Liga Los Pinos te dio una insignia»), con la insignia a 128 px
  y su animación (§4.8), nombre, nivel y descripción, y los botones «Compartir» y «Ver mis insignias». Hasta 5 en
  carrusel; después «y 3 más».
- Lo mueve `seen_at` en el servidor (no `localStorage`), así no se repite en otro teléfono.
- **Se aguanta** mientras están abiertas las pantallas de cancha o marcador en vivo (`src/court/*`) u otro modal.
- **Privada por defecto:** el modal dice «Solo tú la ves. ¿La muestras en tu perfil?» con «Mostrar» y «Dejarla
  privada».
- **En revisión:** no hay modal, solo la línea en la pestaña.
- **Historial:** un solo modal con la lista «Te dimos {n} insignias por tu historial».
- **Resumen del año:** el 7 de enero, `year_recap` abre un resumen: días jugados, deportes, meses activos y la
  insignia más rara del año, con tarjeta para compartir.
- **Push:** §3.6. Al tocarlo abre `/u/<id>?tab=insignias` y el modal.
- **Avisos:** las insignias nuevas salen también en la página de Avisos.

### 6.5 Admin y ajustes de la liga

- **Admin → «Insignias»** (con `can_badges`): diseños activos y archivados, «Nueva insignia», «Dar insignia», quién
  tiene cada una, reportes.
- **«Por confirmar»** (revisores elegibles, §1.7.5): las hazañas en revisión con su evidencia (foto del marcador si
  hay, cuadros o tarjeta y marcadores) y los botones «Confirmar» y «No se pudo confirmar».
- **Miembros:** el interruptor «Diseña insignias» (owner).
- **Ajustes de la liga:**
  - «Insignias automáticas»: «Todas», «Sin títulos» («Recomendado para ligas con menores») o «Ninguna».
  - «¿Quién diseña y da insignias?» (§5.1).
  - «Cerrar temporada» desde `season_end` + 3 días (§3.3).

### 6.6 Superadmin

- `/superadmin/insignias` (`src/pages/superadmin/BadgesSection.tsx`), tres vistas:
  - «Por revisar»: avales de más de 14 días (o sin quién los confirme) con «Confirmar» y «No se pudo confirmar»;
    reportes abiertos y cerrados con «Esconder diseño» (`hide_league_badge`), «Retirar por fraude»
    (`super_revoke_badge`) o «Dejarla» (`admin_resolve_badge_reports`); la lista de palabras bloqueadas
    (`admin_blocked_terms`).
  - «Motor» (`admin_badges_engine`, `admin_badge_jobs`): la cola por tipo, los trabajos fallidos (5+ intentos) con
    «Reintentar» y «Borrar», el historial en seco y de verdad (`badges_backfill`), la corrida en seco contra la rareza
    objetivo, la rareza real (`badge_stats`) y los últimos periodos que corrieron.
  - «Galería» (§4.10).

---

## 7. Plan de implementación

Tres corrientes que pueden avanzar a la vez:
- **A. Motor (TypeScript):** catálogo, reglas, evaluadores, bundle y Edge Function.
- **B. Base de datos:** migraciones y pruebas SQL en PGlite (`npm run test:sql`).
- **C. Visual y pantallas (React).**

Las migraciones que terminan en `_supabase.sql` son solo de Supabase (el cargador de PGlite las salta), como las de
pg_cron que ya existen. **Toda migración que añade una tabla con FK a `players` redefine `merge_players`** y su guardia
del catálogo; la prueba de reclamos lo detecta si se olvida.

| # | Paso | Corriente | Depende de | Estimado |
|---|---|---|---|---|
| 1 | **`20260929001100_insignias.sql`**: `badge_awards`, `badge_progress`, `badge_stats`, `league_seasons`, `leagues.badges_auto` (con el trigger de menores), `profiles.featured_badges`, `unique (id, league_id)` en `players` si falta, RLS, RPC del jugador (§3.9), `close_season`, `set_badges_auto`, `profile_badges`, `merge_players` con las tablas nuevas, tombstones, `memberships`. Pruebas `tests/sql/insignias.test.ts`: aprobar un reclamo con insignias en los dos jugadores, fusionar duplicados, exportar datos, RLS de propias, de liga y de menores. | B | — | 2 días |
| 2 | **Catálogo y reglas comunes:** `src/badges/catalog.ts` con las 100 keys, textos y niveles; actividad válida, días ponderados, LR, validación B/R/T/G/W, juez y parte, líneas base, índice topado, `isSplit`. Pruebas con fixtures. Una prueba verifica que el catálogo suma 197 definiciones y que toda key tiene forma, ícono y texto. | A | — | 2 días |
| 3 | **Núcleo visual:** `geometry`, `palette`, `icons` (5 glifos nuevos), `Insignia`, `BadgeDefs`, galería `/superadmin/insignias`; pruebas de contraste, geometría y PNG con resvg. | C | — | 2–3 días |
| 4 | **Evaluadores por familia** y `evaluate(job, snapshot)`: boliche; raqueta; equipos, baloncesto y fútbol; golf; natación; periodos (mes, año, temporada, cajas, escalera); cuenta y comunidad. | A (en 2 personas: boliche + golf + natación, y raqueta + equipos) | 2 | 4–5 días |
| 5 | **`20260929001110_insignias_motor.sql`**: cola, triggers, `badge_snapshot`, `badge_claim`, `badge_apply`, `badges_daily`, `badge_notices`, `badge_stats_refresh`, `kick_badges`, `cron_badges`, `badges_backfill`; cambios en el cierre de mes de cajas y en `cleanup_old_rows`. Pruebas con un motor falso que devuelve decisiones fijas (idempotencia, reactivar, revocar provisionales, avisos agrupados y horas tranquilas). | B | 1 | 2–3 días |
| 6 | **Edge Function `insignias`** (`index.ts`, `core.ts`, README con los secretos como `send-push`), `scripts/badges/bundle.mjs`, `npm run badges:bundle`, `src/badges/bundle.test.ts`, y **`20260929001190_insignias_cron_supabase.sql`** (`mm-insignias`, `mm-insignias-diario`). | A + B | 4, 5 | 1 día |
| 7 | **Pantallas:** pestaña del perfil y destacadas, detalle, aviso de desbloqueo y animación, `mark_badges_seen`, portada de la liga («Premios del mes», «Campeones»), página del jugador, ajustes (`badges_auto`, «Cerrar temporada»), «Por confirmar», tarjeta para compartir (nodo `path` en `scene`, `paint` y `svg`). | C | 1, 3 | 3 días |
| 8 | **Historial:** corrida en seco sobre una copia de producción → comparar con la rareza objetivo (§1.7.9) y los rendimientos de §2.13 → ajustar umbrales → corrida real con un solo aviso por cuenta. | A + B | 6, 7 | 1 día |
| 9 | **`20260929001120_insignias_creador.sql`**: `league_badges`, `league_badge_awards`, `leagues.badge_makers`, `league_members.badge_maker`, `can_badges`, `badge_text_ok`, `blocked_terms`, `badge_reports`, RPC de §5.3, `league_badges_public`, `remove_member`, `merge_players` con la tabla nueva, `profile_badges` con las de liga, cargas de membresía. Pruebas: cupos, darse a sí mismo, diseño bloqueado, filtro de texto, fusión. | B | 1 | 2 días |
| 10 | **UI del creador:** pestaña «Insignias» de Admin, editor con vista previa, dar insignia con sugerencias, deshacer, retirar, ocultar, permisos en Miembros y Ajustes. | C | 3, 9 | 3–4 días |
| 11 | **Lanzamiento por fases:** boliche primero (es el único deporte `open`); cada deporte `beta` se enciende en el catálogo cuando se abre. Revisar la rareza real a las 2 y a las 6 semanas y ajustar. | todos | 8, 10 | — |

**Estado de la implementación** (worktree `matchmate-insignias`, rama `entrega-insignias`, unida a la entrega 6).
Las migraciones corren después de las de las entregas 1 a 5 (`…1010`): `…1100_insignias.sql` (paso 1),
`…1110_insignias_motor.sql` (paso 5), `…1120_insignias_creador.sql` (paso 9), `…1180_insignias_temporadas.sql` (lo
que depende de `public.seasons`, de la migración de temporadas `…0700`, que trae `close_season` y `season_awards`;
la guarda sigue, pero como `…0700` ya corrió, siempre se aplica) y `…1190_insignias_cron_supabase.sql` (paso 6). Lo
que ya existía sale de su última versión más lo de las insignias: `private.merge_players` envuelve la de `…0700` (con
las pistas de `…0600` y los premios y tablas guardadas de `…0700`; pasa a llamarse `merge_players_base`),
`export_my_data` es la de `20260927001500`, `update_entry` y `remove_member` las de `20260926000500`, la vista
`memberships` la de `20260926000200` y `private.push_category` la de `…0700` con `insignias` e `insignia:` en «Social»
(«Hay una hazaña por confirmar», `insignia-aval:`, llega siempre). Los reportes del creador (`private.badge_reports`,
Consola › Insignias) siguen aparte de los de contenido (`public.reports`, Consola › Reportes); «Descargar mis datos»
los trae en `badgeReports` de `export_my_data` (`private.my_badge_reports`), como `my_reports` trae los otros. Hecho de punta
a punta: pasos 1 a 7, 9 y 10; del 8, la corrida en seco funciona en local (`tests/sql/insignias-funcion.test.ts`) y
se corre desde la consola; falta hacerla sobre la copia de producción y calibrar. Pendiente, a propósito:
- «Empate múltiple: este mes no hubo {figura}» (§6.2): el motor lo detecta (`topWithTies`) pero no hay dónde
  guardarlo para la portada (haría falta una tabla de notas por liga y periodo).
- «Cerrar temporada» en Ajustes (§6.5): es de la migración de temporadas (`close_season`).
- El escudo «Título vigente» sale en la tabla del boliche (`RankingPage`); las tablas de raqueta, equipos y golf
  todavía no lo muestran.
- Partir el historial de una liga grande por año (§3.5) es a mano.

**Tiempo:** uno detrás del otro son unos 22–26 días de trabajo. Con las tres corrientes a la vez (y el paso 4 en dos
personas) son **unos 10–12 días**:

| Tramo | A (motor) | B (base de datos) | C (visual y pantallas) |
|---|---|---|---|
| Días 1–3 | 2 | 1 | 3 |
| Días 4–8 | 4 | 5, luego 9 | 7 |
| Días 9–12 | 6, 8 | 6, 8 | 10 |

Lo que sí va en orden: el paso 1 antes de 5 y 9 (tablas), el 2 antes del 4 (reglas), el 3 antes del 7 y el 10
(componente), y el 6 antes del 8 (hace falta el motor corriendo para el historial).

---

## 8. Decisiones tomadas al unir las propuestas y preguntas abiertas

### 8.1 Decisiones

| Tema | Lo que decían las propuestas | Decisión |
|---|---|---|
| Niveles | 5 metales en una; 3 en otra | 5 metales (bronce a diamante). Solo los hitos largos llegan a platino o diamante. |
| Escala de rareza | Tres escalas distintas | Una sola (§1.7.9): Común 40 %+, Poco común 15–40 %, Rara 5–15 %, Épica 1–5 %, Legendaria < 1 %. Se muestra solo con 50+ cuentas en la base. |
| Liga válida | 4 cuentas en 180 días con retroactivo; «liga real» de 3 meses sin retroactivo; 6 cuentas | LR de 3 meses **sin retroactivo** para todo; «liga con peso» para títulos; 6 cuentas y 14 días solo para mostrar en público las del creador. |
| Retiro | Provisional 7 días; o congelar y que el owner retire | Provisional 7 días para las de resultado; firmes al darse las de periodo; el owner no retira automáticas (corrige el resultado o reporta). |
| Tabla de otorgamientos | `player_badges` y `account_badges` aparte | Una sola `badge_awards` con `player_id` o `user_id` y `league_id` nulo en las de cuenta. |
| Umbrales | `private.badge_rules` en la base; o en código | En el catálogo en código: una sola fuente para la app y el motor. |
| Dónde corre el motor | SQL; o Edge Function con los helpers | TS puro empaquetado para Deno, llamado por pg_cron + pg_net; SQL para colas, avisos, rareza y RLS. |
| Cierre de temporada | `season_end` + 3 días; o + 7 | El admin desde + 3; automático a + 7; con `league_seasons`. |
| Plantilla en equipos | Nunca; o solo para días activos | Solo días activos, debut y kilometraje. |
| Podios | Una key por deporte | `event_podium` (eventos) y `season_podium` (temporadas y torneos sueltos), con oro, plata y bronce. |
| Constancia | `active_months`, `month_streak`, `weekly_streak`, `monthly_regular`, `full_year` | `month_streak` de cuenta, más `monthly_regular` y `full_year` por deporte. |
| Índice de golf topado | 0,96 × media de los mejores 8 | Media de los mejores 8 de 20, como el WHS actual (igual no es oficial). |
| Nombres | Neutros; o «Campeón» | Neutros en las oficiales («Título», «Primer lugar», «Figura»); las plantillas del creador se pueden renombrar («Campeona»). |
| Barrera del 50 libre por sexo | Incluida | Fuera: mostraba tiempos bajos y no sirve para ligas infantiles. |
| Revocación por el owner de automáticas | Permitida 7 días | No: el owner puede ser juez y parte. |

### 8.2 Preguntas para el dueño (con lo que se hace si no hay respuesta)

1. **Fotos para títulos.** En una liga de boliche con `require_photo=false`, ¿los títulos aceptan juegos
   `'sin-foto'` (con la regla de juez y parte)? *Por defecto: sí.* Las marcas altas piden foto siempre.
2. **Plantilla en equipos.** ¿Dar días activos por plantilla cuando no se registra alineación? *Por defecto: sí,
   solo para días activos, debut y kilometraje.* Alternativa: recordar a los admins «Pasa lista».
3. **Hándicap.** ¿«Figura del mes» sigue la regla de la liga o siempre scratch? *Por defecto: la regla de la liga.*
4. **Menores.** ¿Títulos apagados por defecto en ligas con menores? *Por defecto: sí.*
5. **Nombres con género.** ¿Añadir un ajuste en el perfil para «Campeón/Campeona»? *Por defecto: no; nombres
   neutros.*
6. **Política del creador.** ¿Por defecto `admins` o `owner`? *Por defecto: `admins`.*
7. **Cupo «Abierta».** ¿Se queda en 20 o crece con la liga (por ejemplo el 50 % de los activos)? *Por defecto: 20.*
8. **Perfil público de las del creador.** ¿6 cuentas y 14 días es el umbral correcto? *Por defecto: sí.*
9. **Invitaciones personales.** ¿Añadir `league_members.invited_by` y enlace personal para «Buena convocatoria»
   (está en Futuro)? *Por defecto: no en la v1.*
10. **MVP por votación.** ¿Añadir votos de jugadores más adelante? *Por defecto: no; el MVP lo decide la liga con
    el creador.*
