# Esports: el deporte nuevo, sus juegos, equipos, torneos y su lógica

> **Estado:** especificación para implementar en una sola entrega, en paralelo (rama `entrega-esports`, base `82869f8`).
> Producción tiene todas las migraciones hasta `20261007000100`. Esta entrega trae **una** migración (§9):
> `20261008000100_esports.sql` (el deporte, IDs de juego, equipos, torneos, inscripciones, cuadros, battle royale y
> `export_my_data`). No hay bucket nuevo: las capturas de los partidos van a `scoreboards`, como siempre.
> **Cambio del 2026-10-08 (D24):** la comprobación del ID solo existe donde es automática (login de Epic o Steam,
> búsqueda de Riot); no hay reclamos, códigos de prueba ni capturas de ID o de rango.
> Las migraciones aplicadas no se tocan: lo que cambia de ellas se redefine con `create or replace` y la misma firma,
> **copiando siempre el cuerpo de su última definición** (la tabla de §9.12 dice cuál es).
> Identificadores en inglés; lo que ve la persona, en español con tú y entre comillas «».

**Lo que pidió el dueño:**

- «mira agreguemos Esports, agrega los mejores juegos, y su logica dependiendo el jeugo»
- «para lo de esports, que por juego se pueda hacer torneos entre equipos, por que no solo habra ligas habran la
  logica de que hay equipos tambien para que se puedan crear torneos por juego y que salgan ahi y los equipos puedan
  inscribirse al torneo, y que haya torneos solo equipos o torneos libres de entrada, so dale con eso, recuerda toda
  la logica de esports»
- «agrega rocket league»
- «que tengan que poner su ID y tú compruebas y le dices que confirme y los usuarios confirmados no podrán confirmar
  otra vez ese»
- «podrán apelar en el caso de que alguien cogió eso y puede demostrar» (lo reemplazó la decisión del 2026-10-08, D24:
  quien demuestra con su inicio de sesión que el ID es suyo se lo lleva; no hay reclamos)
- «olvida esos juegos de verificar y solo deja los que sí» (2026-10-08, D24)

**Lo que se construye (alcance aprobado):**

1. Un deporte nuevo, `esports` («Esports», alias «Videojuegos»), de una **familia nueva** `esports`, abierto para
   todos, con color, ícono y animación de apertura propios. Cada liga o torneo es de **un solo juego** y el juego
   decide la lógica.
2. 15 juegos en tres familias de lógica (§2): series por equipos (VALORANT, Counter-Strike 2, League of Legends,
   Mobile Legends, Rocket League), 1 contra 1 (EA SPORTS FC, NBA 2K, Street Fighter 6, TEKKEN 8, Super Smash Bros.
   Ultimate, Clash Royale) y battle royale (Free Fire, Fortnite, Call of Duty: Warzone, PUBG Mobile).
3. **ID de juego** por cuenta y juego, en los 15 juegos. Se comprueba **solo donde es automático** (§7): «Conectar con
   Epic» (Rocket League, Fortnite) o «Conectar con Steam» (CS2) prueban que la cuenta es tuya y el ID queda **solo
   tuyo**; en LoL y VALORANT la API de Riot comprueba que el Riot ID existe («¿Eres tú?»). En los otros 10 juegos el ID
   se **declara** y no es exclusivo. Si alguien entra con una cuenta de Epic, Steam o Riot que otra cuenta tenía
   conectada, el ID pasa a quien entró y a la otra le llega el aviso (§6.3). Rango por juego (y por modo en Rocket
   League): **verificado** solo en LoL (lo da Riot); en los demás, **declarado**.
4. **Equipos de esports** que duran (no son de una liga): nombre, tag, logo, juego, capitán, miembros con su ID de
   juego, suplentes, invitación por código o link, salir, sacar y pasar la capitanía.
5. **Página por juego** (`/esports/valorant`): sus torneos (inscripción abierta, en curso, terminados) y sus equipos,
   con «Crear torneo» y «Crear equipo». Esports sale en el selector de deporte, en Ligas y en Hoy.
6. **Torneos por juego** (sin liga, y también dentro de una liga de esports): entrada «Solo equipos» o «Libre»
   (individuales, equipos armados al inscribirse o agentes libres que el organizador reparte o balancea por rango),
   ventana de inscripción, cupo, check-in opcional, el organizador aprueba o rechaza.
7. Formatos: eliminación simple, **doble eliminación** (ganadores, perdedores, gran final y reinicio opcional), grupos
   + playoffs, todos contra todos y, en battle royale, rondas de N partidas con tabla acumulada. Siembra manual, al
   azar o por rango.
8. Resultados mapa por mapa o juego por juego con la regla del juego (validados igual en el teléfono y en la base),
   series al mejor de 1/3/5/7, el capitán rival confirma o reclama (decide el organizador), captura de la pantalla
   final como prueba, el organizador puede poner o corregir resultados; en battle royale el organizador (o los
   anotadores) anotan puesto y kills de cada inscrito por partida.
9. Todo con el diseño nuevo («Calma y foco»: una acción principal, `ListRow`/`StatDuo`/`Segmented`/`DateBlock` de
   `src/components/ui.tsx`, `NoticeSlot`, Lite/Pro con `ProOnly`), en español con tú, claro y oscuro, a 375 px.

---

## 1. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | El id es **`esports`**. Nombre «Esports» (`lower: 'esports'`, `short: 'Esports'`), alias «Videojuegos». Orden **11**, `status 'open'`. | Es como se dice en la República Dominicana y en el resto de Latinoamérica; «Videojuegos» sale de subtítulo. Pasa el check `^[a-z][a-z_]{1,19}$`. El orden 11 va al final para no renumerar producción (lo mismo que el ping pong, D7 de `docs/ping-pong.md`). |
| D2 | **Familia nueva `'esports'`** en `sport_status.family` y en `SportFamily`. | Un 1 contra 1 o un battle royale no son «deportes de equipo»: con `team` le caerían la convocatoria (`match_rsvps`), la mesa designada, los playoffs de temporada, las estadísticas de plantilla del perfil y el motor de insignias de equipos. Con familia propia, TypeScript obliga a revisar cada `Record<SportFamily, …>` (solo `FAMILY_LABEL`) y en SQL basta abrir 3 candados de partidos (§9.12). Lo que en SQL pregunta `family = 'racket'` y si no trata el lado como equipo (capitán o delegado) **ya** sirve tal cual para esports: `match_side_of`, `push_result_to_confirm`, `push_result_confirmed`, `remind_missing_results`. |
| D3 | Un **torneo de esports es una liga** (`kind = 'torneo'`, `sport = 'esports'`, `rules = {game}`) con **un evento** (`type = 'torneo'`) y su fila 1:1 en **`esports_tournaments`** (juego, modo, entrada, formato, ventana, cupo, ajustes). Una **liga de esports** (`kind = 'liga'`) es del mismo modo, con varios eventos-torneo. | Reutiliza sin copiar: dueño y admins (co-organizadores), pública o privada (también sin cuenta), código de invitación, logo, anotadores (`is_scorer`), tiempo real `league:`/`event:`, fotos, tope de 5 torneos por día, «Mis ligas», Organizar, la consola. Lo nuevo (inscripción, cuadro, BR) va en tablas propias. |
| D4 | Las **series** (mapas o juegos) son filas de `public.matches` (una fila = una serie) con `format = <juego>`, `rules = {game, bestOf, draws, …}` y el detalle en `score.games[]`. El battle royale **no** usa `matches`: tiene `esports_br_games` + `esports_br_results`. | El flujo del resultado ya existe y está probado: propone el capitán (`finish_match`), confirma o reclama el otro capitán (48 h), resuelve o corrige el organizador, W.O., aplazar, push «Tienes un resultado por confirmar», `MatchCard`, `ConfirmResultBanner`. Un BR tiene 12–100 lados por partida: no cabe en dos lados. |
| D5 | Los **equipos de esports** son globales (`esports_teams`, `esports_team_members`, sin liga). Al **aprobar** una inscripción, la base **materializa** el inscrito en la liga del torneo: miembro (`league_members`, rol `member`), jugador (`players`), equipo de temporada (`teams` con `event_id` null) y plantilla (`team_players`: el capitán con rol `captain`, los demás `player`, los suplentes con `position 'suplente'`). Un inscrito individual es un equipo de temporada de una persona, que es su capitán. | Así `match_side_of` (capitán o delegado), el push al rival y `my_matches` funcionan sin tocarlos. La plantilla del torneo es una **foto** de la inscripción (como se hace en esports: el roster se congela); el capitán la cambia hasta que el torneo empieza, después solo el organizador. |
| D6 | **Marcador de una serie**: `score = {text, sides, totals: {maps, points}, games: [{w, a, b, pa, pb, ot, map}], bestOf, proof?, wo?}` (§2.3, §3.2). Lo valida `validateSeries` en el teléfono y `private.esp_series_ok` en la base, con la **misma tabla de reglas por juego** (§2.3) y los mismos casos de prueba. | La regla del juego (13 rondas y prórroga por 2 en VALORANT, MR12 + MR3 en CS2, gol de oro en Rocket League, penales en FC…) no puede depender del teléfono: un capitán con una app vieja o modificada no puede proponer 13-12 en VALORANT. |
| D7 | **El cuadro avanza en la base**: al crear una fase, cada partido guarda a dónde va el ganador y el perdedor (`esports_matches.winner_to/loser_to`). Cuando una serie queda final (`confirmed` o `walkover`), un trigger pone al ganador y al perdedor en su partido siguiente. Lo que pasa a final por las 48 h (no hay escritura) lo aplica `esports_sync(p_event)`, que llama la pantalla del torneo al abrir. | Así el cuadro sigue aunque el organizador no abra la app: lo confirma el capitán rival y listo. La base no necesita saber de doble eliminación: solo sigue enlaces, como `playoff_series.next_series`. |
| D8 | La **doble eliminación** se arma en el motor puro (`doubleEliminationPlan`), con byes para los mejores sembrados y **colapso de partidos de paso** (un partido de perdedores al que solo le puede llegar uno no se crea). Gran final con **reinicio opcional** (`bracketReset`, encendido por defecto): si gana el que viene de perdedores, se juega `GF2`; si gana el invicto, `GF2` queda anulado. | Es la convención de los torneos de esports (start.gg, Challonge). El colapso evita partidos «contra nadie» que nunca se juegan. |
| D9 | **Tablas**: series por equipos y 1 contra 1 (menos FC): ganar la serie 3, perder 0; desempates dif. de mapas/juegos → dif. de rondas/goles/puntos/kills… (según el juego) → enfrentamiento directo → sorteo. **EA SPORTS FC** en grupos y ligas: ganar 3, empatar 1, perder 0 (como el fútbol): dif. de goles → goles a favor → enfrentamiento directo → sorteo. **Battle royale**: puntos acumulados (puesto + kills) → victorias (1.os puestos) → kills totales → mejor puesto en la última partida → sorteo. | Lo aprobado. El FC empata solo al mejor de 1 en una fase de grupos o liga; en eliminatorias deciden los penales. |
| D10 | **Rangos** como datos del catálogo (`src/sports/esports/ranks.ts`): escalera por juego, división y un **ordinal** comparable para sembrar y balancear. Rocket League por modo (1v1/2v2/3v3), con MMR opcional que se pasa a rango con la tabla de la temporada (`src/sports/esports/data/rocketLeagueMmr.ts`, «aprox., temporada actual»). | Lo pidió el dueño. Un número de MMR cambia cada temporada; el rango y la división se entienden siempre. La base solo revisa la forma; el catálogo, que el rango exista. |
| D11 | **ID de juego** (`esports_game_ids`): una fila por cuenta, juego y plataforma. `ownership` = `'declarado' \| 'busqueda' \| 'login'` (cómo se comprobó) y `status` va con él: `'confirmado'` = **comprobado** (búsqueda o login), `'pendiente'` = declarado. `rank_source` = `'declarado' \| 'verificado'` (de dónde salió el rango), por separado. **Exclusivo solo con login**: índices únicos parciales `(game, platform, id_normalized)` y `(game, external_id)` `where ownership = 'login'`. La normalización (§2.4) es la misma en TypeScript y en SQL. | «Los usuarios confirmados no podrán confirmar otra vez ese» solo se puede cumplir donde hay prueba: un ID declarado o encontrado por la API no prueba que la cuenta sea tuya, así que no bloquea a nadie; el inicio de sesión sí. Probar el ID y probar el rango son dos cosas distintas: puedes haber conectado Epic y tener el rango declarado. |
| D12 | La **búsqueda con la API** (solo Riot: LoL y VALORANT) la hace la Edge Function nueva **`esports-verify`** con claves del servidor. Lo que encuentra lo guarda ella misma con la clave secreta en `private.esports_lookups` (vale 15 minutos) y devuelve un `lookupId`. La cuenta confirma con `esports_confirm_game_id(p_lookup)`: el ID queda comprobado (`ownership 'busqueda'`) y, en LoL, una búsqueda suya, fresca y del mismo ID da `rank_source = 'verificado'`. | No hace falta firmar nada en el teléfono ni `pgcrypto`: el teléfono nunca escribe un rango verificado; solo apunta a una fila que escribió el servidor. Se prueba entero en PGlite. |
| D13 | **Conectar la cuenta** (Steam OpenID 2.0, Epic Account Services, Riot Sign On) va por otra Edge Function, **`esports-auth`**: `start` guarda un `state` de un solo uso y devuelve la URL del proveedor; la vuelta (`/<proveedor>/callback`) lo comprueba y llama `esports_link_account` (solo `service_role`), que deja el ID **confirmado con `ownership = 'login'`** (y se lo quita a otra cuenta que lo tuviera conectado, §6.3), y manda a la persona a `/esports/mi-id?conectado=<proveedor>`. Cada proveedor se enciende solo si sus secretos están puestos (Steam no necesita ninguno). | Es la prueba más fuerte de que la cuenta es tuya. Riot exige aprobación de producción: hasta tenerla, LoL y VALORANT quedan con la búsqueda. |
| D14 | **Sin reclamos.** Un ID conectado con login pasa a la cuenta que entra con ese login: se borra la fila de la otra cuenta, que recibe el aviso en la app (`esports_id_moves`) y por push, y queda en `admin_audit` (`esports_id_login`). Los IDs declarados o encontrados por búsqueda no son exclusivos: no hay nada que reclamar. | El login es la única prueba automática de que la cuenta es tuya; un código en una captura lo tiene que revisar una persona y no prueba mucho (D24). |
| D15 | **Logos de equipo**: el mismo bucket público `logos` y la misma reserva `private.logo_uploads`, con la carpeta = id del equipo (`'<team_id>/<uuid>.webp'`). Se redefinen `can_upload_logo_path`, `can_remove_logo_path` y `purge_queue_take` (§9.12). **Capturas del partido**: las fotos de siempre (`add_photo`, bucket `scoreboards`, ruta `'<liga>/<foto>.webp'`), con sus ids en `score.proof` y en `esports_br_games.proof`. No hay capturas de ID ni de rango (D24), así que no hay bucket nuevo. | Reutiliza la compresión, la caché de URLs y la limpieza de la cola de Storage; `matches` no gana columnas. |
| D16 | **Sin logos de marcas**: cada juego se muestra con un **monograma** («VAL», «CS2», «LoL», «RL»…) en un cuadrito de su color. Los nombres de los juegos se usan solo para nombrarlos. | Los logos son marcas registradas; el monograma se lee bien a 24 px y no pide permisos. |
| D17 | **Sin insignias de esports** en esta entrega. Se agrega `'esports'` a los tres checks de deporte (`badge_awards`, `badge_progress`, `badge_stats`) para el futuro; el catálogo lo saca de `ALL_SPORTS`; `DAY_WEIGHT.esports = 1`; `SPORT_EMBLEM.esports = 'crosshair'` (ya curado). `badge_activity` y `badge_apply_decisions` **no** cambian. | Lo pidió el líder («mínimo»). Sin evaluadores de esports, `debut` o `monthly_regular` saldrían en la galería sin poder ganarse. Sin decisiones con `'esports'`, `badge_apply_decisions` no necesita la lista nueva. |
| D18 | Color **`#7c3aed`** (violeta). En las imágenes para compartir, **`#5b21b6`** con letras blancas. Escena de apertura **`esports`**: un control de juego cuyo botón se enciende y un «GG» que aparece. | El violeta es el color de los esports y no está tomado: queda a 11 (OKLab) del morado de la marca, a 12 del azul del tenis y a 13 del fucsia del ping pong, y lejos del rojo de peligro y del ámbar. |
| D19 | `venue` = **«Sede»** (`venueHint: 'Online, cibercafé o centro gamer'`). | Muchos torneos son en línea; «Club» o «Cancha» no sirven. Se agrega «Sede» a la lista de `registry.test.ts`. |
| D20 | `eventTypes = [{ id: 'torneo', label: 'Torneo', plural: 'Torneos' }]`. Un evento de esports **siempre** tiene su fila en `esports_tournaments`. | Los formatos viven en el torneo, no en el tipo de evento. |
| D21 | **Rocket League** es de primera: modos 1v1/2v2/3v3 por torneo (3v3 por defecto), juegos por goles con gol de oro (`ot: true`), series al mejor de 3/5/7 (Bo5 por defecto, Bo7 en la final), tabla 3/0 con dif. de juegos → dif. de goles → enfrentamiento directo, ID = Epic ID (multiplataforma), en el hub, los equipos, las dos entradas y todos los formatos. En 1v1 se juega como individual en «Libre». | Lo pidió el dueño dos veces. |
| D22 | **Lite** muestra lo del jugador (inscribirse, check-in, anotar y confirmar, sus equipos e IDs); **Pro** suma lo del organizador (revisar inscripciones, sembrar, armar el cuadro, corregir, W.O., anotar BR, balancear). Los permisos los decide la base, no el modo. | Es la regla del rediseño (`ProOnly` solo esconde). |
| D23 | No hay datos de demostración. | Ningún deporte nuevo los tiene. |
| D24 | **2026-10-08 — verificación solo donde es automática.** El dueño: «olvida esos juegos de verificar y solo deja los que sí». Los 15 juegos se quedan; el catálogo dice qué comprobación tiene cada uno (`verify`, §2.2 y §7): **login** (Rocket League y Fortnite con Epic, CS2 con Steam), **búsqueda** con la API de Riot (LoL: existe y rango verificado; VALORANT: solo que existe) o **ninguna** (los otros 10: el ID y el rango se declaran). `requireConfirmedId` (apagado por defecto) solo cuenta en juegos con comprobación y `requireVerifiedRank` solo en LoL. Se quitan los reclamos de ID, los códigos de prueba, las capturas de rango y su revisión, el bucket privado de pruebas, las búsquedas de Clash Royale, de Tracker Network y de Steam para CS2, la acción `challenge` de `esports-verify`, la sección de la consola y las dos migraciones que los tenían. | Un código en una captura o una captura de rango piden que una persona revise y se pueden falsificar; con login o con la API, la comprobación es automática y no le da trabajo al superadmin. Donde no hay método oficial, se confía en lo declarado y no se bloquea a nadie. |

---

## 2. El catálogo de juegos (la lógica depende del juego)

Es la **fuente de verdad** de las reglas. Vive en `src/sports/esports/catalog.ts` (y sus datos de rangos en
`ranks.ts` y `data/rocketLeagueMmr.ts`). La base repite **solo** lo que necesita para validar (ids, modos, mejor de,
regla del marcador, normalización del ID, límites de plantilla y de lobby) en funciones `private.esp_*` (§9.4); una
prueba SQL (§15) recorre los mismos casos que las pruebas del motor.

### 2.1 Los 15 juegos

| `GameId` | Nombre | Monograma | Color del monograma | `kind` | Modos (por defecto) | Mejor de permitido | Mejor de por defecto (grupos/playoffs/final) | Regla del marcador (`scoring`) | «Puntos» del juego (`pointsWord`) | «Mapas» (`mapsWord`) |
|---|---|---|---|---|---|---|---|---|---|---|
| `valorant` | VALORANT | VAL | `#be123c` | `team` | `5v5` | 1, 3, 5 | 1 / 3 / 5 | `val` | rondas | mapas |
| `cs2` | Counter-Strike 2 | CS2 | `#b45309` | `team` | `5v5` | 1, 3, 5 | 1 / 3 / 5 | `cs` | rondas | mapas |
| `lol` | League of Legends | LoL | `#0f766e` | `team` | `5v5` | 1, 3, 5 | 1 / 3 / 5 | `win` | kills | juegos |
| `mlbb` | Mobile Legends: Bang Bang | MLBB | `#1d4ed8` | `team` | `5v5` | 1, 3, 5, 7 | 1 / 3 / 5 | `win` | kills | juegos |
| `rocket_league` | Rocket League | RL | `#0369a1` | `team` | `1v1`, `2v2`, `3v3` (`3v3`) | 1, 3, 5, 7 | 5 / 5 / 7 | `goals_ot` | goles | juegos |
| `ea_fc` | EA SPORTS FC | FC | `#15803d` | `duel` | `1v1` | 1, 3 | 1 / 1 / 3 | `goals_pen` | goles | juegos |
| `nba_2k` | NBA 2K | 2K | `#c2410c` | `duel` | `1v1` | 1, 3, 5, 7 | 1 / 1 / 3 | `points` | puntos | juegos |
| `sf6` | Street Fighter 6 | SF6 | `#7e22ce` | `duel` | `1v1` | 1, 3, 5 | 3 / 3 / 5 | `fight` (rondas para ganar: 2) | rondas | juegos |
| `tekken8` | TEKKEN 8 | T8 | `#991b1b` | `duel` | `1v1` | 1, 3, 5 | 3 / 3 / 5 | `fight` (rondas para ganar: 3; el torneo puede bajarlo a 2) | rondas | juegos |
| `smash` | Super Smash Bros. Ultimate | SSBU | `#be185d` | `duel` | `1v1` | 1, 3, 5 | 3 / 3 / 5 | `stocks` (vidas: 3; el torneo elige 1–5) | vidas | juegos |
| `clash_royale` | Clash Royale | CR | `#3730a3` | `duel` | `1v1` | 1, 3, 5 | 3 / 3 / 5 | `crowns` | coronas | juegos |
| `free_fire` | Free Fire | FF | `#a16207` | `br` | `solo`, `duo`, `squad` (`squad`) | — | — | `br` | kills | partidas |
| `fortnite` | Fortnite | FN | `#6d28d9` | `br` | `solo`, `duo`, `trio`, `squad` (`duo`) | — | — | `br` | kills | partidas |
| `warzone` | Call of Duty: Warzone | WZ | `#374151` | `br` | `solo`, `duo`, `trio`, `quad` (`trio`) | — | — | `br` | kills | partidas |
| `pubg_mobile` | PUBG Mobile | PUBG | `#854d0e` | `br` | `solo`, `duo`, `squad` (`squad`) | — | — | `br` | kills | partidas |

Orden de las listas: el de la tabla (agrupados por `kind`: «Por equipos», «1 contra 1», «Battle royale»).

**Modos** (`Mode`): `'1v1' | '2v2' | '3v3' | '5v5' | 'solo' | 'duo' | 'trio' | 'squad' | 'quad'`.

| Modo | Titulares (`modeSize`) | Suplentes máx. (`subsMax`) | Suplentes por defecto | Texto |
|---|---|---|---|---|
| `1v1`, `solo` | 1 | 0 | 0 | «1 contra 1» · «Solo» |
| `2v2`, `duo` | 2 | 1 | 1 | «2 contra 2» · «Dúos» |
| `3v3`, `trio` | 3 | 2 (RL) · 1 (BR) | 1 | «3 contra 3» · «Tríos» |
| `squad`, `quad` | 4 | 1 | 1 | «Escuadras» |
| `5v5` | 5 | 2 | 2 | «5 contra 5» |

Un modo de 1 titular **juega como individual**: no hay equipos de esports de ese modo y la entrada es siempre «Libre»
(§5.1). Los juegos `duel` solo tienen `1v1`.

**Lobby de battle royale** (`lobby[mode]`, máximo de inscritos de un torneo BR, todos en la misma partida):

| Juego | solo | duo | trio | squad / quad |
|---|---|---|---|---|
| Free Fire | 48 | 24 | — | 12 |
| Fortnite | 100 | 50 | 33 | 25 |
| Warzone | 100 | 75 | 50 | 37 |
| PUBG Mobile | 100 | 50 | — | 25 |

**Puntos por puesto por defecto** (editables por torneo; el puesto que no está en la lista da 0) y **kill**:

| Juego | `placementPoints` | `killPoints` |
|---|---|---|
| Free Fire | `[12, 9, 8, 7, 6, 5, 4, 3, 2, 1]` | 1 |
| Fortnite | `[15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 1, 1, 1, 1]` | 1 |
| Warzone | `[10, 8, 6, 5, 4, 3, 2, 1]` | 1 |
| PUBG Mobile | `[10, 6, 5, 4, 3, 2, 1, 1]` | 1 |

Por defecto, 1 ronda («jornada») de 4 partidas (`rounds: 1`, `gamesPerRound: 4`); el organizador elige 1–10 rondas y
1–12 partidas por ronda.

**Mapas** (opcionales en cada mapa jugado; `maps` del catálogo, `id` + nombre): VALORANT `ascent` Ascent, `bind`
Bind, `haven` Haven, `split` Split, `lotus` Lotus, `sunset` Sunset, `icebox` Icebox, `breeze` Breeze, `abyss` Abyss,
`pearl` Pearl, `fracture` Fracture, `corrode` Corrode. CS2 `mirage` Mirage, `inferno` Inferno, `nuke` Nuke, `ancient`
Ancient, `anubis` Anubis, `dust2` Dust II, `train` Train, `overpass` Overpass, `vertigo` Vertigo. Los demás: sin lista
(campo libre, ≤ 24). La lista cambia con el juego: es dato, no lógica.

### 2.2 Tipos del catálogo (`src/sports/esports/catalog.ts`, LF)

