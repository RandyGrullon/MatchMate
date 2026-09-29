# Premios del torneo: la insignia que se lleva el campeón

> **Estado:** especificación para implementar en una sola entrega. Base: `main` limpio, en producción hasta
> `20260929001190`. Migración nueva: `supabase/migrations/20260929001200_premios_torneo.sql` (las aplicadas no se
> tocan; lo que cambia de ellas se redefine aquí con `create or replace` y la misma firma).
> Los identificadores van en inglés; los textos que ve el jugador, en español con tú y entre comillas «».

**Lo que pidió el dueño:** «Que se pueda seleccionar la insignia que obtendrá el equipo que gane el torneo y, por
ejemplo en boliche u otro deporte, el que gane individual. En boliche el equipo se mide por puntos a scratch y los
jugadores por hándicap individual.»

**Lo que se construye (interpretación aprobada):**

1. Al armar el torneo, o mientras se juega, alguien de la liga elige qué insignia se lleva cada lugar del podio:
   campeón por equipos y campeón individual, y si quiere también el 2.º y el 3.º de cada uno. Puede usar un diseño
   del creador de la liga (`league_badges`) o crear uno en el momento con las plantillas «Campeón», «Subcampeón» y
   «Tercer lugar».
2. Cuando el torneo termina, un admin toca «Entregar premios», ve el podio de cada categoría y confirma. La app da
   las insignias; un premio de equipo le llega a cada jugador del equipo. Entregar otra vez no duplica nada. Mientras
   el premio esté abierto se puede corregir: se retira a quien ya no corresponde y se le da a quien sí.
3. En el boliche hay dos podios separados, «Equipos (scratch)» e «Individual (handicap)». Es el criterio por defecto
   de todo torneo de boliche nuevo, y se sigue pudiendo cambiar en cada evento.
4. Cada otro deporte premia lo que tiene:
   - baloncesto, fútbol y futsal: el equipo campeón (cuadro del torneo relámpago, final del playoff);
   - raqueta: la pareja o el jugador campeón de cada categoría del torneo, y el mejor de una noche de americano o
     mexicano;
   - golf: el campeón individual de la ronda o del torneo;
   - natación: el club y el nadador del encuentro.

---

## 1. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | Tablas propias, `tournament_prizes` (una por competencia) y `tournament_prize_slots` (una por lugar). **No** van en `events.config`. | `update_event` reemplaza `config` entero (`20260926000500_rpc.sql:767`), y el cliente ni lo mapea (`rows.ts:80-99`, `toEvent`). Los premios también cuelgan de un torneo de golf de varias rondas o de un playoff, que no son eventos. Y necesitan su propia RLS, sus FK y su tiempo real. |
| D2 | Las insignias se dan en **`league_badge_awards`**, la misma tabla del creador, con una columna nueva `prize_slot_id`. | Así el perfil (`profile_badges.leagueAwards`), el aviso de desbloqueo (`badge_notices` → `BadgeUnlockHost`/`UnlockModal`), el push (`tag 'insignia:<id>'`), ocultar, reportar, las fusiones y la exportación de datos ya funcionan sin cambios. |
| D3 | **El servidor calcula el podio donde puede**: boliche (todo está en `entries`), cuadros de raqueta y del relámpago (la final está en `matches`) y playoffs (`playoffs.winner`). En golf, natación y noches de raqueta el podio lo manda el teléfono, porque el cálculo es TypeScript grande (desempate por countback, puntos por serie y grupo de edad, tabla social). En esos casos el servidor solo verifica que quienes reciben hayan jugado. | En el boliche el admin casi siempre juega: cada cuenta juega con su jugador, también el dueño y los admins. Si el teléfono mandara el podio, habría que bloquear al admin que gana (`a_si_mismo`), o aceptar que cualquiera se ponga primero. Con el cálculo en el servidor, el admin que ganó puede entregarse su premio sin trampa posible. **Esto se aparta de la propuesta**, que decía «boliche calculado en el teléfono con validación de pertenencia». La consulta SQL son unas 30 líneas y una prueba de paridad la amarra al TypeScript (§10). |
| D4 | Un premio de torneo **no es un regalo**: no usa el cupo del diseño (Única, Selecta o Abierta) ni los topes del creador (15 por jugador al año, 60 por liga en 30 días, 60 por cuenta por hora). Tiene sus propios topes (§4.5). | La Única «Campeón» no le cabe a un equipo de 4 (`cupo_lleno`). Un equipo de fútbol de 20 se come el tope de la liga. Y dos torneos del mismo mes con la misma cinta chocarían por `duplicado`. Quién recibe lo decide el resultado, no una persona. |
| D5 | **Elegir** los premios es de quien diseña insignias (`private.can_badges`). **Entregar** es de un admin de la liga o de quien diseña (`is_admin or can_badges`). | Respeta la política del dueño (`badge_makers`): con «Solo yo», solo él decide qué insignia se da. Entregar es mecánico, porque lo decide el resultado, así que cualquier admin que lleve el torneo lo puede hacer. Con la política por defecto (`'admins'`) un admin hace las dos cosas. |
| D6 | `a_si_mismo` aplica **solo** donde el servidor no verifica el orden (golf, natación, noches). | Donde el servidor calcula el podio, incluirse no es trampa. Donde no lo calcula, es la misma regla del creador: «pídele a otro admin o al dueño». |
| D7 | Las correcciones valen **14 días** desde la primera entrega de cada lugar, o hasta que un admin toque «Cerrar premios». El dueño corrige siempre. | Es tiempo de sobra para verificar juegos pendientes o corregir una final. Después, el premio no cambia en silencio. |
| D8 | En el boliche, «equipos por scratch, individual por handicap» **ya es** el valor por defecto en todas partes (§5.1). Aquí se hace visible en los títulos y se junta en un solo lugar (`teamValue`). | No hace falta migrar datos ni cambiar `create_event`. |
| D9 | Las insignias automáticas (`event_podium`, `bowling_team_win`…) **siguen como están** y conviven con el premio de la liga. | Son de otra tabla y otra lista del perfil, y tienen sus propias reglas contra abusos. Ver §8. |

**Fuera de esta entrega:** premios por categoría de promedio en el boliche (A/B/C/D); escalera, cajas y liga de
parejas de raqueta (no tienen final: su cierre es `close_season`); premios por serie en natación (ya existe la
automática `swim_medal`); premios de temporada (siguen en `close_season`/`season_awards`); relámpago dentro de una liga
normal (el `TournamentHub` solo existe en `kind='torneo'`, y esos partidos no tienen `event_id`); anuncio en la liga
al entregar; entrega automática sin que un admin confirme.

---

## 2. Lo que ya existe y lo que se reusa

- **Creador de insignias** (`20260929001120_insignias_creador.sql`, `docs/insignias.md` §5): los diseños
  (`league_badges`, bloqueados después de darse), los otorgamientos (`league_badge_awards`), el filtro de texto
  (`private.badge_text_ok`), el push `'¡Tienes una insignia nueva!'` y el tiempo real `badges` por
  `league:<liga>`/`user:<cuenta>` (`private.emit_league_badges`).
- **Plantillas** (`src/components/badges/maker/templates.ts`): `champion`, `runner_up` y `third_place` tienen
  `tournament: true`. `templateDraft(key, sport, 'torneo')` (`design.ts`) arma el nombre, «TORNEO» arriba y el metal.
