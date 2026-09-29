/**
 * Evaluadores de equipos (baloncesto, fútbol y sala; docs/insignias.md §2.4–§2.6): hitos y rachas de carrera
 * (`team_career`), la remontada de un partido (`team_match`), puntos y triples (`basketball_career`,
 * `basketball_match`), goles, asistencias y vallas (`football_career`, `football_match`) y el podio de un torneo
 * relámpago (`event_podium`, la parte de equipos). Apariciones, T1, T2 y TS en rules/team.ts; las líneas y la
 * cronología se leen con los adaptadores de cada deporte.
 */
import { badgeDef, badgesOfEvaluator, paramOf, thresholdOf, type VariantArg } from '../catalog';
import { CAPS, capPerRivalMonth, podiumLevels, topWithTies } from '../rules/gates';
import { monthOf, periodKey } from '../rules/periods';
import {
  appearances,
  basketballLinesOf,
  basketballStatLine,
  coherentBasketballLine,
  footballStatLine,
  hasLines,
  isT1,
  rosterFallback,
  t2Reason,
  teamOutcome,
  wonShootout,
  type TeamContext,
} from '../rules/team';
import { sideKey, type Match } from '../../lib/data/matchCore';
import { periodsFromScore as basketballPeriods } from '../../pages/sports/basketball/adapter';
import { decodeLines as decodeFootballLines, decodeTimeline, periodsFromScore as footballPeriods, pensFromScore } from '../../pages/sports/football/adapter';
import { basketballConfig } from '../../sports/team/basketball';
import { footballConfig } from '../../sports/team/football';
import { other } from '../../sports/racket';
import type { Side } from '../../sports/types';
import type { BadgeDecision, BadgeDef, BadgeHolder, BadgeJob } from '../types';
import type { BadgeSnapshot } from '../snapshot';
import {
  accountTargets,
  awardOf,
  eventCtx,
  isTeamSport,
  kitOf,
  leagueCtx,
  levelAwards,
  matchDay,
  payloadPlayers,
  periodHolders,
  playerHolderOf,
  progressOf,
  realOn,
  refId,
  revokeStale,
  rulesPart,
  statusFor,
  teamCtx,
  TEAM_SPORTS,
  V3X3,
  type AccountTarget,
  type Evaluator,
  type Kit,
  type Step,
  type TeamSportId,
} from './kit';
import { jobPlayers } from './racket';

const def = (key: string): BadgeDef => badgeDef(key)!;
const ref = (m: Pick<Match, 'id'>) => `match:${m.id}`;

/** Contexto T2 de un partido (staff de su liga). */
export const teamMatchCtx = (kit: Kit, m: Match): TeamContext => ({ now: kit.now, userOf: kit.userOf, teamPlayers: kit.snap.team_players ?? [], staff: kit.staff(m.leagueId) });

/** Reglas del partido (la copia de la liga) o, si no trae, las de la liga. */
const matchRulesOf = (kit: Kit, m: Match): unknown => (m.rules && Object.keys(m.rules).length ? m.rules : kit.leagues.get(m.leagueId)?.rules);

/** Baloncesto 3x3 (cambia umbrales y apaga los triples). */
export const is3x3 = (kit: Kit, m: Match): boolean => rulesPart(matchRulesOf(kit, m), 'match').variant === '3x3';

/** Variante de una fila de baloncesto para un partido. */
const variantOf = (kit: Kit, m: Match, sport: TeamSportId): VariantArg => (sport === 'basketball' && is3x3(kit, m) ? V3X3 : sport);

/** Un partido en el que apareció un jugador del dueño. */
export interface Appeared {
  m: Match;
  p: string;
  side: Side;
  date: string;
  ctx: TeamContext;
}

