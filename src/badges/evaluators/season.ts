/**
 * Insignias de temporada (docs/insignias.md §2.11 y §2.12), que se evalúan cuando una fila de `public.seasons` pasa a
 * `closed` (trabajo `temporada`, `ref = 'season:<id>'`): título, categoría, mayor progreso, revelación, asistencia,
 * goleador, portero, juego limpio, palabra de honor y brazalete (`season_league`), y las del staff (`season_staff`:
 * temporada organizada y cuerpo técnico). Piden liga con peso para temporada; las de título, `badges_auto='todas'`
 * (eso lo revisa el motor). La tabla que calculó el teléfono (`seasons.standings`) queda como evidencia: el
 * servidor recalcula con los mismos helpers. `season_awards` (campeón, subcampeón, tercero) solo ordena a los
 * empatados en todo.
 */
import { badgeDef, levelFor, paramOf } from '../catalog';
import { bowlingBaseline } from '../rules/baselines';
import { isEstablished, MINIMUMS, podiumAwards, podiumLevels, topWithTies, weightySeason } from '../rules/gates';
import { isOfficialMeet } from '../rules/swim';
import { periodKey } from '../rules/periods';
import { isR1 } from '../rules/racket';
import { appearances, isT1 } from '../rules/team';
import { decodeLines as decodeFootballLines } from '../../pages/sports/football/adapter';
import { category, DEFAULT_CUTS } from '../../lib/stats';
import { isFinal, type Match } from '../../lib/data/matchCore';
import { isPointsMatch, pairStandings, playerSide, seasonNightTable, seasonPlayerTable, sidePlayers } from '../../pages/sports/racket/logic/results';
import { golfLeaderboard, orderOfMerit } from '../../sports/golf/leaderboard';
import type { GolfRound } from '../../sports/golf/scoring';
import { placeResults, type SwimResult } from '../../sports/swimming/results';
import type { SportId, StandingRow } from '../../sports/types';
import type { SnapLeague, SnapSeason } from '../snapshot';
import type { BadgeContext, BadgeDecision, BadgeDef } from '../types';
import { cardHoles } from '../rules/golf';
import {
  awardOf,
  groupBy,
  isRacketSport,
  isTeamSport,
  kitOf,
  leagueCtx,
  matchDay,
  mean,
  playerHolderOf,
  refId,
  round1,
  rulesPart,
  teamCtx,
  userHolderOf,
  type Evaluator,
  type Kit,
  type TeamSportId,
} from './kit';
import {
  bowlingFigure,
  bowlingHistory,
  byKey,
  golfCards,
  halves,
  inWin,
  leagueBestSteps,
  leagueBowling,
  leagueMatches,
  officialRacket,
  pctOf,
  racketLines,
  racketPeople,
  selfPlayers,
  sideOfTeam,
  teamMatchesIn,
  teamTable,
  type Ranked,
  type Window,
} from './metrics';
import { attendanceIn, leagueTeams, statLines, teamShareholders } from './month';
import { racketTourneyPodium } from './racket';
import { teamKnockoutPodium, tournamentPlayers } from './team';

const def = (key: string): BadgeDef => badgeDef(key)!;

/** Lo que comparte cada insignia de una temporada. */
interface SeasonRun {
  kit: Kit;
  season: SnapSeason;
  league: SnapLeague;
  sport: SportId;
  w: Window;
  ctx: Omit<BadgeContext, 'v'>;
  out: BadgeDecision[];
}

function give(run: SeasonRun, key: string, p: string, level: 0 | 1 | 2 | 3, values: Record<string, number | string>, extra: Omit<BadgeContext, 'v'> = {}, catId?: string | null, refs: string[] = []) {
  const d = def(key);
  if (d.sports !== 'all' && !d.sports.includes(run.sport)) return;
  run.out.push(awardOf(d, playerHolderOf(p, run.league.id), run.sport, level, periodKey.season(run.season.id, catId), 'firme', refs, { ...run.ctx, values, ...extra }));
}

/** La temporada del trabajo (cerrada) y su liga. */
export function seasonOfJob(kit: Kit): { season: SnapSeason; league: SnapLeague } | null {
  const id = refId(kit.job.ref, 'season');
  const season = (kit.snap.seasons ?? []).find((s) => s.id === id);
  const league = season ? kit.leagues.get(season.league_id) : undefined;
  return season && league && season.status === 'closed' ? { season, league } : null;
}

/**
 * Liga con peso para la temporada (§1.7.4): competidores (jugadores, o equipos en deportes de equipo) con actividad
 * en la ventana, cuentas establecidas entre ellos y cuentas que escribieron resultados.
 */
export function weightySeasonFor(kit: Kit, league: SnapLeague, w: Window): boolean {
  const acts = kit.activity().filter((a) => a.league_id === league.id && !a.roster && inWin(a.date, w));
  const ms = leagueMatches(kit, league.id, w);
  const competitors = isTeamSport(league.sport)
    ? new Set(ms.filter((m) => isT1(m, kit.now)).flatMap((m) => m.sides.map((s) => s.teamId)).filter((t): t is string => !!t)).size
    : new Set(acts.map((a) => a.player_id)).size;
  const users = new Set(acts.map((a) => a.user_id).filter((u): u is string => !!u));
  const established = [...users].filter((u) => isEstablished(kit.profiles.get(u), w.to)).length;
  const writers = new Set<string>();
  for (const m of ms) for (const u of [m.proposedBy, m.confirmedBy]) if (u) writers.add(u);
  for (const s of kit.snap.submissions ?? []) if (s.league_id === league.id && inWin(s.date, w) && s.reviewed_by) writers.add(s.reviewed_by);
  for (const e of kit.snap.swim_entries ?? []) if (e.league_id === league.id && e.recorded_by && inWin(kit.events.get(e.event_id)?.date, w)) writers.add(e.recorded_by);
  for (const r of kit.snap.golf_rounds ?? []) if (r.league_id === league.id && r.closed_by && inWin(kit.events.get(r.event_id)?.date, w)) writers.add(r.closed_by);
  return weightySeason({ competitors, establishedAccounts: established, writers: writers.size });
}

