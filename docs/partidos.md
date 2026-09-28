# Partidos: el contrato común de raqueta y deportes de equipo

Base compartida por pádel, tenis, pickleball, baloncesto, fútbol y futsal. Todo lo de aquí ya existe y tiene
pruebas; las pantallas de cada deporte (`src/pages/sports/<sportId>/screens.tsx`, ver `src/sports/screens.tsx`)
lo usan sin tocarlo.

| Pieza | Dónde | Pruebas |
|---|---|---|
| Tablas, RLS, RPC, tiempo real y push | `supabase/migrations/20260927000100_partidos.sql` | `tests/sql/partidos.test.ts`, `tests/sql/partidos-tiempo-real.test.ts` |
| Capa de datos (partidos) | `src/lib/data/matches.ts` | `matches.test.ts`, `matches.flow.test.ts` (con la base de verdad) |
| Capa de datos (equipos y parejas de temporada) | `src/lib/data/seasonTeams.ts` | `seasonTeams.test.ts` |
| Modo cancha | `src/court/*` (barril `src/court/index.ts`) | `session`, `log`, `publisher`, `machine`, `example` `.test.ts` |
| Piezas de pantalla | `src/components/match/*` (barril `index.ts`) | `format.test.ts` (textos y lectores de marcador) |

Solo ligas de **raqueta o equipos** (`sport_status.family` = `racket` | `team`). En una liga de boliche, golf o
natación todo esto responde `invalido`.

---

## 1. Tablas (se leen con `select`; se escriben solo por RPC)

Todas con RLS: las ve quien ve la liga (pública: cualquiera; privada: sus miembros; superadmin). `league_id`
siempre verificado con FK compuestas. Borrados en `tombstones` (`matches` = id, `match_sides` = `match:side`,
`match_players` = `match:player`, `team_players` = `team:player`).

### `matches`
| Columna | Qué es |
|---|---|
| `id`, `league_id`, `event_id` (null = partido suelto de la liga) | El evento es la jornada, la noche de americano o el torneo. Borrar el evento borra sus partidos. |
| `round` smallint (0–999) · `stage` (≤40) · `bracket_key` (`R1-1`, `P3`) · `court` (≤40) · `scheduled_at` | Ronda/jornada, fase que se muestra («Grupo A»), partido del cuadro, cancha y hora. |
| `status` | `scheduled` `live` `suspended` `finished` (propuesto, por confirmar) `confirmed` `disputed` `walkover` `void` `postponed` |
| `format` (≤40) | Lo define cada deporte (`americano`, `sets`, `fiba`, `futsal`…). |
| `rules` jsonb (<8 KB) | Reglas **copiadas de `leagues.rules` al crear** (cambiar la liga no cambia partidos ya creados). Se pueden cambiar solo antes de empezar. |
| `require_confirm` (true) | false = lo que anota un jugador queda final (americano, mexicano). |
| `score` jsonb (<4 KB) | Marcador resumido. Convención: `{ text: "6-4 3-6 10-7", sides: [2, 1], ... }` (ver §5). |
| `state` jsonb (<128 KB) | **Solo el modo cancha** escribe aquí: `CourtSnapshot` (§4) para retomar en otro teléfono. Las listas no lo bajan. |
| `seq` | Última publicación del anotador (sube siempre, también al deshacer). |
| `version` | Sube en cada cambio de la fila (y de sus lados/jugadores). Las listas releen solo lo que cambió. |
| `winner_side` 1\|2\|null · `walkover_side` 0\|1\|2 (0 = ninguno vino) | null = empate (no en raqueta). |
| `scorer_id` · `lease_until` | Un solo anotador. El turno dura 5 min y **se renueva al publicar** (no hay escrituras aparte). |
| `proposed_by/at/side` · `confirmed_by/at` · `disputed_by/at` · `dispute_note` | Flujo del resultado. `proposed_side` null = lo anotó el admin o el anotador de la liga. |
| `note` (≤500) · `history` jsonb (últimas 50: `{at, by, a, note?, from?, to?, score?, winner?, absent?}`) | Aviso del admin e historial (`a`: `schedule`, `reschedule`, `postpone`, `suspend`, `takeover`, `handoff`, `release`, `finish`, `confirm`, `dispute`, `resolve`, `correct`, `walkover`, `void`). |

