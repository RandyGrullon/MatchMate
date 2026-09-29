# Anotadores del torneo: elegir, invitar o mandar un link, y asignar ahí mismo

> **Estado:** implementado (rama `entrega-anotadores`). Lo que quedó distinto de esta especificación está en
> «Cambios al implementar», al final. Base: worktree `matchmate-anotadores` (rama
> `entrega-anotadores`, desde `main` en `e5d1768`). Producción tiene hasta `20260929001200`. Otro equipo agrega
> `20260929001300_insignias_perfil.sql`, que redefine `private.league_award_json`, `profile_badges` y
> `set_featured_badges` y no se cruza con esto.
> Migración nueva: `supabase/migrations/20260929001400_anotadores.sql`. Las migraciones aplicadas no se tocan. Lo
> que cambia de ellas se redefine aquí, copiando la **última** definición de cada función (§5.2 dice cuál es).
> Los identificadores van en inglés. Los textos que ve la gente van en español, con tú y entre comillas «».
>
> Alias de migraciones (todas en `supabase/migrations/`): rls `20260926000400`, rpc `…0500`, part
> `20260927000100`, cons `20260927001100`, recl `20260929000100`, inv `20260929000200`, avt `20260929000500`, org
> `20260929000600`, temp `20260929000700`, suel `20260929001000`, mot `20260929001110`, crea `20260929001120`.

**Lo que pidió el dueño:** «Quiero que en el torneo se pueda crear una persona para anotar; esa persona puede ser
invitada o que se cree la cuenta, y el admin o el dueño le asigna el rol de anotador. O mejor un botón de anotador y
se selecciona una persona que no esté participando o que sí esté participando, o el link de invitación, y ahí mismo
se asigna.»

**Lo que se construye (plan aprobado, con los ajustes de §1):**

1. En cada pantalla de torneo, el dueño o un admin ve el botón **«Anotadores»**. El botón abre una hoja con cuatro
   partes:
   - quién anota hoy, con «Quitar»;
   - **«De la liga»**: los miembros, con buscador. Los que juegan este torneo salen marcados «Juega». Un toque los
     hace anotadores;
   - **«Por @usuario»**: la búsqueda de personas (`search_people`). A quien ya es de la liga se le da el permiso
     directo. A quien no, se le manda una invitación de anotador («Ana te invitó a anotar en Copa Aniversario»);
   - **«Link»**: un link para anotar, que se crea, se copia o se manda por WhatsApp. Tiene su propio código (no es el
     de la liga), vence a los 7 días y se puede cambiar.
2. Quien acepta la invitación o entra por el link queda como miembro **con el permiso de anotar y sin jugador**,
   salvo que ya tuviera uno. Esto vale también en una liga privada.
3. La ruta `/anotar/:code` muestra el torneo (nombre, deporte y logo) y el botón «Entrar para anotar». Sin sesión,
   manda a crear la cuenta o a entrar, y después vuelve sola al link (el ayudante de la entrega 5). Con sesión, entra
   y lleva al torneo.
4. El permiso sigue siendo **de liga**: es la marca que ya existe, `league_members.is_scorer`. La hoja lo dice cuando
   el torneo es un evento dentro de una liga normal.

---

## 1. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | El permiso es la marca de liga que ya existe (`league_members.is_scorer`). No hay anotador por evento. | Ya lo leen todas las RPC de anotar de los seis deportes: `save_game`, `update_entry`, `save_verified_games`, las pistas, `can_score_as`, `is_match_official`, golf y natación (§2). Un permiso por evento obligaría a tocarlas todas. En los partidos, `set_match_official` (bb) ya elige un oficial por partido entre los anotadores. |
| D2 | **Boliche en una liga normal:** la marca ahora vale en los eventos `type = 'torneo'` de esa liga, pero no en las prácticas. Se agrega `private.is_event_scorer(p_event)` y se redefinen las cuatro funciones de boliche que miran al anotador (`save_game`, `update_entry`, `save_verified_games` y `private.lanes_event`), además de `private.can_upload_photo`. **`private.is_scorer` no cambia.** | Hoy, en una liga de boliche (`kind = 'liga'`), la marca no da ningún permiso (rls:46-52, `LeagueShell.tsx:89` y la prueba `reglas-juegos.test.ts:257`). Con eso, el texto del plan «Podrá anotar en los eventos de esta liga» sería falso justo en el caso que pidió el dueño: un torneo dentro de la liga. Las prácticas siguen siendo del jugador (envío con foto y aprobación del admin). **Esto se aparta del plan** en el texto: en boliche la hoja dice «los torneos de esta liga (no las prácticas)». |
| D3 | El dueño **o un admin** nombra y quita anotadores. Para eso se redefine `set_member_scorer`. Un admin que no es el dueño solo puede tocar a miembros con rol `member`: no a sí mismo, ni a otro admin, ni al dueño. Nombrar admins sigue siendo solo del dueño. `remove_member` no cambia: un admin sigue sin poder sacar a un anotador de la liga, pero ahora puede quitarle el permiso. | Lo pidió el dueño: «el admin o el dueño le asigna». Cambian dos pruebas y dos textos que decían «solo el dueño» (§10.2, §8.6). |
| D4 | Nueva columna **`league_members.scorer_only`**: la cuenta entró solo para anotar. Quien entra por el link o por una invitación de anotador no recibe jugador. Ni la app ni la base se lo crean solos: `NotificationsProvider` y «Mis juegos» se saltan a esas cuentas, y `ensure_my_player` devuelve null. Si esa persona toca «También juego», se llama a `join_league` con su propia liga, que crea el jugador y apaga la marca (`private.ensure_player`). | Hoy toda forma de entrar crea un jugador (recl:498, `Notifications.tsx:91-99`, `LeagueProfilePage.tsx:78-95`). Que la base devuelva null protege también a un teléfono con la app vieja en caché, que seguiría intentando crear el jugador. |
| D5 | Si a quien entró solo para anotar (y sigue sin jugador ni «Diseña insignias») se le quita el permiso, **sale de la liga**. A quien otro le quitó el permiso o sacó de la liga, **ningún link para anotar de la liga lo deja volver a entrar** (`'removed'`) hasta que un admin lo nombre o lo invite. | Si no saliera, quedaría como miembro sin jugador y sin permiso. En una liga privada seguiría viéndolo todo, y la app vieja le crearía un jugador. Si pudiera volver con el mismo link, quitar a un desconocido que entró con un link reenviado no serviría de nada. «Diseña insignias» lo da el dueño: un admin no se lo quita sacándolo. |
| D6 | La invitación de anotador es una fila de **`league_invites`** con cuatro columnas nuevas: `as_player`, `as_scorer`, `scope` y `ref_id`. No es una tabla aparte. | Así se reusan sin cambios la campana, la pantalla `/invitacion/<id>`, el push `invitacion:`, retirar (`cancel_league_invite`), la regla de una pendiente por cuenta y liga, el tiempo real `invites` y los triggers de entrar y salir. |
| D7 | El link para anotar vive en **`private.scorer_links`** y solo se usa por RPC. Reglas: <br>• código propio de 10 caracteres; <br>• un link abierto por contexto; <br>• vence a los 7 días; <br>• 20 usos; <br>• hasta 10 abiertos por liga; <br>• se cambia (rota) o se quita. <br>Muere si quien lo creó deja de ser admin o queda bloqueado. **No existe en ligas con menores.** | El link da más poder que el código de la liga (escribir resultados de todos) y cualquiera que lo reciba reenviado puede usarlo. Por eso es más largo, vence, tiene tope y avisa a quien lo creó cada vez que alguien entra (§6). |
| D8 | El contexto (`scope` + `ref_id`: `'liga'`, `'evento'` o `'playoff'`) solo sirve para el texto («anotar en Copa Aniversario») y para saber a dónde llevar. El permiso siempre es de liga. No lleva FK: si el evento se borra, el texto usa el nombre de la liga y el link lleva a la portada. | Un playoff no es un evento. `tournament_prizes` sí usa FK, pero ahí el contexto es el dato. Aquí es solo una etiqueta. |
| D9 | La invitación de anotador usa el tag de siempre, `invitacion:<id>` (categoría `'liga'`). Hay un prefijo nuevo, **`anotador:`**, también en `'liga'`, para «Ahora puedes anotar en…» y «Ana entró a anotar con tu link». Para eso se redefine `private.push_category`. | Así, quien apaga los avisos de «Tus ligas» deja de recibirlos. Sin esa categoría, el push llegaría siempre. |
| D10 | El botón va en cada pantalla de torneo, al lado de las acciones del admin (§8.1). No va en la barra de arriba de la liga. | En la barra de arriba ya casi no cabe el nombre en un teléfono. Además, cada pantalla sabe quién juega («Juega»), y la barra no. |
| D11 | `set_member_scorer` gana `p_scope` y `p_ref` opcionales. Como cambia la firma, se hace con `drop` y `create`. | Así el push «Ahora puedes anotar» lleva al torneo desde el que se nombró. La llamada que ya existe, con 3 argumentos con nombre, sigue funcionando. |
| D12 | Si alguien tocó «Crear cuenta y entrar a anotar» o «Ya tengo cuenta» sin sesión y vuelve de entrar o registrarse con `?entrar=1`, entra solo (una vez). El toque deja una marca en el teléfono (`mm:anotar-entrar`: el código y la hora, 24 horas); sin ella, `?entrar=1` no hace nada y se ve la tarjeta. | Ya tocó el botón antes de entrar a su cuenta. Así no tiene que tocarlo dos veces. La marca evita que un link con `?entrar=1` mandado por otro meta a alguien con sesión en una liga sin tocar nada. |