export const seasonLeague: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const found = seasonOfJob(kit);
  if (!found || !weightySeasonFor(kit, found.league, { from: found.season.starts_on, to: found.season.ends_on })) return [];
  const { season, league } = found;
  const w = { from: season.starts_on, to: season.ends_on };
  const run: SeasonRun = {
    kit,
    season,
    league,
    sport: league.sport,
    w,
    ctx: { ...leagueCtx(kit, league.id), season: { id: season.id, name: season.name }, window: [w.from, w.to] },
    out: [],
  };
  seasonPodium(run);
  categoryTitle(run);
  seasonMostImproved(run);
  seasonRookie(run);
  seasonAttendance(run);
  if (isTeamSport(league.sport)) {
    seasonScorers(run, league.sport);
    fairPlayTeam(run, league.sport);
    captainBand(run, league.sport);
  }
  fairPlay(run);
  honorWord(run);
  return run.out;
};

// ---------------------------------------------------------------------------------------------------------
// Título de temporada (§2.11, tabla «Quién gana season_podium»)

/** Orden del admin entre empatados en todo (`season_awards`: campeón, subcampeón, tercero). */
function adminOrder(run: SeasonRun): (id: string) => number {
  const rank: Record<string, number> = { campeon: 1, subcampeon: 2, tercero: 3 };
  const by = new Map<string, number>();
  for (const a of run.kit.snap.season_awards ?? []) {
    if (a.season_id !== run.season.id || !(a.kind in rank)) continue;
    const id = a.team_id ?? a.player_id;
    if (id) by.set(id, rank[a.kind]);
  }
  return (id) => by.get(id) ?? 9;
}

/** Jugadores de un participante de la tabla (una pareja o equipo de temporada, o el jugador). */
const peopleOf = (run: SeasonRun, id: string): string[] => {
  const roster = run.kit.rosterOf(id);
  return roster.length ? [...roster] : run.kit.players.has(id) ? [id] : [];
};

function podiumFrom<T>(run: SeasonRun, rows: readonly T[], cmp: (a: T, b: T) => number, who: (t: T) => string[], values: (t: T) => Record<string, number | string>, catId?: string) {
  for (const a of podiumAwards(rows, cmp, podiumLevels(rows.length))) {
    for (const p of who(a.row)) give(run, 'season_podium', p, a.level, { lugar: a.place, ...values(a.row) }, run.league.kind === 'torneo' ? { alt: 'torneo' } : {}, catId);
  }
}

function seasonPodium(run: SeasonRun) {
  const { kit, league, sport, w } = run;
  if (sport === 'swimming') return;
  if (sport === 'bowling') {
    const rows = bowlingFigure(kit, league.id, w, league.kind === 'torneo' ? { minGames: 1, minDates: 1, allGames: true } : { minGames: MINIMUMS.titleSeason.bowlingGames, minDates: 1, datesPct: MINIMUMS.titleSeason.bowlingDatesPct });
    const order = adminOrder(run);
    podiumFrom(run, rows, (a, b) => byKey(a, b) || order(a.p) - order(b.p), (r) => [r.p], (r) => r.values);
    return;
  }
  if (isRacketSport(sport)) return racketSeasonPodium(run, sport);
  if (isTeamSport(sport)) return teamSeasonPodium(run, sport);
  if (sport === 'golf') {
    const merit = golfMerit(run);
    const order = adminOrder(run);
    podiumFrom(run, merit.rows, (a, b) => a.rank - b.rank || order(a.id) - order(b.id), (r) => [r.id], (r) => ({ n: r.points }));
  }
}

