/**
 * Lo que no es pantalla del Home, el Home de cada deporte y Eventos (se prueba sin navegador): saludo, lo próximo de
 * cada liga, qué va primero (el próximo partido o el próximo evento), buscar ligas y agruparlas por deporte.
 */
import { dayLabel, type CalendarItem, type NextMatchInfo, type CalendarMatch } from '../../lib/calendar';
import { parseDate } from '../../lib/format';
import { WEEKDAYS } from '../../lib/schedule';
import { leagueSport, sportsOf } from '../../sports/registry';

const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «Buenos días» (5 a 11:59), «Buenas tardes» (12 a 18:59), «Buenas noches». */
export function greeting(now: Date): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** «Domingo 28 de septiembre». */
export function todayLabel(now: Date): string {
  return `${WEEKDAYS[(now.getDay() + 6) % 7]} ${now.getDate()} de ${MONTHS_LONG[now.getMonth()]}`;
}

/** Minutos que ya pasaron de algo que empezó y todavía sale como «próximo» (el evento de hoy recién empezado). */
export const EVENT_GRACE_MIN = 30;

/** ¿Todavía viene? (hoy: si no tiene hora, o si empieza a partir de hace 30 minutos). */
function upcoming(it: Pick<CalendarItem, 'date' | 'minutes'>, today: string, nowMinutes: number): boolean {
  if (it.date > today) return true;
  if (it.date < today) return false;
  return it.minutes == null || it.minutes >= nowMinutes - EVENT_GRACE_MIN;
}

/** El próximo evento (no partido) de la lista del calendario (ya viene ordenada por día y hora). */
export function nextEventItem(items: readonly CalendarItem[], today: string, nowMinutes: number): CalendarItem | null {
  return items.find((it) => it.kind === 'event' && upcoming(it, today, nowMinutes)) ?? null;
}

/** Lo próximo de cada liga (evento o partido): la tarjeta de la liga dice «Próximo: Hoy · 7:00 pm». */
export function nextByLeague(items: readonly CalendarItem[], today: string, nowMinutes: number): Map<string, CalendarItem> {
  const out = new Map<string, CalendarItem>();
  for (const it of items) {
    if (out.has(it.lid) || !upcoming(it, today, nowMinutes)) continue;
    out.set(it.lid, it);
  }
  return out;
}

/** Cuándo es algo del calendario: «Hoy · 7:00 pm», «Sábado», «Martes 7 oct · 8:00 pm». */
export function whenLabel(it: Pick<CalendarItem, 'date' | 'time'>, today: string): string {
  return [dayLabel(it.date, today), it.time].filter(Boolean).join(' · ');
}

/** Momento (ms, hora del teléfono) de algo del calendario; sin hora, el comienzo del día. */
export function itemTime(it: Pick<CalendarItem, 'date' | 'minutes'>): number {
  return parseDate(it.date).getTime() + (it.minutes ?? 0) * 60_000;
}

export type NextUp<M extends CalendarMatch = CalendarMatch> =
  | { kind: 'match'; match: NextMatchInfo<M> }
  | { kind: 'event'; event: CalendarItem }
  | null;

/** Lo que va primero: mi próximo partido o mi próximo evento (si empatan, el partido, que tiene hora exacta). */
export function pickNextUp<M extends CalendarMatch>(match: NextMatchInfo<M> | null, event: CalendarItem | null, now: number): NextUp<M> {
  if (!match && !event) return null;
  if (!event) return { kind: 'match', match: match! };
  if (!match) return { kind: 'event', event };
  const matchAt = now + match.minutesLeft * 60_000;
  return itemTime(event) < matchAt ? { kind: 'event', event } : { kind: 'match', match };
}

/** Texto para buscar: minúsculas y sin tildes («Pádel» = «padel»). */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Ligas cuyo nombre o lugar tiene todas las palabras buscadas (vacío = todas). */
export function searchLeagues<L extends { name: string; venue?: string | null }>(leagues: readonly L[], query: string): L[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [...leagues];
  return leagues.filter((l) => {
    const hay = normalize(`${l.name} ${l.venue ?? ''}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Ligas agrupadas por deporte, en el orden del registro (los deportes desconocidos al final). */
export function groupBySport<L extends { id: string; sport?: string | null }>(leagues: readonly L[]): { sport: string; leagues: L[] }[] {
  return sportsOf(leagues).map((sport) => ({ sport, leagues: leagues.filter((l) => leagueSport(l) === sport) }));
}

/** «1 liga», «3 ligas y 1 torneo», «2 torneos». */
export function leaguesCountLabel(leagues: readonly { kind?: string | null }[]): string {
  const t = leagues.filter((l) => l.kind === 'torneo').length;
  const n = leagues.length - t;
  const parts = [n ? `${n} ${n === 1 ? 'liga' : 'ligas'}` : '', t ? `${t} ${t === 1 ? 'torneo' : 'torneos'}` : ''].filter(Boolean);
  return parts.join(' y ') || 'Sin ligas';
}
