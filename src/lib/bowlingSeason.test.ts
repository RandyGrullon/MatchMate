import { describe, expect, it } from 'vitest';
import {
  averageForDay,
  averageSourceLabel,
  averageSourceShort,
  buildGameContexts,
  entryMarks,
  gameMarks,
  handicapAverages,
  marksSummary,
  mostImproved,
  rankGap,
  rankGapLabel,
  rankingRows,
  readBowlingSnapshot,
  seasonAverage,
  seasonEvents,
  totalsByPlayer,
  type GameContext,
} from './bowlingSeason';
import type { Entry } from './types';

const s2025 = { id: 's25', startsOn: '2025-01-01', endsOn: '2025-12-20', status: 'closed' as const };
const s2026 = { id: 's26', startsOn: '2026-01-10', endsOn: '2026-12-15', status: 'active' as const };
const seasons = [s2026, s2025];

let n = 0;
/** Participación con juegos verificados (null = sin jugar; negativo = sin foto). */
const entry = (eventId: string, scores: (number | null)[], over: Partial<Entry> = {}): Entry => ({
  id: `e${++n}`,
  eventId,
  playerId: 'p1',
  teamId: null,
  average: 0,
  handicapOverride: null,
  scores: scores.map((s) => (s == null ? null : Math.abs(s))),
  photos: scores.map((s) => (s == null || s < 0 ? null : 'foto')),
  ...over,
});
const dated = (date: string, e: Entry) => ({ entry: e, date });

describe('promedio del handicap de la lista de jugadores', () => {
  it('lo mismo que una inscripción de hoy: la temporada con el mínimo gana al fijo; sin el mínimo, el fijo', () => {
    const dates = new Map([
      ['ev1', '2026-02-01'],
      ['ev2', '2026-03-01'],
      ['ev0', '2025-05-01'],
    ]);
    const six = entry('ev1', [150, 160, 170]);
    const more = entry('ev2', [150, 160, 170]);
    const old = entry('ev0', [200, 200], { playerId: 'p2' });
    const got = handicapAverages(
      [
        { id: 'p1', averageOverride: 180 },
        { id: 'p2', averageOverride: 190 },
        { id: 'p3', averageOverride: null },
      ],
      [six, more, old, entry('sin-fecha', [300], { playerId: 'p3' })],
      dates,
      seasons,
      '2026-09-29',
    );
    // p1: 6 juegos verificados en 2026 (promedio 160): manda la temporada aunque tenga 180 fijo.
    expect(got.get('p1')).toEqual({ average: 160, source: 'temporada' });
    // p2: 2 juegos en 2025 (menos del mínimo) y nada en 2026: el fijo.
    expect(got.get('p2')).toEqual({ average: 190, source: 'fijo' });
    // p3: su juego es de un evento que no se conoce: sin juegos.
    expect(got.get('p3')).toEqual({ average: 0, source: 'ninguno' });
    expect(['temporada', 'anterior', 'fijo', 'entrada', 'pocos', 'ninguno'].map((s) => averageSourceShort(s as never))).toEqual([
      null,
      'anterior',
      'fijo',
      'entrada',
      'pocos',
      null,
    ]);
  });
});

