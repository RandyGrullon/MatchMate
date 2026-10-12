import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { House, Info, LogIn, MessageCircle, MessagesSquare, Settings, Trophy, UserRound, WifiOff, type LucideIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { backendMode } from '../lib/backend';
import { useLeaguesByIds } from '../lib/data/leagues';
import { useMyMemberships } from '../lib/data/members';
import { setActiveSport, useActiveSport } from '../lib/sportContext';
import { sportsOf } from '../sports/registry';
import type { SportId } from '../sports/types';
import { Logo } from './Logo';
import { NoticeSlot } from './NoticeSlot';
import { NotificationsBell } from './Notifications';
import { SearchButton } from './social/SearchButton';
import { ModeSheetHost } from './mode/ModeSheetHost';
import { ModeToast } from './mode/ModeToast';
import { OutboxIndicator } from './OutboxIndicator';
import { SportChip } from './SportSwitcher';
import { SportTint, sportTint } from './home/SportTint';
import { TopLoader, cx } from './ui';
import { PullToRefresh } from './PullToRefresh';

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

/**
 * Arriba a la derecha en la consola del superadmin (ConsoleShell): la campana de avisos (en la computadora) y la
 * configuración de la cuenta, o «Entrar». En la app, la campana va en Hoy y el engranaje en Yo.
 */
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
      <span className="hidden sm:inline-flex">
        <NotificationsBell />
      </span>
      <NavLink
        to="/cuenta"
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
  key: 'home' | 'social' | 'leagues' | 'me' | 'contact' | 'about' | 'login';
  to: string;
  label: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
}

const under = (p: string, ...roots: string[]) => roots.some((r) => p === r || p.startsWith(`${r}/`));

// Hoy: el único inicio (y el de cada deporte, /d/:sport, mientras exista); la campana de Hoy lleva a /avisos.
const HOY: SectionDef = { key: 'home', to: '/', label: 'Hoy', icon: House, match: (p) => p === '/' || under(p, '/d', '/avisos') };
// Social: el feed de publicaciones, cada publicación (/p/:id), la lupa (/buscar: personas con cuenta y ligas) y el
// perfil de otra cuenta (/u/:id).
const SOCIAL: SectionDef = {
  key: 'social',
  to: '/social',
  label: 'Social',
  icon: MessagesSquare,
  match: (p) => under(p, '/social', '/p', '/buscar', '/u'),
};
// Ligas: tus ligas y torneos, las públicas, tus equipos (/equipos) y todo lo de adentro de una liga (menos su
// Organizar). Esports (sus juegos, equipos, torneos e IDs de juego) también es de Ligas.
const LIGAS: SectionDef = {
  key: 'leagues',
  to: '/ligas',
  label: 'Ligas',
  icon: Trophy,
  match: (p) => under(p, '/ligas', '/l', '/unirse', '/anotar', '/agenda', '/invitacion', '/esports', '/equipos'),
};
// El Organizar de una liga (`/l/:lid/admin`): es de Yo, como Organizar, aunque la ruta esté dentro de la liga.
const leagueAdmin = (p: string) => /^\/l\/[^/]+\/admin(\/|$)/.test(p);
// Yo: tu perfil, tus bolas y juegos sueltos y la configuración (el engranaje de Yo). Desde la configuración se llega a
// Organizar (`/organizar` y el de cada liga) y a la consola del dueño de la app (`/superadmin`): también son de Yo.
// Buscar es de Social.
const YO: SectionDef = {
  key: 'me',
  to: '/perfil',
  label: 'Yo',
  icon: UserRound,
  match: (p) => under(p, '/perfil', '/cuenta', '/bolas', '/juegos-sueltos', '/organizar', '/superadmin') || leagueAdmin(p),
};
// Sin cuenta: la portada, cómo escribirnos, qué es MatchMate y entrar.
const INICIO: SectionDef = { key: 'home', to: '/', label: 'Inicio', icon: House, match: (p) => p === '/' || under(p, '/d') };
const CONTACT: SectionDef = { key: 'contact', to: '/contacto', label: 'Contáctanos', icon: MessageCircle, match: (p) => under(p, '/contacto') };
const ABOUT: SectionDef = { key: 'about', to: '/acerca', label: 'Acerca de', icon: Info, match: (p) => under(p, '/acerca') };
const ENTRAR: SectionDef = { key: 'login', to: '/login', label: 'Entrar', icon: LogIn, match: (p) => under(p, '/login') };

