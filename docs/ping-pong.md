# Ping pong (tenis de mesa): el deporte nuevo y su lógica

> **Estado:** especificación para implementar en una sola entrega (rama `entrega-pingpong`, base `f467c03`).
> Producción tiene todas las migraciones hasta `20260929001400`. La migración nueva es
> `supabase/migrations/20260930000200_ping_pong.sql`. Las migraciones aplicadas no se tocan: lo que cambia de ellas
> se redefine aquí con `create or replace` y la misma firma, empezando **siempre desde su última definición**.
> Los identificadores van en inglés y los textos que ve el jugador, en español con tú y entre comillas «».

**Lo que pidió el dueño:** «agrega el ping pong como deporte y su lógica».

**Lo que se construye (alcance aprobado):**

1. Un deporte nuevo, `table_tennis`, que se muestra como «Ping pong» con el alias «Tenis de mesa». Es de la familia
   de raqueta y queda abierto para todos desde el primer día.
2. Las reglas oficiales de la ITTF (Leyes 2.11 a 2.14):
   - el juego es a 11 y se gana por 2 (en 10-10 se sigue hasta sacar 2 de ventaja);
   - el partido es al mejor de 3, 5 o 7 juegos (5 por defecto);
   - el saque cambia cada 2 puntos, y desde el 10-10 cada punto;
   - los jugadores cambian de lado al terminar cada juego, y a los 5 puntos del juego decisivo (la app lo muestra
     como aviso);
   - se juega individual y en dobles, con la rotación de saque de dobles.
3. Funciona en todo lo que ya tienen los demás deportes de raqueta:
   - ligas y torneos sueltos, con los formatos que tienen sentido (§4);
   - anotación en vivo, con el indicador de quién saca;
   - resultado y confirmación del rival;
   - tabla de posiciones, estadísticas y perfil;
   - selector de deporte, Home, íconos y un color propio;
   - la animación de apertura;
   - las insignias automáticas;
   - los premios del torneo y el informe del torneo;
   - la agenda y el feed público;
   - la página «Acerca de».

---

## 1. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | El id es **`table_tennis`**. El nombre visible es **«Ping pong»** (`lower: 'ping pong'`) y el alias es «Tenis de mesa», en un campo opcional nuevo, `SportMeta.alias`. | En la República Dominicana se dice «ping pong»: «Crear liga de ping pong», «Esta liga es de ping pong». El nombre de la federación (FEDOTEME), «tenis de mesa», sale como subtítulo para quien lo busque así. El id pasa el check de `sport_status.id` (`^[a-z][a-z_]{1,19}$`). |
| D2 | Un **motor propio**, `src/sports/racket/tableTennis.ts`, del mismo estilo que `pickleball.ts`. No se reutiliza el motor de pickleball con otra opción. | El conteo es siempre por rally, pero quién saca **no** depende de quién ganó el punto: sale de los puntos jugados en el juego (2 saques cada uno, 1 desde el 10-10). Los dobles tienen un orden de 4 turnos que se arrastra al juego siguiente y se cruza en el decisivo. Meter todo eso en `PickleballState` rompería el side-out, el 0-0-2 y el canto de pickleball. |
| D3 | El ping pong se cuenta «a juegos», como el pickleball. En las tablas, los «sets» son juegos y los «juegos» son puntos. Los totales del partido son `{ sets: juegos ganados, games: juegos ganados, points: puntos }`. Las ramas que hoy dicen `sport === 'pickleball'` pasan a preguntar `isGameSport(sport)`, que vale para `'pickleball'` y `'table_tennis'`. | Así el ping pong reutiliza las columnas «Jue. / PF / PC / Dif.», el perfil «Juegos / Puntos», el ranking de temporada, el informe del torneo y las lecturas de las insignias, sin una tercera rama en cada archivo. Al agregar `TableTennisRules` a la unión `RacketRules`, TypeScript obliga a revisar cada `r.sport !== 'pickleball'` que hoy supone tenis. |
| D4 | `bestOf` es **3, 5 o 7** (5 por defecto). El juego es **a 11 fijo** y se gana por 2 fijo. `switchAt` vale 5 o null. No hay juego a 21, ni partido a un solo juego, ni sistema de aceleración. | Es lo aprobado (reglas oficiales). Los campos `gameTo` y `winBy` existen solo para que las cuentas de «carrera» (`raceWinner`, `raceFinal`, `normalizeGames`) y las insignias lean lo mismo que en pickleball. El mejor de 7 obliga a abrir dos candados: `isBestOf` en TypeScript y el tope de 3 de `private.raq_score_ok` en SQL (§7.3). |
| D5 | La tabla sigue la **regla de grupos de la ITTF** (Reglamento 3.7.5.1): ganar da 2, perder un partido jugado da 1 y perder uno sin jugar (W.O.) o sin terminar (retiro) da 0. El retiro llega con «ret.» en el texto del marcador y los totales ya completados; `racketResultOf` marca `MatchResult.retired` y `TABLE_TENNIS_POINTS.retiredLoss` le da 0, y sus juegos y puntos siguen contando para los desempates. Los desempates van primero entre los empatados (puntos, dif. de juegos, dif. de puntos), después la dif. de juegos y la de puntos de toda la tabla, y al final el sorteo. | La ITTF usa cocientes (juegos ganados entre perdidos); lo aprobado pide diferencias, que se leen mejor en un teléfono. Los dos pasos de toda la tabla no están en la ITTF. Se agregan porque en una liga a medias puede haber empatados que todavía no jugaron entre ellos. |
| D6 | Formatos: **liga, torneo, liga por cajas y escalera**. **No** hay americano, mexicano ni noches (§4). | Las parejas que rotan cada ronda no existen en el ping pong. Sumarlas arrastraría toda la infraestructura de noches: `night_league`, `NIGHT_SPORTS`, `event_reminders`, `badges_daily`, el premio `racket_night` y `hasNights`. |
| D7 | El orden en las listas es **10**, al final. El color es **`#b01cbd`** (fucsia). En las imágenes para compartir, **`#86198f`** (fucsia oscuro, con letras blancas). | La prueba del registro lee `sport_status` de las migraciones y solo entiende `insert` y `update … set status … where status …` (`registry.test.ts:30-45`). Reordenar a los demás deportes rompería la prueba y cambiaría el orden en producción. Primero se pensó en el rojo de la goma (`#dc2626`), pero el color del deporte pinta toda la app (`--accent`: botones, insignias, lo elegido, el lado A de la mesa) y ese rojo daba casi lo mismo que `--danger` (`#c62222` contra `#c62828` en claro): un botón normal parecía uno de borrar y lo elegido, un error. El fucsia queda lejos del rojo de peligro y del ámbar de aviso en claro y en oscuro (lo revisa `registry.test.ts` para todos los deportes), del morado de la marca y del rosa del pickleball, y pasa AA con `accentVars`. |
| D8 | El modo cancha propio es **`TableTennisCourt`**, conectado con `ext.court`, como `PickleballCourt`. `SetsCourt` solo se ajusta para que compile. | El anotador necesita cosas que `SetsCourt` no muestra: quién saca y quién recibe, cuántos saques le quedan («2.º saque»), «Un saque cada uno» desde el 10-10, el cambio de lado a los 5 del decisivo y, en dobles, el aviso del cambio de orden de recepción. |
| D9 | El nivel del jugador es una escala propia, **`attrs.tt`, de 1 a 10** con un decimal («Nivel 5.5»). | La escala del pádel (`attrs.level`) pasa por `setPlayerLevel`, que la topa en 0–7 (`lib/data/racket.ts:177`). El rating de USATT (0–3000) no pasa `parseLevelInput` (`^\d{1,2}`). Una escala de club de 1 a 10 sirve para sembrar el torneo y armar las cajas del primer mes. |
| D10 | **No hay insignia nueva** de «primera victoria». El ping pong entra en todas las de raqueta, con sus propios textos donde el deporte lo pide: el 11-0 se llama «Zapatero», y la remontada es desde 0-2 en juegos (§8). | El catálogo no tiene «primera victoria» para ningún deporte: `debut` cubre el primer partido y `racket_wins` arranca en 5. Una key nueva cambiaría el diseño de todas las raquetas (100 keys, `docs/insignias.md` §2). Queda como propuesta aparte. |
| D11 | En las pantallas donde el admin escribe o ve dónde se juega, se dice **«mesa» y «mesas»** en lugar de «cancha». Es una palabra nueva en `RacketExtensions.words`. | «Cancha 2» no tiene sentido en un salón de ping pong. El modo de anotar en vivo sigue llamándose así por dentro (`?cancha=1`). |
| D12 | No hay datos de demostración. | Ningún deporte los tiene: `supabase/seed.sql` solo siembra boliche. |

---

## 2. El deporte en el registro

### 2.1 Tipos (`src/sports/types.ts`, LF)

- Agregar `'table_tennis'` a `SportId`.
- Agregar `table_tennis: 'racket'` a `SPORT_FAMILY`.

### 2.2 Ficha (`src/sports/registry.ts`, CRLF)

**`SportMeta`** gana un campo opcional nuevo:

```ts
/** Otro nombre del deporte («Tenis de mesa»): sale debajo del nombre en la portada y en el selector. */
alias?: string;
```

`SportGroup` gana también `alias?: string`. `groupSports` lo copia cuando el grupo tiene un solo deporte.

**Ícono.** Lucide 1.47 no trae paleta de ping pong, así que se dibuja con `createLucideIcon`, junto a `TennisBall` y
`Basketball` (línea 176):

```ts
/** Paleta de ping pong: la cara redonda, el mango y la pelota. */
export const PingPong: LucideIcon = createLucideIcon('ping-pong', [
  ['circle', { cx: '10', cy: '10', r: '7', key: 'blade' }],
  ['path', { d: 'm15 15 5.5 5.5', key: 'handle' }],
  ['circle', { cx: '19.5', cy: '4.5', r: '2', key: 'ball' }],
]);
```

Reglas para el ícono:

- el trazo es el de Lucide: 24×24 con línea de 2;
- tiene que ser distinto de todos los demás (`registry.test.ts:74-88`);
- no lleva el `<circle cx="12" cy="12" r="10">`, así que **no** entra en el bucle de la línea 81.

**Entrada en `SPORTS`**, después de `swimming`:

