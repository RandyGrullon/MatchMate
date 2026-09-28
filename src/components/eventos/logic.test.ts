import { describe, expect, it } from 'vitest';
import type { CalendarItem } from '../../lib/calendar';
import { eventosSubtitle, filterSports, groupByDay, joinable, noLeaguesTitle, otherSportsText, publicEmptyText, splitMine } from './logic';

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

const L = (id: string, name: string, extra: { kind?: string; sport?: string } = {}) => ({ id, name, ...extra });

describe('splitMine', () => {
  it('separa ligas y torneos, lo más pronto primero y después por nombre', () => {
    const leagues = [L('z', 'Zeta'), L('b', 'Beta'), L('t', 'Copa', { kind: 'torneo' }), L('a', 'Alfa'), L('c', 'Casa')];
    const nextOf = new Map([
      ['c', item({ lid: 'c', date: '2026-09-30', minutes: 600 })],
      ['z', item({ lid: 'z', date: '2026-09-29', minutes: 1140 })],
    ]);
    const { ligas, torneos } = splitMine(leagues, nextOf);
    expect(ligas.map((l) => l.id)).toEqual(['z', 'c', 'a', 'b']);
    expect(torneos.map((l) => l.id)).toEqual(['t']);
  });

  it('el mismo día va primero la hora más temprana', () => {
    const nextOf = new Map([
      ['a', item({ lid: 'a', date: '2026-09-29', minutes: 1200 })],
      ['b', item({ lid: 'b', date: '2026-09-29', minutes: 480 })],
    ]);
    expect(splitMine([L('a', 'A'), L('b', 'B')], nextOf).ligas.map((l) => l.id)).toEqual(['b', 'a']);
  });
});

describe('joinable', () => {
  const pub = [L('p1', 'Pádel Norte', { sport: 'padel' }), L('b1', 'Boliche Sur'), L('p2', 'Américano', { sport: 'padel' }), L('m', 'Mía', { sport: 'padel' })];
  const isMine = (id: string) => id === 'm';

  it('sin deporte: todas las que no son mías, por nombre', () => {
    expect(joinable(pub, isMine, null).map((l) => l.id)).toEqual(['p2', 'b1', 'p1']);
  });

  it('con deporte: solo las de ese deporte (sin deporte guardado = boliche)', () => {
    expect(joinable(pub, isMine, 'padel').map((l) => l.id)).toEqual(['p2', 'p1']);
    expect(joinable(pub, isMine, 'bowling').map((l) => l.id)).toEqual(['b1']);
  });
});

describe('filterSports', () => {
  it('junta los deportes de mis ligas y las públicas en el orden del registro', () => {
    expect(filterSports([L('a', 'A', { sport: 'padel' })], [L('b', 'B'), L('c', 'C', { sport: 'padel' })])).toEqual(['bowling', 'padel']);
    expect(filterSports([], [])).toEqual([]);
  });
});

describe('groupByDay', () => {
  const items = [
    item({ key: '1', date: '2026-09-28', minutes: 1140, time: '7:00 pm' }),
    item({ key: '2', date: '2026-09-28', minutes: 1200, time: '8:00 pm' }),
    item({ key: '3', date: '2026-09-29' }),
    item({ key: '4', date: '2026-10-11' }),
  ];

  it('agrupa por día con «Hoy», «Mañana» y la fecha', () => {
    const g = groupByDay(items, '2026-09-28');
    expect(g.map((d) => [d.label, d.items.map((i) => i.key)])).toEqual([
      ['Hoy', ['1', '2']],
      ['Mañana', ['3']],
      ['Domingo 11 oct', ['4']],
    ]);
  });

  it('con límite cuenta cosas, no días', () => {
    const g = groupByDay(items, '2026-09-28', 3);
    expect(g.map((d) => d.items.length)).toEqual([2, 1]);
  });
});

describe('textos', () => {
  it('públicas sin ninguna', () => {
    expect(publicEmptyText({ sport: 'padel', inSportTotal: 2 })).toBe('Ya estás en todas las públicas de pádel.');
    expect(publicEmptyText({ sport: null, inSportTotal: 0 })).toMatch(/^Todavía no hay ligas ni torneos públicos\. Crea/);
  });

  it('vacío de mis ligas y de otros deportes', () => {
    expect(noLeaguesTitle('tennis')).toBe('Todavía no estás en ninguna liga de tenis');
    expect(noLeaguesTitle(null)).toBe('Todavía no estás en ninguna liga');
    expect(otherSportsText(0)).toBeNull();
    expect(otherSportsText(1)).toBe('Tienes 1 liga o torneo en otros deportes.');
    expect(otherSportsText(3)).toBe('Tienes 3 ligas y torneos en otros deportes.');
  });

  it('subtítulo', () => {
    expect(eventosSubtitle('padel')).toBe('Solo lo de pádel: tus ligas, tus torneos y lo que viene.');
    expect(eventosSubtitle(null)).toMatch(/todos los deportes/);
  });
});
