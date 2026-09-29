/**
 * Validación de boliche para las insignias (docs/insignias.md §1.7.5): juegos contados (B1), validados (B2), con
 * cuadros que cuadran (B3) y con pinos anotados (BM), la regla de juez y parte, y lo que se lee de los cuadros
 * (rachas de strikes, splits, el 7-10) con los helpers de src/lib/bowling.ts.
 */
import { ALL_PINS, bitCount, isSplit, scoreGame, standingNow, validRolls } from '../../lib/bowling';
import { isValidScore } from '../../lib/stats';
import { IMPORTED, NO_PHOTO, type GameFrames } from '../../lib/types';
import type { ActivityDay, SnapEntry, SnapEvent, SnapMember, SnapSubmission } from '../snapshot';

export { isSplit };

/** Id de una foto (uuid). */
export const PHOTO_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Qué verifica un juego: foto del marcador, juego importado de BowlingX o anotado sin foto. */
export type GameMark = 'foto' | 'importado' | 'sin-foto';

export function markKind(mark: string | null | undefined): GameMark | null {
  if (!mark) return null;
  if (mark === IMPORTED) return 'importado';
  if (mark === NO_PHOTO) return 'sin-foto';
  return PHOTO_ID_RE.test(mark) ? 'foto' : null;
}

/** Juez y parte: la cuenta es owner, admin o anotador de esa liga cuando se evalúa. */
export function isJudge(member: Pick<SnapMember, 'role' | 'is_scorer'> | null | undefined): boolean {
  return !!member && (member.role === 'owner' || member.role === 'admin' || member.is_scorer);
}

/** Un juego contado (B1) con lo que se sabe de él. */
export interface BowlingGame {
  entry_id: string;
  event_id: string;
  league_id: string;
  player_id: string;
  /** Fecha del evento ('YYYY-MM-DD'). */
  date: string;
  start_time: string | null;
  /** `events.type`: 'torneo' es oficial, 'practica' no. */
  event_type: string;
  official: boolean;
  /** Número de juego en el evento, desde 0. */
  index: number;
  score: number;
  mark: GameMark;
  /** B2: foto o importado. */
  verified: boolean;
  /** B3: cuadros válidos, completos y que suman el puntaje. null si no hay o no cuadran. */
  frames: GameFrames | null;
  /** BM: B3 con pinos marcados en al menos un tiro. */
  masks: boolean;
}

/** Orden de juego: fecha, hora de inicio, evento y número de juego. */
export function gameOrder(a: Pick<BowlingGame, 'date' | 'start_time' | 'event_id' | 'index'>, b: Pick<BowlingGame, 'date' | 'start_time' | 'event_id' | 'index'>): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ta = a.start_time ?? '';
  const tb = b.start_time ?? '';
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (a.event_id !== b.event_id) return a.event_id < b.event_id ? -1 : 1;
  return a.index - b.index;
}

/** B3: los cuadros son un juego válido y terminado que suma lo anotado. */
export function framesMatch(frames: GameFrames | null | undefined, score: number): boolean {
  if (!frames || !Array.isArray(frames.rolls) || !validRolls(frames.rolls)) return false;
  const g = scoreGame(frames.rolls);
  return g.complete && g.score === score;
}

/**
 * ¿Un juego anotado sin foto por un juez y parte viene de un envío que aprobó otra cuenta? Se empareja por jugador,
 * evento (o su fecha) y puntaje; quien aprobó no es quien envió ni la cuenta del jugador.
 */
export function approvedByOther(
  entry: Pick<SnapEntry, 'player_id' | 'event_id'>,
  eventDate: string,
  score: number,
  submissions: readonly SnapSubmission[],
  playerUser: string | null,
): boolean {
  return submissions.some(
    (s) =>
      s.status === 'aprobado' &&
      s.player_id === entry.player_id &&
      (s.event_id === entry.event_id || (!s.event_id && s.date === eventDate)) &&
      s.scores.includes(score) &&
      !!s.reviewed_by &&
      s.reviewed_by !== s.created_by &&
      s.reviewed_by !== playerUser,
  );
}

export interface BowlingGamesInput {
  entries: readonly SnapEntry[];
  events: readonly SnapEvent[];
  /** ¿La cuenta del jugador de esta participación es juez y parte en su liga? */
  judge?: (entry: SnapEntry) => boolean;
  /** Cuenta del jugador (para que no se apruebe a sí mismo). */
  userOf?: (playerId: string) => string | null;
  submissions?: readonly SnapSubmission[];
}

