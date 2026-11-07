/**
 * La lógica de compartir sin pantallas que usan la web y la app del teléfono: el lugar del borrador, el error de un
 * juego que ya no se puede compartir, quién puede compartir un juego (gameShareOf) y el partido en la hoja.
 */
import { describe, expect, it } from 'vitest';
import type { Match } from '../../lib/data/matchCore';
import type { ProfileGame } from '../../lib/data/profileGames';
import { GAME_GONE, draftPlace, isGameGone } from './composerSend';
import { gameShareOf } from './gameShareTarget';
import { matchPreviewParts } from './shareGame';

const bowling = (extra: Partial<ProfileGame> = {}): ProfileGame =>
  ({
    key: 'b1',
    kind: 'bowling',
    id: 'e1',
    playerId: 'p1',
    userId: 'u-uno',
    userName: 'Jugador Uno',
    leagueId: 'L1',
    leagueName: 'Liga de Ejemplo',
    sport: 'bowling',
    eventId: 'ev1',
    eventName: 'Práctica',
    eventType: 'practice',
    eventDate: '2026-11-05',
    at: '2026-11-05T22:00:00.000Z',
    url: '/l/L1/juegos?juego=ev1_p1',
    likes: 2,
    likedByMe: false,
    detail: { scores: [180, 200], verified: [true, true], series: 380, high: 200 },
    ...extra,
  }) as ProfileGame;

const solo = (userId: string): ProfileGame =>
  ({
    key: 's1',
    kind: 'solo',
    id: 's1',
    playerId: null,
    userId,
    userName: 'Jugador Uno',
    leagueId: null,
    leagueName: null,
    sport: 'bowling',
    eventId: null,
    eventName: '',
    eventType: null,
    eventDate: '2026-11-05',
    at: '2026-11-05T22:00:00.000Z',
    url: null,
    likes: 0,
    likedByMe: false,
    detail: { title: 'Juego suelto', venue: 'Bolera de Ejemplo', scores: [150], series: 150, high: 150 },
  }) as ProfileGame;

const LEAGUE = { id: 'L1', name: 'Liga de Ejemplo', sport: 'bowling', visibility: 'private' as const, hasMinors: false };

describe('el borrador y el juego que ya no está', () => {
  it('cada juego tiene su borrador; si no, el equipo, la liga o el feed', () => {
    expect(draftPlace({ id: 'L1' }, null, { kind: 'match', id: 'm1' })).toBe('juego:match:m1');
    expect(draftPlace({ id: 'L1' }, { id: 'S1' })).toBe('equipo:S1');
    expect(draftPlace({ id: 'L1' }, null)).toBe('L1');
    expect(draftPlace(null, null)).toBeUndefined();
  });

  it('no existe, inválido o no encontrado: «Ese juego ya no se puede compartir.»', () => {
    expect(isGameGone({ code: 'no_existe' })).toBe(true);
    expect(isGameGone({ code: 'invalido' })).toBe(true);
    expect(isGameGone({ kind: 'not_found' })).toBe(true);
    expect(isGameGone({ code: 'rate_limited' })).toBe(false);
    expect(isGameGone(null)).toBe(false);
    expect(GAME_GONE).toBe('Ese juego ya no se puede compartir.');
  });
});

describe('quién puede compartir un juego', () => {
  it('sin cuenta, nada', () => {
    expect(gameShareOf(bowling(), null, ['L1'], [LEAGUE])).toBeNull();
  });

  it('un miembro de la liga, aunque sea de otro (con su nombre en el texto)', () => {
    const share = gameShareOf(bowling(), 'u-yo', ['L1'], [LEAGUE]);
    expect(share).toEqual({
      league: { id: 'L1', name: 'Liga de Ejemplo', sport: 'bowling', visibility: 'private' },
      game: { kind: 'bowling', id: 'e1', playerId: 'p1' },
      text: '¡Jugador hizo 380 de serie! 🎳',
    });
    // El suyo: «¡Hice…!».
    expect(gameShareOf(bowling({ userId: 'u-yo' }), 'u-yo', ['L1'], [LEAGUE])?.text).toBe('¡Hice 380 de serie! 🎳');
  });

  it('no si no es miembro, si la liga no llegó o si tiene menores', () => {
    expect(gameShareOf(bowling(), 'u-yo', [], [LEAGUE])).toBeNull();
    expect(gameShareOf(bowling(), 'u-yo', ['L1'], [])).toBeNull();
    expect(gameShareOf(bowling(), 'u-yo', ['L1'], [{ ...LEAGUE, hasMinors: true }])).toBeNull();
  });

  it('un juego suelto solo su dueño, al perfil', () => {
    expect(gameShareOf(solo('u-yo'), 'u-yo', [], [])).toEqual({ league: null, game: { kind: 'solo', id: 's1', playerId: null }, text: '¡Hice 150! 🎳' });
    expect(gameShareOf(solo('u-uno'), 'u-yo', [], [])).toBeNull();
  });
});

describe('el partido en la hoja para publicarlo', () => {
  const m = {
    status: 'confirmed',
    score: { text: '6-4 3-6 7-5' },
    sides: [
      { side: 1, label: 'Jugador Uno', players: [] },
      { side: 2, label: 'Jugadora Dos', players: [] },
    ],
  } as unknown as Pick<Match, 'status' | 'score' | 'sides'>;

  it('primero el lado del jugador, con el marcador desde su lado', () => {
    expect(matchPreviewParts(m, 1)).toEqual({ mine: 'Jugador Uno', other: 'Jugadora Dos', score: '6-4 3-6 7-5' });
    expect(matchPreviewParts(m, 2)).toEqual({ mine: 'Jugadora Dos', other: 'Jugador Uno', score: '4-6 6-3 5-7' });
  });

  it('por W.O., «W.O.»', () => {
    expect(matchPreviewParts({ ...m, status: 'walkover' }, 2).score).toBe('W.O.');
  });
});
