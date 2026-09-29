import { TrendingUp, Trophy } from 'lucide-react';
import { hasMark, marksSummary, overLabel, type GameMark } from '../../lib/bowlingSeason';
import { Badge, cx } from '../ui';

/**
 * Marcas de un juego de boliche (src/lib/bowlingSeason.ts): «Récord personal» (el más alto en la liga hasta ese
 * juego) y «+18 sobre tu promedio» (15 o más por encima de su promedio de la temporada). `mine`: el juego es de quien
 * mira («tu promedio»); si no, «su promedio».
 */

/** Resalta el cuadrito de un juego con marca. */
export const markedChip = (mark: GameMark | null | undefined) => (hasMark(mark) ? 'bg-accent-soft text-accent' : null);

/** Ícono chico dentro del cuadrito (trofeo si es récord, flecha si pasó su promedio). */
export function MarkIcon({ mark, className = 'size-3' }: { mark: GameMark | null | undefined; className?: string }) {
  if (!hasMark(mark)) return null;
  return mark.record ? <Trophy className={className} aria-hidden="true" /> : <TrendingUp className={className} aria-hidden="true" />;
}

/** Las marcas del juego como etiquetas (detalle del juego). */
export function GameMarkBadges({ mark, mine = true }: { mark: GameMark | null | undefined; mine?: boolean }) {
  if (!hasMark(mark)) return null;
  return (
    <>
      {mark.record && (
        <Badge tone="accent">
          <Trophy className="size-3" aria-hidden="true" /> Récord personal
        </Badge>
      )}
      {mark.over != null && (
        <Badge tone="ok">
          <TrendingUp className="size-3" aria-hidden="true" /> {overLabel(mark.over, mine)}
        </Badge>
      )}
    </>
  );
}

/** Las marcas de todos los juegos en una línea: «Récord personal en el juego 2 · +18 sobre tu promedio en el juego 3». */
export function MarksLine({ marks, mine = true, className }: { marks: readonly (GameMark | null)[] | null | undefined; mine?: boolean; className?: string }) {
  const parts = marks ? marksSummary(marks, mine) : [];
  if (!parts.length) return null;
  return <p className={cx('flex items-center gap-1 text-xs font-medium text-accent', className)}>{parts.join(' · ')}</p>;
}
