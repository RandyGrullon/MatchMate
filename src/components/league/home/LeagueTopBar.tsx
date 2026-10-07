import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, UserPlus } from 'lucide-react';
import { useLeagueCtx } from '../../../lib/league';
import { cx } from '../../ui';

/**
 * Arriba de cada pantalla de la liga (ya no hay pestañas ni encabezado doble): «‹ Ligas» en su inicio y «‹ Liga de los
 * martes» dentro (la Tabla, Resultados anteriores, Mis números…): el atrás dice a dónde vuelve. A la derecha, lo de esa
 * pantalla («Invitar», «Excel», «•••»). 52 px de alto, como el diseño; el atrás se toca en 44.
 */
export function LeagueTopBar({ to, label, actions, className }: { to: string; label: string; actions?: ReactNode; className?: string }) {
  return (
    // La pantalla trae 20 px arriba (AppFrame): la barra empieza arriba de todo, como en el diseño.
    <div className={cx('-mt-5 -ml-1.5 flex h-[52px] items-center justify-between gap-3', className)}>
      <Link
        to={to}
        className={cx(
          'inline-flex h-11 min-w-0 items-center rounded-xl pr-2 pl-1 text-body font-[550] text-accent transition active:opacity-70',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
        )}
      >
        <ChevronLeft aria-hidden="true" className="size-6 shrink-0" strokeWidth={2.2} />
        <span className="truncate">{label}</span>
      </Link>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Botón con forma de píldora de la barra de arriba («Invitar»): gris suave, se ve de 36 px y se toca en 44.
 */
export function TopPill({ icon, children, onClick, ariaLabel }: { icon?: ReactNode; children: ReactNode; onClick: () => void; ariaLabel?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      className={cx(
        "relative inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-[13px] text-sm font-semibold whitespace-nowrap text-fg transition active:scale-[0.97] after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/** «Invitar» con su ícono (abre la hoja de invitar de la liga). */
export function InvitePill({ onClick, ariaLabel }: { onClick: () => void; ariaLabel?: string }) {
  return (
    <TopPill icon={<UserPlus aria-hidden="true" className="size-[17px]" />} onClick={onClick} ariaLabel={ariaLabel}>
      Invitar
    </TopPill>
  );
}

// ---------- «‹ Liga de los martes» en las pantallas de adentro ----------

interface BarState {
  /** Alguna pantalla puso su propia barra (con sus botones): la de LeagueShell no sale. */
  own: boolean;
  claim: () => () => void;
}

const BarContext = createContext<BarState | null>(null);

/** Lo pone LeagueShell: así una pantalla que trae su propia barra (LeagueBackBar) quita la que pone el marco. */
export function LeagueBarProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const claim = useCallback(() => {
    setCount((n) => n + 1);
    return () => setCount((n) => n - 1);
  }, []);
  const value = useMemo(() => ({ own: count > 0, claim }), [count, claim]);
  return <BarContext.Provider value={value}>{children}</BarContext.Provider>;
}

/**
 * «‹ Liga de los martes» (vuelve al inicio de la liga) con lo de la pantalla a la derecha (`actions`: «Excel», «•••»).
 * Una pantalla de la liga que la pone (la Tabla con su Excel, por ejemplo) reemplaza la que pone LeagueShell: nunca
 * salen dos.
 */
export function LeagueBackBar({ actions, className }: { actions?: ReactNode; className?: string }) {
  const { league, base } = useLeagueCtx();
  const bar = useContext(BarContext);
  const claim = bar?.claim;
  useLayoutEffect(() => claim?.(), [claim]);
  return <LeagueTopBar to={base} label={league.name} actions={actions} className={className} />;
}

/** La que pone LeagueShell en las pantallas de adentro, si la pantalla no trae la suya. */
export function ShellBackBar() {
  const { league, base } = useLeagueCtx();
  const bar = useContext(BarContext);
  if (bar?.own) return null;
  return <LeagueTopBar to={base} label={league.name} className="mb-2" />;
}
