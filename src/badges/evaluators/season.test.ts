import { describe, expect, it } from 'vitest';
import { evaluate } from '../engine';
import type { BadgeSnapshot, SnapSeason, SnapServiceAct, SnapTeam, SnapTeamPlayer } from '../snapshot';
import { snapLeague, snapTeamPlayer } from '../testkit';
import type { SportId } from '../../sports/types';
import { job, NOW, of, player, snap, world } from './fixtures';
import { basketballBadFouls } from './season';
import { addDays } from '../rules/periods';
import { bowlingNight, day, fl, golfRound, merge, racketMatch, swimMeet, teamMatch, type Parts } from './sportFixtures';

const SEASON: SnapSeason = {
  id: 'S1',
  league_id: 'L',
  name: 'Temporada 2026',
  starts_on: '2026-03-01',
  ends_on: '2026-08-31',
  status: 'closed',
  closed_at: '2026-09-05T12:00:00.000Z',
  closed_by: 'u-owner',
  standings: [],
};

function runSeason(sport: SportId, players: string[], data: Parts, over: Partial<BadgeSnapshot> = {}, kind: 'temporada' = 'temporada') {
  const j = job(kind, { ref: 'season:S1' });
  return evaluate(j, snap(j, world(sport, { players: players.map((p) => player(p, 'L', `u-${p}`)), seasons: [SEASON], ...data, ...over })), NOW);
}

const holders = (ds: ReturnType<typeof runSeason>, key: string, level?: number) =>
  of(ds, key)
    .filter((d) => level === undefined || d.level === level)
    .map((d) => d.player_id ?? d.user_id)
    .sort();

describe('temporada: fútbol (6 equipos, ida y vuelta)', () => {
  const TEAMS = ['tA', 'tB', 'tC', 'tD', 'tE', 'tF'];
  const P = TEAMS.flatMap((t) => [1, 2, 3, 4].map((i) => `${t[1].toLowerCase()}${i}`));
  const teams: SnapTeam[] = TEAMS.map((id, i) => ({ id, event_id: null, name: `Equipo ${id}`, sort_order: i, color: null, league_id: 'L' }));
  const roster: SnapTeamPlayer[] = P.map((p) => snapTeamPlayer(`t${p[0].toUpperCase()}`, p, p.endsWith('1') ? 'captain' : 'player'));
  const games: Parts[] = [];
  let n = 0;
  for (let h = 0; h < 6; h++)
    for (let a = 0; a < 6; a++) {
      if (h === a) continue;
      const [home, away] = [TEAMS[h], TEAMS[a]];
      // Gana siempre el de menor letra, 1-0, con gol de su 1.
      const homeWins = h < a;
      const sides: [number, number] = homeWins ? [1, 0] : [0, 1];
      const x = (t: string, side: 1 | 2, goals: number, conceded: number) => {
        const k = t[1].toLowerCase();
        const lines = [fl(`${k}1`, side, goals), fl(`${k}2`, side), fl(`${k}3`, side), fl(`${k}4`, side, 0, { keeper: true, conceded })];
        return lines;
      };
      let lines = [...x(home, 1, sides[0], sides[1]), ...x(away, 2, sides[1], sides[0])];
      const id = `g${++n}`;
      // Tarjetas: b2 dos amarillas, c3 una roja, y una amarilla para d2, e2 y f2.
      if (id === 'g8' || id === 'g9') lines = lines.map((l) => (l.startsWith('b2:') ? l.replace(/^(b2:\d:1:\d:\d:0):0/, '$1:1') : l));
      if (id === 'g14') lines = lines.map((l) => (l.startsWith('c3:') ? l.replace(/^(c3:\d:1:\d:\d:0:0):0/, '$1:d') : l));
      for (const [g, p] of [
        ['g20', 'd2'],
        ['g25', 'e2'],
        ['g28', 'f2'],
      ])
        if (id === g) lines = lines.map((l) => (l.startsWith(`${p}:`) ? l.replace(new RegExp(`^(${p}:\\d:1:\\d:\\d:0):0`), '$1:1') : l));
      // b3 no fue a dos partidos.
      if (id === 'g6' || id === 'g7') lines = lines.filter((l) => !l.startsWith('b3:'));
      games.push(teamMatch(id, addDays('2026-03-07', n * 4), home, away, sides, lines.join(';')));
    }
  const data = merge({ teams, team_players: roster }, ...games);

  it('título (oro y plata con 6 equipos, a quienes jugaron el 30 %+ de los partidos del equipo)', () => {
    const ds = runSeason('football', P, data);
    expect(holders(ds, 'season_podium', 3)).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(holders(ds, 'season_podium', 2)).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(holders(ds, 'season_podium', 1)).toEqual([]);
    expect(of(ds, 'season_podium')[0]).toMatchObject({ period_key: 's:S1', status: 'firme', context: { season: { id: 'S1', name: 'Temporada 2026' }, league: { id: 'L' } } });
  });

  it('bota de oro, portero menos vencido, juego limpio, equipo juego limpio, brazalete y asistencia', () => {
    const ds = runSeason('football', P, data);
    expect(holders(ds, 'season_top_scorer')).toEqual(['a1']);
    expect(of(ds, 'season_top_scorer')[0].context.values).toMatchObject({ n: 10 });
    expect(holders(ds, 'season_best_keeper')).toEqual(['a4']);
    const fair = holders(ds, 'fair_play');
    expect(fair).toContain('a1');
    expect(fair).toContain('b3');
    expect(fair).not.toContain('b2');
    expect(fair).not.toContain('c3');
    expect(holders(ds, 'fair_play_team')).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(holders(ds, 'captain_band')).toEqual(['a1', 'b1', 'c1', 'd1', 'e1', 'f1']);
    expect(of(ds, 'season_attendance').find((d) => d.player_id === 'a1')).toMatchObject({ level: 3, context: { values: { n: 10, total: 10, pct: 100 } } });
    expect(of(ds, 'season_attendance').find((d) => d.player_id === 'b3')).toMatchObject({ level: 1, context: { values: { pct: 80 } } });
  });

  it('una temporada abierta (o de otra liga) no da nada; con sin_titulos quedan asistencia, juego limpio y brazalete', () => {
    expect(runSeason('football', P, data, { seasons: [{ ...SEASON, status: 'active' }] })).toEqual([]);
    const quiet = runSeason('football', P, data, { leagues: [snapLeague('L', { sport: 'football', badges_auto: 'sin_titulos' })] });
    expect([...new Set(of(quiet, 'season_attendance').concat(of(quiet, 'fair_play'), of(quiet, 'captain_band')).map((d) => d.badge_key))].sort()).toEqual(['captain_band', 'fair_play', 'season_attendance']);
    expect(of(quiet, 'season_podium')).toEqual([]);
  });
});

