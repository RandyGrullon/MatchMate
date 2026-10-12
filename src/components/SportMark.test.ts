/**
 * De qué deporte es cada cosa (SportMark y SportCorner) dibujado sin navegador (renderToString): el ícono de cada
 * deporte en su color, el monograma del juego en esports (y el control si no se sabe el juego), el trofeo chico de los
 * torneos, el punto de «en vivo», la esquina del bloque de la fecha; y el juego de una liga de esports desde la base
 * (`rules.game`) hasta las filas: el calendario, «Tus torneos», el cuadro de la liga y los partidos en vivo.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { upcomingCalendar } from '../lib/calendar';
import type { LeagueFeed } from '../lib/data';
import type { Match } from '../lib/data/matches';
import { leagueGame, toLeague, type LeagueRow } from '../lib/data/rows';
import type { LiveMatchItem } from '../lib/live';
import type { BowlingEvent, League } from '../lib/types';
import { tourneysOf } from './eventos/logic';
import { LeagueTile, TourneyRow } from './ligas/LigasRows';
import { LiveMatchesCard } from './LiveNowMatches';
import { SportCorner, SportMark, sportMarkLabel } from './SportMark';
import { DateBlock } from './ui';

const render = (node: ReactNode) => renderToString(h(MemoryRouter, null, node));

/** Lo que dice el lector de pantalla de cada marca de la página, en orden. */
const labels = (html: string) => [...html.matchAll(/role="img" aria-label="([^"]+)"/g)].map((m) => m[1]);

const row = (over: Partial<LeagueRow> = {}): LeagueRow => ({
  id: 'L9',
  sport: 'esports',
  kind: 'liga',
  visibility: 'public',
  name: 'Liga Valorant RD',
  owner_id: 'u1',
  venue: '',
  schedule: '',
  season_start: null,
  season_end: null,
  contact_name: '',
  contact_phone: '',
  require_photo: false,
  has_minors: false,
  tz: 'America/Santo_Domingo',
  rules: { game: 'valorant' },
  created_at: '2026-10-01T00:00:00Z',
  ...over,
});
/** La liga como la entrega la capa de datos (las horas en texto da igual aquí). */
const asLeague = (r: LeagueRow) => toLeague(r) as unknown as League;

