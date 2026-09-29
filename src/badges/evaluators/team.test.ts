import { describe, expect, it } from 'vitest';
import { evaluate } from '../engine';
import type { BadgeSnapshot, SnapEvent, SnapMatch, SnapMatchPlayer, SnapMatchSide, SnapTeam, SnapTeamPlayer } from '../snapshot';
import { matchSides, snapEvent, snapLeague, snapMatch, snapTeamPlayer } from '../testkit';
import { gives, job, NOW, of, player, row, snap, world } from './fixtures';
import { minuteOf } from './team';

/** Equipos de temporada tA…tF con 4 jugadores cada uno (a1…f4), todos con cuenta; capitán el 1 de cada uno. */
const TEAMS = ['tA', 'tB', 'tC', 'tD', 'tE', 'tF'];
const ROSTER: Record<string, string[]> = Object.fromEntries(TEAMS.map((t) => [t, [1, 2, 3, 4].map((i) => `${t[1].toLowerCase()}${i}`)]));
const PLAYERS = TEAMS.flatMap((t) => ROSTER[t].map((p) => player(p, 'L', `u-${p}`)));
const TEAM_ROWS: SnapTeam[] = TEAMS.map((id, i) => ({ id, event_id: null, name: `Equipo ${id}`, sort_order: i, color: null, league_id: 'L' }));
const TEAM_PLAYERS: SnapTeamPlayer[] = TEAMS.flatMap((t) => ROSTER[t].map((p, i) => snapTeamPlayer(t, p, i === 0 ? 'captain' : 'player')));

