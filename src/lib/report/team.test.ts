import { describe, expect, it } from 'vitest';
import type { Match } from '../data/matches';
import type { Playoff, PlayoffSeries } from '../data/playoffs';
import { footballScore, footballWinner } from '../../pages/sports/football/adapter';
import { mkMatch } from '../../pages/sports/racket/logic/testMatch';
import { teamKoComplete } from '../../prizes/sports';
import { football, footballConfig, type FootballEvent } from '../../sports/team/football';
import { replay } from '../../sports/types';
import { LEAGUE } from './fixtures';
import { playoffReport, teamKoReport, type TeamReportNames } from './team';
import { excelLines, pdfPages, podiumsBrief, view } from './testing';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const PEOPLE: Record<string, string> = { a: 'Ana', b: 'Beto', c: 'Carla', d: 'Dani', e: 'Eva', f: 'Fer', g: 'Gabi', h: 'Hugo' };
const TEAMS: Record<string, { name: string; roster: string[] }> = {
  A: { name: 'Tigres', roster: ['a', 'b'] },
  B: { name: 'Leones', roster: ['c', 'd'] },
  C: { name: 'Pumas', roster: ['e', 'f'] },
  D: { name: 'Lobos', roster: ['g', 'h'] },
};
const names: TeamReportNames = {
  nameOf: (id) => PEOPLE[id] ?? '(jugador borrado)',
  teamName: (id) => TEAMS[id]?.name ?? null,
  rosterOf: (id) => TEAMS[id]?.roster ?? [],
};
const at = (h: number) => `2026-10-12T${String(h).padStart(2, '0')}:00:00Z`;

// ---------- Fútbol: relámpago de 4 (2 grupos de 2, pasa 1) y la final ----------

const FIELD = footballConfig('football');
/** Un partido de fútbol confirmado con el acta del adaptador. */
function played(id: string, stage: string, home: string, away: string, log: FootballEvent[], extra: Partial<Match> = {}): Match {
  const s = replay(football, FIELD, [{ type: 'lineup', side: 1, players: TEAMS[home].roster }, { type: 'lineup', side: 2, players: TEAMS[away].roster }, ...log]);
  return mkMatch({ id, stage, teams: [home, away], format: 'football', status: 'confirmed', score: footballScore(s, NOW), winner: footballWinner(s), ...extra });
}
const GROUPS = [
  played('g1', 'Grupo A', 'A', 'B', [{ type: 'goal', side: 1, player: 'a' }, { type: 'goal', side: 1, player: 'a', assist: 'b' }, { type: 'goal', side: 2, player: 'c' }], { scheduledAt: at(14) }),
  played('g2', 'Grupo B', 'C', 'D', [{ type: 'goal', side: 1, player: 'e' }, { type: 'card', side: 2, player: 'g', card: 'yellow' }], { scheduledAt: at(14) }),
];
const FINAL = played('f', 'Final', 'A', 'C', [{ type: 'goal', side: 1, player: 'b' }], { bracketKey: 'R1-1', scheduledAt: at(16) });
const FOOTBALL = { ...LEAGUE, name: 'Relámpago de Barrio', kind: 'torneo' as const, sport: 'football', venue: 'Cancha del Club' };
const RULES = { tournament: { groups: 2, perGroup: 1, thirdPlace: false } };
const ko = (matches: Match[], league = FOOTBALL) =>
  teamKoReport({ lid: 'L1', league, title: 'Relámpago de Barrio', date: '2026-10-12', matches, teamIds: ['A', 'B', 'C', 'D'], names, rules: RULES, now: NOW });

