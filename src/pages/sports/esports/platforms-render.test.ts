/**
 * El torneo y la hoja de inscribirse con la plataforma (docs/perfiles-equipos-esports.md §4), dibujados en el servidor
 * (renderToString) con los datos en la caché: «Rocket League · PlayStation» arriba y en la info; la tarjeta del ID que
 * se toca para cambiar la cuenta (con la vuelta al torneo); lo que pide el torneo y el bloqueo antes de llamar a la base
 * («Tu ID es de PC y el torneo es de PlayStation», «Di dónde juegas Rocket League»); NBA 2K por plataforma; la plantilla
 * con «Otra plataforma» y «Sin plataforma»; y ya inscrito, «Actualizar mi ID en la inscripción».
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../../lib/data/client';
import { esportsKeys, type EsportsEntry, type EsportsTournament } from '../../../lib/data/esports';
import { esportsIdKeys, type GameIdRecord } from '../../../lib/data/esportsIds';
import { matchKeys } from '../../../lib/data/matches';
import { sortedKey } from '../../../lib/data/keys';
import { LeagueContext, type LeagueCtx } from '../../../lib/league';
import type { League } from '../../../lib/types';
import { defaultSettings, type GameId, type Mode } from '../../../sports/esports';
import { FeedbackProvider } from '../../../components/feedback';
import { RegisterSheet } from './register/RegisterSheet';
import screens from './screens';
import { mkEntry, mkMember, mkTournament, uid } from './testData';

const state = vi.hoisted(() => ({ user: '00000000-0000-4000-8000-000000000001' as string | null }));
vi.mock('../../../lib/useMode', async (orig) => ({
  ...(await orig<typeof import('../../../lib/useMode')>()),
  useIsPro: () => false,
  useMode: () => ({ mode: 'lite', isPro: false, setMode: async () => 'local', suggestedPro: false }),
}));
vi.mock('../../../lib/auth', async (orig) => ({
  ...(await orig<typeof import('../../../lib/auth')>()),
  useAuth: () => ({ user: state.user ? { uid: state.user, email: 'x@x.com', displayName: 'Cuenta' } : null, profile: null, isSuper: false, loading: false, recovering: false }),
}));
afterEach(() => {
  state.user = ME;
});

const ME = uid(1);
const L = 'L1';
const league: League = {
  id: L,
  name: 'Copa RL',
  kind: 'torneo',
  visibility: 'public',
  ownerUid: 'u-org',
  venue: 'Online',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport: 'esports',
  tz: 'America/Santo_Domingo',
};
const ctx: LeagueCtx = { lid: L, league, member: null, isAdmin: false, isOwner: false, isScorer: false, canScore: false, myPlayerId: null, base: `/l/${L}` };

const rec = (over: Partial<GameIdRecord> = {}): GameIdRecord => ({
  userId: ME,
  game: 'rocket_league',
  platform: '',
  platforms: [],
  region: '',
  idDisplay: 'AnaRL',
  status: 'pendiente',
  ownership: 'declarado',
  ranks: {},
  rankSource: 'declarado',
  verifiedAt: null,
  confirmedAt: null,
  updatedAt: null,
  ...over,
});

/** Un torneo en inscripción de ese juego con esa plataforma. */
function tour(eventId: string, game: GameId, mode: Mode, platform: string, over: Partial<EsportsTournament> = {}): EsportsTournament {
  const settings = { ...defaultSettings(game, mode, 'single_elim'), platform };
  return mkTournament({ eventId, name: `Copa ${eventId}`, game, mode, format: 'single_elim', entryType: mode === '1v1' ? 'open' : 'teams', settings, ...over });
}

const solo = tour('P1', 'rocket_league', '1v1', 'playstation');
const team = tour('P2', 'rocket_league', '3v3', 'playstation');
const nba = tour('P3', 'nba_2k', '1v1', 'playstation');
const cross = tour('P4', 'rocket_league', '1v1', 'crossplay');

function setMyIds(list: GameIdRecord[]) {
  queryClient.setQueryData(esportsIdKeys.mine(ME), list);
}