/** Partidos T1 en ligas reales ese mes en los que apareció (alineación o acta), en orden. Nunca la plantilla. */
export function appearedIn(kit: Kit, t: Pick<AccountTarget, 'players' | 'user'>, sport: TeamSportId): Appeared[] {
  const out: Appeared[] = [];
  for (const m of kit.matches) {
    if (kit.sportOf(m.leagueId) !== sport || !isT1(m, kit.now)) continue;
    const date = matchDay(kit, m);
    if (!date || !realOn(kit, m.leagueId, date, t)) continue;
    const seen = appearances(m, sport);
    for (const p of t.players) {
      const side = seen.get(p);
      if (side) {
        out.push({ m, p, side, date, ctx: teamMatchCtx(kit, m) });
        break;
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.m.scheduledAt ?? '').localeCompare(b.m.scheduledAt ?? '') || (a.m.id < b.m.id ? -1 : 1));
}

/** T2 para su lado (del jugador verificado solo, lo que confirmó el otro equipo). */
export const countsT2 = (kit: Kit, x: Pick<Appeared, 'm' | 'p' | 'side' | 'ctx'>): boolean => {
  const r = t2Reason(x.m, x.side, x.ctx);
  return r !== null && (!kit.verifiedOnly(x.p) || r === 'rival');
};

/** Los dueños de cuenta de un trabajo de resultado, por deporte de equipo. */
function teamTargets(kit: Kit, sports: readonly TeamSportId[] = TEAM_SPORTS): { sport: TeamSportId; t: AccountTarget }[] {
  const out: { sport: TeamSportId; t: AccountTarget }[] = [];
  const players = jobPlayers(kit);
  for (const sport of sports) {
    const mine = players.filter((p) => {
      const pl = kit.players.get(p);
      return !!pl && kit.sportOf(pl.league_id) === sport;
    });
    for (const t of accountTargets(kit, mine, [sport])) out.push({ sport, t });
  }
  return out;
}

type AddOpts = Parameters<typeof levelAwards>[6];

function careerAdder(kit: Kit, holder: BadgeHolder, sport: TeamSportId, out: BadgeDecision[]) {
  return (key: string, steps: Step[], value: number, opts: AddOpts = {}, variant: VariantArg = sport) => {
    const d = def(key);
    out.push(...levelAwards(kit, d, holder, sport, variant, steps, opts), progressOf(d, holder, sport, variant, value));
  };
}

const counter = (xs: readonly Appeared[]): Step[] => xs.map((x, i) => ({ n: i + 1, ref: ref(x.m), date: x.date }));

// ---------------------------------------------------------------------------------------------------------
// Carrera compartida: partidos, victorias e invicto

export function teamCareerFor(kit: Kit, t: AccountTarget, sport: TeamSportId): BadgeDecision[] {
  const out: BadgeDecision[] = [];
  const add = careerAdder(kit, t.holder, sport, out);
  const list = appearedIn(kit, t, sport).filter((x) => !kit.verifiedOnly(x.p) || countsT2(kit, x));
  add('team_matches', counter(list), list.length);

  const wins = list.filter((x) => countsT2(kit, x) && teamOutcome(x.m, x.side) === 'G');
  const capped = capPerRivalMonth(
    wins,
    (x) => sideKey(x.m.sides[other(x.side) - 1]),
    (x) => monthOf(x.date),
    paramOf(def('team_wins'), 'maxPerTeamMonth', sport) ?? CAPS.teamWinsPerTeamMonth,
  );
  add('team_wins', counter(capped), capped.length);

  // Invicto: T2 seguidos ganados o empatados (baloncesto: solo ganados); una derrota corta; lo demás se salta.
  const steps: Step[] = [];
  let run = 0;
  let best = 0;
  for (const x of list) {
    const r = teamOutcome(x.m, x.side);
    if (r === 'P') {
      run = 0;
      continue;
    }
    if (!countsT2(kit, x) || (sport === 'basketball' && r !== 'G') || r === null) continue;
    run++;
    best = Math.max(best, run);
    steps.push({ n: run, ref: ref(x.m), date: x.date });
  }
  add('team_unbeaten', steps, best, { actual: true });

  out.push(...revokeStale(kit, out, { holders: [t.holder], keys: badgesOfEvaluator('team_career').map((d) => d.key), sport, period: (k) => k === '-' }));
  return out;
}

export const teamCareer: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  return teamTargets(kit).flatMap(({ sport, t }) => teamCareerFor(kit, t, sport));
};

// ---------------------------------------------------------------------------------------------------------
// Baloncesto: carrera

