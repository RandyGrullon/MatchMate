import { describe, expect, it } from 'vitest';
import type { ProfileGame } from '../../lib/data/profileGames';
import {
  bowlingSummary,
  compactCount,
  gameDateLabel,
  hasStats,
  initialProfileSport,
  knownSports,
  likeLabel,
  matchResult,
  plural,
  sportShort,
  winRate,
} from './socialFormat';

describe('compactCount', () => {
  it('no desborda los contadores del perfil', () => {
    expect(compactCount(0)).toBe('0');
    expect(compactCount(999)).toBe('999');
    expect(compactCount(1000)).toBe('1 mil');
    expect(compactCount(1250)).toBe('1.3 mil');
    expect(compactCount(15_400)).toBe('15.4 mil');
    expect(compactCount(250_000)).toBe('250 mil');
    expect(compactCount(1_300_000)).toBe('1.3 M');
  });
  it('lo raro sale en 0', () => {
    expect(compactCount(-3)).toBe('0');
    expect(compactCount(Number.NaN)).toBe('0');
  });
  it('singular y plural', () => {
    expect(plural(1, 'seguidor', 'seguidores')).toBe('1 seguidor');
    expect(plural(3, 'seguidor', 'seguidores')).toBe('3 seguidores');
  });
});

describe('bowlingSummary', () => {
  it('promedio, juego más alto y mejor serie de las participaciones', () => {
    expect(bowlingSummary([[200, 180, 150], [210], []])).toEqual({ sessions: 2, games: 4, avg: 185, high: 210, bestSeries: 530 });
  });
  it('sin juegos: todo en cero', () => {
    expect(bowlingSummary(null)).toEqual({ sessions: 0, games: 0, avg: 0, high: 0, bestSeries: 0 });
  });
});

describe('estadísticas', () => {
  it('porcentaje de ganados', () => {
    expect(winRate(0, 0)).toBe(0);
    expect(winRate(3, 2)).toBe(67);
  });
  it('hay algo que mostrar', () => {
    const empty = { bowling: null, matches: [], golf: null, swim: null };
    expect(hasStats(null)).toBe(false);
    expect(hasStats(empty)).toBe(false);
    expect(hasStats({ ...empty, bowling: { sessions: 2, series: [[100]] } })).toBe(true);
    // En tu perfil el boliche sale aparte.
    expect(hasStats({ ...empty, bowling: { sessions: 2, series: [[100]] } }, { skipBowling: true })).toBe(false);
    expect(hasStats({ ...empty, matches: [{ sport: 'padel', played: 1, won: 1, lost: 0, drawn: 0 }] })).toBe(true);
    expect(hasStats({ ...empty, golf: { rounds: 1, best18: 80, avg18: 80, best9: null } })).toBe(true);
  });
});

describe('deporte del perfil', () => {
  it('abre en el deporte en que estás si lo juega; si no, todos', () => {
    expect(initialProfileSport('padel', ['bowling', 'padel'])).toBe('padel');
    expect(initialProfileSport('golf', ['bowling', 'padel'])).toBeNull();
    expect(initialProfileSport(null, ['bowling'])).toBeNull();
    expect(initialProfileSport('curling', ['curling'])).toBeNull();
  });
  it('solo deportes conocidos y sin repetir', () => {
    expect(knownSports(['padel', 'curling', 'padel', 'golf'])).toEqual(['padel', 'golf']);
    expect(knownSports(undefined)).toEqual([]);
  });
  it('nombre corto', () => {
    expect(sportShort('padel')).toBe('Pádel');
    expect(sportShort('curling')).toBe('Otro deporte');
  });
});

describe('textos de la tarjeta', () => {
  const match = (detail: Partial<Extract<ProfileGame, { kind: 'match' }>['detail']>) =>
    ({
      kind: 'match',
      detail: { side: 1, mine: 'Ana', opponent: 'Luis', score: '6-4', result: null, walkover: false, final: true, ...detail },
    }) as Extract<ProfileGame, { kind: 'match' }>;

  it('resultado del partido', () => {
    expect(matchResult(match({ result: 'win' }))).toEqual({ label: 'Ganó', tone: 'ok' });
    expect(matchResult(match({ result: 'loss', walkover: true }))).toEqual({ label: 'Perdió por W.O.', tone: 'danger' });
    expect(matchResult(match({ result: 'draw' }))).toEqual({ label: 'Empató', tone: 'neutral' });
    expect(matchResult(match({ result: null, walkover: true }))).toEqual({ label: 'W.O.', tone: 'neutral' });
    expect(matchResult(match({ result: null }))).toBeNull();
  });

  it('fecha corta', () => {
    expect(gameDateLabel('2026-09-28', '2026-09-28')).toBe('hoy');
    expect(gameDateLabel('2026-09-27', '2026-09-28')).toBe('ayer');
    expect(gameDateLabel('2026-09-12', '2026-09-28')).toMatch(/12/);
    expect(gameDateLabel('2025-09-12', '2026-09-28')).toMatch(/2025/);
    expect(gameDateLabel(null, '2026-09-28')).toBe('');
    expect(gameDateLabel('mañana', '2026-09-28')).toBe('');
  });

  it('me gusta para lectores de pantalla', () => {
    expect(likeLabel(false, 0)).toBe('Me gusta (0 me gusta)');
    expect(likeLabel(true, 1)).toBe('Quitar me gusta (1 me gusta)');
  });
});
