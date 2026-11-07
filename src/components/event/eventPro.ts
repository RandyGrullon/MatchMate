import { eventLabel } from '../../lib/format';
import type { BowlingEvent, League } from '../../lib/types';
import { eventDay, eventTime } from './eventDay';

/**
 * Lo del evento del boliche que cambia con el modo (EventPage de la web y el evento de la app del teléfono), sin React:
 * - Pro: las pestañas (Planilla · Resultados · Pistas; en un torneo, para quien organiza, Inscritos y Equipos), cuál se
 *   abre primero, «Tus juegos» compacta y la línea de debajo del título («Mié 7 oct · 7:30 pm · 3 juegos»).
 * - Lite: en «•••», «Resultados» (o «Clasificación»), «Excel» (los juegos de todos, la práctica) y, para quien organiza o
 *   anota, «Planilla, aprobar y pistas · Están en Pro · Usar Pro».
 */

/** Las pestañas del evento en Pro (y el `?tab=` de la dirección). */
export type EventTab = 'inscritos' | 'equipos' | 'pistas' | 'juegos' | 'clasificacion';

const TABS: readonly EventTab[] = ['inscritos', 'equipos', 'pistas', 'juegos', 'clasificacion'];

/** El `?tab=` de la dirección como pestaña (null si no es ninguna). */
export const eventTabOf = (v: string | null | undefined): EventTab | null => (TABS.includes(v as EventTab) ? (v as EventTab) : null);

/** «Clasificación» en un torneo; «Resultados» en una práctica (la pestaña de Pro y la fila de «•••» en Lite). */
export const resultsTitle = (isTorneo: boolean) => (isTorneo ? 'Clasificación' : 'Resultados');

/**
 * Las pestañas de Pro: quien organiza o anota tiene las suyas; los demás, la Planilla (solo mirar) y los resultados.
 * El anotador de un torneo: Planilla, Clasificación y Pistas. Quien organiza un torneo: Inscritos, Equipos, Pistas,
 * Planilla y Clasificación; una práctica: Planilla, Resultados y Pistas.
 */
export function eventTabs({ canScore, isAdmin, isTorneo }: { canScore: boolean; isAdmin: boolean; isTorneo: boolean }): { key: EventTab; label: string }[] {
  if (!canScore) {
    return [
      { key: 'juegos', label: 'Planilla' },
      { key: 'clasificacion', label: resultsTitle(isTorneo) },
    ];
  }
  if (!isAdmin) {
    return [
      { key: 'juegos', label: 'Planilla' },
      { key: 'clasificacion', label: 'Clasificación' },
      { key: 'pistas', label: 'Pistas' },
    ];
  }
  return isTorneo
    ? [
        { key: 'inscritos', label: 'Inscritos' },
        { key: 'equipos', label: 'Equipos' },
        { key: 'pistas', label: 'Pistas' },
        { key: 'juegos', label: 'Planilla' },
        { key: 'clasificacion', label: 'Clasificación' },
      ]
    : [
        { key: 'juegos', label: 'Planilla' },
        { key: 'clasificacion', label: 'Resultados' },
        { key: 'pistas', label: 'Pistas' },
      ];
}

/**
 * La pestaña que se ve: la del link si es de las que tiene; si no, un torneo se abre en Inscritos (quien lo organiza)
 * antes de jugarse y en la Planilla el día que se juega.
 */
export function currentEventTab(
  tabs: readonly { key: EventTab }[],
  requested: EventTab | null,
  { isAdmin, isTorneo, live }: { isAdmin: boolean; isTorneo: boolean; live: boolean },
): EventTab {
  if (requested && tabs.some((t) => t.key === requested)) return requested;
  return isAdmin && isTorneo && !live ? 'inscritos' : 'juegos';
}

/**
 * Pro, o un link de Pro (`?tab=`, la Planilla desde un aviso) para quien organiza o anota: lo de Pro se abre igual (con
 * «Esto es de Pro · Usar Pro» arriba si está en Lite).
 */
export const showsPro = (isPro: boolean, canScore: boolean, requested: string | null | undefined): boolean => isPro || (canScore && requested != null);

/** El aviso de arriba cuando se ve lo de Pro desde Lite (un link de Pro). */
export const PRO_ONLY_TEXT = 'Esto es de Pro';

/** Cómo se ve «Tus juegos»: grande (Lite), compacta (Pro) o solo la hoja de anotar (Pro, quien lleva la Planilla). */
export type MyGamesLook = 'lite' | 'pro' | 'sheet';

export const myGamesLook = (pro: boolean, canScore: boolean): MyGamesLook => (!pro ? 'lite' : canScore ? 'sheet' : 'pro');

/** Lo de debajo de «Resultados» en «•••» (Lite). */
export const resultsHint = (isTorneo: boolean) => (isTorneo ? 'Con handicap y por equipos' : 'Promedio y total de cada uno');

/** La fila de «•••» que lleva a lo de Pro (Lite, quien organiza o anota). */
export const proToolsLabel = (isTorneo: boolean) => (isTorneo ? 'Planilla, inscritos y pistas' : 'Planilla, aprobar y pistas');
export const PRO_TOOLS_HINT = 'Están en Pro · Usar Pro';

/** «Excel» de la práctica: la fila de «•••» (Lite, quien organiza) y el botón de arriba (Pro). */
export const EXCEL_LABEL = 'Excel';
export const EXCEL_HINT = 'Los juegos de todos';
export const EXCEL_DONE = 'Excel descargado';

/** El Excel de un evento: «Práctica 7 oct - 2026-10-07.xlsx». */
export const eventExcelName = (event: Pick<BowlingEvent, 'name' | 'type' | 'date'>) => `${eventLabel(event)} - ${event.date}.xlsx`;

/** «En juego» o «Empieza a las 7:30 pm» (Pro: delante de la fecha). */
export const liveWhenText = (startsSoon: boolean, startLabel: string | null) => (startsSoon && startLabel ? `Empieza a las ${startLabel}` : 'En juego');

/**
 * La línea debajo del título. Lite: «Miércoles 7 oct · 7:30 pm · Bolera Sambil». Pro: «Mié 7 oct · 7:30 pm · 3 juegos».
 * Un torneo dice además su handicap y el tamaño de los equipos.
 */
export function eventMeta(
  event: Pick<BowlingEvent, 'date' | 'startTime' | 'type' | 'games' | 'hcpPercent' | 'hcpBase' | 'teamSize'>,
  league: Pick<League, 'schedule' | 'venue'>,
  today: string,
  pro: boolean,
): string {
  const torneo = event.type === 'torneo';
  const venue = league.venue?.trim() || null;
  return [
    eventDay(event.date, today, pro),
    eventTime(event, league),
    pro || torneo || !venue ? `${event.games} juegos` : venue,
    torneo ? (event.hcpPercent > 0 ? `Hcp ${event.hcpPercent} % de ${event.hcpBase}` : 'Sin handicap') : null,
    torneo && event.teamSize ? `Equipos de ${event.teamSize}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
