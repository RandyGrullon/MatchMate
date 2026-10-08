/**
 * Gráficas chicas de la consola, en SVG a mano (sin paquetes): línea con área y cruz al pasar el dedo o
 * el mouse (también con las flechas del teclado), barras horizontales, minigráfica y medidor.
 * Una sola serie por gráfica, en el color de acento; el texto siempre en colores de texto.
 */
import { useId, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { cx } from '../../components/ui';
import { areaPath, fraction, linePath, meterTone, nearestIndex, toPoints, xLabelIndexes, yTicks } from './chart';
import { fmtCompact, fmtNum } from './format';

export interface ChartPoint {
  key: string;
  /** Etiqueta del eje X (p. ej. «27 sept»). */
  label: string;
  /** Etiqueta larga para el cuadrito (p. ej. «27 sept 2026»). */
  longLabel?: string;
  value: number;
}

/** Línea con área, eje Y con números redondos y un cuadrito con el valor del día que se señala. */
export function LineChart({
  points,
  seriesName,
  height = 220,
  format = fmtNum,
  dim,
  className,
}: {
  points: readonly ChartPoint[];
  seriesName: string;
  height?: number;
  format?: (v: number) => string;
  /** Se está actualizando: se ve lo de antes, más clarito. */
  dim?: boolean;
  className?: string;
}) {
  const [idx, setIdx] = useState<number | null>(null);
  const liveId = useId();
  const n = points.length;
  const values = points.map((p) => p.value);
  const max = values.reduce((m, v) => Math.max(m, v), 0);
  const ticks = yTicks(max);
  const top = ticks[ticks.length - 1];
  const pts = toPoints(values, top);
  const total = values.reduce((a, v) => a + v, 0);
  const active = idx != null && idx < n ? idx : null;
  const shown = active ?? (n ? n - 1 : null);

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width > 0) setIdx(nearestIndex((e.clientX - r.left) / r.width, n));
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!n) return;
    const cur = active ?? n - 1;
    const next =
      e.key === 'ArrowLeft' ? cur - 1 : e.key === 'ArrowRight' ? cur + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : e.key === 'PageUp' ? cur - 7 : e.key === 'PageDown' ? cur + 7 : null;
    if (next == null) return;
    e.preventDefault();
    setIdx(Math.max(0, Math.min(n - 1, next)));
  };

  const tipX = active != null ? pts[active].x : 0;
  const tipShift = tipX < 18 ? '0%' : tipX > 82 ? '-100%' : '-50%';
  const labels = xLabelIndexes(n, 5);

  return (
    <figure className={cx('m-0 flex flex-col gap-1 transition-opacity', dim && 'opacity-60', className)}>
      <figcaption className="sr-only">
        {seriesName}: {n} días, total {fmtNum(total)}. Usa las flechas para recorrer los días.
      </figcaption>
      <div className="flex">
        {/* Eje Y: números redondos, en el color de texto apagado. */}
        <div className="relative w-10 shrink-0 text-right text-[11px] text-muted tabular-nums" style={{ height }} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-2 -translate-y-1/2 leading-none" style={{ top: `${100 - (t / top) * 100}%` }}>
              {fmtCompact(t)}
            </span>
          ))}
        </div>
        <div
          className="relative min-w-0 flex-1 cursor-crosshair touch-pan-y rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          style={{ height }}
          tabIndex={n ? 0 : -1}
          role="group"
          aria-roledescription="gráfica"
          aria-label={seriesName}
          aria-describedby={liveId}
          onPointerMove={move}
          onPointerDown={move}
          // Con el dedo el cuadrito se queda hasta tocar afuera (blur); con el mouse se va al salir.
          onPointerLeave={(e) => e.pointerType === 'mouse' && setIdx(null)}
          onFocus={() => setIdx((i) => i ?? (n ? n - 1 : null))}
          onBlur={() => setIdx(null)}
          onKeyDown={key}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
            {ticks.map((t) => {
              const y = 100 - (t / top) * 100;
              return <line key={t} x1={0} x2={100} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
            })}
            {n > 1 && <path d={areaPath(pts)} fill="var(--accent)" fillOpacity={0.1} />}
            {n > 1 && (
              <path
                d={linePath(pts)}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {active != null && (
            <div className="pointer-events-none absolute inset-y-0 w-px bg-muted/50" style={{ left: `${tipX}%` }} aria-hidden="true" />
          )}
          {shown != null && (
            <span
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
              style={{ left: `${pts[shown].x}%`, top: `${pts[shown].y}%` }}
              aria-hidden="true"
            />
          )}
          {active != null && (
            <div
              className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
              style={{ left: `${tipX}%`, transform: `translate(${tipShift}, calc(-100% - 6px))` }}
              aria-hidden="true"
            >
              <div className="text-sm font-semibold tabular-nums">{format(points[active].value)}</div>
              <div className="flex items-center gap-1.5 text-muted">
                <span className="inline-block h-0.5 w-3 rounded bg-accent" />
                {seriesName} · {points[active].longLabel ?? points[active].label}
              </div>
            </div>
          )}
          <span id={liveId} className="sr-only" aria-live="polite">
            {active != null ? `${points[active].longLabel ?? points[active].label}: ${format(points[active].value)}` : ''}
          </span>
        </div>
      </div>
      <div className="relative ml-10 h-4 text-[11px] text-muted" aria-hidden="true">
        {labels.map((i) => {
          const x = pts[i]?.x ?? 0;
          const shift = i === 0 ? '0%' : i === n - 1 ? '-100%' : '-50%';
          return (
            <span key={points[i].key} className="absolute top-0 whitespace-nowrap" style={{ left: `${x}%`, transform: `translateX(${shift})` }}>
              {points[i].label}
            </span>
          );
        })}
      </div>
    </figure>
  );
}

