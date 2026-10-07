import { useRef, type ReactNode } from 'react';
import { scoreGame } from '../../lib/bowling';
import { splitRolls } from '../../lib/bowlingStats';
import { cx } from '../ui';

/** Las casillas de tiro de un cuadro: la marca y de qué tiro es (null = todavía no se tira). */
interface Slot {
  mark: string;
  roll: number | null;
}

/**
 * Las casillas de un cuadro. Un strike en los cuadros 1–9 se dibuja en la casilla de la derecha, como en la pantalla de la
 * bolera: las dos casillas son el mismo tiro (la X va a la derecha).
 */
function frameSlots(game: ReturnType<typeof scoreGame>, f: number): { slots: Slot[]; strikeRight: boolean } {
  const frame = game.frames[f];
  const marks = frame?.marks ?? [];
  const strikeRight = f < 9 && marks[0] === 'X';
  const slots = Array.from({ length: f === 9 ? 3 : 2 }, (_, k) => {
    const at = strikeRight ? 0 : k < marks.length ? k : null;
    return { mark: at != null && !(strikeRight && k === 0) ? marks[at] : '', roll: at != null && frame ? frame.start + at : null };
  });
  return { slots, strikeRight };
}

/**
 * Hoja de 10 cuadros para ver un juego (el detalle de un juego, aprobar): marcas de cada tiro arriba y el acumulado abajo.
 * Con los pines anotados (`masks`), la primera bola que dejó un split va en un círculo, como en la pantalla de la bolera.
 * Para anotar, la hoja de 2 × 5 que se toca es `FramesSheet`.
 */
