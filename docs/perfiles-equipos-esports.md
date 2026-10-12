# Perfiles, equipos como perfil, compartir partidos y plataformas de esports

Migración: `supabase/migrations/20261012000100_perfiles_equipos_esports.sql`. Pruebas:
`tests/sql/perfiles-equipos-esports.test.ts`. Contrato para la app; las formas van en camelCase y las horas en ISO.

## 1. Perfil global: dónde juega cada persona

`player_places(p_user uuid) returns jsonb` (también sin sesión, con las mismas reglas que `public_profile`; null si
esa persona bloqueó al que mira o no existe).

```ts
type PlaceSummary =
  | { kind: 'bowling'; games: number; average: number | null; high: number | null }
  | { kind: 'matches'; played: number; won: number; drawn: number; lost: number }   // raqueta, equipos y esports
  | { kind: 'golf'; rounds: number; best: number | null }
  | { kind: 'swim'; results: number }
  | { kind: 'none' };
type LeaguePlace = {
  leagueId: string; name: string; kind: 'liga' | 'torneo'; sport: string; game: string | null;
  logo: string | null; visibility: 'public' | 'private'; playerId: string; summary: PlaceSummary;
};
type SquadPlace = SquadLite & { role: 'captain' | 'member' };            // SquadLite de docs/equipos-y-en-vivo.md
type EsportsTeamPlace = { id: string; game: string; name: string; tag: string; logo: string | null;
  role: 'captain' | 'member' | 'sub' };
type PlayerPlaces = { leagues: LeaguePlace[]; squads: SquadPlace[]; esportsTeams: EsportsTeamPlace[] };
```

- **Ligas:** las de `private.social_players(array[p_user], null)`, es decir las que el que mira puede ver y sin
  menores. El resumen agrupa por liga lo mismo que `profile_stats`. Primero las ligas, después los torneos; dentro,
  por actividad más reciente.
- **Equipos (`squads`):** todos los del usuario.
- **Equipos de esports:** los suyos (`esports_team_members`).

## 2. Compartir un partido como publicación

- **Tabla `posts`:** suma `game_kind text` ('bowling' | 'match' | 'golf' | 'swim' | 'solo'), `game_id uuid` y
  `game_player uuid` (null en solo). Van los tres o ninguno.
- **`create_post`:** se borra y se vuelve a crear con tres parámetros más al final, todos con default null:
  `p_game_kind text`, `p_game_id uuid` y `p_game_player uuid`.
  - Con juego de liga, `p_league` es obligatorio y tiene que ser la liga del juego (`invalido` si no).
  - Quien publica tiene que poder ver ese juego. No hace falta que sea su juego: se puede compartir el partido de
    otro.
  - El juego tiene que estar terminado, con las mismas reglas que `social_items`.
  - Un juego suelto (`solo`) solo lo comparte su dueño, sin liga y estando compartido.
  - Una publicación con juego puede ir sin texto ni foto.
- **`private.social_game_one(p_kind, p_id, p_player)`** devuelve el juego con la misma forma de cada elemento de
  `profile_games` (`ProfileGame` en src/lib/data/profileGames.ts), o null si el que mira no lo puede ver.
- **`private.post_json`:** suma `game: ProfileGame | null` y `hasGame: boolean`. `hasGame` es true si la publicación lleva un
  juego aunque quien mira no lo pueda ver; entonces `game` va null y la app dice «Juego no disponible».

## 3. Equipos como perfil

- **`squad_page`** suma `posts` (cuántas publicaciones del muro) y `likes` (los me gusta de esas publicaciones más los
  de los juegos de sus jugadores en las ligas del equipo).
- **`squad_followers(p_squad uuid, p_limit integer default 30, p_before timestamptz default null, p_before_id uuid default null)`**
  devuelve la misma forma que `follow_list`: `{ id, name, username, avatar, at, isFollowing, followsYou, isMe }[]`.
  Funciona sin sesión, pero entonces `isFollowing` y `followsYou` van en false.
- **`squad_games(p_squad uuid, p_limit integer default 20, p_before timestamptz default null, p_before_key text default null)`**
  devuelve los partidos de los equipos de liga con ese `squad_id`, terminados o confirmados, de ligas que el que mira
  puede ver:

```ts
type SquadGame = { key: string; matchId: string; leagueId: string; leagueName: string; sport: string; at: string;
  side: 1 | 2; mine: string; opponent: string | null; score: string | null; result: 'win' | 'loss' | 'draw' | null;
  walkover: boolean; stage: string | null; round: string | null; url: string };
```

- **`squad_stats(p_squad uuid)`** devuelve `{ record, leagues: [...], tournaments: [...] }`:
  - `leagues`: `{ leagueId, name, kind, sport, logo, record, seasons: [{ seasonId, name, record }] }`.
  - `tournaments`: `{ leagueId, eventId, name, sport, date, record }`. Son las ligas tipo torneo y los eventos tipo
    torneo donde jugó.
- **`squad_posts` sin sesión:** devuelve lo público.

