import { monthlyAverages, type FrameRates, type PinReport, type StatGame } from '../../lib/bowlingStats';
import { parseDate } from '../../lib/format';
import { TREND_LAST } from './trendLogic';
import { MONTHS_LONG } from './yoTrend';

/**
 * Lo de Pro de Yo y de Juegos sueltos sin dibujar (lo dibujan YoStats.tsx en la web y la app del teléfono con
 * react-native-svg): los puntos y el lugar de cada cosa en la gráfica «Tendencia», y de «Tus tiros» la barra de strikes,
 * spares y abiertos y el pino que más se queda parado.
 */

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// ---------- Tendencia (Pro) ----------

/** «Hoy», «Ayer» o «6 oct» (el día de un grupo de juegos en la gráfica). */
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Hoy';
  const d = parseDate(date);
  const t = parseDate(today);
  if (Math.round((t.getTime() - d.getTime()) / 86_400_000) === 1) return 'Ayer';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** El mes de un 'YYYY-MM' para debajo de la gráfica: «sep», o «ene 26» si los meses son de dos años. */
const monthShort = (month: string, withYear: boolean) => {
  const m = MONTHS_SHORT[Number(month.slice(5, 7)) - 1] ?? month;
  return withYear ? `${m} ${month.slice(2, 4)}` : m;
};

/** Un punto de la gráfica: el número, su grupo (el día o el mes) y lo que dice al tocarlo. */
export interface TrendPoint {
  score: number;
  group: string;
  label: string;
  tip: string;
}

/** Los puntos «Por juego»: los últimos juegos, en grupos por día («29 sep», «6 oct», «Hoy»). */
export function gamePoints(games: readonly Pick<StatGame, 'date' | 'score' | 'label'>[], today: string, last = TREND_LAST): TrendPoint[] {
  return games.slice(-last).map((g) => ({ score: g.score, group: g.date, label: dayLabel(g.date, today), tip: g.label ?? dayLabel(g.date, today) }));
}

/** Los puntos «Por mes»: el promedio de cada mes (los últimos 12). */
export function monthPoints(games: readonly Pick<StatGame, 'date' | 'score'>[]): TrendPoint[] {
  const months = monthlyAverages(games).slice(-12);
  const years = new Set(months.map((m) => m.month.slice(0, 4)));
  return months.map((m, i) => ({
    score: m.average,
    group: m.month,
    label: monthShort(m.month, years.size > 1 && (i === 0 || m.month.endsWith('-01'))),
    tip: `${MONTHS_LONG[Number(m.month.slice(5, 7)) - 1]} ${m.month.slice(0, 4)} · ${m.games} ${m.games === 1 ? 'juego' : 'juegos'} · mejor ${m.high}`,
  }));
}

/**
 * El eje: el promedio en el medio y la misma distancia arriba y abajo (de 5 en 5, 25 como mínimo), con aire para que
 * el punto más alejado no quede pegado a la línea.
 */
export function trendScale(scores: readonly number[], average: number | null): { mid: number; half: number } {
  const mid = average ?? Math.floor(scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length));
  const dev = Math.max(0, ...scores.map((s) => Math.abs(s - mid)));
  return { mid, half: Math.max(25, Math.ceil((dev + 4) / 5) * 5) };
}

export const TREND_PLOT_TOP = 10;
export const TREND_PLOT_BOTTOM = 114;
export const TREND_CHART_H = 146;
export const TREND_FIRST_X = 38;
/** Lo mínimo entre dos fechas de abajo (px). */
const LABEL_GAP = 46;

/** Dónde va cada cosa de la gráfica a ese ancho (sin dibujar: sirve para probarla). */
export function trendLayout(points: readonly TrendPoint[], average: number | null, width: number) {
  const { mid, half } = trendScale(
    points.map((p) => p.score),
    average,
  );
  const lastX = width - 8;
  const x = (i: number) => (points.length < 2 ? (TREND_FIRST_X + lastX) / 2 : TREND_FIRST_X + (i * (lastX - TREND_FIRST_X)) / (points.length - 1));
  const y = (v: number) => TREND_PLOT_TOP + ((mid + half - v) * (TREND_PLOT_BOTTOM - TREND_PLOT_TOP)) / (2 * half);
  // Los grupos (días o meses): su nombre debajo, al centro de sus puntos, y una línea punteada entre uno y otro.
  const groups: { label: string; x: number; from: number; to: number }[] = [];
  points.forEach((p, i) => {
    const g = groups[groups.length - 1];
    if (g && points[g.from].group === p.group) g.to = i;
    else groups.push({ label: p.label, x: 0, from: i, to: i });
  });
  groups.forEach((g) => (g.x = (x(g.from) + x(g.to)) / 2));
  const separators = groups.slice(1).map((g) => (x(g.from - 1) + x(g.from)) / 2);
  // De la última hacia atrás: la de hoy siempre; las que se pisan con la de su derecha, no.
  const labels: { label: string; x: number }[] = [];
  for (let k = groups.length - 1; k >= 0; k--) {
    const g = groups[k];
    const right = labels[0];
    if (right && right.x - g.x < LABEL_GAP) continue;
    labels.unshift({ label: g.label, x: Math.min(Math.max(g.x, TREND_FIRST_X + 4), width - 16) });
  }
  const scores = points.map((p) => p.score);
  const best = scores.lastIndexOf(Math.max(...scores));
  const last = points.length - 1;
  return { mid, half, x, y, separators, labels, best, last, ticks: [mid + half, mid, mid - half] as const };
}

/** El ancho de la gráfica antes de medir la tarjeta (la de un teléfono de 390 px). */
export const TREND_DEFAULT_WIDTH = 302;

/** El punto de la gráfica que queda bajo el dedo (o el ratón) en `px` del ancho `width`. */
export function trendIndexAt(px: number, width: number, points: number): number {
  const i = Math.round(((px - TREND_FIRST_X) / (width - 8 - TREND_FIRST_X)) * (points - 1));
  return Math.max(0, Math.min(points - 1, i));
}

// ---------- Tus tiros (Pro) ----------

/**
 * De cada 100 cuadros, cuántos fueron strike, spare y abiertos (suman 100: es la barra). El cuadro 10 cuenta por cómo
 * empezó, como los demás.
 */
export function frameShares(rates: Pick<FrameRates, 'frames' | 'spares' | 'opens'>): { strikes: number; spares: number; opens: number } | null {
  if (!rates.frames) return null;
  const strikeFrames = Math.max(0, rates.frames - rates.spares - rates.opens);
  const strikes = Math.round((strikeFrames * 100) / rates.frames);
  const opens = Math.round((rates.opens * 100) / rates.frames);
  return { strikes, spares: Math.max(0, 100 - strikes - opens), opens };
}

/** «El 10 se te queda 7 veces y lo conviertes el 43%.»: el pino que más se queda parado (null sin pinos anotados). */
export function pinLine(report: PinReport): { pin: number; left: number; converted: number | null } | null {
  if (!report.racks) return null;
  const top = [...report.pins].sort((a, b) => b.left - a.left || b.pin - a.pin)[0];
  if (!top || !top.left) return null;
  return { pin: top.pin, left: top.left, converted: top.convertedPct };
}
