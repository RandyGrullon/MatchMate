import { cx } from '../ui';

/** Filas de pines vistas desde el jugador: 7-8-9-10 al fondo, el 1 adelante. */
const ROWS = [
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
    <div className="flex flex-col items-center gap-2 py-2" role="group" aria-label="Pines">
      {ROWS.map((row) => (
        <div key={row[0]} className="flex gap-2.5">
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
                  'flex size-12 items-center justify-center rounded-full border-2 text-sm font-bold transition select-none active:scale-90 sm:size-11',
                  !up
                    ? 'border-dashed border-line text-muted/50'
                    : down
                      ? 'border-accent bg-accent text-accent-fg shadow-inner'
                      : 'border-line bg-surface text-fg shadow-sm',
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
