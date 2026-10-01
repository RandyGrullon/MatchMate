import {
  forwardRef,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertTriangle, Loader2, Lock, RotateCw, WifiOff, X } from 'lucide-react';
import { LogoSpinner } from './Logo';

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

/** Texto de varias líneas con el mismo estilo de los campos. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cx(control, 'resize-none py-2', className)} {...rest} />;
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

/**
 * Carga de pantalla completa (sesión, pantallas): el logo de MatchMate con las cabezas saltando. Sirve para todos
 * los deportes y toma el color de la app (o el del deporte dentro de una liga).
 */
export function Loading({ label }: { label?: string }) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center gap-3 py-20" role="status" aria-label={label ?? 'Cargando'}>
      <LogoSpinner className="size-10" />
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

/** El error es de permisos (reintentar no sirve). */
export function isDeniedError(error: Error): boolean {
  return (error as { kind?: string }).kind === 'permission' || /permission|insufficient|no_permitido/i.test(error.message);
}

/**
 * Vuelve a pedir lo que falló de las pantallas abiertas (como al volver la señal), sin recargar la app: con 3G,
 * recargar todo deja la pantalla en blanco un buen rato. La capa de datos se carga aparte: la UI no depende de ella.
 */
export async function retryFailedReads(): Promise<void> {
  const { queryClient } = await import('../lib/data/client');
  queryClient.onReconnect();
}

/**
 * Aviso cuando una lectura falla (sin permiso o sin conexión) en vez de mostrar una lista vacía. Si no es de
 * permisos, trae «Reintentar»: vuelve a pedir los datos (`onRetry`, o todo lo que falló en pantalla).
 */
