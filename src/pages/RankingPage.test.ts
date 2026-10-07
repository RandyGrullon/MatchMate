/**
 * La Tabla de la liga (rediseño «Calma y foco») dibujada sin navegador (renderToString), con los datos de la liga de
 * mentira (vi.mock):
 * - Lite: «‹ Liga», «Tabla» con «Promedio ▾», las fechas cortas, tu lugar («Vas 2.º de 6, con 195 · Pedro te lleva 24
 *   pinos»), la lista con «Tú» y la regla en una línea; sin Excel, sin columnas y sin récords.
 * - Pro: «Excel» y compartir, «Temporada ▾», Scratch | Con hcp, las columnas que se ordenan, la fórmula del hcp y los
 *   récords.
 * Y las marcas de los juegos («Récord personal», «+18 sobre tu promedio»).
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeagueContext, type LeagueCtx } from '../lib/league';
import type { Season } from '../lib/seasons';
import type { BowlingEvent, Entry, League, Player } from '../lib/types';
import { GameMarkBadges, MarksLine } from '../components/event/GameMarks';
import { FeedbackProvider } from '../components/feedback';

const world = vi.hoisted(() => ({
  pro: false,
  events: [] as BowlingEvent[],
  players: [] as Player[],
  entries: [] as Entry[],
  seasons: [] as Season[],
}));

vi.mock('../lib/data', async (orig) => {
  const ok = <T,>(data: T) => ({ data, loading: false, error: null });
  return {
    ...(await orig<typeof import('../lib/data')>()),
    useEvents: () => ok(world.events),
    usePlayers: () => ok(world.players),
    useEntriesOfEvents: () => ok(world.entries),
  };
});
vi.mock('../lib/data/seasons', async (orig) => ({
  ...(await orig<typeof import('../lib/data/seasons')>()),
  useLeagueSeasons: () => ({ data: world.seasons, loading: false, error: null }),
}));
vi.mock('../lib/useMode', async (orig) => ({
  ...(await orig<typeof import('../lib/useMode')>()),
  useIsPro: () => world.pro,
}));
// El escudo del título vigente lee los premios de la liga (aquí no hay servidor).
vi.mock('../components/badges/LeagueBadges', async (orig) => ({
  ...(await orig<typeof import('../components/badges/LeagueBadges')>()),
  useCurrentTitle: () => null,
  TitleMark: () => null,
}));

const { default: RankingPage } = await import('./RankingPage');

const league: League = {
  id: 'L1',
  name: 'Liga de los martes',
  visibility: 'private',
  ownerUid: 'u1',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: true,
};
const member = { uid: 'u1', role: 'owner', playerId: 'ana' } as unknown as LeagueCtx['member'];
const baseCtx: LeagueCtx = { lid: 'L1', league, member, isAdmin: true, isOwner: true, isScorer: false, canScore: true, myPlayerId: 'ana', base: '/l/L1' };

const season: Season = {
  id: 's26',
  name: 'Temporada 2026',
  startsOn: '2026-09-01',
  endsOn: '2026-12-15',
  status: 'active',
  closedAt: null,
  closedBy: null,
  standings: null,
  awards: [],
  playoffs: [],
};
const practice = (id: string, date: string): BowlingEvent => ({ id, type: 'practica', name: 'Práctica', date, games: 3, hcpBase: 0, hcpPercent: 0, teams: {}, playerCount: 6 });
const events = [practice('e1', '2026-09-08'), practice('e2', '2026-09-15'), practice('e3', '2026-09-22')];
const players: Player[] = [
  { id: 'ana', name: 'Ana Pérez', averageOverride: null },
  { id: 'pedro', name: 'Pedro Gómez', averageOverride: null },
  { id: 'luis', name: 'Luis Martínez', averageOverride: null },
  { id: 'sofia', name: 'Sofía Rodríguez', averageOverride: null },
  { id: 'carmen', name: 'Carmen Díaz', averageOverride: null },
  { id: 'jose', name: 'José Ramírez', averageOverride: null },
];
/** Tres juegos aprobados (con foto) del mismo puntaje en cada fecha. */
const played = (playerId: string, score: number, on: string[] = ['e1', 'e2', 'e3']): Entry[] =>
  on.map((eventId) => ({ id: `${playerId}-${eventId}`, eventId, playerId, teamId: null, average: 0, handicapOverride: null, scores: [score, score, score], photos: ['f', 'f', 'f'] }));