/** Tabla con los mismos datos de una gráfica (para leerlos sin pasar el mouse). */
export function ChartTable({ points, seriesName, format = fmtNum }: { points: readonly ChartPoint[]; seriesName: string; format?: (v: number) => string }) {
  return (
    <div className="max-h-72 overflow-y-auto rounded-2xl bg-surface-2/60">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-2 text-left text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Día
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {seriesName}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {[...points].reverse().map((p) => (
            <tr key={p.key}>
              <td className="px-3 py-1.5">{p.longLabel ?? p.label}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface BarItem {
  key: string;
  label: ReactNode;
  /** Texto del nombre para lectores de pantalla y el título al pasar el mouse. */
  name: string;
  value: number;
  /** Algo más a la derecha (p. ej. «12 activas»). */
  extra?: string;
}

/** Barras horizontales con el valor en la punta. */
export function BarList({ items, format = fmtNum, unit }: { items: readonly BarItem[]; format?: (v: number) => string; unit?: string }) {
  const max = items.reduce((m, it) => Math.max(m, it.value), 0);
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it) => {
        const f = fraction(it.value, max);
        return (
          <li key={it.key} className="grid grid-cols-[minmax(0,8.5rem)_1fr_auto] items-center gap-3 text-sm" title={`${it.name}: ${format(it.value)}${unit ? ` ${unit}` : ''}`}>
            <span className="flex min-w-0 items-center gap-1.5 truncate">{it.label}</span>
            <span className="relative h-2.5 rounded-r bg-surface-2" aria-hidden="true">
              <span
                className="absolute inset-y-0 left-0 rounded-r bg-accent"
                style={{ width: it.value > 0 ? `max(${(f * 100).toFixed(2)}%, 3px)` : 0 }}
              />
            </span>
            <span className="text-right tabular-nums">
              <span className="font-medium">{format(it.value)}</span>
              <span className="sr-only">{unit ? ` ${unit}` : ''}</span>
              {it.extra && <span className="ml-1.5 text-xs text-muted">{it.extra}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Minigráfica de tendencia (en tarjetas): trazo apagado y el último punto en acento. */
export function Sparkline({ values, className }: { values: readonly number[]; className?: string }) {
  if (values.length < 2) return null;
  const max = values.reduce((m, v) => Math.max(m, v), 0);
  const pts = toPoints(values, max > 0 ? max : 1).map((p) => ({ x: p.x, y: 4 + p.y * 0.92 }));
  const last = pts[pts.length - 1];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={cx('h-8 w-24 overflow-visible', className)} aria-hidden="true">
      <path d={linePath(pts)} fill="none" stroke="var(--muted)" strokeOpacity={0.6} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <line x1={last.x} x2={last.x} y1={last.y} y2={last.y} stroke="var(--accent)" strokeWidth={6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const METER_FILL = { accent: 'bg-accent', warn: 'bg-warn', danger: 'bg-danger' } as const;
const METER_TRACK = { accent: 'bg-accent-soft', warn: 'bg-warn-soft', danger: 'bg-danger-soft' } as const;

/** Medidor (cuánto se usó de un tope). El color sube a aviso al 80 % y a peligro al 95 %. */
export function Meter({ value, max, label, valueText, className }: { value: number; max: number; label: string; valueText?: string; className?: string }) {
  const f = fraction(value, max);
  const tone = meterTone(max > 0 ? value / max : 0);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={valueText ?? `${fmtNum(value)} de ${fmtNum(max)}`}
      className={cx('h-2.5 overflow-hidden rounded-full', METER_TRACK[tone], className)}
    >
      <div className={cx('h-full rounded-full transition-[width] duration-500', METER_FILL[tone])} style={{ width: `${(f * 100).toFixed(2)}%` }} />
    </div>
  );
}