/** Líneas TS de un dueño: partido T2 para su lado, con líneas, y la suya coherente. */
function basketballTS(kit: Kit, t: AccountTarget) {
  return appearedIn(kit, t, 'basketball')
    .filter((x) => countsT2(kit, x))
    .map((x) => ({ ...x, line: basketballStatLine(x.m, x.p) }))
    .filter((x): x is Appeared & { line: NonNullable<ReturnType<typeof basketballStatLine>> } => !!x.line);
}

export function basketballCareerFor(kit: Kit, t: AccountTarget): BadgeDecision[] {
  const out: BadgeDecision[] = [];
  const add = careerAdder(kit, t.holder, 'basketball', out);
  const ts = basketballTS(kit, t);
  let pts = 0;
  const cumPts: Step[] = [];
  for (const x of ts) {
    pts += x.line.points;
    if (x.line.points > 0) cumPts.push({ n: pts, ref: ref(x.m), date: x.date });
  }
  add('basketball_first_basket', cumPts, pts);
  add('basketball_points', cumPts, pts);

  // Noche de anotación: puntos de un partido, con los umbrales de su variante (3x3 aparte).
  const byGame: Step[] = ts.map((x) => ({ n: x.line.points, ref: ref(x.m), date: x.date, values: { v3x3: is3x3(kit, x.m) } }));
  const last3x3 = ts.length ? is3x3(kit, ts[ts.length - 1].m) : false;
  const bestGame = Math.max(0, ...ts.map((x) => x.line.points));
  add('basketball_points_game', byGame, bestGame, { actual: true, variantOf: (s) => (s.values?.v3x3 ? V3X3 : 'basketball') }, last3x3 ? V3X3 : 'basketball');

  // Triples: solo 5x5.
  const five = ts.filter((x) => !is3x3(kit, x.m));
  let threes = 0;
  const cumThrees: Step[] = [];
  for (const x of five) {
    threes += x.line.threes;
    if (x.line.threes > 0) cumThrees.push({ n: threes, ref: ref(x.m), date: x.date });
  }
  add('basketball_threes', cumThrees, threes);
  add(
    'basketball_threes_game',
    five.map((x) => ({ n: x.line.threes, ref: ref(x.m), date: x.date })),
    Math.max(0, ...five.map((x) => x.line.threes)),
    { actual: true },
  );
  out.push(...revokeStale(kit, out, { holders: [t.holder], keys: badgesOfEvaluator('basketball_career').map((d) => d.key), sport: 'basketball', period: (k) => k === '-' }));
  return out;
}

export const basketballCareer: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  return teamTargets(kit, ['basketball']).flatMap(({ t }) => basketballCareerFor(kit, t));
};

// ---------------------------------------------------------------------------------------------------------
// Fútbol y sala: carrera

export function footballCareerFor(kit: Kit, t: AccountTarget, sport: 'football' | 'futsal'): BadgeDecision[] {
  const out: BadgeDecision[] = [];
  const add = careerAdder(kit, t.holder, sport, out);
  const ts = appearedIn(kit, t, sport)
    .filter((x) => countsT2(kit, x))
    .map((x) => ({ ...x, line: footballStatLine(x.m, x.p) }))
    .filter((x): x is Appeared & { line: NonNullable<ReturnType<typeof footballStatLine>> } => !!x.line);
  const cumulative = (pick: (x: (typeof ts)[number]) => number): { steps: Step[]; total: number } => {
    let total = 0;
    const steps: Step[] = [];
    for (const x of ts) {
      const v = pick(x);
      total += v;
      if (v > 0) steps.push({ n: total, ref: ref(x.m), date: x.date });
    }
    return { steps, total };
  };
  const goals = cumulative((x) => x.line.goals);
  add('football_first_goal', goals.steps, goals.total);
  add('football_goals', goals.steps, goals.total);
  const assists = cumulative((x) => x.line.assists);
  add('football_assists', assists.steps, assists.total);
  // Valla invicta: de portero, y el rival no marcó.
  const sheets = cumulative((x) => {
    const s = x.m.score?.sides;
    return x.line.keeper && Array.isArray(s) && s[2 - x.side] === 0 ? 1 : 0;
  });
  add('football_clean_sheet', sheets.steps, sheets.total);
  // Noche goleadora: goles de un partido; si hay cronología, sus goles tienen que cuadrar con la línea.
  const inMatch = ts.filter((x) => goalsMatchTimeline(x.m, x.p, x.line.goals));
  add(
    'football_goals_in_match',
    inMatch.map((x) => ({ n: x.line.goals, ref: ref(x.m), date: x.date })),
    Math.max(0, ...inMatch.map((x) => x.line.goals)),
    { actual: true },
  );
  out.push(...revokeStale(kit, out, { holders: [t.holder], keys: badgesOfEvaluator('football_career').map((d) => d.key), sport, period: (k) => k === '-' }));
  return out;
}

