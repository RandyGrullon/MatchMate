# Equipos y transmisiones en vivo

Migración: `supabase/migrations/20261011000100_equipos_en_vivo.sql`. Pruebas: `tests/sql/equipos-en-vivo.test.ts`.

## 1. Equipos (fuera de una liga)

Un equipo competitivo de cualquier deporte (menos esports, que ya tiene los suyos: `esports_teams`), con plantilla,
capitán, código para unirse, logo, seguidores, muro y la opción de inscribirse en ligas de su deporte. En la base se
llaman `squads` (porque `teams` ya son los equipos de cada liga); en la app, «Equipos».

### Tablas (RLS y sin lectura directa: todo por RPC)

- `squads (id, sport, name 2–40, tag 2–5 [A-Z0-9], description ≤ 200, city ≤ 40 null, color '#rrggbb' null,
  logo_path null, recruiting bool, captain_id, member_count, follower_count, created_by, created_at, updated_at)`.
  `sport` es un deporte de `sport_status` que no es esports. Nombre único por deporte (sin acentos ni mayúsculas).
  Logo en el bucket `logos`: `'<squad>/<uuid>.(webp|jpg|png)'` (como los equipos de esports).
- `squad_members (squad_id, user_id, role 'captain'|'member', position ≤ 20 null, jersey 0–99 null, joined_at)`.
  Un capitán por equipo, hasta 40 miembros. Si el capitán borra su cuenta, pasa al miembro más antiguo; sin miembros,
  el equipo se borra.
- `squad_secrets (squad_id, invite_code)` (8 letras y números como los de las ligas).
- `squad_follows (squad_id, user_id, created_at)`.
- `squad_league_requests (id, squad_id, league_id, status 'pending'|'approved'|'rejected'|'withdrawn',
  requested_by, decided_by, note ≤ 200, created_at, decided_at)`. Una pendiente por equipo y liga.
- `teams.squad_id` (null): el equipo de la liga que salió de un equipo.
- `posts.squad_id` (null): publicación en el muro del equipo.

### Reglas

- Crear: cualquier cuenta (sin bloquear); 5 por día y hasta 10 equipos de los que es capitán. Quien crea es capitán.
- Unirse: con el código o el link `/equipos/unirse/<código>` (o su QR). Hasta 20 equipos por cuenta.
- El capitán edita el equipo, cambia el código, saca miembros, pone posición y número, y pasa la capitanía. No puede
  salir mientras haya otros miembros (primero pasa la capitanía).
- Seguir: cualquier cuenta, no hace falta ser miembro (los miembros no lo siguen: ya lo ven).
- Publicar en el muro: los miembros. Las publicaciones del equipo son `public` y salen en Siguiendo a quien sigue el
  equipo o es miembro.
- Inscribirse en una liga: el capitán, en una liga del mismo deporte de la familia de equipos (fútbol, futsal,
  baloncesto), pública o de la que ya es miembro, sin menores. Los admins de la liga aprueban o rechazan. Al aprobar:
  se crea el equipo de la liga (en la temporada abierta, si hay) con el nombre y color del equipo y `squad_id`, y cada
  miembro entra a la liga (miembro y jugador) y a la plantilla (el capitán como `captain`). Quien ya está en otro
  equipo de esa temporada se salta (la respuesta dice cuántos). `sync_squad_roster` vuelve a pasar los nuevos.
- Récord: partidos terminados o confirmados de los equipos de liga con su `squad_id` (ganados, empatados, perdidos).

### Formas (JSON)

```ts
type SquadLite = { id: string; sport: string; name: string; tag: string; logo: string | null; color: string | null;
  city: string | null; recruiting: boolean; members: number; followers: number };
type SquadMember = { id: string; name: string; username: string | null; avatar: string | null;
  role: 'captain' | 'member'; position: string | null; jersey: number | null; isMe: boolean };
type SquadLeague = { leagueId: string; name: string; sport: string; logo: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'; requestId: string;
  record: { played: number; won: number; drawn: number; lost: number } };
type SquadPage = SquadLite & { description: string; captainId: string; isMember: boolean;
  myRole: 'captain' | 'member' | null; isFollowing: boolean; createdAt: string;
  roster: SquadMember[];         // la plantilla ([] sin sesión); `members` sigue siendo el número
  leagues: SquadLeague[]; record: { played: number; won: number; drawn: number; lost: number } };
type MySquad = SquadLite & { role: 'captain' | 'member' };
type SquadRequest = { id: string; squad: SquadLite; status: string; note: string | null; createdAt: string;
  requestedBy: { id: string; name: string } };
```

### RPC

