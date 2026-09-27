import { describe, expect, it } from 'vitest';
import type { Match, MatchSide } from '../../../lib/data/matches';
import { SPORTS } from '../../../sports/registry';
import { football, footballConfig, type FootballConfig, type FootballEvent, type FootballState } from '../../../sports/team/football';
import { replay } from '../../../sports/types';
import {
  atBreak,
  cardLinesOf,
  correctedScore,
  decodeLines,
  decodeTimeline,
  encodeLines,
  eventLabel,
  footballAdapter,
  footballResultParser,
  footballScore,
  footballWinner,
  isMilestone,
  liveFromScore,
  liveMinute,
  livePowerPlays,
  matchLines,
  matchResultOf,
  minuteText,
  pensFromScore,
  stageLabel,
  stateLines,
  walkoverScore,
  type ScoreLine,
} from './adapter';
import { footballSheets } from './excel';
import {
  FOOTBALL_TEMPLATES,
  defaultMinPlayers,
  describeConfig,
  describeDiscipline,
  disciplineFrom,
  footballConfigFrom,
  footballTableFrom,
  footballTeamRules,
  formatOf,
  knockoutRules,
  templateOf,
  templateRules,
  templatesFor,
  variantOf,
} from './rules';
import { cardTable, disciplineOrder, disciplineStatus, footballSeason, groupRanking, suspendedForNext, suspendedIn, toDisciplineMatches } from './season';

const MIN = 60_000;
const T0 = 1_800_000_000_000;
const FIELD = footballConfig('football');
const FUTSAL = footballConfig('futsal');
const play = (log: FootballEvent[], cfg: FootballConfig = FIELD): FootballState => replay(football, cfg, log);

// ---------- Partidos para las tablas y la disciplina ----------

const side = (s: 1 | 2, teamId: string): MatchSide => ({ side: s, teamId, label: teamId, seed: null, players: [] });
let n = 0;
function match(p: Partial<Match> & { home: string; away: string }): Match {
  const { home, away, ...rest } = p;
  n++;
  return {
    id: `m${n}`,
    leagueId: 'L',
    eventId: null,
    round: n,
    stage: '',
    bracketKey: null,
    court: '',
    scheduledAt: new Date(T0 + n * 7 * 86_400_000).toISOString(),
    status: 'scheduled',
    format: 'football',
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
    sides: [side(1, home), side(2, away)],
    createdAt: null,
    updatedAt: null,
    ...rest,
  };
}
/** Un partido confirmado con el acta publicada por el adaptador. */
function played(home: string, away: string, log: FootballEvent[], extra: Partial<Match> = {}): Match {
  const s = play(log);
  return match({ home, away, status: 'confirmed', score: footballScore(s, T0), winner: footballWinner(s), ...extra });
}

