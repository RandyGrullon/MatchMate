import { useMemo } from 'react';
import { formatSwimTime } from '../../sports/swimming/time';
import { BackendError } from '../backend/types';
import { getUserId, invalidate, queryClient, remember, rpc, type Live } from './client';
import { peopleKeys, peopleTags, patchPaged, usePaged, type Paged } from './follows';
import { tags } from './keys';
import { soloTags } from './solo';

/**
 * Los juegos del perfil (de todos los deportes), los de las cuentas que sigo (el inicio), los números por deporte
 * y los me gusta. La base decide qué se ve (20260928000200_social.sql): solo ligas que la cuenta que mira puede
 * leer y nunca las que tienen menores. Los juegos sueltos de boliche compartidos (sin liga, 20260929000300_sueltos_logos.sql)
 * salen como otro tipo de juego: 'solo'.
 *
 * RPC: profile_games, following_games, profile_stats, set_game_like.
 */

// ---------- Tipos ----------

export type GameKind = 'bowling' | 'match' | 'golf' | 'swim' | 'solo';

export interface BowlingGameDetail {
  /** Pinos de cada juego anotado. */
  scores: number[];
  /** Cada juego tiene foto (verificado). */
  verified: boolean[];
  series: number;
  high: number;
}

export interface MatchGameDetail {
  /** Lado del jugador (1 o 2). */
  side: 1 | 2;
  /** Nombre de su lado y del rival. */
  mine: string | null;
  opponent: string | null;
  score: string | null;
  /** Cómo le fue; null = W.O. de los dos o sin resultado. */
  result: 'win' | 'loss' | 'draw' | null;
  walkover: boolean;
  /** El resultado ya quedó firme. */
  final: boolean;
  status?: string;
  stage?: string | null;
  round?: number | null;
}

export interface GolfGameDetail {
  course: string | null;
  holes: number;
  played: number;
  gross: number;
  playingHcp?: number | null;
  signed?: boolean;
  dq?: boolean;
}

export interface SwimGameDetail {
  distance: number;
  stroke: string;
  pool: number;
  timeCs: number | null;
  status: string;
  /** Puesto en su prueba (solo con tiempo válido). */
  place: number | null;
}

/** Juego suelto de boliche (de ninguna liga ni torneo). */
export interface SoloGameDetail {
  /** «Juego suelto». */
  title: string;
  /** Bolera (null si no la puso). */
  venue: string | null;
  scores: number[];
  series: number;
  high: number;
}

interface GameBase {
  /** Clave única en las listas (y cursor de las páginas). En un partido: `m:<partido>:<jugador>`. */
  key: string;
  /** Participación (boliche), partido, tarjeta (golf) o resultado (natación). */
  id: string;
  playerId: string;
  userId: string;
  userName: string;
  leagueId: string;
  leagueName: string;
  sport: string;
  eventId: string | null;
  eventName: string;
  eventType: string | null;
  /** YYYY-MM-DD. */
  eventDate: string | null;
  /** Hora del juego (ISO): para ordenar y como cursor. */
  at: string;
  /** Ruta de la app al juego. */
  url: string;
  likes: number;
  likedByMe: boolean;
}

/** Un juego suelto no es de ninguna liga: sin jugador ni liga, y la ruta solo la tiene su dueño (null para los demás). */
interface SoloBase extends Omit<GameBase, 'playerId' | 'leagueId' | 'leagueName' | 'url'> {
  playerId: null;
  leagueId: null;
  leagueName: null;
  url: string | null;
}

export type ProfileGame =
  | (GameBase & { kind: 'bowling'; detail: BowlingGameDetail })
  | (GameBase & { kind: 'match'; detail: MatchGameDetail })
  | (GameBase & { kind: 'golf'; detail: GolfGameDetail })
  | (GameBase & { kind: 'swim'; detail: SwimGameDetail })
  | (SoloBase & { kind: 'solo'; detail: SoloGameDetail });

/** Números por deporte de una cuenta (lo que ve la cuenta que mira). */
export interface ProfileStats {
  bowling: { sessions: number; series: number[][] } | null;
  matches: { sport: string; played: number; won: number; lost: number; drawn: number }[];
  golf: { rounds: number; best18: number | null; avg18: number | null; best9: number | null } | null;
  swim: { results: number; bests: { distance: number; stroke: string; pool: number; timeCs: number }[] } | null;
}