- **Podios que ya se calculan:**
  - boliche: `entryLine`, `teamLines`, `rank` e `individualValue`, en `src/lib/stats.ts`;
  - raqueta: `categoryBracket`, `winnerId` y `matchAt` (`racket/logic/tourney.ts`), `nightTable` (`logic/night.ts`)
    y `socialTable` (`pickleball/social/logic.ts`);
  - equipos: `knockoutPodium` (`football/seasonTable.ts`), `playoffPodium` (`team/playoffs.ts`) y
    `tournamentPlayers` (`badges/evaluators/team.ts`);
  - golf: `roundBoard`, `tournamentBoard` y `modeCompetition` (`golf/logic.ts`);
  - natación: `meetScores`, `placeResults` y `teamPoints`.
- **Cuándo un resultado es final:** `private.match_final` y `isFinal` (48 h o confirmado), `golf_rounds.status =
  'cerrada'`, `swim_meets.finalized_at` y `playoffs.status = 'finished'`.

---

## 3. Modelo de datos (`20260929001200_premios_torneo.sql`)

### 3.1 `public.tournament_prizes`: la premiación de una competencia

```sql
create table public.tournament_prizes (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  -- De qué competencia: un evento (boliche, raqueta, golf de una ronda, natación, el evento del torneo relámpago),
  -- un torneo de golf de varias rondas o un playoff. Exactamente una referencia, según scope.
  scope text not null check (scope in ('evento', 'golf_torneo', 'playoff')),
  event_id uuid,
  golf_tournament_id uuid,
  playoff_id uuid,
  -- La cinta de las insignias que se entregan (≤ 10, como league_badge_awards.period). Por defecto, el mes del torneo
  -- («OCT 2026»); se puede cambiar mientras no se haya entregado nada.
  period text not null default '' check (char_length(period) <= 10),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  foreign key (golf_tournament_id, league_id) references public.golf_tournaments (id, league_id) on delete cascade,
  foreign key (playoff_id, league_id) references public.playoffs (id, league_id) on delete cascade,
  check ((scope = 'evento') = (event_id is not null)),
  check ((scope = 'golf_torneo') = (golf_tournament_id is not null)),
  check ((scope = 'playoff') = (playoff_id is not null)),
  unique (id, league_id)
);
-- Una premiación por competencia (reintentar «crear» cae en la misma fila).
create unique index tournament_prizes_one on public.tournament_prizes (coalesce(event_id, golf_tournament_id, playoff_id));
create index tournament_prizes_sync_idx on public.tournament_prizes (league_id, updated_at);
```

### 3.2 `public.tournament_prize_slots`: un lugar premiado

```sql
create table public.tournament_prize_slots (
  id uuid primary key default gen_random_uuid(),
  prize_id uuid not null,
  league_id uuid not null,
  category text not null check (category in ('equipo', 'individual', 'pareja')),
  -- Subdivisión: '' general; raqueta = id de la categoría del torneo ('A'…'H'); natación individual 'F' | 'M';
  -- golf '' (competencia oficial) | 'gross' | 'neto'.
  division text not null default '' check (division ~ '^[A-Za-z0-9_]{0,24}$'),
  -- Lo que se copia a league_badge_awards.division (≤ 16): nombre de la categoría («Cat. A»), «Femenino», «Gross»…
  label text not null default '' check (char_length(label) <= 16),
  place smallint not null check (place between 1 and 3),
  badge_id uuid not null,
  -- Foto de quién lo ganó (para mostrar sin leer otorgamientos): [{ref, name}] (≤ 3: empates o semifinalistas).
  winners jsonb not null default '[]' check (jsonb_typeof(winners) = 'array' and pg_column_size(winners) < 4096),
  -- true = el servidor comprobó el orden al entregar (boliche, cuadros, playoffs). Para mostrar: badge_link_guard lee
  -- league_badge_awards.prize_verified (§3.3), porque este lugar se borra con la competencia.
  verified boolean not null default false,
  delivered_at timestamptz,          -- primera entrega (desde aquí corren los 14 días)
  delivered_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (prize_id, league_id) references public.tournament_prizes (id, league_id) on delete cascade,
  -- Un diseño solo se borra si nunca se dio; si se borra antes de entregar, el lugar se va con él.
  foreign key (badge_id, league_id) references public.league_badges (id, league_id) on delete cascade,
  unique (prize_id, category, division, place)
);
create index tournament_prize_slots_sync_idx on public.tournament_prize_slots (league_id, updated_at);
create index tournament_prize_slots_badge_idx on public.tournament_prize_slots (badge_id);
```

**Ninguna tabla nueva tiene FK a `players`.** Quién ganó está en los otorgamientos, que `merge_badges` ya mueve. Por
eso no se dispara el guardia del catálogo de `merge_players_base` (`20260929000700_temporadas.sql:668-682`).
`winners[].ref` es solo para mostrar, y puede quedar viejo después de una fusión: nada se decide con él (§4.3).

Refs de unidad (texto opaco, ≤ 80): `t:<teams.id>` (equipo del evento de boliche, equipo o pareja de temporada),
`p:<players.id>`, `c:<swim_clubs.id>` y `s:<match_id>:<lado>` (lado de raqueta armado solo con jugadores).

### 3.3 Cambios en `league_badge_awards`

```sql
-- De qué lugar premiado salió (null = la dio una persona con award_league_badge). Sin FK: si el torneo se borra, la
-- insignia se queda (es historia) y la columna conserva el id para que el índice único siga igual.
alter table public.league_badge_awards add column prize_slot_id uuid;
-- El servidor comprobó el orden (boliche, cuadros, relámpago, playoffs). Va en el otorgamiento, no en el lugar: si la
-- competencia se borra, el lugar se va con ella y la insignia se queda, y badge_link_guard la tiene que seguir respetando.
alter table public.league_badge_awards add column prize_verified boolean not null default false;
create index league_badge_awards_prize_idx on public.league_badge_awards (prize_slot_id) where prize_slot_id is not null;

-- Una vigente por insignia, jugador, periodo, división… y lugar premiado: el mismo «Campeón · OCT 2026» se puede
-- ganar en dos torneos del mes, o por equipos y en individual del mismo torneo.
drop index public.league_badge_awards_once;
create unique index league_badge_awards_once on public.league_badge_awards
  (badge_id, player_id, private.badge_slot_key(period), private.badge_slot_key(division),
   coalesce(prize_slot_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;

grant select (prize_slot_id) on public.league_badge_awards to anon, authenticated;
```

Nada del repo nombra `league_badge_awards_once` fuera de `…1120` (no hay `on conflict on constraint`). Con
`prize_slot_id` null, la clave es la misma de antes.

### 3.4 RLS, tombstones y tiempo real

- **Lectura** (solo `select`; se escribe solo por RPC): para las dos tablas, `using (league_id in (select
  private.readable_leagues()))` a `anon, authenticated`. El jugador necesita ver «El campeón se lleva…» aunque la
  liga sea pública y no tenga sesión. No hay columnas privadas.
- **Tombstones:** `after delete … private.tombstone('id')` en las dos tablas (el patrón de `league_badges`).
  `touch_updated_at` en las dos.
- **Tiempo real:** un trigger por sentencia en las dos tablas manda `private.emit('league:<liga>', 'badges', {op,
  ids, kind: 'premio'})`. `topics.ts:69` ya invalida `badges:l:<liga>` con cualquier `badges`, así que la etiqueta
  del cliente es `badgeTags.league(lid)` y no hace falta tocar `topics.ts`. Los otorgamientos avisan solos
  (`emit_league_badges`). Al borrar una liga no se avisa nada (`private.deleting`).

### 3.5 Funciones que se redefinen (misma firma, cuerpo copiado de `…1120` con el cambio)

