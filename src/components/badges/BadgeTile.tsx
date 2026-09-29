import type { ReactNode } from 'react';
import { Insignia, type BadgeLook, type BadgeState } from '../../badges/visual';
import { cx } from '../ui';

/**
 * Una insignia de la grilla (64 px, 4 por fila en un teléfono de 375 px): el dibujo con su estado, el nombre, el nivel
 * (o «Te faltan 3 juegos») y «×N» en las repetibles. Todo el cuadro es el botón (44 px o más).
 */
export function BadgeTile({
  look,
  state = 'unlocked',
  progress,
  name,
  sub,
  count = 1,
  label,
  onOpen,
  pressed,
}: {
  look: BadgeLook;
  state?: BadgeState;
  progress?: number;
  name: string;
  /** Debajo del nombre: el nivel, «En revisión», «Te faltan 3 juegos». */
  sub?: ReactNode;
  count?: number;
  /** Nombre accesible del botón (con «, nueva» si `state` es 'new'). */
  label: string;
  onOpen?: () => void;
  /** Se elige (destacadas): el estado va en aria-pressed. */
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      aria-pressed={pressed}
      className="group flex min-h-11 min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 py-1.5 text-center transition outline-none hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97]"
    >
      <span className="relative">
        <Insignia badge={look} size={64} state={state} progress={progress} pad />
        {count > 1 && (
          <span className="absolute -right-1 bottom-0 rounded-full border border-line bg-surface px-1.5 text-[11px] leading-4 font-bold text-fg tabular-nums shadow-sm">
            ×{count}
          </span>
        )}
        {/* «Nueva» en palabras, no solo el brillo y el punto (§4.7). */}
        {state === 'new' && (
          <span className="absolute -top-1 -left-1 rounded-full bg-accent px-1.5 text-[10px] leading-4 font-bold text-accent-fg shadow-sm" aria-hidden="true">
            Nueva
          </span>
        )}
      </span>
      <span className="line-clamp-2 w-full text-xs leading-tight font-semibold break-words text-fg">{name}</span>
      {sub && <span className="line-clamp-2 w-full text-[11px] leading-tight text-muted">{sub}</span>}
    </button>
  );
}

/** Grilla de 4 por fila (5 o 6 en pantallas anchas). */
export function BadgeGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('grid grid-cols-4 gap-x-1 gap-y-2 sm:grid-cols-5 lg:grid-cols-6', className)}>{children}</div>;
}