export function LoadError({ error, onRetry }: { error: Error; onRetry?: () => unknown }) {
  const denied = isDeniedError(error);
  const [busy, setBusy] = useState(false);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  async function retry() {
    setBusy(true);
    try {
      // Un momento mínimo girando: si falla de nuevo enseguida, que se note que sí lo intentó.
      await Promise.all([onRetry ? onRetry() : retryFailedReads(), new Promise((r) => setTimeout(r, 700))]);
    } catch (e) {
      console.warn('[reintentar]', e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Empty
      icon={denied ? <Lock className="size-8" /> : offline ? <WifiOff className="size-8" /> : <AlertTriangle className="size-8" />}
      title="No se pudieron cargar los datos"
    >
      {denied ? 'No tienes permiso para ver esto.' : offline ? 'No hay señal. Cuando vuelva, toca «Reintentar».' : 'Revisa tu conexión y toca «Reintentar».'}
      {!denied && (
        <div className="mt-4 flex justify-center">
          <Button variant="primary" icon={<RotateCw className="size-4" />} loading={busy} onClick={retry}>
            Reintentar
          </Button>
        </div>
      )}
    </Empty>
  );
}

/** Se abrió un modal (los avisos lo escuchan para quedar encima). */
export const MODAL_OPENED = 'mm:modal-abierto';

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
        // Esc en una hoja abierta encima (dentro de esta en React): esa se cierra sola, esta no.
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        // Fijo: el modal no se arrastra ni rebota (solo se desliza su contenido; ver dialog en index.css).
        'm-auto w-[calc(100%-1.5rem)] overflow-hidden overscroll-none rounded-2xl border border-line bg-surface p-0 text-fg shadow-2xl',
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
          <div className="modal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/** Menos que esto no es el teclado (barras del navegador que aparecen y se van). */
const KEYBOARD_MIN = 80;

/**
 * Cuánto tapa el teclado del teléfono la parte de abajo de la ventana: lo que queda debajo de lo que se ve
 * (`visualViewport`). iOS y Chrome en Android no achican la ventana (ni `dvh`) al abrir el teclado, así que lo
 * fijo abajo queda detrás de él. 0 si no está abierto, sin `visualViewport` o con zoom (pellizco).
 */
export function keyboardInset(innerHeight: number, vv: { height: number; offsetTop: number; scale?: number } | null | undefined): number {
  if (!vv || (vv.scale ?? 1) > 1.01) return 0;
  const kb = Math.round(innerHeight - vv.height - vv.offsetTop);
  return kb >= KEYBOARD_MIN ? kb : 0;
}

/**
 * Hoja: en el teléfono sube desde abajo, de lado a lado (como el selector de deporte); en la computadora es un
 * cuadro en el centro, como los modales. Arriba el título (y una línea debajo, opcional) con la X; en medio lo que
 * se desliza; abajo, opcional, lo que queda fijo (botones). Se cierra con la X, tocando fuera o con Esc.
 *
 * La barrita de arriba es solo adorno: la hoja no se arrastra con el dedo (ver dialog en index.css). La animación
 * (mm-sheet-up en index.css) se apaga si el teléfono pide menos movimiento. Con el teclado abierto (un buscador
 * adentro) la hoja se para encima de él y marca `data-kb`: lo de clase `mm-kb-hide` se esconde mientras tanto.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Los avisos que están en pantalla vuelven a ponerse encima de esta hoja.
      window.dispatchEvent(new Event(MODAL_OPENED));
    }
    if (!open && d.open) d.close();
  }, [open]);
  // Si se desmonta abierta (se cierra quitándola, o la pantalla se va), que no quede el fondo oscuro. Antes de que
  // React la saque de la página (efecto de layout, como el selector de deporte): así close() devuelve el foco al
  // botón que la abrió; después ya no es modal y el foco se pierde en <body>.
  useLayoutEffect(() => {
    const d = ref.current;
    return () => {
      if (d?.open) d.close();
    };
  }, []);
  // Con el teclado del teléfono abierto la hoja sube encima de él (si no, tapa el pie con los botones) y no pasa de
  // lo que se ve. Sin teclado, las clases de siempre.
  useEffect(() => {
    const d = ref.current;
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    if (!open || !d || !vv) return;
    const reset = () => {
      delete d.dataset.kb;
      d.style.marginBottom = '';
      d.style.maxHeight = '';
    };
    const sync = () => {
      const kb = keyboardInset(window.innerHeight, vv);
      if (!kb) return reset();
      d.dataset.kb = '';
      d.style.marginBottom = `${kb}px`;
      d.style.maxHeight = `min(88dvh, 44rem, ${Math.max(0, Math.floor(vv.height) - 12)}px)`;
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      reset();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Esc en una hoja abierta encima (dentro de esta en React): esa se cierra sola, esta no.
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        'mm-sheet overflow-hidden overscroll-none border border-line bg-surface p-0 text-fg shadow-2xl',
        // Teléfono: hoja desde abajo, de lado a lado.
        'm-0 mt-auto max-h-[88dvh] w-full max-w-none rounded-t-3xl border-b-0',
        // Computadora: cuadro en el centro.
        'sm:m-auto sm:max-h-[min(44rem,calc(100dvh-3rem))] sm:w-[calc(100%-1.5rem)] sm:max-w-lg sm:rounded-2xl sm:border-b',
      )}
    >
      {open && (
        <div className="flex max-h-[inherit] flex-col">
          <div aria-hidden="true" className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line sm:hidden" />
          <div className="flex items-start gap-3 px-5 pt-2 pb-3 sm:pt-4">
            <div className="min-w-0 flex-1 pt-1">
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="-mt-0.5 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg"
            >
              <X className="size-5" />
            </button>
          </div>
          <div
            className={cx(
              'modal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5',
              // Lo último de la hoja deja libre la barra del teléfono (iPhone).
              footer ? 'pb-4' : 'pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4',
            )}
          >
            {children}
          </div>
          {footer && <div className="border-t border-line px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">{footer}</div>}
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

/**
 * Medalla para los 3 primeros; número para el resto. El número va del color del fondo de la app: claro sobre
 * el oro, la plata y el bronce del modo claro, y oscuro sobre los del modo oscuro (que son claros: con blanco
 * no se leía).
 */
export function Position({ pos }: { pos: number }) {
  const color = pos === 1 ? 'bg-gold' : pos === 2 ? 'bg-silver' : pos === 3 ? 'bg-bronze' : null;
  return color ? (
    <span className={cx('inline-flex size-6 items-center justify-center rounded-full text-xs font-bold text-bg', color)}>{pos}</span>
  ) : (
    <span className="inline-flex size-6 items-center justify-center text-sm font-medium text-muted tabular-nums">{pos}</span>
  );
}