| Función | Cambio |
|---|---|
| `public.award_league_badge` | Las cuentas de `duplicado`, `cupo_lleno`, `limite: jugador`, `limite: liga` y `rate_limited` suman solo `a.prize_slot_id is null`. Un premio de torneo no le quita cupo a los regalos, y un regalo no choca con un premio. |
| `private.merge_badges` | Al comparar choques de `league_badge_awards` se agrega `and o.prize_slot_id is not distinct from f.prize_slot_id`. Si hay dos premios de lugares distintos se quedan los dos; si es el mismo lugar, se retira el más nuevo con `'fusión'`, como hoy. |
| `private.badge_link_guard` | No retira los premios con el orden verificado: `and not a.prize_verified` (la marca va en el otorgamiento: sigue valiendo aunque después se borre la competencia). Sin este cambio, juntar el jugador de un admin con un invitado duplicado le quitaría el premio que ganó de verdad, porque `awarded_by` es su cuenta. En golf, natación y noches la regla sigue igual (D6). |
| `public.revoke_league_badge_award` | Un premio de una premiación cerrada, o de un lugar entregado hace más de 14 días, solo lo quita el dueño (`cerrado`): la misma regla que `deliver_tournament_prizes` (D7). Si no, «Deshacer» (quien la dio, en 24 h) corregiría en silencio lo cerrado. Si la competencia se borró, sus reglas de siempre. |

`league_badge_holders`, `profile_badges` y `badge_notices` **no cambian**: un premio es un otorgamiento más.

---

## 4. RPC

Todas son `security definer`, con `search_path = ''`, solo para `authenticated`, y los permisos se dan con el bloque
`do` de siempre (`…1120:1521-1543`). En total son 4 públicas.

### 4.1 `public.set_tournament_prizes(p_league uuid, p_scope text, p_ref uuid, p_period text, p_slots jsonb) returns jsonb`

Guarda **el conjunto completo** de lugares premiados de una competencia. Crea la premiación si no existe, porque la
competencia es única. Por eso es idempotente y reintentar no duplica nada.

- `p_slots = [{category, division?, label?, place, badge_id}]`, 0 a 24 lugares. Un lugar que no viene se borra, si
  todavía no se entregó. `[]` sin nada entregado borra la premiación.
- Permiso: `private.can_badges(p_league)` (D5). Los errores posibles están en §4.6.
- Validaciones:
  - la competencia es de la liga y admite premios (`private.prize_allowed`, tabla de §5);
  - cada `badge_id` es un diseño `'activa'` de la liga (si no, `no_activa` o `no_existe`);
  - `category` y `division` están permitidas para esa competencia (si no, `invalido`); en raqueta, `division` tiene
    que ser un `id` de `events.config -> 'categories'`;
  - `label` y `p_period` pasan `private.badge_text_ok` y los largos (si no, `texto_bloqueado` o `invalido`);
  - un lugar ya entregado no cambia de insignia ni se borra, y la cinta no cambia si hay algo entregado (si no,
    `ya_entregado`: primero se quita, §4.3);
  - un límite de 30 por cuenta por hora: `private.rate_take(private.rate_key('premios'), 30, '1 hour')`.
- Devuelve `private.prize_json(id)`:
  `{id, leagueId, scope, refId, period, closedAt, slots: [{id, category, division, label, place, badgeId, winners,
  verified, deliveredAt}]}`.

### 4.2 `public.tournament_podium(p_prize uuid) returns jsonb`

La vista previa del servidor para «Entregar premios». Pueden llamarla `is_admin or can_badges`.

- Devuelve `{slots: [{slotId, verified, status, units: [{ref, name, teamId, players: [{id, name}]}]}]}`.
- `status` puede ser:
  - `'listo'`;
  - `'vacio'`: nadie en ese lugar, por ejemplo con empate en el 1.º no hay 2.º, o la final fue por W.O. y el 2.º no
    se presentó;
  - `'sin_resultado'`: la competencia o la final todavía no cuenta;
  - `'empate_multiple'`: más de 3 empatados en ese lugar; no se entrega solo;
  - `'telefono'`: el servidor no calcula ese podio; lo arma el teléfono (§5).
- Por dentro llama a `private.prize_server_podium(p_prize)` (§4.5), la misma función que usa la entrega. Lo que se ve
  es lo que se entrega.

### 4.3 `public.deliver_tournament_prizes(p_prize uuid, p_podium jsonb, p_notify boolean default true) returns jsonb`

Entrega o corrige. Trabaja con el **estado deseado**: correrla otra vez con lo mismo no cambia nada.

- `p_podium = [{slot_id, units: [{ref, name, players: [uuid]}]}]` trae solo los lugares que se entregan ahora.
  `units: []` le quita ese premio a quien lo tenga.
- Permiso: `private.is_admin(league) or private.can_badges(league)`. La fila de la premiación se bloquea con
  `for update`.
- **Cerrado:** si `closed_at` no es null, o si el lugar ya tenía `delivered_at` de hace más de 14 días, solo el dueño
  (`private.is_owner`) puede cambiarlo. Los demás reciben `cerrado`.
- **Terminó** (`private.prize_finished(prize, slot)`; si no, `sin_resultado`):
  - boliche: fecha ≤ hoy en la zona de la liga (`private.signup_today`) y al menos un juego verificado. Se puede
    entregar el mismo día, en la premiación;
  - raqueta y relámpago: la final de esa categoría o cuadro cuenta (`match_final`);
  - playoffs: `status = 'finished'`;
  - golf: todas las rondas `'cerrada'`;
  - natación: `finalized_at` no es null;
  - noches: fecha ≤ hoy.
- **Validación de cada lugar:** hasta 3 unidades; cada una con 1 a 30 jugadores de la liga, sin repetir; en total
  hasta 300 jugadores por llamada.
  - **Con orden verificado** (boliche, cuadros, playoffs): los `ref` que llegan tienen que ser exactamente los que
    `prize_server_podium` da para ese lugar, y los jugadores de cada unidad un subconjunto de los del servidor (el
    admin puede desmarcar, nunca agregar). Si no, `podio_cambio`. El lugar queda con `verified = true`.
  - **Sin orden verificado** (golf, natación, noches): cada jugador tiene que haber jugado
    (`private.prize_unit_players(prize, ref)`, §4.5). `p:<id>` solo con ese jugador, y `c:<club>` solo con nadadores
    de ese club en el encuentro. Si no, `invalido`. Si hay un jugador de la cuenta que llama, `a_si_mismo`.
  - El diseño tiene que seguir `'activa'` para dar insignias nuevas (`no_activa`). Para quitar no hace falta.
- **Aplicar** (por cada lugar):
  1. Lo vigente son los `league_badge_awards` con `prize_slot_id = slot` y `revoked_at is null`. Lo deseado es la
     unión de los jugadores de las unidades.
  2. A quien sobra se le retira: `revoked_at = now()`, `revoked_by = auth.uid()`, `revoke_reason = 'Corrección del
     podio'`. Se borra su push pendiente (`push_outbox` con `tag 'insignia:<id>'`, sin enviar), como en
     `revoke_league_badge_award`.
  3. A quien falta se le da: `insert into league_badge_awards (badge_id = slot.badge_id, league_id, player_id,
     team_id = <id de t:…>, period = prize.period, division = slot.label, note, awarded_by = auth.uid(),
     prize_slot_id = slot.id)`.
     - La nota se arma en el servidor: `'1.er lugar · Individual (handicap) · Torneo Aniversario'`, con
       `private.prize_slot_title(slot)` y el nombre de la competencia (el del evento; si está vacío, «Torneo del 12
       oct»), ≤ 140.
     - `team_id` hace que el perfil muestre el equipo (`league_award_json.teamName`). Esto vale también para los
       equipos de un evento de boliche: la FK `(team_id, league_id)` apunta a `teams` y los acepta.
  4. `winners` pasa a ser `[{ref, name}]`. En la primera entrega se llenan `delivered_at` y `delivered_by`.
