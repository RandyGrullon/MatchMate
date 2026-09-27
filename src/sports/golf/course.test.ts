import { describe, expect, it } from 'vitest';
import {
  courseHandicap,
  handicapFor,
  isValidIndex,
  playingHandicap,
  roundWhs,
  strokesReceived,
  teeHoles,
  teeRating,
  validateCourse,
  type GolfCourse,
} from './course';
import { DEMO_COURSE as course, DEMO_PARS as PARS, DEMO_SIS as SIS } from './demo';

describe('redondeo WHS', () => {
  it('al entero más cercano y 0,5 sube, también con negativos', () => {
    expect(roundWhs(16.5)).toBe(17);
    expect(roundWhs(16.49)).toBe(16);
    expect(roundWhs(-0.5)).toBe(0);
    expect(roundWhs(-2.5)).toBe(-2);
    expect(roundWhs(-2.51)).toBe(-3);
  });
});

describe('handicap de campo y de juego (WHS)', () => {
  it('18 hoyos: Index × Slope/113 + (Rating − Par)', () => {
    const ch = courseHandicap(10.4, { rating: 71.2, slope: 128, par: 72 });
    expect(ch).toBeCloseTo(10.9805, 4);
    expect(roundWhs(ch)).toBe(11);
    expect(playingHandicap(ch)).toBe(10); // 10,43 al 95 %
  });

  it('9 hoyos: (Index/2) × Slope/113 + (Rating9 − Par9)', () => {
    const ch = courseHandicap(20, { rating: 34.5, slope: 118, par: 35 }, 9);
    expect(ch).toBeCloseTo(9.9425, 4);
    const info = handicapFor(14.1, course, 'azul', { nine: 'front' });
    expect(info.holes).toBe(9);
    expect(info.courseHcp).toBeCloseTo(7.9106, 4);
    expect(info.courseHcpRounded).toBe(8);
    expect(info.playingHcp).toBe(8); // 7,515 sube
    expect(info.estimated).toBe(false);
  });

  it('no redondea el handicap de campo antes del %', () => {
    // 13,4 × 95 % = 12,73 → 13. Redondeando antes sería 13 × 95 % = 12,35 → 12.
    expect(playingHandicap(courseHandicap(13.4, { rating: 72, slope: 113, par: 72 }))).toBe(13);
  });

  it('0,5 sube en el handicap de juego', () => {
    expect(playingHandicap(10)).toBe(10); // 9,5
    expect(playingHandicap(courseHandicap(10, { rating: 72, slope: 113, par: 72 }), 85)).toBe(9); // 8,5
    expect(playingHandicap(-2.5, 100)).toBe(-2);
  });

  it('el % es configurable (100 % = el de campo redondeado)', () => {
    expect(playingHandicap(10.9805, 100)).toBe(11);
    expect(playingHandicap(10.9805, 80)).toBe(9); // 8,78
  });

  it('Index plus (negativo) da handicap negativo', () => {
    const ch = courseHandicap(-2.1, { rating: 73.4, slope: 125, par: 72 });
    expect(ch).toBeCloseTo(-0.923, 3);
    expect(roundWhs(ch)).toBe(-1);
    expect(playingHandicap(ch)).toBe(-1);
    expect(handicapFor(-2.1, course, 'azul').playingHcp).toBe(-3); // −3,18 × 95 % = −3,02
  });

  it('la salida va por jugador: rojas con otro rating, slope y par', () => {
    expect(handicapFor(10.4, course, 'azul').playingHcp).toBe(10);
    // 10,4 × 121/113 + (70,1 − 71) = 10,236 → 95 % = 9,72 → 10
    const roja = handicapFor(10.4, course, 'roja');
    expect(roja.courseHcp).toBeCloseTo(10.236, 3);
    expect(roja.playingHcp).toBe(10);
    expect(teeHoles(course, course.tees[1])[3].par).toBe(4);
  });

  it('9 hoyos sin rating por vuelta: se estima con rating/2, el slope y el par de esos hoyos', () => {
    const r = teeRating(course, course.tees[1], 'front');
    expect(r.estimated).toBe(true);
    expect(r.rating).toEqual({ rating: 35.05, slope: 121, par: 35 });
    expect(handicapFor(10, course, 'roja', { nine: 'front' }).courseHcp).toBeCloseTo(5.404, 3);
  });

  it('la vuelta usa los hoyos 10–18', () => {
    expect(teeHoles(course, course.tees[0], 'back').map((h) => h.number)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(handicapFor(10, course, 'azul', { nine: 'back' }).courseHcp).toBeCloseTo(5 * (126 / 113) - 0.6, 6);
  });

  it('rechaza un Index fuera de rango o una salida que no existe', () => {
    expect(isValidIndex(54)).toBe(true);
    expect(isValidIndex(-10)).toBe(true);
    expect(isValidIndex(54.1)).toBe(false);
    expect(() => handicapFor(60, course, 'azul')).toThrow(/Index/);
    expect(() => handicapFor(10, course, 'verde')).toThrow(/salida/);
  });
});

describe('golpes de ventaja por hoyo', () => {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  it('uno en los hoyos de SI 1 al handicap', () => {
    const r = strokesReceived(10, SIS);
    SIS.forEach((si, i) => expect(r[i]).toBe(si <= 10 ? 1 : 0));
    expect(sum(r)).toBe(10);
  });

  it('con más de 18, un segundo golpe en los más difíciles', () => {
    const r = strokesReceived(20, SIS);
    SIS.forEach((si, i) => expect(r[i]).toBe(si <= 2 ? 2 : 1));
    const r40 = strokesReceived(40, SIS);
    SIS.forEach((si, i) => expect(r40[i]).toBe(si <= 4 ? 3 : 2));
    expect(sum(r40)).toBe(40);
  });

  it('handicap plus: devuelve golpes empezando por el SI 18', () => {
    const r = strokesReceived(-2, SIS);
    SIS.forEach((si, i) => expect(r[i]).toBe(si >= 17 ? -1 : 0));
    expect(sum(r)).toBe(-2);
  });

  it('handicap 0: ningún golpe', () => {
    expect(strokesReceived(0, SIS)).toEqual(Array(18).fill(0));
  });

  it('9 hoyos: cuenta el orden de los SI de esos hoyos', () => {
    const front = SIS.slice(0, 9); // 7,3,17,1,11,5,15,9,13
    expect(strokesReceived(4, front)).toEqual([1, 1, 0, 1, 0, 1, 0, 0, 0]);
    expect(strokesReceived(11, front)).toEqual([1, 2, 1, 2, 1, 1, 1, 1, 1]);
    expect(strokesReceived(-1, front)).toEqual([0, 0, -1, 0, 0, 0, 0, 0, 0]);
  });
});

describe('validar el campo', () => {
  it('un campo bien cargado no tiene errores', () => {
    expect(validateCourse(course)).toEqual([]);
  });

  it('9 o 18 hoyos, par de 3 a 6 y SI sin repetir', () => {
    expect(validateCourse({ ...course, holes: course.holes.slice(0, 10) })).toContain('El campo debe tener 9 o 18 hoyos.');
    const bad = { ...course, holes: course.holes.map((h, i) => (i === 1 ? { par: 7, si: 7 } : h)) };
    const errs = validateCourse(bad);
    expect(errs).toContain('Hoyo 2: el par va de 3 a 6.');
    expect(errs).toContain('Hay SI repetidos.');
  });

  it('un campo de 9 hoyos acepta SI impares', () => {
    const nine: GolfCourse = {
      id: 'n',
      name: 'Nueve',
      holes: PARS.slice(0, 9).map((par, i) => ({ par, si: SIS[i] })),
      tees: [{ id: 't', name: 'Blancas', rating: 35.1, slope: 120, par: 36 }],
    };
    expect(validateCourse(nine)).toEqual([]);
  });

  it('slope de 55 a 155 y el par de la salida igual a la suma de sus hoyos', () => {
    const errs = validateCourse({ ...course, tees: [{ ...course.tees[0], slope: 160, par: 70 }] });
    expect(errs.some((e) => e.includes('slope'))).toBe(true);
    expect(errs.some((e) => e.includes('par debe ser 72'))).toBe(true);
  });

  it('SI de la salida (damas) también sin repetir', () => {
    const errs = validateCourse({ ...course, tees: [{ ...course.tees[0], sis: SIS.map((s) => (s === 18 ? 1 : s)) }] });
    expect(errs).toContain('Salida Azules, hay SI repetidos.');
  });
});