/** Si el partido trae cronología (`score.tl`), los goles del jugador en ella tienen que ser los de su línea. */
function goalsMatchTimeline(m: Match, p: string, goals: number): boolean {
  if (typeof m.score?.tl !== 'string' || !m.score.tl) return true;
  const tl = decodeTimeline(m.score.tl, decodeFootballLines(m.score?.lines));
  return tl.filter((e) => e.kind === 'goal' && e.player === p).length === goals;
}

export const footballCareer: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  return teamTargets(kit, ['football', 'futsal']).flatMap(({ sport, t }) => footballCareerFor(kit, t, sport as 'football' | 'futsal'));
};

// ---------------------------------------------------------------------------------------------------------
// Marcas de un partido (remontada, baloncesto y fútbol)

/** Partidos del trabajo: el del ref, o en el historial todos los de la liga. */
function jobMatches(kit: Kit, job: BadgeJob): { list: Match[]; mid: string | null } {
  const mid = refId(job.ref, 'match');
  const list = mid ? kit.matches.filter((m) => m.id === mid) : job.kind === 'historial' && job.league_id ? kit.matches.filter((m) => m.leagueId === job.league_id) : [];
  return { list, mid };
}

/** Minuto de la cronología ('88', '90+3') como número. */
export function minuteOf(text: string | null): number | null {
  if (!text) return null;
  const m = /^(\d+)(?:\+(\d+))?$/.exec(text);
  return m ? Number(m[1]) + Number(m[2] ?? 0) : null;
}