```ts
table_tennis: {
  ...racket('table_tennis'),
  id: 'table_tennis',
  name: 'Ping pong',
  alias: 'Tenis de mesa',
  modality: null,
  label: 'Ping pong',
  short: 'Ping pong',
  lower: 'ping pong',
  group: 'table_tennis',
  icon: PingPong,
  venueHint: 'Club o salón donde están las mesas',
  units: { match: MATCH, score: 'juegos', side: PLAYER },
  eventTypes: RACKET_FORMATS,
  phase: 3, // llega con el motor de raqueta de la fase 3
  scene: 'table_tennis',
  order: 10,
  color: '#b01cbd',
},
```

`venue` queda en `'Club'`, que viene de `racket()` y es de los valores que acepta la prueba. Se actualiza el
comentario de `RACKET_FORMATS`: «los cuatro deportes de raqueta».

### 2.3 Dónde sale el alias

- **`src/components/home/SportHero.tsx`:** debajo de `meta.label`, en `text-sm text-muted`: «Tenis de mesa».
- **`src/pages/sports/SportPicker.tsx`:** en el cuadro del grupo, debajo del nombre, `text-xs text-muted` (mismo
  lugar que «Beta»).
- **`src/pages/AboutPage.tsx`:** en el `aria-label` y el `title` del cuadro: «Ping pong (tenis de mesa)». El texto
  visible queda en `g.name`, porque «Ping pong» cabe en 11 px.

### 2.4 Todo lo demás del registro sale solo

Lo siguiente se arma desde la ficha y no necesita cambios:

- `SPORT_LIST`, `SPORT_IDS`, `SPORT_GROUPS`, `DEFAULT_SPORT_STATUS` (`status.ts:23`) y las funciones `sportsOf`,
  `dispatchSport` y `groupSports`;
- el tinte y el tema del deporte (`mm-tint-tabletennis`, `mm-sport-tabletennis`);
- `sportHomePath` (`/d/table_tennis`) y `Welcome.tsx`;
- el selector de deporte: con 10 cuadros queda 3+3+3+1, así que hay que revisarlo a 375 px, pero no cambia la
  grilla;
- la consola del superadmin y los tours (`liga-table_tennis`).

La liga nueva guarda `leagues.rules = { match: defaultRules('table_tennis') }` (`lib/data/leagues.ts:269`).

---

## 3. Reglas y motor

### 3.1 Tipos y plantillas (`src/sports/racket/rules.ts`, LF)

```ts
export type RacketSport = 'tennis' | 'padel' | 'pickleball' | 'table_tennis';
export const RACKET_SPORTS: readonly RacketSport[] = ['tennis', 'padel', 'pickleball', 'table_tennis'];

/** Ping pong (ITTF 2.11–2.14): juegos a 11 ganando por 2, al mejor de 3, 5 o 7, individual o dobles. */
export interface TableTennisRules {
  sport: 'table_tennis';
  /** Dobles: orden de saque A1→B1→A2→B2 (ver tableTennis.ts). */
  doubles: boolean;
  /** Puntos del juego: 11 (fijo; el campo existe para las cuentas de carrera, como en pickleball). */
  gameTo: 11;
  /** Siempre por 2: en 10-10 se sigue hasta sacar 2 de ventaja. */
  winBy: 2;
  bestOf: 3 | 5 | 7;
  /** Cambio de lado en el juego decisivo cuando alguien llega a estos puntos (5). null = sin aviso. */
  switchAt: 5 | null;
}

export type RacketRules = TennisRules | PickleballRules | TableTennisRules;

/** Deportes de raqueta a juegos de puntos (sin sets): en las tablas los «sets» son juegos y los «juegos», puntos. */
export type GameSport = 'pickleball' | 'table_tennis';
export const isGameSport = (sport: string | null | undefined): sport is GameSport => sport === 'pickleball' || sport === 'table_tennis';
export type GameSportRules = PickleballRules | TableTennisRules;
export const isGameSportRules = (r: RacketRules): r is GameSportRules => isGameSport(r.sport);
```

Plantillas. El tipo de `RULE_PRESETS` es un objeto explícito, así que se agrega
`table_tennis: RulePreset<TableTennisRules>[]`. La primera plantilla es la de por defecto:

```ts
const TABLE_TENNIS: TableTennisRules = { sport: 'table_tennis', doubles: false, gameTo: 11, winBy: 2, bestOf: 5, switchAt: 5 };

table_tennis: [
  { id: 'bo5', label: 'Individual, al mejor de 5 juegos a 11', rules: TABLE_TENNIS },
  { id: 'bo3', label: 'Individual, al mejor de 3 juegos a 11', rules: { ...TABLE_TENNIS, bestOf: 3 } },
  { id: 'bo7', label: 'Individual, al mejor de 7 juegos a 11', rules: { ...TABLE_TENNIS, bestOf: 7 } },
  { id: 'dobles', label: 'Dobles, al mejor de 5 juegos a 11', rules: { ...TABLE_TENNIS, doubles: true } },
  { id: 'dobles-bo3', label: 'Dobles, al mejor de 3 juegos a 11', rules: { ...TABLE_TENNIS, doubles: true, bestOf: 3 } },
  { id: 'dobles-bo7', label: 'Dobles, al mejor de 7 juegos a 11', rules: { ...TABLE_TENNIS, doubles: true, bestOf: 7 } },
],
```

**`defaultRules` y `resolveRules`** llevan una sobrecarga nueva: `(sport: 'table_tennis', …): TableTennisRules`.
`resolveRules` no recalcula `switchAt` para el ping pong; la línea 212 queda solo para pickleball.

**`validateRules`** lleva una rama nueva **antes** de la revisión general de `bestOf` (línea 174), porque esa
revisión solo acepta 1, 3 o 5:

```ts
if (r.sport === 'table_tennis') {
  if (r.bestOf !== 3 && r.bestOf !== 5 && r.bestOf !== 7) e.push('El partido es al mejor de 3, 5 o 7 juegos.');
  if (r.gameTo !== 11) e.push('El juego es a 11 puntos.');
  if (r.winBy !== 2) e.push('El juego se gana por 2.');
  if (r.switchAt !== 5 && r.switchAt !== null) e.push('El cambio de lado del juego decisivo es a los 5 puntos.');
  return e;
}
```

**`normalizeGames`** hoy recibe `r: PickleballRules`. Se cambia el tipo del parámetro a
`Pick<GameSportRules, 'gameTo' | 'winBy' | 'bestOf'>` para que el ping pong lo use igual.
`needed(7)` da 4 sin cambios. Se actualiza el comentario de cabecera: «tenis, pádel, pickleball y ping pong».

### 3.2 Estado, jugadas y rotación (`src/sports/racket/tableTennis.ts`, nuevo, LF)

```ts
/** Un turno de saque: quién saca. El que recibe es el del turno siguiente (dobles). */
export interface ServeSlot { side: Side; player: Player }

export type TableTennisEvent =
  /** Terminó un peloteo y lo ganó `side` (siempre suma: el ping pong es por rally). */
  | { type: 'point'; side: Side }
  /**
   * Dobles, antes del primer punto del juego: quién de la pareja `side` saca primero (si saca) o, solo en el juego 1,
   * quién recibe primero (si recibe). Desde el juego 2, quien recibe lo fija el juego anterior.
   */
  | { type: 'order'; side: Side; player: Player }
  | { type: 'retire'; side: Side }
  | { type: 'walkover'; side: Side }
  /** Corrección del admin (ver §3.4). */
  | { type: 'correct'; games: Pair<number>[]; score: Pair<number>; server?: Side; serverPlayer?: Player; receiverPlayer?: Player; leftSide?: Side };

export interface TableTennisState {
  sport: 'table_tennis';
  rules: TableTennisRules;
  setup: Required<MatchSetup>;
  /** Juegos terminados: puntos de cada lado. */
  games: Pair<number>[];
  /** Puntos del juego en curso. */
  score: Pair<number>;
  /** Lado que sacó primero en el juego en curso. */
  gameFirstServer: Side;
  /** Dobles: los 4 turnos del juego en curso (A1, B1, A2, B2), ya con el cruce del decisivo. Individual: []. */
  rotation: ServeSlot[];
  /** Dobles: `rotation` al empezar el juego (antes del cruce). De aquí sale el juego siguiente. */
  gameRotation: ServeSlot[];
  /** Ya se cambió de lado (y, en dobles, de orden de recepción) a mitad del juego decisivo. */
  switched: boolean;
  /** Qué lado está a la izquierda ahora (de la pantalla del anotador). */
  leftSide: Side;
  winner: Side | null;
  finish: Finish | null;
  quitter: Side | null;
  n: number;

  // ---- Vista: se recalcula en cada jugada (refresh) ----
  server: Side;
  serverPlayer: Player;
  /** Dobles: quién recibe (en individual, 0). */
  receiverPlayer: Player;
  /** Saques que le quedan a quien saca en este turno: 2 o 1 (desde 10-10, siempre 1). */
  servesLeft: 1 | 2;
  /** Dobles: siempre desde la mitad derecha y en diagonal. Individual: null (desde cualquier lado). */
  serveFrom: 'right' | null;
  /** Canto del árbitro: primero los puntos de quien saca («5-3»). Vacío al terminar. */
  call: string;
  /** «Un saque cada uno» desde el 10-10; si no, null. */
  label: string | null;
  /** Aviso: cambiar de lado ahora (fin de juego o 5 puntos en el decisivo). */
  changeEnds: boolean;
  /** Dobles, juego decisivo: la pareja que recibe acaba de cambiar su orden de recepción. */
  receiveSwap: boolean;
}
```

**Ayudas puras.** Se exportan porque las usan las pruebas y la vista:

```ts
/** Turno de saque del próximo punto con `played` puntos ya jugados: cada 2 puntos; desde 10-10, cada punto. */
export const serveTurn = (played: number, gameTo = 11): number => {
  const deuce = 2 * (gameTo - 1); // 20
  return played < deuce ? Math.floor(played / 2) : gameTo - 1 + (played - deuce);
};
export const servesLeftAt = (played: number, gameTo = 11): 1 | 2 => (played >= 2 * (gameTo - 1) ? 1 : played % 2 === 0 ? 2 : 1);
/** Orden de un juego de dobles: [primer sacador, primer receptor, compañero del sacador, compañero del receptor]. */
export const rotationOf = (first: ServeSlot, receiver: ServeSlot): ServeSlot[] => [first, receiver, { ...first, player: flip(first.player) }, { ...receiver, player: flip(receiver.player) }];
/** Juego siguiente: saca `player` (de la pareja que recibió primero) y recibe quien le sacó a él en el juego anterior. */
export function nextRotation(prev: ServeSlot[], player: Player): ServeSlot[];
/** Cruce del decisivo: la pareja que recibe el próximo punto (turno `turn`) cambia su orden. */
export const swapReceivers = (rot: ServeSlot[], turn: number): ServeSlot[] => { /* se cruzan (turn + 1) % 4 y (turn + 3) % 4 */ };
```

