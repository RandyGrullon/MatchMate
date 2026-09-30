/**
 * Evaluadores de raqueta (pádel, tenis, pickleball y ping pong; docs/insignias.md §2.3): hitos y marcas de carrera
 * (`racket_career`), marcas de un partido (`racket_match`), la figura de la noche de americano o mexicano
 * (`racket_night`) y el podio de un torneo por categorías (`event_podium`, la parte de raqueta). Los partidos se
 * leen con los helpers de la app (tablas, cuadro, noches) y se validan con R1 y R2 (rules/racket.ts).
 */
import { badgeDef, badgesOfEvaluator, paramOf } from '../catalog';
import { CAPS, capPerDay, capPerRivalMonth, podiumLevels, topWithTies } from '../rules/gates';
import { monthOf, periodKey } from '../rules/periods';
import { isR1, r2Reason, readSets, wonBy, type MatchContext } from '../rules/racket';
import { appearances } from '../rules/team';
import { isFinal, type Match } from '../../lib/data/matchCore';
import { nightRounds, nightTable, parseNightConfig, isNightType } from '../../pages/sports/racket/logic/night';
import { entrantKey, isPointsMatch, isSetsMatch, matchRules, matchTime, playerSide, sidePlayers } from '../../pages/sports/racket/logic/results';
import { categoryBracket, matchAt, parseTourneyConfig, winnerId, type TourneyCategory } from '../../pages/sports/racket/logic/tourney';
import { isGameSportRules, other, type RacketSport } from '../../sports/racket';
import type { Side } from '../../sports/types';
import type { BadgeDecision, BadgeDef, BadgeHolder, BadgeJob } from '../types';
import type { BadgeSnapshot } from '../snapshot';
import {
  accountPlayers,
  accountTargets,
  awardOf,
  eventCtx,
  isRacketSport,
  isTeamSport,
  kitOf,
  leagueCtx,
  levelAwards,
  matchDay,
  payloadPlayers,
  periodHolders,
  playerHolderOf,
  progressOf,
  RACKET_SPORTS,
  realOn,
  refId,
  revokeStale,
  statusFor,
  type AccountTarget,
  type Evaluator,
  type Kit,
  type Step,
} from './kit';

const def = (key: string): BadgeDef => badgeDef(key)!;

/** Contexto R1/R2 de un partido (el staff es el de su liga). */
export const matchCtx = (kit: Kit, m: Match): MatchContext => ({ now: kit.now, userOf: kit.userOf, rosterOf: kit.rosterOf, staff: kit.staff(m.leagueId) });

/** Los jugadores de un partido (los del partido o, si no hay, la plantilla de la pareja). */
export const matchPeople = (kit: Kit, m: Match): string[] => [...sidePlayers(m.sides[0], kit.rosterOf), ...sidePlayers(m.sides[1], kit.rosterOf)];

/**
 * Jugadores que evalúa un trabajo de resultado: los que manda SQL (`snapshot.targets`, y entonces solo esos); si no,
 * los del partido del ref (en equipos, también los que salen en el acta), los de un borrado (`payload.players`), los
 * de la cuenta que se vinculó y, en el historial, todos los de la liga.
 */
export function jobPlayers(kit: Kit): string[] {
  if (kit.snap.targets) return [...new Set(kit.snap.targets)];
  const out = new Set<string>(payloadPlayers(kit.job));
  const pid = refId(kit.job.ref, 'player');
  if (pid) out.add(pid);
  const mid = refId(kit.job.ref, 'match');
  const m = mid ? kit.matches.find((x) => x.id === mid) : undefined;
  if (m) matchPeople(kit, m).forEach((p) => out.add(p));
  const sport = m ? kit.sportOf(m.leagueId) : null;
  if (m && isTeamSport(sport)) for (const p of appearances(m, sport).keys()) out.add(p);
  if (kit.job.kind === 'vinculo' && kit.job.user_id) accountPlayers(kit, kit.job.user_id).forEach((p) => out.add(p));
  if (kit.job.kind === 'historial' && kit.job.league_id) for (const p of kit.players.values()) if (p.league_id === kit.job.league_id) out.add(p.id);
  return [...out];
}

