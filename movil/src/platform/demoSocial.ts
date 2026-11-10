/**
 * Social en la demostración (/dev/empresa › Entrar a la demostración), en memoria y en sessionStorage: dos cuentas que
 * la cuenta de prueba sigue, sus juegos en «Juegos» (boliche en la Liga de Ejemplo, pádel, golf y natación) con me
 * gusta, el feed con una publicación que comparte un juego (su tarjeta), otra con un juego que ya no se ve («Juego no
 * disponible») y una tuya, y los avisos sociales de la campana (te siguió, le gustó tu juego, le gustó y comentó tu
 * publicación). También publicar (con un juego compartido), borrar lo tuyo, me gusta y comentar. Datos de mentira.
 */
import type { SocialNoticeRow } from '@mm/lib/data/follows';
import type { Post, PostComment, PostVisibility } from '@mm/lib/data/posts';
import type { ProfileGame } from '@mm/lib/data/profileGames';
import { toIsoDate } from '@mm/lib/format';
import { DEMO_GOLF, DEMO_LEAGUE } from './demoLeague';

const KEY = 'mm-demo-social';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const dayAgo = (n: number) => toIsoDate(new Date(Date.now() - n * DAY));
const id = (s: string) => `00000000-0000-7000-8000-0000000c${s}`;

/** Las cuentas de mentira que sigue la cuenta de prueba. */
const FRIEND = { id: id('0a02'), name: 'Jugadora Dos', username: 'jugadorados', avatar: null };
const OTHER = { id: id('0a03'), name: 'Jugador Tres', username: 'jugadortres', avatar: null };

// Juegos de la Liga de Ejemplo (demoLeague.ts): la práctica de hace 7 días y el jugador de Jugadora Dos y el tuyo.
const PRACTICE = '00000000-0000-7000-8000-00000000f0e3';
const THIRD = '00000000-0000-7000-8000-00000000f103';
const ME_PLAYER = '00000000-0000-7000-8000-00000000f101';
const PADEL = id('0b01');
const SWIM = id('0b02');

const P_GAME = id('0d01');
const P_GONE = id('0d02');
const P_MINE = id('0d03');

interface Saved {
  /** Me gusta de los juegos y de las publicaciones (lo cambiado). */
  likes: Record<string, { likes: number; liked: boolean }>;
  /** Lo que se publicó en la demo (arriba del feed). */
  posts: Post[];
  /** Lo borrado. */
  gone: string[];
  comments: PostComment[];
}

function load(): Saved {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Saved;
  } catch {
    // sin sessionStorage: lo de fábrica
  }
  return { likes: {}, posts: [], gone: [], comments: [] };
}

function save(s: Saved) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sin sessionStorage: sigue en memoria
  }
}

export function forgetDemoSocial() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

const base = {
  eventId: null,
  eventType: null,
} as const;

/** Los juegos de quien sigues (following_games), del más nuevo al más viejo. */
function games(): ProfileGame[] {
  return [
    {
      ...base,
      key: `m:${id('0e01')}:${id('0e11')}`,
      kind: 'match',
      id: id('0e01'),
      playerId: id('0e11'),
      userId: OTHER.id,
      userName: OTHER.name,
      leagueId: PADEL,
      leagueName: 'Pádel de Ejemplo',
      sport: 'padel',
      eventName: '',
      eventDate: dayAgo(1),
      at: iso(-DAY),
      url: `/l/${PADEL}/juegos?partido=${id('0e01')}`,
      likes: 4,
      likedByMe: true,
      detail: { side: 1, mine: 'Jugador Tres / Jugador Cuatro', opponent: 'Jugador Cinco / Jugador Seis', score: '6-4 6-3', result: 'win', walkover: false, final: true, round: 2 },
    },
    {
      ...base,
      key: `g:${id('0e02')}`,
      kind: 'golf',
      id: id('0e02'),
      playerId: id('0e12'),
      userId: FRIEND.id,
      userName: FRIEND.name,
      leagueId: DEMO_GOLF,
      leagueName: 'Golf de Ejemplo',
      sport: 'golf',
      eventName: 'Ronda del sábado',
      eventDate: dayAgo(3),
      at: iso(-3 * DAY),
      url: `/l/${DEMO_GOLF}`,
      likes: 0,
      likedByMe: false,
      detail: { course: 'Campo de Ejemplo', holes: 18, played: 18, gross: 86, playingHcp: 14, signed: true },
    },
    {
      ...base,
      key: `b:${id('0e03')}`,
      kind: 'bowling',
      id: '00000000-0000-7000-8000-0000000f5006',
      playerId: THIRD,
      userId: FRIEND.id,
      userName: FRIEND.name,
      leagueId: DEMO_LEAGUE,
      leagueName: 'Liga de Ejemplo',
      sport: 'bowling',
      eventName: '',
      eventDate: dayAgo(7),
      at: iso(-7 * DAY),
      url: `/l/${DEMO_LEAGUE}/juegos?juego=00000000-0000-7000-8000-0000000f5006&evento=${PRACTICE}`,
      likes: 3,
      likedByMe: false,
      detail: { scores: [166, 178, 210], verified: [true, true, false], series: 554, high: 210 },
    },
    {
      ...base,
      key: `s:${id('0e04')}`,
      kind: 'swim',
      id: id('0e04'),
      playerId: id('0e14'),
      userId: OTHER.id,
      userName: OTHER.name,
      leagueId: SWIM,
      leagueName: 'Natación de Ejemplo',
      sport: 'swimming',
      eventName: 'Copa de Ejemplo',
      eventDate: dayAgo(10),
      at: iso(-10 * DAY),
      url: `/l/${SWIM}`,
      likes: 1,
      likedByMe: false,
      detail: { distance: 50, stroke: 'libre', pool: 25, timeCs: 3125, status: 'ok', place: 2 },
    },
  ];
}

