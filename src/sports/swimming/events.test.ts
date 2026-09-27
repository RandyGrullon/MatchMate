import { describe, expect, it } from 'vitest';
import { ageGroupOf, ageOn, ageReference, bestKey, CCCAN_AGE_GROUPS, mastersAgeGroups, swimEventName, validateSwimEvent, type SwimEvent } from './events';

describe('pruebas', () => {
  it('distancias que existen por estilo y piscina', () => {
    expect(validateSwimEvent({ distance: 1500, stroke: 'libre', pool: 50 })).toEqual([]);
    expect(validateSwimEvent({ distance: 100, stroke: 'combinado', pool: 25 })).toEqual([]);
    expect(validateSwimEvent({ distance: 25, stroke: 'mariposa', pool: 25 })).toEqual([]);
    expect(validateSwimEvent({ distance: 100, stroke: 'combinado', pool: 50 })).toEqual(['100 m combinado no se puede nadar en piscina de 50 m.']);
    expect(validateSwimEvent({ distance: 800, stroke: 'pecho', pool: 50 })).toEqual(['No existe 800 m pecho.']);
    expect(validateSwimEvent({ distance: 25, stroke: 'libre', pool: 50 })).toHaveLength(1);
  });

  it('nombre de la prueba con sus categorías', () => {
    const ev: SwimEvent = { id: 'e', distance: 100, stroke: 'libre', pool: 25, gender: 'F', ageGroups: ['11-12', '13-14'] };
    expect(swimEventName(ev, CCCAN_AGE_GROUPS)).toBe('100 m Libre · piscina 25 m · Femenino · 11-12, 13-14');
    expect(swimEventName({ ...ev, ageGroups: [] })).toBe('100 m Libre · piscina 25 m · Femenino');
  });

  it('la clave de marca separa la piscina', () => {
    expect(bestKey({ stroke: 'libre', distance: 50, pool: 25 })).not.toBe(bestKey({ stroke: 'libre', distance: 50, pool: 50 }));
  });
});

describe('edad y categoría', () => {
  it('la referencia es el 31 de diciembre del año del encuentro (o el día del encuentro)', () => {
    expect(ageReference('2026-06-10')).toBe('2026-12-31');
    expect(ageReference('2026-06-10', 'meetDate')).toBe('2026-06-10');
  });

  it('con solo el año: la edad que cumple ese año', () => {
    expect(ageOn(2014, '2026-12-31')).toBe(12);
    expect(ageOn(2014, '2026-01-15')).toBe(12);
  });

  it('con la fecha completa: la edad exacta en la referencia', () => {
    expect(ageOn('2014-12-31', '2026-12-30')).toBe(11);
    expect(ageOn('2014-12-31', '2026-12-31')).toBe(12);
    expect(ageOn('2014-03-01', '2026-02-28')).toBe(11);
  });

  it('categorías CCCAN en los límites', () => {
    const g = (age: number) => ageGroupOf(age)?.id;
    expect(g(5)).toBe('8-');
    expect(g(8)).toBe('8-');
    expect(g(9)).toBe('9-10');
    expect(g(10)).toBe('9-10');
    expect(g(11)).toBe('11-12');
    expect(g(12)).toBe('11-12');
    expect(g(13)).toBe('13-14');
    expect(g(14)).toBe('13-14');
    expect(g(15)).toBe('15-17');
    expect(g(17)).toBe('15-17');
    expect(g(18)).toBe('18+');
    expect(g(40)).toBe('18+');
  });

  it('nacidos justo en la fecha límite (31 dic / 1 ene)', () => {
    const ref = ageReference('2026-06-01');
    expect(ageGroupOf(ageOn('2016-12-31', ref))?.id).toBe('9-10'); // cumple 10 el 31 de diciembre
    expect(ageGroupOf(ageOn('2017-01-01', ref))?.id).toBe('9-10'); // cumple 9
    expect(ageGroupOf(ageOn('2018-01-01', ref))?.id).toBe('8-');
    expect(ageGroupOf(ageOn(2014, ref))?.id).toBe('11-12');
    expect(ageGroupOf(ageOn(2013, ref))?.id).toBe('13-14');
  });

  it('másters en tramos de 5 años desde 25-29', () => {
    const m = mastersAgeGroups();
    expect(m[0]).toEqual({ id: 'm25-29', label: '25-29', min: 25, max: 29 });
    const g = (age: number) => ageGroupOf(age, m)?.label ?? null;
    expect(g(24)).toBeNull();
    expect(g(25)).toBe('25-29');
    expect(g(29)).toBe('25-29');
    expect(g(30)).toBe('30-34');
    expect(g(99)).toBe('95-99');
    expect(g(101)).toBe('100 y más');
  });
});
