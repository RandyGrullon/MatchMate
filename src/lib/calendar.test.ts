import { describe, expect, it } from 'vitest';
import {
  dayLabel,
  isMatchSport,
  matchDetail,
  matchHref,
  matchTitle,
  myMatchesSince,
  nextMatch,
  startsInText,
  upcomingCalendar,
  weekStart,
  zonedParts,
  type CalendarMatch,
} from './calendar';
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

  it('otros deportes: sus eventos con su tipo y su hora, sin prácticas del horario ni «voy»', () => {
    const items = upcomingCalendar(
      [
        feed('padel', [
          { id: 'am', type: 'americano' as BowlingEvent['type'], name: '', date: '2026-09-30', startTime: '19:30:00', rsvp: { p1: true } },
          { id: 'cj', type: 'cajas' as BowlingEvent['type'], name: 'Cajas de octubre', date: '2026-10-01' },
        ]),
        feed('golf', [{ id: 'r1', type: 'ronda' as BowlingEvent['type'], name: '', date: '2026-10-03', startTime: '08:00:00' }]),
        feed('nado', [{ id: 'n1', type: 'encuentro' as BowlingEvent['type'], name: 'Copa Delfín', date: '2026-10-04' }]),
      ],
      [
        // El horario de la liga (lo pide el formulario en todos los deportes) no inventa prácticas.
        { ...league('padel', 'Pádel Club', 'Martes y jueves · 7:00 pm'), sport: 'padel' },
        { ...league('golf', 'Golf del Club', 'Sábado · 8:00 am'), sport: 'golf' },
        { ...league('nado', 'Natación', ''), sport: 'swimming' },
      ],
      '2026-09-28',
      7,
    );
    expect(items.map((i) => [i.date, i.name, i.type, i.sport, i.time, i.eventId, i.going])).toEqual([
      ['2026-09-30', 'Americano', 'americano', 'padel', '7:30 pm', 'am', false],
      ['2026-10-01', 'Cajas de octubre', 'cajas', 'padel', '7:00 pm', 'cj', false],
      ['2026-10-03', 'Ronda', 'ronda', 'golf', '8:00 am', 'r1', false],
      ['2026-10-04', 'Copa Delfín', 'encuentro', 'swimming', null, 'n1', false],
    ]);
    expect(items.some((i) => i.name === 'Práctica')).toBe(false);
  });

  it('las semanas empiezan el lunes', () => {
    expect(weekStart('2026-10-01')).toBe('2026-09-28');
    expect(weekStart('2026-09-28')).toBe('2026-09-28');
    expect(weekStart('2026-10-04')).toBe('2026-09-28');
  });
});

// ---------- Partidos (raqueta y equipos) ----------

const sportLeague = (id: string, name: string, sport: string, tz?: string) => ({ ...league(id, name, ''), sport, tz }) as League;
const match = (id: string, leagueId: string, scheduledAt: string | null, extra: Partial<CalendarMatch> = {}): CalendarMatch => ({
  id,
  leagueId,
  eventId: null,
  scheduledAt,
  status: 'scheduled',
  round: null,
  stage: '',
  court: '',
  sides: [
    { side: 1, label: 'Tigres' },
    { side: 2, label: 'Leones' },
  ],
  mySide: 1,
  ...extra,
});

describe('horas de los partidos en la zona de la liga', () => {
  it('la fecha y la hora salen en la hora de la liga, no en UTC', () => {
    // 00:30 UTC del 30 = 8:30 pm del 29 en Santo Domingo (UTC-4).
    expect(zonedParts('2026-09-30T00:30:00Z')).toEqual({ date: '2026-09-29', minutes: 20 * 60 + 30 });
    expect(zonedParts('2026-09-30T00:30:00Z', 'Europe/Madrid')).toEqual({ date: '2026-09-30', minutes: 2 * 60 + 30 });
    // Una zona que el teléfono no conoce: la de la base.
    expect(zonedParts('2026-09-30T00:30:00Z', 'Mars/Olympus')).toEqual({ date: '2026-09-29', minutes: 20 * 60 + 30 });
    expect(zonedParts(null)).toBeNull();
    expect(zonedParts('no es fecha')).toBeNull();
  });

  it('«mis partidos» se piden desde la medianoche de ayer (la misma clave todo el día)', () => {
    const a = myMatchesSince(new Date(2026, 8, 29, 8, 0));
    const b = myMatchesSince(new Date(2026, 8, 29, 23, 59));
    expect(a).toBe(b);
    expect(new Date(a).getTime()).toBe(new Date(2026, 8, 28).getTime());
  });
});

