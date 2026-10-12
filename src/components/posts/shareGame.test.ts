/**
 * Compartir un partido o un juego como publicación (docs/perfiles-equipos-esports.md §2): el texto sugerido, con qué
 * jugador va el partido, dónde se puede publicar, la hoja con el juego pegado (que lo manda a createPost) y la tarjeta
 * de la publicación con el juego (o «Juego no disponible»). Se pintan con renderToString (sin navegador).
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Match } from '../../lib/data/matchCore';
import type { NewPost, Post } from '../../lib/data/posts';
import type { ProfileGame } from '../../lib/data/profileGames';
import { FeedbackProvider } from '../feedback';

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u-me' } as { uid: string } | null, profile: { name: 'Yo Mismo' }, loading: false },
  sent: [] as NewPost[],
}));

vi.mock('../../lib/auth', async (orig) => ({ ...(await orig<typeof import('../../lib/auth')>()), useAuth: () => state.auth }));
vi.mock('../home/useHomeData', () => ({ useMyLeagues: () => ({ all: [], loading: false, error: null }) }));
vi.mock('../../lib/data/follows', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/follows')>()),
  usePublicProfile: () => ({ data: null, loading: false, error: null }),
}));
vi.mock('../../lib/data/posts', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/posts')>()),
  createPost: async (input: NewPost) => {
    state.sent.push(input);
    return { id: 'nuevo' } as Post;
  },
}));

const { bowlingPostText, gamePostText, golfPostText, leagueShareTarget, matchPostText, matchSharePick, sportEmoji, winnerSide } = await import('./shareGame');
const { ComposerForm, GAME_GONE, sendComposer } = await import('./Composer');
const { PostCard } = await import('./PostCard');
const { postSnippet } = await import('./postFormat');

const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el)));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const side = (s: 1 | 2, label: string, players: string[]) => ({
  side: s,
  teamId: null,
  label,
  seed: null,
  players: players.map((playerId) => ({ playerId, side: s, position: null, jersey: null, sub: false })),
});
const match = (extra: Partial<Match> = {}): Match =>
  ({
    id: 'm1',
    status: 'confirmed',
    winner: 1,
    walkoverSide: null,
    score: { text: '6-4 6-3' },
    sides: [side(1, 'Ana / Eva', ['p-ana', 'p-eva']), side(2, 'Luis / Juan', ['p-luis', 'p-juan'])],
    ...extra,
  }) as Match;

const padel: ProfileGame = {
  key: 'm:g2:p1',
  id: 'g2',
  kind: 'match',
  playerId: 'p1',
  userId: 'u-ana',
  userName: 'Ana Pérez',
  leagueId: 'L1',
  leagueName: 'Pádel del Club',
  sport: 'padel',
  eventId: null,
  eventName: 'Jornada 3',
  eventType: null,
  eventDate: '2026-10-10',
  at: '2026-10-10T20:00:00Z',
  url: '/l/L1/juegos?partido=g2',
  likes: 0,
  likedByMe: false,
  detail: { side: 1, mine: 'Ana / Eva', opponent: 'Luis / Juan', score: '6-4 6-3', result: 'win', walkover: false, final: true },
};

const post = (extra: Partial<Post> = {}): Post => ({
  id: 'p1',
  author: { id: 'u-ana', name: 'Ana Pérez', username: 'anaperez', avatar: null },
  text: '¡Ganamos!',
  photo: null,
  league: { id: 'L1', name: 'Pádel del Club', sport: 'padel' },
  sport: 'padel',
  visibility: 'public',
  at: new Date(Date.now() - 5 * 60_000).toISOString(),
  likes: 0,
  likedByMe: false,
  comments: 0,
  isMine: false,
  canDelete: false,
  ...extra,
});

beforeEach(() => {
  state.auth = { user: { uid: 'u-me' }, profile: { name: 'Yo Mismo' }, loading: false };
  state.sent = [];
});

describe('el texto sugerido', () => {
  it('un partido jugado: desde su lado («¡Ganamos 6-4 6-3!», «Perdimos 4-6 3-6»), en singular si su lado es de uno', () => {
    expect(sportEmoji('padel')).toBe('🎾');
    expect(sportEmoji('otro')).toBe('');
    expect(matchPostText(match(), 1, true, 'padel')).toBe('¡Ganamos 6-4 6-3! 🎾');
    expect(matchPostText(match(), 2, true, 'padel')).toBe('Perdimos 4-6 3-6. ¡Vamos por la próxima! 🎾');
    const singles = match({ sides: [side(1, 'Ana', ['p-ana']), side(2, 'Luis', ['p-luis'])], winner: 2, score: { text: '3-6 4-6' } });
    expect(matchPostText(singles, 2, true, 'tennis')).toBe('¡Gané 6-3 6-4! 🎾');
    expect(matchPostText(match({ winner: null, score: { text: '2-2' } }), 1, true, 'football')).toBe('Empatamos 2-2 ⚽');
    expect(matchPostText(match({ status: 'walkover', winner: null, walkoverSide: 2, score: null }), 1, true, 'padel')).toBe('¡Ganamos por W.O.! 🎾');
  });

  it('el de otro: quién ganó con el marcador desde su lado', () => {
    expect(matchPostText(match(), 1, false, 'padel')).toBe('¡Ganó Ana / Eva 6-4 6-3! 🎾');
    expect(matchPostText(match({ winner: 2, score: { text: '4-6 3-6' } }), 2, false, 'padel')).toBe('¡Ganó Luis / Juan 6-4 6-3! 🎾');
    expect(matchPostText(match({ winner: null, score: { text: '1-1' } }), 1, false, 'football')).toBe('Ana / Eva 1-1 Luis / Juan ⚽');
    expect(winnerSide(match({ status: 'walkover', winner: null, walkoverSide: 1 }))).toBe(2);
    expect(winnerSide(match({ status: 'walkover', winner: null, walkoverSide: 0 }))).toBeNull();
  });

  it('boliche, golf y los juegos del perfil', () => {
    expect(bowlingPostText([210, 180, null, 150])).toBe('¡Hice 540 de serie! 🎳');
    expect(bowlingPostText([233])).toBe('¡Hice 233! 🎳');
    expect(bowlingPostText([210, 180], 'Ana')).toBe('¡Ana hizo 390 de serie! 🎳');
    expect(golfPostText(82, 'Teeth of the Dog')).toBe('82 golpes en Teeth of the Dog ⛳');
    expect(gamePostText(padel, true)).toBe('¡Ganamos 6-4 6-3! 🎾');
    expect(gamePostText(padel, false)).toBe('¡Ganó Ana / Eva 6-4 6-3! 🎾');
    const side2: ProfileGame = { ...padel, detail: { ...padel.detail, side: 2, mine: 'Luis', opponent: 'Ana', result: 'loss' } };
    expect(gamePostText(side2, true)).toBe('Perdí 4-6 3-6. ¡Vamos por la próxima! 🎾');
    const swim: ProfileGame = { ...padel, kind: 'swim', sport: 'swimming', detail: { distance: 50, stroke: 'libre', pool: 25, timeCs: 2845, status: 'ok', place: 2 } };
    expect(gamePostText(swim, true)).toBe('50 m libre ¡2.º lugar! 🏊');
  });
});

describe('con qué jugador va el partido y dónde se publica', () => {
  const players = new Set(['p-eva', 'p-luis']);
  const hasAccount = (id: string) => players.has(id);

  it('el tuyo si lo jugaste; si no, el primero con cuenta del lado que ganó; sin terminar, nada', () => {
    expect(matchSharePick(match(), { mySide: 2, myPlayerId: 'p-me', hasAccount })).toEqual({ game: { kind: 'match', id: 'm1', playerId: 'p-me' }, side: 2, mine: true });
    expect(matchSharePick(match(), { mySide: null, myPlayerId: 'p-me', hasAccount })).toEqual({ game: { kind: 'match', id: 'm1', playerId: 'p-eva' }, side: 1, mine: false });
    expect(matchSharePick(match({ winner: 2 }), { mySide: null, myPlayerId: null, hasAccount })?.game.playerId).toBe('p-luis');
    expect(matchSharePick(match(), { mySide: null, myPlayerId: null, hasAccount: () => false })).toBeNull();
    expect(matchSharePick(match({ status: 'live' }), { mySide: 1, myPlayerId: 'p-me', hasAccount })).toBeNull();
    expect(matchSharePick(match({ status: 'scheduled' }), { mySide: 1, myPlayerId: 'p-me', hasAccount })).toBeNull();
  });

  it('solo un miembro de una liga sin menores', () => {
    const l = { name: 'Pádel del Club', visibility: 'public' as const, hasMinors: false, sport: 'padel' };
    expect(leagueShareTarget({ lid: 'L1', league: l, member: { role: 'member' } })).toEqual({ id: 'L1', name: 'Pádel del Club', sport: 'padel', visibility: 'public' });
    expect(leagueShareTarget({ lid: 'L1', league: l, member: null })).toBeNull();
    expect(leagueShareTarget({ lid: 'L1', league: { ...l, hasMinors: true }, member: { role: 'member' } })).toBeNull();
    expect(leagueShareTarget(null)).toBeNull();
  });
});

describe('la hoja para publicar un juego', () => {
  const base = { uid: 'u-me', onClose: () => undefined, leagues: [] };
  const league = { id: 'L1', name: 'Pádel del Club', sport: 'padel', visibility: 'private' as const };
  const publish = (html: string) => html.match(/<button(?:(?!<button).)*?>Publicar<\/span><\/button>/s)?.[0] ?? '';

  it('«Publicar en Social», el juego pegado, la liga fija, el texto sugerido y se puede publicar sin texto', () => {
    const html = render(
      h(ComposerForm, {
        ...base,
        fixedLeague: league,
        game: { kind: 'match', id: 'm1', playerId: 'p-me' },
        suggestedText: '¡Ganamos 6-4 6-3! 🎾',
        attachment: h('div', { 'data-preview': '' }, 'Ana / Eva vs Luis / Juan'),
      }),
    );
    const t = text(html);
    expect(t).toContain('Publicar en Social');
    expect(t).toContain('Pádel del Club');
    expect(html).toContain('data-attachment');
    expect(t).toContain('Ana / Eva vs Luis / Juan');
    expect(html).toContain('¡Ganamos 6-4 6-3! 🎾');
    expect(t).toContain('Solo la liga');
    expect(t).not.toContain('Publicar en Mi perfil');
    expect(publish(html)).not.toContain('disabled=""');
    // Sin texto también (lleva el juego).
    const empty = render(h(ComposerForm, { ...base, fixedLeague: league, game: { kind: 'match', id: 'm1', playerId: 'p-me' }, initialText: '' }));
    expect(publish(empty)).not.toContain('disabled=""');
  });

  it('«Publicar» manda el juego y la liga a createPost', async () => {
    await sendComposer({ text: '¡Ganamos!', photo: null, squad: null, target: league, audience: 'league', game: { kind: 'match', id: 'm1', playerId: 'p-me' } });
    expect(state.sent).toEqual([{ text: '¡Ganamos!', photo: null, leagueId: 'L1', visibility: 'league', game: { kind: 'match', id: 'm1', playerId: 'p-me' } }]);
    // Un juego suelto: sin liga, al perfil.
    await sendComposer({ text: '', photo: null, squad: null, target: null, audience: 'public', game: { kind: 'solo', id: 's1', playerId: null } });
    expect(state.sent[1]).toEqual({ text: '', photo: null, leagueId: null, visibility: 'public', game: { kind: 'solo', id: 's1', playerId: null } });
    // Sin juego, como siempre.
    await sendComposer({ text: 'Hola', photo: null, squad: null, target: null, audience: 'followers' });
    expect(state.sent[2]).toEqual({ text: 'Hola', photo: null, leagueId: null, visibility: 'followers' });
    expect(GAME_GONE).toBe('Ese juego ya no se puede compartir.');
  });
});

describe('la publicación con un juego', () => {
  it('el juego entre el texto y la foto, y tocarlo lo abre', () => {
    const html = render(h(PostCard, { post: post({ game: padel, hasGame: true, photo: { path: 'u-ana/p1.webp', w: 800, h: 800 } }) }));
    const t = text(html);
    expect(html).toContain('data-game-embed=""');
    expect(html).toContain('href="/l/L1/juegos?partido=g2"');
    expect(t).toContain('Ganó');
    expect(t).toContain('Ana / Eva');
    expect(t).toContain('6-4 6-3');
    expect(t).toContain('Pádel del Club · Jornada 3');
    // Su juego: no repite quién lo jugó.
    expect(t.indexOf('¡Ganamos!')).toBeLessThan(t.indexOf('Luis / Juan'));
    expect(html.indexOf('data-game-embed')).toBeLessThan(html.indexOf('data-photo'));
    // Sin me gusta ni «Reportar» del juego dentro de la publicación.
    expect(html).not.toContain('Reportar este juego');
  });

  it('el juego de otro dice quién lo jugó', () => {
    const t = text(render(h(PostCard, { post: post({ author: { id: 'u-luis', name: 'Luis', username: null, avatar: null }, game: padel, hasGame: true }) })));
    expect(t).toContain('Ana Pérez Pádel del Club · Jornada 3');
  });

  it('la fila corta de Hoy de una publicación con solo un juego: su resumen', () => {
    expect(postSnippet({ text: '', photo: null, game: padel, hasGame: true })).toBe('Ganó 6-4 6-3 vs Luis / Juan');
    expect(postSnippet({ text: '', photo: null, game: null, hasGame: true })).toBe('Juego compartido');
    expect(postSnippet({ text: '¡Ganamos!', photo: null, game: padel, hasGame: true })).toBe('¡Ganamos!');
  });

  it('con juego que no se puede ver: «Juego no disponible»; sin juego, nada', () => {
    const html = render(h(PostCard, { post: post({ game: null, hasGame: true }) }));
    expect(text(html)).toContain('Juego no disponible');
    expect(html).toContain('data-game-embed="no"');
    const plain = render(h(PostCard, { post: post() }));
    expect(plain).not.toContain('data-game-embed');
    expect(text(plain)).not.toContain('Juego no disponible');
  });
});