describe('promedio del handicap por temporada', () => {
  it('con el mínimo de juegos manda la temporada (aunque tenga fijo)', () => {
    expect(seasonAverage({ season: { games: 6, pins: 1200 }, previous: { games: 30, pins: 5400 }, override: 150 })).toEqual({ average: 200, source: 'temporada' });
  });

  it('sin el mínimo: la anterior (con el mínimo), después el fijo, después el de su última entrada', () => {
    expect(seasonAverage({ season: { games: 2, pins: 400 }, previous: { games: 6, pins: 1080 }, override: 150 })).toEqual({ average: 180, source: 'anterior' });
    expect(seasonAverage({ season: { games: 2, pins: 400 }, previous: { games: 3, pins: 540 }, override: 150 })).toEqual({ average: 150, source: 'fijo' });
    expect(seasonAverage({ season: { games: 2, pins: 400 }, previous: null, override: null, frozen: 170 })).toEqual({ average: 170, source: 'entrada' });
  });

  it('sin nada de eso: los pocos juegos que tenga (las dos temporadas), o nada', () => {
    expect(seasonAverage({ season: { games: 2, pins: 381 }, previous: { games: 1, pins: 150 } })).toEqual({ average: 177, source: 'pocos' });
    expect(seasonAverage({ season: { games: 0, pins: 0 } })).toEqual({ average: 0, source: 'ninguno' });
    expect(averageSourceLabel('anterior')).toBe('Temporada anterior');
    expect(averageSourceLabel('pocos')).toBe('Menos de 6 juegos');
  });

  it('el de un evento cuenta lo de su temporada hasta ese día, sin el mismo evento', () => {
    const list = [
      // 2025: 6 juegos de 180.
      dated('2025-03-01', entry('ev1', [180, 180, 180])),
      dated('2025-04-01', entry('ev2', [180, 180, 180])),
      // 2026: 3 juegos de 220 (todavía sin el mínimo) y el torneo del día (no cuenta).
      dated('2026-02-01', entry('ev3', [220, 220, 220], { average: 175 })),
      dated('2026-03-01', entry('torneo', [300, 300, 300])),
    ];
    expect(averageForDay({ entries: list, seasons, day: '2026-03-01', skipEvent: 'torneo', override: null })).toEqual({ average: 180, source: 'anterior' });
    // Con 6 juegos en la temporada ya es el suyo.
    const more = [...list, dated('2026-02-15', entry('ev4', [200, 200, 200]))];
    expect(averageForDay({ entries: more, seasons, day: '2026-03-01', skipEvent: 'torneo', override: 150 })).toEqual({ average: 210, source: 'temporada' });
    // Lo de después de ese día no cuenta.
    expect(averageForDay({ entries: more, seasons, day: '2026-02-10', override: null }).source).toBe('anterior');
  });

  it('entre temporadas (se cerró y no empezó otra): esta no tiene juegos; manda la última', () => {
    const list = [dated('2025-03-01', entry('ev1', [150, 150, 150, 150, 150, 150]))];
    expect(averageForDay({ entries: list, seasons: [s2025], day: '2025-12-28', override: null })).toEqual({ average: 150, source: 'anterior' });
  });
});

