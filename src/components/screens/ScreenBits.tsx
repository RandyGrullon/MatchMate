import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { LogIn } from 'lucide-react';
import { EventTopBar } from '../event/EventHeader';
import { Card, cx } from '../ui';

/**
 * Piezas comunes de las pantallas sueltas del rediseño «Calma y foco» (Juegos sueltos, Mis bolas, Calendario, Buscar
 * personas, el perfil de otra cuenta, las invitaciones y el link para anotar): la barra «‹ Yo» con lo de la pantalla a la
 * derecha, un título con una sola línea de ayuda y la tarjeta para entrar o crear la cuenta.
 */

/**
 * Arriba de la pantalla: «‹ Yo» (vuelve a donde estaba o, si entró por un link, a `fallback`) y, a la derecha, lo de la
 * pantalla («•••», «Agregar»). Es la barra de la práctica (EventTopBar) para que todas vuelvan igual.
 */
export function ScreenTop({ label, fallback, right }: { label: string; fallback: string; right?: ReactNode }) {
  return <EventTopBar back={{ label, fallback }} right={right} />;
}

/** El título de la pantalla (32 px; 28 en Pro) y, si hace falta, una sola línea corta debajo. */
export function ScreenTitle({ title, hint, pro, className }: { title: ReactNode; hint?: ReactNode; pro?: boolean; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <h1 className={cx(pro ? 'text-title-pro' : 'text-title', 'break-words')}>{title}</h1>
      {hint && <p className="mt-1 text-meta text-muted">{hint}</p>}
    </div>
  );
}

/** Clases de un link con forma de botón grande (56 px): `primary` en el color del deporte y `quiet` en gris. */
export function linkButton(variant: 'primary' | 'quiet' | 'soft', className?: string): string {
  return cx(
    'inline-flex h-btn min-w-0 items-center justify-center gap-2.5 rounded-btn px-6 text-[17px] font-semibold tracking-[-0.01em] whitespace-nowrap transition select-none active:scale-[0.97]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    variant === 'primary' ? 'bg-accent text-accent-fg shadow-sm hover:brightness-110' : variant === 'soft' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-fg hover:brightness-95',
    className,
  );
}

/**
 * Sin cuenta: qué es la pantalla en una línea y «Crear cuenta» (el botón principal) o «Entrar»; los dos vuelven a esta
 * dirección (`next`, ya codificada) con lo que iba a hacer.
 */
export function SignInCard({
  icon,
  title,
  text,
  next,
  createLabel = 'Crear cuenta',
  loginLabel = 'Entrar',
  onPick,
  className,
}: {
  icon: ReactNode;
  title: string;
  text?: ReactNode;
  /** La dirección a la que vuelve, ya con encodeURIComponent. */
  next: string;
  createLabel?: string;
  loginLabel?: string;
  /** Al tocar cualquiera de los dos (p. ej. recordar que quería entrar a anotar). */
  onPick?: () => void;
  className?: string;
}) {
  return (
    <Card className={cx('flex flex-col items-center px-5 pt-7 pb-5 text-center', className)}>
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent [&>svg]:size-7">
        {icon}
      </span>
      <h2 className="mt-4 text-card-title">{title}</h2>
      {text && <p className="mt-2 max-w-sm text-body text-muted">{text}</p>}
      <div className="mt-6 flex w-full flex-col gap-2.5">
        <Link to={`/login?modo=registro&next=${next}`} onClick={onPick} className={linkButton('primary', 'w-full')}>
          <span className="min-w-0 truncate">{createLabel}</span>
        </Link>
        <Link to={`/login?next=${next}`} onClick={onPick} className={linkButton('quiet', 'w-full')}>
          <LogIn aria-hidden="true" className="size-5" />
          <span className="min-w-0 truncate">{loginLabel}</span>
        </Link>
      </div>
    </Card>
  );
}