describe('reglas de la liga', () => {
  it('variante por el deporte; sin reglas: la de la variante; lo raro se ignora', () => {
    expect(variantOf('futsal')).toBe('futsal');
    expect(variantOf('football')).toBe('football');
    expect(footballConfigFrom({}, 'football')).toEqual(FIELD);
    expect(footballConfigFrom({}, 'futsal')).toEqual(FUTSAL);
    // Aunque las reglas digan campo, en una liga de sala manda la variante de la liga.
    expect(footballConfigFrom({ match: { variant: 'football', halfMinutes: 25 } }, 'futsal')).toMatchObject({ variant: 'futsal', halfMinutes: 25, powerPlayMs: 120_000 });
    const cfg = footballConfigFrom({ match: { halfMinutes: 99, clock: 'loco', players: 7, subs: { max: null, reentry: true }, accumulatedFouls: null, shootoutKicks: 3 } }, 'football');
    expect(cfg).toMatchObject({ halfMinutes: 45, clock: 'running', players: 7, subs: { max: null, reentry: true, extraTimeBonus: 1 }, accumulatedFouls: null, shootoutKicks: 3 });
  });

  it('plantillas por modalidad: campo ida y vuelta, fútbol 7, sala, sala amateur y torneo relámpago', () => {
    expect(templatesFor('football').map((t) => t.name)).toEqual(['Liga de campo ida y vuelta', 'Fútbol 7', 'Torneo relámpago (grupos + final)']);
    expect(templatesFor('futsal').map((t) => t.name)).toEqual(['Liga de sala', 'Liga de sala amateur (reloj corrido)', 'Torneo relámpago (grupos + final)']);
    const campo = templateRules('campo', 'football', { table: { win: 2 }, otra: 1 });
    expect(campo).toMatchObject({ otra: 1, match: FIELD, table: { win: 2, draw: 1 }, discipline: { redMatches: 1, yellowsForSuspension: 3 }, teams: { minPlayers: 7, template: 'campo' } });
    expect(templateOf(campo, 'football')?.double).toBe(true);
    expect(templateOf(templateRules('campo7', 'football'), 'football')?.id).toBe('campo7');
    const rel = templateRules('relampago', 'futsal');
    expect(rel).toMatchObject({ match: { variant: 'futsal', halfMinutes: 15, clock: 'running', shootoutKicks: 3 }, teams: { template: 'relampago' } });
    expect(templateOf(rel, 'futsal')?.format).toBe('relampago');
    expect(formatOf(rel)).toBe('relampago');
    expect(formatOf(campo)).toBe('liga');
    expect(templateOf({ match: { halfMinutes: 33 } }, 'football')).toBeNull();
    // Todas las plantillas pasan la validación del registro de su deporte.
    for (const t of FOOTBALL_TEMPLATES) expect(SPORTS[t.variant].validateRules(templateRules(t.id, t.variant)), t.name).toEqual([]);
  });

  it('eliminatoria: penales si empatan (y prórroga si se pide)', () => {
    expect(knockoutRules({}, 'football')).toMatchObject({ match: { shootout: true, extraTime: false, variant: 'football' } });
    expect(knockoutRules(templateRules('relampago', 'futsal'), 'futsal', { extraTime: true })).toMatchObject({ match: { shootout: true, extraTime: true, shootoutKicks: 3 } });
  });

  it('tabla, disciplina y convocatoria', () => {
    expect(footballTableFrom({})).toMatchObject({ win: 3, draw: 1, loss: 0, tiebreak: ['diff', 'for', 'h2h', 'fair_play', 'lot'], shootout: null, lotSeed: null });
    expect(footballTableFrom({ table: { tiebreak: ['h2h', 'nada', 'diff', 'h2h'], shootout: { win: 2 } } }).tiebreak).toEqual(['h2h', 'diff']);
    expect(footballTableFrom({ table: { shootout: { win: 2, loss: 1 } } }).shootout).toEqual({ win: 2, loss: 1 });
    expect(disciplineFrom({ discipline: { yellowsForSuspension: 5, secondYellowCounts: true, redMatches: 'x' } })).toMatchObject({ yellowsForSuspension: 5, secondYellowCounts: true, redMatches: 1 });
    expect([11, 7, 5].map(defaultMinPlayers)).toEqual([7, 5, 3]);
    expect(footballTeamRules({}, 'football')).toMatchObject({ minPlayers: 7, reinforcements: 0, runningClock: true });
    expect(footballTeamRules({}, 'futsal')).toMatchObject({ minPlayers: 3, runningClock: false });
    expect(footballTeamRules({ teams: { minPlayers: 9, reinforcements: 2 } }, 'football')).toMatchObject({ minPlayers: 9, reinforcements: 2 });
    expect(describeConfig(FIELD)).toBe('2 tiempos de 45 min · reloj corrido · 11 por lado · 5 cambios');
    expect(describeConfig(FUTSAL)).toBe(
      '2 tiempos de 20 min · reloj parado · 5 por lado · cambios ilimitados con reingreso · faltas acumuladas (10 m desde la 6.ª) · 1 tiempo muerto por mitad · 2 min con uno menos tras una roja',
    );
    expect(describeDiscipline(disciplineFrom({}))).toBe('Roja directa: 1 partido · doble amarilla: 1 partido · 3 amarillas: 1 partido');
  });
});

