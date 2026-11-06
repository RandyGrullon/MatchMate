import { isAppActive, onAppActive } from '@movil/platform/visibility';

/** En el teléfono (visibility.ts en la web): la app está a la vista cuando AppState es 'active'. */
export const isAppVisible = (): boolean => isAppActive();

/** Llama `cb` cada vez que la app vuelve al frente. Devuelve cómo dejar de oír. */
export const onAppVisible = (cb: () => void): (() => void) => onAppActive(cb);
