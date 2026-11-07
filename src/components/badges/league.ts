/**
 * Las insignias dentro de la liga sin pantalla (docs/insignias.md §6.2): quién ve qué, el título vigente, la página del
 * jugador. Salió de LeagueBadges.tsx y LeagueBadgePanels.tsx para que la app del teléfono haga lo mismo. Liviano (sin el
 * catálogo: LeagueBadges.tsx lo importa sin cargar lo pesado). Funciones puras, con pruebas en league.test.ts.
 */
import type { BadgeAward } from '../../lib/data/badges';

/** En una liga con menores, las insignias las ven solo los miembros. */
export const badgesHiddenIn = (league: { hasMinors?: boolean | null }, member: unknown): boolean => !!league.hasMinors && !member;

/** El jugador de la página `/l/<id>/j/<jugador>` (null en otra ruta de la liga). */
export function playerPageId(pathname: string, base: string): string | null {
  if (!pathname.startsWith(`${base}/j/`)) return null;
  const id = pathname.slice(base.length + 3).split('/')[0];
  try {
    return id ? decodeURIComponent(id) : null;
  } catch {
    return null;
  }
}

/**
 * El título vigente de la liga: el oro de `season_podium` de la última temporada cerrada (no los torneos sueltos) y
 * quiénes lo tienen (varios si fue compartido o de un equipo). null si todavía no hay.
 */
export function currentTitle(awards: readonly BadgeAward[]): { award: BadgeAward; players: ReadonlySet<string> } | null {
  const titles = awards
    .filter((a) => a.key === 'season_podium' && a.level === 3 && a.periodKey.startsWith('s:') && a.context.alt !== 'torneo')
    .sort((a, b) => Date.parse(b.awardedAt) - Date.parse(a.awardedAt));
  if (!titles.length) return null;
  const period = titles[0].periodKey;
  return { award: titles[0], players: new Set(titles.filter((a) => a.periodKey === period && a.playerId).map((a) => a.playerId!)) };
}

/** ¿Ya se dieron las insignias de este evento? (las filas de la liga traen las de otros eventos de esos días). */
export const hasEventAwards = (awards: readonly BadgeAward[], eventId: string): boolean =>
  awards.some((a) => a.periodKey === `e:${eventId}` || a.periodKey.startsWith(`e:${eventId}:`));

/** «Asistencia perfecta: 12 jugadores». */
export const attendanceText = (n: number): string => `Asistencia perfecta: ${n} ${n === 1 ? 'jugador' : 'jugadores'}`;
