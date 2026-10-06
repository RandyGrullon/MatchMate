/**
 * Home › Próximos, «En juego ahora» y «Tu próximo partido» con ligas de varios deportes: los eventos de pádel, golf
 * o natación salen con su tipo (no como «Práctica»), sin «Voy» y sin prácticas inventadas por el horario; tus
 * partidos salen en el calendario; «En juego ahora» tiene el boliche de hoy (anotar tus juegos) y los partidos en
 * vivo de raqueta y equipos. Se dibujan sin navegador (renderToString) con avisos de mentira.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { nextMatch } from '../lib/calendar';
import type { LeagueFeed } from '../lib/data';
import type { Match } from '../lib/data/matches';
import { toIsoDate } from '../lib/format';
import { WEEKDAYS } from '../lib/schedule';
import type { BowlingEvent, League } from '../lib/types';
import { FeedbackProvider } from './feedback';
import { LiveNow } from './LiveNow';
import { NextMatchCard } from './LiveNowMatches';
import { RsvpChip, WeekCalendar } from './WeekCalendar';

const state = vi.hoisted(() => ({ feeds: [] as LeagueFeed[], leagues: [] as League[] }));
vi.mock('./Notifications', () => ({ useNotifications: () => state }));
// El borrador del teléfono (useSyncExternalStore sin versión de servidor): sin juegos anotados.
vi.mock('../lib/draft', async (original) => ({ ...(await original<typeof import('../lib/draft')>()), useDraft: () => null }));

const today = toIsoDate(new Date());

const league = (id: string, name: string, sport: string, schedule = ''): League => ({
  id,
  name,
  kind: 'liga',
  visibility: 'private',
  ownerUid: 'o',
  venue: '',
  schedule,
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport,
});
const ev = (id: string, type: string, extra: Partial<BowlingEvent> = {}) =>
  ({ id, type, name: '', date: today, games: 3, hcpBase: 0, hcpPercent: 0, teams: {}, playerCount: 0, rsvp: {}, ...extra }) as unknown as BowlingEvent;
const feed = (lid: string, events: BowlingEvent[]): LeagueFeed => ({
  lid,
  uid: 'u1',
  playerId: 'p1',
  isAdmin: false,
  isScorer: false,
  events,
  mySubs: [],
  pending: [],
  reactions: [],
  comments: [],
  suggestions: [],
});

const text = (el: ReactElement) =>
  renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

describe('Home con ligas de otros deportes', () => {
  it('Próximos: el americano sale como «Americano», sin «Voy»', () => {
    state.feeds = [feed('pad', [ev('am', 'americano', { rsvp: { p1: true } })]), feed('ten', [])];
    // Con horario de hoy el boliche inventaría una práctica hoy (la liga de tenis no tiene eventos); aquí no.
    const hoy = `${WEEKDAYS[(new Date().getDay() + 6) % 7]} · 7:00 pm`;
    state.leagues = [league('pad', 'Pádel Club', 'padel', hoy), league('ten', 'Tenis Club', 'tennis', hoy)];
    const t = text(h(WeekCalendar));
    expect(t).toContain('Americano');
    expect(t).toContain('Pádel Club');
    expect(t).not.toContain('Práctica');
    expect(t).not.toContain('Voy');
    expect(t).not.toContain('Vas');
    expect(t).not.toContain('Tenis Club');
  });

  it('Próximos: en el boliche la práctica sigue con su «Voy»', () => {
    state.feeds = [feed('bol', [ev('pr', 'practica')])];
    state.leagues = [league('bol', 'Liga Norte', 'bowling')];
    const t = text(h(WeekCalendar));
    expect(t).toContain('Práctica');
    expect(t).toContain('Voy');
  });

  it('En juego ahora: una ronda de golf de hoy no sale; la práctica del boliche sí', () => {
    state.feeds = [feed('golf', [ev('r1', 'ronda')])];
    state.leagues = [league('golf', 'Golf del Club', 'golf')];
    expect(text(h(LiveNow))).not.toContain('En juego ahora');

    state.feeds = [...state.feeds, feed('bol', [ev('pr', 'practica')])];
    state.leagues = [...state.leagues, league('bol', 'Liga Norte', 'bowling')];
    const t = text(h(LiveNow));
    expect(t).toContain('Liga Norte');
    expect(t).not.toContain('Golf del Club');
  });
});

describe('Home con partidos (raqueta y equipos)', () => {
  // La zona de este teléfono: así «hoy» es el mismo día para el calendario y para la liga.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sportLeague = (id: string, name: string, sport: string): League => ({ ...league(id, name, sport), tz });
  const todayAt = (h: number, m = 0) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const recent = { toMillis: () => Date.now() - 60_000 };
  const match = (id: string, leagueId: string, extra: Partial<Match> = {}) =>
    ({
      id,
      leagueId,
      eventId: null,
      round: 3,
      stage: '',
      court: 'Cancha 2',
      scheduledAt: todayAt(0, 5),
      status: 'scheduled',
      score: null,
      leaseUntil: null,
      version: 1,
      updatedAt: recent,
      sides: [
        { side: 1, teamId: null, label: 'Tigres', seed: null, players: [] },
        { side: 2, teamId: null, label: 'Leones', seed: null, players: [] },
      ],
      ...extra,
    }) as unknown as Match;

  it('Próximos: tu partido de hoy sale con el rival, la liga, la jornada y el link al partido', () => {
    state.feeds = [feed('fut', [])];
    state.leagues = [sportLeague('fut', 'Fútbol Norte', 'football')];
    const html = renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(WeekCalendar, { matches: [match('m1', 'fut', { mySide: 1 })] }))));
    const t = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(t).toContain('Hoy');
    expect(t).toContain('vs. Leones');
    expect(t).toContain('Fútbol Norte · Jornada 3 · Cancha 2');
    expect(t).not.toContain('Nada más esta semana');
    expect(html).toContain('href="/l/fut/juegos?partido=m1"');
    // Sin partidos, el mismo calendario dice que no hay nada.
    expect(text(h(WeekCalendar))).toContain('Nada más esta semana');
  });

  it('Próximos: un partido en vivo lo dice', () => {
    state.feeds = [feed('pad', [])];
    state.leagues = [sportLeague('pad', 'Pádel Club', 'padel')];
    const t = text(h(WeekCalendar, { matches: [match('m1', 'pad', { status: 'live', mySide: 2 })] }));
    expect(t).toContain('vs. Tigres');
    expect(t).toContain('En vivo');
  });

  it('En juego ahora: los partidos en vivo de tus ligas, el tuyo marcado, con el marcador', () => {
    state.feeds = [feed('fut', []), feed('pad', [])];
    state.leagues = [sportLeague('fut', 'Fútbol Norte', 'football'), sportLeague('pad', 'Pádel Club', 'padel')];
    const live = [
      match('a', 'fut', { status: 'live', score: { text: '2-1', sides: [2, 1] } }),
      match('b', 'pad', { status: 'live', score: { text: '6-4 3-2' }, sides: [{ side: 1, teamId: null, label: 'Ana / Luis', seed: null, players: [] }, { side: 2, teamId: null, label: 'Rosa / Juan', seed: null, players: [] }] } as Partial<Match>),
    ];
    const mine = [{ ...live[1], mySide: 1 } as Match];
    const t = text(h(LiveNow, { live, mine }));
    expect(t).toContain('En juego ahora');
    expect(t).toContain('2 partidos');
    expect(t).toContain('Ana / Luis vs. Rosa / Juan');
    expect(t).toContain('6-4 3-2');
    expect(t).toContain('Tu partido');
    expect(t).toContain('Tigres vs. Leones');
    expect(t.indexOf('Ana / Luis')).toBeLessThan(t.indexOf('Tigres'));
  });

  it('En juego ahora: sin partidos en vivo (ni boliche de hoy) no sale nada', () => {
    state.feeds = [feed('fut', [])];
    state.leagues = [sportLeague('fut', 'Fútbol Norte', 'football')];
    expect(text(h(LiveNow, { live: [match('a', 'fut', { status: 'scheduled' })], mine: [] })).trim()).toBe('');
  });

  it('Tu próximo partido: contra quién, dónde, el día y la hora, y cuántos más hay', () => {
    const leagues = [sportLeague('fut', 'Fútbol Norte', 'football')];
    const now = Date.now();
    const in2h = new Date(now + 2 * 3_600_000).toISOString();
    const next = nextMatch([match('m1', 'fut', { scheduledAt: in2h, mySide: 2 }), match('m2', 'fut', { scheduledAt: new Date(now + 3 * 86_400_000).toISOString(), mySide: 2 })], leagues, now)!;
    expect(next).not.toBeNull();
    const html = renderToString(h(MemoryRouter, null, h(NextMatchCard, { next })));
    const t = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(t).toContain('Tu próximo partido');
    expect(t).toContain('vs. Tigres');
    expect(t).toContain('Fútbol Norte · Jornada 3 · Cancha 2');
    expect(t).toContain(`${next.dayLabel} · ${next.time}`);
    expect(t).toContain('En 2 h');
    expect(t).toContain('Tienes 1 partido más en los próximos 7 días.');
    expect(html).toContain('href="/l/fut/juegos?partido=m1"');
  });
});

describe('«Voy» y «Vas» mientras se guardan', () => {
  const chip = (going: boolean, busy: boolean) => renderToString(h(RsvpChip, { going, busy, onClick: () => undefined }));

  it('con la ruedita en su lugar, sin poder tocarse otra vez', () => {
    for (const going of [true, false]) {
      const html = chip(going, true);
      expect(html).toContain('animate-spin');
      expect(html).toContain('aria-busy="true"');
      expect(html).toMatch(/<button[^>]* disabled=""/);
      // El texto se queda (el «Voy» transparente): el botón no cambia de tamaño.
      expect(html).toContain(going ? 'Vas' : 'Voy');
      // Y sigue teniendo nombre para el lector de pantalla (oculto con `invisible` lo perdería).
      expect(html).not.toContain('invisible');
    }
  });

  it('con otro tamaño (las filas de Esta semana): el mismo botón, más alto', () => {
    const html = renderToString(h(RsvpChip, { going: false, busy: true, onClick: () => undefined, className: 'min-h-9 px-3' }));
    expect(html).toContain('min-h-9 px-3');
    expect(html).not.toContain('py-1');
  });

  it('sin esperar, sin ruedita', () => {
    for (const going of [true, false]) {
      const html = chip(going, false);
      expect(html).not.toContain('animate-spin');
      expect(html).not.toContain('aria-busy');
      expect(html).not.toContain('disabled');
    }
  });
});
