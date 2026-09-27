/**
 * Claves de la caché de consultas y etiquetas para invalidar. Una sola lista para que las lecturas, las
 * escrituras, la cola y el tiempo real hablen de lo mismo.
 *
 * Etiquetas:
 * - `league:<liga>`: todo lo de esa liga (se usa al borrarla o al perder el acceso).
 * - `leagues`: listas de ligas. `members`: membresías de la cuenta. `feeds`: la campana.
 * - `events:<liga>` / `event:<evento>`, `entries:<liga>` / `entries:e:<evento>`, `subs:<liga>` / `subs:e:<evento>`,
 *   `live:e:<evento>`, `players:<liga>`, `members:<liga>`, `social:<liga>`, `suggestions:<liga>`.
 */

export const sortedKey = (ids: readonly string[]) => [...ids].sort().join(',');

export const keys = {
  league: (lid: string) => `league:${lid}`,
  publicLeagues: 'leagues:public',
  allLeagues: 'leagues:all',
  leaguesByIds: (ids: readonly string[]) => `leagues:ids:${sortedKey(ids)}`,
  invite: (lid: string) => `invite:${lid}`,
  membership: (lid: string, uid: string) => `member:${lid}:${uid}`,
  myMemberships: (uid: string) => `members:u:${uid}`,
  leagueMembers: (lid: string) => `members:l:${lid}`,
  users: 'users',
  profile: (uid: string) => `profile:${uid}`,
  players: (lid: string) => `players:${lid}`,
  player: (lid: string, id: string) => `player:${lid}:${id}`,
  events: (lid: string) => `events:${lid}`,
  event: (lid: string, id: string) => `event:${lid}:${id}`,
  allEntries: (lid: string) => `entries:l:${lid}`,
  eventEntries: (eventId: string) => `entries:e:${eventId}`,
  playerEntries: (lid: string, playerId: string) => `entries:p:${lid}:${playerId}`,
  entriesOfEvents: (lid: string, ids: readonly string[]) => `entries:evs:${lid}:${sortedKey(ids)}`,
  reactionsOfEvents: (lid: string, ids: readonly string[]) => `reactions:evs:${lid}:${sortedKey(ids)}`,
  commentsOfEvents: (lid: string, ids: readonly string[]) => `comments:evs:${lid}:${sortedKey(ids)}`,
  eventSubs: (eventId: string) => `subs:e:${eventId}`,
  subs: (lid: string, status: string) => `subs:s:${lid}:${status}`,
  playerSubs: (lid: string, playerId: string) => `subs:p:${lid}:${playerId}`,
  live: (eventId: string) => `live:e:${eventId}`,
  suggestions: (lid: string) => `suggestions:${lid}`,
};

export const tags = {
  league: (lid: string) => `league:${lid}`,
  leagues: 'leagues',
  members: 'members',
  leagueMembers: (lid: string) => `members:${lid}`,
  feeds: 'feeds',
  events: (lid: string) => `events:${lid}`,
  event: (eventId: string) => `event:${eventId}`,
  entries: (lid: string) => `entries:${lid}`,
  eventEntries: (eventId: string) => `entries:e:${eventId}`,
  subs: (lid: string) => `subs:${lid}`,
  eventSubs: (eventId: string) => `subs:e:${eventId}`,
  live: (eventId: string) => `live:e:${eventId}`,
  players: (lid: string) => `players:${lid}`,
  social: (lid: string) => `social:${lid}`,
  suggestions: (lid: string) => `suggestions:${lid}`,
  users: 'users',
  profile: (uid: string) => `profile:${uid}`,
};
