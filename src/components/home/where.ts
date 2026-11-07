import type { RecentEvent, StartedGame } from '../../lib/useNextGame';
import { todayTitle } from './logic';

/**
 * «¿Dónde jugaste?» de Hoy: lo que la web (HomeSheets.tsx WhereSheet, HomePage.tsx anotarLink) y la app del teléfono
 * (movil/src/components/agenda/HomeSheets.tsx) deciden sin pantalla. Sin React ni DOM.
 */

/** El nombre de cada evento de la hoja: el de hoy como en la tarjeta («Práctica de hoy»); el de ayer, su nombre o «Práctica de ayer». */
export function whereTitle(r: Pick<RecentEvent, 'event'>, today: string): string {
  const e = r.event;
  if (e.date === today) return todayTitle(e, today);
  return e.name?.trim() || (e.type === 'torneo' ? 'Torneo' : 'Práctica de ayer');
}

/**
 * El link discreto para anotar sin un juego de hoy (en lo próximo y en «Nada programado»): «Seguir mi juego 2» (si quedó
 * uno a medias ayer u hoy: lleva a ese juego) o «Anotar un juego» (abre «¿Dónde jugaste?» si jugaste ayer u hoy en una
 * liga). Si no, nada (null): un juego suelto se anota desde Yo.
 */
export type AnotarLink = { kind: 'resume'; label: string; lid: string; eventId: string; game: number } | { kind: 'where'; label: string };

export function anotarLinkOf(
  resume: (Pick<StartedGame, 'lid' | 'eventId' | 'game'> & { recent: Pick<RecentEvent, 'event'> }) | null,
  recent: readonly unknown[],
  today: string,
): AnotarLink | null {
  if (resume) {
    const label = `Seguir mi juego ${resume.game}${resume.recent.event.date === today ? '' : ' de ayer'}`;
    return { kind: 'resume', label, lid: resume.lid, eventId: resume.eventId, game: resume.game };
  }
  return recent.length ? { kind: 'where', label: 'Anotar un juego' } : null;
}