const allEntries = [
  ...played('pedro', 219),
  ...played('ana', 195),
  ...played('luis', 194),
  ...played('sofia', 173),
  ...played('carmen', 159),
  ...played('jose', 150, ['e1', 'e2']),
];

beforeEach(() => {
  world.pro = false;
  world.events = events;
  world.players = players;
  world.entries = allEntries;
  world.seasons = [season];
});

const render = (search = '', ctx: Partial<LeagueCtx> = {}) =>
  renderToString(
    h(
      MemoryRouter,
      { initialEntries: [`/l/L1/ranking${search}`] },
      h(FeedbackProvider, null, h(LeagueContext.Provider, { value: { ...baseCtx, ...ctx } }, h(RankingPage) as ReactNode)),
    ),
  );
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

describe('Tabla en Lite', () => {
  it('«Tabla» con «Promedio ▾», las fechas cortas, tu lugar con su barra, la lista con «Tú» y la regla', () => {
    const html = render();
    const t = text(html);
    expect(html).toContain('href="/l/L1"');
    expect(t).toContain('Liga de los martes');
    expect(t).toContain('Tabla');
    expect(html).toMatch(/<select aria-label="Ordenar la tabla por"/);
    for (const o of ['Promedio', 'Mejor juego', 'Mejor serie', 'Asistencia']) expect(html).toContain(`>${o}</option>`);
    expect(t).toContain('Temporada 2026 · 1 sep – 15 dic');
    expect(t).toContain('2.º');
    expect(t).toContain('Vas 2.º de 6, con 195');
    expect(t).toContain('Pedro te lleva 24 pinos');
    expect(t).toContain('Tú · 195');
    expect(t).toContain('1.º · Pedro 219');
    // La lista, en orden, con «Tú» solo en tu fila (y tu fila en acento suave).
    expect(t.indexOf('Pedro Gómez')).toBeLessThan(t.indexOf('Ana Pérez'));
    expect(t.indexOf('Ana Pérez')).toBeLessThan(t.indexOf('José Ramírez'));
    expect(html.match(/>Tú</g)).toHaveLength(1);
    expect(html).toContain('mm-row-me');
    expect(html).toContain('href="/l/L1/j/pedro"');
    expect(t).toContain('Cuentan los juegos aprobados · mínimo 6 para salir');
    // Lo de Pro no sale (ni la tabla de columnas, ni Excel, ni récords, ni el viejo podio).
    expect(html).not.toContain('role="columnheader"');
    expect(t).not.toContain('Excel');
    expect(t).not.toContain('Récords de la temporada');
    expect(t).not.toContain('Ranking de la liga');
  });

  it('«Mejor juego ▾»: tu lugar y la lista por el juego más alto, sin el mínimo de juegos', () => {
    world.entries = [...allEntries, { ...played('nuevo', 250, ['e3'])[0], scores: [250, null, null], photos: ['f', null, null] }];
    world.players = [...players, { id: 'nuevo', name: 'Nuevo Jugador', averageOverride: null }];
    const t = text(render('?ver=juego'));
    expect(t).toContain('Nuevo Jugador');
    expect(t).toContain('Vas 3.º de 7, con 195');
    expect(t).toContain('Nuevo te lleva 55 pinos');
    expect(t).toContain('Cuentan los juegos aprobados');
    expect(t).not.toContain('mínimo 6 para salir');
  });

  it('sin el mínimo todavía: cuántos juegos te faltan («3/6») y dónde irías', () => {
    world.entries = [...allEntries.filter((e) => e.playerId !== 'ana'), ...played('ana', 195, ['e1'])];
    const t = text(render());
    expect(t).toContain('3/6');
    expect(t).toContain('Te faltan 3 juegos para salir');
    expect(t).toContain('Con 195 de promedio irías 2.º');
    expect(t).not.toContain('Ana Pérez');
  });

  it('sin jugador en la liga no hay tarjeta; sin juegos, «Todavía no sale nadie»', () => {
    expect(text(render('', { myPlayerId: null }))).not.toContain('Vas ');
    world.entries = [];
    const t = text(render('', { myPlayerId: null }));
    expect(t).toContain('Todavía no sale nadie');
    expect(t).toContain('Hace falta tener al menos 6 juegos aprobados en Temporada 2026.');
  });
});

