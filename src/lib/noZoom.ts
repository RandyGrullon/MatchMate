/**
 * Sin zoom con los dedos en toda la app (lo pidió el dueño): ni pellizco ni doble toque, en ninguna pantalla.
 * La foto del marcador sigue teniendo su propio «Acercar» (un botón que agranda la imagen dentro de la app).
 *
 * - El meta viewport de index.html ya trae `maximum-scale=1, user-scalable=no` (Android lo respeta desde que abre).
 * - `touch-action: pan-x pan-y` en <html>: se desliza, pero no se pellizca ni se amplía con doble toque.
 * - Safari del iPhone ignora el meta: se frenan sus gestos de pellizco (`gesture*`) y los movimientos con dos dedos.
 *
 * `lockZoom()`/`useZoomLock()` quedan para el modo cancha (se cuentan igual), pero el zoom ya está bloqueado siempre.
 */
import { useEffect } from 'react';

export const LOCKED_VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

let locks = 0;
let listening = false;

const stop = (e: Event) => e.preventDefault();
// Dos dedos moviéndose = pellizco (respaldo para Safari).
const stopPinch = (e: TouchEvent) => {
  if (e.touches.length > 1) e.preventDefault();
};

function apply() {
  if (typeof document === 'undefined') return;
  document.documentElement.style.touchAction = 'pan-x pan-y';
  document.documentElement.dataset.zoomLock = '';
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta && meta.content !== LOCKED_VIEWPORT) meta.content = LOCKED_VIEWPORT;
}

/** Bloquea el zoom en toda la app (una vez, al abrir). */
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

/** Nombre de antes (main.tsx). */
export const blockZoom = setupZoom;

/** Modo cancha: se cuenta, pero el zoom ya está bloqueado en toda la app. Devuelve cómo soltarlo. */
export function lockZoom(): () => void {
  locks++;
  apply();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
  };
}

/** Sin zoom mientras la pantalla esté abierta (y `active`): para el modo cancha. */
export function useZoomLock(active = true) {
  useEffect(() => {
    if (!active) return;
    return lockZoom();
  }, [active]);
}

/** Solo pruebas: cuántos modos cancha lo están pidiendo ahora. */
export const zoomLocks = () => locks;