function racketSeasonPodium(run: SeasonRun, sport: 'padel' | 'tennis' | 'pickleball') {
  const { kit, league, w } = run;
  const events = [...kit.events.values()].filter((e) => e.league_id === league.id && inWin(e.date, w));
  // Torneo suelto: el cuadro de cada categoría.
  if (league.kind === 'torneo') {
    for (const e of events.filter((x) => x.type === 'torneo')) {
      for (const cat of racketTourneyPodium(kit, e.id, e.config)) {
        for (const place of cat.places) for (const p of place.players) give(run, 'season_podium', p, place.level, { categoria: cat.catId }, { alt: 'torneo' }, cat.catId, [`match:${place.match.id}`]);
      }
    }
    return;
  }
  const ms = leagueMatches(kit, league.id, w);
  const order = adminOrder(run);
  // Liga por cajas: la cima de la caja 1 del último mes cerrado de la temporada (solo oro).
  const box = [...kit.events.values()].find((e) => e.league_id === league.id && e.type === 'cajas' && ms.some((m) => m.eventId === e.id));
  if (box) {
    const months = Array.isArray(box.config?.months) ? (box.config!.months as { n?: number; closed?: boolean }[]) : [];
    const closed = new Set(months.filter((m) => m?.closed === true).map((m) => m.n));
    const rounds = [...new Set(ms.filter((m) => m.eventId === box.id && m.round !== null && closed.has(m.round)).map((m) => m.round!))].sort((a, b) => b - a);
    const last = rounds[0];
    if (last !== undefined) {
      const top = ms.filter((m) => m.eventId === box.id && m.round === last && m.stage === 'Caja 1' && m.status !== 'void');
      const ids = [...new Set(top.flatMap((m) => m.sides.map((s) => s.teamId ?? s.players[0]?.playerId)).filter((x): x is string => !!x))];
      const rows = pairStandings(sport, ids, top, { now: kit.now });
      const first = rows[0];
      if (first && ids.length >= 4) for (const p of peopleOf(run, first.id)) give(run, 'season_podium', p, 3, { lugar: 1, caja: 1 });
    }
    return;
  }
  // Escalera: el puesto 1 al cierre con un reto jugado; plata y bronce con 10+ peldaños y 3+ retos jugados.
  const ladder = [...kit.events.values()].find((e) => e.league_id === league.id && e.type === 'escalera');
  if (ladder) {
    const rungs = (kit.snap.ladder_rungs ?? []).filter((r) => r.event_id === ladder.id).sort((a, b) => a.position - b.position);
    const played = (id: string) =>
      (kit.snap.ladder_challenges ?? []).filter((c) => c.event_id === ladder.id && c.status === 'played' && (c.challenger === id || c.challenged === id) && inWin((c.resolved_at ?? '').slice(0, 10), w)).length;
    rungs.slice(0, 3).forEach((r, i) => {
      const n = played(r.entrant_id);
      const ok = i === 0 ? n >= 1 : rungs.length >= 10 && n >= 3;
      if (ok) for (const p of peopleOf(run, r.team_id ?? r.player_id ?? r.entrant_id)) give(run, 'season_podium', p, (3 - i) as 1 | 2 | 3, { lugar: i + 1, retos: n });
    });
    return;
  }
  // Liga: tabla de parejas o individual con los partidos oficiales a sets; noches si solo hubo americano.
  const official = ms.filter((m) => officialRacket(kit, m));
  const scheme = rulesPart(league.rules, 'table').scheme === '2-0' ? '2-0' : 'standard';
  if (official.length) {
    const pairs = official.every((m) => m.sides.every((s) => !!s.teamId));
    const table: StandingRow[] = pairs
      ? pairStandings(sport, [...new Set(official.flatMap((m) => m.sides.map((s) => s.teamId!)))], official, { scheme, now: kit.now })
      : seasonPlayerTable(official, { sport, scheme, rosterOf: kit.rosterOf, now: kit.now });
    const scheduled = (id: string) => official.filter((m) => m.status !== 'void' && m.sides.some((s) => s.teamId === id || sidePlayers(s, kit.rosterOf).includes(id))).length;
    const rows = table.filter((r) => r.played > 0 && r.played * 100 >= MINIMUMS.titleSeason.racketMatchesPct * scheduled(r.id));
    // El sorteo del final de la tabla no decide un título: empatados en todo comparten, salvo que el admin los ordene.
    const cmp = (a: StandingRow, b: StandingRow) => (sameLine(a, b) ? order(a.id) - order(b.id) : a.rank - b.rank);
    podiumFrom(run, rows, cmp, (r) => peopleOf(run, r.id), (r) => ({ n: r.points, ganados: r.won }));
    return;
  }
  const nights = ms.filter(isPointsMatch);
  if (nights.length) {
    const total = new Set(nights.map((m) => m.eventId)).size;
    const rows = seasonNightTable(nights, { now: kit.now }).filter((r) => r.nights * 2 >= total);
    podiumFrom(run, rows, (a, b) => a.rank - b.rank || order(a.id) - order(b.id), (r) => [r.id], (r) => ({ n: r.points }));
  }
}

/** Dos filas de tabla iguales en todo lo que se juega (solo las separaría el sorteo). */
const sameLine = (a: StandingRow, b: StandingRow) =>
  a.points === b.points && a.won === b.won && a.lost === b.lost && a.diff === b.diff && a.for === b.for && Number(a.extra?.setsDiff ?? 0) === Number(b.extra?.setsDiff ?? 0);

function teamSeasonPodium(run: SeasonRun, sport: TeamSportId) {
  const { kit, league, w } = run;
  const ms = leagueMatches(kit, league.id, w).filter((m) => m.status !== 'void');
  const teams = leagueTeams(kit, league.id);
  if (league.kind === 'torneo') {
    for (const place of teamKnockoutPodium(kit, ms, teams.length)) {
      const who = tournamentPlayers(kit, ms, place.teamId, sport);
      for (const p of who.players) give(run, 'season_podium', p, place.level, { equipos: teams.length }, { alt: 'torneo', ...teamCtx(kit, place.teamId), ...(who.byRoster ? { by_roster: true } : {}) }, null, [`match:${place.match.id}`]);
    }
    return;
  }
  if (teams.length < 4) return;
  const table = teamTable(kit, sport, league.id, teams, ms.filter((m) => !m.bracketKey));
  const order = adminOrder(run);
  for (const a of podiumAwards(table, (x, y) => x.rank - y.rank || order(x.id) - order(y.id), podiumLevels(teams.length))) {
    const tms = teamMatchesIn(kit, a.row.id, w);
    const who = seasonShareholders(kit, a.row.id, tms, sport, MINIMUMS.titleSeason.teamMatchesPct / 100);
    for (const p of who.players.keys()) give(run, 'season_podium', p, a.level, { lugar: a.place, n: a.row.points }, { ...teamCtx(kit, a.row.id), ...(who.byRoster ? { by_roster: true } : {}) });
  }
}

/** Como `teamShareholders`, pero sin alineación en la temporada va la plantilla anterior al último partido. */
function seasonShareholders(kit: Kit, teamId: string, ms: readonly Match[], sport: TeamSportId, share: number) {
  return teamShareholders(kit, teamId, [...ms].reverse(), sport, share);
}

