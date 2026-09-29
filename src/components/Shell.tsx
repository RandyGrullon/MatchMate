import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { CalendarDays, House, Info, LogIn, MessageCircle, Plus, Settings, UserRound, WifiOff, type LucideIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { backendMode } from '../lib/backend';
import { homeTarget, setActiveSport, useActiveSport } from '../lib/sportContext';
import { SPORTS } from '../sports/registry';
import { Logo } from './Logo';
import { OutboxIndicator } from './OutboxIndicator';
import { useCreateMenu } from './CreateMenu';
import { NotificationsBell } from './Notifications';
import { SportChip } from './SportSwitcher';
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
      <WifiOff className="size-4" /> Sin conexión: lo que anotes se guarda y se envía solo al volver.
    </div>
  );
}

/** Modo local (PGlite en el navegador, sin Supabase): solo desarrollo y demo. */
const local = backendMode() === 'local';

const LocalBadge = () => <span className="rounded bg-warn-soft px-1.5 text-[11px] font-medium text-warn">LOCAL</span>;

export function Brand({ to = '/', compact, className }: { to?: string; compact?: boolean; className?: string }) {
  return (
    <Link to={to} className={cx('flex shrink-0 items-center gap-2 font-semibold', className)} aria-label="MatchMate">
      <Logo />
      {!compact && <span>MatchMate</span>}
      {local && <LocalBadge />}
    </Link>
  );
}

/** Arriba a la derecha: campana de avisos y configuración de la cuenta (o "Entrar"). */
export function TopActions() {
  const { user } = useAuth();
  const login = useLoginLink();
  if (!user) {
    return (
      <Link to={login} className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-surface-2 sm:h-9">
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
          cx(
            'inline-flex size-11 items-center justify-center rounded-xl transition hover:bg-surface-2 active:scale-95 sm:size-9',
            isActive ? 'text-accent' : 'text-fg',
          )
        }
      >
        <Settings className="size-5" />
      </NavLink>
    </div>
  );
}

/** Secciones de la app (abajo en el celular, arriba en la computadora). */
export interface SectionDef {
  key: 'home' | 'events' | 'profile' | 'contact' | 'about';
  to: string;
  label: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
}

// Home: el general (/) y el de cada deporte (/d/:sport).
const HOME: SectionDef = { key: 'home', to: '/', label: 'Home', icon: House, match: (p) => p === '/' || p.startsWith('/d/') };
// Eventos = tus ligas y las públicas; dentro de una liga se sigue en Eventos.
const EVENTS: SectionDef = {
  key: 'events',
  to: '/ligas',
  label: 'Eventos',
  icon: CalendarDays,
  match: (p) => p.startsWith('/ligas') || p.startsWith('/l/') || p.startsWith('/unirse'),
};
const PROFILE: SectionDef = { key: 'profile', to: '/perfil', label: 'Perfil', icon: UserRound, match: (p) => p.startsWith('/perfil') };
// Sin cuenta, Eventos y Perfil no dicen mucho: en su lugar, cómo escribirnos y qué es MatchMate.
const CONTACT: SectionDef = { key: 'contact', to: '/contacto', label: 'Contáctanos', icon: MessageCircle, match: (p) => p.startsWith('/contacto') };
const ABOUT: SectionDef = { key: 'about', to: '/acerca', label: 'Acerca de', icon: Info, match: (p) => p.startsWith('/acerca') };

/**
 * Las tres secciones, en orden: con cuenta Home · Eventos · Perfil; sin cuenta Home · Contáctanos · Acerca de. Las
 * ligas públicas se siguen viendo sin cuenta desde el Home.
 */
export function navSections(signedIn: boolean): readonly [SectionDef, SectionDef, SectionDef] {
  return signedIn ? [HOME, EVENTS, PROFILE] : [HOME, CONTACT, ABOUT];
}

/** Secciones de quien usa la app. Mientras se lee la sesión guardada se quedan las de con cuenta (no parpadean). */
function useSections() {
  const { user, loading } = useAuth();
  return navSections(!!user || loading);
}

function useSection(sections: readonly SectionDef[]) {
  const { pathname } = useLocation();
  return sections.find((s) => s.match(pathname))?.key ?? null;
}

