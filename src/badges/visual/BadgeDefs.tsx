import { useEffect, useLayoutEffect } from 'react';
import { SHARED_DEFS, badgeDefsMarkup } from './svg';
import { svgToReact } from './svgReact';

/** Id del `<svg>` escondido con los degradados y recortes que comparten todas las insignias. */
export const BADGE_DEFS_ID = 'mm-badge-defs';

/**
 * Pone una sola vez en la página (al final de `body`) los degradados de los cinco metales, el brillo y un recorte por
 * forma. Sin navegador no hace nada. No se quita nunca: pesa poco y así sirve también en modales y portales.
 */
export function ensureBadgeDefs(doc: Document | undefined = typeof document === 'undefined' ? undefined : document) {
  if (!doc?.body || doc.getElementById(BADGE_DEFS_ID)) return;
  const holder = doc.createElement('div');
  holder.innerHTML = badgeDefsMarkup().replace('<svg ', `<svg id="${BADGE_DEFS_ID}" `);
  const svg = holder.firstElementChild;
  if (svg) doc.body.appendChild(svg);
}

// Antes de pintar (sin un cuadro con el marco vacío); en el servidor no hay efectos de layout.
const useIsoLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/** Asegura los `defs` compartidos (lo llama cada Insignia). */
export function useBadgeDefs() {
  useIsoLayoutEffect(() => ensureBadgeDefs(), []);
}

/**
 * Los `defs` compartidos como componente (§4.10): para páginas que se pintan en el servidor o sin JavaScript, y para
 * montarlos a mano. Las insignias los ponen solas con `ensureBadgeDefs`; si quedan dos copias, son iguales.
 */
export function BadgeDefs() {
  return (
    <svg aria-hidden="true" focusable="false" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <defs>{SHARED_DEFS.map((d, i) => svgToReact(d, i))}</defs>
    </svg>
  );
}