describe('Tabla en Pro', () => {
  beforeEach(() => {
    world.pro = true;
  });

  it('Excel y compartir arriba, «Temporada ▾», Scratch | Con hcp, las columnas y la fórmula del hcp', () => {
    const html = render();
    const t = text(html);
    expect(t).toContain('Excel');
    expect(html).toContain('aria-label="Compartir la tabla"');
    expect(html).toMatch(/<select aria-label="Temporada"/);
    expect(html).toContain('Ver todas las temporadas…');
    expect(html).toMatch(/aria-checked="true"[^>]*>Scratch/);
    expect(t).toContain('Con hcp');
    for (const c of ['Jugador', 'Juegos', 'Promedio', 'Handicap', 'Juego más alto', 'Mejor serie', 'Asistencia']) expect(html).toContain(`aria-label="Ordenar por ${c}"`);
    expect(html).toMatch(/role="columnheader" aria-sort="descending"[^>]*><button[^>]*aria-label="Ordenar por Promedio"/);
    expect(t).toContain('Pedro G.');
    expect(t).toContain('Ana P.');
    expect(t).toContain('Toca una columna para ordenar');
    expect(t).toContain('Desliza');
    expect(t).toContain('Hcp = 80% de (230 − prom.) · mín. 6 juegos');
    expect(t).toContain('Récords de la temporada');
    expect(t).toMatch(/Mejor juego 219 Pedro G\./);
    expect(t).toMatch(/Asistencia 3\/3 Ana y 4 más/);
    // La tarjeta de Lite no sale.
    expect(t).not.toContain('Vas 2.º');
  });

  it('?hcp=1&ver=juego: «Con hcp» elegido y ordenada por Alto, con el handicap sumado', () => {
    const html = render('?hcp=1&ver=juego');
    expect(html).toMatch(/aria-checked="true"[^>]*>Con hcp/);
    expect(html).toMatch(/role="columnheader" aria-sort="descending"[^>]*><button[^>]*aria-label="Ordenar por Juego más alto"/);
    // Pedro: 219 + 8 de hcp (80 % de 230 − 219); la serie, + 3 × 8.
    expect(text(html)).toMatch(/1 Pedro G\. 9 227 8 227 681 3\/3/);
  });

  it('sin ser miembro (una liga pública) no hay Excel', () => {
    expect(text(render('', { member: null, myPlayerId: null }))).not.toContain('Excel');
  });
});

describe('marcas de los juegos', () => {
  it('«Récord personal» y «+18 sobre tu promedio» (o «su» en el de otro)', () => {
    const r = (node: ReactNode) => renderToString(h(MemoryRouter, null, node));
    const mine = text(r(h(GameMarkBadges, { mark: { record: true, over: 18 } })));
    expect(mine).toContain('Récord personal');
    expect(mine).toContain('+18 sobre tu promedio');
    expect(text(r(h(GameMarkBadges, { mark: { record: false, over: 22 }, mine: false })))).toContain('+22 sobre su promedio');
    expect(r(h(GameMarkBadges, { mark: { record: false, over: null } }))).toBe('');
    expect(text(r(h(MarksLine, { marks: [null, { record: true, over: null }] })))).toContain('Récord personal');
    expect(r(h(MarksLine, { marks: null }))).toBe('');
  });
});