/** Orden de mérito de golf: 10-8-6-5-4-3-2-1 por ronda cerrada (o torneo), con 50 %+ de las rondas jugadas. */
function golfMerit(run: SeasonRun) {
  const { kit, league, w } = run;
  const cards = golfCards(kit).filter((c) => c.card.league_id === league.id && inWin(c.date, w) && c.round.status === 'cerrada');
  const groups = groupBy(cards, (c) => c.round.tournament_id ?? c.round.event_id);
  const events = [...groups.values()].map((list) => {
    const rounds = [...new Set(list.map((c) => c.round.event_id))].sort((a, b) => (list.find((c) => c.round.event_id === a)!.round.round_no ?? 0) - (list.find((c) => c.round.event_id === b)!.round.round_no ?? 0));
    const comp = list[0].round.competition;
    const players = [...groupBy(list, (c) => c.card.player_id)].map(([id, cs]) => ({
      id,
      rounds: rounds.map((r): GolfRound | null => {
        const c = cs.find((x) => x.round.event_id === r);
        const holes = c ? cardHoles(c.card, c.round) : null;
        return c && holes ? { holes, playingHcp: c.card.playing_hcp, card: { strokes: c.card.strokes, pickedUp: c.card.picked_up } } : null;
      }),
    }));
    return { rows: golfLeaderboard(players, comp, { rounds: rounds.length }).map((r) => ({ id: r.id, rank: r.complete ? r.rank : null })) };
  });
  const merit = orderOfMerit(events, [10, 8, 6, 5, 4, 3, 2, 1]);
  return { rows: merit.filter((m) => m.events * 100 >= MINIMUMS.titleSeason.golfRoundsPct * events.length), events: events.length };
}

// ---------------------------------------------------------------------------------------------------------
// Título de categoría (boliche y natación)

/** Puntos de natación por (sexo de la prueba, grupo de edad) en pruebas individuales de encuentros oficiales. */
function swimPoints(run: SeasonRun): { rows: Map<string, Map<string, number>>; meets: Map<string, Set<string>>; total: number } {
  const { kit, league, w } = run;
  const meets = (kit.snap.swim_meets ?? []).filter((m) => m.league_id === league.id && !!m.finalized_at && inWin(kit.events.get(m.event_id)?.date, w) && isOfficialMeet(kit.events.get(m.event_id)?.type));
  const events = new Map((kit.snap.swim_events ?? []).map((e) => [e.id, e]));
  const rows = new Map<string, Map<string, number>>();
  const attended = new Map<string, Set<string>>();
  for (const meet of meets) {
    const entries = (kit.snap.swim_entries ?? []).filter((e) => e.event_id === meet.event_id);
    for (const e of entries) if (e.status !== 'dns') attended.set(e.player_id, (attended.get(e.player_id) ?? new Set()).add(meet.event_id));
    for (const [evId, list] of groupBy(entries, (e) => e.swim_event_id)) {
      const ev = events.get(evId);
      if (!ev) continue;
      const results: (SwimResult & { player: string })[] = list.map((e) => ({ entryId: e.id, swimmerId: e.player_id, player: e.player_id, gender: ev.gender, ageGroup: e.age_group, time: e.time_cs, status: e.status }));
      for (const r of placeResults(results, meet.points)) {
        if (!r.points) continue;
        const cat = `${ev.gender} ${r.ageGroup ?? ''}`.trim();
        const byP = rows.get(cat) ?? new Map<string, number>();
        byP.set(r.player, (byP.get(r.player) ?? 0) + r.points);
        rows.set(cat, byP);
      }
    }
  }
  return { rows, meets: attended, total: meets.length };
}