// ---------- Lecturas ----------

export const GAMES_PAGE = 20;

type Cursor = Pick<ProfileGame, 'at' | 'key'> | null;

const cursorArgs = (after: Cursor) => ({ p_before: after?.at ?? null, p_before_key: after?.key ?? null });

export const fetchProfileGames = (uid: string, opts: { sport?: string | null; after?: Cursor; limit?: number } = {}) =>
  rpc<ProfileGame[]>('profile_games', { p_user: uid, p_limit: opts.limit ?? GAMES_PAGE, p_sport: opts.sport ?? null, ...cursorArgs(opts.after ?? null) });

export const fetchFollowingGames = (opts: { sport?: string | null; after?: Cursor; limit?: number } = {}) =>
  rpc<ProfileGame[]>('following_games', { p_limit: opts.limit ?? GAMES_PAGE, p_sport: opts.sport ?? null, ...cursorArgs(opts.after ?? null) });

export const profileGamesKey = (uid: string, sport: string | null | undefined) => `people:games:${uid}:${sport || '*'}`;
export const followingGamesKey = (sport: string | null | undefined) => `people:feed:${sport || '*'}`;

/** Juegos de una cuenta, más nuevos primero, por páginas de 20 (con `sport`, solo de ese deporte). */
export function useProfileGames(uid: string | null | undefined, sport?: string | null): Paged<ProfileGame> {
  return usePaged<ProfileGame>({
    key: uid && getUserId() ? profileGamesKey(uid, sport) : null,
    desc: { kind: 'profileGames', id: uid ?? undefined, status: sport || undefined },
    tags: uid ? [peopleTags.all, peopleTags.user(uid)] : [],
    pageSize: GAMES_PAGE,
    fetchPage: (after, limit) => fetchProfileGames(uid!, { sport, after, limit }),
    itemKey: (g) => g.key,
  });
}

/** Juegos recientes de las cuentas que sigo (el inicio; con `sport`, solo de ese deporte). */
export function useFollowingGames(sport?: string | null): Paged<ProfileGame> {
  return usePaged<ProfileGame>({
    key: getUserId() ? followingGamesKey(sport) : null,
    desc: { kind: 'profileGames', status: sport || undefined },
    tags: [peopleTags.all, peopleTags.feed],
    pageSize: GAMES_PAGE,
    fetchPage: (after, limit) => fetchFollowingGames({ sport, after, limit }),
    itemKey: (g) => g.key,
    pollMs: 120_000,
  });
}

export const fetchProfileStats = (uid: string) => rpc<ProfileStats | null>('profile_stats', { p_user: uid });

