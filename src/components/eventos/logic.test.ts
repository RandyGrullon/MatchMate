import { describe, expect, it } from 'vitest';
import type { CalendarItem } from '../../lib/calendar';
import {
  ALL_SPORTS,
  eventosSubtitle,
  filterSports,
  groupByDay,
  joinable,
  leagueLine,
  ligasSport,
  noLeaguesTitle,
  openLeaguesSubtitle,
  otherSportsText,
  publicEmptyText,
  rowLineText,
  splitMine,
  tourneyLine,
  tourneysOf,
} from './logic';

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

  it('sin deporte: todas las que no son mías, en el orden del listado (las más activas primero)', () => {
    expect(joinable(pub, isMine, null).map((l) => l.id)).toEqual(['p1', 'b1', 'p2']);
  });

  it('con deporte: solo las de ese deporte (sin deporte guardado = boliche)', () => {
    expect(joinable(pub, isMine, 'padel').map((l) => l.id)).toEqual(['p1', 'p2']);
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
    expect(publicEmptyText({ sport: null, inSportTotal: 0 })).toBe('Todavía no hay ligas ni torneos públicos. Crea el primero con «Crear o unirme».');
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

describe('Ligas: la línea de cada fila', () => {
  const TODAY = '2026-10-07';

  it('una liga en juego: «En juego hoy» en el color del deporte y cuántos jugadores', () => {
    const l = leagueLine({ live: true, next: { date: TODAY, time: '7:30 pm' }, today: TODAY, people: 6, sport: 'bowling' });
    expect(l).toEqual({ lead: 'En juego hoy', rest: '6 jugadores' });
    expect(rowLineText(l)).toBe('En juego hoy · 6 jugadores');
  });

  it('juega hoy más tarde, mañana, otro día o sin nada en el calendario', () => {
    expect(leagueLine({ live: false, next: { date: TODAY, time: '7:30 pm' }, today: TODAY, people: 1 })).toEqual({ lead: 'Hoy, 7:30 pm', rest: '1 jugador' });
    expect(leagueLine({ live: false, next: { date: '2026-10-08', time: '8:00 pm' }, today: TODAY, people: 0 })).toEqual({ lead: null, rest: 'Mañana, 8:00 pm' });
    expect(leagueLine({ live: false, next: { date: '2026-10-20', time: null }, today: TODAY }).rest).toBe('Martes 20 oct');
    expect(leagueLine({ live: false, next: null, today: TODAY, schedule: 'Martes · 7:30 pm', people: 12, sport: 'swimming' }).rest).toBe('Martes · 7:30 pm · 12 nadadores');
    expect(leagueLine({ live: false, today: TODAY, people: 3, extra: ['Dueño'] }).rest).toBe('3 jugadores · Dueño');
  });

  it('«Tus torneos»: los sin liga y los torneos que vienen en mis ligas, lo más pronto primero', () => {
    const leagues = [
      { id: 'liga', name: 'Liga de los martes' },
      { id: 'suelto', name: 'Copa Naco', kind: 'torneo' },
      { id: 'viejo', name: 'Abierto 2025', kind: 'torneo' },
    ];
    const upcoming = [
      item({ lid: 'liga', leagueName: 'Liga de los martes', type: 'practica', date: TODAY, eventId: 'p1' }),
      item({ lid: 'liga', leagueName: 'Liga de los martes', type: 'torneo', name: 'Copa de octubre', date: '2026-10-24', eventId: 'c1', href: '/l/liga/e/c1', going: true }),
      item({ lid: 'suelto', leagueName: 'Copa Naco', type: 'torneo', name: 'Copa Naco', date: '2026-10-10', eventId: 'n1', href: '/l/suelto/e/n1' }),
      item({ lid: 'otra', leagueName: 'No es mía', type: 'torneo', date: '2026-10-11', eventId: 'x1' }),
    ];
    const t = tourneysOf(leagues, upcoming, TODAY);
    expect(t.map((x) => [x.name, x.standalone, x.date, x.href])).toEqual([
      ['Copa Naco', true, '2026-10-10', '/l/suelto/e/n1'],
      ['Copa de octubre', false, '2026-10-24', '/l/liga/e/c1'],
      ['Abierto 2025', true, null, '/l/viejo'],
    ]);
    expect(t[1].going).toBe(true);
  });

  it('la línea de un torneo: su día y cuántos inscritos (y de qué liga si tienes varias)', () => {
    const copa = { date: '2026-10-24', time: null, going: true, leagueName: 'Liga de los martes', standalone: false };
    expect(rowLineText(tourneyLine(copa, { today: TODAY, live: false, entrants: 6 }))).toBe('Sábado 24 oct · 6 inscritos');
    expect(rowLineText(tourneyLine(copa, { today: TODAY, live: false, entrants: 1, showLeague: true }))).toBe('Sábado 24 oct · 1 inscrito · Liga de los martes');
    expect(rowLineText(tourneyLine(copa, { today: TODAY, live: false, entrants: 6, pro: true }))).toBe('Sábado 24 oct · 6 inscritos · ya te inscribiste');
    expect(tourneyLine({ ...copa, date: TODAY }, { today: TODAY, live: true })).toEqual({ lead: 'En juego hoy', rest: '' });
    expect(tourneyLine({ ...copa, date: TODAY, time: '9:00 am' }, { today: TODAY, live: false }).lead).toBe('Hoy, 9:00 am');
    expect(tourneyLine({ ...copa, date: '2026-10-01' }, { today: TODAY, live: false }).rest).toBe('Ya se jugó');
    expect(tourneyLine({ ...copa, date: null }, { today: TODAY, live: false }).rest).toBe('');
  });

  it('el filtro de deporte: solo si juegas más de uno, y solo lo elegido en los chips (sin elegir, Todos)', () => {
    expect(ligasSport(['bowling'], 'padel')).toBeNull();
    expect(ligasSport(['bowling', 'padel'], 'padel')).toBe('padel');
    // Sin elegir: Todos, aunque la app haya quedado en pádel al ver esa liga.
    expect(ligasSport(['bowling', 'padel'], null)).toBeNull();
    expect(ligasSport(['bowling', 'padel'], ALL_SPORTS)).toBeNull();
    expect(ligasSport(['bowling', 'padel'], 'tennis')).toBeNull();
  });

  it('«Buscar ligas abiertas»: tu deporte y los otros', () => {
    expect(openLeaguesSubtitle(['bowling'])).toBe('Boliche y otros deportes');
    expect(openLeaguesSubtitle(['bowling', 'padel'])).toBe('De todos los deportes');
    expect(openLeaguesSubtitle([])).toBe('De todos los deportes');
  });
});