/** ¿Su lado iba abajo y lo ganó? (§2.4 `team_comeback`). */
function cameBack(kit: Kit, m: Match, side: Side, sport: TeamSportId): boolean {
  const d = def('team_comeback');
  const deficit = paramOf(d, 'deficit', sport) ?? 2;
  if (sport === 'basketball') {
    if (is3x3(kit, m)) return false;
    const n = Number(rulesPart(matchRulesOf(kit, m), 'match').periods) || basketballConfig('fiba').periods;
    const half = basketballPeriods(m.score).slice(0, Math.floor(n / 2));
    if (half.length < Math.floor(n / 2) || !half.length) return false;
    const [a, b] = half.reduce<[number, number]>((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    const mine = side === 1 ? a - b : b - a;
    return mine <= -deficit;
  }
  const first = footballPeriods(m.score)[0];
  if (first && first[side - 1] < first[2 - side]) return true;
  const tl = typeof m.score?.tl === 'string' ? decodeTimeline(m.score.tl, decodeFootballLines(m.score?.lines)) : [];
  let diff = 0;
  for (const e of tl) {
    if (e.kind !== 'goal' && e.kind !== 'own_goal') continue;
    diff += e.side === side ? 1 : -1;
    if (diff <= -deficit) return true;
  }
  return false;
}

/**
 * El gol del triunfo: en la cronología, el gol del jugador después del cual su lado se puso arriba y ya no perdió la
 * ventaja, en el último 10 % del tiempo reglamentario o en la prórroga (§2.6 `football_late_winner`).
 */
function lateWinner(kit: Kit, m: Match, p: string, side: Side, sport: 'football' | 'futsal'): number | null {
  const cfgDefault = footballConfig(sport === 'futsal' ? 'futsal' : 'football');
  const match = rulesPart(matchRulesOf(kit, m), 'match');
  const clock = match.clock === 'running' || match.clock === 'stopped' || match.clock === 'none' ? match.clock : cfgDefault.clock;
  const half = typeof match.halfMinutes === 'number' && match.halfMinutes > 0 ? match.halfMinutes : cfgDefault.halfMinutes;
  if (clock === 'none' || typeof m.score?.tl !== 'string') return null;
  const tl = decodeTimeline(m.score.tl, decodeFootballLines(m.score?.lines)).filter((e) => e.kind === 'goal' || e.kind === 'own_goal');
  const score: [number, number] = [0, 0];
  let lead: (typeof tl)[number] | null = null;
  for (const e of tl) {
    const before = score[side - 1] - score[2 - side];
    score[e.side - 1]++;
    const after = score[side - 1] - score[2 - side];
    if (before <= 0 && after > 0) lead = e;
    if (after <= 0) lead = null;
  }
  const sides = m.score?.sides;
  if (!lead || !Array.isArray(sides) || sides[0] !== score[0] || sides[1] !== score[1]) return null;
  if (lead.kind !== 'goal' || lead.side !== side || lead.player !== p) return null;
  const minute = minuteOf(lead.minute);
  const share = paramOf(def('football_late_winner'), 'lateShare', sport) ?? 0.9;
  if (minute === null || minute < share * 2 * half) return null;
  return minute;
}

/** Líneas de baloncesto que se pueden leer enteras (sin cortar por tamaño). */
const fullLines = (m: Match, max: number) => typeof m.score?.lines === 'string' && m.score.lines.length < max;

export const teamMatch: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const { list, mid } = jobMatches(kit, job);
  return matchFamily(kit, job, list, mid, 'team_match');
};

/** Evalúa las marcas de partido de una familia (`team_match`, `basketball_match`, `football_match`). */
function matchFamily(kit: Kit, job: BadgeJob, list: readonly Match[], mid: string | null, family: 'team_match' | 'basketball_match' | 'football_match'): BadgeDecision[] {
  const keys = badgesOfEvaluator(family).map((d) => d.key);
  const out: BadgeDecision[] = [];
  for (const m of list) {
    const sport = kit.sportOf(m.leagueId);
    if (!isTeamSport(sport)) continue;
    if (family === 'basketball_match' && sport !== 'basketball') continue;
    if (family === 'football_match' && sport === 'basketball') continue;
    const date = matchDay(kit, m);
    const seen = appearances(m, sport);
    const holders = [...seen.keys()].map((p) => playerHolderOf(p, m.leagueId));
    const given: BadgeDecision[] = [];
    const ok = !!date && isT1(m, kit.now) && realOn(kit, m.leagueId, date);
    const ctx = teamMatchCtx(kit, m);
    const give = (key: string, p: string, values?: Record<string, number>) =>
      given.push(
        awardOf(def(key), playerHolderOf(p, m.leagueId), sport, 0, periodKey.match(m.id), statusFor(kit, date), [ref(m)], {
          ...leagueCtx(kit, m.leagueId),
          ...eventCtx(kit, m.eventId),
          ...teamCtx(kit, m.sides[(seen.get(p) ?? 1) - 1].teamId),
          ...(values ? { values } : {}),
        }),
      );
    if (ok) {
      const t2 = new Set<Side>(([1, 2] as const).filter((s) => t2Reason(m, s, ctx) !== null));
      if (family === 'team_match') {
        for (const [p, side] of seen) {
          if (t2.has(side) && teamOutcome(m, side) === 'G' && cameBack(kit, m, side, sport)) give('team_comeback', p);
        }
      } else if (family === 'basketball_match') {
        const v = variantOf(kit, m, sport);
        const lines = hasLines(m) ? basketballLinesOf(m).filter(coherentBasketballLine) : [];
        const totalFouls = basketballLinesOf(m).reduce((n, l) => n + l.fouls, 0);
        const d3 = def('basketball_triple_threat');
        const dClean = def('basketball_clean_hands');
        for (const l of lines) {
          if (!t2.has(l.side) || !seen.has(l.playerId)) continue;
          if (!is3x3(kit, m) && l.ones >= 1 && l.twos >= 1 && l.threes >= 1 && l.points >= (thresholdOf(d3, 0, v) ?? 15)) give('basketball_triple_threat', l.playerId, { n: l.points });
          if (l.fouls === 0 && l.points >= (thresholdOf(dClean, 0, v) ?? 12) && totalFouls >= (paramOf(dClean, 'minMatchFouls', v) ?? 4)) give('basketball_clean_hands', l.playerId, { n: l.points });
        }
        const dLead = def('basketball_game_leader');
        if (lines.length && fullLines(m, paramOf(dLead, 'maxLinesChars', v) ?? 2800)) {
          const { winners } = topWithTies(lines, (a, b) => b.points - a.points);
          for (const l of winners) {
            if (l.points >= (thresholdOf(dLead, 0, v) ?? 10) && t2.has(l.side)) give('basketball_game_leader', l.playerId, { n: l.points });
          }
        }
      } else if (sport === 'football' || sport === 'futsal') {
        for (const [p, side] of seen) {
          if (!t2.has(side)) continue;
          const line = footballStatLine(m, p);
          if (line && wonShootout(m, side)) give('football_shootout_win', p, pensFromScore(m.score) ? { pens: pensFromScore(m.score)![side - 1] } : undefined);
          const pens = pensFromScore(m.score);
          if (teamOutcome(m, side) === 'G' && !pens) {
            const minute = lateWinner(kit, m, p, side, sport);
            if (minute !== null) give('football_late_winner', p, { minuto: minute });
          }
        }
      }
    }
    out.push(...given, ...revokeStale(kit, given, { holders: [...holders, ...periodHolders(kit, periodKey.match(m.id))], keys, sport, period: (k) => k === periodKey.match(m.id) }));
  }
  if (mid && !list.length && job.league_id) {
    const holders = [...payloadPlayers(job).map((p) => playerHolderOf(p, job.league_id!)), ...periodHolders(kit, periodKey.match(mid))];
    out.push(...revokeStale(kit, [], { holders, keys, period: (k) => k === periodKey.match(mid) }));
  }
  return out;
}

export const basketballMatch: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const { list, mid } = jobMatches(kit, job);
  return matchFamily(kit, job, list, mid, 'basketball_match');
};

