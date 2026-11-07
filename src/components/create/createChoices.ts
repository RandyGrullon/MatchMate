import type { League, Member } from '../../lib/types';
import { leagueSport } from '../../sports/registry';

/**
 * Lo que «Crear o unirme» (CreateSheet de la web y la hoja de crear una práctica o un torneo de la app) necesita saber
 * de la cuenta, sin pantalla: las ligas de boliche que organiza (ahí puede crear una práctica o un torneo) y lo que
 * dice cada opción. Pruebas en createChoices.test.ts.
 */

/** Una liga de boliche que organizo (dueño o admin): ahí puedo crear una práctica o un torneo. */
export interface OrganizedLeague {
  league: League;
  member: Member;
}

/** Las ligas de boliche que organiza la cuenta (no los torneos sin liga), por nombre. */
export function createChoices(leagues: readonly League[], memberships: readonly Member[]): { organized: OrganizedLeague[] } {
  const organized: OrganizedLeague[] = [];
  for (const league of leagues) {
    const member = memberships.find((m) => m.leagueId === league.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) continue;
    if (league.kind === 'torneo' || leagueSport(league) !== 'bowling') continue;
    organized.push({ league, member });
  }
  organized.sort((a, b) => a.league.name.localeCompare(b.league.name, 'es', { sensitivity: 'base' }));
  return { organized };
}

/** El título de la hoja al elegir la liga: «¿Dónde es el torneo?» o «¿En qué liga?». */
export const pickLeagueTitle = (pick: 'practica' | 'torneo') => (pick === 'torneo' ? '¿Dónde es el torneo?' : '¿En qué liga?');

/** Cada liga en la lista: «En Liga de Ejemplo» con los jugadores (torneo) o la liga con su horario (práctica). */
export function pickLeagueRow(pick: 'practica' | 'torneo', league: Pick<League, 'name' | 'schedule'>): { title: string; text: string } {
  return pick === 'torneo'
    ? { title: `En ${league.name}`, text: 'Con los jugadores de la liga' }
    : { title: league.name, text: league.schedule || 'Práctica de la liga' };
}

/** «Un torneo» y «Una práctica» en la hoja: la línea de abajo según cuántas ligas organiza. */
export const tourneyOptionText = (organized: readonly OrganizedLeague[]) => (organized.length ? 'Un día, con o sin liga' : 'Un día, con sus inscritos');
export const practiceOptionText = (organized: readonly OrganizedLeague[]) => (organized.length === 1 ? `En ${organized[0].league.name}` : 'En una de tus ligas');
