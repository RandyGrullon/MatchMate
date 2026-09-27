import { leagueSport } from '../sports/registry';
import type { LeagueFeed } from './data';
import { parseDate, toIsoDate, typeLabel } from './format';
import { eventStart } from './reminders';
import { formatTime, parseSchedule } from './schedule';
import type { League } from './types';

/** Un día del calendario de "Próximos" en el Home. */
export interface CalendarItem {
  /** Para ordenar y como key. */
  key: string;
  date: string;
  lid: string;
  leagueName: string;
  /** Deporte de la liga: el «voy» y las prácticas según el horario son solo del boliche. */
  sport: string;
  /** Tipo del evento tal como está en la base: 'practica' | 'torneo' (boliche), 'americano', 'ronda', 'encuentro'… */
  type: string;
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

/** "7:30 pm" de una hora 'HH:MM' o 'HH:MM:SS' de la base; null si no hay o no se entiende. */
function startOf(time: string | null | undefined): { minutes: number; label: string } | null {
  const hhmm = time?.slice(0, 5) ?? '';
  const label = hhmm ? formatTime(hhmm) : '';
  if (!label) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return { minutes: h * 60 + m, label };
}

/**
 * Lo que viene en tus ligas entre `from` y `from + days`: las prácticas y torneos creados y, en las
 * ligas con horario (p. ej. "Martes · 7:00 pm"), también las prácticas de cada semana aunque el admin
 * todavía no las haya creado. Ordenado por día y hora.
 *
 * Las prácticas (el «voy» y las que salen solas del horario) son del boliche. En los otros deportes salen
 * los eventos creados con su tipo («Americano», «Ronda», «Encuentro»…) y su hora, sin prácticas inventadas.
 */
export function upcomingCalendar(feeds: LeagueFeed[], leagues: League[], from: string, days: number): CalendarItem[] {
  const to = addDays(from, days);
  const out: CalendarItem[] = [];
  for (const feed of feeds) {
    const league = leagues.find((l) => l.id === feed.lid);
    if (!league) continue;
    const sport = leagueSport(league);
    const base = { lid: feed.lid, leagueName: league.name, playerId: feed.playerId, sport };
    const inRange = feed.events.filter((e) => e.date >= from && e.date < to);
    if (sport !== 'bowling') {
      for (const e of inRange) {
        const start = startOf(e.startTime) ?? eventStart(e, league);
        out.push({
          ...base,
          key: `${feed.lid}:${e.id}`,
          date: e.date,
          type: e.type,
          name: e.name?.trim() || typeLabel(e.type, sport),
          time: start?.label ?? null,
          minutes: start?.minutes ?? null,
          eventId: e.id,
          going: false,
        });
      }
      continue;
    }
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
