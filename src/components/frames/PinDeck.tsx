import { cx } from '../ui';

/** Filas de pines vistas desde el jugador: 7-8-9-10 al fondo, el 1 adelante. */
export const PIN_ROWS: readonly (readonly number[])[] = [
  [7, 8, 9, 10],
  [4, 5, 6],
  [2, 3],
  [1],
];

/**
 * Pines para tocar los que cayeron en el tiro.
 * `standing` = pines parados antes del tiro; `knocked` = los que el usuario marcó como caídos.
 */
export function PinDeck({
  standing,
  knocked,
  onToggle,
  disabled,
}: {
  standing: number;
  knocked: number;
  onToggle: (pin: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-1" role="group" aria-label="Pines">
      {PIN_ROWS.map((row) => (
        <div key={row[0]} className="flex gap-3">
          {row.map((pin) => {
            const bit = 1 << (pin - 1);
            const up = (standing & bit) !== 0;
            const down = (knocked & bit) !== 0;
            return (
              <button
                key={pin}
                type="button"
                disabled={disabled || !up}
                onClick={() => onToggle(bit)}
                aria-pressed={down}
                aria-label={`Pin ${pin}${!up ? ' (ya había caído)' : down ? ' caído' : ' parado'}`}
                className={cx(
                  'flex size-[46px] items-center justify-center rounded-full text-[15px] font-semibold tabular-nums transition select-none active:scale-90',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  // Como las teclas: el que ya cayó, solo el contorno tenue; el que se marca, del color del deporte.
                  !up ? 'border-[1.5px] border-dashed border-line text-faint' : down ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg',
                )}
              >
                {pin}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
