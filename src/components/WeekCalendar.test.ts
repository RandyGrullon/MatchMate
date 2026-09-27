/**
 * Home › Próximos y «En juego ahora» con ligas de varios deportes: los eventos de pádel, golf o natación salen
 * con su tipo (no como «Práctica»), sin «Voy» y sin prácticas inventadas por el horario; «En juego ahora» es
 * solo del boliche (anotar tus juegos). Se dibujan sin navegador (renderToString) con avisos de mentira.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { LeagueFeed } from '../lib/data';
import { toIsoDate } from '../lib/format';
import { WEEKDAYS } from '../lib/schedule';
import type { BowlingEvent, League } from '../lib/types';
import { FeedbackProvider } from './feedback';
import { LiveNow } from './LiveNow';
import { WeekCalendar } from './WeekCalendar';

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
