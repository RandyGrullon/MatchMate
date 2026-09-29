import { describe, expect, it } from 'vitest';
import type { SwimClub, SwimEntry, SwimEventItem, SwimMeet } from '../data/swimming';
import { POINTS_6_LANES } from '../../sports/swimming';
import { LEAGUE } from './fixtures';
import { swimReport } from './swimming';
import { excelLines, pdfPages, podiumsBrief, view } from './testing';

const SWIM = { ...LEAGUE, sport: 'swimming', venue: 'Piscina Olímpica' };

const meet = (over: Partial<SwimMeet> = {}): SwimMeet => ({
  id: 'm1',
  type: 'encuentro',
  name: 'Copa Delfín',
  date: '2026-10-10',
  startTime: null,
  announcement: '',
  pool: 25,
  lanes: 6,
  points: POINTS_6_LANES,
  ageGroups: 'none',
  heatsPublishedAt: '2026-10-09T12:00:00Z',
  finalizedAt: '2026-10-10T20:00:00Z',
  ...over,
});

const ev = (id: string, num: number, over: Partial<SwimEventItem> = {}): SwimEventItem => ({ id, meetId: 'm1', num, distance: 50, stroke: 'libre', pool: 25, gender: 'X', ageGroups: [], ...over });

let n = 0;
const entry = (swimEventId: string, playerId: string, clubId: string, time: number | null, over: Partial<SwimEntry> = {}): SwimEntry => ({
  id: `e${++n}`,
  meetId: 'm1',
  swimEventId,
  playerId,
  clubId,
  ageGroup: null,
  seed: null,
  heat: 1,
  lane: n,
  time,
  status: 'ok',
  resultAt: '2026-10-10T15:00:00Z',
  ...over,
});

const EVENTS = [ev('f50', 1, { gender: 'F' }), ev('m50', 2, { gender: 'M' }), ev('x100', 3, { distance: 100 })];
// Delfines: Ana (dos oros), Juan y Eva (DQ). Tiburones: Luis (oro y plata) y Bea.
const ENTRIES = [
  entry('f50', 'ana', 'del', 3000),
  entry('f50', 'bea', 'tib', 3100),
  entry('f50', 'eva', 'del', 3150, { status: 'dq' }),
  entry('m50', 'luis', 'tib', 2800),
  entry('m50', 'juan', 'del', 2900),
  entry('x100', 'ana', 'del', 6500),
  entry('x100', 'luis', 'tib', 6600),
];
const CLUBS = new Map<string, SwimClub>([
  ['del', { id: 'del', name: 'Delfines', short: 'DEL', color: null, coachId: null }],
  ['tib', { id: 'tib', name: 'Tiburones', short: 'TIB', color: null, coachId: null }],
]);
const name = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
const report = (m: SwimMeet = meet()) => swimReport({ lid: 'L1', league: SWIM, title: m.name || 'Control de marcas', data: { meet: m, events: EVENTS, entries: ENTRIES, clubs: CLUBS, name } });

