import type { BowlingEvent } from './types';

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

export const eventLabel = (e: Pick<BowlingEvent, 'type' | 'name' | 'date'>) =>
  e.name || (e.type === 'practica' ? `Práctica ${formatDate(e.date)}` : `Torneo ${e.date.slice(0, 4)}`);

export const typeLabel = (t: BowlingEvent['type']) => (t === 'torneo' ? 'Torneo' : 'Práctica');

/** Nombre con tipo y fecha sin repetir: "Práctica 15 sept 2026" o "Torneo · Copa X · 15 nov 2025". */
export const eventTitle = (e: Pick<BowlingEvent, 'type' | 'name' | 'date'>) =>
  e.name ? `${typeLabel(e.type)} · ${e.name} · ${formatDate(e.date)}` : eventLabel(e);

export const num = (n: number) => n.toLocaleString('es-DO');