/**
 * Los juegos B1 de unas participaciones, en orden de juego: puntaje y marca no nulos y, si el jugador es juez y
 * parte, solo fotos, importados o envíos que aprobó otra cuenta.
 */
export function bowlingGames(input: BowlingGamesInput): BowlingGame[] {
  const events = new Map(input.events.map((e) => [e.id, e]));
  const out: BowlingGame[] = [];
  for (const entry of input.entries) {
    const event = events.get(entry.event_id);
    if (!event) continue;
    const judge = input.judge?.(entry) ?? false;
    const scores = entry.scores ?? [];
    const photos = entry.photos ?? [];
    scores.forEach((score, index) => {
      if (score == null || !isValidScore(score)) return;
      const mark = markKind(photos[index]);
      if (!mark) return;
      if (judge && mark === 'sin-foto' && !approvedByOther(entry, event.date, score, input.submissions ?? [], input.userOf?.(entry.player_id) ?? null)) return;
      const raw = entry.frames?.[String(index)] ?? null;
      const frames = framesMatch(raw, score) ? raw : null;
      out.push({
        entry_id: entry.id,
        event_id: entry.event_id,
        league_id: entry.league_id,
        player_id: entry.player_id,
        date: event.date,
        start_time: event.start_time,
        event_type: event.type,
        official: event.type === 'torneo',
        index,
        score,
        mark,
        verified: mark !== 'sin-foto',
        frames,
        masks: !!frames?.masks?.some((m) => m != null),
      });
    });
  }
  return out.sort(gameOrder);
}

/** Referencia de un juego para `badge_awards.refs`. */
export const gameRef = (g: Pick<BowlingGame, 'entry_id' | 'index'>) => `entry:${g.entry_id}:${g.index}`;

/** Actividad válida de boliche: una participación con al menos un juego B1 (oficial en torneos). */
export function bowlingActivity(games: readonly BowlingGame[], userOf: (playerId: string) => string | null): ActivityDay[] {
  const seen = new Map<string, ActivityDay>();
  for (const g of games) {
    const k = `${g.player_id}|${g.date}`;
    const prev = seen.get(k);
    if (prev) prev.official = prev.official || g.official;
    else seen.set(k, { sport: 'bowling', league_id: g.league_id, player_id: g.player_id, user_id: userOf(g.player_id), date: g.date, official: g.official });
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------------------------------------
// Lo que se lee de los cuadros

/** Racha más larga de strikes en un juego, con las bolas extra del cuadro 10. */
export function longestStrikeRun(rolls: readonly number[]): number {
  let best = 0;
  let run = 0;
  for (const m of scoreGame(rolls).frames.flatMap((f) => f.marks)) {
    run = m === 'X' ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Los pinos 7 y 10 (bits 6 y 9). */
export const SEVEN_TEN = (1 << 6) | (1 << 9);

/** Lo que quedó parado tras la primera bola de un «rack» y si la segunda lo limpió. */
export interface RackLeave {
  /** Índice del primer tiro del rack. */
  roll: number;
  /** Pinos parados (bit 0 = pin 1). */
  leave: number;
  /** La segunda bola los tumbó todos (spare). */
  converted: boolean;
}

/**
 * Racks con pinos marcados en la primera bola (BM) y segunda bola jugada. La máscara tiene que cuadrar con los pinos
 * que dice el tiro; si no, ese rack no cuenta (se escriben a mano).
 */
export function rackLeaves(rolls: readonly number[], masks: readonly (number | null)[] | undefined): RackLeave[] {
  const out: RackLeave[] = [];
  for (let i = 0; i + 1 < rolls.length; i++) {
    const before = standingNow(rolls.slice(0, i));
    if (!before?.fresh || rolls[i] === 10) continue;
    const knocked = masks?.[i];
    if (knocked == null) continue;
    const leave = ALL_PINS & ~knocked;
    if (bitCount(leave) !== 10 - rolls[i]) continue;
    out.push({ roll: i, leave, converted: rolls[i] + rolls[i + 1] === 10 });
  }
  return out;
}

/** Splits convertidos de un juego (sin el 7-10, que va aparte) y 7-10 convertidos. */
export function splitConversions(frames: GameFrames): { splits: RackLeave[]; sevenTen: RackLeave[] } {
  const racks = rackLeaves(frames.rolls, frames.masks).filter((r) => r.converted && isSplit(r.leave));
  return { splits: racks.filter((r) => r.leave !== SEVEN_TEN), sevenTen: racks.filter((r) => r.leave === SEVEN_TEN) };
}
