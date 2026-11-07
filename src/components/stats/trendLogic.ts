import { CONVERT_CUTS, LEFT_CUTS, heatLevel, type PinReport, type Tally } from '../../lib/bowlingStats';
import { parseDate } from '../../lib/format';

/**
 * La tendencia y el análisis por cuadros de la página del jugador sin dibujar (los dibujan TrendSection.tsx, ScoreChart.tsx,
 * FrameStatsPanel.tsx y PinHeatDeck.tsx en la web, y la app del teléfono con react-native-svg): cuántos juegos se ven,
 * el eje y las etiquetas de la gráfica, los pinos del mapa de calor y su leyenda.
 */

// ---------- La tendencia (TrendSection) ----------

/** Juegos que se ven en la gráfica y de cuántos es la media móvil. */
export const TREND_LAST = 30;
export const TREND_WINDOW = 5;
/** Meses que se ven en «Por mes». */
export const MONTHS_SHOWN = 12;

/** «septiembre de 2026» (el mes de un punto de «Por mes»). */
export const monthName = (month: string) => parseDate(`${month}-01`).toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Lo que va debajo de cada mes en la gráfica: «sep»; enero (o el primero, si los meses son de dos años) con el año
 * corto, «ene 26», para saber de qué año es cada uno.
 */
export function monthLabels(months: readonly string[]): string[] {
  const years = new Set(months.map((m) => m.slice(0, 4)));
  return months.map((m, i) => {
    const short = MONTHS_SHORT[Number(m.slice(5, 7)) - 1] ?? m;
    return years.size > 1 && (i === 0 || m.endsWith('-01')) ? `${short} ${m.slice(2, 4)}` : short;
  });
}

// ---------- La gráfica (ScoreChart) ----------

/** Ancho con que se dibuja antes de medir la tarjeta (la de un teléfono de 375 px). */
export const CHART_DEFAULT_WIDTH = 330;
export const CHART_H = 200;
export const CHART_PAD = { top: 18, right: 16, bottom: 22, left: 34 } as const;
/** Espacio de abajo cuando hay etiquetas debajo de los puntos (los meses). */
export const CHART_PAD_BOTTOM_LABELS = 36;
/** Lo mínimo entre dos etiquetas de abajo (px): si no caben todas, va una cada dos, tres... */
const LABEL_GAP = 36;

/**
 * El rango del eje: todo lo que se dibuja (los puntos, la media móvil y el promedio) cabe dentro, redondeado a 50 y
 * entre 0 y 300.
 */
export function chartRange(scores: readonly number[], trend: readonly number[] | null, average: number | null): { lo: number; hi: number } {
  const all = [...scores, ...(trend ?? []), ...(average != null ? [average] : [])];
  const lo = Math.max(0, Math.floor((Math.min(...all) - 20) / 50) * 50);
  const hi = Math.min(300, Math.ceil((Math.max(...all) + 20) / 50) * 50);
  return { lo, hi: Math.max(hi, lo + 50) };
}

/** Cada cuántos puntos va una etiqueta abajo en ese ancho para que no se pisen (1 = todas). */
export function labelStep(points: number, width: number): number {
  if (points < 2) return 1;
  const gap = (width - CHART_PAD.left - CHART_PAD.right) / (points - 1);
  return Math.max(1, Math.ceil(LABEL_GAP / gap));
}

// ---------- El análisis por cuadros (FrameStatsPanel y PinHeatDeck) ----------

/** Lo que te quedó que se ve de una vez en la tabla (el resto con «Ver todos»). */
export const LEAVES_SHOWN = 8;

export type PinView = 'quedan' | 'spare';

export const pct = (v: number | null) => (v == null ? '—' : `${v}%`);
export const ofText = (t: Pick<Tally, 'converted' | 'faced'>) => `${t.converted} de ${t.faced}`;

export interface HeatPin {
  /** 1 a 10. */
  pin: number;
  /** Lo que se escribe en el pino («35%»); null = sin datos. */
  value: string | null;
  /** 0 a 4. */
  level: number;
  /** Lo que dice el lector de pantalla («Pino 7: se queda parado 35%, 14 de 40»). */
  label: string;
}

/** Los pinos del mapa según lo que se mira: cuánto se queda parado cada uno, o cuánto spare se hace cuando queda. */
export function heatPins(report: PinReport, view: PinView): HeatPin[] {
  return report.pins.map((p) =>
    view === 'quedan'
      ? {
          pin: p.pin,
          value: p.leftPct == null ? null : `${p.leftPct}%`,
          level: heatLevel(p.leftPct, LEFT_CUTS),
          label: p.leftPct == null ? `Pino ${p.pin}: sin datos` : `Pino ${p.pin}: se queda parado el ${p.leftPct}% (${p.left} de ${report.racks})`,
        }
      : {
          pin: p.pin,
          value: p.convertedPct == null ? null : `${p.convertedPct}%`,
          level: heatLevel(p.convertedPct, CONVERT_CUTS),
          label:
            p.convertedPct == null
              ? `Pino ${p.pin}: todavía no le ha quedado para el spare`
              : `Pino ${p.pin}: spare el ${p.convertedPct}% de las veces que queda (${p.converted} de ${p.inLeave})`,
        },
  );
}

/** Cuánto color lleva cada nivel (0 a 4): un solo tono, de claro a oscuro, mezclado con la superficie. */
export const HEAT_MIX = [10, 28, 46, 80, 92] as const;

/** El nivel de calor (0 a 4) de un número cualquiera. Los dos últimos llevan el texto sobre el acento. */
export const heatIndex = (level: number) => Math.max(0, Math.min(HEAT_MIX.length - 1, Math.round(level)));

/** La leyenda del mapa: los 5 niveles con sus cortes («<5%», «5–15%»…). */
export function heatLegendLabels(cuts: readonly [number, number, number, number]): string[] {
  return [`<${cuts[0]}%`, `${cuts[0]}–${cuts[1]}%`, `${cuts[1]}–${cuts[2]}%`, `${cuts[2]}–${cuts[3]}%`, `${cuts[3]}%+`];
}
