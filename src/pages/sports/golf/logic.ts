/**
 * Golf: de lo que llega de la base (src/lib/data/golf.ts) a lo que pide el motor (src/sports/golf) y vuelta.
 * Todo puro (sin React): leaderboard de la ronda y del torneo, orden de mérito, estadísticas y textos cortos.
 */
import { teeHoles, type GolfCourse, type Nine, type PlayedHole } from '../../../sports/golf/course';
import { golfLeaderboard, orderOfMerit, type GolfLeaderRow, type GolfPlayerRounds, type MeritRow } from '../../../sports/golf/leaderboard';
import { scoreRound, type GolfCard, type GolfCompetition, type GolfRound, type RoundScore } from '../../../sports/golf/scoring';
import { golfStats, type GolfStats } from '../../../sports/golf/stats';
import type { GolfCardDoc, GolfPlayerData, GolfRoundDoc, GolfRoundFull, GolfSeasonData } from '../../../lib/data/golf';

// ---------- Tarjeta → motor ----------

/** Hoyos que juega una tarjeta (con el par y el SI de su salida), en el orden de la tarjeta. */
export function cardHoles(round: { course: GolfCourse; nine: Nine }, teeId: string): PlayedHole[] {
  const tee = round.course.tees.find((t) => t.id === teeId) ?? round.course.tees[0];
  if (!tee) return [];
  return teeHoles(round.course, tee, round.nine);
}

/** Lo anotado de la tarjeta en la forma del motor. */
export const cardOf = (c: Pick<GolfCardDoc, 'strokes' | 'putts' | 'pickedUp'>): GolfCard => ({ strokes: c.strokes, putts: c.putts, pickedUp: c.pickedUp });

/** La ronda de un jugador para el motor. `card` permite pasar lo anotado en el teléfono encima de lo del servidor. */
export function golfRoundOf(round: { course: GolfCourse; nine: Nine }, c: GolfCardDoc, card: GolfCard = cardOf(c)): GolfRound {
  return { holes: cardHoles(round, c.teeId), playingHcp: c.playingHcp, card };
}

/** Hoyos terminados (con golpes o «recogió»). */
export const holesDone = (c: Pick<GolfCardDoc, 'strokes' | 'pickedUp'>) => c.strokes.filter((s, i) => s != null || c.pickedUp[i]).length;

export const isComplete = (c: Pick<GolfCardDoc, 'strokes' | 'pickedUp'>) => c.strokes.length > 0 && holesDone(c) === c.strokes.length;

/** Índice (en la tarjeta) del hoyo por el que sale: el hoyo real `startHole` menos el primero de la ronda. */
export function startIndex(round: { course: GolfCourse; nine: Nine }, startHole: number): number {
  const first = round.course.holes.length === 18 && round.nine === 'back' ? 10 : 1;
  const n = round.course.holes.length === 18 && round.nine !== 'all' ? 9 : round.course.holes.length;
  const i = startHole - first;
  return i >= 0 && i < n ? i : 0;
}

// ---------- Competencia ----------

export type BoardMode = 'official' | 'net' | 'gross' | 'stableford';

/** Cómo se ve el leaderboard: el oficial de la ronda o, para mirar, neto, bruto o Stableford. */
export function modeCompetition(comp: GolfCompetition, mode: BoardMode): GolfCompetition {
  if (mode === 'official') return comp;
  if (mode === 'stableford') return { format: 'stableford', basis: 'net', allowance: comp.allowance };
  return { format: 'stroke', basis: mode, allowance: comp.allowance };
}

/** Modos que tiene sentido mostrar (sin repetir el oficial). */
export function boardModes(comp: GolfCompetition): BoardMode[] {
  const official: BoardMode | null =
    comp.format === 'stableford' && comp.basis === 'net' ? 'stableford' : comp.format === 'stroke' ? (comp.basis === 'net' ? 'net' : 'gross') : null;
  return (['official', 'net', 'gross', 'stableford'] as BoardMode[]).filter((m) => m !== official);
}

export function formatLabel(comp: GolfCompetition): string {
  const basis = comp.basis === 'net' ? 'neto' : 'bruto';
  if (comp.format === 'stableford') return comp.basis === 'net' ? 'Stableford' : 'Stableford bruto';
  if (comp.format === 'maxScore') return `Máximo por hoyo ${basis}`;
  return `Stroke play ${basis}`;
}

export function modeLabel(comp: GolfCompetition, mode: BoardMode): string {
  if (mode === 'official') return formatLabel(comp);
  return mode === 'net' ? 'Neto' : mode === 'gross' ? 'Bruto' : 'Stableford';
}

