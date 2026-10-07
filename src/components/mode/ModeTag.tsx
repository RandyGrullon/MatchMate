import { ChevronDown } from 'lucide-react';
import { useIsPro } from '../../lib/useMode';
import { cx } from '../ui';

/**
 * La etiqueta «PRO ▾» junto a la fecha de Hoy: solo en Pro, en el color del deporte y tocable (abre la hoja de modo,
 * o lleva a Yo, según lo que pase `onClick`). Se ve de 24 px y se toca en 44.
 */
export function ModeTag({ onClick, className }: { onClick?: () => void; className?: string }) {
  if (!useIsPro()) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Modo Pro: cambiar cómo ver la app"
      className={cx(
        "relative inline-flex h-6 items-center gap-0.5 rounded-full bg-accent-soft pr-1.5 pl-[9px] text-[11.5px] font-[750] tracking-[0.06em] text-accent after:absolute after:-inset-y-2.5 after:-inset-x-1 after:content-['']",
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        className,
      )}
    >
      PRO
      <ChevronDown aria-hidden="true" strokeWidth={3} className="size-3" />
    </button>
  );
}