| RPC | Devuelve |
| --- | --- |
| `create_squad(p_sport text, p_name text, p_tag text, p_description text default '', p_city text default null, p_color text default null, p_id uuid default null)` | `{ squadId, inviteCode }` |
| `update_squad(p_squad uuid, p_patch jsonb)` (name, tag, description, city, color, recruiting) | `void` |
| `delete_squad(p_squad uuid)` | `void` |
| `squad_code(p_squad uuid)` / `renew_squad_code(p_squad uuid)` | `text` |
| `squad_preview(p_code text)` (también sin sesión) | `SquadLite \| null` |
| `join_squad(p_code text)` | `{ squadId }` (`cupo_lleno`, `limite`) |
| `leave_squad(p_squad uuid)` / `remove_squad_member(p_squad uuid, p_user uuid)` | `void` |
| `set_squad_member(p_squad uuid, p_user uuid, p_role text default null, p_position text default null, p_jersey integer default null)` | `void` |
| `begin_squad_logo(p_squad uuid, p_path text)` / `set_squad_logo(p_squad uuid, p_path text)` | `void` / ruta anterior |
| `squad_page(p_squad uuid)` (también sin sesión) | `SquadPage \| null` |
| `my_squads()` | `MySquad[]` |
| `follow_squad(p_squad uuid)` / `unfollow_squad(p_squad uuid)` | `{ following, followers }` |
| `followed_squads(p_limit integer default 50)` | `SquadLite[]` |
| `search_squads(p_query text, p_sport text default null, p_limit integer default 20)` | `SquadLite[]` |
| `squad_posts(p_squad uuid, p_limit integer default 20, p_before timestamptz default null, p_before_id uuid default null)` | `Post[]` |
| `request_squad_league(p_squad uuid, p_league uuid)` | `uuid` |
| `withdraw_squad_request(p_request uuid)` | `void` |
| `league_squad_requests(p_league uuid)` (admins) | `SquadRequest[]` (pendientes primero) |
| `decide_squad_request(p_request uuid, p_approve boolean, p_note text default null)` | `{ teamId, added, skipped }` o `{}` al rechazar |
| `sync_squad_roster(p_squad uuid, p_league uuid)` (capitán o admin) | `{ added, skipped }` |

`create_post` suma `p_squad uuid default null` (miembros; la publicación sale con `squad: SquadLite | null`) y el feed
Siguiendo suma lo de los equipos que sigo o de los que soy miembro.

Avisos al teléfono (categoría `liga`, prefijo `equipo:`): «X se unió a tu equipo» al capitán, «<equipo> quiere entrar a
<liga>» a los admins, «<liga> aceptó/rechazó a <equipo>» al capitán.

## 2. Transmisiones en vivo

Una liga puede activar «Transmisiones en vivo» (`leagues.live_enabled`). Entonces sus admins y anotadores ponen el link
de la transmisión (YouTube, Twitch, Facebook, Kick, Instagram o TikTok) de un partido, de un evento o de la liga, la app
la muestra arriba en la liga y en Hoy con «EN VIVO», se comparte con un link y avisa a los miembros y seguidores.

### Tabla

- `live_streams (id, league_id, match_id null, event_id null, url, platform, title ≤ 80 null, started_by, started_at,
  ended_at null)`. Activa = sin `ended_at` y empezada hace menos de 12 horas. Una activa por partido o evento y hasta 5
  por liga.

### RPC

| RPC | Devuelve |
| --- | --- |
| `set_league_live(p_league uuid, p_enabled boolean)` (admins) | `void` |
| `start_stream(p_league uuid, p_url text, p_title text default null, p_match uuid default null, p_event uuid default null)` | `LiveStream` |
| `end_stream(p_stream uuid)` | `void` |
| `league_streams(p_league uuid)` (también sin sesión si la liga es pública) | `LiveStream[]` activas |
| `live_now(p_limit integer default 10)` | `LiveStream[]` de mis ligas y de las ligas y equipos que sigo |

```ts
type LiveStream = { id: string; leagueId: string; leagueName: string; sport: string; matchId: string | null;
  eventId: string | null; url: string; platform: 'youtube' | 'twitch' | 'facebook' | 'kick' | 'instagram' | 'tiktok';
  title: string | null; label: string | null;  // «Tigres vs Leones» o el nombre del evento
  startedAt: string; startedBy: { id: string; name: string }; canEnd: boolean };
```

- Quién: `start_stream`/`end_stream` los admins y anotadores de la liga (en el boliche, los admins), con la liga en
  `live_enabled`. 20 por día por liga. Link https de esos sitios (`private.stream_platform`); otro: `invalido`.
- Aviso (categoría `liga`, prefijo `envivo:`): a los miembros y seguidores de la liga (sin quien la empezó, sin
  bloqueados), uno por liga cada 30 min: «🔴 En vivo: <título o partido>», cuerpo el nombre de la liga, url
  `/l/<liga>/vivo`.
- Tiempo real: `league:<liga>` evento `streams`.
- `leagues.live_enabled` sale en las lecturas de la liga (columna nueva).
