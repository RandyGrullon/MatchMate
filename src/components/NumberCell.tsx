import { useEffect, useState } from 'react';
import { BusyIcon, useBusy } from './busy';
import { cx } from './ui';

const show = (v: number | null) => (v == null ? '' : String(v));

/**
 * Número editable en línea: guarda al salir. Vacío = null (si se permite). Mientras guarda, la ruedita adentro (no
 * cambia el ancho) y se queda lo escrito.
 */
export function NumberCell({
  value,
  onCommit,
  placeholder,
  min = 0,
  max = 300,
  allowEmpty,
  label,
  className,
  wrapClassName,
}: {
  value: number | null;
  /** Si devuelve `true` (se guardó), se deja lo escrito hasta que llegue el número nuevo; si no, vuelve al de antes. */
  onCommit: (v: number | null) => Promise<unknown> | void;
  placeholder?: string;
  min?: number;
  max?: number;
  allowEmpty?: boolean;
  label: string;
  className?: string;
  /** Clases de la caja (la que se acomoda en la fila). */
  wrapClassName?: string;
}) {
  const [draft, setDraft] = useState(show(value));
  const [focused, setFocused] = useState(false);
  // Ya se guardó pero el número nuevo todavía no llega: el de antes (para no volver a él un momento).
  const [stale, setStale] = useState<{ v: number | null } | null>(null);
  const { isBusy, run } = useBusy();
  const busy = isBusy();
  const holding = busy || (stale !== null && stale.v === value);
  useEffect(() => {
    if (stale && stale.v !== value) setStale(null);
    if (!focused && !holding) setDraft(show(value));
  }, [value, focused, holding, stale]);

  function save(v: number | null) {
    const before = value;
    void run('guardar', async () => {
      if ((await onCommit(v)) === true) setStale({ v: before });
    });
  }

  function commit() {
    const t = draft.trim();
    if (t === '') {
      if (allowEmpty && value != null) save(null);
      else if (!allowEmpty) setDraft(show(value));
      return;
    }
    const n = Math.round(Number(t));
    if (!Number.isFinite(n) || n < min || n > max) {
      setDraft(show(value));
      return;
    }
    if (n !== value) save(n);
  }

  return (
    <span className={cx('relative inline-flex', wrapClassName)}>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        aria-busy={busy || undefined}
        disabled={busy}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className={cx(
          'h-9 w-16 rounded-lg border border-line bg-surface text-center text-base tabular-nums placeholder:text-muted sm:text-sm',
          'focus:outline-none focus:ring-2 focus:ring-accent/40',
          busy && 'pr-4',
          className,
        )}
      />
      {busy && <BusyIcon busy className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 text-muted" />}
    </span>
  );
}
