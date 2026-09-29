import { describe, expect, it } from 'vitest';
import { evaluate } from '../engine';
import type { BadgeSnapshot, SnapPlayer, SnapTeam, SnapTeamPlayer } from '../snapshot';
import { snapLeague, snapTeamPlayer } from '../testkit';
import type { SportId } from '../../sports/types';
import type { BadgeDecision } from '../types';
import { gives, job, NOW, of, player, row, snap, world } from './fixtures';
import { lastDueMonth } from './month';
import { bowlingNight, day, fl, golfRound, merge, racketMatch, swimMeet, teamMatch, type Parts } from './sportFixtures';

const users = (ids: string[]) => ids.map((p) => player(p, 'L', `u-${p}`));
const userOf = (p: string) => `u-${p}`;

function runMonth(sport: SportId, players: SnapPlayer[], data: Parts, over: Partial<BadgeSnapshot> = {}, ref = '2026-10'): BadgeDecision[] {
  const j = job('mes', { ref });
  return evaluate(j, snap(j, world(sport, { players, ...data, ...over })), NOW);
}

describe('mes: reloj', () => {
  it('el último mes que ya se evalúa es el anterior desde el día 3', () => {
    expect(lastDueMonth('2026-11-20')).toBe('2026-10');
    expect(lastDueMonth('2026-11-02')).toBe('2026-09');
    expect(lastDueMonth('2026-11-03')).toBe('2026-10');
  });
});

describe('month_league: boliche', () => {
  const Q = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
  // Septiembre: q2 tira 140 (su base), q3–q6 tiran 150. Octubre: 3 torneos; q1 promedia 200 y el resto 150.
  const sept = [1, 8, 15, 22].map((d, i) => bowlingNight(`S${i}`, day(9, d), { q2: [140, 140, 140], q3: [150, 150, 150], q4: [150, 150, 150], q5: [150, 150, 150], q6: [150, 150, 150] }));
  const oct = [6, 13, 20].map((d, i) => bowlingNight(`O${i}`, day(10, d), { q1: [200, 210, 190], q2: [150, 150, 150], q3: [150, 150, 150], q4: [150, 150, 150], q5: [150, 150, 150], q6: [150, 150, 150] }));
  const data = merge(...sept, ...oct);

  it('figura, mayor progreso, racha y asistencia perfecta del mes', () => {
    const ds = runMonth('bowling', users(Q), data);
    expect(gives(ds)).toEqual([
      'most_improved_month:0:2026-10@q2',
      ...Q.map((p) => `perfect_attendance_month:0:2026-10@${p}`),
      'player_of_month:0:2026-10@q1',
      'streak_month:0:2026-10@q2',
    ]);
    expect(of(ds, 'player_of_month')[0]).toMatchObject({ status: 'firme', league_id: 'L', context: { league: { id: 'L' }, window: ['2026-10-01', '2026-10-31'], values: { valor: 'promedio 200 en 9 juegos' } } });
    expect(of(ds, 'most_improved_month')[0].context.values).toMatchObject({ valor: '+10 pinos', base: 140 });
    expect(of(ds, 'streak_month')[0].context.values).toMatchObject({ n: 9 });
  });

  it('quien ganó el mayor progreso el mes anterior no repite', () => {
    const had = [row({ badge_key: 'most_improved_month', sport: 'bowling', level: 0, period_key: '2026-09', player_id: 'q2', league_id: 'L', status: 'firme' })];
    expect(of(runMonth('bowling', users(Q), data, { awards: had }), 'most_improved_month')).toEqual([]);
  });

  it('con sin_titulos solo queda la asistencia; en un torneo suelto no hay insignias del mes', () => {
    const quiet = runMonth('bowling', users(Q), data, { leagues: [snapLeague('L', { sport: 'bowling', badges_auto: 'sin_titulos' })] });
    expect([...new Set(gives(quiet).map((g) => g.split(':')[0]))]).toEqual(['perfect_attendance_month']);
    expect(runMonth('bowling', users(Q), data, { leagues: [snapLeague('L', { sport: 'bowling', kind: 'torneo' })] })).toEqual([]);
  });

  it('sin liga con peso para el mes (menos de 6 activos) no se da nada', () => {
    const few = merge(...[6, 13, 20].map((d, i) => bowlingNight(`O${i}`, day(10, d), { q1: [200, 210, 190] })));
    expect(runMonth('bowling', users(Q), few, { league_months: [] })).toEqual([]);
  });

  it('un jugador que entró después de la primera fecha no tiene asistencia perfecta', () => {
    const late = users(Q).map((p) => (p.id === 'q6' ? { ...p, created_at: '2026-10-10T12:00:00.000Z' } : p));
    expect(of(runMonth('bowling', late, data), 'perfect_attendance_month').map((d) => d.player_id)).not.toContain('q6');
  });
});