/**
 * Las secciones, en orden. Con cuenta (Lite y Pro): Hoy · Social · Ligas · Yo; Organizar ya no va en la barra (está en
 * Yo › Configuración). Sin cuenta: Inicio · Contáctanos · Acerca de · Entrar (las ligas públicas se ven desde la portada
 * y la lupa). Tampoco hay botón de crear en la barra (está en Ligas › «Crear o unirme») ni pestaña de avisos (es la
 * campana de Hoy).
 */
export function navSections(signedIn: boolean): SectionDef[] {
  return signedIn ? [HOY, SOCIAL, LIGAS, YO] : [INICIO, CONTACT, ABOUT, ENTRAR];
}

/** La sección marcada en esa ruta. Yo gana a Ligas en el Organizar de una liga (`/l/:lid/admin`). */
export function currentSection(sections: readonly SectionDef[], pathname: string): SectionDef['key'] | null {
  const me = sections.find((s) => s.key === 'me');
  if (me?.match(pathname)) return me.key;
  return sections.find((s) => s.match(pathname))?.key ?? null;
}

/**
 * ¿Va el selector de deporte arriba (en la computadora)? Solo si la cuenta juega más de un deporte, o si la app quedó en
 * un deporte que no es el suyo (para poder salir). Quien juega uno solo no lo ve: los otros deportes siguen en Ligas
 * (las públicas). En el teléfono no sale nunca: si juega varios, elige con los chips de Ligas.
 */
export function showSportSwitcher(mine: readonly string[], active: SportId | null): boolean {
  return mine.length > 1 || (!!active && !mine.includes(active));
}

/**
 * El color de las pantallas de fuera de una liga (Hoy, Ligas, Yo, Organizar…): siempre el de tu deporte (el boliche si
 * lo juegas; si no, el primero de los tuyos), aunque la app haya quedado en otro al entrar a una liga de pádel o al
 * elegirlo arriba. Así Hoy no se pinta del último deporte que se vio y tiene un solo acento (su tarjeta del boliche y la
 * barra, del mismo color). null = el de la app ya es ese (o no juegas ninguno).
 */
export function ownSportTint(mine: readonly string[], active: SportId | null): string | null {
  if (!mine.length) return null;
  const own = mine.includes('bowling') ? 'bowling' : mine[0];
  // Sin deporte elegido la app va en el color de siempre, que es el del boliche.
  return active === own || (!active && own === 'bowling') ? null : own;
}

/** ¿Va la pantalla en el color de tu deporte? Las de fuera de una liga (adentro, el de la liga; en `/d/:sport`, ese). */
export const usesOwnTint = (pathname: string) => !pathname.startsWith('/l/') && !pathname.startsWith('/d/');

/** ¿Va el selector de deporte arriba? y, para Hoy, el color de tu deporte (ownSportTint). */
function useSportBar(): { switcher: boolean; own: string | null } {
  const { user, loading } = useAuth();
  const active = useActiveSport();
  const members = useMyMemberships(user?.uid);
  const leagues = useLeaguesByIds(members.data.map((m) => m.leagueId));
  // Mientras se leen la sesión y las ligas no sale (si después hacía falta, aparece; nunca sale y se va).
  if (loading || (user && (members.loading || leagues.loading))) return { switcher: false, own: null };
  const mine = sportsOf(leagues.data);
  return { switcher: showSportSwitcher(mine, active), own: ownSportTint(mine, active) };
}

/** Las secciones de quien usa la app. Mientras se lee la sesión guardada se quedan las de con cuenta (no parpadean). */
function useSections() {
  const { user, loading } = useAuth();
  return navSections(!!user || loading);
}