/** Números por deporte de una cuenta (null mientras carga o si no se ve: mirar `loading`). */
export function useProfileStats(uid: string | null | undefined): Live<ProfileStats | null> {
  const key = uid && getUserId() ? `people:stats:${uid}` : null;
  if (key) remember(key, { kind: 'profileStats', id: uid! });
  const st = queryClient.useQuery<ProfileStats | null>(key, () => fetchProfileStats(uid!), {
    initial: null,
    tags: uid ? [peopleTags.all, peopleTags.user(uid)] : [],
    staleMs: 60_000,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

// ---------- Me gusta ----------

export interface LikeResult {
  likes: number;
  liked: boolean;
}

/** El mismo juego en cualquier lista (en un partido, el juego es de cada jugador). */
const sameGame = (a: Pick<ProfileGame, 'kind' | 'id' | 'playerId'>, b: Pick<ProfileGame, 'kind' | 'id' | 'playerId'>) =>
  a.kind === b.kind && a.id === b.id && (a.kind !== 'match' || a.playerId === b.playerId);

/** Cambia el me gusta de un juego en todas las listas de la caché. */
export function patchGameLikes(game: Pick<ProfileGame, 'kind' | 'id' | 'playerId'>, fn: (g: ProfileGame) => Pick<ProfileGame, 'likes' | 'likedByMe'>) {
  patchPaged<ProfileGame>('profileGames', (g) => {
    if (!sameGame(g, game)) return g;
    const next = fn(g);
    return next.likes === g.likes && next.likedByMe === g.likedByMe ? g : { ...g, ...next };
  });
}

/** Cuenta de me gusta después de cambiar el mío (sin bajar de 0). */
export function optimisticLikes(g: Pick<ProfileGame, 'likes' | 'likedByMe'>, liked: boolean): Pick<ProfileGame, 'likes' | 'likedByMe'> {
  if (g.likedByMe === liked) return { likes: g.likes, likedByMe: liked };
  return { likes: Math.max(0, g.likes + (liked ? 1 : -1)), likedByMe: liked };
}

/**
 * Me gusta (true) o quitarlo (false) en el juego de alguien. Se ve al momento en todas las listas y después queda
 * lo que dice el servidor; si falla, se vuelve a leer y sale el error (p. ej. «rate_limited»).
 */
export async function setGameLike(game: Pick<ProfileGame, 'kind' | 'id' | 'playerId' | 'userId' | 'leagueId'>, liked: boolean): Promise<LikeResult> {
  if (!getUserId()) throw new BackendError('Entra a tu cuenta para dar me gusta.', 'auth', 'session_not_found');
  patchGameLikes(game, (g) => optimisticLikes(g, liked));
  let ok = false;
  try {
    const res = await rpc<LikeResult>('set_game_like', {
      p_kind: game.kind,
      p_id: game.id,
      p_liked: liked,
      p_player: game.kind === 'match' ? game.playerId : null,
    });
    ok = true;
    patchGameLikes(game, () => ({ likes: res.likes, likedByMe: res.liked }));
    return res;
  } finally {
    // Los me gusta recibidos del dueño; en el boliche el me gusta es una reacción de la liga. Un juego suelto no
    // tiene liga: su número sale también en la lista de juegos sueltos del dueño.
    const extra =
      game.kind === 'bowling' && game.leagueId ? [tags.social(game.leagueId), tags.feeds] : game.kind === 'solo' ? [soloTags.user(game.userId)] : [];
    // Si salió bien, las listas ya tienen lo del servidor: solo el perfil y las reacciones de la liga.
    if (ok) {
      queryClient.invalidateKey(peopleKeys.profile(game.userId));
      invalidate(...extra);
    } else invalidate(peopleTags.user(game.userId), peopleTags.feed, ...extra);
  }
}

export const likeGame = (game: Parameters<typeof setGameLike>[0]) => setGameLike(game, true);
export const unlikeGame = (game: Parameters<typeof setGameLike>[0]) => setGameLike(game, false);

// ---------- Textos para las tarjetas ----------

const RESULT_TEXT: Record<'win' | 'loss' | 'draw', string> = { win: 'Ganó', loss: 'Perdió', draw: 'Empató' };

/** Resumen corto del juego para la tarjeta: «Serie 400 · alto 210», «Ganó 6-4 6-3 vs Otra / Nuevo», «78 golpes · 18 hoyos», «50 m libre · 28.45 · 2.º». */
export function gameSummary(g: ProfileGame): string {
  switch (g.kind) {
    case 'bowling':
    case 'solo': {
      const n = g.detail.scores.length;
      if (!n) return 'Sin juegos anotados';
      return n === 1 ? `${g.detail.series} pinos` : `Serie ${g.detail.series} · alto ${g.detail.high}`;
    }
    case 'match': {
      const d = g.detail;
      const head = d.walkover ? (d.result === 'win' ? 'Ganó por W.O.' : d.result === 'loss' ? 'Perdió por W.O.' : 'W.O.') : d.result ? RESULT_TEXT[d.result] : 'Jugado';
      const score = !d.walkover && d.score ? ` ${d.score}` : '';
      const vs = d.opponent ? ` vs ${d.opponent}` : '';
      return `${head}${score}${vs}`;
    }
    case 'golf': {
      const d = g.detail;
      if (d.dq) return 'Descalificado';
      const holes = d.played < d.holes ? `${d.played} de ${d.holes} hoyos` : `${d.holes} hoyos`;
      return `${d.gross} golpes · ${holes}`;
    }
    case 'swim': {
      const d = g.detail;
      const time = d.status === 'ok' ? formatSwimTime(d.timeCs) : d.status.toUpperCase();
      const place = d.place ? ` · ${d.place}.º` : '';
      return `${d.distance} m ${d.stroke} · ${time}${place}`;
    }
  }
}