describe('textos y links de un partido', () => {
  it('raqueta y equipos tienen partidos; boliche, golf y natación no', () => {
    expect(['padel', 'tennis', 'pickleball', 'basketball', 'football', 'futsal'].every(isMatchSport)).toBe(true);
    expect(['bowling', 'golf', 'swimming', 'curling'].some(isMatchSport)).toBe(false);
  });

  it('en raqueta el partido de un evento se abre en su evento; lo demás en «Partidos»', () => {
    expect(matchHref('l1', { id: 'm1', eventId: 'e1' }, 'padel')).toBe('/l/l1/e/e1?partido=m1');
    expect(matchHref('l1', { id: 'm1', eventId: null }, 'tennis')).toBe('/l/l1/juegos?partido=m1');
    expect(matchHref('l1', { id: 'm1', eventId: 'e1' }, 'football')).toBe('/l/l1/juegos?partido=m1');
  });

  it('«vs. el rival» si juego; si no, los dos lados', () => {
    const m = match('m', 'l', null);
    expect(matchTitle(m, 1)).toBe('vs. Leones');
    expect(matchTitle(m, 2)).toBe('vs. Tigres');
    expect(matchTitle(m)).toBe('Tigres vs. Leones');
    expect(matchTitle({ sides: [{ side: 1, label: ' ' }] }, 2)).toBe('vs. Por definir');
  });

  it('jornada en equipos, ronda en raqueta; la fase manda y la cancha va al final', () => {
    expect(matchDetail({ round: 3, stage: '', court: 'Cancha 2' }, 'football')).toBe('Jornada 3 · Cancha 2');
    expect(matchDetail({ round: 3, stage: '', court: '' }, 'padel')).toBe('Ronda 3');
    expect(matchDetail({ round: 1, stage: 'Grupo A', court: 'Cancha 1' }, 'tennis')).toBe('Grupo A · Cancha 1');
    expect(matchDetail({ round: null, stage: '', court: '' }, 'basketball')).toBe('');
  });

  it('el día en palabras', () => {
    expect(dayLabel('2026-09-29', '2026-09-29')).toBe('Hoy');
    expect(dayLabel('2026-09-30', '2026-09-29')).toBe('Mañana');
    expect(dayLabel('2026-09-28', '2026-09-29')).toBe('Ayer');
    expect(dayLabel('2026-10-03', '2026-09-29')).toBe('Sábado');
    expect(dayLabel('2026-10-10', '2026-09-29')).toBe('Sábado 10 oct');
  });

  it('cuánto falta: minutos, horas o nada si es otro día', () => {
    expect(startsInText(-5)).toBe('Ya es la hora');
    expect(startsInText(0)).toBe('Ya es la hora');
    expect(startsInText(25)).toBe('En 25 min');
    expect(startsInText(150)).toBe('En 2 h');
    expect(startsInText(13 * 60)).toBeNull();
  });
});

