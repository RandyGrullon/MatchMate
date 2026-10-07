/**
 * Los números de Yo dibujados sin navegador (renderToString), como final/6-perfil.png y p6-perfil.png: la tarjeta «Tu
 * promedio» de Lite (gráfica corta, «+9 en octubre» y Mejor juego · Mejor serie · Juegos), los 6 números de Pro,
 * «Tendencia» con fechas y etiquetas («29 sep», «Hoy», «214 mejor») y el mes anterior contra este, y «Tus tiros» con
 * «Pinos que te quedan».
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PinReport } from '../../lib/bowlingStats';
import {
  AverageCard,
  NumbersGrid,
  ShotsCard,
  TrendCard,
  dayLabel,
  frameShares,
  gamePoints,
  monthCompare,
  monthPoints,
  oneDecimal,
  pinLine,
  sparkline,
  trendBadge,
  trendLayout,
  trendScale,
} from './YoStats';

const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

// Los de final/6-perfil.png: 199 176 192 | 199 181 214 | 187 210.
const DESIGN = [
  { date: '2026-09-29', score: 199 },
  { date: '2026-09-29', score: 176 },
  { date: '2026-09-29', score: 192 },
  { date: '2026-10-06', score: 199 },
  { date: '2026-10-06', score: 181 },
  { date: '2026-10-06', score: 214 },
  { date: '2026-10-07', score: 187 },
  { date: '2026-10-07', score: 210 },
];
const TODAY = '2026-10-07';

describe('Lite: «Tu promedio»', () => {
  it('cómo vas: este mes contra el anterior, la misma cuenta que la Tendencia de Pro (en enteros); sin mes anterior, nada', () => {
    // El del diseño: septiembre 189, octubre 198.2 → «+9 en octubre» (Pro: «+9.2»).
    expect(trendBadge(DESIGN)).toMatchObject({ dir: 'up', text: '+9 en octubre' });
    expect(monthCompare(DESIGN)!.delta).toBe(9.2);
    expect(trendBadge(DESIGN)!.full).toBe('Tu promedio en octubre: 198.2; en septiembre: 189 (+9.2).');
    // El de la verificación: septiembre 198, octubre 193.8 → «−4 en octubre» (Pro: «−4.2»), en gris.
    const down = [
      { date: '2026-09-29', score: 198 },
      { date: '2026-10-06', score: 190 },
      { date: '2026-10-07', score: 197.6 },
    ];
    expect(trendBadge(down)).toMatchObject({ dir: 'down', text: '−4 en octubre' });
    expect(trendBadge([{ date: '2026-09-29', score: 190 }, { date: '2026-10-06', score: 190.4 }])).toMatchObject({ dir: 'flat', text: 'Parejo en octubre' });
    expect(trendBadge(DESIGN.filter((g) => g.date >= '2026-10-01'))).toBeNull();
    expect(trendBadge([])).toBeNull();
  });

  it('la gráfica corta: de lado a lado de 132 × 76, el más alto arriba y el último con su punto', () => {
    const s = sparkline(DESIGN.map((g) => g.score))!;
    expect(s.line.startsWith('M4.0 ')).toBe(true);
    expect(s.line).toContain('L92.6 8.4');
    expect(s.last).toEqual({ x: 128, y: expect.closeTo(14, 0) });
    expect(s.area.endsWith('L128.0 76 L4 76 Z')).toBe(true);
    expect(sparkline([200])).toBeNull();
  });

  it('la tarjeta: el promedio grande, la gráfica, «+9 en octubre» y Mejor juego · Mejor serie · Juegos', () => {
    const out = renderToString(h(AverageCard, { average: 195, history: DESIGN, high: 214, series: 594, games: 8 }));
    const t = text(out);
    expect(t).toContain('Tu promedio 195');
    expect(t).toContain('+9 en octubre');
    expect(t).toMatch(/Mejor juego.*214|214.*Mejor juego/);
    expect(t).toContain('594');
    expect(t).toContain('Juegos');
    expect(out).toContain('text-hero');
    expect(out).toContain('text-ok');
    // La gráfica corta: la línea de los últimos 8, su área y el punto del último.
    expect(out).toContain('width="132" height="76"');
    expect(out.match(/<circle [^>]*r="4.5"/g)).toHaveLength(1);
  });

  it('sin juegos todavía: «—» y sin gráfica', () => {
    const out = renderToString(h(AverageCard, { average: null, history: [], high: 0, series: 0, games: 0 }));
    expect(text(out)).toContain('Tu promedio —');
    expect(out).not.toContain('<svg');
  });
});

describe('Pro: los 6 números', () => {
  it('en 3 × 2, el promedio en el color del deporte', () => {
    const out = renderToString(
      h(NumbersGrid, {
        items: [
          { label: 'Promedio', value: 195, accent: true },
          { label: 'Mejor juego', value: 214 },
          { label: 'Mejor serie', value: 594 },
          { label: 'Juegos', value: 8 },
          { label: 'Hcp', value: 28 },
          { label: 'Asistencia', value: '3/3' },
        ],
      }),
    );
    const t = text(out);
    for (const s of ['Promedio', 'Mejor juego', 'Mejor serie', 'Juegos', 'Hcp', 'Asistencia', '3/3']) expect(t).toContain(s);
    expect(out).toContain('grid-cols-3');
    expect(out).toMatch(/text-accent[^"]*">195</);
  });
});

describe('Pro: «Tendencia»', () => {
  it('los días: «Hoy», «Ayer» o «6 oct»', () => {
    expect(dayLabel('2026-10-07', TODAY)).toBe('Hoy');
    expect(dayLabel('2026-10-06', TODAY)).toBe('Ayer');
    expect(dayLabel('2026-09-29', TODAY)).toBe('29 sep');
    expect(dayLabel('2025-12-31', '2026-01-01')).toBe('Ayer');
  });

  it('el eje: tu promedio en el medio y lo mismo arriba y abajo (de 5 en 5, 25 o más)', () => {
    expect(trendScale(DESIGN.map((g) => g.score), 195)).toEqual({ mid: 195, half: 25 });
    expect(trendScale([150, 240], 190)).toEqual({ mid: 190, half: 55 });
    expect(trendScale([180, 200], null)).toEqual({ mid: 190, half: 25 });
  });

  it('como el diseño: 3 días con su fecha al centro y una línea punteada entre uno y otro; el mejor y el último', () => {
    const L = trendLayout(gamePoints(DESIGN, TODAY), 195, 302);
    expect(L.ticks).toEqual([220, 195, 170]);
    expect(L.labels.map((l) => l.label)).toEqual(['29 sep', 'Ayer', 'Hoy']);
    expect(L.labels[0].x).toBeCloseTo(74.6, 0);
    expect(L.separators.map((x) => Math.round(x))).toEqual([129, 239]);
    expect(L.best).toBe(5);
    expect(L.last).toBe(7);
    expect(L.y(214)).toBeCloseTo(22.5, 0);
  });

  it('las fechas que no caben no se pisan: la de hoy siempre', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, score: 180 + (i % 7) * 5 }));
    const L = trendLayout(gamePoints(many, '2026-09-30'), 195, 272);
    expect(L.labels[L.labels.length - 1].label).toBe('Hoy');
    for (let i = 1; i < L.labels.length; i++) expect(L.labels[i].x - L.labels[i - 1].x).toBeGreaterThanOrEqual(46);
    expect(L.labels.length).toBeLessThan(10);
  });

  it('por mes: el promedio de cada mes con su nombre corto (y el año si son de dos años)', () => {
    expect(monthPoints(DESIGN).map((p) => [p.label, p.score])).toEqual([
      ['sep', 189],
      ['oct', 198],
    ]);
    expect(monthPoints([{ date: '2025-12-02', score: 150 }, { date: '2026-01-05', score: 160 }]).map((p) => p.label)).toEqual(['dic 25', 'ene 26']);
    expect(monthPoints(DESIGN)[1].tip).toBe('Octubre 2026 · 5 juegos · mejor 214');
  });

  it('el mes anterior contra este: «Septiembre 189 · Octubre 198.2 · +9.2»', () => {
    expect(monthCompare(DESIGN)).toEqual({
      prev: { name: 'Septiembre', average: '189' },
      last: { name: 'Octubre', average: '198.2', games: 5 },
      delta: 9.2,
    });
    expect(monthCompare([{ date: '2026-10-01', score: 200 }])).toEqual({ prev: null, last: { name: 'Octubre', average: '200', games: 1 }, delta: null });
    expect(monthCompare([{ date: '2025-12-01', score: 200 }, { date: '2026-01-01', score: 180 }])!.prev!.name).toBe('Diciembre 2025');
    expect(monthCompare([])).toBeNull();
    expect(oneDecimal(198.26)).toBe('198.2');
  });

  it('la tarjeta: «Tendencia» con Por juego | Por mes, las fechas, «214 mejor», el último y los meses abajo', () => {
    const out = renderToString(h(TrendCard, { games: DESIGN, average: 195, today: TODAY }));
    const t = text(out);
    expect(t).toContain('Tendencia');
    expect(out).toContain('role="radiogroup" aria-label="Ver la tendencia"');
    expect(out).toMatch(/aria-checked="true"[^>]*>Por juego/);
    expect(t).toContain('214 mejor');
    expect(t).toContain('210');
    expect(t).toContain('29 sep');
    expect(t).toContain('Hoy');
    expect(t).toContain('220 195 170');
    expect(t).toContain('Septiembre 189');
    expect(t).toContain('Octubre 198.2');
    expect(t).toContain('+9.2');
    expect(out).toContain('text-ok');
    expect(out).toContain('aria-label="Tus últimos 8 juegos: de 176 a 214; tu promedio, 195"');
    expect(out.match(/data-separador/g)).toHaveLength(2);
  });

  it('el mejor pegado al último: su número a la izquierda de su punto (no se pisan)', () => {
    const games = [...DESIGN.slice(0, 6), { date: TODAY, score: 224 }, { date: TODAY, score: 221 }];
    const out = renderToString(h(TrendCard, { games, average: 197, today: TODAY }));
    expect(out).toMatch(/<text [^>]*text-anchor="end" data-mejor="">224<\/text>/);
    expect(text(out)).not.toContain('224 mejor');
    expect(text(out)).toContain('221');
  });

  it('con un solo mes no hay «Por mes»; con menos de 2 juegos no sale', () => {
    const one = DESIGN.filter((g) => g.date.startsWith('2026-10'));
    const out = renderToString(h(TrendCard, { games: one, average: 198, today: TODAY }));
    expect(out).not.toContain('Por mes');
    expect(text(out)).toContain('5 juegos');
    expect(renderToString(h(TrendCard, { games: DESIGN.slice(0, 1), average: 199, today: TODAY }))).toBe('');
  });
});

describe('Pro: «Tus tiros»', () => {
  const strike = { rolls: Array.from({ length: 12 }, () => 10) };
  // 9 / en cada cuadro y 9 de la bola extra: 10 spares.
  const spares = { rolls: [...Array.from({ length: 10 }, () => [9, 1]).flat(), 9] };

  it('de cada 100 cuadros, strikes, spares y abiertos (suman 100)', () => {
    expect(frameShares({ frames: 20, spares: 10, opens: 0 })).toEqual({ strikes: 50, spares: 50, opens: 0 });
    expect(frameShares({ frames: 30, spares: 10, opens: 5 })).toEqual({ strikes: 50, spares: 33, opens: 17 });
    expect(frameShares({ frames: 0, spares: 0, opens: 0 })).toBeNull();
  });

  it('el pino que más se queda parado y cuánto lo conviertes', () => {
    const report: PinReport = {
      racks: 20,
      games: 2,
      pins: Array.from({ length: 10 }, (_, i) => ({ pin: i + 1, left: i === 9 ? 7 : i === 6 ? 3 : 0, leftPct: null, inLeave: 7, converted: 3, convertedPct: i === 9 ? 43 : null })),
    };
    expect(pinLine(report)).toEqual({ pin: 10, left: 7, converted: 43 });
    expect(pinLine({ racks: 0, games: 0, pins: [] })).toBeNull();
  });

  it('la tarjeta con Teclado: la barra, los 3 números, la primera bola y «Ver todo por cuadros» (sin pinos)', () => {
    const t = text(renderToString(h(ShotsCard, { frames: [strike, spares], games: 2 })));
    expect(t).toContain('Tus tiros');
    expect(t).toContain('Con Teclado');
    expect(t).not.toContain('Con Teclado y Pines');
    expect(t).toContain('Strikes');
    expect(t).toContain('50%');
    expect(t).toContain('Abiertos 0%');
    expect(t).toContain('Primera bola, promedio');
    expect(t).toContain('pinos');
    expect(t).not.toContain('Pinos que te quedan');
    expect(t).toContain('Ver todo por cuadros');
  });

  it('con Pines: «Pinos que te quedan» con los 10 pinos chiquitos', () => {
    // Cada cuadro: 9 pinos (queda el 10) y spare con el 10; el 10 del último cuadro, con su bola extra.
    const leave10 = 0b1000000000;
    const all = 0b1111111111;
    const rolls = [...Array.from({ length: 10 }, () => [9, 1]).flat(), 9];
    const masks = [...Array.from({ length: 10 }, () => [all ^ leave10, leave10]).flat(), all ^ leave10];
    const out = renderToString(h(ShotsCard, { frames: [{ rolls, masks }], games: 1 }));
    const t = text(out);
    expect(t).toContain('Con Teclado y Pines');
    expect(t).toContain('Pinos que te quedan');
    expect(t).toMatch(/El 10 se te queda 11 veces y lo conviertes el 100% ?\./);
    expect(out.match(/size-\[22px\]/g)).toHaveLength(10);
  });

  it('sin juegos por cuadros: cómo anotarlos (y nada si no hay juegos)', () => {
    expect(text(renderToString(h(ShotsCard, { frames: [], games: 4 })))).toContain('Anota tus juegos con Teclado');
    expect(renderToString(h(ShotsCard, { frames: [], games: 0 }))).toBe('');
  });
});
