import { upcomingCalendar, weekStart, type CalendarItem, type CalendarMatch } from '../../lib/calendar';
import type { LeagueFeed } from '../../lib/data';
import { parseDate, toIsoDate } from '../../lib/format';
import { WEEKDAYS } from '../../lib/schedule';
import type { League } from '../../lib/types';

/**
 * La semana del Calendario (lunes a domingo) de mis ligas: lo que la web (src/components/home/WeekAgenda.tsx,
 * src/components/WeekCalendar.tsx) y la app del teléfono (movil/src/components/agenda/WeekAgenda.tsx) deciden sin
 * pantalla: qué días, qué fechas salen, los títulos y los textos de cada día. Sin React ni DOM.
 */

/** Semanas hacia adelante que se pueden ver. */
export const MAX_WEEKS = 8;

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

export const addDays = (iso: string, n: number): string => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
};

/** «3 oct». */
export const shortDate = (iso: string): string => {
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/** La semana que se puede ver: de 0 (esta) a MAX_WEEKS - 1. */
export const clampWeek = (week: number): number => Math.min(MAX_WEEKS - 1, Math.max(0, week));

/** «1 partido», «2 eventos» (si hay de los dos, «3 cosas»). */
export function countLabel(items: readonly Pick<CalendarItem, 'kind'>[]): string {
  const n = items.length;
  const matches = items.filter((i) => i.kind === 'match').length;
  if (matches === n) return `${n} ${n === 1 ? 'partido' : 'partidos'}`;
  if (matches === 0) return `${n} ${n === 1 ? 'evento' : 'eventos'}`;
  return `${n} cosas`;
}

/** De qué color va el puntito de cada día: partido (verde), torneo (ámbar) o lo demás (el acento). */
export const dotKind = (it: Pick<CalendarItem, 'kind' | 'type'>): 'match' | 'torneo' | 'otro' => (it.kind === 'match' ? 'match' : it.type === 'torneo' ? 'torneo' : 'otro');

export interface WeekView {
  /** El lunes de la semana. */
  from: string;
  /** Los 7 días (lunes a domingo). */
  days: string[];
  /** Lo de la semana desde hoy (sin filtrar por día): los puntitos de cada día. */
  items: CalendarItem[];
  /** Lo que se ve debajo (solo el día elegido, si hay), por día y sin los días vacíos. */
  byDay: { date: string; items: CalendarItem[] }[];
}

/**
 * La semana `week` (0 = esta) desde hoy: los eventos, mis partidos con fecha (a la hora de su liga) y, en el boliche,
 * las prácticas del horario aunque el admin todavía no las creó. `day`: solo ese día debajo.
 */
export function weekView(
  feeds: readonly LeagueFeed[],
  leagues: readonly League[],
  matches: readonly CalendarMatch[],
  today: string,
  week: number,
  day: string | null,
): WeekView {
  const from = addDays(weekStart(today), 7 * week);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const items = upcomingCalendar([...feeds], [...leagues], from, 7, matches).filter((i) => i.date >= today);
  const shown = day ? items.filter((i) => i.date === day) : items;
  const byDay = days.map((d) => ({ date: d, items: shown.filter((i) => i.date === d) })).filter((g) => g.items.length);
  return { from, days, items, byDay };
}

/** El título arriba: «Esta semana» o, más adelante, «Próximas semanas». */
export const weekTitle = (week: number): string => (week === 0 ? 'Esta semana' : 'Próximas semanas');

/** Entre las flechas: «3 oct – 9 oct» (la que viene: «La semana que viene»). */
export const weekRange = (from: string, week: number): string => (week === 1 ? 'La semana que viene' : `${shortDate(from)} – ${shortDate(addDays(from, 6))}`);

/** Lo que dice cada día de la tira para el lector de pantalla: «Martes 3 oct: 2 eventos». `index`: 0 = lunes. */
export const dayCellLabel = (date: string, index: number, items: readonly Pick<CalendarItem, 'kind'>[]): string =>
  `${WEEKDAYS[index]} ${shortDate(date)}${items.length ? `: ${countLabel(items)}` : ''}`;

/** El título de cada día debajo: «Hoy», «Mañana» o «Jueves 5 oct». */
export function dayHeading(date: string, today: string): string {
  if (date === today) return 'Hoy';
  if (date === addDays(today, 1)) return 'Mañana';
  return `${WEEKDAYS[(parseDate(date).getDay() + 6) % 7]} ${shortDate(date)}`;
}

/** Sin nada debajo: esta semana ya no tiene más; las otras, nada. */
export const weekEmptyText = (week: number): string => (week === 0 ? 'Nada más esta semana.' : 'Nada esta semana.');

/** El «Voy» de la fila es de las prácticas del boliche ya creadas, con jugador (los otros deportes confirman en sus pantallas). */
export const canRsvpRow = (it: Pick<CalendarItem, 'sport' | 'type' | 'eventId' | 'playerId'>): boolean =>
  it.sport === 'bowling' && it.type === 'practica' && !!it.eventId && !!it.playerId;

/** Debajo del nombre: la liga (en un partido, la liga y dónde se juega: «Liga de Ejemplo · Cancha 2»). */
export const rowSubtitle = (it: Pick<CalendarItem, 'kind' | 'leagueName' | 'detail'>): string =>
  it.kind === 'match' ? [it.leagueName, it.detail].filter(Boolean).join(' · ') : it.leagueName;
