/**
 * Humo de la inscripción «Me apunto» (pádel): la noche y el torneo con cupo y lista de espera se dibujan en el
 * servidor (renderToString) con datos en la caché, para el admin (en Pro: «Empezar ronda 1» a la vista; en Lite va con
 * «Usar Pro»), una jugadora en la espera, otro en la lista y un visitante sin cuenta.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../../../lib/data/client';
import { keys } from '../../../../lib/data/keys';
import { matchKeys } from '../../../../lib/data/matches';
import { racketKeys, signupKeys, type EventSignup, type RacketEvent } from '../../../../lib/data/racket';
import { seasonTeamKeys, type SeasonTeam } from '../../../../lib/data/seasonTeams';
import type { Wire } from '../../../../lib/data/stamp';
import { LeagueContext, type LeagueCtx } from '../../../../lib/league';
import type { League, Member, Player } from '../../../../lib/types';
import { FeedbackProvider } from '../../../../components/feedback';
import screens from '../../padel/screens';

const mode = vi.hoisted(() => ({ pro: true }));
vi.mock('../../../../lib/useMode', async (orig) => ({
  ...(await orig<typeof import('../../../../lib/useMode')>()),
  useIsPro: () => mode.pro,
  useMode: () => ({ mode: mode.pro ? 'pro' : 'lite', isPro: mode.pro, setMode: async () => 'local', suggestedPro: false }),
}));
afterEach(() => {
  mode.pro = true;
});

const L = 'LS';
const league: League = {
  id: L,
  name: 'Pádel Club',
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
const P = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const NAMES = ['Ana', 'Luis', 'Rosa', 'Pedro', 'Juan', 'Mía'];
const players: Player[] = P.map((id, i) => ({ id, name: NAMES[i], averageOverride: null, uid: `u-${id}` }));
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
const teams = [team('T1', 'Ana / Luis', 'p1', 'p2'), team('T2', 'Rosa / Pedro', 'p3', 'p4'), team('T3', 'Juan / Mía', 'p5', 'p6')];
const FUTURE = '2030-10-08';
const ev = (id: string, type: string, name: string, config: Record<string, unknown>, playerCount: number): Wire<RacketEvent> => ({
  id,
  leagueId: L,
  type,
  name,
  date: FUTURE,
  startTime: '19:00',
  config,
  playerCount,
  createdAt: null,
  updatedAt: null,
});
const NIGHT = ev(
  'SN',
  'americano',
  'Americano con cupo',
  {
    format: 'americano',
    players: ['p2', 'p3', 'p4', 'p5'],
    courts: ['Cancha 1'],
    points: { mode: 'total', target: 24 },
    rounds: 3,
    round: 0,
    seed: 's',
    signup: { open: true, cap: 4, until: '2030-10-07T22:00:00.000Z', rev: 4 },
  },
  4,
);
const TORNEO = ev(
  'ST',
  'torneo',
  'Torneo abierto',
  {
    format: 'torneo',
    categories: [
      { id: 'A', name: 'Categoría A', pairs: ['T2'], groups: 0, perGroup: 2, thirdPlace: true },
      { id: 'B', name: 'Categoría B', pairs: [], groups: 0, perGroup: 2, thirdPlace: true },
    ],
    signup: { open: true, cap: 8, until: null, rev: 1 },
  },
  1,
);
const signup = (entrantId: string, status: 'in' | 'wait', queue: number, category: string | null = null): EventSignup => ({
  eventId: 'SN',
  entrantId,
  playerId: entrantId,
  teamId: null,
  category,
  status,
  queue,
  queuedAt: '2030-10-01T00:00:00Z',
  promotedAt: null,
  createdBy: null,
});

const members: Member[] = [
  { id: `${L}_u1`, leagueId: L, uid: 'u1', name: 'Dueña', role: 'owner', playerId: null },
  { id: `${L}_u-p1`, leagueId: L, uid: 'u-p1', name: 'Ana', role: 'member', playerId: 'p1' },
  { id: `${L}_u-p2`, leagueId: L, uid: 'u-p2', name: 'Luis', role: 'member', playerId: 'p2' },
];

beforeAll(() => {
  queryClient.setQueryData(racketKeys.events(L), [NIGHT, TORNEO]);
  for (const e of [NIGHT, TORNEO]) queryClient.setQueryData(racketKeys.event(e.id), e);
  queryClient.setQueryData(racketKeys.rules(L), { match: { sport: 'padel' } });
  queryClient.setQueryData(racketKeys.levels(L), {});
  queryClient.setQueryData(keys.players(L), players);
  queryClient.setQueryData(keys.leagueMembers(L), members);
  queryClient.setQueryData(seasonTeamKeys.league(L), teams);
  queryClient.setQueryData(matchKeys.league(L), []);
  queryClient.setQueryData(matchKeys.event('SN'), []);
  queryClient.setQueryData(matchKeys.event('ST'), []);
  queryClient.setQueryData(signupKeys.event('SN'), [signup('p2', 'in', 1), signup('p1', 'wait', 5), signup('p6', 'wait', 6)]);
  queryClient.setQueryData(signupKeys.event('ST'), [{ ...signup('T2', 'in', 1, 'A'), eventId: 'ST', playerId: null, teamId: 'T2' }]);
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
const LUIS = ctx({ member: members[2], isAdmin: false, isOwner: false, canScore: false, myPlayerId: 'p2' });
const GUEST = ctx({ member: null, isAdmin: false, isOwner: false, canScore: false });

const render = (path: string, c: LeagueCtx = ctx()) =>
  renderToString(
    h(MemoryRouter, { initialEntries: [path] }, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: c }, h(Routes, null, h(Route, { path: '/l/:lid/e/:eventId', element: h(screens.Event) }))))),
  );
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('«Me apunto» en la noche', () => {
  it('admin: cómo va la lista, la espera en turno con «Meter» y los ajustes', () => {
    const t = text(render(`/l/${L}/e/SN`));
    expect(t).toContain('Inscripción abierta');
    expect(t).toContain('lista llena');
    expect(t).toContain('4 de 4 cupos · 2 en espera');
    expect(t).toContain('Se cierra el');
    expect(t).toContain('Lista de espera (2)');
    expect(t.indexOf('Ana')).toBeLessThan(t.indexOf('Mía'));
    expect(t).toContain('Meter');
    expect(t).toContain('Inscripción');
    expect(t).toContain('Ajustes');
    expect(t).toContain('Al empezar la ronda 1 se cierra la inscripción');
    expect(t).toContain('Invitar por WhatsApp');
    // En Lite la lista y «Meter» siguen (la espera es de todos los días); «Empezar ronda 1» va con «Usar Pro».
    mode.pro = false;
    const lite = text(render(`/l/${L}/e/SN`));
    expect(lite).toContain('Lista de espera (2)');
    expect(lite).toContain('Meter');
    expect(lite).not.toContain('Empezar ronda 1');
  });

  it('jugadora en la espera: su turno y «Salir de la espera»; el de la lista: «Ya no puedo»', () => {
    const ana = text(render(`/l/${L}/e/SN`, ANA));
    expect(ana).toContain('Estás n.º 1 en la lista de espera');
    expect(ana).toContain('Salir de la espera');
    expect(ana).not.toContain('Meter');
    const luis = text(render(`/l/${L}/e/SN`, LUIS));
    expect(luis).toContain('Estás en la lista (n.º 1)');
    expect(luis).toContain('Ya no puedo');
  });

  it('visitante sin cuenta: «Entra para apuntarte»', () => {
    expect(text(render(`/l/${L}/e/SN`, GUEST))).toContain('Entra para apuntarte');
  });
});

describe('«Me apunto» en el torneo', () => {
  it('cupo por categoría y la pareja de Juan ve «Me apunto»', () => {
    const admin = text(render(`/l/${L}/e/ST`));
    expect(admin).toContain('Categoría A: 1 de 8 cupos · Categoría B: 0 de 8 cupos');
    const juan = text(render(`/l/${L}/e/ST`, ctx({ member: null, isAdmin: false, isOwner: false, canScore: false, myPlayerId: 'p5' })));
    expect(juan).toContain('Entra para apuntarte');
    // Pedro juega en Rosa / Pedro (apuntada en la A).
    const pedro = text(render(`/l/${L}/e/ST`, ctx({ member: members[1], isAdmin: false, isOwner: false, canScore: false, myPlayerId: 'p4' })));
    expect(pedro).toContain('Estás en la lista (n.º 1) de Categoría A');
  });

  it('el inicio dice cuántos van apuntados', () => {
    const t = text(renderToString(h(MemoryRouter, { initialEntries: [`/l/${L}`] }, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx() }, h(screens.Home))))));
    expect(t).toContain('inscripción: 4 de 4');
    expect(t).toContain('inscripción: 1 de 16');
  });
});
