import { describe, expect, it } from 'vitest';
import { gameSummary, optimisticLikes, type ProfileGame } from './profileGames';

const base = {
  key: 'k',
  id: 'g',
  playerId: 'p',
  userId: 'u',
  userName: 'luis',
  leagueId: 'L',
  leagueName: 'Liga',
  sport: 'bowling',
  eventId: 'e',
  eventName: '',
  eventType: 'torneo',
  eventDate: '2026-09-20',
  at: '2026-09-20T16:00:00.000Z',
  url: '/l/L/juegos?juego=g&evento=e',
  likes: 0,
  likedByMe: false,
};

const game = (g: Pick<ProfileGame, 'kind' | 'detail'>) => ({ ...base, ...g }) as ProfileGame;

describe('resumen del juego', () => {
  it('boliche', () => {
    expect(gameSummary(game({ kind: 'bowling', detail: { scores: [190, 210], verified: [true, true], series: 400, high: 210 } }))).toBe('Serie 400 · alto 210');
    expect(gameSummary(game({ kind: 'bowling', detail: { scores: [150], verified: [false], series: 150, high: 150 } }))).toBe('150 pinos');
    expect(gameSummary(game({ kind: 'bowling', detail: { scores: [], verified: [], series: 0, high: 0 } }))).toBe('Sin juegos anotados');
  });

  it('partido', () => {
    const d = { side: 1 as const, mine: 'Luis / Ana', opponent: 'Otra / Nuevo', score: '6-4 6-3', result: 'win' as const, walkover: false, final: true };
    expect(gameSummary(game({ kind: 'match', detail: d }))).toBe('Ganó 6-4 6-3 vs Otra / Nuevo');
    expect(gameSummary(game({ kind: 'match', detail: { ...d, result: 'loss', score: null } }))).toBe('Perdió vs Otra / Nuevo');
    expect(gameSummary(game({ kind: 'match', detail: { ...d, result: 'draw', opponent: null } }))).toBe('Empató 6-4 6-3');
    expect(gameSummary(game({ kind: 'match', detail: { ...d, walkover: true } }))).toBe('Ganó por W.O. vs Otra / Nuevo');
    expect(gameSummary(game({ kind: 'match', detail: { ...d, walkover: true, result: null } }))).toBe('W.O. vs Otra / Nuevo');
  });

  it('golf', () => {
    expect(gameSummary(game({ kind: 'golf', detail: { course: 'Campo', holes: 18, played: 18, gross: 78 } }))).toBe('78 golpes · 18 hoyos');
    expect(gameSummary(game({ kind: 'golf', detail: { course: null, holes: 18, played: 9, gross: 40 } }))).toBe('40 golpes · 9 de 18 hoyos');
    expect(gameSummary(game({ kind: 'golf', detail: { course: null, holes: 18, played: 18, gross: 80, dq: true } }))).toBe('Descalificado');
  });

  it('natación', () => {
    const d = { distance: 50, stroke: 'libre', pool: 25, timeCs: 2845, status: 'ok', place: 2 };
    expect(gameSummary(game({ kind: 'swim', detail: d }))).toBe('50 m libre · 28.45 · 2.º');
    expect(gameSummary(game({ kind: 'swim', detail: { ...d, status: 'dq', place: null } }))).toBe('50 m libre · DQ');
  });
});

describe('me gusta optimista', () => {
  it('sube, baja y no pasa de lo que hay', () => {
    expect(optimisticLikes({ likes: 2, likedByMe: false }, true)).toEqual({ likes: 3, likedByMe: true });
    expect(optimisticLikes({ likes: 3, likedByMe: true }, false)).toEqual({ likes: 2, likedByMe: false });
    expect(optimisticLikes({ likes: 3, likedByMe: true }, true)).toEqual({ likes: 3, likedByMe: true });
    expect(optimisticLikes({ likes: 0, likedByMe: true }, false)).toEqual({ likes: 0, likedByMe: false });
  });
});
