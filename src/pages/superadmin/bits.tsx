/**
 * Piezas de la consola: encabezado de sección, tarjetas de números, filtros, buscador, paginación,
 * control segmentado, panel lateral (detalle), tablas que en el teléfono se vuelven tarjetas y los estados
 * de carga, vacío y error con «Intentar de nuevo».
 */
import { forwardRef, useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router';
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, CircleAlert, Minus, RefreshCw, Search, X } from 'lucide-react';
import { BusyIcon, useBusy } from '../../components/busy';
import { Button, Card, Empty, Input, MODAL_OPENED, Select, Skeleton, cx, iconSizeClass } from '../../components/ui';
import { deltaDirection, fmtDelta, fmtNum } from './format';
import { PAGE_SIZES, retryReads } from './hooks';

// ---------- Encabezados y tarjetas ----------

export function SectionHeader({ title, hint, actions }: { title: string; hint?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Tarjeta con título chico arriba (para gráficas, tablas y listas). */
export function Panel({ title, subtitle, actions, children, className, bodyClassName }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  const id = useId();
  return (
    <Card className={cx('flex min-w-0 flex-col', className)}>
      <section aria-labelledby={id} className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-3.5 pb-2 sm:px-5">
          <div className="min-w-0">
            <h2 id={id} className="text-sm font-semibold">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
        </div>
        <div className={cx('min-w-0 flex-1 px-4 pb-4 sm:px-5', bodyClassName)}>{children}</div>
      </section>
    </Card>
  );
}

/**
 * Tarjeta de un número (KPI): nombre, valor, cambio contra el periodo anterior y minigráfica opcional.
 * `goodWhenUp`: si subir es bueno (verde) o malo (rojo).
 */
export function KpiCard({
  label,
  value,
  change,
  changeLabel,
  note,
  goodWhenUp = true,
  trend,
  icon,
  to,
}: {
  label: string;
  value: ReactNode;
  change?: number | null;
  changeLabel?: string;
  note?: ReactNode;
  goodWhenUp?: boolean;
  trend?: ReactNode;
  icon?: ReactNode;
  to?: string;
}) {
  const dir = change === undefined ? null : deltaDirection(change);
  const good = dir === 'flat' || dir == null ? null : (dir === 'up') === goodWhenUp;
  const Arrow = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted">{label}</span>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="min-w-0 truncate text-2xl font-semibold tracking-tight">{value}</span>
        {/* En el teléfono (dos tarjetas por fila) no cabe la minigráfica. */}
        {trend && <span className="hidden shrink-0 sm:block">{trend}</span>}
      </div>
      {(dir || note) && (
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
          {dir && (
            <span className={cx('inline-flex items-center gap-0.5 font-medium', good === true ? 'text-ok' : good === false ? 'text-danger' : 'text-muted')}>
              <Arrow className="size-3.5" aria-hidden="true" />
              {fmtDelta(change ?? null)}
            </span>
          )}
          {dir && changeLabel && <span>{changeLabel}</span>}
          {note && <span>{note}</span>}
        </div>
      )}
    </>
  );
  const cls = 'flex min-w-0 flex-col gap-1.5 px-4 py-3';
  return (
    <Card className="min-w-0">
      {to ? (
        <Link to={to} className={cx(cls, 'rounded-2xl transition hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:outline-accent')}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </Card>
  );
}

export function KpiSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: n }, (_, i) => (
        <Card key={i} className="flex flex-col gap-2 px-4 py-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-24" />
        </Card>
      ))}
    </div>
  );
}

/** Un dato con su nombre (en listas de detalle). */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="min-w-0 text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

// ---------- Estados ----------

/** Error al leer, con botón para volver a intentar. */
export function ErrorRetry({ error, onRetry = retryReads, compact }: { error: Error; onRetry?: () => unknown; compact?: boolean }) {
  const denied = /permission|permiso|no_permitido|42501/i.test(error.message);
  const retrying = useBusy();
  // Un momento mínimo girando (como LoadError): si falla de nuevo enseguida, que se note que sí lo intentó.
  const retry = () =>
    void retrying.run('reintentar', async () => {
      try {
        await Promise.all([onRetry(), new Promise((r) => setTimeout(r, 700))]);
      } catch (e) {
        console.warn('[reintentar]', e);
      }
    });
  if (compact)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
        <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">{denied ? 'No tienes permiso para ver esto.' : 'No se pudo cargar.'}</span>
        {!denied && (
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} loading={retrying.isBusy()} onClick={retry}>
            Intentar de nuevo
          </Button>
        )}
      </div>
    );
  return (
    <div role="alert">
      <Empty icon={<CircleAlert className="size-8" />} title="No se pudieron cargar los datos">
        <p>{denied ? 'No tienes permiso para ver esto.' : 'Revisa tu conexión e intenta de nuevo.'}</p>
        {!denied && (
          <div className="mt-3 flex justify-center">
            <Button icon={<RefreshCw className="size-4" />} loading={retrying.isBusy()} onClick={retry} className="max-sm:min-h-11">
              Intentar de nuevo
            </Button>
          </div>
        )}
      </Empty>
    </div>
  );
}