### `match_sides` (dos por partido)
`match_id`, `side` 1|2, `league_id`, `team_id` (pareja/equipo de temporada o null), `label` (1–80, **copiado**:
«Ana / Luis», «Tigres», «Por definir»), `seed`. Si se borra el equipo, el partido conserva el nombre.

### `match_players` (quién jugó)
`match_id`, `player_id`, `league_id`, `side`, `position` (≤20: `drive`/`reves`, `GK`, `titular`…), `jersey` (0–99,
el de ese partido), `sub` (suplente o refuerzo). **La pareja o el equipo suma en la tabla; las estadísticas van a
cada jugador** (también al suplente).

### Equipos y parejas de temporada: `teams` con `event_id` null + `team_players`
`teams` ya existía (boliche usa `event_id` no null). `team_players`: `team_id`, `player_id`, `league_id`,
`jersey` (0–99, único en el equipo), `position` (≤20), `role` `player` | `captain` | `delegate`.
En raqueta, la **pareja** es un equipo de temporada con id estable (sus dos jugadores, y el suplente si se quiere).

## 2. Quién puede qué

«Lado» de una cuenta en un partido (`private.match_side`, en el teléfono `sideOf`):
- **raqueta**: jugador del partido (`match_players`) o de la pareja del lado (`team_players`, cualquier rol);
- **equipos**: solo **capitán o delegado** del equipo del lado.
Si la cuenta aparece en los dos lados, no tiene lado.

| Acción | Quién |
|---|---|
| Crear, cambiar datos/lados, W.O., aplazar, reprogramar, anular, borrar, corregir, resolver disputa | admin (dueño, admin o superadmin) |
| Pedir el turno de anotar, publicar | admin, anotador de la liga (`league_members.is_scorer`) o alguien de un lado |
| Quitarle el turno a otro | solo el admin (`claim_scorer(p_force)`), con confirmación en pantalla. **Nunca solo porque venció.** |
| Entregar el turno | quien lo tiene (a otra cuenta que pueda anotar) o el admin (a quien quiera) |
| Terminar | admin o anotador de la liga → **confirmado**; alguien de un lado → **propuesto** (`finished`); si `require_confirm` = false → confirmado |
| Confirmar | el **otro** lado o el admin (también después de las 48 h: cierre formal) |
| Disputar | el otro lado, **dentro de las 48 h** |
| Alineación de un lado | admin, anotador de la liga, quien tiene el turno (los dos lados) o alguien de ese lado |
| Suspender con marcador parcial | quien tiene el turno, el anotador de la liga o el admin |
| Plantilla | admin (todo, también roles); capitán o delegado (jugadores, dorsal, posición; no cambia roles ni saca capitanes/delegados); cada jugador se puede salir |

**Regla de las 48 h (se calcula al leer, no hay escritura):** un resultado `finished` con `proposed_at` de hace
48 h o más **cuenta como final** (tablas, estadísticas, cuadro). En SQL: `private.match_final(status, proposed_at)`;
en el teléfono: `isFinal(match, now)`. `confirmed` y `walkover` siempre cuentan; `disputed`, `void` y lo demás no.

## 3. RPC (`backend.rpc` / las funciones de `matches.ts`)

Errores como el resto de la API (`no_permitido` 42501, `invalido`, `no_existe`, `cerrado`; 23505 dorsal repetido;
23503 jugador/equipo/evento de otra liga). Las de la cola llevan `p_op_id` (reintentar no repite).

