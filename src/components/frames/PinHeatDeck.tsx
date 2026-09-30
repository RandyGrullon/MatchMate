import type { CSSProperties } from 'react';
import { cx } from '../ui';
import { PIN_ROWS } from './PinDeck';

/** Cuánto color lleva cada nivel (0 a 4): un solo tono, de claro a oscuro, mezclado con la superficie. */
const MIX = [10, 28, 46, 80, 92] as const;

/**
 * Color de un nivel del mapa de calor con los tokens del tema. Los tres primeros llevan el texto normal y los dos
 * últimos el texto sobre el acento: así se lee en claro y en oscuro (en el medio ninguno de los dos contrasta bien, por
 * eso el salto de 46 a 80).
 */
export function heatStyle(level: number): CSSProperties {
  const l = Math.max(0, Math.min(MIX.length - 1, Math.round(level)));
  return {
    background: `color-mix(in oklab, var(--accent) ${MIX[l]}%, var(--surface))`,
    color: l >= 3 ? 'var(--accent-fg)' : 'var(--fg)',
  };
}

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

/**
 * Los 10 pinos como mapa de calor (solo para ver, no se tocan): más color = más veces. Cada pino lleva su número y su
 * porcentaje; sin datos va punteado.
 */
export function PinHeatDeck({ pins, label }: { pins: readonly HeatPin[]; label: string }) {
  const byPin = new Map(pins.map((p) => [p.pin, p]));
  return (
    <div className="flex flex-col items-center gap-2 py-1" role="group" aria-label={label}>
      {PIN_ROWS.map((row) => (
        <div key={row[0]} className="flex gap-2.5">
          {row.map((pin) => {
            const p = byPin.get(pin);
            const empty = !p || p.value == null;
            return (
              <div
                key={pin}
                role="img"
                aria-label={p?.label ?? `Pino ${pin}: sin datos`}
                className={cx(
                  'flex size-12 flex-col items-center justify-center rounded-full border leading-none select-none',
                  empty ? 'border-dashed border-line text-muted' : (p.level ?? 0) >= 3 ? 'border-transparent' : 'border-line',
                )}
                style={empty ? undefined : heatStyle(p.level)}
              >
                <span className="text-[10px] font-medium">{pin}</span>
                <span className="mt-0.5 text-xs font-bold tabular-nums">{empty ? '—' : p.value}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** La leyenda del mapa: los 5 niveles con sus cortes («<5%», «5–15%»…). */
export function HeatLegend({ cuts, caption }: { cuts: readonly [number, number, number, number]; caption: string }) {
  const labels = [`<${cuts[0]}%`, `${cuts[0]}–${cuts[1]}%`, `${cuts[1]}–${cuts[2]}%`, `${cuts[2]}–${cuts[3]}%`, `${cuts[3]}%+`];
  return (
    <div className="flex flex-col items-center gap-1.5 text-[11px] text-muted">
      <span>{caption}</span>
      <div className="flex flex-wrap justify-center gap-x-2.5 gap-y-1">
        {labels.map((t, i) => (
          <span key={t} className="inline-flex items-center gap-1 tabular-nums">
            <span className={cx('inline-block size-3 rounded-full border', i >= 3 ? 'border-transparent' : 'border-line')} style={heatStyle(i)} />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