`nextRotation(prev, z)` hace esto:

1. Busca el índice `i` de `{ side: lado de z, player: z }` en `prev`.
2. El receptor es `prev[(i + 3) % 4]`, el turno anterior, que es quien le sacaba a `z`.
3. Devuelve `rotationOf({ side, player: z }, receptor)`.

**Cómo avanza el partido** (siempre `structuredClone`, `n++`, y `changeEnds` y `receiveSwap` en false al empezar
cada jugada, igual que en pickleball):

- **`init`:**
  - valida con `validateRules`;
  - usa `resolveSetup(setup, rules.doubles)`;
  - `gameFirstServer = setup.firstServer`;
  - en dobles, `firstPlayer[firstServer - 1]` es quien saca primero y `firstPlayer[otro - 1]` es **quien recibe
    primero**; se documenta en `MatchSetup.firstPlayer`: «en ping pong, el de la pareja que recibe es quien recibe
    primero»;
  - arma la rotación con `rotation = gameRotation = rotationOf(…)`.
- **`point`:**
  - suma el punto al lado;
  - si `raceWinner(11, 2, score) === side`, termina el juego;
  - si no, y es el juego decisivo (`games.length === bestOf - 1`) con `switchAt` y `!switched` y
    `max(score) >= switchAt`, entonces `switched = true` y cambia de lado. En dobles, además:
    `rotation = swapReceivers(rotation, serveTurn(score[0] + score[1]))` y `receiveSwap = true`.
- **Fin de juego:**
  - se guarda el juego y el marcador vuelve a 0-0;
  - si alguien llegó a `needed(bestOf)` juegos, gana el partido con `finish: 'played'`;
  - si no, el juego siguiente lo saca `other(gameFirstServer)` (ITTF 2.13.5: quien sacó primero recibe primero);
  - en dobles, `rotation = gameRotation = nextRotation(gameRotation, gameRotation[1].player)`. Por defecto saca
    primero quien recibió primero en el juego anterior, y la pareja lo puede cambiar con `order`;
  - `switched = false` y cambia de lado.
- **`order`:** solo en dobles y con 0 puntos jugados en el juego. Si no, da el error «El orden se elige antes del
  primer saque del juego.».
  - Si `side` es la pareja que saca:
    - en el juego 1 se pone `player` como primer sacador (el receptor no cambia);
    - desde el juego 2, elegir al compañero corre la rotación 2 lugares (`[R', S', R, S]`), porque el receptor
      queda fijado por el juego anterior.
  - Si `side` recibe:
    - en el juego 1 se pone `player` como primer receptor;
    - desde el juego 2 da el error «En este juego recibe primero quien le sacó en el juego anterior.».
  - En los dos casos, `gameRotation = rotation`.
- **`retire` / `walkover`:** igual que en pickleball. El W.O. solo vale sin puntos jugados; si hubo, el error es
  «Ya se jugaron puntos: usa «Retiro».».
- **`refresh`:**

  ```
  played = score[0] + score[1]; turn = serveTurn(played)
  dobles:    server/serverPlayer = rotation[turn % 4]; receiverPlayer = rotation[(turn + 1) % 4].player
  individual: server = turn % 2 === 0 ? gameFirstServer : other(gameFirstServer); serverPlayer = receiverPlayer = 0
  servesLeft = servesLeftAt(played); serveFrom = doubles ? 'right' : null
  call = winner ? '' : `${score[server-1]}-${score[2-server]}`
  label = !winner && score[0] >= 10 && score[1] >= 10 ? 'Un saque cada uno' : null
  ```

- Cualquier otra jugada da el error «Jugada no válida para ping pong.».

**Ejemplos que las pruebas deben reproducir:**

- **Individual, saca A:**
  - puntos 1-2: A; 3-4: B; …; 19-20: B;
  - en 10-10 (20 jugados) saca A, después B, A, B…;
  - el juego 2 lo empieza B.
- **Dobles, setup `firstServer: 1, firstPlayer: [0, 1]`:**
  - rotación `[A0, B1, A1, B0]`, o sea A0→B1, B1→A1, A1→B0, B0→A0;
  - el juego 2 empieza con B1 (recibió primero) y recibe A0 (le sacaba a B1): `[B1, A0, B0, A1]`;
  - con `order {side: 2, player: 0}` antes del primer punto del juego 2 queda `[B0, A1, B1, A0]`.
- **Decisivo de dobles, rotación `[A0, B1, A1, B0]`:**
  - 5-2 después de 7 puntos: turno 3, así que saca B0 su 2.º saque;
  - la pareja A cambia su orden y queda `[A1, B1, A0, B0]`: B0 ahora le saca a A1, y la cadena sigue válida
    (A1→B1→A0→B0→A1);
  - en cambio, si se llega a 5-3 después de 8 puntos (turno 4), se cruza B: `[A0, B0, A1, B1]`.

**Resultado y resumen:**

- `tableTennisSummary` tiene la misma forma que `pickleballSummary`: «11-7 9-11 11-5 11-8», «11-7 3-5 ret.» o
  «W.O.»; en curso agrega el juego que va.
- Conviene extraer `gamesSummary(s: { games; score; finish })` a un lugar común y que lo usen los dos.
- `tableTennisResult` y `tableTennisEngine(rules): MatchEngine<MatchSetup, TableTennisState, TableTennisEvent>` son
  como en pickleball.

### 3.3 Punto de entrada de la familia (`src/sports/racket/index.ts`, LF)

- `export * from './tableTennis'`.
- `RacketState = TennisState | PickleballState | TableTennisState` y la misma unión para `RacketEvent`.
- `applyRacket`, `racketResult`, `initRacket` y `createRacketEngine` despachan con un `switch (state.sport)` en vez
  del ternario. `createRacketEngine` suma la sobrecarga `'table_tennis'`.
- `completeMatch`: sin cambios. Repite `{ type: 'point', side: w }`, así que un W.O. al mejor de 5 da
  `11-0 11-0 11-0` y un retiro termina el juego en curso y los que falten.
- `matchTotals`: la rama de pickleball pasa a `if (s.sport === 'pickleball' || s.sport === 'table_tennis')`. Da
  sets = juegos = juegos ganados y puntos = suma de los puntos.
- `RacketLive`:
  - gana `receiverPlayer?: Player` y `servesLeft?: 1 | 2`, los dos opcionales;
  - `toLive` del ping pong da `done` y `now` como pickleball, más `call`, `label`, `serveFrom`, `receiverPlayer` y
    `servesLeft`.
- `stateFromScore`: la rama de pickleball vale para los dos deportes de juegos. El token «(n)» da «En ping pong no
  hay tie-break.» y se aplica `correct { games, score: [0, 0] }`.
- Se actualizan los comentarios de cabecera y de `RacketTotals`.

### 3.4 Corrección del admin (`correct`)

1. Revisa los juegos con `normalizeGames` y los puntos con `raceOpen(11, 2, score)`. Si el partido terminó, los
   puntos van 0-0; si no, da «Primero deshaz el retiro o el W.O.», igual que en pickleball.
2. `gameFirstServer` sale de la paridad: `games.length` par da `setup.firstServer`; impar, el otro.
3. En dobles, la rotación:
   - si sigue el mismo juego (`games.length` igual), se conserva `gameRotation`;
   - si no, se vuelve a armar la cadena por defecto desde el setup: juego 1 con `rotationOf`, y después
     `nextRotation(prev, prev[1].player)`. Las jugadas `order` del registro se pierden; el admin las corrige con
     los campos opcionales.
4. El decisivo, en dobles, cuando `max(score) >= 5`: `switched = true`. Se supone que el cruce ocurrió cuando el
   que va arriba llegó a 5, con el otro en `min(su puntaje, 4)`; es decir, en el turno
   `serveTurn(5 + min(minScore, 4))`.
5. Si llegan `server`, `serverPlayer` o `receiverPlayer`, la rotación se rearma alrededor del turno actual `k`:
   `rot[k%4] = sacador`, `rot[(k+1)%4] = receptor`, y los dos compañeros en `k+2` y `k+3`. En individual, `server`
   fija `gameFirstServer = k % 2 === 0 ? server : other(server)`.
6. El lado izquierdo depende de la paridad de `games.length + (switched ? 1 : 0)`, como en pickleball, salvo que
   llegue `leftSide`.

### 3.5 Lo que no entra

Queda fuera de esta entrega:

- el sistema de aceleración (10 minutos por juego);
- los tiempos muertos de 1 minuto;
- las tarjetas amarilla y roja;
- los partidos por equipos (formato Swaythling o Corbillon);
- el juego a 21 con 5 saques.

---

## 4. Formatos: cuáles y por qué

| Formato | ¿Va? | Por qué |
|---|---|---|
| **Liga** (todos contra todos por jornadas) | Sí | Es la liga de club de siempre. `ScheduleBuilder` y `pairStandings` no dependen del deporte. |
| **Torneo** (grupos + cuadro con 3.er lugar, por categorías) | Sí | Es el formato estándar de los torneos ITTF y de los abiertos locales: grupos de 3 o 4 que clasifican al cuadro. `create_tournament` y las ligas `kind='torneo'` también lo usan. |
| **Liga por cajas** (mensual) | Sí | Hay clubes que hacen divisiones mensuales con ascenso y descenso. `withFormats` y `save_box_month` sirven tal cual una vez que `raq_sport` incluye el ping pong. |
| **Escalera** (retos) | Sí | La escalera de retos es un clásico de los salones de ping pong. El cron y los retos (`create_challenge` con formato `'sets'`) no dependen del deporte. |
| **Americano / mexicano / round robin social** | No | Las parejas que rotan con partidos a puntos no son de ping pong. Se esconden con `hideTemplates: ['americano', 'mexicano']`, como en tenis. `hasNights`, `night_league`, `NIGHT_SPORTS`, `event_reminders`, `badges_daily` y `racket_night` quedan igual. Una idea para después: «rey de la mesa». |
| **Juego suelto** (fuera de una liga) | No | Es solo del boliche (`SportHero.tsx:47`). |