- **Idempotencia:** se compara el conjunto de jugadores, no el `ref` (un `ref` de jugador puede cambiar con una
  fusión). Si el dueño retiró a mano el premio de alguien, en la vista previa ese jugador sale desmarcado (§6.3), y
  volver a entregar no se lo devuelve salvo que el admin lo marque.
- **Push:** si `p_notify` es true, uno por cada otorgamiento nuevo (§7). Las correcciones que retiran no avisan.
- **Límite:** `private.rate_take(private.rate_key('premios'), 30, '1 hour')`, compartido con §4.1.
- **Devuelve:** `{added, revoked, unchanged, notified, prize: prize_json}`.

### 4.4 `public.close_tournament_prizes(p_prize uuid) returns void`

Un admin (`is_admin or can_badges`) cierra antes de los 14 días. Pone `closed_at` y `closed_by`. Si ya estaba
cerrada, no hace nada. No se reabre: el dueño corrige igual (D7).

### 4.5 Ayudas privadas (sin permiso para la app)

**`private.prize_allowed(p_league, p_scope, p_ref) returns table (category text, division text)`**

Las categorías que admite cada competencia (§5). Se revisa al guardar.

**`private.prize_slot_title(s tournament_prize_slots) returns text`**

- Boliche: «Equipos (scratch)» o «Equipos (handicap)», e «Individual (…)», según la regla **efectiva** del evento
  (§5.1).
- Raqueta: «Parejas · Cat. A» o «Individual · Cat. A».
- Equipos: «Equipos».
- Golf: «Individual», «Individual · Gross» o «Individual · Neto».
- Natación: «Clubes», «Individual», «Individual · Femenino» o «Individual · Masculino».
- El cliente tiene el mismo texto en `prizeTitle()` (§9), con una prueba que los compara.

**`private.prize_bowling_lines(p_event uuid) returns table (player_id uuid, team_id uuid, games int, scratch int, total int)`**

Es `entryLine` de `stats.ts` en SQL: solo cuentan los juegos con puntaje **y** foto. Se calcula en el mismo orden que
el JS, para que el redondeo dé igual.

```sql
select en.player_id, en.team_id, c.games, c.scratch, c.scratch + c.games * h.hcp
  from public.entries en
  join public.events ev on ev.id = en.event_id
  cross join lateral (select case when ev.type <> 'torneo' then 0
                                  when en.handicap_override is not null then en.handicap_override::integer
                                  when coalesce(en.average, 0) = 0 or ev.hcp_percent <= 0 then 0
                                  else greatest(0, floor(((ev.hcp_base - en.average) * ev.hcp_percent) / 100::float8))::integer
                             end as hcp) h
  cross join lateral (select count(*)::integer as games, coalesce(sum(en.scores[i]), 0)::integer as scratch
                        from generate_series(1, ev.games) i
                       where en.scores[i] is not null and en.photos[i] is not null) c
 where en.event_id = p_event and c.games > 0
```

**`private.prize_server_podium(p_prize uuid) returns table (slot_id uuid, status text, units jsonb)`**

Los podios que calcula el servidor. Todos usan ranking de competición (`rank() over (… desc)`, como `rank()` de
`stats.ts`: 1, 2, 2, 4).

- **Boliche:**
  - Individual: ordena por `total` si `ev.type = 'torneo' and ev.hcp_percent > 0 and coalesce(ev.individual_rank_by,
    'hcp') = 'hcp'`; si no, por `scratch`.
  - Equipos: los `teams` del evento (`t.event_id = ev.id`) con sus líneas (`entries.team_id`). Ordena por
    `sum(total)` si `ev.hcp_percent > 0 and coalesce(ev.team_rank_by, 'scratch') = 'hcp'`; si no, por
    `sum(scratch)`.
  - Los jugadores de un equipo son los que tienen juegos verificados. Es igual que `teamLines`: los inscritos que
    no jugaron no reciben.
- **Raqueta, torneo por categorías:**
  - La final es `<cat>-R<máx>-1` entre los partidos del evento que no están anulados. El 1.º es el lado ganador
    (`winner_side`, o el contrario de `walkover_side`) y el 2.º el perdedor. Si la final fue por W.O., el 2.º queda
    `'vacio'`.
  - El 3.º es el ganador de `<cat>-P3` si se jugó sin W.O. Si no hay P3, son los dos perdedores de
    `<cat>-R<máx-1>-1|2` (sin W.O.). Es lo mismo que `racketTourneyPodium`, sin sus mínimos de inscritos.
  - Jugadores: los de `match_players` de ese lado; si no hay, la plantilla de `match_sides.team_id` que ya estaba
    cuando quedó el resultado de ese partido.
- **Relámpago** (el evento del torneo de una liga `kind='torneo'` de la familia equipos: el primero de tipo `torneo`
  de la liga; otro evento no tiene premio propio, porque el podio sale de toda la liga y premiaría otra vez al mismo
  campeón):
  - Usa los partidos **de la liga** con `bracket_key ~ '^R\d+-\d+$'`, `series_id is null` y sin anular. La final es
    el único partido de la ronda más alta; el 3.º, el ganador de `P3`. Es lo mismo que `knockoutPodium`.
  - Jugadores: los que aparecieron en `match_players` de su lado en esos partidos que cuentan (`played: true`) más
    `team_players` del equipo, pero solo quien ya estaba cuando quedó el resultado del último partido del equipo
    (propuesto o confirmado, lo primero; `played: false`). Entrar al campeón después de la final no da el premio.
- **Playoff:**
  - 1.º `playoffs.winner` y 2.º el rival en la serie final (`next_series is null`), solo con `status =
    'finished'`.
  - 3.º los perdedores de las series de la ronda anterior, hasta 2. Es lo mismo que `league_seasons.semifinalists`.
  - Jugadores: igual que en el relámpago, con los partidos del playoff (`matches.series_id`).
- **Golf, natación y noches:** una fila por lugar con `status = 'telefono'`.

**`private.prize_unit_players(p_prize uuid, p_ref text) returns uuid[]`**

Quiénes pueden recibir en una competencia sin orden verificado:

- golf: `golf_cards` no descalificadas del evento, o de cualquier ronda del torneo;
- natación: `swim_entries` con `status = 'ok'` en las series del encuentro; para `c:` además con ese `club_id`;
- noches: `match_players` de los partidos del evento que no están anulados.

**`private.prize_finished(p_prize uuid, p_slot uuid) returns boolean`** y **`private.prize_json(p_id uuid)
returns jsonb`**.

Todas van en `v_private` del bloque de permisos: se les quita el `execute` a `public`, `anon` y `authenticated`.

### 4.6 Errores (y lo que dice el teléfono: `prizeErrorText` en `src/lib/data/tournamentPrizes.ts`)