beforeAll(() => {
  for (const t of [solo, team, nba, cross]) {
    queryClient.setQueryData(esportsKeys.tournament(t.eventId), t);
    queryClient.setQueryData(esportsKeys.entries(t.eventId), []);
    queryClient.setQueryData(esportsKeys.links(t.eventId), []);
    queryClient.setQueryData(matchKeys.event(t.eventId), []);
  }
  // El capitán con su equipo de Rocket League: Bea juega en PC, Caro no dijo dónde, Dani en PlayStation.
  queryClient.setQueryData(esportsKeys.myTeams(ME), [{ id: 'TEAM1', game: 'rocket_league', name: 'Turbo', tag: 'TRB', description: '', logoPath: null, captainId: ME, memberCount: 4, createdAt: null, updatedAt: null, myRole: 'captain' }]);
  const roster = [ME, uid(2), uid(3), uid(4)];
  queryClient.setQueryData(esportsKeys.team('TEAM1'), {
    team: { id: 'TEAM1', game: 'rocket_league', name: 'Turbo', tag: 'TRB', description: '', logoPath: null, captainId: ME, memberCount: 4, createdAt: null, updatedAt: null },
    members: roster.map((u, i) => ({ teamId: 'TEAM1', userId: u, role: i === 0 ? 'captain' : 'member', displayName: ['Ana', 'Bea', 'Caro', 'Dani'][i], joinedAt: '' })),
  });
  queryClient.setQueryData(esportsIdKeys.of('rocket_league', sortedKey(roster)), [
    rec({ platforms: ['playstation'] }),
    rec({ userId: uid(2), idDisplay: 'BeaRL', platforms: ['pc'] }),
    rec({ userId: uid(3), idDisplay: 'CaroRL', platforms: [] }),
    rec({ userId: uid(4), idDisplay: 'DaniRL', platforms: ['playstation', 'xbox'] }),
  ]);
});
afterAll(() => queryClient.invalidateAll());

function render(el: ReactElement, path = `/l/${L}/e/P1`): string {
  return renderToString(h(MemoryRouter, { initialEntries: [path] }, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx }, el))));
}
const sheet = (t: EsportsTournament, entry: EsportsEntry | null = null) => render(h(RegisterSheet, { open: true, onClose: () => {}, t, entry }), `/l/${L}/e/${t.eventId}`);
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
/** Cuántas veces dice «Inscribirme»: el título de la hoja y, si deja, el botón. */
const registerCount = (t: string) => t.split('Inscribirme').length - 1;
/** El link a Mi ID de juego con la plataforma del torneo y la vuelta (un torneo suelto vuelve a /l/:lid). */
const idHref = (game: string, platform?: string) => `href="/esports/mi-id?juego=${game}${platform ? `&amp;plataforma=${platform}` : ''}&amp;volver=${encodeURIComponent(`/l/${L}`)}"`;

describe('el torneo dice su plataforma', () => {
  it('arriba «Rocket League · PlayStation» y en la info «Plataforma»', () => {
    setMyIds([rec({ platforms: ['playstation'] })]);
    const t = text(render(h(Routes, null, h(Route, { path: '/l/:lid/e/:eventId', element: h(screens.Event) })), `/l/${L}/e/P1`));
    expect(t).toContain('Rocket League · PlayStation · 1 contra 1 · Eliminación simple · Libre');
    const info = text(render(h(Routes, null, h(Route, { path: '/l/:lid/e/:eventId', element: h(screens.Event) })), `/l/${L}/e/P4?ver=info`));
    expect(info).toContain('Plataforma Crossplay (PC, PlayStation, Xbox y Nintendo Switch)');
  });
});

