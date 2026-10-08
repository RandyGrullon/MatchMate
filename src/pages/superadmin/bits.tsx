/**
 * Piezas de la consola, en el lenguaje del rediseño (como Organizar y la Tabla en Pro): la barra de arriba con
 * «‹ Consola», el título y una línea, y a la derecha lo de la pantalla (una píldora, actualizar y «•••»); tarjetas sin
 * borde con su título adentro, la cuadrícula de números, filtros en píldoras, el segmentado, el buscador, la paginación,
 * el panel de detalle y los estados de carga, vacío y error con «Intentar de nuevo».
 */
import { forwardRef, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, CircleAlert, Minus, MoreHorizontal, RefreshCw, Search, X, type LucideIcon } from 'lucide-react';
import { BusyIcon, useBusy } from '../../components/busy';
import { Button, Card, MODAL_OPENED, Sheet, Skeleton, cx, iconSizeClass } from '../../components/ui';
import { deltaDirection, fmtDelta, fmtNum } from './format';
import { PAGE_SIZES, refreshAll, retryReads } from './hooks';

// ---------- Barra de arriba, título y menú «•••» ----------

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** Una opción del menú «•••» de una pantalla o de una fila. */
export interface MenuItem {
  key: string;
  icon: LucideIcon;
  label: string;
  /** La línea de abajo, corta. */
  hint?: string;
  onClick?: () => void;
  /** En vez de `onClick`, un link de la app. */
  to?: string;
  busy?: boolean;
  disabled?: boolean;
  danger?: boolean;
}

/** Botón redondo gris de la barra de arriba (actualizar, «•••»): se ve de 40 px y se toca en 44. */
export function RoundButton({ label, onClick, children, busy, popup }: { label: string; onClick: () => void; children: ReactNode; busy?: boolean; popup?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-haspopup={popup ? 'dialog' : undefined}
      aria-busy={busy || undefined}
      disabled={busy}
      className={cx(
        "relative grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-2 transition after:absolute after:-inset-0.5 after:content-[''] active:scale-95 disabled:opacity-70",
        focusRing,
      )}
    >
      {children}
    </button>
  );
}

/** Píldora gris de la barra de arriba («CSV»): se ve de 36 px y se toca en 44. Una sola por pantalla. */
export function Pill({ icon, children, onClick, disabled, busy, label }: { icon?: ReactNode; children: ReactNode; onClick: () => void; disabled?: boolean; busy?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      aria-label={label}
      title={label}
      className={cx(
        "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-[13px] text-sm font-semibold whitespace-nowrap text-fg transition after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] active:scale-[0.97] disabled:opacity-50",
        focusRing,
      )}
    >
      {busy ? <BusyIcon busy className={iconSizeClass(icon)} /> : icon}
      {children}
    </button>
  );
}

