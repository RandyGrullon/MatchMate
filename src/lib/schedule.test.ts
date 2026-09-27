import { describe, expect, it } from 'vitest';
import { formatSchedule, formatTime, isCanonicalSchedule, parseSchedule } from './schedule';

describe('hora', () => {
  it('pasa de 24 h a am/pm', () => {
    expect(formatTime('19:00')).toBe('7:00 pm');
    expect(formatTime('00:15')).toBe('12:15 am');
    expect(formatTime('12:30')).toBe('12:30 pm');
    expect(formatTime('09:05')).toBe('9:05 am');
    expect(formatTime('25:00')).toBe('');
    expect(formatTime('')).toBe('');
  });
});

describe('cuándo juegan', () => {
  it('arma el texto con días en orden de la semana', () => {
    expect(formatSchedule([1], '19:00')).toBe('Martes · 7:00 pm');
    expect(formatSchedule([3, 1], '19:30')).toBe('Martes y jueves · 7:30 pm');
    expect(formatSchedule([4, 0, 2], '')).toBe('Lunes, miércoles y viernes');
    expect(formatSchedule([], '20:00')).toBe('8:00 pm');
    expect(formatSchedule([], '')).toBe('');
  });

  it('cabe en el límite de 80 caracteres de las reglas', () => {
    expect(formatSchedule([0, 1, 2, 3, 4, 5, 6], '12:00').length).toBeLessThanOrEqual(80);
  });

  it('lee lo que guardó para volver a editarlo', () => {
    expect(parseSchedule('Martes y jueves · 7:30 pm')).toEqual({ days: [1, 3], time: '19:30' });
    expect(parseSchedule('Lunes, miércoles y viernes')).toEqual({ days: [0, 2, 4], time: '' });
    expect(parseSchedule('Sábado · 12:15 am')).toEqual({ days: [5], time: '00:15' });
  });

  it('entiende textos viejos escritos a mano', () => {
    expect(parseSchedule('Martes 7:00 pm')).toEqual({ days: [1], time: '19:00' });
    expect(parseSchedule('los martes a las 7:00 p. m.')).toEqual({ days: [1], time: '19:00' });
    expect(parseSchedule('Miercoles 20:00')).toEqual({ days: [2], time: '20:00' });
    expect(parseSchedule('cuando se pueda')).toEqual({ days: [], time: '' });
  });

  it('entiende plurales, horas sin minutos y rangos', () => {
    expect(parseSchedule('Sábados 10:00 am')).toEqual({ days: [5], time: '10:00' });
    expect(parseSchedule('Domingos 9 am')).toEqual({ days: [6], time: '09:00' });
    expect(parseSchedule('Martes 7pm')).toEqual({ days: [1], time: '19:00' });
    expect(parseSchedule('Martes 7:00 a 9:00 pm')).toEqual({ days: [1], time: '19:00' });
    expect(parseSchedule('Liga 5 · martes')).toEqual({ days: [1], time: '' });
  });

  it('sabe si el texto es el que arma el selector', () => {
    expect(isCanonicalSchedule('Martes y jueves · 7:30 pm')).toBe(true);
    expect(isCanonicalSchedule('Martes 7:00 a 9:00 pm')).toBe(false);
  });

  it('ida y vuelta', () => {
    for (const [days, time] of [
      [[1], '19:00'],
      [[0, 6], '08:30'],
      [[2, 3, 4], '23:59'],
    ] as const) {
      const text = formatSchedule([...days], time);
      expect(parseSchedule(text)).toEqual({ days: [...days], time });
    }
  });
});