export const footballMatch: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const { list, mid } = jobMatches(kit, job);
  return matchFamily(kit, job, list, mid, 'football_match');
};

// ---------------------------------------------------------------------------------------------------------
// Podio de un torneo relámpago (`event_podium` de equipos; también el título de un torneo suelto)

export interface TeamPodiumPlace {
  level: 1 | 2 | 3;
  teamId: string;
  match: Match;
}

/** Ganador de un partido del cuadro: por marcador, o por penales si empataron. */
export function knockoutWinner(m: Match): Side | null {
  const s = m.score?.sides;
  if (Array.isArray(s) && s[0] !== s[1]) return s[0] > s[1] ? 1 : 2;
  if (wonShootout(m, 1)) return 1;
  if (wonShootout(m, 2)) return 2;
  return m.winner;
}

/**
 * Oro y plata de la final `R<n>-1` (los penales desempatan) y bronce del `P3`, entre los partidos del cuadro de un
 * torneo. La final (y el 3.er lugar) tienen que ser T2 para el lado que recibe. El tamaño del podio sale de los
 * equipos inscritos (§1.7.8).
 */
export function teamKnockoutPodium(kit: Kit, ms: readonly Match[], teamCount: number): TeamPodiumPlace[] {
  const levels = podiumLevels(teamCount);
  const keyed = ms.filter((m) => m.bracketKey && m.status !== 'void');
  const rounds = Math.max(0, ...keyed.map((m) => Number(/^R(\d+)-\d+$/.exec(m.bracketKey!)?.[1] ?? 0)));
  const final = keyed.find((m) => m.bracketKey === `R${rounds}-1`);
  const out: TeamPodiumPlace[] = [];
  const valid = (m: Match, side: Side) => isT1(m, kit.now) && t2Reason(m, side, teamMatchCtx(kit, m)) !== null;
  if (final && rounds > 0) {
    const w = knockoutWinner(final);
    if (w) {
      const [wt, lt] = [final.sides[w - 1].teamId, final.sides[2 - w].teamId];
      if (levels.includes(3) && wt && valid(final, w)) out.push({ level: 3, teamId: wt, match: final });
      if (levels.includes(2) && lt && valid(final, other(w))) out.push({ level: 2, teamId: lt, match: final });
    }
  }
  const p3 = keyed.find((m) => m.bracketKey === 'P3');
  if (p3 && levels.includes(1)) {
    const w = knockoutWinner(p3);
    const wt = w ? p3.sides[w - 1].teamId : null;
    if (w && wt && valid(p3, w)) out.push({ level: 1, teamId: wt, match: p3 });
  }
  return out;
}

