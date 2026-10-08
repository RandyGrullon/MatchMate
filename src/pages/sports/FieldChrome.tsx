import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronDown, Plus, Zap } from 'lucide-react';
import type { ScorerTarget } from '../../lib/data/scorers';
import type { ReportButtonProps } from '../../components/tournamentReport/ReportButton';
import { useBusy } from '../../components/busy';
import { useSwitchMode } from '../../components/mode';
import { Card, cx, sectionLinkClass } from '../../components/ui';

/**
 * Piezas del rediseño «Calma y foco» que comparten las pantallas de los deportes que se anotan fuera de un partido (el
 * golf y la natación): la línea «Esto es de Pro · Usar Pro», el «Nuevo» de la derecha de una sección, la lista que
 * muestra unas pocas filas con «Ver todas», la tarjeta de «no hay nada» con su único botón y las hojas de «•••»
 * (Anotadores y Reporte), que se bajan al tocarlas con la ruedita en su fila mientras llegan.
 */

/**
 * Fijo abajo, encima de la barra de la app del teléfono (77 px, y lo que pase de 16 px la barrita del iPhone): «Hoyo
 * listo», «Publicar serie». En la computadora no hay barra abajo.
 */
export const STICKY_ABOVE_NAV = 'sticky bottom-[calc(5rem+max(0px,env(safe-area-inset-bottom)-1rem))] z-20 sm:bottom-3';

/** «Esto es de Pro · Usar Pro»: lo de Pro abierto en Lite (con un link de Pro), en una línea con contorno. */
export function ProLine({ text = 'Esto es de Pro', className }: { text?: string; className?: string }) {
  const switchMode = useSwitchMode();
  return (
    <p className={cx('flex items-center gap-3 rounded-[20px] py-1 pr-1 pl-4 text-meta shadow-[inset_0_0_0_1px_var(--line)]', className)}>
      <span className="min-w-0 flex-1 font-semibold">{text}</span>
      <button
        type="button"
        onClick={() => void switchMode('pro')}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 font-[650] text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Zap aria-hidden="true" className="size-4" />
        Usar Pro
      </button>
    </p>
  );
}

/** «+ Nuevo» a la derecha de un título de sección (en el color del deporte, 44 px para el dedo). */
export function SectionAdd({ label = 'Nuevo', onClick, disabled }: { label?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-haspopup="dialog" className={cx(sectionLinkClass, 'disabled:opacity-50')}>
      <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2.4} />
      {label}
    </button>
  );
}

/** Link de la derecha de un título de sección («Ver todas ›»). */
export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={sectionLinkClass}>
      {children}
    </Link>
  );
}

/**
 * Las primeras `max` filas y, si hay más, «Ver las 8» debajo (las demás se abren ahí mismo, sin cambiar de pantalla).
 * `render` dibuja la lista (dentro de su Card).
 */
export function ShowMore<T>({ items, max = 3, noun, render }: { items: readonly T[]; max?: number; noun: string; render: (shown: readonly T[]) => ReactNode }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, max);
  return (
    <>
      {render(shown)}
      {items.length > max && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          aria-expanded={all}
          className="mx-auto mt-1 flex min-h-11 items-center gap-1 px-3 text-meta font-[550] text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          {all ? 'Ver menos' : `Ver ${items.length === 1 ? 'la otra' : `las ${items.length}`} ${noun}`}
          <ChevronDown aria-hidden="true" className={cx('size-4 transition', all && 'rotate-180')} />
        </button>
      )}
    </>
  );
}

/**
 * Tarjeta de «no hay nada todavía»: qué pasa en una frase y, si hay algo que hacer, UN botón (el principal de la
 * pantalla).
 */
export function EmptyCard({ icon, title, text, action, className }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <Card className={cx('flex flex-col items-stretch gap-4 p-5', className)}>
      <div className="flex items-start gap-3.5">
        {icon && (
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg-2">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[17px] leading-[1.35] font-[650] tracking-[-0.01em]">{title}</p>
          {text && <p className="mt-1 text-meta text-muted">{text}</p>}
        </div>
      </div>
      {action}
    </Card>
  );
}

// ---------- Hojas de «•••» que se bajan al tocarlas ----------

const loadScorers = () => import('../../components/scorers/ScorersSheet');
const ScorersSheet = lazy(loadScorers);
const loadReport = () => import('../../components/tournamentReport/ReportSheet');
const ReportSheet = lazy(loadReport);

export type MenuSheet = 'anotadores' | 'reporte';

/**
 * Las hojas Anotadores y Reporte del «•••»: `show` baja la hoja (con la ruedita en su fila mientras llega, `isBusy`) y la
 * abre (antes corre `before`: cerrar el menú); `MenuSheets` las dibuja.
 */
export function useMenuSheet(): { open: MenuSheet | null; show: (k: MenuSheet, before?: () => void) => void; isBusy: (k?: MenuSheet) => boolean; close: () => void } {
  const [open, setOpen] = useState<MenuSheet | null>(null);
  const loading = useBusy<MenuSheet>();
  const show = (k: MenuSheet, before?: () => void) =>
    void loading
      .run(k, () => (k === 'anotadores' ? loadScorers() : loadReport()).then(() => true).catch(() => true))
      .then(() => {
        before?.();
        setOpen(k);
      });
  return { open, show, isBusy: loading.isBusy, close: () => setOpen(null) };
}

/** Las hojas de «•••» (solo la abierta, y solo si hay con qué abrirla). */
export function MenuSheets({
  open,
  onClose,
  scorers,
  report,
}: {
  open: MenuSheet | null;
  onClose: () => void;
  scorers?: { target: ScorerTarget; participants?: readonly string[] } | null;
  report?: Pick<ReportButtonProps, 'report' | 'comp'> | null;
}) {
  return (
    <>
      {open === 'anotadores' && scorers && (
        <Suspense fallback={null}>
          <ScorersSheet open onClose={onClose} target={scorers.target} participants={scorers.participants} />
        </Suspense>
      )}
      {open === 'reporte' && report && (
        <Suspense fallback={null}>
          <ReportSheet open onClose={onClose} report={report.report} comp={report.comp ?? null} />
        </Suspense>
      )}
    </>
  );
}
