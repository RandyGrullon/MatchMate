/**
 * Lo que no es pantalla del inicio y del encuentro de natación: la línea de cada encuentro en las listas, lo que dice
 * la tarjeta del próximo encuentro (y si lleva «Cronometrar»), la línea debajo del título del encuentro y tus últimas
 * marcas. Funciones puras: las usan la web (SwimHome, MeetPage) y la app del teléfono.
 */
import { eventDay } from '../../../components/event/eventDay';
import { weekdayLabel } from '../../../components/home/logic';
import type { SwimHistoryItem, SwimMeet } from '../../../lib/data/swimming';
import { formatTime } from '../../../lib/schedule';
import { personalBests, type PersonalBest } from '../../../sports/swimming';
import { STAGE_LABEL, meetStage } from './logic';

/** Un encuentro en la lista (con su fecha «OCT / 24»): cuándo, la piscina y en qué va (inscripciones, series, final). */
export function meetRowLine(m: SwimMeet, today: string): string {
  const ahead = m.date >= today;
  return [
    ahead ? weekdayLabel(m.date, today) : null,
    ahead && m.startTime ? formatTime(m.startTime.slice(0, 5)) : null,
    m.type === 'control' ? 'Control de marcas' : `Piscina ${m.pool} m`,
    STAGE_LABEL[meetStage(m, 1)],
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * La tarjeta del próximo encuentro: «Hoy · 8:00 am» (o «Próximo encuentro»), la línea con cuándo y en qué va y, el día
 * del encuentro, si lleva «Cronometrar» (quien toma los tiempos, con las series publicadas y el encuentro abierto).
 */
export function nextMeetView(meet: SwimMeet, today: string, isTimer: boolean): { isToday: boolean; when: string; line: string; timing: boolean } {
  const isToday = meet.date === today;
  const time = meet.startTime ? formatTime(meet.startTime.slice(0, 5)) : '';
  const when = isToday ? (time ? `Hoy · ${time}` : 'Hoy') : 'Próximo encuentro';
  const line = [
    isToday ? null : eventDay(meet.date, today),
    isToday ? null : time || null,
    meet.type === 'control' ? 'Control de marcas' : `Piscina ${meet.pool} m`,
    STAGE_LABEL[meetStage(meet, 1)],
  ]
    .filter(Boolean)
    .join(' · ');
  return { isToday, when, line, timing: isToday && isTimer && !!meet.heatsPublishedAt && !meet.finalizedAt };
}

/** Debajo del título del encuentro: el día, la hora, la piscina (Pro: los carriles y cuántas pruebas) y si es control. */
export function meetMeta(meet: SwimMeet, today: string, isPro: boolean, events: number): string {
  return [
    eventDay(meet.date, today, isPro),
    meet.startTime ? formatTime(meet.startTime.slice(0, 5)) : null,
    `Piscina ${meet.pool} m`,
    isPro ? `${meet.lanes} carriles` : null,
    meet.type === 'control' ? 'Control de marcas' : null,
    isPro && events ? `${events} pruebas` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Tus marcas en el inicio: las `n` más recientes. */
export const latestBests = (history: readonly SwimHistoryItem[], n = 4): PersonalBest[] =>
  personalBests(history)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, n);