| RPC | Devuelve | Notas |
|---|---|---|
| `create_matches(p_league, p_matches jsonb)` | `uuid[]` en el mismo orden | `[{id?, event_id?, round?, stage?, bracket_key?, court?, scheduled_at?, format?, rules?, require_confirm?, sides: [{side, team_id?, label?, seed?, players?: [{player_id, position?, jersey?, sub?}]}, …]}]` (1–500). Sin `label`: el del equipo, los jugadores («Ana / Luis») o «Por definir». Un solo aviso de tiempo real por lote. |
| `update_match_schedule(p_match, p_patch)` | — | Claves: `scheduled_at, court, round, stage, bracket_key, event_id, format, require_confirm, rules` (`rules` solo con `seq` = 0 y programado/aplazado). |
| `set_match_sides(p_match, p_sides)` | — | Admin. Mismo formato que `sides`. No con resultado anotado (`cerrado`). |
| `set_match_players(p_match, p_side, p_players, p_op_id?)` | — | Reemplaza la alineación de un lado. |
| `claim_scorer(p_match, p_force=false)` | `{ok, scorer_id, scorer_name, lease_until, expired, status, seq, version, state}` | `state` solo si `ok`. Partido cerrado: `cerrado`. |
| `release_scorer(p_match, p_to?)` | — | Soltar (null) o entregar. |
| `publish_match(p_op_id, p_match, p_seq, p_state, p_score)` | `{ok, status, seq, version, lease_until}` o `{ok:false, reason}` | **Nunca falla por el turno**: `reason` = `lease` (+ `scorer_id`, `scorer_name`), `stale` (+ `seq`: llegó algo más nuevo o una lista que no sigue a la guardada) o `cerrado` (+ `status`). Si nadie tiene el turno y el partido no está suspendido, lo toma; un partido **suspendido** solo se retoma con `claim_scorer` antes (lo que llegue de la cola sin turno da `lease`). Pasa a `live` solo si trae algo más nuevo que lo del servidor (publicar lo mismo solo renueva el turno). `p_seq` ≤ seq del servidor + 10 000 y, si el estado trae `seq`, tiene que ser igual. Una lista de otro teléfono solo entra si sigue a la guardada (`parent`). |
| `finish_match(p_match, p_score, p_winner?, p_state?, p_seq?, p_op_id?)` | `{ok, status}` o `{ok:false, reason:'stale'}` | `p_score` obligatorio. Raqueta: `p_winner` 1\|2. Si otro anota en vivo con el turno vigente, solo el admin cierra. Suelta el turno. Push al otro lado (§6). |
| `confirm_result(p_match, p_op_id?)` | — | Ya confirmado: nada. |
| `dispute_result(p_match, p_note?, p_op_id?)` | — | Nota ≤500. |
| `resolve_dispute(p_match, p_score?, p_winner?, p_state?, p_note?)` | — | Sin `p_score` queda el propuesto. |
| `admin_correct_result(p_match, p_score, p_winner?, p_state?, p_note?)` | — | Cualquier estado → confirmado (con historial `from`/`score`). |
| `set_walkover(p_match, p_absent 0\|1\|2, p_score?, p_note?)` | — | El marcador del W.O. lo calcula el teléfono con el motor (`completeMatch` en raqueta, forfeit en equipos). |
| `postpone_match(p_match, p_note?)` · `reschedule_match(p_match, p_scheduled_at, p_court?, p_note?)` | — | Aplazado → programado al reprogramar; suspendido sigue suspendido. |
| `suspend_match(p_match, p_state?, p_score?, p_seq?, p_note?, p_op_id?)` | — | Guarda el marcador parcial y suelta el turno; se retoma pidiendo el turno. |
| `void_match(p_match, p_note?)` · `delete_match(p_match)` | — | |
| `my_matches(p_since?)` | filas `{match_id, league_id, side}` | Mis partidos en todas mis ligas (por jugador o por pareja/equipo). Con `p_since`: desde esa fecha más los abiertos. |
| `create_season_team(p_league, p_name, p_color?, p_players?, p_id?)` | `uuid` | `p_players` = `[{player_id, jersey?, position?, role?}]`. |
| `update_season_team(p_team, p_patch)` | — | Claves `name, color, sort_order`. |
| `delete_season_team(p_team)` | — | Los partidos se quedan con el nombre copiado. |
| `set_team_player(p_team, p_player, p_jersey?, p_position?, p_role?)` · `remove_team_player(p_team, p_player)` → boolean · `set_roster(p_team, p_players)` | | Ver §2. |