/** Un partido de un dueño: el partido, su jugador en él, su lado y la fecha local. */
export interface Played {
  m: Match;
  p: string;
  side: Side;
  date: string;
  ctx: MatchContext;
}

/** Los partidos de un dueño en un deporte, en ligas reales ese mes, en orden (`matchTime`). */
export function playedBy(kit: Kit, t: Pick<AccountTarget, 'players' | 'user'>, sport: RacketSport): Played[] {
  const mine = new Set(t.players);
  const out: Played[] = [];
  for (const m of kit.matches) {
    if (kit.sportOf(m.leagueId) !== sport) continue;
    const date = matchDay(kit, m);
    if (!date || !realOn(kit, m.leagueId, date, t)) continue;
    for (const p of mine) {
      const side = playerSide(m, p, kit.rosterOf);
      if (side) {
        out.push({ m, p, side, date, ctx: matchCtx(kit, m) });
        break;
      }
    }
  }
  return out.sort((a, b) => matchTime(a.m) - matchTime(b.m) || (a.m.id < b.m.id ? -1 : 1));
}

/** R1 que suma para el dueño (del jugador verificado solo, lo que confirmó una cuenta del otro lado). */
const countsR1 = (kit: Kit, x: Played) => isR1(x.m, x.p, x.ctx) && (!kit.verifiedOnly(x.p) || r2Reason(x.m, x.p, x.ctx) === 'rival');
const countsR2 = (kit: Kit, x: Played) => {
  const r = r2Reason(x.m, x.p, x.ctx);
  return r !== null && (!kit.verifiedOnly(x.p) || r === 'rival');
};
const ref = (m: Pick<Match, 'id'>) => `match:${m.id}`;

/** Lado ganador de un partido de puntos (americano, mexicano): el que sumó más; null en empate. */
function pointsWinner(m: Match): Side | null {
  const s = m.score?.sides;
  if (!Array.isArray(s) || s.length !== 2) return null;
  return s[0] > s[1] ? 1 : s[1] > s[0] ? 2 : null;
}

// ---------------------------------------------------------------------------------------------------------
// Carrera: partidos, victorias, racha, tie-breaks, compañeros y escalera

