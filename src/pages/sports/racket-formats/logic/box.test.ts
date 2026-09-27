import { describe, expect, it } from 'vitest';
import { mkMatch, sets } from '../../racket/logic/testMatch';
import type { ScheduleEntrant } from '../../racket/logic/league';
import {
  DEFAULT_BOX_RULES,
  boxConfigJson,
  boxName,
  boxTables,
  closeMonth,
  entrantLevel,
  firstBoxes,
  monthDrafts,
  monthLabel,
  monthProgress,
  monthRange,
  moveText,
  nextMonthRange,
  openMonth,
  parseBoxConfig,
  previewSizes,
  type BoxConfig,
  type BoxMonth,
} from './box';

const P = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const single = (id: string): ScheduleEntrant => ({ id, players: [id], team: false });

describe('configuración de la liga por cajas', () => {
  it('lo que falta se pone; lo que no sirve se descarta', () => {
    const c = parseBoxConfig({ months: [{ n: 1, boxes: [['a', 'b'], [], 'x'], moves: [{ id: 'a', from: 0, to: 1, move: 'baja' }, { id: 'b' }] }], rules: { min: 9, max: 2 } });
    expect(c.doubles).toBe(false);
    expect(c.points).toBe('standard');
    expect(c.rules.min).toBe(8);
    expect(c.rules.max).toBe(8);
    expect(c.months).toHaveLength(1);
    expect(c.months[0].boxes).toEqual([['a', 'b']]);
    expect(c.months[0].moves).toEqual([{ id: 'a', from: 0, to: 1, move: 'baja' }]);
    expect(c.round).toBe(1);
    expect(parseBoxConfig(null)).toMatchObject({ format: 'cajas', months: [], entrants: [], rules: DEFAULT_BOX_RULES });
  });

  it('se guarda entera (update_event reemplaza la configuración)', () => {
    const c: BoxConfig = parseBoxConfig({ doubles: true, entrants: ['t1', 't2'], months: [{ n: 1, label: 'Octubre 2026', boxes: [['t1', 't2']] }], round: 1 });
    expect(parseBoxConfig(boxConfigJson(c))).toEqual(c);
    expect(openMonth(c)?.n).toBe(1);
    expect(openMonth({ ...c, months: [{ ...c.months[0], closed: true }] })).toBeNull();
  });

  it('meses viejos archivados por la base (tope de events.config): sin cajas ni movidas, y se conservan al guardar', () => {
    // Así los deja save_box_month: los viejos solo con número y nombre; los cerrados de antes, sin cajas.
    const c = parseBoxConfig({
      months: [
        { n: 1, label: 'Octubre 2026', closed: true, archived: true },
        { n: 2, label: 'Noviembre 2026', closed: true, moves: [{ id: 'a', from: 1, to: 0, move: 'sube' }] },
        { n: 3, label: 'Diciembre 2026', boxes: [['a', 'b']], closed: false },
      ],
      round: 3,
    });
    expect(c.months.map((m) => [m.n, m.archived ?? false, m.boxes.length, m.moves.length])).toEqual([
      [1, true, 0, 0],
      [2, false, 0, 1],
      [3, false, 1, 0],
    ]);
    expect(openMonth(c)?.n).toBe(3);
    expect(parseBoxConfig(boxConfigJson(c))).toEqual(c);
    expect(parseBoxConfig({ months: [{ n: 1, archived: 'si' }] }).months[0]).not.toHaveProperty('archived');
  });
});