Helpers de `private` para otras migraciones (no se llaman desde la app): `league_family(league)`,
`require_match_league(league)`, `match_side(match)`, `match_side_of(match, user)`, `can_score_as(match, league, user)`,
`is_match_official(league)`, `team_role(team)`, `match_final(status, proposed_at)`, `check_score(jsonb)`.
**No los vuelvas a crear** en tu migración (chocan los nombres).

## 4. Tiempo real

`private.emit` a `league:<liga>` y, si el partido tiene evento, a `event:<evento>` (canales que ya autoriza la
política de Supabase; no hay `match:<id>`):

| Evento | Payload | Cuándo |
|---|---|---|
| `match` | la fila de `matches` **sin** `state`, `rules` ni `history` | cada cambio de la fila (publicar, terminar, confirmar…) |
| `matches` | `{op: insert\|update\|delete, ids}` | altas y bajas; cambios de lados o jugadores (`update`) |
| `teams` | `{op, ids}` (equipos) | equipos de temporada y plantillas (solo `league:`) |

La capa de datos ya los maneja (`useMatchTopic`): `match` se pone directo en la caché; lo demás invalida.

## 5. Capa de datos

```ts
import {
  useMatches, useMatch, useMyMatches,                    // lecturas (Live<T>)
  createMatches, updateMatchSchedule, setMatchSides,      // admin, con señal
  claimScorer, releaseScorer,
  publishMatch, finishMatch, confirmResult, disputeResult, suspendMatch, setMatchPlayers, // por la cola
  resolveDispute, adminCorrectResult, setWalkover, postponeMatch, rescheduleMatch, voidMatch, deleteMatch,
  isFinal, awaitingConfirmation, autoConfirmAt, finalMatches, canConfirm, canDispute, sideOf, sideKey, leaseExpired,
  type Match, type MatchScore, type MatchSide, type MatchDraft,
} from '../../lib/data/matches';
import { useSeasonTeams, createSeasonTeam, setTeamPlayer, removeTeamPlayer, setRoster, myTeamRoles, teamsICanSpeakFor } from '../../lib/data/seasonTeams';
```

- `useMatches({ lid, eventId? })` → `Live<Match[]>` ordenados por ronda, hora, cancha. Sin `state`.
- `useMatch(lid, id, { eventId? })` → `Live<Match | null>` con `rules`, `state` e `history`.
- `useMyMatches(uid, sinceIso?)` → mis partidos (cada uno con `mySide`).
- `useSeasonTeams(lid)` → `Live<SeasonTeam[]>` (`roster` ordenado: capitán, delegado, dorsal).
- Todo `Match` trae `sides: [MatchSide, MatchSide]` con sus `players`, y `pending: true` si hay un cambio de este
  teléfono en la cola sin confirmar (mostrar «Por enviar»).
- Escrituras de cancha por la cola: se ven de una (cambio optimista) y salen solas al volver la señal.
  `finishMatch` devuelve `undefined` si quedó en la cola.
- Horas: ISO del servidor (`scheduledAt`, `proposedAt`…); `createdAt`/`updatedAt` como `Stamp`.

