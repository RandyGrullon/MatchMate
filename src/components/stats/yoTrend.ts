import type { StatGame } from '../../lib/bowlingStats';

/**
 * La tarjeta «Tu promedio» de Yo › Lite sin dibujar (la dibujan YoStats.tsx en la web y la app del teléfono): cómo vas
 * este mes («+9 en octubre»), la gráfica corta de los últimos juegos y el mes anterior contra este.
 */

export const MONTHS_LONG = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Un número con un decimal a lo más («198.2», «189»), hacia abajo como los promedios del boliche. */
export const oneDecimal = (n: number): string => String(Math.floor(n * 10 + 1e-9) / 10);

/** Abajo de la tendencia: el mes anterior y este, con la diferencia («Septiembre 189 · Octubre 198.2 · +9.2»). */
export interface MonthCompare {
  prev: { name: string; average: string } | null;
  last: { name: string; average: string; games: number };
  /** La diferencia con un decimal (null sin mes anterior). */
  delta: number | null;
}

export function monthCompare(games: readonly Pick<StatGame, 'date' | 'score'>[]): MonthCompare | null {
  const by = new Map<string, { pins: number; games: number }>();
  for (const g of games) {
    const m = g.date.slice(0, 7);
    const v = by.get(m) ?? { pins: 0, games: 0 };
    v.pins += g.score;
    v.games++;
    by.set(m, v);
  }
  const months = [...by.keys()].sort();
  if (!months.length) return null;
  const lastKey = months[months.length - 1];
  const prevKey = months.length > 1 ? months[months.length - 2] : null;
  const avg = (k: string) => by.get(k)!.pins / by.get(k)!.games;
  const name = (k: string) => {
    const n = MONTHS_LONG[Number(k.slice(5, 7)) - 1] ?? k;
    return k.slice(0, 4) === lastKey.slice(0, 4) ? n : `${n} ${k.slice(0, 4)}`;
  };
  const lastAvg = Math.floor(avg(lastKey) * 10 + 1e-9) / 10;
  const prevAvg = prevKey ? Math.floor(avg(prevKey) * 10 + 1e-9) / 10 : null;
  return {
    prev: prevKey ? { name: name(prevKey), average: oneDecimal(avg(prevKey)) } : null,
    last: { name: name(lastKey), average: oneDecimal(avg(lastKey)), games: by.get(lastKey)!.games },
    delta: prevAvg == null ? null : Math.round((lastAvg - prevAvg) * 10) / 10,
  };
}

/**
 * Cómo va (Lite): «+9 en octubre», «−4 en octubre» o «Parejo en octubre». Es la misma cuenta que la «Tendencia» de
 * Pro (monthCompare: el promedio de este mes contra el del anterior, «Septiembre 189 · Octubre 198.2 · +9.2»), en
 * números enteros. Sin mes anterior con juegos, nada.
 */
export interface TrendBadge {
  dir: 'up' | 'down' | 'flat';
  text: string;
  /** La frase entera, para el lector de pantalla y el `title`. */
  full: string;
}

export function trendBadge(games: readonly Pick<StatGame, 'date' | 'score'>[]): TrendBadge | null {
  const cmp = monthCompare(games);
  if (!cmp?.prev || cmp.delta == null) return null;
  const month = cmp.last.name.toLowerCase();
  const exact = cmp.delta > 0 ? `+${cmp.delta}` : cmp.delta < 0 ? `−${-cmp.delta}` : '0';
  const full = `Tu promedio en ${month}: ${cmp.last.average}; en ${cmp.prev.name.toLowerCase()}: ${cmp.prev.average} (${exact}).`;
  const r = Math.round(cmp.delta);
  if (r >= 1) return { dir: 'up', text: `+${r} en ${month}`, full };
  if (r <= -1) return { dir: 'down', text: `−${-r} en ${month}`, full };
  return { dir: 'flat', text: `Parejo en ${month}`, full };
}

/** Las líneas de la gráfica corta (132 × 76): la de los juegos, el área de abajo y dónde va el último punto. */
export function sparkline(scores: readonly number[], w = 132, h = 76): { line: string; area: string; last: { x: number; y: number } } | null {
  if (scores.length < 2) return null;
  const top = 8.4;
  const bottom = h - 14.4;
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  const x = (i: number) => 4 + (i * (w - 8)) / (scores.length - 1);
  const y = (v: number) => (hi === lo ? (top + bottom) / 2 : top + ((hi - v) * (bottom - top)) / (hi - lo));
  const pts = scores.map((s, i) => `${x(i).toFixed(1)} ${y(s).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  return { line, area: `${line} L${x(scores.length - 1).toFixed(1)} ${h} L4 ${h} Z`, last: { x: x(scores.length - 1), y: y(scores[scores.length - 1]) } };
}

/** Juegos que se ven en la gráfica corta. */
export const SPARK_GAMES = 8;
