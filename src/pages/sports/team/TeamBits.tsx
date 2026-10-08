import type { ReactNode, SelectHTMLAttributes } from 'react';
import { Check, CircleHelp, X } from 'lucide-react';
import type { SeasonTeam } from '../../../lib/data/seasonTeams';
import { RSVP_LABEL, type RsvpStatus } from '../../../lib/data/teamSports';
import { BusyIcon, useBusy } from '../../../components/busy';
import { Badge, Select, cx } from '../../../components/ui';
import { teamColor, textOn } from './logic';

/** Punto con el color del equipo. */
export function TeamDot({ team, color, className }: { team?: Pick<SeasonTeam, 'color' | 'order'> | null; color?: string; className?: string }) {
  return <span aria-hidden="true" className={cx('inline-block size-3 shrink-0 rounded-full ring-1 ring-black/10', className)} style={{ background: color ?? teamColor(team) }} />;
}

/** Nombre del equipo con su color (el del partido si el equipo ya no existe). */
export function TeamName({ team, label, className }: { team?: Pick<SeasonTeam, 'color' | 'order' | 'name'> | null; label?: string; className?: string }) {
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1.5', className)}>
      <TeamDot team={team} />
      <span className="truncate">{team?.name ?? label ?? 'Por definir'}</span>
    </span>
  );
}

/** Dorsal en un cuadrito con el color del equipo (`lg`: 40 px, al principio de una fila de la plantilla). */
export function Jersey({ n, color, size = 'sm', className }: { n: number | null | undefined; color?: string; size?: 'sm' | 'lg'; className?: string }) {
  const bg = color ?? 'var(--surface-2)';
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center px-1 font-bold tabular-nums',
        size === 'lg' ? 'h-10 min-w-10 rounded-xl text-[15px]' : 'h-7 min-w-7 rounded-lg text-xs',
        className,
      )}
      style={color ? { background: bg, color: textOn(color) } : { background: bg }}
    >
      {n ?? '–'}
    </span>
  );
}

const RSVP_TONE: Record<RsvpStatus, 'ok' | 'warn' | 'danger'> = { yes: 'ok', maybe: 'warn', no: 'danger' };
const RSVP_ICON: Record<RsvpStatus, ReactNode> = {
  yes: <Check className="size-4" />,
  maybe: <CircleHelp className="size-4" />,
  no: <X className="size-4" />,
};

/** Insignia de la convocatoria de un jugador («Voy», «Tal vez», «No voy»). */
export function RsvpBadge({ status, pending }: { status: RsvpStatus | null | undefined; pending?: boolean }) {
  if (!status) return <Badge>Sin responder</Badge>;
  return (
    <Badge tone={RSVP_TONE[status]}>
      {RSVP_LABEL[status]}
      {pending && ' ·'}
    </Badge>
  );
}

/**
 * Voy / Tal vez / No voy: tocar el que ya está marcado lo quita. Mientras se guarda, la ruedita en el que se tocó y no
 * se puede tocar otro; cada lista espera lo suya (las de los otros jugadores se siguen usando).
 */
export function RsvpButtons({ onChange, ...rest }: Omit<RsvpButtonsViewProps, 'busy' | 'onPick'> & { onChange: (next: RsvpStatus | null) => Promise<unknown> | void }) {
  const saving = useBusy<RsvpStatus>();
  return <RsvpButtonsView {...rest} busy={saving.busy} onPick={(tapped, next) => void saving.run(tapped, async () => onChange(next))} />;
}

interface RsvpButtonsViewProps {
  value: RsvpStatus | null | undefined;
  /** `tapped`: el botón que se tocó; `next`: lo que queda marcado (null si se quitó). */
  onPick: (tapped: RsvpStatus, next: RsvpStatus | null) => void;
  disabled?: boolean;
  /** El que se está guardando (su ícono cambia por la ruedita), o null. */
  busy?: RsvpStatus | null;
  size?: 'sm' | 'md';
  /** Para lectores de pantalla: «Convocatoria de Ana». */
  label?: string;
  /** Sobre un fondo de color: los no elegidos en blanco. */
  raised?: boolean;
}

/**
 * Lo que se ve (sin estado: se prueba con renderToString). Rediseño «Calma y foco»: tres botones suaves, sin borde; el
 * elegido en el color del deporte («Voy»), en ámbar suave («Tal vez») o en rojo suave («No voy»). 44 px (`sm`: se ve de
 * 36 y se toca en 44). `raised`: sobre un fondo de color (la tarjeta «Tu próximo partido»), los no elegidos en blanco.
 */
export function RsvpButtonsView({ value, onPick, disabled, busy, size = 'md', label, raised }: RsvpButtonsViewProps) {
  const order: RsvpStatus[] = ['yes', 'maybe', 'no'];
  const on: Record<RsvpStatus, string> = {
    yes: 'bg-accent text-accent-fg',
    maybe: 'bg-warn-soft text-warn',
    no: 'bg-danger-soft text-danger',
  };
  return (
    <div role="group" aria-label={label ?? 'Convocatoria'} aria-busy={busy ? true : undefined} className="flex gap-1.5">
      {order.map((s) => {
        const active = value === s;
        return (
          <button
            key={s}
            type="button"
            disabled={disabled || !!busy}
            aria-pressed={active}
            onClick={() => onPick(s, active ? null : s)}
            className={cx(
              'relative inline-flex min-w-0 flex-1 items-center justify-center gap-1 font-semibold whitespace-nowrap transition active:scale-[0.97] disabled:opacity-50',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              size === 'sm'
                ? "h-9 rounded-xl px-2 text-[13px] after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']"
                : 'h-11 rounded-[14px] px-3 text-[15px]',
              active ? on[s] : cx(raised ? 'bg-surface' : 'bg-surface-2', 'text-fg-2 hover:brightness-95'),
            )}
          >
            <BusyIcon busy={busy === s} icon={RSVP_ICON[s]} className="size-4" />
            {RSVP_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}

/** Encabezado de sección con acción a la derecha (el título de sección del rediseño, 19 px). */
export function SectionHead({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('mx-1 flex items-baseline justify-between gap-3', className)}>
      <h2 className="text-section">{title}</h2>
      {action}
    </div>
  );
}

/**
 * Lista que guarda al cambiar (anotador, posición, rol): mientras espera, la ruedita queda donde va la flecha y no
 * se puede tocar. `className` es del contenedor (ancho, flex); `selectClassName`, del Select (alto).
 */
export function BusySelect({
  busy,
  className,
  selectClassName,
  disabled,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & { busy: boolean; className?: string; selectClassName?: string }) {
  return (
    <span className={cx('relative block', className)}>
      <Select {...rest} className={cx(busy && 'appearance-none', selectClassName)} disabled={disabled || busy} aria-busy={busy || undefined} />
      {busy && <BusyIcon busy className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />}
    </span>
  );
}