**Fuera de esta entrega:**
- anotador por evento o por partido (en los partidos ya existe `set_match_official`);
- que un admin nombre admins;
- un tope de anotadores por torneo;
- la marca `scorer` sin la regla del boliche en `LiveNow.tsx:80` y `feeds.ts:172-176` (queda como está);
- `scorerOnly` en «Descargar mis datos» y en la consola.

---

## 2. Lo que ya existe y lo que se reusa

**El anotador hoy**
- `league_members.is_scorer` (schema:94) y `private.is_scorer(p_league)` (rls:46-52). La regla de esta función es
  «en boliche solo en `kind = 'torneo'`».
- `private.can_score_as(p_match, p_league, p_user)` (part:215) lee la columna directo, sin la regla del boliche.
- `private.is_match_official` (part:225).
- Golf: `golf_save_hole_scores` (golf:1179). Natación: `swim_record_heat` (nat:987).
- Hoy solo el dueño cambia la marca: `set_member_scorer` (rpc:430, sin redefiniciones).
- Lo que un anotador no puede hacer lo fijan las pruebas de `tests/sql/reglas-juegos.test.ts:220-233`, y no cambia.
- Juez y parte: para las insignias (mot:706, :906, :1413; `src/badges/rules/bowling.ts:27`), un anotador que también
  juega es juez y parte. Por eso sus juegos de boliche `'sin-foto'` no cuentan (docs/insignias.md §1.7.5). La hoja lo
  avisa (§8.2).

**Invitaciones**
- `league_invites`, `invite_to_league`, `respond_league_invite`, `cancel_league_invite`, `private.invite_ok` y los
  triggers `league_members_accept_invites` y `league_members_cancel_invites` (inv:296-660).
- `my_league_invites` y `league_invite_details` (suel:1104-1178).
- `search_people` y `private.people_item` (inv:399-470).
- Cliente: `src/lib/data/invites.ts`, `src/lib/data/people.ts` (`usePeople`), `src/components/invite/InviteSheet.tsx`
  (`ShareRow` en :369) y `src/components/invite/logic.ts`.

**Código de la liga y unirse**
- `league_secrets`, `invite_preview` (suel:1042, también sin cuenta), `invite_details`, `join_league` (recl:544) y
  `private.ensure_player` (recl:498).
- Límites: `private.rate_blocked`, `rate_hit` y `rate_key` (base:137-151), y `private.rate_take` (inv:130).

**Volver después de entrar**
- `afterLoginPath`, `saveAfterLogin`, `syncAfterLogin` y `ResumeAfterLogin` (`src/lib/auth.tsx:255-346`, entrega 5).
- `/login?next=<ruta>` y `/login?modo=registro&next=<ruta>`, como en `JoinPage.tsx:200-211`.

**Avisos**
- `private.queue_push(p_user, p_category, p_title, p_body, p_url, p_tag, p_ttl, p_group_title)` (avt:124): revisa
  las preferencias, la cuenta bloqueada y si ya hay uno esperando; con `mm.push_batch = 'on'` avisa una sola vez al
  final.
- `private.push_category`: la última está en mot:2687.

**Pantalla**
- `Sheet` (`src/components/ui.tsx:374`, CRLF), `Tabs` (ui:489) y la clase `mm-kb-hide`.
- El precedente de un componente que se monta en todas las pantallas de torneo es `TournamentPrizes`
  (`src/components/prizes/TournamentPrizes.tsx`, docs/premios-torneo.md §6.4).

---

## 3. Modelo de datos (`20260929001400_anotadores.sql`)

### 3.1 `league_members.scorer_only` y la vista `memberships`

```sql
-- Entró solo para anotar (link para anotar o invitación de anotador): no tiene jugador y nadie se lo crea solo. Se
-- apaga cuando la cuenta crea su jugador (private.ensure_player: «También juego», join_signup, una invitación a jugar).
alter table public.league_members add column scorer_only boolean not null default false;

-- Igual que en 20260929001120_insignias_creador.sql y además scorer_only (al final: create or replace solo añade columnas).
create or replace view public.memberships with (security_invoker = true) as
  select m.league_id, m.user_id, m.role, m.is_scorer, m.display_name, m.joined_at, m.updated_at, p.id as player_id,
         m.badge_maker, m.scorer_only
  from public.league_members m
  left join public.players p on p.league_id = m.league_id and p.user_id = m.user_id;
```

No se agrega ningún `check` entre `scorer_only` e `is_scorer`, por dos razones:
- un admin que entró solo para anotar puede perder la marca y seguir sin jugador;
- las reglas de §4 cubren los demás casos.

### 3.2 `league_invites`: la invitación de anotador

```sql
-- as_player: al aceptar tiene jugador (como siempre). as_scorer: al aceptar anota. Una de anotador sola
-- (as_player = false) no crea jugador. scope/ref_id: dónde se le invitó a anotar (solo texto y a dónde llevar).
alter table public.league_invites
  add column as_player boolean not null default true,
  add column as_scorer boolean not null default false,
  add column scope text check (scope in ('liga', 'evento', 'playoff')),
  add column ref_id uuid,
  add constraint league_invites_role_check check (as_player or as_scorer),
  add constraint league_invites_scope_check check ((as_scorer = (scope is not null))
                                                   and ((scope is null or scope = 'liga') = (ref_id is null)));
```

- `invite_to_league` no cambia. Sus filas salen con los valores por defecto: `as_player = true`,
  `as_scorer = false`, `scope` null.
- El índice `league_invites_pending_key` (una pendiente por liga y cuenta) sigue igual. Si la cuenta ya tenía una
  pendiente **para jugar**, `invite_scorers` la retira y manda una nueva con `as_player = true` y `as_scorer = true`
  (§5.3).

### 3.3 `private.scorer_links`: el link para anotar

```sql
-- Link para anotar (/anotar/<código>): quien entra queda como anotador de la liga, sin jugador. Solo por RPC.
-- Un link abierto (revoked_at null) por liga y contexto. Deja de servir si vence, se llena, se quita o se cambia, si
-- quien lo creó ya no es admin o está bloqueado, o si la liga pasa a tener menores (private.scorer_link_status).
create table private.scorer_links (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  scope text not null default 'liga' check (scope in ('liga', 'evento', 'playoff')),
  ref_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  uses integer not null default 0,
  max_uses integer not null default 20 check (max_uses between 1 and 50),
  last_used_at timestamptz,
  check ((scope = 'liga') = (ref_id is null)),
  check (uses between 0 and max_uses)
);
create unique index scorer_links_one_open on private.scorer_links
  (league_id, scope, coalesce(ref_id, '00000000-0000-0000-0000-000000000000'::uuid)) where revoked_at is null;
create index scorer_links_league_idx on private.scorer_links (league_id, created_at desc);
```

- Va en `private`, como `private.rate_limits` y `private.league_creations`. Nadie de la app lo lee directo: no
  necesita RLS, grants, tombstones ni sync, y la prueba «todas las tablas de public tienen RLS» no lo ve.
- Un link que vence o se llena no se borra: queda `revoked_at` cuando se crea el siguiente para el mismo contexto.

---

## 4. Quién puede qué

| Acción | Dueño / superadmin | Admin | Anotador | Miembro | Sin cuenta |
|---|---|---|---|---|---|
| Nombrar o quitar anotador a un miembro (`set_member_scorer`) | a cualquiera (como hoy) | solo a rol `member`, no a sí mismo | — | — | — |
| Invitar a anotar (`invite_scorers`) | sí | sí | — | — | — |
| Crear, cambiar o quitar el link (`create_/rotate_/revoke_scorer_link`) | sí (no con menores) | sí (no con menores) | — | — | — |
| Ver invitaciones y links de anotador (`scorer_access`) | sí | sí | — | — | — |
| Ver a qué lleva un link (`scorer_link_preview`) | sí | sí | sí | sí | sí |
| Entrar con el link (`join_as_scorer`) | ya anota («already») | ya anota | ya anota | sí, se suma la marca (no si un admin se la quitó: `'removed'`) | inicia sesión |
| Anotar en un evento `torneo` de una liga de **boliche** | sí | sí | **sí (nuevo)** | — | — |
| Anotar en una práctica de boliche | sí | sí | no (igual que hoy) | su envío | — |
| Anotar en cualquier evento de otro deporte o de un torneo sin liga | sí | sí | sí (igual que hoy) | — | — |
| Sacar de la liga a un anotador (`remove_member`) | sí | no (igual que hoy) | a sí mismo | a sí mismo | — |

- Quitarle el permiso a un anotador con `scorer_only`, rol `member`, sin jugador y sin «Diseña insignias» lo saca de la
  liga (D5). Lo pueden hacer el dueño y el admin.
- A quien otro le quitó el permiso o sacó de la liga, los links para anotar de la liga no lo dejan entrar
  (`private.scorer_link_blocks`, `'removed'`), tampoco uno nuevo. Salir por su cuenta no cuenta. Vuelve a poder cuando
  un admin lo nombra o acepta una invitación de anotador.
- Una cuenta bloqueada no puede recibir el permiso (`'invalido'`) ni ser invitada (`'unavailable'`). Si quien invitó
  o creó el link queda bloqueado, esa invitación o ese link dejan de servir.

---

## 5. Funciones y RPC

### 5.1 Ayudas nuevas (`private`, `security definer`, `search_path = ''`)