**Convención de `score`** (lo escriben el modo cancha con `adapter.score` y los lectores de «solo resultado»):
`text` (lo que se lee: «6-4 3-6 10-7», «78-72», «2-1 (4-3 pen.)»), `sides` = el número grande de cada lado (sets,
goles, puntos), y lo que el deporte quiera además: `totals` (`{sets, games, points}` para las tablas sin leer el
estado), `live` (foto chica para «En vivo», p. ej. `toLive()` de raqueta, o reloj/periodo en equipos).
Para las tablas: `finalMatches(list, now)` y luego el `MatchResult` de tu motor (`racketMatchResult`,
`basketballMatchResult`…); `sideKey(side)` da el id del lado (la pareja/equipo, o `p:<jug>+<jug>`).

## 6. Push

Al proponer un resultado (`status` → `finished`), las cuentas del otro lado reciben **«Tienes un resultado por
confirmar»** («Luis / Ana anotó 6-4 6-3. Confírmalo o reclama antes de 48 horas.») con el link
`/l/<liga>/juegos?partido=<id>` (tag `confirmar:<id>`). **La pantalla `Feed` del deporte debe abrir ese partido
cuando llega `?partido=`** (y mostrar ahí `ConfirmResultBanner`).

- **Reclamo:** al reclamar, los dueños y admins de la liga reciben «Reclamaron un resultado» y el lado que lo propuso
  «Reclamaron tu resultado» (tag `reclamo:<id>`); quien reclama no recibe nada.
- **Recordatorios** (`private.match_reminders`, cron `mm-partidos` cada 15 min, `20260927001200_avisos.sql`): «Partido
  mañana…» el día antes (12 pm a 9 pm hora de la liga) y «Partido hoy a las 8:00 pm, Cancha 2» de 3 h a 10 min antes
  (nunca antes de las 7 am), para todos los deportes de partidos. En equipos va a toda la plantilla según la
  convocatoria. Se vuelve a mandar si reprograman. Las noches de puntos no (ya avisa `save_night_round`).
- **La campana** (`src/lib/data/matchNotices.ts` + `buildMatchNotices` en `src/lib/notifications.ts`): partido de hoy,
  resultado por confirmar, reclamo, cambio de hora o cancha, aplazado, «Ronda 3: te toca la Cancha 2» y retos de la
  escalera. Los ids son los mismos tags del push: el aviso del teléfono se reemplaza, no se repite.

## 7. Modo cancha (`src/court`)

El partido es una lista de jugadas; el marcador es `replay(lista)`; deshacer quita la última. La lista se guarda
en el teléfono **después de cada toque** (IndexedDB `mm-cancha`, clave `mm:cancha:<liga>:<partido>`; si no hay,
localStorage), así que recargar, quedarse sin señal o sin batería no pierde puntos.

### Enchufar un motor: `CourtAdapter`

```ts
import type { CourtAdapter } from '../../court';
import { createRacketEngine, matchTotals, toLive, type MatchSetup, type TennisEvent, type TennisState } from '../../sports/racket';

export function padelAdapter(rules: Record<string, unknown>): CourtAdapter<MatchSetup, TennisState, TennisEvent> {
  const engine = createRacketEngine('padel', rules);          // el motor puro ya probado
  return {
    engine,
    score: (s) => {                                            // → matches.score
      const t = matchTotals(s);
      return { text: engine.result(s).summary, sides: [t.sets[0], t.sets[1]], live: toLive(s) as never };
    },
    // Publicar ya en los hitos (fin de juego o set); si no, como mucho cada 60 s. El final siempre publica.
    milestone: (prev, next) => prev.sets.length !== next.sets.length || prev.games.join() !== next.games.join(),
    // winner: (s) => …  (por defecto engine.result(s).winner)
  };
}
```
(Este ejemplo corre en `src/court/example.test.ts`.) En equipos: `milestone` = gol, fin de periodo, roja; el reloj
va dentro del estado del motor (marcas de tiempo), no hace falta publicarlo cada segundo.

### La pantalla

