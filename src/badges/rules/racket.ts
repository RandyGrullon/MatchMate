/**
 * Validación de partidos de raqueta para las insignias (docs/insignias.md §1.7.5 y §2.3): partido contado (R1) y
 * validado (R2), cuentas de cada lado, sets leídos del marcador y el % de juegos ganados (línea base, §1.7.6).
 * Los partidos se pasan al tipo de la app (`Match`) para usar los mismos helpers que las tablas.
 */
import { isFinal, toMatch, type Match, type MatchRow } from '../../lib/data/matchCore';
import { toStamp } from '../../lib/data/stamp';
import { isPointsMatch, matchRules, playerSide, sidePlayers } from '../../pages/sports/racket/logic/results';
import {
  isGameSportRules,
  isTiebreakSet,
  matchTotals,
  other,
  raceFinal,
  setWinner,
  stateFromScore,
  type Pair,
  type RacketRules,
  type RacketSport,
} from '../../sports/racket';
import type { Side } from '../../sports/types';
import type { ActivityDay, SnapMatch, SnapMatchPlayer, SnapMatchSide } from '../snapshot';
import { matchDate } from './periods';

// ---------------------------------------------------------------------------------------------------------
// Partidos de la foto → partidos de la app

/** Un partido de la foto como `Match` de la app (con sus lados y jugadores), para los helpers de las tablas. */
export function appMatch(row: SnapMatch, sides: readonly SnapMatchSide[], players: readonly SnapMatchPlayer[]): Match {
  const w = toMatch({ ...row, state: null } as MatchRow, sides, players);
  return { ...w, createdAt: toStamp(w.createdAt), updatedAt: toStamp(w.updatedAt) } as Match;
}

/** Todos los partidos de la foto como `Match`. */
export function appMatches(rows: readonly SnapMatch[], sides: readonly SnapMatchSide[] = [], players: readonly SnapMatchPlayer[] = []): Match[] {
  const sidesBy = groupBy(sides, (s) => s.match_id);
  const playersBy = groupBy(players, (p) => p.match_id);
  return rows.map((r) => appMatch(r, sidesBy.get(r.id) ?? [], playersBy.get(r.id) ?? []));
}

function groupBy<T>(list: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const x of list) {
    const k = key(x);
    const arr = out.get(k);
    if (arr) arr.push(x);
    else out.set(k, [x]);
  }
  return out;
}

/** Fecha local del partido para las insignias: `coalesce(scheduled_at, proposed_at, created_at)` en la zona. */
export function dateOfMatch(m: Pick<Match, 'scheduledAt' | 'proposedAt' | 'createdAt'>, tz?: string | null): string | null {
  const created = m.createdAt ? new Date(m.createdAt.toMillis()).toISOString() : '';
  return matchDate({ scheduled_at: m.scheduledAt, proposed_at: m.proposedAt, created_at: created }, tz);
}

// ---------------------------------------------------------------------------------------------------------
// R1 y R2

/** Lo que hace falta para decidir si un partido vale para un jugador. */
export interface MatchContext {
  /** Hora de la evaluación (ms): la regla de las 48 h se calcula al leer. */
  now: number;
  /** Cuenta de un jugador (null = sin cuenta). */
  userOf: (playerId: string) => string | null;
  /** Plantilla de una pareja o equipo de temporada, para los lados sin jugadores. */
  rosterOf?: (teamId: string) => readonly string[];
  /** Owner y admins de la liga del partido. */
  staff: ReadonlySet<string>;
}

/** Cuentas de un lado (jugadores del partido o de la pareja). */
export function sideAccounts(m: Match, side: Side, ctx: Pick<MatchContext, 'userOf' | 'rosterOf'>): Set<string> {
  const out = new Set<string>();
  for (const p of sidePlayers(m.sides[side - 1], ctx.rosterOf)) {
    const u = ctx.userOf(p);
    if (u) out.add(u);
  }
  return out;
}

/** R1: final (confirmado o a las 48 h), sin W.O. ni anulado, y el jugador está en un lado. */
export function isR1(m: Match, playerId: string, ctx: Pick<MatchContext, 'now' | 'rosterOf'>): boolean {
  return isFinal(m, ctx.now) && m.status !== 'walkover' && m.status !== 'void' && playerSide(m, playerId, ctx.rosterOf) !== null;
}