describe('reporte del torneo relámpago (fútbol)', () => {
  it('arriba: el torneo sin liga (solo el deporte), la fecha, la cancha y el formato', () => {
    const r = ko([...GROUPS, FINAL]);
    expect(r.title).toBe('Relámpago de Barrio');
    expect(r.subtitle).toBe('Fútbol de campo');
    expect(r.facts.map((f) => f.label)).toEqual(['Fecha', 'Cancha', 'Formato']);
    expect(r.facts[2].value).toBe('2 grupos, pasa 1 de cada uno · eliminatoria · 4 equipos');
  });

  it('el campeón y el subcampeón de la eliminatoria (con su plantilla), y terminado', () => {
    const r = ko([...GROUPS, FINAL]);
    expect(r.final).toBe(true);
    expect(r.notes).toEqual([]);
    expect(podiumsBrief(r)).toEqual([
      [
        'Equipos',
        [
          [1, [['Tigres', 'Ana y Beto', null]]],
          [2, [['Pumas', 'Eva y Fer', null]]],
        ],
      ],
    ]);
    expect(teamKoComplete([...GROUPS, FINAL], NOW)).toBe(true);
    expect(teamKoComplete(GROUPS, NOW)).toBe(false);
  });

  it('General: la tabla de cada grupo y los partidos por fase', () => {
    const r = ko([...GROUPS, FINAL]);
    expect(r.general.map((t) => t.title)).toEqual(['Grupo A', 'Grupo B', 'Partidos']);
    const a = view(r.general[0], 'pdf');
    expect(a.head).toEqual(['Lugar', 'Equipo', 'PJ', 'G', 'E', 'P', 'GF', 'GC', 'Dif.', 'Pts']);
    expect(a.rows).toEqual([
      [1, 'Tigres', 1, 1, 0, 0, 2, 1, 1, 3],
      [2, 'Leones', 1, 0, 0, 1, 1, 2, -1, 0],
    ]);
    const partidos = view(r.general[2], 'pdf');
    expect(partidos.head).toEqual(['Local', 'Marcador', 'Visita']);
    expect(partidos.rows).toEqual(['Grupo A', ['Tigres', '2-1', 'Leones'], 'Grupo B', ['Pumas', '1-0', 'Lobos'], 'Final', ['Tigres', '1-0', 'Pumas']]);
  });

  it('Individual: los goleadores de todo el torneo (todos los que jugaron), con tarjetas', () => {
    const r = ko([...GROUPS, FINAL]);
    const g = view(r.individual[0], 'pdf');
    expect(r.individual[0].title).toBe('Goleadores');
    expect(g.head).toEqual(['#', 'Jugador', 'Equipo', 'PJ', 'Goles', 'Asist.', 'Autogoles', 'TA', 'TR']);
    expect(g.rows.slice(0, 2)).toEqual([
      [1, 'Ana', 'Tigres', 2, 2, 0, 0, 0, 0],
      [2, 'Beto', 'Tigres', 2, 1, 1, 0, 0, 0],
    ]);
    expect(g.rows.find((x) => (x as unknown[])[1] === 'Gabi')).toEqual([expect.any(Number), 'Gabi', 'Lobos', 1, 0, 0, 0, 1, 0]);
    expect(r.highlights).toEqual(
      expect.arrayContaining([
        { label: 'Máximo goleador', value: 'Ana (Tigres) · 2 goles' },
        { label: 'Goles', value: '5' },
      ]),
    );
  });

  it('sin la final: resultados parciales, con el partido por jugar', () => {
    const pending = mkMatch({ id: 'f', stage: 'Final', bracketKey: 'R1-1', teams: ['A', 'C'], format: 'football', scheduledAt: at(16) });
    const r = ko([...GROUPS, pending]);
    expect(r.final).toBe(false);
    expect(r.notes).toEqual(['Falta 1 partido por jugar o confirmar: el podio puede cambiar.']);
    expect(r.podiums).toEqual([]);
    expect(view(r.general[2], 'pdf').rows.at(-1)).toEqual(['Tigres', null, 'Pumas', 'Programado']);
  });

  it('Excel: «General», «Individual» y la liga de siempre (sin los goleadores, que ya van en «Individual»)', () => {
    const xl = excelLines(ko([...GROUPS, FINAL]));
    expect(xl.names).toEqual(['General', 'Individual', 'Calendario', 'Tabla', 'Tarjetas', 'Disciplina']);
    expect(xl.lines('Individual')[2]).toBe('#, Jugador, Equipo, PJ, Goles, Asist., Autogoles, TA, TR, Portero: PJ, Vallas invictas, Goles recibidos'.replace(/, /g, ' | '));
  });

  it('PDF: «General» con el campeón, los grupos y los partidos; «Individual» con los goleadores', () => {
    const { pages, individualFrom } = pdfPages(ko([...GROUPS, FINAL]));
    expect(individualFrom).toBe(2);
    expect(pages[0]).toEqual(expect.arrayContaining(['Resultados finales', 'Relámpago de Barrio', 'Campeones', 'Equipos', 'Tigres', 'Grupo A', 'Partidos', 'Final']));
    expect(pages[1]).toEqual(expect.arrayContaining(['Goleadores', 'Ana', 'Goles']));
  });
});

