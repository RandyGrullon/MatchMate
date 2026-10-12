/**
 * Las piezas nuevas de Ligas sin navegador: los textos (de qué es una liga, el resumen de arriba, el bloque de lo
 * próximo, mi lugar en el boliche) y las tarjetas (la liga, el torneo, el esqueleto mientras carga y «EN VIVO»).
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarItem } from '../../lib/calendar';
import type { League } from '../../lib/types';
import type { TourneyItem } from '../eventos/logic';
import { leagueKindLine, ligasSummary, nextBlock, nextShort, soonest, sportLabel, standingBits, summaryText } from './logic';

const TODAY = '2026-10-07';

const world = vi.hoisted(() => ({
  players: 6,
  standing: null as { average: number | null; pos: number | null; of: number; missing: number } | null,
}));

vi.mock('../../lib/data', async (orig) => ({
  ...(await orig<typeof import('../../lib/data')>()),
  usePlayers: () => ({ data: Array.from({ length: world.players }, (_, i) => ({ id: `p${i}`, name: `J${i}` })), loading: false, error: null }),
}));
vi.mock('../home/HomeStats', () => ({
  useMyStanding: (lid: string | null) => ({ standing: lid ? world.standing : null, loading: false }),
}));

const { LeagueCardsSkeleton, LigasSummary, LivePill, MyLeagueCard, TourneyCard } = await import('./LigasCards');

const render = (node: ReactNode) => renderToString(h(MemoryRouter, null, node));
const text = (html: string) =>
  html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const league = (extra: Partial<League> = {}): League =>
  ({ id: 'l1', name: 'Liga de los martes', kind: 'liga', visibility: 'public', sport: 'bowling', schedule: 'Martes · 7:30 pm', venue: 'Bolera Sambil', logoPath: null, ...extra }) as League;

const item = (p: Partial<CalendarItem> = {}): CalendarItem => ({
  key: 'k',
  kind: 'event',
  date: TODAY,
  lid: 'l1',
  leagueName: 'Liga de los martes',
  sport: 'bowling',
  type: 'practica',
  name: 'Práctica',
  time: '7:30 pm',
  minutes: 19 * 60 + 30,
  eventId: 'e1',
  playerId: null,
  going: false,
  href: '/l/l1/e/e1',
  matchId: null,
  ...p,
});

beforeEach(() => {
  world.players = 6;
  world.standing = null;
});

describe('textos de Ligas', () => {
  it('de qué es una liga: el deporte (o el juego en esports) y si es pública o privada', () => {
    expect(leagueKindLine(league({ sport: 'padel' }))).toEqual({ sport: 'Pádel', rest: 'Pública' });
    expect(leagueKindLine(league({ sport: undefined, visibility: 'private' }))).toEqual({ sport: 'Boliche', rest: 'Privada' });
    expect(sportLabel('esports', 'valorant')).toBe('VALORANT');
    expect(sportLabel('esports', null)).toBe('Esports');
    expect(sportLabel('nada')).toBe('Otro deporte');
  });

  it('lo próximo en una frase: «hoy 7:30 pm», «mañana», «martes 20 oct, 7:30 pm»', () => {
    expect(nextShort({ date: TODAY, time: '7:30 pm' }, TODAY)).toBe('hoy 7:30 pm');
    expect(nextShort({ date: '2026-10-08', time: null }, TODAY)).toBe('mañana');
    expect(nextShort({ date: '2026-10-20', time: '7:30 pm' }, TODAY)).toBe('martes 20 oct, 7:30 pm');
  });

  it('lo más pronto de varias ligas (con la hora)', () => {
    const a = item({ date: '2026-10-09', minutes: 600 });
    const b = item({ date: '2026-10-08', minutes: 1200 });
    const c = item({ date: '2026-10-08', minutes: 300 });
    expect(soonest([a, b, c])).toBe(c);
    expect(soonest([])).toBeNull();
  });

  it('el resumen: solo lo que hay', () => {
    expect(summaryText(ligasSummary({ ligas: 3, torneos: 0, live: 1, next: { date: TODAY, time: '7:30 pm' }, today: TODAY }))).toBe(
      '3 ligas · 1 en vivo · Próximo: hoy 7:30 pm',
    );
    expect(summaryText(ligasSummary({ ligas: 1, torneos: 2, live: 0, next: null, today: TODAY }))).toBe('1 liga · 2 torneos');
    expect(summaryText(ligasSummary({ ligas: 0, torneos: 1, live: 0, next: null, today: TODAY }))).toBe('1 torneo');
    expect(ligasSummary({ ligas: 0, torneos: 0, live: 0, next: null, today: TODAY })).toEqual([]);
  });

  it('el bloque de lo próximo: cuándo, qué y dónde; sin calendario, el horario; sin nada, null', () => {
    expect(nextBlock(item(), league(), TODAY)).toEqual({ date: TODAY, today: true, when: 'Hoy, 7:30 pm', what: 'Práctica · Bolera Sambil' });
    // Un partido dice dónde se juega («Jornada 3 · Cancha 2») en vez de la sede.
    expect(nextBlock(item({ kind: 'match', name: 'Tigres vs Leones', detail: 'Jornada 3 · Cancha 2', date: '2026-10-08', time: null }), league(), TODAY)).toEqual({
      date: '2026-10-08',
      today: false,
      when: 'Mañana',
      what: 'Tigres vs Leones · Jornada 3 · Cancha 2',
    });
    // El torneo suelto que se llama como la liga no repite el nombre.
    expect(nextBlock(item({ name: 'Liga de los martes' }), league({ venue: '' }), TODAY)?.what).toBe('');
    expect(nextBlock(null, league(), TODAY)).toEqual({ date: null, today: false, when: 'Martes · 7:30 pm', what: 'Según el horario · Bolera Sambil' });
    expect(nextBlock(null, league({ schedule: '' }), TODAY)).toBeNull();
  });

  it('mi lugar en el boliche: «2.º de 6» y «Promedio 195» (lo que haya)', () => {
    expect(standingBits({ average: 195, pos: 2, of: 6, missing: 0 })).toEqual({ pos: '2.º de 6', average: 'Promedio 195' });
    expect(standingBits({ average: 180, pos: null, of: 6, missing: 2 })).toEqual({ pos: null, average: 'Promedio 180' });
    expect(standingBits(null)).toEqual({ pos: null, average: null });
  });
});

describe('tarjeta de una liga', () => {
  it('el nombre es el único link (cubre la tarjeta), con de qué es, lo próximo y los jugadores', () => {
    const html = render(h(MyLeagueCard, { league: league({ sport: 'padel', venue: 'Club Este' }), live: false, next: item({ sport: 'padel', name: 'Americano' }), today: TODAY }));
    expect(html.match(/<a /g)).toHaveLength(1);
    const a = /<a [^>]*>/.exec(html)![0];
    expect(a).toContain('href="/l/l1"');
    expect(a).toMatch(/class="mm-card-link[^"]*after:inset-0/);
    expect(text(html)).toContain('Liga de los martes Pádel · Pública');
    expect(text(html)).toContain('Próximo: Hoy, 7:30 pm Americano · Club Este');
    expect(text(html)).toContain('6 jugadores');
    expect(html).toContain('mm-tint-padel');
    expect(text(html)).not.toContain('EN VIVO');
  });

  it('en vivo: el aro rojo y «EN VIVO» en la esquina del logo', () => {
    const html = render(h(MyLeagueCard, { league: league(), live: true, today: TODAY }));
    expect(html).toContain('ring-danger');
    expect(text(html)).toContain('EN VIVO');
  });

  it('Pro: mi papel (no si soy miembro) y lo que espera por aprobar; Lite, sin papel', () => {
    const pro = text(render(h(MyLeagueCard, { league: league(), live: false, today: TODAY, role: 'admin', pending: 3, pro: true })));
    expect(pro).toContain('6 jugadores Admin 3 por aprobar');
    expect(text(render(h(MyLeagueCard, { league: league(), live: false, today: TODAY, role: 'member', pro: true })))).not.toContain('Miembro');
    expect(text(render(h(MyLeagueCard, { league: league(), live: false, today: TODAY, role: 'owner' })))).not.toContain('Dueño');
  });

  it('boliche: mi lugar y mi promedio si soy jugador; en otro deporte no se lee', () => {
    world.standing = { average: 195, pos: 2, of: 6, missing: 0 };
    expect(text(render(h(MyLeagueCard, { league: league(), live: false, today: TODAY, playerId: 'p1' })))).toContain('2.º de 6 Promedio 195');
    expect(text(render(h(MyLeagueCard, { league: league(), live: false, today: TODAY })))).not.toContain('Promedio');
    expect(text(render(h(MyLeagueCard, { league: league({ sport: 'padel' }), live: false, today: TODAY, playerId: 'p1' })))).not.toContain('Promedio');
  });

  it('sin jugadores todavía, sin la fila de números', () => {
    world.players = 0;
    const html = render(h(MyLeagueCard, { league: league({ schedule: '' }), live: false, today: TODAY }));
    expect(html).not.toContain('<ul');
    expect(html).not.toContain('jugadores');
  });

  it('mientras carga: tarjetas con la misma forma (logo, nombre, lo próximo)', () => {
    const html = render(h(LeagueCardsSkeleton, {}));
    expect(html).toContain('role="status"');
    expect(html.match(/size-14 rounded-\[18px\]/g)).toHaveLength(2);
    expect(render(h(LeagueCardsSkeleton, { pro: true }))).toContain('sm:grid-cols-2');
  });
});

describe('tarjeta de un torneo', () => {
  const tourney = (extra: Partial<TourneyItem> = {}): TourneyItem => ({
    key: 't',
    name: 'Copa Radiante',
    href: '/l/l9/e/e9',
    lid: 'l9',
    leagueName: 'Copa Radiante',
    sport: 'esports',
    game: 'valorant',
    standalone: true,
    date: '2026-10-15',
    time: null,
    eventId: 'e9',
    going: false,
    ...extra,
  });

  it('dice su juego una sola vez, su día y cuántos inscritos', () => {
    const t = text(render(h(TourneyCard, { t: tourney(), live: false, entrants: 8, today: TODAY })));
    expect(t.match(/VALORANT/g)).toHaveLength(1);
    expect(t).toContain('Jueves 15 oct · 8 inscritos');
  });

  it('«Inscrito» si ya me inscribí; «EN VIVO» si se está jugando', () => {
    expect(text(render(h(TourneyCard, { t: tourney({ going: true }), live: false, today: TODAY, pro: true })))).toContain('Inscrito');
    const live = render(h(TourneyCard, { t: tourney({ going: true }), live: true, today: TODAY }));
    expect(text(live)).toContain('EN VIVO');
    expect(text(live)).not.toContain('Inscrito');
  });
});

describe('piezas', () => {
  it('«EN VIVO»: rojo, con el punto que late', () => {
    const html = render(h(LivePill, {}));
    expect(html).toContain('bg-danger');
    expect(html).toContain('text-on-danger');
    expect(html).toContain('live-dot');
  });

  it('el resumen: lo en vivo en rojo y lo próximo en el color del deporte', () => {
    const html = render(h(LigasSummary, { parts: ligasSummary({ ligas: 2, torneos: 0, live: 1, next: { date: TODAY, time: null }, today: TODAY }) }));
    expect(text(html).trim()).toBe('2 ligas · 1 en vivo · Próximo: hoy');
    expect(html).toMatch(/text-danger[^>]*><span aria-hidden="true" class="live-dot/);
    expect(html).toMatch(/text-accent">Próximo: hoy/);
    expect(render(h(LigasSummary, { parts: [] }))).toBe('');
  });
});
