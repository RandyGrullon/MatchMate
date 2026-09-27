/**
 * Humo de las pantallas del golf: se dibujan (sin navegador, renderToString) con datos puestos en la caché,
 * en cada pestaña de la ronda y con los roles de admin y de jugador. Atrapa errores al dibujar (undefined,
 * claves, textos) sin depender de la base.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_COURSE, DEMO_PARS } from '../../../sports/golf/demo';
import { queryClient } from '../../../lib/data/client';
import { golfKeys, type GolfCardDoc, type GolfEventData, type GolfRoundFull } from '../../../lib/data/golf';
import { keys } from '../../../lib/data/keys';
import { LeagueContext, type LeagueCtx } from '../../../lib/league';
import type { League, Player } from '../../../lib/types';
import { FeedbackProvider } from '../../../components/feedback';
import screens from './screens';
import { emptyLog, setHole, writeLog } from './courtLog';

const lid = 'l1';
const eid = 'e1';
const league: League = {
  id: lid,
  name: 'Golf del Club',
  kind: 'liga',
  visibility: 'private',
  ownerUid: 'u-admin',
  venue: 'Campo',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport: 'golf',
};
const players: Player[] = [
  { id: 'p1', name: 'Ana', averageOverride: null, uid: 'u-ana' },
  { id: 'p2', name: 'Luis', averageOverride: null, uid: 'u-luis' },
  { id: 'p3', name: 'Pedro', averageOverride: null },
];

const round = (closed: boolean): GolfRoundFull => ({
  eventId: eid,
  courseId: 'c1',
  courseName: DEMO_COURSE.name,
  holes: 18,
  nine: 'all',
  competition: { format: 'stableford', basis: 'net', allowance: 95 },
  shotgun: false,
  tournamentId: null,
  roundNo: null,
  closed,
  closedAt: null,
  course: DEMO_COURSE,
});

const card = (id: string, playerId: string, played: number, extra: Partial<GolfCardDoc> = {}): GolfCardDoc => ({
  id,
  eventId: eid,
  playerId,
  teeId: 'azul',
  hcpIndex: 12.4,
  courseHcp: 13.1,
  playingHcp: 12,
  groupNo: 1,
  startHole: 1,
  strokes: DEMO_PARS.map((p, i) => (i < played ? p + (i % 3 === 0 ? 1 : 0) : null)),
  putts: DEMO_PARS.map((_, i) => (i < played ? 2 : null)),
  pickedUp: DEMO_PARS.map(() => false),
  signed: false,
  signedAt: null,
  dq: false,
  ...extra,
});

function seed(closed = false) {
  const cards = [card('c1', 'p1', 18), card('c2', 'p2', 7), card('c3', 'p3', 0, { groupNo: null, hcpIndex: null, playingHcp: 0 })];
  const data: GolfEventData = { round: round(closed), cards };
  queryClient.setQueryData(golfKeys.event(eid), data);
  queryClient.setQueryData(keys.event(lid, eid), {
    id: eid,
    type: 'ronda',
    name: 'Mensual',
    date: '2026-10-10',
    games: 1,
    hcpBase: 0,
    hcpPercent: 0,
    teams: {},
    playerCount: 3,
    startTime: '07:30:00',
  });
  queryClient.setQueryData(keys.events(lid), [queryClient.getQueryData(keys.event(lid, eid))]);
  queryClient.setQueryData(keys.players(lid), players);
  queryClient.setQueryData(golfKeys.courses(lid), [DEMO_COURSE]);
  queryClient.setQueryData(golfKeys.rules(lid), { competition: { format: 'stroke', basis: 'net', allowance: 95 }, meritPoints: [25, 20, 16] });
  queryClient.setQueryData(golfKeys.indexes(lid), { p1: { index: 12.4, at: '2026-09-01' } });
  queryClient.setQueryData(golfKeys.tournaments(lid), []);
  const { course: _c, ...light } = data.round!;
  queryClient.setQueryData(golfKeys.rounds(lid), [light]);
  queryClient.setQueryData(golfKeys.season(lid), closed ? { rounds: [data.round], cards } : { rounds: [], cards: [] });
  queryClient.setQueryData(golfKeys.player(lid, 'p1'), { cards: [{ ...cards[0], signed: true }], rounds: [data.round] });
}

function ctx(role: 'admin' | 'player'): LeagueCtx {
  const admin = role === 'admin';
  return {
    lid,
    league,
    member: { id: `${lid}_u`, leagueId: lid, uid: admin ? 'u-admin' : 'u-ana', name: admin ? 'Org' : 'Ana', role: admin ? 'owner' : 'member', playerId: admin ? null : 'p1' },
    isAdmin: admin,
    isOwner: admin,
    isScorer: false,
    canScore: admin,
    myPlayerId: admin ? null : 'p1',
    base: `/l/${lid}`,
  };
}

function render(el: ReactElement, url: string, role: 'admin' | 'player', path = '*'): string {
  return renderToString(
    h(
      MemoryRouter,
      { initialEntries: [url] },
      h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx(role) }, h(Routes, null, h(Route, { path, element: el })))),
    ),
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

beforeEach(() => seed());
afterEach(() => queryClient.invalidateAll());

describe('pantallas del golf', () => {
  it('el contrato: pantallas, pestaña de admin y nombres de pestañas', () => {
    expect(Object.keys(screens).sort()).toEqual(['Event', 'Home', 'MyProfile', 'Player', 'Standings', 'adminTabs', 'tabs']);
    expect(screens.adminTabs?.map((t) => t.key)).toEqual(['campos']);
    expect(screens.tabs).toMatchObject({ home: 'Rondas', feed: null });
  });

  it('ronda: tarjeta del grupo con lo del teléfono encima', () => {
    // En el teléfono: el hoyo 8 de Luis con 6 golpes, todavía sin enviar.
    writeLog({ ...setHole(emptyLog(eid), 'c2', 7, { s: 6, p: null, u: false }), scope: 'g:1', hole: 7 });
    const out = text(render(h(screens.Event), `/l/${lid}/e/${eid}?tab=tarjeta`, 'player', '/l/:lid/e/:eventId'));
    expect(out).toContain('Hoyo 8');
    expect(out).toContain('Ana');
    expect(out).toContain('Luis');
    expect(out).toContain('1 hoyo por enviar');
    expect(out).toContain('Hoyo listo');
    writeLog(emptyLog(eid));
  });

  it('ronda: leaderboard y jugadores (admin y jugador)', () => {
    for (const role of ['admin', 'player'] as const) {
      const board = text(render(h(screens.Event), `/l/${lid}/e/${eid}?tab=leaderboard`, role, '/l/:lid/e/:eventId'));
      expect(board).toContain('Stableford');
      expect(board).toContain('Pedro');
      const list = text(render(h(screens.Event), `/l/${lid}/e/${eid}?tab=jugadores`, role, '/l/:lid/e/:eventId'));
      expect(list).toContain('Grupo 1');
      expect(list).toContain('Sin grupo');
    }
    const admin = text(render(h(screens.Event), `/l/${lid}/e/${eid}?tab=jugadores`, 'admin', '/l/:lid/e/:eventId'));
    expect(admin).toContain('Inscribir jugadores');
    expect(admin).toContain('Cerrar ronda');
    const mine = text(render(h(screens.Event), `/l/${lid}/e/${eid}?tab=jugadores`, 'player', '/l/:lid/e/:eventId'));
    expect(mine).toContain('Mi tarjeta');
  });

  it('ronda cerrada: sin pestaña de tarjeta; orden de mérito y perfil', () => {
    seed(true);
    const ev = text(render(h(screens.Event), `/l/${lid}/e/${eid}`, 'player', '/l/:lid/e/:eventId'));
    expect(ev).toContain('Cerrada');
    expect(ev).not.toContain('Hoyo listo');
    const merit = text(render(h(screens.Standings!), `/l/${lid}/ranking`, 'player'));
    expect(merit).toContain('Orden de mérito');
    expect(merit).toContain('Ana');
    const home = text(render(h(screens.Home), `/l/${lid}`, 'admin'));
    expect(home).toContain('Nueva ronda o torneo');
    expect(home).toContain('Resultados');
    const profile = text(render(h(screens.MyProfile!), `/l/${lid}/perfil`, 'player'));
    expect(profile).toContain('Handicap Index (no oficial)');
    expect(profile).toContain('Birdies');
  });

  it('admin: campos', () => {
    const tab = screens.adminTabs![0];
    const out = text(render(h(tab.Component), `/l/${lid}/admin?tab=campos`, 'admin'));
    expect(out).toContain(DEMO_COURSE.name);
    expect(out).toContain('Formato de la liga');
  });
});

describe('ventanas del golf', () => {
  it('crear y cambiar ronda, editar campo, tarjeta hoyo por hoyo y grupos', async () => {
    const { RoundForm } = await import('./RoundForm');
    const { CourseEditor } = await import('./GolfAdmin');
    const { CardModal } = await import('./bits');
    const { AddPlayersModal, AdminCardModal, GroupsModal } = await import('./GolfPlayers');
    const noop = () => undefined;
    const create = text(render(h(RoundForm, { open: true, onClose: noop }), `/l/${lid}`, 'admin'));
    expect(create).toContain('Nueva ronda');
    expect(create).toContain('Stroke play neto');
    const edit = text(render(h(RoundForm, { open: true, onClose: noop, edit: { eventId: eid, round: round(false), started: true } }), `/l/${lid}`, 'admin'));
    expect(edit).toContain('el campo y los hoyos no cambian');
    const editor = text(render(h(CourseEditor, { open: true, course: DEMO_COURSE, onClose: noop }), `/l/${lid}`, 'admin'));
    expect(editor).toContain('Salidas (tees)');
    const c = card('c1', 'p1', 18, { pickedUp: DEMO_PARS.map((_, i) => i === 4) });
    c.strokes[4] = null;
    const detail = text(render(h(CardModal, { open: true, onClose: noop, name: 'Ana', round: round(false), card: c }), `/l/${lid}`, 'player'));
    expect(detail).toContain('Hcp de juego 12');
    expect(detail).toContain('Vuelta');
    expect(detail).toContain('Puntos');
    const cards = [card('c1', 'p1', 18), card('c2', 'p2', 3)];
    const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
    expect(text(render(h(GroupsModal, { open: true, onClose: noop, round: round(false), cards, nameOf }), `/l/${lid}`, 'admin'))).toContain('Repartir de a 4');
    expect(text(render(h(AddPlayersModal, { open: true, onClose: noop, round: round(false), cards, players }), `/l/${lid}`, 'admin'))).toContain('Pedro');
    expect(text(render(h(AdminCardModal, { card: cards[1], onClose: noop, round: round(false), name: 'Luis' }), `/l/${lid}`, 'admin'))).toContain('Descalificar');
  });
});