/**
 * Por qué un partido R1 es R2 para ese jugador, o null:
 * - `rival`: lo confirmó una cuenta del otro lado (a), o lo propuso el otro lado y quedó final (los dos lados
 *   están de acuerdo: quien confirma es de su lado o se cumplieron las 48 h);
 * - `oficial`: lo anotó el admin, el anotador o un oficial (`proposed_side` nulo) que no es de su lado (b);
 * - `plazo`: quedó final a las 48 h sin reclamo y el otro lado tiene cuenta, así que pudo reclamar (c);
 * - `reclamo`: hubo reclamo y lo resolvió un owner o admin que no está en ningún lado (d);
 * - `neutral`: lo confirmó (o corrigió) un owner o admin que no está en ningún lado: vale lo mismo que (b).
 * En formatos que no se confirman (`require_confirm = false`) solo vale (b), o que lo propusiera el otro lado.
 */
export type R2Reason = 'rival' | 'oficial' | 'plazo' | 'reclamo' | 'neutral';

export function r2Reason(m: Match, playerId: string, ctx: MatchContext): R2Reason | null {
  if (!isR1(m, playerId, ctx)) return null;
  const side = playerSide(m, playerId, ctx.rosterOf)!;
  const mine = sideAccounts(m, side, ctx);
  const theirs = sideAccounts(m, other(side), ctx);
  const neutral = (u: string | null | undefined): u is string => !!u && ctx.staff.has(u) && !mine.has(u) && !theirs.has(u);
  const byOfficial = m.proposedSide === null && !!m.proposedBy && !mine.has(m.proposedBy);
  const byRival = !!m.proposedBy && theirs.has(m.proposedBy);
  if (!m.requireConfirm) {
    if (byOfficial) return 'oficial';
    return byRival ? 'rival' : null;
  }
  if ((m.confirmedBy && theirs.has(m.confirmedBy)) || byRival) return 'rival';
  if (byOfficial) return 'oficial';
  if (m.status === 'finished' && !m.disputedAt && theirs.size > 0) return 'plazo';
  if ((m.history ?? []).some((h) => h.a === 'resolve' && neutral(h.by))) return 'reclamo';
  if (neutral(m.confirmedBy)) return 'neutral';
  return null;
}

export const isR2 = (m: Match, playerId: string, ctx: MatchContext): boolean => r2Reason(m, playerId, ctx) !== null;

/** El jugador ganó (W.O. a favor no cuenta como victoria para las insignias: ver R1). */
export function wonBy(m: Match, playerId: string, rosterOf?: (teamId: string) => readonly string[]): boolean {
  const side = playerSide(m, playerId, rosterOf);
  return side !== null && m.winner === side;
}

/**
 * Oficial para títulos, asistencia y rachas: partidos de eventos de liga, torneo, cajas y escalera, y partidos
 * sueltos, que se confirman. Americano, mexicano y noches son sociales.
 */
const OFFICIAL_EVENTS = new Set(['liga', 'torneo', 'cajas', 'escalera']);
export function isOfficialRacket(m: Pick<Match, 'requireConfirm' | 'format' | 'eventId'>, eventType: string | null | undefined): boolean {
  if (!m.requireConfirm || isPointsMatch(m)) return false;
  return !m.eventId || (!!eventType && OFFICIAL_EVENTS.has(eventType));
}

/**
 * Actividad válida de raqueta: estar en un lado de un partido R1, o de un W.O. a favor. Una noche de americano o
 * mexicano con un partido final da su día (los días se juntan en activity.ts).
 */
