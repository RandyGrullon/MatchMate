import type { LeagueFeed } from './data';
import { parseDate, toIsoDate } from './format';
import { eventStart } from './reminders';
import { parseSchedule } from './schedule';
import type { BowlingEvent, League } from './types';

/** Un día del calendario de "Próximos" en el Home. */
export interface CalendarItem {
  /** Para ordenar y como key. */
  key: string;
  date: string;
  lid: string;
  leagueName: string;
  type: BowlingEvent['type'];
  name: string;
  /** "7:00 pm" si se sabe la hora. */
  time: string | null;
  minutes: number | null;
  /** null = práctica que toca según el horario de la liga, pero el admin todavía no la creó. */
  eventId: string | null;
  playerId: string | null;
  going: boolean;
}

const addDays = (iso: string, n: number) => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
};

/** Día de la semana de `iso` (0 = lunes, como WEEKDAYS). */
const weekdayOf = (iso: string) => (parseDate(iso).getDay() + 6) % 7;

/** Días entre dos fechas. */
const dayGap = (a: string, b: string) => Math.round(Math.abs(parseDate(a).getTime() - parseDate(b).getTime()) / 86_400_000);

/** Lunes de la semana de `iso` (las semanas del calendario van de lunes a domingo). */
export function weekStart(iso: string): string {
  return addDays(iso, -weekdayOf(iso));
}

/**
 * Lo que viene en tus ligas entre `from` y `from + days`: las prácticas y torneos creados y, en las
 * ligas con horario (p. ej. "Martes · 7:00 pm"), también las prácticas de cada semana aunque el admin
 * todavía no las haya creado. Ordenado por día y hora.
 */
export function upcomingCalendar(feeds: LeagueFeed[], leagues: League[], from: string, days: number): CalendarItem[] {
  const to = addDays(from, days);
  const out: CalendarItem[] = [];
  for (const feed of feeds) {
    const league = leagues.find((l) => l.id === feed.lid);
    if (!league) continue;
    const base = { lid: feed.lid, leagueName: league.name, playerId: feed.playerId };
    const inRange = feed.events.filter((e) => e.date >= from && e.date < to);
    for (const e of inRange) {
      const start = eventStart(e, league);
      out.push({
        ...base,
        key: `${feed.lid}:${e.id}`,
        date: e.date,
        type: e.type,
        name: e.type === 'torneo' ? e.name?.trim() || 'Torneo' : 'Práctica',
        time: start?.label ?? null,
        minutes: start?.minutes ?? null,
        eventId: e.id,
        going: !!(feed.playerId && e.rsvp?.[feed.playerId]),
      });
    }
    // Prácticas de cada semana según el horario (las ligas; un torneo sin liga no se repite), solo dentro
    // de la temporada y en los días que no tienen ya algo creado (un torneo ese día la reemplaza).
    if (league.kind === 'torneo') continue;
    const { days: weekdays } = parseSchedule(league.schedule ?? '');
    if (!weekdays.length) continue;
    const busy = new Set(feed.events.map((e) => e.date));
    const planned: string[] = [];
    for (let d = from; d < to; d = addDays(d, 1)) {
      if (!weekdays.includes(weekdayOf(d)) || busy.has(d)) continue;
      if ((league.seasonStart && d < league.seasonStart) || (league.seasonEnd && d > league.seasonEnd)) continue;
      planned.push(d);
    }
    // Una práctica movida a otro día (p. ej. al miércoles porque el martes era feriado) reemplaza la del
    // horario más cercana de esa misma semana (si empatan, la primera).
    for (const moved of feed.events) {
      if (moved.type !== 'practica' || weekdays.includes(weekdayOf(moved.date))) continue;
      const week = weekStart(moved.date);
      let pick = -1;
      planned.forEach((d, i) => {
        if (weekStart(d) === week && (pick < 0 || dayGap(d, moved.date) < dayGap(planned[pick], moved.date))) pick = i;
      });
      if (pick >= 0) planned.splice(pick, 1);
    }
    for (const d of planned) {
      const start = eventStart({ date: d }, league);
      out.push({
        ...base,
        key: `${feed.lid}:horario:${d}`,
        date: d,
        type: 'practica',
        name: 'Práctica',
        time: start?.label ?? null,
        minutes: start?.minutes ?? null,
        eventId: null,
        going: false,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.minutes ?? 0) - (b.minutes ?? 0) || a.leagueName.localeCompare(b.leagueName));
}
