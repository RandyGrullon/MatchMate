/**
 * Humo de las pantallas de torneos de esports (docs/esports.md §12.7 y §12.8): se dibujan en el servidor
 * (renderToString, sin navegador) con los datos en la caché, para un visitante, un capitán con su serie por anotar, quien
 * organiza en Pro (y en Lite) con inscripciones pendientes, un battle royale con su tabla, la hoja del partido de
 * VALORANT, Rocket League y EA SPORTS FC, los grupos, el inicio de una liga de esports, la hoja de inscribirse y el
 * asistente de crear torneo. Atrapa errores al dibujar y textos que faltan.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../../lib/data/client';
import { esportsKeys, type EsportsTournament } from '../../../lib/data/esports';
import { esportsIdKeys, type GameIdRecord } from '../../../lib/data/esportsIds';
import { matchKeys, type Match } from '../../../lib/data/matches';
import { seasonTeamKeys } from '../../../lib/data/seasonTeams';
import { teamSportKeys } from '../../../lib/data/teamSports';
import { sortedKey } from '../../../lib/data/keys';
import { LeagueContext, type LeagueCtx } from '../../../lib/league';
import type { League, Member } from '../../../lib/types';
import { defaultSettings, doubleEliminationPlan, groupsPlan } from '../../../sports/esports';
import { FeedbackProvider } from '../../../components/feedback';
import CreateTournamentPage from '../../esports/CreateTournamentPage';
import { emptyForm } from '../../esports/create/logic';
import { EntryStep, FormatFields } from '../../esports/create/steps';
import { EditTournamentSheet } from './admin/EditTournamentSheet';
import { RegisterSheet } from './register/RegisterSheet';
import screens from './screens';
import { mkBrGame, mkEntry, mkMember, mkTournament, played, stageFromPlan, uid } from './testData';

// El modo de la app (Pro por defecto) y la cuenta (cambian por prueba).
const state = vi.hoisted(() => ({ pro: true, user: '00000000-0000-4000-8000-000000000001' as string | null }));
vi.mock('../../../lib/useMode', async (orig) => ({
  ...(await orig<typeof import('../../../lib/useMode')>()),
  useIsPro: () => state.pro,
  useMode: () => ({ mode: state.pro ? 'pro' : 'lite', isPro: state.pro, setMode: async () => 'local', suggestedPro: false }),
}));
vi.mock('../../../lib/auth', async (orig) => ({
  ...(await orig<typeof import('../../../lib/auth')>()),
  useAuth: () => ({
    user: state.user ? { uid: state.user, email: 'x@x.com', displayName: 'Cuenta' } : null,
    profile: null,
    isSuper: false,
    loading: false,
    recovering: false,
  }),
}));
afterEach(() => {
  state.pro = true;
  state.user = '00000000-0000-4000-8000-000000000001';
  vi.unstubAllGlobals();
});

const CAP = uid(1);
const L = 'L1';
const league = (over: Partial<League> = {}): League => ({
  id: L,
  name: 'Copa VALORANT',
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
  ...over,
});
const org: Member = { id: `${L}_u-org`, leagueId: L, uid: 'u-org', name: 'Org', role: 'owner', playerId: null };
const ctx = (over: Partial<LeagueCtx> = {}): LeagueCtx => ({
  lid: L,
  league: league(),
  member: null,
  isAdmin: false,
  isOwner: false,
  isScorer: false,
  canScore: false,
  myPlayerId: null,
  base: `/l/${L}`,
  ...over,
});
const ORG = ctx({ member: org, isAdmin: true, isOwner: true, canScore: true });

// ---- Torneo de VALORANT, doble eliminación, en curso, con 4 equipos y el cuadro armado ----
const names = { a: 'Alfa', b: 'Beta', c: 'Gama', d: 'Delta' };
const live = mkTournament({ eventId: 'E1', name: 'Copa VALORANT', status: 'live', maxEntries: 8 });
const teams = [
  mkEntry('a', 'Alfa', { seed: 1, tag: 'ALF', captainId: CAP, members: [mkMember(CAP, 'Capi', 'captain'), mkMember(uid(2), 'Rosa')] }),
  mkEntry('b', 'Beta', { seed: 2, tag: 'BET', captainId: 'u-b' }),
  mkEntry('c', 'Gama', { seed: 3, captainId: 'u-c' }),
  mkEntry('d', 'Delta', { seed: 4, captainId: 'u-d' }),
];
const plan = doubleEliminationPlan(['a', 'b', 'c', 'd'], { bracketReset: true, bestOf: 1, finalBestOf: 3 });
const stage = stageFromPlan({ ...plan, kind: 'bracket' }, names);
// W1-2 ya se jugó (Beta 13-5 Gama) y está confirmada; la base puso a Beta en W2-1 y a Gama en L1-1.
const bracketMatches: Match[] = stage.matches.map((m) => {
  if (m.bracketKey === 'W1-2') return played(m, [{ a: 13, b: 5 }]);
  return m;
});

// ---- Torneo en inscripción (visitante y organizador) ----
const open = mkTournament({ eventId: 'E2', name: 'Liga abierta', status: 'registration', maxEntries: 8 });
const openEntries = [
  mkEntry('p1', 'Pumas', { eventId: 'E2', seed: null, captainId: 'u-p1' }),
  mkEntry('p2', 'Lobos', { eventId: 'E2', seed: null, captainId: 'u-p2' }),
  mkEntry('p3', 'Halcones', { eventId: 'E2', status: 'pending', sideTeamId: null, captainId: 'u-p3', members: [mkMember('u-p3', 'Hugo', 'captain')] }),
];

// ---- Battle royale de Free Fire (escuadras) ----
const br = mkTournament({ eventId: 'E3', name: 'Free Fire Cup', game: 'free_fire', mode: 'squad', format: 'br', settings: defaultSettings('free_fire', 'squad', 'br'), status: 'live', maxEntries: 12 });
const brEntries = [mkEntry('f1', 'Fénix', { eventId: 'E3' }), mkEntry('f2', 'Cobras', { eventId: 'E3' }), mkEntry('f3', 'Toros', { eventId: 'E3' })];
const brGames = [
  mkBrGame('g1', 1, 1, [
    { entryId: 'f1', placement: 1, kills: 3 },
    { entryId: 'f2', placement: 2, kills: 6 },
    { entryId: 'f3', placement: 3, kills: 0 },
  ]),
];

// ---- EA SPORTS FC, grupos + playoffs, con un empate ----
const fc = mkTournament({ eventId: 'E4', name: 'Copa FC', game: 'ea_fc', mode: '1v1', format: 'groups_playoffs', entryType: 'open', settings: { ...defaultSettings('ea_fc', '1v1', 'groups_playoffs'), groups: 1 }, status: 'live' });
const fcEntries = ['x1', 'x2', 'x3', 'x4'].map((id, i) => mkEntry(id, ['Ana', 'Beto', 'Caro', 'Dani'][i], { eventId: 'E4', kind: 'player' }));
const fcPlan = groupsPlan(['x1', 'x2', 'x3', 'x4'], { groups: 1, double: false, bestOf: 1 });
const fcStage = stageFromPlan(fcPlan, { x1: 'Ana', x2: 'Beto', x3: 'Caro', x4: 'Dani' }, 'ea_fc');
const fcMatches: Match[] = fcStage.matches.map((m, i): Match => (i === 0 ? { ...m, status: 'confirmed', score: { text: '2-2', sides: [0, 0], totals: { maps: [0, 0], points: [2, 2] }, games: [{ a: 2, b: 2 }], bestOf: 1 }, winner: null } : m));
const fcRules = { game: 'ea_fc', bestOf: 1, draws: true };

const RL_MATCH: Match = { ...stage.matches[0], id: 'rl1', eventId: 'E1', format: 'rocket_league', rules: { game: 'rocket_league', bestOf: 5, draws: false }, stage: 'Final', sides: [{ side: 1, teamId: 'T-a', label: 'Alfa', seed: 1, players: [] }, { side: 2, teamId: 'T-b', label: 'Beta', seed: 2, players: [] }] };

const ids = (game: 'valorant', list: { user: string; status: GameIdRecord['status'] }[]): GameIdRecord[] =>
  list.map(({ user, status }) => ({
    userId: user,
    game,
    platform: '',
    region: '',
    idDisplay: `${user.slice(-2)}#LAN`,
    status,
    // Comprobado = Riot lo encontró; si no, declarado.
    ownership: status === 'confirmado' ? 'busqueda' : 'declarado',
    ranks: {},
    rankSource: 'declarado',
    verifiedAt: null,
    confirmedAt: null,
    updatedAt: null,
  }));

beforeAll(() => {
  const put = (t: EsportsTournament, entries: unknown[], matches: Match[], links: unknown[], games: unknown[] = []) => {
    queryClient.setQueryData(esportsKeys.tournament(t.eventId), t);
    queryClient.setQueryData(esportsKeys.entries(t.eventId), entries);
    queryClient.setQueryData(esportsKeys.links(t.eventId), links);
    queryClient.setQueryData(esportsKeys.br(t.eventId), games);
    queryClient.setQueryData(matchKeys.event(t.eventId), matches);
  };
  put(live, teams, bracketMatches, stage.links);
  put(open, openEntries, [], []);
  put(br, brEntries, [], [], brGames);
  put(fc, fcEntries, fcMatches, fcStage.links);
  queryClient.setQueryData(esportsKeys.leagueTournaments(L), [live]);
  queryClient.setQueryData(esportsKeys.leagueTournaments('L2'), [live, open]);
  queryClient.setQueryData(teamSportKeys.rules('L2'), { game: 'valorant' });
  queryClient.setQueryData(seasonTeamKeys.league(L), []);
  queryClient.setQueryData(seasonTeamKeys.league('L2'), []);
  queryClient.setQueryData(matchKeys.league(L), bracketMatches);
  for (const m of bracketMatches) queryClient.setQueryData(matchKeys.one(m.id), { ...m, history: [] });
  queryClient.setQueryData(matchKeys.one('rl1'), RL_MATCH);
  queryClient.setQueryData(matchKeys.one(fcMatches[1].id), { ...fcMatches[1], eventId: 'E4', rules: fcRules, format: 'ea_fc' });
  // La hoja de inscribirse: el capitán con su equipo de VALORANT y los IDs de sus miembros.
  queryClient.setQueryData(esportsKeys.myTeams(CAP), [{ id: 'TEAM1', game: 'valorant', name: 'Alfa', tag: 'ALF', description: '', logoPath: null, captainId: CAP, memberCount: 6, createdAt: null, updatedAt: null, myRole: 'captain' }]);
  const roster = [CAP, uid(2), uid(3), uid(4), uid(5), uid(6)];
  queryClient.setQueryData(esportsKeys.team('TEAM1'), {
    team: { id: 'TEAM1', game: 'valorant', name: 'Alfa', tag: 'ALF', description: '', logoPath: null, captainId: CAP, memberCount: 6, createdAt: null, updatedAt: null },
    members: roster.map((u, i) => ({ teamId: 'TEAM1', userId: u, role: i === 0 ? 'captain' : 'member', displayName: ['Capi', 'Rosa', 'Luis', 'Mía', 'Juan', 'Nora'][i], joinedAt: '' })),
  });
  queryClient.setQueryData(
    esportsIdKeys.of('valorant', sortedKey(roster)),
    ids('valorant', [
      { user: CAP, status: 'confirmado' },
      { user: uid(2), status: 'confirmado' },
      { user: uid(3), status: 'confirmado' },
      { user: uid(4), status: 'confirmado' },
      { user: uid(5), status: 'confirmado' },
      { user: uid(6), status: 'pendiente' },
    ]),
  );
  // Su propio ID de VALORANT, declarado (sin comprobar).
  queryClient.setQueryData(esportsIdKeys.mine(CAP), ids('valorant', [{ user: CAP, status: 'pendiente' }]));
});
afterAll(() => queryClient.invalidateAll());

function render(el: ReactElement, path: string, c: LeagueCtx = ctx()): string {
  return renderToString(h(MemoryRouter, { initialEntries: [path] }, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: c }, el))));
}
const eventRoute = (path: string, c?: LeagueCtx) => render(h(Routes, null, h(Route, { path: '/l/:lid/e/:eventId', element: h(screens.Event) })), path, c);
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

describe('pantallas del torneo de esports', () => {
  it('el contrato: las 5 pantallas y los nombres de las pestañas', () => {
    expect(Object.keys(screens).sort()).toEqual(['Event', 'Feed', 'Home', 'MyProfile', 'Standings', 'tabs']);
    expect(screens.tabs).toEqual({ home: 'Torneo', feed: 'Partidos', standings: 'Tabla', profile: 'Lo mío' });
  });

  it('sin cuenta: el torneo con su fase, el formato, el cupo y «Entra para inscribirte»', () => {
    state.user = null;
    const t = text(eventRoute(`/l/${L}/e/E2`));
    expect(t).toContain('Liga abierta');
    expect(t).toContain('Inscripción abierta');
    expect(t).toContain('5 contra 5 · Doble eliminación · Solo equipos · 2/8 equipos');
    expect(t).toContain('Entra para inscribirte');
    expect(t).toContain('Cuadro Equipos Info');
    expect(t).toContain('El cuadro todavía no está');
    // Lo del organizador no sale.
    expect(t).not.toContain('Revisar inscripciones');
    // «Equipos»: los aprobados (el pendiente no) y la info al final no (simple/doble tienen «Info»).
    const equipos = text(eventRoute(`/l/${L}/e/E2?ver=equipos`));
    expect(equipos).toContain('Inscritos (2/8)');
    expect(equipos).toContain('Pumas');
    expect(equipos).not.toContain('Halcones');
    expect(text(eventRoute(`/l/${L}/e/E2?ver=info`))).toContain('Cómo se juega');
  });

  it('el capitán con su serie por anotar: «Anotar resultado», el cuadro de ganadores, perdedores y la gran final', () => {
    const html = eventRoute(`/l/${L}/e/E1`);
    const t = text(html);
    expect(t).toContain('Anotar resultado');
    expect(t).toContain('Tu inscripción');
    expect(t).toContain('Ganadores');
    expect(t).toContain('Perdedores');
    expect(t).toContain('Gran final');
    expect(t).toContain('Campeón');
    expect(t).toContain('Alfa [ALF]');
    expect(t).toContain('Ganador W1-1');
    // El cuadro se desliza dentro de su caja (la pantalla no se mueve de lado a 360 px).
    expect(html).toContain('overflow-x-auto');
    expect(html).toContain('aria-label="Ganadores: se desliza de lado"');
    expect(t).toContain('Final de ganadores');
    // Al mejor de 1, el cuadro muestra las rondas del mapa (Beta 13-5 Gama).
    expect(t).toMatch(/Beta \[BET\] 13 3 Gama 5/);
  });

  it('quien organiza en Pro: «Revisar inscripciones», los pendientes con «Aprobar» y «Rechazar», y el menú', () => {
    const t = text(eventRoute(`/l/${L}/e/E2`, ORG));
    expect(t).toContain('Revisar inscripciones (1)');
    const equiposHtml = eventRoute(`/l/${L}/e/E2?ver=equipos`, ORG);
    const equipos = text(equiposHtml);
    expect(equipos).toContain('Por aprobar (1)');
    expect(equipos).toContain('Halcones');
    expect(equiposHtml).toContain('aria-label="Aprobar a Halcones"');
    expect(equiposHtml).toContain('aria-label="Rechazar a Halcones"');
    expect(equiposHtml).toContain('aria-label="Más opciones"');
  });

  it('quien organiza en Lite: sin lo del organizador (solo el aviso «Usar Pro»)', () => {
    state.pro = false;
    const t = text(eventRoute(`/l/${L}/e/E2?ver=equipos`, ORG));
    expect(t).not.toContain('Revisar inscripciones');
    expect(t).not.toContain('Por aprobar');
    expect(t).toContain('Inscritos (2/8)');
  });

  it('battle royale: la tabla acumulada (puesto + kills) y las partidas por jornada', () => {
    const t = text(eventRoute(`/l/${L}/e/E3`, ORG));
    expect(t).toContain('Tabla Partidas Equipos');
    expect(t).toContain('Anotar partida');
    // Fénix: 1.º (12) + 3 kills = 15; Cobras: 2.º (9) + 6 = 15, gana por victorias Fénix.
    expect(t).toMatch(/1 Fénix .*15/);
    expect(t).toContain('Orden: puntos (puesto + kills)');
    const partidas = text(eventRoute(`/l/${L}/e/E3?ver=partidas`, ORG));
    expect(partidas).toContain('Jornada 1');
    expect(partidas).toContain('Partida 1');
  });

  it('grupos de EA SPORTS FC: la tabla como el fútbol (con el empate) y las series del grupo', () => {
    const t = text(eventRoute(`/l/${L}/e/E4`));
    expect(t).toContain('Grupos Playoffs Jugadores');
    expect(t).toContain('Grupo A');
    expect(t).toMatch(/PJ G E P .*Dif\. Pts/);
    expect(t).toContain('Orden (como el fútbol)');
  });

  it('la hoja del partido de VALORANT: el capitán anota mapa por mapa y envía; el admin guarda', () => {
    const w11 = bracketMatches.find((m) => m.bracketKey === 'W1-1')!;
    const t = text(eventRoute(`/l/${L}/e/E1?partido=${w11.id}`));
    expect(t).toContain('Copa VALORANT');
    expect(t).toContain('Al mejor de 1');
    expect(t).toContain('Anotar resultado');
    expect(t).toContain('Mapa 1');
    expect(t).toContain('Mapa (opcional)');
    expect(t).toContain('Enviar resultado');
    expect(t).toContain('Foto de la pantalla final');
    const html = eventRoute(`/l/${L}/e/E1?partido=${w11.id}`);
    expect(html).toContain('aria-label="Rondas de Alfa"');
    expect(text(eventRoute(`/l/${L}/e/E1?partido=${w11.id}`, ORG))).toContain('Guardar resultado');
    // Una serie ya jugada: el marcador y el detalle, sin editor para quien no juega.
    const w12 = bracketMatches.find((m) => m.bracketKey === 'W1-2')!;
    state.user = null;
    const done = text(eventRoute(`/l/${L}/e/E1?partido=${w12.id}`));
    expect(done).toContain('Mapa 1');
    expect(done).toContain('13-5');
    expect(done).not.toContain('Enviar resultado');
  });

  it('la hoja del partido de Rocket League: juegos por goles al mejor de 5', () => {
    const html = eventRoute(`/l/${L}/e/E1?partido=rl1`, ORG);
    const t = text(html);
    expect(t).toContain('Al mejor de 5');
    expect(t).toContain('Juego 1');
    expect(html).toContain('aria-label="Goles de Alfa"');
    expect(t).not.toContain('Mapa (opcional)');
  });

  it('la hoja del partido de EA SPORTS FC: goles y, con empate en grupos, «Empate (sin penales)»', () => {
    const t = text(eventRoute(`/l/${L}/e/E4?partido=${fcMatches[1].id}`, ORG));
    expect(t).toContain('Juego 1');
    expect(t).toContain('Empate (sin penales)');
    expect(t).toContain('Guardar resultado');
  });

  it('el inicio: un torneo suelto es su página; una liga de esports, sus torneos y «Crear torneo» en Pro', () => {
    const solo = text(render(h(screens.Home), `/l/${L}`, ORG));
    expect(solo).toContain('Ganadores');
    expect(solo).not.toContain('Copa VALORANT Copa VALORANT');
    const liga = ctx({ lid: 'L2', base: '/l/L2', league: league({ id: 'L2', kind: 'liga', name: 'Liga gamer' }), member: org, isAdmin: true, isOwner: true });
    const html = render(h(screens.Home), '/l/L2', liga);
    const t = text(html);
    expect(t).toContain('Crear torneo');
    expect(html).toContain('href="/esports/valorant/nuevo-torneo?liga=L2"');
    expect(t).toContain('Inscripción abierta');
    expect(t).toContain('En curso');
    state.pro = false;
    expect(text(render(h(screens.Home), '/l/L2', liga))).not.toContain('Crear torneo');
  });

  it('partidos, tabla y lo mío', () => {
    const feed = text(render(h(screens.Feed!), `/l/${L}/juegos`, ctx()));
    expect(feed).toContain('Partidos');
    expect(feed).toContain('Resultados');
    expect(feed).toContain('Beta');
    const mine = text(render(h(screens.MyProfile!), `/l/${L}/perfil`, ctx()));
    expect(mine).toContain('Lo mío');
  });

  it('inscribirse con equipo: la plantilla con lo que le falta a cada uno y el botón con el nombre del equipo', () => {
    // VALORANT comprueba el ID con Riot: si el torneo lo pide, el que no lo tiene comprobado sale «ID sin comprobar».
    const asks = { ...open, settings: { ...open.settings, requireConfirmedId: true } };
    const t = text(render(h(RegisterSheet, { open: true, onClose: () => {}, t: asks, entry: null }), `/l/${L}/e/E2`, ctx()));
    expect(t).toContain('Inscribir mi equipo');
    expect(t).toContain('Plantilla: 5 titulares y hasta 2 suplentes');
    expect(t).toContain('Capitán');
    expect(t).toContain('ID sin comprobar');
    expect(t).toContain('5 titulares');
    expect(t).toContain('Inscribir a Alfa');
    // Sin pedirlo (por defecto), tener el ID puesto basta.
    const plain = text(render(h(RegisterSheet, { open: true, onClose: () => {}, t: open, entry: null }), `/l/${L}/e/E2`, ctx()));
    expect(plain).not.toContain('ID sin comprobar');
    expect(plain).not.toContain('Sin ID');
    // Individual (1 contra 1) sin su ID de ese juego: «Primero pon tu ID…» y «Poner mi ID».
    const duel = mkTournament({ eventId: 'E7', game: 'ea_fc', mode: '1v1', entryType: 'open', format: 'single_elim', settings: defaultSettings('ea_fc', '1v1', 'single_elim') });
    const solo = text(render(h(RegisterSheet, { open: true, onClose: () => {}, t: duel, entry: null }), `/l/${L}/e/E7`, ctx()));
    expect(solo).toContain('Primero pon tu ID de EA SPORTS FC.');
    expect(solo).toContain('Poner mi ID');
    // Su ID de VALORANT está declarado y el torneo pide ID confirmado: «Este torneo pide tu ID … comprobado».
    const soloVal = { ...open, mode: '1v1' as const, entryType: 'open' as const, eventId: 'E6', settings: { ...open.settings, requireConfirmedId: true } };
    const sv = text(render(h(RegisterSheet, { open: true, onClose: () => {}, t: soloVal, entry: null }), `/l/${L}/e/E6`, ctx()));
    expect(sv).toContain('Este torneo pide tu ID de VALORANT comprobado.');
    expect(sv).toContain('Ir a Mi ID de juego');
    // Ya inscrito: su estado y «Retirarme».
    const yo = text(render(h(RegisterSheet, { open: true, onClose: () => {}, t: open, entry: teams[0] }), `/l/${L}/e/E2`, ctx()));
    expect(yo).toContain('Tu inscripción');
    expect(yo).toContain('Retirarme');
  });
});

describe('crear torneo', () => {
  it('a pantalla completa: el juego de la ruta, «Cambiar» y los 5 pasos', () => {
    const html = renderToString(
      h(MemoryRouter, { initialEntries: ['/esports/valorant/nuevo-torneo'] }, h(FeedbackProvider, null, h(Routes, null, h(Route, { path: '/esports/:game/nuevo-torneo', element: h(CreateTournamentPage) })))),
    );
    const t = text(html);
    expect(t).toContain('Crear torneo');
    expect(t).toContain('1 de 5');
    expect(t).toContain('Juego Inscripción Formato Nombre Invitar');
    expect(t).toContain('VALORANT');
    expect(t).toContain('Cambiar');
    expect(html).toContain('href="/esports?crear=torneo"');
    // Rocket League: los tres modos.
    const rl = text(
      renderToString(h(MemoryRouter, { initialEntries: ['/esports/rocket_league/nuevo-torneo'] }, h(FeedbackProvider, null, h(Routes, null, h(Route, { path: '/esports/:game/nuevo-torneo', element: h(CreateTournamentPage) }))))),
    );
    expect(rl).toContain('1 contra 1');
    expect(rl).toContain('3 contra 3');
  });

  it('sin cuenta: la tarjeta para entrar', () => {
    state.user = null;
    vi.stubGlobal('navigator', { onLine: true });
    const t = text(renderToString(h(MemoryRouter, { initialEntries: ['/esports/valorant/nuevo-torneo'] }, h(FeedbackProvider, null, h(Routes, null, h(Route, { path: '/esports/:game/nuevo-torneo', element: h(CreateTournamentPage) }))))));
    expect(t).toContain('Crea un torneo de VALORANT');
  });

  it('inscripción en Lite: lo que casi no se toca va en «Más opciones»; en Pro, a la vista', () => {
    const form = emptyForm('valorant', '2026-10-08');
    const wrap = (el: ReactElement) => text(renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el))));
    const lite = wrap(h(EntryStep, { form, set: () => {}, pro: false }));
    expect(lite).toContain('Solo equipos');
    expect(lite).toContain('Libre');
    expect(lite).toContain('Más opciones');
    expect(lite).not.toContain('Aprobar solo');
    const pro = wrap(h(EntryStep, { form, set: () => {}, pro: true }));
    expect(pro).toContain('Aprobar solo');
    expect(pro).toContain('Pedir ID confirmado Comprobado con su Riot ID.');
    // El rango verificado solo sale en LoL; en un juego sin verificación, ninguno de los dos.
    expect(pro).not.toContain('Pedir rango verificado');
    expect(pro).toContain('Suplentes');
    const lol = wrap(h(EntryStep, { form: emptyForm('lol', '2026-10-08'), set: () => {}, pro: true }));
    expect(lol).toContain('Pedir rango verificado El rango de LoL que da Riot.');
    const rl = wrap(h(EntryStep, { form: emptyForm('rocket_league', '2026-10-08'), set: () => {}, pro: true }));
    expect(rl).toContain('Con su cuenta de Epic conectada.');
    const mlbb = wrap(h(EntryStep, { form: emptyForm('mlbb', '2026-10-08'), set: () => {}, pro: true }));
    expect(mlbb).not.toContain('Pedir ID confirmado');
    expect(mlbb).not.toContain('Pedir rango verificado');
    // 1 contra 1: solo «Libre», con la explicación.
    const duel = wrap(h(EntryStep, { form: emptyForm('sf6', '2026-10-08'), set: () => {}, pro: true }));
    expect(duel).toContain('En 1 contra 1 cada quien se inscribe solo.');
  });

  it('«Editar torneo» en la inscripción: los «Pedir…» solo si el juego los puede comprobar', () => {
    const wrap = (t: EsportsTournament) =>
      text(renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(EditTournamentSheet, { open: true, onClose: () => {}, t, tz: 'America/Santo_Domingo', approved: 0, formatEditable: true })))));
    const val = wrap(open);
    expect(val).toContain('Pedir ID confirmado Comprobado con su Riot ID.');
    expect(val).not.toContain('Pedir rango verificado');
    const lol = wrap(mkTournament({ eventId: 'E9', game: 'lol', settings: defaultSettings('lol', '5v5', 'double_elim') }));
    expect(lol).toContain('Pedir rango verificado');
    const smash = wrap(mkTournament({ eventId: 'E8', game: 'smash', mode: '1v1', entryType: 'open', settings: defaultSettings('smash', '1v1', 'double_elim') }));
    expect(smash).not.toContain('Pedir ID confirmado');
    expect(smash).not.toContain('Pedir rango verificado');
  });

  it('formato: tarjetas, mejor de por fase, reinicio de la gran final; BR con la tabla de puntos editable', () => {
    const wrap = (el: ReactElement) => text(renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el))));
    const val = emptyForm('valorant', '2026-10-08');
    const t = wrap(h(FormatFields, { value: { ...val, format: 'double_elim', settings: defaultSettings('valorant', '5v5', 'double_elim') }, onChange: () => {}, pro: true }));
    expect(t).toContain('Doble eliminación Nadie queda fuera con una sola derrota.');
    expect(t).toContain('Mejor de en la final');
    expect(t).toContain('Reinicio de la gran final');
    expect(t).toContain('Siembra');
    const ff = emptyForm('free_fire', '2026-10-08');
    const b = wrap(h(FormatFields, { value: ff, onChange: () => {}, pro: true }));
    expect(b).toContain('Puntos por puesto');
    expect(b).toContain('Volver a los de Free Fire');
    expect(b).toContain('Puntos por kill');
    const smash = wrap(h(FormatFields, { value: emptyForm('smash', '2026-10-08'), onChange: () => {}, pro: true }));
    expect(smash).toContain('Vidas por jugador');
    const lite = wrap(h(FormatFields, { value: val, onChange: () => {}, pro: false }));
    expect(lite).toContain('Ajustes del formato');
    expect(lite).not.toContain('Mejor de en la final');
  });
});