export function racketCareerFor(kit: Kit, t: AccountTarget, sport: RacketSport): BadgeDecision[] {
  const holder = t.holder;
  const list = playedBy(kit, t, sport);
  const r1 = list.filter((x) => countsR1(kit, x));
  const r2 = r1.filter((x) => countsR2(kit, x));
  const out: BadgeDecision[] = [];
  const add = (key: string, steps: Step[], value: number, opts: Parameters<typeof levelAwards>[6] = {}) => {
    const d = def(key);
    out.push(...levelAwards(kit, d, holder, sport, sport, steps, opts), progressOf(d, holder, sport, sport, value));
  };
  const counter = (xs: readonly Played[]): Step[] => xs.map((x, i) => ({ n: i + 1, ref: ref(x.m), date: x.date }));

  // Partidos jugados: R1 (americano incluido), máximo 4 por día.
  const matches = capPerDay(r1, (x) => x.date, paramOf(def('racket_matches'), 'maxPerDay', sport) ?? CAPS.racketMatchesPerDay);
  add('racket_matches', counter(matches), matches.length);

  // Victorias R2 a sets, máximo 3 por mes contra el mismo rival.
  const wins = r2.filter((x) => isSetsMatch(x.m) && wonBy(x.m, x.p, kit.rosterOf));
  const capped = capPerRivalMonth(
    wins,
    (x) => entrantKey(x.m.sides[other(x.side) - 1]),
    (x) => monthOf(x.date),
    paramOf(def('racket_wins'), 'maxPerRivalMonth', sport) ?? CAPS.racketWinsPerRivalMonth,
  );
  add('racket_wins', counter(capped), capped.length);

  // Racha: victorias R2 seguidas; una derrota R1 la corta; W.O. y anulados ni suman ni cortan.
  const streak: Step[] = [];
  let run: string[] = [];
  let best = 0;
  for (const x of r1.filter((y) => isSetsMatch(y.m))) {
    const won = wonBy(x.m, x.p, kit.rosterOf);
    if (!won) {
      run = [];
      continue;
    }
    if (!countsR2(kit, x)) continue;
    run.push(entrantKey(x.m.sides[other(x.side) - 1]));
    best = Math.max(best, run.length);
    streak.push({ n: run.length, ref: ref(x.m), date: x.date, values: { rivales: new Set(run).size } });
  }
  add('racket_win_streak', streak, best, { actual: true, req: (_l, s, req) => Number(s.values?.rivales ?? 0) >= (req.rivals ?? 0) });

  // Tie-breaks ganados (pickleball y ping pong: juegos que se fueron más allá del tope, 12-10 o más a 11).
  const tb: Step[] = [];
  let tbs = 0;
  for (const x of r2.filter((y) => isSetsMatch(y.m))) {
    const read = readSets(x.m, sport);
    if (!read) continue;
    const r = read.rules;
    const won = read.sets.filter((s) => s.winner === x.side && (isGameSportRules(r) ? s.games[x.side - 1] > r.gameTo : s.tiebreak || s.matchTiebreak)).length;
    if (!won) continue;
    tbs += won;
    tb.push({ n: tbs, ref: ref(x.m), date: x.date });
  }
  add('racket_tiebreaks', tb, tbs);

  // Buena química: compañeros distintos (una cuenta cuenta una vez) con una victoria R2 juntos, solo en dobles.
  const partners = new Set<string>();
  const ps: Step[] = [];
  for (const x of r2) {
    const doubles = sport === 'padel' || !!matchRules(sport, x.m.rules)?.doubles;
    const won = isPointsMatch(x.m) ? pointsWinner(x.m) === x.side : isSetsMatch(x.m) && wonBy(x.m, x.p, kit.rosterOf);
    if (!doubles || !won) continue;
    const before = partners.size;
    for (const q of sidePlayers(x.m.sides[x.side - 1], kit.rosterOf)) {
      if (t.players.includes(q)) continue;
      partners.add(kit.userOf(q) ?? q);
    }
    if (partners.size > before) ps.push({ n: partners.size, ref: ref(x.m), date: x.date });
  }
  add('racket_partners', ps, partners.size);

  // Escalando: retos jugados que ganó como retador, con partido R2.
  const climbs: Step[] = [];
  const byMatch = new Map(r2.map((x) => [x.m.id, x]));
  const challenges = [...(kit.snap.ladder_challenges ?? [])]
    .filter((c) => c.status === 'played' && !!c.winner && c.winner === c.challenger && !!c.match_id)
    .sort((a, b) => (a.resolved_at ?? '').localeCompare(b.resolved_at ?? ''));
  for (const c of challenges) {
    const x = byMatch.get(c.match_id!);
    if (!x || entrantKey(x.m.sides[x.side - 1]) !== c.challenger) continue;
    climbs.push({ n: climbs.length + 1, ref: ref(x.m), date: x.date });
  }
  add('racket_ladder_climber', climbs, climbs.length);

  out.push(...revokeStale(kit, out, { holders: [holder], keys: badgesOfEvaluator('racket_career').map((d) => d.key), sport, period: (k) => k === '-' }));
  return out;
}

/** Los dueños de cuenta de un trabajo de resultado, por deporte de raqueta. */
function racketTargets(kit: Kit): { sport: RacketSport; t: AccountTarget }[] {
  const out: { sport: RacketSport; t: AccountTarget }[] = [];
  const players = jobPlayers(kit);
  for (const sport of RACKET_SPORTS) {
    const mine = players.filter((p) => {
      const pl = kit.players.get(p);
      return !!pl && kit.sportOf(pl.league_id) === sport;
    });
    for (const t of accountTargets(kit, mine, [sport])) out.push({ sport, t });
  }
  return out;
}

export const racketCareer: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  return racketTargets(kit).flatMap(({ sport, t }) => racketCareerFor(kit, t, sport));
};

// ---------------------------------------------------------------------------------------------------------
// Marcas de un partido: rosco, remontada y batacazo