### Invitar dentro de la app

- **Tabla `squad_invites`** `(id, squad_id, user_id, invited_by, status 'pending'|'accepted'|'declined'|'cancelled',
  created_at, updated_at, decided_at)`, con una pendiente por equipo y persona.
- **`invite_to_squad(p_squad uuid, p_users uuid[])`** devuelve `{ sent, results: [{ userId, status }] }`.
  - `status`: 'sent' | 'member' | 'pending' | 'unavailable' | 'full' | 'rate_limited'.
  - Solo el capitán. Respeta el tope de 40, los bloqueos en las dos direcciones y 50 envíos por día.
- **`respond_squad_invite(p_invite uuid, p_accept boolean)`** devuelve `{ squadId }` o `{}`. Al aceptar hace lo mismo
  que `join_squad`: tope, límite de equipos, avisa al capitán y quita el «seguir».
- **`cancel_squad_invite(p_invite uuid)`** (el capitán) devuelve void.
- **`my_squad_invites()`** devuelve `[{ id, squad: SquadLite, invitedBy: { id, name, username }, createdAt }]`.
- **`squad_pending_invites(p_squad uuid)`** (el capitán) devuelve `[{ id, user: PersonLite, createdAt }]`.
- **`join_squad`** acepta también la invitación pendiente de esa persona.
- **`search_people`** se borra y se vuelve a crear con `p_squad uuid default null` al final. Con `p_squad`, cada persona
  trae `inSquad` y `invited` de ese equipo, y solo el capitán puede pedirlo.
- **Aviso al teléfono:** categoría 'liga', tag `equipo:invitacion:<id>`, url `/equipos/<squad>`. Tiempo real
  `invites` en `user:<invitado>`.

## 4. Esports: plataformas y otra cuenta

- **Plataformas** (`private.esp_game_platforms(p_game text) returns text[]`, igual que `platforms` en
  src/sports/esports/catalog.ts). Valores: `pc`, `playstation`, `xbox`, `switch`, `mobile`.

| Juego | Plataformas |
| --- | --- |
| valorant, cs2, lol | pc |
| mlbb, clash_royale, free_fire, pubg_mobile | mobile |
| smash | switch |
| rocket_league, ea_fc, nba_2k | pc, playstation, xbox, switch |
| sf6, tekken8, warzone | pc, playstation, xbox |
| fortnite | pc, playstation, xbox, switch, mobile |

- **Plataforma del torneo:** `settings.platform` sirve para todos los juegos. Es una de las plataformas del juego, o
  `crossplay` si el juego tiene más de una.
  - El default es la única plataforma del juego, o `crossplay`.
  - NBA 2K viejo: `psn` → `playstation`, `steam` → `pc`, `xbox` y `switch` quedan igual. Se convierten los torneos
    que ya existen.
  - `esp_settings_ok` lo valida.
- **ID del jugador:** `esports_game_ids` suma `platforms text[] not null default '{}'`, que son las plataformas donde
  juega con ese ID.
  - Si el juego tiene una sola plataforma, se pone sola.
  - En NBA 2K, la clave `platform` sigue siendo la del ID (`psn`, `xbox`, `steam`, `switch`) y `platforms` se deriva
    de ella.
  - `esports_save_game_id` suma `p_platforms text[] default null` (null deja las que tenía).
  - **`esports_set_game_platforms(p_game text, p_platforms text[], p_platform text default '')`** cambia solo las
    plataformas, también en un ID conectado con login.
- **Bloquear:** `private.esp_member_ok` devuelve un código nuevo cuando el torneo no es `crossplay`:
  - **`otra_plataforma`**: el ID tiene plataformas y ninguna es la del torneo.
  - **`sin_plataforma`**: el juego tiene varias plataformas y el ID todavía no dice dónde juega.
  - Le llegan a `register_solo`, `register_team` y `set_entry_roster`. El `detail` lleva el nombre de la persona.
- **`esports_refresh_entry_ids(p_entry uuid)`** devuelve `{ updated }`. Vuelve a tomar `gamer_tag` y `ranks` de los
  miembros con el ID que tienen ahora.
  - Lo usa el capitán (todos los miembros) o cada jugador (el suyo).
  - Solo con el torneo en inscripción y la inscripción pendiente o aprobada.
  - Con el ID nuevo pasa otra vez por `esp_member_ok`.
- **`esports_link_account`:** devuelve `cerrado` si `esp_id_locked` (inscrito y aprobado en un torneo en curso) y
  mantiene las `platforms`.
- **Edge Function `esports-auth`:**
  - `start` recibe `volver` (solo una ruta de la app que empiece con `/` y no con `//`) y lo guarda con el `state`.
  - Al terminar, `appRedirect` vuelve a `volver` con `?conectado=` o `?error=`. Sin `volver`, vuelve a
    `/esports/mi-id`.
  - Epic y Riot agregan `prompt=login` (sale para elegir o entrar con otra cuenta). Steam no lo permite.
