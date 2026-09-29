/**
 * Validación de partidos de equipo (baloncesto, fútbol y sala) para las insignias (docs/insignias.md §1.7.5):
 * partido contado (T1), validado (T2) y con estadísticas (TS), apariciones, respaldo por plantilla y resultado de
 * cada lado. Las líneas se leen con los `decodeLines` de cada deporte.
 */
import { isFinal, type Match } from '../../lib/data/matchCore';
import { other } from '../../sports/racket/rules';
import { decodeLines as decodeBasketballLines, type ScoreLine as BasketballLine } from '../../pages/sports/basketball/adapter';
import { decodeLines as decodeFootballLines, pensFromScore, type ScoreLine as FootballLine } from '../../pages/sports/football/adapter';
import type { Side } from '../../sports/types';
import type { ActivityDay, SnapTeamPlayer } from '../snapshot';
import { localDate } from './periods';
import { dateOfMatch } from './racket';

export type { BasketballLine, FootballLine };
export type TeamSport = 'basketball' | 'football' | 'futsal';

/** T1: final (confirmado o a las 48 h), sin anular, sin W.O. y sin forfait (`score.ending`). */
export function isT1(m: Match, now: number): boolean {
  return isFinal(m, now) && m.status !== 'walkover' && m.status !== 'void' && !m.score?.ending;
}

// ---------------------------------------------------------------------------------------------------------
// Líneas y apariciones

/** Baloncesto: una línea es coherente si `pts = 1s + 2·2s + 3·3s`; si no, se descarta. */
export const coherentBasketballLine = (l: BasketballLine): boolean => l.points === l.ones + 2 * l.twos + 3 * l.threes;

/** Líneas de baloncesto del partido (todas, también las incoherentes: sirven de aparición). */
export const basketballLinesOf = (m: Pick<Match, 'score'>): BasketballLine[] => decodeBasketballLines(m.score?.lines);

/** Líneas de fútbol y sala del partido. */
export const footballLinesOf = (m: Pick<Match, 'score'>): FootballLine[] => decodeFootballLines(m.score?.lines);

/** El partido trae estadísticas por jugador (no es «solo resultado»). */
export const hasLines = (m: Pick<Match, 'score'>): boolean => typeof m.score?.lines === 'string' && m.score.lines.length > 0;

/**
 * Apariciones (§1.7.5): una fila en `match_players`, una línea de baloncesto o una de fútbol y sala con `played`.
 * Nunca la plantilla actual. Jugador → lado.
 */
export function appearances(m: Match, sport: TeamSport): Map<string, Side> {
  const out = new Map<string, Side>();
  for (const s of m.sides) for (const p of s.players) out.set(p.playerId, s.side);
  if (sport === 'basketball') for (const l of basketballLinesOf(m)) if (!out.has(l.playerId)) out.set(l.playerId, l.side);
  if (sport !== 'basketball') for (const l of footballLinesOf(m)) if (l.played && !out.has(l.playerId)) out.set(l.playerId, l.side);
  return out;
}

/**
 * Respaldo por plantilla, solo si el partido no tiene ningún dato de alineación: los de la plantilla de cada lado
 * que ya estaban (`team_players.created_at` ≤ fecha del partido). Vale para días activos, debut y kilometraje.
 */
export function rosterFallback(m: Match, teamPlayers: readonly SnapTeamPlayer[], date: string, tz?: string | null): Map<string, Side> {
  const out = new Map<string, Side>();
  for (const s of m.sides) {
    if (!s.teamId) continue;
    for (const tp of teamPlayers) {
      const since = localDate(tp.created_at, tz);
      if (tp.team_id === s.teamId && since && since <= date && !out.has(tp.player_id)) out.set(tp.player_id, s.side);
    }
  }
  return out;
}

/** TS de baloncesto: la línea coherente del jugador en un partido con líneas (el T2 lo revisa quien llama). */
export function basketballStatLine(m: Match, playerId: string): BasketballLine | null {
  if (!hasLines(m)) return null;
  const l = basketballLinesOf(m).find((x) => x.playerId === playerId);
  return l && coherentBasketballLine(l) ? l : null;
}

/** TS de fútbol y sala: la línea del jugador con `played` (los autogoles nunca cuentan para quien los hizo). */
export function footballStatLine(m: Match, playerId: string): FootballLine | null {
  if (!hasLines(m)) return null;
  return footballLinesOf(m).find((x) => x.playerId === playerId && x.played) ?? null;
}

// ---------------------------------------------------------------------------------------------------------
// T2

export interface TeamContext {
  now: number;
  userOf: (playerId: string) => string | null;
  /** Plantillas de los equipos de temporada de la liga. */
  teamPlayers: readonly SnapTeamPlayer[];
  /** Owner y admins de la liga. */
  staff: ReadonlySet<string>;
}