/** Plantillas de competencia para crear rondas. */
export const COMPETITION_TEMPLATES: { key: string; label: string; hint: string; comp: GolfCompetition }[] = [
  { key: 'stroke-net', label: 'Stroke play neto', hint: 'Menos golpes netos gana (95 % del handicap).', comp: { format: 'stroke', basis: 'net', allowance: 95 } },
  { key: 'stableford', label: 'Stableford', hint: 'Puntos por hoyo contra el par neto; recoger vale 0.', comp: { format: 'stableford', basis: 'net', allowance: 95 } },
  { key: 'stroke-gross', label: 'Stroke play bruto', hint: 'Sin handicap: menos golpes gana.', comp: { format: 'stroke', basis: 'gross', allowance: 100 } },
  { key: 'max', label: 'Máximo por hoyo', hint: 'Cada hoyo cuenta hasta doble bogey neto; recoger cuenta el tope.', comp: { format: 'maxScore', basis: 'net', allowance: 95 } },
];

export const sameCompetition = (a: GolfCompetition, b: GolfCompetition) =>
  a.format === b.format && a.basis === b.basis && (a.allowance ?? 95) === (b.allowance ?? 95);

// ---------- Leaderboards ----------

export interface BoardRow extends GolfLeaderRow {
  /** Tarjeta de la última ronda del jugador en este leaderboard (para abrir el detalle). */
  card: GolfCardDoc | null;
  /** Ronda cerrada y la tarjeta quedó sin terminar. */
  unfinished: boolean;
}

/**
 * Leaderboard de una ronda (id = jugador). Con la ronda cerrada, quien no terminó sale como descalificado
 * (sin puesto). `local` = tarjetas anotadas en el teléfono que todavía no llegan al servidor.
 */
export function roundBoard(round: GolfRoundFull, cards: readonly GolfCardDoc[], comp: GolfCompetition, local?: (c: GolfCardDoc) => GolfCard): BoardRow[] {
  const byPlayer = new Map(cards.map((c) => [c.playerId, c] as const));
  const unfinished = new Set<string>();
  const players: GolfPlayerRounds[] = cards.map((c) => {
    const card = local ? local(c) : cardOf(c);
    if (round.closed && !c.dq && !isComplete({ strokes: card.strokes, pickedUp: card.pickedUp ?? [] })) unfinished.add(c.playerId);
    return { id: c.playerId, rounds: [golfRoundOf(round, c, card)], dq: c.dq || unfinished.has(c.playerId) };
  });
  return golfLeaderboard(players, comp, { rounds: 1 }).map((r) => ({ ...r, card: byPlayer.get(r.id) ?? null, unfinished: unfinished.has(r.id) }));
}

/**
 * Leaderboard de un torneo: suma de sus rondas (en orden), con countback por la última. Una ronda ya cerrada
 * que el jugador no jugó (sin tarjeta) o no terminó lo deja sin puesto («No terminó»): no puede ganar sumando
 * menos rondas que los demás. Las rondas abiertas suman lo que va.
 */
export function tournamentBoard(rounds: readonly GolfRoundFull[], cards: readonly GolfCardDoc[], comp: GolfCompetition): BoardRow[] {
  const ordered = [...rounds].sort((a, b) => (a.roundNo ?? 0) - (b.roundNo ?? 0));
  const ids = [...new Set(cards.map((c) => c.playerId))];
  const cardAt = (eventId: string, pid: string) => cards.find((c) => c.eventId === eventId && c.playerId === pid) ?? null;
  /** Ronda cerrada sin tarjeta, o con la tarjeta sin terminar (y sin descalificar por el comité). */
  const missed = (c: GolfCardDoc | null, i: number) => ordered[i].closed && (!c || (!c.dq && !isComplete(c)));
  const players: GolfPlayerRounds[] = ids.map((pid) => {
    const mine = ordered.map((r) => cardAt(r.eventId, pid));
    const dq = mine.some((c, i) => !!c?.dq || missed(c, i));
    return { id: pid, rounds: ordered.map((r, i) => (mine[i] ? golfRoundOf(r, mine[i]!) : null)), dq };
  });
  return golfLeaderboard(players, comp, { rounds: ordered.length }).map((r) => {
    const mine = ordered.map((x) => cardAt(x.eventId, r.id));
    const last = [...mine].reverse().find((c) => !!c) ?? null;
    return { ...r, card: last, unfinished: mine.some((c, i) => missed(c, i)) };
  });
}

// ---------- Orden de mérito ----------

export interface MeritEvent {
  /** Ronda suelta (id del evento) o torneo (id del torneo). */
  id: string;
  kind: 'ronda' | 'torneo';
  /** Eventos de la liga que lo forman. */
  eventIds: string[];
  rows: { id: string; rank: number | null }[];
}

/**
 * Eventos que cuentan para el orden de mérito: cada ronda suelta cerrada y cada torneo con TODAS sus rondas
 * cerradas (un torneo es un solo evento). `inSeason` filtra por fecha (la temporada de la liga).
 */