| Función | Qué hace |
|---|---|
| `private.new_scorer_code() returns text` | 10 caracteres de `'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'` (32^10 ≈ 1,1·10^15), como `private.new_invite_code()` (base:286). Toma los bytes 0-5 y 9-12 de `uuid_send(gen_random_uuid())`, que no llevan versión ni variante, y usa `% 32`. `volatile`. |
| `private.scorer_ref_ok(p_league uuid, p_scope text, p_ref uuid) returns boolean` | `'liga'`: `p_ref` null. `'evento'`: el evento existe y es de `p_league`. `'playoff'`: el playoff existe y es de `p_league`. Cualquier otro valor: false. `stable`. |
| `private.scorer_title(p_league uuid, p_scope text, p_ref uuid) returns text` | El nombre para los textos. Para `'evento'`: el nombre del evento; si está vacío, el de la liga cuando `kind = 'torneo'`, o si no `private.org_event_label` (org:48, «Torneo del martes 29 de septiembre»). Para `'playoff'`: `playoffs.name`. Si no hay otro, el nombre de la liga. `stable`. |
| `private.scorer_path(p_league uuid, p_scope text, p_ref uuid) returns text` | A dónde llevar: `'/l/<liga>/e/<evento>'` si el evento existe, `'/l/<liga>/playoffs'` si el playoff existe, y si no `'/l/<liga>'`. Son las rutas de `App.tsx:199` y `:202`. `stable`. |
| `private.scorer_invite_ok(p_league uuid, p_invited_by uuid) returns boolean` | La parte de anotador de una invitación vale solo si quien invitó existe, no está bloqueado y **sigue siendo admin** (`private.user_is_admin`, recl:124). Vale aunque la liga sea pública. `stable`. |
| `private.league_invite_valid(i public.league_invites) returns boolean` | `(i.as_player and private.invite_ok(i.league_id, i.invited_by)) or (i.as_scorer and private.scorer_invite_ok(i.league_id, i.invited_by))`. `stable`. |
| `private.is_event_scorer(p_event uuid) returns boolean` | La cuenta de la sesión tiene `is_scorer` en la liga del evento, y además se cumple una de estas: `l.kind = 'torneo'`, `l.sport <> 'bowling'` o `e.type = 'torneo'`. No mira si es admin: cada llamada sigue con `is_admin(...) or is_event_scorer(...)`. `stable`. |
| `private.has_scorer_flag(p_league uuid) returns boolean` | La cuenta de la sesión tiene `is_scorer` en esa liga, sin la regla del boliche. Solo para `can_upload_photo`. `stable`. |
| `private.scorer_link_status(k private.scorer_links) returns text` | Revisa en este orden y devuelve el primero que se cumple: <br>• `'revoked'`: `revoked_at` puesto; <br>• `'closed'`: la liga tiene menores, o quien lo creó es null, está bloqueado o ya no es admin; <br>• `'expired'`: `expires_at <= now()`; <br>• `'full'`: `uses >= max_uses`; <br>• `'ok'`. <br>`stable`. |
| `private.scorer_link_json(k private.scorer_links) returns jsonb` | `{id, code, scope, refId, title, path, expiresAt, uses, maxUses, status, createdBy: {id, name} \| null, createdAt}`. Las fechas van con `private.iso`. |
| `private.emit_scorers(p_league uuid, p_user uuid) returns void` | `private.emit('league:' \|\| p_league, 'scorers', {user_id})` y, si `p_user` no es null, `private.emit('user:' \|\| p_user, 'scorers', {league_id})`. |

### 5.2 Redefinidas (misma firma salvo `set_member_scorer`; copiar la última definición)

| Función | Última definición | Cambio |
|---|---|---|
| `public.set_member_scorer` | rpc:430 | `drop function public.set_member_scorer(uuid, uuid, boolean)` y `create` con `p_scope text default null, p_ref uuid default null` (código abajo). |
| `private.can_upload_photo(p_league)` | cons:298 | `private.is_scorer(p_league)` pasa a ser `private.has_scorer_flag(p_league)`. Se quedan la condición `not l.has_minors` y la del bloqueo. Así el anotador de una liga de boliche (que puede no tener jugador) sube la foto del marcador de un torneo. |
| `public.save_game` | rpc:994 | `not private.is_scorer(e.league_id)` pasa a ser `not private.is_event_scorer(e.event_id)`. |
| `public.update_entry` | **mot:228** (no la de rpc) | `not private.is_scorer(e.league_id)` pasa a ser `not private.is_event_scorer(e.event_id)`. Lo demás queda igual: marcas de foto, `'importado'` y las claves que puede cambiar el anotador. |
| `public.save_verified_games` | rpc:1180 | `not private.is_scorer(v_league)` pasa a ser `not private.is_event_scorer(p_event)`. `v_admin` sigue decidiendo quién puede inscribir. |
| `private.lanes_event(p_event)` | org:1009 | `not private.is_scorer(v_league)` pasa a ser `not private.is_event_scorer(p_event)`. |
| `private.ensure_player` | recl:498 | Después de bloquear la membresía: `update public.league_members set scorer_only = false where league_id = p_league and user_id = p_user and scorer_only;`. Pedir el jugador es decidir jugar. |
| `public.ensure_my_player` | rpc:493 | Si la membresía de la sesión tiene `scorer_only` y la cuenta no tiene jugador, **devuelve null sin crear nada**. Lo llaman la creación automática y la app vieja. «También juego» usa `join_league`. |
| `public.respond_league_invite` | inv:583 | Ver abajo. |
| `private.accept_invites_on_join()` | inv:355 | Antes de marcar como aceptadas las pendientes, busca una pendiente con `as_scorer` y `private.scorer_invite_ok`. Si la hay y `not new.is_scorer`: `update public.league_members set is_scorer = true where …` (el mismo miembro que se acaba de insertar). Así, quien tenía una invitación de anotador y entra por el código, por la liga pública o por `join_signup` también queda anotador (con jugador, porque entró a jugar). |
| `public.my_league_invites()` | suel:1104 | El filtro `private.invite_ok(...)` pasa a ser `private.league_invite_valid(i)`. **Solo** en las invitaciones de anotador válidas se agrega la clave `scorer: {title, scope, refId, path, asPlayer}`. `asPlayer` es la parte de jugar que todavía vale. Se agrega con `|| case … else '{}' end`, así las demás salen idénticas y `invitaciones.test.ts:667` no cambia. |
| `public.league_invite_details(p_invite)` | suel:1135 | `v_open` usa `private.league_invite_valid(i)`. Si `i.as_scorer`, se agrega `scorer: {title, scope, refId, path, asPlayer}`. `players` («¿Quién eres?») sale vacío si la parte de jugar no vale o `as_player = false`. Las demás salen idénticas (`invitaciones.test.ts:691`). |
| `private.push_category(p_tag)` | **mot:2687** | Todo igual y además `when 'anotador' then 'liga'`. El comentario de arriba nombra el prefijo nuevo. Si otra migración posterior la redefine, tiene que copiar esta. |

**No cambian:**
- `private.is_scorer`, que todavía usan golf, natación, `is_match_official` y el propio `can_upload_photo` antes de
  esta entrega;
- `remove_member`, `leave_league`, `join_league`, `invite_to_league`, `search_people`, `people_item` y
  `cancel_league_invite`.

`people_item.invited` no dice si la pendiente es para anotar. La hoja lo saca de `scorer_access` (§8.2).

**`set_member_scorer` (nueva firma):**

```sql
drop function public.set_member_scorer(uuid, uuid, boolean);
-- Dueño o admin: nombra o quita anotadores. Un admin (no dueño) solo a miembros (ni a sí mismo, ni a otro admin, ni
-- al dueño). Nombrar: push 'anotador:<liga>' a la cuenta («Ahora puedes anotar en …»). Quitar a quien entró solo para
-- anotar y no tiene jugador: sale de la liga. p_scope/p_ref: desde qué torneo (el texto y a dónde lleva el push).
create function public.set_member_scorer(p_league uuid, p_user uuid, p_scorer boolean,
                                         p_scope text default null, p_ref uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  m public.league_members;
  v_scope text := coalesce(p_scope, 'liga');
  v_title text;
begin
  if not private.is_admin(p_league) then
    perform private.deny();
  end if;
  select * into m from public.league_members x where x.league_id = p_league and x.user_id = p_user for update;
  if m.user_id is null then
    perform private.fail('no_existe');
  end if;
  if not private.is_owner(p_league) and m.role <> 'member' then
    perform private.deny();
  end if;
  if not private.scorer_ref_ok(p_league, v_scope, p_ref) then
    perform private.fail('invalido');
  end if;
  if coalesce(p_scorer, false) then
    if m.is_scorer then
      return;
    end if;
    if private.is_blocked(p_user) then
      perform private.fail('invalido');
    end if;
    update public.league_members set is_scorer = true where league_id = p_league and user_id = p_user;
    if p_user <> v_uid then
      v_title := private.scorer_title(p_league, v_scope, p_ref);
      perform private.queue_push(p_user, 'liga', left('Ahora puedes anotar en ' || v_title, 200),
        left(coalesce((select p.name from public.profiles p where p.id = v_uid), 'Un admin') || ' te nombró anotador. Toca para ir.', 1000),
        private.scorer_path(p_league, v_scope, p_ref), 'anotador:' || p_league::text, 86400);
    end if;
  else
    if not m.is_scorer then
      return;
    end if;
    if m.scorer_only and m.role = 'member'
       and not exists (select 1 from public.players p where p.league_id = p_league and p.user_id = p_user) then
      -- Solo estaba para anotar: sale (sus invitaciones mandadas se cancelan y sus reclamos también, por los triggers).
      delete from public.league_members where league_id = p_league and user_id = p_user;
    else
      update public.league_members set is_scorer = false, scorer_only = false where league_id = p_league and user_id = p_user;
    end if;
  end if;
  perform private.emit_scorers(p_league, p_user);
end $$;
```

**`respond_league_invite`:** es la de inv:583, con estos cambios.
1. Después de leer la invitación pendiente se calcula:
   ```
   v_play  := i.as_player and private.invite_ok(i.league_id, i.invited_by)
   v_score := i.as_scorer and private.scorer_invite_ok(i.league_id, i.invited_by)
   ```
   Si ninguna de las dos vale, la invitación queda `'cancelled'`, como hoy.
