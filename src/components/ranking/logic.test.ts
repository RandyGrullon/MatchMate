/**
 * La Tabla sin React: tu lugar («Vas 2.º de 6, con 195 · Pedro te lleva 24 pinos»), la tabla de Pro ordenada por
 * columna con o sin handicap, los récords, el handicap de la liga y las fechas cortas de la temporada.
 */
import { describe, expect, it } from 'vitest';
import type { RankingRow } from '../../lib/bowlingSeason';
import {
  DEFAULT_HCP,
  cellText,
  eligibleFor,
  firstName,
  hcpFormula,
  leagueHcp,
  metricOf,
  myPlace,
  placeCopy,
  playedEvents,
  seasonRangeLabel,
  seasonRecords,
  shortNames,
  sortOf,
  standingsTable,
  withSnapshot,
} from './logic';

const row = (playerId: string, name: string, average: number, games: number, high: number, series: number, events: number): RankingRow => ({
  playerId,
  name,
  average,
  games,
  pins: average * games,
  high,
  series,
  events,
});

/** La liga de los mockups (5-ranking.png y p5-ranking.png). */
const rows: RankingRow[] = [
  row('ana', 'Ana Pérez', 195, 8, 214, 594, 3),
  row('pedro', 'Pedro Gómez', 219, 9, 245, 658, 3),
  row('luis', 'Luis Martínez', 194, 9, 224, 605, 3),
  row('sofia', 'Sofía Rodríguez', 173, 7, 199, 548, 3),
  row('carmen', 'Carmen Díaz', 159, 8, 181, 503, 3),
  row('jose', 'José Ramírez', 150, 7, 172, 468, 2),
];

describe('métrica y columna de la dirección', () => {
  it('Lite: las 4 métricas; lo de Pro (hcp, juegos, nombre) o nada, Promedio', () => {
    expect(metricOf('juego')).toBe('juego');
    expect(metricOf('asistencia')).toBe('asistencia');
    expect(metricOf('hcp')).toBe('promedio');
    expect(metricOf(null)).toBe('promedio');
  });

  it('Pro: cualquier columna; lo que no es, Promedio', () => {
    expect(sortOf('hcp')).toBe('hcp');
    expect(sortOf('nombre')).toBe('nombre');
    expect(sortOf('serie')).toBe('serie');
    expect(sortOf('otra')).toBe('promedio');
  });

  it('por promedio salen los que tienen el mínimo; por lo demás, los que tienen algo', () => {
    const few = [...rows, row('nuevo', 'Nuevo Jugador', 230, 3, 250, 0, 1)];
    expect(eligibleFor(few, 'promedio').map((r) => r.playerId)).not.toContain('nuevo');
    expect(eligibleFor(few, 'juego').map((r) => r.playerId)).toContain('nuevo');
    expect(eligibleFor(few, 'serie').map((r) => r.playerId)).not.toContain('nuevo');
  });
});

