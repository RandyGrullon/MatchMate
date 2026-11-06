import { cx } from '../ui';
import { inkOn, teamInitials } from './logic';

/**
 * Piezas de los equipos fijos del boliche: la marca del equipo (su color con el número o las iniciales) y el punto de
 * color. Lo que no dibuja (iniciales, letra sobre el color, «4 jugadores», el promedio de cada jugador) está en
 * logic.ts, que también usa la app del teléfono; se re-exporta aquí.
 */

export { inkOn, playersWord, teamInitials, useLeagueAverages } from './logic';

/** El escudo del equipo en las filas: un cuadrado de 40 px en su color, con el número o las iniciales. */
export function TeamMark({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold tracking-normal', className)}
      style={{ background: color, color: inkOn(color) }}
    >
      {teamInitials(name)}
    </span>
  );
}

/** El punto de color del equipo (12 px). */
export function TeamDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={cx('size-3 shrink-0 rounded-full', className)} style={{ background: color }} />;
}
