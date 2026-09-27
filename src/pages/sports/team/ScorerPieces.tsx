import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { tap } from '../../../court';
import { cx } from '../../../components/ui';
import { textOn } from './logic';

/**
 * Piezas de la mesa anotadora de los deportes de equipo (baloncesto, fútbol, sala). La mesa de cada deporte las
 * arma dentro de CourtLayout (src/court): cabecera con el marcador grande, columnas por equipo, dorsales y
 * botones grandes. Un toque cuenta una vez (el dedo que rebota no suma dos veces).
 */

/** Vuelve a pintar cada `ms` mientras `active` (solo para mostrar relojes: el tiempo sale de marcas de tiempo). */
export function useTicker(active: boolean, ms = 250): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return n;
}

/** Un toque cuenta una vez: dos toques en menos de esto son uno. */
const GUARD_MS = 280;

function useGuardedTap(fn: () => void): () => void {
  const last = useRef(0);
  return () => {
    const now = Date.now();
    if (now - last.current < GUARD_MS) return;
    last.current = now;
    tap();
    fn();
  };
}

export interface HeaderSide {
  name: ReactNode;
  color: string;
  score: number;
  /** Línea chica: faltas, bonus, tiempos muertos. */
  sub?: ReactNode;
}

/** Cabecera de la mesa: los dos equipos con su color y el marcador grande; en el centro, periodo y reloj. */
export function ScoreHeader({ a, b, center }: { a: HeaderSide; b: HeaderSide; center?: ReactNode }) {
  const side = (s: HeaderSide, align: 'left' | 'right') => (
    <div className={cx('flex min-w-0 flex-1 flex-col gap-1', align === 'right' && 'items-end text-right')}>
      <span className="flex max-w-full items-center gap-1.5 truncate rounded-lg px-2 py-0.5 text-sm font-semibold" style={{ background: s.color, color: textOn(s.color) }}>
        <span className="truncate">{s.name}</span>
      </span>
      <span className="text-5xl font-black tabular-nums leading-none sm:text-6xl" aria-live="polite">
        {s.score}
      </span>
      {s.sub && <div className="flex flex-wrap items-center gap-1 text-xs text-muted">{s.sub}</div>}
    </div>
  );
  return (
    <div className="flex items-start gap-2">
      {side(a, 'left')}
      {center && <div className="flex shrink-0 flex-col items-center gap-1 px-1 text-center">{center}</div>}
      {side(b, 'right')}
    </div>
  );
}

/** Botón grande de la mesa (+1, +2, +3, Falta). */
export function BigButton({
  children,
  onTap,
  disabled,
  tone = 'default',
  className,
  ariaLabel,
  style,
}: {
  children: ReactNode;
  onTap: () => void;
  disabled?: boolean;
  tone?: 'default' | 'accent' | 'warn' | 'team';
  className?: string;
  ariaLabel?: string;
  /** Con tone 'team': el color del equipo. */
  style?: CSSProperties;
}) {
  const guarded = useGuardedTap(onTap);
  const tones = {
    default: 'bg-surface border-line text-fg',
    accent: 'bg-accent border-accent text-accent-fg',
    warn: 'bg-warn-soft border-warn/60 text-warn',
    team: 'border-black/10',
  };
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={guarded}
      style={{ touchAction: 'manipulation', ...style }}
      className={cx(
        'flex min-h-14 items-center justify-center gap-1 rounded-2xl border-2 px-2 text-2xl font-black tabular-nums shadow-sm transition select-none',
        'active:scale-[0.97] active:brightness-90 disabled:opacity-40',
        tones[tone],
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Puntos de faltas: llenos las que tiene; amarillo en el aviso, rojo si salió. */
export function FoulDots({ fouls, max, state }: { fouls: number; max: number | null; state: 'ok' | 'warn' | 'out' }) {
  if (max === null) return fouls ? <span className="text-[11px] font-semibold tabular-nums">{fouls} F</span> : null;
  return (
    <span className="flex gap-0.5" aria-label={`${fouls} faltas`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cx(
            'size-1.5 rounded-full',
            i < fouls ? (state === 'out' ? 'bg-danger' : state === 'warn' ? 'bg-warn' : 'bg-fg') : 'bg-fg/20',
          )}
        />
      ))}
    </span>
  );
}

/** Botón de un dorsal: número grande, nombre corto, puntos y faltas. Seleccionado: borde grueso del color. */
export function JerseyButton({
  jersey,
  name,
  stat,
  fouls,
  foulMax,
  state,
  selected,
  color,
  onTap,
  disabled,
}: {
  jersey: number | null;
  name: string;
  /** «12 pts». */
  stat?: ReactNode;
  fouls: number;
  foulMax: number | null;
  state: 'ok' | 'warn' | 'out';
  selected?: boolean;
  color: string;
  onTap: () => void;
  disabled?: boolean;
}) {
  const guarded = useGuardedTap(onTap);
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${jersey != null ? `Dorsal ${jersey}, ` : ''}${name}${state === 'out' ? ', fuera del juego' : state === 'warn' ? ', una falta más y sale' : ''}`}
      onClick={guarded}
      style={{ touchAction: 'manipulation', ...(selected ? { borderColor: color, boxShadow: `0 0 0 2px ${color}` } : {}) }}
      className={cx(
        'flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xl border-2 bg-surface px-1 py-1 text-center transition select-none active:scale-[0.97] disabled:opacity-40',
        state === 'warn' && !selected && 'border-warn bg-warn-soft',
        state === 'out' && 'border-danger bg-danger-soft',
        state === 'ok' && !selected && 'border-line',
      )}
    >
      <span className="text-xl font-black tabular-nums leading-none">{jersey ?? '–'}</span>
      <span className="w-full truncate text-[11px] font-medium leading-tight">{name}</span>
      <span className="flex items-center gap-1 text-[11px] tabular-nums text-muted">
        {stat}
        <FoulDots fouls={fouls} max={foulMax} state={state} />
      </span>
      {state === 'out' && <span className="text-[10px] font-bold uppercase text-danger">Fuera</span>}
    </button>
  );
}
