/**
 * Humo de las temporadas y los playoffs en una liga de equipos (baloncesto): la tabla con el selector de temporada
 * (la activa se calcula; una cerrada muestra sus premios y la tabla guardada), la pestaña Playoffs (la llave, la
 * serie «1–0», el próximo juego; el admin arma el playoff) y el cierre de la temporada en Admin. Sin navegador
 * (renderToString) y con los datos puestos en la caché.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '../../../lib/data/client';
import { keys } from '../../../lib/data/keys';
import { matchKeys, type Match, type MatchSide } from '../../../lib/data/matches';
import { playoffKeys, type Playoff } from '../../../lib/data/playoffs';
import { seasonKeys } from '../../../lib/data/seasons';
import { seasonTeamKeys, type SeasonTeam } from '../../../lib/data/seasonTeams';
import { teamSportKeys } from '../../../lib/data/teamSports';
import { LeagueContext, type LeagueCtx } from '../../../lib/league';
import type { Season } from '../../../lib/seasons';
import type { League, Member, Player } from '../../../lib/types';
import { FeedbackProvider } from '../../../components/feedback';
import { makeSnapshot } from '../../../components/season/logic';
import { CloseSeasonModal } from '../../../components/season/SeasonAdmin';
import screens from '../basketball/screens';
import { basketballSnapshot, useBasketballSeasonTable } from '../basketball/seasonTable';
import { templateRules } from '../basketball/rules';
import { footballSnapshot } from '../football/seasonTable';

const lid = 'l1';
const now = Date.now();
const league: League = {
  id: lid,
  name: 'Baloncesto del Barrio',
  kind: 'liga',
  visibility: 'public',
  ownerUid: 'u-admin',
  venue: 'Cancha',
  schedule: '',
  seasonStart: '2000-01-01',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport: 'basketball',
};
const players: Player[] = [
  { id: 'p1', name: 'Ana Pérez', averageOverride: null, uid: 'u-ana' },
  { id: 'p2', name: 'Luis Soto', averageOverride: null },
  { id: 'p9', name: 'Viejo Lobo', averageOverride: null },
];
const members: Member[] = [
  { id: `${lid}_u-admin`, leagueId: lid, uid: 'u-admin', name: 'Org', role: 'owner', playerId: null },
  { id: `${lid}_u-ana`, leagueId: lid, uid: 'u-ana', name: 'Ana', role: 'member', playerId: 'p1' },
];
const team = (id: string, name: string, order: number, seasonId: string, roster: SeasonTeam['roster']): SeasonTeam => ({
  id,
  leagueId: lid,
  name,
  color: null,
  order,
  seasonId,
  roster,
  createdAt: null,
  updatedAt: null,
});
const teams = [
  team('T1', 'Tigres', 1, 'S26', [{ playerId: 'p1', jersey: 7, position: null, role: 'captain' }]),
  team('T2', 'Leones', 2, 'S26', [{ playerId: 'p2', jersey: 10, position: null, role: 'player' }]),
  // Equipo de la temporada pasada: no sale en la tabla de ahora.
  team('T0', 'Lobos', 1, 'S99', [{ playerId: 'p9', jersey: 1, position: null, role: 'captain' }]),
];
const sides = (a: string, b: string): [MatchSide, MatchSide] => [
  { side: 1, teamId: a, label: a, seed: null, players: [] },
  { side: 2, teamId: b, label: b, seed: null, players: [] },
];
function match(id: string, p: Partial<Match>): Match {
  return {
    id,
    leagueId: lid,
    eventId: null,
    round: 1,
    stage: '',
    bracketKey: null,
    court: 'Cancha 1',
    scheduledAt: new Date(now - 7 * 86_400_000).toISOString(),
    status: 'confirmed',
    format: 'fiba',
    requireConfirm: true,
    score: { text: '70-64', sides: [70, 64], lines: 'p1:1:24:4:4:4:3;p2:2:10:0:5:0:5' },
    winner: 1,
    walkoverSide: null,
    scorerId: null,
    leaseUntil: null,
    seq: 0,
    version: 0,
    proposedBy: null,
    proposedAt: null,
    proposedSide: null,
    confirmedBy: null,
    confirmedAt: null,
    disputedBy: null,
    disputedAt: null,
    disputeNote: null,
    note: null,
    createdBy: null,
    seriesId: null,
    sides: sides('T1', 'T2'),
    createdAt: null,
    updatedAt: null,
    ...p,
  };
}
const regular = match('m1', {});
// Juego 1 de la final (lo ganó Leones de visita) y el juego 2, sin fecha: no suman en la tabla.
const po1 = match('po1', { seriesId: 'fin', bracketKey: 'PO1-1', stage: 'Final · Juego 1', winner: 2, round: 1 });
const po2 = match('po2', { seriesId: 'fin', bracketKey: 'PO1-1', stage: 'Final · Juego 2', status: 'scheduled', winner: null, score: null, scheduledAt: null, sides: sides('T2', 'T1') });
const matches = [regular, po1, po2];

const oldSnapshot = makeSnapshot('basketball', [
  {
    key: 'tabla',
    title: 'Tabla',
    nameLabel: 'Equipo',
    columns: [{ label: 'PJ' }, { label: 'Pts' }],
    rows: [
      { rank: 1, name: 'Lobos', teamId: 'T0', values: [10, 18] },
      { rank: 2, name: 'Zorros', values: [10, 12] },
    ],
  },
]);
const seasons: Season[] = [
  { id: 'S26', name: 'Temporada 2000', startsOn: '2000-01-01', endsOn: null, status: 'active', closedAt: null, closedBy: null, standings: null, awards: [], playoffs: [] },
  {
    id: 'S99',
    name: 'Temporada 1999',
    startsOn: '1999-01-01',
    endsOn: '1999-12-31',
    status: 'closed',
    closedAt: '1999-12-31T20:00:00.000Z',
    closedBy: 'u-admin',
    standings: oldSnapshot,
    awards: [
      { id: 'a1', kind: 'campeon', label: 'Campeón', name: 'Lobos', playerId: null, teamId: 'T0', note: null },
      { id: 'a2', kind: 'mvp', label: 'MVP', name: 'Viejo Lobo', playerId: 'p9', teamId: null, note: 'Tremenda temporada' },
    ],
    playoffs: [],
  },
];
const playoff: Playoff = {
  id: 'po',
  leagueId: lid,
  seasonId: 'S26',
  name: 'Playoffs',
  status: 'active',
  bestOf: [3],
  seeds: ['T1', 'T2'],
  winner: null,
  createdAt: new Date(now).toISOString(),
  series: [
    {
      id: 'fin',
      playoffId: 'po',
      round: 1,
      slot: 1,
      bestOf: 3,
      teamA: 'T1',
      teamB: 'T2',
      seedA: 1,
      seedB: 2,
      labelA: 'Tigres',
      labelB: 'Leones',
      winsA: 0,
      winsB: 1,
      winner: null,
      bye: false,
      nextSeries: null,
      nextSide: null,
    },
  ],
};

function seed(opts: { playoffs?: Playoff[] } = {}) {
  queryClient.setQueryData(keys.players(lid), players);
  queryClient.setQueryData(keys.leagueMembers(lid), members);
  queryClient.setQueryData(seasonTeamKeys.league(lid), teams);
  queryClient.setQueryData(matchKeys.league(lid), matches);
  queryClient.setQueryData(teamSportKeys.officials(lid), []);
  queryClient.setQueryData(teamSportKeys.rules(lid), templateRules('fiba'));
  queryClient.setQueryData(seasonKeys.list(lid), seasons);
  queryClient.setQueryData(playoffKeys.league(lid), opts.playoffs ?? [playoff]);
}

function ctx(role: 'admin' | 'captain' | 'visit'): LeagueCtx {
  const admin = role === 'admin';
  return {
    lid,
    league,
    member: role === 'visit' ? null : members[admin ? 0 : 1],
    isAdmin: admin,
    isOwner: admin,
    isScorer: false,
    canScore: admin,
    myPlayerId: role === 'captain' ? 'p1' : null,
    base: `/l/${lid}`,
  };
}

function render(el: ReactElement, url: string, role: 'admin' | 'captain' | 'visit'): string {
  return renderToString(
    h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx(role) }, h(Routes, null, h(Route, { path: '*', element: el }))))),
  );
}

const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');

beforeEach(() => seed());
afterEach(() => queryClient.invalidateAll());

describe('temporadas en una liga de equipos', () => {
  it('tabla de la temporada en curso: el selector, sus equipos y sin los juegos del playoff', () => {
    const t = text(render(h(screens.Standings!), `/l/${lid}/ranking`, 'captain'));
    expect(t).toContain('Temporada 2000 (en curso)');
    expect(t).toContain('Temporada 1999');
    expect(t).toContain('Desde 1 ene 2000');
    expect(t).toContain('Tigres');
    expect(t).not.toContain('Lobos');
    // Un solo partido en la tabla: el de temporada regular (el del playoff no suma).
    expect(t).toMatch(/Tigres 1 1 0/);
  });

  it('una temporada cerrada: sus premios y la tabla que se guardó', () => {
    const t = text(render(h(screens.Standings!), `/l/${lid}/ranking?temporada=S99`, 'captain'));
    expect(t).toContain('Campeón: Lobos');
    expect(t).toContain('MVP: Viejo Lobo');
    expect(t).toContain('Tremenda temporada');
    expect(t).toContain('Zorros');
    expect(t).toContain('Cerrada · 1 ene 1999 – 31 dic 1999');
    expect(t).toContain('Todas las temporadas');
    expect(t).not.toContain('Anotadores');
  });

  it('playoffs: la llave, la serie en palabras y el próximo juego sin fecha (el admin lo ve)', () => {
    const t = text(render(h(screens.Playoffs!), `/l/${lid}/playoffs`, 'admin'));
    expect(t).toContain('Playoffs');
    expect(t).toContain('En juego');
    expect(t).toContain('Final');
    expect(t).toContain('Al mejor de 3 (gana el primero en llegar a 2)');
    expect(t).toContain('Leones gana 1–0');
    expect(t).toContain('Próximo juego');
    expect(t).toContain('Final · Juego 2');
    expect(t).toContain('Sin fecha todavía');
    expect(t).toContain('Borrar playoffs');
    const visit = text(render(h(screens.Playoffs!), `/l/${lid}/playoffs`, 'visit'));
    expect(visit).not.toContain('Borrar playoffs');
    expect(visit).not.toContain('Sin fecha todavía');
  });

  it('sin playoff: el admin lo arma con los primeros de la tabla; los demás ven que no hay', () => {
    seed({ playoffs: [] });
    const admin = text(render(h(screens.Playoffs!), `/l/${lid}/playoffs`, 'admin'));
    expect(admin).toContain('Armar playoffs');
    expect(admin).toContain('Los 2 primeros');
    expect(admin).toContain('Final');
    expect(admin).toContain('Al mejor de 5');
    const visit = text(render(h(screens.Playoffs!), `/l/${lid}/playoffs`, 'visit'));
    expect(visit).toContain('Sin playoffs en esta temporada');
    // Una temporada cerrada sin playoff.
    const old = text(render(h(screens.Playoffs!), `/l/${lid}/playoffs?temporada=S99`, 'admin'));
    expect(old).toContain('Esta temporada se cerró sin playoffs.');
  });

  it('cerrar la temporada: la tabla final y el podio propuesto (se puede cambiar)', () => {
    const html = render(
      h(CloseSeasonModal, { season: seasons[0], useTable: useBasketballSeasonTable, onClose: () => undefined }),
      `/l/${lid}/admin?tab=temporada`,
      'admin',
    );
    const t = text(html);
    expect(t).toContain('Cerrar Temporada 2000');
    expect(t).toContain('Tabla final');
    expect(t).toContain('Anotadores');
    expect(t).toContain('Subcampeón');
    expect(t).toContain('MVP (opcional)');
    expect(t).toContain('Otro premio');
    // Campeón propuesto: el primero de la tabla (Tigres); subcampeón: Leones.
    expect(html).toMatch(/aria-label="Campeón"[^>]*>.*?<option value="t:T1" selected=""/s);
    expect(html).toMatch(/aria-label="Subcampeón"[^>]*>.*?<option value="t:T2" selected=""/s);
  });
});

describe('la foto de cada deporte de equipos', () => {
  it('baloncesto: tabla con los equipos y anotadores con sus jugadores', () => {
    const s = basketballSnapshot(
      {
        standings: [{ id: 'T1', played: 2, won: 2, drawn: 0, lost: 0, points: 4, for: 150, against: 120, diff: 30, extra: {}, rank: 1 }],
        leaders: [
          { player: 'p1', team: 'T1', games: 2, points: 40, avg: 20, high: 24, threes: 3, ftm: 4, fouls: 2 },
          { player: 'p2', team: 'T1', games: 2, points: 0, avg: 0, high: 0, threes: 0, ftm: 0, fouls: 1 },
        ],
      },
      (id) => (id === 'T1' ? 'Tigres' : '?'),
      (id) => (id === 'p1' ? 'Ana' : 'Luis'),
      0,
    );
    expect(s.tables.map((x) => x.key)).toEqual(['tabla', 'anotadores']);
    expect(s.tables[0].rows[0]).toEqual({ rank: 1, name: 'Tigres', teamId: 'T1', values: [2, 2, 0, 150, 120, '+30', 4] });
    // Sin puntos no sale en anotadores.
    expect(s.tables[1].rows).toEqual([{ rank: 1, name: 'Ana', playerId: 'p1', values: [2, 20, 24, 3, 40] }]);
  });

  it('fútbol: una tabla por grupo si hay grupos; goleadores y vallas', () => {
    const row = (id: string, rank: number) => ({ id, played: 1, won: 1, drawn: 0, lost: 0, points: 3, for: 2, against: 0, diff: 2, extra: {}, rank });
    const scorer = { player: 'p1', team: 'T1', games: 1, goals: 2, assists: 1, ownGoals: 0, yellows: 0, reds: 0, keeperGames: 1, cleanSheets: 1, conceded: 0 };
    const s = footballSnapshot(
      { standings: [row('T1', 1)], groups: [{ stage: 'Grupo A', rows: [row('T1', 1)] }], scorers: [scorer], keepers: [scorer] },
      'futsal',
      () => 'Tigres',
      () => 'Ana',
      0,
    );
    expect(s.sport).toBe('futsal');
    expect(s.tables.map((x) => x.title)).toEqual(['Grupo A', 'Goleadores', 'Vallas invictas']);
    expect(s.tables[1].rows[0].values).toEqual([1, 1, 2]);
  });
});
