import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';

/**
 * Una sección del Home, del Home del deporte y de Eventos: el título chico arriba (con su ícono y, a la derecha, un
 * link como «Ver todas»), y lo de adentro.
 */
export function Section({
  title,
  icon,
  action,
  tour,
  label,
  children,
}: {
  title: ReactNode;
  icon?: ReactNode;
  /** A la derecha del título (p. ej. <SectionLink>). */
  action?: ReactNode;
  tour?: string;
  /** Nombre de la sección para lectores de pantalla (si el título no es texto). */
  label?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2" data-tour={tour} aria-label={label}>
      <div className="flex min-h-7 items-center gap-2">
        <h2 className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold text-muted">
          {icon}
          <span className="truncate">{title}</span>
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** «Ver todas ›» a la derecha del título de una sección. */
export function SectionLink({ to, children, onClick }: { to: string; children: ReactNode; onClick?: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="-my-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-lg px-1 text-sm font-medium text-accent hover:underline"
    >
      {children}
      <ChevronRight className="size-4" />
    </Link>
  );
}
