import { describe, expect, it } from 'vitest';
import { improvementPct, isPersonalBest, personalBests, type SwimSwim } from './bests';

const swim = (date: string, time: number | null, over: Partial<SwimSwim> = {}): SwimSwim => ({
  distance: 50,
  stroke: 'libre',
  pool: 25,
  time,
  status: 'ok',
  date,
  ...over,
});

describe('marcas personales', () => {
  const history: SwimSwim[] = [
    swim('2026-05-10', 3450),
    swim('2026-01-15', 3500),
    swim('2026-03-20', 3400),
    swim('2026-07-01', 3300, { eventId: 'ev7' }),
    swim('2026-02-01', 3000, { status: 'dq' }),
    swim('2026-04-01', 3600, { pool: 50 }),
    swim('2026-06-01', 3550, { pool: 50 }),
    swim('2026-06-02', 4200, { stroke: 'espalda' }),
    swim('2026-06-03', null, { status: 'dns' }),
  ];
  const bests = personalBests(history);

  it('una marca por estilo, distancia y piscina (25 y 50 m separadas)', () => {
    expect(bests.map((b) => [b.key, b.best])).toEqual([
      ['libre-50-25', 3300],
      ['libre-50-50', 3550],
      ['espalda-50-25', 4200],
    ]);
  });

  it('la DQ y los DNS no cuentan', () => {
    expect(bests[0].swims).toBe(4);
  });

  it('progresión en orden de fecha con el % que bajó cada vez', () => {
    const b = bests[0];
    expect(b.first).toBe(3500);
    expect(b.last).toBe(3300);
    expect(b.date).toBe('2026-07-01');
    expect(b.progression).toEqual([
      { date: '2026-01-15', time: 3500, pct: null, eventId: undefined },
      { date: '2026-03-20', time: 3400, pct: 2.86, eventId: undefined },
      { date: '2026-07-01', time: 3300, pct: 2.94, eventId: 'ev7' },
    ]);
    expect(b.improvementPct).toBe(5.71);
  });

  it('% de mejora', () => {
    expect(improvementPct(4000, 3800)).toBe(5);
    expect(improvementPct(3000, 3100)).toBe(-3.33);
  });

  it('¿es marca personal?', () => {
    expect(isPersonalBest(history, swim('2026-08-01', 3250))).toBe(true);
    expect(isPersonalBest(history, swim('2026-08-01', 3300))).toBe(false);
    expect(isPersonalBest(history, swim('2026-08-01', 3500, { pool: 50 }))).toBe(true);
    expect(isPersonalBest(history, swim('2026-08-01', 9000, { stroke: 'pecho' }))).toBe(true);
    expect(isPersonalBest(history, swim('2026-08-01', 3000, { status: 'dq' }))).toBe(false);
  });

  it('el tiempo ya guardado en el historial se compara con los demás', () => {
    const last = history[3];
    expect(isPersonalBest(history, last)).toBe(true);
  });

  it('sin tiempos válidos no hay marcas', () => {
    expect(personalBests([swim('2026-01-01', null, { status: 'dns' })])).toEqual([]);
  });
});