/** Las opciones de un menú «•••», como filas (la peligrosa, al final y en rojo). */
export function MenuList({ items, onPick }: { items: readonly MenuItem[]; onPick?: () => void }) {
  return (
    <ul className="-mx-2 flex flex-col pb-1">
      {items.map((it) => {
        const cls = cx(
          'flex min-h-14 w-full items-center gap-3.5 rounded-2xl px-2 py-2 text-left transition hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50',
          it.danger && 'text-danger',
        );
        const body = (
          <>
            <span aria-hidden="true" className={cx('grid size-10 shrink-0 place-items-center rounded-xl', it.danger ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-fg-2')}>
              <BusyIcon busy={!!it.busy} icon={<it.icon className="size-5" />} className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-semibold">{it.label}</span>
              {it.hint && <span className="block truncate text-[13px] text-muted">{it.hint}</span>}
            </span>
            {!it.danger && <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-faint" />}
          </>
        );
        return (
          <li key={it.key}>
            {it.to && !it.disabled ? (
              <Link to={it.to} onClick={onPick} className={cls}>
                {body}
              </Link>
            ) : (
              <button
                type="button"
                disabled={it.disabled || it.busy}
                aria-busy={it.busy || undefined}
                onClick={() => {
                  onPick?.();
                  it.onClick?.();
                }}
                className={cls}
              >
                {body}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** «•••» con su hoja: las acciones que no son la principal (bajar, borrar todo, pasar a otro dueño…). */
export function MoreMenu({ title, items, label = 'Más opciones' }: { title: string; items: readonly MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <>
      <RoundButton label={label} onClick={() => setOpen(true)} popup>
        <MoreHorizontal aria-hidden="true" strokeWidth={2.4} className="size-5" />
      </RoundButton>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <MenuList items={items} onPick={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

/** Vuelve a pedir todo lo de la consola sin quitar lo que se ve (la ruedita un momento, para que se note). */
export function RefreshButton() {
  const refreshing = useBusy();
  const refresh = () =>
    void refreshing.run('actualizar', async () => {
      refreshAll();
      await new Promise((r) => setTimeout(r, 700));
    });
  return (
    <RoundButton label="Actualizar los datos" onClick={refresh} busy={refreshing.isBusy()}>
      <BusyIcon busy={refreshing.isBusy()} icon={<RefreshCw aria-hidden="true" className="size-[18px]" />} className="size-[18px]" />
    </RoundButton>
  );
}

/**
 * Arriba de cada pantalla de la consola: «‹ Consola» (en la computadora no va: está el menú de la izquierda) con lo de
 * la pantalla a la derecha (`actions`: una píldora; actualizar; `menu`: «•••»), el título y una línea corta. `below`:
 * lo que va justo debajo (el segmentado de la vista, por ejemplo). En la computadora lo de la derecha va al lado del
 * título.
 */
export function SectionHeader({
  title,
  hint,
  actions,
  menu,
  menuTitle,
  back = { to: '/superadmin', label: 'Consola' },
  below,
}: {
  title: string;
  hint?: ReactNode;
  actions?: ReactNode;
  menu?: readonly MenuItem[];
  menuTitle?: string;
  back?: { to: string; label: string } | null;
  below?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
      {back ? (
        <div className="col-start-1 row-start-1 -ml-2 flex h-[52px] min-w-0 items-center lg:hidden">
          <Link to={back.to} className={cx('inline-flex h-11 min-w-0 items-center rounded-xl pr-2 pl-0.5 text-body font-[550] text-accent transition active:opacity-70', focusRing)}>
            <ChevronLeft aria-hidden="true" className="size-6 shrink-0" strokeWidth={2.2} />
            <span className="truncate">{back.label}</span>
          </Link>
        </div>
      ) : (
        <span aria-hidden="true" className="col-start-1 row-start-1 h-[52px] lg:hidden" />
      )}
      <div className="col-start-2 row-start-1 flex items-center gap-2">
        {actions}
        <RefreshButton />
        {menu && <MoreMenu title={menuTitle ?? title} items={menu} />}
      </div>
      <h1 className="col-span-2 row-start-2 mt-0.5 min-w-0 text-title-pro lg:col-span-1 lg:row-start-1 lg:mt-0">{title}</h1>
      {hint && <p className="col-span-2 row-start-3 mt-1 text-meta text-muted lg:row-start-2">{hint}</p>}
      {below && <div className="col-span-2 row-start-4 mt-4 lg:row-start-3">{below}</div>}
    </header>
  );
}

/**
 * Tarjeta sin borde con su título adentro (gráficas, tablas y listas), como «Tendencia» en Yo. `flush`: lo de adentro
 * llega a los bordes (filas ListRow, que traen su margen).
 */
export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  flush,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
}) {
  const id = useId();
  return (
    <Card className={cx('flex min-w-0 flex-col overflow-hidden', className)}>
      <section aria-labelledby={id} className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 pt-[18px] pb-3">
          <div className="min-w-0">
            <h2 id={id} className="text-[17px] leading-tight font-semibold tracking-[-0.01em]">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        <div className={cx('min-w-0 flex-1', flush ? 'pb-1.5' : 'px-5 pb-5', bodyClassName)}>{children}</div>
      </section>
    </Card>
  );
}

/** Ícono en caja de 40 px con el tono de lo que avisa (urgente, revisar, bien, para saber). */
export function ToneIcon({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-fg-2',
    accent: 'bg-accent-soft text-accent',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
  } as const;
  return (
    <span aria-hidden="true" className={cx('grid size-10 shrink-0 place-items-center rounded-xl', tones[tone], className)}>
      {children}
    </span>
  );
}

/**
 * Fila de una lista con texto que no se corta (detalles, notas, la pila de un error): como ListRow por fuera (ícono,
 * margen y la línea entre filas), pero lo de abajo se ve entero. Va dentro de una tarjeta o de un Panel `flush`.
 */
export function DetailRow({ leading, title, children, className }: { leading?: ReactNode; title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cx('mm-row relative flex items-start gap-3.5 py-3 pr-[18px] pl-5', className)}>
      {leading}
      <div className="min-w-0 flex-1 pt-px">
        <div className="text-[15px] font-semibold tracking-[-0.01em] break-words">{title}</div>
        {children && <div className="mt-0.5 text-[13px] break-words text-muted">{children}</div>}
      </div>
    </div>
  );
}

/** El globo con el número (en el color del deporte), como en Organizar. */
export function Count({ n, label, className }: { n: number; label?: string; className?: string }) {
  return (
    <span
      aria-label={label}
      className={cx('num grid h-[22px] min-w-[22px] place-items-center rounded-full bg-accent px-1.5 text-xs font-bold tracking-normal text-accent-fg', className)}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

/**
 * Los números de arriba en una sola tarjeta, separados por líneas (como los 6 números de Yo en Pro): 2 por fila en el
 * teléfono y 4 en la computadora.
 */
export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card className={cx('overflow-hidden', className)}>
      <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">{children}</div>
    </Card>
  );
}

/**
 * Un número de la cuadrícula (KpiGrid): qué es, el número grande, el cambio contra el periodo anterior y una línea.
 * `goodWhenUp`: si subir es bueno (verde) o malo (rojo). Con `to`, se toca entero (con chevron).
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
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] text-muted">{label}</span>
        {to ? <ChevronRight aria-hidden="true" className="-mr-1 size-4 shrink-0 text-faint" /> : icon && <span className="hidden shrink-0 text-faint sm:inline">{icon}</span>}
      </span>
      <span className="flex items-end justify-between gap-2">
        <b className="num min-w-0 truncate text-[28px] leading-none font-[650]">{value}</b>
        {/* En el teléfono (dos por fila) no cabe la minigráfica. */}
        {trend && <span className="hidden shrink-0 sm:block">{trend}</span>}
      </span>
      {(dir || note) && (
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs leading-snug text-muted">
          {dir && (
            <span className={cx('inline-flex items-center gap-0.5 font-semibold', good === true ? 'text-ok' : good === false ? 'text-danger' : 'text-muted')}>
              <Arrow className="size-3.5" aria-hidden="true" />
              {fmtDelta(change ?? null)}
            </span>
          )}
          {dir && changeLabel && <span>{changeLabel}</span>}
          {note && <span>{note}</span>}
        </span>
      )}
    </>
  );
  const cls = 'flex min-w-0 flex-col gap-2 bg-surface px-[18px] py-4';
  return to ? (
    <Link to={to} className={cx(cls, 'transition hover:bg-surface-2/50 active:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function KpiSkeleton({ n = 4 }: { n?: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4" aria-busy="true" aria-label="Cargando">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="flex flex-col gap-2.5 bg-surface px-[18px] py-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Un dato con su nombre (en listas de detalle). */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 text-[15px] font-semibold break-words">{children}</dd>
    </div>
  );
}

/** Datos sueltos en una caja gris (2 columnas): el detalle de una cuenta, el servidor, la cola de avisos. */
export function FactGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cx('grid grid-cols-2 gap-x-4 gap-y-3.5 rounded-2xl bg-surface-2 px-4 py-3.5', className)}>{children}</dl>;
}

/** Clases de las tablas de la computadora: encabezado chico en mayúsculas (como la Tabla en Pro) y filas de 56 px. */
export const TH = 'px-3 py-3 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase';
export const TD = 'px-3 py-3';

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
      <div role="alert" className="flex flex-wrap items-center gap-2 rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
        <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">{denied ? 'No tienes permiso para ver esto.' : 'No se pudo cargar.'}</span>
        {!denied && (
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} loading={retrying.isBusy()} onClick={retry} className="max-sm:h-11">
            Intentar de nuevo
          </Button>
        )}
      </div>
    );
  return (
    <Card>
      <div role="alert">
        <EmptyState icon={<CircleAlert className="size-8" />} title="No se pudieron cargar los datos">
          <p>{denied ? 'No tienes permiso para ver esto.' : 'Revisa tu conexión e intenta de nuevo.'}</p>
          {!denied && (
            <div className="mt-4 flex justify-center">
              <Button variant="soft" size="lg" icon={<RefreshCw className="size-[18px]" />} loading={retrying.isBusy()} onClick={retry}>
                Intentar de nuevo
              </Button>
            </div>
          )}
        </EmptyState>
      </div>
    </Card>
  );
}

/** Filas grises con la forma de la lista (o la tabla) mientras llegan los datos. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <Card className="overflow-hidden">
      <div aria-busy="true" aria-label="Cargando">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="mm-row relative flex min-h-row-pro items-center gap-3.5 py-2 pr-[18px] pl-5">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            {Array.from({ length: cols - 1 }, (_, j) => (
              <Skeleton key={j} className={cx('h-3.5', j === 0 ? 'flex-[2]' : 'hidden flex-1 md:block')} style={{ maxWidth: j === 0 ? `${60 - (i % 3) * 10}%` : undefined }} />
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Nada que mostrar: el ícono en acento suave, una línea y (opcional) otra corta. Sin borde: va en una tarjeta. */
export function EmptyState({ icon, title, children, className }: { icon?: ReactNode; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cx('animate-fade-up flex flex-col items-center gap-2 px-6 py-10 text-center', className)}>
      {icon && <div className="mb-1 grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</div>}
      <p className="text-[15px] font-semibold">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Lista vacía dentro de su tarjeta (EmptyState en una Card). */
export function EmptyCard({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <Card>
      <EmptyState icon={icon} title={title}>
        {children}
      </EmptyState>
    </Card>
  );
}

// ---------- Filtros ----------

/** Buscador grande, blanco y con sombra (como el de «Ligas abiertas»). */
export function SearchBox({ value, onChange, placeholder = 'Buscar', label, className }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string; className?: string }) {
  return (
    <label className={cx('relative block min-w-0 flex-1', className)}>
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        enterKeyHint="search"
        className="card-shadow h-12 w-full rounded-2xl bg-surface pr-12 pl-12 text-base text-fg placeholder:text-faint focus:outline-2 focus:outline-offset-1 focus:outline-accent sm:text-[15px] [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Borrar la búsqueda"
          className="absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center rounded-xl text-faint hover:text-fg"
        >
          <X className="size-[18px]" aria-hidden="true" />
        </button>
      )}
    </label>
  );
}

/** Píldoras de filtro (una elegida, en el color del deporte), como las de deporte en Ligas. Para más de 3 opciones. */
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
    <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6 py-0.5 lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label={label}>
      {items.map((it) => {
        const on = value === it.key;
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(it.key)}
            className={cx(
              "relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-meta font-semibold whitespace-nowrap transition after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-[''] active:scale-[0.97]",
              focusRing,
              on ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-2',
            )}
          >
            {it.icon}
            {it.label}
            {it.count != null && <span className={cx('num text-[13px]', on ? 'opacity-80' : 'text-muted')}>{fmtNum(it.count)}</span>}
          </button>
        );
      })}
      <span aria-hidden="true" className="w-1 shrink-0 lg:hidden" />
    </div>
  );
}