```ts
export type GameId =
  | 'valorant' | 'cs2' | 'lol' | 'mlbb' | 'rocket_league'
  | 'ea_fc' | 'nba_2k' | 'sf6' | 'tekken8' | 'smash' | 'clash_royale'
  | 'free_fire' | 'fortnite' | 'warzone' | 'pubg_mobile';
export type GameKind = 'team' | 'duel' | 'br';
export type Mode = '1v1' | '2v2' | '3v3' | '5v5' | 'solo' | 'duo' | 'trio' | 'squad' | 'quad';
export type BestOf = 1 | 3 | 5 | 7;
export type ScoringRule = 'val' | 'cs' | 'win' | 'goals_ot' | 'goals_pen' | 'points' | 'fight' | 'stocks' | 'crowns' | 'br';
export type IdKind = 'riot' | 'steam' | 'mlbb' | 'epic' | 'ea' | 'console' | 'buckler' | 'tekken' | 'nintendo' | 'cr' | 'digits' | 'activision';
export type LinkProvider = 'steam' | 'epic' | 'riot';
export type VerifyKind = 'login' | 'lookup' | 'none';

export interface GameMeta {
  id: GameId;
  name: string;            // «VALORANT»
  mono: string;            // «VAL» (monograma, 2–4)
  blurb: string;           // la lógica en una línea (tabla de abajo)
  color: string;           // color del monograma (#rrggbb, letras blancas ≥ 4.5:1)
  kind: GameKind;
  modes: readonly Mode[];
  defaultMode: Mode;
  bestOf: readonly BestOf[];                          // vacío en BR
  defaultBestOf: { groups: BestOf; playoffs: BestOf; final: BestOf } | null; // null en BR
  scoring: ScoringRule;
  pointsWord: string;      // «rondas», «goles», «kills»…
  mapsWord: string;        // «mapas», «juegos», «partidas»
  maps: readonly { id: string; name: string }[];
  roundsToWin?: { default: 2 | 3; options: readonly (2 | 3)[] }; // fight
  stocks?: { default: number; min: 1; max: 5 };                  // smash
  subsMax: Partial<Record<Mode, number>>;
  lobby?: Partial<Record<Mode, number>>;                          // BR
  br?: { placementPoints: readonly number[]; killPoints: number };
  idInfo: {
    kind: IdKind;
    label: string;          // «Riot ID»
    placeholder: string;    // «Nombre#LAN»
    hint: string;           // cómo encontrarlo
    platforms: readonly { id: string; label: string }[];  // [] = no aplica (platform '')
    regions: readonly { id: string; label: string }[];    // [] = no aplica (region '')
    defaultRegion: string;  // '' si no aplica
  };
  link: LinkProvider | null;         // «Conectar con…» (§8.3)
  lookup: boolean;                   // tiene búsqueda con la API de Riot en esports-verify (§8.2)
  verify: { kind: VerifyKind; rank: boolean }; // cómo se comprueba el ID y si el rango sale verificado (§7)
}

export const GAME_IDS: readonly GameId[];                 // el orden de §2.1
export const GAMES: Readonly<Record<GameId, GameMeta>>;
export const isGameId: (v: unknown) => v is GameId;
export const gameMeta: (id: string | null | undefined) => GameMeta | null;
export const gamesOfKind: (kind: GameKind) => GameMeta[];
export const modeSize: (mode: Mode) => number;           // §2.1
export const isIndividualMode: (mode: Mode) => boolean;  // modeSize === 1
export const modeLabel: (mode: Mode) => string;          // «5 contra 5», «Escuadras»…
export function rosterLimits(game: GameId, mode: Mode, subs?: number): { min: number; max: number; subsMax: number };
//   min = modeSize(mode); subsMax = GAMES[game].subsMax[mode] ?? 0; max = min + clamp(subs ?? subsMax, 0, subsMax)
export function maxEntries(game: GameId, mode: Mode, format: Format): number; // BR: lobby; RR: 20; resto: 128
export function minEntries(format: Format): number;      // double_elim y groups_playoffs 4; round_robin 3; single_elim 2; br 2
export const verifyKind: (game: GameId) => VerifyKind;
export const canVerifyId: (game: GameId) => boolean;     // verify.kind !== 'none'
export const canVerifyRank: (game: GameId) => boolean;   // verify.rank (solo LoL)
```

`blurb`: VALORANT «5 contra 5 · mapas a 13 rondas»; CS2 «5 contra 5 · mapas a 13 (MR12)»; LoL «5 contra 5 · por
juegos»; MLBB «5 contra 5 · por juegos»; Rocket League «Por goles · 1v1, 2v2 o 3v3»; EA SPORTS FC «1 contra 1 · por
goles»; NBA 2K «1 contra 1 · por puntos»; SF6 «1 contra 1 · por rondas»; TEKKEN 8 «1 contra 1 · por rondas»; Smash
«1 contra 1 · por vidas»; Clash Royale «1 contra 1 · por coronas»; Free Fire, Fortnite, Warzone y PUBG Mobile «Battle
royale · puesto + kills».

`subsMax` por juego: VALORANT, CS2, LoL, MLBB `{ '5v5': 2 }`; Rocket League `{ '1v1': 0, '2v2': 1, '3v3': 2 }`;
duelos `{ '1v1': 0 }`; Free Fire y PUBG Mobile `{ solo: 0, duo: 1, squad: 1 }`; Fortnite `{ solo: 0, duo: 1, trio: 1,
squad: 1 }`; Warzone `{ solo: 0, duo: 1, trio: 1, quad: 1 }`.

### 2.3 La regla de cada mapa o juego (igual en `series.ts` y en `private.esp_game_winner`)

Cada mapa/juego de una serie es un `GameRecord` `{ w?, a?, b?, pa?, pb?, ot?, map? }`: `a` es el número del lado 1 y
`b` el del lado 2; `w` el lado que lo ganó (1 o 2). Todos los números son enteros. Cualquier otra clave: inválido.

| Regla | Juegos | `a`, `b` | Válido si… | Ganador (`w`) |
|---|---|---|---|---|
| `val` | VALORANT | obligatorios, 0–99 | `hi = max(a,b)`, `lo = min(a,b)`: (`hi = 13` y `lo ≤ 11`) o (`hi ≥ 14` y `hi − lo = 2` y `lo ≥ 12`) — prórroga desde 12-12 hasta sacar 2 | el de `hi` (si viene `w`, tiene que coincidir) |
| `cs` | CS2 (MR12, prórroga MR3) | obligatorios, 0–99 | (`hi = 13` y `lo ≤ 11`) o (`hi ≥ 16` y `(hi − 13) % 3 = 0` y `hi − 4 ≤ lo ≤ hi − 1`) — 16-12…16-15, 19-15…19-18… | el de `hi` |
| `win` | LoL, MLBB | opcionales (kills), 0–200 | `w` obligatorio; `a`/`b` no se comparan con `w` (se puede ganar con menos kills) | `w` |
| `goals_ot` | Rocket League | obligatorios, 0–99 | `a ≠ b`; `ot` (opcional, booleano) solo con `hi − lo = 1` (gol de oro) | el de `hi` |
| `goals_pen` | EA SPORTS FC | obligatorios, 0–30; `pa`/`pb` 0–30 | si `a ≠ b`: sin `pa`/`pb`; si `a = b`: con `pa ≠ pb` (penales) **o** empate sin penales, solo si `rules.draws` y `bestOf = 1` | el de más goles; con empate, el de más penales; empate sin penales: ninguno (`w` ausente o null) |
| `points` | NBA 2K | obligatorios, 0–300 | `a ≠ b` | el de `hi` |
| `fight` | SF6, TEKKEN 8 | opcionales (rondas) | `w` obligatorio; si vienen `a`/`b`: el lado `w` tiene exactamente `rules.roundsToWin` y el otro de 0 a `roundsToWin − 1` | `w` |
| `stocks` | Smash | opcionales (vidas que le quedaron) | `w` obligatorio; si vienen: el lado `w` de 1 a `rules.stocks` y el otro 0 | `w` |
| `crowns` | Clash Royale | obligatorios, 0–3 | `w` obligatorio; las coronas del lado `w` ≥ las del otro (con desempate por vida de torres se gana con iguales) | `w` |

`map` (opcional): texto de 1–24 (`^[a-z0-9_]{1,24}$` para los de la lista; el teléfono manda el `id`).
`ot` solo vale en `goals_ot` (en `val` y `cs` la prórroga se ve en el marcador; no se guarda `ot`).

**La serie** (`validateSeries` / `private.esp_series_ok`), con `need = (bestOf + 1) / 2`:

1. `games` es un arreglo de 1 a `bestOf` mapas/juegos, cada uno válido con su regla.
2. Ningún mapa/juego después de que un lado llegó a `need`.
3. **Final** (`finished`, `confirmed` o `disputed`): un lado llegó a `need` justo en el último, **o** es el empate del
   FC (`rules.draws`, `bestOf = 1`, un solo juego empatado sin penales). El ganador de la fila (`winner_side`) es ese
   lado, o null en el empate.
4. `sides = [ganados lado 1, ganados lado 2]`; `totals.maps = sides`; `totals.points = [Σ a, Σ b]` (0 donde no vino).
5. `bestOf` del marcador = `rules.bestOf`.
6. En vivo o suspendido se revisan 1, 2, 4 y 5 (no el 3).
7. W.O. (`status = 'walkover'`): `{ text: 'W.O.', wo: true, sides: [need, 0] | [0, need] | [0, 0], totals: { maps:
   sides, points: [0, 0] }, games: [], bestOf }`, y `sides` cuadra con `walkover_side` (0 = no vino ninguno → `[0, 0]`).
8. `proof` (opcional): de 0 a 3 ids de fotos (`public.photos`) **de la misma liga**.

**El texto** (`seriesText`, ≤ 80): al mejor de 1 con `a`/`b` (y regla distinta de `win`), el del juego: «13-9»,
«14-12», «3-2 (prórroga)», «2-2 (4-3 pen.)», «2-2» (empate FC), «98-91», «2-1» (coronas); si no,
`«${ganados1}-${ganados2}»` y, si cabe en 80, el detalle entre paréntesis: «2-1 (13-9 7-13 13-11)», «3-1 (3-2 1-4 2-1
4-3 prórroga)». W.O.: «W.O.». La base solo revisa el largo del texto.

### 2.4 El ID de cada juego (igual en `gameIds.ts` y en `private.esp_normalize_id`)

`normalizeGameId(game, raw, platform)` → `{ display, normalized }` o un error en español. Primero se quitan los
espacios de los extremos. «Juntar espacios» = cambiar cada grupo de espacios por uno. **`lower` aquí es solo de
ASCII** (A–Z → a–z): en TypeScript `s.replace(/[A-Z]/g, (c) => c.toLowerCase())` y en SQL `translate(s,
'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')`. Así no depende del idioma de la base (`lower()` de
Postgres con locale C, como en PGlite, no toca la Ñ; con `en_US` sí): «ÑANDÚ» y «ñandú» son IDs distintos, y se
acepta.

