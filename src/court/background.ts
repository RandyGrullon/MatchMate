/**
 * Al pasar a segundo plano o cerrar: publicar lo pendiente del modo cancha (`flush`). En la web, `visibilitychange` y
 * `pagehide`; en la app del teléfono no hay `document` y el `pagehide` lo avisa movil/src/platform/network.ts por
 * `window` al pasar a segundo plano. Devuelve cómo dejar de escuchar.
 */
export function onBackground(flush: () => void): () => void {
  const d = typeof document !== 'undefined' ? document : null;
  const w = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
  const onHide = () => {
    if (d?.visibilityState === 'hidden') flush();
  };
  d?.addEventListener('visibilitychange', onHide);
  w?.addEventListener('pagehide', flush);
  return () => {
    d?.removeEventListener('visibilitychange', onHide);
    w?.removeEventListener('pagehide', flush);
  };
}
