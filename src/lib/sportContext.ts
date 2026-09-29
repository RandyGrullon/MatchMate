/**
 * El deporte en que estás: la app entera se pone «de ese deporte» (el Home del deporte, Eventos solo con lo suyo, el
 * color de la app en su color) hasta que eliges otro o «Todos los deportes».
 *
 * - Se guarda en el teléfono (localStorage `mm:deporte`) y se sincroniza entre pestañas.
 * - Entrar a una liga lo pone en el deporte de esa liga (LeagueShell); abrir `/d/:sport`, en ese.
 * - Home de abajo: si estás en un deporte y no en su Home, va a su Home; si ya estás en su Home, sale a «Todos los
 *   deportes» (`/`); sin deporte, a `/`.
 *
 * Aquí solo va lo que no es pantalla (se prueba sin navegador): el selector está en src/components/SportSwitcher.tsx.
 */
import { useSyncExternalStore } from 'react';
import { SPORT_IDS, isSportId, leagueSport, sportMeta } from '../sports/registry';
import type { SportStatus } from '../sports/status';
import type { SportId } from '../sports/types';
import { forgetSport, rememberSport } from './splash';
import { THEME_EVENT, applySportAccent } from './theme';

export const ACTIVE_SPORT_KEY = 'mm:deporte';

/** Lo guardado (o lo de la ruta) → un deporte que esta versión conoce, o null («Todos los deportes»). */
export function parseActiveSport(raw: unknown): SportId | null {
  return isSportId(raw) ? raw : null;
}

