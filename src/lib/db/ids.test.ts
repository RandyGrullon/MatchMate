import { describe, expect, it } from 'vitest';
import { createUuidV7, isUuid, uuidv7, uuidv7Time } from './ids';

const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  it('tiene el formato del RFC 9562: versión 7 y variante 10', () => {
    for (let i = 0; i < 200; i++) {
      const id = uuidv7();
      expect(id).toMatch(V7);
      expect(isUuid(id)).toBe(true);
    }
    expect(isUuid('no-es-un-uuid')).toBe(false);
  });

  it('guarda la hora en ms en los primeros 48 bits', () => {
    const gen = createUuidV7({ now: () => 1_750_000_000_123 });
    const id = gen();
    expect(uuidv7Time(id)).toBe(1_750_000_000_123);
    expect(id.startsWith('0197')).toBe(true); // 1750000000123 = 0x0197_7420_DC7B
    expect(uuidv7Time('00000000-0000-4000-8000-000000000000')).toBeNull(); // v4
  });

  it('en el mismo ms siguen subiendo y no se repiten', () => {
    const gen = createUuidV7({ now: () => 1_700_000_000_000 });
    const ids = Array.from({ length: 10_000 }, () => gen());
    expect(new Set(ids).size).toBe(ids.length);
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
    expect(ids.every((id) => uuidv7Time(id) === 1_700_000_000_000)).toBe(true);
  });

  it('si el reloj se atrasa, no se desordenan (se queda con la hora más alta)', () => {
    let t = 2_000_000;
    const gen = createUuidV7({ now: () => t });
    const a = gen();
    t = 1_000_000; // el reloj del teléfono se corrigió hacia atrás
    const b = gen();
    const c = gen();
    expect(a < b && b < c).toBe(true);
    expect(uuidv7Time(c)).toBe(2_000_000);
    t = 2_000_001;
    const d = gen();
    expect(c < d).toBe(true);
    expect(uuidv7Time(d)).toBe(2_000_001);
  });

  it('con horas distintas ordenan por hora, aunque el azar sea el máximo', () => {
    let t = 5_000;
    const gen = createUuidV7({ now: () => t, random: (b) => b.fill(0xff) });
    const first = gen();
    t = 5_001;
    const second = gen();
    expect(first < second).toBe(true);
    expect(first).toMatch(V7);
    expect(second).toMatch(V7);
  });

  it('el contador empieza al azar pero con el bit de arriba en 0 (queda espacio para subir)', () => {
    const gen = createUuidV7({ now: () => 42, random: (b) => b.fill(0xff) });
    const id = gen();
    // rand_a = 12 bits de arriba del contador: con el bit 41 en 0 y el resto en 1 es 0x7ff.
    expect(id.slice(15, 18)).toBe('7ff');
    expect(id[19]).toBe('b'); // variante 10 + 11 del contador
  });
});
