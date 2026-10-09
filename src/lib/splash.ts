import type { SportId } from '../sports/types';

/**
 * Clave de localStorage con el deporte de cada liga visitada ({ '<liga>': 'padel', … }, las más recientes al final).
 * La lee el script de index.html antes de pintar: si la app abre dentro de una liga, sale la animación de su deporte.
 */
export const LEAGUE_SPORTS_KEY = 'mm:liga-deporte';
/** Clave vieja (el último deporte usado): la apertura ya no la lee; se borra al arrancar. */
export const OLD_SPORT_KEY = 'mm:sport';
/** Clave de sessionStorage: la apertura sale una vez por sesión. */
export const SPLASH_SEEN_KEY = 'mm:splash';
/** Cuántas ligas se recuerdan. */
const LEAGUES_MAX = 40;

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

function readLeagueSports(): Record<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(LEAGUE_SPORTS_KEY) ?? 'null');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * Recuerda el deporte de una liga (al entrar a ella): si la próxima vez la app abre directo en esa liga (un link o la
 * última pantalla), sale la animación de su deporte. Abriendo en Hoy, Social, Ligas o Yo sale la de MatchMate.
 */
export function rememberLeagueSport(lid: string, sport: SportId) {
  try {
    const key = lid.toLowerCase();
    const map = readLeagueSports();
    if (map[key] === sport && Object.keys(map).at(-1) === key) return;
    delete map[key];
    map[key] = sport;
    const keys = Object.keys(map);
    for (const k of keys.slice(0, Math.max(0, keys.length - LEAGUES_MAX))) delete map[k];
    localStorage.setItem(LEAGUE_SPORTS_KEY, JSON.stringify(map));
  } catch {
    // sin almacenamiento: abre con la genérica
  }
}

/** El deporte guardado de una liga (null si no se sabe). */
export function leagueSportOf(lid: string): string | null {
  return readLeagueSports()[lid.toLowerCase()] ?? null;
}

/**
 * Borra la clave vieja del último deporte usado: con ella la app abría con la animación de la última liga aunque ya
 * no estuvieras en ese deporte. Va una vez al arrancar.
 */
export function forgetOldSport() {
  try {
    localStorage.removeItem(OLD_SPORT_KEY);
  } catch {
    // sin almacenamiento: nada que borrar
  }
}