describe('tu lugar (la tarjeta de Lite)', () => {
  it('«Vas 2.º de 6, con 195» · «Pedro te lleva 24 pinos», y la barra contra el 1.º', () => {
    const p = myPlace(rows, 'ana', 'promedio');
    expect(p).toMatchObject({ kind: 'ranked', pos: 2, of: 6, value: 195, gap: 24, other: { name: 'Pedro Gómez', pos: 1, value: 219 } });
    const c = placeCopy(p!, 'promedio');
    expect(c.big).toBe('2.º');
    expect(c.title).toBe('Vas 2.º de 6, con 195');
    expect(c.subtitle).toBe('Pedro te lleva 24 pinos');
    expect(c.left).toBe('Tú · 195');
    expect(c.right).toBe('1.º · Pedro 219');
    expect(c.bar).toBeCloseTo(195 / 219);
  });

  it('primero: le llevas al que sigue, con la barra llena; empatado, «Empatas con»', () => {
    const c = placeCopy(myPlace(rows, 'pedro', 'promedio')!, 'promedio');
    expect(c.title).toBe('Vas 1.º de 6, con 219');
    expect(c.subtitle).toBe('Le llevas 24 pinos a Ana');
    expect(c.bar).toBe(1);
    expect(c.right).toBe('2.º · Ana 195');
    const tied = [...rows.filter((r) => r.playerId !== 'luis'), row('luis', 'Luis Martínez', 219, 9, 224, 605, 3)];
    expect(placeCopy(myPlace(tied, 'luis', 'promedio')!, 'promedio').subtitle).toMatch(/^Empatas con (Pedro|Ana)$/);
  });

  it('solo en la tabla: nadie más todavía', () => {
    const c = placeCopy(myPlace([rows[0]], 'ana', 'promedio')!, 'promedio');
    expect(c.subtitle).toBe('Nadie más en la tabla todavía');
    expect(c.right).toBeNull();
  });

  it('asistencia en fechas («con 3 fechas», «te lleva 1 fecha»); temporada cerrada, en pasado', () => {
    const c = placeCopy(myPlace(rows, 'jose', 'asistencia')!, 'asistencia');
    expect(c.title).toBe('Vas 6.º de 6, con 2 fechas');
    expect(c.subtitle).toBe('Ana te lleva 1 fecha');
    const done = placeCopy(myPlace(rows, 'ana', 'promedio', { closed: true })!, 'promedio', true);
    expect(done.title).toBe('Quedaste 2.º de 6, con 195');
    expect(done.subtitle).toBe('Pedro quedó 24 pinos arriba');
  });

  it('sin el mínimo: cuántos juegos te faltan y dónde irías («4/6»)', () => {
    const mine = [...rows, row('yo', 'Yo Mismo', 180, 4, 200, 540, 2)];
    const p = myPlace(mine, 'yo', 'promedio');
    expect(p).toMatchObject({ kind: 'missing', games: 4, min: 6, missing: 2, pos: 4, average: 180 });
    const c = placeCopy(p!, 'promedio');
    expect(c.big).toBe('4/6');
    expect(c.title).toBe('Te faltan 2 juegos para salir');
    expect(c.subtitle).toBe('Con 180 de promedio irías 4.º');
    expect(c.bar).toBeCloseTo(4 / 6);
    expect([c.left, c.right]).toEqual(['Tú · 4 juegos', '6 para salir']);
    // Sin juegos todavía.
    const none = placeCopy(myPlace(rows, 'otro', 'promedio')!, 'promedio');
    expect(none.title).toBe('Te faltan 6 juegos para salir');
    expect(none.subtitle).toBe('Cuentan los juegos aprobados de la temporada');
  });

  it('nada si no juegas aquí, si la temporada cerró sin que entraras o en otra métrica sin juegos', () => {
    expect(myPlace(rows, null, 'promedio')).toBeNull();
    expect(myPlace(rows, 'otro', 'promedio', { closed: true })).toBeNull();
    expect(myPlace(rows, 'otro', 'juego')).toBeNull();
  });
});

