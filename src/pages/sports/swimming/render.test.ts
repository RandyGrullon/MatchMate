/**
 * Prueba de humo de las pantallas de natación: se dibujan (en el servidor, sin navegador) con datos de verdad en
 * la caché y muestran lo principal de cada pestaña, para un admin y para un visitante.
 */
import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POINTS_6_LANES } from '../../../sports/swimming';
import { queryClient } from '../../../lib/data/client';
import { keys } from '../../../lib/data/keys';
import { swimKeys, type SwimEntry, type SwimEventItem, type SwimMeet } from '../../../lib/data/swimming';
import { LeagueContext, type LeagueCtx } from '../../../lib/league';
import type { League, Member, Player } from '../../../lib/types';
import { FeedbackProvider } from '../../../components/feedback';
import screens from './screens';
import MeetPage from './MeetPage';

const L = 'L1';
const M = 'M1';
const league: League = {
  id: L,
  name: 'Club Acuático',
  kind: 'liga',
  visibility: 'private',
  ownerUid: 'u1',
  venue: 'Piscina Olímpica',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport: 'swimming',
  hasMinors: true,
};
const today = new Date().toISOString().slice(0, 10);
const meet: SwimMeet = {
  id: M,
  type: 'encuentro',
  name: 'Copa Delfín',
  date: today,
  startTime: '08:00',
  announcement: 'Calentamiento 7:30',
  pool: 25,
  lanes: 4,
  points: POINTS_6_LANES,
  ageGroups: 'cccan',
  heatsPublishedAt: '2026-01-01T00:00:00Z',
  finalizedAt: null,
};
const events: SwimEventItem[] = [
  { id: 'e1', meetId: M, num: 1, distance: 50, stroke: 'libre', pool: 25, gender: 'X', ageGroups: [] },
  { id: 'e2', meetId: M, num: 2, distance: 100, stroke: 'combinado', pool: 25, gender: 'F', ageGroups: ['9-10', '11-12'] },
];
const players: Player[] = [
  { id: 'p1', name: 'Ana Pérez', averageOverride: null, isMinor: true },
  { id: 'p2', name: 'Luis Gómez', averageOverride: null, isMinor: true },
  { id: 'p3', name: 'Rosa Díaz', averageOverride: null, isMinor: true },
  { id: 'p4', name: 'Pedro Ruiz', averageOverride: null, uid: 'u4' },
];
const entry = (id: string, playerId: string, over: Partial<SwimEntry>): SwimEntry => ({
  id,
  meetId: M,
  swimEventId: 'e1',
  playerId,
  clubId: 'cA',
  ageGroup: '9-10',
  seed: 3000,
  heat: 1,
  lane: 1,
  time: null,
  status: 'ok',
  resultAt: null,
  ...over,
});
const entries: SwimEntry[] = [
  entry('x1', 'p1', { lane: 2, time: 3000, resultAt: '2026-01-01T10:00:00Z' }),
  entry('x2', 'p2', { lane: 3, clubId: 'cB', time: 3100, resultAt: '2026-01-01T10:00:00Z' }),
  entry('x3', 'p3', { lane: 1, status: 'dq', time: 2900, resultAt: '2026-01-01T10:00:00Z' }),
  entry('x4', 'p4', { heat: 2, lane: 2, ageGroup: null, seed: null }),
  entry('x5', 'p1', { swimEventId: 'e2', heat: null, lane: null, seed: 9000 }),
];
const members: Member[] = [
  { id: `${L}_u1`, leagueId: L, uid: 'u1', name: 'Dueña', role: 'owner', playerId: null },
  { id: `${L}_u4`, leagueId: L, uid: 'u4', name: 'Pedro', role: 'member', playerId: 'p4', scorer: true },
];

