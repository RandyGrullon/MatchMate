import { Suspense, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ArrowLeft, Crown, RefreshCw } from 'lucide-react';
import { Brand, OfflineBar, TopActions } from '../../components/Shell';
import { Button, Select, TopLoader, cx } from '../../components/ui';
import { displayName, useAuth } from '../../lib/auth';
import { SECTIONS, sectionMeta, sectionPath, type SectionKey } from './sections';
import { refreshAll } from './hooks';

/**
 * Marco de la consola del dueño de la app: barra de arriba (marca, «Consola», actualizar, avisos y cuenta),
 * menú de secciones a la izquierda en la computadora (≥ 1024 px) y un selector arriba en el teléfono.
 * Más ancho que el resto de la app (hasta ~1200 px) para que quepan las tablas.
 */
export function ConsoleShell({ section, badges, children }: { section: SectionKey; badges?: Partial<Record<SectionKey, number>>; children: ReactNode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const current = sectionMeta(section);
  return (
    <div className="min-h-dvh pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="pt-safe sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
        <header className="mx-auto flex h-14 max-w-[1240px] items-center gap-2 px-4">
          <Link
            to="/"
            aria-label="Volver a la app"
            title="Volver a la app"
            className="-ml-1.5 flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg lg:hidden"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <Brand compact />
          <span className="text-line" aria-hidden="true">
            /
          </span>
          <Link to="/superadmin" className="flex min-w-0 items-center gap-1.5 font-semibold">
            <Crown className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <span className="truncate">Consola</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" icon={<RefreshCw className="size-4" />} onClick={refreshAll} aria-label="Actualizar los datos" title="Actualizar los datos" className="max-md:size-11 max-md:px-0">
              <span className="hidden md:inline">Actualizar</span>
            </Button>
            <TopActions />
          </div>
        </header>
      </div>
      <OfflineBar />

      <div className="mx-auto flex max-w-[1240px] gap-6 px-4 py-5">
        {/* Computadora: menú fijo a la izquierda. */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav aria-label="Secciones de la consola" className="sticky top-20 flex flex-col gap-0.5">
            {SECTIONS.map(({ key, label, icon: Icon }) => {
              const active = key === section;
              const badge = badges?.[key];
              return (
                <Link
                  key={key}
                  to={sectionPath(key)}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex h-10 items-center gap-2.5 rounded-xl px-3 text-sm font-medium transition',
                    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
                    active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 truncate">{label}</span>
                  {!!badge && (
                    <span className="rounded-full bg-warn-soft px-1.5 text-[11px] leading-5 font-semibold text-warn tabular-nums" aria-label={`${badge} avisos`}>
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
            <div className="mt-4 border-t border-line pt-4">
              <Link to="/" className="flex h-10 items-center gap-2.5 rounded-xl px-3 text-sm text-muted transition hover:bg-surface-2 hover:text-fg">
                <ArrowLeft className="size-4" aria-hidden="true" />
                Volver a la app
              </Link>
              <p className="mt-2 truncate px-3 text-xs text-muted" title={auth.user?.email ?? undefined}>
                Superadmin: {displayName(auth)}
              </p>
            </div>
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          {/* Teléfono y tableta: selector de sección arriba. */}
          <label className="mb-4 flex items-center gap-2 lg:hidden">
            <span className="sr-only">Sección de la consola</span>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
              <current.icon className="size-5" />
            </span>
            <Select
              value={section}
              onChange={(e) => navigate({ pathname: sectionPath(e.target.value as SectionKey) })}
              className="h-11 font-medium"
              aria-label="Sección de la consola"
            >
              {SECTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                  {badges?.[s.key] ? ` (${badges[s.key]} avisos)` : ''}
                </option>
              ))}
            </Select>
          </label>
          <Suspense fallback={<TopLoader />}>
            <div key={location.pathname} className="animate-fade-up flex flex-col gap-5">
              {children}
            </div>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