describe('la tabla de Pro', () => {
  it('nombres cortos «Pedro G.»; si dos quedarían igual, el entero', () => {
    const m = shortNames(['Pedro Gómez', 'Ana Pérez', 'Ana Paredes', 'Luis']);
    expect(m.get('Pedro Gómez')).toBe('Pedro G.');
    expect(m.get('Ana Pérez')).toBe('Ana Pérez');
    expect(m.get('Luis')).toBe('Luis');
    expect(firstName('  Sofía Rodríguez ')).toBe('Sofía');
  });

  it('por promedio, con el handicap de cada uno (80 % de 230) como en el mockup', () => {
    const t = standingsTable(rows, { sort: 'promedio', withHcp: false, hcp: DEFAULT_HCP });
    expect(t.map((r) => [r.pos, r.short, r.games, r.average, r.hcp, r.high, r.series])).toEqual([
      [1, 'Pedro G.', 9, 219, 8, 245, 658],
      [2, 'Ana P.', 8, 195, 28, 214, 594],
      [3, 'Luis M.', 9, 194, 28, 224, 605],
      [4, 'Sofía R.', 7, 173, 45, 199, 548],
      [5, 'Carmen D.', 8, 159, 56, 181, 503],
      [6, 'José R.', 7, 150, 64, 172, 468],
    ]);
  });

  it('con hcp: suma al promedio y al juego alto, y 3 veces a la serie; ordena por lo que queda', () => {
    const t = standingsTable(rows, { sort: 'promedio', withHcp: true, hcp: DEFAULT_HCP });
    expect(t[0]).toMatchObject({ short: 'Pedro G.', average: 227, high: 253, series: 682 });
    expect(t.find((r) => r.row.playerId === 'jose')).toMatchObject({ average: 214, high: 236, series: 660 });
    expect(t.map((r) => r.row.playerId)).toEqual(['pedro', 'ana', 'luis', 'sofia', 'carmen', 'jose']);
  });

  it('cada columna ordena (empates comparten puesto); por nombre, de la A a la Z con el puesto por promedio', () => {
    const few = [...rows, row('nuevo', 'Nuevo Jugador', 230, 3, 250, 0, 1)];
    const high = standingsTable(few, { sort: 'juego', withHcp: false, hcp: DEFAULT_HCP });
    expect(high[0].row.playerId).toBe('nuevo');
    expect(standingsTable(few, { sort: 'promedio', withHcp: false, hcp: DEFAULT_HCP }).map((r) => r.row.playerId)).not.toContain('nuevo');
    const att = standingsTable(rows, { sort: 'asistencia', withHcp: false, hcp: DEFAULT_HCP });
    expect(att.slice(0, 5).every((r) => r.pos === 1)).toBe(true);
    expect(att[5]).toMatchObject({ pos: 6, events: 2 });
    const hcp = standingsTable(rows, { sort: 'hcp', withHcp: false, hcp: DEFAULT_HCP });
    expect(hcp[0].row.playerId).toBe('jose');
    const byName = standingsTable(rows, { sort: 'nombre', withHcp: false, hcp: DEFAULT_HCP });
    expect(byName.map((r) => r.short)).toEqual(['Ana P.', 'Carmen D.', 'José R.', 'Luis M.', 'Pedro G.', 'Sofía R.']);
    expect(byName.find((r) => r.row.playerId === 'pedro')?.pos).toBe(1);
  });

  it('las celdas: «–» sin juego alto o serie y la asistencia «3/3»', () => {
    const [t] = standingsTable([row('x', 'Xavi Soto', 180, 2, 0, 0, 1)], { sort: 'juegos', withHcp: false, hcp: DEFAULT_HCP });
    expect(cellText(t, 'juego', 3)).toBe('–');
    expect(cellText(t, 'serie', 3)).toBe('–');
    expect(cellText(t, 'asistencia', 3)).toBe('1/3');
    expect(cellText(t, 'juegos', 3)).toBe(2);
  });

  it('el handicap de la liga: el último torneo con handicap de la temporada, el de la liga o 80 % de 230', () => {
    const ev = (id: string, date: string, type: 'practica' | 'torneo', hcpBase: number, hcpPercent: number) => ({ id, date, type, hcpBase, hcpPercent });
    const events = [ev('a', '2026-03-01', 'torneo', 220, 90), ev('b', '2026-10-01', 'torneo', 210, 85), ev('c', '2026-10-08', 'practica', 0, 0)];
    expect(leagueHcp(events, new Set(['a', 'c']))).toEqual({ base: 220, percent: 90 });
    expect(leagueHcp(events, new Set(['c']))).toEqual({ base: 210, percent: 85 });
    expect(leagueHcp([ev('c', '2026-10-08', 'practica', 0, 0)])).toEqual(DEFAULT_HCP);
    expect(hcpFormula(DEFAULT_HCP)).toBe('Hcp = 80% de (230 − prom.) · mín. 6 juegos');
  });

  it('fechas jugadas: las que tienen algún juego aprobado (con foto)', () => {
    expect(
      playedEvents([
        { eventId: 'e1', scores: [190, null], photos: ['foto', null] },
        { eventId: 'e1', scores: [200], photos: ['foto'] },
        { eventId: 'e2', scores: [180], photos: [null] },
        { eventId: 'e3', scores: [175], photos: ['NO_PHOTO'] },
      ]),
    ).toBe(2);
  });
});

describe('récords de la temporada', () => {
  it('mejor juego y mejor serie con quién; la asistencia «3/3» con «Ana y 4 más» (tú primero)', () => {
    const r = seasonRecords(rows, 3, 'ana');
    expect(r.game).toEqual({ value: '245', who: 'Pedro G.' });
    expect(r.series).toEqual({ value: '658', who: 'Pedro G.' });
    expect(r.attendance).toEqual({ value: '3/3', who: 'Ana y 4 más' });
    expect(seasonRecords(rows.slice(0, 2), 3, null).attendance?.who).toBe('Ana y Pedro');
    expect(seasonRecords([], 0)).toEqual({ game: null, series: null, attendance: null });
  });
});

describe('temporada cerrada con su tabla guardada', () => {
  it('promedio, juegos y juego alto de la guardada; serie y asistencia de los juegos', () => {
    const snap = { rows: [row('ana', 'Ana Pérez', 199, 10, 230, 0, 0)], covers: ['promedio', 'juego'] };
    expect(withSnapshot(rows, snap)).toEqual([{ ...row('ana', 'Ana Pérez', 199, 10, 230, 594, 3), pins: rows[0].pins }]);
    expect(withSnapshot(rows, null)).toEqual(rows);
    expect(withSnapshot(rows, { rows: snap.rows, covers: ['juego'] })).toEqual(rows);
  });
});

describe('fechas de la temporada', () => {
  it('cortas: «1 sep – 15 dic»; con el año si cruza; sin fin, «desde el»', () => {
    expect(seasonRangeLabel({ startsOn: '2026-09-01', endsOn: '2026-12-15', status: 'active' })).toBe('1 sep – 15 dic');
    expect(seasonRangeLabel({ startsOn: '2025-09-01', endsOn: '2026-01-20', status: 'closed' })).toBe('1 sep 2025 – 20 ene 2026');
    expect(seasonRangeLabel({ startsOn: '2026-01-10', endsOn: null, status: 'active' })).toBe('desde el 10 ene');
  });
});
