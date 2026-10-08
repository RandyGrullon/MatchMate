import { awaitingConfirmation, type Match } from '../../../lib/data/matches';
import type { RsvpSummary } from '../../../lib/data/teamSports';
import { formatTime } from '../../../lib/schedule';
import { dayKey, roundLabel } from '../../../components/match/format';
import { localTime } from './schedule';

/**
 * Textos de las pantallas de equipos del rediseño «Calma y foco» (sin React, se prueban solos): el día del partido con
 * el mes siempre («Sáb 10 oct», nunca «MAR 13»), la hora como «7:00 pm», «Tigres vs. Leones», la marca de un equipo
 * («2-1-0 · +3»), cómo va la convocatoria («3 van · faltan 2») y qué pasó en un partido («Ganó Tigres»).
 */

const WEEKDAYS_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 'YYYY-MM-DD' → el día de la semana (0 = domingo), sin correrse por la zona. */
const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

/** Suma días a un 'YYYY-MM-DD'. */
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** El día de hoy en la zona de la liga ('YYYY-MM-DD'). */
export const todayIn = (tz: string, now: number = Date.now()): string => dayKey(new Date(now).toISOString(), tz) ?? new Date(now).toISOString().slice(0, 10);

/** La hora del partido en la zona de la liga: «7:00 pm» (null sin hora). */
export function matchTime(iso: string | null | undefined, tz: string): string | null {
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  return formatTime(localTime(iso, tz)) || null;
}

/**
 * El día del partido: «Hoy», «Mañana», «Ayer» o «Sáb 10 oct» (`long`: «Sábado 10 oct»), con el año solo si no es el
 * de hoy. null sin fecha.
 */
export function matchDayLabel(iso: string | null | undefined, tz: string, today: string, long = false): string | null {
  const day = dayKey(iso, tz);
  if (!day) return null;
  if (day === today) return 'Hoy';
  if (day === addDays(today, 1)) return 'Mañana';
  if (day === addDays(today, -1)) return 'Ayer';
  const [y, m, d] = day.split('-').map(Number);
  const text = `${(long ? WEEKDAYS_LONG : WEEKDAYS_SHORT)[weekdayOf(day)]} ${d} ${MONTHS[m - 1]}`;
  return day.slice(0, 4) === today.slice(0, 4) ? text : `${text} ${y}`;
}

/** «Sáb 10 oct · 7:00 pm» (o «Hoy · 7:00 pm»); «Sin fecha» si no tiene. */
export function matchWhen(iso: string | null | undefined, tz: string, today: string, long = false): string {
  const day = matchDayLabel(iso, tz, today, long);
  if (!day) return 'Sin fecha';
  const time = matchTime(iso, tz);
  return time ? `${day} · ${time}` : day;
}

/**
 * La línea de una fila con su bloque de fecha (el día y el mes ya están en el bloque): «Sábado · 7:00 pm · Jornada 3»,
 * con «Hoy» o «Mañana» en vez del día de la semana.
 */
export function rowWhen(
  m: Pick<Match, 'scheduledAt' | 'round' | 'stage' | 'court' | 'status'>,
  tz: string,
  today: string,
  roundWord = 'Jornada',
  court = false,
  round = true,
): string {
  const day = dayKey(m.scheduledAt, tz);
  const parts: (string | null)[] = [];
  if (m.status === 'postponed') parts.push('Aplazado');
  else if (day) {
    const near = day === today ? 'Hoy' : day === addDays(today, 1) ? 'Mañana' : day === addDays(today, -1) ? 'Ayer' : WEEKDAYS_LONG[weekdayOf(day)];
    parts.push(near, matchTime(m.scheduledAt, tz));
  } else parts.push('Sin fecha');
  if (round) parts.push(m.stage || roundLabel(m.round, roundWord) || null);
  if (court) parts.push(m.court || null);
  // «7:00 pm» y «Jornada 3» no se parten al final de una línea (espacio duro).
  return parts
    .filter(Boolean)
    .map((p) => (p as string).replace(/^(\d{1,2}:\d{2}) (am|pm)$|^(\S+) (\d+)$/, (_, t, ap, w, n) => (t ? `${t}\u00a0${ap}` : `${w}\u00a0${n}`)))
    .join(' · ');
}

/** «Tigres vs. Leones». */
export const vsTitle = (names: readonly [string, string]) => `${names[0]} vs. ${names[1]}`;

/** La marca de un equipo en la tabla: «2-0» (sin empates) o «2-1-0 · +3» (con empates y diferencia). */
export function recordLine(r: { won: number; drawn?: number; lost: number; diff?: number }, draws = false): string {
  if (!draws) return `${r.won}-${r.lost}`;
  const diff = r.diff ?? 0;
  return `${r.won}-${r.drawn ?? 0}-${r.lost} · ${diff > 0 ? `+${diff}` : diff}`;
}

/** Cómo va la convocatoria de un equipo: «3 van · faltan 2», «5 van · listos», «Nadie ha respondido» (el mínimo va aparte). */
export function rsvpLine(sum: Pick<RsvpSummary, 'yes' | 'maybe' | 'no' | 'none'>, minPlayers: number): string {
  const yes = sum.yes.length;
  const missing = minPlayers - yes;
  if (!yes && !sum.maybe.length && !sum.no.length) return 'Nadie ha respondido';
  const head = `${yes} ${yes === 1 ? 'va' : 'van'}`;
  const maybe = sum.maybe.length ? ` · ${sum.maybe.length} tal vez` : '';
  if (minPlayers <= 0) return head + maybe;
  return missing > 0 ? `${head}${maybe} · faltan ${missing}` : `${head}${maybe} · listos`;
}

/**
 * Qué pasó en el partido, corto: «Ganó Tigres», «Empate», «W.O.: no vino Leones», «Por confirmar», «En disputa»,
 * «Anulado» (null si todavía no se juega).
 */
export function resultLine(m: Pick<Match, 'status' | 'winner' | 'walkoverSide' | 'proposedAt'>, names: readonly [string, string], now: number = Date.now()): string | null {
  switch (m.status) {
    case 'walkover':
      return m.walkoverSide === 0 ? 'W.O.: no vino ninguno' : `W.O.: no vino ${names[(m.walkoverSide ?? 2) - 1]}`;
    case 'disputed':
      return 'En disputa';
    case 'void':
      return 'Anulado';
    case 'finished':
    case 'confirmed': {
      const head = m.winner ? `Ganó ${names[m.winner - 1]}` : 'Empate';
      return awaitingConfirmation(m, now) ? `${head} · por confirmar` : head;
    }
    default:
      return null;
  }
}

/** El marcador corto para el final de una fila: «72–65» (null sin marcador). */
export function scoreShort(m: Pick<Match, 'score'>): string | null {
  const s = m.score?.sides;
  if (Array.isArray(s) && s.length === 2 && s.every((n) => Number.isFinite(n))) return `${s[0]}–${s[1]}`;
  const text = typeof m.score?.text === 'string' ? m.score.text : '';
  const pair = /(\d{1,3})\s*[-–:]\s*(\d{1,3})/.exec(text);
  return pair ? `${pair[1]}–${pair[2]}` : null;
}
