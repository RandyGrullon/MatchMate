import type { Category } from '../../lib/stats';
import { cx } from '../ui';

const styles: Record<Category, string> = {
  A: 'bg-accent text-accent-fg',
  B: 'bg-accent-soft text-accent',
  C: 'bg-surface-2 text-fg',
  D: 'bg-surface-2 text-muted',
};

/** Letra de la categoría (A–D) según el promedio. */
export function CategoryBadge({ value }: { value: Category }) {
  return (
    <span
      title={`Categoría ${value}`}
      className={cx('inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold', styles[value])}
    >
      {value}
    </span>
  );
}
