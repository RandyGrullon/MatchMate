import { describe, expect, it } from 'vitest';
import { createCourtStore } from './log';
import { courtDeps } from './useCourt';

describe('lo que usa el modo cancha de la capa de datos', () => {
  it('cada partido lleva su propio id de teléfono (no uno para todos los partidos que se anotan con él)', () => {
    const store = createCourtStore('memory');
    const a = courtDeps('L1', 'M1', store);
    const b = courtDeps('L2', 'M2', store);
    expect(a.origin).not.toBe(b.origin);
    expect(courtDeps('L1', 'M1', store).origin).toBe(a.origin);
    // Soltar el turno, descartar lo suyo de la cola y leer la caché: también de ese partido.
    expect(a).toHaveProperty('release');
    expect(a).toHaveProperty('discardQueued');
    expect(a.cached?.()).toBeNull();
  });
});
