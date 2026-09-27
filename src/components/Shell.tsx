import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { CalendarDays, House, LogIn, Plus, Settings, UserRound, WifiOff } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { usingEmulators } from '../lib/firebase';
import { Logo } from './Logo';
import { useCreateMenu } from './CreateMenu';
import { NotificationsBell } from './Notifications';
import { TopLoader, cx } from './ui';

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function OfflineBar() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-warn-soft px-4 py-2 text-sm text-warn">
      <WifiOff className="size-4" /> Sin conexión: los cambios se guardan y se sincronizan al volver.
    </div>
  );
}

export function Brand({ to = '/', compact }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="flex shrink-0 items-center gap-2 font-semibold" aria-label="BowlingX">
      <Logo />
      {!compact && <span>BowlingX</span>}
      {usingEmulators && <span className="rounded bg-warn-soft px-1.5 text-[11px] font-medium text-warn">EMULADOR</span>}
    </Link>
  );
}

/** Arriba a la derecha: campana de avisos y configuración de la cuenta (o "Entrar"). */
export function TopActions() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return (
      <Link to={`/login?next=${next}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-surface-2">
        <LogIn className="size-4" /> Entrar
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-1">
      {/* En el teléfono los avisos van en la barra de abajo. */}
      <span className="hidden sm:inline-flex">
        <NotificationsBell />
      </span>
      <NavLink
        to="/cuenta"
        data-tour="config"
        aria-label="Configuración de la cuenta"
        title="Configuración de la cuenta"
        className={({ isActive }) =>
          cx('inline-flex size-9 items-center justify-center rounded-xl transition hover:bg-surface-2 active:scale-95', isActive ? 'text-accent' : 'text-fg')
        }
      >
        <Settings className="size-5" />
      </NavLink>
    </div>
  );
}

/** Secciones de la app (abajo en el celular, arriba en la computadora). */
const SECTIONS = [
  { to: '/', label: 'Home', icon: House, match: (p: string) => p === '/' },
  // Eventos = tus ligas y las públicas; dentro de una liga se sigue en Eventos.
  { to: '/ligas', label: 'Eventos', icon: CalendarDays, match: (p: string) => p.startsWith('/ligas') || p.startsWith('/l/') || p.startsWith('/unirse') },
  { to: '/perfil', label: 'Perfil', icon: UserRound, match: (p: string) => p.startsWith('/perfil') },
];

function useSection() {
  const { pathname } = useLocation();
  return SECTIONS.find((s) => s.match(pathname))?.to ?? null;
}

function DesktopNav() {
  const active = useSection();
  const create = useCreateMenu();
  return (
    <nav className="hidden gap-1 sm:flex" aria-label="Secciones" data-tour="nav">
      <button
        type="button"
        onClick={create.openMenu}
        data-tour="crear"
        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition hover:brightness-110"
      >
        <Plus className="size-4" /> Crear
      </button>
      {SECTIONS.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          aria-current={active === to ? 'page' : undefined}
          className={cx(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
            active === to ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Barra de abajo en el teléfono: Home · Eventos · (Crear) · Notificaciones · Perfil. */
function BottomNav() {
  const active = useSection();
  const { user } = useAuth();
  const create = useCreateMenu();
  const link = ({ to, label, icon: Icon }: (typeof SECTIONS)[number]) => (
    <Link
      key={to}
      to={to}
      aria-current={active === to ? 'page' : undefined}
      className={cx('flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition', active === to ? 'text-accent' : 'text-muted')}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
  const [home, events, profile] = SECTIONS;
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur sm:hidden" aria-label="Secciones" data-tour="nav">
      <div className="grid grid-cols-5 items-end">
        {link(home)}
        {link(events)}
        {/* Crear: el círculo del centro, un poco más grande y levantado. */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={create.openMenu}
            data-tour="crear"
            aria-label="Crear una liga o un torneo, o unirme con un código"
            className="-mt-6 mb-1.5 flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg ring-4 ring-bg transition active:scale-95"
          >
            <Plus className="size-7" strokeWidth={2.5} />
          </button>
        </div>
        {user ? (
          <NotificationsBell variant="nav" />
        ) : (
          <Link to="/login" className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted">
            <LogIn className="size-5" />
            Entrar
          </Link>
        )}
        {link(profile)}
      </div>
    </nav>
  );
}

/**
 * Marco de toda la app: arriba la marca, lo del medio (p. ej. la liga), la campana y la configuración;
 * debajo, opcionalmente, las pestañas de la liga; abajo en el celular: Home · Eventos · Perfil.
 */
export function AppFrame({ middle, subnav, children, wide }: { middle?: ReactNode; subnav?: ReactNode; children: ReactNode; wide?: boolean }) {
  const location = useLocation();
  const width = wide ? 'max-w-5xl' : 'max-w-3xl';
  return (
    <div className="min-h-dvh pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-8">
      <div className="pt-safe sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
        <header className={cx('mx-auto flex h-14 items-center gap-2 px-4', width)}>
          <Brand compact={!!middle} />
          {middle}
          <div className="ml-auto flex items-center gap-2">
            <DesktopNav />
            <TopActions />
          </div>
        </header>
        {subnav && <div className={cx('mx-auto px-4 pb-2', width)}>{subnav}</div>}
      </div>
      <OfflineBar />
      <main className={cx('mx-auto px-4 py-5', width)}>
        <Suspense fallback={<TopLoader />}>
          {/* key = ruta: cada pantalla entra con una transición suave */}
          <div key={location.pathname} className="animate-fade-up">
            {children}
          </div>
        </Suspense>
      </main>
      <BottomNav />
    </div>
  );
}

/** Pantallas fuera de una liga (Home, Eventos, Perfil, cuenta, unirse, superadmin). */
export function AppShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <AppFrame wide={wide}>{children}</AppFrame>;
}