describe('month_league: raqueta (tenis)', () => {
  const R = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'];
  const m = (id: string, date: string, a: string, b: string, text: string) => racketMatch(id, date, [a], [b], text, userOf);
  const october = merge(
    m('o1', day(10, 2), 'r1', 'r3', '6-2 6-2'),
    m('o2', day(10, 5), 'r1', 'r4', '6-2 6-2'),
    m('o3', day(10, 9), 'r1', 'r5', '6-2 6-2'),
    m('o4', day(10, 12), 'r1', 'r6', '6-2 6-2'),
    m('o5', day(10, 3), 'r2', 'r3', '6-4 6-4'),
    m('o6', day(10, 6), 'r2', 'r4', '6-4 6-4'),
    m('o7', day(10, 10), 'r5', 'r2', '6-4 6-4'),
    m('o8', day(10, 13), 'r2', 'r6', '6-3 6-3'),
  );
  // En agosto y septiembre r2 perdió 6 partidos 3-6 3-6 (33 % de juegos).
  const before = merge(...[1, 2, 3, 4, 5, 6].map((i) => m(`b${i}`, day(i <= 3 ? 8 : 9, i * 3), 'r3', 'r2', '6-3 6-3')));

  it('figura (victorias R2 oficiales), mayor progreso (% de juegos) y racha (4 seguidas)', () => {
    const ds = runMonth('tennis', users(R), merge(october, before));
    expect(of(ds, 'player_of_month').map((d) => d.player_id)).toEqual(['r1']);
    expect(of(ds, 'player_of_month')[0].context.values).toMatchObject({ valor: '4 victorias en 4 partidos' });
    expect(of(ds, 'most_improved_month').map((d) => d.player_id)).toEqual(['r2']);
    expect(of(ds, 'streak_month').map((d) => d.player_id)).toEqual(['r1']);
  });

  it('asistencia perfecta: todos sus partidos oficiales del mes (3+), sin W.O. en contra', () => {
    const ds = runMonth('tennis', users(R), october);
    expect(of(ds, 'perfect_attendance_month').map((d) => d.player_id).sort()).toEqual(['r1', 'r2']);
    const wo = merge(october, racketMatch('o9', day(10, 20), ['r1'], ['r3'], 'W.O.', userOf, { status: 'walkover', walkover_side: 1, winner_side: 2, score: { text: 'W.O.' } }));
    // r1 dio W.O.: pierde la asistencia; r3 llega a 3 partidos (el W.O. a favor cuenta como presente).
    expect(of(runMonth('tennis', users(R), wo), 'perfect_attendance_month').map((d) => d.player_id).sort()).toEqual(['r2', 'r3']);
  });

  it('americano y partidos que no se confirman no son oficiales: no dan figura', () => {
    const social = merge(...[1, 2, 3, 4].map((i) => racketMatch(`s${i}`, day(10, i), ['r1'], ['r3'], '6-0 6-0', userOf, { require_confirm: false })));
    expect(of(runMonth('tennis', users(R), merge(social, m('x', day(10, 20), 'r2', 'r4', '6-1 6-1'))), 'player_of_month')).toEqual([]);
  });
});

