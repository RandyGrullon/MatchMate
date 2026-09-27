import { describe, expect, it } from 'vitest';
import type { Match, MatchSide } from '../../../lib/data/matches';
import { basketball, basketballConfig, type BasketballEvent, type BasketballState } from '../../../sports/team/basketball';
import { basketballTotals } from '../../../sports/team/stats';
import { basketballStandings } from '../../../sports/team/standings';
import { replay } from '../../../sports/types';
import {
  basketballAdapter,
  basketballScore,
  basketballWinner,
  decodeLines,
  encodeLines,
  eventLabel,
  forfeitScore,
  liveClockMs,
  liveFromScore,
  matchResultOf,
  periodsFromScore,
  seasonLines,
} from './adapter';
import { BASKETBALL_TEMPLATES, basketballConfigFrom, basketballTableFrom, basketballTeamRules, describeConfig, templateOf, templateRules } from './rules';

const T0 = 1_800_000_000_000;

describe('reglas de la liga', () => {
  it('sin reglas: FIBA 5x5; 3x3 por su variante; lo raro se ignora', () => {
    expect(basketballConfigFrom({})).toEqual(basketballConfig('fiba'));
    expect(basketballConfigFrom({ match: { variant: '3x3' } })).toEqual(basketballConfig('3x3'));
    const cfg = basketballConfigFrom({ match: { variant: '5x5', periods: 2, periodMinutes: 20, bonusFrom: 99, clock: false, timeouts: { firstHalf: 1 } } });
    expect(cfg).toMatchObject({ periods: 2, periodMinutes: 20, bonusFrom: 5, clock: false, timeouts: { firstHalf: 1, secondHalf: 3 } });
    expect(basketballConfigFrom({ match: { ejection: { fouls: null } } }).ejection.fouls).toBeNull();
  });

  it('plantillas: cambian el partido y lo de los equipos, y conservan lo demás', () => {
    const r = templateRules('barrio', { table: { win: 3 }, otra: 1 });
    expect(r).toMatchObject({ otra: 1, match: basketballConfig('halves'), table: { win: 3, loss: 1 }, teams: { runningClock: true, template: 'barrio' } });
    expect(templateOf(r)?.id).toBe('barrio');
    expect(templateOf(templateRules('3x3'))?.name).toBe('Torneo 3x3 a 21');
    expect(templateOf({ match: { periods: 3 } })).toBeNull();
    expect(BASKETBALL_TEMPLATES.map((t) => t.id)).toEqual(['fiba', 'barrio', '3x3']);
    expect(basketballTeamRules(templateRules('3x3'))).toMatchObject({ minPlayers: 3, reinforcements: 1 });
    expect(basketballTeamRules({})).toMatchObject({ minPlayers: 5, reinforcements: 2 });
    expect(basketballTableFrom({})).toMatchObject({ win: 2, loss: 1, forfeitLoss: 0, defaultLoss: 1, forfeitScore: 20 });
  });

  it('se describe en una línea', () => {
    expect(describeConfig(basketballConfig('fiba'))).toBe('4 cuartos de 10 min · prórroga de 5 · tiros libres desde la 5.ª falta');
    expect(describeConfig(basketballConfig('halves'))).toBe('2 mitades de 20 min · prórroga de 5 · tiros libres desde la 7.ª falta');
    expect(describeConfig(basketballConfig('3x3'))).toContain('3x3 · 1 × 10 min o a 21');
  });
});

/** Un partido corto: 2 cuartos de 1 minuto, con reloj. */
function game(events: BasketballEvent[]): BasketballState {
  return replay(basketball, basketballConfig('fiba', { periods: 2, periodMinutes: 1 }), events);
}

