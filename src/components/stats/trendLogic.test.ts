import { describe, expect, it } from 'vitest';
import type { PinReport } from '../../lib/bowlingStats';
import { chartRange, heatIndex, heatLegendLabels, heatPins, labelStep, monthLabels, ofText, pct } from './trendLogic';
import { TREND_FIRST_X, trendIndexAt } from './yoCharts';

describe('la gráfica de la tendencia', () => {
  it('el eje redondea a 50 y cabe todo, entre 0 y 300', () => {
    expect(chartRange([182, 214], null, 190)).toEqual({ lo: 150, hi: 250 });
    expect(chartRange([290, 300], [295], null)).toEqual({ lo: 250, hi: 300 });
    expect(chartRange([10], null, null)).toEqual({ lo: 0, hi: 50 });
  });

  it('las etiquetas de abajo no se pisan', () => {
    expect(labelStep(1, 330)).toBe(1);
    expect(labelStep(5, 330)).toBe(1);
    expect(labelStep(30, 330)).toBeGreaterThan(1);
  });

  it('los meses llevan el año corto si son de dos años', () => {
    expect(monthLabels(['2026-09', '2026-10'])).toEqual(['sep', 'oct']);
    expect(monthLabels(['2025-12', '2026-01'])).toEqual(['dic 25', 'ene 26']);
  });

  it('el punto bajo el dedo', () => {
    expect(trendIndexAt(TREND_FIRST_X, 302, 10)).toBe(0);
    expect(trendIndexAt(294, 302, 10)).toBe(9);
    expect(trendIndexAt(-50, 302, 10)).toBe(0);
    expect(trendIndexAt(999, 302, 10)).toBe(9);
  });
});

describe('el mapa de los pinos', () => {
  const report: PinReport = {
    games: 2,
    racks: 20,
    pins: Array.from({ length: 10 }, (_, i) => ({
      pin: i + 1,
      left: i === 9 ? 8 : 0,
      leftPct: i === 9 ? 40 : null,
      inLeave: i === 9 ? 8 : 0,
      converted: i === 9 ? 4 : 0,
      convertedPct: i === 9 ? 50 : null,
    })),
  };

  it('dice cuánto se queda parado y cuánto spare hace', () => {
    const quedan = heatPins(report, 'quedan');
    expect(quedan[9]).toMatchObject({ pin: 10, value: '40%', label: 'Pino 10: se queda parado el 40% (8 de 20)' });
    expect(quedan[0]).toMatchObject({ value: null, label: 'Pino 1: sin datos' });
    const spare = heatPins(report, 'spare');
    expect(spare[9].label).toBe('Pino 10: spare el 50% de las veces que queda (4 de 8)');
    expect(spare[0].label).toBe('Pino 1: todavía no le ha quedado para el spare');
  });

  it('los niveles y la leyenda', () => {
    expect(heatIndex(-1)).toBe(0);
    expect(heatIndex(9)).toBe(4);
    expect(heatLegendLabels([5, 15, 30, 50])).toEqual(['<5%', '5–15%', '15–30%', '30–50%', '50%+']);
    expect(pct(null)).toBe('—');
    expect(pct(33)).toBe('33%');
    expect(ofText({ converted: 3, faced: 7 })).toBe('3 de 7');
  });
});
