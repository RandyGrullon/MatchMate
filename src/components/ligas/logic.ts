/**
 * Lo que no es pantalla de Ligas (se prueba sin navegador): de qué es una liga en texto («Pádel · Pública»), el resumen
 * de arriba («3 ligas · 1 en vivo · Próximo: hoy 7:30 pm»), el bloque de lo próximo de cada tarjeta y los números chicos
 * de abajo («6 jugadores», «2.º de 6», «Promedio 195»).
 */
import { dayLabel, type CalendarItem } from '../../lib/calendar';
import type { League } from '../../lib/types';
import { gameMeta } from '../../sports/esports/catalog';
import { DEFAULT_SPORT, leagueSport, sportMeta } from '../../sports/registry';
import type { Standing } from '../home/logic';
import { itemTime } from '../home/logic';

/** El deporte en texto: «Pádel», «Fútbol sala»; en esports, el juego («VALORANT») si se sabe. */
export function sportLabel(sport: string | null | undefined, game?: string | null): string {
  const id = sport || DEFAULT_SPORT;
  if (id === 'esports') return gameMeta(game)?.name ?? sportMeta(id)?.label ?? 'Esports';
  return sportMeta(id)?.label ?? 'Otro deporte';
}

/** De qué es la liga y quién entra: «Pádel · Pública», «VALORANT · Privada». */
export function leagueKindLine(l: Pick<League, 'id' | 'sport' | 'game' | 'visibility'>): { sport: string; rest: string } {
  return { sport: sportLabel(leagueSport(l), l.game), rest: l.visibility === 'private' ? 'Privada' : 'Pública' };
}

/** «hoy 7:30 pm», «mañana», «sábado 24 oct, 7:30 pm» (para frases: en minúscula). */
export function nextShort(next: Pick<CalendarItem, 'date' | 'time'>, today: string): string {
  const day = dayLabel(next.date, today).toLowerCase();
  if (!next.time) return day;
  return /\d/.test(day) ? `${day}, ${next.time}` : `${day} ${next.time}`;
}

/** Lo más pronto de varias ligas (lo próximo de cada una). */
export function soonest<T extends Pick<CalendarItem, 'date' | 'minutes'>>(items: Iterable<T>): T | null {
  let best: T | null = null;
  for (const it of items) if (!best || itemTime(it) < itemTime(best)) best = it;
  return best;
}

/** Un pedazo del resumen: `live` lleva el punto rojo; `next`, el color del deporte. */
export interface SummaryPart {
  key: 'ligas' | 'torneos' | 'live' | 'next';
  text: string;
}

/** «3 ligas · 2 torneos · 1 en vivo · Próximo: hoy 7:30 pm»: solo lo que hay. */
export function ligasSummary(o: {
  ligas: number;
  torneos: number;
  live: number;
  next: Pick<CalendarItem, 'date' | 'time'> | null;
  today: string;
}): SummaryPart[] {
  const parts: SummaryPart[] = [];
  if (o.ligas > 0) parts.push({ key: 'ligas', text: `${o.ligas} ${o.ligas === 1 ? 'liga' : 'ligas'}` });
  if (o.torneos > 0) parts.push({ key: 'torneos', text: `${o.torneos} ${o.torneos === 1 ? 'torneo' : 'torneos'}` });
  if (o.live > 0) parts.push({ key: 'live', text: `${o.live} en vivo` });
  if (o.next) parts.push({ key: 'next', text: `Próximo: ${nextShort(o.next, o.today)}` });
  return parts;
}

/** Junta el resumen en una línea (el lector de pantalla y las pruebas). */
export const summaryText = (parts: readonly SummaryPart[]) => parts.map((p) => p.text).join(' · ');

/**
 * El bloque de lo próximo de la tarjeta: arriba cuándo («Hoy, 7:30 pm», «Sábado 24 oct»), abajo qué y dónde
 * («Práctica · Bolera Sambil»; en un partido, «Jornada 3 · Cancha 2»). Sin nada en el calendario, el horario de la liga
 * («Martes · 7:30 pm», «Según el horario · Bolera Sambil»). null si no hay nada que decir.
 */
export function nextBlock(
  next: Pick<CalendarItem, 'date' | 'time' | 'name' | 'detail' | 'kind'> | null | undefined,
  league: Pick<League, 'name' | 'venue' | 'schedule'>,
  today: string,
): { date: string | null; today: boolean; when: string; what: string } | null {
  const venue = league.venue?.trim() || null;
  if (next) {
    const when = [dayLabel(next.date, today), next.time].filter(Boolean).join(', ');
    const name = next.name?.trim() && next.name.trim() !== league.name.trim() ? next.name.trim() : null;
    const where = next.detail?.trim() || venue;
    return { date: next.date, today: next.date === today, when, what: [name, where].filter(Boolean).join(' · ') };
  }
  const schedule = league.schedule?.trim();
  if (!schedule) return null;
  return { date: null, today: false, when: schedule, what: ['Según el horario', venue].filter(Boolean).join(' · ') };
}

/** Lo mío en la tabla de una liga de boliche: «2.º de 6» y «Promedio 195» (lo que haya). */
export function standingBits(s: Standing | null | undefined): { pos: string | null; average: string | null } {
  if (!s) return { pos: null, average: null };
  return { pos: s.pos != null ? `${s.pos}.º de ${s.of}` : null, average: s.average != null ? `Promedio ${s.average}` : null };
}
