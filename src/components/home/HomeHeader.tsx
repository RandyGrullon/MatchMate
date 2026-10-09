import { Link } from 'react-router';
import { Bell } from 'lucide-react';
import { ModeTag } from '../mode';
import { NOTIFICATIONS_PATH, useNotifications } from '../Notifications';
import { SearchButton } from '../social/SearchButton';
import { cx } from '../ui';
import { todayLabel } from './logic';

/**
 * La campana de Hoy (la barra de abajo ya no la tiene): redonda, de 44 px, con un punto en el color del deporte si hay
 * avisos nuevos. Lleva a Avisos.
 */
export function HomeBell({ className }: { className?: string }) {
  const { unread } = useNotifications();
  const label = unread ? `Avisos: ${unread} ${unread === 1 ? 'nuevo' : 'nuevos'}` : 'Avisos';
  return (
    <Link
      to={NOTIFICATIONS_PATH}
      aria-label={label}
      title="Avisos"
      data-tour="campana"
      className={cx(
        'card-shadow relative grid size-11 shrink-0 place-items-center rounded-full bg-surface text-fg-2 transition active:scale-95',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        className,
      )}
    >
      <Bell aria-hidden="true" className="size-[22px]" />
      {unread > 0 && <span aria-hidden="true" className="absolute top-2.5 right-[11px] size-[9px] rounded-full border-2 border-surface bg-accent" />}
    </Link>
  );
}

/**
 * Arriba de Hoy: la fecha («Miércoles 7 de octubre», con «PRO ▾» en Pro), el saludo grande («Hola, Ana») y, a la
 * derecha, la lupa (buscar personas y ligas) y la campana. `onModeTag`: qué hace tocar «PRO ▾» (la hoja del modo).
 */
export function HomeHeader({ now, name, onModeTag }: { now: Date; name: string; onModeTag?: () => void }) {
  // Como el diseño (.home-head: 10 px arriba, en el margen de 24 px de la pantalla): la pantalla trae 20 px arriba.
  return (
    <header className="-mt-2.5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 text-meta font-medium text-muted">
          <span className="first-letter:uppercase">{todayLabel(now)}</span>
          <ModeTag onClick={onModeTag} />
        </p>
        <h1 className="mt-1 truncate text-title">{name ? `Hola, ${name}` : 'Hola'}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <SearchButton />
        <HomeBell />
      </div>
    </header>
  );
}
