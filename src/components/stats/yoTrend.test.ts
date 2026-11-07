/** La tarjeta «Tu promedio» sin dibujar (yoTrend.ts): cómo vas este mes y la gráfica corta. Datos ficticios. */
import { describe, expect, it } from 'vitest';
import { monthCompare, oneDecimal, sparkline, trendBadge } from './yoTrend';

const g = (date: string, score: number) => ({ date, score });

describe('yoTrend.ts', () => {
  it('trendBadge: este mes contra el anterior, en enteros («+9 en octubre», «Parejo en …»); sin mes anterior, nada', () => {
    expect(trendBadge([g('2026-09-10', 180), g('2026-10-05', 190)])).toMatchObject({ dir: 'up', text: '+10 en octubre' });
    expect(trendBadge([g('2026-09-10', 190), g('2026-10-05', 186)])).toMatchObject({ dir: 'down', text: '−4 en octubre' });
    expect(trendBadge([g('2026-09-10', 190), g('2026-10-05', 190.3)])).toMatchObject({ dir: 'flat', text: 'Parejo en octubre' });
    expect(trendBadge([g('2026-10-05', 190)])).toBeNull();
  });

  it('monthCompare y oneDecimal: un decimal hacia abajo, y el año si el mes es de otro', () => {
    expect(oneDecimal(198.26)).toBe('198.2');
    expect(monthCompare([g('2025-12-01', 180), g('2026-01-02', 200)])).toEqual({
      prev: { name: 'Diciembre 2025', average: '180' },
      last: { name: 'Enero', average: '200', games: 1 },
      delta: 20,
    });
  });

  it('sparkline: con menos de dos juegos no hay gráfica; el último punto va a la derecha', () => {
    expect(sparkline([190])).toBeNull();
    const s = sparkline([150, 250])!;
    expect(s.line).toBe('M4.0 61.6 L128.0 8.4');
    expect(s.last).toEqual({ x: 128, y: 8.4 });
  });
});
