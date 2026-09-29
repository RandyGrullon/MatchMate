import type { AgendaItem, AgendaJoined } from '../../lib/data/agenda';
import { eventLabel } from '../../lib/format';
import { SPORT_IDS, sportMeta } from '../../sports/registry';

/**
 * «¿Dónde juego esta semana?»: lo que la pantalla decide sin tocar la base (filtros, grupos por día y los textos de
 * cada tarjeta).
 */

/** Deportes con algo para apuntarse en la agenda: boliche («Voy»), golf (rondas) y raqueta (noches y torneos). */
export const hasAgenda = (sport: string | null | undefined): boolean =>
  !!sport && (sport === 'bowling' || sport === 'golf' || sportMeta(sport)?.family === 'racket');

/** La nota de la tarjeta «¿Dónde juego esta semana?» del Home (o del Home de un deporte). */
export function agendaCardNote(sport: string | null | undefined): string {
  if (sport === 'bowling') return 'Prácticas y torneos de boliche abiertos';
  if (sport === 'golf') return 'Rondas de golf con inscripción abierta';
  if (sport && hasAgenda(sport)) return `Noches y torneos de ${sportMeta(sport)?.lower ?? 'raqueta'} con lugar`;
  return 'Prácticas, rondas y noches abiertas en ligas públicas';
}

/** Los deportes que salen en la lista, en el orden de siempre. */
export function agendaSports(items: readonly Pick<AgendaItem, 'sport'>[]): string[] {
  const set = new Set(items.map((i) => i.sport));
  return [...SPORT_IDS.filter((s) => set.has(s)), ...[...set].filter((s) => !(SPORT_IDS as readonly string[]).includes(s)).sort()];
}

/** Solo ese deporte y ese día (null = todos). */
export function filterAgenda<T extends Pick<AgendaItem, 'sport' | 'date'>>(items: readonly T[], sport: string | null, day: string | null): T[] {
  return items.filter((i) => (!sport || i.sport === sport) && (!day || i.date === day));
}

/** Por día, en orden (la base ya los manda por día y hora). */
export function groupByDay<T extends Pick<AgendaItem, 'date'>>(items: readonly T[]): { date: string; items: T[] }[] {
  const out: { date: string; items: T[] }[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.date === it.date) last.items.push(it);
    else out.push({ date: it.date, items: [it] });
  }
  return out;
}

/** Nombre del evento: el suyo o «Práctica 15 sept 2026», «Americano 3 oct 2026». */
export const agendaTitle = (i: Pick<AgendaItem, 'type' | 'name' | 'date' | 'sport'>) => eventLabel(i, i.sport);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Cuántos lugares quedan o cuántos van: «Quedan 3 lugares», «12 van», «4 inscritos · 2 en espera». */
export function spotsText(i: Pick<AgendaItem, 'join' | 'cap' | 'taken' | 'spotsLeft' | 'waitlist'>): string {
  const parts: string[] = [];
  if (i.spotsLeft != null) parts.push(i.spotsLeft === 1 ? 'Queda 1 lugar' : `Quedan ${i.spotsLeft} lugares`);
  else if (i.taken != null && i.taken > 0) {
    parts.push(i.join === 'rsvp' ? `${i.taken} ${i.taken === 1 ? 'va' : 'van'}` : plural(i.taken, 'inscrito', 'inscritos'));
  } else parts.push(i.join === 'rsvp' ? 'Nadie ha dicho «Voy» todavía' : 'Sin inscritos todavía');
  if (i.waitlist) parts.push(`${i.waitlist} en espera`);
  return parts.join(' · ');
}

/** «Me apunto» se hace en el evento: los torneos de raqueta (categoría, pareja). */
export const joinsInEvent = (i: Pick<AgendaItem, 'join' | 'categories'>) => i.join === 'signup' && i.categories != null;

/**
 * Qué hace «Me apunto»: un torneo de raqueta (categoría, pareja) se apunta en su evento; sin cuenta, a entrar y volver;
 * en una liga de la que todavía no es miembro, primero se une como en todas partes (useJoinFlow de
 * src/components/league/WhoAreYou.tsx: si la liga tiene jugadores sin cuenta, «¿Quién eres?» para no quedar dos veces en
 * la tabla) y después se apunta; si ya es miembro, o sus ligas no se han leído (`leagues` null), se apunta directo.
 */
export type AgendaJoinStep = 'event' | 'login' | 'league' | 'direct';
export function agendaJoinStep(
  i: Pick<AgendaItem, 'join' | 'categories' | 'leagueId'>,
  me: { signedIn: boolean; leagues: ReadonlySet<string> | null },
): AgendaJoinStep {
  if (joinsInEvent(i)) return 'event';
  if (!me.signedIn) return 'login';
  if (me.leagues && !me.leagues.has(i.leagueId)) return 'league';
  return 'direct';
}

/** Lo que dice la tarjeta cuando ya es mío. */
export const mineLabel = (i: Pick<AgendaItem, 'join'>) => (i.join === 'rsvp' ? 'Vas' : i.join === 'golf' ? 'Inscrito' : 'Apuntado');

/** El aviso después de apuntarse. */
export function joinedMessage(i: Pick<AgendaItem, 'type' | 'name' | 'date' | 'sport'>, r: AgendaJoined): string {
  const title = agendaTitle(i);
  switch (r.kind) {
    case 'going':
      return `Listo: vas a ${title}`;
    case 'registered':
      return `Quedaste inscrito en ${title}`;
    case 'in':
      return `Estás en la lista de ${title}`;
    case 'wait':
      return r.position > 0 ? `Quedaste en espera (n.º ${r.position}) en ${title}` : `Quedaste en espera en ${title}`;
  }
}

/** Parámetro con el evento a apuntar al volver de entrar a la cuenta. */
export const JOIN_PARAM = 'apuntar';

/** Adónde volver después de entrar: la agenda con los filtros y el evento que se quería. */
export function loginNext(search: string, eventId: string): string {
  const p = new URLSearchParams(search);
  p.set(JOIN_PARAM, eventId);
  return `/login?next=${encodeURIComponent(`/agenda?${p.toString()}`)}`;
}
