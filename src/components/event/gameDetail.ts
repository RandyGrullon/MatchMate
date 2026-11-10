/**
 * La lógica del detalle de un juego de boliche (GameDetailModal.tsx), sin React ni pantallas: la comparten la web y la
 * app del teléfono (movil/src/components/bowling/GameDetail.tsx). El puesto, los pinos y el promedio de arriba, los
 * strikes, spares y abiertos de lo anotado tiro por tiro, y cada juego con si cuenta, sus cuadros y su foto.
 */
import { frameStats } from '../../lib/bowling';
import { entryLine, eventPosition, type Line } from '../../lib/stats';
import { IMPORTED, NO_PHOTO, type BowlingEvent, type Entry, type GameFrames } from '../../lib/types';

/** Un juego del detalle. */
export interface DetailGame {
  /** Pinos (también lo que falta por verificar); null = sin jugar. */
  score: number | null;
  /** Tiene su foto (o la marca de «sin foto» / importado): cuenta. */
  verified: boolean;
  /** Lo anotado tiro por tiro; null si solo se anotó el total. */
  frames: GameFrames | null;
  /** La foto del marcador para verla en grande (no las marcas de «sin foto» ni importado); null si no hay. */
  photo: string | null;
}

export interface GameDetail {
  line: Line;
  isTorneo: boolean;
  /** «Posición» (torneo) o «Puesto» (práctica). */
  placeLabel: string;
  pos: { pos: number; of: number } | null;
  /** «Total c/hcp» (torneo con handicap) o «Pinos». */
  pinsLabel: string;
  pins: number;
  /** Strikes, spares y abiertos de los juegos anotados tiro por tiro; null si ninguno lo está. */
  totals: { strikes: number; spares: number; opens: number } | null;
  games: DetailGame[];
}

/** Lo que dice el detalle del juego de alguien en un evento (con lo que falta por verificar a la vista). */
export function gameDetail(event: BowlingEvent, entries: Entry[], entry: Entry): GameDetail {
  const line = entryLine(entry, event, true);
  const pos = eventPosition(event, entries, entry.id);
  const photos = entry.photos ?? [];
  const allFrames = Object.values(entry.frames ?? {});
  const totals = allFrames.reduce(
    (acc, f) => {
      const s = frameStats(f.rolls);
      return { strikes: acc.strikes + s.strikes, spares: acc.spares + s.spares, opens: acc.opens + s.opens };
    },
    { strikes: 0, spares: 0, opens: 0 },
  );
  const isTorneo = event.type === 'torneo';
  return {
    line,
    isTorneo,
    placeLabel: isTorneo ? 'Posición' : 'Puesto',
    pos,
    pinsLabel: isTorneo && line.hcp ? 'Total c/hcp' : 'Pinos',
    pins: isTorneo && line.hcp ? line.total : line.scratch,
    totals: allFrames.length > 0 ? totals : null,
    games: line.scores.map((s, i) => {
      const p = photos[i] ?? null;
      return {
        score: s,
        verified: s != null && p != null,
        frames: entry.frames?.[i] ?? null,
        photo: p && p !== NO_PHOTO && p !== IMPORTED ? p : null,
      };
    }),
  };
}

/** Debajo de un juego anotado sin los tiros. */
export const ONLY_TOTAL_TEXT = 'Anotado solo el total (sin cuadros).';