/** «Entrar» con la pantalla actual como `next`: al entrar (o crear la cuenta) vuelve aquí. */
function useLoginLink() {
  const location = useLocation();
  return `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
}

/** A dónde lleva cada sección y si es la de la pantalla. */
function useNavItems() {
  const sections = useSections();
  const { pathname } = useLocation();
  const login = useLoginLink();
  const current = currentSection(sections, pathname);
  return sections.map((s) => ({ section: s, to: s.key === 'login' ? login : s.to, current: current === s.key }));
}

/** Arriba en la computadora: las mismas secciones de la barra de abajo, con su ícono y su nombre. */
export function DesktopNav() {
  const items = useNavItems();
  return (
    <nav className="hidden gap-1 sm:flex" aria-label="Secciones">
      {items.map(({ section: s, to, current }) => {
        const Icon = s.icon;
        return (
          <Link
            key={s.key}
            to={to}
            aria-current={current ? 'page' : undefined}
            className={cx(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
              current ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span>{s.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Un destino de la barra de abajo: ícono y nombre, siempre. El elegido lleva una pastilla en acento suave detrás del
 * ícono (60 × 32) y el nombre en el color del texto.
 */
function BottomLink({ section, to, current }: { section: SectionDef; to: string; current: boolean }) {
  const Icon = section.icon;
  return (
    <Link
      to={to}
      aria-current={current ? 'page' : undefined}
      className={cx(
        'flex min-h-15 min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl text-xs font-semibold transition-colors active:opacity-70',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
        current ? 'text-fg' : 'text-muted',
      )}
    >
      {/* 60 px de ancho; en un teléfono muy angosto se achica para no salirse. */}
      <span className={cx('grid h-8 w-15 max-w-full shrink-0 place-items-center rounded-2xl transition-colors', current && 'bg-accent-soft text-accent')}>
        <Icon aria-hidden="true" className="size-[22px]" strokeWidth={current ? 2.2 : 2} />
      </span>
      <span className="max-w-full truncate leading-4">{section.label}</span>
    </Link>
  );
}

/**
 * Barra de abajo en el teléfono: Hoy · Social · Ligas · Yo (en Lite y en Pro; Organizar está en Yo › Configuración).
 * Sin cuenta: Inicio · Contáctanos · Acerca de · Entrar. Sin botón del centro: crear está en Ligas.
 */
export function BottomNav() {
  const items = useNavItems();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/[0.93] backdrop-blur-lg sm:hidden" aria-label="Secciones">
      {/* En el teléfono no siempre hay barra arriba: la marca de la copia local (solo desarrollo) va sobre esta. */}
      {local && (
        <span aria-hidden="true" className="pointer-events-none absolute -top-2.5 left-2">
          <LocalBadge />
        </span>
      )}
      {/* Con la barrita del iPhone abajo, los nombres quedan justo encima de ella (como en el diseño: 86 px en total). */}
      <div className="mx-auto flex max-w-lg px-3 pt-2 pb-[max(0.5rem,calc(env(safe-area-inset-bottom)-1rem))]">
        {items.map(({ section, to, current }) => (
          <BottomLink key={section.key} section={section} to={to} current={current} />
        ))}
      </div>
    </nav>
  );
}

/**
 * Marco de toda la app. En el teléfono no hay barra de arriba: cada pantalla trae su título (Hoy con la lupa y la
 * campana, Ligas con la lupa, Yo con el engranaje). Solo sale si hay algo que poner: dentro de una liga (`middle`: su
 * nombre; `subnav`: sus pestañas), y entonces con la lupa. En la computadora, arriba la marca, el selector de deporte de
 * quien juega más de uno, la lupa (también sin cuenta: busca ligas) y las secciones. Debajo, el lugar del aviso
 * (NoticeSlot) para las pantallas que no ponen el suyo; abajo en el teléfono, la barra de secciones.
 */
export function AppFrame({ middle, subnav, children, wide }: { middle?: ReactNode; subnav?: ReactNode; children: ReactNode; wide?: boolean }) {
  const location = useLocation();
  const active = useActiveSport();
  const { switcher: sportSwitcher, own } = useSportBar();
  // Fuera de una liga, el color de tu deporte aunque la app haya quedado en otro (un solo acento en la pantalla; en la
  // computadora, «Pádel ▾» arriba sigue en el suyo, para volver).
  const tint = sportTint(usesOwnTint(location.pathname) ? own : null);
  const width = wide ? 'max-w-5xl' : 'max-w-3xl';
  // En el teléfono la barra de arriba sale solo con algo de la pantalla (`middle`, `subnav`): el selector de deporte no
  // va (quien juega varios elige con los chips de Ligas).
  const mobileHeader = !!middle || !!subnav;
  // El logo: con el selector, solo estando en un deporte (sin deporte el logo va dentro del selector); sin él, siempre
  // en la computadora. En el teléfono, dentro de una liga, no cabe: ahí manda el nombre de la liga.
  const logo = sportSwitcher ? !!active : true;
  return (
    <div
      className={cx(tint.className, 'min-h-dvh pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-8', !mobileHeader && 'max-sm:pt-[env(safe-area-inset-top)]')}
    >
      {/* Deslizar hacia abajo arriba de todo vuelve a leer lo de la pantalla (en todas las pantallas de la app). */}
      <PullToRefresh />
      {tint.css && (
        <style href={tint.className} precedence="default">
          {tint.css}
        </style>
      )}
      <div className={cx('pt-safe sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur', !mobileHeader && 'max-sm:hidden')}>
        <header className={cx('mx-auto flex h-14 items-center gap-2 px-4', width)}>
          {logo && (
            <Link
              to="/"
              onClick={() => setActiveSport(null)}
              className="-ml-1.5 hidden size-11 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2 sm:flex"
              aria-label="MatchMate: Hoy"
              title="Hoy"
            >
              <Logo />
            </Link>
          )}
          {sportSwitcher && (
            <div className="contents max-sm:hidden">
              {tint.className ? (
                <SportTint sport={active} className="contents">
                  <SportChip compact={!!middle} />
                </SportTint>
              ) : (
                <SportChip compact={!!middle} />
              )}
            </div>
          )}
          {/* En el teléfono la marca de la copia local va sobre la barra de abajo. */}
          {local && (
            <span className="max-sm:hidden">
              <LocalBadge />
            </span>
          )}
          {middle}
          <div className="ml-auto flex items-center gap-2">
            {/* La lupa (personas con cuenta y ligas), siempre a mano; en el teléfono, cuando esta barra sale. */}
            <SearchButton flat />
            <DesktopNav />
          </div>
        </header>
        {subnav && <div className={cx('mx-auto px-4 pb-2', width)}>{subnav}</div>}
      </div>
      <OfflineBar />
      <OutboxIndicator />
      {/*
        El aviso de la pantalla (instalar, permitir avisos, sugerir Pro…), si ella no pone su propio NoticeSlot: este se
        monta antes que el de la pantalla, así que si ella tiene uno, gana el de ella y aquí no sale nada.
      */}
      <NoticeSlot className={cx('mx-4 mt-4 sm:mx-auto sm:w-[calc(100%-2rem)]', wide ? 'sm:max-w-[62rem]' : 'sm:max-w-[46rem]')} />
      <main className={cx('mx-auto px-4 py-5', width)}>
        <Suspense fallback={<TopLoader />}>
          {/* key = ruta: cada pantalla entra con una transición suave */}
          <div key={location.pathname} className="animate-fade-up">
            {children}
          </div>
        </Suspense>
      </main>
      <BottomNav />
      {/* «Modo Pro activado · Deshacer» al cambiar de modo (sigue a la vista aunque cambie la pantalla). */}
      <ModeToast />
      {/* «Elige cómo ver la app» la primera vez que se toca «Pro» (Yo, «Probar Pro»). */}
      <ModeSheetHost />
    </div>
  );
}

/** Pantallas fuera de una liga (Hoy, Social, Ligas, Yo, cuenta, unirse, superadmin). */
export function AppShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <AppFrame wide={wide}>{children}</AppFrame>;
}