/**
 * Quiénes de un equipo reciben un premio del torneo: los que aparecieron en al menos un partido; si el torneo no
 * tiene ningún dato de alineación, la plantilla que ya estaba el día del torneo (evidencia «según plantilla»).
 */
export function tournamentPlayers(kit: Kit, ms: readonly Match[], teamId: string, sport: TeamSportId, share = 0): { players: string[]; byRoster: boolean; played: Map<string, number>; total: number } {
  const mine = ms.filter((m) => isT1(m, kit.now) && m.sides.some((s) => s.teamId === teamId));
  const played = new Map<string, number>();
  let anyLineup = false;
  for (const m of mine) {
    const side = m.sides[0].teamId === teamId ? 1 : 2;
    const seen = appearances(m, sport);
    if (seen.size) anyLineup = true;
    for (const [p, s] of seen) if (s === side) played.set(p, (played.get(p) ?? 0) + 1);
  }
  if (anyLineup) {
    const need = Math.max(1, Math.ceil(share * mine.length - 1e-9));
    return { players: [...played].filter(([, n]) => n >= need).map(([p]) => p), byRoster: false, played, total: mine.length };
  }
  const last = [...mine].sort((a, b) => (matchDay(kit, a) ?? '').localeCompare(matchDay(kit, b) ?? '')).pop();
  const date = last ? matchDay(kit, last) : null;
  if (!last || !date) return { players: [], byRoster: true, played, total: mine.length };
  const roster = rosterFallback(last, kit.snap.team_players ?? [], date, kit.tzOf(last.leagueId));
  const side = last.sides[0].teamId === teamId ? 1 : 2;
  return { players: [...roster].filter(([, s]) => s === side).map(([p]) => p), byRoster: true, played, total: mine.length };
}

export function teamEventPodium(kit: Kit, job: BadgeJob): BadgeDecision[] {
  const d = def('event_podium');
  const eid = refId(job.ref, 'event');
  const out: BadgeDecision[] = [];
  const events = [...kit.events.values()].filter((e) => (eid ? e.id === eid : job.kind === 'historial' && e.league_id === job.league_id));
  for (const e of events) {
    const league = kit.leagues.get(e.league_id);
    const sport = league?.sport;
    if (!league || league.kind !== 'liga' || !isTeamSport(sport) || !realOn(kit, e.league_id, e.date)) continue;
    const ms = kit.matches.filter((m) => m.eventId === e.id && m.status !== 'void');
    if (!ms.some((m) => m.bracketKey)) continue;
    const teams = new Set(ms.flatMap((m) => m.sides.map((s) => s.teamId)).filter((t): t is string => !!t));
    for (const place of teamKnockoutPodium(kit, ms, teams.size)) {
      const who = tournamentPlayers(kit, ms, place.teamId, sport);
      for (const p of who.players) {
        out.push(
          awardOf(d, playerHolderOf(p, e.league_id), sport, place.level, periodKey.event(e.id), 'firme', [ref(place.match)], {
            ...leagueCtx(kit, e.league_id),
            ...eventCtx(kit, e.id),
            ...teamCtx(kit, place.teamId),
            values: { equipos: teams.size },
            ...(who.byRoster ? { by_roster: true } : {}),
          }),
        );
      }
    }
  }
  return out;
}

export const teamPodium: Evaluator = (job: BadgeJob, snap: BadgeSnapshot, now: number) => teamEventPodium(kitOf(job, snap, now), job);
