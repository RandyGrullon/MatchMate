/**
 * Humo de las piezas de temporadas comunes a todos los deportes: el historial (/l/:lid/temporadas), «Campeones» en
 * el inicio de la liga, Admin › Temporada (cerrar, corregir, nueva) y la foto de cada deporte (boliche, raqueta,
 * golf y natación). Sin navegador (renderToString) y con los datos puestos en la caché.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { queryClient } from '../../lib/data/client';
import { seasonKeys } from '../../lib/data/seasons';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { Season, SeasonChampion } from '../../lib/seasons';
import type { Entry, League } from '../../lib/types';
import { FeedbackProvider } from '../feedback';
import { bowlingSnapshot, bowlingSuggested } from './bowlingTable';
import { ChampionsSection } from './ChampionsSection';
import { makeSnapshot, type Podium } from './logic';
import SeasonAdmin, { CloseSeasonModal, StartSeasonModal } from './SeasonAdmin';
import SeasonsPage from './SeasonsPage';
import { SnapshotTables } from './SeasonView';
import { golfSnapshot } from '../../pages/sports/golf/seasonTable';
import { racketSnapshot } from '../../pages/sports/racket/seasonTable';
import { swimSnapshot } from '../../pages/sports/swimming/seasonTable';

const lid = 'l1';
const league = (sport: string, kind: 'liga' | 'torneo' = 'liga'): League => ({
  id: lid,
  name: 'Liga del Club',
  kind,
  visibility: 'public',
  ownerUid: 'u-admin',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport,
});

function ctx(sport: string, admin: boolean, kind: 'liga' | 'torneo' = 'liga'): LeagueCtx {
  return {
    lid,
    league: league(sport, kind),
    member: admin ? { id: `${lid}_u`, leagueId: lid, uid: 'u-admin', name: 'Org', role: 'owner', playerId: null } : null,
    isAdmin: admin,
    isOwner: admin,
    isScorer: false,
    canScore: admin,
    myPlayerId: null,
    base: `/l/${lid}`,
  };
}

function render(el: ReactElement, c: LeagueCtx, url = `/l/${lid}`): string {
  return renderToString(
    h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: c }, h(Routes, null, h(Route, { path: '*', element: el }))))),
  );
}

const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');

const snapshot = makeSnapshot(
  'bowling',
  [
    {
      key: 'promedio',
      title: 'Promedio',
      nameLabel: 'Jugador',
      columns: [{ label: 'Juegos' }, { label: 'Máx', wide: true }, { label: 'Prom.' }],
      rows: [
        { rank: 1, name: 'Ana', playerId: 'p1', values: [30, 245, 201] },
        { rank: 2, name: 'Beto', playerId: 'p2', values: [24, 230, 188] },
      ],
      note: 'Con 6 juegos verificados o más en la temporada.',
    },
    { key: 'juego', title: 'Mejor juego', nameLabel: 'Jugador', columns: [{ label: 'Juego' }], rows: [{ rank: 1, name: 'Beto', playerId: 'p2', values: [279] }] },
  ],
  0,
);

const active: Season = { id: 's2', name: 'Temporada 2026', startsOn: '2026-01-10', endsOn: '2026-11-30', status: 'active', closedAt: null, closedBy: null, standings: null, awards: [], playoffs: [] };
const closed: Season = {
  id: 's1',
  name: 'Temporada 2025',
  startsOn: '2025-01-05',
  endsOn: '2025-12-20',
  status: 'closed',
  closedAt: '2025-12-20T22:00:00.000Z',
  closedBy: 'u-admin',
  standings: snapshot,
  awards: [
    { id: 'a1', kind: 'campeon', label: 'Campeón', name: 'Ana', playerId: 'p1', teamId: null, note: null },
    { id: 'a2', kind: 'mas_mejorado', label: 'Más mejorado', name: 'Beto', playerId: 'p2', teamId: null, note: '+18 de promedio' },
    { id: 'a3', kind: 'otro', label: 'Mejor compañero', name: 'Carla', playerId: 'p3', teamId: null, note: null },
  ],
  playoffs: [],
};

afterEach(() => queryClient.invalidateAll());

describe('historial de temporadas', () => {
  it('cada temporada con sus fechas, el campeón y los premios; la en curso lleva a su tabla', () => {
    queryClient.setQueryData(seasonKeys.list(lid), [active, closed]);
    const t = text(render(h(SeasonsPage), ctx('bowling', true), `/l/${lid}/temporadas`));
    expect(t).toContain('Temporadas');
    expect(t).toContain('Temporada 2026 En curso');
    expect(t).toContain('10 ene 2026 – 30 nov 2026');
    expect(t).toContain('Temporada 2025 Cerrada');
    expect(t).toContain('Campeón: Ana');
    expect(t).toContain('Más mejorado: Beto');
    expect(t).toContain('+18 de promedio');
    expect(t).toContain('Mejor compañero: Carla');
    expect(t).toContain('Ver la tabla final');
    expect(t).toContain('Ver cómo va la tabla');
    expect(t).toContain('Cerrar o empezar temporada');
    // Quien no es admin no ve el link al Admin.
    expect(text(render(h(SeasonsPage), ctx('bowling', false), `/l/${lid}/temporadas`))).not.toContain('Cerrar o empezar temporada');
  });

  it('una cerrada sin tabla guardada (un año de antes de las temporadas) lleva a su tabla calculada', () => {
    const before: Season = { ...closed, id: 's0', name: 'Temporada 2024', startsOn: '2024-01-01', endsOn: '2024-12-31', standings: null, awards: [] };
    queryClient.setQueryData(seasonKeys.list(lid), [active, before]);
    const html = render(h(SeasonsPage), ctx('bowling', false), `/l/${lid}/temporadas`);
    expect(text(html)).toContain('Sin campeón anotado');
    expect(text(html)).not.toContain('Ver la tabla final');
    expect(html).toContain(`href="/l/${lid}/ranking?temporada=s0"`);
  });

  it('sin temporadas: vacío', () => {
    queryClient.setQueryData(seasonKeys.list(lid), []);
    expect(text(render(h(SeasonsPage), ctx('padel', false)))).toContain('Todavía no hay temporadas');
  });

  it('la tabla guardada: pestañas si son varias, la columna ancha se esconde en el teléfono', () => {
    const html = render(h(SnapshotTables, { snapshot, highlight: ['p2'] }), ctx('bowling', false));
    const t = text(html);
    expect(t).toContain('Promedio');
    expect(t).toContain('Mejor juego');
    expect(t).toContain('Ana');
    expect(t).toContain('Con 6 juegos verificados');
    expect(html).toContain('hidden sm:table-cell');
    expect(html).toContain('bg-accent-soft/50');
  });
});

describe('Campeones en el inicio de la liga', () => {
  const champions: SeasonChampion[] = [
    { seasonId: 's1', name: 'Temporada 2025', startsOn: '2025-01-05', endsOn: '2025-12-20', closedAt: null, champion: { label: 'Campeón', name: 'Ana', playerId: 'p1', teamId: null }, awards: [] },
    { seasonId: 's0', name: 'Temporada 2024', startsOn: '2024-01-05', endsOn: '2024-12-20', closedAt: null, champion: null, awards: [] },
  ];

  it('las temporadas cerradas con su campeón y el link al historial', () => {
    queryClient.setQueryData(seasonKeys.champions(lid), champions);
    const t = text(render(h(ChampionsSection), ctx('football', false)));
    expect(t).toContain('Campeones');
    expect(t).toContain('Ana');
    expect(t).toContain('Temporada 2025 · 5 ene 2025 – 20 dic 2025');
    expect(t).toContain('Sin campeón anotado');
    expect(t).toContain('Temporadas');
  });

  it('sin temporadas cerradas (o en un torneo suelto) no sale', () => {
    queryClient.setQueryData(seasonKeys.champions(lid), []);
    expect(text(render(h(ChampionsSection), ctx('football', false)))).not.toContain('Campeones');
    queryClient.setQueryData(seasonKeys.champions(lid), champions);
    expect(text(render(h(ChampionsSection), ctx('football', false, 'torneo')))).not.toContain('Campeones');
  });
});

describe('Admin › Temporada', () => {
  it('con la temporada en curso: cerrarla (la nueva después); la cerrada se puede corregir', () => {
    queryClient.setQueryData(seasonKeys.list(lid), [active, closed]);
    const t = text(render(h(SeasonAdmin), ctx('bowling', true)));
    expect(t).toContain('Temporada 2026 En curso');
    expect(t).toContain('termina el 30 nov 2026 (previsto)');
    expect(t).toContain('Cerrar temporada');
    expect(t).toContain('primero cierra esta');
    expect(t).not.toContain('Nueva temporada');
    expect(t).toContain('Corregir premios');
    expect(t).toContain('Campeón: Ana');
    expect(t).toContain('Historial de temporadas');
  });

  it('sin temporada en curso: empezar la nueva', () => {
    queryClient.setQueryData(seasonKeys.list(lid), [closed]);
    const t = text(render(h(SeasonAdmin), ctx('bowling', true)));
    expect(t).toContain('No hay temporada en curso: Temporada 2025 está cerrada');
    expect(t).toContain('Nueva temporada');
  });

  it('cerrar: un playoff a medias pide cuidado; con grupos el podio lo elige el admin; con cuadro, sale de su final', () => {
    const table = (podium?: Podium | null) => () => ({ loading: false, snapshot: makeSnapshot('football', []), teams: [], players: [], podium });
    const close = (season: Season, podium?: Podium | null) =>
      text(render(h(CloseSeasonModal, { season, useTable: table(podium), onClose: () => undefined }), ctx('football', true)));
    const running = close({ ...active, playoffs: [{ id: 'po', name: 'Playoffs', status: 'active', champion: null, runnerUp: null, semifinalists: [] }] });
    expect(running).toContain('Los playoffs no han terminado');
    const groups = close(active, null);
    expect(groups).toContain('La tabla va por grupos');
    expect(groups).not.toContain('Los playoffs no han terminado');
    expect(close(active, ['t:T1', 't:T2', ''])).toContain('salen de la final del cuadro');
    // Corregir una cerrada: se pueden agregar los premios de siempre que no se dieron (MVP, fair play…).
    const fix = close(closed);
    expect(fix).toContain('Corregir Temporada 2025');
    expect(fix).toContain('MVP (opcional)');
    expect(fix).toContain('Fair play (opcional)');
  });

  it('nueva temporada: nombre, fechas y (ligas de equipos) copiar los equipos', () => {
    const team = text(render(h(StartSeasonModal, { seasons: [closed], teamSport: true, onClose: () => undefined }), ctx('basketball', true)));
    expect(team).toContain('Nueva temporada');
    expect(team).toContain('Empieza');
    expect(team).toContain('Termina (opcional)');
    expect(team).toContain('Copiar los equipos de la temporada anterior');
    const solo = text(render(h(StartSeasonModal, { seasons: [closed], teamSport: false, onClose: () => undefined }), ctx('golf', true)));
    expect(solo).not.toContain('Copiar los equipos');
  });
});

describe('la foto de cada deporte', () => {
  it('boliche: promedio con el mínimo de juegos y mejor juego (solo juegos verificados)', () => {
    const entry = (id: string, playerId: string, scores: number[], verified = true): Entry => ({
      id,
      eventId: 'e',
      playerId,
      teamId: null,
      average: 0,
      handicapOverride: null,
      scores,
      photos: scores.map(() => (verified ? 'importado' : null)),
    });
    const s = bowlingSnapshot(
      [entry('1', 'p1', [200, 210, 190]), entry('2', 'p2', [250]), entry('3', 'p2', [300], false), entry('4', 'px', [100])],
      [
        { id: 'p1', name: 'Ana' },
        { id: 'p2', name: 'Beto' },
      ],
      0,
      3,
    );
    expect(s.tables[0].rows).toEqual([{ rank: 1, name: 'Ana', playerId: 'p1', values: [3, 210, 200] }]);
    expect(s.tables[1].rows.map((r) => [r.name, r.values[2]])).toEqual([
      ['Beto', 250],
      ['Ana', 210],
    ]);
  });

  it('boliche: se propone el más mejorado contra la temporada anterior (con el mínimo en las dos)', () => {
    const entry = (id: string, playerId: string, scores: number[]): Entry => ({
      id,
      eventId: 'e',
      playerId,
      teamId: null,
      average: 0,
      handicapOverride: null,
      scores,
      photos: scores.map(() => 'importado'),
    });
    const players = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
    const current = [entry('1', 'p1', [180, 180, 180]), entry('2', 'p2', [200, 200, 200]), entry('3', 'p3', [220, 220])];
    const previous = [entry('4', 'p1', [150, 150, 150]), entry('5', 'p2', [190, 190, 190]), entry('6', 'p3', [100, 100, 100])];
    // p1 subió 30 y p2 10; p3 subió más pero no llega al mínimo esta temporada.
    expect(bowlingSuggested(current, previous, players, 3)).toEqual({ mas_mejorado: 'p:p1' });
    // Nadie subió (o no hay anterior): no se propone nadie.
    expect(bowlingSuggested(previous, current, players, 3)).toEqual({});
    expect(bowlingSuggested(current, [], players, 3)).toEqual({});
  });

  it('raqueta: rankings, cada liga de parejas (a la pareja) y las noches', () => {
    const row = (id: string, rank: number) => ({ id, played: 2, won: 1, drawn: 0, lost: 1, points: 3, for: 12, against: 10, diff: 2, extra: { setsDiff: 1 }, rank });
    const s = racketSnapshot({
      sport: 'padel',
      doubles: true,
      comps: [{ key: 'liga', name: 'Liga de parejas', rows: [row('pair1', 1), row('p:a+b', 2)] }],
      rankings: [{ key: 'ranking', title: 'Ranking', rows: [row('a', 1)] }],
      nights: [{ id: 'a', rank: 1, nights: 2, played: 8, won: 5, drawn: 0, lost: 3, points: 90, against: 70, avg: 11.3 }],
      nightsWord: 'Noches',
      names: {
        entrantName: (id) => (id === 'pair1' ? 'Ana / Beto' : 'Carla / Dani'),
        nameOf: () => 'Ana',
        team: (id) => (id === 'pair1' ? ({ id, name: 'Ana / Beto' } as never) : undefined),
      },
      now: 0,
    });
    expect(s.tables.map((x) => x.title)).toEqual(['Ranking', 'Liga de parejas', 'Noches']);
    expect(s.tables[1].rows[0]).toMatchObject({ name: 'Ana / Beto', teamId: 'pair1', values: [2, 1, 1, '+1', 12, 10, 3] });
    // Un lado sin pareja no es de nadie (no se le puede dar un premio).
    expect(s.tables[1].rows[1]).toEqual({ rank: 2, name: 'Carla / Dani', values: [2, 1, 1, '+1', 12, 10, 3] });
    expect(s.tables[2].rows[0]).toMatchObject({ playerId: 'a', values: [2, 8, 5, 11.3, 90] });
  });

  it('golf y natación', () => {
    const g = golfSnapshot([{ id: 'p1', points: 120, events: 4, wins: 2, best: 1, rank: 1 }], () => 'Ana', 4, 0);
    expect(g.tables[0]).toMatchObject({ title: 'Orden de mérito', note: 'Puntos por puesto en cada ronda cerrada (4 eventos).' });
    expect(g.tables[0].rows[0]).toEqual({ rank: 1, name: 'Ana', playerId: 'p1', values: [4, 2, 1, 120] });
    const sw = swimSnapshot({ meets: [], clubs: [{ clubId: 'c1', points: 88.5, gold: 3, silver: 1, bronze: 0, rank: 1, byMeet: {} }] }, () => 'Delfines', 0);
    expect(sw.tables[0].rows[0]).toEqual({ rank: 1, name: 'Delfines', values: [3, 1, 0, 88.5] });
    expect(sw.tables[0].note).toBe('Suma de 0 encuentros. El control de marcas no cuenta.');
  });
});
