/**
 * El widget del iPhone (homeWidget.ts): lo de ahora como Hoy (en juego, partido en vivo, tu próximo partido, tu próxima
 * fecha, nada), sin cuenta, «Lo que viene» sin lo de arriba y la línea de tiempo de cada medianoche. Datos ficticios.
 */
import { describe, expect, it } from 'vitest';
import type { CalendarItem, CalendarMatch, NextMatchInfo } from '../../lib/calendar';
import type { LiveGame, LiveMatchItem } from '../../lib/live';
import type { League } from '../../lib/types';
import { homeWidgetKey, homeWidgetNow, homeWidgetOn, homeWidgetTimeline, WIDGET_DAYS, WIDGET_ROWS, type HomeWidgetInput } from './homeWidget';

const TODAY = '2026-11-12'; // jueves
const link = (href: string) => `matchmate://${href.replace(/^\//, '')}`;

const league = { id: 'l1', name: 'Liga de Ejemplo', kind: 'liga', venue: 'Bolera de Ejemplo', sport: 'bowling' } as unknown as League;

const item = (p: Partial<CalendarItem> & Pick<CalendarItem, 'key' | 'date'>): CalendarItem => ({
  kind: 'event',
  lid: 'l1',
  leagueName: 'Liga de Ejemplo',
  sport: 'bowling',
  type: 'practica',
  name: 'Práctica',
  time: '7:00 pm',
  minutes: 19 * 60,
  eventId: `e-${p.key}`,
  playerId: 'p1',
  going: false,
  href: `/l/l1/e/e-${p.key}`,
  matchId: null,
  ...p,
});

const base = (p: Partial<HomeWidgetInput> = {}): HomeWidgetInput => ({
  signedIn: true,
  today: TODAY,
  games: [],
  liveItems: [],
  nextMatch: null,
  nextEvent: null,
  upcoming: [],
  showLeague: false,
  link,
  ...p,
});

describe('homeWidgetNow', () => {
  it('sin cuenta: la portada', () => {
    const p = homeWidgetNow(base({ signedIn: false }));
    expect(p).toMatchObject({ lead: 'MatchMate', title: 'Tu liga, en el celular', url: 'matchmate://', rows: [] });
  });

  it('nada programado', () => {
    const p = homeWidgetNow(base());
    expect(p).toMatchObject({ lead: 'Hoy no te toca jugar', title: 'Nada programado', live: false, rows: [], emptyRows: 'Nada más en los próximos 30 días.' });
  });

  it('en juego ahora: la práctica de hoy, liga · bolera · hora, y «Lo que viene» sin ella', () => {
    const game = {
      feed: { lid: 'l1' },
      league,
      event: { id: 'e-hoy', type: 'practica', name: null, date: TODAY, startTime: '19:00:00' },
      info: { live: true, startLabel: '7:00 pm', startsSoon: false },
    } as unknown as LiveGame;
    const hoy = item({ key: 'l1:e-hoy', date: TODAY, eventId: 'e-hoy' });
    const sab = item({ key: 'l1:e-sab', date: '2026-11-14', type: 'torneo', name: 'Torneo de Ejemplo' });
    const p = homeWidgetNow(base({ games: [game], upcoming: [hoy, sab] }));
    expect(p).toMatchObject({ lead: 'En juego ahora', live: true, title: 'Práctica de hoy', line: 'Liga de Ejemplo · Bolera de Ejemplo · 7:00 pm', url: 'matchmate://l/l1/e/e-hoy' });
    expect(p.rows.map((r) => [r.month, r.day, r.title, r.line])).toEqual([['NOV', '14', 'Torneo de Ejemplo', 'Sábado · 7:00 pm']]);
  });

  it('empieza pronto: «Empieza a las …» sin repetir la hora', () => {
    const game = {
      feed: { lid: 'l1' },
      league,
      event: { id: 'e-hoy', type: 'practica', name: null, date: TODAY, startTime: '19:00:00' },
      info: { live: true, startLabel: '7:00 pm', startsSoon: true },
    } as unknown as LiveGame;
    expect(homeWidgetNow(base({ games: [game] }))).toMatchObject({ lead: 'Empieza a las 7:00 pm', line: 'Liga de Ejemplo · Bolera de Ejemplo' });
  });

  it('un partido en vivo', () => {
    const it2 = { title: 'Tigres vs. Leones', score: '2-1', detail: 'Jornada 3', league, href: '/l/l1/partido/m1' } as unknown as LiveMatchItem;
    expect(homeWidgetNow(base({ liveItems: [it2] }))).toMatchObject({ lead: 'En vivo', live: true, title: 'Tigres vs. Leones', line: '2-1 · Jornada 3', sub: 'Liga de Ejemplo', url: 'matchmate://l/l1/partido/m1' });
  });

  it('tu próximo partido, y no se repite en la lista', () => {
    const next = { match: { id: 'm1' }, league, title: 'vs. Tigres', detail: 'Cancha 2', dayLabel: 'Mañana', time: '8:00 pm', href: '/l/l1/partido/m1' } as unknown as NextMatchInfo<CalendarMatch>;
    const m = item({ key: 'm:m1', kind: 'match', date: '2026-11-13', name: 'vs. Tigres', matchId: 'm1' });
    const p = homeWidgetNow(base({ nextMatch: next, upcoming: [m] }));
    expect(p).toMatchObject({ lead: 'Tu próximo partido', title: 'vs. Tigres', line: 'Mañana · 8:00 pm', sub: 'Liga de Ejemplo · Cancha 2' });
    expect(p.rows).toEqual([]);
  });

  it('tu próxima práctica (otro día) y la de hoy', () => {
    const mar = item({ key: 'l1:e-mar', date: '2026-11-17' });
    expect(homeWidgetNow(base({ nextEvent: mar, upcoming: [mar] }))).toMatchObject({ lead: 'Hoy no te toca jugar', title: 'Tu próxima práctica', line: 'Martes · 7:00 pm', sub: 'Liga de Ejemplo', rows: [] });
    const hoy = item({ key: 'l1:e-hoy', date: TODAY });
    expect(homeWidgetNow(base({ nextEvent: hoy, upcoming: [hoy] }))).toMatchObject({ lead: 'Hoy juegas', title: 'Práctica de hoy', line: 'Hoy · 7:00 pm' });
  });

  it('«Lo que viene» cabe hasta WIDGET_ROWS, con la liga si juegas en más de una', () => {
    const many = Array.from({ length: 6 }, (_, i) => item({ key: `l1:e${i}`, date: `2026-11-${String(13 + i).padStart(2, '0')}` }));
    const p = homeWidgetNow(base({ upcoming: many, showLeague: true }));
    expect(p.rows).toHaveLength(WIDGET_ROWS);
    expect(p.rows[0].line).toBe('Mañana · 7:00 pm · Liga de Ejemplo');
  });
});