describe('acta publicada (matches.score)', () => {
  const log: FootballEvent[] = [
    { type: 'lineup', side: 1, players: ['a1', 'a2', 'gkA'], goalkeeper: 'gkA' },
    { type: 'lineup', side: 2, players: ['b1', 'b2', 'gkB'], goalkeeper: 'gkB' },
    { type: 'clock', action: 'start', at: T0 },
    { type: 'goal', side: 1, player: 'a1', assist: 'a2', at: T0 + 22 * MIN },
    { type: 'card', side: 2, player: 'b1', card: 'yellow', at: T0 + 30 * MIN },
    { type: 'card', side: 2, player: 'b9', card: 'yellow', at: T0 + 31 * MIN }, // desde el banco
    { type: 'added_time', minutes: 3 },
    { type: 'card', side: 2, player: 'b1', card: 'yellow', at: T0 + 46 * MIN }, // 2.ª amarilla: roja, 45+2
    { type: 'period_end', at: T0 + 48 * MIN },
    { type: 'clock', action: 'start', at: T0 + 60 * MIN },
    { type: 'goal', side: 2, player: 'a2', ownGoal: true, at: T0 + 70 * MIN }, // autogol de a2
    { type: 'sub', side: 1, out: 'a1', in: 'a3', at: T0 + 75 * MIN },
    { type: 'goal', side: 1, at: T0 + 80 * MIN }, // sin jugador
  ];

  it('marcador, totales, tiempos y el acta por jugador (ida y vuelta)', () => {
    const s = play(log);
    const score = footballScore(s, T0 + 81 * MIN);
    expect(score).toMatchObject({ text: '2-1', sides: [2, 1], periods: [[1, 0], [1, 1]] });
    expect(score.totals).toMatchObject({ goals: [2, 1], yellow: [0, 3], red: [0, 1], cardsYellow: [0, 1], cardsSecondYellow: [0, 1] });
    const lines = decodeLines(score.lines);
    const by = (id: string) => lines.find((l) => l.playerId === id);
    expect(by('a1')).toEqual({ playerId: 'a1', side: 1, played: true, goals: 1, assists: 0, ownGoals: 0, yellows: 0, red: null, keeper: false, conceded: 0 });
    expect(by('a2')).toMatchObject({ assists: 1, ownGoals: 1, played: true });
    expect(by('a3')).toMatchObject({ played: true, goals: 0 });
    expect(by('b1')).toMatchObject({ yellows: 2, red: 'second_yellow', played: true });
    expect(by('b9')).toMatchObject({ played: false, yellows: 1 });
    expect(by('gkA')).toMatchObject({ keeper: true, conceded: 1 });
    expect(by('gkB')).toMatchObject({ keeper: true, conceded: 2 });
    // Los ceros del final no se escriben.
    expect(score.lines).toContain(';a3:1:1;');
    expect(encodeLines(lines).text).toBe(score.lines);
    const tl = decodeTimeline(score.tl, lines);
    expect(tl).toEqual([
      { kind: 'goal', side: 1, minute: '23', player: 'a1', assist: 'a2' },
      { kind: 'yellow', side: 2, minute: '31', player: 'b1', assist: null },
      { kind: 'yellow', side: 2, minute: '32', player: 'b9', assist: null },
      { kind: 'second_yellow', side: 2, minute: '45+2', player: 'b1', assist: null },
      { kind: 'own_goal', side: 2, minute: '56', player: 'a2', assist: null },
      { kind: 'goal', side: 1, minute: '66', player: null, assist: null },
    ]);
    // Cabe de sobra en matches.score (< 4 KB).
    expect(JSON.stringify(score).length).toBeLessThan(1500);
  });

  it('las tarjetas para la disciplina (también las del banco) y la valla invicta', () => {
    const m = played('A', 'B', log);
    expect(cardLinesOf(m)).toEqual([
      { player: 'b1', team: 'B', yellows: 2, red: 'second_yellow' },
      { player: 'b9', team: 'B', yellows: 1, red: null },
    ]);
    const shut = played('A', 'B', [{ type: 'lineup', side: 1, players: ['gkA'], goalkeeper: 'gkA' }, { type: 'goal', side: 1 }, { type: 'period_end' }, { type: 'period_end' }]);
    expect(matchLines(shut).find((l) => l.playerId === 'gkA')).toMatchObject({ cleanSheet: true, keeper: true });
  });

  it('un partido de 36 jugadores y muchas jugadas sigue cabiendo en 4 KB', () => {
    const uuid = (i: number) => `0192f0c4-1c2b-7d3e-8f40-${String(i).padStart(12, '0')}`;
    const a = Array.from({ length: 18 }, (_, i) => uuid(i));
    const b = Array.from({ length: 18 }, (_, i) => uuid(100 + i));
    const evs: FootballEvent[] = [
      { type: 'lineup', side: 1, players: a.slice(0, 11), goalkeeper: a[0] },
      { type: 'lineup', side: 2, players: b.slice(0, 11), goalkeeper: b[0] },
      { type: 'clock', action: 'start', at: T0 },
    ];
    for (let i = 0; i < 7; i++) evs.push({ type: 'sub', side: 1, out: a[1 + i], in: a[11 + i], at: T0 + (50 + i) * MIN }, { type: 'sub', side: 2, out: b[1 + i], in: b[11 + i], at: T0 + (50 + i) * MIN });
    for (let i = 0; i < 12; i++) evs.push({ type: 'goal', side: i % 2 ? 2 : 1, player: (i % 2 ? b : a)[8 + (i % 3)], assist: (i % 2 ? b : a)[9 - (i % 2)] === (i % 2 ? b : a)[8 + (i % 3)] ? undefined : (i % 2 ? b : a)[9 - (i % 2)], at: T0 + (60 + i) * MIN });
    for (let i = 0; i < 10; i++) evs.push({ type: 'card', side: i % 2 ? 2 : 1, player: (i % 2 ? b : a)[11 + (i % 6)], card: 'yellow', at: T0 + (75 + i) * MIN });
    const s = play(evs, footballConfig('football', { subs: { max: null, reentry: false, extraTimeBonus: 0 } }));
    const score = footballScore(s, T0 + 90 * MIN);
    expect(new TextEncoder().encode(JSON.stringify(score)).length).toBeLessThan(4000);
    expect(decodeLines(score.lines)).toHaveLength(36);
    expect(decodeTimeline(score.tl, decodeLines(score.lines)).filter((e) => e.kind === 'goal')).toHaveLength(12);
  });

  it('penales aparte y W.O.', () => {
    const cup = footballConfig('football', { shootout: true, shootoutKicks: 3 });
    const s = play(
      [
        { type: 'goal', side: 1 },
        { type: 'goal', side: 2 },
        { type: 'period_end' },
        { type: 'period_end' },
        { type: 'shootout', side: 1, player: 'x', scored: true },
        { type: 'shootout', side: 2, scored: false },
        { type: 'shootout', side: 1, scored: true },
        { type: 'shootout', side: 2, scored: true },
        { type: 'shootout', side: 1, scored: true },
      ],
      cup,
    );
    const score = footballScore(s, T0);
    expect(score).toMatchObject({ text: '1-1 (pen. 3-1)', sides: [1, 1], pens: [3, 1] });
    expect(footballWinner(s)).toBe(1);
    expect(pensFromScore(score)).toEqual([3, 1]);
    expect(stageLabel(s)).toBe('Final');
    const wo = footballScore(play([{ type: 'walkover', side: 2 }]), T0);
    expect(wo).toMatchObject({ text: '3-0 (W.O.)', sides: [3, 0], walkover: 2 });
    expect(walkoverScore(3, 1)).toEqual({ text: '0-3 (W.O.)', sides: [0, 3], totals: { goals: [0, 3] } });
    expect(walkoverScore(3, 0).sides).toEqual([0, 0]);
  });

  it('en vivo: minuto con añadido, descanso y los 2 minutos de sala con la hora del servidor', () => {
    const s = play([{ type: 'clock', action: 'start', at: T0 }], FIELD);
    const live = liveFromScore(footballScore(s, T0 + 46 * MIN + 10_000, 5_000))!;
    expect(live).toMatchObject({ p: 1, pl: '1.er tiempo', b: 0, len: 45, clk: { r: true, ms: 46 * MIN + 10_000, t: T0 + 46 * MIN + 15_000 }, f: null });
    // Un espectador 30 s después (hora del servidor): 47 minutos jugados → «45+2'».
    expect(liveMinute(live, T0 + 46 * MIN + 45_000)).toBe("45+2'");
    expect(minuteText(45, 45, 0)).toBe("46'");
    const brk = play([{ type: 'clock', action: 'start', at: T0 }, { type: 'period_end', at: T0 + 45 * MIN }]);
    const liveBreak = liveFromScore(footballScore(brk, T0 + 50 * MIN))!;
    expect(liveBreak.pl).toBe('Descanso');
    expect(liveMinute(liveBreak, T0 + 50 * MIN)).toBeNull();
    expect(stageLabel(play([]))).toBe('Por empezar');
    // Sin reloj no hay «descanso» que esperar: el 2.º tiempo se puede cerrar.
    const noClock = footballConfig('football', { clock: 'none' });
    expect(stageLabel(play([], noClock))).toBe('1.er tiempo');
    expect(atBreak(play([{ type: 'period_end' }], noClock))).toBe(false);
    expect(stageLabel(play([{ type: 'period_end' }], noClock))).toBe('2.º tiempo');
    expect(liveFromScore(footballScore(play([], noClock), T0))?.clk).toBeNull();

    const fs = play(
      [
        { type: 'clock', action: 'start', at: T0 },
        { type: 'card', side: 2, player: 'b5', card: 'red', at: T0 + MIN },
        ...Array.from({ length: 5 }, (): FootballEvent => ({ type: 'foul', side: 1, at: T0 + MIN })),
      ],
      FUTSAL,
    );
    const fl = liveFromScore(footballScore(fs, T0 + 90_000))!;
    expect(fl.f).toEqual([5, 0]);
    expect(fl.r).toEqual([0, 1]);
    expect(fl.pp).toEqual([[2, 90_000]]);
    expect(livePowerPlays(fl, T0 + 120_000)).toEqual([{ side: 2, remainingMs: 60_000 }]);
    expect(livePowerPlays(fl, T0 + 200_000)).toEqual([]);
  });

  it('se publica en cada gol, roja, cambio de tiempo, penal y reloj; no por falta, amarilla o cambio', () => {
    const base = play([{ type: 'clock', action: 'start', at: T0 }]);
    const next = (ev: FootballEvent, s = base) => football.apply(s, ev);
    expect(isMilestone(base, next({ type: 'goal', side: 1, at: T0 + MIN }))).toBe(true);
    expect(isMilestone(base, next({ type: 'card', side: 1, player: 'x', card: 'red', at: T0 + MIN }))).toBe(true);
    expect(isMilestone(base, next({ type: 'period_end', at: T0 + MIN }))).toBe(true);
    expect(isMilestone(base, next({ type: 'clock', action: 'stop', at: T0 + MIN }))).toBe(true);
    expect(isMilestone(base, next({ type: 'card', side: 1, player: 'x', card: 'yellow', at: T0 + MIN }))).toBe(false);
    expect(isMilestone(base, next({ type: 'foul', side: 1, at: T0 + MIN }))).toBe(false);
    expect(isMilestone(base, next({ type: 'sub', side: 1, out: 'a', in: 'b', at: T0 + MIN }))).toBe(false);
    const adapter = footballAdapter({ now: () => T0 + MIN });
    expect(adapter.score(base).sides).toEqual([0, 0]);
    expect(adapter.winner!(next({ type: 'goal', side: 2, at: T0 }))).toBe(2);
  });

  it('textos para «Deshacer»', () => {
    const who = (s: 1 | 2, p?: string) => (p ? `#${p}` : s === 1 ? 'Tigres' : 'Leones');
    expect(eventLabel({ type: 'goal', side: 1, player: '9' }, who)).toBe('Gol #9');
    expect(eventLabel({ type: 'goal', side: 2 }, who)).toBe('Gol Leones');
    expect(eventLabel({ type: 'goal', side: 2, ownGoal: true, player: '4' }, who)).toBe('Autogol de #4 (a favor de Leones)');
    expect(eventLabel({ type: 'card', side: 1, player: '5', card: 'yellow' }, who)).toBe('Amarilla #5');
    expect(eventLabel({ type: 'sub', side: 1, out: '7', in: '12' }, who)).toBe('Cambio: sale #7, entra #12');
    expect(eventLabel({ type: 'shootout', side: 2, scored: false }, who)).toBe('Penal Leones: fallado');
  });
});

