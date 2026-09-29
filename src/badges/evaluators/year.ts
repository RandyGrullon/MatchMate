/**
 * Insignias del año (docs/insignias.md §2.10), que se evalúan el 7 de enero por el año anterior: las de cuenta
 * (`year_account`: tu año y todo el año) y las de liga (`year_league`: figura y mayor progreso del año, en ligas con
 * peso para el año). Todas quedan firmes.
 */
import { badgeDef, levelFor, paramOf } from '../catalog';
import { activeDays, activeMonths, weighDays } from '../rules/activity';
import { isEstablished, topWithTies, weightyYear } from '../rules/gates';
import { periodKey, yearDueOn } from '../rules/periods';
import type { SportId } from '../../sports/types';
import type { BadgeDecision, BadgeDef } from '../types';
import { awardOf, groupBy, isRacketSport, jobYear, kitOf, leagueCtx, mean, playerHolderOf, round1, type Evaluator, type Kit } from './kit';
import {
  bowlingFigure,
  byKey,
  golfCards,
  golfFigure,
  inWin,
  leagueBestSteps,
  leagueBowling,
  leagueMatches,
  pctOf,
  racketFigure,
  racketLines,
  racketPeople,
  yearWindow,
  type Ranked,
  type Window,
} from './metrics';
import { accountJobTargets, targetActivity } from './month';

const def = (key: string): BadgeDef => badgeDef(key)!;

