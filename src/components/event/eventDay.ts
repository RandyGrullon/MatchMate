import { parseDate } from '../../lib/format';
import { formatTime, parseSchedule } from '../../lib/schedule';
import type { BowlingEvent, League } from '../../lib/types';

/** El día y la hora de un evento (EventHeader.tsx en la web y las pantallas de la app del teléfono). */

const WEEKDAYS_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * El día del evento: «Miércoles 7 oct» (Lite) o «Mié 7 oct» (Pro), con el mes siempre (nunca «MAR 13», que se lee como
 * marzo); el año solo si no es el de hoy.
 */
export function eventDay(date: string, today: string, short = false): string {
  const d = parseDate(date);
  const day = `${(short ? WEEKDAYS_SHORT : WEEKDAYS_LONG)[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return date.slice(0, 4) === today.slice(0, 4) ? day : `${day} ${date.slice(0, 4)}`;
}

/**
 * La hora del evento: la que se le puso o, si cae en un día de la liga (o la liga no dice días), la de la liga («7:30 pm»).
 * null si no se sabe.
 */
export function eventTime(event: Pick<BowlingEvent, 'date' | 'startTime'>, league: Pick<League, 'schedule'>): string | null {
  const own = event.startTime ? formatTime(event.startTime.slice(0, 5)) : '';
  if (own) return own;
  const { days, time } = parseSchedule(league.schedule ?? '');
  if (!time) return null;
  const weekday = (parseDate(event.date).getDay() + 6) % 7;
  return days.length && !days.includes(weekday) ? null : formatTime(time) || null;
}