describe('la marca del deporte', () => {
  it('el ícono de cada deporte en su color, y el lector de pantalla dice cuál es', () => {
    const bowling = render(h(SportMark, { sport: 'bowling' }));
    expect(bowling).toContain('lucide-circle-dot');
    expect(bowling).toContain('mm-tint-bowling');
    expect(bowling).toContain('bg-accent-soft text-accent size-10 rounded-xl');
    expect(labels(bowling)).toEqual(['Boliche']);

    const tenis = render(h(SportMark, { sport: 'tennis', size: 'lg' }));
    expect(tenis).toContain('lucide-tennis-ball');
    expect(tenis).toContain('mm-tint-tennis');
    expect(tenis).toContain('size-12 rounded-[15px]');
    expect(labels(tenis)).toEqual(['Tenis']);

    expect(render(h(SportMark, { sport: 'basketball', size: 'sm' }))).toContain('lucide-basketball size-4');
    expect(labels(render(h(SportMark, { sport: 'futsal' })))).toEqual(['Fútbol sala']);
    // Sin deporte es boliche (como leagueSport); uno que esta versión no conoce, «Otro deporte».
    expect(render(h(SportMark, { sport: null }))).toContain('lucide-circle-dot');
    expect(labels(render(h(SportMark, { sport: 'curling' })))).toEqual(['Otro deporte']);
  });

  it('esports: el monograma del juego (sin logos); sin juego o con uno que no existe, el control', () => {
    const val = render(h(SportMark, { sport: 'esports', game: 'valorant' }));
    expect(val).toContain('>VAL</text>');
    expect(val).toContain('size-10 rounded-xl');
    expect(val).not.toContain('lucide-gamepad');
    expect(labels(val)).toEqual(['VALORANT']);

    for (const game of [null, undefined, 'tetris']) {
      const pad = render(h(SportMark, { sport: 'esports', game }));
      expect(pad).toContain('lucide-gamepad');
      expect(pad).not.toContain('</text>');
      expect(labels(pad)).toEqual(['Esports']);
    }
    // El juego solo cuenta en esports.
    expect(render(h(SportMark, { sport: 'padel', game: 'valorant' }))).not.toContain('VAL');
  });

  it('un torneo: el deporte con el trofeo chico en la esquina (en la esquina de la fecha no cabe)', () => {
    const torneo = render(h(SportMark, { sport: 'padel', torneo: true }));
    expect(torneo).toContain('lucide-grid-2x2');
    expect(torneo).toContain('lucide-trophy');
    expect(torneo).toMatch(/class="inline-flex shrink-0 relative /);
    expect(labels(torneo)).toEqual(['Torneo de pádel']);
    expect(labels(render(h(SportMark, { sport: 'esports', game: 'rocket_league', torneo: true })))).toEqual(['Torneo de Rocket League']);
    expect(render(h(SportMark, { sport: 'padel', torneo: true, size: 'xs' }))).not.toContain('lucide-trophy');
  });

  it('en vivo: el punto verde en la esquina', () => {
    const live = render(h(SportMark, { sport: 'football', live: true }));
    expect(live).toContain('live-dot absolute');
    expect(live).toContain('text-ok');
    expect(render(h(SportMark, { sport: 'football' }))).not.toContain('live-dot');
  });

  it('sin nombre cuando el texto de al lado ya lo dice (label null)', () => {
    const quiet = render(h(SportMark, { sport: 'golf', label: null }));
    expect(quiet).toContain('aria-hidden="true" class="inline-flex');
    expect(quiet).not.toContain('role="img"');
  });

  it('los nombres para el lector de pantalla', () => {
    expect(sportMarkLabel('table_tennis')).toBe('Ping pong');
    expect(sportMarkLabel('bowling', null, true)).toBe('Torneo de boliche');
    expect(sportMarkLabel('esports', 'fortnite')).toBe('Fortnite');
    expect(sportMarkLabel('esports', null, true)).toBe('Torneo de esports');
  });

  it('en la esquina de la fecha: el mes en el color del deporte y la marca chica con su borde', () => {
    const html = render(h(SportCorner, { sport: 'tennis', children: h(DateBlock, { date: '2026-10-13' }) }));
    expect(html).toMatch(/<span class="relative inline-flex shrink-0 mm-tint-tennis"><time/);
    expect(html).toContain('size-6 rounded-lg');
    expect(html).toContain('absolute -right-1.5 -bottom-1.5 rounded-lg ring-2 ring-surface');
    expect(labels(html)).toEqual(['Tenis']);
    // Sobre gris (el bloque `raised` de la tarjeta de lo próximo), el borde es gris.
    expect(render(h(SportCorner, { sport: 'tennis', on: 'surface-2', children: h(DateBlock, { date: '2026-10-13', raised: true }) }))).toContain('ring-surface-2');
    // El juego también va en la esquina.
    expect(render(h(SportCorner, { sport: 'esports', game: 'lol', children: h(DateBlock, { date: '2026-10-13' }) }))).toContain('>LoL</text>');
  });
});

describe('el cuadro de la liga', () => {
  const PATH = 'L1/0199a1b2-c3d4-7e5f-8a9b-000000000001.webp';

  it('una liga sin logo: su deporte; con logo, el logo (no se toca)', () => {
    const liga = render(h(LeagueTile, { league: { id: 'L1', sport: 'golf', kind: 'liga', logoPath: null } }));
    expect(liga).toContain('lucide-land-plot');
    expect(liga).not.toContain('lucide-trophy');
    expect(labels(liga)).toEqual(['Golf']);
    const logo = render(h(LeagueTile, { league: { id: 'L1', sport: 'golf', kind: 'liga', logoPath: PATH } }));
    expect(logo).not.toContain('lucide-land-plot');
    expect(logo).not.toContain('role="img"');
  });

  it('un torneo también dice su deporte: el ícono con el trofeo chico (antes, solo el trofeo)', () => {
    const torneo = render(h(LeagueTile, { league: { id: 'T1', sport: 'bowling', kind: 'torneo', logoPath: null }, dense: true }));
    expect(torneo).toContain('lucide-circle-dot');
    expect(torneo).toContain('lucide-trophy');
    expect(torneo).toContain('size-10 rounded-xl');
    expect(labels(torneo)).toEqual(['Torneo de boliche']);
  });

  it('una liga de esports con su juego: el monograma', () => {
    const html = render(h(LeagueTile, { league: { id: 'L9', sport: 'esports', kind: 'liga', logoPath: null, game: 'valorant' } }));
    expect(html).toContain('>VAL</text>');
    expect(html).toContain('size-12 rounded-[15px]');
  });
});

describe('el juego de una liga de esports, de la base a las filas', () => {
  it('toLeague lo lee de rules.game (solo en esports); un juego que no está en el catálogo sale con el control', () => {
    expect(toLeague(row()).game).toBe('valorant');
    expect(leagueGame(row({ rules: { game: 42 } }))).toBeNull();
    expect(leagueGame(row({ rules: { game: '' } }))).toBeNull();
    expect(leagueGame(row({ rules: { game: '<b>x</b>' } }))).toBeNull();
    // rows.ts no mira el catálogo (entra en el motor de insignias para Deno): eso lo hace la marca al dibujar.
    expect(leagueGame(row({ rules: { game: 'tetris' } }))).toBe('tetris');
    const tetris = render(h(LeagueTile, { league: asLeague(row({ rules: { game: 'tetris' } })) }));
    expect(tetris).toContain('lucide-gamepad');
    expect(tetris).not.toContain('</text>');
    expect(leagueGame(row({ rules: null }))).toBeNull();
    expect(leagueGame(row({ rules: undefined }))).toBeNull();
    expect(leagueGame(row({ sport: 'padel', rules: { game: 'valorant' } }))).toBeNull();
    // Las demás ligas quedan igual que antes (sin la llave).
    expect('game' in toLeague(row({ sport: 'bowling', rules: {} }))).toBe(false);
  });

  it('el calendario y «Tus torneos» lo llevan; las demás ligas no', () => {
    const val = asLeague(row());
    const bowling = { ...val, id: 'L1', name: 'Liga de los martes', sport: 'bowling', game: undefined } as League;
    const ev = (id: string, date: string, type = 'torneo') => ({ id, type, name: 'Copa', date }) as unknown as BowlingEvent;
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
    const items = upcomingCalendar([feed('L9', [ev('e9', '2026-10-15')]), feed('L1', [ev('e1', '2026-10-14')])], [val, bowling], '2026-10-11', 30);
    expect(items.map((i) => [i.lid, i.game])).toEqual([
      ['L1', undefined],
      ['L9', 'valorant'],
    ]);
    const tourneys = tourneysOf([val, bowling], items, '2026-10-11');
    expect(tourneys.find((t) => t.lid === 'L9')?.game).toBe('valorant');
    expect(tourneys.find((t) => t.lid === 'L1')?.game).toBeUndefined();

    const html = render(h(TourneyRow, { t: tourneys.find((t) => t.lid === 'L9')!, live: false, today: '2026-10-11' }));
    expect(html).toContain('>VAL</text>');
    expect(html).toContain('lucide-trophy');
    expect(labels(html)).toEqual(['Torneo de VALORANT']);
  });

  it('los partidos en vivo: el deporte en su color (no el verde de siempre) y el punto de «en vivo»', () => {
    const league = { ...asLeague(row({ sport: 'basketball', rules: {} })), name: 'Liga de baloncesto' };
    const item: LiveMatchItem<Match> = {
      match: { id: 'm1', sides: [{ side: 1, label: 'Tigres' }, { side: 2, label: 'Leones' }] } as unknown as Match,
      league,
      sport: 'basketball',
      href: '/l/L9/juegos?partido=m1',
      mine: false,
      title: 'Tigres vs. Leones',
      score: '54-50',
      detail: '',
    };
    const html = render(h(LiveMatchesCard, { items: [item, { ...item, match: { ...item.match, id: 'm2' }, league: asLeague(row()), sport: 'esports' }] }));
    expect(html).toContain('En juego ahora');
    expect(html).toContain('lucide-basketball');
    expect(html).toContain('mm-tint-basketball');
    expect(html).not.toContain('rounded-xl bg-ok-soft text-ok');
    expect(html.match(/live-dot absolute/g)).toHaveLength(2);
    expect(html).toContain('>VAL</text>');
    expect(labels(html)).toEqual(['Baloncesto', 'VALORANT']);
  });
});