describe('month_league: equipos (fútbol)', () => {
  const TEAMS = ['tA', 'tB', 'tC', 'tD'];
  const P = TEAMS.flatMap((t) => [1, 2, 3, 4].map((i) => `${t[1].toLowerCase()}${i}`));
  const teams: SnapTeam[] = TEAMS.map((id, i) => ({ id, event_id: null, name: `Equipo ${id}`, sort_order: i, color: null, league_id: 'L' }));
  const roster: SnapTeamPlayer[] = P.map((p) => snapTeamPlayer(`t${p[0].toUpperCase()}`, p, p.endsWith('1') ? 'captain' : 'player'));
  const g = (id: string, date: string, a: string, b: string, s: [number, number], lines: string[]) => teamMatch(id, date, a, b, s, lines.join(';'));
  const data = merge(
    g('m1', day(10, 3), 'tA', 'tB', [2, 0], [fl('a1', 1, 1), fl('a3', 1, 1), fl('a4', 1, 0, { keeper: true }), fl('b1', 2), fl('b4', 2, 0, { keeper: true, conceded: 2 })]),
    g('m2', day(10, 4), 'tC', 'tD', [1, 1], [fl('c1', 1, 1), fl('d1', 2, 1)]),
    g('m3', day(10, 10), 'tA', 'tC', [1, 0], [fl('a1', 1, 1), fl('a2', 1), fl('a4', 1, 0, { keeper: true }), fl('c1', 2)]),
    g('m4', day(10, 11), 'tB', 'tD', [2, 1], [fl('b1', 1, 2), fl('b4', 1, 0, { keeper: true, conceded: 1 }), fl('d1', 2, 1)]),
    g('m5', day(10, 17), 'tA', 'tD', [1, 1], [fl('a1', 1, 1), fl('a3', 1), fl('a4', 1, 0, { keeper: true, conceded: 1 }), fl('d1', 2, 1)]),
    g('m6', day(10, 18), 'tB', 'tC', [0, 0], [fl('b1', 1), fl('b4', 1, 0, { keeper: true }), fl('c1', 2)]),
    g('m7', day(10, 24), 'tA', 'tB', [2, 0], [fl('a1', 1, 0), fl('a3', 1, 2), fl('a4', 1, 0, { keeper: true }), fl('b1', 2), fl('b4', 2, 0, { keeper: true, conceded: 2 })]),
  );

  it('equipo del mes, goleador, valla menos vencida, racha del equipo y asistencia perfecta', () => {
    const ds = runMonth('football', users(P), data, { teams, team_players: roster });
    // Equipo del mes: tA (10 puntos); a quienes jugaron la mitad o más de sus 4 partidos.
    expect(of(ds, 'team_of_month').map((d) => d.player_id).sort()).toEqual(['a1', 'a3', 'a4']);
    expect(of(ds, 'team_of_month').find((d) => d.player_id === 'a3')).toMatchObject({ context: { team: { id: 'tA', name: 'Equipo tA' }, values: { jugados: 3, total: 4 } } });
    // Goleador: a1, a3 y d1 con 3 goles; desempata el promedio por partido (a1 jugó 4, a3 y d1 3): comparten a3 y d1.
    expect(of(ds, 'top_scorer_month').map((d) => d.player_id).sort()).toEqual(['a3', 'd1']);
    // Valla menos vencida: a4 (1 en 4 partidos).
    expect(of(ds, 'clean_sheet_month').map((d) => d.player_id)).toEqual(['a4']);
    // Racha: tA sin perder en 4 (G, G, E, G); va a quienes jugaron el 75 %+ de esos partidos.
    expect(of(ds, 'streak_month').map((d) => d.player_id).sort()).toEqual(['a1', 'a3', 'a4']);
    // Asistencia perfecta: estuvieron en todos los partidos de su equipo.
    expect(of(ds, 'perfect_attendance_month').map((d) => d.player_id).sort()).toEqual(['a1', 'a4', 'b1', 'b4', 'c1', 'd1']);
  });

  it('con menos de 4 equipos con 2+ partidos T2 no hay equipo del mes', () => {
    const three = { ...data, matches: data.matches!.filter((m) => m.id !== 'm2' && m.id !== 'm4' && m.id !== 'm5') };
    expect(of(runMonth('football', users(P), three, { teams, team_players: roster }), 'team_of_month')).toEqual([]);
  });
});

describe('month_league: golf', () => {
  const G = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'];
  // Septiembre: g2 hace +16 (su base). Octubre: 3 rondas; g1 va en par, g2 en +6, el resto en +12.
  const sept = [5, 12, 19, 26].map((d, i) => golfRound(`S${i}`, day(9, d), { g1: 0, g2: 16, g3: 12, g4: 12 }));
  const oct = [4, 11, 18].map((d, i) => golfRound(`O${i}`, day(10, d), { g1: 0, g2: 6, g3: 12, g4: 12, g5: 12, g6: 12 }));

  it('figura (menor diferencial), mayor progreso y racha contra su base, y asistencia a las rondas', () => {
    const ds = runMonth('golf', users(G), merge(...sept, ...oct));
    expect(of(ds, 'player_of_month').map((d) => d.player_id)).toEqual(['g1']);
    expect(of(ds, 'most_improved_month').map((d) => d.player_id)).toEqual(['g2']);
    expect(of(ds, 'most_improved_month')[0].context.values).toMatchObject({ valor: '8.8 golpes menos' });
    expect(of(ds, 'streak_month').map((d) => d.player_id)).toEqual(['g2']);
    expect(of(ds, 'perfect_attendance_month').map((d) => d.player_id).sort()).toEqual(G);
  });
});