2. `insert into public.league_members (league_id, user_id, role, display_name, is_scorer, scorer_only) values (…, 'member', v_name, v_score, v_score and not v_play) on conflict (league_id, user_id) do update set is_scorer = public.league_members.is_scorer or excluded.is_scorer`.
   Si ya era miembro, `scorer_only` no se toca.
3. El jugador depende de `v_play`:
   - si vale, `private.ensure_player(i.league_id, v_uid, p_prefer)`;
   - si no, el que ya tenga (`select p.id from public.players …`) o null, y `p_prefer` no se usa.
4. El push a quien invitó (tag `'invitacion-ok:' || id`, como hoy):
   - con `v_score`: título `'<nombre> aceptó anotar en <title>'`, cuerpo `'Ya puede anotar.'`, url
     `private.scorer_path(...)`;
   - sin `v_score`: igual que hoy.
5. Lo que devuelve es lo de hoy y, **solo** con `v_score`, además `scorer: {title, scope, refId, path}`. Así
   `invitaciones.test.ts:509` no cambia. Con `v_score` también se llama a `private.emit_scorers(i.league_id, v_uid)`.

### 5.3 RPC nuevas

**`public.invite_scorers(p_league uuid, p_users uuid[], p_scope text default 'liga', p_ref uuid default null) returns jsonb`**
- **Permisos y validación:**
  - si la liga no existe, `'no_existe'`;
  - hay que ser admin, si no `deny`;
  - `private.scorer_ref_ok`, si no `'invalido'`;
  - de 1 a 20 cuentas distintas, en su orden, si no `'invalido'`.
- **Límite:** `'invite:' || uid`, compartido con `invite_to_league`: 100 por día. Primero se mira con `rate_blocked`
  y después, por cada una, con `rate_take`.
- **Antes de dar el estado de cada cuenta:** se cancela la pendiente que ya no vale
  (`not private.league_invite_valid(i)`), igual que hace `invite_to_league`.
- **Estado de cada cuenta**, en este orden:
  - `'unavailable'`: yo, no existe o está bloqueada;
  - `'member'`: ya es miembro (la hoja usa `set_member_scorer`);
  - `'pending'`: ya tiene una pendiente de anotador;
  - `'declined'`: rechazó una de esta liga hace menos de 7 días;
  - `'rate_limited'`;
  - `'sent'`: invitación nueva. Si tenía una pendiente **para jugar**, esa se cancela y la nueva sale con
    `as_player = true`. Si no, con `as_player = false`. Siempre `as_scorer = true`, `scope` y `ref_id`. Con
    `on conflict … do nothing`: si otro admin la mandó en el mismo momento, sale `'pending'`.
- **Push:** con `private.queue_push(v_user, 'liga', …)`, dentro de `mm.push_batch = 'on'` y un solo
  `private.kick_send_push()` al final. Llega **uno por persona y día de quien invita** (la regla de inv:550).
  - título: `'<quien invita> te invitó a anotar en <title>'`;
  - cuerpo: `'Toca para ver la invitación. No te inscribe como jugador.'` o, con `as_player`, `'También te invitó a jugar. Toca para ver la invitación.'`;
  - url: `'/invitacion/<id>'`;
  - tag: `'invitacion:<id>'`;
  - ttl: 604800.
- **Devuelve** `{sent, results: [{userId, status}]}`, la misma forma que `invite_to_league`.

**`public.scorer_access(p_league uuid) returns jsonb`**: solo admin, si no `deny`. `stable`.
- Devuelve `{invites: [...], links: [...]}`.
- `invites`: las pendientes con `as_scorer` y `private.league_invite_valid`, de la más nueva a la más vieja, hasta
  100. Cada una: `{id, user: {id, name, username}, invitedBy: {id, name} | null, asPlayer, scope, refId, title, createdAt}`.
- `links`: los abiertos (`revoked_at is null`) de la liga, cada uno con `private.scorer_link_json`. Incluye los
  vencidos, llenos o cerrados, para que la hoja diga por qué no sirven.

**`public.create_scorer_link(p_league uuid, p_scope text default 'liga', p_ref uuid default null) returns jsonb`**
1. La liga tiene que existir (`'no_existe'`) y hay que ser admin (`deny`). En una liga con `has_minors`, `'invalido'`.
   Con `private.scorer_ref_ok` falso, `'invalido'`.
2. Se busca el abierto de ese contexto con `for update`:
   - si su estado es `'ok'`, se devuelve ese: sin costo y sin cambiar nada (crear dos veces da el mismo);
   - si no, se le pone `revoked_at = now()`.
3. Si ya hay 10 links abiertos y sin vencer en la liga, `'cupo_lleno'`.
4. `private.rate_take('scorer-link:' || uid, 20, interval '1 day')`; si no cabe, `'rate_limited'`.
5. Se inserta con `private.new_scorer_code()`. Hay hasta 10 intentos con `unique_violation`, y en cada uno se vuelve a
   mirar si otro admin abrió uno para ese contexto: si lo abrió, se devuelve ese. Si no se logra, `'duplicado'`.
6. `private.emit_scorers(p_league, null)`. Devuelve `private.scorer_link_json`.

**`public.rotate_scorer_link(p_link uuid) returns jsonb`**
- Si no existe, `'no_existe'`. Hay que ser admin de su liga, si no `deny`. En una liga con menores, `'invalido'`.
- Le pone `revoked_at = now()` y crea otro para el mismo contexto, con 0 usos y 7 días nuevos. Cuesta
  `rate_take('scorer-link:…')`.
- Quien ya entró con el link viejo sigue anotando. Emite y devuelve el nuevo.

**`public.revoke_scorer_link(p_link uuid) returns void`**
- Si no existe, `'no_existe'`. Hay que ser admin de su liga, si no `deny`.
- `revoked_at = coalesce(revoked_at, now())` y emite.

**`public.scorer_link_preview(p_code text) returns jsonb`**: para quien tiene sesión **y para quien no** (se le da
`grant … to anon`).
1. Límite `private.rate_key('preview')`: **el mismo** de `invite_preview`. Son 30 códigos fallidos por hora; lleno
   da `'rate_limited'`.
2. El código se limpia con `upper(btrim(...))`.
3. Si el código no existe: `rate_hit` y devuelve null. No lanza error, para que el fallo quede contado.
4. Si el estado no es `'ok'`: devuelve `{status}` y nada más, ni siquiera la liga.
5. Si es `'ok'`: `{status: 'ok', leagueId, name, sport, kind, visibility, logoPath, scope, refId, title, path, expiresAt, member, canScore}`.
   - `member`: la cuenta de la sesión ya está en la liga;
   - `canScore`: además es dueño, admin o ya tiene `is_scorer`;
   - sin sesión, las dos son false.

   Enseña lo mismo que `invite_preview` más el nombre del torneo.

**`public.join_as_scorer(p_code text) returns jsonb`**
1. `require_uid`, con el nombre del perfil; si no hay nombre, `'no_existe'`.
2. Límite `'join:' || uid`, compartido con `join_league` e `invite_details`: 10 fallos por hora (`'rate_limited'`).
3. Si el código no existe: `rate_hit` y devuelve null.
4. Se lee el link `for update`. Si su estado no es `'ok'`, devuelve `{status}`.
5. Se lee la membresía `for update`:
   - dueño, admin o ya con `is_scorer`: `'already'`, no cuenta como uso;
   - si no, y otro le quitó el permiso o lo sacó de la liga (`private.scorer_link_blocks`): `{status: 'removed'}`, sin
     cambiar nada (D5);
   - miembro sin la marca: `is_scorer = true`, `'upgraded'`. Conserva su jugador y `scorer_only` no cambia;
   - no miembro: `insert … (role 'member', display_name, is_scorer true, scorer_only true) on conflict do nothing`, y
     se vuelve a leer. Queda `'joined'` (y `private.scorer_link_joins` lo recuerda). **Sirve también en una liga privada**, sin el código de la liga. El trigger
     `league_members_accept_invites` deja aceptada cualquier invitación pendiente.
6. Si el estado es `'joined'` o `'upgraded'`:
   - `uses = uses + 1` y `last_used_at = now()`;
   - push a `created_by` con `private.queue_push(…, 'liga', …)`:
     - título: `'<nombre> entró a anotar en <title>'`;
     - cuerpo: `'Con tu link para anotar. Si no sabes quién es, quítalo y cambia el link en «Anotadores».'`;
     - url: `private.scorer_path(...)`;
     - tag: `'anotador:<link>'`;
     - ttl: 86400;
     - título de grupo: `'Entraron varias personas a anotar en <title>'`;
   - `private.emit_scorers`.
7. Devuelve `{status, leagueId, scope, refId, title, path}`.

### 5.4 Permisos

Es un bloque `do $$ … $$` como el de inv:748-766.
- **Públicas** (quedan para `authenticated`): `set_member_scorer`, que se creó de nuevo y hay que darla otra vez,
  `invite_scorers`, `scorer_access`, `create_scorer_link`, `rotate_scorer_link`, `revoke_scorer_link`,
  `scorer_link_preview` y `join_as_scorer`.
- **Privadas** (nadie de la app las ejecuta): `new_scorer_code`, `scorer_ref_ok`, `scorer_title`, `scorer_path`,
  `scorer_invite_ok`, `league_invite_valid`, `is_event_scorer`, `has_scorer_flag`, `scorer_link_status`,
  `scorer_link_json` y `emit_scorers`. También las redefinidas, para asegurarlo.
- Después del bloque: `grant execute on function public.scorer_link_preview(text) to anon;`.

---

