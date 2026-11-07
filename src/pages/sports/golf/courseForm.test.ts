import { describe, expect, it } from 'vitest';
import { DEMO_COURSE } from '../../../sports/golf/demo';
import { courseDraft, courseErrors, courseLine, draftCourse, parSplit, parseMeritPoints, resizeCourse, shownErrors, teeLine } from './courseForm';

/** Organizar › Campos: el borrador del editor, 9 o 18 hoyos, lo que falta y los puntos del orden de mérito. */
describe('editor de campo', () => {
  it('uno nuevo: 18 hoyos par 4 con SI por defecto y Blancas y Rojas sin rating', () => {
    const d = courseDraft(null);
    expect(d.holes).toHaveLength(18);
    expect(d.holes.every((h) => h.par === 4)).toBe(true);
    expect(d.tees.map((t) => t.name)).toEqual(['Blancas', 'Rojas']);
    const errors = courseErrors(draftCourse('nuevo', d.name, d.holes, d.tees), d.tees);
    expect(errors).toContain('Falta el nombre del campo.');
  });

  it('uno que ya existe vuelve igual al guardarlo (con el rating por vuelta)', () => {
    const d = courseDraft(DEMO_COURSE);
    expect(d.tees[0]).toMatchObject({ name: 'Azules', rating: '71.2', byNine: true, front: { rating: '35.8', slope: '130' } });
    const back = draftCourse(DEMO_COURSE.id, d.name, d.holes, d.tees);
    expect(courseErrors(back, d.tees)).toEqual([]);
    expect(back.tees[1].pars).toEqual(DEMO_COURSE.tees[1].pars);
  });

  it('a 9 hoyos: los SI de la ida en orden del 1 al 9; a 18, los de siempre; sin cambio, null', () => {
    const d = courseDraft(DEMO_COURSE);
    const nine = resizeCourse(d.holes, d.tees, 9)!;
    expect(nine.holes.map((h) => h.si)).toEqual([4, 2, 9, 1, 6, 3, 8, 5, 7]);
    expect(nine.tees.every((t) => !t.byNine && !t.pars)).toBe(true);
    expect(resizeCourse(nine.holes, nine.tees, 18)!.holes.slice(0, 3).map((h) => h.si)).toEqual([1, 3, 5]);
    expect(resizeCourse(d.holes, d.tees, 18)).toBeNull();
  });

  it('cada salida lleva nombre; los avisos sin repetir y hasta 8', () => {
    const d = courseDraft(DEMO_COURSE);
    const tees = [{ ...d.tees[0], name: ' ' }];
    expect(courseErrors(draftCourse('x', 'Club de Ejemplo', d.holes, tees), tees)).toContain('Cada salida lleva nombre (Azules, Blancas, Rojas…).');
    expect(shownErrors(['a', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'])).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  });

  it('las líneas: el campo en la lista, la ida y la vuelta, y cada salida', () => {
    expect(courseLine(DEMO_COURSE)).toBe('18 hoyos · par 72 · Azules 71.2/128 · Rojas 70.1/121');
    expect(parSplit(DEMO_COURSE.holes)).toBe('ida 36 · vuelta 36');
    expect(parSplit(DEMO_COURSE.holes.slice(0, 9))).toBeNull();
    expect(teeLine(1, 71, { pars: [4], sis: undefined })).toBe('Salida 2 · par 71 (con pares propios)');
  });

  it('puntos del orden de mérito: coma o espacio; vacío, más de 50 o fuera de 0–100 no sirven', () => {
    expect(parseMeritPoints('25, 20 16')).toEqual({ points: [25, 20, 16], bad: false });
    expect(parseMeritPoints('').bad).toBe(true);
    expect(parseMeritPoints('25, 120').bad).toBe(true);
    expect(parseMeritPoints('25, x').bad).toBe(true);
  });
});