describe('marcador publicado (matches.score)', () => {
  const evs: BasketballEvent[] = [
    { type: 'present', side: 1, players: ['a', 'b'] },
    { type: 'present', side: 2, players: ['x'] },
    { type: 'clock', action: 'start', at: T0 },
    { type: 'score', side: 1, points: 3, player: 'a', at: T0 + 5_000 },
    { type: 'score', side: 2, points: 2, player: 'x', at: T0 + 9_000 },
    { type: 'foul', side: 2, kind: 'personal', player: 'x', at: T0 + 10_000 },
    { type: 'score', side: 1, points: 1, at: T0 + 12_000 },
  ];

  it('texto, lados, periodos, presentes (con 0) y el en vivo con el reloj en hora del servidor', () => {
    const s = game(evs);
    const score = basketballScore(s, T0 + 20_000, 1_500);
    expect(score).toMatchObject({ text: '4-2', sides: [4, 2], totals: { points: [4, 2] }, periods: [[4, 2]] });
    expect(decodeLines(score.lines)).toEqual([
      { playerId: 'a', side: 1, points: 3, ones: 0, twos: 0, threes: 1, fouls: 0 },
      { playerId: 'b', side: 1, points: 0, ones: 0, twos: 0, threes: 0, fouls: 0 },
      { playerId: 'x', side: 2, points: 2, ones: 0, twos: 1, threes: 0, fouls: 1 },
    ]);
    const live = liveFromScore(score)!;
    expect(live).toEqual({ p: 1, pl: '1.ª mitad', tf: [0, 1], bonus: [false, false], clk: { r: true, ms: 40_000, t: T0 + 21_500 } });
    // Un espectador 10 s (del servidor) después ve 10 s menos; parado, lo mismo.
    expect(liveClockMs(live, T0 + 31_500)).toBe(30_000);
    expect(liveClockMs({ clk: { r: false, ms: 40_000, t: T0 } }, T0 + 99_000)).toBe(40_000);
    expect(liveClockMs({ clk: { r: true, ms: 5_000, t: T0 } }, T0 + 99_000)).toBe(0);
    expect(periodsFromScore(score)).toEqual([[4, 2]]);
  });

  it('publica al cambiar de periodo, al terminar y cuando el reloj arranca o se para; no por canasta', () => {
    const a = basketballAdapter({ now: () => T0, offset: () => 0 });
    const s0 = game(evs);
    const basket = basketball.apply(s0, { type: 'score', side: 2, points: 2, at: T0 + 30_000 });
    expect(a.milestone!(s0, basket, { type: 'score', side: 2, points: 2 })).toBe(false);
    const stop = basketball.apply(s0, { type: 'clock', action: 'stop', at: T0 + 30_000 });
    expect(a.milestone!(s0, stop, { type: 'clock', action: 'stop', at: T0 + 30_000 })).toBe(true);
    const next = basketball.apply(stop, { type: 'period_end', at: T0 + 31_000 });
    expect(a.milestone!(stop, next, { type: 'period_end' })).toBe(true);
    const end = basketball.apply(next, { type: 'period_end', at: T0 + 32_000 });
    expect(end.status).toBe('final');
    expect(a.milestone!(next, end, { type: 'period_end' })).toBe(true);
    expect(a.score(end)).toMatchObject({ text: '4-2', periods: [[4, 2], [0, 0]] });
    expect(a.winner!(end)).toBe(1);
  });

  it('prórroga, forfeit y default en el texto; el ganador si se termina antes', () => {
    const tied = game([{ type: 'score', side: 1, points: 2 }, { type: 'score', side: 2, points: 2 }, { type: 'period_end' }, { type: 'period_end' }]);
    expect(tied.period).toBe(3);
    expect(basketballScore(basketball.apply(tied, { type: 'score', side: 1, points: 2 }), T0).text).toBe('4-2 (pr.)');
    const forfeit = game([{ type: 'forfeit', side: 2 }]);
    expect(basketballScore(forfeit, T0)).toMatchObject({ text: '20-0 (forfeit)', ending: { kind: 'forfeit', side: 2 } });
    const dflt = game([{ type: 'score', side: 2, points: 3 }, { type: 'default', side: 2 }]);
    expect(basketballScore(dflt, T0)).toMatchObject({ text: '2-0 (default)', ending: { kind: 'default', side: 2 } });
    expect(basketballWinner(game([{ type: 'score', side: 2, points: 1 }]))).toBe(2);
    expect(basketballWinner(game([]))).toBeNull();
  });

  it('las líneas nunca pasan el tope de 4 KB del marcador', () => {
    const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const many = Array.from({ length: 70 }, (_, i) => uuid(i));
    const s = game([
      { type: 'present', side: 1, players: many.slice(0, 35) },
      { type: 'present', side: 2, players: many.slice(35) },
      { type: 'score', side: 1, points: 2, player: many[0] },
    ]);
    const text = encodeLines(s);
    expect(text.length).toBeLessThanOrEqual(2800);
    // Solo quedaron los que anotaron o hicieron falta.
    expect(decodeLines(text).map((l) => l.playerId)).toEqual([many[0]]);
    expect(JSON.stringify(basketballScore(s, T0)).length).toBeLessThan(4000);
    expect(decodeLines('a:1:2:0:1:0:0;roto;b:3:1:1:0:0:0;c:2:x:0:0:0:0')).toEqual([{ playerId: 'a', side: 1, points: 2, ones: 0, twos: 1, threes: 0, fouls: 0 }]);
  });

  it('textos de las jugadas para «Deshacer»', () => {
    const who = (side: 1 | 2, p?: string) => (p ? `#${p}` : side === 1 ? 'Tigres' : 'Leones');
    expect(eventLabel({ type: 'score', side: 1, points: 2, player: '7' }, who)).toBe('+2 #7');
    expect(eventLabel({ type: 'foul', side: 2, kind: 'unsportsmanlike' }, who)).toBe('Falta antideportiva Leones');
    expect(eventLabel({ type: 'timeout', side: 1 }, who)).toBe('Tiempo muerto Tigres');
  });
});