describe('temporada: tenis (6 jugadores, ida y vuelta)', () => {
  const S = ['s1', 's2', 's3', 's4', 's5', 's6'];
  const userOf = (p: string) => `u-${p}`;
  const games: Parts[] = [];
  let n = 0;
  for (let h = 0; h < 6; h++)
    for (let a = 0; a < 6; a++) {
      if (h === a) continue;
      const [w, l] = h < a ? [S[h], S[a]] : [S[a], S[h]];
      games.push(racketMatch(`t${++n}`, addDays('2026-03-05', n * 5), [w], [l], '6-3 6-3', userOf));
    }
  // s1, s2 y s3 ya jugaban antes de la temporada.
  const before = merge(racketMatch('pre1', '2026-02-10', ['s1'], ['s2'], '6-4 6-4', userOf), racketMatch('pre2', '2026-02-12', ['s1'], ['s3'], '6-4 6-4', userOf));
  const data = merge(before, ...games);

  it('título por la tabla del servidor; revelación entre los nuevos; palabra de honor', () => {
    const ds = runSeason('tennis', S, data);
    expect(holders(ds, 'season_podium', 3)).toEqual(['s1']);
    expect(holders(ds, 'season_podium', 2)).toEqual(['s2']);
    expect(holders(ds, 'season_rookie')).toEqual(['s4']);
    expect(holders(ds, 'honor_word')).toEqual(S);
  });

  it('con empate exacto en la tabla, el orden del admin (`season_awards`) decide', () => {
    // s1 y s2 empatan en todo: se quitan las dos victorias de s1 sobre s2 y se agregan dos de s2 sobre s1 iguales.
    const flip = { ...data, matches: data.matches!.map((m) => (m.id === 't1' ? { ...m, winner_side: 2, score: { text: '3-6 3-6', sides: [0, 2] as [number, number] } } : m)) };
    const tied = runSeason('tennis', S, flip);
    expect(holders(tied, 'season_podium', 3)).toEqual(['s1', 's2']);
    const ordered = runSeason('tennis', S, flip, { season_awards: [{ id: 'aw', season_id: 'S1', league_id: 'L', kind: 'campeon', label: 'Campeón', player_id: 's2', team_id: null, note: null }] });
    expect(holders(ordered, 'season_podium', 3)).toEqual(['s2']);
    expect(holders(ordered, 'season_podium', 2)).toEqual(['s1']);
  });

  it('palabra de honor: un W.O. dado o un reclamo propio resuelto sin cambio la quitan', () => {
    const wo = racketMatch('wo', '2026-08-20', ['s4'], ['s5'], 'W.O.', userOf, { status: 'walkover', walkover_side: 1, winner_side: 2, score: { text: 'W.O.' } });
    const dispute = { ...data, matches: data.matches!.map((m) => (m.id === 't3' ? { ...m, history: [{ at: '2026-03-21T00:00:00Z', by: 'u-s4', a: 'dispute' }, { at: '2026-03-22T00:00:00Z', by: 'u-owner', a: 'resolve' }] } : m)) };
    const ds = runSeason('tennis', S, merge(dispute, wo));
    expect(holders(ds, 'honor_word')).toEqual(['s1', 's2', 's3', 's5', 's6']);
  });
});

