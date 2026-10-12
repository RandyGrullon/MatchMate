import type { GameId } from './catalog';

/**
 * Plataformas de los juegos de esports (docs/perfiles-equipos-esports.md §4): dónde se juega cada juego, la plataforma
 * de un torneo (una de ellas o «crossplay») y si el ID de un jugador sirve para ese torneo. Es la misma lista que
 * `private.esp_game_platforms` en la base.
 */

export type Platform = 'pc' | 'playstation' | 'xbox' | 'switch' | 'mobile';
export type TournamentPlatform = Platform | 'crossplay';

export const PLATFORM_LABEL: Record<TournamentPlatform, string> = {
  pc: 'PC',
  playstation: 'PlayStation',
  xbox: 'Xbox',
  switch: 'Nintendo Switch',
  mobile: 'Móvil',
  crossplay: 'Crossplay',
};

/** Corto, para las filas («PS», «Switch»). */
export const PLATFORM_SHORT: Record<TournamentPlatform, string> = {
  pc: 'PC',
  playstation: 'PS',
  xbox: 'Xbox',
  switch: 'Switch',
  mobile: 'Móvil',
  crossplay: 'Crossplay',
};

const ALL: readonly Platform[] = ['pc', 'playstation', 'xbox', 'switch', 'mobile'];

export const GAME_PLATFORMS: Record<GameId, readonly Platform[]> = {
  valorant: ['pc'],
  cs2: ['pc'],
  lol: ['pc'],
  mlbb: ['mobile'],
  clash_royale: ['mobile'],
  free_fire: ['mobile'],
  pubg_mobile: ['mobile'],
  smash: ['switch'],
  rocket_league: ['pc', 'playstation', 'xbox', 'switch'],
  ea_fc: ['pc', 'playstation', 'xbox', 'switch'],
  nba_2k: ['pc', 'playstation', 'xbox', 'switch'],
  sf6: ['pc', 'playstation', 'xbox'],
  tekken8: ['pc', 'playstation', 'xbox'],
  warzone: ['pc', 'playstation', 'xbox'],
  fortnite: ['pc', 'playstation', 'xbox', 'switch', 'mobile'],
};

export const isPlatform = (v: unknown): v is Platform => typeof v === 'string' && (ALL as readonly string[]).includes(v);

/** Dónde se juega (vacío si el juego no se conoce). */
export const gamePlatforms = (game: string | null | undefined): readonly Platform[] =>
  (game && (GAME_PLATFORMS as Record<string, readonly Platform[]>)[game]) || [];

/** Las opciones de plataforma para un torneo de ese juego: las suyas y, si tiene más de una, «crossplay» primero. */
export function tournamentPlatformOptions(game: string | null | undefined): TournamentPlatform[] {
  const own = gamePlatforms(game);
  return own.length > 1 ? ['crossplay', ...own] : [...own];
}

/** La plataforma con que empieza un torneo nuevo: la única del juego, o «crossplay». */
export function defaultTournamentPlatform(game: string | null | undefined): TournamentPlatform | '' {
  const own = gamePlatforms(game);
  if (!own.length) return '';
  return own.length === 1 ? own[0]! : 'crossplay';
}

/** NBA 2K guardaba la plataforma del ID (psn, xbox, steam, switch): su plataforma de ahora. */
export const NBA_KEY_PLATFORM: Record<string, Platform> = { psn: 'playstation', xbox: 'xbox', steam: 'pc', switch: 'switch' };

/** La plataforma de un torneo como se guarda hoy (convierte los valores viejos de NBA 2K); '' si no hay. */
export function tournamentPlatform(game: string | null | undefined, raw: unknown): TournamentPlatform | '' {
  const v: string = typeof raw === 'string' ? ((NBA_KEY_PLATFORM as Record<string, Platform | undefined>)[raw] ?? raw) : '';
  if (v === 'crossplay') return gamePlatforms(game).length > 1 ? 'crossplay' : defaultTournamentPlatform(game);
  if (isPlatform(v) && gamePlatforms(game).includes(v)) return v;
  return defaultTournamentPlatform(game);
}

/** Dónde juega un ID: lo que dijo el jugador, o lo que sale solo (juego de una plataforma, o la clave de NBA 2K). */
export function idPlatforms(game: string, rec: { platform?: string | null; platforms?: readonly string[] | null } | null | undefined): Platform[] {
  if (!rec) return [];
  const own = gamePlatforms(game);
  if (own.length === 1) return [own[0]!];
  const fromKey = rec.platform ? (NBA_KEY_PLATFORM as Record<string, Platform | undefined>)[rec.platform] : undefined;
  if (fromKey) return [fromKey];
  return (rec.platforms ?? []).filter((p): p is Platform => isPlatform(p) && own.includes(p));
}

export type PlatformProblem = 'otra_plataforma' | 'sin_plataforma';

/**
 * ¿El ID sirve para el torneo? null = sí. 'sin_plataforma': el juego tiene varias plataformas y el ID no dice dónde
 * juega; 'otra_plataforma': juega en otras. Un torneo «crossplay» acepta cualquiera.
 */
export function platformProblem(game: string, tournament: TournamentPlatform | '', playsOn: readonly Platform[]): PlatformProblem | null {
  if (!tournament || tournament === 'crossplay') return null;
  if (!playsOn.length) return gamePlatforms(game).length > 1 ? 'sin_plataforma' : null;
  return playsOn.includes(tournament) ? null : 'otra_plataforma';
}

/** «PC», «PlayStation y Xbox», «PC, PlayStation y Xbox». */
export function platformsText(list: readonly TournamentPlatform[]): string {
  const names = list.map((p) => PLATFORM_LABEL[p]);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
}
