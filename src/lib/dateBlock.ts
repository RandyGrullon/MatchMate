/** La fecha del bloque de fecha de las listas (DateBlock en la web y en la app del teléfono). */

const MONTHS_SHORT = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

/** 'YYYY-MM-DD' (el día tal cual, sin correrse por la zona horaria), una fecha con hora o un Date → Date; null si no es fecha. */
export function toLocalDate(value: Date | string): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const d = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** El mes corto en mayúsculas que va arriba del día: «OCT». Nunca el día de la semana («MAR 13» se leía como marzo). */
export const monthShort = (d: Date): string => MONTHS_SHORT[d.getMonth()];
