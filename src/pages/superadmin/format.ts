/**
 * Formatos de la consola (números, bytes, porcentajes, fechas y «hace cuánto»), todo en es-DO.
 * Funciones puras: se prueban en format.test.ts.
 */

const LOCALE = 'es-DO';
const nf = new Intl.NumberFormat(LOCALE);
const compactNf = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });
const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

/** Guion largo para «no se sabe». */
export const NONE = '—';

export const KB = 1024;
export const MB = 1024 * KB;
export const GB = 1024 * MB;

/** 1234567 → «1,234,567». null → «—». */
export function fmtNum(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? NONE : nf.format(n);
}

/** Números grandes cortos para tarjetas: 12900 → «12.9 k». Hasta 9 999 se escribe completo. */
export function fmtCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return NONE;
  return Math.abs(n) < 10_000 ? nf.format(n) : compactNf.format(n);
}

/** Bytes legibles: «512 B», «3.4 MB», «812 MB», «1.2 GB». null → «—». */
export function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return NONE;
  const units: [number, string][] = [
    [GB, 'GB'],
    [MB, 'MB'],
    [KB, 'KB'],
  ];
  for (const [size, unit] of units) {
    if (bytes >= size) {
      const v = bytes / size;
      const digits = v < 10 ? 1 : 0;
      return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits }).format(v)} ${unit}`;
    }
  }
  return `${nf.format(bytes)} B`;
}

/** 0.8 → «80 %». Con `digits` decimales (por defecto ninguno; menos de 1 % muestra un decimal). */
export function fmtPct(ratio: number | null | undefined, digits?: number): string {
  if (ratio == null || !Number.isFinite(ratio)) return NONE;
  const pct = ratio * 100;
  const d = digits ?? (pct !== 0 && Math.abs(pct) < 1 ? 1 : 0);
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(pct)} %`;
}

/** Proporción segura (sin dividir entre cero). */
export const ratio = (part: number, whole: number): number => (whole > 0 ? part / whole : 0);

/**
 * Cambio de un periodo al anterior, como proporción (0.25 = +25 %).
 * null cuando antes era 0 y ahora no (no hay contra qué comparar: «nuevo»).
 */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

/** «+25 %», «−10 %», «igual», «nuevo». */
export function fmtDelta(change: number | null): string {
  if (change == null) return 'nuevo';
  if (Math.abs(change) < 0.005) return 'igual';
  const pct = Math.round(Math.abs(change) * 100);
  return `${change > 0 ? '+' : '−'}${nf.format(pct)} %`;
}

/** Dirección del cambio (para el color y la flecha). */
export function deltaDirection(change: number | null): 'up' | 'down' | 'flat' {
  if (change == null) return 'up';
  if (Math.abs(change) < 0.005) return 'flat';
  return change > 0 ? 'up' : 'down';
}

const toMs = (v: string | number | Date): number => (v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v));

/** «hace 5 minutos», «ayer», «hace 3 meses». null → «nunca». */
export function relativeTime(when: string | number | Date | null | undefined, now: number = Date.now()): string {
  if (when == null || when === '') return 'nunca';
  const t = toMs(when);
  if (!Number.isFinite(t)) return NONE;
  const s = Math.round((t - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return 'ahora mismo';
  if (abs < 45 * 60) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 22 * 3600) return rtf.format(Math.round(s / 3600), 'hour');
  // Por días calendario sería más exacto, pero para una consola basta con 24 h.
  const days = Math.round(s / 86_400);
  if (Math.abs(days) < 30) return rtf.format(days, 'day');
  const months = Math.round(s / (30 * 86_400));
  if (Math.abs(months) < 12) return rtf.format(months, 'month');
  return rtf.format(Math.round(s / (365 * 86_400)), 'year');
}

const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const dateFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' });
const dayFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const dayYearFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });

/** «27 sept 2026, 3:04 p. m.». */
export function fmtDateTime(when: string | number | Date | null | undefined): string {
  if (when == null || when === '') return NONE;
  const t = toMs(when);
  return Number.isFinite(t) ? dateTimeFmt.format(t) : NONE;
}

/** «27 sept 2026». */
export function fmtDate(when: string | number | Date | null | undefined): string {
  if (when == null || when === '') return NONE;
  const t = toMs(when);
  return Number.isFinite(t) ? dateFmt.format(t) : NONE;
}

/** 'YYYY-MM-DD' → fecha local a mediodía (así la zona horaria no la mueve de día). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

/** 'YYYY-MM-DD' → «27 sept» (o con el año si `withYear`). */
export function fmtDay(day: string, withYear = false): string {
  const d = parseDay(day);
  return Number.isFinite(d.getTime()) ? (withYear ? dayYearFmt : dayFmt).format(d) : day;
}

/** «1 cuenta» / «3 cuentas». */
export const plural = (n: number, one: string, many: string) => `${fmtNum(n)} ${n === 1 ? one : many}`;