describe('temporada: boliche (12 jugadores, 10 fechas)', () => {
  const B = Array.from({ length: 12 }, (_, i) => `b${String(i + 1).padStart(2, '0')}`);
  const avg = [220, 215, 210, 205, 190, 185, 180, 176, 170, 168, 165];
  const dates = [7, 21].flatMap((d) => [3, 4, 5, 6, 7].map((m) => day(m, d))).sort();
  const events = dates.map((date, e) =>
    bowlingNight(`E${e}`, date, Object.fromEntries(B.map((p, i) => [p, i < 11 ? [avg[i], avg[i], avg[i]] : Array(3).fill(e < 5 ? 150 : 175)]))),
  );
  // b01–b09 ya jugaban en febrero: los nuevos son b10, b11 y b12.
  const feb = bowlingNight('F0', '2026-02-10', Object.fromEntries(B.slice(0, 9).map((p) => [p, [150, 150, 150]])));
  const data = merge(feb, ...events);

  it('título, categoría, mayor progreso, revelación y asistencia', () => {
    const ds = runSeason('bowling', B, data);
    expect([3, 2, 1].map((l) => holders(ds, 'season_podium', l))).toEqual([['b01'], ['b02'], ['b03']]);
    expect(of(ds, 'category_title').map((d) => `${d.player_id}:${d.period_key}`).sort()).toEqual(['b01:s:S1:A', 'b05:s:S1:B']);
    expect(holders(ds, 'season_most_improved')).toEqual(['b12']);
    expect(of(ds, 'season_most_improved')[0].context.values).toMatchObject({ valor: '+25 pinos sobre tu promedio de arranque' });
    expect(holders(ds, 'season_rookie')).toEqual(['b10']);
    expect(holders(ds, 'season_attendance', 3)).toEqual(B);
  });

  it('sin liga con peso para la temporada, nada', () => {
    const few = merge(...dates.map((date, e) => bowlingNight(`E${e}`, date, { b01: [200, 200, 200] })));
    expect(runSeason('bowling', B, few, { league_months: [] })).toEqual([]);
  });
});

describe('temporada: golf (orden de mérito)', () => {
  const G = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'];
  const rounds = [3, 4, 5, 6, 7, 8].map((m, i) => golfRound(`R${i}`, day(m, 14), Object.fromEntries(G.map((p, k) => [p, k * 2]))));
  it('10-8-6-5-4-3-2-1 por ronda; con 6 jugadores, oro y plata', () => {
    const ds = runSeason('golf', G, merge(...rounds));
    expect(holders(ds, 'season_podium', 3)).toEqual(['g1']);
    expect(holders(ds, 'season_podium', 2)).toEqual(['g2']);
    expect(of(ds, 'season_podium').find((d) => d.player_id === 'g1')!.context.values).toMatchObject({ lugar: 1, n: 60 });
  });
});

