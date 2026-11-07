import { describe, expect, it } from 'vitest';
import type { CalendarItem } from '../../lib/calendar';
import type { AgendaItem } from '../../lib/data/agenda';
import type { LeagueFeed } from '../../lib/data';
import type { League } from '../../lib/types';
import {
  agendaEmpty,
  agendaFilters,
  agendaHint,
  agendaHref,
  agendaReturn,
  joinedLabel,
  loginNext,
  myLeagueIds,
  showDayFilter,
} from './logic';
import { addDays, canRsvpRow, clampWeek, countLabel, dayCellLabel, dayHeading, dotKind, MAX_WEEKS, rowSubtitle, shortDate, weekEmptyText, weekRange, weekTitle, weekView } from './week';

// Datos ficticios.
const item = (over: Partial<AgendaItem> = {}): AgendaItem => ({
  eventId: 'ev1',
  leagueId: 'l1',
  leagueName: 'Liga de Ejemplo',
  sport: 'bowling',
  leagueKind: 'liga',
  type: 'practica',
  name: '',
  date: '2026-10-06',
  time: '19:00',
  timeLabel: '7:00 pm',
  venue: 'Bolera de Ejemplo',
  join: 'rsvp',
  cap: null,
  taken: 3,
  spotsLeft: null,
  waitlist: null,
  until: null,
  categories: null,
  mine: false,
  url: '/l/l1/e/ev1',
  ...over,
});

describe('agenda: la pantalla sin React', () => {
  const list = [
    item({ eventId: 'a', sport: 'padel', date: '2026-10-06' }),
    item({ eventId: 'b', sport: 'bowling', date: '2026-10-06' }),
    item({ eventId: 'c', sport: 'golf', date: '2026-10-08' }),
    item({ eventId: 'd', sport: 'bowling', date: '2026-10-09' }),
  ];

  it('los filtros de la dirección: deporte, días de ese deporte y el día', () => {
    const all = agendaFilters(list, null, null);
    expect(all.sport).toBeNull();
    expect(all.sports).toEqual(['bowling', 'padel', 'golf']);
    expect(all.days).toEqual(['2026-10-06', '2026-10-08', '2026-10-09']);
    expect(all.shown.map((i) => i.eventId)).toEqual(['a', 'b', 'c', 'd']);

    const bowling = agendaFilters(list, 'bowling', '2026-10-09');
    expect(bowling.days).toEqual(['2026-10-06', '2026-10-09']);
    expect(bowling.day).toBe('2026-10-09');
    expect(bowling.groups.map((g) => [g.date, g.items.map((i) => i.eventId)])).toEqual([['2026-10-09', ['d']]]);

    // Un día que ese deporte no tiene no filtra; un deporte que no existe tampoco.
    expect(agendaFilters(list, 'golf', '2026-10-06').day).toBeNull();
    expect(agendaFilters(list, 'nada', null).sport).toBeNull();
    // El deporte pedido sale en los chips aunque no tenga nada.
    expect(agendaFilters(list, 'tennis', null).sports).toEqual(['bowling', 'padel', 'golf', 'tennis']);
  });

  it('los textos: la línea de arriba, vacío, los chips por día y cómo quedó', () => {
    expect(agendaHint('mias')).toBe('Tus ligas, semana por semana');
    expect(agendaHint('abiertas')).toBe('Ligas públicas con lugar en los próximos días');
    expect(agendaEmpty(true).title).toBe('Nada con ese filtro');
    expect(agendaEmpty(false)).toEqual({ title: 'Nada abierto por ahora', text: 'Cuando una liga pública abra una fecha con lugar, sale aquí.' });
    expect(showDayFilter(3, false, null)).toBe(false);
    expect(showDayFilter(3, true, null)).toBe(true);
    expect(showDayFilter(3, false, '2026-10-06')).toBe(true);
    expect(showDayFilter(1, true, null)).toBe(false);
    expect(joinedLabel(item(), { kind: 'going' })).toBe('Vas');
    expect(joinedLabel(item({ join: 'signup' }), { kind: 'wait', position: 2 })).toBe('En espera');
    expect(joinedLabel(item({ join: 'golf' }), { kind: 'registered' })).toBe('Inscrito');
  });

  it('los links: con el deporte, y la vuelta después de entrar', () => {
    expect(agendaHref()).toBe('/agenda');
    expect(agendaHref('golf')).toBe('/agenda?deporte=golf');
    expect(agendaReturn('', 'ev1')).toBe('/agenda?apuntar=ev1');
    expect(agendaReturn('?deporte=padel', 'ev1')).toBe('/agenda?deporte=padel&apuntar=ev1');
    expect(loginNext('?deporte=padel', 'ev1')).toBe(`/login?next=${encodeURIComponent('/agenda?deporte=padel&apuntar=ev1')}`);
  });

  it('mis ligas: null mientras se leen la primera vez', () => {
    expect(myLeagueIds(true, [])).toBeNull();
    expect([...(myLeagueIds(false, [{ leagueId: 'l1' }, { leagueId: 'l2' }]) ?? [])]).toEqual(['l1', 'l2']);
    expect(myLeagueIds(true, [{ leagueId: 'l1' }])?.has('l1')).toBe(true);
  });
});

