/**
 * Humo de las pantallas de raqueta (con el pádel): se dibujan en el servidor (renderToString, sin navegador) con
 * datos en la caché, para el admin, un jugador y un visitante. Atrapa errores al dibujar y textos que faltan.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryClient } from '../../../lib/data/client';
import { keys } from '../../../lib/data/keys';
import { matchKeys, type Match } from '../../../lib/data/matches';
import { racketKeys, type RacketEvent } from '../../../lib/data/racket';
import { seasonTeamKeys, type SeasonTeam } from '../../../lib/data/seasonTeams';
import type { Wire } from '../../../lib/data/stamp';
import { LeagueContext, type LeagueCtx } from '../../../lib/league';
import type { League, Member, Player } from '../../../lib/types';
import { FeedbackProvider } from '../../../components/feedback';
import screens from '../padel/screens';
import { EventWizard } from './create/EventWizard';
import { RacketProvider } from './sport';
import { mkMatch, pts, sets } from './logic/testMatch';

const L = 'L1';
const league: League = {
  id: L,
  name: 'Pádel del Club',
  kind: 'liga',
  visibility: 'public',
  ownerUid: 'u1',
  venue: 'Club',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport: 'padel',
  tz: 'America/Santo_Domingo',
};
const P = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'];
const NAMES = ['Ana', 'Luis', 'Rosa', 'Pedro', 'Juan', 'Mía', 'Sofi', 'Carlos', 'Nora'];
const players: Player[] = P.map((id, i) => ({ id, name: NAMES[i], averageOverride: null, uid: id === 'p1' ? 'u-ana' : null }));
const team = (id: string, name: string, a: string, b: string): Wire<SeasonTeam> => ({
  id,
  leagueId: L,
  name,
  color: null,
  order: 0,
  roster: [
    { playerId: a, jersey: null, position: null, role: 'player' },
    { playerId: b, jersey: null, position: null, role: 'player' },
  ],
  createdAt: null,
  updatedAt: null,
});
const teams = [team('T1', 'Ana / Luis', 'p1', 'p2'), team('T2', 'Rosa / Pedro', 'p3', 'p4'), team('T3', 'Juan / Mía', 'p5', 'p6'), team('T4', 'Sofi / Carlos', 'p7', 'p8')];

const today = new Date().toISOString().slice(0, 10);
const ev = (id: string, type: string, name: string, config: Record<string, unknown>, playerCount: number): Wire<RacketEvent> => ({
  id,
  leagueId: L,
  type,
  name,
  date: today,
  startTime: '19:00',
  config,
  playerCount,
  createdAt: null,
  updatedAt: null,
});
const NIGHT = ev(
  'N1',
  'americano',
  'Americano del jueves',
  { format: 'americano', players: P, courts: ['Cancha 1', 'Cancha 2'], points: { mode: 'total', target: 24 }, rounds: 7, rests: { '1': ['p9'] }, round: 1, seed: 's' },
  9,
);
const LIGA = ev('G1', 'liga', 'Liga de parejas', { format: 'liga', pairs: ['T1', 'T2', 'T3', 'T4'], startDate: today }, 4);
const NUEVA = ev('G2', 'liga', 'Liga nueva', { format: 'liga', pairs: [], startDate: today }, 0);
const LISTA = ev('G3', 'liga', 'Liga lista', { format: 'liga', pairs: ['T1', 'T2', 'T3', 'T4'], startDate: today, courts: ['Cancha 1'], times: ['19:00'] }, 4);
const GRUPOS = ev(
  'X2',
  'torneo',
  'Copa con grupos',
  { format: 'torneo', categories: [{ id: 'B', name: 'Categoría B', pairs: ['T1', 'T2', 'T3', 'T4'], groups: 2, perGroup: 1, thirdPlace: false, groupsOf: [['T1', 'T4'], ['T2', 'T3']] }] },
  4,
);
const TORNEO = ev(
  'X1',
  'torneo',
  'Torneo de octubre',
  { format: 'torneo', categories: [{ id: 'A', name: 'Categoría A', pairs: ['T1', 'T2', 'T3', 'T4'], groups: 0, perGroup: 2, thirdPlace: true, seeds: ['T1', 'T2', 'T3', 'T4'] }] },
  4,
);

const withEvent = (m: Match, eventId: string): Match => ({ ...m, eventId });
const nightMatches: Match[] = [
  withEvent(pts(1, 'Cancha 1', ['p1', 'p2'], ['p3', 'p4'], 14, 10, { id: 'n1' }), 'N1'),
  withEvent(pts(1, 'Cancha 2', ['p5', 'p6'], ['p7', 'p8'], null, null, { id: 'n2', status: 'live', score: { text: '5-3', sides: [5, 3] } }), 'N1'),
];
const ligaMatches: Match[] = [
  withEvent(sets('T1', 'T2', '6-4 6-3', 1, { sets: [2, 0], games: [12, 7] }, { id: 'g1', round: 1, court: 'Cancha 1', scheduledAt: `${today}T23:00:00Z` }), 'G1'),
  withEvent(mkMatch({ id: 'g2', teams: ['T3', 'T4'], a: ['p5', 'p6'], b: ['p7', 'p8'], round: 1, court: 'Cancha 2', scheduledAt: `${today}T23:00:00Z` }), 'G1'),
  withEvent(
    sets('T1', 'T3', '6-2 6-2', 1, { sets: [2, 0], games: [12, 4] }, { id: 'g3', round: 2, status: 'finished', proposedAt: new Date().toISOString(), proposedSide: 1, proposedBy: 'u-ana' }),
    'G1',
  ),
];
const grupoMatches: Match[] = [
  withEvent(sets('T1', 'T4', '6-3 6-3', 1, { sets: [2, 0], games: [12, 6] }, { id: 'y1', stage: 'Categoría B · Grupo A', round: 1 }), 'X2'),
  withEvent(mkMatch({ id: 'y2', teams: ['T2', 'T3'], stage: 'Categoría B · Grupo B', round: 1 }), 'X2'),
];
const torneoMatches: Match[] = [withEvent(sets('T1', 'T4', '6-1 6-1', 1, { sets: [2, 0], games: [12, 2] }, { id: 'x1', bracketKey: 'A-R1-1', stage: 'Categoría A · Semifinal', round: 101 }), 'X1')];
// Los lados de los partidos de la liga con sus jugadores (para «mis partidos» y las estadísticas).
for (const m of [...ligaMatches, ...torneoMatches, ...grupoMatches]) {
  for (const s of m.sides) {
    const t = teams.find((x) => x.id === s.teamId);
    if (t && !s.players.length) s.players = t.roster.map((r) => ({ playerId: r.playerId, side: s.side, position: null, jersey: null, sub: false }));
    if (t) s.label = t.name;
  }
}
// Los nombres de los lados los copia la base («Ana / Luis»).
const nameOf = (id: string) => NAMES[P.indexOf(id)] ?? id;
for (const m of nightMatches) for (const s of m.sides) s.label = s.players.map((p) => nameOf(p.playerId)).join(' / ');
const all = [...nightMatches, ...ligaMatches, ...torneoMatches, ...grupoMatches];

const members: Member[] = [
  { id: `${L}_u1`, leagueId: L, uid: 'u1', name: 'Dueña', role: 'owner', playerId: null },
  { id: `${L}_u-ana`, leagueId: L, uid: 'u-ana', name: 'Ana', role: 'member', playerId: 'p1' },
];

beforeAll(() => {
  queryClient.setQueryData(racketKeys.events(L), [NIGHT, LIGA, NUEVA, LISTA, TORNEO, GRUPOS]);
  for (const e of [NIGHT, LIGA, NUEVA, LISTA, TORNEO, GRUPOS]) queryClient.setQueryData(racketKeys.event(e.id), e);
  queryClient.setQueryData(matchKeys.event('G3'), []);
  queryClient.setQueryData(matchKeys.event('X2'), grupoMatches);
  queryClient.setQueryData(racketKeys.rules(L), { match: { sport: 'padel', deuce: 'golden' } });
  queryClient.setQueryData(racketKeys.levels(L), { p1: 4.5, p2: 3 });
  queryClient.setQueryData(keys.players(L), players);
  queryClient.setQueryData(keys.leagueMembers(L), members);
  queryClient.setQueryData(seasonTeamKeys.league(L), teams);
  queryClient.setQueryData(matchKeys.league(L), all);
  queryClient.setQueryData(matchKeys.event('N1'), nightMatches);
  queryClient.setQueryData(matchKeys.event('G1'), ligaMatches);
  queryClient.setQueryData(matchKeys.event('G2'), []);
  queryClient.setQueryData(matchKeys.event('X1'), torneoMatches);
  queryClient.setQueryData(matchKeys.one('g2'), { ...ligaMatches[1], rules: { match: { sport: 'padel' } }, state: null, history: [] });
  queryClient.setQueryData(matchKeys.one('g3'), { ...ligaMatches[2], rules: { match: { sport: 'padel' } }, state: null, history: [{ at: new Date().toISOString(), by: 'u-ana', a: 'finish', score: '6-2 6-2' }] });
  queryClient.setQueryData(matchKeys.one('n2'), { ...nightMatches[1], rules: { match: { sport: 'padel' }, points: { mode: 'total', target: 24 } }, state: null, history: [] });
});

afterAll(() => queryClient.invalidateAll());

const ctx = (over: Partial<LeagueCtx> = {}): LeagueCtx => ({
  lid: L,
  league,
  member: members[0],
  isAdmin: true,
  isOwner: true,
  isScorer: false,
  canScore: true,
  myPlayerId: null,
  base: `/l/${L}`,
  ...over,
});
const ANA = ctx({ member: members[1], isAdmin: false, isOwner: false, canScore: false, myPlayerId: 'p1' });
const GUEST = ctx({ member: null, isAdmin: false, isOwner: false, canScore: false });

function render(el: ReactElement, path = `/l/${L}`, c: LeagueCtx = ctx()): string {
  return renderToString(h(MemoryRouter, { initialEntries: [path] }, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: c }, el))));
}
const eventRoute = (path: string, c?: LeagueCtx) => render(h(Routes, null, h(Route, { path: '/l/:lid/e/:eventId', element: h(screens.Event) })), path, c);
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

describe('pantallas del pádel', () => {
  it('el contrato: pantallas, pestaña del admin y nombres', () => {
    expect(Object.keys(screens).sort()).toEqual(['Event', 'Feed', 'Home', 'MyProfile', 'Player', 'Standings', 'adminTabs', 'tabs']);
    expect(screens.adminTabs?.map((t) => [t.key, t.label])).toEqual([['parejas', 'Parejas y niveles']]);
    expect(screens.tabs).toEqual({ home: 'Calendario', feed: 'Partidos', standings: 'Tabla', profile: 'Mis partidos' });
  });

  it('inicio: en vivo, noches, ligas y torneos; el admin crea con «Nuevo»', () => {
    const t = text(render(h(screens.Home)));
    expect(t).toContain('Nuevo');
    expect(t).toContain('En vivo');
    expect(t).toContain('Americano del jueves');
    expect(t).toContain('9 jugadores · ronda 1 de 7');
    expect(t).toContain('Liga de parejas');
    expect(t).toContain('Torneo de octubre');
    const ana = text(render(h(screens.Home), `/l/${L}`, ANA));
    expect(ana).not.toContain('Nuevo');
    // Juan tiene un partido de la liga por jugar.
    expect(text(render(h(screens.Home), `/l/${L}`, { ...ANA, myPlayerId: 'p5' }))).toContain('Mis próximos partidos');
  });

  it('la noche: canchas de la ronda, siguiente ronda, tabla, rondas y jugadores', () => {
    const canchas = text(eventRoute(`/l/${L}/e/N1`));
    expect(canchas).toContain('Ronda 1 de 7');
    expect(canchas).toContain('Cancha 2');
    expect(canchas).toContain('Siguiente ronda (2 de 7)');
    expect(canchas).toContain('Descansan: Nora');
    expect(canchas).toContain('A 24 puntos');
    const tabla = text(eventRoute(`/l/${L}/e/N1?ver=tabla`));
    expect(tabla).toContain('Ana');
    expect(tabla).toContain('Orden: puntos');
    expect(tabla).toContain('WhatsApp');
    expect(text(eventRoute(`/l/${L}/e/N1?ver=rondas`))).toContain('Rosa / Pedro');
    expect(text(eventRoute(`/l/${L}/e/N1?ver=jugadores`))).toContain('Nivel 4.5');
  });

  it('la noche para un jugador: su cancha con compañero y rivales; sin botones del organizador', () => {
    const t = text(eventRoute(`/l/${L}/e/N1`, ANA));
    expect(t).toContain('Ronda 1: te toca');
    expect(t).toContain('Con Luis contra');
    expect(t).not.toContain('Siguiente ronda');
  });

  it('un partido de la noche en el modo cancha: el total y los botones gigantes', () => {
    const t = text(eventRoute(`/l/${L}/e/N1?partido=n2&cancha=1`));
    expect(t).toContain('Deshacer punto');
    expect(t).toContain('Terminar');
    expect(t).toContain('Juan / Mía');
  });

  it('la liga de parejas: jornadas, tabla y parejas; sin calendario el admin lo arma', () => {
    const j = text(eventRoute(`/l/${L}/e/G1`));
    expect(j).toContain('Jornada 1');
    expect(j).toContain('Por confirmar');
    const tabla = text(eventRoute(`/l/${L}/e/G1?ver=tabla`));
    expect(tabla).toContain('Ana / Luis');
    expect(tabla).toContain('Desempates');
    expect(text(eventRoute(`/l/${L}/e/G1?ver=parejas`, ANA))).toContain('Tu pareja');
    const nueva = text(eventRoute(`/l/${L}/e/G2`));
    expect(nueva).toContain('¿Quiénes juegan?');
    expect(nueva).toContain('Elige al menos 2 parejas');
    expect(text(eventRoute(`/l/${L}/e/G2`, GUEST))).toContain('El calendario todavía no está');
  });

  it('la liga lista para armar: jornadas previstas y el botón', () => {
    const t = text(eventRoute(`/l/${L}/e/G3`));
    expect(t).toContain('3 jornadas · 6 partidos');
    expect(t).toContain('Crear el calendario');
    // 4 parejas, 1 cancha y 1 hora: caben 3 de 6 (una por jornada).
    expect(t).toContain('3 partidos no caben');
  });

  it('el torneo con grupos: tabla de cada grupo y cuándo se arma el cuadro', () => {
    const t = text(eventRoute(`/l/${L}/e/X2`));
    expect(t).toContain('Categoría B · Grupo A');
    expect(t).toContain('Categoría B · Grupo B');
    expect(t).toContain('Cuando terminen los grupos');
  });

  it('«Nuevo»: las plantillas y repetir la última noche', () => {
    const t = text(render(h(RacketProvider, { sport: 'padel', children: h(EventWizard, { open: true, onClose: () => undefined, lastNight: NIGHT as unknown as RacketEvent }) })));
    expect(t).toContain('Repetir la última noche');
    expect(t).toContain('Americano de la noche');
    expect(t).toContain('Mexicano');
    expect(t).toContain('Liga de parejas');
    expect(t).toContain('Torneo por categorías');
  });

  it('el torneo: cuadro con el ganador y «pasar ganadores»', () => {
    const t = text(eventRoute(`/l/${L}/e/X1`));
    expect(t).toContain('Semifinal');
    expect(t).toContain('Pasar ganadores al cuadro');
    expect(t).toContain('3.er lugar');
  });

  it('partidos: por confirmar y el partido abierto con confirmar / anotar', () => {
    const feed = text(render(h(screens.Feed!), `/l/${L}/juegos`));
    expect(feed).toContain('Por confirmar');
    expect(feed).toContain('Próximos');
    const juan = ctx({ member: members[1], isAdmin: false, isOwner: false, myPlayerId: 'p5' });
    const open = text(render(h(screens.Feed!), `/l/${L}/juegos?partido=g2`, juan));
    expect(open).toContain('Anotar en la cancha');
    expect(open).toContain('Solo el resultado');
    // El rival de lo que propuso Ana ve «Confirmar».
    const rosa = ctx({ member: members[1], isAdmin: false, isOwner: false, myPlayerId: 'p5' });
    const toConfirm = text(render(h(screens.Feed!), `/l/${L}/juegos?partido=g3`, rosa));
    expect(toConfirm).toContain('Confirmar');
    expect(toConfirm).toContain('Historial');
    const admin = text(render(h(screens.Feed!), `/l/${L}/juegos?partido=g3`));
    expect(admin).toContain('Corregir el resultado');
  });

  it('tabla de la temporada, perfil y el admin', () => {
    expect(text(render(h(screens.Standings!), `/l/${L}/ranking`))).toContain('Ana / Luis');
    expect(text(render(h(screens.Standings!), `/l/${L}/ranking?ver=ranking`))).toContain('Luis');
    expect(text(render(h(screens.Standings!), `/l/${L}/ranking?ver=noches`))).toContain('Noches');
    const perfil = text(render(h(screens.MyProfile!), `/l/${L}/perfil`, ANA));
    expect(perfil).toContain('Mis partidos');
    expect(perfil).toContain('Con cada compañero');
    expect(perfil).toContain('Contra cada rival');
    const player = text(render(h(Routes, null, h(Route, { path: '/l/:lid/j/:playerId', element: h(screens.Player!) })), `/l/${L}/j/p2`));
    expect(player).toContain('Luis');
    const admin = text(render(h(screens.adminTabs![0].Component)));
    expect(admin).toContain('Reglas del partido');
    expect(admin).toContain('Punto de oro');
    expect(admin).toContain('Sofi / Carlos');
  });
});