/** Filas grises con la forma de una tabla mientras llegan los datos. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-line" aria-busy="true" aria-label="Cargando">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            {Array.from({ length: cols - 1 }, (_, j) => (
              <Skeleton key={j} className={cx('h-3.5', j === 0 ? 'flex-[2]' : 'hidden flex-1 md:block')} style={{ maxWidth: j === 0 ? `${60 - (i % 3) * 10}%` : undefined }} />
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------- Filtros ----------

export function SearchBox({ value, onChange, placeholder = 'Buscar', label }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string }) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-9 pl-9 max-sm:h-11"
        enterKeyHint="search"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Borrar la búsqueda"
          className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Botones de filtro (uno elegido). */
export function FilterChips<K extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: readonly { key: K; label: string; count?: number | null; icon?: ReactNode }[];
  value: K;
  onChange: (k: K) => void;
  label: string;
}) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          aria-pressed={value === it.key}
          onClick={() => onChange(it.key)}
          className={cx(
            'flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition active:scale-95 sm:h-8 sm:px-3',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            value === it.key ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-fg',
          )}
        >
          {it.icon}
          {it.label}
          {it.count != null && <span className={cx('text-xs tabular-nums', value === it.key ? 'opacity-80' : 'text-muted')}>{fmtNum(it.count)}</span>}
        </button>
      ))}
      <span aria-hidden="true" className="w-3 shrink-0 sm:hidden" />
    </div>
  );
}

/**
 * Control segmentado (radio): uno de pocos valores. Flechas para moverse, como un grupo de radios.
 * `busy`: lo elegido se está guardando (la ruedita en vez de su ícono, del mismo tamaño, y no se cambia mientras).
 */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
  busy,
  size = 'md',
}: {
  options: readonly { value: K; label: string; icon?: ReactNode }[];
  value: K;
  onChange: (v: K) => void;
  label: string;
  disabled?: boolean;
  busy?: boolean;
  size?: 'sm' | 'md';
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (i + d + options.length) % options.length;
    refs.current[next]?.focus();
    onChange(options[next].value);
  };
  return (
    <div role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} aria-busy={busy || undefined} className={cx('inline-flex max-w-full gap-1 rounded-xl bg-surface-2 p-1', disabled && 'opacity-60')}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={disabled || busy}
            onClick={() => !on && onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
              size === 'sm' ? 'h-9 sm:h-7' : 'h-11 sm:h-8',
              on ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            {on && busy ? <BusyIcon busy className={iconSizeClass(o.icon)} /> : o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Paginación ----------

/** «1–25 de 312», anterior/siguiente y cuántas por página. `page` empieza en 0. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  noun = 'filas',
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize?: (n: number) => void;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? page * pageSize + 1 : 0;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Páginas">
      <p className="text-muted tabular-nums" aria-live="polite">
        {total ? `${fmtNum(from)}–${fmtNum(to)} de ${fmtNum(total)} ${noun}` : `0 ${noun}`}
      </p>
      <div className="flex items-center gap-2">
        {onPageSize && (
          <label className="flex items-center gap-2 text-muted">
            <span className="hidden sm:inline">Por página</span>
            <Select aria-label="Filas por página" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="w-20 max-sm:h-11">
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
        )}
        <Button aria-label="Página anterior" icon={<ChevronLeft className="size-4" />} disabled={page <= 0} onClick={() => onPage(page - 1)} className="max-sm:size-11" />
        <span className="min-w-16 text-center text-muted tabular-nums">
          {fmtNum(Math.min(page + 1, pages))} / {fmtNum(pages)}
        </span>
        <Button aria-label="Página siguiente" icon={<ChevronRight className="size-4" />} disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} className="max-sm:size-11" />
      </div>
    </nav>
  );
}

// ---------- Panel lateral ----------

/**
 * Panel de detalle: a la derecha en la computadora, pantalla completa en el teléfono. Es un <dialog>
 * (Esc cierra, el foco queda adentro) como los modales de la app.
 */
export function Drawer({ open, onClose, title, children, footer, label }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; label?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      window.dispatchEvent(new Event(MODAL_OPENED));
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        'm-0 h-dvh max-h-dvh w-full max-w-full border-line bg-surface p-0 text-fg shadow-2xl',
        'sm:ml-auto sm:max-w-lg sm:border-l',
      )}
    >
      {open && (
        <div className="pt-safe flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <h2 id={titleId} className="min-w-0 truncate text-base font-semibold">
              {title}
            </h2>
            <Button variant="ghost" onClick={onClose} aria-label="Cerrar" icon={<X className="size-5" />} className="max-sm:size-11" />
          </div>
          <div className="modal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
          {footer && <div className="pb-safe flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// ---------- Formularios ----------

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cx(
        'min-h-24 w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-base text-fg placeholder:text-muted/70 sm:text-sm',
        'focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none disabled:opacity-60',
        className,
      )}
      {...rest}
    />
  );
});

/** «12/60» debajo de un campo; en rojo si se pasa. */
export function Counter({ value, max }: { value: string; max: number }) {
  const n = value.length;
  return (
    <span className={cx('tabular-nums', n > max ? 'font-medium text-danger' : n > max * 0.9 ? 'text-warn' : 'text-muted')} aria-live="polite">
      {n}/{max}
    </span>
  );
}

/** Link con flecha (accesos rápidos). */
export function QuickLink({ to, icon, title, hint }: { to: string; icon: ReactNode; title: string; hint?: string }) {
  return (
    <Link
      to={to}
      className="group flex min-h-11 items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
      </span>
      <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}