// ---------- La copia compartida ----------

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function read(): SportId | null {
  try {
    return parseActiveSport(storage()?.getItem(ACTIVE_SPORT_KEY));
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
/** undefined = todavía no se leyó del teléfono. */
let current: SportId | null | undefined;
let storageHooked = false;

const emit = () => listeners.forEach((l) => l());

/** Otra pestaña cambió de deporte: esta también. */
function onStorage(e: StorageEvent) {
  if (e.key !== null && e.key !== ACTIVE_SPORT_KEY) return;
  const next = e.key === null ? null : parseActiveSport(e.newValue);
  if (next === current) return;
  current = next;
  emit();
}

function hookStorage() {
  if (storageHooked || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  storageHooked = true;
  window.addEventListener('storage', onStorage);
}

/** El deporte en que estás (null = todos). */
export function getActiveSport(): SportId | null {
  if (current === undefined) current = read();
  return current;
}

/**
 * Cambia el deporte en que estás (null o uno desconocido = «Todos los deportes»). Lo guarda en el teléfono, avisa a
 * las pantallas y la próxima vez la app abre con la animación de ese deporte (o la genérica con «Todos»).
 */
export function setActiveSport(sport: string | null | undefined): void {
  const next = parseActiveSport(sport);
  if (next === getActiveSport()) return;
  current = next;
  try {
    const s = storage();
    if (next) s?.setItem(ACTIVE_SPORT_KEY, next);
    else s?.removeItem(ACTIVE_SPORT_KEY);
  } catch {
    // sin almacenamiento: vale mientras la app está abierta
  }
  if (next) rememberSport(next);
  else forgetSport();
  emit();
}

export function subscribeActiveSport(listener: () => void): () => void {
  hookStorage();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** El deporte en que estás, al día (null = «Todos los deportes»). */
export function useActiveSport(): SportId | null {
  return useSyncExternalStore(subscribeActiveSport, getActiveSport, () => null);
}

/** Solo pruebas: olvidar lo leído (la próxima lectura vuelve al almacenamiento). */
export function resetActiveSportForTests(): void {
  current = undefined;
  listeners.clear();
}

// ---------- El color de la app ----------

/** Color del deporte (hex) o null (el boliche y «Todos»: el morado de siempre). */
export const sportColor = (sport: string | null | undefined): string | null => (sport ? (sportMeta(sport)?.color ?? null) : null);

/**
 * La app toma el color del deporte en que estás (si la cuenta no eligió su propio color en Configuración). Va una
 * vez al arrancar (App.tsx), antes de pintar la primera pantalla; sigue los cambios de deporte y de apariencia.
 */
export function installSportAccent(): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => undefined;
  // La animación de apertura sigue al deporte en que estás: sin deporte (Home general), la genérica. Arregla también
  // los teléfonos que quedaron con el último deporte guardado de antes.
  if (!getActiveSport()) forgetSport();
  const apply = () => applySportAccent(sportColor(getActiveSport()));
  apply();
  const off = subscribeActiveSport(apply);
  window.addEventListener(THEME_EVENT, apply);
  return () => {
    off();
    window.removeEventListener(THEME_EVENT, apply);
  };
}

// ---------- Rutas ----------

/** Home de un deporte. */
export const sportHomePath = (sport: string) => `/d/${sport}`;

/** El deporte de la ruta `/d/:sport` (null en cualquier otra). */
export function sportFromPath(pathname: string): SportId | null {
  const m = /^\/d\/([^/?#]+)/.exec(pathname);
  return m ? parseActiveSport(decodeURIComponent(m[1])) : null;
}

/** ¿Es un Home? (`/` o `/d/:sport`). */
export const isHomePath = (pathname: string) => pathname === '/' || /^\/d\/[^/]+\/?$/.test(pathname);

/**
 * A dónde lleva «Home» de la barra: en un deporte y fuera de su Home → su Home; ya en su Home → «Todos los deportes»
 * (`clear`: se quita el deporte); sin deporte → `/`.
 */
export function homeTarget(pathname: string, active: SportId | null): { to: string; clear: boolean } {
  if (!active) return { to: '/', clear: false };
  const home = sportHomePath(active);
  const here = pathname.replace(/\/+$/, '') === home;
  return here ? { to: '/', clear: true } : { to: home, clear: false };
}

/**
 * A dónde ir al elegir en el selector de deporte (null = quedarse donde está). Desde un Home o desde adentro de una
 * liga se va al Home elegido (la liga es de otro deporte); en Eventos, Perfil o Configuración se queda (Eventos se
 * filtra solo).
 */
export function switchTarget(pathname: string, sport: SportId | null): string | null {
  const home = pathname === '/' || pathname.startsWith('/d/');
  const league = pathname.startsWith('/l/');
  if (!home && !league) return null;
  return sport ? sportHomePath(sport) : '/';
}

// ---------- Qué deportes se ofrecen ----------

/**
 * Deportes del selector, en el orden del registro: los abiertos, los de beta si es superadmin, y cualquiera en que
 * ya tenga ligas (`mine`) o que tenga ligas públicas para ver (`visible`), aunque esté en beta o cerrado. El que está
 * activo sale siempre.
 */
export function offeredSports(opts: {
  status: Readonly<Record<SportId, SportStatus>>;
  isSuper: boolean;
  mine?: readonly string[];
  visible?: readonly string[];
  active?: SportId | null;
}): SportId[] {
  const extra = new Set<string>([...(opts.mine ?? []), ...(opts.visible ?? []), ...(opts.active ? [opts.active] : [])]);
  return SPORT_IDS.filter((id) => {
    const st = opts.status[id];
    return st === 'open' || (st === 'beta' && opts.isSuper) || extra.has(id);
  });
}

/** Cuántas ligas y torneos hay de cada deporte. */
export function countBySport(leagues: readonly { id: string; sport?: string | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of leagues) {
    const s = leagueSport(l);
    out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}

/** ¿La liga es del deporte? (null = todos). */
export const inSport = (sport: string | null | undefined) => (l: { id: string; sport?: string | null }) => !sport || leagueSport(l) === sport;

/** Los deportes ordenados: primero en los que tengo ligas (más ligas primero), después los demás en su orden. */
export function mySportsFirst(ids: readonly SportId[], counts: Readonly<Record<string, number>>): SportId[] {
  const pos = new Map(ids.map((id, i) => [id, i]));
  return [...ids].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || pos.get(a)! - pos.get(b)!);
}