describe('solo resultado y acta corregida', () => {
  it('lee «2-1», «1-1 pen 4-3» y «1-1 (pen. 4-3)»; los errores en español', () => {
    const p = footballResultParser();
    expect(p('2-1')).toMatchObject({ score: { text: '2-1', sides: [2, 1], totals: { goals: [2, 1] } }, winner: 1 });
    expect(p('0 0')).toMatchObject({ winner: null, summary: 'Empate 0 a 0' });
    expect(p('1-1 pen 4-3')).toMatchObject({ score: { text: '1-1 (pen. 4-3)', pens: [4, 3], totals: { shootout: [4, 3] } }, winner: 1 });
    expect(p('1-1 (pen. 2-4)').winner).toBe(2);
    expect(() => p('2-1 pen 4-3')).toThrow('Los penales son solo si empataron.');
    expect(() => p('1-1 pen 3-3')).toThrow('no termina empatada');
    expect(() => p('100-1')).toThrow('de 0 a 99');
    expect(() => p('dos a uno')).toThrow('Escribe los goles');
  });

  it('corregir solo el resultado conserva el acta por jugador (tarjetas y presentes)', () => {
    const old = footballScore(
      play([
        { type: 'lineup', side: 1, players: ['a'] },
        { type: 'goal', side: 1, player: 'a' },
        { type: 'card', side: 2, player: 'b', card: 'red' },
      ]),
      T0,
    );
    const same = footballResultParser({ keep: old })('1-0');
    expect(same.score).toMatchObject({ lines: old.lines, tl: old.tl, totals: { red: [0, 1], goals: [1, 0] } });
    const changed = footballResultParser({ keep: old })('2-0');
    expect(changed.score.lines).toBe(old.lines);
    expect(changed.score.tl).toBeUndefined();
  });

  it('acta corregida: dos amarillas son roja, el portero recibe los del rival y los minutos que siguen ciertos se quedan', () => {
    const old = footballScore(
      play([
        { type: 'lineup', side: 1, players: ['a', 'gk'], goalkeeper: 'gk' },
        { type: 'clock', action: 'start', at: T0 },
        { type: 'goal', side: 1, player: 'a', at: T0 + 10 * MIN },
        { type: 'card', side: 1, player: 'a', card: 'yellow', at: T0 + 20 * MIN },
        { type: 'goal', side: 2, at: T0 + 30 * MIN },
      ]),
      T0,
    );
    const lines: ScoreLine[] = decodeLines(old.lines).map((l) => (l.playerId === 'a' ? { ...l, yellows: 2 } : l));
    lines.push({ playerId: 'b', side: 2, played: true, goals: 2, assists: 0, ownGoals: 0, yellows: 0, red: 'direct', keeper: false, conceded: 0 });
    const { score, winner } = correctedScore({ old, lines, sides: [1, 2], pens: [5, 4] });
    expect(winner).toBe(2);
    expect(score.pens).toBeUndefined();
    const back = decodeLines(score.lines);
    expect(back.find((l) => l.playerId === 'a')).toMatchObject({ yellows: 2, red: 'second_yellow' });
    expect(back.find((l) => l.playerId === 'gk')).toMatchObject({ keeper: true, conceded: 2 });
    expect(score.totals).toMatchObject({ goals: [1, 2], red: [1, 1], cardsSecondYellow: [1, 0], cardsRed: [0, 1] });
    // El gol de «a» (10') y su amarilla (20') siguen; el gol sin jugador de la visita también.
    expect(decodeTimeline(score.tl, back).map((e) => [e.kind, e.minute, e.player])).toEqual([
      ['goal', '11', 'a'],
      ['yellow', '21', 'a'],
      ['goal', '31', null],
    ]);
    const draw = correctedScore({ old: null, lines: [], sides: [1, 1], pens: [4, 3] });
    expect(draw).toMatchObject({ winner: 1, score: { text: '1-1 (pen. 4-3)', pens: [4, 3] } });
  });
});

