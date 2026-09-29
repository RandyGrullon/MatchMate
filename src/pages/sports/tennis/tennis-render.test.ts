/**
 * Humo de las pantallas de tenis (y de la liga por cajas y la escalera, que comparten tenis, pickleball y pádel):
 * se dibujan en el servidor (renderToString) con datos en la caché, para el admin, un jugador y un visitante.
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
import { EventWizard } from '../racket/create/EventWizard';
import { levelKeys } from '../racket/levels';
import { mkMatch, sets } from '../racket/logic/testMatch';
import { RacketProvider } from '../racket/sport';
import { ladderKeys } from '../racket-formats/data';
import screens, { TENNIS_EXT } from './screens';

const L = 'LT';
const league: League = {
  id: L,
  name: 'Tenis del Club',
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
  sport: 'tennis',
  tz: 'America/Santo_Domingo',
};
const P = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'];
const NAMES = ['Ana', 'Luis', 'Rosa', 'Pedro', 'Juan', 'Mía', 'Sofi', 'Carlos'];
const players: Player[] = P.map((id, i) => ({ id, name: NAMES[i], averageOverride: null, uid: id === 't1' ? 'u-ana' : null }));
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
const teams = [team('D1', 'Ana / Luis', 't1', 't2'), team('D2', 'Rosa / Pedro', 't3', 't4')];

const today = new Date().toISOString().slice(0, 10);
const ev = (id: string, type: string, name: string, config: Record<string, unknown>, playerCount: number): Wire<RacketEvent> => ({
  id,
  leagueId: L,
  type,
  name,
  date: today,
  startTime: null,
  config,
  playerCount,
  createdAt: null,
  updatedAt: null,
});
const CAJAS = ev(
  'B1',
  'cajas',
  'Cajas de octubre',
  {
    format: 'cajas',
    entrants: P,
    round: 2,
    months: [
      { n: 1, label: 'Septiembre 2026', boxes: [P.slice(0, 4), P.slice(4)], closed: true, moves: [{ id: 't5', from: 1, to: 0, move: 'sube' }, { id: 't4', from: 0, to: 1, move: 'baja' }] },
      { n: 2, label: 'Octubre 2026', start: '2026-10-01', end: '2026-10-31', boxes: [['t1', 't2', 't3', 't5'], ['t4', 't6', 't7', 't8']], closed: false },
    ],
  },
  8,
);
const NUEVAS = ev('B2', 'cajas', 'Cajas nuevas', { format: 'cajas', entrants: P.slice(0, 4), months: [] }, 0);
const ESCALERA = ev('X1', 'escalera', 'Escalera del club', { format: 'escalera', maxUp: 3, acceptDays: 3, playDays: 7, open: true }, 5);
const LIGA = ev('G1', 'liga', 'Liga de individuales', { format: 'liga', pairs: ['t1', 't2', 't3', 't4'], startDate: today }, 4);

const withEvent = (m: Match, eventId: string): Match => ({ ...m, eventId });
const boxMatches: Match[] = [
  withEvent(sets(['t1'], ['t2'], '6-4 6-4', 1, { sets: [2, 0], games: [12, 8] }, { id: 'b1', round: 2, stage: 'Caja 1' }), 'B1'),
  withEvent(sets(['t3'], ['t5'], '6-2 3-6 10-7', 2, { sets: [1, 2], games: [9, 9] }, { id: 'b2', round: 2, stage: 'Caja 1' }), 'B1'),
  withEvent(mkMatch({ id: 'b3', a: ['t1'], b: ['t3'], round: 2, stage: 'Caja 1' }), 'B1'),
  withEvent(mkMatch({ id: 'b4', a: ['t4'], b: ['t6'], round: 2, stage: 'Caja 2' }), 'B1'),
];
const ladderMatch = withEvent(mkMatch({ id: 'x1', a: ['t5'], b: ['t2'], stage: 'Reto' }), 'X1');
// Uno de dobles en la misma liga: las estadísticas van aparte.
const doublesMatch = sets(['t1', 't2'], ['t3', 't4'], '6-3 6-3', 1, { sets: [2, 0], games: [12, 6] }, { id: 'd1', teams: ['D1', 'D2'] } as Partial<Match>);
for (const m of [...boxMatches, ladderMatch, doublesMatch]) for (const s of m.sides) if (!s.teamId) s.label = s.players.map((p) => nameOf(p.playerId)).join(' / ');
const all = [...boxMatches, ladderMatch, doublesMatch];

const members: Member[] = [
  { id: `${L}_u1`, leagueId: L, uid: 'u1', name: 'Dueña', role: 'owner', playerId: null },
  { id: `${L}_u-ana`, leagueId: L, uid: 'u-ana', name: 'Ana', role: 'member', playerId: 't1' },
];

beforeAll(() => {
  const events = [CAJAS, NUEVAS, ESCALERA, LIGA];
  queryClient.setQueryData(racketKeys.events(L), events);
  for (const e of events) queryClient.setQueryData(racketKeys.event(e.id), e);
  queryClient.setQueryData(racketKeys.rules(L), { match: { sport: 'tennis', deuce: 'ad' } });
  queryClient.setQueryData(levelKeys.league(L, 'ntrp'), { t1: 4.5, t2: 3.5, t5: 4 });
  queryClient.setQueryData(keys.players(L), players);
  queryClient.setQueryData(keys.leagueMembers(L), members);
  queryClient.setQueryData(seasonTeamKeys.league(L), teams);
  queryClient.setQueryData(matchKeys.league(L), all);
  queryClient.setQueryData(matchKeys.event('B1'), boxMatches);
  queryClient.setQueryData(matchKeys.event('B2'), []);
  queryClient.setQueryData(matchKeys.event('X1'), [ladderMatch]);
  queryClient.setQueryData(matchKeys.event('G1'), []);
  queryClient.setQueryData(ladderKeys.rungs('X1'), ['t3', 't2', 't4', 't5', 't1'].map((id, i) => ({ entrantId: id, position: i + 1, playerId: id, teamId: null, joinedAt: '2026-09-01T00:00:00Z' })));
  queryClient.setQueryData(ladderKeys.challenges('X1'), [
    {
      id: 'c1',
      eventId: 'X1',
      challenger: 't5',
      challenged: 't2',
      challengerPos: 4,
      challengedPos: 2,
      matchId: 'x1',
      status: 'pending',
      acceptBy: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      playBy: new Date(Date.now() + 6 * 86_400_000).toISOString(),
      acceptedAt: null,
      resolvedAt: null,
      winner: null,
      note: null,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'c0',
      eventId: 'X1',
      challenger: 't3',
      challenged: 't4',
      challengerPos: 3,
      challengedPos: 1,
      matchId: null,
      status: 'played',
      acceptBy: '2026-09-10T00:00:00Z',
      playBy: '2026-09-14T00:00:00Z',
      acceptedAt: null,
      resolvedAt: '2026-09-12T00:00:00Z',
      winner: 't3',
      note: null,
      createdAt: '2026-09-08T00:00:00Z',
    },
  ]);
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
const ANA = ctx({ member: members[1], isAdmin: false, isOwner: false, canScore: false, myPlayerId: 't1' });
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

describe('pantallas de tenis', () => {
  it('el contrato: pantallas, pestaña del admin y nombres', () => {
    expect(Object.keys(screens).sort()).toEqual(['Event', 'Feed', 'Home', 'MyProfile', 'Player', 'Standings', 'adminTabs', 'tabs', 'useSeasonTable']);
    expect(screens.adminTabs?.map((t) => [t.key, t.label])).toEqual([['parejas', 'Jugadores y niveles']]);
  });

  it('inicio: la liga por cajas y la escalera con su línea', () => {
    const t = text(render(h(screens.Home)));
    expect(t).toContain('Cajas de octubre');
    expect(t).toContain('Liga por cajas');
    expect(t).toContain('8 jugadores · Octubre 2026 · 2 cajas');
    expect(t).toContain('Escalera del club');
    expect(t).toContain('se reta hasta 3 arriba');
  });

  it('«Nuevo»: sin americano ni mexicano; liga, torneo con cuadro, cajas y escalera', () => {
    const t = text(render(h(RacketProvider, { sport: 'tennis', ext: TENNIS_EXT, children: h(EventWizard, { open: true, onClose: () => undefined }) })));
    expect(t).not.toContain('Americano');
    expect(t).not.toContain('Mexicano');
    expect(t).toContain('Liga');
    expect(t).toContain('Torneo con cuadro');
    expect(t).toContain('Liga por cajas mensual');
    expect(t).toContain('Escalera');
  });

  it('admin: reglas de tenis y el NTRP de cada jugador', () => {
    const t = text(render(h(screens.adminTabs![0].Component)));
    expect(t).toContain('Reglas del partido');
    expect(t).toContain('Mejor de 3 sets con ventaja');
    expect(t).toContain('Fast4');
    expect(t).toContain('Jugadores y NTRP');
    expect(t).toContain('NTRP de 1.5 a 7.0');
    expect(render(h(screens.adminTabs![0].Component))).toContain('value="4.5"');
  });
});

describe('liga por cajas', () => {
  it('el mes abierto: cajas con su tabla, ↑↓ y los partidos; mi caja primero', () => {
    const t = text(eventRoute(`/l/${L}/e/B1`, ANA));
    expect(t).toContain('Cajas de octubre');
    expect(t).toContain('Octubre 2026');
    expect(t).toContain('2 de 4 partidos jugados');
    expect(t).toContain('Caja 1 · tu caja');
    expect(t).toContain('Caja 2');
    expect(t).toContain('Partidos de la caja');
    expect(t).toContain('Desempates');
    expect(t).not.toContain('Cerrar el mes');
  });

  it('el admin: cerrar el mes, participantes y reglas; los meses anteriores', () => {
    const t = text(eventRoute(`/l/${L}/e/B1`));
    expect(t).toContain('Cerrar el mes');
    expect(t).toContain('Participantes');
    const meses = text(eventRoute(`/l/${L}/e/B1?ver=historial`));
    expect(meses).toContain('Septiembre 2026');
    expect(meses).toContain('Subieron: Juan (Caja 1)');
    expect(meses).toContain('Bajaron: Pedro');
    const part = text(eventRoute(`/l/${L}/e/B1?ver=participantes`));
    expect(part).toContain('NTRP 4.5');
  });

  it('los meses viejos que la base archivó dicen que ya no guardan quién subió y quién bajó', () => {
    const LARGA = ev(
      'B3',
      'cajas',
      'Cajas de siempre',
      {
        format: 'cajas',
        entrants: P,
        round: 3,
        months: [
          { n: 1, label: 'Agosto 2026', closed: true, archived: true },
          { n: 2, label: 'Septiembre 2026', closed: true, moves: [{ id: 't5', from: 1, to: 0, move: 'sube' }] },
          { n: 3, label: 'Octubre 2026', boxes: [P.slice(0, 4), P.slice(4)], closed: false },
        ],
      },
      8,
    );
    queryClient.setQueryData(racketKeys.event('B3'), LARGA);
    queryClient.setQueryData(matchKeys.event('B3'), []);
    const meses = text(eventRoute(`/l/${L}/e/B3?ver=historial`));
    expect(meses).toContain('Agosto 2026 De este mes ya no se guarda quién subió y quién bajó.');
    expect(meses).toContain('Septiembre 2026 Subieron: Juan (Caja 1)');
    expect(meses).not.toContain('Sin cambios');
  });

  it('sin mes: el admin lo arma; los demás esperan', () => {
    expect(text(eventRoute(`/l/${L}/e/B2`))).toContain('Armar el primer mes');
    expect(text(eventRoute(`/l/${L}/e/B2`, GUEST))).toContain('Todavía no empieza');
  });
});

describe('escalera', () => {
  it('los puestos, el reto abierto con su plazo y los últimos retos', () => {
    const t = text(eventRoute(`/l/${L}/e/X1`));
    expect(t).toContain('Escalera del club');
    expect(t).toContain('Puestos');
    expect(t).toContain('Rosa');
    expect(t).toContain('Retos abiertos (1)');
    expect(t).toContain('Juan (4.º) retó a Luis (2.º)');
    expect(t).toContain('Para aceptar: en 2 días');
    expect(t).toContain('Rosa ganó y sube al 1.º');
    expect(t).toContain('Ordenar y agregar');
  });

  it('un jugador: su puesto y a quién puede retar (hasta 3 arriba, sin los que están en reto)', () => {
    const t = text(eventRoute(`/l/${L}/e/X1`, ANA));
    expect(t).toContain('Tu puesto');
    expect(t).toContain('Puedes retar a:');
    // Ana es 5.ª: Luis (2.º) y Juan (4.º) están en reto; queda Pedro (3.º).
    expect(t).toContain('3.º Pedro');
    expect(t).not.toContain('2.º Luis');
    expect(t).not.toContain('Ordenar y agregar');
  });

  it('alguien que no está y la escalera es abierta: entrar', () => {
    const t = text(eventRoute(`/l/${L}/e/X1`, { ...ANA, myPlayerId: 't8' }));
    expect(t).toContain('Entrar a la escalera');
  });
});

describe('tabla, perfil y partidos', () => {
  it('tabla: las cajas del mes entran con las ligas; ranking separado individual / dobles', () => {
    const t = text(render(h(screens.Standings!), `/l/${L}/ranking`));
    expect(t).toContain('Cajas de octubre · Caja 1');
    const r = text(render(h(screens.Standings!), `/l/${L}/ranking?ver=ranking`));
    expect(r).toContain('Individual');
    expect(r).toContain('Dobles');
    const dobles = text(render(h(screens.Standings!), `/l/${L}/ranking?ver=ranking&modo=dobles`));
    expect(dobles).toContain('Dobles.');
  });

  it('perfil: individual y dobles por separado, y el NTRP', () => {
    const t = text(render(h(screens.MyProfile!), `/l/${L}/perfil`, ANA));
    expect(t).toContain('NTRP 4.5');
    expect(t).toContain('Liga y torneos · Individual');
    expect(t).toContain('Liga y torneos · Dobles');
    expect(t).toContain('Con cada compañero');
  });

  it('un partido de tenis: la cancha de sets (15/30/40)', () => {
    queryClient.setQueryData(matchKeys.one('b3'), { ...boxMatches[2], rules: { match: { sport: 'tennis', deuce: 'noad' } }, state: null, history: [] });
    const t = text(eventRoute(`/l/${L}/e/B1?partido=b3&cancha=1`));
    expect(t).toContain('Deshacer punto');
    expect(t).toContain('Ana');
    const detail = text(eventRoute(`/l/${L}/e/B1?partido=b3`));
    expect(detail).toContain('Sin ventaja');
    expect(detail).toContain('Solo el resultado');
  });
});
