import { describe, expect, it } from 'vitest';
import type { CalendarItem, NextMatchInfo } from '../../lib/calendar';
import { greeting, groupBySport, leaguesCountLabel, nextByLeague, nextEventItem, normalize, pickNextUp, searchLeagues, todayLabel, whenLabel } from './logic';

const item = (p: Partial<CalendarItem>): CalendarItem => ({
  key: p.key ?? `${p.lid}:${p.date}:${p.minutes}`,
  kind: 'event',
  date: '2026-09-28',
  lid: 'a',
  leagueName: 'Liga A',
  sport: 'bowling',
  type: 'practica',
  name: 'Práctica',
  time: null,
  minutes: null,
  eventId: 'e1',
  playerId: null,
  going: false,
  href: '/l/a/e/e1',
  matchId: null,
  ...p,
});

describe('Home: saludo y fecha', () => {
  it('saluda según la hora', () => {
    expect(greeting(new Date(2026, 8, 28, 7))).toBe('Buenos días');
    expect(greeting(new Date(2026, 8, 28, 13))).toBe('Buenas tardes');
    expect(greeting(new Date(2026, 8, 28, 21))).toBe('Buenas noches');
    expect(greeting(new Date(2026, 8, 28, 2))).toBe('Buenas noches');
  });

  it('dice el día en palabras', () => {
    expect(todayLabel(new Date(2026, 8, 28))).toBe('Lunes 28 de septiembre');
  });
});

describe('Home: lo próximo', () => {
  const today = '2026-09-28';
  const items = [
    item({ lid: 'a', date: today, minutes: 8 * 60, time: '8:00 am' }),
    item({ lid: 'b', date: today, minutes: 19 * 60, time: '7:00 pm', kind: 'match', type: 'partido' }),
    item({ lid: 'a', date: '2026-09-29', minutes: 19 * 60, time: '7:00 pm' }),
    item({ lid: 'c', date: '2026-09-30', minutes: null }),
  ];

  it('el próximo evento salta lo que ya pasó y los partidos', () => {
    // Son las 10: lo de las 8 ya pasó.
    expect(nextEventItem(items, today, 10 * 60)?.date).toBe('2026-09-29');
    // Recién empezó (hace 20 min): sigue como próximo.
    expect(nextEventItem(items, today, 8 * 60 + 20)?.minutes).toBe(8 * 60);
    expect(nextEventItem([], today, 0)).toBeNull();
  });

  it('lo próximo de cada liga', () => {
    const map = nextByLeague(items, today, 10 * 60);
    expect(map.get('a')?.date).toBe('2026-09-29');
    expect(map.get('b')?.kind).toBe('match');
    expect(map.get('c')?.date).toBe('2026-09-30');
  });

  it('cuándo', () => {
    expect(whenLabel({ date: today, time: '7:00 pm' }, today)).toBe('Hoy · 7:00 pm');
    expect(whenLabel({ date: '2026-09-29', time: null }, today)).toBe('Mañana');
  });

  it('va primero lo que empieza antes (partido o evento)', () => {
    const now = new Date(2026, 8, 28, 10).getTime();
    const match = { minutesLeft: 120 } as NextMatchInfo;
    const soon = item({ date: today, minutes: 11 * 60 });
    const later = item({ date: today, minutes: 13 * 60 });
    expect(pickNextUp(match, soon, now)?.kind).toBe('event');
    expect(pickNextUp(match, later, now)?.kind).toBe('match');
    expect(pickNextUp(null, later, now)?.kind).toBe('event');
    expect(pickNextUp(match, null, now)?.kind).toBe('match');
    expect(pickNextUp(null, null, now)).toBeNull();
  });
});

describe('Eventos: buscar y agrupar', () => {
  const leagues = [
    { id: '1', name: 'Pádel Los Prados', venue: 'Club Naco', sport: 'padel', kind: 'liga' },
    { id: '2', name: 'Liga de los martes', venue: 'Bolera Sunset', sport: null, kind: 'liga' },
    { id: '3', name: 'Copa Verano', venue: '', sport: 'padel', kind: 'torneo' },
  ];

  it('busca sin tildes ni mayúsculas, por nombre o lugar', () => {
    expect(normalize('  PÁDEL ')).toBe('padel');
    expect(searchLeagues(leagues, 'padel').map((l) => l.id)).toEqual(['1']);
    expect(searchLeagues(leagues, 'naco prados').map((l) => l.id)).toEqual(['1']);
    expect(searchLeagues(leagues, 'sunset').map((l) => l.id)).toEqual(['2']);
    expect(searchLeagues(leagues, '')).toHaveLength(3);
    expect(searchLeagues(leagues, 'golf')).toEqual([]);
  });

  it('agrupa por deporte en el orden del registro', () => {
    const groups = groupBySport(leagues);
    expect(groups.map((g) => g.sport)).toEqual(['bowling', 'padel']);
    expect(groups[1].leagues.map((l) => l.id)).toEqual(['1', '3']);
  });

  it('cuenta ligas y torneos', () => {
    expect(leaguesCountLabel(leagues)).toBe('2 ligas y 1 torneo');
    expect(leaguesCountLabel([{ kind: 'torneo' }])).toBe('1 torneo');
    expect(leaguesCountLabel([])).toBe('Sin ligas');
  });
});
