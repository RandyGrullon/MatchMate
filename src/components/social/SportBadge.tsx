import type { CSSProperties } from 'react';
import { CircleHelp } from 'lucide-react';
import { sportMeta } from '../../sports/registry';
import { cx } from '../ui';
import { sportShort } from './socialFormat';

/**
 * Insignia del deporte (ícono y nombre corto) con su color. El color se mezcla con el del texto de la app para que
 * se lea igual en modo claro y oscuro; el boliche (sin color propio) usa el de la app.
 */
export function SportBadge({ sport, iconOnly, className }: { sport: string; iconOnly?: boolean; className?: string }) {
  const meta = sportMeta(sport);
  const Icon = meta?.icon ?? CircleHelp;
  const color = meta?.color ?? 'var(--color-accent)';
  const style: CSSProperties = {
    color: `color-mix(in oklab, ${color} 78%, var(--color-fg))`,
    backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
  };
  const label = sportShort(sport);
  return (
    <span
      className={cx('inline-flex shrink-0 items-center gap-1 rounded-full text-xs font-semibold whitespace-nowrap', iconOnly ? 'size-6 justify-center' : 'px-2 py-0.5', className)}
      style={style}
      title={label}
      aria-label={iconOnly ? label : undefined}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {!iconOnly && label}
    </span>
  );
}
