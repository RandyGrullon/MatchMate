import { defaultRules, RACKET_SPORTS, type RacketSport } from './racket';

/**
 * Lo que se ve de una pantalla de Organizar propia del deporte (la clave de `?tab=`, el nombre, la línea de abajo y si
 * también va en el inicio de la liga), sin el componente ni el ícono: cada deporte los pone en su `screens.tsx` de la
 * web, y la app del teléfono arma con esto las filas de Organizar.
 */
export interface AdminTabInfo {
  key: string;
  label: string;
  /** La línea debajo en la fila de Organizar › La liga (opcional). */
  subtitle?: string;
  /** También va como fila en el inicio de la liga, para quien la organiza (las parejas y niveles de raqueta). */
  homeRow?: boolean;
}

/** Baloncesto y fútbol (de campo y sala): los equipos de la liga. */
export const TEAM_ADMIN_TAB: AdminTabInfo = { key: 'equipos', label: 'Equipos' };
/** Golf: los campos. */
export const GOLF_ADMIN_TAB: AdminTabInfo = { key: 'campos', label: 'Campos' };
/** Natación: los nadadores y los clubes. */
export const SWIM_ADMIN_TABS: readonly AdminTabInfo[] = [
  { key: 'nadadores', label: 'Nadadores' },
  { key: 'clubes', label: 'Clubes' },
];

/** Raqueta: parejas en pádel y en los deportes que juegan en dobles por defecto (pickleball); tenis y ping pong, jugadores. */
export function racketAdminTab(sport: RacketSport): AdminTabInfo {
  const doubles = defaultRules(sport).doubles || sport === 'padel';
  return { key: 'parejas', label: doubles ? 'Parejas y niveles' : 'Jugadores y niveles', homeRow: true };
}

/** Las pantallas de Organizar propias de un deporte que no es boliche (el boliche pone las suyas en Organizar). */
export function sportAdminTabs(sport: string | null | undefined): readonly AdminTabInfo[] {
  if (sport === 'basketball' || sport === 'football' || sport === 'futsal') return [TEAM_ADMIN_TAB];
  if (sport === 'golf') return [GOLF_ADMIN_TAB];
  if (sport === 'swimming') return SWIM_ADMIN_TABS;
  if (sport && (RACKET_SPORTS as readonly string[]).includes(sport)) return [racketAdminTab(sport as RacketSport)];
  return [];
}