export function FramesGrid({
  rolls,
  masks,
  compact,
}: {
  rolls: readonly number[];
  /** Pines que cayeron en cada tiro (alineados con `rolls`): marcan los splits. */
  masks?: readonly (number | null)[] | null;
  compact?: boolean;
}) {
  const game = scoreGame(rolls);
  const splits = new Set(splitRolls(rolls, masks));
  return (
    <div className="grid grid-cols-[repeat(9,minmax(0,1fr))_minmax(0,1.45fr)] overflow-hidden rounded-xl border border-line bg-surface text-center tabular-nums">
      {Array.from({ length: 10 }, (_, f) => (
        <div key={f} className={cx('flex min-w-0 flex-col border-line', f > 0 && 'border-l')}>
          <span className={cx('border-b border-line text-[10px] text-muted', compact ? 'leading-4' : 'leading-5')}>{f + 1}</span>
          <span className="flex justify-end">
            {frameSlots(game, f).slots.map(({ mark, roll }, k) => {
              const split = roll != null && splits.has(roll);
              // min-w-0: las dos casillas del cuadro quedan del mismo ancho aunque una tenga el círculo del split.
              return (
                <span
                  key={k}
                  title={split ? 'Split' : undefined}
                  className={cx(
                    'flex min-w-0 flex-1 items-center justify-center font-semibold',
                    compact ? 'h-5 text-[11px]' : 'h-6 text-xs',
                    k > 0 && 'border-l border-line',
                    (mark === 'X' || mark === '/') && 'text-accent',
                  )}
                >
                  {split ? (
                    // El split: la marca dentro de un círculo (y dicho para el lector de pantalla).
                    <>
                      <SplitMark mark={mark} />
                      <span className="sr-only"> (split)</span>
                    </>
                  ) : (
                    mark
                  )}
                </span>
              );
            })}
          </span>
          <span className={cx('border-t border-line font-bold', compact ? 'h-5 text-xs leading-5' : 'h-7 text-sm leading-7')}>
            {game.frames[f]?.total ?? ''}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Tiros seguidos de un cuadro que se tocan en el mismo lugar (el mismo tiro, o lo que todavía no se tira). */
interface Zone {
  roll: number | null;
  from: number;
  to: number;
}

/**
 * La hoja para anotar: 2 filas de 5 cuadros, cada uno con su número, sus tiros arriba a la derecha y el acumulado grande.
 * El cuadro que se anota (o el que se corrige) va resaltado y la rayita marca dónde cae el próximo tiro.
 *
 * Con `onSelect` cada tiro se toca en su franja del cuadro (de arriba abajo): tocar un tiro lo elige para corregirlo;
 * tocar lo que falta, seguir anotando al final. Dejarlo presionado (o Suprimir) lo borra.
 */
export function FramesSheet({
  rolls,
  masks,
  next,
  selected,
  blank,
  onSelect,
  onLongPress,
  className,
}: {
  rolls: readonly number[];
  /** Pines que cayeron en cada tiro (alineados con `rolls`): marcan los splits. */
  masks?: readonly (number | null)[] | null;
  /** Dónde cae el próximo tiro (su cuadro se resalta y lleva la rayita); null = terminó o se está corrigiendo. */
  next?: { frame: number; roll: number } | null;
  /** Tiro elegido para corregirlo (índice en la lista de tiros): su cuadro se resalta y el tiro lleva la rayita. */
  selected?: number | null;
  /** Tiro borrado que falta volver a escribir: se ve vacío y los acumulados que dependen de él no se muestran. */
  blank?: number | null;
  /** Tocar un tiro (su índice) o lo que falta (null = seguir anotando al final). */
  onSelect?: (roll: number | null) => void;
  /** Dejar presionado un tiro: borrarlo. */
  onLongPress?: (roll: number) => void;
  className?: string;
}) {
  const game = scoreGame(rolls);
  const known = blank != null ? scoreGame(rolls.slice(0, blank)) : game;
  const splits = new Set(splitRolls(rolls, masks));
  const editing = selected != null ? game.frames.findIndex((fr) => selected >= fr.start && selected < fr.start + fr.rolls.length) : -1;
  const lit = editing >= 0 ? editing : (next?.frame ?? -1);

  return (
    // Cinco columnas iguales (como el diseño): el 10 lleva sus tres tiros más juntos, así no tocan su número (en 360 px
    // tampoco).
    <div className={cx('grid grid-cols-5 overflow-hidden rounded-[18px] tabular-nums ring-1 ring-line ring-inset', className)}>
      {Array.from({ length: 10 }, (_, f) => {
        const on = f === lit;
        const tenth = f === 9;
        const frame = game.frames[f];
        const { slots, strikeRight } = frameSlots(game, f);
        // Dónde va la rayita del próximo tiro (al corregir, la lleva el tiro elegido).
        const caretAt = on && editing < 0 && next?.frame === f ? next.roll : null;
        const zones: Zone[] = [];
        slots.forEach(({ roll }, k) => {
          const last = zones.at(-1);
          if (last && last.roll === roll) last.to = k + 1;
          else zones.push({ roll, from: k, to: k + 1 });
        });

        const slot = (k: number) => {
          const { mark, roll } = slots[k];
          // La casilla izquierda de un strike va vacía (la X va a la derecha).
          const left = strikeRight && k === 0;
          const isBlank = !left && roll != null && roll === blank;
          const split = !left && !isBlank && roll != null && splits.has(roll);
          const caret = isBlank || (!left && roll != null && roll === selected) || k === caretAt;
          return (
            <span
              key={k}
              className={cx(
                'flex h-5 shrink-0 items-center justify-center leading-none font-[650]',
                // El 10 lleva tres tiros: casillas más angostas y pegadas.
                tenth ? 'w-3 text-[13px]' : 'w-4 text-[15px]',
                k > 0 && !tenth && 'ml-1',
                split && 'text-[13px]',
                !isBlank && (mark === 'X' || mark === '/') && 'text-accent',
                caret && 'border-b-[2.5px] border-accent',
              )}
            >
              {left || isBlank ? '' : split ? <SplitMark mark={mark} /> : mark}
            </span>
          );
        };

        return (
          <div
            key={f}
            className={cx(
              'relative h-[66px] min-w-0',
              f % 5 > 0 && 'before:absolute before:top-2.5 before:bottom-2.5 before:left-0 before:w-px before:bg-line',
              f >= 5 && 'border-t border-line',
            )}
          >
            {on && <span aria-hidden="true" className="absolute inset-1 rounded-[13px] bg-accent-soft ring-2 ring-accent ring-inset" />}
            <span
              aria-hidden="true"
              className={cx(
                'pointer-events-none absolute text-[11px] leading-[1.4] font-semibold',
                on ? cx('top-[9px] text-accent', tenth ? 'left-2' : 'left-[11px]') : cx('top-1.5 text-faint', tenth ? 'left-1.5' : 'left-2'),
              )}
            >
              {f + 1}
            </span>
            <span
              className={cx(
                'pointer-events-none absolute bottom-[7px] text-[21px] leading-[1.4] font-[650] tracking-[-0.02em]',
                on ? 'left-[11px]' : 'left-2',
              )}
            >
              {known.frames[f]?.total ?? ''}
            </span>
            <div className="absolute inset-0 flex">
              {zones.map((z, i) => {
                const cls = cx(
                  'flex h-full items-start justify-end',
                  i === 0 ? 'min-w-0 flex-1' : 'shrink-0',
                  i === zones.length - 1 && (tenth ? (on ? 'pr-[7px]' : 'pr-1') : on ? 'pr-[11px]' : 'pr-2'),
                  on ? 'pt-[11px]' : 'pt-[9px]',
                );
                const content = Array.from({ length: z.to - z.from }, (_, j) => slot(z.from + j));
                if (!onSelect) {
                  return (
                    <span key={i} className={cx(cls, 'pointer-events-none')}>
                      {content}
                    </span>
                  );
                }
                const roll = z.roll;
                const mark = strikeRight ? 'X' : slots[z.from].mark;
                const split = roll != null && roll !== blank && splits.has(roll);
                return (
                  <RollCell
                    key={i}
                    className={cls}
                    label={
                      roll != null && frame
                        ? `Cuadro ${f + 1}, tiro ${roll - frame.start + 1}: ${roll === blank ? 'vacío' : mark}${split ? ' (split)' : ''}`
                        : `Cuadro ${f + 1}, tiro ${z.from + 1}: vacío`
                    }
                    onTap={() => onSelect(roll)}
                    onLong={roll != null && onLongPress ? () => onLongPress(roll) : undefined}
                  >
                    {content}
                  </RollCell>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * El círculo del split: un poco más grande que la letra y nunca más ancho que su casilla (en un teléfono se achica a lo
 * que mide la casilla: la de al lado no pierde espacio).
 */
function SplitMark({ mark }: { mark: string }) {
  return (
    <span
      className="inline-flex aspect-square min-h-0 w-[min(1.4em,100%)] shrink-0 items-center justify-center rounded-full border border-current leading-none"
      data-split=""
    >
      {mark}
    </span>
  );
}

const LONG_PRESS_MS = 450;

/** El lugar de un tiro: tocar = elegirlo; dejar presionado (o Suprimir) = borrarlo. */
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
  children: ReactNode;
}) {
  const timer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  const cancel = () => window.clearTimeout(timer.current);
  return (
    <button
      type="button"
      aria-label={label}
      title={onLong ? 'Toca para corregir · deja presionado para borrar' : undefined}
      className={cx(
        className,
        'rounded-xl transition select-none active:bg-fg/5 [-webkit-touch-callout:none]',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
      )}
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
