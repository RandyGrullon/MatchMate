import {
  forwardRef,
  isValidElement,
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
import { AlertTriangle, ChevronRight, Loader2, Lock, Plus, RotateCw, WifiOff, X } from 'lucide-react';
import { Link } from 'react-router';
import { LogoSpinner } from './Logo';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/**
 * `soft` (acento suave) y `quiet` (gris, como «Planilla» al lado del botón principal) son del rediseño; el `primary` va
 * una sola vez por pantalla.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'quiet';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 shadow-sm',
  secondary: 'bg-surface text-fg border border-line hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-danger text-on-danger hover:brightness-110',
  soft: 'bg-accent-soft text-accent hover:brightness-95',
  quiet: 'bg-surface-2 text-fg hover:brightness-95',
};

/**
 * Tamaños: `sm` 32 px y `md` 40 px (los de siempre); `lg` 48 px (el botón principal en Pro) y `xl` 56 px (el botón
 * principal en Lite: «Seguir mi juego 3»). Con ícono solo, cuadrado del mismo alto.
 */
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const buttonSizes: Record<ButtonSize, { box: string; text: string; icon: string }> = {
  sm: { box: 'h-8 gap-2 rounded-xl text-sm font-medium', text: 'px-3', icon: 'w-8' },
  md: { box: 'h-10 gap-2 rounded-xl text-sm font-medium', text: 'px-4', icon: 'w-10' },
  lg: { box: 'h-btn-pro min-w-0 gap-2 rounded-[15px] text-base font-semibold whitespace-nowrap', text: 'px-4', icon: 'w-btn-pro' },
  xl: { box: 'h-btn min-w-0 gap-2.5 rounded-btn text-[17px] font-semibold tracking-[-0.01em] whitespace-nowrap', text: 'px-6', icon: 'w-btn' },
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  const s = buttonSizes[size];
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center transition select-none active:scale-[0.97]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:opacity-50 disabled:pointer-events-none',
        s.box,
        children ? s.text : cx(s.icon, 'shrink-0'),
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className={cx(iconSizeClass(icon), 'animate-spin')} /> : icon}
      {/* Los grandes van en una línea: si no cabe (teléfono de 360 px), termina en «…» en vez de partirse. */}
      {children != null && (size === 'lg' || size === 'xl') ? <span className="min-w-0 truncate">{children}</span> : children}
    </button>
  );
}