Los dobles se eligen en las reglas de la liga o del partido (plantilla «Dobles»). Las parejas se arman en «Admin ›
Jugadores y niveles», con los equipos de temporada, como en tenis. El dobles mixto se hace con una categoría del
torneo.

---

## 5. Tabla, estadísticas y textos

### 5.1 Tabla de la ITTF (`src/sports/formats/standings.ts`, LF)

```ts
/** Ping pong (ITTF 3.7.5.1): ganar 2, perder jugando 1, W.O. 0. */
export const TABLE_TENNIS_POINTS: PointsRule = { win: 2, draw: 0, loss: 1, walkoverLoss: 0 };

/**
 * Grupos de la ITTF (Reglamento 3.7.5), con diferencias en lugar de cocientes: puntos → entre los empatados
 * (puntos, dif. de juegos, dif. de puntos) → dif. de juegos → dif. de puntos → sorteo. Los que sigan empatados
 * vuelven a empezar solo entre ellos (3.7.5.3). Totales esperados en MatchResult: `games` y `points`.
 */
export function tableTennisTable(points: PointsRule = TABLE_TENNIS_POINTS, lotSeed = ''): TableConfig {
  return {
    points,
    primary: 'points',
    criteria: [
      tiebreak.points(),
      tiebreak.h2h(),
      tiebreak.h2h((r) => r.extra.gamesDiff ?? 0, 'dif. de juegos entre empatados'),
      tiebreak.h2h((r) => r.extra.pointsDiff ?? 0, 'dif. de puntos entre empatados'),
      tiebreak.stat('gamesDiff', 'dif. de juegos'),
      tiebreak.stat('pointsDiff', 'dif. de puntos'),
      tiebreak.lot(lotSeed),
    ],
  };
}
export function tableTennisStandings(ids, results, opts = {}): StandingRow[]; // como pickleballStandings
```

`primary: 'points'` hace que `for`, `against` y `diff` sean puntos, así que las columnas PF, PC y Dif. funcionan
igual que en pickleball. Los totales se arman con `pickleballMatchResult`, que no depende del deporte más allá de su
nombre; si se quiere, se renombra a `gamesMatchResult` y se deja un alias.

### 5.2 Resultados de las páginas (`src/pages/sports/racket/logic/results.ts`, **CRLF**)

- **`racketResultOf`:**
  - las ramas de las líneas 67, 79, 86 y 93 pasan a `isGameSport(sport)`;
  - W.O.: se agrega `walkoverGames: Array.from({ length: needed(r.bestOf) }, () => [11, 0])` cuando las reglas son
    de ping pong. El pickleball sigue igual: `[[11, 0]]`, a un juego;
  - las líneas 68-69 (`r.sport !== 'pickleball'`) pasan a `!isGameSportRules(r)`. TypeScript lo obliga.
- **`pointsRule`:** el ping pong siempre da `TABLE_TENNIS_POINTS` y no hace caso de `scheme`, igual que pickleball.
- **`pairStandings`:** el ping pong usa `tableTennisStandings`.
- **`forLabel`, `setsLabel` y las líneas 246, 322, 348 y 356-357:** pasan a `isGameSport`.
  - Con eso, el ranking de la temporada da «Juegos» y «Puntos», dif. de juegos y dif. de puntos.
  - Sus puntos son 2, 1 y 0 porque salen de `pointsRule`.

### 5.3 Columnas, perfil y textos

- **`bits.tsx:199` (`racketColumns`), `seasonTable.ts:90` (`racketFields`) y `Profile.tsx:207` (`SetsStats`):**
  `pk = isGameSport(sport)`.
  - Columnas: PJ · G · P · Jue. (dif. de juegos) · PF · PC · Dif. (dif. de puntos).
  - Perfil: «Juegos 12-7», con «Puntos 190-151 (+39)» debajo.
- **`logic/tiebreaks.ts`:**
  - `tiebreakText('table_tennis')`: «Orden (grupos de la ITTF): puntos (ganar 2, perder 1; W.O. o retiro 0) → entre los
    empatados: puntos, dif. de juegos y dif. de puntos → dif. de juegos → dif. de puntos → sorteo.»
  - `pointsText`: «ganar 2, perder 1 (W.O. o retiro 0)».
  - `rankingNote`: «Cada jugador suma lo de su lado en los partidos de liga, torneo, cajas y escalera: ganar 2,
    perder 1, W.O. o retiro 0; luego dif. de juegos y de puntos.»
- **`logic/rulesText.ts`:** una rama nueva. TypeScript la obliga, porque la rama de tenis lee `r.deuce`. Da:
  «Individual · al mejor de 5 juegos a 11 · ganando por 2 · saque cada 2 puntos».
- **`components/match/parsers.ts:60`:** `unit = isGameSportRules(rules) ? 'juegos' : 'sets'`. El resumen queda «Gana
  el lado 1, 3 juegos a 1».
- **`racket-formats/BoxPage.tsx:505` y `league/ScheduleBuilder.tsx:141-145`:** el selector «Puntos de la tabla» se
  esconde si `isGameSport(sport)`, porque el deporte trae sus propios puntos.
  - En `ScheduleBuilder` esto también esconde el selector del pickleball, que hoy se muestra y no se usa: es una
    corrección de paso.

---

## 6. Pantallas

### 6.1 `src/pages/sports/table_tennis/screens.tsx` (nuevo, LF)

La carpeta se tiene que llamar exactamente `table_tennis`, porque `import.meta.glob('../pages/sports/*/screens.tsx')`
busca por el id.

```tsx
/**
 * Ping pong (tenis de mesa): individual y dobles, juegos a 11 ganando por 2, al mejor de 3, 5 o 7, saque cada 2
 * puntos (uno cada uno desde 10-10), cambio de lado en cada juego y a los 5 del decisivo, y la rotación de saque de
 * dobles. Plantillas de «Nuevo»: liga, torneo grupos + eliminatoria, liga por cajas y escalera. Tabla de grupos de
 * la ITTF (ganar 2, perder 1). Nivel de club de 1 a 10.
 */
export const TABLE_TENNIS_EXT: RacketExtensions = withFormats('table_tennis', {
  hideTemplates: ['americano', 'mexicano'],
  templateTitles: (doubles) => ({
    liga: { title: doubles ? 'Liga de dobles' : 'Liga', text: 'Todos contra todos por jornadas, con mesas, horas y la tabla de la ITTF (ganar 2, perder 1).' },
    torneo: { title: 'Torneo grupos + eliminatoria', text: 'Categorías por nivel: grupos de 3 o 4 que pasan al cuadro, con 3.er lugar, como en la ITTF.' },
  }),
  court: (m) => (isPointsMatch(m) ? null : TableTennisCourt),
  resultEntry: tableTennisEntry,
  words: { court: ['mesa', 'mesas'] },
});

export default racketScreens('table_tennis', TABLE_TENNIS_EXT);
```

`tableTennisEntry(m)` usa el punto de extensión que ya existe (`MatchDetail.tsx:95`), así que `MatchDetail` no
cambia. El marcador de muestra y los ejemplos (chips que llenan el campo) dependen del largo del partido
(`ttRules(m).bestOf`), porque el lector rechaza un 3-1 al mejor de 3 o al de 7:

| Largo | `placeholder` | `examples` |
|---|---|---|
| 3 | `11-7 9-11 11-5` | `11-7 11-9`, `11-9 8-11 11-6`, `9-11 12-10 11-7` |
| 5 | `11-7 9-11 11-5 11-8` | `11-7 11-9 11-5`, `11-9 8-11 11-6 11-4`, `11-8 9-11 12-10 6-11 11-7` |
| 7 | `11-7 9-11 11-5 11-8 11-6` | `11-7 11-9 11-5 11-8`, `11-9 8-11 11-6 9-11 11-4 11-7`, `11-8 9-11 12-10 6-11 11-7 8-11 11-9` |

```ts
{
  parser: racketResultParser(ttRules(m)),
  placeholder, // y examples, de la tabla
  hint: `Juego por juego, separados por espacio: al mejor de ${bestOf}, gana quien llega a ${needed(bestOf)} juegos. En 10-10 se sigue hasta sacar 2 de ventaja (12-10).`,
  points: false,
}
```

### 6.2 Pantallas compartidas de raqueta

- **`racket/index.tsx:30`:** `const doubles = defaultRules(sport).doubles || sport === 'padel'`. El ping pong
  muestra «Jugadores y niveles».
- **`racket/sport.tsx`:** `words` pasa a `{ nights?; nightsLong?; court?: readonly [string, string] }`. Se agrega
  `courtWords(ext)`, que da `{ one, many, One, Many }` y por defecto «cancha» y «canchas».
  - Se usa en `league/ScheduleBuilder.tsx`: «2. Fechas, mesas y horas», «Mesas», «Mesa 1», «Mesa 2», el botón
    «Mesa», los `aria-label` y el aviso «Agrega una mesa o una hora».
  - Se usa en `match/MatchAdmin.tsx`: «Poner fecha y mesa», el modal «Fecha, hora y mesa», el campo «Mesa» con el
    ejemplo «Mesa 2».
  - Se usa en `match/MatchDetail.tsx:145`: «Anotar en la mesa», «Seguir anotando en la mesa», «Retomar en la mesa».
  - Se usa en `league/LeaguePage.tsx:136`: «…tus partidos con mesa y hora».
  - Se usa en `racket-formats/LadderPage.tsx` (`AcceptModal`): al aceptar un reto, el campo «Mesa» con «Mesa 2».
  - Se usa en `match/history.ts` (`historyLines(…, court)`, desde `MatchDetail`): «Cambió la hora o la mesa».
  - `lib/notifications.ts` no tiene `ext`: con el deporte de la liga (`placeWord`) el aviso dice «Cambiaron la mesa
    de tu partido».
  - Las noches no cambian.
- **`court/SetsCourt.tsx`:** solo para que compile y como respaldo: `pickle` pasa a `isGameSport(sport)`, y
  `tb`/`canOrder` (líneas 55-56 y 74) preguntan `s.sport === 'tennis' || s.sport === 'padel'`.
- **`levels.ts`:**
  - `LevelScale.key` pasa a `'level' | 'ntrp' | 'dupr' | 'tt'`;
  - `LEVEL_SCALES.table_tennis = { key: 'tt', label: 'Nivel', min: 1, max: 10, decimals: 1, placeholder: '1–10', hint: 'Nivel del club de 1 a 10 (1 empieza, 5 juega liga, 8 o más compite). Sirve para las cajas del primer mes y para sembrar los torneos.' }`;
  - TypeScript lo obliga.