const side = (n: 1 | 2, teamId: string | null): MatchSide => ({ side: n, teamId, label: teamId ?? 'X', seed: null, players: [] });

function match(id: string, p: Partial<Match>): Match {
  return {
    id,
    leagueId: 'L',
    eventId: null,
    round: 1,
    stage: '',
    bracketKey: null,
    court: '',
    scheduledAt: null,
    status: 'confirmed',
    format: 'fiba',
    requireConfirm: true,
    score: null,
    winner: null,
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
    sides: [side(1, 'A'), side(2, 'B')],
    createdAt: null,
    updatedAt: null,
    ...p,
  };
}

describe('tabla y anotadores de la temporada', () => {
  it('resultado para la tabla FIBA: normal, W.O., forfeit y default', () => {
    expect(matchResultOf(match('m1', { score: { sides: [70, 60] }, winner: 1 }))).toEqual({ id: 'm1', side1: 'A', side2: 'B', winner: 1, totals: { points: [70, 60] } });
    expect(matchResultOf(match('m2', { status: 'walkover', walkoverSide: 2, winner: 1 }))).toMatchObject({ walkover: 2, winner: 1 });
    expect(matchResultOf(match('m3', { status: 'walkover', walkoverSide: 0 }))).toBeNull();
    expect(matchResultOf(match('m4', { score: { sides: [2, 0], ending: { kind: 'default', side: 2 } }, winner: 1 }))).toMatchObject({ defaulted: 2 });
    expect(matchResultOf(match('m5', { score: { sides: [20, 0], ending: { kind: 'forfeit', side: 2 } }, winner: 1 }))).toMatchObject({ walkover: 2 });
    expect(matchResultOf(match('m6', { score: null }))).toBeNull();
    const rows = basketballStandings(
      ['A', 'B', 'C'],
      [
        matchResultOf(match('m1', { score: { sides: [70, 60] }, winner: 1 }))!,
        matchResultOf(match('m2', { status: 'walkover', walkoverSide: 1, winner: 2, sides: [side(1, 'C'), side(2, 'B')] }))!,
      ],
    );
    expect(rows.map((r) => [r.id, r.points])).toEqual([
      ['B', 3],
      ['A', 2],
      ['C', 0],
    ]);
  });

  it('las líneas salen solo de los partidos que cuentan, con el equipo de cada lado', () => {
    const lines = 'a:1:10:2:1:2:3;x:2:7:1:3:0:5';
    const list = [
      match('m1', { score: { sides: [10, 7], lines }, winner: 1 }),
      match('m2', { status: 'finished', proposedAt: new Date(T0 - 1000).toISOString(), score: { sides: [5, 0], lines: 'a:1:5:0:1:1:0' }, winner: 1 }),
      match('m3', { status: 'live', score: { sides: [2, 0], lines: 'a:1:2:0:1:0:0' } }),
    ];
    const got = seasonLines(list, T0);
    expect(got.map((l) => [l.matchId, l.player, l.team, l.points])).toEqual([
      ['m1', 'a', 'A', 10],
      ['m1', 'x', 'B', 7],
    ]);
    // A las 48 h el propuesto también cuenta.
    expect(seasonLines(list, T0 + 49 * 3600_000)).toHaveLength(3);
    const totals = basketballTotals(seasonLines(list, T0 + 49 * 3600_000));
    expect(totals[0]).toMatchObject({ player: 'a', games: 2, points: 15, avg: 7.5, high: 10, threes: 3, ftm: 2, fouls: 3 });
  });

  it('marcador del W.O.', () => {
    expect(forfeitScore(20, 2)).toEqual({ text: '20-0', sides: [20, 0], totals: { points: [20, 0] } });
    expect(forfeitScore(20, 1).sides).toEqual([0, 20]);
    expect(forfeitScore(20, 0).sides).toEqual([0, 0]);
  });
});