/**
 * Píldora con menú (como «Promedio ▾» de la Tabla): se ve lo elegido y al tocarla abre el menú del teléfono (un
 * <select> invisible encima, que también sirve con el teclado y el lector de pantalla). Para elegir entre muchas.
 */
export function PillSelect<K extends string>({
  options,
  value,
  onChange,
  label,
  icon,
  className,
}: {
  options: readonly { key: K; label: string; short?: string }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  /** Un ícono delante (qué se elige: visibilidad, orden), para que lo elegido pueda ser corto. */
  icon?: ReactNode;
  className?: string;
}) {
  const current = options.find((o) => o.key === value) ?? options[0];
  if (!current) return null;
  return (
    <label
      className={cx(
        'relative inline-flex h-10 max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-full bg-surface-2 pr-3 text-meta font-semibold text-fg transition active:scale-[0.97] [&>svg:first-child]:text-fg-2',
        'has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-accent',
        icon ? 'pl-3.5' : 'pl-4',
        className,
      )}
    >
      {icon}
      <span aria-hidden="true" className="truncate">
        {current.short ?? current.label}
      </span>
      <ChevronRight aria-hidden="true" strokeWidth={2.25} className="size-4 shrink-0 rotate-90" />
      <select
        aria-label={label}
        value={current.key}
        onChange={(e) => onChange(e.target.value as K)}
        className="absolute inset-x-0 -inset-y-0.5 cursor-pointer appearance-none opacity-0"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Segmentado de 2 o 3 opciones (radio), igual que el de la app (barra gris, la elegida en blanco con su ícono en el
 * color del deporte). Flechas para moverse, como un grupo de radios. `full`: todo el ancho, opciones iguales.
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
  full,
}: {
  options: readonly { value: K; label: string; icon?: ReactNode }[];
  value: K;
  onChange: (v: K) => void;
  label: string;
  disabled?: boolean;
  busy?: boolean;
  size?: 'sm' | 'md';
  full?: boolean;
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
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      aria-busy={busy || undefined}
      className={cx(full ? 'flex w-full' : 'inline-flex max-w-full', 'gap-0.5 rounded-[14px] bg-surface-2 p-1', disabled && 'opacity-60')}
    >
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
              // Como el Segmented de la app (ui.tsx): se ve de 36 px (32 el chico) y se toca en 44 (mm-seg-opt).
              'mm-seg-opt relative flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] font-semibold whitespace-nowrap transition [&>svg]:shrink-0',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
              size === 'sm' ? 'h-8 px-3 text-sm' : 'h-9 px-3.5 text-meta',
              on ? 'bg-seg-on text-fg shadow-[0_1px_3px_rgb(0_0_0/0.08)] [&>svg]:text-accent' : 'text-muted hover:text-fg',
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
  const arrow = cx(
    "relative grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-2 transition after:absolute after:-inset-0.5 after:content-[''] active:scale-95 disabled:pointer-events-none disabled:opacity-40",
    focusRing,
  );
  return (
    <nav className="mx-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2" aria-label="Páginas">
      <p className="num text-meta text-muted" aria-live="polite">
        {total ? `${fmtNum(from)}–${fmtNum(to)} de ${fmtNum(total)} ${noun}` : `0 ${noun}`}
      </p>
      <div className="flex items-center gap-2">
        {onPageSize && (total > PAGE_SIZES[0] || pageSize !== PAGE_SIZES[0]) && (
          <PillSelect
            label="Filas por página"
            options={PAGE_SIZES.map((n) => ({ key: String(n), label: `${n} por página` }))}
            value={String(pageSize)}
            onChange={(n) => onPageSize(Number(n))}
          />
        )}
        {(pages > 1 || page > 0) && (
          <>
            <button type="button" aria-label="Página anterior" disabled={page <= 0} onClick={() => onPage(page - 1)} className={arrow}>
              <ChevronLeft aria-hidden="true" className="size-5" />
            </button>
            <span className="num min-w-12 text-center text-meta text-muted">
              {fmtNum(Math.min(page + 1, pages))} / {fmtNum(pages)}
            </span>
            <button type="button" aria-label="Página siguiente" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} className={arrow}>
              <ChevronRight aria-hidden="true" className="size-5" />
            </button>
          </>
        )}
      </div>
    </nav>
  );
}

