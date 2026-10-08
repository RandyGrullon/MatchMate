import { useRef, type ReactNode } from 'react';
import { cx } from '../components/ui';
import { tap } from './device';

export interface HalfProps {
  /** Nombre del lado («Ana / Luis», «Tigres»). */
  label: ReactNode;
  /** Número grande (juegos, puntos, goles). */
  big?: ReactNode;
  /** Línea chica debajo (15/30/40, «saca», faltas…). */
  sub?: ReactNode;
  onTap: () => void;
  /** Texto para lectores de pantalla («Punto para Ana / Luis»). */
  ariaLabel?: string;
  disabled?: boolean;
  /** Color propio del lado (p. ej. el del equipo); si no, el del modo cancha. */
  color?: { bg: string; fg: string };
}

/** Un toque cuenta una vez: dos toques en menos de esto son uno (dedo que rebota). */
const GUARD_MS = 280;

/**
 * Dos mitades gigantes, una por lado: se toca el lado que ganó el punto (o que hizo el gol). `swap` pone el lado
 * 2 a la izquierda (cambio de lado en la cancha). Funcionan con el pulgar, en vertical y en horizontal. El lado 1 va en
 * el color del deporte y el 2 en tinta (device.ts, courtVars), con el número grande en el centro.
 */
export function TwoHalves({ a, b, swap, disabled, className }: { a: HalfProps; b: HalfProps; swap?: boolean; disabled?: boolean; className?: string }) {
  const [left, right] = swap ? [b, a] : [a, b];
  const [leftVar, rightVar] = swap ? (['b', 'a'] as const) : (['a', 'b'] as const);
  return (
    <div className={cx('grid h-full min-h-0 grid-cols-2 gap-2', className)}>
      <Half {...left} which={leftVar} disabled={disabled || left.disabled} />
      <Half {...right} which={rightVar} disabled={disabled || right.disabled} />
    </div>
  );
}

function Half({ label, big, sub, onTap, ariaLabel, disabled, color, which }: HalfProps & { which: 'a' | 'b' }) {
  const last = useRef(0);
  const style = color ? { background: color.bg, color: color.fg } : { background: `var(--court-${which})`, color: `var(--court-${which}-fg)` };
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={() => {
        const now = Date.now();
        if (now - last.current < GUARD_MS) return;
        last.current = now;
        tap();
        onTap();
      }}
      style={{ ...style, touchAction: 'manipulation' }}
      className={cx(
        'flex min-h-32 flex-col items-center justify-center gap-2 rounded-[28px] px-3 py-4 text-center transition select-none',
        'active:scale-[0.98] active:brightness-90 disabled:opacity-40',
        'focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fg',
      )}
    >
      <span className="line-clamp-2 text-lg leading-tight font-semibold tracking-[-0.01em] sm:text-xl">{label}</span>
      {big !== undefined && <span className="num text-[76px] leading-none font-bold sm:text-[96px]">{big}</span>}
      {sub !== undefined && <span className="min-h-6 text-base font-semibold opacity-90">{sub}</span>}
    </button>
  );
}