- **`components/players/logic.ts:19`:** `RACKET` se cambia por `SPORT_FAMILY[s] === 'racket'`, en `statKind` y en
  `racketScale`.

### 6.3 Modo cancha: `src/pages/sports/table_tennis/court/`

**`logic.ts`** es puro y LF, con el mismo patrón que `pickleball/court/logic.ts`:

- **`tableTennisAdapter(rules)`:**
  - `engine = tableTennisEngine(rules)`, `score = racketScore`;
  - `milestone` publica al terminar cada juego, cada 4 puntos anotados, al llegar a 10-10 y al terminar; nunca por
    cada punto. Si no, publica como mucho cada minuto, que es lo que ya hace la máquina.
- **`ttView(s, people, labels): TtView`** da:
  - `serving`, `serverName` y `receiverName`. En dobles son los nombres; en individual, `receiverName` es null;
  - `servesLeft`;
  - `deuce` (10-10 o más);
  - `gamePoint: Side | null` y `matchPoint: Side | null`: un lado tiene punto de juego con ≥ 10 puntos y 1 o más
    de ventaja, y punto de partido si además le falta un juego;
  - `done`, `now`, `gamesWon`, `gameNo`, `deciding`, `switchNow` y `receiveSwap`;
  - `nextReceiver`, el nombre de quien recibe después del cruce;
  - `over` y `winner`.

**`TableTennisCourt.tsx`** es a 375 px y se basa en `PickleballCourt` y `useAdapterCourt`.

- **Antes de empezar** (`TTSetup`):
  - «Reglas de este partido» con `rulesText`. El admin lo puede cambiar con `presetsOf('table_tennis')`, como en
    `PickleSetup`;
  - «¿Quién saca primero?»;
  - en dobles: «{pareja que saca}: ¿quién saca primero?» y «{pareja que recibe}: ¿quién recibe primero?»;
  - «¿Quién empieza a tu izquierda?».
- **Encabezado:**
  - juegos terminados como distintivos («11-7», «9-11») y «Juegos 1-1», con el lado de la izquierda primero, como
    las mitades (`TtView.doneLeft` y `gamesLeft`): se cambia de lado en cada juego y, con el lado 1 siempre primero,
    se leería al revés un juego sí y otro no;
  - «Juego 3 de 5 · decisivo»;
  - un distintivo «Punto de juego» o «Punto de partido» (accent), y «Un saque cada uno» desde 10-10.
- **Franja de saque**, con `role="status"`:
  - individual: «Saca **Ana** · 2 saques» o «· 2.º saque»;
  - dobles: «Saca **Ana** → recibe **Luis** · desde la derecha, en diagonal».
- **Avisos** con `role="alert"` y fondo de aviso:
  - «Cambio de lado» al terminar cada juego y a los 5 del decisivo;
  - en dobles, en el decisivo: «La pareja que recibe cambia su orden: ahora recibe **{nombre}**».
- **Dos mitades** (`TwoHalves`):
  - el número grande son los puntos del juego;
  - debajo, «Juegos 2 · saca» en el lado que saca;
  - tocar un lado es `{ type: 'point', side }`;
  - `swap` con `leftSide`.
- **Barra de abajo:** «Deshacer punto», «Retiro» y, en dobles antes del primer punto del juego, el botón «Orden».
  El botón «Orden» manda `order` para el que saca y, solo en el juego 1, también para el que recibe.
- Al terminar: «Gana {jugador}: 11-7 9-11 11-5 11-8. Toca «Terminar» para enviar» («Ganan {pareja}» en dobles), con
  el marcador del lado del ganador (`winnerText`, como en «Solo el resultado»). Se manda con `finish_match` y el
  rival confirma como siempre (`ConfirmResultBanner`).

### 6.4 Agenda y textos generales

- **`components/agenda/logic.ts:15` (`agendaCardNote`):** si el deporte no tiene noches, que dice
  `sportMeta(sport)?.eventTypes.some((t) => t.id === 'americano')`, el texto es «Torneos de ping pong con lugar»
  en lugar de «Noches y torneos…».
  - Esto también corrige el tenis («Torneos de tenis con lugar»). Si se prefiere no tocar el tenis, se limita al
    ping pong.
- **`components/badges/maker/templates.ts:61-97`:** `bestName` y `bestText` agregan `case 'table_tennis'` junto a
  las otras raquetas: «Mejor récord». `byTeamAllowed` va por familia y ya lo acepta.

---

## 7. SQL: `supabase/migrations/20260930000200_ping_pong.sql`

La cabecera explica qué se redefine y desde qué archivo. Cada `create or replace` copia **el cuerpo completo de la
última definición**, cambia solo lo indicado y conserva los permisos. Las funciones nuevas se cierran al final.

### 7.1 El deporte

```sql
insert into public.sport_status (id, family, status, sort_order) values
  ('table_tennis', 'racket', 'open', 10);
```

Va con esta forma exacta, una tupla por fila, porque la prueba del registro la lee con una expresión regular.
`status` va en `'open'` porque la actualización de beta a open (`20260929001000`) ya corrió.
Con esta fila ya funcionan, sin más cambios:

- `leagues.sport` (FK);
- `check_sport` y `create_league`;
- `league_family` y todo `partidos.sql`: `check_score`, `check_winner`, `finish_match` y confirmar;
- `match_reminders`, que filtra por familia;
- `public_profile`, `profile_stats`, `public_leagues_feed` y `public_agenda`;
- `admin_overview` y `admin_system`.

### 7.2 `private.raq_sport` (desde `20260927000700_raqueta.sql:37`)

```sql
create or replace function private.raq_sport(p_league uuid) returns text
language sql stable security definer set search_path = '' as $$
  select l.sport from public.leagues l where l.id = p_league and l.sport in ('padel', 'tennis', 'pickleball', 'table_tennis')
$$;
```

Esta función abre para el ping pong:

- `save_box_month`;
- la escalera (`ladder_guard`, `ladder_event`);
- `signup_kind`: las inscripciones al torneo (`'tourney'`) y, con eso, la agenda pública.

`night_league` **no** cambia.

### 7.3 Marcador hasta el mejor de 7: `private.tt_score_ok` (nueva)

`raq_score_ok` topa `sides` y `totals.sets` en 3 (`raqueta.sql:72-96`), y un 4-3 del mejor de 7 no pasaría. Su
firma no tiene el deporte y no se puede cambiar. Por eso va una función aparte, `immutable`, con los mismos
chequeos:

- `sides`: 0 a 4;
- `totals.sets`: 0 a 4;
- `totals.games`: 0 a 4, porque en ping pong son juegos ganados;
- `totals.points`: 0 a 9999.

```sql
-- Marcador de un partido de ping pong: `sides` = juegos ganados (0–4, hasta el mejor de 7); `totals` (si viene) con
-- sets y juegos 0–4 (los dos son juegos ganados) y puntos 0–9999 por lado.
create function private.tt_score_ok(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  k text;
  v_lim integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return true;
  end if;
  if jsonb_typeof(p -> 'sides') = 'array' and exists (
       select 1 from jsonb_array_elements(p -> 'sides') x where not private.raq_num_between(x, 0, 4)) then
    return false;
  end if;
  if jsonb_typeof(p -> 'totals') = 'object' then
    for k, v_lim in select * from (values ('sets', 4), ('games', 4), ('points', 9999)) as t (k, lim) loop
      if (p -> 'totals') ? k and not (
           jsonb_typeof(p -> 'totals' -> k) = 'array' and jsonb_array_length(p -> 'totals' -> k) = 2
           and not exists (select 1 from jsonb_array_elements(p -> 'totals' -> k) x where not private.raq_num_between(x, 0, v_lim))) then
        return false;
      end if;
    end loop;
  end if;
  return true;
end $$;
```

`private.check_score` (texto de 80 caracteres o menos) ya deja pasar el peor mejor de 7:
«13-11 11-13 12-10 10-12 14-12 11-9 15-13» tiene 41 caracteres.

**Con ganador, `private.tt_result_ok(p jsonb, p_winner smallint)` (nueva, `immutable`).** `tt_score_ok` solo mira la
forma. Cuando el partido queda con ganador (`finished`, `confirmed`, `disputed` o `walkover`), `raq_check_match` pide
además un final posible del mejor de 3, 5 o 7:

- el ganador tiene 2, 3 o 4 juegos (`sides`) y más que el otro (ni 4-4, ni 1-0, ni un 0-3 con el lado 1 ganador);
- `totals.sets` y `totals.games`, si vienen, son iguales a `sides`.

Un retiro y un W.O. llegan completados a favor del ganador (3-0 al mejor de 5), así que también cumplen. Sin `sides`
(el W.O. de la escalera solo trae el texto) o sin ganador (en juego, o faltaron los dos) no hay nada que comparar. El
largo exacto del partido (`bestOf`) no se revisa en el servidor: las reglas pueden venir del partido o de la liga y
el admin las cambia antes del primer punto; el teléfono ya valida el marcador con el motor.

### 7.4 Triggers de raqueta (desde `raqueta.sql:104-156` y `:163-181`)

**`private.raq_check_event()`:** copiar entero y cambiar esto.

```sql
  if v_sport is null or (v_sport not in ('tennis', 'pickleball', 'table_tennis') and not (v_sport = 'padel' and new.type in ('cajas', 'escalera'))) then
    return new;
  end if;
  -- … (tenis y pickleball igual)
  if v_sport = 'table_tennis' and new.type not in ('liga', 'torneo', 'cajas', 'escalera') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Tipo de evento de ping pong: liga, torneo, cajas o escalera.';
  end if;
```

El resto no cambia: el tamaño de `config`, `players`, `months` y `player_count`.

**`private.raq_check_match()`:** copiar entero y cambiar esto.

```sql
  if v_sport is null or v_sport not in ('tennis', 'pickleball', 'table_tennis') then
    return new;
  end if;
  -- … (tenis y pickleball igual)
  if v_sport = 'table_tennis' and new.format not in ('', 'sets') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Formato de partido de ping pong: juegos.';
  end if;
  if (v_sport = 'table_tennis' and not private.tt_score_ok(new.score))
     or (v_sport <> 'table_tennis' and not private.raq_score_ok(new.format, new.score)) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Marcador no válido.';
  end if;
  if v_sport = 'table_tennis' and new.winner_side is not null and new.status in ('finished', 'confirmed', 'disputed', 'walkover') then
    if not private.tt_result_ok(new.score, new.winner_side) then
      raise exception 'invalido' using errcode = 'P0001', detail = 'Ese marcador no termina el partido o no cuadra con el ganador.';
    end if;
  end if;
```