describe('la temporada: tabla, goleadores, tarjetas, vallas y disciplina', () => {
  const g = (side: 1 | 2, player?: string): FootballEvent => ({ type: 'goal', side, ...(player ? { player } : {}) });
  const lineup = (a: string[], b: string[]): FootballEvent[] => [
    { type: 'lineup', side: 1, players: a, goalkeeper: a[0] },
    { type: 'lineup', side: 2, players: b, goalkeeper: b[0] },
  ];

  it('3-1-0, desempate por diferencia y la regla que decidió; W.O. 3-0; los penales no cuentan', () => {
    n = 0;
    const ms = [
      played('A', 'B', [...lineup(['a0', 'a9'], ['b0', 'b9']), g(1, 'a9'), g(1, 'a9')]),
      played('B', 'C', [g(1, 'b9')]),
      played('C', 'A', [g(1), g(2, 'a9')]),
      match({ home: 'A', away: 'C', status: 'walkover', walkoverSide: 2, score: walkoverScore(3, 2) }),
      match({ home: 'B', away: 'C', status: 'scheduled' }),
    ];
    const season = footballSeason({ matches: ms, teamIds: ['A', 'B', 'C'], rules: {}, now: T0 });
    expect(season.standings.map((r) => [r.id, r.points, r.played, r.for, r.against])).toEqual([
      ['A', 7, 3, 6, 1],
      ['B', 3, 2, 1, 2],
      ['C', 1, 3, 1, 5],
    ]);
    expect(season.scorers[0]).toMatchObject({ player: 'a9', goals: 3 });
    // Portero de A en el 1.er partido: valla invicta.
    expect(season.keepers.map((k) => [k.player, k.cleanSheets])).toEqual([
      ['a0', 1],
      ['b0', 0],
    ]);
    // Un partido del cuadro no suma en la tabla.
    const withCup = footballSeason({ matches: [...ms, played('B', 'C', [g(2)], { bracketKey: 'R1-1', stage: 'Final' })], teamIds: ['A', 'B', 'C'], rules: {}, now: T0 });
    expect(withCup.standings.find((r) => r.id === 'C')?.points).toBe(1);
  });

  it('empate de dos: decide el enfrentamiento directo si la liga lo pone primero', () => {
    n = 0;
    const ms = [played('A', 'B', [g(1)]), played('B', 'C', [g(1), g(1), g(1)]), played('C', 'A', [g(2), g(2), g(2)])];
    const def = footballSeason({ matches: ms, teamIds: ['A', 'B', 'C'], rules: {}, now: T0 });
    // A y B con 6 puntos... A: +1 +3 = +4; B: -1 +3 = +2 → A por diferencia.
    expect(def.standings.slice(0, 2).map((r) => [r.id, r.points, r.decidedBy])).toEqual([
      ['A', 6, undefined],
      ['B', 3, 'puntos'],
    ]);
    const tie = [played('A', 'B', [g(1)]), played('C', 'A', [g(1)]), played('B', 'C', [g(1)])];
    const h2h = footballSeason({ matches: tie, teamIds: ['A', 'B', 'C'], rules: { table: { tiebreak: ['h2h', 'diff', 'lot'], lotSeed: 'x' } }, now: T0 });
    // Los tres con 3 puntos y 0 de diferencia: el directo entre los tres no separa; decide el sorteo.
    expect(h2h.standings.every((r) => r.points === 3)).toBe(true);
    expect(h2h.standings[1].decidedBy).toBe('sorteo');
  });

  it('grupos del torneo relámpago: una tabla por grupo y cuándo un grupo terminó', () => {
    n = 0;
    const ms = [
      played('A', 'B', [g(1)], { stage: 'Grupo A' }),
      played('C', 'D', [g(2)], { stage: 'Grupo B' }),
      match({ home: 'E', away: 'F', stage: 'Grupo B' }),
    ];
    const season = footballSeason({ matches: ms, teamIds: ['A', 'B', 'C', 'D', 'E', 'F'], rules: {}, now: T0 });
    expect(season.groups.map((x) => [x.stage, x.rows.map((r) => r.id)])).toEqual([
      ['Grupo A', ['A', 'B']],
      // C perdió: queda debajo de los que no han jugado.
      ['Grupo B', ['D', 'E', 'F', 'C']],
    ]);
    expect(groupRanking(season, ms, 'Grupo A', T0)).toEqual(['A', 'B']);
    expect(groupRanking(season, ms, 'Grupo B', T0)).toBeNull();
  });

  it('tarjetas por jugador y juego limpio FIFA (amarilla −1, doble −3, roja −4, amarilla + roja −5)', () => {
    n = 0;
    const m1 = played('A', 'B', [
      { type: 'card', side: 1, player: 'x', card: 'yellow' },
      { type: 'card', side: 1, player: 'x', card: 'yellow' },
      { type: 'card', side: 2, player: 'y', card: 'yellow' },
      { type: 'card', side: 2, player: 'y', card: 'red' },
      { type: 'card', side: 2, player: 'z', card: 'red' },
    ]);
    const season = footballSeason({ matches: [m1], teamIds: ['A', 'B'], rules: {}, now: T0 });
    expect(cardTable(season.lines).map((c) => [c.player, c.yellows, c.secondYellows, c.reds, c.fairPlay])).toEqual([
      ['y', 1, 0, 1, -5],
      ['z', 0, 0, 1, -4],
      ['x', 2, 1, 0, -3],
    ]);
    expect(season.standings.find((r) => r.id === 'B')?.extra.fairPlay).toBe(-9);
  });

  it('disciplina: la roja se cumple en el siguiente partido que el equipo juega de verdad (no el aplazado)', () => {
    n = 0;
    const m1 = played('A', 'B', [{ type: 'card', side: 1, player: 'p1', card: 'red' }]);
    const m2 = match({ home: 'A', away: 'C', status: 'postponed' });
    const m3 = match({ home: 'C', away: 'B' }); // A descansa esta jornada
    const m4 = match({ home: 'B', away: 'A' });
    const ms = [m1, m2, m3, m4];
    const dm = toDisciplineMatches(ms);
    expect(dm.map((d) => d.status)).toEqual(['played', 'postponed', 'scheduled', 'scheduled']);
    const cfg = disciplineFrom({});
    // El aplazado no cuenta como cumplido: si se juega después, también le toca (y el de la jornada siguiente).
    expect(suspendedIn(dm, m2.id, cfg, [])).toEqual([{ player: 'p1', team: 'A', reason: 'roja', fromMatchId: m1.id, remaining: 1 }]);
    expect(suspendedIn(dm, m4.id, cfg, [])).toEqual([{ player: 'p1', team: 'A', reason: 'roja', fromMatchId: m1.id, remaining: 1 }]);
    const next = suspendedForNext(dm, cfg, []);
    expect(next).toEqual([{ player: 'p1', team: 'A', reason: 'roja', fromMatchId: m1.id, remaining: 1, matchId: m4.id }]);
    // Después de jugarlo (sin él), ya cumplió.
    const m4done = { ...m4, status: 'confirmed' as const, score: footballScore(play([{ type: 'goal', side: 1 }]), T0), winner: 1 as const };
    const after = footballSeason({ matches: [m1, m2, m3, m4done], teamIds: ['A', 'B', 'C'], rules: {}, now: T0 });
    expect(after.suspendedNext).toEqual([]);
    expect(after.discipline.sanctions[0]).toMatchObject({ served: [m4.id], remaining: 0 });
  });

  it('disciplina: la roja de un partido sin fecha (armado sin horario) se cumple en el siguiente partido del equipo', () => {
    n = 0;
    const day = (d: number) => new Date(T0 + d * 86_400_000).toISOString();
    // Jornada 1 sin horario: el resultado se anotó el día 3. Jornada 2 programada el día 10.
    const m1 = played('A', 'B', [{ type: 'card', side: 1, player: 'x', card: 'red' }], { scheduledAt: null, proposedAt: day(3), confirmedAt: day(4) });
    const m2 = match({ home: 'A', away: 'C', scheduledAt: day(10) });
    const season = footballSeason({ matches: [m1, m2], teamIds: ['A', 'B', 'C'], rules: {}, now: T0 });
    expect(season.discipline.sanctions).toEqual([{ player: 'x', team: 'A', reason: 'roja', matchId: m1.id, matches: 1, served: [], remaining: 1 }]);
    expect(season.suspendedNext).toEqual([{ player: 'x', team: 'A', reason: 'roja', fromMatchId: m1.id, remaining: 1, matchId: m2.id }]);
    // Resultado cargado por el admin (solo confirmado, sin propuesta): cuenta la hora de la confirmación.
    const m1admin = { ...m1, proposedAt: null, confirmedAt: day(4) };
    expect(footballSeason({ matches: [m1admin, m2], teamIds: ['A', 'B', 'C'], rules: {}, now: T0 }).suspendedNext.map((s) => s.matchId)).toEqual([m2.id]);
    // Se cumple jugando el de la jornada 2, sin él.
    const m2done = { ...m2, status: 'confirmed' as const, score: footballScore(play([{ type: 'goal', side: 2 }]), T0), winner: 2 as const };
    const after = footballSeason({ matches: [m1, m2done], teamIds: ['A', 'B', 'C'], rules: {}, now: T0 });
    expect(after.discipline.sanctions[0]).toMatchObject({ served: [m2.id], remaining: 0 });
    expect(after.suspendedNext).toEqual([]);
  });

  it('3 amarillas = 1 partido; si juega suspendido sale como alineación indebida; el comité suma partidos', () => {
    n = 0;
    const y = (p: string): FootballEvent => ({ type: 'card', side: 1, player: p, card: 'yellow' });
    const a1 = played('A', 'B', [y('p')]);
    const a2 = played('A', 'C', [y('p')]);
    const a3 = played('A', 'B', [y('p')]);
    const a4 = played('A', 'C', [{ type: 'lineup', side: 1, players: ['p'] }]); // jugó estando suspendido
    const a5 = match({ home: 'A', away: 'B' });
    const season = footballSeason({ matches: [a1, a2, a3, a4, a5], teamIds: ['A', 'B', 'C'], rules: {}, now: T0 });
    expect(season.discipline.sanctions).toEqual([{ player: 'p', team: 'A', reason: 'amarillas', matchId: a3.id, matches: 1, served: [a4.id], remaining: 0 }]);
    expect(season.discipline.violations).toEqual([{ matchId: a4.id, team: 'A', player: 'p' }]);
    expect(season.discipline.yellows).toEqual([{ player: 'p', team: 'A', total: 3, pending: 0 }]);
    // Con 5 amarillas por suspensión, todavía no.
    expect(footballSeason({ matches: [a1, a2, a3, a5], teamIds: ['A', 'B', 'C'], rules: { discipline: { yellowsForSuspension: 5 } }, now: T0 }).suspendedNext).toEqual([]);
    // El comité: 2 partidos más desde el partido 4.
    const com = footballSeason({
      matches: [a1, a2, a3, a4, a5],
      teamIds: ['A', 'B', 'C'],
      rules: {},
      sanctions: [{ id: 's1', leagueId: 'L', teamId: 'A', playerId: 'q', matchId: a4.id, matches: 2, note: 'Agresión', createdBy: null, at: null }],
      now: T0,
    });
    expect(com.suspendedNext).toEqual([{ player: 'q', team: 'A', reason: 'comite', fromMatchId: a4.id, remaining: 2, matchId: a5.id }]);
  });

  it('orden y estado de cada partido para la disciplina', () => {
    expect(disciplineStatus({ status: 'suspended' })).toBe('postponed');
    expect(disciplineStatus({ status: 'void' })).toBe('cancelled');
    expect(disciplineStatus({ status: 'disputed' })).toBe('played');
    expect(disciplineStatus({ status: 'live' })).toBe('scheduled');
    expect(disciplineOrder({ scheduledAt: null, round: 3 }) > disciplineOrder({ scheduledAt: '2030-01-01T00:00:00Z', round: 9 })).toBe(true);
    expect(disciplineOrder({ scheduledAt: null, round: 3 }) < disciplineOrder({ scheduledAt: null, round: 10 })).toBe(true);
    // Sin fecha pero con resultado: cuando se anotó (propuesto, si no confirmado), antes que lo programado después.
    const played = { scheduledAt: null, round: 9, proposedAt: '2029-12-01T10:00:00Z', confirmedAt: '2029-12-02T10:00:00Z' };
    expect(disciplineOrder(played)).toBe('2029-12-01T10:00:00.000Z#009');
    expect(disciplineOrder({ ...played, proposedAt: null })).toBe('2029-12-02T10:00:00.000Z#009');
    expect(disciplineOrder(played) < disciplineOrder({ scheduledAt: '2030-01-01T00:00:00Z', round: 1 })).toBe(true);
    // La fecha programada manda aunque haya resultado.
    expect(disciplineOrder({ ...played, scheduledAt: '2030-02-01T00:00:00Z' })).toBe('2030-02-01T00:00:00.000Z#009');
  });

  it('matchResultOf: W.O. doble no cuenta; los penales van como shootout', () => {
    expect(matchResultOf(match({ home: 'A', away: 'B', status: 'walkover', walkoverSide: 0 }))).toBeNull();
    expect(matchResultOf(match({ home: 'A', away: 'B', status: 'confirmed', score: { text: '1-1', sides: [1, 1], pens: [4, 2] }, winner: 1 }))?.totals).toEqual({
      goals: [1, 1],
      shootout: [4, 2],
    });
  });
});

