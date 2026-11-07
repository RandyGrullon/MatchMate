/**
 * El aviso del inicio de la liga para quien la organiza, sin pantalla (Pending.tsx y LeagueHome.tsx lo proponen al
 * NoticeSlot de la web; la app del teléfono, a su aviso de la pantalla): en Lite, lo que espera por él o los primeros
 * pasos, y la sugerencia «Organizas esta liga · Probar Pro». En Pro lo pendiente va en el número de la fila
 * «Organizas esta liga» (`organizesRow`).
 */
import type { LeaguePending } from '../../lib/data/organizer';
import type { Notice } from '../../lib/notices';
import type { LeagueKind } from '../../lib/types';
import { organizeUrl } from '../organizer/hubLogic';
import { pendingLine, showPendingCard } from '../organizer/logic';

/**
 * Lo que espera por quien organiza («2 juegos por aprobar · Ver», el de más prioridad) o, con la liga nueva y nada
 * pendiente, los primeros pasos («Tu liga nueva · Primeros pasos: 2 de 4 · Seguir», una pista). El id cambia con el
 * número: si lo cierra y llega algo más, vuelve a salir. null = nada que decir.
 */
export function leaguePendingNotice(p: LeaguePending | null | undefined, lid: string, kind: LeagueKind | undefined): Notice | null {
  if (!p || !showPendingCard(p)) return null;
  // A Organizar de esta liga, con «Por hacer» arriba.
  const to = organizeUrl(lid);
  if (p.total > 0) return { id: `pendientes:${lid}:${p.total}`, kind: 'admin', title: pendingLine(p), action: { label: 'Ver', to } };
  return {
    id: `primeros-pasos:${lid}:${p.checklist?.done ?? 0}`,
    kind: 'tip',
    title: kind === 'torneo' ? 'Tu torneo nuevo' : 'Tu liga nueva',
    text: pendingLine(p),
    action: { label: 'Seguir', to },
  };
}

/**
 * Lo que dice la sugerencia de Pro en el inicio de la liga: «Organizas esta liga» (o «este torneo»); el boliche,
 * «Aprueba juegos en Pro» (el texto de siempre, `text` sin poner); los otros deportes confirman resultados en sus
 * partidos: «Resultados y ajustes en Pro».
 */
export function leagueProCopy(kind: LeagueKind | undefined, bowling: boolean): { title: string; text?: string } {
  return { title: kind === 'torneo' ? 'Organizas este torneo' : 'Organizas esta liga', text: bowling ? undefined : 'Resultados y ajustes en Pro' };
}

/**
 * La fila de Pro «Organizas esta liga» del inicio (lo de la antigua pestaña Admin): su título, su línea (lo que espera
 * o, sin nada, qué hay ahí; el boliche dice «Jugadores», los otros deportes «Gente») y a dónde lleva.
 */
export function organizesRow(kind: LeagueKind | undefined, bowling: boolean, toDoLine: string, base: string): { title: string; subtitle: string; to: string } {
  return {
    // El boliche siempre dice «Organizas esta liga» (LeagueHomePage); los otros deportes, «este torneo» en un torneo suelto.
    title: !bowling && kind === 'torneo' ? 'Organizas este torneo' : 'Organizas esta liga',
    subtitle: toDoLine || (bowling ? 'Jugadores, fechas y ajustes' : 'Gente, fechas y ajustes'),
    to: `${base}/admin`,
  };
}