/** % de victorias R2 a sets de un jugador en su liga antes de un momento, y cuántos partidos. */
function recordBefore(kit: Kit, leagueId: string, playerId: string, before: number): { played: number; pct: number } {
  let played = 0;
  let won = 0;
  for (const m of kit.matches) {
    if (m.leagueId !== leagueId || !isSetsMatch(m) || matchTime(m) >= before) continue;
    if (!r2Reason(m, playerId, matchCtx(kit, m))) continue;
    played++;
    if (wonBy(m, playerId, kit.rosterOf)) won++;
  }
  return { played, pct: played ? (won / played) * 100 : 0 };
}

/** Las marcas de un partido para un jugador (ya R2 y en liga real). */
function matchMarks(kit: Kit, m: Match, p: string, side: Side, sport: RacketSport): { key: string; values?: Record<string, number> }[] {
  const out: { key: string; values?: Record<string, number> }[] = [];
  if (!isSetsMatch(m)) return out;
  const read = readSets(m, sport);
  const won = wonBy(m, p, kit.rosterOf);
  if (read) {
    const r = read.rules;
    // Rosco (Zapatero en ping pong): un set (o un juego de pickleball o ping pong) terminado que su lado ganó sin ceder
    // nada; el partido puede perderse.
    const bagel = read.sets.some((s) => {
      const [mine, theirs] = [s.games[side - 1], s.games[2 - side]];
      if (s.winner !== side || s.matchTiebreak || theirs !== 0) return false;
      return isGameSportRules(r) ? mine >= r.gameTo : mine === r.gamesPerSet;
    });
    if (bagel) out.push({ key: 'racket_bagel' });
    // Remontada: perdió los primeros `down` sets o juegos (1; en ping pong 2, o sea 0-2) y ganó el partido jugado hasta
    // el final. Hace falta un partido donde se pueda remontar: al mejor de 3 o más (de 5 o más en ping pong).
    const down = paramOf(def('racket_comeback'), 'down', sport) ?? 1;
    const behind = read.sets.slice(0, down);
    if (won && r.bestOf >= 2 * down + 1 && !read.retired && read.sets.length > down && behind.every((s) => s.winner !== side)) out.push({ key: 'racket_comeback' });
  }
  if (won) {
    const d = def('racket_upset');
    const at = matchTime(m);
    const me = recordBefore(kit, m.leagueId, p, at);
    const rivals = sidePlayers(m.sides[2 - side], kit.rosterOf).map((q) => recordBefore(kit, m.leagueId, q, at));
    if (rivals.length) {
      const rPlayed = rivals.reduce((n, r) => n + r.played, 0) / rivals.length;
      const rPct = rivals.reduce((n, r) => n + r.pct, 0) / rivals.length;
      const minRival = paramOf(d, 'minRivalMatches', sport) ?? 10;
      const minOwn = paramOf(d, 'minOwnMatches', sport) ?? 5;
      const gap = paramOf(d, 'pctGap', sport) ?? 25;
      if (rPlayed >= minRival && me.played >= minOwn && rPct - me.pct >= gap) out.push({ key: 'racket_upset', values: { gap: Math.round(rPct - me.pct) } });
    }
  }
  return out;
}

