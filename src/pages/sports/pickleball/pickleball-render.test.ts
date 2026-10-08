/**
 * Humo de las pantallas de pickleball: inicio, «Nuevo», el round robin social (canchas, tabla, rondas, jugadores),
 * la cancha, «solo el resultado» del juego, la tabla con el orden de USA Pickleball y el DUPR. Se dibujan en el
 * servidor (renderToString) con datos en la caché.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../../lib/data/client';
import { keys } from '../../../lib/data/keys';
import { matchKeys, type Match } from '../../../lib/data/matches';
import { racketKeys, type RacketEvent } from '../../../lib/data/racket';
import { seasonTeamKeys, type SeasonTeam } from '../../../lib/data/seasonTeams';
import type { Wire } from '../../../lib/data/stamp';
import { LeagueContext, type LeagueCtx } from '../../../lib/league';
import type { League, Member, Player } from '../../../lib/types';
import { FeedbackProvider } from '../../../components/feedback';
import { EventWizard } from '../racket/create/EventWizard';
import { levelKeys } from '../racket/levels';
import { pts, sets } from '../racket/logic/testMatch';
import { RacketProvider } from '../racket/sport';
import screens, { PICKLEBALL_EXT } from './screens';

// El modo de la app: Pro por defecto (lo de organizar a la vista); las pruebas de Lite lo cambian.
const mode = vi.hoisted(() => ({ pro: true }));
vi.mock('../../../lib/useMode', async (orig) => ({
  ...(await orig<typeof import('../../../lib/useMode')>()),
  useIsPro: () => mode.pro,
  useMode: () => ({ mode: mode.pro ? 'pro' : 'lite', isPro: mode.pro, setMode: async () => 'local', suggestedPro: false }),
}));
afterEach(() => {
  mode.pro = true;
});

const L = 'LP';
const league: League = {
  id: L,
  name: 'Pickleball del Parque',
  kind: 'liga',
  visibility: 'public',
  ownerUid: 'u1',
  venue: 'Parque',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport: 'pickleball',
  tz: 'America/Santo_Domingo',
};
const P = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9'];
const NAMES = ['Ana', 'Luis', 'Rosa', 'Pedro', 'Juan', 'Mía', 'Sofi', 'Carlos', 'Nora'];
const players: Player[] = P.map((id, i) => ({ id, name: NAMES[i], averageOverride: null, uid: id === 'k1' ? 'u-ana' : null }));
const nameOf = (id: string) => NAMES[P.indexOf(id)] ?? id;
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
const teams = [team('Q1', 'Ana / Luis', 'k1', 'k2'), team('Q2', 'Rosa / Pedro', 'k3', 'k4'), team('Q3', 'Juan / Mía', 'k5', 'k6')];

const today = new Date().toISOString().slice(0, 10);
const ev = (id: string, type: string, name: string, config: Record<string, unknown>, playerCount: number): Wire<RacketEvent> => ({
  id,
  leagueId: L,
  type,
  name,
  date: today,
  startTime: '18:00',
  config,
  playerCount,
  createdAt: null,
  updatedAt: null,
});
const RR = ev(
  'R1',
  'americano',
  'Round robin del sábado',
  {
    format: 'americano',
    players: P,
    courts: ['Cancha 1', 'Cancha 2'],
    rounds: 7,
    rests: { '1': ['k9'] },
    round: 1,
    seed: 's',
    game: { to: 11, winBy: 2, scoring: 'sideout' },
    points: { mode: 'game', target: 11 },
    mixed: ['k1', 'k3', 'k6', 'k7'],
  },
  9,
);
const LIGA = ev('G1', 'liga', 'Liga de dobles', { format: 'liga', pairs: ['Q1', 'Q2', 'Q3'], startDate: today }, 3);

const withEvent = (m: Match, eventId: string): Match => ({ ...m, eventId });
const game = { match: { sport: 'pickleball', gameTo: 11, bestOf: 1, doubles: true }, points: { mode: 'game', target: 11 } };
const rrMatches: Match[] = [
  withEvent(pts(1, 'Cancha 1', ['k1', 'k2'], ['k3', 'k4'], 11, 7, { id: 'r1', rules: game }), 'R1'),
  withEvent(pts(1, 'Cancha 2', ['k5', 'k6'], ['k7', 'k8'], null, null, { id: 'r2', status: 'live', score: { text: '5-3', sides: [5, 3] }, rules: game }), 'R1'),
];
const tot = (a: [number, number], b: [number, number], p: [number, number]) => ({ text: '', sides: a, totals: { sets: a, games: b, points: p } });
const pending = sets('Q1', 'Q3', '', 1, { sets: [0, 0], games: [0, 0] }, { id: 'g4', round: 4, status: 'scheduled', score: null, winner: null });
const ligaMatches: Match[] = [
  withEvent(sets('Q1', 'Q2', '11-7 11-9', 1, { sets: [2, 0], games: [2, 0] }, { id: 'g1', round: 1, score: { ...tot([2, 0], [2, 0], [22, 16]), text: '11-7 11-9' } }), 'G1'),
  withEvent(sets('Q2', 'Q3', '11-2', 1, { sets: [1, 0], games: [1, 0] }, { id: 'g2', round: 2, score: { ...tot([1, 0], [1, 0], [11, 2]), text: '11-2' } }), 'G1'),
  withEvent(sets('Q3', 'Q1', '11-5', 1, { sets: [1, 0], games: [1, 0] }, { id: 'g3', round: 3, score: { ...tot([1, 0], [1, 0], [11, 5]), text: '11-5' } }), 'G1'),
  withEvent(pending, 'G1'),
];
for (const m of ligaMatches) {
  for (const s of m.sides) {
    const t = teams.find((x) => x.id === s.teamId);
    if (t) {
      s.label = t.name;
      s.players = t.roster.map((r) => ({ playerId: r.playerId, side: s.side, position: null, jersey: null, sub: false }));
    }
  }
}
for (const m of rrMatches) for (const s of m.sides) s.label = s.players.map((p) => nameOf(p.playerId)).join(' / ');
const all = [...rrMatches, ...ligaMatches];

const members: Member[] = [
  { id: `${L}_u1`, leagueId: L, uid: 'u1', name: 'Dueña', role: 'owner', playerId: null },
  { id: `${L}_u-ana`, leagueId: L, uid: 'u-ana', name: 'Ana', role: 'member', playerId: 'k1' },
];

beforeAll(() => {
  queryClient.setQueryData(racketKeys.events(L), [RR, LIGA]);
  for (const e of [RR, LIGA]) queryClient.setQueryData(racketKeys.event(e.id), e);
  queryClient.setQueryData(racketKeys.rules(L), { match: { sport: 'pickleball' } });
  queryClient.setQueryData(levelKeys.league(L, 'dupr'), { k1: 3.752, k3: 4 });
  queryClient.setQueryData(keys.players(L), players);
  queryClient.setQueryData(keys.leagueMembers(L), members);
  queryClient.setQueryData(seasonTeamKeys.league(L), teams);
  queryClient.setQueryData(matchKeys.league(L), all);
  queryClient.setQueryData(matchKeys.event('R1'), rrMatches);
  queryClient.setQueryData(matchKeys.event('G1'), ligaMatches);
  queryClient.setQueryData(matchKeys.one('r2'), { ...rrMatches[1], state: null, history: [] });
  queryClient.setQueryData(matchKeys.one('g4'), { ...ligaMatches[3], rules: { match: { sport: 'pickleball', bestOf: 3 } }, state: null, history: [] });
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
const ANA = ctx({ member: members[1], isAdmin: false, isOwner: false, canScore: false, myPlayerId: 'k1' });
const JUAN = ctx({ member: members[1], isAdmin: false, isOwner: false, canScore: false, myPlayerId: 'k5' });

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

describe('pantallas de pickleball', () => {
  it('el contrato y la pestaña del admin', () => {
    expect(Object.keys(screens).sort()).toEqual(['Event', 'Feed', 'Home', 'MyProfile', 'Player', 'Standings', 'adminTabs', 'tabs', 'useSeasonTable']);
    expect(screens.adminTabs?.map((t) => t.label)).toEqual(['Parejas y niveles']);
  });

  it('inicio: el round robin (mixto) con su línea y la liga', () => {
    const t = text(render(h(screens.Home)));
    expect(t).toContain('Round robin del sábado');
    expect(t).toContain('Round robin mixto');
    expect(t).toContain('9 jugadores · a 11 · ronda 1 de 7');
    expect(t).toContain('Liga de dobles');
  });

  it('«Nuevo»: round robin social, liga de dobles, torneo grupos + eliminatoria, cajas y escalera', () => {
    const t = text(render(h(RacketProvider, { sport: 'pickleball', ext: PICKLEBALL_EXT, children: h(EventWizard, { open: true, onClose: () => undefined }) })));
    expect(t).not.toContain('Americano de la noche');
    expect(t).not.toContain('Mexicano');
    expect(t).toContain('Round robin social');
    expect(t).toContain('Liga de dobles');
    expect(t).toContain('Torneo grupos + eliminatoria');
    expect(t).toContain('Liga por cajas mensual');
    expect(t).toContain('Escalera');
  });

  it('admin: reglas de pickleball y DUPR', () => {
    const html = render(h(screens.adminTabs![0].Component));
    const t = text(html);
    expect(t).toContain('Dobles, un juego a 11');
    expect(t).toContain('Conteo por rally');
    expect(t).toContain('Jugadores y DUPR');
    expect(html).toContain('value="3.752"');
  });

  it('admin con las reglas «Individual»: las parejas siguen a mano (las cajas y la escalera de dobles las piden)', () => {
    const before = queryClient.getQueryData(racketKeys.rules(L));
    queryClient.setQueryData(racketKeys.rules(L), { match: { sport: 'pickleball', doubles: false, bestOf: 3 } });
    try {
      const t = text(render(h(screens.adminTabs![0].Component)));
      expect(t).toContain('Individual, mejor de 3 juegos a 11');
      expect(t).toContain('Parejas (3)');
      expect(t).toContain('Ana / Luis');
    } finally {
      queryClient.setQueryData(racketKeys.rules(L), before);
    }
  });
});

describe('round robin social', () => {
  it('canchas de la ronda (a 11), siguiente ronda y quién descansa', () => {
    const t = text(eventRoute(`/l/${L}/e/R1`));
    // Mixto: en la fila de los jugadores (la línea de arriba dice la ronda y el juego).
    expect(t).toContain('· mixto');
    expect(t).toContain('Ronda 1 de 7');
    expect(t).toContain('Juego a 11, ganando por 2, conteo tradicional');
    expect(t).toContain('Cancha 2');
    expect(t).toContain('Siguiente ronda (2 de 7)');
    expect(t).toContain('Descansan: Nora');
  });

  it('en Lite: la ronda y «Cómo van todos»; armar la siguiente ronda está en Pro', () => {
    mode.pro = false;
    const t = text(eventRoute(`/l/${L}/e/R1`));
    expect(t).toContain('Ronda 1 de 7');
    expect(t).not.toContain('Siguiente ronda');
    expect(t).toContain('Jugadores (9)');
  });

  it('un jugador: su cancha con compañero y rivales', () => {
    const t = text(eventRoute(`/l/${L}/e/R1`, JUAN));
    expect(t).toContain('Ronda 1: te toca');
    expect(t).toContain('Con Mía contra');
    expect(t).toContain('Anotar en la cancha');
  });

  it('tabla por partidos ganados y dif. de puntos; rondas; jugadores con su grupo y DUPR', () => {
    const tablaHtml = eventRoute(`/l/${L}/e/R1?ver=tabla`);
    const tabla = text(tablaHtml);
    expect(tabla).toContain('Orden: partidos ganados, diferencia y puntos a favor');
    expect(tabla).toContain('Ana');
    // Compartir la tabla por WhatsApp está en «•••».
    expect(tablaHtml).toContain('aria-label="Más opciones"');
    expect(text(eventRoute(`/l/${L}/e/R1?ver=rondas`))).toContain('Rosa / Pedro');
    const jug = text(eventRoute(`/l/${L}/e/R1?ver=jugadores`));
    expect(jug).toContain('Grupo A');
    expect(jug).toContain('DUPR 3.752');
  });

  it('el juego en la cancha de pickleball y «solo el resultado» del juego', () => {
    const courtHtml = eventRoute(`/l/${L}/e/R1?partido=r2&cancha=1`);
    const court = text(courtHtml);
    expect(court).toContain('Deshacer');
    expect(court).toContain('Terminar');
    // El retiro y suspender, en «•••» de la cancha.
    expect(courtHtml).toContain('aria-label="Más opciones"');
    const detail = text(eventRoute(`/l/${L}/e/R1?partido=r2`));
    expect(detail).toContain('Seguir anotando en la cancha');
    expect(detail).toContain('Poner el marcador');
  });
});

describe('tabla, perfil y partidos', () => {
  it('la liga de dobles: orden de USA Pickleball (desempata la dif. de puntos)', () => {
    const t = text(eventRoute(`/l/${L}/e/G1?ver=tabla`));
    expect(t).toContain('USA Pickleball');
    // Los tres con 1 ganado (y 1 entre ellos): decide la dif. de puntos: Rosa / Pedro +3, Ana / Luis 0, Juan / Mía -3.
    const i = (x: string) => t.indexOf(x);
    expect(i('Rosa / Pedro')).toBeLessThan(i('Ana / Luis'));
    expect(i('Ana / Luis')).toBeLessThan(i('Juan / Mía'));
    const season = text(render(h(screens.Standings!), `/l/${L}/ranking?ver=noches`));
    expect(season).toContain('Round robin');
  });

  it('perfil: DUPR, juegos y puntos; el round robin con su nombre', () => {
    const t = text(render(h(screens.MyProfile!), `/l/${L}/perfil`, ANA));
    expect(t).toContain('DUPR 3.752');
    expect(t).toContain('Round robin social');
    expect(t).toContain('Puntos 27-27');
  });

  it('un partido de la liga en la cancha de pickleball', () => {
    const html = render(h(screens.Feed!), `/l/${L}/juegos?partido=g4&cancha=1`);
    const t = text(html);
    expect(t).toContain('Deshacer');
    expect(html).toContain('aria-label="Más opciones"');
    expect(t).toContain('al mejor de 3 juegos a 11');
    const detail = text(render(h(screens.Feed!), `/l/${L}/juegos?partido=g4`));
    expect(detail).toContain('Solo el resultado');
  });
});