describe('inscribirse con la plataforma del torneo', () => {
  it('el ID sirve: la tarjeta que se toca («Cambiar cuenta», con la vuelta), dónde juega, lo que pide y «Inscribirme»', () => {
    setMyIds([rec({ platforms: ['playstation', 'pc'] })]);
    const html = sheet(solo);
    const t = text(html);
    expect(t).toContain('AnaRL');
    expect(t).toContain('PC y PlayStation');
    expect(t).toContain('Cambiar cuenta');
    expect(html).toContain(idHref('rocket_league', 'playstation'));
    expect(html).toContain('aria-label="Tu Epic ID: AnaRL. Cambiar cuenta"');
    expect(t).toContain('Este torneo es de PlayStation.');
    expect(registerCount(t)).toBe(2);
  });

  it('su ID es de PC: lo dice y no deja inscribirse; «Cambiar mi ID» lleva a Mi ID con PlayStation', () => {
    setMyIds([rec({ platforms: ['pc'] })]);
    const html = sheet(solo);
    const t = text(html);
    expect(t).toContain('Tu ID es de PC y el torneo es de PlayStation.');
    expect(t).toContain('Cambiar mi ID');
    expect(registerCount(t)).toBe(1);
    expect(html).toContain(idHref('rocket_league', 'playstation'));
  });

  it('no dijo dónde juega: «Di dónde juegas Rocket League» con lo que pide el torneo', () => {
    setMyIds([rec()]);
    const t = text(sheet(solo));
    expect(t).toContain('Sin plataforma');
    expect(t).toContain('Di dónde juegas Rocket League. Este torneo es de PlayStation.');
    expect(t).toContain('Decir dónde juego');
    expect(registerCount(t)).toBe(1);
    // Crossplay: entra con cualquiera (también sin decirlo).
    const c = text(sheet(cross));
    expect(c).toContain('Este torneo es crossplay: entra gente de PC, PlayStation, Xbox y Nintendo Switch.');
    expect(registerCount(c)).toBe(2);
  });

  it('sin ID: «Primero pon tu ID…» con lo que pide el torneo y «Poner»', () => {
    setMyIds([]);
    const html = sheet(solo);
    const t = text(html);
    expect(t).toContain('Primero pon tu ID de Rocket League. Este torneo es de PlayStation.');
    expect(t).toContain('Poner mi ID');
    expect(html).toContain('aria-label="Poner tu Epic ID"');
  });

  it('NBA 2K: el ID de la plataforma del torneo; con solo el de PC, «Tu ID es de PC…»', () => {
    setMyIds([rec({ game: 'nba_2k', platform: 'steam', idDisplay: 'AnaPC' })]);
    const html = sheet(nba);
    const t = text(html);
    expect(t).toContain('AnaPC');
    expect(t).toContain('Tu ID es de PC y el torneo es de PlayStation.');
    expect(html).toContain(idHref('nba_2k', 'playstation'));
    setMyIds([rec({ game: 'nba_2k', platform: 'steam', idDisplay: 'AnaPC' }), rec({ game: 'nba_2k', platform: 'psn', idDisplay: 'AnaPS' })]);
    const ok = text(sheet(nba));
    expect(ok).toContain('AnaPS');
    expect(registerCount(ok)).toBe(2);
  });

  it('con equipo: cada miembro con «Otra plataforma (PC)» o «Sin plataforma»; lo que pide el torneo arriba', () => {
    setMyIds([rec({ platforms: ['playstation'] })]);
    const t = text(sheet(team));
    expect(t).toContain('Inscribir mi equipo');
    expect(t).toContain('Este torneo es de PlayStation.');
    expect(t).toContain('Bea Otra plataforma (PC)');
    expect(t).toContain('Caro Sin plataforma');
    expect(t).toContain('Dani DaniRL');
    expect(t).toContain('Inscribir a Turbo');
  });
});

describe('ya inscrito: «Actualizar mi ID en la inscripción»', () => {
  const entry = (gamerTag: string) => mkEntry('IN1', 'Ana', { eventId: 'P1', kind: 'player', captainId: ME, status: 'pending', members: [mkMember(ME, 'Ana', 'captain', { gamerTag })] });

  it('su ID de ahora no es el de la inscripción: lo dice y ofrece actualizarlo; si es el mismo, no', () => {
    queryClient.setQueryData(esportsIdKeys.of('rocket_league', sortedKey([ME])), [rec({ idDisplay: 'AnaNueva', platforms: ['playstation'] })]);
    const t = text(sheet(solo, entry('AnaVieja')));
    expect(t).toContain('Tu inscripción');
    expect(t).toContain('Ahora tu ID es AnaNueva; en la inscripción quedó AnaVieja.');
    expect(t).toContain('Actualizar mi ID en la inscripción');
    expect(t).toContain('Cambiar mi cuenta del juego');
    const same = text(sheet(solo, entry('AnaNueva')));
    expect(same).not.toContain('Actualizar mi ID en la inscripción');
    expect(same).toContain('Cambiar mi cuenta del juego');
    // Con el torneo ya empezado, nada de eso.
    const started = text(sheet({ ...solo, status: 'live' }, entry('AnaVieja')));
    expect(started).not.toContain('Actualizar mi ID');
    expect(started).not.toContain('Cambiar mi cuenta del juego');
  });

  it('el capitán: si alguien de la plantilla cambió su ID, «Actualizar los IDs en la inscripción»', () => {
    const members = [mkMember(ME, 'Ana', 'captain', { gamerTag: 'AnaRL' }), mkMember(uid(4), 'Dani', 'member', { gamerTag: 'DaniViejo' })];
    queryClient.setQueryData(esportsIdKeys.of('rocket_league', sortedKey([ME, uid(4)])), [rec({ platforms: ['playstation'] }), rec({ userId: uid(4), idDisplay: 'DaniRL', platforms: ['playstation'] })]);
    const t = text(sheet(team, mkEntry('IN2', 'Turbo', { eventId: 'P2', kind: 'team', teamId: 'TEAM1', captainId: ME, status: 'approved', members })));
    expect(t).toContain('Alguien de la plantilla cambió su ID después de inscribirse.');
    expect(t).toContain('Actualizar los IDs en la inscripción');
  });
});