describe('mis partidos en el calendario', () => {
  const leagues = [sportLeague('fut', 'Fútbol Norte', 'football'), sportLeague('pad', 'Pádel Club', 'padel'), league('bol', 'Liga Norte', 'Martes · 7:00 pm')];

  it('salen el día y a la hora de la liga, con el rival, dónde y el link; junto a los eventos', () => {
    const items = upcomingCalendar(
      [feed('fut', []), feed('pad', []), feed('bol', [])],
      leagues,
      '2026-09-28',
      7,
      [
        // Sábado 3 a las 10:00 am en Santo Domingo.
        match('m1', 'fut', '2026-10-03T14:00:00Z', { round: 3, court: 'Cancha 2' }),
        match('m2', 'pad', '2026-09-30T23:30:00Z', { eventId: 'liga', mySide: 2, stage: 'Grupo A' }),
      ],
    );
    expect(items.map((i) => [i.date, i.kind, i.name, i.time, i.leagueName, i.detail ?? '', i.href])).toEqual([
      ['2026-09-29', 'event', 'Práctica', '7:00 pm', 'Liga Norte', '', '/l/bol'],
      ['2026-09-30', 'match', 'vs. Tigres', '7:30 pm', 'Pádel Club', 'Grupo A', '/l/pad/e/liga?partido=m2'],
      ['2026-10-03', 'match', 'vs. Leones', '10:00 am', 'Fútbol Norte', 'Jornada 3 · Cancha 2', '/l/fut/juegos?partido=m1'],
    ]);
    expect(items[1]).toMatchObject({ matchId: 'm2', eventId: 'liga', type: 'partido', status: 'scheduled', sport: 'padel', going: false });
  });

  it('sin fecha, de otra semana, terminados, aplazados o de una liga que no es tuya no salen; repetidos, una vez', () => {
    const items = upcomingCalendar([feed('fut', [])], leagues, '2026-09-28', 7, [
      match('sin-fecha', 'fut', null),
      match('otra-semana', 'fut', '2026-10-06T14:00:00Z'),
      match('terminado', 'fut', '2026-09-29T14:00:00Z', { status: 'confirmed' }),
      match('aplazado', 'fut', '2026-09-29T14:00:00Z', { status: 'postponed' }),
      match('ajeno', 'otra', '2026-09-29T14:00:00Z'),
      match('vivo', 'fut', '2026-09-29T14:00:00Z', { status: 'live' }),
      match('vivo', 'fut', '2026-09-29T14:00:00Z', { status: 'live' }),
      match('suspendido', 'fut', '2026-09-30T14:00:00Z', { status: 'suspended' }),
    ]);
    expect(items.map((i) => [i.matchId, i.status])).toEqual([
      ['vivo', 'live'],
      ['suspendido', 'suspended'],
    ]);
  });

  it('en la zona de su liga: un partido a las 11 pm en Santo Domingo es de ese día, no del siguiente', () => {
    const items = upcomingCalendar([feed('fut', [])], leagues, '2026-09-28', 7, [match('tarde', 'fut', '2026-10-01T03:00:00Z')]);
    expect(items.map((i) => [i.date, i.time])).toEqual([['2026-09-30', '11:00 pm']]);
  });
});

describe('tu próximo partido', () => {
  const leagues = [sportLeague('fut', 'Fútbol Norte', 'football'), sportLeague('pad', 'Pádel Club', 'padel')];
  // Martes 29 a las 6:00 pm en Santo Domingo.
  const now = Date.parse('2026-09-29T22:00:00Z');

  it('el programado más cercano de todas tus ligas, con cuánto falta y cuántos más hay en 7 días', () => {
    const next = nextMatch(
      [
        match('lejos', 'fut', '2026-10-10T14:00:00Z'),
        match('hoy', 'pad', '2026-09-30T00:00:00Z', { round: 2, court: 'Cancha 1' }),
        match('sabado', 'fut', '2026-10-03T14:00:00Z'),
        match('vivo', 'fut', '2026-09-29T21:00:00Z', { status: 'live' }),
        match('sin-fecha', 'fut', null),
      ],
      leagues,
      now,
    );
    expect(next).toMatchObject({
      match: { id: 'hoy' },
      sport: 'padel',
      href: '/l/pad/juegos?partido=hoy',
      title: 'vs. Leones',
      detail: 'Ronda 2 · Cancha 1',
      date: '2026-09-29',
      dayLabel: 'Hoy',
      time: '8:00 pm',
      minutesLeft: 120,
      more: 1,
    });
    expect(nextMatch([match('sabado', 'fut', '2026-10-03T14:00:00Z')], leagues, now)?.dayLabel).toBe('Sábado');
  });

  it('uno que ya debió empezar sigue como próximo 2 horas; después no', () => {
    const late = [match('tarde', 'fut', '2026-09-29T20:30:00Z')];
    expect(nextMatch(late, leagues, now)?.minutesLeft).toBe(-90);
    expect(nextMatch(late, leagues, now + 31 * 60_000)).toBeNull();
  });

  it('sin partidos programados con fecha, o de ligas que no están, no hay próximo', () => {
    expect(nextMatch([], leagues, now)).toBeNull();
    expect(nextMatch([match('x', 'otra', '2026-09-30T00:00:00Z'), match('y', 'fut', '2026-09-30T00:00:00Z', { status: 'postponed' })], leagues, now)).toBeNull();
  });
});