describe('ranking de la temporada', () => {
  const events = [
    { id: 'a', date: '2025-05-01' },
    { id: 'b', date: '2026-02-01' },
    { id: 'c', date: '2026-08-01' },
  ];

  it('solo los eventos de la temporada elegida', () => {
    expect(seasonEvents(events, s2026).map((e) => e.id)).toEqual(['b', 'c']);
    expect(seasonEvents(events, s2025).map((e) => e.id)).toEqual(['a']);
    expect(seasonEvents(events, null)).toHaveLength(3);
  });

  it('una fila por jugador que sigue en la liga, con sus números verificados', () => {
    const rows = rankingRows(
      [entry('b', [200, 210, -250]), entry('c', [190, 180, 170]), entry('c', [150], { playerId: 'borrado' }), entry('c', [-100], { playerId: 'p2' })],
      [
        { id: 'p1', name: 'Ana' },
        { id: 'p2', name: 'Luis' },
      ],
    );
    expect(rows).toEqual([{ playerId: 'p1', name: 'Ana', average: 190, games: 5, pins: 950, high: 210, series: 540, events: 2 }]);
  });

  it('«Tú: 14.º · te faltan 2 juegos para entrar»', () => {
    const rows = [
      { playerId: 'a', average: 200, games: 10 },
      { playerId: 'b', average: 180, games: 6 },
      { playerId: 'c', average: 170, games: 8 },
      { playerId: 'yo', average: 175, games: 4 },
    ];
    const gap = rankGap(rows, 'yo')!;
    expect(gap).toEqual({ pos: 3, missing: 2 });
    expect(rankGapLabel(gap)).toBe('Tú: 3.º · te faltan 2 juegos para entrar');
    expect(rankGapLabel({ pos: 1, missing: 1 })).toBe('Tú: 1.º · te falta 1 juego para entrar');
    // Sin juegos todavía: sin puesto.
    expect(rankGapLabel(rankGap(rows, 'nuevo')!)).toBe('Tú: te faltan 6 juegos para entrar');
    // Ya entra (o no es jugador): nada.
    expect(rankGap(rows, 'a')).toBeNull();
    expect(rankGap(rows, null)).toBeNull();
  });

  it('más mejorado: esta temporada menos la anterior, con el mínimo en las dos', () => {
    const now = new Map([
      ['ana', { games: 6, pins: 1200 }],
      ['luis', { games: 6, pins: 1140 }],
      ['rosa', { games: 3, pins: 750 }],
      ['pepe', { games: 8, pins: 1200 }],
    ]);
    const before = new Map([
      ['ana', { games: 10, pins: 1800 }],
      ['luis', { games: 6, pins: 1020 }],
      ['rosa', { games: 10, pins: 1500 }],
      ['pepe', { games: 8, pins: 1600 }],
    ]);
    // Rosa no tiene el mínimo esta temporada y Pepe bajó; empate en lo que subieron: primero el de mejor promedio.
    expect(mostImproved(now, before)).toEqual([
      { playerId: 'ana', current: 200, previous: 180, delta: 20, games: 6, previousGames: 10 },
      { playerId: 'luis', current: 190, previous: 170, delta: 20, games: 6, previousGames: 6 },
    ]);
    expect(totalsByPlayer([entry('x', [100, 200]), entry('y', [150], { playerId: 'p2' })])).toEqual(
      new Map([
        ['p1', { games: 2, pins: 300 }],
        ['p2', { games: 1, pins: 150 }],
      ]),
    );
  });

  it('la tabla guardada al cerrar (la de Admin › Temporada) se lee como ranking: una fila por jugador', () => {
    const saved = {
      v: 1,
      sport: 'bowling',
      at: '2025-12-20T23:00:00.000Z',
      tables: [
        {
          key: 'promedio',
          title: 'Promedio',
          nameLabel: 'Jugador',
          columns: [{ label: 'Juegos' }, { label: 'Máx' }, { label: 'Prom.' }],
          rows: [{ rank: 1, name: 'Ana', playerId: 'p1', values: [12, 245, 190] }],
        },
        {
          key: 'juego',
          title: 'Mejor juego',
          nameLabel: 'Jugador',
          columns: [{ label: 'Juegos' }, { label: 'Serie' }, { label: 'Juego' }],
          rows: [
            { rank: 1, name: 'Luis', playerId: 'p2', values: [3, 610, 258] },
            { rank: 2, name: 'Ana', playerId: 'p1', values: [12, 640, 245] },
          ],
        },
      ],
    };
    expect(readBowlingSnapshot(JSON.parse(JSON.stringify(saved)))).toEqual({
      covers: ['promedio', 'juego'],
      rows: [
        { playerId: 'p1', name: 'Ana', average: 190, games: 12, pins: 0, high: 245, series: 640, events: 0 },
        { playerId: 'p2', name: 'Luis', average: 0, games: 3, pins: 0, high: 258, series: 610, events: 0 },
      ],
    });
    expect(readBowlingSnapshot({ ...saved, sport: 'basketball' })).toBeNull();
    expect(readBowlingSnapshot({ ...saved, tables: [] })).toBeNull();
    expect(readBowlingSnapshot([saved])).toBeNull();
    expect(readBowlingSnapshot(null)).toBeNull();
  });
});