function categoryTitle(run: SeasonRun) {
  const { kit, league, sport, w } = run;
  const d = def('category_title');
  const minIn = paramOf(d, 'minInCategory', sport) ?? 4;
  if (sport === 'bowling') {
    const rows = bowlingFigure(kit, league.id, w, { minGames: MINIMUMS.titleSeason.bowlingGames, minDates: 1, datesPct: MINIMUMS.titleSeason.bowlingDatesPct });
    if (rows.length < (paramOf(d, 'minTotal', sport) ?? 12)) return;
    const games = leagueBowling(kit, league.id, w).filter((g) => g.official);
    const cat = (p: string) => {
      const first = games.find((g) => g.player_id === p);
      const entry = first ? (kit.snap.entries ?? []).find((e) => e.id === first.entry_id) : undefined;
      const ev = first ? kit.events.get(first.event_id) : undefined;
      if (!first || !entry || !ev) return null;
      const base = bowlingBaseline(bowlingHistory(kit, p), first.date);
      const sandbag = paramOf(d, 'sandbagPins', sport) ?? 15;
      const avg = base && entry.average < base.base - sandbag ? base.base : entry.average;
      const cuts = ev.category_cuts && ev.category_cuts.length === 3 ? (ev.category_cuts as [number, number, number]) : DEFAULT_CUTS;
      return category(avg, cuts);
    };
    for (const [c, list] of groupBy(rows, (r) => cat(r.p) ?? '-')) {
      if (c === '-' || list.length < minIn) continue;
      for (const r of topWithTies(list, byKey).winners) give(run, 'category_title', r.p, 0, { ...r.values, categoria: c }, {}, c);
    }
  } else if (sport === 'swimming') {
    const { rows, meets, total } = swimPoints(run);
    for (const [c, byP] of rows) {
      const list: Ranked[] = [...byP]
        .filter(([p]) => (meets.get(p)?.size ?? 0) * 2 >= total)
        .map(([p, n]) => ({ p, key: [n], values: { n: round1(n), categoria: c }, refs: [] }));
      if (list.length < minIn) continue;
      for (const r of topWithTies(list, byKey).winners) give(run, 'category_title', r.p, 0, r.values, {}, c.replace(/[^A-Za-z0-9_-]/g, '_'));
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Mayor progreso y revelación

function seasonMostImproved(run: SeasonRun) {
  const { kit, league, sport, w } = run;
  const d = def('season_most_improved');
  const [h1, h2] = halves(w);
  const min = paramOf(d, 'minGain', sport) ?? 0;
  const eligible: Ranked[] = [];
  if (sport === 'bowling') {
    const games = leagueBowling(kit, league.id, w);
    const dates = new Set(games.filter((g) => g.official).map((g) => g.date));
    for (const [p, list] of groupBy(games, (g) => g.player_id)) {
      const attended = new Set(list.filter((g) => g.official).map((g) => g.date)).size;
      if (list.length < (paramOf(d, 'minGames', sport) ?? 24) || attended * 2 < dates.size) continue;
      const hist = bowlingBaseline(bowlingHistory(kit, p), w.from);
      let base = hist?.base ?? null;
      if (base === null) {
        if (list.length < 30) continue;
        base = mean(list.slice(0, 12).map((g) => g.score))!;
      }
      const late = list.filter((g) => inWin(g.date, h2));
      if (!late.length) continue;
      const gain = mean(late.map((g) => g.score))! - base;
      eligible.push({ p, key: [gain], values: { valor: `+${Math.round(gain)} pinos sobre tu promedio de arranque`, n: round1(gain) }, refs: [] });
    }
  } else if (isRacketSport(sport)) {
    const per = paramOf(d, 'minPerHalf', sport) ?? 5;
    const ms = leagueMatches(kit, league.id, w);
    for (const [p, lines] of groupBy(racketLines(kit, racketPeople(kit, ms), ms, false), (l) => l.p)) {
      const a = lines.filter((l) => inWin(l.date, h1));
      const b = lines.filter((l) => inWin(l.date, h2));
      if (a.length < per || b.length < per) continue;
      const gain = (pctOf(b) ?? 0) - (pctOf(a) ?? 0);
      eligible.push({ p, key: [gain], values: { valor: `+${Math.round(gain)} puntos de juegos ganados`, n: round1(gain) }, refs: [] });
    }
  } else if (sport === 'golf') {
    const per = paramOf(d, 'minPerHalf', sport) ?? 3;
    const cards = golfCards(kit).filter((c) => c.card.league_id === league.id && inWin(c.date, w) && c.g2 && c.holes === 18 && c.diff !== null);
    for (const [p, list] of groupBy(cards, (c) => c.card.player_id)) {
      const a = list.filter((c) => inWin(c.date, h1));
      const b = list.filter((c) => inWin(c.date, h2));
      if (a.length < per || b.length < per) continue;
      const gain = mean(a.map((c) => c.diff!))! - mean(b.map((c) => c.diff!))!;
      eligible.push({ p, key: [gain], values: { valor: `${round1(gain)} golpes menos`, n: round1(gain) }, refs: [] });
    }
  } else if (sport === 'swimming') {
    const minPb = paramOf(d, 'minPersonalBests', sport) ?? 3;
    const swimmers = new Set((kit.snap.swim_entries ?? []).filter((e) => e.league_id === league.id).map((e) => e.player_id));
    for (const p of swimmers) {
      const steps = leagueBestSteps(kit, p, league.id, w);
      if (steps.length) eligible.push({ p, key: [steps.length, steps.reduce((n, s) => n + s.pct, 0)], values: { valor: `${steps.length} marcas personales`, n: steps.length }, refs: [] });
    }
    if (eligible.length < (paramOf(d, 'minEligible', sport) ?? 6)) return;
    for (const r of topWithTies(eligible.filter((x) => x.key[0] >= minPb), byKey).winners) give(run, 'season_most_improved', r.p, 0, r.values);
    return;
  } else return;
  if (eligible.length < (paramOf(d, 'minEligible', sport) ?? 6)) return;
  for (const r of topWithTies(eligible.filter((x) => x.key[0] >= min), byKey).winners) give(run, 'season_most_improved', r.p, 0, r.values);
}

/** La métrica del título por jugador (sin el mínimo del podio), con 50 %+ de asistencia: la usa la revelación. */
function titleMetric(run: SeasonRun): Ranked[] {
  const { kit, league, sport, w } = run;
  if (sport === 'bowling') return bowlingFigure(kit, league.id, w, { minGames: 1, minDates: 1, datesPct: 50 });
  if (isRacketSport(sport)) {
    const ms = leagueMatches(kit, league.id, w).filter((m) => officialRacket(kit, m));
    const table = seasonPlayerTable(ms, { sport, rosterOf: kit.rosterOf, now: kit.now });
    const scheduled = (p: string) => ms.filter((m) => m.status !== 'void' && m.sides.some((s) => sidePlayers(s, kit.rosterOf).includes(p))).length;
    return table.filter((r) => r.played * 2 >= scheduled(r.id)).map((r) => ({ p: r.id, key: [r.points, r.won, Number(r.extra?.setsDiff ?? 0), r.diff], values: { n: r.points }, refs: [] }));
  }
  if (sport === 'golf') return golfMerit(run).rows.map((r) => ({ p: r.id, key: [r.points, r.wins], values: { n: r.points }, refs: [] }));
  if (sport === 'swimming') {
    const { rows, meets, total } = swimPoints(run);
    const sum = new Map<string, number>();
    for (const byP of rows.values()) for (const [p, n] of byP) sum.set(p, (sum.get(p) ?? 0) + n);
    return [...sum].filter(([p]) => (meets.get(p)?.size ?? 0) * 2 >= total).map(([p, n]) => ({ p, key: [n], values: { n: round1(n) }, refs: [] }));
  }
  return [];
}

function seasonRookie(run: SeasonRun) {
  const { kit, sport, w } = run;
  const d = def('season_rookie');
  if (d.sports === 'all' || !d.sports.includes(sport)) return;
  const acts = kit.activity().filter((a) => a.sport === sport && !a.roster);
  const firstOf = (p: string) => {
    const mine = new Set(selfPlayers(kit, p));
    return acts.filter((a) => mine.has(a.player_id)).reduce<string | null>((m, a) => (m === null || a.date < m ? a.date : m), null);
  };
  const already = (p: string) => {
    const mine = new Set(selfPlayers(kit, p));
    return (kit.snap.awards ?? []).some((a) => a.badge_key === 'season_rookie' && a.sport === sport && a.status !== 'revocada' && !!a.player_id && mine.has(a.player_id));
  };
  const rookies = titleMetric(run).filter((r) => inWin(firstOf(r.p), w) && !already(r.p));
  if (rookies.length < (paramOf(d, 'minRookies', sport) ?? 3)) return;
  for (const r of topWithTies(rookies, byKey).winners) give(run, 'season_rookie', r.p, 0, { ...r.values });
}

// ---------------------------------------------------------------------------------------------------------
// Asistencia de temporada

function seasonAttendance(run: SeasonRun) {
  const { kit, league, sport, w } = run;
  const d = def('season_attendance');
  const minDates = paramOf(d, 'minDates', sport) ?? 6;
  const share = paramOf(d, 'lineupShare', sport) ?? 0.8;
  const firsts = new Map<string, string>();
  for (const a of kit.activity()) {
    if (a.league_id !== league.id || a.roster || !inWin(a.date, w)) continue;
    const f = firsts.get(a.player_id);
    if (!f || a.date < f) firsts.set(a.player_id, a.date);
  }
  // Natación: los encuentros donde estaba inscrito cuentan desde su primera inscripción.
  if (sport === 'swimming') {
    for (const e of kit.snap.swim_entries ?? []) {
      const date = kit.events.get(e.event_id)?.date;
      if (e.league_id !== league.id || !inWin(date, w)) continue;
      const f = firsts.get(e.player_id);
      if (!f || date < f) firsts.set(e.player_id, date);
    }
  }
  for (const [p, from] of firsts) {
    const a = attendanceIn(kit, league.id, sport, { from, to: w.to }, isTeamSport(sport) ? { lineupShare: share } : {}).get(p);
    if (!a || a.dates < minDates) continue;
    const pct = Math.floor((a.present * 100) / a.dates);
    const level = levelFor(d, pct, sport);
    if (level !== null) give(run, 'season_attendance', p, level as 1 | 2 | 3, { n: a.present, total: a.dates, pct }, a.teamId ? teamCtx(kit, a.teamId) : {}, null, a.refs.slice(0, 20));
  }
}

// ---------------------------------------------------------------------------------------------------------
// Equipos: goleador, portero, juego limpio y brazalete

function seasonScorers(run: SeasonRun, sport: TeamSportId) {
  const { kit, league, w } = run;
  const teams = leagueTeams(kit, league.id);
  const ms = leagueMatches(kit, league.id, w).filter((m) => isT1(m, kit.now));
  const lines = statLines(kit, ms, sport);
  const teamGames = new Map(teams.map((t) => [t, ms.filter((m) => m.sides.some((s) => s.teamId === t)).length]));
  const teamOfLine = (l: { m: Match; side: 1 | 2 }) => l.m.sides[l.side - 1].teamId;
  const ts = def('season_top_scorer');
  if (teams.length >= (paramOf(ts, 'minTeams', sport) ?? 4)) {
    const rows: Ranked[] = [];
    for (const [p, ls] of groupBy(lines, (l) => l.p)) {
      const team = teamOfLine(ls[ls.length - 1]);
      const games = team ? (teamGames.get(team) ?? 0) : 0;
      if (!games || ls.length < (paramOf(ts, 'share', sport) ?? 0.5) * games) continue;
      const total = ls.reduce((n, l) => n + l.goals, 0);
      if (sport === 'basketball') {
        if (ls.length < (paramOf(ts, 'minMatches', sport) ?? 6)) continue;
        rows.push({ p, key: [total / ls.length], values: { n: round1(total / ls.length), partidos: ls.length }, refs: [] });
      } else if (total >= (paramOf(ts, 'minGoals', sport) ?? 3)) rows.push({ p, key: [total], values: { n: total, partidos: ls.length }, refs: [] });
    }
    for (const r of topWithTies(rows, byKey).winners) give(run, 'season_top_scorer', r.p, 0, r.values);
  }
  if (sport === 'basketball') return;
  const bk = def('season_best_keeper');
  if (teams.length < (paramOf(bk, 'minTeams', sport) ?? 4)) return;
  const keepers: Ranked[] = [];
  for (const [p, ls] of groupBy(
    lines.filter((l) => l.keeper),
    (l) => l.p,
  )) {
    const team = teamOfLine(ls[ls.length - 1]);
    const games = team ? (teamGames.get(team) ?? 0) : 0;
    if (!games || ls.length < (paramOf(bk, 'share', sport) ?? 0.5) * games || ls.length < (paramOf(bk, 'minMatches', sport) ?? 6)) continue;
    const conceded = ls.reduce((n, l) => n + l.conceded, 0);
    keepers.push({ p, key: [-conceded / ls.length], values: { n: round1(conceded / ls.length), partidos: ls.length }, refs: [] });
  }
  for (const r of topWithTies(keepers, byKey).winners) give(run, 'season_best_keeper', r.p, 0, r.values);
}

/** Faltas técnicas, antideportivas y descalificantes por jugador desde el acta del modo cancha (`matches.state`). */
export function basketballBadFouls(state: unknown): Map<string, number> | null {
  const s = state && typeof state === 'object' ? (state as Record<string, unknown>) : null;
  if (!s || (!Array.isArray(s.log) && !s.base)) return null;
  const out = new Map<string, number>();
  const add = (p: unknown, n: number) => {
    if (typeof p === 'string' && p && n > 0) out.set(p, (out.get(p) ?? 0) + n);
  };
  const base = s.base && typeof s.base === 'object' ? (s.base as { players?: unknown }) : null;
  if (Array.isArray(base?.players)) {
    for (const side of base.players as unknown[]) {
      if (!side || typeof side !== 'object') continue;
      for (const [id, raw] of Object.entries(side as Record<string, unknown>)) {
        const pl = raw as { technicals?: number; unsportsmanlike?: number; disqualifying?: number };
        add(id, (pl.technicals ?? 0) + (pl.unsportsmanlike ?? 0) + (pl.disqualifying ?? 0));
      }
    }
  }
  for (const ev of Array.isArray(s.log) ? (s.log as { type?: string; kind?: string; player?: string }[]) : []) {
    if (ev?.type === 'foul' && (ev.kind === 'technical' || ev.kind === 'unsportsmanlike' || ev.kind === 'disqualifying')) add(ev.player, 1);
  }
  return out;
}

/** Las actas de baloncesto de la foto (por partido). */
function basketballStates(kit: Kit): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const m of kit.snap.matches ?? []) {
    const fouls = basketballBadFouls(m.state);
    if (fouls) out.set(m.id, fouls);
  }
  return out;
}

function fairPlay(run: SeasonRun) {
  const { kit, league, sport, w } = run;
  const d = def('fair_play');
  if (d.sports === 'all' || !d.sports.includes(sport)) return;
  const min = paramOf(d, 'minMatches', sport) ?? 8;
  if (sport === 'swimming') {
    const meets = new Map((kit.snap.swim_meets ?? []).map((m) => [m.event_id, m]));
    const entries = (kit.snap.swim_entries ?? []).filter((e) => e.league_id === league.id && e.status !== 'dns' && !!meets.get(e.event_id)?.finalized_at && inWin(kit.events.get(e.event_id)?.date, w));
    for (const [p, list] of groupBy(entries, (e) => e.player_id)) {
      if (list.length >= min && list.every((e) => e.status === 'ok')) give(run, 'fair_play', p, 0, { n: list.length });
    }
    return;
  }
  const ms = leagueMatches(kit, league.id, w).filter((m) => isT1(m, kit.now));
  if (sport === 'basketball') {
    const states = basketballStates(kit);
    const withState = ms.filter((m) => states.has(m.id));
    if (![...withState].some((m) => [...states.get(m.id)!.values()].some((n) => n > 0))) return;
    const count = new Map<string, { n: number; bad: number }>();
    for (const m of withState) {
      const fouls = states.get(m.id)!;
      for (const p of appearances(m, 'basketball').keys()) {
        const c = count.get(p) ?? { n: 0, bad: 0 };
        c.n++;
        c.bad += fouls.get(p) ?? 0;
        count.set(p, c);
      }
    }
    for (const [p, c] of count) if (c.n >= min && c.bad === 0) give(run, 'fair_play', p, 0, { n: c.n });
    return;
  }
  // Fútbol y sala: 0 rojas, como mucho 1 amarilla, sin suspensiones, en una liga que anota tarjetas.
  const cards = ms.some((m) => footballLinesAll(m).some((l) => l.yellows > 0 || !!l.red));
  if (!cards) return;
  const sanctioned = new Set((kit.snap.sanctions ?? []).filter((s) => s.league_id === league.id && inWin((s.created_at ?? '').slice(0, 10), w)).map((s) => s.player_id));
  const per = new Map<string, { n: number; yellows: number; reds: number }>();
  for (const m of ms) {
    for (const l of footballLinesAll(m)) {
      if (!l.played) continue;
      const c = per.get(l.playerId) ?? { n: 0, yellows: 0, reds: 0 };
      c.n++;
      c.yellows += l.yellows;
      c.reds += l.red ? 1 : 0;
      per.set(l.playerId, c);
    }
  }
  const maxY = paramOf(d, 'maxYellows', sport) ?? 1;
  for (const [p, c] of per) if (c.n >= min && c.reds === 0 && c.yellows <= maxY && !sanctioned.has(p)) give(run, 'fair_play', p, 0, { n: c.n, amarillas: c.yellows });
}

/** Todas las líneas de fútbol o sala de un partido con estadísticas (también las tarjetas desde el banco). */
const footballLinesAll = (m: Match) => (typeof m.score?.lines === 'string' ? decodeFootballLines(m.score.lines) : []);

function fairPlayTeam(run: SeasonRun, sport: TeamSportId) {
  const { kit, league, w } = run;
  const d = def('fair_play_team');
  const teams = leagueTeams(kit, league.id);
  const states = sport === 'basketball' ? basketballStates(kit) : null;
  const rows: Ranked[] = [];
  let anyCard = false;
  for (const t of teams) {
    const ms = teamMatchesIn(kit, t, w).filter((m) => (states ? states.has(m.id) : typeof m.score?.lines === 'string' && !!m.score.lines));
    if (ms.length < (paramOf(d, 'minMatches', sport) ?? 8)) continue;
    let bad = 0;
    for (const m of ms) {
      const side = sideOfTeam(m, t);
      if (states) {
        const fouls = states.get(m.id)!;
        for (const [p, s] of appearances(m, sport)) if (s === side) bad += fouls.get(p) ?? 0;
      } else {
        for (const l of footballLinesAll(m)) {
          if (l.side !== side) continue;
          bad += l.yellows + (l.red ? (paramOf(d, 'redWeight', sport) ?? 3) : 0);
        }
      }
    }
    if (bad > 0) anyCard = true;
    rows.push({ p: t, key: [-bad / ms.length], values: { n: round1(bad / ms.length), partidos: ms.length }, refs: [] });
  }
  if (!anyCard || rows.length < (paramOf(d, 'minTeams', sport) ?? 4)) return;
  for (const r of topWithTies(rows, byKey).winners) {
    const who = teamShareholders(kit, r.p, teamMatchesIn(kit, r.p, w), sport, paramOf(d, 'share', sport) ?? 0.4);
    for (const p of who.players.keys()) give(run, 'fair_play_team', p, 0, r.values, { ...teamCtx(kit, r.p), ...(who.byRoster ? { by_roster: true } : {}) });
  }
}

function captainBand(run: SeasonRun, sport: TeamSportId) {
  const { kit, league, w } = run;
  const d = def('captain_band');
  for (const t of leagueTeams(kit, league.id)) {
    const ms = teamMatchesIn(kit, t, w);
    const walkovers = leagueMatches(kit, league.id, w).filter((m) => m.status === 'walkover' && isFinal(m, kit.now) && m.sides[(m.walkoverSide ?? 0) - 1]?.teamId === t).length;
    if (ms.length < (paramOf(d, 'minMatches', sport) ?? 8) || walkovers > (paramOf(d, 'maxWalkovers', sport) ?? 1)) continue;
    const leads = (kit.snap.team_players ?? []).filter((tp) => tp.team_id === t && (tp.role === 'captain' || tp.role === 'delegate'));
    for (const tp of leads) give(run, 'captain_band', tp.player_id, 0, { n: ms.length }, teamCtx(kit, t));
  }
}

// ---------------------------------------------------------------------------------------------------------
// Raqueta: palabra de honor

function honorWord(run: SeasonRun) {
  const { kit, league, sport, w } = run;
  if (!isRacketSport(sport)) return;
  const d = def('honor_word');
  const ms = leagueMatches(kit, league.id, w).filter((m) => officialRacket(kit, m));
  for (const p of racketPeople(kit, ms)) {
    const mine = ms.filter((m) => playerSide(m, p, kit.rosterOf));
    const ctxOf = (m: Match) => ({ now: kit.now, userOf: kit.userOf, rosterOf: kit.rosterOf, staff: kit.staff(m.leagueId) });
    const played = mine.filter((m) => isR1(m, p, ctxOf(m)));
    if (played.length < (paramOf(d, 'minMatches', sport) ?? 8)) continue;
    const me = kit.userOf(p);
    const lost = mine.some((m) => {
      const side = playerSide(m, p, kit.rosterOf)!;
      if (m.status === 'walkover' && m.walkoverSide === side) return true;
      const h = m.history ?? [];
      const myAccounts = new Set(sidePlayers(m.sides[side - 1], kit.rosterOf).map(kit.userOf).filter((u): u is string => !!u));
      // Un resultado de su lado que el admin corrigió al resolver el reclamo.
      const proposedByUs = m.proposedSide === side || h.some((x) => x.a === 'finish' && !!x.by && myAccounts.has(x.by));
      if (proposedByUs && h.some((x) => x.a === 'resolve' && 'score' in x)) return true;
      // Un reclamo de su cuenta que se resolvió sin cambio.
      const disputed = h.findIndex((x) => x.a === 'dispute' && !!me && x.by === me);
      return disputed >= 0 && h.slice(disputed + 1).some((x) => x.a === 'resolve' && !('score' in x));
    });
    if (!lost) give(run, 'honor_word', p, 0, { n: played.length });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Staff: temporada organizada y cuerpo técnico

/** Fechas oficiales de la temporada: eventos de boliche, jornadas con 2+ partidos finales, rondas y encuentros. */
export function seasonDates(kit: Kit, league: SnapLeague, w: Window): number {
  const sport = league.sport;
  if (sport === 'bowling') return new Set(leagueBowling(kit, league.id, w).map((g) => g.event_id)).size;
  if (sport === 'golf') return (kit.snap.golf_rounds ?? []).filter((r) => r.league_id === league.id && r.status === 'cerrada' && inWin(kit.events.get(r.event_id)?.date, w)).length;
  if (sport === 'swimming') return (kit.snap.swim_meets ?? []).filter((m) => m.league_id === league.id && !!m.finalized_at && inWin(kit.events.get(m.event_id)?.date, w)).length;
  const finals = leagueMatches(kit, league.id, w).filter((m) => isFinal(m, kit.now) && m.status !== 'void');
  return [...groupBy(finals, (m) => `${m.eventId ?? ''}|${m.round ?? matchDay(kit, m)}`).values()].filter((g) => g.length >= 2).length;
}

export const seasonStaff: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const found = seasonOfJob(kit);
  if (!found) return [];
  const { season, league } = found;
  const w = { from: season.starts_on, to: season.ends_on };
  const ctx = { ...leagueCtx(kit, league.id), season: { id: season.id, name: season.name }, window: [w.from, w.to] as [string, string] };
  const out: BadgeDecision[] = [];

  // Temporada organizada: 8+ fechas y 8+ jugadores activos (4+ cuentas); al dueño y a los admins con 5+ días de
  // servicio en la temporada.
  const so = def('season_organizer');
  const acts = kit.activity().filter((a) => a.league_id === league.id && !a.roster && inWin(a.date, w));
  const players = new Set(acts.map((a) => a.player_id)).size;
  const accounts = new Set(acts.map((a) => a.user_id).filter((u): u is string => !!u)).size;
  const dates = seasonDates(kit, league, w);
  if (dates >= (paramOf(so, 'minDates') ?? 8) && players >= (paramOf(so, 'minPlayers') ?? 8) && accounts >= (paramOf(so, 'minAccounts') ?? 4)) {
    const serviceDays = (u: string) => new Set((kit.snap.service ?? []).filter((s) => s.league_id === league.id && (s.user_id ?? job.user_id) === u && inWin(s.date, w)).map((s) => s.date)).size;
    for (const u of kit.staff(league.id)) {
      if (serviceDays(u) >= (paramOf(so, 'minServiceDays') ?? 5)) {
        out.push(awardOf(so, userHolderOf(u), 'all', 0, periodKey.season(season.id), 'firme', [], { ...ctx, values: { fechas: dates, jugadores: players } }));
      }
    }
  }

  // Cuerpo técnico: el entrenador de un club con 5+ nadadores que nadaron (no `dns`) en encuentros finalizados.
  if (league.sport === 'swimming') {
    const cb = def('coach_board');
    const meets = new Map((kit.snap.swim_meets ?? []).map((m) => [m.event_id, m]));
    for (const club of kit.snap.swim_clubs ?? []) {
      const coach = club.coach_id ? kit.userOf(club.coach_id) : null;
      if (club.league_id !== league.id || !coach) continue;
      const swimmers = new Set(
        (kit.snap.swim_entries ?? []).filter((e) => e.club_id === club.id && e.status !== 'dns' && !!meets.get(e.event_id)?.finalized_at && inWin(kit.events.get(e.event_id)?.date, w)).map((e) => e.player_id),
      );
      if (swimmers.size >= (paramOf(cb, 'minSwimmers', 'swimming') ?? 5)) {
        out.push(awardOf(cb, userHolderOf(coach), 'swimming', 0, periodKey.season(season.id), 'firme', [], { ...ctx, values: { n: swimmers.size, club: club.name } }));
      }
    }
  }
  return out;
};
