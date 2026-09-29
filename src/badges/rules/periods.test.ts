import { describe, expect, it } from 'vitest';
import {
  addMonths,
  daysBetween,
  firmAt,
  isoWeek,
  isPeriodKey,
  localDate,
  matchDate,
  monthDueOn,
  monthOf,
  monthRange,
  monthsBetween,
  periodKey,
  settledThrough,
  yearDueOn,
} from './periods';

describe('claves de periodo (§1.7.1)', () => {
  it('tienen el formato del check de la base', () => {
    const id = '0192f3c4-0000-7000-8000-000000000001';
    const keys = [
      periodKey.always,
      periodKey.event(id),
      periodKey.event(id, 'cat-a'),
      periodKey.match(id),
      periodKey.game(id, 2),
      periodKey.card(id),
      periodKey.race(id),
      periodKey.golfTournament(id),
      periodKey.month('2026-10'),
      periodKey.box(id, 3),
      periodKey.season(id),
      periodKey.season(id, 'B'),
      periodKey.year(2026),
      periodKey.league(id),
    ];
    for (const k of keys) expect(isPeriodKey(k), k).toBe(true);
    expect(periodKey.game(id, 2)).toBe(`g:${id}:2`);
    expect(periodKey.season(id, 'B')).toBe(`s:${id}:B`);
    expect(isPeriodKey('mes octubre')).toBe(false);
  });
});

describe('fechas locales', () => {
  it('un partido cae en la fecha de Santo Domingo (UTC−4)', () => {
    // 02:00 UTC del 10 = 22:00 del 9 en Santo Domingo.
    expect(localDate('2026-10-10T02:00:00Z')).toBe('2026-10-09');
    expect(matchDate({ scheduled_at: null, proposed_at: '2026-10-10T02:00:00Z', created_at: '2026-10-01T00:00:00Z' })).toBe('2026-10-09');
    expect(matchDate({ scheduled_at: null, proposed_at: null, created_at: '2026-10-01T12:00:00Z' })).toBe('2026-10-01');
    expect(matchDate({ scheduled_at: '2026-10-10T02:00:00Z', proposed_at: null, created_at: 'x' }, 'UTC')).toBe('2026-10-10');
  });

  it('meses, rangos y días', () => {
    expect(monthOf('2026-10-31')).toBe('2026-10');
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -2)).toBe('2025-11');
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(monthsBetween('2026-11', '2026-10')).toEqual([]);
    expect(monthRange('2028-02')).toEqual(['2028-02-01', '2028-02-29']);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('semana ISO (el jueves decide el año)', () => {
    expect(isoWeek('2026-01-01')).toBe('2026-W01');
    expect(isoWeek('2021-01-03')).toBe('2020-W53');
    expect(isoWeek('2026-09-28')).toBe('2026-W40');
    expect(isoWeek('2026-10-04')).toBe('2026-W40');
    expect(isoWeek('2026-10-05')).toBe('2026-W41');
    expect(isoWeek('2024-12-30')).toBe('2025-W01');
  });

  it('asentado a las 48 h, firme a los 7 días y cuándo se evalúa cada periodo', () => {
    expect(settledThrough('2026-10-10T15:00:00Z')).toBe('2026-10-08');
    expect(firmAt('2026-10-10T15:00:00.000Z')).toBe('2026-10-17T15:00:00.000Z');
    expect(monthDueOn('2026-12')).toBe('2027-01-03');
    expect(yearDueOn(2026)).toBe('2027-01-07');
  });
});