## 6. Avisos y tiempo real

| Cuándo | A quién | Título | Cuerpo | URL | Tag | Categoría |
|---|---|---|---|---|---|---|
| Invitación de anotador | invitado | «Ana te invitó a anotar en Copa Aniversario» | «Toca para ver la invitación. No te inscribe como jugador.» (o «También te invitó a jugar…») | `/invitacion/<id>` | `invitacion:<id>` | liga |
| Acepta | quien invitó | «Luis aceptó anotar en Copa Aniversario» | «Ya puede anotar.» | ruta del torneo | `invitacion-ok:<id>` | liga |
| Lo nombran directo (uno por día y liga: nombrar y quitar una y otra vez no le llena el teléfono) | la cuenta | «Ahora puedes anotar en Copa Aniversario» | «Ana te nombró anotador. Toca para ir.» | ruta del torneo | `anotador:<liga>` | liga (nuevo prefijo) |
| Entra con el link | quien creó el link | «Luis entró a anotar en Copa Aniversario» (agrupa: «Entraron varias personas…») | «Con tu link para anotar. Si no sabes quién es, quítalo y cambia el link en «Anotadores».» | ruta del torneo | `anotador:<link>` | liga (nuevo prefijo) |

- Quitar el permiso o sacar a alguien de la liga no manda aviso, igual que `remove_member`.
- La invitación sale además en la campana y en Avisos (`my_league_invites` → `inviteNotices`), con su texto de
  anotador (§8.4).
- **Tiempo real:**
  - `invites` en `league:<id>` y `user:<id>` sigue como está, sin cambios;
  - `scorers` en `league:<id>` es nuevo y lo emite `private.emit_scorers`. En `src/lib/data/topics.ts` invalida
    `scorers:<id>` y `tags.leagueMembers(id)`;
  - `scorers` en `user:<id>` invalida `tags.members` y `tags.feeds`: sus membresías y su nueva liga.
  - Los cambios de `league_members` no llegan por tiempo real (llegan por sync). Por eso el evento es necesario para
    que el teléfono del nuevo anotador vea el permiso al momento.

---

## 7. Antiabuso

- **Solo admins** crean invitaciones y links, y nombran o quitan anotadores. Un admin no toca a otro admin ni al
  dueño (D3). Todo pasa por RPC `security definer`: la app no escribe en ninguna tabla.
- **Límites:**
  - invitar: `invite:<cuenta>`, 100 por día, compartido con `invite_to_league`;
  - links: `scorer-link:<cuenta>`, 20 creados o cambiados por día, y 10 abiertos por liga (`'cupo_lleno'`);
  - ver un link: `preview` por cuenta o IP, 30 fallos por hora, compartido con `invite_preview`;
  - entrar: `join:<cuenta>`, 10 fallos por hora, compartido con `join_league` e `invite_details`;
  - se sigue la regla de base:129: el intento fallido se cuenta sin excepción, y la RPC devuelve null.
- **El link:**
  - 10 caracteres, 7 días y 20 usos, y se cambia o se quita en un toque;
  - muere si quien lo creó deja de ser admin o queda bloqueado;
  - cada entrada le avisa por push a quien lo creó;
  - la hoja lista a los anotadores y quitar a uno es un toque.
- **Cuentas bloqueadas:**
  - no hacen nada: `require_uid` corta toda escritura;
  - no se pueden nombrar (`'invalido'`) ni invitar (`'unavailable'`);
  - su invitación o su link dejan de valer;
  - `queue_push` no les manda nada.
- **Ligas con menores:**
  - no hay link: no se crea (`'invalido'`) y el que existiera queda `'closed'`;
  - sí se puede invitar a una cuenta concreta por su @usuario, como hoy con `invite_to_league`;
  - el anotador de esa liga no sube fotos, porque `can_upload_photo` conserva `not has_minors`;
  - la hoja avisa que el anotador ve la liga completa, con sus menores.
- **Repetir:** quien rechazó una invitación de la liga en los últimos 7 días no recibe otra. El push llega uno por
  persona y día de quien invita.
- **Teléfonos con la app vieja:** `ensure_my_player` devuelve null para quien solo anota. Así nadie le crea un jugador
  sin querer (D4).
- **Juez y parte:** hacer anotador a alguien que juega cambia lo que le cuenta para insignias (§2). La hoja lo dice
  antes de confirmar.

---

## 8. Pantallas

### 8.1 El botón «Anotadores»

- Es un componente nuevo: `src/components/scorers/ScorersButton.tsx` (LF).
- Props: `{ target: ScorerTarget; participants?: readonly string[] }`.
  - `ScorerTarget = { scope: 'liga' | 'evento' | 'playoff'; refId: string | null; title: string }`.
  - `participants` son los `playerId` que juegan este torneo.
- Solo se ve si `ctx.isAdmin`.
- Es un `Button variant="ghost"` con el ícono `ClipboardPen` (lucide-react 1.47 lo tiene), `aria-label` y `title`
  «Anotadores», igual que Excel y Configurar en `EventPage.tsx:214-234`.
- Carga la hoja con `lazy`.
- Si no llega `participants` (no se sabe, o todavía carga), nadie sale con «Juega» ni se pregunta lo de juez y parte.
  Tener jugador no es jugar este torneo: toda cuenta que entra a jugar recibe el suyo.

| Pantalla | Archivo (EOL) | Dónde | `target` | «Juega» |
|---|---|---|---|---|
| Boliche, evento `torneo`, también la portada de un torneo sin liga (`TournamentHome` → `EventPage`) | `src/pages/EventPage.tsx` (CRLF), `BowlingEventPage` | dentro de `{isAdmin && <>…</>}` (:214), antes de Excel; solo si `isTorneo` | `evento`, `ev.id`, `eventLabel(ev)` | `entries.data[].playerId` |
| Raqueta, torneo por categorías | `src/pages/sports/racket/tourney/TourneyPage.tsx` (LF) | fila de acciones del admin (:146-165) | `evento`, `event.id` | jugadores de `names.entrants(cat.pairs)` de todas las categorías |
| Raqueta, noche (americano, mexicano) | `src/pages/sports/racket/night/NightPage.tsx` (LF) | fila del admin (:228-258) | `evento` | `cfg.players` |
| Pickleball social | `src/pages/sports/pickleball/social/SocialPage.tsx` (LF) | fila del admin (:200-230) | `evento` | `cfg.players` |
| Raqueta, portada de un torneo sin liga con varios eventos | `src/pages/sports/racket/Home.tsx` | cabecera de la portada (la rama de `kind === 'torneo'`, :83) | `liga` | los inscritos en algún evento (`eventPlayers` de `names.ts`: la noche, las categorías o la liga de parejas) |
| Golf, ronda | `src/pages/sports/golf/GolfEvent.tsx` (LF) | fila del admin (:182-196) | `evento` | `golf.data.cards[].playerId` |
| Golf, portada de un torneo sin liga con varias rondas | `src/pages/sports/golf/GolfHome.tsx` | cabecera | `liga` | quien tiene tarjeta en alguna ronda (`useGolfCardPlayers`) |
| Natación, encuentro | `src/pages/sports/swimming/MeetPage.tsx` (CRLF) | fila del admin (:157-175) | `evento`, `meetId` | el jugador de cada nadador inscrito (`entries`) |
| Baloncesto, fútbol y sala: relámpago | `src/pages/sports/team/TournamentHub.tsx` (LF) | bloque `tl.isAdmin` (:80-84) | `liga` (siempre: el evento del torneo suelto llega después y el link no cambia de contexto con la hoja abierta) | `tl.teams.data[].roster` |
| Equipos: playoffs de una liga | `src/pages/sports/team/PlayoffsPage.tsx` (LF) | junto a «Borrar» (:161-165) | `playoff`, `playoff.id`, `playoff.name` | `roster` de los equipos sembrados |

En una práctica de boliche no se muestra. En un torneo sin liga, la portada de un solo evento ya es el evento, así que
el botón sale una vez.

### 8.2 La hoja «Anotadores»

- Archivo: `src/components/scorers/ScorersSheet.tsx` (LF). Usa el `Sheet` de `ui.tsx`.
- Título: «Anotadores».
- Subtítulo: `scorerReachText(league)`, según el caso:
  - torneo sin liga: «Anotan los resultados de este torneo. No los inscribe como jugadores.»;
  - liga de boliche: «Podrán anotar en los torneos de esta liga (no en las prácticas). No los inscribe como
    jugadores.»;
  - liga de otro deporte: «Podrán anotar en los eventos de esta liga, no solo en este. No los inscribe como
    jugadores.»
- Datos:
  - `useLeagueMembers(lid)`, para los miembros y la marca;
  - `useScorerAccess(lid)`, para las invitaciones pendientes y los links;
  - `usePeople(query, lid)`;
  - `useTopic('league:' + lid, lid)`.

**A. «Anotan ahora»** (clase `mm-kb-hide`):
- Una fila por cada miembro con `scorer` y rol `member`, más una por cada invitación pendiente de anotador.
- Marcas de cada fila:
  - «Juega», si su jugador está en `participants`;
  - «Solo anota», si `scorerOnly` y no tiene jugador;
  - «Invitado», si es una invitación pendiente.
- Botones:
  - «Quitar» (un miembro): `setScorer(member, false, target)`;
  - «Retirar» (una invitación): `cancelInvite(id, lid)`, que ya existe.
- Debajo: «Los admins (N) también anotan.»
- Vacío: «Todavía no hay anotadores. Elige a alguien de la liga, búscalo por su @usuario o manda el link.»

**B. Pestañas** (`Tabs`): «De la liga» · «Por @usuario» · «Link».