export function racketActivity(
  matches: readonly Match[],
  ctx: Pick<MatchContext, 'now' | 'userOf' | 'rosterOf'> & { sport: RacketSport; tz?: string | null; eventType?: (eventId: string) => string | null },
): ActivityDay[] {
  const out: ActivityDay[] = [];
  for (const m of matches) {
    if (!isFinal(m, ctx.now) || m.status === 'void') continue;
    const date = dateOfMatch(m, ctx.tz);
    if (!date) continue;
    const official = isOfficialRacket(m, m.eventId ? ctx.eventType?.(m.eventId) : null);
    for (const side of [1, 2] as const) {
      // W.O.: solo cuenta para el lado que sí vino.
      if (m.status === 'walkover' && m.walkoverSide === side) continue;
      for (const p of sidePlayers(m.sides[side - 1], ctx.rosterOf)) {
        out.push({ sport: ctx.sport, league_id: m.leagueId, player_id: p, user_id: ctx.userOf(p), date, official });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Sets y juegos leídos del marcador

/** Un set (o un juego de pickleball o de ping pong) terminado, en orden lado 1 – lado 2. */
export interface RacketSet {
  games: Pair<number>;
  winner: Side;
  /** Tenis y pádel: set ganado en tie-break (7-6). */
  tiebreak: boolean;
  /** Súper tie-break que reemplaza al set decisivo (sus puntos van en `games`). */
  matchTiebreak: boolean;
}

export interface ReadSets {
  rules: RacketRules;
  sets: RacketSet[];
  /** Hubo retiro: el set cortado no está en `sets`. */
  retired: boolean;
}

const TOKEN = /^\[?(\d{1,2})\s*[-–—:/]\s*(\d{1,2})\]?(?:\((\d{1,2})\))?$/;

/**
 * Sets de un partido R1 a sets, leídos con `stateFromScore(matchRules(sport, rules), score.text)`. Se ignora el set
 * cortado por `ret.`; un W.O., un partido de puntos o un marcador que no se entiende dan null.
 */
export function readSets(m: Pick<Match, 'status' | 'format' | 'score' | 'rules'>, sport: RacketSport): ReadSets | null {
  if (m.status === 'walkover' || m.status === 'void' || isPointsMatch(m)) return null;
  const rules = matchRules(sport, m.rules);
  const text = typeof m.score?.text === 'string' ? m.score.text : '';
  if (!rules || !text) return null;
  const retired = /ret/i.test(text);
  if (!retired) {
    try {
      const s = stateFromScore(rules, text);
      if (s.sport === 'pickleball' || s.sport === 'table_tennis') {
        return { rules, retired, sets: s.games.map((g) => ({ games: g, winner: g[0] > g[1] ? 1 : 2, tiebreak: false, matchTiebreak: false })) };
      }
      return {
        rules,
        retired,
        sets: s.sets.map((x) => {
          const games = x.matchTiebreak && x.tiebreak ? x.tiebreak : x.games;
          return { games, winner: games[0] > games[1] ? 1 : 2, tiebreak: !x.matchTiebreak && isTiebreakSet(s.rules, x.games), matchTiebreak: !!x.matchTiebreak };
        }),
      };
    } catch {
      return null;
    }
  }
  // Retiro: solo los sets que terminaron (el cortado no cumple las reglas del set).
  const sets: RacketSet[] = [];
  const tokens = text.split(/[\s,;]+/).filter((t) => t && !/ret/i.test(t));
  for (const [k, t] of tokens.entries()) {
    const x = TOKEN.exec(t);
    if (!x) return null;
    const games: Pair<number> = [Number(x[1]), Number(x[2])];
    if (isGameSportRules(rules)) {
      const w = raceFinal(rules.gameTo, rules.winBy, games);
      if (w) sets.push({ games, winner: w, tiebreak: false, matchTiebreak: false });
      continue;
    }
    const decider = rules.finalSet === 'tiebreak' && k === rules.bestOf - 1;
    const w = decider ? raceFinal(rules.finalTiebreakTo, 2, games) : setWinner(rules, games);
    if (w) sets.push({ games, winner: w, tiebreak: !decider && isTiebreakSet(rules, games), matchTiebreak: decider });
  }
  return { rules, retired, sets };
}

/**
 * Juegos de cada lado para el % de juegos ganados (línea base de raqueta): `score.totals.games` o, si falta, los del
 * texto (el súper tie-break cuenta como un juego 1-0; en pickleball y ping pong, los juegos). null en W.O., partidos de puntos o
 * marcadores que no se entienden.
 */
export function racketGames(m: Pick<Match, 'status' | 'format' | 'score' | 'rules'>, sport: RacketSport): Pair<number> | null {
  if (m.status === 'walkover' || m.status === 'void' || isPointsMatch(m)) return null;
  const totals = m.score?.totals;
  const g = totals && typeof totals === 'object' ? (totals as Record<string, unknown>).games : null;
  if (Array.isArray(g) && g.length === 2 && g.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0)) return [g[0], g[1]];
  const read = readSets(m, sport);
  if (!read) return null;
  if (!read.retired) {
    try {
      return matchTotals(stateFromScore(read.rules, String(m.score?.text))).games;
    } catch {
      return null;
    }
  }
  const out: Pair<number> = [0, 0];
  for (const s of read.sets) {
    // Pickleball y ping pong cuentan juegos, no puntos; el súper tie-break vale un juego.
    if (isGameSportRules(read.rules) || s.matchTiebreak) out[s.winner - 1]++;
    else {
      out[0] += s.games[0];
      out[1] += s.games[1];
    }
  }
  return out;
}
