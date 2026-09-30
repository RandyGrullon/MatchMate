import { useEffect, useRef, useState } from 'react';

export interface ChartPoint {
  score: number;
  /** Texto del tooltip: evento y juego. */
  label: string;
}

/** Ancho con que se dibuja antes de medir la tarjeta (la de un teléfono de 375 px). */
export const CHART_DEFAULT_WIDTH = 330;
const H = 200;
const PAD = { top: 18, right: 16, bottom: 22, left: 34 };
/** Espacio de abajo cuando hay etiquetas debajo de los puntos (los meses). */
const PAD_BOTTOM_LABELS = 36;
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
  const gap = (width - PAD.left - PAD.right) / (points - 1);
  return Math.max(1, Math.ceil(LABEL_GAP / gap));
}

/**
 * Línea de los últimos juegos verificados con el promedio como referencia. `trend` (alineada con los puntos) dibuja
 * encima la media móvil; `unit` dice qué es cada punto en el tooltip («pinos» o «de promedio»), `name` qué muestra la
 * gráfica para el lector de pantalla y `xLabels` (alineadas con los puntos) lo que va debajo de cada uno (p. ej. el
 * mes; la del último punto siempre). Se dibuja al ancho de la tarjeta: el texto se lee de 11 px en el teléfono y en la
 * computadora.
 */
export function ScoreChart({
  points,
  average,
  trend,
  unit = 'pinos',
  name,
  xLabels,
}: {
  points: ChartPoint[];
  average: number | null;
  trend?: readonly number[];
  unit?: string;
  name?: string;
  xLabels?: readonly string[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [W, setW] = useState(CHART_DEFAULT_WIDTH);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setW(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (points.length < 2) return null;

  const scores = points.map((p) => p.score);
  const line = trend && trend.length === points.length ? trend : null;
  const labels = xLabels && xLabels.length === points.length ? xLabels : null;
  const bottom = labels ? PAD_BOTTOM_LABELS : PAD.bottom;
  const { lo, hi } = chartRange(scores, line, average);
  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / (points.length - 1);
  const y = (v: number) => PAD.top + ((hi - v) * (H - PAD.top - bottom)) / (hi - lo);
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 50) ticks.push(t);
  const step = labelStep(points.length, W);

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${y(lo)} L${x(0).toFixed(1)},${y(lo)} Z`;
  const trendPath = line?.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const bestIdx = scores.lastIndexOf(Math.max(...scores));
  const lastIdx = points.length - 1;

  function onMove(clientX: number) {
    const rect = svg.current!.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  const h = hover != null ? points[hover] : null;
  const tipLeft = hover != null ? (x(hover) / W) * 100 : 0;

  return (
    <div ref={box} className="relative">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={`${name ?? `Últimos ${points.length} juegos`}: de ${Math.min(...scores)} a ${Math.max(...scores)} ${unit}`}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t)} dy="0.35em" textAnchor="end" fontSize={11} fill="var(--muted)" className="tabular-nums">
              {t}
            </text>
          </g>
        ))}
        {labels?.map((l, i) =>
          (lastIdx - i) % step === 0 ? (
            <text key={i} x={x(i)} y={H - 12} textAnchor="middle" fontSize={11} fill="var(--muted)" data-x-label="">
              {l}
            </text>
          ) : null,
        )}
        {average != null && average > lo && average < hi && (
          <line x1={PAD.left} x2={W - PAD.right} y1={y(average)} y2={y(average)} stroke="var(--muted)" strokeWidth={1} />
        )}
        <path d={area} fill="var(--accent)" opacity={0.1} />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={line ? 1.5 : 2} strokeLinejoin="round" strokeLinecap="round" />
        {trendPath && <path d={trendPath} fill="none" stroke="var(--fg)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" data-serie="media" />}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - bottom} stroke="var(--muted)" strokeWidth={1} />}
        {[bestIdx, lastIdx, ...(hover != null ? [hover] : [])].map((i, k) => (
          <circle key={`${i}-${k}`} cx={x(i)} cy={y(points[i].score)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        ))}
        <text x={x(bestIdx)} y={y(points[bestIdx].score) - 10} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--fg)">
          {points[bestIdx].score}
        </text>
        {lastIdx !== bestIdx && (
          <text x={x(lastIdx) - 8} y={y(points[lastIdx].score) - 10} textAnchor="end" fontSize={11} fill="var(--fg)">
            {points[lastIdx].score}
          </text>
        )}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `clamp(4.5rem, ${tipLeft}%, calc(100% - 4.5rem))` }}
        >
          <div className="text-sm font-semibold tabular-nums">
            {h.score} {unit}
          </div>
          {line && hover != null && <div className="text-muted tabular-nums">Media {line[hover].toLocaleString('es-DO')}</div>}
          <div className="whitespace-nowrap text-muted">{h.label}</div>
        </div>
      )}
    </div>
  );
}