- **De la liga:**
  - Un buscador por nombre (sin acentos, como `normalize_name`) y la lista de miembros con rol `member` que todavía
    no anotan, por nombre. Los que juegan llevan la marca «Juega».
  - Cada fila tiene «Hacer anotador».
  - Vacío: «Todos los miembros ya anotan» o «Nadie con ese nombre».
- **Por @usuario:**
  - `Input` «Busca por nombre o @usuario», con la vista de `peopleView` (`src/components/invite/logic.ts`).
  - Cada persona tiene una acción, según `personAction(hit, member, invite)`:
    - ya anota: «Ya anota», apagado;
    - admin o dueño: «Admin», apagado;
    - ya es miembro: «Hacer anotador», que llama a `setScorer`;
    - tiene una invitación de anotador pendiente: «Invitado», con «Retirar»;
    - cualquier otra: «Invitar a anotar», que llama a `inviteScorers(lid, [id], target)`. Esto incluye a quien
      tiene una invitación pendiente para jugar: la nueva la reemplaza.
  - Una persona a la vez: no hace falta `SendBar`.
- **Link:**
  - En una liga con menores, solo este texto: «En una liga con menores no hay link para anotar: invita a cada
    anotador por su @usuario.»
  - Si no, se busca el link de este `target` en `access.links` (mismo `scope` y `refId`).
  - Con `status === 'ok'`:
    - la fila para compartir, `ShareRow`, con la URL `${origin}/anotar/${code}`. `ShareRow` se generaliza con las
      props opcionales `text`, `hint` y `createLabel`; lo de hoy sigue igual;
    - el texto para compartir es `scorerShareText(title)` = «Te invito a anotar en {title} con MatchMate»;
    - una línea: «Vence el {día} · {uses} de {maxUses} usos»;
    - el aviso: «Cualquiera con este link puede entrar a anotar. Mándalo solo a quien va a anotar.»;
    - «Cambiar link», que confirma: «El link de antes deja de servir. Quien ya entró sigue anotando.»;
    - «Quitar link», que confirma y es `danger`.
  - Si no hay link, o el que hay venció, se llenó o se cerró: una línea que dice por qué y el botón «Crear link para
    anotar».

**Confirmaciones y avisos (`src/components/scorers/logic.ts`):**
- «Hacer anotador»:
  - a quien no juega: sin confirmar, con el aviso «{nombre} ya puede anotar»;
  - a quien juega: confirma con el título «¿Hacer anotador a {nombre}?». El mensaje es el subtítulo más:
    - en boliche: «Como también juega, sus juegos sin foto no cuentan para insignias.»;
    - en los demás deportes: «Lo que anote de sus propios partidos no cuenta para insignias.»
- «Invitar a anotar» en una liga con menores: confirma «{nombre} entrará a la liga y verá sus datos, también los de
  los menores.»
- «Quitar»:
  - con jugador: «¿Quitarle el permiso de anotar a {nombre}? Sigue en {la liga | el torneo} como jugador.», y el aviso
    «{nombre} ya no anota»;
  - si solo anota: «{nombre} entró solo para anotar: al quitarle el permiso sale de {la liga | el torneo}.», con el
    botón «Quitar» y `danger`, y el aviso «{nombre} salió de {…}».
- Resultado de invitar, `inviteScorerText(status, name, kind)`:
  - `sent`: «Le llegó la invitación a {nombre}»;
  - `pending`: «{nombre} ya tiene una invitación»;
  - `declined`: «{nombre} la rechazó hace poco. Prueba en unos días.»;
  - `unavailable`: «Esa cuenta no está disponible»;
  - `rate_limited`: «Mandaste muchas invitaciones hoy. Prueba mañana.»;
  - `member`: «{nombre} ya está en {…}».
- Errores, `scorerErrorText(e)`:
  - cuenta bloqueada: `BLOCKED_MESSAGE`;
  - permiso: «Solo el dueño o un admin maneja los anotadores.»;
  - `rate_limited`: «Hiciste muchos cambios hoy. Prueba mañana.»;
  - `cupo_lleno`: «Ya hay 10 links para anotar abiertos en {…}. Quita alguno.»;
  - `no_existe`: «Eso ya no existe.»;
  - sin conexión: «Sin conexión. Prueba otra vez cuando tengas señal.»;
  - cualquier otro: «No se pudo. Prueba otra vez.»

### 8.3 `/anotar/:code`

- Archivo: `src/pages/ScorerJoinPage.tsx` (LF).
- Ruta en `src/App.tsx`, al lado de `/unirse/:code` (:171), con su `lazy`:
  `<Route path="/anotar/:code" element={<Screen area="anotar" framed><ScorerJoinPage /></Screen>} />`.
- Lee con `getScorerLinkPreview(code)` (`scorer_link_preview`), con sesión o sin ella.
- Estados:
  - **cargando**: `Loading`;
  - **null**: `Empty` «Este link no sirve» · «El código no existe. Pídele el link a quien organiza.», con el enlace
    «Ver ligas»;
  - **`expired`**: «Este link venció» · «Pídele uno nuevo a quien organiza.»;
  - **`revoked` o `closed`**: «Este link ya no sirve» · lo mismo;
  - **`full`**: «Este link ya se usó todas las veces» · «Pídele otro a quien organiza.»;
  - **`rate_limited`**: «Demasiados intentos. Espera unos minutos.»;
  - **`ok`**: el tema del deporte (`SportTheme`), `LeagueLogo` o `SportSplash`, el nombre, `SportBadge` y la
    visibilidad. Luego:
    - el título «Te invitaron a anotar» y, debajo, «en {title}» si es distinto del nombre de la liga;
    - `InfoList` con dos filas: «Anotas los resultados. No te inscribe como jugador.» y el subtítulo de §8.2 sin la
      frase final;
    - «El link vence el {día}».
- Sin sesión:
  - el botón «Crear cuenta y entrar a anotar» lleva a
    `/login?modo=registro&next=${encodeURIComponent(`/anotar/${code}?entrar=1`)}`;
  - el enlace «Ya tengo cuenta» lleva a `/login?next=…`, con el mismo destino;
  - `afterLoginPath` acepta la query.
- Con sesión:
  - si `canScore`: `<Navigate to={path} replace />`;
  - si no: el botón «Entrar para anotar» → `joinAsScorer(code)`:
    - `joined`: aviso «Ya puedes anotar en {title}»;
    - `upgraded`: aviso «Ya puedes anotar en {title}. Sigues jugando.»;
    - `already`: sin aviso;
    - en los tres casos, `navigate(path)`. Antes se valida `path` con `safeAppPath` y que empiece con `/l/`; si no,
      se va a `/l/<leagueId>`;
    - otro estado: se muestra el vacío que le toca;
  - con `?entrar=1`: entra solo una vez (un `useRef` lo evita dos veces), mostrando `Loading`, y después quita la
    query; solo si encuentra la marca de que en este teléfono se tocó «Crear cuenta y entrar a anotar» o «Ya tengo
    cuenta» con ese código (`rememberScorerIntent`/`takeScorerIntent` en `logic.ts`, D12). Sin la marca quita la
    query y enseña la tarjeta;
  - `removed` (un admin le quitó el permiso o lo sacó): «Este link ya no te sirve» · «Un admin te quitó el permiso de
    anotar. Si fue un error, pídele que te vuelva a invitar.»

### 8.4 La invitación de anotador

- **`src/pages/InvitePage.tsx` (LF), `PendingInvite` (:132):** si `d.scorer`:
  - el título es «{quien invita} te invitó a anotar en {title}»;
  - el texto es el subtítulo de §8.2 y, además, «También te invitó a jugar.» o «No te inscribe como jugador.»;
  - «¿Quién eres?» sale solo si `asPlayer`;
  - los botones son «Aceptar y anotar» y «Rechazar»;
  - al aceptar, `navigate(r.scorer?.path ?? '/l/<id>')`.
- **`src/components/notifications/InvitesCard.tsx` (LF):** si la invitación tiene `scorer`:
  - la línea es «te invitó a anotar en {title}»;
  - al aceptar lleva a `r.scorer.path`.
- **Textos:**
  - `inviteNotices` (`invites.ts:416`) y `src/components/notifications/inviteText.ts` ganan
    `scorerInviteLine(inv)`;
  - `respondedText` gana el caso de anotador: «Ya puedes anotar en {title}».

### 8.5 «Mis juegos» de quien solo anota

- **`src/pages/LeagueProfilePage.tsx` (CRLF):** antes de `PreparingPlayer`, si
  `member?.scorerOnly && !myPlayerId`, se muestra `ScorerOnly`:
  - ícono `ClipboardPen`, título «Estás aquí para anotar»;
  - texto: «Entraste a {la liga | el torneo} para anotar resultados; no tienes jugador.»;
  - «También juego»: llama a `playToo(lid)`, que es `join_league` con `p_league` más `afterJoinLeague`, y avisa
    «Listo, ya tienes tu jugador»;
  - «Salir de {la liga | el torneo}»: confirma «Dejas de anotar y sales de {…}.» y es `danger`. Llama a
    `removeMember(member)` y hace `rememberLeague(null)` y `navigate('/ligas')`. Hoy «Salir» solo existe en
    `PlayerPage`, y quien solo anota no tiene jugador.
- **`src/components/Notifications.tsx` (LF), :93-99:** el `continue` también se salta a `m.scorerOnly`.
- **`src/pages/PlayersPage.tsx` (CRLF), :75:** `unlinked` deja fuera a `scorerOnly`.

### 8.6 Admin > Miembros y natación