describe('Excel', () => {
  it('calendario, tabla, goleadores, tarjetas y disciplina', () => {
    n = 0;
    const m1 = played('A', 'B', [{ type: 'lineup', side: 1, players: ['p'] }, { type: 'goal', side: 1, player: 'p' }, { type: 'card', side: 2, player: 'q', card: 'red' }]);
    const m2 = match({ home: 'B', away: 'A' });
    const season = footballSeason({ matches: [m1, m2], teamIds: ['A', 'B'], rules: {}, now: T0 });
    const sheets = footballSheets({ leagueName: 'Liga', matches: [m1, m2], season, teamName: (id) => `Equipo ${id}`, playerName: (id) => `Jugador ${id}`, tz: 'America/Santo_Domingo', now: T0 });
    expect(sheets.map((s) => s.sheet)).toEqual(['Calendario', 'Tabla', 'Goleadores', 'Tarjetas', 'Disciplina']);
    const cell = (sheet: number, row: number, col: number) => (sheets[sheet].data[row] as { value?: unknown }[])[col]?.value;
    expect(cell(0, 1, 4)).toBe('Equipo A');
    expect(cell(0, 1, 5)).toBe(1);
    expect(cell(1, 1, 2)).toBe('Equipo A');
    expect(cell(1, 1, 10)).toBe(3);
    expect(cell(2, 1, 1)).toBe('Jugador p');
    expect(cell(3, 1, 4)).toBe(1);
    expect(cell(4, 1, 0)).toBe('Jugador q');
    expect(cell(4, 1, 2)).toBe('roja directa');
    expect(stateLines(play([])).length).toBe(0);
  });
});
