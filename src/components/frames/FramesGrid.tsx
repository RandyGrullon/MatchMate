import { useRef } from 'react';
import { scoreGame } from '../../lib/bowling';
import { cx } from '../ui';

/** Hoja de 10 cuadros: marcas de cada tiro arriba y el acumulado abajo. */
export function FramesGrid({
  rolls,
  cursor,
  compact,
  selected,
  blank,
  onSelect,
  onLongPress,
}: {
  rolls: readonly number[];
  /** Cuadro que se está anotando (se resalta). */
  cursor?: number | null;
  compact?: boolean;
  /** Tiro elegido para corregirlo (índice en la lista de tiros). */
  selected?: number | null;
  /** Tiro borrado que falta volver a escribir: se ve vacío y los acumulados que dependen de él no se muestran. */
  blank?: number | null;
  /** Tocar un tiro (su índice) o una casilla vacía (null = seguir anotando al final). */
  onSelect?: (roll: number | null) => void;
  /** Dejar presionado un tiro: borrarlo. */
  onLongPress?: (roll: number) => void;
}) {
  const game = scoreGame(rolls);
  const known = blank != null ? scoreGame(rolls.slice(0, blank)) : game;
  const interactive = !!onSelect;
  return (
    <div className="grid grid-cols-[repeat(9,minmax(0,1fr))_minmax(0,1.45fr)] overflow-hidden rounded-xl border border-line bg-surface text-center tabular-nums">
      {Array.from({ length: 10 }, (_, f) => {
        const frame = game.frames[f];
        const slots = f === 9 ? 3 : 2;
        const marks = frame?.marks ?? [];
        // Un strike en los cuadros 1–9 se dibuja en la casilla de la derecha, como en la pantalla de la bolera.
        const strikeRight = f < 9 && marks[0] === 'X';
        // Las dos casillas de un strike son el mismo tiro (la X va a la derecha).
        const cells = Array.from({ length: slots }, (_, k) => {
          const at = strikeRight ? 0 : k < marks.length ? k : null;
          return { mark: at != null && !(strikeRight && k === 0) ? marks[at] : '', roll: at != null && frame ? frame.start + at : null };
        });
        return (
          <div key={f} className={cx('flex min-w-0 flex-col border-line', f > 0 && 'border-l', cursor === f && 'bg-accent-soft')}>
            <span className={cx('border-b border-line text-[10px] text-muted', compact ? 'leading-4' : 'leading-5')}>{f + 1}</span>
            <span className="flex justify-end">
              {cells.map(({ mark, roll }, k) => {
                const isBlank = roll != null && roll === blank;
                const cls = cx(
                  'flex flex-1 items-center justify-center font-semibold',
                  compact ? 'h-5 text-[11px]' : interactive ? 'h-9 text-sm' : 'h-6 text-xs',
                  k > 0 && 'border-l border-line',
                  !isBlank && (mark === 'X' || mark === '/') && 'text-accent',
                  roll != null && roll === selected && 'bg-accent-soft',
                  roll != null && roll === selected && !(strikeRight && k === 0) && 'ring-2 ring-accent ring-inset',
                );
                if (!interactive) {
                  return (
                    <span key={k} className={cls}>
                      {mark}
                    </span>
                  );
                }
                return (
                  <RollCell
                    key={k}
                    className={cls}
                    label={
                      roll != null
                        ? `Cuadro ${f + 1}, tiro ${strikeRight ? 1 : k + 1}: ${strikeRight ? 'X' : mark}${strikeRight && k === 0 ? ' (casilla izquierda)' : ''}`
                        : `Cuadro ${f + 1}, tiro ${k + 1}: vacío`
                    }
                    onTap={() => onSelect(roll)}
                    onLong={roll != null && onLongPress ? () => onLongPress(roll) : undefined}
                  >
                    {isBlank ? '' : mark}
                  </RollCell>
                );
              })}
            </span>
            <span className={cx('border-t border-line font-bold', compact ? 'h-5 text-xs leading-5' : 'h-7 text-sm leading-7')}>
              {known.frames[f]?.total ?? ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const LONG_PRESS_MS = 450;

/** Casilla de un tiro: tocar = elegirlo; dejar presionado (o Suprimir) = borrarlo. */
function RollCell({
  className,
  label,
  onTap,
  onLong,
  children,
}: {
  className: string;
  label: string;
  onTap: () => void;
  onLong?: () => void;
  children: string;
}) {
  const timer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  const cancel = () => window.clearTimeout(timer.current);
  return (
    <button
      type="button"
      aria-label={label}
      title={onLong ? 'Toca para corregir · deja presionado para borrar' : undefined}
      className={cx(className, 'transition select-none active:bg-surface-2 [-webkit-touch-callout:none]')}
      onPointerDown={() => {
        longPressed.current = false;
        if (!onLong) return;
        cancel();
        timer.current = window.setTimeout(() => {
          longPressed.current = true;
          navigator.vibrate?.(25);
          onLong();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (onLong && (e.key === 'Delete' || e.key === 'Backspace')) {
          e.preventDefault();
          onLong();
        }
      }}
      onClick={() => {
        // Después de dejarlo presionado no cuenta también como toque.
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onTap();
      }}
    >
      {children}
    </button>
  );
}
