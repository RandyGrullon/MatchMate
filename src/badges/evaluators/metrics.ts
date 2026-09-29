/**
 * Métricas por deporte que comparten las insignias de periodo (mes, año y temporada; docs/insignias.md §2.9–§2.11):
 * la figura (promedio, victorias o diferencial), el progreso contra la línea base, las rachas, las fechas de la
 * asistencia y las tablas de equipos. Todo sobre una liga y una ventana de fechas ('YYYY-MM-DD', ambas incluidas).
 * Las comparaciones van en `key` (mayor es mejor, en orden de desempate) para `topWithTies` y `podiumAwards`.
 */
import { calcHandicap } from '../../lib/stats';
import { isFinal, sideKey, type Match } from '../../lib/data/matchCore';
import { isSetsMatch, sidePlayers } from '../../pages/sports/racket/logic/results';
import { basketballStandings, footballStandings, type TeamMatchResult } from '../../sports/team/standings';
import { matchResultOf as basketballResult } from '../../pages/sports/basketball/adapter';
import { matchResultOf as footballResult } from '../../pages/sports/football/adapter';
import { bestKey } from '../../sports/swimming/events';
import type { StandingRow } from '../../sports/types';
import { gamesWonPct, golfDifferential } from '../rules/baselines';
import type { BowlingGame } from '../rules/bowling';
import { isG1, isG2 } from '../rules/golf';
import { addDays, monthRange } from '../rules/periods';
import { isOfficialRacket, r2Reason, racketGames, wonBy } from '../rules/racket';
import { entryIsW1, personalBestSteps, swimContext, swimsOf, type PersonalBestStep } from '../rules/swim';
import { appearances, isT1, t2Reason, teamOutcome } from '../rules/team';
import type { SnapEntry, SnapGolfCard, SnapGolfRound, SnapSwimEntry } from '../snapshot';
import { groupBy, isRacketSport, matchDay, mean, round1, rulesPart, type Kit, type TeamSportId } from './kit';
import { matchCtx } from './racket';
import { teamMatchCtx } from './team';

// ---------------------------------------------------------------------------------------------------------
// Ventanas

export interface Window {
  from: string;
  to: string;
}

export const monthWindow = (month: string): Window => {
  const [from, to] = monthRange(month);
  return { from, to };
};
export const yearWindow = (year: number): Window => ({ from: `${year}-01-01`, to: `${year}-12-31` });
export const inWin = (d: string | null | undefined, w: Window): d is string => !!d && d >= w.from && d <= w.to;

/** Primera y segunda mitad de una ventana (por fecha). */
export function halves(w: Window): [Window, Window] {
  const days = Math.round((Date.parse(`${w.to}T00:00:00Z`) - Date.parse(`${w.from}T00:00:00Z`)) / 86_400_000);
  const mid = addDays(w.from, Math.floor(days / 2));
  return [
    { from: w.from, to: mid },
    { from: addDays(mid, 1), to: w.to },
  ];
}

/** Un candidato de una tabla: `key` ordena de mayor a menor (desempates en orden). */
export interface Ranked {
  p: string;
  key: number[];
  values: Record<string, number | string>;
  refs: string[];
}

export const byKey = (a: Pick<Ranked, 'key'>, b: Pick<Ranked, 'key'>): number => {
  for (let i = 0; i < Math.max(a.key.length, b.key.length); i++) {
    const d = (b.key[i] ?? 0) - (a.key[i] ?? 0);
    if (Math.abs(d) > 1e-9) return d;
  }
  return 0;
};

/** Jugadores de la cuenta de un jugador en ese deporte (la línea base mira todo su historial), o él solo. */
export function selfPlayers(kit: Kit, p: string): string[] {
  const u = kit.userOf(p);
  const sport = kit.sportOf(kit.players.get(p)?.league_id ?? '');
  if (!u) return [p];
  return [...kit.players.values()].filter((x) => x.user_id === u && kit.sportOf(x.league_id) === sport).map((x) => x.id);
}

// ---------------------------------------------------------------------------------------------------------
// Boliche

const entryIndex = new WeakMap<Kit, Map<string, SnapEntry>>();
function entryOf(kit: Kit, id: string): SnapEntry | undefined {
  let m = entryIndex.get(kit);
  if (!m) {
    m = new Map((kit.snap.entries ?? []).map((e) => [e.id, e]));
    entryIndex.set(kit, m);
  }
  return m.get(id);
}

