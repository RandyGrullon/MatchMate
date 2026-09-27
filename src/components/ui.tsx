import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 shadow-sm',
  secondary: 'bg-surface text-fg border border-line hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-danger text-on-danger hover:brightness-110',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition select-none active:scale-[0.97]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'h-8 text-sm' : 'h-10 text-sm',
        children ? (size === 'sm' ? 'px-3' : 'px-4') : size === 'sm' ? 'w-8 shrink-0' : 'w-10 shrink-0',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

const control =
  'w-full rounded-xl border border-line bg-surface px-3 text-base sm:text-sm text-fg placeholder:text-muted/70 ' +
  'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(control, 'h-10', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(control, 'h-10 pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ className, style, tour, children }: { className?: string; style?: CSSProperties; tour?: string; children: ReactNode }) {
  return (
    <div className={cx('card-shadow rounded-2xl border border-line bg-surface', className)} style={style} data-tour={tour}>
      {children}
    </div>
  );
}

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  accent: 'bg-accent-soft text-accent',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-muted', className)} />;
}

/** Bola de boliche rodando: carga de pantalla completa (sesión, pantallas). */
export function Loading({ label }: { label?: string }) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center gap-3 py-20" role="status" aria-label={label ?? 'Cargando'}>
      <svg viewBox="0 0 40 40" className="bowl-loader size-10" aria-hidden="true">
        <circle cx="20" cy="20" r="18" fill="var(--accent)" />
        <circle cx="15" cy="13" r="2.6" fill="var(--surface)" />
        <circle cx="23" cy="12" r="2.6" fill="var(--surface)" />
        <circle cx="20" cy="19" r="2.6" fill="var(--surface)" />
      </svg>
      {label && <p className="text-sm text-muted">{label}</p>}
    </div>
  );
}

/** Barra fina arriba mientras se descarga una pantalla. */
export function TopLoader() {
  return <div className="top-loader" role="progressbar" aria-label="Cargando" />;
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cx('skeleton', className)} style={style} aria-hidden="true" />;
}

/** Filas con la forma de una lista de jugadores/eventos mientras llegan los datos. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5" style={{ width: `${55 - (i % 3) * 10}%` }} />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-5 w-10" />
        </div>
      ))}
    </Card>
  );
}

export function StatsSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <Card key={i} className="flex flex-col gap-2 px-4 py-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-12" />
        </Card>
      ))}
    </div>
  );
}

/** Título + pestañas + lista: la forma de la pantalla de un evento. */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex items-start gap-3">
        <Skeleton className="size-11 rounded-2xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3.5 w-64 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-10 w-full rounded-xl sm:w-96" />
      <ListSkeleton rows={6} />
    </div>
  );
}

/** Número que sube hasta su valor al aparecer (estadísticas). */
export function AnimatedNumber({ value, duration = 700 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const finish = () => {
      from.current = value;
      setShown(value);
    };
    // Sin animación si el usuario pidió menos movimiento o la pestaña no se ve (el navegador pausa los cuadros).
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) {
      finish();
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(origin + (value - origin) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    // Respaldo: si los cuadros se pausan a mitad, el número igual queda en su valor.
    const done = setTimeout(finish, duration + 100);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(done);
    };
  }, [value, duration]);
  return <>{shown.toLocaleString('es-DO')}</>;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="animate-fade-up flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="mb-1 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Aviso cuando una lectura de Firestore falla (sin permiso o sin conexión) en vez de mostrar una lista vacía. */
export function LoadError({ error }: { error: Error }) {
  const denied = /permission|insufficient/i.test(error.message);
  return (
    <Empty icon={<AlertTriangle className="size-8" />} title="No se pudieron cargar los datos">
      {denied ? 'No tienes permiso para ver esto.' : 'Revisa tu conexión y recarga la página.'}
    </Empty>
  );
}

/** Se abrió un modal (los avisos lo escuchan para quedar encima). */
export const MODAL_OPENED = 'bowlingx:modal-abierto';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Los avisos que están en pantalla vuelven a ponerse encima de este modal.
      window.dispatchEvent(new Event(MODAL_OPENED));
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        'm-auto w-[calc(100%-1.5rem)] rounded-2xl border border-line bg-surface p-0 text-fg shadow-2xl',
        'max-h-[calc(100dvh-1.5rem)]',
        wide ? 'max-w-3xl' : 'max-w-lg',
      )}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <h2 className="text-base font-semibold">{title}</h2>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar" icon={<X className="size-4" />} />
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function Tabs<K extends string>({
  items,
  active,
  onChange,
}: {
  items: { key: K; label: string; icon?: ReactNode; count?: number }[];
  active: K;
  onChange: (k: K) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  // La pestaña activa siempre a la vista (en el celular no caben todas).
  useEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    const box = bar.current;
    if (!el || !box) return;
    const left = el.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft || left + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollTo({ left: left - 16 });
  }, [active]);
  return (
    <div ref={bar} className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" className="inline-flex min-w-full gap-1 rounded-xl bg-surface-2 p-1 sm:min-w-0">
        {items.map((it) => (
          <button
            key={it.key}
            role="tab"
            aria-selected={active === it.key}
            onClick={() => onChange(it.key)}
            className={cx(
              'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-none',
              active === it.key ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            {it.icon}
            {it.label}
            {it.count != null && it.count > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[11px] leading-4 text-accent-fg">{it.count}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Medalla para los 3 primeros; número para el resto. */
export function Position({ pos }: { pos: number }) {
  const color = pos === 1 ? 'bg-gold' : pos === 2 ? 'bg-silver' : pos === 3 ? 'bg-bronze' : null;
  return color ? (
    <span className={cx('inline-flex size-6 items-center justify-center rounded-full text-xs font-bold text-white', color)}>{pos}</span>
  ) : (
    <span className="inline-flex size-6 items-center justify-center text-sm font-medium text-muted tabular-nums">{pos}</span>
  );
}
