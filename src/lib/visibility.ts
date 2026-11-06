/**
 * ¿La app está a la vista? En el navegador, `document.visibilityState`; en el teléfono, AppState (visibility.native.ts).
 * Lo usan los avisos (recalcular al volver, notificar solo en segundo plano) sin tocar `document` directo.
 */

/** La app se ve ahora mismo (sin `document`, como en Node, cuenta como a la vista). */
export const isAppVisible = (): boolean => typeof document === 'undefined' || document.visibilityState === 'visible';

/** Llama `cb` cada vez que la app vuelve a la vista. Devuelve cómo dejar de oír. */
export function onAppVisible(cb: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const handler = () => {
    if (document.visibilityState === 'visible') cb();
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