/** El tamaño de un ícono (size-5, h-4 w-4…) para que la ruedita ocupe lo mismo y nada se mueva; size-4 si no tiene. */
export function iconSizeClass(icon: ReactNode): string {
  const cls = isValidElement<{ className?: unknown }>(icon) && typeof icon.props.className === 'string' ? icon.props.className : '';
  const sizes = cls.split(/\s+/).filter((c) => /(?:^|:)(?:size|h|w)-/.test(c));
  return sizes.length ? sizes.join(' ') : 'size-4';
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

/** Colores de borde con que una tarjeta marca un estado (en vivo, por revisar, elegida…). */
const CARD_BORDER_COLOR = /^border-(?:accent|ok|warn|danger|line|fg|fg-2|muted|faint|gold|silver|bronze)(?:\/\d+)?$/;

/**
 * Las tarjetas ya no llevan borde (rediseño): solo las que piden un color de borde para marcar un estado
 * (`border-ok/40`, `border-warn`…) lo tienen, de 1 px. Si el color es solo al pasar o al tocar (`hover:border-accent/50`),
 * el borde está siempre pero transparente, así la tarjeta no salta. null = sin borde.
 */
export function cardBorder(className: string | undefined): string | null {
  const cls = (className ?? '').split(/\s+/).filter(Boolean);
  if (cls.some((c) => CARD_BORDER_COLOR.test(c))) return 'border';
  if (cls.some((c) => c.includes(':') && CARD_BORDER_COLOR.test(c.slice(c.lastIndexOf(':') + 1)))) return 'border border-transparent';
  return null;
}

/**
 * Tarjeta del rediseño: blanca (surface), redondeada (24 px), sin borde y con una sombra suave en claro (en oscuro no
 * hay sombra: el contraste lo da la superficie). `soft`: en acento suave y sin sombra, para «lo de ahora» (la práctica
 * que se está jugando en la Liga).
 */
export function Card({
  className,
  style,
  tour,
  soft,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  tour?: string;
  soft?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cx('rounded-3xl', soft ? 'bg-accent-soft' : 'card-shadow bg-surface', cardBorder(className), className)} style={style} data-tour={tour}>
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
        // Teléfono: hoja desde abajo, de lado a lado (esquinas de 28 px, rounded-sheet en index.css).
        'm-0 mt-auto max-h-[88dvh] w-full max-w-none rounded-t-sheet border-b-0',
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
              // Se ve de 36 px y se toca en 44 (su ::after llega al borde de la barra).
              "relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] sm:flex-none",
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

// ---------- Piezas del rediseño «Calma y foco» (tokens en index.css) ----------

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** Cómo está un juego en su ficha. */
export type GameTileState = 'done' | 'draft' | 'next' | 'total';

/**
 * Ficha de un juego (Hoy, Práctica): su nombre arriba («Juego 1»; «J1» en Pro) y el número grande.
 * - `done`: el juego anotado (`score`).
 * - `draft`: el juego a medias guardado en el teléfono (draftMemory): borde punteado, «A medias» y una barrita con lo que
 *   lleva (`progress`, de 0 a 1: cuadros hechos / 10). En Pro (`dense`), con `score`, lo que lleva hasta ahora: «74…».
 * - `next`: el que sigue, todavía vacío, con un «+».
 * - `total`: la serie (Pro), solo con contorno.
 * Con `onClick` es un botón (abre ese juego); si no, solo se muestra. `dense` = Pro: 64 px de alto y número de 24 px.
 */
export function GameTile({
  label,
  score,
  state = 'done',
  progress,
  dense,
  onClick,
  ariaLabel,
  className,
}: {
  label: string;
  score?: number | string | null;
  state?: GameTileState;
  progress?: number | null;
  dense?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
}) {
  const hasScore = score != null && score !== '';
  const pct = typeof progress === 'number' && Number.isFinite(progress) ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : null;
  const accent = state === 'draft' || state === 'next';
  const box = cx(
    'flex min-w-0 flex-col justify-between text-left',
    dense ? 'h-16 rounded-[15px]' : 'h-[84px] rounded-tile',
    state === 'draft'
      ? cx(
          'border-[1.5px] border-dashed border-accent bg-accent-soft text-accent',
          // En un teléfono angosto (menos de 390 px) la ficha mide 84 px: «A medias» cabe con menos margen.
          dense ? 'px-2.5 py-2' : 'px-[11px] pt-[10.5px] pb-3 max-[389px]:px-2',
        )
      : cx(
          dense ? 'px-[11px] py-[9px]' : 'px-3.5 py-3',
          state === 'next' ? 'bg-accent-soft text-accent' : state === 'total' ? 'shadow-[inset_0_0_0_1px_var(--line)]' : 'bg-surface-2',
        ),
    onClick && cx('transition active:scale-[0.97]', focusRing),
    className,
  );
  let body: ReactNode;
  if (state === 'draft') {
    body =
      dense && hasScore ? (
        <b className="num text-[20px] leading-none font-[650]">{`${score}…`}</b>
      ) : (
        <span className="block">
          <span className={cx('block font-bold whitespace-nowrap tracking-[-0.01em]', dense ? 'text-[13px]' : 'text-[15px] max-[389px]:text-sm')}>A medias</span>
          {pct != null && (
            <span aria-hidden="true" className="mt-[7px] block h-[5px] overflow-hidden rounded-[3px] bg-accent/20">
              <span className="block h-full rounded-[3px] bg-accent" style={{ width: `${pct}%` }} />
            </span>
          )}
        </span>
      );
  } else if (state === 'next') {
    body = (
      <>
        <Plus aria-hidden="true" strokeWidth={2.4} className={dense ? 'size-5' : 'size-7'} />
        <span className="sr-only">por anotar</span>
      </>
    );
  } else {
    body = <b className={cx('num', dense ? 'text-tile-pro' : 'text-tile')}>{hasScore ? score : '–'}</b>;
  }
  const content = (
    <>
      <span className={cx('block truncate font-[550]', dense ? 'text-xs' : 'text-[13px]', accent ? 'text-accent' : 'text-muted')}>{label}</span>
      {body}
    </>
  );
  if (!onClick) return <div className={box}>{content}</div>;
  const spoken =
    ariaLabel ??
    `${label}: ${state === 'draft' ? (hasScore ? `${score}, a medias` : 'a medias') : state === 'next' ? 'por anotar' : hasScore ? score : 'sin anotar'}`;
  return (
    <button type="button" onClick={onClick} aria-label={spoken} className={box}>
      {content}
    </button>
  );
}

const MONTHS_SHORT = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** 'YYYY-MM-DD' (el día tal cual, sin correrse por la zona horaria), una fecha con hora o un Date → Date; null si no es fecha. */
export function toLocalDate(value: Date | string): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const d = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** El mes corto en mayúsculas que va arriba del día: «OCT». Nunca el día de la semana («MAR 13» se leía como marzo). */
export const monthShort = (d: Date): string => MONTHS_SHORT[d.getMonth()];

/**
 * Bloque de fecha de las listas (Lo que viene, Próximas fechas): el mes arriba («OCT», en el color del deporte) y el
 * día grande. El día de la semana va en el subtítulo de la fila. `raised`: sobre un fondo gris (surface-2), en blanco.
 */
export function DateBlock({ date, raised, className }: { date: Date | string; raised?: boolean; className?: string }) {
  const d = toLocalDate(date);
  if (!d) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <time
      dateTime={`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`}
      className={cx(
        'flex h-[54px] w-[50px] shrink-0 flex-col items-center justify-center rounded-[15px] leading-none',
        raised ? 'bg-surface' : 'bg-surface-2',
        className,
      )}
    >
      <span aria-hidden="true" className="text-[11px] font-bold tracking-[0.08em] text-accent">
        {monthShort(d)}
      </span>
      <b aria-hidden="true" className="num mt-[5px] text-[21px] font-[650] tracking-[-0.02em]">
        {d.getDate()}
      </b>
      <span className="sr-only">{`${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`}</span>
    </time>
  );
}

/** Ícono en caja de 40 px al principio de una fila (ListRow). `accent` para lo propio; `warn` solo para «Por aprobar». */
export function RowIcon({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn'; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid size-10 shrink-0 place-items-center rounded-xl',
        tone === 'accent' ? 'bg-accent-soft text-accent' : tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-fg-2',
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Fila estándar de las listas: [ícono (RowIcon), avatar o DateBlock] + título y subtítulo + al final un número grande
 * (`value`), algo propio (`trailing`: «Voy», un contador) y el chevron. 64 px de alto en Lite y 56 en Pro (`dense`).
 * Las filas van juntas dentro de una `<Card className="overflow-hidden">`: la línea entre ellas sale sola (index.css).
 *
 * Con `to` (link) u `onClick` toda la fila se toca (el link cubre la fila), y lo de `trailing` sigue siendo su propio
 * botón encima. El chevron sale solo si la fila se toca y no hay `trailing` (o con `chevron`). `me`: la fila «Tú».
 */
export function ListRow({
  leading,
  title,
  subtitle,
  value,
  trailing,
  chevron,
  me,
  dense,
  to,
  onClick,
  ariaLabel,
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  me?: boolean;
  dense?: boolean;
  to?: string;
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
}) {
  const interactive = !!(to || onClick);
  const showChevron = chevron ?? (interactive && trailing == null);
  const text = (
    <>
      <span className={cx('block truncate font-semibold tracking-[-0.01em]', dense ? 'text-[15px]' : 'text-body')}>{title}</span>
      {subtitle != null && subtitle !== false && (
        <span className={cx('mt-0.5 line-clamp-2 text-muted', dense ? 'text-[13px]' : 'text-sm')}>{subtitle}</span>
      )}
    </>
  );
  // El link (o botón) se estira sobre toda la fila con su ::after; lo de `trailing` queda encima (z-[1]).
  const main = "mm-row-main min-w-0 flex-1 text-left outline-none after:absolute after:inset-0 after:content-['']";
  return (
    <div
      className={cx(
        'mm-row relative flex items-center gap-3.5 pr-[18px] pl-5',
        dense ? 'min-h-row-pro py-2' : 'min-h-row py-2.5',
        me && 'mm-row-me bg-accent-soft',
        interactive &&
          'has-[.mm-row-main:active]:bg-surface-2 has-[.mm-row-main:focus-visible]:outline-2 has-[.mm-row-main:focus-visible]:-outline-offset-2 has-[.mm-row-main:focus-visible]:outline-accent',
        className,
      )}
    >
      {leading}
      {to ? (
        <Link to={to} aria-label={ariaLabel} className={main}>
          {text}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} aria-label={ariaLabel} className={main}>
          {text}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{text}</div>
      )}
      {value != null && value !== false && <span className={cx('num shrink-0', dense ? 'text-row-num-pro' : 'text-row-num')}>{value}</span>}
      {trailing != null && trailing !== false && <div className="relative z-[1] shrink-0">{trailing}</div>}
      {showChevron && <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-faint" />}
    </div>
  );
}

/** Una mitad de StatDuo: el número grande, qué es, y a dónde lleva (si lleva). */
export interface StatDuoItem {
  value: ReactNode;
  label: ReactNode;
  to?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

function StatHalf({ item }: { item: StatDuoItem }) {
  const linked = !!(item.to || item.onClick);
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <b className="num block text-stat">{item.value}</b>
        <span className="mt-2 block text-sm text-muted">{item.label}</span>
      </span>
      {linked && <ChevronRight aria-hidden="true" className="-mr-2 size-5 shrink-0 text-faint" />}
    </>
  );
  // 22 px a los lados desde 390 px de ancho; en un teléfono de 360, 16 (así cabe «en la tabla, de 6»).
  const cls = cx('flex min-w-0 flex-1 items-center gap-1 px-4 py-[18px] text-left min-[390px]:px-[22px]', linked && cx('rounded-3xl transition active:opacity-70', focusRing));
  if (item.to)
    return (
      <Link to={item.to} aria-label={item.ariaLabel} className={cls}>
        {inner}
      </Link>
    );
  if (item.onClick)
    return (
      <button type="button" onClick={item.onClick} aria-label={item.ariaLabel} className={cls}>
        {inner}
      </button>
    );
  return <div className={cls}>{inner}</div>;
}

/**
 * Dos números grandes lado a lado en una tarjeta (Hoy: «195 Tu promedio | 2.º en la tabla, de 6 ›»). La mitad que lleva
 * a algún lado (`to` u `onClick`) se toca entera y lleva chevron.
 */
export function StatDuo({ left, right, className }: { left: StatDuoItem; right: StatDuoItem; className?: string }) {
  return (
    <div className={cx('card-shadow flex items-stretch rounded-3xl bg-surface', className)}>
      <StatHalf item={left} />
      <div aria-hidden="true" className="my-[18px] w-px shrink-0 bg-line" />
      <StatHalf item={right} />
    </div>
  );
}

/** Una opción de Segmented. */
export interface SegmentedOption<K extends string> {
  key: K;
  label: ReactNode;
  icon?: ReactNode;
  ariaLabel?: string;
}

/**
 * Segmentado de 2 o 3 opciones (Lite | Pro, Scratch | Con hcp, Planilla · Resultados · Pistas): barra gris y la opción
 * elegida en blanco (en oscuro, un gris más claro) con su ícono en el color del deporte. Se ven de 36 px y se tocan en
 * 44. `full`: ocupa todo el ancho, opciones iguales. Donde son más de 3, siguen las pestañas (Tabs).
 */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  label,
  full,
  className,
}: {
  options: readonly SegmentedOption<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Qué se elige (para el lector de pantalla): «Modo de la app». */
  label: string;
  full?: boolean;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx(full ? 'flex w-full' : 'inline-flex', 'gap-0.5 rounded-[14px] bg-surface-2 p-1', className)}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.ariaLabel}
            onClick={() => {
              if (!on) onChange(o.key);
            }}
            className={cx(
              'mm-seg-opt relative inline-flex h-9 items-center gap-1.5 rounded-[10px] text-meta font-semibold whitespace-nowrap transition',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
              full ? 'min-w-0 flex-1 justify-center px-2' : 'px-4',
              on ? 'bg-seg-on text-fg shadow-[0_1px_3px_rgb(0_0_0/0.08)] [&>svg]:text-accent' : 'text-muted hover:text-fg',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Link de la derecha de un SectionHeader («Ver toda», «Calendario»): en el color del deporte, con 44 px para el dedo. */
export const sectionLinkClass = 'inline-flex min-h-11 -my-3 items-center gap-0.5 text-meta font-[550] text-accent';

/** Título de sección (19 px) con un link opcional a la derecha («Ver toda» con `sectionLinkClass`). */
export function SectionHeader({ title, action, id, className }: { title: ReactNode; action?: ReactNode; id?: string; className?: string }) {
  return (
    <div className={cx('mx-1 mb-3 flex items-baseline justify-between gap-3', className)}>
      <h2 id={id} className="text-section">
        {title}
      </h2>
      {action}
    </div>
  );
}