describe('la semana del Calendario', () => {
  const ev = (over: Partial<CalendarItem>): CalendarItem => ({
    key: 'k',
    kind: 'event',
    date: '2026-10-06',
    lid: 'l1',
    leagueName: 'Liga de Ejemplo',
    sport: 'bowling',
    type: 'practica',
    name: 'Práctica',
    time: '7:00 pm',
    minutes: 19 * 60,
    eventId: 'e1',
    playerId: 'p1',
    going: false,
    href: '/l/l1/e/e1',
    matchId: null,
    ...over,
  });

  it('fechas cortas, semanas, títulos y días', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(shortDate('2026-10-06')).toBe('6 oct');
    expect(clampWeek(-1)).toBe(0);
    expect(clampWeek(20)).toBe(MAX_WEEKS - 1);
    expect(weekTitle(0)).toBe('Esta semana');
    expect(weekTitle(2)).toBe('Próximas semanas');
    expect(weekRange('2026-10-05', 0)).toBe('5 oct – 11 oct');
    expect(weekRange('2026-10-12', 1)).toBe('La semana que viene');
    // 2026-10-06 es martes.
    expect(dayHeading('2026-10-06', '2026-10-06')).toBe('Hoy');
    expect(dayHeading('2026-10-07', '2026-10-06')).toBe('Mañana');
    expect(dayHeading('2026-10-09', '2026-10-06')).toBe('Viernes 9 oct');
    expect(weekEmptyText(0)).toBe('Nada más esta semana.');
    expect(weekEmptyText(1)).toBe('Nada esta semana.');
  });

  it('cuántas cosas tiene un día, el puntito, el «Voy» y la línea de abajo', () => {
    const match = ev({ kind: 'match', type: 'partido', detail: 'Cancha 2', eventId: null });
    expect(countLabel([ev({})])).toBe('1 evento');
    expect(countLabel([match, match])).toBe('2 partidos');
    expect(countLabel([ev({}), match])).toBe('2 cosas');
    expect(dayCellLabel('2026-10-06', 1, [ev({}), ev({})])).toBe('Martes 6 oct: 2 eventos');
    expect(dayCellLabel('2026-10-05', 0, [])).toBe('Lunes 5 oct');
    expect(dotKind(match)).toBe('match');
    expect(dotKind(ev({ type: 'torneo' }))).toBe('torneo');
    expect(dotKind(ev({}))).toBe('otro');
    expect(canRsvpRow(ev({}))).toBe(true);
    expect(canRsvpRow(ev({ eventId: null }))).toBe(false);
    expect(canRsvpRow(ev({ sport: 'padel' }))).toBe(false);
    expect(rowSubtitle(match)).toBe('Liga de Ejemplo · Cancha 2');
    expect(rowSubtitle(ev({}))).toBe('Liga de Ejemplo');
  });

  it('la semana: lunes a domingo, desde hoy, y el día elegido debajo', () => {
    const league = { id: 'l1', name: 'Liga de Ejemplo', sport: 'bowling', kind: 'liga', schedule: '', tz: 'America/Santo_Domingo' } as unknown as League;
    const event = (id: string, date: string) => ({ id, type: 'practica', name: '', date, startTime: null, games: 3 });
    const feed = { lid: 'l1', playerId: 'p1', isAdmin: false, isScorer: false, events: [event('e0', '2026-10-05'), event('e1', '2026-10-07'), event('e2', '2026-10-09')], rsvps: [], entries: [] } as unknown as LeagueFeed;
    const w = weekView([feed], [league], [], '2026-10-06', 0, null);
    expect(w.from).toBe('2026-10-05');
    expect(w.days).toHaveLength(7);
    // El lunes ya pasó: no sale.
    expect(w.items.map((i) => i.date)).toEqual(['2026-10-07', '2026-10-09']);
    expect(weekView([feed], [league], [], '2026-10-06', 0, '2026-10-09').byDay.map((g) => g.date)).toEqual(['2026-10-09']);
    expect(weekView([feed], [league], [], '2026-10-06', 1, null).from).toBe('2026-10-12');
  });
});