// ---------- Panel lateral ----------

/**
 * Panel de detalle: a la derecha en la computadora, pantalla completa en el teléfono. Es un <dialog>
 * (Esc cierra, el foco queda adentro) como los modales de la app. Arriba, la X redonda y el título; las acciones van
 * como filas adentro (no una fila de botones abajo).
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
        'm-0 h-dvh max-h-dvh w-full max-w-full bg-bg p-0 text-fg shadow-2xl',
        'sm:ml-auto sm:max-w-lg sm:rounded-l-sheet',
      )}
    >
      {open && (
        <div className="pt-safe flex h-full flex-col">
          <div className="flex h-[60px] shrink-0 items-center justify-between gap-3 px-5">
            <h2 id={titleId} className="min-w-0 truncate text-section">
              {title}
            </h2>
            <RoundButton label="Cerrar" onClick={onClose}>
              <X aria-hidden="true" className="size-5" />
            </RoundButton>
          </div>
          <div className="modal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">{children}</div>
          {footer && <div className="pb-safe flex flex-wrap justify-end gap-2 bg-surface px-5 py-3">{footer}</div>}
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

/** Título de un grupo dentro del panel de detalle («Sus ligas y torneos (2)», «Acciones»). */
export function GroupTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3 id={id} className="mx-1 mb-2 text-[15px] font-semibold tracking-[-0.01em]">
      {children}
    </h3>
  );
}