interface Built {
  matches: SnapMatch[];
  match_sides: SnapMatchSide[];
  match_players: SnapMatchPlayer[];
}
const join = (...bs: Built[]): Built => ({ matches: bs.flatMap((b) => b.matches), match_sides: bs.flatMap((b) => b.match_sides), match_players: bs.flatMap((b) => b.match_players) });
const day = (month: number, d: number) => `2026-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * Un partido de equipos que anotó el admin (T2 para los dos lados), sin alineación: las apariciones salen de
 * `score.lines`. `sides` = el marcador.
 */
function tm(id: string, d: string, home: string, away: string, sides: [number, number], lines: string, over: Partial<SnapMatch> = {}, lineup: [string[], string[]] = [[], []]): Built {
  const s = matchSides(id, [home, lineup[0]], [away, lineup[1]]);
  const match = snapMatch(id, {
    format: '',
    scheduled_at: `${d}T23:00:00.000Z`,
    score: { text: `${sides[0]}-${sides[1]}`, sides, lines },
    winner_side: sides[0] > sides[1] ? 1 : sides[1] > sides[0] ? 2 : null,
    proposed_by: 'u-admin',
    proposed_side: null,
    confirmed_by: null,
    ...over,
  });
  return { matches: [match], match_sides: s.sides, match_players: s.players };
}

/** Líneas de fútbol: `id:lado:jugó:goles:asist:autogoles:amarillas:roja:portero:recibidos`. */
const fl = (p: string, side: 1 | 2, goals = 0, assists = 0, extra = '0:0:0:0:0') => `${p}:${side}:1:${goals}:${assists}:${extra}`;
/** Líneas de baloncesto: `id:lado:pts:1s:2s:3s:faltas`. */
const bl = (p: string, side: 1 | 2, ones: number, twos: number, threes: number, fouls = 0) => `${p}:${side}:${ones + 2 * twos + 3 * threes}:${ones}:${twos}:${threes}:${fouls}`;

function run(sport: 'basketball' | 'football' | 'futsal', b: Built, over: Partial<BadgeSnapshot> = {}, j = job('resultado', { ref: `match:${b.matches[b.matches.length - 1].id}` })) {
  const w = world(sport, { players: PLAYERS, teams: TEAM_ROWS, team_players: TEAM_PLAYERS, ...b, ...over });
  return evaluate(j, snap(j, w), NOW);
}

const FOOT_LINE = [fl('a1', 1, 1), fl('a2', 1), fl('b1', 2), fl('b2', 2)].join(';');

describe('team_career (fútbol, sala y baloncesto)', () => {
  it('Partidos jugados: 5 apariciones en partidos T1; los partidos sin alineación ni acta no cuentan', () => {
    const played = [1, 2, 3, 4, 5].map((i) => tm(`m${i}`, day(3, i), 'tA', 'tB', [1, 0], FOOT_LINE));
    const noLineup = tm('m6', day(3, 20), 'tA', 'tB', [1, 0], '');
    const ds = run('football', join(...played, noLineup));
    expect(of(ds, 'team_matches').map((d) => `${d.user_id}:${d.level}`).sort()).toEqual(['u-a1:1', 'u-a2:1', 'u-b1:1', 'u-b2:1']);
    expect(of(ds, 'team_matches', 'progress').find((d) => d.user_id === 'u-a1')).toMatchObject({ value: 5, target: 15 });
  });

  it('Victorias: 5 victorias T2 apareciendo, máximo 2 por mes contra el mismo equipo', () => {
    const vsB = [1, 2, 3].map((i) => tm(`b${i}`, day(4, i), 'tA', 'tB', [2, 0], FOOT_LINE));
    const others = ['tC', 'tD'].map((t, i) => tm(`o${i}`, day(4, 10 + i), 'tA', t, [1, 0], fl('a1', 1, 1)));
    expect(of(run('football', join(...vsB, ...others)), 'team_wins').filter((d) => d.user_id === 'u-a1')).toEqual([]);
    const more = tm('o9', day(5, 1), 'tA', 'tB', [3, 0], FOOT_LINE);
    expect(of(run('football', join(...vsB, ...others, more)), 'team_wins').filter((d) => d.user_id === 'u-a1').map((d) => d.level)).toEqual([1]);
  });

  it('Invicto: ganados o empatados seguidos (fútbol); en baloncesto solo ganados; una derrota corta', () => {
    const seq = [tm('u1', day(6, 1), 'tA', 'tB', [1, 0], FOOT_LINE), tm('u2', day(6, 2), 'tA', 'tB', [1, 1], FOOT_LINE), tm('u3', day(6, 3), 'tA', 'tB', [2, 1], FOOT_LINE)];
    expect(of(run('football', join(...seq)), 'team_unbeaten').find((d) => d.user_id === 'u-a1')).toMatchObject({ level: 1, context: { values: { n: 3 } } });
    const cut = [...seq.slice(0, 2), tm('u9', day(6, 2), 'tA', 'tB', [0, 1], FOOT_LINE, { scheduled_at: '2026-06-02T23:30:00.000Z' }), seq[2]];
    expect(of(run('football', join(...cut)), 'team_unbeaten').filter((d) => d.user_id === 'u-a1')).toEqual([]);
    const bball = [1, 2, 3].map((i) => tm(`k${i}`, day(6, i), 'tA', 'tB', [80, 70], [bl('a1', 1, 2, 4, 0), bl('b1', 2, 0, 5, 0)].join(';')));
    expect(of(run('basketball', join(...bball)), 'team_unbeaten').find((d) => d.user_id === 'u-a1')).toMatchObject({ sport: 'basketball', level: 1 });
  });
});

describe('team_match: remontada', () => {
  it('fútbol: su lado iba abajo al medio tiempo y lo ganó', () => {
    const b = tm('c1', day(7, 1), 'tA', 'tB', [2, 1], FOOT_LINE, { score: { text: '2-1', sides: [2, 1], lines: FOOT_LINE, periods: [[0, 1], [2, 0]] } });
    const ds = run('football', b);
    expect(of(ds, 'team_comeback').map((d) => d.player_id).sort()).toEqual(['a1', 'a2']);
    expect(of(ds, 'team_comeback')[0]).toMatchObject({ period_key: 'm:c1', league_id: 'L', context: { team: { id: 'tA' } } });
  });

  it('si al corregir el acta un jugador ya no sale en el partido, su marca provisional se retira', () => {
    const lines = [fl('a1', 1, 2), fl('b1', 2, 1)].join(';');
    const b = tm('c1', day(7, 1), 'tA', 'tB', [2, 1], lines, { score: { text: '2-1', sides: [2, 1], lines, periods: [[0, 1], [2, 0]] } });
    const had = [row({ badge_key: 'team_comeback', sport: 'football', level: 0, period_key: 'm:c1', player_id: 'a2', league_id: 'L' })];
    const ds = run('football', b, { awards: had }, job('revisar', { ref: 'match:c1' }));
    expect(ds.filter((d) => d.kind === 'revoke').map((d) => `${d.badge_key}@${d.player_id}`)).toEqual(['team_comeback@a2']);
    expect(of(ds, 'team_comeback').map((d) => d.player_id)).toEqual(['a1']);
  });

  it('fútbol: abajo por 2 en la cronología (sin tiempos publicados)', () => {
    const lines = [fl('a1', 1, 3), fl('b1', 2, 2)].join(';');
    const tl = 'g2.10.1.;g2.20.1.;g1.50.0.;g1.60.0.;g1.70.0.';
    const ds = run('football', tm('c2', day(7, 2), 'tA', 'tB', [3, 2], lines, { score: { text: '3-2', sides: [3, 2], lines, tl } }));
    expect(of(ds, 'team_comeback').map((d) => d.player_id)).toEqual(['a1']);
  });

  it('baloncesto 5x5: abajo por 8+ en la primera mitad; en 3x3 no existe', () => {
    const lines = [bl('a1', 1, 4, 10, 2), bl('b1', 2, 2, 8, 0)].join(';');
    const periods = [
      [10, 20],
      [12, 20],
      [20, 5],
      [18, 5],
    ];
    const b = tm('c3', day(7, 3), 'tA', 'tB', [60, 50], lines, { score: { text: '60-50', sides: [60, 50], lines, periods } });
    expect(of(run('basketball', b), 'team_comeback').map((d) => d.player_id)).toEqual(['a1']);
    const b3 = tm('c4', day(7, 3), 'tA', 'tB', [60, 50], lines, { rules: { match: { variant: '3x3' } }, score: { text: '60-50', sides: [60, 50], lines, periods } });
    expect(of(run('basketball', b3), 'team_comeback')).toEqual([]);
  });
});

describe('basketball_career y basketball_match', () => {
  it('primera canasta, noche de anotación (umbral 5x5 y 3x3), puntos y triples', () => {
    // a1: 22 pts (2 de 1, 4 de 2, 4 triples) en un 5x5 y 10 en un 3x3; en total 32 puntos y 4 triples de 5x5.
    const five = tm('p1', day(8, 1), 'tA', 'tB', [70, 60], [bl('a1', 1, 2, 4, 4), bl('b1', 2, 0, 3, 0)].join(';'));
    const three = tm('p2', day(8, 2), 'tA', 'tB', [21, 15], [bl('a1', 1, 0, 2, 2), bl('b1', 2, 1, 0, 0)].join(';'), { rules: { match: { variant: '3x3' } } });
    const ds = run('basketball', join(five, three));
    const mine = (key: string) => of(ds, key).filter((d) => d.user_id === 'u-a1');
    expect(mine('basketball_first_basket').map((d) => d.level)).toEqual([0]);
    expect(mine('basketball_points_game').map((d) => d.level)).toEqual([1, 2]);
    expect(mine('basketball_points_game')[1]).toMatchObject({ refs: ['match:p1'], context: { values: { n: 22 } } });
    expect(mine('basketball_threes_game').map((d) => d.level)).toEqual([1]);
    expect(mine('basketball_points')).toEqual([]);
    expect(of(ds, 'basketball_points', 'progress').find((d) => d.user_id === 'u-a1')).toMatchObject({ value: 32, target: 50 });
    // Solo 3x3: 10 puntos ya son plata.
    const only3 = run('basketball', three);
    expect(of(only3, 'basketball_points_game').filter((d) => d.user_id === 'u-a1').map((d) => d.level)).toEqual([1, 2]);
    expect(of(only3, 'basketball_threes_game')).toEqual([]);
  });

  it('una línea incoherente (pts ≠ 1s + 2·2s + 3·3s) se descarta', () => {
    const ds = run('basketball', tm('x1', day(8, 3), 'tA', 'tB', [40, 30], 'a1:1:30:0:0:0:0;b1:2:2:0:1:0:0'));
    expect(of(ds, 'basketball_points_game').filter((d) => d.user_id === 'u-a1')).toEqual([]);
  });

  it('triple amenaza, manos limpias y líder del partido', () => {
    const lines = [bl('a1', 1, 2, 5, 2, 0), bl('a2', 1, 0, 3, 0, 2), bl('b1', 2, 4, 4, 0, 1), bl('b2', 2, 0, 1, 0, 2)].join(';');
    const ds = run('basketball', tm('g1', day(9, 1), 'tA', 'tB', [24, 21], lines));
    expect(gives(ds).filter((g) => g.includes(':m:g1'))).toEqual(['basketball_clean_hands:0:m:g1@a1', 'basketball_game_leader:0:m:g1@a1', 'basketball_triple_threat:0:m:g1@a1']);
    // Manos limpias pide que el partido registrara 4+ faltas: sin faltas anotadas, no.
    const clean = [bl('a1', 1, 2, 5, 2, 0), bl('b1', 2, 4, 6, 1, 0)].join(';');
    expect(of(run('basketball', tm('g2', day(9, 2), 'tA', 'tB', [18, 19], clean)), 'basketball_clean_hands')).toEqual([]);
  });

  it('líder del partido: empatados comparten; con menos de 10 puntos nadie', () => {
    const tie = [bl('a1', 1, 0, 6, 0), bl('b1', 2, 0, 6, 0)].join(';');
    expect(of(run('basketball', tm('g3', day(9, 3), 'tA', 'tB', [12, 12], tie, { winner_side: 1 })), 'basketball_game_leader').map((d) => d.player_id).sort()).toEqual(['a1', 'b1']);
    const low = [bl('a1', 1, 0, 4, 0), bl('b1', 2, 0, 3, 0)].join(';');
    expect(of(run('basketball', tm('g4', day(9, 4), 'tA', 'tB', [8, 6], low)), 'basketball_game_leader')).toEqual([]);
  });
});

describe('football_career y football_match', () => {
  it('primer gol, goles, noche goleadora (con la cronología que cuadra), asistencias y valla invicta', () => {
    // a1: 3 goles (hat-trick de fútbol = plata), a2: 5 asistencias en dos partidos, a4 portero con valla invicta.
    const l1 = [fl('a1', 1, 3, 0), fl('a2', 1, 0, 3), fl('a4', 1, 0, 0, '0:0:0:1:0'), fl('b1', 2)].join(';');
    const tl1 = 'g1.10.0.1;g1.20.0.1;g1.30.0.1';
    const m1 = tm('f1', day(10, 1), 'tA', 'tB', [3, 0], l1, { score: { text: '3-0', sides: [3, 0], lines: l1, tl: tl1 } });
    const l2 = [fl('a1', 1, 2, 0), fl('a2', 1, 0, 2), fl('a4', 1, 0, 0, '0:0:0:1:1'), fl('b1', 2, 1)].join(';');
    const m2 = tm('f2', day(10, 2), 'tA', 'tB', [2, 1], l2);
    const ds = run('football', join(m1, m2));
    const mine = (key: string, u: string) => of(ds, key).filter((d) => d.user_id === u);
    expect(mine('football_first_goal', 'u-a1').map((d) => d.level)).toEqual([0]);
    expect(mine('football_goals', 'u-a1').map((d) => d.level)).toEqual([1]);
    expect(mine('football_goals_in_match', 'u-a1').map((d) => d.level)).toEqual([1, 2]);
    expect(mine('football_assists', 'u-a2').map((d) => d.level)).toEqual([1]);
    expect(mine('football_clean_sheet', 'u-a4').map((d) => d.level)).toEqual([1]);
    expect(mine('football_clean_sheet', 'u-a4')[0].refs).toEqual(['match:f1']);
  });

  it('sala usa sus propios umbrales; si la cronología no cuadra con la línea, esa noche goleadora no cuenta', () => {
    const l = [fl('a1', 1, 3), fl('b1', 2)].join(';');
    const ok = run('futsal', tm('s1', day(10, 3), 'tA', 'tB', [3, 0], l));
    expect(of(ok, 'football_goals_in_match').filter((d) => d.user_id === 'u-a1').map((d) => d.level)).toEqual([1]);
    const bad = run('futsal', tm('s2', day(10, 3), 'tA', 'tB', [3, 0], l, { score: { text: '3-0', sides: [3, 0], lines: l, tl: 'g1.5.0.;g1.9.0.' } }));
    expect(of(bad, 'football_goals_in_match')).toEqual([]);
  });

  it('gol del triunfo: el gol que dejó arriba a su lado para siempre, en el último 10 % (sin penales, con reloj)', () => {
    const l = [fl('a1', 1, 1), fl('a2', 1, 1), fl('b1', 2, 1)].join(';');
    const tl = 'g1.30.1.;g2.60.2.;g1.88.0.';
    const b = tm('w1', day(10, 4), 'tA', 'tB', [2, 1], l, { score: { text: '2-1', sides: [2, 1], lines: l, tl } });
    const ds = run('football', b);
    expect(of(ds, 'football_late_winner').map((d) => d.player_id)).toEqual(['a1']);
    expect(of(ds, 'football_late_winner')[0].context.values).toEqual({ minuto: 88 });
    // Sin reloj no se puede saber.
    const noClock = run('football', tm('w2', day(10, 4), 'tA', 'tB', [2, 1], l, { rules: { match: { clock: 'none' } }, score: { text: '2-1', sides: [2, 1], lines: l, tl } }));
    expect(of(noClock, 'football_late_winner')).toEqual([]);
    // El gol del minuto 70 no es «al final».
    const early = run('football', tm('w3', day(10, 4), 'tA', 'tB', [2, 1], l, { score: { text: '2-1', sides: [2, 1], lines: l, tl: 'g1.30.1.;g2.60.2.;g1.70.0.' } }));
    expect(of(early, 'football_late_winner')).toEqual([]);
  });

  it('nervios de acero: empató y ganó en penales, jugando', () => {
    const l = [fl('a1', 1, 1), fl('b1', 2, 1)].join(';');
    const ds = run('football', tm('pe', day(10, 5), 'tA', 'tB', [1, 1], l, { winner_side: 1, score: { text: '1-1 (pen. 4-3)', sides: [1, 1], lines: l, pens: [4, 3] } }));
    expect(of(ds, 'football_shootout_win').map((d) => d.player_id)).toEqual(['a1']);
  });

  it('corregir el acta retira la noche goleadora provisional', () => {
    const l = [fl('a1', 1, 1), fl('b1', 2)].join(';');
    const had = [row({ badge_key: 'football_goals_in_match', sport: 'football', level: 1, period_key: '-', user_id: 'u-a1' })];
    const ds = run('football', tm('f9', day(10, 6), 'tA', 'tB', [1, 0], l), { awards: had }, job('revisar', { ref: 'match:f9' }));
    expect(ds.filter((d) => d.kind === 'revoke').map((d) => `${d.badge_key}@${d.user_id}`)).toEqual(['football_goals_in_match@u-a1']);
  });

  it('minutos de la cronología', () => {
    expect([minuteOf('88'), minuteOf('90+3'), minuteOf('45+2'), minuteOf(null), minuteOf('x')]).toEqual([88, 93, 47, null, null]);
  });
});

describe('event_podium de equipos: torneo relámpago', () => {
  const EVENT: SnapEvent = snapEvent('REL', { type: 'torneo', date: '2026-10-24' });
  const kb = (id: string, key: string, a: string, b: string, sides: [number, number], over: Partial<SnapMatch> = {}) =>
    tm(id, '2026-10-24', a, b, sides, [fl(ROSTER[a][0], 1), fl(ROSTER[a][1], 1), fl(ROSTER[b][0], 2)].join(';'), { event_id: 'REL', bracket_key: key, ...over });
  const group = (id: string, a: string, b: string) => tm(id, '2026-10-24', a, b, [1, 0], [fl(ROSTER[a][0], 1), fl(ROSTER[b][0], 2)].join(';'), { event_id: 'REL' });
  const tournament = join(
    group('g1', 'tA', 'tE'),
    group('g2', 'tB', 'tF'),
    group('g3', 'tC', 'tE'),
    kb('s1', 'R1-1', 'tA', 'tD', [2, 0]),
    kb('s2', 'R1-2', 'tB', 'tC', [1, 1], { winner_side: 1, score: { text: '1-1 (pen. 5-4)', sides: [1, 1], pens: [5, 4], lines: [fl('b1', 1), fl('c1', 2)].join(';') } }),
    kb('fi', 'R2-1', 'tA', 'tB', [0, 0], { winner_side: 2, score: { text: '0-0 (pen. 3-4)', sides: [0, 0], pens: [3, 4], lines: [fl('a1', 1), fl('a2', 1), fl('b1', 2), fl('b2', 2)].join(';') } }),
    kb('p3', 'P3', 'tC', 'tD', [3, 1]),
  );
  const runRel = (b: Built = tournament, over: Partial<BadgeSnapshot> = {}) => {
    const j = job('evento', { ref: 'event:REL' });
    return evaluate(j, snap(j, world('football', { players: PLAYERS, teams: TEAM_ROWS, team_players: TEAM_PLAYERS, events: [EVENT], ...b, ...over })), NOW);
  };

  it('6 equipos: oro y plata de la final (los penales desempatan), a quienes aparecieron en el torneo', () => {
    const ds = runRel();
    expect(gives(ds)).toEqual(['event_podium:2:e:REL@a1', 'event_podium:2:e:REL@a2', 'event_podium:3:e:REL@b1', 'event_podium:3:e:REL@b2']);
    expect(of(ds, 'event_podium').find((d) => d.player_id === 'b1')).toMatchObject({ status: 'firme', context: { team: { id: 'tB' }, values: { equipos: 6 } } });
  });

  it('sin ningún dato de alineación en el torneo, va a la plantilla (según plantilla)', () => {
    const bare = { ...tournament, matches: tournament.matches.map((m) => ({ ...m, score: { ...m.score!, lines: '' } })) };
    const ds = runRel(bare);
    expect(of(ds, 'event_podium').filter((d) => d.level === 3).map((d) => d.player_id).sort()).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(of(ds, 'event_podium')[0].context.by_roster).toBe(true);
  });

  it('en una liga kind=torneo no hay event_podium', () => {
    expect(runRel(tournament, { leagues: [snapLeague('L', { sport: 'football', kind: 'torneo' })] })).toEqual([]);
  });
});

describe('debut de equipos', () => {
  it('la plantilla vale para el debut cuando el partido no tiene alineación', () => {
    const ds = run('football', tm('d1', day(11, 1), 'tA', 'tB', [1, 0], ''));
    expect(of(ds, 'debut').map((d) => d.user_id).sort()).toEqual([...ROSTER.tA, ...ROSTER.tB].map((p) => `u-${p}`).sort());
    expect(of(ds, 'team_matches')).toEqual([]);
  });
});
