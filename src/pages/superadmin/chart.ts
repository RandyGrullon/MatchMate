/**
 * Cuentas de las gráficas de la consola (sin React): escalas, marcas del eje, trazos SVG y comparación
 * de periodos. Las gráficas dibujan en un lienzo de 0–100 × 0–100 que se estira al ancho de la tarjeta.
 */
import type { AdminSeriesPoint } from '../../lib/data/admin';
import { pctChange } from './format';

/** Paso «bonito» (1, 2, 2.5, 5 × 10ⁿ) que cubre `raw`. */
export function niceStep(raw: number, integer = true): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  if (!integer) return step;
  // Conteos (cuentas, partidos): el paso nunca es menor que 1 ni con decimales (2.5 pasa a 5).
  if (step < 1) return 1;
  return Number.isInteger(step) ? step : step * 2;
}

/**
 * Marcas del eje Y desde 0 hasta un tope redondo ≥ `max` (unas `count` marcas).
 * max 0 → [0, 1] (una gráfica vacía igual tiene eje).
 */
export function yTicks(max: number, count = 4, integer = true): number[] {
  const m = Number.isFinite(max) && max > 0 ? max : 0;
  if (m === 0) return [0, 1];
  const step = niceStep(m / count, integer);
  const top = Math.ceil(m / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 1e6; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export interface Pt {
  x: number;
  y: number;
}

/** Valores → puntos en el lienzo 0–100 (x repartida, y = 0 arriba). Un solo valor queda al centro. */
export function toPoints(values: readonly number[], top: number): Pt[] {
  const n = values.length;
  const t = top > 0 ? top : 1;
  return values.map((v, i) => ({
    x: n <= 1 ? 50 : (i / (n - 1)) * 100,
    y: 100 - (Math.max(0, Math.min(v, t)) / t) * 100,
  }));
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Trazo de la línea: «M x y L x y …». */
export function linePath(pts: readonly Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${r2(p.x)} ${r2(p.y)}`).join(' ');
}

/** Área bajo la línea hasta la base (y = 100). */
export function areaPath(pts: readonly Pt[]): string {
  if (!pts.length) return '';
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `${linePath(pts)} L${r2(last.x)} 100 L${r2(first.x)} 100 Z`;
}

/** Índice del punto más cercano a una posición horizontal (0–1 del ancho). */
export function nearestIndex(fraction: number, n: number): number {
  if (n <= 1) return 0;
  const f = Math.max(0, Math.min(1, fraction));
  return Math.round(f * (n - 1));
}

/** Posiciones (índices) donde poner etiquetas del eje X sin que se pisen: primera, última y algunas en medio. */
export function xLabelIndexes(n: number, max = 5): number[] {
  if (n <= 0) return [];
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const out = new Set<number>();
  for (let k = 0; k < max; k++) out.add(Math.round((k * (n - 1)) / (max - 1)));
  return [...out].sort((a, b) => a - b);
}

/** Fracción para una barra o un medidor, entre 0 y 1. */
export const fraction = (value: number, max: number) => (max > 0 ? Math.max(0, Math.min(1, value / max)) : 0);

/** Tono de un medidor según lo lleno: normal, aviso (≥ 80 %) o peligro (≥ 95 %). */
export function meterTone(r: number): 'accent' | 'warn' | 'danger' {
  return r >= 0.95 ? 'danger' : r >= 0.8 ? 'warn' : 'accent';
}

export type SeriesMetric = Exclude<keyof AdminSeriesPoint, 'day'>;

/** La serie ordenada por día (la base ya la manda así, pero no cuesta asegurarlo). */
export const sortSeries = (s: readonly AdminSeriesPoint[]) => [...s].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

/**
 * Últimos 7 días contra los 7 anteriores (sumando cada día). Sirve para lo que se suma (altas, eventos,
 * partidos, juegos, lecturas); no para `activeUsers` (una cuenta cuenta en varios días).
 */
export function weekOverWeek(series: readonly AdminSeriesPoint[], metric: SeriesMetric): { current: number; previous: number; change: number | null; enough: boolean } {
  const s = sortSeries(series);
  const sum = (from: number, to: number) => s.slice(Math.max(0, from), Math.max(0, to)).reduce((acc, p) => acc + (p[metric] ?? 0), 0);
  const n = s.length;
  const current = sum(n - 7, n);
  const previous = sum(n - 14, n - 7);
  return { current, previous, change: pctChange(current, previous), enough: n >= 14 };
}

/** Los últimos `n` valores de una métrica (para la minigráfica de una tarjeta). */
export const lastValues = (series: readonly AdminSeriesPoint[], metric: SeriesMetric, n = 30): number[] =>
  sortSeries(series)
    .slice(-n)
    .map((p) => p[metric] ?? 0);
