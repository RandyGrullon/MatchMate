import { useId, useMemo } from 'react';
import { useBadgeDefs } from './BadgeDefs';
import { badgeModel } from './geometry';
import { nodesToElements, sceneDefs } from './svg';
import { safeId, svgToReact } from './svgReact';
import type { BadgeLook, BadgeSize, BadgeState } from './types';

export interface InsigniaProps {
  /** Cómo se ve: forma, metal, campo, emblema, cinta, puntos (sale de `lookOf` o del creador). */
  badge: BadgeLook;
  /** 24, 40, 64 o 128: cada uno con su nivel de detalle (§4.6). */
  size: BadgeSize;
  /** Por defecto `unlocked`. `locked`, `progress`, `review` y `hidden` solo los ve el dueño (§4.7). */
  state?: BadgeState;
  /** De 0 a 1, con `state="progress"`: el arco de afuera. */
  progress?: number;
  /** Píxeles reales si no son `size` (por ejemplo 76 en una tarjeta). Los trazos se ajustan a este tamaño. */
  px?: number;
  /** Aire alrededor para que los anillos de `progress` y `new` queden dentro de la caja. */
  pad?: boolean;
  /**
   * Nombre accesible («Constancia, oro, octubre 2026», ver `badgeLabel`). Con él la imagen es `role="img"` con su
   * `<title>`; sin él va `aria-hidden` (el nombre ya está escrito al lado).
   */
  label?: string;
  className?: string;
}

/**
 * Una insignia en SVG. Los degradados de los metales y los recortes los pone `useBadgeDefs` una sola vez en la
 * página; los colores que cambian con el tema salen de las variables --bd-* de index.css.
 */
export function Insignia({ badge, size, state = 'unlocked', progress, px, pad, label, className }: InsigniaProps) {
  useBadgeDefs();
  const id = safeId(useId());
  const scene = useMemo(() => badgeModel(badge, { size, state, progress, px, pad, gradientId: `mm-gc-${id}` }), [badge, size, state, progress, px, pad, id]);
  const w = px ?? size;
  const defs = sceneDefs(scene);
  const titleId = `mm-bt-${id}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={scene.viewBox.join(' ')}
      width={w}
      height={w}
      className={className ? `bd ${className}` : 'bd'}
      focusable="false"
      {...(label ? { role: 'img', 'aria-labelledby': titleId } : { 'aria-hidden': true })}
    >
      {label && <title id={titleId}>{label}</title>}
      {defs.length > 0 && <defs>{defs.map((d, i) => svgToReact(d, i))}</defs>}
      {nodesToElements(scene.nodes, 'css').map((el, i) => svgToReact(el, i))}
    </svg>
  );
}
