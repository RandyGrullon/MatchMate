import { describe, expect, it } from 'vitest';
import { formatSwimTime, isValidSwimTime, officialTime, parseSwimTime, timeFromDigits } from './time';

describe('leer tiempos', () => {
  it('mm:ss.hh, m:ss.hh y ss.hh', () => {
    expect(parseSwimTime('1:05.32')).toBe(6532);
    expect(parseSwimTime('01:05.32')).toBe(6532);
    expect(parseSwimTime('16:32.10')).toBe(99210);
    expect(parseSwimTime('28.45')).toBe(2845);
    expect(parseSwimTime(' 59.99 ')).toBe(5999);
  });

  it('coma decimal, décimas y sin centésimas', () => {
    expect(parseSwimTime('28,45')).toBe(2845);
    expect(parseSwimTime('1:05,3')).toBe(6530);
    expect(parseSwimTime('28.4')).toBe(2840);
    expect(parseSwimTime('28')).toBe(2800);
    expect(parseSwimTime('1:05')).toBe(6500);
    expect(parseSwimTime('0.07')).toBe(7);
  });

  it('rechaza lo que no es un tiempo', () => {
    for (const bad of ['', 'NT', 'abc', '1:5.32', '60.00', '1:60.00', '1:05.321', '-5.00', '100:00.00', '0.00', '0:00.00', '1.2.3', '1:']) {
      expect(parseSwimTime(bad), bad).toBeNull();
    }
  });
});

describe('mostrar tiempos', () => {
  it('sin minutos si es menos de un minuto', () => {
    expect(formatSwimTime(2845)).toBe('28.45');
    expect(formatSwimTime(905)).toBe('9.05');
    expect(formatSwimTime(7)).toBe('0.07');
  });

  it('con minutos', () => {
    expect(formatSwimTime(6000)).toBe('1:00.00');
    expect(formatSwimTime(6532)).toBe('1:05.32');
    expect(formatSwimTime(99210)).toBe('16:32.10');
  });

  it('formato completo mm:ss.hh y NT', () => {
    expect(formatSwimTime(2845, { full: true })).toBe('00:28.45');
    expect(formatSwimTime(99210, { full: true })).toBe('16:32.10');
    expect(formatSwimTime(null)).toBe('NT');
    expect(formatSwimTime(0)).toBe('NT');
  });

  it('ida y vuelta', () => {
    for (const t of [1, 99, 100, 5999, 6000, 6001, 12345, 99210, 599999]) expect(parseSwimTime(formatSwimTime(t))).toBe(t);
  });

  it('valida el entero guardado', () => {
    expect(isValidSwimTime(2845)).toBe(true);
    expect(isValidSwimTime(28.45)).toBe(false);
    expect(isValidSwimTime(0)).toBe(false);
    expect(isValidSwimTime(600000)).toBe(false);
  });
});

describe('teclado numérico', () => {
  it('llena desde la derecha', () => {
    expect(timeFromDigits('2845')).toBe(2845);
    expect(timeFromDigits('10532')).toBe(6532);
    expect(timeFromDigits('163210')).toBe(99210);
    expect(timeFromDigits('5')).toBe(5);
  });

  it('rechaza segundos de 60 o más y lo que no son cifras', () => {
    expect(timeFromDigits('6000')).toBeNull();
    expect(timeFromDigits('')).toBeNull();
    expect(timeFromDigits('12a')).toBeNull();
    expect(timeFromDigits('0000')).toBeNull();
    expect(timeFromDigits('1234567')).toBeNull();
  });
});

describe('tiempo oficial con cronómetros manuales', () => {
  it('uno, dos (promedio cortado) o tres (el del medio)', () => {
    expect(officialTime([3050])).toBe(3050);
    expect(officialTime([3050, 3053])).toBe(3051);
    expect(officialTime([3060, 3050, 3052])).toBe(3052);
    expect(officialTime([null, 3000])).toBe(3000);
    expect(officialTime([])).toBeNull();
  });
});
