import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { tap } from '../../../court';
import { cx } from '../../../components/ui';

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

/**
 * Cabecera de la mesa (rediseño «Calma y foco»): los dos equipos con el punto de su color y el marcador grande (56 px);
 * en el centro, periodo y reloj.
 */
export function ScoreHeader({ a, b, center }: { a: HeaderSide; b: HeaderSide; center?: ReactNode }) {
  const side = (s: HeaderSide, align: 'left' | 'right') => (
    <div className={cx('flex min-w-0 flex-1 flex-col gap-1.5', align === 'right' && 'items-end text-right')}>
      <span className={cx('flex max-w-full min-w-0 items-center gap-1.5 text-[15px] font-semibold', align === 'right' && 'flex-row-reverse')}>
        <span aria-hidden="true" className="size-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: s.color }} />
        <span className="truncate">{s.name}</span>
      </span>
      <span className="num text-[56px] leading-[0.95] font-bold sm:text-6xl" aria-live="polite">
        {s.score}
      </span>
      {s.sub && <div className={cx('flex flex-wrap items-center gap-1 text-[13px] text-muted', align === 'right' && 'justify-end')}>{s.sub}</div>}
    </div>
  );
  return (
    <div className="card-shadow flex items-start gap-2 rounded-3xl bg-surface px-4 py-3.5">
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
    default: 'bg-surface-2 text-fg',
    accent: 'bg-accent text-accent-fg',
    warn: 'bg-warn-soft text-warn',
    team: 'shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]',
  };
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={guarded}
      style={{ touchAction: 'manipulation', ...style }}
      className={cx(
        'num flex min-h-14 items-center justify-center gap-1 rounded-key px-2 text-[26px] font-bold transition select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97] active:brightness-90 disabled:opacity-40',
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
      style={{ touchAction: 'manipulation', ...(selected ? { boxShadow: `inset 0 0 0 2.5px ${color}` } : {}) }}
      className={cx(
        'flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1 text-center transition select-none active:scale-[0.97] disabled:opacity-40',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        selected ? 'bg-surface' : state === 'warn' ? 'bg-warn-soft text-warn' : state === 'out' ? 'bg-danger-soft text-danger' : 'bg-surface-2',
      )}
    >
      <span className="num text-[22px] leading-none font-bold">{jersey ?? '–'}</span>
      <span className="w-full truncate text-[11px] font-medium leading-tight">{name}</span>
      <span className="flex items-center gap-1 text-[11px] tabular-nums text-muted">
        {stat}
        <FoulDots fouls={fouls} max={foulMax} state={state} />
      </span>
      {state === 'out' && <span className="text-[10px] font-bold uppercase text-danger">Fuera</span>}
    </button>
  );
}
