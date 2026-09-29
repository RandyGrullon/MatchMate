/**
 * Lo que no es pantalla del Home, el Home de cada deporte y Eventos (se prueba sin navegador): saludo, lo próximo de
 * cada liga, qué va primero (el próximo partido o el próximo evento), buscar ligas y agruparlas por deporte, y la
 * línea de cada liga pública («24 jugadores · juega el martes»).
 */
import { dayLabel, type CalendarItem, type NextMatchInfo, type CalendarMatch } from '../../lib/calendar';
import { parseDate } from '../../lib/format';
import { WEEKDAYS } from '../../lib/schedule';
import { leagueSport, sportsOf } from '../../sports/registry';
import { countLabel, peopleWord } from '../league/logic';

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

// ---------- Ligas públicas ----------

/** Lo que usa la línea de una liga pública (public_leagues_feed). */
export interface PublicLineInput {
  sport?: string | null;
  kind?: string | null;
  members: number;
  players: number;
  /** El día del próximo evento o partido (YYYY-MM-DD, en la zona de la liga) o null. */
  nextEventDate: string | null;
  /** Lo último que pasó (ISO) o null. */
  lastActivityAt: string | null;
}

/** Días hacia atrás en que una liga sin nada programado todavía cuenta como «activa esta semana». */
export const ACTIVE_DAYS = 7;

/** «juega hoy», «juega mañana», «juega el martes», «juega el 12 de octubre» (un torneo «se juega»; natación «compite»). */
export function playsWhen(date: string, today: string, opts: { sport?: string | null; kind?: string | null } = {}): string | null {
  const gap = Math.round((parseDate(date).getTime() - parseDate(today).getTime()) / 86_400_000);
  if (!Number.isFinite(gap) || gap < 0) return null;
  const verb = `${opts.kind === 'torneo' ? 'se ' : ''}${opts.sport === 'swimming' ? 'compite' : 'juega'}`;
  if (gap === 0) return `${verb} hoy`;
  if (gap === 1) return `${verb} mañana`;
  const d = parseDate(date);
  if (gap < 7) return `${verb} el ${WEEKDAYS[(d.getDay() + 6) % 7].toLowerCase()}`;
  return `${verb} el ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`;
}

/**
 * La línea de una liga pública: cuántos son (los de la lista o las cuentas, lo que sea más) y cuándo juega (su
 * próximo evento o partido); sin nada programado, si tuvo movimiento en la última semana. «24 jugadores · juega el
 * martes», «12 nadadores · compite el sábado», «8 jugadores · activa esta semana» (un torneo, «activo»). '' si no hay
 * nada que decir.
 */
export function publicLeagueLine(l: PublicLineInput, today: string, now: number): string {
  const n = Math.max(l.players ?? 0, l.members ?? 0);
  const who = n > 0 ? countLabel(n, peopleWord(l.sport)) : '';
  let when = l.nextEventDate ? playsWhen(l.nextEventDate, today, l) : null;
  if (!when && l.lastActivityAt) {
    const at = Date.parse(l.lastActivityAt);
    // Un torneo es «activo»; una liga, «activa».
    if (Number.isFinite(at) && at >= now - ACTIVE_DAYS * 86_400_000) when = l.kind === 'torneo' ? 'activo esta semana' : 'activa esta semana';
  }
  return [who, when].filter(Boolean).join(' · ');
}