/** Cuentas de la plantilla de un equipo (con rol, si se pide). */
export function rosterAccounts(teamId: string | null, ctx: Pick<TeamContext, 'userOf' | 'teamPlayers'>, roles?: readonly SnapTeamPlayer['role'][]): Set<string> {
  const out = new Set<string>();
  if (!teamId) return out;
  for (const tp of ctx.teamPlayers) {
    if (tp.team_id !== teamId || (roles && !roles.includes(tp.role))) continue;
    const u = ctx.userOf(tp.player_id);
    if (u) out.add(u);
  }
  return out;
}

/**
 * Por qué un partido T1 es T2 para un lado, o null:
 * - `oficial`: lo anotó un admin, anotador u oficial (`proposed_side` nulo) que no está en la plantilla del lado;
 * - `rival`: lo confirmó un capitán o delegado con cuenta del otro equipo, o lo propuso uno de ellos y quedó
 *   final (los dos equipos están de acuerdo);
 * - `plazo`: quedó final a las 48 h sin reclamo y el otro equipo tiene capitán o delegado con cuenta;
 * - `neutral`: lo confirmó (o resolvió) un owner o admin que no está en ninguna de las dos plantillas.
 */
export type T2Reason = 'oficial' | 'rival' | 'plazo' | 'neutral';

export function t2Reason(m: Match, side: Side, ctx: TeamContext): T2Reason | null {
  if (!isT1(m, ctx.now)) return null;
  const mineTeam = m.sides[side - 1].teamId;
  const theirTeam = m.sides[other(side) - 1].teamId;
  const mine = rosterAccounts(mineTeam, ctx);
  for (const p of m.sides[side - 1].players) {
    const u = ctx.userOf(p.playerId);
    if (u) mine.add(u);
  }
  const theirs = rosterAccounts(theirTeam, ctx);
  const theirLeads = rosterAccounts(theirTeam, ctx, ['captain', 'delegate']);
  if (m.proposedSide === null && m.proposedBy && !mine.has(m.proposedBy)) return 'oficial';
  if ((m.confirmedBy && theirLeads.has(m.confirmedBy)) || (m.proposedBy && theirLeads.has(m.proposedBy))) return 'rival';
  if (m.status === 'finished' && !m.disputedAt && theirLeads.size > 0) return 'plazo';
  const c = m.confirmedBy;
  if (c && ctx.staff.has(c) && !mine.has(c) && !theirs.has(c)) return 'neutral';
  return null;
}

export const isT2 = (m: Match, side: Side, ctx: TeamContext): boolean => t2Reason(m, side, ctx) !== null;

// ---------------------------------------------------------------------------------------------------------
// Resultado y actividad

/**
 * Resultado de un lado: 'G' ganó, 'E' empató (un empate que se decide por penales es empate), 'P' perdió. Sale de
 * `score.sides`; si falta, del ganador.
 */
export function teamOutcome(m: Pick<Match, 'score' | 'winner'>, side: Side): 'G' | 'E' | 'P' | null {
  const s = m.score?.sides;
  if (Array.isArray(s) && s.length === 2 && s.every((x) => typeof x === 'number')) {
    const [me, them] = side === 1 ? s : [s[1], s[0]];
    return me > them ? 'G' : me < them ? 'P' : 'E';
  }
  if (m.winner === null) return null;
  return m.winner === side ? 'G' : 'P';
}

/** Ganó en la tanda de penales (fútbol y sala). */
export function wonShootout(m: Pick<Match, 'score'>, side: Side): boolean {
  const pens = pensFromScore(m.score);
  const s = m.score?.sides;
  if (!pens || !Array.isArray(s) || s[0] !== s[1]) return false;
  return side === 1 ? pens[0] > pens[1] : pens[1] > pens[0];
}

/**
 * Actividad válida de equipos: aparecer en un partido T1. Si el partido no tiene ningún dato de alineación, la
 * plantilla (marcada `roster`). Todos los partidos de la liga son oficiales.
 */
export function teamActivity(
  matches: readonly Match[],
  ctx: Pick<TeamContext, 'now' | 'userOf' | 'teamPlayers'> & { sport: TeamSport; tz?: string | null },
): ActivityDay[] {
  const out: ActivityDay[] = [];
  for (const m of matches) {
    if (!isT1(m, ctx.now)) continue;
    const date = dateOfMatch(m, ctx.tz);
    if (!date) continue;
    const seen = appearances(m, ctx.sport);
    const roster = seen.size === 0;
    const who = roster ? rosterFallback(m, ctx.teamPlayers, date, ctx.tz) : seen;
    for (const p of who.keys()) {
      out.push({ sport: ctx.sport, league_id: m.leagueId, player_id: p, user_id: ctx.userOf(p), date, official: true, ...(roster ? { roster: true } : {}) });
    }
  }
  return out;
}
