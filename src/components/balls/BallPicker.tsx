import { useEffect, useId, useState, type RefObject } from 'react';
import { ballLabel, defaultBall, pickableBalls, type Ball } from '../../lib/balls';
import { storedBall, useMyBalls } from '../../lib/data/balls';
import { cx } from '../ui';

/**
 * Las bolas para elegir al anotar: todas las de la cuenta, si hay alguna para elegir (no retirada) y la que se pone sola
 * en un juego nuevo (la última que usó; null si ninguna). Sin sesión o sin bolas, `has` es false y no sale nada.
 * `loaded`: la lista se leyó (del servidor o de la copia del teléfono); si no, no se sabe si la cuenta tiene bolas.
 */
export function useBallChoice(): { balls: Ball[]; has: boolean; auto: string | null; loaded: boolean } {
  const mine = useMyBalls();
  const balls = mine.data.balls;
  return {
    balls,
    has: pickableBalls(balls).length > 0,
    auto: defaultBall(balls, storedBall(), mine.data.lastUsed),
    loaded: !mine.loading && !mine.error,
  };
}

/**
 * El color de la bola (el de la bola de verdad, para reconocerla). Con borde para que una blanca o una negra se vea
 * en el tema claro y en el oscuro; sin bola, un círculo punteado.
 */
export function BallDot({ color, className }: { color: string | null | undefined; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-block shrink-0 rounded-full border',
        color ? 'border-line shadow-[inset_-2px_-2px_4px_rgb(0_0_0/0.25)]' : 'border-dashed border-muted',
        className ?? 'size-4',
      )}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

/** Valor del selector cuando los juegos tienen bolas distintas (solo se muestra, no se elige). */
const MIXED = '__varias__';

/**
 * Elegir la bola (opcional): el color y una lista del teléfono con «Sin bola» y las que no están retiradas (y la que ya
 * tenía, aunque esté retirada). `value` undefined = los juegos tienen bolas distintas («Varias bolas»). Sin bolas que
 * elegir no sale nada.
 */
export function BallSelect({
  balls,
  value,
  onChange,
  label = 'Bola',
  hint,
  className,
}: {
  balls: readonly Ball[];
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  label?: string;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  const options = pickableBalls(balls, value);
  if (!options.length) return null;
  const current = value === undefined ? null : balls.find((b) => b.id === value);
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <div className="relative flex items-center">
        <BallDot color={current?.color} className="pointer-events-none absolute left-3 size-5" />
        <select
          id={id}
          value={value === undefined ? MIXED : (value ?? '')}
          onChange={(e) => {
            if (e.target.value !== MIXED) onChange(e.target.value || null);
          }}
          className="h-11 w-full rounded-xl border border-line bg-surface pr-8 pl-10 text-base text-fg focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none sm:text-sm"
        >
          {value === undefined && (
            <option value={MIXED} disabled>
              Varias bolas
            </option>
          )}
          <option value="">Sin bola</option>
          {options.map((b) => (
            <option key={b.id} value={b.id}>
              {`${ballLabel(b)}${b.retired ? ' · retirada' : ''}`}
            </option>
          ))}
        </select>
      </div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

/** Una bola de boliche (con sus tres huecos), del color del texto: el ícono de «Mis bolas». */
export function BallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className={className ?? 'size-5'}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="10" cy="8.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="8.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * La bola de un juego dentro de la hoja de anotar (arriba del editor). Se monta con la del juego (`key` = el juego) y
 * deja lo elegido en `choice`: quien abre la hoja lo aplica al guardar el juego (cancelar no cambia nada).
 */
export function GameBallSelect({
  balls,
  initial,
  choice,
}: {
  balls: readonly Ball[];
  initial: string | null;
  choice: RefObject<string | null>;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    choice.current = initial;
    // Solo al abrir este juego (la hoja la vuelve a montar con otro `key`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <BallSelect
      balls={balls}
      value={value}
      label="Bola de este juego"
      onChange={(id) => {
        setValue(id);
        choice.current = id;
      }}
    />
  );
}
