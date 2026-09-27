import { sportMeta, type UnitPair } from '../sports/registry';

/** 'YYYY-MM-DD' como fecha local (sin corrimiento por zona horaria). */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const formatDate = (s: string) =>
  parseDate(s).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });

export const formatDateLong = (s: string) =>
  parseDate(s).toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** El próximo martes (hoy si es martes): la práctica se crea antes para que los jugadores confirmen. */
export function nextTuesday(from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7));
  return toIsoDate(d);
}

/** Lo que hace falta de un evento para nombrarlo (sirve para el `BowlingEvent` y para los de otros deportes). */
type Nameable = { type: string; name: string; date: string };

/**
 * Nombre del evento. Sin deporte (o boliche): como en BowlingX, "Práctica 15 sept 2026" o "Torneo 2025".
 * Otros deportes: "<Tipo> 15 sept 2026".
 */
export const eventLabel = (e: Nameable, sport = 'bowling') =>
  e.name ||
  (sport !== 'bowling'
    ? `${typeLabel(e.type, sport)} ${formatDate(e.date)}`
    : e.type === 'practica'
      ? `Práctica ${formatDate(e.date)}`
      : `Torneo ${e.date.slice(0, 4)}`);

/** Nombre del tipo de evento según el deporte ('torneo' → 'Torneo'). Un tipo que el registro no tiene sale tal cual, con mayúscula. */
export function typeLabel(t: string, sport = 'bowling'): string {
  if (sport === 'bowling') return t === 'torneo' ? 'Torneo' : 'Práctica';
  const known = sportMeta(sport)?.eventTypes.find((x) => x.id === t);
  if (known) return known.label;
  const text = t.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Nombre con tipo y fecha sin repetir: "Práctica 15 sept 2026" o "Torneo · Copa X · 15 nov 2025". */
export const eventTitle = (e: Nameable, sport = 'bowling') =>
  e.name ? `${typeLabel(e.type, sport)} · ${e.name} · ${formatDate(e.date)}` : eventLabel(e, sport);

/** Nombre del deporte ("Boliche", "Fútbol sala"); uno que esta versión no conoce: "Otro deporte". */
export const sportLabel = (sport: string | null | undefined) => sportMeta(sport || 'bowling')?.label ?? 'Otro deporte';

/** Cómo se llama el lugar donde juegan: "Bolera", "Club", "Cancha", "Campo" o "Piscina". */
export const venueLabel = (sport: string | null | undefined) => sportMeta(sport || 'bowling')?.venue ?? 'Lugar';

/** Cantidad con su palabra en singular o plural: countLabel(1, ['partido', 'partidos']) → "1 partido". */
export const countLabel = (n: number, [one, many]: UnitPair) => `${num(n)} ${n === 1 ? one : many}`;

/** Lista en español: "boliche", "boliche y pádel", "boliche, pádel y tenis". */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export const num = (n: number) => n.toLocaleString('es-DO');