/** Tu juego de la Liga de Ejemplo (el de la publicación tuya y el aviso «le gustó tu juego»). */
function myGame(uid: string): ProfileGame {
  return {
    ...base,
    key: `b:${id('0e05')}`,
    kind: 'bowling',
    id: '00000000-0000-7000-8000-0000000f5004',
    playerId: ME_PLAYER,
    userId: uid,
    userName: 'Juan Pérez',
    leagueId: DEMO_LEAGUE,
    leagueName: 'Liga de Ejemplo',
    sport: 'bowling',
    eventName: '',
    eventDate: dayAgo(7),
    at: iso(-7 * DAY),
    url: `/l/${DEMO_LEAGUE}/juegos?juego=00000000-0000-7000-8000-0000000f5004&evento=${PRACTICE}`,
    likes: 2,
    likedByMe: false,
    detail: { scores: [195, 207, 183], verified: [true, true, true], series: 585, high: 207 },
  };
}

const me = (uid: string) => ({ id: uid, name: 'Juan Pérez', username: 'juanperez', avatar: null });
const LEAGUE = { id: DEMO_LEAGUE, name: 'Liga de Ejemplo', sport: 'bowling' };

/** Las publicaciones de fábrica: una con un juego compartido, otra con uno que ya no se ve y una tuya. */
function seedPosts(uid: string): Post[] {
  const post = (p: Partial<Post> & Pick<Post, 'id' | 'author' | 'text' | 'at'>): Post => ({
    photo: null,
    league: null,
    game: null,
    hasGame: false,
    sport: null,
    visibility: 'public',
    likes: 0,
    likedByMe: false,
    comments: 0,
    isMine: false,
    canDelete: false,
    ...p,
  });
  const shared = games().find((g) => g.kind === 'bowling')!;
  return [
    post({ id: P_GAME, author: FRIEND, text: '¡Por fin pasé de 200! 🎳', at: iso(-2 * HOUR), league: LEAGUE, game: shared, hasGame: true, sport: 'bowling', visibility: 'league', likes: 5, comments: 1 }),
    post({ id: P_GONE, author: OTHER, text: 'Qué partidazo el de ayer.', at: iso(-5 * HOUR), hasGame: true, sport: 'padel', likes: 2 }),
    post({ id: P_MINE, author: me(uid), text: 'La práctica de la semana pasada, con todo. 💪', at: iso(-2 * DAY), league: LEAGUE, game: myGame(uid), hasGame: true, sport: 'bowling', visibility: 'league', likes: 2, comments: 1, isMine: true, canDelete: true }),
  ];
}

function seedComments(uid: string): PostComment[] {
  return [
    { id: id('0f01'), postId: P_GAME, author: OTHER, text: '¡Felicidades! Ese último juego estuvo durísimo.', at: iso(-HOUR), isMine: false, canDelete: false },
    { id: id('0f02'), postId: P_MINE, author: FRIEND, text: '¡Buena serie!', at: iso(-DAY), isMine: false, canDelete: false },
  ].map((c) => ({ ...c, isMine: c.author.id === uid }));
}

/** Los avisos sociales de la campana (social_notices). */
function notices(uid: string): SocialNoticeRow[] {
  const g = myGame(uid);
  return [
    { kind: 'post_comment', at: iso(-DAY), userId: FRIEND.id, name: FRIEND.name, postId: P_MINE, text: '¡Buena serie!' },
    { kind: 'post_like', at: iso(-26 * HOUR), userId: OTHER.id, name: OTHER.name, postId: P_MINE },
    { kind: 'post_like', at: iso(-30 * HOUR), userId: FRIEND.id, name: FRIEND.name, postId: P_MINE },
    {
      kind: 'like',
      at: iso(-3 * DAY),
      userId: FRIEND.id,
      name: FRIEND.name,
      gameKind: 'bowling',
      id: g.id,
      playerId: g.playerId,
      leagueId: DEMO_LEAGUE,
      leagueName: 'Liga de Ejemplo',
      sport: 'bowling',
      url: g.url ?? `/l/${DEMO_LEAGUE}`,
    },
    { kind: 'follow', at: iso(-4 * DAY), userId: OTHER.id, name: OTHER.name },
  ];
}