describe('reporte de la natación', () => {
  it('arriba: el encuentro, la piscina con sus medidas y los puntos por puesto', () => {
    const r = report();
    expect(r.title).toBe('Copa Delfín');
    expect(r.subtitle).toBe('Liga Norte · Natación');
    expect(r.facts.map((f) => [f.label, f.label === 'Fecha' ? '' : f.value])).toEqual([
      ['Fecha', ''],
      ['Tipo', 'Encuentro'],
      ['Piscina', 'Piscina Olímpica · 25 m · 6 carriles'],
      ['Pruebas', '3'],
      ['Puntos por puesto', '6-4-3-2-1'],
    ]);
    expect(r.final).toBe(true);
    expect(r.highlights).toEqual([
      { label: 'Nadadores', value: '5' },
      { label: 'Clubes', value: '2' },
      { label: 'Salidas con resultado', value: '7' },
    ]);
  });

  it('campeones: el club y el nadador del encuentro (general, femenino y masculino), como los premios', () => {
    expect(podiumsBrief(report())).toEqual([
      [
        'Clubes',
        [
          [1, [['Delfines', 'Ana y Juan', '16 puntos']]],
          [2, [['Tiburones', 'Bea y Luis', '14 puntos']]],
        ],
      ],
      [
        'Individual',
        [
          [1, [['Ana', null, '12 puntos']]],
          [2, [['Luis', null, '10 puntos']]],
          [3, [['Bea', null, '4 puntos'], ['Juan', null, '4 puntos']]],
        ],
      ],
      [
        'Individual · Femenino',
        [
          [1, [['Ana', null, '12 puntos']]],
          [2, [['Bea', null, '4 puntos']]],
        ],
      ],
      [
        'Individual · Masculino',
        [
          [1, [['Luis', null, '10 puntos']]],
          [2, [['Juan', null, '4 puntos']]],
        ],
      ],
    ]);
  });

  it('General: los clubes con sus medallas y los resultados de cada prueba (el DQ sin puesto)', () => {
    const [clubs, results] = report().general;
    expect(view(clubs, 'pdf').rows).toEqual([
      [1, 'Delfines', 16, 2, 1, 0],
      [2, 'Tiburones', 14, 1, 2, 0],
    ]);
    const pdf = view(results, 'pdf');
    expect(pdf.head).toEqual(['Lugar', 'Nadador', 'Club', 'Tiempo', 'Pts', 'Estado']);
    expect(pdf.rows.slice(0, 4)).toEqual([
      'Prueba 1 · 50 m Libre · Femenino · Abierta',
      [1, 'Ana', 'Delfines', '30.00', 6, null],
      [2, 'Bea', 'Tiburones', '31.00', 4, null],
      [null, 'Eva', 'Delfines', '31.50', null, 'DQ'],
    ]);
    expect(view(results, 'excel').head).toEqual(['Lugar', 'Nadador', 'Club', 'Tiempo', 'Pts', 'Estado', 'Serie', 'Carril']);
  });

  it('Individual: el nadador del encuentro y los resultados de cada nadador', () => {
    const [best, each] = report().individual;
    expect(view(best, 'pdf').rows).toEqual([
      [1, 'Ana', 'Delfines', 2, 2, 0, 0, 12],
      [2, 'Luis', 'Tiburones', 2, 1, 1, 0, 10],
      [3, 'Bea', 'Tiburones', 1, 0, 1, 0, 4],
      [3, 'Juan', 'Delfines', 1, 0, 1, 0, 4],
    ]);
    expect(view(each, 'pdf').rows.slice(0, 6)).toEqual([
      'Ana · Delfines',
      ['1. 50 m Libre', 'Abierta', '30.00', 1, 6, null],
      ['3. 100 m Libre', 'Abierta', '1:05.00', 1, 6, null],
      'Bea · Tiburones',
      ['1. 50 m Libre', 'Abierta', '31.00', 2, 4, null],
      'Eva · Delfines',
    ]);
  });

  it('control de marcas: sin premios ni puntos, solo tiempos', () => {
    const r = report(meet({ type: 'control', name: '' }));
    expect(r.podiums).toEqual([]);
    expect(r.general.map((t) => t.title)).toEqual(['Resultados']);
    expect(view(r.general[0], 'pdf').head).toEqual(['Lugar', 'Nadador', 'Club', 'Tiempo', 'Estado']);
    expect(r.individual.map((t) => t.title)).toEqual(['Resultados por nadador']);
    expect(excelLines(r).names).toEqual(['General', 'Individual', 'Series', 'Resultados']);
  });

  it('sin finalizar: aviso; PDF y Excel con todo (y las hojas de siempre)', () => {
    const r = report(meet({ finalizedAt: null }));
    expect(r.final).toBe(false);
    expect(r.notes).toEqual(['El encuentro todavía no se finaliza: los resultados pueden cambiar.']);
    expect(excelLines(r).names).toEqual(['General', 'Individual', 'Series', 'Resultados', 'Clubes']);
    // Cuatro podios y todos los resultados: «General» pasa sola a la página siguiente; «Individual» empieza en otra.
    const { pages, individualFrom } = pdfPages(r);
    expect(individualFrom).toBe(3);
    expect(pages.slice(0, 2).flat()).toEqual(expect.arrayContaining(['Resultados parciales', 'Copa Delfín', 'Clubes', 'Delfines', 'Prueba 1 · 50 m Libre · Femenino · Abierta']));
    expect(pages[2]).toEqual(expect.arrayContaining(['Nadador del encuentro', 'Resultados por nadador', 'Ana · Delfines']));
  });
});
