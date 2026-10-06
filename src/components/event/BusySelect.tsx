import type { SelectHTMLAttributes } from 'react';
import { BusyIcon, useBusy } from '../busy';
import { Select, cx } from '../ui';

type ViewProps = SelectHTMLAttributes<HTMLSelectElement> & {
  /** Esperando: la ruedita va donde la flecha y no deja elegir otra vez. */
  busy: boolean;
  /** Clases de la caja (el Select ocupa todo su ancho). */
  wrapClassName?: string;
};

/** Lo que se ve (sin estado: se prueba con renderToString). */
export function BusySelectView({ busy, wrapClassName, className, disabled, children, ...rest }: ViewProps) {
  return (
    <div className={cx('relative', wrapClassName)}>
      <Select {...rest} disabled={disabled || busy} aria-busy={busy || undefined} className={cx(className, busy && 'appearance-none')}>
        {children}
      </Select>
      {busy && (
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-muted">
          <BusyIcon busy className="size-4" />
        </span>
      )}
    </div>
  );
}

/**
 * Un Select que guarda al elegir (equipo, pista). Cada uno lleva su propia espera: los de las otras filas se siguen
 * usando mientras este guarda.
 */
export function BusySelect({ onPick, ...rest }: Omit<ViewProps, 'busy' | 'onChange'> & { onPick: (value: string) => Promise<unknown> | void }) {
  const { isBusy, run } = useBusy();
  return (
    <BusySelectView
      {...rest}
      busy={isBusy()}
      onChange={(e) => {
        const value = e.target.value;
        void run('elegir', async () => onPick(value));
      }}
    />
  );
}
