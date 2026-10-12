/**
 * «Dónde juega» (src/components/places) sin navegador: los bloques por deporte o juego, los equipos y los equipos de
 * esports, cada fila con su línea y su link a su perfil ahí; vacío (para ti y para otro), cargando, «Ver todo»; y «Ver su
 * perfil» debajo de la página de un jugador en la liga.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerPlaces as Places } from '../../lib/data/places';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { League, Player } from '../../lib/types';

const state = vi.hoisted(() => ({
  places: { data: null as unknown, loading: false, error: null as Error | null },
  players: [] as Player[],
  auth: { user: { uid: 'u-me' } as { uid: string } | null },
}));

vi.mock('../../lib/data/places', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/places')>()),
  usePlayerPlaces: () => state.places,
}));
vi.mock('../../lib/data/players', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/players')>()),
  usePlayers: () => ({ data: state.players, loading: false, error: null }),
}));
vi.mock('../../lib/auth', async (orig) => ({ ...(await orig<typeof import('../../lib/auth')>()), useAuth: () => state.auth }));

const { PlayerPlaces } = await import('./PlayerPlaces');
const { PlayerAccountLink, playerAccountPath } = await import('./PlayerAccountLink');
const { esportsRowLine, firstRows, leagueRowLine, placeCount, placeSections, squadRowLine } = await import('./logic');

const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, el));
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const places = (extra: Partial<Places> = {}): Places => ({
  leagues: [
    {
      leagueId: 'L1',
      name: 'Liga de los martes',
      kind: 'liga',
      sport: 'bowling',
      game: null,
      logo: null,
      visibility: 'public',
      playerId: 'p1',
      summary: { kind: 'bowling', games: 24, average: 182.4, high: 245 },
    },
    {
      leagueId: 'L2',
      name: 'Pádel del Club',
      kind: 'liga',
      sport: 'padel',
      game: null,
      logo: null,
      visibility: 'private',
      playerId: 'p2',
      summary: { kind: 'matches', played: 15, won: 12, drawn: 0, lost: 3 },
    },
    {
      leagueId: 'L3',
      name: 'Copa de verano',
      kind: 'torneo',
      sport: 'bowling',
      game: null,
      logo: null,
      visibility: 'public',
      playerId: 'p3',
      summary: { kind: 'bowling', games: 0, average: null, high: null },
    },
    {
      leagueId: 'L4',
      name: 'Radiant Cup',
      kind: 'torneo',
      sport: 'esports',
      game: 'valorant',
      logo: null,
      visibility: 'public',
      playerId: 'p4',
      summary: { kind: 'matches', played: 3, won: 2, drawn: 1, lost: 0 },
    },
  ],
  squads: [
    { id: 'S1', sport: 'football', name: 'Los Tigres', tag: 'TGR', logo: null, color: '#dc2626', city: null, recruiting: false, members: 9, followers: 2, role: 'captain' },
  ],
  esportsTeams: [{ id: 'E1', game: 'valorant', name: 'Radiantes', tag: 'RAD', logo: null, role: 'sub' }],
  ...extra,
});

const league = (extra: Partial<League> = {}): League =>
  ({ id: 'L1', name: 'Liga de los martes', kind: 'liga', visibility: 'public', sport: 'bowling', hasMinors: false, ...extra }) as League;
const ctx = (extra: Partial<LeagueCtx> = {}): LeagueCtx => ({
  lid: 'L1',
  league: league(),
  member: null,
  isAdmin: false,
  isOwner: false,
  isScorer: false,
  canScore: false,
  myPlayerId: null,
  base: '/l/L1',
  ...extra,
});
const inLeague = (c: LeagueCtx, el: ReactElement) => render(h(LeagueContext.Provider, { value: c }, el));

beforeEach(() => {
  state.places = { data: places(), loading: false, error: null };
  state.players = [];
  state.auth = { user: { uid: 'u-me' } };
});

describe('las partes de «Dónde juega»', () => {
  it('un bloque por deporte (boliche junto, cada juego de esports aparte), Equipos y Equipos de esports', () => {
    const s = placeSections(places(), 'u-ana');
    expect(s.map((x) => x.label)).toEqual(['Boliche', 'Pádel', 'VALORANT', 'Equipos', 'Equipos de esports']);
    expect(s[0].rows.map((r) => r.title)).toEqual(['Liga de los martes', 'Copa de verano']);
    expect(s[2]).toMatchObject({ sport: 'esports', game: 'valorant', key: 'esports:valorant' });
    // Cada fila lleva a su perfil en ese lugar.
    expect(s[0].rows[0].to).toBe('/l/L1/j/p1');
    expect(s[3].rows[0].to).toBe('/equipos/S1?jugador=u-ana');
    expect(s[4].rows[0].to).toBe('/esports/equipo/E1');
    expect(placeCount(s)).toBe(6);
  });

  it('las líneas: liga o torneo con sus números, el deporte y el papel', () => {
    expect(leagueRowLine(places().leagues[0])).toBe('Liga · Promedio 182 · 24 juegos');
    expect(leagueRowLine(places().leagues[1])).toBe('Liga · 12 G · 3 P');
    expect(leagueRowLine(places().leagues[2])).toBe('Torneo · Sin juegos todavía');
    expect(leagueRowLine(places().leagues[3])).toBe('Torneo · 2 G · 1 E · 0 P');
    expect(squadRowLine({ sport: 'football', role: 'captain' })).toBe('Fútbol · Capitán');
    expect(squadRowLine({ sport: 'football', role: 'member' })).toBe('Fútbol');
    expect(esportsRowLine({ game: 'valorant', role: 'sub' })).toBe('VALORANT · Suplente');
  });

  it('sin equipos no salen sus bloques; las primeras filas cortan en orden', () => {
    expect(placeSections(places({ squads: [], esportsTeams: [] }), 'u').map((x) => x.kind)).toEqual(['sport', 'sport', 'sport']);
    const cut = firstRows(placeSections(places(), 'u'), 3);
    expect(cut.map((x) => [x.label, x.rows.length])).toEqual([
      ['Boliche', 2],
      ['Pádel', 1],
    ]);
    expect(firstRows([], 4)).toEqual([]);
  });
});

describe('PlayerPlaces', () => {
  it('de otra persona: «Dónde juega», los bloques con su cuadro, las filas y sus links', () => {
    const html = render(h(PlayerPlaces, { uid: 'u-ana', name: 'Ana Pérez', limit: 10 }));
    const t = text(html);
    expect(t).toContain('Dónde juega');
    expect(t).toContain('Boliche');
    expect(t).toContain('Liga de los martes');
    expect(t).toContain('Liga · Promedio 182 · 24 juegos');
    expect(t).toContain('Pádel del Club');
    expect(t).toContain('Radiant Cup');
    expect(t).toContain('Los Tigres [TGR]');
    expect(t).toContain('Fútbol · Capitán');
    expect(t).toContain('Radiantes [RAD]');
    expect(t).toContain('VALORANT · Suplente');
    expect(html).toContain('href="/l/L1/j/p1"');
    expect(html).toContain('href="/l/L2/j/p2"');
    expect(html).toContain('href="/equipos/S1?jugador=u-ana"');
    expect(html).toContain('href="/esports/equipo/E1"');
    expect(html.match(/data-place-group=/g)).toHaveLength(5);
    // Sin «Ver todo» si caben todas.
    expect(t).not.toContain('Ver todo');
  });

  it('con muchas: las primeras y «Ver todo (N)»', () => {
    const html = render(h(PlayerPlaces, { uid: 'u-ana', limit: 2 }));
    const t = text(html);
    expect(t).toContain('Ver todo (6)');
    expect(html).toContain('aria-expanded="false"');
    expect(t).toContain('Copa de verano');
    expect(t).not.toContain('Pádel del Club');
    expect(t).not.toContain('Los Tigres');
  });

  it('en Yo: «Dónde juego»; vacío con «Buscar ligas»', () => {
    expect(text(render(h(PlayerPlaces, { uid: 'u-me', isMe: true })))).toContain('Dónde juego');
    state.places = { data: places({ leagues: [], squads: [], esportsTeams: [] }), loading: false, error: null };
    const mine = render(h(PlayerPlaces, { uid: 'u-me', isMe: true }));
    expect(text(mine)).toContain('Todavía no juegas en ninguna liga ni equipo.');
    expect(mine).toContain('href="/ligas"');
    const other = text(render(h(PlayerPlaces, { uid: 'u-ana', name: 'Ana Pérez' })));
    expect(other).toContain('Ana todavía no juega en ligas o equipos que puedas ver.');
  });

  it('cargando: el título con su hueco; sin datos ni error (te bloqueó): nada', () => {
    state.places = { data: null, loading: true, error: null };
    const html = render(h(PlayerPlaces, { uid: 'u-ana' }));
    expect(html).toContain('aria-busy="true"');
    expect(text(html)).toContain('Dónde juega');
    state.places = { data: null, loading: false, error: null };
    expect(render(h(PlayerPlaces, { uid: 'u-ana' }))).toBe('');
    state.places = { data: null, loading: false, error: new Error('red') };
    expect(text(render(h(PlayerPlaces, { uid: 'u-ana' })))).toContain('Reintentar');
  });
});

describe('«Ver su perfil» en la página de un jugador', () => {
  const ana: Player = { id: 'p1', name: 'Ana Pérez', averageOverride: null, uid: 'u-ana' };

  it('a dónde lleva: su perfil, el tuyo a Yo, y nada sin cuenta o si es menor', () => {
    expect(playerAccountPath(ana, 'u-me')).toBe('/u/u-ana');
    expect(playerAccountPath(ana, 'u-ana')).toBe('/perfil');
    expect(playerAccountPath({ uid: null }, 'u-me')).toBeNull();
    expect(playerAccountPath({ uid: 'u-kid', isMinor: true }, 'u-me')).toBeNull();
    expect(playerAccountPath(undefined, 'u-me')).toBeNull();
  });

  it('con cuenta: «Ver su perfil»; la tuya: «Ver mi perfil completo»; sin cuenta o menor: nada', () => {
    state.players = [ana, { id: 'p2', name: 'Sin Cuenta', averageOverride: null, uid: null }, { id: 'p3', name: 'Niño', averageOverride: null, uid: 'u-kid', isMinor: true }];
    const html = inLeague(ctx(), h(PlayerAccountLink, { playerId: 'p1' }));
    expect(text(html)).toContain('Ver su perfil');
    expect(text(html)).toContain('Todo lo de Ana');
    expect(html).toContain('href="/u/u-ana"');
    state.auth = { user: { uid: 'u-ana' } };
    const mine = inLeague(ctx(), h(PlayerAccountLink, { playerId: 'p1' }));
    expect(text(mine)).toContain('Ver mi perfil completo');
    expect(mine).toContain('href="/perfil"');
    expect(inLeague(ctx(), h(PlayerAccountLink, { playerId: 'p2' }))).toBe('');
    expect(inLeague(ctx(), h(PlayerAccountLink, { playerId: 'p3' }))).toBe('');
  });

  it('en una liga con menores, solo para sus miembros', () => {
    state.players = [ana];
    const kids = league({ hasMinors: true, visibility: 'private' });
    expect(inLeague(ctx({ league: kids }), h(PlayerAccountLink, { playerId: 'p1' }))).toBe('');
    const member = { id: 'L1_u-me', leagueId: 'L1', uid: 'u-me', name: 'Yo', role: 'member', playerId: null } as LeagueCtx['member'];
    expect(text(inLeague(ctx({ league: kids, member }), h(PlayerAccountLink, { playerId: 'p1' })))).toContain('Ver su perfil');
  });
});
