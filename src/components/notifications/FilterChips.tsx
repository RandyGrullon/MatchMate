import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from '../ui';

export interface ChipItem<K extends string> {
  key: K;
  label: string;
  icon?: ReactNode;
  /** Lo sin leer de ese filtro (0 = no se muestra). */
  count?: number;
}

/**
 * Fila de filtros que se desliza de lado (sin mover la página). Cada botón toca en 44 px de alto aunque la
 * pastilla se vea de 36; el activo siempre queda a la vista.
 */
export function FilterChips<K extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: readonly ChipItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Para lectores de pantalla: qué se filtra. */
  label: string;
}) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = bar.current;
    const el = box?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!box || !el) return;
    const left = el.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft || left + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollTo({ left: Math.max(0, left - 16) });
  }, [value]);

  return (
    // `relative` en la fila y en cada botón: lo que va posicionado adentro (el «, sin leer:» del lector de pantalla) queda
    // dentro de la fila que se desliza y no ensancha la página.
    <div ref={bar} className="no-scrollbar relative -mx-4 overflow-x-auto overscroll-x-contain px-4" role="group" aria-label={label}>
      <div className="flex w-max gap-1.5 pr-4">
        {items.map((it) => {
          const active = it.key === value;
          const count = it.count ?? 0;
          return (
            <button
              key={it.key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(it.key)}
              className="group relative flex h-11 shrink-0 items-center rounded-full outline-none"
            >
              <span
                className={cx(
                  'flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition group-active:scale-95',
                  'group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent',
                  active ? 'border-transparent bg-accent text-accent-fg shadow-sm' : 'border-line bg-surface text-muted group-hover:text-fg',
                )}
              >
                {it.icon}
                {it.label}
                {count > 0 && (
                  <span
                    className={cx(
                      'min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold tabular-nums',
                      active ? 'bg-accent-fg/20 text-accent-fg' : 'bg-accent-soft text-accent',
                    )}
                  >
                    <span className="sr-only">, sin leer: </span>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