describe('month_league: natación', () => {
  const W = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'];
  const sept = swimMeet('M9', day(9, 12), [
    { p: 'w1', distance: 100, stroke: 'libre', time: 7000 },
    { p: 'w1', distance: 50, stroke: 'libre', time: 3200 },
  ]);
  const oct = swimMeet('M10', day(10, 10), [
    { p: 'w1', distance: 100, stroke: 'libre', time: 6800 },
    { p: 'w1', distance: 50, stroke: 'libre', time: 3150 },
    ...['w2', 'w3', 'w4', 'w5', 'w6'].map((p) => ({ p, distance: 100, stroke: 'libre' as const, time: 7500 })),
  ]);

  it('mayor progreso: suma de las mejoras % en pruebas con marca anterior (2+)', () => {
    const ds = runMonth('swimming', users(W), merge(sept, oct));
    expect(gives(ds)).toEqual(['most_improved_month:0:2026-10@w1']);
    expect(of(ds, 'most_improved_month')[0].context.values).toMatchObject({ valor: '+4.4 %' });
  });
});

describe('month_account y month_streak', () => {
  const me = [player('pa', 'L', 'u1'), player('pb', 'B', 'u1')];
  const leagues = [snapLeague('L', { sport: 'bowling' }), snapLeague('B', { sport: 'bowling' })];
  const runAccount = (data: Parts, kind: 'mes' = 'mes', ref = '2026-10') => {
    const j = job(kind, { league_id: null, user_id: 'u1', ref });
    return evaluate(j, snap(j, world('bowling', { leagues, players: me, ...data })), NOW);
  };

  it('fijo del mes: días del deporte en el mes (máximo 4 por semana ISO); solo el nivel más alto', () => {
    // 9 días en octubre en dos ligas, 5 de ellos en la misma semana (cuentan 4): 8 = plata.
    const days = [5, 6, 7, 8, 9, 13, 20, 27, 29];
    const data = merge(...days.map((d, i) => bowlingNight(`E${i}`, day(10, d), { [i % 2 ? 'pb' : 'pa']: [150, 150] }, {}, i % 2 ? 'B' : 'L')));
    const ds = runAccount(data);
    expect(gives(ds).filter((g) => g.startsWith('monthly_regular'))).toEqual(['monthly_regular:2:2026-10@u1']);
    expect(of(ds, 'monthly_regular')[0]).toMatchObject({ sport: 'bowling', status: 'firme', context: { values: { n: 8 } } });
  });

  it('tu mejor mes: la media del mes gana a la de sus 3+ meses anteriores con 9+ juegos', () => {
    const month = (m: number, score: number) => merge(...[3, 10, 17].map((d) => bowlingNight(`M${m}-${d}`, day(m, d), { pa: [score, score, score] })));
    const data = merge(month(7, 150), month(8, 155), month(9, 160), month(10, 170));
    const ds = runAccount(data);
    expect(of(ds, 'personal_best_month').map((d) => `${d.user_id}:${d.sport}:${d.period_key}`)).toEqual(['u1:bowling:2026-10']);
    expect(of(ds, 'personal_best_month')[0].context.values).toMatchObject({ valor: '+10 pinos' });
    // Con solo 2 meses anteriores no hay con qué comparar.
    expect(of(runAccount(merge(month(8, 155), month(9, 160), month(10, 170))), 'personal_best_month')).toEqual([]);
  });

  it('constancia: meses activos seguidos, con un comodín por cada 12 meses', () => {
    const active = (m: number) => merge(bowlingNight(`A${m}a`, day(m, 5), { pa: [150] }), bowlingNight(`A${m}b`, day(m, 20), { pa: [150] }));
    // Mayo, junio, (julio no), agosto, septiembre, octubre: el hueco de julio no rompe ni suma → 5.
    const ds = runAccount(merge(active(5), active(6), active(8), active(9), active(10)));
    expect(of(ds, 'month_streak').map((d) => d.level)).toEqual([1]);
    expect(of(ds, 'month_streak', 'progress')[0]).toMatchObject({ value: 5, target: 6 });
  });
});
