import { parseDate, toIsoDate } from './format';
import { WEEKDAYS, formatTime, parseSchedule } from './schedule';
import type { BowlingEvent, League } from './types';

/**
 * Recordatorios de cada práctica o torneo (los manda el envío programado, con la app cerrada):
 * - el día antes desde las 12:00 pm (hasta las 9 pm: de noche no se molesta);
 * - el mismo día desde las 12:00 pm (o 3 horas antes, si la liga juega temprano; sin hora, hasta las 6 pm);
 * - poco antes de empezar, entre 1¼ hora y 10 minutos antes (solo si la liga tiene hora). La ventana es
 *   ancha porque el envío programado corre cada 15 minutos y a veces se atrasa.
 */
export type ReminderSlot = 'dia-antes' | 'mismo-dia' | 'una-hora';

export interface Reminder {
  slot: ReminderSlot;
  title: string;
  body: string;
}

const NOON = 12 * 60;
const EARLIEST = 7 * 60;
/** El del día antes, no más tarde de las 9 pm. */
const DAY_BEFORE_UNTIL = 21 * 60;
/** Sin hora de la liga, el del mismo día no más tarde de las 6 pm. */
const SAME_DAY_UNTIL = 18 * 60;
/** El de "ya casi": desde 75 minutos antes hasta 10 minutos antes de empezar. */
const SOON_FROM = 75;
const SOON_UNTIL = 10;
/** Cuánto espera el servicio de push a un teléfono apagado (nunca más allá de la hora del evento). */
const MAX_TTL_S = 6 * 3600;

const addDays = (iso: string, n: number) => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
};

/**
 * Hora de inicio del evento (minutos) según la liga; null si no tiene hora o el evento cae en otro día.
 * Una hora escrita a mano sin am/pm ("7:00") no se sabe si es de mañana o de noche: se toma como sin hora
 * (salvo las de 13:00 en adelante, que no tienen duda).
 */
export function eventStart(event: Pick<BowlingEvent, 'date'>, league: Pick<League, 'schedule'>): { minutes: number; label: string } | null {
  const text = league.schedule ?? '';
  const { days, time } = parseSchedule(text);
  if (!time) return null;
  const weekday = (parseDate(event.date).getDay() + 6) % 7; // 0 = lunes, como WEEKDAYS
  if (days.length > 0 && !days.includes(weekday)) return null;
  const [h, m] = time.split(':').map(Number);
  if (h < 13 && !/\d\s*[ap]\.?\s*m\b/i.test(text)) return null;
  return { minutes: h * 60 + m, label: formatTime(time) };
}

/**
 * Qué recordatorios tocan ahora para este evento. `today` es la fecha local ('YYYY-MM-DD') y `minutes`
 * los minutos del día en la hora de la liga. Devuelve los que ya tocan (del más viejo al más nuevo);
 * quien los manda recuerda cuáles ya salieron y solo envía el último.
 */
export function dueReminders(
  event: Pick<BowlingEvent, 'date' | 'type' | 'name'>,
  league: Pick<League, 'name' | 'schedule'>,
  today: string,
  minutes: number,
): Reminder[] {
  const start = eventStart(event, league);
  const what = event.type === 'torneo' ? `el torneo${event.name?.trim() ? ` ${event.name.trim()}` : ''}` : 'la práctica';
  const at = start ? ` a las ${start.label}` : '';
  const out: Reminder[] = [];

  if (event.date === addDays(today, 1) && minutes >= NOON && minutes < DAY_BEFORE_UNTIL) {
    const weekday = WEEKDAYS[(parseDate(event.date).getDay() + 6) % 7].toLowerCase();
    out.push({
      slot: 'dia-antes',
      title: `Recuerda: mañana es ${what}`,
      body: `${league.name} · ${weekday}${at}. ¿Vas? Confírmalo en la app.`,
    });
  }

  if (event.date === today) {
    const sameDayAt = start ? Math.max(EARLIEST, Math.min(NOON, start.minutes - 180)) : NOON;
    const sameDayUntil = start ? start.minutes - SOON_FROM : SAME_DAY_UNTIL;
    if (minutes >= sameDayAt && minutes < sameDayUntil) {
      out.push({ slot: 'mismo-dia', title: `Hoy es ${what}`, body: `${league.name}${at}. ¡Nos vemos en la bolera!` });
    }
    if (start && minutes >= start.minutes - SOON_FROM && minutes < start.minutes - SOON_UNTIL) {
      out.push({
        slot: 'una-hora',
        title: `A las ${start.label} empieza ${what}`,
        body: `${league.name}. Anota tus juegos en la app mientras juegas.`,
      });
    }
  }
  return out;
}

/**
 * Segundos que el servicio de push guarda el aviso si el teléfono está apagado: hasta que empieza el
 * evento (o hasta que se acaba su día, si no tiene hora), máximo 6 horas. Un recordatorio que llega
 * después de la práctica no sirve.
 */
export function reminderTtl(event: Pick<BowlingEvent, 'date'>, league: Pick<League, 'schedule'>, today: string, minutes: number): number {
  const start = eventStart(event, league);
  const dayOffset = event.date === today ? 0 : event.date === addDays(today, 1) ? 1440 : -1;
  if (dayOffset < 0) return 60;
  const until = dayOffset + (start ? start.minutes : 1440) - minutes;
  return Math.max(60, Math.min(MAX_TTL_S, until * 60));
}

/** Fecha ('YYYY-MM-DD') y minutos del día de `now` en una zona horaria (la de la liga). */
export function localNow(now: Date, timeZone: string): { today: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { today: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