| Código | Texto |
|---|---|
| `no_existe` | «Ese torneo o esa insignia ya no existe.» |
| `no_permitido` | «No tienes permiso para esto.» |
| `invalido` | «Revisa los premios: algo no corresponde a este torneo.» |
| `no_activa` | «Esa insignia está archivada. Actívala o elige otra.» |
| `texto_bloqueado` | «Ese texto no se puede usar.» |
| `ya_entregado` | «Ese premio ya se entregó. Quítalo primero para cambiarlo.» |
| `sin_resultado` | «Todavía no hay resultado final para ese premio.» |
| `podio_cambio` | «El podio cambió mientras mirabas. Vuelve a cargarlo.» |
| `a_si_mismo` | «Estás en ese podio. Pídele a otro admin o al dueño que entregue ese premio.» |
| `cerrado` | «Los premios de este torneo ya se cerraron. Solo el dueño puede corregirlos.» |
| `rate_limited` | «Demasiados cambios seguidos. Prueba en un rato.» |

---

## 5. El podio de cada deporte

| Deporte y competencia | `scope` | Categorías (`division`) | Unidad | Orden | Cuándo se entrega |
|---|---|---|---|---|---|
| Boliche, evento `torneo` (liga o torneo suelto) | `evento` | `equipo` (solo si el evento tiene equipos) e `individual` | equipo del evento / jugador | servidor | desde el día del torneo |
| Raqueta, torneo por categorías (`type='torneo'`, `TourneyConfig`) | `evento` | `pareja` (dobles) o `individual` (singles) por categoría (`division` = `cat.id`, `label` = `cat.name`) | pareja o jugador | servidor | cuando cuenta la final de la categoría |
| Raqueta, noche americano o mexicano y social de pickleball | `evento` | `individual` | jugador | teléfono (`nightTable`, `socialTable`: los 3 primeros con `played > 0`) | desde el día del evento (la pantalla sugiere esperar a `cfg.closed`) |
| Baloncesto, fútbol y futsal: torneo relámpago (liga `kind='torneo'`) | `evento` | `equipo` | equipo | servidor | cuando cuenta la final |
| Baloncesto, fútbol y futsal: playoffs | `playoff` | `equipo` | equipo | servidor | `status='finished'` |
| Golf, ronda suelta (`ronda` o `torneo` de una ronda) | `evento` | `individual` con `''` (la competencia de la ronda), `gross` y `neto` | jugador | teléfono (`roundBoard` + `modeCompetition`; `rank` null no entra) | ronda cerrada |
| Golf, torneo de varias rondas | `golf_torneo` | igual | jugador | teléfono (`tournamentBoard`) | todas las rondas cerradas |
| Natación, encuentro (`encuentro` o `torneo`; `control` no) | `evento` | `equipo` (club, por `teamPoints`) e `individual` con `''`, `F` y `M` | club / nadador | teléfono | encuentro finalizado |

### 5.1 Boliche: equipos por scratch, individual por handicap

**Ya es el valor por defecto; no cambia nada en la base.** La regla se aplica en estos lugares:

| Dónde | Cómo |
|---|---|
| Formulario (torneo nuevo) | `EventFormModal.tsx` `defaults('torneo')`: `individualRankBy: 'hcp'` y `teamRankBy: 'scratch'` (230/80 %, equipos de 3). |
| Torneo suelto | `create_tournament` (`rpc.sql:194-195`): `'hcp'` y `'scratch'`. |
| Eventos viejos con null | `individualValue` usa `?? 'hcp'` y el nuevo `teamValue` usa `?? 'scratch'` (`stats.ts`). En SQL: `coalesce(individual_rank_by, 'hcp')` y `coalesce(team_rank_by, 'scratch')` (§4.5). |
| Editable por evento | Los dos Select de «Configurar» (`EventFormModal.tsx:138-149`) y `update_event` no cambian. |

La regla **efectiva** es la que muestran los títulos y usa el podio. Con `hcp_percent = 0` no hay handicap, así que
el individual queda «Individual (scratch)» aunque la regla diga `hcp`. Así funciona hoy `individualValue`.

Cambios de cliente para que se **vea**, sin cambiar el orden de nada:

- **`src/lib/stats.ts`:**
  - `individualRule(event): RankBy` y `teamRule(event): RankBy` devuelven la regla efectiva;
  - `teamValue(event)` es la gemela de `individualValue`;
  - `bowlingStandings(event, entries): {teams: {row: TeamLine; pos}[]; individual: {row: Line; pos}[]}` usa solo los
    juegos verificados (`includeDrafts = false`) y los equipos con miembros. Es lo que hoy se calcula por separado en
    `StandingsTab`.
  - Con esto se quitan las cuatro copias de la regla de equipos y las dos de la individual (`StandingsTab.tsx:53-57`,
    `exportExcel.ts:21-23,44-47`, `badges/evaluators/bowling.ts:423-424`).
- **`StandingsTab.tsx`:** los títulos pasan a «Equipos (scratch)» / «Equipos (handicap)» e «Individual (handicap)» /
  «Individual (scratch)», según el modo que se está viendo. El aviso «(no es el criterio oficial del torneo)» sigue
  igual.
  - Ortografía: la pantalla del boliche escribe «handicap» sin tilde («Con handicap», 15 lugares). Se mantiene para
    no mezclar en la misma pantalla.
- **`GamesTab.tsx:150-152`:** el «Total» del encabezado de cada equipo hoy siempre suma el handicap. Con la regla de
  equipos en scratch, el número principal pasa a ser el scratch y el total con handicap queda en gris al lado («con
  hcp 1 812»). Con la regla en handicap, se queda como hoy.
- **`EventFormModal.tsx`**, debajo de los dos Select:
  - una línea: «Los premios siguen esta regla: Equipos por scratch, Individual con handicap.», armada con los valores
    elegidos;
  - con 0 % y la regla individual en handicap: «Con 0 % de handicap, el individual queda por scratch.»

### 5.2 Raqueta

- **Torneo por categorías.** Cada categoría tiene sus lugares, con `division = cat.id` y `label = cat.name`, recortado
  a 16. Si la liga es de dobles (`useRacket().doubles`) la categoría es `pareja`; si no, `individual`.
  - La vista previa es la del servidor (§4.5). En pantalla coincide con `podium(categoryBracket(...))`, que
    `TourneyPage.tsx:403` ya muestra.
  - Con una pareja de temporada (`t:`), `team_id` queda en el otorgamiento. Con un lado sin pareja (`s:`), no.
- **Noches y social de pickleball.** Solo individual, sin cuadro. El teléfono toma `nightTable(cfg, rounds)` o
  `socialTable(people, rounds)` y arma `p:<id>` con `rank` ≤ 3 y `played > 0`. Si hay más de 3 empatados en un
  lugar, queda `empate_multiple`.
- **Fuera:** escalera, cajas y liga de parejas.

### 5.3 Equipos

- **Relámpago:** el premio cuelga del **evento del torneo suelto**, porque `create_tournament` siempre crea uno (el
  primero de tipo `torneo` de la liga, `koEventOf`; se entre por donde se entre, la tarjeta es la de ese evento). El
  podio sale de los partidos de la liga (`event_id` null), igual que `TournamentHub`.
  - En la pantalla, los jugadores marcados por defecto son los que aparecieron en algún partido (`match_players` del
    lado del equipo). Si el torneo no tiene alineaciones, es la plantilla, como `tournamentPlayers`.
- **Playoffs:** `scope='playoff'`. La tarjeta va en `PlayoffsPage.tsx`, en cada playoff.

### 5.4 Golf

- Solo individual. La división `''` es la competencia oficial de la ronda (`golf_rounds.competition`); `gross` y `neto`
  salen de `modeCompetition(comp, 'gross' | 'net')`.
