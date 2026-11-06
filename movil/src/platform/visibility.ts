import { AppState } from 'react-native';

/**
 * ¿La app está a la vista? Lo del sistema para src/lib/visibility.native.ts (en la web, `document.visibilityState`):
 * AppState 'active' es a la vista.
 */
export const isAppActive = (): boolean => AppState.currentState === 'active';

/** Llama `cb` cada vez que la app vuelve al frente. Devuelve cómo dejar de oír. */
export function onAppActive(cb: () => void): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') cb();
  });
  return () => sub.remove();
}
