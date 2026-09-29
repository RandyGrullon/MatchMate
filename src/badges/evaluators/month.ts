/**
 * Insignias del mes (docs/insignias.md §2.9), que se evalúan el día 3 por el mes anterior: las de liga
 * (`month_league`: figura, mayor progreso, racha, asistencia perfecta, equipo del mes, goleador y valla menos
 * vencida), las de cuenta (`month_account`: tu mejor mes y fijo del mes) y la constancia (`month_streak`). Las de
 * liga piden liga con peso para el mes y `kind='liga'`; todas quedan firmes (§3.4).
 */
import { badgeDef, levelFor, paramOf } from '../catalog';
import { activeDays, activeMonths, monthStreak, weighDays } from '../rules/activity';
import { bowlingBaseline } from '../rules/baselines';
import { MINIMUMS, topWithTies, weightyMonth } from '../rules/gates';
import { addDays, addMonths, localDate, monthDueOn, monthOf, monthsBetween, periodKey } from '../rules/periods';
import { isR1, r2Reason, wonBy } from '../rules/racket';
import { appearances, basketballStatLine, footballStatLine, isT1, rosterFallback } from '../rules/team';
import { isFinal, type Match } from '../../lib/data/matchCore';
import { playerSide } from '../../pages/sports/racket/logic/results';
import type { SportId } from '../../sports/types';
import type { BadgeDecision, BadgeDef } from '../types';
import {
  accountTargets,
  awardOf,
  groupBy,
  isRacketSport,
  isTeamSport,
  jobMonth,
  kitOf,
  leagueCtx,
  matchDay,
  mean,
  playerHolderOf,
  progressOf,
  realOn,
  round1,
  teamCtx,
  levelAwards,
  type AccountTarget,
  type Evaluator,
  type Kit,
  type TeamSportId,
} from './kit';
import {
  appearancesFor,
  bowlingFigure,
  bowlingHistory,
  byKey,
  g2Diffs,
  golfBase,
  golfCards,
  golfFigure,
  inWin,
  leagueBestSteps,
  leagueBowling,
  leagueMatches,
  monthWindow,
  officialRacket,
  pctOf,
  racketFigure,
  racketLines,
  racketPeople,
  selfPlayers,
  sideOfTeam,
  swimsWithPrior,
  t2For,
  teamMatchesIn,
  teamTable,
  type Ranked,
  type Window,
} from './metrics';
import { matchCtx } from './racket';
import { countsT2, teamMatchCtx } from './team';

const def = (key: string): BadgeDef => badgeDef(key)!;

/** Meses que evalúa un trabajo: el del ref, o en el historial todos los que ya vencieron desde el primero con datos. */
export function monthsOf(kit: Kit, leagueId: string | null): string[] {
  const m = jobMonth(kit.job);
  if (m) return [m];
  if (kit.job.kind !== 'historial') return [];
  const rows = kit.leagueMonths().filter((r) => !leagueId || r.league_id === leagueId);
  if (!rows.length) return [];
  const first = rows.map((r) => r.month).sort()[0];
  return monthsBetween(first, lastDueMonth(kit.today));
}

/** El último mes que ya se puede evaluar (el día 3 del mes siguiente). */
export function lastDueMonth(today: string): string {
  const m = addMonths(monthOf(today), -1);
  return monthDueOn(m) <= today ? m : addMonths(m, -1);
}

/** ¿El jugador ya existía antes (o el mismo día) de la primera fecha? */
const existedBy = (kit: Kit, p: string, date: string) => {
  const created = localDate(kit.players.get(p)?.created_at, kit.tzOf(kit.players.get(p)?.league_id ?? ''));
  return !!created && created <= date;
};

// ---------------------------------------------------------------------------------------------------------
// Progreso (mayor progreso del mes)

