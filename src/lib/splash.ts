import type { SportId } from '../sports/types';

/** Clave de localStorage con el último deporte usado (la lee el script de index.html antes de pintar). */
export const SPORT_KEY = 'mm:sport';
/** Clave de sessionStorage: la apertura sale una vez por sesión. */
export const SPLASH_SEEN_KEY = 'mm:splash';

/** Quita la animación de apertura (index.html) cuando la app ya tiene la sesión, dejándola verse al menos 1,3 s. */
export function hideSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const wait = Math.max(0, 1300 - performance.now());
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
  }, wait);
}

/**
 * Guarda el deporte que se está usando: la próxima vez la app abre con su animación (index.html la lee antes de pintar).
 * Llamarlo al entrar a una liga o evento.
 */
export function rememberSport(sport: SportId) {
  try {
    if (localStorage.getItem(SPORT_KEY) !== sport) localStorage.setItem(SPORT_KEY, sport);
  } catch {
    // sin almacenamiento: abre con la genérica
  }
}

/** El último deporte usado en este teléfono (null si no hay). */
export function lastSport(): string | null {
  try {
    return localStorage.getItem(SPORT_KEY);
  } catch {
    return null;
  }
}