export function meritEvents(season: GolfSeasonData, allRounds: readonly GolfRoundDoc[], inSeason: (eventId: string) => boolean = () => true): MeritEvent[] {
  const out: MeritEvent[] = [];
  const closed = season.rounds.filter((r) => r.closed && inSeason(r.eventId));
  for (const r of closed.filter((x) => !x.tournamentId)) {
    const rows = roundBoard(r, season.cards.filter((c) => c.eventId === r.eventId), r.competition);
    out.push({ id: r.eventId, kind: 'ronda', eventIds: [r.eventId], rows: rows.map((x) => ({ id: x.id, rank: x.rank })) });
  }
  const tournaments = new Set(closed.map((r) => r.tournamentId).filter((t): t is string => !!t));
  for (const t of tournaments) {
    const all = allRounds.filter((r) => r.tournamentId === t);
    const mine = closed.filter((r) => r.tournamentId === t);
    if (!all.length || all.some((r) => !r.closed) || mine.length !== all.length) continue;
    const comp = [...mine].sort((a, b) => (a.roundNo ?? 0) - (b.roundNo ?? 0))[0].competition;
    const ids = mine.map((r) => r.eventId);
    const rows = tournamentBoard(mine, season.cards.filter((c) => ids.includes(c.eventId)), comp);
    out.push({ id: t, kind: 'torneo', eventIds: ids, rows: rows.map((x) => ({ id: x.id, rank: x.rank })) });
  }
  return out;
}

export function seasonMerit(events: readonly MeritEvent[], points: readonly number[]): MeritRow[] {
  return orderOfMerit(events, points);
}

// ---------- Estadísticas del jugador ----------

export interface PlayedRound {
  eventId: string;
  round: GolfRoundFull;
  card: GolfCardDoc;
  /** Puntaje con la competencia de la ronda. */
  score: RoundScore;
  /** Puntaje en Stableford neto (para comparar entre formatos). */
  stableford: RoundScore;
}

/** Rondas que cuentan para las estadísticas: firmadas o de rondas cerradas, y sin descalificar. */
export function playedRounds(data: GolfPlayerData): PlayedRound[] {
  const byEvent = new Map(data.rounds.map((r) => [r.eventId, r] as const));
  const out: PlayedRound[] = [];
  for (const card of data.cards) {
    const round = byEvent.get(card.eventId);
    if (!round || card.dq || (!card.signed && !round.closed) || !holesDone(card)) continue;
    const gr = golfRoundOf(round, card);
    out.push({ eventId: card.eventId, round, card, score: scoreRound(gr, round.competition), stableford: scoreRound(gr, { format: 'stableford', basis: 'net' }) });
  }
  return out;
}

export function playerStats(rounds: readonly PlayedRound[]): GolfStats {
  return golfStats(rounds.map((r) => golfRoundOf(r.round, r.card)));
}

/** Mejores rondas completas: menos golpes netos (sin «recogió» en stroke), primero las de 18 hoyos. */
export function bestRounds(rounds: readonly PlayedRound[], n = 5): PlayedRound[] {
  return rounds
    .filter((r) => r.score.complete && r.stableford.gross != null)
    .sort((a, b) => b.card.strokes.length - a.card.strokes.length || (a.stableford.netToPar ?? 0) - (b.stableford.netToPar ?? 0))
    .slice(0, n);
}

// ---------- Textos ----------

/** Contra el par: «E» (par), «+3», «−2». null = «–». */
export function toParText(v: number | null | undefined): string {
  if (v == null) return '–';
  if (v === 0) return 'E';
  return v > 0 ? `+${v}` : `−${Math.abs(v)}`;
}

/** Hoyos jugados: «F» con la ronda completa, el número si va a mitad, «–» sin empezar. */
export function thruText(thru: number, holes: number): string {
  if (!thru) return '–';
  return thru >= holes ? 'F' : String(thru);
}

/** Número con coma decimal (es-DO usa punto; en golf el Index se escribe con punto también). */
export const indexText = (v: number | null | undefined) => (v == null ? 'Sin Index' : v < 0 ? `+${Math.abs(v).toFixed(1)}` : v.toFixed(1));

/** Handicap de juego para mostrar: los «plus» con +. */
export const hcpText = (v: number) => (v < 0 ? `+${Math.abs(v)}` : String(v));

/** Nombre de la vuelta. */
export const nineLabel = (nine: Nine, holes: number) => (nine === 'front' ? 'Ida (1–9)' : nine === 'back' ? 'Vuelta (10–18)' : `${holes} hoyos`);

/** Nombre del hoyo según su resultado contra el par (para colorear la tarjeta). */
export function holeTone(strokes: number | null, par: number): 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | null {
  if (strokes == null) return null;
  const d = strokes - par;
  return d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double';
}
