import { useRef, useState } from 'react';

export interface ChartPoint {
  score: number;
  /** Texto del tooltip: evento y juego. */
  label: string;
}

const W = 640;
const H = 220;
const PAD = { top: 18, right: 16, bottom: 22, left: 34 };

/** Línea de los últimos juegos verificados con el promedio como referencia. */
export function ScoreChart({ points, average }: { points: ChartPoint[]; average: number | null }) {
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;

  const scores = points.map((p) => p.score);
  const lo = Math.max(0, Math.floor((Math.min(...scores, average ?? 300) - 20) / 50) * 50);
  const hi = Math.min(300, Math.ceil((Math.max(...scores, average ?? 0) + 20) / 50) * 50);
  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / (points.length - 1);
  const y = (v: number) => PAD.top + ((hi - v) * (H - PAD.top - PAD.bottom)) / (hi - lo || 1);
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 50) ticks.push(t);

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${y(lo)} L${x(0).toFixed(1)},${y(lo)} Z`;
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
    <div className="relative">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={`Últimos ${points.length} juegos: de ${Math.min(...scores)} a ${Math.max(...scores)} pinos`}
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
        {average != null && average > lo && average < hi && (
          <line x1={PAD.left} x2={W - PAD.right} y1={y(average)} y2={y(average)} stroke="var(--muted)" strokeWidth={1} />
        )}
        <path d={area} fill="var(--accent)" opacity={0.1} />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--muted)" strokeWidth={1} />}
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
          <div className="text-sm font-semibold tabular-nums">{h.score} pinos</div>
          <div className="whitespace-nowrap text-muted">{h.label}</div>
        </div>
      )}
    </div>
  );
}