/** Los que mejoraron en el mes contra su línea base (§2.9 `most_improved_month`), si llegan al mínimo. */
export function monthImprovers(kit: Kit, leagueId: string, sport: SportId, w: Window): Ranked[] {
  const d = def('most_improved_month');
  const min = paramOf(d, 'minGain', sport) ?? 0;
  const mins = MINIMUMS.progressMonth;
  const out: Ranked[] = [];
  if (sport === 'bowling') {
    for (const [p, games] of groupBy(leagueBowling(kit, leagueId, w), (g) => g.player_id)) {
      if (games.length < mins.bowlingGames) continue;
      const base = bowlingBaseline(bowlingHistory(kit, p), w.from, { min: mins.bowlingBase });
      const gain = base ? mean(games.map((g) => g.score))! - base.base : null;
      if (gain !== null && gain >= min) out.push({ p, key: [gain], values: { valor: `+${Math.round(gain)} pinos`, n: round1(gain), base: base!.base }, refs: [] });
    }
  } else if (isRacketSport(sport)) {
    const ms = leagueMatches(kit, leagueId, w);
    for (const [p, month] of groupBy(racketLines(kit, racketPeople(kit, ms), ms, false), (l) => l.p)) {
      if (month.length < mins.racketMatches) continue;
      const prior = racketLines(kit, selfPlayers(kit, p), kit.matches, false).filter((l) => l.date >= addDays(w.from, -90) && l.date < w.from);
      if (prior.length < mins.racketPrior90) continue;
      const a = pctOf(month);
      const b = pctOf(prior);
      if (a === null || b === null || a - b < min) continue;
      out.push({ p, key: [a - b], values: { valor: `+${Math.round(a - b)} puntos de juegos ganados`, n: round1(a - b) }, refs: month.map((l) => `match:${l.m.id}`) });
    }
  } else if (sport === 'golf') {
    const cards = golfCards(kit).filter((c) => c.card.league_id === leagueId && inWin(c.date, w) && c.g2 && c.holes === 18 && c.diff !== null);
    for (const [p, list] of groupBy(cards, (c) => c.card.player_id)) {
      if (list.length < mins.golfCards) continue;
      const base = golfBase(kit, p, w.from, 8, mins.golfBase);
      const gain = base === null ? null : base - mean(list.map((c) => c.diff!))!;
      if (gain !== null && gain >= min) out.push({ p, key: [gain], values: { valor: `${round1(gain)} golpes menos`, n: round1(gain) }, refs: list.map((c) => `card:${c.card.id}`) });
    }
  } else if (sport === 'swimming') {
    const swimmers = new Set((kit.snap.swim_entries ?? []).filter((e) => e.league_id === leagueId).map((e) => e.player_id));
    for (const p of swimmers) {
      if (swimsWithPrior(kit, p, leagueId, w) < mins.swimRaces) continue;
      const gain = leagueBestSteps(kit, p, leagueId, w).reduce((n, s) => n + s.pct, 0);
      if (gain >= min) out.push({ p, key: [gain], values: { valor: `+${round1(gain)} %`, n: round1(gain) }, refs: [] });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Rachas del mes

interface TeamRun {
  teamId: string;
  run: Match[];
}

/** Racha más larga del mes de cada jugador (boliche, raqueta, golf) o de cada equipo. */
export function monthStreaks(kit: Kit, leagueId: string, sport: SportId, w: Window): { players: Ranked[]; teams: (Ranked & TeamRun)[] } {
  const players: Ranked[] = [];
  const teams: (Ranked & TeamRun)[] = [];
  const best = (p: string, runs: { n: number; tb: number; refs: string[] }[]) => {
    const top = [...runs].sort((a, b) => b.n - a.n || b.tb - a.tb)[0];
    if (top) players.push({ p, key: [top.n, top.tb], values: { n: top.n }, refs: top.refs });
  };
  if (sport === 'bowling') {
    for (const [p, games] of groupBy(leagueBowling(kit, leagueId, w), (g) => g.player_id)) {
      const base = bowlingBaseline(bowlingHistory(kit, p), w.from);
      if (!base) continue;
      const runs: { n: number; tb: number; refs: string[] }[] = [];
      let cur: typeof games = [];
      for (const g of [...games, null]) {
        if (g && g.score >= base.base) {
          cur.push(g);
          continue;
        }
        if (cur.length) runs.push({ n: cur.length, tb: mean(cur.map((x) => x.score))! - base.base, refs: [...new Set(cur.map((x) => `event:${x.event_id}`))] });
        cur = [];
      }
      best(p, runs);
    }
  } else if (isRacketSport(sport)) {
    const ms = leagueMatches(kit, leagueId, w).filter((m) => officialRacket(kit, m));
    for (const p of racketPeople(kit, ms)) {
      const mine = ms.filter((m) => playerSide(m, p, kit.rosterOf)).sort((a, b) => (matchDay(kit, a) ?? '').localeCompare(matchDay(kit, b) ?? ''));
      const runs: { n: number; tb: number; refs: string[] }[] = [];
      let cur: string[] = [];
      for (const m of mine) {
        const ctx = matchCtx(kit, m);
        if (!isR1(m, p, ctx)) continue;
        if (!wonBy(m, p, kit.rosterOf)) {
          if (cur.length) runs.push({ n: cur.length, tb: 0, refs: cur });
          cur = [];
        } else if (r2Reason(m, p, ctx)) cur.push(`match:${m.id}`);
      }
      if (cur.length) runs.push({ n: cur.length, tb: 0, refs: cur });
      best(p, runs);
    }
  } else if (sport === 'golf') {
    const cards = golfCards(kit).filter((c) => c.card.league_id === leagueId && inWin(c.date, w) && c.g2 && c.holes === 18 && c.diff !== null);
    for (const [p, list] of groupBy(cards, (c) => c.card.player_id)) {
      const base = golfBase(kit, p, w.from);
      if (base === null) continue;
      const runs: { n: number; tb: number; refs: string[] }[] = [];
      let cur: typeof list = [];
      for (const c of [...list, null]) {
        if (c && c.diff! <= base) {
          cur.push(c);
          continue;
        }
        if (cur.length) runs.push({ n: cur.length, tb: base - mean(cur.map((x) => x.diff!))!, refs: cur.map((x) => `card:${x.card.id}`) });
        cur = [];
      }
      best(p, runs);
    }
  } else if (isTeamSport(sport)) {
    for (const teamId of leagueTeams(kit, leagueId)) {
      let cur: Match[] = [];
      let top: Match[] = [];
      for (const m of teamMatchesIn(kit, teamId, w)) {
        const r = teamOutcomeFor(m, teamId);
        if (r === 'P') {
          cur = [];
          continue;
        }
        if (!t2For(kit, m, teamId) || (sport === 'basketball' && r !== 'G')) continue;
        cur = [...cur, m];
        if (cur.length > top.length) top = cur;
      }
      if (top.length) teams.push({ p: teamId, teamId, run: top, key: [top.length], values: { n: top.length }, refs: top.map((m) => `match:${m.id}`) });
    }
  }
  return { players, teams };
}

const teamOutcomeFor = (m: Match, teamId: string) => {
  const s = m.score?.sides;
  const side = sideOfTeam(m, teamId);
  if (Array.isArray(s) && s.length === 2) {
    const [a, b] = side === 1 ? s : [s[1], s[0]];
    return a > b ? 'G' : a < b ? 'P' : 'E';
  }
  return m.winner === null ? null : m.winner === side ? 'G' : 'P';
};

/** Equipos de temporada de una liga (los de `teams` sin evento, o los que salen en sus partidos). */
export function leagueTeams(kit: Kit, leagueId: string): string[] {
  const own = [...kit.teams.values()].filter((t) => t.league_id === leagueId && !t.event_id).map((t) => t.id);
  if (own.length) return own;
  return [...new Set(kit.matches.filter((m) => m.leagueId === leagueId).flatMap((m) => m.sides.map((s) => s.teamId)).filter((t): t is string => !!t))];
}

// ---------------------------------------------------------------------------------------------------------
// Fechas y asistencia

/** Una fecha oficial de la liga para un jugador: dónde tenía que estar y si estuvo. */
export interface Attendance {
  dates: number;
  present: number;
  refs: string[];
}

/**
 * Asistencia de un jugador en la ventana (§2.9 `perfect_attendance_month`; §2.11 `season_attendance` la usa desde su
 * primera actividad). Fechas: boliche, torneos con 4+ jugadores con juegos B1; raqueta, sus partidos oficiales que
 * terminaron finales o por W.O.; equipos, los partidos de su equipo (todos con alineación); golf, rondas cerradas
 * con 3+ tarjetas; natación, encuentros finalizados donde estaba inscrito.
 */
export function attendanceIn(kit: Kit, leagueId: string, sport: SportId, w: Window, opts: { lineupShare?: number } = {}): Map<string, Attendance & { teamId?: string }> {
  const out = new Map<string, Attendance & { teamId?: string }>();
  const minPlayers = paramOf(def('perfect_attendance_month'), 'minPlayers', 'bowling') ?? 4;
  const minCards = paramOf(def('perfect_attendance_month'), 'minCards', 'golf') ?? 3;
  if (sport === 'bowling') {
    const games = leagueBowling(kit, leagueId, w).filter((g) => g.official);
    const byEvent = groupBy(games, (g) => g.event_id);
    const dates = [...byEvent].filter(([, gs]) => new Set(gs.map((g) => g.player_id)).size >= minPlayers);
    const players = new Set(games.map((g) => g.player_id));
    for (const p of players) {
      const present = dates.filter(([, gs]) => gs.some((g) => g.player_id === p)).length;
      out.set(p, { dates: dates.length, present, refs: dates.map(([e]) => `event:${e}`) });
    }
  } else if (isRacketSport(sport)) {
    const ms = leagueMatches(kit, leagueId, w).filter((m) => officialRacket(kit, m) && isFinal(m, kit.now));
    for (const p of racketPeople(kit, ms)) {
      const mine = ms.filter((m) => playerSide(m, p, kit.rosterOf));
      const present = mine.filter((m) => !(m.status === 'walkover' && m.walkoverSide === playerSide(m, p, kit.rosterOf))).length;
      out.set(p, { dates: mine.length, present, refs: mine.map((m) => `match:${m.id}`) });
    }
  } else if (isTeamSport(sport)) {
    for (const teamId of leagueTeams(kit, leagueId)) {
      const all = teamMatchesIn(kit, teamId, w);
      const { withLineup } = appearancesFor(all, teamId, sport);
      if (!all.length) continue;
      // Mes: todos los partidos con alineación (si no, no se sabe quién faltó). Temporada: solo los que la tienen,
      // si son la mayoría que pide la insignia.
      const share = opts.lineupShare;
      if (share === undefined ? withLineup < all.length : withLineup < share * all.length) continue;
      const ms = all.filter((m) => appearances(m, sport).size > 0);
      const { count } = appearancesFor(ms, teamId, sport);
      const roster = (kit.snap.team_players ?? []).filter((tp) => tp.team_id === teamId).map((tp) => tp.player_id);
      for (const p of new Set([...roster, ...count.keys()])) {
        out.set(p, { dates: ms.length, present: count.get(p) ?? 0, refs: ms.map((m) => `match:${m.id}`), teamId });
      }
    }
  } else if (sport === 'golf') {
    const cards = golfCards(kit).filter((c) => c.card.league_id === leagueId && inWin(c.date, w));
    const rounds = [...groupBy(cards, (c) => c.card.event_id)].filter(([, cs]) => cs.length >= minCards);
    for (const p of new Set(cards.map((c) => c.card.player_id))) {
      const present = rounds.filter(([, cs]) => cs.some((c) => c.card.player_id === p)).length;
      out.set(p, { dates: rounds.length, present, refs: rounds.map(([e]) => `round:${e}`) });
    }
  } else if (sport === 'swimming') {
    const meets = new Map((kit.snap.swim_meets ?? []).map((m) => [m.event_id, m]));
    const entries = (kit.snap.swim_entries ?? []).filter((e) => e.league_id === leagueId && !!meets.get(e.event_id)?.finalized_at && inWin(kit.events.get(e.event_id)?.date, w));
    for (const [p, list] of groupBy(entries, (e) => e.player_id)) {
      const byMeet = groupBy(list, (e) => e.event_id);
      const present = [...byMeet.values()].filter((es) => es.some((e) => e.status !== 'dns')).length;
      out.set(p, { dates: byMeet.size, present, refs: [...byMeet.keys()].map((e) => `meet:${e}`) });
    }
  }
  return out;
}

/** Primera fecha oficial de la ventana (para saber si el jugador ya existía). */
function firstDate(kit: Kit, leagueId: string, sport: SportId, w: Window): string {
  if (sport === 'bowling') return leagueBowling(kit, leagueId, w).find((g) => g.official)?.date ?? w.from;
  if (sport === 'golf') return golfCards(kit).find((c) => c.card.league_id === leagueId && inWin(c.date, w))?.date ?? w.from;
  const days = leagueMatches(kit, leagueId, w)
    .map((m) => matchDay(kit, m))
    .filter((d): d is string => !!d)
    .sort();
  return days[0] ?? w.from;
}

// ---------------------------------------------------------------------------------------------------------
// Equipos: equipo del mes, goleador y valla menos vencida

/** Quiénes de un equipo reciben: los que jugaron `share` de sus partidos; sin alineación, la plantilla. */
export function teamShareholders(kit: Kit, teamId: string, ms: readonly Match[], sport: TeamSportId, share: number): { players: Map<string, number>; byRoster: boolean } {
  const { count, withLineup } = appearancesFor(ms, teamId, sport);
  if (withLineup > 0) {
    const need = Math.ceil(share * ms.length - 1e-9);
    return { players: new Map([...count].filter(([, n]) => n >= need)), byRoster: false };
  }
  const first = ms[0];
  const date = first ? matchDay(kit, first) : null;
  if (!first || !date) return { players: new Map(), byRoster: true };
  const side = sideOfTeam(first, teamId);
  const roster = rosterFallback(first, kit.snap.team_players ?? [], date, kit.tzOf(first.leagueId));
  return { players: new Map([...roster].filter(([, s]) => s === side).map(([p]) => [p, 0])), byRoster: true };
}

/** Líneas TS de los partidos T2 (para su lado) de la ventana: goles o puntos, portero, recibidos. */
export function statLines(kit: Kit, ms: readonly Match[], sport: TeamSportId) {
  const out: { p: string; m: Match; side: 1 | 2; goals: number; keeper: boolean; conceded: number }[] = [];
  for (const m of ms) {
    if (!isT1(m, kit.now)) continue;
    const ctx = teamMatchCtx(kit, m);
    for (const [p, side] of appearances(m, sport)) {
      if (!countsT2(kit, { m, p, side, ctx })) continue;
      if (sport === 'basketball') {
        const l = basketballStatLine(m, p);
        if (l) out.push({ p, m, side, goals: l.points, keeper: false, conceded: 0 });
      } else {
        const l = footballStatLine(m, p);
        if (l) out.push({ p, m, side, goals: l.goals, keeper: l.keeper, conceded: l.conceded });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// El evaluador de liga

export const monthLeague: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const leagueId = job.league_id;
  const league = leagueId ? kit.leagues.get(leagueId) : undefined;
  if (!league || league.kind !== 'liga') return [];
  const out: BadgeDecision[] = [];
  for (const month of monthsOf(kit, league.id)) {
    const input = { league, months: kit.leagueMonths(), profiles: kit.profiles, members: kit.snap.members ?? [] };
    if (!weightyMonth(input, month)) continue;
    out.push(...monthLeagueFor(kit, league.id, league.sport, month));
  }
  return out;
};

export function monthLeagueFor(kit: Kit, leagueId: string, sport: SportId, month: string): BadgeDecision[] {
  const w = monthWindow(month);
  const out: BadgeDecision[] = [];
  const give = (key: string, p: string, r: Pick<Ranked, 'values' | 'refs'>, extra: Parameters<typeof awardOf>[7] = {}) => {
    const d = def(key);
    if (d.sports !== 'all' && !d.sports.includes(sport)) return;
    out.push(awardOf(d, playerHolderOf(p, leagueId), sport, 0, periodKey.month(month), 'firme', r.refs, { ...leagueCtx(kit, leagueId), window: [w.from, w.to], values: r.values, ...extra }));
  };
  const winners = (rows: readonly Ranked[]) => topWithTies(rows, byKey).winners;

  // Figura del mes.
  const fig = def('player_of_month');
  const figure =
    sport === 'bowling'
      ? bowlingFigure(kit, leagueId, w, {
          minGames: paramOf(fig, 'minGames', sport) ?? MINIMUMS.titleMonth.bowlingGames,
          minDates: paramOf(fig, 'minDates', sport) ?? MINIMUMS.titleMonth.bowlingDates,
          fewGames: MINIMUMS.titleMonth.bowlingGamesFewDates,
        })
      : isRacketSport(sport)
        ? racketFigure(kit, leagueId, w, paramOf(fig, 'minMatches', sport) ?? MINIMUMS.titleMonth.racketMatches)
        : sport === 'golf'
          ? golfFigure(kit, leagueId, w, paramOf(fig, 'minCards', sport) ?? MINIMUMS.titleMonth.golfCards)
          : [];
  for (const r of winners(figure)) give('player_of_month', r.p, r);

  // Mayor progreso: quien la ganó el mes anterior no repite (pasa al siguiente).
  const prev = periodKey.month(addMonths(month, -1));
  const repeat = new Set(
    (kit.snap.awards ?? []).filter((a) => a.badge_key === 'most_improved_month' && a.league_id === leagueId && a.period_key === prev && a.status !== 'revocada').map((a) => a.player_id),
  );
  for (const r of winners(monthImprovers(kit, leagueId, sport, w).filter((x) => !repeat.has(x.p)))) give('most_improved_month', r.p, r);

  // Racha del mes.
  const minRun = paramOf(def('streak_month'), 'minRun', sport) ?? 4;
  const streaks = monthStreaks(kit, leagueId, sport, w);
  for (const r of winners(streaks.players.filter((x) => x.key[0] >= minRun))) give('streak_month', r.p, r);
  if (isTeamSport(sport)) {
    const share = paramOf(def('streak_month'), 'teamShare', sport) ?? 0.75;
    for (const t of topWithTies(streaks.teams.filter((x) => x.key[0] >= minRun), byKey).winners) {
      const who = teamShareholders(kit, t.teamId, t.run, sport, share);
      for (const p of who.players.keys()) give('streak_month', p, t, { ...teamCtx(kit, t.teamId), ...(who.byRoster ? { by_roster: true } : {}) });
    }
  }

  // Asistencia perfecta: todos los que no faltaron a ninguna fecha (y ya existían en la primera).
  const pa = def('perfect_attendance_month');
  const minDates = paramOf(pa, 'minDates', sport) ?? 3;
  const first = firstDate(kit, leagueId, sport, w);
  for (const [p, a] of attendanceIn(kit, leagueId, sport, w)) {
    if (a.dates >= minDates && a.present === a.dates && existedBy(kit, p, first)) give('perfect_attendance_month', p, { values: { n: a.dates }, refs: a.refs }, a.teamId ? teamCtx(kit, a.teamId) : {});
  }

  if (isTeamSport(sport)) out.push(...teamMonth(kit, leagueId, sport, month, w));
  return out;
}

function teamMonth(kit: Kit, leagueId: string, sport: TeamSportId, month: string, w: Window): BadgeDecision[] {
  const out: BadgeDecision[] = [];
  const ctxBase = { ...leagueCtx(kit, leagueId), window: [w.from, w.to] as [string, string] };
  const ms = leagueMatches(kit, leagueId, w).filter((m) => isFinal(m, kit.now) && m.status !== 'void');
  const t1 = ms.filter((m) => isT1(m, kit.now));
  const teams = leagueTeams(kit, leagueId);

  // Equipo del mes: 4+ equipos con 2+ partidos T2; candidatos con 3+; puntos de la tabla de la liga.
  const tom = def('team_of_month');
  const t2Count = new Map(teams.map((t) => [t, t1.filter((m) => m.sides.some((s) => s.teamId === t) && t2For(kit, m, t)).length]));
  const qualifying = teams.filter((t) => (t2Count.get(t) ?? 0) >= (paramOf(tom, 'minTeamMatches', sport) ?? 2));
  if (qualifying.length >= (paramOf(tom, 'minTeams', sport) ?? 4)) {
    const table = teamTable(kit, sport, leagueId, teams, ms);
    const rows: Ranked[] = table
      .filter((r) => (t2Count.get(r.id) ?? 0) >= (paramOf(tom, 'minCandidateMatches', sport) ?? 3))
      .map((r) => ({ p: r.id, key: [r.points, r.played ? r.points / r.played : 0, r.diff, r.for], values: { puntos: r.points }, refs: [] }));
    for (const t of topWithTies(rows, byKey).winners) {
      const tms = teamMatchesIn(kit, t.p, w);
      const who = teamShareholders(kit, t.p, tms, sport, paramOf(tom, 'share', sport) ?? 0.5);
      for (const [p, n] of who.players) {
        out.push(
          awardOf(tom, playerHolderOf(p, leagueId), sport, 0, periodKey.month(month), 'firme', tms.map((m) => `match:${m.id}`), {
            ...ctxBase,
            ...teamCtx(kit, t.p),
            values: { jugados: n, total: tms.length, puntos: t.values.puntos },
            ...(who.byRoster ? { by_roster: true } : {}),
          }),
        );
      }
    }
  }

  // Goleador (o más puntos) del mes: líneas TS en 2+ partidos.
  const tsm = def('top_scorer_month');
  const lines = statLines(kit, t1, sport);
  const scorers: Ranked[] = [];
  for (const [p, ls] of groupBy(lines, (l) => l.p)) {
    const n = ls.reduce((a, l) => a + l.goals, 0);
    if (ls.length < (paramOf(tsm, 'minMatches', sport) ?? 2) || n < (paramOf(tsm, 'minGoals', sport) ?? 1)) continue;
    scorers.push({ p, key: [n, n / ls.length], values: { n, partidos: ls.length }, refs: ls.map((l) => `match:${l.m.id}`) });
  }
  for (const r of topWithTies(scorers, byKey).winners) out.push(awardOf(tsm, playerHolderOf(r.p, leagueId), sport, 0, periodKey.month(month), 'firme', r.refs, { ...ctxBase, values: r.values }));

  // Valla menos vencida: portero en 2+ partidos T2 con al menos una valla invicta.
  if (sport !== 'basketball') {
    const csm = def('clean_sheet_month');
    const keepers: Ranked[] = [];
    for (const [p, ls] of groupBy(
      lines.filter((l) => l.keeper),
      (l) => l.p,
    )) {
      const sheets = ls.filter((l) => l.conceded === 0).length;
      if (ls.length < (paramOf(csm, 'minMatches', sport) ?? 2) || sheets < 1) continue;
      const conceded = ls.reduce((a, l) => a + l.conceded, 0);
      keepers.push({ p, key: [-conceded / ls.length, sheets, ls.length], values: { recibidos: conceded, partidos: ls.length, vallas: sheets }, refs: ls.map((l) => `match:${l.m.id}`) });
    }
    for (const r of topWithTies(keepers, byKey).winners) out.push(awardOf(csm, playerHolderOf(r.p, leagueId), sport, 0, periodKey.month(month), 'firme', r.refs, { ...ctxBase, values: r.values }));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// De cuenta: tu mejor mes y fijo del mes

/** Dueños de un trabajo de cuenta: la cuenta del trabajo, o en una liga los jugadores sin cuenta. */
export function accountJobTargets(kit: Kit, sports?: readonly SportId[]): AccountTarget[] {
  const { job } = kit;
  if (job.user_id) {
    const players = [...kit.players.values()].filter((p) => p.user_id === job.user_id).map((p) => p.id);
    const out = accountTargets(kit, players, sports);
    // Una cuenta sin jugadores en la foto igual se evalúa (la actividad puede venir resuelta de SQL).
    return out.length ? out : [{ holder: { player_id: null, user_id: job.user_id, league_id: null }, user: job.user_id, players: [] }];
  }
  if (!job.league_id) return [];
  const loose = [...kit.players.values()].filter((p) => p.league_id === job.league_id && !p.user_id).map((p) => p.id);
  return accountTargets(kit, loose, sports);
}

/** Actividad de un dueño en ligas reales (con la cuenta fuera de las 4), hasta el día que ya cuenta. */
export function targetActivity(kit: Kit, t: AccountTarget, through?: string) {
  const mine = new Set(t.players);
  return kit
    .activity()
    .filter((a) => (t.user ? a.user_id === t.user || mine.has(a.player_id) : mine.has(a.player_id)) && realOn(kit, a.league_id, a.date, t) && (!through || a.date <= through));
}

export const monthAccount: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const month = jobMonth(job);
  const months = month ? [month] : job.kind === 'historial' ? monthsOf(kit, job.league_id) : [];
  const out: BadgeDecision[] = [];
  const w = (m: string) => monthWindow(m);
  const regular = def('monthly_regular');
  const best = def('personal_best_month');
  for (const t of accountJobTargets(kit)) {
    const acts = targetActivity(kit, t);
    for (const m of months) {
      // Fijo del mes: días ponderados de cada deporte; se guarda solo el nivel más alto.
      for (const [sport, list] of groupBy(acts, (a) => a.sport)) {
        const days = weighDays(activeDays(list.filter((a) => inWin(a.date, w(m))), t.user ? 'user' : 'player'));
        const n = days.reduce((a, d) => a + d.weight, 0);
        const level = levelFor(regular, n, sport as SportId);
        if (level !== null) {
          out.push(awardOf(regular, t.holder, sport as SportId, level, periodKey.month(m), 'firme', [], { window: [w(m).from, w(m).to], values: { n } }));
        }
      }
      out.push(...personalBestMonth(kit, t, m, best));
    }
  }
  return out;
};

/** Tu mejor mes (§2.9): la media del mes gana a la de todos tus meses anteriores que calificaron (3+). */
function personalBestMonth(kit: Kit, t: AccountTarget, month: string, d: BadgeDef): BadgeDecision[] {
  const out: BadgeDecision[] = [];
  const minPrior = paramOf(d, 'minPriorMonths') ?? 3;
  const w = monthWindow(month);
  // Boliche: juegos B1 de sus jugadores en ligas reales.
  const bowl = kit.bowling().filter((g) => t.players.includes(g.player_id) && realOn(kit, g.league_id, g.date, t) && g.date <= w.to);
  const bowlMonths = [...groupBy(bowl, (g) => monthOf(g.date))]
    .filter(([, gs]) => gs.length >= (paramOf(d, 'minGames', 'bowling') ?? 9))
    .map(([m, gs]) => ({ m, v: mean(gs.map((g) => g.score))! }));
  const cur = bowlMonths.find((x) => x.m === month);
  const prior = bowlMonths.filter((x) => x.m < month);
  if (cur && prior.length >= minPrior) {
    const top = Math.max(...prior.map((x) => x.v));
    if (cur.v > top) out.push(awardOf(d, t.holder, 'bowling', 0, periodKey.month(month), 'firme', [], { window: [w.from, w.to], values: { valor: `+${round1(cur.v - top)} pinos`, avg: round1(cur.v) } }));
  }
  // Golf: diferencial medio (tarjetas G2 de 18 hoyos).
  const cards = g2Diffs(kit, t.players, (c) => realOn(kit, c.card.league_id, c.date, t) && c.date <= w.to);
  const golfMonths = [...groupBy(cards, (c) => monthOf(c.date))]
    .filter(([, cs]) => cs.length >= (paramOf(d, 'minCards', 'golf') ?? 2))
    .map(([m, cs]) => ({ m, v: mean(cs.map((c) => c.diff!))! }));
  const gcur = golfMonths.find((x) => x.m === month);
  const gprior = golfMonths.filter((x) => x.m < month);
  if (gcur && gprior.length >= minPrior) {
    const top = Math.min(...gprior.map((x) => x.v));
    if (gcur.v < top) out.push(awardOf(d, t.holder, 'golf', 0, periodKey.month(month), 'firme', [], { window: [w.from, w.to], values: { valor: `${round1(top - gcur.v)} golpes menos`, diff: round1(gcur.v) } }));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Constancia (meses seguidos, de cuenta)

export const monthStreakEval: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const d = def('month_streak');
  const month = jobMonth(job) ?? lastDueMonth(kit.today);
  const out: BadgeDecision[] = [];
  for (const t of accountJobTargets(kit)) {
    const acts = targetActivity(kit, t, monthWindow(month).to);
    const weighted = weighDays(activeDays(acts, t.user ? 'user' : 'player'));
    const months = activeMonths(weighted, paramOf(d, 'minWeightedDays') ?? 2);
    const streaks = months.filter((m) => m <= month).map((m) => ({ n: monthStreak(months, m, paramOf(d, 'wildcardWindow') ?? 12), m }));
    const steps = streaks.map((s) => ({ n: s.n, ref: `month:${s.m}`, date: monthWindow(s.m).to, values: { mes: s.m } }));
    const current = monthStreak(months, month, paramOf(d, 'wildcardWindow') ?? 12);
    out.push(...levelAwards(kit, d, t.holder, 'all', 'all', steps), progressOf(d, t.holder, 'all', 'all', current));
  }
  return out;
};