El trigger salta con `update of score`: `finish_match`, `admin_correct_result`, `resolve_dispute` (con marcador) y
`set_walkover` escriben el marcador junto con el ganador.

El formato `'sets'` es obligatorio, porque el servidor lo pone en `save_box_month` (raq:343) y en
`create_challenge` (raq:891-892).

**`private.raq_check_player()`:** copiar entero y cambiar esto.

```sql
  if jsonb_typeof(v_attrs) <> 'object' or not (v_attrs ? 'ntrp' or v_attrs ? 'dupr' or v_attrs ? 'tt') then
    return new;
  end if;
  -- … (tenis y pickleball igual)
  if v_sport = 'table_tennis' and v_attrs ? 'tt' and jsonb_typeof(v_attrs -> 'tt') <> 'null'
     and not private.raq_num_between(v_attrs -> 'tt', 1, 10) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'El nivel va de 1 a 10.';
  end if;
```

Los tres triggers siguen colgados de las funciones redefinidas, así que no se recrean. Por el orden alfabético,
`events_fill_signups` sigue corriendo antes que `events_raq_check`.

### 7.5 Premios del torneo: `private.prize_comp` (desde `20260929001200_premios_torneo.sql:271-297`)

Copiar entera. Solo cambia la línea 277:

```sql
               when l.sport in ('padel', 'tennis', 'pickleball', 'table_tennis') then
```

La línea 279 (`racket_night`) se queda con `('padel', 'pickleball')`.
`prize_racket_doubles` y `signup_doubles` **no** cambian: sin `rules.match.doubles`, el ping pong es individual,
porque solo el pickleball cae en dobles por defecto. Eso coincide con `racketPrizeDoubles` en el teléfono.

### 7.6 Insignias

**Los tres check de deporte** (`20260929001100_insignias.sql:37`, `:84` y `:103`) son checks de columna sin nombre.
Postgres los nombra `<tabla>_sport_check`:

```sql
alter table public.badge_awards drop constraint badge_awards_sport_check,
  add constraint badge_awards_sport_check check (sport in ('all', 'bowling', 'padel', 'tennis', 'pickleball',
    'table_tennis', 'basketball', 'football', 'futsal', 'golf', 'swimming'));
alter table public.badge_progress drop constraint badge_progress_sport_check,
  add constraint badge_progress_sport_check check (sport in ('all', 'bowling', 'padel', 'tennis', 'pickleball',
    'table_tennis', 'basketball', 'football', 'futsal', 'golf', 'swimming'));
alter table public.badge_stats drop constraint badge_stats_sport_check,
  add constraint badge_stats_sport_check check (sport in ('all', 'bowling', 'padel', 'tennis', 'pickleball',
    'table_tennis', 'basketball', 'football', 'futsal', 'golf', 'swimming'));
```

`drop constraint` va **sin** `if exists`: si el nombre no fuera ese, la migración tiene que fallar en PGlite y no
dejar el check viejo. La prueba SQL confirma los nombres en `pg_constraint`.

Las otras funciones de insignias:

- **`private.badge_activity(uuid[], date, date)`** (desde `20260929001110_insignias_motor.sql:689-828`): copiar
  entera, con la misma firma y el mismo `returns table`. Solo cambia la línea 755:
  `m.l_sport in ('padel', 'tennis', 'pickleball', 'table_tennis')`.
- **`private.badge_apply_decisions(private.badge_queue, jsonb, timestamptz)`** (desde `motor:1604-1915`): copiar
  entera y agregar `'table_tennis'` a la lista de la línea 1674.
- **`private.badge_icon_ok(text)`** (desde `20260929001120_insignias_creador.sql:311-320`): agregar `'ping-pong'`
  y cambiar el comentario a «Los 53 íconos curados».
- `badges_daily` (motor:2231) **no** cambia, porque es solo de noches.

### 7.7 Permisos y cierre

```sql
revoke execute on function private.tt_score_ok(jsonb) from public, anon, authenticated;
revoke execute on function private.tt_result_ok(jsonb, smallint) from public, anon, authenticated;
```

Lo pide `tests/sql/seguridad.test.ts:164-174`. Las funciones redefinidas conservan sus permisos, y no hay RPC
pública nueva.

### 7.8 Qué **no** cambia en SQL (revisado)

- `night_league` y `event_reminders` (`avisos.sql:147`);
- `padel_check_*`;
- `check_event` del boliche;
- `create_tournament` y `create_event`;
- `social_items`;
- `push_*`;
- la escalera y su cron;
- `badge_snapshot` y `badge_family_rows`, que van por familia;
- playoffs, que son solo de equipos.

---

## 8. Insignias (catálogo, evaluadores y motor)

### 8.1 Catálogo (`src/badges/catalog.ts`, LF)

**Listas.** Agregar `'table_tennis'` en todas las listas donde está el tenis:

- `RACKET` (línea 36). Así entra en 13 keys:
  - `racket_matches`, `racket_wins`, `racket_win_streak`, `racket_bagel`, `racket_comeback`, `racket_tiebreaks`,
    `racket_upset`, `racket_partners`, `racket_ladder_climber`;
  - `box_top_month`, `box_promoted`, `ladder_top`, `honor_word`.
- `FIGURE` (40), `PROGRESS` (42) y las listas escritas a mano de `event_podium` (246), `streak_month` (1412) y
  `perfect_attendance_month` (1440).
- `racket_night_champion` (651) **no**.

**Textos y parámetros por deporte.** Donde hay un valor por deporte sin `default`, hay que ponerlo o la insignia
queda sin texto o sin umbral:

| Key | Ping pong |
|---|---|
| `debut` (nombre) | «Debut en la mesa» |
| `racket_bagel` | nombre **«Zapatero»**; descripción «Ganaste un juego 11-0.»; cómo «Gana un juego 11-0 en un partido confirmado.»; rareza `table_tennis: 'R'` en `levels: one({…})` |
| `racket_comeback` | descripción «Ibas 0-2 en juegos y le diste la vuelta.»; cómo «Gana un partido al mejor de 5 o 7 después de perder los dos primeros juegos, sin retiro.»; parámetro nuevo `params: { down: { default: 1, table_tennis: 2 } }` |
| `racket_tiebreaks` | nombre «Al filo»; descripción «Ganaste {n} juegos después del 10-10.»; cómo «Gana {n} juegos que se vayan más allá del 10-10 (12-10, 13-11…).»; unidad `units('juego', 'juegos')` |
| `racket_wins` (cómo, opcional) | «Gana {n} partidos que confirme el rival (máximo 3 por mes contra el mismo).» |
| `player_of_month` | `minMatches.table_tennis: 4` |
| `most_improved_month` | `minGain.table_tennis: 8` |
| `streak_month` | descripción «¡Qué racha! {n} victorias seguidas, la mejor de {liga} en {mes}.»; `minRun.table_tennis: 4` |
| `figure_of_year` | `minMatches.table_tennis: 12` |
| `progress_of_year` | `minGain.table_tennis: 10`, `minMatchesPerHalf.table_tennis: 8` |
| `season_most_improved` | `minGain.table_tennis: 10`, `minPerHalf.table_tennis: 5` |
| `season_attendance` | `minDates.table_tennis: 6` |

«Zapatero» es como se dice en la República Dominicana cuando alguien pierde sin anotar (en el dominó y en la mesa).

La sección «2.3 Raqueta» cambia su título a «pádel, tenis, pickleball y ping pong».

**Totales** (`src/badges/catalog.test.ts`):

- 100 keys y 197 definiciones: sin cambio;
- grupos: sin cambio;
- instanciadas por deporte: se agrega `table_tennis: 48` (las mismas listas que el tenis) y el total pasa de
  457 a **505**;
- el comentario «Cada uno de los 9 deportes» pasa a 10.

### 8.2 Evaluadores y reglas

- **`evaluators/kit.ts:46`:** `RACKET_SPORTS` se importa de `sports/racket/rules`, o se le agrega
  `'table_tennis'`. **Sin esto no corre ninguna insignia de carrera del ping pong**, porque `racketTargets` recorre
  esa lista.
- **`evaluators/season.ts:194`:** el parámetro pasa a `sport: RacketSport`. TypeScript lo obliga.
- **`evaluators/racket.ts`:**
  - línea 169-171 (Al filo): con `isGameSportRules(read.rules)` cuenta los juegos ganados por encima de `gameTo`
    (12-10 o más);
  - línea 259 (Rosco/Zapatero): `isGameSportRules(r) ? mine >= r.gameTo : mine === r.gamesPerSet`;
  - línea 263 (Remontada): con `down = paramOf(def('racket_comeback'), 'down', sport) ?? 1`, pide
    `r.bestOf >= 2 * down + 1` y que los primeros `down` juegos o sets los haya perdido su lado. Tenis, pádel y
    pickleball siguen con `down = 1`.
- **`rules/racket.ts`:** `readSets` (197 y 217) y `racketGames` (251) pasan a `isGameSport…`.
- **`evaluators/boxes.ts:107`:** para los deportes de juegos se usa `Number(r.extra?.gamesDiff ?? 0)`.
  - **Hallazgo:** hoy lee `extra.setsDiff`, que **no existe** en las filas de pickleball, porque
    `pickleballMatchResult` da `games` y `points`. En pickleball la dif. de juegos siempre vale 0 en «Cima de tu
    caja».
  - El cambio arregla los dos deportes; va con una prueba.
- **`rules/activity.ts:14`:** `DAY_WEIGHT.table_tennis = 1`. TypeScript lo obliga.

### 8.3 Íconos (`src/badges/visual/icons.ts`, LF)

- **`ICON_DATA['ping-pong']`:** `tab: 'deporte'`, `label: 'Ping pong'`, `tags: ['pingpong', 'mesa', 'paleta',
  'pelota']`, y el `node` del ícono del registro, sin las `key`.
  - La key lleva guion porque el check es `^[a-z0-9-]{1,32}$`.
  - Las etiquetas son una sola palabra porque el check es `^[a-z0-9]+$`.