- Si la ronda es parte de un torneo (`round.tournamentId`), el premio es del torneo (`golf_torneo`) y la tarjeta
  sale en cada ronda con el tablero del torneo. No se ofrece premio por ronda suelta dentro de un torneo.

### 5.5 Natación

- **Club del encuentro (`equipo`):** es el `teamPoints` de `meetScores(...)`. `c:<club>` va a los nadadores de ese
  club que nadaron. `team_id` queda null, porque los clubes no son `teams`, y `label` queda vacío.
- **Nadador del encuentro (`individual`):** es una función nueva, `swimmerPoints(events, entries, table)` en
  `src/sports/swimming/results.ts`, hermana de `teamPoints`. Suma los puntos de `placeResults` por nadador y
  desempata por más oros y luego más platas; si sigue empatado, comparten el lugar.
  - División `F` o `M`: sale de `swim_events.gender` de las series que nadó (todas F → F, todas M → M; las X no
    cuentan). No se usa el sexo de `player_private`, que es privado.

---

## 6. Pantallas

### 6.1 Tarjeta «Premios» (`src/components/prizes/PrizesCard.tsx`): la ven todos

Se pone en cada pantalla de torneo (§6.4). Lee `useTournamentPrize(lid, scope, refId)` y los diseños de
`useLeagueBadges(lid)`.

| Estado | Jugador | Admin (o quien diseña) |
|---|---|---|
| Sin premios | nada | «Premios del torneo»: «Elige qué insignia se lleva el campeón.» [Elegir premios] (solo con `canMakeBadges`) |
| Elegidos, sin entregar | «El campeón se lleva…»: por cada categoría («Equipos (scratch)», «Individual (handicap)»), la insignia del 1.º grande y las del 2.º y 3.º chicas, con la cinta del torneo. Tocar una abre la vista de la insignia. | Lo mismo, más [Cambiar premios] y [Entregar premios]. Si el torneo no terminó, el botón dice «Se entregan cuando termine el torneo» y está apagado. |
| Entregados | «Campeones»: por lugar, la insignia y quién la ganó («Los Strikers · Ana, Luis, Pedro»). Tocar abre el jugador. Un lugar que se quitó entero vuelve a estar sin entregar. | Lo mismo, más «Puedes corregir hasta el 13 oct» (el próximo vencimiento, lugar por lugar: un lugar sin entregar se entrega aunque otro ya pasó sus 14 días), [Revisar premios] y [Cerrar premios]. Si el podio del servidor ya no coincide con lo entregado, sale un aviso: «El podio cambió: revisa los premios.» |
| Cerrados | igual | «Premios cerrados» (el dueño sigue viendo [Revisar premios]) |

Si el superadmin escondió un diseño (`'oculta'`), su lugar no se muestra a los jugadores.

### 6.2 Elegir premios (`PrizeSetupSheet.tsx`)

- Una sección por categoría de `prizeCategories(comp)` (§9), con el título de `prizeTitle`. En el boliche viene
  «Equipos (scratch)» (si el evento tiene equipos o `teamSize > 0`) e «Individual (handicap)». Cada sección tiene tres
  filas: «1.er lugar», «2.º lugar» y «3.er lugar». El 1.º viene prendido; el 2.º y el 3.º, apagados.
- Cada fila tiene un selector de insignia (`PrizeBadgePicker.tsx`).
  - Muestra los diseños `'activa'` de la liga. Arriba van los de plantilla `champion`, `runner_up` y `third_place`,
    en ese orden según el lugar.
  - [Crear «Campeón»] guarda en el momento `draftPayload(templateDraft(key, sport, 'torneo'))` con `periodMode:
    'none'`. Así el diseño sirve para todos los torneos, porque la cinta la pone cada premio. Luego lo selecciona.
  - [Diseñar otra] abre el editor de siempre (`useMaker`/`MakerModals`).
- Atajo: «Usar Campeón, Subcampeón y Tercer lugar» llena todo con los diseños de plantilla que ya existen y crea los
  que faltan (cuenta para los 30 activos).
- «Cinta de las insignias»: el mes del torneo (`periodRibbon({kind: 'month'})`, «OCT 2026»), editable, ≤ 10.
- Guardar llama a `set_tournament_prizes` con todo el conjunto.

### 6.3 Entregar premios (`DeliverPrizesSheet.tsx`)

1. **Carga el podio.** Llama a `tournament_podium(prize)`. En los lugares con `status 'telefono'` usa el proveedor
   del deporte (§5 y §9).
2. **Muestra cada lugar.** Por lugar se ve la insignia, «1.er lugar · Individual (handicap)», la unidad y sus
   jugadores con casillas: marcados por defecto; desmarcados los que el dueño les retiró el premio a mano. Avisos:
   - «Empate: se la llevan los dos.» (en un cuadro, el 3.º con dos unidades: «Se la llevan los dos semifinalistas.»)
   - «Nadie: empate en el 1.er lugar.» (`vacio`)
   - «Todavía sin resultado final.» (`sin_resultado`)
   - «Más de 3 empatados: no se entrega sola.»
   - Boliche: «Hay 3 juegos por verificar: pueden cambiar el podio.» Usa el `pending` de `entryLine`. No bloquea:
     se puede corregir después.
   - Sin orden verificado, si un jugador es el de quien entrega: «Estás en este podio: lo entrega otro admin o el
     dueño.» Ese lugar va apagado y no se envía.
3. **Con algo ya entregado,** se ve la diferencia: «Antes: Ana → Ahora: Luis». El botón pasa a ser «Corregir».
4. **Envía.** El interruptor «Avisar a los ganadores» (prendido) es `p_notify`. [Entregar] llama a
   `deliver_tournament_prizes`. El toast dice «Entregaste 3 premios a 8 jugadores. Les avisamos.» o «No había nada
   que cambiar.»

Necesita conexión: no entra en la cola sin conexión. Si llega `podio_cambio`, recarga el podio y lo muestra otra vez.

### 6.4 Dónde va la tarjeta en cada deporte

| Deporte | Archivo | Lugar |
|---|---|---|
| Boliche | `src/pages/EventPage.tsx` | Antes de `<EventBadges>` (`:290`) y de las pestañas, con o sin `upcoming`: se ve desde que se crea el torneo. Solo `isTorneo`. |
| Raqueta, torneo | `src/pages/sports/racket/tourney/TourneyPage.tsx` | Una tarjeta arriba (todas las categorías). En cada categoría, junto al podio de `:403`, la línea «Se lleva: [insignia]». |
| Raqueta, noche | `src/pages/sports/racket/night/NightPage.tsx` | Junto al `Podium` de la tabla. |
| Pickleball social | `src/pages/sports/pickleball/social/SocialPage.tsx` | Junto a la tabla. |
| Equipos, relámpago | `src/pages/sports/team/TournamentHub.tsx` | Arriba, con el `eventId` del torneo suelto (lo pasan `BasketballEvent` y `FootballEvent`; futsal usa las de fútbol). |
| Equipos, playoffs | `src/pages/sports/team/PlayoffsPage.tsx` | En cada playoff. |
| Golf | `src/pages/sports/golf/GolfEvent.tsx` (ronda) y el tablero del torneo (`GolfBoard.tsx`) | Arriba del tablero. |
| Natación | `src/pages/sports/swimming/MeetPage.tsx` | Arriba de las pestañas; la entrega se abre desde la pestaña de resultados cuando hay `finalizedAt`. |

### 6.5 El creador de insignias no se confunde

