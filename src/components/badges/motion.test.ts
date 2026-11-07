import { describe, expect, it } from 'vitest';
import { CALM_MS, UNLOCK_MS, cubicBezier, track, unlockDuration, unlockFrame } from './motion';

describe('la animación de desbloqueo cuadro por cuadro (motion.ts)', () => {
  it('la curva y los pasos como en CSS', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    expect(linear(0.5)).toBeCloseTo(0.5, 3);
    expect(track([[0, 0, linear], [0.5, 10], [1, 10]], 0.25)).toBeCloseTo(5, 3);
    expect(track([[0, 0], [1, 1]], 2)).toBe(1);
  });

  it('del candado a la insignia: al final queda en reposo', () => {
    expect(unlockFrame({ cls: 'bd-a-lock' }, 0, false)?.opacity).toBe(1);
    expect(unlockFrame({ cls: 'bd-a-on' }, UNLOCK_MS, false)?.opacity).toBe(1);
    expect(unlockFrame({ cls: 'bd-a-lock' }, UNLOCK_MS, false)?.opacity).toBe(0);
    expect(unlockFrame({ cls: 'bd-a-all', center: [64, 64] }, UNLOCK_MS, false)?.transform).toBe('translate(64 64) scale(1 1) translate(-64 -64)');
    expect(unlockFrame({ cls: 'bd-a-part', center: [10, 20], drift: [5, -5] }, UNLOCK_MS, false)).toEqual({ opacity: 0, transform: 'translate(15 15) scale(1 1) translate(-10 -20)' });
    expect(unlockFrame({}, 100, false)).toBeNull();
  });

  it('calmada: solo el fundido de 200 ms', () => {
    expect(unlockDuration(true)).toBe(CALM_MS);
    expect(unlockFrame({ cls: 'bd-a-on' }, CALM_MS / 2, true)?.opacity).toBeGreaterThan(0);
    expect(unlockFrame({ cls: 'bd-a-part' }, 0, true)).toEqual({ opacity: 0 });
    expect(unlockFrame({ cls: 'bd-a-all' }, 0, true)).toBeNull();
  });
});
