import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { AgendaItem } from '../../lib/data/agenda';
import { AgendaRow, agendaLine, agendaView } from '../../pages/AgendaPage';
import { AgendaLinkCard } from '../home/AgendaLinkCard';
import {
  agendaCardNote,
  agendaJoinStep,
  agendaSports,
  agendaTitle,
  filterAgenda,
  groupByDay,
  hasAgenda,
  joinedMessage,
  joinsInEvent,
  loginNext,
  mineLabel,
  spotsText,
} from './logic';

const render = (node: ReactNode) => renderToString(h(MemoryRouter, null, node));
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');

const item = (over: Partial<AgendaItem> = {}): AgendaItem => ({
  eventId: 'ev1',
  leagueId: 'l1',
  leagueName: 'Liga Abierta',
  sport: 'bowling',
  leagueKind: 'liga',
  type: 'practica',
  name: '',
  date: '2026-10-06',
  time: '19:00',
  timeLabel: '7:00 pm',
  venue: 'Bowling Center',
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

describe('agenda: filtros y grupos', () => {
  const list = [
    item({ eventId: 'a', sport: 'padel', date: '2026-10-06' }),
    item({ eventId: 'b', sport: 'bowling', date: '2026-10-06' }),
    item({ eventId: 'c', sport: 'golf', date: '2026-10-08' }),
    item({ eventId: 'd', sport: 'bowling', date: '2026-10-09' }),
  ];

  it('los deportes en el orden de siempre y los filtros por deporte y día', () => {
    expect(agendaSports(list)).toEqual(['bowling', 'padel', 'golf']);
    expect(filterAgenda(list, 'bowling', null).map((i) => i.eventId)).toEqual(['b', 'd']);
    expect(filterAgenda(list, null, '2026-10-06').map((i) => i.eventId)).toEqual(['a', 'b']);
    expect(filterAgenda(list, 'golf', '2026-10-06')).toEqual([]);
  });

  it('por día, en el orden en que llegan', () => {
    expect(groupByDay(list).map((g) => [g.date, g.items.map((i) => i.eventId)])).toEqual([
      ['2026-10-06', ['a', 'b']],
      ['2026-10-08', ['c']],
      ['2026-10-09', ['d']],
    ]);
  });

  it('qué deportes tienen agenda (el Home del deporte muestra la entrada solo en esos)', () => {
    expect(['bowling', 'golf', 'padel', 'tennis', 'pickleball'].every(hasAgenda)).toBe(true);
    expect(['basketball', 'football', 'futsal', 'swimming', null].some(hasAgenda)).toBe(false);
    expect(agendaCardNote('padel')).toBe('Noches y torneos de pádel con lugar');
    expect(agendaCardNote('pickleball')).toBe('Noches y torneos de pickleball con lugar');
    // Sin noches de americano: solo torneos.
    expect(agendaCardNote('table_tennis')).toBe('Torneos de ping pong con lugar');
    expect(agendaCardNote('tennis')).toBe('Torneos de tenis con lugar');
    expect(hasAgenda('table_tennis')).toBe(true);
    expect(agendaCardNote(null)).toBe('Prácticas, rondas y noches abiertas en ligas públicas');
  });
});

describe('agenda: textos de cada tarjeta', () => {
  it('lugares que quedan o cuántos van', () => {
    expect(spotsText(item({ taken: 12 }))).toBe('12 van');
    expect(spotsText(item({ taken: 1 }))).toBe('1 va');
    expect(spotsText(item({ taken: 0 }))).toBe('Nadie ha dicho «Voy» todavía');
    expect(spotsText(item({ join: 'golf', taken: 4 }))).toBe('4 inscritos');
    expect(spotsText(item({ join: 'signup', cap: 8, taken: 7, spotsLeft: 1, waitlist: 0 }))).toBe('Queda 1 lugar');
    expect(spotsText(item({ join: 'signup', cap: 16, taken: 10, spotsLeft: 6, waitlist: 2 }))).toBe('Quedan 6 lugares · 2 en espera');
    expect(spotsText(item({ join: 'signup', taken: 0, waitlist: null }))).toBe('Sin inscritos todavía');
  });

  it('el nombre del evento, lo que dice si ya es mío y el aviso al apuntarse', () => {
    expect(agendaTitle(item())).toMatch(/^Práctica /);
    expect(agendaTitle(item({ name: 'Noche de pádel', sport: 'padel', type: 'americano' }))).toBe('Noche de pádel');
    expect(mineLabel(item())).toBe('Vas');
    expect(mineLabel(item({ join: 'golf' }))).toBe('Inscrito');
    expect(mineLabel(item({ join: 'signup' }))).toBe('Apuntado');
    const noche = item({ name: 'Americano', sport: 'padel', type: 'americano', join: 'signup' });
    expect(joinedMessage(noche, { kind: 'in', position: 3 })).toBe('Estás en la lista de Americano');
    expect(joinedMessage(noche, { kind: 'wait', position: 2 })).toBe('Quedaste en espera (n.º 2) en Americano');
    expect(joinedMessage(item({ name: 'Liga martes' }), { kind: 'going' })).toBe('Listo: vas a Liga martes');
  });

  it('el torneo de raqueta se apunta en su evento; sin cuenta, entra y vuelve a apuntarse', () => {
    expect(joinsInEvent(item({ join: 'signup', categories: [{ id: 'a', name: 'A', cap: 8, taken: 2, spotsLeft: 6 }] }))).toBe(true);
    expect(joinsInEvent(item({ join: 'signup' }))).toBe(false);
    expect(joinsInEvent(item())).toBe(false);
    const next = loginNext('?deporte=bowling', 'ev1');
    expect(next.startsWith('/login?next=')).toBe(true);
    expect(decodeURIComponent(next.slice('/login?next='.length))).toBe('/agenda?deporte=bowling&apuntar=ev1');
  });

  it('«Me apunto» en una liga de la que no es miembro pasa primero por unirse («¿Quién eres?»); si ya es, directo', () => {
    const torneo = item({ join: 'signup', categories: [{ id: 'a', name: 'A', cap: 8, taken: 2, spotsLeft: 6 }] });
    const mine = new Set(['l1']);
    expect(agendaJoinStep(torneo, { signedIn: true, leagues: new Set() })).toBe('event');
    expect(agendaJoinStep(item(), { signedIn: false, leagues: null })).toBe('login');
    expect(agendaJoinStep(item(), { signedIn: true, leagues: new Set(['otra']) })).toBe('league');
    expect(agendaJoinStep(item({ join: 'golf' }), { signedIn: true, leagues: new Set() })).toBe('league');
    expect(agendaJoinStep(item({ join: 'signup' }), { signedIn: true, leagues: new Set() })).toBe('league');
    expect(agendaJoinStep(item(), { signedIn: true, leagues: mine })).toBe('direct');
    // Sus ligas todavía no se leyeron: como antes, directo (join_league deja el reclamo si se llama igual que uno).
    expect(agendaJoinStep(item(), { signedIn: true, leagues: null })).toBe('direct');
  });
});

describe('agenda: pantallas', () => {
  it('la fila: la fecha (OCT / 6), qué, el día, la hora, la liga, dónde, cuántos y «Me apunto»; toda la fila abre el evento', () => {
    const out = render(h(AgendaRow, { item: item({ taken: 5 }), today: '2026-10-01', onJoin: () => undefined }));
    const t = text(out);
    expect(t).toContain('OCT 6');
    expect(t).toContain('Martes · 7:00 pm · Liga Abierta · Bowling Center · 5 van');
    expect(t).toContain('Me apunto');
    expect(out).toContain(`href="${item().url}"`);
    expect(out).toContain('aria-label="Me apunto a');
  });

  it('ya apuntado: dice cómo quedó en vez del botón', () => {
    const row = (over: Partial<AgendaItem>, joined?: string) => text(render(h(AgendaRow, { item: item(over), today: '2026-10-06', joined, onJoin: () => undefined })));
    expect(row({ mine: true })).not.toContain('Me apunto');
    expect(row({ mine: true })).toContain('Vas');
    expect(row({ join: 'signup' }, 'En espera')).toContain('En espera');
    const later = row({ join: 'signup', timeLabel: null, until: '2026-10-05T22:00:00Z' });
    expect(later).toContain('Hoy · Liga Abierta');
    expect(later).toContain('hasta el');
  });

  it('el Calendario: «Tus ligas» con ?ver=mias (si tienes ligas); si no, lo abierto', () => {
    expect(agendaView('mias', true)).toBe('mias');
    expect(agendaView('mias', false)).toBe('abiertas');
    expect(agendaView(null, true)).toBe('abiertas');
    expect(agendaLine(item({ venue: '' }), '2026-10-06')).toBe('Hoy · 7:00 pm · Liga Abierta · 3 van');
  });

  it('la entrada del Home y la del Home del deporte (con el deporte en el link)', () => {
    const all = render(h(AgendaLinkCard, {}));
    expect(text(all)).toContain('¿Dónde juego esta semana?');
    expect(all).toContain('href="/agenda"');
    expect(render(h(AgendaLinkCard, { sport: 'golf' }))).toContain('href="/agenda?deporte=golf"');
    expect(render(h(AgendaLinkCard, { sport: 'basketball' }))).toBe('');
  });
});
