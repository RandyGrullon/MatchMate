/**
 * La app no se agranda con los dedos (se siente como app, no como página).
 * El meta viewport lo bloquea en Android; Safari del iPhone lo ignora, así que ahí se frenan
 * los gestos de pellizco. El doble toque lo bloquea `touch-action` en index.css.
 * Las fotos de los marcadores tienen su propio botón de acercar.
 */
export function blockZoom() {
  const stop = (e: Event) => e.preventDefault();
  // Pellizco en Safari (iPhone/iPad).
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('gestureend', stop, { passive: false });
  // Respaldo: dos dedos moviéndose = pellizco.
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}