describe('marcas de cada juego', () => {
  const ctx = (over: Partial<GameContext> = {}): GameContext => ({
    before: { games: 10, high: 210 },
    season: { games: 6, pins: 1080 },
    prevSeason: null,
    averageOverride: null,
    ...over,
  });

  it('récord personal: más alto que todo lo anterior (también los juegos de antes en el mismo evento)', () => {
    const marks = gameMarks([215, 212, 230], [true, true, true], ctx());
    expect(marks.map((m) => m?.record)).toEqual([true, false, true]);
    // Igualar el récord no es récord.
    expect(gameMarks([210], [true], ctx())[0]?.record).toBe(false);
  });

  it('con pocos juegos antes no hay récord (cualquiera lo sería)', () => {
    expect(gameMarks([250], [true], ctx({ before: { games: 2, high: 150 } }))[0]?.record).toBe(false);
    expect(gameMarks([150, 250], [true, true], ctx({ before: { games: 2, high: 150 } }))[1]?.record).toBe(true);
  });

  it('+15 sobre tu promedio: contra el de la temporada antes del evento', () => {
    const marks = gameMarks([195, 194, 205], [true, true, true], ctx({ before: { games: 10, high: 300 } }));
    expect(marks.map((m) => m?.over)).toEqual([15, null, 25]);
  });

  it('sin el mínimo en la temporada usa la anterior o el fijo; con pocos juegos no se marca', () => {
    expect(gameMarks([200], [true], ctx({ season: { games: 2, pins: 300 }, prevSeason: { games: 6, pins: 960 } }))[0]?.over).toBe(40);
    expect(gameMarks([200], [true], ctx({ season: { games: 2, pins: 300 }, averageOverride: 170 }))[0]?.over).toBe(30);
    expect(gameMarks([250], [true], ctx({ season: { games: 2, pins: 300 } }))[0]?.over).toBeNull();
  });

  it('los juegos sin foto o sin jugar no llevan marca ni cuentan para el récord', () => {
    const marks = gameMarks([300, null, 220], [false, false, true], ctx());
    expect(marks[0]).toBeNull();
    expect(marks[1]).toBeNull();
    expect(marks[2]?.record).toBe(true);
  });

  it('en texto: «Récord personal en el juego 2», «+18 sobre tu promedio» (o «su»)', () => {
    const marks = gameMarks([150, 228], [true, true], ctx());
    expect(marksSummary(marks)).toEqual(['Récord personal en el juego 2', '+48 sobre tu promedio en el juego 2']);
    expect(marksSummary(gameMarks([198], [true], ctx()), false)).toEqual(['+18 sobre su promedio']);
    expect(marksSummary([null, null])).toEqual([]);
  });

  it('el contexto calculado en el teléfono es el mismo que manda la base', () => {
    const e1 = entry('ev1', [180, 180, 180]);
    const e2 = entry('ev2', [200, -260, 190]);
    const e3 = entry('ev3', [210, 205, 150]);
    const e4 = entry('ev4', [240, 170, 180], { average: 160 });
    const map = buildGameContexts(
      [dated('2025-03-01', e1), dated('2025-11-01', e2), dated('2026-02-01', e3), dated('2026-03-01', e4)],
      seasons,
      null,
    );
    expect(map.get(e1.id)).toEqual({ before: { games: 0, high: 0 }, season: { games: 0, pins: 0 }, prevSeason: null, averageOverride: null });
    expect(map.get(e3.id)).toEqual({ before: { games: 5, high: 200 }, season: { games: 0, pins: 0 }, prevSeason: { games: 5, pins: 930 }, averageOverride: null });
    expect(map.get(e4.id)).toEqual({ before: { games: 8, high: 210 }, season: { games: 3, pins: 565 }, prevSeason: { games: 5, pins: 930 }, averageOverride: null });
    // e4: récord (240 > 210) y, sin 6 juegos en ninguna temporada, el promedio de entrada (160): +80.
    expect(entryMarks(e4, map.get(e4.id))?.[0]).toEqual({ record: true, over: 80 });
    expect(entryMarks(e4, undefined)).toBeNull();
  });

  it('sin temporadas leídas todo cuenta como una sola', () => {
    const e1 = entry('ev1', [180, 180]);
    const e2 = entry('ev2', [200]);
    const map = buildGameContexts([dated('2025-03-01', e1), dated('2026-03-01', e2)], [], 150);
    expect(map.get(e2.id)).toEqual({ before: { games: 2, high: 180 }, season: { games: 2, pins: 360 }, prevSeason: null, averageOverride: 150 });
  });
});