describe('meses', () => {
  it('nombre, primer y último día, y el que sigue', () => {
    expect(monthLabel('2026-10-15')).toBe('Octubre 2026');
    expect(monthRange('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthRange('2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(nextMonthRange('2026-10-31', '2026-10-30')).toEqual({ start: '2026-11-01', end: '2026-11-30', label: 'Noviembre 2026' });
    expect(nextMonthRange('2026-12-31', '2026-12-31')).toMatchObject({ start: '2027-01-01', label: 'Enero 2027' });
    // Cerrar tarde (ya pasó el mes siguiente): el mes de hoy.
    expect(nextMonthRange('2026-06-30', '2026-09-10')).toMatchObject({ start: '2026-09-01', label: 'Septiembre 2026' });
    expect(nextMonthRange(null, '2026-09-10')).toMatchObject({ start: '2026-09-01', end: '2026-09-30' });
  });
});

describe('cajas del primer mes', () => {
  it('por nivel, de mejor a peor; sin nivel al final en su orden; tamaños parejos de 4 a 6', () => {
    const ids = P(10);
    const levels = { p3: 5, p7: 4.5, p1: 3, p9: 4 };
    const boxes = firstBoxes(ids.map(single), levels);
    expect(boxes.map((b) => b.length)).toEqual([5, 5]);
    expect(boxes[0].slice(0, 4)).toEqual(['p3', 'p7', 'p9', 'p1']);
    expect(boxes[0][4]).toBe('p2');
    expect(previewSizes(13)).toEqual([5, 4, 4]);
    expect(previewSizes(7)).toEqual([4, 3]);
  });

  it('nivel de una pareja: la suma de los dos (o el que se sepa)', () => {
    expect(entrantLevel({ id: 't', players: ['a', 'b'], team: true }, { a: 3.5, b: 4 })).toBe(7.5);
    expect(entrantLevel({ id: 't', players: ['a', 'b'], team: true }, { b: 4 })).toBe(4);
    expect(entrantLevel({ id: 't', players: ['a', 'b'], team: true }, {})).toBeNull();
  });

  it('partidos del mes: todos contra todos dentro de cada caja, sin fecha, con «Caja N»', () => {
    const boxes = [P(4), ['p5', 'p6', 'p7']];
    const drafts = monthDrafts(boxes, single, { rules: { match: { sport: 'tennis' } } });
    expect(drafts).toHaveLength(6 + 3);
    expect(drafts.filter((d) => d.stage === 'Caja 1')).toHaveLength(6);
    expect(drafts.filter((d) => d.stage === 'Caja 2')).toHaveLength(3);
    expect(drafts.every((d) => d.format === 'sets' && !d.scheduledAt && d.rules)).toBe(true);
    expect(drafts[0].sides[0]).toMatchObject({ side: 1, teamId: null, players: [{ playerId: expect.any(String) }] });
    // Dobles: el lado es la pareja con sus dos jugadores.
    const team = (id: string): ScheduleEntrant => ({ id, players: [`${id}a`, `${id}b`], team: true });
    const d2 = monthDrafts([['t1', 't2']], team);
    expect(d2[0].sides[0]).toEqual({ side: 1, teamId: 't1', players: [{ playerId: 't1a' }, { playerId: 't1b' }] });
  });
});

describe('tabla de cada caja y cierre del mes', () => {
  const month: BoxMonth = { n: 1, label: 'Octubre 2026', start: '2026-10-01', end: '2026-10-31', boxes: [P(4), ['p5', 'p6', 'p7', 'p8']], closed: false, moves: [] };
  const played = (a: string, b: string, text: string, winner: 1 | 2, games: [number, number]) =>
    sets([a], [b], text, winner, { sets: winner === 1 ? [2, 0] : [0, 2], games }, { round: 1, stage: '' });
  const matches = [
    played('p1', 'p2', '6-4 6-4', 1, [12, 8]),
    played('p1', 'p3', '6-1 6-1', 1, [12, 2]),
    played('p2', 'p3', '6-3 6-3', 1, [12, 6]),
    played('p5', 'p6', '6-0 6-0', 1, [12, 0]),
    played('p5', 'p7', '6-2 6-2', 1, [12, 4]),
    played('p6', 'p7', '6-4 6-4', 1, [12, 8]),
    // De otro mes: no cuenta.
    { ...played('p4', 'p1', '6-0 6-0', 1, [12, 0]), round: 2 },
    // Sin jugar.
    mkMatch({ a: ['p1'], b: ['p4'], round: 1 }),
  ];

  it('tabla por caja con los desempates de raqueta', () => {
    const t = boxTables('tennis', month, matches);
    expect(t).toHaveLength(2);
    expect(t[0].map((r) => r.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(t[0][0]).toMatchObject({ played: 2, won: 2, points: 6 });
    expect(t[1].map((r) => r.id)).toEqual(['p5', 'p6', 'p7', 'p8']);
  });

  it('cómo va el mes: jugados y quién no llega al mínimo (en la última caja no se baja)', () => {
    const t = boxTables('tennis', month, matches);
    const p = monthProgress(month, matches, t, DEFAULT_BOX_RULES);
    expect(p).toMatchObject({ done: 6, total: 7 });
    expect(p.short).toEqual(['p4']);
  });

  it('cierre: suben 2, bajan 2 (y quien no jugó el mínimo); nuevos abajo, los que se van salen', () => {
    const cfg = parseBoxConfig({ entrants: [...P(8).filter((x) => x !== 'p3'), 'p9'], months: [month] });
    const t = boxTables('tennis', month, matches);
    const r = closeMonth(cfg, month, t);
    // Caja 1: p3 se fue; de los 3 que quedan bajan los 2 últimos (p2, y p4 que además no jugó); p1 se queda.
    // Caja 2: suben p5 y p6, y como la caja 1 quedó corta, sube también el mejor que se quedaba (p7).
    expect(r.boxes[0]).toEqual(['p1', 'p5', 'p6', 'p7']);
    expect(r.boxes[1]).toEqual(['p8', 'p2', 'p4', 'p9']);
    expect(r.boxes.flat()).not.toContain('p3');
    expect(r.boxes.flat()).toContain('p9');
    const mv = new Map(r.moves.map((m) => [m.id, m]));
    expect(mv.get('p5')?.move).toBe('sube');
    expect(mv.get('p4')).toMatchObject({ move: 'baja', reason: 'pocos-partidos' });
    expect(mv.get('p9')?.move).toBe('nuevo');
    expect(moveText(mv.get('p5')!)).toBe('Sube a la Caja 1');
    expect(moveText(mv.get('p4')!)).toBe('Baja a la Caja 2 (pocos partidos)');
    expect(moveText(mv.get('p9')!)).toMatch(/^Entra en la Caja/);
    expect(boxName(2)).toBe('Caja 3');
  });

  it('pickleball: la tabla de cada caja con el orden de USA Pickleball', () => {
    const pk = [
      sets(['p1'], ['p2'], '11-9', 1, { sets: [1, 0], games: [1, 0] }, { round: 1, score: { text: '11-9', sides: [1, 0], totals: { sets: [1, 0], games: [1, 0], points: [11, 9] } } }),
      sets(['p2'], ['p3'], '11-2', 1, { sets: [1, 0], games: [1, 0] }, { round: 1, score: { text: '11-2', sides: [1, 0], totals: { sets: [1, 0], games: [1, 0], points: [11, 2] } } }),
      sets(['p3'], ['p1'], '11-5', 1, { sets: [1, 0], games: [1, 0] }, { round: 1, score: { text: '11-5', sides: [1, 0], totals: { sets: [1, 0], games: [1, 0], points: [11, 5] } } }),
    ];
    const t = boxTables('pickleball', { ...month, boxes: [['p1', 'p2', 'p3']] }, pk);
    // Los tres con 1 ganado: decide la dif. de puntos (p2 +7, p3 -3, p1 -4).
    expect(t[0].map((r) => r.id)).toEqual(['p2', 'p3', 'p1']);
  });
});