const gameKey = (kind: unknown, gameId: unknown, player: unknown) => `juego:${String(kind)}:${String(gameId)}:${kind === 'match' ? String(player ?? '') : ''}`;
const withGameLikes = (s: Saved, g: ProfileGame): ProfileGame => {
  const o = s.likes[gameKey(g.kind, g.id, g.playerId)];
  return o ? { ...g, likes: o.likes, likedByMe: o.liked } : g;
};
const withPostLikes = (s: Saved, p: Post): Post => {
  const o = s.likes[`post:${p.id}`];
  const comments = s.comments.filter((c) => c.postId === p.id).length;
  return { ...p, ...(o ? { likes: o.likes, likedByMe: o.liked } : {}), comments: p.comments + comments, game: p.game ? withGameLikes(s, p.game) : p.game };
};

const RPCS = new Set(['following_games', 'set_game_like', 'social_feed', 'post_detail', 'set_post_like', 'post_comments', 'add_post_comment', 'delete_post_comment', 'create_post', 'delete_post', 'social_notices']);

/**
 * Las RPC de Social (las mismas de la web: src/lib/data/posts.ts, profileGames.ts y follows.ts). undefined si no es de
 * aquí: create_post con `p_squad` es del muro de un equipo (demoSquads.ts).
 */
export function socialRpc(uid: string, fn: string, a: Record<string, unknown>): unknown {
  if (!RPCS.has(fn) || (fn === 'create_post' && a.p_squad)) return undefined;
  const s = load();
  const all = () => [...s.posts, ...seedPosts(uid)].filter((p) => !s.gone.includes(p.id)).map((p) => withPostLikes(s, p));
  const comments = () => [...seedComments(uid), ...s.comments];
  switch (fn) {
    case 'following_games':
      return a.p_before ? [] : games().map((g) => withGameLikes(s, g));
    case 'set_game_like': {
      const k = gameKey(a.p_kind, a.p_id, a.p_player);
      const g = [...games(), myGame(uid)].find((x) => gameKey(x.kind, x.id, x.playerId) === k);
      const now = s.likes[k] ?? { likes: g?.likes ?? 0, liked: g?.likedByMe ?? false };
      const liked = a.p_liked === true;
      s.likes[k] = { likes: Math.max(0, now.likes + (liked === now.liked ? 0 : liked ? 1 : -1)), liked };
      save(s);
      return s.likes[k];
    }
    case 'social_feed':
      // Siguiendo: todo; Descubrir: lo que es para todos.
      return a.p_before ? [] : all().filter((p) => a.p_scope !== 'discover' || p.visibility === 'public');
    case 'post_detail':
      return all().find((p) => p.id === a.p_post) ?? null;
    case 'set_post_like': {
      const p = all().find((x) => x.id === a.p_post);
      const k = `post:${String(a.p_post)}`;
      const now = s.likes[k] ?? { likes: p?.likes ?? 0, liked: p?.likedByMe ?? false };
      const liked = a.p_liked === true;
      s.likes[k] = { likes: Math.max(0, now.likes + (liked === now.liked ? 0 : liked ? 1 : -1)), liked };
      save(s);
      return s.likes[k];
    }
    case 'post_comments':
      return a.p_after ? [] : comments().filter((c) => c.postId === a.p_post);
    case 'add_post_comment': {
      const c: PostComment = { id: String(a.p_id ?? `${Date.now()}`), postId: String(a.p_post), author: me(uid), text: String(a.p_text ?? '').trim(), at: iso(0), isMine: true, canDelete: true };
      s.comments.push(c);
      save(s);
      return c;
    }
    case 'delete_post_comment':
      s.comments = s.comments.filter((c) => c.id !== a.p_comment);
      save(s);
      return null;
    case 'create_post': {
      const kind = a.p_game_kind;
      const game = kind ? ([...games(), myGame(uid)].find((g) => g.kind === kind && g.id === a.p_game_id && (kind !== 'match' || g.playerId === a.p_game_player)) ?? null) : null;
      const league = a.p_league === DEMO_LEAGUE ? LEAGUE : game?.leagueId ? { id: game.leagueId, name: game.leagueName ?? '', sport: game.sport } : null;
      const post: Post = {
        id: String(a.p_id),
        author: me(uid),
        text: String(a.p_text ?? ''),
        photo: typeof a.p_photo === 'string' ? { path: a.p_photo, w: (a.p_photo_w as number) ?? null, h: (a.p_photo_h as number) ?? null } : null,
        league,
        game,
        hasGame: !!kind,
        sport: game?.sport ?? league?.sport ?? (a.p_sport as string | null) ?? null,
        visibility: a.p_visibility as PostVisibility,
        at: iso(0),
        likes: 0,
        likedByMe: false,
        comments: 0,
        isMine: true,
        canDelete: true,
      };
      s.posts.unshift(post);
      save(s);
      return post;
    }
    case 'delete_post':
      s.gone.push(String(a.p_post));
      s.posts = s.posts.filter((p) => p.id !== a.p_post);
      save(s);
      return null;
    case 'social_notices':
      return notices(uid);
  }
  return undefined;
}