- **`src/pages/AdminPage.tsx` (CRLF), `MembersPanel` (:253-430):**
  - `scorers` (:262-264) pasa a ser siempre true: en una liga de boliche ahora vale para los torneos;
  - el botón de anotador lo ve: el dueño en cualquier fila que no sea la suya (como hoy); un admin en las filas de rol
    `member` que no son la suya. Se agrega `canScorer`; `canManage` sigue siendo solo del dueño y solo para roles;
  - `toggleScorer` (:286-299) usa el mismo texto por deporte que §8.2. En boliche con `kind = 'liga'`: «Podrá anotar
    los juegos de los torneos de la liga (no las prácticas) y nada más. Sigue siendo jugador.»;
  - quitar a quien solo anota usa el texto de §8.2;
  - la marca (:371) dice «Solo anota» cuando `scorerOnly && !playerId`, en vez de «Su jugador se crea al abrir la
    liga»;
  - el texto de arriba (:327-341):
    - para el dueño: «Solo tú, como dueño, nombras admins. Tú y los admins nombran anotadores.»;
    - para un admin: «Solo el dueño nombra admins. Tú puedes nombrar anotadores.»
- **`src/pages/sports/swimming/ClubsAdmin.tsx` (CRLF), `TimersSection` (:155-191):** la casilla se activa con
  `isAdmin` (hoy es `isOwner`) y el texto de :169 cambia igual.

### 8.7 El permiso en las pantallas

- **`src/lib/league.tsx` (LF):**
  - `LeagueCtx` gana `scorerOnly: boolean`;
  - se corrige el comentario de `isScorer`: «en boliche, la marca vale solo en un torneo sin liga; para un evento,
    `canScoreEvent`»;
  - función nueva `canScoreEvent(ctx, eventType)`:
    `ctx.isAdmin || (ctx.member?.scorer === true && (ctx.league.kind === 'torneo' || leagueSport(ctx.league) !== 'bowling' || eventType === 'torneo'))`.
    Es la gemela de `private.is_event_scorer`.
- **`src/components/LeagueShell.tsx` (CRLF), :83-100:** llena `scorerOnly: member?.scorerOnly === true && !member.playerId`.
  `isScorer` y `canScore` siguen siendo de liga.
- **`src/pages/EventPage.tsx`, `BowlingEventPage`:** `canScore` (:88) sale de `canScoreEvent(ctx, ev.type)` y se usa
  en las pestañas (:142-150) y en `playsHere` (:132).
- **Tipos y filas:**
  - `src/lib/types.ts` (CRLF): `Member` gana `scorerOnly?: boolean` y se corrige el comentario de `scorer`;
  - `src/lib/data/rows.ts` (LF): `MembershipRow.scorer_only?`, y en `toMember`,
    `...(r.scorer_only ? { scorerOnly: true } : {})`;
  - `src/lib/data/members.ts` (LF): `scorer_only` entra en `MEMBER_COLUMNS`, y `setMemberScorer` gana el tercer
    argumento opcional `target?: ScorerTarget` y el comentario «el dueño o un admin».

---

## 9. Cliente: datos y archivos

**Nuevo: `src/lib/data/scorers.ts` (LF)**
- Tipos: `ScorerScope`, `ScorerTarget`, `ScorerLinkStatus`, `ScorerLink`, `ScorerInvite`, `ScorerAccess`,
  `ScorerLinkPreview` y `ScorerJoinResult`.
- `scorerTags.access(lid)` = `scorers:<lid>`.
- `useScorerAccess(lid)`, con las etiquetas `scorers:<lid>` y `tags.invites(lid)`.
- `setScorer(member, on, target?)`: llama a `setMemberScorer` e invalida `scorers:<lid>`.
- `inviteScorers(lid, userIds, target)`: devuelve `InviteSendResult` e invalida `scorers:<lid>`, `tags.invites(lid)`
  y `'people:search'`.
- `createScorerLink(lid, target)`, `rotateScorerLink(link)` y `revokeScorerLink(link)`.
- `getScorerLinkPreview(code)`.
- `joinAsScorer(code)`: con `joined` o `upgraded` llama a `afterJoinLeague(leagueId)`.
- `playToo(lid)`.
- `scorerLinkUrl(origin, code)` y `scorerErrorText(e)`.
- Se reexporta lo público desde `src/lib/data.ts`.

**Cambian:**
- `src/lib/data/invites.ts` (LF): los tipos `LeagueInvite`, `LeagueInviteDetails` e `InviteResponse` ganan
  `scorer?`; también `inviteNotices` y `respondErrorText`.
- `src/lib/data/topics.ts` (LF): el evento `scorers` (§6).
- `src/components/invite/InviteSheet.tsx` (LF): `ShareRow` generalizado.

**Componentes nuevos:**
- `src/components/scorers/ScorersButton.tsx`, `ScorersSheet.tsx` y `logic.ts`. `logic.ts` es puro y no dibuja nada:
  - `scorerReach` y `scorerReachText`;
  - `scorerRows`, `pickableMembers` y `personAction`;
  - `makeConfirm` y `removeConfirm`;
  - `inviteScorerText`, `linkStateText` y `scorerShareText`.

**Montaje:** las diez pantallas de §8.1.

**Líneas de fin de línea:** se conserva la de cada archivo (`git ls-files --eol`).
- CRLF: `EventPage.tsx`, `MeetPage.tsx`, `AdminPage.tsx`, `LeagueShell.tsx`, `LeagueProfilePage.tsx`,
  `PlayersPage.tsx`, `ClubsAdmin.tsx`, `types.ts`, `ui.tsx`, `auth.tsx` y `leagues.ts`.
- LF: todo lo demás que se nombra aquí, y todos los archivos nuevos.

---

## 10. Pruebas

### 10.1 SQL nuevas: `tests/sql/anotadores.test.ts` (con `makeWorld` y `withCopa` de `fixture.ts`)

1. **`set_member_scorer`:**
   - el admin (sofi) nombra a ana en la copa; no se nombra a sí mismo ni nombra a org, y queda `deny`;
   - ana, que es miembro, queda `deny`;
   - el dueño hace lo mismo que hoy;
   - una cuenta que no es miembro da `'no_existe'`;
   - una cuenta bloqueada da `'invalido'`;
   - un `p_ref` de otra liga da `'invalido'`;
   - nombrar dos veces no manda dos push, y queda en `push_outbox` el tag `anotador:<copa>` con la url del evento;
   - quitar el permiso a quien solo anota lo saca: ya no está en `league_members`;
   - quitárselo a quien tiene jugador lo deja en la liga como jugador.
2. **Boliche en una liga normal**, con un evento `'torneo'` nuevo en `w.priv`. Ana tiene la marca por `withCopa`:
   - puede usar `save_game`, `update_entry` (`scores`), `save_verified_games` con alguien ya inscrito, `assign_lanes`
     y `add_photo`;
   - en la práctica `w.e1`, todo sigue en `deny`: la prueba de `reglas-juegos.test.ts:257` pasa sin cambios.
3. **`invite_scorers`:**
   - solo admin: un miembro de la liga pública queda `deny`;
   - los estados `sent`, `pending`, `member`, `unavailable`, `declined` y `rate_limited`, con el tope compartido
     `invite:`;
   - reemplaza la pendiente para jugar: la vieja queda `cancelled` y la nueva sale `as_player` y `as_scorer`;
   - el push tiene título, tag `invitacion:<id>` y url; llega uno por día;
   - de 1 a 20 cuentas.
4. **`respond_league_invite`** con una invitación de anotador:
   - queda `is_scorer`, `scorer_only` y **no se crea ningún jugador** (cuenta de `players` igual), aunque llegue
     `p_prefer`;
   - devuelve `scorer: {title, scope, refId, path}`;
   - si la invitación también es para jugar: tiene jugador, `is_scorer` y no `scorer_only`;
   - si quien invitó ya no es admin: en la liga pública, con `as_player`, entra solo como jugador; en la privada, si
     era solo de anotador, queda `cancelled`;
   - el push al que invitó es «aceptó anotar».
5. **`accept_invites_on_join`:** con una invitación de anotador pendiente, `join_league` por el código da jugador e
   `is_scorer`, sin `scorer_only`.
6. **`my_league_invites` y `league_invite_details`:**
   - traen `scorer` solo en las de anotador;
   - esconden la de anotador cuyo invitador ya no es admin;
   - con `as_player = false`, `players` sale vacío.
7. **Links:**
   - crear es solo de admin;
   - una liga con menores da `'invalido'`;
   - crear dos veces da el mismo código;
   - el código cumple `^[A-HJ-NP-Z2-9]{10}$`;
   - el tope `scorer-link:` es de 20 por día;
   - con 10 abiertos, da `'cupo_lleno'`;
   - `rotate_scorer_link`: el viejo da `{status: 'revoked'}`;
   - `revoke_scorer_link`;
   - `scorer_access` lista los links y las invitaciones.
8. **`scorer_link_preview`:**
   - funciona sin cuenta (`db.rpc(ANON, …)`);
   - un código que no existe da null y cuenta en `preview:…`; con 30 fallos, `'rate_limited'`;
   - vencido o lleno da solo `{status}`;
   - uno que sirve trae los datos, y `member` y `canScore` son correctos;
   - sin cuenta no se puede hacer `select` en `private.scorer_links`.
9. **`join_as_scorer`:**
   - en la liga privada entra con `scorer_only`, sin jugador y con `uses = 1`;
   - un miembro con jugador queda `upgraded`: conserva su jugador y no queda `scorer_only`;
   - un admin queda `already` y no suma uso;
   - con el link vencido, lleno, quitado, o si su creador perdió el admin o está bloqueado, devuelve el estado y no
     entra nadie;
   - una cuenta bloqueada da `'bloqueada'`;
   - con 10 códigos malos, `'rate_limited'`;
   - quien creó el link recibe el push `anotador:<link>`, y si entran dos, se agrupa.