describe('temporada y Excel', () => {
  it('la temporada: tabla FIBA y anotadores solo con partidos entre equipos de la temporada', async () => {
    const { basketballSeason } = await import('./season');
    const list = [
      match('m1', { score: { sides: [70, 60], lines: 'a:1:20:0:7:2:1;x:2:15:3:6:0:2' }, winner: 1 }),
      match('m2', { score: { sides: [50, 55], lines: 'a:1:12:0:6:0:0' }, winner: 2, sides: [side(1, 'A'), side(2, 'C')] }),
      // Contra un equipo borrado: no cuenta.
      match('m3', { score: { sides: [90, 10] }, winner: 1, sides: [side(1, 'A'), side(2, null)] }),
    ];
    const s = basketballSeason(list, ['A', 'B', 'C'], {}, T0);
    expect(s.standings.map((r) => [r.id, r.played, r.points])).toEqual([
      ['A', 2, 3],
      ['C', 1, 2],
      ['B', 1, 1],
    ]);
    expect(s.leaders.map((l) => [l.player, l.games, l.points])).toEqual([
      ['a', 2, 32],
      ['x', 1, 15],
    ]);
  });

  it('las hojas del Excel: calendario, tabla, resultados con periodos y anotadores', async () => {
    const { basketballSeason } = await import('./season');
    const { basketballSheets } = await import('./excel');
    const list = [
      match('m1', { score: { text: '70-60', sides: [70, 60], periods: [[40, 30], [30, 30]], lines: 'a:1:20:0:7:2:1' }, winner: 1 }),
      match('m2', { status: 'scheduled', round: 2, scheduledAt: '2026-10-10T23:00:00.000Z' }),
    ];
    const season = basketballSeason(list, ['A', 'B'], {}, T0);
    const sheets = basketballSheets({ leagueName: 'Liga', matches: list, season, teamName: (k) => `Equipo ${k}`, playerName: (p) => `Jugador ${p}`, tz: 'America/Santo_Domingo', now: T0 });
    expect(sheets.map((x) => x.sheet)).toEqual(['Calendario', 'Tabla', 'Resultados', 'Anotadores']);
    const cells = (i: number) => sheets[i].data.map((row) => row.map((c) => (c && typeof c === 'object' && 'value' in c ? c.value : c)));
    expect(cells(0)).toHaveLength(3);
    const { whenText } = await import('../../../components/match/format');
    expect(cells(0)[2]).toEqual([2, whenText('2026-10-10T23:00:00.000Z', 'America/Santo_Domingo'), '', 'Equipo A', 'Equipo B', 'Programado', '']);
    expect(cells(1)[1]).toEqual([1, 'Equipo A', 1, 1, 0, 70, 60, 10, 2, '']);
    expect(cells(2)[0]).toContain('Periodo 2');
    expect(cells(2)[1]).toEqual([1, '', 'Equipo A', 70, 60, 'Equipo B', '40-30', '30-30', 'Final']);
    expect(cells(3)[1]).toEqual([1, 'Jugador a', 'Equipo A', 1, 20, 20, 20, 2, 0, 1]);
  });
});