/** «Entrar» con la pantalla actual como `next`: al entrar (o crear la cuenta) vuelve aquí. */
function useLoginLink() {
  const location = useLocation();
  return `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
}

/**
 * A dónde va cada sección. Home: en un deporte, a su Home; si ya estás en su Home, al de todos los deportes (y la app
 * deja de estar en ese deporte). Ver homeTarget en src/lib/sportContext.ts.
 */
function useSectionLink(section: SectionDef): { to: string; onClick?: () => void; label: string } {
  const { pathname } = useLocation();
  const active = useActiveSport();
  if (section.key !== 'home') return { to: section.to, label: section.label };
  const target = homeTarget(pathname, active);
  return {
    to: target.to,
    onClick: target.clear ? () => setActiveSport(null) : undefined,
    label: target.clear ? 'Home de todos los deportes' : active ? `Home de ${SPORTS[active].lower}` : 'Home',
  };
}

function DesktopLink({ section, current }: { section: SectionDef; current: boolean }) {
  const { to, onClick, label } = useSectionLink(section);
  const Icon = section.icon;
  const hint = label !== section.label ? label : undefined;
  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={current ? 'page' : undefined}
      aria-label={hint}
      title={hint}
      className={cx(
        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
        current ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      <Icon className="size-4" />
      {section.label}
    </Link>
  );
}

/** Arriba en la computadora: Crear · Home · Eventos · Perfil (sin cuenta: Crear · Home · Contáctanos · Acerca de). */
export function DesktopNav() {
  const sections = useSections();
  const active = useSection(sections);
  const create = useCreateMenu();
  return (
    <nav className="hidden gap-1 sm:flex" aria-label="Secciones" data-tour="nav">
      <button
        type="button"
        onClick={() => create.openMenu()}
        data-tour="crear"
        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition hover:brightness-110"
      >
        <Plus className="size-4" /> Crear
      </button>
      {sections.map((s) => (
        <DesktopLink key={s.key} section={s} current={active === s.key} />
      ))}
    </nav>
  );
}

function BottomLink({ section, current }: { section: SectionDef; current: boolean }) {
  const { to, onClick, label } = useSectionLink(section);
  const Icon = section.icon;
  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={current ? 'page' : undefined}
      aria-label={label !== section.label ? label : undefined}
      className={cx('flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition', current ? 'text-accent' : 'text-muted')}
    >
      <Icon className="size-5" />
      {section.label}
    </Link>
  );
}

/**
 * Barra de abajo en el teléfono: Home · Eventos · (Crear) · Notificaciones · Perfil. Sin cuenta:
 * Home · Contáctanos · (Crear) · Entrar · Acerca de.
 */
export function BottomNav() {
  const sections = useSections();
  const active = useSection(sections);
  const { user } = useAuth();
  const login = useLoginLink();
  const create = useCreateMenu();
  const [home, second, last] = sections;
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur sm:hidden" aria-label="Secciones" data-tour="nav">
      <div className="grid grid-cols-5 items-end">
        <BottomLink section={home} current={active === home.key} />
        <BottomLink section={second} current={active === second.key} />
        {/* Crear: el círculo del centro, un poco más grande y levantado. */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => create.openMenu()}
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
          <Link to={login} className="flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-muted">
            <LogIn className="size-5" />
            Entrar
          </Link>
        )}
        <BottomLink section={last} current={active === last.key} />
      </div>
    </nav>
  );
}

/**
 * Marco de toda la app: arriba la marca (en la computadora), el deporte en que estás (siempre: toca para cambiar),
 * lo del medio (p. ej. la liga), la campana y la configuración; debajo, opcionalmente, las pestañas de la liga; abajo
 * en el celular: Home · Eventos · Crear · Notificaciones · Perfil (sin cuenta: Home · Contáctanos · Crear · Entrar ·
 * Acerca de).
 */
export function AppFrame({ middle, subnav, children, wide }: { middle?: ReactNode; subnav?: ReactNode; children: ReactNode; wide?: boolean }) {
  const location = useLocation();
  const active = useActiveSport();
  const width = wide ? 'max-w-5xl' : 'max-w-3xl';
  return (
    <div className="min-h-dvh pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-8">
      <div className="pt-safe sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
        <header className={cx('mx-auto flex h-14 items-center gap-2 px-4', width)}>
          {/*
            El logo sale una sola vez: en «Todos los deportes» va dentro del botón del deporte; en un deporte, a su
            lado (dentro de una liga, en el teléfono, no cabe: ahí manda el nombre de la liga).
          */}
          {active && (
            <Link
              to="/"
              onClick={() => setActiveSport(null)}
              className={cx('-ml-1.5 size-11 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2', middle ? 'hidden sm:flex' : 'flex')}
              aria-label="MatchMate: todos los deportes"
              title="Todos los deportes"
            >
              <Logo />
            </Link>
          )}
          <SportChip compact={!!middle} />
          {local && <LocalBadge />}
          {middle}
          <div className="ml-auto flex items-center gap-2">
            <DesktopNav />
            <TopActions />
          </div>
        </header>
        {subnav && <div className={cx('mx-auto px-4 pb-2', width)}>{subnav}</div>}
      </div>
      <OfflineBar />
      <OutboxIndicator />
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
