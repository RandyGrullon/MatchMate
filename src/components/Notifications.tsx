import { useCallback, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { Bell } from 'lucide-react';
import { NoticesProvider, useNotifications } from './notifications/provider';
import { cx } from './ui';

export { useNotifications, type NoticesState } from './notifications/provider';

/** Ruta de la página de avisos. */
export const NOTIFICATIONS_PATH = '/avisos';

/**
 * Avisos de todas las ligas de la cuenta en la web: el proveedor compartido (notifications/provider.tsx, el mismo de
 * la app del teléfono) con cómo llegar a /avisos.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const openNotifications = useCallback(() => navigate(NOTIFICATIONS_PATH), [navigate]);
  return <NoticesProvider onOpen={openNotifications}>{children}</NoticesProvider>;
}

/**
 * La campana de avisos de arriba (en la computadora, en la consola del superadmin): lleva a la página de avisos
 * (/avisos), con el número de lo nuevo. En la app la campana va en Hoy (HomeHeader) y ya no hay pestaña de avisos.
 */
export function NotificationsBell() {
  const { unread } = useNotifications();
  const badge = unread > 0 && (
    <span
      className="absolute -top-0.5 -right-0.5 flex min-w-[1.1rem] items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4 font-bold text-on-danger ring-2 ring-surface"
      aria-hidden="true"
    >
      {unread > 9 ? '9+' : unread}
    </span>
  );
  const label = unread ? `Avisos: ${unread} ${unread === 1 ? 'nuevo' : 'nuevos'}` : 'Avisos';
  return (
    <NavLink
      to={NOTIFICATIONS_PATH}
      data-tour="campana"
      aria-label={label}
      title="Avisos"
      className={({ isActive }) =>
        cx(
          'relative inline-flex size-9 items-center justify-center rounded-xl transition hover:bg-surface-2 active:scale-95',
          isActive ? 'bg-accent-soft text-accent' : 'text-fg',
        )
      }
    >
      <Bell className="size-5" />
      {badge}
    </NavLink>
  );
}