export const racketMatch: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const keys = badgesOfEvaluator('racket_match').map((d) => d.key);
  const mid = refId(job.ref, 'match');
  const list = mid
    ? kit.matches.filter((m) => m.id === mid)
    : job.kind === 'historial' && job.league_id
      ? kit.matches.filter((m) => m.leagueId === job.league_id)
      : [];
  const out: BadgeDecision[] = [];
  for (const m of list) {
    const sport = kit.sportOf(m.leagueId);
    if (!isRacketSport(sport)) continue;
    const date = matchDay(kit, m);
    const given: BadgeDecision[] = [];
    const holders: BadgeHolder[] = [];
    for (const side of [1, 2] as const) {
      for (const p of sidePlayers(m.sides[side - 1], kit.rosterOf)) {
        holders.push(playerHolderOf(p, m.leagueId));
        const ctx = matchCtx(kit, m);
        if (!date || !realOn(kit, m.leagueId, date) || !r2Reason(m, p, ctx)) continue;
        for (const mark of matchMarks(kit, m, p, side, sport)) {
          given.push(
            awardOf(def(mark.key), playerHolderOf(p, m.leagueId), sport, 0, periodKey.match(m.id), statusFor(kit, date), [ref(m)], {
              ...leagueCtx(kit, m.leagueId),
              ...eventCtx(kit, m.eventId),
              ...(mark.values ? { values: mark.values } : {}),
            }),
          );
        }
      }
    }
    out.push(...given, ...revokeStale(kit, given, { holders: [...holders, ...periodHolders(kit, periodKey.match(m.id))], keys, sport, period: (k) => k === periodKey.match(m.id) }));
  }
  // Partido borrado: ya no está en la foto; se retiran las provisionales de los jugadores que manda el trabajo.
  if (mid && !list.length && job.league_id) {
    const holders = [...payloadPlayers(job).map((p) => playerHolderOf(p, job.league_id!)), ...periodHolders(kit, periodKey.match(mid))];
    out.push(...revokeStale(kit, [], { holders, keys, period: (k) => k === periodKey.match(mid) }));
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------------
// Figura de la noche (americano y mexicano)

/** Hora (ms) del último resultado de la noche. */
const lastResultAt = (ms: readonly Match[]) => Math.max(0, ...ms.map((m) => Date.parse(m.confirmedAt ?? m.proposedAt ?? '') || 0));

export const racketNight: Evaluator = (job, snap, now) => {
  const kit = kitOf(job, snap, now);
  const d = def('racket_night_champion');
  const eid = refId(job.ref, 'event');
  const events = [...kit.events.values()].filter((e) => (eid ? e.id === eid : job.kind === 'historial' && e.league_id === job.league_id) && isNightType(e.type));
  const out: BadgeDecision[] = [];
  for (const e of events) {
    const league = kit.leagues.get(e.league_id);
    const sport = league?.sport;
    if (!league || !isRacketSport(sport) || !(d.sports as readonly string[]).includes(sport)) continue;
    const ms = kit.matches.filter((m) => m.eventId === e.id && m.status !== 'void');
    // Cerrada: todos los partidos finales, la fecha pasó y 24 h desde el último resultado.
    const closeMs = (paramOf(d, 'closeHours', sport) ?? 24) * 3_600_000;
    if (!ms.length || !ms.every((m) => isFinal(m, now)) || e.date >= kit.today || lastResultAt(ms) > now - closeMs) continue;
    if (!realOn(kit, e.league_id, e.date)) continue;
    const cfg = parseNightConfig(e.config, e.type);
    const rows = nightTable(cfg, nightRounds(cfg, ms, now)).filter((r) => r.played > 0);
    const accounts = new Set(rows.map((r) => kit.userOf(r.id)).filter((u): u is string => !!u));
    const writers = new Set(ms.flatMap((m) => [m.proposedBy, m.confirmedBy]).filter((u): u is string => !!u));
    if (rows.length < (paramOf(d, 'minPlayers', sport) ?? 8) || accounts.size < (paramOf(d, 'minAccounts', sport) ?? 6) || writers.size < (paramOf(d, 'minWriters', sport) ?? 2)) continue;
    const { winners } = topWithTies(rows, (a, b) => a.rank - b.rank);
    for (const w of winners) {
      out.push(
        awardOf(d, playerHolderOf(w.id, e.league_id), sport, 0, periodKey.event(e.id), 'firme', ms.map(ref).slice(0, 10), {
          ...leagueCtx(kit, e.league_id),
          ...eventCtx(kit, e.id),
          values: { n: w.points, formato: cfg.format, jugadores: rows.length },
        }),
      );
    }
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------------
// Podio de un torneo de raqueta por categorías (`event_podium`; también el título de un torneo suelto)

export interface RacketPodium {
  catId: string;
  entrants: number;
  places: { level: 1 | 2 | 3; players: string[]; match: Match }[];
}

/**
 * Podio de cada categoría de un torneo (§2.1, `event_podium` de raqueta): oro al ganador de la final
 * `<cat>-R<rondas>-1`, plata al que la perdió, bronce al ganador del 3.er lugar o a los dos perdedores de semifinal.
 * La final tiene que ser R2 para quien recibe (una final por W.O. vale para el ganador si su semifinal fue R2; el que
 * no se presentó no recibe plata). El tamaño del podio sale de los inscritos (§1.7.8).
 */
export function racketTourneyPodium(kit: Kit, eventId: string, config: unknown): RacketPodium[] {
  const cfg = parseTourneyConfig(config);
  const ms = kit.matches.filter((m) => m.eventId === eventId);
  const out: RacketPodium[] = [];
  for (const cat of cfg.categories) {
    const bracket = categoryBracket(cat, ms, kit.now);
    if (!bracket) continue;
    const entrants = cat.pairs.length || cat.seeds?.length || 0;
    const levels = podiumLevels(entrants);
    if (!levels.length) continue;
    const final = matchAt(cat, `R${bracket.rounds}-1`, ms);
    const champ = winnerId(final, kit.now);
    if (!final || !champ) continue;
    const places: RacketPodium['places'] = [];
    const sideOf = (m: Match, id: string): Side | null => (entrantKey(m.sides[0]) === id ? 1 : entrantKey(m.sides[1]) === id ? 2 : null);
    const valid = (m: Match, side: Side) => sidePlayers(m.sides[side - 1], kit.rosterOf).filter((p) => !!r2Reason(m, p, matchCtx(kit, m)));
    const semis = semifinals(cat, bracket.rounds, ms);
    const wSide = sideOf(final, champ)!;
    if (final.status === 'walkover') {
      const semi = semis.find((s) => winnerId(s, kit.now) === champ);
      const semiSide = semi ? sideOf(semi, champ) : null;
      const players = semi && semiSide ? valid(semi, semiSide) : [];
      if (levels.includes(3) && players.length) places.push({ level: 3, players, match: final });
    } else {
      const gold = valid(final, wSide);
      const silver = valid(final, other(wSide));
      if (levels.includes(3) && gold.length) places.push({ level: 3, players: gold, match: final });
      if (levels.includes(2) && silver.length) places.push({ level: 2, players: silver, match: final });
    }
    if (levels.includes(1)) {
      const p3 = matchAt(cat, 'P3', ms);
      const p3Winner = winnerId(p3, kit.now);
      if (p3 && p3Winner && p3.status !== 'walkover') {
        const players = valid(p3, sideOf(p3, p3Winner)!);
        if (players.length) places.push({ level: 1, players, match: p3 });
      } else if (!p3) {
        for (const s of semis) {
          const w = winnerId(s, kit.now);
          if (!w || s.status === 'walkover') continue;
          const players = valid(s, other(sideOf(s, w)!));
          if (players.length) places.push({ level: 1, players, match: s });
        }
      }
    }
    out.push({ catId: cat.id, entrants, places });
  }
  return out;
}

function semifinals(cat: TourneyCategory, rounds: number, ms: readonly Match[]): Match[] {
  if (rounds < 2) return [];
  return [1, 2].map((i) => matchAt(cat, `R${rounds - 1}-${i}`, ms)).filter((m): m is Match => !!m);
}

/** `event_podium` de raqueta: torneos (`type='torneo'`) en ligas `kind='liga'`. */
export function racketEventPodium(kit: Kit, job: BadgeJob): BadgeDecision[] {
  const d = def('event_podium');
  const eid = refId(job.ref, 'event');
  const out: BadgeDecision[] = [];
  for (const e of kit.events.values()) {
    if ((eid ? e.id !== eid : !(job.kind === 'historial' && e.league_id === job.league_id)) || e.type !== 'torneo') continue;
    const league = kit.leagues.get(e.league_id);
    const sport = league?.sport;
    if (!league || league.kind !== 'liga' || !isRacketSport(sport) || !realOn(kit, e.league_id, e.date)) continue;
    for (const cat of racketTourneyPodium(kit, e.id, e.config)) {
      for (const place of cat.places) {
        for (const p of place.players) {
          out.push(
            awardOf(d, playerHolderOf(p, e.league_id), sport, place.level, periodKey.event(e.id, cat.catId), 'firme', [ref(place.match)], {
              ...leagueCtx(kit, e.league_id),
              ...eventCtx(kit, e.id),
              values: { categoria: cat.catId, inscritos: cat.entrants },
            }),
          );
        }
      }
    }
  }
  return out;
}

export const racketPodium: Evaluator = (job: BadgeJob, snap: BadgeSnapshot, now: number) => racketEventPodium(kitOf(job, snap, now), job);