describe('temporada: natación', () => {
  const W = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'];
  // Tres encuentros; w1 gana y baja su marca en 100 y 50 libre cada vez; los demás mejoran un poco en el tercero.
  const meet = (i: number) =>
    swimMeet(`M${i}`, day(4 + i, 12), [
      { p: 'w1', distance: 100, stroke: 'libre', time: 7000 - i * 100, club: 'CL' },
      { p: 'w1', distance: 50, stroke: 'libre', time: 3300 - i * 50, club: 'CL' },
      ...W.slice(1).map((p, k) => ({ p, distance: 100, stroke: 'libre' as const, time: 7500 + k * 10 - (i === 2 ? 20 : 0), club: 'CL', status: p === 'w2' && i === 1 ? ('dq' as const) : ('ok' as const) })),
      ...W.slice(1).map((p, k) => ({ p, distance: 50, stroke: 'libre' as const, time: 3500 + k * 10, club: 'CL' })),
    ]);
  const data = merge(meet(0), meet(1), meet(2));

  it('título de categoría por puntos, estilo limpio (6+ pruebas sin DQ) y mayor progreso (marcas personales)', () => {
    const ds = runSeason('swimming', W, data);
    expect(of(ds, 'category_title').map((d) => `${d.player_id}:${d.context.values?.categoria}`)).toEqual(['w1:F 11-12']);
    expect(holders(ds, 'fair_play')).toEqual(['w1', 'w3', 'w4', 'w5', 'w6']);
    expect(holders(ds, 'season_most_improved')).toEqual(['w1']);
    expect(of(ds, 'season_podium')).toEqual([]);
  });

  it('cuerpo técnico: el entrenador de un club con 5+ nadadores en la temporada (de cuenta)', () => {
    const coach = player('coach', 'L', 'u-coach');
    const j = job('temporada', { ref: 'season:S1' });
    const w = world('swimming', { players: [...W.map((p) => player(p, 'L', `u-${p}`)), coach], seasons: [SEASON], swim_clubs: [{ id: 'CL', league_id: 'L', name: 'Delfines', coach_id: 'coach' }], ...data });
    const ds = evaluate(j, snap(j, w), NOW);
    expect(of(ds, 'coach_board').map((d) => `${d.user_id}:${d.period_key}`)).toEqual(['u-coach:s:S1']);
    expect(of(ds, 'coach_board')[0].context.values).toEqual({ n: 6, club: 'Delfines' });
  });
});

describe('season_staff: temporada organizada', () => {
  const B = Array.from({ length: 8 }, (_, i) => `b${i + 1}`);
  const dates = Array.from({ length: 8 }, (_, i) => day(3 + Math.floor(i / 2), 5 + (i % 2) * 14));
  const data = merge(...dates.map((date, e) => bowlingNight(`E${e}`, date, Object.fromEntries(B.map((p) => [p, [160, 160, 160]])))));
  const service = (u: string, n: number): SnapServiceAct[] => dates.slice(0, n).map((date) => ({ league_id: 'L', date, kind: 'submission', ref: `sub:${date}`, user_id: u }));

  it('8+ fechas y 8+ jugadores: al dueño y a los admins con 5+ días de servicio en la temporada', () => {
    const ds = runSeason('bowling', B, data, { service: [...service('u-admin', 5), ...service('u-owner', 2)] });
    expect(of(ds, 'season_organizer').map((d) => d.user_id)).toEqual(['u-admin']);
    expect(of(ds, 'season_organizer')[0].context.values).toEqual({ fechas: 8, jugadores: 8 });
  });
});

describe('baloncesto: faltas del acta', () => {
  it('cuenta técnicas, antideportivas y descalificantes de la base y de la lista de jugadas', () => {
    const state = {
      v: 1,
      base: { players: [{ a1: { technicals: 1, unsportsmanlike: 0, disqualifying: 0 } }, { b1: { technicals: 0, unsportsmanlike: 1, disqualifying: 0 } }] },
      log: [
        { type: 'foul', side: 1, kind: 'personal', player: 'a2' },
        { type: 'foul', side: 1, kind: 'technical', player: 'a1' },
        { type: 'foul', side: 2, kind: 'disqualifying', player: 'b2' },
      ],
    };
    expect([...basketballBadFouls(state)!].sort()).toEqual([
      ['a1', 2],
      ['b1', 1],
      ['b2', 1],
    ]);
    expect(basketballBadFouls(null)).toBeNull();
  });
});