10. **`ensure_my_player`** de quien solo anota devuelve null y no crea nada. En cambio, `join_league(p_league)` crea
    el jugador y apaga `scorer_only`. Después, quitarle el permiso lo deja en la liga.
11. `remove_member` de sí mismo funciona para quien solo anota.
12. La vista `memberships` trae `scorer_only`.

### 10.2 SQL que cambian

- `tests/sql/reglas-juegos.test.ts:188-194`: pasa a «el dueño o un admin nombran anotadores; un admin no se nombra a
  sí mismo ni a otro admin». Ahora sofi puede nombrar a ana. `:243` sigue `DENIED`, porque sofi es admin.
- `tests/sql/reglas-ligas.test.ts:195`: la de sofi con ana en `w.priv` ahora funciona. Se corrige el título: «no
  cambia roles, pero sí nombra anotadores y desvincula jugadores».
- `tests/sql/seguridad.test.ts`:
  - `RPC_AUTHENTICATED` suma `create_scorer_link`, `invite_scorers`, `join_as_scorer`, `revoke_scorer_link`,
    `rotate_scorer_link`, `scorer_access` y `scorer_link_preview`;
  - `ANON_ALLOWED` suma `'public.scorer_link_preview'`, al final, porque la lista va en orden alfabético.
- `tests/sql/avisos-telefono.test.ts:124`: suma `'anotador:1'`, que da `'liga'`.
- `tests/sql/fixture.ts:143`: el comentario pasa a «en una liga normal de boliche la marca solo vale en sus
  torneos».
- **No se tocan** `scripts/supabase/smoke.sql`, `tests/sql/smoke.test.ts` ni `tests/sql/insignias.test.ts`: los está
  editando el otro equipo.

### 10.3 Cliente (vitest, `renderToString`)

- `src/components/scorers/logic.test.ts`:
  - el texto de alcance en los tres casos;
  - `personAction` en los cinco estados;
  - las confirmaciones: juega o no, boliche u otro deporte, solo anota, menores;
  - `inviteScorerText`, `linkStateText` y `scorerShareText`.
- `src/components/scorers/render.test.ts`:
  - la hoja con anotadores, invitados, «Juega» y «Solo anota»;
  - en una liga con menores, la pestaña Link con su texto;
  - el botón no sale para quien no es admin.
- `src/pages/ScorerJoinPage.test.ts`:
  - sin sesión: los links de entrar con `next=%2Fanotar%2F<code>%3Fentrar%3D1`;
  - vencido, lleno y que no existe;
  - con sesión y `canScore`: redirige.
- `src/pages/InvitePage.test.ts`: una invitación de anotador sin «¿Quién eres?».
- `src/pages/AdminPage.test.ts`: un admin ve «Hacer anotador» en un miembro, pero no en otro admin.
- `src/lib/data/scorers.flow.test.ts` (PGlite, `testkit.openWorld`): crear el link, verlo y entrar, y la membresía
  queda `scorerOnly` sin jugador; invitar, aceptar y quitar.
- `src/lib/league.test.ts` o `logic.test.ts`: `canScoreEvent` en boliche liga con torneo y con práctica, en torneo sin
  liga y en otro deporte.
- Lo que no cambia de comportamiento sigue con sus pruebas: `InviteSheet.test.ts` (`ShareRow` sin las props nuevas) y
  `notifications/inviteText.test.ts` (se suman los casos de anotador).

Antes de dar por terminada la entrega: `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm test:sql`.

---

## 11. Documentación

- **`supabase/README.md` (LF):**
  - la fila `20260929001400_anotadores.sql` en la tabla de migraciones (después de la de `001200`), con todo lo que
    redefine;
  - `league_members` y `memberships` (`scorer_only`);
  - `league_invites` (las columnas nuevas);
  - `private.scorer_links` en «Solo servidor»;
  - las RPC en «Ligas e invitaciones» y «Miembros y roles». `set_member_scorer` pasa a decir «dueño o admin; un admin,
    solo a miembros»;
  - el contrato de invitaciones (:526-537);
  - el tiempo real, con el evento `scorers`;
  - los avisos, con el prefijo `anotador:` en `liga`;
  - la lista de lo que corre sin cuenta.
- `docs/arquitectura.md:129-156`: las formas de entrar a una liga y el anotador sin jugador.
- `docs/insignias.md` no cambia: juez y parte ya usa la marca sin la regla del boliche.
- Este documento pasa a «implementado» al terminar.

---

## 12. Orden de implementación

1. Migración `20260929001400_anotadores.sql`, en este orden:
   - columnas y vista (§3.1, §3.2);
   - tabla (§3.3);
   - ayudas (§5.1);
   - redefiniciones (§5.2);
   - RPC nuevas (§5.3);
   - permisos (§5.4).
2. Pruebas SQL (§10.1 y §10.2) hasta que pase `pnpm test:sql`.
3. Datos del cliente: `types`, `rows`, `members`, `scorers.ts`, `invites.ts`, `topics.ts`, `league.tsx` y
   `LeagueShell`.
4. Quitar la creación automática de jugador para quien solo anota: `Notifications`, `LeagueProfilePage` con
   `ScorerOnly`, y `PlayersPage`.
5. La hoja y el botón (§8.2), y montarlo en las diez pantallas (§8.1).
6. `/anotar/:code` y su ruta (§8.3).
7. La invitación: `InvitePage`, `InvitesCard` e `inviteText` (§8.4).
8. Admin > Miembros y natación (§8.6), y `EventPage` con `canScoreEvent` (§8.7).
9. `supabase/README.md` y `docs/arquitectura.md`.
10. `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm test:sql`.

---

## 13. Preguntas abiertas para el dueño (con lo que se decidió mientras tanto)

1. **Boliche en una liga normal:** el anotador puede anotar en todos los torneos de la liga, pero no en las
   prácticas. ¿Así está bien? Lo decidido es que sí (D2).
2. **El link:** vence a los 7 días, tiene 20 usos y hay hasta 10 abiertos por liga. ¿Son suficientes para un torneo
   grande? Se cambia con una constante en la migración.
3. **Quitarle el permiso a quien entró solo para anotar lo saca de la liga** (D5). ¿O preferiría que se quedara como
   miembro sin jugador?
4. **Un admin puede quitar a un anotador que nombró el dueño.** Así lo pide «el admin o el dueño». ¿Está bien?
5. **El aviso «entró con tu link»** le llega solo a quien creó el link, no a todos los admins.

---

## Cambios al implementar

- **Base:**
  - la restricción nueva de `league_invites` se llama `league_invites_scope_ref_check`
    (`league_invites_scope_check` ya es el nombre que Postgres le da al `check` de la columna `scope`);
  - `set_member_scorer`, al quitar la marca sin sacar a la persona, no apaga `scorer_only`: un admin que entró solo
    para anotar sigue sin jugador y nadie se lo crea solo (§3.1);
  - `invite_to_league` y `private.people_item` también se redefinen: usan `private.league_invite_valid`, así una
    invitación de solo anotar que ya no vale no sale como «invitado» ni frena una nueva. Las invitaciones normales se
    comportan igual;
  - solo cuentan las invitaciones de anotador cuya parte de anotar todavía vale (`invite_scorers` → `pending`,
    `scorer_access`, `league_invite_details.scorer`);
  - `rotate_scorer_link` también mira el tope de 10 links y da `invalido` si el evento del link ya no existe;
  - `scorer_link_preview` con el límite lleno lanza `rate_limited` (como `invite_preview`); el cliente lo convierte
    en `{status: 'rate_limited'}`.
- **Pantallas:**
  - el subtítulo de la hoja es el nombre del torneo y el texto de hasta dónde llega el permiso va arriba del cuerpo
    (el subtítulo se corta en una línea);
  - la invitación y `/anotar` lo dicen a la persona («Podrás anotar…»);
  - `LeagueCtx.scorerOnly` es opcional; `rotateScorerLink` y `revokeScorerLink` reciben `(lid, link)`;
  - en el evento de boliche los íconos de arriba van juntos, sin espacio, para que el nombre quepa en un teléfono
    con los cuatro del admin;
  - en natación, quitar la marca de cronometrista a quien entró solo para anotar pregunta antes (sale de la liga).
- **Pruebas:** `scripts/supabase/smoke.sql` (sección 9i) y `tests/sql/pistas.test.ts` sí se tocaron.
- **Revisión (antes de publicar):**
  - `?entrar=1` solo entra solo con la marca de que se tocó el botón en ese teléfono (D12): antes, cualquier link con
    `?entrar=1` metía en la liga a quien lo abriera con sesión, sin tocar nada;
  - quitar vale aunque tenga el link: `private.scorer_link_blocks` (lo llenan los triggers
    `league_members_scorer_link_block*` cuando otro le quita la marca o lo saca; lo vacía
    `league_members_scorer_link_unblock` cuando un admin lo vuelve a hacer anotador). `join_as_scorer` y
    `scorer_link_preview` dan `{status: 'removed'}`. El aviso a quien creó el link y la confirmación de «Quitar» dicen
    que cambie el link si no sabe quién es;
  - «Ahora puedes anotar en …» sale una vez por día y liga (`private.push_due`);
  - `set_member_scorer(false)` no saca de la liga a quien tiene «Diseña insignias» (como `remove_member`);
  - si la liga pasa a tener menores, quien entró con un link (`private.scorer_link_joins`) y sigue solo anotando sale
    de la liga (trigger `leagues_scorer_links_minors`); el formulario lo dice antes de activarla;
  - la hoja: sin `participants` nadie sale con «Juega» (las portadas de torneo de raqueta y golf pasan los inscritos);
    la pregunta de juez y parte habla de esa persona («Podrá anotar…»); con menores no se menciona el link; los
    botones de cada fila miden 44 px; el relámpago usa siempre el contexto `liga`.
