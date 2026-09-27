import { describe, expect, it } from 'vitest';
import { upcomingCalendar, weekStart } from './calendar';
import type { LeagueFeed } from './data';
import type { BowlingEvent, League } from './types';

const feed = (lid: string, events: Partial<BowlingEvent>[], playerId: string | null = 'p1'): LeagueFeed => ({
  lid,
  uid: 'u1',
  playerId,
  isAdmin: false,
  isScorer: false,
  events: events as BowlingEvent[],
  mySubs: [],
  pending: [],
  reactions: [],
  comments: [],
  suggestions: [],
});
const league = (id: string, name: string, schedule: string, kind: League['kind'] = 'liga', season: Partial<League> = {}) =>
  ({ id, name, schedule, kind, seasonStart: '', seasonEnd: '', ...season }) as League;

describe('calendario de lo que viene', () => {
  it('las prácticas de cada martes aparecen aunque no estén creadas; las creadas, con su "voy"', () => {
    // 2026-09-29 y 2026-10-06 son martes.
    const items = upcomingCalendar(
      [feed('l1', [{ id: 'e1', type: 'practica', date: '2026-09-29', rsvp: { p1: true } }])],
      [league('l1', 'Liga Norte', 'Martes · 7:00 pm')],
      '2026-09-28',
      14,
    );
    expect(items.map((i) => [i.date, i.eventId, i.time, i.going])).toEqual([
      ['2026-09-29', 'e1', '7:00 pm', true],
      ['2026-10-06', null, '7:00 pm', false],
    ]);
  });

  it('torneos de todas tus ligas, por día y hora; un torneo sin liga no se repite', () => {
    const items = upcomingCalendar(
      [
        feed('l1', [{ id: 't1', type: 'torneo', name: 'Copa', date: '2026-10-03' }]),
        feed('l2', [{ id: 'c1', type: 'torneo', name: 'Relámpago', date: '2026-09-30' }]),
      ],
      [league('l1', 'Liga Norte', 'Martes y jueves · 7:30 pm'), league('l2', 'Relámpago', '', 'torneo')],
      '2026-09-28',
      7,
    );
    expect(items.map((i) => [i.date, i.name, i.leagueName, i.time])).toEqual([
      ['2026-09-29', 'Práctica', 'Liga Norte', '7:30 pm'],
      ['2026-09-30', 'Relámpago', 'Relámpago', null],
      ['2026-10-01', 'Práctica', 'Liga Norte', '7:30 pm'],
      ['2026-10-03', 'Copa', 'Liga Norte', null],
    ]);
  });

  it('solo dentro de la temporada', () => {
    const dates = (season: Partial<League>) =>
      upcomingCalendar([feed('l1', [])], [league('l1', 'Liga Norte', 'Martes · 7:00 pm', 'liga', season)], '2026-09-28', 21).map((i) => i.date);
    expect(dates({})).toEqual(['2026-09-29', '2026-10-06', '2026-10-13']);
    expect(dates({ seasonEnd: '2026-10-06' })).toEqual(['2026-09-29', '2026-10-06']);
    expect(dates({ seasonStart: '2026-10-01', seasonEnd: '2026-12-20' })).toEqual(['2026-10-06', '2026-10-13']);
  });

  it('un torneo el día de la práctica la reemplaza; una práctica movida de día reemplaza la de esa semana', () => {
    const items = upcomingCalendar(
      [
        feed('l1', [
          { id: 't1', type: 'torneo', name: 'Copa', date: '2026-09-29' },
          // El martes 6 era feriado: la práctica se movió al miércoles 7.
          { id: 'e2', type: 'practica', date: '2026-10-07' },
        ]),
      ],
      [league('l1', 'Liga Norte', 'Martes · 7:00 pm')],
      '2026-09-28',
      21,
    );
    expect(items.map((i) => [i.date, i.name, i.eventId])).toEqual([
      ['2026-09-29', 'Copa', 't1'],
      ['2026-10-07', 'Práctica', 'e2'],
      ['2026-10-13', 'Práctica', null],
    ]);
  });

  it('las semanas empiezan el lunes', () => {
    expect(weekStart('2026-10-01')).toBe('2026-09-28');
    expect(weekStart('2026-09-28')).toBe('2026-09-28');
    expect(weekStart('2026-10-04')).toBe('2026-09-28');
  });
});
