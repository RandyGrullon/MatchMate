/**
 * Zoom con los dedos: se puede ampliar en toda la app (tablas, fotos, textos chicos: sobre todo para los
 * jugadores mayores), MENOS en el modo cancha, donde los toques rápidos anotan puntos y un pellizco o un doble
 * toque no debe mover la pantalla.
 *
 * - En toda la app: `touch-action: manipulation` en <html> (deslizar y pellizcar sí; el doble toque no amplía,
 *   así los botones responden al instante) y el meta viewport sin `user-scalable=no`.
 * - Modo cancha (`lockZoom()` o `useZoomLock()` mientras está abierto): el meta viewport vuelve a
 *   `maximum-scale=1, user-scalable=no` (Android lo respeta y deja la escala en 1), `touch-action: pan-x pan-y`, y
 *   en Safari del iPhone (que ignora el meta) se frenan los gestos de pellizco.
 */
import { useEffect } from 'react';

const OPEN_VIEWPORT = 'width=device-width, initial-scale=1, viewport-fit=cover';
const LOCKED_VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

let locks = 0;
let listening = false;

const stop = (e: Event) => {
  if (locks > 0) e.preventDefault();
};
// Dos dedos moviéndose = pellizco (respaldo para Safari).
const stopPinch = (e: TouchEvent) => {
  if (locks > 0 && e.touches.length > 1) e.preventDefault();
};

function apply() {
  if (typeof document === 'undefined') return;
  const locked = locks > 0;
  document.documentElement.style.touchAction = locked ? 'pan-x pan-y' : 'manipulation';
  if (locked) document.documentElement.dataset.zoomLock = '';
  else delete document.documentElement.dataset.zoomLock;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta) meta.content = locked ? LOCKED_VIEWPORT : OPEN_VIEWPORT;
}

/**
 * Prepara el zoom de la app (una vez, al abrir): se puede ampliar con los dedos. Los gestos solo se frenan
 * mientras haya un modo cancha abierto.
 */
export function setupZoom() {
  if (typeof document === 'undefined') return;
  if (!listening) {
    listening = true;
    // Pellizco en Safari (iPhone/iPad).
    document.addEventListener('gesturestart', stop, { passive: false });
    document.addEventListener('gesturechange', stop, { passive: false });
    document.addEventListener('gestureend', stop, { passive: false });
    document.addEventListener('touchmove', stopPinch, { passive: false });
  }
  apply();
}

/** Nombre de antes (main.tsx): ya no bloquea en toda la app, solo prepara el zoom. */
export const blockZoom = setupZoom;

/** Sin zoom mientras dure (modo cancha). Devuelve cómo soltarlo; varios a la vez se cuentan. */
export function lockZoom(): () => void {
  locks++;
  apply();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    apply();
  };
}

/** Sin zoom mientras la pantalla esté abierta (y `active`): para el modo cancha. */
export function useZoomLock(active = true) {
  useEffect(() => {
    if (!active) return;
    return lockZoom();
  }, [active]);
}

/** Solo pruebas: ¿está bloqueado ahora? */
export const zoomLocked = () => locks > 0;