// ---------- Baloncesto: relámpago y playoff ----------

/** Un juego de baloncesto confirmado con la planilla (`lines`: jugador:lado:puntos:libres:dobles:triples:faltas). */
const hoop = (id: string, stage: string, home: string, away: string, sides: [number, number], lines: string, extra: Partial<Match> = {}): Match =>
  mkMatch({ id, stage, teams: [home, away], format: 'fiba', status: 'confirmed', score: { text: `${sides[0]}-${sides[1]}`, sides, lines }, winner: sides[0] > sides[1] ? 1 : 2, ...extra });

describe('reporte del baloncesto', () => {
  const BASKET = { ...LEAGUE, sport: 'basketball' };

  it('relámpago: tabla FIBA de cada grupo y los anotadores', () => {
    const matches = [
      hoop('g1', 'Grupo A', 'A', 'B', [70, 60], 'a:1:30:2:8:4:1;c:2:25:1:9:2:3', { scheduledAt: at(14) }),
      hoop('g2', 'Grupo B', 'C', 'D', [55, 50], 'e:1:22:0:11:0:0', { scheduledAt: at(14) }),
      hoop('f', 'Final', 'A', 'C', [80, 75], 'a:1:18:0:9:0:2;e:2:30:0:15:0:1', { bracketKey: 'R1-1', scheduledAt: at(16) }),
    ];
    const r = teamKoReport({ lid: 'L1', league: BASKET, title: 'Copa de Baloncesto', date: '2026-10-12', matches, teamIds: ['A', 'B', 'C', 'D'], names, rules: RULES, now: NOW });
    expect(r.final).toBe(true);
    expect(podiumsBrief(r)[0][1]).toEqual([
      [1, [['Tigres', 'Ana y Beto', null]]],
      [2, [['Pumas', 'Eva y Fer', null]]],
    ]);
    const a = view(r.general[0], 'pdf');
    expect(a.head).toEqual(['Lugar', 'Equipo', 'PJ', 'G', 'P', 'PF', 'PC', 'Dif.', 'Pts']);
    expect(a.rows[0]).toEqual([1, 'Tigres', 1, 1, 0, 70, 60, 10, 2]);
    const leaders = view(r.individual[0], 'pdf');
    expect(r.individual[0].title).toBe('Anotadores');
    expect(leaders.head).toEqual(['#', 'Jugador', 'Equipo', 'PJ', 'Puntos', 'Prom.', 'Máx.', 'Triples', 'TL', 'Faltas']);
    // Eva 52 (22 + 30) y Ana 48 (30 + 18).
    expect(leaders.rows.slice(0, 2)).toEqual([
      [1, 'Eva', 'Pumas', 2, 52, 26, 30, 0, 0, 1],
      [2, 'Ana', 'Tigres', 2, 48, 24, 30, 4, 2, 3],
    ]);
    expect(r.highlights).toEqual(expect.arrayContaining([{ label: 'Máximo anotador', value: 'Eva (Pumas) · 52 puntos' }]));
    expect(excelLines(r).names).toEqual(['General', 'Individual', 'Calendario', 'Tabla', 'Resultados']);
  });

  it('playoff: el podio (con los dos semifinalistas en 3.º), las series, sus juegos y los anotadores del playoff', () => {
    const series = (id: string, round: number, slot: number, a: string, b: string, wins: [number, number], next: string | null): PlayoffSeries => ({
      id,
      playoffId: 'P1',
      round,
      slot,
      bestOf: 3,
      teamA: a,
      teamB: b,
      seedA: ['A', 'B', 'C', 'D'].indexOf(a) + 1,
      seedB: ['A', 'B', 'C', 'D'].indexOf(b) + 1,
      labelA: null,
      labelB: null,
      winsA: wins[0],
      winsB: wins[1],
      winner: wins[0] === 2 ? a : wins[1] === 2 ? b : null,
      bye: false,
      nextSeries: next,
      nextSide: null,
    });
    const playoff: Playoff = {
      id: 'P1',
      leagueId: 'L1',
      seasonId: 'S1',
      name: 'Playoffs 2026',
      status: 'finished',
      bestOf: [3, 3],
      seeds: ['A', 'B', 'C', 'D'],
      winner: 'A',
      createdAt: null,
      series: [series('s1', 1, 1, 'A', 'D', [2, 0], 's3'), series('s2', 1, 2, 'B', 'C', [2, 1], 's3'), series('s3', 2, 1, 'A', 'B', [2, 0], null)],
    };
    const games = [
      hoop('j1', 'Semifinal', 'A', 'D', [60, 50], 'a:1:20:0:10:0:0', { seriesId: 's1', scheduledAt: '2026-11-01T20:00:00Z' }),
      hoop('j2', 'Semifinal', 'D', 'A', [55, 58], 'a:2:25:1:9:2:0', { seriesId: 's1', scheduledAt: '2026-11-03T20:00:00Z' }),
      hoop('j3', 'Final', 'A', 'B', [70, 65], 'c:2:31:1:12:2:4', { seriesId: 's3', scheduledAt: '2026-11-10T20:00:00Z' }),
      // Un partido de la temporada: no es del playoff.
      hoop('x', '', 'A', 'B', [90, 10], 'a:1:60:0:30:0:0'),
    ];
    const r = playoffReport({ lid: 'L1', league: BASKET, playoff, matches: games, names, now: NOW });
    expect(r.title).toBe('Playoffs 2026');
    expect(r.facts.map((f) => [f.label, f.label === 'Fechas' ? '' : f.value])).toEqual([
      ['Fechas', ''],
      ['Cancha', 'Bowling Center'],
      ['Formato', '4 equipos · Semifinal: al mejor de 3, Final: al mejor de 3'],
    ]);
    expect(r.final).toBe(true);
    expect(podiumsBrief(r)[0][1]).toEqual([
      [1, [['Tigres', 'Ana y Beto', null]]],
      [2, [['Leones', 'Carla y Dani', null]]],
      [3, [['Lobos', 'Gabi y Hugo', null], ['Pumas', 'Eva y Fer', null]]],
    ]);
    expect(view(r.general[0], 'pdf').rows).toEqual([
      'Semifinal · al mejor de 3',
      ['(1) Tigres', '2–0', '(4) Lobos', 'Tigres'],
      ['(2) Leones', '2–1', '(3) Pumas', 'Leones'],
      'Final · al mejor de 3',
      ['(1) Tigres', '2–0', '(2) Leones', 'Tigres'],
    ]);
    expect(view(r.general[1], 'pdf').rows).toEqual([
      'Semifinal · Tigres vs. Lobos',
      ['Tigres', '60-50', 'Lobos'],
      ['Lobos', '55-58', 'Tigres'],
      'Final · Tigres vs. Leones',
      ['Tigres', '70-65', 'Leones'],
    ]);
    // Solo los juegos del playoff: los 60 de Ana en la temporada no cuentan.
    expect(view(r.individual[0], 'pdf').rows).toEqual([
      [1, 'Ana', 'Tigres', 2, 45, 22.5, 25, 2, 1, 0],
      [2, 'Carla', 'Leones', 1, 31, 31, 31, 2, 1, 4],
    ]);
    expect(excelLines(r).names).toEqual(['General', 'Individual']);
    const { pages } = pdfPages(r);
    expect(pages[0]).toEqual(expect.arrayContaining(['Playoffs 2026', 'Series', 'Juegos', '(1) Tigres']));

    // Todos los juegos el mismo día (un juego por día repetido): «Fecha», no «Fechas».
    const oneDay = games.map((m) => (m.seriesId ? { ...m, scheduledAt: '2026-11-01T20:00:00Z' } : m));
    const same = playoffReport({ lid: 'L1', league: BASKET, playoff, matches: oneDay, names, now: NOW });
    expect(same.facts[0]).toEqual({ label: 'Fecha', value: expect.stringMatching(/^Domingo, 1 de noviembre de 2026$/i) });
  });
});