/** Juegos B1 de una liga en la ventana (oficiales y práctica), en orden de juego. */
export const leagueBowling = (kit: Kit, leagueId: string, w: Window): BowlingGame[] => kit.bowling().filter((g) => g.league_id === leagueId && inWin(g.date, w));

/** Hándicap por juego de su participación (solo torneos): el fijado a mano o el de la regla del evento. */
export function gameHcp(kit: Kit, g: BowlingGame): number {
  const e = entryOf(kit, g.entry_id);
  const ev = kit.events.get(g.event_id);
  if (!e || !ev || ev.type !== 'torneo') return 0;
  return e.handicap_override ?? calcHandicap(e.average, ev.hcp_base, ev.hcp_percent);
}

/** ¿La mayoría de los torneos rankean por hándicap? (`individual_rank_by` hcp con `hcp_percent` > 0). */
export function hcpMajority(kit: Kit, eventIds: Iterable<string>): boolean {
  let n = 0;
  let hcp = 0;
  for (const id of new Set(eventIds)) {
    const e = kit.events.get(id);
    if (!e || e.type !== 'torneo') continue;
    n++;
    if (e.hcp_percent > 0 && (e.individual_rank_by ?? 'hcp') === 'hcp') hcp++;
  }
  return n > 0 && hcp * 2 > n;
}

export interface BowlingFigureOpts {
  minGames: number;
  minDates: number;
  /** Con 1–2 fechas oficiales: todas y estos juegos. */
  fewGames?: number;
  /** % mínimo de las fechas oficiales (año: 40, temporada: 50). */
  datesPct?: number;
  /** Solo quienes tiraron todos los juegos (torneo suelto). */
  allGames?: boolean;
}

/**
 * Figura de boliche: promedio de los juegos B1 de torneos (con hándicap si la mayoría rankea así). Desempates: más
 * juegos, juego más alto. Solo los que llegan al mínimo.
 */
export function bowlingFigure(kit: Kit, leagueId: string, w: Window, o: BowlingFigureOpts): Ranked[] {
  const games = leagueBowling(kit, leagueId, w).filter((g) => g.official);
  const dates = new Set(games.map((g) => g.date));
  const hcp = hcpMajority(kit, games.map((g) => g.event_id));
  const total = o.allGames ? new Set(games.map((g) => g.event_id)) : null;
  const allGames = total ? [...total].reduce((n, e) => n + (kit.events.get(e)?.games ?? 0), 0) : 0;
  const out: Ranked[] = [];
  for (const [p, list] of groupBy(games, (g) => g.player_id)) {
    const nd = new Set(list.map((g) => g.date)).size;
    const few = dates.size < 3 && o.fewGames !== undefined;
    const ok = few ? nd === dates.size && list.length >= o.fewGames! : list.length >= o.minGames && nd >= o.minDates && (!o.datesPct || nd * 100 >= o.datesPct * dates.size);
    if (!ok || (total && list.length < allGames)) continue;
    const sum = list.reduce((n, g) => n + g.score + (hcp ? gameHcp(kit, g) : 0), 0);
    const avg = sum / list.length;
    const high = Math.max(...list.map((g) => g.score));
    out.push({
      p,
      key: o.allGames ? [sum, high] : [avg, list.length, high],
      values: { valor: o.allGames ? `${sum} pinos` : `promedio ${Math.floor(avg)} en ${list.length} juegos`, avg: round1(avg), games: list.length, hcp: hcp ? 1 : 0 },
      refs: [...new Set(list.map((g) => `event:${g.event_id}`))].slice(0, 10),
    });
  }
  return out;
}

/** Juegos B1 de toda la historia de un jugador (y su cuenta), para la línea base. */
export const bowlingHistory = (kit: Kit, p: string): BowlingGame[] => {
  const mine = new Set(selfPlayers(kit, p));
  return kit.bowling().filter((g) => mine.has(g.player_id));
};

// ---------------------------------------------------------------------------------------------------------
// Raqueta

/** Partidos de una liga en la ventana (por la fecha del partido). */
export const leagueMatches = (kit: Kit, leagueId: string, w: Window): Match[] => kit.matches.filter((m) => m.leagueId === leagueId && inWin(matchDay(kit, m), w));

