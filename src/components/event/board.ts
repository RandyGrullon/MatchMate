import { isValidScore, slots } from '../../lib/stats';
import type { BowlingEvent, Entry, LiveScore, Submission } from '../../lib/types';

/**
 * Cómo van todos en un evento del boliche, juego por juego: lo que usan «Cómo van todos» (Lite) y la Planilla (Pro), que
 * son la misma tabla. Solo **suma** lo que cuenta (en la tabla, aprobado); lo demás se ve, pero no suma:
 * - `ok`: en la tabla y cuenta (verificado con foto, o anotado en una liga que no exige foto).
 * - `pend`: «Por aprobar» (ámbar en Pro, gris en Lite): enviado por el jugador y sin aprobar, o en la tabla sin la foto
 *   que la liga exige.
 * - `play`: «Jugando»: guardado en el teléfono del jugador sin enviar, o a medias en la hoja de anotar («74…»).
 * - `empty`: sin anotar.
 */
export type BoardCellKind = 'ok' | 'pend' | 'play' | 'empty';

export interface BoardCell {
  kind: BoardCellKind;
  /** Pinos; a medias, lo que lleva (null si todavía no suma nada: un strike que espera). */
  score: number | null;
  /** A medias en la hoja de anotar («74…»): el juego no ha terminado. */
  partial?: boolean;
}

export interface BoardRow {
  playerId: string;
  /** Su participación (si ya está en la planilla): se toca para anotar o para ver el juego. */
  entry: Entry | null;
  cells: BoardCell[];
  /** Solo lo que cuenta (`ok`). */
  total: number;
  /** Juegos que cuentan. */
  counted: number;
  /** Puesto por lo que cuenta (los empates comparten). */
  pos: number;
}

/** Lo que quedó a medias en la hoja de anotar de este teléfono (draftMemory). */
export type PartialOf = (playerId: string, entry: Entry | null, game: number) => { score: number | null } | null;

const newest = (s: Pick<Submission, 'createdAt'>) => s.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;

/**
 * Las filas, de la que más suma a la que menos. En una práctica salen también quienes enviaron juegos o los van anotando
 * en su teléfono sin estar en la planilla; en un torneo, solo los inscritos. `all`: también los que no tienen nada (la
 * Planilla los lista para anotarles); si no, solo los que ya tienen algún juego.
 */
export function boardRows(
  event: Pick<BowlingEvent, 'games' | 'type'>,
  entries: readonly Entry[],
  subs: readonly Submission[],
  live: readonly LiveScore[],
  { partial, all = false }: { partial?: PartialOf; all?: boolean } = {},
): BoardRow[] {
  const pending = subs.filter((s) => s.status === 'pendiente');
  const ids = new Set(event.type === 'torneo' ? entries.map((e) => e.playerId) : [...entries.map((e) => e.playerId), ...pending.map((s) => s.playerId), ...live.map((l) => l.playerId)]);
  const rows: Omit<BoardRow, 'pos'>[] = [];
  for (const playerId of ids) {
    const entry = entries.find((e) => e.playerId === playerId) ?? null;
    const mine = pending.filter((s) => s.playerId === playerId).sort((a, b) => newest(b) - newest(a));
    const phone = live.find((l) => l.playerId === playerId);
    const count = Math.max(event.games, phone?.scores.length ?? 0, ...mine.map((s) => s.scores.length));
    const scores = slots(entry?.scores, count, null);
    const photos = slots(entry?.photos, count, null);
    // Lo que corrigió en el teléfono después de enviarlo manda (como en el tablero en vivo).
    const phoneAt = phone?.updatedAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
    const cells = Array.from({ length: count }, (_, i): BoardCell => {
      if (scores[i] != null) return { kind: photos[i] != null ? 'ok' : 'pend', score: scores[i] };
      const sentBy = mine.find((s) => s.scores[i] != null);
      const sent = sentBy?.scores[i];
      const typed = phone?.scores[i];
      const phoneOk = typed != null && isValidScore(typed);
      if (sent != null && isValidScore(sent) && !(phoneOk && phoneAt > newest(sentBy!))) return { kind: 'pend', score: sent };
      if (phoneOk) return { kind: 'play', score: typed };
      const half = partial?.(playerId, entry, i);
      if (half) return { kind: 'play', score: half.score, partial: true };
      return { kind: 'empty', score: null };
    });
    // Sin juegos de más al final (J4, J5 vacíos).
    while (cells.length > event.games && cells[cells.length - 1].kind === 'empty') cells.pop();
    if (!all && cells.every((c) => c.kind === 'empty')) continue;
    const ok = cells.filter((c) => c.kind === 'ok');
    rows.push({ playerId, entry, cells, total: ok.reduce((a, c) => a + c.score!, 0), counted: ok.length });
  }
  const known = (r: Omit<BoardRow, 'pos'>) => r.cells.filter((c) => c.kind !== 'empty').length;
  rows.sort((a, b) => b.total - a.total || b.counted - a.counted || known(b) - known(a));
  let pos = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.total !== rows[i - 1].total) pos = i + 1;
    return { ...r, pos };
  });
}

/** «Pedro Gómez» → «Pedro G.» (la Planilla, donde el nombre va en una columna angosta). */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? name;
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

/**
 * Los juegos de una fila de «Cómo van todos», separados por « · »: lo que no cuenta va aparte (`faint`) y el que va a
 * medias dice «jugando el 3». Los vacíos del final no salen; uno vacío en medio, «–».
 */
export function boardLine(cells: readonly BoardCell[]): { text: string; faint: boolean }[] {
  let last = cells.length - 1;
  while (last >= 0 && cells[last].kind === 'empty') last--;
  return cells.slice(0, last + 1).map((c, i) => {
    if (c.kind === 'empty') return { text: '–', faint: true };
    if (c.partial) return { text: `jugando el ${i + 1}`, faint: false };
    return { text: String(c.score), faint: c.kind !== 'ok' };
  });
}

/** «1», «1 y 2», «1, 2 y 3» (los números de juego, desde 0). */
export function gamesList(idx: readonly number[]): string {
  const n = idx.map((i) => String(i + 1));
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}` : (n[0] ?? '');
}
