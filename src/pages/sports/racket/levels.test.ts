import { describe, expect, it } from 'vitest';
import { LEVEL_SCALES, formatLevel, levelScale, levelText, parseLevelInput, readLevel } from './levels';
import { byModality, isDoublesMatch, modalityOf } from './logic/modality';
import { mkMatch } from './logic/testMatch';
import { pointsText, rankingNote, tiebreakText } from './logic/tiebreaks';

const { padel, tennis, pickleball } = LEVEL_SCALES;

describe('niveles por deporte', () => {
  it('cada deporte su clave en attrs: level, ntrp, dupr', () => {
    expect(levelScale('padel').key).toBe('level');
    expect(levelScale('tennis').key).toBe('ntrp');
    expect(levelScale('pickleball').key).toBe('dupr');
  });

  it('leer lo guardado (y recortar a la escala)', () => {
    expect(readLevel({ ntrp: 4.5 }, tennis)).toBe(4.5);
    expect(readLevel({ ntrp: 9 }, tennis)).toBe(7);
    expect(readLevel({ level: 4.5 }, tennis)).toBeNull();
    expect(readLevel({ dupr: 3.752 }, pickleball)).toBe(3.752);
    expect(readLevel({ dupr: '3.5' }, pickleball)).toBeNull();
    expect(readLevel(null, padel)).toBeNull();
  });

  it('lo que escribe el admin: coma o punto, dentro de la escala, vacío quita', () => {
    expect(parseLevelInput('4,5', tennis)).toBe(4.5);
    expect(parseLevelInput(' 3.752 ', pickleball)).toBe(3.752);
    expect(parseLevelInput('3.7526', pickleball)).toBe(3.753);
    expect(parseLevelInput('', tennis)).toBeNull();
    expect(parseLevelInput('7.5', tennis)).toBe('invalido');
    expect(parseLevelInput('1.5', pickleball)).toBe('invalido');
    expect(parseLevelInput('alto', padel)).toBe('invalido');
    expect(parseLevelInput('4.55', padel)).toBe(4.6);
  });

  it('cómo se muestra', () => {
    expect(formatLevel(4, tennis)).toBe('4.0');
    expect(formatLevel(3.752, pickleball)).toBe('3.752');
    expect(formatLevel(4.5, padel)).toBe('4.5');
    expect(levelText(4.5, tennis)).toBe('NTRP 4.5');
    expect(levelText(4, pickleball)).toBe('DUPR 4.0');
    expect(levelText(3, padel)).toBe('Nivel 3');
  });
});

describe('individual o dobles', () => {
  it('por los jugadores de cada lado (o la pareja)', () => {
    expect(isDoublesMatch(mkMatch({ a: ['p1'], b: ['p2'] }))).toBe(false);
    expect(isDoublesMatch(mkMatch({ a: ['p1', 'p2'], b: ['p3', 'p4'] }))).toBe(true);
    expect(isDoublesMatch(mkMatch({ teams: ['T1', 'T2'] }))).toBe(true);
    expect(isDoublesMatch(mkMatch({ teams: ['T1', 'T2'] }), () => ['solo'])).toBe(false);
    // Sin nadie todavía: lo que digan las reglas.
    expect(isDoublesMatch({ ...mkMatch({}), rules: { match: { doubles: true } } })).toBe(true);
    expect(modalityOf(mkMatch({ a: ['p1'], b: ['p2'] }))).toBe('individual');
    const split = byModality([mkMatch({ id: 'a', a: ['p1'], b: ['p2'] }), mkMatch({ id: 'b', a: ['p1', 'p2'], b: ['p3', 'p4'] })]);
    expect(split.individual.map((m) => m.id)).toEqual(['a']);
    expect(split.dobles.map((m) => m.id)).toEqual(['b']);
  });
});

describe('textos de la tabla', () => {
  it('tenis y pádel: puntos y desempates del pádel; pickleball: el orden de USA Pickleball', () => {
    expect(tiebreakText('tennis')).toContain('enfrentamiento directo');
    expect(tiebreakText('pickleball')).toContain('USA Pickleball');
    expect(pointsText('tennis')).toBe('ganar 3, perder 1');
    expect(pointsText('padel', '2-0')).toBe('ganar 2, perder 0');
    expect(pointsText('pickleball')).toBe('cuenta los partidos ganados');
    expect(rankingNote('pickleball')).toContain('partidos ganados');
  });
});