/** Partido oficial a sets de raqueta (liga, torneo, cajas, escalera o suelto que se confirma). */
export const officialRacket = (kit: Kit, m: Match): boolean => isSetsMatch(m) && isOfficialRacket(m, m.eventId ? kit.events.get(m.eventId)?.type : null);

/** Un partido R2 de un jugador con lo que hace falta para tablas y progreso. */
export interface RacketLine {
  m: Match;
  p: string;
  side: 1 | 2;
  date: string;
  won: boolean;
  sets: [number, number];
  games: [number, number] | null;
}

/** Partidos R2 a sets de unos jugadores (en unas ligas), con marcador orientado a su lado. */
export function racketLines(kit: Kit, players: Iterable<string>, ms: readonly Match[], officialOnly: boolean): RacketLine[] {
  const mine = new Set(players);
  const out: RacketLine[] = [];
  for (const m of ms) {
    const sport = kit.sportOf(m.leagueId);
    if (!isRacketSport(sport) || !isSetsMatch(m) || (officialOnly && !officialRacket(kit, m))) continue;
    const date = matchDay(kit, m);
    if (!date) continue;
    for (const side of [1, 2] as const) {
      for (const p of sidePlayers(m.sides[side - 1], kit.rosterOf)) {
        if (!mine.has(p) || !r2Reason(m, p, matchCtx(kit, m))) continue;
        const s = Array.isArray(m.score?.sides) ? (m.score!.sides as [number, number]) : [0, 0];
        const g = racketGames(m, sport);
        out.push({
          m,
          p,
          side,
          date,
          won: wonBy(m, p, kit.rosterOf),
          sets: side === 1 ? [s[0], s[1]] : [s[1], s[0]],
          games: g ? (side === 1 ? [g[0], g[1]] : [g[1], g[0]]) : null,
        });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.m.scheduledAt ?? '').localeCompare(b.m.scheduledAt ?? ''));
}

/** Todos los jugadores de raqueta que salen en unos partidos. */
export const racketPeople = (kit: Kit, ms: readonly Match[]): Set<string> => new Set(ms.flatMap((m) => [...sidePlayers(m.sides[0], kit.rosterOf), ...sidePlayers(m.sides[1], kit.rosterOf)]));

/** % de juegos ganados de unas líneas (null sin juegos). */
export const pctOf = (lines: readonly RacketLine[]): number | null => gamesWonPct(lines.map((l) => l.games).filter((g): g is [number, number] => !!g));

/**
 * Figura de raqueta: victorias R2 en formatos oficiales. Desempates: % de victorias, diferencia de sets y de
 * juegos. `scheduledPct` pide además ese % de sus partidos oficiales programados (año).
 */
export function racketFigure(kit: Kit, leagueId: string, w: Window, minMatches: number, scheduledPct = 0): Ranked[] {
  const ms = leagueMatches(kit, leagueId, w);
  const lines = racketLines(kit, racketPeople(kit, ms), ms, true);
  const official = ms.filter((m) => officialRacket(kit, m) && m.status !== 'void');
  const out: Ranked[] = [];
  for (const [p, list] of groupBy(lines, (l) => l.p)) {
    const scheduled = official.filter((m) => m.sides.some((s) => sidePlayers(s, kit.rosterOf).includes(p))).length;
    if (list.length < minMatches || (scheduledPct && list.length * 100 < scheduledPct * scheduled)) continue;
    const won = list.filter((l) => l.won).length;
    const setDiff = list.reduce((n, l) => n + l.sets[0] - l.sets[1], 0);
    const gameDiff = list.reduce((n, l) => n + (l.games ? l.games[0] - l.games[1] : 0), 0);
    out.push({
      p,
      key: [won, won / list.length, setDiff, gameDiff],
      values: { valor: `${won} victorias en ${list.length} partidos`, won, played: list.length },
      refs: list.slice(-10).map((l) => `match:${l.m.id}`),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Golf

/** Una tarjeta G1 con su ronda, fecha, diferencial y si es G2. */
export interface CardInfo {
  card: SnapGolfCard;
  round: SnapGolfRound;
  date: string;
  diff: number | null;
  holes: 9 | 18 | null;
  g2: boolean;
}

const cardIndex = new WeakMap<Kit, CardInfo[]>();

/** Todas las tarjetas G1 de la foto, en orden de fecha. */
export function golfCards(kit: Kit): CardInfo[] {
  let out = cardIndex.get(kit);
  if (out) return out;
  const rounds = new Map((kit.snap.golf_rounds ?? []).map((r) => [r.event_id, r]));
  const byEvent = groupBy(kit.snap.golf_cards ?? [], (c) => c.event_id);
  out = [];
  for (const card of kit.snap.golf_cards ?? []) {
    const round = rounds.get(card.event_id);
    if (!round || !isG1(card, round)) continue;
    const date = kit.events.get(card.event_id)?.date ?? (round.closed_at ?? '').slice(0, 10);
    const d = golfDifferential(card, round);
    out.push({ card, round, date, diff: d?.value ?? null, holes: d?.holes ?? null, g2: isG2(card, round, byEvent.get(card.event_id) ?? [], kit.userOf) });
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || (a.card.id < b.card.id ? -1 : 1));
  cardIndex.set(kit, out);
  return out;
}

/** Tarjetas G2 de 18 hoyos con diferencial de unos jugadores. */
export const g2Diffs = (kit: Kit, players: Iterable<string>, filter: (c: CardInfo) => boolean = () => true): CardInfo[] => {
  const mine = new Set(players);
  return golfCards(kit).filter((c) => mine.has(c.card.player_id) && c.g2 && c.holes === 18 && c.diff !== null && filter(c));
};

/** Figura de golf: menor diferencial medio en tarjetas G2 (desempate: el mejor diferencial suelto). */
export function golfFigure(kit: Kit, leagueId: string, w: Window, minCards: number): Ranked[] {
  const cards = golfCards(kit).filter((c) => c.card.league_id === leagueId && inWin(c.date, w) && c.g2 && c.holes === 18 && c.diff !== null);
  const out: Ranked[] = [];
  for (const [p, list] of groupBy(cards, (c) => c.card.player_id)) {
    if (list.length < minCards) continue;
    const avg = mean(list.map((c) => c.diff!))!;
    const best = Math.min(...list.map((c) => c.diff!));
    out.push({ p, key: [-avg, -best], values: { valor: `diferencial ${round1(avg)} en ${list.length} rondas`, diff: round1(avg), cards: list.length }, refs: list.map((c) => `card:${c.card.id}`) });
  }
  return out;
}

/** Línea base de golf: media de las últimas `n` tarjetas G2 de 18 hoyos antes de una fecha (null con menos de `min`). */
export function golfBase(kit: Kit, p: string, before: string, n = 8, min = 4): number | null {
  const prior = g2Diffs(kit, selfPlayers(kit, p), (c) => c.date < before).slice(-n);
  return prior.length >= min ? mean(prior.map((c) => c.diff!)) : null;
}

// ---------------------------------------------------------------------------------------------------------
// Natación

/** Tiempos W1 de unos nadadores (con el encuentro y su fecha), para las marcas personales. */
export function swimHistory(kit: Kit, players: Iterable<string>) {
  const mine = new Set(players);
  const ctx = swimContext(kit.snap.swim_events ?? [], kit.snap.swim_meets ?? [], kit.userOf);
  const entries = (kit.snap.swim_entries ?? []).filter((e) => mine.has(e.player_id));
  return swimsOf(entries, { ...ctx, dateOf: (e) => kit.events.get(e)?.date ?? null });
}

/** Pasos de marca personal (cuándo bajó su marca y cuánto) de un nadador y su cuenta. */
export const personalBestsOf = (kit: Kit, p: string): PersonalBestStep[] => personalBestSteps(swimHistory(kit, selfPlayers(kit, p)));

/** Pruebas W1 del nadador en la ventana (en esa liga) que ya tenían una marca anterior. */
export function swimsWithPrior(kit: Kit, p: string, leagueId: string, w: Window): number {
  const swims = swimHistory(kit, selfPlayers(kit, p));
  const leagueMeets = new Set((kit.snap.swim_meets ?? []).filter((m) => m.league_id === leagueId).map((m) => m.event_id));
  return swims.filter((s) => inWin(s.date, w) && !!s.eventId && leagueMeets.has(s.eventId) && swims.some((o) => bestKey(o) === bestKey(s) && o.date < s.date)).length;
}

/** Pasos de marca personal de la ventana en encuentros de esa liga. */
export function leagueBestSteps(kit: Kit, p: string, leagueId: string, w: Window): PersonalBestStep[] {
  const leagueMeets = new Set((kit.snap.swim_meets ?? []).filter((m) => m.league_id === leagueId).map((m) => m.event_id));
  return personalBestsOf(kit, p).filter((s) => inWin(s.date, w) && !!s.eventId && leagueMeets.has(s.eventId));
}

/** Resultados de natación de una liga en encuentros finalizados de la ventana. */
export function leagueSwims(kit: Kit, leagueId: string, w: Window): SnapSwimEntry[] {
  const meets = new Map((kit.snap.swim_meets ?? []).map((m) => [m.event_id, m]));
  return (kit.snap.swim_entries ?? []).filter((e) => {
    const m = meets.get(e.event_id);
    return e.league_id === leagueId && !!m?.finalized_at && inWin(kit.events.get(e.event_id)?.date, w);
  });
}

export const isW1Entry = (kit: Kit, e: SnapSwimEntry): boolean => entryIsW1(e, swimContext(kit.snap.swim_events ?? [], kit.snap.swim_meets ?? [], kit.userOf));

// ---------------------------------------------------------------------------------------------------------
// Equipos

/** Equipos de temporada de un jugador en su liga. */
export const teamsOf = (kit: Kit, p: string): string[] => (kit.snap.team_players ?? []).filter((tp) => tp.player_id === p).map((tp) => tp.team_id);

/** Partidos T1 de un equipo en la ventana, en orden. */
export function teamMatchesIn(kit: Kit, teamId: string, w: Window): Match[] {
  return kit.matches
    .filter((m) => isT1(m, kit.now) && m.sides.some((s) => s.teamId === teamId) && inWin(matchDay(kit, m), w))
    .sort((a, b) => (matchDay(kit, a) ?? '').localeCompare(matchDay(kit, b) ?? '') || (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''));
}

export const sideOfTeam = (m: Match, teamId: string): 1 | 2 => (m.sides[0].teamId === teamId ? 1 : 2);

/** ¿El partido es T2 para ese equipo? */
export const t2For = (kit: Kit, m: Match, teamId: string): boolean => t2Reason(m, sideOfTeam(m, teamId), teamMatchCtx(kit, m)) !== null;

/**
 * Tabla de equipos con las reglas de la liga (`rules.table`; fútbol y sala 3/1/0, baloncesto FIBA) sobre unos
 * partidos que ya cuentan (W.O. incluidos).
 */
export function teamTable(kit: Kit, sport: TeamSportId, leagueId: string, teamIds: readonly string[], ms: readonly Match[]): StandingRow[] {
  const table = rulesPart(kit.leagues.get(leagueId)?.rules, 'table');
  const final = ms.filter((m) => isFinal(m, kit.now) && m.status !== 'void' && m.sides.every((s) => s.teamId && teamIds.includes(s.teamId)));
  if (sport === 'basketball') {
    const results = final.map(basketballResult).filter((r): r is TeamMatchResult => !!r);
    return basketballStandings(teamIds, results, table);
  }
  const results = final.map(footballResult).filter((r): r is TeamMatchResult => !!r);
  return footballStandings(teamIds, results, table);
}

/** Resultado de un equipo en un partido ('G', 'E', 'P'). */
export const outcomeFor = (m: Match, teamId: string) => teamOutcome(m, sideOfTeam(m, teamId));

/** Veces que cada jugador apareció con ese equipo en unos partidos (y si alguno trajo alineación). */
export function appearancesFor(ms: readonly Match[], teamId: string, sport: TeamSportId): { count: Map<string, number>; withLineup: number } {
  const count = new Map<string, number>();
  let withLineup = 0;
  for (const m of ms) {
    const side = sideOfTeam(m, teamId);
    const seen = appearances(m, sport);
    if (seen.size) withLineup++;
    for (const [p, s] of seen) if (s === side) count.set(p, (count.get(p) ?? 0) + 1);
  }
  return { count, withLineup };
}

/** Clave de lado (equipo o jugadores) para tablas sin equipo. */
export const sideKeyOf = sideKey;