```tsx
import { CourtLayout, TwoHalves, useCourt } from '../../court';

function PadelCourt({ lid, match, isAdmin, userId, onExit }: …) {
  const adapter = useMemo(() => padelAdapter((match.rules?.match ?? {}) as Record<string, unknown>), [match.rules]);
  const court = useCourt({ lid, matchId: match.id, userId, adapter, status: match.status, config: { firstServer: 1 } });
  const s = court.state;
  return (
    <CourtLayout title={`${match.court} · Ronda ${match.round}`} onExit={onExit} court={court} isAdmin={isAdmin}
                 header={s && <Marcador state={s} />} undoLabel="Deshacer punto">
      <TwoHalves
        swap={s?.leftSide === 2}
        disabled={court.readOnly || court.over}
        a={{ label: match.sides[0].label, big: s?.games[0], sub: s?.display[0], onTap: () => court.apply({ type: 'point', side: 1 }) }}
        b={{ label: match.sides[1].label, big: s?.games[1], sub: s?.display[1], onTap: () => court.apply({ type: 'point', side: 2 }) }}
      />
    </CourtLayout>
  );
}
```

- `useCourt({ lid, matchId, userId, adapter, status, config })` → `CourtController`: `state`, `snapshot`, `over`,
  `winner`, `summary`, `score`, `canUndo`, `lease`, `readOnly`, `unsent`, `conflict`, `error`, y `apply(ev)` (null o
  el mensaje del motor), `undo()`, `start(config)` (si `config` era null: pantalla de sorteo), `claim(force?)`,
  `finish()` → `'sent' | 'queued' | 'stale'`, `suspend(note?)`, `flush()`.
- `config` = lo que recibe `engine.init` (sorteo, orden de saque…). Las reglas van en el motor (del `match.rules`).
- Al abrir pide el turno (`claim_scorer`). Sin señal anota igual (`lease.kind = 'offline'`). Si otro tiene el turno:
  `lease.kind = 'other'` (solo lectura; su lista queda guardada); el admin ve «Tomar el control».
- **Retomar en otro teléfono:** el turno trae `state` (el `CourtSnapshot` publicado) y el teléfono sigue desde ahí.
  Si el teléfono tenía jugadas sin enviar y otro siguió después, gana el servidor y la lista local queda aparte
  (`conflict`). Cada lista lleva `origin` (un id al azar por partido y teléfono, que no identifica al aparato) y
  `parent` (la lista que siguió al tomar el turno): el servidor rechaza una lista vieja de otro teléfono y la cancha
  quita de la cola lo suyo que ya no sirve.
- **Sin señal y sin lista propia:** arranca desde el estado del partido que el teléfono ya tenía guardado y no
  publica hasta tener el turno (lo vuelve a pedir cada 20 s y al volver la señal).
- **Suspendido:** abrir la cancha de un partido suspendido solo para mirar no lo pone en vivo (al salir suelta el
  turno). Si el admin lo suspende mientras un teléfono anota, esa cancha se cierra y descarta lo que tenía en cola.
- **Publicación:** la primera jugada enseguida (el partido sale «En vivo»); después en los hitos (con 3 s mínimo
  entre publicaciones) o cada 60 s si hubo cambios; al terminar, suspender o pasar a segundo plano, ya. Nunca por
  punto. Va por la cola con colapso (sin señal solo sale la última) y cada publicación renueva el turno.
- **Alineaciones (`set_match_players`):** fuera del admin y el anotador de la liga, nada cambia con el resultado ya
  propuesto o reclamado, nadie del otro lado entra al propio, y en raqueta el que anota solo cambia posición, dorsal
  o suplente del rival (no agrega ni quita). En equipos, un capitán no suma a su plantilla a alguien de otro equipo.
- `CourtLayout`: pantalla completa (fija, con zonas seguras), pantalla siempre encendida (Wake Lock; en iPhone viejo
  avisa cómo quitar el bloqueo), modo sol (alto contraste, se recuerda), pantalla completa donde se puede, avisos de
  turno y sin señal, **Deshacer siempre a la vista**, Terminar (confirma con el resumen) y Suspender (menú).
  `actions` agrega botones del deporte (Fin del cuarto, Tiempo muerto…).