| `IdKind` | Juegos | Etiqueta («Tu …») | Forma que se acepta | `display` | `normalized` | Plataformas / regiones |
|---|---|---|---|---|---|---|
| `riot` | VALORANT, LoL | Riot ID | `Nombre#TAG`: se parte en el **último** `#`; nombre (juntar espacios) de 3–16, tag `^[A-Za-z0-9]{3,5}$` | `Nombre#TAG` | `lower(nombre) + '#' + lower(tag)` | región (solo para la búsqueda de Riot): VALORANT `latam` (def.), `na`, `br`, `eu`, `ap`, `kr`; LoL `la1` LAN (def.), `la2` LAS, `na1`, `br1`, `euw1`, `eun1`, `kr`, `jp1`, `oc1` |
| `steam` | CS2 | Código de amigo de Steam | solo dígitos (se quitan espacios): 17 dígitos que empiezan con `7656119` (SteamID64) o 1–10 dígitos (código de amigo, 1–4294967295) | lo escrito (dígitos) | el código de amigo: `SteamID64 − 76561197960265728` (BigInt / `bigint`), en texto | — |
| `mlbb` | MLBB | ID y zona | `^(\d{5,12})\s*\(?\s*(\d{1,5})\s*\)?$` («12345678 (1234)», «12345678 1234») | `12345678 (1234)` | `12345678:1234` | — |
| `epic` | Rocket League, Fortnite | Epic ID | juntar espacios; 3–16; sin `#` | lo escrito | `lower(...)` | — (multiplataforma) |
| `ea` | EA SPORTS FC | EA ID | `^[A-Za-z0-9_.-]{4,16}$` | lo escrito | `lower(...)` | — |
| `console` | NBA 2K | Usuario de la consola | juntar espacios; 3–16 | lo escrito | `lower(...)` | **plataforma obligatoria**: `psn` PlayStation, `xbox` Xbox, `steam` Steam, `switch` Nintendo Switch |
| `buckler` | SF6 | User Code (Buckler's Boot Camp) | 10 dígitos (se quitan espacios) | dígitos | dígitos | — |
| `tekken` | TEKKEN 8 | TEKKEN ID | se quitan espacios; `^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$` | `xxxx-xxxx-xxxx` (con guiones, como lo escribió) | `lower`, sin guiones | — |
| `nintendo` | Smash | Código de amigo | se quitan `SW`, guiones y espacios; 12 dígitos | `SW-1234-5678-9012` | los 12 dígitos | — |
| `cr` | Clash Royale | Tag de jugador | se quitan espacios y el `#` del principio; en mayúsculas `^[0289PYLQGRJCUV]{3,12}$` | `#ABC123` (mayúsculas) | minúsculas, sin `#` | — |
| `digits` | Free Fire (6–12), PUBG Mobile (5–12) | ID de Free Fire / ID de personaje | solo dígitos (se quitan espacios) | dígitos | dígitos | Free Fire: región opcional (`na`, `sa`, `br`…) solo de texto; no entra en la identidad |
| `activision` | Warzone | Activision ID | `Nombre#1234567`: nombre (juntar espacios) 2–16, número 4–8 dígitos | `Nombre#1234567` | `lower(nombre) + '#' + número` | — |

La **identidad** de un ID es `(game, platform, normalized)`. `platform` es `''` salvo en NBA 2K. `region` no entra en
la identidad (un Riot ID es global).

Errores (texto exacto): «Escribe tu {label}.» (vacío), «Así no es un {label}: {placeholder}.» (forma), «Elige la
plataforma.» (NBA 2K sin plataforma).

### 2.5 Rangos (`src/sports/esports/ranks.ts`, LF)

```ts
export type RankValue = { tier: string; div?: number; mmr?: number } | { value: number } | { text: string };
/** Clave 'main', o el modo en los juegos con rango por modo (Rocket League: '1v1' | '2v2' | '3v3'). */
export type RankMap = Partial<Record<'main' | '1v1' | '2v2' | '3v3', RankValue>>;
export type RankSource = 'declarado' | 'verificado';   // 'verificado' solo sale de una búsqueda de LoL (§6.2)

export type Ladder =
  | { kind: 'tiers'; perMode: boolean; tiers: readonly { id: string; label: string; divs: 0 | 3 | 4 | 5; order: 'asc' | 'desc' }[]; divWord: string }
  | { kind: 'number'; label: string; min: number; max: number }
  | { kind: 'text' };

export const LADDERS: Readonly<Record<GameId, Ladder>>;
export function rankKeyFor(game: GameId, mode: Mode): 'main' | '1v1' | '2v2' | '3v3'; // RL → el modo; resto 'main'
export function validateRank(game: GameId, key: string, r: unknown): string | null;   // null = bien
export function rankLabel(game: GameId, r: RankValue | null | undefined): string;     // «Diamante 2», «Oro IV», «Gran Campeón II · Div. III», «1.245 CS Rating», «7.320 trofeos»
export function rankOrdinal(game: GameId, r: RankValue | null | undefined): number | null; // comparable (mayor = mejor)
export function rlRankFromMmr(mode: '1v1' | '2v2' | '3v3', mmr: number): { tier: string; div?: number }; // §2.6
```

**Ordinal**: escalera de tiers → `índiceDelTier × 10 + d`, con `d = 0` si `divs = 0`; si `order = 'asc'` (la 1 es la
más baja), `d = div − 1`; si `'desc'` (la I es la más alta), `d = divs − div`. Escalera numérica → el número. Texto →
null (va al final al sembrar). Solo se comparan rangos del mismo juego y la misma clave.

| Juego | Escalera (de menor a mayor; `divs`, `order`) |
|---|---|
| VALORANT | `iron` Hierro, `bronze` Bronce, `silver` Plata, `gold` Oro, `platinum` Platino, `diamond` Diamante, `ascendant` Ascendente, `immortal` Inmortal (3, asc: «1 2 3»), `radiant` Radiante (0) |
| CS2 | número «CS Rating», 0–40 000 |
| LoL | `iron` Hierro, `bronze` Bronce, `silver` Plata, `gold` Oro, `platinum` Platino, `emerald` Esmeralda, `diamond` Diamante (4, desc: «IV III II I»), `master` Maestro, `grandmaster` Gran Maestro, `challenger` Retador (0) |
| MLBB | `warrior` Guerrero (3, desc), `elite` Élite (3, desc), `master` Maestro (4, desc), `grandmaster` Gran Maestro (5, desc), `epic` Épico (5, desc), `legend` Leyenda (5, desc), `mythic` Mítico, `mythical_honor` Honor Mítico, `mythical_glory` Gloria Mítica, `mythical_immortal` Inmortal Mítico (0) |
| Rocket League (**por modo**) | `bronze1` Bronce I, `bronze2` Bronce II, `bronze3` Bronce III, `silver1`–`silver3` Plata I–III, `gold1`–`gold3` Oro I–III, `platinum1`–`platinum3` Platino I–III, `diamond1`–`diamond3` Diamante I–III, `champion1`–`champion3` Campeón I–III, `gc1`–`gc3` Gran Campeón I–III (cada uno 4, asc: «División I–IV»), `ssl` Supersonic Legend (0). `mmr` opcional (−100…3 000) |
| Free Fire | `bronze` Bronce, `silver` Plata (3, asc), `gold` Oro, `platinum` Platino, `diamond` Diamante (4, asc), `heroic` Heroico, `master` Maestro, `grandmaster` Gran Maestro (0) |
| Fortnite | `bronze` Bronce, `silver` Plata, `gold` Oro, `platinum` Platino, `diamond` Diamante (3, asc), `elite` Élite, `champion` Campeón, `unreal` Unreal (0) |
| Warzone | `bronze` Bronce, `silver` Plata, `gold` Oro, `platinum` Platino, `diamond` Diamante, `crimson` Carmesí (3, asc), `iridescent` Iridiscente, `top250` Top 250 (0) |
| PUBG Mobile | `bronze` Bronce, `silver` Plata, `gold` Oro, `platinum` Platino, `diamond` Diamante, `crown` Corona (5, desc: «V…I»), `ace` As, `ace_master` As Maestro, `ace_dominator` As Dominador, `conqueror` Conquistador (0) |
| Clash Royale | número «trofeos», 0–15 000 |
| EA SPORTS FC | `d10` División 10 … `d1` División 1, `elite` Élite (0) — de menor a mayor: d10, d9, …, d1, elite |
| SF6 | `rookie` Novato, `iron` Hierro, `bronze` Bronce, `silver` Plata, `gold` Oro, `platinum` Platino, `diamond` Diamante (5, asc: «★1…★5»), `master` Master (0) |
| TEKKEN 8, Smash, NBA 2K | texto libre (1–24), opcional |

`divWord`: «División» en Rocket League; vacío en el resto (la división se escribe pegada: «Diamante 2», «Oro IV»).

### 2.6 MMR de Rocket League (`src/sports/esports/data/rocketLeagueMmr.ts`, LF)

Un solo archivo de datos, para cambiarlo cada temporada, copiado de `docs/datos/rocket-league-rangos.md` (rangos
observados por el tracker, no oficiales; **no** se lee ninguna página del tracker desde la app):

```ts
/** Temporada de los datos (se muestra «aprox., temporada actual»). */
export const RL_MMR_SEASON = '2026-10';
/** Mínimo de MMR de cada división, por modo: RL_MMR_MIN[mode][tier] = [div I, div II, div III, div IV] (ssl: [min]). */
export const RL_MMR_MIN: Readonly<Record<'1v1' | '2v2' | '3v3', Readonly<Record<string, readonly number[]>>>>;
```

Se copian **solo los mínimos** de la tabla (el primer número de cada celda; Bronce I = −100). `rlRankFromMmr(mode,
mmr)` recorre todas las divisiones de la más alta (SSL) a la más baja y devuelve **la primera cuyo mínimo ≤ mmr**
(«límite inferior; con solape gana la división más alta cuyo mínimo no supere el MMR»). Debajo de todo: Bronce I,
División I. SSL no tiene división (`{ tier: 'ssl' }`), por eso el tipo de vuelta es `{ tier: string; div?: number }`.

Ejemplos que la prueba repite con los números del archivo:

| Llamada | Resultado | Por qué |
|---|---|---|
| `rlRankFromMmr('3v3', 1900)` | `{ tier: 'ssl' }` | 1 868 ≤ 1 900 |
| `rlRankFromMmr('3v3', 1650)` | `{ tier: 'gc2', div: 3 }` | GC II div. III empieza en 1 647 |
| `rlRankFromMmr('3v3', 1600)` | `{ tier: 'gc2', div: 2 }` | 1 600 |
| `rlRankFromMmr('3v3', 990)` | `{ tier: 'diamond3', div: 4 }` | las cuatro divisiones de Diamante III empiezan en 980: gana la más alta |
| `rlRankFromMmr('1v1', 1110)` | `{ tier: 'champion3', div: 4 }` | Campeón III div. IV empieza en 1 100 (solape del tracker) |
| `rlRankFromMmr('2v2', 0)` | `{ tier: 'bronze1', div: 1 }` | solo Bronce I div. I (−100) queda debajo |

Con los solapes del tracker el resultado puede salir una división arriba: por eso la pantalla dice «aprox., temporada
actual». Cuando cambie la temporada se reemplaza el archivo (y `RL_MMR_SEASON`) y se ajusta esta prueba.

---

## 3. Motores puros (`src/sports/esports/`, LF; sin React ni backend)

Todo lo de aquí es puro, determinista y con pruebas al lado (`*.test.ts`). Lo usan la capa de datos y las
pantallas. Barril: `src/sports/esports/index.ts` reexporta todos los módulos.

| Archivo | Qué tiene |
|---|---|
| `catalog.ts` | §2.2 |
| `ranks.ts`, `data/rocketLeagueMmr.ts` | §2.5, §2.6 |
| `gameIds.ts` | §3.1 |
| `series.ts` | §3.2 |
| `standings.ts` | §3.3 |
| `brackets.ts` | §3.4 |
| `seeding.ts` | §3.5 |
| `settings.ts` | §3.6 |
| `tournament.ts` | §3.7 |

### 3.1 `gameIds.ts`

```ts
export interface NormalizedId { display: string; normalized: string }
export function normalizeGameId(game: GameId, raw: string, platform?: string): NormalizedId | { error: string }; // §2.4
export function idPlatforms(game: GameId): readonly { id: string; label: string }[];
export function idRegions(game: GameId): readonly { id: string; label: string }[];
export type IdStatus = 'pendiente' | 'confirmado';           // confirmado = comprobado (búsqueda o login)
export type Ownership = 'declarado' | 'busqueda' | 'login';
export const OWNERSHIP_LABEL: Record<Ownership, string>;     // { declarado: 'Declarado', busqueda: 'Comprobado', login: 'Cuenta conectada' }
export const RANK_SOURCE_LABEL: Record<RankSource, string>;  // { declarado: 'Declarado', verificado: 'Verificado' }
```

Pruebas: cada `IdKind` con un caso bueno y uno malo; Riot ID con `#` en el nombre (se parte en el último), espacios
dobles, mayúsculas («Ñandú#LAN» → `Ñandú#lan`: solo ASCII baja); SteamID64 `76561197960287930` → `22202`;
código de amigo `22202` → `22202`; MLBB «12345678(1234)» y «12345678 1234» → `12345678:1234`; Clash Royale «#2pp» → display `#2PP`, normalized
`2pp`; Smash «SW-1234-5678-9012» → `123456789012`; NBA 2K sin plataforma → «Elige la plataforma.».

### 3.2 `series.ts` (marcador de una serie)

```ts
export interface GameRecord { w?: Side | null; a?: number; b?: number; pa?: number; pb?: number; ot?: boolean; map?: string }
export interface SeriesRules { game: GameId; bestOf: BestOf; draws: boolean; roundsToWin?: 2 | 3; stocks?: number }
export interface SeriesScore {
  text: string;
  sides: [number, number];
  totals: { maps: [number, number]; points: [number, number] };
  games: GameRecord[];
  bestOf: BestOf;
  proof?: string[];   // ids de public.photos (0–3)
  wo?: true;          // W.O.
}

export const needed: (bestOf: BestOf) => number;                               // (bestOf + 1) / 2
export function gameWinner(rules: SeriesRules, g: GameRecord): Side | null;    // null = empate FC; supone válido
export function validateGame(rules: SeriesRules, g: GameRecord, index: number): string | null; // «Mapa 2: en VALORANT se gana con 13 (o por 2 desde 12-12).»
export function validateSeries(rules: SeriesRules, games: readonly GameRecord[], opts: { final: boolean }): string[];
export function seriesWinner(rules: SeriesRules, games: readonly GameRecord[]): Side | null | undefined; // undefined = no ha terminado; null = empate FC
export function buildSeriesScore(rules: SeriesRules, games: readonly GameRecord[], proof?: readonly string[]): SeriesScore;
export function walkoverScore(rules: SeriesRules, absent: 0 | 1 | 2): SeriesScore;
export function seriesText(rules: SeriesRules, score: Pick<SeriesScore, 'games' | 'sides' | 'wo'>): string; // §2.3
export function parseSeriesScore(v: unknown): SeriesScore | null;             // lo que viene de matches.score
/** Las reglas que van en matches.rules de una serie (§9.7): el juego, el mejor de, si hay empates y lo del juego. */
export function seriesRules(game: GameId, settings: TournamentSettings, bestOf: BestOf, stage: 'groups' | 'league' | 'playoffs' | 'bracket'): SeriesRules;
//   draws = game === 'ea_fc' && settings.draws && bestOf === 1 && (stage === 'groups' || stage === 'league')
//   roundsToWin = settings.roundsToWin ?? GAMES[game].roundsToWin?.default; stocks = settings.stocks ?? GAMES[game].stocks?.default
```

Mensajes (exactos, `validateGame`): `val` «Mapa {n}: en VALORANT se gana con 13 (o por 2 desde 12-12).»; `cs`
«Mapa {n}: en CS2 se gana con 13, o en prórroga a 16, 19, 22…»; `win` «Juego {n}: elige quién ganó.»; `goals_ot`
«Juego {n}: no hay empates; la prórroga es a gol de oro (por 1).»; `goals_pen` «Juego {n}: con empate, pon los penales.»
(o «Juego {n}: los penales solo van con empate.»); `points` «Juego {n}: no hay empates.»; `fight` «Juego {n}: quien
gana tiene {rtw} rondas.»; `stocks` «Juego {n}: quien gana tiene de 1 a {stocks} vidas y el otro 0.»; `crowns`
«Juego {n}: de 0 a 3 coronas, y quien gana tiene igual o más.». `validateSeries`: «Faltan juegos: nadie llegó a
{need}.», «Sobra el juego {n}: la serie ya terminó.», «Al mejor de {bo} se juegan como mucho {bo}.».

Pruebas (las mismas filas en `tests/sql/esports.test.ts` con `private.esp_series_ok`):

| Juego, mejor de | Juegos | ¿Final válido? |
|---|---|---|
| VALORANT Bo1 | 13-11 | sí |
| VALORANT Bo1 | 13-12 | **no** |
| VALORANT Bo1 | 14-12 · 15-13 · 20-18 | sí |
| VALORANT Bo1 | 14-11 · 15-12 | **no** |
| CS2 Bo1 | 13-11 · 16-14 · 16-12 · 19-17 | sí |
| CS2 Bo1 | 13-12 · 16-11 · 17-15 · 15-13 | **no** |
| VALORANT Bo3 | 13-9, 7-13, 13-11 | sí (2-1) |
| VALORANT Bo3 | 13-9, 13-7, 13-11 | **no** (sobra el 3.º) |
| VALORANT Bo3 | 13-9 | final **no**; en vivo sí |
| LoL Bo3 | w1 (kills 10-25), w2, w1 | sí |
| Rocket League Bo5 | 3-2 ot, 1-4, 2-0, 0-1, 4-3 ot | sí (3-2) |
| Rocket League Bo5 | 3-1 ot | **no** |
| Rocket League Bo5 | 2-2 | **no** |
| FC Bo1, liga, `draws` | 2-2 | sí, sin ganador |
| FC Bo1, eliminatoria | 2-2 | **no** |
| FC Bo1, eliminatoria | 2-2 pen 4-3 | sí, gana el 1 |
| FC Bo1 | 3-1 pen 4-3 | **no** |
| NBA 2K Bo1 | 98-91 | sí |
| SF6 Bo3 (rtw 2) | w1 2-1, w2 0-2, w1 2-0 | sí |
| SF6 Bo3 | w1 3-1 | **no** |
| TEKKEN 8 Bo3 (rtw 3) | w2 1-3, w2 2-3 | sí |
| Smash Bo3 (3 vidas) | w1 2-0, w1 1-0 | sí |
| Smash Bo3 | w1 0-1 | **no** |
| Clash Royale Bo3 | w1 3-1, w2 1-1, w1 2-0 | sí |
| Clash Royale Bo3 | w2 2-1 | **no** |
| Cualquier juego | W.O. del lado 2 al mejor de 3 | `sides [2, 0]`, `wo`, texto «W.O.» |

Además: `buildSeriesScore` da `totals.points` = suma de `a` y de `b`; `seriesText` de VALORANT Bo3 «2-1 (13-9 7-13
13-11)», Rocket League Bo1 «3-2 (prórroga)», FC «2-2 (4-3 pen.)»; un texto que no cabe en 80 queda solo «3-2».

### 3.3 `standings.ts` (tablas)

Usa `standings`, `tiebreak` y `buildRows` de `src/sports/formats/standings.ts`.

```ts
/** Una serie terminada, con los lados ya como ids de inscritos (esports_entries.id). */
export interface SeriesResultInput {
  id: string; side1: string; side2: string;
  winner: Side | null;          // null = empate (FC)
  walkover?: 0 | 1 | 2 | null;  // lado que no vino
  score: SeriesScore | null;
}
export function seriesMatchResult(m: SeriesResultInput): MatchResult; // totals: { maps, points } (W.O.: maps [need,0], points [0,0])
export const ESPORTS_POINTS: PointsRule;   // { win: 3, draw: 0, loss: 0, walkoverLoss: 0 }
export const FC_POINTS: PointsRule;        // { win: 3, draw: 1, loss: 0, walkoverLoss: 0 }
export function esportsTable(game: GameId, lotSeed?: string): TableConfig;
export function esportsStandings(game: GameId, ids: readonly string[], results: readonly MatchResult[], lotSeed?: string): StandingRow[];
export function tiebreakText(game: GameId): string;

export interface BrResultInput { entryId: string; placement: number | null; kills: number }
export interface BrGameInput { id: string; round: number; gameNo: number; status: 'scheduled' | 'finished' | 'void'; results: readonly BrResultInput[] }
export interface BrPoints { placementPoints: readonly number[]; killPoints: number }
export interface BrRow {
  entryId: string; rank: number; points: number; placementPoints: number; killPoints: number;
  kills: number; wins: number; played: number; lastPlacement: number | null; decidedBy?: string;
}
export const brPointsOf: (p: BrPoints, placement: number | null, kills: number) => number;
export function brStandings(entryIds: readonly string[], games: readonly BrGameInput[], points: BrPoints, lotSeed?: string): BrRow[];
```

- `esportsTable(game)`: `primary: 'maps'` (FC: `'points'`). Criterios, en orden:
  - series (todos menos FC): `tiebreak.points()`, `tiebreak.stat('mapsDiff', 'dif. de ' + mapsWord)`,
    `tiebreak.stat('pointsDiff', 'dif. de ' + pointsWord)`, `tiebreak.h2h()`, `tiebreak.lot(lotSeed)`, con
    `restart: 'h2h'`.
  - FC: `tiebreak.points()`, `tiebreak.stat('pointsDiff', 'dif. de goles')`, `tiebreak.stat('pointsFor', 'goles a
    favor')`, `tiebreak.h2h()`, `tiebreak.lot(lotSeed)`, `restart: 'h2h'`.
- `tiebreakText`: «Orden: ganar la serie 3, perder 0 → dif. de mapas → dif. de rondas → enfrentamiento directo →
  sorteo.» (con las palabras del juego); FC: «Orden (como el fútbol): ganar 3, empatar 1, perder 0 → dif. de goles →
  goles a favor → enfrentamiento directo → sorteo.».
- `brStandings`: solo partidas `finished`. Puntos de una partida = `placementPoints[placement − 1] ?? 0` (0 si no
  jugó) + `kills × killPoints`. Orden: puntos → victorias (puesto 1) → kills → mejor puesto en la **última partida
  terminada** (menor es mejor; sin jugarla, al final) → sorteo (`lotValue(entryId, lotSeed)`). `decidedBy`:
  «victorias», «kills», «última partida», «sorteo». Empates que nada rompe no existen (el sorteo siempre decide).

Pruebas: 3 empatados a puntos que se separan por dif. de mapas; dos empatados en todo que decide el directo; FC con
empates 3-1-0 y dif. de goles; W.O. da 3 y 0 y `maps [2, 0]`; BR con el ejemplo de Free Fire (1.º con 3 kills = 15),
desempate por victorias, por kills y por la última partida; partidas anuladas no cuentan.

### 3.4 `brackets.ts` (fases y cuadros)

```ts
export type StageKind = 'bracket' | 'groups' | 'playoffs' | 'league';
/** Parte del cuadro: ganadores, perdedores, gran final, reinicio, 3.er lugar, grupo o liga. */
export type BracketPart = 'W' | 'L' | 'GF' | 'GF2' | 'P3' | 'G';
export interface Link { key: string; side: Side }
export type SlotSource =
  | { kind: 'entry'; entryId: string }
  | { kind: 'winner'; key: string }
  | { kind: 'loser'; key: string }
  | { kind: 'group'; group: number; place: number }   // solo para mostrar antes de saberlo
  | { kind: 'reset'; side: Side }                     // GF2: los mismos dos de GF
  | { kind: 'bye' };                                  // solo dentro del motor (nunca sale en un plan)
export interface PlannedMatch {
  key: string;            // 'W1-1', 'L2-3', 'GF', 'GF2', 'P3', 'G1-R2-3' (grupo 1, jornada 2, partido 3), 'RR-R4-2'
  part: BracketPart;
  round: number;          // ronda de su parte (o jornada)
  index: number;          // posición en la ronda, desde 0
  group: number | null;   // 0 = A (G); null en cuadros
  stage: string;          // texto que se ve (matches.stage, ≤ 40)
  bestOf: BestOf;
  sides: [SlotSource, SlotSource];
  labels: [string, string]; // «Ganador W1-2», «Perdedor W2-1», «1.º Grupo A», «Por definir»; con inscrito, '' (la UI pone el nombre)
  winnerTo: Link | null;
  loserTo: Link | null;
}
export interface StagePlan { kind: StageKind; matches: PlannedMatch[] }

export function singleEliminationPlan(seeds: readonly string[], o: { thirdPlace: boolean; bestOf: BestOf; finalBestOf: BestOf; kind?: 'bracket' | 'playoffs' }): StagePlan;
export function doubleEliminationPlan(seeds: readonly string[], o: { bracketReset: boolean; bestOf: BestOf; finalBestOf: BestOf; kind?: 'bracket' | 'playoffs' }): StagePlan;
export function roundRobinPlan(entries: readonly string[], o: { double: boolean; bestOf: BestOf }): StagePlan;           // kind 'league', part 'G', group 0, keys 'RR-R{r}-{i}'
export function groupsPlan(seeded: readonly string[], o: { groups: number; double: boolean; bestOf: BestOf }): StagePlan; // kind 'groups', snakeGroups + roundRobin por grupo, keys 'G{g+1}-R{r}-{i}'
export function groupOf(plan: StagePlan): string[][];                                   // los inscritos de cada grupo
export function playoffSeeds(groupTables: readonly (readonly string[])[], perGroup: number): string[]; // crossGroups(...).map(q => q.id)

export interface KeyResult { winner: string | null; loser: string | null }
export interface ResolvedMatch extends PlannedMatch { known: [string | null, string | null] }
export function resolvePlan(plan: StagePlan, results: Readonly<Record<string, KeyResult>>): ResolvedMatch[]; // quién juega cada uno, sabido hasta ahora
export function champion(plan: StagePlan, results: Readonly<Record<string, KeyResult>>): string | null;
export function podium(plan: StagePlan, results: Readonly<Record<string, KeyResult>>): (string | null)[];   // [1.º, 2.º, 3.º, 4.º]
export function partTitle(part: BracketPart, round: number, rounds: number): string;
```

**Eliminación simple.** Usa `createBracket` de `formats/knockout.ts` (siembra estándar y byes para los mejores). Las
llaves pasan de `R{r}-{i}` a `W{r}-{i}` (`P3` igual). Los partidos con bye **no** se crean: el que pasa queda como
`{kind: 'entry'}` en su lugar de la ronda 2. `winnerTo` = el `next` del cuadro; `loserTo` = el `loserNext` (3.er
lugar). La final lleva `finalBestOf`; `P3` y lo demás, `bestOf`. `stage`: `roundName(r, rounds)` («Final»,
«Semifinal», «Cuartos de final», «Octavos de final», «Ronda de 32»), «3.er lugar».

**Doble eliminación** (mínimo 4 inscritos). `S = nextPowerOfTwo(n)`, `k = log2(S)`:

1. Ganadores: rondas 1…k, `S / 2^r` partidos en la ronda r, llaves `W{r}-{i}`; la ronda 1 con `seedOrder(S)`.
2. Perdedores: rondas 1…2(k−1), llaves `L{j}-{i}`:
   - `j = 1`: `S/4` partidos; el partido i = perdedor de `W1-(2i+1)` contra perdedor de `W1-(2i+2)`;
   - `j = 2m` (m = 1…k−1): `S / 2^(m+1)` partidos; el partido i = ganador de `L{j−1}-(i+1)` (lado 1) contra perdedor
     de un partido de `W{m+1}` (lado 2). Los perdedores de `W{m+1}` bajan en **orden invertido** si `m+1` es par y
     en el mismo orden si es impar (así, con 8, el perdedor de `W2-2` cae contra quien salió del lado de `W2-1`: no
     se repite enseguida el cruce de la ronda 1);
   - `j = 2m+1` (m = 1…k−2): `S / 2^(m+2)` partidos; el partido i = ganador de `L{j−1}-(2i+1)` contra ganador de
     `L{j−1}-(2i+2)`.
3. `GF`: ganador de `W{k}-1` (lado 1) contra ganador de `L{2(k−1)}-1` (lado 2). `GF2` (con `bracketReset`):
   `[{kind:'reset', side:1}, {kind:'reset', side:2}]`, `winnerTo`/`loserTo` null (lo llena la base, §9.8).
4. **Byes y colapso.** Los partidos de `W1` con bye no se crean: el que pasa queda como `entry` en `W2` y su
   «perdedor» es `bye`. Después, una y otra vez: un partido con un lado `bye` desaparece y su otro lado ocupa su
   lugar donde se usaba su ganador (si los dos son `bye`, su ganador es `bye`). Al final se recalculan `winnerTo` y
   `loserTo` desde las fuentes. Las llaves no se renumeran (puede faltar `L1-2`).
5. Mejor de: `bestOf` en todo, `finalBestOf` en `GF` y `GF2`.
6. `stage`: ganadores «Ganadores · {roundName}» (la última ronda: «Final de ganadores»); perdedores «Perdedores ·
   Ronda {j}» (la última: «Final de perdedores»); «Gran final»; «Gran final · reinicio».

**Podio** (DE): 1.º y 2.º de `GF2` si se jugó, si no de `GF`; 3.º el perdedor del último partido de perdedores; 4.º el
perdedor del partido de perdedores anterior si su ronda tiene un solo partido (si no, null). Simple: final y `P3`.

**Grupos.** `snakeGroups(seeded, groups)` y `roundRobin` de `formats` por grupo; `stage` «Grupo A · Jornada 2».
**Todos contra todos** (liga): `stage` «Jornada 3». Ida y vuelta con `double`.

Pruebas:

- Simple con 8: 7 partidos (+1 con `P3`); con 5: los 3 mejores pasan solos, se crean 4 partidos (sin byes).
- Doble con 8: 7 de ganadores, 6 de perdedores, `GF` y `GF2` = 15; `L2-1` lado 2 = perdedor de `W2-2`; `W1-1`
  `loserTo` = `L1-1` lado 1; `L4-1` lado 2 = perdedor de `W3-1`; `GF` lado 2 = ganador de `L4-1`.
- Doble con 4: `W1-1`, `W1-2`, `W2-1`, `L1-1`, `L2-1`, `GF` (+`GF2`).
- Doble con 5 (S = 8, 3 byes): ningún partido tiene un lado `bye`; todos los enlaces apuntan a partidos que existen;
  cada inscrito puede perder dos veces antes de quedar fuera (se simula con resultados al azar 50 veces: nadie queda
  eliminado con una sola derrota, salvo en `GF2`).
- Doble con 6 y con 12 (sin repetir llaves, todo partido alcanzable).
- `resolvePlan` con resultados parciales; `champion` con y sin reinicio; `podium`.
- Grupos: 8 en 2 grupos = 12 partidos; `playoffSeeds` cruza 1A–2B y 1B–2A.

### 3.5 `seeding.ts` (siembra y balance)

```ts
export type SeedingMethod = 'manual' | 'random' | 'rank';
export interface SeedEntry { id: string; ordinals: readonly (number | null)[] } // ordinal del rango de cada miembro titular
export function entryStrength(ordinals: readonly (number | null)[], teamSize: number): number | null; // promedio de los `teamSize` mejores con rango; null si nadie tiene
export function seedEntries(entries: readonly SeedEntry[], method: SeedingMethod, o: { seed: string; teamSize: number; manual?: readonly string[] }): string[];
//   manual: el orden de `manual` (los que falten, al final en su orden); random: shuffle(seededRandom(seed));
//   rank: por entryStrength descendente, sin rango al final, empates con lotValue(id, seed).
export interface FreeAgent { userId: string; ordinal: number | null }
/** strength = suma de los ordinales de sus titulares (null si ninguno tiene rango). */
export interface BalancedTeam { members: { userId: string; role: 'captain' | 'member' | 'sub' }[]; strength: number | null }
export function balanceTeams(agents: readonly FreeAgent[], o: { teamSize: number; subs: number; seed: string }): { teams: BalancedTeam[]; leftover: string[] };
```

`balanceTeams`: se ordenan por ordinal (sin rango al final; empates con `lotValue(userId, seed)`); `T =
floor(n / teamSize)` equipos (0 → todos sobran); los primeros `T × teamSize` se reparten en **serpiente** (ronda par
de izquierda a derecha, impar al revés); el capitán de cada equipo es su primer elegido; los que sobran entran como
suplentes al equipo de menor fuerza que tenga lugar (`subs`), y el resto queda en `leftover`.

Pruebas: 10 agentes de rango 1…10 en equipos de 5 → fuerzas 28 y 27 (serpiente); 11 con 1 suplente → el 11.º va al
más débil; sin rangos → reparto por sorteo estable (misma semilla, mismo resultado); `seedEntries` por rango con
empates.

### 3.6 `settings.ts` (ajustes del torneo, `esports_tournaments.settings`)

```ts
export type Format = 'single_elim' | 'double_elim' | 'groups_playoffs' | 'round_robin' | 'br';
export type EntryType = 'teams' | 'open';
export interface TournamentSettings {
  subs: number;                 // suplentes permitidos (0…subsMax)
  autoApprove: boolean;         // false
  requireConfirmedId: boolean;  // false; solo cuenta si canVerifyId(game)
  requireVerifiedRank: boolean; // false; solo cuenta si canVerifyRank(game) (LoL)
  seeding: SeedingMethod;       // 'random'
  bestOf: { groups: BestOf; playoffs: BestOf; final: BestOf }; // del catálogo; BR: { 1, 1, 1 } (no se usa)
  thirdPlace: boolean;          // false
  bracketReset: boolean;        // true
  groups: number;               // 2 (1–8)
  perGroup: number;             // 2 (1–4)
  playoffs: 'single' | 'double'; // 'single'
  doubleRoundRobin: boolean;    // false
  draws: boolean;               // ea_fc: true; resto: false
  platform: string;             // '' (NBA 2K: la plataforma del torneo, obligatoria)
  roundsToWin?: 2 | 3;          // fight
  stocks?: number;              // smash (1–5)
  br?: { placementPoints: number[]; killPoints: number; rounds: number; gamesPerRound: number };
}
export function defaultSettings(game: GameId, mode: Mode, format: Format): TournamentSettings;
export function validateSettings(game: GameId, mode: Mode, format: Format, entry: EntryType, maxEntries: number, s: unknown): string[];
export const FORMAT_LABEL: Record<Format, string>;  // «Eliminación simple», «Doble eliminación», «Grupos + playoffs», «Todos contra todos», «Battle royale»
export const ENTRY_LABEL: Record<EntryType, string>; // «Solo equipos», «Libre»
export function formatsFor(game: GameId): Format[]; // BR: ['br']; resto: los 4 de partidos
export function entryTypesFor(game: GameId, mode: Mode): EntryType[]; // modo individual: ['open']; resto: ['teams', 'open']
```

**Rangos y tipos de cada clave** (los mismos en `private.esp_settings_ok`, §9.4; una clave que no está aquí es
inválida; todas son opcionales en la base y el teléfono siempre manda todas las de su juego):

| Clave | Tipo y rango |
|---|---|
| `subs` | entero 0–2 y ≤ `subsMax(game, mode)` |
| `autoApprove`, `requireConfirmedId`, `requireVerifiedRank`, `thirdPlace`, `bracketReset`, `doubleRoundRobin`, `draws` | booleano |
| `seeding` | `'manual' \| 'random' \| 'rank'` |
| `bestOf` | objeto `{groups, playoffs, final}`, cada uno dentro de `bestOf` permitido del juego (BR: ignorado, se acepta `{1,1,1}`) |
| `groups` | entero 1–8 |
| `perGroup` | entero 1–4 |
| `playoffs` | `'single' \| 'double'` |
| `platform` | `''` o una plataforma del juego; obligatoria (no vacía) en NBA 2K |
| `roundsToWin` | 2 o 3, solo en `fight`; SF6 solo 2 |
| `stocks` | entero 1–5, solo en Smash |
| `br` | solo en BR: `placementPoints` arreglo de 1–100 enteros 0–100; `killPoints` entero 0–10; `rounds` 1–10; `gamesPerRound` 1–12 |

Al armar o normalizar los ajustes de un juego, `requireConfirmedId` queda `false` si `!canVerifyId(game)` y
`requireVerifiedRank` queda `false` si `!canVerifyRank(game)` (la base, además, los ignora en esos juegos, §5.2).

`validateSettings` además revisa (solo en el teléfono, en español): `groups × perGroup` ≥ 2 y ≤ el cupo, y que con
`maxEntries` cada grupo tenga al menos `perGroup + 1`; «Para doble eliminación hacen falta al menos 4.»; cupo dentro
de `minEntries…maxEntries` del formato.

### 3.7 `tournament.ts` (lo que se calcula al leer)

```ts
export type Phase = 'soon' | 'registration' | 'checkin' | 'closed' | 'live' | 'finished' | 'cancelled';
export interface PhaseInput {
  status: 'registration' | 'live' | 'finished' | 'cancelled';
  startsAt: string; registrationOpensAt: string | null; registrationClosesAt: string; checkinMinutes: number | null;
}
export function tournamentPhase(t: PhaseInput, now: number): Phase;
//   cancelled/finished/live: el status. registration: antes de opensAt 'soon'; hasta closesAt 'registration';
//   con check-in, desde startsAt − checkinMinutes hasta startsAt + 30 min 'checkin' (puede convivir con la inscripción:
//   gana 'checkin' si la inscripción ya cerró); si no, 'closed'.
export const canRegister: (t: PhaseInput, now: number) => boolean;   // phase === 'registration' (o 'checkin' con la inscripción todavía abierta)
export const canCheckIn: (t: PhaseInput, now: number) => boolean;
export const PHASE_TEXT: Record<Phase, string>; // «Pronto», «Inscripción abierta», «Check-in abierto», «Inscripción cerrada», «En curso», «Terminado», «Cancelado»
export function formatLine(t: { game: GameId; mode: Mode; format: Format; entryType: EntryType }): string; // «5 contra 5 · Doble eliminación · Solo equipos»
export function stagesFor(format: Format, playoffs?: 'single' | 'double'): StageKind[]; // single/double → ['bracket']; groups_playoffs → ['groups','playoffs']; round_robin → ['league']; br → []
```

---

## 4. El modelo de datos de un vistazo

```
profiles ─┬─ esports_game_ids (1 por cuenta·juego·plataforma; único por (game, platform, id_normalized) solo con login)
          ├─ esports_team_members ── esports_teams (globales: juego, nombre, tag, logo, capitán) ── esports_team_secrets (código)
          └─ esports_id_moves (avisos «Tu ID pasó a otra cuenta», §6.4)

leagues (sport 'esports', rules {game}; kind 'torneo' = torneo suelto, 'liga' = liga de esports)
  └─ events (type 'torneo')
       └─ esports_tournaments (1:1: juego, modo, entrada, formato, estado, ventana, cupo, ajustes)
            ├─ esports_entries (inscritos: equipo | individual | agente libre; pending/approved/…)
            │    └─ esports_entry_members (la foto de la plantilla: cuenta, rol, ID de juego y rango)
            │         └─ (al aprobar) league_members + players + teams (de temporada) + team_players
            ├─ matches (una serie por fila) ── esports_matches (fase, parte del cuadro, mejor de, a dónde va el ganador y el perdedor)
            └─ esports_br_games (partidas BR) ── esports_br_results (puesto y kills por inscrito)
private: esports_lookups (búsquedas de esports-verify, 15 min), esports_link_states (state de «Conectar con…», 10 min)
```

**Qué se reutiliza tal cual:** `create_league` (dentro de `esports_create_tournament`), `create_matches` (dentro de
`esports_create_stage`), `finish_match`, `confirm_result`, `dispute_result`, `resolve_dispute`,
`admin_correct_result`, `set_walkover`, `reschedule_match`, `postpone_match`, `void_match`, `claim_scorer` (no se usa
modo cancha en esports, ver §13), `add_photo`, `set_member_scorer` y los links para anotar (anotadores de BR), el
código de invitación de la liga (torneos privados), `update_league`, `delete_league`, `set_league_logo` (logo del
torneo), la consola.

---

## 5. Torneos: la vida de un torneo

### 5.1 Las dos entradas

| | «Solo equipos» (`teams`) | «Libre» (`open`) |
|---|---|---|
| Modos | todos menos los de 1 titular | todos |
| Quién se inscribe | el **capitán** de un equipo de esports **de ese juego**, eligiendo la plantilla de sus miembros | cada persona: en modo individual (duelos, RL 1v1, BR solo) como **individual**; en modos de equipo, **con su equipo** (igual que en «Solo equipos») o como **agente libre** |
| Kind del inscrito | `team` | `player` (individual), `team` o `free_agent` |
| Después | — | el organizador **asigna** agentes libres a un equipo inscrito con lugar, o **arma equipos** con ellos (a mano o «Balancear por rango», §3.5) |

En «Libre», «armar equipo al inscribirse» es **crear un equipo de esports** (persistente) e inscribirlo, y «unirse
a un equipo» es entrar con su código y que el capitán lo sume a la plantilla de la inscripción. Los equipos que arma
el organizador con agentes libres son **del torneo** (`team_id` null), con nombre «Equipo 1…N» que puede cambiar.

### 5.2 Reglas de la inscripción (las revisa la base)

1. El torneo está en `registration` y `now()` está entre `registration_opens_at` (o siempre, si es null) y
   `registration_closes_at` → si no, `cerrado`.
2. Torneo privado: la cuenta es miembro de la liga (entró con el código) → si no, `no_permitido`.
3. Cupo: hay menos aprobados (`team` + `player`) que `max_entries` → si no, `cupo_lleno`. Los agentes libres no
   cuentan en el cupo (tope: `max_entries × modeSize`).
4. Cada persona de la plantilla:
   - tiene su ID de juego de ese juego (y de la plataforma del torneo en NBA 2K) → si no, `sin_id`;
   - si `requireConfirmedId` (por defecto `false`) **y** el juego tiene comprobación (`esp_verify_kind(game) <>
     'none'`): `status 'confirmado'` → si no, `id_sin_comprobar`. En los juegos sin comprobación, tener el ID puesto
     basta;
   - si `requireVerifiedRank` **y** el juego da rango verificado (`esp_rank_verifiable(game)`, solo LoL):
     `rank_source 'verificado'` con rango para la clave del modo → si no, `sin_rango`. En los demás juegos se ignora;
   - no está en otra inscripción **viva** (`pending`, `approved`) de este torneo → si no, `duplicado`.
5. Equipo: quien inscribe es su capitán; el juego del equipo es el del torneo; la plantilla son miembros actuales del
   equipo, **entre `modeSize` y `modeSize + subs`** personas, con el capitán adentro, al menos `modeSize` titulares
   (capitán + `member`) y como mucho `subs` con rol `sub` → si no, `invalido`. Un equipo no se inscribe dos veces vivo en el
   mismo torneo → `duplicado`.
6. Con `autoApprove` la inscripción queda `approved` (y se materializa) en el mismo momento; si no, `pending`.

La plantilla inscrita es una **foto** (`esports_entry_members`: nombre, ID de juego y rango del momento). Cambiar
después el equipo de esports no cambia la inscripción; el capitán la rehace con `esports_set_entry_roster` mientras
el torneo está en `registration`. Desde que empieza (`live`), solo el organizador.

### 5.3 Aprobar y materializar

`esports_decide_entry(p_entry, true)` (admin): cupo (`cupo_lleno`), y `private.esp_materialize(entry)`:

1. Cada miembro: `league_members` (rol `member`, `display_name` de la foto) si no estaba; `players` (`league_id`,
   `user_id`, `name`) si no tenía; guarda `player_id` en la foto. **No** usa `ensure_player` (no deja reclamos por
   nombre).
2. Un equipo de temporada `teams` (`event_id` null, `name` = el del inscrito, `sort_order` = siembra o 999).
3. `team_players`: el capitán `captain`; los demás `player`; los suplentes `player` con `position 'suplente'`.
4. `esports_entries.side_team_id` = ese equipo.

Rechazar (`false`, con nota) un aprobado, o retirarse (`esports_withdraw`), mientras el torneo está en
`registration`: se borra el equipo de temporada (cascada en `team_players`) y las filas de la foto; la membresía y el
jugador se quedan (no molesta). Ya en `live`, rechazar o retirar da `cerrado` (el organizador da W.O.).

Push (tag `esports:entry:<entry>`, categoría «Tus ligas»): «Te aprobaron en {torneo}» / «No aprobaron tu inscripción
en {torneo}» (+ la nota) al capitán; a los admins de la liga, al llegar una pendiente: «{equipo} se inscribió en
{torneo}» (tag `esports:pend:<evento>`, agrupado: «{n} inscripciones por revisar»).

### 5.4 Check-in

Con `checkin_minutes` (10–180), desde `starts_at − checkin_minutes` hasta `starts_at + 30 min`, el capitán (o el
individual) de un inscrito aprobado marca «Check-in» (`esports_check_in`). El organizador lo marca o lo quita cuando
quiera. Al armar el cuadro la pantalla ofrece «Dejar fuera a los que no hicieron check-in» (los rechaza antes de
crear la fase). Sin check-in, todos los aprobados entran.

### 5.5 Siembra, fases y estado

- **Siembra** (`esports_set_seeds(p_event, p_order uuid[])`, admin): el orden de los aprobados (todos). La pantalla
  la calcula con `seedEntries` (manual con flechas, al azar con la semilla = id del evento, o por rango con los
  ordinales de la foto).
- **Crear una fase** (`esports_create_stage`, admin): la pantalla arma el plan con el motor (`singleEliminationPlan`,
  `doubleEliminationPlan`, `groupsPlan`, `roundRobinPlan`) y la capa de datos le pone un id a cada llave, cambia
  `entry` por el `entry_id` y los `Link` por `{id, side}`. La base crea los partidos (con `create_matches`), los
  enlaces y pasa el torneo a `live`.
- **Grupos → playoffs**: con los grupos terminados (todas sus series finales), «Pasar a playoffs» calcula las tablas
  (`esportsStandings` por grupo), `playoffSeeds(..., perGroup)` y crea la fase `playoffs` (simple o doble).
- **Borrar una fase** sin resultados (`esports_delete_stage`): para rehacer el cuadro. Si no queda ninguna fase ni
  partida BR, el torneo vuelve a `registration`.
- **Estado** (`esports_set_status`, admin): `registration → live` (BR: «Empezar»), `live → finished` («Cerrar
  torneo»), `registration|live → cancelled`, `live → registration` solo sin partidos ni partidas, `cancelled →
  registration`.

### 5.6 Resultados de una serie

| Paso | Quién | Cómo |
|---|---|---|
| Anotar | el capitán (o delegado) de un lado, el admin o un anotador | Hoja «Anotar resultado» (§12.8): mapa por mapa con la regla del juego; la pantalla arma el `score` con `buildSeriesScore` y lo manda con `finishMatch(lid, id, {score, winner})`. Las capturas se suben antes (`addMatchProof`) y sus ids van en `score.proof`. |
| Confirmar | el capitán del otro lado (o el admin) | `confirmResult` (`ConfirmResultBanner`). A las 48 h cuenta solo. |
| Reclamar | el capitán del otro lado, en 48 h | `disputeResult` con nota. |
| Decidir | el admin | `resolveDispute` (con o sin marcador nuevo) o `adminCorrectResult`. |
| W.O. | el admin | `setWalkover(lid, id, absent, {score: walkoverScore(rules, absent)})`. |
| Avanzar el cuadro | la base | trigger `matches_esp_advance` (§9.8) al quedar `confirmed` o `walkover`; `esports_sync` para lo que pasó a final por las 48 h. |

Lo que anota el admin o un anotador queda confirmado (como en todos los deportes).

### 5.7 Battle royale

- Partidas en **rondas** («Jornada 1 · Partida 3»). El organizador (o un anotador) crea cada partida y anota, por
  inscrito, el **puesto** (único por partida; vacío = no jugó) y las **kills** (`esports_br_save_game`, todo junto,
  reemplaza lo anterior de esa partida), con capturas (`proof`, 0–3 fotos).
- La tabla acumulada sale de `brStandings` con los puntos del torneo (`settings.br`).
- No hay confirmación del rival: lo que anota el organizador es lo que vale (los capitanes ven todo y le escriben).

---

## 6. IDs de juego y rangos (el flujo)

### 6.1 Escribir, declarar y buscar el ID

1. La persona elige el juego (y la plataforma en NBA 2K; la región en VALORANT, LoL y Free Fire) y escribe su ID y, si
   quiere, su rango (`RankPicker`). El teléfono lo normaliza (`normalizeGameId`) y lo guarda con
   `esports_save_game_id` (+ `esports_set_ranks` si puso rango): fila `pendiente`, `ownership 'declarado'`. En los 10
   juegos sin comprobación (`verify.kind 'none'`, §7) eso es todo: el ID queda **declarado**. Sin código, sin
   capturas, sin revisión.
2. LoL y VALORANT (`verify.kind 'lookup'`), si `esports-verify` tiene la búsqueda encendida (`RIOT_API_KEY`): «Buscar»
   guarda (declarado) y llama `esports-verify` `{action: 'lookup'}`:
   - `found`: «¿Eres tú?» con el nombre que dio Riot (y, en LoL, el rango que encontró) → «Sí, soy yo» llama
     `esports_confirm_game_id(p_lookup)`: `confirmado`, `ownership 'busqueda'` y, en LoL con rango, `rank_source
     'verificado'`. «No soy yo» vuelve al campo;
   - `not_found`: «No encontramos ese Riot ID. Revisa cómo lo escribiste.» con «Guardarlo así» (queda declarado);
   - `no_disponible` / `error` / `rate_limited`: queda guardado y declarado.
3. Rocket League, Fortnite y CS2 (`verify.kind 'login'`): el ID escrito queda declarado; para comprobarlo,
   «Conectar con Epic» o «Conectar con Steam» (§6.3).
4. **Exclusividad.** Un ID declarado o comprobado por búsqueda **no** es exclusivo: varias cuentas pueden tenerlo
   (nadie se adueña de un ID que no puede probar). Solo lo es un ID conectado con login: si otra cuenta lo tiene así,
   `esports_save_game_id` y `esports_confirm_game_id` dan `id_tomado` (§12.6).

Cambiar el ID lo deja `pendiente` y `declarado` otra vez (y borra lo comprobado y lo verificado). No se puede cambiar
ni borrar mientras la cuenta esté en una inscripción aprobada de un torneo `live` de ese juego (`cerrado`). Un ID
conectado con login (`ownership 'login'`) no se edita: se quita y se vuelve a conectar.

### 6.2 Rango

- **Declarado** (todos los juegos): lo elige con las escaleras del catálogo (RL por modo, con MMR opcional que propone
  el rango, «aprox., temporada actual»). `esports_set_ranks`.
- **Verificado** (solo LoL, `verify.rank`): viene de la búsqueda con `RIOT_API_KEY` (league-v4). La búsqueda de
  VALORANT solo dice si el Riot ID existe: su rango queda declarado.
- En pantalla, `RankChip`: «Diamante 2 · Verificado» solo con `rank_source 'verificado'`; si no, «Oro IV · Declarado».

### 6.3 Conectar la cuenta (login) y mover el ID

«Conectar con Steam» (CS2), «Conectar con Epic» (Rocket League, Fortnite) y «Conectar con Riot» (LoL, VALORANT; solo
cuando Riot apruebe la app) salen en la hoja del ID solo si `esports-verify` dice que están encendidos (`{action:
'providers'}`). El flujo está en §8.3 (`esports-auth`). Al volver, el ID queda `confirmado` con `ownership 'login'`,
el `external_id` y el nombre de la cuenta del proveedor (`lookup_name`); el rango no cambia.

**Si otra cuenta lo tenía conectado** (con login, el mismo `id_normalized` o el mismo `external_id`, mismo juego), el
login prueba que es de quien entró ahora: `esports_link_account` **borra la fila de la otra cuenta** y, por cada una:

- una fila en `public.esports_id_moves` (el aviso en la app, §6.4);
- push a esa cuenta: «Tu ID {X} de {Juego} pasó a otra cuenta» · «Alguien entró con esa cuenta de {Epic|Steam|Riot}
  en otra cuenta de MatchMate.» → `/esports/mi-id?juego=<game>` (tag `esports-id:login:<user>`, vence en 7 días);
- `admin_audit` `esports_id_login` (`{game, idDisplay, by, provider}`).

Las filas declaradas o comprobadas por búsqueda de otras cuentas no se tocan.

### 6.4 El aviso «Tu ID pasó a otra cuenta» (en lugar de los reclamos)

- `esports_my_id_moves()` da los avisos no vistos de los últimos 30 días, los más nuevos primero (`useMyIdMoves`).
- Sale como aviso (`NoticeSlot`) en «Mi ID de juego», en Esports y en Hoy: «Tu ID {X} de {Juego} pasó a otra cuenta» ·
  «Alguien entró con esa cuenta de {Epic} en otra cuenta de MatchMate.» · acción «Ver» (`/esports/mi-id?juego=<g>`).
  Al cerrarlo, `seenIdMove(id)` (`esports_seen_id_move`).
- No hay reclamos: si el ID es tuyo, lo conectas tú con tu inicio de sesión y vuelve a tu cuenta (el mismo flujo de
  §6.3). En los juegos sin comprobación no hay nada que reclamar: el ID declarado no es exclusivo.

---

## 7. Comprobación por juego

La tabla del catálogo (`verify`, `link`, `lookup` en `catalog.ts`; en SQL, `private.esp_verify_kind` y
`private.esp_rank_verifiable`, §9.10). La prueba del catálogo y la prueba SQL la recorren entera.

| Juego | `verify.kind` | `link` | `lookup` | `verify.rank` | Lo que ve la persona |
|---|---|---|---|---|---|
| Rocket League, Fortnite | `'login'` | `'epic'` | false | false | «Conectar con Epic» → «Cuenta conectada» |
| CS2 | `'login'` | `'steam'` | false | false | «Conectar con Steam» → «Cuenta conectada» |
| LoL | `'lookup'` | `'riot'` (el botón sale solo con Riot Sign On configurado) | true | **true** | «Buscar» → «Comprobado» y el rango «· Verificado» |
| VALORANT | `'lookup'` | `'riot'` (el botón sale solo con Riot Sign On configurado) | true | false | «Buscar» → «Comprobado» (solo que existe) |
| MLBB, EA SPORTS FC, NBA 2K, SF6, TEKKEN 8, Smash, Clash Royale, Free Fire, Warzone, PUBG Mobile | `'none'` | null | false | false | «Guardar» → «Declarado» |

Chips (`IdChip`, por `ownership`): «Cuenta conectada» (`login`) y «Comprobado» (`busqueda`) en tono ok; «Declarado»
neutro. `RankChip`: «{rango} · Verificado» solo con `rank_source 'verificado'`; si no, «{rango} · Declarado».

En modo local (`useProviders` todo apagado, la búsqueda da `no_disponible`) todo queda «Declarado», sin errores.

---

## 8. Las Edge Functions `esports-verify` y `esports-auth`

Dos funciones (nombres fijos: el dueño ya registra las apps con ellos):

- **`esports-verify`**: buscar un Riot ID con la API de Riot (LoL y VALORANT) y decir qué está encendido.
- **`esports-auth`**: conectar la cuenta (Steam OpenID 2.0, Epic Account Services, Riot Sign On): el inicio y las
  vueltas (callbacks).

### 8.1 Archivos, secretos y URLs

| Archivo | Qué es |
|---|---|
| `supabase/functions/esports-verify/index.ts` | Arma las dependencias (como `delete-account/index.ts`: cliente con la clave secreta, `auth.getClaims` para el JWT, CORS con `SCAN_ALLOWED_ORIGINS`). |
| `supabase/functions/esports-verify/core.ts` | `handleVerifyRequest(req, deps)`: todo lo que se prueba. |
| `supabase/functions/esports-auth/index.ts` | Igual, para el login. |
| `supabase/functions/esports-auth/core.ts` | `handleAuthRequest(req, deps)`. |
| `supabase/functions/_shared/esports-providers.ts` | Los adaptadores (`riotLookup`, `steamOpenId` y `steamPersonaName`, `epicOAuth`, `riotOAuth`), cada uno con `fetch` inyectado. |
| `supabase/config.toml` | `[functions.esports-verify]` y `[functions.esports-auth]` con `verify_jwt = false` (el callback llega sin JWT; lo demás valida el JWT en `core.ts`). |

**Secretos** (Supabase › Edge Functions › Secrets; nombres exactos, todos opcionales: cada cosa se enciende solo si
están los suyos):

| Secreto | Enciende |
|---|---|
| `RIOT_API_KEY` | Búsqueda de Riot ID (account-v1) en LoL y VALORANT; rango de LoL (league-v4). VALORANT: solo «existe / no existe». |
| `RIOT_CLIENT_ID`, `RIOT_CLIENT_SECRET` | «Conectar con Riot» (Riot Sign On; Riot lo aprueba para producción). |
| `EPIC_CLIENT_ID`, `EPIC_CLIENT_SECRET` | «Conectar con Epic» (Epic Account Services). |
| `STEAM_WEB_API_KEY` | Opcional: el nombre del perfil de Steam al conectar (`steamPersonaName`). «Conectar con Steam» (OpenID) **no** la necesita: está siempre encendido. |

Se reutilizan los que ya existen: `SCAN_ALLOWED_ORIGINS` (CORS) y las claves de Supabase. La URL de la app a la que
vuelve el login es la constante `APP_URL = 'https://matchmate-oficial.vercel.app'` (si existe la variable
`APP_ORIGIN`, gana ella: sirve para staging). Las URLs de vuelta se arman con `SUPABASE_URL`.

**URLs** (ref del proyecto de producción `jbismsdjgjxutfvwnlmf`):

| Para qué | URL |
|---|---|
| Vuelta de Epic (se registra en Epic) | `https://jbismsdjgjxutfvwnlmf.supabase.co/functions/v1/esports-auth/epic/callback` |
| Vuelta de Riot (se registra en Riot) | `https://jbismsdjgjxutfvwnlmf.supabase.co/functions/v1/esports-auth/riot/callback` |
| Vuelta de Steam (`openid.return_to`; no se registra) | `https://jbismsdjgjxutfvwnlmf.supabase.co/functions/v1/esports-auth/steam/callback` (`openid.realm` = `https://jbismsdjgjxutfvwnlmf.supabase.co`) |
| A dónde vuelve la persona | `https://matchmate-oficial.vercel.app/esports/mi-id?conectado=<steam\|epic\|riot>&juego=<juego>` o `…/esports/mi-id?error=<codigo>&juego=<juego>` |
| Sitio, privacidad y términos (lo piden los proveedores) | `https://matchmate-oficial.vercel.app`, `…/privacidad`, `…/terminos` |

### 8.2 `esports-verify` (POST con `Authorization: Bearer <jwt>`)

| `action` | Cuerpo | Respuesta | Qué hace |
|---|---|---|---|
| `providers` | — | `{ lookup: GameId[], link: { steam: boolean, epic: boolean, riot: boolean } }` | Lo que está encendido según los secretos: `lookup` = `['valorant', 'lol']` (en el orden del catálogo) con `RIOT_API_KEY`, si no `[]`; `link.steam` siempre true. |
| `lookup` | `{ game, id, platform?, region? }` (solo `lol` y `valorant`) | `{ status: 'found', lookupId, displayName, ranks }` o `{ status: 'not_found' \| 'no_disponible' \| 'rate_limited' \| 'error' }` | `esports_begin_lookup(p_user, p_game, p_id, p_platform)`: la base normaliza (la misma `esp_normalize_id`, así la función no importa TypeScript de `src/`) y cuenta la búsqueda (20 por hora y 60 por día) → `{ok: false, reason: 'rate_limited' \| 'invalido'}` o `{ok: true, display, normalized}`; con `display` (`Nombre#TAG`) llama a `riotLookup` y guarda con `esports_store_lookup(...)`. `invalido` → `{status: 'not_found'}`. |

No hay otras acciones. **Adaptador de búsqueda** (devuelve `{ found: boolean; displayName?: string; externalId?:
string; ranks?: RankMap }`):

- `riotLookup` (LoL, VALORANT): región → ruta regional (`la1`, `la2`, `na1`, `br1`, `latam`, `na`, `br` → `americas`;
  `euw1`, `eun1`, `eu` → `europe`; `kr`, `jp1`, `ap` → `asia`; `oc1` → `sea`).
  `GET https://{regional}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{nombre}/{tag}` (cabecera
  `X-Riot-Token`) → `puuid`. LoL: `GET https://{plataforma}.api.riotgames.com/lol/league/v4/entries/by-puuid/{puuid}`
  → la entrada `RANKED_SOLO_5x5`: `tier` (`IRON`…`CHALLENGER` → `iron`…`challenger`) y `rank` (`I`–`IV` → `div`
  1–4; de Maestro para arriba sin división). Sin entrada: sin rango. VALORANT: solo account-v1 (`ranks` `{}`).
- Otro juego, o sin `RIOT_API_KEY`: `no_disponible`.

Errores del proveedor (5xx o más de 6 s) → `error`; 429 → `rate_limited`. Nunca se devuelve la respuesta cruda ni
una clave.

### 8.3 `esports-auth` (conectar la cuenta)

| Petición | Qué hace |
|---|---|
| `POST /esports-auth/start` con JWT, `{ provider: 'steam' \| 'epic' \| 'riot', game }` | Revisa que el proveedor esté encendido y sea el del juego (`GAMES[game].link`: Steam → CS2; Epic → Rocket League y Fortnite; Riot → LoL y VALORANT), `esports_link_begin(p_user, p_provider, p_game)` → `state` (uuid, 10 min, un uso) y devuelve `{ status: 'ok', url }` o `{ status: 'no_disponible' }`. El teléfono hace `location.assign(url)`. |
| `GET /esports-auth/steam/callback?state=…&openid.*` | `esports_link_take(p_state)` → `{user_id, provider, game}`; comprueba la aserción con un POST a `https://steamcommunity.com/openid/login` con `openid.mode=check_authentication` (respuesta `is_valid:true`); el SteamID64 sale de `openid.claimed_id` (`https://steamcommunity.com/openid/id/<17 dígitos>`); el nombre, con `STEAM_WEB_API_KEY` si está. |
| `GET /esports-auth/epic/callback?code=…&state=…` | Cambia el `code` por el token (`POST https://api.epicgames.dev/epic/oauth/v2/token`, `grant_type=authorization_code`, Basic con `EPIC_CLIENT_ID:EPIC_CLIENT_SECRET`) → `account_id`; el nombre con `GET https://api.epicgames.dev/epic/id/v2/accounts?accountId=…`. Se autoriza en `https://www.epicgames.com/id/authorize` (`scope=basic_profile`). |
| `GET /esports-auth/riot/callback?code=…&state=…` | Token en `POST https://auth.riotgames.com/token` (Basic con `RIOT_CLIENT_ID:RIOT_CLIENT_SECRET`) y la cuenta en `GET https://americas.api.riotgames.com/riot/account/v1/accounts/me` (Bearer) → `puuid`, `gameName`, `tagLine`. Se autoriza en `https://auth.riotgames.com/authorize` (`scope=openid`). |

Al final de cada vuelta: `esports_link_account(p_user, p_game, p_provider, p_external_id, p_display)` (§9.5) y un 302 a
`{APP_URL}/esports/mi-id?conectado=<provider>&juego=<game>` o `{APP_URL}/esports/mi-id?error=<codigo>&juego=<game>`,
con `codigo` ∈ `estado_vencido` (state que no existe, vencido o usado), `proveedor` (el proveedor dijo que no o la
aserción no es válida) y `no_disponible`. (`esports_link_account` ya no da `id_tomado`: mueve el ID, §6.3.)

### 8.4 Pruebas (`src/lib/esportsFunctions.test.ts`, con `fetch` de mentira)

- Sin secretos: `providers` da `lookup: []`, `link: {steam: true, epic: false, riot: false}`;
  `lookup` de LoL → `no_disponible`.
- Con `RIOT_API_KEY`: `providers` da `lookup: ['valorant', 'lol']`; `lookup` de LoL encuentra y mapea `GOLD`/`II` →
  `{tier: 'gold', div: 2}`; VALORANT encontrado → `ranks {}`; un juego sin búsqueda (Clash Royale, CS2) →
  `no_disponible`; 404 → `not_found`; 429 → `rate_limited`; 500 → `error`; `{action: 'challenge'}` → 400
  (`invalido`).
- Sin JWT → 401; un origen fuera de `SCAN_ALLOWED_ORIGINS` → 403.
- `start` de Steam arma `openid.return_to` con el `state`; el callback con `is_valid:false` redirige con
  `error=proveedor`; con `is_valid:true` llama `esports_link_account` con el SteamID64.
- Epic y Riot cambian el `code` por el token (cuerpo, cabeceras y Basic correctos); un `state` usado →
  `error=estado_vencido`.

---

## 9. SQL

Reglas de siempre (`supabase/README.md`): toda escritura por RPC `security definer` con `set search_path = ''`,
`private.require_uid()` primero, errores con `private.fail('<codigo>')` / `private.deny()`, RLS solo de lectura y
`grant select` explícito, ninguna escritura directa, funciones de `private` cerradas, límites con
`private.rate_take(key, max, ventana)`. Las RPC se llaman por nombre (`p_…`). Ids del teléfono donde dice `p_id`.

### 9.1 Orden de `20261008000100_esports.sql`

1. Familia y deporte (§9.2).
2. Funciones `private.esp_*` puras que usan los checks (§9.4).
3. Tablas, índices, RLS y `grant select` (§9.3).
4. Triggers (§9.8).
5. Redefiniciones (§9.12).
6. RPC (§9.5–§9.7).
7. Checks de insignias (§9.2) y `push_category` (§9.12).
8. `export_my_data` (§9.11).
9. Cierre: revocar y dar permisos (§9.14).

### 9.2 El deporte, la familia y los checks de insignias

```sql
alter table public.sport_status drop constraint sport_status_family_check,
  add constraint sport_status_family_check check (family in ('series', 'racket', 'team', 'esports'));

insert into public.sport_status (id, family, status, sort_order) values
  ('esports', 'esports', 'open', 11);
```

La `insert` va con esa forma exacta (la lee `registry.test.ts` con una expresión regular). `drop constraint` **sin**
`if exists` (si el nombre no fuera ese, que falle en PGlite).

```sql
alter table public.badge_awards drop constraint badge_awards_sport_check,
  add constraint badge_awards_sport_check check (sport in ('all', 'bowling', 'padel', 'tennis', 'pickleball',
    'table_tennis', 'basketball', 'football', 'futsal', 'golf', 'swimming', 'esports'));
-- igual badge_progress_sport_check y badge_stats_sport_check
```

### 9.3 Tablas

Todas con RLS, `updated_at` con `private.touch_updated_at()` y sin escritura directa. Las de una liga llevan
`league_id` verificado con FK compuesta e índice `(league_id, updated_at)`. No llevan tombstones (no se sincronizan
sin señal; se leen al abrir).

**`public.esports_game_ids`** — lectura: con sesión, **solo estas columnas** (`grant select (…)` por columna):
`user_id, game, platform, region, id_display, status, ranks, rank_source, ownership, verified_at, confirmed_at,
updated_at`. Lo demás lo ve su dueño con `esports_my_game_ids()`.

```sql
create table public.esports_game_ids (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game text not null check (private.esp_game_ok(game)),
  platform text not null default '' check (platform ~ '^[a-z0-9]{0,8}$'),
  region text not null default '' check (region ~ '^[a-z0-9]{0,8}$'),
  id_display text not null check (char_length(id_display) between 2 and 40),
  id_normalized text not null check (char_length(id_normalized) between 2 and 40 and id_normalized !~ '[A-Z]'),
  status text not null default 'pendiente' check (status in ('pendiente', 'confirmado')),  -- confirmado = comprobado
  ownership text not null default 'declarado' check (ownership in ('declarado', 'busqueda', 'login')),
  external_id text check (char_length(external_id) between 1 and 100),  -- SteamID64, account_id de Epic, puuid
  ranks jsonb not null default '{}' check (private.esp_ranks_ok(ranks)),
  rank_source text not null default 'declarado' check (rank_source in ('declarado', 'verificado')),
  lookup_name text check (char_length(lookup_name) <= 60),   -- el nombre que dio la API o el proveedor
  verified_at timestamptz,                                  -- cuándo salió el rango verificado (LoL)
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, game, platform),
  check ((status = 'confirmado') = (ownership <> 'declarado'))
);
-- Exclusivo solo con login (D11): un ID declarado o encontrado por búsqueda lo pueden tener varias cuentas.
create unique index esports_game_ids_login on public.esports_game_ids (game, platform, id_normalized) where ownership = 'login';
create unique index esports_game_ids_external on public.esports_game_ids (game, external_id) where ownership = 'login' and external_id is not null;
create index esports_game_ids_lookup on public.esports_game_ids (game, platform, id_normalized);
```

**`public.esports_id_moves`** (los avisos «Tu ID pasó a otra cuenta», §6.4) — RLS sin lectura directa: todo por
`esports_my_id_moves()` y `esports_seen_id_move()`. La escribe solo `esports_link_account`. No lleva `updated_at`.

```sql
create table public.esports_id_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  game text not null,
  platform text not null default '',
  id_display text not null,
  provider text not null check (provider in ('steam', 'epic', 'riot')),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index esports_id_moves_user on public.esports_id_moves (user_id, created_at desc);
```

**`private.esports_lookups`** (solo `service_role` escribe; la lee `esports_confirm_game_id`):
`id uuid pk default gen_random_uuid()`, `user_id uuid not null`, `game text not null`, `platform text not null`,
`id_normalized text not null`, `found boolean not null`, `display_name text` (≤ 60), `external_id text` (≤ 100),
`ranks jsonb not null default '{}'`, `provider text not null` (≤ 20), `created_at timestamptz default now()`. Índice
`(user_id, created_at desc)`. Vale 15 minutos; se limpia sola al guardar (borra las de más de 1 día).

**`private.esports_link_states`**: `state uuid pk default gen_random_uuid()`, `user_id uuid not null`, `provider
text check (provider in ('steam', 'epic', 'riot'))`, `game text not null`, `created_at default now()`, `used_at
timestamptz`. Vale 10 minutos y un uso.

**`public.esports_teams`** — lectura: todos (también sin cuenta).

```sql
create table public.esports_teams (
  id uuid primary key default gen_random_uuid(),
  game text not null check (private.esp_game_ok(game) and private.esp_game_kind(game) <> 'duel'),
  name text not null check (char_length(name) between 2 and 40 and btrim(name) = name),
  tag text not null check (tag ~ '^[A-Z0-9]{2,5}$'),
  description text not null default '' check (char_length(description) <= 200),
  logo_path text,
  captain_id uuid references public.profiles (id) on delete set null,
  member_count smallint not null default 0 check (member_count between 0 and 20),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (logo_path is null or logo_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$'))
);
create unique index esports_teams_name on public.esports_teams (game, private.normalize_name(name));
create index esports_teams_game on public.esports_teams (game, member_count desc, name);
```

**`public.esports_team_members`** — lectura: con sesión.

```sql
create table public.esports_team_members (
  team_id uuid not null references public.esports_teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('captain', 'member', 'sub')),
  display_name text not null check (char_length(display_name) between 1 and 60 and btrim(display_name) <> ''),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create unique index esports_team_members_captain on public.esports_team_members (team_id) where role = 'captain';
create index esports_team_members_user on public.esports_team_members (user_id);
```

**`public.esports_team_secrets`** — lectura: el capitán (`team_id in (select id from esports_teams where captain_id =
auth.uid())`) y el superadmin. `team_id uuid pk references esports_teams on delete cascade`, `invite_code text not
null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$')`, `updated_at`.

**`public.esports_tournaments`** — lectura: liga visible (`league_id in (select private.readable_leagues())`; también
sin cuenta en una pública).

```sql
create table public.esports_tournaments (
  event_id uuid primary key,
  league_id uuid not null,
  game text not null check (private.esp_game_ok(game)),
  mode text not null,
  entry_type text not null check (entry_type in ('teams', 'open')),
  format text not null check (format in ('single_elim', 'double_elim', 'groups_playoffs', 'round_robin', 'br')),
  status text not null default 'registration' check (status in ('registration', 'live', 'finished', 'cancelled')),
  starts_at timestamptz not null,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz not null,
  checkin_minutes smallint check (checkin_minutes between 10 and 180),
  max_entries smallint not null check (max_entries between 2 and 128),
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) < 8192),
  prize_text text not null default '' check (char_length(prize_text) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  check (private.esp_mode_ok(game, mode)),
  check (private.esp_settings_ok(game, mode, format, settings)),
  check ((format = 'br') = (private.esp_game_kind(game) = 'br')),
  check (registration_closes_at <= starts_at),
  check (registration_opens_at is null or registration_opens_at < registration_closes_at),
  check (entry_type = 'open' or private.esp_mode_size(mode) > 1)
);
create index esports_tournaments_game on public.esports_tournaments (game, starts_at desc);
create index esports_tournaments_sync on public.esports_tournaments (league_id, updated_at);
```

**`public.esports_entries`** — lectura: liga visible.

```sql
create table public.esports_entries (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null,
  event_id uuid not null references public.esports_tournaments (event_id) on delete cascade,
  kind text not null check (kind in ('team', 'player', 'free_agent')),
  team_id uuid references public.esports_teams (id) on delete set null,
  name text not null check (char_length(name) between 1 and 40),
  tag text not null default '' check (tag ~ '^[A-Z0-9]{0,5}$'),
  captain_id uuid references public.profiles (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'assigned')),
  seed smallint check (seed between 1 and 128),
  checked_in_at timestamptz,
  note text check (char_length(note) <= 200),
  side_team_id uuid,
  assigned_entry uuid references public.esports_entries (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, league_id),
  unique (id, event_id),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  foreign key (side_team_id, league_id) references public.teams (id, league_id) on delete set null (side_team_id)
);
create unique index esports_entries_team_live on public.esports_entries (event_id, team_id)
  where team_id is not null and status in ('pending', 'approved');
create index esports_entries_event on public.esports_entries (event_id, status);
create index esports_entries_team on public.esports_entries (team_id);
create index esports_entries_sync on public.esports_entries (league_id, updated_at);
```

**`public.esports_entry_members`** — lectura: liga visible.

```sql
create table public.esports_entry_members (
  entry_id uuid not null,
  event_id uuid not null,
  league_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('captain', 'member', 'sub')),
  display_name text not null check (char_length(display_name) between 1 and 60),
  gamer_tag text not null check (char_length(gamer_tag) between 2 and 40),
  ranks jsonb not null default '{}' check (private.esp_ranks_ok(ranks)),
  rank_source text not null default 'declarado' check (rank_source in ('declarado', 'verificado')),
  player_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (entry_id, user_id),
  unique (event_id, user_id),
  foreign key (entry_id, event_id) references public.esports_entries (id, event_id) on delete cascade,
  foreign key (entry_id, league_id) references public.esports_entries (id, league_id) on delete cascade,
  foreign key (player_id, league_id) references public.players (id, league_id) on delete set null (player_id)
);
create unique index esports_entry_members_captain on public.esports_entry_members (entry_id) where role = 'captain';
create index esports_entry_members_user on public.esports_entry_members (user_id);
create index esports_entry_members_sync on public.esports_entry_members (league_id, updated_at);
```

`unique (event_id, user_id)`: una persona está en un solo inscrito del torneo. Por eso, al rechazar, retirar o
asignar, las filas de la foto **se borran** o **se mueven** (la del agente asignado cambia de `entry_id`).

**`public.esports_matches`** (los enlaces del cuadro) — lectura: liga visible.

```sql
create table public.esports_matches (
  match_id uuid primary key,
  league_id uuid not null,
  event_id uuid not null,
  stage text not null check (stage in ('bracket', 'groups', 'playoffs', 'league')),
  part text not null check (part in ('W', 'L', 'GF', 'GF2', 'P3', 'G')),
  group_no smallint check (group_no between 0 and 7),
  best_of smallint not null check (best_of in (1, 3, 5, 7)),
  winner_to uuid references public.matches (id) on delete set null,
  winner_side smallint check (winner_side in (1, 2)),
  loser_to uuid references public.matches (id) on delete set null,
  loser_side smallint check (loser_side in (1, 2)),
  updated_at timestamptz not null default now(),
  foreign key (match_id, league_id) references public.matches (id, league_id) on delete cascade,
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade
);
-- Sin check entre winner_to y winner_side: al borrar el partido destino, winner_to queda null y el lado sobra (se ignora).
create index esports_matches_event on public.esports_matches (event_id, stage);
create index esports_matches_sync on public.esports_matches (league_id, updated_at);
```

**`public.esports_br_games`** — lectura: liga visible.

```sql
create table public.esports_br_games (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null,
  event_id uuid not null references public.esports_tournaments (event_id) on delete cascade,
  round smallint not null check (round between 1 and 10),
  game_no smallint not null check (game_no between 1 and 12),
  map text not null default '' check (char_length(map) <= 24),
  status text not null default 'scheduled' check (status in ('scheduled', 'finished', 'void')),
  scheduled_at timestamptz,
  proof uuid[] not null default '{}' check (cardinality(proof) <= 3),
  entered_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, league_id),
  unique (event_id, round, game_no),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade
);
create index esports_br_games_sync on public.esports_br_games (league_id, updated_at);
```

**`public.esports_br_results`** — lectura: liga visible.

```sql
create table public.esports_br_results (
  game_id uuid not null,
  entry_id uuid not null,
  league_id uuid not null,
  placement smallint check (placement between 1 and 150),   -- null = no jugó
  kills smallint not null default 0 check (kills between 0 and 200),
  updated_at timestamptz not null default now(),
  primary key (game_id, entry_id),
  foreign key (game_id, league_id) references public.esports_br_games (id, league_id) on delete cascade,
  foreign key (entry_id, league_id) references public.esports_entries (id, league_id) on delete cascade
);
create unique index esports_br_results_place on public.esports_br_results (game_id, placement) where placement is not null;
create index esports_br_results_sync on public.esports_br_results (league_id, updated_at);
```

### 9.4 Funciones de ayuda (`private`, cerradas a anon y authenticated)

| Función | Qué hace (igual que el motor) |
|---|---|
| `esp_game_ok(text) → boolean` (immutable) | El id está en la lista de §2.1. |
| `esp_game_kind(text) → text` (immutable) | `'team' \| 'duel' \| 'br'`. |
| `esp_mode_ok(p_game, p_mode) → boolean` (immutable) | El modo es de ese juego (§2.1). |
| `esp_mode_size(text) → integer` (immutable) | §2.1. |
| `esp_subs_max(p_game, p_mode) → integer` (immutable) | §2.2. |
| `esp_lobby(p_game, p_mode) → integer` (immutable) | §2.1 (null fuera de BR). |
| `esp_best_of_ok(p_game, p_bo integer) → boolean` (immutable) | §2.1. |
| `esp_platform_ok(p_game, p_platform) → boolean` (immutable) | `''` salvo NBA 2K (`psn`, `xbox`, `steam`, `switch`, obligatoria). |
| `esp_region_ok(p_game, p_region) → boolean` (immutable) | `''` o una región de §2.4 (VALORANT, LoL, Free Fire). |
| `esp_normalize_id(p_game, p_raw) → jsonb` (immutable) | `{display, normalized}` o null si no sirve (§2.4, la misma tabla). |
| `esp_verify_kind(p_game text) → text` (immutable) | `'login' \| 'lookup' \| 'none'` (la tabla de §7; §9.10). |
| `esp_rank_verifiable(p_game text) → boolean` (immutable) | true solo en `lol` (§7; §9.10). |
| `esp_ranks_ok(jsonb) → boolean` (immutable) | Objeto de 0–3 claves (`main`, `1v1`, `2v2`, `3v3`); cada valor objeto con exactamente uno de `tier` (`^[a-z0-9_]{1,24}$`, con `div` 1–5 y `mmr` −100…3 000 opcionales), `value` (entero 0–99 999 999) o `text` (1–24). |
| `esp_settings_ok(p_game, p_mode, p_format, p_settings) → boolean` (immutable) | La tabla de §3.6 (claves, tipos y rangos; sin las revisiones cruzadas en español). |
| `esp_game_winner(p_rules jsonb, p_g jsonb) → smallint` (immutable) | Revisa un mapa/juego con la regla del juego de `p_rules.game` (§2.3) y devuelve el ganador (1/2), **0** si es el empate válido del FC o **null** si no es válido. |
| `esp_series_ok(p_score jsonb, p_rules jsonb, p_final boolean, p_winner smallint) → boolean` (immutable) | §2.3, pasos 1–8 (menos la foto de la liga, que la mira el trigger). |
| `esp_need(integer) → integer` (immutable) | `(bo + 1) / 2`. |
| `esp_tournament_for_update(p_event) → public.esports_tournaments` | La fila bloqueada o `no_existe`. |
| `esp_entry_for_update(p_entry) → public.esports_entries` | Igual. |
| `esp_registration_open(t public.esports_tournaments) → boolean` (stable) | §5.2 paso 1. |
| `esp_my_game_id(p_user, p_game, p_platform) → public.esports_game_ids` (stable) | La fila de esa cuenta (en NBA 2K, la de la plataforma; en los demás `''`). |
| `esp_member_ok(p_user, p_game, p_settings) → text` (stable) | null si cumple §5.2 paso 4 (sin el duplicado); si no, `'sin_id'`, `'id_sin_comprobar'` o `'sin_rango'`. |
| `esp_materialize(p_entry) → void` | §5.3. |
| `esp_dematerialize(p_entry) → void` | Borra el equipo de temporada (`side_team_id`) y lo deja null. |
| `esp_sync_roster(p_entry) → void` | Si está materializado: membresías y jugadores de los nuevos y `team_players` igual a la foto (borra a los que salieron, pone los roles). |
| `esp_apply_links(p_match uuid, p_strict boolean) → integer` | §9.8. |
| `esp_new_team_code() → text` | `private.new_invite_code()` sin repetir en `esports_team_secrets` (10 intentos; si no, `duplicado`). |
| `esp_emit(p_league, p_event, p_table text, p_op text, p_ids uuid[]) → void` | `private.emit('league:'\|\|league, 'esports', {table, op, ids})` y lo mismo a `'event:'\|\|event`. |


### 9.5 RPC: IDs de juego (con sesión)

| RPC | Quién | Qué hace |
|---|---|---|
| `esports_save_game_id(p_game text, p_id text, p_platform text default '', p_region text default '') → jsonb {status, idDisplay, idNormalized}` | la cuenta | Normaliza (`invalido` si no sirve o la plataforma/región no es del juego). Si **otra** cuenta tiene ese `(game, platform, id_normalized)` con `ownership 'login'`: `id_tomado` (los IDs declarados o buscados de otros no cuentan: no son exclusivos). Su propia fila `login`: `invalido` (se quita y se vuelve a conectar). Inserta o cambia su fila: si el ID normalizado cambió, queda `pendiente` con `ownership 'declarado'`, `rank_source 'declarado'`, sin `verified_*`, `external_id` ni `lookup_name` (los rangos declarados se quedan); si no cambió, solo la región/display. En una inscripción aprobada de un torneo `live` de ese juego: `cerrado`. 20 cambios por día (`rate_take('esp_id:'\|\|uid, 20, '1 day')` → `rate_limited`). |
| `esports_confirm_game_id(p_game text, p_platform text default '', p_lookup uuid default null) → jsonb {status, rankSource, ownership}` | la cuenta | **Solo con búsqueda** (sin `p_ranks`: los rangos declarados van por `esports_set_ranks`). Su fila tiene que existir (`no_existe`). `p_lookup` null → `invalido`. La búsqueda es suya, del mismo juego, plataforma e `id_normalized`, `found` y de menos de 15 minutos (si no, `invalido`). Si otra cuenta lo tiene con `ownership 'login'`: `id_tomado`. Queda `confirmado`, `ownership 'busqueda'` (una fila `login` sigue `login`), `lookup_name`, `external_id` (si no es login), `confirmed_at = now()`; si la búsqueda trajo rangos y `esp_rank_verifiable(p_game)` (LoL): `ranks` (se mezclan por clave), `rank_source 'verificado'`, `verified_at = now()`. Una comprobada se puede volver a comprobar (para refrescar el rango con una búsqueda nueva). |
| `esports_set_ranks(p_game text, p_platform text default '', p_ranks jsonb) → void` | la cuenta | Rangos declarados (`esp_ranks_ok`): `rank_source 'declarado'`, sin `verified_*`. |
| `esports_delete_game_id(p_game text, p_platform text default '') → void` | la cuenta | Borra su fila. Miembro de un equipo de esports de ese juego o en una inscripción viva de ese juego: `cerrado`. |
| `esports_my_game_ids() → jsonb [...]` | la cuenta | Sus filas con todas las columnas (camelCase). |
| `esports_my_id_moves() → jsonb [{id, game, platform, idDisplay, provider, createdAt}]` | la cuenta | Sus avisos de `esports_id_moves` sin ver (`seen_at` null) de los últimos 30 días, los más nuevos primero (§6.4). |
| `esports_seen_id_move(p_id uuid) → void` | la cuenta | Pone `seen_at = now()` en ese aviso; solo los suyos (otro id → `no_existe`). |
| `esports_begin_lookup(p_user uuid, p_game text, p_id text, p_platform text default '') → jsonb` | **service_role** | Si el juego no tiene búsqueda (`esp_verify_kind(p_game) <> 'lookup'`) → `{ok: false, reason: 'invalido'}`. Normaliza (`esp_normalize_id`; si no sirve → `{ok: false, reason: 'invalido'}`) y cuenta una búsqueda (`rate_take('esp_lookup:'\|\|user, 20, '1 hour')` y `rate_take('esp_lookup_d:'\|\|user, 60, '1 day')`; si no cabe → `{ok: false, reason: 'rate_limited'}`). Si no: `{ok: true, display, normalized}`. |
| `esports_store_lookup(p_user uuid, p_game text, p_platform text, p_id text, p_found boolean, p_display text, p_external text, p_ranks jsonb, p_provider text) → uuid` | **service_role** | Normaliza `p_id`, valida `p_ranks` (si no sirven, se guardan `{}`; solo se guardan si `esp_rank_verifiable(p_game)`: VALORANT `{}`), guarda y devuelve el id; borra las de más de 1 día de esa cuenta. |
| `esports_link_begin(p_user uuid, p_provider text, p_game text) → uuid` | **service_role** | `state` nuevo (el proveedor tiene que ser el `link` del juego, si no `invalido`); 10 por hora por cuenta (`rate_limited`). |
| `esports_link_take(p_state uuid) → jsonb {userId, provider, game} \| null` | **service_role** | El state sin usar y de menos de 10 minutos; lo marca usado. null si no. |
| `esports_link_account(p_user uuid, p_game text, p_provider text, p_external_id text, p_display text) → text` | **service_role** | El ID de la cuenta conectada: Steam → `id_display` = código de amigo (SteamID64 − base), `external_id` = SteamID64; Epic → `id_display` = `displayName`, `external_id` = `account_id`; Riot → `gameName#tagLine`, `external_id` = `puuid`. Normaliza. Las filas de **otras** cuentas con `ownership 'login'` y el mismo `id_normalized` o el mismo `external_id` (mismo juego, plataforma `''`) **se borran** y, por cada una: fila en `esports_id_moves`, `private.queue_push(<la otra cuenta>, 'liga', 'Tu ID {X} de {Juego} pasó a otra cuenta', 'Alguien entró con esa cuenta de {Epic\|Steam\|Riot} en otra cuenta de MatchMate.', '/esports/mi-id?juego=<game>', 'esports-id:login:<user>', 604800)` y `private.audit('esports_id_login', 'user', <la otra cuenta>, {game, idDisplay, by, provider})` (§6.3). Las filas declaradas o buscadas de otros no se tocan. Guarda la suya `confirmado`, `ownership 'login'`, `external_id`, `lookup_name = p_display`, `confirmed_at = now()` (rango sin tocar). Devuelve siempre `'ok'`. |

### 9.6 RPC: equipos (con sesión, salvo `esports_team_preview`)

| RPC | Quién | Qué hace |
|---|---|---|
| `esports_create_team(p_game text, p_name text, p_tag text, p_description text default '', p_id uuid default null) → jsonb {teamId, inviteCode}` | la cuenta, con su ID de ese juego puesto (cualquier `status`; si no, `sin_id`) | Juego de `kind` distinto de `duel` (`invalido`). Nombre 2–40 recortado; tag en mayúsculas `^[A-Z0-9]{2,5}$`; nombre repetido en el juego → `duplicado`. Como mucho 3 equipos por juego y 10 en total por cuenta (`limite: equipos`). 5 por día (`rate_take('esp_team:'\|\|uid, 5, '1 day')`). Crea el equipo, la cuenta como `captain` (`display_name` = su nombre de perfil), `captain_id`, `member_count 1` y el código. |
| `esports_update_team(p_team uuid, p_patch jsonb) → void` | el capitán (o superadmin) | Claves `name`, `tag`, `description` (otra clave: `invalido`). |
| `esports_delete_team(p_team uuid) → void` | el capitán (o superadmin) | Con inscripciones vivas en torneos `registration`: se retiran; en torneos `live`: `cerrado`. Borra el equipo (las inscripciones viejas quedan con su nombre y `team_id` null). |
| `esports_team_code(p_team uuid) → text` | el capitán | El código. |
| `esports_renew_team_code(p_team uuid) → text` | el capitán | Código nuevo. |
| `esports_team_preview(p_code text) → setof {team_id, game, name, tag, logo_path, member_count}` | **cualquiera, también sin cuenta** | Como `invite_preview`: código malo, ninguna fila; 30 malos por hora (`rate_key('esp_preview')`, `rate_blocked`/`rate_hit`) → `rate_limited`. Mayúsculas y espacios no importan. |
| `esports_join_team(p_code text) → jsonb {teamId} \| null` | la cuenta | Código malo → null (cuenta el intento; 10 por hora → `rate_limited`). Ya es miembro: lo mismo. Sin ID de ese juego (cualquier `status`): `sin_id`. Equipo lleno (`member_count` ≥ el máximo de plantilla del juego en su modo más grande: `5v5` 7, RL 5, BR 5): `cupo_lleno`. Límite de 3 equipos por juego: `limite: equipos`. Entra como `member`. |
| `esports_leave_team(p_team uuid) → void` | un miembro | El capitán no sale si quedan otros (`invalido`: primero pasa la capitanía); si es el único, el equipo se borra. |
| `esports_remove_member(p_team uuid, p_user uuid) → void` | el capitán | No a sí mismo (`invalido`). |
| `esports_set_member_role(p_team uuid, p_user uuid, p_role text) → void` | el capitán | `member` o `sub`; `captain` = pasar la capitanía (el anterior queda `member`, `captain_id` cambia). |
| `esports_begin_team_logo(p_team uuid, p_path text) → void` | el capitán | Como `begin_logo_upload` con la carpeta del equipo (`'<p_team>/<uuid>.webp\|.jpg\|.png'`) y la misma reserva `private.logo_uploads` (en `league_id` va el id del equipo: la columna es «la carpeta»), el mismo límite `'logo:'\|\|uid` (30 por día). |
| `esports_set_team_logo(p_team uuid, p_path text) → text` | el capitán | Como `set_league_logo`: pone o quita (`null`) y devuelve el anterior. |

### 9.7 RPC: torneos, inscripciones, fases y battle royale

| RPC | Quién | Qué hace |
|---|---|---|
| `esports_create_tournament(p_game text, p_name text, p_mode text, p_entry_type text, p_format text, p_starts_at timestamptz, p_max_entries integer, p_settings jsonb, p_visibility text default 'public', p_league uuid default null, p_registration_opens_at timestamptz default null, p_registration_closes_at timestamptz default null, p_checkin_minutes integer default null, p_venue text default '', p_announcement text default '', p_prize_text text default '', p_tz text default 'America/Santo_Domingo', p_id uuid default null, p_event_id uuid default null) → jsonb {leagueId, eventId, inviteCode}` | con sesión (sin `p_league`); admin de la liga (con `p_league`) | Sin `p_league`: `public.create_league(p_name, p_visibility, p_kind => 'torneo', p_sport => 'esports', p_venue, p_season_start/end => la fecha, p_tz, p_rules => {"game": p_game}, p_id)` (tope de 5 por día y 20 al mes como siempre). Con `p_league`: liga de esports del mismo juego (`invalido`). Después inserta el evento (`type 'torneo'`, `name`, `date` y `start_time` = `p_starts_at` en la zona de la liga, `announcement` ≤ 1000) con `p_event_id` y la fila de `esports_tournaments` (`registration_closes_at` por defecto = `p_starts_at`; `max_entries` ≤ lobby en BR). Checks de §9.3 → `invalido`. `inviteCode` solo si es privada (si no, null). |
| `esports_update_tournament(p_event uuid, p_patch jsonb) → void` | admin | Claves: `name` (también el evento), `starts_at` (y la fecha del evento), `registration_opens_at`, `registration_closes_at`, `checkin_minutes`, `max_entries` (no menos que los aprobados), `prize_text`, `announcement`; y solo en `registration` sin fases: `mode`, `entry_type`, `format`, `settings`. |
| `esports_set_status(p_event uuid, p_status text) → void` | admin | §5.5. |
| `esports_register_team(p_event uuid, p_team uuid, p_members jsonb) → uuid` | el capitán del equipo | §5.2. `p_members = [{user_id, role: 'member' \| 'sub'}]` (el capitán va solo, aunque no venga). Crea el inscrito `team` (`name`/`tag` del equipo, `captain_id`) y la foto. Con `autoApprove`, aprobado y materializado. Push a los admins si queda pendiente. |
| `esports_register_solo(p_event uuid) → uuid` | la cuenta | Modo de 1 → `player`; modo de equipo con entrada `open` → `free_agent` (si no, `invalido`). Nombre = su nombre de perfil (≤ 40). Foto con rol `captain`. §5.2. |
| `esports_set_entry_roster(p_entry uuid, p_members jsonb) → void` | el capitán en `registration`; admin siempre (no en `finished`/`cancelled`) | La foto nueva (mismas reglas que al inscribir; los nuevos tienen que ser miembros del equipo de esports enlazado, o ya estar en la foto, o —solo el admin— agentes libres del torneo, que se mueven). `esp_sync_roster`. |
| `esports_update_entry(p_entry uuid, p_patch jsonb) → void` | admin | Claves `name`, `tag`, `seed`, `note`. Cambia también el nombre del equipo de temporada. |
| `esports_withdraw(p_entry uuid) → void` | el capitán / el individual (o admin) | Solo en `registration` (`cerrado`). `withdrawn`, borra la foto y desmaterializa. |
| `esports_decide_entry(p_entry uuid, p_approve boolean, p_note text default null) → void` | admin | §5.3. Rechazar en `live`: `cerrado`. |
| `esports_check_in(p_entry uuid, p_undo boolean default false) → void` | el capitán / individual en la ventana (`cerrado` fuera); admin siempre | Inscrito aprobado. |
| `esports_set_seeds(p_event uuid, p_order uuid[]) → void` | admin | Todos los aprobados (`team`/`player`), sin repetir (`invalido`); `seed` = posición. |
| `esports_form_teams(p_event uuid, p_teams jsonb) → uuid[]` | admin | `[{name, tag?, members: [{user_id, role}]}]` (1–64 equipos); cada cuenta, agente libre vivo del torneo; titulares y suplentes como en §5.2; crea inscritos `team` (`team_id` null) aprobados y materializados; los agentes → `assigned` con `assigned_entry` y su fila de foto se mueve. Cupo: `cupo_lleno`. |
| `esports_assign_free_agent(p_free_agent uuid, p_entry uuid, p_role text default 'member') → void` | admin | Mueve al agente a ese inscrito `team` (vivo, con lugar: `cupo_lleno`), `assigned`, `esp_sync_roster`. |
| `esports_create_stage(p_event uuid, p_stage text, p_matches jsonb) → uuid[]` | admin | §9.7.1. |
| `esports_delete_stage(p_event uuid, p_stage text) → void` | admin | Si algún partido de la fase tiene resultado (`status` fuera de `scheduled`/`postponed`/`void` o `seq > 0`): `cerrado`. Borra sus partidos (los enlaces en cascada). Sin fases ni partidas BR → `registration`. |
| `esports_sync(p_event uuid) → integer` | miembro de la liga, admin o superadmin | `esp_apply_links(match, false)` de cada partido de esports del evento que es final (`private.match_final`). Devuelve cuántos lados puso. |
| `esports_br_save_game(p_event uuid, p_game jsonb) → uuid` | admin o anotador de la liga (`private.is_match_official`) | `p_game = {id?, round, game_no, map?, scheduled_at?, status?, proof?: [uuid], results?: [{entry_id, placement \| null, kills}]}`. Torneo BR (`invalido`); inscritos aprobados del evento; puestos sin repetir y ≤ número de aprobados; fotos de la liga; reemplaza los resultados de esa partida; con resultados queda `finished` (o el `status` que venga: `void`). Pasa el torneo a `live` si estaba en `registration`. `entered_by`. |
| `esports_br_delete_game(p_game uuid) → void` | admin | Borra la partida. |
| `esports_hub(p_game text, p_limit integer default 60) → jsonb {tournaments, teams}` | **cualquiera, también sin cuenta** | `tournaments`: los de ese juego que ve (`readable_leagues`), sin cancelados, primero los de inscripción (por `starts_at`), después en curso y al final terminados (por `starts_at` desc), hasta `p_limit` (1–100): `{eventId, leagueId, name, leagueName, visibility, logoPath, mode, entryType, format, status, startsAt, registrationOpensAt, registrationClosesAt, checkinMinutes, maxEntries, approved, pending, prizeText}`. `teams`: hasta 100 del juego por `member_count` desc y nombre: `{id, name, tag, logoPath, memberCount}`. |
| `esports_my_entries() → jsonb [...]` | la cuenta | Sus inscripciones (por la foto o como capitán), vivas o de torneos sin terminar: `{entryId, eventId, leagueId, tournament, game, mode, entryStatus, tournamentStatus, startsAt, entryName, role, kind}`. |

#### 9.7.1 `esports_create_stage(p_event, p_stage, p_matches)`

`p_stage` ∈ `bracket` (simple o doble), `groups`, `playoffs`, `league`, y tiene que cuadrar con el formato
(`single_elim`/`double_elim` → `bracket`; `groups_playoffs` → `groups` y después `playoffs`; `round_robin` →
`league`); la fase no existe ya (`duplicado`); `playoffs` solo con `groups` creada. `p_matches` (1–500):

```json
[{ "id": "uuid", "key": "W1-1", "part": "W", "round": 1, "group_no": null, "stage": "Ganadores · Cuartos de final",
   "best_of": 3, "scheduled_at": null,
   "sides": [{ "side": 1, "entry_id": "uuid", "label": "" }, { "side": 2, "entry_id": null, "label": "Ganador W1-2" }],
   "winner_to": { "id": "uuid", "side": 1 }, "loser_to": null }]
```

La base: cada `entry_id` es un inscrito aprobado y materializado del evento (`invalido`); `winner_to`/`loser_to`
apuntan a ids del mismo lote; `best_of` permitido por el juego; arma el lote de `public.create_matches(p_league, …)`
con `event_id`, `round`, `stage`, `bracket_key = key`, `format = <juego>`, `rules = {game, bestOf, draws,
roundsToWin?, stocks?}` (lo que da `seriesRules` del motor: la base revisa que `draws` solo sea true en FC al mejor de 1
en `groups`/`league`), los lados (`team_id = side_team_id` del inscrito, `label` = su nombre o el texto, `seed`), y
después inserta `esports_matches`. Pasa el torneo a `live`. Devuelve los ids.

### 9.8 Triggers

| Trigger | Tabla y momento | Qué hace |
|---|---|---|
| `leagues_esp_check` | `before insert or update of sport, rules on leagues` | Liga `esports`: `rules.game` válido (`invalido`); no se cambia el juego si ya tiene torneos. |
| `events_esp_check` | `before insert or update of type, league_id on events` | En una liga `esports`, `type = 'torneo'` (`invalido`). |
| `matches_esp_check` | `before insert or update of score, status, winner_side, walkover_side, rules, format on matches` | En una liga `esports`: `format` = juego de la liga; `rules.game` = ese juego y `rules.bestOf` permitido; con `score`: `esp_series_ok(score, rules, status in ('finished','confirmed','disputed'), winner_side)` y, en `walkover`, la forma del W.O.; `score.proof` con fotos de la liga. Si no: `invalido` (con `detail` en español: «Marcador no válido para {juego}.»). |
| `matches_esp_advance` | `after update of status, winner_side, walkover_side on matches` (por fila) | Si el partido está en `esports_matches` y queda `confirmed` o `walkover`: `esp_apply_links(new.id, true)`. |
| `esports_teams_touch`, `…_touch` | `before update` de cada tabla | `touch_updated_at`. |
| `esports_team_members_count` | `after insert or delete on esports_team_members` (por sentencia) | `member_count` = cuántos; si el capitán se fue (borró la cuenta), el miembro más antiguo (titular antes que suplente) pasa a capitán y `captain_id` cambia; sin miembros, el equipo se borra. |
| `esports_teams_logo_purge` | `after update of logo_path or delete on esports_teams` | Reutiliza `private.queue_logo_purge()` (usa solo `old.logo_path` y `old.id`, y la reserva guarda el id del equipo en `league_id`). |
| `esports_emit_*` | `after insert/update/delete` (por sentencia) en `esports_tournaments`, `esports_entries`, `esports_entry_members`, `esports_matches`, `esports_br_games`, `esports_br_results` | `esp_emit(liga, evento, '<tournament\|entries\|members\|links\|br>', op, ids)`. |

**`private.esp_apply_links(p_match, p_strict)`**: con el partido final, `W` = `winner_side` (o el lado que vino en un
W.O. de un solo lado) y `L` el otro; empate o W.O. doble → 0. Para `winner_to` (lado `winner_side`) y `loser_to`
(lado `loser_side`): si el partido destino está `scheduled`/`postponed` y `seq = 0`, se le pone en ese lado
`team_id`, `label` y `seed` del lado de origen (si ya estaba igual, nada); si ya empezó o tiene resultado y el lado
sería **otro** equipo: con `p_strict`, `cerrado` («cerrado: cuadro», deshace la corrección; el admin primero anula
ese partido), si no, se salta. **Gran final**: si `part = 'GF'` y existe la `GF2` del evento: gana el lado 2 → los dos
lados de `GF2` = los de `GF`; gana el lado 1 → `GF2` pasa a `void` con la nota «No hizo falta: ganó el invicto.» (si
seguía `scheduled`). Devuelve cuántos lados puso.

### 9.9 RLS y lectura

| Tabla | `select` para | Política |
|---|---|---|
| `esports_game_ids` | authenticated (columnas de §9.3) | `true` |
| `esports_id_moves` | nadie (sin `grant select`) | sin política: se lee con `esports_my_id_moves()` |
| `esports_teams` | anon, authenticated | `true` |
| `esports_team_members` | authenticated | `true` |
| `esports_team_secrets` | authenticated | capitán del equipo o `private.is_super()` |
| `esports_tournaments`, `esports_entries`, `esports_entry_members`, `esports_matches`, `esports_br_games`, `esports_br_results` | anon, authenticated | `league_id in (select private.readable_leagues())` |

### 9.10 La comprobación por juego en SQL (D24)

`private.esp_verify_kind(p_game)` y `private.esp_rank_verifiable(p_game)` (§9.4) repiten la tabla de §7; la prueba
SQL la recorre entera. Dónde cuentan:

- `esports_begin_lookup`: solo juegos `'lookup'` (si no, `{ok: false, reason: 'invalido'}`).
- `esports_store_lookup` y `esports_confirm_game_id`: los rangos de la búsqueda y `rank_source 'verificado'` solo si
  `esp_rank_verifiable` (LoL).
- `esp_member_ok` (inscripción, §5.2 paso 4): `requireConfirmedId` (sin valor = `false`: `coalesce(…, 'false')`) solo
  si `esp_verify_kind <> 'none'` → `id_sin_comprobar`; `requireVerifiedRank` solo si `esp_rank_verifiable` →
  `sin_rango`.
- Equipos (`esports_create_team`, `esports_join_team`): no la usan; basta con tener el ID puesto (`sin_id`).
- La exclusividad no depende del juego sino de `ownership 'login'` (índices de §9.3).

### 9.11 `export_my_data` (al final de `20261008000100_esports.sql`)

Se redefine copiando la de `20261007000100_modo_app.sql` y agrega `esportsIds` (sus filas de `esports_game_ids`,
todas las columnas), `esportsTeams` (sus membresías con el equipo), `esportsEntries` (sus filas de la foto) y
`esportsIdMoves` (sus avisos de `esports_id_moves`).

### 9.12 Lo que se redefine (copiar el cuerpo entero de la última definición)

| Función | Última definición | Qué cambia |
|---|---|---|
| `private.require_match_league(uuid)` | `20260927000100_partidos.sql:157` | `v not in ('racket', 'team', 'esports')` |
| `private.check_match()` | `partidos.sql:527` | `not in ('racket', 'team', 'esports')`; el `detail`: «Solo las ligas de raqueta, de equipos o de esports tienen partidos.» |
| `private.check_season_team()` | `partidos.sql:539` | `not in ('racket', 'team', 'esports')` |
| `private.can_upload_logo_path(text)` | `20260929001000_sueltos_logos.sql:851` | Si la carpeta no es una liga y es un `esports_teams`: la forma con el id del equipo, cuenta sin bloquear, **capitán** del equipo (o superadmin) y la reserva en `logo_uploads` con `league_id` = el equipo. La rama de la liga, igual. |
| `private.can_remove_logo_path(text)` | `sueltos_logos.sql:872` | También: la carpeta es un equipo del que la cuenta es capitán. |
| `public.purge_queue_take(integer, text)` | `sueltos_logos.sql:991` | En `logos`, tampoco se borra una ruta que es `esports_teams.logo_path`. (Misma firma: `create or replace`; sigue solo de `service_role`.) |
| `private.push_category(text)` | `20260929001400_anotadores.sql:926` | Más `when 'esports' then 'liga'` y `when 'esports-id' then 'liga'`. |
| `public.export_my_data()` | `20261007000100_modo_app.sql` | §9.11. |

No cambian (revisado): `private.match_side_of` (lo que no es raqueta ya es capitán o delegado), los push
`push_result_to_confirm`, `push_result_confirmed` y `remind_missing_results`, `private.check_winner` (el ganador lo
exige `matches_esp_check`), `private.match_reminders` (esports queda fuera de los recordatorios, §13), `prize_comp`
(sin premios, §13), `badge_activity`, `badge_apply_decisions`, `badge_family_rows`, `create_tournament`,
`create_event`, `signup_kind`, la escalera, las noches, los playoffs y `public_agenda`.

### 9.13 Errores nuevos (los traduce `esportsErrorText` / `gameIdErrorText`)

| Código (`message`, SQLSTATE `P0001`) | Texto en la app |
|---|---|
| `sin_id` | «Primero pon tu ID de {Juego}.» |
| `id_sin_comprobar` | «Este torneo pide tu ID de {Juego} comprobado.» |
| `sin_rango` | «Este torneo pide tu rango verificado de {Juego}.» |
| `id_tomado` | «Ese ID está conectado a otra cuenta con su inicio de sesión.» |
| `cupo_lleno` (ya existe) | «Ya no hay cupo.» / «El equipo está lleno.» |
| `limite: equipos` | «Llegaste al máximo de equipos.» |
| `cerrado` (ya existe) | «La inscripción está cerrada.» / «El torneo ya empezó.» / «cerrado: cuadro»: «El partido siguiente ya empezó: anúlalo primero.» |
| `duplicado` (ya existe) | «Ya está inscrito en este torneo.» / «Ya hay un equipo con ese nombre.» |

Se agregan a la tabla de errores de `supabase/README.md`.

### 9.14 Cierre y permisos

Al final de la migración, el bucle de `20260929001400_anotadores.sql:1405-1435` con:

- `v_rpc` (públicas, `grant execute … to authenticated`): `esports_save_game_id`, `esports_confirm_game_id`,
  `esports_set_ranks`, `esports_delete_game_id`, `esports_my_game_ids`, `esports_my_id_moves`,
  `esports_seen_id_move`, `esports_create_team`, `esports_update_team`, `esports_delete_team`, `esports_team_code`,
  `esports_renew_team_code`, `esports_team_preview`, `esports_join_team`, `esports_leave_team`,
  `esports_remove_member`, `esports_set_member_role`, `esports_begin_team_logo`, `esports_set_team_logo`,
  `esports_create_tournament`, `esports_update_tournament`, `esports_set_status`, `esports_register_team`,
  `esports_register_solo`, `esports_set_entry_roster`, `esports_update_entry`, `esports_withdraw`,
  `esports_decide_entry`, `esports_check_in`, `esports_set_seeds`, `esports_form_teams`, `esports_assign_free_agent`,
  `esports_create_stage`, `esports_delete_stage`, `esports_sync`, `esports_br_save_game`, `esports_br_delete_game`,
  `esports_hub`, `esports_my_entries`, `export_my_data`.
- Además `grant execute … to anon` en `esports_team_preview(text)` y `esports_hub(text, integer)`.
- Solo `service_role` (revocar de todos y `grant … to service_role`): `esports_begin_lookup`, `esports_store_lookup`,
  `esports_link_begin`, `esports_link_take`, `esports_link_account`. `purge_queue_take` sigue como estaba.
- `v_private` (revocar): todas las `esp_*` y las redefinidas (`require_match_league`, `check_match`,
  `check_season_team`, `push_category`); `can_upload_logo_path`/`can_remove_logo_path` siguen dadas a
  `authenticated`.

---

## 10. Capa de datos

Como el resto de `src/lib/data/*.ts`: lecturas con `useLive` (forma `Live<T>`, horas como `Stamp`), escrituras con
`rpc` (con señal; no van por la cola, salvo las de partidos de `matches.ts`, que ya van), `invalidate` con etiquetas.
Nombres en camelCase; filas de la base en snake_case (tipos `…Row`).

### 10.1 `src/lib/data/esports.ts` (equipos, torneos, inscripciones, fases, BR)

```ts
import type { GameId, Mode, Format, EntryType, TournamentSettings, RankMap, RankSource, StagePlan, SeriesScore } from '../../sports/esports';

export type TeamRole = 'captain' | 'member' | 'sub';
export interface EsportsTeam {
  id: string; game: GameId; name: string; tag: string; description: string; logoPath: string | null;
  captainId: string | null; memberCount: number; createdAt: Stamp | null; updatedAt: Stamp | null;
}
export interface EsportsTeamMember { teamId: string; userId: string; role: TeamRole; displayName: string; joinedAt: string }
export interface TeamPreview { teamId: string; game: GameId; name: string; tag: string; logoPath: string | null; memberCount: number }

export type TournamentStatus = 'registration' | 'live' | 'finished' | 'cancelled';
export interface EsportsTournament {
  eventId: string; leagueId: string; name: string; game: GameId; mode: Mode; entryType: EntryType; format: Format;
  status: TournamentStatus; startsAt: string; registrationOpensAt: string | null; registrationClosesAt: string;
  checkinMinutes: number | null; maxEntries: number; settings: TournamentSettings; prizeText: string;
  announcement: string; updatedAt: Stamp | null;
}
export interface HubTournament extends Pick<EsportsTournament, 'eventId' | 'leagueId' | 'name' | 'game' | 'mode' | 'entryType' | 'format' | 'status' | 'startsAt' | 'registrationOpensAt' | 'registrationClosesAt' | 'checkinMinutes' | 'maxEntries' | 'prizeText'> {
  leagueName: string; visibility: 'public' | 'private'; logoPath: string | null; approved: number; pending: number;
}
export interface HubData { tournaments: HubTournament[]; teams: Pick<EsportsTeam, 'id' | 'name' | 'tag' | 'logoPath' | 'memberCount'>[] }

export type EntryKind = 'team' | 'player' | 'free_agent';
export type EntryStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'assigned';
export interface EntryMember {
  userId: string; role: TeamRole; displayName: string; gamerTag: string; ranks: RankMap; rankSource: RankSource; playerId: string | null;
}
export interface EsportsEntry {
  id: string; leagueId: string; eventId: string; kind: EntryKind; teamId: string | null; name: string; tag: string;
  captainId: string | null; status: EntryStatus; seed: number | null; checkedInAt: string | null; note: string | null;
  sideTeamId: string | null; assignedEntry: string | null; members: EntryMember[]; createdAt: Stamp | null;
}
export interface StageLink {
  matchId: string; stage: 'bracket' | 'groups' | 'playoffs' | 'league'; part: 'W' | 'L' | 'GF' | 'GF2' | 'P3' | 'G';
  groupNo: number | null; bestOf: 1 | 3 | 5 | 7; winnerTo: string | null; winnerSide: 1 | 2 | null; loserTo: string | null; loserSide: 1 | 2 | null;
}
export interface BrResult { entryId: string; placement: number | null; kills: number }
export interface BrGame {
  id: string; eventId: string; round: number; gameNo: number; map: string; status: 'scheduled' | 'finished' | 'void';
  scheduledAt: string | null; proof: string[]; results: BrResult[];
}
export interface MyEntry {
  entryId: string; eventId: string; leagueId: string; tournament: string; game: GameId; mode: Mode; entryStatus: EntryStatus;
  tournamentStatus: TournamentStatus; startsAt: string; entryName: string; role: TeamRole; kind: EntryKind;
}

export const esportsKeys: {
  hub(game: GameId): string; team(id: string): string; myTeams(uid: string): string; teamEntries(id: string): string;
  tournament(eventId: string): string; leagueTournaments(lid: string): string; entries(eventId: string): string;
  links(eventId: string): string; br(eventId: string): string; myEntries(uid: string): string;
};
export const esportsTags: { all: 'esports'; team(id: string): string; event(eventId: string): string; league(lid: string): string; mine: 'esports:mine' };

// Lecturas
export function useEsportsHub(game: GameId | null): Live<HubData>;                       // rpc esports_hub (también sin cuenta)
export function useMyEsportsTeams(uid: string | null | undefined): Live<(EsportsTeam & { myRole: TeamRole })[]>;
export function useEsportsTeam(teamId: string | undefined): Live<{ team: EsportsTeam; members: EsportsTeamMember[] } | null>;
export function useTeamEntries(teamId: string | undefined): Live<EsportsEntry[]>;       // sus inscripciones (las que ve)
export function useTeamInviteCode(teamId: string | undefined, isCaptain: boolean): Live<string | null>;
export function useEsportsTournament(eventId: string | undefined): Live<EsportsTournament | null>; // con el nombre y el aviso del evento
export function useLeagueTournaments(lid: string | undefined): Live<EsportsTournament[]>;
export function useEntries(eventId: string | undefined): Live<EsportsEntry[]>;           // con sus miembros; en vivo (event:<id>)
export function useStageLinks(eventId: string | undefined): Live<StageLink[]>;
export function useBrGames(eventId: string | undefined): Live<BrGame[]>;
export function useMyEsportsEntries(uid: string | null | undefined): Live<MyEntry[]>;   // rpc esports_my_entries
/** Tiempo real del torneo: 'esports' en event:<id> invalida esportsTags.event(id). Lo llaman los hooks de arriba. */
export function useEsportsTopic(eventId: string | null): void;

// Equipos
export function createTeam(input: { game: GameId; name: string; tag: string; description?: string }): Promise<{ teamId: string; inviteCode: string }>;
export function updateTeam(teamId: string, patch: { name?: string; tag?: string; description?: string }): Promise<void>;
export function deleteTeam(teamId: string): Promise<void>;
export function renewTeamCode(teamId: string): Promise<string>;
export function previewTeamCode(code: string): Promise<TeamPreview | null>;
export function joinTeam(code: string): Promise<{ teamId: string } | null>;            // null = código malo
export function leaveTeam(teamId: string): Promise<void>;
export function removeTeamMember(teamId: string, userId: string): Promise<void>;
export function setTeamMemberRole(teamId: string, userId: string, role: TeamRole): Promise<void>;
export function uploadTeamLogo(teamId: string, file: Blob | CompressedLogo): Promise<string>; // como uploadLeagueLogo, con esports_begin_team_logo / esports_set_team_logo
export function removeTeamLogo(teamId: string): Promise<void>;
export const teamJoinUrl: (origin: string, code: string) => string;                    // `${origin}/esports/unirse/${code}`
export const teamShareText: (team: Pick<EsportsTeam, 'name' | 'game'>) => string;      // «Únete a {equipo} ({juego}) en MatchMate»

// Torneos
export interface TournamentInput {
  game: GameId; name: string; mode: Mode; entryType: EntryType; format: Format; startsAt: string; maxEntries: number;
  settings: TournamentSettings; visibility: 'public' | 'private'; registrationOpensAt?: string | null;
  registrationClosesAt?: string | null; checkinMinutes?: number | null; venue?: string; announcement?: string;
  prizeText?: string; tz?: string;
}
export function createEsportsTournament(input: TournamentInput, leagueId?: string): Promise<{ leagueId: string; eventId: string; inviteCode: string | null }>;
export function createEsportsLeague(input: { game: GameId; name: string; visibility: 'public' | 'private'; venue?: string; tz?: string }): Promise<string>; // create_league con sport 'esports', kind 'liga', rules {game}
export function updateTournament(eventId: string, patch: Partial<Pick<TournamentInput, 'name' | 'startsAt' | 'registrationOpensAt' | 'registrationClosesAt' | 'checkinMinutes' | 'maxEntries' | 'prizeText' | 'announcement' | 'mode' | 'entryType' | 'format' | 'settings'>>): Promise<void>;
export function setTournamentStatus(eventId: string, status: TournamentStatus): Promise<void>;

// Inscripciones
export function registerTeam(eventId: string, teamId: string, members: readonly { userId: string; role: 'member' | 'sub' }[]): Promise<string>;
export function registerSolo(eventId: string): Promise<string>;
export function setEntryRoster(entryId: string, members: readonly { userId: string; role: TeamRole }[]): Promise<void>;
export function updateEntry(entryId: string, patch: { name?: string; tag?: string; seed?: number | null; note?: string | null }): Promise<void>;
export function withdrawEntry(entryId: string): Promise<void>;
export function decideEntry(entryId: string, approve: boolean, note?: string): Promise<void>;
export function checkIn(entryId: string, undo?: boolean): Promise<void>;
export function setSeeds(eventId: string, order: readonly string[]): Promise<void>;
export function formTeams(eventId: string, teams: readonly { name: string; tag?: string; members: { userId: string; role: TeamRole }[] }[]): Promise<string[]>;
export function assignFreeAgent(freeAgentEntryId: string, entryId: string, role?: TeamRole): Promise<void>;

// Fases y cuadro
/** Le pone ids a las llaves del plan (uuidv7), cambia inscritos y enlaces, y llama esports_create_stage. */
export function createStage(lid: string, eventId: string, plan: StagePlan, opts?: { scheduledAt?: Record<string, string> }): Promise<string[]>;
export function deleteStage(lid: string, eventId: string, stage: StagePlan['kind']): Promise<void>;
export function syncBracket(eventId: string): Promise<number>;
/** Mapa de la fila del partido al motor: lados como ids de inscritos (por side_team_id). */
export function seriesInput(m: Match, entryBySideTeam: ReadonlyMap<string, string>): SeriesResultInput | null;
/** Resultados por llave del plan (para resolvePlan/champion): de los partidos finales del evento. */
export function keyResults(matches: readonly Match[], links: readonly StageLink[], entryBySideTeam: ReadonlyMap<string, string>, now: number): Record<string, KeyResult>;

// Battle royale
export function saveBrGame(eventId: string, game: { id?: string; round: number; gameNo: number; map?: string; scheduledAt?: string | null; status?: 'scheduled' | 'finished' | 'void'; proof?: string[]; results?: BrResult[] }): Promise<string>;
export function deleteBrGame(eventId: string, gameId: string): Promise<void>;

// Pruebas de partido (capturas): comprime, sube a scoreboards y registra con add_photo. Devuelve el id de la foto.
export function addMatchProof(lid: string, eventId: string, file: Blob): Promise<string>;

export function esportsErrorText(e: unknown, game?: GameId): string; // §9.13
```

Los resultados de las series usan **`src/lib/data/matches.ts` tal cual** (`useMatches({lid, eventId})`, `useMatch`,
`finishMatch`, `confirmResult`, `disputeResult`, `resolveDispute`, `adminCorrectResult`, `setWalkover`,
`rescheduleMatch`, `isFinal`, `sideOf`, `canConfirm`, `canDispute`).

### 10.2 `src/lib/data/esportsIds.ts` (IDs de juego, rangos, conectar, el aviso del ID movido)

```ts
export interface GameIdRecord {
  userId: string; game: GameId; platform: string; region: string; idDisplay: string; idNormalized?: string;
  status: IdStatus; ownership: Ownership; ranks: RankMap; rankSource: RankSource;
  lookupName?: string | null; externalId?: string | null;
  verifiedAt: string | null; confirmedAt: string | null; updatedAt: Stamp | null;
}
export type LookupResult =
  | { status: 'found'; lookupId: string; displayName: string; ranks: RankMap }
  | { status: 'not_found' | 'no_disponible' | 'rate_limited' | 'error' };
export interface ProvidersStatus { lookup: GameId[]; link: Record<LinkProvider, boolean> }
export const PROVIDERS_OFF: ProvidersStatus;                                                         // todo apagado
export interface IdMove { id: string; game: GameId; platform: string; idDisplay: string; provider: LinkProvider; createdAt: string }

export function useMyGameIds(uid: string | null | undefined): Live<GameIdRecord[]>;                 // rpc esports_my_game_ids
export function fetchMyGameIds(): Promise<GameIdRecord[]>;
export function useGameIdsFor(userIds: readonly string[], game: GameId | null): Live<GameIdRecord[]>; // select con las columnas públicas
export function fetchGameIdsFor(userIds: readonly string[], game: GameId): Promise<GameIdRecord[]>;
export function useProviders(): Live<ProvidersStatus>;                                               // esports-verify {action:'providers'}; en local: PROVIDERS_OFF
export function fetchProviders(): Promise<ProvidersStatus>;
export function useMyIdMoves(uid: string | null | undefined): Live<IdMove[]>;                       // rpc esports_my_id_moves (§6.4)
export function fetchMyIdMoves(): Promise<IdMove[]>;
export function seenIdMove(id: string): Promise<void>;                                               // rpc esports_seen_id_move
export function saveGameId(game: GameId, id: string, platform?: string, region?: string): Promise<{ status: IdStatus; idDisplay: string }>;
export function lookupGameId(game: GameId, id: string, platform?: string, region?: string): Promise<LookupResult>; // en local: { status: 'no_disponible' }
export function confirmGameId(game: GameId, lookupId: string, platform?: string): Promise<{ status: IdStatus; rankSource: RankSource; ownership: Ownership }>; // solo con búsqueda
export function setRanks(game: GameId, ranks: RankMap, platform?: string): Promise<void>;
export function deleteGameId(game: GameId, platform?: string): Promise<void>;
export function startLink(provider: LinkProvider, game: GameId): Promise<void>;     // esports-auth /start → location.assign(url)
export function gameIdErrorText(e: unknown, game?: GameId): string;                // §9.13
```

`gameIdErrorText`: `'id_tomado'` → «Ese ID está conectado a otra cuenta con su inicio de sesión.»; `'sin_id'` →
«Primero pon tu ID de {Juego}.»; `'id_sin_comprobar'` → «Este torneo pide tu ID de {Juego} comprobado.»;
`'sin_rango'` → «Este torneo pide tu rango verificado de {Juego}.». `esportsErrorText` (§10.1) también conoce
`'id_sin_comprobar'`.

---

## 11. El deporte en la app (registro, listas, color, escena)

### 11.1 Tipos y registro

- `src/sports/types.ts`: `SportId` + `'esports'`; `SportFamily = 'series' | 'racket' | 'team' | 'esports'`;
  `SPORT_FAMILY.esports = 'esports'`.
- `src/sports/registry.ts` (CRLF: se edita con Edit), entrada después de `table_tennis`:

```ts
esports: {
  id: 'esports',
  name: 'Esports',
  alias: 'Videojuegos',
  modality: null,
  label: 'Esports',
  short: 'Esports',
  lower: 'esports',
  group: 'esports',
  family: SPORT_FAMILY.esports,
  icon: Gamepad2,                 // lucide-react
  venue: 'Sede',
  venueHint: 'Online, cibercafé o centro gamer',
  units: { match: ['serie', 'series'], score: 'mapas', side: ['equipo', 'equipos'] },
  defaultRules: () => ({ game: 'valorant' }),
  validateRules: validateEsports,   // { game: GameId } y nada más: «Elige el juego.»
  eventTypes: [{ id: 'torneo', label: 'Torneo', plural: 'Torneos' }],
  photos: false,
  ready: true,
  phase: 8,
  scene: 'esports',
  order: 11,
  color: '#7c3aed',
},
```

- `registry.test.ts` (CRLF): `'Sede'` en la lista de lugares; `SPORT_GROUPS` con `'esports'` al final; la prueba del
  alias acepta `['table_tennis', 'esports']`; una prueba nueva de esports (nombre, alias, familia, orden 11, color,
  `Gamepad2`, `eventTypes`). `status.test.ts` (CRLF): `ALL_SPORTS` + esports, `BETA_WORLD.esports = 'beta'`, grupos.
- `src/pages/superadmin/model.ts:80`: `FAMILY_LABEL.esports = 'Esports'` (TypeScript lo obliga).
- `src/lib/sportContext.test.ts:143-144`: 11 deportes y el último `'esports'`.

### 11.2 Listas y navegación

- **`/d/esports`**: `src/pages/SportHomePage.tsx` navega a `/esports` (en vez de `/`) cuando el deporte es
  `esports` (ya lo dejó activo). Así el selector de deporte (`SportSwitcher`, genérico) lleva al hub.
- **Barra de abajo** (`Shell.tsx`, `navSections`/el `match` de cada pestaña): `/esports…` cuenta como **Ligas**.
- **Hoy** (`src/pages/HomePage.tsx`): si el deporte activo es `esports` o la cuenta tiene equipos o inscripciones de
  esports, una fila `ListRow` «Esports» (subtítulo «Tus equipos y torneos», ícono `Gamepad2` en `RowIcon`) que lleva a
  `/esports`; y el aviso del ID movido (§6.4; `useEsportsHome` en `src/components/home/EsportsHomeRow.tsx`): «Tu ID
  {X} de {Juego} pasó a otra cuenta», acción «Ver» → `/esports/mi-id?juego=<g>`.
- **Ligas** (`src/pages/LeaguesPage.tsx`): con el filtro en Esports (o sin filtro y la cuenta en esports), una fila
  «Torneos de esports» → `/esports`. Los torneos donde juega salen solos (es miembro de su liga).
- **Crear** (`src/components/create/CreateWizard.tsx`): si en el selector se elige Esports, en lugar de seguir el
  asistente se cierra y navega a `/esports?crear=torneo` (o `?crear=liga` si era «Una liga»): el juego decide todo.
- `src/components/agenda/logic.ts`: sin cambios (esports no tiene agenda).
- `src/components/LeagueShell.tsx`: sin cambios (los íconos por familia caen en los de siempre).

### 11.3 Color, compartir y escena

- `src/components/share/palette.ts`: `esports: '#5b21b6'`; `palette.test.ts`: la lista con esports.
- `src/components/splash/scenes.ts`: `'esports'` en `SceneId`, `SCENE_ORDER` (al final), `SCENE_FOR_SPORT`,
  `LIVE_SCENES` y `SCENES`; `label` «Esports». **Idea**: un control de juego de perfil; el botón de la derecha se
  hunde y se ilumina con el color del deporte, y arriba aparece «GG» (dos letras hechas con trazos, no texto) que sube
  un poco y se queda. Quieto (movimiento reducido): el control con el botón encendido y el «GG» arriba. Reglas de
  `scenes.test.ts` (prefijo `sp-esports`, sin hex, 2 s, sin `animation-delay`). Después `node
  scripts/icons/splash.mjs` (reescribe `index.html`, CRLF).
- `src/badges/rules/activity.ts`: `DAY_WEIGHT.esports = 1`; `src/badges/visual/icons.ts`: `SPORT_EMBLEM.esports =
  'crosshair'`; `icons.test.ts:52`: 10 emblemas distintos; `src/badges/catalog.ts:35`: `ALL_SPORTS =
  (Object.keys(SPORT_FAMILY) as SportId[]).filter((s) => s !== 'esports')`; `catalog.test.ts`: `esports: 0` (total
  505) y la vuelta de la línea 99 sin esports. Después `pnpm badges:bundle` (regenera
  `supabase/functions/_shared/badges-engine.gen.js`).
- `src/pages/InfoPages.test.ts`: 10 grupos en «Acerca de» (`sportGridCols(10)` = `grid-cols-4`), «Esports» en la
  lista.
- Textos: `index.html:7` y `:14` (CRLF), `public/manifest.webmanifest:5` (CRLF), `src/pages/legal/PrivacyPage.tsx:37`:
  «…golf, natación y esports». `README.md`: una fila «Esports | 8 | 15 juegos: series por equipos, 1 contra 1 y battle
  royale; equipos, torneos con doble eliminación, IDs de juego (comprobados con Epic, Steam o Riot donde se puede)».

### 11.4 Piezas compartidas de pantalla (`src/components/esports/bits.tsx`, LF)

Las usan las pistas 4 y 5; las hace la pista 3 (§14).

```tsx
export function GameMark(props: { game: GameId; size?: 'sm' | 'md' | 'lg'; className?: string }): JSX.Element;      // el monograma en su color (24/32/48 px), aria-label con el nombre
export function RankChip(props: { game: GameId; rank: RankValue | null | undefined; source?: RankSource; className?: string }): JSX.Element | null; // «Diamante 2 · Verificado» (solo 'verificado') o «Oro IV · Declarado»
export function IdChip(props: { status: IdStatus; ownership?: Ownership }): JSX.Element;                        // por ownership: «Cuenta conectada», «Comprobado» (tono ok), «Declarado» (neutro)
export function TeamLogo(props: { path: string | null; name: string; tag: string; className?: string }): JSX.Element; // useLogo; sin logo, el tag en un círculo
export function EntryStatusChip(props: { status: EntryStatus; checkedIn?: boolean }): JSX.Element;            // «Por aprobar», «Aprobado», «Check-in hecho»…
export function PhaseChip(props: { phase: Phase }): JSX.Element;                                               // PHASE_TEXT con su tono
export function EsportsTint(props: { children: ReactNode }): JSX.Element;                                      // <SportTint sport="esports">
```

---

## 12. Rutas y pantallas

Diseño «Calma y foco»: una acción principal por pantalla (`Button variant="primary"`, `size` `xl` en Lite y `lg` en
Pro), listas con `ListRow` dentro de `<Card className="overflow-hidden">` (`dense` en Pro), cifras con `StatDuo`,
2–3 vistas con `Segmented`, fechas con `DateBlock`, avisos con `useNotice` + `<NoticeSlot />` (uno por pantalla),
hojas con `Sheet`, títulos con `ScreenTop` + `ScreenTitle` (`pro={pro}`), todo envuelto en `<AppShell>` y
`<EsportsTint>` (las páginas de arriba) o dentro de `LeagueShell` (el torneo). 375 px primero; claro y oscuro con los
tokens de siempre. Lo del organizador va en `<ProOnly>` (y además solo si `isAdmin`).

### 12.1 Rutas (`src/App.tsx`, las agrega la pista 3)

| Ruta | Pantalla (export default) | Pista |
|---|---|---|
| `/esports` | `src/pages/esports/EsportsHomePage.tsx` | 4 |
| `/esports/mi-id` | `src/pages/esports/GameIdsPage.tsx` | 4 |
| `/esports/equipo/:teamId` | `src/pages/esports/TeamPage.tsx` | 4 |
| `/esports/unirse/:code` | `src/pages/esports/JoinTeamPage.tsx` | 4 |
| `/esports/:game/nuevo-torneo` | `src/pages/esports/CreateTournamentPage.tsx` | 5 |
| `/esports/:game` | `src/pages/esports/GameHubPage.tsx` (un juego que no existe → `/esports`) | 4 |
| `/l/:lid`, `/l/:lid/e/:eventId`, `/l/:lid/juegos`, `/l/:lid/ranking`, `/l/:lid/perfil` | `src/pages/sports/esports/screens.tsx` (se encuentra sola por la carpeta) | 5 |

Las fijas van antes que `/esports/:game`. Todas con `<Screen area="esports…" framed>` y `lazy`. La consola no gana
secciones (§12.9).

### 12.2 `/esports` — Esports (pista 4)

- **Arriba**: `ScreenTitle` «Esports», `hint` «Torneos y equipos por juego».
- **Aviso** (`useNotice`): sin ningún ID → kind `'tip'`, «Pon tu ID de juego», «Así te pueden sumar a un equipo y te
  inscribes más rápido.», acción «Poner mi ID» → `/esports/mi-id`. El aviso del ID movido (§6.4) gana.
- **Mis torneos** (si hay): `ListRow` por inscripción viva (`useMyEsportsEntries`): `leading` `GameMark`, título el
  torneo, subtítulo «{equipo} · {fase}» (`PhaseChip`), `to` `/l/<lid>`.
- **Mis equipos**: `ListRow` con `TeamLogo`, «{nombre} [TAG]», subtítulo «{juego} · {n} miembros · Capitán», `to`
  `/esports/equipo/<id>`. Vacío: nada (no un cartel).
- **Juegos**: tres secciones (`SectionHeader`): «Por equipos», «1 contra 1», «Battle royale»; cada juego un `ListRow`
  con `GameMark`, su nombre y de subtítulo su `blurb` («5 contra 5 · mapas a 13 rondas»), `to` `/esports/<juego>`.
- **Mis IDs de juego**: una fila al final «Mi ID de juego» → `/esports/mi-id`.
- **Acción principal**: ninguna (es un índice). `?crear=torneo` o `?crear=liga` abre la hoja «¿De qué juego?» (los 15
  `GameMark` en grilla de 3) que lleva a `/esports/<juego>/nuevo-torneo` o a `/esports/<juego>?crear=liga`.
- Sin cuenta: se ve todo menos «Mis…»; las acciones llevan a `SignInCard`.

### 12.3 `/esports/:game` — la página del juego (pista 4)

- **Arriba**: `GameMark size="lg"`, `ScreenTitle` con el nombre; línea: «{modo por defecto} · {ID}» («5 contra 5 ·
  Riot ID»). `StatDuo`: «Torneos abiertos» / «Equipos».
- **Acción principal**: Pro → «Crear torneo» (→ `nuevo-torneo`), y «Crear equipo» `secondary` (no en juegos
  `duel`). Lite → «Crear equipo» si el juego es de equipos y la cuenta no tiene equipo de ese juego; si no, ninguna; y
  al final un enlace `quiet` «¿Organizas? Crear torneo».
- `Segmented` «Torneos» | «Equipos» (en los `duel` solo torneos, sin el selector).
- **Torneos** (`useEsportsHub`): secciones «Inscripción abierta», «En curso», «Terminados»; cada uno `ListRow` con
  `DateBlock` (`startsAt`), título el nombre, subtítulo «{formatLine} · {aprobados}/{cupo}» y `PhaseChip`; un torneo
  privado lleva un candado. `to` `/l/<leagueId>`. Vacío: `Empty` «Todavía no hay torneos de {juego}» con «Crear
  torneo».
- **Equipos**: buscador simple (filtra en el teléfono), «Tus equipos» primero; `ListRow` con `TeamLogo`, «{nombre}
  [TAG]», «{n} miembros», `to` `/esports/equipo/<id>`.
- `?crear=equipo` abre **CreateTeamSheet** (`src/pages/esports/teams/CreateTeamSheet.tsx`): nombre, tag (mayúsculas,
  2–5), descripción (opcional), logo (opcional, `prepareLogo` → `uploadTeamLogo` después de crear). Sin ID de ese
  juego (cualquier estado basta): en lugar del formulario, «Primero pon tu ID de {juego}» con «Poner mi ID» →
  `/esports/mi-id?juego=<g>&volver=/esports/<g>?crear=equipo`. Al crear: a la página del equipo con la hoja de invitar
  abierta. `?volver=<ruta>`: al crear, vuelve ahí con `?equipo=<id>`.
- `?crear=liga` (Pro): **CreateLeagueSheet** (nombre, pública/privada, sede) → `createEsportsLeague` → `/l/<lid>`.

### 12.4 `/esports/equipo/:teamId` — el equipo (pista 4)

- **Arriba**: `TeamLogo` grande, nombre, `[TAG]`, `GameMark` + juego, descripción.
- **Acción principal**: capitán → «Invitar» (hoja con el código, `QrCode`, `ShareRow`/compartir con
  `teamJoinUrl`, «Cambiar código» y la nota «Necesita su ID del juego.»); miembro → ninguna; quien no es miembro →
  ninguna (se entra con el link).
- **Miembros** (`useEsportsTeam` + `useGameIdsFor(userIds, game)`): `ListRow` por persona: nombre, subtítulo «{ID}
  · {RankChip}», chip de rol («Capitán», «Suplente»), `IdChip`. Capitán: al tocar una fila, hoja con «Hacer
  suplente / titular», «Pasar la capitanía» (confirmación), «Sacar del equipo» (confirmación, `danger`).
- **Torneos del equipo** (`useTeamEntries`): `ListRow` con el torneo y el estado de la inscripción.
- **Más** (menú `•••`): capitán → «Editar equipo» (nombre, tag, descripción, logo), «Borrar equipo» (confirmación);
  miembro → «Salir del equipo».

### 12.5 `/esports/unirse/:code` (pista 4)

Como `JoinPage`: `previewTeamCode` (también sin cuenta) → `InviteHero` con `TeamLogo`, «{nombre} [TAG]», juego y
miembros. Sin cuenta: `SignInCard` (`next` = esta ruta). Sin ID de ese juego: «Primero pon tu ID de {juego}» →
`/esports/mi-id?juego=<g>&volver=/esports/unirse/<code>`. Con todo: «Unirme al equipo» (primary) →
`joinTeam` → a la página del equipo. Código malo: `DeadInvite`.

### 12.6 `/esports/mi-id` — Mi ID de juego (pista 4)

- `useMyGameIds`, `useMyIdMoves`, `useProviders`. `?juego=<g>` abre la hoja de ese juego; `?volver=<ruta>`: al
  guardar, vuelve ahí. `?conectado=<provider>` → toast «Listo: tu cuenta quedó conectada.»; `?error=<codigo>` → toast
  con el texto («Se venció el inicio de sesión: vuelve a intentarlo.», «El proveedor no lo confirmó.»).
- **Aviso** (`NoticeSlot`): el del ID movido (§6.4): «Tu ID {X} de {Juego} pasó a otra cuenta» · «Alguien entró con
  esa cuenta de {Epic} en otra cuenta de MatchMate.» · «Ver» (`/esports/mi-id?juego=<g>`); al cerrarlo, `seenIdMove`.
- **Lista**: un `ListRow` por juego con ID (`GameMark`, «{ID}», subtítulo `RankChip`, `IdChip`); «Agregar un ID» →
  hoja «¿De qué juego?».
- **Hoja del juego** (`src/pages/esports/ids/GameIdSheet.tsx`):
  1. **Un solo paso para escribir**: plataforma (NBA 2K, `Segmented`/select), región (VALORANT, LoL, Free Fire), el
     campo con `placeholder` e `hint` del catálogo y el error de `normalizeGameId` en vivo, y el **rango** (opcional,
     `RankPicker`: la escalera de `LADDERS`; Rocket League con `Segmented` 1v1/2v2/3v3 y, en cada uno, «Tu MMR
     (opcional)» que propone el rango con `rlRankFromMmr`, «aprox., temporada actual»; juegos de número, un campo
     numérico; de texto, un campo). Arriba, «Conectar con Epic/Steam/Riot» si el juego tiene `link` y `useProviders`
     lo dice encendido («La forma más segura: entra con tu cuenta.»). Botón: «Buscar» si el juego tiene búsqueda
     encendida (LoL/VALORANT con Riot); si no, «Guardar».
  2. **Guardar**: `saveGameId` (+ `setRanks` si puso rango) → «Listo: guardaste tu ID» → cierra (o vuelve a
     `volver`).
  3. **Buscar**: guarda (declarado) y busca: `found` → «¿Eres tú?» con «{displayName}» (y el rango en LoL) → «Sí, soy
     yo» (`confirmGameId(game, lookupId)`) → «Listo: tu ID quedó comprobado»; «No soy yo» vuelve al campo.
     `not_found` → «No encontramos ese Riot ID. Revisa cómo lo escribiste.» con «Guardarlo así» (queda declarado).
     `no_disponible` / `error` / `rate_limited` → queda guardado y declarado («Listo: guardaste tu ID»).
  4. **`id_tomado`** (conectado por login en otra cuenta): «Ese ID está conectado a otra cuenta» · «Quien lo conectó
     entró con su cuenta de {Epic}. Si es tuyo, conéctalo tú y pasa a tu cuenta.» + el botón de conectar si está
     encendido; si no, «Prueba con otro ID».
  5. **Resumen** (ya tiene ID): el ID, su `IdChip`, el rango; «Cambiar mi rango», «Comprobar con Riot» (si hay
     búsqueda y no está comprobado), «Conectar con …» (si hay `link` encendido y no es login), «Cambiar mi ID» (no
     login), «Quitar mi ID». Nada de capturas ni de reclamos.

### 12.7 `/esports/:game/nuevo-torneo` — Crear torneo (pista 5)

A pantalla completa como `CreateWizard` (barra de pasos, un botón abajo, `keyboardInset`). Pasos:

1. **Juego y modo**: `GameMark` + nombre (el de la ruta; «Cambiar» vuelve a `/esports?crear=torneo`); modo con
   `Segmented` si hay más de uno (RL 1v1/2v2/3v3; BR solo/dúos/…).
2. **Inscripción**: entrada «Solo equipos» / «Libre» (`entryTypesFor`; en modo individual solo «Libre», con la
   explicación «En 1 contra 1 cada quien se inscribe solo.»); cupo (número, entre `minEntries` y `maxEntries`);
   «Cierra la inscripción» (fecha y hora; por defecto el inicio); check-in (apagado / 15 / 30 / 60 min antes);
   «Aprobar solo» (`autoApprove`); suplentes (0…`subsMax`); «Pedir ID confirmado» **solo en juegos con
   `canVerifyId`** (pista: login → «Con su cuenta de {Epic|Steam} conectada.»; búsqueda → «Comprobado con su Riot
   ID.»); «Pedir rango verificado» **solo en LoL** (`canVerifyRank`; pista «El rango de LoL que da Riot.»). Los dos
   apagados por defecto.
3. **Formato**: tarjetas de formato (`formatsFor`) con una línea cada una («Doble eliminación: nadie queda fuera con
   una sola derrota.»); según el formato, mejor de por fase (`Segmented` con los permitidos del juego), 3.er lugar,
   reinicio de la gran final, grupos y clasificados, ida y vuelta, playoffs simple o doble; FC: «Empates en grupos»;
   SF6/TEKKEN: rondas para ganar; Smash: vidas; BR: rondas, partidas por ronda y la tabla de puntos editable (lista de
   números por puesto, «+ puesto», puntos por kill), con «Volver a los de {juego}».
4. **Nombre y fecha**: nombre, día y hora de inicio, pública o privada, sede (`venueHint`), premio (texto corto),
   reglas o aviso (texto). Acción «Crear torneo» → `createEsportsTournament` → paso 5.
5. **Invitar**: el link del torneo (`/l/<lid>`; privado: el código y el QR, como `CreateWizard`) y «Ir al torneo».

**Lite**: pasos 1, 2 (solo entrada, cupo y cierre; lo demás en «Más opciones»), 3 (solo el formato con los
valores por defecto; los ajustes en «Más opciones») y 4. **Pro**: todo a la vista. `validateSettings` muestra los
errores debajo del paso y no deja seguir. Se llama también con `?liga=<lid>` (desde una liga de esports): crea
adentro de esa liga.

### 12.8 El torneo (`src/pages/sports/esports/screens.tsx`, pista 5)

```ts
const screens: SportScreens = {
  Home: EsportsLeagueHome,        // kind 'torneo': la página del torneo (su único evento); kind 'liga': sus torneos
  Event: EsportsEventPage,        // /l/:lid/e/:eventId: la página del torneo
  Feed: EsportsMatchesPage,       // /l/:lid/juegos: todas las series (abre ?partido=<id>, el link del push)
  Standings: EsportsStandingsPage, // /l/:lid/ranking: tablas de grupos/liga o la tabla BR (si no hay, vuelve al inicio)
  MyProfile: EsportsMyPage,       // /l/:lid/perfil: mis partidos y mi inscripción
  tabs: { home: 'Torneo', feed: 'Partidos', standings: 'Tabla', profile: 'Lo mío' },
};
```

**La página del torneo** (`src/pages/sports/esports/TournamentPage.tsx`, `TournamentView({lid, eventId})`):

- **Arriba**: `GameMark`, nombre, `PhaseChip`, `DateBlock` del inicio, `formatLine`, «{aprobados}/{cupo}», premio.
  Al abrir, si hay partidos finales sin aplicar, `syncBracket(eventId)` (una vez por visita).
- **Una sola acción principal**, la primera que aplique:
  1. Tengo un partido sin resultado o por confirmar → «Anotar resultado» / «Confirmar resultado» (abre la hoja del
     partido).
  2. Check-in abierto y mi inscrito aprobado sin check-in → «Hacer check-in».
  3. Inscripción abierta y no estoy inscrito → «Inscribirme» / «Inscribir mi equipo».
  4. Pro + admin: en `registration` con pendientes → «Revisar inscripciones ({n})»; con aprobados y sin fase →
     «Armar el cuadro» («Empezar» en BR); grupos terminados → «Pasar a playoffs»; BR en curso → «Anotar partida».
- **Avisos** (`useNotice`): «Tu inscripción está por aprobar», «Te falta tu ID de {juego}» (sin ID; o sin comprobar
  si el torneo pide ID confirmado y el juego lo permite; con acción «Poner mi ID»), «El check-in abre el {día} a las
  {hora}».
- `Segmented` según el formato: simple/doble → «Cuadro» | «Equipos» | «Info»; grupos + playoffs → «Grupos» |
  «Playoffs» | «Equipos»; todos contra todos → «Tabla» | «Partidos» | «Equipos»; BR → «Tabla» | «Partidas» |
  «Equipos» («Jugadores» en modo individual). «Info» va al final de «Equipos» cuando no cabe.
- **Cuadro** (`src/pages/sports/esports/bracket/EsportsBracket.tsx`): columnas por ronda (scroll horizontal, como
  `BracketView`), ganadores arriba y perdedores abajo con su título, gran final y reinicio al final; cada partido una
  tarjeta chica con los dos lados (nombre o el texto de la fuente), el marcador de la serie y su estado; toca → la hoja
  del partido. Arma lo que ve con `resolvePlan` (de los enlaces y los partidos) y el campeón con `champion`.
- **Grupos / Tabla**: `StandingsTable` (`src/components/match`) por grupo con `esportsStandings` y las columnas «PJ G
  P {mapas} Dif. Pts» (FC: «PJ G E P GF GC Dif. Pts»), y la «i» con `tiebreakText`; debajo, las series del grupo
  (`MatchCard`).
- **Tabla BR** (`src/pages/sports/esports/br/BrLeaderboard.tsx`): puesto, inscrito, puntos, victorias, kills,
  partidas; la «i» con el orden de desempate. **Partidas**: por ronda, cada partida con su estado y, al tocarla, sus
  puestos y kills.
- **Equipos**: los inscritos aprobados (`ListRow` con `TeamLogo`/nombre, siembra, `EntryStatusChip`, check-in) y, al
  tocar, su plantilla con ID y `RankChip`; en «Libre», «Agentes libres» aparte. Pro + admin: los pendientes con
  «Aprobar» / «Rechazar» (nota), y el menú de cada uno: «Cambiar siembra», «Quitar check-in», «Editar nombre».
- **Info**: el aviso o reglas, la sede, el contacto (de la liga), el formato completo (mejor de por fase, desempates),
  el link para compartir.

**Inscribirse** (`src/pages/sports/esports/register/RegisterSheet.tsx`):

- Modo individual (y agente libre): muestra el ID de juego (o «Primero pon tu ID…» con el link a
  `/esports/mi-id?juego=…&volver=<torneo>`) y su rango → «Inscribirme» / «Inscribirme como agente libre».
- Con equipo: elige uno de sus equipos de ese juego donde es capitán (si no tiene: «Crear equipo» →
  `/esports/<g>?crear=equipo&volver=<torneo>`); después la plantilla: casillas con sus miembros (ID, rango, `IdChip`),
  titular o suplente, y lo que le falta a cada uno según el torneo: «Sin ID» si no tiene; «ID sin comprobar» si el
  torneo pide ID confirmado (y el juego lo permite) y no está comprobado; el rango verificado, solo en LoL. El
  contador «5 titulares · 1 suplente» y el botón «Inscribir a {equipo}» (deshabilitado hasta cumplir). En «Libre» con
  modo de equipo, primero elige: «Con mi equipo» / «Como agente libre».
- Ya inscrito: su estado, «Cambiar plantilla» (en `registration`), «Retirarme» (confirmación).

**El organizador** (todo en `ProOnly` + `isAdmin`, `src/pages/sports/esports/admin/`):

- `SeedSheet`: la lista de aprobados con flechas, y «Al azar» / «Por rango» (`seedEntries`); guardar →
  `setSeeds`.
- `StageSheet` («Armar el cuadro»): resumen del formato y cuántos; «Dejar fuera a los que no hicieron check-in»;
  la vista previa (`EsportsBracket` con el plan sin resultados) y «Crear el cuadro» → `createStage`. Para grupos:
  vista de los grupos. «Pasar a playoffs»: las tablas finales de cada grupo y la vista previa de los playoffs. «Rehacer
  el cuadro» (`deleteStage`, solo sin resultados).
- `FreeAgentsSheet`: los agentes libres con su rango; «Balancear por rango» → vista previa de `balanceTeams` (con la
  fuerza de cada equipo) → «Crear estos equipos» (`formTeams`); o tocar uno → «Sumar a…» (los equipos con lugar) →
  `assignFreeAgent`.
- `BrGameSheet` («Anotar partida»): ronda y partida, mapa, y por cada inscrito el puesto (selector 1…n, sin repetir:
  los tomados salen apagados) y las kills (`−`/`+` y número); capturas; «Guardar partida» → `saveBrGame`. Anular una
  partida.
- Menú `•••` del torneo: «Editar torneo» (`updateTournament`; lo de formato solo antes de empezar), «Cerrar torneo»,
  «Cancelar torneo», «Anotadores» (el `ScorersSheet` de siempre, para BR), «Logo» (el de la liga).

**La hoja del partido** (`src/pages/sports/esports/match/MatchSheet.tsx`), abierta con `?partido=<id>`:

- Arriba: los dos lados (nombre, logo, siembra), «Al mejor de {bo}», el marcador de la serie y el estado (`statusInfo`
  de `components/match/format.ts`), la fase y la hora.
- `ConfirmResultBanner` (el de siempre) para confirmar o reclamar.
- **Anotar** (capitán de un lado, admin o anotador, mientras no esté cerrado): un bloque por mapa/juego, agregando de
  a uno hasta que alguien gana la serie (`seriesWinner`):
  - `val`/`cs`: mapa (selector de la lista), rondas de cada lado (números grandes con `−`/`+`);
  - `goals_ot`: goles de cada lado y «Prórroga (gol de oro)»;
  - `goals_pen`: goles y, con empate, penales; en grupos, «Empate» permitido si `draws`;
  - `points`: puntos;
  - `win`: «¿Quién ganó?» (dos botones) y kills opcionales;
  - `fight`: quién ganó y rondas opcionales («2-1»);
  - `stocks`: quién ganó y vidas que le quedaron;
  - `crowns`: quién ganó y coronas de cada uno.
  Debajo, el error de `validateGame` en vivo; «Foto de la pantalla final» (hasta 3, `addMatchProof`); y la acción
  «Enviar resultado» (o «Guardar resultado» si es admin) con el resumen («Gana {equipo} 2-1») → `finishMatch` con
  `buildSeriesScore` y `seriesWinner`.
- Las capturas guardadas se ven en miniatura (`usePhoto`) y se abren grandes (`PhotoModal`).
- Pro + admin: «Corregir resultado» (la misma edición → `adminCorrectResult`), «W.O.» (quién no vino →
  `setWalkover` con `walkoverScore`), «Cambiar hora» (`rescheduleMatch`), «Anular» (`voidMatch`). Un reclamo
  abierto se resuelve con «Dejar el propuesto» o «Corregir» (`resolveDispute`).

**Lite vs Pro en el torneo**: en Lite se ven el encabezado, la acción principal, las vistas y la hoja del partido
(anotar, confirmar, reclamar); las filas y menús del organizador no salen. En Pro, además, todo lo del organizador.

### 12.9 Consola › Auditoría

Esports no agrega secciones a la consola. Lo único que sale es la acción de auditoría `esports_id_login` (en
`AUDIT_ACTIONS` de `src/pages/superadmin/model.ts`): «ID de juego por cuenta conectada», con el resumen «El ID {X} de
{Juego} pasó a otra cuenta que entró con {Steam|Epic|Riot}» (`target_type 'user'`).

---

## 13. Lo que no entra en esta entrega

- **Modo cancha en vivo** para esports (anotar ronda por ronda mientras se juega): se anota al terminar cada mapa o la
  serie. `claim_scorer`/`publish_match` no se usan.
- **Insignias** de esports (D17), **premios del torneo** (`tournament_prizes`: `prize_comp` no conoce esports; la
  pantalla no ofrece premios), **informe del torneo** (PDF/Excel) y **recordatorios** de partidos
  (`match_reminders` sigue solo con raqueta y equipos).
- **Agenda pública** («¿Dónde juego esta semana?») y el feed social de resultados de esports.
- **Varios lobbies** en battle royale (todos los inscritos juegan cada partida; el cupo es el del lobby) y fórmulas
  de multiplicador de kills: la tabla es puesto + kills × puntos.
- **Swiss**, **escalera** y **cajas** en esports.
- **Bracket reset** a mitad de serie, «ventaja de un mapa» para el que viene de ganadores, **veto de mapas** y
  elección de lado: el mapa se anota como dato.
- **Sincronizar** el rango solo cada cierto tiempo (la búsqueda se hace cuando la persona la pide).
- **Leer páginas** de trackers o de cualquier sitio (solo la API oficial de Riot con clave, D12).
- **Comprobar el ID en los juegos sin un método oficial automático** (MLBB, EA SPORTS FC, NBA 2K, SF6, TEKKEN 8,
  Smash, Clash Royale, Free Fire, Warzone, PUBG Mobile): el ID y el rango se declaran y no son exclusivos (D24). El
  rango verificado tampoco existe fuera de LoL.
- **Reclamos de ID** (apelaciones), códigos de prueba y capturas de ID o de rango con revisión humana (D14, D24): un ID
  conectado se mueve solo con el inicio de sesión (§6.3).
- **Tiempo real** de equipos (no hay tema `esports:team:`): la página del equipo se vuelve a leer al volver a ella y
  después de cada acción.
- **Juntar jugadores** (`merge_league_players`) no mueve `esports_entry_members.player_id` (queda null si se borra el
  jugador que se fue): no afecta los partidos (van por el equipo de temporada).
- Liga de esports con **tabla de temporada** entre torneos: cada torneo tiene su tabla.

---

## 14. Plan de trabajo: 6 pistas en paralelo, archivos sin cruces

Archivos con fin de línea **CRLF** (se editan con Edit, sin reescribirlos; se revisa con `git ls-files --eol`):
`index.html`, `public/manifest.webmanifest`, `src/components/Shell.tsx`, `src/pages/HomePage.tsx`,
`src/pages/LeaguesPage.tsx`, `src/pages/superadmin/model.ts`, `src/sports/registry.ts`,
`src/sports/registry.test.ts`, `src/sports/status.test.ts`. Los archivos nuevos van en LF.

Cada pista toca **solo** sus archivos. Lo que usa de otra pista lo usa por los nombres de este documento (si todavía
no existe, compila contra la firma de aquí). Ningún archivo está en dos pistas. Nadie hace commit ni push.

### Pista 1 — SQL, pruebas SQL, humo y README de la base

**Crea:** `supabase/migrations/20261008000100_esports.sql`, `tests/sql/esports.test.ts`,
`tests/sql/esports-ids.test.ts`. (Las migraciones de reclamos y de Storage y su prueba se borran, D24.)

**Cambia:** `tests/sql/seguridad.test.ts` (`RPC_AUTHENTICATED`, `RPC_SERVICE_ONLY`, `ANON_ALLOWED` con
`esports_team_preview` y `esports_hub`), `tests/sql/nuevas.test.ts:114` y `tests/sql/sueltos.test.ts:70` (11 deportes),
`tests/sql/consola.test.ts:573-576,658-661` (11; el último `esports`), `tests/sql/ping-pong.test.ts:93-94` (11; el
último ya no es ping pong: buscarlo por id), `scripts/supabase/smoke.sql` (`v_expected` + `'20261008000100'`; un
bloque «esports» que crea un torneo, un equipo e inscribe), `scripts/supabase/README.md:45` (las 51 migraciones),
`supabase/README.md` (la fila de la migración, `sport_status` con `esports`, las tablas de §9.3, las RPC de §9.5–§9.7
en su sección «Esports», los errores de §9.13).

**Exporta (para las otras pistas):** los nombres, argumentos y formas de vuelta de §9 (las RPC son el contrato).

### Pista 2 — Motores puros

**Crea:** `src/sports/esports/catalog.ts`, `ranks.ts`, `data/rocketLeagueMmr.ts`, `gameIds.ts`, `series.ts`,
`standings.ts`, `brackets.ts`, `seeding.ts`, `settings.ts`, `tournament.ts`, `index.ts`, y sus pruebas
`catalog.test.ts`, `ranks.test.ts`, `gameIds.test.ts`, `series.test.ts`, `standings.test.ts`, `brackets.test.ts`,
`seeding.test.ts`, `settings.test.ts`, `tournament.test.ts`.

**No toca** nada fuera de `src/sports/esports/` (no importa `SportId`: el catálogo no depende del registro).

**Exporta:** §2.2, §2.5, §2.6, §3.1–§3.7 (todo por `src/sports/esports/index.ts`).

`catalog.test.ts` revisa: 15 juegos en el orden de §2.1; cada `color` con contraste ≥ 4.5 con blanco y todos
distintos; `defaultMode ∈ modes`; `bestOf` por defecto dentro de los permitidos; `lobby` y `br` solo en BR; `verify`,
`link` y `lookup` como en la tabla de §7.

### Pista 3 — Capa de datos de torneos y equipos + el deporte en la app

**Crea:** `src/lib/data/esports.ts` (+ `esports.test.ts` con el backend de mentira y `esports.flow.test.ts` con
PGlite: crear equipo, unirse, crear torneo, inscribir, aprobar, crear fase, anotar y confirmar, ver que avanza),
`src/components/esports/bits.tsx` (+ `bits.test.ts`, render a texto), `src/components/home/EsportsHomeRow.tsx` (la
fila de Hoy y Ligas y el aviso del ID movido, `useEsportsHome`).

**Cambia:** `src/sports/types.ts`, `src/sports/registry.ts` (CRLF), `src/sports/registry.test.ts` (CRLF),
`src/sports/status.test.ts` (CRLF), `src/lib/sportContext.test.ts`, `src/pages/superadmin/model.ts` (CRLF;
`FAMILY_LABEL` y la acción de auditoría `esports_id_login`, §12.9),
`src/App.tsx` (las rutas de §12.1 con `lazy` a los archivos de las pistas 4 y 5), `src/components/Shell.tsx`
(`/esports` en Ligas), `src/pages/SportHomePage.tsx`, `src/pages/HomePage.tsx`, `src/pages/LeaguesPage.tsx`,
`src/components/create/CreateWizard.tsx`, `src/components/share/palette.ts` (+ `palette.test.ts`),
`src/components/splash/scenes.ts` (+ `scenes.test.ts`), `index.html` (CRLF, generado + textos),
`public/manifest.webmanifest` (CRLF), `src/pages/legal/PrivacyPage.tsx`, `src/pages/InfoPages.test.ts`,
`src/badges/catalog.ts`, `src/badges/catalog.test.ts`, `src/badges/rules/activity.ts`, `src/badges/visual/icons.ts`,
`src/badges/visual/icons.test.ts`, `supabase/functions/_shared/badges-engine.gen.js` (generado), `README.md`,
`docs/arquitectura.md` (una sección corta «Esports» que apunta aquí).

**Exporta:** §10.1 y §11.4.

### Pista 4 — Pantallas: Esports, la página del juego, equipos e IDs de juego

**Crea:** `src/pages/esports/EsportsHomePage.tsx`, `GameHubPage.tsx`, `TeamPage.tsx`, `JoinTeamPage.tsx`,
`GameIdsPage.tsx`, `src/pages/esports/teams/CreateTeamSheet.tsx`, `teams/EditTeamSheet.tsx`,
`teams/TeamInviteSheet.tsx`, `teams/CreateLeagueSheet.tsx`, `src/pages/esports/ids/GameIdSheet.tsx`,
`ids/RankPicker.tsx`, `src/pages/esports/GamePickerSheet.tsx`, `src/pages/esports/logic.ts`
(lo puro de estas pantallas: textos, qué acción principal va, el paso de la hoja del ID) y las pruebas
`src/pages/esports/logic.test.ts` y `src/pages/esports/esports-render.test.ts` (humo con `renderToString`: hub sin
cuenta, equipo como capitán y como miembro, la hoja del ID en cada paso: guardar, buscar, `id_tomado` y el
resumen).

**Usa:** pista 2 (catálogo, rangos, `normalizeGameId`, `rlRankFromMmr`), pista 3 (`esports.ts`, `bits.tsx`),
pista 6 (`esportsIds.ts`).

### Pista 5 — Pantallas: torneos

**Crea:** `src/pages/esports/CreateTournamentPage.tsx`, `src/pages/esports/create/` (los pasos del asistente y su
`logic.ts` + `logic.test.ts`), `src/pages/sports/esports/screens.tsx`, `TournamentPage.tsx`, `LeagueHome.tsx`,
`MatchesPage.tsx`, `StandingsPage.tsx`, `MyPage.tsx`, `bracket/EsportsBracket.tsx`, `br/BrLeaderboard.tsx`,
`br/BrGamesList.tsx`, `register/RegisterSheet.tsx`, `match/MatchSheet.tsx`, `match/GameRow.tsx` (un mapa/juego
según la regla), `admin/SeedSheet.tsx`, `admin/StageSheet.tsx`, `admin/FreeAgentsSheet.tsx`, `admin/BrGameSheet.tsx`,
`admin/EntriesAdmin.tsx`, `logic.ts` (la acción principal, las vistas por formato, armar el plan con los ajustes,
de partidos a `KeyResult`) y las pruebas `src/pages/sports/esports/logic.test.ts` y
`src/pages/sports/esports/esports-render.test.ts` (humo: torneo sin cuenta, capitán con partido por anotar,
organizador en Pro con pendientes, BR con tabla, la hoja del partido de VALORANT, Rocket League y FC).

**Usa:** pista 2, pista 3 (`esports.ts`, `bits.tsx`), `src/lib/data/matches.ts` y `src/components/match/*` tal
cual, y de la pista 6 `useGameIdsFor`.

### Pista 6 — Verificación: Edge Functions e IDs de juego

**Crea:** `supabase/functions/esports-verify/index.ts`, `esports-verify/core.ts`,
`supabase/functions/esports-auth/index.ts`, `esports-auth/core.ts`, `supabase/functions/_shared/esports-providers.ts`,
`src/lib/esportsFunctions.test.ts`, `src/lib/data/esportsIds.ts` (+ `esportsIds.test.ts`).

**Cambia:** `supabase/config.toml` (las dos funciones), `docs/CONFIGURAR-SUPABASE.md` (los secretos de §8.1, cómo
registrar las apps de Epic y Riot con las URLs de vuelta, cómo publicar las dos funciones). No toca la consola ni
`src/lib/backend/local.ts` (no hay bucket nuevo).

**Exporta:** §10.2.

### Contrato entre pistas (resumen)

| De | Para | Qué |
|---|---|---|
| 1 | 3, 6 | Las RPC de §9 (nombres, `p_…`, formas de vuelta en camelCase donde dice jsonb). |
| 2 | 3, 4, 5, 6 | `src/sports/esports` (§2, §3). Las Edge Functions (pista 6) **no** importan de `src/`: la base normaliza por ellas (`esports_begin_lookup`). |
| 3 | 4, 5 | `src/lib/data/esports.ts` (§10.1), `src/components/esports/bits.tsx` (§11.4), las rutas de §12.1. |
| 6 | 4, 5 | `src/lib/data/esportsIds.ts` (§10.2). |
| 4 | 5 | Nada importado: 5 enlaza a `/esports/<g>?crear=equipo&volver=…` y a `/esports/mi-id?juego=…&volver=…`. |

---

## 15. Pruebas

### 15.1 SQL (pista 1), con el patrón de `ping-pong.test.ts` (una transacción por prueba, `makeWorld`)

**`tests/sql/esports.test.ts`**

- `sport_status`: `esports` `open`, familia `esports`, orden 11; `sport_status_family_check` acepta `esports`.
- Una cuenta crea un torneo suelto (liga `torneo` + evento + fila); una liga de esports y un torneo adentro (admin;
  otro juego → `invalido`); `leagues.rules` sin juego → `invalido`; evento de otro tipo → `invalido`.
- Ajustes: cada clave de §3.6 fuera de rango → `invalido`; modo de otro juego → `invalido`; BR con formato de
  partidos → `invalido`; «Solo equipos» en 1v1 → `invalido`.
- Equipos: crear (sin ID de ese juego → `sin_id`; con el ID solo declarado, se puede; duelo → `invalido`; nombre
  repetido → `duplicado`; 6.º del día → `rate_limited`), código (solo el capitán lo lee), `esports_team_preview` sin
  cuenta, unirse (código malo → null y a los 10 `rate_limited`; sin ID → `sin_id`; con el ID declarado, entra), lleno
  → `cupo_lleno`, salir, sacar, pasar la capitanía, borrar la cuenta del capitán → pasa al más antiguo,
  `member_count`.
- Logo del equipo: `esports_begin_team_logo` + `can_upload_logo_path` da true al capitán y false a un miembro;
  `set_team_logo` deja el anterior en la cola; `purge_queue_take('logos')` no toma uno en uso.
- Inscripción: cerrada → `cerrado`; privada sin ser miembro → `no_permitido`; plantilla corta o larga →
  `invalido`; miembro sin ID → `sin_id`; con `requireConfirmedId`, en VALORANT con el ID declarado →
  `id_sin_comprobar` y en MLBB (sin comprobación) con el ID declarado → entra; sin `requireConfirmedId` en los
  ajustes → no se pide; con `requireVerifiedRank`, en LoL con rango declarado → `sin_rango` y en VALORANT se ignora;
  la misma persona en dos inscritos → `duplicado`; con `autoApprove`, aprobado y materializado; cupo → `cupo_lleno`.
- Aprobar materializa (miembro, jugador, equipo de temporada, `team_players` con `captain`) y `match_side_of` da su
  lado al capitán y null a un miembro; rechazar en `registration` desmaterializa; en `live` → `cerrado`.
- Check-in fuera de la ventana → `cerrado`; el admin siempre.
- Agentes libres: `esports_form_teams` crea inscritos aprobados y deja a los agentes `assigned`;
  `assign_free_agent` mueve la foto.
- Fases: `esports_create_stage` con un plan de doble eliminación de 4 (enlaces, `format`, `rules`); un enlace a un id
  de fuera del lote → `invalido`; la fase dos veces → `duplicado`; el torneo pasa a `live`.
- Marcador: las filas de la tabla de §3.2 contra `esp_series_ok` (y por `finish_match` → `invalido` las malas);
  VALORANT 13-12 rechazado por `finish_match`; FC empate solo en grupos al mejor de 1; W.O. con su forma; `proof` con
  una foto de otra liga → `invalido`.
- Avance: confirmar `W1-1` pone al ganador en `W2-1` y al perdedor en `L1-1`; corregir `W1-1` con `W2-1` ya jugado →
  `cerrado`; gana el lado 2 en `GF` → `GF2` con los dos; gana el lado 1 → `GF2` `void`; `esports_sync` aplica uno
  propuesto hace 49 h.
- BR: `esports_br_save_game` con puestos repetidos → `invalido`; un anotador puede; un capitán no
  (`no_permitido`); reemplaza los resultados.
- `esports_hub` sin cuenta: ve el público y no el privado; el miembro del privado sí.
- RLS: un visitante lee torneos, inscritos y partidas de uno público; no lee `esports_team_members` ni
  `esports_game_ids`; nadie escribe directo (lo cubre `seguridad.test.ts`).
- `badge_awards`/`badge_progress`/`badge_stats` aceptan `'esports'` (nombres en `pg_constraint`).
- `push_category('esports:entry:x')` = `'liga'`.

**`tests/sql/esports-ids.test.ts`**

- `esp_normalize_id` con los casos de §3.1 (los mismos resultados que el motor); `esp_verify_kind` y
  `esp_rank_verifiable` con la tabla de §7 entera.
- Guardar → `pendiente`, `declarado`; dos cuentas guardan el mismo ID declarado (también con mayúsculas o espacios
  distintos) → las dos pueden; `esports_confirm_game_id` sin búsqueda → `invalido`; una búsqueda de otra cuenta, vieja
  (16 min) o de otro ID → `invalido`; con una buena → `confirmado`, `busqueda` y, en LoL, `verificado` (VALORANT: sin
  rango); dos cuentas comprobadas por búsqueda con el mismo Riot ID → las dos pueden.
- `esports_begin_lookup` de un juego sin búsqueda → `{ok: false, reason: 'invalido'}`; el 21.º en la hora da
  `rate_limited`; `esports_store_lookup` de VALORANT guarda `ranks {}`.
- `esports_store_lookup`, `esports_begin_lookup`, `esports_link_*` solo con `service_role`; `esports_link_take` de un
  state usado → null.
- `esports_link_account`: con otra cuenta conectada con el mismo ID (o el mismo `external_id`) → borra su fila, deja
  una fila en `esports_id_moves`, el push y la auditoría `esports_id_login`, y devuelve `'ok'`; las filas declaradas
  de otros no se tocan. Después, `esports_save_game_id` y `esports_confirm_game_id` de otra cuenta con ese ID →
  `id_tomado`; su propia fila `login` → `invalido`.
- `esports_my_id_moves`: solo los suyos sin ver de los últimos 30 días, los más nuevos primero; `esports_seen_id_move`
  los marca; el de otra cuenta → `no_existe`. Nadie lee `esports_id_moves` directo.
- Cambiar el ID lo deja `pendiente` y `declarado`; con una inscripción aprobada en un torneo `live` → `cerrado`.
- Un visitante no lee la tabla; una cuenta no lee `external_id` de otra (`42501` por columna).
- `export_my_data` trae `esportsIds`, `esportsTeams`, `esportsEntries` y `esportsIdMoves`.

### 15.2 TypeScript

- Pista 2: §3 (las tablas de casos de cada módulo); además, `catalog.test.ts` revisa `verify` contra la tabla de §7
  (`canVerifyId`, `canVerifyRank`) y `settings.test.ts`, que `defaultSettings` deja `requireConfirmedId` en `false` y
  que los dos pedidos quedan `false` en los juegos que no los permiten.
- Pista 3: `esports.test.ts` (filas → tipos, `createStage` cambia llaves por ids y enlaces, `keyResults`,
  `esportsErrorText` con `id_sin_comprobar`), `esports.flow.test.ts` (PGlite de punta a punta), `bits.test.ts` (los
  chips «Cuenta conectada», «Comprobado», «Declarado» y «· Verificado» / «· Declarado»), y las pruebas de listas
  (`registry`, `status`, `sportContext`, `palette`, `scenes`, `InfoPages`, `catalog`, `icons`, `bundle`).
- Pista 4 y 5: `logic.test.ts` y los humos de render.
- Pista 6: `esportsFunctions.test.ts` (§8.4) y `esportsIds.test.ts` (en local `useProviders` da `PROVIDERS_OFF` y
  `lookupGameId` da `no_disponible`; `confirmGameId` manda `p_lookup`; `useMyIdMoves`/`seenIdMove`; los textos de
  `gameIdErrorText`).

### 15.3 Verificación final (después de juntar las pistas)

- `pnpm typecheck`, `pnpm test`, `pnpm test:sql`, `pnpm build`.
- En el navegador a 375 px, claro y oscuro, en Lite y en Pro:
  - el selector de deporte con Esports (11 cuadros) lleva a `/esports`; Hoy y Ligas con su fila;
  - Mi ID de juego: escribir un Riot ID (sin claves: «Guardar», queda «Declarado»), rango declarado; Rocket League
    con MMR por modo; un juego sin comprobación (MLBB) con el mismo ID en dos cuentas;
  - crear un equipo de VALORANT, invitar con el link desde otra cuenta, unirse;
  - crear un torneo de VALORANT doble eliminación, «Solo equipos», con 4 equipos; aprobar, sembrar por rango, armar
    el cuadro; anotar una serie 2-1 (13-9 7-13 13-11) como capitán, confirmar desde el otro capitán y ver el avance
    en ganadores y perdedores hasta la gran final con reinicio;
  - un torneo de Rocket League 3v3 «Libre» con agentes libres: balancear por rango;
  - un torneo de EA SPORTS FC todos contra todos con un empate;
  - un torneo de Free Fire escuadras: anotar 2 partidas y ver la tabla;
  - con Epic configurado: conectar el mismo Epic ID desde otra cuenta y ver que pasa a esa cuenta y que a la primera
    le llega el aviso «Tu ID … pasó a otra cuenta» en Mi ID de juego, Esports y Hoy.

---

## 16. Orden, coordinación y riesgos

1. Las seis pistas arrancan juntas. La pista 2 publica primero `catalog.ts` y los tipos (`index.ts`) para que las
   demás compilen; la pista 1 escribe las RPC con las firmas de §9 desde el principio.
2. Al juntar: primero 1 y 2 (base y motores, con sus pruebas), luego 3 y 6 (datos y funciones), luego 4 y 5
   (pantallas). Correr `node scripts/icons/splash.mjs` y `pnpm badges:bundle` una vez al final, en la pista 3.
3. **Riesgos:**
   - **Archivos CRLF** (`registry.ts`, `registry.test.ts`, `status.test.ts`, `index.html`, `manifest`): con Edit, sin
     reescribirlos; revisar con `git ls-files --eol`.
   - **Copias de funciones** (§9.12): partir siempre del cuerpo de la última definición; `purge_queue_take` es de
     `service_role` (no darla a nadie más).
   - **Normalización del ID** en dos idiomas (TS y SQL): las pruebas de las pistas 1 y 2 usan los mismos casos
     (§3.1). Si una cambia, cambian las dos.
   - **Reglas del marcador** en dos idiomas: igual (§3.2).
   - **Proveedores**: Riot Sign On necesita aprobación de producción; Epic, registrar la app. Sin secretos todo
     funciona con «Declarado» (y «Conectar con Steam», que no necesita clave).
   - **Datos de MMR de Rocket League**: cambian cada temporada (un solo archivo, §2.6).
   - **Otra entrega en paralelo** que toque `export_my_data`, `push_category`, `purge_queue_take` o los checks de
     insignias: la migración que corra después parte del cuerpo de la otra; al juntar chocan `v_expected` de
     `smoke.sql`, el conteo de `scripts/supabase/README.md` y las listas de `seguridad.test.ts`.
