import { Suspense, createContext, useContext, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { ChevronLeft, Crown } from 'lucide-react';
import { Logo } from '../../components/Logo';
import { BottomNav, DesktopNav, OfflineBar } from '../../components/Shell';
import { Card, ListRow, RowIcon, TopLoader, cx } from '../../components/ui';
import { displayName, useAuth } from '../../lib/auth';
import { useIsPro } from '../../lib/useMode';
import { Count } from './bits';
import { SECTIONS, sectionPath, type SectionKey } from './sections';

/** Cuántas cosas esperan en cada sección (avisos del Resumen, reportes abiertos, reportes de insignias). */
export type ConsoleBadges = Partial<Record<SectionKey, number>>;

const BadgesContext = createContext<ConsoleBadges>({});

/** Los números de las secciones (el menú de la izquierda y la lista de la consola en el teléfono). */
export const useConsoleBadges = () => useContext(BadgesContext);

/** A dónde vuelve la consola: Organizar en Pro (la consola es parte de esa pestaña) y Hoy en Lite. */
export function useConsoleBack(): { to: string; label: string } {
  return useIsPro() ? { to: '/organizar', label: 'Organizar' } : { to: '/', label: 'Hoy' };
}

const avisos = (n: number) => `${n} ${n === 1 ? 'aviso' : 'avisos'}`;

/**
 * Marco de la consola del dueño de la app, como el resto de la app: en el teléfono sin barra de arriba (cada pantalla
 * trae «‹ Consola» y su título) y con la barra de abajo (Hoy · Ligas · Organizar · Yo); en la computadora, arriba el
 * logo y las secciones de la app, y a la izquierda el menú de la consola (≥ 1024 px). En el teléfono, las secciones
 * son una lista en el Resumen (SectionList). Más ancho que el resto (hasta ~1240 px) para que quepan las tablas.
 */
export function ConsoleShell({ section, badges, children }: { section: SectionKey; badges?: ConsoleBadges; children: ReactNode }) {
  const location = useLocation();
  return (
    <BadgesContext.Provider value={badges ?? {}}>
      <div className="min-h-dvh pb-[calc(6rem+env(safe-area-inset-bottom))] max-sm:pt-[env(safe-area-inset-top)] sm:pb-10">
        <div className="pt-safe sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur max-sm:hidden">
          <header className="mx-auto flex h-14 max-w-[1240px] items-center gap-2 px-4">
            <Link to="/" className="-ml-1.5 flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2" aria-label="MatchMate: Hoy" title="Hoy">
              <Logo />
            </Link>
            <Link to="/superadmin" className="flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 font-semibold hover:bg-surface-2">
              <Crown className="size-4 shrink-0 text-accent" aria-hidden="true" />
              <span className="truncate">Consola</span>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <DesktopNav />
            </div>
          </header>
        </div>
        <OfflineBar />

        <div className="mx-auto flex max-w-[1240px] gap-8 px-4 pt-1 sm:pt-5">
          <aside className="hidden w-60 shrink-0 lg:block">
            <ConsoleNav section={section} badges={badges ?? {}} />
          </aside>
          <main className="min-w-0 flex-1 px-2 lg:px-0">
            <Suspense fallback={<TopLoader />}>
              <div key={location.pathname} className="animate-fade-up flex flex-col gap-6">
                {children}
              </div>
            </Suspense>
          </main>
        </div>
        <BottomNav />
      </div>
    </BadgesContext.Provider>
  );
}

/** El menú de la izquierda en la computadora: las secciones con su número, y abajo a dónde volver. */
function ConsoleNav({ section, badges }: { section: SectionKey; badges: ConsoleBadges }) {
  const auth = useAuth();
  const back = useConsoleBack();
  return (
    <nav aria-label="Secciones de la consola" className="sticky top-20 flex flex-col gap-0.5">
      {SECTIONS.map(({ key, label, icon: Icon }) => {
        const active = key === section;
        const badge = badges[key];
        return (
          <Link
            key={key}
            to={sectionPath(key)}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-[550] transition',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
              active ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
            )}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate">{label}</span>
            {!!badge && <Count n={badge} label={avisos(badge)} />}
          </Link>
        );
      })}
      <div className="mt-4 border-t border-line pt-3">
        <Link to={back.to} className="flex h-11 items-center gap-2 rounded-xl px-2 text-[15px] font-[550] text-accent transition hover:bg-surface-2">
          <ChevronLeft className="size-5" aria-hidden="true" />
          {back.label}
        </Link>
        <p className="mt-1 truncate px-3 text-[13px] text-muted" title={auth.user?.email ?? undefined}>
          Superadmin: {displayName(auth)}
        </p>
      </div>
    </nav>
  );
}

/**
 * Las secciones de la consola como lista (en el teléfono y la tableta, en el Resumen; en la computadora está el menú de
 * la izquierda), con su línea corta y el número de lo que espera.
 */
export function SectionList({ className }: { className?: string }) {
  const badges = useConsoleBadges();
  return (
    <section aria-labelledby="mm-console-sections" className={cx('lg:hidden', className)}>
      <h2 id="mm-console-sections" className="mx-1 mb-3 text-section">
        Secciones
      </h2>
      <Card className="overflow-hidden">
        {SECTIONS.filter((s) => s.key !== 'resumen').map(({ key, label, hint, icon: Icon }) => {
          const badge = badges[key];
          return (
            <ListRow
              key={key}
              dense
              leading={
                <RowIcon>
                  <Icon className="size-5" />
                </RowIcon>
              }
              title={label}
              subtitle={hint}
              to={sectionPath(key)}
              ariaLabel={badge ? `${label}: ${avisos(badge)}` : undefined}
              trailing={badge ? <Count n={badge} /> : undefined}
            />
          );
        })}
      </Card>
    </section>
  );
}