beforeAll(() => {
  queryClient.setQueryData(swimKeys.meets(L), [meet, { ...meet, id: 'M0', name: '', type: 'control', date: '2025-05-05', heatsPublishedAt: null }]);
  queryClient.setQueryData(swimKeys.events(M), events);
  queryClient.setQueryData(swimKeys.entries(M), entries);
  queryClient.setQueryData(swimKeys.clubs(L), [
    { id: 'cA', name: 'Delfines', short: 'DEL', color: '#0088cc', coachId: null },
    { id: 'cB', name: 'Tiburones', short: 'TIB', color: null, coachId: null },
  ]);
  queryClient.setQueryData(swimKeys.swimmers(L), [
    { playerId: 'p1', clubId: 'cA', category: '9-10', categoryYear: 2026 },
    { playerId: 'p2', clubId: 'cB', category: '9-10', categoryYear: 2026 },
  ]);
  queryClient.setQueryData(swimKeys.private(L), [{ playerId: 'p1', birthYear: 2016, sex: 'F', guardianName: 'Mamá', consentAt: '2026-01-01T00:00:00Z' }]);
  queryClient.setQueryData(keys.players(L), players);
  queryClient.setQueryData(keys.leagueMembers(L), members);
  queryClient.setQueryData(`swim:rules:${L}`, { pool: 25, lanes: 6, points: POINTS_6_LANES, ageGroups: 'cccan', raw: {} });
  queryClient.setQueryData(swimKeys.history(L, 'p4'), [
    { entryId: 'h1', meetId: 'M0', meetName: '', meetType: 'control', swimEventId: 'z', distance: 50, stroke: 'libre', pool: 25, gender: 'X', ageGroup: null, time: 3500, status: 'ok', date: '2025-05-05', eventId: 'M0' },
    { entryId: 'h2', meetId: M, meetName: 'Copa Delfín', meetType: 'encuentro', swimEventId: 'e1', distance: 50, stroke: 'libre', pool: 25, gender: 'X', ageGroup: null, time: 3300, status: 'ok', date: today, eventId: M },
  ]);
  queryClient.setQueryData(swimKeys.season(L), { meets: [meet], events, entries: entries.filter((e) => e.status === 'ok' && e.time) });
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

function render(el: ReactElement, path = `/l/${L}`, c: LeagueCtx = ctx()): string {
  return renderToString(
    createElement(MemoryRouter, { initialEntries: [path] }, createElement(FeedbackProvider, null, createElement(LeagueContext.Provider, { value: c }, el))),
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

describe('pantallas de natación', () => {
  it('el contrato: pantallas, pestañas del admin y nombres', () => {
    expect(Object.keys(screens).sort()).toEqual(['Event', 'Home', 'MyProfile', 'Player', 'Standings', 'adminTabs', 'tabs']);
    expect(screens.adminTabs?.map((t) => t.key)).toEqual(['nadadores', 'clubes']);
    expect(screens.tabs).toEqual({ home: 'Encuentros', feed: null, standings: 'Puntos', profile: 'Mis marcas' });
  });

  it('inicio: encuentros y el próximo', () => {
    const t = text(render(createElement(screens.Home)));
    expect(t).toContain('Encuentros');
    expect(t).toContain('Copa Delfín');
    expect(t).toContain('Nuevo');
  });

  it('encuentro: cada pestaña se dibuja', () => {
    const tab = (ver: string) => text(render(createElement(MeetPage, { meetId: M }), `/l/${L}/e/${M}?ver=${ver}`));
    const programa = tab('programa');
    expect(programa).toContain('50 m Libre');
    expect(programa).toContain('100 m Combinado');
    expect(programa).toContain('Femenino · 9-10, 11-12');
    const inscritos = tab('inscritos');
    expect(inscritos).toContain('5 inscripciones en 2 pruebas');
    const series = tab('series');
    expect(series).toContain('Serie 1 de 2');
    expect(series).toContain('Ana Pérez');
    const crono = tab('cronometro');
    expect(crono).toContain('SALIDA');
    expect(crono).toContain('no oficial');
    // Abre en la primera serie que falta por cronometrar (la 1 ya tiene tiempos).
    expect(crono).toContain('Serie 2 de 2');
    expect(crono).toContain('Pedro Ruiz');
    expect(crono).toContain('Publicar serie');
    const res = tab('resultados');
    expect(res).toContain('30.00');
    expect(res).toContain('DQ');
    expect(res).toContain('6 pts');
    const puntos = tab('puntos');
    expect(puntos).toContain('Puntos por club');
    expect(puntos).toContain('Medallero');
  });

  it('un visitante no ve el cronómetro ni las acciones del admin', () => {
    const c = ctx({ member: null, isAdmin: false, isOwner: false, canScore: false });
    const t = text(render(createElement(MeetPage, { meetId: M }), `/l/${L}/e/${M}?ver=cronometro`, c));
    expect(t).not.toContain('SALIDA');
    expect(t).not.toContain('Finalizar');
    // Pide el cronómetro y cae en los resultados (ya hay tiempos).
    expect(t).toContain('30.00');
  });

  it('el cronometrista (anotador de la liga) sí cronometra', () => {
    const c = ctx({ member: members[1], isAdmin: false, isOwner: false, canScore: false, myPlayerId: 'p4' });
    expect(text(render(createElement(MeetPage, { meetId: M }), `/l/${L}/e/${M}?ver=cronometro`, c))).toContain('SALIDA');
  });

  it('tabla de la temporada, mis marcas, perfil de un nadador y el admin', () => {
    expect(text(render(createElement(screens.Standings!)))).toContain('Delfines');
    const mine = text(render(createElement(screens.MyProfile!), `/l/${L}/perfil`, ctx({ myPlayerId: 'p4' })));
    expect(mine).toContain('Mis marcas');
    expect(mine).toContain('33.00');
    const player = text(
      render(createElement(Routes, null, createElement(Route, { path: '/l/:lid/j/:playerId', element: createElement(screens.Player!) })), `/l/${L}/j/p4`),
    );
    expect(player).toContain('Pedro Ruiz');
    const swimmers = text(render(createElement(screens.adminTabs![0].Component)));
    expect(swimmers).toContain('Ana Pérez');
    expect(swimmers).toContain('2016');
    const clubs = text(render(createElement(screens.adminTabs![1].Component)));
    expect(clubs).toContain('Tiburones');
    expect(clubs).toContain('Cronometristas');
  });
});