- `TwoHalves`: dos mitades gigantes (lado 1 = `--court-a`, lado 2 = `--court-b`; `color` para el del equipo),
  un toque cuenta una vez (280 ms), vibración corta solo en Android.
- Más bajo nivel (sin React, para pruebas): `createCourtMachine`, `applyEvent`, `undoEvent`, `pickSnapshot`,
  `createPublisher`, `createCourtStore`, `pruneCourtLogs` (limpiar listas de partidos cerrados).

`CourtSnapshot` (lo que va en `matches.state`): `{ v: 1, seq, config, base (estado tras compactar o null), log,
at, origin, parent }`. Más de 400 jugadas: las viejas pasan a `base` (se pueden deshacer las últimas 100).

## 8. Piezas de pantalla (`src/components/match`)

| Componente | Para qué | Props principales |
|---|---|---|
| `MatchCard` | Tarjeta: lados, marcador por set/total, estado («En vivo», «Por confirmar», «W.O.»…), ronda, cancha, hora, cuenta regresiva de 48 h, «Por enviar» | `match`, `to` o `onClick`, `mySide`, `roundWord` («Jornada»), `tz`, `renderSide`, `footer` |
| `ConfirmResultBanner` | Al rival: Confirmar / «No es así» (reclamo con nota). A quien propuso: «Esperando que el rival confirme» | `lid`, `match`, `mySide`, `isAdmin` |
| `StandingsTable` | `StandingRow[]` con PJ G (E) P, a favor/en contra/dif. y Pts; «i» con el desempate (`decidedBy`) | `rows`, `nameOf`, `columns` (`defaultColumns({draws, forLabel:'Sets'})`), `highlight`, `primary` |
| `ResultEntryModal` | Modo «solo resultado» en 10 s con lector enchufable; `mode` `finish` \| `correct` \| `resolve` | `lid`, `match`, `parser`, `examples`, `placeholder`, `onSubmit?` |
| `ScheduleList` | Calendario por ronda/jornada o por día | `matches`, `groupBy`, `roundWord`, `linkOf`, `mySide`, `renderMatch` |
| `BracketView` | Cuadro de `src/sports/formats/knockout` (columnas por ronda, 3.er lugar, campeón) | `bracket`, `nameOf`, `matchOf(bracketKey)`, `onMatch` |
| `ShareResultCard` | Texto para WhatsApp (link `wa.me`), compartir o copiar | `match`, `title`, `roundWord`, `url` |

Lectores de marcador (`parsers.ts`): `racketResultParser(rules, setup?)` («6-4 3-6 10-7», «7-6(5) 6-4», «11-7 9-11
11-5», con `score.totals`), `twoNumbersParser({allowDraw, max, unit})` («78-72», «2-1»), `pointsResultParser(config)`
(americano: suman el total). Textos (`format.ts`): `statusInfo`, `autoConfirmText`, `whenText`, `roundLabel`,
`scoreColumns`, `flipScoreText`, `matchShareText`, `whatsappShareUrl`.

## 9. Qué hace cada deporte

1. Sus pantallas en `src/pages/sports/<sportId>/screens.tsx` (`Home`, `Event`, `Standings`, `Feed`, `MyProfile`…).
2. Arma el calendario con `src/sports/formats` y lo guarda con `createMatches` (ids del teléfono, un lote).
3. Su `CourtAdapter` y su lector de «solo resultado».
4. Sus tablas: `finalMatches` → `MatchResult` de su motor → `StandingsTable`.
5. Si necesita más validación en la base (p. ej. límites del marcador de su deporte), la agrega en **su** migración
   con un trigger sobre `matches` que mire `private.league_family`/`leagues.sport` (sin tocar esta).
