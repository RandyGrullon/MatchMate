import { forwardRef, type InputHTMLAttributes, type MouseEvent, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import { Logo } from '../Logo';
import { cx } from '../ui';

/**
 * Piezas del rediseño para las pantallas de la cuenta (Entrar, las preguntas de 18 años y de los términos,
 * Configuración, Contáctanos, Borrar mi cuenta): el campo grande de 56 px, su etiqueta, el aviso de error, la raya
 * «o con tu correo», el atrás «‹ Inicio» y el marco de las pantallas sueltas (sin la barra de abajo).
 */

/**
 * Campo grande: gris (surface-2) sobre la tarjeta blanca, sin borde, redondeado (16 px) y con letra de 16,5 px (en el
 * iPhone, menos de 16 hace zoom al tocarlo). Con `aria-invalid` se marca en rojo. `raised`: sobre un fondo gris (un
 * bloque dentro de una hoja), en blanco.
 */
export function bigControl(raised?: boolean): string {
  return cx(
    'w-full min-w-0 rounded-2xl px-4 text-[16.5px] text-fg outline-none transition placeholder:text-faint',
    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
    'aria-[invalid=true]:outline-2 aria-[invalid=true]:-outline-offset-2 aria-[invalid=true]:outline-danger disabled:opacity-60',
    raised ? 'bg-surface' : 'bg-surface-2',
  );
}

type Raised = { raised?: boolean };

export const BigInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Raised>(function BigInput({ className, raised, ...rest }, ref) {
  return <input ref={ref} className={cx(bigControl(raised), 'h-14', className)} {...rest} />;
});

export const BigTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & Raised>(function BigTextarea(
  { className, raised, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cx(bigControl(raised), 'resize-none py-3.5 leading-snug', className)} {...rest} />;
});

/** Selector grande con la flecha a la derecha (la lista es la del teléfono). */
export function BigSelect({ className, raised, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & Raised) {
  return (
    <span className="relative block">
      <select className={cx(bigControl(raised), 'h-14 appearance-none pr-11', className)} {...rest}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-4 size-[18px] -translate-y-1/2 text-faint" />
    </span>
  );
}

/**
 * Etiqueta arriba del campo (14 px, fg-2) y, debajo, una pista corta; con `error` la pista va en rojo. Envuelve el campo
 * en su <label> (tocar la etiqueta lo enfoca).
 */
export function BigField({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={cx('flex flex-col', className)}>
      <span className="mx-1 mb-2 text-sm font-[650] text-fg-2">{label}</span>
      {children}
      {hint && <span className={cx('mx-1 mt-1.5 text-[13px] leading-snug', error ? 'font-medium text-danger' : 'text-muted')}>{hint}</span>}
    </label>
  );
}

/**
 * Un link con la forma del botón grande (56 px, como `<Button size="xl">`): «Crear mi cuenta», «Entrar». `primary` va
 * una sola vez por pantalla; `quiet` en gris y `soft` en acento suave para lo que acompaña.
 */
export function linkButton(variant: 'primary' | 'quiet' | 'soft' = 'primary', className?: string): string {
  return cx(
    'inline-flex h-btn min-w-0 items-center justify-center gap-2.5 rounded-btn px-6 text-[17px] font-semibold tracking-[-0.01em] whitespace-nowrap',
    'transition select-none active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    variant === 'primary' ? 'bg-accent text-accent-fg shadow-sm hover:brightness-110' : variant === 'soft' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-fg',
    className,
  );
}

/** El error de un formulario: una caja roja suave (y el lector de pantalla lo dice). */
export function ErrorNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={cx('rounded-2xl bg-danger-soft px-4 py-3 text-meta text-danger', className)}>
      {children}
    </p>
  );
}

/** «—— o con tu correo ——». */
export function OrDivider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-[13px] font-medium text-muted">
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
      {children}
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Casilla de «Tengo 18 años o más» y «Acepto los Términos…»: 22 px en el color del deporte y toda la fila se toca. */
export function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-meta text-fg">
      <input type="checkbox" required checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-px size-[22px] shrink-0 accent-[var(--accent)]" />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

/**
 * «‹ Inicio» arriba de una pantalla: dice a dónde vuelve (como «‹ Ligas» o «‹ Yo»). Se toca en 44 px. Con `onClick`
 * (por ejemplo, volver atrás en el historial) quien lo pone decide qué pasa.
 */
export function BackBar({
  to,
  label,
  onClick,
  replace,
  actions,
  className,
}: {
  to: string;
  label: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  replace?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('-ml-1.5 flex h-[52px] items-center justify-between gap-3', className)}>
      <Link
        to={to}
        replace={replace}
        onClick={onClick}
        className={cx(
          'inline-flex h-11 min-w-0 items-center rounded-xl pr-2 pl-1 text-body font-[550] text-accent transition active:opacity-70',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
        )}
      >
        <ChevronLeft aria-hidden="true" className="size-6 shrink-0" strokeWidth={2.2} />
        <span className="truncate">{label}</span>
      </Link>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Marco de las pantallas sueltas (sin la barra de abajo): Entrar y las preguntas de la cuenta. Márgenes de 24 px, a lo
 * más 448 px de ancho y centrado en la computadora. `top`: lo de arriba (el atrás); si no hay, deja el mismo aire.
 */
export function AuthScreen({ top, children }: { top?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg px-6 pt-[env(safe-area-inset-top)] pb-[calc(2rem+env(safe-area-inset-bottom))] sm:py-10">
      <div className="animate-fade-up mx-auto flex w-full max-w-md flex-col">
        {top ?? <div aria-hidden="true" className="h-[52px]" />}
        {children}
      </div>
    </div>
  );
}

/** El logo, el título de la pantalla (32 px) y una línea corta debajo. */
export function AuthHead({ title, subtitle, className }: { title: ReactNode; subtitle?: ReactNode; className?: string }) {
  return (
    <div className={cx('mt-3', className)}>
      <Logo className="size-12" />
      <h1 className="mt-5 text-title">{title}</h1>
      {subtitle && <p className="mt-1.5 text-meta text-muted">{subtitle}</p>}
    </div>
  );
}
