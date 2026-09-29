import { useEffect, useId, useMemo, useRef } from 'react';
import { useBadgeDefs } from './BadgeDefs';
import { badgeModel } from './geometry';
import { nodesToElements, sceneDefs } from './svg';
import { safeId, svgToReact } from './svgReact';
import type { BadgeLook } from './types';

/** Duración de la animación (§4.8) y de la versión calmada. */
export const UNLOCK_MS = 1300;
export const CALM_MS = 200;
/** El teléfono vibra cuando la insignia termina de crecer. */
export const VIBRATE_AT_MS = 650;
export const UNLOCK_VIBRATION = [12, 40, 18] as const;

/** Movimiento reducido pedido por el usuario o pestaña que no se ve: solo el fundido, sin vibrar (como ui.tsx). */
export function prefersCalm(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return true;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden;
  } catch {
    return false;
  }
}

function vibrate() {
  try {
    // Sin un toque previo el navegador no deja vibrar (y avisa en la consola): se salta.
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (document.visibilityState === 'visible' && typeof navigator.vibrate === 'function' && (!ua || ua.hasBeenActive)) navigator.vibrate([...UNLOCK_VIBRATION]);
  } catch {
    // Sin vibración.
  }
}

export interface UnlockInsigniaProps {
  badge: BadgeLook;
  /** Píxeles del cuadro (por defecto 240, el aviso al ganar). La insignia ocupa 128/200; el resto es para las partículas. */
  px?: number;
  /** Nombre accesible; sin él va `aria-hidden` (el modal ya dice el nombre). */
  label?: string;
  /** Cambiar este número repite la animación («Ver otra vez»). */
  replay?: number;
  /** Solo el fundido, como con movimiento reducido (la vista «Sin movimiento» de la galería). */
  still?: boolean;
  /** Al terminar: 1.3 s, o 200 ms en la versión calmada. */
  onDone?: () => void;
  className?: string;
}

/**
 * La animación de desbloqueo (§4.8): de la silueta a la insignia con un brinco, una banda de brillo, la cinta que se
 * despliega y partículas del metal; el teléfono vibra a los 650 ms. CSS puro sobre los grupos del SVG con
 * `animation-fill-mode: both` (index.css): el último fotograma es la insignia en reposo, así la regla global de
 * movimiento reducido cae sola en el final. Con movimiento reducido o la pestaña oculta: solo un fundido de 200 ms.
 */
export function UnlockInsignia({ badge, px = 240, label, replay = 0, still, onDone, className }: UnlockInsigniaProps) {
  useBadgeDefs();
  const id = safeId(useId());
  const scene = useMemo(() => badgeModel(badge, { size: 128, px, animate: true, gradientId: `mm-gc-${id}` }), [badge, px, id]);
  // Se decide cada vez que empieza (`replay`): el ajuste pudo cambiar o la pestaña quedar oculta.
  const calm = useMemo(() => !!still || prefersCalm(), [still, replay]);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    const timers = [window.setTimeout(() => done.current?.(), calm ? CALM_MS : UNLOCK_MS)];
    if (!calm) timers.push(window.setTimeout(vibrate, VIBRATE_AT_MS));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [calm, replay]);

  const defs = sceneDefs(scene);
  const titleId = `mm-bt-${id}`;
  return (
    <svg
      // Una llave nueva reinicia las animaciones CSS.
      key={replay}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={scene.viewBox.join(' ')}
      width={px}
      height={px}
      className={`bd bd-anim${calm ? ' bd-calm' : ''}${className ? ` ${className}` : ''}`}
      focusable="false"
      {...(label ? { role: 'img', 'aria-labelledby': titleId } : { 'aria-hidden': true })}
    >
      {label && <title id={titleId}>{label}</title>}
      {defs.length > 0 && <defs>{defs.map((d, i) => svgToReact(d, i))}</defs>}
      {nodesToElements(scene.nodes, 'css').map((el, i) => svgToReact(el, i))}
    </svg>
  );
}
