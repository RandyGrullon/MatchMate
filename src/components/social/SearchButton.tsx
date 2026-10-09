import { Link } from 'react-router';
import { Search } from 'lucide-react';
import { cx } from '../ui';

/** A dónde lleva la lupa: buscar personas con cuenta (nombre o @usuario) y ligas. */
export const SEARCH_PATH = '/buscar';

/**
 * La lupa: redonda, de 44 px, como la campana de Hoy (HomeBell). Va arriba de Hoy, Social, Ligas y Yo, y en la barra
 * de arriba de la computadora. `flat`: sin la sombra de tarjeta (en la barra de arriba).
 */
export function SearchButton({ className, flat }: { className?: string; flat?: boolean }) {
  return (
    <Link
      to={SEARCH_PATH}
      aria-label="Buscar personas y ligas"
      title="Buscar"
      data-tour="lupa"
      className={cx(
        'relative grid size-11 shrink-0 place-items-center rounded-full text-fg-2 transition active:scale-95',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        flat ? 'hover:bg-surface-2 sm:size-9' : 'card-shadow bg-surface',
        className,
      )}
    >
      <Search aria-hidden="true" className={flat ? 'size-5' : 'size-[21px]'} />
    </Link>
  );
}
