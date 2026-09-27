import { useEffect, useState } from 'react';
import { cx } from './ui';

/** Número editable en línea: guarda al salir. Vacío = null (si se permite). */
export function NumberCell({
  value,
  onCommit,
  placeholder,
  min = 0,
  max = 300,
  allowEmpty,
  label,
  className,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  allowEmpty?: boolean;
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value == null ? '' : String(value));
  }, [value, focused]);

  function commit() {
    const t = draft.trim();
    if (t === '') {
      if (allowEmpty && value != null) onCommit(null);
      else if (!allowEmpty) setDraft(value == null ? '' : String(value));
      return;
    }
    const n = Math.round(Number(t));
    if (!Number.isFinite(n) || n < min || n > max) {
      setDraft(value == null ? '' : String(value));
      return;
    }
    if (n !== value) onCommit(n);
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={label}
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
        className,
      )}
    />
  );
}