- **`SPORT_EMBLEM.table_tennis = 'ping-pong'`.** TypeScript lo obliga.
- En las pruebas, `icons.test.ts` pasa a:
  - 53 íconos;
  - `deporte` a 14;
  - `new Set(Object.values(SPORT_EMBLEM)).size` a 9.

### 8.4 Motor en el servidor

Después de los cambios de §8.1–8.3 se corre `pnpm badges:bundle`. Regenera
`supabase/functions/_shared/badges-engine.gen.js`, y `src/badges/bundle.test.ts` avisa si quedó viejo.

---

## 9. Premios, informe del torneo, agenda, feed y perfil

- **Premios del torneo:**
  - `src/prizes/sports.ts` (`racketTourneyComp`, `racketPrizeDoubles`) y `src/prizes/catalog.ts` van por tipo de
    premio, no por deporte, así que no cambian;
  - en SQL basta con `prize_comp` (§7.5);
  - `NIGHT_SPORTS` (`prizes/sports.ts:63`) queda igual.
- **Informe del torneo** (`src/lib/report/racket.ts`, `excel.ts`): usa `setsLabel`, `forLabel`, `pointsText`,
  `seasonPlayerTable` y `extra.setsFor ?? extra.gamesFor`. Con §5.2 sale «Juegos / Puntos» y la nota de puntos de
  la ITTF, sin tocar el archivo. Solo cambia el comentario de cabecera.
- **Agenda y feed público:** `hasAgenda` va por familia. `public_agenda` muestra los torneos con inscripción
  gracias a `raq_sport`. Solo cambia el texto de §6.4.
- **Perfil público y estadísticas:** `profile_stats` agrupa por deporte con `sort_order`. En la liga, el perfil sale
  de `SetsStats` (§5.3).
- **Avisos push:** no cambian; los recordatorios del partido van por familia.

---

## 10. La animación de apertura

**Escena `table_tennis`** en `src/components/splash/scenes.ts` (LF).

- Se agrega a `SceneId`, `SCENE_ORDER` (después de `'swimming'`), `SCENE_FOR_SPORT`, `LIVE_SCENES` y `SCENES`.
- El `label` es «Ping pong».

**Idea: el saque reglamentario.**

- La paleta, a la izquierda, golpea.
- La pelota bota primero en su lado de la mesa, pasa baja sobre la red y bota del otro lado. Esa mitad se ilumina.
- La pelota da un saltito y se queda quieta.
- Así se ve la regla del saque (bote en tu lado y después en el del rival) sin decir nada.

**Cómo se ve quieta** (es lo que ve quien pide movimiento reducido):

- la mesa de perfil, con la mitad derecha un poco iluminada;
- la red al centro;
- la paleta vertical a la izquierda;
- la pelota blanca en reposo sobre la mitad derecha, con su marca de bote.

**Boceto** (viewBox 220×120; el suelo en y = 110 como en las otras escenas):

- `.gnd`: el suelo, `M20 110H206`;
- `.acc.top`: la tabla, `rect x=30 y=78 w=160 h=5 rx=1`, en el color del deporte;
- `.line`: la línea central blanca, `M110 78v5`, en `var(--sp-on)`;
- `.leg`: las patas, `M46 83v27` y `M174 83v27`, con trazo `var(--sp-fg)` a opacidad .5;
- `.half`: la mitad derecha, `rect x=111 y=78 w=79 h=5`, con `fill var(--sp-on)` a opacidad .18 que sube a .5 en
  el bote;
- la red: `.post`, `M110 78V66`, y `.mesh`, líneas finas entre y = 67 y 77, como en tenis;
- `.paddle`: `circle` (`.acc`) de r = 11 en (26, 56), mango `.pc` hacia abajo, y giro con `transform-origin` en el
  mango, como `sp-pickleball-paddle`;
- `.bx > .by > .sq`: la pelota, `circle.pc` de r = 3.2 en (150, 74.8), sobre la mesa;
- `.mark`: la marca de bote, una elipse en (150, 78).

**Movimiento** (keyframes en % de los 2 s; la acción termina hacia el 66 %):

| Momento | Pelota (`translate` desde la posición final) |
|---|---|
| 0 % | (-116, -26), en la paleta |
| 8 % | golpe de la paleta |
| 20 % | 1.er bote en la mitad izquierda: (-80, 0) |
| 36 % | punto más alto, sobre la red: (-40, -24) |
| 50 % | 2.º bote en la mitad derecha: (-12, 0); se ilumina la mitad y aparece la marca |
| 58 % | saltito: (-5, -7) |
| 66 % a 100 % | reposo: `none` |

**Reglas de `scenes.test.ts`:**

- el SVG empieza con `<svg class="sp-table_tennis" viewBox="0 0 220 120">`;
- todo selector empieza con `.sp-table_tennis .`;
- los keyframes se llaman `sp-table_tennis-…`;
- cada `animation` dura `${T}`, lleva `both` y tiene un solo valor de tiempo;
- no hay `animation-delay`;
- **no hay colores hex en el CSS**: solo `var(--sp-*)` y las clases `.acc`, `.on`, `.pc` y `.gnd`;
- nada depende de una animación para esconderse.

**Después** se corre `node scripts/icons/splash.mjs`. Reescribe los bloques `splash:css` y `splash:html` y el mapa
de deporte a escena de `index.html` (CRLF), y conserva el fin de línea.

---

## 11. Colores, textos y documentación

- **`src/components/share/palette.ts:25` (LF):** `table_tennis: '#86198f'`. TypeScript no lo obliga, porque el
  tipo es `Record<string, string>`: sin esta línea, el ping pong caería en el morado de la marca.
- **`index.html:7` y `:14` (CRLF), `public/manifest.webmanifest:5` (CRLF) y `src/pages/legal/PrivacyPage.tsx:37`
  (LF):** agregar «ping pong» a la lista de deportes, después de pickleball.
- **`README.md:17`:** una fila nueva: «Ping pong (tenis de mesa) | 3 | Motor propio de juegos a 11 (saque cada 2,
  dobles con rotación), liga por cajas y escalera».
- **`docs/arquitectura.md`:**
  - línea 87: `src/sports/racket/` pasa a decir «tenis, pádel, pickleball y ping pong»;
  - línea 119: el nivel del ping pong es de 1 a 10;
  - línea 461: los premios del ping pong son individuales salvo `rules.match.doubles`.
- **`docs/partidos.md:3`:** agregar el ping pong a la lista.
- **`docs/insignias.md`:**
  - línea 21: los totales, con ping pong 48 y total 505;
  - §2.3: el título y las filas de `racket_bagel` (Zapatero), `racket_comeback` (0-2 en juegos) y
    `racket_tiebreaks` (Al filo, 10-10);
  - línea 706: el check de `sport`;
  - las filas de §2.9–2.11 que listan deportes.
- **`supabase/README.md`:**
  - línea 115: los ids de `sport_status`;
  - una fila nueva en la tabla de migraciones para `20260930000200_ping_pong.sql`, diciendo qué redefine;
  - línea 692: los premios de raqueta.
- **`scripts/supabase/smoke.sql:108-116`:** agregar `'20260930000200'` a `v_expected`. Opcional: una liga de ping
  pong en el bloque de deportes (629-647).
- **`scripts/supabase/README.md:45`:** «Las 47 migraciones».

---

## 12. Archivos que cambian

Nuevos (LF):

- `src/sports/racket/tableTennis.ts` y `src/sports/racket/tableTennis.test.ts`
- `src/pages/sports/table_tennis/screens.tsx`
- `src/pages/sports/table_tennis/court/logic.ts`, `logic.test.ts` y `TableTennisCourt.tsx`
- `src/pages/sports/table_tennis/table-tennis-render.test.ts`
- `supabase/migrations/20260930000200_ping_pong.sql`
- `tests/sql/ping-pong.test.ts`

Cambian. Los marcados con **CRLF** se editan con Edit, sin reescribirlos, para no cambiar el fin de línea; se
revisa con `git ls-files --eol`.

| Área | Archivos |
|---|---|
| Deporte | `src/sports/types.ts`; `src/sports/registry.ts` **CRLF**; `src/sports/registry.test.ts` **CRLF** (lista de `SPORT_GROUPS` en la línea 233); `src/sports/status.test.ts` **CRLF** (`ALL_SPORTS` en la 20, `BETA_WORLD` con `table_tennis: 'beta'` en la 23-32, grupos en la 94) |
| Motor | `src/sports/racket/rules.ts`, `index.ts`, `pickleball.ts` (extraer `gamesSummary`), `racket.test.ts` (línea 51) |
| Tabla | `src/sports/formats/standings.ts` (+ su prueba) |
| Páginas de raqueta | `logic/results.ts` **CRLF**, `logic/tiebreaks.ts`, `logic/rulesText.ts`, `bits.tsx`, `seasonTable.ts`, `Profile.tsx`, `index.tsx`, `sport.tsx`, `levels.ts`, `court/SetsCourt.tsx`, `league/ScheduleBuilder.tsx`, `league/LeaguePage.tsx`, `match/MatchAdmin.tsx`, `match/MatchDetail.tsx` (solo la palabra), `racket-formats/BoxPage.tsx` |
| Otros del cliente | `src/components/match/parsers.ts`, `src/components/players/logic.ts`, `src/components/agenda/logic.ts`, `src/components/badges/maker/templates.ts`, `src/components/share/palette.ts`, `src/components/home/SportHero.tsx`, `src/pages/sports/SportPicker.tsx`, `src/pages/AboutPage.tsx`, `src/pages/legal/PrivacyPage.tsx` |
| Insignias | `src/badges/catalog.ts`, `catalog.test.ts`, `evaluators/kit.ts`, `evaluators/racket.ts`, `evaluators/season.ts`, `evaluators/boxes.ts`, `rules/racket.ts`, `rules/activity.ts`, `visual/icons.ts`, `visual/icons.test.ts`, `supabase/functions/_shared/badges-engine.gen.js` (generado) |
| Escena | `src/components/splash/scenes.ts`, `scenes.test.ts` (lista de la línea 41), `index.html` **CRLF** (generado + meta) |
| Pruebas con listas | `src/lib/sportContext.test.ts:143` (9 → 10); `src/components/share/palette.test.ts:21`; `src/pages/InfoPages.test.ts:44-46` (agregar «Ping pong», la regex a `/href="\/d\/[a-z_]+"/g` y 9 cuadros); `src/components/badges/maker/design.test.ts:36,99` (`SPORTS` y `byTeamAllowed` con `table_tennis`); `src/components/agenda/agenda.test.ts` (nota del ping pong) |
| SQL (pruebas) | `tests/sql/nuevas.test.ts:114` y `tests/sql/sueltos.test.ts:70` (10 deportes); `tests/sql/consola.test.ts:573,656` (10); `tests/sql/insignias-creador.test.ts:309-317` (53) |
| Estáticos y docs | `public/manifest.webmanifest` **CRLF**, `README.md`, `docs/arquitectura.md`, `docs/partidos.md`, `docs/insignias.md`, `supabase/README.md`, `scripts/supabase/smoke.sql`, `scripts/supabase/README.md` |

