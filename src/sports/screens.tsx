import { lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { useLeagueCtx } from '../lib/league';
import { PageSkeleton } from '../components/ui';
import { dispatchSport, leagueSport, type SportDispatch } from './registry';

/**
 * Pantallas de cada deporte (menos el boliche, que usa las de siempre).
 *
 * CONTRATO: cada deporte exporta por defecto un `SportScreens` desde `src/pages/sports/<sportId>/screens.tsx`
 * (la carpeta se llama igual que el SportId: padel, tennis, pickleball, basketball, football, futsal, golf,
 * swimming). La app lo encuentra sola (import.meta.glob): no hace falta tocar rutas ni el registro. Un deporte
 * que comparte pantallas con otro reexporta: `export { default } from '../racket/screens';`.
 * Mientras un deporte no tiene su `screens.tsx`, la liga muestra «Pronto».
 */
export interface SportScreens {
  /** Inicio de la liga: /l/:lid */
  Home: ComponentType;
  /** Un evento (jornada, noche de americano, torneo, ronda de golf, encuentro de natación): /l/:lid/e/:eventId */
  Event: ComponentType;
  /** Tabla o ranking de la temporada: /l/:lid/ranking */
  Standings?: ComponentType;
  /** Partidos o resultados de todos: /l/:lid/juegos */
  Feed?: ComponentType;
  /** Mi perfil y estadísticas en la liga: /l/:lid/perfil */
  MyProfile?: ComponentType;
  /** Perfil de otro jugador: /l/:lid/j/:playerId */
  Player?: ComponentType;
  /**
   * Pestañas del Admin propias del deporte. Van después de las generales (Jugadores, Miembros, Buzón, Liga);
   * una con la misma `key` que una general la reemplaza (p. ej. 'jugadores').
   */
  adminTabs?: { key: string; label: string; icon?: LucideIcon; Component: ComponentType }[];
  /** Nombres de las pestañas de la liga. `null` = no se muestra. Por defecto: Calendario, Partidos, Tabla, Mis partidos. */
  tabs?: { home?: string; feed?: string | null; standings?: string | null; profile?: string };
}

export type ScreenSlot = 'Home' | 'Event' | 'Standings' | 'Feed' | 'MyProfile' | 'Player';

const loaders = import.meta.glob<{ default: SportScreens }>('../pages/sports/*/screens.tsx');
const loaderBySport = new Map(Object.entries(loaders).map(([path, load]) => [path.split('/').at(-2) ?? '', load]));

/** El deporte ya tiene sus pantallas en esta versión. */
export const hasScreens = (sport: string): boolean => sport === 'bowling' || loaderBySport.has(sport);

/**
 * Qué mostrar para la liga: el boliche y los deportes con pantallas están «listos»; los demás, «Pronto»;
 * uno que esta versión no conoce, «Actualiza la app».
 */
export function dispatchLeague(league: { id: string; sport?: string | null }): SportDispatch {
  const d = dispatchSport(leagueSport(league));
  if (d.kind === 'soon' && loaderBySport.has(d.sport)) return { ...d, kind: 'ready' };
  return d;
}

const loaded = new Map<string, SportScreens>();
const inflight = new Map<string, Promise<SportScreens | null>>();

export function loadScreens(sport: string): Promise<SportScreens | null> {
  const ready = loaded.get(sport);
  if (ready) return Promise.resolve(ready);
  const load = loaderBySport.get(sport);
  if (!load) return Promise.resolve(null);
  let p = inflight.get(sport);
  if (!p) {
    p = load().then((m) => {
      loaded.set(sport, m.default);
      return m.default;
    });
    inflight.set(sport, p);
  }
  return p;
}

/** Las pantallas del deporte (null mientras cargan o si es boliche / no tiene). */
export function useSportScreens(sport: string | null | undefined): SportScreens | null {
  const [screens, setScreens] = useState<SportScreens | null>(() => (sport ? (loaded.get(sport) ?? null) : null));
  useEffect(() => {
    if (!sport || sport === 'bowling') {
      setScreens(null);
      return;
    }
    let alive = true;
    loadScreens(sport)
      .then((s) => alive && setScreens(s))
      .catch((e) => console.error(e));
    return () => {
      alive = false;
    };
  }, [sport]);
  return screens;
}

const slotCache = new Map<string, LazyExoticComponent<ComponentType>>();

/** Componente perezoso de una pantalla del deporte (cacheado por deporte y pantalla). */
function slotComponent(sport: string, slot: ScreenSlot): LazyExoticComponent<ComponentType> {
  const key = `${sport}:${slot}`;
  let c = slotCache.get(key);
  if (!c) {
    c = lazy(async () => {
      const screens = await loadScreens(sport);
      const Comp = screens?.[slot];
      // Pantalla que el deporte no tiene: vuelve al inicio de la liga.
      return { default: Comp ?? (() => <Navigate to=".." replace />) };
    });
    slotCache.set(key, c);
  }
  return c;
}

/**
 * Ruta de la liga que depende del deporte: el boliche ve `bowling` (sus pantallas de siempre); otro deporte con
 * pantallas ve la suya. LeagueShell ya muestra «Pronto» o «Actualiza la app» antes de llegar aquí.
 */
export function SportRoute({ slot, bowling }: { slot: ScreenSlot; bowling: ReactNode }) {
  const { league } = useLeagueCtx();
  const sport = leagueSport(league);
  if (sport === 'bowling' || !loaderBySport.has(sport)) return <>{bowling}</>;
  const Screen = slotComponent(sport, slot);
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Screen />
    </Suspense>
  );
}