- `AWARD_COLUMNS` (`leagueBadges.ts:319`) suma `prize_slot_id`, y `MadeAward` tiene `prizeSlotId: string | null`.
- `unitsTaken`, `quotaLeft` (`design.ts`) y el aviso de duplicado de `GiveBadge.tsx:74,106` ignoran los premios. Así
  el teléfono cuenta igual que el servidor (§3.5).
- En «Quién la tiene» (`DesignSheet.tsx:291`) un premio dice «Premio del torneo» al lado. Se sabe por
  `prizeSlotId` en los otorgamientos que ya se leen.
- Un diseño que se usó en un premio queda `locked`, como cualquiera que se dio.

---

## 7. Avisos

Se usa el mismo camino que `award_league_badge`, sin nada nuevo en push ni en la app:

- **Push:** uno por otorgamiento nuevo. Solo a jugadores con cuenta no bloqueada, y nunca en ligas con menores
  (`has_minors`).
  - Título: `'¡Tienes una insignia nueva!'`.
  - Cuerpo: `'<Liga>: te llevas “<insignia>” por el 1.er lugar en <torneo>. Tócala para verla.'` (≤ 1000).
  - `url '/u/<cuenta>?tab=insignias'`, `tag 'insignia:<otorgamiento>'`. Con ese tag, `private.push_category` lo pone
    en `social` y respeta las preferencias, y al retirar se puede quitar de la cola. `ttl 86400`, `urgency
    'normal'`, y al final `private.kick_send_push()`.
- **En la app:** `badge_notices.leagueAwards`/`leagueUnseen` ya los trae. `BadgeUnlockHost` abre el `UnlockModal` de
  celebración y el perfil los muestra en el estante de la liga, con la nota «1.er lugar · Individual (handicap) ·
  Torneo Aniversario» (la nota la ven el jugador y los admins).
- **En el perfil de otras cuentas** (`20260929001300_insignias_perfil.sql`): un premio con el orden verificado sale
  para quien ve la liga (sin menores) aunque sea pequeña o nueva, si en su competencia jugaron 2+ cuentas distintas
  (`league_badge_awards.prize_accounts`, que cuenta la base al entregar y se queda aunque se borre la competencia). Si
  jugó una sola cuenta (un torneo armado con jugadores sin cuenta), o el premio no tiene el orden verificado, sigue la
  regla de siempre: 6+ cuentas y 14+ días (docs/insignias.md §5.8).
- **Tiempo real:** `emit_league_badges` avisa por `league:` y por `user:`. Las tablas de premios avisan `badges`
  `kind 'premio'` (§3.4).
- **Corrección:** quien pierde el premio no recibe aviso (igual que «Deshacer»). Quien lo gana recibe el push normal.

---

## 8. Convivencia con las insignias automáticas

- **Se quedan las dos.** Un ganador en una liga (`kind='liga'`) puede tener la oficial «Podio · Primer lugar»
  (`event_podium`, `badge_awards`) y el premio de la liga «Campeón» (`league_badge_awards`). Son tablas distintas y
  listas distintas del perfil (`awards` y `leagueAwards`). El premio de la liga nunca cuenta para la rareza ni los
  rankings. El total del perfil suma las dos listas, pero dice cuántas son de sus ligas («20 de MatchMate · 4 de sus
  ligas») y el premio lleva la marca «LIGA»; en las destacadas que salen solas va primero
  (`20260929001300_insignias_perfil.sql`, docs/insignias.md §6.1).
- **Pueden no coincidir, y está bien.**
  - La automática tiene mínimos: 6 jugadores en el boliche y `podiumLevels` (sin podio con menos de 4).
  - Llega 72 h después en el boliche, y con `require_photo` saca a quien tenga juegos sin verificar.
  - `badge_runs` la corre una sola vez por evento.
  - El premio de la liga sigue la tabla oficial que ven todos en «Clasificación» y se corrige 14 días.
  - Ninguna de las dos lee a la otra.
- **La regla del boliche es la misma en las dos.** `bowlingPodiumFor` usa `individualValue` y `teamWinFor` usa la
  regla de equipos. Con el cambio de §5.1, las dos llaman a los mismos helpers (`individualValue` y `teamValue`).
- **Torneos sueltos (`kind='torneo'`):** no hay `event_podium`; la oficial es `season_podium` («Título del torneo»)
  al cerrar la temporada. El premio de la liga es lo único el mismo día.
- **En la pantalla,** la tarjeta «Premios» (de la liga) va antes de `<EventBadges>` (oficiales) y cada una con su
  título, para que no parezcan dos podios distintos.

---

## 9. Cliente: archivos

| Archivo | Qué |
|---|---|
| `src/lib/data/tournamentPrizes.ts` (nuevo) | Tipos (`TournamentPrize`, `PrizeSlot`, `PrizeScope`, `PrizeCategory`, `PodiumUnit`, `SlotPodium`), `fetchTournamentPrize` (select directo a las dos tablas por `event_id`, `golf_tournament_id` o `playoff_id`), `useTournamentPrize(lid, scope, refId)` (etiquetas `badgeTags.league(lid)` y `tags.league(lid)`), `usePrizeAwards(slotIds)` (admins: otorgamientos con `prize_slot_id`, también los retirados), `setTournamentPrizes`, `fetchTournamentPodium`, `deliverTournamentPrizes`, `closeTournamentPrizes`, `prizeErrorText`. Después de escribir: `invalidate(badgeTags.league(lid))`. |
| `src/prizes/catalog.ts` (nuevo) | `prizeCategories(comp)`, que es la tabla de §5 en TS y la gemela de `private.prize_allowed`. `prizeTitle(slot, comp)`, `PLACE_LABEL` («1.er lugar», «2.º lugar», «3.er lugar») y `defaultPeriod(date, tz)`. |
| `src/prizes/providers.ts` (nuevo) | Podios del teléfono: `golfPodium(board, place)`, `swimPodium(meet, category, division)` y `nightPodium(table)`. Devuelven `SlotPodium`. `bowlingPodium` usa `bowlingStandings` y solo se usa en pruebas de paridad y en el aviso «El podio cambió». |
| `src/prizes/ready.ts` (nuevo) | `prizeReady(comp, slot)`: cuándo se prende «Entregar» (la columna de §5). |
| `src/lib/stats.ts` | `individualRule`, `teamRule`, `teamValue` y `bowlingStandings` (§5.1). |
| `src/sports/swimming/results.ts` | `swimmerPoints` (§5.5). |
| `src/components/prizes/` (nuevo) | `PrizesCard.tsx`, `PrizeSetupSheet.tsx`, `DeliverPrizesSheet.tsx` y `PrizeBadgePicker.tsx`. Usan `<Insignia>` con `leagueLookOf(design, sport, prize.period)`. |
| Pantallas de §6.4 | Montar `<PrizesCard comp={…}/>`. |
| `StandingsTab.tsx`, `GamesTab.tsx`, `EventFormModal.tsx`, `exportExcel.ts`, `badges/evaluators/bowling.ts` | §5.1. |
| `leagueBadges.ts`, `maker/design.ts`, `GiveBadge.tsx`, `DesignSheet.tsx` | §6.5. |
| `docs/insignias.md` | §5.9 nueva, «Premios del torneo», con un enlace a este documento. |
| `supabase/README.md` | Una fila de la migración, las tablas (RLS y tombstones) y las 4 RPC. |

Permisos en el teléfono: para elegir, `canMakeBadges(ctx)`; para entregar, `isAdmin || canMakeBadges(ctx)`.

---

## 10. Pruebas

**SQL: `tests/sql/premios-torneo.test.ts` (nuevo, con `TestDb`/`makeWorld` como `insignias-creador.test.ts`)**