/** Años que evalúa un trabajo: el del ref, o en el historial todos los ya vencidos (7 de enero) con datos. */
export function yearsOf(kit: Kit, leagueId: string | null): number[] {
  const y = jobYear(kit.job);
  if (y) return [y];
  if (kit.job.kind !== 'historial') return [];
  const months = kit
    .leagueMonths()
    .filter((r) => !leagueId || r.league_id === leagueId)
    .map((r) => Number(r.month.slice(0, 4)));
  if (!months.length) return [];
  const out: number[] = [];
  for (let year = Math.min(...months); yearDueOn(year) <= kit.today; year++) out.push(year);
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// De cuenta

export const yearAccount: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const recap = def('year_recap');
  const full = def('full_year');
  const out: BadgeDecision[] = [];
  for (const year of yearsOf(kit, job.league_id)) {
    const w = yearWindow(year);
    for (const t of accountJobTargets(kit)) {
      const acts = targetActivity(kit, t).filter((a) => inWin(a.date, w));
      const by = t.user ? 'user' : 'player';
      const weighted = weighDays(activeDays(acts, by));
      const days = weighted.reduce((n, d) => n + d.weight, 0);
      const months = activeMonths(weighted);
      const sports = new Set(acts.map((a) => a.sport));
      // Tu año: días ponderados con 6+ meses activos; solo el nivel más alto.
      const level = months.length >= (paramOf(recap, 'minActiveMonths') ?? 6) ? levelFor(recap, days, 'all') : null;
      if (level !== null) {
        out.push(awardOf(recap, t.holder, 'all', level, periodKey.year(year), 'firme', [], { window: [w.from, w.to], values: { n: days, anio: year, deportes_n: sports.size, meses: months.length } }));
      }
      // Todo el año: 10+ meses activos del deporte.
      for (const [sport, list] of groupBy(acts, (a) => a.sport)) {
        const n = activeMonths(weighDays(activeDays(list, by))).length;
        if (levelFor(full, n, sport as SportId) !== null) {
          out.push(awardOf(full, t.holder, sport as SportId, 0, periodKey.year(year), 'firme', [], { window: [w.from, w.to], values: { n, anio: year } }));
        }
      }
    }
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------------
// De liga

/** Liga con peso para el año: 8+ jugadores activos y 4+ cuentas establecidas en el año. */
export function weightyYearFor(kit: Kit, leagueId: string, year: number): boolean {
  const rows = kit.leagueMonths().filter((r) => r.league_id === leagueId && r.month.startsWith(`${year}-`));
  const players = new Set(rows.flatMap((r) => r.players));
  const users = new Set(rows.flatMap((r) => r.users));
  const end = `${year}-12-31`;
  return weightyYear({ players: players.size, establishedAccounts: [...users].filter((u) => isEstablished(kit.profiles.get(u), end)).length });
}

/** Mayor progreso del año (§2.10 `progress_of_year`), por deporte, si llega al mínimo. */
export function yearImprovers(kit: Kit, leagueId: string, sport: SportId, w: Window): Ranked[] {
  const d = def('progress_of_year');
  const min = paramOf(d, 'minGain', sport) ?? 0;
  const out: Ranked[] = [];
  if (sport === 'bowling') {
    const n = paramOf(d, 'window', sport) ?? 30;
    for (const [p, games] of groupBy(leagueBowling(kit, leagueId, w), (g) => g.player_id)) {
      if (games.length < 2 * n) continue;
      const gain = mean(games.slice(-n).map((g) => g.score))! - mean(games.slice(0, n).map((g) => g.score))!;
      if (gain >= min) out.push({ p, key: [gain], values: { valor: `+${Math.round(gain)} pinos`, n: round1(gain) }, refs: [] });
    }
  } else if (isRacketSport(sport)) {
    const per = paramOf(d, 'minMatchesPerHalf', sport) ?? 8;
    const [h1, h2] = [
      { from: w.from, to: `${w.from.slice(0, 4)}-06-30` },
      { from: `${w.from.slice(0, 4)}-07-01`, to: w.to },
    ];
    const ms = leagueMatches(kit, leagueId, w);
    for (const [p, lines] of groupBy(racketLines(kit, racketPeople(kit, ms), ms, false), (l) => l.p)) {
      const a = lines.filter((l) => inWin(l.date, h1));
      const b = lines.filter((l) => inWin(l.date, h2));
      if (a.length < per || b.length < per) continue;
      const gain = (pctOf(b) ?? 0) - (pctOf(a) ?? 0);
      if (gain >= min) out.push({ p, key: [gain], values: { valor: `+${Math.round(gain)} puntos de juegos ganados`, n: round1(gain) }, refs: [] });
    }
  } else if (sport === 'golf') {
    const n = paramOf(d, 'window', sport) ?? 6;
    const cards = golfCards(kit).filter((c) => c.card.league_id === leagueId && inWin(c.date, w) && c.g2 && c.holes === 18 && c.diff !== null);
    for (const [p, list] of groupBy(cards, (c) => c.card.player_id)) {
      if (list.length < 2 * n) continue;
      const gain = mean(list.slice(0, n).map((c) => c.diff!))! - mean(list.slice(-n).map((c) => c.diff!))!;
      if (gain >= min) out.push({ p, key: [gain], values: { valor: `${round1(gain)} golpes menos`, n: round1(gain) }, refs: [] });
    }
  } else if (sport === 'swimming') {
    const minPb = paramOf(d, 'minPersonalBests', sport) ?? 4;
    const swimmers = new Set((kit.snap.swim_entries ?? []).filter((e) => e.league_id === leagueId).map((e) => e.player_id));
    for (const p of swimmers) {
      const steps = leagueBestSteps(kit, p, leagueId, w);
      if (steps.length >= minPb) out.push({ p, key: [steps.length, steps.reduce((n, s) => n + s.pct, 0)], values: { valor: `${steps.length} marcas personales`, n: steps.length }, refs: [] });
    }
  }
  return out;
}

export const yearLeague: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const league = job.league_id ? kit.leagues.get(job.league_id) : undefined;
  if (!league || league.kind !== 'liga') return [];
  const sport = league.sport;
  const fig = def('figure_of_year');
  const prog = def('progress_of_year');
  const out: BadgeDecision[] = [];
  for (const year of yearsOf(kit, league.id)) {
    if (!weightyYearFor(kit, league.id, year)) continue;
    const w = yearWindow(year);
    const ctx = { ...leagueCtx(kit, league.id), window: [w.from, w.to] as [string, string] };
    const give = (d: BadgeDef, r: Ranked) => {
      if (d.sports !== 'all' && !d.sports.includes(sport)) return;
      out.push(awardOf(d, playerHolderOf(r.p, league.id), sport, 0, periodKey.year(year), 'firme', r.refs, { ...ctx, values: { ...r.values, anio: year } }));
    };
    // Figura del año: no se da si la liga tuvo una temporada igual al año (ahí ya está el título de temporada).
    const seasonIsYear = (kit.snap.seasons ?? []).some((s) => s.league_id === league.id && s.starts_on === w.from && s.ends_on === w.to);
    if (!seasonIsYear) {
      const pct = paramOf(fig, 'minAttendancePct', sport) ?? 40;
      const rows =
        sport === 'bowling'
          ? bowlingFigure(kit, league.id, w, { minGames: paramOf(fig, 'minGames', sport) ?? 36, minDates: 1, datesPct: pct })
          : isRacketSport(sport)
            ? racketFigure(kit, league.id, w, paramOf(fig, 'minMatches', sport) ?? 12, pct)
            : sport === 'golf'
              ? golfFigure(kit, league.id, w, paramOf(fig, 'minCards', sport) ?? 8)
              : [];
      for (const r of topWithTies(rows, byKey).winners) give(fig, r);
    }
    for (const r of topWithTies(yearImprovers(kit, league.id, sport, w), byKey).winners) give(prog, r);
  }
  return out;
};