describe('la línea de tiempo', () => {
  const mar = item({ key: 'l1:e-mar', date: '2026-11-17' });
  const vie = item({ key: 'l1:e-vie', date: '2026-11-13', type: 'torneo', name: 'Torneo de Ejemplo' });

  it('un día que llega: la primera fecha que queda, vista desde ese día', () => {
    expect(homeWidgetOn(base({ upcoming: [vie, mar] }), '2026-11-13')).toMatchObject({ lead: 'Hoy juegas', title: 'Torneo de Ejemplo', line: 'Hoy · 7:00 pm' });
    const sab = homeWidgetOn(base({ upcoming: [vie, mar] }), '2026-11-14');
    expect(sab).toMatchObject({ title: 'Tu próxima práctica', line: 'Martes · 7:00 pm', rows: [] });
    expect(homeWidgetOn(base({ upcoming: [vie, mar] }), '2026-11-18')).toMatchObject({ title: 'Nada programado' });
  });

  it('ahora y cada medianoche de la semana', () => {
    const now = new Date(2026, 10, 12, 15, 30);
    const entries = homeWidgetTimeline(base({ nextEvent: vie, upcoming: [vie, mar] }), now);
    expect(entries).toHaveLength(1 + WIDGET_DAYS);
    expect(entries[0].at).toBe(now.getTime());
    expect(entries[1].at).toBe(new Date(2026, 10, 13).getTime());
    expect(entries[1].props).toMatchObject({ lead: 'Hoy juegas', title: 'Torneo de Ejemplo' });
    expect(entries[0].props).toMatchObject({ lead: 'Hoy no te toca jugar', title: 'Tu próximo torneo', line: 'Torneo de Ejemplo · Mañana · 7:00 pm' });
  });

  it('la clave cambia con lo que se ve, no con la hora', () => {
    const a = homeWidgetTimeline(base({ upcoming: [mar] }), new Date(2026, 10, 12, 10));
    const b = homeWidgetTimeline(base({ upcoming: [mar] }), new Date(2026, 10, 12, 11));
    const c = homeWidgetTimeline(base({ upcoming: [vie, mar] }), new Date(2026, 10, 12, 11));
    expect(homeWidgetKey(a)).toBe(homeWidgetKey(b));
    expect(homeWidgetKey(a)).not.toBe(homeWidgetKey(c));
  });
});