- **Contrato:** las 4 RPC son `security definer`, solo `authenticated` y con `search_path`, y `anon` recibe `42501`
  (`NEW_RPC`). Las ayudas privadas no se pueden llamar. Además se agregan a `RPC_AUTHENTICATED` en
  `tests/sql/seguridad.test.ts`, con el comentario «Premios del torneo».
- **RLS:** un visitante ve los premios de una liga pública; alguien de fuera no ve los de una privada. Se puede leer
  `prize_slot_id`. Borrar el evento borra la premiación y deja los otorgamientos, y quedan los tombstones.
- **Guardar:**
  - Permisos: con la política `'owner'`, un admin sin «Diseña insignias» recibe `no_permitido`; con `'chosen'`, un
    miembro marcado sí puede.
  - Validaciones: diseño de otra liga → `no_existe`; archivado → `no_activa`; categoría que no corresponde (por
    ejemplo `pareja` en boliche, o una categoría de raqueta que no está en `config`) → `invalido`; más de 24 lugares
    → `invalido`; cinta con palabra bloqueada → `texto_bloqueado`.
  - Reemplaza el conjunto completo, y un lugar entregado no cambia (`ya_entregado`).
- **Boliche, podio del servidor:**
  - Paridad con `bowlingStandings` de `src/lib/stats.ts` en un torneo armado con: borradores (`photos` null), juegos
    sin foto, override de handicap, promedio 0, `hcp_percent` 0, empates y un equipo sin juegos.
  - Con reglas null: equipos por scratch e individual por handicap. Con las reglas al revés, al revés. Con 0 %, el
    individual es por scratch.
  - Empate en el 1.º: dos unidades y el 2.º `vacio`. Cuatro empatados: `empate_multiple`.
- **Entregar (boliche):**
  - Da la insignia a cada miembro que jugó, con `team_id` del equipo del evento, `period`, `division`, la nota y
    `prize_slot_id`. Hay push con `tag 'insignia:'`; sin push en una liga con menores o con `p_notify` false.
  - El admin que ganó se entrega su propio premio (sin `a_si_mismo`).
  - Correr otra vez: `added = 0`, sin filas ni push nuevos.
  - Corregir un juego y entregar otra vez: retira con `'Corrección del podio'`, quita el push pendiente y da al
    nuevo.
  - Un `ref` distinto del servidor → `podio_cambio`; agregar un jugador de fuera → `podio_cambio`; desmarcar uno →
    ok.
  - Tiempo: con 15 días, un admin recibe `cerrado` y el dueño puede; después de `close_tournament_prizes`, igual.
  - Un torneo de mañana → `sin_resultado`.
- **Raqueta, cuadro:** final normal, final por W.O. (el 2.º `vacio`), P3 jugado, sin P3 (los dos semifinalistas),
  final solo propuesta (`sin_resultado` hasta 48 h o confirmada) y lado sin pareja (`s:`).
- **Relámpago y playoffs:** campeón, subcampeón y 3.º. Un jugador que apareció en un partido pero no está en la
  plantilla entra. Playoff activo → `sin_resultado`.
- **Golf, natación y noches:** un jugador sin tarjeta, sin serie o sin partido → `invalido`; el mismo que llama →
  `a_si_mismo`, pero otro admin sí puede; ronda abierta o encuentro sin finalizar → `sin_resultado`; `c:` solo con
  nadadores de ese club.
- **Con el creador:**
  - `award_league_badge` de la Única «Campeón» con la misma cinta después de un premio: no hay `cupo_lleno` ni
    `duplicado`. Los topes de 15, 60 y 60 no cuentan premios.
  - El mismo jugador gana «Campeón» por equipos y en individual del mismo torneo (el índice nuevo lo permite).
  - `merge_league_players` con premios de dos lugares distintos: se quedan los dos. Con el mismo lugar: queda uno y
    el otro se retira con `'fusión'`.
  - Juntar el jugador de un admin con un invitado que tenía un premio verificado que dio ese admin: no se retira. En
    golf, sí.
  - `revoke_league_badge_award` sobre un premio sigue sus reglas de siempre.
- **Lo que ya existe sigue pasando** sin cambios, en especial `insignias-creador.test.ts` y `playoffs.test.ts`.

**TypeScript (vitest)**

- `src/lib/stats.test.ts`:
  - `teamValue`, `individualRule`/`teamRule` (con null y con 0 %) y `bowlingStandings`;
  - el orden no cambia comparado con lo de hoy de `StandingsTab` y `exportExcel`, en los mismos datos.
- `src/components/EventFormModal.test.ts` (nuevo): se exporta `defaults` (hoy es `const` del módulo,
  `EventFormModal.tsx:10`). La prueba fija que `defaults('torneo')` sigue en `hcp`/`scratch`, que es la regla del
  dueño, y revisa el texto de la regla.
- `src/components/event/render.test.ts` (nuevo, con `renderToString` como `components/badges/render.test.ts`):
  - los títulos de `StandingsTab` «Equipos (scratch)» e «Individual (handicap)», y con 0 %, «Individual (scratch)»;
  - el total del equipo en `GamesTab` con la regla de equipos en scratch.
- `src/prizes/catalog.test.ts`: las categorías por deporte y tipo de evento, que tienen que coincidir con
  `prize_allowed` (una tabla compartida se compara con la base en la prueba SQL), y `prizeTitle` para cada caso.
- `src/prizes/providers.test.ts`:
  - golf: oficial, gross, neto y DQ fuera;
  - natación: puntos por club, `swimmerPoints` con desempate por oros, y división F/M;
  - noches: 3 primeros con `played > 0` y empates.
- `src/prizes/ready.test.ts`: cuándo se prende «Entregar» en cada deporte.
- `src/components/prizes/render.test.ts`: los estados de la tarjeta de §6.1 (jugador y admin), el aviso «El podio
  cambió», el lugar apagado por `a_si_mismo` y la diferencia antes → ahora.
- `src/components/badges/maker/design.test.ts`: `unitsTaken` y `quotaLeft` ignoran los premios.

---

## 11. Orden de trabajo (una entrega)

1. **Migración `20260929001200_premios_torneo.sql`:** tablas, columna e índice, RLS, triggers, las 3 redefiniciones,
   las ayudas, las 4 RPC y los permisos. Con las pruebas SQL de §10. Corre en PGlite (no es `*_supabase.sql`).
2. **`stats.ts`:** los helpers del boliche y los cambios de §5.1 (títulos, `GamesTab`, el texto del formulario),
   con sus pruebas. Es independiente y se puede subir antes.
3. **Datos y lógica:** `tournamentPrizes.ts`, `src/prizes/*` y `swimmerPoints`, con sus pruebas.
4. **Componentes:** `src/components/prizes/*` y las pantallas de §6.4, con las pruebas de render. Primero el boliche,
   después raqueta, equipos, golf y natación.
5. **Ajustes del creador:** §6.5, más `docs/insignias.md`, `supabase/README.md` y `seguridad.test.ts`.
6. **Subir:** primero la migración (`supabase db push`), después el front. Un front viejo no lee las tablas nuevas y
   el índice nuevo no cambia nada para él.

**Preguntas abiertas (no frenan la entrega; hay un valor por defecto):**

1. ¿14 días para corregir? Por defecto, sí.
2. ¿En un equipo de boliche reciben solo los que jugaron, o todos los inscritos del equipo? Por defecto, los que
   jugaron (como `teamLines` y `bowling_team_win`).
3. ¿«handicap» o «hándicap» en el boliche? Por defecto, «handicap», como el resto de esas pantallas.