---

## 13. Pruebas

### 13.1 Pruebas nuevas

**Motor (`src/sports/racket/tableTennis.test.ts`):**

- El saque cambia cada 2 puntos y cada punto desde 10-10; en 10-10 saca quien empezó el juego.
- `servesLeft` pasa de 2 a 1 y a 2.
- Un juego con ventaja termina 12-10, pero no 11-10.
- El partido al mejor de 3, 5 o 7 termina en 2, 3 o 4 juegos.
- El juego siguiente lo empieza el otro lado.
- Cambio de lado al terminar cada juego y **una sola vez** a los 5 del decisivo. No hay cambio a los 5 en un juego
  que no es el decisivo.
- Rotación de dobles del juego 1 durante 8 puntos: A0→B1→A1→B0.
- En el juego 2, recibe primero quien le sacó al que saca.
- `order` antes del primer punto del juego (sacador en el juego 1 y en el 2; receptor solo en el juego 1) y sus
  errores.
- El cruce del decisivo en los dos casos de §3.2 (turno impar y turno par).
- Deshacer con `replay`, y el estado aguanta ida y vuelta por JSON.
- `correct`: el sacador y el receptor derivados, los campos opcionales y el cruce supuesto.
- `stateFromScore('11-7 9-11 11-5 11-8')`, y el error con «11-9(3)».
- `matchTotals` da `{ sets: [3, 1], games: [3, 1], points: [42, 31] }` para ese marcador.
- `completeMatch`: si el lado 2 se retira en «11-7 3-5» al mejor de 5, queda 11-7 11-5 11-0 para el lado 1; W.O.
  al mejor de 5 da 11-0 11-0 11-0.
- Los resúmenes «ret.» y «W.O.».

**Reglas:** `validateRules` acepta el mejor de 7 y rechaza el de 1, `gameTo: 21`, `winBy: 1` y `switchAt: 6`.
`defaultRules` da una copia nueva cada vez.

**Tabla (`standings.test.ts`):**

- 2, 1 y 0 puntos (W.O.).
- 2 empatados: gana el enfrentamiento directo.
- 3 empatados en círculo: se decide por la dif. de juegos entre ellos y, si sigue, por la de puntos.
- Sin haberse enfrentado: dif. de juegos de toda la tabla y después sorteo.

**Resultados (`racket/logic/*.test.ts`):**

- `racketResultOf` para el ping pong sale de los totales, del texto y de un W.O. (3 × 11-0).
- `pairStandings` usa la tabla de la ITTF y no hace caso de `scheme`.
- `seasonPlayerTable` da 2 y 1 y columnas de juegos.
- `tiebreakText`, `pointsText` y `rulesText`.

**Modo cancha (`table_tennis/court/logic.test.ts`):**

- `ttView` en individual y dobles: nombres de quien saca y recibe, «2.º saque», `deuce`, `gamePoint` y
  `matchPoint`, `switchNow` y `receiveSwap` con `nextReceiver`.
- `milestone`: cada 4 puntos, al llegar a 10-10, al terminar un juego y al terminar el partido; no por cada punto.

**Humo (`table_tennis/table-tennis-render.test.ts`):**

- Se basa en `tennis-render.test.ts`: `screens` y `TABLE_TENNIS_EXT` para el admin, un jugador y un visitante.
- `EventWizard` sin americano ni mexicano, con «Torneo grupos + eliminatoria».
- La tabla con Jue., PF y PC.
- El `TTSetup` con «¿Quién recibe primero?» en dobles.
- «Mesa» en el calendario.

**Insignias:**

- Zapatero con 11-0, y sin darlo con 11-1.
- Remontada desde 0-2 al mejor de 5 y al mejor de 7, y sin darla con 0-1 ni al mejor de 3.
- Al filo con 12-10.
- Las insignias de carrera corren para el ping pong (`racketTargets`).
- `box_top_month` desempata por dif. de juegos en pickleball y en ping pong.

**SQL (`tests/sql/ping-pong.test.ts`)**, con el patrón de `raqueta.test.ts` (una transacción por prueba):

- `sport_status`: `table_tennis` está `open`, es `racket` y tiene orden 10.
- Una cuenta normal crea la liga de ping pong.
- Eventos: `liga`, `torneo`, `cajas` y `escalera` pasan; `americano`, `mexicano`, `noche` y `practica` dan
  `invalido`.
- Partidos: los formatos `''` y `'sets'` pasan; `'americano'` da `invalido`.
- Marcador: `sides [4, 3]` con `totals.sets [4, 3]` pasa; `sides [5, 0]` y `totals.games [5, 0]` no.
- El tenis sigue topado en 3.
- `attrs.tt`: 5.5 pasa y 11 no. Un `tt` en una liga de tenis no se revisa.
- `save_box_month`, `join_ladder` y `create_challenge` funcionan en ping pong.
- `signup_kind` da `'tourney'` y `public_agenda` muestra el torneo.
- `prize_comp` da `'racket_tourney'`.
- Los nombres de los checks en `pg_constraint`.
- `badge_awards`, `badge_progress` y `badge_stats` aceptan `'table_tennis'`.
- `badge_apply_decisions` acepta el deporte.
- `badge_activity` devuelve el día de un partido de ping pong.
- `badge_icon_ok('ping-pong')` da true.
- `tt_score_ok` y `tt_result_ok` no las pueden ejecutar `anon` ni `authenticated`.
- Con ganador, el marcador es un final posible (ni 4-4, ni 1-0, ni el ganador al revés, ni totales que no cuadran).

### 13.2 Pruebas que cambian

Las de §12 («Pruebas con listas» y «SQL (pruebas)»), más:

- `catalog.test.ts`: 48 del ping pong y 505 en total;
- `icons.test.ts`: 53 íconos, 14 en deporte y 9 emblemas;
- `registry.test.ts` y `status.test.ts`.

### 13.3 Verificación final

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:sql`
- `pnpm build`
- En el navegador a 375 px:
  - selector de deporte (10 cuadros), Home del ping pong con su escena y color, y «Acerca de» (9 grupos);
  - crear una liga y un torneo;
  - anotar un partido de dobles hasta el decisivo y ver el cambio de lado y el cruce de recepción;
  - enviar, confirmar desde el rival y ver la tabla;
  - revisar en modo oscuro.

---

## 14. Orden de construcción

1. **Motor puro.** `rules.ts` (tipos, plantillas, validación, `isGameSport`), `tableTennis.ts`, `index.ts` y sus
   pruebas. No toca `SportId` todavía.
2. **Registro, para que compile todo junto.**
   - `types.ts` y `registry.ts` (ficha, `PingPong`, `alias`);
   - lo que TypeScript obliga: `LEVEL_SCALES`, `DAY_WEIGHT`, `SPORT_EMBLEM` e `ICON_DATA['ping-pong']`, y
     `SCENE_FOR_SPORT` y `SCENES`, por ahora con la escena mínima;
   - `palette.ts` y las pruebas del registro y del estado.
   - Correr `pnpm typecheck` y arreglar cada narrowing que salga: `SetsCourt`, `results.ts`, `rulesText` y
     `season.ts`.
3. **Tabla y resultados.** `standings.ts`, `results.ts`, `tiebreaks.ts`, `rulesText.ts`, `bits.tsx`,
   `seasonTable.ts`, `Profile.tsx`, `parsers.ts`, `players/logic.ts` y el selector de puntos. Con sus pruebas.
4. **Pantallas.** `table_tennis/screens.tsx`, el modo cancha (`logic.ts` y `TableTennisCourt.tsx`), `resultEntry`,
   las palabras «mesa» y «mesas», el alias en SportHero y SportPicker, «Acerca de», la agenda y la prueba de humo.
5. **SQL.** La migración `20260930000200_ping_pong.sql`, `tests/sql/ping-pong.test.ts`, los conteos de las pruebas
   SQL, `smoke.sql` y los README.
6. **Insignias.**
   - `catalog.ts`, `kit.ts`, los evaluadores y las reglas, y sus pruebas;
   - después, `pnpm badges:bundle`.
7. **Escena de apertura.** La escena completa en `scenes.ts` y después `node scripts/icons/splash.mjs`.
8. **Textos y docs.** `index.html`, `manifest`, la privacidad, `README.md` y `docs/`.
9. **Verificación completa** (§13.3). No se hace commit ni push ni deploy desde esta tarea.

---

## 15. Riesgos y coordinación

- **La otra entrega (`../matchmate-bosc`, estadísticas del boliche)** sale de la misma base. Hay dos riesgos:
  - si agrega una migración que redefine `badge_activity`, `badge_apply_decisions` o `badges_daily`, **la que corra
    después** tiene que partir del cuerpo de la otra. `20260930000200` va después de cualquier `…0930000100`;
  - al juntar las ramas chocan la lista `v_expected` de `smoke.sql`, el conteo de `scripts/supabase/README.md` y,
    si tocan el catálogo, los totales de `catalog.test.ts` y de `docs/insignias.md`.
- **Orden 10.** El ping pong sale al final de las listas, lejos de las otras raquetas. Para ponerlo junto a ellas
  habría que renumerar `sort_order` en producción y enseñarle a la prueba del registro a leer ese `update`. Se
  deja para después si el dueño lo pide.
- **Color.** El rojo `#dc2626` se cambió por el fucsia `#b01cbd`: con el rojo, toda la app en ping pong se veía del
  color de `--danger`. `registry.test.ts` pide ahora una distancia mínima (OKLab) entre el color de cada deporte y
  `--danger` / `--warn`, en claro y en oscuro.
- **Selector y «Acerca de».** Con 10 deportes queda un cuadro solo en la última fila del selector de deporte
  (3 columnas); se acepta. En «Acerca de» (9 grupos) la grilla pasa de 4 a 3 columnas (`sportGridCols`: 4 si llenan
  las filas, 3 si esas sí), y quedan 3 filas llenas en lugar de 4 + 4 + 1.
